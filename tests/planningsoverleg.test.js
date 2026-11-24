import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as VO from '../js/voortgangsoverzicht.js';

test('nieuw overleg neemt deelnemers en de afgesproken datum over', () => {
  const vorige = { id: 'o1', nummer: 3, datum: '2026-11-10', tijd: '09:00', locatie: 'Keet', voorzitter: 'An', notulist: 'Bo', aanwezig: 'An, Bo, Cas',
    volgende: { datum: '2026-11-24', tijd: '10:00', locatie: 'Online' } };
  const o = VO.nieuwOverleg({ id: 'o2', vandaag: '2026-11-20', overleggen: [vorige] });
  assert.deepEqual([o.nummer, o.datum, o.tijd, o.locatie, o.voorzitter, o.aanwezig], [4, '2026-11-24', '10:00', 'Online', 'An', 'An, Bo, Cas']);
  const leeg = VO.nieuwOverleg({ id: 'x', vandaag: '2026-11-20' });
  assert.deepEqual([leeg.nummer, leeg.datum, leeg.acties.length], [1, '2026-11-20', 0]);
});

test('open acties uit eerdere overleggen, met de stand van later', () => {
  const o1 = { id: 'o1', nummer: 1, datum: '2026-10-01', acties: [{ id: 'a1', tekst: 'Borden bestellen', wie: 'Jan', gereed: '2026-10-15' }, { id: 'a2', tekst: 'Offerte', gereed: '2026-10-08' }] };
  const o2 = { id: 'o2', nummer: 2, datum: '2026-10-15', acties: [{ id: 'a3', tekst: 'Planning bijwerken' }], actieUpdates: { a2: { status: 'gereed' } } };
  const o3 = { id: 'o3', nummer: 3, datum: '2026-11-01', actieUpdates: { a1: { status: 'gereed', toelichting: 'Geleverd' } } };
  const lijst = VO.openActies([o1, o2, o3], o3);
  assert.deepEqual(lijst.map((x) => [x.actie.id, x.status, x.toelichting, x.overleg.id]), [['a1', 'gereed', 'Geleverd', 'o1'], ['a3', 'open', '', 'o2']]);
  // In het overleg daarna komt a1 niet meer terug
  assert.deepEqual(VO.openActies([o1, o2, o3], { id: 'o4', nummer: 4, datum: '2026-11-15' }).map((x) => x.actie.id), ['a3']);
});

test('indelen geeft de niet-ingeplande rondes terug; momentopname met sleutels', () => {
  const pakket = { id: 'p1', code: 'WP-1', naam: 'Maaien', rondes: [{}, {}] };
  const rondes = [
    { pakket, ronde: { id: 'r1', nummer: 1, naam: 'R1', start: '2026-11-01', eind: '2026-11-30', status: 'actief' }, vg: { totaal: 4, percentage: 25 }, code: 'WP-1-R1' },
    { pakket, ronde: { id: 'r2', nummer: 2, naam: 'R2', start: '', eind: '', status: 'gepland' }, vg: null, code: 'WP-1-R2' },
  ];
  const ind = VO.indelen({ rondes, taken: [{ id: 't1', titel: 'Snoeien', deadline: '2026-11-20' }], vandaag: '2026-11-24', weken: 4 });
  assert.equal(ind.nietIngepland, 1);
  assert.equal(ind.nietIngeplandLijst[0].code, 'WP-1-R2');
  const foto = VO.momentopname(ind, { titel: (r) => (r.soort === 'taak' ? r.taak.titel : r.code), sub: () => [], periode: () => '', stand: () => '', href: (r, plan) => (plan ? '#/planning' : '#x') });
  assert.deepEqual(foto.lopend.map((r) => [r.sleutel, r.voortgang]), [['r:p1:r1', 25]]);
  assert.deepEqual(foto.achterstallig.map((r) => [r.sleutel, r.stand]), [['t:t1', '4 dagen te laat']]);
  assert.deepEqual(foto.nietIngepland.map((r) => [r.sleutel, r.href]), [['r:p1:r2', '#/planning']]);
});
