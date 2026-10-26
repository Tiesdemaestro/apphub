import { assertCompatibleUpdate, readInstalledRegistry } from './library.ts';
import type { ProjectSource } from '../runtime/importer.ts';
import type { MiniApp } from '../runtime/schema.ts';

/**
 * Reinstalling an app must not reinterpret rows kept after uninstall.
 * The retained snapshot is a one-element InstalledProject registry, written
 * before registry removal and removed only after an explicit data erasure.
 */
export function assertRetainedInstall(
  raw: string | null,
  app: MiniApp,
  provenance: ProjectSource,
  hasData: boolean,
): void {
  if (raw === null) {
    if (hasData) throw new Error('Bij dit app-ID staan nog gegevens zonder leesbare appdefinitie. Kies een ander app-ID; je bestaande gegevens blijven behouden.');
    return;
  }
  let retained;
  try {
    const registry = readInstalledRegistry(raw);
    if (registry.length !== 1) throw new Error();
    retained = registry[0];
  } catch {
    throw new Error('De bewaarde appdefinitie is niet leesbaar. Kies een ander app-ID of herstel een back-up. Je bestaande gegevens blijven behouden.');
  }
  assertCompatibleUpdate(retained.app, app);
  const sameSource = retained.source.kind === 'file'
    ? provenance.kind === 'file'
    : provenance.kind === 'github'
      && retained.source.repository?.toLowerCase() === provenance.repository?.toLowerCase();
  if (!sameSource) throw new Error('Bij dit app-ID horen nog gegevens uit een andere projectbron. Voeg de oorspronkelijke app opnieuw toe of kies een ander app-ID.');
}
