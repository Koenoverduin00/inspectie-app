import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitsOpGeometrie, controleerFeatures, raadInstellingen, vindBestaandeLaag, planBijwerken, geometrieSleutel } from '../js/gisimport.js';

const punt = (x, y, p = {}) => ({ geometry: { type: 'Point', coordinates: [x, y] }, properties: p });
const vlak = (x, y, p = {}) => ({ geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y]]] }, properties: p });
const lijn = (x, y, p = {}) => ({ geometry: { type: 'LineString', coordinates: [[x, y], [x + 0.001, y]] }, properties: p });

test('gemengde laag wordt per geometriesoort gesplitst', () => {
  const lagen = splitsOpGeometrie([{ naam: 'Areaal', crs: 'rd', features: [punt(5, 52), vlak(5, 52), lijn(5, 52), vlak(5.1, 52)] }, { naam: 'Bomen', features: [punt(5, 52)] }]);
  assert.deepEqual(lagen.map((l) => [l.naam, l.soort, l.features.length]), [
    ['Areaal (punten)', 'punt', 1], ['Areaal (vlakken)', 'vlak', 2], ['Areaal (lijnen)', 'lijn', 1], ['Bomen', 'punt', 1]]);
  assert.equal(lagen[0].bronLaag, 'Areaal');
});

test('ongeldige coördinaten en ligging buiten Nederland', () => {
  const c = controleerFeatures([punt(5.1, 52.1), punt(NaN, 52), punt(300, 52), punt(-70, 40)]);
  assert.equal(c.features.length, 2);
  assert.equal(c.ongeldig, 2);
  assert.equal(c.buitenNl, 1);
});

test('instellingen raden: unieke codekolom, naamkolom, type', () => {
  const features = Array.from({ length: 50 }, (_, i) => vlak(5 + i / 1000, 52, { fid: i + 1, vakcode: `GV-${i + 1}`, naam: `Vak ${i}`, beheer: i % 2 ? 'Gras' : 'Heester' }));
  const inst = raadInstellingen({ naam: 'groenvakken_2024', soort: 'vlak', features }, { objecttypen: ['Groenvak', 'Overig'] });
  assert.equal(inst.codeveld, 'vakcode', 'betekenisvolle code gaat voor technische fid');
  assert.equal(inst.naamveld, 'naam');
  assert.equal(inst.type, 'Groenvak');
  assert.equal(inst.naam, 'groenvakken 2024');
  const dubbel = raadInstellingen({ naam: 'x', features: [punt(5, 52, { code: 'A' }), punt(5, 52, { code: 'A' })] });
  assert.equal(dubbel.codeveld, '', 'niet-unieke kolom → automatisch nummeren');
});

test('al ingeladen laag herkennen en bijwerken zonder koppelingen te verliezen', () => {
  const oud = [
    { id: 'a', laagId: 'L', code: 'GV-1', bronCode: 'GV-1', geometrie: vlak(5, 52).geometry, kenmerken: { vakcode: 'GV-1' } },
    { id: 'b', laagId: 'L', code: 'GV-2', bronCode: 'GV-2', geometrie: vlak(5.01, 52).geometry, kenmerken: { vakcode: 'GV-2' } },
    { id: 'c', laagId: 'L', code: 'GV-3', bronCode: 'GV-3', geometrie: vlak(5.02, 52).geometry, kenmerken: { vakcode: 'GV-3' } },
    { id: 'd', laagId: 'L', code: 'GV-4', bronCode: 'GV-4', geometrie: vlak(5.03, 52).geometry, kenmerken: { vakcode: 'GV-4' } },
  ];
  const nieuw = { naam: 'groen', soort: 'vlak', features: [
    vlak(5, 52, { fid: 7, vakcode: 'GV-1' }), // ongewijzigd (ander technisch rijnummer telt niet)
    vlak(5.0105, 52, { vakcode: 'GV-2' }), // geometrie gewijzigd
    vlak(5.05, 52, { vakcode: 'GV-9' }), // nieuw
  ] };
  const inst = { codeveld: 'vakcode' };
  const lagen = [{ id: 'L', naam: 'Groen', soort: 'vlak', bron: 'ander.gpkg' }, { id: 'P', naam: 'Bomen', soort: 'punt' }];
  const g = vindBestaandeLaag(nieuw, inst, { lagen, objecten: oud, bestandsnaam: 'groen.gpkg' });
  assert.equal(g.laag.id, 'L');
  assert.equal(vindBestaandeLaag({ ...nieuw, features: [vlak(6, 53, { vakcode: 'X' })] }, inst, { lagen, objecten: oud, bestandsnaam: 'x' }), null);
  assert.equal(vindBestaandeLaag({ ...nieuw, bronLaag: 'groen', features: [vlak(6, 53, { vakcode: 'X' })] }, inst, {
    lagen: [{ ...lagen[0], bron: 'groen.gpkg', bronLaag: 'groen' }], objecten: oud, bestandsnaam: 'groen.gpkg' }).laag.id, 'L', 'zelfde bestand en laagnaam');

  const p = planBijwerken(nieuw.features, inst, oud, new Set(['c']));
  assert.deepEqual(p.gelijk.map((x) => x.object.id), ['a']);
  assert.deepEqual(p.bijwerken.map((x) => x.object.id), ['b']);
  assert.equal(p.nieuw.length, 1);
  assert.deepEqual(p.verwijderen.map((o) => o.id), ['d']);
  assert.deepEqual(p.behouden.map((o) => o.id), ['c'], 'object met historie wordt niet verwijderd');

  // Zonder codekolom: koppeling op geometrie
  const zonder = planBijwerken([vlak(5, 52, { vakcode: 'GV-1' })], { codeveld: '' }, [{ ...oud[0], bronCode: '' }]);
  assert.equal(zonder.gelijk.length, 1);
  assert.notEqual(geometrieSleutel(vlak(5, 52).geometry), geometrieSleutel(vlak(5.0000011, 52).geometry));
});
