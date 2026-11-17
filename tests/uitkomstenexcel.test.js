import test from 'node:test';
import assert from 'node:assert/strict';
import { uitkomstRijen, bevindingenVan } from '../js/uitkomstenexcel.js';

const pakket = { code: 'WP-1', naam: 'Schouw' };
const ronde = { naam: 'Ronde 1', soort: 'inspectie', inspectiesoort: 'Bebording' };
const obj = (code) => ({ code, naam: `Object ${code}`, type: 'Bord', lat: 52.1, lng: 5.1 });

test('registraties, antwoorden, bevindingen en vervolg', () => {
  const regs = [
    { soort: 'werk', pakket, ronde: { naam: 'R1' }, object: obj('A'), r: { datum: '2026-11-01', soort: 'Maaien', uitvoerder: 'Jan', status: 'vervolg', vervolg: 'Nog afvoeren', uren: 2, extra: { x: 1 } } },
    { soort: 'inspectie', pakket, ronde, object: obj('B'), r: { datum: '2026-11-02', inspecteur: 'Piet', status: 'afgerond', soort: 'Bebording',
      type: { methodiek: 'checklist', naam: 'Bebording' }, checklist: [{ punt: 'Reflectie', status: 'nok' }, { punt: 'Paal', status: 'ok' }],
      gebreken: [{ checkpunt: 'Reflectie', bouwdeel: 'Reflectie', maatregel: 'Bord vervangen', urgentie: '3maanden', maatregelStatus: 'open', lat: 52.2, lng: 5.2 }] } },
    { soort: 'overgeslagen', pakket, ronde, object: obj('C'), r: { op: '2026-11-03', door: 'Jan', reden: 'Niet bereikbaar' } },
  ];
  const r = uitkomstRijen({ registraties: regs, extra: (rec) => (rec.extra ? [['Afvoer', 'Ja']] : []), beoordeling: () => 'ingediend' });
  const kop = r.kolommen.map(([k]) => k);
  assert.ok(kop.includes('Afvoer'));
  assert.ok(kop.includes('Checklist: Reflectie'));
  assert.equal(r.rijen.length, 3);
  const insp = r.rijen[1].waarden;
  assert.equal(insp[kop.indexOf('Checklist: Reflectie')], 'Niet in orde');
  assert.equal(insp[kop.indexOf('Checklist: Paal')], 'In orde');
  assert.equal(insp[kop.indexOf('Oordeel')].startsWith('1 niet in orde'), true);
  assert.equal(r.rijen[0].waarden[kop.indexOf('Afvoer')], 'Ja');
  assert.equal(r.rijen[0].waarden[kop.indexOf('Uren')], 2);
  assert.ok(r.antwoorden.some((a) => a.waarden[8] === 'Reflectie' && a.waarden[9] === 'Niet in orde'));
  assert.ok(r.antwoorden.some((a) => a.waarden[8] === 'Afvoer' && a.waarden[9] === 'Ja'));
  assert.equal(r.bevindingen.length, 1);
  assert.equal(r.bevindingen[0].waarden.at(-2), 52.2);
  assert.deepEqual(r.vervolg.map((v) => v.waarden[3]), ['Bevinding uit inspectie', 'Vervolg op werkzaamheid', 'Overgeslagen – opnieuw inplannen']);
  const voor = r.vervolg[0].waarden[8];
  assert.equal(voor.toISOString().slice(0, 10), '2027-02-01');
  assert.deepEqual(r.telling, { werk: 1, inspecties: 1, overgeslagen: 1, bevindingen: 1, vervolg: 3 });
});

test('zonder uren geen urenkolom', () => {
  const r = uitkomstRijen({ registraties: [], metUren: false });
  assert.ok(!r.kolommen.some(([k]) => k === 'Uren'));
});

test('bevindingen NEN en oordeel', () => {
  const nen = bevindingenVan({ gebreken: [{ bouwdeel: 'Dek', gebrek: 'Scheur', conditieHandmatig: 4, maatregel: 'X' }] });
  assert.match(nen[0].oordeel, /^4 · /);
  assert.equal(nen[0].open, true);
  const o = bevindingenVan({ type: { methodiek: 'oordeel', schaal: [{ waarde: 1, label: 'Goed', kleur: '#1a7f37' }, { waarde: 2, label: 'Slecht', kleur: '#d1452f' }] },
    gebreken: [{ bouwdeel: 'Fietspad', gebrek: 'Rafeling', oordeel: 2 }] });
  assert.equal(o[0].oordeel, 'Slecht');
  assert.equal(o[0].open, false);
});

test("foto's per registratie voor het blad Foto's", async () => {
  const UX = await import('../js/uitkomstenexcel.js');
  const f = UX.fotosVan({ fotoIds: ['a'], extraFotoIds: ['b'], gebreken: [{ gebrek: 'Scheur', fotoIds: ['c', 'a'] }], bvc: { gebreken: [{ omschrijving: 'Holte', fotoIds: ['d'] }] } });
  assert.deepEqual(f.map((x) => [x.fotoId, x.onderwerp]), [['a', 'Algemeen'], ['b', 'Formulier'], ['c', 'Bevinding 1: Scheur'], ['d', 'Boomgebrek 1: Holte']]);
  const r = UX.uitkomstRijen({ registraties: [{ soort: 'werk', r: { soort: 'Schouw', datum: '2026-05-01', fotoIds: ['x'] }, object: { code: 'GV-1' } }, { soort: 'overgeslagen', r: { fotoIds: ['y'] }, object: { code: 'GV-2' } }] });
  assert.deepEqual(r.fotos.map((x) => [x.objectcode, x.fotoId, x.registratie]), [['GV-1', 'x', 'Schouw · 2026-05-01']]);
});
