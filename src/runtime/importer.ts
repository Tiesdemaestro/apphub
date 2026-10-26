import { MAX_MANIFEST_BYTES, parseMiniApp, utf8ByteLength, type MiniApp } from './schema.ts';

export const IMPORT_TIMEOUT_MS = 12_000;
export const MAX_GITHUB_RESPONSE_BYTES = 256 * 1024;
export interface ProjectSource { kind: 'github' | 'file'; repository?: string; commit?: string }
export interface ImportOptions { token?: string; fetcher?: typeof fetch }
export interface ImportedMiniApp { app: MiniApp; source: ProjectSource }

export function parseGithubRepository(input: string): { owner: string; repo: string; url: string } | null {
  if (typeof input !== 'string' || input.length > 512) return null;
  const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})\/?$/.exec(input.trim());
  if (!match || match[1].includes('--') || match[2] === '.' || match[2] === '..') return null;
  return { owner: match[1], repo: match[2], url: `https://github.com/${match[1]}/${match[2]}` };
}

async function limitedText(response: Response): Promise<string> {
  const lengthHeader = response.headers.get('content-length');
  if (lengthHeader && /^\d+$/.test(lengthHeader) && Number(lengthHeader) > MAX_GITHUB_RESPONSE_BYTES) throw new Error('Het antwoord van GitHub is te groot.');
  // Streaming-capable clients stop at the limit; native fetch falls back to a
  // post-read limit because it does not expose a ReadableStream on every device.
  if (response.body?.getReader && typeof TextDecoder !== 'undefined') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let count = 0, text = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        count += chunk.value.byteLength;
        if (count > MAX_GITHUB_RESPONSE_BYTES) throw new Error('Het antwoord van GitHub is te groot.');
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text + decoder.decode();
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      throw error;
    } finally { reader.releaseLock(); }
  }
  const text = await response.text();
  if (utf8ByteLength(text) > MAX_GITHUB_RESPONSE_BYTES) throw new Error('Het antwoord van GitHub is te groot.');
  return text;
}

function dataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GitHub gaf ongeldige projectgegevens terug.');
  return value as Record<string, unknown>;
}

async function githubJSON(url: string, token: string | undefined, fetcher: typeof fetch, purpose: 'repository' | 'commit' | 'manifest'): Promise<Record<string, unknown>> {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.host !== 'api.github.com' || target.username || target.password) throw new Error('Deze projectbron is niet toegestaan.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      reject(new Error('GitHub reageert te langzaam. Probeer opnieuw.'));
    }, IMPORT_TIMEOUT_MS);
  });
  const request = async (): Promise<Record<string, unknown>> => {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetcher(url, { signal: controller.signal, credentials: 'omit', redirect: 'error', headers });
    if (response.redirected || (response.url && response.url !== url)) throw new Error('GitHub stuurde de aanvraag door. Gebruik de actuele repositorynaam.');
    if (response.status >= 300 && response.status < 400) throw new Error('GitHub stuurde de aanvraag door. Gebruik de actuele repositorynaam.');
    if (response.status === 404) {
      throw new Error(purpose === 'manifest' ? 'Geen apphub.json gevonden in de hoofdmap van dit project.'
        : purpose === 'commit' ? 'De standaardbranch bevat nog geen leesbare commit.'
          : 'Project niet gevonden. Controleer de naam en gebruik voor een privéproject een GitHub-token met leestoegang.');
    }
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new Error('De GitHub-aanvraaglimiet is bereikt. Probeer later opnieuw.');
    if (response.status === 401 || response.status === 403) throw new Error('GitHub weigert toegang. Controleer je token en de leestoegang tot deze repository.');
    if (!response.ok) throw new Error(`GitHub gaf fout ${response.status}. Probeer later opnieuw.`);
    const body = await limitedText(response);
    let decoded: unknown;
    try { decoded = JSON.parse(body); } catch { throw new Error('GitHub gaf ongeldige JSON terug.'); }
    return dataObject(decoded);
  };
  try {
    return await Promise.race([request(), deadline]);
  } catch (error) {
    controller.abort();
    if (expired) throw new Error('GitHub reageert te langzaam. Probeer opnieuw.');
    if (error instanceof TypeError) throw new Error('GitHub is niet bereikbaar. Controleer je internetverbinding en de repositorynaam.');
    throw error instanceof Error ? error : new Error('Het project kon niet worden opgehaald.');
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

function branchName(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 255 || /[\s\u0000-\u001f\u007f~^:?*\[\\]/.test(value)
      || value.includes('..') || value.includes('@{') || value === '@'
      || value.split('/').some((part) => !part || part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock'))) {
    throw new Error('De standaardbranch van dit project is niet geldig.');
  }
  return value;
}

/** Portable strict base64 + UTF-8 decoding, without browser atob or Node Buffer. */
function decodeManifest(value: unknown): string {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_MANIFEST_BYTES / 3) * 4 + 10_000) throw new Error('Het projectbestand is groter dan 128 KiB of heeft een ongeldig formaat.');
  const base64 = value.replace(/[\r\n]/g, '');
  if (!base64.length || base64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('GitHub gaf een ongeldig gecodeerd projectbestand terug.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  for (let index = 0; index < base64.length; index += 4) {
    const a = alphabet.indexOf(base64[index]), b = alphabet.indexOf(base64[index + 1]);
    const c = alphabet.indexOf(base64[index + 2]), d = alphabet.indexOf(base64[index + 3]);
    if ((c < 0 && (b & 15)) || (d < 0 && c >= 0 && (c & 3))) throw new Error('GitHub gaf een ongeldig gecodeerd projectbestand terug.');
    bytes.push((a << 2) | (b >> 4));
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) bytes.push(((c & 3) << 6) | d);
    if (bytes.length > MAX_MANIFEST_BYTES) throw new Error('Het projectbestand is groter dan 128 KiB.');
  }
  try { return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('')); }
  catch { throw new Error('Het projectbestand moet UTF-8-tekst bevatten.'); }
}

/** Imports data only. PATs are transient and are never included in returned source metadata. */
export async function importMiniApp(input: string, options: ImportOptions = {}): Promise<ImportedMiniApp> {
  if (typeof input !== 'string') throw new Error('Plak een GitHub-project of de inhoud van apphub.json.');
  const trimmed = input.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return { app: parseMiniApp(input), source: { kind: 'file' } };
  const repository = parseGithubRepository(trimmed);
  if (!repository) throw new Error('Gebruik eigenaar/project, een https://github.com/eigenaar/project-URL of de inhoud van apphub.json.');
  const token = options.token?.trim();
  if (token && (token.length > 255 || !/^[A-Za-z0-9_]+$/.test(token))) throw new Error('Dit GitHub-token heeft een ongeldig formaat.');
  const fetcher = options.fetcher ?? fetch;
  const api = `https://api.github.com/repos/${repository.owner}/${repository.repo}`;
  const metadata = await githubJSON(api, token, fetcher, 'repository');
  const branch = branchName(metadata.default_branch);
  const head = await githubJSON(`${api}/commits/${encodeURIComponent(branch)}`, token, fetcher, 'commit');
  if (typeof head.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(head.sha)) throw new Error('GitHub gaf geen geldige commit-id terug.');
  const commit = head.sha.toLowerCase();
  const manifest = await githubJSON(`${api}/contents/apphub.json?ref=${commit}`, token, fetcher, 'manifest');
  if (manifest.type !== 'file' || manifest.encoding !== 'base64' || manifest.path !== 'apphub.json'
      || typeof manifest.size !== 'number' || !Number.isSafeInteger(manifest.size) || manifest.size < 1) throw new Error('apphub.json moet een regulier UTF-8 JSON-bestand in de hoofdmap zijn.');
  if (manifest.size > MAX_MANIFEST_BYTES) throw new Error('Het projectbestand is groter dan 128 KiB.');
  const manifestText = decodeManifest(manifest.content);
  if (utf8ByteLength(manifestText) !== manifest.size) throw new Error('De grootte van apphub.json komt niet overeen met de GitHub-gegevens.');
  return { app: parseMiniApp(manifestText), source: { kind: 'github', repository: repository.url, commit } };
}
