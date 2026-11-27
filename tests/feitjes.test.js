import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maken, vanDeDag, hash } from '../js/feitjes.js';

const maat = { a: { soort: 'vlak', maat: 9000 }, b: { soort: 'vlak', maat: 6000 }, c: { soort: 'lijn', maat: 2500 } };
const objecten = [
  { id: 'a', code: 'GV-1', naam: 'Gazon', type: 'Groenvak' }, { id: 'b', code: 'GV-2', naam: 'Heesters', type: 'Groenvak' },
  { id: 'c', code: 'S-1', naam: 'Sloot', type: 'Watergang' },
];
const werk = [
  { objectId: 'a', datum: '2026-05-12', uitvoerder: 'Piet', uren: 30, fotoIds: ['1', '2', '3'], gewijzigd: '2026-05-12T06:10:00' },
  { objectId: 'a', datum: '2026-05-12', uitvoerder: 'Kees', uren: 20, fotoIds: ['4', '5'], gewijzigd: '2026-05-12T10:00:00' },
  { objectId: 'b', datum: '2026-05-13', uitvoerder: 'Piet', uren: 1, gewijzigd: '2026-05-13T12:00:00' },
];

test('feitjes uit de projectgegevens', () => {
  const f = Object.fromEntries(maken({ objecten, werk, maatVan: (o) => maat[o.id], uurVan: (t) => Number(t.slice(11, 13)) }).map((x) => [x.id, x.tekst]));
  assert.match(f.voetbal, /15\.000 m².*2,1 voetbalvelden/);
  assert.match(f.atletiek, /2,5 km.*6 rondjes/);
  assert.match(f.grootste, /GV-1 Gazon: 9\.000 m²/);
  assert.match(f.type, /groenvak: 2 stuks van de 3/);
  assert.match(f.drukste, /12 mei 2026.*2 registraties/);
  assert.match(f.populair, /GV-1 Gazon.*2 keer/);
  assert.match(f.team, /2 verschillende mensen/);
  assert.match(f.vroeg, /^1 registratie werd/);
  assert.match(f.fotos, /5 foto’s.*1 pagina\./);
  assert.match(f.uren, /51 manuur.*1,3 volle werkweken/);
});

test('zonder gegevens geen feitjes; elke dag een ander maar stabiel', () => {
  assert.deepEqual(maken({}), []);
  assert.equal(vanDeDag([], '2026-11-27'), null);
  const lijst = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  assert.equal(vanDeDag(lijst, '2026-11-27', 'p1'), vanDeDag(lijst, '2026-11-27', 'p1'));
  assert.notEqual(vanDeDag(lijst, '2026-11-27', 'p1', 0), vanDeDag(lijst, '2026-11-27', 'p1', 1));
  const dagen = new Set(Array.from({ length: 10 }, (_, d) => vanDeDag(lijst, `2026-11-${10 + d}`, 'p1').id));
  assert.ok(dagen.size > 1);
  assert.equal(typeof hash('x'), 'number');
});
