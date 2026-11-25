import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as HS from '../js/herstel.js';

const insp = [
  { id: 'i1', objectId: 'o2', werkpakketId: 'p', rondeId: 'r1', status: 'afgerond',
    bvc: { maatregelen: [{ id: 'm1', bvcMaatregel: 'Veiligheidssnoei', maatregel: 'Veiligheidssnoei', urgentie: '3maanden', lat: 52, lng: 5 }] } },
  { id: 'i2', objectId: 'o1', werkpakketId: 'p', rondeId: 'r1', status: 'afgerond',
    gebreken: [{ id: 'g1', maatregel: 'Herstellen', urgentie: 'direct' }, { id: 'g2', gebrek: 'zonder maatregel' }, { id: 'g3', maatregel: 'Vervangen', urgentie: '1jaar', maatregelStatus: 'uitgevoerd' }] },
  { id: 'i3', objectId: 'o3', werkpakketId: 'p', rondeId: 'r1', status: 'concept', gebreken: [{ id: 'g9', maatregel: 'X', urgentie: 'direct' }] },
  { id: 'i4', objectId: 'o4', werkpakketId: 'p', rondeId: 'r2', status: 'afgerond', gebreken: [{ id: 'g8', maatregel: 'Y', urgentie: 'direct' }] },
];
const code = (id) => ({ o1: 'A1', o2: 'A2' })[id] ?? id;

test('rondeGebreken: alleen afgeronde inspecties van de ronde, met maatregel, urgent eerst', () => {
  const l = HS.rondeGebreken(insp, 'p', 'r1', { objectCode: code });
  assert.deepEqual(l.map((x) => x.sleutel), ['i2:g1', 'i1:m1', 'i2:g3']);
});

test('selecteer: alle, geen, eerste n, urgentie, besluit; uitgevoerde nooit', () => {
  const l = HS.rondeGebreken(insp, 'p', 'r1', { objectCode: code });
  assert.deepEqual([...HS.selecteer(l, 'alle')], ['i2:g1', 'i1:m1']);
  assert.equal(HS.selecteer(l, 'geen').size, 0);
  assert.deepEqual([...HS.selecteer(l, 'eerste', { n: 1 })], ['i2:g1']);
  assert.deepEqual([...HS.selecteer(l, 'urgentie', { urgentie: '3maanden' })], ['i1:m1']);
  assert.deepEqual([...HS.selecteer(l, 'besluit', { besluit: 'onderhoud', standaard: { Veiligheidssnoei: 'onderhoud' } })], ['i1:m1']);
  assert.deepEqual([...HS.selecteer(l, 'nietDoorgezet', { doorgezet: { 'i2:g1': { rondeId: 'x' } } })], ['i1:m1']);
});

test('besluitVan: keuze in de ronde gaat voor de standaard, ook een lege keuze', () => {
  const [a] = HS.rondeGebreken(insp, 'p', 'r1').filter((x) => x.sleutel === 'i1:m1');
  assert.equal(HS.besluitVan(a, {}, { Veiligheidssnoei: 'onderhoud' }), 'onderhoud');
  assert.equal(HS.besluitVan(a, { 'i1:m1': 'meerwerk' }, { Veiligheidssnoei: 'onderhoud' }), 'meerwerk');
  assert.equal(HS.besluitVan(a, { 'i1:m1': '' }, { Veiligheidssnoei: 'onderhoud' }), '');
});

test('afrondControle: open objecten, concepten en te beoordelen', () => {
  const c = HS.afrondControle({ voortgang: { open: ['o3'] }, inspecties: [...insp, { id: 'i5', werkpakketId: 'p', rondeId: 'r1', status: 'afgerond', b: 'ingediend' }],
    pakketId: 'p', rondeId: 'r1', beoordeling: (r) => r.b ?? '' });
  assert.deepEqual(c.open, ['o3']);
  assert.deepEqual(c.concepten.map((x) => x.id), ['i3']);
  assert.deepEqual(c.teBeoordelen.map((x) => x.id), ['i5']);
});

test('herstelRonde, voegToe en herstelItems', () => {
  const l = HS.rondeGebreken(insp, 'p', 'r1');
  const r = HS.herstelRonde({ id: 'h', bronPakket: { id: 'p' }, bronRonde: { id: 'r1', nummer: 2 }, items: l.slice(0, 1), rondes: [{ nummer: 1 }, { nummer: 2 }] });
  assert.equal(r.nummer, 3);
  assert.equal(r.naam, 'Gebreken uit R2');
  assert.deepEqual(r.objectIds, ['o1']);
  const r2 = HS.voegToe(r, l);
  assert.equal(r2.herstel.items.length, 3);
  assert.deepEqual(r2.objectIds.sort(), ['o1', 'o2']);
  const it = HS.herstelItems(r2, insp);
  assert.equal(it.find((x) => x.sleutel === 'i2:g3').uitgevoerd, true);
  assert.equal(it.find((x) => x.sleutel === 'i1:m1').gebrek.lat, 52);
});

test('restantRonde en markeerDoorgezet', () => {
  const r = HS.restantRonde({ soort: 'inspectie', rondes: [{ nummer: 1 }] }, { id: 'r1', nummer: 1, soort: 'inspectie', inspectiesoort: 'BVC' }, ['o1', 'o1', 'o2'], { id: 'x' });
  assert.equal(r.nummer, 2); assert.equal(r.naam, 'Restant R1'); assert.deepEqual(r.objectIds, ['o1', 'o2']); assert.equal(r.inspectiesoort, 'BVC');
  const a = HS.markeerDoorgezet({ op: 'd' }, ['i1:m1'], { pakketId: 'p', rondeId: 'h' });
  assert.deepEqual(a, { op: 'd', doorgezet: { 'i1:m1': { pakketId: 'p', rondeId: 'h' } } });
});

test('locatieVerplicht', () => {
  assert.equal(HS.locatieVerplicht('vlaklijn', 'Point'), false);
  assert.equal(HS.locatieVerplicht(undefined, 'Polygon'), true);
  assert.equal(HS.locatieVerplicht('vlaklijn', 'MultiLineString'), true);
  assert.equal(HS.locatieVerplicht('altijd', 'Point'), true);
  assert.equal(HS.locatieVerplicht('nooit', 'Polygon'), false);
});
