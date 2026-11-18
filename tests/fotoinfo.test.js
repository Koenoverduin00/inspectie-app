import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/fotoinfo.js';

/** Bouwt een minimale JPEG met EXIF (DateTimeOriginal + GPS) om de lezer te testen. */
function jpegMetExif({ datum, lat, lng, le = false }) {
  const b = [];
  const u16 = (n) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n) => (le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const rat = (x) => [...u32(Math.round(x * 10000)), ...u32(10000)];
  const dms = (g) => { const a = Math.abs(g); const d = Math.floor(a); const m = Math.floor((a - d) * 60); const s = ((a - d) * 60 - m) * 60; return [...rat(d), ...rat(m), ...rat(s)]; };
  // TIFF: header(8) | IFD0 (2 entries) | ExifIFD (1 entry) | GPS IFD (4 entries) | data
  const ifd0 = 8; const ifd0Len = 2 + 2 * 12 + 4;
  const exifIfd = ifd0 + ifd0Len; const exifLen = 2 + 12 + 4;
  const gpsIfd = exifIfd + exifLen; const gpsLen = 2 + 4 * 12 + 4;
  let data = gpsIfd + gpsLen;
  const datumOff = data; data += 20;
  const latOff = data; data += 24;
  const lngOff = data; data += 24;
  const t = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8)];
  const entry = (tag, type, n, val) => [...u16(tag), ...u16(type), ...u32(n), ...val];
  t.push(...u16(2), ...entry(0x8769, 4, 1, u32(exifIfd)), ...entry(0x8825, 4, 1, u32(gpsIfd)), ...u32(0));
  t.push(...u16(1), ...entry(0x9003, 2, 20, u32(datumOff)), ...u32(0));
  t.push(...u16(4), ...entry(1, 2, 2, [lat < 0 ? 83 : 78, 0, 0, 0]), ...entry(2, 5, 3, u32(latOff)), ...entry(3, 2, 2, [lng < 0 ? 87 : 69, 0, 0, 0]), ...entry(4, 5, 3, u32(lngOff)), ...u32(0));
  t.push(...[...datum].map((c) => c.charCodeAt(0)), 0);
  t.push(...dms(lat), ...dms(lng));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
  b.push(0xff, 0xd8, 0xff, 0xe1, ...[(app1.length + 2) >> 8, (app1.length + 2) & 255], ...app1, 0xff, 0xd9);
  return new Uint8Array(b).buffer;
}

test('EXIF: opnamemoment en GPS uit een JPEG (big- en little-endian)', () => {
  for (const le of [false, true]) {
    const r = F.leesExif(jpegMetExif({ datum: '2026:11:18 14:32:05', lat: 52.0912345, lng: 5.1210123, le }));
    const d = new Date(r.op);
    assert.deepEqual([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()], [2026, 11, 18, 14, 32]);
    assert.ok(Math.abs(r.lat - 52.0912345) < 1e-5 && Math.abs(r.lng - 5.1210123) < 1e-5, `${r.lat},${r.lng}`);
  }
  assert.equal(F.leesExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null); // PNG: geen EXIF
});

test('foto-info combineren: EXIF gaat voor, anders upload-tijd en toestel-GPS', () => {
  assert.deepEqual(F.combineer({ op: '2026-11-18T13:32:05.000Z', lat: 52.1, lng: 5.1 }, { lat: 51, lng: 4 }, 'x'),
    { op: '2026-11-18T13:32:05.000Z', bronTijd: 'foto', lat: 52.1, lng: 5.1, bronLocatie: 'foto' });
  assert.deepEqual(F.combineer(null, { lat: 52.123456789, lng: 5.1, nauwkeurigheid: 7.4 }, '2026-11-18T10:00:00.000Z'),
    { op: '2026-11-18T10:00:00.000Z', bronTijd: 'upload', lat: 52.1234568, lng: 5.1, bronLocatie: 'toestel', nauwkeurigheid: 7 });
  assert.deepEqual(F.combineer(null, null, 'n'), { op: 'n', bronTijd: 'upload', bronLocatie: '' });
  assert.equal(F.coordTekst({ lat: 52.0912346, lng: 5.1 }), '52.091235, 5.100000');
  assert.match(F.tijdTekst('2026-11-18T13:32:00.000Z'), /^18-11-2026 \d\d:32$/);
});

test('foto-info in de export: kolommen en waarden, ook via de registratie', async () => {
  const UX = await import('../js/uitkomstenexcel.js');
  const BV = await import('../js/bvc.js');
  const info = { op: '2026-11-18T13:32:00.000Z', lat: 52.0912, lng: 5.1210, bronTijd: 'foto', bronLocatie: 'toestel', nauwkeurigheid: 6 };
  const w = F.exportWaarden(info, BV.wgs84NaarRd);
  assert.ok(w[0] instanceof Date);
  assert.deepEqual(w.slice(1, 3), [52.0912, 5.121]);
  assert.ok(w[3] > 130000 && w[3] < 140000 && w[4] > 450000 && w[4] < 460000, `${w[3]},${w[4]}`);
  assert.deepEqual(w.slice(5), ['foto', 'GPS toestel ±6 m']);
  assert.deepEqual(F.exportWaarden(null), ['', '', '', '', '', '', '']);
  const r = UX.uitkomstRijen({ registraties: [{ soort: 'werk', r: { soort: 'Schouw', datum: '2026-11-18', fotoIds: ['x'], fotoInfo: { x: info } }, object: { code: 'GV-1' } }] });
  assert.deepEqual(r.fotos[0].info, info);
});
