import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as KO from '../js/kaartopmaak.js';

test('kaartopmaak: samenvoegen, opschonen en leaflet-stijl', () => {
  const s = KO.samenvoegen();
  assert.deepEqual(s.open, KO.STANDAARD.open);
  const m = KO.samenvoegen({ open: { kleur: '#FF0000', dikte: 99 } }, { gedaan: { lijn: 'gestippeld', vulling: 0.5 } }, { open: { kleur: 'rood' } });
  assert.equal(m.open.kleur, '#ff0000'); // ongeldige apparaatkleur telt niet: projectkleur blijft
  assert.equal(m.open.dikte, 10);
  assert.equal(m.gedaan.lijn, 'gestippeld');
  const v = KO.leaflet(m.gedaan, false);
  assert.equal(v.dashArray, '2 4');
  assert.equal(v.fillOpacity, 0.5);
  const p = KO.leaflet(KO.STANDAARD.gedaan, true);
  assert.equal(p.radius, 5);
  assert.equal(p.color, '#ffffff');
  assert.equal(KO.leaflet({ ...KO.STANDAARD.open, dikte: 0 }, false).opacity, 0);
  assert.deepEqual(KO.verschil(KO.samenvoegen()), {});
  assert.deepEqual(KO.verschil({ gedaan: { kleur: '#0000ff' } }), { gedaan: { kleur: '#0000ff' } });
  assert.match(KO.legendaCss(KO.STANDAARD.open), /box-shadow/);
});
