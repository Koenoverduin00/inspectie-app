// Storingen- en gebrekenregister: meldingen die kantoor klaarzet én storingen die buiten direct worden opgelost,
// samengevoegd tot zaken met een status. Puur, zonder DOM.
import * as IZ from './inzet.js';

export const URGENTIES = [['direct', 'Direct'], ['24u', 'Binnen 24 uur'], ['week', 'Deze week'], ['normaal', 'Normaal']];
export const URGENTIE_LABEL = Object.fromEntries(URGENTIES);
const URGENTIE_RANG = { direct: 0, '24u': 1, week: 2, normaal: 3, '': 4 };

export const STATUS = {
  open: { label: 'Open', klasse: 'binnenkort' },
  bezig: { label: 'In behandeling', klasse: 'deels' },
  opgelost: { label: 'Opgelost', klasse: 'afgerond' },
  vervallen: { label: 'Vervallen', klasse: '' },
};
const STATUS_RANG = { open: 0, bezig: 1, opgelost: 2, vervallen: 3 };

/** Bij welke zaak hoort een storingsregistratie? Een klaargezette melding, een eerdere registratie (vervolg) of zichzelf. */
export const zaakVan = (w) => w?.storing?.zaakId || w?.storing?.meldingId || w?.id;

const moment = (w) => String(w?.storing?.opgelostOp || w?.datum || '');

/**
 * Alle zaken: per melding (kantoor) of per storing die buiten is gemeld en opgelost (veld), met de acties erbij.
 * Status: open (nog niets gedaan), bezig (wel gedaan, niet opgelost), opgelost of vervallen.
 */
export function zaken({ meldingen = [], werk = [] }) {
  const perZaak = new Map();
  for (const w of werk) {
    if (!w?.storing) continue;
    const z = zaakVan(w);
    perZaak.set(z, [...(perZaak.get(z) ?? []), w]);
  }
  // Op tijdstip; binnen dezelfde minuut (het formulier rekent in minuten) op het moment van vastleggen.
  for (const l of perZaak.values()) l.sort((a, b) => moment(a).localeCompare(moment(b)) || String(a.aangemaakt ?? a.gewijzigd ?? '').localeCompare(String(b.aangemaakt ?? b.gewijzigd ?? '')));
  const uit = [];
  for (const m of meldingen) {
    if (!m || m.verwijderd) continue;
    const acties = perZaak.get(m.id) ?? [];
    perZaak.delete(m.id);
    uit.push(maak(m.id, m.bron === 'buiten' ? 'veld' : 'kantoor', m, acties));
  }
  for (const [id, acties] of perZaak) {
    const eerste = acties.find((a) => a.id === id) ?? acties[0];
    uit.push(maak(id, 'veld', {
      objectId: eerste.objectId, type: eerste.storing.type, melding: eerste.storing.melding, gemeldOp: eerste.storing.gemeldOp,
      referentie: '', urgentie: '', toegewezenAan: '', door: eerste.uitvoerder || eerste.beoordeling?.ingediendDoor || '',
      nummer: eerste.storing?.nummer || '', pakketId: eerste.werkpakketId || '',
    }, acties));
  }
  return uit.sort((a, b) => STATUS_RANG[a.status] - STATUS_RANG[b.status]
    || URGENTIE_RANG[a.urgentie ?? ''] - URGENTIE_RANG[b.urgentie ?? '']
    || String(b.gemeldOp || b.laatsteOp).localeCompare(String(a.gemeldOp || a.laatsteOp)));
}

function maak(id, bron, m, acties) {
  const laatste = acties[acties.length - 1] ?? null;
  const status = m.vervallen ? 'vervallen' : !laatste ? 'open' : laatste.storing?.resultaat === 'opgelost' ? 'opgelost' : 'bezig';
  const inzet = acties.flatMap((a) => a.storing?.inzet ?? []);
  return {
    id, bron, melding: m.id ? m : null,
    objectId: m.objectId, type: m.type || laatste?.storing?.type || '', omschrijving: m.melding || '',
    referentie: m.referentie || acties.map((a) => a.storing?.referentie).find(Boolean) || '',
    nummer: m.nummer || acties.map((a) => a.storing?.nummer).find(Boolean) || '',
    pakketId: m.pakketId || acties.map((a) => a.werkpakketId).find(Boolean) || '',
    gemeldOp: m.gemeldOp || '', urgentie: m.urgentie || '', toegewezenAan: m.toegewezenAan || '', door: m.door || '',
    acties, laatste, laatsteOp: laatste ? moment(laatste) : '', status,
    opgelostOp: status === 'opgelost' ? moment(laatste) : '',
    uren: IZ.totalen(inzet),
  };
}

/** Wat een ploeg buiten nog moet doen: open en in behandeling; toegewezen aan mij of aan niemand. */
export function voorBuiten(lijst, email = '') {
  const ik = String(email).toLowerCase();
  return lijst.filter((z) => (z.status === 'open' || z.status === 'bezig') && (!z.toegewezenAan || !ik || z.toegewezenAan.toLowerCase() === ik));
}

/** Telling per status (voor tegels en badges). */
export function telling(lijst) {
  const t = { open: 0, bezig: 0, opgelost: 0, vervallen: 0 };
  for (const z of lijst) t[z.status] += 1;
  return t;
}

// ---------------------------------------------------------------------------
// Registernummer: elke storing en elk gebrek krijgt automatisch een eigen nummer, bijv. OPZ-S26-0042.
//   OPZ   = afkorting van het project (instelbaar; anders de projectcode of de beginletters van de naam)
//   S/G   = soort: S storing, G gebrek, D schade, M melding, C calamiteit, A anders
//   26    = jaar waarin het is gemeld
//   0042  = volgnummer, per project per jaar doorlopend over alle soorten
// Het eigen nummer staat los van de referentie van de opdrachtgever (die kan er altijd naast).
// ---------------------------------------------------------------------------
const LETTER = { storing: 'S', gebrek: 'G', schade: 'D', melding: 'M', calamiteit: 'C', anders: 'A' };
export const soortLetter = (type) => LETTER[String(type ?? '').trim().split(/\s/)[0].toLowerCase()] ?? 'S';

/** Afkorting voor het project: zelf ingesteld, de projectcode, of de beginletters van de naam (zonder getallen). */
export function projectAfkorting(project) {
  const schoon = (x) => String(x ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const eigen = schoon(project?.registerAfkorting) || schoon(project?.code);
  if (eigen) return eigen.slice(0, 8);
  const woorden = String(project?.naam ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[\s\-_/]+/).filter((w) => /^[A-Za-z]/.test(w));
  const letters = woorden.map((w) => w[0].toUpperCase()).join('').slice(0, 4);
  return letters.length >= 2 ? letters : (schoon(project?.naam).slice(0, 3) || 'REG');
}

const PATROON = /^([A-Z0-9]+)-([A-Z])(\d{2})-(\d{4,})$/;
/** Ontleed een nummer, of null. */
export function ontleed(nummer) {
  const m = PATROON.exec(String(nummer ?? ''));
  return m ? { afk: m[1], letter: m[2], jj: m[3], nr: Number(m[4]) } : null;
}

/** Het volgende vrije nummer voor dit project en jaar. */
export function nieuwNummer({ afkorting, type, datum, bestaande = [] }) {
  const jj = String(datum || '').slice(2, 4) || String(new Date().getFullYear()).slice(2);
  let max = 0;
  for (const n of bestaande) {
    const o = ontleed(n);
    if (o && o.afk === afkorting && o.jj === jj && o.nr > max) max = o.nr;
  }
  return `${afkorting}-${soortLetter(type)}${jj}-${String(max + 1).padStart(4, '0')}`;
}

/**
 * Zaken zonder nummer (van vóór deze functie) of met een dubbel nummer (twee toestellen tegelijk offline): nieuwe
 * nummers, op volgorde van melden. De eerst gemelde houdt bij een dubbel zijn nummer.
 * @returns {{ id: string, nummer: string }[]}
 */
export function nummersBijwerken(zaken, afkorting) {
  const op = (z) => String(z.gemeldOp || z.acties?.[0]?.datum || '');
  const gesorteerd = [...zaken].sort((a, b) => op(a).localeCompare(op(b)) || String(a.id).localeCompare(String(b.id)));
  const gezien = new Set();
  const bestaande = zaken.map((z) => z.nummer).filter(Boolean);
  const uit = [];
  for (const z of gesorteerd) {
    if (z.nummer && !gezien.has(z.nummer)) { gezien.add(z.nummer); continue; }
    const nummer = nieuwNummer({ afkorting, type: z.type, datum: op(z) || undefined, bestaande: [...bestaande, ...uit.map((x) => x.nummer)] });
    uit.push({ id: z.id, nummer });
    gezien.add(nummer);
  }
  return uit;
}
