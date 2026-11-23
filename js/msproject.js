// Planning naar Microsoft Project: MSPDI-XML (Project opent dit direct via Bestand → Openen → XML-indeling).
// Werkpakket = samenvattingstaak, ronde = taak eronder (handmatig gepland, zodat de datums precies blijven zoals in de app),
// taken met een deadline = mijlpalen. Uitvoerders worden resources met toewijzingen. Puur: geen DOM, geen database.

const DAG = 86400000;
const xml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Tekens die in XML 1.0 niet mogen (stuurtekens) weglaten.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const isDatum = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '');
const dagNr = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAG);
const isoVan = (n) => new Date(n * DAG).toISOString().slice(0, 10);

/** Aantal werkdagen (ma–vr) van start t/m eind; minimaal 1. */
export function werkdagen(start, eind) {
  let n = 0;
  for (let d = dagNr(start); d <= dagNr(eind); d += 1) {
    const wd = new Date(d * DAG).getUTCDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return Math.max(1, n);
}
const duur = (uren) => `PT${uren}H0M0S`;

/**
 * Periode van een ronde zoals de app hem tekent: zonder einddatum telt één week; zonder start is hij niet gepland.
 * @returns {{start: string, eind: string, open: boolean} | null}
 */
export function periodeVan(r) {
  if (!isDatum(r?.start)) return null;
  const open = !isDatum(r?.eind) || r.eind < r.start;
  return { start: r.start, eind: open ? isoVan(dagNr(r.start) + 6) : r.eind, open };
}

/**
 * @param {object} invoer
 * @param {string} invoer.naam projectnaam
 * @param {{code?:string, naam:string, notitie?:string, uitvoerders?:string[],
 *          rondes:{code?:string, naam:string, start?:string, eind?:string, percentage?:number, notitie?:string, status?:string}[]}[]} invoer.groepen
 * @param {{naam:string, datum:string, notitie?:string, uitvoerder?:string}[]} [invoer.mijlpalen]
 * @param {string} [invoer.auteur]
 * @param {string} [invoer.nu] ISO-tijd van aanmaken
 * @returns {{ xml: string, taken: number, nietGepland: string[] }}
 */
export function mspdi({ naam, groepen = [], mijlpalen = [], auteur = '', nu = new Date().toISOString() }) {
  const nietGepland = [];
  const resources = new Map(); // naam → UID
  const resource = (n) => {
    const s = String(n ?? '').trim();
    if (!s) return null;
    if (!resources.has(s)) resources.set(s, resources.size + 1);
    return resources.get(s);
  };
  const taken = []; // { uid, naam, niveau, nummer, start, eind, samenvatting, mijlpaal, pct, notitie, resources }
  let uid = 0;
  let nr1 = 0;
  for (const g of groepen) {
    const kinderen = [];
    for (const r of g.rondes ?? []) {
      const p = periodeVan(r);
      const titel = [r.code, r.naam].filter(Boolean).join(' ');
      if (!p) { nietGepland.push(`${[g.code, g.naam].filter(Boolean).join(' ')} – ${titel}`); continue; }
      kinderen.push({ r, p, titel });
    }
    if (!kinderen.length) continue;
    nr1 += 1;
    const res = (g.uitvoerders ?? []).map(resource).filter(Boolean);
    const groep = { uid: ++uid, naam: [g.code, g.naam].filter(Boolean).join(' '), niveau: 1, nummer: `${nr1}`, samenvatting: true, notitie: g.notitie ?? '',
      start: kinderen.reduce((m, k) => (k.p.start < m ? k.p.start : m), kinderen[0].p.start),
      eind: kinderen.reduce((m, k) => (k.p.eind > m ? k.p.eind : m), kinderen[0].p.eind), resources: [] };
    taken.push(groep);
    kinderen.sort((a, b) => a.p.start.localeCompare(b.p.start)).forEach((k, i) => {
      taken.push({ uid: ++uid, naam: k.titel, niveau: 2, nummer: `${nr1}.${i + 1}`, start: k.p.start, eind: k.p.eind,
        pct: Math.max(0, Math.min(100, Math.round(Number(k.r.percentage) || 0))),
        notitie: [k.r.notitie, k.p.open ? 'Geen einddatum in de app: als één week ingepland.' : ''].filter(Boolean).join('\n'), resources: res });
    });
  }
  const mp = mijlpalen.filter((m) => isDatum(m.datum)).sort((a, b) => a.datum.localeCompare(b.datum));
  if (mp.length) {
    nr1 += 1;
    taken.push({ uid: ++uid, naam: 'Taken (deadlines)', niveau: 1, nummer: `${nr1}`, samenvatting: true, start: mp[0].datum, eind: mp.at(-1).datum, resources: [] });
    mp.forEach((m, i) => taken.push({ uid: ++uid, naam: m.naam, niveau: 2, nummer: `${nr1}.${i + 1}`, start: m.datum, eind: m.datum, mijlpaal: true,
      notitie: m.notitie ?? '', resources: [resource(m.uitvoerder)].filter(Boolean) }));
  }
  const begin = taken.reduce((m, t) => (!m || t.start < m ? t.start : m), '') || nu.slice(0, 10);
  const einde = taken.reduce((m, t) => (!m || t.eind > m ? t.eind : m), '') || begin;
  const tijd = (d, eind = false) => `${d}T${eind ? '17:00:00' : '08:00:00'}`;

  const taakXml = (t) => {
    const uren = t.mijlpaal ? 0 : werkdagen(t.start, t.eind) * 8;
    return `<Task>
<UID>${t.uid}</UID><ID>${t.uid}</ID><Name>${xml(t.naam)}</Name><Active>1</Active><Manual>${t.samenvatting ? 0 : 1}</Manual><Type>1</Type><IsNull>0</IsNull>
<CreateDate>${nu.slice(0, 19)}</CreateDate><WBS>${t.nummer}</WBS><OutlineNumber>${t.nummer}</OutlineNumber><OutlineLevel>${t.niveau}</OutlineLevel><Priority>500</Priority>
<Start>${tijd(t.start)}</Start><Finish>${tijd(t.eind, !t.mijlpaal)}</Finish><Duration>${duur(uren)}</Duration>${t.samenvatting ? '' : `<ManualStart>${tijd(t.start)}</ManualStart><ManualFinish>${tijd(t.eind, !t.mijlpaal)}</ManualFinish><ManualDuration>${duur(uren)}</ManualDuration>`}<DurationFormat>7</DurationFormat>
<EffortDriven>0</EffortDriven><Recurring>0</Recurring><Estimated>0</Estimated><Milestone>${t.mijlpaal ? 1 : 0}</Milestone><Summary>${t.samenvatting ? 1 : 0}</Summary>
${t.samenvatting ? '' : `<PercentComplete>${t.pct ?? 0}</PercentComplete>`}<ConstraintType>0</ConstraintType><CalendarUID>-1</CalendarUID>${t.notitie ? `<Notes>${xml(t.notitie)}</Notes>` : ''}
</Task>`;
  };
  const werkdag = (n) => `<WeekDay><DayType>${n}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`;
  const toewijzingen = taken.flatMap((t) => t.resources.map((r) => ({ taak: t, r })));
  const out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
<SaveVersion>14</SaveVersion><Name>${xml(naam)}.xml</Name><Title>${xml(naam)}</Title>${auteur ? `<Author>${xml(auteur)}</Author>` : ''}<CreationDate>${nu.slice(0, 19)}</CreationDate>
<ScheduleFromStart>1</ScheduleFromStart><StartDate>${tijd(begin)}</StartDate><FinishDate>${tijd(einde, true)}</FinishDate><CalendarUID>1</CalendarUID>
<DefaultStartTime>08:00:00</DefaultStartTime><DefaultFinishTime>17:00:00</DefaultFinishTime><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth>
<Calendars><Calendar><UID>1</UID><Name>Standaard</Name><IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>
<WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>${[2, 3, 4, 5, 6].map(werkdag).join('')}<WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
</WeekDays></Calendar></Calendars>
<Tasks>
<Task><UID>0</UID><ID>0</ID><Name>${xml(naam)}</Name><Active>1</Active><Manual>0</Manual><Type>1</Type><IsNull>0</IsNull><WBS>0</WBS><OutlineNumber>0</OutlineNumber><OutlineLevel>0</OutlineLevel><Start>${tijd(begin)}</Start><Finish>${tijd(einde, true)}</Finish><Summary>1</Summary></Task>
${taken.map(taakXml).join('\n')}
</Tasks>
<Resources>
<Resource><UID>0</UID><ID>0</ID><Type>1</Type><IsNull>0</IsNull></Resource>
${[...resources].map(([n, id]) => `<Resource><UID>${id}</UID><ID>${id}</ID><Name>${xml(n)}</Name><Type>1</Type><IsNull>0</IsNull><MaxUnits>1.00</MaxUnits></Resource>`).join('\n')}
</Resources>
<Assignments>
${toewijzingen.map((a, i) => `<Assignment><UID>${i + 1}</UID><TaskUID>${a.taak.uid}</TaskUID><ResourceUID>${a.r}</ResourceUID><Units>1</Units></Assignment>`).join('\n')}
</Assignments>
</Project>
`;
  const naamVan = new Map([...resources].map(([n, id]) => [id, n]));
  return { xml: out, taken: taken.filter((t) => !t.samenvatting).length, nietGepland, regels: taken.map((t) => ({ ...t, resources: t.resources.map((id) => naamVan.get(id)) })) };
}

/** Kolommen voor een Excel-tabel die de importwizard van MS Project kan inlezen (velden koppelen per kolom). */
export const EXCEL_KOLOMMEN = ['Overzichtsnummer', 'Overzichtsniveau', 'Naam', 'Begindatum', 'Einddatum', 'Duur (werkdagen)', '% voltooid', 'Mijlpaal', 'Resourcenamen', 'Notities'];
export function excelRegels(regels) {
  return regels.map((t) => [t.nummer, t.niveau, t.naam, t.start, t.eind, t.mijlpaal ? 0 : werkdagen(t.start, t.eind),
    t.samenvatting ? '' : (t.pct ?? 0), t.mijlpaal ? 'Ja' : 'Nee', t.resources.join(';'), t.notitie ?? '']);
}
