import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voortgang, voorMij, filterObjecten } from '../js/pakketten.js';
import { takenLijst } from '../js/taken.js';

const pakket = { id: 'p1', soort: 'werk', objecten: ['a', 'b', 'c', 'd', 'weg'] };

test('voortgang: gedaan, overgeslagen en open', () => {
  const v = voortgang(pakket, {
    objectIds: ['a', 'b', 'c', 'd'],
    werkzaamheden: [
      { id: 'w1', objectId: 'a', werkpakketId: 'p1', datum: '2026-05-01' },
      { id: 'w2', objectId: 'a', werkpakketId: 'p1', datum: '2026-05-03' },
      { id: 'w3', objectId: 'b', werkpakketId: 'ander', datum: '2026-05-01' }, // ander pakket telt niet
      { id: 'w4', objectId: 'x', werkpakketId: 'p1', datum: '2026-05-01' }, // niet in pakket
    ],
    overgeslagen: [
      { pakketId: 'p1', objectId: 'c', reden: 'Niet bereikbaar' },
      { pakketId: 'p1', objectId: 'a', reden: 'Anders' }, // al gedaan: telt als gedaan
    ],
  });
  assert.equal(v.totaal, 4, 'verwijderde objecten tellen niet mee');
  assert.deepEqual([...v.gedaan.keys()], ['a']);
  assert.equal(v.gedaan.get('a').id, 'w2', 'laatste registratie');
  assert.deepEqual([...v.overgeslagen.keys()], ['c']);
  assert.deepEqual(v.open, ['b', 'd']);
  assert.equal(v.percentage, 50);
});

test('voortgang inspectiepakket telt alleen afgeronde inspecties', () => {
  const p = { id: 'p2', soort: 'inspectie', objecten: ['a', 'b'] };
  const v = voortgang(p, {
    inspecties: [
      { objectId: 'a', werkpakketId: 'p2', status: 'afgerond', datum: '2026-01-01' },
      { objectId: 'b', werkpakketId: 'p2', status: 'concept', datum: '2026-01-01' },
    ],
  });
  assert.deepEqual([...v.gedaan.keys()], ['a']);
  assert.deepEqual(v.open, ['b']);
});

test('toewijzing en filters', () => {
  assert.ok(voorMij({ toegewezen: [] }, 'x@y.nl'));
  assert.ok(voorMij({ toegewezen: ['x@y.nl'] }, 'X@Y.nl'));
  assert.ok(!voorMij({ toegewezen: ['a@y.nl'] }, 'x@y.nl'));
  const objecten = [
    { id: '1', code: 'GV-1', naam: 'Gazon', laagId: 'L1', type: 'Groenvak', kenmerken: { beheertype: 'Gazon' } },
    { id: '2', code: 'GV-2', naam: 'Heg', laagId: 'L1', type: 'Groenvak', kenmerken: { beheertype: 'Heesters' } },
    { id: '3', code: 'KW-1', naam: 'Brug', type: 'Brug (vast)' },
  ];
  const status = new Map([['1', { conditie: 2, planning: 'verlopen' }], ['2', { conditie: null }], ['3', { conditie: 4 }]]);
  const ids = (f) => filterObjecten(objecten, f, { status }).map((o) => o.id);
  assert.deepEqual(ids({ laag: 'L1' }), ['1', '2']);
  assert.deepEqual(ids({ laag: '-' }), ['3']);
  assert.deepEqual(ids({ laag: 'L1', kenmerk: 'beheertype', waarde: 'Gazon' }), ['1']);
  assert.deepEqual(ids({ type: 'Brug (vast)' }), ['3']);
  assert.deepEqual(ids({ conditie: 'geen' }), ['2']);
  assert.deepEqual(ids({ planning: 'verlopen' }), ['1']);
  assert.deepEqual(ids({ zoek: 'heg' }), ['2']);
});

test('open pakketobjecten worden taken', () => {
  const objecten = [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }];
  const lijst = takenLijst({
    objecten, inspecties: [], taken: [], planning: new Map([['a', { planning: 'verlopen' }]]), vandaag: '2026-06-01',
    pakketten: [{ pakket: { id: 'p', naam: 'Schouwronde', soort: 'inspectie', eind: '2026-05-01' }, open: ['a', 'b'] }],
  });
  const pak = lijst.filter((t) => t.bron === 'pakket');
  assert.equal(pak.length, 2);
  assert.equal(pak[0].rang, 2, 'verlopen pakket is hoog');
  assert.equal(pak[0].pakketId, 'p');
  assert.ok(!lijst.some((t) => t.bron === 'planning'), 'geen dubbele planningstaak voor object in inspectiepakket');
});
