import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { ProjectProps } from '../sdk/types';
import {
  buildOutfit, CATEGORIES, CATEGORY_LABELS, isClothingList, missingCategories,
  outfitCount, persistClothingItem, type Category, type ClothingItem,
} from './outfits';

const STORAGE_KEY = 'wardrobe.v1';
const messageFor = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function WardrobeScreen({ storage, media, onBusyChange }: ProjectProps) {
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [category, setCategory] = useState<Category>('top');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  // Only newly imported or already unreferenced files belong here. An original
  // saved photo must remain available until the changed record is committed.
  const pendingPhotos = useRef(new Set<string>());
  const [formError, setFormError] = useState<string | null>(null);
  const [variation, setVariation] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const stored = await storage.getItem<unknown>(STORAGE_KEY);
        if (stored !== null && !isClothingList(stored)) {
          throw new Error('De opgeslagen kledingkast kon niet worden gelezen. Je gegevens worden niet overschreven.');
        }
        if (active) setItems(stored ?? []);
      } catch (error) {
        if (active) setLoadError(messageFor(error, 'Je kledingkast laden is niet gelukt.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [storage, reload]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // An error boundary can unmount even while navigation is locked. Let the
      // in-flight save transfer photo ownership before removing draft files.
      if (!lock.current) void cleanupDraftPhotos();
    };
  }, [media]);

  const missing = missingCategories(items);
  const combinationCount = outfitCount(items);
  const outfit = variation === null ? [] : buildOutfit(items, variation);
  const draftPhotoUri = photoUri ? media.resolvePhoto(photoUri) : null;

  function startAction() {
    if (!mounted.current || lock.current) return false;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    return true;
  }
  function finishAction() {
    lock.current = false;
    onBusyChange?.(false);
    if (mounted.current) setBusy(false);
    else void cleanupDraftPhotos();
  }

  function openForm(item?: ClothingItem) {
    if (!mounted.current || lock.current || editing) return;
    setEditingId(item?.id ?? null);
    setName(item?.name ?? '');
    setColor(item?.color ?? '');
    setCategory(item?.category ?? 'top');
    setPhotoUri(item?.photoUri);
    setFormError(null);
    setEditing(true);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  function closeForm() {
    setPhotoUri(undefined);
    setName('');
    setColor('');
    setCategory('top');
    setFormError(null);
    setEditingId(null);
    setEditing(false);
  }

  async function cleanupDraftPhotos(keep?: string): Promise<boolean> {
    let complete = true;
    for (const reference of Array.from(pendingPhotos.current)) {
      if (reference === keep) continue;
      try { await media.removePhoto(reference); pendingPhotos.current.delete(reference); }
      catch { complete = false; }
    }
    return complete;
  }

  async function pickPhoto() {
    if (!startAction()) return;
    setFormError(null);
    try {
      const selected = await media.pickPhoto();
      if (selected) {
        pendingPhotos.current.add(selected);
        if (mounted.current) setPhotoUri(selected);
        if (!await cleanupDraftPhotos(selected) && mounted.current) setFormError('De nieuwe foto staat klaar. Een eerdere ongebruikte foto wordt later opgeruimd.');
      }
    } catch (error) {
      if (mounted.current) setFormError(messageFor(error, 'De foto kon niet worden toegevoegd. Controleer je fototoegang in Instellingen.'));
    } finally { finishAction(); }
  }

  async function cancelForm() {
    if (!startAction()) return;
    try {
      const cleaned = await cleanupDraftPhotos();
      if (mounted.current) {
        closeForm();
        if (!cleaned) Alert.alert('Wijzigingen weggegooid', 'Een ongebruikte foto kon nog niet worden opgeruimd. Je opgeslagen kledingstuk is behouden.');
      }
    } catch (error) {
      if (mounted.current) setFormError(messageFor(error, 'De ongebruikte foto kon niet worden verwijderd. Probeer opnieuw.'));
    } finally { finishAction(); }
  }

  function confirmCancel() {
    if (!mounted.current || lock.current) return;
    const original = items.find((item) => item.id === editingId);
    const changed = name !== (original?.name ?? '') || color !== (original?.color ?? '')
      || category !== (original?.category ?? 'top') || photoUri !== original?.photoUri;
    if (!changed) { void cancelForm(); return; }
    Alert.alert('Wijzigingen weggooien?', 'Deze wijzigingen zijn nog niet opgeslagen.', [
      { text: 'Verder bewerken', style: 'cancel' },
      { text: 'Weggooien', style: 'destructive', onPress: () => { void cancelForm(); } },
    ]);
  }

  async function removeDraftPhoto() {
    if (!startAction()) return;
    try {
      setPhotoUri(undefined);
      if (!await cleanupDraftPhotos() && mounted.current) setFormError('Een ongebruikte foto kon niet worden opgeruimd. Je kunt het kledingstuk wel opslaan.');
    } finally { finishAction(); }
  }

  async function saveItem() {
    if (!mounted.current || lock.current) return;
    if (!name.trim()) { setFormError('Geef dit kledingstuk eerst een naam.'); return; }
    if (!startAction()) return;
    setFormError(null);
    const newItem: ClothingItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: name.trim(), color: color.trim(), category,
      ...(photoUri ? { photoUri } : {}),
    };
    try {
      const result = await persistClothingItem(items, newItem, editingId, (next) => storage.setItem(STORAGE_KEY, next));
      // Ownership transfers to the persisted item immediately after storage succeeds.
      if (photoUri) pendingPhotos.current.delete(photoUri);
      if (result.unusedPhoto) pendingPhotos.current.add(result.unusedPhoto);
      if (mounted.current) {
        setItems(result.items);
        closeForm();
        setVariation(null);
      }
      if (!await cleanupDraftPhotos() && mounted.current) Alert.alert('Kledingstuk opgeslagen', 'Een ongebruikte foto kon nog niet worden opgeruimd.');
    } catch (error) {
      if (mounted.current) setFormError(messageFor(error, 'Opslaan is niet gelukt. Je invoer staat nog klaar.'));
    } finally { finishAction(); }
  }

  function confirmDelete(item: ClothingItem) {
    if (!mounted.current || lock.current) return;
    Alert.alert('Kledingstuk verwijderen?', `“${item.name}” wordt uit je kledingkast verwijderd.`, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: () => { void deleteItem(item); } },
    ]);
  }

  async function deleteItem(item: ClothingItem) {
    if (!startAction()) return;
    try {
      const next = items.filter((entry) => entry.id !== item.id);
      await storage.setItem(STORAGE_KEY, next);
      if (mounted.current) {
        setItems(next);
        setVariation(null);
      }
      if (item.photoUri && !next.some((entry) => entry.photoUri === item.photoUri)) {
        try { await media.removePhoto(item.photoUri); }
        catch { if (mounted.current) Alert.alert('Kledingstuk verwijderd', 'Het bijbehorende fotobestand kon nog niet worden opgeruimd.'); }
      }
    } catch (error) {
      if (mounted.current) Alert.alert('Verwijderen niet gelukt', messageFor(error, 'Je kledingstuk is behouden. Probeer opnieuw.'));
    } finally { finishAction(); }
  }

  function renderItem(item: ClothingItem, removable: boolean) {
    const resolvedPhoto = item.photoUri ? media.resolvePhoto(item.photoUri) : null;
    return (
      <View style={styles.item} key={`${removable ? 'closet' : 'outfit'}-${item.id}`}>
        {resolvedPhoto ? <Image source={{ uri: resolvedPhoto }} style={styles.photo} accessibilityLabel={`Foto van ${item.name}`} />
          : <View style={styles.photoPlaceholder}><Text style={styles.initial}>{item.name.slice(0, 1).toUpperCase()}</Text></View>}
        <Pressable accessibilityRole={removable ? 'button' : undefined} accessibilityLabel={removable ? `${item.name} bewerken` : undefined}
          disabled={!removable || busy || editing} onPress={() => openForm(item)} style={styles.itemBody}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.meta}>{CATEGORY_LABELS[item.category]}{item.color ? ` · ${item.color}` : ''}</Text>
          {removable && <Text style={styles.editText}>Bewerken</Text>}
        </Pressable>
        {removable && <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} verwijderen`}
          disabled={busy || editing} onPress={() => confirmDelete(item)} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Wis</Text>
        </Pressable>}
      </View>
    );
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#4f46e5" /><Text style={styles.meta}>Je kledingkast laden…</Text></View>;
  if (loadError) return <View style={styles.loading}>
    <Text style={styles.sectionTitle}>Laden is niet gelukt</Text><Text style={styles.error}>{loadError}</Text>
    <Pressable accessibilityRole="button" onPress={() => setReload((value) => value + 1)} style={styles.primary}>
      <Text style={styles.primaryText}>Opnieuw proberen</Text>
    </Pressable>
  </View>;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>JOUW DAGELIJKSE KEUZE</Text>
        <Text style={styles.title}>Mijn kledingkast</Text>
        <Text style={styles.subtitle}>Bewaar je kleding. Ontdek nieuwe combinaties.</Text>

        <View style={styles.summary}>
          <View><Text style={styles.stat}>{items.length}</Text><Text style={styles.meta}>{items.length === 1 ? 'kledingstuk' : 'kledingstukken'}</Text></View>
          <View style={styles.summaryDivider} />
          <View><Text style={styles.stat}>{combinationCount}</Text><Text style={styles.meta}>{combinationCount === 1 ? 'combinatie' : 'combinaties'}</Text></View>
        </View>

        {!editing ? <Pressable accessibilityRole="button" onPress={() => openForm()} disabled={busy} style={styles.primary}>
          <Text style={styles.primaryText}>+ Kledingstuk toevoegen</Text>
        </Pressable> : <View style={styles.form}>
          <Text style={styles.sectionTitle}>{editingId ? 'Kledingstuk bewerken' : 'Nieuw kledingstuk'}</Text>
          <Text style={styles.label}>Naam</Text>
          <TextInput accessibilityLabel="Naam van het kledingstuk" value={name} onChangeText={setName} placeholder="Bijvoorbeeld: blauwe trui" placeholderTextColor="#9ca3af" style={styles.input} maxLength={80} editable={!busy} />
          <Text style={styles.label}>Categorie</Text>
          <View style={styles.chips}>{CATEGORIES.map((option) => <Pressable key={option} accessibilityRole="button"
            accessibilityState={{ selected: category === option, disabled: busy }} disabled={busy}
            onPress={() => setCategory(option)} style={[styles.chip, category === option && styles.chipSelected]}>
            <Text style={[styles.chipText, category === option && styles.chipTextSelected]}>{CATEGORY_LABELS[option]}</Text>
          </Pressable>)}</View>
          <Text style={styles.label}>Kleur · optioneel</Text>
          <TextInput accessibilityLabel="Kleur van het kledingstuk" value={color} onChangeText={setColor} placeholder="Bijvoorbeeld: donkerblauw" placeholderTextColor="#9ca3af" style={styles.input} maxLength={40} editable={!busy} />
          {draftPhotoUri && <Image source={{ uri: draftPhotoUri }} style={styles.preview} accessibilityLabel="Geselecteerde kledingfoto" />}
          <Pressable accessibilityRole="button" onPress={() => { void pickPhoto(); }} disabled={busy} style={styles.secondary}>
            <Text style={styles.secondaryText}>{photoUri ? 'Andere foto kiezen' : 'Foto toevoegen · optioneel'}</Text>
          </Pressable>
          {photoUri && <Pressable accessibilityRole="button" onPress={() => { void removeDraftPhoto(); }} disabled={busy} style={styles.secondary}>
            <Text style={styles.deleteText}>Foto verwijderen</Text>
          </Pressable>}
          {formError && <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void saveItem(); }} style={[styles.primary, busy && styles.disabled]}>
            <Text style={styles.primaryText}>{busy ? 'Even wachten…' : 'Kledingstuk opslaan'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={confirmCancel} style={styles.secondary}>
            <Text style={styles.secondaryText}>Annuleren</Text>
          </Pressable>
        </View>}

        <View style={styles.outfitCard}>
          <Text style={styles.sectionTitle}>Wat trek je aan?</Text>
          <Text style={styles.cardDescription}>{missing.length > 0
            ? `Voeg nog toe: ${missing.map((entry) => CATEGORY_LABELS[entry].toLowerCase()).join(', ')}.`
            : 'Combineer een bovenstuk, onderstuk en schoenen. Je jas en accessoires komen erbij als je die hebt.'}</Text>
          {outfit.length > 0 && <View style={styles.outfitList}>{outfit.map((item) => renderItem(item, false))}</View>}
          <Pressable accessibilityRole="button" disabled={missing.length > 0 || busy}
            accessibilityState={{ disabled: missing.length > 0 || busy }}
            onPress={() => setVariation((previous) => previous === null ? 0 : (previous + 1) % combinationCount)}
            style={[styles.primary, (missing.length > 0 || busy) && styles.disabled]}>
            <Text style={styles.primaryText}>{variation === null ? 'Maak een combinatie' : combinationCount > 1 ? 'Volgende combinatie' : 'Bekijk deze combinatie'}</Text>
          </Pressable>
          {outfit.length > 0 && <Text style={styles.disclaimer}>Combinatie {((variation ?? 0) % combinationCount) + 1} van {combinationCount}. Op basis van categorieën, zonder stijladvies.</Text>}
        </View>

        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Alle kleding</Text><Text style={styles.countBadge}>{items.length}</Text></View>
        {items.length === 0 ? <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Een frisse start</Text>
          <Text style={styles.emptyText}>Voeg je eerste kledingstuk toe. Alles wat je hier bewaart, staat op deze iPhone.</Text>
        </View> : <View style={styles.list}>{items.map((item) => renderItem(item, true))}</View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingBottom: 52, gap: 16 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 18, backgroundColor: '#fff' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#4f46e5', marginTop: 10 },
  title: { color: '#111827', fontSize: 31, fontWeight: '700', letterSpacing: -1, marginTop: -6 },
  subtitle: { color: '#6b7280', fontSize: 15, lineHeight: 23, marginTop: -7 },
  summary: { flexDirection: 'row', gap: 24, alignItems: 'center', paddingVertical: 12 },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#e5e7eb' },
  stat: { fontSize: 26, fontWeight: '700', color: '#111827' },
  meta: { color: '#6b7280', fontSize: 13, lineHeight: 20 },
  primary: { minHeight: 48, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 13, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 10 },
  secondaryText: { color: '#4f46e5', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  form: { padding: 18, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 18, gap: 10 },
  sectionTitle: { color: '#111827', fontSize: 19, fontWeight: '700' },
  label: { fontSize: 13, color: '#374151', fontWeight: '600', marginTop: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 16, color: '#111827', backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#e5e7eb' },
  chipSelected: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  chipText: { fontSize: 13, color: '#6b7280' },
  chipTextSelected: { color: '#4338ca', fontWeight: '700' },
  preview: { width: '100%', height: 160, borderRadius: 12, resizeMode: 'cover', backgroundColor: '#f3f4f6', marginTop: 8 },
  error: { color: '#b91c1c', fontSize: 14, lineHeight: 21 },
  outfitCard: { borderRadius: 20, padding: 20, gap: 14, backgroundColor: '#f5f5ff', marginTop: 12 },
  cardDescription: { fontSize: 14, color: '#6b7280', lineHeight: 22 },
  outfitList: { gap: 6 },
  disclaimer: { color: '#6b7280', fontSize: 12, lineHeight: 18 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  countBadge: { color: '#6b7280', fontSize: 14 },
  list: { gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  photo: { width: 56, height: 64, borderRadius: 12, backgroundColor: '#f3f4f6' },
  photoPlaceholder: { width: 56, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8e7fc' },
  initial: { fontSize: 24, color: '#4f46e5', fontWeight: '600' },
  itemBody: { flex: 1, gap: 4, minHeight: 44, justifyContent: 'center' },
  itemName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  editText: { fontSize: 12, color: '#4f46e5', fontWeight: '600' },
  deleteButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  deleteText: { color: '#9f1239', fontSize: 13 },
  empty: { padding: 24, borderRadius: 18, backgroundColor: '#f9fafb', alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, color: '#374151', fontWeight: '600' },
  emptyText: { fontSize: 14, lineHeight: 23, color: '#6b7280', textAlign: 'center' },
});
