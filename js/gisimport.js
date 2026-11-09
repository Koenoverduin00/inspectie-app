// GIS inladen met zo min mogelijk invoer: lagen splitsen per geometriesoort, instellingen
// raden, fouten afvangen en een al ingeladen laag herkennen (bijwerken in plaats van dubbel).
// Pure functies; de schermen staan in app.js.
import { soortGeometrie, middelpunt } from './gis.js';

export const SOORT_MEERVOUD = { vlak: 'vlakken', lijn: 'lijnen', punt: 'punten' };

/** Splitst lagen met gemengde geometrie (vlakken + lijnen + punten) in één laag per soort. */
export function splitsOpGeometrie(lagen) {
  const uit = [];
  for (const l of lagen) {
    const groepen = new Map();
    let leeg = l.overgeslagen ?? 0;
    for (const f of l.features) {
      const s = soortGeometrie(f.geometry);
      if (!s) { leeg++; continue; }
      if (!groepen.has(s)) groepen.set(s, []);
      groepen.get(s).push(f);
    }
    const meer = groepen.size > 1;
    for (const [s, features] of groepen) {
      uit.push({ ...l, naam: meer ? `${l.naam} (${SOORT_MEERVOUD[s]})` : l.naam, bronLaag: l.naam, soort: s, features, overgeslagen: meer ? 0 : leeg });
    }
    if (meer && leeg) uit[uit.length - 1].overgeslagen = leeg;
  }
  return uit;
}

const binnenBereik = (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
function alleCoordinaten(g, fn) {
  const loop = (c) => { if (typeof c?.[0] === 'number') fn(c); else c?.forEach?.(loop); };
  if (g?.type === 'GeometryCollection') g.geometries.forEach((x) => alleCoordinaten(x, fn));
  else loop(g?.coordinates);
}

/** Verwijdert onbruikbare features en telt wat er mis was. */
export function controleerFeatures(features) {
  const goed = [];
  let ongeldig = 0;
  let buitenNl = 0;
  for (const f of features) {
    let ok = true;
    alleCoordinaten(f.geometry, (c) => { if (!binnenBereik(c)) ok = false; });
    if (!ok) { ongeldig++; continue; }
    const m = middelpunt(f.geometry);
    if (m && !(m[0] > 2.5 && m[0] < 7.6 && m[1] > 50.5 && m[1] < 54)) buitenNl++;
    goed.push(f);
  }
  return { features: goed, ongeldig, buitenNl };
}

const CODE_HINT = /^(code|id|objectcode|objectid|object_id|nummer|nr|identificatie|vak_?id|objectnummer|boomnummer|boom_?nr|boom_?id|boomcode|vaknr|vaknummer|vakcode|guid|uuid|fid|gid|key|beheercode|elementnr|element_?id)$/i;
const NAAM_HINT = /^(naam|name|omschrijving|titel|label|straatnaam|straat|openbareruimtenaam|objectnaam|locatie|benaming)$/i;
const NIET_ALS_CODE = /^(fid|gid|objectid|ogc_fid|ogr_fid)$/i; // technische nummers alleen als niets beters bestaat

const TYPE_UIT_NAAM = [
  [/singel|houtwal|bosplantsoen|^bos|gesloten|struweel|hakhout/i, 'Gesloten beplanting'],
  [/boom|bomen|tree/i, 'Boom'],
  [/fiets/i, 'Fietspad'],
  [/groen|gras|gazon|heester|beplanting|berm/i, 'Groenvak'],
  [/weg|verhard|klinker|asfalt|trottoir|stoep|rijbaan/i, 'Verhardingsvak'],
  [/water|sloot|gracht|oever|vijver|watergang/i, 'Watergang / oever'],
  [/brug|viaduct/i, 'Brug (vast)'],
  [/duiker/i, 'Duiker'],
  [/riool|put|kolk/i, 'Riolering'],
  [/speel/i, 'Speelplek'],
  [/lantaarn|verlichting|mast/i, 'Openbare verlichting'],
];

/** Raadt alle instellingen voor een laag. */
export function raadInstellingen(laag, { objecttypen = [], kleuren = [] } = {}) {
  const features = laag.features;
  const velden = [...new Set(features.slice(0, 500).flatMap((f) => Object.keys(f.properties ?? {})))];
  const waarden = (v) => features.map((f) => f.properties?.[v]).filter((x) => x !== null && x !== undefined && String(x).trim() !== '').map((x) => String(x).trim());
  const uniekheid = (v) => {
    const w = waarden(v);
    return { gevuld: w.length / (features.length || 1), uniek: new Set(w.map((x) => x.toLowerCase())).size / (w.length || 1), lengte: w.reduce((t, x) => t + x.length, 0) / (w.length || 1) };
  };
  // Code: een kolom die (vrijwel) altijd gevuld en uniek is; hints en geen technische nummers krijgen voorrang.
  const kandidaten = velden.map((v) => ({ v, ...uniekheid(v) })).filter((k) => k.gevuld >= 0.98 && k.uniek >= 0.999 && k.lengte <= 40);
  const score = (k) => (CODE_HINT.test(k.v) ? 2 : 0) + (NIET_ALS_CODE.test(k.v) ? -1.5 : 0) + (/code|nr|nummer/i.test(k.v) ? 1 : 0);
  const codeveld = kandidaten.sort((a, b) => score(b) - score(a))[0]?.v ?? '';
  const naamveld = velden.find((v) => NAAM_HINT.test(v) && uniekheid(v).gevuld >= 0.5) ?? '';
  let type = TYPE_UIT_NAAM.find(([re]) => re.test(laag.bronLaag ?? laag.naam) || re.test(laag.naam))?.[1] ?? '';
  if (type && objecttypen.length && !objecttypen.includes(type)) type = '';
  if (!type) type = 'Overig';
  const letters = String(laag.bronLaag ?? laag.naam).replace(/[^A-Za-z]/g, '');
  const voorvoegsel = (letters.slice(0, 2) || 'GV').toUpperCase() + (laag.soort && laag.naam !== laag.bronLaag ? laag.soort[0].toUpperCase() : '');
  return {
    naam: String(laag.naam).replace(/[_]+/g, ' ').trim().slice(0, 80) || 'Laag', type, codeveld, naamveld, voorvoegsel,
    kleur: kleuren.length ? kleuren[Math.abs(hash(laag.naam)) % kleuren.length] : '#1f78b4', interval: '', velden,
  };
}

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

/** Vingerafdruk van een geometrie (afgerond), om ongewijzigde objecten te herkennen. */
export function geometrieSleutel(g) {
  const r = [];
  alleCoordinaten(g, (c) => r.push(`${c[0].toFixed(6)},${c[1].toFixed(6)}`));
  return `${g?.type}:${r.join(';')}`;
}

// Technische rijnummers veranderen bij elke export; die tellen niet als wijziging.
const inhoud = (p) => JSON.stringify(Object.entries(p ?? {}).filter(([k]) => !NIET_ALS_CODE.test(k)).sort(([a], [b]) => a.localeCompare(b)));

const codeVan = (f, inst) => (inst.codeveld ? String(f.properties?.[inst.codeveld] ?? '').trim() : '');

/**
 * Zoekt of deze laag al eerder is ingeladen: zelfde bron (bestand + laag), of ≥ 50 % dezelfde codes/geometrieën.
 * @returns {{ laag: object, reden: string, overlap: number } | null}
 */
export function vindBestaandeLaag(laag, inst, { lagen, objecten, bestandsnaam }) {
  const sleutels = new Set(laag.features.map((f) => codeVan(f, inst).toLowerCase() || geometrieSleutel(f.geometry)));
  let beste = null;
  for (const l of lagen) {
    if (l.soort && laag.soort && l.soort !== laag.soort) continue;
    const eigen = objecten.filter((o) => o.laagId === l.id);
    let gelijk = 0;
    for (const o of eigen) {
      if (sleutels.has(String(o.bronCode ?? o.code ?? '').toLowerCase()) || sleutels.has(geometrieSleutel(o.geometrie))) gelijk++;
    }
    const overlap = eigen.length ? gelijk / Math.max(eigen.length, laag.features.length) : 0;
    const zelfdeBron = l.bron === bestandsnaam && (l.bronLaag ?? l.naam) === (laag.bronLaag ?? laag.naam) && (!l.soort || l.soort === laag.soort);
    const kans = zelfdeBron ? 1 + overlap : overlap;
    if ((zelfdeBron || overlap >= 0.5) && (!beste || kans > beste.kans)) {
      beste = { laag: l, overlap, kans, reden: zelfdeBron ? 'zelfde bestand' : `${Math.round(overlap * 100)}% dezelfde objecten` };
    }
  }
  return beste ? { laag: beste.laag, reden: beste.reden, overlap: beste.overlap } : null;
}

/**
 * Wat er verandert bij het bijwerken van een bestaande laag.
 * Koppeling op code (als er een codekolom is), anders op geometrie.
 * Objecten met inspecties/werk/taken worden nooit verwijderd.
 */
export function planBijwerken(features, inst, bestaand, metHistorie = new Set()) {
  const opCode = new Map();
  const opGeo = new Map();
  for (const o of bestaand) {
    const c = String(o.bronCode ?? o.code ?? '').toLowerCase();
    if (c) opCode.set(c, o);
    opGeo.set(geometrieSleutel(o.geometrie), o);
  }
  const gebruikt = new Set();
  const bijwerken = [];
  const gelijk = [];
  const nieuw = [];
  for (const f of features) {
    const c = codeVan(f, inst).toLowerCase();
    const sleutel = geometrieSleutel(f.geometry);
    const o = (c && opCode.get(c)) || opGeo.get(sleutel);
    if (!o || gebruikt.has(o.id)) { nieuw.push(f); continue; }
    gebruikt.add(o.id);
    const zelfde = geometrieSleutel(o.geometrie) === sleutel && inhoud(o.kenmerken) === inhoud(f.properties);
    (zelfde ? gelijk : bijwerken).push({ object: o, feature: f });
  }
  const weg = bestaand.filter((o) => !gebruikt.has(o.id));
  return {
    bijwerken, gelijk, nieuw,
    verwijderen: weg.filter((o) => !metHistorie.has(o.id)),
    behouden: weg.filter((o) => metHistorie.has(o.id)),
  };
}
