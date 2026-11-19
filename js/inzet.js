// Bestede uren bij een storing of gebrek: een tabel met per regel wat er is ingezet (werknemer, auto, boot, …),
// hoeveel en hoe lang. Puur, zonder DOM.

export const MIDDELEN = ['Werknemer', 'Auto / bus', 'Vrachtwagen', 'Boot', 'Kraan / hoogwerker', 'Aggregaat / pomp', 'Overig materieel'];
export const MENS = 'Werknemer';

const getal = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

/** Regels opschonen: lege regels weg, getallen als getal (komma mag), aantal standaard 1. */
export function normaliseer(rijen) {
  return (rijen ?? []).map((r) => ({
    middel: String(r?.middel ?? '').trim() || MENS,
    omschrijving: String(r?.omschrijving ?? '').trim().slice(0, 120),
    aantal: getal(r?.aantal) || 1,
    uren: getal(r?.uren),
  })).filter((r) => r.uren > 0 || r.omschrijving);
}

/** Totalen: manuren (werknemers), materieeluren (de rest) en per middel; uren × aantal. */
export function totalen(rijen) {
  const per = new Map();
  let mens = 0;
  let materieel = 0;
  for (const r of normaliseer(rijen)) {
    const u = Math.round(r.uren * r.aantal * 100) / 100;
    per.set(r.middel, Math.round(((per.get(r.middel) ?? 0) + u) * 100) / 100);
    if (r.middel === MENS) mens += u; else materieel += u;
  }
  const rond = (x) => Math.round(x * 100) / 100;
  return { manuren: rond(mens), materieeluren: rond(materieel), totaal: rond(mens + materieel), per };
}

const nl = (x) => String(x).replace('.', ',');

/** Korte tekst voor exports: "Werknemer (Jan) 2 × 1,5 u; Boot 1 × 2 u". */
export function tekst(rijen) {
  return normaliseer(rijen).map((r) => `${r.middel}${r.omschrijving ? ` (${r.omschrijving})` : ''} ${nl(r.aantal)} × ${nl(r.uren)} u`).join('; ');
}

/** Klopt de tabel? Minstens één regel met uren. */
export function fouten(rijen) {
  const n = normaliseer(rijen);
  if (!n.some((r) => r.uren > 0)) return ['Vul bij Bestede uren minstens één regel met uren in.'];
  if (n.some((r) => !r.uren)) return ['Vul bij elke regel van Bestede uren het aantal uren in.'];
  return [];
}
