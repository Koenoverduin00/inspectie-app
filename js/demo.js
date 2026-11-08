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

  return { app: 'inspectie-app', versie: 1, objecten, inspecties, fotos: [] };
}
