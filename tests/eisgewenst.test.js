import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as EI from '../js/eisen.js';

const eis = (type, gewenst, opties = []) => ({ nummer: 'E1', vraag: 'v', tekst: 't', type, gewenst, opties });

test('gewenst antwoord per type: norm, tekst en beoordeling', () => {
  // ja/nee: standaard Ja; "Nee" draait om
  assert.equal(EI.beoordeel(eis('janee', ''), { type: 'janee' }, true), 'ja');
  assert.equal(EI.beoordeel(eis('janee', ''), { type: 'janee' }, false), 'nee');
  assert.equal(EI.beoordeel(eis('janee', 'Nee'), { type: 'janee' }, false), 'ja');
  assert.equal(EI.beoordeel(eis('janee', 'Nee'), { type: 'janee' }, true), 'nee');
  assert.equal(EI.gewenstTekst(eis('janee', 'nee')), 'Nee');
  // keuze: één van; meerkeuze: bevat alle
  const k = eis('keuze', 'A+;A;B', ['A+', 'A', 'B', 'C', 'D']);
  assert.equal(EI.beoordeel(k, { type: 'keuze' }, 'B'), 'ja');
  assert.equal(EI.beoordeel(k, { type: 'keuze' }, 'C'), 'nee');
  assert.equal(EI.gewenstTekst(k), 'A+, A of B');
  const m = eis('meerkeuze', 'Hekken; Borden', ['Hekken', 'Borden', 'Lampen']);
  assert.equal(EI.beoordeel(m, { type: 'meerkeuze' }, ['Hekken', 'Borden', 'Lampen']), 'ja');
  assert.equal(EI.beoordeel(m, { type: 'meerkeuze' }, ['Hekken']), 'nee');
  // getal: bereiken
  const g = (x) => eis('getal', x);
  assert.equal(EI.beoordeel(g('<= 10'), { type: 'getal' }, '10'), 'ja');
  assert.equal(EI.beoordeel(g('<= 10'), { type: 'getal' }, '10,5'), 'nee');
  assert.equal(EI.beoordeel(g('< 10'), { type: 'getal' }, 10), 'nee');
  assert.equal(EI.beoordeel(g('≥ 2'), { type: 'getal' }, 2), 'ja');
  assert.equal(EI.beoordeel(g('5 - 10'), { type: 'getal' }, 7), 'ja');
  assert.equal(EI.beoordeel(g('5 tot 10'), { type: 'getal' }, 11), 'nee');
  assert.equal(EI.beoordeel(g('max 3'), { type: 'getal' }, 4), 'nee');
  assert.equal(EI.beoordeel(g('4'), { type: 'getal' }, '4'), 'ja');
  assert.equal(EI.gewenstTekst(g('5 - 10')), '5 t/m 10');
  assert.equal(EI.gewenstTekst(g('<= 2,5')), '≤ 2,5');
  assert.equal(EI.beoordeel(g(''), { type: 'getal' }, 4), 'overig');
  // checklist: alles afgevinkt
  assert.equal(EI.beoordeel(eis('checklist', ''), { type: 'checklist', opties: ['a', 'b'] }, ['a', 'b']), 'ja');
  assert.equal(EI.beoordeel(eis('checklist', ''), { type: 'checklist', opties: ['a', 'b'] }, ['a']), 'nee');
  // foto/tekst zonder norm
  assert.equal(EI.beoordeel(eis('foto', ''), { type: 'foto' }, ['f1']), 'overig');
  assert.equal(EI.gewenstTekst(eis('foto', '')), 'Ingevuld (geen norm)');
  assert.equal(EI.beoordeel(eis('tekst', 'akkoord'), { type: 'tekst' }, 'Akkoord'), 'ja');
});

test('controle van het gewenste antwoord bij het inlezen', () => {
  assert.equal(EI.controleerGewenst(eis('janee', 'Misschien')), '"Misschien" is geen Ja of Nee.');
  assert.match(EI.controleerGewenst(eis('getal', 'veel')), /geen getal of bereik/);
  assert.match(EI.controleerGewenst(eis('keuze', 'A;Z', ['A', 'B'])), /"Z" staat niet bij de keuzes/);
  assert.equal(EI.controleerGewenst(eis('keuze', 'a', ['A'])), '');
  const r = EI.leesEisen([['Eisnummer', 'Eistekst', 'Eisvraag', 'Antwoordtype', 'Keuzes', 'Gewenst antwoord'],
    ['E1', 't', 'v', 'Ja/nee', '', 'Nee'], ['E2', 't', 'v', 'Getal', '', 'veel'], ['E3', 't', 'v', 'Keuze', 'A;B', 'A']]);
  assert.deepEqual(r.eisen.map((e) => e.gewenst), ['Nee', undefined, 'A']);
  assert.match(r.fouten[0], /E2: "veel" is geen getal/);
  assert.equal(r.kolommen.gewenst, 'Gewenst antwoord');
  assert.ok(EI.leesEisen(EI.SJABLOON).fouten.length === 0);
});

test('verificatie en dossier gebruiken het gewenste antwoord; selectie op werkpakket en ronde', () => {
  const eisen = [eis('janee', 'Nee'), { ...eis('getal', '<= 10'), nummer: 'E2' }];
  const defs = [{ id: 'a', formulier: 'inspectie', type: 'janee', eis: { nummer: 'E1' } }, { id: 'b', formulier: 'inspectie', type: 'getal', eis: { nummer: 'E2' } }];
  const regs = [
    { id: 'r1', datum: '2026-03-01', werkpakketId: 'P1', rondeId: 'R1', extra: { a: false, b: '8' } },
    { id: 'r2', datum: '2026-04-01', werkpakketId: 'P1', rondeId: 'R2', extra: { a: true, b: '12' } },
    { id: 'r3', datum: '2026-05-01', werkpakketId: 'P2', rondeId: '', extra: { a: false } },
  ];
  const v = EI.verificatie(eisen, defs, regs);
  assert.deepEqual(v.map((x) => [x.ja, x.nee, x.status]), [[2, 1, 'afwijking'], [1, 1, 'afwijking']]);
  const r1 = EI.selectie(regs, { pakketten: ['P1'], ronde: 'R1' });
  assert.deepEqual(r1.map((r) => r.id), ['r1']);
  assert.deepEqual(EI.selectie(regs, { pakketten: ['P2'], ronde: 'std', standaardRonde: 'std' }).map((r) => r.id), ['r3']);
  assert.deepEqual(EI.selectie(regs, { van: '2026-04-01' }).map((r) => r.id), ['r2', 'r3']);
  const d = EI.dossier({ eisen, defs, registraties: r1 });
  assert.equal(d.tel.geverifieerd, 2);
  assert.equal(d.afwijkingen.length, 0);
});
