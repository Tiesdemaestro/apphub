import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseMiniApp, validateRecord } from '../src/runtime/schema.ts';

const files = [
  ['boeken', '../examples/native/boeken.json'],
  ['taken', '../examples/native/taken.json'],
  ['kleding', '../examples/native/kleding.json'],
  ['template', '../templates/native-app/apphub.json'],
] as const;

test('every delivered example and template imports and accepts a realistic first record', () => {
  const examples = files.map(([name, file]) => ({ name, app: parseMiniApp(readFileSync(new URL(file, import.meta.url), 'utf8')) }));
  assert.equal(new Set(examples.map(({ app }) => app.id)).size, examples.length);
  const values: Record<string, Record<string, string | number | boolean>> = {
    boeken: { titel: 'The Name of the Wind', auteur: 'Patrick Rothfuss', leesstatus: 'Uitgelezen', favoriet: true, 'uitgelezen-op': '2026-10-06', beoordeling: '5 / 5' },
    taken: { titel: 'AppHub op mijn iPhone testen', gebied: 'Persoonlijk', prioriteit: '1 · Hoog', deadline: '2026-10-20', duur: 30, klaar: false },
    kleding: { naam: 'Blauwe trui', categorie: 'Bovenstuk', kleur: 'Blauw', foto: 'apphub-photo:blauwe-trui.jpg', prijs: 49.95 },
    template: { naam: 'Familiefoto uit Woudsend', categorie: 'Herinneringen', aantal: 1, favoriet: true },
  };
  for (const { name, app } of examples) {
    assert.deepEqual(validateRecord(app.collections[0], values[name]), values[name]);
  }
  const wardrobe = examples.find(example => example.name === 'kleding')!.app;
  assert.deepEqual(validateRecord(wardrobe.collections[1], {
    naam: 'Vrijdagavond', gelegenheid: 'Uitgaan', combinatie: 'Blauwe trui, zwarte broek en witte sneakers.',
  }), { naam: 'Vrijdagavond', gelegenheid: 'Uitgaan', combinatie: 'Blauwe trui, zwarte broek en witte sneakers.' });
});

test('project checker returns useful exit codes for valid, unsafe and missing input', () => {
  const checker = fileURLToPath(new URL('../scripts/check-native-project.mjs', import.meta.url));
  const validPath = fileURLToPath(new URL('../examples/native/boeken.json', import.meta.url));
  const valid = spawnSync(process.execPath, [checker, validPath], { encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /Geldige native app: Mijn boeken/);
  const noInput = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  assert.equal(noInput.status, 2);
  assert.match(noInput.stderr, /Gebruik:/);

  const temporary = mkdtempSync(join(tmpdir(), 'apphub-example-check-'));
  try {
    const unsafe = JSON.parse(readFileSync(validPath, 'utf8'));
    unsafe.script = 'alert("code")';
    const unsafePath = join(temporary, 'apphub.json');
    writeFileSync(unsafePath, JSON.stringify(unsafe));
    const rejected = spawnSync(process.execPath, [checker, unsafePath], { encoding: 'utf8' });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /onbekend of onveilig veld/i);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
