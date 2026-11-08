// Conditiebepaling volgens de systematiek van NEN 2767 (indicatief).
// Een gebrek wordt beoordeeld op ernst, intensiteit en omvang; samen leveren
// die een conditiescore van 1 (uitstekend) t/m 6 (zeer slecht) op.
// Pure functies, zonder afhankelijkheden van de browser, zodat ze testbaar zijn.

export const CONDITIES = {
  1: { label: 'Uitstekend', omschrijving: 'Incidenteel geringe gebreken', kleur: '#1a7f37' },
  2: { label: 'Goed', omschrijving: 'Incidenteel beginnende veroudering', kleur: '#4c9a2a' },
  3: { label: 'Redelijk', omschrijving: 'Plaatselijk zichtbare veroudering', kleur: '#c9a400' },
  4: { label: 'Matig', omschrijving: 'Functievervulling van bouw- en installatiedelen in gevaar', kleur: '#e07b00' },
  5: { label: 'Slecht', omschrijving: 'De veroudering is onomkeerbaar', kleur: '#d1452f' },
  6: { label: 'Zeer slecht', omschrijving: 'Technisch rijp voor sloop', kleur: '#8b1a1a' },
};

export const ERNST = {
  gering: { waarde: 1, label: 'Gering' },
  serieus: { waarde: 2, label: 'Serieus' },
  ernstig: { waarde: 3, label: 'Ernstig' },
};

export const INTENSITEIT = {
  1: 'Beginstadium',
  2: 'Gevorderd stadium',
  3: 'Eindstadium',
};

export const OMVANG_KLASSEN = [
  { klasse: 1, max: 2, label: 'Incidenteel (< 2%)' },
  { klasse: 2, max: 10, label: 'Plaatselijk (2–10%)' },
  { klasse: 3, max: 30, label: 'Regelmatig (10–30%)' },
  { klasse: 4, max: 70, label: 'Aanzienlijk (30–70%)' },
  { klasse: 5, max: Infinity, label: 'Algemeen (≥ 70%)' },
];

export const URGENTIES = [
  { id: 'direct', label: 'Direct (veiligheid)', rang: 1 },
  { id: '1jaar', label: 'Binnen 1 jaar', rang: 2 },
  { id: '3jaar', label: 'Binnen 3 jaar', rang: 3 },
  { id: '5jaar', label: 'Binnen 5 jaar', rang: 4 },
  { id: 'monitoren', label: 'Monitoren', rang: 5 },
];

export function omvangKlasse(percentage) {
  const p = Number(percentage);
  if (!Number.isFinite(p) || p < 0) return 1;
  return OMVANG_KLASSEN.find((k) => p < k.max).klasse;
}

// Zwaarte van een gebrek: ernst (1-3) gecombineerd met intensiteit (1-3) → 1-5.
export function zwaarte(ernst, intensiteit) {
  const e = ERNST[ernst]?.waarde ?? 1;
  const i = clamp(Number(intensiteit) || 1, 1, 3);
  return e + i - 1;
}

// Conditiescore (1-6) van één gebrek.
export function gebrekScore(gebrek) {
  const handmatig = Number(gebrek?.conditieHandmatig);
  if (handmatig >= 1 && handmatig <= 6) return handmatig;
  const product = zwaarte(gebrek?.ernst, gebrek?.intensiteit) * omvangKlasse(gebrek?.omvang);
  if (product <= 1) return 1;
  if (product <= 3) return 2;
  if (product <= 6) return 3;
  if (product <= 10) return 4;
  if (product <= 16) return 5;
  return 6;
}

// De conditie van een inspectie wordt bepaald door het maatgevende (slechtste) gebrek.
// Zonder gebreken is de conditie 1.
export function inspectieScore(inspectie) {
  const gebreken = inspectie?.gebreken ?? [];
  if (gebreken.length === 0) return 1;
  return Math.max(...gebreken.map(gebrekScore));
}

// Datum (YYYY-MM-DD) van de volgende inspectie op basis van het interval in jaren.
export function volgendeInspectie(laatsteDatum, intervalJaren) {
  if (!laatsteDatum) return null;
  const d = new Date(`${laatsteDatum}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const jaren = Number(intervalJaren) > 0 ? Number(intervalJaren) : 1;
  const maanden = Math.round(jaren * 12);
  const doel = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + maanden, 1));
  const laatsteDag = new Date(Date.UTC(doel.getUTCFullYear(), doel.getUTCMonth() + 1, 0)).getUTCDate();
  doel.setUTCDate(Math.min(d.getUTCDate(), laatsteDag));
  return doel.toISOString().slice(0, 10);
}

// Status van de inspectieplanning ten opzichte van vandaag.
export function planningStatus(volgendeDatum, vandaag) {
  if (!volgendeDatum) return 'onbekend';
  const dagen = Math.round((Date.parse(volgendeDatum) - Date.parse(vandaag)) / 86400000);
  if (dagen < 0) return 'verlopen';
  if (dagen <= 90) return 'binnenkort';
  return 'gepland';
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
