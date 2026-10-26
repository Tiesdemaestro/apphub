import assert from 'node:assert/strict';
import test from 'node:test';
import type { WebManifest } from '../src/web/contracts.mjs';
import { canNavigate } from '../src/web/policy.ts';

const project: WebManifest = {
  schemaVersion: 3, kind: 'web', id: 'my-wardrobe', name: 'Kleding', description: '', version: '1.0.0',
  startUrl: 'https://alice.github.io/wardrobe/index.html', storage: 'local',
  allowedOrigins: ['https://alice.github.io', 'https://cloud-service.com'],
  privacyUrl: 'https://alice.github.io/wardrobe/privacy.html', supportUrl: 'https://alice.github.io/wardrobe/support.html',
  ageRating: '4+', dataCollected: [], permissions: [],
};

test('normal project routes with query and hash remain navigable', () => {
  for (const url of ['https://alice.github.io/wardrobe/', 'https://alice.github.io/wardrobe',
    'https://alice.github.io/wardrobe/index.html', 'https://alice.github.io/wardrobe/outfits?color=red#today']) {
    assert.equal(canNavigate(project, url), true, url);
  }
});
test('declared service origins do not grant top-level navigation outside the project', () => {
  for (const url of ['https://cloud-service.com/', 'https://alice.github.io/other/',
    'https://alice.github.io/wardrobe-evil/', 'https://alice.github.io/',
    'https://evil.com/', 'https://user@alice.github.io/wardrobe/', 'about:blank',
    'javascript:alert(1)', 'file:///secret', 'data:text/html,hello',
    'https://alice.github.io/wardrobe/../other/', 'https://alice.github.io/wardrobe/%2e%2e/other/',
    'https://alice.github.io/wardrobe/%252e%252e/other/', 'https://alice.github.io/wardrobe/%2fother/']) {
    assert.equal(canNavigate(project, url), false, url);
  }
});
test('custom domains follow the start directory and root sites can navigate root paths', () => {
  assert.equal(canNavigate({ ...project, startUrl: 'https://my-app.com/app/' }, 'https://my-app.com/app/settings'), true);
  assert.equal(canNavigate({ ...project, startUrl: 'https://my-app.com/app/' }, 'https://my-app.com/other'), false);
  assert.equal(canNavigate({ ...project, startUrl: 'https://my-app.com/' }, 'https://my-app.com/settings'), true);
});
