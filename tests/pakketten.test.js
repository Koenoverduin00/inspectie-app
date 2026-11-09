import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  voortgang, voorMij, filterObjecten, rondesVan, rondeView, pakketStatus, overslaanId, totaalVoortgang,
} from '../js/pakketten.js';
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

test('rondes: impliciete ronde, weergave en voortgang per ronde', () => {
  const oud = { id: 'p', naam: 'Oud', soort: 'werk', werksoort: 'Reiniging', status: 'actief', objecten: ['a', 'b'] };
  assert.equal(rondesVan(oud).length, 1);
  assert.equal(rondesVan(oud)[0].id, 'standaard');
  assert.equal(rondeView(oud, rondesVan(oud)[0]).naam, 'Oud');
  assert.equal(overslaanId('p', 'a'), 'p:a', 'oude id blijft gelijk');

  const p = {
    id: 'p', code: 'WP-1', naam: 'Groen 2027', objecten: ['a', 'b', 'c'],
    rondes: [
      { id: 'r2', nummer: 2, naam: 'Maaien juni', soort: 'werk', werksoort: 'Groenonderhoud', status: 'gepland', objectIds: ['c', 'x'] },
      { id: 'r1', nummer: 1, naam: 'Maaien april', soort: 'werk', werksoort: 'Groenonderhoud', status: 'actief', objectIds: null },
    ],
  };
  assert.deepEqual(rondesVan(p).map((r) => r.id), ['r1', 'r2'], 'op volgorde van nummer');
  const v1 = rondeView(p, rondesVan(p)[0]);
  const v2 = rondeView(p, rondesVan(p)[1]);
  assert.deepEqual(v1.objecten, ['a', 'b', 'c'], 'zonder selectie: alle objecten van het pakket');
  assert.deepEqual(v2.objecten, ['c'], 'deelselectie, alleen objecten die in het pakket zitten');
  assert.equal(v2.naam, 'Groen 2027 – Maaien juni');
  assert.equal(pakketStatus(p), 'actief');
  assert.equal(overslaanId('p', 'a', 'r2'), 'p:r2:a');

  const werkzaamheden = [
    { objectId: 'a', werkpakketId: 'p', rondeId: 'r1', datum: '2027-04-02' },
    { objectId: 'c', werkpakketId: 'p', rondeId: 'r2', datum: '2027-06-02' },
  ];
  const overgeslagen = [{ pakketId: 'p', rondeId: 'r1', objectId: 'b', reden: 'Niet bereikbaar' }];
  const g1 = voortgang(v1, { werkzaamheden, overgeslagen });
  const g2 = voortgang(v2, { werkzaamheden, overgeslagen });
  assert.deepEqual([g1.gedaan.size, g1.overgeslagen.size, g1.open], [1, 1, ['c']]);
  assert.deepEqual([g2.gedaan.size, g2.overgeslagen.size, g2.open], [1, 0, []]);
  const t = totaalVoortgang([g1, g2]);
  assert.deepEqual([t.totaal, t.gedaan.size, t.overgeslagen.size], [4, 2, 1]);
});
