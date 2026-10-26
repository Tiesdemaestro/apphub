import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStorage, projectKey } from '../src/core/storage.ts';

function memoryBackend() {
  const data = new Map();
  return {
    data,
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { data.set(key, value); },
    async removeItem(key) { data.delete(key); },
  };
}

test('two projects keep distinct values for identical versioned storage keys', async () => {
  const backend = memoryBackend();
  const wardrobe = createProjectStorage('wardrobe', backend);
  const notes = createProjectStorage('notes', backend);
  await wardrobe.setItem('items.v1', [{ name: 'Trui' }]);
  await notes.setItem('items.v1', ['Idee']);
  assert.deepEqual(await wardrobe.getItem('items.v1'), [{ name: 'Trui' }]);
  assert.deepEqual(await notes.getItem('items.v1'), ['Idee']);
  await wardrobe.removeItem('items.v1');
  assert.equal(await wardrobe.getItem('items.v1'), null);
  assert.deepEqual(await notes.getItem('items.v1'), ['Idee']);
});

test('invalid storage namespaces and key separators cannot collide with another project', () => {
  assert.throws(() => projectKey('../notes', 'items'));
  assert.throws(() => projectKey('notes', 'x:items'));
  assert.throws(() => projectKey('notes', ''));
});

test('corrupt stored content is reported and retained', async () => {
  const backend = memoryBackend();
  backend.data.set(projectKey('notes', 'notes.v1'), '{bad');
  const storage = createProjectStorage('notes', backend);
  await assert.rejects(storage.getItem('notes.v1'), /beschadigd/);
  assert.equal(backend.data.get(projectKey('notes', 'notes.v1')), '{bad');
});

test('failed storage writes do not silently report success', async () => {
  const storage = createProjectStorage('notes', { ...memoryBackend(), async setItem() { throw new Error('disk full'); } });
  await assert.rejects(storage.setItem('notes.v1', []), /disk full/);
});

