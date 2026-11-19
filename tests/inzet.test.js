import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as IZ from '../js/inzet.js';

test('bestede uren: opschonen, totalen, tekst en controle', () => {
  const rijen = [
    { middel: 'Werknemer', omschrijving: 'Jan', aantal: '2', uren: '1,5' },
    { middel: 'Boot', omschrijving: '', aantal: '', uren: '2' },
    { middel: 'Auto / bus', omschrijving: '', aantal: 1, uren: '' },
    { middel: '', omschrijving: '', aantal: '', uren: '' },
  ];
  const n = IZ.normaliseer(rijen);
  assert.equal(n.length, 2);
  assert.deepEqual(n[0], { middel: 'Werknemer', omschrijving: 'Jan', aantal: 2, uren: 1.5 });
  assert.equal(n[1].aantal, 1);
  const t = IZ.totalen(rijen);
  assert.deepEqual([t.manuren, t.materieeluren, t.totaal], [3, 2, 5]);
  assert.equal(IZ.tekst(rijen), 'Werknemer (Jan) 2 × 1,5 u; Boot 1 × 2 u');
  assert.deepEqual(IZ.fouten(rijen), []);
  assert.equal(IZ.fouten([]).length, 1);
  assert.equal(IZ.fouten([{ middel: 'Boot', omschrijving: 'Waterboot 2', uren: '' }]).length, 1);
});
