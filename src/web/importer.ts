import { MAX_WEB_MANIFEST_BYTES, normalizePublicUrl, parseWebManifest, utf8ByteLength, type WebManifest } from './contracts.mjs';

export const WEB_IMPORT_TIMEOUT_MS = 12_000;
const REPOSITORY_LIMIT = 64 * 1024;

function repositoryName(input: string): { owner: string; repo: string } | null {
  const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})\/?$/.exec(input);
  if (!match || match[1].includes('--') || ['.', '..'].includes(match[2])) return null;
  return { owner: match[1], repo: match[2] };
}

async function boundedText(response: Response, maximum: number): Promise<string> {
  const length = response.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > maximum) throw new Error('Het projectbestand of antwoord is te groot.');
  // Standard native fetch may already buffer data before this check. This is an
  // acceptance limit, not a guaranteed network-memory cap on every native runtime.
  if (response.body?.getReader && typeof TextDecoder !== 'undefined') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0, result = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maximum) throw new Error('Het projectbestand of antwoord is te groot.');
        result += decoder.decode(chunk.value, { stream: true });
      }
      return result + decoder.decode();
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      throw error;
    } finally { reader.releaseLock(); }
  }
  const text = await response.text();
  if (utf8ByteLength(text) > maximum) throw new Error('Het projectbestand of antwoord is te groot.');
  return text;
}

async function getText(url: string, maximum: number, fetcher: typeof fetch): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true; controller.abort();
      reject(new Error('Het ophalen duurt te lang. Probeer opnieuw.'));
    }, WEB_IMPORT_TIMEOUT_MS);
  });
  const request = async () => {
    const response = await fetcher(url, {
      credentials: 'omit', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (response.redirected || (response.url && new URL(response.url).href !== url)
        || (response.status >= 300 && response.status < 400)) throw new Error('Doorverwijzingen zijn niet toegestaan. Gebruik de definitieve project-URL.');
    if (response.status === 404) throw new Error('Project of apphub.json niet gevonden. Gebruik een openbaar project en plaats apphub.json in de projectmap.');
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new Error('De aanvraaglimiet is bereikt. Probeer later opnieuw.');
    if (response.status === 401 || response.status === 403) throw new Error('Geen toegang. Webprojecten moeten voorlopig openbaar bereikbaar zijn.');
    if (!response.ok) throw new Error(`Ophalen mislukt (HTTP ${response.status}). Probeer later opnieuw.`);
    return boundedText(response, maximum);
  };
  try { return await Promise.race([request(), deadline]); }
  catch (error) {
    controller.abort();
    if (expired) throw new Error('Het ophalen duurt te lang. Probeer opnieuw.');
    if (error instanceof TypeError) throw new Error('Het project is niet bereikbaar. Controleer de URL en internetverbinding.');
    throw error instanceof Error ? error : new Error('Het project kon niet worden opgehaald.');
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

function checked(text: string): WebManifest {
  const result = parseWebManifest(text);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.value;
}

/** Fetches metadata only. Remote web content remains live and is not certified or pinned by this import. */
export async function importWebProject(input: string, fetcher: typeof fetch = fetch): Promise<WebManifest> {
  if (typeof input !== 'string') throw new Error('Plak een project-URL, GitHub-repository of apphub.json.');
  const value = input.trim();
  if (value.startsWith('{') || value.startsWith('[')) return checked(input);
  const repository = repositoryName(value);
  if (repository) {
    const text = await getText(`https://api.github.com/repos/${repository.owner}/${repository.repo}`, REPOSITORY_LIMIT, fetcher);
    let metadata: unknown;
    try { metadata = JSON.parse(text); } catch { throw new Error('GitHub gaf ongeldige projectgegevens terug.'); }
    const branch = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).default_branch : undefined;
    if (typeof branch !== 'string' || !branch || branch.length > 255
        || /[\\\s\u0000-\u001f\u007f~^:?*\[]/.test(branch)
        || branch.includes('..') || branch.includes('@{')
        || branch.split('/').some((segment) => !segment || segment.startsWith('.') || segment.endsWith('.') || segment.endsWith('.lock'))) {
      throw new Error('De standaardbranch van dit project is ongeldig.');
    }
    const ref = branch.split('/').map(encodeURIComponent).join('/');
    return checked(await getText(`https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${ref}/apphub.json`, MAX_WEB_MANIFEST_BYTES, fetcher));
  }
  const normalized = normalizePublicUrl(value);
  if (!normalized) throw new Error('Gebruik een publieke HTTPS-projectlink, eigenaar/repository of de inhoud van apphub.json.');
  const target = new URL(normalized);
  if (target.hostname === 'github.com') throw new Error('Gebruik voor GitHub alleen https://github.com/eigenaar/repository.');
  if (!target.pathname.endsWith('/apphub.json')) {
    if (/\.[a-z0-9]+$/i.test(target.pathname)) target.pathname = target.pathname.slice(0, target.pathname.lastIndexOf('/') + 1);
    else if (!target.pathname.endsWith('/')) target.pathname += '/';
    target.pathname += 'apphub.json';
  }
  const manifest = checked(await getText(target.href, MAX_WEB_MANIFEST_BYTES, fetcher));
  const start = new URL(manifest.startUrl);
  const directory = target.pathname.slice(0, target.pathname.lastIndexOf('/') + 1);
  if (start.origin !== target.origin || !(start.pathname.startsWith(directory) || start.pathname === directory.slice(0, -1))) {
    throw new Error('startUrl moet op dezelfde origin en binnen de map van apphub.json staan.');
  }
  return manifest;
}
