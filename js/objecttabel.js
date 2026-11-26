// Objectentabel: pagina's (standaard 100 regels) en zelf te kiezen kolommen, waaronder alle kolommen uit de GIS-bestanden.
// Puur en testbaar: geen DOM, geen opslag.

export const PER_PAGINA_KEUZES = [25, 50, 100, 250, 500, 0]; // 0 = alles op één pagina
export const PER_PAGINA_STANDAARD = 100;

/** Vaste kolommen van de app (Code staat altijd vooraan). */
export const STANDAARD_KOLOMMEN = [
  { id: 'naam', label: 'Naam', aan: true },
  { id: 'type', label: 'Type', aan: true, smal: true },
  { id: 'bouwjaar', label: 'Bouwjaar', aan: true, smal: true },
  { id: 'conditie', label: 'Conditie', aan: true },
  { id: 'laatste', label: 'Laatste inspectie', aan: true, smal: true },
  { id: 'planning', label: 'Planning', aan: true },
  { id: 'laag', label: 'Laag', aan: false },
  { id: 'materiaal', label: 'Materiaal', aan: false },
  { id: 'beheerder', label: 'Beheerder', aan: false },
  { id: 'locatie', label: 'Locatie', aan: false },
  { id: 'status', label: 'Status', aan: false },
];
export const GIS = 'k:'; // voorvoegsel van een GIS-kolom: k:<kolomnaam>

const bruikbaar = (v) => v !== undefined && v !== null && v !== '' && typeof v !== 'object';

/**
 * Alle kolommen uit de GIS-bestanden: eerst in de volgorde van de lagen (zoals in het bestand), daarna wat alleen
 * bij losse objecten voorkomt. Kolommen die bij geen enkel object een waarde hebben vallen weg.
 */
export function gisKolommen(objecten, lagen = []) {
  const gevuld = new Set();
  for (const o of objecten ?? []) for (const [k, v] of Object.entries(o.kenmerken ?? {})) if (bruikbaar(v)) gevuld.add(k);
  const uit = [];
  const gezien = new Set();
  const voeg = (k) => { if (gevuld.has(k) && !gezien.has(k)) { gezien.add(k); uit.push(k); } };
  for (const l of lagen ?? []) for (const k of l.velden ?? []) voeg(k);
  [...gevuld].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true })).forEach(voeg);
  return uit;
}

/** Alle beschikbare kolommen (standaard + GIS) als { id, label, gis }. */
export function beschikbareKolommen(objecten, lagen = []) {
  return [
    ...STANDAARD_KOLOMMEN.map((k) => ({ ...k, gis: false })),
    ...gisKolommen(objecten, lagen).map((k) => ({ id: GIS + k, label: k, gis: true, aan: false })),
  ];
}

/** De gekozen kolommen, opgeschoond: onbekende vallen weg; zonder keuze de standaard. */
export function gekozenKolommen(opgeslagen, beschikbaar) {
  const ids = new Set(beschikbaar.map((k) => k.id));
  if (!Array.isArray(opgeslagen)) return beschikbaar.filter((k) => k.aan).map((k) => k.id);
  return opgeslagen.filter((id) => ids.has(id));
}

/** Waarde van een GIS-kolom als tekst. */
export function kenmerkTekst(o, kolom) {
  const v = o?.kenmerken?.[kolom];
  if (!bruikbaar(v)) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000).replace('.', ',');
  if (typeof v === 'boolean') return v ? 'ja' : 'nee';
  return String(v);
}

/** Eén pagina uit een lijst. perPagina 0 = alles. Het paginanummer wordt binnen de grenzen gehouden. */
export function pagina(lijst, nr, perPagina = PER_PAGINA_STANDAARD) {
  const totaal = lijst?.length ?? 0;
  const per = perPagina > 0 ? perPagina : Math.max(totaal, 1);
  const paginas = Math.max(1, Math.ceil(totaal / per));
  const p = Math.min(Math.max(1, Math.floor(Number(nr) || 1)), paginas);
  const van = totaal ? (p - 1) * per : 0;
  const tot = Math.min(totaal, van + per);
  return { items: (lijst ?? []).slice(van, tot), nr: p, paginas, van: totaal ? van + 1 : 0, tot, totaal };
}

/** Paginanummers voor de knoppen, met '…' voor overgeslagen stukken: bijv. [1, '…', 4, 5, 6, '…', 20]. */
export function paginaNummers(nr, paginas) {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i + 1);
  const set = new Set([1, paginas, nr - 1, nr, nr + 1].filter((x) => x >= 1 && x <= paginas));
  if (nr <= 3) [2, 3, 4].forEach((x) => set.add(x));
  if (nr >= paginas - 2) [paginas - 3, paginas - 2, paginas - 1].forEach((x) => set.add(x));
  const lijst = [...set].sort((a, b) => a - b);
  const uit = [];
  lijst.forEach((x, i) => { if (i && x - lijst[i - 1] > 1) uit.push('…'); uit.push(x); });
  return uit;
}
