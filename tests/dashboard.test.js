import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schema, perWeek, telPer, startBinnenkort } from '../js/dashboard.js';

test('schema-signaal per ronde', () => {
  const r = { start: '2027-03-01', eind: '2027-03-10', status: 'actief' };
  const vg = (pct, open) => ({ percentage: pct, open: Array(open).fill('x'), totaal: 10 });
  assert.equal(schema(r, vg(0, 10), '2027-03-01').signaal, 'op schema', 'startdag: nog niets verwacht');
  assert.equal(schema(r, vg(40, 6), '2027-03-05').signaal, 'op schema', '4 van 10 dagen verstreken en 40% gedaan');
  assert.equal(schema(r, vg(25, 7), '2027-03-05').signaal, 'achter');
  assert.equal(schema(r, vg(10, 9), '2027-03-06').signaal, 'flinke achterstand');
  assert.equal(schema(r, vg(80, 2), '2027-03-12').signaal, 'te laat');
  assert.equal(schema(r, vg(0, 10), '2027-02-20').signaal, 'nog niet gestart');
  assert.equal(schema({ status: 'actief' }, vg(0, 10), '2027-03-01').signaal, 'ongepland');
  assert.equal(schema({ ...r, status: 'afgerond' }, vg(100, 0), '2027-04-01').signaal, 'afgerond');
  const s = schema(r, vg(40, 6), '2027-03-07');
  assert.equal(s.verwacht, 60);
  assert.equal(s.resterendDagen, 4);
  assert.equal(s.tempo, 1.5, '6 objecten in 4 dagen');
});

test('werk per week, tellen en binnenkort', () => {
  const w = [{ datum: '2027-03-10', uren: 2 }, { datum: '2027-03-11', uren: 3 }, { datum: '2027-03-02', uren: 1 }, { datum: '2026-01-01' }];
  const pw = perWeek(w, '2027-03-12', 4);
  assert.equal(pw.length, 4);
  assert.deepEqual(pw.map((x) => x.aantal), [0, 0, 1, 2]);
  assert.equal(pw[3].uren, 5);
  assert.equal(pw[3].week, 10);
  assert.deepEqual(telPer([{ s: 'A' }, { s: 'B' }, { s: 'A' }], (x) => x.s), [['A', 2], ['B', 1]]);
  const rondes = [{ r: { status: 'gepland', start: '2027-03-20' } }, { r: { status: 'gepland', start: '2027-05-01' } }, { r: { status: 'actief', start: '2027-03-13' } }];
  assert.equal(startBinnenkort(rondes, '2027-03-12').length, 1);
});
