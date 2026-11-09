import * as db from './db.js';
import {
  CONDITIES, ERNST, INTENSITEIT, URGENTIES, OMVANG_KLASSEN,
  gebrekScore, inspectieScore, volgendeInspectie, planningStatus, omvangKlasse,
} from './nen2767.js';
import {
  OBJECTTYPEN, MATERIALEN, INSPECTIESOORTEN, BOUWDELEN, GEBREKEN, WEER, WERKSOORTEN,
} from './catalogus.js';
import {
  esc, nieuwId, vandaag, datumNL, euro, optie, formulierData, verkleinFoto, csv, download, melding,
} from './utils.js';
import { demoData } from './demo.js';
import * as sync from './sync.js';
import * as gis from './gis.js';
import * as velden from './velden.js';
import * as eco from './ecologie.js';
import * as BV from './bvc.js';
import {
  PAKKETSTATUS, OVERSLAAN_REDENEN, overslaanId, voortgang as pakketVoortgang, voorMij as pakketVoorMij, filterObjecten,
  rondesVan, rondeView, rondeVanId, pakketStatus, totaalVoortgang, STANDAARD_RONDE,
} from './pakketten.js';
import * as PX from './pakketexcel.js';
import * as RX from './resultatenexcel.js';
import { takenLijst, sorteerTaken, objectGeometrie, PRIORITEITEN } from './taken.js';

const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// Instellingen (per apparaat)
// ---------------------------------------------------------------------------
const instelling = {
  lees(sleutel, standaard = '') {
    try { return localStorage.getItem(`inspectie-app:${sleutel}`) ?? standaard; } catch { return standaard; }
  },
  schrijf(sleutel, waarde) {
    try { localStorage.setItem(`inspectie-app:${sleutel}`, waarde); } catch { /* opslag geblokkeerd */ }
  },
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const ROUTES = [
  [/^\/$/, 'dashboard', () => (isMobiel() ? mobielStart() : dashboard())],
  [/^\/m\/werk$/, 'm-werk', () => objectKiezer('werk')],
  [/^\/m\/werk\/nieuw$/, 'm-werk', (_, q) => werkFormulier(null, q.get('object'), { mobiel: true, taakId: q.get('taak'), maatregel: q.get('maatregel'), pakketId: q.get('pakket'), rondeId: q.get('ronde') })],
  [/^\/m\/werk\/([^/]+)$/, 'm-werk', (id) => werkFormulier(id, null, { mobiel: true })],
  [/^\/m\/inspectie$/, 'm-inspectie', () => objectKiezer('inspectie')],
  [/^\/m\/inspectie\/nieuw$/, 'm-inspectie', (_, q) => inspectieFormulier(null, q.get('object'), { mobiel: true, taakId: q.get('taak'), pakketId: q.get('pakket'), rondeId: q.get('ronde') })],
  [/^\/m\/inspectie\/([^/]+)$/, 'm-inspectie', (id) => inspectieFormulier(id, null, { mobiel: true })],
  [/^\/m\/account$/, 'm-account', mobielAccount],
  [/^\/m\/vrijgave$/, 'm-vrijgave', () => objectKiezer('vrijgave')],
  [/^\/m\/vrijgave\/nieuw$/, 'm-vrijgave', (_, q) => vrijgaveFormulier(null, q, { mobiel: true })],
  [/^\/m\/vrijgave\/([^/]+)\/bewerken$/, 'm-vrijgave', (id, q) => vrijgaveFormulier(id, q, { mobiel: true })],
  [/^\/m\/vrijgave\/([^/]+)$/, 'm-vrijgave', (id) => vrijgaveDetail(id, { mobiel: true })],
  [/^\/m\/bvc$/, 'm-inspectie', () => objectKiezer('bvc')],
  [/^\/m\/bvc\/nieuw$/, 'm-inspectie', (_, q) => bvcFormulier(null, q.get('object'), { mobiel: true, taakId: q.get('taak'), pakketId: q.get('pakket'), rondeId: q.get('ronde') })],
  [/^\/bvc\/nieuw$/, 'inspecties', (_, q) => bvcFormulier(null, q.get('object'), { taakId: q.get('taak'), pakketId: q.get('pakket'), rondeId: q.get('ronde') })],
  [/^\/vrijgaven$/, 'vrijgaven', vrijgavenLijst],
  [/^\/vrijgaven\/nieuw$/, 'vrijgaven', (_, q) => vrijgaveFormulier(null, q)],
  [/^\/vrijgaven\/([^/]+)\/bewerken$/, 'vrijgaven', (id, q) => vrijgaveFormulier(id, q)],
  [/^\/vrijgaven\/([^/]+)$/, 'vrijgaven', (id) => vrijgaveDetail(id)],
  [/^\/werkzaamheden$/, 'werkzaamheden', werkzaamhedenLijst],
  [/^\/werkzaamheden\/nieuw$/, 'werkzaamheden', (_, q) => werkFormulier(null, q.get('object'), { taakId: q.get('taak'), maatregel: q.get('maatregel'), pakketId: q.get('pakket'), rondeId: q.get('ronde') })],
  [/^\/werkzaamheden\/([^/]+)\/bewerken$/, 'werkzaamheden', (id) => werkFormulier(id)],
  [/^\/werkzaamheden\/([^/]+)$/, 'werkzaamheden', werkDetail],
  [/^\/objecten$/, 'objecten', objectenLijst],
  [/^\/objecten\/nieuw$/, 'objecten', () => objectFormulier()],
  [/^\/objecten\/([^/]+)\/bewerken$/, 'objecten', objectFormulier],
  [/^\/objecten\/([^/]+)$/, 'objecten', objectDetail],
  [/^\/inspecties$/, 'inspecties', inspectiesLijst],
  [/^\/inspecties\/nieuw$/, 'inspecties', (_, q) => inspectieFormulier(null, q.get('object'), { taakId: q.get('taak'), pakketId: q.get('pakket'), rondeId: q.get('ronde') })],
  [/^\/inspecties\/([^/]+)\/bewerken$/, 'inspecties', (id) => inspectieFormulier(id)],
  [/^\/inspecties\/([^/]+)\/rapport$/, 'inspecties', inspectieRapport],
  [/^\/inspecties\/([^/]+)$/, 'inspecties', inspectieDetail],
  [/^\/maatregelen$/, 'maatregelen', maatregelen],
  [/^\/projecten$/, 'projecten', projectenPagina],
  [/^\/projecten\/nieuw$/, 'projecten', () => projectFormulier()],
  [/^\/projecten\/([^/]+)\/bewerken$/, 'projecten', (id) => projectFormulier(id)],
  [/^\/projecten\/([^/]+)\/velden$/, 'projecten', formulierveldenPagina],
  [/^\/gis\/importeren$/, 'kaart', gisImport],
  [/^\/taken$/, 'taken', takenPagina],
  [/^\/werkpakketten$/, 'werkpakketten', werkpakkettenLijst],
  [/^\/werkpakketten\/nieuw$/, 'werkpakketten', (_, q) => pakketFormulier(null, q)],
  [/^\/werkpakketten\/([^/]+)\/bewerken$/, 'werkpakketten', (id, q) => pakketFormulier(id, q)],
  [/^\/werkpakketten\/([^/]+)$/, 'werkpakketten', pakketDetail],
  [/^\/m\/pakketten$/, 'm-pakket', mobielePakketten],
  [/^\/m\/pakket\/([^/]+)$/, 'm-pakket', mobielPakket],
  [/^\/taken\/nieuw$/, 'taken', (_, q) => taakFormulier(null, q)],
  [/^\/taken\/([^/]+)\/bewerken$/, 'taken', (id) => taakFormulier(id)],
  [/^\/kaart$/, 'kaart', kaart],
  [/^\/instellingen$/, 'instellingen', instellingen],
];

let formulierGewijzigd = false;

// Pagina's worden na elkaar opgebouwd, zodat een trage pagina nooit een nieuwere overschrijft.
let renderKetting = Promise.resolve();
function router() {
  renderKetting = renderKetting.then(toonRoute, toonRoute);
  return renderKetting;
}

async function toonRoute() {
  const [pad, zoek = ''] = (location.hash.slice(1) || '/').split('?');
  const query = new URLSearchParams(zoek);
  const route = ROUTES.find(([re]) => re.test(pad));
  formulierGewijzigd = false;
  const mobiel = isMobiel();
  document.body.classList.toggle('modus-mobiel', mobiel);
  document.querySelectorAll('[data-mnav]').forEach((a) => {
    const actief = route?.[1] === a.dataset.mnav;
    a.classList.toggle('actief', actief);
    if (actief) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('actief', route?.[1] === a.dataset.nav);
    if (route?.[1] === a.dataset.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  if (!route) {
    app.innerHTML = '<div class="kaart leeg"><h1>Pagina niet gevonden</h1><a href="#/">Naar het dashboard</a></div>';
    return;
  }
  const [re, , handler] = route;
  const id = pad.match(re)[1] ? decodeURIComponent(pad.match(re)[1]) : undefined;
  try {
    await werkProjectkopBij();
    // Eerst een project kiezen; alleen projecten, instellingen en account werken zonder project.
    if (!/^\/(projecten|instellingen|m\/account)(\/|$)/.test(pad) && !(await actiefProject())) {
      await projectenPagina();
      return;
    }
    await handler(id, query);
  } catch (fout) {
    console.error(fout);
    app.innerHTML = `<div class="kaart"><h1>Er ging iets mis</h1><p>${esc(fout.message)}</p><a class="knop" href="#/">Naar dashboard</a></div>`;
  }
}

function ga(hash) {
  if (location.hash === hash) router(); else location.hash = hash;
}

window.addEventListener('hashchange', router);
window.addEventListener('beforeunload', (e) => {
  if (formulierGewijzigd) e.preventDefault();
});

// ---------------------------------------------------------------------------
// Gegevens en afgeleide informatie
// ---------------------------------------------------------------------------
async function laadAlles() {
  const [objecten, inspecties, werkzaamheden] = await Promise.all([inProject('objecten'), inProject('inspecties'), inProject('werkzaamheden')]);
  werkzaamheden.sort((a, b) => String(b.datum).localeCompare(String(a.datum)) || String(b.gewijzigd).localeCompare(String(a.gewijzigd)));
  objecten.sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  inspecties.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  const status = new Map(objecten.map((o) => [o.id, objectStatus(o, inspecties)]));
  return { objecten, inspecties, werkzaamheden, objectMap, status };
}

function objectStatus(object, inspecties) {
  const laatste = inspecties
    .filter((i) => i.objectId === object.id && i.status === 'afgerond')
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)))[0];
  const bvk = laatste?.bvc && !laatste.bvc.niet ? laatste.bvc.bvk : null;
  if (laatste?.bvc) {
    // Bomen: oordeel is de boomveiligheidsklasse; frequentie volgt uit het protocol.
    const volgende = laatste.bvc.volgendeControle || volgendeInspectie(laatste.datum, object.inspectieInterval);
    return { laatste, conditie: null, bvk, volgende, planning: laatste.bvc.niet ? 'geen' : planningStatus(volgende, vandaag()) };
  }
  const periodiek = Number(object.inspectieInterval) > 0;
  if (!laatste) return { laatste: null, conditie: null, volgende: null, planning: periodiek ? 'nooit' : 'geen' };
  if (!periodiek) return { laatste, conditie: inspectieScore(laatste), volgende: null, planning: 'geen' };
  const volgende = volgendeInspectie(laatste.datum, object.inspectieInterval);
  return { laatste, conditie: inspectieScore(laatste), volgende, planning: planningStatus(volgende, vandaag()) };
}

function alleMaatregelen(inspecties, objectMap) {
  const lijst = [];
  for (const insp of inspecties) {
    for (const g of [...(insp.gebreken ?? []), ...(insp.bvc?.maatregelen ?? [])]) {
      if (!g.maatregel && !g.urgentie) continue;
      lijst.push({ gebrek: g, inspectie: insp, object: objectMap.get(insp.objectId) });
    }
  }
  const rang = (u) => URGENTIES.find((x) => x.id === u)?.rang ?? 9;
  return lijst.sort((a, b) => rang(a.gebrek.urgentie) - rang(b.gebrek.urgentie)
    || String(b.inspectie.datum).localeCompare(String(a.inspectie.datum)));
}

// ---------------------------------------------------------------------------
// Kleine weergavehelpers
// ---------------------------------------------------------------------------
function scoreLabel(score, groot = false) {
  if (!score) return '<span class="label-status">Geen</span>';
  const c = CONDITIES[score];
  return `<span class="score${groot ? ' groot' : ''}" style="background:${c.kleur}" title="${esc(c.omschrijving)}">${score} · ${esc(c.label)}</span>`;
}

const PLANNING_TEKST = {
  nooit: 'Nog niet geïnspecteerd', verlopen: 'Verlopen', binnenkort: 'Binnenkort', gepland: 'Op schema', geen: 'Geen planning', onbekend: 'Onbekend',
};
function planningLabel(planning) {
  const klasse = planning === 'nooit' ? 'verlopen' : planning;
  return `<span class="label-status ${klasse}">${PLANNING_TEKST[planning] ?? planning}</span>`;
}

function urgentieLabel(id) {
  const u = URGENTIES.find((x) => x.id === id);
  if (!u) return '–';
  return `<span class="label-status ${id === 'direct' ? 'direct' : id === '1jaar' ? 'binnenkort' : ''}">${esc(u.label)}</span>`;
}

function statusLabel(status) {
  return `<span class="label-status ${esc(status)}">${status === 'afgerond' ? 'Afgerond' : 'Concept'}</span>`;
}

function objectNaam(object) {
  return object ? `${esc(object.code)} – ${esc(object.naam)}` : '<em>Verwijderd object</em>';
}

function leegKaart(tekst, knop = '') {
  return `<div class="kaart leeg"><p>${tekst}</p>${knop}</div>`;
}

async function fotosHtml(ids, { verwijderbaar = false } = {}) {
  if (!ids?.length) return '';
  const fotos = (await Promise.all(ids.map((id) => db.haal('fotos', id)))).filter(Boolean);
  return `<div class="fotos">${fotos.map((f) => `
    <div class="foto"><img src="${esc(f.data)}" alt="Inspectiefoto" loading="lazy" data-lichtbak>
    ${verwijderbaar ? `<button type="button" data-foto-weg="${esc(f.id)}" aria-label="Foto verwijderen">×</button>` : ''}</div>`).join('')}</div>`;
}

/** Fotogalerij voor detail- en rapportpagina's: grotere tegels met nummer, klik = vergroten. */
async function fotoGalerij(ids, { titel = '' } = {}) {
  if (!ids?.length) return '';
  const fotos = (await Promise.all(ids.map((id) => db.haal('fotos', id)))).filter(Boolean);
  if (!fotos.length) return '';
  return `<div class="galerij">${titel ? `<div class="galerij-titel">${esc(titel)} <span>${fotos.length}</span></div>` : ''}
    <div class="galerij-raster">${fotos.map((f, n) => `<figure><img src="${esc(f.data)}" alt="${esc(titel || 'Foto')} ${n + 1}" loading="lazy" data-lichtbak>
      <figcaption>${n + 1}</figcaption></figure>`).join('')}</div></div>`;
}

/** Kaartje met de ligging van één object, met de rest van de laag lichtgrijs als context. */
async function tekenObjectKaartje(el, o, kleur = '#e07b00') {
  if (!el) return;
  const geo = o ? objectGeometrie(o) : null;
  if (!geo) {
    el.innerHTML = '<p class="leeg">Geen locatie bekend voor dit object.</p>';
    return;
  }
  let L;
  try {
    L = await laadLeaflet();
  } catch (fout) {
    if (el.isConnected) el.innerHTML = `<p class="leeg">${esc(fout.message)}</p>`;
    return;
  }
  if (!el.isConnected) return;
  el.innerHTML = '';
  const map = L.map(el, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, scrollWheelZoom: false });
  voegAchtergrondToe(L, map);
  const ander = o.laagId ? (await inProject('objecten')).filter((x) => x.laagId === o.laagId && x.id !== o.id).slice(0, 3000) : [];
  const context = L.geoJSON({ type: 'FeatureCollection', features: ander.map((x) => ({ type: 'Feature', geometry: objectGeometrie(x), properties: {} })).filter((f) => f.geometry) }, {
    style: { color: '#6b7785', weight: 1, fillColor: '#9aa5b1', fillOpacity: 0.15, interactive: false },
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 4, color: '#6b7785', weight: 1, fillColor: '#9aa5b1', fillOpacity: 0.5, interactive: false }),
  });
  const laag = L.geoJSON({ type: 'Feature', geometry: geo, properties: {} }, {
    style: { color: kleur, weight: 4, fillColor: kleur, fillOpacity: 0.35 },
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 10, color: '#fff', weight: 3, fillColor: kleur, fillOpacity: 1 }),
  });
  const b = laag.getBounds();
  if (geo.type === 'Point') map.setView(b.getCenter(), 18, { animate: false });
  else map.fitBounds(b, { padding: [30, 30], maxZoom: 19, animate: false });
  context.addTo(map);
  laag.addTo(map).bindTooltip(`${o.code ?? ''}`, { permanent: false });
}

/** Locatieblok: kaartje + coördinaten + navigatielink. */
function locatieBlok(o) {
  const geo = o ? objectGeometrie(o) : null;
  const c = geo ? gis.middelpunt(geo) : null;
  const rd = c ? BV.wgs84NaarRd(c[0], c[1]) : null;
  return `<section class="kaart locatieblok"><h2>Locatie</h2>
    <div id="objectkaartje" class="objectkaartje"><p class="leeg">Kaart laden…</p></div>
    ${c ? `<p class="locatieregel"><small>${esc(o.locatie ? `${o.locatie} · ` : '')}RD X ${rd[0].toFixed(1)} · Y ${rd[1].toFixed(1)} · ${c[1].toFixed(6)}, ${c[0].toFixed(6)}</small>
      <a class="geen-print" href="https://www.google.com/maps/search/?api=1&query=${c[1].toFixed(6)},${c[0].toFixed(6)}" target="_blank" rel="noopener">Navigeren ↗</a></p>` : ''}</section>`;
}

const kenmerk = (label, waarde) => (waarde === '' || waarde === null || waarde === undefined ? ''
  : `<span class="kenmerk"><small>${esc(label)}</small>${waarde}</span>`);

/** Eén NEN 2767-gebrek als overzichtelijke kaart. */
async function nenGebrekKaart(g, n) {
  const s = gebrekScore(g);
  return `<article class="gebrekkaart" style="--gk:${CONDITIES[s]?.kleur ?? '#9aa5b1'}">
    <header><span class="gk-nr">${n + 1}</span>
      <div class="gk-titel"><h3>${esc(g.bouwdeel || 'Bouwdeel onbekend')} – ${esc(g.gebrek || 'gebrek')}</h3>${g.locatie ? `<small>📍 ${esc(g.locatie)}</small>` : ''}</div>
      ${scoreLabel(s)}</header>
    <div class="kenmerken">
      ${kenmerk('Ernst', esc(ERNST[g.ernst]?.label ?? '–'))}
      ${kenmerk('Intensiteit', esc(INTENSITEIT[g.intensiteit] ?? '–'))}
      ${kenmerk('Omvang', g.omvang === '' || g.omvang == null ? '–' : `${esc(g.omvang)}% · ${esc(OMVANG_KLASSEN[omvangKlasse(g.omvang) - 1].label)}`)}
      ${g.urgentie ? kenmerk('Urgentie', urgentieLabel(g.urgentie)) : ''}
      ${g.kostenraming !== '' && g.kostenraming != null ? kenmerk('Raming', euro(g.kostenraming)) : ''}
      ${g.maatregel || g.urgentie ? kenmerk('Maatregel', g.maatregelStatus === 'uitgevoerd' ? '<span class="label-status uitgevoerd">Uitgevoerd</span>' : '<span class="label-status binnenkort">Open</span>') : ''}
      ${g.conditieHandmatig ? kenmerk('Conditie', 'handmatig') : ''}
    </div>
    ${g.toelichting || g.maatregel ? `<div class="gk-tekst">
      ${g.toelichting ? `<div><h4>Waarneming</h4><p>${esc(g.toelichting)}</p></div>` : ''}
      ${g.maatregel ? `<div><h4>Maatregel</h4><p>${esc(g.maatregel)}</p></div>` : ''}</div>` : ''}
    ${await fotoGalerij(g.fotoIds, { titel: "Foto's" })}
  </article>`;
}

/** Eén boomgebrek (BVC) als kaart. */
async function bvcGebrekKaart(g, n) {
  return `<article class="gebrekkaart" style="--gk:#d1452f">
    <header><span class="gk-nr">${n + 1}</span>
      <div class="gk-titel"><h3>${esc(g.omschrijving || 'Gebrek')}</h3><small>${esc(g.type || BV.gebrekType(g.omschrijving))}</small></div></header>
    <div class="kenmerken">${kenmerk('Plaats', esc(g.plaats || '–'))}${kenmerk('Mogelijk gevolg', esc(g.gevolg || '–'))}</div>
    ${g.toelichting ? `<div class="gk-tekst"><div><h4>Toelichting</h4><p>${esc(g.toelichting)}</p></div></div>` : ''}
    ${await fotoGalerij(g.fotoIds, { titel: "Foto's" })}
  </article>`;
}

/** Kort overzicht boven de gebreken: aantal per conditie en totale raming. */
function gebrekSamenvatting(gebreken) {
  if (!gebreken.length) return '';
  const per = {};
  for (const g of gebreken) { const s = gebrekScore(g); per[s] = (per[s] ?? 0) + 1; }
  const raming = gebreken.reduce((t, g) => t + (Number(g.kostenraming) || 0), 0);
  const open = gebreken.filter((g) => (g.maatregel || g.urgentie) && g.maatregelStatus !== 'uitgevoerd').length;
  return `<div class="gebrekbalk">${Object.keys(per).sort((a, b) => b - a).map((s) => `${scoreLabel(Number(s))}<span class="gb-aantal">× ${per[s]}</span>`).join('')}
    <span class="gb-rest">${open} open maatregel${open === 1 ? '' : 'en'}${raming ? ` · raming ${euro(raming)}` : ''}</span></div>`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function dashboard() {
  const { objecten, inspecties, werkzaamheden, objectMap, status } = await laadAlles();
  const project = await actiefProject();
  const kop = `<div><h1>${esc(project.naam)}</h1><p>${project.opdrachtgever ? `${esc(project.opdrachtgever)} · ` : ''}Overzicht van het areaal, de taken en de inspectieplanning.</p></div>`;
  if (objecten.length === 0) {
    app.innerHTML = `
      <div class="paginakop">${kop}</div>
      <div class="kaart leeg">
        <h2>Project inrichten</h2>
        <p>Dit project heeft nog geen objecten. Laad een GIS-bestand in (elk vlak wordt een object),<br>
        registreer objecten met de hand, of laad voorbeelddata om de app te verkennen.</p>
        <div class="knoppen" style="justify-content:center">
          ${magBeheren() ? '<a class="knop primair" href="#/gis/importeren">🗺️ GIS-laag inladen</a>' : ''}
          <a class="knop" href="#/objecten/nieuw">+ Object registreren</a>
          <button class="knop" id="demo">Voorbeelddata laden</button>
        </div>
      </div>`;
    app.querySelector('#demo').onclick = laadDemo;
    return;
  }

  const jaar = String(new Date().getFullYear());
  const statussen = [...status.values()];
  const teInspecteren = statussen.filter((s) => s.planning === 'verlopen' || s.planning === 'nooit').length;
  const binnenkort = statussen.filter((s) => s.planning === 'binnenkort').length;
  const maatregelenOpen = alleMaatregelen(inspecties, objectMap).filter((m) => m.gebrek.maatregelStatus !== 'uitgevoerd');
  const direct = maatregelenOpen.filter((m) => m.gebrek.urgentie === 'direct').length;
  const kosten = maatregelenOpen.reduce((t, m) => t + (Number(m.gebrek.kostenraming) || 0), 0);
  const grens = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const werkRecent = werkzaamheden.filter((w) => String(w.datum) >= grens);
  const urenRecent = werkRecent.reduce((t, w) => t + (Number(w.uren) || 0), 0);

  const verdeling = [1, 2, 3, 4, 5, 6].map((s) => ({ s, n: statussen.filter((x) => x.conditie === s).length }));
  const geen = statussen.filter((x) => !x.conditie).length;
  const max = Math.max(1, geen, ...verdeling.map((v) => v.n));

  const pakketInfo = await pakketGegevens();
  const actievePakketten = pakketInfo.pakketten.filter((p) => p.status !== 'afgerond');
  const takenOpen = sorteerTaken(takenLijst({
    objecten, inspecties, taken: await inProject('taken'), planning: status, vandaag: vandaag(),
    pakketten: actieveRondes(pakketInfo),
  }));
  const takenUrgent = takenOpen.filter((t) => t.rang <= 2).length;
  const planning = objecten
    .filter((o) => status.get(o.id).planning !== 'geen')
    .map((o) => ({ o, s: status.get(o.id) }))
    .sort((a, b) => String(a.s.volgende ?? '0000').localeCompare(String(b.s.volgende ?? '0000')))
    .slice(0, 8);

  app.innerHTML = `
    <div class="paginakop">
      ${kop}
      <div class="knoppen">
        ${magBeheren() ? '<a class="knop" href="#/gis/importeren">🗺️ GIS-laag inladen</a>' : ''}
        <a class="knop" href="#/taken/nieuw">+ Taak</a>
        <a class="knop" href="#/objecten/nieuw">+ Object</a>
        <a class="knop" href="#/werkzaamheden/nieuw">+ Werkzaamheid</a>
        <a class="knop primair" href="#/inspecties/nieuw">+ Inspectie</a>
      </div>
    </div>
    <div class="kpi">
      <div class="kaart"><div class="getal">${objecten.length}</div><div class="label">Geregistreerde objecten</div></div>
      <div class="kaart"><div class="getal">${inspecties.filter((i) => String(i.datum).startsWith(jaar)).length}</div><div class="label">Inspecties in ${jaar}</div></div>
      <div class="kaart ${teInspecteren ? 'waarschuwing' : ''}"><div class="getal">${teInspecteren}</div><div class="label">Inspectie verlopen / nooit uitgevoerd</div></div>
      <div class="kaart"><div class="getal">${binnenkort}</div><div class="label">Inspectie binnen 90 dagen</div></div>
      <div class="kaart ${direct ? 'waarschuwing' : ''}"><div class="getal">${direct}</div><div class="label">Directe maatregelen open</div></div>
      <div class="kaart"><div class="getal" style="font-size:1.5rem">${euro(kosten)}</div><div class="label">Raming open maatregelen</div></div>
      <div class="kaart"><div class="getal">${werkRecent.length}</div><div class="label">Werkzaamheden, laatste 30 dagen (${urenTekst(urenRecent)})</div></div>
      <a class="kaart kpi-link ${takenUrgent ? 'waarschuwing' : ''}" href="#/taken"><div class="getal">${takenOpen.length}</div><div class="label">Open taken (${takenUrgent} urgent/hoog)</div></a>
    </div>
    ${actievePakketten.length ? `<section class="kaart">
      <div class="paginakop" style="margin-bottom:.5rem"><h2 style="margin:0">Werkpakketten</h2><a href="#/werkpakketten">Alle →</a></div>
      <div class="pakketten compact">${actievePakketten.slice(0, 6).map((p) => `
        <a class="pakket" href="#/werkpakketten/${esc(p.id)}"><div class="pakketkop"><strong>${esc(p.naam)}</strong>${pakketStatusLabel(p.status)}</div>
        ${voortgangBalk(pakketInfo.voortgangen.get(p.id))}</a>`).join('')}</div>
    </section>` : ''}
    <section class="kaart">
      <div class="paginakop" style="margin-bottom:.5rem"><h2 style="margin:0">Belangrijkste taken</h2><a href="#/taken">Alle taken →</a></div>
      ${takenOpen.length ? `<div class="tabelhouder"><table><tbody>
        ${takenOpen.slice(0, 6).map((t) => `<tr class="klikbaar" data-href="${taakHref(t, false)}">
          <td>${rangLabel(t.rang)}</td><td>${t.soort === 'werk' ? '🛠️' : '🔍'} ${esc(t.titel)}</td><td>${objectNaam(t.object)}</td>
          <td class="verberg-mobiel">${BRON_TEKST[t.bron]}${t.toegewezenAan ? ` · ${esc(t.toegewezenAan)}` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="leeg">Geen openstaande taken.</p>'}
    </section>
    <div class="raster-2">
      <section class="kaart">
        <h2>Conditieverdeling (NEN 2767)</h2>
        <div class="verdeling">
          ${verdeling.map(({ s, n }) => `
            <div class="balk"><span>${s} · ${CONDITIES[s].label}</span>
              <div class="spoor"><div class="vulling" style="width:${(n / max) * 100}%;background:${CONDITIES[s].kleur}"></div></div>
              <strong>${n}</strong></div>`).join('')}
          <div class="balk"><span>Onbekend</span>
            <div class="spoor"><div class="vulling" style="width:${(geen / max) * 100}%;background:#8a96a3"></div></div>
            <strong>${geen}</strong></div>
        </div>
      </section>
      <section class="kaart">
        <h2>Recente inspecties</h2>
        ${inspecties.length ? `<div class="tabelhouder"><table><tbody>
          ${inspecties.slice(0, 6).map((i) => `
            <tr class="klikbaar" data-href="#/inspecties/${esc(i.id)}">
              <td>${datumNL(i.datum)}</td><td>${objectNaam(objectMap.get(i.objectId))}</td>
              <td>${i.status === 'afgerond' ? inspectieOordeel(i) : statusLabel(i.status)}</td>
            </tr>`).join('')}
        </tbody></table></div>` : '<p class="leeg">Nog geen inspecties uitgevoerd.</p>'}
      </section>
      <section class="kaart">
        <div class="paginakop" style="margin-bottom:.5rem"><h2 style="margin:0">Recente werkzaamheden</h2><a href="#/werkzaamheden">Alle →</a></div>
        ${werkzaamheden.length ? `<div class="tabelhouder"><table><tbody>
          ${werkzaamheden.slice(0, 6).map((w) => `
            <tr class="klikbaar" data-href="#/werkzaamheden/${esc(w.id)}">
              <td>${datumNL(w.datum)}</td><td>${objectNaam(objectMap.get(w.objectId))}</td><td>${esc(w.soort || '–')}</td>
              <td>${werkStatusLabel(w.status)}</td>
            </tr>`).join('')}
        </tbody></table></div>` : '<p class="leeg">Nog geen werkzaamheden geregistreerd.</p>'}
      </section>
    </div>
    <section class="kaart">
      <div class="paginakop" style="margin-bottom:.5rem"><h2 style="margin:0">Inspectieplanning</h2><a href="#/objecten">Alle objecten →</a></div>
      <div class="tabelhouder"><table>
        <thead><tr><th>Object</th><th class="verberg-mobiel">Type</th><th>Conditie</th><th>Laatste</th><th>Volgende</th><th>Status</th></tr></thead>
        <tbody>${planning.map(({ o, s }) => `
          <tr class="klikbaar" data-href="#/objecten/${esc(o.id)}">
            <td>${objectNaam(o)}</td><td class="verberg-mobiel">${esc(o.type)}</td><td>${oordeelLabel(s)}</td>
            <td>${datumNL(s.laatste?.datum)}</td><td>${s.volgende ? datumNL(s.volgende) : 'Z.s.m.'}</td><td>${planningLabel(s.planning)}</td>
          </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

async function laadDemo() {
  const data = demoData();
  for (const store of ['lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken', 'werkpakketten']) {
    data[store] = (data[store] ?? []).map((r) => ({ ...r, projectId: projectId() }));
  }
  await db.importeer(data);
  melding('Voorbeelddata geladen');
  ga('#/');
}

// ---------------------------------------------------------------------------
// Objecten
// ---------------------------------------------------------------------------
async function objectenLijst() {
  const { objecten, status } = await laadAlles();
  const typen = [...new Set(objecten.map((o) => o.type).filter(Boolean))].sort();
  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Objecten</h1><p>${objecten.length} geregistreerde objecten in het areaal.</p></div>
      <div class="knoppen">
        <button class="knop" id="export">CSV exporteren</button>
        <a class="knop primair" href="#/objecten/nieuw">+ Object registreren</a>
      </div>
    </div>
    <div class="filters">
      <input type="search" id="zoek" placeholder="Zoek op code, naam of locatie…" aria-label="Zoeken">
      <select id="type" aria-label="Type"><option value="">Alle typen</option>${typen.map((t) => optie(t, t)).join('')}</select>
      <select id="conditie" aria-label="Conditie"><option value="">Alle condities</option>
        ${[1, 2, 3, 4, 5, 6].map((s) => optie(s, `${s} · ${CONDITIES[s].label}`)).join('')}${optie('geen', 'Niet geïnspecteerd')}</select>
      <select id="planning" aria-label="Planning"><option value="">Alle planningen</option>
        ${Object.entries(PLANNING_TEKST).filter(([k]) => k !== 'onbekend').map(([k, v]) => optie(k, v)).join('')}</select>
    </div>
    <div class="kaart" style="padding:0"><div class="tabelhouder"><table>
      <thead><tr><th>Code</th><th>Naam</th><th class="verberg-mobiel">Type</th><th class="verberg-mobiel">Bouwjaar</th><th>Conditie</th><th class="verberg-mobiel">Laatste inspectie</th><th>Planning</th></tr></thead>
      <tbody id="rijen"></tbody>
    </table></div></div>`;

  const filters = ['zoek', 'type', 'conditie', 'planning'].map((id) => app.querySelector(`#${id}`));
  const toon = () => {
    const [zoek, type, conditie, planning] = filters.map((f) => f.value.toLowerCase());
    const rijen = objecten.filter((o) => {
      const s = status.get(o.id);
      if (zoek && !`${o.code} ${o.naam} ${o.locatie} ${o.beheerder}`.toLowerCase().includes(zoek)) return false;
      if (type && o.type?.toLowerCase() !== type) return false;
      if (conditie && (conditie === 'geen' ? s.conditie : String(s.conditie) !== conditie)) return false;
      if (planning && s.planning !== planning) return false;
      return true;
    });
    app.querySelector('#rijen').innerHTML = rijen.length ? rijen.map((o) => {
      const s = status.get(o.id);
      return `<tr class="klikbaar" data-href="#/objecten/${esc(o.id)}">
        <td><strong>${esc(o.code)}</strong></td><td>${esc(o.naam)}</td><td class="verberg-mobiel">${esc(o.type)}</td>
        <td class="verberg-mobiel">${esc(o.bouwjaar || '–')}</td><td>${oordeelLabel(s)}</td>
        <td class="verberg-mobiel">${datumNL(s.laatste?.datum)}</td><td>${planningLabel(s.planning)}</td></tr>`;
    }).join('') : `<tr><td colspan="7" class="leeg">${objecten.length ? 'Geen objecten gevonden met deze filters.' : 'Nog geen objecten. <a href="#/objecten/nieuw">Registreer het eerste object</a>.'}</td></tr>`;
  };
  filters.forEach((f) => f.addEventListener('input', toon));
  toon();

  app.querySelector('#export').onclick = () => {
    const rijen = [['Code', 'Naam', 'Type', 'Materiaal', 'Bouwjaar', 'Beheerder', 'Locatie', 'Breedtegraad', 'Lengtegraad',
      'Lengte (m)', 'Breedte (m)', 'Status', 'Inspectie-interval (jaar)', 'Conditie', 'Laatste inspectie', 'Volgende inspectie', 'Planning']];
    for (const o of objecten) {
      const s = status.get(o.id);
      rijen.push([o.code, o.naam, o.type, o.materiaal, o.bouwjaar, o.beheerder, o.locatie, o.lat, o.lng, o.lengte, o.breedte,
        o.status, o.inspectieInterval, s.conditie ?? '', s.laatste?.datum ?? '', s.volgende ?? '', PLANNING_TEKST[s.planning]]);
    }
    download(`objecten-${vandaag()}.csv`, csv(rijen), 'text/csv;charset=utf-8');
  };
}

async function objectDetail(id) {
  const { inspecties, werkzaamheden, objectMap } = await laadAlles();
  const o = objectMap.get(id);
  if (!o) {
    app.innerHTML = leegKaart('Object niet gevonden.', '<a class="knop" href="#/objecten">Terug naar objecten</a>');
    return;
  }
  const s = objectStatus(o, inspecties);
  const eigen = inspecties.filter((i) => i.objectId === id);
  const eigenWerk = werkzaamheden.filter((w) => w.objectId === id);
  const laag = o.laagId ? await db.haal('lagen', o.laagId) : null;
  const objectTaken = sorteerTaken(takenLijst({
    objecten: [o], inspecties: eigen, taken: (await inProject('taken')).filter((t) => t.objectId === id),
    planning: new Map([[id, s]]), vandaag: vandaag(),
  }));
  const maatregelenOpen = alleMaatregelen(eigen, objectMap).filter((m) => m.gebrek.maatregelStatus !== 'uitgevoerd');
  const heeftLocatie = o.lat !== '' && o.lat != null && o.lng !== '' && o.lng != null;

  app.innerHTML = `
    <div class="paginakop">
      <div><p><a href="#/objecten">← Objecten</a></p><h1>${esc(o.code)} – ${esc(o.naam)}</h1><p>${esc(o.type)}${o.materiaal ? ` · ${esc(o.materiaal)}` : ''}</p></div>
      <div class="knoppen">
        <a class="knop" href="#/objecten/${esc(id)}/bewerken">Bewerken</a>
        <button class="knop gevaar" id="verwijder">Verwijderen</button>
        ${/^Boom|beplanting/i.test(o.type ?? '') ? `<a class="knop" href="#/bvc/nieuw?object=${esc(id)}">🌳 BVC</a>` : ''}
        <a class="knop" href="#/taken/nieuw?object=${esc(id)}">+ Taak</a>
        <a class="knop" href="#/werkzaamheden/nieuw?object=${esc(id)}">+ Werkzaamheid</a>
        <a class="knop primair" href="#/inspecties/nieuw?object=${esc(id)}">+ Nieuwe inspectie</a>
      </div>
    </div>
    <div class="raster-2">
      <section class="kaart">
        <h2>Registratiegegevens</h2>
        <dl class="gegevens">
          <dt>Objectcode</dt><dd>${esc(o.code)}</dd>
          <dt>Type</dt><dd>${esc(o.type || '–')}</dd>
          <dt>Materiaal</dt><dd>${esc(o.materiaal || '–')}</dd>
          <dt>Bouwjaar</dt><dd>${esc(o.bouwjaar || '–')}${o.bouwjaar ? ` (${new Date().getFullYear() - Number(o.bouwjaar)} jaar)` : ''}</dd>
          <dt>Afmetingen</dt><dd>${o.lengte || o.breedte ? `${esc(o.lengte || '?')} × ${esc(o.breedte || '?')} m` : '–'}</dd>
          <dt>Beheerder</dt><dd>${esc(o.beheerder || '–')}</dd>
          <dt>Locatie</dt><dd>${esc(o.locatie || '–')}</dd>
          ${o.geometrie ? `<dt>GIS</dt><dd>${geometrieInfo(o)}${laag ? ` · laag <a href="#/kaart">${esc(laag.naam)}</a>` : ''}</dd>` : ''}
          <dt>Coördinaten</dt><dd>${heeftLocatie ? `${esc(o.lat)}, ${esc(o.lng)} · <a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(o.lat)}&mlon=${encodeURIComponent(o.lng)}#map=18/${encodeURIComponent(o.lat)}/${encodeURIComponent(o.lng)}" target="_blank" rel="noopener">kaart</a>` : '–'}</dd>
          <dt>Status</dt><dd>${esc(o.status || '–')}</dd>
        </dl>
        ${o.notities ? `<h3 style="margin-top:1rem">Notities</h3><p style="white-space:pre-wrap">${esc(o.notities)}</p>` : ''}
      </section>
      <section class="kaart">
        <h2>Conditie en planning</h2>
        <p>${scoreLabel(s.conditie, true)}</p>
        <dl class="gegevens">
          <dt>Laatste inspectie</dt><dd>${s.laatste ? `<a href="#/inspecties/${esc(s.laatste.id)}">${datumNL(s.laatste.datum)}</a>` : 'Nog niet uitgevoerd'}</dd>
          <dt>Interval</dt><dd>${Number(o.inspectieInterval) > 0 ? `${esc(o.inspectieInterval)} jaar` : 'Geen periodieke inspectie'}</dd>
          <dt>Volgende inspectie</dt><dd>${s.volgende ? datumNL(s.volgende) : s.planning === 'geen' ? '–' : 'Zo spoedig mogelijk'}</dd>
          <dt>Planning</dt><dd>${planningLabel(s.planning)}</dd>
          <dt>Flora & fauna</dt><dd>${vrijgaveLabel(await vrijgaveVoor(id))} <a href="#/vrijgaven/nieuw?object=${esc(id)}">+ vrijgave</a></dd>
          <dt>Open maatregelen</dt><dd>${maatregelenOpen.length} (${euro(maatregelenOpen.reduce((t, m) => t + (Number(m.gebrek.kostenraming) || 0), 0))})</dd>
        </dl>
      </section>
    </div>
    <section class="kaart">
      <h2>Inspectiehistorie</h2>
      ${eigen.length ? `<div class="tabelhouder"><table>
        <thead><tr><th>Datum</th><th>Soort</th><th class="verberg-mobiel">Inspecteur</th><th>Gebreken</th><th>Conditie</th><th>Status</th></tr></thead>
        <tbody>${eigen.map((i) => `
          <tr class="klikbaar" data-href="#/inspecties/${esc(i.id)}">
            <td>${datumNL(i.datum)}</td><td>${esc(i.soort)}</td><td class="verberg-mobiel">${esc(i.inspecteur)}</td>
            <td>${i.gebreken?.length ?? 0}</td><td>${inspectieOordeel(i)}</td><td>${statusLabel(i.status)}</td>
          </tr>`).join('')}</tbody></table></div>` : '<p class="leeg">Er zijn nog geen inspecties voor dit object.</p>'}
    </section>
    <section class="kaart">
      <h2>Uitgevoerde werkzaamheden</h2>
      ${eigenWerk.length ? `<div class="tabelhouder"><table>
        <thead><tr><th>Datum</th><th>Soort</th><th class="verberg-mobiel">Uitvoerder</th><th>Uren</th><th>Status</th></tr></thead>
        <tbody>${eigenWerk.map((w) => `
          <tr class="klikbaar" data-href="#/werkzaamheden/${esc(w.id)}">
            <td>${datumNL(w.datum)}</td><td>${esc(w.soort || '–')}</td><td class="verberg-mobiel">${esc(w.uitvoerder || '–')}</td>
            <td>${urenTekst(w.uren)}</td><td>${werkStatusLabel(w.status)}</td>
          </tr>`).join('')}</tbody></table></div>` : '<p class="leeg">Er zijn nog geen werkzaamheden geregistreerd voor dit object.</p>'}
    </section>
    <section class="kaart">
      <div class="paginakop" style="margin-bottom:.5rem"><h2 style="margin:0">Open taken</h2><a class="knop klein" href="#/taken/nieuw?object=${esc(id)}">+ Taak plannen</a></div>
      ${objectTaken.length ? `<div class="tabelhouder"><table><tbody>${objectTaken.map((t) => `
        <tr class="klikbaar" data-href="${taakHref(t, false)}"><td>${rangLabel(t.rang)}</td><td>${t.soort === 'werk' ? '🛠️' : '🔍'} ${esc(t.titel)}</td>
        <td>${t.deadline ? datumNL(t.deadline) : ''}</td><td>${esc(t.toegewezenAan || '')}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="leeg">Geen open taken voor dit object.</p>'}
    </section>
    ${o.kenmerken && Object.keys(o.kenmerken).length ? `<section class="kaart"><h2>GIS-kenmerken</h2>
      <dl class="gegevens">${Object.entries(o.kenmerken).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v ?? '–')}</dd>`).join('')}</dl></section>` : ''}
    ${maatregelenOpen.length ? `<section class="kaart">
      <h2>Openstaande maatregelen</h2>
      <div class="tabelhouder"><table>
        <thead><tr><th>Urgentie</th><th>Bouwdeel / gebrek</th><th>Maatregel</th><th>Raming</th></tr></thead>
        <tbody>${maatregelenOpen.map(({ gebrek: g, inspectie: i }) => `
          <tr class="klikbaar" data-href="#/inspecties/${esc(i.id)}"><td>${urgentieLabel(g.urgentie)}</td>
          <td>${esc(g.bouwdeel)} – ${esc(g.gebrek)}</td><td>${esc(g.maatregel || '–')}</td><td>${euro(g.kostenraming)}</td></tr>`).join('')}
        </tbody></table></div></section>` : ''}`;

  app.querySelector('#verwijder').onclick = async () => {
    const tekst = eigen.length || eigenWerk.length
      ? `Object ${o.code} met ${eigen.length} inspectie(s) en ${eigenWerk.length} werkzaamheid/werkzaamheden inclusief foto's definitief verwijderen?`
      : `Object ${o.code} definitief verwijderen?`;
    if (!confirm(tekst)) return;
    for (const w of eigenWerk) {
      for (const fid of [...(w.fotoIds ?? []), ...(w.extraFotoIds ?? [])]) await db.verwijder('fotos', fid);
      await db.verwijder('werkzaamheden', w.id);
    }
    for (const i of eigen) await verwijderInspectieData(i);
    await db.verwijder('objecten', id);
    melding('Object verwijderd');
    ga('#/objecten');
  };
}

async function objectFormulier(id) {
  const bestaand = id ? await db.haal('objecten', id) : null;
  if (id && !bestaand) {
    app.innerHTML = leegKaart('Object niet gevonden.', '<a class="knop" href="#/objecten">Terug</a>');
    return;
  }
  const o = bestaand ?? { inspectieInterval: 6, status: 'In gebruik' };
  const veld = (naam, label, attrs = '', type = 'text', hulp = '') => `
    <div class="veld"><label for="f-${naam}" ${attrs.includes('required') ? 'class="vereist"' : ''}>${label}</label>
    <input id="f-${naam}" name="${naam}" type="${type}" value="${esc(o[naam])}" ${attrs}>${hulp ? `<small>${hulp}</small>` : ''}</div>`;
  const keuze = (naam, label, opties) => `
    <div class="veld"><label for="f-${naam}">${label}</label>
    <select id="f-${naam}" name="${naam}"><option value="">– kies –</option>${opties.map((x) => optie(x, x, o[naam])).join('')}</select></div>`;

  app.innerHTML = `
    <div class="paginakop"><div>
      <p><a href="${bestaand ? `#/objecten/${esc(id)}` : '#/objecten'}">← Terug</a></p>
      <h1>${bestaand ? `Object bewerken: ${esc(o.code)}` : 'Nieuw object registreren'}</h1></div></div>
    <form id="form" class="kaart" novalidate>
      <h2>Identificatie</h2>
      <div class="velden">
        ${veld('code', 'Objectcode', 'required maxlength="40" placeholder="bijv. KW-012"')}
        ${veld('naam', 'Naam', 'required maxlength="120" placeholder="bijv. Brug Hoofdstraat"')}
        ${keuze('type', 'Objecttype', OBJECTTYPEN)}
        ${keuze('materiaal', 'Hoofdmateriaal', MATERIALEN)}
        ${veld('bouwjaar', 'Bouwjaar', 'min="1500" max="2100" step="1" inputmode="numeric"', 'number')}
        ${keuze('status', 'Status', ['In gebruik', 'Tijdelijk afgesloten', 'Buiten gebruik', 'Gesloopt'])}
        ${veld('lengte', 'Lengte (m)', 'min="0" step="0.1" inputmode="decimal"', 'number')}
        ${veld('breedte', 'Breedte (m)', 'min="0" step="0.1" inputmode="decimal"', 'number')}
      </div>
      <h2 style="margin-top:1.5rem">Beheer en locatie</h2>
      <div class="velden">
        ${veld('beheerder', 'Beheerder / eigenaar', 'maxlength="120"')}
        ${veld('inspectieInterval', 'Inspectie-interval (jaren)', 'min="0.5" max="20" step="0.5"', 'number', 'Bijv. 6 jaar voor een NEN 2767-conditiemeting. Leeg = geen periodieke inspectie.')}
        <div class="veld breed"><label for="f-locatie">Locatieomschrijving</label>
          <input id="f-locatie" name="locatie" value="${esc(o.locatie)}" maxlength="200" placeholder="Straat, kilometrering, watergang…"></div>
        ${veld('lat', 'Breedtegraad (lat)', 'step="any" min="-90" max="90" inputmode="decimal"', 'number')}
        ${veld('lng', 'Lengtegraad (lng)', 'step="any" min="-180" max="180" inputmode="decimal"', 'number')}
        <div class="veld" style="justify-content:flex-end"><button type="button" class="knop" id="gps">📍 Huidige locatie gebruiken</button></div>
        <div class="veld breed"><label for="f-notities">Notities</label>
          <textarea id="f-notities" name="notities" maxlength="4000">${esc(o.notities)}</textarea></div>
      </div>
      <div class="formvoet">
        <a class="knop" href="${bestaand ? `#/objecten/${esc(id)}` : '#/objecten'}">Annuleren</a>
        <button class="knop primair" type="submit">Opslaan</button>
      </div>
    </form>`;

  const form = app.querySelector('#form');
  form.addEventListener('input', () => { formulierGewijzigd = true; });
  app.querySelector('#gps').onclick = () => huidigeLocatie(form);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = formulierData(form);
    if (!data.code || !data.naam) return melding('Vul ten minste objectcode en naam in.', 'fout');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const objecten = await inProject('objecten');
    if (objecten.some((x) => x.code.toLowerCase() === data.code.toLowerCase() && x.id !== id)) {
      return melding(`Objectcode ${data.code} is al in gebruik.`, 'fout');
    }
    const nu = new Date().toISOString();
    const opslaan = {
      ...o, ...data,
      id: id ?? nieuwId(),
      projectId: o.projectId ?? projectId(),
      bouwjaar: data.bouwjaar ? Number(data.bouwjaar) : '',
      lengte: data.lengte ? Number(data.lengte) : '',
      breedte: data.breedte ? Number(data.breedte) : '',
      lat: data.lat ? Number(data.lat) : '',
      lng: data.lng ? Number(data.lng) : '',
      inspectieInterval: Number(data.inspectieInterval) > 0 ? Number(data.inspectieInterval) : '',
      aangemaakt: o.aangemaakt ?? nu,
      gewijzigd: nu,
    };
    await db.bewaar('objecten', opslaan);
    formulierGewijzigd = false;
    melding('Object opgeslagen');
    ga(`#/objecten/${opslaan.id}`);
  };
}

function huidigeLocatie(form) {
  if (!navigator.geolocation) return melding('Locatiebepaling wordt niet ondersteund.', 'fout');
  melding('Locatie bepalen…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      form.elements.lat.value = pos.coords.latitude.toFixed(6);
      form.elements.lng.value = pos.coords.longitude.toFixed(6);
      formulierGewijzigd = true;
      melding(`Locatie bepaald (± ${Math.round(pos.coords.accuracy)} m)`);
    },
    (fout) => melding(`Locatie niet beschikbaar: ${fout.message}`, 'fout'),
    { enableHighAccuracy: true, timeout: 15000 },
  );
}

// ---------------------------------------------------------------------------
// Inspecties
// ---------------------------------------------------------------------------
async function inspectiesLijst() {
  const { inspecties, objectMap } = await laadAlles();
  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Inspecties</h1><p>${inspecties.length} inspecties geregistreerd.</p></div>
      <div class="knoppen"><button class="knop" id="resultaten-xls" title="De inspecties die nu gefilterd zijn, met gebreken en maatregelen">📊 Excel</button>
        <button class="knop" id="suf" title="Standaard Uitwisselingsformaat boomveiligheidscontrole (CROW)">SUF-BVC export</button>
        <a class="knop" href="#/bvc/nieuw">🌳 + Boomveiligheidscontrole</a>
        <a class="knop primair" href="#/inspecties/nieuw">+ Nieuwe inspectie</a></div>
    </div>
    <div class="filters">
      <input type="search" id="zoek" placeholder="Zoek op object, inspecteur…" aria-label="Zoeken">
      <select id="soort" aria-label="Soort"><option value="">Alle soorten</option>${INSPECTIESOORTEN.map((s) => optie(s, s)).join('')}</select>
      <select id="status" aria-label="Status"><option value="">Alle statussen</option>${optie('concept', 'Concept')}${optie('afgerond', 'Afgerond')}</select>
      <select id="jaar" aria-label="Jaar"><option value="">Alle jaren</option>
        ${[...new Set(inspecties.map((i) => String(i.datum).slice(0, 4)))].map((j) => optie(j, j)).join('')}</select>
    </div>
    <div class="kaart" style="padding:0"><div class="tabelhouder"><table>
      <thead><tr><th>Datum</th><th>Object</th><th class="verberg-mobiel">Soort</th><th class="verberg-mobiel">Inspecteur</th><th>Gebreken</th><th>Conditie</th><th>Status</th></tr></thead>
      <tbody id="rijen"></tbody></table></div></div>`;

  app.querySelector('#suf').onclick = () => exporteerSuf(undefined, 'project');
  const filters = ['zoek', 'soort', 'status', 'jaar'].map((id) => app.querySelector(`#${id}`));
  let zichtbaar = [];
  app.querySelector('#resultaten-xls').onclick = () => {
    const [zoek, soort, status, jaar] = filters.map((f) => f.value);
    const filter = [zoek && `zoek "${zoek}"`, soort, status, jaar].filter(Boolean).join(' · ') || 'alle inspecties';
    exporteerResultaten({
      lijst: zichtbaar.map((i) => ({ object: objectMap.get(i.objectId) ?? { code: '?', naam: 'Onbekend object' }, inspectie: i, status: i.status })),
      titel: `Inspecties – ${filter}`, filter, bestandsnaam: `inspecties-${soort || 'alle'}${jaar ? `-${jaar}` : ''}`,
    });
  };
  const toon = () => {
    const [zoek, soort, status, jaar] = filters.map((f) => f.value);
    const rijen = inspecties.filter((i) => {
      const o = objectMap.get(i.objectId);
      if (zoek && !`${o?.code} ${o?.naam} ${i.inspecteur} ${i.samenvatting}`.toLowerCase().includes(zoek.toLowerCase())) return false;
      if (soort && i.soort !== soort) return false;
      if (status && i.status !== status) return false;
      if (jaar && !String(i.datum).startsWith(jaar)) return false;
      return true;
    });
    zichtbaar = rijen;
    app.querySelector('#rijen').innerHTML = rijen.length ? rijen.map((i) => `
      <tr class="klikbaar" data-href="#/inspecties/${esc(i.id)}">
        <td>${datumNL(i.datum)}</td><td>${objectNaam(objectMap.get(i.objectId))}</td>
        <td class="verberg-mobiel">${esc(i.soort)}</td><td class="verberg-mobiel">${esc(i.inspecteur)}</td>
        <td>${i.gebreken?.length ?? 0}</td><td>${inspectieOordeel(i)}</td><td>${statusLabel(i.status)}</td>
      </tr>`).join('') : `<tr><td colspan="7" class="leeg">${inspecties.length ? 'Geen inspecties gevonden met deze filters.' : 'Nog geen inspecties. <a href="#/inspecties/nieuw">Start de eerste inspectie</a>.'}</td></tr>`;
  };
  filters.forEach((f) => f.addEventListener('input', toon));
  toon();
}

function nieuwGebrek() {
  return {
    id: nieuwId(), bouwdeel: '', gebrek: '', locatie: '', ernst: 'gering', intensiteit: 1, omvang: '',
    conditieHandmatig: '', toelichting: '', maatregel: '', urgentie: '', kostenraming: '', maatregelStatus: 'open', fotos: [],
  };
}

async function laadFotos(ids) {
  return (await Promise.all((ids ?? []).map((id) => db.haal('fotos', id)))).filter(Boolean).map((f) => ({ id: f.id, data: f.data }));
}

async function inspectieFormulier(id, objectId, { mobiel = false, taakId = null, pakketId = null, rondeId = null } = {}) {
  const objecten = (await inProject('objecten')).sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  const bestaand = id ? await db.haal('inspecties', id) : null;
  if (id && !bestaand) {
    app.innerHTML = leegKaart('Inspectie niet gevonden.', `<a class="knop" href="${mobiel ? '#/' : '#/inspecties'}">Terug</a>`);
    return;
  }
  if (bestaand?.bvc) return bvcFormulier(id, null, { mobiel, taakId, pakketId });
  if (!objecten.length) {
    app.innerHTML = leegKaart(mobiel
      ? 'Er zijn nog geen objecten. Richt de objecten eerst in via de website op de pc.'
      : 'Registreer eerst een object voordat je een inspectie vastlegt.',
    mobiel ? '' : '<a class="knop primair" href="#/objecten/nieuw">+ Object registreren</a>');
    return;
  }

  // Formulierstatus: gebreken en foto's worden in het geheugen bijgehouden tot opslaan.
  const staat = bestaand
    ? {
      ...bestaand,
      fotos: await laadFotos(bestaand.fotoIds),
      gebreken: await Promise.all((bestaand.gebreken ?? []).map(async (g) => ({ ...g, fotos: await laadFotos(g.fotoIds) }))),
    }
    : {
      objectId: objectId ?? '', datum: vandaag(), inspecteur: instelling.lees('inspecteur'), werkpakketId: pakketId ?? '', rondeId: rondeId ?? '',
      soort: mobiel ? 'Schouw' : INSPECTIESOORTEN[0],
      weer: '', status: 'concept', samenvatting: '', fotos: [], gebreken: [],
    };
  const origineleFotoIds = new Set([...(bestaand?.fotoIds ?? []), ...(bestaand?.gebreken ?? []).flatMap((g) => g.fotoIds ?? [])]);
  const terug = staat.werkpakketId ? (mobiel ? `#/m/pakket/${esc(staat.werkpakketId)}` : `#/werkpakketten/${esc(staat.werkpakketId)}`)
    : mobiel ? '#/' : bestaand ? `#/inspecties/${esc(id)}` : (objectId ? `#/objecten/${esc(objectId)}` : '#/inspecties');
  const object = objecten.find((o) => o.id === staat.objectId);
  const taak = taakId ? await db.haal('taken', taakId) : null;
  const pakket = await laadPakketView(staat.werkpakketId, staat.rondeId);
  if (pakket) staat.rondeId = pakket.rondeId;
  if (pakket && !bestaand && pakket.inspectiesoort) staat.soort = pakket.inspectiesoort;
  const pakketTerug = pakket ? pakketPagina(pakket, mobiel) : null;
  const openDetails = new Set(); // houdt opengeklapte onderdelen open bij hertekenen

  const objectVeld = mobiel && object
    ? `<input type="hidden" name="objectId" value="${esc(object.id)}">`
    : `<div class="veld breed"><label for="f-object" class="vereist">Object</label>
        <select id="f-object" name="objectId" required><option value="">– kies een object –</option>
        ${objecten.map((o) => optie(o.id, `${o.code} – ${o.naam}`, staat.objectId)).join('')}</select></div>`;
  const veldDatum = `<div class="veld"><label for="f-datum" class="vereist">Datum</label>
      <input id="f-datum" name="datum" type="date" required value="${esc(staat.datum)}"></div>`;
  const veldSoort = `<div class="veld"><label for="f-soort">Soort</label>
      <select id="f-soort" name="soort">${INSPECTIESOORTEN.filter((s) => s !== BV.BVC_SOORT).map((s) => optie(s, s, staat.soort)).join('')}</select></div>`;
  const veldInspecteur = `<div class="veld"><label for="f-inspecteur">Inspecteur</label>
      <input id="f-inspecteur" name="inspecteur" value="${esc(staat.inspecteur)}" maxlength="100"></div>`;
  const veldWeer = `<div class="veld"><label for="f-weer">Weersomstandigheden</label>
      <select id="f-weer" name="weer"><option value="">–</option>${WEER.map((w) => optie(w, w, staat.weer)).join('')}</select></div>`;
  const veldSamenvatting = `<div class="veld breed"><label for="f-samenvatting">${mobiel ? 'Algemene bevindingen' : 'Samenvatting / algemene bevindingen'}</label>
      <textarea id="f-samenvatting" name="samenvatting" maxlength="4000">${esc(staat.samenvatting)}</textarea></div>`;
  const veldFotos = `<div class="veld breed"><label>Overzichtsfoto's</label><div id="algemene-fotos"></div></div>`;

  app.innerHTML = mobiel ? `
    <div class="mkop"><a href="${terug}" class="mterug" aria-label="Terug">←</a>
      <div><small>${bestaand ? 'Inspectie bewerken' : 'Schouw & inspectie'}</small>
      <h1>${object ? `${esc(object.code)} – ${esc(object.naam)}` : 'Kies een object'}</h1></div></div>
    <form id="form" novalidate class="mform">
      ${taak ? `<div class="kaart mhier">📋 <strong>Taak:</strong> ${esc(taak.titel)}${taak.omschrijving ? `<br><small>${esc(taak.omschrijving)}</small>` : ''}</div>` : ''}
      ${pakket ? `<div class="kaart mhier">📦 <strong>Werkpakket:</strong> ${esc(pakket.naam)}<br><small>Telt mee als gedaan na <strong>Afronden</strong>.</small></div>` : ''}
      <section class="kaart">
        <div class="velden">${objectVeld}${veldSoort}${veldDatum}${veldSamenvatting}${veldFotos}</div>
        <details data-details="algemeen"><summary>Inspecteur en weer</summary>
          <div class="velden" style="margin-top:.75rem">${veldInspecteur}${veldWeer}</div></details>
      </section>
      <section class="kaart" id="extra-blok" hidden><h2>Extra gegevens</h2><div class="extra-velden"></div></section>
      <div class="mtussen"><h2>Gebreken</h2><div id="totaal"></div></div>
      <div id="gebreken"></div>
      <button type="button" class="knop mgroot" id="gebrek-toevoegen">＋ Gebrek vastleggen</button>
      <div class="mvoet">
        <button class="knop" type="submit" data-status="concept">Concept</button>
        <button class="knop primair" type="submit" data-status="afgerond">✓ Afronden</button>
      </div>
    </form>` : `
    <div class="paginakop"><div><p><a href="${terug}">← Terug</a></p>
      <h1>${bestaand ? 'Inspectie bewerken' : 'Nieuwe inspectie'}</h1></div>
      <div id="totaal"></div></div>
    <form id="form" novalidate>
      <section class="kaart">
        <h2>Algemeen</h2>
        <div class="velden">${objectVeld}${veldDatum}${veldInspecteur}${veldSoort}${veldWeer}${veldSamenvatting}${veldFotos}</div>
      </section>
      <section class="kaart" id="extra-blok" hidden><h2>Extra gegevens</h2><div class="extra-velden"></div></section>
      <section>
        <div class="paginakop"><h2 style="margin:0">Gebreken</h2>
          <button type="button" class="knop" id="gebrek-toevoegen">+ Gebrek toevoegen</button></div>
        <div id="gebreken"></div>
      </section>
      <div class="formvoet kaart">
        <small style="flex:1 1 100%;text-align:right">Huidige status: ${statusLabel(staat.status)} · alleen afgeronde inspecties tellen mee voor conditie en planning.</small>
        <a class="knop" href="${terug}">Annuleren</a>
        <button class="knop" type="submit" data-status="concept">Opslaan als concept</button>
        <button class="knop primair" type="submit" data-status="afgerond">Afronden en opslaan</button>
      </div>
    </form>`;

  const form = app.querySelector('#form');
  const extraB = await extraBlok(app.querySelector('#extra-blok'), await projectVelden('inspectie', () => form.elements.soort.value), bestaand);
  form.addEventListener('change', (e) => { if (e.target.name === 'soort') extraB.teken(); });

  const fotoBlok = (fotos, sleutel) => `
    <div class="fotos">
      ${fotos.map((f, n) => `<div class="foto"><img src="${esc(f.data)}" alt="Foto ${n + 1}" data-lichtbak>
        <button type="button" data-foto-weg="${esc(sleutel)}:${n}" aria-label="Foto verwijderen">×</button></div>`).join('')}
      <label class="knop fotoknop">📷 Foto${mobiel ? '' : ' toevoegen'}
        <input type="file" accept="image/*" capture="environment" multiple data-foto-bij="${esc(sleutel)}"></label>
    </div>`;

  const scoreVoor = (g) => scoreLabel(gebrekScore(g));
  const toonTotaal = () => {
    app.querySelector('#totaal').innerHTML = mobiel
      ? scoreLabel(inspectieScore(staat))
      : `<div style="text-align:right"><small>Conditie (maatgevend gebrek)</small><br>${scoreLabel(inspectieScore(staat), true)}</div>`;
  };

  const gebrekHtml = (g, i) => {
    const v = {
      bouwdeel: `<div class="veld"><label>Bouwdeel</label><select data-g="${i}" data-veld="bouwdeel"><option value="">– kies –</option>
        ${BOUWDELEN.map((b) => optie(b, b, g.bouwdeel)).join('')}</select></div>`,
      gebrek: `<div class="veld"><label>Gebrek</label><select data-g="${i}" data-veld="gebrek"><option value="">– kies –</option>
        ${GEBREKEN.map((b) => optie(b, b, g.gebrek)).join('')}</select></div>`,
      locatie: `<div class="veld"><label>Plaats</label><input data-g="${i}" data-veld="locatie" value="${esc(g.locatie)}" placeholder="bijv. steunpunt 2, zuidzijde" maxlength="200"></div>`,
      ernst: `<div class="veld"><label>Ernst</label><select data-g="${i}" data-veld="ernst">
        ${Object.entries(ERNST).map(([k, x]) => optie(k, x.label, g.ernst)).join('')}</select></div>`,
      intensiteit: `<div class="veld"><label>Intensiteit</label><select data-g="${i}" data-veld="intensiteit">
        ${Object.entries(INTENSITEIT).map(([k, x]) => optie(k, `${k} · ${x}`, g.intensiteit)).join('')}</select></div>`,
      omvang: `<div class="veld"><label>Omvang (% van bouwdeel)</label>
        <input type="number" min="0" max="100" step="0.5" inputmode="decimal" data-g="${i}" data-veld="omvang" value="${esc(g.omvang)}">
        <small data-omvang="${i}">${OMVANG_KLASSEN[omvangKlasse(g.omvang) - 1].label}</small></div>`,
      conditie: `<div class="veld"><label>Conditie</label><select data-g="${i}" data-veld="conditieHandmatig">
        ${optie('', 'Automatisch (ernst × intensiteit × omvang)', g.conditieHandmatig)}
        ${[1, 2, 3, 4, 5, 6].map((s) => optie(s, `Handmatig: ${s} · ${CONDITIES[s].label}`, g.conditieHandmatig)).join('')}</select></div>`,
      toelichting: `<div class="veld breed"><label>Toelichting / waarneming</label>
        <textarea data-g="${i}" data-veld="toelichting" maxlength="4000">${esc(g.toelichting)}</textarea></div>`,
      maatregel: `<div class="veld breed"><label>Advies maatregel</label>
        <textarea data-g="${i}" data-veld="maatregel" maxlength="2000" style="min-height:60px">${esc(g.maatregel)}</textarea></div>`,
      urgentie: `<div class="veld"><label>Urgentie</label><select data-g="${i}" data-veld="urgentie"><option value="">–</option>
        ${URGENTIES.map((u) => optie(u.id, u.label, g.urgentie)).join('')}</select></div>`,
      kosten: `<div class="veld"><label>Kostenraming (€)</label>
        <input type="number" min="0" step="100" inputmode="numeric" data-g="${i}" data-veld="kostenraming" value="${esc(g.kostenraming)}"></div>`,
      status: `<div class="veld"><label>Status maatregel</label><select data-g="${i}" data-veld="maatregelStatus">
        ${optie('open', 'Open', g.maatregelStatus)}${optie('uitgevoerd', 'Uitgevoerd', g.maatregelStatus)}</select></div>`,
      fotos: `<div class="veld breed"><label>Foto's</label>${fotoBlok(g.fotos, `g${i}`)}</div>`,
    };
    const sleutel = `advies-${g.id}`;
    const inhoud = mobiel
      ? `<div class="velden">${v.fotos}${v.bouwdeel}${v.gebrek}${v.ernst}${v.intensiteit}${v.omvang}${v.toelichting}</div>
         <details data-details="${sleutel}" ${openDetails.has(sleutel) ? 'open' : ''}><summary>Plaats, advies en urgentie</summary>
           <div class="velden" style="margin-top:.75rem">${v.locatie}${v.maatregel}${v.urgentie}${v.kosten}${v.conditie}${v.status}</div></details>`
      : `<div class="velden">${v.bouwdeel}${v.gebrek}${v.locatie}${v.ernst}${v.intensiteit}${v.omvang}${v.conditie}${v.toelichting}
           ${v.maatregel}${v.urgentie}${v.kosten}${v.status}${v.fotos}</div>`;
    return `
    <div class="gebrek" data-gebrek="${i}" style="border-left-color:${CONDITIES[gebrekScore(g)].kleur}">
      <div class="gebrek-kop"><h3 style="margin:0">Gebrek ${i + 1}</h3>
        <div class="knoppen"><span data-score="${i}">${scoreVoor(g)}</span>
        <button type="button" class="knop klein gevaar" data-gebrek-weg="${i}">${mobiel ? '🗑' : 'Verwijderen'}</button></div></div>
      ${inhoud}
    </div>`;
  };

  const toonGebreken = () => {
    app.querySelector('#gebreken').innerHTML = staat.gebreken.length
      ? staat.gebreken.map(gebrekHtml).join('')
      : leegKaart(mobiel
        ? 'Geen gebreken? Rond de schouw dan direct af.'
        : 'Geen gebreken vastgelegd. Een inspectie zonder gebreken krijgt conditie 1 (uitstekend).');
    toonTotaal();
  };
  const toonAlgemeneFotos = () => { app.querySelector('#algemene-fotos').innerHTML = fotoBlok(staat.fotos, 'alg'); };
  const fotoLijst = (sleutel) => (sleutel === 'alg' ? staat.fotos : staat.gebreken[Number(sleutel.slice(1))].fotos);
  const herteken = (sleutel) => (sleutel === 'alg' ? toonAlgemeneFotos() : toonGebreken());

  toonAlgemeneFotos();
  toonGebreken();

  form.addEventListener('toggle', (e) => {
    const k = e.target.dataset?.details;
    if (!k) return;
    if (e.target.open) openDetails.add(k); else openDetails.delete(k);
  }, true);

  form.addEventListener('input', (e) => {
    formulierGewijzigd = true;
    const el = e.target;
    if (el.dataset.g === undefined) return;
    const i = Number(el.dataset.g);
    const g = staat.gebreken[i];
    g[el.dataset.veld] = el.dataset.veld === 'intensiteit' ? Number(el.value) : el.value;
    app.querySelector(`[data-score="${i}"]`).innerHTML = scoreVoor(g);
    app.querySelector(`[data-gebrek="${i}"]`).style.borderLeftColor = CONDITIES[gebrekScore(g)].kleur;
    app.querySelector(`[data-omvang="${i}"]`).textContent = OMVANG_KLASSEN[omvangKlasse(g.omvang) - 1].label;
    toonTotaal();
  });

  form.addEventListener('change', async (e) => {
    const sleutel = e.target.dataset.fotoBij;
    if (!sleutel || !e.target.files?.length) return;
    const bestanden = [...e.target.files];
    melding(`${bestanden.length} foto('s) verwerken…`);
    try {
      for (const bestand of bestanden) fotoLijst(sleutel).push({ id: nieuwId(), data: await verkleinFoto(bestand) });
      formulierGewijzigd = true;
    } catch (fout) {
      melding(fout.message, 'fout');
    }
    herteken(sleutel);
  });

  form.addEventListener('click', (e) => {
    const weg = e.target.closest('[data-foto-weg]');
    if (weg) {
      const [sleutel, n] = weg.dataset.fotoWeg.split(':');
      fotoLijst(sleutel).splice(Number(n), 1);
      formulierGewijzigd = true;
      herteken(sleutel);
      return;
    }
    const gebrekWeg = e.target.closest('[data-gebrek-weg]');
    if (gebrekWeg) {
      const i = Number(gebrekWeg.dataset.gebrekWeg);
      if (!confirm(`Gebrek ${i + 1} verwijderen?`)) return;
      staat.gebreken.splice(i, 1);
      formulierGewijzigd = true;
      toonGebreken();
    }
  });

  app.querySelector('#gebrek-toevoegen').onclick = () => {
    staat.gebreken.push(nieuwGebrek());
    formulierGewijzigd = true;
    toonGebreken();
    const nieuw = app.querySelector(`[data-gebrek="${staat.gebreken.length - 1}"]`);
    nieuw?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (mobiel) nieuw?.querySelector('input[type=file]')?.closest('label')?.focus();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = formulierData(form);
    if (!data.objectId) return melding('Kies een object.', 'fout');
    if (!data.datum) return melding('Vul de inspectiedatum in.', 'fout');
    const status = e.submitter?.dataset.status ?? staat.status ?? 'concept';
    if (status === 'afgerond') {
      const fouten = extraB.fouten();
      if (fouten.length) {
        app.querySelector('#extra-blok').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return melding(`${fouten[0]}${fouten.length > 1 ? ` (en ${fouten.length - 1} meer)` : ''}`, 'fout');
      }
    }
    const inspectieId = id ?? nieuwId();
    const nu = new Date().toISOString();
    const extraFotoIds = await extraB.bewaarFotos({ inspectieId, projectId: staat.projectId ?? projectId(), datum: nu });

    // Foto's opslaan en verwijderde foto's opruimen.
    const alleFotos = [...staat.fotos, ...staat.gebreken.flatMap((g) => g.fotos)];
    await db.bewaarVeel('fotos', alleFotos
      .filter((f) => !origineleFotoIds.has(f.id))
      .map((f) => ({ id: f.id, data: f.data, inspectieId, projectId: staat.projectId ?? projectId(), datum: nu })));
    const behouden = new Set(alleFotos.map((f) => f.id));
    for (const fid of origineleFotoIds) if (!behouden.has(fid)) await db.verwijder('fotos', fid);

    const inspectie = {
      id: inspectieId,
      projectId: staat.projectId ?? projectId(),
      objectId: data.objectId,
      werkpakketId: staat.werkpakketId ?? '', rondeId: staat.werkpakketId ? (staat.rondeId ?? '') : '',
      datum: data.datum,
      inspecteur: data.inspecteur,
      soort: data.soort,
      weer: data.weer,
      status,
      samenvatting: data.samenvatting,
      fotoIds: staat.fotos.map((f) => f.id),
      extra: extraB.waarden(),
      extraLabels: extraB.labels(),
      extraFotoIds,
      gebreken: staat.gebreken.map(({ fotos, ...g }) => ({
        ...g,
        intensiteit: Number(g.intensiteit) || 1,
        omvang: g.omvang === '' ? '' : Number(g.omvang),
        conditieHandmatig: g.conditieHandmatig === '' ? '' : Number(g.conditieHandmatig),
        kostenraming: g.kostenraming === '' ? '' : Number(g.kostenraming),
        fotoIds: fotos.map((f) => f.id),
      })),
      aangemaakt: bestaand?.aangemaakt ?? nu,
      gewijzigd: nu,
    };
    await db.bewaar('inspecties', inspectie);
    if (data.inspecteur) instelling.schrijf('inspecteur', data.inspecteur);
    formulierGewijzigd = false;
    melding(status === 'afgerond' ? 'Inspectie afgerond en opgeslagen' : 'Concept opgeslagen');
    if (status === 'afgerond') await rondTaakAf(taakId, inspectieId);
    ga(pakketTerug ?? (mobiel ? '#/' : `#/inspecties/${inspectieId}`));
  };
}

async function inspectieDetail(id) {
  const i = await db.haal('inspecties', id);
  if (!i) {
    app.innerHTML = leegKaart('Inspectie niet gevonden.', '<a class="knop" href="#/inspecties">Terug</a>');
    return;
  }
  if (i.bvc) return bvcDetail(i);
  const o = await db.haal('objecten', i.objectId);
  const gebreken = i.gebreken ?? [];
  const score = inspectieScore(i);
  const pakket = i.werkpakketId ? await laadPakketView(i.werkpakketId, i.rondeId) : null;
  const gebrekKaarten = await Promise.all(gebreken.map((g, n) => nenGebrekKaart(g, n)));

  app.innerHTML = `
    <div class="paginakop">
      <div><p><a href="${o ? `#/objecten/${esc(o.id)}` : '#/inspecties'}">← ${o ? esc(o.code) : 'Inspecties'}</a></p>
        <h1>${esc(i.soort)} · ${datumNL(i.datum)}</h1><p>${objectNaam(o)}${o?.type ? ` · ${esc(o.type)}` : ''}</p></div>
      <div class="knoppen">
        <a class="knop" href="#/inspecties/${esc(id)}/rapport">Rapport</a>
        <a class="knop" href="#/inspecties/${esc(id)}/bewerken">Bewerken</a>
        <button class="knop gevaar" id="verwijder">Verwijderen</button>
      </div>
    </div>
    <div class="raster-2 detailkop">
      <section class="kaart">
        <div class="oordeelblok" style="--gk:${CONDITIES[score]?.kleur ?? '#9aa5b1'}">
          <div><small>Conditie (NEN 2767)</small>${scoreLabel(score, true)}</div>
          <p>${score ? esc(CONDITIES[score].omschrijving) : 'Geen gebreken vastgelegd'}.</p>
        </div>
        <dl class="gegevens">
          <dt>Status</dt><dd>${statusLabel(i.status)}</dd>
          <dt>Datum</dt><dd>${datumNL(i.datum)}</dd>
          <dt>Inspecteur</dt><dd>${esc(i.inspecteur || '–')}</dd>
          ${i.weer ? `<dt>Weer</dt><dd>${esc(i.weer)}</dd>` : ''}
          <dt>Gebreken</dt><dd>${gebreken.length}</dd>
          ${o?.inspectieInterval ? `<dt>Volgende inspectie</dt><dd>${datumNL(volgendeInspectie(i.datum, o.inspectieInterval))}</dd>` : ''}
          ${pakket ? `<dt>Werkpakket</dt><dd><a href="${pakketPagina(pakket, false)}">📦 ${esc(pakket.naam)}</a></dd>` : ''}
        </dl>
      </section>
      ${locatieBlok(o)}
    </div>
    ${i.samenvatting || i.fotoIds?.length ? `<section class="kaart"><h2>Samenvatting</h2>
      ${i.samenvatting ? `<p style="white-space:pre-wrap">${esc(i.samenvatting)}</p>` : ''}${await fotoGalerij(i.fotoIds, { titel: "Foto's" })}</section>` : ''}
    ${await extraDetailHtml(i, 'inspectie')}
    <div class="mtussen"><h2>Gebreken${gebreken.length ? ` (${gebreken.length})` : ''}</h2></div>
    ${gebrekSamenvatting(gebreken)}
    ${gebrekKaarten.join('') || leegKaart('Geen gebreken geconstateerd.')}`;

  tekenObjectKaartje(app.querySelector('#objectkaartje'), o, CONDITIES[score]?.kleur ?? '#0b4f6c');
  app.querySelector('#verwijder').onclick = async () => {
    if (!confirm('Deze inspectie inclusief foto\'s definitief verwijderen?')) return;
    await verwijderInspectieData(i);
    melding('Inspectie verwijderd');
    ga(o ? `#/objecten/${o.id}` : '#/inspecties');
  };
}

async function verwijderInspectieData(inspectie) {
  const fotoIds = [...(inspectie.fotoIds ?? []), ...(inspectie.extraFotoIds ?? []), ...(inspectie.gebreken ?? []).flatMap((g) => g.fotoIds ?? [])];
  for (const fid of fotoIds) await db.verwijder('fotos', fid);
  await db.verwijder('inspecties', inspectie.id);
}

async function inspectieRapport(id) {
  const i = await db.haal('inspecties', id);
  if (!i) {
    app.innerHTML = leegKaart('Inspectie niet gevonden.', '<a class="knop" href="#/inspecties">Terug</a>');
    return;
  }
  if (i.bvc) return bvcDetail(i, { rapport: true });
  const o = (await db.haal('objecten', i.objectId)) ?? {};
  const score = inspectieScore(i);
  const organisatie = instelling.lees('organisatie');
  const gebreken = i.gebreken ?? [];
  const details = await Promise.all(gebreken.map((g, n) => nenGebrekKaart(g, n)));

  app.innerHTML = `
    <div class="paginakop geen-print">
      <p><a href="#/inspecties/${esc(id)}">← Terug naar inspectie</a></p>
      <button class="knop primair" onclick="window.print()">Afdrukken / opslaan als PDF</button>
    </div>
    <article class="rapport">
      <div class="rapport-kop">
        <div><small>${esc(organisatie || 'Inspectierapport')}</small>
          <h1 style="margin:.25rem 0">Inspectierapport ${esc(o.code ?? '')}</h1>
          <div>${esc(o.naam ?? '')} · ${esc(i.soort)}</div></div>
        <div style="text-align:right"><small>Conditie</small><br>${scoreLabel(score, true)}</div>
      </div>
      <div class="raster-2">
        <div><h2>Object</h2><dl class="gegevens">
          <dt>Code</dt><dd>${esc(o.code ?? '–')}</dd><dt>Type</dt><dd>${esc(o.type || '–')}</dd>
          <dt>Materiaal</dt><dd>${esc(o.materiaal || '–')}</dd><dt>Bouwjaar</dt><dd>${esc(o.bouwjaar || '–')}</dd>
          <dt>Locatie</dt><dd>${esc(o.locatie || '–')}</dd><dt>Beheerder</dt><dd>${esc(o.beheerder || '–')}</dd></dl></div>
        <div><h2>Inspectie</h2><dl class="gegevens">
          <dt>Datum</dt><dd>${datumNL(i.datum)}</dd><dt>Inspecteur</dt><dd>${esc(i.inspecteur || '–')}</dd>
          <dt>Weer</dt><dd>${esc(i.weer || '–')}</dd><dt>Status</dt><dd>${i.status === 'afgerond' ? 'Afgerond' : 'Concept'}</dd>
          <dt>Volgende inspectie</dt><dd>${datumNL(volgendeInspectie(i.datum, o.inspectieInterval))}</dd></dl></div>
      </div>
      <div class="rapport-kaart">${locatieBlok(o)}</div>
      ${i.samenvatting ? `<h2 style="margin-top:1rem">Samenvatting</h2><p style="white-space:pre-wrap">${esc(i.samenvatting)}</p>` : ''}
      ${await fotoGalerij(i.fotoIds, { titel: "Foto's" })}
      <div class="rapport-extra">${await extraDetailHtml(i, 'inspectie')}</div>
      <h2 style="margin-top:1rem">Overzicht gebreken en maatregelen</h2>
      ${gebreken.length ? `<div class="tabelhouder"><table>
        <thead><tr><th>#</th><th>Bouwdeel</th><th>Gebrek</th><th>E/I/O</th><th>Conditie</th><th>Urgentie</th><th>Raming</th></tr></thead>
        <tbody>${gebreken.map((g, n) => `<tr><td>${n + 1}</td><td>${esc(g.bouwdeel)}</td><td>${esc(g.gebrek)}</td>
          <td>${esc(ERNST[g.ernst]?.label ?? '–')} / ${esc(g.intensiteit)} / ${g.omvang === '' || g.omvang == null ? '–' : `${esc(g.omvang)}%`}</td>
          <td>${scoreLabel(gebrekScore(g))}</td><td>${esc(URGENTIES.find((u) => u.id === g.urgentie)?.label ?? '–')}</td><td>${euro(g.kostenraming)}</td></tr>`).join('')}
          <tr><td colspan="6"><strong>Totaal raming</strong></td><td><strong>${euro(gebreken.reduce((t, g) => t + (Number(g.kostenraming) || 0), 0))}</strong></td></tr>
        </tbody></table></div>
        <h2 style="margin-top:1rem">Detailbevindingen</h2>${details.join('')}` : '<p>Er zijn geen gebreken geconstateerd.</p>'}
      <p style="margin-top:2rem;color:#555;font-size:.85rem">Conditiescores volgens de systematiek van NEN 2767 (1 = uitstekend, 6 = zeer slecht);
        de objectconditie is gelijk aan het maatgevende gebrek. E/I/O = ernst / intensiteit / omvang.</p>
      <div class="raster-2" style="margin-top:2rem">
        <div>Handtekening inspecteur:<br><br><br>_____________________________<br>${esc(i.inspecteur || '')}</div>
        <div>Datum rapport: ${datumNL(vandaag())}</div>
      </div>
    </article>`;
  tekenObjectKaartje(app.querySelector('#objectkaartje'), o.id ? o : null, CONDITIES[score]?.kleur ?? '#0b4f6c');
}

// ---------------------------------------------------------------------------
// Maatregelen
// ---------------------------------------------------------------------------
async function maatregelen() {
  const { inspecties, objectMap } = await laadAlles();
  const lijst = alleMaatregelen(inspecties, objectMap);
  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Maatregelen</h1><p>Onderhoudsadviezen uit alle inspecties, gesorteerd op urgentie.</p></div>
      <button class="knop" id="export">CSV exporteren</button>
    </div>
    <div class="filters">
      <select id="status" aria-label="Status">${optie('open', 'Openstaand', 'open')}${optie('uitgevoerd', 'Uitgevoerd')}${optie('', 'Alle')}</select>
      <select id="urgentie" aria-label="Urgentie"><option value="">Alle urgenties</option>${URGENTIES.map((u) => optie(u.id, u.label)).join('')}</select>
    </div>
    <div id="totaal" class="kaart"></div>
    <div class="kaart" style="padding:0"><div class="tabelhouder"><table>
      <thead><tr><th>Urgentie</th><th>Object</th><th>Bouwdeel / gebrek</th><th class="verberg-mobiel">Maatregel</th><th>Conditie</th><th>Raming</th><th></th></tr></thead>
      <tbody id="rijen"></tbody></table></div></div>`;

  const [statusF, urgentieF] = ['#status', '#urgentie'].map((s) => app.querySelector(s));
  let zichtbaar = [];
  const toon = () => {
    zichtbaar = lijst.filter(({ gebrek: g }) => (!statusF.value || (g.maatregelStatus ?? 'open') === statusF.value)
      && (!urgentieF.value || g.urgentie === urgentieF.value));
    const totaal = zichtbaar.reduce((t, m) => t + (Number(m.gebrek.kostenraming) || 0), 0);
    app.querySelector('#totaal').innerHTML = `<strong>${zichtbaar.length}</strong> maatregelen · totale raming <strong>${euro(totaal)}</strong>`;
    app.querySelector('#rijen').innerHTML = zichtbaar.length ? zichtbaar.map(({ gebrek: g, inspectie: i, object: o }, n) => `
      <tr>
        <td>${urgentieLabel(g.urgentie)}</td>
        <td><a href="#/objecten/${esc(o?.id ?? '')}">${objectNaam(o)}</a></td>
        <td><a href="#/inspecties/${esc(i.id)}">${esc(g.bouwdeel)} – ${esc(g.gebrek)}</a><br><small>${datumNL(i.datum)}</small></td>
        <td class="verberg-mobiel">${esc(g.maatregel || '–')}</td>
        <td>${g.bvcMaatregel ? bvkLabel(i.bvc?.bvk) : scoreLabel(gebrekScore(g))}</td><td>${euro(g.kostenraming)}</td>
        <td><button class="knop klein" data-wissel="${n}">${g.maatregelStatus === 'uitgevoerd' ? 'Heropenen' : '✓ Uitgevoerd'}</button></td>
      </tr>`).join('') : '<tr><td colspan="7" class="leeg">Geen maatregelen gevonden.</td></tr>';
  };
  [statusF, urgentieF].forEach((f) => f.addEventListener('input', toon));
  toon();

  app.querySelector('#rijen').addEventListener('click', async (e) => {
    const knop = e.target.closest('[data-wissel]');
    if (!knop) return;
    const { gebrek, inspectie } = zichtbaar[Number(knop.dataset.wissel)];
    gebrek.maatregelStatus = gebrek.maatregelStatus === 'uitgevoerd' ? 'open' : 'uitgevoerd';
    gebrek.uitgevoerdOp = gebrek.maatregelStatus === 'uitgevoerd' ? vandaag() : '';
    inspectie.gewijzigd = new Date().toISOString();
    await db.bewaar('inspecties', inspectie);
    melding(gebrek.maatregelStatus === 'uitgevoerd' ? 'Maatregel gemarkeerd als uitgevoerd' : 'Maatregel heropend');
    toon();
  });

  app.querySelector('#export').onclick = () => {
    const rijen = [['Objectcode', 'Object', 'Inspectiedatum', 'Bouwdeel', 'Gebrek', 'Plaats', 'Conditie', 'Maatregel', 'Urgentie', 'Kostenraming', 'Status', 'Uitgevoerd op']];
    for (const { gebrek: g, inspectie: i, object: o } of zichtbaar) {
      rijen.push([o?.code, o?.naam, i.datum, g.bouwdeel, g.gebrek, g.locatie, gebrekScore(g), g.maatregel,
        URGENTIES.find((u) => u.id === g.urgentie)?.label ?? '', g.kostenraming, g.maatregelStatus ?? 'open', g.uitgevoerdOp ?? '']);
    }
    download(`maatregelen-${vandaag()}.csv`, csv(rijen), 'text/csv;charset=utf-8');
  };
}

// ---------------------------------------------------------------------------
// Weergave: mobiel (veldwerk) of volledig (inrichten op de pc)
// ---------------------------------------------------------------------------
const mobielMedia = window.matchMedia('(max-width: 760px)');

function isMobiel() {
  const w = instelling.lees('weergave', 'auto');
  if (w === 'mobiel') return true;
  if (w === 'volledig') return false;
  return mobielMedia.matches;
}

mobielMedia.addEventListener('change', () => {
  if (instelling.lees('weergave', 'auto') === 'auto' && !formulierGewijzigd) router();
});

function groet() {
  const uur = new Date().getHours();
  if (uur < 6) return 'Goedenacht';
  if (uur < 12) return 'Goedemorgen';
  if (uur < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

// ---------------------------------------------------------------------------
// Mobiel: startscherm met de twee veldfuncties
// ---------------------------------------------------------------------------
async function mobielStart() {
  const [objecten, inspecties, werk] = await Promise.all([inProject('objecten'), inProject('inspecties'), inProject('werkzaamheden')]);
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  const naam = instelling.lees('inspecteur');
  const concepten = inspecties.filter((i) => i.status === 'concept')
    .sort((a, b) => String(b.gewijzigd).localeCompare(String(a.gewijzigd)));
  const dag = vandaag();
  const vandaagLijst = [
    ...werk.filter((w) => w.datum === dag).map((w) => ({
      href: `#/m/werk/${w.id}`, icoon: '🛠️', titel: w.soort || 'Werkzaamheid', object: objectMap.get(w.objectId), tijd: w.gewijzigd,
    })),
    ...inspecties.filter((i) => i.datum === dag && i.status === 'afgerond').map((i) => ({
      href: `#/m/inspectie/${i.id}`, icoon: i.bvc ? '🌳' : '🔍',
      titel: i.bvc ? `Boomveiligheid · ${i.bvc.niet ? 'niet aangetroffen' : BV.BVK[i.bvc.bvk]?.kort ?? ''}` : `${i.soort} · ${i.gebreken?.length ?? 0} gebrek(en)`,
      object: objectMap.get(i.objectId), tijd: i.gewijzigd,
    })),
    ...(await inProject('vrijgaven')).filter((v) => v.datum === dag).map((v) => ({
      href: `#/m/vrijgave/${v.id}`, icoon: '🌿', titel: `Vrijgave · ${eco.BESLUIT[v.besluit]?.label ?? 'concept'}`,
      object: objectMap.get(v.objectIds?.[0]), tijd: v.gewijzigd,
    })),
  ].sort((a, b) => String(b.tijd).localeCompare(String(a.tijd)));

  const loginHint = sync.isIngesteld() && !sync.sessie()
    ? `<a class="kaart mhint" href="#/m/account">🔑 <span><strong>Log in</strong> zodat je werk ook op kantoor zichtbaar is.</span></a>` : '';
  const regel = (x) => `<li><a href="${x.href}"><span class="micoon klein">${x.icoon}</span>
    <span><strong>${esc(x.titel)}</strong><small>${objectNaam(x.object)}</small></span></a></li>`;

  app.innerHTML = `
    <div class="mstart">
      <p class="mgroet">${groet()}${naam ? `, ${esc(naam)}` : ''}</p>
      ${loginHint}
      <a class="mtegel" href="#/m/werk">
        <span class="micoon">🛠️</span>
        <span><strong>Registratie werkzaamheden</strong><small>Uitgevoerd werk vastleggen, met foto's en uren</small></span>
      </a>
      <a class="mtegel" href="#/m/inspectie">
        <span class="micoon">🔍</span>
        <span><strong>Schouw &amp; inspectie</strong><small>Gebreken vastleggen en boomveiligheidscontrole</small></span>
      </a>
      <a class="mtegel" href="#/m/vrijgave">
        <span class="micoon">🌿</span>
        <span><strong>Flora &amp; fauna vrijgave</strong><small>Ecologische veldcheck vóór de werkzaamheden</small></span>
      </a>
      ${concepten.length ? `<h2>Verder gaan</h2><ul class="mlijst">${concepten.slice(0, 5).map((i) => regel({
    href: `#/m/inspectie/${i.id}`, icoon: '📝', titel: `Concept ${i.soort.toLowerCase()} · ${datumNL(i.datum)}`, object: objectMap.get(i.objectId),
  })).join('')}</ul>` : ''}
      <section id="mijnpakketten"></section>
      <section id="logisch"></section>
      <h2>Vandaag vastgelegd</h2>
      ${vandaagLijst.length ? `<ul class="mlijst">${vandaagLijst.map(regel).join('')}</ul>` : '<p class="mleeg">Nog niets vastgelegd vandaag.</p>'}
    </div>`;
  toonMijnPakketten(app.querySelector('#mijnpakketten'));
  toonLogischNu(app.querySelector('#logisch'));
}

async function toonMijnPakketten(el) {
  const g = await pakketGegevens();
  const ik = sync.sessie()?.gebruiker?.email ?? '';
  // Per actieve ronde een regel: daar ga je direct mee aan de slag.
  const mijn = actieveRondes(g).filter(({ pakket }) => pakketVoorMij(pakket, ik));
  if (!el.isConnected || !mijn.length) return;
  el.innerHTML = `<h2>Mijn werkpakketten</h2><ul class="mlijst pakketlijst">${mijn.slice(0, 4).map(({ pakket, voortgang }) => mobielPakketRegel(pakket, voortgang)).join('')}</ul>
    ${mijn.length > 4 ? '<p><a href="#/m/pakketten">Alle werkpakketten →</a></p>' : ''}`;
}

// ---------------------------------------------------------------------------
// Mobiel: object kiezen (zoeken of dichtbij via GPS)
// ---------------------------------------------------------------------------
let laatstePositie = null;

function afstandTekst(m) {
  if (m < 5) return '📍 hier';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

async function objectKiezer(doel) {
  const objecten = (await inProject('objecten'))
    .filter((o) => o.status !== 'Gesloopt')
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  const titel = { werk: 'Registratie werkzaamheden', inspectie: 'Schouw & inspectie', bvc: 'Boomveiligheidscontrole', vrijgave: 'Flora & fauna vrijgave' }[doel];
  const vrijgaven = doel === 'vrijgave' || doel === 'werk' ? await inProject('vrijgaven') : [];
  const bomen = objecten.filter((o) => /^Boom|beplanting/i.test(o.type ?? ''));
  const kandidaten = doel === 'bvc' && bomen.length ? bomen : objecten;
  const keuzeSoort = doel === 'inspectie' || doel === 'bvc' ? `<div class="segment soortkeuze" role="tablist">
      <a href="#/m/inspectie" class="${doel === 'inspectie' ? 'actief' : ''}">🔍 Schouw / inspectie</a>
      <a href="#/m/bvc" class="${doel === 'bvc' ? 'actief' : ''}">🌳 Boomveiligheid</a></div>` : '';
  app.innerHTML = `
    <div class="mkop"><a href="#/" class="mterug" aria-label="Terug">←</a>
      <div><small>${titel}</small><h1>${doel === 'bvc' ? 'Kies een boom' : 'Kies een object'}</h1></div></div>
    ${keuzeSoort}
    ${doel === 'bvc' ? '<button class="knop mgroot" id="nieuweboom" type="button">＋ Nieuwe boom op mijn locatie</button>' : ''}
    ${objecten.length ? `
    <div class="mzoek">
      <input type="search" id="zoek" placeholder="Zoek op code, naam of locatie" autocomplete="off" aria-label="Zoeken">
      <button class="knop" id="dichtbij" type="button">📍 Dichtbij</button>
    </div>
    <ul class="mlijst" id="lijst"></ul>` : leegKaart('Er zijn nog geen objecten. Richt de objecten eerst in via de website op de pc.')}`;
  app.querySelector('#nieuweboom')?.addEventListener('click', nieuweBoomHier);
  if (!objecten.length) return;

  const zoek = app.querySelector('#zoek');
  const toon = () => {
    const q = zoek.value.trim().toLowerCase();
    const lijst = kandidaten.filter((o) => !q || `${o.code} ${o.naam} ${o.locatie} ${o.type}`.toLowerCase().includes(q));
    const metAfstand = lijst.map((o) => ({ o, afstand: laatstePositie ? gis.afstandTot(laatstePositie, objectGeometrie(o)) : null }));
    if (laatstePositie) metAfstand.sort((a, b) => (a.afstand ?? Infinity) - (b.afstand ?? Infinity));
    const MAX = 100;
    app.querySelector('#lijst').innerHTML = metAfstand.length ? metAfstand.slice(0, MAX).map(({ o, afstand }) => `
      <li><a href="#/m/${doel}/nieuw?object=${encodeURIComponent(o.id)}">
        <span><strong>${esc(o.code)} – ${esc(o.naam)}</strong><small>${esc([o.type, o.boomsoort ? soortNaam(o.boomsoort) : o.locatie].filter(Boolean).join(' · '))}</small>
          ${vrijgaven.length || doel === 'vrijgave' ? `<small>${vrijgaveLabel(eco.vrijgaveVoorObject(vrijgaven, o.id, vandaag()))}</small>` : ''}</span>
        ${afstand != null ? `<span class="mafstand">${afstand === 0 ? '📍 hier' : afstandTekst(afstand)}</span>` : '<span class="mpijl">›</span>'}
      </a></li>`).join('') + (metAfstand.length > MAX ? `<li class="mleeg">+ ${metAfstand.length - MAX} meer – zoek of gebruik 📍 Dichtbij.</li>` : '')
      : '<li class="mleeg">Geen objecten gevonden.</li>';
  };
  zoek.addEventListener('input', toon);
  app.querySelector('#dichtbij').onclick = () => {
    if (!navigator.geolocation) return melding('Locatiebepaling wordt niet ondersteund.', 'fout');
    const knop = app.querySelector('#dichtbij');
    knop.disabled = true;
    knop.textContent = '📍 Zoeken…';
    navigator.geolocation.getCurrentPosition((pos) => {
      laatstePositie = [pos.coords.longitude, pos.coords.latitude];
      knop.disabled = false;
      knop.textContent = '📍 Dichtbij';
      toon();
    }, (fout) => {
      knop.disabled = false;
      knop.textContent = '📍 Dichtbij';
      melding(`Locatie niet beschikbaar: ${fout.message}`, 'fout');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };
  toon();
}

// ---------------------------------------------------------------------------
// Mobiel: account en weergave
// ---------------------------------------------------------------------------
async function mobielAccount() {
  app.innerHTML = `
    <div class="mkop"><a href="#/" class="mterug" aria-label="Terug">←</a><div><small>Instellingen</small><h1>Account</h1></div></div>
    <section class="kaart" id="account"></section>
    <form class="kaart" id="naam">
      <div class="veld"><label for="f-naam">Je naam (inspecteur / uitvoerder)</label>
        <input id="f-naam" name="naam" value="${esc(instelling.lees('inspecteur'))}" autocomplete="name"></div>
      <div class="formvoet"><button class="knop primair" type="submit">Opslaan</button></div>
    </form>
    <section class="kaart">
      <h2>Weergave</h2>
      <p>Dashboard, objectbeheer en rapporten zitten in de volledige versie, bedoeld voor de pc.</p>
      <button class="knop" id="volledig" type="button">Volledige versie openen</button>
    </section>`;
  toonAccount(app.querySelector('#account'));
  app.querySelector('#naam').onsubmit = (e) => {
    e.preventDefault();
    instelling.schrijf('inspecteur', formulierData(e.target).naam);
    melding('Naam opgeslagen');
  };
  app.querySelector('#volledig').onclick = () => {
    instelling.schrijf('weergave', 'volledig');
    ga('#/');
  };
}

// ---------------------------------------------------------------------------
// Werkzaamheden
// ---------------------------------------------------------------------------
const WERKSTATUS = { gereed: 'Gereed', vervolg: 'Vervolg nodig' };

function werkStatusLabel(status) {
  return `<span class="label-status ${status === 'vervolg' ? 'binnenkort' : 'afgerond'}">${WERKSTATUS[status] ?? 'Gereed'}</span>`;
}

function urenTekst(uren) {
  const n = Number(uren);
  return uren === '' || uren == null || !Number.isFinite(n) ? '–' : `${String(n).replace('.', ',')} u`;
}

async function werkzaamhedenLijst() {
  const [werk, objecten] = await Promise.all([inProject('werkzaamheden'), inProject('objecten')]);
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  werk.sort((a, b) => String(b.datum).localeCompare(String(a.datum)) || String(b.gewijzigd).localeCompare(String(a.gewijzigd)));
  const maanden = [...new Set(werk.map((w) => String(w.datum).slice(0, 7)))];
  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Werkzaamheden</h1><p>${werk.length} geregistreerde werkzaamheden.</p></div>
      <div class="knoppen">
        <button class="knop" id="export">CSV exporteren</button>
        <a class="knop primair" href="#/werkzaamheden/nieuw">+ Werkzaamheid registreren</a>
      </div>
    </div>
    <div class="filters">
      <input type="search" id="zoek" placeholder="Zoek op object, uitvoerder, omschrijving…" aria-label="Zoeken">
      <select id="soort" aria-label="Soort"><option value="">Alle soorten</option>${WERKSOORTEN.map((s) => optie(s, s)).join('')}</select>
      <select id="status" aria-label="Status"><option value="">Alle statussen</option>${Object.entries(WERKSTATUS).map(([k, v]) => optie(k, v)).join('')}</select>
      <select id="maand" aria-label="Maand"><option value="">Alle maanden</option>
        ${maanden.map((m) => optie(m, new Date(`${m}-01T00:00:00`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }))).join('')}</select>
    </div>
    <div id="totaal" class="kaart"></div>
    <div class="kaart" style="padding:0"><div class="tabelhouder"><table>
      <thead><tr><th>Datum</th><th>Object</th><th>Soort</th><th class="verberg-mobiel">Uitvoerder</th><th>Uren</th><th class="verberg-mobiel">Foto's</th><th>Status</th></tr></thead>
      <tbody id="rijen"></tbody></table></div></div>`;

  const filters = ['zoek', 'soort', 'status', 'maand'].map((id) => app.querySelector(`#${id}`));
  let zichtbaar = [];
  const toon = () => {
    const [zoek, soort, status, maand] = filters.map((f) => f.value);
    zichtbaar = werk.filter((w) => {
      const o = objectMap.get(w.objectId);
      if (zoek && !`${o?.code} ${o?.naam} ${w.uitvoerder} ${w.omschrijving} ${w.materiaal}`.toLowerCase().includes(zoek.toLowerCase())) return false;
      if (soort && w.soort !== soort) return false;
      if (status && (w.status || 'gereed') !== status) return false;
      if (maand && !String(w.datum).startsWith(maand)) return false;
      return true;
    });
    const uren = zichtbaar.reduce((t, w) => t + (Number(w.uren) || 0), 0);
    app.querySelector('#totaal').innerHTML = `<strong>${zichtbaar.length}</strong> werkzaamheden · <strong>${urenTekst(uren)}</strong> totaal`;
    app.querySelector('#rijen').innerHTML = zichtbaar.length ? zichtbaar.map((w) => `
      <tr class="klikbaar" data-href="#/werkzaamheden/${esc(w.id)}">
        <td>${datumNL(w.datum)}</td><td>${objectNaam(objectMap.get(w.objectId))}</td><td>${esc(w.soort || '–')}</td>
        <td class="verberg-mobiel">${esc(w.uitvoerder || '–')}</td><td>${urenTekst(w.uren)}</td>
        <td class="verberg-mobiel">${w.fotoIds?.length ?? 0}</td><td>${werkStatusLabel(w.status)}</td>
      </tr>`).join('') : `<tr><td colspan="7" class="leeg">${werk.length ? 'Geen werkzaamheden gevonden met deze filters.' : 'Nog geen werkzaamheden geregistreerd.'}</td></tr>`;
  };
  filters.forEach((f) => f.addEventListener('input', toon));
  toon();

  app.querySelector('#export').onclick = async () => {
    const extraDefs = ((await actiefProject())?.velden ?? []).filter((d) => d.formulier === 'werk' && d.type !== 'foto');
    const rijen = [['Datum', 'Objectcode', 'Object', 'Soort', 'Uitvoerder', 'Uren', 'Omschrijving', 'Materiaal', 'Status', 'Vervolg', 'Afgehandelde maatregelen', 'Foto\'s',
      ...extraDefs.map((d) => (d.type === 'getal' && d.eenheid ? `${d.label} (${d.eenheid})` : d.label))]];
    for (const w of zichtbaar) {
      const o = objectMap.get(w.objectId);
      const x = w.extra ?? {};
      const extraKolommen = extraDefs.map((d) => {
        const v = x[d.id];
        if (d.type === 'getal') return v ?? '';
        if (d.type === 'janee') return v === true ? 'Ja' : v === false ? 'Nee' : '';
        if (d.type === 'checklist') return (v ?? []).join(', ');
        return v ?? '';
      });
      rijen.push([w.datum, o?.code, o?.naam, w.soort, w.uitvoerder, w.uren, w.omschrijving, w.materiaal,
        WERKSTATUS[w.status] ?? 'Gereed', w.vervolg, w.maatregelen?.length ?? 0, w.fotoIds?.length ?? 0, ...extraKolommen]);
    }
    download(`werkzaamheden-${vandaag()}.csv`, csv(rijen), 'text/csv;charset=utf-8');
  };
}

async function werkDetail(id) {
  const w = await db.haal('werkzaamheden', id);
  if (!w) {
    app.innerHTML = leegKaart('Werkzaamheid niet gevonden.', '<a class="knop" href="#/werkzaamheden">Terug</a>');
    return;
  }
  const o = await db.haal('objecten', w.objectId);
  const gekoppeld = await gekoppeldeMaatregelen(w);
  app.innerHTML = `
    <div class="paginakop">
      <div><p><a href="${o ? `#/objecten/${esc(o.id)}` : '#/werkzaamheden'}">← ${o ? esc(o.code) : 'Werkzaamheden'}</a></p>
        <h1>${esc(w.soort || 'Werkzaamheid')} · ${datumNL(w.datum)}</h1><p>${objectNaam(o)}</p></div>
      <div class="knoppen">
        <a class="knop" href="#/werkzaamheden/${esc(id)}/bewerken">Bewerken</a>
        <button class="knop gevaar" id="verwijder">Verwijderen</button>
      </div>
    </div>
    <div class="raster-2">
      <section class="kaart">
        <h2>Gegevens</h2>
        <dl class="gegevens">
          <dt>Status</dt><dd>${werkStatusLabel(w.status)}</dd>
          <dt>Datum</dt><dd>${datumNL(w.datum)}</dd>
          <dt>Uitvoerder</dt><dd>${esc(w.uitvoerder || '–')}</dd>
          <dt>Uren</dt><dd>${urenTekst(w.uren)}</dd>
          ${w.materiaal ? `<dt>Materiaal</dt><dd style="white-space:pre-wrap">${esc(w.materiaal)}</dd>` : ''}
        </dl>
      </section>
      <section class="kaart">
        <h2>Omschrijving</h2>
        <p style="white-space:pre-wrap">${esc(w.omschrijving || '–')}</p>
        ${w.status === 'vervolg' ? `<h3>Vervolg nodig</h3><p style="white-space:pre-wrap">${esc(w.vervolg || '–')}</p>` : ''}
      </section>
    </div>
    ${await extraDetailHtml(w, 'werk')}
    ${w.fotoIds?.length ? `<section class="kaart"><h2>Foto's</h2>${await fotosHtml(w.fotoIds)}</section>` : ''}
    ${gekoppeld.length ? `<section class="kaart"><h2>Afgehandelde maatregelen</h2><ul>
      ${gekoppeld.map(({ gebrek: g, inspectie: i }) => `<li><a href="#/inspecties/${esc(i.id)}">${esc(g.bouwdeel)} – ${esc(g.gebrek)}</a>: ${esc(g.maatregel || '–')}</li>`).join('')}
    </ul></section>` : ''}`;

  app.querySelector('#verwijder').onclick = async () => {
    if (!confirm('Deze werkzaamheid inclusief foto\'s verwijderen? Gekoppelde maatregelen worden weer open gezet.')) return;
    await verwijderWerk(w);
    melding('Werkzaamheid verwijderd');
    ga(o ? `#/objecten/${o.id}` : '#/werkzaamheden');
  };
}

async function gekoppeldeMaatregelen(w) {
  const sleutels = new Set((w.maatregelen ?? []).map((m) => `${m.inspectieId}:${m.gebrekId}`));
  if (!sleutels.size) return [];
  const inspecties = await inProject('inspecties');
  const lijst = [];
  for (const i of inspecties) {
    for (const g of [...(i.gebreken ?? []), ...(i.bvc?.maatregelen ?? [])]) if (sleutels.has(`${i.id}:${g.id}`)) lijst.push({ gebrek: g, inspectie: i });
  }
  return lijst;
}

// Zet maatregelen (gebreken in inspecties) op uitgevoerd of terug op open.
async function werkMaatregelenBij(werkId, datum, aanzetten, uitzetten) {
  const inspecties = await inProject('inspecties');
  const nu = new Date().toISOString();
  for (const insp of inspecties) {
    let gewijzigd = false;
    for (const g of [...(insp.gebreken ?? []), ...(insp.bvc?.maatregelen ?? [])]) {
      const sleutel = `${insp.id}:${g.id}`;
      if (aanzetten.has(sleutel) && (g.maatregelStatus !== 'uitgevoerd' || g.werkzaamheidId !== werkId)) {
        Object.assign(g, { maatregelStatus: 'uitgevoerd', uitgevoerdOp: datum, werkzaamheidId: werkId });
        gewijzigd = true;
      } else if (uitzetten.has(sleutel) && g.werkzaamheidId === werkId) {
        Object.assign(g, { maatregelStatus: 'open', uitgevoerdOp: '', werkzaamheidId: '' });
        gewijzigd = true;
      }
    }
    if (gewijzigd) await db.bewaar('inspecties', { ...insp, gewijzigd: nu });
  }
}

async function verwijderWerk(w) {
  const sleutels = new Set((w.maatregelen ?? []).map((m) => `${m.inspectieId}:${m.gebrekId}`));
  if (sleutels.size) await werkMaatregelenBij(w.id, '', new Set(), sleutels);
  for (const fid of [...(w.fotoIds ?? []), ...(w.extraFotoIds ?? [])]) await db.verwijder('fotos', fid);
  await db.verwijder('werkzaamheden', w.id);
}

async function werkFormulier(id, objectId, { mobiel = false, taakId = null, maatregel = null, pakketId = null, rondeId = null } = {}) {
  const [objecten, inspecties] = await Promise.all([inProject('objecten'), inProject('inspecties')]);
  objecten.sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  const bestaand = id ? await db.haal('werkzaamheden', id) : null;
  const terug = mobiel ? '#/' : bestaand ? `#/werkzaamheden/${esc(id)}` : (objectId ? `#/objecten/${esc(objectId)}` : '#/werkzaamheden');
  if (id && !bestaand) {
    app.innerHTML = leegKaart('Werkzaamheid niet gevonden.', `<a class="knop" href="${terug}">Terug</a>`);
    return;
  }
  if (!objecten.length) {
    app.innerHTML = leegKaart(mobiel
      ? 'Er zijn nog geen objecten. Richt de objecten eerst in via de website op de pc.'
      : 'Registreer eerst een object.', mobiel ? '' : '<a class="knop primair" href="#/objecten/nieuw">+ Object registreren</a>');
    return;
  }
  const w = bestaand ?? {
    objectId: objectId ?? '', datum: vandaag(), soort: '', uitvoerder: instelling.lees('inspecteur'), uren: '', werkpakketId: pakketId ?? '', rondeId: rondeId ?? '',
    omschrijving: '', materiaal: '', status: 'gereed', vervolg: '', maatregelen: [], fotoIds: [],
  };
  const fotos = await laadFotos(w.fotoIds);
  const origineleFotoIds = new Set(w.fotoIds ?? []);
  const origineleKoppelingen = new Set((w.maatregelen ?? []).map((m) => `${m.inspectieId}:${m.gebrekId}`));
  const object = objecten.find((o) => o.id === w.objectId);
  const taak = taakId ? await db.haal('taken', taakId) : null;
  const pakket = await laadPakketView(w.werkpakketId, w.rondeId);
  if (pakket) w.rondeId = pakket.rondeId;
  if (pakket && !bestaand && pakket.werksoort) w.soort = pakket.werksoort;
  const pakketTerug = pakket ? pakketPagina(pakket, mobiel) : null;
  const vrijgavenProject = await inProject('vrijgaven');
  const vrijgaveBanner = (oid) => {
    if (!oid) return '';
    const vg = eco.vrijgaveVoorObject(vrijgavenProject, oid, vandaag());
    const g = vg ? eco.geldigheid(vg, vandaag()) : null;
    if (!vg && !pakket?.vrijgaveVereist) return '';
    if (g === 'geldig') {
      return `<div class="kaart mhier">🌿 <strong>Flora & fauna:</strong> ${vrijgaveLabel(vg)}${vg.voorwaarden ? `<br><small><strong>Voorwaarden:</strong> ${esc(vg.voorwaarden)}</small>` : ''}</div>`;
    }
    return `<div class="kaart waarschuwingskaart">⚠️ <strong>Geen geldige flora- en fauna-vrijgave</strong> ${vrijgaveLabel(vg)}
      <br><small>Start de werkzaamheden pas na een veldcheck door de ecologisch deskundige.</small>
      <a href="${mobiel ? '#/m/vrijgave/nieuw' : '#/vrijgaven/nieuw'}?object=${encodeURIComponent(oid)}">Vrijgave aanvragen →</a></div>`;
  };
  const pakketBanner = pakket ? `<div class="kaart mhier">📦 <strong>Werkpakket:</strong> ${esc(pakket.naam)}${pakket.omschrijving ? `<br><small>${esc(pakket.omschrijving)}</small>` : ''}</div>` : '';
  const maatregelInfo = maatregel ? (() => {
    const [iid, gid] = maatregel.split(':');
    return inspecties.find((i) => i.id === iid)?.gebreken?.find((g) => g.id === gid);
  })() : null;
  const taakBanner = taak || maatregelInfo
    ? `<div class="kaart mhier">📋 <strong>${taak ? 'Taak' : 'Maatregel'}:</strong> ${esc(taak?.titel ?? maatregelInfo.maatregel ?? '')}
        ${taak?.omschrijving ? `<br><small>${esc(taak.omschrijving)}</small>` : ''}
        ${maatregelInfo ? `<br><small>${esc(maatregelInfo.bouwdeel || '')} – ${esc(maatregelInfo.gebrek || '')}; wordt bij opslaan op uitgevoerd gezet.</small>` : ''}</div>` : '';

  const objectVeld = mobiel && object
    ? `<input type="hidden" name="objectId" value="${esc(object.id)}">`
    : `<div class="veld breed"><label for="f-object" class="vereist">Object</label>
        <select id="f-object" name="objectId" required><option value="">– kies een object –</option>
        ${objecten.map((o) => optie(o.id, `${o.code} – ${o.naam}`, w.objectId)).join('')}</select></div>`;
  const velden = `
    ${objectVeld}
    <div class="veld breed"><label for="f-soort" class="vereist">Soort werkzaamheid</label>
      <select id="f-soort" name="soort" required><option value="">– kies –</option>${WERKSOORTEN.map((s) => optie(s, s, w.soort)).join('')}</select></div>
    <div class="veld"><label for="f-datum" class="vereist">Datum</label><input id="f-datum" name="datum" type="date" required value="${esc(w.datum)}"></div>
    <div class="veld"><label for="f-uren">Uren</label><input id="f-uren" name="uren" type="number" min="0" max="1000" step="0.25" inputmode="decimal" value="${esc(w.uren)}"></div>
    <div class="veld breed"><label for="f-omschrijving">Wat is er gedaan?</label>
      <textarea id="f-omschrijving" name="omschrijving" maxlength="4000" placeholder="Korte omschrijving van het uitgevoerde werk">${esc(w.omschrijving)}</textarea></div>
    <div class="veld breed"><label>Foto's (voor / na)</label><div id="fotos"></div></div>
    <div class="veld"><label for="f-uitvoerder">Uitvoerder</label><input id="f-uitvoerder" name="uitvoerder" maxlength="100" value="${esc(w.uitvoerder)}"></div>
    <div class="veld"><label for="f-status">Status</label>
      <select id="f-status" name="status">${Object.entries(WERKSTATUS).map(([k, v]) => optie(k, v, w.status)).join('')}</select></div>
    <div class="veld breed" id="vervolg-veld" ${w.status === 'vervolg' ? '' : 'hidden'}><label for="f-vervolg">Welk vervolg is nodig?</label>
      <textarea id="f-vervolg" name="vervolg" maxlength="2000" style="min-height:60px">${esc(w.vervolg)}</textarea></div>
    <div class="veld breed"><label for="f-materiaal">Gebruikt materiaal</label>
      <input id="f-materiaal" name="materiaal" maxlength="500" value="${esc(w.materiaal)}"></div>`;

  app.innerHTML = mobiel ? `
    <div class="mkop"><a href="${pakketTerug ?? '#/'}" class="mterug" aria-label="Terug">←</a>
      <div><small>${bestaand ? 'Werkzaamheid bewerken' : 'Registratie werkzaamheden'}</small>
      <h1>${object ? `${esc(object.code)} – ${esc(object.naam)}` : 'Kies een object'}</h1></div></div>
    <form id="form" novalidate class="mform">
      ${taakBanner}${pakketBanner}<div id="vrijgave-banner">${vrijgaveBanner(w.objectId)}</div>
      <section class="kaart"><div class="velden">${velden}</div></section>
      <section class="kaart" id="extra-blok" hidden><h2>Extra gegevens</h2><div class="extra-velden"></div></section>
      <section class="kaart" id="maatregelen-blok"></section>
      <div class="mvoet"><button class="knop primair" type="submit">✓ Opslaan</button></div>
    </form>` : `
    <div class="paginakop"><div><p><a href="${terug}">← Terug</a></p>
      <h1>${bestaand ? 'Werkzaamheid bewerken' : 'Werkzaamheid registreren'}</h1></div></div>
    <form id="form" novalidate>
      <div id="vrijgave-banner">${vrijgaveBanner(w.objectId)}</div>
      <section class="kaart"><div class="velden">${velden}</div></section>
      <section class="kaart" id="extra-blok" hidden><h2>Extra gegevens</h2><div class="extra-velden"></div></section>
      <section class="kaart" id="maatregelen-blok"></section>
      <div class="formvoet kaart">
        <a class="knop" href="${terug}">Annuleren</a>
        <button class="knop primair" type="submit">Opslaan</button>
      </div>
    </form>`;

  const form = app.querySelector('#form');
  const extraB = await extraBlok(app.querySelector('#extra-blok'), await projectVelden('werk', () => form.elements.soort.value), bestaand);
  form.addEventListener('change', (e) => { if (e.target.name === 'soort') extraB.teken(); });
  const gekozen = new Set(origineleKoppelingen);
  if (maatregel) gekozen.add(maatregel);

  const toonFotos = () => {
    app.querySelector('#fotos').innerHTML = `<div class="fotos">
      ${fotos.map((f, n) => `<div class="foto"><img src="${esc(f.data)}" alt="Foto ${n + 1}" data-lichtbak>
        <button type="button" data-foto-weg="${n}" aria-label="Foto verwijderen">×</button></div>`).join('')}
      <label class="knop fotoknop">📷 Foto<input type="file" accept="image/*" capture="environment" multiple id="foto-input"></label></div>`;
  };

  // Openstaande maatregelen van het gekozen object die met dit werk kunnen worden afgehandeld.
  const toonMaatregelen = () => {
    const oid = form.elements.objectId.value;
    const lijst = alleMaatregelen(inspecties.filter((i) => i.objectId === oid), new Map())
      .filter(({ gebrek: g, inspectie: i }) => g.maatregelStatus !== 'uitgevoerd' || gekozen.has(`${i.id}:${g.id}`));
    const blok = app.querySelector('#maatregelen-blok');
    blok.hidden = !lijst.length;
    blok.innerHTML = lijst.length ? `
      <h2>Openstaande maatregelen</h2>
      <p><small>Vink aan wat met dit werk is afgehandeld; de maatregel wordt dan op uitgevoerd gezet.</small></p>
      <div class="vinklijst">${lijst.map(({ gebrek: g, inspectie: i }) => {
    const k = `${i.id}:${g.id}`;
    return `<label class="vink"><input type="checkbox" data-maatregel="${esc(k)}" ${gekozen.has(k) ? 'checked' : ''}>
          <span><strong>${esc(g.bouwdeel || 'Bouwdeel')} – ${esc(g.gebrek || 'gebrek')}</strong>
          <small>${esc(g.maatregel || 'Geen advies')} · ${urgentieLabel(g.urgentie)}</small></span></label>`;
  }).join('')}</div>` : '';
  };

  toonFotos();
  toonMaatregelen();

  form.addEventListener('input', (e) => {
    formulierGewijzigd = true;
    if (e.target.name === 'status') app.querySelector('#vervolg-veld').hidden = e.target.value !== 'vervolg';
    if (e.target.name === 'objectId') {
      gekozen.clear();
      toonMaatregelen();
      app.querySelector('#vrijgave-banner').innerHTML = vrijgaveBanner(e.target.value);
    }
    const k = e.target.dataset?.maatregel;
    if (k) {
      if (e.target.checked) gekozen.add(k); else gekozen.delete(k);
    }
  });
  form.addEventListener('change', async (e) => {
    if (e.target.id !== 'foto-input' || !e.target.files?.length) return;
    melding(`${e.target.files.length} foto('s) verwerken…`);
    try {
      for (const bestand of [...e.target.files]) fotos.push({ id: nieuwId(), data: await verkleinFoto(bestand) });
      formulierGewijzigd = true;
    } catch (fout) {
      melding(fout.message, 'fout');
    }
    toonFotos();
  });
  form.addEventListener('click', (e) => {
    const weg = e.target.closest('[data-foto-weg]');
    if (!weg) return;
    fotos.splice(Number(weg.dataset.fotoWeg), 1);
    formulierGewijzigd = true;
    toonFotos();
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = formulierData(form);
    if (!data.objectId) return melding('Kies een object.', 'fout');
    if (!data.soort) return melding('Kies de soort werkzaamheid.', 'fout');
    if (!data.datum) return melding('Vul de datum in.', 'fout');
    const fouten = extraB.fouten();
    if (fouten.length) {
      app.querySelector('#extra-blok').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return melding(`${fouten[0]}${fouten.length > 1 ? ` (en ${fouten.length - 1} meer)` : ''}`, 'fout');
    }
    const werkId = id ?? nieuwId();
    const nu = new Date().toISOString();
    const extraFotoIds = await extraB.bewaarFotos({ werkzaamheidId: werkId, projectId: w.projectId ?? projectId(), datum: nu });

    await db.bewaarVeel('fotos', fotos.filter((f) => !origineleFotoIds.has(f.id))
      .map((f) => ({ id: f.id, data: f.data, werkzaamheidId: werkId, projectId: w.projectId ?? projectId(), datum: nu })));
    const behouden = new Set(fotos.map((f) => f.id));
    for (const fid of origineleFotoIds) if (!behouden.has(fid)) await db.verwijder('fotos', fid);

    const uitzetten = new Set([...origineleKoppelingen].filter((k) => !gekozen.has(k)));
    await werkMaatregelenBij(werkId, data.datum, gekozen, uitzetten);

    await db.bewaar('werkzaamheden', {
      ...(bestaand ?? {}),
      id: werkId,
      projectId: w.projectId ?? projectId(),
      objectId: data.objectId,
      datum: data.datum,
      soort: data.soort,
      omschrijving: data.omschrijving,
      uren: data.uren === '' ? '' : Number(data.uren),
      uitvoerder: data.uitvoerder,
      status: data.status || 'gereed',
      vervolg: data.status === 'vervolg' ? data.vervolg : '',
      materiaal: data.materiaal,
      werkpakketId: w.werkpakketId ?? '', rondeId: w.werkpakketId ? (w.rondeId ?? '') : '',
      maatregelen: [...gekozen].map((k) => {
        const [inspectieId, gebrekId] = k.split(':');
        return { inspectieId, gebrekId };
      }),
      fotoIds: fotos.map((f) => f.id),
      extra: extraB.waarden(),
      extraLabels: extraB.labels(),
      extraFotoIds,
      aangemaakt: bestaand?.aangemaakt ?? nu,
      gewijzigd: nu,
    });
    if (data.uitvoerder) instelling.schrijf('inspecteur', data.uitvoerder);
    formulierGewijzigd = false;
    melding('Werkzaamheid opgeslagen');
    await rondTaakAf(taakId, werkId);
    ga(pakketTerug ?? (mobiel ? '#/' : `#/werkzaamheden/${werkId}`));
  };
}

// ---------------------------------------------------------------------------
// Projecten
// ---------------------------------------------------------------------------
const STANDAARD_PROJECT = 'standaard';

function projectId() {
  return instelling.lees('project', '');
}

function kiesProject(id) {
  instelling.schrijf('project', id);
}

async function inProject(store) {
  const pid = projectId();
  return (await db.alle(store)).filter((r) => r.projectId === pid);
}

async function actiefProject() {
  const pid = projectId();
  const p = pid ? await db.haal('projecten', pid) : null;
  return p && !p.verwijderd ? p : null;
}

async function zichtbareProjecten() {
  return (await db.alle('projecten')).filter((p) => !p.verwijderd)
    .sort((a, b) => String(a.naam).localeCompare(String(b.naam), 'nl', { numeric: true }));
}

const magBeheren = () => sync.rol() === 'beheerder';

// Gegevens van vóór de projectindeling komen in één "Eerste project" terecht.
async function migreerZonderProject() {
  const stores = ['lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken', 'fotos'];
  const los = {};
  let totaal = 0;
  for (const store of stores) {
    los[store] = (await db.alle(store)).filter((r) => !r.projectId);
    totaal += los[store].length;
  }
  if (!totaal) return;
  const nu = new Date().toISOString();
  if (!(await db.haal('projecten', STANDAARD_PROJECT))) {
    await db.bewaar('projecten', {
      id: STANDAARD_PROJECT, naam: 'Eerste project', opdrachtgever: '', omschrijving: 'Gegevens van vóór de projectindeling.',
      status: 'actief', leden: [], aangemaakt: nu, gewijzigd: nu,
    });
  }
  for (const store of stores) {
    await db.bewaarVeel(store, los[store].map((r) => ({ ...r, projectId: STANDAARD_PROJECT, ...(store === 'fotos' ? {} : { gewijzigd: nu }) })));
  }
  if (!projectId()) kiesProject(STANDAARD_PROJECT);
}

async function werkProjectkopBij() {
  const chip = document.getElementById('projectchip');
  if (!chip) return;
  const p = await actiefProject();
  chip.textContent = p ? p.naam : 'Kies een project';
  chip.title = p ? 'Ander project kiezen' : '';
}

async function projectenPagina() {
  const projecten = await zichtbareProjecten();
  const actief = projectId();
  const tellingen = new Map();
  const [objecten, inspecties, werk] = await Promise.all([db.alle('objecten'), db.alle('inspecties'), db.alle('werkzaamheden')]);
  for (const p of projecten) {
    tellingen.set(p.id, {
      objecten: objecten.filter((o) => o.projectId === p.id).length,
      inspecties: inspecties.filter((i) => i.projectId === p.id).length,
      werk: werk.filter((w) => w.projectId === p.id).length,
    });
  }
  const beheer = magBeheren() && !isMobiel();
  const nietIngelogd = sync.isIngesteld() && !sync.sessie();
  app.innerHTML = `
    <div class="paginakop">
      <div><h1>${actief && projecten.some((p) => p.id === actief) ? 'Projecten' : 'Kies een project'}</h1>
        <p>Elk project heeft een eigen inhoud: objecten, GIS-lagen, inspecties, werkzaamheden en taken.</p></div>
      ${beheer ? '<div class="knoppen"><a class="knop primair" href="#/projecten/nieuw">+ Nieuw project</a></div>' : ''}
    </div>
    ${nietIngelogd ? `<a class="kaart mhint" href="${isMobiel() ? '#/m/account' : '#/instellingen'}">🔑 <span><strong>Log in</strong> om de projecten van je organisatie te zien.</span></a>` : ''}
    ${projecten.length ? `<div class="projecten">${projecten.map((p) => {
    const t = tellingen.get(p.id);
    return `
      <article class="kaart project ${p.id === actief ? 'actief' : ''}">
        <button class="projectknop" data-kies="${esc(p.id)}">
          <span class="projectnaam">${esc(p.naam)}${p.id === actief ? ' <span class="label-status afgerond">Geopend</span>' : ''}</span>
          ${p.opdrachtgever ? `<small>${esc(p.opdrachtgever)}</small>` : ''}
          ${p.omschrijving ? `<small>${esc(p.omschrijving)}</small>` : ''}
          <small>${t.objecten} objecten · ${t.inspecties} inspecties · ${t.werk} werkzaamheden${p.status === 'afgerond' ? ' · afgerond' : ''}</small>
        </button>
        ${beheer ? `<div class="knoppen"><a class="knop klein" href="#/projecten/${esc(p.id)}/bewerken">Bewerken</a>
          <a class="knop klein" href="#/projecten/${esc(p.id)}/velden">Formuliervelden${(p.velden ?? []).length ? ` (${p.velden.length})` : ''}</a></div>` : ''}
      </article>`;
  }).join('')}</div>` : leegKaart(magBeheren()
    ? 'Er zijn nog geen projecten. Maak het eerste project aan.'
    : 'Je bent nog niet aan een project toegevoegd. Vraag de beheerder om je e-mailadres aan een project toe te voegen.',
  beheer ? '<a class="knop primair" href="#/projecten/nieuw">+ Nieuw project</a>' : '')}`;

  app.querySelectorAll('[data-kies]').forEach((k) => {
    k.onclick = () => {
      kiesProject(k.dataset.kies);
      melding('Project geopend');
      ga('#/');
    };
  });
}

async function projectFormulier(id) {
  const bestaand = id ? await db.haal('projecten', id) : null;
  if (id && !bestaand) {
    app.innerHTML = leegKaart('Project niet gevonden.', '<a class="knop" href="#/projecten">Terug</a>');
    return;
  }
  if (!magBeheren()) {
    app.innerHTML = leegKaart('Alleen beheerders kunnen projecten aanmaken en wijzigen.', '<a class="knop" href="#/projecten">Terug</a>');
    return;
  }
  const p = bestaand ?? { naam: '', opdrachtgever: '', omschrijving: '', status: 'actief', leden: [] };
  app.innerHTML = `
    <div class="paginakop"><div><p><a href="#/projecten">← Projecten</a></p>
      <h1>${bestaand ? `Project bewerken: ${esc(p.naam)}` : 'Nieuw project'}</h1></div></div>
    <form id="form" class="kaart" novalidate>
      <div class="velden">
        <div class="veld"><label for="f-naam" class="vereist">Projectnaam</label><input id="f-naam" name="naam" required maxlength="120" value="${esc(p.naam)}"></div>
        <div class="veld"><label for="f-opdrachtgever">Opdrachtgever</label><input id="f-opdrachtgever" name="opdrachtgever" maxlength="120" value="${esc(p.opdrachtgever)}"></div>
        <div class="veld"><label for="f-status">Status</label><select id="f-status" name="status">
          ${optie('actief', 'Actief', p.status)}${optie('afgerond', 'Afgerond', p.status)}</select></div>
        <div class="veld breed"><label for="f-omschrijving">Omschrijving</label>
          <textarea id="f-omschrijving" name="omschrijving" maxlength="2000">${esc(p.omschrijving)}</textarea></div>
        <div class="veld breed"><label for="f-leden">Projectleden (één e-mailadres per regel)</label>
          <textarea id="f-leden" name="leden" placeholder="inspecteur@bedrijf.nl">${esc((p.leden ?? []).join('\n'))}</textarea>
          <small>Projectleden zien en bewerken alleen de inhoud van dit project. Beheerders zien alle projecten.
          Een collega maakt zelf een account aan (of krijgt een uitnodiging) met hetzelfde e-mailadres.</small></div>
      </div>
      <div class="formvoet">
        ${bestaand ? '<button type="button" class="knop gevaar" id="verwijder" style="margin-right:auto">Project verwijderen</button>' : ''}
        <a class="knop" href="#/projecten">Annuleren</a>
        <button class="knop primair" type="submit">Opslaan</button>
      </div>
    </form>`;
  const form = app.querySelector('#form');
  form.addEventListener('input', () => { formulierGewijzigd = true; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formulierData(form);
    if (!d.naam) return melding('Vul een projectnaam in.', 'fout');
    const leden = [...new Set(form.elements.leden.value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    const fout = leden.find((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (fout) return melding(`Ongeldig e-mailadres: ${fout}`, 'fout');
    const nu = new Date().toISOString();
    const opslaan = {
      ...p, id: bestaand?.id ?? nieuwId(), naam: d.naam, opdrachtgever: d.opdrachtgever, omschrijving: d.omschrijving,
      status: d.status, leden, aangemaakt: p.aangemaakt ?? nu, gewijzigd: nu,
    };
    await db.bewaar('projecten', opslaan);
    formulierGewijzigd = false;
    if (!bestaand) kiesProject(opslaan.id);
    melding(bestaand ? 'Project opgeslagen' : 'Project aangemaakt en geopend');
    ga(bestaand ? '#/projecten' : '#/');
  };
  app.querySelector('#verwijder')?.addEventListener('click', async () => {
    const naam = prompt(`Hiermee verwijder je het project met álle objecten, GIS-lagen, inspecties, werkzaamheden, taken en foto's.\n\nTyp de projectnaam "${p.naam}" om te bevestigen:`);
    if (naam !== p.naam) return;
    for (const store of ['fotos', 'vrijgaven', 'overgeslagen', 'werkpakketten', 'taken', 'werkzaamheden', 'inspecties', 'objecten', 'lagen']) {
      const ids = (await db.alle(store)).filter((r) => r.projectId === p.id).map((r) => r.id);
      await db.verwijderVeel(store, ids);
    }
    await db.verwijder('projecten', p.id);
    if (projectId() === p.id) kiesProject('');
    melding('Project verwijderd');
    ga('#/projecten');
  });
}

// ---------------------------------------------------------------------------
// GIS: lagen inladen en beheren
// ---------------------------------------------------------------------------
const LAAGKLEUREN = ['#1f78b4', '#33a02c', '#e31a1c', '#ff7f00', '#6a3d9a', '#b15928', '#a6cee3', '#b2df8a'];

function geometrieInfo(o) {
  if (!o.geometrie) return '';
  const soort = gis.soortGeometrie(o.geometrie);
  if (soort === 'vlak') return `Vlak · ${Math.round(gis.oppervlakte(o.geometrie)).toLocaleString('nl-NL')} m²`;
  if (soort === 'lijn') return `Lijn · ${Math.round(gis.lengte(o.geometrie)).toLocaleString('nl-NL')} m`;
  return 'Punt';
}

async function gisImport() {
  if (!magBeheren()) {
    app.innerHTML = leegKaart('Alleen beheerders kunnen GIS-lagen inladen.', '<a class="knop" href="#/kaart">Terug</a>');
    return;
  }
  const project = await actiefProject();
  app.innerHTML = `
    <div class="paginakop"><div><p><a href="#/kaart">← Kaart &amp; GIS</a></p><h1>GIS-laag inladen</h1>
      <p>In project <strong>${esc(project.naam)}</strong>. Elk vlak, elke lijn of elk punt wordt een object waaraan je
      inspecties, werkzaamheden en taken koppelt.</p></div></div>
    <section class="kaart">
      <h2>1. Bestand kiezen</h2>
      <label class="knop primair fotoknop">📂 Bestand kiezen<input type="file" id="bestand" accept=".geojson,.json,.zip,.gpkg"></label>
      <p><small>GeoJSON (.geojson), Shapefile (.zip met .shp, .dbf en .prj) of GeoPackage (.gpkg).
      Coördinaten in RD New (EPSG:28992), WGS84 of Web Mercator worden automatisch omgerekend.</small></p>
      <p id="status"></p>
    </section>
    <div id="stap2"></div>`;
  const statusEl = app.querySelector('#status');
  app.querySelector('#bestand').onchange = async (e) => {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    statusEl.textContent = `${bestand.name} lezen…`;
    app.querySelector('#stap2').innerHTML = '';
    try {
      const lagen = await gis.leesBestand(bestand);
      statusEl.innerHTML = `✓ <strong>${esc(bestand.name)}</strong> gelezen: ${lagen.length} laag/lagen.`;
      toonImportInstellingen(lagen, bestand.name);
    } catch (fout) {
      console.error(fout);
      statusEl.innerHTML = `<span class="label-status verlopen" style="white-space:normal">${esc(fout.message)}</span>`;
    }
  };
}

function toonImportInstellingen(lagen, bestandsnaam) {
  const el = app.querySelector('#stap2');
  let laag = lagen[0];
  const teken = () => {
    const vs = gis.velden(laag.features);
    const soorten = {};
    for (const f of laag.features) {
      const s = gis.soortGeometrie(f.geometry);
      soorten[s] = (soorten[s] ?? 0) + 1;
    }
    const raad = (re) => vs.find((v) => re.test(v)) ?? '';
    const codeGok = raad(/^(code|id|objectcode|nummer|nr|identificatie|vak_?id|objectnummer|boomnummer|boom_?nr|boom_?id|boomcode|vaknr|vaknummer|vakcode|key|guid)$/i);
    const naamGok = raad(/^(naam|name|omschrijving|titel|label|straatnaam|straat|openbareruimtenaam)$/i);
    const typeGok = [
      [/singel|houtwal|bosplantsoen|^bos|gesloten|struweel|hakhout/i, 'Gesloten beplanting'],
      [/boom|bomen|tree/i, 'Boom'],
      [/groen|gras|gazon|heester|beplanting/i, 'Groenvak'],
      [/weg|verhard|klinker|asfalt|trottoir|stoep/i, 'Verhardingsvak'],
      [/fiets/i, 'Fietspad'],
      [/water|sloot|gracht|oever|vijver/i, 'Watergang / oever'],
      [/brug|viaduct/i, 'Brug (vast)'],
      [/riool|put/i, 'Riolering'],
      [/speel/i, 'Speelplek'],
    ].find(([re]) => re.test(laag.naam))?.[1] ?? 'Overig';
    const voorvoegsel = laag.naam.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'GV';
    el.innerHTML = `
      <section class="kaart">
        <h2>2. Controleren</h2>
        ${lagen.length > 1 ? `<div class="veld" style="max-width:420px;margin-bottom:1rem"><label for="f-laag">Laag in dit bestand</label>
          <select id="f-laag">${lagen.map((l, i) => optie(i, `${l.naam} (${l.features.length})`, lagen.indexOf(laag))).join('')}</select></div>` : ''}
        <dl class="gegevens">
          <dt>Objecten</dt><dd>${laag.features.length.toLocaleString('nl-NL')}</dd>
          <dt>Geometrie</dt><dd>${Object.entries(soorten).map(([s, n]) => `${n} × ${s}`).join(', ')}</dd>
          <dt>Coördinaten</dt><dd>${esc(gis.CRS_NAAM[laag.crs])}${laag.crs !== 'wgs84' ? ' → omgerekend naar WGS84' : ''}</dd>
          <dt>Kenmerken</dt><dd>${vs.length ? vs.map(esc).join(', ') : 'geen'}</dd>
        </dl>
        ${laag.features.length > 20000 ? '<p class="label-status binnenkort" style="white-space:normal">Let op: dit is een grote laag. Inladen en synchroniseren kan even duren; overweeg de laag op te splitsen.</p>' : ''}
        ${vs.length ? `<div class="tabelhouder" style="margin-top:1rem"><table>
          <thead><tr>${vs.slice(0, 8).map((v) => `<th>${esc(v)}</th>`).join('')}</tr></thead>
          <tbody>${laag.features.slice(0, 5).map((f) => `<tr>${vs.slice(0, 8).map((v) => `<td>${esc(f.properties[v])}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>` : ''}
      </section>
      <form class="kaart" id="importform" novalidate>
        <h2>3. Instellingen</h2>
        <div class="velden">
          <div class="veld"><label for="f-naam" class="vereist">Naam van de laag</label><input id="f-naam" name="naam" required value="${esc(laag.naam)}"></div>
          <div class="veld"><label for="f-type">Objecttype</label><select id="f-type" name="type">
            ${OBJECTTYPEN.map((t) => optie(t, t, typeGok)).join('')}</select></div>
          <div class="veld"><label for="f-code">Objectcode uit kolom</label><select id="f-code" name="codeveld">
            ${optie('', '— automatisch nummeren —', codeGok)}${vs.map((v) => optie(v, v, codeGok)).join('')}</select></div>
          <div class="veld"><label for="f-voorvoegsel">Voorvoegsel bij nummeren</label><input id="f-voorvoegsel" name="voorvoegsel" maxlength="10" value="${esc(voorvoegsel)}"></div>
          <div class="veld"><label for="f-naamveld">Naam uit kolom</label><select id="f-naamveld" name="naamveld">
            ${optie('', '— laagnaam + nummer —', naamGok)}${vs.map((v) => optie(v, v, naamGok)).join('')}</select></div>
          <div class="veld"><label for="f-interval">Inspectie-interval (jaren)</label>
            <input id="f-interval" name="interval" type="number" min="0.5" max="20" step="0.5" placeholder="leeg = geen planning">
            <small>Vul in als elk object periodiek geïnspecteerd moet worden; er ontstaan dan automatisch taken.</small></div>
          <div class="veld"><label for="f-kleur">Kleur op de kaart</label><input id="f-kleur" name="kleur" type="color" value="${LAAGKLEUREN[Math.floor(Math.random() * LAAGKLEUREN.length)]}"></div>
        </div>
        <div class="formvoet"><a class="knop" href="#/kaart">Annuleren</a><button class="knop primair" type="submit">Laag inladen</button></div>
        <p id="voortgang"></p>
      </form>`;
    el.querySelector('#f-laag')?.addEventListener('change', (e) => { laag = lagen[Number(e.target.value)]; teken(); });
    el.querySelector('#importform').onsubmit = async (e) => {
      e.preventDefault();
      const d = formulierData(e.target);
      if (!d.naam) return melding('Geef de laag een naam.', 'fout');
      const knop = e.target.querySelector('button[type=submit]');
      knop.disabled = true;
      try {
        const n = await importeerLaag(laag, d, bestandsnaam, (tekst) => { el.querySelector('#voortgang').textContent = tekst; });
        melding(`${n} objecten ingeladen`);
        ga('#/kaart');
      } catch (fout) {
        knop.disabled = false;
        melding(`Inladen mislukt: ${fout.message}`, 'fout');
      }
    };
  };
  teken();
}

async function importeerLaag(laag, instellingen, bestandsnaam, voortgang) {
  const pid = projectId();
  const nu = new Date().toISOString();
  const bestaandeCodes = new Set((await inProject('objecten')).map((o) => String(o.code).toLowerCase()));
  const laagId = nieuwId();
  const uniek = (code) => {
    let c = code;
    for (let n = 2; bestaandeCodes.has(c.toLowerCase()); n++) c = `${code}-${n}`;
    bestaandeCodes.add(c.toLowerCase());
    return c;
  };
  const breedte = String(laag.features.length).length;
  const objecten = laag.features.map((f, i) => {
    const nummer = String(i + 1).padStart(Math.max(3, breedte), '0');
    const ruw = instellingen.codeveld ? String(f.properties[instellingen.codeveld] ?? '').trim() : '';
    const code = uniek(ruw || `${instellingen.voorvoegsel || 'GV'}-${nummer}`);
    const naam = instellingen.naamveld ? String(f.properties[instellingen.naamveld] ?? '').trim() : '';
    const punt = gis.middelpunt(f.geometry);
    return {
      id: nieuwId(), projectId: pid, laagId, code, type: instellingen.type,
      naam: naam || (instellingen.type === 'Boom' ? `${gisBoomNaam(f.properties) || 'Boom'} ${code}` : `${instellingen.naam} ${nummer}`),
      status: 'In gebruik', geometrie: f.geometry, kenmerken: f.properties,
      lat: punt ? punt[1] : '', lng: punt ? punt[0] : '',
      inspectieInterval: instellingen.interval ? Number(instellingen.interval) : '',
      aangemaakt: nu, gewijzigd: nu,
    };
  });
  await db.bewaar('lagen', {
    id: laagId, projectId: pid, naam: instellingen.naam, bron: bestandsnaam, kleur: instellingen.kleur,
    soort: gis.soortGeometrie(laag.features[0].geometry), aantal: objecten.length, velden: gis.velden(laag.features),
    aangemaakt: nu, gewijzigd: nu,
  });
  for (let i = 0; i < objecten.length; i += 500) {
    voortgang(`Opslaan… ${Math.min(i + 500, objecten.length)} van ${objecten.length}`);
    await db.bewaarVeel('objecten', objecten.slice(i, i + 500));
  }
  return objecten.length;
}

async function verwijderLaag(laag) {
  const [objecten, inspecties, werk, taken] = await Promise.all([inProject('objecten'), inProject('inspecties'), inProject('werkzaamheden'), inProject('taken')]);
  const metHistorie = new Set([...inspecties, ...werk, ...taken].map((r) => r.objectId));
  const vanLaag = objecten.filter((o) => o.laagId === laag.id);
  const behouden = vanLaag.filter((o) => metHistorie.has(o.id));
  const weg = vanLaag.filter((o) => !metHistorie.has(o.id));
  const tekst = `Laag "${laag.naam}" verwijderen?\n\n${weg.length} objecten zonder inspecties, werkzaamheden of taken worden verwijderd.`
    + (behouden.length ? `\n${behouden.length} objecten met historie blijven bewaard (los van de laag).` : '');
  if (!confirm(tekst)) return false;
  const nu = new Date().toISOString();
  await db.bewaarVeel('objecten', behouden.map((o) => ({ ...o, laagId: '', gewijzigd: nu })));
  await db.verwijderVeel('objecten', weg.map((o) => o.id));
  await db.verwijder('lagen', laag.id);
  return true;
}

// ---------------------------------------------------------------------------
// Kaart & GIS
// ---------------------------------------------------------------------------
// Achtergrondkaarten: standaard de PDOK-luchtfoto (Beeldmateriaal Nederland) op 50% sterkte, vervaagd naar wit.
const ACHTERGRONDEN = {
  luchtfoto: {
    naam: 'Luchtfoto',
    url: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
    opties: { maxZoom: 22, maxNativeZoom: 21, attribution: 'Luchtfoto &copy; <a href="https://www.pdok.nl" target="_blank" rel="noopener">PDOK</a> / Beeldmateriaal Nederland' },
  },
  kaart: {
    naam: 'Kaart (OpenStreetMap)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    opties: { maxZoom: 22, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap-bijdragers' },
  },
};

function voegAchtergrondToe(L, map) {
  const keuze = ACHTERGRONDEN[instelling.lees('achtergrond', 'luchtfoto')] ? instelling.lees('achtergrond', 'luchtfoto') : 'luchtfoto';
  const zetHelderheid = (waarde) => map.getContainer().style.setProperty('--kaart-helderheid', String(waarde / 100));
  let helderheid = Number(instelling.lees('helderheid', '50'));
  if (!(helderheid >= 10 && helderheid <= 100)) helderheid = 50;
  zetHelderheid(helderheid);

  const lagen = {};
  for (const [id, a] of Object.entries(ACHTERGRONDEN)) {
    lagen[a.naam] = L.tileLayer(a.url, { ...a.opties, className: 'achtergrondlaag' });
    lagen[a.naam].sleutel = id;
  }
  lagen[ACHTERGRONDEN[keuze].naam].addTo(map);
  L.control.layers(lagen, null, { position: 'topright' }).addTo(map);
  map.on('baselayerchange', (e) => instelling.schrijf('achtergrond', e.layer.sleutel));

  // Schuif voor de helderheid van de achtergrond (per apparaat onthouden).
  const Helderheid = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar helderheid');
      div.innerHTML = `<label title="Sterkte luchtfoto (lager = lichter)">🛰️<input type="range" min="10" max="100" step="10" value="${helderheid}"
        aria-label="Sterkte luchtfoto"><span>${helderheid}%</span></label>`;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      const invoer = div.querySelector('input');
      invoer.addEventListener('input', () => {
        zetHelderheid(Number(invoer.value));
        div.querySelector('span').textContent = `${invoer.value}%`;
        instelling.schrijf('helderheid', invoer.value);
      });
      return div;
    },
  });
  new Helderheid().addTo(map);
}

let leafletBelofte;
function laadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletBelofte ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'vendor/leaflet/leaflet.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = 'vendor/leaflet/leaflet.js';
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletBelofte = null; reject(new Error('Kaartbibliotheek kon niet worden geladen.')); };
    document.head.append(js);
  });
  return leafletBelofte;
}

// Kaart & GIS toont puur het areaal: lagen, objecttypen en GIS-kenmerken (geen conditiescores).
const CATEGORIEKLEUREN = ['#1f78b4', '#33a02c', '#e31a1c', '#ff7f00', '#6a3d9a', '#b15928', '#17becf', '#bcbd22', '#e377c2', '#8c564b', '#7f7f7f', '#2ca02c'];
const OVERIG_KLEUR = '#9aa5b1';

function oppervlakteTekst(m2) {
  if (!(m2 > 0)) return '';
  return m2 >= 10000 ? `${(m2 / 10000).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} ha` : `${Math.round(m2).toLocaleString('nl-NL')} m²`;
}

function lengteTekst(m) {
  if (!(m > 0)) return '';
  return m >= 1000 ? `${(m / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} km` : `${Math.round(m).toLocaleString('nl-NL')} m`;
}

function areaalMaten(objecten) {
  let vlak = 0; let lijn = 0; let punten = 0;
  for (const o of objecten) {
    const g = objectGeometrie(o);
    const soort = gis.soortGeometrie(g);
    if (soort === 'vlak') vlak += gis.oppervlakte(g);
    else if (soort === 'lijn') lijn += gis.lengte(g);
    else if (soort === 'punt') punten += 1;
  }
  return { vlak, lijn, punten };
}

function matenTekst(m, aantal) {
  return [`${aantal} objecten`, oppervlakteTekst(m.vlak), lengteTekst(m.lijn)].filter(Boolean).join(' · ');
}

async function kaart() {
  const [objecten, lagen] = await Promise.all([inProject('objecten'), inProject('lagen')]);
  const groepen = [
    ...lagen.map((l) => ({ id: l.id, naam: l.naam, kleur: l.kleur, laag: l, objecten: objecten.filter((o) => o.laagId === l.id) })),
    { id: '', naam: 'Losse objecten', kleur: '#0b4f6c', objecten: objecten.filter((o) => !o.laagId || !lagen.some((l) => l.id === o.laagId)) },
  ].map((g) => ({ ...g, objecten: g.objecten.filter((o) => objectGeometrie(o)) })).filter((g) => g.objecten.length || g.laag);
  const opKaart = groepen.flatMap((g) => g.objecten);
  const totaal = areaalMaten(opKaart);
  const velden = [...new Set(opKaart.flatMap((o) => Object.keys(o.kenmerken ?? {})))].sort((a, b) => a.localeCompare(b, 'nl'));
  let kleurOp = instelling.lees('kaartKleurOp', 'laag');
  if (kleurOp.startsWith('k:') && !velden.includes(kleurOp.slice(2))) kleurOp = 'laag';

  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Kaart &amp; GIS</h1><p>Areaal: ${matenTekst(totaal, opKaart.length)}${opKaart.length < objecten.length ? ` (${objecten.length - opKaart.length} objecten zonder geometrie)` : ''}.</p></div>
      ${magBeheren() ? '<a class="knop primair" href="#/gis/importeren">🗺️ GIS-laag inladen</a>' : ''}
    </div>
    <div class="kaartindeling">
      <div id="kaart" class="kaart"><p class="leeg">Kaart laden…</p></div>
      <aside class="kaart lagenpaneel">
        <div class="veld"><label for="kleurop">Kleur op</label>
          <select id="kleurop">${optie('laag', 'Laag', kleurOp)}${optie('type', 'Objecttype', kleurOp)}
            ${velden.length ? `<optgroup label="GIS-kenmerk">${velden.map((v) => optie(`k:${v}`, v, kleurOp)).join('')}</optgroup>` : ''}</select></div>
        <h3 style="margin-top:1rem">Legenda</h3>
        <div class="legenda" id="legenda"></div>
        <h2 style="margin-top:1.25rem">Lagen</h2>
        ${groepen.length ? groepen.map((g) => `
          <div class="laagregel">
            <label><input type="checkbox" data-laag="${esc(g.id)}" checked>
              <span class="kleurvak" style="background:${esc(g.kleur)}"></span>
              <span><strong>${esc(g.naam)}</strong><small>${matenTekst(areaalMaten(g.objecten), g.objecten.length)}${g.laag ? ` · ${esc(g.laag.bron)}` : ''}</small></span></label>
            ${g.laag && magBeheren() ? `<button class="knop klein gevaar" data-laag-weg="${esc(g.id)}" aria-label="Laag verwijderen">🗑</button>` : ''}
          </div>`).join('') : '<p class="leeg">Nog geen lagen. Laad een GIS-bestand in.</p>'}
      </aside>
    </div>`;

  app.querySelectorAll('[data-laag-weg]').forEach((k) => {
    k.onclick = async () => {
      const laag = lagen.find((l) => l.id === k.dataset.laagWeg);
      if (laag && await verwijderLaag(laag)) {
        melding('Laag verwijderd');
        router();
      }
    };
  });

  const groepVan = new Map(groepen.flatMap((g) => g.objecten.map((o) => [o.id, g])));
  // Kleurtoekenning per modus: laag, objecttype of de waarden van een GIS-kenmerk.
  const kleurSchema = (modus) => {
    if (modus === 'laag') {
      const telling = groepen.map((g) => ({ label: g.naam, kleur: g.kleur, aantal: g.objecten.length }));
      return { kleur: (o) => groepVan.get(o.id)?.kleur ?? OVERIG_KLEUR, telling };
    }
    const waardeVan = modus === 'type' ? (o) => o.type || '(geen type)'
      : (o) => { const v = o.kenmerken?.[modus.slice(2)]; return v === undefined || v === null || v === '' ? '(leeg)' : String(v); };
    const aantallen = new Map();
    for (const o of opKaart) aantallen.set(waardeVan(o), (aantallen.get(waardeVan(o)) ?? 0) + 1);
    const gesorteerd = [...aantallen.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'nl', { numeric: true }));
    const top = gesorteerd.slice(0, CATEGORIEKLEUREN.length - 1);
    const kleuren = new Map(top.map(([w], i) => [w, CATEGORIEKLEUREN[i]]));
    const overig = gesorteerd.slice(top.length).reduce((t, [, n]) => t + n, 0);
    const telling = [...top.map(([w, n]) => ({ label: w, kleur: kleuren.get(w), aantal: n })), ...(overig ? [{ label: `Overig (${gesorteerd.length - top.length} waarden)`, kleur: OVERIG_KLEUR, aantal: overig }] : [])];
    return { kleur: (o) => kleuren.get(waardeVan(o)) ?? OVERIG_KLEUR, telling };
  };
  const toonLegenda = (schema) => {
    app.querySelector('#legenda').innerHTML = schema.telling.map((t) => `<span><i style="background:${esc(t.kleur)}"></i>${esc(t.label)} <small>(${t.aantal})</small></span>`).join('')
      || '<span class="mleeg">Geen objecten</span>';
  };
  let schema = kleurSchema(kleurOp);
  toonLegenda(schema);

  if (!opKaart.length) {
    app.querySelector('#kaart').innerHTML = '<p class="leeg">Nog niets om te tonen. Laad een GIS-laag in of vul coördinaten in bij een object.</p>';
    return;
  }
  // Niet wachten: de kaart tekent zich zodra de bibliotheek binnen is.
  const kaartBelofte = tekenGisKaart(app.querySelector('#kaart'), { groepen, kleur: (o) => schema.kleur(o), groepVan });
  app.querySelector('#kleurop').onchange = async (e) => {
    instelling.schrijf('kaartKleurOp', e.target.value);
    schema = kleurSchema(e.target.value);
    toonLegenda(schema);
    (await kaartBelofte)?.herkleur();
  };
}

async function tekenGisKaart(el, { groepen, kleur, groepVan }) {
  let L;
  try {
    L = await laadLeaflet();
  } catch (fout) {
    if (el.isConnected) el.innerHTML = `<p class="leeg">${esc(fout.message)}</p>`;
    return null;
  }
  if (!el.isConnected) return null; // inmiddels naar een andere pagina
  el.innerHTML = '';
  const map = L.map(el, { preferCanvas: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
  voegAchtergrondToe(L, map);

  const popup = (o) => {
    const k = Object.entries(o.kenmerken ?? {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object');
    return `<strong>${esc(o.code)}</strong> – ${esc(o.naam)}<br>
      <small>${esc(o.type || '')}${groepVan.get(o.id)?.laag ? ` · laag ${esc(groepVan.get(o.id).naam)}` : ''}${o.geometrie ? ` · ${geometrieInfo(o)}` : ''}</small>
      ${k.length ? `<table class="popuptabel">${k.slice(0, 12).map(([n, v]) => `<tr><th>${esc(n)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
        ${k.length > 12 ? `<small>+ ${k.length - 12} kenmerken</small><br>` : ''}` : '<br>'}
      <a href="#/objecten/${esc(o.id)}">Object openen</a>`;
  };
  const stijl = (o) => {
    const k = kleur(o);
    return { color: k, weight: 2, fillColor: k, fillOpacity: 0.4 };
  };
  const kaartlagen = new Map();
  const grenzen = [];
  for (const g of groepen) {
    const objectMap = new Map(g.objecten.map((o) => [o.id, o]));
    const fc = { type: 'FeatureCollection', features: g.objecten.map((o) => ({ type: 'Feature', geometry: objectGeometrie(o), properties: { id: o.id } })) };
    const laag = L.geoJSON(fc, {
      style: (f) => stijl(objectMap.get(f.properties.id)),
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 7, weight: 2 }),
      onEachFeature: (f, l) => {
        l.bindPopup(() => popup(objectMap.get(f.properties.id)), { maxWidth: 320 });
        if (l.setStyle) l.setStyle({ ...stijl(objectMap.get(f.properties.id)), ...(f.geometry.type.includes('Point') ? { color: '#fff', fillOpacity: 1 } : {}) });
      },
    });
    laag.objectMap = objectMap;
    kaartlagen.set(g.id, laag);
    const b = laag.getBounds();
    if (b.isValid()) grenzen.push(b);
  }
  const totaal = grenzen.reduce((t, b) => t.extend(b), L.latLngBounds(grenzen[0].getSouthWest(), grenzen[0].getNorthEast()));
  // Eerst het kaartbeeld, dan de lagen toevoegen.
  map.fitBounds(totaal, { padding: [30, 30], maxZoom: 17, animate: false });
  kaartlagen.forEach((l) => l.addTo(map));
  app.querySelectorAll('[data-laag]').forEach((c) => {
    c.onchange = () => {
      const l = kaartlagen.get(c.dataset.laag);
      if (!l) return;
      if (c.checked) l.addTo(map); else l.remove();
    };
  });
  return {
    herkleur() {
      kaartlagen.forEach((laag) => laag.eachLayer((l) => {
        const o = laag.objectMap.get(l.feature.properties.id);
        const punt = l.feature.geometry.type.includes('Point');
        l.setStyle({ ...stijl(o), ...(punt ? { color: '#fff', fillOpacity: 1 } : {}) });
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Taken
// ---------------------------------------------------------------------------
const RANG_TEKST = { 1: 'Urgent', 2: 'Hoog', 3: 'Normaal', 4: 'Laag', 5: 'Monitoren' };
const BRON_TEKST = { gepland: 'Gepland', maatregel: 'Maatregel', planning: 'Inspectieplanning', pakket: 'Werkpakket' };

function rangLabel(rang) {
  const k = rang <= 1 ? 'direct' : rang === 2 ? 'binnenkort' : '';
  return `<span class="label-status ${k}">${RANG_TEKST[rang] ?? 'Normaal'}</span>`;
}

function taakHref(t, mobiel) {
  const q = new URLSearchParams({ object: t.object.id });
  if (t.taakId) q.set('taak', t.taakId);
  if (t.maatregel) q.set('maatregel', t.maatregel);
  if (t.pakketId) q.set('pakket', t.pakketId);
  if (t.rondeId && t.rondeId !== STANDAARD_RONDE) q.set('ronde', t.rondeId);
  if (t.soort === 'werk') return `${mobiel ? '#/m/werk' : '#/werkzaamheden'}/nieuw?${q}`;
  return `${mobiel ? '#/m/inspectie' : '#/inspecties'}/nieuw?${q}`;
}

async function alleTaken({ alleenMijn = false } = {}) {
  const { objecten, inspecties, status } = await laadAlles();
  const taken = await inProject('taken');
  const ik = alleenMijn ? (sync.sessie()?.gebruiker?.email ?? '') : '';
  let metOpen;
  if (alleenMijn) metOpen = await openPakketObjecten();
  else {
    const pg = await pakketGegevens();
    metOpen = actieveRondes(pg);
  }
  return { lijst: takenLijst({ objecten, inspecties, taken, planning: status, vandaag: vandaag(), ik, pakketten: metOpen }), taken, objecten };
}

async function rondTaakAf(taakId, gekoppeldId) {
  if (!taakId) return;
  const t = await db.haal('taken', taakId);
  if (!t || t.status === 'gereed') return;
  await db.bewaar('taken', { ...t, status: 'gereed', gereedOp: vandaag(), gekoppeldId, gewijzigd: new Date().toISOString() });
}

async function takenPagina() {
  const { lijst } = await alleTaken();
  const project = await actiefProject();
  const leden = project?.leden ?? [];
  const gesorteerd = sorteerTaken(lijst);
  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Taken</h1><p>Geplande taken, openstaande maatregelen en inspecties volgens planning. De inspecteur ziet ze op volgorde van urgentie en afstand.</p></div>
      <a class="knop primair" href="#/taken/nieuw">+ Taak plannen</a>
    </div>
    <div class="filters">
      <select id="bron" aria-label="Bron"><option value="">Alle bronnen</option>${Object.entries(BRON_TEKST).map(([k, v]) => optie(k, v)).join('')}</select>
      <select id="soort" aria-label="Soort"><option value="">Inspecties en werk</option>${optie('inspectie', 'Inspecties')}${optie('werk', 'Werkzaamheden')}</select>
      <select id="wie" aria-label="Toegewezen"><option value="">Iedereen</option>${optie('-', 'Niet toegewezen')}${leden.map((l) => optie(l, l)).join('')}</select>
    </div>
    <div class="kaart" style="padding:0"><div class="tabelhouder"><table>
      <thead><tr><th>Urgentie</th><th>Taak</th><th>Object</th><th class="verberg-mobiel">Deadline</th><th class="verberg-mobiel">Toegewezen</th><th class="verberg-mobiel">Bron</th><th></th></tr></thead>
      <tbody id="rijen"></tbody></table></div></div>`;
  const [bron, soort, wie] = ['#bron', '#soort', '#wie'].map((s) => app.querySelector(s));
  const toon = () => {
    const rijen = gesorteerd.filter((t) => (!bron.value || t.bron === bron.value) && (!soort.value || t.soort === soort.value)
      && (!wie.value || (wie.value === '-' ? !t.toegewezenAan : t.toegewezenAan === wie.value)));
    app.querySelector('#rijen').innerHTML = rijen.length ? rijen.map((t) => `
      <tr>
        <td>${rangLabel(t.rang)}</td>
        <td><strong>${t.soort === 'werk' ? '🛠️' : '🔍'} ${esc(t.titel)}</strong>${t.omschrijving ? `<br><small>${esc(t.omschrijving)}</small>` : ''}</td>
        <td><a href="#/objecten/${esc(t.object.id)}">${objectNaam(t.object)}</a></td>
        <td class="verberg-mobiel">${t.deadline ? `${datumNL(t.deadline)}${t.telaat ? ' ⚠️' : ''}` : '–'}</td>
        <td class="verberg-mobiel">${esc(t.toegewezenAan || '–')}</td>
        <td class="verberg-mobiel">${BRON_TEKST[t.bron]}</td>
        <td><div class="knoppen" style="flex-wrap:nowrap">
          <a class="knop klein" href="${taakHref(t, false)}">Uitvoeren</a>
          ${t.taakId ? `<a class="knop klein" href="#/taken/${esc(t.taakId)}/bewerken">Bewerken</a>`
    : `<a class="knop klein" href="#/taken/nieuw?object=${esc(t.object.id)}&soort=${t.soort}${t.maatregel ? `&maatregel=${encodeURIComponent(t.maatregel)}` : ''}&titel=${encodeURIComponent(t.titel)}">Plannen</a>`}
        </div></td>
      </tr>`).join('') : '<tr><td colspan="7" class="leeg">Geen openstaande taken.</td></tr>';
  };
  [bron, soort, wie].forEach((f) => f.addEventListener('input', toon));
  toon();
}

async function taakFormulier(id, q = new URLSearchParams()) {
  const [objecten, project] = await Promise.all([inProject('objecten'), actiefProject()]);
  objecten.sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  const bestaand = id ? await db.haal('taken', id) : null;
  if (id && !bestaand) {
    app.innerHTML = leegKaart('Taak niet gevonden.', '<a class="knop" href="#/taken">Terug</a>');
    return;
  }
  const t = bestaand ?? {
    objectId: q.get('object') ?? '', soort: q.get('soort') ?? 'inspectie', titel: q.get('titel') ?? '', omschrijving: '',
    prioriteit: 'normaal', deadline: '', toegewezenAan: '', status: 'open', maatregel: q.get('maatregel') ?? '',
  };
  app.innerHTML = `
    <div class="paginakop"><div><p><a href="#/taken">← Taken</a></p><h1>${bestaand ? 'Taak bewerken' : 'Taak plannen'}</h1></div></div>
    <form id="form" class="kaart" novalidate>
      <div class="velden">
        <div class="veld breed"><label for="f-object" class="vereist">Object / GIS-vlak</label>
          <select id="f-object" name="objectId" required><option value="">– kies –</option>
          ${objecten.map((o) => optie(o.id, `${o.code} – ${o.naam}`, t.objectId)).join('')}</select></div>
        <div class="veld"><label for="f-soort">Soort</label><select id="f-soort" name="soort">
          ${optie('inspectie', 'Schouw / inspectie', t.soort)}${optie('werk', 'Werkzaamheid', t.soort)}</select></div>
        <div class="veld"><label for="f-prioriteit">Prioriteit</label><select id="f-prioriteit" name="prioriteit">
          ${PRIORITEITEN.map((p) => optie(p.id, p.label, t.prioriteit)).join('')}</select></div>
        <div class="veld"><label for="f-deadline">Uiterlijk</label><input id="f-deadline" name="deadline" type="date" value="${esc(t.deadline)}"></div>
        <div class="veld"><label for="f-wie">Toegewezen aan</label>
          <input id="f-wie" name="toegewezenAan" type="email" list="leden" value="${esc(t.toegewezenAan)}" placeholder="leeg = iedereen">
          <datalist id="leden">${(project?.leden ?? []).map((l) => `<option value="${esc(l)}">`).join('')}</datalist></div>
        <div class="veld breed"><label for="f-titel" class="vereist">Wat moet er gebeuren?</label>
          <input id="f-titel" name="titel" required maxlength="200" value="${esc(t.titel)}" placeholder="bijv. Schouw na storm, leuning controleren"></div>
        <div class="veld breed"><label for="f-omschrijving">Toelichting</label>
          <textarea id="f-omschrijving" name="omschrijving" maxlength="2000">${esc(t.omschrijving)}</textarea></div>
        ${bestaand ? `<div class="veld"><label for="f-status">Status</label><select id="f-status" name="status">
          ${optie('open', 'Open', t.status)}${optie('gereed', 'Gereed', t.status)}</select></div>` : ''}
      </div>
      <section id="extra-blok" hidden style="margin-top:1.25rem"><h2>Extra gegevens</h2><div class="extra-velden"></div></section>
      <div class="formvoet">
        ${bestaand ? '<button type="button" class="knop gevaar" id="verwijder" style="margin-right:auto">Verwijderen</button>' : ''}
        <a class="knop" href="#/taken">Annuleren</a><button class="knop primair" type="submit">Opslaan</button>
      </div>
    </form>`;
  const form = app.querySelector('#form');
  const extraB = await extraBlok(app.querySelector('#extra-blok'), await projectVelden('taak', () => form.elements.soort.value), bestaand);
  form.addEventListener('change', (e) => { if (e.target.name === 'soort') extraB.teken(); });
  form.addEventListener('input', () => { formulierGewijzigd = true; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formulierData(form);
    if (!d.objectId) return melding('Kies een object.', 'fout');
    if (!d.titel) return melding('Omschrijf de taak.', 'fout');
    const fouten = extraB.fouten();
    if (fouten.length) return melding(`${fouten[0]}${fouten.length > 1 ? ` (en ${fouten.length - 1} meer)` : ''}`, 'fout');
    const nu = new Date().toISOString();
    const taakId = bestaand?.id ?? nieuwId();
    const extraFotoIds = await extraB.bewaarFotos({ taakId, projectId: t.projectId ?? projectId(), datum: nu });
    await db.bewaar('taken', {
      ...t, id: taakId, extra: extraB.waarden(), extraLabels: extraB.labels(), extraFotoIds, projectId: t.projectId ?? projectId(), objectId: d.objectId, soort: d.soort, titel: d.titel,
      omschrijving: d.omschrijving, prioriteit: d.prioriteit, deadline: d.deadline, toegewezenAan: d.toegewezenAan.toLowerCase(),
      status: d.status || t.status || 'open', aangemaakt: t.aangemaakt ?? nu, gewijzigd: nu,
    });
    formulierGewijzigd = false;
    melding('Taak opgeslagen');
    ga('#/taken');
  };
  app.querySelector('#verwijder')?.addEventListener('click', async () => {
    if (!confirm('Deze taak verwijderen?')) return;
    for (const fid of bestaand.extraFotoIds ?? []) await db.verwijder('fotos', fid);
    await db.verwijder('taken', id);
    ga('#/taken');
  });
}

// Mobiel: "Logisch nu" – taken op volgorde van urgentie en afstand.
async function toonLogischNu(el) {
  const { lijst } = await alleTaken({ alleenMijn: true });
  if (!el.isConnected) return;
  if (!lijst.length) {
    el.innerHTML = '<h2>Logisch nu</h2><p class="mleeg">Geen openstaande taken in dit project. 👍</p>';
    return;
  }
  const teken = () => {
    const gesorteerd = sorteerTaken(lijst, laatstePositie);
    const hier = laatstePositie ? gesorteerd.filter((t) => t.afstand === 0) : [];
    const hierObjecten = [...new Map(hier.map((t) => [t.object.id, t.object])).values()];
    el.innerHTML = `
      <div class="mtussen"><h2>Logisch nu</h2>
        <button class="knop klein" id="locatie" type="button">${laatstePositie ? '📍 Vernieuwen' : '📍 Locatie gebruiken'}</button></div>
      ${hierObjecten.length ? `<div class="kaart mhier">📍 Je staat in/bij <strong>${hierObjecten.map((o) => esc(`${o.code} – ${o.naam}`)).join(', ')}</strong></div>` : ''}
      <ul class="mlijst">${gesorteerd.slice(0, 6).map((t) => `
        <li><a href="${taakHref(t, true)}">
          <span class="micoon klein">${t.soort === 'werk' ? '🛠️' : '🔍'}</span>
          <span><strong>${esc(t.titel)}</strong><small>${objectNaam(t.object)}</small></span>
          <span class="mmeta">${rangLabel(t.rang)}${t.afstand != null ? `<small>${t.afstand === 0 ? 'hier' : afstandTekst(t.afstand)}</small>` : ''}</span>
        </a></li>`).join('')}</ul>
      ${gesorteerd.length > 6 ? `<p class="mleeg">+ ${gesorteerd.length - 6} andere taken verder weg of minder urgent.</p>` : ''}`;
    el.querySelector('#locatie').onclick = () => bepaalPositie(teken);
  };
  teken();
  // Locatie automatisch gebruiken als daar al toestemming voor is.
  if (!laatstePositie && navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((p) => {
      if (p.state === 'granted') bepaalPositie(teken, { stil: true });
    }).catch(() => {});
  }
}

function bepaalPositie(klaar, { stil = false } = {}) {
  if (!navigator.geolocation) {
    if (!stil) melding('Locatiebepaling wordt niet ondersteund.', 'fout');
    return;
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    laatstePositie = [pos.coords.longitude, pos.coords.latitude];
    klaar();
  }, (fout) => {
    if (!stil) melding(`Locatie niet beschikbaar: ${fout.message}`, 'fout');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}

// ---------------------------------------------------------------------------
// Extra formuliervelden (per project in te stellen)
// ---------------------------------------------------------------------------
function extraInvoerHtml(d, waarde, fotos = []) {
  const id = `x-${d.id}`;
  const attr = `data-extra="${esc(d.id)}"`;
  switch (d.type) {
    case 'getal':
      return `<div class="eenheid"><input id="${id}" ${attr} type="number" step="any" inputmode="decimal"
        ${d.min !== '' && d.min != null ? `min="${esc(d.min)}"` : ''} ${d.max !== '' && d.max != null ? `max="${esc(d.max)}"` : ''}
        value="${esc(waarde ?? '')}">${d.eenheid ? `<span>${esc(d.eenheid)}</span>` : ''}</div>`;
    case 'keuze':
      return `<select id="${id}" ${attr}><option value="">– kies –</option>${(d.opties ?? []).map((o) => optie(o, o, waarde)).join('')}</select>`;
    case 'janee':
      return `<div class="segment" role="radiogroup" aria-label="${esc(d.label)}">
        <label><input type="radio" name="${id}" value="ja" ${attr} ${waarde === true ? 'checked' : ''}><span>Ja</span></label>
        <label><input type="radio" name="${id}" value="nee" ${attr} ${waarde === false ? 'checked' : ''}><span>Nee</span></label></div>`;
    case 'datum':
      return `<input id="${id}" ${attr} type="date" value="${esc(waarde ?? '')}">`;
    case 'tijd':
      return `<input id="${id}" ${attr} type="time" value="${esc(waarde ?? '')}">`;
    case 'checklist':
      return `<div class="vinklijst">${(d.opties ?? []).map((o) => `
        <label class="vink"><input type="checkbox" ${attr} value="${esc(o)}" ${(waarde ?? []).includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
    case 'foto':
      return `<div class="fotos">${fotos.map((f, n) => `<div class="foto"><img src="${esc(f.data)}" alt="Foto ${n + 1}" data-lichtbak>
        <button type="button" data-extra-foto-weg="${esc(d.id)}:${n}" aria-label="Foto verwijderen">×</button></div>`).join('')}
        <label class="knop fotoknop">📷 Foto<input type="file" accept="image/*" capture="environment" multiple data-extra-foto="${esc(d.id)}"></label></div>`;
    default:
      return `<input id="${id}" ${attr} type="text" maxlength="500" value="${esc(waarde ?? '')}">`;
  }
}

function extraVeldenHtml(defs, extra, extraFotos) {
  return `<div class="velden">${defs.map((d) => {
    const breed = ['tekst', 'checklist', 'foto'].includes(d.type) ? ' breed' : '';
    const hulp = d.hulptekst || (d.type === 'checklist' && d.verplicht ? 'Alle punten moeten worden afgevinkt.' : '');
    return `<div class="veld${breed}" data-extraveld="${esc(d.id)}">
      <label for="x-${esc(d.id)}" ${d.verplicht ? 'class="vereist"' : ''}>${esc(d.label)}</label>
      ${extraInvoerHtml(d, extra[d.id], extraFotos[d.id])}${hulp ? `<small>${esc(hulp)}</small>` : ''}</div>`;
  }).join('')}</div>`;
}

/**
 * Beheert het blok "Extra gegevens" in een formulier.
 * @param {HTMLElement} blok      sectie die verborgen wordt als er geen velden zijn
 * @param {() => object[]} defsNu functie die de nu zichtbare velddefinities geeft
 * @param {object} record         bestaande registratie (met extra / extraFotoIds)
 */
async function extraBlok(blok, defsNu, record) {
  const extra = { ...(record?.extra ?? {}) };
  const alleDefs = defsNu.alle ?? [];
  const extraFotos = {};
  for (const d of alleDefs.filter((x) => x.type === 'foto')) extraFotos[d.id] = await laadFotos(extra[d.id] ?? []);
  const origineleFotoIds = new Set(record?.extraFotoIds ?? []);
  const doel = blok.querySelector('.extra-velden');

  const teken = () => {
    const defs = defsNu();
    blok.hidden = !defs.length;
    doel.innerHTML = defs.length ? extraVeldenHtml(defs, extra, extraFotos) : '';
  };
  blok.addEventListener('input', (e) => {
    const el = e.target;
    const id = el.dataset?.extra;
    if (!id) return;
    formulierGewijzigd = true;
    if (el.type === 'radio') extra[id] = el.value === 'ja';
    else if (el.type === 'checkbox') {
      extra[id] = [...blok.querySelectorAll(`input[type=checkbox][data-extra="${CSS.escape(id)}"]:checked`)].map((c) => c.value);
    } else extra[id] = el.value;
  });
  blok.addEventListener('change', async (e) => {
    const id = e.target.dataset?.extraFoto;
    if (!id || !e.target.files?.length) return;
    try {
      for (const f of [...e.target.files]) (extraFotos[id] ??= []).push({ id: nieuwId(), data: await verkleinFoto(f) });
      formulierGewijzigd = true;
    } catch (fout) { melding(fout.message, 'fout'); }
    teken();
  });
  blok.addEventListener('click', (e) => {
    const weg = e.target.closest('[data-extra-foto-weg]');
    if (!weg) return;
    const [id, n] = weg.dataset.extraFotoWeg.split(':');
    extraFotos[id].splice(Number(n), 1);
    formulierGewijzigd = true;
    teken();
  });
  teken();

  return {
    teken,
    /** Antwoorden van de zichtbare velden (+ bewaarde antwoorden van verwijderde velden). */
    waarden() {
      const zichtbaar = defsNu();
      const bekend = new Set(alleDefs.map((d) => d.id));
      const uit = {};
      for (const [k, v] of Object.entries(extra)) if (!bekend.has(k)) uit[k] = v; // historie bewaren
      for (const d of zichtbaar) {
        if (d.type === 'foto') uit[d.id] = (extraFotos[d.id] ?? []).map((f) => f.id);
        else if (d.type === 'getal') uit[d.id] = extra[d.id] === '' || extra[d.id] == null ? '' : Number(extra[d.id]);
        else if (extra[d.id] !== undefined) uit[d.id] = extra[d.id];
      }
      return uit;
    },
    labels() {
      return Object.fromEntries(alleDefs.map((d) => [d.id, d.label]));
    },
    fouten() {
      return velden.controleer(defsNu(), this.waarden());
    },
    /** Slaat nieuwe foto's op en ruimt verwijderde op; geeft alle foto-id's terug. */
    async bewaarFotos(meta) {
      const zichtbaar = new Set(defsNu().filter((d) => d.type === 'foto').map((d) => d.id));
      const huidige = Object.entries(extraFotos).filter(([id]) => zichtbaar.has(id)).flatMap(([, l]) => l);
      await db.bewaarVeel('fotos', huidige.filter((f) => !origineleFotoIds.has(f.id)).map((f) => ({ id: f.id, data: f.data, ...meta })));
      const blijven = new Set(huidige.map((f) => f.id));
      for (const fid of origineleFotoIds) if (!blijven.has(fid)) await db.verwijder('fotos', fid);
      return [...blijven];
    },
  };
}

/** Velddefinities van het actieve project, als functie die de huidige soort leest. */
async function projectVelden(formulier, soortFn) {
  const p = await actiefProject();
  const alle = (p?.velden ?? []).filter((d) => d.formulier === formulier);
  const fn = () => velden.zichtbareVelden(alle, formulier, soortFn());
  fn.alle = alle;
  return fn;
}

function extraWeergave(record, defs) {
  const extra = record?.extra ?? {};
  const labels = record?.extraLabels ?? {};
  const bekend = new Map((defs ?? []).map((d) => [d.id, d]));
  const regels = Object.keys(extra).map((id) => {
    const d = bekend.get(id) ?? { id, label: labels[id] ?? 'Veld', type: Array.isArray(extra[id]) ? 'checklist' : 'tekst' };
    return { d, v: extra[id] };
  }).filter(({ d, v }) => d.type === 'janee' ? v === true || v === false : !velden.isLeeg({ ...d, type: 'lijst' }, v));
  return regels;
}

async function extraDetailHtml(record, formulier) {
  const p = await actiefProject();
  const regels = extraWeergave(record, (p?.velden ?? []).filter((d) => d.formulier === formulier));
  if (!regels.length) return '';
  const tekst = regels.filter(({ d }) => d.type !== 'foto');
  const fotoRegels = regels.filter(({ d }) => d.type === 'foto');
  const fotoBlokken = await Promise.all(fotoRegels.map(async ({ d, v }) => `<h3>${esc(d.label)}</h3>${await fotosHtml(v)}`));
  return `<section class="kaart"><h2>Extra gegevens</h2>
    ${tekst.length ? `<dl class="gegevens">${tekst.map(({ d, v }) => `<dt>${esc(d.label)}</dt><dd>${esc(velden.toonWaarde(d, v, datumNL))}</dd>`).join('')}</dl>` : ''}
    ${fotoBlokken.join('')}</section>`;
}

// ---------------------------------------------------------------------------
// Formuliervelden instellen (beheerder, per project)
// ---------------------------------------------------------------------------
const SOORTEN_PER_FORMULIER = {
  werk: () => WERKSOORTEN,
  inspectie: () => INSPECTIESOORTEN,
  taak: () => ['inspectie', 'werk'],
};
const SOORT_LABEL = { inspectie: 'Schouw / inspectie', werk: 'Werkzaamheid' };

async function formulierveldenPagina(id, q) {
  const project = await db.haal('projecten', id);
  if (!project) {
    app.innerHTML = leegKaart('Project niet gevonden.', '<a class="knop" href="#/projecten">Terug</a>');
    return;
  }
  if (!magBeheren()) {
    app.innerHTML = leegKaart('Alleen beheerders kunnen formuliervelden instellen.', '<a class="knop" href="#/projecten">Terug</a>');
    return;
  }
  const formulier = velden.FORMULIEREN[q.get('formulier')] ? q.get('formulier') : 'werk';
  let lijst = (project.velden ?? []).map((d) => ({ ...d }));
  let bewerk = null; // veld dat open staat in de editor

  const opslaan = async () => {
    const nu = new Date().toISOString();
    project.velden = lijst.map(velden.normaliseer);
    project.gewijzigd = nu;
    await db.bewaar('projecten', project);
  };

  const teken = () => {
    const eigen = lijst.filter((d) => d.formulier === formulier);
    app.innerHTML = `
      <div class="paginakop"><div><p><a href="#/projecten">← Projecten</a></p>
        <h1>Formuliervelden</h1><p>${esc(project.naam)} · extra regels die bij elke registratie worden ingevuld, op telefoon en pc.</p></div></div>
      <div class="tabs" role="tablist">${Object.entries(velden.FORMULIEREN).map(([k, v]) => `
        <a role="tab" class="tab ${k === formulier ? 'actief' : ''}" href="#/projecten/${esc(id)}/velden?formulier=${k}"
          aria-selected="${k === formulier}">${v} <span class="teller">${lijst.filter((d) => d.formulier === k).length}</span></a>`).join('')}</div>
      <div class="veldenindeling">
        <section class="kaart">
          <div class="paginakop" style="margin-bottom:.5rem"><h2 style="margin:0">${velden.FORMULIEREN[formulier]}</h2>
            <button class="knop primair" id="nieuw" type="button">+ Veld toevoegen</button></div>
          <p><small>Standaardvelden zoals datum, ${formulier === 'werk' ? 'soort, uren en uitvoerder' : formulier === 'inspectie' ? 'soort, inspecteur en gebreken' : 'titel, prioriteit en deadline'} staan er altijd al in.</small></p>
          ${eigen.length ? `<ol class="veldlijst">${eigen.map((d, i) => `
            <li class="${bewerk?.id === d.id ? 'actief' : ''}">
              <div><strong>${esc(d.label || '(zonder naam)')}</strong>
                <small>${velden.VELDTYPEN[d.type]}${d.type === 'getal' && d.eenheid ? ` (${esc(d.eenheid)})` : ''}${d.verplicht ? ' · verplicht' : ''}
                ${d.alleenBij?.length ? ` · alleen bij ${d.alleenBij.map((s) => esc(SOORT_LABEL[s] ?? s)).join(', ')}` : ''}</small></div>
              <div class="knoppen" style="flex-wrap:nowrap">
                <button class="knop klein" data-omhoog="${esc(d.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Omhoog">↑</button>
                <button class="knop klein" data-omlaag="${esc(d.id)}" ${i === eigen.length - 1 ? 'disabled' : ''} aria-label="Omlaag">↓</button>
                <button class="knop klein" data-bewerk="${esc(d.id)}">Bewerken</button>
                <button class="knop klein gevaar" data-weg="${esc(d.id)}" aria-label="Verwijderen">🗑</button>
              </div></li>`).join('')}</ol>` : '<p class="leeg">Nog geen extra velden voor dit formulier.</p>'}
        </section>
        <section class="kaart" id="editor" ${bewerk ? '' : 'hidden'}></section>
      </div>`;

    app.querySelector('#nieuw').onclick = () => {
      bewerk = { id: nieuwId(), formulier, label: '', type: 'tekst', verplicht: false, alleenBij: [], opties: [], eenheid: '', min: '', max: '', hulptekst: '', nieuw: true };
      teken();
    };
    app.querySelectorAll('[data-bewerk]').forEach((k) => { k.onclick = () => { bewerk = { ...lijst.find((d) => d.id === k.dataset.bewerk) }; teken(); }; });
    app.querySelectorAll('[data-weg]').forEach((k) => {
      k.onclick = async () => {
        const d = lijst.find((x) => x.id === k.dataset.weg);
        if (!confirm(`Veld "${d.label}" verwijderen? Al ingevulde antwoorden blijven bij de registraties bewaard.`)) return;
        lijst = lijst.filter((x) => x.id !== d.id);
        if (bewerk?.id === d.id) bewerk = null;
        await opslaan();
        teken();
      };
    });
    const verplaats = (vid, richting) => {
      const eigenIds = lijst.filter((d) => d.formulier === formulier).map((d) => d.id);
      const i = eigenIds.indexOf(vid);
      const j = i + richting;
      if (j < 0 || j >= eigenIds.length) return;
      const a = lijst.findIndex((d) => d.id === eigenIds[i]);
      const b = lijst.findIndex((d) => d.id === eigenIds[j]);
      [lijst[a], lijst[b]] = [lijst[b], lijst[a]];
    };
    app.querySelectorAll('[data-omhoog]').forEach((k) => { k.onclick = async () => { verplaats(k.dataset.omhoog, -1); await opslaan(); teken(); }; });
    app.querySelectorAll('[data-omlaag]').forEach((k) => { k.onclick = async () => { verplaats(k.dataset.omlaag, 1); await opslaan(); teken(); }; });
    if (bewerk) tekenEditor();
  };

  const tekenEditor = () => {
    const el = app.querySelector('#editor');
    const d = bewerk;
    formulierGewijzigd = true; // niet opnieuw opbouwen terwijl een veld open staat
    const soorten = SOORTEN_PER_FORMULIER[formulier]();
    el.innerHTML = `
      <h2>${d.nieuw ? 'Nieuw veld' : 'Veld bewerken'}</h2>
      <form id="veldform" novalidate>
        <div class="velden">
          <div class="veld breed"><label for="v-label" class="vereist">Naam van het veld</label>
            <input id="v-label" name="label" maxlength="80" value="${esc(d.label)}" placeholder="bijv. Gemaaide oppervlakte"></div>
          <div class="veld"><label for="v-type">Type</label><select id="v-type" name="type">
            ${Object.entries(velden.VELDTYPEN).map(([k, v]) => optie(k, v, d.type)).join('')}</select></div>
          <div class="veld" style="justify-content:flex-end"><label class="vink"><input type="checkbox" name="verplicht" ${d.verplicht ? 'checked' : ''}>
            <span><strong>Verplicht</strong><small>Nodig om op te slaan of af te ronden</small></span></label></div>
          ${d.type === 'getal' ? `
            <div class="veld"><label for="v-eenheid">Eenheid</label><input id="v-eenheid" name="eenheid" maxlength="12" value="${esc(d.eenheid)}" placeholder="m², st., uur"></div>
            <div class="veld"><label for="v-min">Minimum</label><input id="v-min" name="min" type="number" step="any" value="${esc(d.min)}"></div>
            <div class="veld"><label for="v-max">Maximum</label><input id="v-max" name="max" type="number" step="any" value="${esc(d.max)}"></div>` : ''}
          ${d.type === 'keuze' || d.type === 'checklist' ? `
            <div class="veld breed"><label for="v-opties" class="vereist">${d.type === 'keuze' ? 'Keuzes' : 'Af te vinken punten'} (één per regel)</label>
              <textarea id="v-opties" name="opties" placeholder="${d.type === 'keuze' ? 'Groenafval\nRestafval\nGrond' : 'Afzetting geplaatst\nWerkplek opgeruimd'}">${esc((d.opties ?? []).join('\n'))}</textarea></div>` : ''}
          <div class="veld breed"><label for="v-hulp">Toelichting voor de invuller</label>
            <input id="v-hulp" name="hulptekst" maxlength="200" value="${esc(d.hulptekst)}" placeholder="optioneel"></div>
          <div class="veld breed"><label>Alleen tonen bij ${formulier === 'taak' ? 'soort taak' : 'soort'}</label>
            <div class="chips">${soorten.map((s) => `<label class="chip"><input type="checkbox" name="alleenBij" value="${esc(s)}" ${d.alleenBij?.includes(s) ? 'checked' : ''}><span>${esc(SOORT_LABEL[s] ?? s)}</span></label>`).join('')}</div>
            <small>Niets aangevinkt = altijd tonen.</small></div>
        </div>
        <h3 style="margin-top:1rem">Voorbeeld</h3>
        <div class="voorbeeld">${d.label ? extraVeldenHtml([velden.normaliseer(d)], {}, {}) : '<p class="leeg">Geef het veld een naam.</p>'}</div>
        <div class="formvoet">
          <button class="knop" type="button" id="annuleer">Annuleren</button>
          <button class="knop primair" type="submit">${d.nieuw ? 'Toevoegen' : 'Opslaan'}</button>
        </div>
      </form>`;
    const form = el.querySelector('#veldform');
    const lees = () => {
      const fd = new FormData(form);
      Object.assign(bewerk, {
        label: String(fd.get('label') ?? ''), type: String(fd.get('type')), verplicht: fd.get('verplicht') === 'on',
        hulptekst: String(fd.get('hulptekst') ?? ''), alleenBij: fd.getAll('alleenBij').map(String),
      });
      if (fd.has('eenheid')) Object.assign(bewerk, { eenheid: String(fd.get('eenheid')), min: String(fd.get('min')), max: String(fd.get('max')) });
      if (fd.has('opties')) bewerk.opties = String(fd.get('opties')).split('\n');
    };
    form.addEventListener('change', (e) => {
      lees();
      if (e.target.name === 'type') tekenEditor();
      else el.querySelector('.voorbeeld').innerHTML = bewerk.label ? extraVeldenHtml([velden.normaliseer(bewerk)], {}, {}) : '';
    });
    form.addEventListener('input', (e) => {
      if (e.target.name !== 'label' && e.target.name !== 'opties' && e.target.name !== 'eenheid' && e.target.name !== 'hulptekst') return;
      lees();
      el.querySelector('.voorbeeld').innerHTML = bewerk.label ? extraVeldenHtml([velden.normaliseer(bewerk)], {}, {}) : '';
    });
    el.querySelector('#annuleer').onclick = () => { bewerk = null; formulierGewijzigd = false; teken(); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      lees();
      const n = velden.normaliseer(bewerk);
      if (!n.label) return melding('Geef het veld een naam.', 'fout');
      if ((n.type === 'keuze' || n.type === 'checklist') && !n.opties.length) return melding('Vul minstens één keuze of punt in.', 'fout');
      if (n.type === 'getal' && n.min !== '' && n.max !== '' && Number(n.min) > Number(n.max)) return melding('Minimum is groter dan maximum.', 'fout');
      const i = lijst.findIndex((x) => x.id === n.id);
      if (i >= 0) lijst[i] = n; else lijst.push(n);
      bewerk = null;
      formulierGewijzigd = false;
      await opslaan();
      melding('Veld opgeslagen');
      teken();
    };
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  teken();
}

// ---------------------------------------------------------------------------
// Werkpakketten
// ---------------------------------------------------------------------------
const PAKKET_KLEUR = { open: '#e07b00', gedaan: '#1a7f37', overgeslagen: '#8a96a3' };

async function pakketGegevens() {
  const [pakketten, objecten, werkzaamheden, inspecties, overgeslagen] = await Promise.all([
    inProject('werkpakketten'), inProject('objecten'), inProject('werkzaamheden'), inProject('inspecties'), inProject('overgeslagen'),
  ]);
  const objectIds = objecten.map((o) => o.id);
  const volgorde = { actief: 0, gepland: 1, afgerond: 2 };
  for (const p of pakketten) p.status = pakketStatus(p);
  pakketten.sort((a, b) => (volgorde[a.status] ?? 3) - (volgorde[b.status] ?? 3) || String(a.naam).localeCompare(String(b.naam), 'nl', { numeric: true }));
  // Per ronde een 'weergave' met eigen voortgang; per pakket het totaal over de rondes.
  const views = new Map();
  const rondeVoortgang = new Map();
  const voortgangen = new Map();
  for (const p of pakketten) {
    const lijst = rondesVan(p).map((r) => {
      const v = rondeView(p, r);
      const sleutel = `${p.id}:${r.id}`;
      views.set(sleutel, v);
      const vg = pakketVoortgang(v, { werkzaamheden, inspecties, overgeslagen, objectIds });
      rondeVoortgang.set(sleutel, vg);
      return vg;
    });
    voortgangen.set(p.id, totaalVoortgang(lijst));
  }
  return { pakketten, objecten, objectMap: new Map(objecten.map((o) => [o.id, o])), werkzaamheden, inspecties, overgeslagen, voortgangen, views, rondeVoortgang };
}

/** Actieve rondes voor de ingelogde gebruiker, met hun open objecten (voor 'Logisch nu'). */
async function openPakketObjecten() {
  const { pakketten, views, rondeVoortgang } = await pakketGegevens();
  const ik = sync.sessie()?.gebruiker?.email ?? '';
  const uit = [];
  for (const p of pakketten.filter((x) => pakketVoorMij(x, ik))) {
    for (const r of rondesVan(p).filter((x) => x.status === 'actief')) {
      uit.push({ pakket: views.get(`${p.id}:${r.id}`), open: rondeVoortgang.get(`${p.id}:${r.id}`).open });
    }
  }
  return uit;
}

/** Alle actieve rondes (weergave + open objecten), voor taken en de startpagina. */
function actieveRondes(g) {
  const uit = [];
  for (const p of g.pakketten) {
    for (const r of rondesVan(p).filter((x) => x.status === 'actief')) {
      const sleutel = `${p.id}:${r.id}`;
      uit.push({ pakket: g.views.get(sleutel), open: g.rondeVoortgang.get(sleutel).open, voortgang: g.rondeVoortgang.get(sleutel) });
    }
  }
  return uit;
}

const rondeParam = (v) => (v?.rondeId && v.rondeId !== STANDAARD_RONDE ? v.rondeId : '');
const pakketPagina = (v, mobiel) => {
  const r = rondeParam(v);
  return `${mobiel ? '#/m/pakket' : '#/werkpakketten'}/${v.id}${r ? `?ronde=${encodeURIComponent(r)}` : ''}`;
};

/** Pakketweergave (met ronde) uit de database, voor formulieren die vanuit een pakket worden geopend. */
async function laadPakketView(pakketId, rondeId) {
  const p = pakketId ? await db.haal('werkpakketten', pakketId) : null;
  return p ? rondeView(p, rondeVanId(p, rondeId)) : null;
}

function voortgangBalk(v, { groot = false } = {}) {
  const pct = (n) => (v.totaal ? (n / v.totaal) * 100 : 0);
  return `<div class="voortgang${groot ? ' groot' : ''}">
    <div class="balkje" role="progressbar" aria-valuemin="0" aria-valuemax="${v.totaal}" aria-valuenow="${v.gedaan.size}"
      aria-label="${v.gedaan.size} van ${v.totaal} gedaan">
      <i style="width:${pct(v.gedaan.size)}%;background:${PAKKET_KLEUR.gedaan}"></i><i style="width:${pct(v.overgeslagen.size)}%;background:${PAKKET_KLEUR.overgeslagen}"></i></div>
    <span><strong>${v.gedaan.size}/${v.totaal}</strong> gedaan${v.overgeslagen.size ? ` · ${v.overgeslagen.size} overgeslagen` : ''}</span></div>`;
}

function pakketStatusLabel(status) {
  const k = { actief: 'binnenkort', afgerond: 'afgerond', gepland: '' }[status] ?? '';
  return `<span class="label-status ${k}">${PAKKETSTATUS[status] ?? 'Gepland'}</span>`;
}

function pakketSoortTekst(p) {
  if (p.soort === 'inspectie') return `${p.inspectiesoort === BV.BVC_SOORT ? '🌳' : '🔍'} ${esc(p.inspectiesoort || 'Schouw / inspectie')}`;
  return `🛠️ ${esc(p.werksoort || 'Werkzaamheid')}`;
}

function pakketRondesTekst(p) {
  const rondes = rondesVan(p);
  if (!p.rondes?.length) return pakketSoortTekst(rondes[0]);
  const actief = rondes.filter((r) => r.status === 'actief');
  return `${rondes.length} ronde${rondes.length === 1 ? '' : 's'}${actief.length ? ` · actief: ${actief.map((r) => esc(`R${r.nummer} ${r.naam}`)).join(', ')}` : ''}`;
}

function periodeTekst(p) {
  if (!p.start && !p.eind) return '';
  return `${p.start ? datumNL(p.start) : '…'} – ${p.eind ? datumNL(p.eind) : '…'}`;
}

function pakketHref(p, objectId, mobiel) {
  const q = new URLSearchParams({ object: objectId, pakket: p.id });
  if (rondeParam(p)) q.set('ronde', rondeParam(p));
  if (p.soort === 'inspectie' && p.inspectiesoort === BV.BVC_SOORT) return `${mobiel ? '#/m/bvc' : '#/bvc'}/nieuw?${q}`;
  if (p.soort === 'inspectie') return `${mobiel ? '#/m/inspectie' : '#/inspecties'}/nieuw?${q}`;
  return `${mobiel ? '#/m/werk' : '#/werkzaamheden'}/nieuw?${q}`;
}

// --- Kaart met de objecten van een pakket ------------------------------------
async function tekenPakketKaart(el, { pakket, objecten, statusVan, positie = null, mobiel = false }) {
  let L;
  try {
    L = await laadLeaflet();
  } catch (fout) {
    if (el.isConnected) el.innerHTML = `<p class="leeg">${esc(fout.message)}</p>`;
    return null;
  }
  if (!el.isConnected) return null;
  el.innerHTML = '';
  // Zonder animaties: die lopen anders door nadat je de pagina al hebt verlaten.
  const map = L.map(el, { preferCanvas: true, zoomControl: !mobiel, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
  voegAchtergrondToe(L, map);
  const metGeo = objecten.filter((o) => objectGeometrie(o));
  const fc = { type: 'FeatureCollection', features: metGeo.map((o) => ({ type: 'Feature', geometry: objectGeometrie(o), properties: { id: o.id } })) };
  const objectMap = new Map(metGeo.map((o) => [o.id, o]));
  const popup = (o) => {
    const st = statusVan(o.id);
    const knoppen = st === 'open'
      ? `<div class="popupknoppen"><a class="knop klein primair" href="${pakketHref(pakket, o.id, mobiel)}">Uitvoeren</a>
         <button class="knop klein" data-overslaan="${esc(o.id)}">Overslaan</button></div>`
      : `<small>${st === 'gedaan' ? '✓ Gedaan' : '⏭ Overgeslagen'}</small>`;
    return `<strong>${esc(o.code)}</strong> – ${esc(o.naam)}<br>${knoppen}${mobiel ? '' : `<br><a href="#/objecten/${esc(o.id)}">Object openen</a>`}`;
  };
  const laag = L.geoJSON(fc, {
    style: (f) => {
      const k = PAKKET_KLEUR[statusVan(f.properties.id)];
      return { color: k, weight: 3, fillColor: k, fillOpacity: 0.35 };
    },
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 9, color: '#fff', weight: 2, fillColor: PAKKET_KLEUR[statusVan(f.properties.id)], fillOpacity: 1 }),
    onEachFeature: (f, l) => l.bindPopup(() => popup(objectMap.get(f.properties.id))),
  });
  // Eerst het kaartbeeld bepalen, dan pas de vlakken toevoegen (anders kan Leaflet niet clippen).
  const b = laag.getBounds();
  if (b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 18, animate: false });
  else if (positie) map.setView([positie[1], positie[0]], 16, { animate: false });
  else map.setView([52.1, 5.1], 8, { animate: false });
  laag.addTo(map);
  let jij = null;
  // Eigen locatie: alleen de stip verplaatsen, de kaart blijft staan.
  const zetPositie = (pos) => {
    if (!pos) return;
    if (jij) jij.setLatLng([pos[1], pos[0]]);
    else jij = L.circleMarker([pos[1], pos[0]], { radius: 8, color: '#fff', weight: 3, fillColor: '#1f6feb', fillOpacity: 1 }).addTo(map).bindTooltip('Jij');
  };
  zetPositie(positie);
  return { map, zetPositie };
}

// --- Overslaan ----------------------------------------------------------------
function overslaanDialoog(object) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialoog';
    d.innerHTML = `
      <form method="dialog" novalidate>
        <h2>Object overslaan</h2>
        <p>${objectNaam(object)}</p>
        <div class="veld"><label for="d-reden" class="vereist">Reden</label>
          <select id="d-reden" name="reden" required><option value="">– kies –</option>${OVERSLAAN_REDENEN.map((r) => optie(r, r)).join('')}</select></div>
        <div class="veld" style="margin-top:.75rem"><label for="d-toelichting">Toelichting</label>
          <textarea id="d-toelichting" name="toelichting" maxlength="500" style="min-height:70px"></textarea></div>
        <div class="formvoet"><button class="knop" value="annuleer" type="button" id="d-annuleer">Annuleren</button>
          <button class="knop primair" value="ok" type="submit">Overslaan</button></div>
      </form>`;
    document.body.append(d);
    const klaar = (waarde) => { d.close(); d.remove(); resolve(waarde); };
    d.querySelector('#d-annuleer').onclick = () => klaar(null);
    d.addEventListener('cancel', (e) => { e.preventDefault(); klaar(null); });
    d.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const reden = d.querySelector('#d-reden').value;
      const toelichting = d.querySelector('#d-toelichting').value.trim();
      if (!reden) return melding('Kies een reden.', 'fout');
      if (reden === 'Anders' && !toelichting) return melding('Licht de reden toe.', 'fout');
      klaar({ reden, toelichting });
    };
    d.showModal();
  });
}

async function slaObjectOver(pakket, object) {
  const keuze = await overslaanDialoog(object);
  if (!keuze) return false;
  const nu = new Date().toISOString();
  await db.bewaar('overgeslagen', {
    id: overslaanId(pakket.id, object.id, pakket.rondeId), projectId: pakket.projectId, pakketId: pakket.id, rondeId: pakket.rondeId ?? '', objectId: object.id,
    ...keuze, door: sync.sessie()?.gebruiker?.email || instelling.lees('inspecteur') || '', op: vandaag(), gewijzigd: nu,
  });
  melding(`${object.code} overgeslagen`);
  return true;
}

// --- Overzicht (pc) -----------------------------------------------------------
async function werkpakkettenLijst() {
  const { pakketten, voortgangen } = await pakketGegevens();
  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Werkpakketten</h1><p>Werkpakket → rondes (taken) → objecten, met voortgang per ronde en per object.</p></div>
      ${magBeheren() ? `<div class="knoppen">
        <button class="knop" id="xls-sjabloon" title="Leeg Excel-sjabloon met de keuzelijsten van dit project">📥 Excel-sjabloon</button>
        <button class="knop" id="xls-export" title="Alle werkpakketten van dit project in het Excel-formaat">📤 Naar Excel</button>
        <label class="knop fotoknop" title="Werkpakketten inladen uit Excel">📂 Excel inladen<input type="file" id="xls-import" accept=".xlsx"></label>
        <a class="knop primair" href="#/werkpakketten/nieuw">+ Nieuw werkpakket</a></div>` : ''}
    </div>
    ${pakketten.length ? `<div class="pakketten">${pakketten.map((p) => `
      <a class="kaart pakket" href="#/werkpakketten/${esc(p.id)}">
        <div class="pakketkop"><strong>${esc(p.naam)}</strong>${pakketStatusLabel(p.status)}</div>
        <small>${p.code ? `${esc(p.code)} · ` : ''}${pakketRondesTekst(p)}</small>
        ${voortgangBalk(voortgangen.get(p.id))}
        ${p.toegewezen?.length ? `<small>👤 ${p.toegewezen.map(esc).join(', ')}</small>` : ''}
      </a>`).join('')}</div>`
    : leegKaart('Nog geen werkpakketten in dit project.', magBeheren() ? '<a class="knop primair" href="#/werkpakketten/nieuw">+ Nieuw werkpakket</a>' : '')}`;
  app.querySelector('#xls-sjabloon')?.addEventListener('click', () => maakPakketExcel({ metGegevens: false }));
  app.querySelector('#xls-export')?.addEventListener('click', () => maakPakketExcel({ metGegevens: true }));
  app.querySelector('#xls-import')?.addEventListener('change', (e) => { if (e.target.files?.[0]) leesPakketExcel(e.target.files[0]); });
}

// --- Samenstellen (pc) --------------------------------------------------------
async function pakketFormulier(id, q = new URLSearchParams()) {
  if (!magBeheren()) {
    app.innerHTML = leegKaart('Alleen beheerders kunnen werkpakketten samenstellen.', '<a class="knop" href="#/werkpakketten">Terug</a>');
    return;
  }
  const { objecten, status } = await laadAlles();
  const [lagen, project] = await Promise.all([inProject('lagen'), actiefProject()]);
  const bron = id ? await db.haal('werkpakketten', id) : (q.get('kopie') ? await db.haal('werkpakketten', q.get('kopie')) : null);
  if (id && !bron) {
    app.innerHTML = leegKaart('Werkpakket niet gevonden.', '<a class="knop" href="#/werkpakketten">Terug</a>');
    return;
  }
  const kopie = !id && bron;
  const p = bron
    ? { ...bron, ...(kopie ? { naam: volgendeRondeNaam(bron.naam), code: '' } : {}) }
    : { naam: '', code: '', toegewezen: [], omschrijving: '', objecten: [] };
  // Rondes (taken): bestaande pakketten zonder rondes krijgen hun ene ronde expliciet.
  const rondes = rondesVan(p).map((r) => ({ ...r, ...(kopie ? { id: nieuwId(), status: 'gepland', start: '', eind: '' } : {}) }));
  if (!bron) Object.assign(rondes[0], { id: nieuwId(), naam: 'Ronde 1', soort: 'werk', werksoort: '', inspectiesoort: 'Schouw', start: vandaag(), status: 'gepland' });
  if (q.get('nieuweRonde') && bron) {
    const laatste = rondes[rondes.length - 1];
    rondes.push({ ...laatste, id: nieuwId(), nummer: (Number(laatste.nummer) || rondes.length) + 1, naam: volgendeRondeNaam(laatste.naam), start: '', eind: '', status: 'gepland' });
  }
  const gekozen = new Set(p.objecten ?? []);
  const leden = project?.leden ?? [];
  const terug = id ? `#/werkpakketten/${esc(id)}` : '#/werkpakketten';

  app.innerHTML = `
    <div class="paginakop"><div><p><a href="${terug}">← Terug</a></p>
      <h1>${id ? 'Werkpakket bewerken' : kopie ? 'Werkpakket herhalen' : 'Nieuw werkpakket'}</h1></div></div>
    <form id="form" novalidate>
      <section class="kaart">
        <h2>Gegevens</h2>
        <div class="velden">
          <div class="veld"><label for="f-code" class="vereist">Pakketcode</label>
            <input id="f-code" name="code" maxlength="40" value="${esc(p.code)}" placeholder="bijv. WP-2027-001">
            <small>Vaste sleutel, ook voor bijwerken via Excel.</small></div>
          <div class="veld breed"><label for="f-naam" class="vereist">Naam</label>
            <input id="f-naam" name="naam" required maxlength="120" value="${esc(p.naam)}" placeholder="bijv. Groenonderhoud Park Zuid 2027"></div>
          <div class="veld breed"><label>Uitvoerders</label>
            ${leden.length ? `<div class="chips">${leden.map((l) => `<label class="chip"><input type="checkbox" name="toegewezen" value="${esc(l)}" ${p.toegewezen?.includes(l) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
            <small>Niets aangevinkt = iedereen in het project.</small>` : '<small>Voeg projectleden toe bij het project om uitvoerders te kunnen kiezen. Nu: iedereen in het project.</small>'}</div>
          <div class="veld breed"><label class="vink"><input type="checkbox" name="vrijgaveVereist" ${p.vrijgaveVereist ? 'checked' : ''}>
            <span><strong>Flora- en fauna-vrijgave vereist</strong><small>Uitvoerders zien per object of er een geldige ecologische vrijgave is.</small></span></label></div>
          <div class="veld breed"><label for="f-omschrijving">Instructie voor de uitvoerder</label>
            <textarea id="f-omschrijving" name="omschrijving" maxlength="2000">${esc(p.omschrijving)}</textarea></div>
        </div>
      </section>
      <section>
        <div class="mtussen"><h2>Rondes / taken</h2><button type="button" class="knop" id="ronde-plus">＋ Ronde</button></div>
        <p class="hulptekst">Een ronde geldt voor alle objecten van het pakket, tenzij er (via Excel) een deelselectie is opgegeven.</p>
        <div id="rondes"></div>
      </section>
      <section class="kaart">
        <div class="paginakop" style="margin-bottom:.5rem"><h2 style="margin:0">Objecten samenstellen</h2>
          <span class="label-status afgerond" id="teller" style="font-size:.95rem"></span></div>
        <div class="filters samensteller">
          <select id="z-laag" aria-label="Laag"><option value="">Alle lagen</option>${lagen.map((l) => optie(l.id, l.naam)).join('')}${optie('-', 'Losse objecten (geen laag)')}</select>
          <select id="z-type" aria-label="Objecttype"><option value="">Alle typen</option>${[...new Set(objecten.map((o) => o.type).filter(Boolean))].sort().map((t) => optie(t, t)).join('')}</select>
          <select id="z-kenmerk" aria-label="Kenmerk"><option value="">Kenmerk…</option></select>
          <select id="z-waarde" aria-label="Waarde" disabled><option value="">Waarde…</option></select>
          <select id="z-conditie" aria-label="Conditie"><option value="">Alle condities</option>
            ${[1, 2, 3, 4, 5, 6].map((s) => optie(s, `${s} · ${CONDITIES[s].label}`)).join('')}${optie('geen', 'Niet geïnspecteerd')}</select>
          <select id="z-planning" aria-label="Planning"><option value="">Alle planningen</option>
            ${Object.entries(PLANNING_TEKST).filter(([k]) => k !== 'onbekend').map(([k, v]) => optie(k, v)).join('')}</select>
          <input type="search" id="z-zoek" placeholder="Zoek code of naam…" aria-label="Zoeken">
          <select id="z-toon" aria-label="Toon">${optie('', 'Toon alle gefilterde')}${optie('in', 'Alleen in pakket')}${optie('uit', 'Alleen niet in pakket')}</select>
        </div>
        <div class="knoppen" style="margin-bottom:.75rem">
          <button type="button" class="knop" id="alles-erin"></button>
          <button type="button" class="knop" id="alles-eruit"></button>
        </div>
        <div class="tabelhouder" style="max-height:480px;overflow:auto;border:1px solid var(--rand);border-radius:8px"><table>
          <thead><tr><th style="width:42px"></th><th>Code</th><th>Naam</th><th class="verberg-mobiel">Type</th><th class="verberg-mobiel">Laag</th><th>Conditie</th></tr></thead>
          <tbody id="z-rijen"></tbody></table></div>
      </section>
      <div class="formvoet kaart">
        <a class="knop" href="${terug}">Annuleren</a>
        <button class="knop primair" type="submit">Opslaan</button>
      </div>
    </form>`;

  const form = app.querySelector('#form');
  const $ = (s) => app.querySelector(s);
  const laagNaam = new Map(lagen.map((l) => [l.id, l.naam]));
  const tekenRondes = () => {
    $('#rondes').innerHTML = rondes.map((r, i) => `
      <div class="gebrek ronde" style="border-left-color:${r.status === 'actief' ? '#e07b00' : r.status === 'afgerond' ? '#1a7f37' : '#9aa5b1'}">
        <div class="gebrek-kop"><h3 style="margin:0">R${r.nummer}</h3>
          ${rondes.length > 1 ? `<button type="button" class="knop klein gevaar" data-ronde-weg="${i}" aria-label="Ronde verwijderen">🗑</button>` : ''}</div>
        <div class="velden">
          <div class="veld breed"><label class="vereist">Naam</label><input data-r="${i}" data-veld="naam" value="${esc(r.naam)}" maxlength="80" placeholder="bijv. Maaien april"></div>
          <div class="veld"><label>Soort</label><select data-r="${i}" data-veld="soort">${optie('werk', 'Werkzaamheid', r.soort)}${optie('inspectie', 'Schouw / inspectie', r.soort)}</select></div>
          <div class="veld"><label>${r.soort === 'inspectie' ? 'Soort inspectie' : 'Werksoort'}</label>
            ${r.soort === 'inspectie'
    ? `<select data-r="${i}" data-veld="inspectiesoort">${INSPECTIESOORTEN.map((s) => optie(s, s, r.inspectiesoort)).join('')}</select>
              <small>Kies "${BV.BVC_SOORT}" voor een bomeninspectie: uitvoerders openen dan het BVC-formulier volgens het RWS-protocol.</small>`
    : `<select data-r="${i}" data-veld="werksoort"><option value="">– vrij te kiezen –</option>${WERKSOORTEN.map((s) => optie(s, s, r.werksoort)).join('')}</select>`}</div>
          <div class="veld"><label>Start</label><input type="date" data-r="${i}" data-veld="start" value="${esc(r.start)}"></div>
          <div class="veld"><label>Gereed uiterlijk</label><input type="date" data-r="${i}" data-veld="eind" value="${esc(r.eind)}"></div>
          <div class="veld"><label>Status</label><select data-r="${i}" data-veld="status">${Object.entries(PAKKETSTATUS).map(([k, x]) => optie(k, x, r.status)).join('')}</select></div>
          <div class="veld"><label>Objecten</label><div>${r.objectIds?.length
    ? `<span class="label-status binnenkort">Deelselectie: ${r.objectIds.length} objecten</span> <button type="button" class="knop klein" data-ronde-alles="${i}">Alle objecten</button>`
    : '<span class="label-status afgerond">Alle objecten van het pakket</span>'}</div></div>
        </div></div>`).join('');
  };
  tekenRondes();
  $('#rondes').addEventListener('input', (e) => {
    const i = e.target.dataset.r;
    if (i === undefined) return;
    rondes[Number(i)][e.target.dataset.veld] = e.target.value;
    formulierGewijzigd = true;
    if (e.target.dataset.veld === 'soort' || e.target.dataset.veld === 'status') tekenRondes();
  });
  $('#rondes').addEventListener('click', (e) => {
    const w = e.target.closest('[data-ronde-weg]');
    if (w && confirm('Deze ronde verwijderen? Registraties blijven bewaard.')) { rondes.splice(Number(w.dataset.rondeWeg), 1); tekenRondes(); }
    const al = e.target.closest('[data-ronde-alles]');
    if (al) { rondes[Number(al.dataset.rondeAlles)].objectIds = null; tekenRondes(); }
  });
  $('#ronde-plus').onclick = () => {
    const laatste = rondes[rondes.length - 1];
    rondes.push({ ...laatste, id: nieuwId(), nummer: Math.max(...rondes.map((r) => Number(r.nummer) || 0)) + 1, naam: volgendeRondeNaam(laatste.naam), start: '', eind: '', status: 'gepland', objectIds: null });
    tekenRondes();
  };

  const filters = () => ({
    laag: $('#z-laag').value, type: $('#z-type').value, kenmerk: $('#z-kenmerk').value, waarde: $('#z-waarde').value,
    conditie: $('#z-conditie').value, planning: $('#z-planning').value, zoek: $('#z-zoek').value,
  });
  const vulKenmerken = () => {
    const f = filters();
    const basis = filterObjecten(objecten, { laag: f.laag, type: f.type });
    const velden = [...new Set(basis.flatMap((o) => Object.keys(o.kenmerken ?? {})))].sort();
    const huidig = $('#z-kenmerk').value;
    $('#z-kenmerk').innerHTML = `<option value="">Kenmerk…</option>${velden.map((v) => optie(v, v, huidig)).join('')}`;
    vulWaarden();
  };
  const vulWaarden = () => {
    const f = filters();
    const sel = $('#z-waarde');
    if (!f.kenmerk) { sel.disabled = true; sel.innerHTML = '<option value="">Waarde…</option>'; return; }
    const basis = filterObjecten(objecten, { laag: f.laag, type: f.type });
    const waarden = [...new Set(basis.map((o) => o.kenmerken?.[f.kenmerk]).filter((v) => v !== undefined && v !== null && v !== '').map(String))]
      .sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
    sel.disabled = false;
    sel.innerHTML = `<option value="">Alle waarden</option>${waarden.slice(0, 300).map((v) => optie(v, v, f.waarde)).join('')}`;
  };
  let zichtbaar = [];
  const toon = () => {
    const toonKeuze = $('#z-toon').value;
    zichtbaar = filterObjecten(objecten, filters(), { status })
      .filter((o) => (toonKeuze === 'in' ? gekozen.has(o.id) : toonKeuze === 'uit' ? !gekozen.has(o.id) : true));
    const max = 500;
    $('#z-rijen').innerHTML = zichtbaar.length ? zichtbaar.slice(0, max).map((o) => `
      <tr class="${gekozen.has(o.id) ? 'gekozen' : ''}">
        <td><input type="checkbox" data-kies="${esc(o.id)}" ${gekozen.has(o.id) ? 'checked' : ''} aria-label="${esc(o.code)} in pakket"></td>
        <td><strong>${esc(o.code)}</strong></td><td>${esc(o.naam)}</td><td class="verberg-mobiel">${esc(o.type || '–')}</td>
        <td class="verberg-mobiel">${esc(laagNaam.get(o.laagId) ?? '–')}</td><td>${scoreLabel(status.get(o.id)?.conditie)}</td></tr>`).join('')
      + (zichtbaar.length > max ? `<tr><td colspan="6" class="leeg">+ ${zichtbaar.length - max} meer (verfijn het filter om ze te zien; "alle toevoegen" neemt ze wel mee)</td></tr>` : '')
      : '<tr><td colspan="6" class="leeg">Geen objecten met dit filter.</td></tr>';
    const erin = zichtbaar.filter((o) => !gekozen.has(o.id)).length;
    const eruit = zichtbaar.filter((o) => gekozen.has(o.id)).length;
    $('#alles-erin').textContent = `＋ Alle ${erin} gefilterde toevoegen`;
    $('#alles-erin').disabled = !erin;
    $('#alles-eruit').textContent = `− ${eruit} gefilterde verwijderen`;
    $('#alles-eruit').disabled = !eruit;
    $('#teller').textContent = `${gekozen.size} objecten in pakket`;
  };
  ['#z-laag', '#z-type'].forEach((s) => $(s).addEventListener('change', () => { vulKenmerken(); toon(); }));
  $('#z-kenmerk').addEventListener('change', () => { vulWaarden(); toon(); });
  ['#z-waarde', '#z-conditie', '#z-planning', '#z-toon'].forEach((s) => $(s).addEventListener('change', toon));
  $('#z-zoek').addEventListener('input', toon);
  $('#z-rijen').addEventListener('change', (e) => {
    const k = e.target.dataset.kies;
    if (!k) return;
    if (e.target.checked) gekozen.add(k); else gekozen.delete(k);
    e.target.closest('tr').classList.toggle('gekozen', e.target.checked);
    formulierGewijzigd = true;
    $('#teller').textContent = `${gekozen.size} objecten in pakket`;
  });
  $('#alles-erin').onclick = () => { zichtbaar.forEach((o) => gekozen.add(o.id)); formulierGewijzigd = true; toon(); };
  $('#alles-eruit').onclick = () => { zichtbaar.forEach((o) => gekozen.delete(o.id)); formulierGewijzigd = true; toon(); };
  form.addEventListener('input', () => { formulierGewijzigd = true; });
  vulKenmerken();
  toon();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formulierData(form);
    if (!d.naam) return melding('Geef het werkpakket een naam.', 'fout');
    if (!gekozen.size) return melding('Voeg minstens één object toe.', 'fout');
    const code = d.code || await volgendePakketcode();
    const bestaandeCode = (await inProject('werkpakketten')).find((x) => x.code && x.code.toLowerCase() === code.toLowerCase() && x.id !== id);
    if (bestaandeCode) return melding(`Pakketcode ${code} is al in gebruik.`, 'fout');
    for (const r of rondes) {
      if (!String(r.naam ?? '').trim()) return melding(`Geef ronde R${r.nummer} een naam.`, 'fout');
      if (r.start && r.eind && r.eind < r.start) return melding(`Ronde R${r.nummer}: einddatum ligt vóór de start.`, 'fout');
    }
    const nu = new Date().toISOString();
    const opgeslagenRondes = rondes.map((r) => ({
      id: r.id, nummer: Number(r.nummer) || 1, naam: String(r.naam).trim(), soort: r.soort,
      werksoort: r.soort === 'werk' ? r.werksoort : '', inspectiesoort: r.soort === 'inspectie' ? r.inspectiesoort : '',
      start: r.start, eind: r.eind, status: r.status, objectIds: r.objectIds?.length ? r.objectIds : null,
    }));
    const opslaan = {
      ...(id ? bron : {}), id: id ?? nieuwId(), projectId: (id ? bron.projectId : null) ?? projectId(), code, naam: d.naam,
      rondes: opgeslagenRondes, status: pakketStatus({ rondes: opgeslagenRondes }), omschrijving: d.omschrijving,
      toegewezen: [...form.querySelectorAll('input[name=toegewezen]:checked')].map((c) => c.value),
      vrijgaveVereist: form.elements.vrijgaveVereist.checked,
      objecten: objecten.filter((o) => gekozen.has(o.id)).map((o) => o.id), // vaste volgorde (op code)
      aangemaakt: (id ? bron.aangemaakt : null) ?? nu, gewijzigd: nu,
    };
    await db.bewaar('werkpakketten', opslaan);
    formulierGewijzigd = false;
    melding('Werkpakket opgeslagen');
    ga(`#/werkpakketten/${opslaan.id}`);
  };
}

async function volgendePakketcode() {
  const jaar = new Date().getFullYear();
  const nrs = (await inProject('werkpakketten')).map((p) => Number(String(p.code ?? '').match(new RegExp(`^WP-${jaar}-(\\d+)$`))?.[1])).filter(Number.isFinite);
  return `WP-${jaar}-${String((nrs.length ? Math.max(...nrs) : 0) + 1).padStart(3, '0')}`;
}

function volgendeRondeNaam(naam) {
  const m = String(naam).match(/^(.*?)(\d+)(\D*)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}${m[3]}` : `${naam} (herhaling)`;
}

// --- Detail met kaart (pc) ----------------------------------------------------
async function pakketDetail(id, q = new URLSearchParams()) {
  const g = await pakketGegevens();
  const pr = g.pakketten.find((x) => x.id === id);
  if (!pr) {
    app.innerHTML = leegKaart('Werkpakket niet gevonden.', '<a class="knop" href="#/werkpakketten">Terug</a>');
    return;
  }
  const alleRondes = rondesVan(pr);
  const ronde = rondeVanId(pr, q.get('ronde'));
  const p = g.views.get(`${id}:${ronde.id}`);
  const v = g.rondeVoortgang.get(`${id}:${ronde.id}`);
  const totaal = g.voortgangen.get(id);
  const objecten = (p.objecten ?? []).map((oid) => g.objectMap.get(oid)).filter(Boolean);
  const statusVan = (oid) => (v.gedaan.has(oid) ? 'gedaan' : v.overgeslagen.has(oid) ? 'overgeslagen' : 'open');
  const regHref = (r) => (p.soort === 'inspectie' ? `#/inspecties/${esc(r.id)}` : `#/werkzaamheden/${esc(r.id)}`);
  const vrijgavenProject = p.vrijgaveVereist ? await inProject('vrijgaven') : [];
  app.innerHTML = `
    <div class="paginakop">
      <div><p><a href="#/werkpakketten">← Werkpakketten</a></p><h1>${esc(pr.naam)}</h1>
        <p>${pr.code ? `${esc(pr.code)} · ` : ''}${(pr.objecten ?? []).length} objecten · ${pakketStatusLabel(pr.status)}</p></div>
      <div class="knoppen">
        ${magBeheren() ? `<a class="knop" href="#/werkpakketten/${esc(id)}/bewerken">Bewerken</a>
          <a class="knop" href="#/werkpakketten/${esc(id)}/bewerken?nieuweRonde=1">＋ Volgende ronde</a>
          <a class="knop" href="#/werkpakketten/nieuw?kopie=${esc(id)}" title="Kopie van het hele pakket">🔁 Kopiëren</a>` : ''}
        ${pr.vrijgaveVereist ? `<a class="knop" href="#/vrijgaven/nieuw?pakket=${esc(id)}">🌿 Vrijgave</a>` : ''}
        ${magBeheren() ? '<button class="knop gevaar" id="verwijder">Verwijderen</button>' : ''}
      </div>
    </div>
    <section class="kaart">
      <h2 style="margin-bottom:.25rem">Totaal</h2>${voortgangBalk(totaal)}
      ${pr.toegewezen?.length ? `<p style="margin:.5rem 0 0"><small>👤 ${pr.toegewezen.map(esc).join(', ')}</small></p>` : ''}
      ${pr.omschrijving ? `<p style="white-space:pre-wrap;margin:.5rem 0 0">${esc(pr.omschrijving)}</p>` : ''}
      <div class="tabelhouder" style="margin-top:.75rem"><table class="rondetabel">
        <thead><tr><th>Ronde</th><th>Soort</th><th class="verberg-mobiel">Periode</th><th>Status</th><th>Voortgang</th><th></th></tr></thead>
        <tbody>${alleRondes.map((r) => {
    const rv = g.views.get(`${id}:${r.id}`);
    return `<tr class="${r.id === ronde.id ? 'gekozen' : ''}">
          <td><a href="${pakketPagina(rv, false)}"><strong>R${r.nummer}</strong> ${esc(r.naam)}</a>${rv.deelselectie ? ' <small>(deelselectie)</small>' : ''}</td>
          <td>${pakketSoortTekst(rv)}</td><td class="verberg-mobiel">${periodeTekst(rv) || '–'}</td><td>${pakketStatusLabel(r.status)}</td>
          <td style="min-width:160px">${voortgangBalk(g.rondeVoortgang.get(`${id}:${r.id}`))}</td>
          <td>${magBeheren() ? (r.status !== 'actief'
    ? `<button class="knop klein" data-ronde-status="${esc(r.id)}" data-naar="actief">▶ Actief</button>`
    : `<button class="knop klein" data-ronde-status="${esc(r.id)}" data-naar="afgerond">✓ Afronden</button>`) : ''}</td></tr>`;
  }).join('')}</tbody></table></div>
    </section>
    <div class="mtussen"><h2>R${ronde.nummer} ${esc(ronde.naam)} <small style="font-weight:400">· ${pakketSoortTekst(p)}</small></h2>
      <div class="knoppen">${p.soort === 'inspectie' ? '<button class="knop" id="resultaten-xls">📊 Resultaten naar Excel</button>' : ''}<button class="knop" id="export">CSV</button>${p.inspectiesoort === BV.BVC_SOORT && p.soort === 'inspectie' ? '<button class="knop" id="suf">SUF-BVC</button>' : ''}</div></div>
    <section class="kaart">${voortgangBalk(v, { groot: true })}</section>
    ${p.inspectiesoort === BV.BVC_SOORT ? bvcSamenvatting(g.inspecties.filter((i) => i.werkpakketId === p.id && (i.rondeId || STANDAARD_RONDE) === (p.rondeId || STANDAARD_RONDE))) : ''}
    <div class="kaartindeling">
      <div id="pakketkaart" class="kaart"><p class="leeg">Kaart laden…</p></div>
      <aside class="kaart lagenpaneel"><h2>Legenda</h2><div class="legenda">
        <span><i style="background:${PAKKET_KLEUR.open}"></i>Nog te doen (${v.open.length})</span>
        <span><i style="background:${PAKKET_KLEUR.gedaan}"></i>Gedaan (${v.gedaan.size})</span>
        <span><i style="background:${PAKKET_KLEUR.overgeslagen}"></i>Overgeslagen (${v.overgeslagen.size})</span></div></aside>
    </div>
    <section class="kaart" style="padding:0"><div class="tabelhouder"><table>
      <thead><tr><th>Code</th><th>Naam</th><th>Status</th><th>Wanneer / door</th><th class="verberg-mobiel">Toelichting</th><th></th></tr></thead>
      <tbody>${objecten.map((o) => {
    const st = statusVan(o.id);
    const r = v.gedaan.get(o.id);
    const ov = v.overgeslagen.get(o.id);
    return `<tr>
          <td><a href="#/objecten/${esc(o.id)}"><strong>${esc(o.code)}</strong></a></td><td>${esc(o.naam)}${p.vrijgaveVereist ? `<br>${vrijgaveLabel(eco.vrijgaveVoorObject(vrijgavenProject, o.id, vandaag()))}` : ''}</td>
          <td><span class="label-status ${st === 'gedaan' ? 'afgerond' : st === 'open' ? 'binnenkort' : ''}">${{ open: 'Open', gedaan: 'Gedaan', overgeslagen: 'Overgeslagen' }[st]}</span></td>
          <td>${r ? `<a href="${regHref(r)}">${datumNL(r.datum)}</a> · ${esc(r.uitvoerder || r.inspecteur || '')}` : ov ? `${datumNL(ov.op)} · ${esc(ov.door)}` : '–'}</td>
          <td class="verberg-mobiel">${ov ? `${esc(ov.reden)}${ov.toelichting ? `: ${esc(ov.toelichting)}` : ''}` : r ? esc(r.omschrijving || r.samenvatting || '') : ''}</td>
          <td>${st === 'open' ? `<a class="knop klein" href="${pakketHref(p, o.id, false)}">Uitvoeren</a>`
    : ov ? `<button class="knop klein" data-terug="${esc(o.id)}">Terugzetten</button>` : ''}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;

  tekenPakketKaart(app.querySelector('#pakketkaart'), { pakket: p, objecten, statusVan });
  app.querySelector('#pakketkaart').addEventListener('click', async (e) => {
    const over = e.target.closest('[data-overslaan]');
    if (over && await slaObjectOver(p, g.objectMap.get(over.dataset.overslaan))) router();
  });
  app.querySelectorAll('[data-terug]').forEach((k) => {
    k.onclick = async () => {
      await db.verwijder('overgeslagen', overslaanId(p.id, k.dataset.terug, p.rondeId));
      router();
    };
  });
  app.querySelectorAll('[data-ronde-status]').forEach((k) => {
    k.onclick = async () => {
      const rid = k.dataset.rondeStatus;
      const open = g.rondeVoortgang.get(`${id}:${rid}`)?.open.length ?? 0;
      if (k.dataset.naar === 'afgerond' && open && !confirm(`Er staan nog ${open} objecten open in deze ronde. Toch afronden?`)) return;
      const actueel = await db.haal('werkpakketten', id);
      const lijst = rondesVan(actueel).map((r) => (r.id === rid ? { ...r, status: k.dataset.naar } : r));
      await db.bewaar('werkpakketten', { ...actueel, rondes: lijst, status: pakketStatus({ rondes: lijst }), gewijzigd: new Date().toISOString() });
      router();
    };
  });
  app.querySelector('#verwijder')?.addEventListener('click', async () => {
    if (!confirm(`Werkpakket "${pr.naam}" met alle rondes verwijderen? Registraties blijven bewaard.`)) return;
    await db.verwijderVeel('overgeslagen', g.overgeslagen.filter((o) => o.pakketId === pr.id).map((o) => o.id));
    await db.verwijder('werkpakketten', pr.id);
    ga('#/werkpakketten');
  });
  app.querySelector('#suf')?.addEventListener('click', () => exporteerSuf((i) => i.werkpakketId === p.id && (i.rondeId || STANDAARD_RONDE) === (p.rondeId || STANDAARD_RONDE), p.naam));
  app.querySelector('#resultaten-xls')?.addEventListener('click', () => exporteerResultaten({
    lijst: rondeResultaten(p, g), titel: `${pr.code ? `${pr.code} · ` : ''}${pr.naam} – R${ronde.nummer} ${ronde.naam}`,
    onderdeel: `Werkpakket ${pr.code || pr.naam}, ronde R${ronde.nummer} (${pakketSoortTekst(p).replace(/<[^>]+>/g, '')})`,
    bestandsnaam: `resultaten-${pr.code || pr.naam}-R${ronde.nummer}`,
  }));
  app.querySelector('#export').onclick = () => {
    const rijen = [['Code', 'Naam', 'Type', 'Status', 'Datum', 'Door', 'Reden / omschrijving']];
    for (const o of objecten) {
      const r = v.gedaan.get(o.id);
      const ov = v.overgeslagen.get(o.id);
      rijen.push([o.code, o.naam, o.type, r ? 'Gedaan' : ov ? 'Overgeslagen' : 'Open', r?.datum ?? ov?.op ?? '',
        r ? (r.uitvoerder || r.inspecteur || '') : ov?.door ?? '', ov ? [ov.reden, ov.toelichting].filter(Boolean).join(': ') : (r?.omschrijving || r?.samenvatting || '')]);
    }
    download(`werkpakket-${p.naam.replace(/[^\w-]+/g, '_')}-${vandaag()}.csv`, csv(rijen), 'text/csv;charset=utf-8');
  };
}

// --- Resultaten van inspecties naar Excel ---------------------------------------
/** Vraagt of foto's mee moeten en maakt het bestand. lijst: [{ object, inspectie, status, reden }] */
async function exporteerResultaten({ lijst, titel, onderdeel = '', filter = '', bestandsnaam }) {
  if (!lijst.length) return melding('Er is niets om te exporteren.', 'fout');
  const aantalFotos = lijst.reduce((t, { inspectie: i }) => t + (i ? [...(i.fotoIds ?? []), ...(i.gebreken ?? []).flatMap((g) => g.fotoIds ?? []), ...(i.bvc?.gebreken ?? []).flatMap((g) => g.fotoIds ?? [])].length : 0), 0);
  const d = document.createElement('dialog');
  d.className = 'dialoog';
  d.innerHTML = `<form method="dialog">
    <h2>📊 Resultaten naar Excel</h2>
    <p>${esc(titel)}<br><small>${lijst.length} regels · bladen: Overzicht, Resultaten, Gebreken, Maatregelen</small></p>
    <label class="vink"><input type="checkbox" id="x-fotos" ${aantalFotos && aantalFotos <= 400 ? 'checked' : ''} ${aantalFotos ? '' : 'disabled'}>
      <span><strong>Foto's opnemen (${aantalFotos})</strong><small>Extra blad met de foto's per object; het bestand wordt groter.</small></span></label>
    <div class="knoppen" style="margin-top:1rem"><button class="knop" value="nee">Annuleren</button><button class="knop primair" value="ja" id="x-maak">Excel maken</button></div>
  </form>`;
  document.body.append(d);
  d.showModal();
  const keuze = await new Promise((ok) => d.addEventListener('close', () => ok(d.returnValue), { once: true }));
  const metFotos = d.querySelector('#x-fotos').checked;
  d.remove();
  if (keuze !== 'ja') return;
  try {
    melding('Excel-bestand wordt gemaakt…');
    const [ExcelJS, lagen, project] = await Promise.all([PX.laadExcelJS(), inProject('lagen'), actiefProject()]);
    const defs = (project?.velden ?? []).filter((x) => x.formulier === 'inspectie');
    const r = RX.resultaatRijen({
      lijst,
      laagNaam: new Map(lagen.map((l) => [l.id, l.naam])),
      extra: (i) => extraWeergave(i, defs).filter(({ d: x }) => x.type !== 'foto').map(({ d: x, v }) => [x.label, velden.toonWaarde(x, v, datumNL)]),
    });
    let fotoData = null;
    if (metFotos) {
      const ids = [...new Set(r.fotos.map((f) => f.fotoId))];
      fotoData = new Map((await Promise.all(ids.map((fid) => db.haal('fotos', fid)))).filter(Boolean).map((f) => [f.id, f.data]));
    }
    const wb = RX.maakWerkboek(ExcelJS, r, { titel, project: project?.naam ?? '', onderdeel, filter, fotoData });
    download(`${bestandsnaam.replace(/[^\w-]+/g, '_')}-${vandaag()}.xlsx`, await wb.xlsx.writeBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    melding(`Excel gemaakt: ${r.resultaten.length} regels, ${r.gebreken.length} gebreken`);
  } catch (e) {
    console.error(e);
    melding(`Excel maken mislukt: ${e.message}`, 'fout');
  }
}

/** Per object van een ronde: de laatste inspectie uit die ronde (afgerond gaat voor concept). */
function rondeResultaten(view, g) {
  const v = g.rondeVoortgang.get(`${view.id}:${view.rondeId}`);
  const zelfde = (i) => i.werkpakketId === view.id && (i.rondeId || STANDAARD_RONDE) === (view.rondeId || STANDAARD_RONDE);
  const per = new Map();
  for (const i of g.inspecties.filter(zelfde)) {
    const e = per.get(i.objectId);
    const beter = !e || (i.status === 'afgerond' && e.status !== 'afgerond') || (i.status === e.status && String(i.datum) > String(e.datum));
    if (beter) per.set(i.objectId, i);
  }
  return view.objecten.map((oid) => g.objectMap.get(oid)).filter(Boolean).map((object) => {
    const inspectie = per.get(object.id) ?? null;
    const over = v.overgeslagen.get(object.id);
    return { object, inspectie, status: inspectie ? inspectie.status : over ? 'overgeslagen' : 'open', reden: over?.reden ?? '' };
  });
}

// --- Excel: sjabloon, export en inladen ----------------------------------------
async function excelContext() {
  const [project, objecten, lagen, pakketten] = await Promise.all([
    actiefProject(), inProject('objecten'), inProject('lagen'), inProject('werkpakketten'),
  ]);
  return {
    project, objecten, lagen, pakketten, leden: (project?.leden ?? []).map((l) => String(l).toLowerCase()),
    werksoorten: WERKSOORTEN, inspectiesoorten: INSPECTIESOORTEN,
  };
}

async function maakPakketExcel({ metGegevens }) {
  try {
    melding('Excel-bestand wordt gemaakt…');
    const [ExcelJS, ctx] = await Promise.all([PX.laadExcelJS(), excelContext()]);
    let pakketten = [];
    if (metGegevens) {
      // Elk pakket heeft een vaste code nodig om later te kunnen bijwerken.
      for (const p of ctx.pakketten.filter((x) => !x.code)) {
        await db.bewaar('werkpakketten', { ...p, code: await volgendePakketcode(), gewijzigd: new Date().toISOString() });
      }
      pakketten = (await inProject('werkpakketten')).sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
    }
    const wb = PX.maakWerkboek(ExcelJS, { ...ctx, pakketten });
    const buf = await wb.xlsx.writeBuffer();
    const naam = String(ctx.project?.naam ?? 'project').replace(/[^\w-]+/g, '_');
    download(`werkpakketten-${naam}-${metGegevens ? vandaag() : 'sjabloon'}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) {
    console.error(e);
    melding(`Excel maken mislukt: ${e.message}`, 'fout');
  }
}

async function leesPakketExcel(bestand) {
  let raw;
  try {
    const ExcelJS = await PX.laadExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await bestand.arrayBuffer());
    raw = PX.leesWerkboek(wb);
  } catch (e) {
    console.error(e);
    melding('Dit bestand kan niet als Excel (.xlsx) worden gelezen. Gebruik het sjabloon uit de app.', 'fout');
    return;
  }
  const ctx = await excelContext();
  const [werkzaamheden, inspecties, overgeslagen] = await Promise.all([inProject('werkzaamheden'), inProject('inspecties'), inProject('overgeslagen')]);
  // Wat is per pakket en ronde al gedaan of overgeslagen? Dat wordt nooit uit een pakket gehaald.
  const gedaan = new Map();
  const markeer = (pid, rid, oid) => {
    if (!pid) return;
    if (!gedaan.has(pid)) gedaan.set(pid, new Map());
    const m = gedaan.get(pid);
    const r = rid || STANDAARD_RONDE;
    if (!m.has(r)) m.set(r, new Set());
    m.get(r).add(oid);
  };
  for (const r of [...werkzaamheden, ...inspecties]) markeer(r.werkpakketId, r.rondeId, r.objectId);
  for (const o of overgeslagen) markeer(o.pakketId, o.rondeId, o.objectId);
  let verwijder = true;
  const bereken = () => PX.verwerkImport(raw, {
    ...ctx, bestaand: ctx.pakketten, gedaan, verwijderOntbrekend: verwijder, projectId: projectId(), nieuwId,
  });

  const teken = () => {
    const r = bereken();
    const regel = (m) => `<li><strong>${esc(m.blad)}${m.rij ? `, rij ${m.rij}` : ''}:</strong> ${esc(m.tekst)}</li>`;
    app.innerHTML = `
      <div class="paginakop"><div><p><a href="#/werkpakketten" data-xls-terug>← Werkpakketten</a></p>
        <h1>Excel inladen</h1><p>${esc(bestand.name)} · ${raw.pakketten.length} pakketten, ${raw.rondes.length} rondes, ${raw.objecten.length} objectregels</p></div></div>
      ${r.fouten.length ? `<section class="kaart waarschuwing"><h2>❌ ${r.fouten.length} fout${r.fouten.length === 1 ? '' : 'en'} – er is nog niets opgeslagen</h2>
        <p>Pas het Excel-bestand aan en laad het opnieuw in.</p><ul class="importmeldingen">${r.fouten.slice(0, 200).map(regel).join('')}</ul>
        ${r.fouten.length > 200 ? `<p>… en nog ${r.fouten.length - 200} fouten.</p>` : ''}</section>` : ''}
      ${r.waarschuwingen.length ? `<section class="kaart"><h2>⚠ Let op</h2><ul class="importmeldingen">${r.waarschuwingen.map(regel).join('')}</ul></section>` : ''}
      <section class="kaart">
        <h2>Wat er gebeurt</h2>
        <div class="tabelhouder"><table>
          <thead><tr><th>Pakket</th><th>Actie</th><th>Rondes</th><th>Objecten</th><th>Wijziging objecten</th></tr></thead>
          <tbody>${r.pakketten.map((p) => `<tr><td><strong>${esc(p.code)}</strong> ${esc(p.naam)}</td>
            <td>${p.actie === 'nieuw' ? '<span class="label-status binnenkort">Nieuw</span>' : '<span class="label-status afgerond">Bijwerken</span>'}</td>
            <td>${p.samenvatting.rondes}</td><td>${p.samenvatting.objecten}</td>
            <td>${p.actie === 'nieuw' ? '–' : `+${p.samenvatting.bij} / −${p.samenvatting.af}${p.samenvatting.behouden ? ` (${p.samenvatting.behouden} gedaan, behouden)` : ''}`}</td></tr>`).join('')}</tbody>
        </table></div>
        <label class="vink" style="margin-top:.75rem"><input type="checkbox" id="xls-verwijder" ${verwijder ? 'checked' : ''}>
          <span><strong>Objecten die niet meer in het bestand staan uit het pakket halen</strong><small>Al gedane of overgeslagen objecten blijven altijd staan.</small></span></label>
        <div class="knoppen" style="margin-top:1rem">
          <a class="knop" href="#/werkpakketten" data-xls-terug>Annuleren</a>
          <button class="knop primair" id="xls-opslaan" ${r.fouten.length || !r.pakketten.length ? 'disabled' : ''}>Opslaan (${r.pakketten.length} pakketten)</button>
        </div>
      </section>`;
    // De voorvertoning staat op hetzelfde adres als de lijst: terug = opnieuw tekenen.
    app.querySelectorAll('[data-xls-terug]').forEach((x) => { x.onclick = (e) => { e.preventDefault(); ga('#/werkpakketten'); }; });
    app.querySelector('#xls-verwijder').onchange = (e) => { verwijder = e.target.checked; teken(); };
    app.querySelector('#xls-opslaan').onclick = async (e) => {
      e.target.disabled = true;
      const nu = new Date().toISOString();
      const pid = projectId();
      for (const p of r.pakketten) {
        await db.bewaar('werkpakketten', {
          ...p.record, projectId: p.record.projectId ?? pid, status: pakketStatus(p.record), aangemaakt: p.record.aangemaakt ?? nu, gewijzigd: nu,
        });
      }
      melding(`${r.pakketten.length} werkpakket${r.pakketten.length === 1 ? '' : 'ten'} opgeslagen`);
      ga('#/werkpakketten');
      router();
    };
  };
  teken();
}

// --- Telefoon -----------------------------------------------------------------
async function mobielePakketten() {
  const { pakketten, voortgangen } = await pakketGegevens();
  const ik = sync.sessie()?.gebruiker?.email ?? '';
  const mijn = pakketten.filter((p) => p.status !== 'afgerond' && pakketVoorMij(p, ik));
  app.innerHTML = `
    <div class="mkop"><a href="#/" class="mterug" aria-label="Terug">←</a><div><small>Werkpakketten</small><h1>Mijn werkpakketten</h1></div></div>
    ${mijn.length ? `<ul class="mlijst pakketlijst">${mijn.map((p) => mobielPakketRegel(p, voortgangen.get(p.id))).join('')}</ul>`
    : '<p class="mleeg">Er zijn geen werkpakketten voor jou in dit project.</p>'}`;
}

function mobielPakketRegel(p, v) {
  // p is een pakket (met rondes) of een rondeweergave.
  const isRonde = Boolean(p.rondeId);
  const href = isRonde ? pakketPagina(p, true) : `#/m/pakket/${esc(p.id)}`;
  const sub = isRonde ? `${pakketSoortTekst(p)}${p.eind ? ` · uiterlijk ${datumNL(p.eind)}` : ''}` : pakketRondesTekst(p);
  return `<li><a href="${href}">
    <span class="micoon klein">📦</span>
    <span><strong>${esc(p.naam)}</strong><small>${sub}${p.status === 'gepland' ? ' · gepland' : ''}</small>
    ${voortgangBalk(v)}</span></a></li>`;
}

async function mobielPakket(id, q = new URLSearchParams()) {
  const g = await pakketGegevens();
  const pr = g.pakketten.find((x) => x.id === id);
  if (!pr) {
    app.innerHTML = leegKaart('Werkpakket niet gevonden.', '<a class="knop" href="#/m/pakketten">Terug</a>');
    return;
  }
  const lopend = rondesVan(pr).filter((r) => r.status !== 'afgerond');
  const actief = lopend.filter((r) => r.status === 'actief');
  if (q.get('kies') || (!q.get('ronde') && actief.length > 1)) {
    // Meerdere actieve rondes (of zelf gekozen): eerst kiezen welke ronde je gaat doen.
    app.innerHTML = `
      <div class="mkop"><a href="#/m/pakketten" class="mterug" aria-label="Terug">←</a>
        <div><small>Werkpakket${pr.code ? ` · ${esc(pr.code)}` : ''}</small><h1>${esc(pr.naam)}</h1></div></div>
      ${voortgangBalk(g.voortgangen.get(id), { groot: true })}
      <h2 class="mlijstkop">Kies een ronde</h2>
      <ul class="mlijst pakketlijst">${lopend.map((r) => {
    const rv = g.views.get(`${id}:${r.id}`);
    return `<li><a href="${pakketPagina(rv, true)}"><span class="micoon klein">${r.status === 'actief' ? '▶️' : '🗓️'}</span>
          <span><strong>R${r.nummer} ${esc(r.naam)}</strong><small>${pakketSoortTekst(rv)}${periodeTekst(rv) ? ` · ${periodeTekst(rv)}` : ''}${r.status === 'gepland' ? ' · gepland' : ''}</small>
          ${voortgangBalk(g.rondeVoortgang.get(`${id}:${r.id}`))}</span></a></li>`;
  }).join('')}</ul>`;
    return;
  }
  const ronde = rondeVanId(pr, q.get('ronde'));
  const p = g.views.get(`${id}:${ronde.id}`);
  const v = g.rondeVoortgang.get(`${id}:${ronde.id}`);
  const objecten = (p.objecten ?? []).map((oid) => g.objectMap.get(oid)).filter(Boolean);
  const statusVan = (oid) => (v.gedaan.has(oid) ? 'gedaan' : v.overgeslagen.has(oid) ? 'overgeslagen' : 'open');
  const open = objecten.filter((o) => statusVan(o.id) === 'open');

  app.innerHTML = `
    <div class="mkop"><a href="#/m/pakketten" class="mterug" aria-label="Terug">←</a>
      <div style="flex:1;min-width:0"><small>${pakketSoortTekst(p)}${lopend.length > 1 ? ` · <a href="#/m/pakket/${esc(id)}?kies=1">andere ronde</a>` : ''}</small><h1>${esc(p.naam)}</h1></div></div>
    ${voortgangBalk(v, { groot: true })}
    ${p.omschrijving ? `<details class="kaart minstructie"><summary>Instructie</summary><p style="white-space:pre-wrap;margin:.5rem 0 0">${esc(p.omschrijving)}</p></details>` : ''}
    ${open.length ? `<div class="knoppen mpakketknoppen">
      <button class="knop primair" id="volgende" type="button">📍 Volgende dichtbij</button>
      <button class="knop" id="locatie" type="button">↻ Locatie</button></div>` : '<div class="kaart mhier">🎉 Alle objecten zijn gedaan.</div>'}
    ${p.vrijgaveVereist && open.length ? `<a class="knop mgroot" href="#/m/vrijgave/nieuw?pakket=${esc(p.id)}">🌿 Flora & fauna vrijgave voor dit pakket</a>` : ''}
    <div id="pakketkaart" class="mkaart"><p class="leeg">Kaart laden…</p></div>
    <h2 class="mlijstkop">Nog te doen (${open.length})</h2>
    <ul class="mlijst" id="open-lijst"></ul>
    ${v.gedaan.size ? `<details class="mklapper"><summary>Gedaan (${v.gedaan.size})</summary><ul class="mlijst">${objecten.filter((o) => v.gedaan.has(o.id)).map((o) => `
      <li><a href="${p.soort === 'inspectie' ? `#/m/inspectie/${esc(v.gedaan.get(o.id).id)}` : `#/m/werk/${esc(v.gedaan.get(o.id).id)}`}">
        <span class="micoon klein">✅</span><span><strong>${esc(o.code)} – ${esc(o.naam)}</strong><small>${datumNL(v.gedaan.get(o.id).datum)}</small></span></a></li>`).join('')}</ul></details>` : ''}
    ${v.overgeslagen.size ? `<details class="mklapper"><summary>Overgeslagen (${v.overgeslagen.size})</summary><ul class="mlijst">${objecten.filter((o) => v.overgeslagen.has(o.id)).map((o) => `
      <li><div class="mregel"><span class="micoon klein">⏭</span><span><strong>${esc(o.code)} – ${esc(o.naam)}</strong><small>${esc(v.overgeslagen.get(o.id).reden)}</small></span>
        <button class="knop klein" data-terug="${esc(o.id)}">Terugzetten</button></div></li>`).join('')}</ul></details>` : ''}`;

  const vrijgavenProject = p.vrijgaveVereist ? await inProject('vrijgaven') : [];
  const vrijgaveChip = (o) => (p.vrijgaveVereist ? `<small>${vrijgaveLabel(eco.vrijgaveVoorObject(vrijgavenProject, o.id, vandaag()))}</small>` : '');
  const tekenLijst = () => {
    const metAfstand = open.map((o) => ({ o, afstand: laatstePositie ? gis.afstandTot(laatstePositie, objectGeometrie(o)) : null }));
    if (laatstePositie) metAfstand.sort((a, b) => (a.afstand ?? Infinity) - (b.afstand ?? Infinity));
    const el = app.querySelector('#open-lijst');
    if (!el) return [];
    el.innerHTML = metAfstand.length ? metAfstand.map(({ o, afstand }) => `
      <li><div class="mregel">
        <a href="${pakketHref(p, o.id, true)}" class="mregel-link"><span><strong>${esc(o.code)} – ${esc(o.naam)}</strong>
          <small>${esc(o.type || '')}${afstand != null ? ` · ${afstand === 0 ? '📍 hier' : afstandTekst(afstand)}` : ''}</small>${vrijgaveChip(o)}</span></a>
        <button class="knop klein" data-overslaan="${esc(o.id)}" aria-label="${esc(o.code)} overslaan">⏭</button>
        <a class="knop klein primair" href="${pakketHref(p, o.id, true)}">▶</a></div></li>`).join('') : '';
    return metAfstand;
  };
  let gesorteerd = tekenLijst();
  // De kaart wordt één keer getekend; een nieuwe locatie verplaatst alleen de stip.
  const kaart = tekenPakketKaart(app.querySelector('#pakketkaart'), { pakket: p, objecten, statusVan, positie: laatstePositie, mobiel: true });
  const metLocatie = (stil) => bepaalPositie(async () => {
    gesorteerd = tekenLijst();
    (await kaart)?.zetPositie(laatstePositie);
  }, { stil });
  if (!laatstePositie && navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((s) => { if (s.state === 'granted') metLocatie(true); }).catch(() => {});
  }
  app.querySelector('#locatie')?.addEventListener('click', () => metLocatie(false));
  app.querySelector('#volgende')?.addEventListener('click', () => {
    if (!laatstePositie) {
      bepaalPositie(() => { gesorteerd = tekenLijst(); if (gesorteerd[0]) location.hash = pakketHref(p, gesorteerd[0].o.id, true); });
      return;
    }
    if (gesorteerd[0]) location.hash = pakketHref(p, gesorteerd[0].o.id, true);
  });
  const klik = async (e) => {
    const over = e.target.closest('[data-overslaan]');
    if (over && await slaObjectOver(p, g.objectMap.get(over.dataset.overslaan))) router();
    const terug = e.target.closest('[data-terug]');
    if (terug) {
      await db.verwijder('overgeslagen', overslaanId(p.id, terug.dataset.terug, p.rondeId));
      router();
    }
  };
  app.querySelectorAll('#pakketkaart, #open-lijst, .mklapper').forEach((el) => el.addEventListener('click', klik));
}

// ---------------------------------------------------------------------------
// Gedeelde hulpmiddelen voor BVC en flora & fauna
// ---------------------------------------------------------------------------
function bvkLabel(bvk) {
  const k = BV.BVK[bvk];
  return k ? `<span class="score" style="background:${k.kleur}">🌳 ${esc(k.kort)}</span>` : '<span class="label-status">Geen</span>';
}

/** Conditie (NEN 2767) of, bij bomen, de boomveiligheidsklasse. */
function oordeelLabel(s) {
  return s?.bvk ? bvkLabel(s.bvk) : scoreLabel(s?.conditie);
}

function inspectieOordeel(i) {
  if (!i.bvc) return scoreLabel(inspectieScore(i));
  return i.bvc.niet ? '<span class="label-status">Niet aangetroffen</span>' : bvkLabel(i.bvc.bvk);
}

const segment = (naam, waarde, opties, attr = '') => `<div class="segment" role="radiogroup">${opties.map(([k, l]) => `
  <label><input type="radio" name="${esc(naam)}" value="${esc(k)}" ${String(waarde) === String(k) ? 'checked' : ''} ${attr}><span>${esc(l)}</span></label>`).join('')}</div>`;

function fotoRij(fotos, sleutel) {
  return `<div class="fotos">${fotos.map((f, n) => `<div class="foto"><img src="${esc(f.data)}" alt="Foto ${n + 1}" data-lichtbak>
    <button type="button" data-foto-weg="${esc(sleutel)}:${n}" aria-label="Foto verwijderen">×</button></div>`).join('')}
    <label class="knop fotoknop">📷 Foto<input type="file" accept="image/*" capture="environment" multiple data-foto-bij="${esc(sleutel)}"></label></div>`;
}

async function bewaarFotoLijsten(lijsten, origineel, meta) {
  const alle = lijsten.flat();
  await db.bewaarVeel('fotos', alle.filter((f) => !origineel.has(f.id)).map((f) => ({ id: f.id, data: f.data, ...meta })));
  const blijven = new Set(alle.map((f) => f.id));
  for (const fid of origineel) if (!blijven.has(fid)) await db.verwijder('fotos', fid);
}

function nuTijd() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function rdTekst(o) {
  const lat = parseFloat(o?.lat); const lng = parseFloat(o?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '–';
  const [x, y] = BV.wgs84NaarRd(lng, lat);
  return `X ${x.toFixed(2)} · Y ${y.toFixed(2)} (RD)`;
}

// Kenmerken uit een ingeladen GIS-laag gebruiken als voorinvulling van de BVC.
function gisKenmerk(o, re) {
  const k = Object.keys(o?.kenmerken ?? {}).find((x) => re.test(x));
  const v = k ? o.kenmerken[k] : '';
  return v === null || v === undefined ? '' : String(v).trim();
}

function gisBoomNaam(kenmerken) {
  const latijn = gisBoomsoort({ kenmerken });
  return BV.BOOMSOORTEN.find(([w]) => w === latijn)?.[1].replace(/\s*\(.*\)$/, '') ?? latijn;
}

function gisBoomsoort(o) {
  const ruw = gisKenmerk(o, /^(boomsoort|soort|soortnaam|latijnse_?naam|wetenschappelijke_?naam|species|taxon|boomsoort_?lat)$/i);
  if (!ruw) return '';
  const laag = ruw.toLowerCase();
  // Latijnse naam of Nederlandse naam uit de RWS-naamlijst herkennen.
  const hit = BV.BOOMSOORTEN.find(([w, n]) => w.toLowerCase() === laag || n.toLowerCase() === laag || n.toLowerCase().startsWith(`${laag} (`));
  return hit ? hit[0] : ruw;
}

function gisOrk(o) {
  const v = gisKenmerk(o, /^(ork|omgevingsrisico(klasse)?|risicoklasse)$/i).toLowerCase();
  return { geen: 'Geen', laag: 'Laag', midden: 'Midden', hoog: 'Hoog' }[v] ?? '';
}

function soortNaam(latijn) {
  const s = BV.BOOMSOORTEN.find(([w]) => w === latijn);
  return s ? `${s[0]} – ${s[1]}` : (latijn || '–');
}

// ---------------------------------------------------------------------------
// Boomveiligheidscontrole (Boomveiligheidsprotocol Rijkswaterstaat)
// ---------------------------------------------------------------------------
async function bvcFormulier(id, objectId, { mobiel = false, taakId = null, pakketId = null, rondeId = null } = {}) {
  const objecten = await inProject('objecten');
  const bestaand = id ? await db.haal('inspecties', id) : null;
  if (id && !bestaand) {
    app.innerHTML = leegKaart('Controle niet gevonden.', '<a class="knop" href="#/inspecties">Terug</a>');
    return;
  }
  const object = objecten.find((o) => o.id === (bestaand?.objectId ?? objectId));
  if (!object && !mobiel) {
    // Op de pc eerst een boom kiezen.
    const bomen = objecten.filter((o) => /Boom|beplanting/i.test(o.type ?? ''));
    app.innerHTML = `<div class="paginakop"><div><p><a href="#/inspecties">← Inspecties</a></p><h1>Boomveiligheidscontrole</h1></div></div>
      <div class="kaart"><div class="veld"><label for="kies">Boom of gesloten beplanting</label><select id="kies"><option value="">– kies –</option>
      ${(bomen.length ? bomen : objecten).map((o) => optie(o.id, `${o.code} – ${o.naam}`)).join('')}</select></div></div>`;
    app.querySelector('#kies').onchange = (e) => { if (e.target.value) ga(`#/bvc/nieuw?object=${encodeURIComponent(e.target.value)}`); };
    return;
  }
  if (!object) {
    app.innerHTML = leegKaart('Object niet gevonden.', '<a class="knop" href="#/m/bvc">Terug</a>');
    return;
  }
  const naam = instelling.lees('inspecteur');
  const b0 = bestaand?.bvc ?? {};
  const staat = {
    datum: bestaand?.datum ?? vandaag(),
    inspecteur: bestaand?.inspecteur ?? naam,
    status: bestaand?.status ?? 'concept',
    werkpakketId: bestaand?.werkpakketId ?? pakketId ?? '',
    rondeId: bestaand?.rondeId ?? rondeId ?? '',
    fotos: await laadFotos(bestaand?.fotoIds),
    bvc: {
      // Basisgegevens: eerst wat al bij de boom staat, anders uit de kenmerken van het GIS-bestand.
      soort: object.boomsoort || gisBoomsoort(object), plantjaar: object.plantjaar || gisKenmerk(object, /^(plantjaar|aanlegjaar|jaar_?aanleg|plant_?jaar|jaar)$/i),
      plantjaarSchatting: false, dbh: object.dbh || gisKenmerk(object, /^(dbh|diameter|stamdiameter|stamdiam|diam|stam_?diameter)$/i),
      bijzonder: Boolean(object.bijzonder), ork: object.ork || gisOrk(object), gb: Boolean(object.gb ?? object.type === 'Gesloten beplanting'),
      aantalBomen: object.aantalBomen || gisKenmerk(object, /^(aantal|aantal_?bomen)$/i),
      niet: false, eigenaar: object.beheerder ?? '', kwalificatie: instelling.lees('bvcKwalificatie'), certificaat: instelling.lees('bvcCertificaat'),
      methode: instelling.lees('bvcMethode', 'VTA'), prikstok: false, klophamer: false, bvk: '', gemarkeerd: false,
      beschermdeSoorten: false, opmerking: '', fotonummer: '',
      ...b0,
      gebreken: await Promise.all((b0.gebreken ?? []).map(async (g) => ({ ...g, fotos: await laadFotos(g.fotoIds) }))),
      maatregelen: (b0.maatregelen ?? []).map((m) => ({ ...m })),
    },
  };
  const origineel = new Set([...(bestaand?.fotoIds ?? []), ...(b0.gebreken ?? []).flatMap((g) => g.fotoIds ?? [])]);
  const pakket = await laadPakketView(staat.werkpakketId, staat.rondeId);
  if (pakket) staat.rondeId = pakket.rondeId;
  const taak = taakId ? await db.haal('taken', taakId) : null;
  const terug = pakket ? pakketPagina(pakket, mobiel)
    : mobiel ? '#/m/bvc' : bestaand ? `#/inspecties/${esc(id)}` : `#/objecten/${esc(object.id)}`;
  const b = staat.bvc;
  const gebrekOpties = Object.entries(BV.GEBREKEN).map(([type, lijst]) => `<optgroup label="${esc(type)}">${lijst.map((g) => `<option>${esc(g)}</option>`).join('')}</optgroup>`).join('');

  const kop = mobiel
    ? `<div class="mkop"><a href="${terug}" class="mterug" aria-label="Terug">←</a>
        <div><small>🌳 Boomveiligheidscontrole</small><h1>${esc(object.code)} – ${esc(object.naam)}</h1></div></div>`
    : `<div class="paginakop"><div><p><a href="${terug}">← Terug</a></p><h1>Boomveiligheidscontrole</h1><p>${objectNaam(object)} · ${rdTekst(object)}</p></div></div>`;

  app.innerHTML = `${kop}
    <form id="form" novalidate class="${mobiel ? 'mform' : ''}">
      ${taak ? `<div class="kaart mhier">📋 <strong>Taak:</strong> ${esc(taak.titel)}</div>` : ''}
      ${pakket ? `<div class="kaart mhier">📦 <strong>Werkpakket:</strong> ${esc(pakket.naam)}</div>` : ''}
      <section class="kaart">
        <h2>Controle</h2>
        <div class="velden">
          <div class="veld"><label for="f-datum" class="vereist">Datum (DATUM)</label><input id="f-datum" name="datum" type="date" value="${esc(staat.datum)}"></div>
          <div class="veld"><label for="f-inspecteur" class="vereist">Controleur (INSP)</label><input id="f-inspecteur" name="inspecteur" value="${esc(staat.inspecteur)}"></div>
          <div class="veld"><label for="b-kwal" class="vereist">Kwalificatie</label><select id="b-kwal" data-b="kwalificatie"><option value="">– kies –</option>
            ${BV.KWALIFICATIES.map((k) => optie(k, k, b.kwalificatie)).join('')}</select></div>
          <div class="veld"><label for="b-cert">Certificaatnummer</label><input id="b-cert" data-b="certificaat" value="${esc(b.certificaat)}"></div>
          <div class="veld"><label for="b-methode">Methode</label><select id="b-methode" data-b="methode">${BV.METHODEN.map((m) => optie(m, m, b.methode)).join('')}</select></div>
          <div class="veld"><label>Hulpmiddelen</label><div class="chips">
            <label class="chip"><input type="checkbox" data-b="prikstok" ${b.prikstok ? 'checked' : ''}><span>Prikstok</span></label>
            <label class="chip"><input type="checkbox" data-b="klophamer" ${b.klophamer ? 'checked' : ''}><span>Klophamer</span></label></div></div>
        </div>
        <p id="periode" class="label-status binnenkort" style="white-space:normal;margin-top:.75rem" hidden>Het protocol schrijft controle in de periode juli t/m november voor (§ 6.1).</p>
        <label class="vink" style="margin-top:.75rem"><input type="checkbox" data-b="niet" ${b.niet ? 'checked' : ''}><span><strong>Boom niet aangetroffen (NIET)</strong><small>Bijv. gekapt of verdwenen; verder hoeft niets ingevuld te worden.</small></span></label>
      </section>
      <div id="bvc-inhoud">
      <section class="kaart">
        <h2>Basisgegevens boom</h2>
        <div class="velden">
          <div class="veld breed"><label for="b-soort" class="vereist">Boomsoort (SOORT)</label>
            <input id="b-soort" data-b="soort" list="boomsoorten" value="${esc(b.soort)}" placeholder="Typ Latijnse of Nederlandse naam" autocomplete="off">
            <datalist id="boomsoorten">${BV.GB_SOORTEN.map((g) => `<option value="${esc(g)}">gesloten beplanting</option>`).join('')}${BV.BOOMSOORTEN.map(([w, n]) => `<option value="${esc(w)}">${esc(n)}</option>`).join('')}</datalist>
            <small id="soortnaam">${esc(soortNaam(b.soort))}</small></div>
          <div class="veld"><label for="b-jaar">Plantjaar (JAAR)</label><input id="b-jaar" data-b="plantjaar" type="number" min="1700" max="2100" inputmode="numeric" value="${esc(b.plantjaar)}">
            <label class="vink" style="margin-top:.35rem;padding:.4rem .6rem"><input type="checkbox" data-b="plantjaarSchatting" ${b.plantjaarSchatting ? 'checked' : ''}><span>Schatting</span></label></div>
          <div class="veld"><label for="b-dbh">Stamdiameter (cm, dbh)</label><input id="b-dbh" data-b="dbh" type="number" min="0" max="500" inputmode="numeric" value="${esc(b.dbh)}">
            <small id="bijzonder-hint"></small></div>
          <div class="veld breed"><label class="vereist">Omgevingsrisicoklasse (ORK)</label>
            ${segment('ork', b.ork, Object.keys(BV.ORK).map((k) => [k, k]), 'data-b="ork"')}<small id="ork-uitleg">${esc(BV.ORK[b.ork]?.uitleg ?? '')}</small></div>
          <div class="veld"><label for="b-eig">Eigenaar (EIG)</label><input id="b-eig" data-b="eigenaar" value="${esc(b.eigenaar)}"></div>
          <div class="veld"><label>&nbsp;</label><label class="vink"><input type="checkbox" data-b="bijzonder" ${b.bijzonder ? 'checked' : ''}><span>Bijzondere boom (bijlage 7)</span></label></div>
          <div class="veld"><label>&nbsp;</label><label class="vink"><input type="checkbox" data-b="gb" ${b.gb ? 'checked' : ''}><span>Gesloten beplanting (GB)</span></label></div>
          <div class="veld" id="aantal-veld" ${b.gb ? '' : 'hidden'}><label for="b-aantal" class="vereist">Aantal bomen</label><input id="b-aantal" data-b="aantalBomen" type="number" min="1" value="${esc(b.aantalBomen)}"></div>
        </div>
      </section>
      <section>
        <div class="mtussen"><h2>Boomgebreken</h2><button type="button" class="knop" id="gebrek-plus">＋ Gebrek</button></div>
        <p class="hulptekst">Alleen afwijkingen die binnen 3 jaar tot stam- of takbreuk of instabiliteit kunnen leiden (§ 6.3.1). Dood hout vanaf 4 cm diameter of takken langer dan 100 cm.</p>
        <div id="gebreken"></div>
      </section>
      <section class="kaart">
        <h2>Conclusie</h2>
        <div class="veld"><label class="vereist">Boomveiligheidsklasse (BVK)</label>
          ${segment('bvk', b.bvk, Object.entries(BV.BVK).map(([k, v]) => [k, v.kort]), 'data-b="bvk"')}</div>
        <div id="conclusie" class="conclusie"></div>
      </section>
      <section>
        <div class="mtussen"><h2>Maatregelen</h2><button type="button" class="knop" id="maatregel-plus">＋ Maatregel</button></div>
        <p class="hulptekst">Uitvoeren binnen 3 maanden na oplevering; acute gebreken binnen 48 uur na signalering (§ 6.3.4). Geen levensverlengende ingrepen, behalve bij bijzondere bomen (§ 6.3.2).</p>
        <div id="maatregelen"></div>
        <label class="vink" id="gemarkeerd-veld" hidden><input type="checkbox" data-b="gemarkeerd" ${b.gemarkeerd ? 'checked' : ''}>
          <span><strong>Te vellen boom gemarkeerd met oranje streep (blesverf)</strong><small>Verplicht bij "Boom verwijderen".</small></span></label>
      </section>
      <section class="kaart">
        <h2>Overig</h2>
        <label class="vink"><input type="checkbox" data-b="beschermdeSoorten" ${b.beschermdeSoorten ? 'checked' : ''}>
          <span><strong>Beschermde soorten in de boom</strong><small>Bijv. vleermuizen of een jaarrond beschermd nest. Dan wordt afgeweken van de standaardmaatregelen en is een ecologisch deskundige nodig (§ 6.3.2).</small></span></label>
        <p id="soorten-waarschuwing" class="label-status verlopen" style="white-space:normal;margin-top:.5rem" ${b.beschermdeSoorten ? '' : 'hidden'}>
          Schakel een ecologisch deskundige in voordat maatregelen worden uitgevoerd. <a href="${mobiel ? '#/m/vrijgave/nieuw' : '#/vrijgaven/nieuw'}?object=${esc(object.id)}">Flora- en fauna-vrijgave aanmaken →</a></p>
        <div class="velden" style="margin-top:.75rem">
          <div class="veld breed"><label for="b-opm">Opmerkingen (OPMERK)</label><textarea id="b-opm" data-b="opmerking" maxlength="255">${esc(b.opmerking)}</textarea></div>
          <div class="veld"><label for="b-foto">Fotonummer (FOTO)</label><input id="b-foto" data-b="fotonummer" maxlength="60" value="${esc(b.fotonummer)}"></div>
          <div class="veld breed"><label>Foto's van de boom</label><div id="algemene-fotos"></div></div>
        </div>
      </section>
      </div>
      <div class="${mobiel ? 'mvoet' : 'formvoet kaart'}">
        ${mobiel ? '' : `<a class="knop" href="${terug}">Annuleren</a>`}
        <button class="knop" type="submit" data-status="concept">Concept</button>
        <button class="knop primair" type="submit" data-status="afgerond">✓ Afronden</button>
      </div>
    </form>`;

  const form = app.querySelector('#form');
  const $ = (s) => app.querySelector(s);
  const fotoLijst = (k) => (k === 'alg' ? staat.fotos : b.gebreken[Number(k.slice(1))].fotos);

  const tekenGebreken = () => {
    $('#gebreken').innerHTML = b.gebreken.length ? b.gebreken.map((g, i) => `
      <div class="gebrek" style="border-left-color:${BV.BVK.risico.kleur}">
        <div class="gebrek-kop"><h3 style="margin:0">Gebrek ${i + 1}${g.omschrijving ? ` · <small>${esc(BV.gebrekType(g.omschrijving))}</small>` : ''}</h3>
          <button type="button" class="knop klein gevaar" data-gebrek-weg="${i}" aria-label="Gebrek verwijderen">🗑</button></div>
        <div class="velden">
          <div class="veld breed"><label class="vereist">Gebrek</label><select data-g="${i}" data-veld="omschrijving"><option value="">– kies –</option>
            ${gebrekOpties.replace(`<option>${esc(g.omschrijving)}</option>`, `<option selected>${esc(g.omschrijving)}</option>`)}</select>
            ${BV.BRUIKBAARHEID.includes(g.omschrijving) ? '<small>Bruikbaarheid van de weg, geen boomveiligheid (§ 6.3.2): hoort bij regulier onderhoud.</small>' : ''}</div>
          <div class="veld breed"><label class="vereist">Plaats</label>${segment(`plaats-${i}`, g.plaats, BV.PLAATS.map((p) => [p, p]), `data-g="${i}" data-veld="plaats"`)}</div>
          <div class="veld breed"><label class="vereist">Gevolg</label>${segment(`gevolg-${i}`, g.gevolg, BV.GEVOLG.map((p) => [p, p]), `data-g="${i}" data-veld="gevolg"`)}</div>
          <div class="veld breed"><label>Toelichting</label><input data-g="${i}" data-veld="toelichting" value="${esc(g.toelichting ?? '')}" maxlength="200"></div>
          <div class="veld breed"><label>Foto's</label>${fotoRij(g.fotos, `g${i}`)}</div>
        </div></div>`).join('') : '<p class="mleeg">Geen gebreken vastgelegd.</p>';
  };
  const tekenMaatregelen = () => {
    $('#maatregelen').innerHTML = b.maatregelen.length ? b.maatregelen.map((m, i) => `
      <div class="gebrek" style="border-left-color:${m.termijn === 'acuut' ? '#8b1a1a' : '#e07b00'}">
        <div class="gebrek-kop"><h3 style="margin:0">Maatregel ${i + 1}</h3>
          <button type="button" class="knop klein gevaar" data-maatregel-weg="${i}" aria-label="Maatregel verwijderen">🗑</button></div>
        <div class="velden">
          <div class="veld"><label class="vereist">Maatregel</label><select data-m="${i}" data-veld="bvcMaatregel"><option value="">– kies –</option>
            ${BV.MAATREGELEN.map((x) => optie(x, x, m.bvcMaatregel)).join('')}</select></div>
          <div class="veld"><label class="vereist">Urgentie</label>${segment(`termijn-${i}`, m.termijn, Object.entries(BV.URGENTIE).map(([k, v]) => [k, v.label]), `data-m="${i}" data-veld="termijn"`)}</div>
          <div class="veld breed"><small>Uiterlijk uitvoeren: <strong data-uiterlijk="${i}">${m.termijn ? datumNL(BV.uitvoerenVoor(m.termijn, $('#f-datum')?.value || staat.datum)) : '–'}</strong></small></div>
        </div></div>`).join('') : '<p class="mleeg">Geen maatregelen.</p>';
    $('#gemarkeerd-veld').hidden = !b.maatregelen.some((m) => m.bvcMaatregel === 'Boom verwijderen');
  };
  const tekenAlgemeen = () => { $('#algemene-fotos').innerHTML = fotoRij(staat.fotos, 'alg'); };
  const tekenConclusie = () => {
    const datum = $('#f-datum').value || staat.datum;
    const jaren = BV.frequentie(b.bvk, b.ork);
    $('#conclusie').innerHTML = b.bvk && b.ork
      ? `<p>${bvkLabel(b.bvk)} · ORK <strong>${esc(b.ork)}</strong></p>
         <p>Controlefrequentie: <strong>${BV.CONTROLEFREQUENTIE[jaren]}</strong> · volgende controle uiterlijk <strong>${datumNL(volgendeInspectie(datum, jaren))}</strong>
         ${b.bvk === 'risico' ? '<br><small>Na uitvoering van de maatregel wordt het een boom zonder gebreken; frequentie volgens ORK.</small>' : ''}</p>`
      : '<p class="mleeg">Kies ORK en BVK om de controlefrequentie te bepalen.</p>';
    $('#ork-uitleg').textContent = BV.ORK[b.ork]?.uitleg ?? '';
    $('#periode').hidden = !datum || BV.inControleperiode(datum);
    $('#bijzonder-hint').textContent = BV.bijzondereBoomHint(b.dbh);
    $('#soortnaam').textContent = soortNaam(b.soort);
    $('#aantal-veld').hidden = !b.gb;
    $('#bvc-inhoud').hidden = Boolean(b.niet);
    $('#soorten-waarschuwing').hidden = !b.beschermdeSoorten;
  };
  tekenGebreken(); tekenMaatregelen(); tekenAlgemeen(); tekenConclusie();

  form.addEventListener('input', (e) => {
    formulierGewijzigd = true;
    const el = e.target;
    const waarde = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.b) b[el.dataset.b] = waarde;
    if (el.dataset.g !== undefined) {
      b.gebreken[Number(el.dataset.g)][el.dataset.veld] = waarde;
      if (el.dataset.veld === 'omschrijving') tekenGebreken();
    }
    if (el.dataset.m !== undefined) {
      b.maatregelen[Number(el.dataset.m)][el.dataset.veld] = waarde;
      tekenMaatregelen();
    }
    if (el.name === 'datum') tekenMaatregelen();
    tekenConclusie();
  });
  form.addEventListener('change', async (e) => {
    const k = e.target.dataset.fotoBij;
    if (!k || !e.target.files?.length) return;
    try {
      for (const f of [...e.target.files]) fotoLijst(k).push({ id: nieuwId(), data: await verkleinFoto(f) });
    } catch (fout) { melding(fout.message, 'fout'); }
    if (k === 'alg') tekenAlgemeen(); else tekenGebreken();
  });
  form.addEventListener('click', (e) => {
    const fw = e.target.closest('[data-foto-weg]');
    if (fw) {
      const [k, n] = fw.dataset.fotoWeg.split(':');
      fotoLijst(k).splice(Number(n), 1);
      if (k === 'alg') tekenAlgemeen(); else tekenGebreken();
      return;
    }
    const gw = e.target.closest('[data-gebrek-weg]');
    if (gw) { b.gebreken.splice(Number(gw.dataset.gebrekWeg), 1); tekenGebreken(); tekenConclusie(); return; }
    const mw = e.target.closest('[data-maatregel-weg]');
    if (mw) { b.maatregelen.splice(Number(mw.dataset.maatregelWeg), 1); tekenMaatregelen(); }
  });
  $('#gebrek-plus').onclick = () => {
    b.gebreken.push({ id: nieuwId(), omschrijving: '', plaats: '', gevolg: '', toelichting: '', fotos: [] });
    tekenGebreken();
    $('#gebreken').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#maatregel-plus').onclick = () => {
    b.maatregelen.push({ id: nieuwId(), bvcMaatregel: '', termijn: '', maatregelStatus: 'open' });
    tekenMaatregelen();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const status = e.submitter?.dataset.status ?? 'concept';
    const datum = $('#f-datum').value;
    const inspecteur = $('#f-inspecteur').value.trim();
    if (!datum) return melding('Vul de datum in.', 'fout');
    if (status === 'afgerond') {
      const fouten = BV.controleer({ ...b, controleur: inspecteur });
      if (fouten.length) return melding(`${fouten[0]}${fouten.length > 1 ? ` (en ${fouten.length - 1} meer)` : ''}`, 'fout');
    }
    const inspectieId = id ?? nieuwId();
    const nu = new Date().toISOString();
    const pid = bestaand?.projectId ?? projectId();
    await bewaarFotoLijsten([staat.fotos, ...b.gebreken.map((g) => g.fotos)], origineel, { inspectieId, projectId: pid, datum: nu });
    const jaren = BV.frequentie(b.bvk, b.ork);
    const eersteGebrek = b.gebreken.find((g) => g.omschrijving)?.omschrijving ?? 'Boomveiligheid';
    const bvcData = {
      ...b,
      controleur: inspecteur,
      gebreken: b.gebreken.map(({ fotos, ...g }) => ({ ...g, type: BV.gebrekType(g.omschrijving), fotoIds: fotos.map((f) => f.id) })),
      // Maatregelen zijn ook zichtbaar in het maatregelenoverzicht, de taken en bij werkzaamheden.
      maatregelen: b.niet ? [] : b.maatregelen.map((m) => ({
        ...m, bouwdeel: 'Boom', gebrek: eersteGebrek, maatregel: m.bvcMaatregel,
        urgentie: m.termijn === 'acuut' ? 'direct' : '3maanden', uitvoerenVoor: BV.uitvoerenVoor(m.termijn, datum),
        maatregelStatus: m.maatregelStatus ?? 'open',
      })),
      frequentieJaren: jaren,
      volgendeControle: b.niet ? '' : volgendeInspectie(datum, jaren),
    };
    await db.bewaar('inspecties', {
      ...(bestaand ?? {}), id: inspectieId, projectId: pid, objectId: object.id, werkpakketId: staat.werkpakketId, rondeId: staat.werkpakketId ? staat.rondeId : '',
      soort: BV.BVC_SOORT, datum, inspecteur, status, weer: '', samenvatting: b.opmerking, fotoIds: staat.fotos.map((f) => f.id),
      gebreken: [], bvc: bvcData, aangemaakt: bestaand?.aangemaakt ?? nu, gewijzigd: nu,
    });
    if (status === 'afgerond') {
      // Basisgegevens horen bij de boom en worden bij elke controle geverifieerd (§ 6.2).
      const o = await db.haal('objecten', object.id);
      await db.bewaar('objecten', {
        ...o, type: o.type && o.type !== 'Overig' ? o.type : (b.gb ? 'Gesloten beplanting' : 'Boom'),
        boomsoort: b.soort, plantjaar: b.plantjaar, dbh: b.dbh, bijzonder: b.bijzonder, ork: b.ork, gb: b.gb, aantalBomen: b.aantalBomen,
        beheerder: b.eigenaar || o.beheerder, inspectieInterval: b.niet ? o.inspectieInterval : jaren,
        status: b.niet ? 'Niet aangetroffen' : (o.status === 'Niet aangetroffen' ? 'In gebruik' : o.status), gewijzigd: nu,
      });
      await rondTaakAf(taakId, inspectieId);
    }
    instelling.schrijf('inspecteur', inspecteur);
    instelling.schrijf('bvcKwalificatie', b.kwalificatie);
    instelling.schrijf('bvcCertificaat', b.certificaat);
    instelling.schrijf('bvcMethode', b.methode);
    formulierGewijzigd = false;
    melding(status === 'afgerond' ? 'Boomveiligheidscontrole afgerond' : 'Concept opgeslagen');
    ga(pakket ? (mobiel ? `#/m/pakket/${pakket.id}` : `#/werkpakketten/${pakket.id}`) : (mobiel ? '#/m/bvc' : `#/inspecties/${inspectieId}`));
  };
}

async function bvcInhoud(i, o) {
  const b = i.bvc ?? {};
  const gebreken = await Promise.all((b.gebreken ?? []).map((g, n) => bvcGebrekKaart(g, n)));
  const kleur = b.niet ? '#9aa5b1' : (BV.BVK[b.bvk]?.kleur ?? '#9aa5b1');
  return `
    <div class="raster-2 detailkop">
      <section class="kaart">
        <div class="oordeelblok" style="--gk:${kleur}">
          <div><small>Boomveiligheidsklasse</small>${inspectieOordeel(i)}</div>
          <p>${b.niet ? 'Boom niet aangetroffen.' : `${(b.gebreken ?? []).length} gebrek${(b.gebreken ?? []).length === 1 ? '' : 'en'} · ${(b.maatregelen ?? []).length} maatregel${(b.maatregelen ?? []).length === 1 ? '' : 'en'}`}</p>
        </div>
        <h2>Basisgegevens</h2><dl class="gegevens">
        <dt>Object</dt><dd>${esc(o?.code ?? '–')}${o?.naam && o.naam !== o.code ? ` · ${esc(o.naam)}` : ''}</dd>
        <dt>Boomsoort</dt><dd>${esc(soortNaam(b.soort))}</dd>
        <dt>Plantjaar</dt><dd>${esc(b.plantjaar || '–')}${b.plantjaarSchatting ? ' (schatting)' : ''}</dd>
        ${b.dbh ? `<dt>Stamdiameter</dt><dd>${esc(b.dbh)} cm${b.bijzonder ? ' · bijzondere boom' : ''}</dd>` : ''}
        <dt>ORK</dt><dd>${esc(b.ork || '–')}</dd>
        <dt>Eigenaar</dt><dd>${esc(b.eigenaar || '–')}</dd>
        ${b.gb ? `<dt>Gesloten beplanting</dt><dd>Ja, ${esc(b.aantalBomen)} bomen</dd>` : ''}
      </dl></section>
      ${locatieBlok(o)}
    </div>
    <div class="raster-2">
      <section class="kaart"><h2>Controle</h2><dl class="gegevens">
        <dt>Datum</dt><dd>${datumNL(i.datum)}${BV.inControleperiode(i.datum) ? '' : ' <span class="label-status binnenkort">buiten juli–november</span>'}</dd>
        <dt>Controleur</dt><dd>${esc(i.inspecteur || '–')}</dd>
        <dt>Kwalificatie</dt><dd>${esc(b.kwalificatie || '–')}${b.certificaat ? ` · nr. ${esc(b.certificaat)}` : ''}</dd>
        <dt>Methode</dt><dd>${esc(b.methode || '–')}${b.prikstok || b.klophamer ? ` · ${[b.prikstok && 'prikstok', b.klophamer && 'klophamer'].filter(Boolean).join(', ')}` : ''}</dd>
        <dt>Oordeel</dt><dd>${inspectieOordeel(i)}</dd>
        ${b.niet ? '' : `<dt>Frequentie</dt><dd>${BV.CONTROLEFREQUENTIE[b.frequentieJaren ?? BV.frequentie(b.bvk, b.ork)] ?? '–'}</dd>
        <dt>Volgende controle</dt><dd>${datumNL(b.volgendeControle)}</dd>`}
      </dl></section>
    ${b.niet ? '' : `
    <section class="kaart"><h2>Boomveiligheidsmaatregelen</h2>${(b.maatregelen ?? []).length ? `<div class="tabelhouder"><table>
      <thead><tr><th>Maatregel</th><th>Urgentie</th><th>Uiterlijk</th><th>Status</th></tr></thead><tbody>
      ${b.maatregelen.map((m) => `<tr><td>${esc(m.bvcMaatregel)}</td><td>${esc(BV.URGENTIE[m.termijn]?.label ?? '')}</td><td>${datumNL(m.uitvoerenVoor)}</td>
        <td>${m.maatregelStatus === 'uitgevoerd' ? '<span class="label-status uitgevoerd">Uitgevoerd</span>' : '<span class="label-status binnenkort">Open</span>'}</td></tr>`).join('')}
      </tbody></table></div>${b.maatregelen.some((m) => m.bvcMaatregel === 'Boom verwijderen') ? `<p><small>Gemarkeerd met oranje streep: ${b.gemarkeerd ? 'ja' : 'nee'}</small></p>` : ''}`
    : '<p class="leeg">Geen maatregelen.</p>'}</section>`}
    </div>
    ${b.niet ? '' : `<h2>Boomgebreken${gebreken.length ? ` (${gebreken.length})` : ''}</h2>${gebreken.join('') || leegKaart('Geen boomgebreken.')}`}
    ${b.beschermdeSoorten ? '<div class="kaart mhier">🦇 Beschermde soorten in de boom: maatregelen alleen na afstemming met een ecologisch deskundige.</div>' : ''}
    ${b.opmerking || i.fotoIds?.length ? `<section class="kaart"><h2>Opmerkingen en foto's</h2>${b.opmerking ? `<p style="white-space:pre-wrap">${esc(b.opmerking)}</p>` : ''}
      ${b.fotonummer ? `<p><small>Fotonummer: ${esc(b.fotonummer)}</small></p>` : ''}${await fotoGalerij(i.fotoIds, { titel: "Foto's" })}</section>` : ''}`;
}

async function bvcDetail(i, { rapport = false } = {}) {
  const o = await db.haal('objecten', i.objectId);
  const organisatie = instelling.lees('organisatie');
  const inhoud = await bvcInhoud(i, o);
  if (rapport) {
    app.innerHTML = `
      <div class="paginakop geen-print"><p><a href="#/inspecties/${esc(i.id)}">← Terug</a></p>
        <button class="knop primair" onclick="window.print()">Afdrukken / opslaan als PDF</button></div>
      <article class="rapport">
        <div class="rapport-kop"><div><small>${esc(organisatie || 'Rapportage boomveiligheid')}</small>
          <h1 style="margin:.25rem 0">Boomveiligheidscontrole ${esc(o?.code ?? '')}</h1>
          <div>${esc(o?.naam ?? '')} · ${datumNL(i.datum)} · ${esc(i.inspecteur || '')}</div></div>
          <div style="text-align:right"><small>Boomveiligheidsklasse</small><br>${inspectieOordeel(i)}</div></div>
        <p><small>Uitgevoerd volgens het Boomveiligheidsprotocol Rijkswaterstaat (2017); gegevens conform SUF-BVC. Werkwijze: ${esc(i.bvc?.methode || '–')}.</small></p>
        ${inhoud}
        <p style="margin-top:2rem">Bijlage: certificaat controleur ${esc(i.bvc?.kwalificatie || '')} ${i.bvc?.certificaat ? `nr. ${esc(i.bvc.certificaat)}` : ''}</p>
      </article>`;
    tekenObjectKaartje(app.querySelector('#objectkaartje'), o, i.bvc?.niet ? '#9aa5b1' : (BV.BVK[i.bvc?.bvk]?.kleur ?? '#0b4f6c'));
    return;
  }
  app.innerHTML = `
    <div class="paginakop">
      <div><p><a href="${o ? `#/objecten/${esc(o.id)}` : '#/inspecties'}">← ${o ? esc(o.code) : 'Inspecties'}</a></p>
        <h1>🌳 Boomveiligheidscontrole · ${datumNL(i.datum)}</h1><p>${objectNaam(o)} · ${statusLabel(i.status)}</p></div>
      <div class="knoppen">
        <a class="knop" href="#/inspecties/${esc(i.id)}/rapport">Rapport</a>
        <a class="knop" href="#/inspecties/${esc(i.id)}/bewerken">Bewerken</a>
        <button class="knop gevaar" id="verwijder">Verwijderen</button>
      </div>
    </div>${inhoud}`;
  tekenObjectKaartje(app.querySelector('#objectkaartje'), o, i.bvc?.niet ? '#9aa5b1' : (BV.BVK[i.bvc?.bvk]?.kleur ?? '#0b4f6c'));
  app.querySelector('#verwijder').onclick = async () => {
    if (!confirm('Deze boomveiligheidscontrole inclusief foto\'s verwijderen?')) return;
    await verwijderInspectieData(i);
    ga(o ? `#/objecten/${o.id}` : '#/inspecties');
  };
}

/** SUF-BVC export: laatste afgeronde controle per boom, als drie CSV-bestanden. */
async function exporteerSuf(filter = () => true, naam = 'project') {
  const [inspecties, objecten] = await Promise.all([inProject('inspecties'), inProject('objecten')]);
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  const laatste = new Map();
  for (const i of inspecties.filter((x) => x.bvc && x.status === 'afgerond' && filter(x))) {
    const eerder = laatste.get(i.objectId);
    if (!eerder || String(i.datum) > String(eerder.datum)) laatste.set(i.objectId, i);
  }
  const lijst = [...laatste.values()].map((i) => ({ object: objectMap.get(i.objectId), inspectie: i })).filter((x) => x.object);
  if (!lijst.length) return melding('Nog geen afgeronde boomveiligheidscontroles.', 'fout');
  const { bomen, gebreken, maatregelen } = BV.sufRijen(lijst);
  const basis = `SUF-BVC-${naam.replace(/[^\w-]+/g, '_')}-${vandaag()}`;
  download(`${basis}-boom.csv`, csv(bomen), 'text/csv;charset=utf-8');
  setTimeout(() => download(`${basis}-boomgebreken.csv`, csv(gebreken), 'text/csv;charset=utf-8'), 300);
  setTimeout(() => download(`${basis}-maatregelen.csv`, csv(maatregelen), 'text/csv;charset=utf-8'), 600);
  melding(`SUF-BVC: ${lijst.length} bomen geëxporteerd (3 bestanden)`);
}

/** Samenvatting voor de rapportage (bijlage 5): aantallen per klasse en maatregel. */
function bvcSamenvatting(inspecties) {
  const bvc = inspecties.filter((i) => i.bvc && i.status === 'afgerond');
  if (!bvc.length) return '';
  const tel = (f) => bvc.reduce((m, i) => { const k = f(i); if (k) m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const perBvk = tel((i) => (i.bvc.niet ? 'Niet aangetroffen' : BV.BVK[i.bvc.bvk]?.label));
  const perOrk = tel((i) => (i.bvc.niet ? null : `ORK ${i.bvc.ork}`));
  const maatregelen = {};
  let acuut = 0;
  for (const i of bvc) for (const m of i.bvc.maatregelen ?? []) { maatregelen[m.bvcMaatregel] = (maatregelen[m.bvcMaatregel] ?? 0) + 1; if (m.termijn === 'acuut') acuut += 1; }
  const regel = (o) => Object.entries(o).map(([k, n]) => `<li>${esc(k)}: <strong>${n}</strong></li>`).join('');
  return `<section class="kaart"><h2>🌳 Samenvatting boomveiligheid</h2><div class="raster">
    <div><h3>${bvc.length} gecontroleerd</h3><ul>${regel(perBvk)}</ul></div>
    <div><h3>Omgevingsrisicoklasse</h3><ul>${regel(perOrk)}</ul></div>
    <div><h3>Maatregelen</h3><ul>${regel(maatregelen) || '<li>Geen</li>'}${acuut ? `<li class="label-status verlopen">${acuut} acuut (48 uur)</li>` : ''}</ul></div></div></section>`;
}

// Nieuwe boom inmeten met GPS (protocol § 5.3: max. ca. 3 meter afwijking)
async function nieuweBoomHier() {
  if (!navigator.geolocation) return melding('Locatiebepaling wordt niet ondersteund.', 'fout');
  melding('Locatie bepalen…');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const objecten = await inProject('objecten');
    const nrs = objecten.map((o) => Number(String(o.code).match(/^BM-(\d+)$/)?.[1])).filter(Number.isFinite);
    const code = `BM-${String((nrs.length ? Math.max(...nrs) : 0) + 1).padStart(4, '0')}`;
    const nu = new Date().toISOString();
    const o = {
      id: nieuwId(), projectId: projectId(), code, naam: `Boom ${code}`, type: 'Boom', status: 'In gebruik',
      lat: Number(pos.coords.latitude.toFixed(7)), lng: Number(pos.coords.longitude.toFixed(7)), inspectieInterval: 1,
      nauwkeurigheid: Math.round(pos.coords.accuracy), aangemaakt: nu, gewijzigd: nu,
    };
    await db.bewaar('objecten', o);
    melding(pos.coords.accuracy > 3 ? `${code} ingemeten (± ${Math.round(pos.coords.accuracy)} m; protocol vraagt max. ca. 3 m)` : `${code} ingemeten (± ${Math.round(pos.coords.accuracy)} m)`,
      pos.coords.accuracy > 3 ? 'fout' : 'ok');
    ga(`#/m/bvc/nieuw?object=${encodeURIComponent(o.id)}`);
  }, (fout) => melding(`Locatie niet beschikbaar: ${fout.message}`, 'fout'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}

// ---------------------------------------------------------------------------
// Flora- en fauna-vrijgave (veldcheck, Gedragscode Soortenbescherming RWS 2025–2029)
// ---------------------------------------------------------------------------
const VRIJGAVE_STATUS = {
  geldig: { label: 'Geldig', klasse: 'afgerond' },
  verlopen: { label: 'Verlopen', klasse: 'verlopen' },
  toekomst: { label: 'Nog niet geldig', klasse: 'binnenkort' },
  afgewezen: { label: 'Niet vrijgegeven', klasse: 'verlopen' },
  concept: { label: 'Concept', klasse: 'concept' },
};

function vrijgaveLabel(v, datum = vandaag()) {
  if (!v) return '<span class="label-status verlopen">🌿 Geen vrijgave</span>';
  const g = eco.geldigheid(v, datum);
  const s = VRIJGAVE_STATUS[g];
  const extra = g === 'geldig' ? `${v.besluit === 'voorwaarden' ? ' · voorwaarden' : ''} t/m ${datumNL(v.geldigTot)}` : '';
  return `<span class="label-status ${s.klasse}">🌿 ${s.label}${extra}</span>`;
}

async function vrijgaveVoor(objectId) {
  return eco.vrijgaveVoorObject(await inProject('vrijgaven'), objectId, vandaag());
}

async function vrijgaveFormulier(id, q = new URLSearchParams(), { mobiel = false } = {}) {
  const objecten = (await inProject('objecten')).sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  const bestaand = id ? await db.haal('vrijgaven', id) : null;
  if (id && !bestaand) {
    app.innerHTML = leegKaart('Vrijgave niet gevonden.', `<a class="knop" href="${mobiel ? '#/' : '#/vrijgaven'}">Terug</a>`);
    return;
  }
  const pakketId = bestaand?.werkpakketId ?? q.get('pakket');
  const pakket = pakketId ? await db.haal('werkpakketten', pakketId) : null;
  const beginObjecten = bestaand?.objectIds ?? (q.get('object') ? [q.get('object')] : pakket ? [...(pakket.objecten ?? [])] : []);
  const v = bestaand ? structuredClone(bestaand) : {
    objectIds: beginObjecten.filter((x) => objectMap.has(x)), werkpakketId: pakketId ?? '',
    werkzaamheid: pakket?.werksoort ?? '', activiteit: '', routeGedragscode: true, ewpKenmerk: '', ewpDatum: '', ewpGeaccepteerd: false, ewpOpLocatie: false,
    uitvoeringVan: pakket?.start ?? '', uitvoeringTot: pakket?.eind ?? '', datum: vandaag(), starttijd: nuTijd(), eindtijd: '', weer: '', temperatuur: '',
    deskundige: instelling.lees('inspecteur'), organisatie: instelling.lees('organisatie'), deskundigheid: instelling.lees('ecoDeskundigheid'), aansturing: '',
    controles: {}, waarnemingen: [], geenWaarnemingen: false, besluit: '', voorwaarden: '', geldigTot: '', begeleiding: false, begeleidingToelichting: '',
    ndff: false, verklaring: false, fotoIds: [], logboek: [], status: 'concept',
  };
  const fotos = await laadFotos(v.fotoIds);
  for (const w of v.waarnemingen) w.fotos = await laadFotos(w.fotoIds);
  const origineel = new Set([...(bestaand?.fotoIds ?? []), ...(bestaand?.waarnemingen ?? []).flatMap((w) => w.fotoIds ?? [])]);
  const terug = pakket ? (mobiel ? `#/m/pakket/${esc(pakket.id)}` : `#/werkpakketten/${esc(pakket.id)}`) : mobiel ? '#/' : bestaand ? `#/vrijgaven/${esc(id)}` : '#/vrijgaven';
  const rijen = (lijst) => lijst.map((x) => optie(x, x, v.activiteit)).join('');

  app.innerHTML = `
    ${mobiel ? `<div class="mkop"><a href="${terug}" class="mterug" aria-label="Terug">←</a>
      <div><small>🌿 Flora & fauna vrijgave</small><h1>Veldcheck</h1></div></div>`
    : `<div class="paginakop"><div><p><a href="${terug}">← Terug</a></p><h1>Flora- en fauna-vrijgave (veldcheck)</h1>
      <p>Controle direct voorafgaand aan de werkzaamheden op de actuele situatie van beschermde soorten en broedgevallen, volgens de Gedragscode Soortenbescherming Rijkswaterstaat 2025–2029.</p></div></div>`}
    <form id="form" novalidate class="${mobiel ? 'mform' : ''}">
      ${pakket ? `<div class="kaart mhier">📦 <strong>Werkpakket:</strong> ${esc(pakket.naam)}</div>` : ''}
      <section class="kaart">
        <h2>Gebied en werkzaamheden</h2>
        <div id="objecten"></div>
        <div class="velden" style="margin-top:.75rem">
          <div class="veld breed"><label for="v-werk" class="vereist">Geplande werkzaamheden</label>
            <input id="v-werk" data-v="werkzaamheid" list="werksoorten" value="${esc(v.werkzaamheid)}" placeholder="bijv. Maaien bermen en taluds">
            <datalist id="werksoorten">${WERKSOORTEN.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
          <div class="veld breed"><label for="v-act" class="vereist">Activiteit volgens de gedragscode</label>
            <select id="v-act" data-v="activiteit"><option value="">– kies –</option>
              <optgroup label="Beheer en Onderhoud (hfst. 4)">${rijen(eco.ACTIVITEITEN_BO)}</optgroup>
              <optgroup label="Kleinschalige Ruimtelijke Ingrepen (hfst. 5)">${rijen(eco.ACTIVITEITEN_RI)}</optgroup></select></div>
          <div class="veld"><label for="v-van">Uitvoering vanaf</label><input id="v-van" data-v="uitvoeringVan" type="date" value="${esc(v.uitvoeringVan)}"></div>
          <div class="veld"><label for="v-tot">Uitvoering tot</label><input id="v-tot" data-v="uitvoeringTot" type="date" value="${esc(v.uitvoeringTot)}"></div>
        </div>
        <label class="vink" style="margin-top:.75rem"><input type="checkbox" data-v="routeGedragscode" ${v.routeGedragscode ? 'checked' : ''}>
          <span><strong>Werken volgens de Gedragscode (met ecologisch werkprotocol)</strong><small>Uit als negatieve effecten op beschermde soorten geheel zijn uitgesloten (alleen zorgplicht), of bij werken met een omgevingsvergunning.</small></span></label>
        <div class="velden" id="ewp" style="margin-top:.75rem">
          <div class="veld"><label for="v-ewp" class="vereist">Kenmerk EWP</label><input id="v-ewp" data-v="ewpKenmerk" value="${esc(v.ewpKenmerk)}"></div>
          <div class="veld"><label for="v-ewpd">Versie / datum EWP</label><input id="v-ewpd" data-v="ewpDatum" value="${esc(v.ewpDatum)}"></div>
          <div class="veld breed"><div class="chips">
            <label class="chip"><input type="checkbox" data-v="ewpGeaccepteerd" ${v.ewpGeaccepteerd ? 'checked' : ''}><span>EWP door RWS geaccepteerd (stap 9)</span></label>
            <label class="chip"><input type="checkbox" data-v="ewpOpLocatie" ${v.ewpOpLocatie ? 'checked' : ''}><span>EWP aanwezig op locatie</span></label></div></div>
        </div>
      </section>
      <section class="kaart">
        <h2>Veldcheck</h2>
        <div class="velden">
          <div class="veld"><label for="v-datum" class="vereist">Datum</label><input id="v-datum" data-v="datum" type="date" value="${esc(v.datum)}"></div>
          <div class="veld"><label for="v-start">Start</label><input id="v-start" data-v="starttijd" type="time" value="${esc(v.starttijd)}"></div>
          <div class="veld"><label for="v-eind">Einde</label><input id="v-eind" data-v="eindtijd" type="time" value="${esc(v.eindtijd)}"></div>
          <div class="veld"><label for="v-weer">Weer</label><select id="v-weer" data-v="weer"><option value="">–</option>${WEER.map((w) => optie(w, w, v.weer)).join('')}</select></div>
          <div class="veld"><label for="v-temp">Temperatuur (°C)</label><input id="v-temp" data-v="temperatuur" type="number" inputmode="decimal" value="${esc(v.temperatuur)}"></div>
          <div class="veld"><label for="v-desk" class="vereist">Ecologisch deskundige</label><input id="v-desk" data-v="deskundige" value="${esc(v.deskundige)}"></div>
          <div class="veld"><label for="v-org">Organisatie</label><input id="v-org" data-v="organisatie" value="${esc(v.organisatie)}"></div>
          <div class="veld breed"><label class="vereist">Deskundigheid</label>
            <div class="vinklijst">${Object.entries(eco.DESKUNDIGHEID).map(([k, l]) => `<label class="vink"><input type="radio" name="deskundigheid" value="${k}" data-v="deskundigheid" ${v.deskundigheid === k ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></div>
          <div class="veld breed" id="aansturing" ${v.deskundigheid === 'gedelegeerd' ? '' : 'hidden'}><label for="v-aan" class="vereist">Onder aansturing van (ecologisch deskundige)</label>
            <input id="v-aan" data-v="aansturing" value="${esc(v.aansturing)}"></div>
        </div>
      </section>
      <section class="kaart">
        <h2>Controles</h2>
        <p class="hulptekst">Zorgvuldig handelen volgens de algemene maatregelen B&O (tabel 4.2) en de maatregelen voor vogels (tabel 4.13–4.16).</p>
        <div class="controles">${eco.CONTROLES.map((c) => `<div class="controleregel"><span>${esc(c.tekst)}</span>
          ${segment(`c-${c.id}`, v.controles[c.id] ?? '', [['ja', 'Ja'], ['nee', 'Nee'], ['nvt', 'N.v.t.']], `data-c="${c.id}"`)}</div>`).join('')}</div>
      </section>
      <section>
        <div class="mtussen"><h2>Waarnemingen</h2><button type="button" class="knop" id="waarneming-plus">＋ Waarneming</button></div>
        <div id="waarnemingen"></div>
        <label class="vink" id="geen-waarnemingen"><input type="checkbox" data-v="geenWaarnemingen" ${v.geenWaarnemingen ? 'checked' : ''}>
          <span><strong>Geen beschermde soorten of broedgevallen aangetroffen</strong></span></label>
      </section>
      <section class="kaart">
        <h2>Besluit</h2>
        ${segment('besluit', v.besluit, Object.entries(eco.BESLUIT).map(([k, x]) => [k, x.label]), 'data-v="besluit"')}
        <div class="velden" style="margin-top:.75rem">
          <div class="veld breed" id="voorwaarden-veld"><label for="v-voorw">Voorwaarden / maatregelen voor de uitvoerder</label>
            <textarea id="v-voorw" data-v="voorwaarden" placeholder="bijv. zone van 25 m rond nest (markering) ontzien; van binnen naar buiten maaien; maaihoogte min. 10 cm">${esc(v.voorwaarden)}</textarea></div>
          <div class="veld"><label for="v-geldig" class="vereist">Geldig t/m</label><input id="v-geldig" data-v="geldigTot" type="date" value="${esc(v.geldigTot)}">
            <small>De gedragscode noemt geen vaste termijn; houd die kort, zeker in het broedseizoen.</small></div>
          <div class="veld"><label>&nbsp;</label><label class="vink"><input type="checkbox" data-v="begeleiding" ${v.begeleiding ? 'checked' : ''}><span>Ecologische begeleiding tijdens uitvoering nodig</span></label></div>
          <div class="veld breed" id="begeleiding-veld" ${v.begeleiding ? '' : 'hidden'}><label for="v-beg">Wanneer / hoe begeleiden</label>
            <input id="v-beg" data-v="begeleidingToelichting" value="${esc(v.begeleidingToelichting)}"></div>
          <div class="veld breed"><label>Overzichtsfoto's</label><div id="algemene-fotos"></div></div>
        </div>
        <label class="vink"><input type="checkbox" data-v="ndff" ${v.ndff ? 'checked' : ''}><span>Waarnemingen worden doorgegeven aan de NDFF (stap 14)</span></label>
        <label class="vink" style="margin-top:.5rem"><input type="checkbox" data-v="verklaring" ${v.verklaring ? 'checked' : ''}>
          <span><strong>Verklaring</strong><small>Ik verklaar dat deze veldcheck naar waarheid is uitgevoerd conform het ecologisch werkprotocol en de Gedragscode Soortenbescherming Rijkswaterstaat 2025–2029.</small></span></label>
      </section>
      <div class="${mobiel ? 'mvoet' : 'formvoet kaart'}">
        ${mobiel ? '' : `<a class="knop" href="${terug}">Annuleren</a>`}
        <button class="knop" type="submit" data-status="concept">Concept</button>
        <button class="knop primair" type="submit" data-status="afgerond">✓ Afronden</button>
      </div>
    </form>`;

  const form = app.querySelector('#form');
  const $ = (s) => app.querySelector(s);
  const tekenObjecten = () => {
    const keuze = objecten.filter((o) => !v.objectIds.includes(o.id));
    $('#objecten').innerHTML = `<label class="vereist" style="font-weight:600;font-size:.9rem">Objecten / GIS-vlakken (${v.objectIds.length})</label>
      <ul class="objectchips">${v.objectIds.map((oid) => `<li>${objectNaam(objectMap.get(oid))}<button type="button" data-object-weg="${esc(oid)}" aria-label="Verwijderen">×</button></li>`).join('')}</ul>
      <select id="object-plus" aria-label="Object toevoegen"><option value="">＋ Object toevoegen…</option>${keuze.map((o) => optie(o.id, `${o.code} – ${o.naam}`)).join('')}</select>`;
  };
  const tekenWaarnemingen = () => {
    $('#waarnemingen').innerHTML = v.waarnemingen.map((w, i) => `
      <div class="gebrek" style="border-left-color:#33a02c">
        <div class="gebrek-kop"><h3 style="margin:0">Waarneming ${i + 1}</h3>
          <button type="button" class="knop klein gevaar" data-w-weg="${i}" aria-label="Verwijderen">🗑</button></div>
        <div class="velden">
          <div class="veld"><label class="vereist">Soortgroep</label><select data-w="${i}" data-veld="soortgroep"><option value="">– kies –</option>${eco.SOORTGROEPEN.map((s) => optie(s, s, w.soortgroep)).join('')}</select></div>
          <div class="veld"><label class="vereist">Soort</label><input data-w="${i}" data-veld="soort" value="${esc(w.soort)}" placeholder="bijv. Wilde eend"></div>
          <div class="veld breed"><label class="vereist">Wat is waargenomen</label><select data-w="${i}" data-veld="type"><option value="">– kies –</option>${eco.WAARNEMINGTYPEN.map((s) => optie(s, s, w.type)).join('')}</select></div>
          <div class="veld"><label>Aantal</label><input data-w="${i}" data-veld="aantal" type="number" min="1" inputmode="numeric" value="${esc(w.aantal ?? '')}"></div>
          <div class="veld"><label>Bescherming</label><select data-w="${i}" data-veld="bescherming"><option value="">–</option>${eco.BESCHERMING.map((s) => optie(s, s, w.bescherming)).join('')}</select></div>
          <div class="veld"><label>Verstoringsvrije afstand (m)</label><input data-w="${i}" data-veld="afstand" type="number" min="0" inputmode="numeric" value="${esc(w.afstand ?? '')}"></div>
          <div class="veld"><label>&nbsp;</label><label class="vink"><input type="checkbox" data-w="${i}" data-veld="gemarkeerd" ${w.gemarkeerd ? 'checked' : ''}><span>Gemarkeerd in het veld</span></label></div>
          <div class="veld breed"><label>Locatie</label><div class="knoppen"><button type="button" class="knop" data-w-gps="${i}">📍 Huidige locatie</button>
            <small>${w.lat ? `${Number(w.lat).toFixed(6)}, ${Number(w.lng).toFixed(6)}${w.nauwkeurigheid ? ` (± ${w.nauwkeurigheid} m)` : ''}` : 'Nog niet vastgelegd'}</small></div></div>
          <div class="veld breed"><label>Toelichting</label><input data-w="${i}" data-veld="toelichting" value="${esc(w.toelichting ?? '')}"></div>
          <div class="veld breed"><label>Foto's</label>${fotoRij(w.fotos, `w${i}`)}</div>
        </div></div>`).join('');
    $('#geen-waarnemingen').hidden = v.waarnemingen.length > 0;
  };
  const tekenAlgemeen = () => { $('#algemene-fotos').innerHTML = fotoRij(fotos, 'alg'); };
  const zichtbaarheid = () => {
    $('#ewp').hidden = !v.routeGedragscode;
    $('#aansturing').hidden = v.deskundigheid !== 'gedelegeerd';
    $('#voorwaarden-veld').hidden = v.besluit === 'vrij' || !v.besluit;
    $('#begeleiding-veld').hidden = !v.begeleiding;
  };
  tekenObjecten(); tekenWaarnemingen(); tekenAlgemeen(); zichtbaarheid();
  const fotoLijst = (k) => (k === 'alg' ? fotos : v.waarnemingen[Number(k.slice(1))].fotos);

  form.addEventListener('input', (e) => {
    formulierGewijzigd = true;
    const el = e.target;
    const waarde = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.v) v[el.dataset.v] = waarde;
    if (el.dataset.c) v.controles[el.dataset.c] = waarde;
    if (el.dataset.w !== undefined) v.waarnemingen[Number(el.dataset.w)][el.dataset.veld] = waarde;
    zichtbaarheid();
  });
  form.addEventListener('change', async (e) => {
    if (e.target.id === 'object-plus' && e.target.value) {
      v.objectIds.push(e.target.value);
      tekenObjecten();
      return;
    }
    const k = e.target.dataset.fotoBij;
    if (!k || !e.target.files?.length) return;
    try {
      for (const f of [...e.target.files]) fotoLijst(k).push({ id: nieuwId(), data: await verkleinFoto(f) });
    } catch (fout) { melding(fout.message, 'fout'); }
    if (k === 'alg') tekenAlgemeen(); else tekenWaarnemingen();
  });
  form.addEventListener('click', (e) => {
    const ow = e.target.closest('[data-object-weg]');
    if (ow) { v.objectIds = v.objectIds.filter((x) => x !== ow.dataset.objectWeg); tekenObjecten(); return; }
    const fw = e.target.closest('[data-foto-weg]');
    if (fw) {
      const [k, n] = fw.dataset.fotoWeg.split(':');
      fotoLijst(k).splice(Number(n), 1);
      if (k === 'alg') tekenAlgemeen(); else tekenWaarnemingen();
      return;
    }
    const ww = e.target.closest('[data-w-weg]');
    if (ww) { v.waarnemingen.splice(Number(ww.dataset.wWeg), 1); tekenWaarnemingen(); return; }
    const gps = e.target.closest('[data-w-gps]');
    if (gps) {
      navigator.geolocation?.getCurrentPosition((pos) => {
        Object.assign(v.waarnemingen[Number(gps.dataset.wGps)], {
          lat: pos.coords.latitude, lng: pos.coords.longitude, nauwkeurigheid: Math.round(pos.coords.accuracy),
        });
        tekenWaarnemingen();
      }, (fout) => melding(`Locatie niet beschikbaar: ${fout.message}`, 'fout'), { enableHighAccuracy: true, timeout: 15000 });
    }
  });
  $('#waarneming-plus').onclick = () => {
    v.waarnemingen.push({ id: nieuwId(), soortgroep: '', soort: '', type: '', aantal: '', bescherming: '', afstand: '', gemarkeerd: false, toelichting: '', fotos: [] });
    v.geenWaarnemingen = false;
    tekenWaarnemingen();
    $('#waarnemingen').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const status = e.submitter?.dataset.status ?? 'concept';
    if (!v.objectIds.length) return melding('Kies minstens één object of GIS-vlak.', 'fout');
    if (status === 'afgerond') {
      const fouten = eco.controleer(v);
      if (!v.waarnemingen.length && !v.geenWaarnemingen) fouten.unshift('Leg waarnemingen vast of vink aan dat er geen beschermde soorten zijn aangetroffen.');
      if (fouten.length) return melding(`${fouten[0]}${fouten.length > 1 ? ` (en ${fouten.length - 1} meer)` : ''}`, 'fout');
    }
    const vid = id ?? nieuwId();
    const nu = new Date().toISOString();
    const pid = bestaand?.projectId ?? projectId();
    await bewaarFotoLijsten([fotos, ...v.waarnemingen.map((w) => w.fotos)], origineel, { vrijgaveId: vid, projectId: pid, datum: nu });
    await db.bewaar('vrijgaven', {
      ...v, id: vid, projectId: pid, status, fotoIds: fotos.map((f) => f.id),
      waarnemingen: v.waarnemingen.map(({ fotos: f, ...w }) => ({ ...w, fotoIds: f.map((x) => x.id) })),
      aangemaakt: bestaand?.aangemaakt ?? nu, gewijzigd: nu,
    });
    instelling.schrijf('ecoDeskundigheid', v.deskundigheid);
    if (v.deskundige) instelling.schrijf('inspecteur', v.deskundige);
    formulierGewijzigd = false;
    melding(status === 'afgerond' ? `Vrijgave afgerond: ${eco.BESLUIT[v.besluit].label}` : 'Concept opgeslagen');
    ga(pakket ? (mobiel ? `#/m/pakket/${pakket.id}` : `#/werkpakketten/${pakket.id}`) : (mobiel ? `#/m/vrijgave/${vid}` : `#/vrijgaven/${vid}`));
  };
}

async function vrijgaveDetail(id, { mobiel = false } = {}) {
  const v = await db.haal('vrijgaven', id);
  if (!v) {
    app.innerHTML = leegKaart('Vrijgave niet gevonden.', `<a class="knop" href="${mobiel ? '#/' : '#/vrijgaven'}">Terug</a>`);
    return;
  }
  const objecten = await inProject('objecten');
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  const besluit = eco.BESLUIT[v.besluit];
  const controleTekst = { ja: '✓ Ja', nee: '✗ Nee', nvt: 'N.v.t.' };
  const waarnemingen = await Promise.all((v.waarnemingen ?? []).map(async (w) => `<tr>
    <td>${esc(w.soortgroep)}</td><td><strong>${esc(w.soort)}</strong>${w.aantal ? ` (${esc(w.aantal)})` : ''}</td><td>${esc(w.type)}</td><td>${esc(w.bescherming || '–')}</td>
    <td>${w.afstand ? `${esc(w.afstand)} m` : '–'}${w.gemarkeerd ? ' · gemarkeerd' : ''}</td>
    <td>${w.lat ? `${Number(w.lat).toFixed(5)}, ${Number(w.lng).toFixed(5)}` : '–'}</td><td>${esc(w.toelichting ?? '')}${w.fotoIds?.length ? await fotosHtml(w.fotoIds) : ''}</td></tr>`));
  const bewerk = mobiel ? `#/m/vrijgave/${esc(id)}/bewerken` : `#/vrijgaven/${esc(id)}/bewerken`;
  app.innerHTML = `
    ${mobiel ? `<div class="mkop"><a href="#/" class="mterug" aria-label="Terug">←</a><div><small>🌿 Flora & fauna vrijgave</small><h1>${datumNL(v.datum)} · ${esc(v.werkzaamheid || '')}</h1></div></div>`
    : `<div class="paginakop"><div><p><a href="#/vrijgaven">← Flora & fauna</a></p><h1>Flora- en fauna-vrijgave · ${datumNL(v.datum)}</h1>
      <p>${esc(v.werkzaamheid || '')} · ${esc(v.activiteit || '')}</p></div>
      <div class="knoppen geen-print"><button class="knop" onclick="window.print()">Afdrukken / PDF</button><a class="knop" href="${bewerk}">Bewerken</a>
        <button class="knop gevaar" id="verwijder">Verwijderen</button></div></div>`}
    <section class="kaart besluitkaart" style="border-left:8px solid ${besluit?.kleur ?? '#8a96a3'}">
      <div class="pakketkop"><h2 style="margin:0">${esc(besluit?.label ?? 'Nog geen besluit')}</h2>${vrijgaveLabel(v)}</div>
      ${v.voorwaarden ? `<p style="white-space:pre-wrap;margin:.5rem 0 0"><strong>Voorwaarden:</strong> ${esc(v.voorwaarden)}</p>` : ''}
      <p style="margin:.5rem 0 0">Geldig t/m <strong>${datumNL(v.geldigTot)}</strong>${v.begeleiding ? ` · ecologische begeleiding nodig${v.begeleidingToelichting ? `: ${esc(v.begeleidingToelichting)}` : ''}` : ''}</p>
      ${mobiel ? `<div class="knoppen" style="margin-top:.75rem"><a class="knop" href="${bewerk}">Bewerken</a></div>` : ''}
    </section>
    <div class="raster-2">
      <section class="kaart"><h2>Gebied en werkzaamheden</h2><dl class="gegevens">
        <dt>Objecten</dt><dd>${(v.objectIds ?? []).map((o) => objectNaam(objectMap.get(o))).join('<br>')}</dd>
        <dt>Werkzaamheden</dt><dd>${esc(v.werkzaamheid || '–')}</dd><dt>Activiteit</dt><dd>${esc(v.activiteit || '–')}</dd>
        <dt>Uitvoering</dt><dd>${datumNL(v.uitvoeringVan)} – ${datumNL(v.uitvoeringTot)}</dd>
        <dt>Route</dt><dd>${v.routeGedragscode ? `Gedragscode · EWP ${esc(v.ewpKenmerk || '–')} ${esc(v.ewpDatum || '')} · ${v.ewpGeaccepteerd ? 'geaccepteerd' : 'niet geaccepteerd'} · ${v.ewpOpLocatie ? 'op locatie' : 'niet op locatie'}` : 'Zorgplicht / vergunning'}</dd>
      </dl></section>
      <section class="kaart"><h2>Veldcheck</h2><dl class="gegevens">
        <dt>Datum en tijd</dt><dd>${datumNL(v.datum)} ${esc(v.starttijd || '')}${v.eindtijd ? `–${esc(v.eindtijd)}` : ''}</dd>
        <dt>Weer</dt><dd>${esc(v.weer || '–')}${v.temperatuur !== '' && v.temperatuur != null ? ` · ${esc(v.temperatuur)} °C` : ''}</dd>
        <dt>Deskundige</dt><dd>${esc(v.deskundige || '–')}${v.organisatie ? ` · ${esc(v.organisatie)}` : ''}</dd>
        <dt>Deskundigheid</dt><dd>${esc(eco.DESKUNDIGHEID[v.deskundigheid] ?? '–')}${v.aansturing ? `<br>Onder aansturing van ${esc(v.aansturing)}` : ''}</dd>
        <dt>NDFF</dt><dd>${v.ndff ? 'Wordt doorgegeven' : '–'}</dd>
        <dt>Verklaring</dt><dd>${v.verklaring ? '✓ Afgegeven' : '–'}</dd>
      </dl></section>
    </div>
    <section class="kaart"><h2>Controles</h2><div class="tabelhouder"><table><tbody>
      ${eco.CONTROLES.map((c) => `<tr><td>${esc(c.tekst)}</td><td>${controleTekst[v.controles?.[c.id]] ?? '–'}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="kaart"><h2>Waarnemingen</h2>${waarnemingen.length ? `<div class="tabelhouder"><table>
      <thead><tr><th>Groep</th><th>Soort</th><th>Waarneming</th><th>Bescherming</th><th>Afstand</th><th>Locatie</th><th>Toelichting</th></tr></thead>
      <tbody>${waarnemingen.join('')}</tbody></table></div>` : '<p class="leeg">Geen beschermde soorten of broedgevallen aangetroffen.</p>'}
      ${v.fotoIds?.length ? await fotosHtml(v.fotoIds) : ''}</section>
    <section class="kaart"><h2>Logboek</h2>
      <p class="hulptekst">Begeleiding, bijzonderheden en afwijkingen tijdens de uitvoering (werkproces stap 10). Bewaren tot minimaal 2 jaar na afloop.</p>
      ${(v.logboek ?? []).length ? `<ul class="logboek">${v.logboek.map((l) => `<li><small>${datumNL(l.datum)} ${esc(l.tijd ?? '')} · ${esc(l.door ?? '')}</small>
        <strong>${esc(l.soort)}</strong><span>${esc(l.tekst)}</span></li>`).join('')}</ul>` : '<p class="mleeg">Nog geen logboekregels.</p>'}
      <form id="logform" class="velden geen-print" novalidate style="margin-top:.75rem">
        <div class="veld"><label for="l-soort">Soort</label><select id="l-soort">${eco.LOGBOEKSOORTEN.map((s) => optie(s, s)).join('')}</select></div>
        <div class="veld breed"><label for="l-tekst">Omschrijving</label><textarea id="l-tekst" style="min-height:60px"></textarea></div>
        <div class="veld"><button class="knop primair" type="submit">＋ Toevoegen aan logboek</button></div>
      </form>
      <p class="hulptekst geen-print">Bij een onverwacht aangetroffen soort of mogelijke overtreding van de Ow: werk stilleggen, de ecologisch deskundige raadplegen en de contractmanager RWS informeren.</p>
    </section>`;

  app.querySelector('#logform').onsubmit = async (e) => {
    e.preventDefault();
    const tekst = app.querySelector('#l-tekst').value.trim();
    if (!tekst) return melding('Vul een omschrijving in.', 'fout');
    const actueel = await db.haal('vrijgaven', id);
    actueel.logboek = [...(actueel.logboek ?? []), {
      id: nieuwId(), datum: vandaag(), tijd: nuTijd(), soort: app.querySelector('#l-soort').value, tekst,
      door: sync.sessie()?.gebruiker?.email || instelling.lees('inspecteur') || '',
    }];
    actueel.gewijzigd = new Date().toISOString();
    await db.bewaar('vrijgaven', actueel);
    melding('Toegevoegd aan logboek');
    router();
  };
  app.querySelector('#verwijder')?.addEventListener('click', async () => {
    if (!confirm('Deze vrijgave verwijderen? Het logboek hoort minimaal 2 jaar bewaard te blijven.')) return;
    for (const fid of [...(v.fotoIds ?? []), ...(v.waarnemingen ?? []).flatMap((w) => w.fotoIds ?? [])]) await db.verwijder('fotos', fid);
    await db.verwijder('vrijgaven', id);
    ga('#/vrijgaven');
  });
}

async function vrijgavenLijst() {
  const [vrijgaven, objecten] = await Promise.all([inProject('vrijgaven'), inProject('objecten')]);
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  vrijgaven.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Flora & fauna</h1><p>Ecologische vrijgaven (veldchecks) volgens de Gedragscode Soortenbescherming Rijkswaterstaat 2025–2029.</p></div>
      <div class="knoppen"><button class="knop" id="export">CSV exporteren</button><a class="knop primair" href="#/vrijgaven/nieuw">+ Nieuwe vrijgave</a></div>
    </div>
    <div class="filters"><select id="filter" aria-label="Status"><option value="">Alle</option>${Object.entries(VRIJGAVE_STATUS).map(([k, s]) => optie(k, s.label)).join('')}</select></div>
    <div class="kaart" style="padding:0"><div class="tabelhouder"><table>
      <thead><tr><th>Datum</th><th>Objecten</th><th>Werkzaamheden</th><th class="verberg-mobiel">Deskundige</th><th>Waarnemingen</th><th>Status</th></tr></thead>
      <tbody id="rijen"></tbody></table></div></div>`;
  const toon = () => {
    const f = app.querySelector('#filter').value;
    const rijen = vrijgaven.filter((v) => !f || eco.geldigheid(v, vandaag()) === f);
    app.querySelector('#rijen').innerHTML = rijen.length ? rijen.map((v) => `
      <tr class="klikbaar" data-href="#/vrijgaven/${esc(v.id)}"><td>${datumNL(v.datum)}</td>
        <td>${(v.objectIds ?? []).slice(0, 3).map((o) => esc(objectMap.get(o)?.code ?? '?')).join(', ')}${(v.objectIds ?? []).length > 3 ? ` +${v.objectIds.length - 3}` : ''}</td>
        <td>${esc(v.werkzaamheid || '–')}</td><td class="verberg-mobiel">${esc(v.deskundige || '–')}</td><td>${(v.waarnemingen ?? []).length}</td><td>${vrijgaveLabel(v)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="leeg">Nog geen vrijgaven.</td></tr>';
  };
  app.querySelector('#filter').onchange = toon;
  toon();
  app.querySelector('#export').onclick = () => {
    const rijen = [['Datum', 'Objecten', 'Werkzaamheden', 'Activiteit', 'EWP', 'Deskundige', 'Besluit', 'Voorwaarden', 'Geldig t/m', 'Status',
      'Soortgroep', 'Soort', 'Waarneming', 'Bescherming', 'Aantal', 'Afstand (m)', 'Breedtegraad', 'Lengtegraad']];
    for (const v of vrijgaven) {
      const basis = [v.datum, (v.objectIds ?? []).map((o) => objectMap.get(o)?.code).join(', '), v.werkzaamheid, v.activiteit, v.ewpKenmerk, v.deskundige,
        eco.BESLUIT[v.besluit]?.label ?? '', v.voorwaarden, v.geldigTot, VRIJGAVE_STATUS[eco.geldigheid(v, vandaag())].label];
      if (!(v.waarnemingen ?? []).length) rijen.push(basis);
      for (const w of v.waarnemingen ?? []) rijen.push([...basis, w.soortgroep, w.soort, w.type, w.bescherming, w.aantal, w.afstand, w.lat ?? '', w.lng ?? '']);
    }
    download(`flora-fauna-vrijgaven-${vandaag()}.csv`, csv(rijen), 'text/csv;charset=utf-8');
  };
}

// ---------------------------------------------------------------------------
// Instellingen, back-up en import
// ---------------------------------------------------------------------------
async function instellingen() {
  const { objecten, inspecties } = await laadAlles();
  const fotos = await db.alle('fotos');
  let opslag = '';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) opslag = `${(est.usage / 1048576).toFixed(1)} MB gebruikt`;
  } catch { /* niet ondersteund */ }

  app.innerHTML = `
    <div class="paginakop"><div><h1>Instellingen</h1><p>Gegevens staan op dit apparaat en werken ook offline. Log in om ze te synchroniseren tussen pc en telefoon.</p></div></div>
    <section class="kaart" id="account"></section>
    <div class="raster-2">
      <form class="kaart" id="voorkeuren">
        <h2>Voorkeuren</h2>
        <div class="velden">
          <div class="veld breed"><label for="f-inspecteur">Standaard inspecteur</label>
            <input id="f-inspecteur" name="inspecteur" value="${esc(instelling.lees('inspecteur'))}"></div>
          <div class="veld breed"><label for="f-organisatie">Organisatie (in rapporten)</label>
            <input id="f-organisatie" name="organisatie" value="${esc(instelling.lees('organisatie'))}"></div>
          <div class="veld breed"><label for="f-thema">Kleurthema</label>
            <select id="f-thema" name="thema">
              ${optie('licht', 'Licht (standaard)', instelling.lees('thema', 'licht'))}
              ${optie('donker', 'Donker', instelling.lees('thema', 'licht'))}
              ${optie('systeem', 'Volg instelling van het apparaat', instelling.lees('thema', 'licht'))}
            </select></div>
          <div class="veld breed"><label for="f-weergave">Weergave op dit apparaat</label>
            <select id="f-weergave" name="weergave">
              ${optie('auto', 'Automatisch (telefoon = veldversie, pc = volledige versie)', instelling.lees('weergave', 'auto'))}
              ${optie('mobiel', 'Altijd veldversie (werkzaamheden en schouw)', instelling.lees('weergave', 'auto'))}
              ${optie('volledig', 'Altijd volledige versie met dashboard', instelling.lees('weergave', 'auto'))}
            </select></div>
        </div>
        <div class="formvoet"><button class="knop primair" type="submit">Opslaan</button></div>
      </form>
      <section class="kaart">
        <h2>Gegevens</h2>
        <dl class="gegevens">
          <dt>Objecten</dt><dd>${objecten.length}</dd><dt>Inspecties</dt><dd>${inspecties.length}</dd>
          <dt>Foto's</dt><dd>${fotos.length}</dd>${opslag ? `<dt>Opslag</dt><dd>${opslag}</dd>` : ''}
        </dl>
        <p><small>Maak regelmatig een back-up: gegevens in de browser kunnen verloren gaan als de browsergegevens worden gewist.</small></p>
        <div class="knoppen">
          <button class="knop primair" id="backup">Back-up downloaden</button>
          <label class="knop fotoknop">Back-up importeren<input type="file" accept=".json,application/json" id="import"></label>
        </div>
      </section>
      <section class="kaart">
        <h2>Voorbeelddata</h2>
        <p>Voeg een aantal voorbeeldobjecten (bruggen, viaduct, duiker, kademuur) met inspecties toe.</p>
        <button class="knop" id="demo">Voorbeelddata laden</button>
      </section>
      <section class="kaart">
        <h2>Gegevens op dit apparaat wissen</h2>
        <p>Verwijdert alle objecten, inspecties en foto's van dit apparaat. Gegevens die al online staan blijven bewaard
        en worden bij de volgende synchronisatie opnieuw opgehaald. Nog niet verstuurde wijzigingen gaan verloren.</p>
        <button class="knop gevaar" id="wis">Lokale gegevens wissen</button>
      </section>
      <section class="kaart breed">
        <h2>Conditieschaal NEN 2767</h2>
        <div class="tabelhouder"><table><tbody>
          ${Object.entries(CONDITIES).map(([s, c]) => `<tr><td>${scoreLabel(Number(s))}</td><td>${esc(c.omschrijving)}</td></tr>`).join('')}
        </tbody></table></div>
        <p><small>De conditie van een gebrek wordt indicatief bepaald uit ernst (gering/serieus/ernstig), intensiteit (begin-/gevorderd/eindstadium)
        en omvang (% van het bouwdeel). Je kunt per gebrek de conditie ook handmatig vaststellen. De conditie van de inspectie is die van het maatgevende gebrek.</small></p>
      </section>
    </div>`;

  app.querySelector('#voorkeuren').onsubmit = (e) => {
    e.preventDefault();
    const d = formulierData(e.target);
    instelling.schrijf('inspecteur', d.inspecteur);
    instelling.schrijf('organisatie', d.organisatie);
    instelling.schrijf('thema', d.thema);
    document.documentElement.dataset.thema = d.thema;
    const weergaveGewijzigd = d.weergave !== instelling.lees('weergave', 'auto');
    instelling.schrijf('weergave', d.weergave);
    melding('Voorkeuren opgeslagen');
    if (weergaveGewijzigd) ga(isMobiel() ? '#/' : '#/instellingen');
  };
  app.querySelector('#backup').onclick = async () => {
    download(`inspectie-backup-${vandaag()}.json`, JSON.stringify(await db.exporteer()), 'application/json');
  };
  app.querySelector('#import').onchange = async (e) => {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    try {
      const data = JSON.parse(await bestand.text());
      const vervangen = confirm('Huidige gegevens vervangen door de back-up?\n\nOK = vervangen, Annuleren = samenvoegen.');
      await db.importeer(data, { vervangen });
      if (vervangen) sync.resetOphalen();
      melding('Back-up geïmporteerd');
      router();
    } catch (fout) {
      melding(`Import mislukt: ${fout.message}`, 'fout');
    }
  };
  app.querySelector('#demo').onclick = laadDemo;
  toonAccount(app.querySelector('#account'));
  app.querySelector('#wis').onclick = async () => {
    const wachtend = await db.sync.aantalInWachtrij();
    const waarschuwing = wachtend ? `\n\nLet op: ${wachtend} wijziging(en) zijn nog niet verstuurd en gaan verloren.` : '';
    if (!confirm(`Alle gegevens op dit apparaat wissen?${waarschuwing}`)) return;
    await db.wisLokaal();
    sync.resetOphalen();
    melding('Lokale gegevens gewist');
    sync.synchroniseer();
    ga('#/');
  };
}

// ---------------------------------------------------------------------------
// Account en synchronisatie
// ---------------------------------------------------------------------------
const FASE_TEKST = {
  uit: 'Alleen lokaal',
  uitgelogd: 'Niet ingelogd',
  offline: 'Offline',
  bezig: 'Synchroniseren…',
  ok: 'Gesynchroniseerd',
  fout: 'Synchronisatiefout',
};

function syncIndicator(st) {
  const el = document.getElementById('syncstatus');
  if (!el) return;
  let tekst = FASE_TEKST[st.fase] ?? st.fase;
  if (st.wachtend && st.fase !== 'bezig') tekst = st.fase === 'ok' ? `${st.wachtend} te versturen` : `${tekst} · ${st.wachtend} wachtend`;
  el.textContent = tekst;
  el.dataset.fase = st.fase;
  el.dataset.wachtend = String(st.wachtend ?? 0);
  el.setAttribute('aria-label', tekst);
  el.title = st.fout || (st.laatsteSync ? `Laatst gesynchroniseerd: ${new Date(st.laatsteSync).toLocaleString('nl-NL')}` : tekst);
}

let stopAccountStatus = () => {};

function toonAccount(el) {
  stopAccountStatus();
  const s = sync.sessie();
  const { url, key } = sync.configuratie();

  if (!sync.isIngesteld()) {
    el.innerHTML = `
      <h2>Online synchronisatie instellen</h2>
      <p>Koppel de app aan je Supabase-project om gegevens te delen tussen pc en telefoon.
      Je vindt beide waarden in Supabase onder <em>Project Settings → API</em>.</p>
      <form id="verbinding" class="velden">
        <div class="veld"><label for="f-url">Project URL</label><input id="f-url" name="url" value="${esc(url)}" placeholder="https://xxxx.supabase.co" required></div>
        <div class="veld"><label for="f-key">Publishable / anon key</label><input id="f-key" name="key" value="${esc(key)}" required autocomplete="off">
          <small>Gebruik nooit de <em>service_role</em>- of <em>secret</em>-sleutel.</small></div>
        <div class="veld" style="justify-content:flex-end"><button class="knop primair" type="submit">Verbinden</button></div>
      </form>`;
    el.querySelector('#verbinding').onsubmit = (e) => {
      e.preventDefault();
      const d = formulierData(e.target);
      if (!/^https:\/\/.+/.test(d.url) || !d.key) return melding('Vul een geldige https-URL en sleutel in.', 'fout');
      sync.stelIn(d.url, d.key);
      toonAccount(el);
    };
    return;
  }

  if (!s) {
    el.innerHTML = `
      <h2>Inloggen voor synchronisatie</h2>
      <p>Log op pc én telefoon in met hetzelfde account. Je kunt ook zonder inloggen werken; wijzigingen worden dan
      verstuurd zodra je inlogt.</p>
      <form id="login" class="velden">
        <div class="veld"><label for="f-email">E-mailadres</label><input id="f-email" name="email" type="email" autocomplete="username" required></div>
        <div class="veld"><label for="f-wachtwoord">Wachtwoord</label><input id="f-wachtwoord" name="wachtwoord" type="password" autocomplete="current-password" minlength="6" required></div>
        <div class="veld" style="justify-content:flex-end"><div class="knoppen">
          <button class="knop primair" type="submit" data-actie="in">Inloggen</button>
          <button class="knop" type="submit" data-actie="nieuw">Account aanmaken</button></div></div>
      </form>
      <p><small>Verbonden met ${esc(url)} · <a href="#" id="ontkoppel">wijzigen</a></small></p>
      <p id="loginfout" class="label-status verlopen" hidden></p>`;
    const fout = el.querySelector('#loginfout');
    el.querySelector('#ontkoppel').onclick = (e) => {
      e.preventDefault();
      sync.stelIn('', '');
      toonAccount(el);
    };
    el.querySelector('#login').onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      if (!form.checkValidity()) return form.reportValidity();
      const d = formulierData(form);
      const knoppen = form.querySelectorAll('button');
      knoppen.forEach((k) => { k.disabled = true; });
      fout.hidden = true;
      try {
        if (e.submitter?.dataset.actie === 'nieuw') {
          const r = await sync.registreren(d.email, form.elements.wachtwoord.value);
          if (r.bevestigen) {
            el.innerHTML = `<h2>Bevestig je e-mailadres</h2><p>We hebben een bevestigingsmail gestuurd naar <strong>${esc(d.email)}</strong>.
              Klik op de link in die mail en log daarna hier in.</p><button class="knop" id="terug">Naar inloggen</button>`;
            el.querySelector('#terug').onclick = () => toonAccount(el);
            return;
          }
        } else {
          await sync.inloggen(d.email, form.elements.wachtwoord.value);
        }
        melding('Ingelogd');
        toonAccount(el);
      } catch (err) {
        fout.textContent = err instanceof TypeError ? 'Geen verbinding met de server.' : err.message;
        fout.hidden = false;
      } finally {
        knoppen.forEach((k) => { k.disabled = false; });
      }
    };
    return;
  }

  el.innerHTML = `
    <div class="paginakop" style="margin-bottom:.5rem"><h2 style="margin:0">Account en synchronisatie</h2>
      <div class="knoppen"><button class="knop primair" id="nu">Nu synchroniseren</button><button class="knop" id="uit">Uitloggen</button></div></div>
    <dl class="gegevens">
      <dt>Ingelogd als</dt><dd>${esc(s.gebruiker?.email ?? '–')}</dd>
      <dt>Rol</dt><dd id="st-rol">–</dd>
      <dt>Status</dt><dd id="st-fase"></dd>
      <dt>Te versturen</dt><dd id="st-wachtend"></dd>
      <dt>Laatste synchronisatie</dt><dd id="st-tijd"></dd>
    </dl>
    <p id="st-fout" class="label-status verlopen" hidden style="white-space:normal;margin-top:.75rem"></p>
    <p id="st-team" class="label-status binnenkort" hidden style="white-space:normal;margin-top:.75rem"></p>`;
  el.querySelector('#nu').onclick = () => sync.synchroniseer();
  el.querySelector('#uit').onclick = async () => {
    const wachtend = await db.sync.aantalInWachtrij();
    if (wachtend && !confirm(`Er zijn nog ${wachtend} wijziging(en) niet verstuurd. Ze blijven op dit apparaat en worden verstuurd bij de volgende keer inloggen. Toch uitloggen?`)) return;
    await sync.uitloggen();
    toonAccount(el);
  };
  stopAccountStatus = sync.opStatus((st) => {
    if (!el.isConnected) { stopAccountStatus(); return; }
    if (st.fase === 'uitgelogd' && !sync.sessie()) { toonAccount(el); return; }
    el.querySelector('#st-fase').textContent = FASE_TEKST[st.fase] ?? st.fase;
    el.querySelector('#st-wachtend').textContent = String(st.wachtend);
    el.querySelector('#st-tijd').textContent = st.laatsteSync ? new Date(st.laatsteSync).toLocaleString('nl-NL') : '–';
    const f = el.querySelector('#st-fout');
    f.textContent = st.fout;
    f.hidden = !st.fout;
  });
  if (navigator.onLine) {
    sync.haalRolOp().then((rol) => {
      const t = el.querySelector('#st-team');
      const r = el.querySelector('#st-rol');
      if (r) r.textContent = { beheerder: 'Beheerder (alle projecten)', lid: 'Projectlid', geen: 'Nog geen toegang' }[rol] ?? rol;
      if (!t || rol !== 'geen') return;
      t.textContent = `Je account heeft nog geen toegang. Vraag de beheerder om ${s.gebruiker?.email ?? 'je e-mailadres'} toe te voegen aan een project.`;
      t.hidden = false;
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Globale interacties
// ---------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const img = e.target.closest('img[data-lichtbak]');
  if (img) {
    const bak = document.createElement('div');
    bak.className = 'lichtbak';
    bak.innerHTML = `<img src="${esc(img.src)}" alt="Vergrote foto">`;
    bak.onclick = () => bak.remove();
    document.body.append(bak);
    return;
  }
  const rij = e.target.closest('tr[data-href]');
  if (rij && !e.target.closest('a, button')) location.hash = rij.dataset.href;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelector('.lichtbak')?.remove();
});

function offlineMelding() {
  let el = document.querySelector('.melding-offline');
  if (navigator.onLine) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.className = 'melding-offline';
    el.textContent = 'Je bent offline. Alles wordt op dit apparaat bewaard en verstuurd zodra je weer verbinding hebt. De kaart is niet beschikbaar.';
    document.querySelector('.kop').after(el);
  }
}
window.addEventListener('online', offlineMelding);
window.addEventListener('offline', offlineMelding);
offlineMelding();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch((fout) => console.warn('Service worker niet geregistreerd', fout));
}

sync.opStatus(syncIndicator);
sync.start({
  // Nieuwe gegevens van een ander apparaat: scherm verversen, behalve tijdens het invullen van een formulier.
  naOphalen: async () => {
    await migreerZonderProject();
    if (!projectId()) {
      const eerste = (await zichtbareProjecten())[0];
      if (eerste) kiesProject(eerste.id);
    }
    if (!/\/(nieuw|bewerken)/.test(location.hash) && !formulierGewijzigd) router();
  },
});
migreerZonderProject().finally(router);
