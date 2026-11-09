// Service worker: maakt de app offline bruikbaar in het veld.
const CACHE = 'inspectie-app-v14';
const BESTANDEN = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'icons/icon.svg',
  'js/app.js', 'js/db.js', 'js/nen2767.js', 'js/utils.js', 'js/catalogus.js', 'js/demo.js',
  'js/sync.js', 'js/config.js', 'js/gis.js', 'js/taken.js', 'js/velden.js', 'js/pakketten.js', 'js/bvc.js', 'js/ecologie.js', 'js/pakketexcel.js', 'js/resultatenexcel.js', 'js/gisimport.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/shpjs/shp.min.js', 'vendor/sqljs/sql-wasm.js', 'vendor/sqljs/sql-wasm.wasm',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BESTANDEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Eigen bestanden: eerst netwerk (altijd de nieuwste versie), anders cache.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const kopie = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
