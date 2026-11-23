// Formulieren in bulk: kopieën maken en veel formulieren (inspectietypen met hun vragen) in één keer inlezen uit Excel.
// Puur en testbaar: geen DOM, geen opslag. De app zet het resultaat in het project of in de bibliotheek.
import * as TY from './inspectietypen.js';
import * as V from './velden.js';
import * as EI from './eisen.js';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.\-:()/]/g, ' ').replace(/\s+/g, ' ').trim();
const cel = (v) => TY.celTekst(v);
const lijst = (v) => cel(v).split(/\s*[;|\n]\s*/).map((x) => x.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Kopie van een formulier
// ---------------------------------------------------------------------------
/**
 * Kopie van een formulier als basis voor een nieuw formulier: het type zonder herkomst of id, de vragen los van het
 * oude type (de app geeft ze nieuwe ids en koppelt ze aan de nieuwe naam). Voorwaarden tussen vragen blijven kloppen.
 * @param {object} type  inspectietype
 * @param {object[]} velden  vragen van dat type (met of zonder alleenBij)
 * @param {string} naam  naam van de kopie
 */
export function kopie(type, velden, naam) {
  const { id, standaard, verborgen, bron, ...rest } = type ?? {};
  const ids = new Set((velden ?? []).map((d) => d.id));
  return {
    type: { ...structuredClone(rest), naam: String(naam ?? '').trim() },
    velden: (velden ?? []).map(({ alleenBij, ...d }) => ({ ...structuredClone(d), toonAls: d.toonAls?.veld && ids.has(d.toonAls.veld) ? { ...d.toonAls } : null })),
  };
}

/** Vrije naam voor een kopie: "Naam (kopie)", "Naam (kopie 2)", … */
export function kopieNaam(naam, bestaand) {
  const bezet = new Set((bestaand ?? []).map((x) => String(x).toLowerCase()));
  for (let n = 1; n < 1000; n += 1) {
    const kandidaat = `${naam} (kopie${n > 1 ? ` ${n}` : ''})`;
    if (!bezet.has(kandidaat.toLowerCase())) return kandidaat;
  }
  return `${naam} (kopie)`;
}

/**
 * Vragen overnemen in een ander formulier: nieuwe ids; voorwaarden blijven alleen als hun bronvraag ook meekomt.
 * @param {object[]} gekozen  vragen (uit één of meer formulieren)
 * @param {() => string} nieuwId
 * @param {object} erbij  eigenschappen voor elke kopie (bijv. { formulier: 'inspectie', alleenBij: ['Schouw'] })
 */
export function vragenOvernemen(gekozen, nieuwId, erbij = {}) {
  const ids = new Map((gekozen ?? []).map((d) => [d.id, nieuwId()]));
  return (gekozen ?? []).map((d) => ({
    ...structuredClone(d), ...erbij, id: ids.get(d.id),
    toonAls: d.toonAls?.veld && ids.has(d.toonAls.veld) ? { ...d.toonAls, veld: ids.get(d.toonAls.veld) } : null,
  }));
}

// ---------------------------------------------------------------------------
// Inlezen uit Excel
// ---------------------------------------------------------------------------
const KOP_VRAGEN = {
  formulier: [/^(formulier|formuliernaam|inspectietype|type formulier|formulier ?type|naam formulier)$/],
  vraag: [/^(vraag|vraagtekst|label|controlepunt|tekst)$/],
  type: [/^(antwoord ?type|type ?antwoord|type|veldtype|soort antwoord)$/],
  opties: [/^(keuzes|opties|antwoordopties|antwoorden|keuzelijst|punten)$/],
  verplicht: [/^verplicht( ?\??)?$/],
  waar: [/^(waar|niveau|plaats|waar staat de vraag|onderdeel van|groep)$/],
  eis: [/^eis ?(nummer|nr|id|code)?$/, /^(eisnummer|requirement)$/],
  hulp: [/^(toelichting|hulptekst|uitleg|instructie)$/],
  eenheid: [/^eenheid$/],
  min: [/^(min|minimum|minimaal)$/],
  max: [/^(max|maximum|maximaal)$/],
  standaard: [/^(standaard|standaardwaarde|vooraf ingevuld|default)$/],
  toonAls: [/^(alleen tonen als|toon als|voorwaarde|alleen als)$/],
  inwinning: [/^(inwinning|wat wordt ingewonnen|geometrie)$/],
};
const KOP_FORMULIEREN = {
  formulier: [/^(formulier|formuliernaam|inspectietype|naam)$/],
  methodiek: [/^methodiek$/],
  omschrijving: [/^(omschrijving|beschrijving|toelichting)$/],
  schaal: [/^(schaal|oordeelschaal|oordelen|niveaus)$/],
  onderdelen: [/^onderdelen$/],
  gebreken: [/^gebreken$/],
  basis: [/^(op basis van|basis|kopie van|sjabloon)$/],
  overzichtsfotos: [/^overzichtsfoto ?'?s?$/],
  oordeelRegel: [/^(oordeel|eindoordeel|oordeelregel)$/],
};

const TYPE_WOORDEN = [
  [/^(ja ?\/? ?nee|j\/n|janee|ja nee|boolean)$/, 'janee'], [/^(tekst|vrije tekst|opmerking|text)$/, 'tekst'],
  [/^(getal|aantal|waarde|meting|numeriek|nummer)$/, 'getal'], [/^(keuze|keuzelijst|lijst|een keuze)$/, 'keuze'],
  [/^(meerkeuze|meerdere|meerdere keuzes)$/, 'meerkeuze'], [/^(checklist|afvinken|alles afvinken)$/, 'checklist'],
  [/^(foto|fotos|beeld)$/, 'foto'], [/^datum$/, 'datum'], [/^tijd$/, 'tijd'],
  [/^(locatie|punt|punt op de kaart|gps)$/, 'locatie'], [/^(coordinaten|inwinning|inwinning coordinaten|lijn|vlak|geometrie|punten lijn of vlak)$/, 'geometrie'],
  [/^(handtekening|paraaf)$/, 'handtekening'], [/^(begin en eindtijd|tijdsduur|uren|begin eindtijd)$/, 'tijdsduur'],
  [/^(bijlage|document|pdf)$/, 'bijlage'], [/^(kop|tussenkop|sectie|kopje|uitleg)$/, 'kop'],
];
const typeUit = (v) => {
  const n = norm(v);
  if (!n) return '';
  if (V.VELDTYPEN[n]) return n;
  return TYPE_WOORDEN.find(([re]) => re.test(n))?.[1] ?? Object.entries(V.VELDTYPEN).find(([, l]) => norm(l) === n)?.[0] ?? null;
};
const methodiekUit = (v) => {
  const n = norm(v);
  if (!n) return '';
  if (/nen|2767|conditie/.test(n)) return 'nen';
  if (/check|controle/.test(n)) return 'checklist';
  if (/oordeel|schaal|eenvoudig/.test(n)) return 'oordeel';
  return null;
};
const waarUit = (v) => {
  const n = norm(v);
  if (!n || /inspectie|eenmaal|algemeen|formulier/.test(n)) return 'inspectie';
  if (/bevinding|gebrek|per bevinding/.test(n)) return /^gebreken?$/.test(n) ? 'gebrek' : 'bevinding';
  if (/controlepunt|checklist/.test(n)) return 'controlepunt';
  if (/^onderdelen?$/.test(n)) return 'onderdeel';
  return null;
};
const jaNee = (v, standaard) => {
  const n = norm(v);
  if (!n) return standaard;
  if (/^(ja|j|yes|y|x|waar|true|1|verplicht)$/.test(n)) return true;
  if (/^(nee|n|no|onwaar|false|0)$/.test(n)) return false;
  return standaard;
};

/** Kleuren voor een schaal van n niveaus, van goed naar slecht. */
export function schaalKleuren(n) {
  const k = Object.fromEntries(TY.KLEUREN.map(([kleur, naam]) => [naam, kleur]));
  const reeks = {
    2: ['Groen', 'Rood'], 3: ['Groen', 'Geel', 'Rood'], 4: ['Groen', 'Lichtgroen', 'Oranje', 'Rood'],
    5: ['Groen', 'Lichtgroen', 'Geel', 'Oranje', 'Rood'], 6: ['Groen', 'Lichtgroen', 'Geel', 'Oranje', 'Rood', 'Donkerrood'],
  }[n] ?? [];
  return reeks.map((x) => k[x]);
}

/** Kolommen van een blad: index per sleutel, uit de eerste niet-lege regel. */
function koppen(regels, definitie) {
  const start = (regels ?? []).findIndex((r) => (r ?? []).some((c) => cel(c)));
  if (start < 0) return { start: -1, kol: {} };
  const kol = {};
  (regels[start] ?? []).forEach((c, i) => {
    const n = norm(cel(c));
    for (const [sleutel, patronen] of Object.entries(definitie)) if (kol[sleutel] === undefined && patronen.some((re) => re.test(n))) kol[sleutel] = i;
  });
  return { start, kol };
}

/**
 * Leest formulieren uit de bladen van een Excel- of CSV-bestand.
 * - Blad met vragen (verplicht): één regel per vraag, met de kolom Formulier. Kolommen: Formulier, Vraag, Antwoordtype, Keuzes,
 *   Verplicht, Waar (per inspectie / per bevinding / controlepunt / onderdeel / gebrek), Eisnummer, Toelichting, Eenheid, Min, Max,
 *   Standaardwaarde, Alleen tonen als ("Vraag = Waarde").
 * - Blad met formulieren (optioneel): Formulier, Methodiek, Omschrijving, Schaal, Onderdelen, Gebreken, Op basis van, Overzichtsfoto's.
 * @param {{naam: string, regels: any[][]}[]} bladen
 * @param {object} opties
 * @param {object[]} [opties.eisen]  eisbibliotheek van het project
 * @param {string[]} [opties.bestaand]  namen van formulieren die al bestaan (worden vervangen of overgeslagen)
 * @param {(naam: string) => {type: object, velden: object[]} | null} [opties.basisVan]  bestaand formulier als basis
 * @param {string[]} [opties.verboden]  namen die niet mogen (vaste protocollen)
 * @param {() => string} [opties.nieuwId]  ids voor de vragen
 * @returns {{ formulieren: object[], fouten: string[], bladen: {vragen: string, formulieren: string} }}
 */
export function leesFormulieren(bladen, { eisen = [], bestaand = [], basisVan = () => null, verboden = [], nieuwId = null } = {}) {
  let teller = 0;
  const maakId = nieuwId ?? (() => `imp-${(teller += 1)}`);
  const fouten = [];
  const metKoppen = (bladen ?? []).map((b) => ({ ...b, v: koppen(b.regels, KOP_VRAGEN), f: koppen(b.regels, KOP_FORMULIEREN) }));
  // Het blad met de vragen heeft een kolom Vraag (of Eisnummer) én Formulier; het formulierenblad een kolom Methodiek of Schaal.
  const vragenBlad = metKoppen.find((b) => b.v.kol.formulier !== undefined && (b.v.kol.vraag !== undefined || b.v.kol.eis !== undefined)
    && b.f.kol.methodiek === undefined);
  const formBlad = metKoppen.find((b) => b !== vragenBlad && b.f.kol.formulier !== undefined
    && (b.f.kol.methodiek !== undefined || b.f.kol.schaal !== undefined || b.f.kol.basis !== undefined || b.f.kol.omschrijving !== undefined));
  if (!vragenBlad && !formBlad) {
    return { formulieren: [], fouten: ['Geen kolommen herkend. Gebruik het sjabloon: een blad met de kolommen Formulier en Vraag (één regel per vraag).'], bladen: { vragen: '', formulieren: '' } };
  }
  const perEis = new Map((eisen ?? []).map((e) => [EI.sleutel(e.nummer), e]));
  const bestaandSet = new Set((bestaand ?? []).map((x) => x.toLowerCase()));
  const verbodenSet = new Set((verboden ?? []).map((x) => x.toLowerCase()));
  const formulieren = new Map(); // naam (lower) → werkobject
  const formulier = (naam) => {
    const k = naam.toLowerCase();
    if (!formulieren.has(k)) {
      formulieren.set(k, { naam, instellingen: null, rijen: [], punten: [], onderdelen: [], gebreken: [], fouten: [], waarschuwingen: [] });
    }
    return formulieren.get(k);
  };

  if (formBlad) {
    const { start, kol } = formBlad.f;
    formBlad.regels.slice(start + 1).forEach((r, i) => {
      const rij = start + i + 2;
      const g = (k) => (kol[k] === undefined ? '' : cel(r?.[kol[k]]));
      const naam = g('formulier');
      if (!naam) { if ((r ?? []).some((c) => cel(c))) fouten.push(`${formBlad.naam}, regel ${rij}: de naam van het formulier ontbreekt.`); return; }
      const f = formulier(naam);
      const methodiek = methodiekUit(g('methodiek'));
      if (methodiek === null) f.fouten.push(`Methodiek "${g('methodiek')}" onbekend (gebruik Oordeel, Checklist of NEN 2767).`);
      f.instellingen = { rij, methodiek: methodiek || '', omschrijving: g('omschrijving'), schaal: lijst(g('schaal')), onderdelen: lijst(g('onderdelen')),
        gebreken: lijst(g('gebreken')), basis: g('basis'), overzichtsfotos: jaNee(g('overzichtsfotos'), null),
        oordeelRegel: /handmatig|zelf|inspecteur/.test(norm(g('oordeelRegel'))) ? 'handmatig' : '' };
    });
  }

  if (vragenBlad) {
    const { start, kol } = vragenBlad.v;
    let vorigFormulier = '';
    vragenBlad.regels.slice(start + 1).forEach((r, i) => {
      const rij = start + i + 2;
      const g = (k) => (kol[k] === undefined ? '' : cel(r?.[kol[k]]));
      if (!(r ?? []).some((c) => cel(c))) return;
      // Een lege formuliercel hoort bij het formulier van de regel erboven (handig bij samengevoegde cellen).
      const naam = g('formulier') || vorigFormulier;
      if (!naam) { fouten.push(`${vragenBlad.naam}, regel ${rij}: de naam van het formulier ontbreekt.`); return; }
      vorigFormulier = naam;
      formulier(naam).rijen.push({ rij, g: Object.fromEntries(Object.keys(KOP_VRAGEN).map((k) => [k, g(k)])) });
    });
  }

  const uit = [];
  for (const f of formulieren.values()) {
    const fout = (t) => f.fouten.push(t);
    const waarsch = (t) => f.waarschuwingen.push(t);
    if (verbodenSet.has(f.naam.toLowerCase())) fout(`"${f.naam}" is een vast protocol en kan niet worden vervangen.`);
    // Basis: een bestaand formulier waarvan eerst een kopie wordt gemaakt.
    const ins = f.instellingen ?? {};
    let basis = null;
    if (ins.basis) {
      basis = basisVan(ins.basis);
      if (!basis) fout(`"Op basis van": formulier "${ins.basis}" niet gevonden (in dit project of de bibliotheek).`);
    }
    const start = basis ? kopie(basis.type, basis.velden, f.naam) : { type: { naam: f.naam }, velden: [] };
    const id = maakId;
    const velden = vragenOvernemen(start.velden, maakId);
    const type = { ...start.type };
    // Instellingen uit het formulierenblad overschrijven die van de basis.
    if (ins.methodiek) type.methodiek = ins.methodiek;
    if (ins.omschrijving) type.omschrijving = ins.omschrijving;
    if (ins.schaal?.length) type.schaal = ins.schaal.map((label, n) => ({ label, kleur: schaalKleuren(ins.schaal.length)[n] ?? '#5b6875' }));
    if (ins.onderdelen?.length) type.onderdelen = TY.samenvoegen(type.onderdelen ?? [], ins.onderdelen);
    if (ins.gebreken?.length) type.gebreken = TY.samenvoegen(type.gebreken ?? [], ins.gebreken);
    if (ins.overzichtsfotos !== null && ins.overzichtsfotos !== undefined) type.overzichtsfotos = ins.overzichtsfotos;
    if (ins.oordeelRegel) type.oordeelRegel = ins.oordeelRegel;

    const punten = [...(type.punten ?? [])];
    const metLabel = new Map(); // "niveau|label" → veld (voor dubbele vragen en voorwaarden)
    for (const v of velden) metLabel.set(`${v.niveau === 'bevinding' ? 'bevinding' : 'inspectie'}|${norm(v.label)}`, v);
    const voorwaarden = [];
    for (const { rij, g } of f.rijen) {
      const waar = waarUit(g.waar);
      if (waar === null) { fout(`Regel ${rij}: "Waar" = "${g.waar}" onbekend (gebruik Per inspectie, Per bevinding, Controlepunt, Onderdeel of Gebrek).`); continue; }
      if (waar === 'controlepunt' || waar === 'onderdeel' || waar === 'gebrek') {
        if (!g.vraag) { fout(`Regel ${rij}: de tekst van het ${waar} ontbreekt (kolom Vraag).`); continue; }
        if (waar === 'controlepunt') punten.push(g.vraag);
        else if (waar === 'onderdeel') type.onderdelen = TY.samenvoegen(type.onderdelen ?? [], [g.vraag]);
        else type.gebreken = TY.samenvoegen(type.gebreken ?? [], [g.vraag]);
        if (g.eis) waarsch(`Regel ${rij}: een ${waar} kan niet aan een eis worden gekoppeld; maak er een vraag van (Waar = Per inspectie).`);
        continue;
      }
      // Eis: de eisvraag, het antwoordtype en de keuzes uit de eisbibliotheek, tenzij de regel ze zelf geeft.
      let eis = null;
      if (g.eis) {
        const e = perEis.get(EI.sleutel(g.eis));
        if (e) eis = e;
        else waarsch(`Regel ${rij}: eis ${g.eis} staat niet in de eisbibliotheek van het project; de vraag wordt wel aan het eisnummer gekoppeld.`);
      }
      const label = g.vraag || eis?.vraag || '';
      if (!label) { fout(`Regel ${rij}: de vraag ontbreekt.`); continue; }
      let vt = typeUit(g.type);
      if (vt === null) { fout(`Regel ${rij}: antwoordtype "${g.type}" onbekend.`); continue; }
      if (!vt) vt = eis?.type || (g.eis ? 'janee' : (g.opties ? 'keuze' : 'tekst'));
      const opties = g.opties ? lijst(g.opties) : (eis?.opties ?? []);
      if (['keuze', 'meerkeuze', 'checklist'].includes(vt) && !opties.length) { fout(`Regel ${rij}: "${label}" (${V.VELDTYPEN[vt]}) heeft keuzes nodig (kolom Keuzes, gescheiden door ;).`); continue; }
      let niveau = waar;
      if (niveau === 'bevinding' && !V.BEVINDING_TYPEN.includes(vt)) { waarsch(`Regel ${rij}: ${V.VELDTYPEN[vt].toLowerCase()} kan niet per bevinding; de vraag staat één keer per inspectie.`); niveau = 'inspectie'; }
      if (niveau === 'bevinding' && g.eis) { waarsch(`Regel ${rij}: een eisvraag staat één keer per inspectie (de verificatie telt per inspectie).`); niveau = 'inspectie'; }
      if (vt === 'getal' && g.min !== '' && g.max !== '' && Number(g.min.replace(',', '.')) > Number(g.max.replace(',', '.'))) { fout(`Regel ${rij}: minimum is groter dan maximum.`); continue; }
      const sleutel = `${niveau}|${norm(label)}`;
      if (metLabel.has(sleutel)) waarsch(`Regel ${rij}: de vraag "${label}" staat al in dit formulier${basis ? ' (of in de basis)' : ''}.`);
      const veld = {
        id: id(), formulier: 'inspectie', label, type: vt, verplicht: jaNee(g.verplicht, Boolean(g.eis)), hulptekst: g.hulp, alleenBij: [],
        niveau, opties, eenheid: g.eenheid, min: g.min.replace(',', '.'), max: g.max.replace(',', '.'), standaard: g.standaard,
        ...(vt === 'geometrie' ? { inwinning: /lijn/.test(norm(g.inwinning || g.type)) ? 'lijn' : /vlak/.test(norm(g.inwinning || g.type)) ? 'vlak' : /punt/.test(norm(g.inwinning)) ? 'punt' : 'keuze' } : {}),
        ...(g.eis ? { eis: { nummer: eis?.nummer ?? g.eis, tekst: eis?.tekst ?? '', bron: eis?.bron ?? '' } } : {}),
      };
      if (g.standaard && V.STANDAARD_TYPEN.includes(vt) && V.standaardWaarde({ ...veld, standaard: g.standaard }) === undefined) {
        waarsch(`Regel ${rij}: standaardwaarde "${g.standaard}" past niet bij ${V.VELDTYPEN[vt].toLowerCase()}; genegeerd.`);
        veld.standaard = '';
      }
      if (g.toonAls) voorwaarden.push({ rij, veld, tekst: g.toonAls });
      velden.push(veld);
      metLabel.set(sleutel, veld);
    }
    // "Alleen tonen als Vraag = Waarde": naar een vraag op hetzelfde niveau in dit formulier.
    for (const { rij, veld, tekst } of voorwaarden) {
      const m = tekst.match(/^(.+?)\s*=\s*(.+)$/) ?? tekst.match(/^(.+?)\s+is\s+(.+)$/i);
      const niv = veld.niveau === 'bevinding' ? 'bevinding' : 'inspectie';
      const bron = m ? metLabel.get(`${niv}|${norm(m[1])}`) : null;
      if (!m || !bron) { waarsch(`Regel ${rij}: voorwaarde "${tekst}" niet gevonden (schrijf "Vraag = Waarde", met een vraag uit hetzelfde formulier); de vraag wordt altijd getoond.`); continue; }
      if (!V.VOORWAARDE_TYPEN.includes(bron.type)) { waarsch(`Regel ${rij}: "${bron.label}" is geen ja/nee- of keuzevraag; de voorwaarde wordt genegeerd.`); continue; }
      const waarden = bron.type === 'janee' ? ['Ja', 'Nee'] : bron.opties;
      const w = waarden.find((x) => norm(x) === norm(m[2]));
      if (!w) { waarsch(`Regel ${rij}: "${m[2]}" is geen antwoord van "${bron.label}" (${waarden.join(', ')}); de voorwaarde wordt genegeerd.`); continue; }
      veld.toonAls = { veld: bron.id, waarde: w };
    }
    type.punten = punten;
    if (!type.methodiek) type.methodiek = punten.length ? 'checklist' : 'oordeel';
    const c = TY.controleer(type);
    c.fouten.filter((x) => !/^Geef het inspectietype/.test(x)).forEach(fout);
    const schoon = velden.map(V.normaliseer);
    uit.push({
      naam: f.naam, bestaat: bestaandSet.has(f.naam.toLowerCase()), basis: basis ? ins.basis : '', type: c.type, velden: schoon,
      aantallen: {
        vragen: schoon.filter(V.isInvoer).length, eisvragen: schoon.filter((d) => d.eis).length, perBevinding: schoon.filter((d) => d.niveau === 'bevinding').length,
        controlepunten: c.type.punten.length, onderdelen: c.type.onderdelen.length, gebreken: c.type.gebreken.length,
      },
      fouten: f.fouten, waarschuwingen: f.waarschuwingen,
    });
  }
  return { formulieren: uit, fouten, bladen: { vragen: vragenBlad?.naam ?? '', formulieren: formBlad?.naam ?? '' } };
}

// ---------------------------------------------------------------------------
// Sjabloon
// ---------------------------------------------------------------------------
export const SJABLOON = {
  formulieren: [
    ['Formulier', 'Methodiek', 'Omschrijving', 'Schaal', 'Onderdelen', 'Gebreken', 'Op basis van', "Overzichtsfoto's"],
    ['Schouw bebording', 'Oordeel', 'Jaarlijkse schouw van borden en palen', 'Goed;Matig;Slecht', 'Bord;Paal;Fundering', 'Scheef;Beschadigd;Onleesbaar', '', 'Nee'],
    ['Controle afzetting', 'Checklist', 'Dagelijkse controle van de werkvakafzetting', '', '', '', '', 'Ja'],
    ['Oplevering verharding', 'Oordeel', 'Opleverinspectie met eisen uit het bestek', 'Akkoord;Restpunt', '', '', '', 'Ja'],
  ],
  vragen: [
    ['Formulier', 'Vraag', 'Antwoordtype', 'Keuzes', 'Verplicht', 'Waar', 'Eisnummer', 'Toelichting', 'Eenheid', 'Min', 'Max', 'Standaardwaarde', 'Alleen tonen als'],
    ['Schouw bebording', 'Weersomstandigheden', 'Keuze', 'Droog;Regen;Sneeuw', 'Nee', 'Per inspectie', '', '', '', '', '', 'Droog', ''],
    ['Schouw bebording', 'Bord vervangen nodig?', 'Ja/nee', '', 'Ja', 'Per bevinding', '', '', '', '', '', '', ''],
    ['Schouw bebording', 'Locatie van het bord', 'Locatie', '', 'Nee', 'Per bevinding', '', 'Tik het bord aan op de kaart', '', '', '', '', ''],
    ['Controle afzetting', 'Hekken staan aaneengesloten', '', '', '', 'Controlepunt', '', '', '', '', '', '', ''],
    ['Controle afzetting', 'Verlichting werkt', '', '', '', 'Controlepunt', '', '', '', '', '', '', ''],
    ['Controle afzetting', 'Omleidingsborden geplaatst', '', '', '', 'Controlepunt', '', '', '', '', '', '', ''],
    ['Controle afzetting', 'Handtekening uitvoerder', 'Handtekening', '', 'Ja', 'Per inspectie', '', '', '', '', '', '', ''],
    ['Oplevering verharding', 'Vlakheid en afwatering', 'Kop', '', '', 'Per inspectie', '', 'Meet met de rij op drie plaatsen per vak', '', '', '', '', ''],
    ['Oplevering verharding', 'Voldoet de vlakheid aan de eis?', 'Ja/nee', '', 'Ja', 'Per inspectie', 'E-3.2.1', '', '', '', '', '', ''],
    ['Oplevering verharding', 'Grootste afwijking', 'Getal', '', 'Nee', 'Per inspectie', '', '', 'mm', '0', '50', '', 'Voldoet de vlakheid aan de eis? = Nee'],
    ['Oplevering verharding', 'Datum oplevering', 'Datum', '', 'Ja', 'Per inspectie', '', '', '', '', '', 'vandaag', ''],
  ],
  uitleg: [
    ['Kolom', 'Uitleg'],
    ['Formulieren · Formulier', 'Naam van het formulier (inspectietype). Bestaat het al, dan kies je bij het inlezen: vervangen of overslaan.'],
    ['Formulieren · Methodiek', 'Oordeel (eigen schaal), Checklist (controlepunten) of NEN 2767. Leeg: Checklist als er controlepunten zijn, anders Oordeel.'],
    ['Formulieren · Schaal', 'Niveaus van goed naar slecht, gescheiden door ; (2 tot 6). Kleuren worden automatisch gekozen.'],
    ['Formulieren · Onderdelen / Gebreken', 'Keuzelijsten bij een bevinding, gescheiden door ;. Kan ook als regels in het blad Vragen (Waar = Onderdeel of Gebrek).'],
    ['Formulieren · Op basis van', 'Naam van een bestaand formulier (dit project of de bibliotheek): het nieuwe formulier begint als kopie daarvan, de vragen uit het blad Vragen komen erbij.'],
    ["Formulieren · Overzichtsfoto's", "Ja: het formulier vraagt één keer per inspectie om overzichtsfoto's."],
    ['Vragen · Formulier', 'Bij welk formulier de vraag hoort. Leeg = hetzelfde formulier als de regel erboven. Een formulier dat niet in het blad Formulieren staat, wordt ook gemaakt.'],
    ['Vragen · Vraag', 'De vraag zoals de invuller hem ziet. Bij een eisnummer mag hij leeg blijven: dan wordt de eisvraag uit de eisbibliotheek gebruikt.'],
    ['Vragen · Antwoordtype', 'Tekst, Getal, Keuze, Meerkeuze, Ja/nee, Datum, Tijd, Foto, Checklist, Locatie, Coördinaten (of Lijn / Vlak), Handtekening, Begin- en eindtijd, Bijlage of Kop (tussenkop met uitleg, geen antwoord).'],
    ['Vragen · Keuzes', 'Bij Keuze, Meerkeuze en Checklist: de opties, gescheiden door ;.'],
    ['Vragen · Verplicht', 'Ja of Nee. Leeg: Nee, behalve bij een eisvraag (dan Ja).'],
    ['Vragen · Waar', 'Per inspectie (standaard), Per bevinding (in elk gebrek of elke bevinding), Controlepunt (checklist), Onderdeel of Gebrek (keuzelijsten).'],
    ['Vragen · Eisnummer', 'Koppelt de vraag aan een eis uit de eisbibliotheek van het project; telt mee voor de verificatie per eis.'],
    ['Vragen · Toelichting', 'Uitleg voor de invuller, onder de vraag.'],
    ['Vragen · Eenheid, Min, Max', 'Alleen bij Getal.'],
    ['Vragen · Standaardwaarde', 'Vooraf ingevuld: tekst, getal, een keuze, Ja/Nee, een datum of "vandaag", een tijd of "nu".'],
    ['Vragen · Alleen tonen als', '"Vraag = Waarde", bijv. "Afgevoerd? = Ja": de vraag verschijnt alleen bij dat antwoord. De vraag moet in hetzelfde formulier staan.'],
  ],
};

// ---------------------------------------------------------------------------
// Exporteren in hetzelfde formaat (aanpassen in Excel en weer inlezen)
// ---------------------------------------------------------------------------
const TYPE_TEKST = { tekst: 'Tekst', getal: 'Getal', keuze: 'Keuze', janee: 'Ja/nee', datum: 'Datum', tijd: 'Tijd', foto: 'Foto', checklist: 'Checklist',
  meerkeuze: 'Meerkeuze', locatie: 'Locatie', geometrie: 'Coördinaten', handtekening: 'Handtekening', tijdsduur: 'Begin- en eindtijd', bijlage: 'Bijlage', kop: 'Kop' };
const METHODIEK_TEKST = { nen: 'NEN 2767', oordeel: 'Oordeel', checklist: 'Checklist' };

/**
 * Formulieren als regels voor de bladen Formulieren en Vragen (zelfde kolommen als het sjabloon).
 * @param {{type: object, velden: object[]}[]} formulieren
 */
export function naarRegels(formulieren) {
  const fRegels = [SJABLOON.formulieren[0]];
  const vRegels = [SJABLOON.vragen[0]];
  for (const { type, velden } of formulieren ?? []) {
    fRegels.push([type.naam, METHODIEK_TEKST[type.methodiek] ?? 'Oordeel', type.omschrijving ?? '', type.methodiek === 'oordeel' ? (type.schaal ?? []).map((x) => x.label).join(';') : '',
      (type.onderdelen ?? []).join(';'), (type.gebreken ?? []).join(';'), '', type.overzichtsfotos ? 'Ja' : 'Nee']);
    const perId = new Map((velden ?? []).map((d) => [d.id, d]));
    for (const p of type.punten ?? []) vRegels.push([type.naam, p, '', '', '', 'Controlepunt', '', '', '', '', '', '', '']);
    for (const d of velden ?? []) {
      const bron = d.toonAls?.veld ? perId.get(d.toonAls.veld) : null;
      vRegels.push([type.naam, d.label, TYPE_TEKST[d.type] ?? d.type, (d.opties ?? []).join(';'), d.type === 'kop' ? '' : d.verplicht ? 'Ja' : 'Nee',
        d.niveau === 'bevinding' ? 'Per bevinding' : 'Per inspectie', d.eis?.nummer ?? '', d.hulptekst ?? '', d.eenheid ?? '', d.min ?? '', d.max ?? '', d.standaard ?? '',
        bron ? `${bron.label} = ${d.toonAls.waarde}` : '']);
    }
  }
  return { formulieren: fRegels, vragen: vRegels };
}
