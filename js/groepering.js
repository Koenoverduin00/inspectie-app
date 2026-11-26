// Registreren en afmelden op een hoger niveau van de decompositie (bijv. element of beheerobject i.p.v. bouwdeel).
// De koppeling met het onderhoud blijft per bouwdeel (GIS-object). Een groep bestaat alleen uit de objecten van het
// werkpakket die onder dezelfde knoop van het gekozen niveau vallen, dus niet uit alle onderliggende bouwdelen.
// Puur en testbaar: geen DOM, geen opslag.

/** Niveaus boven het bouwdeel waarop je kunt registreren (van laag naar hoog). Stelsels met andere namen worden bij het
 *  inlezen op deze vier niveaus gelegd (zie decompositie.js), dus de keuze werkt voor elk stelsel. */
export const NIVEAUS = ['element', 'object', 'systeemdeel'];
export const NIVEAU_LABEL = {
  '': 'Bouwdeel (per object, standaard)',
  element: 'Element',
  object: 'Object (beheerobject)',
  systeemdeel: 'Systeemdeel',
};
export const NIVEAU_KORT = { element: 'element', object: 'beheerobject', systeemdeel: 'systeemdeel' };

/** Voorouder van een knoop op het gekozen niveau (of de knoop zelf als die op dat niveau ligt). */
export function knoopOpNiveau(idx, knoopId, niveau) {
  let k = idx?.perId.get(knoopId);
  let n = 0;
  while (k && n < 10) {
    if (k.niveau === niveau) return k;
    k = k.ouder ? idx.perId.get(k.ouder) : null;
    n += 1;
  }
  return null;
}

/**
 * Groepen van de objecten van een werkpakket op het gekozen niveau.
 * @param {string[]} objectIds  objecten van het werkpakket (de ronde)
 * @param {(id: string) => object} objectVan  GIS-object met .decomp (knoop-id)
 * @returns {{ sleutel: string, knoop: object|null, objectIds: string[] }[]}  objecten zonder hoger niveau vormen elk een eigen groep
 */
export function groepeer(objectIds, objectVan, idx, niveau) {
  const groepen = new Map();
  for (const id of objectIds ?? []) {
    const o = objectVan(id);
    const k = niveau && idx && o?.decomp ? knoopOpNiveau(idx, o.decomp, niveau) : null;
    const sleutel = k ? k.id : `los:${id}`;
    if (!groepen.has(sleutel)) groepen.set(sleutel, { sleutel, knoop: k, objectIds: [] });
    groepen.get(sleutel).objectIds.push(id);
  }
  return [...groepen.values()];
}

/** De groep waar een object in zit (of null). */
export const groepVan = (groepen, objectId) => groepen.find((g) => g.objectIds.includes(objectId)) ?? null;

/** Welke niveaus zijn zinvol voor deze objecten: alleen niveaus waarop minstens één object een voorouder heeft. */
export function beschikbareNiveaus(objectIds, objectVan, idx) {
  if (!idx) return [];
  return NIVEAUS.filter((n) => (objectIds ?? []).some((id) => { const o = objectVan(id); return o?.decomp && knoopOpNiveau(idx, o.decomp, n); }));
}

/**
 * Status van een groep uit de statussen van de objecten:
 * afgekeurd gaat voor (opnieuw doen), dan open of deels (nog te doen), wacht op beoordeling, en pas als alles klaar is gedaan/overgeslagen.
 */
export function groepStatus(statussen) {
  const s = statussen ?? [];
  if (!s.length) return 'open';
  if (s.includes('afgekeurd')) return 'afgekeurd';
  const klaar = (x) => x === 'gedaan' || x === 'overgeslagen' || x === 'nietnodig';
  if (s.every(klaar)) return s.every((x) => x === 'overgeslagen') ? 'overgeslagen' : 'gedaan';
  if (s.some((x) => x === 'open') && s.some((x) => klaar(x) || x === 'deels' || x === 'ingediend')) return 'deels';
  if (s.includes('open')) return 'open';
  if (s.includes('deels')) return 'deels';
  return 'ingediend';
}

/** Korte naam van een groep, bijv. "E-12 Leuning (3 bouwdelen)". */
export function groepNaam(g, { aantal = true } = {}) {
  if (!g?.knoop) return '';
  const naam = [g.knoop.code, g.knoop.naam].filter(Boolean).join(' ');
  return aantal ? `${naam} (${g.objectIds.length} bouwde${g.objectIds.length === 1 ? 'el' : 'len'})` : naam;
}

// --- Boomweergave (rondevenster): van het afmeldniveau tot de bouwdelen ---
const HOOG_NAAR_LAAG = ['systeemdeel', 'object', 'element'];
/** De niveaus in de boom, van het gekozen niveau omlaag tot en met element (daaronder hangen de bouwdelen). */
export const boomNiveaus = (top) => { const i = HOOG_NAAR_LAAG.indexOf(top); return i < 0 ? [] : HOOG_NAAR_LAAG.slice(i); };

/**
 * Boom van de objecten van een ronde: bijv. object → element → bouwdelen.
 * Een object zonder knoop op een tussenliggend niveau hangt direct onder het dichtstbijzijnde niveau erboven.
 * @returns {{ kinderen: object[], objectIds: string[], alle: string[] }}  wortel; elk kind: { knoop, niveau, kinderen, objectIds, alle }
 */
export function boom(objectIds, objectVan, idx, top) {
  const niveaus = boomNiveaus(top);
  const wortel = { kinderen: new Map(), objectIds: [] };
  for (const id of objectIds ?? []) {
    const o = objectVan(id);
    let plek = wortel;
    for (const n of niveaus) {
      const k = o?.decomp && idx ? knoopOpNiveau(idx, o.decomp, n) : null;
      if (!k) continue;
      if (!plek.kinderen.has(k.id)) plek.kinderen.set(k.id, { knoop: k, niveau: n, kinderen: new Map(), objectIds: [] });
      plek = plek.kinderen.get(k.id);
    }
    plek.objectIds.push(id);
  }
  const volg = (a, b) => String(a.knoop.code || a.knoop.naam).localeCompare(String(b.knoop.code || b.knoop.naam), 'nl', { numeric: true });
  const maak = (x) => {
    const kinderen = [...x.kinderen.values()].map(maak).sort(volg);
    return { ...x, kinderen, alle: [...x.objectIds, ...kinderen.flatMap((c) => c.alle)] };
  };
  return maak(wortel);
}
