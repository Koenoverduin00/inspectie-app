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
  for (const l of perZaak.values()) l.sort((a, b) => moment(a).localeCompare(moment(b)));
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
