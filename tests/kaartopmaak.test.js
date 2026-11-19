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

test('werk in delen: gedeeltelijk afgemeld blijft te doen tot iemand volledig klaar meldt', async () => {
  const P = await import('../js/pakketten.js');
  const pakket = { id: 'p', soort: 'werk', objecten: ['a', 'b', 'c'], rondeId: '' };
  const w = [
    { werkpakketId: 'p', objectId: 'a', datum: '2026-11-01', gereed: false, deel: 'vanaf het land' },
    { werkpakketId: 'p', objectId: 'b', datum: '2026-11-01', gereed: false },
    { werkpakketId: 'p', objectId: 'b', datum: '2026-11-02', gereed: true },
    { werkpakketId: 'p', objectId: 'c', datum: '2026-11-03' }, // oude registratie zonder vraag = volledig
  ];
  const vg = P.voortgang(pakket, { werkzaamheden: w });
  assert.deepEqual(['a', 'b', 'c'].map((id) => P.objectStatus(vg, id)), ['deels', 'gedaan', 'gedaan']);
  assert.deepEqual(vg.open, ['a']);
  assert.equal(vg.percentage, 67);
  assert.equal(vg.deels.get('a')[0].deel, 'vanaf het land');
  assert.ok(P.teDoen('deels') && P.teDoen('open') && !P.teDoen('gedaan'));
  assert.equal(KO.samenvoegen().deels.lijn, 'gestreept');
});

test('bestekposten: hoeveelheden optellen en voortgang op hoeveelheid', async () => {
  const P = await import('../js/pakketten.js');
  const pakket = { id: 'p', soort: 'werk', objecten: ['a', 'b', 'c', 'd'], rondeId: '', voortgangOp: 'hoeveelheid', posten: [{ id: 'z', omschrijving: 'Zetsteen herstel', hoeveelheid: 300, eenheid: 'm2' }] };
  const w = [
    { werkpakketId: 'p', objectId: 'a', datum: '2026-11-01', hoeveelheden: { z: 120 } },
    { werkpakketId: 'p', objectId: 'b', datum: '2026-11-02', gereed: false, hoeveelheden: { z: '60' } },
  ];
  let vg = P.voortgang(pakket, { werkzaamheden: w });
  assert.equal(vg.modus, 'hoeveelheid');
  assert.deepEqual([vg.hoeveelheden[0].gedaan, vg.hoeveelheden[0].rest, vg.hoeveelheden[0].pct, vg.percentage], [180, 120, 60, 60]);
  assert.deepEqual(vg.open, ['b', 'c', 'd']);
  assert.equal(P.hoeveelheidTekst(vg.hoeveelheden[0]), '180 / 300 m²');
  w.push({ werkpakketId: 'p', objectId: 'c', datum: '2026-11-03', hoeveelheden: { z: 130 } });
  vg = P.voortgang(pakket, { werkzaamheden: w });
  assert.equal(vg.percentage, 100);
  assert.deepEqual(vg.open, ['b']); // gedeeltelijk blijft te doen
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => P.objectStatus(vg, id)), ['gedaan', 'deels', 'gedaan', 'nietnodig']);
  // zonder voortgang op hoeveelheid telt het objecten, maar de hoeveelheden worden wel bijgehouden
  const vg2 = P.voortgang({ ...pakket, voortgangOp: 'objecten' }, { werkzaamheden: w });
  assert.deepEqual([vg2.modus, vg2.percentage, vg2.hoeveelheden[0].gedaan], ['objecten', 50, 310]);
});
