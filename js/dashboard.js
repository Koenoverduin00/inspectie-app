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
