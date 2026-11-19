import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/storingen.js';

test('storingenregister: kantoor-meldingen en veldregistraties tot zaken met status', () => {
  const meldingen = [
    { id: 'm1', objectId: 'o1', type: 'Storing', melding: 'Slagboom', referentie: 'MLD-1', urgentie: 'direct', gemeldOp: '2026-11-18T08:00', toegewezenAan: 'jan@x.nl' },
    { id: 'm2', objectId: 'o2', type: 'Gebrek', melding: 'Losse tegel', urgentie: 'week', gemeldOp: '2026-11-17T08:00' },
    { id: 'm3', objectId: 'o3', type: 'Storing', melding: 'Lamp', urgentie: 'normaal', gemeldOp: '2026-11-16T08:00' },
    { id: 'm4', objectId: 'o4', type: 'Storing', melding: 'Dubbel', vervallen: true },
  ];
  const werk = [
    { id: 'w1', objectId: 'o2', datum: '2026-11-18', storing: { meldingId: 'm2', resultaat: 'tijdelijk', opgelostOp: '2026-11-18T10:00', inzet: [{ middel: 'Werknemer', aantal: 1, uren: 2 }] } },
    { id: 'w2', objectId: 'o3', datum: '2026-11-18', storing: { meldingId: 'm3', resultaat: 'opgelost', opgelostOp: '2026-11-18T11:00' } },
    { id: 'w3', objectId: 'o5', datum: '2026-11-19', uitvoerder: 'Piet', storing: { type: 'Calamiteit', melding: 'Boom op pad', referentie: 'R-9', resultaat: 'niet', opgelostOp: '2026-11-19T09:00' } },
    { id: 'w4', objectId: 'o5', datum: '2026-11-19', storing: { zaakId: 'w3', resultaat: 'opgelost', opgelostOp: '2026-11-19T15:00', inzet: [{ middel: 'Boot', aantal: 1, uren: 1.5 }] } },
    { id: 'w5', objectId: 'o6', datum: '2026-11-19', storing: { type: 'Storing', melding: 'Pomp', resultaat: 'tijdelijk', opgelostOp: '2026-11-19T07:00' } },
  ];
  const z = S.zaken({ meldingen, werk });
  const per = Object.fromEntries(z.map((x) => [x.id, x]));
  assert.deepEqual([per.m1.status, per.m2.status, per.m3.status, per.m4.status, per.w3.status, per.w5.status], ['open', 'bezig', 'opgelost', 'vervallen', 'opgelost', 'bezig']);
  assert.equal(z.length, 6); // w4 hoort bij zaak w3
  assert.equal(per.w3.acties.length, 2);
  assert.equal(per.w3.bron, 'veld');
  assert.equal(per.w3.referentie, 'R-9');
  assert.equal(per.w3.uren.materieeluren, 1.5);
  assert.equal(per.m2.uren.manuren, 2);
  assert.deepEqual(z.map((x) => x.id).slice(0, 3), ['m1', 'm2', 'w5']); // open eerst, dan bezig (op urgentie)
  assert.deepEqual(S.voorBuiten(z, 'piet@x.nl').map((x) => x.id), ['m2', 'w5']); // m1 is aan Jan toegewezen
  assert.deepEqual(S.voorBuiten(z, 'jan@x.nl').map((x) => x.id), ['m1', 'm2', 'w5']);
  assert.deepEqual(S.telling(z), { open: 1, bezig: 2, opgelost: 2, vervallen: 1 });
});

test('storingenregister: twee registraties in dezelfde minuut – volgorde op vastleggen', () => {
  const werk = [
    { id: 'b', objectId: 'o', datum: '2026-11-19', aangemaakt: '2026-11-19T14:55:40Z', storing: { zaakId: 'a', resultaat: 'opgelost', opgelostOp: '2026-11-19T14:55' } },
    { id: 'a', objectId: 'o', datum: '2026-11-19', aangemaakt: '2026-11-19T14:55:10Z', storing: { type: 'Storing', melding: 'x', resultaat: 'tijdelijk', opgelostOp: '2026-11-19T14:55' } },
  ];
  const [z] = S.zaken({ werk });
  assert.deepEqual(z.acties.map((x) => x.id), ['a', 'b']);
  assert.equal(z.status, 'opgelost');
});
