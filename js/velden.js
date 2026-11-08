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
  checklist: 'Checklist',
};

/** Velden voor een formulier, gefilterd op de gekozen soort (leeg 'alleenBij' = altijd). */
export function zichtbareVelden(defs, formulier, soort = '') {
  return (defs ?? []).filter((d) => d.formulier === formulier
    && (!d.alleenBij?.length || d.alleenBij.includes(soort)));
}

export function isLeeg(def, waarde) {
  if (def.type === 'janee') return waarde !== true && waarde !== false;
  if (def.type === 'checklist') return (def.opties ?? []).some((o) => !(waarde ?? []).includes(o));
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
    default: return String(waarde);
  }
}

/** Alle foto-id's uit foto-velden. */
export function extraFotoIds(defs, extra) {
  return (defs ?? []).filter((d) => d.type === 'foto').flatMap((d) => extra?.[d.id] ?? []);
}

/** Maakt een veld schoon: alleen relevante eigenschappen per type. */
export function normaliseer(def) {
  const d = {
    id: def.id, formulier: def.formulier, label: String(def.label ?? '').trim(), type: def.type,
    verplicht: Boolean(def.verplicht), hulptekst: String(def.hulptekst ?? '').trim(),
    alleenBij: [...new Set(def.alleenBij ?? [])],
  };
  if (d.type === 'getal') Object.assign(d, { eenheid: String(def.eenheid ?? '').trim(), min: def.min ?? '', max: def.max ?? '' });
  if (d.type === 'keuze' || d.type === 'checklist') {
    d.opties = [...new Set((def.opties ?? []).map((o) => String(o).trim()).filter(Boolean))];
  }
  return d;
}
