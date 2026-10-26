import type { ProjectStorage } from '../sdk/types.ts';

export interface StringStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function projectKey(projectId: string, key: string): string {
  if (!/^[a-z][a-z0-9-]{1,47}$/.test(projectId)) throw new Error('Ongeldig project-ID.');
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(key)) throw new Error('Ongeldige opslagsleutel.');
  return `apphub:project:${projectId}:${key}`;
}

/** Namespacing for trusted built-ins; NOT a sandbox for arbitrary JavaScript. */
export function createProjectStorage(projectId: string, backend: StringStore): ProjectStorage {
  projectKey(projectId, 'validation');
  return {
    async getItem<T>(key: string): Promise<T | null> {
      const value = await backend.getItem(projectKey(projectId, key));
      if (value === null) return null;
      try { return JSON.parse(value) as T; }
      catch { throw new Error('Opgeslagen gegevens zijn beschadigd. Ze zijn niet overschreven.'); }
    },
    async setItem<T>(key: string, value: T) {
      const text = JSON.stringify(value);
      if (text === undefined || text.length > 2_000_000) throw new Error('Gegevens zijn ongeldig of te groot.');
      await backend.setItem(projectKey(projectId, key), text);
    },
    async removeItem(key: string) { await backend.removeItem(projectKey(projectId, key)); },
  };
}
