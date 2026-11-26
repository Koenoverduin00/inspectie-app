import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/rapport.js';

const d = {
  soort: 'werk', titel: 'Werkregistratie', ondertitel: 'Maaien · 3 nov 2026', project: { naam: 'Park Zuid', opdrachtgever: 'Gemeente' },
  object: { velden: [['Code', 'GV-001'], ['Naam', 'Gazon noord']], gis: [['BEHEERTYPE', 'Gazon']] },
  status: 'Gereed', registratie: [['Datum', '3 nov 2026'], ['Uitvoerder', 'P. Jansen']],
  omschrijving: [{ titel: 'Omschrijving', tekst: 'Gemaaid.' }],
  fotos: [{ titel: "Foto's vóór", items: [{ data: 'data:image/png;base64,AAA', onderschrift: '3 nov' }] }],
  systeem: [['Registratie-id', 'w1']], uitvoerder: 'P. Jansen',
  meta: { object: 'GV-001', kenmerk: 'w1', trefwoorden: ['GV-001', 'Maaien'] },
};
const tekstIn = (x) => JSON.stringify(x);

test('standaardsjabloon: systeem en locatie standaard uit', () => {
  const s = R.standaardSoort('werk');
  assert.equal(s.titel, 'Werkregistratie');
  assert.ok(s.blokken.find((b) => b.id === 'fotos').aan);
  assert.ok(!s.blokken.find((b) => b.id === 'systeem').aan);
  assert.ok(!s.blokken.some((b) => b.id === 'bevindingen'));
  assert.ok(R.standaardSoort('inspectie').blokken.some((b) => b.id === 'bevindingen'));
});

test('sjabloon: eigen keuze, nieuwe blokken erachter (uit), onbekende weg, tekstblokken blijven', () => {
  const eigen = { algemeen: { kleur: '#aa0000' }, soorten: { werk: { titel: 'Werkbon', blokken: [
    { id: 'fotos', aan: true, titel: 'Beeld', opties: { grootte: 'groot' } }, { id: 'tekst:1', aan: true, titel: 'Disclaimer', opties: { tekst: 'Onder voorbehoud.' } },
    { id: 'bevindingen', aan: true }, { id: 'bestaatniet', aan: true }] } } };
  const s = R.sjabloon(eigen, 'werk');
  assert.equal(s.titel, 'Werkbon');
  assert.equal(s.algemeen.kleur, '#aa0000');
  assert.equal(s.algemeen.paginanummers, true);
  assert.deepEqual(s.blokken.slice(0, 2).map((b) => b.id), ['fotos', 'tekst:1']);
  assert.equal(s.blokken[0].opties.onderschrift, true);
  assert.equal(s.blokken[0].opties.grootte, 'groot');
  assert.ok(!s.blokken.some((b) => b.id === 'bevindingen' || b.id === 'bestaatniet'));
  assert.equal(s.blokken.find((b) => b.id === 'object').aan, false);
  assert.equal(R.sjabloon(null, 'vrijgave').blokken.some((b) => b.id === 'object'), false);
});

test('bestandsnaam', () => {
  assert.equal(R.bestandsnaam('{project}_{object}_{soort}_{datum}', { project: 'Park Zuid', object: 'KW-001', soort: 'Inspectierapport', datum: '2026-11-26' }), 'Park_Zuid_KW-001_Inspectierapport_2026-11-26.pdf');
  assert.equal(R.bestandsnaam('{object}-{onbekend}', { object: 'Brug é/1' }), 'Brug_e_1.pdf');
  assert.equal(R.bestandsnaam('', { project: 'P' }, 'json'), 'P.json');
  assert.equal(R.bestandsnaam('{x}', {}), 'rapport.pdf');
});

test('documentDefinitie: blokken aan/uit en metadata', () => {
  const s = R.sjabloon(null, 'werk');
  const dd = R.documentDefinitie(d, s, { vandaag: '2026-11-26' });
  const t = tekstIn(dd.content);
  assert.ok(t.includes('GV-001') && t.includes('Gemaaid.') && t.includes('data:image/png'));
  assert.ok(!t.includes('Registratie-id'), 'systeemblok staat standaard uit');
  assert.equal(dd.info.title, 'Werkregistratie GV-001');
  assert.equal(dd.info.keywords, 'GV-001, Maaien');
  assert.equal(dd.header, undefined);
  assert.equal(dd.footer(1, 3).columns.at(-1).text, 'Pagina 1 van 3');
  // fotos uit, systeem aan, eigen tekstblok
  const s2 = { ...s, algemeen: { ...s.algemeen, organisatie: 'Groen bv', voettekst: 'Vertrouwelijk' }, blokken: [
    ...s.blokken.map((b) => (b.id === 'fotos' ? { ...b, aan: false } : b.id === 'systeem' ? { ...b, aan: true } : b)),
    { id: 'tekst:x', aan: true, titel: 'Voorwaarden', opties: { tekst: 'Conform bestek.' } }] };
  const dd2 = R.documentDefinitie(d, s2, { vandaag: '2026-11-26' });
  const t2 = tekstIn(dd2.content);
  assert.ok(!t2.includes('data:image/png'));
  assert.ok(t2.includes('Registratie-id') && t2.includes('Conform bestek.'));
  assert.ok(dd2.header && tekstIn(dd2.header()).includes('Groen bv'));
  assert.ok(tekstIn(dd2.footer(1, 1)).includes('Vertrouwelijk'));
});

test('documentDefinitie: bevindingen met en zonder kosten', () => {
  const di = { ...d, soort: 'inspectie', bevindingen: { kolommen: ['#', 'Bouwdeel', 'Raming'], rijen: [['1', 'Leuning', '€ 4.500']], kostenKolom: 2, totaal: ['Totaal raming', '€ 4.500'] } };
  const s = R.sjabloon(null, 'inspectie');
  assert.ok(tekstIn(R.documentDefinitie(di, s).content).includes('Totaal raming'));
  const zonder = { ...s, blokken: s.blokken.map((b) => (b.id === 'bevindingen' ? { ...b, opties: { kosten: false } } : b)) };
  const t = tekstIn(R.documentDefinitie(di, zonder).content);
  assert.ok(!t.includes('Raming') && !t.includes('€ 4.500'));
});

test('gegevensJson: zonder foto-data', () => {
  const j = R.gegevensJson(d, { gemaakt: '2026-11-26T10:00:00Z' });
  assert.equal(j.formaat, 'baasoverbuiten-registratie/1');
  assert.equal(j.object.Code, 'GV-001');
  assert.equal(j.kenmerken['Registratie-id'], 'w1');
  assert.deepEqual(j.fotos, [{ titel: "Foto's vóór", aantal: 1 }]);
  assert.ok(!JSON.stringify(j).includes('base64'));
});
