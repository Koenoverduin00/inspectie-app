// Inspectietypen: per inspectie een methodiek (NEN 2767, oordeel met eigen schaal, of checklist), per project in te
// stellen en via de formulierenbibliotheek van het bedrijf naar andere projecten te kopiëren. Puur en testbaar.

export const METHODIEKEN = {
  nen: {
    label: 'NEN 2767', kort: 'NEN 2767',
    uitleg: 'Gebreken met ernst, intensiteit en omvang; conditiescore 1–6. Met een decompositie per bouwdeel.',
  },
  oordeel: {
    label: 'Oordeel met eigen schaal', kort: 'Oordeel',
    uitleg: 'Per bevinding een onderdeel, gebrek en oordeel uit je eigen schaal (bijv. goed / matig / slecht). Eenvoudig en snel.',
  },
  checklist: {
    label: 'Checklist', kort: 'Checklist',
    uitleg: 'Vaste controlepunten: in orde, niet in orde of n.v.t. Bij "niet in orde" een foto, toelichting en eventueel een maatregel.',
  },
};

/** Kleuren die in de schaal kunnen worden gekozen (van goed naar slecht). */
export const KLEUREN = [
  ['#1a7f37', 'Groen'], ['#6aa84f', 'Lichtgroen'], ['#d99a00', 'Geel'], ['#e8710a', 'Oranje'], ['#d1452f', 'Rood'], ['#8b1a10', 'Donkerrood'], ['#5b6875', 'Grijs'],
];
export const STANDAARD_SCHAAL = [
  { waarde: 1, label: 'Goed', kleur: '#1a7f37' },
  { waarde: 2, label: 'Matig', kleur: '#d99a00' },
  { waarde: 3, label: 'Slecht', kleur: '#d1452f' },
];
export const CHECK = { ok: 'In orde', nok: 'Niet in orde', nvt: 'N.v.t.' };

// Standaardmethodiek voor de vaste inspectiesoorten (per project aan te passen).
const STANDAARD_METHODIEK = {
  'Conditiemeting NEN 2767': 'nen', 'Nadere / specialistische inspectie': 'nen', 'Duikinspectie': 'nen',
};

const slug = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const schoon = (lijst) => [...new Set((lijst ?? []).map((x) => String(x ?? '').trim()).filter(Boolean))];

/** Standaardtypen uit de vaste soorten (zonder de protocollen BVC en STOWA). */
export function standaardTypen(soorten, protocollen = []) {
  return soorten.filter((s) => !protocollen.includes(s)).map((naam) => ({
    id: `std-${slug(naam)}`, naam, standaard: true, methodiek: STANDAARD_METHODIEK[naam] ?? 'oordeel',
    omschrijving: '', schaal: STANDAARD_SCHAAL.map((x) => ({ ...x })), onderdelen: [], gebreken: [], punten: [], oordeelRegel: 'slechtste',
  }));
}

/**
 * De inspectietypen van een project: standaardtypen (eventueel aangepast of verborgen) plus eigen typen.
 * @returns {object[]} zichtbare typen, standaard eerst in vaste volgorde, daarna eigen typen op naam
 */
export function typenVan(project, soorten, protocollen = [], { ookVerborgen = false } = {}) {
  const eigen = project?.inspectietypen ?? [];
  const perNaam = new Map(eigen.map((t) => [t.naam, t]));
  const perId = new Map(eigen.map((t) => [t.id, t]));
  const std = standaardTypen(soorten, protocollen).map((s) => {
    const a = perId.get(s.id) ?? perNaam.get(s.naam);
    return a ? { ...s, ...a, id: s.id, standaard: true } : s;
  });
  const stdIds = new Set(std.map((s) => s.id));
  const stdNamen = new Set(std.map((s) => s.naam));
  const rest = eigen.filter((t) => !stdIds.has(t.id) && !stdNamen.has(t.naam))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  return [...std, ...rest].filter((t) => ookVerborgen || !t.verborgen);
}

export const typeVoor = (typen, soort) => (typen ?? []).find((t) => t.naam === soort) ?? null;

/** Methodiek van een opgeslagen inspectie; oude inspecties zonder type zijn NEN 2767. */
export function methodiekVan(i) {
  if (i?.bvc) return 'bvc';
  if (i?.stowa) return 'stowa';
  return i?.type?.methodiek ?? 'nen';
}

/** Momentopname van het type die bij de inspectie wordt bewaard. */
export function momentopname(t) {
  if (!t) return null;
  const { id, naam, methodiek, schaal, onderdelen, gebreken, punten, oordeelRegel, bron } = t;
  return { id, naam, methodiek, schaal, onderdelen, gebreken, punten, oordeelRegel, versie: bron?.versie ?? null };
}

const schaalVan = (i) => (i?.type?.schaal?.length ? i.type.schaal : STANDAARD_SCHAAL);
export const niveau = (schaal, waarde) => (schaal ?? STANDAARD_SCHAAL).find((x) => Number(x.waarde) === Number(waarde)) ?? null;

/**
 * Oordeel van een inspectie met methodiek 'oordeel' of 'checklist'.
 * @returns {{ waarde: number|null, label: string, kleur: string, tekst: string } | null}
 */
export function oordeelVan(i) {
  const m = methodiekVan(i);
  if (m === 'oordeel') {
    const schaal = schaalVan(i);
    let w;
    if (i.type?.oordeelRegel === 'handmatig') w = Number(i.oordeelHandmatig) || null;
    else {
      const ws = (i.gebreken ?? []).map((g) => Number(g.oordeel)).filter((x) => x > 0);
      w = ws.length ? Math.max(...ws) : Number(schaal[0]?.waarde ?? 1);
    }
    const n = w ? niveau(schaal, w) : null;
    return n ? { waarde: n.waarde, label: n.label, kleur: n.kleur, tekst: '' } : { waarde: null, label: 'Geen oordeel', kleur: '#8a96a3', tekst: '' };
  }
  if (m === 'checklist') {
    const c = checklistTelling(i);
    if (!c.totaal) return { waarde: null, label: 'Geen punten', kleur: '#8a96a3', tekst: '' };
    const label = c.nok ? `${c.nok} niet in orde` : 'Alles in orde';
    const kleur = c.nok ? (c.nok >= Math.max(2, Math.ceil(c.beoordeeld / 3)) ? '#d1452f' : '#e8710a') : '#1a7f37';
    return { waarde: c.nok, label, kleur, tekst: `${c.ok} in orde, ${c.nok} niet in orde${c.nvt ? `, ${c.nvt} n.v.t.` : ''}${c.open ? `, ${c.open} open` : ''}` };
  }
  return null;
}

export function checklistTelling(i) {
  const t = { totaal: 0, ok: 0, nok: 0, nvt: 0, open: 0, beoordeeld: 0 };
  for (const p of i?.checklist ?? []) {
    t.totaal += 1;
    if (p.status === 'ok') t.ok += 1; else if (p.status === 'nok') t.nok += 1; else if (p.status === 'nvt') t.nvt += 1; else t.open += 1;
  }
  t.beoordeeld = t.ok + t.nok;
  return t;
}

/** Oordeel van één bevinding (methodiek 'oordeel'). */
export function bevindingOordeel(i, g) {
  if (methodiekVan(i) === 'checklist') return { label: CHECK.nok, kleur: '#e8710a' };
  const n = niveau(schaalVan(i), g?.oordeel);
  return n ? { label: n.label, kleur: n.kleur } : { label: 'Geen oordeel', kleur: '#8a96a3' };
}

/** Maakt een type netjes en geldig; geeft { type, fouten }. */
export function controleer(t, { andereNamen = [] } = {}) {
  const fouten = [];
  const naam = String(t?.naam ?? '').trim();
  if (!naam) fouten.push('Geef het inspectietype een naam.');
  if (naam && andereNamen.some((x) => x.toLowerCase() === naam.toLowerCase())) fouten.push(`Er bestaat al een inspectietype "${naam}".`);
  const methodiek = METHODIEKEN[t?.methodiek] ? t.methodiek : 'oordeel';
  const schaal = (t?.schaal ?? []).map((x) => ({ label: String(x.label ?? '').trim(), kleur: KLEUREN.some(([k]) => k === x.kleur) ? x.kleur : '#5b6875' }))
    .filter((x) => x.label).map((x, n) => ({ waarde: n + 1, ...x }));
  if (methodiek === 'oordeel') {
    if (schaal.length < 2) fouten.push('Een schaal heeft minstens 2 niveaus.');
    if (schaal.length > 6) fouten.push('Een schaal heeft hoogstens 6 niveaus.');
    if (new Set(schaal.map((x) => x.label.toLowerCase())).size !== schaal.length) fouten.push('Elk niveau in de schaal heeft een eigen naam.');
  }
  const punten = schoon(t?.punten);
  if (methodiek === 'checklist' && !punten.length) fouten.push('Voeg minstens één controlepunt toe.');
  return {
    fouten,
    type: {
      ...t, naam, methodiek, omschrijving: String(t?.omschrijving ?? '').trim(),
      schaal: schaal.length ? schaal : STANDAARD_SCHAAL.map((x) => ({ ...x })),
      onderdelen: schoon(t?.onderdelen), gebreken: schoon(t?.gebreken), punten,
      oordeelRegel: t?.oordeelRegel === 'handmatig' ? 'handmatig' : 'slechtste',
    },
  };
}

/** Extra formuliervelden die (alleen) bij dit inspectietype horen. */
export function veldenVanType(velden, naam) {
  return (velden ?? []).filter((d) => d.formulier === 'inspectie' && (d.alleenBij ?? []).includes(naam));
}

/**
 * Zet een type (uit de bibliotheek of een ander project) in een project. Bestaat de naam al, dan wordt dat type
 * vervangen (zelfde id, zodat werkpakketten blijven kloppen). Velden die bij het type horen gaan mee.
 * @returns {{ inspectietypen: object[], velden: object[], type: object, vervangen: boolean }}
 */
export function zetInProject(project, type, { velden = [], bron = null, nieuwId }) {
  const lijst = [...(project?.inspectietypen ?? [])];
  const std = String(type.id ?? '').startsWith('std-') ? type.id : null;
  const i = lijst.findIndex((t) => t.naam.toLowerCase() === type.naam.toLowerCase() || (std && t.id === std));
  const { standaard, verborgen, ...rest } = type;
  const id = i >= 0 ? lijst[i].id : (std ?? nieuwId());
  const nieuw = { ...rest, id, bron: bron ?? rest.bron ?? null, verborgen: false };
  if (nieuw.bron) nieuw.bron = { ...nieuw.bron, aangepast: false };
  if (i >= 0) lijst[i] = nieuw; else lijst.push(nieuw);
  // Velden: bestaande velden bij dit type vervangen door die uit de bron.
  const anders = (project?.velden ?? []).filter((d) => !(d.formulier === 'inspectie' && (d.alleenBij ?? []).length === 1 && d.alleenBij[0] === type.naam));
  const erbij = velden.map((d) => ({ ...d, id: nieuwId(), formulier: 'inspectie', alleenBij: [type.naam] }));
  return { inspectietypen: lijst, velden: [...anders, ...erbij], type: nieuw, vervangen: i >= 0 };
}

/** Velden voor de bibliotheek: los van het project (geen ids of voorwaarden naar andere velden buiten het type). */
export function veldenVoorBibliotheek(velden, naam) {
  const eigen = veldenVanType(velden, naam);
  const ids = new Set(eigen.map((d) => d.id));
  return eigen.map(({ alleenBij, ...d }) => ({ ...d, toonAls: d.toonAls && ids.has(d.toonAls.veld) ? d.toonAls : null }));
}

/** Staat er een nieuwere versie in de bibliotheek dan in het project? */
export function nieuwereVersie(type, items) {
  const b = type?.bron;
  if (!b?.bibId) return null;
  const item = (items ?? []).find((x) => x.id === b.bibId && !x.verwijderd);
  return item && Number(item.versie) > Number(b.versie) ? item : null;
}

export const VOORBEELDEN = [
  {
    naam: 'Staat verhardingen', methodiek: 'oordeel',
    omschrijving: 'Visuele beoordeling van rijbanen, fietspaden en trottoirs.',
    schaal: [
      { label: 'Goed', kleur: '#1a7f37' }, { label: 'Redelijk', kleur: '#6aa84f' }, { label: 'Matig', kleur: '#d99a00' }, { label: 'Slecht', kleur: '#d1452f' },
    ],
    onderdelen: ['Rijbaan', 'Fietspad', 'Trottoir', 'Parkeervak', 'Inrit', 'Opsluitband / kantstreep'],
    gebreken: ['Rafeling', 'Scheurvorming', 'Spoorvorming', 'Oneffenheden', 'Uitgezakte elementen', 'Wortelopdruk', 'Ontbrekende elementen', 'Plasvorming', 'Gaten / potholes'],
    punten: [], oordeelRegel: 'slechtste',
  },
  {
    naam: 'Bebording', methodiek: 'checklist',
    omschrijving: 'Controle van verkeers- en bewegwijzeringsborden.',
    schaal: [], onderdelen: [], gebreken: [],
    punten: ['Bord aanwezig en juist', 'Goed zichtbaar (geen begroeiing)', 'Reflectie voldoende', 'Bord onbeschadigd', 'Bord schoon', 'Paal recht en stevig', 'Bevestiging in orde'],
    oordeelRegel: 'slechtste',
  },
  {
    naam: 'Eenvoudige schouw', methodiek: 'oordeel',
    omschrijving: 'Snelle visuele schouw met drie niveaus.',
    schaal: STANDAARD_SCHAAL.map(({ label, kleur }) => ({ label, kleur })), onderdelen: [], gebreken: [], punten: [], oordeelRegel: 'slechtste',
  },
];
