import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultaatRijen, oordeel } from '../js/resultatenexcel.js';

const boom = { id: 'b1', code: 'BM-1', naam: 'Eik', type: 'Boom', laagId: 'L', lat: 52.09, lng: 5.12 };
const vak = { id: 'v1', code: 'GV-1', naam: 'Gazon', geometrie: { type: 'Polygon', coordinates: [[[5.1, 52.1], [5.101, 52.1], [5.101, 52.101], [5.1, 52.101], [5.1, 52.1]]] } };

test('BVC-ronde: regels per object met status, gebreken, maatregelen en foto\'s', () => {
  const bvc = {
    id: 'i1', objectId: 'b1', status: 'afgerond', datum: '2027-08-01', inspecteur: 'Kees', soort: 'Boomveiligheidscontrole', fotoIds: ['f1'],
    bvc: {
      soort: 'Quercus robur', plantjaar: '1950', dbh: '60', ork: 'Hoog', bvk: 'risico', methode: 'VTA', opmerking: 'Holte',
      gebreken: [{ omschrijving: 'Holte', plaats: 'Stam', gevolg: 'Stambreuk', fotoIds: ['f2', 'f3'] }],
      maatregelen: [{ bvcMaatregel: 'Boom verwijderen', termijn: 'acuut', uitvoerenVoor: '2027-08-03', maatregelStatus: 'open' }],
    },
  };
  const r = resultaatRijen({
    lijst: [{ object: boom, inspectie: bvc, status: 'afgerond' }, { object: vak, inspectie: null, status: 'overgeslagen', reden: 'Niet bereikbaar' }],
    laagNaam: new Map([['L', 'Bomen']]),
    extra: () => [['Weerstand', 'Ja']],
  });
  const kop = r.kolommen.map(([k]) => k);
  const waarde = (rij, k) => r.resultaten[rij].waarden[kop.indexOf(k)];
  assert.equal(waarde(0, 'Laag'), 'Bomen');
  assert.equal(waarde(0, 'Status'), 'Gedaan');
  assert.equal(waarde(0, 'Boomveiligheidsklasse'), 'Risicoboom');
  assert.equal(waarde(0, 'Urgentste maatregel'), 'Acuut (48 uur)');
  assert.equal(waarde(0, 'Plantjaar'), 1950);
  assert.equal(waarde(0, "Foto's"), 3);
  assert.equal(waarde(0, 'Weerstand'), 'Ja');
  assert.ok(waarde(0, 'X (RD)') > 100000);
  assert.equal(waarde(1, 'Status'), 'Overgeslagen');
  assert.equal(waarde(1, 'Reden overslaan'), 'Niet bereikbaar');
  assert.ok(waarde(1, 'Breedtegraad') > 52.1, 'coördinaat uit het middelpunt van het vlak');
  assert.equal(r.gebreken.length, 1);
  assert.equal(r.maatregelen.length, 1);
  assert.equal(r.fotos.length, 3);
  assert.deepEqual(r.telling, { totaal: 2, gedaan: 1, concept: 0, overgeslagen: 1, open: 0 });
  assert.ok(!kop.includes('Weer'), 'geen NEN-kolommen bij alleen BVC');
});

test('NEN-inspectie: conditie, gebreken en raming', () => {
  const i = {
    id: 'i2', objectId: 'v1', status: 'concept', datum: '2027-03-01', soort: 'Schouw',
    gebreken: [
      { bouwdeel: 'Verharding', gebrek: 'Scheur', ernst: 'ernstig', intensiteit: 3, omvang: 40, maatregel: 'Herstellen', urgentie: 'direct', kostenraming: 1200 },
      { bouwdeel: 'Kantopsluiting', gebrek: 'Verzakt', ernst: 'gering', intensiteit: 1, omvang: 5 },
    ],
  };
  const r = resultaatRijen({ lijst: [{ object: vak, inspectie: i, status: 'concept' }] });
  const kop = r.kolommen.map(([k]) => k);
  const rij = r.resultaten[0].waarden;
  assert.equal(rij[kop.indexOf('Oordeel')], oordeel(i).code);
  assert.ok(oordeel(i).code >= 4);
  assert.equal(rij[kop.indexOf('Status')], 'Concept (niet afgerond)');
  assert.equal(rij[kop.indexOf('Raming open maatregelen (€)')], 1200);
  assert.equal(r.gebreken.length, 2);
  assert.equal(r.maatregelen.length, 1);
});
