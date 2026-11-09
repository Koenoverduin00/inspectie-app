// STOWA-systematiek voor visuele inspectie van waterkeringen.
// Bronnen: STOWA 2012-14 "Inspectiewijzers waterkeringen" (Handreiking inspecties waterkeringen, technisch
// deel: hiërarchie type kering → zone → element → schadeparameter, 61 inspectiewijzers in 7 categorieën,
// bijlage C zoneringen, bijlage D keuzelijsten) en STOWA VIW 2008-02 "Handreiking inspectie waterkeringen,
// operationeel deel" (typen inspecties; beoordeling per waarneming: categorie schadebeeld/handhaving en
// urgentie groen/oranje/rood; classificatie maatregelen monitoren/verbeteren/reconstrueren).

import * as DG from './digigids.js';

export const STOWA_SOORT = 'Inspectie waterkering (STOWA)';

/** Typen inspecties (operationeel deel, tabel 4). */
export const INSPECTIEMOMENTEN = [
  'Schouw', 'Najaarsinspectie', 'Voorjaarsinspectie', 'Dagelijkse inspectie', 'Bestuursschouw',
  'Gericht technische inspectie', 'Droogte-inspectie', 'Storm-inspectie',
];

/** Niveau 1 en 2: type kering met zones van buiten naar binnen (bijlage C). */
export const KERINGEN = {
  rivierdijk: { label: 'Rivierdijk', zones: ['voorland', 'buitentalud', 'kruin', 'binnentalud', 'teen', 'stabiliteitsberm', 'onderhoudsstrook', 'teensloot', 'achterland'] },
  zeedijk: { label: 'Zeedijk', zones: ['voorland', 'vooroever', 'kreukelberm', 'buitenberm', 'buitentalud', 'kruin', 'binnentalud', 'overgangstalud', 'binnenberm', 'teen', 'teensloot', 'achterland'] },
  regionaal: { label: 'Regionale kering', zones: ['vooroever', 'beschoeiing', 'buitentalud', 'kruin', 'binnentalud', 'teen', 'onderhoudsstrook', 'teensloot', 'achterland'] },
  duin: { label: 'Duin', zones: ['strand', 'duinvoet', 'duinfront', 'duingebied'] },
  dam: { label: '(Haven)dam', zones: ['vooroever', 'buitentalud', 'kruin', 'binnentalud', 'teen'] },
  hogegrond: { label: 'Hoge grond', zones: ['buitentalud', 'kruin', 'binnentalud', 'teen', 'achterland'] },
  kunstwerk: { label: 'Kunstwerk', zones: ['gehele kering'] },
};

/** Welke zones uit de inspectiewijzers bij een gekozen zone passen. */
const ZONE_BIJ = {
  voorland: ['vooroever'], kreukelberm: ['vooroever', 'teen'], beschoeiing: ['vooroever'],
  buitenberm: ['berm', 'teen', 'buitentalud'], binnenberm: ['berm', 'teen', 'binnentalud'], stabiliteitsberm: ['berm', 'teen'],
  overgangstalud: ['binnentalud'], onderhoudsstrook: ['teen', 'achterland'], duinvoet: ['duinvoet', 'duinfront', 'strand'],
};

export const CATEGORIEEN = { 1: 'Oevers', 2: 'Grasbekleding', 3: 'Steenbekleding', 4: 'Asfaltbekleding', 5: 'Wegen', 6: 'Overig', 7: 'Duinen' };

/** Niveau 3 en 4: de 61 inspectiewijzers [nr, categorie, element: schadebeeld, kenmerken, zones]. */
const RUW = [
  [1, 1, "Beschoeiing/damwand: afkalving/conditie", ["patroon", "breedte", "hoogte"], ["vooroever"]],
  [2, 1, "Beschoeiing/damwand: verdwenen", ["aard", "breedte", "hoogte"], ["vooroever"]],
  [3, 1, "Beschoeiing/damwand: vervorming/deformatie", ["soort vervorming", "lengte", "breedte", "status"], ["vooroever"]],
  [4, 1, "Oever: conditie rietkraag", ["patroon bedekking", "lengte", "breedte", "dichtheid"], ["teen", "vooroever"]],
  [5, 2, "Grasbekleding: afslag", ["erosielengte", "erosiebreedte", "erosiediepte"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud"]],
  [6, 2, "Grasbekleding: gaten (holen)", ["oorzaak", "ernst"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud"]],
  [7, 2, "Grasbekleding: kale plekken", ["patroon bedekking", "lengte", "breedte"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud"]],
  [8, 2, "Grasbekleding: natte plekken", ["oppervlakte", "uittredend water", "zand meevoerend", "bekende plek"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud", "achterland"]],
  [9, 2, "Grasbekleding: onkruid/begroeiing", ["onkruidsoort", "oppervlakte"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud"]],
  [10, 2, "Grasbekleding: scheuren (door uitdroging)", ["richting", "patroon", "lengte", "breedte", "diepte"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud", "berm"]],
  [11, 2, "Grasbekleding: spoorvorming", ["oppervlakte", "orientatie"], ["teen", "buitentalud", "kruin", "binnentalud"]],
  [12, 2, "Grasbekleding: veeschade", ["oorzaak", "oppervlakte", "diepte", "soort"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud"]],
  [13, 2, "Grasbekleding: verzakking of opbolling", ["soort", "lengte", "status"], ["teen", "buitentalud", "kruin", "binnentalud"]],
  [14, 3, "Opsluitbanden: aangetast overgangselement", ["omschrijving schade"], ["gehele kering"]],
  [15, 3, "Opsluitbanden: geen vlakke aansluiting/verzakking", ["overgang"], ["gehele kering"]],
  [16, 3, "Opsluitbanden: lokaal verdwenen overgangselement", ["opsluitband weg"], ["gehele kering"]],
  [17, 3, "Opsluitbanden: spleet naast overgangselement", ["omvang spleet", "beschrijving aansluiting"], ["gehele kering"]],
  [18, 3, "Steenbekleding/Strandhoofd: afslag", ["patroon", "lengte", "breedte"], ["strand", "duinfront", "duinvoet"]],
  [19, 3, "Steenbekleding: begroeiing", ["soort", "patroon", "lengte", "breedte", "diepte"], ["vooroever", "teen", "binnentalud", "kruin", "buitentalud", "duinvoet"]],
  [20, 3, "Steenbekleding: gebarsten of gebroken stenen", ["patroon", "lengte", "breedte"], ["vooroever", "teen", "binnentalud", "buitentalud", "duinfront"]],
  [21, 3, "Steenbekleding: geen of slechte hechting mortel", ["omschrijving", "lengte", "breedte", "diepte"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud", "duinfront"]],
  [22, 3, "Steenbekleding: losse, scheefgezakte of gekamde stenen", ["kammend zetwerk", "los zetwerk"], ["vooroever", "teen", "binnentalud", "kruin", "buitentalud", "duinfront"]],
  [23, 3, "Steenbekleding: omhoog gedrukte stenen", ["patroon", "lengte", "breedte"], ["vooroever", "teen", "buitentalud", "duinfront"]],
  [24, 3, "Steenbekleding: ontbrekende stenen / gaten (lokaal) / openingen", ["aantal", "patroon"], ["vooroever", "teen", "binnentalud", "kruin", "buitentalud", "duinfront"]],
  [25, 3, "Steenbekleding: slechte doorgroeiing doorgroeistenen", [], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud"]],
  [26, 3, "Steenbekleding: uitspoeling (grind, inwasgrind, etc.)", ["status", "lengte", "breedte", "diepte"], ["vooroever", "teen", "binnentalud", "buitentalud", "duinfront", "kruin"]],
  [27, 3, "Steenbekleding: verzakking of opbolling", ["soort vervorming", "lengte", "breedte", "status"], ["vooroever", "teen", "binnentalud", "buitentalud", "duinfront", "kruin"]],
  [28, 3, "Steenbestorting: gebarsten of gebroken stenen", ["patroon", "lengte", "breedte", "hoeveelheid"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud", "duinfront"]],
  [29, 3, "Steenbestorting: uitspoeling (grind, inwasgrind, etc.)", ["lengte", "breedte", "diepte", "status", "hoeveelheid"], ["vooroever", "teen", "binnentalud", "kruin", "buitentalud", "duinfront"]],
  [30, 3, "Steenbestorting: verzakking of opbolling", ["soort vervorming", "lengte", "breedte", "status", "hoeveelheid"], ["vooroever", "teen", "buitentalud", "kruin", "binnentalud", "duinfront"]],
  [31, 4, "Vol&Zat gepenetreerde breuksteen: begroeiing", ["soort", "patroon", "lengte", "breedte", "diepte beworteling"], ["teen", "buitentalud", "duinfront"]],
  [32, 4, "Vol&Zat gepenetreerde breuksteen: lokaal gat in steenlaag", ["gatenpatroon", "lengte", "breedte", "diepte"], ["teen", "buitentalud", "duinfront"]],
  [33, 4, "Vol&Zat gepenetreerde breuksteen: oppervlakkige schade", ["patroon", "lengte", "breedte", "hoeveelheid"], ["teen", "buitentalud", "duinfront"]],
  [34, 4, "Waterbouwasfaltbeton / OpenSteenAsfalt: aangetast oppervlak", ["aard", "patroon", "lengte", "breedte", "diepte"], ["buitentalud", "kruin", "binnentalud", "duinfront"]],
  [35, 4, "Waterbouwasfaltbeton / OpenSteenAsfalt: begroeiing", ["soort", "patroon", "lengte", "breedte", "diepte beworteling"], ["buitentalud", "kruin", "binnentalud", "duinfront"]],
  [36, 4, "Waterbouwasfaltbeton / OpenSteenAsfalt: gaten", ["gatenpatroon", "lengte", "breedte", "diepte"], ["buitentalud", "kruin", "binnentalud", "duinfront"]],
  [37, 4, "Waterbouwasfaltbeton: opbollingen", ["patroon", "lengte", "breedte", "hoogte"], ["buitentalud", "kruin", "binnentalud", "duinfront"]],
  [38, 4, "Waterbouwasfaltbeton: openstaande naden", ["richting", "lengte", "breedte", "diepte"], ["binnentalud", "kruin", "buitentalud", "duinfront"]],
  [39, 4, "Waterbouwasfaltbeton: scheuren", ["richting", "patroon", "lengte", "breedte", "diepte"], ["buitentalud", "kruin", "binnentalud", "duinfront"]],
  [40, 4, "Waterbouwasfaltbeton: vervorming/verzakkingen", ["soort", "lengte", "breedte", "diepte"], ["buitentalud", "kruin", "binnentalud", "duinfront"]],
  [41, 5, "Wegen: dwarsonvlakheid wegen", ["opening klinkers", "opbolling"], ["buitentalud", "kruin", "binnentalud"]],
  [42, 5, "Wegen: gaten", ["gatenpatroon", "lengte", "breedte", "diepte"], ["buitentalud", "kruin", "binnentalud"]],
  [43, 5, "Wegen: oneffenheden", ["hobbels", "scheuren"], ["buitentalud", "kruin", "binnentalud"]],
  [44, 5, "Wegen: rafeling", ["richting", "patroon", "lengte"], ["buitentalud", "kruin", "binnentalud"]],
  [45, 5, "Wegen: scheuren", ["richting", "patroon", "lengte", "breedte", "diepte"], ["buitentalud", "kruin", "binnentalud", "duingebied"]],
  [46, 5, "Wegen: spoorvorming", ["lijnvormige verzakkingen"], ["buitentalud", "kruin", "binnentalud"]],
  [47, 5, "Wegen: verzakking of opbolling", ["soort vervorming", "lengte", "breedte", "status"], ["buitentalud", "kruin", "binnentalud"]],
  [48, 6, "Bomen: windworp / erosie", ["patroon", "lengte", "breedte", "diepte"], ["teen", "berm", "buitentalud", "binnentalud", "kruin"]],
  [49, 6, "Drainage: zanduitspoeling drain", ["omschrijving"], ["teensloot"]],
  [50, 6, "Kabels en leidingen: schade afdekbekleding", ["soort object", "aard"], ["gehele kering"]],
  [51, 6, "Kabels en leidingen: vergraving / vervorming", ["soort object"], ["gehele kering"]],
  [52, 6, "Schanskorven: ontbrekende stenen, schade wapening, uitspoeling", ["patroon", "aantal", "lengte"], ["teen", "vooroever", "buitentalud"]],
  [53, 6, "Teensloot: aanwezigheid wellen bodem", ["bruine vlekken", "zandkraters", "natte plekken achterland", "losse grasmat"], ["teensloot", "achterland"]],
  [54, 6, "Trappen: verdwenen, aangetast, verzakt, aansluiting grondlichaam", [], ["buitentalud", "binnentalud", "duinfront"]],
  [55, 7, "Duin / Duinovergang: afslag", ["afslaglengte", "breedte", "diepte", "status"], ["duinfront"]],
  [56, 7, "Duinen: conditie helmgras", ["patroon bedekking", "lengte", "breedte", "dichtheid"], ["duinfront"]],
  [57, 7, "Duinen: verstuiving", ["verdwenen zand", "komvorming in de duinen", "diepte en grootte van de kuil"], ["duinfront", "duingebied"]],
  [58, 7, "Duinovergang: verzakkingen/gaten/oneffenheden", ["afname hoogte"], ["duingebied"]],
  [59, 7, "Duinprofiel: begroeiing anders dan helmgras", ["patroon bedekking", "lengte", "breedte"], ["duingebied"]],
  [60, 7, "Duinprofiel: riet-/stropoten", ["patroon bedekking", "lengte", "breedte"], ["duinfront"]],
  [61, 7, "Duinprofiel: stuifgaten", ["patroon", "lengte", "breedte"], ["duingebied"]]
];
export const WIJZERS = RUW.map(([nr, categorie, naam, kenmerken, zones]) => {
  const [element, ...rest] = naam.split(': ');
  return { nr, categorie, naam, element, schadebeeld: rest.join(': ') || naam, kenmerken, zones };
});
export const wijzer = (nr) => WIJZERS.find((w) => w.nr === Number(nr)) ?? null;

/** Inspectiewijzers die bij een zone passen (plus 'gehele kering'). */
export function wijzersVoorZone(zone) {
  if (!zone) return WIJZERS;
  const z = [zone, ...(ZONE_BIJ[zone] ?? [])];
  return WIJZERS.filter((w) => w.zones.includes('gehele kering') || w.zones.some((x) => z.includes(x)));
}

// Bijlage D: keuzelijsten bij de schadeparameters.
const L = {
  breedte: ['< 25 cm', '25 - 50 cm', '50 - 100 cm', '> 100 cm'],
  diepte: ['< 10 cm', '10 - 25 cm', '25 - 50 cm', '> 50 cm'],
  lengte: ['< 50 cm', '50 - 100 cm', '100 - 250 cm', '250 - 500 cm', '> 500 cm'],
  patroon: ['enkele locatie', 'meerdere locaties', 'gehele vak', 'craquelé'],
  aard: ['vocht', 'verzakking', 'vorst', 'erosie', 'veroudering'],
  status: ['oeverlijn vervormt', 'oeverlijn vervormt niet'],
  vervorming: ['afvoermogelijkheid', 'opbarsting', 'opbolling', 'vergraving', 'verzakking'],
  begroeiing: ['riet', 'gras', 'mos', 'lage planten', 'houtopslag'],
  kabels: ['kabel', 'leiding'],
  onkruid: ['distels', 'hoefblad', 'mos', 'overig'],
  vee: ['schuurplek', 'looppadjes', 'vertrapt terrein'],
  oppervlakte: ['< 1 m²', '1 - 5 m²', '5 - 10 m²', '10 - 15 m²', '> 15 m²'],
  richting: ['langs', 'dwars', 'diagonaal'],
  oorzaakVee: ['eenden / ganzen', 'paarden', 'runderen', 'schapen', 'overig'],
  oorzaakGraverij: ['bever', 'beverrat', 'konijn', 'mens', 'mol', 'muskusrat', 'rat', 'vos', 'overig'],
  kammend: ['kamt niet, (her)zetwerk ≤ 10 jaar oud', 'kamt niet, (her)zetwerk > 10 jaar oud', 'begint te kammen < 5 cm', 'kamt matig 0 - 5 cm', 'kamt sterk voorover > 5 cm'],
  los: ['geen losse zuilen, (her)zetwerk ≤ 10 jaar oud', 'geen losse zuilen, (her)zetwerk > 10 jaar oud', 'enkele losse zuilen', 'her en der losse zuilen (10 - 20 stuks)', 'veel losse zuilen (> 20 stuks)'],
  inwasgrind: ['bk grind = bk zetwerk', 'bk grind hoger dan 2/3 van zuilhoogte en lager dan zetwerk', 'bk grind lager dan 2/3 van zuilhoogte', 'bk grind lager dan de helft van de zuilhoogte', 'geen grind meer tussen de zuilen'],
  stroming: ['stroomt', 'stroomt niet'],
  zand: ['voert zand mee', 'voert geen zand mee'],
  janee: ['ja', 'nee'],
};

/** Keuzelijst voor een schadeparameter van een inspectiewijzer (null = vrije invoer). */
export function keuzelijst(nr, kenmerk) {
  const k = String(kenmerk).toLowerCase();
  if (Number(nr) === 53 || k === 'bekende plek') return L.janee;
  if (k === 'diepte beworteling' || k === 'diepte en grootte van de kuil') return null;
  if (/breedte$/.test(k)) return L.breedte;
  if (/diepte$/.test(k)) return L.diepte;
  if (/lengte$/.test(k)) return L.lengte;
  if (/patroon/.test(k)) return L.patroon;
  if (k === 'aard') return L.aard;
  if (k === 'status') return [26, 29].includes(Number(nr)) ? L.inwasgrind : L.status;
  if (k === 'soort vervorming') return L.vervorming;
  if (k === 'soort') return Number(nr) === 12 ? L.vee : Number(nr) === 13 ? L.vervorming : L.begroeiing;
  if (k === 'soort object') return L.kabels;
  if (k === 'onkruidsoort') return L.onkruid;
  if (k === 'oppervlakte') return L.oppervlakte;
  if (k === 'richting' || k === 'orientatie') return L.richting;
  if (k === 'oorzaak') return Number(nr) === 12 ? L.oorzaakVee : L.oorzaakGraverij;
  if (k === 'kammend zetwerk') return L.kammend;
  if (k === 'los zetwerk') return L.los;
  if (k === 'uittredend water') return L.stroming;
  if (k === 'zand meevoerend') return L.zand;
  return null;
}

/** Urgentie per waarneming (operationeel deel, § 3.1.6.2). nen = urgentie in het maatregelenoverzicht. */
export const URGENTIE = {
  groen: { label: 'Groen', uitleg: 'Geen directe actie; meenemen in de meerjarenplanning onderhoud.', kleur: '#1a7f37', rang: 1, nen: 'monitoren' },
  oranje: { label: 'Oranje', uitleg: 'Wel actie, geen direct gevaar: binnen 3 maanden actie door beheer.', kleur: '#e07b00', rang: 2, nen: '3maanden' },
  rood: { label: 'Rood', uitleg: 'Direct gevaar voor het kerend vermogen: direct melden aan de beheerder.', kleur: '#c62828', rang: 3, nen: 'direct' },
};

/** Classificatie van maatregelen in toenemende ernst (operationeel deel, voetnoot 7). */
export const MAATREGELSOORTEN = ['Monitoren', 'Verbeteren', 'Reconstrueren'];

/** Zwaarste urgentie van een inspectie ('' = geen waarnemingen). */
export function zwaarste(waarnemingen = []) {
  return waarnemingen.reduce((z, w) => ((URGENTIE[w.urgentieKleur]?.rang ?? 0) > (URGENTIE[z]?.rang ?? 0) ? w.urgentieKleur : z), '');
}

/** Controle vóór afronden. */
export function controleer(s) {
  const f = [];
  if (!s.kering) f.push('Kies het type kering.');
  (s.waarnemingen ?? []).forEach((w, i) => {
    const n = `Waarneming ${i + 1}`;
    if (!w.zone) f.push(`${n}: kies de zone.`);
    if (w.aard === 'handhaving' ? !String(w.omschrijving ?? '').trim() : !(w.wijzer || w.digigids)) f.push(`${n}: ${w.aard === 'handhaving' ? 'omschrijf de handhavingszaak' : 'kies het schadebeeld'}.`);
    if (!w.urgentieKleur) f.push(`${n}: kies de urgentie (groen, oranje of rood).`);
    if (w.urgentieKleur === 'rood' && !(w.fotos?.length || w.fotoIds?.length)) f.push(`${n}: maak bij urgentie rood een foto.`);
  });
  return f;
}

/** Waarneming in de vorm die maatregelenoverzicht, taken en werkzaamheden gebruiken. */
export function alsGebrek(w) {
  const wz = wijzer(w.wijzer);
  const dg = !wz && w.digigids ? DG.schadebeeld(w.digigids) : null;
  return {
    ...w,
    bouwdeel: [wz?.element ?? dg?.element ?? (w.aard === 'handhaving' ? 'Handhaving' : ''), w.zone].filter(Boolean).join(' · '),
    gebrek: w.aard === 'handhaving' ? (w.omschrijving ?? '') : (wz?.schadebeeld ?? dg?.naam ?? ''),
    urgentie: w.maatregel || w.urgentieKleur !== 'groen' ? (URGENTIE[w.urgentieKleur]?.nen ?? '') : '',
  };
}

/** Naam van het schadebeeld van een waarneming (inspectiewijzer of Digigids). */
export function schadebeeldNaam(w) {
  if (w.aard === 'handhaving') return `Handhaving: ${w.omschrijving ?? ''}`;
  const wz = wijzer(w.wijzer);
  if (wz) return wz.naam;
  const dg = w.digigids ? DG.schadebeeld(w.digigids) : null;
  return dg ? `${dg.element}: ${dg.naam}` : 'Schadebeeld';
}

/** Alle gebrek-achtige records van een inspectie (NEN-gebreken, BVC-maatregelen, STOWA-waarnemingen). */
export function gebrekItems(insp) {
  return [...(insp?.gebreken ?? []), ...(insp?.bvc?.maatregelen ?? []), ...(insp?.stowa?.waarnemingen ?? [])];
}
