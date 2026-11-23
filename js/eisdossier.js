// Verificatiedossier als Excel: samenvatting, eisen, bewijs (alle antwoorden) en afwijkingen over een gekozen periode.
// Puur: ExcelJS en de opmaak van antwoorden/registraties komen van de aanroeper.

export const STATUS_LABEL = {
  geverifieerd: 'Geverifieerd', afwijking: 'Afwijking', 'nog niet geverifieerd': 'Nog niet geverifieerd', 'niet in formulier': 'Niet in een formulier',
};
export const STATUS_KLEUR = { geverifieerd: '1A7F37', afwijking: 'C62828', 'nog niet geverifieerd': 'E8710A', 'niet in formulier': '6B7785' };

export const EISEN_KOLOMMEN = [['Eisnummer', 14], ['Contractstuk', 18], ['Eistekst', 50], ['Eisvraag', 40], ['Gewenst antwoord', 18], ['Formulier', 20], ['Antwoorden', 11],
  ['Voldoet', 9], ['Voldoet niet', 9], ['Zonder norm', 9], ['Eerste', 12, 'datum'], ['Laatst', 12, 'datum'], ['Verificatie', 20]];
export const BEWIJS_KOLOMMEN = [['Eisnummer', 14], ['Eisvraag', 40], ['Gewenst antwoord', 18], ['Datum', 12, 'datum'], ['Objectcode', 14], ['Object', 26], ['Werkpakket', 26],
  ['Ronde', 16], ['Formulier', 18], ['Door', 20], ['Gegeven antwoord', 30], ['Uitkomst', 13], ['Toelichting', 40], ['Registratie-id', 22]];
const UITKOMST_KOLOM = BEWIJS_KOLOMMEN.findIndex(([h]) => h === 'Uitkomst') + 1;

const datum = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? '') ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`) : null);
export const UITKOMST = { ja: 'Voldoet', nee: 'Voldoet niet', overig: 'Ingevuld' };

/** Bewijsregel (waarden) voor één antwoord. */
export function bewijsRegel(x, eis, { info, tekst, gewenst = () => '' }) {
  const i = info(x.r);
  return [eis.nummer, eis.vraag, gewenst(eis, x.veld), datum(x.r.datum), i.objectcode, i.object, i.pakket, i.ronde, i.formulier, i.door, tekst(x.veld, x.waarde),
    UITKOMST[x.uitkomst], i.toelichting, x.r.id];
}

/**
 * @param {any} ExcelJS
 * @param {ReturnType<import('./eisen.js').dossier>} d
 * @param {{ project: string, opdrachtgever?: string, periode: string, bron?: string, door?: string }} meta
 * @param {{ info: (r) => object, tekst: (veld, waarde) => string }} fmt
 */
export function maakDossierWerkboek(ExcelJS, d, meta, fmt) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inspectie & Registratie';
  wb.created = new Date();
  const kop = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4F6C' } }, alignment: { vertical: 'middle', wrapText: true } };
  const kleurCel = (c, hex) => { c.font = { bold: true, color: { argb: `FF${hex}` } }; };

  const s = wb.addWorksheet('Samenvatting', { properties: { tabColor: { argb: 'FF0B4F6C' } } });
  s.columns = [{ width: 34 }, { width: 18 }, { width: 50 }];
  s.addRow(['Verificatiedossier contracteisen']).font = { bold: true, size: 14 };
  s.addRow(['Project', meta.project]);
  if (meta.opdrachtgever) s.addRow(['Opdrachtgever', meta.opdrachtgever]);
  s.addRow(['Periode', meta.periode]);
  for (const [k, v] of meta.selectie ?? []) s.addRow([k, v]);
  if (meta.bron) s.addRow(['Eisenbestand', meta.bron]);
  s.addRow(['Opgesteld op', new Date().toLocaleString('nl-NL')]);
  if (meta.door) s.addRow(['Opgesteld door', meta.door]);
  s.addRow([]);
  const k = s.addRow(['Verificatie', 'Aantal eisen']);
  k.eachCell((c) => { c.style = kop; });
  s.addRow(['Eisen in de bibliotheek', d.tel.totaal]);
  for (const st of Object.keys(STATUS_LABEL)) kleurCel(s.addRow([STATUS_LABEL[st], d.tel[st]]).getCell(1), STATUS_KLEUR[st]);
  s.addRow([]);
  s.addRow(['Antwoorden in de periode', d.antwoorden]);
  s.addRow(['Registraties met eisvragen', d.registraties]);
  const a = s.addRow(['Afdekking (bevraagd / in formulier)', d.afdekking]);
  a.getCell(2).numFmt = '0%';
  s.addRow([]);
  for (const t of ['Bladen:', '• Eisen – per eis de verificatiestatus in deze periode.', '• Bewijs – alle antwoorden op eisvragen, één regel per antwoord.',
    '• Afwijkingen – antwoorden die niet voldoen aan het gewenste antwoord van de eis.',
    'Uitkomst: Voldoet / Voldoet niet = vergeleken met het gewenste antwoord van de eis; Ingevuld = geen norm (bijv. een foto of vrije tekst).']) s.addRow([t]);

  const blad = (naam, kolommen, rijen, tab, kleurKolom) => {
    const ws = wb.addWorksheet(naam, { views: [{ state: 'frozen', ySplit: 1 }], properties: tab ? { tabColor: { argb: tab } } : {} });
    ws.columns = kolommen.map(([h, w]) => ({ header: h, width: w }));
    ws.getRow(1).eachCell((c) => { c.style = kop; });
    ws.getRow(1).height = 30;
    for (const { waarden, kleur } of rijen) {
      const row = ws.addRow(waarden);
      row.alignment = { vertical: 'top', wrapText: true };
      if (kleur && kleurKolom) kleurCel(row.getCell(kleurKolom), kleur);
    }
    kolommen.forEach(([, , soort], n) => { if (soort === 'datum') ws.getColumn(n + 1).numFmt = 'dd-mm-yyyy'; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + rijen.length, column: kolommen.length } };
  };
  blad('Eisen', EISEN_KOLOMMEN, d.ver.map((x) => ({
    waarden: [x.eis.nummer, x.eis.bron, x.eis.tekst, x.eis.vraag, fmt.gewenst?.(x.eis, x.velden[0]) ?? '', [...new Set(x.velden.map((v) => fmt.formulier?.(v) ?? v.formulier))].join(', '),
      x.antwoorden, x.ja, x.nee, x.overig, datum(x.items[0]?.r.datum), datum(x.laatste), STATUS_LABEL[x.status]],
    kleur: STATUS_KLEUR[x.status],
  })), 'FF1A7F37', EISEN_KOLOMMEN.length);
  blad('Bewijs', BEWIJS_KOLOMMEN, d.ver.flatMap((x) => x.items.map((i) => ({ waarden: bewijsRegel(i, x.eis, fmt), kleur: i.uitkomst === 'nee' ? STATUS_KLEUR.afwijking : i.uitkomst === 'ja' ? STATUS_KLEUR.geverifieerd : '' }))),
    '', UITKOMST_KOLOM);
  blad('Afwijkingen', BEWIJS_KOLOMMEN, d.afwijkingen.map((i) => ({ waarden: bewijsRegel(i, i.eis, fmt), kleur: STATUS_KLEUR.afwijking })), 'FFC62828', UITKOMST_KOLOM);
  return wb;
}
