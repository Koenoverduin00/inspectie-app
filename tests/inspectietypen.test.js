import test from 'node:test';
import assert from 'node:assert/strict';
import * as TY from '../js/inspectietypen.js';

const SOORTEN = ['Visuele inspectie', 'Conditiemeting NEN 2767', 'Schouw', 'Boomveiligheidscontrole', 'Inspectie waterkering (STOWA)'];
const PROT = ['Boomveiligheidscontrole', 'Inspectie waterkering (STOWA)'];

test('standaardtypen en eigen typen', () => {
  const p = { inspectietypen: [
    { id: 'std-schouw', naam: 'Schouw', methodiek: 'checklist', punten: ['A'] },
    { id: 'x1', naam: 'Bebording', methodiek: 'checklist', punten: ['Bord'] },
    { id: 'std-visuele-inspectie', naam: 'Visuele inspectie', verborgen: true },
  ] };
  const t = TY.typenVan(p, SOORTEN, PROT);
  assert.deepEqual(t.map((x) => x.naam), ['Conditiemeting NEN 2767', 'Schouw', 'Bebording']);
  assert.equal(TY.typeVoor(t, 'Schouw').methodiek, 'checklist');
  assert.equal(TY.typeVoor(t, 'Conditiemeting NEN 2767').methodiek, 'nen');
  assert.equal(TY.typenVan(p, SOORTEN, PROT, { ookVerborgen: true }).length, 4);
  assert.equal(TY.typenVan({}, SOORTEN, PROT).find((x) => x.naam === 'Visuele inspectie').methodiek, 'oordeel');
});

test('oordeel: slechtste of handmatig', () => {
  const type = TY.momentopname({ naam: 'V', methodiek: 'oordeel', schaal: TY.STANDAARD_SCHAAL, oordeelRegel: 'slechtste' });
  assert.equal(TY.oordeelVan({ type, gebreken: [] }).label, 'Goed');
  assert.equal(TY.oordeelVan({ type, gebreken: [{ oordeel: 2 }, { oordeel: 3 }] }).label, 'Slecht');
  const h = { ...type, oordeelRegel: 'handmatig' };
  assert.equal(TY.oordeelVan({ type: h, oordeelHandmatig: 2, gebreken: [{ oordeel: 3 }] }).label, 'Matig');
  assert.equal(TY.oordeelVan({ type: h, gebreken: [] }).waarde, null);
  assert.equal(TY.methodiekVan({ gebreken: [] }), 'nen');
  assert.equal(TY.oordeelVan({ gebreken: [] }), null);
});

test('checklist', () => {
  const i = { type: { methodiek: 'checklist' }, checklist: [{ status: 'ok' }, { status: 'nok' }, { status: 'nvt' }, { status: '' }] };
  assert.deepEqual(TY.checklistTelling(i), { totaal: 4, ok: 1, nok: 1, nvt: 1, open: 1, beoordeeld: 2 });
  assert.equal(TY.oordeelVan(i).label, '1 niet in orde');
  assert.equal(TY.oordeelVan({ type: { methodiek: 'checklist' }, checklist: [{ status: 'ok' }] }).label, 'Alles in orde');
});

test('controleren', () => {
  assert.ok(TY.controleer({ naam: '', methodiek: 'oordeel', schaal: TY.STANDAARD_SCHAAL }).fouten.length);
  assert.ok(TY.controleer({ naam: 'X', methodiek: 'oordeel', schaal: [{ label: 'Goed' }] }).fouten.length);
  assert.ok(TY.controleer({ naam: 'X', methodiek: 'checklist', punten: [' ', ''] }).fouten.length);
  assert.ok(TY.controleer({ naam: 'Schouw', methodiek: 'nen' }, { andereNamen: ['schouw'] }).fouten.length);
  const r = TY.controleer({ naam: ' Bebording ', methodiek: 'oordeel', schaal: [{ label: 'Ok', kleur: '#1a7f37' }, { label: 'Fout', kleur: 'paars' }], onderdelen: ['Bord', 'Bord', ' Paal '] });
  assert.deepEqual(r.fouten, []);
  assert.equal(r.type.naam, 'Bebording');
  assert.deepEqual(r.type.schaal.map((x) => [x.waarde, x.kleur]), [[1, '#1a7f37'], [2, '#5b6875']]);
  assert.deepEqual(r.type.onderdelen, ['Bord', 'Paal']);
});

test('in project zetten met velden en bron', () => {
  let n = 0;
  const nieuwId = () => `id${++n}`;
  const p = { inspectietypen: [{ id: 'a', naam: 'Bebording', methodiek: 'oordeel' }], velden: [
    { id: 'v1', formulier: 'inspectie', label: 'Oud', alleenBij: ['Bebording'] },
    { id: 'v2', formulier: 'inspectie', label: 'Algemeen', alleenBij: [] },
  ] };
  const r = TY.zetInProject(p, { id: 'b', naam: 'Bebording', methodiek: 'checklist', punten: ['Bord'] },
    { velden: [{ id: 'x', label: 'Nieuw veld' }], bron: { bibId: 'bib1', versie: 3 }, nieuwId });
  assert.equal(r.vervangen, true);
  assert.equal(r.type.id, 'a');
  assert.deepEqual(r.type.bron, { bibId: 'bib1', versie: 3, aangepast: false });
  assert.deepEqual(r.velden.map((d) => d.label), ['Algemeen', 'Nieuw veld']);
  assert.deepEqual(r.velden[1].alleenBij, ['Bebording']);
  const r2 = TY.zetInProject({}, { id: 'std-schouw', naam: 'Schouw', methodiek: 'oordeel', standaard: true }, { nieuwId });
  assert.equal(r2.type.id, 'std-schouw');
  assert.equal(r2.type.standaard, undefined);
  assert.equal(TY.nieuwereVersie(r.type, [{ id: 'bib1', versie: 4 }]).versie, 4);
  assert.equal(TY.nieuwereVersie(r.type, [{ id: 'bib1', versie: 3 }]), null);
  assert.equal(TY.veldenVoorBibliotheek(p.velden, 'Bebording').length, 1);
});
