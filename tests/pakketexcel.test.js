import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verwerkImport, leesDatum } from '../js/pakketexcel.js';
import { rondeView, rondesVan } from '../js/pakketten.js';

const objecten = [
  { id: 'o1', code: 'GV-1', laagId: 'L1' }, { id: 'o2', code: 'GV-2', laagId: 'L1' }, { id: 'o3', code: 'GV-3', laagId: 'L1' },
  { id: 'o4', code: 'BM-1', laagId: 'L2' },
];
const ctx = (extra = {}) => {
  let n = 0;
  return {
    objecten, lagen: [{ id: 'L1', naam: 'Groenvakken' }, { id: 'L2', naam: 'Bomen' }], leden: ['jan@x.nl'],
    werksoorten: ['Maaien', 'Snoeien'], inspectiesoorten: ['Schouw', 'Boomveiligheidscontrole'], bestaand: [], nieuwId: () => `id${++n}`, ...extra,
  };
};
const raw = (o) => ({ meta: {}, pakketten: [], rondes: [], objecten: [], ...o });

test('leesDatum', () => {
  assert.equal(leesDatum('03-04-2027'), '2027-04-03');
  assert.equal(leesDatum('2027-04-03'), '2027-04-03');
  assert.equal(leesDatum(new Date(Date.UTC(2027, 3, 3))), '2027-04-03');
  assert.equal(leesDatum(46480), '2027-04-03');
  assert.equal(leesDatum(''), '');
  assert.equal(leesDatum('31-02-2027'), null);
  assert.equal(leesDatum('morgen'), null);
});

test('nieuw pakket met rondes, laag en deelselectie', () => {
  const r = verwerkImport(raw({
    pakketten: [{ rij: 2, code: 'WP-1', naam: 'Groen', u1: 'Jan@x.nl', vrijgave: 'Ja' }],
    rondes: [
      { rij: 2, pakket: 'wp-1', nummer: 1, naam: 'Maaien april', soort: 'Werkzaamheid', subsoort: 'maaien', start: '01-04-2027', eind: '30-04-2027', status: 'Actief' },
      { rij: 3, pakket: 'WP-1', nummer: 2, naam: 'Bomen', soort: 'Inspectie', subsoort: 'Boomveiligheidscontrole' },
    ],
    objecten: [
      { rij: 2, pakket: 'WP-1', laag: 'groenvakken' },
      { rij: 3, pakket: 'WP-1', object: 'BM-1', ronde: 'WP-1-R2' },
    ],
  }), ctx());
  assert.deepEqual(r.fouten, []);
  const p = r.pakketten[0].record;
  assert.equal(r.pakketten[0].actie, 'nieuw');
  assert.deepEqual(p.toegewezen, ['jan@x.nl']);
  assert.equal(p.vrijgaveVereist, true);
  assert.deepEqual(p.objecten, ['o4', 'o1', 'o2', 'o3']);
  const [r1, r2] = rondesVan(p);
  assert.equal(r1.werksoort, 'Maaien');
  assert.equal(r1.status, 'actief');
  assert.equal(r1.start, '2027-04-01');
  assert.deepEqual(rondeView(p, r1).objecten, ['o1', 'o2', 'o3'], 'BM-1 hoort alleen bij R2');
  assert.deepEqual(rondeView(p, r2).objecten, ['o4', 'o1', 'o2', 'o3']);
  assert.equal(r2.status, 'gepland');
});

test('fouten worden per blad en rij gemeld', () => {
  const r = verwerkImport(raw({
    pakketten: [{ rij: 2, code: 'WP-1', naam: '', u1: 'vreemd@x.nl', vrijgave: 'Misschien' }, { rij: 3, code: 'WP-1', naam: 'dubbel' }],
    rondes: [
      { rij: 2, pakket: 'WP-9', nummer: 1, naam: 'x', soort: 'Werkzaamheid' },
      { rij: 3, pakket: 'WP-1', nummer: 1.5, naam: 'x', soort: 'Werkzaamheid' },
      { rij: 4, pakket: 'WP-1', nummer: 1, naam: 'x', soort: 'Fietsen', start: '10-05-2027', eind: '01-05-2027' },
    ],
    objecten: [
      { rij: 2, pakket: 'WP-1', object: 'GV-1', laag: 'Bomen' },
      { rij: 3, pakket: 'WP-1', object: 'XX-9' },
      { rij: 4, pakket: 'WP-1', object: 'GV-1', ronde: 'WP-1-R7' },
    ],
  }), ctx());
  const t = r.fouten.map((f) => `${f.blad}:${f.rij}`);
  for (const verwacht of ['Werkpakketten:2', 'Werkpakketten:3', 'Rondes:2', 'Rondes:3', 'Rondes:4', 'Objecten:2', 'Objecten:3', 'Objecten:4']) {
    assert.ok(t.includes(verwacht), `${verwacht} in ${t}`);
  }
});

test('bijwerken: ronde-id op nummer, gedane objecten blijven', () => {
  const oud = {
    id: 'P', code: 'WP-1', naam: 'Oud', soort: 'werk', werksoort: 'Maaien', status: 'actief', objecten: ['o1', 'o2', 'o3'], aangemaakt: 'x',
  };
  const gedaan = new Map([['P', new Map([['standaard', new Set(['o2'])]])]]);
  const bestand = raw({
    pakketten: [{ rij: 2, code: 'WP-1', naam: 'Nieuw' }],
    rondes: [{ rij: 2, pakket: 'WP-1', nummer: 1, naam: 'R1', soort: 'Werkzaamheid' }, { rij: 3, pakket: 'WP-1', nummer: 2, naam: 'R2', soort: 'Werkzaamheid' }],
    objecten: [{ rij: 2, pakket: 'WP-1', object: 'GV-1' }, { rij: 3, pakket: 'WP-1', object: 'BM-1' }],
  });
  const r = verwerkImport(bestand, ctx({ bestaand: [oud], gedaan, verwijderOntbrekend: true }));
  assert.deepEqual(r.fouten, []);
  const p = r.pakketten[0].record;
  assert.equal(r.pakketten[0].actie, 'bijwerken');
  assert.equal(p.id, 'P');
  assert.equal(p.aangemaakt, 'x');
  assert.equal(p.soort, undefined, 'oude losse velden weg');
  assert.deepEqual(p.objecten, ['o4', 'o1', 'o2'], 'o3 weg, o2 (gedaan) blijft');
  assert.equal(p.rondes[0].id, 'standaard', 'R1 houdt de impliciete ronde-id');
  assert.equal(p.rondes[0].status, 'actief', 'lege status = bestaande status');
  assert.deepEqual(rondeView(p, p.rondes[0]).objecten, ['o4', 'o1', 'o2']);
  assert.deepEqual(rondeView(p, p.rondes[1]).objecten, ['o4', 'o1'], 'gedane o2 alleen in de ronde waar hij gedaan is');
  assert.deepEqual(r.pakketten[0].samenvatting, { rondes: 2, objecten: 3, bij: 1, af: 1, behouden: 1 });

  const zonder = verwerkImport(bestand, ctx({ bestaand: [oud], gedaan, verwijderOntbrekend: false }));
  assert.deepEqual(zonder.pakketten[0].record.objecten, ['o4', 'o1', 'o2', 'o3']);
});

test('nieuw pakket zonder rondes of objecten is een fout', () => {
  const r = verwerkImport(raw({ pakketten: [{ rij: 2, code: 'A', naam: 'x' }] }), ctx());
  assert.equal(r.fouten.length, 2);
});
