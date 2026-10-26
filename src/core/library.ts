import { validateMiniApp, type MiniApp } from '../runtime/schema.ts';
import type { ProjectSource } from '../runtime/importer.ts';

export const LIBRARY_KEY = 'apphub:host:library:v2';
export const PREFS_KEY = 'apphub:host:prefs:v1';
export interface InstalledProject {
  app: MiniApp;
  source: ProjectSource;
  installedAt: string;
  updatedAt: string;
  previous?: { app: MiniApp; source: ProjectSource };
}
export interface Preferences { favorites: string[]; recent: string[]; welcomed: boolean }
export const emptyPreferences: Preferences = { favorites: [], recent: [], welcomed: false };
const own = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function source(value: unknown): ProjectSource {
  if (!own(value)) throw new Error('Ongeldige projectherkomst.');
  if (value.kind === 'file' && Object.keys(value).length === 1) return { kind: 'file' };
  if (value.kind === 'github' && typeof value.repository === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(value.repository)
    && typeof value.commit === 'string' && /^[a-f0-9]{40}$/i.test(value.commit)) return { kind: 'github', repository: value.repository, commit: value.commit };
  throw new Error('Ongeldige projectherkomst.');
}
export function readInstalledRegistry(value: string | null): InstalledProject[] {
  if (value === null) return [];
  try {
    const entries: unknown = JSON.parse(value);
    if (!Array.isArray(entries) || entries.length > 50) throw new Error();
    const result = entries.map((entry: unknown): InstalledProject => {
      if (!own(entry) || typeof entry.installedAt !== 'string' || typeof entry.updatedAt !== 'string'
        || !Number.isFinite(Date.parse(entry.installedAt)) || !Number.isFinite(Date.parse(entry.updatedAt))) throw new Error();
      const app = validateMiniApp(entry.app);
      const record: InstalledProject = { app, source: source(entry.source), installedAt: entry.installedAt, updatedAt: entry.updatedAt };
      if (entry.previous !== undefined) {
        if (!own(entry.previous)) throw new Error();
        const previous = validateMiniApp(entry.previous.app);
        assertCompatibleUpdate(previous, app);
        record.previous = { app: previous, source: source(entry.previous.source) };
      }
      return record;
    });
    if (new Set(result.map(x => x.app.id)).size !== result.length) throw new Error();
    return result;
  } catch { throw new Error('Je appbibliotheek kan niet worden gelezen. Je gegevens zijn behouden. Herstel een back-up of probeer opnieuw.'); }
}
export function readPreferences(value: string | null): Preferences {
  if (value === null) return { favorites: [], recent: [], welcomed: false };
  const parsed: unknown = JSON.parse(value);
  if (!own(parsed) || !Array.isArray(parsed.favorites) || !Array.isArray(parsed.recent)
    || [...parsed.favorites, ...parsed.recent].some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(id))
    || parsed.favorites.length > 52 || parsed.recent.length > 52 || typeof parsed.welcomed !== 'boolean') {
    throw new Error('Je voorkeuren kunnen niet worden gelezen. Herstel een back-up.');
  }
  return { favorites: [...new Set(parsed.favorites)] as string[], recent: [...new Set(parsed.recent)] as string[], welcomed: parsed.welcomed };
}
function dataShape(app: MiniApp): string {
  return JSON.stringify(app.collections.map(c => ({ id: c.id, fields: c.fields.map(f => ({ id: f.id, type: f.type, required: !!f.required, options: f.options ?? [] })).sort((a,b)=>a.id.localeCompare(b.id)) })).sort((a,b)=>a.id.localeCompare(b.id)));
}
/** UI changes are reversible; data schema changes require a separate explicit migration. */
export function assertCompatibleUpdate(previous: MiniApp, next: MiniApp) {
  if (previous.id !== next.id) throw new Error('De update heeft een ander app-ID.');
  if (dataShape(previous) !== dataShape(next)) throw new Error('Deze versie wijzigt het gegevensmodel. Maak een nieuwe app met een ander ID; je huidige gegevens blijven behouden.');
}
export function installProject(current: InstalledProject[], app: MiniApp, provenance: ProjectSource): InstalledProject[] {
  if (current.length >= 50) throw new Error('Er passen maximaal 50 eigen apps in AppHub.');
  if (current.some(p => p.app.id === app.id)) throw new Error('Deze app is al toegevoegd. Gebruik Bijwerken in het appmenu.');
  const now = new Date().toISOString();
  return [...current, { app, source: provenance, installedAt: now, updatedAt: now }];
}
export function updateProject(current: InstalledProject[], id: string, app: MiniApp, provenance: ProjectSource): InstalledProject[] {
  const installed = current.find(p => p.app.id === id);
  if (!installed) throw new Error('De app is niet meer aanwezig.');
  assertCompatibleUpdate(installed.app, app);
  if (installed.source.kind === 'github' && (provenance.kind !== 'github' || installed.source.repository?.toLowerCase() !== provenance.repository?.toLowerCase())) throw new Error('De update komt uit een andere repository.');
  if (JSON.stringify(installed.app) === JSON.stringify(app)) throw new Error('Je hebt deze versie al.');
  return current.map(p => p.app.id === id ? { ...p, app, source: provenance, updatedAt: new Date().toISOString(), previous: { app: p.app, source: p.source } } : p);
}
export function rollbackProject(current: InstalledProject[], id: string): InstalledProject[] {
  const installed = current.find(p => p.app.id === id);
  if (!installed?.previous) throw new Error('Er is geen vorige versie beschikbaar.');
  return current.map(p => p.app.id === id ? { ...p, ...p.previous!, updatedAt: new Date().toISOString(), previous: undefined } : p);
}
