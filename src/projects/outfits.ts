export const CATEGORIES = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Bovenstuk',
  bottom: 'Onderstuk',
  shoes: 'Schoenen',
  outerwear: 'Jas',
  accessory: 'Accessoire',
};

export type ClothingItem = {
  id: string;
  name: string;
  category: Category;
  color: string;
  photoUri?: string;
};

export function isClothingList(value: unknown): value is ClothingItem[] {
  return Array.isArray(value) && value.length <= 10_000 && value.every((item: unknown) => {
    if (typeof item !== 'object' || item === null) return false;
    const record = item as Record<string, unknown>;
    return typeof record.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(record.id)
      && typeof record.name === 'string' && record.name.trim().length > 0 && record.name.length <= 80
      && typeof record.category === 'string'
      && CATEGORIES.includes(record.category as Category)
      && typeof record.color === 'string' && record.color.length <= 40
      && (record.photoUri === undefined || (typeof record.photoUri === 'string'
        && /^apphub-photo:[a-zA-Z0-9-]+\.(jpg|jpeg|png|heic|heif|webp)$/.test(record.photoUri)));
  }) && new Set(value.map((item) => item.id)).size === value.length;
}

/** Commit before returning a photo eligible for deletion; failed writes preserve every original. */
export async function persistClothingItem(
  items: ClothingItem[],
  draft: ClothingItem,
  editingId: string | null,
  persist: (next: ClothingItem[]) => Promise<void>,
): Promise<{ items: ClothingItem[]; unusedPhoto?: string }> {
  const item: ClothingItem = {
    id: editingId ?? draft.id, name: draft.name.trim(), color: draft.color.trim(), category: draft.category,
    ...(draft.photoUri ? { photoUri: draft.photoUri } : {}),
  };
  if (!isClothingList([item])) throw new Error('Controleer de naam, kleur, categorie en foto van dit kledingstuk.');
  const original = editingId ? items.find((entry) => entry.id === editingId) : undefined;
  if (editingId && !original) throw new Error('Dit kledingstuk bestaat niet meer. Open de kledingkast opnieuw.');
  if (!editingId && items.some((entry) => entry.id === item.id)) throw new Error('Dit kledingstuk bestaat al. Probeer opnieuw.');
  const next = editingId ? items.map((entry) => entry.id === editingId ? item : entry) : [...items, item];
  if (next.length > 10_000) throw new Error('Je kledingkast bevat maximaal 10.000 kledingstukken.');
  await persist(next);
  const unusedPhoto = original?.photoUri && !next.some((entry) => entry.photoUri === original.photoUri) ? original.photoUri : undefined;
  return { items: next, ...(unusedPhoto ? { unusedPhoto } : {}) };
}

const REQUIRED: Category[] = ['top', 'bottom', 'shoes'];
const OPTIONAL: Category[] = ['outerwear', 'accessory'];

export function missingCategories(items: ClothingItem[]): Category[] {
  return REQUIRED.filter((category) => !items.some((item) => item.category === category));
}

export function outfitCount(items: ClothingItem[]): number {
  if (missingCategories(items).length > 0) return 0;
  const counts = [...REQUIRED, ...OPTIONAL].map((category) =>
    Math.max(1, items.filter((item) => item.category === category).length));
  return counts.reduce((total, count) => Math.min(Number.MAX_SAFE_INTEGER, total * count), 1);
}

/** Cycles through combinations without depending on a network or storing generated outfits. */
export function buildOutfit(items: ClothingItem[], variation = 0): ClothingItem[] {
  const total = outfitCount(items);
  if (total === 0) return [];
  let cursor = Number.isFinite(variation) ? Math.abs(Math.trunc(variation)) % total : 0;
  return [...REQUIRED, ...OPTIONAL].flatMap((category) => {
    const choices = items.filter((item) => item.category === category);
    if (choices.length === 0) return [];
    const selection = choices[cursor % choices.length];
    cursor = Math.floor(cursor / choices.length);
    return [selection];
  });
}
