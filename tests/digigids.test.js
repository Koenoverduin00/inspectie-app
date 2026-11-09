import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as DG from '../js/digigids.js';
import * as ST from '../js/stowa.js';
import { resultaatRijen } from '../js/resultatenexcel.js';

test('Digigids steenbekledingen: 9 schadebeelden met 4 klassen', () => {
  assert.equal(DG.SCHADEBEELDEN.length, 9);
  for (const s of DG.SCHADEBEELDEN) {
    assert.deepEqual(s.klassen.map((k) => k.klasse), DG.KLASSEN, s.id);
    assert.ok(s.klassen.every((k) => k.criterium.length > 5), s.id);
    assert.ok(s.url.startsWith('https://digigids.stowa.nl/gids/steenbekledingen/'));
    if (s.wijzer !== null) assert.ok(ST.wijzer(s.wijzer), `wijzer ${s.wijzer} bestaat`);
  }
  assert.equal(DG.schadebeeld('zuilen-blokken/losse-gekamde-stenen').klassen[3].criterium, 'Overhang > 10 cm');
  assert.deepEqual(DG.bijWijzer(22).map((s) => s.id), ['zuilen-blokken/losse-gekamde-stenen']);
  assert.equal(DG.bijWijzer(52).length, 2, 'schanskorven: wapening en gaten');
  assert.deepEqual(DG.zonderWijzer().map((s) => s.id).sort(), ['steenbestorting/gaten', 'zuilen-blokken/drijf-zwerfvuil']);
});

test('waarneming met alleen een Digigids-schadebeeld', () => {
  const w = ST.alsGebrek({ id: 'x', aard: 'schadebeeld', zone: 'buitentalud', wijzer: '', digigids: 'zuilen-blokken/drijf-zwerfvuil', digigidsKlasse: 'Matig', urgentieKleur: 'oranje' });
  assert.deepEqual(ST.controleer({ kering: 'zeedijk', waarnemingen: [w] }), []);
  assert.equal(w.bouwdeel, 'Zuilen of blokken · buitentalud');
  assert.equal(w.gebrek, 'Drijf- of zwerfvuil');
  assert.equal(ST.schadebeeldNaam(w), 'Zuilen of blokken: Drijf- of zwerfvuil');
  const r = resultaatRijen({ lijst: [{ object: { id: 'o', code: 'DV-1' }, inspectie: { id: 'i', objectId: 'o', status: 'afgerond', datum: '2027-01-01', stowa: { kering: 'zeedijk', waarnemingen: [w] } }, status: 'afgerond' }] });
  assert.ok(r.gebreken[0].waarden.includes('Digigids: Matig'));
});
