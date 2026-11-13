import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zichtbareVelden, controleer, toonWaarde, isLeeg, extraFotoIds, normaliseer } from '../js/velden.js';

const defs = [
  { id: 'm2', formulier: 'werk', label: 'Gemaaid', type: 'getal', eenheid: 'm²', min: 0, max: 5000, verplicht: true, alleenBij: ['Groenonderhoud'] },
  { id: 'afval', formulier: 'werk', label: 'Afvalsoort', type: 'keuze', opties: ['Groen', 'Rest'] },
  { id: 'vm', formulier: 'werk', label: 'Verkeersmaatregel', type: 'janee', verplicht: true },
  { id: 'chk', formulier: 'inspectie', label: 'Controle', type: 'checklist', opties: ['Leuning', 'Voeg'], verplicht: true },
  { id: 'foto', formulier: 'inspectie', label: 'Foto oplegging', type: 'foto' },
];

test('zichtbaarheid per formulier en soort', () => {
  assert.deepEqual(zichtbareVelden(defs, 'werk', 'Reparatie').map((d) => d.id), ['afval', 'vm']);
  assert.deepEqual(zichtbareVelden(defs, 'werk', 'Groenonderhoud').map((d) => d.id), ['m2', 'afval', 'vm']);
  assert.deepEqual(zichtbareVelden(defs, 'inspectie').map((d) => d.id), ['chk', 'foto']);
  assert.deepEqual(zichtbareVelden(undefined, 'werk'), []);
});

test('verplicht en grenzen', () => {
  const werk = zichtbareVelden(defs, 'werk', 'Groenonderhoud');
  assert.deepEqual(controleer(werk, {}), ['Gemaaid is verplicht', 'Verkeersmaatregel is verplicht']);
  assert.deepEqual(controleer(werk, { m2: '6000', vm: false }), ['Gemaaid mag maximaal 5000 zijn']);
  assert.deepEqual(controleer(werk, { m2: '-1', vm: true }), ['Gemaaid moet minimaal 0 zijn']);
  assert.deepEqual(controleer(werk, { m2: 0, vm: false }), [], 'nul en "nee" zijn geldige antwoorden');
  const insp = zichtbareVelden(defs, 'inspectie');
  assert.deepEqual(controleer(insp, { chk: ['Leuning'] }), ['Controle: vink alle punten af']);
  assert.deepEqual(controleer(insp, { chk: ['Voeg', 'Leuning'] }), []);
});

test('weergave van antwoorden', () => {
  assert.equal(toonWaarde(defs[0], 12.5), '12,5 m²');
  assert.equal(toonWaarde(defs[2], false), 'Nee');
  assert.equal(toonWaarde(defs[2], undefined), '–');
  assert.equal(toonWaarde(defs[3], ['Leuning']), '1 van 2 afgevinkt: Leuning');
  assert.equal(toonWaarde(defs[3], []), '–');
  assert.equal(toonWaarde({ type: 'datum' }, '2026-01-02', (d) => `dag ${d}`), 'dag 2026-01-02');
  assert.equal(toonWaarde({ type: 'tekst' }, '  '), '–');
});

test('hulpfuncties', () => {
  assert.equal(isLeeg({ type: 'tekst' }, ''), true);
  assert.equal(isLeeg({ type: 'getal' }, 0), false);
  assert.deepEqual(extraFotoIds(defs, { foto: ['a', 'b'], afval: 'Groen' }), ['a', 'b']);
  const n = normaliseer({ id: 'x', formulier: 'werk', label: ' Soort ', type: 'keuze', opties: ['A', ' A', '', 'B'], eenheid: 'm' });
  assert.deepEqual(n, { id: 'x', formulier: 'werk', label: 'Soort', type: 'keuze', verplicht: false, hulptekst: '', alleenBij: [], opties: ['A', 'B'] });
});

test('nieuwe veldtypen: meerkeuze, locatie, handtekening, tijdsduur, bijlage', async () => {
  const { duurMinuten } = await import('../js/velden.js');
  const mk = { id: 'mk', label: 'Aangetroffen', type: 'meerkeuze', opties: ['Zwerfvuil', 'Graffiti', 'Schade'] };
  assert.equal(isLeeg(mk, []), true);
  assert.equal(isLeeg(mk, ['Graffiti']), false, 'meerkeuze hoeft niet alles');
  assert.equal(toonWaarde(mk, ['Zwerfvuil', 'Schade']), 'Zwerfvuil, Schade');
  const loc = { id: 'loc', label: 'Plek', type: 'locatie' };
  assert.equal(isLeeg(loc, null), true);
  assert.equal(isLeeg(loc, { lat: 52.1, lng: 5.1 }), false);
  assert.match(toonWaarde(loc, { lat: 52.1, lng: 5.1, bron: 'gps', nauwkeurigheid: 4 }), /GPS ± 4 m/);
  const ht = { id: 'ht', label: 'Akkoord', type: 'handtekening', verplicht: true };
  assert.equal(isLeeg(ht, { naam: 'X' }), true);
  assert.deepEqual(controleer([ht], { ht: { foto: 'f1', naam: '' } }), ['Akkoord: vul de naam van de ondertekenaar in']);
  assert.match(toonWaarde(ht, { foto: 'f1', naam: 'J. Jansen', op: '2026-11-13T10:00:00Z' }), /door J. Jansen op 2026-11-13/);
  const td = { id: 'td', label: 'Werktijd', type: 'tijdsduur', verplicht: true };
  assert.equal(duurMinuten({ begin: '07:30', eind: '15:45', pauze: 30 }), 465);
  assert.equal(duurMinuten({ begin: '22:00', eind: '02:00' }), 240, 'over middernacht');
  assert.equal(toonWaarde(td, { begin: '07:30', eind: '15:45', pauze: 30, personen: 3 }), '07:30–15:45 · 7:45 u (pauze 30 min) · 3 personen = 23,3 manuur');
  assert.deepEqual(controleer([td], { td: { begin: '08:00' } }), ['Werktijd is verplicht']);
  assert.deepEqual(controleer([{ ...td, verplicht: false }], { td: { begin: '08:00' } }), ['Werktijd: vul zowel begin- als eindtijd in']);
  const bl = { id: 'bl', label: 'Stortbon', type: 'bijlage' };
  assert.equal(toonWaarde(bl, [{ id: 'b1', naam: 'bon.pdf' }]), 'bon.pdf');
  assert.deepEqual(extraFotoIds([ht, bl, { id: 'f', type: 'foto' }], { ht: { foto: 'h1' }, bl: [{ id: 'b1' }], f: ['f9'] }), ['h1', 'b1', 'f9']);
});

test('voorwaardelijke velden (alleen tonen als …)', () => {
  const d = [
    { id: 'afv', formulier: 'werk', label: 'Afgevoerd?', type: 'janee' },
    { id: 'hoev', formulier: 'werk', label: 'Hoeveelheid', type: 'getal', toonAls: { veld: 'afv', waarde: 'Ja' }, verplicht: true },
    { id: 'bon', formulier: 'werk', label: 'Stortbon', type: 'bijlage', toonAls: { veld: 'hoev', waarde: 'x' } },
    { id: 'aard', formulier: 'werk', label: 'Aangetroffen', type: 'meerkeuze', opties: ['Graffiti', 'Schade'] },
    { id: 'foto', formulier: 'werk', label: 'Foto graffiti', type: 'foto', toonAls: { veld: 'aard', waarde: 'Graffiti' } },
  ];
  const ids = (extra) => zichtbareVelden(d, 'werk', '', extra).map((x) => x.id);
  assert.deepEqual(ids({}), ['afv', 'aard']);
  assert.deepEqual(ids({ afv: true }), ['afv', 'hoev', 'aard'], 'Ja → hoeveelheid zichtbaar');
  assert.deepEqual(ids({ afv: false, aard: ['Graffiti'] }), ['afv', 'aard', 'foto']);
  assert.deepEqual(zichtbareVelden(d, 'werk').map((x) => x.id).length, 5, 'zonder antwoorden: alle velden (beheer)');
  assert.deepEqual(controleer(zichtbareVelden(d, 'werk', '', { afv: false }), { afv: false }), [], 'verborgen verplicht veld telt niet');
  assert.deepEqual(normaliseer({ id: 'x', label: 'X', type: 'tekst', toonAls: { veld: 'afv', waarde: 'Ja' } }).toonAls, { veld: 'afv', waarde: 'Ja' });
});
