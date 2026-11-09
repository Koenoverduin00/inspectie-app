import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ST from '../js/stowa.js';
import { takenLijst } from '../js/taken.js';
import { resultaatRijen } from '../js/resultatenexcel.js';

test('systematiek: 61 inspectiewijzers in 7 categorieën, zones per type kering', () => {
  assert.equal(ST.WIJZERS.length, 61);
  assert.deepEqual([...new Set(ST.WIJZERS.map((w) => w.categorie))], [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(ST.WIJZERS.map((w) => w.nr), Array.from({ length: 61 }, (_, i) => i + 1));
  const w8 = ST.wijzer(8);
  assert.equal(w8.element, 'Grasbekleding');
  assert.equal(w8.schadebeeld, 'natte plekken');
  assert.ok(ST.KERINGEN.zeedijk.zones.includes('kreukelberm'));
  const kruin = ST.wijzersVoorZone('kruin').map((w) => w.nr);
  assert.ok(kruin.includes(10) && !kruin.includes(1), 'beschoeiing hoort niet bij de kruin');
  assert.ok(ST.wijzersVoorZone('teensloot').some((w) => w.nr === 53), 'wellen in de teensloot');
  assert.ok(ST.wijzersVoorZone('stabiliteitsberm').length > 0);
});

test('keuzelijsten uit bijlage D', () => {
  assert.deepEqual(ST.keuzelijst(5, 'erosiebreedte'), ['< 25 cm', '25 - 50 cm', '50 - 100 cm', '> 100 cm']);
  assert.ok(ST.keuzelijst(6, 'oorzaak').includes('muskusrat'));
  assert.ok(ST.keuzelijst(12, 'oorzaak').includes('schapen'));
  assert.deepEqual(ST.keuzelijst(8, 'zand meevoerend'), ['voert zand mee', 'voert geen zand mee']);
  assert.equal(ST.keuzelijst(24, 'aantal'), null, 'vrije invoer');
});

test('urgentie, controle en koppeling met maatregelen en taken', () => {
  const w = [
    { id: 'a', aard: 'schadebeeld', zone: 'binnentalud', wijzer: 8, urgentieKleur: 'rood', fotoIds: ['f'], maatregelStatus: 'open', lat: 52.1, lng: 5.1 },
    { id: 'b', aard: 'handhaving', zone: 'kruin', omschrijving: 'Opslag op de kruin', urgentieKleur: 'oranje', maatregelStatus: 'open', lat: 52.1, lng: 5.1 },
    { id: 'c', aard: 'schadebeeld', zone: 'kruin', wijzer: 7, urgentieKleur: 'groen', maatregelStatus: 'open', lat: 52.1, lng: 5.1 },
  ].map(ST.alsGebrek);
  assert.equal(ST.zwaarste(w), 'rood');
  assert.deepEqual(w.map((x) => x.urgentie), ['direct', '3maanden', ''], 'groen zonder maatregel = geen maatregel');
  assert.equal(w[0].bouwdeel, 'Gras · binnentalud', 'element volgens de catalogus (Digigids)');
  assert.equal(w[0].groep, 'Grasbekledingen');
  assert.equal(w[1].gebrek, 'Opslag op de kruin');
  assert.deepEqual(ST.controleer({ kering: 'rivierdijk', waarnemingen: w }), []);
  const fout = ST.controleer({ kering: '', waarnemingen: [{ aard: 'schadebeeld', urgentieKleur: 'rood' }] });
  assert.equal(fout.length, 5, 'kering, zone, schadebeeld, foto bij rood, puntlocatie');
  assert.ok(fout.some((f) => /locatie als punt/.test(f)));

  const insp = { id: 'i', objectId: 'o', status: 'afgerond', datum: '2027-03-01', gebreken: [], stowa: { kering: 'rivierdijk', waarnemingen: w } };
  const taken = takenLijst({ objecten: [{ id: 'o', code: 'DV-1' }], inspecties: [insp], taken: [], planning: new Map(), vandaag: '2027-03-02' });
  assert.deepEqual(taken.map((t) => [t.rang, t.maatregel]), [[1, 'i:a'], [2, 'i:b']]);

  const r = resultaatRijen({ lijst: [{ object: { id: 'o', code: 'DV-1', naam: 'Dijkvak 1' }, inspectie: insp, status: 'afgerond' }] });
  const kop = r.kolommen.map(([k]) => k);
  assert.equal(r.resultaten[0].waarden[kop.indexOf('Zwaarste urgentie')], 'Rood');
  assert.equal(r.resultaten[0].waarden[kop.indexOf('Rood')], 1);
  assert.equal(r.gebreken.length, 3);
  assert.equal(r.maatregelen.length, 2);
});

test('soorten inspectie en catalogus elementgroep → element → schadebeeld', () => {
  assert.deepEqual(ST.INSPECTIEMOMENTEN, ['Voorjaarsinspectie', 'Najaarsinspectie', 'Droogte-inspectie', 'Storm-inspectie', 'Hoogwaterinspectie']);
  assert.equal(ST.ELEMENTGROEPEN.length, 6);
  assert.equal(ST.SCHADEBEELDEN.length, 125, '100 Digigids + 25 inspectiewijzers zonder Digigids');
  assert.ok(ST.SCHADEBEELDEN.every((s) => ST.ELEMENTGROEPEN.includes(s.groep) && s.element && s.naam));
  assert.equal(new Set(ST.SCHADEBEELDEN.map((s) => s.sleutel)).size, 125, 'unieke sleutels');
  const elk = new Set(ST.SCHADEBEELDEN.map((s) => s.wijzer).filter(Boolean));
  assert.equal(elk.size, 61, 'elke inspectiewijzer is te kiezen');
  assert.deepEqual(ST.elementenVan('Steenbekledingen'), ['Breuksteen in schanskorven', 'Steenbestorting', 'Zuilen of blokken']);
  assert.ok(ST.schadebeeldenVan('Steenbekledingen', 'Zuilen of blokken').some((s) => s.sleutel === 'w:20'));
  // Oudere waarnemingen (alleen wijzer of oud Digigids-id) krijgen een sleutel.
  assert.equal(ST.sleutelVan({ wijzer: 22 }), 'dg:steenbekledingen/zuilen-blokken/losse-gekamde-stenen');
  assert.equal(ST.sleutelVan({ wijzer: 20 }), 'w:20');
  assert.equal(ST.sleutelVan({ digigids: 'zuilen-blokken/gaten' }), 'dg:steenbekledingen/zuilen-blokken/gaten');
});
