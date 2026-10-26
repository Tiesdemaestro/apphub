import { CATEGORY_LABELS, MAX_ITEMS, MAX_PHOTO_LENGTH, MAX_BACKUP_BYTES, missingCategories, makeOutfit, outfitCount, exportBackup, importBackup } from './domain.mjs';
import { loadDocument, saveDocument } from './storage.mjs';

const $ = id => document.getElementById(id);
let data = { schemaVersion: 1, revision: 0, items: [] };
let ready = false;
let busy = false;
let draftPhoto;
let variation = -1;
function showError(error, target = 'error') {
  $(target).textContent = error instanceof Error ? error.message : 'Dit is niet gelukt. Probeer opnieuw.';
  $(target).hidden = false;
}
function clearError(target = 'error') { $(target).hidden = true; $(target).textContent = ''; }
function setBusy(value) {
  busy = value;
  for (const control of document.querySelectorAll('button, input, select, textarea')) control.disabled = value || !ready;
  $('retry').disabled = value;
  $('outfit-button').disabled = value || !ready || !!missingCategories(data.items).length;
  $('add-button').disabled = value || !ready || data.items.length >= MAX_ITEMS;
}
function text(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}
function imageOrInitial(item, className) {
  if (!item.photo) return text('div', item.name.slice(0, 1).toUpperCase(), className === 'item-image' ? 'item-initial' : 'initial');
  const image = document.createElement('img');
  image.src = item.photo; image.alt = `Foto van ${item.name}`; image.className = className;
  image.loading = 'lazy';
  image.addEventListener('error', () => { image.replaceWith(text('div', item.name.slice(0, 1).toUpperCase(), className === 'item-image' ? 'item-initial' : 'initial')); }, { once: true });
  return image;
}
function render() {
  $('count').textContent = String(data.items.length);
  $('items').replaceChildren();
  for (const item of data.items) {
    const card = document.createElement('article'); card.className = 'item';
    card.append(imageOrInitial(item, 'item-image'));
    const body = document.createElement('div'); body.className = 'item-body';
    body.append(text('h3', item.name), text('p', `${CATEGORY_LABELS[item.category]}${item.color ? ` · ${item.color}` : ''}`));
    const remove = text('button', 'Verwijderen', 'delete');
    remove.setAttribute('aria-label', `${item.name} verwijderen`);
    remove.addEventListener('click', () => removeItem(item));
    body.append(remove); card.append(body); $('items').append(card);
  }
  $('empty').hidden = !ready || data.items.length !== 0;
  $('outfit-list').replaceChildren();
  const missing = missingCategories(data.items);
  $('outfit-hint').textContent = missing.length ? `Voeg nog toe: ${missing.map(category => CATEGORY_LABELS[category].toLowerCase()).join(', ')}.` : `${outfitCount(data.items)} mogelijke combinaties uit jouw kledingkast.`;
  $('outfit-button').textContent = variation < 0 ? 'Maak een outfit ↗' : 'Andere combinatie ↗';
  if (variation >= 0) for (const item of makeOutfit(data.items, variation)) {
    const row = document.createElement('div'); row.className = 'outfit-piece';
    row.append(imageOrInitial(item, 'outfit-image'));
    const label = document.createElement('div'); label.append(text('strong', item.name), text('small', CATEGORY_LABELS[item.category])); row.append(label); $('outfit-list').append(row);
  }
  setBusy(busy);
}
async function load() {
  ready = false; setBusy(true); clearError(); $('retry').hidden = true;
  $('status').textContent = 'Je kledingkast laden…';
  try { data = await loadDocument(); ready = true; render(); $('status').textContent = 'Lokaal bewaard · geen account nodig'; }
  catch (error) { showError(error); $('retry').hidden = false; $('status').textContent = 'Je bestaande gegevens zijn niet gewijzigd.'; }
  finally { setBusy(false); }
}
async function commit(items) {
  const next = await saveDocument(items, data.revision);
  data = next; variation = -1; render();
  $('status').textContent = `Bewaard om ${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
}
function closeForm() {
  $('item-form').reset(); $('item-form').hidden = true;
  draftPhoto = undefined; $('photo-preview').hidden = true; $('photo-preview').removeAttribute('src'); clearError('form-error');
}
function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('De foto kon niet worden gelezen.'));
    reader.readAsDataURL(blob);
  });
}
async function resizePhoto(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error('Kies een foto van maximaal 5 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Gebruik een JPG-, PNG- of WebP-foto.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('De foto laden duurt te lang. Probeer een andere.')), 12_000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('Deze foto kan niet worden geopend.')); };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 50_000_000) throw new Error('Deze foto is te groot om hier te verwerken.');
    const canvas = document.createElement('canvas');
    const factor = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * factor)); canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Je apparaat kan deze foto niet verwerken.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) continue;
      const result = await readAsDataUrl(blob);
      if (typeof result === 'string' && result.length <= MAX_PHOTO_LENGTH) return result;
    }
    throw new Error('Deze foto blijft te groot. Kies een kleinere afbeelding.');
  } finally { URL.revokeObjectURL(url); }
}
$('retry').addEventListener('click', load);
$('add-button').addEventListener('click', () => { $('item-form').hidden = false; $('item-name').focus(); });
$('cancel-item').addEventListener('click', closeForm);
$('item-photo').addEventListener('change', async event => {
  if (busy) return;
  const file = event.target.files[0]; if (!file) return;
  setBusy(true); clearError('form-error');
  try { draftPhoto = await resizePhoto(file); $('photo-preview').src = draftPhoto; $('photo-preview').hidden = false; }
  catch (error) { showError(error, 'form-error'); event.target.value = ''; }
  finally { setBusy(false); }
});
$('item-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !ready) return;
  setBusy(true); clearError('form-error');
  try {
    const item = { id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, name: $('item-name').value.trim(), category: $('item-category').value, color: $('item-color').value.trim(), ...(draftPhoto ? { photo: draftPhoto } : {}) };
    await commit([...data.items, item]); closeForm();
  } catch (error) { showError(error, 'form-error'); }
  finally { setBusy(false); }
});
async function removeItem(item) {
  if (busy || !ready || !confirm(`“${item.name}” uit je kledingkast verwijderen?`)) return;
  setBusy(true); clearError();
  try { await commit(data.items.filter(value => value.id !== item.id)); }
  catch (error) { showError(error); }
  finally { setBusy(false); }
}
$('outfit-button').addEventListener('click', () => { variation += 1; render(); });
$('export').addEventListener('click', () => {
  try {
    $('backup-text').value = exportBackup(data.items); $('backup-text').readOnly = true;
    $('backup-panel').hidden = false; $('copy-backup').hidden = false; $('restore-backup').hidden = true;
    $('backup-label').textContent = 'Bewaar deze back-uptekst';
  } catch (error) { showError(error); }
});
$('show-import').addEventListener('click', () => {
  $('backup-text').value = ''; $('backup-text').readOnly = false;
  $('backup-panel').hidden = false; $('copy-backup').hidden = true; $('restore-backup').hidden = false;
  $('backup-label').textContent = 'Plak je volledige back-uptekst'; $('backup-text').focus();
});
$('copy-backup').addEventListener('click', async () => {
  const field = $('backup-text'); field.focus(); field.select(); field.setSelectionRange(0, field.value.length);
  try { await navigator.clipboard.writeText(field.value); $('status').textContent = 'Back-up gekopieerd. Bewaar hem op een veilige plek.'; }
  catch { $('status').textContent = 'Selecteer de back-uptekst en kies Kopieer in het tekstmenu.'; }
});
$('restore-backup').addEventListener('click', async () => {
  if (busy || !ready) return;
  setBusy(true); clearError();
  try {
    const items = importBackup($('backup-text').value);
    if (!confirm(`Je huidige ${data.items.length} kledingstukken vervangen door ${items.length} kledingstukken uit deze back-up?`)) return;
    await commit(items); closeForm(); $('backup-panel').hidden = true; $('backup-text').value = '';
  } catch (error) { showError(error); }
  finally { setBusy(false); }
});
$('delete-all').addEventListener('click', async () => {
  if (busy || !ready || !confirm('Alle kledinggegevens en foto’s van dit project op dit apparaat verwijderen? Maak eerst een back-up als je ze wilt bewaren.')) return;
  setBusy(true); clearError();
  try { await commit([]); closeForm(); $('backup-text').value = ''; $('backup-panel').hidden = true; }
  catch (error) { showError(error); }
  finally { setBusy(false); }
});
window.addEventListener('beforeunload', event => {
  if (busy || (!$('item-form').hidden && ($('item-name').value || draftPhoto))) { event.preventDefault(); event.returnValue = ''; }
});
void load();
