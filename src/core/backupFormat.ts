import { readInstalledRegistry, readPreferences } from './library.ts';
import { collectionStorageKey, parseStoredRecords, photoReferences } from '../runtime/records.ts';
import { isClothingList } from '../projects/outfits.ts';
import { assertRetainedInstall } from './retained.ts';

/** Portable, unencrypted AppHub backups. Credentials never belong in this format. */
export const MAX_BACKUP_BYTES = 80 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 20_000_000;
export const MAX_VALUE_BYTES = 2_000_000;
export const MAX_REGISTRY_BYTES = 16 * 1024 * 1024;
export const LIBRARY_KEY = 'apphub:host:library:v2';
export const PREFS_KEY = 'apphub:host:prefs:v1';
const MAX_ENTRIES = 5000;
const MAX_PHOTOS = 2000;
const PHOTO_NAME = /^[a-zA-Z0-9-]{1,160}\.(jpg|jpeg|png|heic|heif|webp)$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{1,47}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export interface BackupPhoto {
  projectId: string;
  name: string;
  base64: string;
}
export interface AppHubBackup {
  format: 'apphub-backup';
  version: 1;
  createdAt: string;
  entries: [string, string][];
  photos: BackupPhoto[];
}
export interface BackupSummary {
  projects: number;
  records: number;
  photos: number;
  photoBytes: number;
  createdAt: string;
}

export function utf8Bytes(text: string): number {
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const point = text.charCodeAt(i);
    if (point < 0x80) size++;
    else if (point < 0x800) size += 2;
    else if (point >= 0xd800 && point <= 0xdbff && i + 1 < text.length
      && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
      size += 4;
      i++;
    } else size += 3;
  }
  return size;
}

export function isSafeProjectId(id: string): boolean { return PROJECT_ID.test(id); }
export function isSafePhotoName(name: string): boolean { return PHOTO_NAME.test(name); }

export function isBackupKey(key: string): boolean {
  if (key === LIBRARY_KEY || key === PREFS_KEY) return true;
  // AppHub credentials live in SecureStore, never the project namespace. Collection
  // names such as "tokens" or "passwords" are still user data and must be preserved.
  return /^apphub:project:([a-z][a-z0-9-]{1,47}):([a-zA-Z0-9_.-]{1,80})$/.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(detail: string): never { throw new Error(`Ongeldige back-up: ${detail}`); }

export function photoByteLength(value: string): number {
  return value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
}

function validBase64(text: string): boolean {
  if (text.length % 4 !== 0 || !BASE64.test(text)) return false;
  if (text.endsWith('==')) return (ALPHABET.indexOf(text[text.length - 3]) & 15) === 0;
  if (text.endsWith('=')) return (ALPHABET.indexOf(text[text.length - 2]) & 3) === 0;
  return true;
}

/** No eval, paths, URIs or module imports are accepted from a backup. */
export function validateBackup(input: unknown): AppHubBackup {
  if (!isRecord(input) || input.format !== 'apphub-backup' || input.version !== 1) {
    return failure('dit bestand is geen ondersteunde AppHub-back-up.');
  }
  if (typeof input.createdAt !== 'string' || input.createdAt.length > 40
    || !/^\d{4}-\d{2}-\d{2}T/.test(input.createdAt) || !Number.isFinite(Date.parse(input.createdAt))) {
    return failure('de datum ontbreekt of is ongeldig.');
  }
  if (!Array.isArray(input.entries) || input.entries.length > MAX_ENTRIES
    || !Array.isArray(input.photos) || input.photos.length > MAX_PHOTOS) {
    return failure('de gegevenslijst ontbreekt of is te groot.');
  }
  const keys = new Set<string>();
  const references = new Set<string>();
  const entries: [string, string][] = [];
  let total = 0;
  for (const entry of input.entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string'
      || typeof entry[1] !== 'string' || !isBackupKey(entry[0])) {
      return failure('onbekende of afgeschermde opslagsleutel.');
    }
    const [key, value] = entry as [string, string];
    if (keys.has(key)) return failure('een opslagsleutel komt dubbel voor.');
    keys.add(key);
    const size = utf8Bytes(value);
    total += size;
    if (size > (key === LIBRARY_KEY ? MAX_REGISTRY_BYTES : MAX_VALUE_BYTES) || total > MAX_BACKUP_BYTES) return failure('de opgeslagen gegevens zijn te groot.');
    try { JSON.parse(value); } catch { return failure('een gegevensveld bevat ongeldige JSON.'); }
    if (key === LIBRARY_KEY) readInstalledRegistry(value);
    if (key === PREFS_KEY) readPreferences(value);
    entries.push([key, value]);
  }
  // A missing library would silently discard all imported projects on replacement.
  if (!keys.has(LIBRARY_KEY)) return failure('de projectbibliotheek ontbreekt.');
  const values = new Map(entries);
  const definitions = new Map(readInstalledRegistry(values.get(LIBRARY_KEY) ?? null).map(installed => [installed.app.id, installed]));
  for (const [key, value] of entries) {
    const retainedKey = /^apphub:project:([a-z][a-z0-9-]{1,47}):retained\.v1$/.exec(key);
    if (!retainedKey) continue;
    const retained = readInstalledRegistry(value);
    if (retained.length !== 1 || retained[0].app.id !== retainedKey[1]) return failure('een bewaarde appdefinitie hoort bij een ander project.');
    const installed = definitions.get(retainedKey[1]);
    if (installed) assertRetainedInstall(value, installed.app, installed.source, true);
    else definitions.set(retainedKey[1], retained[0]);
  }
  for (const installed of definitions.values()) {
    for (const collection of installed.app.collections) {
      const value = values.get(`apphub:project:${installed.app.id}:${collectionStorageKey(collection.id)}`);
      if (value !== undefined) {
        for (const record of parseStoredRecords(collection, JSON.parse(value))) {
          for (const reference of photoReferences(collection, record.values)) {
            references.add(`${installed.app.id}/${reference.slice('apphub-photo:'.length)}`);
          }
        }
      }
    }
    const prefix = `apphub:project:${installed.app.id}:runtime.v1.`;
    for (const key of keys) {
      if (key.startsWith(prefix) && !installed.app.collections.some(collection => key === prefix + collection.id)) {
        return failure('een verzameling hoort niet bij de meegeleverde appversie.');
      }
    }
  }
  const wardrobe = values.get('apphub:project:wardrobe:wardrobe.v1');
  if (wardrobe !== undefined) {
    const clothing: unknown = JSON.parse(wardrobe);
    if (!isClothingList(clothing)) return failure('de kledingkastgegevens zijn niet leesbaar.');
    for (const item of clothing) if (item.photoUri) references.add(`wardrobe/${item.photoUri.slice('apphub-photo:'.length)}`);
  }
  const notes = values.get('apphub:project:notes:notes.v1');
  if (notes !== undefined) {
    const list: unknown = JSON.parse(notes);
    if (!Array.isArray(list) || !list.every(note => isRecord(note) && typeof note.id === 'string' && note.id.length > 0
      && typeof note.title === 'string' && note.title.trim().length > 0 && typeof note.body === 'string'
      && typeof note.updatedAt === 'string' && Number.isFinite(Date.parse(note.updatedAt)))
      || new Set(list.map(note => note.id)).size !== list.length) return failure('de notitiegegevens zijn niet leesbaar.');
  }
  const photos: BackupPhoto[] = [];
  const photoKeys = new Set<string>();
  for (const photo of input.photos) {
    if (!isRecord(photo) || typeof photo.projectId !== 'string' || !isSafeProjectId(photo.projectId)
      || typeof photo.name !== 'string' || !isSafePhotoName(photo.name)
      || typeof photo.base64 !== 'string' || !photo.base64.length
      || photo.base64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 || !validBase64(photo.base64)) {
      return failure('een foto is ongeldig of groter dan 20 MB.');
    }
    const bytes = photoByteLength(photo.base64);
    if (bytes > MAX_PHOTO_BYTES) return failure('een foto is groter dan 20 MB.');
    total += photo.base64.length;
    if (total > MAX_BACKUP_BYTES) return failure('het bestand is groter dan 80 MB.');
    const id = `${photo.projectId}/${photo.name}`;
    if (photoKeys.has(id)) return failure('een foto komt dubbel voor.');
    photoKeys.add(id);
    photos.push({ projectId: photo.projectId, name: photo.name, base64: photo.base64 });
  }
  for (const reference of references) {
    if (!photoKeys.has(reference)) return failure('een foto waarnaar je gegevens verwijzen ontbreekt.');
  }
  return { format: 'apphub-backup', version: 1, createdAt: input.createdAt, entries, photos };
}

export function parseBackup(text: string): AppHubBackup {
  if (text.length > MAX_BACKUP_BYTES || utf8Bytes(text) > MAX_BACKUP_BYTES) {
    return failure('het bestand is groter dan 80 MB.');
  }
  let data: unknown;
  try { data = JSON.parse(text); } catch { return failure('het bestand bevat ongeldige JSON.'); }
  return validateBackup(data);
}

export function summarizeBackup(backup: AppHubBackup): BackupSummary {
  const registry = JSON.parse(backup.entries.find(([key]) => key === LIBRARY_KEY)?.[1] ?? '[]');
  return {
    projects: Array.isArray(registry) ? registry.length : 0,
    records: backup.entries.filter(([key]) => key.startsWith('apphub:project:')).length,
    photos: backup.photos.length,
    photoBytes: backup.photos.reduce((sum, photo) => sum + photoByteLength(photo.base64), 0),
    createdAt: backup.createdAt,
  };
}

/** Converts validated base64 without Node Buffer or a browser-only atob dependency. */
export function decodePhotoBase64(text: string): Uint8Array {
  if (!validBase64(text) || photoByteLength(text) > MAX_PHOTO_BYTES) return failure('ongeldige fotogegevens.');
  const output = new Uint8Array(photoByteLength(text));
  let offset = 0;
  for (let i = 0; i < text.length; i += 4) {
    const bits = (ALPHABET.indexOf(text[i]) << 18) | (ALPHABET.indexOf(text[i + 1]) << 12)
      | (Math.max(0, ALPHABET.indexOf(text[i + 2])) << 6) | Math.max(0, ALPHABET.indexOf(text[i + 3]));
    if (offset < output.length) output[offset++] = bits >>> 16 & 255;
    if (offset < output.length) output[offset++] = bits >>> 8 & 255;
    if (offset < output.length) output[offset++] = bits & 255;
  }
  return output;
}
