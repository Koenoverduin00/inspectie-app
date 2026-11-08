// Werkpakketten: een klus (werkzaamheid of schouw/inspectie) op een vaste set objecten.
// De voortgang wordt afgeleid uit registraties die vanuit het pakket zijn vastgelegd
// (werkpakketId) en uit overgeslagen objecten (aparte records, zodat meerdere
// uitvoerders tegelijk kunnen werken zonder elkaars wijzigingen te overschrijven).

export const PAKKETSTATUS = { gepland: 'Gepland', actief: 'Actief', afgerond: 'Afgerond' };

export const OVERSLAAN_REDENEN = [
  'Niet bereikbaar',
  'Geparkeerde auto / obstakel',
  'Weersomstandigheden',
  'Al uitgevoerd door derden',
  'Niet nodig',
  'Onveilige situatie',
  'Anders',
];

export const overslaanId = (pakketId, objectId) => `${pakketId}:${objectId}`;

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
    if (r.werkpakketId !== pakket.id || !inPakket.has(r.objectId)) continue;
    const eerder = gedaan.get(r.objectId);
    if (!eerder || String(r.datum) > String(eerder.datum)) gedaan.set(r.objectId, r);
  }
  const over = new Map();
  for (const o of overgeslagen) {
    if (o.pakketId === pakket.id && inPakket.has(o.objectId) && !gedaan.has(o.objectId)) over.set(o.objectId, o);
  }
  const open = ids.filter((id) => !gedaan.has(id) && !over.has(id));
  const totaal = ids.length;
  return {
    totaal, gedaan, overgeslagen: over, open,
    percentage: totaal ? Math.round(((gedaan.size + over.size) / totaal) * 100) : 0,
  };
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
