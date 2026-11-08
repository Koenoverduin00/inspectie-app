// Lokale opslag in IndexedDB: werkt offline in het veld.
const DB_NAAM = 'inspectie-app';
const DB_VERSIE = 1;
export const STORES = ['objecten', 'inspecties', 'fotos'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAAM, DB_VERSIE);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const naam of STORES) {
          if (!db.objectStoreNames.contains(naam)) db.createObjectStore(naam, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, modus, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, modus);
    const resultaat = fn(t.objectStore(store));
    t.oncomplete = () => resolve(resultaat?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const alle = (store) => tx(store, 'readonly', (s) => s.getAll());
export const haal = (store, id) => tx(store, 'readonly', (s) => s.get(id));
export const bewaar = (store, item) => tx(store, 'readwrite', (s) => s.put(item));
export const verwijder = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));
export const leeg = (store) => tx(store, 'readwrite', (s) => s.clear());

export async function bewaarVeel(store, items) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    items.forEach((i) => s.put(i));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function exporteer() {
  const data = { app: 'inspectie-app', versie: 1, geexporteerd: new Date().toISOString() };
  for (const store of STORES) data[store] = await alle(store);
  return data;
}

export async function importeer(data, { vervangen = false } = {}) {
  if (!data || data.app !== 'inspectie-app') throw new Error('Geen geldig back-upbestand van de inspectie-app.');
  for (const store of STORES) {
    if (vervangen) await leeg(store);
    if (Array.isArray(data[store])) await bewaarVeel(store, data[store].filter((i) => i && i.id));
  }
}
