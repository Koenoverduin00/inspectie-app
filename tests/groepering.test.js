import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/groepering.js';
import { index } from '../js/decompositie.js';

// Kunstwerk K1 met twee elementen; element E1 heeft drie bouwdelen, E2 twee. Plus een los object zonder decompositie.
const knopen = [
  { id: 'S', niveau: 'systeemdeel', naam: 'Kunstwerken' },
  { id: 'K1', niveau: 'object', naam: 'Brug', code: 'K1', ouder: 'S' },
  { id: 'E1', niveau: 'element', naam: 'Leuning', code: 'E1', ouder: 'K1' },
  { id: 'E2', niveau: 'element', naam: 'Dek', code: 'E2', ouder: 'K1' },
  { id: 'B1', niveau: 'bouwdeel', naam: 'Regel', ouder: 'E1' },
  { id: 'B2', niveau: 'bouwdeel', naam: 'Stijl', ouder: 'E1' },
  { id: 'B3', niveau: 'bouwdeel', naam: 'Voetplaat', ouder: 'E1' },
  { id: 'B4', niveau: 'bouwdeel', naam: 'Slijtlaag', ouder: 'E2' },
  { id: 'B5', niveau: 'bouwdeel', naam: 'Voeg', ouder: 'E2' },
];
const idx = index(knopen);
const objecten = { o1: { decomp: 'B1' }, o2: { decomp: 'B2' }, o3: { decomp: 'B3' }, o4: { decomp: 'B4' }, o5: { decomp: 'B5' }, x: {} };
const van = (id) => objecten[id];

test('groeperen op element: alleen de bouwdelen uit het werkpakket', () => {
  // Werkpakket met o1, o2 (E1) en o4 (E2) en het losse object; o3 en o5 horen niet bij het pakket.
  const g = G.groepeer(['o1', 'o2', 'o4', 'x'], van, idx, 'element');
  assert.deepEqual(g.map((x) => [x.sleutel, x.objectIds]), [['E1', ['o1', 'o2']], ['E2', ['o4']], ['los:x', ['x']]]);
  assert.equal(G.groepNaam(g[0]), 'E1 Leuning (2 bouwdelen)');
  assert.equal(G.groepVan(g, 'o2').sleutel, 'E1');
});

test('groeperen op beheerobject en systeemdeel', () => {
  assert.deepEqual(G.groepeer(['o1', 'o4'], van, idx, 'object').map((x) => [x.sleutel, x.objectIds.length]), [['K1', 2]]);
  assert.deepEqual(G.groepeer(['o1', 'o4'], van, idx, 'systeemdeel').map((x) => x.sleutel), ['S']);
});

test('zonder niveau of zonder decompositie: elk object een eigen groep', () => {
  assert.deepEqual(G.groepeer(['o1', 'o2'], van, idx, '').map((x) => x.sleutel), ['los:o1', 'los:o2']);
  assert.deepEqual(G.groepeer(['o1', 'o2'], van, null, 'element').map((x) => x.sleutel), ['los:o1', 'los:o2']);
});

test('object gekoppeld aan een element telt als zichzelf op elementniveau', () => {
  const v2 = (id) => (id === 'e' ? { decomp: 'E2' } : van(id));
  assert.deepEqual(G.groepeer(['e', 'o4'], v2, idx, 'element').map((x) => [x.sleutel, x.objectIds]), [['E2', ['e', 'o4']]]);
});

test('beschikbare niveaus', () => {
  assert.deepEqual(G.beschikbareNiveaus(['o1', 'x'], van, idx), ['element', 'object', 'systeemdeel']);
  const zonderSys = index(knopen.filter((k) => k.id !== 'S').map((k) => (k.id === 'K1' ? { ...k, ouder: null } : k)));
  assert.deepEqual(G.beschikbareNiveaus(['o1'], van, zonderSys), ['element', 'object']);
  assert.deepEqual(G.beschikbareNiveaus(['x'], van, idx), []);
});

test('status van een groep', () => {
  assert.equal(G.groepStatus(['gedaan', 'gedaan']), 'gedaan');
  assert.equal(G.groepStatus(['gedaan', 'overgeslagen']), 'gedaan');
  assert.equal(G.groepStatus(['overgeslagen', 'overgeslagen']), 'overgeslagen');
  assert.equal(G.groepStatus(['open', 'open']), 'open');
  assert.equal(G.groepStatus(['open', 'gedaan']), 'deels');
  assert.equal(G.groepStatus(['gedaan', 'afgekeurd']), 'afgekeurd');
  assert.equal(G.groepStatus(['ingediend', 'ingediend']), 'ingediend');
  assert.equal(G.groepStatus(['deels', 'gedaan']), 'deels');
});

test('boom: beheerobject → element → bouwdelen, alleen objecten uit de ronde', () => {
  const b = G.boom(['o1', 'o2', 'o4', 'x'], van, idx, 'object');
  assert.deepEqual(b.objectIds, ['x']);
  assert.equal(b.kinderen.length, 1);
  const k1 = b.kinderen[0];
  assert.equal(k1.knoop.id, 'K1');
  assert.deepEqual(k1.kinderen.map((e) => [e.knoop.id, e.niveau, e.objectIds]), [['E2', 'element', ['o4']], ['E1', 'element', ['o1', 'o2']]].sort((a, c) => a[0].localeCompare(c[0])));
  assert.deepEqual(k1.alle.sort(), ['o1', 'o2', 'o4']);
  assert.deepEqual(G.boomNiveaus('element'), ['element']);
  assert.deepEqual(G.boomNiveaus('systeemdeel'), ['systeemdeel', 'object', 'element']);
  // vanaf element: geen object-laag
  assert.deepEqual(G.boom(['o1', 'o4'], van, idx, 'element').kinderen.map((e) => e.knoop.id), ['E1', 'E2']);
});
