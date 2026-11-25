// Ronde afronden en gebreken doorzetten naar een herstelronde.
// Uitgangspunt: niets gaat automatisch. De bediener kiest zelf welke gebreken worden uitgevoerd
// (alle, geen, de eerste N, een selectie) en waar ze heen gaan.
// Gegevens:
// - ronde.afronding = { op, door, open: [objectIds], openActie, besluiten: { sleutel: besluit }, doorgezet: { sleutel: { pakketId, rondeId } } }
// - herstelronde: ronde.herstel = { bronPakketId, bronRondeId, items: [{ inspectieId, gebrekId, objectId }] }
// Het gebrek zelf blijft in de inspectie staan; de ronde verwijst ernaar.

export const BESLUITEN = {
  '': 'Nog niet besloten',
  onderhoud: 'Binnen onderhoud',
  meerwerk: 'Meerwerk',
  nader: 'Nader onderzoek',
  geen: 'Niet uitvoeren',
};

export const OPEN_ACTIES = {
  laten: { label: 'Open laten staan', uitleg: 'De ronde wordt afgerond; de objecten blijven als open zichtbaar in de historie.' },
  overslaan: { label: 'Markeren als niet uitgevoerd', uitleg: 'De objecten worden overgeslagen met reden "Niet uitgevoerd bij afronding".' },
  meenemen: { label: 'Meenemen naar een nieuwe ronde', uitleg: 'Er komt een nieuwe ronde (gepland) met alleen deze objecten.' },
};

export const NIET_UITGEVOERD = 'Niet uitgevoerd bij afronding';

export const sleutel = (inspectieId, gebrekId) => `${inspectieId}:${gebrekId}`;

const rondeGelijk = (a, b) => (a || 'standaard') === (b || 'standaard');

const URGENTIE_RANG = { direct: 0, '3maanden': 1, '1jaar': 2, '3jaar': 3, '5jaar': 4, monitoren: 5 };
export const urgentieRang = (u) => URGENTIE_RANG[u] ?? 9;

/** Alle gebrek-items van een inspectie die om een maatregel vragen (gewone gebreken, BVC-maatregelen, STOWA). */
export function gebrekItems(insp) {
  return [...(insp?.gebreken ?? []), ...(insp?.bvc?.maatregelen ?? []), ...(insp?.stowa?.waarnemingen ?? [])]
    .filter((g) => g && g.id && (g.maatregel || g.urgentie));
}

/**
 * De gebreken uit één ronde: alleen afgeronde inspecties van dat pakket en die ronde.
 * Volgorde: urgentie, dan objectcode (zodat "de eerste 5" de urgentste zijn).
 */
export function rondeGebreken(inspecties, pakketId, rondeId, { objectCode = () => '' } = {}) {
  const lijst = [];
  for (const i of inspecties) {
    if (i.werkpakketId !== pakketId || !rondeGelijk(i.rondeId, rondeId) || i.status !== 'afgerond') continue;
    for (const g of gebrekItems(i)) lijst.push({ sleutel: sleutel(i.id, g.id), inspectie: i, gebrek: g, objectId: i.objectId });
  }
  return lijst.sort((a, b) => urgentieRang(a.gebrek.urgentie) - urgentieRang(b.gebrek.urgentie)
    || String(objectCode(a.objectId)).localeCompare(String(objectCode(b.objectId)), 'nl', { numeric: true })
    || String(a.gebrek.maatregel ?? '').localeCompare(String(b.gebrek.maatregel ?? '')));
}

/** Naam van de maatregel waarop de standaard (onderhoud/meerwerk) wordt bepaald. */
export const maatregelNaam = (g) => String(g?.bvcMaatregel || g?.maatregel || '').trim();

/** Besluit voor een gebrek: eerst wat in de ronde is gekozen, anders de projectstandaard voor die maatregel. */
export function besluitVan(item, besluiten = {}, standaard = {}) {
  if (Object.hasOwn(besluiten, item.sleutel)) return besluiten[item.sleutel] ?? '';
  return standaard[maatregelNaam(item.gebrek)] ?? '';
}

/**
 * Selectie maken: 'alle', 'geen', 'eerste' (n stuks), 'urgentie' (alleen die urgentie), 'besluit' (alleen dat besluit),
 * 'nietDoorgezet'. Gebreken die al zijn uitgevoerd tellen nooit mee.
 */
export function selecteer(items, wijze, { n = 5, urgentie = '', besluit = '', besluiten = {}, standaard = {}, doorgezet = {} } = {}) {
  const kandidaten = items.filter((x) => x.gebrek.maatregelStatus !== 'uitgevoerd');
  let gekozen;
  if (wijze === 'geen') gekozen = [];
  else if (wijze === 'eerste') gekozen = kandidaten.slice(0, Math.max(0, Math.floor(Number(n) || 0)));
  else if (wijze === 'urgentie') gekozen = kandidaten.filter((x) => (x.gebrek.urgentie ?? '') === urgentie);
  else if (wijze === 'besluit') gekozen = kandidaten.filter((x) => besluitVan(x, besluiten, standaard) === besluit);
  else if (wijze === 'nietDoorgezet') gekozen = kandidaten.filter((x) => !doorgezet[x.sleutel]);
  else gekozen = kandidaten;
  return new Set(gekozen.map((x) => x.sleutel));
}

/** Controle vóór het afronden van een ronde. */
export function afrondControle({ voortgang, inspecties = [], werkzaamheden = [], pakketId, rondeId, beoordeling = () => '' }) {
  const inRonde = (r) => r.werkpakketId === pakketId && rondeGelijk(r.rondeId, rondeId);
  return {
    open: [...(voortgang?.open ?? [])],
    concepten: inspecties.filter((i) => inRonde(i) && i.status !== 'afgerond'),
    teBeoordelen: [...inspecties, ...werkzaamheden].filter((r) => inRonde(r) && beoordeling(r) === 'ingediend'),
  };
}

const volgendNummer = (rondes) => Math.max(0, ...rondes.map((r) => Number(r.nummer) || 0)) + 1;

/** Nieuwe ronde met alleen de open objecten van de afgeronde ronde. */
export function restantRonde(pakket, ronde, objectIds, { id, rondes = pakket.rondes ?? [] } = {}) {
  return {
    id, nummer: volgendNummer(rondes), naam: `Restant R${ronde.nummer ?? 1}`, soort: ronde.soort ?? pakket.soort ?? 'werk',
    werksoort: ronde.werksoort ?? '', inspectiesoort: ronde.inspectiesoort ?? '', start: '', eind: '', status: 'gepland',
    objectIds: [...new Set(objectIds)], restantVan: ronde.id,
  };
}

/** Nieuwe herstelronde met de gekozen gebreken. */
export function herstelRonde({ id, bronPakket, bronRonde, items, rondes = [], naam = '', werksoort = 'Herstel gebreken' }) {
  return {
    id, nummer: volgendNummer(rondes), naam: naam || `Gebreken uit R${bronRonde.nummer ?? 1}`,
    soort: 'werk', werksoort, inspectiesoort: '', start: '', eind: '', status: 'gepland',
    objectIds: [...new Set(items.map((x) => x.objectId))],
    herstel: { bronPakketId: bronPakket.id, bronRondeId: bronRonde.id, items: items.map((x) => ({ inspectieId: x.inspectie?.id ?? x.inspectieId, gebrekId: x.gebrek?.id ?? x.gebrekId, objectId: x.objectId })) },
  };
}

/** Gebreken toevoegen aan een bestaande herstelronde (dubbele worden overgeslagen). */
export function voegToe(ronde, items) {
  const bestaand = ronde.herstel?.items ?? [];
  const al = new Set(bestaand.map((x) => sleutel(x.inspectieId, x.gebrekId)));
  const nieuw = items.map((x) => ({ inspectieId: x.inspectie?.id ?? x.inspectieId, gebrekId: x.gebrek?.id ?? x.gebrekId, objectId: x.objectId }))
    .filter((x) => !al.has(sleutel(x.inspectieId, x.gebrekId)));
  const alleItems = [...bestaand, ...nieuw];
  const objectIds = ronde.objectIds?.length || ronde.herstel ? [...new Set([...(ronde.objectIds ?? []), ...nieuw.map((x) => x.objectId)])] : ronde.objectIds;
  return { ...ronde, objectIds, herstel: { ...(ronde.herstel ?? {}), items: alleItems } };
}

/** Op een andere plek gezet: vastleggen in de afronding van de bronronde. */
export function markeerDoorgezet(afronding, sleutels, doel) {
  const doorgezet = { ...(afronding?.doorgezet ?? {}) };
  for (const s of sleutels) doorgezet[s] = { ...doel };
  return { ...(afronding ?? {}), doorgezet };
}

/** Herstelitems met hun gebrek en status (uitgevoerd of open). */
export function herstelItems(ronde, inspecties) {
  const perId = new Map(inspecties.map((i) => [i.id, i]));
  return (ronde?.herstel?.items ?? []).map((x) => {
    const insp = perId.get(x.inspectieId);
    const gebrek = insp ? [...(insp.gebreken ?? []), ...(insp.bvc?.maatregelen ?? []), ...(insp.stowa?.waarnemingen ?? [])].find((g) => g.id === x.gebrekId) : null;
    return { ...x, sleutel: sleutel(x.inspectieId, x.gebrekId), inspectie: insp ?? null, gebrek: gebrek ?? null, uitgevoerd: gebrek?.maatregelStatus === 'uitgevoerd' };
  });
}

/** Moet de locatie van een maatregel worden vastgelegd? instelling: 'nooit' | 'vlaklijn' (standaard) | 'altijd'. */
export function locatieVerplicht(instelling, geometrieType) {
  if (instelling === 'nooit') return false;
  if (instelling === 'altijd') return true;
  return /Polygon|LineString/.test(String(geometrieType ?? ''));
}

// --- Locatie van een gebrek ---------------------------------------------------------
// Bij een puntobject zit het gebrek op het punt: de locatie van het object is leidend.
// Alleen als de inspecteur de locatie bewust aanpast (locatieAangepast) telt de eigen locatie van het gebrek.
// Bij vlakken en lijnen telt de eigen locatie van het gebrek (GPS of op de kaart).

const getal = (v) => (v === '' || v == null ? NaN : Number(v));
const geldig = (lat, lng) => Number.isFinite(getal(lat)) && Number.isFinite(getal(lng));

/** Coördinaten van een puntobject ({ lat, lng }), of null als het object geen punt is. */
export function objectPunt(o) {
  const t = o?.geometrie?.type;
  if (t && t !== 'Point') return null;
  if (t === 'Point') {
    const [lng, lat] = o.geometrie.coordinates ?? [];
    return geldig(lat, lng) ? { lat: Number(lat), lng: Number(lng) } : null;
  }
  return geldig(o?.lat, o?.lng) ? { lat: Number(o.lat), lng: Number(o.lng) } : null;
}
export const isPuntObject = (o) => Boolean(objectPunt(o));

/** Bewust aangepast door de inspecteur. Oude registraties: een op de kaart gezet punt telt als bewust gekozen, automatische GPS niet. */
export const locatieAangepast = (g) => g?.locatieAangepast === true || (g?.locatieAangepast === undefined && g?.locatieBron === 'kaart');

/** De locatie die geldt voor een gebrek: { lat, lng, bron } of null. */
export function gebrekLocatie(g, o) {
  const punt = objectPunt(o);
  const eigen = geldig(g?.lat, g?.lng) ? { lat: Number(g.lat), lng: Number(g.lng), bron: g.locatieBron || 'gps', ...(g.nauwkeurigheid ? { nauwkeurigheid: g.nauwkeurigheid } : {}) } : null;
  if (punt && !(locatieAangepast(g) && eigen)) return { ...punt, bron: 'object' };
  return eigen;
}

/** Het gebrek met de geldende locatie ingevuld (voor opslag en exports); laat de rest ongemoeid. */
export function metGeldendeLocatie(g, o) {
  const loc = gebrekLocatie(g, o);
  if (!loc || loc.bron !== 'object') return g;
  const { nauwkeurigheid, ...rest } = g;
  return { ...rest, lat: loc.lat, lng: loc.lng, locatieBron: 'object', locatieAangepast: false };
}
