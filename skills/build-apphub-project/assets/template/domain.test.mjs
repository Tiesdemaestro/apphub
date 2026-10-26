import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNotes, validateDocument, exportBackup, importBackup } from './domain.mjs';
const note = { id: 'note-1', title: 'Idee', body: '<script>alert(1)</script>', updatedAt: '2026-10-26T12:00:00.000Z' };
test('text survives backup without interpretation or truncation', () => { assert.deepEqual(importBackup(exportBackup([note])), [note]); });
test('rejects duplicate IDs, invalid timestamps and long notes', () => {
  assert.throws(() => validateNotes([note, note]));
  assert.throws(() => validateNotes([{ ...note, updatedAt: 'not a date' }]));
  assert.throws(() => validateNotes([{ ...note, body: 'a'.repeat(10001) }]));
});
test('rejects foreign backups and malformed saved state', () => {
  assert.throws(() => importBackup('{"apphubBackup":1,"project":"wardrobe","notes":[]}'));
  assert.throws(() => validateDocument({ revision: 0, notes: [] }));
  assert.deepEqual(validateDocument(undefined), { schemaVersion: 1, revision: 0, notes: [] });
});
