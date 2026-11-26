// Rapporten als PDF: elke registratie (werkzaamheid, inspectie/schouw, BVC, waterkering, flora & fauna) als net
// PDF-bestand om te delen met de opdrachtgever, met vaste bestandsnamen en metadata zodat het ook in hun systemen past.
// Per project stelt de beheerder per soort het rapport samen: welke blokken, in welke volgorde, met welke titels,
// eigen tekstblokken en handtekeningvakken. Deze module is puur (geen DOM): gegevens + sjabloon → pdfmake-definitie.

export const SOORTEN = {
  werk: { label: 'Werkregistratie', titel: 'Werkregistratie' },
  inspectie: { label: 'Inspectie / schouw', titel: 'Inspectierapport' },
  bvc: { label: 'Boomveiligheidscontrole', titel: 'Rapport boomveiligheidscontrole' },
  stowa: { label: 'Inspectie waterkering', titel: 'Inspectierapport waterkering' },
  vrijgave: { label: 'Flora & fauna vrijgave', titel: 'Flora- en fauna-vrijgave' },
};

/** Alle blokken die in een rapport kunnen staan. soorten: voor welke registraties het blok zinvol is. */
export const BLOKKEN = {
  samenvatting: { titel: 'Oordeel en status', uitleg: 'Oordeel, conditie of besluit met de status bovenaan het rapport.', soorten: ['werk', 'inspectie', 'bvc', 'stowa', 'vrijgave'] },
  object: { titel: 'Object', uitleg: 'Objectcode, naam, type, locatie en beheerder.', soorten: ['werk', 'inspectie', 'bvc', 'stowa'], opties: { gis: false } },
  registratie: { titel: 'Gegevens registratie', uitleg: 'Datum, uitvoerder of inspecteur, werkpakket en ronde, uren.', soorten: ['werk', 'inspectie', 'bvc', 'stowa', 'vrijgave'] },
  omschrijving: { titel: 'Omschrijving', uitleg: 'Omschrijving, samenvatting, vervolg en opmerkingen.', soorten: ['werk', 'inspectie'] },
  bevindingen: { titel: 'Overzicht bevindingen', uitleg: 'Tabel met gebreken of bevindingen, maatregel, urgentie en raming.', soorten: ['inspectie'], opties: { kosten: true } },
  details: { titel: 'Detailbevindingen', uitleg: 'Per gebrek of bevinding alle gegevens met foto\'s.', soorten: ['inspectie'] },
  inhoud: { titel: 'Gegevens', uitleg: 'Alle gegevens van het formulier (boom, waterkering, besluit en waarnemingen).', soorten: ['bvc', 'stowa', 'vrijgave'] },
  velden: { titel: 'Extra gegevens', uitleg: 'Eigen formuliervelden van het project.', soorten: ['werk', 'inspectie', 'bvc', 'stowa', 'vrijgave'] },
  fotos: { titel: "Foto's", uitleg: "Foto's (vóór en ná apart), met onderschrift.", soorten: ['werk', 'inspectie', 'bvc', 'stowa', 'vrijgave'], opties: { grootte: 'middel', onderschrift: true } },
  locatie: { titel: 'Locatie', uitleg: 'Coördinaten (WGS84 en RD) en een link naar de kaart.', soorten: ['werk', 'inspectie', 'bvc', 'stowa', 'vrijgave'] },
  beoordeling: { titel: 'Beoordeling', uitleg: 'Goedkeuring of afkeuring van de registratie.', soorten: ['werk', 'inspectie', 'bvc', 'stowa'] },
  handtekening: { titel: 'Ondertekening', uitleg: 'Handtekeningvakken (met de digitale handtekening als die er is).', soorten: ['werk', 'inspectie', 'bvc', 'stowa', 'vrijgave'], opties: { vakken: 'Uitvoerder, Opdrachtgever' } },
  systeem: { titel: 'Gegevens voor systemen', uitleg: 'Unieke kenmerken (registratie-id, object-id, codes, tijdstippen) om het rapport in andere systemen te koppelen.', soorten: ['werk', 'inspectie', 'bvc', 'stowa', 'vrijgave'] },
};
export const TEKSTBLOK = 'tekst:';
export const FOTO_GROOTTE = { klein: 4, middel: 3, groot: 2, heel: 1 };

const STANDAARD_VOLGORDE = {
  werk: ['samenvatting', 'object', 'registratie', 'omschrijving', 'velden', 'fotos', 'locatie', 'beoordeling', 'handtekening', 'systeem'],
  inspectie: ['samenvatting', 'object', 'registratie', 'omschrijving', 'bevindingen', 'details', 'velden', 'fotos', 'locatie', 'beoordeling', 'handtekening', 'systeem'],
  bvc: ['samenvatting', 'object', 'registratie', 'inhoud', 'velden', 'fotos', 'locatie', 'beoordeling', 'handtekening', 'systeem'],
  stowa: ['samenvatting', 'object', 'registratie', 'inhoud', 'velden', 'fotos', 'locatie', 'beoordeling', 'handtekening', 'systeem'],
  vrijgave: ['samenvatting', 'registratie', 'inhoud', 'velden', 'fotos', 'locatie', 'handtekening', 'systeem'],
};
const STANDAARD_UIT = new Set(['systeem', 'locatie']);

export const ALGEMEEN_STANDAARD = {
  organisatie: '', logo: '', kleur: '#0b4f6c', voettekst: '', paginanummers: true, rapportdatum: true,
  bestandsnaam: '{project}_{object}_{soort}_{datum}', json: false,
};

/** Standaardsjabloon voor één soort. */
const VAKKEN = { werk: 'Uitvoerder, Opdrachtgever', inspectie: 'Inspecteur, Opdrachtgever', bvc: 'Boomveiligheidscontroleur, Opdrachtgever', stowa: 'Inspecteur, Opdrachtgever', vrijgave: 'Ecoloog, Opdrachtgever' };
const standaardOpties = (id, soort) => ({ ...(BLOKKEN[id]?.opties ?? {}), ...(id === 'handtekening' ? { vakken: VAKKEN[soort] ?? BLOKKEN.handtekening.opties.vakken } : {}) });
export function standaardSoort(soort) {
  return {
    titel: SOORTEN[soort]?.titel ?? 'Rapport',
    blokken: (STANDAARD_VOLGORDE[soort] ?? []).map((id) => ({ id, aan: !STANDAARD_UIT.has(id), titel: BLOKKEN[id].titel, opties: standaardOpties(id, soort) })),
  };
}

/**
 * Het sjabloon voor een soort uit de projectinstellingen, aangevuld met de standaard: nieuwe blokken van de app komen
 * er (uitgeschakeld) achter, onbekende blokken vallen weg, eigen tekstblokken blijven.
 */
export function sjabloon(rapporten, soort) {
  const eigen = rapporten?.soorten?.[soort];
  const std = standaardSoort(soort);
  const algemeen = { ...ALGEMEEN_STANDAARD, ...(rapporten?.algemeen ?? {}) };
  if (!eigen?.blokken) return { ...std, titel: eigen?.titel || std.titel, algemeen };
  const geldig = (b) => b.id.startsWith(TEKSTBLOK) || BLOKKEN[b.id]?.soorten.includes(soort);
  const blokken = eigen.blokken.filter(geldig).map((b) => ({ ...b, opties: { ...standaardOpties(b.id, soort), ...(b.opties ?? {}) } }));
  for (const b of std.blokken) if (!blokken.some((x) => x.id === b.id)) blokken.push({ ...b, aan: false });
  return { titel: eigen.titel || std.titel, blokken, algemeen };
}

/** Bestandsnaam uit het patroon, bijv. {project}_{object}_{soort}_{datum} → "Park_Zuid_KW-001_Inspectierapport_2026-11-26.pdf". */
export function bestandsnaam(patroon, delen, extensie = 'pdf') {
  const schoon = (x) => String(x ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const naam = String(patroon || ALGEMEEN_STANDAARD.bestandsnaam).replace(/\{(\w+)\}/g, (_, k) => schoon(delen[k])).replace(/_+/g, '_').replace(/^[_.-]+|[_.-]+$/g, '');
  return `${(naam || 'rapport').slice(0, 150)}.${extensie}`;
}

/** Machineleesbare versie van het rapport (zonder foto's), voor import in andere systemen. */
export function gegevensJson(d, { gemaakt = '' } = {}) {
  const kv = (lijst) => Object.fromEntries((lijst ?? []).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, v]));
  return {
    formaat: 'baasoverbuiten-registratie/1', gemaakt, soort: d.soort, titel: d.titel,
    project: d.project, kenmerken: kv(d.systeem), object: kv(d.object?.velden), objectGis: kv(d.object?.gis),
    oordeel: d.oordeel?.label ?? null, status: d.status ?? null, registratie: kv(d.registratie),
    omschrijving: Object.fromEntries((d.omschrijving ?? []).map((x) => [x.titel, x.tekst])),
    bevindingen: d.bevindingen ? d.bevindingen.rijen.map((r) => Object.fromEntries(d.bevindingen.kolommen.map((k, n) => [k, r[n]]))) : [],
    gegevens: (d.inhoud ?? []).map((s) => ({ titel: s.titel, velden: kv(s.velden), tabel: s.tabel ?? null })),
    extra: kv(d.velden), locatie: d.locatie ?? null, beoordeling: d.beoordeling ?? null,
    fotos: (d.fotos ?? []).map((g) => ({ titel: g.titel, aantal: g.items.length })),
  };
}

// ---------------------------------------------------------------------------
// pdfmake-definitie
// ---------------------------------------------------------------------------
const GRIJS = '#5b6875';
const LIJN = '#d5dbe1';
const tekst = (v) => (v === null || v === undefined || v === '' ? '–' : String(v));
const lichtVan = (hex, f = 0.88) => {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return '#eef2f5';
  const n = parseInt(m[1], 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((x) => Math.round(x + (255 - x) * f));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};
const contrast = (hex) => {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 160 ? '#1d2a36' : '#ffffff';
};
const kop = (t, kleur) => ({ text: t, style: 'h2', color: kleur, margin: [0, 14, 0, 6] });
const sleutelwaarde = (rijen, { klein = false } = {}) => ({
  table: { widths: [rijen.some(([k]) => String(k ?? '').length > 34) ? 230 : klein ? 130 : 150, '*'], body: rijen.map(([k, v]) => [{ text: k, style: 'label' }, { text: tekst(v), style: klein ? 'klein' : 'waarde' }]) },
  layout: { hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => LIJN, paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 0 },
});
const tabel = ({ kolommen, rijen }, kleur, { totaal = null } = {}) => ({
  table: {
    headerRows: 1, dontBreakRows: true,
    widths: kolommen.map((_, n) => (n === 0 && kolommen.length > 3 ? 'auto' : '*')),
    body: [
      kolommen.map((k) => ({ text: k, style: 'th', fillColor: lichtVan(kleur, 0.86) })),
      ...rijen.map((r) => r.map((c) => (c && typeof c === 'object' && c.chip ? chip(c.chip, c.kleur) : { text: tekst(c), style: 'td' }))),
      ...(totaal ? [[{ text: totaal[0], style: 'td', bold: true, colSpan: kolommen.length - 1 }, ...Array(kolommen.length - 2).fill(''), { text: totaal[1], style: 'td', bold: true }]] : []),
    ],
  },
  layout: { hLineWidth: (i) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => LIJN, paddingTop: () => 4, paddingBottom: () => 4 },
});
const chip = (label, kleur) => ({
  table: { body: [[{ text: tekst(label), color: contrast(kleur), fillColor: kleur || '#8a96a3', bold: true, fontSize: 8.5, margin: [4, 1, 4, 1] }]] },
  layout: 'noBorders',
});
const fotoRaster = (items, n, onderschrift) => {
  const breedte = (515 - (n - 1) * 8) / n;
  const rijen = [];
  for (let i = 0; i < items.length; i += n) {
    rijen.push({
      columns: Array.from({ length: n }, (_, k) => {
        const f = items[i + k];
        if (!f) return { width: breedte, text: '' };
        return { width: breedte, stack: [{ image: f.data, fit: [breedte, breedte * 0.75] }, ...(onderschrift && f.onderschrift ? [{ text: f.onderschrift, style: 'onderschrift' }] : [])] };
      }),
      columnGap: 8, margin: [0, 0, 0, 8], unbreakable: true,
    });
  }
  return rijen;
};

/**
 * pdfmake-documentdefinitie voor één registratie.
 * @param d   genormaliseerde gegevens (zie rapportGegevens in app.js)
 * @param sj  sjabloon (zie sjabloon())
 */
export function documentDefinitie(d, sj, { vandaag = '', datumNL = (x) => x } = {}) {
  const a = sj.algemeen ?? ALGEMEEN_STANDAARD;
  const kleur = /^#[\da-f]{6}$/i.test(a.kleur) ? a.kleur : ALGEMEEN_STANDAARD.kleur;
  const inhoud = [];
  // Titelblok
  inhoud.push({
    columns: [
      { width: '*', stack: [
        { text: sj.titel || d.titel, style: 'h1', color: kleur },
        ...(d.ondertitel ? [{ text: d.ondertitel, style: 'ondertitel' }] : []),
        { text: [d.project?.naam, d.project?.opdrachtgever ? `Opdrachtgever: ${d.project.opdrachtgever}` : ''].filter(Boolean).join('  ·  '), style: 'klein', color: GRIJS, margin: [0, 2, 0, 0] },
      ] },
      ...(a.rapportdatum ? [{ width: 'auto', stack: [{ text: 'Rapportdatum', style: 'label', alignment: 'right' }, { text: datumNL(vandaag), alignment: 'right', fontSize: 10 }] }] : []),
    ],
    margin: [0, 0, 0, 4],
  });
  inhoud.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: kleur }], margin: [0, 4, 0, 6] });

  const blokken = (sj.blokken ?? []).filter((b) => b.aan);
  for (const b of blokken) {
    const titel = b.titel || BLOKKEN[b.id]?.titel || '';
    if (b.id.startsWith(TEKSTBLOK)) {
      if (b.opties?.tekst || titel) inhoud.push({ stack: [...(titel ? [kop(titel, kleur)] : []), { text: b.opties?.tekst ?? '', style: 'waarde' }], unbreakable: true });
      continue;
    }
    switch (b.id) {
      case 'samenvatting': {
        const cel = [];
        if (d.oordeel) cel.push({ stack: [{ text: d.oordeel.titel || 'Oordeel', style: 'label' }, chip(d.oordeel.label, d.oordeel.kleur)] });
        if (d.status) cel.push({ stack: [{ text: 'Status', style: 'label' }, { text: d.status, bold: true, fontSize: 10 }] });
        if (d.beoordeling?.status) cel.push({ stack: [{ text: 'Beoordeling', style: 'label' }, { text: d.beoordeling.status, bold: true, fontSize: 10 }] });
        if (d.kernTekst) cel.push({ width: '*', stack: [{ text: d.kernTekst.titel, style: 'label' }, { text: d.kernTekst.tekst, fontSize: 10 }] });
        if (cel.length) inhoud.push({ table: { widths: ['*'], body: [[{ columns: cel.map((c) => ({ width: c.width ?? 'auto', ...c })), columnGap: 24, fillColor: lichtVan(kleur, 0.93), margin: [8, 6, 8, 6] }]] }, layout: 'noBorders', margin: [0, 4, 0, 2] });
        break;
      }
      case 'object':
        if (!d.object) break;
        inhoud.push({ stack: [kop(titel, kleur), sleutelwaarde(d.object.velden), ...(b.opties?.gis && d.object.gis?.length ? [{ text: 'Kenmerken uit het GIS-bestand', style: 'label', margin: [0, 6, 0, 2] }, sleutelwaarde(d.object.gis, { klein: true })] : [])], unbreakable: !b.opties?.gis });
        break;
      case 'registratie':
        if (d.registratie?.length) inhoud.push({ stack: [kop(titel, kleur), sleutelwaarde(d.registratie)], unbreakable: true });
        break;
      case 'omschrijving':
        if (d.omschrijving?.length) inhoud.push(kop(titel, kleur), ...d.omschrijving.map((x) => ({ stack: [...(x.titel && x.titel !== titel ? [{ text: x.titel, style: 'label' }] : []), { text: tekst(x.tekst), style: 'waarde', margin: [0, 1, 0, 6] }] })));
        break;
      case 'bevindingen':
        if (!d.bevindingen) break;
        if (!d.bevindingen.rijen.length) { inhoud.push(kop(titel, kleur), { text: d.bevindingen.leeg || 'Geen bevindingen.', style: 'waarde' }); break; }
        {
          const metKosten = b.opties?.kosten !== false && d.bevindingen.kostenKolom != null;
          const weg = metKosten ? -1 : d.bevindingen.kostenKolom;
          const kolommen = d.bevindingen.kolommen.filter((_, n) => n !== weg);
          const rijen = d.bevindingen.rijen.map((r) => r.filter((_, n) => n !== weg));
          inhoud.push(kop(titel, kleur), tabel({ kolommen, rijen }, kleur, { totaal: metKosten ? d.bevindingen.totaal : null }));
        }
        break;
      case 'details':
        if (!d.details?.length) break;
        inhoud.push(kop(titel, kleur));
        d.details.forEach((x, n) => {
          inhoud.push({
            stack: [
              { columns: [{ text: `${n + 1}. ${x.titel}`, bold: true, fontSize: 11, width: '*' }, ...(x.chip ? [{ width: 'auto', ...chip(x.chip.label, x.chip.kleur) }] : [])], margin: [0, 6, 0, 4] },
              sleutelwaarde(x.velden ?? []),
              ...(x.teksten ?? []).map(([k, v]) => ({ stack: [{ text: k, style: 'label', margin: [0, 4, 0, 0] }, { text: tekst(v), style: 'waarde' }] })),
              ...(x.fotos?.length ? [{ text: '', margin: [0, 4] }, ...fotoRaster(x.fotos, 4, false)] : []),
            ],
            margin: [0, 0, 0, 6], unbreakable: (x.fotos?.length ?? 0) <= 4,
          });
        });
        break;
      case 'inhoud':
        for (const s of d.inhoud ?? []) {
          const delen = [kop(s.titel || titel, kleur)];
          if (s.velden?.length) delen.push(sleutelwaarde(s.velden));
          if (s.tekst) delen.push({ text: s.tekst, style: 'waarde' });
          if (s.tabel?.rijen?.length) delen.push(tabel(s.tabel, kleur));
          inhoud.push({ stack: delen, unbreakable: (s.velden?.length ?? 0) < 14 && !(s.tabel?.rijen?.length > 6) });
        }
        break;
      case 'velden':
        if (d.velden?.length) inhoud.push({ stack: [kop(titel, kleur), sleutelwaarde(d.velden)] });
        break;
      case 'fotos': {
        const groepen = (d.fotos ?? []).filter((g) => g.items.length);
        if (!groepen.length) break;
        const n = FOTO_GROOTTE[b.opties?.grootte] ?? FOTO_GROOTTE.middel;
        // De kop en de naam van de groep blijven bij de eerste rij foto's (geen losse kop onderaan een pagina).
        groepen.forEach((g, gi) => {
          const rijen = fotoRaster(g.items, n, b.opties?.onderschrift !== false);
          const kopjes = [...(gi === 0 ? [kop(titel, kleur)] : []), ...(groepen.length > 1 || g.titel !== titel ? [{ text: `${g.titel} (${g.items.length})`, style: 'label', margin: [0, 2, 0, 4] }] : [])];
          rijen[0] = { stack: [...kopjes, rijen[0]], unbreakable: true };
          inhoud.push(...rijen);
        });
        break;
      }
      case 'locatie':
        if (d.locatie) inhoud.push({ stack: [kop(titel, kleur), sleutelwaarde([['WGS84', d.locatie.wgs], ['RD (EPSG:28992)', d.locatie.rd], ['Omschrijving', d.locatie.omschrijving]].filter(([, v]) => v)), ...(d.locatie.link ? [{ text: 'Bekijk op de kaart', link: d.locatie.link, color: kleur, decoration: 'underline', fontSize: 9, margin: [0, 4, 0, 0] }] : [])], unbreakable: true });
        break;
      case 'beoordeling':
        if (d.beoordeling) inhoud.push({ stack: [kop(titel, kleur), sleutelwaarde([['Status', d.beoordeling.status], ['Door', d.beoordeling.door], ['Datum', d.beoordeling.op], ['Toelichting', d.beoordeling.reden]].filter(([, v]) => v))], unbreakable: true });
        break;
      case 'handtekening': {
        const labels = String(b.opties?.vakken ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        const digitaal = d.handtekeningen ?? [];
        const vakken = [...digitaal.map((h) => ({ label: h.label, naam: h.naam, data: h.data, datum: h.datum })),
          ...labels.filter((l) => !digitaal.some((h) => h.label.toLowerCase() === l.toLowerCase())).map((l) => ({ label: l, naam: /^(uitvoer|inspect|controleur|boomveiligheid|ecolo|deskundige)/i.test(l) ? d.uitvoerder : '' }))];
        if (!vakken.length) break;
        const rijen = [];
        for (let i = 0; i < vakken.length; i += 2) {
          rijen.push({
            columns: [0, 1].map((k) => {
              const v = vakken[i + k];
              if (!v) return { width: '*', text: '' };
              return { width: '*', stack: [
                { text: v.label, style: 'label' },
                v.data ? { image: v.data, fit: [180, 60], margin: [0, 4, 0, 2] } : { text: ' ', margin: [0, 30, 0, 0] },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.7, lineColor: '#6b7785' }] },
                { text: [v.naam, v.datum].filter(Boolean).join('  ·  ') || 'Naam en datum', style: 'klein', color: v.naam ? '#1d2a36' : GRIJS, margin: [0, 2, 0, 0] },
              ] };
            }),
            columnGap: 30, margin: [0, 4, 0, 10],
          });
        }
        inhoud.push({ stack: [kop(titel, kleur), ...rijen], unbreakable: true });
        break;
      }
      case 'systeem':
        if (d.systeem?.length) inhoud.push({ stack: [kop(titel, kleur), sleutelwaarde(d.systeem, { klein: true })], unbreakable: true });
        break;
      default:
    }
  }
  if (d.voetnoot) inhoud.push({ text: d.voetnoot, style: 'onderschrift', margin: [0, 14, 0, 0] });

  return {
    pageSize: 'A4',
    pageMargins: [40, a.logo || a.organisatie ? 64 : 44, 40, 48],
    info: {
      title: `${sj.titel || d.titel}${d.meta?.object ? ` ${d.meta.object}` : ''}`,
      author: a.organisatie || d.project?.naam || '',
      subject: d.meta?.onderwerp ?? '',
      keywords: (d.meta?.trefwoorden ?? []).filter(Boolean).join(', '),
      creator: 'BaasOverBuiten',
      producer: 'BaasOverBuiten',
    },
    header: a.logo || a.organisatie ? () => ({
      columns: [
        ...(a.logo ? [{ image: a.logo, fit: [110, 30], width: 'auto' }] : []),
        { text: a.organisatie || '', bold: true, fontSize: 10, color: kleur, margin: [a.logo ? 10 : 0, 8, 0, 0], width: '*' },
        { text: `${sj.titel || d.titel}${d.meta?.object ? ` · ${d.meta.object}` : ''}`, fontSize: 8, color: GRIJS, alignment: 'right', margin: [0, 10, 0, 0], width: 'auto' },
      ],
      margin: [40, 22, 40, 0],
    }) : undefined,
    footer: (pagina, aantal) => ({
      columns: [
        { text: [a.voettekst, d.meta?.kenmerk ? `Kenmerk ${d.meta.kenmerk}` : ''].filter(Boolean).join('  ·  '), fontSize: 7.5, color: GRIJS, width: '*' },
        ...(a.paginanummers !== false ? [{ text: `Pagina ${pagina} van ${aantal}`, fontSize: 7.5, color: GRIJS, alignment: 'right', width: 'auto' }] : []),
      ],
      margin: [40, 16, 40, 0],
    }),
    content: inhoud,
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.15, color: '#1d2a36' },
    styles: {
      h1: { fontSize: 19, bold: true },
      ondertitel: { fontSize: 11, color: '#1d2a36', margin: [0, 2, 0, 0] },
      h2: { fontSize: 12, bold: true },
      label: { fontSize: 7.5, color: GRIJS, bold: true, characterSpacing: 0.3 },
      waarde: { fontSize: 9.5 },
      klein: { fontSize: 8.5 },
      th: { fontSize: 8, bold: true, color: '#1d2a36' },
      td: { fontSize: 8.5 },
      onderschrift: { fontSize: 7.5, color: GRIJS, margin: [0, 2, 0, 0] },
    },
  };
}
