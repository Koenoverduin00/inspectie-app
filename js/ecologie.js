// Flora- en fauna-vrijgave (veldcheck) volgens de Gedragscode Soortenbescherming
// Rijkswaterstaat 2025–2029 (Omgevingswet; Bal art. 11.45, 11.53, 11.59).
// De veldcheck is de controle direct voorafgaand aan de werkzaamheden op de actuele
// situatie van beschermde soorten en broedgevallen (begrippenlijst; werkproces stap 10/13),
// uitgevoerd, begeleid of gecoördineerd door de ecologisch deskundige Opdrachtnemer.

// § 4 / § 6.5.1 – activiteiten Beheer en Onderhoud (B&O)
export const ACTIVITEITEN_BO = [
  'B&O aan houtachtige vegetaties',
  'B&O aan kruidachtige vegetaties en onbegroeid terrein',
  'B&O aan wateren',
  'B&O aan gebouwen en infrastructurele bouw- en kunstwerken',
  'B&O aan waterbouwkundige kunstwerken',
  'B&O aan kleine voorzieningen en (vaar)wegmeubilair',
  'B&O aan wegen en verhardingen',
  'Veiligheidsbeheer specifieke soorten',
];

// § 5 / § 6.5.2 – kleinschalige Ruimtelijke Ingrepen (RI)
export const ACTIVITEITEN_RI = [
  'RI met grondwerkzaamheden',
  'RI houtachtige vegetatie',
  'RI kruidachtige vegetatie',
  'RI wateren',
  'RI bouw- en kunstwerken, gebouwen',
  'RI wegen en verhardingen',
  'RI overig (zie EWP)',
];

// Hoofdstuk 4/5 – soortgroepen
export const SOORTGROEPEN = ['Vaatplanten', 'Vleermuizen', 'Overige zoogdieren', 'Vogels', 'Amfibieën en reptielen', 'Vissen', 'Ongewervelden'];

export const WAARNEMINGTYPEN = [
  'Exemplaar / individu',
  'Nest in gebruik (broedgeval)',
  'Jaarrond beschermd nest',
  'Hol / burcht / vluchtpijp',
  'Verblijfplaats (bijv. vleermuizen)',
  'Groeiplaats (planten)',
  'Voortplantingswater',
  'Essentieel leefgebied',
  'Vliegroute / migratieroute',
  'Sporen (prenten, uitwerpselen, vraat)',
];

// § 3 – beschermingsregimes Omgevingswet
export const BESCHERMING = [
  'Vogelrichtlijn (VRL)',
  'Habitatrichtlijn bijlage IV / Bern / Bonn',
  'Andere soort Ow (nationaal beschermd)',
  'Landelijk/provinciaal vrijgesteld (zorgplicht)',
  'Niet beschermd (zorgplicht)',
  'Onbekend – deskundige beoordeelt',
];

export const BESLUIT = {
  vrij: { label: 'Vrijgegeven', kleur: '#1a7f37' },
  voorwaarden: { label: 'Vrijgegeven onder voorwaarden', kleur: '#c9a400' },
  niet: { label: 'Niet vrijgegeven', kleur: '#d1452f' },
};

export const DESKUNDIGHEID = {
  deskundige: 'Ecologisch deskundige (≥ 3 jaar ervaring met de soorten in het gebied, gebiedskennis, kennis Ow)',
  gedelegeerd: 'Medewerker onder aansturing van een ecologisch deskundige (min. certificaat flora en fauna niveau 2)',
};

// Zorgvuldig handelen: algemene maatregelen B&O (tabel 4.2) en vogels (tabel 4.13–4.16)
export const CONTROLES = [
  { id: 'bronnen', tekst: 'Bronnen geraadpleegd (NDFF, inventarisatiegegevens, EWP)' },
  { id: 'broed', tekst: 'Werkgebied gecontroleerd op broedgevallen en jaarrond beschermde nesten' },
  { id: 'verblijf', tekst: 'Gecontroleerd op verblijfplaatsen, holen en essentieel leefgebied' },
  { id: 'kwetsbaar', tekst: 'Kwetsbare periode van aanwezige soorten gecontroleerd (natuurkalender RVO / EWP)' },
  { id: 'markering', tekst: 'Nesten, holen en essentiële onderdelen gemarkeerd (kaart en/of veld)' },
  { id: 'afstand', tekst: 'Verstoringsvrije afstanden bepaald en doorgegeven' },
  { id: 'richting', tekst: 'Werkrichting zo dat mobiele dieren kunnen uitwijken' },
  { id: 'fasering', tekst: 'Gefaseerd werken (bijv. riet/ruigte max. 30% per jaar; hakhout max. 30% per element)' },
  { id: 'maaihoogte', tekst: 'Maaihoogte minimaal 10 cm waar vereist (amfibieën/reptielen)' },
  { id: 'instructie', tekst: 'Uitvoerders geïnstrueerd over maatregelen en het onverwacht aantreffen van soorten' },
];

export const LOGBOEKSOORTEN = ['Begeleiding', 'Bijzonderheid', 'Onverwacht aangetroffen soort', 'Afwijking van EWP', 'Incident / calamiteit'];

/** Status van een vrijgave op een datum: geldig, verlopen, nog niet geldig of afgewezen. */
export function geldigheid(v, datum) {
  if (!v || v.status !== 'afgerond') return 'concept';
  if (v.besluit === 'niet') return 'afgewezen';
  if (v.datum && datum < v.datum) return 'toekomst';
  if (v.geldigTot && datum > v.geldigTot) return 'verlopen';
  return 'geldig';
}

/** Meest relevante vrijgave voor een object op een datum (geldig gaat voor; anders de nieuwste). */
export function vrijgaveVoorObject(vrijgaven, objectId, datum) {
  const eigen = vrijgaven.filter((v) => (v.objectIds ?? [v.objectId]).includes(objectId) && v.status === 'afgerond')
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)) || String(b.gewijzigd).localeCompare(String(a.gewijzigd)));
  return eigen.find((v) => geldigheid(v, datum) === 'geldig') ?? eigen[0] ?? null;
}

/** Controle op volledigheid bij afronden. */
export function controleer(v) {
  const f = [];
  if (!(v.objectIds ?? []).length) f.push('Kies het object of GIS-vlak waarvoor de vrijgave geldt.');
  if (!v.werkzaamheid) f.push('Vul de geplande werkzaamheden in.');
  if (!v.activiteit) f.push('Kies de activiteit volgens de gedragscode (B&O of kleinschalige RI).');
  if (!v.datum) f.push('Vul de datum van de veldcheck in.');
  if (!v.deskundige) f.push('Vul de naam van de ecologisch deskundige in.');
  if (!v.deskundigheid) f.push('Geef de deskundigheid aan.');
  if (v.deskundigheid === 'gedelegeerd' && !v.aansturing) f.push('Vul in onder aansturing van welke ecologisch deskundige is gewerkt.');
  if (v.routeGedragscode && !v.ewpKenmerk) f.push('Vul het kenmerk van het ecologisch werkprotocol (EWP) in.');
  if (v.routeGedragscode && !v.ewpGeaccepteerd) f.push('Zonder door RWS geaccepteerd EWP mag niet gestart worden (stap 9).');
  if (!BESLUIT[v.besluit]) f.push('Kies het besluit: vrijgegeven, onder voorwaarden of niet vrijgegeven.');
  if (v.besluit === 'voorwaarden' && !String(v.voorwaarden ?? '').trim()) f.push('Beschrijf de voorwaarden van de vrijgave.');
  if (v.besluit !== 'niet' && !v.geldigTot) f.push('Vul in tot wanneer de vrijgave geldig is.');
  if (v.geldigTot && v.datum && v.geldigTot < v.datum) f.push('De geldigheid eindigt vóór de datum van de veldcheck.');
  (v.waarnemingen ?? []).forEach((w, i) => {
    if (!w.soortgroep) f.push(`Waarneming ${i + 1}: kies de soortgroep.`);
    if (!String(w.soort ?? '').trim()) f.push(`Waarneming ${i + 1}: vul de soort in.`);
    if (!w.type) f.push(`Waarneming ${i + 1}: kies wat is waargenomen.`);
  });
  const zwaar = (v.waarnemingen ?? []).some((w) => /Nest in gebruik|Jaarrond|Hol|Verblijfplaats/.test(w.type ?? ''));
  if (zwaar && v.besluit === 'vrij') f.push('Er zijn nesten, holen of verblijfplaatsen waargenomen: geef "onder voorwaarden" of "niet vrijgegeven" met maatregelen.');
  if (!v.verklaring) f.push('Bevestig de verklaring van de ecologisch deskundige.');
  return f;
}
