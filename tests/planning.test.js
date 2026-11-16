import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as PL from '../js/planning.js';

test('datums en weken', () => {
  assert.equal(PL.isoVan(PL.dagNr('2027-03-15')), '2027-03-15');
  assert.equal(PL.weekdag(PL.dagNr('2027-03-15')), 0, 'maandag');
  assert.equal(PL.isoVan(PL.maandag(PL.dagNr('2027-03-18'))), '2027-03-15');
  assert.equal(PL.weeknummer(PL.dagNr('2027-01-04')), 1);
  assert.equal(PL.weeknummer(PL.dagNr('2026-12-31')), 53);
  assert.equal(PL.weeknummer(PL.dagNr('2027-03-15')), 11);
});

test('bereik, kop en balken', () => {
  const b = PL.bereik('weken', '2027-03-17');
  assert.equal(PL.weekdag(b.begin), 0);
  assert.ok(b.begin < PL.dagNr('2027-03-17') && b.eind > PL.dagNr('2027-03-17'));
  const k = PL.kop(b);
  assert.ok(k.maanden.length >= 2 && k.weken.length >= 8);
  const r = { start: '2027-03-15', eind: '2027-03-21' };
  const x = PL.balk(r, b);
  assert.equal(x.width, 7 * b.px);
  assert.equal(x.left, (PL.dagNr('2027-03-15') - b.begin) * b.px);
  assert.equal(PL.balk({ start: '' }, b), null, 'niet gepland');
  assert.equal(PL.periode({ start: '2027-03-15' }).eind - PL.periode({ start: '2027-03-15' }).start, 6, 'zonder eind: één week');
  assert.equal(PL.balk({ start: '2030-01-01', eind: '2030-01-05' }, b), null, 'buiten beeld');
});

test('verslepen en te laat', () => {
  const p = { start: 100, eind: 106 };
  assert.deepEqual(PL.versleep(p, 'verplaats', 3), { start: 103, eind: 109 });
  assert.deepEqual(PL.versleep(p, 'eind', -10), { start: 100, eind: 100 }, 'minstens één dag');
  assert.deepEqual(PL.versleep(p, 'begin', 2), { start: 102, eind: 106 });
  assert.ok(PL.teLaat({ eind: '2027-01-01', status: 'actief' }, '2027-02-01'));
  assert.ok(!PL.teLaat({ eind: '2027-01-01', status: 'afgerond' }, '2027-02-01'));
});

test('duur en balktekst', () => {
  assert.equal(PL.duurVan({ duur: 14 }), 14);
  assert.equal(PL.duurVan({ start: '2027-03-01', eind: '2027-03-10' }), 10);
  assert.equal(PL.duurVan({}), 7);
  assert.equal(PL.duurTekst(21), '3 weken');
  assert.equal(PL.duurTekst(10), '10 dagen');
  const r = { nummer: 1, naam: 'Maaien april', status: 'actief' };
  assert.equal(PL.balkTekst(r, 40, 300), 'R1 Maaien april · 40%');
  assert.equal(PL.balkTekst(r, 40, 80), 'R1 · 40%');
  assert.equal(PL.balkTekst(r, 40, 35), 'R1');
  assert.equal(PL.balkTekst({ ...r, status: 'afgerond' }, 100, 48), '✓ R1');
  assert.equal(PL.balkTekst({ ...r, status: 'afgerond' }, 100, 34), 'R1');
  assert.equal(PL.balkTekst(r, 40, 10), '');
});

test('periodefilter voor rondes: standaard dit kalenderjaar', async () => {
  const PL = await import('../js/planning.js');
  const nu = '2026-11-16';
  const jaarlijks = [2024, 2025, 2026, 2027, 2028, 2029].map((j, i) => ({ id: `r${i}`, start: `${j}-04-01`, eind: `${j}-04-30` }));
  const b = PL.periodeBereik('', nu);
  assert.deepEqual([b.van, b.tot], ['2026-01-01', '2026-12-31']);
  assert.deepEqual(jaarlijks.filter((r) => PL.rondeInPeriode(r, b)).map((r) => r.start), ['2026-04-01']);
  assert.deepEqual(jaarlijks.filter((r) => PL.rondeInPeriode(r, PL.periodeBereik('volgend', nu))).map((r) => r.start), ['2027-04-01']);
  assert.deepEqual(jaarlijks.filter((r) => PL.rondeInPeriode(r, PL.periodeBereik('j:2028', nu))).map((r) => r.start), ['2028-04-01']);
  assert.equal(jaarlijks.filter((r) => PL.rondeInPeriode(r, PL.periodeBereik('alles', nu))).length, 6);
  // komende 12 maanden: april 2027 valt erin, april 2026 niet
  assert.deepEqual(jaarlijks.filter((r) => PL.rondeInPeriode(r, PL.periodeBereik('12mnd', nu))).map((r) => r.start), ['2027-04-01']);
  // eigen periode (ook omgekeerd ingevuld) en overlap over de jaargrens
  const e = PL.periodeBereik('eigen:2026-12-31:2026-03-01', nu);
  assert.deepEqual([e.van, e.tot], ['2026-03-01', '2026-12-31']);
  assert.equal(PL.rondeInPeriode({ start: '2025-12-15', eind: '2026-01-10' }, b), true);
  // niet ingepland telt altijd mee
  assert.equal(PL.rondeInPeriode({ start: '' }, b), true);
  assert.deepEqual(PL.jarenVanRondes(jaarlijks, nu), [2024, 2025, 2026, 2027, 2028, 2029]);
  assert.deepEqual(PL.jarenVanRondes([], nu), [2026]);
});

test('afmelden op locatie: planning die het dichtst bij vandaag ligt bovenaan', async () => {
  const PL = await import('../js/planning.js');
  const nu = '2026-11-16';
  const r = (code, start, eind) => ({ code, start, eind });
  assert.equal(PL.afstandTotVandaag(r('a', '2026-11-01', '2026-11-30'), nu), 0);
  assert.equal(PL.afstandTotVandaag(r('a', '2026-11-20', '2026-11-30'), nu), 4);
  assert.equal(PL.afstandTotVandaag(r('a', '2026-01-01', '2026-03-31'), nu), 230);
  assert.equal(PL.afstandTotVandaag(r('a', '', ''), nu), Infinity);
  const lijst = [
    { v: r('Q1', '2026-01-05', '2026-03-31'), st: 'open' },
    { v: r('Q4', '2026-10-01', '2026-12-31'), st: 'open' },
    { v: r('Q3', '2026-07-01', '2026-09-30'), st: 'open' },
    { v: r('KLAAR', '2026-11-10', '2026-11-20'), st: 'gedaan' },
    { v: r('LOS', '', ''), st: 'open' },
    { v: r('BINNENKORT', '2026-11-19', '2026-11-25'), st: 'open' },
    { v: r('VERLOPEN', '2026-11-01', '2026-11-13'), st: 'open' },
  ];
  assert.deepEqual(PL.dichtstbijEerst(lijst, nu).map((x) => x.v.code), ['Q4', 'BINNENKORT', 'VERLOPEN', 'Q3', 'Q1', 'LOS', 'KLAAR']);
});
