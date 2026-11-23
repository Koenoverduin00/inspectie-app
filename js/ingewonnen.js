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

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const xy = (c) => `${c[0]} ${c[1]}`;
/** WKT van een GeoJSON-geometrie (WGS84). */
export function wkt(g) {
  if (!g) return '';
  if (g.type === 'Point') return `POINT (${xy(g.coordinates)})`;
  if (g.type === 'MultiPoint') return `MULTIPOINT (${g.coordinates.map((c) => `(${xy(c)})`).join(', ')})`;
  if (g.type === 'LineString') return `LINESTRING (${g.coordinates.map(xy).join(', ')})`;
  if (g.type === 'Polygon') return `POLYGON (${g.coordinates.map((r) => `(${r.map(xy).join(', ')})`).join(', ')})`;
  return '';
}

/** Kolommen voor Excel/CSV: [kop, sleutel]. */
export const KOLOMMEN = [
  ['Formulier', 'formulier'], ['Registratie', 'id'], ['Datum', 'datum'], ['Object', 'object'], ['Door', 'door'],
  ['Vraag', 'veld'], ['Bevinding', 'bevinding'], ['Bevinding omschrijving', 'bevindingNaam'], ['Soort', 'soort'],
  ['Aantal punten', 'punten'], ['Lengte (m)', 'lengte_m'], ['Oppervlakte (m²)', 'oppervlakte_m2'], ['Nauwkeurigheid (m)', 'nauwkeurigheid_m'],
  ['Omschrijving', 'omschrijving'],
];
export const rijen = (features) => features.map((f) => [...KOLOMMEN.map(([, k]) => f.properties?.[k] ?? ''), wkt(f.geometry)]);

const xml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** KML (Google Earth, Google My Maps). */
export function kml(features, naam = 'Ingewonnen gegevens') {
  const c = (l) => l.map((p) => `${p[0]},${p[1]}`).join(' ');
  const geom = (g) => {
    if (g.type === 'Point') return `<Point><coordinates>${c([g.coordinates])}</coordinates></Point>`;
    if (g.type === 'MultiPoint') return `<MultiGeometry>${g.coordinates.map((p) => `<Point><coordinates>${c([p])}</coordinates></Point>`).join('')}</MultiGeometry>`;
    if (g.type === 'LineString') return `<LineString><tessellate>1</tessellate><coordinates>${c(g.coordinates)}</coordinates></LineString>`;
    if (g.type === 'Polygon') return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${c(g.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    return '';
  };
  const pm = features.map((f) => {
    const p = f.properties ?? {};
    const data = KOLOMMEN.filter(([, k]) => p[k] !== undefined && p[k] !== '').map(([kop, k]) => `<Data name="${xml(kop)}"><value>${xml(p[k])}</value></Data>`).join('');
    return `<Placemark><name>${xml(p.veld)}${p.object ? ` – ${xml(p.object)}` : ''}</name><styleUrl>#${p.soort === 'gps' ? 'gps' : 'vorm'}</styleUrl><ExtendedData>${data}</ExtendedData>${geom(f.geometry)}</Placemark>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(naam)}</name>
<Style id="vorm"><LineStyle><color>ff5b18c2</color><width>3</width></LineStyle><PolyStyle><color>555b18c2</color></PolyStyle><IconStyle><color>ff5b18c2</color></IconStyle></Style>
<Style id="gps"><IconStyle><color>ff9a1b6a</color><scale>0.7</scale></IconStyle></Style>
${pm}
</Document></kml>`;
}
