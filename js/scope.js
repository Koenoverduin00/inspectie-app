// Objecten uit de scope van het contract halen. Het object blijft in het register (met historie), maar gaat uit
// alle werk- en inspectiepakketten:
// - afgeronde rondes en rondes die eindigen vóór de ingangsdatum blijven ongewijzigd;
// - rondes die op of na de ingangsdatum beginnen: object eruit;
// - de ronde waarin de ingangsdatum valt (of zonder datums): blijft staan als het object daar al gedaan is, anders eruit.
//   Ligt de ingangsdatum in de toekomst, dan wordt dat besluit genomen zodra de datum is bereikt ('wacht').
// Per werkpakket: p.uitScope[objectId] = { per, blijft: [rondeIds], wacht: [rondeIds] }. Het object hoort alleen nog
// bij de rondes in blijft of wacht (zie rondeView in pakketten.js). Blijft er niets over, dan gaat het uit p.objecten.
// Puur en testbaar: geen DOM, geen opslag.
import { rondesVan } from './pakketten.js';

export const SCOPE_REDENEN = ['Contractwijziging', 'Overgedragen aan andere beheerder', 'Gesloopt of verwijderd', 'Anders'];

/** 'in' (in scope), 'gepland' (gaat op een latere datum uit scope) of 'uit' (buiten scope). */
export const scopeStatus = (o, vandaag) => (!o?.scope?.per ? 'in' : o.scope.per <= vandaag ? 'uit' : 'gepland');

/** Wat er met één ronde gebeurt: 'laten', 'weg' of 'later' (besluit op de ingangsdatum). */
export function rondeBesluit(r, { per, vandaag, gedaan = false }) {
  if (r.status === 'afgerond') return 'laten';
  if (r.eind && r.eind < per) return 'laten';
  if (r.start && r.start >= per) return 'weg';
  if (per > vandaag) return 'later';
  return gedaan ? 'laten' : 'weg';
}

/**
 * Een werkpakket bijwerken voor een object dat uit scope gaat.
 * @param {(rondeId: string) => boolean} gedaanIn  is het object in die ronde al gedaan (volledig, of wacht op beoordeling)?
 * @param {{ blijft?: string[], wacht?: string[] } | null} vast  eerder besluit (bij verwerken op de ingangsdatum):
 *        rondes in blijft blijven, rondes die niet in wacht stonden blijven eruit, alleen wacht wordt opnieuw beoordeeld.
 * @returns {null | { pakket, blijft: string[], wacht: string[], weg: string[], helemaalWeg: boolean }}
 */
export function pasToe(p, objectId, { per, vandaag, gedaanIn = () => false, vast = null }) {
  if (!(p.objecten ?? []).includes(objectId)) return null;
  const blijft = [];
  const wacht = [];
  const weg = [];
  for (const r of rondesVan(p)) {
    if (vast && vast.blijft?.includes(r.id)) { blijft.push(r.id); continue; }
    if (vast && !vast.wacht?.includes(r.id)) { weg.push(r.id); continue; }
    const b = rondeBesluit(r, { per, vandaag, gedaan: gedaanIn(r.id) });
    (b === 'laten' ? blijft : b === 'later' ? wacht : weg).push(r.id);
  }
  const uitScope = { ...(p.uitScope ?? {}) };
  const helemaalWeg = !blijft.length && !wacht.length;
  let pakket;
  if (helemaalWeg) {
    delete uitScope[objectId];
    pakket = {
      ...p,
      objecten: (p.objecten ?? []).filter((id) => id !== objectId),
      ...(p.rondes?.length ? { rondes: p.rondes.map((r) => (r.objectIds?.includes(objectId) ? { ...r, objectIds: r.objectIds.filter((id) => id !== objectId) } : r)) } : {}),
      uitScope,
    };
  } else {
    uitScope[objectId] = { per, blijft, wacht };
    pakket = { ...p, uitScope };
  }
  if (!Object.keys(pakket.uitScope).length) delete pakket.uitScope;
  return { pakket, blijft, wacht, weg, helemaalWeg };
}

/**
 * Weer in scope: het object terug in de werkpakketten waar het uit is gehaald.
 * @param {{ pakketId: string, helemaalWeg: boolean }[]} verwijderd  uit de scopehistorie van het object
 */
export function zetTerug(p, objectId, verwijderd) {
  const was = (verwijderd ?? []).find((x) => x.pakketId === p.id);
  if (p.uitScope?.[objectId]) {
    const uitScope = { ...p.uitScope };
    delete uitScope[objectId];
    const pakket = { ...p, uitScope };
    if (!Object.keys(uitScope).length) delete pakket.uitScope;
    return pakket;
  }
  if (was?.helemaalWeg && !(p.objecten ?? []).includes(objectId)) return { ...p, objecten: [...(p.objecten ?? []), objectId] };
  return null;
}

/** Hoort een object in deze ronde (volgens het uit-scopebesluit van het werkpakket)? */
export const inRonde = (p, rondeId, objectId) => {
  const u = p?.uitScope?.[objectId];
  return !u || u.blijft?.includes(rondeId) || u.wacht?.includes(rondeId);
};

/** Alle scopewijzigingen van de objecten, nieuwste eerst (voor het overzicht en de export). */
export function wijzigingen(objecten) {
  return (objecten ?? []).flatMap((o) => (o.scopeLog ?? []).map((x) => ({ ...x, objectId: o.id, code: o.code, naam: o.naam })))
    .sort((a, b) => String(b.op).localeCompare(String(a.op)));
}
