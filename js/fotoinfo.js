// Datum, tijd en locatie van foto's. Uit de EXIF-gegevens van de foto zelf (opnamemoment en GPS van de camera), en anders
// het moment van uploaden met de GPS-positie van het toestel. Puur en testbaar: geen DOM, geen opslag.

/**
 * Leest DateTimeOriginal en GPS uit een JPEG (EXIF). Geeft { op, lat, lng } (velden alleen als ze er zijn) of null.
 * @param {ArrayBuffer} buffer
 */
export function leesExif(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marker = v.getUint16(o);
    const len = v.getUint16(o + 2);
    if (marker === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return tiff(v, o + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    o += 2 + len;
  }
  return null;
}

function tiff(v, start) {
  if (start + 8 > v.byteLength) return null;
  const le = v.getUint16(start) === 0x4949;
  const u16 = (p) => v.getUint16(p, le);
  const u32 = (p) => v.getUint32(p, le);
  const ifd = (off) => {
    const uit = new Map();
    const p = start + off;
    if (p + 2 > v.byteLength) return uit;
    const n = u16(p);
    for (let i = 0; i < n; i++) {
      const e = p + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      uit.set(u16(e), { type: u16(e + 2), aantal: u32(e + 4), waarde: e + 8 });
    }
    return uit;
  };
  const waardePos = (t) => {
    const grootte = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 }[t.type] ?? 1;
    return grootte * t.aantal > 4 ? start + u32(t.waarde) : t.waarde;
  };
  const tekst = (t) => {
    if (!t) return '';
    const p = waardePos(t);
    let s = '';
    for (let i = 0; i < t.aantal && p + i < v.byteLength; i++) { const c = v.getUint8(p + i); if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  const rationals = (t) => {
    if (!t) return null;
    const p = waardePos(t);
    const uit = [];
    for (let i = 0; i < t.aantal; i++) { const d = u32(p + i * 8 + 4); uit.push(d ? u32(p + i * 8) / d : 0); }
    return uit;
  };
  const ifd0 = ifd(u32(start + 4));
  const uit = {};
  const exifPtr = ifd0.get(0x8769);
  const exif = exifPtr ? ifd(u32(exifPtr.waarde)) : new Map();
  const dt = tekst(exif.get(0x9003)) || tekst(exif.get(0x9004)) || tekst(ifd0.get(0x0132));
  const m = dt.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1990) uit.op = d.toISOString();
  }
  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const g = ifd(u32(gpsPtr.waarde));
    const graden = (r) => (r && r.length >= 3 ? r[0] + r[1] / 60 + r[2] / 3600 : null);
    let lat = graden(rationals(g.get(2)));
    let lng = graden(rationals(g.get(4)));
    if (lat !== null && lng !== null && (lat || lng)) {
      if (tekst(g.get(1)).toUpperCase() === 'S') lat = -lat;
      if (tekst(g.get(3)).toUpperCase() === 'W') lng = -lng;
      uit.lat = Math.round(lat * 1e7) / 1e7;
      uit.lng = Math.round(lng * 1e7) / 1e7;
    }
  }
  return Object.keys(uit).length ? uit : null;
}

/**
 * Info van een nieuwe foto: EXIF gaat voor; ontbrekende tijd = nu, ontbrekende locatie = positie van het toestel.
 * @returns {{ op: string, lat?: number, lng?: number, nauwkeurigheid?: number, bronTijd: 'foto'|'upload', bronLocatie: 'foto'|'toestel'|'' }}
 */
export function combineer(exif, toestel, nuIso = new Date().toISOString()) {
  const uit = { op: exif?.op || nuIso, bronTijd: exif?.op ? 'foto' : 'upload', bronLocatie: '' };
  if (exif?.lat != null && exif?.lng != null) Object.assign(uit, { lat: exif.lat, lng: exif.lng, bronLocatie: 'foto' });
  else if (toestel?.lat != null && toestel?.lng != null) {
    Object.assign(uit, { lat: Math.round(toestel.lat * 1e7) / 1e7, lng: Math.round(toestel.lng * 1e7) / 1e7, bronLocatie: 'toestel' });
    if (toestel.nauwkeurigheid != null) uit.nauwkeurigheid = Math.round(toestel.nauwkeurigheid);
  }
  return uit;
}

/** Datum en tijd als tekst (nl): 18-11-2026 14:32. */
export function tijdTekst(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Coördinaten als tekst: 52.091234, 5.121012 (6 decimalen ≈ 10 cm). */
export const coordTekst = (info) => (info?.lat != null && info?.lng != null ? `${Number(info.lat).toFixed(6)}, ${Number(info.lng).toFixed(6)}` : '');

/** Kolommen voor de foto-gegevens in een export. */
export const EXPORT_KOLOMMEN = [['Datum en tijd foto', 17], ['Breedtegraad', 12], ['Lengtegraad', 12], ['X (RD)', 11], ['Y (RD)', 11], ['Tijd uit', 9], ['Locatie uit', 14]];

/** Waarden voor de exportkolommen. @param {(lng:number, lat:number) => [number, number]} naarRd */
export function exportWaarden(info, naarRd) {
  if (!info) return ['', '', '', '', '', '', ''];
  const d = info.op ? new Date(info.op) : null;
  const heeftLoc = info.lat != null && info.lng != null;
  const [x, y] = heeftLoc && naarRd ? naarRd(Number(info.lng), Number(info.lat)) : ['', ''];
  return [
    d && !Number.isNaN(d.getTime()) ? d : '',
    heeftLoc ? Number(info.lat) : '', heeftLoc ? Number(info.lng) : '',
    heeftLoc && x !== '' ? Math.round(x * 100) / 100 : '', heeftLoc && y !== '' ? Math.round(y * 100) / 100 : '',
    info.bronTijd === 'foto' ? 'foto' : info.bronTijd === 'upload' ? 'upload' : '',
    info.bronLocatie === 'foto' ? 'GPS foto' : info.bronLocatie === 'toestel' ? `GPS toestel${info.nauwkeurigheid ? ` ±${info.nauwkeurigheid} m` : ''}` : 'geen',
  ];
}
