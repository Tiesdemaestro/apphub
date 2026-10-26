import assert from 'node:assert/strict';
import test from 'node:test';
import { importWebProject } from '../src/web/importer.ts';

const manifest = {
  schemaVersion: 3, kind: 'web', id: 'my-wardrobe', name: 'Kleding', description: '', version: '1.0.0',
  startUrl: 'https://alice.github.io/wardrobe/', storage: 'local', allowedOrigins: ['https://alice.github.io'],
  privacyUrl: 'https://alice.github.io/wardrobe/privacy.html', supportUrl: 'https://alice.github.io/wardrobe/support.html',
  ageRating: '4+', dataCollected: [], permissions: [],
};
function fakeFetch(responses: Response[], requests: Array<{ url: string; options?: RequestInit }> = []): typeof fetch {
  return (async (url: string | URL | Request, options?: RequestInit) => {
    requests.push({ url: String(url), options });
    const response = responses.shift();
    if (!response) throw Error('Unexpected request');
    return response;
  }) as typeof fetch;
}
const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

test('pasted manifests are checked without network access', async () => {
  assert.deepEqual(await importWebProject(JSON.stringify(manifest), fakeFetch([])), manifest);
  await assert.rejects(importWebProject(JSON.stringify({ ...manifest, permissions: ['contacts'] }), fakeFetch([])), /permissions/);
});

test('GitHub resolves default branch without sending credentials or following redirects', async () => {
  const requests: Array<{ url: string; options?: RequestInit }> = [];
  const result = await importWebProject('alice/wardrobe', fakeFetch([
    jsonResponse({ default_branch: 'release/web' }), jsonResponse(manifest),
  ], requests));
  assert.deepEqual(result, manifest);
  assert.deepEqual(requests.map((request) => request.url), [
    'https://api.github.com/repos/alice/wardrobe',
    'https://raw.githubusercontent.com/alice/wardrobe/release/web/apphub.json',
  ]);
  for (const request of requests) {
    assert.equal(request.options?.credentials, 'omit');
    assert.equal(request.options?.redirect, 'error');
    assert.equal((request.options?.headers as Record<string, string>)?.Authorization, undefined);
  }
});

test('Pages directory, index and manifest URLs resolve to apphub.json', async () => {
  for (const input of ['https://alice.github.io/wardrobe', 'https://alice.github.io/wardrobe/',
    'https://alice.github.io/wardrobe/index.html', 'https://alice.github.io/wardrobe/apphub.json']) {
    const requests: Array<{ url: string }> = [];
    await importWebProject(input, fakeFetch([jsonResponse(manifest)], requests));
    assert.equal(requests[0].url, 'https://alice.github.io/wardrobe/apphub.json');
  }
});

test('direct manifests cannot redirect startUrl to another origin or another project directory', async () => {
  for (const change of [
    { startUrl: 'https://evil.com/', allowedOrigins: ['https://evil.com'] },
    { startUrl: 'https://alice.github.io/other/' },
  ]) {
    await assert.rejects(importWebProject('https://alice.github.io/wardrobe/', fakeFetch([jsonResponse({ ...manifest, ...change })])), /dezelfde origin/);
  }
});

test('unsafe inputs and branch traversal never generate raw content requests', async () => {
  for (const input of ['http://alice.github.io/wardrobe/', 'https://localhost/apphub.json',
    'https://127.0.0.1/apphub.json', 'https://user:pass@my-app.com/apphub.json',
    'https://github.com/alice/wardrobe/tree/main']) {
    await assert.rejects(importWebProject(input, fakeFetch([])));
  }
  for (const branch of ['../secret', '/main', 'main\\x', 'x/../main', 'x%20y?token=1']) {
    await assert.rejects(importWebProject('alice/wardrobe', fakeFetch([jsonResponse({ default_branch: branch })])), /standaardbranch/);
  }
});

test('HTTP failures, redirects, and oversized responses are reported', async () => {
  for (const [response, pattern] of [
    [new Response('', { status: 404 }), /niet gevonden/],
    [new Response('', { status: 403 }), /Geen toegang/],
    [new Response('', { status: 429 }), /aanvraaglimiet/],
    [new Response('', { status: 302, headers: { location: 'https://evil.com' } }), /Doorverwijzingen/],
    [new Response('x', { headers: { 'content-length': '999999' } }), /te groot/],
    [new Response('x'.repeat(32769)), /te groot/],
  ] as const) await assert.rejects(importWebProject('https://alice.github.io/wardrobe/', fakeFetch([response])), pattern);
});

test('timeouts cover stalled response bodies and abort requests', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal: AbortSignal | null | undefined;
  const fetcher = (async (_url: unknown, options?: RequestInit) => {
    requestSignal = options?.signal;
    return { ok: true, status: 200, headers: new Headers(), text: () => new Promise(() => {}) } as unknown as Response;
  }) as typeof fetch;
  const pending = importWebProject('https://alice.github.io/wardrobe/', fetcher);
  const assertion = assert.rejects(pending, /duurt te lang/);
  await Promise.resolve();
  context.mock.timers.tick(12_001);
  await assertion;
  assert.equal(requestSignal?.aborted, true);
});
