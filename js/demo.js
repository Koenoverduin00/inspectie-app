// Voorbeelddata om de app snel te kunnen uitproberen.
import { nieuwId } from './utils.js';

function datumGeleden(jaren, maanden = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - jaren, d.getMonth() - maanden);
  return d.toISOString().slice(0, 10);
}

export function demoData() {
  const nu = new Date().toISOString();
  const obj = (velden) => ({ id: nieuwId(), status: 'In gebruik', aangemaakt: nu, gewijzigd: nu, ...velden });
  const objecten = [
    obj({ code: 'KW-001', naam: 'Brug Oude Gracht', type: 'Brug (vast)', materiaal: 'Metselwerk', bouwjaar: 1912,
      beheerder: 'Gemeente – Team Kunstwerken', locatie: 'Oudegracht t.h.v. nr. 120', lat: 52.0907, lng: 5.1214,
      inspectieInterval: 6, lengte: 14, breedte: 9, notities: 'Rijksmonument; afstemming met erfgoed bij herstel.' }),
    obj({ code: 'KW-002', naam: 'Viaduct Ringweg Noord', type: 'Viaduct', materiaal: 'Voorgespannen beton', bouwjaar: 1974,
      beheerder: 'Gemeente – Team Kunstwerken', locatie: 'Ringweg Noord over spoorlijn', lat: 52.1054, lng: 5.1102,
      inspectieInterval: 3, lengte: 62, breedte: 18 }),
    obj({ code: 'KW-003', naam: 'Fietsbrug Parkzicht', type: 'Fietsbrug / voetgangersbrug', materiaal: 'Hout', bouwjaar: 2009,
      beheerder: 'Gemeente – Team Kunstwerken', locatie: 'Park Zuid, over hoofdwatergang', lat: 52.0755, lng: 5.1302,
      inspectieInterval: 3, lengte: 24, breedte: 3.5 }),
    obj({ code: 'DU-014', naam: 'Duiker Polderweg', type: 'Duiker', materiaal: 'Gewapend beton', bouwjaar: 1988,
      beheerder: 'Waterschap', locatie: 'Polderweg km 2,3', lat: 52.0612, lng: 5.0891, inspectieInterval: 5, lengte: 12, breedte: 1.5 }),
    obj({ code: 'KM-007', naam: 'Kademuur Havenkade', type: 'Kademuur / damwand', materiaal: 'Staal', bouwjaar: 1996,
      beheerder: 'Havenbedrijf', locatie: 'Havenkade 1–40', lat: 52.0981, lng: 5.1453, inspectieInterval: 6, lengte: 180 }),
  ];

  const insp = (object, datum, soort, gebreken, samenvatting) => ({
    id: nieuwId(), objectId: object.id, datum, inspecteur: 'J. de Vries', soort, weer: 'Droog', status: 'afgerond',
    samenvatting, fotoIds: [], aangemaakt: nu, gewijzigd: nu,
    gebreken: gebreken.map((g) => ({
      id: nieuwId(), fotoIds: [], maatregelStatus: 'open', conditieHandmatig: '', locatie: '', kostenraming: '', ...g,
    })),
  });

  const [brug, viaduct, fietsbrug, duiker, kade] = objecten;
  const inspecties = [
    insp(brug, datumGeleden(5, 2), 'Conditiemeting NEN 2767', [
      { bouwdeel: 'Leuning / balustrade', gebrek: 'Corrosie staal', ernst: 'gering', intensiteit: 2, omvang: 8,
        toelichting: 'Oppervlakkige roestvorming op hekwerk noordzijde.', maatregel: 'Hekwerk schuren en conserveren.',
        urgentie: '3jaar', kostenraming: 4500 },
      { bouwdeel: 'Wand / vleugelwand', gebrek: 'Vervuiling / begroeiing', ernst: 'gering', intensiteit: 1, omvang: 15,
        toelichting: 'Begroeiing in voegen metselwerk.', maatregel: 'Begroeiing verwijderen, voegwerk inspecteren.',
        urgentie: '1jaar', kostenraming: 1200, maatregelStatus: 'uitgevoerd' },
    ], 'Brug verkeert in redelijke staat. Metselwerk zonder constructieve gebreken.'),
    insp(viaduct, datumGeleden(3, 1), 'Conditiemeting NEN 2767', [
      { bouwdeel: 'Voegovergang', gebrek: 'Voegschade', ernst: 'serieus', intensiteit: 2, omvang: 25, locatie: 'Steunpunt 1',
        toelichting: 'Rubberprofiel gescheurd, lekkage naar oplegging.', maatregel: 'Voegovergang vervangen.',
        urgentie: '1jaar', kostenraming: 38000 },
      { bouwdeel: 'Oplegging', gebrek: 'Betonrot / wapeningscorrosie', ernst: 'ernstig', intensiteit: 2, omvang: 6,
        locatie: 'Steunpunt 1, ligger 3–5', toelichting: 'Afgespat beton met zichtbare gecorrodeerde wapening onder lekkende voeg.',
        maatregel: 'Betonreparatie en kathodische bescherming onderzoeken; nadere inspectie uitvoeren.',
        urgentie: 'direct', kostenraming: 65000 },
    ], 'Lekkage via voegovergang veroorzaakt betonschade bij steunpunt 1. Nadere inspectie geadviseerd.'),
    insp(fietsbrug, datumGeleden(1, 4), 'Visuele inspectie', [
      { bouwdeel: 'Rijvloer / brugdek', gebrek: 'Houtrot', ernst: 'ernstig', intensiteit: 3, omvang: 12,
        toelichting: 'Meerdere dekplanken zacht en gedeeltelijk doorgerot; struikelgevaar.',
        maatregel: 'Aangetaste dekplanken direct vervangen; tijdelijk afzetten.', urgentie: 'direct', kostenraming: 9500 },
    ], 'Dekplanken in slechte staat, veiligheidsrisico voor fietsers.'),
    insp(duiker, datumGeleden(2), 'Schouw', [], 'Duiker vrij van gebreken, doorstroming goed.'),
  ];

  const begroeiing = inspecties[0].gebreken[1];
  const werk = (object, datum, velden) => ({
    id: nieuwId(), objectId: object.id, datum, uitvoerder: 'P. Jansen', status: 'gereed', vervolg: '', materiaal: '',
    maatregelen: [], fotoIds: [], aangemaakt: nu, gewijzigd: nu, ...velden,
  });
  const werkzaamheden = [
    werk(brug, datumGeleden(4, 9), {
      soort: 'Groenonderhoud', uren: 3, omschrijving: 'Begroeiing uit voegen metselwerk verwijderd, beide zijden.',
      maatregelen: [{ inspectieId: inspecties[0].id, gebrekId: begroeiing.id }],
    }),
    werk(duiker, datumGeleden(0, 1), {
      soort: 'Afwatering vrijmaken', uren: 1.5, omschrijving: 'In- en uitstroomopening ontdaan van vuil en takken.',
    }),
    werk(fietsbrug, datumGeleden(0, 1), {
      soort: 'Afzetting / verkeersmaatregel', uren: 2, status: 'vervolg',
      omschrijving: 'Aangetaste dekplanken tijdelijk afgedekt met rijplaat; brug half afgezet.',
      vervolg: 'Dekplanken vervangen (zie inspectie).', materiaal: 'Rijplaat 2×1 m, afzethekken (4)',
    }),
  ];
  begroeiing.werkzaamheidId = werkzaamheden[0].id;
  begroeiing.uitgevoerdOp = werkzaamheden[0].datum;

  // Kleine GIS-laag: groenvakken rond de fietsbrug.
  const laagId = nieuwId();
  const vak = (x, y, b, h) => ({
    type: 'Polygon',
    coordinates: [[[x, y], [x + b, y], [x + b, y + h], [x, y + h], [x, y]].map(([a, c]) => [Math.round(a * 1e7) / 1e7, Math.round(c * 1e7) / 1e7])],
  });
  const vakken = [
    ['GV-001', 'Gazon noord', vak(5.1290, 52.0760, 0.0018, 0.0008), { beheertype: 'Gazon', maaifrequentie: 20 }],
    ['GV-002', 'Heesters oost', vak(5.1312, 52.0748, 0.0010, 0.0012), { beheertype: 'Heesters', maaifrequentie: 2 }],
    ['GV-003', 'Bloemrijk grasland', vak(5.1285, 52.0740, 0.0020, 0.0010), { beheertype: 'Bloemrijk gras', maaifrequentie: 2 }],
  ].map(([code, naam, geometrie, kenmerken]) => ({
    id: nieuwId(), code, naam, type: 'Groenvak', status: 'In gebruik', laagId, geometrie, kenmerken,
    lat: geometrie.coordinates[0][0][1] + 0.0004, lng: geometrie.coordinates[0][0][0] + 0.0005,
    inspectieInterval: 1, aangemaakt: nu, gewijzigd: nu,
  }));
  objecten.push(...vakken);
  const lagen = [{
    id: laagId, naam: 'Groenvakken Park Zuid', bron: 'voorbeeld', kleur: '#33a02c', soort: 'vlak', aantal: vakken.length,
    velden: ['beheertype', 'maaifrequentie'], aangemaakt: nu, gewijzigd: nu,
  }];
  const taken = [{
    id: nieuwId(), objectId: vakken[1].id, soort: 'werk', titel: 'Heesters snoeien langs fietspad', omschrijving: 'Doorrijhoogte vrijhouden (2,5 m).',
    prioriteit: 'hoog', deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), toegewezenAan: '', status: 'open',
    aangemaakt: nu, gewijzigd: nu,
  }];

  const dag = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const werkpakketten = [{
    id: nieuwId(), code: 'WP-DEMO-001', naam: 'Groenonderhoud Park Zuid', status: 'actief',
    rondes: [
      { id: nieuwId(), nummer: 1, naam: 'Maaironde 1', soort: 'werk', werksoort: 'Groenonderhoud', inspectiesoort: '', start: dag(-6), eind: dag(5), status: 'actief', objectIds: null },
      { id: nieuwId(), nummer: 2, naam: 'Maaironde 2', soort: 'werk', werksoort: 'Groenonderhoud', inspectiesoort: '', start: dag(28), eind: dag(35), status: 'gepland', objectIds: null },
    ],
    toegewezen: [], omschrijving: 'Gazons maaien, randen bijwerken en maaisel afvoeren.', objecten: vakken.map((v) => v.id),
    aangemaakt: nu, gewijzigd: nu,
  }, {
    id: nieuwId(), code: 'WP-DEMO-002', naam: 'Schouw kunstwerken 2026', status: 'gepland',
    rondes: [{ id: nieuwId(), nummer: 1, naam: 'Voorjaarsschouw', soort: 'inspectie', werksoort: '', inspectiesoort: 'Schouw', start: '', eind: '', status: 'gepland', objectIds: null }],
    toegewezen: [], omschrijving: '', objecten: [brug, viaduct, fietsbrug, duiker, kade].map((o) => o.id),
    aangemaakt: nu, gewijzigd: nu,
  }];

  // Lopend werk, zodat het dashboard laat zien wat er de afgelopen weken is gedaan.
  const [groen] = werkpakketten;
  const reparatie = {
    id: nieuwId(), code: 'WP-DEMO-003', naam: 'Klein onderhoud kunstwerken', status: 'actief',
    rondes: [{ id: nieuwId(), nummer: 1, naam: 'Onderhoud 2026', soort: 'werk', werksoort: 'Klein onderhoud', inspectiesoort: '', start: dag(-63), eind: dag(28), status: 'actief', objectIds: null }],
    toegewezen: [], omschrijving: 'Klein onderhoud en herstel op afroep.', objecten: [brug, viaduct, fietsbrug, duiker].map((o) => o.id),
    aangemaakt: nu, gewijzigd: nu,
  };
  werkpakketten.push(reparatie);
  // Recent werk wacht nog op goedkeuring (inbox); ouder werk is al goedgekeurd.
  const inRonde = (p, i, object, dagen, velden) => werk(object, dag(-dagen), {
    werkpakketId: p.id, rondeId: p.rondes[i].id,
    beoordeling: dagen <= 9
      ? { status: 'ingediend', ingediendOp: new Date(Date.now() - dagen * 864e5).toISOString(), ingediendDoor: velden.uitvoerder ?? 'P. Jansen' }
      : { status: 'goedgekeurd', op: new Date(Date.now() - (dagen - 2) * 864e5).toISOString(), door: 'beheerder' },
    ...velden,
  });
  werkzaamheden.push(
    inRonde(groen, 0, vakken[0], 4, { soort: 'Groenonderhoud', uren: 6, uitvoerder: 'Groenploeg 1', omschrijving: 'Gazon gemaaid, randen gestoken, maaisel afgevoerd.' }),
    inRonde(reparatie, 0, fietsbrug, 2, { soort: 'Klein onderhoud', uren: 3, uitvoerder: 'R. Bakker', omschrijving: 'Losse leuningregel vastgezet.' }),
    inRonde(reparatie, 0, brug, 9, { soort: 'Schilderwerk', uren: 7, uitvoerder: 'R. Bakker', omschrijving: 'Hekwerk noordzijde bijgewerkt.' }),
    inRonde(reparatie, 0, viaduct, 16, { soort: 'Reinigen', uren: 4, uitvoerder: 'P. Jansen', omschrijving: 'Afvoergoten en kolken gereinigd.' }),
    inRonde(reparatie, 0, duiker, 23, { soort: 'Afwatering vrijmaken', uren: 2, omschrijving: 'Rooster schoongemaakt.' }),
    inRonde(reparatie, 0, brug, 30, { soort: 'Reinigen', uren: 5, uitvoerder: 'R. Bakker', omschrijving: 'Graffiti verwijderd.' }),
    inRonde(reparatie, 0, viaduct, 44, { soort: 'Klein onderhoud', uren: 3, omschrijving: 'Lichtmast-voet afgekit.' }),
  );

  return { app: 'inspectie-app', versie: 1, lagen, objecten, inspecties, werkzaamheden, taken, werkpakketten, fotos: [] };
}
