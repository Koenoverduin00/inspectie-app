// Lokale opslag in IndexedDB: werkt offline in het veld.
// Wijzigingen aan objecten, inspecties en foto's worden in een wachtrij gezet
// zodat ze naar de server kunnen worden gesynchroniseerd zodra er verbinding is.
const DB_NAAM = 'inspectie-app';
const DB_VERSIE = 3;
export const STORES = ['objecten', 'inspecties', 'werkzaamheden', 'fotos'];
const WACHTRIJ = 'wachtrij';

let dbPromise;
const luisteraars = new Set();

/** Wordt aangeroepen na elke lokale wijziging die gesynchroniseerd moet worden. */
export function bijWijziging(fn) {
  luisteraars.add(fn);
}

function meld() {
  luisteraars.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAAM, DB_VERSIE);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const naam of [...STORES, WACHTRIJ]) {
          if (!db.objectStoreNames.contains(naam)) db.createObjectStore(naam, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// Voert fn uit binnen één transactie over de opgegeven stores.
async function tx(stores, modus, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, modus);
    const resultaat = fn(t);
    t.oncomplete = () => resolve(resultaat?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function zetInWachtrij(t, store, id, actie) {
  t.objectStore(WACHTRIJ).put({ id: `${store}:${id}`, store, recordId: id, actie, tijd: new Date().toISOString() });
}

export const alle = (store) => tx(store, 'readonly', (t) => t.objectStore(store).getAll());
export const haal = (store, id) => tx(store, 'readonly', (t) => t.objectStore(store).get(id));

export async function bewaar(store, item) {
  await bewaarVeel(store, [item]);
}

export async function bewaarVeel(store, items) {
  if (!items.length) return;
  await tx([store, WACHTRIJ], 'readwrite', (t) => {
    const s = t.objectStore(store);
    for (const item of items) {
      s.put(item);
      zetInWachtrij(t, store, item.id, 'opslaan');
    }
  });
  meld();
}

export async function verwijder(store, id) {
  await tx([store, WACHTRIJ], 'readwrite', (t) => {
    t.objectStore(store).delete(id);
    zetInWachtrij(t, store, id, 'verwijderen');
  });
  meld();
}

// ---- Functies voor de synchronisatie: wijzigen lokaal zonder wachtrij ----
export const sync = {
  wachtrij: () => tx(WACHTRIJ, 'readonly', (t) => t.objectStore(WACHTRIJ).getAll()),
  aantalInWachtrij: () => tx(WACHTRIJ, 'readonly', (t) => t.objectStore(WACHTRIJ).count()),
  // Verwijder alleen als de wachtrijregel niet intussen opnieuw is gewijzigd.
  async afgehandeld(regel) {
    await tx(WACHTRIJ, 'readwrite', (t) => {
      const s = t.objectStore(WACHTRIJ);
      const req = s.get(regel.id);
      req.onsuccess = () => {
        if (req.result && req.result.tijd === regel.tijd) s.delete(regel.id);
      };
    });
  },
  bewaar: (store, item) => tx(store, 'readwrite', (t) => t.objectStore(store).put(item)),
  verwijder: (store, id) => tx(store, 'readwrite', (t) => t.objectStore(store).delete(id)),
  verwijderUitWachtrij: (store, id) => tx(WACHTRIJ, 'readwrite', (t) => t.objectStore(WACHTRIJ).delete(`${store}:${id}`)),
  fotoIds: () => tx('fotos', 'readonly', (t) => t.objectStore('fotos').getAllKeys()),
  heeftWachtend:(store, id) => tx(WACHTRIJ, 'readonly', (t) => t.objectStore(WACHTRIJ).count(`${store}:${id}`)).then((n) => n > 0),
  zetAllesInWachtrij: async () => {
    for (const store of STORES) {
      const items = await alle(store);
      await tx(WACHTRIJ, 'readwrite', (t) => items.forEach((i) => zetInWachtrij(t, store, i.id, 'opslaan')));
    }
    meld();
  },
};

/** Wist alleen de gegevens op dit apparaat (niet op de server). */
export async function wisLokaal() {
  await tx([...STORES, WACHTRIJ], 'readwrite', (t) => {
    [...STORES, WACHTRIJ].forEach((s) => t.objectStore(s).clear());
  });
}

export async function exporteer() {
  const data = { app: 'inspectie-app', versie: 1, geexporteerd: new Date().toISOString() };
  for (const store of STORES) data[store] = await alle(store);
  return data;
}

export async function importeer(data, { vervangen = false } = {}) {
  if (!data || data.app !== 'inspectie-app') throw new Error('Geen geldig back-upbestand van de inspectie-app.');
  if (vervangen) await wisLokaal();
  for (const store of STORES) {
    if (Array.isArray(data[store])) await bewaarVeel(store, data[store].filter((i) => i && i.id));
  }
}
