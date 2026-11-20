// Service worker: maakt de app offline bruikbaar in het veld.
const CACHE = 'inspectie-app-v139';
const BESTANDEN = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'js/app.js', 'js/db.js', 'js/nen2767.js', 'js/utils.js', 'js/catalogus.js', 'js/demo.js',
  'js/sync.js', 'js/config.js', 'js/gis.js', 'js/taken.js', 'js/velden.js', 'js/pakketten.js', 'js/bvc.js', 'js/ecologie.js', 'js/pakketexcel.js', 'js/resultatenexcel.js', 'js/gisimport.js', 'js/stowa.js', 'js/digigids.js', 'js/planning.js', 'js/dashboard.js', 'js/decompositie.js', 'js/inspectietypen.js', 'js/uitkomstenexcel.js', 'js/fotoinfo.js', 'js/eisen.js', 'js/eisdossier.js', 'js/kaartopmaak.js', 'js/inzet.js', 'js/storingen.js', 'js/storingenexcel.js', 'js/voortgangsoverzicht.js', 'js/geominwinning.js', 'js/iconen.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/shpjs/shp.min.js', 'vendor/sqljs/sql-wasm.js', 'vendor/sqljs/sql-wasm.wasm',
];

const VERSIE = CACHE.replace('inspectie-app-v', ''); // bijv. '138'

// Installeren: alle bestanden van deze versie vers van de server (niet uit de browsercache) in de eigen cache zetten.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(BESTANDEN.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Van het netwerk halen en (als het lukt) in de cache bewaren. */
const netwerk = (req, opties = {}) => fetch(req, opties).then((res) => {
  if (res.ok) { const kopie = res.clone(); caches.open(CACHE).then((c) => c.put(req, kopie)); }
  return res;
});
const uitCache = (req) => caches.match(req).then((r) => r || caches.match(req, { ignoreSearch: true }));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/\/(rest|auth|storage|realtime)\/v1\//.test(url.pathname)) return; // gegevens van de server nooit uit de cache
  const v = url.searchParams.get('v');

  // 1. Bestanden met het versienummer van deze cache (alle modules en de opmaak): direct van het toestel, zonder te wachten
  //    op het netwerk. Veilig, want bij elke update krijgen ze een nieuw nummer.
  if (v && v === VERSIE) {
    e.respondWith(uitCache(e.request).then((r) => r || netwerk(e.request)));
    return;
  }
  // 2. Een ander versienummer (er is net een update): altijd vers van de server, nooit een oude versie ernaast.
  if (v) {
    e.respondWith(netwerk(e.request, { cache: 'no-cache' }).catch(() => uitCache(e.request)));
    return;
  }
  // 3. De startpagina: eerst de server (zo zie je een update meteen), maar hoogstens 3 seconden wachten; daarna de opgeslagen versie.
  const isPagina = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isPagina) {
    const vers = netwerk(e.request, { cache: 'no-cache' });
    const opgeslagen = () => uitCache(e.request).then((r) => r || caches.match('index.html'));
    e.respondWith(new Promise((klaar) => {
      let gedaan = false;
      const kies = (r) => { if (!gedaan && r) { gedaan = true; klaar(r); } };
      const t = setTimeout(() => opgeslagen().then(kies), 3000);
      vers.then((r) => { clearTimeout(t); kies(r); })
        .catch(() => { clearTimeout(t); opgeslagen().then((r) => kies(r ?? Response.error())); });
    }));
    return;
  }
  // 4. Overige bestanden (iconen, kaartbibliotheek, enz.): uit de cache en op de achtergrond bijwerken.
  e.respondWith(uitCache(e.request).then((r) => {
    const bijwerken = netwerk(e.request, { cache: 'no-cache' }).catch(() => null);
    return r || bijwerken.then((x) => x || caches.match('index.html'));
  }));
});
