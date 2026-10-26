export declare const MAX_WEB_MANIFEST_BYTES: number;
export declare const WEB_SCHEMA_VERSION: 3;
export interface WebManifest {
  schemaVersion: 3;
  kind: 'web';
  id: string;
  name: string;
  description: string;
  version: string;
  startUrl: string;
  storage: 'local' | 'cloud' | 'both';
  allowedOrigins: string[];
  privacyUrl: string;
  supportUrl: string;
  ageRating: '4+' | '9+' | '13+' | '16+' | '18+';
  dataCollected: string[];
  permissions: [];
}
export type WebManifestResult = { ok: true; value: WebManifest } | { ok: false; errors: string[] };
export declare function utf8ByteLength(text: string): number;
export declare function normalizePublicUrl(input: unknown): string | null;
export declare function validateWebManifest(input: unknown): WebManifestResult;
export declare function parseWebManifest(text: unknown): WebManifestResult;
