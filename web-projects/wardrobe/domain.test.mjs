import assert from 'node:assert/strict';
import test from 'node:test';
import { validateItems, validateDocument, exportBackup, importBackup, makeOutfit, missingCategories, outfitCount, MAX_BACKUP_BYTES } from './domain.mjs';
const items = [
  { id: 't1', name: 'Trui', color: 'Blauw', category: 'top' },
  { id: 't2', name: 'Shirt', color: 'Wit', category: 'top' },
  { id: 'b1', name: 'Jeans', color: 'Blauw', category: 'bottom' },
  { id: 's1', name: 'Sneakers', color: 'Wit', category: 'shoes' },
];
test('backup round-trip keeps values, rejects another project and corrupted JSON', () => {
  assert.deepEqual(importBackup(exportBackup(items)), items);
  assert.throws(() => importBackup('{broken'));
  assert.throws(() => importBackup(JSON.stringify({ apphubBackup: 1, project: 'notes', exportedAt: new Date().toISOString(), items })));
});
test('malformed fields and duplicate IDs cannot enter storage', () => {
  assert.throws(() => validateItems([items[0], items[0]]));
  assert.throws(() => validateItems([{ ...items[0], category: '__proto__' } ]));
  assert.throws(() => validateItems([{ ...items[0], name: ' '.repeat(8) } ]));
  assert.throws(() => validateItems([{ ...items[0], color: 'x'.repeat(41) } ]));
});
test('only bounded inline JPEG data is accepted, never remote image or SVG', () => {
  assert.throws(() => validateItems([{ ...items[0], photo: 'https://evil.example/photo' }]));
  assert.throws(() => validateItems([{ ...items[0], photo: 'data:image/svg+xml;base64,PHN2Zz4=' }]));
  assert.throws(() => validateItems([{ ...items[0], photo: 'data:image/jpeg;base64,' + 'A'.repeat(700_000) }]));
});
test('import sizes are bounded before parsing', () => {
  assert.throws(() => importBackup('x'.repeat(MAX_BACKUP_BYTES + 1)), /te groot/);
});
test('missing storage initializes once, malformed storage is not erased', () => {
  assert.deepEqual(validateDocument(undefined), { schemaVersion: 1, revision: 0, items: [] });
  assert.throws(() => validateDocument(null));
  assert.throws(() => validateDocument({ schemaVersion: 1, revision: -1, items: [] }));
});
test('outfits require top/bottom/shoes and cycle all combinations', () => {
  assert.deepEqual(missingCategories([]), ['top', 'bottom', 'shoes']);
  assert.deepEqual(makeOutfit(items.slice(0, 2)), []);
  assert.equal(outfitCount(items), 2);
  assert.notDeepEqual(makeOutfit(items, 0), makeOutfit(items, 1));
  assert.deepEqual(makeOutfit(items, 2), makeOutfit(items, 0));
  assert.deepEqual(makeOutfit(items, NaN), makeOutfit(items, 0));
});
