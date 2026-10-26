#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { MAX_MANIFEST_BYTES, parseMiniApp } from '../src/runtime/schema.ts';

const [file, ...extra] = process.argv.slice(2);
if (!file || extra.length) {
  console.error('Gebruik: npm run check:project -- pad/naar/apphub.json');
  process.exitCode = 2;
} else {
  try {
    const information = await stat(file);
    if (!information.isFile()) throw new Error('Het pad is geen bestand.');
    if (information.size > MAX_MANIFEST_BYTES) throw new Error('Het projectbestand is groter dan 128 KiB.');
    const app = parseMiniApp(await readFile(file, 'utf8'));
    console.log(`Geldige native app: ${app.name} (${app.id}), versie ${app.version}.`);
    console.log(`${app.collections.length} collectie(s), ${app.screens.length} scherm(en), runtime ${app.runtimeVersion}.`);
    console.log('Plaats dit bestand als apphub.json in de hoofdmap van je GitHub-repository, of importeer het bestand in AppHub.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Het projectbestand kon niet worden gelezen.');
    process.exitCode = 1;
  }
}
