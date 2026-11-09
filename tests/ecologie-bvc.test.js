import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as eco from '../js/ecologie.js';
import * as bvc from '../js/bvc.js';
import { rdNaarWgs84 } from '../js/gis.js';

test('vrijgave: geldigheid en keuze per object', () => {
  const v = { status: 'afgerond', besluit: 'vrij', datum: '2026-05-01', geldigTot: '2026-05-03', objectIds: ['a'] };
  assert.equal(eco.geldigheid(v, '2026-05-02'), 'geldig');
  assert.equal(eco.geldigheid(v, '2026-05-04'), 'verlopen');
  assert.equal(eco.geldigheid(v, '2026-04-30'), 'toekomst');
  assert.equal(eco.geldigheid({ ...v, besluit: 'niet' }, '2026-05-02'), 'afgewezen');
  assert.equal(eco.geldigheid({ ...v, status: 'concept' }, '2026-05-02'), 'concept');
  const oud = { ...v, id: 'oud', datum: '2026-04-01', geldigTot: '2026-06-01' };
  const nieuw = { ...v, id: 'nieuw', datum: '2026-05-10', geldigTot: '2026-05-11' };
  assert.equal(eco.vrijgaveVoorObject([oud, nieuw], 'a', '2026-05-20').id, 'oud', 'geldige gaat voor nieuwere verlopen');
  assert.equal(eco.vrijgaveVoorObject([oud, nieuw], 'a', '2026-07-01').id, 'nieuw', 'anders de nieuwste');
  assert.equal(eco.vrijgaveVoorObject([oud], 'b', '2026-05-20'), null);
});

test('vrijgave: controle volgens gedragscode', () => {
  const basis = {
    objectIds: ['a'], werkzaamheid: 'Maaien', activiteit: eco.ACTIVITEITEN_BO[1], datum: '2026-05-01', deskundige: 'A. Ecoloog',
    deskundigheid: 'deskundige', routeGedragscode: true, ewpKenmerk: 'EWP-12', ewpGeaccepteerd: true, besluit: 'vrij',
    geldigTot: '2026-05-03', verklaring: true, waarnemingen: [],
  };
  assert.deepEqual(eco.controleer(basis), []);
  assert.ok(eco.controleer({ ...basis, ewpGeaccepteerd: false }).some((x) => x.includes('geaccepteerd EWP')));
  assert.ok(eco.controleer({ ...basis, deskundigheid: 'gedelegeerd' }).some((x) => x.includes('aansturing')));
  assert.ok(eco.controleer({ ...basis, besluit: 'voorwaarden' }).some((x) => x.includes('voorwaarden')));
  const metNest = { ...basis, waarnemingen: [{ soortgroep: 'Vogels', soort: 'Wilde eend', type: 'Nest in gebruik (broedgeval)' }] };
  assert.ok(eco.controleer(metNest).some((x) => x.includes('onder voorwaarden')));
  assert.deepEqual(eco.controleer({ ...metNest, besluit: 'voorwaarden', voorwaarden: '25 m rond nest ontzien' }), []);
  assert.deepEqual(eco.controleer({ ...basis, besluit: 'niet', geldigTot: '' }), [], 'afwijzing heeft geen geldigheid nodig');
});

test('BVC: frequentie volgens tabel 1 en 2', () => {
  assert.equal(bvc.frequentie('geen', 'Laag'), 6);
  assert.equal(bvc.frequentie('geen', 'Midden'), 3);
  assert.equal(bvc.frequentie('geen', 'Hoog'), 1);
  assert.equal(bvc.frequentie('attentie', 'Laag'), 1);
  assert.equal(bvc.frequentie('risicoattentie', 'Midden'), 1);
  assert.equal(bvc.frequentie('risico', 'Midden'), 3);
});

test('BVC: controle op samenhang', () => {
  const basis = { controleur: 'J. Boom', kwalificatie: 'ETT (European Tree Technician)', soort: 'Quercus robur', ork: 'Midden', bvk: 'geen', gebreken: [], maatregelen: [] };
  assert.deepEqual(bvc.controleer(basis), []);
  assert.ok(bvc.controleer({ ...basis, bvk: 'attentie' }).some((x) => x.includes('minimaal één boomgebrek')));
  const gebrek = { omschrijving: 'Massaria', plaats: 'Kroon', gevolg: 'Takbreuk' };
  assert.ok(bvc.controleer({ ...basis, gebreken: [gebrek] }).some((x) => x.includes('zonder gebreken')));
  assert.ok(bvc.controleer({ ...basis, bvk: 'risico', gebreken: [gebrek] }).some((x) => x.includes('vereist een maatregel')));
  const kap = { bvcMaatregel: 'Boom verwijderen', termijn: 'acuut' };
  assert.ok(bvc.controleer({ ...basis, bvk: 'risico', gebreken: [gebrek], maatregelen: [kap] }).some((x) => x.includes('oranje streep')));
  assert.deepEqual(bvc.controleer({ ...basis, bvk: 'risico', gebreken: [gebrek], maatregelen: [kap], gemarkeerd: true }), []);
  assert.deepEqual(bvc.controleer({ ...basis, gebreken: [{ omschrijving: 'Hinderlijke takken', plaats: 'Kroon', gevolg: 'Takbreuk' }] }), [],
    'bruikbaarheidsgebrek maakt een boom niet onveilig');
  assert.deepEqual(bvc.controleer({ controleur: 'X', kwalificatie: 'ETW (European Tree Worker)', niet: true }), [], 'niet aangetroffen');
  assert.ok(bvc.controleer({ ...basis, gb: true }).some((x) => x.includes('aantal bomen')));
});

test('BVC: RD-coördinaten, termijnen en SUF', () => {
  for (const [x, y] of [[155000, 463000], [121687, 487484], [180000, 320000]]) {
    const [lng, lat] = rdNaarWgs84(x, y);
    const [x2, y2] = bvc.wgs84NaarRd(lng, lat);
    assert.ok(Math.abs(x2 - x) < 0.05 && Math.abs(y2 - y) < 0.05, `${x2},${y2}`);
  }
  assert.equal(bvc.uitvoerenVoor('acuut', '2026-08-30'), '2026-09-01');
  assert.equal(bvc.uitvoerenVoor('3maanden', '2026-08-15'), '2026-11-15');
  assert.ok(bvc.inControleperiode('2026-07-01') && bvc.inControleperiode('2026-11-30') && !bvc.inControleperiode('2026-03-10'));
  assert.equal(bvc.gebrekType('Zwavelzwam'), 'Zwam');
  const [lng, lat] = rdNaarWgs84(136000, 455800);
  const suf = bvc.sufRijen([{
    object: { id: 'k1', lat, lng, beheerder: 'RWS West-Nederland Zuid' },
    inspectie: { datum: '2026-08-01', inspecteur: 'J. Boom', bvc: { soort: 'Populus nigra', plantjaar: 1980, ork: 'Hoog', bvk: 'risico', gebreken: [{ omschrijving: 'Afgestorven tak', plaats: 'Kroon', gevolg: 'Takbreuk' }], maatregelen: [{ bvcMaatregel: 'Veiligheidssnoei', termijn: '3maanden' }] } },
  }]);
  assert.deepEqual(suf.bomen[1].slice(0, 3), ['k1', 136000, 455800]);
  assert.equal(suf.bomen[1][7], 'Jaarlijks');
  assert.equal(suf.bomen[1][9], '20260801');
  assert.equal(suf.bomen[1][10], 'Risicoboom');
  assert.deepEqual(suf.gebreken[1], ['k1', '20260801', 'Afgestorven tak', 'Mechanisch defect', 'Kroon', 'Takbreuk']);
  assert.deepEqual(suf.maatregelen[1], ['k1', '20260801', 'Veiligheidssnoei', 'Binnen 3 maanden']);
});
