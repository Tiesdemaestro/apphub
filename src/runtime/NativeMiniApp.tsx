import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, FlatList, Image, KeyboardAvoidingView,
  Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import type { ProjectProps } from '../sdk/types';
import { type Field, type MiniApp, type RecordValues } from './schema';
import { collectionStorageKey, deleteRecord, draftFor, parseStoredRecords, photoReferences, selectRecords, upsertRecord, valuesFor, type DraftValues, type RuntimeRecord } from './records';

interface Props extends ProjectProps {
  app: MiniApp;
  onDirtyChange?(dirty: boolean): void;
}
type CollectionRecords = Record<string, RuntimeRecord[]>;
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function themeContrast(color: string): { ink: string; onColor: string } {
  const linear = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? { ink: '#374151', onColor: '#000000' } : { ink: color, onColor: '#fff' };
}

function fieldText(field: Field | undefined, value: string | number | boolean | undefined): string {
  if (value === undefined || value === '') return 'Niet ingevuld';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nee';
  if (typeof value === 'number') return value.toLocaleString('nl-NL', {
    maximumSignificantDigits: 21,
    notation: value !== 0 && Math.abs(value) < 0.000001 ? 'scientific' : 'standard',
  });
  if (field?.type === 'date') {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return value;
}

export default function NativeMiniApp({ app, storage, media, onBusyChange, onDirtyChange }: Props) {
  const [activeScreenID, setActiveScreenID] = useState(app.homeScreen);
  const [allRecords, setAllRecords] = useState<CollectionRecords>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [detailID, setDetailID] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingID, setEditingID] = useState<string | undefined>();
  const [draft, setDraft] = useState<DraftValues>({});
  const [baseline, setBaseline] = useState<DraftValues>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  // Draft photos and orphaned files only; referenced persisted photos are never cleaned on cancel.
  const pendingPhotos = useRef(new Set<string>());
  const screen = app.screens.find((entry) => entry.id === activeScreenID) ?? app.screens[0];
  const collection = app.collections.find((entry) => entry.id === screen.collection)!;
  const records = allRecords[collection.id] ?? [];
  const visibleRecords = useMemo(() => selectRecords(records, screen, query), [records, screen, query]);
  const detail = records.find((entry) => entry.id === detailID);
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(baseline);
  const accent = app.theme?.color ?? '#4f46e5';
  const contrast = themeContrast(accent);
  const titleField = collection.fields.find((field) => field.id === screen.titleField);
  const subtitleField = collection.fields.find((field) => field.id === screen.subtitleField);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void Promise.all(app.collections.map(async (entry) => {
      const stored = await storage.getItem<unknown>(collectionStorageKey(entry.id));
      return [entry.id, parseStoredRecords(entry, stored)] as const;
    })).then((entries) => {
      if (active) setAllRecords(Object.fromEntries(entries));
    }).catch((error: unknown) => {
      if (active) setLoadError(errorText(error, 'Je gegevens konden niet worden geladen. Ze blijven bewaard.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [app, storage, reload]);

  async function cleanPhotos(references: Iterable<string>): Promise<boolean> {
    let complete = true;
    for (const reference of new Set(references)) {
      try { await media.removePhoto(reference); pendingPhotos.current.delete(reference); }
      catch { complete = false; }
    }
    return complete;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // If a save is finishing, its finally block cleans only references that remain uncommitted.
      if (!lock.current) void cleanPhotos(pendingPhotos.current);
    };
  }, [media]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  function startAction() {
    if (!mounted.current || lock.current || loading || loadError) return false;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    return true;
  }
  function finishAction() {
    lock.current = false;
    onBusyChange?.(false);
    if (mounted.current) setBusy(false);
    else void cleanPhotos(pendingPhotos.current);
  }
  function resetEditor() {
    setEditing(false);
    setEditingID(undefined);
    setDraft({});
    setBaseline({});
    setFormError(null);
  }
  function openEditor(record?: RuntimeRecord) {
    if (!mounted.current || lock.current) return;
    const next = draftFor(collection, record);
    setDraft(next);
    setBaseline(next);
    setEditingID(record?.id);
    setFormError(null);
    setEditing(true);
  }
  async function discardEditor(after?: () => void) {
    if (!startAction()) return;
    try {
      const cleaned = await cleanPhotos(pendingPhotos.current);
      if (mounted.current) {
        if (!cleaned) setNotice('Een ongebruikte foto kon nog niet worden opgeruimd. Je opgeslagen gegevens zijn behouden.');
        resetEditor();
        after?.();
      }
    } finally { finishAction(); }
  }
  function navigate(action: () => void) {
    if (!mounted.current || lock.current) return;
    if (!editing) { action(); return; }
    if (!dirty) { void discardEditor(action); return; }
    Alert.alert('Wijzigingen weggooien?', 'Je wijzigingen zijn nog niet opgeslagen.', [
      { text: 'Verder bewerken', style: 'cancel' },
      { text: 'Weggooien', style: 'destructive', onPress: () => { void discardEditor(action); } },
    ]);
  }
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lock.current) return true;
      if (editing) { navigate(() => {}); return true; }
      if (detailID) { setDetailID(null); return true; }
      return false;
    });
    return () => listener.remove();
  }, [editing, dirty, detailID, draft, baseline]);

  function referencedPhotos(nextRecords: CollectionRecords): Set<string> {
    return new Set(app.collections.flatMap((entry) => (nextRecords[entry.id] ?? [])
      .flatMap((record) => photoReferences(entry, record.values))));
  }
  async function save() {
    if (!mounted.current || lock.current) return;
    let values: RecordValues;
    try { values = valuesFor(collection, draft); }
    catch (error) { setFormError(errorText(error, 'Controleer je invoer.')); return; }
    if (!startAction()) return;
    setFormError(null);
    try {
      const result = upsertRecord(collection, records, values, { id: editingID });
      await storage.setItem(collectionStorageKey(collection.id), result.records);
      const nextAll = { ...allRecords, [collection.id]: result.records };
      const kept = referencedPhotos(nextAll);
      // A successful write transfers ownership before any asynchronous cleanup or unmount.
      for (const reference of kept) pendingPhotos.current.delete(reference);
      const previous = records.find((entry) => entry.id === editingID);
      const unused = [...pendingPhotos.current, ...(previous ? photoReferences(collection, previous.values) : [])]
        .filter((reference) => !kept.has(reference));
      for (const reference of unused) pendingPhotos.current.add(reference);
      if (mounted.current) {
        setAllRecords(nextAll);
        resetEditor();
        setDetailID(result.record.id);
      }
      const cleaned = await cleanPhotos(unused);
      if (!cleaned && mounted.current) setNotice('Je item is opgeslagen. Een oude foto kon nog niet worden opgeruimd.');
    } catch (error) {
      if (mounted.current) setFormError(errorText(error, 'Opslaan is niet gelukt. Je invoer staat nog klaar.'));
    } finally { finishAction(); }
  }

  async function remove(record: RuntimeRecord) {
    if (!startAction()) return;
    try {
      const next = deleteRecord(records, record.id);
      await storage.setItem(collectionStorageKey(collection.id), next);
      const nextAll = { ...allRecords, [collection.id]: next };
      const kept = referencedPhotos(nextAll);
      if (mounted.current) {
        setAllRecords(nextAll);
        setDetailID(null);
      }
      const unused = photoReferences(collection, record.values).filter((reference) => !kept.has(reference));
      for (const reference of unused) pendingPhotos.current.add(reference);
      if (!await cleanPhotos(unused) && mounted.current) setNotice('Je item is verwijderd. Een fotobestand kon nog niet worden opgeruimd.');
    } catch (error) { if (mounted.current) Alert.alert('Verwijderen niet gelukt', errorText(error, 'Je item is behouden. Probeer opnieuw.')); }
    finally { finishAction(); }
  }
  function confirmDelete(record: RuntimeRecord) {
    Alert.alert('Item verwijderen?', `“${fieldText(titleField, record.values[screen.titleField])}” wordt definitief verwijderd.`, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: () => { void remove(record); } },
    ]);
  }
  async function pickPhoto(field: Field) {
    if (!startAction()) return;
    setFormError(null);
    try {
      const reference = await media.pickPhoto();
      if (reference) {
        pendingPhotos.current.add(reference);
        if (mounted.current) setDraft((previous) => ({ ...previous, [field.id]: reference }));
      }
    } catch (error) { if (mounted.current) setFormError(errorText(error, 'De foto kon niet worden toegevoegd.')); }
    finally { finishAction(); }
  }
  function requestPhoto(field: Field) {
    Alert.alert('Foto toevoegen?', `Je kiest zelf één foto voor “${app.name}”. Een kopie wordt binnen dit project op je iPhone bewaard.`, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Foto kiezen', onPress: () => { void pickPhoto(field); } },
    ]);
  }
  function changeField(field: Field, value: string | boolean) {
    setDraft((previous) => ({ ...previous, [field.id]: value }));
    setFormError(null);
  }
  function renderField(field: Field) {
    const value = draft[field.id];
    const label = `${field.label}${field.required ? ' *' : ''}`;
    if (field.type === 'boolean') {
      if (field.required) return <View key={field.id} style={styles.switchRow}>
        <Text style={[styles.label, styles.flex]}>{label}</Text>
        <Switch accessibilityLabel={field.label} value={value === true} disabled={busy} onValueChange={(next) => changeField(field, next)} trackColor={{ true: accent }} />
      </View>;
      return <View key={field.id} style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.chips}>
        {([{ label: 'Niet ingevuld', value: '' }, { label: 'Ja', value: true }, { label: 'Nee', value: false }] as const).map((option) =>
          <Pressable key={option.label} accessibilityRole="radio" accessibilityLabel={`${field.label}: ${option.label}`}
            accessibilityState={{ checked: value === option.value, disabled: busy }} disabled={busy}
            onPress={() => changeField(field, option.value)} style={[styles.chip, value === option.value && { borderColor: accent, backgroundColor: '#eef2ff' }]}>
            <Text style={[styles.chipText, value === option.value && { color: contrast.ink, fontWeight: '700' }]}>{option.label}</Text>
          </Pressable>)}
      </View></View>;
    }
    if (field.type === 'choice') return <View key={field.id} style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>{(field.options ?? []).map((option) => <Pressable key={option} accessibilityRole="radio"
        accessibilityLabel={`${field.label}: ${option}`} accessibilityState={{ checked: value === option, disabled: busy }} disabled={busy}
        onPress={() => changeField(field, value === option && !field.required ? '' : option)}
        style={[styles.chip, value === option && { borderColor: accent, backgroundColor: '#eef2ff' }]}>
        <Text style={[styles.chipText, value === option && { color: contrast.ink, fontWeight: '700' }]}>{option}</Text>
      </Pressable>)}</View>
      {!field.required && value ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => changeField(field, '')} style={styles.clearButton}><Text style={styles.meta}>Keuze wissen</Text></Pressable> : null}
    </View>;
    if (field.type === 'photo') {
      const uri = typeof value === 'string' && value ? media.resolvePhoto(value) : null;
      return <View key={field.id} style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        {uri ? <Image source={{ uri }} style={styles.photoPreview} accessibilityLabel={field.label} /> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => requestPhoto(field)} style={styles.photoButton}>
          <Text style={[styles.secondaryText, { color: contrast.ink }]}>{value ? 'Andere foto kiezen' : 'Foto kiezen'}</Text>
        </Pressable>
        {value ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => changeField(field, '')} style={styles.secondary}><Text style={styles.deleteText}>Foto weghalen</Text></Pressable> : null}
      </View>;
    }
    return <View key={field.id} style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={field.label} value={String(value ?? '')} editable={!busy} onChangeText={(text) => changeField(field, text)}
        multiline={field.type === 'multiline'} textAlignVertical={field.type === 'multiline' ? 'top' : 'center'}
        keyboardType={field.type === 'number' ? 'numbers-and-punctuation' : field.type === 'date' ? 'numbers-and-punctuation' : 'default'}
        autoCapitalize={field.type === 'date' ? 'none' : 'sentences'} autoCorrect={field.type !== 'date' && field.type !== 'number'}
        maxLength={field.type === 'multiline' ? 10000 : field.type === 'date' ? 10 : field.type === 'number' ? 50 : 500}
        placeholder={field.type === 'date' ? 'JJJJ-MM-DD' : field.type === 'number' ? '0' : field.label}
        placeholderTextColor="#9ca3af" style={[styles.input, field.type === 'multiline' && styles.multiline]} />
      {field.type === 'date' ? <Text style={styles.hint}>Jaar-maand-dag, bijvoorbeeld 2026-10-19.</Text> : null}
    </View>;
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={accent} size="large" /><Text style={styles.meta}>Je gegevens laden…</Text></View>;
  if (loadError) return <View style={styles.center}>
    <Text style={styles.sectionTitle}>Je gegevens blijven bewaard</Text><Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
    <Pressable accessibilityRole="button" onPress={() => setReload((value) => value + 1)} style={[styles.primary, { backgroundColor: accent }]}><Text style={[styles.primaryText, { color: contrast.onColor }]}>Opnieuw proberen</Text></Pressable>
  </View>;

  const header = <View style={styles.header}>
    <View style={styles.titleRow}>
      <View style={styles.flex}><Text style={[styles.eyebrow, { color: contrast.ink }]}>{app.name.toLocaleUpperCase('nl-NL')}</Text><Text style={styles.title}>{screen.title}</Text></View>
      {!editing && !detail && <View style={styles.count}><Text style={[styles.countText, { color: contrast.ink }]}>{records.length}</Text></View>}
    </View>
    {app.screens.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {app.screens.map((entry) => <Pressable key={entry.id} accessibilityRole="tab" accessibilityState={{ selected: entry.id === screen.id, disabled: busy }}
        disabled={busy} onPress={() => { if (entry.id !== screen.id) navigate(() => { setActiveScreenID(entry.id); setDetailID(null); setQuery(''); }); }}
        style={[styles.tab, entry.id === screen.id && styles.activeTab]}><Text style={[styles.tabText, entry.id === screen.id && { color: contrast.ink, fontWeight: '700' }]}>{entry.title}</Text></Pressable>)}
    </ScrollView>}
    {notice && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.noticeText}>{notice}</Text><Pressable accessibilityRole="button" accessibilityLabel="Melding sluiten" onPress={() => setNotice(null)} style={styles.dismiss}><Text style={styles.meta}>Sluiten</Text></Pressable></View>}
  </View>;

  if (editing) return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={94}>
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {header}<View style={styles.form}>
        <Text style={styles.sectionTitle}>{editingID ? 'Item bewerken' : 'Nieuw item'}</Text>
        {collection.fields.some((field) => field.required) && <Text style={styles.hint}>Velden met * zijn verplicht.</Text>}
        {collection.fields.map(renderField)}
        {formError && <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void save(); }} style={[styles.primary, { backgroundColor: accent }, busy && styles.disabled]}>
          {busy ? <ActivityIndicator color={contrast.onColor} /> : <Text style={[styles.primaryText, { color: contrast.onColor }]}>Opslaan</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => navigate(() => {})} style={styles.secondary}><Text style={[styles.secondaryText, { color: contrast.ink }]}>Annuleren</Text></Pressable>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;

  if (detail) return <ScrollView style={styles.root} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    {header}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => setDetailID(null)} style={styles.back}><Text style={[styles.secondaryText, { color: contrast.ink }]}>‹ Terug naar de lijst</Text></Pressable>
    <View style={styles.detailCard}>
      <Text style={styles.detailTitle}>{fieldText(titleField, detail.values[screen.titleField])}</Text>
      {collection.fields.map((field) => {
        const value = detail.values[field.id];
        if (field.type === 'photo') {
          const uri = typeof value === 'string' ? media.resolvePhoto(value) : null;
          return <View key={field.id} style={styles.detailField}><Text style={styles.detailLabel}>{field.label}</Text>{uri ? <Image source={{ uri }} style={styles.photoPreview} accessibilityLabel={field.label} /> : <Text style={styles.meta}>Geen foto</Text>}</View>;
        }
        return <View key={field.id} style={styles.detailField}><Text style={styles.detailLabel}>{field.label}</Text><Text selectable style={styles.detailValue}>{fieldText(field, value)}</Text></View>;
      })}
      <Text style={styles.hint}>Bijgewerkt op {new Date(detail.updatedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => openEditor(detail)} style={[styles.primary, { backgroundColor: accent }, busy && styles.disabled]}><Text style={[styles.primaryText, { color: contrast.onColor }]}>Bewerken</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => confirmDelete(detail)} style={styles.secondary}><Text style={styles.deleteText}>Item verwijderen</Text></Pressable>
    </View>
  </ScrollView>;

  return <View style={styles.root}>
    <FlatList key={`${screen.id}-${screen.layout}`} data={visibleRecords} keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled" numColumns={screen.layout === 'grid' ? 2 : 1}
      columnWrapperStyle={screen.layout === 'grid' ? styles.gridRow : undefined}
      contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
      ListHeaderComponent={<>{header}<View style={styles.listActions}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => openEditor()} style={[styles.primary, { backgroundColor: accent }]}><Text style={[styles.primaryText, { color: contrast.onColor }]}>+ Nieuw item</Text></Pressable>
        <TextInput accessibilityLabel={`Zoeken in ${screen.title}`} value={query} onChangeText={setQuery} placeholder="Zoek in je items…" placeholderTextColor="#9ca3af" style={styles.search} clearButtonMode="while-editing" autoCorrect={false} />
        {!!query && <Text style={styles.meta}>{visibleRecords.length} {visibleRecords.length === 1 ? 'resultaat' : 'resultaten'}</Text>}
      </View></>}
      ListEmptyComponent={<View style={styles.empty}><View style={styles.emptySymbol}><Text style={[styles.emptySymbolText, { color: contrast.ink }]}>{query ? '?' : '+'}</Text></View>
        <Text style={styles.sectionTitle}>{query ? 'Geen resultaten' : 'Begin met je eerste item'}</Text>
        <Text style={styles.emptyText}>{query ? 'Probeer een andere zoekterm of wis je zoekopdracht.' : `Voeg iets toe aan ${collection.title.toLocaleLowerCase('nl-NL')}. Je bewaart het op deze iPhone.`}</Text>
        {query ? <Pressable accessibilityRole="button" onPress={() => setQuery('')} style={styles.secondary}><Text style={[styles.secondaryText, { color: contrast.ink }]}>Zoekopdracht wissen</Text></Pressable> : null}
      </View>}
      renderItem={({ item }) => {
        const title = fieldText(titleField, item.values[screen.titleField]);
        const imageReference = screen.imageField ? item.values[screen.imageField] : undefined;
        const uri = typeof imageReference === 'string' ? media.resolvePhoto(imageReference) : null;
        const grid = screen.layout === 'grid';
        return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, details openen`} disabled={busy}
          onPress={() => setDetailID(item.id)} style={[styles.item, grid ? styles.gridItem : styles.listItem]}>
          {screen.imageField && (uri ? <Image source={{ uri }} style={grid ? styles.gridPhoto : styles.listPhoto} />
            : <View style={[styles.placeholder, grid ? styles.gridPhoto : styles.listPhoto]}><Text style={[styles.initial, { color: contrast.ink }]}>{title.slice(0, 1).toUpperCase()}</Text></View>)}
          <View style={[styles.itemText, !grid && styles.flex]}><Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
            {screen.subtitleField && item.values[screen.subtitleField] !== undefined && <Text style={styles.meta} numberOfLines={2}>{fieldText(subtitleField, item.values[screen.subtitleField])}</Text>}
          </View>{!grid && <Text style={styles.chevron}>›</Text>}
        </Pressable>;
      }}
      ListFooterComponent={<Text style={styles.footer}>Alleen op deze iPhone · {app.name}</Text>}
    />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9ff' },
  flex: { flex: 1 },
  center: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: '#f8f9ff' },
  scrollContent: { padding: 22, paddingBottom: 56, gap: 18 },
  listContent: { padding: 22, paddingBottom: 42 },
  header: { gap: 20, paddingTop: 6, paddingBottom: 4 },
  titleRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, marginBottom: 8 },
  title: { color: '#111827', fontSize: 30, lineHeight: 37, fontWeight: '700', letterSpacing: -0.8 },
  count: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#eef2ff', justifyContent: 'center', alignItems: 'center' },
  countText: { fontSize: 19, fontWeight: '700' },
  tabs: { gap: 8 },
  tab: { minHeight: 44, paddingHorizontal: 16, borderRadius: 13, justifyContent: 'center', backgroundColor: '#eff0f6' },
  activeTab: { backgroundColor: '#e6e9fc' },
  tabText: { color: '#6b7280', fontSize: 14 },
  listActions: { gap: 14, paddingTop: 20, paddingBottom: 20 },
  primary: { minHeight: 50, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  secondary: { minHeight: 44, justifyContent: 'center', alignItems: 'center', padding: 10 },
  secondaryText: { fontSize: 14, fontWeight: '600' },
  search: { minHeight: 48, padding: 13, borderRadius: 13, borderColor: '#e4e7f0', borderWidth: 1, backgroundColor: '#fff', color: '#111827', fontSize: 15 },
  gridRow: { gap: 12 },
  item: { borderRadius: 18, borderWidth: 1, borderColor: '#e7e9f2', backgroundColor: '#fff', marginBottom: 12, overflow: 'hidden' },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 13, minHeight: 82 },
  gridItem: { flex: 1, maxWidth: '48.5%' },
  itemText: { padding: 14, gap: 5 },
  itemTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: '#111827' },
  chevron: { fontSize: 25, color: '#a1a7b5' },
  gridPhoto: { width: '100%', height: 156, backgroundColor: '#eef0f7' },
  listPhoto: { width: 58, height: 64, borderRadius: 12, backgroundColor: '#eef0f7' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 28, fontWeight: '500' },
  meta: { fontSize: 13, color: '#6b7280', lineHeight: 20 },
  empty: { padding: 24, paddingVertical: 32, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', gap: 13 },
  emptySymbol: { width: 60, height: 60, backgroundColor: '#eef2ff', borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  emptySymbolText: { fontSize: 30, fontWeight: '400' },
  sectionTitle: { color: '#111827', fontSize: 19, fontWeight: '700' },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 23 },
  footer: { fontSize: 11, color: '#8c94a5', textAlign: 'center', marginTop: 20, lineHeight: 19 },
  form: { padding: 20, gap: 16, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e7e9f2' },
  field: { gap: 9 },
  label: { color: '#374151', fontSize: 14, lineHeight: 21, fontWeight: '600' },
  hint: { color: '#8590a2', fontSize: 12, lineHeight: 19 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#e4e7f0', borderRadius: 12, color: '#111827', fontSize: 16, padding: 13, backgroundColor: '#fafbff' },
  multiline: { minHeight: 150, lineHeight: 24 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 46 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, borderWidth: 1, borderColor: '#e4e7f0', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, justifyContent: 'center' },
  chipText: { fontSize: 13, color: '#6b7280' },
  clearButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  photoPreview: { width: '100%', height: 240, backgroundColor: '#eef0f7', borderRadius: 14, resizeMode: 'cover' },
  photoButton: { minHeight: 48, borderColor: '#dfe2f1', borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 12 },
  disabled: { opacity: 0.5 },
  error: { color: '#b91c1c', fontSize: 14, lineHeight: 22 },
  back: { minHeight: 44, justifyContent: 'center' },
  detailCard: { padding: 22, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e9f2', gap: 20 },
  detailTitle: { color: '#111827', fontSize: 24, lineHeight: 31, fontWeight: '700' },
  detailField: { gap: 7 },
  detailLabel: { color: '#8c94a5', fontSize: 12, fontWeight: '600' },
  detailValue: { color: '#374151', fontSize: 16, lineHeight: 25 },
  deleteText: { color: '#be123c', fontSize: 14, fontWeight: '500' },
  notice: { backgroundColor: '#fff7e8', padding: 14, borderRadius: 12, gap: 3 },
  noticeText: { color: '#854d0e', fontSize: 13, lineHeight: 20 },
  dismiss: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: 8 },
});
