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
const norm = (x) => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export function rondeView(p, r) {
  const binnen = new Set(p.objecten ?? []);
  const objecten = r.objectIds?.length ? r.objectIds.filter((id) => binnen.has(id)) : [...(p.objecten ?? [])];
  const enkel = !p.rondes?.length;
  return {
    ...p, ...r, id: p.id, rondeId: r.id, rondeNaam: r.naam, pakketNaam: p.naam,
    // Heet de ronde hetzelfde als het pakket, dan de naam maar één keer.
    naam: enkel || !String(r.naam ?? '').trim() || norm(r.naam) === norm(p.naam) ? p.naam : `${p.naam} – ${r.naam}`,
    objecten, deelselectie: Boolean(r.objectIds?.length),
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
 * Wanneer telt een registratie mee voor de voortgang (per project in te stellen).
 * - afgekeurd: 'teDoen' (standaard: telt niet, object weer te doen) of 'telt' (telt gewoon als gedaan)
 * - afgekeurdKleur: true (standaard: eigen kleur 'afgekeurd' op de kaart) of false (gewoon 'te doen')
 * - ingediend: 'telt' (standaard: telt meteen) of 'wacht' (telt pas na goedkeuring; eigen kleur 'wacht op beoordeling')
 */
export const VOORTGANG_STANDAARD = { afgekeurd: 'teDoen', afgekeurdKleur: true, ingediend: 'telt' };
export const voortgangRegel = (project) => {
  const v = project?.voortgangRegel ?? {};
  return {
    afgekeurd: v.afgekeurd === 'telt' ? 'telt' : 'teDoen',
    afgekeurdKleur: v.afgekeurdKleur !== false,
    ingediend: v.ingediend === 'wacht' ? 'wacht' : 'telt',
  };
};
/** Beoordeling van een registratie; zonder beoordeling = goedgekeurd (oude registraties). */
const beoordelingVan = (r) => r?.beoordeling?.status ?? 'goedgekeurd';

/**
 * Voortgang van een pakket.
 * @returns {{ totaal: number, gedaan: Map<string, object>, overgeslagen: Map<string, object>, open: string[], percentage: number }}
 */
export function voortgang(pakket, { werkzaamheden = [], inspecties = [], overgeslagen = [], objectIds = null, regel = VOORTGANG_STANDAARD } = {}) {
  const rg = { ...VOORTGANG_STANDAARD, ...regel };
  // Telt deze registratie mee? Zo niet: waarom (afgekeurd of wacht op beoordeling).
  const beoordeeld = (r) => {
    const b = beoordelingVan(r);
    if (b === 'afgekeurd' && rg.afgekeurd !== 'telt') return 'afgekeurd';
    if (b === 'ingediend' && rg.ingediend === 'wacht') return 'ingediend';
    return '';
  };
  const afgekeurd = new Map();
  const wacht = new Map();
  const bestaand = objectIds ? new Set(objectIds) : null;
  const ids = (pakket.objecten ?? []).filter((id) => !bestaand || bestaand.has(id));
  const inPakket = new Set(ids);
  const gedaan = new Map();
  // Werk in delen (bijv. één ploeg vanaf het land, een andere vanaf het water): een werkzaamheid met gereed === false
  // is een gedeeltelijke afmelding. Het object is pas gedaan na een registratie die "volledig klaar" zegt.
  const deels = new Map();
  // Bestekposten (bijv. 300 m² zetsteen herstel): uitgevoerde hoeveelheden per post, ook uit gedeeltelijke afmeldingen.
  const posten = postenVan(pakket);
  const opgeteld = new Map(posten.map((x) => [x.id, 0]));
  const registraties = pakket.soort === 'inspectie'
    ? inspecties.filter((i) => i.status === 'afgerond')
    : werkzaamheden;
  for (const r of registraties) {
    if (r.werkpakketId !== pakket.id || !zelfdeRonde(r.rondeId, pakket.rondeId) || !inPakket.has(r.objectId)) continue;
    const niet = beoordeeld(r);
    if (niet) {
      const m = niet === 'afgekeurd' ? afgekeurd : wacht;
      const eerder = m.get(r.objectId);
      if (!eerder || String(r.datum) > String(eerder.datum)) m.set(r.objectId, r);
      continue;
    }
    for (const [pid, n] of Object.entries(r.hoeveelheden ?? {})) if (opgeteld.has(pid) && Number(n) > 0) opgeteld.set(pid, opgeteld.get(pid) + Number(n));
    if (pakket.soort !== 'inspectie' && isDeels(r)) {
      deels.set(r.objectId, [...(deels.get(r.objectId) ?? []), r].sort((a, b) => String(a.datum).localeCompare(String(b.datum))));
      continue;
    }
    const eerder = gedaan.get(r.objectId);
    if (!eerder || String(r.datum) > String(eerder.datum)) gedaan.set(r.objectId, r);
  }
  for (const id of gedaan.keys()) { deels.delete(id); afgekeurd.delete(id); wacht.delete(id); }
  // Een nieuwere registratie wacht op beoordeling: dan is het object niet (meer) afgekeurd maar opnieuw ingediend.
  for (const [id, r] of wacht) { const a = afgekeurd.get(id); if (a && String(r.datum) >= String(a.datum)) afgekeurd.delete(id); }
  for (const [id, r] of afgekeurd) { const w = wacht.get(id); if (w && String(r.datum) > String(w.datum)) wacht.delete(id); }
  const over = new Map();
  for (const o of overgeslagen) {
    if (o.pakketId === pakket.id && zelfdeRonde(o.rondeId, pakket.rondeId) && inPakket.has(o.objectId) && !gedaan.has(o.objectId)) over.set(o.objectId, o);
  }
  for (const id of over.keys()) deels.delete(id);
  const hoeveelheden = posten.map((post) => {
    const klaar = Math.round(opgeteld.get(post.id) * 100) / 100;
    return { post, gedaan: klaar, rest: Math.max(0, Math.round((post.hoeveelheid - klaar) * 100) / 100), pct: post.hoeveelheid ? Math.min(100, Math.round((klaar / post.hoeveelheid) * 100)) : 0 };
  });
  // Voortgang op hoeveelheid: niet elk gekoppeld object hoeft aan de beurt; klaar zodra de hoeveelheden zijn bereikt.
  const opHoeveelheid = pakket.soort !== 'inspectie' && pakket.voortgangOp === 'hoeveelheid' && hoeveelheden.length > 0;
  const bereikt = opHoeveelheid && hoeveelheden.every((h) => h.gedaan >= h.post.hoeveelheid);
  for (const id of over.keys()) { afgekeurd.delete(id); wacht.delete(id); }
  // Wacht op beoordeling: niet gedaan, maar ook niet meer te doen voor de uitvoerder.
  const rest = ids.filter((id) => !gedaan.has(id) && !over.has(id) && !wacht.has(id));
  const open = bereikt ? rest.filter((id) => deels.has(id)) : rest;
  const nietNodig = new Set(bereikt ? rest.filter((id) => !deels.has(id)) : []);
  const totaal = ids.length;
  const percentage = opHoeveelheid
    ? Math.round(hoeveelheden.reduce((t, h) => t + h.pct, 0) / hoeveelheden.length)
    : totaal ? Math.round(((gedaan.size + over.size) / totaal) * 100) : 0;
  return { totaal, gedaan, overgeslagen: over, open, deels, nietNodig, afgekeurd, wacht, afgekeurdKleur: rg.afgekeurdKleur, hoeveelheden, modus: opHoeveelheid ? 'hoeveelheid' : 'objecten', percentage };
}

export const EENHEDEN = [['m2', 'm²'], ['m1', 'm¹ (strekkende meter)'], ['m3', 'm³'], ['ton', 'ton'], ['kg', 'kg'], ['st', 'stuks'], ['uur', 'uur']];
export const EENHEID_KORT = { m2: 'm²', m1: 'm¹', m3: 'm³', ton: 'ton', kg: 'kg', st: 'st.', uur: 'uur' };
/** Bestekposten van een werkpakket: omschrijving, voorgeschreven hoeveelheid en eenheid (per ronde). */
export function postenVan(p) {
  return (p?.posten ?? []).filter((x) => x && x.id && Number(x.hoeveelheid) > 0)
    .map((x) => ({ id: String(x.id), omschrijving: String(x.omschrijving ?? '').trim() || 'Hoeveelheid', hoeveelheid: Number(x.hoeveelheid), eenheid: EENHEID_KORT[x.eenheid] ? x.eenheid : 'm2' }));
}
/** "180 / 300 m²" */
export const hoeveelheidTekst = (h) => `${String(h.gedaan).replace('.', ',')} / ${String(h.post.hoeveelheid).replace('.', ',')} ${EENHEID_KORT[h.post.eenheid]}`;

/** Gedeeltelijke afmelding van werk: het object is nog niet volledig klaar. */
export const isDeels = (r) => r?.gereed === false;

/** Status van een object in een ronde: gedaan, overgeslagen, deels (gedeeltelijk gedaan, nog te doen) of open. */
export function objectStatus(vg, objectId) {
  if (vg?.gedaan?.has(objectId)) return 'gedaan';
  if (vg?.overgeslagen?.has(objectId)) return 'overgeslagen';
  if (vg?.wacht?.has(objectId)) return 'ingediend';
  if (vg?.afgekeurd?.has(objectId)) return vg.afgekeurdKleur === false ? 'open' : 'afgekeurd';
  if (vg?.deels?.has(objectId)) return 'deels';
  if (vg?.nietNodig?.has(objectId)) return 'nietnodig';
  return 'open';
}
/** Nog werk te doen: open, gedeeltelijk of afgekeurd (opnieuw doen). */
export const teDoen = (st) => st === 'open' || st === 'deels' || st === 'afgekeurd';

/** Totaal over alle rondes (voor de voortgangsbalk van een pakket). */
export function totaalVoortgang(lijst) {
  const som = (f) => lijst.reduce((t, v) => t + f(v), 0);
  const totaal = som((v) => v.totaal);
  const gedaan = som((v) => v.gedaan.size);
  const over = som((v) => v.overgeslagen.size);
  const opHoeveelheid = lijst.some((v) => v.modus === 'hoeveelheid');
  const percentage = opHoeveelheid ? (lijst.length ? Math.round(som((v) => v.percentage) / lijst.length) : 0) : totaal ? Math.round(((gedaan + over) / totaal) * 100) : 0;
  return { totaal, gedaan: { size: gedaan }, overgeslagen: { size: over }, deels: { size: som((v) => v.deels?.size ?? 0) }, open: lijst.flatMap((v) => v.open), percentage };
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
    for (const k of f.kenmerken ?? []) {
      if (!k?.kenmerk || k.waarde === undefined || k.waarde === '') continue;
      const v = String(o.kenmerken?.[k.kenmerk] ?? '');
      if (Array.isArray(k.waarde) ? !k.waarde.includes(v) : v !== k.waarde) return false;
    }
    if (f.conditie) {
      const c = status?.get(o.id)?.conditie;
      if (f.conditie === 'geen' ? c : String(c) !== f.conditie) return false;
    }
    if (f.planning && status?.get(o.id)?.planning !== f.planning) return false;
    if (zoek && !`${o.code} ${o.naam} ${o.locatie ?? ''}`.toLowerCase().includes(zoek)) return false;
    return true;
  });
}

/**
 * Wat maakt rondes op dezelfde locatie van elkaar verschillend? Per ronde de kenmerken (code, rondenummer, periode, aantal objecten)
 * en of de naam vaker voorkomt. "dubbel" = zelfde naam, soort, periode en objecten: waarschijnlijk dubbel aangemaakt.
 * @param {object[]} views  rondeView's
 * @returns {Map<string, { code: string, ronde: string, zelfdeNaam: boolean, dubbel: boolean }>} op `${id}:${rondeId}`
 */
export function onderscheid(views) {
  const sleutel = (v) => `${v.id}:${v.rondeId}`;
  const telNaam = new Map();
  const telAlles = new Map();
  const alles = (v) => [norm(v.naam), v.soort, v.werksoort ?? '', v.inspectiesoort ?? '', v.start ?? '', v.eind ?? '', [...(v.objecten ?? [])].sort().join(',')].join('|');
  for (const v of views) {
    telNaam.set(norm(v.naam), (telNaam.get(norm(v.naam)) ?? 0) + 1);
    telAlles.set(alles(v), (telAlles.get(alles(v)) ?? 0) + 1);
  }
  return new Map(views.map((v) => [sleutel(v), {
    code: v.code || '',
    ronde: (v.rondes?.length ?? 0) > 1 ? `R${v.nummer ?? 1}` : '',
    zelfdeNaam: telNaam.get(norm(v.naam)) > 1,
    dubbel: telAlles.get(alles(v)) > 1,
  }]));
}

/** Naam van een werkpakket (of ronde-weergave) met de code ervoor: "WP-001 Groenonderhoud". Tekst, niet ge-escaped. */
export function metCode(p) {
  const c = String(p?.code ?? '').trim();
  const n = String(p?.naam ?? '').trim();
  if (!c) return n;
  if (!n) return c;
  return n.toLowerCase().startsWith(c.toLowerCase()) ? n : `${c} ${n}`;
}
