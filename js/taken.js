// Taken: wat moet er gebeuren, en wat is op deze locatie het meest logisch?
// Bronnen: zelf geplande taken, de inspectieplanning en openstaande maatregelen.
import { afstandTot } from './gis.js';

export const PRIORITEITEN = [
  { id: 'hoog', label: 'Hoog', rang: 2 },
  { id: 'normaal', label: 'Normaal', rang: 3 },
  { id: 'laag', label: 'Laag', rang: 4 },
];

const MAATREGEL_RANG = { direct: 1, '1jaar': 2, '3jaar': 3, '5jaar': 4, monitoren: 5 };
const PLANNING_RANG = { verlopen: 2, nooit: 3, binnenkort: 3 };

// Eén urgentiestap "weegt" evenveel als zoveel meter extra lopen of rijden.
export const METER_PER_RANG = 750;

/** Geometrie van een object: GIS-geometrie of anders het punt uit de coördinaten. */
export function objectGeometrie(o) {
  if (o?.geometrie) return o.geometrie;
  const lat = parseFloat(o?.lat);
  const lng = parseFloat(o?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null;
}

/**
 * Stelt alle openstaande taken samen.
 * @param {object} p
 * @param {object[]} p.objecten
 * @param {object[]} p.inspecties
 * @param {object[]} p.taken        zelf geplande taken
 * @param {Map} p.planning          objectId → { planning, volgende }
 * @param {string} p.vandaag        YYYY-MM-DD
 * @param {string} [p.ik]           e-mailadres van de ingelogde gebruiker (filtert toegewezen taken)
 */
export function takenLijst({ objecten, inspecties, taken, planning, vandaag, ik = '' }) {
  const objectMap = new Map(objecten.map((o) => [o.id, o]));
  const lijst = [];
  const handmatigeInspectie = new Set();
  const handmatigeMaatregel = new Set();

  for (const t of taken) {
    if (t.status === 'gereed') continue;
    const object = objectMap.get(t.objectId);
    if (!object) continue;
    if (ik && t.toegewezenAan && t.toegewezenAan.toLowerCase() !== ik.toLowerCase()) continue;
    let rang = PRIORITEITEN.find((p) => p.id === t.prioriteit)?.rang ?? 3;
    const telaat = t.deadline && t.deadline < vandaag;
    if (telaat) rang = Math.max(1, rang - 1);
    if (t.soort === 'inspectie') handmatigeInspectie.add(t.objectId);
    if (t.maatregel) handmatigeMaatregel.add(t.maatregel);
    lijst.push({
      id: `taak:${t.id}`, bron: 'gepland', soort: t.soort, titel: t.titel || (t.soort === 'werk' ? 'Werkzaamheid' : 'Inspectie'),
      omschrijving: t.omschrijving ?? '', object, rang, deadline: t.deadline ?? '', telaat, taakId: t.id,
      maatregel: t.maatregel ?? '', toegewezenAan: t.toegewezenAan ?? '',
    });
  }

  for (const insp of inspecties) {
    if (insp.status !== 'afgerond') continue;
    const object = objectMap.get(insp.objectId);
    if (!object) continue;
    for (const g of insp.gebreken ?? []) {
      if (g.maatregelStatus === 'uitgevoerd' || (!g.maatregel && !g.urgentie)) continue;
      const sleutel = `${insp.id}:${g.id}`;
      if (handmatigeMaatregel.has(sleutel)) continue;
      lijst.push({
        id: `maatregel:${sleutel}`, bron: 'maatregel', soort: 'werk',
        titel: g.maatregel || `${g.bouwdeel} – ${g.gebrek}`, omschrijving: `${g.bouwdeel || ''} – ${g.gebrek || ''}`.trim(),
        object, rang: MAATREGEL_RANG[g.urgentie] ?? 4, deadline: '', maatregel: sleutel,
      });
    }
  }

  for (const object of objecten) {
    if (handmatigeInspectie.has(object.id)) continue;
    const s = planning.get(object.id);
    const rang = PLANNING_RANG[s?.planning];
    if (!rang) continue;
    const titel = s.planning === 'verlopen' ? 'Inspectie verlopen' : s.planning === 'nooit' ? 'Eerste inspectie' : 'Inspectie binnenkort';
    lijst.push({
      id: `planning:${object.id}`, bron: 'planning', soort: 'inspectie', titel, omschrijving: '', object, rang,
      deadline: s.volgende ?? '', telaat: s.planning === 'verlopen',
    });
  }
  return lijst;
}

/**
 * Sorteert taken op logica: urgentie gecombineerd met afstand tot de huidige locatie.
 * Een taak in het vlak waar je staat heeft afstand 0.
 * @param {object[]} lijst
 * @param {[number, number] | null} positie  [lng, lat]
 */
export function sorteerTaken(lijst, positie = null) {
  const metAfstand = lijst.map((t) => ({
    ...t,
    afstand: positie ? afstandTot(positie, objectGeometrie(t.object)) : null,
  }));
  return metAfstand.sort((a, b) => {
    if (positie) {
      const sa = (a.rang - 1) * METER_PER_RANG + (a.afstand ?? 1e7);
      const sb = (b.rang - 1) * METER_PER_RANG + (b.afstand ?? 1e7);
      if (sa !== sb) return sa - sb;
    }
    return a.rang - b.rang || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'));
  });
}
