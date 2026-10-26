import { validateDocument, validateItems } from './domain.mjs';
const DATABASE = 'apphub-web-wardrobe-v1';
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Lokale opslag is niet beschikbaar. Open dit project in een normale browsersessie.'));
    const request = indexedDB.open(DATABASE, 1);
    let finished = false;
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onerror = () => { finished = true; reject(new Error('Je kledingkast kan niet worden geopend. Controleer de vrije opslagruimte.')); };
    request.onblocked = () => { finished = true; reject(new Error('Sluit andere vensters met dit project en probeer opnieuw.')); };
    request.onsuccess = () => {
      if (finished) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
export async function loadDocument() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('documents', 'readonly');
    const request = transaction.objectStore('documents').get('wardrobe');
    let value;
    request.onsuccess = () => { value = request.result; };
    transaction.oncomplete = () => {
      db.close();
      try { resolve(validateDocument(value)); } catch (error) { reject(error); }
    };
    transaction.onabort = () => { db.close(); reject(new Error('Je kledingkast laden is mislukt. Je gegevens zijn behouden.')); };
    transaction.onerror = () => {};
  });
}
export async function saveDocument(items, revision) {
  const validated = validateItems(items);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('documents', 'readwrite');
    const store = transaction.objectStore('documents');
    const request = store.get('wardrobe');
    let failure;
    let document;
    request.onsuccess = () => {
      try {
        const current = validateDocument(request.result);
        if (current.revision !== revision) throw new Error('Dit project is in een ander venster gewijzigd. Herlaad de pagina voordat je verdergaat.');
        document = { schemaVersion: 1, revision: revision + 1, items: validated };
        store.put(document, 'wardrobe');
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(document); };
    transaction.onabort = () => { db.close(); reject(failure ?? new Error('Opslaan is mislukt. Controleer de vrije opslagruimte; je eerdere gegevens zijn behouden.')); };
    transaction.onerror = () => {};
  });
}
