import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as VO from '../js/voortgangsoverzicht.js';

const vg = (pct, totaal = 10) => ({ percentage: pct, totaal, gedaan: { size: Math.round((pct / 100) * totaal) }, overgeslagen: { size: 0 }, open: [] });
const r = (id, start, eind, extra = {}) => ({ pakket: { id: `p${id}`, naam: `Pakket ${id}`, code: `WP${id}` }, ronde: { id: `r${id}`, nummer: 1, start, eind, status: 'actief', ...extra }, vg: vg(extra.pct ?? 40), code: `WP${id}-R1` });

test('voortgangsoverzicht: achterstallig, lopend en binnen n weken', () => {
  const vandaag = '2026-11-20';
  const ind = VO.indelen({
    vandaag, weken: 2,
    rondes: [
      r(1, '2026-10-01', '2026-11-10'), // te laat
      r(2, '2026-11-01', '2026-11-30'), // lopend
      r(3, '2026-11-25', '2026-12-10'), // start binnen 2 weken
      r(4, '2027-01-10', '2027-01-20'), // te ver weg
      r(5, '2026-10-01', '2026-11-10', { status: 'afgerond' }), // klaar
      r(6, '2026-10-01', '2026-11-10', { pct: 100 }), // alles gedaan
      r(7, '', ''), // niet ingepland
    ],
    taken: [
      { id: 't1', titel: 'Leuning', deadline: '2026-11-15', status: 'open' },
      { id: 't2', titel: 'Klaar', deadline: '2026-11-15', status: 'gereed' },
      { id: 't3', titel: 'Later', deadline: '2027-03-01', status: 'open' },
    ],
  });
  assert.deepEqual(ind.achterstallig.map((x) => x.code || x.taak.id), ['WP1-R1', 't1']);
  assert.equal(ind.achterstallig[0].dagenTeLaat, 10);
  assert.deepEqual(ind.lopend.map((x) => x.code), ['WP2-R1']);
  assert.deepEqual(ind.komend.map((x) => x.code), ['WP3-R1']);
  assert.equal(ind.komend[0].startOver, 5);
  assert.equal(ind.nietIngepland, 1);
  assert.equal(ind.tot, '2026-12-04');
  assert.equal(VO.standTekst(ind.achterstallig[0]), '10 dagen te laat');
  assert.equal(VO.standTekst(ind.komend[0]), 'start over 5 dagen');
  assert.match(VO.standTekst(ind.lopend[0]), /verwacht \d+%/);
  // Met meer weken vooruit komt ook de ronde in januari mee.
  assert.equal(VO.indelen({ vandaag, weken: 12, rondes: [r(4, '2027-01-10', '2027-01-20')] }).komend.length, 1);
});
