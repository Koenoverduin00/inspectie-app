import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as PV from '../js/planningversie.js';

const rondesVan = (p) => p.rondes;
const pakketten = [
  { id: 'p1', code: 'WP-1', rondes: [{ id: 'r1', nummer: 1, naam: 'Voorjaar', start: '2026-03-02', eind: '2026-03-13', status: 'gepland' }, { id: 'r2', nummer: 2, naam: '', start: '', eind: '', status: 'gepland' }] },
  { id: 'p2', code: 'WP-2', planning: 'afroep', rondes: [{ id: 'a1', nummer: 1, start: '2026-01-01' }] },
];

test('instellingen: standaard vastzetten uit, alleen beheer aan', () => {
  assert.deepEqual(PV.instellingen({}), { vastzetten: false, alleenBeheer: true });
  assert.deepEqual(PV.instellingen({ planningVastzetten: true, planningAlleenBeheer: false }), { vastzetten: true, alleenBeheer: false });
});

test('magBewerken: vast, alleen beheer, recht', () => {
  assert.deepEqual(PV.magBewerken({}, { beheerder: true }), { mag: true, reden: '' });
  assert.deepEqual(PV.magBewerken({}, { rechtPlannen: true }), { mag: false, reden: 'beheer' });
  assert.deepEqual(PV.magBewerken({ planningAlleenBeheer: false }, { rechtPlannen: true }), { mag: true, reden: '' });
  assert.deepEqual(PV.magBewerken({ planningAlleenBeheer: false }, {}), { mag: false, reden: 'recht' });
  assert.deepEqual(PV.magBewerken({ planningVastzetten: true, planningVast: true }, { beheerder: true }), { mag: false, reden: 'vast' });
  // vastzetten uitgezet: een oude 'vast'-stand telt niet
  assert.deepEqual(PV.magBewerken({ planningVastzetten: false, planningVast: true }, { beheerder: true }), { mag: true, reden: '' });
});

test('momentopname zonder afroepen', () => {
  const m = PV.momentopname(pakketten, rondesVan);
  assert.deepEqual(m, [['p1:r1', 'WP-1 R1 Voorjaar', '2026-03-02', '2026-03-13', 'gepland'], ['p1:r2', 'WP-1 R2', '', '', 'gepland']]);
});

test('vastzetten, versienummers, vrijgeven en label', () => {
  let p = { planningVastzetten: true };
  assert.equal(PV.versieLabel(p), 'v1 (concept)');
  p = { ...p, ...PV.vastzetten(p, PV.momentopname(pakketten, rondesVan), { op: 't1', door: 'Jan', opmerking: ' Basis ' }) };
  assert.equal(PV.isVast(p), true);
  assert.equal(PV.versieLabel(p), 'v1');
  assert.equal(PV.laatsteVersie(p).opmerking, 'Basis');
  p = { ...p, ...PV.vrijgeven(p, { op: 't2', door: 'Jan', reden: 'Storm' }) };
  assert.equal(PV.isVast(p), false);
  assert.equal(PV.versieLabel(p), 'v2 (concept)');
  p = { ...p, ...PV.vastzetten(p, [], { op: 't3' }) };
  assert.deepEqual(PV.versies(p).map((v) => v.nummer), [1, 2]);
  assert.deepEqual(p.planningLog.map((l) => `${l.actie}${l.versie}`), ['vastgezet1', 'vrijgegeven1', 'vastgezet2']);
  assert.equal(PV.versieLabel({ planningVersies: p.planningVersies }), '', 'functie uit: geen label');
});

test('vergelijk: verschoven, duur, nieuw, vervallen, ingepland', () => {
  const oud = [['a', 'A', '2026-03-02', '2026-03-06', 'gepland'], ['b', 'B', '2026-04-01', '2026-04-03', 'gepland'], ['c', 'C', '', '', 'gepland'], ['d', 'D', '2026-05-01', '2026-05-02', 'gepland'], ['e', 'E', '2026-06-01', '2026-06-01', 'gepland']];
  const nieuw = [['a', 'A', '2026-03-09', '2026-03-13', 'actief'], ['b', 'B', '2026-04-01', '2026-04-08', 'gepland'], ['c', 'C', '2026-07-01', '2026-07-02', 'gepland'], ['e', 'E', '2026-06-01', '2026-06-01', 'gepland'], ['f', 'F', '', '', 'gepland']];
  const v = PV.vergelijk(oud, nieuw);
  assert.deepEqual(v.map((x) => `${x.label}:${x.soort}`), ['A:verschoven', 'B:duur', 'C:ingepland', 'D:vervallen', 'F:nieuw']);
  assert.equal(v[0].dagen, 7);
});

test('maximaal aantal versies', () => {
  let p = { planningVastzetten: true };
  for (let n = 0; n < PV.MAX_VERSIES + 5; n++) p = { ...p, ...PV.vastzetten(p, [], { op: String(n) }) };
  assert.equal(PV.versies(p).length, PV.MAX_VERSIES);
  assert.equal(PV.laatsteVersie(p).nummer, PV.MAX_VERSIES + 5);
});
