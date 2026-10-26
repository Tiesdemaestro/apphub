import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_WEB_MANIFEST_BYTES, normalizePublicUrl, parseWebManifest, validateWebManifest } from '../src/web/contracts.mjs';

const manifest = {
  schemaVersion: 3, kind: 'web', id: 'my-wardrobe', name: 'Mijn kledingkast', description: 'Kleding bewaren', version: '1.0.0',
  startUrl: 'https://alice.github.io/wardrobe/', storage: 'local', allowedOrigins: ['https://alice.github.io'],
  privacyUrl: 'https://alice.github.io/wardrobe/privacy.html', supportUrl: 'https://alice.github.io/wardrobe/support.html',
  ageRating: '4+', dataCollected: [], permissions: [],
};

test('web manifest validates and returns a clean copy without unknown executable metadata', () => {
  const source = { ...manifest, code: 'alert(1)' };
  const result = validateWebManifest(source);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, manifest);
  assert.notEqual(result.value.allowedOrigins, manifest.allowedOrigins);
  result.value.allowedOrigins.push('https://service.com');
  assert.equal(manifest.allowedOrigins.length, 1);
});

test('native permissions, invalid schemas and undeclared start origins are rejected', () => {
  for (const change of [{ schemaVersion: 2 }, { kind: 'native' }, { permissions: ['photos'] },
    { allowedOrigins: ['https://service.com'] }, { allowedOrigins: ['https://alice.github.io/'] },
    { storage: 'filesystem' }, { ageRating: '12+' }, { version: '01.0.0' }, { id: '../secret' }]) {
    assert.equal(validateWebManifest({ ...manifest, ...change }).ok, false, JSON.stringify(change));
  }
});

test('public URL syntax rejects private hosts, unsafe schemes, credentials and disguised traversal', () => {
  assert.equal(normalizePublicUrl('https://ALICE.github.io/wardrobe/'), 'https://alice.github.io/wardrobe/');
  assert.equal(normalizePublicUrl('https://my-clothes.com'), 'https://my-clothes.com/');
  for (const url of [
    'http://alice.github.io/', 'javascript:alert(1)', 'file:///private/x', 'https://localhost/',
    'https://192.168.1.1/', 'https://127.1/', 'https://2130706433/', 'https://0x7f000001/',
    'https://[::1]/', 'https://a.local/', 'https://a.internal/', 'https://a.test/',
    'https://a.example/', 'https://a.com:444/', 'https://a.com./', 'https://u:p@a.com/',
    'https://a.com/?token=x', 'https://a.com/#x', 'https://a.com/a/../secret',
    'https://a.com/a/%2e%2e/secret', 'https://a.com/a/%252e%252e/secret',
    'https://a.com/a%2fsecret', 'https://a.com/a%5csecret', 'https://a.com/\\secret',
    'https://a.com/%00', 'https://a.com/%zz', ' https://a.com/',
  ]) assert.equal(normalizePublicUrl(url), null, url);
});

test('only own scalar data is accepted; known getters and sparse lists are rejected without evaluation', () => {
  let invoked = false;
  const withGetter = { ...manifest };
  Object.defineProperty(withGetter, 'name', { get() { invoked = true; throw Error('getter'); } });
  assert.equal(validateWebManifest(withGetter).ok, false);
  assert.equal(invoked, false);
  assert.equal(validateWebManifest(Object.create(manifest)).ok, false);
  assert.equal(validateWebManifest({ ...manifest, dataCollected: new Array(2) }).ok, false);
  assert.equal(validateWebManifest({ ...manifest, dataCollected: ['email', 'email'] }).ok, false);
});

test('JSON format and UTF-8 byte limits apply before manifest acceptance', () => {
  assert.equal(parseWebManifest(JSON.stringify(manifest)).ok, true);
  assert.equal(parseWebManifest('{broken').ok, false);
  assert.equal(parseWebManifest(null).ok, false);
  const text = JSON.stringify({ ...manifest, ignored: 'é'.repeat(MAX_WEB_MANIFEST_BYTES / 2) });
  assert.equal(text.length < MAX_WEB_MANIFEST_BYTES, true);
  assert.equal(parseWebManifest(text).ok, false);
});
