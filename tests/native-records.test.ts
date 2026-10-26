import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectionStorageKey,
  deleteRecord,
  draftFor,
  parseStoredRecords,
  photoReferences,
  selectRecords,
  upsertRecord,
  valuesFor,
  type RuntimeRecord,
} from '../src/runtime/records.ts';
import type { Collection, RecordValues, Screen } from '../src/runtime/schema.ts';

const collection: Collection = {
  id: 'items', title: 'Mijn spullen', fields: [
    { id: 'name', label: 'Naam', type: 'text', required: true },
    { id: 'notes', label: 'Notities', type: 'multiline' },
    { id: 'quantity', label: 'Aantal', type: 'number' },
    { id: 'active', label: 'Actief', type: 'boolean' },
    { id: 'category', label: 'Categorie', type: 'choice', options: ['Boek', 'Kleding'] },
    { id: 'date', label: 'Datum', type: 'date' },
    { id: 'photo', label: 'Foto', type: 'photo' },
    { id: 'second-photo', label: 'Tweede foto', type: 'photo' },
  ],
};
const screen: Screen = { id: 'all', title: 'Alles', collection: 'items', layout: 'list', titleField: 'name' };
const firstTime = '2026-10-19T13:00:00.000Z';
const laterTime = '2026-10-19T14:00:00.000Z';
const preservedMessage = /Mijn spullen.*blijven bewaard.*niet overschreven/;

function record(id = 'record-1', values: RecordValues = { name: 'Boek' }): RuntimeRecord {
  return { id, createdAt: firstTime, updatedAt: firstTime, values };
}

test('editing preserves missing, false, and true optional booleans without changing unrelated data', () => {
  for (const values of [{ name: 'Boek' }, { name: 'Boek', active: false }, { name: 'Boek', active: true }]) {
    const original = record('record-1', values);
    const draft = draftFor(collection, original);
    assert.deepEqual(valuesFor(collection, draft), values);
    draft.name = 'Andere naam';
    assert.deepEqual(valuesFor(collection, draft), { ...values, name: 'Andere naam' });
    assert.equal(original.values.name, 'Boek');
  }
  const draft = draftFor(collection, record('record-1', { name: 'Boek', active: false }));
  draft.active = '';
  assert.deepEqual(valuesFor(collection, draft), { name: 'Boek' });
});

test('new required booleans default to false while absent optional booleans stay unfilled', () => {
  const required: Collection = { id: 'answers', title: 'Antwoorden', fields: [{ id: 'confirmed', label: 'Bevestigd', type: 'boolean', required: true }] };
  assert.equal(draftFor(collection).active, '');
  assert.deepEqual(valuesFor(required, draftFor(required)), { confirmed: false });
  assert.throws(() => valuesFor(required, { confirmed: '' }), /verplicht/);
});

test('numbers survive the save, reopen, and save cycle including scientific notation', () => {
  for (const quantity of [0, 0.0000001, -0.0000001, Number.MIN_VALUE, 1.2345678912345, 1e15, -1e15]) {
    const original = record('record-1', { name: 'Getal', quantity });
    const draft = draftFor(collection, original);
    const values = valuesFor(collection, draft);
    const saved = upsertRecord(collection, [original], values, { id: original.id, now: laterTime });
    assert.equal(saved.record.values.quantity, quantity);
    assert.deepEqual(valuesFor(collection, draftFor(collection, saved.record)), values);
  }
  assert.equal(valuesFor(collection, { name: 'Getal', quantity: '-1,25e-3' }).quantity, -0.00125);
  for (const quantity of ['Infinity', 'NaN', '1e', '0x10', '1e999', '1e16', '1.2.3', '1,2,3']) {
    assert.throws(() => valuesFor(collection, { name: 'Getal', quantity }));
  }
});

test('collection storage keys accept contract identifiers and reject path-like values', () => {
  assert.equal(collectionStorageKey('my-items-2'), 'runtime.v1.my-items-2');
  for (const value of ['', '../items', 'items/other', 'Items', 'a'.repeat(49)]) {
    assert.throws(() => collectionStorageKey(value));
  }
});

test('missing storage is empty, while a canonical record is preserved in fresh objects', () => {
  assert.deepEqual(parseStoredRecords(collection, null), []);
  assert.deepEqual(parseStoredRecords(collection, []), []);
  const original = record('record-1', {
    name: 'Café', quantity: 0, active: false, category: 'Boek', date: '2024-02-29',
    photo: 'apphub-photo:picture-1.jpg', notes: 'Regel één\nRegel twee',
  });
  const input = Object.freeze([Object.freeze({ ...original, values: Object.freeze(original.values) })]);
  const output = parseStoredRecords(collection, input);
  assert.deepEqual(output, input);
  assert.notEqual(output, input);
  assert.notEqual(output[0], input[0]);
  assert.notEqual(output[0].values, input[0].values);
});

test('malformed stored data fails loudly without silently returning an empty list', () => {
  const valid = record();
  for (const input of [undefined, {}, '[]', [null], [false], [[]], [{ ...valid, values: null }], [{ ...valid, values: {} }]]) {
    assert.throws(() => parseStoredRecords(collection, input), preservedMessage);
  }
});

test('stored records reject unknown metadata, unknown fields, and duplicate identifiers', () => {
  const valid = record();
  for (const input of [
    [{ ...valid, extra: true }],
    [{ ...valid, values: { ...valid.values, staleField: 'keep me' } }],
    [valid, { ...valid, values: { name: 'Ander boek' } }],
    [{ ...valid, id: '../other' }],
    [{ ...valid, id: '' }],
  ]) assert.throws(() => parseStoredRecords(collection, input), preservedMessage);
});

test('stored timestamps must be canonical, valid, and chronologically consistent', () => {
  const valid = record();
  for (const timestamp of ['yesterday', '2026-10-19', '2026-10-19T13:00:00Z', '2026-02-30T13:00:00.000Z', '2026-10-19T14:00:00.000+01:00']) {
    assert.throws(() => parseStoredRecords(collection, [{ ...valid, createdAt: timestamp }]), preservedMessage);
    assert.throws(() => parseStoredRecords(collection, [{ ...valid, updatedAt: timestamp }]), preservedMessage);
  }
  assert.throws(() => parseStoredRecords(collection, [{ ...valid, createdAt: laterTime }]), preservedMessage);
});

test('reading storage never silently trims, removes, or coerces previously saved values', () => {
  const valid = record();
  for (const values of [
    { name: ' Boek ' }, { name: 'Boek', notes: '' }, { name: 'Boek', notes: '   ' },
    { name: 'Boek', notes: undefined }, { name: 'Boek', quantity: '4' },
    { name: 'Boek', category: 'Archief' }, { name: 'Boek', active: 'false' },
  ]) assert.throws(() => parseStoredRecords(collection, [{ ...valid, values }]), preservedMessage);
});

test('sparse storage arrays are rejected instead of carrying unreadable holes forward', () => {
  const sparse = [record()];
  sparse.length = 2;
  assert.throws(() => parseStoredRecords(collection, sparse), preservedMessage);
});

test('storage parser rejects accessors without executing getters at any data layer', () => {
  let reads = 0;
  const arrayGetter = [record()];
  Object.defineProperty(arrayGetter, '0', { enumerable: true, get() { reads += 1; return record(); } });
  const idGetter = record();
  Object.defineProperty(idGetter, 'id', { enumerable: true, get() { reads += 1; return 'record-1'; } });
  const valuesGetter = record();
  Object.defineProperty(valuesGetter, 'values', { enumerable: true, get() { reads += 1; return { name: 'Boek' }; } });
  const fieldGetter = record();
  Object.defineProperty(fieldGetter.values, 'name', { enumerable: true, get() { reads += 1; return 'Boek'; } });
  for (const input of [arrayGetter, [idGetter], [valuesGetter], [fieldGetter]]) {
    assert.throws(() => parseStoredRecords(collection, input), preservedMessage);
  }
  assert.equal(reads, 0);
});

test('storage parser rejects custom prototypes and extra enumerable, hidden, or symbol properties', () => {
  const arrayPrototype = Object.setPrototypeOf([record()], { inherited: true });
  const recordPrototype = Object.setPrototypeOf(record(), { inherited: true });
  const valuesPrototype = record();
  Object.setPrototypeOf(valuesPrototype.values, { inherited: true });
  const arrayExtra = Object.assign([record()], { extra: true });
  const symbolExtra = record();
  Object.defineProperty(symbolExtra, Symbol('unexpected'), { value: true });
  const hiddenExtra = record();
  Object.defineProperty(hiddenExtra, 'unexpected', { value: true });
  const hiddenRequired = record();
  Object.defineProperty(hiddenRequired, 'id', { value: 'record-1', enumerable: false });
  for (const input of [arrayPrototype, [recordPrototype], [valuesPrototype], arrayExtra, [symbolExtra], [hiddenExtra], [hiddenRequired]]) {
    assert.throws(() => parseStoredRecords(collection, input), preservedMessage);
  }
});

test('creation validates values and normalizes user input without mutating the input list', () => {
  const first = Object.freeze(record());
  const records = Object.freeze([first]);
  const values = Object.freeze({ name: '  Nieuw boek  ', notes: '  ', quantity: 0, active: false });
  const result = upsertRecord(collection, records, values, { now: laterTime, createId: () => 'record-2' });
  assert.deepEqual(result.record, {
    id: 'record-2', createdAt: laterTime, updatedAt: laterTime,
    values: { name: 'Nieuw boek', quantity: 0, active: false },
  });
  assert.equal(records.length, 1);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0], first);
  assert.equal(result.records[1], result.record);
  assert.equal(values.name, '  Nieuw boek  ');
});

test('editing preserves the record identity and creation timestamp and replaces only that record', () => {
  const first = Object.freeze(record('record-1', Object.freeze({ name: 'Oud', notes: 'Verwijder dit' })));
  const second = Object.freeze(record('record-2', Object.freeze({ name: 'Blijft hetzelfde' })));
  const records = Object.freeze([first, second]);
  const result = upsertRecord(collection, records, { name: 'Nieuw' }, {
    id: 'record-1', now: laterTime, createId: () => { throw new Error('Editing must not generate an ID'); },
  });
  assert.deepEqual(result.record, { id: 'record-1', createdAt: firstTime, updatedAt: laterTime, values: { name: 'Nieuw' } });
  assert.equal(result.records[0], result.record);
  assert.equal(result.records[1], second);
  assert.deepEqual(first.values, { name: 'Oud', notes: 'Verwijder dit' });
});

test('a device clock correction keeps an edited record readable', () => {
  const result = upsertRecord(collection, [record()], { name: 'Nieuw' }, { id: 'record-1', now: '2026-10-18T13:00:00.000Z' });
  assert.equal(result.record.updatedAt, firstTime);
  assert.deepEqual(parseStoredRecords(collection, result.records), result.records);
});

test('creation and editing reject invalid values before modifying existing data', () => {
  const records = Object.freeze([Object.freeze(record())]);
  const invalidValues = [{}, { name: '' }, { name: 'Boek', quantity: NaN }, { name: 'Boek', quantity: Infinity },
    { name: 'Boek', category: 'Onbekend' }, { name: 'Boek', date: '2026-02-29' },
    { name: 'Boek', photo: 'file:///private/secret.jpg' }, { name: 'Boek', unknown: 'value' }];
  for (const values of invalidValues) {
    assert.throws(() => upsertRecord(collection, records, values, { now: laterTime, createId: () => 'record-2' }));
    assert.throws(() => upsertRecord(collection, records, values, { id: 'record-1', now: laterTime }));
  }
  assert.deepEqual(records, [record()]);
});

test('calendar dates preserve early years and honor Gregorian leap-year boundaries', () => {
  for (const date of ['0001-01-01', '0099-12-31', '1900-02-28', '2000-02-29', '9999-12-31']) {
    const result = upsertRecord(collection, [], { name: 'Datum', date }, { now: firstTime, createId: () => 'dated' });
    assert.equal(result.record.values.date, date);
    assert.deepEqual(parseStoredRecords(collection, result.records), result.records);
  }
  for (const date of ['0000-01-01', '1900-02-29', '2100-02-29', '2000-04-31', '10000-01-01']) {
    assert.throws(() => upsertRecord(collection, [], { name: 'Datum', date }), /geldige datum/);
  }
});

test('invalid timestamps, colliding generated IDs, and missing edit targets cannot alter records', () => {
  const records = Object.freeze([record()]);
  assert.throws(() => upsertRecord(collection, records, { name: 'Nieuw' }, { createId: () => 'record-1' }), /uniek/);
  assert.throws(() => upsertRecord(collection, records, { name: 'Nieuw' }, { createId: () => '../unsafe' }), /uniek/);
  assert.throws(() => upsertRecord(collection, records, { name: 'Nieuw' }, { id: 'missing' }), /bestaat niet meer/);
  assert.throws(() => upsertRecord(collection, records, { name: 'Nieuw' }, { now: 'invalid' }), /datum/);
  assert.deepEqual(records, [record()]);
});

test('the collection limit prevents additions while allowing existing items to be edited', () => {
  const records = Array.from({ length: 10_000 }, (_, index) => record(`record-${index}`));
  assert.throws(() => upsertRecord(collection, records, { name: 'Nieuw' }, { createId: () => 'too-many' }), /vol/);
  assert.equal(upsertRecord(collection, records, { name: 'Bewerkt' }, { id: 'record-0' }).records.length, 10_000);
  assert.throws(() => parseStoredRecords(collection, [...records, record('too-many')]), preservedMessage);
});

test('deleting returns a new list and rejects a missing target', () => {
  const first = Object.freeze(record('record-1'));
  const second = Object.freeze(record('record-2'));
  const records = Object.freeze([first, second]);
  assert.deepEqual(deleteRecord(records, first.id), [second]);
  assert.equal(records.length, 2);
  assert.throws(() => deleteRecord(records, 'missing'), /bestaat niet meer/);
});

test('search matches all words across fields, ignores accents and case, and leaves records untouched', () => {
  const first = record('one', { name: 'Café crème', notes: 'Blauwe stoel', quantity: 2, active: true });
  const second = record('two', { name: 'Cafe', notes: 'Rode tafel', active: false });
  const records = Object.freeze([first, second]);
  assert.deepEqual(selectRecords(records, screen, '  CAFE   BLAUWE '), [first]);
  assert.deepEqual(selectRecords(records, screen, 'cafe rode'), [second]);
  assert.deepEqual(selectRecords(records, screen, 'cafe groen'), []);
  assert.deepEqual(selectRecords(records, screen, 'ja'), [first]);
  assert.deepEqual(selectRecords(records, screen, 'false'), [second]);
  assert.deepEqual(records, [first, second]);
});

test('photo identifiers are excluded from searchable content', () => {
  const item = record('one', { name: 'Foto', photo: 'apphub-photo:hidden-identifier.jpg' });
  assert.deepEqual(selectRecords([item], screen, 'hidden-identifier'), []);
  assert.deepEqual(selectRecords([item], screen, 'Foto'), [item]);
});

test('numeric sort orders numbers correctly and keeps missing values last in either direction', () => {
  const records = Object.freeze([
    record('missing', { name: 'Geen aantal' }), record('ten', { name: 'Tien', quantity: 10 }),
    record('two', { name: 'Twee', quantity: 2 }), record('zero', { name: 'Nul', quantity: 0 }),
  ]);
  const ids = (direction: 'asc' | 'desc') => selectRecords(records, { ...screen, sortField: 'quantity', sortDirection: direction }).map((item) => item.id);
  assert.deepEqual(ids('asc'), ['zero', 'two', 'ten', 'missing']);
  assert.deepEqual(ids('desc'), ['ten', 'two', 'zero', 'missing']);
  assert.deepEqual(records.map((item) => item.id), ['missing', 'ten', 'two', 'zero']);
});

test('default sorting uses newest changes first with a deterministic ID tie breaker', () => {
  const records = [record('b'), record('a'), { ...record('recent'), updatedAt: laterTime }];
  assert.deepEqual(selectRecords(records, screen).map((item) => item.id), ['recent', 'a', 'b']);
});

test('boolean and natural text sorting remain deterministic', () => {
  const records = [record('b', { name: 'Item 10', active: true }), record('a', { name: 'Item 2', active: false })];
  assert.deepEqual(selectRecords(records, { ...screen, sortField: 'name', sortDirection: 'asc' }).map((item) => item.id), ['a', 'b']);
  assert.deepEqual(selectRecords(records, { ...screen, sortField: 'active', sortDirection: 'asc' }).map((item) => item.id), ['a', 'b']);
  assert.deepEqual(selectRecords([record('b'), record('a')], { ...screen, sortField: 'quantity' }).map((item) => item.id), ['a', 'b']);
});

test('photo reference enumeration is unique, restricted to photo fields, and excludes unrelated values', () => {
  const photo = 'apphub-photo:picture-1.jpg';
  assert.deepEqual(photoReferences(collection, { name: 'apphub-photo:text-only.jpg', photo, 'second-photo': photo }), [photo]);
  assert.deepEqual(photoReferences(collection, { name: 'Boek', photo: 'https://example.org/image.jpg' }), []);
  assert.deepEqual(photoReferences(collection, { name: 'Boek' }), []);
});
