import { validateWebManifest, type WebManifest } from './contracts.mjs';
export const WEB_LIBRARY_KEY = 'apphub:web:library:v1';
export const WEB_RECOVERY_KEY = 'apphub:web:recovery:v1';
export async function recoverWebLibrary(store: { getItem(key:string):Promise<string|null>; setItem(key:string,value:string):Promise<void> }): Promise<void> {
  const raw = await store.getItem(WEB_LIBRARY_KEY);
  if (raw !== null) await store.setItem(WEB_RECOVERY_KEY, raw);
  await store.setItem(WEB_LIBRARY_KEY, '[]');
}
export type WebEntry = { manifest: WebManifest; addedAt: string; favorite: boolean; blocked: boolean };
export function readWebLibrary(raw: string | null): WebEntry[] {
  if (raw === null) return [];
  const input: unknown = JSON.parse(raw);
  if (!Array.isArray(input) || input.length > 50) throw new Error('Ongeldige webbibliotheek. Je gegevens zijn behouden.');
  const ids = new Set<string>();
  return input.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Ongeldig project in bibliotheek.');
    const result = validateWebManifest(entry.manifest);
    if (!result.ok || typeof entry.addedAt !== 'string' || !Number.isFinite(Date.parse(entry.addedAt)) || typeof entry.favorite !== 'boolean' || typeof entry.blocked !== 'boolean') throw new Error('Projectgegevens kunnen niet worden gelezen.');
    if (ids.has(result.value.id)) throw new Error('Dubbel project-ID.');
    ids.add(result.value.id);
    return { manifest: result.value, addedAt: entry.addedAt, favorite: entry.favorite, blocked: entry.blocked };
  });
}
export function addWebProject(entries: WebEntry[], manifest: WebManifest): WebEntry[] {
  const result = validateWebManifest(manifest);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  if (entries.length >= 50) throw new Error('Er passen maximaal 50 webprojecten in je bibliotheek.');
  if (entries.some(e => e.manifest.id === manifest.id || e.manifest.startUrl === manifest.startUrl)) throw new Error('Dit project is al toegevoegd.');
  return [...entries, { manifest: result.value, addedAt: new Date().toISOString(), favorite: false, blocked: false }];
}
