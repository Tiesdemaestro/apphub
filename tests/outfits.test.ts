import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutfit, isClothingList, missingCategories, outfitCount, persistClothingItem, type ClothingItem } from '../src/projects/outfits.ts';

const closet: ClothingItem[] = [
  { id: 't1', name: 'Trui', category: 'top', color: 'Blauw' },
  { id: 't2', name: 'Shirt', category: 'top', color: 'Wit' },
  { id: 'b1', name: 'Broek', category: 'bottom', color: 'Zwart' },
  { id: 'b2', name: 'Jeans', category: 'bottom', color: 'Blauw' },
  { id: 's1', name: 'Sneakers', category: 'shoes', color: 'Wit' },
];

test('incomplete wardrobes report precisely which required categories are missing', () => {
  assert.deepEqual(missingCategories([]), ['top', 'bottom', 'shoes']);
  assert.deepEqual(missingCategories(closet.slice(0, 2)), ['bottom', 'shoes']);
  assert.deepEqual(buildOutfit(closet.slice(0, 2)), []);
  assert.equal(outfitCount(closet.slice(0, 2)), 0);
});

test('cycling produces every top/bottom/shoes combination before repeating', () => {
  const count = outfitCount(closet);
  assert.equal(count, 4);
  const combinations = Array.from({ length: count }, (_, index) => buildOutfit(closet, index));
  assert.equal(new Set(combinations.map((items) => items.map((item) => item.id).join(','))).size, count);
  combinations.forEach((items) => assert.deepEqual(items.map((item) => item.category), ['top', 'bottom', 'shoes']));
  assert.deepEqual(buildOutfit(closet, count), buildOutfit(closet, 0));
});

test('outerwear and accessories participate without becoming mandatory', () => {
  const expanded: ClothingItem[] = [...closet,
    { id: 'o1', name: 'Regenjas', category: 'outerwear', color: 'Geel' },
    { id: 'a1', name: 'Sjaal', category: 'accessory', color: 'Grijs' },
    { id: 'a2', name: 'Pet', category: 'accessory', color: 'Groen' },
  ];
  assert.equal(outfitCount(expanded), 8);
  assert.equal(buildOutfit(expanded).length, 5);
  assert.equal(buildOutfit(closet).length, 3);
});

test('malformed stored data and duplicate identifiers are rejected before editing', () => {
  assert.equal(isClothingList(closet), true);
  assert.equal(isClothingList([]), true);
  assert.equal(isClothingList(null), false);
  assert.equal(isClothingList([{ ...closet[0], category: 'unknown' }]), false);
  assert.equal(isClothingList([closet[0], closet[0]]), false);
});

test('non-finite variation cannot produce an undefined item', () => {
  assert.deepEqual(buildOutfit(closet, Number.NaN), buildOutfit(closet, 0));
});

test('editing clothing preserves identity and order and changes category in outfit generation', async () => {
  const original = structuredClone(closet);
  let persisted: ClothingItem[] | undefined;
  const result = await persistClothingItem(closet, { id: 'unused-new-id', name: '  Jas  ', color: ' Groen ', category: 'outerwear' }, 't1', async (next) => { persisted = next; });
  assert.equal(result.items.length, closet.length);
  assert.deepEqual(result.items.map((item) => item.id), closet.map((item) => item.id));
  assert.deepEqual(result.items[0], { id: 't1', name: 'Jas', color: 'Groen', category: 'outerwear' });
  assert.deepEqual(persisted, result.items);
  assert.equal(outfitCount(result.items), 2);
  assert.deepEqual(closet, original);
  assert.equal(result.unusedPhoto, undefined);
});

test('old photo becomes eligible for cleanup only after replacement successfully persists', async () => {
  const oldPhoto = 'apphub-photo:old-123.jpg';
  const newPhoto = 'apphub-photo:new-456.jpg';
  const items = [{ ...closet[0], photoUri: oldPhoto }];
  let finishWrite!: () => void;
  let settled = false;
  const pending = persistClothingItem(items, { ...items[0], photoUri: newPhoto }, items[0].id,
    () => new Promise<void>((resolve) => { finishWrite = resolve; })).then((result) => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(items[0].photoUri, oldPhoto);
  finishWrite();
  const result = await pending;
  assert.equal(result.items[0].photoUri, newPhoto);
  assert.equal(result.unusedPhoto, oldPhoto);
  assert.equal(items[0].photoUri, oldPhoto);
});

test('failed edit keeps original clothing and photo and produces no cleanup candidate', async () => {
  const items = [{ ...closet[0], photoUri: 'apphub-photo:old-123.jpg' }];
  const before = structuredClone(items);
  await assert.rejects(persistClothingItem(items, { ...items[0], name: 'Nieuwe naam', photoUri: 'apphub-photo:new-456.jpg' }, items[0].id,
    async () => { throw new Error('Disk full'); }), /Disk full/);
  assert.deepEqual(items, before);
});

test('unchanged and shared photo references are never marked for deletion', async () => {
  const photoUri = 'apphub-photo:shared-123.jpg';
  const items = [{ ...closet[0], photoUri }, { ...closet[1], photoUri }];
  const unchanged = await persistClothingItem(items, { ...items[0], name: 'Nieuwe naam' }, items[0].id, async () => {});
  assert.equal(unchanged.unusedPhoto, undefined);
  const removedFromOne = await persistClothingItem(items, { ...closet[0] }, items[0].id, async () => {});
  assert.equal(removedFromOne.unusedPhoto, undefined);
  assert.equal(removedFromOne.items[0].photoUri, undefined);
  assert.equal(removedFromOne.items[1].photoUri, photoUri);
  const removedFromLast = await persistClothingItem([items[0]], { ...closet[0] }, items[0].id, async () => {});
  assert.equal(removedFromLast.unusedPhoto, photoUri);
});

test('stale edits, duplicate additions, and invalid photo paths cannot reach persistence', async () => {
  let writes = 0;
  const persist = async () => { writes++; };
  await assert.rejects(persistClothingItem(closet, closet[0], 'missing', persist), /bestaat niet meer/);
  await assert.rejects(persistClothingItem(closet, closet[0], null, persist), /bestaat al/);
  await assert.rejects(persistClothingItem(closet, { ...closet[0], photoUri: 'file:///other-project/photo.jpg' }, 't1', persist), /Controleer/);
  await assert.rejects(persistClothingItem(closet, { ...closet[0], name: ' '.repeat(5) }, 't1', persist), /Controleer/);
  assert.equal(writes, 0);
});
