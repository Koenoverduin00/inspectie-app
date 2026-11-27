import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../js/koppeling.js';

const insp = (over = {}) => ({
  id: 'i1', projectId: 'p', objectId: 'o1', werkpakketId: 'SCHOUW', rondeId: 'r1', datum: '2026-11-01', status: 'afgerond',
  gebreken: [
    { id: 'g1', gebrek: 'Zwerfvuil', maatregel: 'Opruimen', urgentie: 'direct' },
    { id: 'g2', gebrek: 'Paal scheef', maatregel: 'Paal rechtzetten', urgentie: '1jaar', kostenraming: 120 },
    { id: 'g3', gebrek: 'Opmerking', maatregel: '', urgentie: '' },
  ],
  ...over,
});
const kop = (over = {}) => ({ id: 'k1', bronPakketId: 'SCHOUW', doelPakketId: 'WERK', modus: 'altijd', doelRonde: 'lopend', filter: {}, actief: true, ...over });

test('past: filters op maatregel, gebrek, urgentie en conditie', () => {
  const g = { gebrek: 'Zwerfvuil', maatregel: 'Opruimen', urgentie: '1jaar' };
  assert.ok(K.past({}, g));
  assert.ok(K.past({ maatregelen: ['Opruimen'] }, g));
  assert.ok(!K.past({ maatregelen: ['Maaien'] }, g));
  assert.ok(!K.past({ gebreken: ['Paal scheef'] }, g));
  assert.ok(!K.past({ urgentieTot: '3maanden' }, g));
  assert.ok(K.past({ urgentieTot: '1jaar' }, g));
  assert.ok(!K.past({ conditieVanaf: 4 }, g, { conditie: 3 }));
  assert.ok(K.past({ conditieVanaf: 4 }, g, { conditie: null }));
});

test('bijwerken: alleen goedgekeurde inspecties uit het bronpakket; altijd → open, controle → te beoordelen', () => {
  const r = K.bijwerken(kop(), [insp(), insp({ id: 'i2', werkpakketId: 'ANDER' })], new Map(), { nu: 'T' });
  assert.deepEqual(r.nieuw.map((x) => [x.id, x.status]), [['i1:g1:k1', 'open'], ['i1:g2:k1', 'open']]);
  assert.equal(r.nieuw[0].doel.pakketId, 'WERK');
  assert.equal(r.nieuw[0].momentopname.maatregel, 'Opruimen');
  const c = K.bijwerken(kop({ modus: 'controle', filter: { maatregelen: ['Paal rechtzetten'] } }), [insp()], new Map(), { nu: 'T' });
  assert.deepEqual(c.nieuw.map((x) => [x.id, x.status]), [['i1:g2:k1', 'te beoordelen']]);
  // ingediend (wacht op beoordeling) of concept: niets
  assert.equal(K.bijwerken(kop(), [insp({ beoordeling: { status: 'ingediend' } })], new Map()).nieuw.length, 0);
  assert.equal(K.bijwerken(kop(), [insp({ status: 'concept' })], new Map()).nieuw.length, 0);
  // vanaf-datum: oudere inspecties niet
  assert.equal(K.bijwerken(kop({ vanaf: '2026-12-01' }), [insp()], new Map()).nieuw.length, 0);
  // relatie uit: niets
  assert.equal(K.bijwerken(kop({ actief: false }), [insp()], new Map()).nieuw.length, 0);
});

test('bijwerken: geen dubbele werkpunten, afkeuren → terug naar controle, gebrek weg → vervallen, uitgevoerd → gedaan', () => {
  const eerst = K.bijwerken(kop(), [insp()], new Map(), { nu: 'T1' }).nieuw;
  const map = new Map(eerst.map((x) => [x.id, x]));
  assert.equal(K.bijwerken(kop(), [insp()], map, { nu: 'T2' }).nieuw.length, 0);
  const af = K.bijwerken(kop(), [insp({ beoordeling: { status: 'afgekeurd' } })], map, { nu: 'T2' });
  assert.deepEqual(af.gewijzigd.map((x) => [x.id, x.status, x.bronGewijzigd]), [['i1:g1:k1', 'te beoordelen', true], ['i1:g2:k1', 'te beoordelen', true]]);
  const zonderG2 = insp({ gebreken: insp().gebreken.filter((g) => g.id !== 'g2') });
  const weg = K.bijwerken(kop(), [zonderG2], map, { nu: 'T2' });
  assert.deepEqual(weg.gewijzigd.map((x) => [x.id, x.status]), [['i1:g2:k1', 'vervallen']]);
  const klaar = insp({ gebreken: insp().gebreken.map((g) => (g.id === 'g1' ? { ...g, maatregelStatus: 'uitgevoerd' } : g)) });
  assert.deepEqual(K.bijwerken(kop(), [klaar], map, { nu: 'T2' }).gewijzigd.map((x) => [x.id, x.status]), [['i1:g1:k1', 'gedaan']]);
  // gebrek aangepast na doorzetten → terug naar controle
  const anders = insp({ gebreken: insp().gebreken.map((g) => (g.id === 'g2' ? { ...g, urgentie: 'direct' } : g)) });
  const aa = K.bijwerken(kop(), [anders], map, { nu: 'T2' }).gewijzigd;
  assert.equal(aa[0].status, 'te beoordelen');
  assert.equal(aa[0].momentopname.urgentie, 'direct');
});

test('besluit en doelRonde', () => {
  const wp = { id: 'x', status: 'te beoordelen' };
  assert.equal(K.besluit(wp, 'doorzetten', { door: 'jan', nu: 'T' }).status, 'open');
  assert.equal(K.besluit(wp, 'meerwerk').status, 'open');
  assert.equal(K.besluit(wp, 'niet uitvoeren', { reden: 'budget' }).besluit.reden, 'budget');
  const rondes = [
    { id: 'a', nummer: 1, status: 'afgerond', start: '2026-03-01', eind: '2026-03-31' },
    { id: 'b', nummer: 2, status: 'actief', start: '2026-11-01', eind: '2026-11-30' },
    { id: 'c', nummer: 3, status: 'gepland', start: '2027-03-01', eind: '2027-03-31' },
    { id: 'h', nummer: 4, status: 'gepland', herstel: { koppelingId: 'k1', items: [] } },
  ];
  assert.equal(K.doelRonde(rondes, 'lopend', { vandaag: '2026-11-27' }).id, 'b');
  assert.equal(K.doelRonde(rondes, 'volgend', { vandaag: '2026-11-27' }).id, 'c');
  assert.equal(K.doelRonde(rondes, 'herstel', { koppelingId: 'k1' }).id, 'h');
  assert.equal(K.doelRonde(rondes, 'herstel', { koppelingId: 'k2' }), null);
  assert.equal(K.doelRonde([rondes[0], rondes[2]], 'lopend', { vandaag: '2026-11-27' }).id, 'c');
});

test('rondeMetPunten: open punten erin als herstelitem, teruggetrokken punten eruit', () => {
  const p1 = { id: 'i1:g1:k1', status: 'open', bron: { inspectieId: 'i1', gebrekId: 'g1', objectId: 'o1' } };
  const p2 = { id: 'i1:g2:k1', status: 'te beoordelen', bron: { inspectieId: 'i1', gebrekId: 'g2', objectId: 'o2' } };
  const r = K.rondeMetPunten({ id: 'b', objectIds: ['o9'] }, [p1, p2]);
  assert.deepEqual(r.herstel.items, [{ inspectieId: 'i1', gebrekId: 'g1', objectId: 'o1', werkpuntId: 'i1:g1:k1' }]);
  assert.deepEqual(r.objectIds, ['o9', 'o1']);
  assert.equal(K.rondeMetPunten(r, [p1]), null, 'al aanwezig: niets te doen');
  const terug = K.rondeMetPunten(r, [{ ...p1, status: 'te beoordelen' }]);
  assert.deepEqual(terug.herstel.items, []);
  // zonder deelselectie: objectIds blijft weg (de ronde neemt het object op via de herstelitems)
  assert.equal(K.rondeMetPunten({ id: 'b' }, [p1]).objectIds, undefined);
});

test('tellingen en voorstel', () => {
  const ps = [{ koppelingId: 'k', status: 'open' }, { koppelingId: 'k', status: 'te beoordelen' }, { koppelingId: 'k', status: 'gedaan' }];
  assert.deepEqual(K.tellingen(ps).get('k'), { totaal: 3, open: 1, teBeoordelen: 1, gedaan: 1 });
  const kand = [{ id: 'a', momentopname: { urgentie: 'direct', maatregel: 'X' } }, { id: 'b', momentopname: { urgentie: '3jaar', maatregel: 'Y' } }, { id: 'c', momentopname: { urgentie: '3jaar', maatregel: 'Z' } }];
  assert.deepEqual([...K.voorstel(kand, [{ status: 'open', besluit: { keuze: 'doorzetten' }, momentopname: { maatregel: 'Z' } }])], ['a', 'c']);
});

test('afgekeurd en weer goedgekeurd: altijd → weer open, controle → blijft ter controle; uitgevoerd → gedaan', () => {
  const eerst = new Map(K.bijwerken(kop(), [insp()], new Map(), { nu: 'T1' }).nieuw.map((x) => [x.id, x]));
  const af = K.bijwerken(kop(), [insp({ beoordeling: { status: 'afgekeurd' } })], eerst, { nu: 'T2' }).gewijzigd;
  const na = new Map(af.map((x) => [x.id, x]));
  const terug = K.bijwerken(kop(), [insp()], na, { nu: 'T3' }).gewijzigd;
  assert.deepEqual(terug.map((x) => x.status), ['open', 'open']);
  const terugC = K.bijwerken(kop({ modus: 'controle' }), [insp()], na, { nu: 'T3' }).gewijzigd;
  assert.deepEqual(terugC.map((x) => x.status), ['te beoordelen', 'te beoordelen']);
  const klaar = insp({ gebreken: insp().gebreken.map((g) => (g.id === 'g1' ? { ...g, maatregelStatus: 'uitgevoerd' } : g)) });
  assert.equal(K.bijwerken(kop(), [klaar], na, { nu: 'T3' }).gewijzigd.find((x) => x.id === 'i1:g1:k1').status, 'gedaan');
});

test('afgekeurd bij een eigen oordeelschaal en "niet in orde" bij een checklist tellen mee, ook zonder maatregel', () => {
  const schouw = insp({
    type: { methodiek: 'oordeel', schaal: [{ waarde: 1, label: 'Goedgekeurd' }, { waarde: 2, label: 'Afgekeurd' }] },
    gebreken: [{ id: 'a', bouwdeel: 'Berm', gebrek: 'Zwerfvuil', oordeel: 2 }, { id: 'b', bouwdeel: 'Berm', gebrek: 'Netjes', oordeel: 1 }],
  });
  assert.deepEqual(K.bevindingen(schouw).map((g) => g.id), ['a']);
  const r = K.bijwerken(kop(), [schouw], new Map(), { nu: 'T' }).nieuw;
  assert.deepEqual(r.map((x) => [x.id, x.momentopname.oordeel, x.momentopname.gebrek]), [['i1:a:k1', 'Afgekeurd', 'Zwerfvuil']]);
  // filter op oordeel
  assert.equal(K.bijwerken(kop({ filter: { oordelen: ['Matig'] } }), [schouw], new Map()).nieuw.length, 0);
  const check = insp({ type: { methodiek: 'checklist' }, gebreken: [{ id: 'c', checkpunt: 'Bord leesbaar', bouwdeel: 'Bord leesbaar' }] });
  assert.equal(K.bevindingen(check).length, 1);
  assert.equal(K.oordeelLabel(check, check.gebreken[0]), 'Niet in orde');
  // oude momentopname zonder oordeel: niet als "gewijzigd" zien
  const oud = { ...r[0], momentopname: { ...r[0].momentopname } };
  delete oud.momentopname.oordeel;
  assert.equal(K.bijwerken(kop(), [schouw], new Map([[oud.id, oud]]), { nu: 'T2' }).gewijzigd.length, 0);
});

test('diagnose: waarom komt iets niet door', () => {
  const i = (over) => insp({ ...over });
  const d = K.diagnose(kop({ vanaf: '2026-11-15', filter: { urgentieTot: 'direct' } }), [
    i({ id: 'w', beoordeling: { status: 'ingediend' } }), i({ id: 'x', beoordeling: { status: 'afgekeurd' } }),
    i({ id: 'c', status: 'concept' }), i({ id: 'oud', datum: '2026-11-01' }), i({ id: 'nieuw', datum: '2026-11-20' }),
  ]);
  assert.deepEqual(d, { wacht: 2, afgekeurd: 2, concept: 2, voorStart: 2, buitenFilter: 1, inspWacht: 1, inspAfgekeurd: 1 });
});

test('eigen vraag per bevinding als voorwaarde, formulieranalyse en proef', () => {
  const i = insp({ gebreken: [
    { id: 'v1', gebrek: 'Paal', extra: { herstel: true } },
    { id: 'v2', gebrek: 'Bord', extra: { herstel: false } },
    { id: 'v3', gebrek: 'Hek', extra: { actie: ['Vervangen', 'Schilderen'] } },
  ] });
  const k = kop({ filter: { vraag: { id: 'herstel', type: 'janee', waarden: ['Ja'] } } });
  assert.deepEqual(K.bijwerken(k, [i], new Map()).nieuw.map((x) => x.bron.gebrekId), ['v1']);
  assert.ok(K.vraagPast({ id: 'actie', type: 'meerkeuze', waarden: ['Vervangen'] }, ['Vervangen', 'Schilderen']));
  assert.ok(!K.vraagPast({ id: 'x', type: 'keuze', waarden: [] }, 'a'));
  // antwoord later op nee → werkpunt vervalt
  const eerst = new Map(K.bijwerken(k, [i], new Map(), { nu: 'T' }).nieuw.map((x) => [x.id, x]));
  const nee = insp({ gebreken: [{ id: 'v1', gebrek: 'Paal', extra: { herstel: false } }] });
  assert.equal(K.bijwerken(k, [nee], eerst, { nu: 'T2' }).gewijzigd[0].status, 'vervallen');

  const a = K.formulierAnalyse({ naam: 'Schouw BK', type: { methodiek: 'oordeel', schaal: [{ waarde: 1, label: 'Goed' }, { waarde: 2, label: 'Matig' }, { waarde: 3, label: 'Afgekeurd' }], gebreken: ['Onkruid'] }, vragen: [{ id: 'q', type: 'janee', label: 'Herstel?' }, { id: 't', type: 'tekst' }] });
  assert.deepEqual(a.oordelen, ['Matig', 'Afgekeurd']);
  assert.deepEqual(a.vragen.map((v) => v.id), ['q']);
  assert.match(a.regel, /"Goed" telt niet mee/);
  assert.equal(K.formulierAnalyse({ naam: 'X', type: { methodiek: 'checklist', punten: [] } }).waarschuwingen.length, 1);
  assert.equal(K.formulierAnalyse({ naam: 'Weg', type: null }).waarschuwingen.length, 1);
  assert.equal(K.formulierAnalyse({ protocol: 'bvc', bvcMaatregelen: ['Snoeien'] }).maatregelen[0], 'Snoeien');

  const p = K.proef(kop(), [insp(), insp({ id: 'i2', beoordeling: { status: 'ingediend' } })]);
  assert.deepEqual(p, { inspecties: 2, bevindingen: 6, tellen: 4, passend: 4, door: 2 });
});
