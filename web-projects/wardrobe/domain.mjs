export const CATEGORY_LABELS = Object.freeze({ top: 'Bovenstuk', bottom: 'Onderstuk', shoes: 'Schoenen', outerwear: 'Jas', accessory: 'Accessoire' });
export const MAX_ITEMS = 100;
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
export const MAX_PHOTO_LENGTH = 700_000;
const required = ['top', 'bottom', 'shoes'];

export function validateItems(input) {
  if (!Array.isArray(input) || input.length > MAX_ITEMS) throw new Error('De kledinglijst is ongeldig of bevat meer dan 100 kledingstukken.');
  const ids = new Set();
  const items = input.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id)
      || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80
      || typeof item.color !== 'string' || item.color.length > 40
      || !Object.hasOwn(CATEGORY_LABELS, item.category)) throw new Error('Een kledingstuk bevat ongeldige gegevens.');
    ids.add(item.id);
    if (item.photo !== undefined && (typeof item.photo !== 'string' || item.photo.length > MAX_PHOTO_LENGTH
      || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(item.photo))) throw new Error('Een kledingfoto is ongeldig of te groot.');
    return { id: item.id, name: item.name.trim(), category: item.category, color: item.color.trim(), ...(item.photo ? { photo: item.photo } : {}) };
  });
  if (new TextEncoder().encode(JSON.stringify(items)).length > MAX_BACKUP_BYTES - 1024) throw new Error('Je kledingkast is groter dan 16 MB. Verwijder enkele foto’s of maak ze kleiner.');
  return items;
}

export function validateDocument(value) {
  if (value === undefined) return { schemaVersion: 1, revision: 0, items: [] };
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('De opgeslagen kledingkast is ongeldig. Je gegevens zijn niet overschreven.');
  return { schemaVersion: 1, revision: value.revision, items: validateItems(value.items) };
}

export function missingCategories(items) { return required.filter(category => !items.some(item => item.category === category)); }
export function outfitCount(items) {
  if (missingCategories(items).length) return 0;
  return Object.keys(CATEGORY_LABELS).reduce((total, category) => total * Math.max(1, items.filter(item => item.category === category).length), 1);
}
export function makeOutfit(items, index = 0) {
  const total = outfitCount(items);
  if (!total) return [];
  let cursor = Number.isSafeInteger(index) ? Math.abs(index) % total : 0;
  return Object.keys(CATEGORY_LABELS).flatMap(category => {
    const choices = items.filter(item => item.category === category);
    if (!choices.length) return [];
    const result = choices[cursor % choices.length];
    cursor = Math.floor(cursor / choices.length);
    return [result];
  });
}
export function exportBackup(items, now = new Date()) {
  return JSON.stringify({ apphubBackup: 1, project: 'wardrobe', exportedAt: now.toISOString(), items: validateItems(items) });
}
export function importBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('De back-up is te groot (maximaal 16 MB).');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Dit is geen geldige JSON-back-up.'); }
  if (!value || value.apphubBackup !== 1 || value.project !== 'wardrobe' || typeof value.exportedAt !== 'string' || Number.isNaN(Date.parse(value.exportedAt))) throw new Error('Deze back-up hoort niet bij deze kledingkastversie.');
  return validateItems(value.items);
}
