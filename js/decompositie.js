// NEN 2767-decompositie: (systeemdeel →) object → element → bouwdeel, aangeleverd door de opdrachtgever (Excel/CSV).
// GIS-objecten worden op elk niveau aan een knoop gekoppeld; alleen bouwdelen krijgen een conditiescore
// (er wordt niets opgeteld naar element of object). Puur en testbaar: geen DOM, geen opslag.
import { gebrekScore } from './nen2767.js';

// Systeemdeel is een optionele groepering boven de objecten (bijv. "Kunstwerken", "Verharding"); objecten mogen ook zonder.
export const NIVEAUS = ['systeemdeel', 'object', 'element', 'bouwdeel'];
export const NIVEAU_LABEL = { systeemdeel: 'Systeemdeel', object: 'Object', element: 'Element', bouwdeel: 'Bouwdeel' };
export const NIVEAU_MEERVOUD = { systeemdeel: 'systeemdelen', object: 'objecten', element: 'elementen', bouwdeel: 'bouwdelen' };

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
  systeemdeel: ['systeemdeel', 'systeemdeelnaam', 'systeemdeel naam', 'systeem', 'systeemnaam'],
  systeemdeelcode: ['systeemdeelcode', 'systeemdeel code', 'code systeemdeel', 'systeemcode', 'systeem code'],
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
  if (/^(s|sd|sys|systeem|systeemdeel|0|niveau 0)$/.test(s) || s.startsWith('systeem')) return 'systeemdeel';
  if (/^(o|obj|object|1|niveau 1)$/.test(s) || s.startsWith('object')) return 'object';
  if (/^(e|el|element|2|niveau 2)$/.test(s) || s.startsWith('element')) return 'element';
  if (/^(b|bd|bouwdeel|3|niveau 3)$/.test(s) || s.startsWith('bouwdeel') || s.startsWith('onderdeel')) return 'bouwdeel';
  return null;
}

// Ruimere herkenning: elke kolom met "object", "element" of "bouwdeel" in de naam is een code (code, id, nr, nummer)
// of een naam (naam, omschrijving, type) van dat niveau. Zo werken ook "Element ID", "Omschrijving element" of "Elementtype".
const STAM = { systeemdeel: /systeemde(e)?l/, object: /object/, element: /element/, bouwdeel: /bouwde(e)?l|onderde(e)?l/ };
const IS_CODE = /(^|\s)(code|id|nr|nummer|identificatie|guid|sleutel|kenmerk)(\s|$)|(code|id|nr|nummer)$/;
const IS_NAAM = /(^|\s)(naam|omschrijving|benaming|type|titel|beschrijving)(\s|$)|(naam|omschrijving|type)$/;
function vindKolom(kop, niveau, soort, bezet = new Set()) {
  const k = kop.map(norm);
  const kand = k.map((h, i) => ({ h, i })).filter(({ h, i }) => h && !bezet.has(i) && STAM[niveau].test(h) && !/gis/.test(h)
    // "Elementen" mag niet als bouwdeel tellen en "bouwdeel" niet als element.
    && !(niveau === 'element' && STAM.bouwdeel.test(h)));
  if (soort === 'code') return kand.find((x) => IS_CODE.test(x.h))?.i ?? -1;
  return (kand.find((x) => IS_NAAM.test(x.h)) ?? kand.find((x) => !IS_CODE.test(x.h)))?.i ?? -1;
}

/** Alle (niet-lege) kolommen van een regel als { kolomnaam: waarde }; bewaard per onderdeel ("kenmerken"). */
function rijKenmerken(kopRuw, r, indexen = null) {
  const uit = {};
  (indexen ?? kopRuw.map((_, i) => i)).forEach((i) => {
    const h = tekst(kopRuw[i]);
    const v = tekst(r[i]);
    if (h && v && !(h in uit)) uit[h] = v;
  });
  return uit;
}
/** Niveau waar een kolom bij hoort (op de kolomnaam), of null. */
function kolomNiveau(h) {
  const s = norm(h);
  if (STAM.bouwdeel.test(s)) return 'bouwdeel';
  if (STAM.element.test(s)) return 'element';
  if (STAM.object.test(s) && !/gis/.test(s)) return 'object';
  if (STAM.systeemdeel.test(s)) return 'systeemdeel';
  return null;
}

function kolommen(kop) {
  const genorm = kop.map(norm);
  const uit = {};
  for (const [sleutel, namen] of Object.entries(KOPPEN)) {
    const i = genorm.findIndex((k) => namen.includes(k));
    if (i >= 0) uit[sleutel] = i;
  }
  // Ruimer zoeken naar object-, element- en bouwdeelkolommen (niet bij een lijst met een kolom Niveau).
  if (uit.niveau === undefined) {
    const bezet = new Set(Object.values(uit));
    for (const n of NIVEAUS) {
      if (uit[`${n}code`] === undefined) { const i = vindKolom(kop, n, 'code', bezet); if (i >= 0) { uit[`${n}code`] = i; bezet.add(i); } }
      if (uit[n] === undefined) { const i = vindKolom(kop, n, 'naam', bezet); if (i >= 0) { uit[n] = i; bezet.add(i); } }
    }
  }
  return uit;
}

/** Leesbare samenvatting van de herkende kolommen (voor het voorbeeld bij het inlezen). */
export function herkendeKolommen(kop) {
  const k = kolommen(kop.map(tekst));
  const naam = (i) => (i === undefined || i < 0 ? null : kop[i]);
  return NIVEAUS.filter((n) => n !== 'systeemdeel' || naam(k[`${n}code`]) || naam(k[n])).map((n) => {
    const c = naam(k[`${n}code`]);
    const m = naam(k[n]);
    return c || m ? `${NIVEAU_LABEL[n].toLowerCase()}: ${[c, m].filter(Boolean).join(' + ')}` : `${NIVEAU_LABEL[n].toLowerCase()}: –`;
  }).join(' · ');
}

/**
 * Leest een decompositie uit tabelregels (eerste regel = kolomkoppen). Twee indelingen:
 *  1. Lijst: Code · Naam · Niveau · Bovenliggende code (· Eenheid · Hoeveelheid · GIS-code)
 *  2. Kolommen: (Systeemdeel ·) Object · Element · Bouwdeel (met optioneel Objectcode/Elementcode/Bouwdeelcode, Eenheid, Hoeveelheid, GIS-code)
 * @param {Array<Array<any>>} regels
 * @returns {{ knopen: object[], fouten: string[], indeling: 'lijst'|'kolommen'|null }}
 */
export function leesDecompositie(regels) {
  const rijen = (regels ?? []).map((r) => (r ?? []).map(tekst));
  const start = rijen.findIndex((r) => r.some((c) => c));
  if (start < 0) return { knopen: [], fouten: ['Het bestand is leeg.'], indeling: null };
  const k = kolommen(rijen[start]);
  const kop = rijen[start].filter(Boolean);
  const data = rijen.slice(start + 1).map((r, i) => ({ r, rij: start + i + 2 })).filter(({ r }) => r.some((c) => c));
  const kopRuw = rijen[start];
  if (k.niveau !== undefined && (k.code !== undefined || k.naam !== undefined)) return { ...leesLijst(data, k, kopRuw), kop };
  if (k.systeemdeel !== undefined || k.systeemdeelcode !== undefined || k.object !== undefined || k.element !== undefined || k.bouwdeel !== undefined
    || k.objectcode !== undefined || k.elementcode !== undefined || k.bouwdeelcode !== undefined) return { ...leesKolommen(data, k, kopRuw), kop };
  return {
    knopen: [], indeling: null, kop,
    fouten: ['Kolommen niet herkend. Gebruik "Code, Naam, Niveau, Bovenliggende code" of "Object, Element, Bouwdeel".'],
  };
}

function leesLijst(data, k, kopRuw = []) {
  const fouten = [];
  const knopen = [];
  const perCode = new Map();
  for (const { r, rij } of data) {
    const niveau = niveauVan(r[k.niveau]);
    const code = k.code !== undefined ? r[k.code] : '';
    const naam = k.naam !== undefined ? r[k.naam] : '';
    if (!niveau) { fouten.push(`Regel ${rij}: onbekend niveau "${r[k.niveau]}" (gebruik systeemdeel, object, element of bouwdeel).`); continue; }
    if (!code && !naam) { fouten.push(`Regel ${rij}: code en naam ontbreken.`); continue; }
    const sleutel = code || `${niveau}:${naam}`;
    if (perCode.has(sleutel)) { fouten.push(`Regel ${rij}: code "${sleutel}" komt dubbel voor.`); continue; }
    const knoop = {
      id: maakId(niveau, sleutel), code, naam: naam || code, niveau, ouder: null,
      eenheid: k.eenheid !== undefined ? r[k.eenheid] : '', hoeveelheid: k.hoeveelheid !== undefined ? getal(r[k.hoeveelheid]) : '',
      gis: k.gis !== undefined ? r[k.gis] : '', _ouder: k.ouder !== undefined ? r[k.ouder] : '', _rij: rij,
      kenmerken: rijKenmerken(kopRuw, r),
    };
    perCode.set(sleutel, knoop);
    knopen.push(knoop);
  }
  const verwacht = { systeemdeel: null, object: 'systeemdeel', element: 'object', bouwdeel: 'element' };
  for (const kn of knopen) {
    const oc = kn._ouder;
    if (kn.niveau === 'systeemdeel') {
      if (oc) fouten.push(`Regel ${kn._rij}: een systeemdeel heeft geen bovenliggende code ("${oc}" genegeerd).`);
    } else if (kn.niveau === 'object' && !oc) {
      // Object zonder systeemdeel: bovenaan in de boom.
    } else if (!oc) {
      fouten.push(`Regel ${kn._rij}: ${kn.niveau} "${kn.naam}" heeft geen bovenliggende code.`);
    } else {
      const ouder = perCode.get(oc);
      if (!ouder) fouten.push(`Regel ${kn._rij}: bovenliggende code "${oc}" bestaat niet.`);
      else if (ouder.niveau !== verwacht[kn.niveau]) fouten.push(`Regel ${kn._rij}: een ${kn.niveau} hoort onder een ${verwacht[kn.niveau]}, niet onder een ${ouder.niveau}.`);
      else kn.ouder = ouder.id;
    }
  }
  return { knopen: opgeschoond(knopen.filter((kn) => (kn.niveau === 'object' && !kn._ouder) || kn.niveau === 'systeemdeel' || kn.ouder)), fouten, indeling: 'lijst' };
}

function leesKolommen(data, k, kopRuw = []) {
  // Kolommen met "object", "element" of "bouwdeel" in de naam horen bij dat niveau; de rest bij het diepste onderdeel van de regel.
  const perNiveauKol = { systeemdeel: [], object: [], element: [], bouwdeel: [], rest: [] };
  kopRuw.forEach((h, i) => { if (tekst(h)) perNiveauKol[kolomNiveau(h) ?? 'rest'].push(i); });
  const fouten = [];
  const knopen = [];
  const perSleutel = new Map();
  const val = (r, s) => (k[s] !== undefined ? r[k[s]] : '');
  const zoekOfMaak = (niveau, code, naam, ouder, rij) => {
    const sleutel = `${niveau}|${ouder ?? ''}|${code || norm(naam)}`;
    let kn = perSleutel.get(sleutel);
    if (!kn) {
      kn = { id: maakId(niveau, `${ouder ?? ''}/${code || naam}`), code, naam: naam || code, niveau, ouder, eenheid: '', hoeveelheid: '', gis: '', _rij: rij, kenmerken: {} };
      perSleutel.set(sleutel, kn);
      knopen.push(kn);
    }
    return kn;
  };
  for (const { r, rij } of data) {
    // Een losse kolom "Code" naast Object/Element/Bouwdeel hoort bij het diepste niveau (het bouwdeel).
    const delen = NIVEAUS.map((n) => ({ niveau: n, code: val(r, `${n}code`) || (n === 'bouwdeel' && k.bouwdeelcode === undefined ? val(r, 'code') : ''), naam: val(r, n) }));
    const laatste = delen.map((d) => Boolean(d.code || d.naam)).lastIndexOf(true);
    if (laatste < 0) continue;
    // Het systeemdeel (index 0) is optioneel; vanaf het object moet elk niveau boven het laatste gevuld zijn.
    const leeg = (d) => !d.code && !d.naam;
    if (delen.slice(1, laatste).some(leeg)) {
      fouten.push(`Regel ${rij}: ${delen[laatste].niveau} zonder bovenliggend ${delen.slice(1, laatste).find(leeg).niveau}.`);
      continue;
    }
    let ouder = null;
    let kn = null;
    for (let i = leeg(delen[0]) ? 1 : 0; i <= laatste; i += 1) {
      kn = zoekOfMaak(delen[i].niveau, delen[i].code, delen[i].naam, ouder, rij);
      ouder = kn.id;
      const eigen = rijKenmerken(kopRuw, r, [...perNiveauKol[delen[i].niveau], ...(i === laatste ? perNiveauKol.rest : [])]);
      for (const [h, v] of Object.entries(eigen)) if (!(h in kn.kenmerken)) kn.kenmerken[h] = v;
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

/**
 * Vergelijkt de kolomkoppen van een nieuwe levering met die van het eerste bestand.
 * Bijwerken kan alleen als alle oorspronkelijke kolommen er (met dezelfde naam) nog in staan.
 */
export function vergelijkKolommen(oud, nieuw) {
  const n = new Set((nieuw ?? []).map(norm));
  const o = new Set((oud ?? []).map(norm));
  return { ontbreekt: (oud ?? []).filter((k) => !n.has(norm(k))), extra: (nieuw ?? []).filter((k) => !o.has(norm(k))) };
}

export const SLEUTELS = { code: 'Code', gis: 'GIS-code' };
const VELD_LABEL = { naam: 'naam', code: 'code', eenheid: 'eenheid', hoeveelheid: 'hoeveelheid', gis: 'GIS-code', ouder: 'plaats in de boom' };

/**
 * Werkt een bestaande decompositie bij met een nieuwe levering. Onderdelen worden herkend op een code die hetzelfde
 * is gebleven (sleutel = 'code' of 'gis', per niveau); die houden hun id, dus GIS-koppelingen en scores blijven.
 * @returns {{ knopen, gewijzigd: {knoop, velden: string[]}[], toegevoegd: object[], vervallen: object[], ongewijzigd: number, fouten: string[] }}
 */
export function bijwerken(oud, nieuw, sleutel = 'code') {
  const fouten = [];
  const sl = (k) => norm(k[sleutel]);
  const oudPer = new Map();
  for (const k of oud ?? []) if (sl(k)) oudPer.set(`${k.niveau}|${sl(k)}`, k);
  const oudeIds = new Set((oud ?? []).map((k) => k.id));
  const gebruikt = new Set();
  const idMap = new Map();
  let teller = 0;
  for (const k of nieuw ?? []) {
    const s = sl(k);
    const o = s ? oudPer.get(`${k.niveau}|${s}`) : null;
    if (o && gebruikt.has(o.id)) fouten.push(`${SLEUTELS[sleutel]} "${k[sleutel]}" komt dubbel voor bij ${NIVEAU_LABEL[k.niveau].toLowerCase()}en; de tweede wordt als nieuw onderdeel gezien.`);
    if (o && !gebruikt.has(o.id)) {
      gebruikt.add(o.id);
      idMap.set(k.id, o.id);
    } else {
      let id = k.id;
      while (oudeIds.has(id) || [...idMap.values()].includes(id)) { teller += 1; id = `${k.id}n${teller}`; }
      idMap.set(k.id, id);
    }
  }
  const knopen = (nieuw ?? []).map((k) => ({ ...k, id: idMap.get(k.id), ouder: k.ouder ? idMap.get(k.ouder) ?? null : null }));
  const oudPerId = new Map((oud ?? []).map((k) => [k.id, k]));
  const gewijzigd = [];
  const toegevoegd = [];
  let ongewijzigd = 0;
  for (const k of knopen) {
    const o = oudPerId.get(k.id);
    if (!o) { toegevoegd.push(k); continue; }
    const velden = Object.keys(VELD_LABEL).filter((v) => String(o[v] ?? '') !== String(k[v] ?? '')).map((v) => VELD_LABEL[v]);
    if (velden.length) gewijzigd.push({ knoop: k, velden }); else ongewijzigd += 1;
  }
  const vervallen = (oud ?? []).filter((k) => !gebruikt.has(k.id));
  return { knopen, gewijzigd, toegevoegd, vervallen, ongewijzigd, fouten };
}

export const KIND_NIVEAU = { systeemdeel: 'object', object: 'element', element: 'bouwdeel', bouwdeel: null };

/** Past één onderdeel aan (naam, code, eenheid, hoeveelheid, GIS-code). Code moet uniek zijn binnen het niveau. */
export function pasKnoopAan(knopen, id, wijziging) {
  const k = knopen.find((x) => x.id === id);
  if (!k) return { fout: 'Onderdeel niet gevonden.' };
  const nieuw = { ...k, ...wijziging, naam: String(wijziging.naam ?? k.naam).trim(), code: String(wijziging.code ?? k.code ?? '').trim() };
  if (!nieuw.naam) return { fout: 'Vul een naam in.' };
  if (nieuw.code && knopen.some((x) => x.id !== id && x.niveau === k.niveau && norm(x.code) === norm(nieuw.code))) {
    return { fout: `De code "${nieuw.code}" bestaat al bij een ander ${NIVEAU_LABEL[k.niveau].toLowerCase()}.` };
  }
  return { knopen: knopen.map((x) => (x.id === id ? nieuw : x)) };
}

/** Voegt een onderdeel toe: bovenaan (ouder = null) een systeemdeel of object, of het niveau eronder onder de ouder. */
export function voegKnoopToe(knopen, ouderId, data, id, bovenNiveau = 'object') {
  const ouder = ouderId ? knopen.find((x) => x.id === ouderId) : null;
  if (ouderId && !ouder) return { fout: 'Bovenliggend onderdeel niet gevonden.' };
  const niveau = ouder ? KIND_NIVEAU[ouder.niveau] : (bovenNiveau === 'systeemdeel' ? 'systeemdeel' : 'object');
  if (!niveau) return { fout: 'Onder een bouwdeel kan niets meer worden toegevoegd.' };
  const k = { id, code: '', naam: '', niveau, ouder: ouder?.id ?? null, eenheid: '', hoeveelheid: '', gis: '' };
  const r = pasKnoopAan([...knopen, k], id, data);
  return r.fout ? r : { knopen: r.knopen, knoop: r.knopen.find((x) => x.id === id) };
}

/** Verwijdert een onderdeel met alles eronder. */
export function verwijderKnoop(knopen, id) {
  const weg = new Set([id]);
  let groei = true;
  while (groei) {
    groei = false;
    for (const k of knopen) if (k.ouder && weg.has(k.ouder) && !weg.has(k.id)) { weg.add(k.id); groei = true; }
  }
  return { knopen: knopen.filter((k) => !weg.has(k.id)), weg };
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

/** Voorouders + de knoop zelf, van boven naar beneden. */
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
  const t = { systeemdeel: 0, object: 0, element: 0, bouwdeel: 0 };
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

/** Waarde van een GIS-object voor een koppelkolom: 'code', 'naam' of 'kenmerk:<naam>'. */
export function gisWaarde(o, kolom) {
  if (kolom === 'code') return o?.code ?? '';
  if (kolom === 'naam') return o?.naam ?? '';
  if (String(kolom).startsWith('kenmerk:')) {
    const v = o?.kenmerken?.[String(kolom).slice(8)];
    return v === null || v === undefined || typeof v === 'object' ? '' : String(v);
  }
  return '';
}
export const KOPPEL_VELDEN = { code: 'Code', gis: 'GIS-code', naam: 'Naam' };
/** Waarde van een onderdeel voor een koppelveld: 'auto', 'code', 'gis', 'naam' of 'kenmerk:<kolom>'. */
export function knoopWaarde(k, veld) {
  if (veld === 'auto' || !veld) return k?.gis || k?.code || '';
  if (String(veld).startsWith('kenmerk:')) return k?.kenmerken?.[String(veld).slice(8)] ?? '';
  return k?.[veld] ?? '';
}
/** Alle kolomnamen uit de ingelezen decompositie (eventueel voor één niveau), met een voorbeeldwaarde. */
export function decompKolommen(knopen, niveau = '') {
  const m = new Map();
  for (const k of knopen ?? []) {
    if (niveau && k.niveau !== niveau) continue;
    for (const [h, v] of Object.entries(k.kenmerken ?? {})) if (!m.has(h)) m.set(h, v);
  }
  return [...m.entries()];
}
export const STANDAARD_KOPPELING = { kolom: 'code', veld: 'auto', niveau: '', laag: '' };

/**
 * Koppelt GIS-objecten aan onderdelen door een kolom van het GIS-object te vergelijken met een veld van de decompositie.
 * @param {object[]} knopen
 * @param {object[]} objecten
 * @param {{ kolom?: string, veld?: 'code'|'gis'|'naam'|'auto', niveau?: ''|'object'|'element'|'bouwdeel', laag?: string, overschrijven?: boolean }} opties
 *        veld 'auto' = GIS-code, en anders de code (zoals het automatisch koppelen bij inlezen).
 * @returns {{ wijzigingen: Map<string,string>, nieuw: {object, knoop, was}[], alGoed: number, anders: {object, knoop, was}[],
 *            dubbel: {waarde: string, knopen: object[]}[], zonderMatch: object[], zonderWaarde: number, knopenZonderGis: object[] }}
 */
export function koppelOpKolom(knopen, objecten, { kolom = 'code', veld = 'auto', niveau = '', laag = '', overschrijven = false } = {}) {
  const perId = new Map(knopen.map((k) => [k.id, k]));
  const kand = knopen.filter((k) => !niveau || k.niveau === niveau);
  const opWaarde = new Map();
  const zet = (w, k) => {
    const s = norm(w);
    if (!s) return;
    const l = opWaarde.get(s) ?? [];
    if (!l.includes(k)) l.push(k);
    opWaarde.set(s, l);
  };
  for (const k of kand) {
    if (veld === 'auto') { if (k.gis) zet(k.gis, k); else zet(k.code, k); }
    else if (String(veld).startsWith('kenmerk:')) zet(k.kenmerken?.[String(veld).slice(8)], k);
    else zet(k[veld], k);
  }
  const dubbel = [...opWaarde.entries()].filter(([, l]) => l.length > 1).map(([w, l]) => ({ waarde: w, knopen: l }));
  const objs = objecten.filter((o) => !laag || (laag === '-' ? !o.laagId : o.laagId === laag));
  const wijzigingen = new Map();
  const nieuw = [];
  const anders = [];
  const zonderMatch = [];
  const gekoppeld = new Set();
  let alGoed = 0;
  let zonderWaarde = 0;
  for (const o of objs) {
    const w = norm(gisWaarde(o, kolom));
    if (!w) { zonderWaarde += 1; continue; }
    const l = opWaarde.get(w);
    if (!l) { zonderMatch.push(o); continue; }
    if (l.length > 1) continue; // dubbele waarde: niet automatisch kiezen
    const k = l[0];
    gekoppeld.add(k.id);
    if (o.decomp === k.id) { alGoed += 1; continue; }
    const was = o.decomp && perId.has(o.decomp) ? perId.get(o.decomp) : null;
    if (was && !overschrijven) { anders.push({ object: o, knoop: k, was }); continue; }
    wijzigingen.set(o.id, k.id);
    nieuw.push({ object: o, knoop: k, was });
  }
  for (const o of objecten) if (o.decomp && perId.has(o.decomp)) gekoppeld.add(o.decomp);
  const knopenZonderGis = kand.filter((k) => !gekoppeld.has(k.id));
  return { wijzigingen, nieuw, alGoed, anders, dubbel, zonderMatch, zonderWaarde, knopenZonderGis };
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
  ['SD-KW', 'Kunstwerken', 'Systeemdeel', '', '', '', ''],
  ['KW-001', 'Brug Molenweg', 'Object', 'SD-KW', '', '', ''],
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

/** Niveau van een tabblad op basis van de naam (bijv. "Systeemdelen", "Objecten", "Elementen", "Bouwdelen"). */
export function niveauVanBlad(naam) {
  const s = norm(naam);
  if (/bouwde(e)?l|onderde(e)?l/.test(s)) return 'bouwdeel';
  if (/systeemde(e)?l|^systemen$/.test(s)) return 'systeemdeel';
  if (/element/.test(s)) return 'element';
  if (/object/.test(s)) return 'object';
  return null;
}

const OUDER_NIVEAU = { object: 'systeemdeel', element: 'object', bouwdeel: 'element' };
const OUDER_OPTIONEEL = new Set(['object']); // een object mag zonder systeemdeel

/** Kolommen in een tabblad per niveau: code, naam, bovenliggend onderdeel, eenheid, hoeveelheid, GIS-code. */
function bladKolommen(kop, niveau) {
  const k = kop.map(norm);
  const zoek = (...namen) => { for (const n of namen) { const i = k.indexOf(norm(n)); if (i >= 0) return i; } return -1; };
  const ouder = OUDER_NIVEAU[niveau];
  const bezet = new Set();
  const neem = (i) => { if (i >= 0) bezet.add(i); return i; };
  // Eerst de kolommen van het bovenliggende niveau, zodat "Objectcode" in het tabblad Elementen niet als elementcode telt.
  const ouderKol = ouder ? neem((() => {
    const i = zoek(`${ouder}code`, `${ouder} code`, `code ${ouder}`, `${ouder}id`, 'bovenliggende code', 'bovenliggend', 'ouder', 'ouder code', 'parent', 'parent code', 'hoort bij');
    if (i >= 0) return i;
    const c = vindKolom(kop, ouder, 'code');
    return c >= 0 ? c : (zoek(ouder, `${ouder}naam`) >= 0 ? zoek(ouder, `${ouder}naam`) : vindKolom(kop, ouder, 'naam'));
  })()) : -1;
  const code = neem((() => {
    const i = zoek(`${niveau}code`, `${niveau} code`, `code ${niveau}`, `${niveau}id`, `${niveau} id`);
    if (i >= 0) return i;
    const v = vindKolom(kop, niveau, 'code', bezet);
    if (v >= 0) return v;
    const g = zoek('code', 'id', 'nummer', 'nr');
    return bezet.has(g) ? -1 : g;
  })());
  const naamKol = (() => {
    const i = zoek(`${niveau}naam`, `${niveau} naam`, 'naam', 'omschrijving', 'benaming', niveau, `${niveau}omschrijving`);
    if (i >= 0 && !bezet.has(i)) return i;
    return vindKolom(kop, niveau, 'naam', bezet);
  })();
  return {
    code,
    naam: naamKol,
    ouder: ouderKol,
    eenheid: zoek('eenheid', 'unit'),
    hoeveelheid: zoek('hoeveelheid', 'aantal', 'omvang', 'quantity'),
    gis: zoek('gis code', 'gis', 'gis id', 'gis objectcode', 'objectcode gis', 'beheer id', 'koppelcode'),
  };
}

/**
 * Leest een werkboek met (mogelijk) meerdere tabbladen.
 *  - Tabbladen per niveau ((Systeemdelen /) Objecten / Elementen / Bouwdelen): elk blad heeft een code en naam, en (behalve objecten) een kolom met de
 *    code of naam van het bovenliggende onderdeel. Andere tabbladen worden genegeerd.
 *  - Anders: het tabblad met de meeste herkende onderdelen (lijst- of kolommenindeling).
 * @param {{ naam: string, regels: any[][] }[]} bladen
 * @returns {ReturnType<typeof leesDecompositie> & { bladen: { naam: string, niveau: string|null, rijen: number, gebruikt: boolean }[] }}
 */
export function leesBladen(bladen) {
  const lijst = (bladen ?? []).filter((b) => (b.regels ?? []).some((r) => (r ?? []).some((c) => tekst(c))));
  if (!lijst.length) return { knopen: [], fouten: ['Het bestand is leeg.'], indeling: null, kop: [], bladen: [] };
  const perNiveau = lijst.map((b) => ({ ...b, niveau: niveauVanBlad(b.naam) })).filter((b) => b.niveau);
  const kopVan = (b) => {
    const rijen = b.regels.map((r) => (r ?? []).map(tekst));
    return (rijen[rijen.findIndex((r) => r.some((c) => c))] ?? []).filter(Boolean);
  };
  // Standaard: het tabblad Bouwdelen, als daarin per regel object, element en bouwdeel (met codes) staan.
  const bdBlad = perNiveau.find((b) => b.niveau === 'bouwdeel');
  if (bdBlad) {
    const r = leesDecompositie(bdBlad.regels);
    const t = telling(r.knopen);
    if (r.indeling === 'kolommen' && t.object && t.bouwdeel) {
      // Namen die in Bouwdelen ontbreken (alleen een code) aanvullen uit de tabbladen Objecten en Elementen.
      const gebruiktVoorNamen = new Set();
      for (const niveau of ['systeemdeel', 'object', 'element']) {
        const namen = new Map();
        const kenm = new Map();
        for (const b of perNiveau.filter((x) => x.niveau === niveau)) {
          const rijen = b.regels.map((x) => (x ?? []).map(tekst));
          const start = rijen.findIndex((x) => x.some((c) => c));
          const k = bladKolommen(rijen[start], niveau);
          if (k.code < 0) continue;
          for (const x of rijen.slice(start + 1)) {
            if (!x[k.code]) continue;
            if (x[k.naam]) namen.set(norm(x[k.code]), x[k.naam]);
            kenm.set(norm(x[k.code]), { ...(kenm.get(norm(x[k.code])) ?? {}), ...rijKenmerken(rijen[start], x) });
          }
          if (namen.size || kenm.size) gebruiktVoorNamen.add(b.naam);
        }
        for (const kn of r.knopen) {
          if (kn.niveau !== niveau || !kn.code) continue;
          if ((!kn.naam || kn.naam === kn.code) && namen.has(norm(kn.code))) kn.naam = namen.get(norm(kn.code));
          // Alle kolommen uit het tabblad Objecten/Elementen erbij (zonder die uit Bouwdelen te overschrijven).
          for (const [h, v] of Object.entries(kenm.get(norm(kn.code)) ?? {})) if (!(h in (kn.kenmerken ??= {}))) kn.kenmerken[h] = v;
        }
      }
      return {
        ...r, indeling: 'tabblad-bouwdelen', kop: kopVan(bdBlad).map((c) => `${bdBlad.naam} › ${c}`),
        fouten: r.fouten.map((f) => f.replace(/^Regel (\d+):/, `Tabblad "${bdBlad.naam}", regel $1:`)),
        bladen: lijst.map((b) => {
          const deze = b.naam === bdBlad.naam;
          return { naam: b.naam, niveau: niveauVanBlad(b.naam), rijen: deze ? r.knopen.length : 0,
            gebruikt: deze, rol: deze ? 'decompositie' : gebruiktVoorNamen.has(b.naam) ? 'namen' : '', herkend: deze ? herkendeKolommen(kopVan(bdBlad)) : '' };
        }),
      };
    }
  }
  const niveaus = new Set(perNiveau.map((b) => b.niveau));
  if (niveaus.size >= 2) {
    const fouten = [];
    const regels = [['Code', 'Naam', 'Niveau', 'Bovenliggende code', 'Eenheid', 'Hoeveelheid', 'GIS-code']];
    const info = [];
    const naamNaarCode = { systeemdeel: new Map(), object: new Map(), element: new Map() };
    const codes = { systeemdeel: new Set(), object: new Set(), element: new Set() };
    const tijdelijk = [];
    for (const niveau of NIVEAUS) {
      for (const b of perNiveau.filter((x) => x.niveau === niveau)) {
        const rijen = b.regels.map((r) => (r ?? []).map(tekst));
        const start = rijen.findIndex((r) => r.some((c) => c));
        const kop = rijen[start];
        const k = bladKolommen(kop, niveau);
        let n = 0;
        if (k.code < 0 && k.naam < 0) { fouten.push(`Tabblad "${b.naam}": geen kolom met code of naam gevonden.`); info.push({ naam: b.naam, niveau, rijen: 0, gebruikt: false }); continue; }
        if (OUDER_NIVEAU[niveau] && !OUDER_OPTIONEEL.has(niveau) && k.ouder < 0) fouten.push(`Tabblad "${b.naam}": geen kolom met het bovenliggende ${OUDER_NIVEAU[niveau]} gevonden (bijv. "${OUDER_NIVEAU[niveau]}code").`);
        rijen.slice(start + 1).forEach((r, i) => {
          const code = k.code >= 0 ? r[k.code] : '';
          const naam = k.naam >= 0 ? r[k.naam] : '';
          if (!code && !naam) return;
          n += 1;
          if (niveau !== 'bouwdeel') {
            // Sleutel zoals de lijst-indeling hem gebruikt: de code, of zonder code "niveau:naam".
            const sleutel = code || `${niveau}:${naam}`;
            codes[niveau].add(sleutel);
            if (naam) naamNaarCode[niveau].set(norm(naam), sleutel);
          }
          tijdelijk.push({ code, naam, niveau, ouder: k.ouder >= 0 ? r[k.ouder] : '', eenheid: k.eenheid >= 0 ? r[k.eenheid] : '', hoeveelheid: k.hoeveelheid >= 0 ? r[k.hoeveelheid] : '',
            gis: k.gis >= 0 ? r[k.gis] : '', blad: b.naam, rij: start + i + 2, kenmerken: rijKenmerken(kop, r) });
        });
        const kn = (i) => (i >= 0 ? kop[i] : '–');
        info.push({ naam: b.naam, niveau, rijen: n, gebruikt: true,
          herkend: `code: ${kn(k.code)} · naam: ${kn(k.naam)}${OUDER_NIVEAU[niveau] && (k.ouder >= 0 || !OUDER_OPTIONEEL.has(niveau)) ? ` · hoort bij ${OUDER_NIVEAU[niveau]}: ${kn(k.ouder)}` : ''}` });
      }
    }
    for (const t of tijdelijk) {
      let ouder = t.ouder;
      const on = OUDER_NIVEAU[t.niveau];
      // Bovenliggend onderdeel mag ook met de naam worden aangeduid.
      if (on && ouder && !codes[on].has(ouder) && naamNaarCode[on].has(norm(ouder))) ouder = naamNaarCode[on].get(norm(ouder));
      regels.push([t.code, t.naam, t.niveau, ouder, t.eenheid, t.hoeveelheid, t.gis]);
    }
    const res = leesDecompositie(regels);
    // De kolommen van het eigen tabblad horen bij het onderdeel (niet de kolommen van de samengevoegde lijst).
    const kenmPer = new Map(tijdelijk.map((t) => [`${t.niveau}|${norm(t.code || t.naam)}`, t.kenmerken]));
    for (const kn of res.knopen) kn.kenmerken = kenmPer.get(`${kn.niveau}|${norm(kn.code || kn.naam)}`) ?? {};
    // Regelnummers in meldingen verwijzen naar de samengevoegde lijst; zet ze om naar tabblad en regel.
    res.fouten = [...fouten, ...res.fouten.map((f) => f.replace(/^Regel (\d+):/, (_, n) => {
      const t = tijdelijk[Number(n) - 2];
      return t ? `Tabblad "${t.blad}", regel ${t.rij}:` : `Regel ${n}:`;
    }))];
    for (const b of lijst.filter((x) => !niveauVanBlad(x.naam))) info.push({ naam: b.naam, niveau: null, rijen: 0, gebruikt: false });
    return { ...res, indeling: 'tabbladen', kop: perNiveau.flatMap((b) => {
      const rijen = b.regels.map((r) => (r ?? []).map(tekst));
      return (rijen[rijen.findIndex((r) => r.some((c) => c))] ?? []).filter(Boolean).map((c) => `${b.naam} › ${c}`);
    }), bladen: info };
  }
  // Eén tabblad met de hele decompositie: neem het blad met de meeste onderdelen.
  let beste = null;
  for (const b of lijst) {
    const r = leesDecompositie(b.regels);
    if (!beste || r.knopen.length > beste.res.knopen.length) beste = { b, res: r };
  }
  return { ...beste.res, bladen: lijst.map((b) => ({ naam: b.naam, niveau: null, rijen: b === beste.b ? beste.res.knopen.length : 0, gebruikt: b === beste.b })) };
}
