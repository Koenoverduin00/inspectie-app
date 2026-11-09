// Werkpakketten via Excel: een 'idiot-proof' sjabloon (keuzelijsten, controles, beveiligde
// bladen) en het inlezen + controleren ervan. Structuur: werkpakket → rondes (taken) → objecten.
// ExcelJS wordt pas geladen als het nodig is; de controle (verwerkImport) is puur en testbaar.
import { rondesVan, rondeView, rondeCode } from './pakketten.js';

export const BLAD = { uitleg: 'Uitleg', pakketten: 'Werkpakketten', rondes: 'Rondes', objecten: 'Objecten', lijsten: 'Lijsten' };

const KOLOMMEN = {
  pakketten: [
    ['code', 'Pakketcode*', 18], ['naam', 'Naam*', 36], ['u1', 'Uitvoerder 1', 26], ['u2', 'Uitvoerder 2', 26], ['u3', 'Uitvoerder 3', 26],
    ['vrijgave', 'Flora & fauna vrijgave', 14], ['instructie', 'Instructie voor de uitvoerder', 50],
  ],
  rondes: [
    ['pakket', 'Pakketcode*', 18], ['nummer', 'Rondenr*', 10], ['rondecode', 'Rondecode (automatisch)', 20], ['naam', 'Naam ronde*', 28],
    ['soort', 'Soort*', 15], ['subsoort', 'Werk- / inspectiesoort', 28], ['start', 'Start', 13], ['eind', 'Gereed uiterlijk', 15], ['status', 'Status', 12],
  ],
  objecten: [
    ['pakket', 'Pakketcode*', 18], ['object', 'Objectcode', 18], ['laag', 'Of: hele GIS-laag', 26], ['ronde', 'Alleen in ronde', 18],
    ['naam', 'Objectnaam / controle (automatisch)', 40], ['type', 'Type (automatisch)', 20], ['laagnaam', 'Laag (automatisch)', 24],
  ],
};
const AUTOMATISCH = new Set(['rondecode', 'naam:objecten', 'type', 'laagnaam']);

export const SOORT_LABEL = { werk: 'Werkzaamheid', inspectie: 'Inspectie' };
export const STATUS_LABEL = { gepland: 'Gepland', actief: 'Actief', afgerond: 'Afgerond' };
const MAX = { pakketten: 1000, rondes: 5000, objecten: 20000 };

let laden = null;
/** Laadt ExcelJS (±850 kB) pas bij gebruik. */
export function laadExcelJS(pad = 'vendor/exceljs/exceljs.bare.min.js') {
  if (globalThis.ExcelJS) return Promise.resolve(globalThis.ExcelJS);
  laden ??= new Promise((ok, fout) => {
    const s = document.createElement('script');
    s.src = pad;
    s.onload = () => ok(globalThis.ExcelJS);
    s.onerror = () => { laden = null; fout(new Error('Excel-module kon niet worden geladen.')); };
    document.head.appendChild(s);
  });
  return laden;
}

const kolomLetter = (n) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};
const ki = (blad, sleutel) => KOLOMMEN[blad].findIndex(([k]) => k === sleutel) + 1;
const kl = (blad, sleutel) => kolomLetter(ki(blad, sleutel));
const isoNaarDatum = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? new Date(`${iso}T00:00:00Z`) : null);

/**
 * Bouwt het sjabloon (leeg of gevuld met de huidige pakketten).
 * @param {any} ExcelJS
 * @param {object} c  { project, objecten, lagen, leden, werksoorten, inspectiesoorten, pakketten }
 */
export function maakWerkboek(ExcelJS, { project, objecten, lagen, leden, werksoorten, inspectiesoorten, pakketten = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inspectie & Registratie';
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const laagNaam = new Map(lagen.map((l) => [l.id, l.naam]));
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  const kop = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5CAD' } }, alignment: { vertical: 'middle', wrapText: true } };
  const grijs = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1F4' } };

  // --- Uitleg -------------------------------------------------------------------
  const u = wb.addWorksheet(BLAD.uitleg, { properties: { tabColor: { argb: 'FF0B5CAD' } } });
  u.getColumn(1).width = 110;
  const regels = [
    ['Werkpakketten inladen – ' + (project?.naam ?? 'project'), { bold: true, size: 16 }],
    [''],
    ['Structuur: WERKPAKKET → RONDES (taken) → OBJECTEN', { bold: true }],
    ['1. Blad "Werkpakketten": één regel per werkpakket. De pakketcode is de vaste sleutel (bijv. WP-2027-001).'],
    ['   Bestaat de code al in de app, dan wordt dat pakket bijgewerkt; anders wordt het nieuw aangemaakt.'],
    ['2. Blad "Rondes": één regel per ronde/taak binnen een pakket (bijv. R1 Maaien april, R2 Maaien juni).'],
    ['   Kies eerst de Soort; daarna toont "Werk- / inspectiesoort" alleen de passende keuzes.'],
    ['3. Blad "Objecten": koppel objecten aan het pakket – per objectcode óf in één keer een hele GIS-laag.'],
    ['   Laat "Alleen in ronde" leeg: het object hoort bij álle rondes van het pakket (aanbevolen).'],
    ['   Vul "Alleen in ronde" alleen in als een object maar in één ronde mee moet (bijv. R3 = alleen de bermen).'],
    ['   Moet een object in twee (maar niet alle) rondes? Zet het dan twee keer in de lijst, met elk een ronde.'],
    [''],
    ['Zo werkt het sjabloon', { bold: true }],
    ['• Alleen de witte kolommen zijn invulbaar; grijze kolommen rekenen zichzelf uit en zijn beveiligd.'],
    ['• Kies waar mogelijk uit de keuzelijst (pijltje in de cel). Een ongeldige waarde wordt direct geweigerd.'],
    ['• Datums als dd-mm-jjjj. "Gereed uiterlijk" mag niet vóór de startdatum liggen.'],
    ['• Een ⚠ in de grijze controlekolom betekent dat de regel nog niet klopt.'],
    ['• Regels verwijderen: maak de witte cellen leeg (Delete). Lege regels worden overgeslagen.'],
    [''],
    ['Bij het inladen', { bold: true }],
    ['• De app controleert het hele bestand opnieuw en toont eerst een overzicht met eventuele fouten; pas daarna sla je op.'],
    ['• Werkpakketten die niet in het bestand staan, blijven ongewijzigd. Rondes worden nooit via Excel verwijderd.'],
    ['• Objecten die al gedaan of overgeslagen zijn, worden nooit uit een pakket gehaald.'],
    ['• Rondenummers blijven gekoppeld aan de bestaande ronde: R1 in het bestand = R1 in de app.'],
    [''],
    [`Keuzelijsten bevatten ${objecten.length} objecten, ${lagen.length} GIS-lagen en ${leden.length} projectleden (stand ${new Date().toLocaleDateString('nl-NL')}).`, { italic: true }],
    ['Nieuwe objecten of leden toegevoegd? Download dan een nieuw sjabloon.', { italic: true }],
  ];
  regels.forEach(([t, font], i) => {
    const cel = u.getCell(i + 1, 1);
    cel.value = t;
    if (font) cel.font = font;
  });
  u.protect('', { selectLockedCells: true, selectUnlockedCells: true });

  // --- Lijsten (verborgen) --------------------------------------------------------
  const l = wb.addWorksheet(BLAD.lijsten, { state: 'veryHidden' });
  const soortWerk = [...new Set(werksoorten)];
  const soortInsp = [...new Set(inspectiesoorten)];
  const lagenNamen = [...new Set(lagen.map((x) => x.naam).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'));
  const objSort = [...objecten].sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true }));
  const kolomLijst = (kol, titel, waarden) => {
    l.getCell(1, kol).value = titel;
    waarden.forEach((w, i) => { l.getCell(i + 2, kol).value = w; });
  };
  kolomLijst(1, 'Leden', leden);
  kolomLijst(2, 'Werkzaamheid', soortWerk);
  kolomLijst(3, 'Inspectie', soortInsp);
  kolomLijst(4, 'Soort', Object.values(SOORT_LABEL));
  kolomLijst(5, 'Status', Object.values(STATUS_LABEL));
  kolomLijst(6, 'JaNee', ['Ja', 'Nee']);
  kolomLijst(7, 'Objectcode', objSort.map((o) => String(o.code ?? '')));
  kolomLijst(8, 'Objectnaam', objSort.map((o) => String(o.naam ?? '')));
  kolomLijst(9, 'Type', objSort.map((o) => String(o.type ?? '')));
  kolomLijst(10, 'Laag', objSort.map((o) => laagNaam.get(o.laagId) ?? ''));
  kolomLijst(11, 'Lagen', lagenNamen);
  l.getCell(1, 12).value = 'projectId';
  l.getCell(2, 12).value = project?.id ?? '';
  const naam = (n, kol, aantal) => wb.definedNames.add(`${BLAD.lijsten}!$${kolomLetter(kol)}$2:$${kolomLetter(kol)}$${Math.max(2, aantal + 1)}`, n);
  naam('Leden', 1, leden.length);
  naam('Werkzaamheid', 2, soortWerk.length);
  naam('Inspectie', 3, soortInsp.length);
  naam('Objectcodes', 7, objSort.length);
  naam('ObjectLagen', 10, objSort.length);
  naam('Lagen', 11, lagenNamen.length);
  wb.definedNames.add(`${BLAD.lijsten}!$G$2:$J$${Math.max(2, objSort.length + 1)}`, 'ObjectTabel');
  l.protect('', {});

  // --- Invoerbladen ---------------------------------------------------------------
  const blad = (sleutel, titel, kleur) => {
    const ws = wb.addWorksheet(titel, { properties: { tabColor: { argb: kleur } }, views: [{ state: 'frozen', ySplit: 1 }] });
    KOLOMMEN[sleutel].forEach(([k, label, breedte], i) => {
      const kol = ws.getColumn(i + 1);
      kol.width = breedte;
      const auto = AUTOMATISCH.has(k) || AUTOMATISCH.has(`${k}:${sleutel}`);
      if (auto) kol.fill = grijs;
      else kol.protection = { locked: false };
      const cel = ws.getCell(1, i + 1);
      cel.value = label;
      cel.style = { ...kop, protection: { locked: true } };
    });
    ws.getRow(1).height = 32;
    ws.autoFilter = { from: 'A1', to: `${kolomLetter(KOLOMMEN[sleutel].length)}1` };
    return ws;
  };
  const dv = (ws, sleutel, kol, n, regel) => ws.dataValidations.add(`${kl(sleutel, kol)}2:${kl(sleutel, kol)}${n}`, {
    allowBlank: true, showInputMessage: true, showErrorMessage: true, errorStyle: 'stop', ...regel,
  });
  const vergrendel = (ws, sleutel, kol) => {
    const c = ws.getColumn(ki(sleutel, kol));
    c.protection = { locked: true };
    c.fill = grijs;
  };

  // Werkpakketten
  const wp = blad('pakketten', BLAD.pakketten, 'FF1A7F37');
  const nP = MAX.pakketten + 1;
  wb.definedNames.add(`${BLAD.pakketten}!$A$2:$A$${nP}`, 'Pakketcodes');
  dv(wp, 'pakketten', 'code', nP, {
    type: 'custom', formulae: [`AND(LEN(TRIM(A2))>0,LEN(A2)<=40,COUNTIF($A$2:$A$${nP},A2)=1)`],
    promptTitle: 'Pakketcode', prompt: 'Unieke code, bijv. WP-2027-001. Bestaande code = pakket bijwerken.',
    errorTitle: 'Pakketcode', error: 'De pakketcode moet uniek zijn en maximaal 40 tekens lang.',
  });
  dv(wp, 'pakketten', 'naam', nP, {
    type: 'textLength', operator: 'between', formulae: [1, 120],
    promptTitle: 'Naam', prompt: 'Naam van het werkpakket (max. 120 tekens).', errorTitle: 'Naam', error: 'Maximaal 120 tekens.',
  });
  for (const k of ['u1', 'u2', 'u3']) {
    if (leden.length) {
      dv(wp, 'pakketten', k, nP, {
        type: 'list', formulae: ['Leden'], promptTitle: 'Uitvoerder', prompt: 'Kies een projectlid. Leeg = iedereen in het project.',
        errorTitle: 'Uitvoerder', error: 'Kies een projectlid uit de lijst.',
      });
    } else vergrendel(wp, 'pakketten', k);
  }
  dv(wp, 'pakketten', 'vrijgave', nP, {
    type: 'list', formulae: ['"Ja,Nee"'], promptTitle: 'Flora & fauna', prompt: 'Is een ecologische vrijgave vereist? Leeg = Nee.',
    errorTitle: 'Flora & fauna', error: 'Kies Ja of Nee.',
  });
  dv(wp, 'pakketten', 'instructie', nP, {
    type: 'textLength', operator: 'lessThanOrEqual', formulae: [2000], promptTitle: 'Instructie', prompt: 'Optioneel, max. 2000 tekens.',
    errorTitle: 'Instructie', error: 'Maximaal 2000 tekens.',
  });

  // Rondes
  const rs = blad('rondes', BLAD.rondes, 'FFE07B00');
  // Een echte datum (Excel-getal) tussen ondergrens en 2100.
  const datumRegel = (k, ondergrens) => {
    const c = `${kl('rondes', k)}2`;
    return `AND(ISNUMBER(${c}),${c}>=${ondergrens},${c}<=DATE(2100,1,1))`;
  };
  const nR = MAX.rondes + 1;
  wb.definedNames.add(`${BLAD.rondes}!$C$2:$C$${nR}`, 'Rondecodes');
  dv(rs, 'rondes', 'pakket', nR, {
    type: 'list', formulae: ['Pakketcodes'], promptTitle: 'Pakketcode', prompt: 'Kies een pakket van het blad Werkpakketten.',
    errorTitle: 'Pakketcode', error: 'Kies een pakketcode die op het blad Werkpakketten staat.',
  });
  dv(rs, 'rondes', 'nummer', nR, {
    type: 'custom', formulae: [`AND(ISNUMBER(B2),B2=INT(B2),B2>=1,B2<=99,COUNTIFS($A$2:$A$${nR},A2,$B$2:$B$${nR},B2)=1)`],
    promptTitle: 'Rondenummer', prompt: 'Heel getal 1–99, uniek binnen het pakket (1 = eerste ronde).',
    errorTitle: 'Rondenummer', error: 'Vul een heel getal van 1 t/m 99 in dat nog niet bij dit pakket voorkomt.',
  });
  dv(rs, 'rondes', 'naam', nR, {
    type: 'textLength', operator: 'between', formulae: [1, 80], promptTitle: 'Naam ronde', prompt: 'Bijv. "Maaien april" of "Schouw voorjaar".',
    errorTitle: 'Naam ronde', error: 'Maximaal 80 tekens.',
  });
  dv(rs, 'rondes', 'soort', nR, {
    type: 'list', formulae: [`"${SOORT_LABEL.werk},${SOORT_LABEL.inspectie}"`], promptTitle: 'Soort', prompt: 'Werkzaamheid of Inspectie (schouw).',
    errorTitle: 'Soort', error: 'Kies Werkzaamheid of Inspectie.',
  });
  dv(rs, 'rondes', 'subsoort', nR, {
    type: 'list', formulae: [`INDIRECT($${kl('rondes', 'soort')}2)`], promptTitle: 'Werk- / inspectiesoort', prompt: 'Kies eerst de Soort; daarna verschijnen hier de passende keuzes.',
    errorTitle: 'Werk- / inspectiesoort', error: 'Kies een waarde uit de lijst (kies eerst de Soort).',
  });
  dv(rs, 'rondes', 'start', nR, {
    type: 'custom', formulae: [datumRegel('start', 'DATE(2000,1,1)')],
    promptTitle: 'Start', prompt: 'Datum als dd-mm-jjjj.', errorTitle: 'Start', error: 'Vul een geldige datum in (dd-mm-jjjj).',
  });
  dv(rs, 'rondes', 'eind', nR, {
    type: 'custom', formulae: [datumRegel('eind', `MAX($${kl('rondes', 'start')}2,DATE(2000,1,1))`)],
    promptTitle: 'Gereed uiterlijk', prompt: 'Datum als dd-mm-jjjj, niet vóór de start.', errorTitle: 'Gereed uiterlijk', error: 'Vul een geldige datum in die niet vóór de startdatum ligt.',
  });
  dv(rs, 'rondes', 'status', nR, {
    type: 'list', formulae: [`"${Object.values(STATUS_LABEL).join(',')}"`], promptTitle: 'Status', prompt: 'Leeg = Gepland. Alleen Actieve rondes verschijnen bij de uitvoerders.',
    errorTitle: 'Status', error: 'Kies Gepland, Actief of Afgerond.',
  });
  for (const k of ['start', 'eind']) rs.getColumn(ki('rondes', k)).numFmt = 'dd-mm-yyyy';

  // Objecten
  const os = blad('objecten', BLAD.objecten, 'FF6E40C9');
  const nO = MAX.objecten + 1;
  dv(os, 'objecten', 'pakket', nO, {
    type: 'list', formulae: ['Pakketcodes'], promptTitle: 'Pakketcode', prompt: 'Kies het pakket waar dit object bij hoort.',
    errorTitle: 'Pakketcode', error: 'Kies een pakketcode die op het blad Werkpakketten staat.',
  });
  if (objSort.length) {
    dv(os, 'objecten', 'object', nO, {
      type: 'list', formulae: ['Objectcodes'], promptTitle: 'Objectcode', prompt: 'Kies óf een object, óf een hele GIS-laag in de volgende kolom.',
      errorTitle: 'Objectcode', error: 'Deze objectcode bestaat niet in het project.',
    });
  } else vergrendel(os, 'objecten', 'object');
  if (lagenNamen.length) {
    dv(os, 'objecten', 'laag', nO, {
      type: 'list', formulae: ['Lagen'], promptTitle: 'Hele GIS-laag', prompt: 'Alle objecten van deze laag in één keer. Laat Objectcode dan leeg.',
      errorTitle: 'GIS-laag', error: 'Kies een laag uit de lijst.',
    });
  } else vergrendel(os, 'objecten', 'laag');
  dv(os, 'objecten', 'ronde', nO, {
    type: 'list', formulae: ['Rondecodes'], promptTitle: 'Alleen in ronde', prompt: 'Meestal leeg laten (= alle rondes). Alleen invullen als dit object maar in één ronde mee moet.',
    errorTitle: 'Ronde', error: 'Kies een rondecode van het blad Rondes.',
  });

  // Gevulde regels (export) ------------------------------------------------------
  const rijenP = [];
  const rijenR = [];
  const rijenO = [];
  for (const p of pakketten) {
    const t = p.toegewezen ?? [];
    rijenP.push([p.code, p.naam, t[0] ?? '', t[1] ?? '', t[2] ?? '', p.vrijgaveVereist ? 'Ja' : 'Nee', p.omschrijving ?? '']);
    const rondes = rondesVan(p);
    for (const r of rondes) {
      rijenR.push([p.code, Number(r.nummer) || 1, null, r.naam, SOORT_LABEL[r.soort] ?? SOORT_LABEL.werk,
        (r.soort === 'inspectie' ? r.inspectiesoort : r.werksoort) || '', isoNaarDatum(r.start), isoNaarDatum(r.eind), STATUS_LABEL[r.status] ?? STATUS_LABEL.gepland]);
    }
    const perRonde = rondes.map((r) => ({ r, set: new Set(rondeView(p, r).objecten) }));
    for (const id of p.objecten ?? []) {
      const o = objectMap.get(id);
      if (!o) continue;
      const in_ = perRonde.filter((x) => x.set.has(id));
      if (in_.length === perRonde.length) rijenO.push([p.code, o.code, '', '']);
      else in_.forEach(({ r }) => rijenO.push([p.code, o.code, '', rondeCode(p, r)]));
    }
  }
  const schrijf = (ws, rijen) => rijen.forEach((rij, i) => rij.forEach((v, j) => {
    if (v !== null && v !== '' && v !== undefined) ws.getCell(i + 2, j + 1).value = v;
  }));
  schrijf(wp, rijenP);
  schrijf(rs, rijenR);
  schrijf(os, rijenO);

  // Formules in de automatische kolommen ------------------------------------------
  const A = (k) => kl('rondes', k);
  for (let r = 2; r <= Math.max(1000, rijenR.length + 500) + 1; r++) {
    rs.getCell(r, ki('rondes', 'rondecode')).value = { formula: `IF(OR(${A('pakket')}${r}="",${A('nummer')}${r}=""),"",${A('pakket')}${r}&"-R"&${A('nummer')}${r})` };
  }
  const O = (k) => kl('objecten', k);
  for (let r = 2; r <= Math.max(3000, rijenO.length + 1000) + 1; r++) {
    const [p, ob, la, ro] = [`${O('pakket')}${r}`, `${O('object')}${r}`, `${O('laag')}${r}`, `${O('ronde')}${r}`];
    os.getCell(r, ki('objecten', 'naam')).value = {
      formula: `IF(AND(${p}="",${ob}="",${la}=""),"",IF(${p}="","⚠ kies een pakketcode",IF(AND(${ob}<>"",${la}<>""),"⚠ kies óf object óf laag",`
        + `IF(AND(${ro}<>"",LEFT(${ro},LEN(${p})+2)<>${p}&"-R"),"⚠ ronde hoort bij een ander pakket",`
        + `IF(${ob}<>"",IFERROR(VLOOKUP(${ob},ObjectTabel,2,FALSE),"⚠ onbekende objectcode"),IF(${la}<>"",COUNTIF(ObjectLagen,${la})&" objecten (hele laag)","⚠ kies een object of laag"))))))`,
    };
    os.getCell(r, ki('objecten', 'type')).value = { formula: `IF(${ob}="","",IFERROR(VLOOKUP(${ob},ObjectTabel,3,FALSE),""))` };
    os.getCell(r, ki('objecten', 'laagnaam')).value = { formula: `IF(${ob}="",IF(${la}="","",${la}),IFERROR(VLOOKUP(${ob},ObjectTabel,4,FALSE),""))` };
  }
  os.addConditionalFormatting({
    ref: `${O('naam')}2:${O('naam')}${nO}`,
    rules: [{ type: 'containsText', operator: 'containsText', text: '⚠', style: { font: { color: { argb: 'FFC62828' }, bold: true } } }],
  });

  for (const ws of [wp, rs, os]) {
    ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, formatColumns: true });
  }
  wb.views = [{ activeTab: 1 }];
  return wb;
}

// ---------------------------------------------------------------------------
// Inlezen
// ---------------------------------------------------------------------------
const tekst = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return tekst(v.result);
    if (v.richText) return v.richText.map((x) => x.text).join('');
    if ('text' in v) return tekst(v.text);
    if (v.error) return '';
  }
  return String(v).trim();
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/[*()]/g, '').replace(/\s+/g, ' ').trim();

/** Leest de drie invoerbladen uit een ExcelJS-werkboek naar platte regels (met rijnummer). */
export function leesWerkboek(wb) {
  const uit = { meta: { projectId: '' }, pakketten: [], rondes: [], objecten: [], ontbrekend: [] };
  const l = wb.getWorksheet(BLAD.lijsten);
  if (l) uit.meta.projectId = tekst(l.getCell(2, 12).value);
  for (const sleutel of ['pakketten', 'rondes', 'objecten']) {
    const ws = wb.getWorksheet(BLAD[sleutel]);
    if (!ws) { uit.ontbrekend.push(BLAD[sleutel]); continue; }
    const koppen = new Map();
    ws.getRow(1).eachCell((c, kol) => koppen.set(norm(tekst(c.value)), kol));
    const kolVan = (k, label, i) => koppen.get(norm(label)) ?? i + 1;
    const kols = KOLOMMEN[sleutel].map(([k, label], i) => [k, kolVan(k, label, i)]);
    const invoer = KOLOMMEN[sleutel].filter(([k]) => !(AUTOMATISCH.has(k) || AUTOMATISCH.has(`${k}:${sleutel}`))).map(([k]) => k);
    ws.eachRow((row, rij) => {
      if (rij === 1) return;
      const r = { rij };
      for (const [k, kol] of kols) {
        const v = row.getCell(kol).value;
        r[k] = v instanceof Date || typeof v === 'number' ? v : tekst(v);
      }
      if (invoer.every((k) => r[k] === '' || r[k] === null || r[k] === undefined)) return;
      uit[sleutel].push(r);
    });
  }
  return uit;
}

/** Datum uit een cel (Date, Excel-serienummer of tekst) naar JJJJ-MM-DD; '' = leeg, null = ongeldig. */
export function leesDatum(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return v > 0 && v < 100000 ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return geldig(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return geldig(+m[3], +m[2], +m[1]);
  return null;
}
function geldig(j, mnd, d) {
  const dt = new Date(Date.UTC(j, mnd - 1, d));
  return dt.getUTCFullYear() === j && dt.getUTCMonth() === mnd - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

const SOORT_UIT = { werkzaamheid: 'werk', werk: 'werk', inspectie: 'inspectie', schouw: 'inspectie' };
const STATUS_UIT = { gepland: 'gepland', actief: 'actief', afgerond: 'afgerond' };

/**
 * Controleert de ingelezen regels en bepaalt wat er per werkpakket verandert.
 * Niets wordt opgeslagen; de aanroeper slaat `pakketten[].record` op als er geen fouten zijn.
 * @param {ReturnType<typeof leesWerkboek>} raw
 * @param {object} c
 * @param {object[]} c.objecten
 * @param {object[]} c.lagen
 * @param {string[]} c.leden
 * @param {string[]} c.werksoorten
 * @param {string[]} c.inspectiesoorten
 * @param {object[]} c.bestaand          werkpakketten in dit project
 * @param {Map<string, Map<string, Set<string>>>} [c.gedaan]  pakketId → rondeId → gedane/overgeslagen objectIds
 * @param {boolean} [c.verwijderOntbrekend]
 * @param {string} [c.projectId]
 * @param {() => string} c.nieuwId
 */
export function verwerkImport(raw, c) {
  const fouten = [];
  const waarschuwingen = [];
  const fout = (blad, rij, t) => fouten.push({ blad, rij, tekst: t });
  const let_op = (blad, rij, t) => waarschuwingen.push({ blad, rij, tekst: t });
  for (const b of raw.ontbrekend ?? []) fout(b, null, `Blad "${b}" ontbreekt. Gebruik het sjabloon uit de app.`);
  if (c.projectId && raw.meta?.projectId && raw.meta.projectId !== c.projectId) {
    let_op(BLAD.uitleg, null, 'Dit bestand is gemaakt in een ander project. Codes worden opgezocht in het huidige project.');
  }

  const objPerCode = new Map();
  for (const o of c.objecten) {
    const k = String(o.code ?? '').trim().toLowerCase();
    if (k && !objPerCode.has(k)) objPerCode.set(k, o);
  }
  const lagenPerNaam = new Map();
  for (const l of c.lagen) {
    const k = String(l.naam ?? '').trim().toLowerCase();
    if (!lagenPerNaam.has(k)) lagenPerNaam.set(k, []);
    lagenPerNaam.get(k).push(l.id);
  }
  const leden = new Map(c.leden.map((x) => [String(x).toLowerCase(), String(x).toLowerCase()]));
  const werk = new Map(c.werksoorten.map((x) => [x.toLowerCase(), x]));
  const insp = new Map(c.inspectiesoorten.map((x) => [x.toLowerCase(), x]));
  const bestaandPerCode = new Map(c.bestaand.filter((p) => p.code).map((p) => [p.code.toLowerCase(), p]));
  const objectVolgorde = new Map([...c.objecten].sort((a, b) => String(a.code).localeCompare(String(b.code), 'nl', { numeric: true })).map((o, i) => [o.id, i]));

  // 1. Werkpakketten
  const pakketten = new Map(); // code(lc) → { code, rij, ... }
  for (const r of raw.pakketten) {
    const code = String(r.code ?? '').trim();
    const B = BLAD.pakketten;
    if (!code) { fout(B, r.rij, 'Pakketcode ontbreekt.'); continue; }
    if (code.length > 40) fout(B, r.rij, 'Pakketcode is langer dan 40 tekens.');
    const lc = code.toLowerCase();
    if (pakketten.has(lc)) { fout(B, r.rij, `Pakketcode ${code} staat dubbel (ook op rij ${pakketten.get(lc).rij}).`); continue; }
    const naam = String(r.naam ?? '').trim();
    if (!naam) fout(B, r.rij, 'Naam ontbreekt.');
    const toegewezen = [];
    for (const k of ['u1', 'u2', 'u3']) {
      const v = String(r[k] ?? '').trim().toLowerCase();
      if (!v) continue;
      if (!leden.has(v)) fout(B, r.rij, `Uitvoerder ${r[k]} is geen lid van het project.`);
      else if (!toegewezen.includes(v)) toegewezen.push(v);
    }
    const vg = String(r.vrijgave ?? '').trim().toLowerCase();
    if (vg && !['ja', 'nee'].includes(vg)) fout(B, r.rij, 'Flora & fauna vrijgave moet Ja of Nee zijn.');
    pakketten.set(lc, {
      code, rij: r.rij, naam, toegewezen, vrijgaveVereist: vg === 'ja', omschrijving: String(r.instructie ?? '').trim().slice(0, 2000),
      rondes: new Map(), algemeen: [], perRonde: new Map(), heeftObjectregels: false,
    });
  }

  // 2. Rondes
  for (const r of raw.rondes) {
    const B = BLAD.rondes;
    const p = pakketten.get(String(r.pakket ?? '').trim().toLowerCase());
    if (!p) { fout(B, r.rij, r.pakket ? `Pakketcode ${r.pakket} staat niet op het blad Werkpakketten.` : 'Pakketcode ontbreekt.'); continue; }
    const nr = Number(typeof r.nummer === 'string' ? r.nummer.replace(',', '.') : r.nummer);
    if (!Number.isInteger(nr) || nr < 1 || nr > 99) { fout(B, r.rij, 'Rondenr moet een heel getal van 1 t/m 99 zijn.'); continue; }
    if (p.rondes.has(nr)) { fout(B, r.rij, `Ronde R${nr} staat dubbel bij ${p.code} (ook op rij ${p.rondes.get(nr).rij}).`); continue; }
    const naam = String(r.naam ?? '').trim();
    if (!naam) fout(B, r.rij, 'Naam ronde ontbreekt.');
    const soort = SOORT_UIT[String(r.soort ?? '').trim().toLowerCase()];
    if (!soort) fout(B, r.rij, 'Soort moet Werkzaamheid of Inspectie zijn.');
    const sub = String(r.subsoort ?? '').trim();
    let werksoort = '';
    let inspectiesoort = '';
    if (soort === 'werk' && sub) {
      werksoort = werk.get(sub.toLowerCase()) ?? '';
      if (!werksoort) fout(B, r.rij, `Werksoort "${sub}" bestaat niet (kies uit de lijst).`);
    }
    if (soort === 'inspectie') {
      inspectiesoort = sub ? (insp.get(sub.toLowerCase()) ?? '') : 'Schouw';
      if (sub && !inspectiesoort) fout(B, r.rij, `Inspectiesoort "${sub}" bestaat niet (kies uit de lijst).`);
      if (!sub) let_op(B, r.rij, 'Geen inspectiesoort gekozen: Schouw gebruikt.');
    }
    const start = leesDatum(r.start);
    const eind = leesDatum(r.eind);
    if (start === null) fout(B, r.rij, 'Start is geen geldige datum (dd-mm-jjjj).');
    if (eind === null) fout(B, r.rij, 'Gereed uiterlijk is geen geldige datum (dd-mm-jjjj).');
    if (start && eind && eind < start) fout(B, r.rij, 'Gereed uiterlijk ligt vóór de start.');
    const stTekst = String(r.status ?? '').trim().toLowerCase();
    const status = stTekst ? STATUS_UIT[stTekst] : '';
    if (stTekst && !status) fout(B, r.rij, 'Status moet Gepland, Actief of Afgerond zijn.');
    p.rondes.set(nr, { rij: r.rij, nummer: nr, naam, soort: soort ?? 'werk', werksoort, inspectiesoort, start: start || '', eind: eind || '', status });
  }

  // 3. Objecten
  for (const r of raw.objecten) {
    const B = BLAD.objecten;
    const p = pakketten.get(String(r.pakket ?? '').trim().toLowerCase());
    if (!p) { fout(B, r.rij, r.pakket ? `Pakketcode ${r.pakket} staat niet op het blad Werkpakketten.` : 'Pakketcode ontbreekt.'); continue; }
    p.heeftObjectregels = true;
    const code = String(r.object ?? '').trim();
    const laag = String(r.laag ?? '').trim();
    if (code && laag) { fout(B, r.rij, 'Vul óf een objectcode óf een GIS-laag in, niet allebei.'); continue; }
    if (!code && !laag) { fout(B, r.rij, 'Vul een objectcode of een GIS-laag in.'); continue; }
    let ids = [];
    if (code) {
      const o = objPerCode.get(code.toLowerCase());
      if (!o) { fout(B, r.rij, `Objectcode ${code} bestaat niet in dit project.`); continue; }
      ids = [o.id];
    } else {
      const laagIds = lagenPerNaam.get(laag.toLowerCase());
      if (!laagIds) { fout(B, r.rij, `GIS-laag "${laag}" bestaat niet in dit project.`); continue; }
      const set = new Set(laagIds);
      ids = c.objecten.filter((o) => set.has(o.laagId)).map((o) => o.id);
      if (!ids.length) let_op(B, r.rij, `GIS-laag "${laag}" heeft geen objecten.`);
    }
    const ronde = String(r.ronde ?? '').trim();
    if (!ronde) { p.algemeen.push(...ids); continue; }
    const m = ronde.match(/-R(\d+)$/i);
    const nr = m ? Number(m[1]) : NaN;
    if (!m || ronde.slice(0, m.index).toLowerCase() !== p.code.toLowerCase()) { fout(B, r.rij, `Ronde ${ronde} hoort niet bij pakket ${p.code}.`); continue; }
    if (!p.rondes.has(nr)) { fout(B, r.rij, `Ronde ${ronde} staat niet op het blad Rondes.`); continue; }
    if (!p.perRonde.has(nr)) p.perRonde.set(nr, []);
    p.perRonde.get(nr).push(...ids);
  }

  // 4. Per pakket: samenvoegen met wat er al is
  const resultaat = [];
  const sorteer = (ids) => [...ids].sort((a, b) => (objectVolgorde.get(a) ?? 1e9) - (objectVolgorde.get(b) ?? 1e9));
  for (const p of pakketten.values()) {
    const B = BLAD.pakketten;
    const oud = bestaandPerCode.get(p.code.toLowerCase());
    if (!oud && !p.rondes.size) fout(B, p.rij, `${p.code}: geef op het blad Rondes minstens één ronde op.`);
    if (!oud && !p.heeftObjectregels) fout(B, p.rij, `${p.code}: koppel op het blad Objecten minstens één object of GIS-laag.`);

    const oudeRondes = oud ? rondesVan(oud) : [];
    const oudPerNr = new Map(oudeRondes.map((r) => [Number(r.nummer) || 1, r]));
    const oudeLijst = new Map(oudeRondes.map((r) => [r.id, new Set(rondeView(oud, r).objecten)]));
    const gedaan = (oud && c.gedaan?.get(oud.id)) || new Map();

    // Rondes: uit het bestand (id behouden op nummer) + bestaande rondes die niet in het bestand staan.
    const rondes = [...p.rondes.values()].map((r) => {
      const o = oudPerNr.get(r.nummer);
      return {
        id: o?.id ?? c.nieuwId(), nummer: r.nummer, naam: r.naam, soort: r.soort, werksoort: r.werksoort, inspectiesoort: r.inspectiesoort,
        start: r.start, eind: r.eind, status: r.status || o?.status || 'gepland', objectIds: null, _oud: o ?? null, _nieuw: true,
      };
    });
    for (const o of oudeRondes) {
      if (!p.rondes.has(Number(o.nummer) || 1)) {
        rondes.push({ ...o, _oud: o, _nieuw: false });
        if (p.rondes.size) let_op(BLAD.rondes, null, `${p.code}: ronde R${o.nummer} (${o.naam}) staat niet in het bestand en blijft ongewijzigd.`);
      }
    }
    rondes.sort((a, b) => a.nummer - b.nummer);

    let objecten;
    let bij = 0;
    let af = 0;
    let behouden = 0;
    if (p.heeftObjectregels) {
      const algemeen = new Set(p.algemeen);
      const lijst = new Map(); // rondeId → Set
      for (const r of rondes) {
        if (!r._nieuw) continue;
        lijst.set(r.id, new Set([...algemeen, ...(p.perRonde.get(r.nummer) ?? [])]));
      }
      const uitBestand = new Set([...algemeen, ...[...p.perRonde.values()].flat()]);
      const oudeObjecten = new Set(oud?.objecten ?? []);
      // Objecten die niet meer in het bestand staan: weg (optie), behalve wat al gedaan is.
      const blijft = new Set();
      for (const id of oudeObjecten) {
        if (uitBestand.has(id)) continue;
        const ooitGedaan = [...gedaan.values()].some((s) => s.has(id));
        if (!c.verwijderOntbrekend || ooitGedaan) {
          blijft.add(id);
          if (c.verwijderOntbrekend) behouden++;
        } else af++;
      }
      for (const r of rondes) {
        if (!r._nieuw || !r._oud) continue;
        const l = lijst.get(r.id);
        for (const id of blijft) {
          if (oudeLijst.get(r._oud.id)?.has(id) && (!c.verwijderOntbrekend || gedaan.get(r._oud.id)?.has(id))) l.add(id);
        }
      }
      objecten = new Set([...uitBestand, ...blijft]);
      for (const id of uitBestand) if (!oudeObjecten.has(id)) bij++;
      // Rondes die niet in het bestand staan houden hun eigen selectie (alleen objecten die er nog in zitten).
      for (const r of rondes) {
        if (r._nieuw) {
          const l = lijst.get(r.id);
          if (!l.size) fout(BLAD.rondes, p.rondes.get(r.nummer)?.rij ?? null, `${p.code}-R${r.nummer}: deze ronde heeft geen objecten.`);
          r.objectIds = l.size === objecten.size ? null : sorteer(l);
        } else if (r.objectIds?.length) {
          r.objectIds = r.objectIds.filter((id) => objecten.has(id));
        }
      }
      if (c.verwijderOntbrekend && behouden) let_op(BLAD.objecten, null, `${p.code}: ${behouden} object(en) staan niet meer in het bestand maar zijn al gedaan of overgeslagen en blijven in het pakket.`);
    } else {
      objecten = new Set(oud?.objecten ?? []);
      for (const r of rondes) if (r._oud) r.objectIds = r._oud.objectIds ?? null;
      if (oud) let_op(BLAD.objecten, null, `${p.code}: geen objectregels in het bestand; de objecten van het pakket blijven ongewijzigd.`);
    }

    const record = {
      ...(oud ?? {}), id: oud?.id ?? c.nieuwId(), code: p.code, naam: p.naam, toegewezen: p.toegewezen, vrijgaveVereist: p.vrijgaveVereist,
      omschrijving: p.omschrijving, objecten: sorteer(objecten),
      rondes: rondes.map(({ _oud, _nieuw, ...r }) => r),
    };
    // Oude losse velden (van vóór de rondes) zijn nu overbodig.
    for (const k of ['soort', 'werksoort', 'inspectiesoort', 'start', 'eind']) delete record[k];
    resultaat.push({
      actie: oud ? 'bijwerken' : 'nieuw', code: p.code, naam: p.naam, record,
      samenvatting: { rondes: record.rondes.length, objecten: record.objecten.length, bij, af, behouden },
    });
  }
  if (!raw.pakketten.length && !(raw.ontbrekend ?? []).length) fout(BLAD.pakketten, null, 'Het blad Werkpakketten is leeg.');
  return { fouten, waarschuwingen, pakketten: resultaat };
}

