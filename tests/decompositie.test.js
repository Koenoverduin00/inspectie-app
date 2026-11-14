import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/decompositie.js';

test('lijst-indeling met ouders, eenheid en GIS-code', () => {
  const { knopen, fouten, indeling } = D.leesDecompositie(D.SJABLOON);
  assert.equal(indeling, 'lijst');
  assert.deepEqual(fouten, []);
  assert.deepEqual(D.telling(knopen), { object: 1, element: 2, bouwdeel: 4 });
  const idx = D.index(knopen);
  const dek = knopen.find((k) => k.naam === 'Brugdek');
  assert.equal(dek.hoeveelheid, 240);
  assert.equal(D.pad(idx, dek.id).map((k) => k.niveau).join('>'), 'object>element>bouwdeel');
  const obj = knopen.find((k) => k.niveau === 'object');
  assert.equal(D.bouwdelenOnder(idx, obj.id).length, 4);
  assert.equal(D.bouwdelenOnder(idx, dek.id).length, 1);
});

test('ids blijven gelijk bij opnieuw inlezen', () => {
  const a = D.leesDecompositie(D.SJABLOON).knopen.map((k) => k.id);
  const b = D.leesDecompositie(D.SJABLOON).knopen.map((k) => k.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test('fouten in lijst-indeling', () => {
  const { knopen, fouten } = D.leesDecompositie([
    ['Code', 'Naam', 'Niveau', 'Bovenliggende code'],
    ['O1', 'Gemaal', 'object', ''],
    ['B1', 'Pomp', 'bouwdeel', 'O1'],
    ['E1', 'Werktuigbouw', 'element', 'XX'],
    ['Z', 'Raar', 'iets', ''],
  ]);
  assert.equal(knopen.length, 1);
  assert.equal(fouten.length, 3);
});

test('kolommen-indeling Object/Element/Bouwdeel', () => {
  const { knopen, fouten, indeling } = D.leesDecompositie([
    ['Objectcode', 'Object', 'Element', 'Bouwdeel', 'Eenheid', 'Hoeveelheid', 'GIS code'],
    ['KW1', 'Brug', 'Onderbouw', 'Landhoofd', 'st', '2', 'G1'],
    ['KW1', 'Brug', 'Onderbouw', 'Pijler', 'st', '3', ''],
    ['KW1', 'Brug', 'Bovenbouw', 'Dek', 'm2', '120,5', ''],
    ['', '', 'Wees', '', '', '', ''],
  ]);
  assert.equal(indeling, 'kolommen');
  assert.equal(fouten.length, 1);
  assert.deepEqual(D.telling(knopen), { object: 1, element: 2, bouwdeel: 3 });
  assert.equal(knopen.find((k) => k.naam === 'Dek').hoeveelheid, 120.5);
  assert.equal(knopen.find((k) => k.naam === 'Landhoofd').gis, 'G1');
});

test('csv lezen', () => {
  const r = D.leesCsvTekst('﻿Code;Naam;Niveau\r\nA;"Brug; oud";object\r\n');
  assert.deepEqual(r[1], ['A', 'Brug; oud', 'object']);
});

test('koppelen op code', () => {
  const { knopen } = D.leesDecompositie(D.SJABLOON);
  const lh = knopen.find((k) => k.naam === 'Landhoofd noord');
  const m = D.koppelOpCode(knopen, [{ id: 'a', code: 'kw-001-lh-n' }, { id: 'b', code: 'KW-001' }, { id: 'c', code: 'X' }, { id: 'd', code: 'KW-001', decomp: lh.id }]);
  assert.equal(m.get('a'), lh.id);
  assert.equal(knopen.find((k) => k.id === m.get('b')).niveau, 'object');
  assert.equal(m.has('c'), false);
  assert.equal(m.has('d'), false);
});

test('scores alleen per bouwdeel', () => {
  const i = {
    status: 'afgerond', datum: '2026-05-01', id: 'i1',
    bouwdelen: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3', nietGeinspecteerd: true, reden: 'onder water' }],
    gebreken: [{ bouwdeelId: 'b1', conditieHandmatig: 4 }, { bouwdeelId: 'b1', conditieHandmatig: 2 }],
  };
  const s = D.bouwdeelScores(i);
  assert.deepEqual(s.map((b) => b.score), [4, 1, null]);
  assert.deepEqual(D.scoreVerdeling(i), { 1: 1, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0, niet: 1 });
  assert.equal(D.perBouwdeel(i), true);
  assert.equal(D.perBouwdeel({ gebreken: [] }), false);
  const later = { ...i, id: 'i2', datum: '2026-09-01', bouwdelen: [{ id: 'b1' }], gebreken: [] };
  const l = D.laatsteBouwdeelScores([later, i]);
  assert.equal(l.get('b1').score, 1);
  assert.equal(l.get('b2').score, 1);
  assert.equal(l.has('b3'), false);
});

test('export naar regels is weer in te lezen', () => {
  const { knopen } = D.leesDecompositie(D.SJABLOON);
  const terug = D.leesDecompositie(D.naarRegels(knopen));
  assert.deepEqual(terug.fouten, []);
  assert.deepEqual(terug.knopen.map((k) => k.id).sort(), knopen.map((k) => k.id).sort());
});

test('bijwerken op een code die hetzelfde is gebleven', () => {
  const oud = D.leesDecompositie(D.SJABLOON).knopen;
  const regels = D.SJABLOON.map((r) => [...r]);
  regels[3][1] = 'Landhoofd noordzijde';          // naam gewijzigd
  regels[6][5] = 260;                              // hoeveelheid gewijzigd
  regels.splice(7, 1);                             // Leuning vervalt
  regels.push(['KW-001.2.3', 'Voegovergang', 'Bouwdeel', 'KW-001.2', 'm1', 12, '']);
  const nieuw = D.leesDecompositie(regels).knopen;
  const r = D.bijwerken(oud, nieuw, 'code');
  assert.equal(r.ongewijzigd, 4);
  assert.deepEqual(r.gewijzigd.map((g) => `${g.knoop.code}:${g.velden.join('+')}`).sort(), ['KW-001.1.1:naam', 'KW-001.2.1:hoeveelheid']);
  assert.deepEqual(r.toegevoegd.map((k) => k.naam), ['Voegovergang']);
  assert.deepEqual(r.vervallen.map((k) => k.naam), ['Leuning']);
  const lh = oud.find((k) => k.code === 'KW-001.1.1');
  assert.equal(r.knopen.find((k) => k.code === 'KW-001.1.1').id, lh.id);
  const ids = new Set(r.knopen.map((k) => k.id));
  assert.ok(r.knopen.every((k) => !k.ouder || ids.has(k.ouder)));
});

test('bijwerken op GIS-code behoudt id bij gewijzigde code', () => {
  const oud = D.leesDecompositie(D.SJABLOON).knopen;
  const regels = D.SJABLOON.map((r) => [...r]);
  regels[3][0] = 'NIEUW-1';
  const nieuw = D.leesDecompositie(regels.map((r, i) => (i === 3 ? [r[0], r[1], r[2], 'KW-001.1', r[4], r[5], r[6]] : r))).knopen;
  const lh = oud.find((k) => k.gis === 'KW-001-LH-N');
  const r = D.bijwerken(oud, nieuw, 'gis');
  const k = r.knopen.find((x) => x.gis === 'KW-001-LH-N');
  assert.equal(k.id, lh.id);
  assert.ok(r.gewijzigd.some((g) => g.knoop.id === lh.id && g.velden.includes('code')));
});

test('kolommen vergelijken', () => {
  const v = D.vergelijkKolommen(['Code', 'Naam', 'Niveau', 'Bovenliggende code'], ['code', 'Naam', 'Niveau', 'Ouder', 'Extra']);
  assert.deepEqual(v.ontbreekt, ['Bovenliggende code']);
  assert.deepEqual(v.extra, ['Ouder', 'Extra']);
});

test('aanpassen, toevoegen en verwijderen', () => {
  let kn = D.leesDecompositie(D.SJABLOON).knopen;
  const dek = kn.find((k) => k.naam === 'Brugdek');
  assert.ok(D.pasKnoopAan(kn, dek.id, { code: 'KW-001.2.2' }).fout);
  kn = D.pasKnoopAan(kn, dek.id, { naam: 'Brugdek (beton)', hoeveelheid: 250 }).knopen;
  assert.equal(kn.find((k) => k.id === dek.id).naam, 'Brugdek (beton)');
  const el = kn.find((k) => k.naam === 'Bovenbouw');
  const r = D.voegKnoopToe(kn, el.id, { naam: 'Voeg', code: 'KW-001.2.9' }, 'x1');
  assert.equal(r.knoop.niveau, 'bouwdeel');
  assert.ok(D.voegKnoopToe(r.knopen, 'x1', { naam: 'Te diep' }, 'x2').fout);
  assert.equal(D.voegKnoopToe(r.knopen, null, { naam: 'Gemaal' }, 'x3').knoop.niveau, 'object');
  const w = D.verwijderKnoop(r.knopen, el.id);
  assert.equal(w.weg.size, 4);
  assert.equal(D.telling(w.knopen).bouwdeel, 2);
});
