import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rdNaarWgs84, mercatorNaarWgs84, herkenCrs, naarWgs84, inVlak, afstandTot, oppervlakte, lengte, middelpunt,
  leesGeojson, leesWkb, leesGpkgGeometrie, soortGeometrie,
} from '../js/gis.js';
import { takenLijst, sorteerTaken } from '../js/taken.js';

const bijna = (a, b, marge) => assert.ok(Math.abs(a - b) <= marge, `${a} ≉ ${b}`);

test('RD New naar WGS84', () => {
  const [lng, lat] = rdNaarWgs84(155000, 463000); // Amersfoort, OLV-toren
  bijna(lat, 52.15517, 1e-6);
  bijna(lng, 5.387206, 1e-6);
  // Referentiewaarden berekend met proj4 (EPSG:28992 met towgs84-parameters); marge ± 1 m.
  const [lng2, lat2] = rdNaarWgs84(121687, 487484); // Amsterdam
  bijna(lat2, 52.374218, 0.00001);
  bijna(lng2, 4.898010, 0.00002);
  const [lng3, lat3] = rdNaarWgs84(180000, 320000); // Zuid-Limburg
  bijna(lat3, 50.869266, 0.00001);
  bijna(lng3, 5.742327, 0.00002);
});

test('Web Mercator naar WGS84', () => {
  const [lng, lat] = mercatorNaarWgs84(545000, 6868000);
  bijna(lng, 4.8958, 0.001);
  bijna(lat, 52.3707, 0.01);
});

test('coördinatenstelsel herkennen', () => {
  assert.equal(herkenCrs([5.1, 52.1]), 'wgs84');
  assert.equal(herkenCrs([136000, 455000]), 'rd');
  assert.equal(herkenCrs([568000, 6820000]), 'mercator');
  assert.equal(herkenCrs([1, 1], 'urn:ogc:def:crs:EPSG::28992'), 'rd');
  assert.equal(herkenCrs([1, 1], 'urn:ogc:def:crs:OGC:1.3:CRS84'), 'wgs84');
  assert.throws(() => herkenCrs([1, 1], 'EPSG:31370'), /niet ondersteund/);
});

const vierkant = { type: 'Polygon', coordinates: [[[5, 52], [5.01, 52], [5.01, 52.01], [5, 52.01], [5, 52]]] };
const metGat = {
  type: 'Polygon',
  coordinates: [vierkant.coordinates[0], [[5.004, 52.004], [5.006, 52.004], [5.006, 52.006], [5.004, 52.006], [5.004, 52.004]]],
};

test('in vlak en afstand', () => {
  assert.ok(inVlak([5.005, 52.005], vierkant));
  assert.ok(!inVlak([5.005, 52.005], metGat));
  assert.ok(!inVlak([5.02, 52.005], vierkant));
  assert.equal(afstandTot([5.005, 52.005], vierkant), 0);
  bijna(afstandTot([5.02, 52.005], vierkant), 686.4, 2); // 0,01° oost ≈ 686 m op 52°
  bijna(afstandTot([5.0, 52.0], { type: 'Point', coordinates: [5.0, 52.001] }), 111.26, 0.1);
});

test('oppervlakte, lengte en middelpunt', () => {
  bijna(oppervlakte(vierkant), 686.4 * 1112.6, 1500);
  bijna(lengte({ type: 'LineString', coordinates: [[5, 52], [5, 52.01]] }), 1112.6, 1);
  const u = { type: 'Polygon', coordinates: [[[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]]] };
  assert.ok(inVlak(middelpunt(u), u), 'middelpunt van een U-vorm ligt in het vlak');
  assert.equal(soortGeometrie(vierkant), 'vlak');
});

test('GeoJSON in RD inlezen', () => {
  const fc = {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::28992' } },
    features: [
      { type: 'Feature', properties: { naam: 'A' }, geometry: { type: 'Point', coordinates: [155000, 463000, 3.2] } },
      { type: 'Feature', properties: {}, geometry: null },
    ],
  };
  const [laag] = leesGeojson(JSON.stringify(fc), 'test');
  assert.equal(laag.crs, 'rd');
  assert.equal(laag.features.length, 1);
  assert.deepEqual(laag.features[0].geometry.coordinates, [5.387206, 52.15517]);
  assert.throws(() => leesGeojson('geen json'), /geen geldige GeoJSON/);
});

function wkbPolygon(le = true) {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const buf = new ArrayBuffer(1 + 4 + 4 + 4 + ring.length * 16);
  const dv = new DataView(buf);
  let p = 0;
  dv.setUint8(p, le ? 1 : 0); p += 1;
  dv.setUint32(p, 3, le); p += 4;
  dv.setUint32(p, 1, le); p += 4;
  dv.setUint32(p, ring.length, le); p += 4;
  for (const [x, y] of ring) { dv.setFloat64(p, x, le); dv.setFloat64(p + 8, y, le); p += 16; }
  return new Uint8Array(buf);
}

test('WKB en GeoPackage-geometrie', () => {
  for (const le of [true, false]) {
    const g = leesWkb(wkbPolygon(le));
    assert.equal(g.type, 'Polygon');
    assert.deepEqual(g.coordinates[0][2], [1, 1]);
  }
  const wkb = wkbPolygon();
  const gp = new Uint8Array(8 + 32 + wkb.length);
  gp.set([0x47, 0x50, 0, 0b00000011]); // magic, versie, vlaggen: little-endian + envelop van 32 bytes
  gp.set(wkb, 40);
  assert.equal(leesGpkgGeometrie(gp).type, 'Polygon');
});

test('naar WGS84 rondt af en laat hoogte weg', () => {
  const g = naarWgs84({ type: 'LineString', coordinates: [[5.123456789, 52.1, 4]] }, 'wgs84');
  assert.deepEqual(g.coordinates, [[5.1234568, 52.1]]);
});

test('taken: samenstellen en logisch sorteren', () => {
  const objecten = [
    { id: 'a', code: 'A', geometrie: vierkant },
    { id: 'b', code: 'B', lat: 52.2, lng: 5.2 },
    { id: 'c', code: 'C', lat: 52.0005, lng: 5.0005 },
  ];
  const inspecties = [{
    id: 'i1', objectId: 'b', status: 'afgerond',
    gebreken: [{ id: 'g1', maatregel: 'Leuning vastzetten', urgentie: 'direct', maatregelStatus: 'open' }],
  }];
  const taken = [
    { id: 't1', objectId: 'a', soort: 'inspectie', prioriteit: 'normaal', status: 'open' },
    { id: 't2', objectId: 'c', soort: 'werk', prioriteit: 'laag', status: 'gereed' },
    { id: 't3', objectId: 'c', soort: 'werk', prioriteit: 'laag', status: 'open', toegewezenAan: 'ander@x.nl' },
  ];
  const planning = new Map([['a', { planning: 'verlopen' }], ['c', { planning: 'nooit' }], ['b', { planning: 'gepland' }]]);
  const lijst = takenLijst({ objecten, inspecties, taken, planning, vandaag: '2026-01-01', ik: 'mij@x.nl' });
  assert.deepEqual(lijst.map((t) => t.id).sort(), ['maatregel:i1:g1', 'planning:c', 'taak:t1']);

  // Zonder locatie: urgentste eerst.
  assert.equal(sorteerTaken(lijst)[0].id, 'maatregel:i1:g1');
  // In vlak A: de taak in het vlak gaat voor de directe maatregel 25 km verderop.
  const hier = sorteerTaken(lijst, [5.005, 52.005]);
  assert.equal(hier[0].id, 'taak:t1');
  assert.equal(hier[0].afstand, 0);
});
