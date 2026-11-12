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
- **GIS inladen – één keer, daarna bijwerken** (*Kaart & GIS* → *GIS inladen*). Het areaal laad je eenmalig in;
  werkpakketten, inspecties en taken koppel je daarna aan die objecten. Sleep één of meer bestanden in het vak:
  GeoPackage (.gpkg, **alle lagen tegelijk**), Shapefile (.zip) of GeoJSON. De app doet de rest:
  - een laag met vlakken, lijnen én punten wordt automatisch gesplitst in drie lagen;
  - **objecttype uit een kolom (verplicht)**: per laag kies je de kolom waarin het type staat (bijv. `beheertype`);
    elk object krijgt de waarde uit die kolom, met de gevonden waarden en aantallen als controle. Een herkenbare
    kolom (type, objecttype, beheertype, categorie, soort…) is al voorgeselecteerd. Heeft het bestand geen
    typekolom, dan kies je bewust *Geen kolom: één vast type* (voorgevuld op basis van de laagnaam). Zolang een
    laag geen typekolom heeft, kan er niet worden ingeladen. Bij bijwerken wordt de gekozen kolom onthouden;
  - coördinatenstelsel (RD New, WGS84, Web Mercator), codekolom (een kolom met unieke waarden; anders automatisch
    nummeren) en naamkolom worden herkend; aanpassen kan onder *Instellingen*, maar is zelden nodig;
  - features zonder geometrie of met ongeldige coördinaten worden overgeslagen en gemeld; ligt de data buiten
    Nederland, dan krijg je een waarschuwing; vooraf zie je alles op een voorbeeldkaart;
  - **een al ingeladen laag wordt herkend** (zelfde bestand, of ≥ 50% dezelfde codes/geometrieën) en standaard
    *bijgewerkt* in plaats van dubbel ingeladen: ongewijzigd / bijgewerkt / nieuw / vervallen. Objecten behouden hun
    id, dus gekoppelde inspecties, werk en werkpakketten blijven intact; vervallen objecten met historie worden
    nooit verwijderd maar los gemaakt;
  - een laag wordt pas opgeslagen als al zijn objecten er zijn (geen halve lagen bij een fout).
  Per laag op de kaart: **↻** = nieuwere versie van het bestand inladen, **🗑** = verwijderen.
- **Taken** komen uit: zelf geplande taken (met prioriteit, deadline en toewijzing aan een projectlid), objecten in
  actieve werkpakketrondes, en de inspectieplanning (verlopen / nooit / binnenkort).
- **Bevindingen worden niet vanzelf een taak.** Bij een inspectie staat per gebrek (en per BVC-maatregel en
  STOWA-waarneming) de knop **➜ Als taak**, plus **Alle open bevindingen als taak**; in het maatregelenoverzicht
  een kolom *Taak*, een filter *nog geen taak / doorgezet* en **Zichtbare als taak**. Bij doorzetten stelt de app
  prioriteit en deadline voor op basis van de urgentie (direct → hoog, binnen 7 dagen; 3 maanden → hoog; 1 jaar →
  normaal, …) en kies je eventueel een uitvoerder. De taak verdwijnt zodra de maatregel is uitgevoerd.
  Per project kan **Alle bevindingen automatisch als taak** aan (projectinstellingen); standaard staat dat uit.
- **Logisch nu** (telefoon) – taken gesorteerd op urgentie én afstand tot je huidige locatie; sta je in een vlak, dan
  zegt de app dat en komen de taken van dat vlak bovenaan. Eén urgentiestap weegt even zwaar als 750 m afstand.
  Een taak aantikken opent direct het juiste formulier; na opslaan staat de taak op gereed.

## Werkpakketten

Structuur: **werkpakket → rondes (taken) → objecten**. Een werkpakket is het contractonderdeel op een vaste set
objecten (bijv. *WP-2027-001 Groenonderhoud Park Zuid*); de rondes zijn de keren dat er iets gebeurt
(*R1 Maaien april*, *R2 Maaien juni*, *R3 Schouw*), elk met eigen soort, periode, status en voortgang.

- **Objecten koppelen** – objecten horen bij het pakket en een ronde geldt standaard voor álle objecten van het
  pakket. Alleen als een object maar in één ronde mee moet, geef je een *deelselectie* op (via Excel: kolom
  *Alleen in ronde*). Zo hoef je niets dubbel in te voeren en blijft een extra ronde één regel werk.
- **Samenstellen (pc)** – pakketcode (vaste sleutel, automatisch `WP-jjjj-nnn`), naam, uitvoerders, instructie en
  flora/fauna-vrijgave; daaronder de rondes (**＋ Ronde**) en de objecten via filter-dropdowns (GIS-laag,
  objecttype, kenmerk + waarde, conditie, planning, zoeken).
- **Voortgang per ronde** – een object is *gedaan* zodra er vanuit die ronde een werkzaamheid of afgeronde
  inspectie is vastgelegd; uitvoerders kunnen een object *overslaan* met verplichte reden. Het pakket toont het
  totaal over alle rondes, de detailpagina een tabel met per ronde de voortgang en de knop *Actief / Afronden*.
- **Telefoon** – alleen *actieve* rondes verschijnen. Zijn er meer tegelijk actief, dan kies je eerst de ronde.
  De ronde opent met een kaart (oranje = te doen, groen = gedaan, grijs = overgeslagen, blauw = jij), de lijst op
  afstand en **Volgende dichtbij**; na opslaan ga je terug naar de ronde. Open objecten staan ook in *Logisch nu*.
- **＋ Volgende ronde** voegt een ronde toe aan hetzelfde pakket (*Maaironde 3* → *Maaironde 4*); **CSV** en
  (bij BVC) **SUF-BVC** exporteren de gekozen ronde.

### Werkpakketten via Excel (grote onderhoudscontracten)

Op *Werkpakketten* staan drie knoppen: **📥 Excel-sjabloon**, **📤 Naar Excel** (alle pakketten, om te bewerken
en terug te laden) en **📂 Excel inladen**. Het `.xlsx`-bestand is zo gemaakt dat je alleen kunt invullen wat
gevraagd wordt:

| Blad | Eén regel per | Invullen |
|---|---|---|
| Werkpakketten | pakket | pakketcode (uniek), naam, uitvoerder 1–3 (keuzelijst projectleden), vrijgave Ja/Nee, instructie |
| Rondes | ronde | pakketcode (keuzelijst), rondenr (heel getal, uniek per pakket), naam, soort → werk-/inspectiesoort (afhankelijke keuzelijst), start, gereed (≥ start), status |
| Objecten | object of laag | pakketcode, objectcode (keuzelijst) **of** een hele GIS-laag, optioneel *Alleen in ronde* |

- Keuzelijsten komen uit het project (objecten, lagen, leden, werk- en inspectiesoorten); ongeldige waarden en
  datums worden in Excel direct geweigerd. Grijze kolommen (rondecode, objectnaam, type, laag, controle met ⚠)
  rekenen zichzelf uit. De bladen zijn beveiligd (zonder wachtwoord): alleen de witte invoerkolommen zijn
  bewerkbaar, de lijsten staan op een verborgen blad.
- Bij inladen controleert de app alles opnieuw en toont een overzicht per pakket (*nieuw / bijwerken*, rondes,
  objecten +/−) met fouten per blad en rij. Opslaan kan pas als er geen fouten meer zijn.
- Bijwerken gaat op pakketcode; R1 in het bestand blijft R1 in de app (registraties blijven gekoppeld). Pakketten
  die niet in het bestand staan en rondes worden nooit via Excel verwijderd. Optie (standaard aan): objecten die
  niet meer in het bestand staan uit het pakket halen, **behalve** objecten die al gedaan of overgeslagen zijn.

- De kaartbibliotheek (Leaflet) wordt meegeleverd, zodat de objecten ook zonder bereik op de kaart staan; alleen de
  achtergrondkaart heeft internet nodig.

### Resultaten van inspecties bekijken en exporteren

- **Inspectie openen** – oordeel bovenaan (conditie of boomveiligheidsklasse), een **kaartje** met de ligging van
  het object (overige objecten van de laag lichtgrijs), coördinaten en een navigatielink. Gebreken staan als
  overzichtelijke kaarten met kenmerken (ernst, intensiteit, omvang, urgentie, raming), waarneming en maatregel
  naast elkaar, en de foto's per gebrek in een galerij (klik = vergroten).
- **📊 Resultaten naar Excel** – vanuit een ronde van een werkpakket (bijv. *R1 van de bomeninspectie*: álle
  objecten van die ronde, ook open en overgeslagen) of vanuit *Inspecties* (de inspecties die je gefilterd hebt).
  Bladen: *Overzicht* (aantallen), *Resultaten* (één regel per object met oordeel in kleur, datum, inspecteur,
  maatregelen, volgende inspectie, BVC-gegevens, eigen velden, RD- en GPS-coördinaten), *Gebreken*, *Maatregelen*
  en optioneel *Foto's* (miniaturen per object en gebrek).

## Inloggen op de telefoon

Op de telefoon start de app (als de online synchronisatie is ingesteld en je niet bent ingelogd) met een
inlogscherm over het volledige scherm, zonder menu's: e-mailadres (wordt onthouden), wachtwoord met oogje om te tonen,
**Wachtwoord vergeten?** (stuurt een herstelmail), **Account aanmaken** en onderaan *Offline werken zonder account*
(geldt tot de app wordt gesloten). Na uitloggen of een verlopen sessie kom je vanzelf terug op dit scherm.
De link uit de herstelmail opent het scherm *Nieuw wachtwoord*.

> Zet in Supabase onder *Authentication → URL Configuration* de **Site URL** (en eventueel een Redirect URL) op het
> adres van de app, bijv. `https://<gebruiker>.github.io/inspectie-app/`, anders wijzen de links in de mails naar localhost.

## Dashboard: sturen op de uitvoering

Bovenaan schakel je tussen twee weergaven; de keuze wordt per apparaat onthouden.

- **Opdrachtnemer** – *Uitgevoerde werkzaamheden* staat groot bovenaan: aantal en uren deze week (met trend t.o.v. vorige week),
  een weekgrafiek van de laatste 10 weken en de verdeling per werksoort en per uitvoerder (4 weken). Daaronder de lopende rondes
  met hun schema-signaal en de recente werkzaamheden en inspecties naast elkaar.
- **Opdrachtgever** – voortgang per werkpakket, rondes die achter liggen bovenaan, de uitgevoerde werkzaamheden,
  open maatregelen per urgentie (met raming) en de recente inspecties en werkzaamheden naast elkaar.

**Schema-signaal per ronde**: de voortgang (gedaan + overgeslagen) wordt vergeleken met het verstreken deel van de geplande
periode (streepje in de balk). Meer dan 10 procentpunt achter = *achter*, meer dan 25 = *flinke achterstand*, na de einddatum
niet klaar = *te laat*. Ook staat erbij hoeveel objecten per dag nog nodig zijn. Rondes die binnen 14 dagen starten staan eronder.

## Objecten zoeken en de kaart in werkpakketten en inspecties

- **Zoeken** werkt op code, naam, type, locatie én GIS-kenmerken, met meerdere woorden tegelijk (bijv. `gazon noord`).
  Dat kan in de objectenlijst, bij het samenstellen van een werkpakket, in de objectentabel van een werkpakket
  (met filter op open / gedaan / overgeslagen) en op de telefoon in de lijst *Nog te doen* (vanaf 6 objecten).
- **Objecten**: schakel tussen **☰ Lijst** en **🗺️ Kaart**. Typ in het zoekveld: de kaart toont alleen de gevonden objecten
  en zoomt erop in (één treffer: direct naar het object, Enter = naar de eerste treffer). Rechts staat de lijst met treffers
  om aan te klikken; met 📍 in de lijst spring je naar het object op de kaart.
- **Werkpakket samenstellen**: de kaart toont de gefilterde objecten (groen = in pakket, grijs = niet).
  Klik op een object om het toe te voegen of eruit te halen, of gebruik **▭ Gebied toevoegen / eruit** en sleep een rechthoek.
- **Werkpakket bekijken**: zoeken filtert ook de kaart; met 📍 achter een objectcode spring je ernaartoe.
- **Inspecties**: schakel tussen **☰ Lijst** en **🗺️ Kaart**. De kaart volgt de filters en kleurt elk object naar het
  oordeel van de laatste inspectie (NEN-conditie, STOWA-urgentie of BVC-klasse); klik voor de inspecties van dat object.

## Foto's en opslag (snelheid)

Onder **Instellingen → Foto's en opslag** (op de telefoon onder Account):

- **Fotoformaat per project** (beheerder, geldt voor iedereen): *Compact* 1280 px (~150 kB), *Standaard* 1600 px (~250 kB, standaard)
  of *Hoog* 2048 px (~500 kB). Elke foto wordt op het toestel verkleind vóór opslaan en versturen; een telefoonfoto van
  5–8 MB wordt zo 100–500 kB. Locatiegegevens (EXIF) gaan er daarbij af.
- **Foto's van collega's**: alleen die van het project waarin je werkt worden vooraf gedownload (andere projecten pas als
  je ze opent), of kies *pas downloaden bij openen* om data en opslag te sparen.
- **Opruimen**: verwijder foto's van andere projecten van dit apparaat (alleen als ze al online staan).
- De app vraagt de browser om de gegevens te beschermen tegen automatisch opruimen.

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

## Inspectie waterkering (STOWA)

Visuele inspectie van waterkeringen volgens de STOWA-systematiek: *Inspectiewijzers waterkeringen* (STOWA 2012-14,
technisch deel van de Handreiking inspecties waterkeringen) en de *Handreiking inspectie waterkeringen,
operationeel deel* (STOWA VIW 2008-02).

- **Starten**: kies bij een inspectie de soort *Inspectie waterkering (STOWA)*, of maak een werkpakket-ronde met die
  inspectiesoort; uitvoerders openen dan vanzelf het STOWA-formulier (pc en telefoon).
- **Hiërarchie**: type kering (rivierdijk, zeedijk, regionale kering, duin, (haven)dam, hoge grond, kunstwerk) →
  zone (bijv. buitentalud, kruin, binnentalud, teen, berm, teensloot; per type volgens bijlage C) → element en
  schadebeeld (de **61 inspectiewijzers** in 7 categorieën: oevers, gras-, steen- en asfaltbekleding, wegen, overig,
  duinen) → kenmerken. Bij een zone staan de passende schadebeelden bovenaan; de kenmerken per schadebeeld hebben
  de keuzelijsten uit bijlage D (bijv. breedte < 25 / 25-50 / 50-100 / > 100 cm, oorzaak graverij, zand meevoerend).
- **Schadebeeld kiezen in stappen**: elementgroep (grasbekledingen, steenbekledingen, asfaltbekledingen, bijzondere
  constructies, niet-waterkerende elementen, duinen) → element (bijv. zuilen of blokken) → schadebeeld. Daarin zitten
  alle Digigids-schadebeelden én de inspectiewijzers zonder Digigids-tegenhanger (125 in totaal). Na de keuze klapt
  het in tot één regel (groep › element › schadebeeld) met *Wijzig*.
- **Elk gebrek is een punt**: tik op het kaartje bij de waarneming (punt is versleepbaar) of gebruik *Mijn
  GPS-locatie*. Zonder punt kan een inspectie niet worden afgerond. Het resultaat toont alle punten genummerd op de
  kaart, met daaronder een overzichtstabel (elementgroep › element, schadebeeld, zone, Digigids-klasse, urgentie);
  de Excel-export bevat per gebrek RD- en GPS-coördinaten.
- **Per waarneming**: categorie schadebeeld of handhaving, **urgentie groen / oranje / rood** (geen directe actie /
  actie binnen 3 maanden / direct gevaar voor het kerend vermogen), locatie (tekst + GPS), toelichting, maatregel en
  type maatregel (monitoren / verbeteren / reconstrueren), overzichts- en detailfoto's. Rood vraagt een foto en
  geeft na afronden een melding om direct de beheerder te waarschuwen.
- **Digigids** (nationale catalogus schadebeelden, STOWA en Rijkswaterstaat): alle **100 schadebeelden** uit de 6
  categorieën – grasbekledingen, steenbekledingen, asfaltbekledingen, bijzondere constructies, niet-waterkerende
  elementen en duinen. Per schadebeeld beoordeel je de schade met de klassen **Goed / Redelijk / Matig / Slecht**:
  per klasse het criterium (bijv. "Overhang > 5 cm en < 10 cm") of, waar de Digigids geen criterium geeft, het
  bijschrift van de voorbeeldfoto's, met de voorbeeldfoto's zelf; tik de klasse die past, tik een foto om te
  vergroten. 51 schadebeelden zijn gekoppeld aan een STOWA-inspectiewijzer en verschijnen vanzelf bij die wijzer
  (staan er meer bij één wijzer, dan kies je welke); de overige 49 staan per categorie als groep *Digigids – …* in de
  keuzelijst. De foto's worden rechtstreeks van digigids.stowa.nl getoond (alleen met internet); criteria en
  bijschriften zitten in de app en werken offline. De klasse komt in detail, rapport en Excel-export.
  Opnieuw ophalen: `python3 scripts/digigids.py /gids/<categorie>`.
- **Soort inspectie**: voorjaarsinspectie, najaarsinspectie, droogte-inspectie, storminspectie en hoogwaterinspectie.
- **Resultaat**: detail en rapport met kaart (object + GPS-punten van de waarnemingen), waarnemingen als kaarten met
  kenmerken en foto's. Oranje en rood (en groen met maatregel) komen in *Maatregelen*, *Taken* en kunnen aan
  werkzaamheden gekoppeld worden; de Excel-export heeft per inspectie de aantallen rood/oranje/groen en per
  waarneming een regel. Het oordeel van een STOWA-inspectie is de zwaarste urgentie (geen NEN 2767-conditiescore).

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
- **Als werkpakket**: kies bij een ronde van een werkpakket *Schouw / inspectie* → *Boomveiligheidscontrole* en stel het samen uit
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

## Kleurthema

De app is standaard licht, ook als de pc of telefoon op donkere modus staat. Onder *Instellingen → Voorkeuren* kun je
per apparaat kiezen voor donker of 'volg instelling van het apparaat'.

## Twee weergaven

| | Telefoon – **veldversie** | Pc – **volledige versie** |
|---|---|---|
| Doel | Snel vastleggen buiten | Inrichten, beheren en rapporteren |
| Start | Twee grote knoppen: **Registratie werkzaamheden** en **Schouw & inspectie** | Stuurdashboard (opdrachtnemer / opdrachtgever) |
| Object kiezen | Zoeken of **📍 Dichtbij** (GPS, gesorteerd op afstand) | Lijsten met filters |
| Menu | Onderin: Start · Werkzaamheden · Schouw · Account | Bovenin: Dashboard · Objecten · Werkpakketten · Planning · Flora & fauna · Instellingen |

De weergave wordt automatisch gekozen op schermbreedte. Onder *Instellingen → Weergave op dit apparaat* (of
*Account → Volledige versie openen* op de telefoon) kun je dat per apparaat vastzetten.

### Menu-indeling (pc)

- **Werkpakketten** met tabbladen *Werkpakketten · Inspecties · Werkzaamheden · Maatregelen*: inspecties en
  werkzaamheden worden uitgevoerd binnen werkpakketten, en maatregelen zijn altijd het resultaat daarvan.
- **Inspecties alleen binnen een werkpakket**, met één uitzondering: *Inspectie na incident / calamiteit* kan los
  (knop *⚠️ Incident / calamiteit* bij Inspecties, en onderaan elke keuzelijst; het formulier staat dan vast op die
  soort en toont een waarschuwing). Verder werkt het als bij werkzaamheden: eerst de actieve inspectieronde kiezen,
  vanaf een object direct naar de enige passende ronde, alleen objecten uit de ronde. Ook de boomveiligheidscontrole
  en de STOWA-inspectie lopen via hun ronde. Een nieuwe boom inmeten (*＋ Nieuwe boom op mijn locatie*) doe je op de
  telefoon binnen een actieve BVC-ronde; de boom wordt dan meteen aan het werkpakket toegevoegd.
- **Werkzaamheden alleen binnen een werkpakket.** Elke registratie hoort bij een actieve werkronde. Vanaf het
  dashboard, de lijst of de telefoon (*Registratie werkzaamheden*) kies je eerst de ronde; vanaf een object of taak
  gaat de app direct naar de enige passende ronde, of laat de keuze zien als er meer zijn. Zit het object in geen
  actieve werkronde, dan meldt de app dat (beheerders krijgen *+ Werkpakket met dit object*). In het formulier kies je
  alleen uit de objecten van de ronde. Oudere werkzaamheden zonder pakket blijven gewoon zichtbaar en bewerkbaar.
- **Werkpakket ↔ planning**: in het werkpakket geef je het **aantal rondes** en per ronde de **duur** (weken of
  dagen; elke ronde mag anders zijn). In de planning kies je de startdatum; wijzig je later de duur, dan schuift de
  einddatum mee, en verleng je een balk in de planning, dan past de duur in het werkpakket zich aan.
- **Planning**: werkpakketten maak je onder *Werkpakketten* (zonder datums); inplannen doe je hier op het
  **planningsbord**: per werkpakket de rondes als balken in de tijd (weken, maanden of jaar; ◀ Vandaag ▶).
  - **Inplannen**: klik in een lege rij op de startdatum (de duur uit het werkpakket wordt gebruikt), of trek de periode.
  - **Verschuiven / verlengen**: sleep de balk, of sleep de linker- of rechterrand.
  - **Klik op een balk**: datums precies invullen, status (gepland / actief / afgerond), uit de planning halen (met
    bevestigingsvraag; de ronde en registraties blijven bestaan).
  - Naast elke ronde het **voortgangspercentage** van die ronde. Afgeronde rondes blijven staan: **groen met ✓**.
  - Past de naam niet op een korte balk, dan wordt hij ingekort tot *R1 · 40%* of *R1*; bij heel korte balken staat
    het label ernaast.
  - Kleur = soort (oranje werkzaamheid, blauw inspectie), gestreept = gepland, donkere vulling = voortgang,
    rode rand = te laat, rode lijn = vandaag. Filter op soort.
  - Na het maken van een werkpakket ga je direct naar de planning, met dat pakket uitgelicht; op een werkpakket
    staat de knop *📅 Inplannen*. Gewone gebruikers zien het bord alleen-lezen.
  Daaronder alle taken (zelf gepland, openstaande maatregelen, inspectieplanning). Oude links naar `#/taken`
  openen de planning.
- **Flora & fauna**: ongewijzigd.
- **Instellingen** met voor beheerders het tabblad *Kaart & GIS* (lagen, GIS inladen). Gewone gebruikers zien geen
  kaart en GIS: het tabblad ontbreekt, de pagina is geblokkeerd en links naar de kaart zijn weg.

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
- **Dashboard** – stuurdashboard met schakelaar *Opdrachtnemer | Opdrachtgever* (wordt onthouden)
  (verlopen / binnenkort / op schema, op basis van laatste afgeronde inspectie + interval).
- **Maatregelen** – alle onderhoudsadviezen gesorteerd op urgentie, totale raming, afvinken als uitgevoerd.
- **Kaart** – objecten op de PDOK-luchtfoto (standaard 50% sterkte, vervaagd naar wit; instelbaar met de 🛰️-schuif; wisselen naar OpenStreetMap via de lagenknop). *Kaart & GIS* toont puur het areaal: kleur op laag, objecttype of een GIS-kenmerk, met aantallen, oppervlakte en lengte per laag. De achtergrond vereist internet.
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
js/pakketten.js       werkpakketten en rondes: voortgang, toewijzing en objectfilters
js/pakketexcel.js     Excel-sjabloon (keuzelijsten, controles, beveiliging) en import met controle
js/resultatenexcel.js inspectieresultaten naar Excel (resultaten, gebreken, maatregelen, foto's)
js/stowa.js           STOWA-systematiek waterkeringen: zones, 61 inspectiewijzers, keuzelijsten, urgentie
js/planning.js        planningsbord: dagen, weken, balkposities en verslepen (pure functies)
js/digigids.js        Digigids: 100 schadebeelden (6 categorieën) met klassen, criteria en voorbeeldfoto's
js/gisimport.js       GIS inladen: splitsen per geometrie, instellingen raden, controles, bestaande laag bijwerken
js/bvc.js             boomveiligheidscontrole volgens protocol RWS, SUF-BVC, RD-coördinaten
js/ecologie.js        flora- en fauna-vrijgave (veldcheck) volgens Gedragscode Soortenbescherming RWS
vendor/               shpjs, sql.js, Leaflet en ExcelJS, lokaal meegeleverd zodat import en kaart ook offline werken
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
