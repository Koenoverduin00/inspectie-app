// NEN 2767-decompositie: object → element → bouwdeel, aangeleverd door de opdrachtgever (Excel/CSV).
// GIS-objecten worden op elk niveau aan een knoop gekoppeld; alleen bouwdelen krijgen een conditiescore
// (er wordt niets opgeteld naar element of object). Puur en testbaar: geen DOM, geen opslag.
import { gebrekScore } from './nen2767.js';

export const NIVEAUS = ['object', 'element', 'bouwdeel'];
export const NIVEAU_LABEL = { object: 'Object', element: 'Element', bouwdeel: 'Bouwdeel' };

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[*()_.:-]/g, ' ').replace(/\s+/g, ' ').trim();
const tekst = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if ('result' in v) return tekst(v.result);
    if ('text' in v) return tekst(v.text);
  }
  return String(v).trim();
};
const getal = (v) => {
  const s = tekst(v).replace(/\s/g, '');
  if (!s) return '';
  const n = Number(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : '';
};

// Herkende kolomkoppen (genormaliseerd).
const KOPPEN = {
  code: ['code', 'id', 'decompositiecode', 'nummer', 'nr'],
  naam: ['naam', 'omschrijving', 'benaming', 'name'],
  niveau: ['niveau', 'level', 'type', 'soort', 'decompositieniveau'],
  ouder: ['bovenliggende code', 'bovenliggend', 'ouder', 'ouder code', 'parent', 'parent code', 'hoort bij', 'valt onder'],
  eenheid: ['eenheid', 'unit'],
  hoeveelheid: ['hoeveelheid', 'aantal', 'omvang', 'quantity'],
  gis: ['gis code', 'gis', 'gis id', 'gis objectcode', 'objectcode gis', 'beheer id', 'koppelcode'],
  object: ['object', 'objectnaam', 'object naam'],
  objectcode: ['objectcode', 'object code', 'code object'],
  element: ['element', 'elementnaam', 'element naam'],
  elementcode: ['elementcode', 'element code', 'code element'],
  bouwdeel: ['bouwdeel', 'bouwdeelnaam', 'bouwdeel naam'],
  bouwdeelcode: ['bouwdeelcode', 'bouwdeel code', 'code bouwdeel'],
};

function niveauVan(v) {
  const s = norm(v);
  if (!s) return '';
  if (/^(o|obj|object|1|niveau 1)$/.test(s) || s.startsWith('object')) return 'object';
  if (/^(e|el|element|2|niveau 2)$/.test(s) || s.startsWith('element')) return 'element';
  if (/^(b|bd|bouwdeel|3|niveau 3)$/.test(s) || s.startsWith('bouwdeel') || s.startsWith('onderdeel')) return 'bouwdeel';
  return null;
}

function kolommen(kop) {
  const genorm = kop.map(norm);
  const uit = {};
  for (const [sleutel, namen] of Object.entries(KOPPEN)) {
    const i = genorm.findIndex((k) => namen.includes(k));
    if (i >= 0) uit[sleutel] = i;
  }
  return uit;
}

/**
 * Leest een decompositie uit tabelregels (eerste regel = kolomkoppen). Twee indelingen:
 *  1. Lijst: Code · Naam · Niveau · Bovenliggende code (· Eenheid · Hoeveelheid · GIS-code)
 *  2. Kolommen: Object · Element · Bouwdeel (met optioneel Objectcode/Elementcode/Bouwdeelcode, Eenheid, Hoeveelheid, GIS-code)
 * @param {Array<Array<any>>} regels
 * @returns {{ knopen: object[], fouten: string[], indeling: 'lijst'|'kolommen'|null }}
 */
export function leesDecompositie(regels) {
  const rijen = (regels ?? []).map((r) => (r ?? []).map(tekst));
  const start = rijen.findIndex((r) => r.some((c) => c));
  if (start < 0) return { knopen: [], fouten: ['Het bestand is leeg.'], indeling: null };
  const k = kolommen(rijen[start]);
  const data = rijen.slice(start + 1).map((r, i) => ({ r, rij: start + i + 2 })).filter(({ r }) => r.some((c) => c));
  if (k.niveau !== undefined && (k.code !== undefined || k.naam !== undefined)) return leesLijst(data, k);
  if (k.object !== undefined || k.element !== undefined || k.bouwdeel !== undefined
    || k.objectcode !== undefined || k.elementcode !== undefined || k.bouwdeelcode !== undefined) return leesKolommen(data, k);
  return {
    knopen: [], indeling: null,
    fouten: ['Kolommen niet herkend. Gebruik "Code, Naam, Niveau, Bovenliggende code" of "Object, Element, Bouwdeel".'],
  };
}

function leesLijst(data, k) {
  const fouten = [];
  const knopen = [];
  const perCode = new Map();
  for (const { r, rij } of data) {
    const niveau = niveauVan(r[k.niveau]);
    const code = k.code !== undefined ? r[k.code] : '';
    const naam = k.naam !== undefined ? r[k.naam] : '';
    if (!niveau) { fouten.push(`Regel ${rij}: onbekend niveau "${r[k.niveau]}" (gebruik object, element of bouwdeel).`); continue; }
    if (!code && !naam) { fouten.push(`Regel ${rij}: code en naam ontbreken.`); continue; }
    const sleutel = code || `${niveau}:${naam}`;
    if (perCode.has(sleutel)) { fouten.push(`Regel ${rij}: code "${sleutel}" komt dubbel voor.`); continue; }
    const knoop = {
      id: maakId(niveau, sleutel), code, naam: naam || code, niveau, ouder: null,
      eenheid: k.eenheid !== undefined ? r[k.eenheid] : '', hoeveelheid: k.hoeveelheid !== undefined ? getal(r[k.hoeveelheid]) : '',
      gis: k.gis !== undefined ? r[k.gis] : '', _ouder: k.ouder !== undefined ? r[k.ouder] : '', _rij: rij,
    };
    perCode.set(sleutel, knoop);
    knopen.push(knoop);
  }
  const verwacht = { object: null, element: 'object', bouwdeel: 'element' };
  for (const kn of knopen) {
    const oc = kn._ouder;
    if (kn.niveau === 'object') {
      if (oc) fouten.push(`Regel ${kn._rij}: een object heeft geen bovenliggende code ("${oc}" genegeerd).`);
    } else if (!oc) {
      fouten.push(`Regel ${kn._rij}: ${kn.niveau} "${kn.naam}" heeft geen bovenliggende code.`);
    } else {
      const ouder = perCode.get(oc);
      if (!ouder) fouten.push(`Regel ${kn._rij}: bovenliggende code "${oc}" bestaat niet.`);
      else if (ouder.niveau !== verwacht[kn.niveau]) fouten.push(`Regel ${kn._rij}: een ${kn.niveau} hoort onder een ${verwacht[kn.niveau]}, niet onder een ${ouder.niveau}.`);
      else kn.ouder = ouder.id;
    }
  }
  return { knopen: opgeschoond(knopen.filter((kn) => kn.niveau === 'object' || kn.ouder)), fouten, indeling: 'lijst' };
}

function leesKolommen(data, k) {
  const fouten = [];
  const knopen = [];
  const perSleutel = new Map();
  const val = (r, s) => (k[s] !== undefined ? r[k[s]] : '');
  const zoekOfMaak = (niveau, code, naam, ouder, rij) => {
    const sleutel = `${niveau}|${ouder ?? ''}|${code || norm(naam)}`;
    let kn = perSleutel.get(sleutel);
    if (!kn) {
      kn = { id: maakId(niveau, `${ouder ?? ''}/${code || naam}`), code, naam: naam || code, niveau, ouder, eenheid: '', hoeveelheid: '', gis: '', _rij: rij };
      perSleutel.set(sleutel, kn);
      knopen.push(kn);
    }
    return kn;
  };
  for (const { r, rij } of data) {
    const delen = NIVEAUS.map((n) => ({ niveau: n, code: val(r, `${n}code`), naam: val(r, n) }));
    const laatste = delen.map((d) => Boolean(d.code || d.naam)).lastIndexOf(true);
    if (laatste < 0) continue;
    if (delen.slice(0, laatste).some((d) => !d.code && !d.naam)) {
      fouten.push(`Regel ${rij}: ${delen[laatste].niveau} zonder bovenliggend ${delen.slice(0, laatste).find((d) => !d.code && !d.naam).niveau}.`);
      continue;
    }
    let ouder = null;
    let kn = null;
    for (let i = 0; i <= laatste; i += 1) {
      kn = zoekOfMaak(delen[i].niveau, delen[i].code, delen[i].naam, ouder, rij);
      ouder = kn.id;
    }
    // Eenheid, hoeveelheid en GIS-code horen bij het diepste niveau van de regel.
    if (val(r, 'eenheid')) kn.eenheid = val(r, 'eenheid');
    if (getal(val(r, 'hoeveelheid')) !== '') kn.hoeveelheid = getal(val(r, 'hoeveelheid'));
    if (val(r, 'gis')) kn.gis = val(r, 'gis');
  }
  return { knopen: opgeschoond(knopen), fouten, indeling: 'kolommen' };
}

function opgeschoond(knopen) {
  return knopen.map(({ _ouder, _rij, ...kn }) => kn);
}

// Stabiele id uit niveau + code, zodat een nieuwe levering dezelfde knopen (en dus koppelingen en scores) behoudt.
function maakId(niveau, sleutel) {
  let h = 2166136261;
  const s = `${niveau}:${norm(sleutel)}`;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${niveau[0]}${(h >>> 0).toString(36)}`;
}

/** Hulpstructuur voor snel opzoeken. */
export function index(knopen) {
  const perId = new Map((knopen ?? []).map((k) => [k.id, k]));
  const kinderen = new Map();
  for (const k of knopen ?? []) {
    const lijst = kinderen.get(k.ouder ?? null) ?? [];
    lijst.push(k);
    kinderen.set(k.ouder ?? null, lijst);
  }
  return { perId, kinderen, knopen: knopen ?? [] };
}

/** Voorouders + de knoop zelf, van object naar beneden. */
export function pad(idx, id) {
  const uit = [];
  let k = idx.perId.get(id);
  while (k && uit.length < 5) { uit.unshift(k); k = k.ouder ? idx.perId.get(k.ouder) : null; }
  return uit;
}

export const padTekst = (idx, id) => pad(idx, id).map((k) => (k.code ? `${k.code} ${k.naam}` : k.naam)).join(' › ');

/** Alle bouwdelen onder (of gelijk aan) een knoop. */
export function bouwdelenOnder(idx, id) {
  const k = idx.perId.get(id);
  if (!k) return [];
  if (k.niveau === 'bouwdeel') return [k];
  return (idx.kinderen.get(k.id) ?? []).flatMap((c) => bouwdelenOnder(idx, c.id));
}

/** Aantallen per niveau. */
export function telling(knopen) {
  const t = { object: 0, element: 0, bouwdeel: 0 };
  for (const k of knopen ?? []) t[k.niveau] = (t[k.niveau] ?? 0) + 1;
  return t;
}

/**
 * Koppelt GIS-objecten automatisch op code: de GIS-code van een knoop (of anders de knoopcode) is gelijk aan de
 * objectcode. Bestaande koppelingen naar knopen die nog bestaan blijven staan, tenzij overschrijven = true.
 * @returns {Map<string, string>} objectId → knoopId (alleen wijzigingen)
 */
export function koppelOpCode(knopen, objecten, { overschrijven = false } = {}) {
  const ids = new Set(knopen.map((k) => k.id));
  const opCode = new Map();
  for (const k of knopen) {
    for (const c of [k.gis, k.code]) {
      const s = norm(c);
      if (s && !opCode.has(s)) opCode.set(s, k.id);
    }
  }
  const uit = new Map();
  for (const o of objecten) {
    if (!overschrijven && o.decomp && ids.has(o.decomp)) continue;
    const kid = opCode.get(norm(o.code));
    if (kid && kid !== o.decomp) uit.set(o.id, kid);
  }
  return uit;
}

/** Is dit een inspectie per bouwdeel (uit de decompositie)? */
export const perBouwdeel = (i) => Array.isArray(i?.bouwdelen) && i.bouwdelen.length > 0;

/**
 * Conditiescore per bouwdeel van één inspectie: het slechtste gebrek op dat bouwdeel, of 1 als het bouwdeel is
 * geïnspecteerd zonder gebreken. Niet geïnspecteerde bouwdelen krijgen geen score.
 * @returns {Array<{id, code, naam, score: number|null, nietGeinspecteerd: boolean, reden: string, gebreken: number}>}
 */
export function bouwdeelScores(inspectie) {
  const gebreken = inspectie?.gebreken ?? [];
  return (inspectie?.bouwdelen ?? []).map((b) => {
    const eigen = gebreken.filter((g) => g.bouwdeelId === b.id);
    const score = b.nietGeinspecteerd ? null : eigen.length ? Math.max(...eigen.map(gebrekScore)) : 1;
    return { id: b.id, code: b.code ?? '', naam: b.naam ?? '', score, nietGeinspecteerd: Boolean(b.nietGeinspecteerd), reden: b.reden ?? '', gebreken: eigen.length };
  });
}

/** Verdeling van de bouwdeelscores (geen gemiddelde of maximum): { 1: n, …, 6: n, niet: n }. */
export function scoreVerdeling(inspectie) {
  const v = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, niet: 0 };
  for (const b of bouwdeelScores(inspectie)) {
    if (b.score === null) v.niet += 1; else v[b.score] += 1;
  }
  return v;
}

/**
 * Laatste score per bouwdeel over alle afgeronde inspecties heen.
 * @returns {Map<string, {score: number, datum: string, inspectieId: string}>}
 */
export function laatsteBouwdeelScores(inspecties) {
  const uit = new Map();
  const gesorteerd = (inspecties ?? []).filter((i) => i.status === 'afgerond' && perBouwdeel(i))
    .sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
  for (const i of gesorteerd) {
    for (const b of bouwdeelScores(i)) {
      if (b.score !== null) uit.set(b.id, { score: b.score, datum: i.datum, inspectieId: i.id });
    }
  }
  return uit;
}

/** Regels voor een sjabloon/export in de lijst-indeling. */
export function naarRegels(knopen) {
  const idx = index(knopen);
  const kop = ['Code', 'Naam', 'Niveau', 'Bovenliggende code', 'Eenheid', 'Hoeveelheid', 'GIS-code'];
  const uit = [kop];
  const loop = (ouder) => {
    for (const k of idx.kinderen.get(ouder) ?? []) {
      uit.push([k.code, k.naam, NIVEAU_LABEL[k.niveau], k.ouder ? idx.perId.get(k.ouder)?.code ?? '' : '', k.eenheid ?? '', k.hoeveelheid ?? '', k.gis ?? '']);
      loop(k.id);
    }
  };
  loop(null);
  return uit;
}

export const SJABLOON = [
  ['Code', 'Naam', 'Niveau', 'Bovenliggende code', 'Eenheid', 'Hoeveelheid', 'GIS-code'],
  ['KW-001', 'Brug Molenweg', 'Object', '', '', '', ''],
  ['KW-001.1', 'Onderbouw', 'Element', 'KW-001', '', '', ''],
  ['KW-001.1.1', 'Landhoofd noord', 'Bouwdeel', 'KW-001.1', 'st', 1, 'KW-001-LH-N'],
  ['KW-001.1.2', 'Landhoofd zuid', 'Bouwdeel', 'KW-001.1', 'st', 1, 'KW-001-LH-Z'],
  ['KW-001.2', 'Bovenbouw', 'Element', 'KW-001', '', '', ''],
  ['KW-001.2.1', 'Brugdek', 'Bouwdeel', 'KW-001.2', 'm2', 240, ''],
  ['KW-001.2.2', 'Leuning', 'Bouwdeel', 'KW-001.2', 'm1', 48, ''],
];

/** Eenvoudige CSV-lezer (puntkomma, komma of tab; aanhalingstekens). */
export function leesCsvTekst(inhoud) {
  const s = String(inhoud ?? '').replace(/^﻿/, '');
  const eerste = s.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].map((c) => [c, eerste.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const regels = [];
  let regel = [];
  let cel = '';
  let quote = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === '"' && s[i + 1] === '"') { cel += '"'; i += 1; } else if (c === '"') quote = false; else cel += c;
    } else if (c === '"') quote = true;
    else if (c === sep) { regel.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      regel.push(cel); regels.push(regel); regel = []; cel = '';
    } else cel += c;
  }
  if (cel || regel.length) { regel.push(cel); regels.push(regel); }
  return regels;
}
