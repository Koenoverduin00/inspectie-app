import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/eisen.js';
import * as ED from '../js/eisdossier.js';

const eisen = [
  { nummer: 'EIS-1', tekst: 'Gras max 10 cm', vraag: 'Gras lager dan 10 cm?', type: 'janee', opties: [], bron: 'Bestek' },
  { nummer: 'EIS-2', tekst: 'Beeldkwaliteit', vraag: 'Welke beeldkwaliteit?', type: 'keuze', opties: ['A', 'B'], bron: '' },
  { nummer: 'EIS-3', tekst: 'Afzetting', vraag: 'Afzetting goed?', type: 'janee', opties: [], bron: '' },
  { nummer: 'EIS-4', tekst: 'Niet in formulier', vraag: 'x?', type: 'janee', opties: [], bron: '' },
];
const defs = [E.naarVeld(eisen[0], 'werk', 'v1'), E.naarVeld(eisen[1], 'werk', 'v2'), E.naarVeld(eisen[2], 'inspectie', 'v3')];
const regs = [
  { id: 'a', datum: '2025-12-30', extra: { v1: false } },
  { id: 'b', datum: '2026-03-01', extra: { v1: true, v2: 'A' } },
  { id: 'c', datum: '2026-06-10', extra: { v1: false, v2: 'B' } },
  { id: 'd', datum: '2027-01-02', extra: { v3: true } },
  { id: 'e', datum: '', extra: { v3: true } },
];

test('periode: filtert op datum, grenzen inbegrepen, jaren', () => {
  assert.deepEqual(E.inPeriode(regs, '2026-01-01', '2026-12-31').map((r) => r.id), ['b', 'c']);
  assert.deepEqual(E.inPeriode(regs, '2026-06-10', '').map((r) => r.id), ['c', 'd']);
  assert.deepEqual(E.inPeriode(regs, '', '').map((r) => r.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(E.jaren(regs, '2028'), [2028, 2027, 2026, 2025]);
});

test('dossier: status en bewijs per periode', () => {
  const d = E.dossier({ eisen, defs, registraties: regs, van: '2026-01-01', tot: '2026-12-31' });
  assert.deepEqual(d.ver.map((x) => x.status), ['afwijking', 'geverifieerd', 'nog niet geverifieerd', 'niet in formulier']);
  assert.deepEqual(d.tel, { totaal: 4, geverifieerd: 1, afwijking: 1, 'nog niet geverifieerd': 1, 'niet in formulier': 1 });
  assert.equal(d.antwoorden, 4);
  assert.equal(d.registraties, 2);
  assert.equal(Math.round(d.afdekking * 100), 67);
  assert.deepEqual(d.afwijkingen.map((x) => [x.eis.nummer, x.r.id]), [['EIS-1', 'c']]);
  assert.deepEqual(d.ver[0].items.map((x) => [x.r.id, x.uitkomst]), [['b', 'ja'], ['c', 'nee']]);
  // in 2027 is alleen EIS-3 bevraagd
  const d27 = E.dossier({ eisen, defs, registraties: regs, van: '2027-01-01', tot: '2027-12-31' });
  assert.deepEqual(d27.ver.map((x) => x.status), ['nog niet geverifieerd', 'nog niet geverifieerd', 'geverifieerd', 'niet in formulier']);
  // bewijsregel
  const fmt = { info: () => ({ objectcode: 'O1', object: 'Park', pakket: 'WP', ronde: 'R1', formulier: 'Werk', door: 'Jan', toelichting: '' }), tekst: (v, w) => String(w) };
  const regel = ED.bewijsRegel(d.ver[0].items[1], eisen[0], fmt);
  assert.equal(regel[0], 'EIS-1');
  assert.equal(regel[10], 'Nee');
  assert.equal(regel.length, ED.BEWIJS_KOLOMMEN.length);
});

test('werkpakketnaam met code ervoor', async () => {
  const { metCode } = await import('../js/pakketten.js');
  assert.equal(metCode({ code: 'WP-1', naam: 'Maaien' }), 'WP-1 Maaien');
  assert.equal(metCode({ code: 'WP-1', naam: 'WP-1 Maaien' }), 'WP-1 Maaien');
  assert.equal(metCode({ code: '', naam: 'Maaien' }), 'Maaien');
  assert.equal(metCode({ code: 'WP-1', naam: '' }), 'WP-1');
});
