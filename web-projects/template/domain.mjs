export const PROJECT_ID = 'notes-template';
export const MAX_BACKUP_BYTES = 2_000_000;
export function validateNotes(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Maximaal 100 notities worden ondersteund.');
  const ids = new Set();
  const notes = value.map(note => {
    if (!note || typeof note !== 'object' || Array.isArray(note) || typeof note.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(note.id)
      || ids.has(note.id) || typeof note.title !== 'string' || !note.title.trim() || note.title.length > 100
      || typeof note.body !== 'string' || note.body.length > 10000 || typeof note.updatedAt !== 'string' || Number.isNaN(Date.parse(note.updatedAt))) throw new Error('Een notitie bevat ongeldige gegevens.');
    ids.add(note.id);
    return { id: note.id, title: note.title.trim(), body: note.body, updatedAt: note.updatedAt };
  });
  if (new TextEncoder().encode(JSON.stringify(notes)).length > MAX_BACKUP_BYTES - 1024) throw new Error('Je notities zijn samen te groot (maximaal 2 MB).');
  return notes;
}
export function validateDocument(value) {
  if (value === undefined) return { schemaVersion: 1, revision: 0, notes: [] };
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('De opgeslagen gegevens zijn ongeldig. Ze zijn niet overschreven.');
  return { schemaVersion: 1, revision: value.revision, notes: validateNotes(value.notes) };
}
export function exportBackup(notes, now = new Date()) { return JSON.stringify({ apphubBackup: 1, project: PROJECT_ID, exportedAt: now.toISOString(), notes: validateNotes(notes) }); }
export function importBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('De back-up is te groot (maximaal 2 MB).');
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('Dit is geen geldige JSON-back-up.'); }
  if (!result || result.apphubBackup !== 1 || result.project !== PROJECT_ID || typeof result.exportedAt !== 'string' || Number.isNaN(Date.parse(result.exportedAt))) throw new Error('Deze back-up hoort niet bij dit project.');
  return validateNotes(result.notes);
}
