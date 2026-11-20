import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as GI from '../js/geominwinning.js';
import * as velden from '../js/velden.js';

// Ongeveer 10 m per stap: 0,0000898° breedte ≈ 10 m; lengte op 52° ≈ 0,0001461° per 10 m.
const p = (dx, dy) => ({ lng: 5 + dx * 0.0001461, lat: 52 + dy * 0.0000898 });

test('geominwinning: lengte, oppervlakte en vorm', () => {
  const lijn = GI.maak('lijn', [p(0, 0), p(10, 0)]);
  assert.ok(Math.abs(lijn.lengte - 100) < 1, `lengte ${lijn.lengte}`);
  const vlak = GI.maak('vlak', [p(0, 0), p(10, 0), p(10, 5), p(0, 5)]);
  assert.ok(Math.abs(vlak.oppervlakte - 5000) < 60, `oppervlakte ${vlak.oppervlakte}`);
  assert.ok(Math.abs(vlak.lengte - 300) < 3);
  assert.equal(GI.geometrie(vlak).type, 'Polygon');
  assert.deepEqual(GI.geometrie(vlak).coordinates[0][0], GI.geometrie(vlak).coordinates[0][4]);
  assert.match(GI.wkt(lijn), /^LINESTRING \(5 52, 5\.001461 52\)$/);
  assert.match(GI.wkt(GI.maak('punt', [p(0, 0), p(1, 1)])), /^MULTIPOINT/);
  assert.match(GI.tekst(vlak), /^Vlak · 4 punten · 4\.9\d\d(,\d)? m²/);
  assert.equal(GI.feature(vlak, { veld: 'Talud' }).properties.oppervlakte_m2, vlak.oppervlakte);
  assert.ok(GI.schets(vlak).pad.endsWith('Z'));
});

test('geominwinning: lopend inwinnen filtert onnauwkeurige en te dichte punten', () => {
  let r = GI.voegGpsToe([], { ...p(0, 0), nk: 4 });
  assert.equal(r.toegevoegd, true);
  r = GI.voegGpsToe(r.punten, { ...p(0.1, 0), nk: 4 });
  assert.equal(r.reden, 'te dichtbij');
  r = GI.voegGpsToe(r.punten, { ...p(1, 0), nk: 40 });
  assert.equal(r.reden, 'onnauwkeurig');
  r = GI.voegGpsToe(r.punten, { ...p(1, 0), nk: 5 });
  assert.equal(r.punten.length, 2);
  assert.equal(r.punten[1].bron, 'gps');
});

test('geominwinning: veldtype, controle en keuze per formulier', () => {
  const d = velden.normaliseer({ id: 'g', formulier: 'inspectie', label: 'Schade', type: 'geometrie', verplicht: true, inwinning: 'vlak' });
  assert.equal(d.inwinning, 'vlak');
  assert.deepEqual(GI.toegestaan(d), ['vlak']);
  assert.deepEqual(GI.toegestaan({ ...d, inwinning: 'keuze' }), ['punt', 'lijn', 'vlak']);
  assert.equal(velden.normaliseer({ ...d, inwinning: 'raar' }).inwinning, 'keuze');
  assert.deepEqual(velden.controleer([d], {}), ['Schade is verplicht']);
  assert.deepEqual(velden.controleer([d], { g: GI.maak('vlak', [p(0, 0), p(1, 0)]) }), ['Schade: een vlak heeft minstens 3 punten nodig']);
  assert.deepEqual(velden.controleer([d], { g: GI.maak('vlak', [p(0, 0), p(1, 0), p(1, 1)]) }), []);
});
