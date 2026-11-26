import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/scope.js';
import { rondeView } from '../js/pakketten.js';

const pakket = () => ({
  id: 'P', naam: 'Maaien', objecten: ['a', 'b'],
  rondes: [
    { id: 'r1', nummer: 1, start: '2026-03-01', eind: '2026-03-31', status: 'afgerond' },
    { id: 'r2', nummer: 2, start: '2026-06-01', eind: '2026-06-30', status: 'actief' },
    { id: 'r3', nummer: 3, start: '2026-09-01', eind: '2026-09-30', status: 'gepland' },
  ],
});

test('scopeStatus', () => {
  assert.equal(S.scopeStatus({}, '2026-06-10'), 'in');
  assert.equal(S.scopeStatus({ scope: { per: '2026-06-10' } }, '2026-06-10'), 'uit');
  assert.equal(S.scopeStatus({ scope: { per: '2027-01-01' } }, '2026-06-10'), 'gepland');
});

test('rondeBesluit', () => {
  const d = { per: '2026-06-15', vandaag: '2026-06-15' };
  assert.equal(S.rondeBesluit({ status: 'afgerond', start: '2026-07-01' }, d), 'laten');
  assert.equal(S.rondeBesluit({ eind: '2026-06-14' }, d), 'laten');
  assert.equal(S.rondeBesluit({ start: '2026-06-15' }, d), 'weg');
  assert.equal(S.rondeBesluit({ start: '2026-06-01', eind: '2026-06-30' }, d), 'weg');
  assert.equal(S.rondeBesluit({ start: '2026-06-01', eind: '2026-06-30' }, { ...d, gedaan: true }), 'laten');
  assert.equal(S.rondeBesluit({}, { per: '2026-07-01', vandaag: '2026-06-15' }), 'later');
});

test('pasToe nu: lopende ronde open → eruit, afgeronde blijft, latere eruit', () => {
  const x = S.pasToe(pakket(), 'a', { per: '2026-06-15', vandaag: '2026-06-15' });
  assert.deepEqual([x.blijft, x.wacht, x.weg], [['r1'], [], ['r2', 'r3']]);
  const p = x.pakket;
  assert.deepEqual(rondeView(p, p.rondes[0]).objecten, ['a', 'b']);
  assert.deepEqual(rondeView(p, p.rondes[1]).objecten, ['b']);
  assert.deepEqual(rondeView(p, p.rondes[2]).objecten, ['b']);
  // een nieuwe ronde (bijv. een afroep) krijgt het object ook niet
  assert.deepEqual(rondeView(p, { id: 'r4' }).objecten, ['b']);
});

test('pasToe: al gedaan in de lopende ronde → blijft daar staan', () => {
  const x = S.pasToe(pakket(), 'a', { per: '2026-06-15', vandaag: '2026-06-15', gedaanIn: (rid) => rid === 'r2' });
  assert.deepEqual([x.blijft, x.weg], [['r1', 'r2'], ['r3']]);
});

test('pasToe met toekomstige datum: lopende ronde wacht, besluit op de datum', () => {
  const x = S.pasToe(pakket(), 'a', { per: '2026-06-20', vandaag: '2026-06-10' });
  assert.deepEqual([x.blijft, x.wacht, x.weg], [['r1'], ['r2'], ['r3']]);
  assert.deepEqual(rondeView(x.pakket, x.pakket.rondes[1]).objecten, ['a', 'b']);
  // op de ingangsdatum: niet gedaan → eruit; r3 blijft eruit, r1 blijft
  const y = S.pasToe(x.pakket, 'a', { per: '2026-06-20', vandaag: '2026-06-20', vast: x.pakket.uitScope.a });
  assert.deepEqual([y.blijft, y.wacht, y.weg], [['r1'], [], ['r2', 'r3']]);
  // wel gedaan → blijft
  const z = S.pasToe(x.pakket, 'a', { per: '2026-06-20', vandaag: '2026-06-20', vast: x.pakket.uitScope.a, gedaanIn: () => true });
  assert.deepEqual(z.blijft, ['r1', 'r2']);
});

test('pasToe: nergens meer nodig → uit het werkpakket, en terugzetten', () => {
  const p = { id: 'Q', objecten: ['a', 'b'], rondes: [{ id: 'r1', nummer: 1, start: '2026-07-01', objectIds: ['a'] }] };
  const x = S.pasToe(p, 'a', { per: '2026-06-15', vandaag: '2026-06-15' });
  assert.ok(x.helemaalWeg);
  assert.deepEqual(x.pakket.objecten, ['b']);
  assert.deepEqual(x.pakket.rondes[0].objectIds, []);
  assert.equal(x.pakket.uitScope, undefined);
  assert.equal(S.pasToe(x.pakket, 'a', { per: '2026-06-15', vandaag: '2026-06-15' }), null);
  const terug = S.zetTerug(x.pakket, 'a', [{ pakketId: 'Q', helemaalWeg: true }]);
  assert.deepEqual(terug.objecten, ['b', 'a']);
  // met besluit in het pakket: besluit weg
  const y = S.pasToe(pakket(), 'a', { per: '2026-06-15', vandaag: '2026-06-15' });
  assert.equal(S.zetTerug(y.pakket, 'a', []).uitScope, undefined);
  assert.equal(S.zetTerug(pakket(), 'a', []), null);
});

test('pakket zonder rondes en inRonde', () => {
  const p = { id: 'E', objecten: ['a'], status: 'actief', start: '2026-06-01' };
  const x = S.pasToe(p, 'a', { per: '2026-06-15', vandaag: '2026-06-15', gedaanIn: () => true });
  assert.deepEqual(x.blijft.length, 1);
  assert.ok(S.inRonde(x.pakket, x.blijft[0], 'a'));
  assert.ok(!S.inRonde(x.pakket, 'ander', 'a'));
  assert.ok(S.inRonde(x.pakket, 'ander', 'b'));
});

test('wijzigingen: nieuwste eerst', () => {
  const w = S.wijzigingen([{ id: 'a', code: 'A', scopeLog: [{ actie: 'uit', op: '2026-01-01' }, { actie: 'terug', op: '2026-02-01' }] }, { id: 'b', code: 'B' }]);
  assert.deepEqual(w.map((x) => `${x.code}:${x.actie}`), ['A:terug', 'A:uit']);
});
