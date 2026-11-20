// Inwinning van coördinaten in een formulier: punt, lijn of vlak, op basis van GPS (los of lopend) of op de kaart.
// Puur en testbaar: rekenen, controleren en weergeven. De kaart en de GPS staan in app.js.
//
// Antwoord in een registratie (extra[veldId]):
//   { soort: 'punt' | 'lijn' | 'vlak', punten: [{ lng, lat, nk?, bron: 'gps' | 'kaart', t? }], lengte?: m, oppervlakte?: m² }
// nk = nauwkeurigheid van de GPS in meters.

export const SOORTEN = { punt: 'Punten', lijn: 'Lijn', vlak: 'Vlak' };
export const SOORT_ENKEL = { punt: 'punt', lijn: 'lijn', vlak: 'vlak' };
/** Keuze in de veldeditor: één vaste soort of de inspecteur kiest zelf. */
export const INWINNING = { keuze: 'Inspecteur kiest: punten, lijn of vlak', punt: 'Alleen punten', lijn: 'Alleen een lijn', vlak: 'Alleen een vlak' };
export const MINIMUM = { punt: 1, lijn: 2, vlak: 3 };

/** Welke soorten mag de invuller kiezen? */
export const toegestaan = (def) => (def?.inwinning && def.inwinning !== 'keuze' && SOORTEN[def.inwinning] ? [def.inwinning] : Object.keys(SOORTEN));

const R = 6371008.8;
const rad = (x) => (x * Math.PI) / 180;

/** Afstand in meters tussen twee punten ({lng, lat}). */
export function afstand(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Lengte van een lijn (of omtrek als gesloten). */
export function lengte(punten, gesloten = false) {
  let m = 0;
  for (let i = 1; i < punten.length; i += 1) m += afstand(punten[i - 1], punten[i]);
  if (gesloten && punten.length > 2) m += afstand(punten[punten.length - 1], punten[0]);
  return m;
}

/** Oppervlakte van een vlak in m² (sferische benadering, nauwkeurig genoeg voor percelen en taluds). */
export function oppervlakte(punten) {
  if (punten.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < punten.length; i += 1) {
    const a = punten[i];
    const b = punten[(i + 1) % punten.length];
    s += rad(b.lng - a.lng) * (2 + Math.sin(rad(a.lat)) + Math.sin(rad(b.lat)));
  }
  return Math.abs((s * R * R) / 2);
}

const rond = (x, n = 7) => Number(Number(x).toFixed(n));

/**
 * Een GPS-positie toevoegen tijdens lopend inwinnen: alleen als hij nauwkeurig genoeg is en ver genoeg van het vorige punt.
 * @returns {{ punten: object[], toegevoegd: boolean, reden?: string }}
 */
export function voegGpsToe(punten, pos, { minAfstand = 2, maxNauwkeurigheid = 25 } = {}) {
  const p = { lng: rond(pos.lng), lat: rond(pos.lat), bron: 'gps', ...(pos.nk != null ? { nk: Math.round(pos.nk) } : {}), ...(pos.t ? { t: pos.t } : {}) };
  if (pos.nk != null && pos.nk > maxNauwkeurigheid) return { punten, toegevoegd: false, reden: 'onnauwkeurig' };
  const vorige = punten[punten.length - 1];
  if (vorige && afstand(vorige, p) < minAfstand) return { punten, toegevoegd: false, reden: 'te dichtbij' };
  return { punten: [...punten, p], toegevoegd: true };
}

/** Antwoord netjes maken: afgeronde coördinaten en lengte/oppervlakte erbij. */
export function maak(soort, punten) {
  const lijst = (punten ?? []).filter((p) => Number.isFinite(Number(p?.lng)) && Number.isFinite(Number(p?.lat)))
    .map((p) => ({ ...p, lng: rond(p.lng), lat: rond(p.lat) }));
  const v = { soort, punten: lijst };
  if (soort === 'lijn' && lijst.length >= 2) v.lengte = Math.round(lengte(lijst) * 10) / 10;
  if (soort === 'vlak' && lijst.length >= 3) {
    v.oppervlakte = Math.round(oppervlakte(lijst) * 10) / 10;
    v.lengte = Math.round(lengte(lijst, true) * 10) / 10;
  }
  return v;
}

export const isLeeg = (v) => !v?.punten?.length;
/** Genoeg punten voor de gekozen soort? */
export const isCompleet = (v) => Boolean(v?.soort && (v.punten?.length ?? 0) >= (MINIMUM[v.soort] ?? 1));

const nl = (x, n = 1) => Number(x).toLocaleString('nl-NL', { maximumFractionDigits: n });
/** "Lijn · 12 punten · 85,4 m (GPS ± 4 m)" */
export function tekst(v) {
  if (isLeeg(v)) return '–';
  const n = v.punten.length;
  const gps = v.punten.filter((p) => p.bron === 'gps');
  const nk = gps.map((p) => p.nk).filter((x) => x != null);
  const bron = gps.length === n ? `GPS${nk.length ? ` ± ${Math.max(...nk)} m` : ''}` : gps.length ? 'GPS en kaart' : 'op de kaart';
  const maat = v.soort === 'lijn' && v.lengte != null ? ` · ${nl(v.lengte)} m`
    : v.soort === 'vlak' && v.oppervlakte != null ? ` · ${nl(v.oppervlakte)} m² (omtrek ${nl(v.lengte ?? 0)} m)` : '';
  const enkel = v.soort === 'punt' && n === 1 ? ` · ${v.punten[0].lat.toFixed(6)}, ${v.punten[0].lng.toFixed(6)}` : '';
  return `${SOORTEN[v.soort] ?? 'Geometrie'} · ${n} ${n === 1 ? 'punt' : 'punten'}${maat}${enkel} (${bron})`;
}

/** GeoJSON-geometrie (WGS84, [lng, lat]). */
export function geometrie(v) {
  if (isLeeg(v)) return null;
  const c = v.punten.map((p) => [p.lng, p.lat]);
  if (v.soort === 'lijn') return c.length >= 2 ? { type: 'LineString', coordinates: c } : { type: 'Point', coordinates: c[0] };
  if (v.soort === 'vlak') return c.length >= 3 ? { type: 'Polygon', coordinates: [[...c, c[0]]] } : { type: 'LineString', coordinates: c };
  return c.length === 1 ? { type: 'Point', coordinates: c[0] } : { type: 'MultiPoint', coordinates: c };
}

/** WKT (voor Excel en GIS-pakketten). */
export function wkt(v) {
  const g = geometrie(v);
  if (!g) return '';
  const xy = (c) => `${c[0]} ${c[1]}`;
  if (g.type === 'Point') return `POINT (${xy(g.coordinates)})`;
  if (g.type === 'MultiPoint') return `MULTIPOINT (${g.coordinates.map((c) => `(${xy(c)})`).join(', ')})`;
  if (g.type === 'LineString') return `LINESTRING (${g.coordinates.map(xy).join(', ')})`;
  return `POLYGON ((${g.coordinates[0].map(xy).join(', ')}))`;
}

/** Kleine schets als SVG-pad (zonder ondergrond), voor de weergave en de afdruk. */
export function schets(v, { breedte = 220, hoogte = 140, marge = 10 } = {}) {
  if (isLeeg(v)) return null;
  const midLat = v.punten.reduce((t, p) => t + p.lat, 0) / v.punten.length;
  const kx = Math.cos(rad(midLat));
  const xs = v.punten.map((p) => p.lng * kx);
  const ys = v.punten.map((p) => p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const schaal = Math.min((breedte - 2 * marge) / (x1 - x0 || 1e-9), (hoogte - 2 * marge) / (y1 - y0 || 1e-9));
  const ox = (breedte - (x1 - x0) * schaal) / 2;
  const oy = (hoogte - (y1 - y0) * schaal) / 2;
  const pt = xs.map((x, i) => [Math.round((ox + (x - x0) * schaal) * 10) / 10, Math.round((hoogte - oy - (ys[i] - y0) * schaal) * 10) / 10]);
  const pad = pt.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + (v.soort === 'vlak' && pt.length > 2 ? ' Z' : '');
  return { breedte, hoogte, pad, punten: pt };
}

/** GeoJSON-feature van een antwoord, met eigenschappen (voor export naar GIS). */
export function feature(v, eigenschappen = {}) {
  const g = geometrie(v);
  if (!g) return null;
  return { type: 'Feature', geometry: g, properties: { ...eigenschappen, soort: v.soort, punten: v.punten.length,
    ...(v.lengte != null ? { lengte_m: v.lengte } : {}), ...(v.oppervlakte != null ? { oppervlakte_m2: v.oppervlakte } : {}),
    ...(v.punten.some((p) => p.nk != null) ? { nauwkeurigheid_m: Math.max(...v.punten.map((p) => p.nk ?? 0)) } : {}) } };
}
