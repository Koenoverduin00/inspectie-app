import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/eisen.js';

test('eisen inlezen: kolommen herkennen, typen, keuzes, fouten', () => {
  const r = E.leesEisen([
    ['', ''],
    ['Eis nr.', 'Eis omschrijving', 'Eisvraag', 'Antwoord type', 'Opties', 'Document'],
    ['EIS-1', 'Gras max 10 cm', 'Is het gras lager dan 10 cm?', 'J/N', '', 'Bestek'],
    ['EIS-2', 'Beeldkwaliteit', 'Welke beeldkwaliteit?', 'Keuzelijst', 'A;B;C', ''],
    ['EIS-3', 'Meting', 'Gemeten hoogte (cm)', 'Getal', '', ''],
    ['EIS-1', 'dubbel', 'x', '', '', ''],
    ['EIS-4', 'zonder vraag', '', '', '', ''],
    ['EIS-5', 'raar type', 'Vraag?', 'Smiley', '', ''],
  ]);
  assert.deepEqual(r.eisen.map((e) => [e.nummer, e.type, e.opties.join('|'), e.bron]), [['EIS-1', 'janee', '', 'Bestek'], ['EIS-2', 'keuze', 'A|B|C', ''], ['EIS-3', 'getal', '', ''], ['EIS-5', 'janee', '', '']]);
  assert.equal(r.fouten.length, 3);
  assert.deepEqual(r.kolommen, { nummer: 'Eis nr.', tekst: 'Eis omschrijving', vraag: 'Eisvraag', type: 'Antwoord type', opties: 'Opties', bron: 'Document' });
  assert.match(E.leesEisen([['Code', 'Naam']]).fouten.join(' '), /Eistekst/);
  assert.equal(E.leesEisen(E.SJABLOON).eisen.length, 6);
});

test('eisen bijwerken, naar formulierveld en verificatie', () => {
  const oud = E.leesEisen(E.SJABLOON).eisen;
  const nieuw = oud.map((e) => (e.nummer === 'EIS-3.2.4' ? { ...e, vraag: 'Is het maaisel binnen 2 werkdagen afgevoerd?' } : e)).filter((e) => e.nummer !== 'EIS-5.3.1');
  nieuw.push({ nummer: 'EIS-9', tekst: 't', vraag: 'v', type: 'janee', opties: [], bron: '' });
  const v = E.vergelijk(oud, nieuw);
  assert.deepEqual([v.toegevoegd.length, v.gewijzigd.map((g) => `${g.eis.nummer}:${g.velden}`), v.vervallen.map((e) => e.nummer), v.ongewijzigd], [1, ['EIS-3.2.4:vraag'], ['EIS-5.3.1'], 4]);
  const veld = E.naarVeld(oud[1], 'werk', 'v1');
  assert.deepEqual([veld.label, veld.type, veld.verplicht, veld.eis.nummer], ['Is het maaisel afgevoerd?', 'janee', true, 'EIS-3.2.4']);
  assert.deepEqual(E.naarVeld(oud[2], 'inspectie', 'v2').opties, ['A+', 'A', 'B', 'C', 'D']);
  const defs = [veld, E.naarVeld(oud[4 - 1], 'werk', 'v3')];
  const bij = E.werkVeldenBij(defs, nieuw);
  assert.equal(bij.aantal, 2);
  assert.equal(bij.defs[0].label, 'Is het maaisel binnen 2 werkdagen afgevoerd?');
  assert.equal(bij.defs[1].eis.vervallen, true);
  const regs = [{ datum: '2026-05-01', extra: { v1: true } }, { datum: '2026-06-01', extra: { v1: false } }, { datum: '2026-04-01', extra: {} }];
  const ver = E.verificatie(nieuw, [veld], regs);
  const r324 = ver.find((x) => x.eis.nummer === 'EIS-3.2.4');
  assert.deepEqual([r324.antwoorden, r324.ja, r324.nee, r324.laatste, r324.status], [2, 1, 1, '2026-06-01', 'afwijking']);
  assert.equal(ver.find((x) => x.eis.nummer === 'EIS-3.2.1').status, 'niet in formulier');
  assert.equal(E.sleutel(' eis-3.2.1 '), E.sleutel('EIS 3 2 1'));
});
