import { validateRecord, type Collection, type RecordValues, type Screen } from './schema.ts';

export interface RuntimeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  values: RecordValues;
}

export type DraftValues = Record<string, string | boolean>;

export function draftFor(collection: Collection, record?: RuntimeRecord): DraftValues {
  return Object.fromEntries(collection.fields.map((field) => {
    const value = record?.values[field.id];
    return [field.id, field.type === 'boolean'
      ? typeof value === 'boolean' ? value : field.required ? false : ''
      : String(value ?? '')];
  }));
}

export function valuesFor(collection: Collection, draft: DraftValues): RecordValues {
  const input: RecordValues = {};
  for (const field of collection.fields) {
    const value = draft[field.id];
    if (field.type === 'boolean') {
      if (value === true || value === false) input[field.id] = value;
      else if (value !== '' && value !== undefined) throw new Error(`Kies bij “${field.label}” ja of nee.`);
      continue;
    }
    if (value !== undefined && typeof value !== 'string') throw new Error(`Controleer je invoer bij “${field.label}”.`);
    const text = String(value ?? '').trim();
    if (!text) continue;
    if (field.type === 'number') {
      // Small stored numbers may stringify as 1e-7; they must remain editable.
      if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(text)) throw new Error(`Vul bij “${field.label}” een getal in.`);
      input[field.id] = Number(text.replace(',', '.'));
    } else input[field.id] = text;
  }
  return validateRecord(collection, input);
}

const LIMIT = 10_000;
const recordID = /^[a-zA-Z0-9-]{1,100}$/;

export function collectionStorageKey(collectionId: string): string {
  if (!/^[a-z][a-z0-9-]{0,47}$/.test(collectionId)) throw new Error('Ongeldige verzameling.');
  return `runtime.v1.${collectionId}`;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

/** A failed read must never become an empty list that can overwrite the original. */
export function parseStoredRecords(collection: Collection, input: unknown): RuntimeRecord[] {
  if (input === null) return [];
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype
      || input.length > LIMIT || Reflect.ownKeys(input).length !== input.length + 1) throw new Error();
    const seen = new Set<string>();
    return Array.from({ length: input.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new Error();
      const entry: unknown = descriptor.value;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error();
      if (Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null) throw new Error();
      if (Reflect.ownKeys(entry).length !== 4 || Object.keys(entry).some((key) => !Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(entry, key), 'value'))) throw new Error();
      const raw = entry as Record<string, unknown>;
      if (Object.keys(raw).sort().join(',') !== 'createdAt,id,updatedAt,values') throw new Error();
      if (typeof raw.id !== 'string' || !recordID.test(raw.id) || seen.has(raw.id)) throw new Error();
      if (!isTimestamp(raw.createdAt) || !isTimestamp(raw.updatedAt) || raw.updatedAt < raw.createdAt) throw new Error();
      const values = validateRecord(collection, raw.values);
      const original = raw.values as Record<string, unknown>;
      if (Object.keys(values).length !== Object.keys(original).length
        || Object.keys(values).some((key) => values[key] !== original[key])) throw new Error();
      seen.add(raw.id);
      return { id: raw.id, createdAt: raw.createdAt, updatedAt: raw.updatedAt, values: { ...values } };
    });
  } catch {
    throw new Error(`De opgeslagen gegevens van “${collection.title}” zijn niet leesbaar met deze appversie. Ze blijven bewaard en worden niet overschreven.`);
  }
}

export function upsertRecord(
  collection: Collection,
  records: readonly RuntimeRecord[],
  input: unknown,
  options: { id?: string; now?: string; createId?: () => string } = {},
): { records: RuntimeRecord[]; record: RuntimeRecord } {
  const values = validateRecord(collection, input);
  const now = options.now ?? new Date().toISOString();
  if (!isTimestamp(now)) throw new Error('Ongeldige datum voor het opslaan.');
  const original = options.id ? records.find((entry) => entry.id === options.id) : undefined;
  if (options.id && !original) throw new Error('Dit item bestaat niet meer. Open de lijst opnieuw.');
  if (!original && records.length >= LIMIT) throw new Error('Deze verzameling is vol (10.000 items).');
  const id = original?.id ?? (options.createId?.() ?? `record-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
  if (!recordID.test(id) || (!original && records.some((entry) => entry.id === id))) throw new Error('Een uniek item maken is niet gelukt. Probeer opnieuw.');
  const record: RuntimeRecord = {
    id,
    createdAt: original?.createdAt ?? now,
    // A device clock correction must not make a previously valid record unreadable.
    updatedAt: original && now < original.createdAt ? original.createdAt : now,
    values: { ...values },
  };
  return {
    record,
    records: original ? records.map((entry) => entry.id === id ? record : entry) : [...records, record],
  };
}

export function deleteRecord(records: readonly RuntimeRecord[], id: string): RuntimeRecord[] {
  if (!records.some((entry) => entry.id === id)) throw new Error('Dit item bestaat niet meer.');
  return records.filter((entry) => entry.id !== id);
}

function searchable(value: string | number | boolean): string {
  return (typeof value === 'boolean' ? value ? 'ja true' : 'nee false' : String(value))
    .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('nl-NL');
}

export function selectRecords(records: readonly RuntimeRecord[], screen: Screen, query = ''): RuntimeRecord[] {
  const words = searchable(query.trim()).split(/\s+/).filter(Boolean);
  const selected = records.filter((entry) => {
    const text = Object.values(entry.values).filter((value) => typeof value !== 'string' || !value.startsWith('apphub-photo:')).map(searchable).join(' ');
    return words.every((word) => text.includes(word));
  });
  const direction = screen.sortDirection === 'desc' ? -1 : 1;
  return selected.sort((a, b) => {
    if (!screen.sortField) return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
    const left = a.values[screen.sortField];
    const right = b.values[screen.sortField];
    // Missing optional values always belong at the end, including descending order.
    if (left === undefined && right !== undefined) return 1;
    if (right === undefined && left !== undefined) return -1;
    if (left === undefined || right === undefined) return a.id.localeCompare(b.id);
    const compared = typeof left === 'number' && typeof right === 'number' ? left - right
      : typeof left === 'boolean' && typeof right === 'boolean' ? Number(left) - Number(right)
        : String(left).localeCompare(String(right), 'nl-NL', { numeric: true, sensitivity: 'base' });
    return compared * direction || a.id.localeCompare(b.id);
  });
}

export function photoReferences(collection: Collection, values: RecordValues): string[] {
  return [...new Set(collection.fields.filter((field) => field.type === 'photo')
    .map((field) => values[field.id]).filter((value): value is string => typeof value === 'string' && value.startsWith('apphub-photo:')))];
}
