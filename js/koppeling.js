// Koppelschema: schouw- en inspectiepakketten als bron voor werkpakketten.
// Een relatie (koppeling) zegt: bevindingen uit inspectiepakket A die aan het filter voldoen, worden werklocaties
// (werkpunten) in werkpakket B. Modus 'altijd' zet ze direct door, 'controle' legt ze eerst voor in de doorzetbak.
// Doorzetten gebeurt pas als de inspectie is goedgekeurd (of afgerond, als het project niet beoordeelt).
//
// Gegevens:
// - project.koppelingen = [{ id, bronPakketId, doelPakketId, modus, doelRonde, herstelNaam, filter, vanaf, actief }]
// - store 'werkpunten': één record per (inspectie, gebrek, koppeling), met vaste sleutel zodat niets dubbel ontstaat.
//   Het gebrek blijft in de inspectie staan; de werklocatie wordt in de doelronde gezet als herstelitem
//   (ronde.herstel.items), zodat kaart, formulier en afvinken werken zoals bij een herstelronde.
// Puur en testbaar: geen DOM, geen opslag.
import { methodiekVan, STANDAARD_SCHAAL, CHECK } from './inspectietypen.js';

/** Het storingen- en gebrekenregister als doel: gebreken worden daar een melding (zaak). */
export const STORINGEN = '__storingen';
export const STORINGEN_NAAM = 'Storingen en gebreken';
/** Urgentie van een gebrek → urgentie van een melding in het register. */
export const MELDING_URGENTIE = { direct: 'direct', '3maanden': 'week', '1jaar': 'normaal', '3jaar': 'normaal', '5jaar': 'normaal', monitoren: 'normaal' };
export const meldingId = (werkpuntId) => `wp:${werkpuntId}`;

export const MODI = {
  altijd: { label: 'Altijd', uitleg: 'Passende gebreken worden direct een werklocatie in het werkpakket.' },
  controle: { label: 'Met controle', uitleg: 'Passende gebreken komen eerst in de doorzetbak; een werkvoorbereider besluit per gebrek.' },
};
export const DOEL_RONDES = {
  lopend: { label: 'Lopende ronde', uitleg: 'De ronde die nu loopt; is er geen, dan de eerstvolgende.' },
  volgend: { label: 'Volgende ronde', uitleg: 'De eerstvolgende ronde die nog moet beginnen.' },
  herstel: { label: 'Aparte herstelronde', uitleg: 'Een eigen herstelronde voor deze relatie (wordt aangemaakt als die er nog niet is).' },
};
export const STATUS = {
  'te beoordelen': { label: 'Te beoordelen', kleur: '#e8a33d' },
  open: { label: 'Open', kleur: '#d1452f' },
  gedaan: { label: 'Uitgevoerd', kleur: '#1a7f37' },
  nader: { label: 'Nader onderzoek', kleur: '#7c3aed' },
  'niet uitvoeren': { label: 'Niet uitvoeren', kleur: '#8a96a3' },
  vervallen: { label: 'Vervallen', kleur: '#b0b8c1' },
};
export const BESLUITEN = {
  doorzetten: 'Doorzetten (binnen onderhoud)',
  meerwerk: 'Doorzetten als meerwerk',
  nader: 'Nader onderzoek',
  'niet uitvoeren': 'Niet uitvoeren',
};
/** Besluit → status van het werkpunt. */
export const STATUS_NA_BESLUIT = { doorzetten: 'open', meerwerk: 'open', nader: 'nader', 'niet uitvoeren': 'niet uitvoeren' };

const URGENTIE_RANG = { direct: 0, '3maanden': 1, '1jaar': 2, '3jaar': 3, '5jaar': 4, monitoren: 5 };
export const urgentieRang = (u) => URGENTIE_RANG[u] ?? 9;

const schaalVan = (insp) => (insp?.type?.schaal?.length ? insp.type.schaal : STANDAARD_SCHAAL);
/** Oordeel van een bevinding als tekst: het niveau uit de eigen schaal, of "Niet in orde" bij een checklist. */
export function oordeelLabel(insp, g) {
  const m = methodiekVan(insp);
  if (m === 'checklist' || g?.checkpunt) return CHECK.nok;
  if (m === 'oordeel') return schaalVan(insp).find((x) => Number(x.waarde) === Number(g?.oordeel))?.label ?? '';
  return '';
}

/**
 * Alle bevindingen van een inspectie die werk kunnen opleveren:
 * - met een maatregel of urgentie (gebreken, BVC-maatregelen, STOWA-waarnemingen);
 * - checklist: elk punt dat "niet in orde" is;
 * - eigen oordeelschaal: elk oordeel dat slechter is dan het beste niveau (bijv. "Afgekeurd", "Matig", "Slecht").
 */
export function bevindingen(insp) {
  const m = methodiekVan(insp);
  const beste = Math.min(...schaalVan(insp).map((x) => Number(x.waarde)).filter(Number.isFinite));
  const telt = (g) => {
    if (!g?.id) return false;
    if (g.maatregel || g.urgentie || g.bvcMaatregel) return true;
    if (m === 'checklist' || g.checkpunt) return true;
    if (m === 'oordeel') return Number(g.oordeel) > beste;
    return Boolean(insp?.stowa);
  };
  return [...(insp?.gebreken ?? []), ...(insp?.bvc?.maatregelen ?? []), ...(insp?.stowa?.waarnemingen ?? [])].filter(telt);
}
/** Past het antwoord op een eigen vraag (per bevinding) bij de gekozen waarden? vraag = { id, type, waarden: [...] } */
export function vraagPast(vraag, waarde) {
  const w = vraag?.waarden ?? [];
  if (!vraag?.id || !w.length) return false;
  if (vraag.type === 'janee') return (w.includes('Ja') && waarde === true) || (w.includes('Nee') && waarde === false);
  if (Array.isArray(waarde)) return waarde.some((x) => w.includes(x));
  return waarde != null && w.includes(String(waarde));
}

/**
 * De bevindingen die een relatie bekijkt. Met een vraag als voorwaarde: elke bevinding waarbij die vraag zo is
 * beantwoord (ook zonder maatregel of oordeel). Anders: de bevindingen die werk opleveren (zie bevindingen()).
 */
export function kandidaten(insp, filter) {
  if (filter?.vraag?.id) {
    return [...(insp?.gebreken ?? []), ...(insp?.bvc?.maatregelen ?? []), ...(insp?.stowa?.waarnemingen ?? [])]
      .filter((g) => g?.id && vraagPast(filter.vraag, g.extra?.[filter.vraag.id]));
  }
  return bevindingen(insp);
}

export const maatregelNaam = (g) => String(g?.bvcMaatregel || g?.maatregel || '').trim();
export const gebrekNaam = (g) => String(g?.gebrek || g?.omschrijving || g?.checkpunt || g?.code || '').trim();

export const werkpuntId = (inspectieId, gebrekId, koppelingId) => `${inspectieId}:${gebrekId}:${koppelingId}`;

/** Telt de inspectie als 'klaar om door te zetten'? Afgerond en goedgekeurd (geen beoordeling = goedgekeurd). */
export const inspectieGoedgekeurd = (i) => i?.status === 'afgerond' && (i.beoordeling?.status ?? 'goedgekeurd') === 'goedgekeurd';

/**
 * Past een bevinding binnen het filter van een relatie? Lege filteronderdelen laten alles door.
 * filter = { maatregelen: [namen], gebreken: [namen], urgentieTot: 'direct'|'3maanden'|…, conditieVanaf: 1..6 }
 */
export function past(filter, gebrek, { conditie = null, oordeel = '' } = {}) {
  const f = filter ?? {};
  if (f.oordelen?.length && !f.oordelen.includes(oordeel)) return false;
  if (f.maatregelen?.length && !f.maatregelen.includes(maatregelNaam(gebrek))) return false;
  if (f.gebreken?.length && !f.gebreken.includes(gebrekNaam(gebrek))) return false;
  if (f.urgentieTot && urgentieRang(gebrek.urgentie) > urgentieRang(f.urgentieTot)) return false;
  if (f.conditieVanaf && conditie != null && Number(conditie) < Number(f.conditieVanaf)) return false;
  return true;
}

/** Een gebrek zoals het bij het doorzetten was (zodat later te zien is of de bron is gewijzigd). */
export const momentopname = (g, insp = null) => ({
  maatregel: maatregelNaam(g), gebrek: gebrekNaam(g), bouwdeel: g.bouwdeel ?? '', urgentie: g.urgentie ?? '',
  raming: g.kostenraming ?? '', toelichting: g.toelichting ?? '', locatie: g.locatie ?? null,
  ...(insp ? { oordeel: oordeelLabel(insp, g) } : {}),
});
// Alleen de velden vergelijken die al in de oude momentopname stonden (nieuwe velden tellen niet als wijziging).
const zelfdeOpname = (a, b) => Object.keys(a ?? {}).every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b?.[k] ?? null));

/**
 * Wat er moet gebeuren voor één relatie: nieuwe werkpunten en wijzigingen aan bestaande.
 * @param koppeling   de relatie
 * @param inspecties  alle inspecties van het project
 * @param bestaande   Map id → werkpunt
 * @param conditieVan (gebrek) → conditie (1..6) of null
 * @returns {{ nieuw: object[], gewijzigd: object[] }}
 */
export function bijwerken(koppeling, inspecties, bestaande, { nu = '', conditieVan = () => null } = {}) {
  const nieuw = [];
  const gewijzigd = [];
  if (!koppeling?.actief && koppeling?.actief !== undefined) return { nieuw, gewijzigd };
  const kid = koppeling.id;
  const gezien = new Set();
  for (const i of inspecties) {
    if (i.werkpakketId !== koppeling.bronPakketId) continue;
    const goed = inspectieGoedgekeurd(i);
    const gebreken = new Map(kandidaten(i, koppeling.filter).map((g) => [g.id, g]));
    // Bestaande werkpunten van deze inspectie: bron gewijzigd, afgekeurd of gebrek verdwenen?
    for (const [gid, g] of gebreken) {
      const id = werkpuntId(i.id, gid, kid);
      gezien.add(id);
      const wp = bestaande.get(id);
      if (wp) {
        const upd = bijgewerkt(wp, { goed, gebrek: g, nu, modus: koppeling.modus, insp: i });
        if (upd) gewijzigd.push(upd);
        continue;
      }
      if (!goed) continue;
      if (koppeling.vanaf && String(i.datum ?? '') < koppeling.vanaf) continue;
      if (!past(koppeling.filter, g, { conditie: conditieVan(g, i), oordeel: oordeelLabel(i, g) })) continue;
      const uitgevoerd = g.maatregelStatus === 'uitgevoerd';
      nieuw.push({
        id, projectId: i.projectId, koppelingId: kid,
        bron: { inspectieId: i.id, gebrekId: gid, objectId: i.objectId, pakketId: i.werkpakketId, rondeId: i.rondeId ?? '' },
        doel: { pakketId: koppeling.doelPakketId, rondeId: '' },
        momentopname: momentopname(g, i),
        status: uitgevoerd ? 'gedaan' : koppeling.modus === 'altijd' ? 'open' : 'te beoordelen',
        besluit: koppeling.modus === 'altijd' ? { keuze: 'doorzetten', door: 'automatisch', op: nu } : null,
        aangemaakt: nu, gewijzigd: nu,
      });
    }
    // Werkpunten waarvan het gebrek niet meer in de inspectie staat.
    for (const wp of bestaande.values()) {
      if (wp.koppelingId !== kid || wp.bron?.inspectieId !== i.id || gebreken.has(wp.bron.gebrekId)) continue;
      gezien.add(wp.id);
      if (!['gedaan', 'vervallen'].includes(wp.status)) gewijzigd.push({ ...wp, status: 'vervallen', vorigeStatus: wp.status, reden: VERDWENEN, gewijzigd: nu });
    }
  }
  return { nieuw, gewijzigd };
}

const AFGEKEURD = 'De inspectie is afgekeurd of opnieuw ingediend';
const VERDWENEN = 'De bevinding staat niet meer in de inspectie (of telt niet meer mee)';
/** Een bestaand werkpunt bijwerken; null als er niets verandert. */
export function bijgewerkt(wp, { goed, gebrek, nu, modus = 'controle', insp = null }) {
  if (wp.status === 'vervallen' && gebrek && goed && wp.reden === VERDWENEN) {
    return { ...wp, status: wp.vorigeStatus || 'te beoordelen', reden: '', gewijzigd: nu };
  }
  // Uitgevoerd (via een werkzaamheid die de maatregel afhandelt): de werklocatie is klaar.
  if (gebrek?.maatregelStatus === 'uitgevoerd' && ['open', 'te beoordelen', 'nader'].includes(wp.status)) return { ...wp, status: 'gedaan', bronGewijzigd: false, reden: '', gewijzigd: nu };
  if (gebrek?.maatregelStatus !== 'uitgevoerd' && wp.status === 'gedaan' && !wp.handmatigGedaan) return { ...wp, status: 'open', gewijzigd: nu };
  if (['gedaan', 'vervallen', 'niet uitvoeren'].includes(wp.status)) return null;
  // Inspectie afgekeurd of aangepast na het doorzetten: terug naar controle (niet automatisch verder).
  if (!goed && wp.status !== 'te beoordelen') return { ...wp, status: 'te beoordelen', bronGewijzigd: true, reden: AFGEKEURD, vorigeStatus: wp.status, gewijzigd: nu };
  // Weer goedgekeurd zonder inhoudelijke wijziging: bij 'altijd' gaat hij vanzelf weer door, anders blijft hij ter controle.
  if (goed && wp.status === 'te beoordelen' && wp.reden === AFGEKEURD && gebrek && zelfdeOpname(wp.momentopname, momentopname(gebrek, insp))) {
    return modus === 'altijd' ? { ...wp, status: 'open', bronGewijzigd: false, reden: '', gewijzigd: nu } : { ...wp, reden: 'Opnieuw goedgekeurd na afkeuren: opnieuw beoordelen', gewijzigd: nu };
  }
  if (goed && gebrek && wp.momentopname && !zelfdeOpname(wp.momentopname, momentopname(gebrek, insp))) {
    return { ...wp, momentopname: momentopname(gebrek, insp), bronGewijzigd: true, status: wp.status === 'open' ? 'te beoordelen' : wp.status, reden: 'Het gebrek is aangepast na het doorzetten', gewijzigd: nu };
  }
  return null;
}

/** Een besluit vastleggen. */
export function besluit(wp, keuze, { door = '', reden = '', nu = '' } = {}) {
  return { ...wp, status: STATUS_NA_BESLUIT[keuze] ?? wp.status, besluit: { keuze, door, reden, op: nu }, bronGewijzigd: false, reden: '', gewijzigd: nu };
}

/**
 * In welke ronde komt een werkpunt? 'lopend': de actieve ronde (of de eerstvolgende), 'volgend': de eerstvolgende
 * die nog niet is begonnen, 'herstel': de open herstelronde van deze relatie. null = er moet een herstelronde komen.
 */
export function doelRonde(rondes, doelRondeKeuze, { vandaag = '', koppelingId = '' } = {}) {
  const open = (rondes ?? []).filter((r) => r.status !== 'afgerond');
  const nr = (r) => Number(r.nummer) || 0;
  if (doelRondeKeuze === 'herstel') return open.find((r) => r.herstel?.koppelingId === koppelingId) ?? null;
  const gepland = open.filter((r) => r.status !== 'actief' && (!r.start || r.start > vandaag)).sort((a, b) => String(a.start || '9999').localeCompare(String(b.start || '9999')) || nr(a) - nr(b));
  if (doelRondeKeuze === 'volgend') return gepland[0] ?? null;
  const actief = open.filter((r) => r.status === 'actief' || (r.start && r.start <= vandaag && (!r.eind || r.eind >= vandaag))).sort((a, b) => nr(a) - nr(b));
  return actief[0] ?? gepland[0] ?? null;
}

/** Werkpunten in de doelronde zetten (als herstelitems), of eruit halen als ze niet (meer) open zijn. */
export function rondeMetPunten(ronde, punten, { koppelingId = '', bronPakketId = '' } = {}) {
  const items = ronde.herstel?.items ?? [];
  const sleutelVan = (x) => `${x.inspectieId}:${x.gebrekId}`;
  const al = new Set(items.map(sleutelVan));
  const erbij = punten.filter((p) => p.status === 'open').map((p) => ({ inspectieId: p.bron.inspectieId, gebrekId: p.bron.gebrekId, objectId: p.bron.objectId, werkpuntId: p.id }))
    .filter((x) => !al.has(sleutelVan(x)));
  const weg = new Set(punten.filter((p) => ['te beoordelen', 'nader', 'niet uitvoeren', 'vervallen'].includes(p.status)).map((p) => `${p.bron.inspectieId}:${p.bron.gebrekId}`));
  const nieuweItems = [...items.filter((x) => !(weg.has(sleutelVan(x)) && x.werkpuntId)), ...erbij];
  if (!erbij.length && nieuweItems.length === items.length) return null;
  return {
    ...ronde,
    ...(ronde.objectIds?.length ? { objectIds: [...new Set([...ronde.objectIds, ...erbij.map((x) => x.objectId)])] } : {}),
    herstel: { ...(ronde.herstel ?? {}), bronPakketId: ronde.herstel?.bronPakketId ?? bronPakketId, ...(koppelingId && !ronde.herstel ? { koppelingId } : {}), items: nieuweItems },
  };
}

/** Tellingen per relatie, voor de lijnen in het koppelschema. */
export function tellingen(werkpunten) {
  const uit = new Map();
  for (const wp of werkpunten ?? []) {
    const t = uit.get(wp.koppelingId) ?? { totaal: 0, open: 0, teBeoordelen: 0, gedaan: 0 };
    t.totaal += 1;
    if (wp.status === 'open') t.open += 1;
    if (wp.status === 'te beoordelen') t.teBeoordelen += 1;
    if (wp.status === 'gedaan') t.gedaan += 1;
    uit.set(wp.koppelingId, t);
  }
  return uit;
}

/** Voorstel in de doorzetbak: welke punten staan vooraf aangevinkt? Urgent, of eerder bij dezelfde maatregel doorgezet. */
export function voorstel(punten, eerdere = []) {
  const doorgezet = new Set(eerdere.filter((p) => ['open', 'gedaan'].includes(p.status) && p.besluit?.keuze !== undefined).map((p) => p.momentopname?.maatregel));
  return new Set(punten.filter((p) => urgentieRang(p.momentopname?.urgentie) <= 1 || doorgezet.has(p.momentopname?.maatregel)).map((p) => p.id));
}

/**
 * Waarom komt een bevinding uit de bron (nog) niet door? Per relatie: hoeveel wachten op goedkeuring, zijn afgekeurd,
 * staan nog als concept, liggen vóór de startdatum of vallen buiten het filter.
 */
export function diagnose(koppeling, inspecties, { conditieVan = () => null } = {}) {
  const uit = { wacht: 0, afgekeurd: 0, concept: 0, voorStart: 0, buitenFilter: 0, inspWacht: 0, inspAfgekeurd: 0 };
  for (const i of inspecties ?? []) {
    if (i.werkpakketId !== koppeling.bronPakketId) continue;
    const bev = kandidaten(i, koppeling.filter);
    if (!bev.length) continue;
    const st = i.beoordeling?.status ?? 'goedgekeurd';
    if (i.status !== 'afgerond') { uit.concept += bev.length; continue; }
    if (st === 'ingediend') { uit.wacht += bev.length; uit.inspWacht += 1; continue; }
    if (st === 'afgekeurd') { uit.afgekeurd += bev.length; uit.inspAfgekeurd += 1; continue; }
    if (koppeling.vanaf && String(i.datum ?? '') < koppeling.vanaf) { uit.voorStart += bev.length; continue; }
    uit.buitenFilter += bev.filter((g) => !past(koppeling.filter, g, { conditie: conditieVan(g, i), oordeel: oordeelLabel(i, g) })).length;
  }
  return uit;
}

/**
 * Het gekoppelde formulier inlezen: wat telt er mee, welke keuzes zijn er om op te filteren, en zijn er problemen?
 * @param type      inspectietype (eigen of standaard) of null bij een protocol
 * @param protocol  'bvc' | 'stowa' | ''
 * @param vragen    eigen vragen per bevinding die bij dit type horen
 */
export function formulierAnalyse({ naam = '', type = null, protocol = '', vragen = [], bvcMaatregelen = [] }) {
  const uit = { naam, methodiek: protocol || type?.methodiek || 'nen', regel: '', oordelen: [], schaal: [], gebreken: [], onderdelen: [], punten: [], maatregelen: [],
    vragen: (vragen ?? []).filter((v) => ['janee', 'keuze', 'meerkeuze'].includes(v.type)), waarschuwingen: [] };
  if (protocol === 'bvc') { uit.regel = 'Elke boomveiligheidsmaatregel telt mee (bijv. snoeien, kappen).'; uit.maatregelen = [...bvcMaatregelen]; return uit; }
  if (protocol === 'stowa') { uit.regel = 'Elke waarneming op de waterkering telt mee.'; return uit; }
  if (!type) { uit.waarschuwingen.push(`Het formulier "${naam}" is niet (meer) gevonden in dit project. Controleer de inspectietypen.`); uit.regel = 'Bevindingen met een maatregel of urgentie tellen mee.'; return uit; }
  uit.gebreken = [...(type.gebreken ?? [])];
  uit.onderdelen = [...(type.onderdelen ?? [])];
  if (type.methodiek === 'oordeel') {
    const schaal = type.schaal?.length ? type.schaal : STANDAARD_SCHAAL;
    const beste = Math.min(...schaal.map((x) => Number(x.waarde)));
    uit.schaal = schaal.map((x) => ({ label: x.label, kleur: x.kleur, telt: Number(x.waarde) > beste }));
    uit.oordelen = uit.schaal.filter((x) => x.telt).map((x) => x.label);
    uit.regel = `Bevindingen met het oordeel ${uit.oordelen.map((x) => `"${x}"`).join(' of ')} tellen mee, ook zonder maatregel. "${schaal.find((x) => Number(x.waarde) === beste)?.label}" telt niet mee.`;
    if (schaal.length < 2) uit.waarschuwingen.push('De schaal heeft maar één niveau: er kan nooit iets worden afgekeurd.');
  } else if (type.methodiek === 'checklist') {
    uit.punten = [...(type.punten ?? [])];
    uit.regel = 'Elk controlepunt dat "niet in orde" is telt mee, ook zonder maatregel.';
    if (!uit.punten.length) uit.waarschuwingen.push('De checklist heeft geen controlepunten.');
  } else {
    uit.regel = 'Elk gebrek met een advies maatregel of een urgentie telt mee (NEN 2767).';
  }
  return uit;
}

/**
 * Proef met de bestaande inspecties van de bron: hoeveel bevindingen zijn er, hoeveel tellen mee en hoeveel
 * zouden nu doorgaan (los van wat er al is doorgezet).
 */
export function proef(koppeling, inspecties, { conditieVan = () => null } = {}) {
  const eigen = (inspecties ?? []).filter((i) => i.werkpakketId === koppeling.bronPakketId);
  const alle = eigen.reduce((t, i) => t + [...(i.gebreken ?? []), ...(i.bvc?.maatregelen ?? []), ...(i.stowa?.waarnemingen ?? [])].length, 0);
  const kand = eigen.flatMap((i) => kandidaten(i, koppeling.filter).map((g) => ({ i, g })));
  const passend = kand.filter(({ i, g }) => past(koppeling.filter, g, { conditie: conditieVan(g, i), oordeel: oordeelLabel(i, g) }));
  const klaar = passend.filter(({ i }) => inspectieGoedgekeurd(i) && !(koppeling.vanaf && String(i.datum ?? '') < koppeling.vanaf));
  return { inspecties: eigen.length, bevindingen: alle, tellen: kand.length, passend: passend.length, door: klaar.length };
}
