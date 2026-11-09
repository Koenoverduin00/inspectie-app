# Inspectie & Registratie – Civiele Techniek

Web-app voor het **registreren** van civieltechnische objecten (bruggen, viaducten, duikers, sluizen, kademuren,
wegvakken, …) en het **inspecteren** ervan volgens de systematiek van NEN 2767. De app werkt volledig in de browser,
ook **offline in het veld**, synchroniseert tussen pc en telefoon, en is te installeren op telefoon of tablet (PWA).

## Projecten, GIS en taken

- **Projecten** – na het openen kies je eerst een project; elk project heeft een eigen inhoud (objecten, GIS-lagen,
  inspecties, werkzaamheden, taken en foto's). Wisselen kan via de projectnaam in de kop.
- **Toegang per project** – *beheerders* (tabel `teamleden` in Supabase) maken projecten aan en zien alles.
  *Projectleden* (e-mailadressen in de ledenlijst van een project) zien alleen hun eigen projecten. Dit wordt in de
  database afgedwongen met Row Level Security, ook voor foto's.
- **GIS-lagen inladen** (dashboard of *Kaart & GIS*) – GeoJSON, Shapefile (.zip met .shp/.dbf/.prj) en GeoPackage
  (.gpkg). RD New (EPSG:28992) en Web Mercator worden automatisch omgerekend naar WGS84 (± 0,3 m t.o.v. proj4).
  **Elk vlak, elke lijn of elk punt wordt een object** met de oorspronkelijke kenmerken; inspecties, werkzaamheden en
  taken koppel je dus direct aan het GIS-vlak. Kies bij het inladen de kolom voor code en naam, het objecttype en
  eventueel een inspectie-interval.
- **Taken** komen uit drie bronnen: zelf geplande taken (met prioriteit, deadline en toewijzing aan een projectlid),
  openstaande maatregelen uit inspecties, en de inspectieplanning (verlopen / nooit / binnenkort).
- **Logisch nu** (telefoon) – taken gesorteerd op urgentie én afstand tot je huidige locatie; sta je in een vlak, dan
  zegt de app dat en komen de taken van dat vlak bovenaan. Eén urgentiestap weegt even zwaar als 750 m afstand.
  Een taak aantikken opent direct het juiste formulier; na opslaan staat de taak op gereed.

## Werkpakketten

Een werkpakket is één klus op een vaste set objecten, bijvoorbeeld *Maaironde 3 – Park Zuid* (werkzaamheid,
werksoort Groenonderhoud) of *Schouw kunstwerken 2027* (schouw/inspectie).

- **Samenstellen (pc)** – kies met filter-dropdowns (GIS-laag, objecttype, kenmerk + waarde, conditie, planning,
  zoeken) en voeg alle gefilterde objecten in één keer toe of haal ze weg; losse objecten vink je aan of uit.
  Verder: periode, uitvoerders (projectleden), instructie en status (gepland / actief / afgerond).
- **Voortgang** – een object is *gedaan* zodra er vanuit het pakket een werkzaamheid of afgeronde inspectie is
  vastgelegd. Uitvoerders kunnen een object *overslaan* met verplichte reden. Je ziet bijv. **5/20 gedaan · 1 overgeslagen**.
- **Telefoon** – het pakket opent met een kaart (oranje = te doen, groen = gedaan, grijs = overgeslagen, blauw = jij),
  de lijst op afstand en de knop **Volgende dichtbij**; het formulier opent met de juiste soort ingevuld en na
  opslaan ga je terug naar het pakket. Open objecten van actieve pakketten staan ook in *Logisch nu*.
- **Herhalen** maakt een kopie voor de volgende ronde (*Maaironde 3* → *Maaironde 4*); **CSV** exporteert de status per object.
- De kaartbibliotheek (Leaflet) wordt meegeleverd, zodat de objecten ook zonder bereik op de kaart staan; alleen de
  achtergrondkaart heeft internet nodig.

## Flora- en fauna-vrijgave (veldcheck)

Eigen tegel op de telefoon. Gebaseerd op de **Gedragscode Soortenbescherming Rijkswaterstaat 2025–2029**
(Omgevingswet; Bal art. 11.45, 11.53 en 11.59), waarin de *veldcheck* de controle is direct voorafgaand aan de
werkzaamheden op de actuele situatie van beschermde soorten en broedgevallen.

- **Gebied en werkzaamheden**: één of meer objecten/GIS-vlakken (of alle objecten van een werkpakket), geplande
  werkzaamheden, activiteit volgens de gedragscode (B&O hfst. 4 of kleinschalige RI hfst. 5) en uitvoeringsperiode.
- **EWP**: kenmerk en versie van het ecologisch werkprotocol; zonder door RWS geaccepteerd EWP kan niet worden
  afgerond (werkproces stap 9). Ook vast te leggen: EWP aanwezig op locatie.
- **Deskundigheid**: ecologisch deskundige (≥ 3 jaar ervaring met de soorten, gebiedskennis, kennis Ow) of een
  medewerker met minimaal certificaat flora en fauna niveau 2 onder aansturing van een deskundige.
- **Controles** (zorgvuldig handelen, tabel 4.2 en 4.13–4.16): bronnen/NDFF, broedgevallen en jaarrond beschermde
  nesten, verblijfplaatsen, kwetsbare periode, markering, verstoringsvrije afstand, werkrichting, fasering, maaihoogte.
- **Waarnemingen**: soortgroep, soort, type (nest, hol, verblijfplaats, groeiplaats …), beschermingsregime, aantal,
  verstoringsvrije afstand, markering, GPS-locatie en foto's.
- **Besluit**: vrijgegeven, onder voorwaarden of niet vrijgegeven, met geldigheid (t/m) en eventuele begeleiding.
  Bij waargenomen nesten, holen of verblijfplaatsen is "zonder voorwaarden" niet mogelijk.
- **Logboek** voor begeleiding, bijzonderheden, onverwacht aangetroffen soorten en afwijkingen (stap 10);
  archiveren minimaal 2 jaar na afloop. CSV-export voor rapportage en NDFF-aanlevering.
- Bij een **werkpakket** kun je "flora- en fauna-vrijgave vereist" aanzetten: uitvoerders zien per object of er een
  geldige vrijgave is en het werkformulier waarschuwt als die ontbreekt (inclusief de voorwaarden).

## Boomveiligheidscontrole (BVC)

Onder de tegel *Schouw & inspectie* (keuze 🌳 Boomveiligheid). Gebaseerd op het **Boomveiligheidsprotocol
Rijkswaterstaat** (Loo Plan, 8 februari 2017, definitief) en het CROW **Standaard Uitwisselingsformaat (SUF-BVC)**.

- **Opnamekenmerken (bijlage 2/4)**: KEY, RD-coördinaten, eigenaar, boomsoort (naamlijst RWS, bijlage 8), plantjaar,
  omgevingsrisicoklasse (ORK), controlefrequentie, controleur, datum, boomveiligheidsklasse (BVK), niet aangetroffen,
  gesloten beplanting (met aantal bomen), opmerking en fotonummer.
- **Boomgebreken (bijlage 3)** met type, plaats (kroon, stam, stamvoet, maaiveld) en gevolg (takbreuk, stambreuk,
  instabiliteit); hinderlijke takken en wortelopdruk worden als bruikbaarheid (geen boomveiligheid) aangeduid.
- **Conclusie**: BVK *geen gebreken / attentieboom / risicoboom / risico- en attentieboom*; de controlefrequentie
  volgt automatisch uit tabel 1 en 2 (6-jaarlijks, 3-jaarlijks of jaarlijks) en bepaalt de volgende controle.
- **Maatregelen**: boom verwijderen, veiligheidssnoei, nader onderzoek, boomband verwijderen, opdruk verharding
  verhelpen; urgentie *acuut (48 uur)* of *binnen 3 maanden*. Te vellen bomen moeten gemarkeerd zijn (oranje streep).
  BVC-maatregelen verschijnen in het maatregelenoverzicht, de taken en bij werkzaamheden.
- **Controles**: kwalificatie controleur (ETW, ETT, gecertificeerd boomveiligheidscontroleur of gelijkwaardig),
  methode (VTA/IBA/SIA), waarschuwing buiten de controleperiode juli–november, hint bijzondere boom (> 40 / > 90 cm dbh),
  melding bij beschermde soorten in de boom (koppeling naar een flora- en fauna-vrijgave).
- **Als werkpakket**: kies bij een werkpakket *Schouw / inspectie* → *Boomveiligheidscontrole* en stel het samen uit
  de ingeladen GIS-lagen (bomen als punten, gesloten beplantingen als vlakken). Uitvoerders openen vanuit het pakket
  direct het BVC-formulier; de voortgang (bijv. 12/80), de samenvatting en de SUF-export per pakket volgen vanzelf.
  Bij het inladen worden laagnamen als *bomen* en *singels/houtwallen* herkend als *Boom* of *Gesloten beplanting*,
  kolommen als *boomnummer* als code, en kenmerken als *boomsoort* (Latijn of Nederlands), *plantjaar*,
  *diameter*, *ORK* en *aantal* gebruikt als voorinvulling van de controle.
- **Nieuwe boom inmeten** met GPS (protocol: max. ca. 3 m afwijking); basisgegevens worden bij de boom bewaard en
  bij elke controle geverifieerd.
- **Rapport** per boom (bijlage 5) en **SUF-BVC export** (boom, boomgebreken, maatregelen) per project of werkpakket;
  bij een BVC-werkpakket een samenvatting per klasse en maatregel.

## Eigen formuliervelden per project

Via **Projecten → Formuliervelden** stelt een beheerder per project extra regels in voor *werkzaamheden*,
*schouw & inspectie* en *taken*, naast de standaardvelden. Per veld kies je:

- **type**: tekst, getal (met eenheid en min/max), keuzelijst, ja/nee, datum, tijd, foto of checklist;
- **verplicht**: een concept-inspectie mag altijd, maar afronden of opslaan kan pas als alles is ingevuld
  (bij een checklist: alle punten afgevinkt);
- **alleen tonen bij** een bepaalde soort (bijv. "Gemaaide oppervlakte" alleen bij *Groenonderhoud*);
- een toelichting voor de invuller; de volgorde stel je in met ↑/↓.

De velden verschijnen automatisch op telefoon en pc in het blok *Extra gegevens*, staan bij het detail en in het
rapport, en krijgen een eigen kolom in de CSV-export van werkzaamheden. Antwoorden blijven bewaard als een veld
later wordt verwijderd.

## Twee weergaven

| | Telefoon – **veldversie** | Pc – **volledige versie** |
|---|---|---|
| Doel | Snel vastleggen buiten | Inrichten, beheren en rapporteren |
| Start | Twee grote knoppen: **Registratie werkzaamheden** en **Schouw & inspectie** | Dashboard met KPI's, conditieverdeling en planning |
| Object kiezen | Zoeken of **📍 Dichtbij** (GPS, gesorteerd op afstand) | Lijsten met filters |
| Menu | Onderin: Start · Werkzaamheden · Schouw · Account | Bovenin: alle onderdelen |

De weergave wordt automatisch gekozen op schermbreedte. Onder *Instellingen → Weergave op dit apparaat* (of
*Account → Volledige versie openen* op de telefoon) kun je dat per apparaat vastzetten.

## Functies

- **Objectregistratie** – objectcode, naam, type, materiaal, bouwjaar, afmetingen, beheerder, locatie (met GPS-knop),
  status, inspectie-interval en notities.
- **Inspecties** – datum, inspecteur, soort (visueel, conditiemeting NEN 2767, schouw, …), weersomstandigheden,
  samenvatting en overzichtsfoto's. Opslaan als concept of afronden.
- **Gebreken** per inspectie – bouwdeel, gebrekstype, plaats, ernst, intensiteit, omvang (%), toelichting, foto's
  (camera direct vanaf mobiel, automatisch verkleind), advies maatregel, urgentie en kostenraming.
- **Conditiescore 1–6** wordt live berekend per gebrek; de conditie van de inspectie is die van het maatgevende gebrek.
  Per gebrek kan de conditie ook handmatig worden vastgesteld.
- **Werkzaamheden** – soort, datum, omschrijving, foto's voor/na, uren, uitvoerder, gebruikt materiaal en status
  (gereed / vervolg nodig). Openstaande maatregelen van het object kun je direct afvinken; ze worden dan op
  *uitgevoerd* gezet en gekoppeld aan het werk. Overzicht met filters en CSV-export op de pc.
- **Dashboard** – KPI's, conditieverdeling van het areaal, recente inspecties en inspectieplanning
  (verlopen / binnenkort / op schema, op basis van laatste afgeronde inspectie + interval).
- **Maatregelen** – alle onderhoudsadviezen gesorteerd op urgentie, totale raming, afvinken als uitgevoerd.
- **Kaart** – objecten op de PDOK-luchtfoto (standaard 50% helderheid, instelbaar met ☀️-schuif; wisselen naar OpenStreetMap kan via de lagenknop), gekleurd naar conditie. De achtergrond vereist internet.
- **Inspectierapport** – printvriendelijk rapport, op te slaan als PDF via de printfunctie van de browser.
- **Export / back-up** – CSV-export van objecten en maatregelen (Excel, puntkomma-gescheiden), JSON-back-up en -import.
- **Voorbeelddata** om de app direct te verkennen.

## Starten

Er zijn geen afhankelijkheden nodig, alleen Node.js (≥ 18) voor de lokale webserver:

```bash
npm start          # http://localhost:8080  (andere poort: PORT=3000 npm start)
npm test           # unittests van de conditieberekening
```

Elke andere statische webserver (of GitHub Pages) werkt ook. Voor installatie als app en offline gebruik
moet de app via `http://localhost` of `https://` worden geopend.

## Conditiebepaling

| Score | Conditie    | Omschrijving                                              |
|-------|-------------|-----------------------------------------------------------|
| 1     | Uitstekend  | Incidenteel geringe gebreken                              |
| 2     | Goed        | Incidenteel beginnende veroudering                        |
| 3     | Redelijk    | Plaatselijk zichtbare veroudering                         |
| 4     | Matig       | Functievervulling van bouw- en installatiedelen in gevaar |
| 5     | Slecht      | De veroudering is onomkeerbaar                            |
| 6     | Zeer slecht | Technisch rijp voor sloop                                 |

De automatische score combineert **ernst** (gering / serieus / ernstig) en **intensiteit** (begin-, gevorderd,
eindstadium) tot een zwaarte 1–5, en vermenigvuldigt die met de **omvangklasse** (< 2 %, 2–10 %, 10–30 %,
30–70 %, ≥ 70 %). Dit is een *indicatieve* vertaling van de NEN 2767-systematiek; de officiële normtabellen en
gebrekenbibliotheek zijn niet opgenomen. Gebruik voor formele conditiemetingen de handmatige conditie waar nodig.
De logica staat in [`js/nen2767.js`](js/nen2767.js) en is gedekt door tests.

## Opslag en synchronisatie (pc ↔ telefoon)

De app werkt *offline-first*: alle gegevens (incl. foto's) staan lokaal in de browser (IndexedDB), zodat je in het
veld zonder bereik kunt inspecteren. Ben je ingelogd, dan worden wijzigingen automatisch gesynchroniseerd met
[Supabase](https://supabase.com), en zie je op pc en telefoon dezelfde objecten, inspecties en foto's.

- Wijzigingen gaan in een wachtrij en worden verstuurd zodra er verbinding is (indicator rechtsboven).
- Nieuwe gegevens van andere apparaten worden opgehaald bij het openen van de app, elke minuut en na elke wijziging.
- Bij gelijktijdige wijzigingen aan hetzelfde object of dezelfde inspectie wint de laatst opgeslagen versie.
- Zonder inloggen werkt de app gewoon lokaal; wat je dan invoert wordt verstuurd zodra je inlogt.

### Eenmalig instellen

1. **Database inrichten** – open in Supabase de *SQL Editor*, plak de inhoud van
   [`supabase/schema.sql`](supabase/schema.sql), vervang onderaan `jouw@email.nl` door je eigen e-mailadres en klik *Run*.
   Haal in stap 5 van het script de `--` weg voor de `insert`-regel en vul je eigen adres in.
   Voer daarna in volgorde [`002_werkzaamheden.sql`](supabase/002_werkzaamheden.sql) en
   [`003_projecten_gis_taken.sql`](supabase/003_projecten_gis_taken.sql), [`004_werkpakketten.sql`](supabase/004_werkpakketten.sql) en
   [`005_vrijgaven.sql`](supabase/005_vrijgaven.sql)
   uit (alle scripts zijn veilig opnieuw uit te voeren).
   Alleen e-mailadressen in de tabel `teamleden` hebben toegang tot de gegevens; collega's voeg je later toe met
   `insert into public.teamleden (email) values ('collega@bedrijf.nl');`.
2. **Sleutel invullen** – zet de *Project URL* en de *publishable/anon key* (Supabase → *Project Settings → API*) in
   [`js/config.js`](js/config.js). Gebruik **nooit** de `service_role`/secret key. (Of vul ze per apparaat in onder
   *Instellingen* in de app.)
3. **Online zetten** – kies in GitHub *Settings → Pages → Source: GitHub Actions*. De workflow
   [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publiceert de app bij elke push naar `main`
   op `https://<gebruiker>.github.io/inspectie-app/`.
4. **Inloggen** – open de app op de pc, ga naar *Instellingen* en kies *Account aanmaken* (bevestig je e-mail) of
   *Inloggen*. Doe hetzelfde op je telefoon en zet de app op het beginscherm.
5. **Aanbevolen** – zet daarna in Supabase onder *Authentication → Sign In / Providers* de optie
   *Allow new users to sign up* uit, en maak accounts voor collega's aan via *Authentication → Users → Invite*.

Maak daarnaast af en toe een back-up via **Instellingen → Back-up downloaden**.

## Structuur

```
index.html            app-shell en navigatie
css/styles.css        opmaak (licht/donker, mobiel, print)
js/app.js             router en alle schermen
js/db.js              IndexedDB-opslag, wachtrij, export/import
js/sync.js            inloggen en synchronisatie met Supabase
js/gis.js             GIS inlezen (GeoJSON, Shapefile, GeoPackage), RD→WGS84, geometrie
js/taken.js           taken samenstellen en sorteren op urgentie en locatie
js/velden.js          eigen formuliervelden: zichtbaarheid, controle en weergave
js/pakketten.js       werkpakketten: voortgang, toewijzing en objectfilters
js/bvc.js             boomveiligheidscontrole volgens protocol RWS, SUF-BVC, RD-coördinaten
js/ecologie.js        flora- en fauna-vrijgave (veldcheck) volgens Gedragscode Soortenbescherming RWS
vendor/               shpjs, sql.js en Leaflet, lokaal meegeleverd zodat import en kaart ook offline werken
js/config.js          Supabase-URL en publishable key
js/nen2767.js         conditieberekening en planning (pure functies)
js/catalogus.js       keuzelijsten: objecttypen, bouwdelen, gebreken
js/demo.js            voorbeelddata
sw.js                 service worker (offline)
server.js             minimale statische server
tests/                unittests (node --test)
supabase/schema.sql   database, beveiliging (RLS) en foto-opslag voor Supabase
.github/workflows/    automatisch publiceren op GitHub Pages
```
