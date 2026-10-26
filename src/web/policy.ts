import { normalizePublicUrl, type WebManifest } from './contracts.mjs';

/** Navigation restrictions only: allowedOrigins does NOT filter fetch, images, scripts or frames. */
export function canNavigate(manifest: WebManifest, input: string): boolean {
  if (typeof input !== 'string' || input.length > 4096 || /[\\\s\u0000-\u001f\u007f]/u.test(input)) return false;
  try {
    // Preserve query/hash for application routes, but validate the unnormalized URL path.
    const withoutState = input.split(/[?#]/, 1)[0];
    const clean = normalizePublicUrl(withoutState);
    if (!clean) return false;
    const start = new URL(manifest.startUrl);
    const target = new URL(clean);
    if (target.origin !== start.origin) return false;
    const parts = start.pathname.split('/').filter(Boolean);
    let scope: string;
    if (start.hostname.endsWith('.github.io') && parts.length && !parts[0].includes('.')) {
      scope = `/${parts[0]}/`;
    } else if (start.pathname.endsWith('/')) scope = start.pathname;
    else if (parts.at(-1)?.includes('.')) scope = start.pathname.slice(0, start.pathname.lastIndexOf('/') + 1);
    else scope = `${start.pathname}/`;
    return target.pathname === scope.slice(0, -1) || target.pathname.startsWith(scope);
  } catch { return false; }
}
