import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertCompatibleUpdate, emptyPreferences, installProject, readInstalledRegistry,
  readPreferences, rollbackProject, updateProject, type InstalledProject,
} from '../src/core/library.ts';
import type { ProjectSource } from '../src/runtime/importer.ts';
import { parseMiniApp, validateMiniApp, type MiniApp } from '../src/runtime/schema.ts';

const original = parseMiniApp(readFileSync(new URL('../examples/native/boeken.json', import.meta.url), 'utf8'));
const local: ProjectSource = { kind: 'file' };
const firstSource: ProjectSource = { kind: 'github', repository: 'https://github.com/mees/boeken', commit: 'a'.repeat(40) };
const secondSource: ProjectSource = { ...firstSource, commit: 'b'.repeat(40) };

function changed(fields: Partial<MiniApp> = {}): MiniApp {
  return validateMiniApp({ ...original, version: '1.1.0', name: 'Mijn leeshoek', ...fields });
}

test('install, persist, update and rollback restore exactly the previous app and source', () => {
  const empty: InstalledProject[] = [];
  const installed = installProject(empty, original, firstSource);
  assert.equal(empty.length, 0);
  assert.equal(installed.length, 1);
  assert.equal(installed[0].installedAt, installed[0].updatedAt);
  assert.ok(Number.isFinite(Date.parse(installed[0].installedAt)));

  const restored = readInstalledRegistry(JSON.stringify(installed));
  assert.deepEqual(restored, installed);
  const next = changed({ theme: { color: '#50793C' }, homeScreen: 'leeslijst' });
  const updated = updateProject(restored, original.id, next, secondSource);
  assert.deepEqual(restored[0].app, original);
  assert.equal(updated[0].installedAt, installed[0].installedAt);
  assert.deepEqual(updated[0].previous, { app: original, source: firstSource });
  assert.deepEqual(updated[0].source, secondSource);

  const afterRestart = readInstalledRegistry(JSON.stringify(updated));
  const rolledBack = rollbackProject(afterRestart, original.id);
  assert.deepEqual(rolledBack[0].app, original);
  assert.deepEqual(rolledBack[0].source, firstSource);
  assert.equal(rolledBack[0].installedAt, installed[0].installedAt);
  assert.equal(rolledBack[0].previous, undefined);
  assert.deepEqual(afterRestart[0].app, next);
  assert.throws(() => rollbackProject(rolledBack, original.id), /geen vorige versie/i);
});

test('successive updates keep one rollback point without changing unrelated apps', () => {
  const other = validateMiniApp({ ...original, id: 'andere-boeken', name: 'Andere boeken' });
  let library = installProject(installProject([], original, local), other, local);
  const untouched = library[1];
  const first = changed();
  library = updateProject(library, original.id, first, local);
  const second = changed({ version: '1.2.0', description: 'Een tweede schermindeling.' });
  library = updateProject(library, original.id, second, local);
  assert.deepEqual(library[0].previous?.app, first);
  assert.equal(library[1], untouched);
  assert.deepEqual(rollbackProject(library, original.id)[0].app, first);
});

test('duplicate installs and updates to missing or unchanged apps leave the library intact', () => {
  const library = installProject([], original, local);
  const before = JSON.stringify(library);
  assert.throws(() => installProject(library, original, local), /al toegevoegd/i);
  assert.throws(() => updateProject(library, 'ontbreekt', changed(), local), /niet meer aanwezig/i);
  assert.throws(() => updateProject(library, original.id, original, local), /deze versie al/i);
  assert.throws(() => rollbackProject(library, 'ontbreekt'), /geen vorige versie/i);
  assert.equal(JSON.stringify(library), before);
});

test('the 50-project cap permits replacing an existing project without adding a 51st', () => {
  let library: InstalledProject[] = [];
  for (let index = 0; index < 50; index += 1) {
    library = installProject(library, validateMiniApp({ ...original, id: `boekenkast-${index}` }), local);
  }
  assert.equal(library.length, 50);
  assert.throws(() => installProject(library, original, local), /maximaal 50/i);
  const updated = updateProject(library, 'boekenkast-0', changed({ id: 'boekenkast-0' }), local);
  assert.equal(updated.length, 50);
  assert.equal(updated[0].app.name, 'Mijn leeshoek');
});

test('presentation changes and reordered fields preserve the storage schema', () => {
  const next = changed({
    collections: original.collections.map(collection => ({
      ...collection,
      title: 'Mijn eigen boeken',
      fields: [...collection.fields].reverse().map(field => ({ ...field, label: `Mijn ${field.label}` })),
    })),
    screens: [...original.screens].reverse(),
  });
  assert.doesNotThrow(() => assertCompatibleUpdate(original, next));
});

test('updates reject identity and destructive schema changes before replacing the app', () => {
  const library = installProject([], original, local);
  const before = JSON.stringify(library);
  const mutations: Array<(app: MiniApp) => void> = [
    app => { app.id = 'andere-app'; },
    app => { app.collections[0].fields[0].required = false; },
    app => { app.collections[0].fields[0].type = 'multiline'; },
    app => { app.collections[0].fields.push({ id: 'nieuw', label: 'Nieuw veld', type: 'text' }); },
    app => { app.collections[0].fields.find(field => field.id === 'leesstatus')!.options!.push('Uitgeleend'); },
    app => { app.collections.push({ id: 'aantekeningen', title: 'Aantekeningen', fields: [{ id: 'tekst', label: 'Tekst', type: 'text' }] }); },
  ];
  for (const mutate of mutations) {
    const next = structuredClone(changed());
    mutate(next);
    assert.throws(() => updateProject(library, original.id, validateMiniApp(next), local), /ander app-ID|gegevensmodel/i);
  }
  assert.equal(JSON.stringify(library), before);
});

test('a GitHub app cannot silently change repository or become a file import on update', () => {
  const installed = installProject([], original, firstSource);
  assert.throws(() => updateProject(installed, original.id, changed(), local), /andere repository/i);
  assert.throws(() => updateProject(installed, original.id, changed(), { ...secondSource, repository: 'https://github.com/ander/boeken' }), /andere repository/i);
  const sameRepository = { ...secondSource, repository: 'https://github.com/MEES/BOEKEN' };
  assert.equal(updateProject(installed, original.id, changed(), sameRepository)[0].app.version, '1.1.0');
});

test('registry reads reject corrupt, duplicate, invalid-source and incompatible-rollback data', () => {
  const installed = installProject([], original, firstSource)[0];
  const incompatible = structuredClone(original);
  incompatible.collections[0].fields[0].required = false;
  const invalidValues = [
    'not json', '{}', JSON.stringify([installed, installed]),
    JSON.stringify([{ ...installed, updatedAt: 'geen datum' }]),
    JSON.stringify([{ ...installed, app: { ...original, runtimeVersion: 'eval-javascript' } }]),
    JSON.stringify([{ ...installed, source: { kind: 'github', repository: 'http://github.com/mees/boeken', commit: 'a'.repeat(40) } }]),
    JSON.stringify([{ ...installed, source: { ...firstSource, commit: 'main' } }]),
    JSON.stringify([{ ...installed, previous: { app: incompatible, source: local } }]),
    JSON.stringify(Array.from({ length: 51 }, (_, index) => ({ ...installed, app: { ...original, id: `boeken-${index}` } }))),
  ];
  assert.deepEqual(readInstalledRegistry(null), []);
  for (const value of invalidValues) {
    assert.throws(() => readInstalledRegistry(value), /gegevens zijn behouden/i);
  }
});

test('preferences restore unique ordering and isolate each fresh defaults object', () => {
  const first = readPreferences(null);
  first.favorites.push('mijn-boeken');
  first.recent.push('mijn-taken');
  first.welcomed = true;
  assert.deepEqual(readPreferences(null), { favorites: [], recent: [], welcomed: false });
  assert.deepEqual(emptyPreferences, { favorites: [], recent: [], welcomed: false });
  assert.deepEqual(readPreferences(JSON.stringify({
    favorites: ['mijn-boeken', 'mijn-taken', 'mijn-boeken'],
    recent: ['mijn-taken', 'mijn-boeken', 'mijn-taken'], welcomed: true,
  })), { favorites: ['mijn-boeken', 'mijn-taken'], recent: ['mijn-taken', 'mijn-boeken'], welcomed: true });
});

test('preferences reject invalid IDs, types and oversized lists', () => {
  for (const value of [
    null, {}, { favorites: ['../private'], recent: [], welcomed: false },
    { favorites: [], recent: ['mijn-boeken'], welcomed: 'yes' },
    { favorites: [], recent: [42], welcomed: false },
    { favorites: Array.from({ length: 53 }, () => 'mijn-boeken'), recent: [], welcomed: false },
  ]) assert.throws(() => readPreferences(JSON.stringify(value)), /voorkeuren/i);
  assert.throws(() => readPreferences('not json'));
});
