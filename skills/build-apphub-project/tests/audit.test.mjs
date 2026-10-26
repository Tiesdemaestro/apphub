import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditProject, auditCLI } from '../scripts/audit.mjs';
import { createProject } from '../scripts/create.mjs';

const manifest = {
  schemaVersion: 3, kind: 'web', id: 'test-project', name: 'Test', description: 'Een testproject', version: '1.0.0',
  startUrl: 'https://tester.github.io/project/', storage: 'local', allowedOrigins: ['https://tester.github.io'],
  privacyUrl: 'https://tester.github.io/project/privacy.html', supportUrl: 'https://tester.github.io/project/support.html',
  ageRating: '4+', dataCollected: [], permissions: [],
};
const head = '<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; object-src \'none\'; base-uri \'none\'; connect-src \'none\'">';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apphub-audit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'apphub.json'), JSON.stringify(manifest));
  for (const file of ['index.html', 'privacy.html', 'support.html']) await fs.writeFile(path.join(root, file), `<!doctype html><html><head>${head}</head><body><h1>Test</h1></body></html>`);
  return root;
}

test('valid static project passes technical checks but retains manual review', async (t) => {
  const report = await auditProject(await fixture(t));
  assert.equal(report.technicalPass, true);
  assert.equal(report.reviewRequired, true);
  assert.equal(report.errors.length, 0);
  assert.ok(report.warnings.some((warning) => warning.includes('geen beveiligingscertificaat')));
});
test('invalid manifest, absent support page and insecure CSP prevent technical pass', async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'apphub.json'), JSON.stringify({ ...manifest, permissions: ['photos'] }));
  assert.equal((await auditProject(root)).technicalPass, false);
  await fs.writeFile(path.join(root, 'apphub.json'), JSON.stringify(manifest));
  await fs.rm(path.join(root, 'support.html'));
  await fs.writeFile(path.join(root, 'index.html'), '<h1>Geen CSP</h1>');
  const result = await auditProject(root);
  assert.ok(result.errors.some((e) => e.includes('supportUrl')));
  assert.ok(result.errors.some((e) => e.includes('Content-Security-Policy')));
});
test('unsafe code patterns and secret files are flagged without executing code', async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'bad.js'), 'window.ReactNativeWebView.postMessage("x"); eval("throw Error()");');
  await fs.writeFile(path.join(root, '.env'), 'SECRET=not-a-real-secret');
  const result = await auditProject(root);
  assert.equal(result.technicalPass, false);
  assert.ok(result.errors.some((e) => e.includes('native bridge')));
  assert.ok(result.errors.some((e) => e.includes('code-evaluatie')));
  assert.ok(result.errors.some((e) => e.includes('.env')));
});
test('missing relative asset and symlink prevent incomplete or escaped distributions', async (t) => {
  const root = await fixture(t);
  await fs.appendFile(path.join(root, 'index.html'), '<script src="missing.js"></script>');
  await fs.symlink(os.tmpdir(), path.join(root, 'outside'));
  const result = await auditProject(root);
  assert.ok(result.errors.some((e) => e.includes('missing.js')));
  assert.ok(result.errors.some((e) => e.includes('Symlink')));
});
test('cloud profile always calls for authorization and two-account review', async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'apphub.json'), JSON.stringify({ ...manifest, storage: 'cloud', dataCollected: ['Notities'] }));
  const result = await auditProject(root);
  assert.equal(result.technicalPass, true);
  assert.ok(result.warnings.some((e) => e.includes('twee accounts')));
});
test('scaffolding refuses existing directories instead of overwriting user code', async (t) => {
  const root = await fixture(t);
  await assert.rejects(createProject({ output: root, id: 'test-project', url: manifest.startUrl }), /bestaat al/);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'apphub.json'))).name, 'Test');
});
test('scaffolding rejects private and malformed URLs before creating any files', async (t) => {
  const root = await fixture(t);
  for (const url of ['http://localhost/', 'https://127.0.0.1/', 'https://example.com/no-slash']) {
    await assert.rejects(createProject({ output: path.join(root, 'new'), id: 'test-project', url }));
  }
  await assert.rejects(fs.stat(path.join(root, 'new')), { code: 'ENOENT' });
});

test('real scaffold produces valid distributable project and unique storage identity', async (t) => {
  const root = await fixture(t);
  const target = path.join(root, 'new-project');
  const result = await createProject({ output: target, id: 'mijn-boeken', name: 'Mijn boeken', url: 'https://tester.github.io/boeken/' });
  assert.equal(result.technicalPass, true, result.errors.join('\n'));
  assert.equal(result.reviewRequired, true);
  const generated = JSON.parse(await fs.readFile(path.join(target, 'apphub.json')));
  assert.equal(generated.id, 'mijn-boeken');
  assert.equal(generated.privacyUrl, 'https://tester.github.io/boeken/privacy.html');
  const domain = await fs.readFile(path.join(target, 'domain.mjs'), 'utf8');
  assert.match(domain, /PROJECT_ID\s*=\s*['"]mijn-boeken['"]/);
  assert.doesNotMatch(domain, /notes-template/);
  assert.ok((await auditProject(target)).technicalPass);
});
