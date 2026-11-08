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
