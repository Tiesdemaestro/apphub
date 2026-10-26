import { exportBackup, importBackup } from './domain.mjs';
import { loadDocument, saveDocument } from './storage.mjs';
const $ = id => document.getElementById(id);
let data = { revision: 0, notes: [] }, ready = false, busy = false, editingId = null;
function error(caught) { $('error').textContent = caught instanceof Error ? caught.message : 'Er ging iets mis.'; $('error').hidden = false; }
function lock(value) { busy = value; $('editor').disabled = value || !ready; document.querySelectorAll('button').forEach(button => { button.disabled = value || !ready; }); $('retry').disabled = value; }
function node(tag, content, className) { const element = document.createElement(tag); element.textContent = content; if (className) element.className = className; return element; }
function reset() { editingId = null; $('note-form').reset(); $('editor-title').textContent = 'Nieuwe notitie'; $('cancel').hidden = true; }
function dirty() { const original = data.notes.find(note => note.id === editingId); return $('title').value !== (original?.title ?? '') || $('body').value !== (original?.body ?? ''); }
function render() {
  $('notes').replaceChildren(); $('count').textContent = String(data.notes.length); $('empty').hidden = !ready || data.notes.length !== 0;
  for (const note of data.notes) {
    const card = document.createElement('article'); card.className = 'note';
    const updated = node('time', new Date(note.updatedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })); updated.dateTime = note.updatedAt;
    card.append(node('h3', note.title), node('p', note.body), updated);
    const actions = document.createElement('div'); actions.className = 'actions';
    const edit = node('button', 'Bewerken', 'secondary'); edit.setAttribute('aria-label', `${note.title} bewerken`);
    edit.addEventListener('click', () => { if (dirty() && !confirm('Niet-opgeslagen tekst weggooien?')) return; editingId = note.id; $('title').value = note.title; $('body').value = note.body; $('editor-title').textContent = 'Notitie bewerken'; $('cancel').hidden = false; $('title').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const remove = node('button', 'Verwijderen', 'danger'); remove.setAttribute('aria-label', `${note.title} verwijderen`);
    remove.addEventListener('click', () => run(async () => { if (!confirm(`“${note.title}” verwijderen?`)) return; await commit(data.notes.filter(item => item.id !== note.id)); if (editingId === note.id) reset(); }));
    actions.append(edit, remove); card.append(actions); $('notes').append(card);
  }
  lock(busy);
}
async function commit(notes) { data = await saveDocument(notes, data.revision); render(); $('status').textContent = 'Bewaard op dit apparaat'; }
async function run(action) { if (busy || !ready) return; lock(true); $('error').hidden = true; try { await action(); } catch (caught) { error(caught); } finally { lock(false); } }
async function load() {
  ready = false; lock(true); $('error').hidden = true; $('retry').hidden = true;
  try { data = await loadDocument(); ready = true; render(); $('status').textContent = 'Lokaal bewaard · geen account nodig'; }
  catch (caught) { error(caught); $('status').textContent = 'Je eerdere gegevens zijn niet overschreven.'; $('retry').hidden = false; }
  finally { lock(false); }
}
$('note-form').addEventListener('submit', event => { event.preventDefault(); void run(async () => {
  const note = { id: editingId ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, title: $('title').value.trim(), body: $('body').value, updatedAt: new Date().toISOString() };
  await commit([note, ...data.notes.filter(item => item.id !== note.id)]); reset();
}); });
$('cancel').addEventListener('click', () => { if (!dirty() || confirm('Niet-opgeslagen tekst weggooien?')) reset(); });
$('retry').addEventListener('click', load);
$('export').addEventListener('click', () => { try { $('backup-text').value = exportBackup(data.notes); $('backup-text').readOnly = true; $('backup').hidden = false; $('copy').hidden = false; $('restore').hidden = true; } catch (caught) { error(caught); } });
$('import').addEventListener('click', () => { $('backup-text').value = ''; $('backup-text').readOnly = false; $('backup').hidden = false; $('copy').hidden = true; $('restore').hidden = false; $('backup-text').focus(); });
$('restore').addEventListener('click', () => run(async () => { const notes = importBackup($('backup-text').value); if (!confirm(`Je huidige ${data.notes.length} notities vervangen door ${notes.length} notities? Niet-opgeslagen invoer gaat ook verloren.`)) return; await commit(notes); reset(); $('backup-text').value = ''; $('backup').hidden = true; }));
$('copy').addEventListener('click', async () => { const field = $('backup-text'); field.focus(); field.select(); field.setSelectionRange(0, field.value.length); try { await navigator.clipboard.writeText(field.value); $('status').textContent = 'Back-up gekopieerd. Bewaar hem op een veilige plek.'; } catch { $('status').textContent = 'Selecteer de back-uptekst en kies Kopieer in het tekstmenu.'; } });
$('clear').addEventListener('click', () => run(async () => { if (!confirm('Alle notities op dit apparaat verwijderen? Maak eerst een back-up als je ze wilt bewaren.')) return; await commit([]); reset(); $('backup-text').value = ''; $('backup').hidden = true; }));
window.addEventListener('beforeunload', event => { if (busy || dirty()) { event.preventDefault(); event.returnValue = ''; } });
void load();
