import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as FI from '../js/formulierimport.js';
import * as V from '../js/velden.js';

const eisen = [
  { nummer: 'E-3.2.1', tekst: 'De vlakheid is maximaal 5 mm onder de rij van 3 m.', vraag: 'Vlakheid binnen 5 mm?', type: 'janee', opties: [], bron: 'Bestek hfst. 3' },
  { nummer: 'E-9', tekst: 'Kleur volgens RAL', vraag: 'Welke kleur?', type: 'keuze', opties: ['RAL 6009', 'RAL 7016'], bron: '' },
];
const bladen = () => [{ naam: 'Formulieren', regels: FI.SJABLOON.formulieren }, { naam: 'Vragen', regels: FI.SJABLOON.vragen }, { naam: 'Uitleg', regels: FI.SJABLOON.uitleg }];

test('sjabloon leest zonder fouten in: drie formulieren met hun vragen', () => {
  const r = FI.leesFormulieren(bladen(), { eisen, bestaand: ['Schouw bebording'] });
  assert.deepEqual(r.fouten, []);
  assert.deepEqual(r.bladen, { vragen: 'Vragen', formulieren: 'Formulieren' });
  assert.deepEqual(r.formulieren.map((f) => [f.naam, f.type.methodiek, f.bestaat, f.fouten.length]), [
    ['Schouw bebording', 'oordeel', true, 0], ['Controle afzetting', 'checklist', false, 0], ['Oplevering verharding', 'oordeel', false, 0]]);
  const [schouw, afzetting, oplevering] = r.formulieren;
  assert.deepEqual(schouw.type.schaal.map((x) => [x.label, x.kleur]), [['Goed', '#1a7f37'], ['Matig', '#d99a00'], ['Slecht', '#d1452f']]);
  assert.deepEqual(schouw.type.onderdelen, ['Bord', 'Paal', 'Fundering']);
  assert.equal(schouw.velden[0].standaard, 'Droog');
  assert.deepEqual(schouw.velden.map((d) => d.niveau ?? 'inspectie'), ['inspectie', 'bevinding', 'bevinding']);
  assert.deepEqual(afzetting.type.punten, ['Hekken staan aaneengesloten', 'Verlichting werkt', 'Omleidingsborden geplaatst']);
  assert.equal(afzetting.type.overzichtsfotos, true);
  assert.equal(afzetting.aantallen.vragen, 1);
  // Eisvraag gekoppeld met de eistekst uit de bibliotheek; voorwaarde naar de eisvraag; kop telt niet als vraag
  const eisveld = oplevering.velden.find((d) => d.eis);
  assert.deepEqual(eisveld.eis, { nummer: 'E-3.2.1', tekst: eisen[0].tekst, bron: 'Bestek hfst. 3' });
  assert.equal(eisveld.verplicht, true);
  const afwijking = oplevering.velden.find((d) => d.label === 'Grootste afwijking');
  assert.deepEqual(afwijking.toonAls, { veld: eisveld.id, waarde: 'Nee' });
  assert.deepEqual([afwijking.eenheid, afwijking.min, afwijking.max], ['mm', '0', '50']);
  assert.equal(oplevering.velden[0].type, 'kop');
  assert.equal(oplevering.aantallen.vragen, 3);
  assert.equal(oplevering.aantallen.eisvragen, 1);
  assert.equal(oplevering.velden.at(-1).standaard, 'vandaag');
});

test('alleen een vragenblad; lege formuliercel = formulier van de regel erboven; eisvraag uit de bibliotheek', () => {
  const r = FI.leesFormulieren([{ naam: 'Blad1', regels: [
    ['Formulier', 'Vraag', 'Antwoordtype', 'Keuzes', 'Eisnummer', 'Waar'],
    ['Kleurcontrole', '', '', '', 'e-9', ''],
    ['', 'Opmerking', 'tekst', '', '', 'per bevinding'],
    ['Kleurcontrole', 'Foto per bevinding', 'Foto', '', '', 'Per bevinding'],
  ] }], { eisen });
  const [f] = r.formulieren;
  assert.equal(f.naam, 'Kleurcontrole');
  assert.deepEqual(f.velden.map((d) => [d.label, d.type, d.niveau ?? 'inspectie']), [
    ['Welke kleur?', 'keuze', 'inspectie'], ['Opmerking', 'tekst', 'bevinding'], ['Foto per bevinding', 'foto', 'inspectie']]);
  assert.deepEqual(f.velden[0].opties, ['RAL 6009', 'RAL 7016']);
  assert.match(f.waarschuwingen[0], /kan niet per bevinding/);
});

test('fouten en waarschuwingen per regel', () => {
  const r = FI.leesFormulieren([
    { naam: 'Vragen', regels: [
      ['Formulier', 'Vraag', 'Antwoordtype', 'Keuzes', 'Waar', 'Eisnummer', 'Min', 'Max', 'Alleen tonen als', 'Standaardwaarde'],
      ['A', 'Soort', 'Keuze', '', '', '', '', '', '', ''],
      ['A', 'Raar', 'Vliegtuig', '', '', '', '', '', '', ''],
      ['A', 'Diepte', 'getal', '', '', '', '10', '2', '', ''],
      ['A', 'Zomaar', 'tekst', '', 'ergens', '', '', '', '', ''],
      ['A', 'Onbekende eis', '', '', '', 'X-1', '', '', '', ''],
      ['A', 'Afhankelijk', 'tekst', '', '', '', '', '', 'Bestaat niet = Ja', 'abc'],
      ['A', 'Datum', 'datum', '', '', '', '', '', '', 'morgen'],
      ['', '', '', '', '', '', '', '', '', ''],
    ] },
    { naam: 'Formulieren', regels: [['Formulier', 'Methodiek', 'Op basis van', 'Schaal'], ['A', 'Raar', 'Bestaat niet', 'Alleen'], ['Boomveiligheidscontrole', 'Oordeel', '', '']] },
  ], { verboden: ['Boomveiligheidscontrole'] });
  const a = r.formulieren.find((f) => f.naam === 'A');
  assert.equal(a.fouten.length, 7, a.fouten.join('\n'));
  assert.ok(a.fouten.some((x) => /keuzes nodig/.test(x)));
  assert.ok(a.fouten.some((x) => /Vliegtuig/.test(x)));
  assert.ok(a.fouten.some((x) => /minimum is groter/.test(x)));
  assert.ok(a.fouten.some((x) => /"Waar" = "ergens"/.test(x)));
  assert.ok(a.fouten.some((x) => /Methodiek "Raar"/.test(x)));
  assert.ok(a.fouten.some((x) => /Bestaat niet/.test(x)));
  assert.ok(a.fouten.some((x) => /schaal heeft minstens 2/.test(x)));
  assert.ok(a.waarschuwingen.some((x) => /X-1 staat niet in de eisbibliotheek/.test(x)));
  assert.ok(a.waarschuwingen.some((x) => /voorwaarde "Bestaat niet = Ja" niet gevonden/.test(x)));
  assert.ok(a.waarschuwingen.some((x) => /"morgen" past niet/.test(x)));
  assert.match(r.formulieren.find((f) => f.naam === 'Boomveiligheidscontrole').fouten[0], /vast protocol/);
  assert.match(FI.leesFormulieren([{ naam: 'x', regels: [['a', 'b']] }]).fouten[0], /Geen kolommen herkend/);
});

test('op basis van een bestaand formulier: kopie met nieuwe ids en kloppende voorwaarden, plus extra vragen', () => {
  const basis = {
    type: { id: 'x', naam: 'Basis', methodiek: 'oordeel', schaal: [{ label: 'Goed', kleur: '#1a7f37' }, { label: 'Slecht', kleur: '#d1452f' }], bron: { bibId: 'b1', versie: 3 }, standaard: true },
    velden: [{ id: 'v1', formulier: 'inspectie', label: 'Afgevoerd?', type: 'janee', alleenBij: ['Basis'] },
      { id: 'v2', formulier: 'inspectie', label: 'Hoeveel', type: 'getal', alleenBij: ['Basis'], toonAls: { veld: 'v1', waarde: 'Ja' } }],
  };
  let n = 0;
  const r = FI.leesFormulieren([
    { naam: 'Formulieren', regels: [['Formulier', 'Op basis van'], ['Nieuw', 'basis']] },
    { naam: 'Vragen', regels: [['Formulier', 'Vraag', 'Antwoordtype'], ['Nieuw', 'Extra', 'tekst'], ['Nieuw', 'Afgevoerd?', 'janee']] },
  ], { basisVan: (naam) => (naam.toLowerCase() === 'basis' ? basis : null), nieuwId: () => `id${(n += 1)}` });
  const [f] = r.formulieren;
  assert.deepEqual(f.fouten, []);
  assert.equal(f.basis, 'basis');
  assert.equal(f.type.naam, 'Nieuw');
  assert.equal(f.type.bron, undefined);
  assert.deepEqual(f.velden.map((d) => [d.id, d.label]), [['id1', 'Afgevoerd?'], ['id2', 'Hoeveel'], ['id3', 'Extra'], ['id4', 'Afgevoerd?']]);
  assert.deepEqual(f.velden[1].toonAls, { veld: 'id1', waarde: 'Ja' });
  assert.ok(f.waarschuwingen.some((x) => /staat al in dit formulier/.test(x)));
});

test('kopie, kopieNaam en vragenOvernemen', () => {
  const k = FI.kopie({ id: 'std-schouw', naam: 'Schouw', standaard: true, verborgen: false, bron: { bibId: 'b' }, methodiek: 'checklist', punten: ['a'] },
    [{ id: 'a', label: 'A', alleenBij: ['Schouw'], type: 'janee' }, { id: 'b', label: 'B', alleenBij: ['Schouw'], toonAls: { veld: 'a', waarde: 'Ja' } }, { id: 'c', label: 'C', toonAls: { veld: 'weg', waarde: 'x' } }], 'Schouw 2');
  assert.deepEqual(k.type, { naam: 'Schouw 2', methodiek: 'checklist', punten: ['a'] });
  assert.equal(k.velden[0].alleenBij, undefined);
  assert.deepEqual(k.velden[1].toonAls, { veld: 'a', waarde: 'Ja' });
  assert.equal(k.velden[2].toonAls, null);
  assert.equal(FI.kopieNaam('Schouw', ['Schouw', 'Schouw (kopie)']), 'Schouw (kopie 2)');
  let n = 0;
  const o = FI.vragenOvernemen(k.velden.slice(0, 2), () => `n${(n += 1)}`, { alleenBij: ['Doel'] });
  assert.deepEqual(o.map((d) => [d.id, d.alleenBij[0], d.toonAls?.veld ?? null]), [['n1', 'Doel', null], ['n2', 'Doel', 'n1']]);
});

test('velden: kop en standaardwaarde', () => {
  assert.equal(V.isInvoer({ type: 'kop' }), false);
  assert.deepEqual(V.controleer([{ id: 'k', type: 'kop', label: 'Kop', verplicht: true }], {}), []);
  const nu = new Date(2026, 10, 23, 9, 5);
  assert.equal(V.standaardWaarde({ type: 'datum', standaard: 'vandaag' }, nu), '2026-11-23');
  assert.equal(V.standaardWaarde({ type: 'tijd', standaard: 'nu' }, nu), '09:05');
  assert.equal(V.standaardWaarde({ type: 'janee', standaard: 'nee' }), false);
  assert.equal(V.standaardWaarde({ type: 'getal', standaard: '2,5' }), '2.5');
  assert.equal(V.standaardWaarde({ type: 'keuze', standaard: 'x', opties: ['A'] }), undefined);
  assert.equal(V.normaliseer({ id: 1, type: 'foto', standaard: 'x' }).standaard, undefined);
  assert.equal(V.normaliseer({ id: 1, type: 'tekst', standaard: ' hoi ' }).standaard, 'hoi');
  assert.ok(!V.BEVINDING_TYPEN.includes('kop'));
});

test('exporteren en weer inlezen geeft dezelfde formulieren', () => {
  const eerst = FI.leesFormulieren([{ naam: 'Formulieren', regels: FI.SJABLOON.formulieren }, { naam: 'Vragen', regels: FI.SJABLOON.vragen }], { eisen });
  const r = FI.naarRegels(eerst.formulieren);
  const weer = FI.leesFormulieren([{ naam: 'Formulieren', regels: r.formulieren }, { naam: 'Vragen', regels: r.vragen }], { eisen });
  const kern = (x) => x.formulieren.map((f) => ({ naam: f.naam, methodiek: f.type.methodiek, schaal: f.type.schaal.map((s) => s.label), punten: f.type.punten,
    onderdelen: f.type.onderdelen, foto: f.type.overzichtsfotos,
    velden: f.velden.map((d) => [d.label, d.type, d.verplicht, d.niveau ?? '', d.eis?.nummer ?? '', d.standaard ?? '', d.toonAls ? f.velden.find((b) => b.id === d.toonAls.veld).label : '']) }));
  assert.deepEqual(kern(weer), kern(eerst));
  assert.deepEqual(weer.formulieren.flatMap((f) => f.fouten), []);
});
