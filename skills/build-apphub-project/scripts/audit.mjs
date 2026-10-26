import fs from 'node:fs/promises';
import path from 'node:path';
import { parseWebManifest } from '../assets/contracts.mjs';

const ignored = new Set(['node_modules', '.git', '.expo', 'tests']);
const contentExtensions = new Set(['.html', '.js', '.mjs', '.css']);
const placeholder = /YOUR-ACCOUNT|YOUR-REPO|your-account|your-repo|example\.com|TODO|VUL[_ -]?IN/;

/** Static evidence, never proof of behavioral safety or Apple approval. */
export async function auditProject(directory) {
  const report = { technicalPass: false, reviewRequired: true, errors: [], warnings: [], checks: [] };
  const error = (message) => report.errors.push(message);
  const warn = (message) => report.warnings.push(message);
  const root = path.resolve(directory);
  const files = [];
  let bytes = 0;
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const relative = path.relative(root, file);
      if (entry.isSymbolicLink()) { error(`Symlink niet toegestaan in distributiemap: ${relative}`); continue; }
      if (/^\.env(?:\.|$)/.test(entry.name) || /\.(p12|pem|key|mobileprovision)$/.test(entry.name)) {
        error(`Mogelijk geheim bestand: ${relative}`); continue;
      }
      if (ignored.has(entry.name)) continue;
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(file);
      bytes += stat.size;
      if (files.length >= 1000 || bytes > 50_000_000) throw new Error('Distributiemap overschrijdt 1000 bestanden of 50 MB.');
      if (stat.size > 10_000_000) error(`Bestand groter dan 10 MB: ${relative}`);
      files.push({ file, relative, size: stat.size });
    }
  }
  let manifest;
  try {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Geef een gewone projectmap op.');
    await walk(root);
    const manifestFile = files.find(({ relative }) => relative === 'apphub.json');
    if (!manifestFile) throw new Error('apphub.json ontbreekt in de distributiemap.');
    if (manifestFile.size > 32768) throw new Error('apphub.json is groter dan 32 KiB.');
    const raw = await fs.readFile(manifestFile.file, 'utf8');
    const parsed = parseWebManifest(raw);
    if (!parsed.ok) parsed.errors.forEach(error);
    else { manifest = parsed.value; report.checks.push('Manifest voldoet aan AppHub-schema v3.'); }
    if (placeholder.test(raw)) warn('Manifest bevat voorbeeldwaarden; vul definitieve publicatie-URLs in.');
  } catch (caught) { error(caught.message); }

  const names = new Set(files.map(({ relative }) => relative.split(path.sep).join('/')));
  if (!names.has('index.html')) error('index.html ontbreekt. Controleer de gebouwde uitvoermap, niet alleen de broncode.');
  const sources = [];
  for (const record of files) {
    if (!contentExtensions.has(path.extname(record.file)) || record.size > 10_000_000) continue;
    const text = await fs.readFile(record.file, 'utf8');
    sources.push(text);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bsk_(?:live|test)_[A-Za-z0-9]{16,}|["']role["']\s*:\s*["']service_role["']/.test(text)) error(`${record.relative}: vermoedelijk accountgeheim of servicesleutel.`);
    if (/ReactNativeWebView|webkit\s*\.\s*messageHandlers|NativeModules|TurboModuleRegistry/.test(text)) error(`${record.relative}: directe native bridge niet toegestaan in dit profiel.`);
    if (/\beval\s*\(|\bnew\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'`]/.test(text)) error(`${record.relative}: dynamische code-evaluatie gevonden; verwijder deze.`);
    if (/(?:href|src|action)\s*=\s*["']\s*(?:javascript:|file:|http:)/i.test(text)) error(`${record.relative}: onveilig protocol in een HTML-verwijzing.`);
    if (/fetch\s*\(\s*["']http:|WebSocket\s*\(\s*["']ws:/i.test(text)) error(`${record.relative}: onversleuteld netwerkverkeer.`);
    if (path.extname(record.file) === '.html') {
      if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(text)) warn(`${record.relative}: viewport-instelling niet gevonden.`);
      const metas = text.match(/<meta\b[^>]*>/gi) ?? [];
      const csp = metas.find((tag) => /http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag));
      if (!csp) error(`${record.relative}: Content-Security-Policy ontbreekt.`);
      else {
        const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(csp)?.[2] ?? '';
        if (!/default-src\s/.test(content) || !/base-uri\s+'none'/.test(content) || !/object-src\s+'none'/.test(content)) error(`${record.relative}: CSP vereist default-src, base-uri 'none' en object-src 'none'.`);
        if (/unsafe-eval/.test(content)) error(`${record.relative}: CSP staat unsafe-eval toe.`);
        if (/script-src[^;]*(?:unsafe-inline|\*)/.test(content)) warn(`${record.relative}: script-CSP is ruim; beoordeel inline of externe scripts.`);
      }
      if (/<input\b/i.test(text) && !/<label\b|aria-label=/i.test(text)) warn(`${record.relative}: labels voor invoervelden niet gevonden.`);
      for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
        const ref = match[1];
        if (/^(?:https:|data:|blob:|#|mailto:|tel:)/i.test(ref)) continue;
        if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) { error(`${record.relative}: niet ondersteund URL-schema.`); continue; }
        const pathname = ref.split(/[?#]/)[0];
        if (!pathname) continue;
        let decoded;
        try { decoded = decodeURIComponent(pathname); } catch { error(`${record.relative}: ongeldige bestandsverwijzing.`); continue; }
        if (decoded.startsWith('/')) { warn(`${record.relative}: absoluut pad ${decoded} kan mislukken onder een GitHub Pages-projectpad.`); continue; }
        const local = path.resolve(path.dirname(record.file), decoded);
        if (local !== root && !local.startsWith(root + path.sep)) { error(`${record.relative}: verwijzing buiten de distributiemap.`); continue; }
        const relative = path.relative(root, local).split(path.sep).join('/') || 'index.html';
        if (!names.has(relative) && !names.has(relative.replace(/\/$/, '') + '/index.html')) error(`${record.relative}: lokaal bestand ontbreekt: ${relative}`);
      }
    }
  }
  if (manifest) {
    for (const [label, value] of [['privacyUrl', manifest.privacyUrl], ['supportUrl', manifest.supportUrl]]) {
      const url = new URL(value); const base = new URL('.', manifest.startUrl);
      if (url.origin === base.origin && url.pathname.startsWith(base.pathname)) {
        const relative = decodeURIComponent(url.pathname.slice(base.pathname.length));
        if (!names.has(relative) && !names.has(relative.replace(/\/$/, '') + '/index.html')) error(`${label}: bijbehorend lokaal document ontbreekt: ${relative}`);
      } else warn(`${label}: externe URL moet vóór publicatie handmatig worden geopend en gecontroleerd.`);
    }
    const combined = sources.join('\n');
    if (manifest.storage === 'local' && /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\s*\(/.test(combined)) warn('Lokaal opslagprofiel bevat netwerkcode. Controleer dat dit klopt met privacytekst en dataCollected.');
    if (manifest.storage !== 'local') warn('Cloudprofiel: test authenticatie, eigenaarschap/RLS, verwijdering, offlinegedrag en gegevensdeling met twee accounts.');
    if (/https:\/\/[A-Za-z0-9]/.test(combined)) warn('Controleer alle externe hosts en subresources. allowedOrigins in het manifest is geen netwerkfirewall.');
  }
  report.checks.push(`${files.length} bestanden statisch onderzocht; geen projectcode uitgevoerd.`);
  warn('Statische controles ontdekken niet alle verborgen, dynamische of kwaadaardige code. Voer gedrags- en toesteltests uit.');
  warn('Apple-review blijft vereist: dit rapport is geen beveiligingscertificaat of App Store-goedkeuring.');
  report.errors = [...new Set(report.errors)]; report.warnings = [...new Set(report.warnings)];
  report.technicalPass = report.errors.length === 0;
  return report;
}

export async function auditCLI(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Gebruik: node check-web-project.mjs <gebouwde-projectmap> [--json]\nControleert lokale bestanden. Exit 0: technische checks geslaagd; 1: fouten; 2: verkeerd gebruik. Apple-review blijft vereist.'); return 0;
  }
  if (args.filter((arg) => arg !== '--json').length !== 1 || args.some((arg) => arg.startsWith('--') && arg !== '--json')) { console.error('Geef één distributiemap op. Gebruik --help.'); return 2; }
  const report = await auditProject(args.find((arg) => arg !== '--json'));
  console.log(JSON.stringify(report, null, 2));
  return report.technicalPass ? 0 : 1;
}
