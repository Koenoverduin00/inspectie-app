// Planningsbord: rekenwerk voor de balken (dagen, schaal, posities, verslepen). Puur en testbaar;
// het tekenen en de interactie staan in app.js.

const DAG = 86400000;
/** ISO-datum (JJJJ-MM-DD) → dagnummer (dagen sinds 1970, UTC). */
export const dagNr = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? Math.round(Date.parse(`${iso}T00:00:00Z`) / DAG) : null);
/** Dagnummer → ISO-datum. */
export const isoVan = (n) => new Date(n * DAG).toISOString().slice(0, 10);
export const weekdag = (n) => (new Date(n * DAG).getUTCDay() + 6) % 7; // 0 = maandag
export const maandag = (n) => n - weekdag(n);

/** Zoomniveaus: aantal dagen in beeld en pixels per dag. */
export const ZOOM = {
  weken: { label: 'Weken', dagen: 63, px: 26, stap: 7 },
  maanden: { label: 'Maanden', dagen: 182, px: 7, stap: 30 },
  jaar: { label: 'Jaar', dagen: 371, px: 3.2, stap: 91 },
};

/** Begin van het zichtbare bereik: een maandag, met wat ruimte vóór het anker. */
export function bereik(zoom, ankerIso) {
  const z = ZOOM[zoom] ?? ZOOM.maanden;
  const anker = dagNr(ankerIso) ?? 0;
  const begin = maandag(anker - Math.round(z.dagen * 0.15));
  return { begin, eind: begin + z.dagen - 1, px: z.px, dagen: z.dagen };
}

const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
/** Kopregels: maanden (met jaar) en weken. */
export function kop({ begin, eind }) {
  const maanden = [];
  const weken = [];
  for (let n = begin; n <= eind; n++) {
    const d = new Date(n * DAG);
    if (n === begin || d.getUTCDate() === 1) maanden.push({ van: n, label: `${MAANDEN[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
    if (weekdag(n) === 0) weken.push({ van: n, label: `wk ${weeknummer(n)}` });
  }
  maanden.forEach((m, i) => { m.tot = (maanden[i + 1]?.van ?? eind + 1) - 1; });
  weken.forEach((w, i) => { w.tot = Math.min((weken[i + 1]?.van ?? w.van + 7) - 1, eind); });
  return { maanden, weken };
}

/** ISO-weeknummer. */
export function weeknummer(n) {
  const d = new Date(n * DAG);
  const donderdag = n - weekdag(n) + 3;
  const jaar = new Date(donderdag * DAG).getUTCFullYear();
  const eersteDonderdag = dagNr(`${jaar}-01-04`) - weekdag(dagNr(`${jaar}-01-04`)) + 3;
  return 1 + Math.round((donderdag - eersteDonderdag) / 7) + (d ? 0 : 0);
}

/** Periode van een ronde als dagnummers; zonder einddatum telt één week, zonder start is er niets gepland. */
export function periode(r) {
  const s = dagNr(r?.start);
  if (s === null) return null;
  const e = dagNr(r?.eind);
  return { start: s, eind: e !== null && e >= s ? e : s + 6, open: e === null };
}

/** Positie van een balk in pixels (null als hij buiten beeld valt). */
export function balk(r, { begin, eind, px }) {
  const p = periode(r);
  if (!p || p.eind < begin || p.start > eind) return null;
  const van = Math.max(p.start, begin);
  const tot = Math.min(p.eind, eind);
  return { left: (van - begin) * px, width: (tot - van + 1) * px, afgekaptLinks: p.start < begin, afgekaptRechts: p.eind > eind };
}

/**
 * Nieuwe periode na verslepen. modus: 'verplaats' | 'begin' | 'eind'. delta in dagen.
 * De periode is altijd minstens één dag.
 */
export function versleep({ start, eind }, modus, delta) {
  if (modus === 'verplaats') return { start: start + delta, eind: eind + delta };
  if (modus === 'begin') return { start: Math.min(start + delta, eind), eind };
  return { start, eind: Math.max(eind + delta, start) };
}

/** Ronde is te laat: einddatum verstreken en niet afgerond. */
export const teLaat = (r, vandaagIso) => Boolean(r?.eind && r.eind < vandaagIso && r.status !== 'afgerond');

/** Duur van een ronde in dagen: opgegeven duur, anders uit de geplande periode, anders één week. */
export function duurVan(r) {
  const d = Number(r?.duur);
  if (Number.isFinite(d) && d >= 1) return Math.round(d);
  const p = periode(r);
  return p && !p.open ? p.eind - p.start + 1 : 7;
}

/** Tekst die op een balk past: volledig, ingekort (R1 · 40%) of alleen het rondenummer. */
export function balkTekst(r, pct, breedte, { tekenBreedte = 6.6, marge = 18 } = {}) {
  const past = (t) => t.length * tekenBreedte + marge <= breedte;
  const vink = r.status === 'afgerond' ? '✓ ' : '';
  for (const t of [`${vink}R${r.nummer} ${r.naam} · ${pct}%`, `${vink}R${r.nummer} · ${pct}%`, `${vink}R${r.nummer}`, `R${r.nummer}`]) if (past(t)) return t;
  return breedte >= 16 ? (vink ? '✓' : '') : '';
}

/** Weergave van een duur: "3 weken" of "10 dagen". */
export const duurTekst = (dagen) => (dagen % 7 === 0 ? `${dagen / 7} ${dagen === 7 ? 'week' : 'weken'}` : `${dagen} ${dagen === 1 ? 'dag' : 'dagen'}`);

// ---------------------------------------------------------------------------
// Periodefilter voor rondes (planning en dashboard): standaard het lopende kalenderjaar, zodat een pakket met
// een ronde per jaar niet alle jaren tegelijk toont. Keuze als tekst: 'jaar' | 'volgend' | '12mnd' | 'alles'
// | 'j:2027' (een bepaald jaar) | 'eigen:2026-03-01:2026-10-31'.
// ---------------------------------------------------------------------------
export const PERIODE_STANDAARD = 'jaar';
const isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');

/** Van/tot (ISO) en label van een periodekeuze, of null voor "alle jaren". */
export function periodeBereik(keuze, vandaagIso) {
  const jaar = Number(String(vandaagIso).slice(0, 4));
  const k = String(keuze || PERIODE_STANDAARD);
  const kalender = (j, label) => ({ van: `${j}-01-01`, tot: `${j}-12-31`, label, jaar: j });
  if (k === 'alles') return null;
  if (k === 'volgend') return kalender(jaar + 1, `Volgend jaar (${jaar + 1})`);
  if (k === '12mnd') {
    const v = dagNr(vandaagIso);
    return { van: isoVan(v), tot: isoVan(v + 364), label: 'Komende 12 maanden' };
  }
  const j = k.match(/^j:(\d{4})$/);
  if (j) return kalender(Number(j[1]), j[1]);
  const e = k.match(/^eigen:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  if (e && isoOk(e[1]) && isoOk(e[2])) {
    const [van, tot] = e[1] <= e[2] ? [e[1], e[2]] : [e[2], e[1]];
    return { van, tot, label: `${van} t/m ${tot}`, eigen: true };
  }
  return kalender(jaar, `Dit jaar (${jaar})`);
}

/**
 * Valt een ronde in de periode? Een ronde telt mee als haar periode de gekozen periode overlapt.
 * Niet ingeplande rondes (zonder startdatum) tellen altijd mee, zodat ze ingepland kunnen worden.
 */
export function rondeInPeriode(r, bereik) {
  if (!bereik) return true;
  const p = periode(r);
  if (!p) return true;
  return p.start <= dagNr(bereik.tot) && p.eind >= dagNr(bereik.van);
}

/** De jaren waarin rondes liggen (voor de keuzelijst), oplopend, altijd met het huidige jaar. */
export function jarenVanRondes(rondes, vandaagIso) {
  const s = new Set([Number(String(vandaagIso).slice(0, 4))]);
  for (const r of rondes ?? []) {
    const p = periode(r);
    if (!p) continue;
    for (let j = Number(isoVan(p.start).slice(0, 4)); j <= Number(isoVan(p.eind).slice(0, 4)); j += 1) s.add(j);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * Hoe ver ligt de planning van een ronde van vandaag af, in dagen: 0 als vandaag binnen de periode valt, anders de afstand tot
 * de dichtstbijzijnde rand. Niet ingeplande rondes komen achteraan (Infinity).
 */
export function afstandTotVandaag(r, vandaagIso) {
  const p = periode(r);
  if (!p) return Infinity;
  const v = dagNr(vandaagIso);
  if (v >= p.start && v <= p.eind) return 0;
  return v < p.start ? p.start - v : v - p.eind;
}

/**
 * Volgorde bij afmelden op een locatie: eerst wat nog open is, daarin de planning die het dichtst bij vandaag ligt bovenaan
 * (lopend vóór binnenkort vóór verlopen bij gelijke afstand), daarna gedaan en overgeslagen.
 * @param {{ v: object, st: 'open'|'gedaan'|'overgeslagen' }[]} lijst
 */
export function dichtstbijEerst(lijst, vandaagIso) {
  const rang = { open: 0, gedaan: 1, overgeslagen: 2 };
  const v = dagNr(vandaagIso);
  const later = (x) => { const p = periode(x.v); return p && p.start > v ? 1 : 0; };
  return [...lijst].sort((a, b) => (rang[a.st] ?? 3) - (rang[b.st] ?? 3)
    || afstandTotVandaag(a.v, vandaagIso) - afstandTotVandaag(b.v, vandaagIso)
    || later(b) - later(a)
    || String(a.v.code ?? '').localeCompare(String(b.v.code ?? ''), 'nl', { numeric: true }));
}
