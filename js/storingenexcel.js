// Export van het storingen- en gebrekenregister naar Excel: per zaak, per registratie en per regel bestede uren.
// Puur: ExcelJS en de opmaak (objecten, labels) komen van de aanroeper.
import * as IZ from './inzet.js';
import * as SR from './storingen.js';

const datumTijd = (v) => {
  const s = String(v ?? '');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return new Date(`${s.slice(0, 16)}:00Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00Z`);
  return null;
};
/** Uren tussen twee lokale tijdstippen (datetime-local), afgerond op 0,1; leeg als onbekend. */
export function doorlooptijdUren(van, tot) {
  const a = datumTijd(van);
  const b = datumTijd(tot);
  if (!a || !b || b < a) return '';
  return Math.round(((b - a) / 3600000) * 10) / 10;
}

export const ZAAK_KOLOMMEN = [['Nummer', 15], ['Referentie opdrachtgever', 18], ['Status', 14], ['Urgentie', 13], ['Objectcode', 13], ['Object', 26], ['Soort', 14],
  ['Melding', 44], ['Gemeld vanuit werkpakket', 30], ['Gemeld om', 16, 'dt'], ['Herkomst', 12], ['Gemeld / klaargezet door', 22], ['Toegewezen aan', 20], ['Instructie', 30],
  ['Registraties', 11], ['Laatste registratie', 16, 'dt'], ['Laatste resultaat', 24], ['Vervolg nodig', 30], ['Opgelost om', 16, 'dt'],
  ['Doorlooptijd (uur)', 12, 'getal'], ['Manuren', 10, 'getal'], ['Materieeluren', 12, 'getal'], ['Totaal uren', 11, 'getal']];
export const REG_KOLOMMEN = [['Nummer', 15], ['Referentie opdrachtgever', 18], ['Objectcode', 13], ['Object', 26], ['Opgelost / gestopt om', 18, 'dt'], ['Uitvoerder', 20],
  ['Resultaat', 24], ['Wat is gedaan', 40], ['Vervolg nodig', 30], ['Beoordeling', 13], ['Bestede uren', 40], ['Manuren', 10, 'getal'],
  ['Materieeluren', 12, 'getal'], ['Registratie-id', 22]];
export const INZET_KOLOMMEN = [['Nummer', 15], ['Referentie opdrachtgever', 18], ['Objectcode', 13], ['Datum', 16, 'dt'], ['Uitvoerder', 20], ['Wat', 18], ['Wie / welke', 22],
  ['Aantal', 8, 'getal'], ['Uren', 8, 'getal'], ['Totaal uren', 11, 'getal']];

/**
 * @param {ReturnType<typeof SR.zaken>} zaken
 * @param {{ object: (id) => object, naam: (email) => string, resultaat: (k) => string, beoordeling: (r) => string }} fmt
 */
export function rijen(zaken, fmt) {
  const zaakRijen = [];
  const regRijen = [];
  const inzetRijen = [];
  for (const z of zaken) {
    const o = fmt.object(z.objectId) ?? {};
    const l = z.laatste;
    zaakRijen.push({
      waarden: [z.nummer ?? '', z.referentie, SR.STATUS[z.status].label, SR.URGENTIE_LABEL[z.urgentie] ?? '', o.code ?? '', o.naam ?? '', z.type, z.omschrijving, fmt.pakket?.(z.pakketId) ?? '',
        datumTijd(z.gemeldOp), z.bron === 'kantoor' ? 'Kantoor' : 'Buiten', fmt.naam(z.door), fmt.naam(z.toegewezenAan), z.melding?.opmerking ?? '',
        z.acties.length, datumTijd(l?.storing?.opgelostOp || l?.datum), l ? fmt.resultaat(l.storing?.resultaat) : '', l?.storing?.resultaat !== 'opgelost' ? (l?.vervolg ?? '') : '',
        datumTijd(z.opgelostOp), z.opgelostOp ? doorlooptijdUren(z.gemeldOp, z.opgelostOp) : '', z.uren.manuren || '', z.uren.materieeluren || '', z.uren.totaal || ''],
      status: z.status,
    });
    for (const a of z.acties) {
      const t = IZ.totalen(a.storing?.inzet);
      regRijen.push({
        waarden: [z.nummer ?? '', z.referentie, o.code ?? '', o.naam ?? '', datumTijd(a.storing?.opgelostOp || a.datum), a.uitvoerder ?? '', fmt.resultaat(a.storing?.resultaat),
          a.omschrijving ?? '', a.vervolg ?? '', fmt.beoordeling(a), IZ.tekst(a.storing?.inzet), t.manuren || '', t.materieeluren || '', a.id],
        status: a.storing?.resultaat === 'opgelost' ? 'opgelost' : 'bezig',
      });
      for (const r of IZ.normaliseer(a.storing?.inzet)) {
        inzetRijen.push({ waarden: [z.nummer ?? '', z.referentie, o.code ?? '', datumTijd(a.storing?.opgelostOp || a.datum), a.uitvoerder ?? '', r.middel, r.omschrijving, r.aantal, r.uren, Math.round(r.aantal * r.uren * 100) / 100] });
      }
    }
  }
  return { zaakRijen, regRijen, inzetRijen };
}

const KLEUR = { open: 'FFE8710A', bezig: 'FFB8860B', opgelost: 'FF1A7F37', vervallen: 'FF6B7785' };

export function maakWerkboek(ExcelJS, zaken, meta, fmt) {
  const { zaakRijen, regRijen, inzetRijen } = rijen(zaken, fmt);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BaasOverBuiten';
  wb.created = new Date();
  const kop = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4F6C' } }, alignment: { vertical: 'middle', wrapText: true } };
  const blad = (naam, kolommen, lijst, statusKolom) => {
    const ws = wb.addWorksheet(naam, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = kolommen.map(([h, w]) => ({ header: h, width: w }));
    ws.getRow(1).eachCell((c) => { c.style = kop; });
    ws.getRow(1).height = 30;
    for (const r of lijst) {
      const row = ws.addRow(r.waarden);
      row.alignment = { vertical: 'top', wrapText: true };
      if (statusKolom && r.status) row.getCell(statusKolom).font = { bold: true, color: { argb: KLEUR[r.status] ?? 'FF333333' } };
    }
    kolommen.forEach(([, , soort], n) => {
      if (soort === 'dt') ws.getColumn(n + 1).numFmt = 'dd-mm-yyyy hh:mm';
      if (soort === 'getal') ws.getColumn(n + 1).numFmt = '0.##';
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + lijst.length, column: kolommen.length } };
    return ws;
  };
  const s = wb.addWorksheet('Overzicht', { properties: { tabColor: { argb: 'FF0B4F6C' } } });
  s.columns = [{ width: 30 }, { width: 50 }];
  s.addRow(['Storingen- en gebrekenregister']).font = { bold: true, size: 14 };
  s.addRow(['Project', meta.project]);
  s.addRow(['Selectie', meta.selectie]);
  s.addRow(['Gemaakt op', new Date().toLocaleString('nl-NL')]);
  s.addRow([]);
  const tel = SR.telling(zaken);
  for (const [k, l] of [['open', 'Open'], ['bezig', 'In behandeling'], ['opgelost', 'Opgelost'], ['vervallen', 'Vervallen']]) s.addRow([l, tel[k]]);
  s.addRow(['Totaal', zaken.length]).font = { bold: true };
  const uren = IZ.totalen(zaken.flatMap((z) => z.acties.flatMap((a) => a.storing?.inzet ?? [])));
  s.addRow([]);
  s.addRow(['Manuren', uren.manuren]);
  s.addRow(['Materieeluren', uren.materieeluren]);
  s.addRow([]);
  for (const t of ['Bladen:', '• Register – één regel per storing of gebrek (zaak), met status, doorlooptijd en uren.',
    '• Registraties – alle registraties (ook tijdelijk opgelost en vervolg), één regel per registratie.',
    '• Bestede uren – elke regel uit de tabel Bestede uren (werknemer, auto, boot, …).']) s.addRow([t]);
  blad('Register', ZAAK_KOLOMMEN, zaakRijen, 2);
  blad('Registraties', REG_KOLOMMEN, regRijen, 6);
  blad('Bestede uren', INZET_KOLOMMEN, inzetRijen, 0);
  return wb;
}
