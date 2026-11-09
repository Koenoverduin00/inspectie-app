// Resultaten van inspecties naar Excel: één regel per object (of inspectie), plus
// bladen met gebreken, maatregelen en (optioneel) foto's. De regels worden puur
// samengesteld (testbaar); maakWerkboek zet ze met opmaak in een ExcelJS-werkboek.
import { CONDITIES, ERNST, INTENSITEIT, URGENTIES, gebrekScore, inspectieScore, volgendeInspectie } from './nen2767.js';
import * as BV from './bvc.js';
import { middelpunt } from './gis.js';
import * as ST from './stowa.js';
import * as DG from './digigids.js';

const STATUS_TEKST = { afgerond: 'Gedaan', concept: 'Concept (niet afgerond)', overgeslagen: 'Overgeslagen', open: 'Open' };

function coordinaten(o) {
  let lat = parseFloat(o?.lat);
  let lng = parseFloat(o?.lng);
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && o?.geometrie) {
    const c = middelpunt(o.geometrie);
    if (c) [lng, lat] = c;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: '', lng: '', x: '', y: '' };
  const [x, y] = BV.wgs84NaarRd(lng, lat);
  return { lat: +lat.toFixed(7), lng: +lng.toFixed(7), x: +x.toFixed(2), y: +y.toFixed(2) };
}

/** RD en WGS84 van een puntlocatie (waarneming). */
function puntCoord(w) {
  const lat = Number(w?.lat); const lng = Number(w?.lng);
  if (!w?.lat || !Number.isFinite(lat) || !Number.isFinite(lng)) return ['', '', '', ''];
  const [x, y] = BV.wgs84NaarRd(lng, lat);
  return [+x.toFixed(2), +y.toFixed(2), +lat.toFixed(7), +lng.toFixed(7)];
}

const datum = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? '') ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`) : null);
const getal = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Number(v));

/** Oordeel van een inspectie: { code, tekst, kleur } – conditie (NEN 2767) of boomveiligheidsklasse. */
export function oordeel(i) {
  if (!i) return { code: '', tekst: '', kleur: '' };
  if (i.stowa) {
    const z = ST.zwaarste(i.stowa.waarnemingen);
    return z ? { code: ST.URGENTIE[z].label, tekst: ST.URGENTIE[z].uitleg, kleur: ST.URGENTIE[z].kleur } : { code: 'Geen waarnemingen', tekst: '', kleur: '' };
  }
  if (i.bvc) {
    if (i.bvc.niet) return { code: 'Niet aangetroffen', tekst: 'Niet aangetroffen', kleur: '' };
    const k = BV.BVK[i.bvc.bvk];
    return { code: k?.kort ?? '', tekst: k?.label ?? '', kleur: k?.kleur ?? '' };
  }
  const s = inspectieScore(i);
  return s ? { code: s, tekst: CONDITIES[s].label, kleur: CONDITIES[s].kleur } : { code: '', tekst: '', kleur: '' };
}

/**
 * Stelt de regels samen.
 * @param {object} p
 * @param {{ object: object, inspectie: object|null, status: string, reden?: string }[]} p.lijst
 * @param {Map<string, string>} [p.laagNaam]   laagId → naam
 * @param {(i: object) => [string, string][]} [p.extra]  eigen formuliervelden (label, waarde)
 */
export function resultaatRijen({ lijst, laagNaam = new Map(), extra = () => [] }) {
  const isBvc = lijst.some((r) => r.inspectie?.bvc);
  const isStowa = lijst.some((r) => r.inspectie?.stowa);
  const isNen = lijst.some((r) => r.inspectie && !r.inspectie.bvc && !r.inspectie.stowa);
  const extraLabels = [];
  const extraPer = new Map();
  for (const r of lijst) {
    if (!r.inspectie) continue;
    const e = extra(r.inspectie);
    extraPer.set(r.inspectie.id, new Map(e));
    for (const [l] of e) if (!extraLabels.includes(l)) extraLabels.push(l);
  }

  const kol = [
    ['Objectcode', 14], ['Naam', 28], ['Type', 18], ['Laag', 18], ['Status', 16], ['Reden overslaan', 22],
    ['Datum', 12, 'datum'], ['Inspecteur', 20], ['Soort inspectie', 20],
    [isBvc && !isNen && !isStowa ? 'Boomveiligheidsklasse' : isStowa && !isNen && !isBvc ? 'Zwaarste urgentie' : 'Oordeel', 22, 'oordeel'], ['Omschrijving oordeel', 26],
    ['Aantal gebreken', 10], ['Open maatregelen', 10], ['Urgentste maatregel', 22], ['Volgende inspectie', 13, 'datum'],
  ];
  if (isBvc) kol.push(['Boomsoort', 26], ['Plantjaar', 10], ['Stamdiameter (cm)', 12], ['ORK', 10], ['Controlefrequentie', 14], ['Gesloten beplanting', 12], ['Aantal bomen', 10], ['Methode', 10]);
  if (isNen) kol.push(['Weer', 12], ['Raming open maatregelen (€)', 14, 'euro']);
  if (isStowa) kol.push(['Type kering', 16], ['Soort inspectie (STOWA)', 18], ['Rood', 7], ['Oranje', 7], ['Groen', 7]);
  kol.push(['Samenvatting / opmerking', 44], ["Foto's", 8], ['X (RD)', 12], ['Y (RD)', 12], ['Breedtegraad', 12], ['Lengtegraad', 12]);
  for (const l of extraLabels) kol.push([l, 18]);

  const resultaten = [];
  const gebreken = [];
  const maatregelen = [];
  const fotos = []; // { objectcode, onderwerp, fotoId }
  for (const { object: o, inspectie: i, status, reden } of lijst) {
    const b = i?.bvc ?? null;
    const c = coordinaten(o);
    const oo = oordeel(i);
    const s = i?.stowa ?? null;
    const nenGebreken = i && !b && !s ? (i.gebreken ?? []) : [];
    const waarnemingen = s?.waarnemingen ?? [];
    const openStowa = waarnemingen.filter((w) => (w.maatregel || w.urgentie) && w.maatregelStatus !== 'uitgevoerd');
    const bvcMaatregelen = b?.maatregelen ?? [];
    const openNen = nenGebreken.filter((g) => (g.maatregel || g.urgentie) && g.maatregelStatus !== 'uitgevoerd');
    const openBvc = bvcMaatregelen.filter((m) => m.maatregelStatus !== 'uitgevoerd');
    const urgentst = s
      ? (ST.URGENTIE[ST.zwaarste(openStowa)]?.label ?? '')
      : b
      ? (openBvc.find((m) => m.termijn === 'acuut') ? 'Acuut (48 uur)' : openBvc.length ? BV.URGENTIE[openBvc[0].termijn]?.label ?? '' : '')
      : URGENTIES.find((u) => openNen.some((g) => g.urgentie === u.id))?.label ?? '';
    const volgende = b ? b.volgendeControle : (i ? volgendeInspectie(i.datum, o.inspectieInterval) : '');
    const fotoIds = [...(i?.fotoIds ?? []), ...nenGebreken.flatMap((g) => g.fotoIds ?? []), ...(b?.gebreken ?? []).flatMap((g) => g.fotoIds ?? []),
      ...waarnemingen.flatMap((w) => w.fotoIds ?? [])];
    const rij = [
      o.code ?? '', o.naam ?? '', o.type ?? '', laagNaam.get(o.laagId) ?? '', STATUS_TEKST[i ? i.status : status] ?? status, status === 'overgeslagen' ? (reden ?? '') : '',
      datum(i?.datum), i?.inspecteur ?? '', i?.soort ?? '', oo.code, oo.tekst,
      i ? (s ? waarnemingen.length : b ? (b.gebreken ?? []).length : nenGebreken.length) : '', i ? (s ? openStowa.length : b ? openBvc.length : openNen.length) : '', urgentst, datum(volgende),
    ];
    if (isBvc) {
      const soort = BV.BOOMSOORTEN.find(([w]) => w === b?.soort);
      rij.push(b ? (soort ? `${soort[0]} – ${soort[1]}` : b.soort ?? '') : '', b ? getal(b.plantjaar) : '', b ? getal(b.dbh) : '', b?.ork ?? '',
        b && !b.niet ? BV.CONTROLEFREQUENTIE[b.frequentieJaren ?? BV.frequentie(b.bvk, b.ork)] ?? '' : '', b ? (b.gb ? 'Ja' : 'Nee') : '', b?.gb ? getal(b.aantalBomen) : '', b?.methode ?? '');
    }
    if (isNen) rij.push(i && !b && !s ? i.weer ?? '' : '', i && !b && !s ? openNen.reduce((t, g) => t + (Number(g.kostenraming) || 0), 0) || '' : '');
    if (isStowa) {
      const n = (k) => (s ? waarnemingen.filter((w) => w.urgentieKleur === k).length : '');
      rij.push(s ? ST.KERINGEN[s.kering]?.label ?? '' : '', s?.moment ?? '', n('rood'), n('oranje'), n('groen'));
    }
    rij.push((b ? b.opmerking : i?.samenvatting) ?? '', fotoIds.length || '', c.x, c.y, c.lat, c.lng);
    const ex = i ? extraPer.get(i.id) : null;
    for (const l of extraLabels) rij.push(ex?.get(l) ?? '');
    resultaten.push({ waarden: rij, kleur: oo.kleur });

    if (!i) continue;
    for (const fid of i.fotoIds ?? []) fotos.push({ objectcode: o.code, onderwerp: 'Algemeen', fotoId: fid });
    if (s) {
      waarnemingen.forEach((w, n) => {
        const wz = ST.wijzer(w.wijzer);
        const kenm = Object.entries(w.kenmerken ?? {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}: ${v}`).join('; ');
        gebreken.push({
          waarden: [o.code, o.naam, datum(i.datum), n + 1, [w.zone, w.locatie].filter(Boolean).join(' · '),
            ST.schadebeeldNaam(w), wz ? `${ST.CATEGORIEEN[wz.categorie]} (wijzer ${wz.nr})` : (w.digigids ? 'Digigids' : ''), w.digigidsKlasse ? `Digigids: ${w.digigidsKlasse}` : '',
            '', '', '', ST.URGENTIE[w.urgentieKleur]?.label ?? '', [kenm, w.toelichting].filter(Boolean).join(' — '), w.maatregel ?? '',
            [w.maatregelSoort, w.urgentie ? URGENTIES.find((u) => u.id === w.urgentie)?.label : ''].filter(Boolean).join(' · '), (w.fotoIds ?? []).length || '',
            ...puntCoord(w)],
          kleur: ST.URGENTIE[w.urgentieKleur]?.kleur ?? '',
        });
        if (w.maatregel || w.urgentie) {
          maatregelen.push({ waarden: [o.code, o.naam, datum(i.datum), w.maatregel || `${w.bouwdeel} – ${w.gebrek}`, ST.URGENTIE[w.urgentieKleur]?.label ?? '', null, '', w.maatregelStatus === 'uitgevoerd' ? 'Uitgevoerd' : 'Open'], kleur: ST.URGENTIE[w.urgentieKleur]?.kleur ?? '' });
        }
        for (const fid of w.fotoIds ?? []) fotos.push({ objectcode: o.code, onderwerp: `Waarneming ${n + 1}: ${wz?.naam ?? w.omschrijving ?? ''}`, fotoId: fid });
      });
    } else if (b) {
      (b.gebreken ?? []).forEach((g, n) => {
        gebreken.push({ waarden: [o.code, o.naam, datum(i.datum), n + 1, g.plaats ?? '', g.omschrijving ?? '', g.type || BV.gebrekType(g.omschrijving), g.gevolg ?? '', '', '', '', '', g.toelichting ?? '', '', '', (g.fotoIds ?? []).length || ''], kleur: '' });
        for (const fid of g.fotoIds ?? []) fotos.push({ objectcode: o.code, onderwerp: `Gebrek ${n + 1}: ${g.omschrijving ?? ''}`, fotoId: fid });
      });
      for (const m of bvcMaatregelen) {
        maatregelen.push({ waarden: [o.code, o.naam, datum(i.datum), m.bvcMaatregel ?? '', BV.URGENTIE[m.termijn]?.label ?? '', datum(m.uitvoerenVoor), '', m.maatregelStatus === 'uitgevoerd' ? 'Uitgevoerd' : 'Open'], kleur: m.termijn === 'acuut' ? '#d1452f' : '' });
      }
    } else {
      nenGebreken.forEach((g, n) => {
        const s = gebrekScore(g);
        gebreken.push({
          waarden: [o.code, o.naam, datum(i.datum), n + 1, g.locatie ? `${g.bouwdeel ?? ''} (${g.locatie})` : g.bouwdeel ?? '', g.gebrek ?? '', '', '',
            ERNST[g.ernst]?.label ?? '', INTENSITEIT[g.intensiteit] ?? '', getal(g.omvang), s || '', g.toelichting ?? '', g.maatregel ?? '',
            URGENTIES.find((u) => u.id === g.urgentie)?.label ?? '', (g.fotoIds ?? []).length || ''],
          kleur: s ? CONDITIES[s].kleur : '',
        });
        if (g.maatregel || g.urgentie) {
          maatregelen.push({ waarden: [o.code, o.naam, datum(i.datum), g.maatregel || `${g.bouwdeel} – ${g.gebrek}`, URGENTIES.find((u) => u.id === g.urgentie)?.label ?? '', null, getal(g.kostenraming), g.maatregelStatus === 'uitgevoerd' ? 'Uitgevoerd' : 'Open'], kleur: g.urgentie === 'direct' ? '#d1452f' : '' });
        }
        for (const fid of g.fotoIds ?? []) fotos.push({ objectcode: o.code, onderwerp: `Gebrek ${n + 1}: ${g.bouwdeel ?? ''} – ${g.gebrek ?? ''}`, fotoId: fid });
      });
    }
  }
  const tel = (s) => lijst.filter((r) => (r.inspectie ? r.inspectie.status : r.status) === s).length;
  return {
    kolommen: kol, resultaten, gebreken, maatregelen, fotos,
    telling: { totaal: lijst.length, gedaan: tel('afgerond'), concept: tel('concept'), overgeslagen: tel('overgeslagen'), open: tel('open') },
  };
}

export const GEBREK_KOLOMMEN = [
  ['Objectcode', 14], ['Naam', 26], ['Datum', 12, 'datum'], ['Nr', 5], ['Bouwdeel / plaats', 24], ['Gebrek', 28], ['Type', 16], ['Gevolg / Digigids-klasse', 16],
  ['Ernst', 10], ['Intensiteit', 14], ['Omvang (%)', 10], ['Conditie / urgentie', 11], ['Waarneming / toelichting', 44], ['Maatregel', 34], ['Urgentie', 16], ["Foto's", 8],
  ['X (RD)', 12], ['Y (RD)', 12], ['Breedtegraad', 12], ['Lengtegraad', 12],
];
export const MAATREGEL_KOLOMMEN = [
  ['Objectcode', 14], ['Naam', 26], ['Datum inspectie', 13, 'datum'], ['Maatregel', 40], ['Urgentie', 18], ['Uitvoeren vóór', 13, 'datum'], ['Raming (€)', 12, 'euro'], ['Status', 12],
];

const argb = (hex) => `FF${String(hex).replace('#', '').toUpperCase()}`;
const lichter = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const m = (c) => Math.round(c + (255 - c) * 0.75);
  return `FF${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => m(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

/**
 * @param {any} ExcelJS
 * @param {ReturnType<typeof resultaatRijen>} r
 * @param {object} meta  { titel, project, onderdeel, filter, fotoData?: Map<id, dataUrl> }
 */
export function maakWerkboek(ExcelJS, r, meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inspectie & Registratie';
  wb.created = new Date();
  const kop = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4F6C' } }, alignment: { vertical: 'middle', wrapText: true } };

  const info = wb.addWorksheet('Overzicht', { properties: { tabColor: { argb: 'FF0B4F6C' } } });
  info.getColumn(1).width = 26;
  info.getColumn(2).width = 60;
  info.getCell('A1').value = meta.titel;
  info.getCell('A1').font = { bold: true, size: 16 };
  const regels = [
    ['Project', meta.project ?? ''], ['Onderdeel', meta.onderdeel ?? ''], ['Filter', meta.filter ?? ''], ['Geëxporteerd op', new Date()],
    [''], ['Objecten / inspecties', r.telling.totaal], ['Gedaan (afgerond)', r.telling.gedaan], ['Concept', r.telling.concept],
    ['Overgeslagen', r.telling.overgeslagen], ['Nog open', r.telling.open], ['Gebreken', r.gebreken.length], ['Maatregelen', r.maatregelen.length],
  ];
  regels.forEach(([k, v], n) => {
    info.getCell(n + 3, 1).value = k;
    info.getCell(n + 3, 1).font = { bold: true };
    if (v !== undefined) info.getCell(n + 3, 2).value = v;
  });
  info.getCell(6, 2).numFmt = 'dd-mm-yyyy hh:mm';
  info.getCell(regels.length + 4, 1).value = 'Oordeel: conditie volgens NEN 2767 (1 = uitstekend … 6 = zeer slecht) of boomveiligheidsklasse volgens het Boomveiligheidsprotocol RWS.';
  info.getCell(regels.length + 4, 1).font = { italic: true, color: { argb: 'FF555555' } };

  const blad = (naam, kolommen, rijen, kleurKolom) => {
    const ws = wb.addWorksheet(naam, { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
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
  const oordeelKol = r.kolommen.findIndex(([, , s]) => s === 'oordeel') + 1;
  blad('Resultaten', r.kolommen, r.resultaten, oordeelKol);
  if (r.gebreken.length) blad('Gebreken', GEBREK_KOLOMMEN, r.gebreken, 12);
  if (r.maatregelen.length) blad('Maatregelen', MAATREGEL_KOLOMMEN, r.maatregelen, 5);

  const fotoData = meta.fotoData;
  if (fotoData?.size) {
    const ws = wb.addWorksheet("Foto's", { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [{ header: 'Objectcode', width: 14 }, { header: 'Onderwerp', width: 40 }, { header: 'Foto', width: 42 }];
    ws.getRow(1).eachCell((c) => { c.style = kop; });
    let rij = 2;
    for (const f of r.fotos) {
      const data = fotoData.get(f.fotoId);
      if (!data) continue;
      const m = String(data).match(/^data:image\/(png|jpe?g|gif);base64,/i);
      if (!m) continue;
      ws.getCell(rij, 1).value = f.objectcode;
      ws.getCell(rij, 2).value = f.onderwerp;
      ws.getCell(rij, 1).alignment = { vertical: 'top' };
      ws.getCell(rij, 2).alignment = { vertical: 'top', wrapText: true };
      ws.getRow(rij).height = 170;
      const id = wb.addImage({ base64: data, extension: m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase() });
      ws.addImage(id, { tl: { col: 2.05, row: rij - 1 + 0.05 }, ext: { width: 290, height: 218 } });
      rij++;
    }
  }
  return wb;
}
