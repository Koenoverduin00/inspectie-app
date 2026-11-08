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
  [/^\/m\/werk\/nieuw$/, 'm-werk', (_, q) => werkFormulier(null, q.get('object'), { mobiel: true, taakId: q.get('taak'), maatregel: q.get('maatregel') })],
  [/^\/m\/werk\/([^/]+)$/, 'm-werk', (id) => werkFormulier(id, null, { mobiel: true })],
  [/^\/m\/inspectie$/, 'm-inspectie', () => objectKiezer('inspectie')],
  [/^\/m\/inspectie\/nieuw$/, 'm-inspectie', (_, q) => inspectieFormulier(null, q.get('object'), { mobiel: true, taakId: q.get('taak') })],
  [/^\/m\/inspectie\/([^/]+)$/, 'm-inspectie', (id) => inspectieFormulier(id, null, { mobiel: true })],
  [/^\/m\/account$/, 'm-account', mobielAccount],
  [/^\/werkzaamheden$/, 'werkzaamheden', werkzaamhedenLijst],
  [/^\/werkzaamheden\/nieuw$/, 'werkzaamheden', (_, q) => werkFormulier(null, q.get('object'), { taakId: q.get('taak'), maatregel: q.get('maatregel') })],
  [/^\/werkzaamheden\/([^/]+)\/bewerken$/, 'werkzaamheden', (id) => werkFormulier(id)],
  [/^\/werkzaamheden\/([^/]+)$/, 'werkzaamheden', werkDetail],
  [/^\/objecten$/, 'objecten', objectenLijst],
  [/^\/objecten\/nieuw$/, 'objecten', () => objectFormulier()],
  [/^\/objecten\/([^/]+)\/bewerken$/, 'objecten', objectFormulier],
  [/^\/objecten\/([^/]+)$/, 'objecten', objectDetail],
  [/^\/inspecties$/, 'inspecties', inspectiesLijst],
  [/^\/inspecties\/nieuw$/, 'inspecties', (_, q) => inspectieFormulier(null, q.get('object'), { taakId: q.get('taak') })],
  [/^\/inspecties\/([^/]+)\/bewerken$/, 'inspecties', (id) => inspectieFormulier(id)],
  [/^\/inspecties\/([^/]+)\/rapport$/, 'inspecties', inspectieRapport],
  [/^\/inspecties\/([^/]+)$/, 'inspecties', inspectieDetail],
  [/^\/maatregelen$/, 'maatregelen', maatregelen],
  [/^\/projecten$/, 'projecten', projectenPagina],
  [/^\/projecten\/nieuw$/, 'projecten', () => projectFormulier()],
  [/^\/projecten\/([^/]+)\/bewerken$/, 'projecten', (id) => projectFormulier(id)],
  [/^\/gis\/importeren$/, 'kaart', gisImport],
  [/^\/taken$/, 'taken', takenPagina],
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
  const periodiek = Number(object.inspectieInterval) > 0;
  if (!laatste) return { laatste: null, conditie: null, volgende: null, planning: periodiek ? 'nooit' : 'geen' };
  if (!periodiek) return { laatste, conditie: inspectieScore(laatste), volgende: null, planning: 'geen' };
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

  const takenOpen = sorteerTaken(takenLijst({ objecten, inspecties, taken: await inProject('taken'), planning: status, vandaag: vandaag() }));
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
              <td>${i.status === 'afgerond' ? scoreLabel(inspectieScore(i)) : statusLabel(i.status)}</td>
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
            <td>${objectNaam(o)}</td><td class="verberg-mobiel">${esc(o.type)}</td><td>${scoreLabel(s.conditie)}</td>
            <td>${datumNL(s.laatste?.datum)}</td><td>${s.volgende ? datumNL(s.volgende) : 'Z.s.m.'}</td><td>${planningLabel(s.planning)}</td>
          </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

async function laadDemo() {
  const data = demoData();
  for (const store of ['lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken']) {
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
      for (const fid of w.fotoIds ?? []) await db.verwijder('fotos', fid);
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

async function inspectieFormulier(id, objectId, { mobiel = false, taakId = null } = {}) {
  const objecten = (await inProject('objecten')).sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  const bestaand = id ? await db.haal('inspecties', id) : null;
  if (id && !bestaand) {
    app.innerHTML = leegKaart('Inspectie niet gevonden.', `<a class="knop" href="${mobiel ? '#/' : '#/inspecties'}">Terug</a>`);
    return;
  }
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
      objectId: objectId ?? '', datum: vandaag(), inspecteur: instelling.lees('inspecteur'),
      soort: mobiel ? 'Schouw' : INSPECTIESOORTEN[0],
      weer: '', status: 'concept', samenvatting: '', fotos: [], gebreken: [],
    };
  const origineleFotoIds = new Set([...(bestaand?.fotoIds ?? []), ...(bestaand?.gebreken ?? []).flatMap((g) => g.fotoIds ?? [])]);
  const terug = mobiel ? '#/' : bestaand ? `#/inspecties/${esc(id)}` : (objectId ? `#/objecten/${esc(objectId)}` : '#/inspecties');
  const object = objecten.find((o) => o.id === staat.objectId);
  const taak = taakId ? await db.haal('taken', taakId) : null;
  const openDetails = new Set(); // houdt opengeklapte onderdelen open bij hertekenen

  const objectVeld = mobiel && object
    ? `<input type="hidden" name="objectId" value="${esc(object.id)}">`
    : `<div class="veld breed"><label for="f-object" class="vereist">Object</label>
        <select id="f-object" name="objectId" required><option value="">– kies een object –</option>
        ${objecten.map((o) => optie(o.id, `${o.code} – ${o.naam}`, staat.objectId)).join('')}</select></div>`;
  const veldDatum = `<div class="veld"><label for="f-datum" class="vereist">Datum</label>
      <input id="f-datum" name="datum" type="date" required value="${esc(staat.datum)}"></div>`;
  const veldSoort = `<div class="veld"><label for="f-soort">Soort</label>
      <select id="f-soort" name="soort">${INSPECTIESOORTEN.map((s) => optie(s, s, staat.soort)).join('')}</select></div>`;
  const veldInspecteur = `<div class="veld"><label for="f-inspecteur">Inspecteur</label>
      <input id="f-inspecteur" name="inspecteur" value="${esc(staat.inspecteur)}" maxlength="100"></div>`;
  const veldWeer = `<div class="veld"><label for="f-weer">Weersomstandigheden</label>
      <select id="f-weer" name="weer"><option value="">–</option>${WEER.map((w) => optie(w, w, staat.weer)).join('')}</select></div>`;
  const veldSamenvatting = `<div class="veld breed"><label for="f-samenvatting">${mobiel ? 'Algemene bevindingen' : 'Samenvatting / algemene bevindingen'}</label>
      <textarea id="f-samenvatting" name="samenvatting" maxlength="4000">${esc(staat.samenvatting)}</textarea></div>`;
  const veldFotos = `<div class="veld breed"><label>Overzichtsfoto's</label><div id="algemene-fotos"></div></div>`;

  app.innerHTML = mobiel ? `
    <div class="mkop"><a href="#/" class="mterug" aria-label="Terug">←</a>
      <div><small>${bestaand ? 'Inspectie bewerken' : 'Schouw & inspectie'}</small>
      <h1>${object ? `${esc(object.code)} – ${esc(object.naam)}` : 'Kies een object'}</h1></div></div>
    <form id="form" novalidate class="mform">
      ${taak ? `<div class="kaart mhier">📋 <strong>Taak:</strong> ${esc(taak.titel)}${taak.omschrijving ? `<br><small>${esc(taak.omschrijving)}</small>` : ''}</div>` : ''}
      <section class="kaart">
        <div class="velden">${objectVeld}${veldSoort}${veldDatum}${veldSamenvatting}${veldFotos}</div>
        <details data-details="algemeen"><summary>Inspecteur en weer</summary>
          <div class="velden" style="margin-top:.75rem">${veldInspecteur}${veldWeer}</div></details>
      </section>
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
    const inspectieId = id ?? nieuwId();
    const nu = new Date().toISOString();

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
    if (status === 'afgerond') await rondTaakAf(taakId, inspectieId);
    ga(mobiel ? '#/' : `#/inspecties/${inspectieId}`);
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
      href: `#/m/inspectie/${i.id}`, icoon: '🔍', titel: `${i.soort} · ${i.gebreken?.length ?? 0} gebrek(en)`, object: objectMap.get(i.objectId), tijd: i.gewijzigd,
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
        <span><strong>Schouw &amp; inspectie</strong><small>Gebreken vastleggen met foto's en conditie</small></span>
      </a>
      ${concepten.length ? `<h2>Verder gaan</h2><ul class="mlijst">${concepten.slice(0, 5).map((i) => regel({
    href: `#/m/inspectie/${i.id}`, icoon: '📝', titel: `Concept ${i.soort.toLowerCase()} · ${datumNL(i.datum)}`, object: objectMap.get(i.objectId),
  })).join('')}</ul>` : ''}
      <section id="logisch"></section>
      <h2>Vandaag vastgelegd</h2>
      ${vandaagLijst.length ? `<ul class="mlijst">${vandaagLijst.map(regel).join('')}</ul>` : '<p class="mleeg">Nog niets vastgelegd vandaag.</p>'}
    </div>`;
  toonLogischNu(app.querySelector('#logisch'));
}

// ---------------------------------------------------------------------------
// Mobiel: object kiezen (zoeken of dichtbij via GPS)
// ---------------------------------------------------------------------------
let laatstePositie = null;

function afstandTekst(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

async function objectKiezer(doel) {
  const objecten = (await inProject('objecten'))
    .filter((o) => o.status !== 'Gesloopt')
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  const titel = doel === 'werk' ? 'Registratie werkzaamheden' : 'Schouw & inspectie';
  app.innerHTML = `
    <div class="mkop"><a href="#/" class="mterug" aria-label="Terug">←</a>
      <div><small>${titel}</small><h1>Kies een object</h1></div></div>
    ${objecten.length ? `
    <div class="mzoek">
      <input type="search" id="zoek" placeholder="Zoek op code, naam of locatie" autocomplete="off" aria-label="Zoeken">
      <button class="knop" id="dichtbij" type="button">📍 Dichtbij</button>
    </div>
    <ul class="mlijst" id="lijst"></ul>` : leegKaart('Er zijn nog geen objecten. Richt de objecten eerst in via de website op de pc.')}`;
  if (!objecten.length) return;

  const zoek = app.querySelector('#zoek');
  const toon = () => {
    const q = zoek.value.trim().toLowerCase();
    const lijst = objecten.filter((o) => !q || `${o.code} ${o.naam} ${o.locatie} ${o.type}`.toLowerCase().includes(q));
    const metAfstand = lijst.map((o) => ({ o, afstand: laatstePositie ? gis.afstandTot(laatstePositie, objectGeometrie(o)) : null }));
    if (laatstePositie) metAfstand.sort((a, b) => (a.afstand ?? Infinity) - (b.afstand ?? Infinity));
    const MAX = 100;
    app.querySelector('#lijst').innerHTML = metAfstand.length ? metAfstand.slice(0, MAX).map(({ o, afstand }) => `
      <li><a href="#/m/${doel}/nieuw?object=${encodeURIComponent(o.id)}">
        <span><strong>${esc(o.code)} – ${esc(o.naam)}</strong><small>${esc([o.type, o.locatie].filter(Boolean).join(' · '))}</small></span>
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

  app.querySelector('#export').onclick = () => {
    const rijen = [['Datum', 'Objectcode', 'Object', 'Soort', 'Uitvoerder', 'Uren', 'Omschrijving', 'Materiaal', 'Status', 'Vervolg', 'Afgehandelde maatregelen', 'Foto\'s']];
    for (const w of zichtbaar) {
      const o = objectMap.get(w.objectId);
      rijen.push([w.datum, o?.code, o?.naam, w.soort, w.uitvoerder, w.uren, w.omschrijving, w.materiaal,
        WERKSTATUS[w.status] ?? 'Gereed', w.vervolg, w.maatregelen?.length ?? 0, w.fotoIds?.length ?? 0]);
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
    for (const g of i.gebreken ?? []) if (sleutels.has(`${i.id}:${g.id}`)) lijst.push({ gebrek: g, inspectie: i });
  }
  return lijst;
}

// Zet maatregelen (gebreken in inspecties) op uitgevoerd of terug op open.
async function werkMaatregelenBij(werkId, datum, aanzetten, uitzetten) {
  const inspecties = await inProject('inspecties');
  const nu = new Date().toISOString();
  for (const insp of inspecties) {
    let gewijzigd = false;
    for (const g of insp.gebreken ?? []) {
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
  for (const fid of w.fotoIds ?? []) await db.verwijder('fotos', fid);
  await db.verwijder('werkzaamheden', w.id);
}

async function werkFormulier(id, objectId, { mobiel = false, taakId = null, maatregel = null } = {}) {
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
    objectId: objectId ?? '', datum: vandaag(), soort: '', uitvoerder: instelling.lees('inspecteur'), uren: '',
    omschrijving: '', materiaal: '', status: 'gereed', vervolg: '', maatregelen: [], fotoIds: [],
  };
  const fotos = await laadFotos(w.fotoIds);
  const origineleFotoIds = new Set(w.fotoIds ?? []);
  const origineleKoppelingen = new Set((w.maatregelen ?? []).map((m) => `${m.inspectieId}:${m.gebrekId}`));
  const object = objecten.find((o) => o.id === w.objectId);
  const taak = taakId ? await db.haal('taken', taakId) : null;
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
    <div class="veld"><label for="f-soort" class="vereist">Soort werkzaamheid</label>
      <select id="f-soort" name="soort" required><option value="">– kies –</option>${WERKSOORTEN.map((s) => optie(s, s, w.soort)).join('')}</select></div>
    <div class="veld"><label for="f-datum" class="vereist">Datum</label><input id="f-datum" name="datum" type="date" required value="${esc(w.datum)}"></div>
    <div class="veld breed"><label for="f-omschrijving">Wat is er gedaan?</label>
      <textarea id="f-omschrijving" name="omschrijving" maxlength="4000" placeholder="Korte omschrijving van het uitgevoerde werk">${esc(w.omschrijving)}</textarea></div>
    <div class="veld breed"><label>Foto's (voor / na)</label><div id="fotos"></div></div>
    <div class="veld"><label for="f-uren">Uren</label><input id="f-uren" name="uren" type="number" min="0" max="1000" step="0.25" inputmode="decimal" value="${esc(w.uren)}"></div>
    <div class="veld"><label for="f-uitvoerder">Uitvoerder</label><input id="f-uitvoerder" name="uitvoerder" maxlength="100" value="${esc(w.uitvoerder)}"></div>
    <div class="veld"><label for="f-status">Status</label>
      <select id="f-status" name="status">${Object.entries(WERKSTATUS).map(([k, v]) => optie(k, v, w.status)).join('')}</select></div>
    <div class="veld breed" id="vervolg-veld" ${w.status === 'vervolg' ? '' : 'hidden'}><label for="f-vervolg">Welk vervolg is nodig?</label>
      <textarea id="f-vervolg" name="vervolg" maxlength="2000" style="min-height:60px">${esc(w.vervolg)}</textarea></div>
    <div class="veld breed"><label for="f-materiaal">Gebruikt materiaal</label>
      <input id="f-materiaal" name="materiaal" maxlength="500" value="${esc(w.materiaal)}"></div>`;

  app.innerHTML = mobiel ? `
    <div class="mkop"><a href="#/" class="mterug" aria-label="Terug">←</a>
      <div><small>${bestaand ? 'Werkzaamheid bewerken' : 'Registratie werkzaamheden'}</small>
      <h1>${object ? `${esc(object.code)} – ${esc(object.naam)}` : 'Kies een object'}</h1></div></div>
    <form id="form" novalidate class="mform">
      ${taakBanner}
      <section class="kaart"><div class="velden">${velden}</div></section>
      <section class="kaart" id="maatregelen-blok"></section>
      <div class="mvoet"><button class="knop primair" type="submit">✓ Opslaan</button></div>
    </form>` : `
    <div class="paginakop"><div><p><a href="${terug}">← Terug</a></p>
      <h1>${bestaand ? 'Werkzaamheid bewerken' : 'Werkzaamheid registreren'}</h1></div></div>
    <form id="form" novalidate>
      <section class="kaart"><div class="velden">${velden}</div></section>
      <section class="kaart" id="maatregelen-blok"></section>
      <div class="formvoet kaart">
        <a class="knop" href="${terug}">Annuleren</a>
        <button class="knop primair" type="submit">Opslaan</button>
      </div>
    </form>`;

  const form = app.querySelector('#form');
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
    const werkId = id ?? nieuwId();
    const nu = new Date().toISOString();

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
      maatregelen: [...gekozen].map((k) => {
        const [inspectieId, gebrekId] = k.split(':');
        return { inspectieId, gebrekId };
      }),
      fotoIds: fotos.map((f) => f.id),
      aangemaakt: bestaand?.aangemaakt ?? nu,
      gewijzigd: nu,
    });
    if (data.uitvoerder) instelling.schrijf('inspecteur', data.uitvoerder);
    formulierGewijzigd = false;
    melding('Werkzaamheid opgeslagen');
    await rondTaakAf(taakId, werkId);
    ga(mobiel ? '#/' : `#/werkzaamheden/${werkId}`);
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
        ${beheer ? `<div class="knoppen"><a class="knop klein" href="#/projecten/${esc(p.id)}/bewerken">Bewerken</a></div>` : ''}
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
    for (const store of ['fotos', 'taken', 'werkzaamheden', 'inspecties', 'objecten', 'lagen']) {
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
    const codeGok = raad(/^(code|id|objectcode|nummer|nr|identificatie|vak_?id|objectnummer)$/i);
    const naamGok = raad(/^(naam|name|omschrijving|titel|label|straatnaam|straat|openbareruimtenaam)$/i);
    const typeGok = [
      [/groen|gras|gazon|heester|boom|bomen|beplanting/i, 'Groenvak'],
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
      id: nieuwId(), projectId: pid, laagId, code, naam: naam || `${instellingen.naam} ${nummer}`, type: instellingen.type,
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
  const { objecten, inspecties, status } = await laadAlles();
  const [lagen, taken] = await Promise.all([inProject('lagen'), inProject('taken')]);
  const takenPerObject = new Map();
  for (const t of takenLijst({ objecten, inspecties, taken, planning: status, vandaag: vandaag() })) {
    takenPerObject.set(t.object.id, (takenPerObject.get(t.object.id) ?? 0) + 1);
  }
  const groepen = [
    ...lagen.map((l) => ({ id: l.id, naam: l.naam, kleur: l.kleur, laag: l, objecten: objecten.filter((o) => o.laagId === l.id) })),
    { id: '', naam: 'Losse objecten', kleur: '#0b4f6c', objecten: objecten.filter((o) => !o.laagId || !lagen.some((l) => l.id === o.laagId)) },
  ].map((g) => ({ ...g, objecten: g.objecten.filter((o) => objectGeometrie(o)) })).filter((g) => g.objecten.length || g.laag);

  app.innerHTML = `
    <div class="paginakop">
      <div><h1>Kaart &amp; GIS</h1><p>${objecten.filter((o) => objectGeometrie(o)).length} van ${objecten.length} objecten op de kaart. Vulkleur = conditie.</p></div>
      ${magBeheren() ? '<a class="knop primair" href="#/gis/importeren">🗺️ GIS-laag inladen</a>' : ''}
    </div>
    <div class="kaartindeling">
      <div id="kaart" class="kaart"><p class="leeg">Kaart laden…</p></div>
      <aside class="kaart lagenpaneel">
        <h2>Lagen</h2>
        ${groepen.length ? groepen.map((g) => `
          <div class="laagregel">
            <label><input type="checkbox" data-laag="${esc(g.id)}" checked>
              <span class="kleurvak" style="background:${esc(g.kleur)}"></span>
              <span><strong>${esc(g.naam)}</strong><small>${g.objecten.length} objecten${g.laag ? ` · ${esc(g.laag.soort)} · ${esc(g.laag.bron)}` : ''}</small></span></label>
            ${g.laag && magBeheren() ? `<button class="knop klein gevaar" data-laag-weg="${esc(g.id)}" aria-label="Laag verwijderen">🗑</button>` : ''}
          </div>`).join('') : '<p class="leeg">Nog geen lagen. Laad een GIS-bestand in.</p>'}
        <h3 style="margin-top:1rem">Conditie</h3>
        <div class="legenda">${[1, 2, 3, 4, 5, 6].map((s) => `<span><i style="background:${CONDITIES[s].kleur}"></i>${s} ${CONDITIES[s].label}</span>`).join('')}
          <span><i style="background:#c3cbd3"></i>Onbekend</span></div>
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

  if (!groepen.some((g) => g.objecten.length)) {
    app.querySelector('#kaart').innerHTML = '<p class="leeg">Nog niets om te tonen. Laad een GIS-laag in of vul coördinaten in bij een object.</p>';
    return;
  }
  // Niet wachten: de kaart tekent zich zodra de bibliotheek binnen is.
  tekenGisKaart(app.querySelector('#kaart'), { groepen, status, takenPerObject });
}

async function tekenGisKaart(el, { groepen, status, takenPerObject }) {
  let L;
  try {
    L = await laadLeaflet();
  } catch (fout) {
    if (el.isConnected) el.innerHTML = `<p class="leeg">${esc(fout.message)}</p>`;
    return;
  }
  if (!el.isConnected) return; // inmiddels naar een andere pagina
  el.innerHTML = '';
  const map = L.map(el, { preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap-bijdragers' }).addTo(map);

  const popup = (o) => {
    const s = status.get(o.id);
    const n = takenPerObject.get(o.id) ?? 0;
    return `<strong>${esc(o.code)}</strong> – ${esc(o.naam)}<br><small>${esc(o.type || '')}${o.geometrie ? ` · ${geometrieInfo(o)}` : ''}</small><br>
      ${scoreLabel(s.conditie)} ${planningLabel(s.planning)}<br>${n ? `<strong>${n}</strong> open taak/taken<br>` : ''}
      <a href="#/objecten/${esc(o.id)}">Object</a> · <a href="#/taken/nieuw?object=${esc(o.id)}">+ Taak</a> · <a href="#/inspecties/nieuw?object=${esc(o.id)}">+ Inspectie</a>`;
  };
  const kaartlagen = new Map();
  const grenzen = [];
  for (const g of groepen) {
    const fc = { type: 'FeatureCollection', features: g.objecten.map((o) => ({ type: 'Feature', geometry: objectGeometrie(o), properties: { id: o.id } })) };
    const objectMap = new Map(g.objecten.map((o) => [o.id, o]));
    const laag = L.geoJSON(fc, {
      style: (f) => {
        const s = status.get(f.properties.id);
        return { color: g.kleur, weight: 2, fillColor: s?.conditie ? CONDITIES[s.conditie].kleur : '#c3cbd3', fillOpacity: 0.45 };
      },
      pointToLayer: (f, ll) => {
        const s = status.get(f.properties.id);
        return L.circleMarker(ll, { radius: 8, color: '#fff', weight: 2, fillColor: s?.conditie ? CONDITIES[s.conditie].kleur : g.kleur, fillOpacity: 1 });
      },
      onEachFeature: (f, l) => l.bindPopup(() => popup(objectMap.get(f.properties.id))),
    }).addTo(map);
    kaartlagen.set(g.id, laag);
    const b = laag.getBounds();
    if (b.isValid()) grenzen.push(b);
  }
  const totaal = grenzen.reduce((t, b) => t.extend(b), L.latLngBounds(grenzen[0].getSouthWest(), grenzen[0].getNorthEast()));
  map.fitBounds(totaal, { padding: [30, 30], maxZoom: 17 });
  app.querySelectorAll('[data-laag]').forEach((c) => {
    c.onchange = () => {
      const l = kaartlagen.get(c.dataset.laag);
      if (!l) return;
      if (c.checked) l.addTo(map); else l.remove();
    };
  });
}

// ---------------------------------------------------------------------------
// Taken
// ---------------------------------------------------------------------------
const RANG_TEKST = { 1: 'Urgent', 2: 'Hoog', 3: 'Normaal', 4: 'Laag', 5: 'Monitoren' };
const BRON_TEKST = { gepland: 'Gepland', maatregel: 'Maatregel', planning: 'Inspectieplanning' };

function rangLabel(rang) {
  const k = rang <= 1 ? 'direct' : rang === 2 ? 'binnenkort' : '';
  return `<span class="label-status ${k}">${RANG_TEKST[rang] ?? 'Normaal'}</span>`;
}

function taakHref(t, mobiel) {
  const q = new URLSearchParams({ object: t.object.id });
  if (t.taakId) q.set('taak', t.taakId);
  if (t.maatregel) q.set('maatregel', t.maatregel);
  if (t.soort === 'werk') return `${mobiel ? '#/m/werk' : '#/werkzaamheden'}/nieuw?${q}`;
  return `${mobiel ? '#/m/inspectie' : '#/inspecties'}/nieuw?${q}`;
}

async function alleTaken({ alleenMijn = false } = {}) {
  const { objecten, inspecties, status } = await laadAlles();
  const taken = await inProject('taken');
  const ik = alleenMijn ? (sync.sessie()?.gebruiker?.email ?? '') : '';
  return { lijst: takenLijst({ objecten, inspecties, taken, planning: status, vandaag: vandaag(), ik }), taken, objecten };
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
      <div class="formvoet">
        ${bestaand ? '<button type="button" class="knop gevaar" id="verwijder" style="margin-right:auto">Verwijderen</button>' : ''}
        <a class="knop" href="#/taken">Annuleren</a><button class="knop primair" type="submit">Opslaan</button>
      </div>
    </form>`;
  const form = app.querySelector('#form');
  form.addEventListener('input', () => { formulierGewijzigd = true; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formulierData(form);
    if (!d.objectId) return melding('Kies een object.', 'fout');
    if (!d.titel) return melding('Omschrijf de taak.', 'fout');
    const nu = new Date().toISOString();
    await db.bewaar('taken', {
      ...t, id: bestaand?.id ?? nieuwId(), projectId: t.projectId ?? projectId(), objectId: d.objectId, soort: d.soort, titel: d.titel,
      omschrijving: d.omschrijving, prioriteit: d.prioriteit, deadline: d.deadline, toegewezenAan: d.toegewezenAan.toLowerCase(),
      status: d.status || t.status || 'open', aangemaakt: t.aangemaakt ?? nu, gewijzigd: nu,
    });
    formulierGewijzigd = false;
    melding('Taak opgeslagen');
    ga('#/taken');
  };
  app.querySelector('#verwijder')?.addEventListener('click', async () => {
    if (!confirm('Deze taak verwijderen?')) return;
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
