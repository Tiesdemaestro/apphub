import { PROJECT_ID, validateDocument, validateNotes } from './domain.mjs';
function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Lokale opslag is niet beschikbaar.'));
    const request = indexedDB.open(`apphub-web-${PROJECT_ID}`, 1);
    let failed = false;
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onerror = () => { failed = true; reject(new Error('De lokale opslag kan niet worden geopend.')); };
    request.onblocked = () => { failed = true; reject(new Error('Sluit andere vensters met dit project en probeer opnieuw.')); };
    request.onsuccess = () => { if (failed) return request.result.close(); request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}
export async function loadDocument() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const request = tx.objectStore('documents').get('state');
    let value;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => { db.close(); try { resolve(validateDocument(value)); } catch (error) { reject(error); } };
    tx.onabort = () => { db.close(); reject(new Error('Laden is mislukt. De gegevens zijn niet gewijzigd.')); };
    tx.onerror = () => {};
  });
}
export async function saveDocument(notes, revision) {
  const clean = validateNotes(notes);
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const request = store.get('state');
    let failure, result;
    request.onsuccess = () => {
      try {
        if (validateDocument(request.result).revision !== revision) throw new Error('Een ander venster heeft je notities gewijzigd. Herlaad de pagina.');
        result = { schemaVersion: 1, revision: revision + 1, notes: clean };
        store.put(result, 'state');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(failure ?? new Error('Bewaren is mislukt. Controleer de vrije opslagruimte. Je invoer staat nog klaar.')); };
    tx.onerror = () => {};
  });
}
