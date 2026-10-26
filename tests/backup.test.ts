import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  decodePhotoBase64, isBackupKey, isSafePhotoName, isSafeProjectId, LIBRARY_KEY,
  MAX_PHOTO_BYTES, MAX_VALUE_BYTES, parseBackup, photoByteLength, summarizeBackup,
  utf8Bytes, validateBackup, type AppHubBackup,
} from '../src/core/backupFormat.ts';

function fixture(): AppHubBackup {
  return {
    format: 'apphub-backup', version: 1, createdAt: '2026-10-19T13:00:00.000Z',
    entries: [[LIBRARY_KEY, '[]'], ['apphub:project:wardrobe:wardrobe.v1', JSON.stringify([
      { id: 'one', photoUri: 'apphub-photo:photo-1.jpg', name: 'Blauwe jas', category: 'outerwear', color: 'Blauw' },
    ])]],
    photos: [{ projectId: 'wardrobe', name: 'photo-1.jpg', base64: 'AQIDBA==' }],
  };
}

test('backup roundtrip includes data, photos and summary', () => {
  const backup = parseBackup(JSON.stringify(fixture()));
  assert.deepEqual(backup, fixture());
  assert.deepEqual(summarizeBackup(backup), {
    projects: 0, records: 1, photos: 1, photoBytes: 4, createdAt: fixture().createdAt,
  });
  assert.deepEqual([...decodePhotoBase64(backup.photos[0].base64)], [1, 2, 3, 4]);
});

test('credentials and internal storage keys cannot enter exported or restored backups', () => {
  for (const key of ['apphub:host:github-token', 'apphub:token', 'apphub:internal:restore-commit',
    'unrelated:value', 'apphub:host:library:v1']) {
    assert.equal(isBackupKey(key), false, key);
    const backup = fixture();
    backup.entries.push([key, '"secret"']);
    assert.throws(() => validateBackup(backup), /afgeschermde/);
  }
  assert.equal(isBackupKey(LIBRARY_KEY), true);
  assert.equal(isBackupKey('apphub:project:example:records.v1'), true);
  for (const name of ['tokens', 'passwords', 'secrets']) {
    assert.equal(isBackupKey(`apphub:project:example:runtime.v1.${name}`), true);
  }
});

test('unknown version, malformed JSON and missing registry fail before mutation', () => {
  assert.throws(() => parseBackup('{'), /JSON/);
  assert.throws(() => validateBackup({ ...fixture(), version: 2 }), /ondersteunde/);
  assert.throws(() => validateBackup({ ...fixture(), entries: [] }), /bibliotheek/);
  assert.throws(() => validateBackup({ ...fixture(), createdAt: 'yesterday' }), /datum/);
  const invalidJson = fixture();
  invalidJson.entries[1][1] = 'undefined';
  assert.throws(() => validateBackup(invalidJson), /JSON/);
  const invalidRegistry = fixture();
  invalidRegistry.entries[0][1] = '[{"app":{"id":"danger"}}]';
  assert.throws(() => validateBackup(invalidRegistry), /appbibliotheek/);
  const invalidPrefs = fixture();
  invalidPrefs.entries.push(['apphub:host:prefs:v1', '{"favorites":true}']);
  assert.throws(() => validateBackup(invalidPrefs), /voorkeuren/);
});

test('project names, photo paths and references cannot traverse directories', () => {
  for (const id of ['..', '../wardrobe', 'wardrobe/../notes', '/tmp', 'Wardrobe', 'a']) assert.equal(isSafeProjectId(id), false, id);
  for (const name of ['../x.jpg', '/x.jpg', 'a\\b.jpg', 'x.jpg/..', 'file:///x.jpg', 'x.svg', 'x.JPG', '.jpg']) {
    assert.equal(isSafePhotoName(name), false, name);
    const backup = fixture();
    backup.photos[0].name = name;
    assert.throws(() => validateBackup(backup), /foto/);
  }
  const backup = fixture();
  const clothing = JSON.parse(backup.entries[1][1]);
  clothing[0].photoUri = 'apphub-photo:../x.jpg';
  backup.entries[1][1] = JSON.stringify(clothing);
  assert.throws(() => validateBackup(backup), /kledingkast/);
});

test('duplicate storage keys, duplicate photos and missing referenced photos are rejected', () => {
  const entries = fixture();
  entries.entries.push(entries.entries[0]);
  assert.throws(() => validateBackup(entries), /dubbel/);
  const photos = fixture();
  photos.photos.push(photos.photos[0]);
  assert.throws(() => validateBackup(photos), /dubbel/);
  const missing = fixture();
  missing.photos = [];
  assert.throws(() => validateBackup(missing), /ontbreekt/);
});

test('value limits measure UTF-8 bytes rather than characters', () => {
  const backup = fixture();
  backup.entries[1][1] = JSON.stringify('€'.repeat(Math.ceil(MAX_VALUE_BYTES / 3)));
  assert.throws(() => validateBackup(backup), /te groot/);
  for (const value of ['ascii', 'één', '€', '😀', '\ud800', '\udc00', 'mix😀€é']) {
    assert.equal(utf8Bytes(value), Buffer.byteLength(value), value);
  }
});

test('invalid or oversized base64 is rejected before allocating decoded bytes', () => {
  for (const base64 of ['', 'abc', '../path', '====', 'AA=A', 'AB==', 'AAB=', 'data:image/png;base64,AAAA']) {
    const backup = fixture();
    backup.photos[0].base64 = base64;
    assert.throws(() => validateBackup(backup), /foto/);
  }
  const oversized = fixture();
  oversized.photos[0].base64 = 'A'.repeat(Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 4);
  assert.throws(() => validateBackup(oversized), /20 MB/);
});

test('base64 decoding preserves binary bytes with all padding lengths', () => {
  for (const bytes of [Buffer.from([0]), Buffer.from([0, 255]), Buffer.from([0, 1, 2]),
    Buffer.from(Array.from({ length: 256 }, (_, i) => i))]) {
    const encoded = bytes.toString('base64');
    assert.deepEqual(Buffer.from(decodePhotoBase64(encoded)), bytes);
    assert.equal(photoByteLength(encoded), bytes.length);
  }
});

test('large flat JSON arrays are validated without recursive or spread overflow', () => {
  const backup = fixture();
  backup.entries[1][0] = 'apphub:project:custom:items';
  backup.entries[1][1] = JSON.stringify(Array.from({ length: 150_000 }, () => 1));
  assert.doesNotThrow(() => validateBackup(backup));
});

test('native and retained definitions reject unreadable collection records before restoring', () => {
  const app = JSON.parse(readFileSync(new URL('../examples/native/taken.json', import.meta.url), 'utf8'));
  const record = {
    app, source: { kind: 'file' }, installedAt: fixture().createdAt, updatedAt: fixture().createdAt,
  };
  const backup = fixture();
  backup.entries[0][1] = JSON.stringify([record]);
  backup.entries.push(['apphub:project:mijn-taken:runtime.v1.taken', '[]']);
  assert.doesNotThrow(() => validateBackup(backup));
  backup.entries[2][1] = JSON.stringify([{ values: { titel: 123 } }]);
  assert.throws(() => validateBackup(backup), /niet leesbaar/);
  backup.entries[0][1] = '[]';
  backup.entries.push(['apphub:project:mijn-taken:retained.v1', JSON.stringify([record])]);
  assert.throws(() => validateBackup(backup), /niet leesbaar/);
  backup.entries[2][1] = '[]';
  assert.doesNotThrow(() => validateBackup(backup));
  backup.entries[3][0] = 'apphub:project:ander-project:retained.v1';
  assert.throws(() => validateBackup(backup), /ander project/);
});

test('known builtin collection schemas are checked before replacing existing data', () => {
  for (const key of ['apphub:project:notes:notes.v1', 'apphub:project:wardrobe:wardrobe.v1']) {
    const backup = fixture();
    backup.entries = backup.entries.filter(([existing]) => existing !== key);
    backup.entries.push([key, '[{"unexpected":123}]']);
    assert.throws(() => validateBackup(backup), /niet leesbaar/);
  }
});

test('literal photo reference text in a note is preserved as text', () => {
  const backup = fixture();
  backup.entries.push(['apphub:project:notes:notes.v1', JSON.stringify([
    { id: 'note-1', title: 'Documentation', body: 'apphub-photo:../literal.jpg', updatedAt: backup.createdAt },
  ])]);
  assert.doesNotThrow(() => validateBackup(backup));
});

test('a normal host registry may exceed the per-project value limit', () => {
  const sample = JSON.parse(readFileSync(new URL('../examples/native/taken.json', import.meta.url), 'utf8'));
  const collections = Array.from({ length: 12 }, (_, index) => ({
    id: `collection-${index}`, title: 'Large collection', fields: Array.from({ length: 24 }, (_, field) => ({
      id: `field-${field}`, label: 'L'.repeat(80), type: 'text',
    })),
  }));
  const registry = Array.from({ length: 50 }, (_, index) => {
    const app = { ...sample, id: `test-app-${index}`, collections,
      screens: [{ id: 'home', title: 'Home', collection: 'collection-0', layout: 'list', titleField: 'field-0' }], homeScreen: 'home' };
    return { app, source: { kind: 'file' }, installedAt: fixture().createdAt, updatedAt: fixture().createdAt,
      previous: { app, source: { kind: 'file' } } };
  });
  const backup = fixture();
  backup.entries[0][1] = JSON.stringify(registry);
  assert.ok(utf8Bytes(backup.entries[0][1]) > MAX_VALUE_BYTES);
  assert.doesNotThrow(() => validateBackup(backup));
});

// Exercise the real restore orchestration with failing native adapters. Nothing is
// mocked inside backup.ts: transactions, journal and photo swaps use their public APIs.
test('native restore preserves the old library and photos across write failures and restart', async () => {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>(['file:///documents', 'file:///cache']);
  const values = new Map<string, string>();
  let failBatchCount = 0;
  let failRemoveCount = 0;
  let directoryMoveCount = 0;
  let failDirectoryMoveAt = 0;
  let failOldDirectoryCleanup = 0;
  let cancelPicker = false;
  const join = (...parts: (string | { uri: string })[]) => parts.map(part => typeof part === 'string' ? part : part.uri).join('/').replace(/\/$/, '');
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = join(...parts); }
    get name() { return this.uri.slice(this.uri.lastIndexOf('/') + 1); }
    get exists() { return dirs.has(this.uri); }
    create() {
      let path = this.uri;
      while (path.startsWith('file:///')) {
        dirs.add(path);
        path = path.slice(0, path.lastIndexOf('/'));
      }
    }
    delete() {
      if (this.uri.includes('apphub-previous-') && failOldDirectoryCleanup > 0) {
        failOldDirectoryCleanup--;
        throw new Error('Simulated cleanup failure');
      }
      for (const path of files.keys()) if (path.startsWith(this.uri + '/')) files.delete(path);
      for (const path of dirs) if (path === this.uri || path.startsWith(this.uri + '/')) dirs.delete(path);
    }
    async move(destination: MockDirectory) {
      await Promise.resolve(); // SDK 56 move is asynchronous; missing awaits break the tests.
      directoryMoveCount++;
      if (directoryMoveCount === failDirectoryMoveAt) throw new Error('Simulated photo swap failure');
      if (!this.exists || destination.exists) throw new Error('Invalid directory move');
      const old = this.uri;
      for (const [path, bytes] of [...files]) if (path.startsWith(old + '/')) {
        files.set(destination.uri + path.slice(old.length), bytes);
        files.delete(path);
      }
      for (const path of [...dirs]) if (path === old || path.startsWith(old + '/')) {
        dirs.add(destination.uri + path.slice(old.length));
        dirs.delete(path);
      }
      this.uri = destination.uri;
    }
    list() {
      const directChild = (path: string) => path.startsWith(this.uri + '/') && !path.slice(this.uri.length + 1).includes('/');
      return [...[...dirs].filter(directChild).map(path => new MockDirectory(path)),
        ...[...files.keys()].filter(directChild).map(path => new MockFile(path))];
    }
  }
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = join(...parts); }
    get name() { return this.uri.slice(this.uri.lastIndexOf('/') + 1); }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length ?? 0; }
    create() { if (this.exists) throw new Error('Exists'); files.set(this.uri, new Uint8Array()); }
    write(value: string | Uint8Array) { files.set(this.uri, typeof value === 'string' ? new TextEncoder().encode(value) : value); }
    async text() { if (!this.exists) throw new Error('Missing file'); return new TextDecoder().decode(files.get(this.uri)); }
    async base64() { return Buffer.from(files.get(this.uri)!).toString('base64'); }
    delete() { files.delete(this.uri); }
    async move(destination: MockFile) {
      await Promise.resolve();
      if (!this.exists || destination.exists) throw new Error('Invalid file move');
      files.set(destination.uri, files.get(this.uri)!);
      files.delete(this.uri);
      this.uri = destination.uri;
    }
  }
  const adapters = {
    storage: {
      async getAllKeys() { return [...values.keys()]; },
      async multiGet(keys: string[]) { return keys.map(key => [key, values.get(key) ?? null]); },
      async getItem(key: string) { return values.get(key) ?? null; },
      async setItem(key: string, value: string) { values.set(key, value); },
      async removeItem(key: string) { values.delete(key); },
      async multiSet(pairs: [string, string][]) {
        if (failBatchCount > 0) {
          failBatchCount--;
          // Deliberately harsher than SQLite's atomic batch: one write happened.
          if (pairs[0]) values.set(...pairs[0]);
          throw new Error('Simulated disk write failure');
        }
        for (const pair of pairs) values.set(...pair);
      },
      async multiRemove(keys: string[]) {
        for (const key of keys) values.delete(key);
        if (failRemoveCount > 0) { failRemoveCount--; throw new Error('Simulated remove batch failure'); }
      },
    },
    fs: { Directory: MockDirectory, File: MockFile, Paths: { document: new MockDirectory('file:///documents'), cache: new MockDirectory('file:///cache/') } },
    picker: { async getDocumentAsync() { return cancelPicker ? { canceled: true } : { canceled: false, assets: [{ uri: 'file:///cache/input.json' }] }; } },
    sharing: { async isAvailableAsync() { return true; }, async shareAsync() {} },
  };
  const globalName = '__apphubBackupTestAdapters';
  Reflect.set(globalThis, globalName, adapters);
  const modules: Record<string, string> = {
    'expo-sqlite/kv-store': `export default globalThis.${globalName}.storage;`,
    'expo-file-system': `export const {File,Directory,Paths}=globalThis.${globalName}.fs;`,
    'expo-document-picker': `export const {getDocumentAsync}=globalThis.${globalName}.picker;`,
    'expo-sharing': `export const {isAvailableAsync,shareAsync}=globalThis.${globalName}.sharing;`,
  };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      return modules[specifier] ? { url: `apphub-test:${specifier}`, shortCircuit: true } : next(specifier, context);
    },
    load(url, context, next) {
      return url.startsWith('apphub-test:')
        ? { format: 'module', source: modules[url.slice('apphub-test:'.length)], shortCircuit: true }
        : next(url, context);
    },
  });
  try {
    const { restoreBackup, recoverPendingRestore, exportBackup } = await import('../src/core/backup.ts');
    const oldData = JSON.stringify([{ name: 'Existing note' }]);
    const oldPhoto = 'file:///documents/apphub/notes/photos/old-photo.jpg';
    const reset = () => {
      values.clear(); files.clear(); dirs.clear();
      dirs.add('file:///documents'); dirs.add('file:///cache');
      values.set(LIBRARY_KEY, '[]');
      values.set('apphub:project:notes:items', oldData);
      values.set('apphub:host:github-token', 'do-not-touch');
      new MockDirectory('file:///documents/apphub/notes/photos').create();
      files.set(oldPhoto, new Uint8Array([9, 8, 7]));
      new MockFile('file:///cache/input.json').write(JSON.stringify(fixture()));
      failBatchCount = 0;
      failRemoveCount = 0;
      directoryMoveCount = 0;
      failDirectoryMoveAt = 0;
      failOldDirectoryCleanup = 0;
      cancelPicker = false;
    };
    const assertOldPreserved = () => {
      assert.equal(values.get('apphub:project:notes:items'), oldData);
      assert.equal(values.get('apphub:project:wardrobe:wardrobe.v1'), undefined);
      assert.deepEqual([...files.get(oldPhoto)!], [9, 8, 7]);
      assert.equal(values.get('apphub:host:github-token'), 'do-not-touch');
    };
    reset();
    cancelPicker = true;
    assert.equal(await restoreBackup(), false);
    assertOldPreserved();

    reset();
    new MockFile('file:///cache/input.json').write('{');
    await assert.rejects(restoreBackup(), /JSON/);
    assertOldPreserved();

    reset();
    failBatchCount = 1;
    await assert.rejects(restoreBackup(), /disk write/);
    assertOldPreserved();
    assert.equal(files.has('file:///documents/apphub-restore-journal.json'), false);

    for (const failAt of [1, 2]) {
      reset();
      failDirectoryMoveAt = failAt;
      await assert.rejects(restoreBackup(), /photo swap/);
      assertOldPreserved();
      assert.equal(files.has('file:///documents/apphub-restore-journal.json'), false);
    }

    reset();
    failRemoveCount = 1;
    await assert.rejects(restoreBackup(), /remove batch/);
    assertOldPreserved();

    reset();
    failBatchCount = 2;
    await assert.rejects(restoreBackup(), /onderbroken/);
    assert.equal(files.has('file:///documents/apphub-restore-journal.json'), true);
    await recoverPendingRestore();
    assertOldPreserved();

    reset();
    assert.equal(await restoreBackup(), true);
    assert.equal(values.has('apphub:project:notes:items'), false);
    assert.equal(values.get('apphub:project:wardrobe:wardrobe.v1'), fixture().entries[1][1]);
    assert.equal(files.has(oldPhoto), false);
    assert.deepEqual([...files.get('file:///documents/apphub/wardrobe/photos/photo-1.jpg')!], [1, 2, 3, 4]);
    assert.equal(values.get('apphub:host:github-token'), 'do-not-touch');
    assert.equal(files.has('file:///documents/apphub-restore-journal.json'), false);
    await exportBackup();
    assert.equal([...files.keys()].some(path => path.includes('AppHub-backup-')), false);

    reset();
    failOldDirectoryCleanup = 1;
    assert.equal(await restoreBackup(), true);
    assert.equal(files.has('file:///documents/apphub-restore-journal.json'), true);
    await recoverPendingRestore();
    assert.equal(files.has('file:///documents/apphub-restore-journal.json'), false);
    assert.equal(values.has('apphub:project:notes:items'), false);
    assert.equal(values.get('apphub:project:wardrobe:wardrobe.v1'), fixture().entries[1][1]);
    assert.equal(files.has(oldPhoto), false);
  } finally {
    hooks.deregister();
    Reflect.deleteProperty(globalThis, globalName);
  }
});
