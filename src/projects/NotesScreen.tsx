import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { ProjectProps } from '../sdk/types';

type Note = { id: string; title: string; body: string; updatedAt: string };
const STORAGE_KEY = 'notes.v1';
const messageFor = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function isNoteList(value: unknown): value is Note[] {
  return Array.isArray(value) && value.every((item: unknown) => {
    if (typeof item !== 'object' || item === null) return false;
    const note = item as Record<string, unknown>;
    return typeof note.id === 'string' && note.id.length > 0
      && typeof note.title === 'string' && note.title.trim().length > 0
      && typeof note.body === 'string' && typeof note.updatedAt === 'string'
      && !Number.isNaN(Date.parse(note.updatedAt));
  }) && new Set(value.map((item) => item.id)).size === value.length;
}

export default function NotesScreen({ storage, onBusyChange }: ProjectProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const stored = await storage.getItem<unknown>(STORAGE_KEY);
        if (stored !== null && !isNoteList(stored)) throw new Error('De opgeslagen notities konden niet worden gelezen. Je gegevens worden niet overschreven.');
        if (active) setNotes(stored ?? []);
      } catch (error) {
        if (active) setLoadError(messageFor(error, 'Je notities laden is niet gelukt.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [storage, reload]);

  function startAction() {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    return true;
  }
  function finishAction() { lock.current = false; setBusy(false); onBusyChange?.(false); }

  function openNote(note?: Note) {
    setEditingId(note?.id ?? null);
    setTitle(note?.title ?? '');
    setBody(note?.body ?? '');
    setFormError(null);
    setEditing(true);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  function closeEditor() {
    setEditing(false);
    setEditingId(null);
    setTitle('');
    setBody('');
    setFormError(null);
  }

  function cancelEdit() {
    const original = notes.find((note) => note.id === editingId);
    if (title !== (original?.title ?? '') || body !== (original?.body ?? '')) {
      Alert.alert('Wijzigingen weggooien?', 'Deze wijzigingen zijn nog niet opgeslagen.', [
        { text: 'Verder schrijven', style: 'cancel' },
        { text: 'Weggooien', style: 'destructive', onPress: closeEditor },
      ]);
    } else closeEditor();
  }

  async function saveNote() {
    if (!title.trim()) { setFormError('Geef je notitie eerst een titel.'); return; }
    if (!startAction()) return;
    setFormError(null);
    const note: Note = {
      id: editingId ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      title: title.trim(), body: body.trim(), updatedAt: new Date().toISOString(),
    };
    const next = [note, ...notes.filter((existing) => existing.id !== note.id)];
    try {
      await storage.setItem(STORAGE_KEY, next);
      setNotes(next);
      closeEditor();
    } catch (error) {
      setFormError(messageFor(error, 'Opslaan is niet gelukt. Je tekst staat nog klaar.'));
    } finally { finishAction(); }
  }

  function confirmDelete(note: Note) {
    Alert.alert('Notitie verwijderen?', `“${note.title}” wordt definitief verwijderd.`, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: () => { void deleteNote(note); } },
    ]);
  }

  async function deleteNote(note: Note) {
    if (!startAction()) return;
    try {
      const next = notes.filter((entry) => entry.id !== note.id);
      await storage.setItem(STORAGE_KEY, next);
      setNotes(next);
      if (editingId === note.id) closeEditor();
    } catch (error) {
      Alert.alert('Verwijderen niet gelukt', messageFor(error, 'Je notitie is behouden. Probeer opnieuw.'));
    } finally { finishAction(); }
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#4f46e5" /><Text style={styles.meta}>Je notities laden…</Text></View>;
  if (loadError) return <View style={styles.loading}>
    <Text style={styles.sectionTitle}>Laden is niet gelukt</Text><Text style={styles.error}>{loadError}</Text>
    <Pressable accessibilityRole="button" onPress={() => setReload((value) => value + 1)} style={styles.primary}><Text style={styles.primaryText}>Opnieuw proberen</Text></Pressable>
  </View>;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>RUIMTE VOOR IDEEËN</Text>
        <Text style={styles.title}>Mijn notities</Text>
        <Text style={styles.subtitle}>Leg vast wat je wilt onthouden.</Text>
        {!editing ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => openNote()} style={styles.primary}>
          <Text style={styles.primaryText}>+ Nieuwe notitie</Text>
        </Pressable> : <View style={styles.form}>
          <Text style={styles.sectionTitle}>{editingId ? 'Notitie bewerken' : 'Nieuwe notitie'}</Text>
          <Text style={styles.label}>Titel</Text>
          <TextInput value={title} onChangeText={setTitle} accessibilityLabel="Titel van de notitie" style={styles.input} placeholder="Waar gaat je notitie over?" placeholderTextColor="#9ca3af" maxLength={120} editable={!busy} />
          <Text style={styles.label}>Je notitie</Text>
          <TextInput value={body} onChangeText={setBody} accessibilityLabel="Inhoud van de notitie" style={[styles.input, styles.bodyInput]} multiline textAlignVertical="top" placeholder="Begin hier met schrijven…" placeholderTextColor="#9ca3af" maxLength={20000} editable={!busy} />
          <Text style={styles.characterCount}>{body.length.toLocaleString('nl-NL')} / 20.000 tekens</Text>
          {formError && <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void saveNote(); }} style={[styles.primary, busy && styles.disabled]}>
            <Text style={styles.primaryText}>{busy ? 'Opslaan…' : 'Notitie opslaan'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={cancelEdit} style={styles.secondary}><Text style={styles.secondaryText}>Annuleren</Text></Pressable>
        </View>}

        {!editing && <>
          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Alle notities</Text><Text style={styles.meta}>{notes.length}</Text></View>
          {notes.length === 0 ? <View style={styles.empty}>
            <View style={styles.emptySymbol}><Text style={styles.emptySymbolText}>Aa</Text></View>
            <Text style={styles.emptyTitle}>Begin met een gedachte</Text>
            <Text style={styles.emptyText}>Je eerste notitie hoeft niet perfect te zijn. Je kunt hem later altijd aanpassen.</Text>
          </View> : notes.map((note) => <View key={note.id} style={styles.noteCard}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Notitie ${note.title} bewerken`} disabled={busy} onPress={() => openNote(note)} style={styles.noteContent}>
              <Text style={styles.noteTitle}>{note.title}</Text>
              <Text style={styles.noteBody} numberOfLines={3}>{note.body || 'Deze notitie heeft alleen een titel.'}</Text>
            </Pressable>
            <View style={styles.noteFooter}>
              <Text style={styles.meta}>Bijgewerkt {new Date(note.updatedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Notitie ${note.title} verwijderen`} disabled={busy} onPress={() => confirmDelete(note)} style={styles.deleteButton}>
                <Text style={styles.deleteText}>Verwijderen</Text>
              </Pressable>
            </View>
          </View>)}
          <Text style={styles.footer}>Opgeslagen op deze iPhone, in je eigen notitieproject.</Text>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingBottom: 52, gap: 18 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 18, backgroundColor: '#fff' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#4f46e5', marginTop: 10 },
  title: { color: '#111827', fontSize: 31, fontWeight: '700', letterSpacing: -1, marginTop: -7 },
  subtitle: { color: '#6b7280', fontSize: 15, lineHeight: 23, marginTop: -8, marginBottom: 8 },
  primary: { minHeight: 48, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 13, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 10 },
  secondaryText: { color: '#4f46e5', fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  form: { padding: 18, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 18, gap: 10 },
  sectionTitle: { color: '#111827', fontSize: 19, fontWeight: '700' },
  label: { fontSize: 13, color: '#374151', fontWeight: '600', marginTop: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 16, color: '#111827', backgroundColor: '#fff' },
  bodyInput: { minHeight: 180, lineHeight: 24 },
  characterCount: { color: '#9ca3af', fontSize: 11, textAlign: 'right' },
  error: { color: '#b91c1c', fontSize: 14, lineHeight: 21 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  meta: { color: '#6b7280', fontSize: 12, lineHeight: 19 },
  empty: { paddingHorizontal: 26, paddingVertical: 36, borderRadius: 20, backgroundColor: '#f9fafb', alignItems: 'center', gap: 12 },
  emptySymbol: { backgroundColor: '#eef2ff', width: 62, height: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptySymbolText: { color: '#4f46e5', fontSize: 24, fontWeight: '600' },
  emptyTitle: { fontSize: 17, color: '#374151', fontWeight: '600', textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 23, color: '#6b7280', textAlign: 'center' },
  noteCard: { borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  noteContent: { padding: 18, gap: 8 },
  noteTitle: { color: '#111827', fontSize: 17, lineHeight: 24, fontWeight: '600' },
  noteBody: { color: '#6b7280', fontSize: 14, lineHeight: 22 },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 8, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  deleteButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center' },
  deleteText: { color: '#9f1239', fontSize: 12 },
  footer: { color: '#9ca3af', fontSize: 12, lineHeight: 20, textAlign: 'center', paddingTop: 8 },
});
