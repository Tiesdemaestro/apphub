import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validatePublishPath, PROJECT_ID } from '../scripts/setup-apphub.mjs';

test('publicatie weigert credentials, traversal en verborgen runtimebestanden', () => {
  for (const path of ['.env', '.env.production', '../secrets', '/tmp/x', 'a/../b', '.git/config', '.expo/state.json', 'credentials.json', 'cert.p12', 'cert.p8', 'a\\b', 'node_modules/a.js']) assert.equal(validatePublishPath(path), false, path);
  for (const path of ['App.tsx', '.github/workflows/pages.yml', 'skills/build-apphub-project/SKILL.md', 'package-lock.json']) assert.equal(validatePublishPath(path), true, path);
});

test('Expo-config gebruikt de opgegeven projectidentiteit', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url)));
  assert.equal(app.expo.extra.eas.projectId, PROJECT_ID);
});

test('TestFlight is ondertekende storebuild; simulator gebruikt geen toestel-signing', () => {
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url)));
  assert.equal(eas.build.testflight.distribution, 'store');
  assert.equal(eas.build.testflight.developmentClient, false);
  assert.equal(eas.build.simulator.ios.simulator, true);
  assert.ok(eas.submit.testflight);
});

test('open publieke release-eisen blokkeren productie maar niet eerste TestFlight-test', () => {
  const script = new URL('../scripts/eas-post-install.mjs', import.meta.url);
  const cwd = new URL('../', import.meta.url);
  const run = profile => spawnSync(process.execPath, [script.pathname], { cwd, env: { ...process.env, EAS_BUILD_PROFILE: profile }, encoding: 'utf8' });
  assert.equal(run('production').status, 1);
  assert.equal(run('testflight').status, 0);
});
