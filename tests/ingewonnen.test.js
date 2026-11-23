import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as IW from '../js/ingewonnen.js';

const velden = [
  { id: 'v1', label: 'Schadevlak', type: 'geometrie', formulier: 'inspectie' },
  { id: 'w1', label: 'Gemaaide strook', type: 'geometrie', formulier: 'werk' },
  { id: 'l1', label: 'Plek', type: 'locatie', formulier: 'werk' },
];
const vlak = { soort: 'vlak', punten: [{ lat: 52, lng: 5 }, { lat: 52.001, lng: 5 }, { lat: 52.001, lng: 5.001 }] };

test('vormen uit registratie, bevinding en locatievraag; GPS van bevindingen apart', () => {
  const r = IW.verzamel({
    inspecties: [{ id: 'i1', datum: '2026-11-20T10:00', objectId: 'o1', inspecteur: 'Piet', extra: { v1: vlak },
      bevindingLabels: { b9: 'Scheurlijn' },
      gebreken: [{ bouwdeel: 'Dek', gebrek: 'Scheur', lat: 52.0005, lng: 5.0005, nauwkeurigheid: 4, extra: { b9: { soort: 'lijn', punten: [{ lat: 52, lng: 5 }, { lat: 52.0002, lng: 5.0002 }] } } },
        { checkpunt: true, bouwdeel: 'Leuning' }] }],
    werkzaamheden: [{ id: 'w1', datum: '2026-11-21', extra: { w1: { soort: 'punt', punten: [{ lat: 52, lng: 5 }, { lat: 52.1, lng: 5.1 }] }, l1: { lat: 52.2, lng: 5.2, bron: 'gps', nauwkeurigheid: 3 }, tekst: 'x' } },
      { id: 'w2', verwijderd: true, extra: { w1: vlak } }],
  }, { velden });
  assert.deepEqual(r.vormen.map((f) => [f.properties.veld, f.geometry.type]), [
    ['Schadevlak', 'Polygon'], ['Scheurlijn', 'LineString'], ['Gemaaide strook', 'MultiPoint'], ['Plek', 'Point'],
  ]);
  const lijn = r.vormen[1].properties;
  assert.equal(lijn.bevinding, 1);
  assert.equal(lijn.bevindingNaam, 'Dek – Scheur');
  assert.equal(lijn.store, 'inspecties');
  assert.equal(r.vormen[0].properties.door, 'Piet');
  assert.ok(r.vormen[0].properties.oppervlakte_m2 > 0);
  assert.deepEqual(r.vormen[3].geometry.coordinates, [5.2, 52.2]);
  assert.equal(r.gps.length, 1);
  assert.deepEqual(r.gps[0].geometry.coordinates, [5.0005, 52.0005]);
  assert.match(r.gps[0].properties.omschrijving, /± 4 m/);
});

test('ongeldige of lege waarden worden overgeslagen', () => {
  const r = IW.verzamel({ inspecties: [{ id: 'i', extra: { a: { soort: 'lijn', punten: [] }, b: { lat: '', lng: '' }, c: { lat: 500, lng: 5 } }, gebreken: [{ lat: null, lng: null }] }] }, { velden });
  assert.equal(r.vormen.length, 0);
  assert.equal(r.gps.length, 0);
  assert.deepEqual(IW.verzamel(null), { vormen: [], gps: [] });
});

test('export: WKT, rijen en KML', () => {
  const r = IW.verzamel({ inspecties: [{ id: 'i1', datum: '2026-11-20', extra: { v1: vlak }, gebreken: [{ lat: 52, lng: 5 }] }] }, { velden });
  assert.match(IW.wkt(r.vormen[0].geometry), /^POLYGON \(\(5 52, 5 52.001, 5.001 52.001, 5 52\)\)$/);
  assert.equal(IW.wkt({ type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] }), 'MULTIPOINT ((1 2), (3 4))');
  const rij = IW.rijen(r.vormen)[0];
  assert.equal(rij[0], 'Inspectie');
  assert.equal(rij[5], 'Schadevlak');
  assert.match(rij.at(-1), /^POLYGON/);
  const k = IW.kml([...r.vormen, ...r.gps], 'Test & co');
  assert.match(k, /<name>Test &amp; co<\/name>/);
  assert.equal((k.match(/<Placemark>/g) ?? []).length, 2);
  assert.match(k, /<Polygon>.*5,52 5,52.001/);
  assert.match(k, /#gps/);
});
