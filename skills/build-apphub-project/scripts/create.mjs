import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWebManifest, normalizePublicUrl } from '../assets/contracts.mjs';
import { auditProject } from './audit.mjs';

export async function createProject({ output, id, url, name = id }) {
  if (!/^[a-z][a-z0-9-]{1,47}$/.test(id ?? '')) throw new Error('Gebruik een project-ID van 2–48 kleine letters, cijfers en streepjes.');
  const startUrl = normalizePublicUrl(url);
  if (!startUrl || !new URL(startUrl).pathname.endsWith('/')) throw new Error('Geef een publieke HTTPS-map-URL op die eindigt op /.');
  const target = path.resolve(output);
  try { await fs.lstat(target); throw new Error('Uitvoermap bestaat al. Kies een nieuwe map; bestaande software wordt niet overschreven.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const template = fileURLToPath(new URL('../assets/template/', import.meta.url));
  const source = JSON.parse(await fs.readFile(path.join(template, 'apphub.json'), 'utf8'));
  const manifest = { ...source, id, name, startUrl, allowedOrigins: [new URL(startUrl).origin], privacyUrl: new URL('privacy.html', startUrl).href, supportUrl: new URL('support.html', startUrl).href };
  const checked = validateWebManifest(manifest);
  if (!checked.ok) throw new Error(checked.errors.join('\n'));
  await fs.cp(template, target, { recursive: true, errorOnExist: true, force: false, dereference: false });
  await fs.writeFile(path.join(target, 'apphub.json'), JSON.stringify(checked.value, null, 2) + '\n');
  // Each template project needs its own IndexedDB name even on a shared Pages origin.
  for (const filename of ['app.js', 'storage.js', 'app.mjs', 'storage.mjs', 'domain.mjs']) {
    const file = path.join(target, filename);
    try { const text = await fs.readFile(file, 'utf8'); await fs.writeFile(file, text.replaceAll(source.id, id).replaceAll('notes-template', id).replaceAll('apphub-template', `apphub-${id}`).replaceAll('__APPHUB_ID__', id)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const report = await auditProject(target);
  return { output: target, ...report };
}

export async function createCLI(args = process.argv.slice(2)) {
  if (args.includes('--help')) { console.log('Gebruik: node create-web-project.mjs <nieuwe-map> --id mijn-project --url https://naam.github.io/repository/ [--name "Mijn project"]\nMaakt een lokaal project. Publiceert niets en overschrijft geen bestaande map.'); return 0; }
  const output = args[0], options = {};
  if (!output || output.startsWith('--') || (args.length - 1) % 2 !== 0) { console.error('Ongeldige argumenten. Gebruik --help.'); return 2; }
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index].slice(2);
    if (!['id', 'url', 'name'].includes(key) || !args[index].startsWith('--') || key in options) { console.error('Ongeldige of dubbele optie. Gebruik --help.'); return 2; }
    options[key] = args[index + 1];
  }
  try { const report = await createProject({ output, ...options }); console.log(JSON.stringify(report, null, 2)); return report.technicalPass ? 0 : 1; }
  catch (error) { console.error(error.message); return 1; }
}
