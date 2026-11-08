# Inspectie & Registratie – Civiele Techniek

Web-app voor het **registreren** van civieltechnische objecten (bruggen, viaducten, duikers, sluizen, kademuren,
wegvakken, …) en het **inspecteren** ervan volgens de systematiek van NEN 2767. De app werkt volledig in de browser,
ook **offline in het veld**, en is te installeren op telefoon of tablet (PWA).

## Functies

- **Objectregistratie** – objectcode, naam, type, materiaal, bouwjaar, afmetingen, beheerder, locatie (met GPS-knop),
  status, inspectie-interval en notities.
- **Inspecties** – datum, inspecteur, soort (visueel, conditiemeting NEN 2767, schouw, …), weersomstandigheden,
  samenvatting en overzichtsfoto's. Opslaan als concept of afronden.
- **Gebreken** per inspectie – bouwdeel, gebrekstype, plaats, ernst, intensiteit, omvang (%), toelichting, foto's
  (camera direct vanaf mobiel, automatisch verkleind), advies maatregel, urgentie en kostenraming.
- **Conditiescore 1–6** wordt live berekend per gebrek; de conditie van de inspectie is die van het maatgevende gebrek.
  Per gebrek kan de conditie ook handmatig worden vastgesteld.
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

## Opslag

Alle gegevens (incl. foto's) staan lokaal in de browser (IndexedDB) op het apparaat. Er is geen server of account.
Maak regelmatig een back-up via **Instellingen → Back-up downloaden**; die kan op een ander apparaat worden
geïmporteerd.

## Structuur

```
index.html            app-shell en navigatie
css/styles.css        opmaak (licht/donker, mobiel, print)
js/app.js             router en alle schermen
js/db.js              IndexedDB-opslag, export/import
js/nen2767.js         conditieberekening en planning (pure functies)
js/catalogus.js       keuzelijsten: objecttypen, bouwdelen, gebreken
js/demo.js            voorbeelddata
sw.js                 service worker (offline)
server.js             minimale statische server
tests/                unittests (node --test)
```
