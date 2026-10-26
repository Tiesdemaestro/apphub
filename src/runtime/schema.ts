/** Data-only native UI contract. Imported definitions never contain executable code. */
export const RUNTIME_VERSION = 'apphub-native-1' as const;
export const MAX_MANIFEST_BYTES = 128 * 1024;
export const MAX_COLLECTIONS = 12;
export const MAX_FIELDS = 24;
export const MAX_SCREENS = 12;
export const MAX_RECORD_TEXT = 10_000;
export const MAX_RECORD_BYTES = 64 * 1024;
export const RESERVED_APP_IDS = Object.freeze(['wardrobe', 'notes', 'mijn-kledingkast', 'mijn-notities', 'apphub', 'system']);

export type Capability = 'storage' | 'photos';
export type FieldType = 'text' | 'multiline' | 'number' | 'boolean' | 'choice' | 'date' | 'photo';
export interface Field {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
}
export interface Collection { id: string; title: string; fields: Field[] }
export interface Screen {
  id: string;
  title: string;
  collection: string;
  layout: 'list' | 'grid';
  titleField: string;
  subtitleField?: string;
  imageField?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}
export interface MiniApp {
  schemaVersion: 2;
  id: string;
  name: string;
  description: string;
  version: string;
  runtimeVersion: typeof RUNTIME_VERSION;
  capabilities: Capability[];
  collections: Collection[];
  screens: Screen[];
  homeScreen: string;
  theme?: { color: string };
}
export type RecordValues = Record<string, string | number | boolean>;

/** Portable UTF-8 counting; works on Hermes without Buffer/TextEncoder. */
export function utf8ByteLength(text: string): number {
  let count = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    count += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return count;
}

function fail(message: string): never { throw new Error(message); }

function object(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} moet een gegevensobject zijn.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${path} moet een gewoon gegevensobject zijn.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail(`${path} bevat een onbekend of onveilig veld.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable) fail(`${path}.${key} moet een gewone waarde zijn.`);
    result[key] = descriptor.value;
  }
  return result;
}

function array(value: unknown, minimum: number, maximum: number, path: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length < minimum || value.length > maximum) fail(`${path} moet ${minimum}–${maximum} items bevatten.`);
  if (Reflect.ownKeys(value).length !== value.length + 1) fail(`${path} bevat ongeldige gegevens.`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail(`${path} bevat een ongeldig item.`);
    result.push(descriptor.value);
  }
  return result;
}

function text(value: unknown, minimum: number, maximum: number, path: string): string {
  if (typeof value !== 'string') fail(`${path} moet tekst zijn.`);
  const trimmed = value.trim();
  if (trimmed.length < minimum || trimmed.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) {
    fail(`${path} moet ${minimum}–${maximum} geldige tekens bevatten.`);
  }
  return trimmed;
}

function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(value)
      || ['constructor', 'prototype', '__proto__'].includes(value)) fail(`${path} moet beginnen met een kleine letter en alleen kleine letters, cijfers en koppeltekens bevatten (maximaal 48).`);
  return value;
}

function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) fail(`${path} bevat dubbele waarden.`);
}

function field(value: unknown, path: string): Field {
  const raw = object(value, ['id', 'label', 'type', 'required', 'options'], path);
  const checked: Field = { id: id(raw.id, `${path}.id`), label: text(raw.label, 1, 80, `${path}.label`), type: raw.type as FieldType };
  if (!['text', 'multiline', 'number', 'boolean', 'choice', 'date', 'photo'].includes(checked.type)) fail(`${path}.type is niet ondersteund.`);
  if ('required' in raw) {
    if (typeof raw.required !== 'boolean') fail(`${path}.required moet true of false zijn.`);
    checked.required = raw.required;
  }
  if (checked.type === 'choice') {
    checked.options = array(raw.options, 1, 40, `${path}.options`).map((option, index) => text(option, 1, 80, `${path}.options[${index}]`));
    unique(checked.options, `${path}.options`);
  } else if ('options' in raw) fail(`${path}.options mag alleen bij een keuzeveld worden gebruikt.`);
  return checked;
}

function validateCollection(value: unknown, index: number): Collection {
  const path = `collections[${index}]`;
  const raw = object(value, ['id', 'title', 'fields'], path);
  const fields = array(raw.fields, 1, MAX_FIELDS, `${path}.fields`).map((value, index) => field(value, `${path}.fields[${index}]`));
  unique(fields.map((item) => item.id), `${path}.fields`);
  return { id: id(raw.id, `${path}.id`), title: text(raw.title, 1, 80, `${path}.title`), fields };
}

/** Strict allowlist validation constructs a fresh, safe value from untrusted data. */
export function validateMiniApp(input: unknown): MiniApp {
  const raw = object(input, ['schemaVersion', 'id', 'name', 'description', 'version', 'runtimeVersion', 'capabilities', 'collections', 'screens', 'homeScreen', 'theme'], 'apphub.json');
  if (raw.schemaVersion === 1 || raw.runtimeVersion === 'apphub-1') {
    fail('Dit is een oud projectmanifest. Gebruik schemaVersion 2 en runtimeVersion apphub-native-1 met collections en screens.');
  }
  if (raw.schemaVersion !== 2) fail('schemaVersion moet 2 zijn.');
  if (raw.runtimeVersion !== RUNTIME_VERSION) fail(`runtimeVersion moet ${RUNTIME_VERSION} zijn.`);
  const appId = id(raw.id, 'id');
  if (appId.length < 2) fail('id moet minimaal twee tekens bevatten.');
  if (RESERVED_APP_IDS.includes(appId) || appId.startsWith('apphub-') || appId.startsWith('system-')) fail('Deze project-id is gereserveerd. Kies een eigen id.');
  const version = text(raw.version, 5, 32, 'version');
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) fail('version moet een versie als 1.0.0 zijn.');
  const capabilities = array(raw.capabilities, 1, 2, 'capabilities').map((value) => {
    if (value !== 'storage' && value !== 'photos') fail('capabilities ondersteunt alleen storage en photos.');
    return value;
  });
  unique(capabilities, 'capabilities');
  if (!capabilities.includes('storage')) fail('De mogelijkheid storage is vereist voor native projecten.');
  const collections = array(raw.collections, 1, MAX_COLLECTIONS, 'collections').map(validateCollection);
  unique(collections.map((item) => item.id), 'collections');
  if (collections.some((item) => item.fields.some((item) => item.type === 'photo')) && !capabilities.includes('photos')) fail('Een fotoveld vereist photos in capabilities.');
  const screens: Screen[] = array(raw.screens, 1, MAX_SCREENS, 'screens').map((value, index) => {
    const path = `screens[${index}]`;
    const raw = object(value, ['id', 'title', 'collection', 'layout', 'titleField', 'subtitleField', 'imageField', 'sortField', 'sortDirection'], path);
    const screen: Screen = {
      id: id(raw.id, `${path}.id`), title: text(raw.title, 1, 80, `${path}.title`), collection: id(raw.collection, `${path}.collection`),
      layout: raw.layout as Screen['layout'], titleField: id(raw.titleField, `${path}.titleField`),
    };
    if (screen.layout !== 'grid' && screen.layout !== 'list') fail(`${path}.layout moet list of grid zijn.`);
    const collection = collections.find((item) => item.id === screen.collection);
    if (!collection) fail(`${path}.collection verwijst niet naar een bestaande collectie.`);
    const title = collection.fields.find((item) => item.id === screen.titleField);
    if (!title || title.type === 'photo') fail(`${path}.titleField moet naar een bestaand tekst-, getal-, datum-, keuze- of ja/nee-veld verwijzen.`);
    for (const key of ['subtitleField', 'imageField', 'sortField'] as const) {
      if (!(key in raw)) continue;
      const name = id(raw[key], `${path}.${key}`);
      const target = collection.fields.find((item) => item.id === name);
      if (!target) fail(`${path}.${key} verwijst niet naar een bestaand veld.`);
      if (key === 'imageField' ? target.type !== 'photo' : target.type === 'photo') fail(`${path}.${key} verwijst naar een ongeschikt veldtype.`);
      screen[key] = name;
    }
    if ('sortDirection' in raw) {
      if (!screen.sortField || (raw.sortDirection !== 'asc' && raw.sortDirection !== 'desc')) fail(`${path}.sortDirection vereist sortField en moet asc of desc zijn.`);
      screen.sortDirection = raw.sortDirection;
    }
    return screen;
  });
  unique(screens.map((item) => item.id), 'screens');
  const homeScreen = id(raw.homeScreen, 'homeScreen');
  if (!screens.some((item) => item.id === homeScreen)) fail('homeScreen moet naar een bestaand scherm verwijzen.');
  const app: MiniApp = {
    schemaVersion: 2, id: appId, name: text(raw.name, 1, 60, 'name'), description: text(raw.description, 0, 300, 'description'),
    version, runtimeVersion: RUNTIME_VERSION, capabilities, collections, screens, homeScreen,
  };
  if ('theme' in raw) {
    const theme = object(raw.theme, ['color'], 'theme');
    if (typeof theme.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(theme.color)) fail('theme.color moet een zescijferige hexkleur zijn, bijvoorbeeld #3058D6.');
    app.theme = { color: theme.color };
  }
  if (utf8ByteLength(JSON.stringify(app)) > MAX_MANIFEST_BYTES) fail('Het projectbestand is groter dan 128 KiB.');
  return app;
}

export function parseMiniApp(input: string): MiniApp {
  if (typeof input !== 'string') fail('Het projectbestand moet JSON-tekst zijn.');
  if (utf8ByteLength(input) > MAX_MANIFEST_BYTES) fail('Het projectbestand is groter dan 128 KiB.');
  let value: unknown;
  try { value = JSON.parse(input); } catch { fail('Het projectbestand bevat ongeldige JSON.'); }
  return validateMiniApp(value);
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Validate values before persistence and when reading backups or stored records. */
export function validateRecord(collection: Collection, input: unknown): RecordValues {
  collection = validateCollection(collection, 0);
  const raw = object(input, collection.fields.map((field) => field.id), 'Gegevens');
  const result: RecordValues = {};
  for (const field of collection.fields) {
    const value = raw[field.id];
    const empty = value === undefined || (typeof value === 'string' && value.trim() === '' && field.type !== 'number' && field.type !== 'boolean');
    if (empty) {
      if (field.required) fail(`${field.label} is verplicht.`);
      continue;
    }
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e15) fail(`${field.label} moet een geldig getal zijn (maximaal 10¹⁵).`);
      result[field.id] = value;
    } else if (field.type === 'boolean') {
      if (typeof value !== 'boolean') fail(`${field.label} moet ja of nee zijn.`);
      result[field.id] = value;
    } else {
      const maximum = field.type === 'multiline' ? MAX_RECORD_TEXT : field.type === 'text' ? 500 : field.type === 'photo' ? 180 : 80;
      const checked = text(value, 1, maximum, field.label);
      if (field.type === 'choice' && !field.options?.includes(checked)) fail(`${field.label} bevat een onbekende keuze.`);
      if (field.type === 'date' && !validDate(checked)) fail(`${field.label} moet een geldige datum zijn als JJJJ-MM-DD.`);
      if (field.type === 'photo' && !/^apphub-photo:[a-zA-Z0-9-]+\.(jpg|jpeg|png|heic|heif|webp)$/.test(checked)) fail(`${field.label} moet een foto uit dit project zijn.`);
      result[field.id] = checked;
    }
  }
  if (utf8ByteLength(JSON.stringify(result)) > MAX_RECORD_BYTES) fail('Deze gegevens zijn te groot (maximaal 64 KiB).');
  return result;
}
