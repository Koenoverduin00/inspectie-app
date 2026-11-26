import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../js/objecttabel.js';

const objecten = [
  { id: 'a', kenmerken: { BEHEERDER: 'Gemeente', OPP: 12.34567, leeg: '', geo: { x: 1 } } },
  { id: 'b', kenmerken: { Z_EXTRA: 'x', OPP: 4, ACTIEF: true } },
  { id: 'c' },
];

test('gisKolommen: volgorde van de laag eerst, lege en object-kolommen vallen weg', () => {
  assert.deepEqual(T.gisKolommen(objecten, [{ velden: ['OPP', 'BEHEERDER', 'leeg', 'ONBEKEND'] }]), ['OPP', 'BEHEERDER', 'ACTIEF', 'Z_EXTRA']);
  assert.deepEqual(T.gisKolommen([], []), []);
});

test('kolomkeuze: standaard, opgeschoond en GIS-kolommen met voorvoegsel', () => {
  const b = T.beschikbareKolommen(objecten, []);
  assert.ok(b.some((k) => k.id === 'k:OPP' && k.gis));
  assert.deepEqual(T.gekozenKolommen(null, b), ['naam', 'type', 'bouwjaar', 'conditie', 'laatste', 'planning']);
  assert.deepEqual(T.gekozenKolommen(['naam', 'k:OPP', 'k:WEG'], b), ['naam', 'k:OPP']);
  assert.deepEqual(T.gekozenKolommen([], b), []);
});

test('kenmerkTekst', () => {
  assert.equal(T.kenmerkTekst(objecten[0], 'OPP'), '12,346');
  assert.equal(T.kenmerkTekst(objecten[1], 'OPP'), '4');
  assert.equal(T.kenmerkTekst(objecten[1], 'ACTIEF'), 'ja');
  assert.equal(T.kenmerkTekst(objecten[0], 'geo'), '');
  assert.equal(T.kenmerkTekst(objecten[2], 'OPP'), '');
});

test('pagina: standaard 100 regels, grenzen en alles', () => {
  const lijst = Array.from({ length: 250 }, (_, i) => i);
  const p1 = T.pagina(lijst, 1);
  assert.equal(p1.items.length, 100); assert.equal(p1.paginas, 3); assert.equal(p1.van, 1); assert.equal(p1.tot, 100);
  const p3 = T.pagina(lijst, 3);
  assert.deepEqual([p3.items.length, p3.van, p3.tot], [50, 201, 250]);
  assert.equal(T.pagina(lijst, 99).nr, 3);
  assert.equal(T.pagina(lijst, 0).nr, 1);
  assert.equal(T.pagina(lijst, 1, 0).items.length, 250);
  assert.deepEqual(T.pagina([], 1), { items: [], nr: 1, paginas: 1, van: 0, tot: 0, totaal: 0 });
});

test('paginaNummers', () => {
  assert.deepEqual(T.paginaNummers(1, 3), [1, 2, 3]);
  assert.deepEqual(T.paginaNummers(1, 20), [1, 2, 3, 4, '…', 20]);
  assert.deepEqual(T.paginaNummers(10, 20), [1, '…', 9, 10, 11, '…', 20]);
  assert.deepEqual(T.paginaNummers(20, 20), [1, '…', 17, 18, 19, 20]);
});
