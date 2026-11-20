// Voortgangsoverzicht voor overleg (projectteam, opdrachtgever): wat had al af moeten zijn, wat loopt er en wat
// begint binnen een gekozen aantal weken. Puur: rondes, voortgang en taken komen van de aanroeper.
import { dagNr, isoVan, periode } from './planning.js';
import { schema } from './dashboard.js';

export const GROEPEN = [
  ['achterstallig', 'Had al af moeten zijn', 'Einddatum verstreken, nog niet afgerond.'],
  ['lopend', 'Lopend', 'Nu in uitvoering.'],
  ['komend', 'Start binnenkort', 'Begint binnen de gekozen periode.'],
];

/**
 * @param {object} a
 * @param {{ pakket: object, ronde: object, vg: object, code: string }[]} a.rondes  alle rondes met hun voortgang
 * @param {object[]} [a.taken]  losse taken (store taken), alleen open taken tellen
 * @param {string} a.vandaag  ISO-datum
 * @param {number} a.weken    vooruitkijken: rondes die binnen zoveel weken starten
 * @returns {{ achterstallig: object[], lopend: object[], komend: object[], nietIngepland: number, tot: string }}
 */
export function indelen({ rondes = [], taken = [], vandaag, weken = 4 }) {
  const t = dagNr(vandaag);
  const horizon = t + Math.max(0, Math.round(Number(weken) || 0)) * 7;
  const uit = { achterstallig: [], lopend: [], komend: [], nietIngepland: 0, tot: isoVan(horizon) };
  for (const { pakket, ronde, vg, code } of rondes) {
    const klaar = ronde.status === 'afgerond' || (vg?.totaal > 0 && vg.percentage >= 100);
    if (klaar) continue;
    const p = periode(ronde);
    if (!p) { if (pakket.planning !== 'afroep') uit.nietIngepland += 1; continue; }
    const s = schema(ronde, vg, vandaag);
    const regel = {
      soort: 'ronde', code, pakket, ronde, vg, start: ronde.start, eind: ronde.eind || isoVan(p.eind),
      verwacht: s.verwacht, werkelijk: vg?.percentage ?? 0, signaal: s.signaal,
    };
    if (p.eind < t) uit.achterstallig.push({ ...regel, dagenTeLaat: t - p.eind });
    else if (p.start <= t) uit.lopend.push({ ...regel, dagenOver: p.eind - t + 1 });
    else if (p.start <= horizon) uit.komend.push({ ...regel, startOver: p.start - t });
  }
  for (const k of taken) {
    if (!k || k.status === 'gereed' || k.verwijderd) continue;
    const d = dagNr(k.deadline);
    const regel = { soort: 'taak', code: '', taak: k, start: '', eind: k.deadline || '', werkelijk: 0, verwacht: null, signaal: '' };
    if (d !== null && d < t) uit.achterstallig.push({ ...regel, dagenTeLaat: t - d, signaal: 'te laat' });
    else if (d === null || d <= horizon) uit.lopend.push({ ...regel, dagenOver: d === null ? null : d - t + 1, signaal: 'open' });
  }
  const opEind = (a, b) => String(a.eind || '9999').localeCompare(String(b.eind || '9999')) || String(a.code).localeCompare(String(b.code), 'nl', { numeric: true });
  uit.achterstallig.sort((a, b) => b.dagenTeLaat - a.dagenTeLaat || opEind(a, b));
  uit.lopend.sort(opEind);
  uit.komend.sort((a, b) => String(a.start).localeCompare(String(b.start)) || opEind(a, b));
  return uit;
}

/** Korte stand-tekst voor een regel: "12 dagen te laat", "achter (verwacht 60%)", "start over 5 dagen". */
export function standTekst(r) {
  const dg = (n) => `${n} ${n === 1 ? 'dag' : 'dagen'}`;
  if (r.dagenTeLaat != null) return `${dg(r.dagenTeLaat)} te laat`;
  if (r.startOver != null) return r.startOver === 0 ? 'start vandaag' : `start over ${dg(r.startOver)}`;
  if (r.soort === 'taak') return r.dagenOver == null ? 'open, geen deadline' : `uiterlijk over ${dg(r.dagenOver)}`;
  if (r.signaal === 'op schema') return `op schema · nog ${dg(r.dagenOver)}`;
  if (r.signaal === 'achter' || r.signaal === 'flinke achterstand') return `${r.signaal} (verwacht ${r.verwacht}%) · nog ${dg(r.dagenOver)}`;
  return r.signaal || '';
}

export const KOLOMMEN = [['Groep', 18], ['Code', 12], ['Werkpakket / taak', 34], ['Ronde', 22], ['Soort', 18], ['Start', 12, 'd'], ['Eind', 12, 'd'],
  ['Voortgang (%)', 11, 'getal'], ['Objecten gedaan', 12], ['Hoeveelheden', 24], ['Stand', 28], ['Uitvoerders', 26], ['Opmerking', 30], ['Bespreekpunt / actie', 36]];

const datum = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? new Date(`${iso}T00:00:00Z`) : null);

/**
 * Regels voor Excel en de afdruk.
 * @param {ReturnType<typeof indelen>} ind
 * @param {{ naam: (p) => string, soort: (r) => string, uitvoerders: (p) => string, hoeveelheden: (vg) => string, object: (id) => object }} fmt
 */
export function rijen(ind, fmt) {
  const uit = [];
  for (const [groep, label] of GROEPEN) {
    for (const r of ind[groep]) {
      if (r.soort === 'taak') {
        const o = fmt.object(r.taak.objectId);
        uit.push({ groep, waarden: [label, '', r.taak.titel ?? '', o ? `${o.code ?? ''} ${o.naam ?? ''}`.trim() : '', r.taak.soort === 'inspectie' ? 'Taak – inspectie' : 'Taak – werk',
          null, datum(r.eind), '', '', '', standTekst(r), r.taak.toegewezenAan ?? '', r.taak.omschrijving ?? '', ''] });
        continue;
      }
      const vg = r.vg ?? {};
      uit.push({ groep, waarden: [label, r.code, fmt.naam(r.pakket), r.ronde.naam && r.pakket.rondes?.length ? `R${r.ronde.nummer} ${r.ronde.naam}` : '', fmt.soort(r.ronde),
        datum(r.start), datum(r.eind), r.werkelijk, vg.totaal ? `${(vg.gedaan?.size ?? 0) + (vg.overgeslagen?.size ?? 0)} / ${vg.totaal}` : '',
        fmt.hoeveelheden(vg), standTekst(r), fmt.uitvoerders(r.pakket), r.ronde.opmerking ?? '', ''] });
    }
  }
  return uit;
}

const KLEUR = { achterstallig: 'FFB42318', lopend: 'FF0B4F6C', komend: 'FF6B7785' };

export function maakWerkboek(ExcelJS, ind, meta, fmt) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inspectie & Registratie';
  wb.created = new Date();
  const s = wb.addWorksheet('Overzicht', { properties: { tabColor: { argb: 'FF0B4F6C' } } });
  s.columns = [{ width: 30 }, { width: 50 }];
  s.addRow(['Voortgangsoverzicht']).font = { bold: true, size: 14 };
  s.addRow(['Project', meta.project]);
  s.addRow(['Peildatum', meta.peildatum]);
  s.addRow(['Vooruitkijken', meta.vooruit]);
  s.addRow([]);
  for (const [k, l] of GROEPEN) s.addRow([l, ind[k].length]).getCell(1).font = { bold: true, color: { argb: KLEUR[k] } };
  if (ind.nietIngepland) s.addRow(['Nog niet ingepland', ind.nietIngepland]);
  const ws = wb.addWorksheet('Voortgang', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = KOLOMMEN.map(([h, w]) => ({ header: h, width: w }));
  ws.getRow(1).eachCell((c) => {
    c.style = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4F6C' } }, alignment: { vertical: 'middle', wrapText: true } };
  });
  ws.getRow(1).height = 30;
  const lijst = rijen(ind, fmt);
  for (const r of lijst) {
    const row = ws.addRow(r.waarden);
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: KLEUR[r.groep] } };
  }
  KOLOMMEN.forEach(([, , soort], n) => {
    if (soort === 'd') ws.getColumn(n + 1).numFmt = 'dd-mm-yyyy';
    if (soort === 'getal') ws.getColumn(n + 1).numFmt = '0';
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + lijst.length, column: KOLOMMEN.length } };
  return wb;
}
