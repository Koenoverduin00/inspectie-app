// Extra formuliervelden per project: definities, zichtbaarheid, controle en weergave.
// Een project bevat `velden: [{ id, formulier, label, type, ... }]`; een registratie
// bewaart de antwoorden in `extra: { [veldId]: waarde }`.

export const FORMULIEREN = {
  werk: 'Werkzaamheden',
  inspectie: 'Schouw & inspectie',
  taak: 'Taken',
};

export const VELDTYPEN = {
  tekst: 'Tekst',
  getal: 'Getal',
  keuze: 'Keuzelijst',
  janee: 'Ja / nee',
  datum: 'Datum',
  tijd: 'Tijd',
  foto: 'Foto',
  checklist: 'Checklist (alles afvinken)',
  meerkeuze: 'Meerkeuze (meerdere opties)',
  locatie: 'Locatie (punt op de kaart)',
  handtekening: 'Handtekening',
  tijdsduur: 'Begin- en eindtijd (+ ploeg)',
  bijlage: 'Bijlage (pdf of document)',
};

/** Velden waarvan het antwoord als voorwaarde voor een ander veld kan dienen. */
export const VOORWAARDE_TYPEN = ['janee', 'keuze', 'meerkeuze'];

/** Voldoet het antwoord op het bronveld aan de voorwaarde? */
export function voldoetAan(bron, waarde, verwacht) {
  if (!bron) return true;
  if (bron.type === 'janee') return (verwacht === 'Ja' && waarde === true) || (verwacht === 'Nee' && waarde === false);
  if (bron.type === 'meerkeuze') return (waarde ?? []).includes(verwacht);
  return waarde === verwacht;
}

/**
 * Velden voor een formulier, gefilterd op de gekozen soort (leeg 'alleenBij' = altijd) en, als de antwoorden
 * worden meegegeven, op voorwaarden ("alleen tonen als …"). Een veld waarvan het bronveld verborgen is, is ook verborgen.
 */
export function zichtbareVelden(defs, formulier, soort = '', extra = null) {
  // soort === null: niet op soort filteren (dat is al gebeurd).
  const opSoort = (defs ?? []).filter((d) => d.formulier === formulier
    && (soort === null || !d.alleenBij?.length || d.alleenBij.includes(soort)));
  if (!extra) return opSoort;
  const perId = new Map(opSoort.map((d) => [d.id, d]));
  const zichtbaar = new Map();
  const isZichtbaar = (d, diepte = 0) => {
    if (zichtbaar.has(d.id)) return zichtbaar.get(d.id);
    let ok = true;
    if (d.toonAls?.veld && diepte < 10) {
      const bron = perId.get(d.toonAls.veld);
      ok = Boolean(bron) && isZichtbaar(bron, diepte + 1) && voldoetAan(bron, extra[bron.id], d.toonAls.waarde);
    }
    zichtbaar.set(d.id, ok);
    return ok;
  };
  return opSoort.filter((d) => isZichtbaar(d));
}

/** Duur in minuten van een tijdsduur-antwoord (over middernacht mag), minus pauze. */
export function duurMinuten(v) {
  const min = (t) => { const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const b = min(v?.begin);
  const e = min(v?.eind);
  if (b === null || e === null) return null;
  return Math.max(0, (e >= b ? e - b : e + 1440 - b) - (Number(v?.pauze) || 0));
}
const uurTekst = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} u`;

export function isLeeg(def, waarde) {
  if (def.type === 'janee') return waarde !== true && waarde !== false;
  if (def.type === 'checklist') return (def.opties ?? []).some((o) => !(waarde ?? []).includes(o));
  if (def.type === 'locatie') return !(Number.isFinite(Number(waarde?.lat)) && Number.isFinite(Number(waarde?.lng)) && waarde?.lat !== '' && waarde?.lat != null);
  if (def.type === 'handtekening') return !waarde?.foto;
  if (def.type === 'tijdsduur') return !waarde?.begin || !waarde?.eind;
  if (Array.isArray(waarde)) return waarde.length === 0;
  return waarde === undefined || waarde === null || String(waarde).trim() === '';
}

/** Controleert verplichte velden en grenzen; geeft een lijst met meldingen terug. */
export function controleer(defs, extra) {
  const fouten = [];
  for (const d of defs) {
    const v = extra?.[d.id];
    if (d.verplicht && isLeeg(d, v)) {
      fouten.push(d.type === 'checklist' ? `${d.label}: vink alle punten af` : `${d.label} is verplicht`);
      continue;
    }
    if (d.type === 'handtekening' && d.verplicht && !String(v?.naam ?? '').trim()) fouten.push(`${d.label}: vul de naam van de ondertekenaar in`);
    if (d.type === 'tijdsduur' && v?.begin && v?.eind && duurMinuten(v) === 0) fouten.push(`${d.label}: de eindtijd moet na de begintijd liggen`);
    if (d.type === 'tijdsduur' && (v?.begin ? !v?.eind : v?.eind)) fouten.push(`${d.label}: vul zowel begin- als eindtijd in`);
    if (d.type === 'getal' && v !== '' && v != null) {
      const n = Number(v);
      if (!Number.isFinite(n)) fouten.push(`${d.label} moet een getal zijn`);
      else if (d.min !== '' && d.min != null && n < Number(d.min)) fouten.push(`${d.label} moet minimaal ${d.min} zijn`);
      else if (d.max !== '' && d.max != null && n > Number(d.max)) fouten.push(`${d.label} mag maximaal ${d.max} zijn`);
    }
  }
  return fouten;
}

/** Leesbare weergave van een antwoord (foto's worden apart getoond). */
export function toonWaarde(def, waarde, datumFn = (x) => x) {
  if (def.type === 'janee') return waarde === true ? 'Ja' : waarde === false ? 'Nee' : '–';
  if (isLeeg({ ...def, type: def.type === 'checklist' ? 'lijst' : def.type }, waarde)) return '–';
  switch (def.type) {
    case 'getal': return `${String(waarde).replace('.', ',')}${def.eenheid ? ` ${def.eenheid}` : ''}`;
    case 'datum': return datumFn(waarde);
    case 'checklist': {
      const lijst = waarde ?? [];
      return `${lijst.length} van ${(def.opties ?? []).length} afgevinkt${lijst.length ? `: ${lijst.join(', ')}` : ''}`;
    }
    case 'foto': return `${waarde.length} foto('s)`;
    case 'meerkeuze': return (waarde ?? []).join(', ');
    case 'locatie': return `${Number(waarde.lat).toFixed(6)}, ${Number(waarde.lng).toFixed(6)}${waarde.bron === 'gps' ? ` (GPS${waarde.nauwkeurigheid ? ` ± ${waarde.nauwkeurigheid} m` : ''})` : ' (op de kaart gezet)'}`;
    case 'handtekening': return `Getekend${waarde.naam ? ` door ${waarde.naam}` : ''}${waarde.op ? ` op ${datumFn(String(waarde.op).slice(0, 10))}` : ''}`;
    case 'tijdsduur': {
      const duur = duurMinuten(waarde);
      const ploeg = Number(waarde.personen) || 1;
      return `${waarde.begin}–${waarde.eind}${duur != null ? ` · ${uurTekst(duur)}` : ''}${waarde.pauze ? ` (pauze ${waarde.pauze} min)` : ''}${ploeg > 1 && duur != null ? ` · ${ploeg} personen = ${(Math.round((duur * ploeg) / 6) / 10).toString().replace('.', ',')} manuur` : ''}`;
    }
    case 'bijlage': return (waarde ?? []).map((b) => b.naam).join(', ');
    default: return String(waarde);
  }
}

/** Alle foto-id's uit foto-velden. */
export function extraFotoIds(defs, extra) {
  return (defs ?? []).flatMap((d) => {
    const v = extra?.[d.id];
    if (d.type === 'foto') return v ?? [];
    if (d.type === 'handtekening') return v?.foto ? [v.foto] : [];
    if (d.type === 'bijlage') return (v ?? []).map((b) => b.id);
    return [];
  });
}

/** Maakt een veld schoon: alleen relevante eigenschappen per type. */
export function normaliseer(def) {
  const d = {
    id: def.id, formulier: def.formulier, label: String(def.label ?? '').trim(), type: def.type,
    verplicht: Boolean(def.verplicht), hulptekst: String(def.hulptekst ?? '').trim(),
    alleenBij: [...new Set(def.alleenBij ?? [])],
  };
  if (d.type === 'getal') Object.assign(d, { eenheid: String(def.eenheid ?? '').trim(), min: def.min ?? '', max: def.max ?? '' });
  if (d.type === 'keuze' || d.type === 'checklist' || d.type === 'meerkeuze') {
    d.opties = [...new Set((def.opties ?? []).map((o) => String(o).trim()).filter(Boolean))];
  }
  if (d.type === 'tijdsduur') Object.assign(d, { pauze: Boolean(def.pauze), ploeg: Boolean(def.ploeg) });
  if (def.toonAls?.veld && def.toonAls?.waarde) d.toonAls = { veld: def.toonAls.veld, waarde: String(def.toonAls.waarde) };
  return d;
}
