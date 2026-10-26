import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_FIELDS, MAX_MANIFEST_BYTES, MAX_RECORD_BYTES, parseMiniApp, utf8ByteLength,
  validateMiniApp, validateRecord, type MiniApp, type Collection,
} from '../src/runtime/schema.ts';
import { importMiniApp, IMPORT_TIMEOUT_MS, MAX_GITHUB_RESPONSE_BYTES, parseGithubRepository } from '../src/runtime/importer.ts';

function fixture(): MiniApp {
  return {
    schemaVersion: 2, id: 'mijn-boeken', name: 'Mijn boeken 📚', description: 'Bewaar je boeken.', version: '1.2.0', runtimeVersion: 'apphub-native-1',
    capabilities: ['storage', 'photos'],
    collections: [{ id: 'boeken', title: 'Boeken', fields: [
      { id: 'titel', label: 'Titel', type: 'text', required: true },
      { id: 'samenvatting', label: 'Samenvatting', type: 'multiline' },
      { id: 'pagina', label: 'Pagina', type: 'number' },
      { id: 'gelezen', label: 'Gelezen', type: 'boolean' },
      { id: 'status', label: 'Status', type: 'choice', options: ['Lezen', 'Gelezen'] },
      { id: 'datum', label: 'Datum', type: 'date' },
      { id: 'omslag', label: 'Omslag', type: 'photo' },
    ] }],
    screens: [{ id: 'overzicht', title: 'Boeken', collection: 'boeken', layout: 'grid', titleField: 'titel', subtitleField: 'status', imageField: 'omslag', sortField: 'titel', sortDirection: 'asc' }],
    homeScreen: 'overzicht', theme: { color: '#3058D6' },
  };
}

const commit = 'a'.repeat(40);
type FetchCall = { url: string; init?: RequestInit };
function response(value: unknown, url: string, status = 200, headers?: Record<string, string>): Response {
  const result = new Response(JSON.stringify(value), { status, headers });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}
function githubMock(options: { branch?: string; manifest?: string; mutate?: (step: number, url: string) => Response | undefined } = {}): { fetcher: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const file = options.manifest ?? JSON.stringify(fixture());
  const values = [{ default_branch: options.branch ?? 'main' }, { sha: commit }, {
    type: 'file', path: 'apphub.json', encoding: 'base64', size: Buffer.byteLength(file), content: Buffer.from(file).toString('base64'),
    download_url: 'https://untrusted.example/never-read',
  }];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const step = calls.length;
    calls.push({ url, init });
    return options.mutate?.(step, url) ?? response(values[step], url);
  }) as typeof fetch;
  return { fetcher, calls };
}

test('valid native manifests round-trip including UTF-8 and do not share mutable input', () => {
  const input = fixture();
  const parsed = parseMiniApp(JSON.stringify(input));
  assert.deepEqual(parsed, input);
  parsed.collections[0].fields[0].label = 'Anders';
  assert.equal(input.collections[0].fields[0].label, 'Titel');
  assert.equal(utf8ByteLength('aé📚'), 7);
});

test('executable and unknown manifest fields are always rejected', () => {
  for (const key of ['javascript', 'code', 'url', 'webview', 'repository', '__proto__', 'constructor', 'prototype']) {
    const input = JSON.parse(JSON.stringify(fixture()));
    Object.defineProperty(input, key, { value: 'alert(1)', enumerable: true });
    assert.throws(() => validateMiniApp(input), /onbekend|onveilig/);
  }
  const nested = fixture();
  Object.assign(nested.screens[0], { onPress: 'eval("bad")' });
  assert.throws(() => validateMiniApp(nested), /onbekend/);
});

test('inherited properties, getters, symbols, sparse arrays, and custom prototypes never execute', () => {
  let reads = 0;
  const getter = fixture();
  Object.defineProperty(getter, 'name', { get() { reads++; return 'Injected'; }, enumerable: true });
  assert.throws(() => validateMiniApp(getter), /gewone waarde/);
  assert.equal(reads, 0);
  assert.throws(() => validateMiniApp(Object.create(fixture())), /gewoon gegevensobject/);
  const symbol = fixture();
  Object.defineProperty(symbol, Symbol('hidden'), { value: 1 });
  assert.throws(() => validateMiniApp(symbol), /onbekend/);
  const sparse = fixture();
  sparse.collections[0].fields = new Array(2);
  assert.throws(() => validateMiniApp(sparse), /ongeldige/);
  const extra = fixture();
  Object.assign(extra.capabilities, { evil: 'value' });
  assert.throws(() => validateMiniApp(extra), /ongeldige/);
  const arrayGetter = fixture();
  Object.defineProperty(arrayGetter.screens, '0', { get() { reads++; return fixture().screens[0]; } });
  assert.throws(() => validateMiniApp(arrayGetter), /ongeldig/);
  assert.equal(reads, 0);
});

test('reserved IDs and path-like names cannot collide with built-in app storage', () => {
  for (const id of ['wardrobe', 'notes', 'mijn-kledingkast', 'mijn-notities', 'apphub-tools', 'system-settings', '../notes', 'a/b', '__proto__', 'constructor', 'Upper']) {
    assert.throws(() => validateMiniApp({ ...fixture(), id }));
  }
  const badField = fixture();
  badField.collections[0].fields[0].id = 'constructor';
  assert.throws(() => validateMiniApp(badField));
});

test('legacy contract reports its required migration and malformed JSON fails clearly', () => {
  assert.throws(() => validateMiniApp({ ...fixture(), schemaVersion: 1, runtimeVersion: 'apphub-1' }), /oud projectmanifest/);
  assert.throws(() => parseMiniApp('{broken'), /ongeldige JSON/);
  assert.throws(() => parseMiniApp(' '.repeat(MAX_MANIFEST_BYTES + 1)), /128 KiB/);
  assert.throws(() => parseMiniApp(JSON.stringify({ ...fixture(), name: '📚'.repeat(MAX_MANIFEST_BYTES / 4) })), /128 KiB/);
});

test('references and capability requirements are checked across the whole manifest', () => {
  const mutations: ((app: MiniApp) => void)[] = [
    (app) => { app.capabilities = ['storage']; },
    (app) => { app.capabilities = ['photos']; },
    (app) => { app.capabilities = ['storage', 'storage']; },
    (app) => { app.screens[0].collection = 'missing'; },
    (app) => { app.screens[0].titleField = 'missing'; },
    (app) => { app.screens[0].titleField = 'omslag'; },
    (app) => { app.screens[0].imageField = 'titel'; },
    (app) => { app.screens[0].subtitleField = 'omslag'; },
    (app) => { delete app.screens[0].sortField; },
    (app) => { app.homeScreen = 'missing'; },
    (app) => { app.collections.push(app.collections[0]); },
    (app) => { app.screens.push(app.screens[0]); },
    (app) => { app.collections[0].fields.push(app.collections[0].fields[0]); },
    (app) => { app.collections[0].fields[4].options = ['Lezen', ' Lezen ']; },
    (app) => { app.collections[0].fields[0].options = ['Forbidden']; },
    (app) => { app.theme = { color: 'url(https://evil.example)' }; },
    (app) => { app.collections[0].fields = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({ id: `item-${i}`, label: 'Item', type: 'text' })); },
  ];
  for (const mutation of mutations) { const app = fixture(); mutation(app); assert.throws(() => validateMiniApp(app)); }
});

test('record validation preserves false and zero and omits empty optional values', () => {
  const collection = fixture().collections[0];
  assert.deepEqual(validateRecord(collection, { titel: '  Boek  ', gelezen: false, pagina: 0, status: '', datum: '', omslag: '' }), { titel: 'Boek', gelezen: false, pagina: 0 });
  assert.deepEqual(validateRecord(collection, { titel: 'Boek', datum: '2024-02-29', omslag: 'apphub-photo:123-abc.jpeg' }), { titel: 'Boek', datum: '2024-02-29', omslag: 'apphub-photo:123-abc.jpeg' });
  assert.throws(() => validateRecord(collection, { titel: ' ' }), /verplicht/);
});

test('record validation rejects unknown keys, invalid types, impossible dates, and unsafe photos', () => {
  const collection = fixture().collections[0];
  for (const values of [
    { unexpected: 1 }, { pagina: '12' }, { pagina: Number.NaN }, { pagina: Number.POSITIVE_INFINITY }, { pagina: 1e16 },
    { gelezen: 'false' }, { gelezen: '' }, { status: 'Unknown' }, { datum: '2023-02-29' }, { datum: '2024-04-31' },
    { datum: '2024-00-01' }, { datum: '0000-01-01' }, { datum: '2024-12-00' },
    { omslag: 'https://evil.example/x.jpg' }, { omslag: 'apphub-photo:../other.jpg' }, { omslag: 'file:///secret.jpg' },
    { titel: { nested: 'No' } },
  ]) assert.throws(() => validateRecord(collection, { titel: 'Boek', ...values }));
  assert.throws(() => validateRecord(collection, JSON.parse('{"titel":"Boek","__proto__":{}}')), /onbekend/);
  const fields: Collection = { id: 'long', title: 'Long', fields: Array.from({ length: 8 }, (_, i) => ({ id: `long-${i}`, label: 'Long', type: 'multiline' })) };
  const values = Object.fromEntries(fields.fields.map((field) => [field.id, 'a'.repeat(10_000)]));
  assert.ok(JSON.stringify(values).length > MAX_RECORD_BYTES);
  assert.throws(() => validateRecord(fields, values), /64 KiB/);
});

test('JSON import is entirely offline and ignores any token', async () => {
  const { app, source } = await importMiniApp(JSON.stringify(fixture()), { token: 'anything', fetcher: (() => { throw new Error('Network should not run'); }) as typeof fetch });
  assert.equal(app.id, 'mijn-boeken');
  assert.deepEqual(source, { kind: 'file' });
});

test('GitHub import pins default branch to exact commit before reading native definition', async () => {
  const { fetcher, calls } = githubMock({ branch: 'release/native' });
  const result = await importMiniApp('owner/repo', { fetcher });
  assert.deepEqual(calls.map((call) => call.url), [
    'https://api.github.com/repos/owner/repo',
    'https://api.github.com/repos/owner/repo/commits/release%2Fnative',
    `https://api.github.com/repos/owner/repo/contents/apphub.json?ref=${commit}`,
  ]);
  assert.deepEqual(result.source, { kind: 'github', repository: 'https://github.com/owner/repo', commit });
  assert.equal(result.app.name, 'Mijn boeken 📚');
  for (const call of calls) {
    assert.equal(call.init?.redirect, 'error');
    assert.equal(call.init?.credentials, 'omit');
    assert.ok(call.init?.signal);
    assert.equal((call.init?.headers as Record<string, string>).Authorization, undefined);
  }
});

test('private repository token is sent only in GitHub API headers, never source metadata or URLs', async () => {
  const { fetcher, calls } = githubMock();
  const secret = 'github_pat_SECRET';
  const result = await importMiniApp('https://github.com/owner/repo', { token: secret, fetcher });
  assert.ok(!JSON.stringify(result).includes(secret));
  for (const call of calls) {
    assert.equal(new URL(call.url).host, 'api.github.com');
    assert.ok(!call.url.includes(secret));
    assert.equal((call.init?.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
  }
});

test('arbitrary URLs, credentialed links, subpaths, and invalid tokens fail before networking', async () => {
  for (const input of ['https://evil.example/owner/repo', 'https://github.com.evil.example/owner/repo', 'http://github.com/owner/repo', 'https://user:pass@github.com/owner/repo', 'owner/repo/tree/main', 'owner/..', 'owner/repo?token=x', 'owner/repo#main', 'owner\\repo']) {
    const { fetcher, calls } = githubMock();
    assert.equal(parseGithubRepository(input), null);
    await assert.rejects(importMiniApp(input, { token: 'github_pat_SECRET', fetcher }));
    assert.equal(calls.length, 0);
  }
  const { fetcher, calls } = githubMock();
  await assert.rejects(importMiniApp('owner/repo', { token: 'evil\nheader', fetcher }), /ongeldig formaat/);
  assert.equal(calls.length, 0);
});

test('redirected or replaced response URLs fail without following download_url', async () => {
  const { fetcher, calls } = githubMock({ mutate: (step) => step === 0 ? response({ default_branch: 'main' }, 'https://evil.example/leak') : undefined });
  await assert.rejects(importMiniApp('owner/repo', { token: 'github_pat_SECRET', fetcher }), /stuurde.*door/);
  assert.equal(calls.length, 1);
  const redirected = githubMock({ mutate: (step, url) => {
    if (step !== 0) return undefined;
    const result = response({}, url);
    Object.defineProperty(result, 'redirected', { value: true });
    return result;
  } });
  await assert.rejects(importMiniApp('owner/repo', { fetcher: redirected.fetcher }), /stuurde.*door/);
});

test('GitHub failures have actionable localized errors and do not expose secrets', async () => {
  for (const [status, pattern, headers] of [
    [401, /weigert toegang/, undefined], [403, /weigert toegang/, undefined], [404, /niet gevonden/, undefined],
    [429, /aanvraaglimiet/, undefined], [403, /aanvraaglimiet/, { 'x-ratelimit-remaining': '0' }], [500, /fout 500/, undefined], [301, /stuurde.*door/, undefined],
  ] as const) {
    const mock = githubMock({ mutate: (_, url) => response({}, url, status, headers) });
    await assert.rejects(importMiniApp('owner/repo', { token: 'github_pat_SECRET', fetcher: mock.fetcher }), pattern);
  }
  const missing = githubMock({ mutate: (step, url) => step === 2 ? response({}, url, 404) : undefined });
  await assert.rejects(importMiniApp('owner/repo', { fetcher: missing.fetcher }), /Geen apphub.json/);
});

test('malicious default branches and commit SHAs cannot become API paths', async () => {
  for (const branch of ['../../evil', 'refs/../evil', '/leading', 'branch?token=x', 'bad\\branch', 'foo.lock', 'bad@{0}', '.hidden']) {
    const mock = githubMock({ branch });
    await assert.rejects(importMiniApp('owner/repo', { fetcher: mock.fetcher }), /standaardbranch.*niet geldig/);
    assert.equal(mock.calls.length, 1);
  }
  const mock = githubMock({ mutate: (step, url) => step === 1 ? response({ sha: '../evil?ref=x' }, url) : undefined });
  await assert.rejects(importMiniApp('owner/repo', { fetcher: mock.fetcher }), /commit-id/);
  assert.equal(mock.calls.length, 2);
});

test('malformed, oversized, non-file and corrupt GitHub content are rejected', async () => {
  const file = JSON.stringify(fixture());
  const valid = { type: 'file', path: 'apphub.json', encoding: 'base64', size: Buffer.byteLength(file), content: Buffer.from(file).toString('base64') };
  for (const changed of [
    { type: 'symlink' }, { path: '../apphub.json' }, { encoding: 'none' }, { size: MAX_MANIFEST_BYTES + 1 },
    { size: -1 }, { size: valid.size + 1 }, { content: '!!!=' }, { content: 'AB==' }, { content: '/w==', size: 1 },
  ]) {
    const mock = githubMock({ mutate: (step, url) => step === 2 ? response({ ...valid, ...changed }, url) : undefined });
    await assert.rejects(importMiniApp('owner/repo', { fetcher: mock.fetcher }));
  }
  const oversized = githubMock({ mutate: (_, url) => response({ padding: 'x'.repeat(MAX_GITHUB_RESPONSE_BYTES) }, url) });
  await assert.rejects(importMiniApp('owner/repo', { fetcher: oversized.fetcher }), /te groot/);
  const tooLargeHeader = githubMock({ mutate: (_, url) => response({}, url, 200, { 'content-length': String(MAX_GITHUB_RESPONSE_BYTES + 1) }) });
  await assert.rejects(importMiniApp('owner/repo', { fetcher: tooLargeHeader.fetcher }), /te groot/);
});

test('network requests time out and abort even if a fetcher never settles', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null | undefined;
  const fetcher = ((_url: unknown, options?: RequestInit) => {
    signal = options?.signal;
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;
  const pending = importMiniApp('owner/repo', { fetcher });
  t.mock.timers.tick(IMPORT_TIMEOUT_MS);
  await assert.rejects(pending, /te langzaam/);
  assert.equal(signal?.aborted, true);
});
