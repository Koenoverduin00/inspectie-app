import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/decompositie.js';

test('lijst-indeling met ouders, eenheid en GIS-code', () => {
  const { knopen, fouten, indeling } = D.leesDecompositie(D.SJABLOON);
  assert.equal(indeling, 'lijst');
  assert.deepEqual(fouten, []);
  assert.deepEqual(D.telling(knopen), { systeemdeel: 1, object: 1, element: 2, bouwdeel: 4 });
  const idx = D.index(knopen);
  const dek = knopen.find((k) => k.naam === 'Brugdek');
  assert.equal(dek.hoeveelheid, 240);
  assert.equal(D.pad(idx, dek.id).map((k) => k.niveau).join('>'), 'systeemdeel>object>element>bouwdeel');
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
  assert.deepEqual(D.telling(knopen), { systeemdeel: 0, object: 1, element: 2, bouwdeel: 3 });
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
  regels[4][1] = 'Landhoofd noordzijde';          // naam gewijzigd
  regels[7][5] = 260;                              // hoeveelheid gewijzigd
  regels.splice(8, 1);                             // Leuning vervalt
  regels.push(['KW-001.2.3', 'Voegovergang', 'Bouwdeel', 'KW-001.2', 'm1', 12, '']);
  const nieuw = D.leesDecompositie(regels).knopen;
  const r = D.bijwerken(oud, nieuw, 'code');
  assert.equal(r.ongewijzigd, 5);
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
  regels[4][0] = 'NIEUW-1';
  const nieuw = D.leesDecompositie(regels.map((r, i) => (i === 4 ? [r[0], r[1], r[2], 'KW-001.1', r[4], r[5], r[6]] : r))).knopen;
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

test('werkboek met tabbladen per niveau', () => {
  const bladen = [
    { naam: 'Objecten', regels: [['Objectcode', 'Naam'], ['EP2', 'Europoortkering 2'], ['EP3', 'Europoortkering 3']] },
    { naam: 'Elementen', regels: [['Elementcode', 'Element', 'Objectcode'], ['EP2-D1', 'Europoortkering 2 sectie D1', 'EP2'], ['EP2-D2', 'Europoortkering 2 sectie D2', 'Europoortkering 2']] },
    { naam: 'Bouwdelen', regels: [['Bouwdeelcode', 'Bouwdeel', 'Elementcode', 'Eenheid', 'Hoeveelheid'], ['B1', 'Bekleding', 'EP2-D1', 'm2', '120'], ['B2', 'Kruin', 'EP2-D2', 'm1', '40'], ['B3', 'Teen', 'XX', '', '']] },
    { naam: 'Blad2', regels: [['iets'], ['anders']] },
  ];
  const r = D.leesBladen(bladen);
  assert.equal(r.indeling, 'tabbladen');
  assert.deepEqual(D.telling(r.knopen), { systeemdeel: 0, object: 2, element: 2, bouwdeel: 2 });
  assert.equal(r.fouten.length, 1);
  assert.match(r.fouten[0], /Tabblad "Bouwdelen", regel 4/);
  assert.deepEqual(r.bladen.map((b) => [b.naam, b.niveau, b.rijen, b.gebruikt]), [['Objecten', 'object', 2, true], ['Elementen', 'element', 2, true], ['Bouwdelen', 'bouwdeel', 3, true], ['Blad2', null, 0, false]]);
  const idx = D.index(r.knopen);
  const b2 = r.knopen.find((k) => k.code === 'B2');
  assert.equal(D.pad(idx, b2.id).map((k) => k.code).join('>'), 'EP2>EP2-D2>B2');
  assert.ok(r.kop.includes('Bouwdelen › Bouwdeelcode'));
});

test('werkboek met één blad met de hele decompositie', () => {
  const r = D.leesBladen([{ naam: 'Info', regels: [['Toelichting']] }, { naam: 'Decompositie', regels: D.SJABLOON }]);
  assert.equal(r.indeling, 'lijst');
  assert.equal(r.knopen.length, 8);
  assert.deepEqual(r.bladen.map((b) => b.gebruikt), [false, true]);
});

test('standaard het tabblad Bouwdelen met alle codes; namen uit de andere tabbladen', () => {
  const r = D.leesBladen([
    { naam: 'Objecten', regels: [['Objectcode', 'Naam'], ['EPK2', 'Europoortkering 2']] },
    { naam: 'Elementen', regels: [['Elementcode', 'Naam'], ['EPK2-D1', 'Europoortkering 2 sectie D1']] },
    { naam: 'Bouwdelen', regels: [['Objectcode', 'Elementcode', 'Bouwdeelcode', 'Bouwdeel', 'Eenheid', 'Hoeveelheid'],
      ['EPK2', 'EPK2-D1', 'B1', 'Steenbekleding', 'm2', '1200'], ['EPK2', 'EPK2-D1', 'B2', 'Kruin', 'm1', '300'], ['EPK2', 'EPK2-D2', 'B3', 'Teen', '', '']] },
    { naam: 'Blad2', regels: [['x']] },
  ]);
  assert.equal(r.indeling, 'tabblad-bouwdelen');
  assert.deepEqual(D.telling(r.knopen), { systeemdeel: 0, object: 1, element: 2, bouwdeel: 3 });
  assert.equal(r.knopen.find((k) => k.code === 'EPK2').naam, 'Europoortkering 2');
  assert.equal(r.knopen.find((k) => k.code === 'EPK2-D1').naam, 'Europoortkering 2 sectie D1');
  assert.equal(r.knopen.find((k) => k.code === 'EPK2-D2').naam, 'EPK2-D2');
  assert.equal(r.knopen.find((k) => k.code === 'B1').hoeveelheid, 1200);
  assert.deepEqual(r.bladen.map((b) => [b.naam, b.gebruikt, b.rol]), [['Objecten', false, 'namen'], ['Elementen', false, 'namen'], ['Bouwdelen', true, 'decompositie'], ['Blad2', false, '']]);
  assert.ok(r.kop.every((k) => k.startsWith('Bouwdelen › ')));
});

test('kolommen: losse kolom Code is de bouwdeelcode', () => {
  const r = D.leesDecompositie([['Object', 'Element', 'Bouwdeel', 'Code'], ['Brug', 'Onderbouw', 'Landhoofd', 'B-01']]);
  assert.equal(r.knopen.find((k) => k.niveau === 'bouwdeel').code, 'B-01');
});

test('tabbladen zonder codes: verwijzen op naam', () => {
  const r = D.leesBladen([
    { naam: 'Objecten', regels: [['Object'], ['Europoortkering 2']] },
    { naam: 'Elementen', regels: [['Element', 'Object'], ['Europoortkering 2 sectie D1', 'Europoortkering 2']] },
    { naam: 'Bouwdelen', regels: [['Bouwdeel', 'Element'], ['Bekleding', 'Europoortkering 2 sectie D1']] },
  ]);
  assert.deepEqual(r.fouten, []);
  assert.deepEqual(D.telling(r.knopen), { systeemdeel: 0, object: 1, element: 1, bouwdeel: 1 });
});

test('ruime herkenning van kolomnamen (ID, nummer, omschrijving, type)', () => {
  // Tabbladen per niveau met afwijkende koppen
  const r = D.leesBladen([
    { naam: 'Objecten', regels: [['Object ID', 'Objectnaam'], ['O1', 'Europoortkering 2 sectie D1']] },
    { naam: 'Elementen', regels: [['Element ID', 'Elementtype', 'Object ID'], ['E1', 'Bekleding', 'O1'], ['E2', 'Kruin', 'O1']] },
    { naam: 'Bouwdelen', regels: [['Bouwdeelnummer', 'Omschrijving', 'Element ID'], ['B1', 'Steen', 'E1'], ['B2', 'Gras', 'E2']] },
  ]);
  assert.deepEqual(D.telling(r.knopen), { systeemdeel: 0, object: 1, element: 2, bouwdeel: 2 });
  assert.match(r.bladen[1].herkend, /hoort bij object: Object ID/);
  // Tabblad Bouwdelen met de hele keten en afwijkende koppen
  const b = D.leesBladen([
    { naam: 'Objecten', regels: [['Object nr', 'Omschrijving'], ['O1', 'Europoortkering 2 sectie D1']] },
    { naam: 'Bouwdelen', regels: [['Object nr', 'Element nr', 'Omschrijving element', 'Bouwdeel nr', 'Omschrijving bouwdeel'],
      ['O1', 'E1', 'Bekleding', 'B1', 'Steen'], ['O1', 'E2', 'Kruin', 'B2', 'Gras']] },
  ]);
  assert.equal(b.indeling, 'tabblad-bouwdelen');
  assert.deepEqual(D.telling(b.knopen), { systeemdeel: 0, object: 1, element: 2, bouwdeel: 2 });
  assert.equal(b.knopen.find((k) => k.code === 'E1').naam, 'Bekleding');
  assert.equal(b.knopen.find((k) => k.code === 'O1').naam, 'Europoortkering 2 sectie D1');
  // Lijst-indeling blijft ongemoeid
  assert.equal(D.leesDecompositie(D.SJABLOON).knopen.length, 8);
});

test('koppelen op een gekozen kolom', () => {
  const kn = D.leesDecompositie(D.SJABLOON).knopen; // KW-001.1.1 heeft GIS-code KW-001-LH-N
  const lh = kn.find((k) => k.code === 'KW-001.1.1');
  const dek = kn.find((k) => k.naam === 'Brugdek');
  const objecten = [
    { id: 'a', code: 'X1', naam: 'Brugdek', kenmerken: { decomp_id: 'kw-001.1.1' }, laagId: 'L1' },
    { id: 'b', code: 'X2', naam: 'Iets', kenmerken: { decomp_id: 'KW-001.2.1' }, laagId: 'L1' },
    { id: 'c', code: 'X3', naam: 'Leuning', kenmerken: {}, laagId: 'L2' },
    { id: 'd', code: 'X4', naam: 'Onbekend', kenmerken: { decomp_id: 'ZZZ' }, laagId: 'L1', decomp: lh.id },
  ];
  // kenmerk vergelijken met de code
  let r = D.koppelOpKolom(kn, objecten, { kolom: 'kenmerk:decomp_id', veld: 'code' });
  assert.equal(r.wijzigingen.get('a'), lh.id);
  assert.equal(r.wijzigingen.get('b'), dek.id);
  assert.equal(r.zonderWaarde, 1);
  assert.deepEqual(r.zonderMatch.map((o) => o.id), ['d']);
  // naam vergelijken, alleen bouwdelen, alleen laag L1
  r = D.koppelOpKolom(kn, objecten, { kolom: 'naam', veld: 'naam', niveau: 'bouwdeel', laag: 'L1' });
  assert.deepEqual([...r.wijzigingen.keys()], ['a']);
  // bestaande koppeling niet overschrijven, wel als gevraagd
  const o2 = [{ id: 'e', code: 'KW-001-LH-N', decomp: dek.id }];
  r = D.koppelOpKolom(kn, o2, { kolom: 'code', veld: 'gis' });
  assert.equal(r.anders.length, 1);
  assert.equal(r.wijzigingen.size, 0);
  r = D.koppelOpKolom(kn, o2, { kolom: 'code', veld: 'gis', overschrijven: true });
  assert.equal(r.wijzigingen.get('e'), lh.id);
  // dubbele waarden worden niet gekoppeld
  r = D.koppelOpKolom(kn, [{ id: 'f', code: 'z', naam: 'Steenbekleding' }], { kolom: 'naam', veld: 'naam' });
  assert.equal(r.wijzigingen.size, 0);
});

test('alle kolommen worden per onderdeel bewaard en zijn te gebruiken bij koppelen', () => {
  // lijst
  const l = D.leesDecompositie([['Code', 'Naam', 'Niveau', 'Bovenliggende code', 'Beheerder', 'Vak ID'], ['O1', 'Brug', 'object', '', 'Gemeente', ''], ['B1', 'Dek', 'bouwdeel', 'E1', '', 'V-9'], ['E1', 'Boven', 'element', 'O1', '', '']]);
  assert.equal(l.knopen.find((k) => k.code === 'O1').kenmerken.Beheerder, 'Gemeente');
  assert.equal(l.knopen.find((k) => k.code === 'B1').kenmerken['Vak ID'], 'V-9');
  // kolommen: per niveau verdeeld, rest bij het bouwdeel
  const c = D.leesDecompositie([['Objectcode', 'Object GUID', 'Elementcode', 'Bouwdeelcode', 'Bouwdeel', 'Vak ID'], ['O1', 'g-1', 'E1', 'B1', 'Dek', 'V-1'], ['O1', 'g-1', 'E1', 'B2', 'Leuning', 'V-2']]);
  assert.deepEqual(c.knopen.find((k) => k.code === 'O1').kenmerken, { Objectcode: 'O1', 'Object GUID': 'g-1' });
  assert.equal(c.knopen.find((k) => k.code === 'B2').kenmerken['Vak ID'], 'V-2');
  assert.ok(!('Vak ID' in c.knopen.find((k) => k.code === 'E1').kenmerken));
  assert.deepEqual(D.decompKolommen(c.knopen, 'bouwdeel').map(([h]) => h).sort(), ['Bouwdeel', 'Bouwdeelcode', 'Vak ID']);
  // koppelen op een kolom uit de decompositie
  const r = D.koppelOpKolom(c.knopen, [{ id: 'x', code: 'GIS-1', kenmerken: { vak: 'v 2' } }], { kolom: 'kenmerk:vak', veld: 'kenmerk:Vak ID' });
  assert.equal(c.knopen.find((k) => k.id === r.wijzigingen.get('x')).code, 'B2');
  assert.equal(D.knoopWaarde(c.knopen.find((k) => k.code === 'B1'), 'kenmerk:Vak ID'), 'V-1');
  // tabbladen: kolommen uit Objecten komen bij het object
  const t = D.leesBladen([
    { naam: 'Objecten', regels: [['Objectcode', 'Naam', 'Beheerder'], ['O1', 'Brug', 'Gemeente']] },
    { naam: 'Bouwdelen', regels: [['Objectcode', 'Elementcode', 'Bouwdeelcode', 'Bouwdeel'], ['O1', 'E1', 'B1', 'Dek']] },
  ]);
  assert.equal(t.knopen.find((k) => k.code === 'O1').kenmerken.Beheerder, 'Gemeente');
});

test('systeemdeel: optionele groepering boven de objecten', () => {
  // lijst: object onder een systeemdeel én een object zonder systeemdeel
  const l = D.leesDecompositie([
    ['Code', 'Naam', 'Niveau', 'Bovenliggende code'],
    ['SD1', 'Kunstwerken', 'Systeemdeel', ''], ['O1', 'Brug', 'object', 'SD1'], ['E1', 'Dek', 'element', 'O1'], ['B1', 'Asfalt', 'bouwdeel', 'E1'],
    ['O2', 'Gemaal', 'object', ''], ['O3', 'Fout', 'object', 'E1'],
  ]);
  assert.deepEqual(D.telling(l.knopen), { systeemdeel: 1, object: 2, element: 1, bouwdeel: 1 });
  assert.equal(l.fouten.length, 1);
  const idx = D.index(l.knopen);
  const sd = l.knopen.find((k) => k.code === 'SD1');
  assert.equal(D.bouwdelenOnder(idx, sd.id).length, 1);
  assert.equal(D.padTekst(idx, l.knopen.find((k) => k.code === 'B1').id), 'SD1 Kunstwerken › O1 Brug › E1 Dek › B1 Asfalt');
  assert.equal(l.knopen.find((k) => k.code === 'O2').ouder, null);
  // kolommen: systeemdeel optioneel per regel
  const k = D.leesDecompositie([
    ['Systeemdeelcode', 'Systeemdeel', 'Objectcode', 'Object', 'Element', 'Bouwdeel'],
    ['SD-V', 'Verharding', 'W1', 'Weg 1', 'Rijbaan', 'Asfalt'],
    ['SD-V', 'Verharding', 'W2', 'Weg 2', 'Rijbaan', 'Klinkers'],
    ['', '', 'G1', 'Gemaal', 'Pomp', 'Motor'],
  ]);
  assert.deepEqual(k.fouten, []);
  assert.deepEqual(D.telling(k.knopen), { systeemdeel: 1, object: 3, element: 3, bouwdeel: 3 });
  assert.equal(k.knopen.filter((x) => x.niveau === 'object' && !x.ouder).length, 1);
  assert.match(D.herkendeKolommen(['Systeemdeelcode', 'Systeemdeel', 'Object']), /^systeemdeel: Systeemdeelcode \+ Systeemdeel/);
  assert.doesNotMatch(D.herkendeKolommen(['Object', 'Element']), /systeemdeel/);
  // tabbladen: Systeemdelen + Objecten met verwijzing
  const t = D.leesBladen([
    { naam: 'Systeemdelen', regels: [['Systeemdeelcode', 'Naam'], ['SD1', 'Waterkeringen']] },
    { naam: 'Objecten', regels: [['Objectcode', 'Naam', 'Systeemdeelcode'], ['O1', 'Dijk', 'SD1'], ['O2', 'Los', '']] },
    { naam: 'Elementen', regels: [['Elementcode', 'Naam', 'Objectcode'], ['E1', 'Bekleding', 'O1']] },
  ]);
  assert.deepEqual(t.fouten, []);
  assert.deepEqual(D.telling(t.knopen), { systeemdeel: 1, object: 2, element: 1, bouwdeel: 0 });
  assert.equal(t.knopen.find((x) => x.code === 'O1').ouder, t.knopen.find((x) => x.code === 'SD1').id);
  // tabblad Bouwdelen met de hele keten, namen uit Systeemdelen
  const b = D.leesBladen([
    { naam: 'Systeemdelen', regels: [['Systeemdeelcode', 'Naam'], ['SD1', 'Waterkeringen']] },
    { naam: 'Bouwdelen', regels: [['Systeemdeelcode', 'Objectcode', 'Elementcode', 'Bouwdeelcode', 'Bouwdeel'], ['SD1', 'O1', 'E1', 'B1', 'Steen']] },
  ]);
  assert.equal(b.indeling, 'tabblad-bouwdelen');
  assert.equal(b.knopen.find((x) => x.code === 'SD1').naam, 'Waterkeringen');
  // toevoegen: systeemdeel bovenaan, object eronder
  const v = D.voegKnoopToe([], null, { naam: 'Groen', code: 'SD-G' }, 's1', 'systeemdeel');
  assert.equal(v.knoop.niveau, 'systeemdeel');
  assert.equal(D.voegKnoopToe(v.knopen, 's1', { naam: 'Park', code: 'P1' }, 'o1').knoop.niveau, 'object');
  assert.equal(D.KIND_NIVEAU.systeemdeel, 'object');
});
