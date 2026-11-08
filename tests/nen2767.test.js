import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  omvangKlasse, zwaarte, gebrekScore, inspectieScore, volgendeInspectie, planningStatus,
} from '../js/nen2767.js';

test('omvangklasse', () => {
  assert.equal(omvangKlasse(0), 1);
  assert.equal(omvangKlasse(1.9), 1);
  assert.equal(omvangKlasse(2), 2);
  assert.equal(omvangKlasse(15), 3);
  assert.equal(omvangKlasse(50), 4);
  assert.equal(omvangKlasse(100), 5);
  assert.equal(omvangKlasse('abc'), 1);
});

test('zwaarte combineert ernst en intensiteit', () => {
  assert.equal(zwaarte('gering', 1), 1);
  assert.equal(zwaarte('ernstig', 3), 5);
  assert.equal(zwaarte('onbekend', 9), 3);
});

test('gebrekscore loopt van 1 tot 6', () => {
  assert.equal(gebrekScore({ ernst: 'gering', intensiteit: 1, omvang: 1 }), 1);
  assert.equal(gebrekScore({ ernst: 'serieus', intensiteit: 1, omvang: 1 }), 2);
  assert.equal(gebrekScore({ ernst: 'serieus', intensiteit: 2, omvang: 5 }), 3);
  assert.equal(gebrekScore({ ernst: 'ernstig', intensiteit: 2, omvang: 5 }), 4);
  assert.equal(gebrekScore({ ernst: 'ernstig', intensiteit: 3, omvang: 15 }), 5);
  assert.equal(gebrekScore({ ernst: 'ernstig', intensiteit: 3, omvang: 80 }), 6);
});

test('handmatige conditie gaat voor', () => {
  assert.equal(gebrekScore({ ernst: 'gering', intensiteit: 1, omvang: 1, conditieHandmatig: 5 }), 5);
  assert.equal(gebrekScore({ ernst: 'gering', intensiteit: 1, omvang: 1, conditieHandmatig: '' }), 1);
});

test('inspectiescore is het maatgevende gebrek', () => {
  assert.equal(inspectieScore({ gebreken: [] }), 1);
  assert.equal(inspectieScore({
    gebreken: [
      { ernst: 'gering', intensiteit: 1, omvang: 1 },
      { ernst: 'ernstig', intensiteit: 3, omvang: 80 },
    ],
  }), 6);
});

test('volgende inspectie', () => {
  assert.equal(volgendeInspectie('2024-03-15', 6), '2030-03-15');
  assert.equal(volgendeInspectie('2024-02-29', 1), '2025-02-28');
  assert.equal(volgendeInspectie('2024-01-31', 0.5), '2024-07-31');
  assert.equal(volgendeInspectie('', 3), null);
});

test('planningstatus', () => {
  assert.equal(planningStatus('2026-01-01', '2026-02-01'), 'verlopen');
  assert.equal(planningStatus('2026-03-01', '2026-02-01'), 'binnenkort');
  assert.equal(planningStatus('2027-03-01', '2026-02-01'), 'gepland');
  assert.equal(planningStatus(null, '2026-02-01'), 'onbekend');
});
