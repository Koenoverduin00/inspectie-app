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


| | Telefoon – **veldversie** | Pc – **volledige versie** |
|---|---|---|
| Doel | Snel vastleggen buiten | Inrichten, beheren en rapporteren |
| Start | Twee grote knoppen: **Registratie werkzaamheden** en **Schouw & inspectie** | Dashboard met KPI's, conditieverdeling en planning |
| Object kiezen | Zoeken of **📍 Dichtbij** (GPS, gesorteerd op afstand) | Lijsten met filters |
| Menu | Onderin: Start · Werkzaamheden · Schouw · Account | Bovenin: alle onderdelen |

De weergave wordt automatisch gekozen op schermbreedte. Onder *Instellingen → Weergave op dit apparaat* (of
*Account → Volledige versie openen* op de telefoon) kun je dat per apparaat vastzetten.


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
- **Kaart** – objecten op OpenStreetMap, gekleurd naar conditie (vereist internet).
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
   [`003_projecten_gis_taken.sql`](supabase/003_projecten_gis_taken.sql) uit (alle scripts zijn veilig opnieuw uit te voeren).
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
vendor/               shpjs en sql.js (MIT), lokaal meegeleverd zodat import ook offline werkt
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
