// Planning vastzetten met een versienummer, en wie de planning mag bewerken.
// Per project aan/uit:
// - project.planningVastzetten (standaard uit): de planning kan worden vastgezet als versie 1, 2, 3 …
//   Vastgezet = niemand kan de planning wijzigen tot een beheerder hem vrijgeeft voor de volgende versie.
// - project.planningAlleenBeheer (standaard aan): alleen beheerders bewerken de planning.
//   Uit: ook projectleden met het recht 'Planning bewerken'.
// Een versie is een compacte momentopname: per ronde [sleutel, label, start, eind, status].

export const MAX_VERSIES = 50;

export const instellingen = (project) => ({
  vastzetten: project?.planningVastzetten === true,
  alleenBeheer: project?.planningAlleenBeheer !== false,
});

export const sleutel = (pakketId, rondeId) => `${pakketId}:${rondeId}`;

/** Is de planning nu vastgezet? (alleen als de functie in het project aan staat) */
export const isVast = (project) => instellingen(project).vastzetten && project?.planningVast === true;

export const versies = (project) => [...(project?.planningVersies ?? [])].sort((a, b) => a.nummer - b.nummer);
export const laatsteVersie = (project) => versies(project).at(-1) ?? null;
export const volgendNummer = (project) => (laatsteVersie(project)?.nummer ?? 0) + 1;

/** Tekst voor de kop van de planning, bijv. "v3 · vastgesteld" of "v4 (concept)". */
export function versieLabel(project) {
  if (!instellingen(project).vastzetten) return '';
  const l = laatsteVersie(project);
  if (isVast(project) && l) return `v${l.nummer}`;
  return `v${volgendNummer(project)} (concept)`;
}

/**
 * Mag deze gebruiker de planning bewerken?
 * @returns {{ mag: boolean, reden: '' | 'vast' | 'beheer' | 'recht' }}
 */
export function magBewerken(project, { beheerder = false, rechtPlannen = false } = {}) {
  if (isVast(project)) return { mag: false, reden: 'vast' };
  const { alleenBeheer } = instellingen(project);
  if (beheerder) return { mag: true, reden: '' };
  if (alleenBeheer) return { mag: false, reden: 'beheer' };
  return rechtPlannen ? { mag: true, reden: '' } : { mag: false, reden: 'recht' };
}

/**
 * Momentopname van de planning: alle rondes van vooraf geplande werkpakketten (afroepen horen er niet bij).
 * @param {object[]} pakketten
 * @param {(p: object) => object[]} rondesVan
 */
export function momentopname(pakketten, rondesVan) {
  const rondes = [];
  for (const p of pakketten) {
    if (p.planning === 'afroep') continue;
    for (const r of rondesVan(p)) {
      rondes.push([sleutel(p.id, r.id), `${p.code || p.naam || 'WP'} R${r.nummer ?? 1}${r.naam ? ` ${r.naam}` : ''}`, r.start || '', r.eind || r.start || '', r.status || 'gepland']);
    }
  }
  return rondes;
}

/** Nieuwe versie vastzetten: geeft de wijziging voor het project terug. */
export function vastzetten(project, rondes, { op, door = '', opmerking = '' }) {
  const nummer = volgendNummer(project);
  const lijst = [...versies(project), { nummer, op, door, opmerking: String(opmerking ?? '').trim(), rondes }].slice(-MAX_VERSIES);
  return { planningVast: true, planningVersies: lijst, planningLog: [...(project?.planningLog ?? []), { actie: 'vastgezet', versie: nummer, op, door }].slice(-200) };
}

/** Vrijgeven voor wijziging: de volgende versie is in concept. */
export function vrijgeven(project, { op, door = '', reden = '' }) {
  const l = laatsteVersie(project);
  return { planningVast: false, planningLog: [...(project?.planningLog ?? []), { actie: 'vrijgegeven', versie: l?.nummer ?? 0, op, door, reden: String(reden ?? '').trim() }].slice(-200) };
}

/** Per ronde de vastgestelde periode uit een versie. */
export function basislijn(versie) {
  return new Map((versie?.rondes ?? []).map(([k, label, start, eind, status]) => [k, { label, start, eind, status }]));
}

/**
 * Verschillen tussen een versie en de huidige planning (of tussen twee versies).
 * soort: 'verschoven' (start anders), 'duur' (alleen eind anders), 'nieuw', 'vervallen', 'ingepland', 'uitgepland'.
 */
export function vergelijk(oud, nieuw) {
  const a = basislijn({ rondes: oud });
  const b = basislijn({ rondes: nieuw });
  const uit = [];
  for (const [k, n] of b) {
    const o = a.get(k);
    if (!o) { uit.push({ sleutel: k, label: n.label, soort: 'nieuw', oud: null, nieuw: n }); continue; }
    if (o.start === n.start && o.eind === n.eind) continue;
    const soort = !o.start && n.start ? 'ingepland' : o.start && !n.start ? 'uitgepland' : o.start !== n.start ? 'verschoven' : 'duur';
    uit.push({ sleutel: k, label: n.label, soort, oud: o, nieuw: n, dagen: o.start && n.start ? dagenTussen(o.start, n.start) : null });
  }
  for (const [k, o] of a) if (!b.has(k)) uit.push({ sleutel: k, label: o.label, soort: 'vervallen', oud: o, nieuw: null });
  return uit.sort((x, y) => x.label.localeCompare(y.label, 'nl', { numeric: true }));
}

export const VERSCHIL_TEKST = {
  verschoven: 'Verschoven', duur: 'Duur gewijzigd', nieuw: 'Nieuw', vervallen: 'Vervallen', ingepland: 'Ingepland', uitgepland: 'Uit de planning gehaald',
};

function dagenTussen(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
