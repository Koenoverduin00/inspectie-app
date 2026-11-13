// Werkpakketten: een klus (werkzaamheid of schouw/inspectie) op een vaste set objecten.
// De voortgang wordt afgeleid uit registraties die vanuit het pakket zijn vastgelegd
// (werkpakketId) en uit overgeslagen objecten (aparte records, zodat meerdere
// uitvoerders tegelijk kunnen werken zonder elkaars wijzigingen te overschrijven).

export const PAKKETSTATUS = { gepland: 'Gepland', actief: 'Actief', afgerond: 'Afgerond', paraat: 'Op afroep' };

/** Planningswijze: vooraf gepland in rondes, of op afroep (correctief, na afstemming of na omstandigheden). */
export const PLANNINGSWIJZEN = {
  gepland: { label: 'Vooraf gepland', uitleg: 'Vaste rondes met data, vooraf in te plannen' },
  afroep: { label: 'Op afroep', uitleg: 'Correctief: je roept werk af wanneer het nodig is' },
};
export const isAfroep = (p) => p?.planning === 'afroep';

export const AFROEP_REDENEN = [
  'Na afstemming met opdrachtgever',
  'Melding (bewoner, gebruiker, derde)',
  'Na storm of extreem weer',
  'Na hoogwater of droogte',
  'Schade of vandalisme',
  'Calamiteit',
  'Uit eigen inspectie / constatering',
  'Anders',
];

export const OVERSLAAN_REDENEN = [
  'Niet bereikbaar',
  'Geparkeerde auto / obstakel',
  'Weersomstandigheden',
  'Al uitgevoerd door derden',
  'Niet nodig',
  'Onveilige situatie',
  'Anders',
];

export const STANDAARD_RONDE = 'standaard';

/** Id van een overgeslagen object; per ronde uniek (oude pakketten zonder rondes houden hun id). */
export const overslaanId = (pakketId, objectId, rondeId = STANDAARD_RONDE) => (
  !rondeId || rondeId === STANDAARD_RONDE ? `${pakketId}:${objectId}` : `${pakketId}:${rondeId}:${objectId}`);

/**
 * Rondes (taken) van een werkpakket. Een pakket zonder rondes (oud formaat) heeft één impliciete ronde.
 * Een ronde zonder objectIds geldt voor alle objecten van het pakket.
 */
export function rondesVan(p) {
  // Een pakket op afroep heeft alleen de afroepen die zijn aangemaakt (eventueel geen).
  if (isAfroep(p)) return [...(p.rondes ?? [])].sort((a, b) => (Number(a.nummer) || 0) - (Number(b.nummer) || 0));
  if (p?.rondes?.length) return [...p.rondes].sort((a, b) => (Number(a.nummer) || 0) - (Number(b.nummer) || 0));
  return [{
    id: STANDAARD_RONDE, nummer: 1, naam: p?.naam ?? 'Ronde 1', soort: p?.soort ?? 'werk', werksoort: p?.werksoort ?? '',
    inspectiesoort: p?.inspectiesoort ?? '', start: p?.start ?? '', eind: p?.eind ?? '', status: p?.status ?? 'gepland', objectIds: null,
  }];
}

export const rondeCode = (p, r) => `${p.code || 'WP'}-R${r.nummer ?? 1}`;

/** Een ronde als 'werkpakket-weergave': de velden van de ronde, de context (id, uitvoerders) van het pakket. */
export function rondeView(p, r) {
  const binnen = new Set(p.objecten ?? []);
  const objecten = r.objectIds?.length ? r.objectIds.filter((id) => binnen.has(id)) : [...(p.objecten ?? [])];
  const enkel = !p.rondes?.length;
  return {
    ...p, ...r, id: p.id, rondeId: r.id, rondeNaam: r.naam, pakketNaam: p.naam,
    naam: enkel ? p.naam : `${p.naam} – ${r.naam}`, objecten, deelselectie: Boolean(r.objectIds?.length),
  };
}

export function rondeVanId(p, rondeId) {
  const rondes = rondesVan(p);
  return rondes.find((r) => r.id === rondeId) ?? rondes.find((r) => r.status === 'actief') ?? rondes[0];
}

/** Status van het pakket volgt uit de rondes. */
export function pakketStatus(p) {
  const st = rondesVan(p).map((r) => r.status);
  if (isAfroep(p)) return p.gesloten ? 'afgerond' : st.includes('actief') ? 'actief' : 'paraat';
  if (st.includes('actief')) return 'actief';
  if (st.length && st.every((x) => x === 'afgerond')) return 'afgerond';
  return 'gepland';
}

const zelfdeRonde = (a, b) => (a || STANDAARD_RONDE) === (b || STANDAARD_RONDE);

/**
 * Voortgang van een pakket.
 * @returns {{ totaal: number, gedaan: Map<string, object>, overgeslagen: Map<string, object>, open: string[], percentage: number }}
 */
export function voortgang(pakket, { werkzaamheden = [], inspecties = [], overgeslagen = [], objectIds = null } = {}) {
  const bestaand = objectIds ? new Set(objectIds) : null;
  const ids = (pakket.objecten ?? []).filter((id) => !bestaand || bestaand.has(id));
  const inPakket = new Set(ids);
  const gedaan = new Map();
  const registraties = pakket.soort === 'inspectie'
    ? inspecties.filter((i) => i.status === 'afgerond')
    : werkzaamheden;
  for (const r of registraties) {
    if (r.werkpakketId !== pakket.id || !zelfdeRonde(r.rondeId, pakket.rondeId) || !inPakket.has(r.objectId)) continue;
    const eerder = gedaan.get(r.objectId);
    if (!eerder || String(r.datum) > String(eerder.datum)) gedaan.set(r.objectId, r);
  }
  const over = new Map();
  for (const o of overgeslagen) {
    if (o.pakketId === pakket.id && zelfdeRonde(o.rondeId, pakket.rondeId) && inPakket.has(o.objectId) && !gedaan.has(o.objectId)) over.set(o.objectId, o);
  }
  const open = ids.filter((id) => !gedaan.has(id) && !over.has(id));
  const totaal = ids.length;
  return {
    totaal, gedaan, overgeslagen: over, open,
    percentage: totaal ? Math.round(((gedaan.size + over.size) / totaal) * 100) : 0,
  };
}

/** Totaal over alle rondes (voor de voortgangsbalk van een pakket). */
export function totaalVoortgang(lijst) {
  const som = (f) => lijst.reduce((t, v) => t + f(v), 0);
  const totaal = som((v) => v.totaal);
  const gedaan = som((v) => v.gedaan.size);
  const over = som((v) => v.overgeslagen.size);
  return { totaal, gedaan: { size: gedaan }, overgeslagen: { size: over }, open: lijst.flatMap((v) => v.open), percentage: totaal ? Math.round(((gedaan + over) / totaal) * 100) : 0 };
}

/** Is dit pakket voor deze gebruiker? (leeg = iedereen) */
export function voorMij(pakket, email) {
  const lijst = pakket.toegewezen ?? [];
  return !lijst.length || !email || lijst.includes(String(email).toLowerCase());
}

/** Filtert objecten voor het samenstellen van een pakket. */
export function filterObjecten(objecten, f = {}, { status } = {}) {
  const zoek = String(f.zoek ?? '').trim().toLowerCase();
  return objecten.filter((o) => {
    if (f.laag === '-' && o.laagId) return false;
    if (f.laag && f.laag !== '-' && o.laagId !== f.laag) return false;
    if (f.type && o.type !== f.type) return false;
    if (f.kenmerk && f.waarde !== undefined && f.waarde !== '' && String(o.kenmerken?.[f.kenmerk] ?? '') !== f.waarde) return false;
    if (f.conditie) {
      const c = status?.get(o.id)?.conditie;
      if (f.conditie === 'geen' ? c : String(c) !== f.conditie) return false;
    }
    if (f.planning && status?.get(o.id)?.planning !== f.planning) return false;
    if (zoek && !`${o.code} ${o.naam} ${o.locatie ?? ''}`.toLowerCase().includes(zoek)) return false;
    return true;
  });
}
