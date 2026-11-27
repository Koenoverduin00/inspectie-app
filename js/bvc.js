// Boomveiligheidscontrole (BVC) volgens het Boomveiligheidsprotocol Rijkswaterstaat
// (Loo Plan, 30 oktober 2019, status definitief) en het CROW Standaard
// Uitwisselingsformaat (SUF-BVC). Paragraafnummers verwijzen naar dat protocol.
import { rdNaarWgs84 } from './gis.js';

export const BVC_SOORT = 'Boomveiligheidscontrole';

// § 4.5, tabel 1 – omgevingsrisicoklasse (ORK)
export const ORK = {
  Geen: { label: 'Geen', jaren: 6, uitleg: 'Buiten valafstand (> ca. 30 m van kant asfalt/objecten); 6-jaarlijkse bureau-analyse.' },
  Laag: { label: 'Laag', jaren: 6, uitleg: 'Binnen valafstand, maar (tijdelijk) geen of verwaarloosbare schade, of zeer lage kans (bijv. schouwpad).' },
  Midden: { label: 'Midden', jaren: 3, uitleg: 'Binnen valafstand; kan in potentie schade aan personen of objecten toebrengen ((half)volwassen gezonde bomen).' },
  Hoog: { label: 'Hoog', jaren: 1, uitleg: 'Binnen valafstand met hogere kans op schade (bijv. populier, wilg, bomen > 80 jaar, attentiebomen).' },
};

// § 6.3.3, tabel 2 – boomveiligheidsklasse (BVK)
export const BVK = {
  geen: { label: 'Boom zonder gebreken', kort: 'Geen gebreken', kleur: '#1a7f37' },
  attentie: { label: 'Attentieboom', kort: 'Attentieboom', kleur: '#c9a400' },
  risico: { label: 'Risicoboom', kort: 'Risicoboom', kleur: '#d1452f' },
  risicoattentie: { label: 'Risico- en attentieboom', kort: 'Risico + attentie', kleur: '#8b1a1a' },
};

export const CONTROLEFREQUENTIE = { 1: 'Jaarlijks', 3: '3-jaarlijks', 6: '6-jaarlijks' };

/** Controlefrequentie in jaren volgens tabel 1 en 2 (attentiebomen altijd jaarlijks). */
export function frequentie(bvk, ork) {
  if (bvk === 'attentie' || bvk === 'risicoattentie') return 1;
  return ORK[ork]?.jaren ?? 1;
}

// Bijlage 2 – opnamekenmerken boomgebrek
export const PLAATS = ['Kroon', 'Stam', 'Stamvoet', 'Maaiveld'];
export const GEVOLG = ['Takbreuk', 'Stambreuk', 'Instabiliteit'];

// Bijlage 3 – uitwerking boomgebrek (type → omschrijvingen)
export const GEBREKEN = {
  Algemeen: ['Hinderlijke takken', 'Scheefstand', 'Afgestorven boom', 'Onbalans lengte-diameterverhouding', 'Boomband ingegroeid', 'Overig, zie opmerking'],
  'Probleem maaiveld': ['Grondscheuren', 'Kantelende kluit', 'Onderspoeling', 'Opgebrachte grond', 'Graafschade', 'Wortelopdruk', 'Probleem maaiveld overig, zie opmerking'],
  'Mechanisch defect': ['Afgestorven tak', 'Afstervingsverschijnselen', 'Beschadigd bastweefsel', 'Afgestorven bast', 'Blikseminslag',
    'Draai/torsiegroei', 'Elleboogtak', 'Gebroken/losse tak', 'Holte', 'Houtscheur', 'Ingerotte snoeiwond(en)', 'Ingevallen zone',
    'Klankafwijking', 'Mechanische overbelasting', 'Plakoksel', 'Rib', 'Rotting', 'Schuurtak', 'Spechtengat', 'Ent/onderstamprobleem',
    'Vezelknik', 'Mechanisch defect overig, zie opmerking'],
  Insect: ['Eikenprachtkever', 'Eikenspintkever', 'Essenbastkever', 'Grote populierenboktor', 'Horzelvlinder', 'Wilgenhoutrups', 'Insect overig, zie opmerking'],
  'Ziekte/bacterie': ['Bastwoekering', 'Bacterievuur', 'Bastwoekerziekte', 'Bloedingen', 'Essentaksterfte', 'Kastanjebloedingsziekte',
    'Verwelkingsziekte', 'Watermerkziekte', 'Iepziekte', 'Ziekte/bacterie overig, zie opmerking'],
  Zwam: ['Berkenzwam', 'Biefstukzwam', 'Dennevoetzwam', 'Dikrandtonderzwam', 'Echte honingzwam', 'Echte tonderzwam', 'Echte vuurzwam',
    'Eikhaas', 'Fluweelpootje', 'Gesteelde lakzwam', 'Gewone oesterzwam', 'Gewoon elfenbankje', 'Goudvliesbundelzwam', 'Korsthoutskoolzwam',
    'Paarse korstzwam', 'Massaria', 'Platte tonderzwam', 'Porseleinzwam', 'Reuzenzwam', 'Ruige weerschijnzwam', 'Schubbige bundelzwam',
    'Sombere honingzwam', 'Waslakzwam', 'Zadelzwam', 'Zwavelzwam', 'Zwam overig, zie opmerking'],
};

/** Type bij een gebrek (automatisch, bijlage 2). */
export function gebrekType(omschrijving) {
  return Object.entries(GEBREKEN).find(([, lijst]) => lijst.includes(omschrijving))?.[0] ?? '';
}

// Gebreken die bruikbaarheid betreffen en geen boomveiligheid (§ 6.3.2)
export const BRUIKBAARHEID = ['Hinderlijke takken', 'Wortelopdruk'];

// Bijlage 2 – boomveiligheidsmaatregelen en urgentie (§ 6.3.4)
export const MAATREGELEN = ['Boom verwijderen', 'Veiligheidssnoei', 'Nader onderzoek', 'Boomband verwijderen', 'Opdruk verharding verhelpen'];
export const URGENTIE = {
  acuut: { label: 'Acuut (binnen 48 uur)', uren: 48 },
  '3maanden': { label: 'Binnen 3 maanden', maanden: 3 },
};

// § 6.1 – deskundigheid controleur en controlemethoden
export const KWALIFICATIES = ['ETW (European Tree Worker)', 'ETT (European Tree Technician)', 'Gecertificeerd boomveiligheidscontroleur', 'Gelijkwaardig'];
export const METHODEN = ['VTA', 'IBA', 'SIA', 'Anders'];

// Bijlage 2 – soort bij gesloten beplanting zonder uniforme boomsoort
export const GB_SOORTEN = ['Loofboomsoorten', 'Naaldboomsoorten', 'Gemengd loof en naald'];

// Bijlage 8 – naamlijst boomsoorten in areaal Rijkswaterstaat [wetenschappelijk, Nederlands]
export const BOOMSOORTEN = [
  ["Acer campestre", "Spaanse aak (incl. cultivars)"],
  ["Acer negundo", "Vederesdoorn"],
  ["Acer platanoides", "Noorse esdoorn (incl. cultivars)"],
  ["Acer pseudoplatanus", "Gewone esdoorn (incl. cultivars)"],
  ["Aesculus hippocastanum", "Witte paardenkastanje (incl. cultivars)"],
  ["Aesculus x carnea 'Briotii'", "Rode paardenkastanje 'Briotii'"],
  ["Alnus cordata", "Hartbladige els"],
  ["Alnus glutinosa", "Zwarte els (incl. cultivars)"],
  ["Alnus incana", "Witte els"],
  ["Alnus x spaethii", "Els spaethii of spaeth"],
  ["Amelanchier lamarckii", "Amerikaans krentenboompje"],
  ["Betula pendula", "Ruwe berk"],
  ["Betula pubescens", "Zachte berk"],
  ["Carpinus betulus", "Haagbeuk (incl. cultivars)"],
  ["Castanea sativa", "Tamme kastanje"],
  ["Cedrus libani", "Ceder"],
  ["Cornus controversa", "Reuzenkornoelje"],
  ["Cornus mas", "Gele kornoelje"],
  ["Corylus avellana", "Hazelaar"],
  ["Corylus colurna", "Boomhazelaar"],
  ["Crataegus laevigata", "Tweestijlige meidoorn (incl. cultivars)"],
  ["Crataegus monogyna", "Eenstijlige meidoorn (incl. cultivars)"],
  ["Fagus sylvatica", "Beuk (incl. cultivars)"],
  ["Fagus sylvatica 'Atropunicea'", "Rode beuk"],
  ["Fraxinus excelsior", "Es"],
  ["Fraxinus ornus", "Pluimes"],
  ["Ginkgo biloba", "Ginkgo"],
  ["Ilex aquifolium", "Hulst"],
  ["Juglans nigra", "Zwarte walnoot"],
  ["Juglans regia", "Okkernoot"],
  ["Larix decidua", "Larix / Europese lork"],
  ["Magnolia species", "Magnolia (vele soorten)"],
  ["Malus domestica", "Appel (incl. cultivars)"],
  ["Malus floribunda", "Sierappel"],
  ["Picea abies", "Fijnspar"],
  ["Pinus sylvestris", "Grove den"],
  ["Platanus hispanica", "Plataan"],
  ["Populus alba", "Witte abeel"],
  ["Populus nigra", "Zwarte populier (incl. cultivars)"],
  ["Populus nigra 'Italica'", "Italiaanse populier"],
  ["Populus nigra 'Vereecken'", "Zwarte populier 'Vereecken'"],
  ["Populus tremula", "Ratelpopulier"],
  ["Populus x canadensis 'Agathe F.'", "Canadapopulier 'Agathe F.'"],
  ["Populus x canadensis 'Ellert'", "Canadapopulier 'Ellert'"],
  ["Populus x canadensis 'Gelrica'", "Canadapopulier 'Gelrica'"],
  ["Populus x canadensis 'Grimminge'", "Canadapopulier 'Grimminge'"],
  ["Populus x canadensis 'Koster'", "Canadapopulier 'Koster'"],
  ["Populus x canadensis 'Marilandica'", "Canadapopulier 'Marilandica'"],
  ["Populus x canadensis 'Muur'", "Canadapopulier 'Muur'"],
  ["Populus x canadensis 'Robusta'", "Canadapopulier 'Robusta'"],
  ["Populus x canadensis", "Canadapopulier (incl. cultivars)"],
  ["Populus x canescens", "Grauwe abeel (incl. cultivars)"],
  ["Prunus avium", "Zoete kers (incl. cultivars)"],
  ["Prunus cerasifera", "Kerspruim (incl. cultivars)"],
  ["Prunus domestica", "Pruim (incl. cultivars)"],
  ["Prunus padus", "Gewone vogelkers"],
  ["Prunus serotina", "Amerikaanse vogelkers"],
  ["Prunus serrulata", "Japanse sierkers"],
  ["Prunus spinosa", "Sleedoorn"],
  ["Pseudotsuga menziesii", "Douglasspar"],
  ["Pterocarya fraxinifolia", "Kaukasische vleugelnoot"],
  ["Pyrus calleryana 'Chanticleer'", "Callerypeer"],
  ["Pyrus communis", "Peer (incl. cultivars)"],
  ["Quercus cerris", "Moseik"],
  ["Quercus palustris", "Moeraseik"],
  ["Quercus petraea", "Wintereik"],
  ["Quercus robur", "Zomereik"],
  ["Quercus rubra", "Amerikaanse eik"],
  ["Rhamnus frangula", "Sporkenhout"],
  ["Robinia pseudacacia", "Robinia"],
  ["Rosa canina", "Hondsroos"],
  ["Rosa rugosa", "Rimpelroos"],
  ["Salix alba knot", "Knotwilg (incl. cultivars; geknotte vorm van Schietwilg: knotwilg)"],
  ["Salix alba boom", "Schietwilg (incl. cultivars)"],
  ["Salix aurita", "Geoorde wilg"],
  ["Salix caprea", "Boswilg"],
  ["Salix cinerea", "Grauwe wilg"],
  ["Salix pentandra", "Laurierwilg"],
  ["Salix purpurea", "Bittere wilg"],
  ["Salix species", "Wilg (ongespecificeerd)"],
  ["Salix x babylonica 'Tortuosa'", "Kronkelwilg"],
  ["Salix x sepulcralis 'Chrysocoma'", "Treurwilg"],
  ["Sambucus nigra", "Gewone vlier"],
  ["Sorbus aria", "Meelbes (incl. cultivars)"],
  ["Sorbus aucuparia", "Wilde lijsterbes"],
  ["Sorbus intermedia", "Zweedse lijsterbes"],
  ["Syringa vulgaris", "Sering"],
  ["Taxodium distichum", "Moerascypres"],
  ["Thuja species", "Levensboom (ongespecificeerd)"],
  ["Tilia cordata", "Winterlinde (incl. cultivars)"],
  ["Tilia platyphyllos", "Zomerlinde"],
  ["Tilia species", "Linde (ongespecificeerd)"],
  ["Tilia tomentosa", "Zilverlinde (incl. cultivars)"],
  ["Tilia x euchlora", "Krimlinde"],
  ["Tilia x vulgaris", "Hollandse linde"],
  ["Tsuga heterophylla", "Westelijke hemlockspar"],
  ["Ulmus glabra (incl. cultivars)", "Ruwe iep"],
  ["Ulmus laevis", "Fladderiep"],
  ["Ulmus minor", "Gladde iep"],
  ["Ulmus 'New Horizon'", "Iep 'New Horizon'"],
  ["Ulmus species", "Iep (ongespecificeerd)"],
  ["Ulmus x hollandica", "Hollandse iep"],
  ["Viburnum opulus", "Gelderse roos"]
];

/** Uiterste datum voor een maatregel (acuut: 48 uur na signalering; anders 3 maanden). */
export function uitvoerenVoor(urgentie, datum) {
  const d = new Date(`${datum}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  if (urgentie === 'acuut') { d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); }
  // 3 maanden later; bestaat die dag niet (bijv. 30 november → februari), dan de laatste dag van die maand.
  const dag = d.getUTCDate();
  const doel = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1, 12));
  const laatste = new Date(Date.UTC(doel.getUTCFullYear(), doel.getUTCMonth() + 1, 0)).getUTCDate();
  doel.setUTCDate(Math.min(dag, laatste));
  return doel.toISOString().slice(0, 10);
}

/** Bijzondere boom (bijlage 7) op basis van de stamdiameter (dbh, cm) en standplaats. */
export function bijzondereBoomHint(dbh) {
  const d = Number(dbh);
  if (!(d > 0)) return '';
  if (d > 90) return 'Extreme afmetingen (> 90 cm dbh): bijzondere boom volgens bijlage 7.';
  if (d > 40) return 'Dikker dan 40 cm dbh: mogelijk bijzondere boom (solitair, in rij met gat > 5 bomen na kap, of vormbepalend in groep).';
  return '';
}

/** Is de controledatum binnen de voorgeschreven periode juli t/m november (§ 6.1)? */
export function inControleperiode(datum) {
  const m = Number(String(datum).slice(5, 7));
  return m >= 7 && m <= 11;
}

/** Controle op volledigheid en samenhang van een BVC-registratie. Geeft meldingen terug. */
export function controleer(b) {
  const fouten = [];
  if (!b.controleur) fouten.push('Vul de naam van de controleur in (INSP).');
  if (!b.kwalificatie) fouten.push('Kies de kwalificatie van de controleur (ETW, ETT, gecertificeerd of gelijkwaardig).');
  if (b.niet) return fouten; // niet aangetroffen boom: verder niets verplicht
  if (!b.soort) fouten.push('Kies de boomsoort (SOORT).');
  if (!ORK[b.ork]) fouten.push('Kies de omgevingsrisicoklasse (ORK).');
  if (!BVK[b.bvk]) fouten.push('Kies de boomveiligheidsklasse (BVK).');
  const gebreken = b.gebreken ?? [];
  const maatregelen = b.maatregelen ?? [];
  gebreken.forEach((g, i) => {
    if (!g.omschrijving) fouten.push(`Gebrek ${i + 1}: kies het gebrek.`);
    if (!PLAATS.includes(g.plaats)) fouten.push(`Gebrek ${i + 1}: kies de plaats (kroon, stam, stamvoet, maaiveld).`);
    if (!GEVOLG.includes(g.gevolg)) fouten.push(`Gebrek ${i + 1}: kies het gevolg (takbreuk, stambreuk, instabiliteit).`);
  });
  maatregelen.forEach((m, i) => {
    if (!MAATREGELEN.includes(m.bvcMaatregel)) fouten.push(`Maatregel ${i + 1}: kies de maatregel.`);
    if (!URGENTIE[m.termijn]) fouten.push(`Maatregel ${i + 1}: kies de urgentie (acuut of binnen 3 maanden).`);
  });
  const veiligheidsgebreken = gebreken.filter((g) => !BRUIKBAARHEID.includes(g.omschrijving));
  if (b.bvk === 'geen' && veiligheidsgebreken.length) fouten.push('Een boom zonder gebreken kan geen boomgebreken hebben; kies attentie- of risicoboom.');
  if (b.bvk && b.bvk !== 'geen' && !veiligheidsgebreken.length) fouten.push('Leg minimaal één boomgebrek vast bij een attentie- of risicoboom.');
  if ((b.bvk === 'risico' || b.bvk === 'risicoattentie') && !maatregelen.length) fouten.push('Een risicoboom vereist een maatregel.');
  if (maatregelen.some((m) => m.bvcMaatregel === 'Boom verwijderen') && !b.gemarkeerd) {
    fouten.push('Te vellen bomen worden direct in het veld gemarkeerd met een oranje streep (blesverf); vink dit aan.');
  }
  if (b.gb && !(Number(b.aantalBomen) > 0)) fouten.push('Vul bij een gesloten beplanting het aantal bomen in.');
  return fouten;
}

/**
 * Samenhang tussen omgevingsrisicoklasse (ORK, de plek) en boomveiligheidsklasse (BVK, de boom): adviezen, geen blokkades.
 *  - Risicoboom kan bij elke ORK binnen valafstand (ook Laag: na de maatregel 6-jaarlijks, tabel 2).
 *  - Attentiebomen vallen volgens tabel 1 onder ORK Hoog (controle jaarlijks).
 *  - ORK Geen = buiten valafstand: alleen 6-jaarlijkse bureau-analyse, geen veldopname (tabel 1).
 * @returns {{ niveau: 'let'|'info', tekst: string }[]}
 */
export function samenhang(b) {
  const uit = [];
  if (!b || b.niet) return uit;
  const attentie = b.bvk === 'attentie' || b.bvk === 'risicoattentie';
  if (b.ork === 'Geen' && b.bvk) {
    uit.push({ niveau: 'let', tekst: 'ORK Geen betekent: buiten valafstand (> ca. 30 m). Zulke bomen worden alleen in de 6-jaarlijkse bureau-analyse bekeken, niet in het veld opgenomen (tabel 1). Staat de boom binnen valafstand, kies dan Laag, Midden of Hoog.' });
  }
  if (attentie && (b.ork === 'Laag' || b.ork === 'Midden')) {
    uit.push({ niveau: 'let', tekst: `Attentiebomen vallen volgens tabel 1 onder ORK Hoog (jaarlijkse controle). Overweeg ORK Hoog in plaats van ${b.ork}.` });
  }
  if (b.gb && attentie) {
    uit.push({ niveau: 'let', tekst: 'In gesloten beplanting worden geen attentiebomen onderscheiden (tabel 2): een gevaarzettende boom wordt geveld. Kies Risicoboom met maatregel "Boom verwijderen", of Boom zonder gebreken.' });
  }
  if ((b.maatregelen ?? []).some((m) => m.bvcMaatregel === 'Nader onderzoek') && !b.bijzonder) {
    uit.push({ niveau: 'let', tekst: 'Nader onderzoek wordt bij RWS als regel niet toegepast, alleen bij bijzondere bomen (§ 6.3.2, bijlage 7). Vink "Bijzondere boom" aan of kies een andere maatregel.' });
  }
  if (b.bvk === 'risico' && b.ork === 'Laag') {
    uit.push({ niveau: 'info', tekst: 'Risicoboom bij ORK Laag kan: de maatregel blijft nodig (binnen 3 maanden, acuut binnen 48 uur). Daarna wordt het een boom zonder gebreken met 6-jaarlijkse controle (tabel 2).' });
  }
  return uit;
}

// ---------------------------------------------------------------------------
// Basisgegevens uit het GIS-bestand of de decompositie (§ 6.2: eenmalig ingevuld, bij elke controle geverifieerd).
// Per BVC-werkpakket stelt de beheerder één keer in uit welke kolom boomsoort, plantjaar, stamdiameter en ORK komen.
// Een bron is 'gis:<kolom>' (kenmerk van het GIS-object) of 'decomp:<kolom>' (kolom uit de ingelezen decompositie,
// van het gekoppelde onderdeel of de onderdelen erboven).
// ---------------------------------------------------------------------------
export const BASIS_VELDEN = {
  soort: { label: 'Boomsoort (SOORT)', hint: /^(boomsoort|soort|soortnaam|latijnse_?naam|wetenschappelijke_?naam|species|taxon|boomsoort_?lat|sortiment)$/i },
  plantjaar: { label: 'Plantjaar (JAAR)', hint: /^(plantjaar|aanlegjaar|jaar_?aanleg|plant_?jaar|jaar|aanleg)$/i },
  dbh: { label: 'Stamdiameter (cm)', hint: /^(dbh|diameter|stamdiameter|stamdiam|diam|stam_?diameter|diameter_?cm|stamdikte)$/i },
  ork: { label: 'Omgevingsrisicoklasse (ORK)', hint: /^(ork|omgevingsrisico(klasse)?|risicoklasse)$/i },
};

const leeg = (v) => v === null || v === undefined || typeof v === 'object' || String(v).trim() === '';

/** Ruwe waarde uit een bron voor één boom. @param {object[]} decKetting gekoppeld onderdeel en de onderdelen erboven */
export function bronWaarde(object, decKetting, bron) {
  if (!bron) return '';
  const [soort, ...rest] = String(bron).split(':');
  const kolom = rest.join(':');
  if (soort === 'gis') { const v = object?.kenmerken?.[kolom]; return leeg(v) ? '' : String(v).trim(); }
  if (soort === 'decomp') {
    for (const k of decKetting ?? []) { const v = k?.kenmerken?.[kolom]; if (!leeg(v)) return String(v).trim(); }
  }
  return '';
}

/** Boomsoort uit een vrije waarde: Latijnse of Nederlandse naam uit de RWS-naamlijst (bijlage 8), anders de waarde zelf. */
export function soortUit(ruw) {
  const v = String(ruw ?? '').trim();
  if (!v) return '';
  const l = v.toLowerCase();
  const hit = BOOMSOORTEN.find(([w, n]) => w.toLowerCase() === l || n.toLowerCase() === l || n.toLowerCase().startsWith(`${l} (`));
  return hit ? hit[0] : v;
}
export const jaarUit = (ruw) => { const m = String(ruw ?? '').match(/\b(1[6-9]\d\d|20\d\d|2100)\b/); return m ? m[1] : ''; };
export const dbhUit = (ruw) => { const n = Number(String(ruw ?? '').replace(',', '.').replace(/[^\d.]/g, '')); return n > 0 ? String(Math.round(n)) : ''; };
export const orkUit = (ruw) => ({ geen: 'Geen', laag: 'Laag', midden: 'Midden', hoog: 'Hoog' }[String(ruw ?? '').trim().toLowerCase()] ?? '');
const OMZET = { soort: soortUit, plantjaar: jaarUit, dbh: dbhUit, ork: orkUit };

/** Basisgegevens van één boom volgens de instellingen: { soort, plantjaar, dbh, ork } met per veld de bron. */
export function basisUitBronnen(object, decKetting, inst = {}) {
  const uit = {};
  const bron = {};
  for (const veld of Object.keys(BASIS_VELDEN)) {
    const w = OMZET[veld](bronWaarde(object, decKetting, inst[veld]));
    if (w) { uit[veld] = w; bron[veld] = inst[veld]; }
  }
  return { waarden: uit, bron };
}

/** Raadt per basisveld een bron uit de beschikbare kolommen (GIS eerst, dan decompositie). */
export function raadBronnen(gisKolommen = [], decKolommen = []) {
  const uit = {};
  for (const [veld, { hint }] of Object.entries(BASIS_VELDEN)) {
    const g = gisKolommen.find((k) => hint.test(k));
    const d = decKolommen.find((k) => hint.test(k));
    uit[veld] = g ? `gis:${g}` : d ? `decomp:${d}` : '';
  }
  return uit;
}

/** Leesbare naam van een bron. */
export const bronTekst = (bron) => {
  if (!bron) return '';
  const [s, ...r] = String(bron).split(':');
  return `${s === 'gis' ? 'GIS-kolom' : 'decompositie'} "${r.join(':')}"`;
};

/** FOTO voor de SUF (bijlage 4: bij export in te vullen): de fotonamen van deze boom, max. 60 tekens. */
export function fotoVeld(code, aantal) {
  if (!(aantal > 0)) return '';
  const namen = Array.from({ length: aantal }, (_, n) => `${code}_${n + 1}`);
  let uit = '';
  for (const x of namen) { const volgende = uit ? `${uit};${x}` : x; if (volgende.length > 60) break; uit = volgende; }
  return uit;
}

/** WGS84 → RD New (inverse van rdNaarWgs84 met Newton-iteratie, nauwkeurig op < 1 cm t.o.v. die formule). */
export function wgs84NaarRd(lng, lat) {
  let x = 155000 + (lng - 5.387206) * 68000;
  let y = 463000 + (lat - 52.15517) * 111200;
  for (let i = 0; i < 8; i++) {
    const [l0, b0] = rdNaarWgs84(x, y);
    const [lx, bx] = rdNaarWgs84(x + 1, y);
    const [ly, by] = rdNaarWgs84(x, y + 1);
    const a = lx - l0; const b = ly - l0; const c = bx - b0; const d = by - b0;
    const det = a * d - b * c;
    const dl = lng - l0; const db = lat - b0;
    x += (d * dl - b * db) / det;
    y += (-c * dl + a * db) / det;
  }
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

/** KEY voor de SUF: de sleutel van RWS uit het GIS-bestand (bijlage 4: niet muteren), anders de eigen id. */
export function sufKey(o) {
  const k = Object.keys(o?.kenmerken ?? {}).find((x) => /^(key|guid|bvc_?key)$/i.test(x));
  const v = k ? String(o.kenmerken[k] ?? '').trim() : '';
  return v || o?.id || '';
}

const jjjjmmdd = (iso) => String(iso ?? '').slice(0, 10).replaceAll('-', '');

/**
 * Rijen voor het Standaard Uitwisselingsformaat (bijlage 4): boom, boomgebreken en maatregelen.
 * @param {{ object: object, inspectie: object }[]} lijst
 */
export function sufRijen(lijst, { eigenaar = '' } = {}) {
  const bomen = [['KEY', 'X', 'Y', 'EIG', 'SOORT', 'JAAR', 'ORK', 'CONFREQ', 'INSP', 'DATUM', 'BVK', 'NIET', 'GB', 'OPMERK', 'FOTO']];
  const gebreken = [['KEY', 'datum', 'omschrijving', 'type', 'plaats', 'gevolg']];
  const maatregelen = [['KEY', 'datum', 'bvcmaatregel', 'urgentie']];
  for (const { object: o, inspectie: i } of lijst) {
    const b = i.bvc ?? {};
    const lat = parseFloat(o.lat); const lng = parseFloat(o.lng);
    const [x, y] = Number.isFinite(lat) && Number.isFinite(lng) ? wgs84NaarRd(lng, lat) : ['', ''];
    const datum = jjjjmmdd(i.datum);
    const opmerking = [b.opmerking, b.gb && b.aantalBomen ? `${b.aantalBomen} bomen` : ''].filter(Boolean).join('; ');
    const fotos = (i.fotoIds?.length ?? 0) + (b.gebreken ?? []).reduce((t, g) => t + (g.fotoIds?.length ?? 0), 0);
    const key = sufKey(o);
    bomen.push([key, x, y, b.eigenaar || eigenaar || o.beheerder || '', b.soort ?? '', b.plantjaar ?? '', b.ork ?? '', CONTROLEFREQUENTIE[frequentie(b.bvk, b.ork)] ?? '',
      i.inspecteur ?? b.controleur ?? '', datum, BVK[b.bvk]?.label ?? '', b.niet ? 'X' : '', b.gb ? 'X' : '', opmerking.slice(0, 255), fotoVeld(o.code || o.id, fotos) || (b.fotonummer ?? '')]);
    for (const g of b.gebreken ?? []) gebreken.push([key, datum, g.omschrijving, gebrekType(g.omschrijving), g.plaats, g.gevolg]);
    for (const m of b.maatregelen ?? []) maatregelen.push([key, datum, m.bvcMaatregel, m.termijn === 'acuut' ? 'Acuut' : 'Binnen 3 maanden']);
  }
  return { bomen, gebreken, maatregelen };
}
