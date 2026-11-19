// Stuurinformatie voor het dashboard (puur, testbaar): ligt een ronde op schema, hoeveel werk is er per week
// uitgevoerd, en wat staat er de komende tijd te starten.
import { dagNr, isoVan, maandag, weeknummer, periode } from './planning.js';

/**
 * Schema-signaal van een ronde: verwachte voortgang (verstreken deel van de periode) tegenover de werkelijke.
 * @param {object} r            ronde (start, eind, status)
 * @param {{ totaal: number, percentage: number, open: string[] }} vg  voortgang van de ronde
 * @param {string} vandaagIso
 */
export function schema(r, vg, vandaagIso) {
  const p = periode(r);
  const vandaag = dagNr(vandaagIso);
  const werkelijk = vg?.percentage ?? 0;
  const resterendObj = vg?.open?.length ?? 0;
  if (r.status === 'afgerond') return { signaal: 'afgerond', verwacht: 100, werkelijk, resterendObj, resterendDagen: 0, tempo: 0 };
  if (!p) return { signaal: 'ongepland', verwacht: null, werkelijk, resterendObj, resterendDagen: null, tempo: null };
  const duur = p.eind - p.start + 1;
  // Verwacht: het deel van de periode dat tot en met gisteren verstreken is (op de startdag nog 0%).
  const verstreken = Math.min(duur, Math.max(0, vandaag - p.start));
  const verwacht = Math.round((verstreken / duur) * 100);
  const resterendDagen = Math.max(0, p.eind - vandaag + 1);
  const tempo = resterendDagen ? Math.ceil((resterendObj / resterendDagen) * 10) / 10 : resterendObj;
  let signaal;
  if (vandaag < p.start) signaal = 'nog niet gestart';
  else if (vandaag > p.eind && werkelijk < 100) signaal = 'te laat';
  else if (verwacht - werkelijk > 25) signaal = 'flinke achterstand';
  else if (verwacht - werkelijk > 10) signaal = 'achter';
  else signaal = 'op schema';
  return { signaal, verwacht, werkelijk, resterendObj, resterendDagen, tempo };
}

export const SIGNAAL = {
  'op schema': { klasse: 'afgerond', ernst: 0 },
  'nog niet gestart': { klasse: 'gepland', ernst: 1 },
  ongepland: { klasse: '', ernst: 1 },
  achter: { klasse: 'binnenkort', ernst: 2 },
  'flinke achterstand': { klasse: 'verlopen', ernst: 3 },
  'te laat': { klasse: 'verlopen', ernst: 4 },
  afgerond: { klasse: 'afgerond', ernst: -1 },
};

/** Uitgevoerde werkzaamheden per week (laatste n weken, t/m de huidige). */
export function perWeek(werkzaamheden, vandaagIso, weken = 8) {
  const deze = maandag(dagNr(vandaagIso));
  const lijst = Array.from({ length: weken }, (_, i) => {
    const van = deze - (weken - 1 - i) * 7;
    return { van: isoVan(van), week: weeknummer(van), aantal: 0, uren: 0 };
  });
  for (const w of werkzaamheden) {
    const d = dagNr(w.datum);
    if (d === null) continue;
    const i = weken - 1 - Math.floor((deze - maandag(d)) / 7);
    if (i < 0 || i >= weken) continue;
    lijst[i].aantal += 1;
    lijst[i].uren += Number(w.uren) || 0;
  }
  return lijst;
}

/** Tellen per sleutel, gesorteerd van groot naar klein. */
export function telPer(lijst, sleutel) {
  const m = new Map();
  for (const x of lijst) {
    const k = sleutel(x) || '(onbekend)';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl'));
}

/** Rondes die binnen n dagen starten en nog niet actief zijn. */
export function startBinnenkort(rondes, vandaagIso, dagen = 14) {
  const v = dagNr(vandaagIso);
  return rondes.filter((x) => x.r.status === 'gepland' && x.r.start && dagNr(x.r.start) <= v + dagen)
    .sort((a, b) => String(a.r.start).localeCompare(String(b.r.start)));
}

/**
 * Indeling van een eigen dashboard: [{ id, breed }] in volgorde. Onbekende of dubbele blokken vallen weg;
 * zonder geldige eigen indeling geldt de standaard.
 * @param {any} opgeslagen       eigen indeling (of null)
 * @param {{id: string, breed?: boolean}[]} standaard
 * @param {string[]} beschikbaar ids van de blokken die er (voor deze gebruiker) zijn
 */
export function indeling(opgeslagen, standaard, beschikbaar) {
  const mag = new Set(beschikbaar);
  const schoon = (lijst) => {
    const gezien = new Set();
    return (Array.isArray(lijst) ? lijst : []).filter((b) => b && mag.has(b.id) && !gezien.has(b.id) && gezien.add(b.id))
      .map((b) => ({ id: b.id, breed: Boolean(b.breed), ...(b.opties && typeof b.opties === 'object' ? { opties: b.opties } : {}) }));
  };
  const eigen = schoon(opgeslagen);
  return eigen.length ? eigen : schoon(standaard);
}

/** Verplaatst een blok in de indeling (naar positie van doel, of omhoog/omlaag). */
export function verplaats(lijst, id, { naar = null, stap = 0 } = {}) {
  const i = lijst.findIndex((b) => b.id === id);
  if (i < 0) return lijst;
  const kopie = [...lijst];
  const [blok] = kopie.splice(i, 1);
  let j;
  if (naar) {
    j = kopie.findIndex((b) => b.id === naar);
    if (j < 0) return lijst;
    if (i <= j) j += 1; // naar beneden: na het doel
  } else j = Math.max(0, Math.min(kopie.length, i + stap));
  kopie.splice(j, 0, blok);
  return kopie;
}

/**
 * Status van een object over de gekozen werkpakketten heen: open als het in één ervan nog open is, anders
 * overgeslagen, anders gedaan. null = het object zit in geen van de gekozen pakketten.
 * @param {string} objectId
 * @param {{gedaan: Map, overgeslagen: Map, open: string[]}[]} voortgangen  de rondes die meetellen
 */
export function objectStatusInPakketten(objectId, voortgangen) {
  let in_ = false;
  let over = false;
  let gedaan = false;
  let deels = false;
  for (const vg of voortgangen) {
    if (vg.open.includes(objectId) && !vg.deels?.has(objectId)) return 'open';
    if (vg.deels?.has(objectId)) { deels = true; continue; }
    if (vg.overgeslagen.has(objectId)) { in_ = true; over = true; } else if (vg.gedaan.has(objectId)) { in_ = true; gedaan = true; }
  }
  if (deels) return 'deels';
  if (!in_) return null;
  return over ? 'overgeslagen' : gedaan ? 'gedaan' : null;
}
