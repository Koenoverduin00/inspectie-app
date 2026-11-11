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
