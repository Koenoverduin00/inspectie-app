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
    eisen.push({ nummer, tekst: r[k.tekst] ?? '', vraag, type, opties, bron: k.bron !== undefined ? r[k.bron] ?? '' : '' });
  });
  const kolommen = Object.fromEntries(Object.entries(k).map(([v, i]) => [v, kop[i]]));
  return { eisen, fouten, kolommen };
}

/** Vergelijkt een nieuwe levering met de huidige bibliotheek (op eisnummer). */
export function vergelijk(oud, nieuw) {
  const o = new Map((oud ?? []).map((e) => [sleutel(e.nummer), e]));
  const n = new Map((nieuw ?? []).map((e) => [sleutel(e.nummer), e]));
  const velden = ['tekst', 'vraag', 'type', 'bron'];
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
    eis: { nummer: eis.nummer, tekst: eis.tekst ?? '', bron: eis.bron ?? '' },
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
    const nieuw = e ? { ...d, label: e.vraag, eis: { nummer: e.nummer, tekst: e.tekst ?? '', bron: e.bron ?? '' } } : { ...d, eis: { ...d.eis, vervallen: true } };
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
    for (const r of registraties ?? []) {
      for (const d of vs) {
        const v = r.extra?.[d.id];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
        antwoorden += 1;
        if (v === true) ja += 1; else if (v === false) nee += 1; else overig += 1;
        if (String(r.datum ?? '') > laatste) laatste = String(r.datum ?? '');
      }
    }
    const status = !vs.length ? 'niet in formulier' : !antwoorden ? 'nog niet geverifieerd' : nee ? 'afwijking' : 'geverifieerd';
    return { eis, velden: vs, antwoorden, ja, nee, overig, laatste, status };
  });
}

export const SJABLOON = [
  ['Eisnummer', 'Eistekst', 'Eisvraag', 'Antwoordtype', 'Keuzes', 'Contractstuk'],
  ['EIS-3.2.1', 'De opdrachtnemer houdt de grasvegetatie op een hoogte van maximaal 10 cm.', 'Is het gras na het maaien niet hoger dan 10 cm?', 'Ja/nee', '', 'Bestek hfst. 3'],
  ['EIS-3.2.4', 'Maaisel wordt binnen 2 werkdagen afgevoerd.', 'Is het maaisel afgevoerd?', 'Ja/nee', '', 'Bestek hfst. 3'],
  ['EIS-4.1.2', 'Zwerfvuil wordt verwijderd; de mate van vervuiling wordt vastgelegd.', 'Wat is de beeldkwaliteit zwerfvuil?', 'Keuze', 'A+;A;B;C;D', 'Beeldkwaliteitsbestek'],
  ['EIS-5.3.1', 'Gebreken aan verhardingen worden gemeld met foto.', 'Foto van het gebrek', 'Foto', '', 'PvE 5.3'],
];
