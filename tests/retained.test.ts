import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { installProject } from '../src/core/library.ts';
import { assertRetainedInstall } from '../src/core/retained.ts';
import { parseMiniApp, validateMiniApp } from '../src/runtime/schema.ts';
import type { ProjectSource } from '../src/runtime/importer.ts';

const app = parseMiniApp(readFileSync(new URL('../examples/native/boeken.json', import.meta.url), 'utf8'));
const local: ProjectSource = { kind: 'file' };
const github: ProjectSource = { kind: 'github', repository: 'https://github.com/mees/boeken', commit: 'a'.repeat(40) };
const retained = (source: ProjectSource = local) => JSON.stringify(installProject([], app, source));

test('first install requires no retained snapshot only when the namespace is empty', () => {
  assert.doesNotThrow(() => assertRetainedInstall(null, app, local, false));
  assert.throws(() => assertRetainedInstall(null, app, local, true), /gegevens zonder leesbare appdefinitie/i);
});

test('retained rows allow the original app and compatible presentation updates', () => {
  const snapshot = retained();
  assert.doesNotThrow(() => assertRetainedInstall(snapshot, app, local, true));
  const updated = validateMiniApp({ ...app, name: 'Mijn leeshoek', version: '1.1.0', theme: { color: '#394782' }, screens: [...app.screens].reverse() });
  assert.doesNotThrow(() => assertRetainedInstall(snapshot, updated, local, true));
  assert.deepEqual(JSON.parse(snapshot)[0].app, app);
});

test('a retained app cannot be reinstalled with a different identity or data model', () => {
  const renamed = validateMiniApp({ ...app, id: 'mijn-andere-boeken' });
  assert.throws(() => assertRetainedInstall(retained(), renamed, local, true), /ander app-ID/i);
  const changed = structuredClone(app);
  changed.collections[0].fields[0].type = 'multiline';
  assert.throws(() => assertRetainedInstall(retained(), validateMiniApp(changed), local, true), /gegevensmodel/i);
  const newCollection = validateMiniApp({ ...app,
    collections: [{ ...app.collections[0], id: 'andere-boeken' }],
    screens: app.screens.map(screen => ({ ...screen, collection: 'andere-boeken' })),
  });
  assert.throws(() => assertRetainedInstall(retained(), newCollection, local, true), /gegevensmodel/i);
});

test('reinstallation maintains repository ownership and permits a newer commit from the same repository', () => {
  const snapshot = retained(github);
  assert.doesNotThrow(() => assertRetainedInstall(snapshot, app, { ...github, repository: 'https://github.com/MEES/BOEKEN', commit: 'b'.repeat(40) }, true));
  assert.throws(() => assertRetainedInstall(snapshot, app, { ...github, repository: 'https://github.com/ander/boeken' }, true), /andere projectbron/i);
  assert.throws(() => assertRetainedInstall(snapshot, app, local, true), /andere projectbron/i);
  assert.throws(() => assertRetainedInstall(retained(), app, github, true), /andere projectbron/i);
});

test('malformed or ambiguous retained snapshots fail closed before any overwrite', () => {
  const installed = JSON.parse(retained())[0];
  for (const raw of ['not json', 'null', '{}', '[]', JSON.stringify([installed, { ...installed, app: { ...app, id: 'tweede-app' } }])]) {
    assert.throws(() => assertRetainedInstall(raw, app, local, true), /bewaarde appdefinitie is niet leesbaar/i);
  }
  assert.throws(() => assertRetainedInstall('{', app, local, false), /bewaarde appdefinitie is niet leesbaar/i);
});
