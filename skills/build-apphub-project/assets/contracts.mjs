export const MAX_WEB_MANIFEST_BYTES = 32 * 1024;
export const WEB_SCHEMA_VERSION = 3;

export function utf8ByteLength(text) {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Syntax restrictions only. DNS resolution is not checked and this is not an SSRF boundary. */
export function normalizePublicUrl(input) {
  if (typeof input !== 'string' || input.length > 2048 || input !== input.trim()
      || /[\\\s\u0000-\u001f\u007f]/u.test(input) || !input.startsWith('https://')) return null;
  try {
    // Reject traversal before URL() silently normalizes it, including encoded delimiters.
    const rawPath = input.slice('https://'.length).replace(/^[^/]*(?=\/|$)/, '');
    if (/[?#]/.test(input) || /%(?![a-f0-9]{2})/i.test(input)) return null;
    for (const raw of rawPath.split('/')) {
      const decoded = decodeURIComponent(raw);
      if (decoded === '.' || decoded === '..' || /[\\/\u0000-\u001f\u007f]/u.test(decoded)
          || /%(?:2e|2f|5c|00)/i.test(decoded)) return null;
    }
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    if (host.length > 253 || host.endsWith('.') || !host.includes('.') || /^[\d.]+$/.test(host)
        || host.includes(':') || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)) return null;
    const labels = host.split('.');
    if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
        || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels.at(-1))) return null;
    return url.href;
  } catch { return null; }
}

function ownValue(input, key) {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function safeList(value, maximum, predicate) {
  if (!Array.isArray(value) || value.length > maximum) return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !predicate(descriptor.value)) return false;
  }
  return new Set(value).size === value.length;
}

/** Validates declared metadata; does not certify the remote software or Apple acceptance. */
export function validateWebManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Het projectbestand moet een JSON-object zijn.'] };
  const fields = ['schemaVersion', 'kind', 'id', 'name', 'description', 'version', 'startUrl', 'storage', 'allowedOrigins', 'privacyUrl', 'supportUrl', 'ageRating', 'dataCollected', 'permissions'];
  const value = {};
  for (const field of fields) value[field] = ownValue(input, field);
  const errors = [];
  if (value.schemaVersion !== 3 || value.kind !== 'web') errors.push('Gebruik schemaVersion 3 en kind "web".');
  if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(value.id)) errors.push('id moet een unieke korte naam met kleine letters, cijfers en koppeltekens zijn.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 60) errors.push('name moet 1 tot 60 tekens bevatten.');
  if (typeof value.description !== 'string' || value.description.length > 180) errors.push('description mag maximaal 180 tekens bevatten.');
  if (typeof value.version !== 'string' || !/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value.version)) errors.push('version moet de vorm 1.0.0 hebben.');
  for (const field of ['startUrl', 'privacyUrl', 'supportUrl']) {
    const normalized = normalizePublicUrl(value[field]);
    if (!normalized) errors.push(`${field} moet een publieke HTTPS-URL zonder inloggegevens, parameters of fragment zijn.`);
    else value[field] = normalized;
  }
  if (!['local', 'cloud', 'both'].includes(value.storage)) errors.push('storage moet local, cloud of both zijn.');
  if (!safeList(value.allowedOrigins, 20, (origin) => {
    const normalized = normalizePublicUrl(origin);
    return normalized !== null && new URL(normalized).pathname === '/' && origin === new URL(normalized).origin;
  }) || value.allowedOrigins.length === 0) errors.push('allowedOrigins moet 1 tot 20 unieke publieke HTTPS-origins zonder pad bevatten.');
  else if (normalizePublicUrl(value.startUrl) && !value.allowedOrigins.includes(new URL(value.startUrl).origin)) errors.push('allowedOrigins moet de origin van startUrl bevatten.');
  if (!['4+', '9+', '13+', '16+', '18+'].includes(value.ageRating)) errors.push('ageRating moet 4+, 9+, 13+, 16+ of 18+ zijn.');
  if (!safeList(value.dataCollected, 20, (item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 100)) errors.push('dataCollected moet maximaal 20 unieke korte beschrijvingen bevatten.');
  if (!safeList(value.permissions, 0, () => false)) errors.push('permissions moet leeg zijn; deze versie biedt geen native rechten aan webprojecten.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ...value, name: value.name.trim(), allowedOrigins: [...value.allowedOrigins], dataCollected: [...value.dataCollected], permissions: [] } };
}

export function parseWebManifest(text) {
  if (typeof text !== 'string' || utf8ByteLength(text) > MAX_WEB_MANIFEST_BYTES) return { ok: false, errors: ['Het projectbestand moet tekst van maximaal 32 KiB zijn.'] };
  try { return validateWebManifest(JSON.parse(text)); }
  catch { return { ok: false, errors: ['Het projectbestand bevat ongeldige JSON.'] }; }
}
