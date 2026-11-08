import * as db from './db.js';
import {
  CONDITIES, ERNST, INTENSITEIT, URGENTIES, OMVANG_KLASSEN,
  gebrekScore, inspectieScore, volgendeInspectie, planningStatus, omvangKlasse,
} from './nen2767.js';
import { OBJECTTYPEN, MATERIALEN, INSPECTIESOORTEN, BOUWDELEN, GEBREKEN, WEER } from './catalogus.js';
import {
  esc, nieuwId, vandaag, datumNL, euro, optie, formulierData, verkleinFoto, csv, download, melding,
} from './utils.js';
import { demoData } from './demo.js';

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
  [/^\/$/, 'dashboard', dashboard],
  [/^\/objecten$/, 'objecten', objectenLijst],
  [/^\/objecten\/nieuw$/, 'objecten', () => objectFormulier()],
  [/^\/objecten\/([^/]+)\/bewerken$/, 'objecten', objectFormulier],
  [/^\/objecten\/([^/]+)$/, 'objecten', objectDetail],
  [/^\/inspecties$/, 'inspecties', inspectiesLijst],
  [/^\/inspecties\/nieuw$/, 'inspecties', (_, q) => inspectieFormulier(null, q.get('object'))],
  [/^\/inspecties\/([^/]+)\/bewerken$/, 'inspecties', inspectieFormulier],
  [/^\/inspecties\/([^/]+)\/rapport$/, 'inspecties', inspectieRapport],
  [/^\/inspecties\/([^/]+)$/, 'inspecties', inspectieDetail],
  [/^\/maatregelen$/, 'maatregelen', maatregelen],
  [/^\/kaart$/, 'kaart', kaart],
  [/^\/instellingen$/, 'instellingen', instellingen],
];

let formulierGewijzigd = false;

async function router() {
  const [pad, zoek = ''] = (location.hash.slice(1) || '/').split('?');
  const query = new URLSearchParams(zoek);
  const route = ROUTES.find(([re]) => re.test(pad));
  formulierGewijzigd = false;
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
  const [objecten, inspecties] = await Promise.all([db.alle('objecten'), db.alle('inspecties')]);
  objecten.sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  inspecties.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  const status = new Map(objecten.map((o) => [o.id, objectStatus(o, inspecties)]));
  return { objecten, inspecties, objectMap, status };
}

function objectStatus(object, inspecties) {
  const laatste = inspecties
    .filter((i) => i.objectId === object.id && i.status === 'afgerond')
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)))[0];
  if (!laatste) return { laatste: null, conditie: null, volgende: null, planning: 'nooit' };
  const volgende = volgendeInspectie(laatste.datum, object.inspectieInterval);
  return { laatste, conditie: inspectieScore(laatste), volgende, planning: planningStatus(volgende, vandaag()) };
}

function alleMaatregelen(inspecties, objectMap) {
  const lijst = [];
  for (const insp of inspecties) {
    for (const g of insp.gebreken ?? []) {
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
  nooit: 'Nog niet geïnspecteerd', verlopen: 'Verlopen', binnenkort: 'Binnenkort', gepland: 'Op schema', onbekend: 'Onbekend',
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

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function dashboard() {
  const { objecten, inspecties, objectMap, status } = await laadAlles();
  if (objecten.length === 0) {
    app.innerHTML = `
      <div class="paginakop"><div><h1>Dashboard</h1><p>Overzicht van het areaal en de inspectieplanning.</p></div></div>
      <div class="kaart leeg">
        <h2>Welkom</h2>
        <p>Er zijn nog geen objecten geregistreerd. Begin met het registreren van een kunstwerk of object,<br>
        of laad voorbeelddata om de app te verkennen.</p>
        <div class="knoppen" style="justify-content:center">
          <a class="knop primair" href="#/objecten/nieuw">+ Object registreren</a>
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

  const verdeling = [1, 2, 3, 4, 5, 6].map((s) => ({ s, n: statussen.filter((x) => x.conditie === s).length }));
  const geen = statussen.filter((x) => !x.conditie).length;
  const max = Math.max(1, geen, ...verdeling.map((v) => v.n));

  const planning = objecten
    .map((o) => ({ o, s: status.get(o.id) }))
    .sort((a, b) => String(a.s.volgende ?? '0000').localeCompare(String(b.s.volgende ?? '0000')))
    .slice(0, 8);

  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Dashboard</h1><p>Overzicht van het areaal en de inspectieplanning.</p></div>
      <div class="knoppen">
        <a class="knop" href="#/objecten/nieuw">+ Object</a>
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
    </div>
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
              <td>${i.status === 'afgerond' ? scoreLabel(inspectieScore(i)) : statusLabel(i.status)}</td>
            </tr>`).join('')}
        </tbody></table></div>` : '<p class="leeg">Nog geen inspecties uitgevoerd.</p>'}
      </section>
    </div>
    <section class="kaart">
      <div class="paginakop" style="margin-bottom:.5rem"><h2 style="margin:0">Inspectieplanning</h2><a href="#/objecten">Alle objecten →</a></div>
      <div class="tabelhouder"><table>
        <thead><tr><th>Object</th><th class="verberg-mobiel">Type</th><th>Conditie</th><th>Laatste</th><th>Volgende</th><th>Status</th></tr></thead>
        <tbody>${planning.map(({ o, s }) => `
          <tr class="klikbaar" data-href="#/objecten/${esc(o.id)}">
            <td>${objectNaam(o)}</td><td class="verberg-mobiel">${esc(o.type)}</td><td>${scoreLabel(s.conditie)}</td>
            <td>${datumNL(s.laatste?.datum)}</td><td>${s.volgende ? datumNL(s.volgende) : 'Z.s.m.'}</td><td>${planningLabel(s.planning)}</td>
          </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

async function laadDemo() {
  await db.importeer(demoData());
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
        <td class="verberg-mobiel">${esc(o.bouwjaar || '–')}</td><td>${scoreLabel(s.conditie)}</td>
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
  const { inspecties, objectMap } = await laadAlles();
  const o = objectMap.get(id);
  if (!o) {
    app.innerHTML = leegKaart('Object niet gevonden.', '<a class="knop" href="#/objecten">Terug naar objecten</a>');
    return;
  }
  const s = objectStatus(o, inspecties);
  const eigen = inspecties.filter((i) => i.objectId === id);
  const maatregelenOpen = alleMaatregelen(eigen, objectMap).filter((m) => m.gebrek.maatregelStatus !== 'uitgevoerd');
  const heeftLocatie = o.lat !== '' && o.lat != null && o.lng !== '' && o.lng != null;

  app.innerHTML = `
    <div class="paginakop">
      <div><p><a href="#/objecten">← Objecten</a></p><h1>${esc(o.code)} – ${esc(o.naam)}</h1><p>${esc(o.type)}${o.materiaal ? ` · ${esc(o.materiaal)}` : ''}</p></div>
      <div class="knoppen">
        <a class="knop" href="#/objecten/${esc(id)}/bewerken">Bewerken</a>
        <button class="knop gevaar" id="verwijder">Verwijderen</button>
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
          <dt>Interval</dt><dd>${esc(o.inspectieInterval || 1)} jaar</dd>
          <dt>Volgende inspectie</dt><dd>${s.volgende ? datumNL(s.volgende) : 'Zo spoedig mogelijk'}</dd>
          <dt>Planning</dt><dd>${planningLabel(s.planning)}</dd>
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
            <td>${i.gebreken?.length ?? 0}</td><td>${scoreLabel(inspectieScore(i))}</td><td>${statusLabel(i.status)}</td>
          </tr>`).join('')}</tbody></table></div>` : '<p class="leeg">Er zijn nog geen inspecties voor dit object.</p>'}
    </section>
    ${maatregelenOpen.length ? `<section class="kaart">
      <h2>Openstaande maatregelen</h2>
      <div class="tabelhouder"><table>
        <thead><tr><th>Urgentie</th><th>Bouwdeel / gebrek</th><th>Maatregel</th><th>Raming</th></tr></thead>
        <tbody>${maatregelenOpen.map(({ gebrek: g, inspectie: i }) => `
          <tr class="klikbaar" data-href="#/inspecties/${esc(i.id)}"><td>${urgentieLabel(g.urgentie)}</td>
          <td>${esc(g.bouwdeel)} – ${esc(g.gebrek)}</td><td>${esc(g.maatregel || '–')}</td><td>${euro(g.kostenraming)}</td></tr>`).join('')}
        </tbody></table></div></section>` : ''}`;

  app.querySelector('#verwijder').onclick = async () => {
    const tekst = eigen.length
      ? `Object ${o.code} en de ${eigen.length} bijbehorende inspectie(s) inclusief foto's definitief verwijderen?`
      : `Object ${o.code} definitief verwijderen?`;
    if (!confirm(tekst)) return;
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
        ${veld('inspectieInterval', 'Inspectie-interval (jaren)', 'min="0.5" max="20" step="0.5" required', 'number', 'Bijv. 6 jaar voor een NEN 2767-conditiemeting.')}
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
    const objecten = await db.alle('objecten');
    if (objecten.some((x) => x.code.toLowerCase() === data.code.toLowerCase() && x.id !== id)) {
      return melding(`Objectcode ${data.code} is al in gebruik.`, 'fout');
    }
    const nu = new Date().toISOString();
    const opslaan = {
      ...o, ...data,
      id: id ?? nieuwId(),
      bouwjaar: data.bouwjaar ? Number(data.bouwjaar) : '',
      lengte: data.lengte ? Number(data.lengte) : '',
      breedte: data.breedte ? Number(data.breedte) : '',
      lat: data.lat ? Number(data.lat) : '',
      lng: data.lng ? Number(data.lng) : '',
      inspectieInterval: Number(data.inspectieInterval) || 1,
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
      <div class="knoppen"><a class="knop primair" href="#/inspecties/nieuw">+ Nieuwe inspectie</a></div>
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

  const filters = ['zoek', 'soort', 'status', 'jaar'].map((id) => app.querySelector(`#${id}`));
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
    app.querySelector('#rijen').innerHTML = rijen.length ? rijen.map((i) => `
      <tr class="klikbaar" data-href="#/inspecties/${esc(i.id)}">
        <td>${datumNL(i.datum)}</td><td>${objectNaam(objectMap.get(i.objectId))}</td>
        <td class="verberg-mobiel">${esc(i.soort)}</td><td class="verberg-mobiel">${esc(i.inspecteur)}</td>
        <td>${i.gebreken?.length ?? 0}</td><td>${scoreLabel(inspectieScore(i))}</td><td>${statusLabel(i.status)}</td>
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

async function inspectieFormulier(id, objectId) {
  const objecten = (await db.alle('objecten')).sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  const bestaand = id ? await db.haal('inspecties', id) : null;
  if (id && !bestaand) {
    app.innerHTML = leegKaart('Inspectie niet gevonden.', '<a class="knop" href="#/inspecties">Terug</a>');
    return;
  }
  if (!objecten.length) {
    app.innerHTML = leegKaart('Registreer eerst een object voordat je een inspectie vastlegt.',
      '<a class="knop primair" href="#/objecten/nieuw">+ Object registreren</a>');
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
      objectId: objectId ?? '', datum: vandaag(), inspecteur: instelling.lees('inspecteur'), soort: INSPECTIESOORTEN[0],
      weer: '', status: 'concept', samenvatting: '', fotos: [], gebreken: [],
    };
  const origineleFotoIds = new Set([...(bestaand?.fotoIds ?? []), ...(bestaand?.gebreken ?? []).flatMap((g) => g.fotoIds ?? [])]);
  const terug = bestaand ? `#/inspecties/${esc(id)}` : (objectId ? `#/objecten/${esc(objectId)}` : '#/inspecties');

  app.innerHTML = `
    <div class="paginakop"><div><p><a href="${terug}">← Terug</a></p>
      <h1>${bestaand ? 'Inspectie bewerken' : 'Nieuwe inspectie'}</h1></div>
      <div id="totaal"></div></div>
    <form id="form" novalidate>
      <section class="kaart">
        <h2>Algemeen</h2>
        <div class="velden">
          <div class="veld breed"><label for="f-object" class="vereist">Object</label>
            <select id="f-object" name="objectId" required><option value="">– kies een object –</option>
            ${objecten.map((o) => optie(o.id, `${o.code} – ${o.naam}`, staat.objectId)).join('')}</select></div>
          <div class="veld"><label for="f-datum" class="vereist">Inspectiedatum</label>
            <input id="f-datum" name="datum" type="date" required value="${esc(staat.datum)}"></div>
          <div class="veld"><label for="f-inspecteur">Inspecteur</label>
            <input id="f-inspecteur" name="inspecteur" value="${esc(staat.inspecteur)}" maxlength="100"></div>
          <div class="veld"><label for="f-soort">Soort inspectie</label>
            <select id="f-soort" name="soort">${INSPECTIESOORTEN.map((s) => optie(s, s, staat.soort)).join('')}</select></div>
          <div class="veld"><label for="f-weer">Weersomstandigheden</label>
            <select id="f-weer" name="weer"><option value="">–</option>${WEER.map((w) => optie(w, w, staat.weer)).join('')}</select></div>
          <div class="veld breed"><label for="f-samenvatting">Samenvatting / algemene bevindingen</label>
            <textarea id="f-samenvatting" name="samenvatting" maxlength="4000">${esc(staat.samenvatting)}</textarea></div>
          <div class="veld breed"><label>Overzichtsfoto's</label>
            <div id="algemene-fotos"></div></div>
        </div>
      </section>
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

  const fotoBlok = (fotos, sleutel) => `
    <div class="fotos">
      ${fotos.map((f, n) => `<div class="foto"><img src="${esc(f.data)}" alt="Foto ${n + 1}" data-lichtbak>
        <button type="button" data-foto-weg="${esc(sleutel)}:${n}" aria-label="Foto verwijderen">×</button></div>`).join('')}
      <label class="knop fotoknop">📷 Foto toevoegen
        <input type="file" accept="image/*" capture="environment" multiple data-foto-bij="${esc(sleutel)}"></label>
    </div>`;

  const scoreVoor = (g) => scoreLabel(gebrekScore(g));
  const toonTotaal = () => {
    app.querySelector('#totaal').innerHTML = `<div style="text-align:right"><small>Conditie (maatgevend gebrek)</small><br>${scoreLabel(inspectieScore(staat), true)}</div>`;
  };

  const gebrekHtml = (g, i) => `
    <div class="gebrek" data-gebrek="${i}" style="border-left-color:${CONDITIES[gebrekScore(g)].kleur}">
      <div class="gebrek-kop"><h3 style="margin:0">Gebrek ${i + 1}</h3>
        <div class="knoppen"><span data-score="${i}">${scoreVoor(g)}</span>
        <button type="button" class="knop klein gevaar" data-gebrek-weg="${i}">Verwijderen</button></div></div>
      <div class="velden">
        <div class="veld"><label>Bouwdeel</label><select data-g="${i}" data-veld="bouwdeel"><option value="">– kies –</option>
          ${BOUWDELEN.map((b) => optie(b, b, g.bouwdeel)).join('')}</select></div>
        <div class="veld"><label>Gebrek</label><select data-g="${i}" data-veld="gebrek"><option value="">– kies –</option>
          ${GEBREKEN.map((b) => optie(b, b, g.gebrek)).join('')}</select></div>
        <div class="veld"><label>Plaats</label><input data-g="${i}" data-veld="locatie" value="${esc(g.locatie)}" placeholder="bijv. steunpunt 2, zuidzijde" maxlength="200"></div>
        <div class="veld"><label>Ernst</label><select data-g="${i}" data-veld="ernst">
          ${Object.entries(ERNST).map(([k, v]) => optie(k, v.label, g.ernst)).join('')}</select></div>
        <div class="veld"><label>Intensiteit</label><select data-g="${i}" data-veld="intensiteit">
          ${Object.entries(INTENSITEIT).map(([k, v]) => optie(k, `${k} · ${v}`, g.intensiteit)).join('')}</select></div>
        <div class="veld"><label>Omvang (% van bouwdeel)</label>
          <input type="number" min="0" max="100" step="0.5" inputmode="decimal" data-g="${i}" data-veld="omvang" value="${esc(g.omvang)}">
          <small data-omvang="${i}">${OMVANG_KLASSEN[omvangKlasse(g.omvang) - 1].label}</small></div>
        <div class="veld"><label>Conditie</label><select data-g="${i}" data-veld="conditieHandmatig">
          ${optie('', 'Automatisch (ernst × intensiteit × omvang)', g.conditieHandmatig)}
          ${[1, 2, 3, 4, 5, 6].map((s) => optie(s, `Handmatig: ${s} · ${CONDITIES[s].label}`, g.conditieHandmatig)).join('')}</select></div>
        <div class="veld breed"><label>Toelichting / waarneming</label>
          <textarea data-g="${i}" data-veld="toelichting" maxlength="4000">${esc(g.toelichting)}</textarea></div>
        <div class="veld breed"><label>Advies maatregel</label>
          <textarea data-g="${i}" data-veld="maatregel" maxlength="2000" style="min-height:60px">${esc(g.maatregel)}</textarea></div>
        <div class="veld"><label>Urgentie</label><select data-g="${i}" data-veld="urgentie"><option value="">–</option>
          ${URGENTIES.map((u) => optie(u.id, u.label, g.urgentie)).join('')}</select></div>
        <div class="veld"><label>Kostenraming (€)</label>
          <input type="number" min="0" step="100" inputmode="numeric" data-g="${i}" data-veld="kostenraming" value="${esc(g.kostenraming)}"></div>
        <div class="veld"><label>Status maatregel</label><select data-g="${i}" data-veld="maatregelStatus">
          ${optie('open', 'Open', g.maatregelStatus)}${optie('uitgevoerd', 'Uitgevoerd', g.maatregelStatus)}</select></div>
        <div class="veld breed"><label>Foto's</label>${fotoBlok(g.fotos, `g${i}`)}</div>
      </div>
    </div>`;

  const toonGebreken = () => {
    app.querySelector('#gebreken').innerHTML = staat.gebreken.length
      ? staat.gebreken.map(gebrekHtml).join('')
      : leegKaart('Geen gebreken vastgelegd. Een inspectie zonder gebreken krijgt conditie 1 (uitstekend).');
    toonTotaal();
  };
  const toonAlgemeneFotos = () => { app.querySelector('#algemene-fotos').innerHTML = fotoBlok(staat.fotos, 'alg'); };
  const fotoLijst = (sleutel) => (sleutel === 'alg' ? staat.fotos : staat.gebreken[Number(sleutel.slice(1))].fotos);
  const herteken = (sleutel) => (sleutel === 'alg' ? toonAlgemeneFotos() : toonGebreken());

  toonAlgemeneFotos();
  toonGebreken();

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
    app.querySelector(`[data-gebrek="${staat.gebreken.length - 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = formulierData(form);
    if (!data.objectId) return melding('Kies een object.', 'fout');
    if (!data.datum) return melding('Vul de inspectiedatum in.', 'fout');
    const status = e.submitter?.dataset.status ?? staat.status ?? 'concept';
    const inspectieId = id ?? nieuwId();
    const nu = new Date().toISOString();

    // Foto's opslaan en verwijderde foto's opruimen.
    const alleFotos = [...staat.fotos, ...staat.gebreken.flatMap((g) => g.fotos)];
    await db.bewaarVeel('fotos', alleFotos
      .filter((f) => !origineleFotoIds.has(f.id))
      .map((f) => ({ id: f.id, data: f.data, inspectieId, datum: nu })));
    const behouden = new Set(alleFotos.map((f) => f.id));
    for (const fid of origineleFotoIds) if (!behouden.has(fid)) await db.verwijder('fotos', fid);

    const inspectie = {
      id: inspectieId,
      objectId: data.objectId,
      datum: data.datum,
      inspecteur: data.inspecteur,
      soort: data.soort,
      weer: data.weer,
      status,
      samenvatting: data.samenvatting,
      fotoIds: staat.fotos.map((f) => f.id),
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
    ga(`#/inspecties/${inspectieId}`);
  };
}

async function inspectieDetail(id) {
  const i = await db.haal('inspecties', id);
  if (!i) {
    app.innerHTML = leegKaart('Inspectie niet gevonden.', '<a class="knop" href="#/inspecties">Terug</a>');
    return;
  }
  const o = await db.haal('objecten', i.objectId);
  const gebrekBlokken = await Promise.all((i.gebreken ?? []).map(async (g, n) => `
    <div class="gebrek" style="border-left-color:${CONDITIES[gebrekScore(g)].kleur}">
      <div class="gebrek-kop"><h3 style="margin:0">${n + 1}. ${esc(g.bouwdeel || 'Bouwdeel onbekend')} – ${esc(g.gebrek || 'gebrek')}</h3>${scoreLabel(gebrekScore(g))}</div>
      <dl class="gegevens">
        ${g.locatie ? `<dt>Plaats</dt><dd>${esc(g.locatie)}</dd>` : ''}
        <dt>Ernst / intensiteit</dt><dd>${esc(ERNST[g.ernst]?.label ?? '–')} · ${esc(INTENSITEIT[g.intensiteit] ?? '–')}</dd>
        <dt>Omvang</dt><dd>${g.omvang === '' || g.omvang == null ? '–' : `${esc(g.omvang)}% · ${OMVANG_KLASSEN[omvangKlasse(g.omvang) - 1].label}`}</dd>
        ${g.conditieHandmatig ? '<dt>Conditie</dt><dd>Handmatig vastgesteld</dd>' : ''}
        ${g.toelichting ? `<dt>Waarneming</dt><dd style="white-space:pre-wrap">${esc(g.toelichting)}</dd>` : ''}
        ${g.maatregel ? `<dt>Maatregel</dt><dd style="white-space:pre-wrap">${esc(g.maatregel)}</dd>` : ''}
        ${g.urgentie ? `<dt>Urgentie</dt><dd>${urgentieLabel(g.urgentie)} ${g.maatregelStatus === 'uitgevoerd' ? '<span class="label-status uitgevoerd">Uitgevoerd</span>' : ''}</dd>` : ''}
        ${g.kostenraming !== '' && g.kostenraming != null ? `<dt>Kostenraming</dt><dd>${euro(g.kostenraming)}</dd>` : ''}
      </dl>
      ${await fotosHtml(g.fotoIds)}
    </div>`));

  app.innerHTML = `
    <div class="paginakop">
      <div><p><a href="${o ? `#/objecten/${esc(o.id)}` : '#/inspecties'}">← ${o ? esc(o.code) : 'Inspecties'}</a></p>
        <h1>${esc(i.soort)} · ${datumNL(i.datum)}</h1><p>${objectNaam(o)}</p></div>
      <div class="knoppen">
        <a class="knop" href="#/inspecties/${esc(id)}/rapport">Rapport</a>
        <a class="knop" href="#/inspecties/${esc(id)}/bewerken">Bewerken</a>
        <button class="knop gevaar" id="verwijder">Verwijderen</button>
      </div>
    </div>
    <div class="raster-2">
      <section class="kaart">
        <h2>Gegevens</h2>
        <dl class="gegevens">
          <dt>Status</dt><dd>${statusLabel(i.status)}</dd>
          <dt>Datum</dt><dd>${datumNL(i.datum)}</dd>
          <dt>Inspecteur</dt><dd>${esc(i.inspecteur || '–')}</dd>
          <dt>Weer</dt><dd>${esc(i.weer || '–')}</dd>
          <dt>Gebreken</dt><dd>${i.gebreken?.length ?? 0}</dd>
        </dl>
      </section>
      <section class="kaart">
        <h2>Conditie</h2>
        <p>${scoreLabel(inspectieScore(i), true)}</p>
        <p>${esc(CONDITIES[inspectieScore(i)].omschrijving)}.</p>
      </section>
    </div>
    ${i.samenvatting || i.fotoIds?.length ? `<section class="kaart"><h2>Samenvatting</h2>
      ${i.samenvatting ? `<p style="white-space:pre-wrap">${esc(i.samenvatting)}</p>` : ''}${await fotosHtml(i.fotoIds)}</section>` : ''}
    <h2>Gebreken</h2>
    ${gebrekBlokken.join('') || leegKaart('Geen gebreken geconstateerd.')}`;

  app.querySelector('#verwijder').onclick = async () => {
    if (!confirm('Deze inspectie inclusief foto\'s definitief verwijderen?')) return;
    await verwijderInspectieData(i);
    melding('Inspectie verwijderd');
    ga(o ? `#/objecten/${o.id}` : '#/inspecties');
  };
}

async function verwijderInspectieData(inspectie) {
  const fotoIds = [...(inspectie.fotoIds ?? []), ...(inspectie.gebreken ?? []).flatMap((g) => g.fotoIds ?? [])];
  for (const fid of fotoIds) await db.verwijder('fotos', fid);
  await db.verwijder('inspecties', inspectie.id);
}

async function inspectieRapport(id) {
  const i = await db.haal('inspecties', id);
  if (!i) {
    app.innerHTML = leegKaart('Inspectie niet gevonden.', '<a class="knop" href="#/inspecties">Terug</a>');
    return;
  }
  const o = (await db.haal('objecten', i.objectId)) ?? {};
  const score = inspectieScore(i);
  const organisatie = instelling.lees('organisatie');
  const gebreken = i.gebreken ?? [];
  const details = await Promise.all(gebreken.map(async (g, n) => `
    <div class="gebrek" style="border-left-color:${CONDITIES[gebrekScore(g)].kleur}">
      <div class="gebrek-kop"><h3 style="margin:0">${n + 1}. ${esc(g.bouwdeel)} – ${esc(g.gebrek)}${g.locatie ? ` (${esc(g.locatie)})` : ''}</h3>${scoreLabel(gebrekScore(g))}</div>
      ${g.toelichting ? `<p style="white-space:pre-wrap;margin:.25rem 0"><strong>Waarneming:</strong> ${esc(g.toelichting)}</p>` : ''}
      ${g.maatregel ? `<p style="white-space:pre-wrap;margin:.25rem 0"><strong>Advies:</strong> ${esc(g.maatregel)}</p>` : ''}
      ${await fotosHtml(g.fotoIds)}
    </div>`));

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
      ${i.samenvatting ? `<h2 style="margin-top:1rem">Samenvatting</h2><p style="white-space:pre-wrap">${esc(i.samenvatting)}</p>` : ''}
      ${await fotosHtml(i.fotoIds)}
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
        <td>${scoreLabel(gebrekScore(g))}</td><td>${euro(g.kostenraming)}</td>
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
// Kaart (Leaflet + OpenStreetMap, alleen online beschikbaar)
// ---------------------------------------------------------------------------
let leafletBelofte;
function laadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletBelofte ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletBelofte = null; reject(new Error('Kaartbibliotheek kon niet worden geladen (offline?).')); };
    document.head.append(js);
  });
  return leafletBelofte;
}

async function kaart() {
  const { objecten, status } = await laadAlles();
  const metLocatie = objecten.filter((o) => Number.isFinite(parseFloat(o.lat)) && Number.isFinite(parseFloat(o.lng)));
  app.innerHTML = `
    <div class="paginakop"><div><h1>Kaart</h1>
      <p>${metLocatie.length} van ${objecten.length} objecten hebben coördinaten. Kleur = conditie.</p></div></div>
    <div id="kaart" class="kaart"><p class="leeg">Kaart laden…</p></div>`;
  if (!metLocatie.length) {
    app.querySelector('#kaart').innerHTML = '<p class="leeg">Nog geen objecten met coördinaten. Vul breedte- en lengtegraad in bij een object.</p>';
    return;
  }
  let L;
  try {
    L = await laadLeaflet();
  } catch (fout) {
    app.querySelector('#kaart').innerHTML = `<p class="leeg">${esc(fout.message)}</p>`;
    return;
  }
  const el = app.querySelector('#kaart');
  if (!el) return; // gebruiker is al weg genavigeerd
  el.innerHTML = '';
  const map = L.map(el);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap-bijdragers',
  }).addTo(map);
  const punten = metLocatie.map((o) => {
    const s = status.get(o.id);
    const kleur = s.conditie ? CONDITIES[s.conditie].kleur : '#8a96a3';
    const p = [parseFloat(o.lat), parseFloat(o.lng)];
    L.circleMarker(p, { radius: 9, color: '#fff', weight: 2, fillColor: kleur, fillOpacity: 1 })
      .addTo(map)
      .bindPopup(`<strong>${esc(o.code)}</strong><br>${esc(o.naam)}<br>${scoreLabel(s.conditie)}<br>
        ${PLANNING_TEKST[s.planning]}<br><a href="#/objecten/${esc(o.id)}">Open object →</a>`);
    return p;
  });
  if (punten.length === 1) map.setView(punten[0], 16); else map.fitBounds(punten, { padding: [30, 30] });
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
    <div class="paginakop"><div><h1>Instellingen</h1><p>Gegevens worden lokaal op dit apparaat opgeslagen en werken ook offline.</p></div></div>
    <div class="raster-2">
      <form class="kaart" id="voorkeuren">
        <h2>Voorkeuren</h2>
        <div class="velden">
          <div class="veld breed"><label for="f-inspecteur">Standaard inspecteur</label>
            <input id="f-inspecteur" name="inspecteur" value="${esc(instelling.lees('inspecteur'))}"></div>
          <div class="veld breed"><label for="f-organisatie">Organisatie (in rapporten)</label>
            <input id="f-organisatie" name="organisatie" value="${esc(instelling.lees('organisatie'))}"></div>
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
        <h2>Alles wissen</h2>
        <p>Verwijdert alle objecten, inspecties en foto's van dit apparaat.</p>
        <button class="knop gevaar" id="wis">Alle gegevens wissen</button>
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
    melding('Voorkeuren opgeslagen');
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
      melding('Back-up geïmporteerd');
      router();
    } catch (fout) {
      melding(`Import mislukt: ${fout.message}`, 'fout');
    }
  };
  app.querySelector('#demo').onclick = laadDemo;
  app.querySelector('#wis').onclick = async () => {
    if (!confirm('Weet je zeker dat je ALLE gegevens wilt wissen? Dit kan niet ongedaan worden gemaakt.')) return;
    for (const s of db.STORES) await db.leeg(s);
    melding('Alle gegevens gewist');
    ga('#/');
  };
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
    el.textContent = 'Je bent offline. Gegevens worden lokaal opgeslagen; de kaart is niet beschikbaar.';
    document.querySelector('.kop').after(el);
  }
}
window.addEventListener('online', offlineMelding);
window.addEventListener('offline', offlineMelding);
offlineMelding();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch((fout) => console.warn('Service worker niet geregistreerd', fout));
}

router();
