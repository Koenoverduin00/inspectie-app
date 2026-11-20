// Lokale opslag in IndexedDB: werkt offline in het veld.
// Wijzigingen aan objecten, inspecties en foto's worden in een wachtrij gezet
// zodat ze naar de server kunnen worden gesynchroniseerd zodra er verbinding is.
const DB_NAAM = 'inspectie-app';
const DB_VERSIE = 8; // 8: index op projectId, zodat een pagina alleen het eigen project leest
export const STORES = ['projecten', 'lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken', 'werkpakketten', 'overgeslagen', 'vrijgaven', 'meldingen', 'fotos'];
const WACHTRIJ = 'wachtrij';
/** Stores met een projectId (alles behalve de projecten zelf). */
const PROJECT_STORES = STORES.filter((s) => s !== 'projecten');

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
        // Index op project: alleen de gegevens van het project waarin je werkt lezen, niet alles van alle projecten.
        for (const naam of PROJECT_STORES) {
          const s = req.transaction.objectStore(naam);
          if (!s.indexNames.contains('projectId')) s.createIndex('projectId', 'projectId', { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Een nieuwere versie van de app (ander tabblad) wil de opslag bijwerken: niet tegenhouden.
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onblocked = () => {
        console.warn('Opslag wacht: sluit andere tabbladen van de app.');
        try { window.dispatchEvent(new CustomEvent('opslag-geblokkeerd')); } catch { /* geen venster */ }
      };
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

function zetInWachtrij(t, store, id, actie, projectId = null) {
  t.objectStore(WACHTRIJ).put({
    id: `${store}:${id}`, store, recordId: id, actie, projectId, tijd: new Date().toISOString(),
  });
}

const projectVan = (store, item) => (store === 'projecten' ? item?.id : item?.projectId) ?? null;

export const alle = (store) => tx(store, 'readonly', (t) => t.objectStore(store).getAll());

/** Alleen de records van één project (via de index; zonder index: alles lezen en filteren). */
export async function inProject(store, pid) {
  if (!pid) return [];
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const s = t.objectStore(store);
    const req = s.indexNames.contains('projectId') ? s.index('projectId').getAll(pid) : s.getAll();
    t.oncomplete = () => resolve(s.indexNames.contains('projectId') ? req.result : req.result.filter((r) => r.projectId === pid));
    t.onerror = () => reject(t.error);
  });
}

/** Aantal records, zonder ze te lezen. */
export const aantal = (store) => tx(store, 'readonly', (t) => t.objectStore(store).count());

/** Zijn er records zonder project? Snel: vergelijkt het totaal met het aantal in de projectindex. */
export async function heeftZonderProject(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const s = t.objectStore(store);
    if (!s.indexNames.contains('projectId')) { resolve(true); return; }
    const totaal = s.count();
    const met = s.index('projectId').count();
    t.oncomplete = () => resolve(totaal.result !== met.result);
    t.onerror = () => reject(t.error);
  });
}
export const haal = (store, id) => tx(store, 'readonly', (t) => t.objectStore(store).get(id));

export async function bewaar(store, item) {
  await bewaarVeel(store, [item]);
}

// Bewerkingen vlak vóór het opslaan (bijv. de datum en locatie van foto's in de registratie zetten).
const voorOpslaanFns = [];
export function voorOpslaan(fn) { voorOpslaanFns.push(fn); }

export async function bewaarVeel(store, itemsIn) {
  if (!itemsIn.length) return;
  const items = voorOpslaanFns.length ? itemsIn.map((i) => voorOpslaanFns.reduce((x, fn) => fn(store, x) ?? x, i)) : itemsIn;
  await tx([store, WACHTRIJ], 'readwrite', (t) => {
    const s = t.objectStore(store);
    for (const item of items) {
      s.put(item);
      zetInWachtrij(t, store, item.id, 'opslaan', projectVan(store, item));
    }
  });
  meld();
}

export async function verwijder(store, id) {
  await tx([store, WACHTRIJ], 'readwrite', (t) => {
    const s = t.objectStore(store);
    const req = s.get(id);
    req.onsuccess = () => {
      // Het project onthouden: de server heeft het nodig om de verwijdering toe te staan.
      zetInWachtrij(t, store, id, 'verwijderen', projectVan(store, req.result));
      s.delete(id);
    };
  });
  meld();
}

export async function verwijderVeel(store, ids) {
  if (!ids.length) return;
  await tx([store, WACHTRIJ], 'readwrite', (t) => {
    const s = t.objectStore(store);
    for (const id of ids) {
      const req = s.get(id);
      req.onsuccess = () => {
        zetInWachtrij(t, store, id, 'verwijderen', projectVan(store, req.result));
        s.delete(id);
      };
    }
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
      await tx(WACHTRIJ, 'readwrite', (t) => items.forEach((i) => zetInWachtrij(t, store, i.id, 'opslaan', projectVan(store, i))));
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
