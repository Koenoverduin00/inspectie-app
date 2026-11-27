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

test('storingen-export: rijen per zaak, registratie en bestede uren', async () => {
  const SX = await import('../js/storingenexcel.js');
  const z = S.zaken({
    meldingen: [{ id: 'm1', objectId: 'o1', type: 'Storing', melding: 'Slagboom', referentie: 'MLD-1', urgentie: 'direct', gemeldOp: '2026-11-18T08:00', opmerking: 'Sleutel' }],
    werk: [
      { id: 'w1', objectId: 'o1', datum: '2026-11-18', uitvoerder: 'Jan', omschrijving: 'Gereset', vervolg: 'Motor', storing: { meldingId: 'm1', resultaat: 'tijdelijk', opgelostOp: '2026-11-18T09:30', inzet: [{ middel: 'Werknemer', omschrijving: 'Jan', aantal: 2, uren: 1 }] } },
      { id: 'w2', objectId: 'o1', datum: '2026-11-18', uitvoerder: 'Piet', omschrijving: 'Motor vervangen', storing: { meldingId: 'm1', resultaat: 'opgelost', opgelostOp: '2026-11-18T14:00', inzet: [{ middel: 'Boot', aantal: 1, uren: 1.5 }] } },
    ],
  });
  const fmt = { object: () => ({ code: 'KW-1', naam: 'Brug' }), naam: (e) => e ?? '', resultaat: (k) => k, beoordeling: () => 'Ingediend' };
  const r = SX.rijen(z, fmt);
  assert.equal(r.zaakRijen.length, 1);
  const zr = r.zaakRijen[0].waarden;
  const kol = (naam) => zr[SX.ZAAK_KOLOMMEN.findIndex(([k]) => k === naam)];
  assert.equal(kol('Referentie opdrachtgever'), 'MLD-1');
  assert.equal(kol('Status'), 'Opgelost');
  assert.equal(kol('Doorlooptijd (uur)'), 6); // 08:00 → 14:00
  assert.deepEqual([kol('Manuren'), kol('Materieeluren'), kol('Totaal uren')], [2, 1.5, 3.5]);
  assert.equal(r.regRijen.length, 2);
  assert.equal(r.inzetRijen.length, 2);
  assert.equal(r.inzetRijen[0].waarden[SX.INZET_KOLOMMEN.findIndex(([k]) => k === 'Totaal uren')], 2);
  assert.equal(r.regRijen[0].waarden.length, SX.REG_KOLOMMEN.length);
  assert.equal(SX.doorlooptijdUren('2026-11-18T08:00', '2026-11-18T07:00'), '');
  assert.equal(zr.length, SX.ZAAK_KOLOMMEN.length);
});

test('registernummer: opbouw, volgnummer per project en jaar, bijwerken en ontdubbelen', () => {
  assert.equal(S.projectAfkorting({ naam: 'Onderhoud Park Zuid 2026' }), 'OPZ');
  assert.equal(S.projectAfkorting({ naam: 'X', code: 'pz-01' }), 'PZ01');
  assert.equal(S.projectAfkorting({ naam: 'Gemeente', registerAfkorting: 'gem' }), 'GEM');
  assert.equal(S.projectAfkorting({ naam: 'Brug' }), 'BRU');
  assert.equal(S.soortLetter('Gebrek'), 'G');
  assert.equal(S.soortLetter('Melding (burger of klant)'), 'M');
  assert.equal(S.nieuwNummer({ afkorting: 'OPZ', type: 'Storing', datum: '2026-11-27', bestaande: [] }), 'OPZ-S26-0001');
  assert.equal(S.nieuwNummer({ afkorting: 'OPZ', type: 'Gebrek', datum: '2026-11-27', bestaande: ['OPZ-S26-0007', 'OPZ-G25-0099', 'ANDER-S26-0050'] }), 'OPZ-G26-0008');
  assert.deepEqual(S.ontleed('OPZ-G26-0008'), { afk: 'OPZ', letter: 'G', jj: '26', nr: 8 });
  const zaken = [
    { id: 'a', type: 'Storing', gemeldOp: '2026-11-01T08:00', nummer: 'OPZ-S26-0001' },
    { id: 'b', type: 'Gebrek', gemeldOp: '2026-11-02T08:00', nummer: 'OPZ-S26-0001' },
    { id: 'c', type: 'Gebrek', gemeldOp: '2026-11-03T08:00', nummer: '' },
  ];
  assert.deepEqual(S.nummersBijwerken(zaken, 'OPZ'), [{ id: 'b', nummer: 'OPZ-G26-0002' }, { id: 'c', nummer: 'OPZ-G26-0003' }]);
});

test('zaken: nummer en werkpakket uit melding of registratie', () => {
  const z = S.zaken({ meldingen: [{ id: 'm', objectId: 'o', nummer: 'X-S26-0001', pakketId: 'P1', melding: 'x' }], werk: [{ id: 'w', objectId: 'o', werkpakketId: 'P2', storing: { type: 'Storing', nummer: 'X-S26-0002' } }] });
  assert.deepEqual(z.map((x) => [x.nummer, x.pakketId]).sort(), [['X-S26-0001', 'P1'], ['X-S26-0002', 'P2']]);
});
