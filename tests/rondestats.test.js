import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as RS from '../js/rondestats.js';

const regs = [
  { id: 'w1', objectId: 'a', datum: '2026-11-03', uitvoerder: 'Bram', uren: 4, status: 'gereed' },
  { id: 'w2', objectId: 'b', datum: '2026-11-05', uitvoerder: 'Bram', uren: 4, status: 'vervolg' },
  { id: 'w3', objectId: 'c', datum: '2026-11-10', uitvoerder: 'Jan', uren: 2, gereed: false },
];
const vg = {
  totaal: 10, percentage: 30,
  gedaan: new Map([['a', regs[0]], ['b', regs[1]]]),
  deels: new Map([['c', [regs[2]]]]),
  overgeslagen: new Map([['d', { objectId: 'd', reden: 'Niet bereikbaar', op: '2026-11-06', door: 'Jan' }]]),
  nietNodig: new Set(), open: ['c', 'e', 'f', 'g', 'h', 'i', 'j'],
};

test('werkdagen en plus werkdagen', () => {
  assert.equal(RS.werkdagenTussen('2026-11-02', '2026-11-30'), 21);
  assert.equal(RS.werkdagenTussen('2026-11-30', '2026-11-02'), 0);
  assert.equal(RS.plusWerkdagen('2026-11-27', 1), '2026-11-30'); // vrijdag + 1 werkdag = maandag
});

test('statistiek van een lopende ronde: stand, tijd, schema, tempo, prognose, uren, uitvoerders', () => {
  const s = RS.rondeStatistiek({ ronde: { start: '2026-11-02', eind: '2026-11-30', status: 'actief' }, vg, registraties: regs, vandaag: '2026-11-16' });
  assert.deepEqual(s.aantallen, { totaal: 10, gedaan: 2, deels: 1, overgeslagen: 1, nietNodig: 0, open: 7, nietGestart: 6 });
  assert.deepEqual([s.tijd.fase, s.tijd.werkdagen, s.tijd.verstreken, s.tijd.resterend, s.tijd.pctTijd], ['loopt', 21, 11, 11, 52]);
  assert.deepEqual([s.schema.verwachtPct, s.schema.verschilPct, s.schema.objectenAchter], [52, -22, 2]);
  assert.equal(s.tempo.gerealiseerd, 0.3); // 3 afgehandeld in 11 werkdagen
  assert.equal(s.tempo.nodig, 0.6); // 7 open in 11 werkdagen
  assert.ok(s.tempo.prognose > '2026-11-30');
  assert.ok(s.tempo.verschil > 0);
  assert.deepEqual([s.activiteit.registraties, s.activiteit.laatste, s.activiteit.laatsteWie, s.activiteit.dagenStil], [3, '2026-11-10', 'Jan', 6]);
  assert.deepEqual(s.uitvoerders, [{ wie: 'Bram', objecten: 2, registraties: 2 }, { wie: 'Jan', objecten: 1, registraties: 1 }]);
  assert.deepEqual(s.uren, { totaal: 10, perObject: 3.3, rest: 23.1 });
  assert.equal(s.vervolg, 1);
  assert.deepEqual(s.redenen, [{ reden: 'Niet bereikbaar', aantal: 1 }]);
});

test('fases en lege gevallen', () => {
  const leeg = { totaal: 4, percentage: 0, gedaan: new Map(), deels: new Map(), overgeslagen: new Map(), nietNodig: new Set() };
  assert.equal(RS.rondeStatistiek({ ronde: {}, vg: leeg, vandaag: '2026-11-16' }).tijd.fase, 'niet ingepland');
  const toekomst = RS.rondeStatistiek({ ronde: { start: '2026-12-01', eind: '2026-12-31' }, vg: leeg, vandaag: '2026-11-16' });
  assert.deepEqual([toekomst.tijd.fase, toekomst.schema, toekomst.tempo, toekomst.uren], ['nog niet gestart', null, null, null]);
  const verlopen = RS.rondeStatistiek({ ronde: { start: '2026-10-01', eind: '2026-10-31' }, vg: leeg, vandaag: '2026-11-16' });
  assert.deepEqual([verlopen.tijd.fase, verlopen.schema.verwachtPct, verlopen.schema.objectenAchter, verlopen.tempo.prognose], ['verlopen', 100, 4, null]);
  const klaar = { ...leeg, totaal: 1, percentage: 100, gedaan: new Map([['a', { datum: '2026-11-02' }]]) };
  assert.equal(RS.rondeStatistiek({ ronde: { start: '2026-11-02', eind: '2026-11-30' }, vg: klaar, vandaag: '2026-11-16' }).tijd.fase, 'afgerond');
});

test('objectregels met status en details; oordelen', () => {
  const lijst = RS.objectRegels(['a', 'c', 'd', 'e'], vg, { objectVan: (id) => ({ id, code: id.toUpperCase() }), oordeelVan: (r) => (r.status === 'vervolg' ? { label: 'Slecht' } : { label: 'Goed' }) });
  assert.deepEqual(lijst.map((x) => [x.id, x.status, x.wie ?? '', x.datum ?? '']), [['a', 'gedaan', 'Bram', '2026-11-03'], ['c', 'deels', 'Jan', '2026-11-10'], ['d', 'overgeslagen', 'Jan', '2026-11-06'], ['e', 'open', '', '']]);
  assert.equal(lijst[2].reden, 'Niet bereikbaar');
  const s = RS.rondeStatistiek({ ronde: {}, vg, registraties: regs, vandaag: '2026-11-16', oordeelVan: (r) => (r.status === 'vervolg' ? { label: 'Slecht' } : { label: 'Goed' }) });
  assert.deepEqual(s.oordelen.map((o) => [o.label, o.aantal]), [['Goed', 1], ['Slecht', 1]]);
});
