// Eisbibliotheek: eisen uit de contractstukken, elk omgeschreven naar een eisvraag die als vraag in een formulier komt.
// Per project (contract) een lijst [{ nummer, tekst, vraag, type, opties, bron }]; een formulierveld verwijst met
// `eis: { nummer, tekst, bron }` naar zijn eis. Zo is per eis te zien met welke registraties hij is geverifieerd.
// Puur en testbaar: geen DOM, geen opslag.

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.\-:()]/g, ' ').replace(/\s+/g, ' ').trim();
const tekst = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if ('result' in v) return tekst(v.result);
    if ('text' in v) return tekst(v.text);
  }
  return String(v).trim();
};
export const sleutel = (nummer) => norm(nummer).replace(/\s+/g, '');

// Kolomkoppen (genormaliseerd). Eisnummer, eistekst en eisvraag zijn verplicht; de rest is optioneel.
const KOPPEN = {
  nummer: [/^eis ?(nummer|nr|id|code)$/, /^(eis)?nummer$/, /^(id|nr|code|eis)$/, /^req(uirement)? ?(id|nr|nummer)?$/],
  tekst: [/^eis ?(tekst|omschrijving|beschrijving)$/, /^(tekst|omschrijving|eis ?inhoud)$/, /^requirement( text)?$/],
  vraag: [/^eis ?vraag$/, /^(vraag|verificatie ?vraag|controle ?vraag|formulier ?vraag)$/, /^question$/],
  type: [/^(antwoord ?type|type ?antwoord|type|veldtype)$/],
  opties: [/^(keuzes|opties|antwoordopties|antwoorden)$/],
  bron: [/^(contractstuk|document|bron|referentie|hoofdstuk|paragraaf)$/],
  gewenst: [/^(gewenst|gewenst antwoord|verwacht|verwacht antwoord|norm|eisnorm|voldoet bij|goed antwoord|criterium|acceptatiecriterium)$/],
};

// Antwoordtype uit het bestand → veldtype van de app (standaard ja/nee: is aan de eis voldaan?).
const TYPEN = [[/^(ja ?\/? ?nee|j\/n|janee|ja nee|boolean)$/, 'janee'], [/^(tekst|vrije tekst|opmerking)$/, 'tekst'], [/^(getal|aantal|waarde|meting|numeriek)$/, 'getal'],
  [/^(keuze|keuzelijst|lijst)$/, 'keuze'], [/^(meerkeuze|meerdere)$/, 'meerkeuze'], [/^(checklist|afvinken)$/, 'checklist'], [/^(foto|beeld)$/, 'foto'], [/^(datum)$/, 'datum']];
export const typeUit = (v) => TYPEN.find(([re]) => re.test(norm(v)))?.[1] ?? '';

/**
 * Leest eisen uit tabelregels (eerste niet-lege regel = kolomkoppen).
 * @returns {{ eisen: object[], fouten: string[], kolommen: Record<string,string> }}
 */
export function leesEisen(regels) {
  const rijen = (regels ?? []).map((r) => (r ?? []).map(tekst));
  const start = rijen.findIndex((r) => r.some(Boolean));
  if (start < 0) return { eisen: [], fouten: ['Het bestand is leeg.'], kolommen: {} };
  const kop = rijen[start];
  const k = {};
  for (const [veld, patronen] of Object.entries(KOPPEN)) {
    for (const re of patronen) {
      const i = kop.findIndex((h, n) => re.test(norm(h)) && !Object.values(k).includes(n));
      if (i >= 0) { k[veld] = i; break; }
    }
  }
  const fouten = [];
  for (const v of ['nummer', 'tekst', 'vraag']) if (k[v] === undefined) fouten.push(`Kolom "${{ nummer: 'Eisnummer', tekst: 'Eistekst', vraag: 'Eisvraag' }[v]}" niet gevonden.`);
  if (fouten.length) return { eisen: [], fouten, kolommen: {} };
  const eisen = [];
  const gezien = new Map();
  rijen.slice(start + 1).forEach((r, i) => {
    const rij = start + i + 2;
    if (!r.some(Boolean)) return;
    const nummer = r[k.nummer];
    const vraag = r[k.vraag];
    if (!nummer) { fouten.push(`Regel ${rij}: eisnummer ontbreekt.`); return; }
    if (!vraag) { fouten.push(`Regel ${rij}: eis ${nummer} heeft geen eisvraag (wordt overgeslagen).`); return; }
    if (gezien.has(sleutel(nummer))) { fouten.push(`Regel ${rij}: eisnummer ${nummer} komt dubbel voor (regel ${gezien.get(sleutel(nummer))}); de eerste telt.`); return; }
    gezien.set(sleutel(nummer), rij);
    const ruwType = k.type !== undefined ? r[k.type] : '';
    const type = typeUit(ruwType) || 'janee';
    if (ruwType && !typeUit(ruwType)) fouten.push(`Regel ${rij}: antwoordtype "${ruwType}" onbekend; ja/nee gebruikt.`);
    const opties = k.opties !== undefined ? String(r[k.opties] ?? '').split(/[;|\n]/).map((x) => x.trim()).filter(Boolean) : [];
    if (['keuze', 'meerkeuze', 'checklist'].includes(type) && !opties.length) fouten.push(`Regel ${rij}: eis ${nummer} (${type}) heeft geen keuzes.`);
    const eis = { nummer, tekst: r[k.tekst] ?? '', vraag, type, opties, bron: k.bron !== undefined ? r[k.bron] ?? '' : '' };
    if (k.gewenst !== undefined && r[k.gewenst]) {
      const g = controleerGewenst({ ...eis, gewenst: r[k.gewenst] });
      if (g) fouten.push(`Regel ${rij}: eis ${nummer}: ${g} Gewenst antwoord genegeerd.`);
      else eis.gewenst = r[k.gewenst];
    }
    eisen.push(eis);
  });
  const kolommen = Object.fromEntries(Object.entries(k).map(([v, i]) => [v, kop[i]]));
  return { eisen, fouten, kolommen };
}

/** Vergelijkt een nieuwe levering met de huidige bibliotheek (op eisnummer). */
export function vergelijk(oud, nieuw) {
  const o = new Map((oud ?? []).map((e) => [sleutel(e.nummer), e]));
  const n = new Map((nieuw ?? []).map((e) => [sleutel(e.nummer), e]));
  const velden = ['tekst', 'vraag', 'type', 'bron', 'gewenst'];
  const gewijzigd = [];
  const toegevoegd = [];
  for (const [s, e] of n) {
    const was = o.get(s);
    if (!was) { toegevoegd.push(e); continue; }
    const v = velden.filter((x) => String(was[x] ?? '') !== String(e[x] ?? ''));
    if ((was.opties ?? []).join('|') !== (e.opties ?? []).join('|')) v.push('opties');
    if (v.length) gewijzigd.push({ eis: e, velden: v });
  }
  const vervallen = [...o.entries()].filter(([s]) => !n.has(s)).map(([, e]) => e);
  return { toegevoegd, gewijzigd, vervallen, ongewijzigd: n.size - toegevoegd.length - gewijzigd.length };
}

/** Formulierveld voor een eis: de eisvraag als vraag, gekoppeld aan het eisnummer. */
export function naarVeld(eis, formulier, id) {
  return {
    id, formulier, label: eis.vraag, type: eis.type || 'janee', verplicht: true, hulptekst: '', alleenBij: [],
    ...(eis.opties?.length ? { opties: [...eis.opties] } : {}),
    eis: { nummer: eis.nummer, tekst: eis.tekst ?? '', bron: eis.bron ?? '', ...(eis.gewenst ? { gewenst: String(eis.gewenst) } : {}) },
  };
}

/**
 * Werkt gekoppelde formuliervelden bij na een nieuwe levering: de vraag (label) en eistekst volgen de bibliotheek.
 * Velden waarvan de eis is vervallen houden hun koppeling, met `vervallen: true`.
 */
export function werkVeldenBij(defs, eisen) {
  const per = new Map((eisen ?? []).map((e) => [sleutel(e.nummer), e]));
  let n = 0;
  const uit = (defs ?? []).map((d) => {
    if (!d.eis?.nummer) return d;
    const e = per.get(sleutel(d.eis.nummer));
    const nieuw = e ? { ...d, label: e.vraag, eis: { nummer: e.nummer, tekst: e.tekst ?? '', bron: e.bron ?? '', ...(e.gewenst ? { gewenst: String(e.gewenst) } : {}) } } : { ...d, eis: { ...d.eis, vervallen: true } };
    if (JSON.stringify(nieuw) !== JSON.stringify(d)) n += 1;
    return nieuw;
  });
  return { defs: uit, aantal: n };
}

/**
 * Verificatie per eis: welke formuliervelden de eis bevragen en wat er is geantwoord.
 * @param {object[]} eisen
 * @param {object[]} defs  alle formuliervelden van het project
 * @param {{ extra?: object, datum?: string }[]} registraties
 * @returns {{ eis, velden: object[], antwoorden: number, ja: number, nee: number, overig: number, laatste: string, status: string }[]}
 */
export function verificatie(eisen, defs, registraties) {
  return (eisen ?? []).map((eis) => {
    const vs = (defs ?? []).filter((d) => d.eis && sleutel(d.eis.nummer) === sleutel(eis.nummer));
    let antwoorden = 0; let ja = 0; let nee = 0; let overig = 0; let laatste = '';
    const items = [];
    for (const r of registraties ?? []) {
      for (const d of vs) {
        const v = r.extra?.[d.id];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
        antwoorden += 1;
        const uitkomst = beoordeel(eis, d, v);
        if (uitkomst === 'ja') ja += 1; else if (uitkomst === 'nee') nee += 1; else overig += 1;
        if (String(r.datum ?? '') > laatste) laatste = String(r.datum ?? '');
        items.push({ r, veld: d, waarde: v, uitkomst });
      }
    }
    items.sort((a, b) => String(a.r.datum ?? '').localeCompare(String(b.r.datum ?? '')));
    const status = !vs.length ? 'niet in formulier' : !antwoorden ? 'nog niet geverifieerd' : nee ? 'afwijking' : 'geverifieerd';
    return { eis, velden: vs, antwoorden, ja, nee, overig, laatste, status, items };
  });
}

export const SJABLOON = [
  ['Eisnummer', 'Eistekst', 'Eisvraag', 'Antwoordtype', 'Keuzes', 'Gewenst antwoord', 'Contractstuk'],
  ['EIS-3.2.1', 'De opdrachtnemer houdt de grasvegetatie op een hoogte van maximaal 10 cm.', 'Is het gras na het maaien niet hoger dan 10 cm?', 'Ja/nee', '', 'Ja', 'Bestek hfst. 3'],
  ['EIS-3.2.4', 'Maaisel wordt binnen 2 werkdagen afgevoerd.', 'Is het maaisel afgevoerd?', 'Ja/nee', '', 'Ja', 'Bestek hfst. 3'],
  ['EIS-4.1.2', 'Het beeldkwaliteitsniveau voor zwerfvuil is minimaal B.', 'Wat is de beeldkwaliteit zwerfvuil?', 'Keuze', 'A+;A;B;C;D', 'A+;A;B', 'Beeldkwaliteitsbestek'],
  ['EIS-5.3.1', 'Gebreken aan verhardingen worden gemeld met foto.', 'Foto van het gebrek', 'Foto', '', '', 'PvE 5.3'],
  ['EIS-3.2.2', 'Na het maaien liggen er geen maaiselresten op de verharding.', 'Liggen er maaiselresten op de verharding?', 'Ja/nee', '', 'Nee', 'Bestek hfst. 3'],
  ['EIS-3.2.3', 'De grashoogte na het maaien is maximaal 10 cm.', 'Gemeten grashoogte (cm)', 'Getal', '', '<= 10', 'Bestek hfst. 3'],
];

// ---------------------------------------------------------------------------
// Gewenst antwoord: wanneer voldoet een antwoord aan de eis?
// ---------------------------------------------------------------------------
const getal = (x) => { const n = Number(String(x ?? '').trim().replace(',', '.')); return Number.isFinite(n) && String(x ?? '').trim() !== '' ? n : null; };
const lijstVan = (x) => String(x ?? '').split(/\s*[;|]\s*|\s+of\s+/i).map((y) => y.trim()).filter(Boolean);

/**
 * Het gewenste antwoord van een eis als norm, afhankelijk van het antwoordtype.
 * - ja/nee: "Ja" (standaard) of "Nee";
 * - keuze: één of meer toegestane keuzes ("A+;A;B"); meerkeuze: deze keuzes moeten allemaal zijn aangevinkt;
 * - getal: "<= 10", ">= 5", "< 3", "> 0", "= 4", "4", "5 - 10" of "5 tot 10" (grenzen inbegrepen), "max 10", "min 5";
 * - checklist: alle punten afgevinkt (standaard);
 * - overige typen (tekst, foto, datum, …): ingevuld is voldoende; bij tekst kan een exacte tekst.
 * @returns {{ soort: string, [k: string]: any }}
 */
export function gewenstNorm(eis, type = eis?.type) {
  const g = String(eis?.gewenst ?? '').trim();
  const n = norm(g);
  if (type === 'janee') return { soort: 'janee', waarde: !/^(nee|n|no|false|0|onwaar)$/.test(n) };
  if (type === 'checklist') return { soort: 'alles' };
  if (!g) return { soort: 'ingevuld' };
  if (type === 'keuze' || type === 'meerkeuze') return { soort: type === 'keuze' ? 'een van' : 'bevat', lijst: lijstVan(g) };
  if (type === 'getal') {
    const t = g.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/,/g, '.').toLowerCase().replace(/\s+/g, ' ');
    let m = t.match(/^(?:tussen )?(-?[\d.]+) ?(?:-|tot|t\/m|en) ?(-?[\d.]+)$/);
    if (m && getal(m[1]) !== null && getal(m[2]) !== null) return { soort: 'getal', min: Math.min(getal(m[1]), getal(m[2])), max: Math.max(getal(m[1]), getal(m[2])) };
    m = t.match(/^(<=|>=|<|>|=|max(?:imaal)?|min(?:imaal)?|ten hoogste|ten minste|hoogstens|minstens)? ?(-?[\d.]+)$/);
    if (m && getal(m[2]) !== null) {
      const w = getal(m[2]);
      const op = m[1] ?? '=';
      if (op === '<=' || /^(max|ten hoogste|hoogstens)/.test(op)) return { soort: 'getal', max: w };
      if (op === '>=' || /^(min|ten minste|minstens)/.test(op)) return { soort: 'getal', min: w };
      if (op === '<') return { soort: 'getal', max: w, strikt: true };
      if (op === '>') return { soort: 'getal', min: w, strikt: true };
      return { soort: 'getal', min: w, max: w };
    }
    return { soort: 'ongeldig' };
  }
  if (type === 'tekst') return { soort: 'tekst', waarde: g };
  return { soort: 'ingevuld' };
}

/** Foutmelding als het gewenste antwoord niet past bij het antwoordtype (anders ''). */
export function controleerGewenst(eis) {
  const g = String(eis?.gewenst ?? '').trim();
  if (!g) return '';
  const nn = gewenstNorm(eis);
  if (eis.type === 'janee' && !/^(ja|j|yes|true|1|waar|nee|n|no|false|0|onwaar)$/.test(norm(g))) return `"${g}" is geen Ja of Nee.`;
  if (nn.soort === 'ongeldig') return `"${g}" is geen getal of bereik (bijv. <= 10, >= 5 of 5 - 10).`;
  if (nn.lijst && eis.opties?.length) {
    const vreemd = nn.lijst.filter((x) => !eis.opties.some((o) => norm(o) === norm(x)));
    if (vreemd.length) return `${vreemd.map((x) => `"${x}"`).join(', ')} staat niet bij de keuzes (${eis.opties.join(', ')}).`;
  }
  return '';
}

const nlGetal = (x) => String(x).replace('.', ',');
/** Het gewenste antwoord in woorden, voor het dossier en de eisenlijst. */
export function gewenstTekst(eis, type = eis?.type) {
  const g = gewenstNorm(eis, type);
  switch (g.soort) {
    case 'janee': return g.waarde ? 'Ja' : 'Nee';
    case 'alles': return 'Alle punten afgevinkt';
    case 'een van': return g.lijst.length === 1 ? g.lijst[0] : `${g.lijst.slice(0, -1).join(', ')} of ${g.lijst.at(-1)}`;
    case 'bevat': return `Aangevinkt: ${g.lijst.join(', ')}`;
    case 'getal': {
      if (g.min !== undefined && g.max !== undefined) return g.min === g.max ? `= ${nlGetal(g.min)}` : `${nlGetal(g.min)} t/m ${nlGetal(g.max)}`;
      if (g.max !== undefined) return `${g.strikt ? '<' : '≤'} ${nlGetal(g.max)}`;
      return `${g.strikt ? '>' : '≥'} ${nlGetal(g.min)}`;
    }
    case 'tekst': return `"${g.waarde}"`;
    case 'ongeldig': return `${eis.gewenst} (ongeldig)`;
    default: return 'Ingevuld (geen norm)';
  }
}

/**
 * Voldoet het antwoord aan het gewenste antwoord van de eis?
 * @returns {'ja'|'nee'|'overig'}  ja = voldoet, nee = voldoet niet, overig = ingevuld zonder norm (bijv. een foto of vrije tekst)
 */
export function beoordeel(eis, veld, waarde) {
  const type = veld?.type ?? eis?.type;
  const g = gewenstNorm(eis, type);
  const gelijk = (a, b) => norm(a) === norm(b);
  switch (g.soort) {
    case 'janee': return waarde === g.waarde ? 'ja' : (waarde === true || waarde === false ? 'nee' : 'overig');
    case 'alles': return (veld?.opties ?? []).every((o) => (waarde ?? []).includes(o)) ? 'ja' : 'nee';
    case 'een van': return g.lijst.some((x) => gelijk(x, waarde)) ? 'ja' : 'nee';
    case 'bevat': return g.lijst.every((x) => (waarde ?? []).some((w) => gelijk(w, x))) ? 'ja' : 'nee';
    case 'getal': {
      const v = getal(waarde);
      if (v === null) return 'overig';
      const boven = g.min === undefined || (g.strikt ? v > g.min : v >= g.min);
      const onder = g.max === undefined || (g.strikt ? v < g.max : v <= g.max);
      return boven && onder ? 'ja' : 'nee';
    }
    case 'tekst': return gelijk(waarde, g.waarde) ? 'ja' : 'nee';
    default: return 'overig';
  }
}

/**
 * Registraties voor een dossier: binnen de periode en (optioneel) alleen van bepaalde werkpakketten en rondes.
 * @param {{ van?: string, tot?: string, pakketten?: string[], ronde?: string, standaardRonde?: string }} keuze
 */
export function selectie(registraties, { van = '', tot = '', pakketten = [], ronde = '', standaardRonde = '' } = {}) {
  const set = new Set(pakketten ?? []);
  return inPeriode(registraties, van, tot).filter((r) => (!set.size || set.has(r.werkpakketId))
    && (!ronde || r.rondeId === ronde || (ronde === standaardRonde && !r.rondeId)));
}

/** Registraties met een datum binnen [van, tot] (ISO, grenzen inbegrepen; leeg = open). */
export function inPeriode(registraties, van, tot) {
  return (registraties ?? []).filter((r) => {
    const d = String(r?.datum ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    return (!van || d >= van) && (!tot || d <= tot);
  });
}

/** Kalenderjaren waarin registraties zijn gedaan (nieuwste eerst), aangevuld met het huidige jaar. */
export function jaren(registraties, huidig) {
  const set = new Set([Number(huidig)].filter(Boolean));
  for (const r of registraties ?? []) { const j = Number(String(r?.datum ?? '').slice(0, 4)); if (j > 1900) set.add(j); }
  return [...set].sort((a, b) => b - a);
}

/**
 * Verificatiedossier over een periode: per eis de antwoorden uit die periode, plus een samenvatting.
 * Afdekkingsgraad = deel van de eisen die in een formulier staan dat in de periode minstens één keer is beantwoord.
 */
export function dossier({ eisen, defs, registraties, van, tot }) {
  const regs = inPeriode(registraties, van, tot);
  const ver = verificatie(eisen, defs, regs);
  const tel = { totaal: ver.length, geverifieerd: 0, afwijking: 0, 'nog niet geverifieerd': 0, 'niet in formulier': 0 };
  for (const x of ver) tel[x.status] += 1;
  const inFormulier = tel.totaal - tel['niet in formulier'];
  const bevraagd = tel.geverifieerd + tel.afwijking;
  const gebruikt = new Set(ver.flatMap((x) => x.items.map((i) => i.r)));
  return {
    van, tot, ver, tel, inFormulier, registraties: gebruikt.size,
    antwoorden: ver.reduce((t, x) => t + x.antwoorden, 0),
    afdekking: inFormulier ? bevraagd / inFormulier : 0,
    afwijkingen: ver.flatMap((x) => x.items.filter((i) => i.uitkomst === 'nee').map((i) => ({ ...i, eis: x.eis }))),
  };
}
