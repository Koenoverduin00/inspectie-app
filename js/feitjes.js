// Feitje van de dag: leuke weetjes die uit de gegevens van het project worden berekend.
// Puur rekenwerk (geen DOM); elke dag een ander feitje, voor iedereen in het project hetzelfde.

const nl = (n, d = 0) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: d });
const meervoud = (n, een, meer) => `${nl(n)} ${n === 1 ? een : meer}`;
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const datumTekst = (iso) => { const [j, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} ${MAANDEN[m - 1]} ${j}`; };

/** Vaste maten om getallen voorstelbaar te maken. */
export const MATEN = {
  voetbalveld: 7140,   // m² (105 × 68 m)
  atletiekbaan: 400,   // m per rondje
  domtoren: 112,       // m hoog
  werkweek: 38,        // uur
};

/** Eenvoudige, stabiele hash van een tekst (voor de keuze van de dag). */
export function hash(tekst) {
  let h = 2166136261;
  for (const c of String(tekst)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Alle feitjes die met de huidige gegevens te maken zijn.
 * @param {object} g
 * @param {object[]} g.objecten
 * @param {object[]} [g.werk]         werkzaamheden
 * @param {object[]} [g.inspecties]
 * @param {(o: object) => {soort: string|null, maat: number}} [g.maatVan]  oppervlakte (m²) of lengte (m) van een object
 * @param {(iso: string) => number} [g.uurVan]  lokaal uur van een tijdstip
 * @param {(w: object) => number} [g.manurenVan]
 * @returns {{ id: string, icoon: string, tekst: string }[]}
 */
export function maken({ objecten = [], werk = [], inspecties = [], maatVan = () => ({ soort: null, maat: 0 }), uurVan = (iso) => new Date(iso).getHours(), manurenVan = (w) => Number(w.uren) || 0 } = {}) {
  const uit = [];
  const voeg = (id, icoon, tekst) => uit.push({ id, icoon, tekst });
  const objectVan = new Map(objecten.map((o) => [o.id, o]));
  const naam = (o) => [o?.code, o?.naam].filter(Boolean).join(' ');

  // Oppervlakte en lengte
  let vlak = 0; let lijn = 0; let grootste = null;
  for (const o of objecten) {
    const m = maatVan(o);
    if (m.soort === 'vlak') { vlak += m.maat; if (!grootste || m.maat > grootste.maat) grootste = { o, maat: m.maat }; }
    if (m.soort === 'lijn') lijn += m.maat;
  }
  if (vlak >= MATEN.voetbalveld / 2) {
    const velden = vlak / MATEN.voetbalveld;
    voeg('voetbal', 'gras', `Alle vlakken in dit project zijn samen ${nl(vlak)} m². Dat zijn ${nl(velden, velden < 10 ? 1 : 0)} voetbalvelden!`);
  }
  if (lijn >= MATEN.atletiekbaan) {
    voeg('atletiek', 'navigeer', `Leg je alle lijnen van het project achter elkaar, dan heb je ${nl(lijn / 1000, 1)} km: ${nl(Math.round(lijn / MATEN.atletiekbaan))} rondjes op een atletiekbaan.`);
  }
  if (lijn >= MATEN.domtoren * 3) {
    voeg('domtoren', 'constructie', `Rechtop gezet zijn alle lijnen samen ${nl(Math.round(lijn / MATEN.domtoren))} keer zo hoog als de Domtoren (112 m).`);
  }
  if (grootste && objecten.length > 1) voeg('grootste', 'gebied', `Het grootste vlak is ${naam(grootste.o)}: ${nl(grootste.maat)} m².`);

  // Objecttypen
  const typen = new Map();
  for (const o of objecten) if (o.type) typen.set(o.type, (typen.get(o.type) ?? 0) + 1);
  const topType = [...typen].sort((a, b) => b[1] - a[1])[0];
  if (topType && typen.size > 1) voeg('type', 'lagen', `Het meest voorkomende objecttype is ${topType[0].toLowerCase()}: ${meervoud(topType[1], 'stuk', 'stuks')} van de ${nl(objecten.length)} objecten.`);
  if (objecten.length >= 10) voeg('objecten', 'lagen', `Dit project telt ${meervoud(objecten.length, 'object', 'objecten')} in ${meervoud(typen.size || 1, 'soort', 'soorten')}.`);

  // Registraties
  const regs = [...werk.filter((w) => w.datum), ...inspecties.filter((i) => i.status === 'afgerond' && i.datum)];
  if (regs.length) {
    const perDag = new Map();
    for (const r of regs) perDag.set(r.datum, (perDag.get(r.datum) ?? 0) + 1);
    const [topDag, topAantal] = [...perDag].sort((a, b) => b[1] - a[1] || String(b[0]).localeCompare(a[0]))[0];
    if (topAantal >= 2) voeg('drukste', 'kalender', `De drukste dag tot nu toe was ${datumTekst(topDag)}: toen werden ${meervoud(topAantal, 'registratie', 'registraties')} vastgelegd.`);
    const perObject = new Map();
    for (const r of regs) if (r.objectId) perObject.set(r.objectId, (perObject.get(r.objectId) ?? 0) + 1);
    const [topObj, keer] = [...perObject].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (keer >= 2 && objectVan.has(topObj)) voeg('populair', 'locatie', `${naam(objectVan.get(topObj))} is het populairste object: er is al ${keer} keer iets vastgelegd.`);
    const mensen = new Set(regs.map((r) => r.uitvoerder || r.inspecteur).filter(Boolean));
    if (mensen.size >= 2) voeg('team', 'personen', `Aan dit project hebben al ${nl(mensen.size)} verschillende mensen buiten gewerkt.`);
    const uren = regs.map((r) => r.gewijzigd || r.aangemaakt).filter(Boolean).map((t) => ({ t, u: uurVan(t) })).filter((x) => Number.isFinite(x.u));
    const vroeg = uren.filter((x) => x.u < 7).length;
    if (vroeg) voeg('vroeg', 'wacht', `${meervoud(vroeg, 'registratie werd', 'registraties werden')} al vóór 7 uur 's ochtends vastgelegd. De vroege vogels!`);
  }
  const fotos = regs.reduce((n, r) => n + (r.fotoIds?.length ?? 0) + (r.gebreken ?? []).reduce((m, g) => m + (g.fotoIds?.length ?? 0), 0), 0);
  if (fotos >= 5) voeg('fotos', 'camera', `Er zijn al ${meervoud(fotos, 'foto', 'foto’s')} gemaakt. Genoeg voor een fotoalbum van ${meervoud(Math.ceil(fotos / 6), 'pagina', 'pagina’s')}.`);
  const manuren = werk.reduce((n, w) => n + manurenVan(w), 0);
  if (manuren >= MATEN.werkweek) voeg('uren', 'wacht', `Samen is er al ${nl(manuren)} manuur gewerkt, dat zijn ${nl(manuren / MATEN.werkweek, 1)} volle werkweken.`);

  // Gebreken en storingen
  const gebreken = inspecties.flatMap((i) => i.gebreken ?? []);
  const opgelost = gebreken.filter((g) => g.maatregelStatus === 'uitgevoerd').length;
  if (gebreken.length >= 3) voeg('gebreken', 'inspectie', `Bij inspecties zijn ${meervoud(gebreken.length, 'gebrek', 'gebreken')} gevonden${opgelost ? `, waarvan er al ${nl(opgelost)} ${opgelost === 1 ? 'is' : 'zijn'} opgelost` : ''}.`);
  const storingen = werk.filter((w) => w.storing?.resultaat === 'opgelost' && w.storing.gemeldOp && w.storing.opgelostOp);
  if (storingen.length >= 2) {
    const duur = storingen.map((w) => (new Date(w.storing.opgelostOp) - new Date(w.storing.gemeldOp)) / 3.6e6).filter((h) => h >= 0).sort((a, b) => a - b);
    if (duur.length) {
      const mediaan = duur[Math.floor(duur.length / 2)];
      voeg('storing', 'let', `${meervoud(storingen.length, 'storing of gebrek is', 'storingen en gebreken zijn')} opgelost, meestal binnen ${mediaan < 1 ? `${nl(Math.max(1, Math.round(mediaan * 60)))} minuten` : `${nl(Math.round(mediaan))} uur`}.`);
    }
  }
  return uit;
}

/** Het feitje van vandaag: elke dag een ander (voor iedereen in het project hetzelfde); `stap` bladert verder. */
export function vanDeDag(lijst, datum, sleutel = '', stap = 0) {
  if (!lijst.length) return null;
  const n = lijst.length;
  return lijst[(((hash(`${sleutel}:${datum}`) + stap) % n) + n) % n];
}
