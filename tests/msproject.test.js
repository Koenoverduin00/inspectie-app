import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as MP from '../js/msproject.js';

const invoer = {
  naam: 'Park & <Zuid>', nu: '2026-11-23T10:00:00.000Z',
  groepen: [
    { code: 'WP-001', naam: 'Groen', uitvoerders: ['Jan', 'Ploeg 2'], rondes: [
      { code: 'WP-001-R2', naam: 'Ronde 2', start: '2026-06-01', eind: '', percentage: 40.4 },
      { code: 'WP-001-R1', naam: 'Ronde 1', start: '2026-04-01', eind: '2026-04-30', percentage: 100 },
      { code: 'WP-001-R3', naam: 'Zonder datum' }] },
    { code: 'WP-009', naam: 'Leeg', rondes: [{ naam: 'x' }] },
  ],
  mijlpalen: [{ naam: 'Brug', datum: '2026-05-15', uitvoerder: 'Jan' }, { naam: 'Geen datum', datum: '' }],
};

test('werkdagen en periode', () => {
  assert.equal(MP.werkdagen('2026-04-01', '2026-04-30'), 22);
  assert.equal(MP.werkdagen('2026-11-21', '2026-11-22'), 1); // weekend: minimaal 1
  assert.deepEqual(MP.periodeVan({ start: '2026-06-01', eind: '' }), { start: '2026-06-01', eind: '2026-06-07', open: true });
  assert.equal(MP.periodeVan({ start: '' }), null);
});

test('MSPDI: hiërarchie, datums, handmatig gepland, resources en niet-geplande rondes', () => {
  const r = MP.mspdi(invoer);
  assert.equal(r.taken, 3);
  assert.deepEqual(r.nietGepland, ['WP-001 Groen – WP-001-R3 Zonder datum', 'WP-009 Leeg – x']);
  const x = r.xml;
  assert.match(x, /^<\?xml version="1.0" encoding="UTF-8" standalone="yes"\?>\n<Project xmlns="http:\/\/schemas.microsoft.com\/project">/);
  assert.match(x, /<Title>Park &amp; &lt;Zuid&gt;<\/Title>/);
  // Rondes op startdatum, onder het werkpakket
  const namen = [...x.matchAll(/<OutlineNumber>([\d.]+)<\/OutlineNumber>/g)].map((m) => m[1]);
  assert.deepEqual(namen, ['0', '1', '1.1', '1.2', '2', '2.1']);
  assert.match(x, /<Name>WP-001-R1 Ronde 1<\/Name>.*?<Start>2026-04-01T08:00:00<\/Start><Finish>2026-04-30T17:00:00<\/Finish><Duration>PT176H0M0S<\/Duration>/s);
  assert.match(x, /<Name>WP-001-R2 Ronde 2<\/Name><Active>1<\/Active><Manual>1<\/Manual>/);
  assert.match(x, /<PercentComplete>40<\/PercentComplete>/);
  assert.match(x, /als één week ingepland/);
  assert.match(x, /<Name>Brug<\/Name>.*?<Milestone>1<\/Milestone>/s);
  assert.equal((x.match(/<Resource><UID>[12]<\/UID>/g) ?? []).length, 2);
  assert.equal((x.match(/<Assignment>/g) ?? []).length, 5);
  // Volgorde volgens het MSPDI-schema binnen een taak
  const taak = x.match(/<Task>\n<UID>2<\/UID>[\s\S]*?<\/Task>/)[0];
  const volgorde = [...taak.matchAll(/<(\w+)>/g)].map((m) => m[1]).filter((n) => n !== 'Task');
  const schema = ['UID', 'ID', 'Name', 'Active', 'Manual', 'Type', 'IsNull', 'CreateDate', 'WBS', 'OutlineNumber', 'OutlineLevel', 'Priority', 'Start', 'Finish',
    'Duration', 'ManualStart', 'ManualFinish', 'ManualDuration', 'DurationFormat', 'EffortDriven', 'Recurring', 'Estimated', 'Milestone', 'Summary',
    'PercentComplete', 'ConstraintType', 'CalendarUID', 'Notes'];
  assert.deepEqual(volgorde, schema.filter((n) => volgorde.includes(n)));
});

test('Excel-regels voor de importwizard', () => {
  const r = MP.mspdi(invoer);
  const rijen = MP.excelRegels(r.regels);
  assert.equal(rijen.length, 5);
  assert.deepEqual(rijen[1].slice(0, 8), ['1.1', 2, 'WP-001-R1 Ronde 1', '2026-04-01', '2026-04-30', 22, 100, 'Nee']);
  assert.equal(rijen[1][8], 'Jan;Ploeg 2');
  assert.deepEqual(rijen[4].slice(2, 9), ['Brug', '2026-05-15', '2026-05-15', 0, 0, 'Ja', 'Jan']);
});

test('één regel per ronde: platte lijst op startdatum, werkpakket in naam en kolom, taken als mijlpaal', () => {
  const r = MP.mspdi({ ...invoer, indeling: 'rondes' });
  const nummers = [...r.xml.matchAll(/<OutlineNumber>([\d.]+)<\/OutlineNumber>.*?<OutlineLevel>(\d)<\/OutlineLevel>/gs)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(nummers, ['0:0', '1:1', '2:1', '3:1']);
  assert.equal((r.xml.match(/<Summary>1<\/Summary>/g) ?? []).length, 1); // alleen de projectregel
  assert.deepEqual(r.regels.map((t) => [t.naam, t.start, t.eind, t.werkpakket]), [
    ['WP-001-R1 Ronde 1 · Groen', '2026-04-01', '2026-04-30', 'WP-001 Groen'],
    ['Taak: Brug', '2026-05-15', '2026-05-15', ''],
    ['WP-001-R2 Ronde 2 · Groen', '2026-06-01', '2026-06-07', 'WP-001 Groen']]);
  assert.match(r.xml, /<Name>Taak: Brug<\/Name>.*?<Milestone>1<\/Milestone>/s);
  assert.match(r.xml, /Werkpakket: WP-001 Groen/);
  assert.equal(r.taken, 3);
  assert.equal(r.nietGepland.length, 2);
  assert.equal(MP.excelRegels(r.regels)[0][9], 'WP-001 Groen');
});

test('periode-overlap', () => {
  assert.equal(MP.inPeriode('2026-04-01', '2026-04-30', '2026-04-15', '2026-05-01'), true);
  assert.equal(MP.inPeriode('2026-04-01', '2026-04-30', '2026-05-01', ''), false);
  assert.equal(MP.inPeriode('2026-04-01', '2026-04-30', '', '2026-03-31'), false);
  assert.equal(MP.inPeriode('2026-04-01', '', '2026-04-01', '2026-04-01'), true);
  assert.equal(MP.inPeriode('', '', '', ''), false);
});
