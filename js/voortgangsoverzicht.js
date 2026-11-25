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
  const uit = { achterstallig: [], lopend: [], komend: [], nietIngepland: 0, nietIngeplandLijst: [], tot: isoVan(horizon) };
  for (const { pakket, ronde, vg, code } of rondes) {
    const klaar = ronde.status === 'afgerond' || (vg?.totaal > 0 && vg.percentage >= 100);
    if (klaar) continue;
    const p = periode(ronde);
    if (!p) {
      if (pakket.planning !== 'afroep') { uit.nietIngepland += 1; uit.nietIngeplandLijst.push({ soort: 'ronde', code, pakket, ronde, vg }); }
      continue;
    }
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
  wb.creator = 'BaasOverBuiten';
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

// ---------------------------------------------------------------------------
// Planningsoverleg (notulen): sleutels, actiepunten en momentopname
// ---------------------------------------------------------------------------
/** Vaste sleutel van een regel, om bespreekpunten en acties aan te koppelen. */
export const regelSleutel = (r) => (r.soort === 'taak' ? `t:${r.taak.id}` : `r:${r.pakket.id}:${r.ronde.id}`);

export const ACTIE_STATUS = { open: 'Open', gereed: 'Gereed', vervallen: 'Vervallen' };

/**
 * Nieuw overleg: volgnummer, peildatum en (uit het vorige overleg) de vaste deelnemers en de afgesproken datum.
 * @param {object[]} overleggen  eerdere overleggen van het project
 */
export function nieuwOverleg({ id, vandaag, overleggen = [] }) {
  const vorige = [...overleggen].sort((a, b) => String(b.datum).localeCompare(String(a.datum)))[0];
  const gepland = vorige?.volgende?.datum && vorige.volgende.datum >= vandaag ? vorige.volgende : null;
  return {
    id, nummer: Math.max(0, ...overleggen.map((o) => Number(o.nummer) || 0)) + 1,
    datum: gepland?.datum ?? vandaag, tijd: gepland?.tijd ?? vorige?.tijd ?? '', locatie: gepland?.locatie ?? vorige?.locatie ?? '',
    voorzitter: vorige?.voorzitter ?? '', notulist: vorige?.notulist ?? '', aanwezig: vorige?.aanwezig ?? '', afwezig: '',
    punten: {}, acties: [], actieUpdates: {}, besluiten: '', rondvraag: '', volgende: { datum: '', tijd: vorige?.volgende?.tijd ?? vorige?.tijd ?? '', locatie: '' },
  };
}

/**
 * Actiepunten uit eerdere overleggen (vóór dit overleg) die nog openstonden, met de stand zoals in dit overleg bijgewerkt.
 * Een actie die in een eerder overleg al gereed of vervallen is gemeld, komt niet meer terug.
 * @returns {{ actie: object, overleg: object, status: string, toelichting: string }[]}
 */
export function openActies(overleggen, huidig) {
  const eerder = (overleggen ?? []).filter((o) => o.id !== huidig?.id && (String(o.datum) < String(huidig?.datum) || (o.datum === huidig?.datum && (o.nummer ?? 0) < (huidig?.nummer ?? 0))))
    .sort((a, b) => String(a.datum).localeCompare(String(b.datum)) || (a.nummer ?? 0) - (b.nummer ?? 0));
  const stand = new Map(); // actie-id → laatste status uit een eerder overleg
  for (const o of eerder) {
    for (const a of o.acties ?? []) if (!stand.has(a.id)) stand.set(a.id, { actie: a, overleg: o, status: a.status ?? 'open', toelichting: '' });
    for (const [id, u] of Object.entries(o.actieUpdates ?? {})) {
      const x = stand.get(id);
      if (x) stand.set(id, { ...x, status: u.status ?? x.status, toelichting: u.toelichting ?? x.toelichting });
    }
  }
  return [...stand.values()].filter((x) => x.status === 'open').map((x) => {
    const u = huidig?.actieUpdates?.[x.actie.id];
    return { ...x, status: u?.status ?? 'open', toelichting: u?.toelichting ?? '' };
  }).sort((a, b) => String(a.actie.gereed || '9999').localeCompare(String(b.actie.gereed || '9999')));
}

/**
 * Momentopname van de planning voor de notulen: wat er in het overleg op tafel lag, zodat oude notulen kloppen
 * ook als de planning daarna verandert.
 */
export function momentopname(ind, { titel, sub, periode, voortgang, stand, href }) {
  const uit = {};
  for (const [groep] of GROEPEN) {
    uit[groep] = ind[groep].map((r) => ({ sleutel: regelSleutel(r), soort: r.soort, code: r.code ?? '', titel: titel(r), sub: sub(r), periode: periode(r),
      voortgang: r.soort === 'taak' ? null : r.werkelijk, verwacht: r.verwacht ?? null, stand: standTekst(r), klasse: stand(r), href: href(r) }));
  }
  uit.nietIngepland = (ind.nietIngeplandLijst ?? []).map((r) => ({ sleutel: regelSleutel(r), soort: 'ronde', code: r.code, titel: titel(r), sub: sub(r), href: href(r, true) }));
  uit.tot = ind.tot;
  return uit;
}

/**
 * Notulen van het planningsoverleg als Excel: Overleg (gegevens, besluiten, rondvraag), Planning (alle besproken regels
 * met bespreekpunt) en Actiepunten (uit vorige overleggen en nieuw).
 * @param {object} a
 * @param {object} a.overleg      het overleg (gegevens, punten, acties, besluiten, …)
 * @param {object} a.foto         momentopname van de planning (zie momentopname)
 * @param {object[]} a.vorige     open acties uit eerdere overleggen (zie openActies)
 * @param {{ project: string, opdrachtgever?: string, datumTekst: (iso: string) => string }} a.meta
 */
export function maakNotulenWerkboek(ExcelJS, { overleg: o, foto, vorige = [], meta }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BaasOverBuiten';
  wb.created = new Date();
  const kop = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4F6C' } }, alignment: { vertical: 'middle', wrapText: true } };
  const dt = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? meta.datumTekst(iso) : '');
  const s = wb.addWorksheet('Overleg', { properties: { tabColor: { argb: 'FF0B4F6C' } } });
  s.columns = [{ width: 26 }, { width: 90 }];
  s.addRow([`Planningsoverleg ${o.nummer ? `#${o.nummer}` : ''}`.trim()]).font = { bold: true, size: 14 };
  const veld = (k, v) => { const r = s.addRow([k, v ?? '']); r.getCell(1).font = { bold: true }; r.alignment = { vertical: 'top', wrapText: true }; };
  veld('Project', meta.project);
  if (meta.opdrachtgever) veld('Opdrachtgever', meta.opdrachtgever);
  veld('Datum', `${dt(o.datum)}${o.tijd ? ` om ${o.tijd}` : ''}`);
  veld('Locatie', o.locatie);
  veld('Voorzitter', o.voorzitter);
  veld('Notulist', o.notulist);
  veld('Aanwezig', o.aanwezig);
  veld('Afwezig (met bericht)', o.afwezig);
  s.addRow([]);
  for (const [groep, label] of GROEPEN) veld(label, `${foto[groep]?.length ?? 0} regel(s)`);
  if (foto.nietIngepland?.length) veld('Nog niet ingepland', `${foto.nietIngepland.length} ronde(s)`);
  s.addRow([]);
  veld('Besluiten', o.besluiten);
  veld('Rondvraag', o.rondvraag);
  veld('Volgend overleg', o.volgende?.datum ? `${dt(o.volgende.datum)}${o.volgende.tijd ? ` om ${o.volgende.tijd}` : ''}${o.volgende.locatie ? `, ${o.volgende.locatie}` : ''}` : '');

  const p = wb.addWorksheet('Planning', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  p.columns = [['Agendapunt', 22], ['Code', 16], ['Werkpakket / taak', 40], ['Periode', 24], ['Voortgang (%)', 12], ['Stand', 30], ['Bespreekpunt', 60]].map(([header, width]) => ({ header, width }));
  p.getRow(1).eachCell((c) => { c.style = kop; });
  const KL = { achterstallig: 'FFB42318', lopend: 'FF0B4F6C', komend: 'FF6B7785', nietIngepland: 'FFE8710A' };
  for (const [groep, label] of [...GROEPEN, ['nietIngepland', 'Nog niet ingepland']]) {
    for (const r of foto[groep] ?? []) {
      const row = p.addRow([label, r.code, [r.titel, ...(r.sub ?? [])].filter(Boolean).join('\n'), r.periode ?? '', r.voortgang ?? '', r.stand ?? '', o.punten?.[r.sleutel] ?? '']);
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell(1).font = { bold: true, color: { argb: KL[groep] } };
    }
  }
  p.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };

  const a = wb.addWorksheet('Actiepunten', { views: [{ state: 'frozen', ySplit: 1 }] });
  a.columns = [['Nr', 6], ['Actie', 60], ['Actiehouder', 22], ['Gereed vóór', 13], ['Onderwerp', 26], ['Uit overleg', 14], ['Status', 11], ['Toelichting', 40]].map(([header, width]) => ({ header, width }));
  a.getRow(1).eachCell((c) => { c.style = kop; });
  let nr = 0;
  const regel = (x, uit, status, toel) => {
    nr += 1;
    const row = a.addRow([nr, x.tekst ?? '', x.wie ?? '', /^\d{4}-\d{2}-\d{2}$/.test(x.gereed ?? '') ? new Date(`${x.gereed}T00:00:00Z`) : '', x.onderwerp ?? '', uit, ACTIE_STATUS[status] ?? status, toel ?? '']);
    row.alignment = { vertical: 'top', wrapText: true };
    if (status === 'gereed') row.getCell(7).font = { color: { argb: 'FF1A7F37' }, bold: true };
  };
  for (const v of vorige) regel(v.actie, v.overleg?.datum ? dt(v.overleg.datum) : '', v.status, v.toelichting);
  for (const x of o.acties ?? []) regel(x, dt(o.datum), x.status ?? 'open', '');
  a.getColumn(4).numFmt = 'dd-mm-yyyy';
  return wb;
}
