import Storage from 'expo-sqlite/kv-store';
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {
  decodePhotoBase64, isBackupKey, isSafePhotoName, isSafeProjectId, LIBRARY_KEY,
  MAX_BACKUP_BYTES, MAX_PHOTO_BYTES, parseBackup, utf8Bytes, validateBackup,
  type AppHubBackup, type BackupPhoto,
} from './backupFormat.ts';

const JOURNAL_NAME = 'apphub-restore-journal.json';
const COMMIT_KEY = 'apphub:internal:restore-commit';
let operationInProgress = false;

interface RestoreJournal {
  version: 1;
  id: string;
  hadPhotoRoot: boolean;
  previous: [string, string][];
}

function photosRoot(): Directory { return new Directory(Paths.document, 'apphub'); }
function stagingRoot(id: string): Directory { return new Directory(Paths.document, `apphub-restore-${id}`); }
function previousRoot(id: string): Directory { return new Directory(Paths.document, `apphub-previous-${id}`); }
function journalFile(): File { return new File(Paths.document, JOURNAL_NAME); }
function uniqueId(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }

async function withOperation<T>(operation: () => Promise<T>): Promise<T> {
  if (operationInProgress) throw new Error('Er wordt al een back-up verwerkt. Wacht tot dit klaar is.');
  operationInProgress = true;
  try { return await operation(); }
  finally { operationInProgress = false; }
}

async function storedEntries(): Promise<[string, string][]> {
  const keys = (await Storage.getAllKeys()).filter(isBackupKey);
  const pairs = await Storage.multiGet(keys);
  return pairs.filter((pair): pair is [string, string] => pair[1] !== null);
}

function readJournal(text: string): RestoreJournal {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Ongeldig hersteljournaal.');
  const data = parsed as Record<string, unknown>;
  if (data.version !== 1 || typeof data.id !== 'string' || !/^\d{10,16}-[a-z0-9]{1,12}$/.test(data.id)
    || typeof data.hadPhotoRoot !== 'boolean' || !Array.isArray(data.previous)) throw new Error('Ongeldig hersteljournaal.');
  const entries: [string, string][] = [];
  const keys = new Set<string>();
  for (const entry of data.previous) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string'
      || !isBackupKey(entry[0]) || keys.has(entry[0])) throw new Error('Ongeldig hersteljournaal.');
    keys.add(entry[0]);
    entries.push([entry[0], entry[1]]);
  }
  return { version: 1, id: data.id, hadPhotoRoot: data.hadPhotoRoot, previous: entries };
}

async function replaceEntries(entries: [string, string][]): Promise<void> {
  const nextKeys = new Set(entries.map(([key]) => key));
  const obsolete = (await Storage.getAllKeys()).filter(key => isBackupKey(key) && !nextKeys.has(key));
  // Both public SQLiteStorage batch operations use an exclusive SQLite transaction.
  // The durable journal makes these two batches and the photo swap recoverable together.
  if (entries.length) await Storage.multiSet(entries);
  if (obsolete.length) await Storage.multiRemove(obsolete);
}

function removeDirectory(directory: Directory): void { if (directory.exists) directory.delete(); }

async function recoverInternal(): Promise<void> {
  const file = journalFile();
  if (!file.exists) {
    await Storage.removeItem(COMMIT_KEY);
    return;
  }
  const journal = readJournal(await file.text());
  const committed = (await Storage.getItem(COMMIT_KEY)) === journal.id;
  if (!committed) {
    // Idempotent rollback: it can itself be interrupted and retried on next launch.
    await replaceEntries(journal.previous);
    const old = previousRoot(journal.id);
    if (old.exists) {
      removeDirectory(photosRoot());
      await old.move(photosRoot());
    } else if (!journal.hadPhotoRoot) {
      removeDirectory(photosRoot());
    }
  }
  removeDirectory(stagingRoot(journal.id));
  removeDirectory(previousRoot(journal.id));
  // Remove the journal before the marker. A remaining marker alone is harmless.
  file.delete();
  await Storage.removeItem(COMMIT_KEY);
}

/** Await before loading any project or preferences after app launch. */
export async function recoverPendingRestore(): Promise<void> {
  return withOperation(async () => {
    try { await recoverInternal(); }
    catch { throw new Error('Het vorige herstel kon nog niet worden afgerond. Maak ruimte vrij en open AppHub opnieuw. De herstelgegevens zijn behouden.'); }
  });
}

async function collectPhotos(): Promise<BackupPhoto[]> {
  const root = photosRoot();
  if (!root.exists) return [];
  const photos: BackupPhoto[] = [];
  let encodedBytes = 0;
  for (const project of root.list()) {
    if (!(project instanceof Directory) || !isSafeProjectId(project.name)) continue;
    const directory = new Directory(project, 'photos');
    if (!directory.exists) continue;
    for (const file of directory.list()) {
      if (!(file instanceof File) || !isSafePhotoName(file.name)) continue;
      if (file.size > MAX_PHOTO_BYTES) throw new Error('Een foto is groter dan 20 MB. Verwijder deze foto voordat je een back-up maakt.');
      encodedBytes += Math.ceil(file.size / 3) * 4;
      if (encodedBytes > MAX_BACKUP_BYTES) throw new Error('Je back-up is groter dan 80 MB. Verwijder eerst ongebruikte foto’s.');
      photos.push({ projectId: project.name, name: file.name, base64: await file.base64() });
    }
  }
  return photos;
}

/** Share a complete, unencrypted JSON backup. The temporary share file is deleted afterwards. */
export async function exportBackup(): Promise<void> {
  return withOperation(async () => {
    await recoverInternal();
    if (!await Sharing.isAvailableAsync()) throw new Error('Delen is op dit apparaat niet beschikbaar.');
    const entries = await storedEntries();
    if (!entries.some(([key]) => key === LIBRARY_KEY)) entries.push([LIBRARY_KEY, '[]']);
    const backup = validateBackup({
      format: 'apphub-backup', version: 1, createdAt: new Date().toISOString(),
      entries, photos: await collectPhotos(),
    });
    const text = JSON.stringify(backup);
    if (utf8Bytes(text) > MAX_BACKUP_BYTES) throw new Error('Je back-up is groter dan 80 MB. Verwijder eerst ongebruikte foto’s.');
    const file = new File(Paths.cache, `AppHub-backup-${new Date().toISOString().slice(0, 10)}-${uniqueId()}.json`);
    try {
      file.create();
      file.write(text);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Bewaar je AppHub-back-up' });
    } finally {
      try { if (file.exists) file.delete(); } catch { /* Cache cleanup must not mask the sharing result. */ }
    }
  });
}

function stagePhotos(backup: AppHubBackup, directory: Directory): void {
  directory.create({ intermediates: true });
  for (const photo of backup.photos) {
    const project = new Directory(directory, photo.projectId, 'photos');
    project.create({ intermediates: true, idempotent: true });
    const file = new File(project, photo.name);
    file.create();
    file.write(decodePhotoBase64(photo.base64));
  }
}

/** Caller confirms replacement and blocks editing. Cancellation leaves everything unchanged. */
export async function restoreBackup(): Promise<boolean> {
  return withOperation(async () => {
    await recoverInternal();
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain'], copyToCacheDirectory: true, multiple: false,
    });
    if (picked.canceled) return false;
    const asset = picked.assets[0];
    if (!asset) throw new Error('Er is geen bestand geselecteerd.');
    const selected = new File(asset.uri);
    let backup: AppHubBackup;
    try {
      if ((asset.size ?? selected.size) > MAX_BACKUP_BYTES) throw new Error('Deze back-up is groter dan 80 MB.');
      backup = parseBackup(await selected.text());
    } finally {
      // Never remove the user's original document, only the picker-created cache copy.
      const cachePrefix = Paths.cache.uri.replace(/\/$/, '') + '/';
      try { if (selected.uri.startsWith(cachePrefix) && selected.exists) selected.delete(); } catch { /* Optional cache cleanup. */ }
    }
    const id = uniqueId();
    const staged = stagingRoot(id);
    const temporaryJournal = new File(Paths.document, `apphub-journal-${id}.json`);
    try {
      stagePhotos(backup, staged);
      const journal: RestoreJournal = { version: 1, id, hadPhotoRoot: photosRoot().exists, previous: await storedEntries() };
      temporaryJournal.create();
      temporaryJournal.write(JSON.stringify(journal));
      await temporaryJournal.move(journalFile());
      // From this point onward recoverInternal can undo every mutation.
      if (photosRoot().exists) await photosRoot().move(previousRoot(id));
      await staged.move(photosRoot());
      await replaceEntries(backup.entries);
      await Storage.setItem(COMMIT_KEY, id);
    } catch (error) {
      try { await recoverInternal(); }
      catch { throw new Error('Herstellen is onderbroken. Open AppHub opnieuw om je vorige gegevens terug te zetten. Je herstelgegevens zijn behouden.'); }
      throw error instanceof Error ? error : new Error('De back-up kon niet worden hersteld. Je vorige gegevens zijn behouden.');
    } finally {
      // File.move updates its URI, so use a new object for the original temporary path.
      try {
        const temporary = new File(Paths.document, `apphub-journal-${id}.json`);
        if (temporary.exists) temporary.delete();
        removeDirectory(stagingRoot(id));
      } catch { /* Incomplete recovery keeps its journal and previous photo directory. */ }
    }
    // A committed restore remains successful even if cleanup needs a later launch.
    try { await recoverInternal(); } catch { /* Commit marker prevents accidental rollback. */ }
    return true;
  });
}
