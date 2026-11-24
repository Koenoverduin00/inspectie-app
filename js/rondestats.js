// Statistieken van één ronde, voor het rondevenster in de planning: ligt de ronde op koers en wat moet er nog gebeuren?
// Puur en testbaar: de voortgang (pakketten.voortgang) en de registraties komen van de aanroeper.
import { dagNr, isoVan } from './planning.js';

const isWerkdag = (n) => { const d = new Date(n * 86400000).getUTCDay(); return d !== 0 && d !== 6; };

/** Werkdagen (ma–vr) van a t/m b (ISO), 0 als b vóór a ligt. */
export function werkdagenTussen(a, b) {
  const s = dagNr(a); const e = dagNr(b);
  if (s === null || e === null || e < s) return 0;
  let n = 0;
  for (let d = s; d <= e; d += 1) if (isWerkdag(d)) n += 1;
  return n;
}

/** Datum na `n` werkdagen vanaf (exclusief) iso. */
export function plusWerkdagen(iso, n) {
  let d = dagNr(iso);
  let rest = Math.max(0, Math.ceil(n));
  while (rest > 0) { d += 1; if (isWerkdag(d)) rest -= 1; }
  return isoVan(d);
}

const rond = (x, n = 1) => Math.round(x * 10 ** n) / 10 ** n;

/**
 * @param {object} a
 * @param {{ start?: string, eind?: string, status?: string }} a.ronde
 * @param {ReturnType<import('./pakketten.js').voortgang>} a.vg
 * @param {object[]} a.registraties  alle registraties van deze ronde (ook gedeeltelijke), met datum
 * @param {string} a.vandaag
 * @param {(r: object) => number} [a.manurenVan]
 * @param {(r: object) => string} [a.wieVan]
 * @param {(r: object) => ({ label: string, kleur?: string } | null)} [a.oordeelVan]  bij inspecties
 */
export function rondeStatistiek({ ronde, vg, registraties = [], vandaag, manurenVan = (r) => Number(r.uren) || 0, wieVan = (r) => r.uitvoerder || r.inspecteur || '', oordeelVan = null }) {
  const totaal = vg?.totaal ?? 0;
  const gedaan = vg?.gedaan?.size ?? 0;
  const deels = vg?.deels?.size ?? 0;
  const overgeslagen = vg?.overgeslagen?.size ?? 0;
  const nietNodig = vg?.nietNodig?.size ?? 0;
  const afgehandeld = gedaan + overgeslagen + nietNodig;
  const open = Math.max(0, totaal - afgehandeld);
  const aantallen = { totaal, gedaan, deels, overgeslagen, nietNodig, open, nietGestart: Math.max(0, open - deels) };
  const percentage = vg?.percentage ?? (totaal ? Math.round((afgehandeld / totaal) * 100) : 0);

  // Tijd
  const start = /^\d{4}-\d{2}-\d{2}$/.test(ronde?.start ?? '') ? ronde.start : '';
  const eind = /^\d{4}-\d{2}-\d{2}$/.test(ronde?.eind ?? '') && (!start || ronde.eind >= start) ? ronde.eind : '';
  const klaar = ronde?.status === 'afgerond' || (totaal > 0 && open === 0);
  let fase = 'niet ingepland';
  if (klaar) fase = 'afgerond';
  else if (start && vandaag < start) fase = 'nog niet gestart';
  else if (start && eind && vandaag > eind) fase = 'verlopen';
  else if (start) fase = 'loopt';
  const werkdagen = start && eind ? werkdagenTussen(start, eind) : 0;
  const verstreken = start ? werkdagenTussen(start, eind && vandaag > eind ? eind : vandaag) : 0;
  const resterend = eind && vandaag <= eind ? werkdagenTussen(vandaag, eind) : 0;
  const pctTijd = werkdagen ? Math.min(100, Math.round((verstreken / werkdagen) * 100)) : null;
  const tijd = { start, eind, werkdagen, verstreken, resterend, pctTijd, fase };

  // Schema: verwachte voortgang volgens de tijd tegenover de werkelijke
  let schema = null;
  if (werkdagen && totaal && (fase === 'loopt' || fase === 'verlopen')) {
    const verwachtPct = pctTijd;
    const verwachtKlaar = Math.round((verwachtPct / 100) * totaal);
    schema = { verwachtPct, verschilPct: percentage - verwachtPct, objectenAchter: Math.max(0, verwachtKlaar - afgehandeld), objectenVoor: Math.max(0, afgehandeld - verwachtKlaar) };
  }

  // Activiteit
  const regs = registraties.filter((r) => /^\d{4}-\d{2}-\d{2}/.test(String(r.datum ?? ''))).sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
  const eerste = regs[0] ?? null;
  const laatste = regs.at(-1) ?? null;
  const actieveDagen = new Set(regs.map((r) => String(r.datum).slice(0, 10))).size;
  const activiteit = {
    registraties: regs.length, actieveDagen,
    eerste: eerste ? String(eerste.datum).slice(0, 10) : '', laatste: laatste ? String(laatste.datum).slice(0, 10) : '', laatsteWie: laatste ? wieVan(laatste) : '',
    dagenStil: laatste ? Math.max(0, dagNr(vandaag) - dagNr(String(laatste.datum).slice(0, 10))) : null,
  };

  // Tempo en prognose: afgehandelde objecten per werkdag sinds de start (of de eerste registratie, als die eerder was)
  let tempo = null;
  const vanaf = [start, activiteit.eerste].filter(Boolean).sort()[0] ?? '';
  if (vanaf && !klaar && vandaag >= vanaf) {
    const dagen = Math.max(1, werkdagenTussen(vanaf, eind && vandaag > eind ? vandaag : vandaag));
    const gerealiseerd = afgehandeld / dagen;
    const nodig = resterend ? open / resterend : null;
    const prognose = gerealiseerd > 0 ? plusWerkdagen(vandaag, open / gerealiseerd) : null;
    const verschil = prognose && eind ? (prognose > eind ? werkdagenTussen(isoVan(dagNr(eind) + 1), prognose) : -werkdagenTussen(isoVan(dagNr(prognose) + 1), eind)) : null;
    tempo = { gerealiseerd: rond(gerealiseerd), nodig: nodig === null ? null : rond(nodig), prognose, verschil };
  }

  // Uitvoerders: wie heeft hoeveel objecten afgemeld (volledig of gedeeltelijk)
  const perWie = new Map();
  for (const r of regs) {
    const w = wieVan(r) || 'onbekend';
    const x = perWie.get(w) ?? { wie: w, objecten: new Set(), registraties: 0 };
    x.objecten.add(r.objectId); x.registraties += 1;
    perWie.set(w, x);
  }
  const uitvoerders = [...perWie.values()].map((x) => ({ wie: x.wie, objecten: x.objecten.size, registraties: x.registraties }))
    .sort((a, b) => b.objecten - a.objecten || a.wie.localeCompare(b.wie, 'nl'));

  // Uren: geregistreerde manuren, gemiddeld per afgehandeld object, schatting voor de rest
  const urenTotaal = rond(regs.reduce((t, r) => t + (Number(manurenVan(r)) || 0), 0));
  const perObject = urenTotaal && (gedaan + deels) ? rond(urenTotaal / (gedaan + deels)) : null;
  const uren = urenTotaal ? { totaal: urenTotaal, perObject, rest: perObject !== null ? rond(perObject * open) : null } : null;

  // Inhoud: oordelen (inspecties), vervolg nodig (werk), redenen van overslaan
  const oordelen = new Map();
  if (oordeelVan) {
    for (const r of vg?.gedaan?.values() ?? []) {
      const o = oordeelVan(r);
      if (!o?.label) continue;
      const x = oordelen.get(o.label) ?? { label: o.label, kleur: o.kleur ?? '', aantal: 0 };
      x.aantal += 1; oordelen.set(o.label, x);
    }
  }
  const vervolg = [...(vg?.gedaan?.values() ?? [])].filter((r) => r.status === 'vervolg').length;
  const redenen = new Map();
  for (const o of vg?.overgeslagen?.values() ?? []) redenen.set(o.reden || 'geen reden', (redenen.get(o.reden || 'geen reden') ?? 0) + 1);
  return {
    aantallen, percentage, tijd, schema, tempo, activiteit, uitvoerders, uren,
    oordelen: [...oordelen.values()].sort((a, b) => b.aantal - a.aantal), vervolg,
    redenen: [...redenen].map(([reden, aantal]) => ({ reden, aantal })).sort((a, b) => b.aantal - a.aantal),
  };
}

/** Status van elk object in de ronde, met wat er over te melden is. */
export function objectRegels(ids, vg, { objectVan = () => null, wieVan = (r) => r.uitvoerder || r.inspecteur || '', oordeelVan = null } = {}) {
  return (ids ?? []).map((id) => {
    const o = objectVan(id);
    if (vg?.gedaan?.has(id)) {
      const r = vg.gedaan.get(id);
      return { id, o, status: 'gedaan', datum: String(r.datum ?? '').slice(0, 10), wie: wieVan(r), registratie: r, oordeel: oordeelVan ? oordeelVan(r) : null, vervolg: r.status === 'vervolg' };
    }
    if (vg?.overgeslagen?.has(id)) {
      const x = vg.overgeslagen.get(id);
      return { id, o, status: 'overgeslagen', datum: String(x.op ?? '').slice(0, 10), wie: x.door ?? '', reden: x.reden ?? '', toelichting: x.toelichting ?? '' };
    }
    if (vg?.deels?.has(id)) {
      const lijst = vg.deels.get(id);
      const l = lijst.at(-1);
      return { id, o, status: 'deels', datum: String(l?.datum ?? '').slice(0, 10), wie: l ? wieVan(l) : '', keer: lijst.length, registratie: l };
    }
    if (vg?.nietNodig?.has(id)) return { id, o, status: 'nietnodig' };
    return { id, o, status: 'open' };
  });
}
