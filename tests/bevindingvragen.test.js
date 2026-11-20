import test from 'node:test';
import assert from 'node:assert/strict';
import * as velden from '../js/velden.js';
import * as TY from '../js/inspectietypen.js';
import * as UX from '../js/uitkomstenexcel.js';

test('vraag per bevinding: alleen bij inspectieformulier en passende typen', () => {
  const geom = velden.normaliseer({ id: 'a', formulier: 'inspectie', label: 'Lijn', type: 'geometrie', niveau: 'bevinding' });
  assert.equal(geom.niveau, 'bevinding');
  assert.equal(velden.isBevindingVeld(geom), true);
  assert.equal(velden.normaliseer({ id: 'b', formulier: 'werk', label: 'x', type: 'tekst', niveau: 'bevinding' }).niveau, undefined);
  assert.equal(velden.normaliseer({ id: 'c', formulier: 'inspectie', label: 'x', type: 'foto', niveau: 'bevinding' }).niveau, undefined);
  assert.equal(velden.normaliseer({ id: 'd', formulier: 'inspectie', label: 'x', type: 'janee', niveau: 'bevinding', eis: { nummer: 'E1' } }).niveau, undefined);
  const defs = [geom, velden.normaliseer({ id: 'e', formulier: 'inspectie', label: 'Weer', type: 'tekst' })];
  assert.deepEqual(velden.opNiveau(defs, 'bevinding').map((d) => d.id), ['a']);
  assert.deepEqual(velden.opNiveau(defs, 'inspectie').map((d) => d.id), ['e']);
  assert.ok(!velden.BEVINDING_TYPEN.includes('handtekening') && velden.BEVINDING_TYPEN.includes('geometrie'));
});

test('type in project zetten: voorwaarden wijzen naar de nieuwe ids', () => {
  let n = 0;
  const nieuwId = () => `n${++n}`;
  const r = TY.zetInProject({}, { naam: 'Oevers', methodiek: 'oordeel' }, {
    nieuwId,
    velden: [{ id: 'x', label: 'Schade?', type: 'janee', niveau: 'bevinding' }, { id: 'y', label: 'Vlak', type: 'geometrie', niveau: 'bevinding', toonAls: { veld: 'x', waarde: 'Ja' } }],
  });
  const [a, b] = r.velden;
  assert.equal(b.toonAls.veld, a.id);
  assert.equal(b.niveau, 'bevinding');
  assert.deepEqual(b.alleenBij, ['Oevers']);
});

test('uitkomsten: antwoorden per bevinding in de bevindingenlijst', () => {
  const r = UX.uitkomstRijen({
    registraties: [{ soort: 'inspectie', object: { code: 'O1', naam: 'Oever' }, pakket: { naam: 'P' }, ronde: { naam: 'R1' },
      r: { id: 'i1', datum: '2026-11-20', status: 'afgerond', type: { methodiek: 'oordeel', schaal: [{ label: 'Goed', kleur: '#1a7f37' }, { label: 'Slecht', kleur: '#d1452f' }] },
        gebreken: [{ id: 'g1', bouwdeel: 'Talud', gebrek: 'Afkalving', oordeel: 2, extra: { v: 1 } }] } }],
    bevindingExtra: (rec, g) => (g.extra ? { tekst: 'Lijn: 12 m', wkt: 'LINESTRING (5 52, 5.1 52)' } : null),
  });
  const kol = UX.bevindingKolommen();
  const w = r.bevindingen[0].waarden;
  assert.equal(w.length, kol.length);
  assert.equal(w[kol.findIndex(([k]) => k === 'Vragen per bevinding')], 'Lijn: 12 m');
  assert.equal(w[kol.findIndex(([k]) => k.startsWith('Geometrie bevinding'))], 'LINESTRING (5 52, 5.1 52)');
});
