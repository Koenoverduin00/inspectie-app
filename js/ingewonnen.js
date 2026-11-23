// Wat er via de formulieren is ingewonnen, als kaartlaag: punten, lijnen en vlakken (veldtype "Inwinning coördinaten"),
// locatievragen (punt op de kaart) en de GPS-locaties van bevindingen. Puur: geen DOM, geen database.
import * as GI from './geominwinning.js';

const FORMULIER = { werkzaamheden: 'werk', inspecties: 'inspectie', taken: 'taak' };
const SOORT_TEKST = { werkzaamheden: 'Werkzaamheid', inspecties: 'Inspectie', taken: 'Taak' };

const getal = (x) => (x === '' || x == null ? NaN : Number(x));
const isPositie = (x) => Number.isFinite(getal(x?.lat)) && Number.isFinite(getal(x?.lng)) && Math.abs(getal(x.lat)) <= 90 && Math.abs(getal(x.lng)) <= 180;
const isGeometrie = (v) => Array.isArray(v?.punten) && v.punten.some(isPositie);

/** Antwoorden van één record (of één bevinding): [{ label, waarde }] met alleen geometrie en locaties. */
function antwoorden(extra, labels, defs) {
  const bekend = new Map((defs ?? []).map((d) => [d.id, d]));
  return Object.entries(extra ?? {}).flatMap(([id, v]) => {
    const label = bekend.get(id)?.label ?? labels?.[id] ?? 'Veld';
    if (isGeometrie(v)) return [{ label, soort: 'geometrie', v: GI.maak(GI.SOORTEN[v.soort] ? v.soort : 'punt', v.punten) }];
    if (isPositie(v)) return [{ label, soort: 'locatie', v }];
    return [];
  });
}

const punt = (x) => ({ type: 'Point', coordinates: [getal(x.lng), getal(x.lat)] });

/**
 * Alle ingewonnen vormen en GPS-locaties van bevindingen.
 * @param {{werkzaamheden?:object[], inspecties?:object[], taken?:object[]}} records
 * @param {{velden?:object[], objectVan?:(id:string)=>object|undefined}} opties
 * @returns {{vormen: object[], gps: object[]}} GeoJSON-features (WGS84)
 */
export function verzamel(records, { velden = [], objectVan = () => undefined } = {}) {
  const vormen = [];
  const gps = [];
  for (const [store, lijst] of Object.entries(records ?? {})) {
    if (!FORMULIER[store]) continue;
    const defs = velden.filter((d) => d.formulier === FORMULIER[store]);
    for (const r of lijst ?? []) {
      if (!r || r.verwijderd) continue;
      const o = r.objectId ? objectVan(r.objectId) : null;
      const basis = {
        store, id: r.id, formulier: SOORT_TEKST[store], datum: String(r.datum ?? r.gewijzigd ?? '').slice(0, 10),
        object: o ? [o.code, o.naam].filter(Boolean).join(' · ') : '', door: r.uitvoerder || r.inspecteur || r.beoordeling?.ingediendDoor || '',
      };
      const voegToe = (a, extraProps = {}) => {
        const props = { ...basis, ...extraProps, veld: a.label };
        if (a.soort === 'geometrie') {
          const f = GI.feature(a.v, { ...props, omschrijving: GI.tekst(a.v) });
          if (f) vormen.push(f);
        } else {
          vormen.push({ type: 'Feature', geometry: punt(a.v), properties: { ...props, soort: 'locatie',
            omschrijving: `${getal(a.v.lat).toFixed(6)}, ${getal(a.v.lng).toFixed(6)}${a.v.nauwkeurigheid ? ` (GPS ± ${a.v.nauwkeurigheid} m)` : ''}` } });
        }
      };
      for (const a of antwoorden(r.extra, r.extraLabels, defs)) voegToe(a);
      // Per bevinding: de vragen per bevinding en de GPS-locatie van de bevinding zelf.
      const bevindingen = [
        ...(r.gebreken ?? []).map((g) => ({ g, naam: [g.bouwdeel, g.checkpunt ? 'Niet in orde' : g.gebrek].filter(Boolean).join(' – ') })),
        ...(r.bvc?.gebreken ?? []).map((g) => ({ g, naam: [g.omschrijving, g.plaats].filter(Boolean).join(' – ') })),
        ...(r.stowa?.waarnemingen ?? []).map((g) => ({ g, naam: [g.element ?? g.elementgroep, g.schadebeeld].filter(Boolean).join(' – ') })),
      ];
      bevindingen.forEach(({ g }, n) => {
        if (!g) return;
        const bev = { bevinding: n + 1, bevindingNaam: bevindingen[n].naam || `Bevinding ${n + 1}` };
        for (const a of antwoorden(g.extra, r.bevindingLabels, defs)) voegToe(a, bev);
        if (isPositie(g)) {
          gps.push({ type: 'Feature', geometry: punt(g), properties: { ...basis, ...bev, soort: 'gps', veld: 'Locatie bevinding',
            omschrijving: `${getal(g.lat).toFixed(6)}, ${getal(g.lng).toFixed(6)}${g.locatieBron === 'kaart' ? ' (op kaart gekozen)' : g.nauwkeurigheid ? ` (GPS ± ${g.nauwkeurigheid} m)` : ''}` } });
        }
      });
    }
  }
  return { vormen, gps };
}
