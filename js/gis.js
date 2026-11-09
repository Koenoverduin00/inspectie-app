// GIS: inlezen van GeoJSON, Shapefile (.zip) en GeoPackage (.gpkg), omrekenen naar
// WGS84 (GPS-coördinaten) en rekenen met geometrie (in vlak? afstand? oppervlakte?).
// Geometrie volgt GeoJSON: coördinaten zijn [lengtegraad, breedtegraad].

// ---------------------------------------------------------------------------
// Coördinatenstelsels
// ---------------------------------------------------------------------------

/** RD New (EPSG:28992) → WGS84, benadering van Schreutelkamp & Strang van Hees (± 1 m). */
export function rdNaarWgs84(x, y) {
  const dX = (x - 155000) * 1e-5;
  const dY = (y - 463000) * 1e-5;
  const somN = 3235.65389 * dY - 32.58297 * dX ** 2 - 0.2475 * dY ** 2 - 0.84978 * dX ** 2 * dY
    - 0.0655 * dY ** 3 - 0.01709 * dX ** 2 * dY ** 2 - 0.00738 * dX + 0.0053 * dX ** 4
    - 0.00039 * dX ** 2 * dY ** 3 + 0.00033 * dX ** 4 * dY - 0.00012 * dX * dY;
  const somE = 5260.52916 * dX + 105.94684 * dX * dY + 2.45656 * dX * dY ** 2 - 0.81885 * dX ** 3
    + 0.05594 * dX * dY ** 3 - 0.05607 * dX ** 3 * dY + 0.01199 * dY - 0.00256 * dX ** 3 * dY ** 2
    + 0.00128 * dX * dY ** 4 + 0.00022 * dY ** 2 - 0.00022 * dX ** 2 + 0.00026 * dX ** 5;
  return [5.387206 + somE / 3600, 52.15517 + somN / 3600];
}

/** Web Mercator (EPSG:3857) → WGS84. */
export function mercatorNaarWgs84(x, y) {
  const R = 6378137;
  return [(x / R) * (180 / Math.PI), (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)];
}

const OMREKENING = {
  wgs84: null,
  rd: rdNaarWgs84,
  mercator: mercatorNaarWgs84,
};

export const CRS_NAAM = { wgs84: 'WGS84 (EPSG:4326)', rd: 'RD New (EPSG:28992)', mercator: 'Web Mercator (EPSG:3857)' };

/** Bepaalt het coördinatenstelsel uit een EPSG-code. */
export function crsUitEpsg(code) {
  const n = Number(code);
  if ([4326, 4258, 4979, 4936].includes(n)) return 'wgs84';
  if (n === 28992) return 'rd';
  if ([3857, 900913, 3785, 102100].includes(n)) return 'mercator';
  return null;
}

/** Herkent het stelsel aan de hand van een crs-tekst of, als die ontbreekt, aan de getallen. */
export function herkenCrs(voorbeeld, crsTekst = '') {
  const m = String(crsTekst).match(/(?:EPSG)?[:/]{1,2}(\d{4,6})\b/i) || String(crsTekst).match(/\b(28992|3857|900913|4326)\b/);
  if (/CRS84/i.test(crsTekst)) return 'wgs84';
  if (m) {
    const crs = crsUitEpsg(m[1]);
    if (crs) return crs;
    throw new Error(`Coördinatenstelsel EPSG:${m[1]} wordt niet ondersteund. Exporteer naar RD New (EPSG:28992) of WGS84 (EPSG:4326).`);
  }
  if (!voorbeeld) return 'wgs84';
  const [x, y] = voorbeeld;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return 'wgs84';
  if (x > -7000 && x < 300000 && y > 289000 && y < 629000) return 'rd';
  if (Math.abs(x) <= 20037509 && Math.abs(y) > 1e6 && Math.abs(y) <= 20037509) return 'mercator';
  throw new Error('Het coördinatenstelsel van dit bestand is niet te herkennen. Exporteer naar RD New (EPSG:28992) of WGS84 (EPSG:4326).');
}

// ---------------------------------------------------------------------------
// Geometrie-hulpfuncties
// ---------------------------------------------------------------------------

export function mapCoords(geom, fn) {
  if (!geom) return null;
  const diep = (c, d) => (d === 0 ? fn(c) : c.map((x) => diep(x, d - 1)));
  const diepte = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 }[geom.type];
  if (geom.type === 'GeometryCollection') return { type: geom.type, geometries: geom.geometries.map((g) => mapCoords(g, fn)) };
  if (diepte === undefined) return null;
  return { type: geom.type, coordinates: diep(geom.coordinates, diepte) };
}

function eersteCoordinaat(geom) {
  if (!geom) return null;
  if (geom.type === 'GeometryCollection') return eersteCoordinaat(geom.geometries[0]);
  let c = geom.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) [c] = c;
  return Array.isArray(c) && typeof c[0] === 'number' ? c : null;
}

/** Rekent om naar WGS84, laat hoogte weg en rondt af op 7 decimalen (± 1 cm). */
export function naarWgs84(geom, crs) {
  const reken = OMREKENING[crs];
  return mapCoords(geom, (c) => {
    const [lng, lat] = reken ? reken(c[0], c[1]) : [c[0], c[1]];
    return [Math.round(lng * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
  });
}

export function soortGeometrie(geom) {
  const t = geom?.type ?? '';
  if (t.includes('Polygon')) return 'vlak';
  if (t.includes('LineString')) return 'lijn';
  if (t.includes('Point')) return 'punt';
  return 'onbekend';
}

function polygonen(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  if (geom.type === 'GeometryCollection') return geom.geometries.flatMap(polygonen);
  return [];
}

function lijnen(geom) {
  if (!geom) return [];
  switch (geom.type) {
    case 'LineString': return [geom.coordinates];
    case 'MultiLineString': return geom.coordinates;
    case 'Polygon': return geom.coordinates;
    case 'MultiPolygon': return geom.coordinates.flat();
    case 'GeometryCollection': return geom.geometries.flatMap(lijnen);
    default: return [];
  }
}

function punten(geom) {
  if (!geom) return [];
  if (geom.type === 'Point') return [geom.coordinates];
  if (geom.type === 'MultiPoint') return geom.coordinates;
  if (geom.type === 'GeometryCollection') return geom.geometries.flatMap(punten);
  return [];
}

function inRing(pt, ring) {
  let binnen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) binnen = !binnen;
  }
  return binnen;
}

/** Ligt het punt [lng, lat] binnen het vlak (rekening houdend met gaten)? */
export function inVlak(pt, geom) {
  return polygonen(geom).some(([buiten, ...gaten]) => inRing(pt, buiten) && !gaten.some((g) => inRing(pt, g)));
}

// Lokale projectie in meters rond een referentiepunt (nauwkeurig genoeg op enkele km).
function lokaal(ref) {
  // Meters per graad op de breedtegraad van het referentiepunt (WGS84-ellipsoïde).
  const f = (ref[1] * Math.PI) / 180;
  const kx = 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f) + 0.118 * Math.cos(5 * f);
  const ky = 111132.954 - 559.822 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f);
  return (c) => [(c[0] - ref[0]) * kx, (c[1] - ref[1]) * ky];
}

function afstandTotSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Kortste afstand in meters van punt [lng, lat] tot een geometrie (0 als het punt in het vlak ligt). */
export function afstandTot(pt, geom) {
  if (!geom || !pt) return null;
  if (inVlak(pt, geom)) return 0;
  const proj = lokaal(pt);
  const p = [0, 0];
  let min = Infinity;
  for (const lijn of lijnen(geom)) {
    for (let i = 1; i < lijn.length; i++) min = Math.min(min, afstandTotSegment(p, proj(lijn[i - 1]), proj(lijn[i])));
    if (lijn.length === 1) min = Math.min(min, Math.hypot(...proj(lijn[0])));
  }
  for (const c of punten(geom)) min = Math.min(min, Math.hypot(...proj(c)));
  return Number.isFinite(min) ? min : null;
}

export function bbox(geom) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  mapCoords(geom, (c) => {
    b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]);
    b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
    return c;
  });
  return Number.isFinite(b[0]) ? b : null;
}

function ringOppervlak(ring, proj) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = proj(ring[j]);
    const [x2, y2] = proj(ring[i]);
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Oppervlakte in m² (vlakken). */
export function oppervlakte(geom) {
  const b = bbox(geom);
  if (!b) return 0;
  const proj = lokaal([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  return polygonen(geom).reduce((t, [buiten, ...gaten]) => t + ringOppervlak(buiten, proj) - gaten.reduce((g, r) => g + ringOppervlak(r, proj), 0), 0);
}

/** Lengte in meters (lijnen). */
export function lengte(geom) {
  const b = bbox(geom);
  if (!b) return 0;
  const proj = lokaal([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  const ls = geom.type.includes('LineString') ? lijnen(geom) : [];
  let totaal = 0;
  for (const l of ls) {
    for (let i = 1; i < l.length; i++) {
      const a = proj(l[i - 1]);
      const b = proj(l[i]);
      totaal += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  return totaal;
}

/** Een representatief punt dat bij vlakken altijd binnen het vlak ligt. */
export function middelpunt(geom) {
  const pts = punten(geom);
  if (pts.length) return pts[0];
  const polys = polygonen(geom);
  if (polys.length) {
    const grootste = polys.reduce((a, p) => (oppervlakte({ type: 'Polygon', coordinates: p }) > oppervlakte({ type: 'Polygon', coordinates: a }) ? p : a));
    const ring = grootste[0];
    let sx = 0; let sy = 0; let sa = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      sx += (ring[j][0] + ring[i][0]) * f; sy += (ring[j][1] + ring[i][1]) * f; sa += f;
    }
    const c = sa ? [sx / (3 * sa), sy / (3 * sa)] : ring[0];
    if (inVlak(c, { type: 'Polygon', coordinates: grootste })) return c;
    // Terugvaloptie: midden tussen de eerste twee snijpunten van een horizontale lijn door het zwaartepunt.
    const snij = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j]; const [x2, y2] = ring[i];
      if ((y1 > c[1]) !== (y2 > c[1])) snij.push(x1 + ((c[1] - y1) * (x2 - x1)) / (y2 - y1));
    }
    snij.sort((a, b) => a - b);
    return snij.length >= 2 ? [(snij[0] + snij[1]) / 2, c[1]] : ring[0];
  }
  const ls = lijnen(geom);
  if (ls.length) {
    const l = ls[0];
    return l[Math.floor(l.length / 2)];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inlezen
// ---------------------------------------------------------------------------

/** Maakt een laag-kandidaat: { naam, crs, features: [{ geometry, properties }] } in WGS84. */
function maakLaag(naam, features, crsTekst = '') {
  const bruikbaar = features.filter((f) => f && f.geometry && eersteCoordinaat(f.geometry));
  if (!bruikbaar.length) return null;
  const crs = herkenCrs(eersteCoordinaat(bruikbaar[0].geometry), crsTekst);
  return {
    naam,
    crs,
    features: bruikbaar.map((f) => ({ geometry: naarWgs84(f.geometry, crs), properties: f.properties ?? {} })),
    overgeslagen: features.length - bruikbaar.length,
  };
}

export function leesGeojson(tekst, naam = 'Laag') {
  let data;
  try {
    data = JSON.parse(tekst);
  } catch {
    throw new Error('Het bestand is geen geldige GeoJSON.');
  }
  let features;
  if (data.type === 'FeatureCollection') features = data.features ?? [];
  else if (data.type === 'Feature') features = [data];
  else if (data.type && data.coordinates) features = [{ geometry: data, properties: {} }];
  else throw new Error('Geen GeoJSON gevonden (verwacht een FeatureCollection).');
  const laag = maakLaag(naam, features, data.crs?.properties?.name ?? '');
  if (!laag) throw new Error('Het bestand bevat geen geometrie.');
  return [laag];
}

const scripts = new Map();
function laadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { scripts.delete(src); reject(new Error(`Kon ${src} niet laden.`)); };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}

export async function leesShapefile(buffer, naam = 'Laag') {
  await laadScript('vendor/shpjs/shp.min.js');
  let resultaat;
  try {
    resultaat = await window.shp(buffer);
  } catch (fout) {
    throw new Error(`Shapefile kon niet worden gelezen: ${fout.message}. Zitten .shp, .dbf en .prj samen in de zip?`);
  }
  const verzamelingen = Array.isArray(resultaat) ? resultaat : [resultaat];
  // shpjs rekent met het .prj-bestand al om naar WGS84; zonder .prj herkennen we het stelsel zelf.
  const lagen = verzamelingen
    .map((fc) => maakLaag(fc.fileName ? fc.fileName.split('/').pop() : naam, fc.features ?? []))
    .filter(Boolean);
  if (!lagen.length) throw new Error('De shapefile bevat geen geometrie.');
  return lagen;
}

// --- GeoPackage ---------------------------------------------------------------

/** Leest WKB (ook ISO- en EWKB-varianten met Z/M) naar een GeoJSON-geometrie (2D). */
export function leesWkb(bytes, start = 0) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = start;
  const lees = () => {
    const le = dv.getUint8(pos) === 1;
    pos += 1;
    let type = dv.getUint32(pos, le);
    pos += 4;
    let dims = 2;
    if (type & 0x80000000) dims += 1;
    if (type & 0x40000000) dims += 1;
    if (type & 0x20000000) pos += 4; // EWKB SRID
    type &= 0x0fffffff;
    if (type > 1000) {
      const z = Math.floor(type / 1000);
      dims = z === 3 ? 4 : 3;
      type %= 1000;
    }
    const punt = () => {
      const x = dv.getFloat64(pos, le);
      const y = dv.getFloat64(pos + 8, le);
      pos += 8 * dims;
      return [x, y];
    };
    const reeks = () => {
      const n = dv.getUint32(pos, le);
      pos += 4;
      return Array.from({ length: n }, punt);
    };
    const aantal = () => {
      const n = dv.getUint32(pos, le);
      pos += 4;
      return n;
    };
    switch (type) {
      case 1: return { type: 'Point', coordinates: punt() };
      case 2: return { type: 'LineString', coordinates: reeks() };
      case 3: return { type: 'Polygon', coordinates: Array.from({ length: aantal() }, reeks) };
      case 4: return { type: 'MultiPoint', coordinates: Array.from({ length: aantal() }, () => lees().coordinates) };
      case 5: return { type: 'MultiLineString', coordinates: Array.from({ length: aantal() }, () => lees().coordinates) };
      case 6: return { type: 'MultiPolygon', coordinates: Array.from({ length: aantal() }, () => lees().coordinates) };
      case 7: return { type: 'GeometryCollection', geometries: Array.from({ length: aantal() }, lees) };
      default: throw new Error(`Geometrietype ${type} wordt niet ondersteund (alleen punten, lijnen en vlakken).`);
    }
  };
  return lees();
}

/** Leest de geometrie uit een GeoPackage-blob (GP-header + WKB). */
export function leesGpkgGeometrie(blob) {
  if (!blob || blob.length < 8) return null;
  if (blob[0] !== 0x47 || blob[1] !== 0x50) return leesWkb(blob); // geen GP-header: kale WKB
  const vlaggen = blob[3];
  if (vlaggen & 0x10) return null; // lege geometrie
  const envelop = [0, 32, 48, 48, 64][(vlaggen >> 1) & 0x07] ?? 0;
  return leesWkb(blob, 8 + envelop);
}

let sqlBelofte;
async function laadSqlJs() {
  await laadScript('vendor/sqljs/sql-wasm.js');
  sqlBelofte ??= window.initSqlJs({ locateFile: (f) => `vendor/sqljs/${f}` });
  return sqlBelofte;
}

export async function leesGeopackage(buffer) {
  const SQL = await laadSqlJs();
  const db = new SQL.Database(new Uint8Array(buffer));
  try {
    const rijen = (sql, params = []) => {
      const st = db.prepare(sql);
      st.bind(params);
      const uit = [];
      while (st.step()) uit.push(st.getAsObject());
      st.free();
      return uit;
    };
    let tabellen;
    try {
      tabellen = rijen(`select c.table_name as tabel, g.column_name as kolom, g.srs_id as srs,
        s.organization as org, s.organization_coordsys_id as code
        from gpkg_contents c join gpkg_geometry_columns g on g.table_name = c.table_name
        left join gpkg_spatial_ref_sys s on s.srs_id = g.srs_id where c.data_type = 'features'`);
    } catch {
      throw new Error('Dit is geen geldig GeoPackage-bestand.');
    }
    const lagen = [];
    for (const t of tabellen) {
      const code = String(t.org ?? '').toUpperCase() === 'EPSG' ? t.code : t.srs;
      const crsTekst = `EPSG:${code}`;
      const features = [];
      for (const r of rijen(`select * from "${String(t.tabel).replace(/"/g, '""')}"`)) {
        const blob = r[t.kolom];
        delete r[t.kolom];
        const geometry = blob instanceof Uint8Array ? leesGpkgGeometrie(blob) : null;
        for (const [k, v] of Object.entries(r)) if (v instanceof Uint8Array) delete r[k];
        if (geometry) features.push({ geometry, properties: r });
      }
      const laag = maakLaag(t.tabel, features, crsTekst);
      if (laag) lagen.push(laag);
    }
    if (!lagen.length) throw new Error('Het GeoPackage bevat geen lagen met geometrie.');
    return lagen;
  } finally {
    db.close();
  }
}

/** Leest een bestand op basis van de extensie. Geeft een lijst met lagen terug. */
export async function leesBestand(bestand) {
  const naam = bestand.name.replace(/\.[^.]+$/, '');
  const ext = (bestand.name.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();
  if (ext === 'geojson' || ext === 'json') return leesGeojson(await bestand.text(), naam);
  if (ext === 'zip') return leesShapefile(await bestand.arrayBuffer(), naam);
  if (ext === 'gpkg') return leesGeopackage(await bestand.arrayBuffer());
  if (ext === 'shp') throw new Error('Pak de shapefile samen met de .dbf, .shx en .prj in één .zip-bestand en laad die zip in.');
  throw new Error('Onbekend bestandstype. Gebruik GeoJSON (.geojson), Shapefile (.zip) of GeoPackage (.gpkg).');
}

/** Velden (kolommen) die in de kenmerken van een laag voorkomen. */
export function velden(features) {
  const set = new Set();
  for (const f of features.slice(0, 500)) Object.keys(f.properties ?? {}).forEach((k) => set.add(k));
  return [...set];
}
