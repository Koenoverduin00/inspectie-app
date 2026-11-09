import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as DG from '../js/digigids.js';
import * as ST from '../js/stowa.js';
import { resultaatRijen } from '../js/resultatenexcel.js';

test('Digigids: alle 6 categorieën, 100 schadebeelden met 4 klassen', () => {
  assert.equal(DG.SCHADEBEELDEN.length, 100);
  assert.equal(DG.CATEGORIEEN.length, 6);
  assert.deepEqual([...new Set(DG.SCHADEBEELDEN.map((s) => s.categorie))].sort(), [...DG.CATEGORIEEN].sort());
  for (const s of DG.SCHADEBEELDEN) {
    assert.deepEqual(s.klassen.map((k) => k.klasse), DG.KLASSEN, s.id);
    assert.ok(s.klassen.every((k) => DG.klasseTekst(k).length > 3), `${s.id}: elke klasse heeft een criterium of fotobijschrift`);
    assert.ok(s.url.startsWith('https://digigids.stowa.nl/gids/'));
    if (s.wijzer !== null) assert.ok(ST.wijzer(s.wijzer), `wijzer ${s.wijzer} bestaat`);
  }
  assert.equal(DG.schadebeeld('steenbekledingen/zuilen-blokken/losse-gekamde-stenen').klassen[3].criterium, 'Overhang > 10 cm');
  assert.deepEqual(DG.bijWijzer(22).map((s) => s.id), ['steenbekledingen/zuilen-blokken/losse-gekamde-stenen']);
  assert.equal(DG.bijWijzer(52).length, 2, 'schanskorven: wapening en gaten');
  assert.equal(DG.zonderWijzer().length, 49);
  assert.equal(DG.bijWijzer(9).length, 4, 'onkruid groot/klein, ruigte, houtopslag');
  assert.equal(DG.klasseTekst(DG.schadebeeld('bijzondere-constructies/damwand-beschoeiing/conditie').klassen[2]), 'Matige staat van materiaal');
});

test('waarneming met alleen een Digigids-schadebeeld', () => {
  const w = ST.alsGebrek({ id: 'x', aard: 'schadebeeld', zone: 'buitentalud', wijzer: '', digigids: 'steenbekledingen/zuilen-blokken/drijf-zwerfvuil', digigidsKlasse: 'Matig', urgentieKleur: 'oranje', lat: 52.1, lng: 5.1 });
  assert.deepEqual(ST.controleer({ kering: 'zeedijk', waarnemingen: [w] }), []);
  assert.equal(w.bouwdeel, 'Zuilen of blokken · buitentalud');
  assert.equal(w.gebrek, 'Drijf- of zwerfvuil');
  assert.equal(ST.schadebeeldNaam(w), 'Zuilen of blokken: Drijf- of zwerfvuil');
  const r = resultaatRijen({ lijst: [{ object: { id: 'o', code: 'DV-1' }, inspectie: { id: 'i', objectId: 'o', status: 'afgerond', datum: '2027-01-01', stowa: { kering: 'zeedijk', waarnemingen: [w] } }, status: 'afgerond' }] });
  assert.ok(r.gebreken[0].waarden.includes('Digigids: Matig'));
});
