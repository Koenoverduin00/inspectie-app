// Uitkomsten van werkpakketten naar Excel: per registratie (werkzaamheid, inspectie of overgeslagen object) alle
// antwoorden van de uitvoerder of schouwer, de bevindingen, en een lijst met vervolgacties als input voor nieuw werk.
// De regels worden puur samengesteld (testbaar); maakWerkboek zet ze met opmaak in een ExcelJS-werkboek.
import { CONDITIES, ERNST, INTENSITEIT, URGENTIES, gebrekScore } from './nen2767.js';
import * as TY from './inspectietypen.js';
import * as ST from './stowa.js';
import * as BV from './bvc.js';
import * as FI from './fotoinfo.js';
import { oordeel, coordinaten, puntCoord } from './resultatenexcel.js';

const datum = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? '') ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`) : null);
const getal = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Number(v));
const urgentieLabel = (id) => URGENTIES.find((u) => u.id === id)?.label ?? '';
const URGENTIE_DAGEN = { direct: 7, '3maanden': 91, '1jaar': 365, '3jaar': 1095, '5jaar': 1826 };
const plusDagen = (iso, dagen) => {
  const d = datum(iso);
  if (!d || !dagen) return null;
  d.setUTCDate(d.getUTCDate() + dagen);
  return d;
};
const BEOORDELING_TEKST = { ingediend: 'Ingediend', goedgekeurd: 'Goedgekeurd', afgekeurd: 'Afgekeurd' };
const STATUS_WERK = { gereed: 'Gereed', vervolg: 'Vervolg nodig' };
/** Status van een werkzaamheid; bij werk in delen "Gedeeltelijk (welk deel)". */
const werkStatus = (r) => (r?.gereed === false ? `Gedeeltelijk${r.deel ? ` (${r.deel})` : ''}` : STATUS_WERK[r?.status] ?? 'Gereed');

/** Leesbare naam van een inspectiesoort/methodiek. */
function inspectieSoortTekst(i) {
  if (i.bvc) return 'Boomveiligheidscontrole';
  if (i.stowa) return 'Inspectie waterkering (STOWA)';
  return i.soort ?? 'Inspectie';
}

/** Bevindingen van één inspectie als platte regels (alle methodieken). */
export function bevindingenVan(i) {
  const uit = [];
  if (i.stowa) {
    for (const w of i.stowa.waarnemingen ?? []) {
      uit.push({
        onderdeel: [w.zone, w.locatie].filter(Boolean).join(' · '), gebrek: ST.schadebeeldNaam(w), oordeel: ST.URGENTIE[w.urgentieKleur]?.label ?? '',
        kleur: ST.URGENTIE[w.urgentieKleur]?.kleur ?? '', toelichting: w.toelichting ?? '', maatregel: w.maatregel ?? '', urgentie: urgentieLabel(w.urgentie),
        urgentieId: w.urgentie ?? '', kosten: '', status: w.maatregelStatus === 'uitgevoerd' ? 'Uitgevoerd' : (w.maatregel || w.urgentie ? 'Open' : ''),
        open: Boolean(w.maatregel || w.urgentie) && w.maatregelStatus !== 'uitgevoerd', fotos: (w.fotoIds ?? []).length, punt: w,
      });
    }
    return uit;
  }
  if (i.bvc) {
    for (const g of i.bvc.gebreken ?? []) {
      uit.push({ onderdeel: g.plaats ?? '', gebrek: g.omschrijving ?? '', oordeel: g.gevolg ? `Gevolg: ${g.gevolg}` : '', kleur: '', toelichting: g.toelichting ?? '',
        maatregel: '', urgentie: '', urgentieId: '', kosten: '', status: '', open: false, fotos: (g.fotoIds ?? []).length, punt: g });
    }
    for (const m of i.bvc.maatregelen ?? []) {
      uit.push({ onderdeel: 'Maatregel', gebrek: '', oordeel: BV.BVK[i.bvc.bvk]?.kort ?? '', kleur: BV.BVK[i.bvc.bvk]?.kleur ?? '', toelichting: '',
        maatregel: m.bvcMaatregel ?? '', urgentie: BV.URGENTIE[m.termijn]?.label ?? '', urgentieId: m.termijn === 'acuut' ? 'direct' : '', voor: m.uitvoerenVoor ?? '',
        kosten: '', status: m.maatregelStatus === 'uitgevoerd' ? 'Uitgevoerd' : 'Open', open: m.maatregelStatus !== 'uitgevoerd', fotos: 0, punt: null });
    }
    return uit;
  }
  const m = TY.methodiekVan(i);
  for (const g of i.gebreken ?? []) {
    let o;
    let kleur;
    if (m === 'nen') {
      const s = gebrekScore(g);
      o = `${s} · ${CONDITIES[s]?.label ?? ''}${g.ernst ? ` (E ${ERNST[g.ernst]?.label ?? g.ernst}, I ${INTENSITEIT[g.intensiteit] ?? g.intensiteit}, O ${g.omvang === '' || g.omvang == null ? '–' : `${g.omvang}%`})` : ''}`;
      kleur = CONDITIES[s]?.kleur ?? '';
    } else {
      const b = TY.bevindingOordeel(i, g);
      o = b.label;
      kleur = b.kleur;
    }
    uit.push({
      onderdeel: g.bouwdeel ?? '', gebrek: g.checkpunt ? TY.CHECK.nok : (g.gebrek ?? ''), oordeel: o, kleur, toelichting: [g.locatie, g.toelichting].filter(Boolean).join(' – '),
      maatregel: g.maatregel ?? '', urgentie: urgentieLabel(g.urgentie), urgentieId: g.urgentie ?? '', kosten: getal(g.kostenraming),
      status: g.maatregelStatus === 'uitgevoerd' ? 'Uitgevoerd' : (g.maatregel || g.urgentie ? 'Open' : ''),
      open: Boolean(g.maatregel || g.urgentie) && g.maatregelStatus !== 'uitgevoerd', fotos: (g.fotoIds ?? []).length, punt: g,
    });
  }
  return uit;
}

/**
 * Stelt alle bladen samen.
 * @param {object} p
 * @param {object[]} p.registraties  [{ soort: 'werk'|'inspectie'|'overgeslagen', r, pakket, ronde, object }]
 * @param {(r, soort) => [string, string][]} p.extra   eigen formuliervelden als [label, waarde]
 * @param {(r) => string} p.beoordeling                status van de beoordeling
 * @param {boolean} [p.metUren]
 * @param {boolean} [p.metKosten]
 */
/** Alle foto's van één registratie met een onderwerp: algemeen, extra velden, gebreken/bevindingen en waarnemingen. */
export function fotosVan(r) {
  const uit = [];
  const voeg = (ids, onderwerp) => { for (const id of ids ?? []) if (id) uit.push({ fotoId: id, onderwerp, info: r?.fotoInfo?.[id] ?? null }); };
  voeg(r?.fotoIds, 'Algemeen');
  voeg(r?.extraFotoIds, 'Formulier');
  (r?.gebreken ?? []).forEach((g, n) => voeg(g.fotoIds, `Bevinding ${n + 1}${g.gebrek || g.omschrijving ? `: ${g.gebrek || g.omschrijving}` : ''}`));
  (r?.bvc?.gebreken ?? []).forEach((g, n) => voeg(g.fotoIds, `Boomgebrek ${n + 1}${g.omschrijving ? `: ${g.omschrijving}` : ''}`));
  (r?.stowa?.waarnemingen ?? []).forEach((w, n) => voeg(w.fotoIds, `Waarneming ${n + 1}${w.omschrijving ? `: ${w.omschrijving}` : ''}`));
  (r?.checklist ?? []).forEach((c) => voeg(c.fotoIds, `Checklist: ${c.punt ?? ''}`));
  (r?.maatregelen ?? []).forEach((m, n) => voeg(m.fotoIds, `Maatregel ${n + 1}`));
  // dubbele ids maar één keer
  const gezien = new Set();
  return uit.filter((f) => !gezien.has(f.fotoId) && gezien.add(f.fotoId));
}

export function uitkomstRijen({ registraties, extra = () => [], bevindingExtra = () => null, beoordeling = () => '', metUren = true, metKosten = true }) {
  const extraLabels = [];
  const checkPunten = [];
  const extraPer = new Map();
  for (const x of registraties) {
    if (x.soort === 'overgeslagen') continue;
    const e = extra(x.r, x.soort);
    extraPer.set(x, new Map(e));
    for (const [l] of e) if (!extraLabels.includes(l)) extraLabels.push(l);
    for (const c of x.r.checklist ?? []) if (!checkPunten.includes(c.punt)) checkPunten.push(c.punt);
  }
  const kolommen = [
    ['Werkpakket code', 14], ['Werkpakket', 26], ['Ronde', 18], ['Registratie', 13], ['Werk- / inspectiesoort', 22],
    ['Objectcode', 14], ['Object', 26], ['Objecttype', 16], ['Datum', 12, 'datum'], ['Uitvoerder / schouwer', 20],
    ['Status', 15], ['Beoordeling', 13], ['Oordeel', 18, 'oordeel'], ['Bevindingen', 10], ['Open maatregelen', 10],
    ['Omschrijving / samenvatting', 40], ['Materiaal', 18], ['Vervolg', 30],
    ...(metUren ? [['Uren', 8]] : []), ['Reden overslaan', 24],
    ...extraLabels.map((l) => [l, 18]), ...checkPunten.map((p) => [`Checklist: ${p}`, 16]),
    ['X (RD)', 12], ['Y (RD)', 12], ['Breedtegraad', 12], ['Lengtegraad', 12],
  ];
  const rijen = [];
  const antwoorden = [];
  const bevindingen = [];
  const vervolg = [];
  const basis = (x) => [x.pakket?.code ?? '', x.pakket?.naam ?? '', x.ronde?.naam ?? ''];
  for (const x of registraties) {
    const { r, object: o = {} } = x;
    const c = coordinaten(o);
    const door = x.soort === 'werk' ? r.uitvoerder : x.soort === 'inspectie' ? (r.bvc?.inspecteur ?? r.inspecteur) : r.door;
    const ant = (vraag, antwoord) => {
      if (antwoord === '' || antwoord == null) return;
      antwoorden.push({ waarden: [...basis(x), o.code ?? '', o.naam ?? '', datum(r.datum ?? r.op), door ?? '', x.soort === 'werk' ? 'Werkzaamheid' : x.soort === 'inspectie' ? inspectieSoortTekst(r) : 'Overgeslagen', vraag, String(antwoord)] });
    };
    const ex = extraPer.get(x) ?? new Map();
    const check = new Map((r.checklist ?? []).map((p) => [p.punt, TY.CHECK[p.status] ?? '']));
    if (x.soort === 'werk') {
      rijen.push({
        waarden: [...basis(x), 'Werkzaamheid', r.soort ?? '', o.code ?? '', o.naam ?? '', o.type ?? '', datum(r.datum), r.uitvoerder ?? '',
          werkStatus(r), BEOORDELING_TEKST[beoordeling(r)] ?? '', '', '', '', r.omschrijving ?? '', r.materiaal ?? '', r.vervolg ?? '',
          ...(metUren ? [getal(r.uren)] : []), '', ...extraLabels.map((l) => ex.get(l) ?? ''), ...checkPunten.map(() => ''), c.x, c.y, c.lat, c.lng],
        kleur: '',
      });
      ant('Werksoort', r.soort); ant('Omschrijving', r.omschrijving); ant('Materiaal', r.materiaal); ant('Status', werkStatus(r));
      ant('Vervolg', r.vervolg);
      if (metUren) ant('Uren', r.uren);
      for (const [l, v] of ex) ant(l, v);
      if (r.status === 'vervolg') {
        vervolg.push({ waarden: [o.code ?? '', o.naam ?? '', o.type ?? '', 'Vervolg op werkzaamheid', x.pakket?.naam ?? '', x.ronde?.naam ?? '',
          r.vervolg || r.omschrijving || r.soort || '', '', null, '', datum(r.datum), r.uitvoerder ?? '', c.lat, c.lng], rang: 3 });
      }
      continue;
    }
    if (x.soort === 'overgeslagen') {
      rijen.push({
        waarden: [...basis(x), 'Overgeslagen', x.ronde?.soort === 'inspectie' ? (x.ronde?.inspectiesoort ?? '') : (x.ronde?.werksoort ?? ''), o.code ?? '', o.naam ?? '', o.type ?? '',
          datum(r.op), r.door ?? '', 'Overgeslagen', '', '', '', '', r.toelichting ?? '', '', '', ...(metUren ? [''] : []), r.reden ?? '',
          ...extraLabels.map(() => ''), ...checkPunten.map(() => ''), c.x, c.y, c.lat, c.lng],
        kleur: '',
      });
      ant('Reden overslaan', r.reden); ant('Toelichting', r.toelichting);
      vervolg.push({ waarden: [o.code ?? '', o.naam ?? '', o.type ?? '', 'Overgeslagen – opnieuw inplannen', x.pakket?.naam ?? '', x.ronde?.naam ?? '',
        [r.reden, r.toelichting].filter(Boolean).join(': '), '', null, '', datum(r.op), r.door ?? '', c.lat, c.lng], rang: 4 });
      continue;
    }
    // Inspectie
    const oo = oordeel(r);
    const bev = bevindingenVan(r);
    const open = bev.filter((b) => b.open);
    rijen.push({
      waarden: [...basis(x), 'Inspectie', inspectieSoortTekst(r), o.code ?? '', o.naam ?? '', o.type ?? '', datum(r.datum), door ?? '',
        r.status === 'afgerond' ? 'Afgerond' : 'Concept', BEOORDELING_TEKST[beoordeling(r)] ?? '', [oo.code, oo.tekst && oo.tekst !== oo.code ? oo.tekst : ''].filter(Boolean).join(' – '),
        bev.length || '', open.length || '', (r.bvc ? r.bvc.opmerking : r.samenvatting) ?? '', '', '', ...(metUren ? [''] : []), '',
        ...extraLabels.map((l) => ex.get(l) ?? ''), ...checkPunten.map((p) => check.get(p) ?? ''), c.x, c.y, c.lat, c.lng],
      kleur: oo.kleur,
    });
    ant('Inspectiesoort', inspectieSoortTekst(r)); ant('Weer', r.weer); ant('Oordeel', [oo.code, oo.tekst && oo.tekst !== oo.code ? oo.tekst : ''].filter(Boolean).join(' – '));
    ant('Samenvatting', r.bvc ? r.bvc.opmerking : r.samenvatting);
    for (const p of r.checklist ?? []) ant(p.punt, TY.CHECK[p.status] ?? 'Niet beantwoord');
    for (const [l, v] of ex) ant(l, v);
    bev.forEach((b, n) => {
      const gps = b.punt ? puntCoord(b.punt, o) : ['', '', '', ''];
      // Antwoorden op de vragen per bevinding (bijv. een ingewonnen lijn of vlak).
      const bx = (b.punt ? bevindingExtra(r, b.punt) : null) ?? { tekst: '', wkt: '' };
      bevindingen.push({
        waarden: [...basis(x), o.code ?? '', o.naam ?? '', datum(r.datum), door ?? '', inspectieSoortTekst(r), n + 1, b.onderdeel, b.gebrek, b.oordeel, b.toelichting,
          b.maatregel, b.urgentie, ...(metKosten ? [b.kosten] : []), b.status, b.fotos || '', bx.tekst ?? '', bx.wkt ?? '', ...gps],
        kleur: b.kleur,
      });
      if (b.open) {
        const voor = b.voor ? datum(b.voor) : plusDagen(r.datum, URGENTIE_DAGEN[b.urgentieId]);
        vervolg.push({
          waarden: [o.code ?? '', o.naam ?? '', o.type ?? '', 'Bevinding uit inspectie', x.pakket?.naam ?? '', x.ronde?.naam ?? '',
            b.maatregel || [b.onderdeel, b.gebrek].filter(Boolean).join(' – '), b.urgentie, voor, metKosten ? b.kosten : '', datum(r.datum), door ?? '',
            gps[2] !== '' ? gps[2] : c.lat, gps[3] !== '' ? gps[3] : c.lng],
          rang: URGENTIES.find((u) => u.id === b.urgentieId)?.rang ?? 3, kleur: b.urgentieId === 'direct' ? '#d1452f' : '',
        });
      }
    });
  }
  vervolg.sort((a, b) => a.rang - b.rang || String(a.waarden[0]).localeCompare(String(b.waarden[0]), 'nl', { numeric: true }));
  const fotos = registraties.filter((x) => x.soort !== 'overgeslagen').flatMap((x) => fotosVan(x.r).map((f) => ({
    ...f, objectcode: x.object?.code ?? '', registratie: `${x.soort === 'werk' ? (x.r.soort || 'Werkzaamheid') : x.soort === 'inspectie' ? inspectieSoortTekst(x.r) : ''}${x.r.datum ? ` · ${String(x.r.datum).slice(0, 10)}` : ''}`,
  })));
  return {
    kolommen, rijen, antwoorden, bevindingen, vervolg, fotos,
    telling: {
      werk: registraties.filter((x) => x.soort === 'werk').length, inspecties: registraties.filter((x) => x.soort === 'inspectie').length,
      overgeslagen: registraties.filter((x) => x.soort === 'overgeslagen').length, bevindingen: bevindingen.length, vervolg: vervolg.length,
    },
  };
}

export const EIS_KOLOMMEN = [['Eisnummer', 14], ['Eistekst', 50], ['Eisvraag', 40], ['Gewenst antwoord', 18], ['Contractstuk', 18], ['Formulier', 20], ['Antwoorden', 11], ['Voldoet', 9], ['Voldoet niet', 9],
  ['Zonder norm', 9], ['Laatst', 12, 'datum'], ['Verificatie', 20]];
export const ANTWOORD_KOLOMMEN = [['Werkpakket code', 14], ['Werkpakket', 26], ['Ronde', 18], ['Objectcode', 14], ['Object', 26], ['Datum', 12, 'datum'],
  ['Door', 20], ['Formulier', 22], ['Vraag', 34], ['Antwoord', 44]];
export const bevindingKolommen = (metKosten = true) => [['Werkpakket code', 14], ['Werkpakket', 26], ['Ronde', 18], ['Objectcode', 14], ['Object', 26],
  ['Datum', 12, 'datum'], ['Inspecteur', 20], ['Inspectiesoort', 22], ['Nr', 5], ['Onderdeel / bouwdeel', 24], ['Gebrek', 26], ['Oordeel / conditie', 22],
  ['Toelichting', 40], ['Maatregel', 34], ['Urgentie', 18], ...(metKosten ? [['Raming (€)', 12, 'euro']] : []), ['Status maatregel', 12], ["Foto's", 8],
  ['Vragen per bevinding', 40], ['Geometrie bevinding (WKT, WGS84)', 40], ['X (RD)', 12], ['Y (RD)', 12], ['Breedtegraad', 12], ['Lengtegraad', 12]];
export const VERVOLG_KOLOMMEN = [['Objectcode', 14], ['Object', 26], ['Objecttype', 16], ['Bron', 26], ['Werkpakket', 26], ['Ronde', 18],
  ['Wat moet er gebeuren', 44], ['Urgentie', 18], ['Uitvoeren vóór', 13, 'datum'], ['Raming (€)', 12, 'euro'], ['Gemeld op', 12, 'datum'], ['Door', 18],
  ['Breedtegraad', 12], ['Lengtegraad', 12]];

const argb = (hex) => `FF${String(hex).replace('#', '').toUpperCase()}`;
const lichter = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const m = (c) => Math.round(c + (255 - c) * 0.75);
  return `FF${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => m(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

/**
 * @param {any} ExcelJS
 * @param {ReturnType<typeof uitkomstRijen>} r
 * @param {{ titel: string, project: string, filter: string, rondes: object[], metKosten?: boolean }} meta
 */
export function maakWerkboek(ExcelJS, r, meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BaasOverBuiten';
  wb.created = new Date();
  const kop = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4F6C' } }, alignment: { vertical: 'middle', wrapText: true } };

  const info = wb.addWorksheet('Overzicht', { properties: { tabColor: { argb: 'FF0B4F6C' } } });
  info.columns = [{ width: 30 }, { width: 22 }, { width: 18 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 13 }, { width: 10 }, { width: 10 }];
  info.addRow([meta.titel]).font = { bold: true, size: 14 };
  info.addRow([`Project: ${meta.project}`]);
  info.addRow([`Selectie: ${meta.filter}`]);
  info.addRow([`Gemaakt op: ${new Date().toLocaleString('nl-NL')}`]);
  info.addRow([]);
  info.addRow([`${r.telling.werk} werkzaamheden · ${r.telling.inspecties} inspecties · ${r.telling.overgeslagen} overgeslagen · ${r.telling.bevindingen} bevindingen · ${r.telling.vervolg} vervolgacties`]).font = { bold: true };
  info.addRow([]);
  const kr = info.addRow(['Werkpakket', 'Ronde', 'Soort', 'Periode', 'Objecten', 'Gedaan', 'Overgeslagen', 'Open', 'Gereed %']);
  kr.eachCell((c) => { c.style = kop; });
  for (const x of meta.rondes ?? []) info.addRow([x.pakket, x.ronde, x.soort, x.periode, x.totaal, x.gedaan, x.overgeslagen, x.open, x.percentage / 100]).getCell(9).numFmt = '0%';
  info.addRow([]);
  for (const t of ['Bladen:', '• Registraties – één regel per werkzaamheid, inspectie of overgeslagen object, met alle antwoorden in kolommen.',
    '• Antwoorden – dezelfde antwoorden onder elkaar (vraag / antwoord), handig voor draaitabellen.',
    '• Bevindingen – alle gebreken en bevindingen uit inspecties, met oordeel, maatregel en GPS-locatie.',
    '• Vervolgacties – open maatregelen, werk met "vervolg nodig" en overgeslagen objecten: input voor nieuwe werkzaamheden.',
    '  Kopieer de objectcodes naar het blad Objecten van het werkpakket-sjabloon om er een nieuw werkpakket van te maken.']) info.addRow([t]);

  const blad = (naam, kolommen, rijen, kleurKolom, tab) => {
    const ws = wb.addWorksheet(naam, { views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }], properties: tab ? { tabColor: { argb: tab } } : {} });
    ws.columns = kolommen.map(([k, w]) => ({ header: k, width: w }));
    ws.getRow(1).eachCell((c) => { c.style = kop; });
    ws.getRow(1).height = 30;
    for (const { waarden, kleur } of rijen) {
      const row = ws.addRow(waarden);
      if (kleur && kleurKolom) {
        const c = row.getCell(kleurKolom);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lichter(kleur) } };
        c.font = { bold: true, color: { argb: argb(kleur) } };
      }
    }
    kolommen.forEach(([, , soort], n) => {
      if (soort === 'datum') ws.getColumn(n + 1).numFmt = 'dd-mm-yyyy';
      if (soort === 'euro') ws.getColumn(n + 1).numFmt = '€ #,##0';
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + rijen.length, column: kolommen.length } };
    return ws;
  };
  blad('Registraties', r.kolommen, r.rijen, r.kolommen.findIndex(([, , s]) => s === 'oordeel') + 1);
  blad('Antwoorden', ANTWOORD_KOLOMMEN, r.antwoorden, 0);
  blad('Bevindingen', bevindingKolommen(meta.metKosten !== false), r.bevindingen, 12);
  const vk = meta.metKosten === false ? VERVOLG_KOLOMMEN.filter(([k]) => k !== 'Raming (€)') : VERVOLG_KOLOMMEN;
  const vr = meta.metKosten === false ? r.vervolg.map((x) => ({ ...x, waarden: x.waarden.filter((_, n) => n !== 9) })) : r.vervolg;
  blad('Vervolgacties', vk, vr, 8, 'FFE8710A');
  // Eisverificatie: per eis uit de eisbibliotheek hoe vaak hij is bevraagd en met welk resultaat (voldoet / voldoet niet aan het gewenste antwoord / zonder norm).
  if (meta.eisen?.length) blad('Eisverificatie', EIS_KOLOMMEN, meta.eisen, EIS_KOLOMMEN.length, 'FF1A7F37');
  // Blad met de foto's: altijd datum, tijd en locatie per foto; de afbeelding zelf alleen als foto's zijn gekozen.
  const fotoData = meta.fotoData;
  if (r.fotos?.length) {
    const ws = wb.addWorksheet("Foto's", { views: [{ state: 'frozen', ySplit: 1 }] });
    const kol = [['Objectcode', 14], ['Registratie', 26], ['Onderwerp', 34], ...FI.EXPORT_KOLOMMEN, ...(fotoData?.size ? [['Foto', 42]] : [])];
    ws.columns = kol.map(([k, w]) => ({ header: k, width: w }));
    ws.getRow(1).eachCell((c) => { c.style = kop; });
    ws.getColumn(4).numFmt = 'dd-mm-yyyy hh:mm';
    let rij = 2;
    for (const f of r.fotos) {
      const waarden = [f.objectcode, f.registratie, f.onderwerp, ...FI.exportWaarden(f.info, BV.wgs84NaarRd)];
      waarden.forEach((v, n) => { const c = ws.getCell(rij, n + 1); c.value = v; c.alignment = { vertical: 'top', wrapText: true }; });
      const data = fotoData?.get(f.fotoId);
      const m = data ? String(data).match(/^data:image\/(png|jpe?g|gif);base64,/i) : null;
      if (m) {
        ws.getRow(rij).height = 170;
        const id = wb.addImage({ base64: data, extension: m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase() });
        ws.addImage(id, { tl: { col: waarden.length + 0.05, row: rij - 1 + 0.05 }, ext: { width: 290, height: 218 } });
      }
      rij++;
    }
  }
  return wb;
}
