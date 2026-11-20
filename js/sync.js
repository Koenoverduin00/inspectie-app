// Synchronisatie met Supabase via de REST-API's (Auth, PostgREST en Storage).
// Offline-first: de app werkt altijd op de lokale IndexedDB; wijzigingen staan in een
// wachtrij en worden verstuurd zodra er verbinding is. Nieuwe gegevens van andere
// apparaten worden opgehaald op basis van een server-tijdstempel (sync_tijd).
import * as db from './db.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const TABELLEN = ['projecten', 'lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken', 'werkpakketten', 'overgeslagen', 'vrijgaven', 'meldingen'];
// Tabellen die nieuwer zijn dan sommige installaties: ontbreekt de tabel op de server, dan slaat de sync hem over
// (de gegevens blijven lokaal en in de wachtrij) in plaats van helemaal te stoppen.
const OPTIONEEL = new Set(['meldingen']);
const ontbrekend = new Set();
/** Ontbreekt deze (nieuwe) tabel op de server? Dan moet het SQL-script nog worden uitgevoerd. */
export const tabelOntbreekt = (tabel) => ontbrekend.has(tabel);
const isOntbrekendeTabel = (fout) => fout?.status === 404 || fout?.code === 'PGRST205' || fout?.code === '42P01' || /schema cache|does not exist/i.test(fout?.message ?? '');
const BUCKET = 'fotos';
const OVERLAP_MS = 60_000; // haal iets terug in de tijd opnieuw op i.v.m. gelijktijdige transacties
const PAGINA = 500;

// ---------------------------------------------------------------------------
// Lokale instellingen
// ---------------------------------------------------------------------------
const PREFIX = 'inspectie-app:';
function lees(sleutel) {
  try { return JSON.parse(localStorage.getItem(PREFIX + sleutel)); } catch { return null; }
}
function schrijf(sleutel, waarde) {
  try {
    if (waarde == null) localStorage.removeItem(PREFIX + sleutel);
    else localStorage.setItem(PREFIX + sleutel, JSON.stringify(waarde));
  } catch { /* opslag geblokkeerd */ }
}

export function configuratie() {
  const eigen = lees('supabase') ?? {};
  return {
    url: String(eigen.url || SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    key: String(eigen.key || SUPABASE_KEY || '').trim(),
  };
}
export function stelIn(url, key) {
  schrijf('supabase', { url: url.trim(), key: key.trim() });
  zetStatus({ fase: bepaalRustFase(), fout: '' });
}
export const isIngesteld = () => {
  const c = configuratie();
  return Boolean(c.url && c.key);
};

// ---------------------------------------------------------------------------
// Status (voor de indicator in de kop en de instellingenpagina)
// ---------------------------------------------------------------------------
const status = { fase: 'uit', fout: '', laatsteSync: lees('laatsteSync'), wachtend: 0, rol: lees('rol'), geweigerd: [] };
const statusLuisteraars = new Set();
export function opStatus(fn) {
  statusLuisteraars.add(fn);
  fn(status);
  return () => statusLuisteraars.delete(fn);
}
function zetStatus(wijziging) {
  Object.assign(status, wijziging);
  statusLuisteraars.forEach((fn) => fn(status));
}
function bepaalRustFase() {
  if (!isIngesteld()) return 'uit';
  if (!sessie()) return 'uitgelogd';
  if (!navigator.onLine) return 'offline';
  return 'ok';
}
async function werkWachtendBij() {
  zetStatus({ wachtend: await db.sync.aantalInWachtrij() });
}

// ---------------------------------------------------------------------------
// Authenticatie
// ---------------------------------------------------------------------------
class NietIngelogd extends Error {}
/** De server gaf binnen de tijd geen antwoord. Telt als verbindingsprobleem: later opnieuw proberen. */
class TijdOver extends TypeError {}
const WACHT_MS = 30_000; // gewone verzoeken
const WACHT_FOTO_MS = 120_000; // foto's (groter, ook bij een trage verbinding)

/** fetch met een tijdslimiet: een verzoek dat blijft hangen mag de synchronisatie niet eindeloos laten wachten. */
async function haalMetLimiet(url, opties = {}, ms = WACHT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opties, signal: ac.signal });
  } catch (fout) {
    if (ac.signal.aborted) throw new TijdOver(`De server reageerde niet binnen ${Math.round(ms / 1000)} seconden. Controleer de verbinding; de app probeert het zo opnieuw.`);
    throw fout;
  } finally {
    clearTimeout(t);
  }
}

const FOUTVERTALINGEN = [
  [/invalid login credentials/i, 'Onjuist e-mailadres of wachtwoord.'],
  [/email not confirmed/i, 'Je e-mailadres is nog niet bevestigd. Klik op de link in de bevestigingsmail.'],
  [/user already registered/i, 'Er bestaat al een account met dit e-mailadres. Log in.'],
  [/password should be at least/i, 'Het wachtwoord moet minimaal 6 tekens lang zijn.'],
  [/email rate limit/i, 'Er zijn te veel e-mails verstuurd. Supabase verstuurt zonder eigen mailserver maar een paar mails per uur; stel een eigen SMTP-server in (Supabase → Authentication → Emails).'],
  [/rate limit|too many requests|for security purposes/i, 'Te veel pogingen. Wacht even en probeer het opnieuw.'],
  [/error sending .*email|smtp/i, 'De e-mail kon niet worden verstuurd. Controleer de mailinstellingen in Supabase (Authentication → Emails → SMTP).'],
  [/new password should be different/i, 'Kies een ander wachtwoord dan je huidige.'],
  [/signups not allowed/i, 'Nieuwe accounts aanmaken is uitgeschakeld. Vraag de beheerder om een uitnodiging.'],
  [/row-level security|permission denied|unauthorized/i,
    'Geweigerd door de toegangsregels van de server: je account mag dit niet wijzigen (bijv. projectinstellingen zijn alleen voor beheerders, of je bent geen lid van dit project). Kijk bij Instellingen → Account → Verbinding testen.'],
  [/invalid api key|no api key/i, 'De Supabase-sleutel is ongeldig. Controleer de instellingen.'],
  [/relation .* does not exist|could not find the table/i, 'De database is nog niet ingericht. Voer supabase/schema.sql uit.'],
  [/bucket not found/i, 'De opslag voor foto\'s ontbreekt. Voer supabase/schema.sql uit.'],
];
function vertaal(tekst) {
  return FOUTVERTALINGEN.find(([re]) => re.test(tekst))?.[1] ?? tekst;
}
async function foutUit(res) {
  const data = await res.json().catch(() => ({}));
  const fout = new Error(vertaal(String(data.error_description || data.msg || data.message || data.error || `Serverfout ${res.status}`)));
  fout.status = res.status;
  fout.code = data.code;
  return fout;
}

export const sessie = () => lees('sessie');

async function authVerzoek(pad, body) {
  const { url, key } = configuratie();
  const res = await haalMetLimiet(`${url}/auth/v1/${pad}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await foutUit(res);
  return res.json();
}

function bewaarSessie(d) {
  schrijf('sessie', {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    verloopt: Date.now() + (Number(d.expires_in) || 3600) * 1000,
    gebruiker: { id: d.user?.id, email: d.user?.email, profiel: profielUit(d.user) ?? sessie()?.gebruiker?.profiel ?? null },
  });
}

/** Naam en organisatie uit het account (vastgelegd bij de eerste keer inloggen). */
function profielUit(user) {
  const m = user?.user_metadata;
  if (!m || (!m.naam && !m.organisatie)) return null;
  return { naam: String(m.naam ?? ''), organisatie: String(m.organisatie ?? ''), vastOp: m.profielVastOp ?? '' };
}
export const profiel = () => sessie()?.gebruiker?.profiel ?? null;

/** Legt naam en organisatie eenmalig vast in het eigen account. */
export async function zetProfiel({ naam, organisatie }) {
  const s = sessie();
  if (!s) throw new Error('Log eerst in.');
  const { url, key } = configuratie();
  const res = await fetch(`${url}/auth/v1/user`, {
    method: 'PUT', headers: { apikey: key, Authorization: `Bearer ${await toegangstoken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { naam, organisatie, profielVastOp: new Date().toISOString() } }),
  });
  if (!res.ok) throw await foutUit(res);
  const user = await res.json();
  schrijf('sessie', { ...sessie(), gebruiker: { ...sessie().gebruiker, profiel: profielUit(user) ?? { naam, organisatie, vastOp: new Date().toISOString() } } });
}

/** Beheerder: naam en organisatie van een ander account corrigeren (script 010). */
export async function zetProfielVan(email, { naam, organisatie }) {
  await api('/rest/v1/rpc/zet_profiel', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_email: email, p_naam: naam, p_organisatie: organisatie }),
  });
}

export async function inloggen(email, wachtwoord) {
  bewaarSessie(await authVerzoek('token?grant_type=password', { email, password: wachtwoord }));
  zetStatus({ fase: 'bezig', fout: '' });
  synchroniseer();
}

export async function registreren(email, wachtwoord) {
  const d = await authVerzoek('signup', { email, password: wachtwoord });
  if (!d.access_token) return { bevestigen: true };
  bewaarSessie(d);
  zetStatus({ fase: 'bezig', fout: '' });
  synchroniseer();
  return { bevestigen: false };
}

/**
 * Uitnodiging per e-mail: Supabase maakt (als dat nog niet bestaat) een account aan en stuurt een inloglink.
 * Gebruikt alleen de publieke sleutel; de beheerdersrechten zitten in de projectledenlijst (RLS).
 */
export async function nodigUit(email, { naam = '', terugUrl = '' } = {}) {
  const { url, key } = configuratie();
  const q = terugUrl ? `?redirect_to=${encodeURIComponent(terugUrl)}` : '';
  const res = await fetch(`${url}/auth/v1/otp${q}`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: true, data: naam ? { naam } : {} }),
  });
  if (!res.ok) throw await foutUit(res);
}

/** Stuurt een mail met een link om een nieuw wachtwoord in te stellen. */
export async function wachtwoordVergeten(email, terugUrl) {
  const { url, key } = configuratie();
  const q = terugUrl ? `?redirect_to=${encodeURIComponent(terugUrl)}` : '';
  const res = await fetch(`${url}/auth/v1/recover${q}`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  });
  if (!res.ok) throw await foutUit(res);
}

/** Sessie uit een link in een mail (bevestiging of wachtwoordherstel): #access_token=…&refresh_token=…&type=… */
export async function sessieUitLink(params) {
  const { url, key } = configuratie();
  const token = params.get('access_token');
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await foutUit(res);
  const user = await res.json();
  bewaarSessie({ access_token: token, refresh_token: params.get('refresh_token'), expires_in: params.get('expires_in'), user });
  zetStatus({ fase: 'bezig', fout: '' });
  synchroniseer();
}

/** Nieuw wachtwoord voor de ingelogde gebruiker (na een herstel-link). */
export async function nieuwWachtwoord(wachtwoord) {
  const s = sessie();
  if (!s) throw new Error('De herstel-link is verlopen. Vraag een nieuwe aan.');
  const { url, key } = configuratie();
  const res = await fetch(`${url}/auth/v1/user`, {
    method: 'PUT', headers: { apikey: key, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: wachtwoord }),
  });
  if (!res.ok) throw await foutUit(res);
}

export async function uitloggen() {
  const s = sessie();
  if (s) {
    const { url, key } = configuratie();
    fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${s.access_token}` } })
      .catch(() => {});
  }
  schrijf('sessie', null);
  schrijf('rol', null);
  zetStatus({ fase: bepaalRustFase(), fout: '', rol: null });
}

// Eén vernieuwing tegelijk: Supabase accepteert elke vernieuwingssleutel maar één keer. Vroegen meerdere verzoeken
// tegelijk een nieuwe sleutel aan (bijv. na een uur, als de app weer opent), dan werden de andere geweigerd en werd je uitgelogd.
let vernieuwing = null;

async function toegangstoken(forceer = false) {
  const s = sessie();
  if (!s) throw new NietIngelogd('Niet ingelogd.');
  if (!forceer && Date.now() < s.verloopt - 60_000) return s.access_token;
  vernieuwing ??= vernieuw(s).finally(() => { vernieuwing = null; });
  return vernieuwing;
}

async function vernieuw(s) {
  // Ook tussen tabbladen: met een slot vernieuwt maar één tabblad tegelijk; de andere nemen de nieuwe sessie over.
  if (navigator.locks?.request) return navigator.locks.request('inspectie-app:vernieuw', () => vernieuwNu(s));
  return vernieuwNu(s);
}

async function vernieuwNu(oud) {
  const huidig = sessie();
  if (!huidig) throw new NietIngelogd('Niet ingelogd.');
  if (huidig.refresh_token !== oud.refresh_token && Date.now() < huidig.verloopt - 60_000) return huidig.access_token;
  const s = huidig;
  try {
    bewaarSessie(await authVerzoek('token?grant_type=refresh_token', { refresh_token: s.refresh_token }));
    return sessie().access_token;
  } catch (fout) {
    if (fout instanceof TypeError) throw fout; // netwerkfout: later opnieuw proberen
    // Intussen al vernieuwd (bijv. in een ander tabblad)? Dan die sessie gebruiken in plaats van uit te loggen.
    const nu = sessie();
    if (nu && nu.refresh_token !== s.refresh_token) return nu.access_token;
    // Alleen uitloggen als de server de sleutel echt afwijst; bij een serverstoring later opnieuw proberen.
    if (fout.status && fout.status >= 500) throw fout;
    schrijf('sessie', null);
    throw new NietIngelogd('Je sessie is verlopen. Log opnieuw in.');
  }
}

async function api(pad, opties = {}, opnieuw = true) {
  const { url, key } = configuratie();
  const gebruikt = await toegangstoken();
  const { limiet, ...rest } = opties;
  const res = await haalMetLimiet(url + pad, {
    ...rest,
    headers: { apikey: key, Authorization: `Bearer ${gebruikt}`, ...rest.headers },
  }, limiet ?? (pad.startsWith('/storage/') ? WACHT_FOTO_MS : WACHT_MS));
  if (res.status === 401 && opnieuw) {
    // Sleutel geweigerd: vernieuwen (gedeeld met andere verzoeken), tenzij een ander verzoek dat net al deed.
    if (sessie()?.access_token === gebruikt) await toegangstoken(true);
    return api(pad, opties, false);
  }
  if (!res.ok) throw await foutUit(res);
  return res;
}

// ---------------------------------------------------------------------------
// Rol en toegang
// ---------------------------------------------------------------------------
/** 'beheerder' (mag projecten aanmaken en ziet alles), 'lid' (alleen eigen projecten) of 'geen'. */
export async function haalRolOp() {
  const res = await api('/rest/v1/rpc/mijn_rol', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const rol = await res.json();
  schrijf('rol', rol);
  zetStatus({ rol });
  return rol;
}

/**
 * Accountstatus van personen (alleen voor beheerders, via de databasefunctie account_status uit update 006):
 * per e-mailadres { aangemaakt, uitgenodigd, bevestigd, laatst_ingelogd }. Wachtwoorden zijn niet in te zien.
 * @returns {Promise<Map<string, object>|null>} null als de functie (nog) niet bestaat.
 */
export async function accountStatus(emails) {
  try {
    const res = await api('/rest/v1/rpc/account_status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails }),
    });
    return new Map((await res.json()).map((r) => [String(r.email).toLowerCase(), r]));
  } catch (fout) {
    if (/account_status|404|PGRST202|Could not find/i.test(String(fout?.message ?? ''))) return null;
    throw fout;
  }
}

/** Rol van deze gebruiker. Zonder online account werkt de app lokaal en ben je beheerder. */
export function rol() {
  if (!isIngesteld() || !sessie()) return 'beheerder';
  return status.rol ?? lees('rol') ?? 'lid';
}

// ---------------------------------------------------------------------------
// Versturen (lokale wachtrij → server)
// ---------------------------------------------------------------------------
const VOLGORDE = ['fotos', 'projecten', 'lagen', 'objecten', 'werkpakketten', 'inspecties', 'werkzaamheden', 'taken', 'overgeslagen', 'vrijgaven', 'meldingen'];
const BATCH = 200;

async function verstuur() {
  const regels = await db.sync.wachtrij();
  // Foto's eerst (complete inspecties op andere apparaten), dan projecten vóór hun inhoud.
  regels.sort((a, b) => VOLGORDE.indexOf(a.store) - VOLGORDE.indexOf(b.store) || a.tijd.localeCompare(b.tijd));
  let eersteFout = null;
  const geweigerd = [];
  const weiger = (fout, regel = null) => {
    if (fout instanceof TypeError || fout instanceof NietIngelogd) throw fout; // geen verbinding: stoppen
    eersteFout ??= fout; // geweigerd door de server: overslaan, de rest gaat wel door
    if (regel) geweigerd.push({ store: regel.store, id: regel.recordId, melding: fout.message, geenRecht: isGeenRecht(fout) });
  };

  const totaal = regels.length;
  let klaar = 0;
  const voortgang = (n = 0) => { klaar += n; zetStatus({ voortgang: totaal ? `Versturen: ${Math.min(klaar, totaal)} van ${totaal}` : '' }); };
  voortgang();
  for (const regel of regels.filter((r) => r.store === 'fotos')) {
    try {
      voortgang(1);
      await verstuurFoto(regel);
      await db.sync.afgehandeld(regel);
      zetStatus({ wachtend: Math.max(0, status.wachtend - 1) });
    } catch (fout) { weiger(fout, regel); }
  }
  for (const store of VOLGORDE.slice(1)) {
    if (ontbrekend.has(store)) continue; // tabel bestaat (nog) niet op de server: regels blijven wachten
    const eigen = regels.filter((r) => r.store === store);
    for (let i = 0; i < eigen.length; i += BATCH) {
      const deel = eigen.slice(i, i + BATCH);
      voortgang(deel.length);
      try {
        await verstuurRecords(store, deel);
        for (const r of deel) await db.sync.afgehandeld(r);
        zetStatus({ wachtend: Math.max(0, status.wachtend - deel.length) });
      } catch (fout) {
        if (fout instanceof TypeError || fout instanceof NietIngelogd) throw fout;
        if (OPTIONEEL.has(store) && isOntbrekendeTabel(fout)) { ontbrekend.add(store); break; }
        // Eén afgekeurde regel mag de rest niet blokkeren: probeer de regels in dit deel los.
        for (const r of deel) {
          try {
            await verstuurRecords(store, [r]);
            await db.sync.afgehandeld(r);
          } catch (los) { weiger(los, r); }
        }
      }
    }
  }
  if (eersteFout) {
    eersteFout.geweigerd = geweigerd;
    throw eersteFout;
  }
}

// ---------------------------------------------------------------------------
// Verbinding testen: per onderdeel van de server nagaan of het werkt, met de exacte foutmelding.
// ---------------------------------------------------------------------------
const SCRIPT_VOOR = { projecten: '003', lagen: '003', objecten: 'schema.sql', inspecties: 'schema.sql', taken: '003', werkzaamheden: '002',
  werkpakketten: '004', overgeslagen: '004', vrijgaven: '005', meldingen: '008' };
const foutTekst = (f) => `${f?.status ? `HTTP ${f.status} ` : ''}${f?.code ? `(${f.code}) ` : ''}${f?.message ?? f}`;

export async function diagnose() {
  const uit = [];
  const stap = async (naam, fn) => {
    try {
      const r = await fn();
      uit.push({ naam, ok: r?.ok ?? true, tekst: r?.tekst ?? String(r ?? 'In orde') });
    } catch (f) {
      uit.push({ naam, ok: false, tekst: foutTekst(f), hint: f?.hint });
    }
  };
  const rpc = async (naam) => (await api(`/rest/v1/rpc/${naam}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  const { url } = configuratie();
  uit.push({ naam: 'Server', ok: Boolean(url), tekst: url ? url.replace(/^https?:\/\//, '') : 'Geen server ingesteld' });
  await stap('Inloggen', async () => { const u = await (await api('/auth/v1/user')).json(); return `Geldig (${u.email})`; });
  await stap('Teamlid', async () => {
    const ja = await rpc('is_teamlid');
    return ja ? 'Ja' : { ok: false, tekst: 'Nee: dit e-mailadres staat niet in de tabel teamleden. Voeg het toe in Supabase (SQL Editor): insert into public.teamleden (email) values (\'…\');' };
  });
  await stap('Rol', async () => {
    const r = await rpc('mijn_rol');
    return r === 'beheerder' || r === 'lid' ? r : { ok: false, tekst: `${r ?? 'onbekend'}: geen toegang tot projecten` };
  });
  for (const tabel of TABELLEN) {
    await stap(`Tabel ${tabel}`, async () => {
      try {
        await api(`/rest/v1/${tabel}?select=id&limit=1`);
        return 'Bereikbaar';
      } catch (f) {
        if (isOntbrekendeTabel(f)) return { ok: false, tekst: `Ontbreekt op de server: voer supabase/${SCRIPT_VOOR[tabel]}${SCRIPT_VOOR[tabel].endsWith('.sql') ? '' : '_*.sql'} uit` };
        throw f;
      }
    });
  }
  await stap('Snelle synchronisatie (011)', async () => {
    try { await rpc('laatste_wijziging'); return 'Aanwezig'; } catch (f) {
      if (f?.status === 404 || f?.code === 'PGRST202') return { ok: false, tekst: 'Ontbreekt: voer supabase/011_snelle_sync.sql uit (synchroniseert dan eens per minuut)' };
      throw f;
    }
  });
  // Wachtende wijzigingen: per soort één regel echt versturen, zodat de exacte reden van een weigering zichtbaar wordt.
  const regels = await db.sync.wachtrij();
  const perStore = new Map();
  for (const r of regels) (perStore.get(r.store) ?? perStore.set(r.store, []).get(r.store)).push(r);
  if (!regels.length) uit.push({ naam: 'Te versturen', ok: true, tekst: 'Niets' });
  for (const [store, lijst] of perStore) {
    await stap(`Versturen ${SOORT_TEKST[store] ?? store} (${lijst.length})`, async () => {
      const r = lijst[0];
      if (store === 'fotos') await verstuurFoto(r); else await verstuurRecords(store, [r]);
      await db.sync.afgehandeld(r);
      return 'Gelukt (de rest volgt bij de volgende synchronisatie)';
    });
  }
  await werkWachtendBij();
  return uit;
}

/** Weigert de server de regel omdat je er geen rechten voor hebt (RLS)? Dan helpt opnieuw proberen niet. */
const isGeenRecht = (fout) => fout?.status === 401 || fout?.status === 403 || fout?.code === '42501' || /row-level security|permission denied/i.test(fout?.message ?? '');

const SOORT_TEKST = {
  projecten: 'projectinstellingen', lagen: 'kaartlaag', objecten: 'object', werkpakketten: 'werkpakket', inspecties: 'inspectie',
  werkzaamheden: 'werkzaamheid', taken: 'taak', overgeslagen: 'overgeslagen object', vrijgaven: 'flora- en faunavrijgave', meldingen: 'storing of gebrek', fotos: 'foto',
};
/** Leesbare samenvatting van geweigerde wijzigingen. */
export function geweigerdTekst(lijst = status.geweigerd) {
  if (!lijst?.length) return '';
  const soorten = [...new Set(lijst.map((g) => SOORT_TEKST[g.store] ?? g.store))].join(', ');
  const rechten = lijst.every((g) => g.geenRecht);
  return `${lijst.length} wijziging${lijst.length === 1 ? ' is' : 'en zijn'} door de server geweigerd (${soorten})${rechten
    ? ': je account heeft geen rechten om dit te wijzigen. Projectinstellingen wijzigt alleen een beheerder.'
    : `: ${lijst[0].melding}`} Al het andere is wel gesynchroniseerd en wijzigingen van anderen komen gewoon binnen.`;
}

/**
 * Geweigerde wijzigingen terugdraaien: uit de wachtrij halen en de versie van de server terugzetten.
 * Wat niet op de server staat (nieuw en nooit geaccepteerd) blijft wachten, zodat er geen werk verloren gaat.
 */
export async function verwerpGeweigerd() {
  let teruggezet = 0;
  let blijft = 0;
  for (const g of status.geweigerd ?? []) {
    if (g.store === 'fotos') { blijft += 1; continue; }
    const res = await api(`/rest/v1/${g.store}?select=id,data,gewijzigd,verwijderd,sync_tijd&id=eq.${encodeURIComponent(g.id)}`);
    const [rij] = await res.json();
    if (!rij) { blijft += 1; continue; }
    await db.sync.verwijderUitWachtrij(g.store, g.id);
    await verwerkRij(g.store, rij);
    teruggezet += 1;
  }
  zetStatus({ geweigerd: [] });
  await werkWachtendBij();
  if (teruggezet) naOphalen(teruggezet);
  return { teruggezet, blijft };
}

async function verstuurRecords(store, regels) {
  const rijen = [];
  for (const regel of regels) {
    if (regel.actie === 'opslaan') {
      const item = await db.haal(store, regel.recordId);
      if (!item) continue;
      rijen.push({
        id: item.id, project_id: store === 'projecten' ? item.id : (item.projectId ?? regel.projectId ?? null),
        data: item, gewijzigd: item.gewijzigd || regel.tijd, verwijderd: false,
      });
    } else {
      rijen.push({ id: regel.recordId, project_id: regel.projectId ?? null, data: {}, gewijzigd: regel.tijd, verwijderd: true });
    }
  }
  if (!rijen.length) return;
  await api(`/rest/v1/${store}?on_conflict=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rijen),
  });
}

const fotoPad = (id, projectId) => `${projectId ? `${encodeURIComponent(projectId)}/` : ''}${encodeURIComponent(id)}.jpg`;

async function verstuurFoto(regel) {
  if (regel.actie === 'opslaan') {
    const foto = await db.haal('fotos', regel.recordId);
    if (!foto) return;
    const blob = await (await fetch(foto.data)).blob();
    await api(`/storage/v1/object/${BUCKET}/${fotoPad(foto.id, foto.projectId)}`, {
      method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' }, body: blob,
    });
  } else {
    await api(`/storage/v1/object/${BUCKET}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [fotoPad(regel.recordId, regel.projectId)] }),
    });
  }
}

// ---------------------------------------------------------------------------
// Ophalen (server → lokaal)
// ---------------------------------------------------------------------------
function cursorSleutel(tabel) {
  return `cursor:${sessie()?.gebruiker?.id ?? 'onbekend'}:${tabel}`;
}

async function haalOp() {
  let gewijzigd = 0;
  // Alle tabellen tegelijk opvragen: dat scheelt per synchronisatie tien keer de wachttijd van de server.
  await Promise.all(TABELLEN.map(async (tabel) => {
    const cursor = lees(cursorSleutel(tabel));
    const vanaf = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
    let nieuwsteCursor = cursor;
    for (let offset = 0; ; offset += PAGINA) {
      const filter = vanaf ? `&sync_tijd=gte.${encodeURIComponent(vanaf)}` : '';
      let res;
      try {
        res = await api(`/rest/v1/${tabel}?select=id,data,gewijzigd,verwijderd,sync_tijd${filter}&order=sync_tijd.asc,id.asc&limit=${PAGINA}&offset=${offset}`);
        ontbrekend.delete(tabel);
      } catch (fout) {
        if (OPTIONEEL.has(tabel) && isOntbrekendeTabel(fout)) { ontbrekend.add(tabel); break; }
        throw fout;
      }
      const rijen = await res.json();
      for (const rij of rijen) {
        if (await verwerkRij(tabel, rij)) gewijzigd += 1;
        if (!nieuwsteCursor || rij.sync_tijd > nieuwsteCursor) nieuwsteCursor = rij.sync_tijd;
      }
      if (rijen.length < PAGINA) break;
    }
    if (nieuwsteCursor) schrijf(cursorSleutel(tabel), nieuwsteCursor);
  }));
  return gewijzigd;
}

const tijd = (v) => Date.parse(v ?? '') || 0;
const fotoIdsVan = (r) => [
  ...(r?.fotoIds ?? []), ...(r?.extraFotoIds ?? []), ...(r?.gebreken ?? []).flatMap((g) => g.fotoIds ?? []),
  ...(r?.bvc?.gebreken ?? []).flatMap((g) => g.fotoIds ?? []), ...(r?.waarnemingen ?? []).flatMap((w) => w.fotoIds ?? []),
  ...(r?.stowa?.waarnemingen ?? []).flatMap((w) => w.fotoIds ?? []),
];

async function verwerkRij(tabel, rij) {
  const lokaal = await db.haal(tabel, rij.id);
  // Lokale wijziging die nog verstuurd moet worden: de nieuwste versie wint.
  if (await db.sync.heeftWachtend(tabel, rij.id)) {
    const lokaleTijd = lokaal ? tijd(lokaal.gewijzigd) : Date.now();
    if (lokaleTijd >= tijd(rij.gewijzigd)) return false;
    await db.sync.verwijderUitWachtrij(tabel, rij.id);
  }
  if (rij.verwijderd) {
    if (!lokaal) return false;
    for (const id of fotoIdsVan(lokaal)) await db.sync.verwijder('fotos', id);
    await db.sync.verwijder(tabel, rij.id);
    return true;
  }
  if (lokaal && lokaal.gewijzigd === rij.data?.gewijzigd) return false;
  await db.sync.bewaar(tabel, { ...rij.data, id: rij.id });
  return true;
}

async function haalOntbrekendeFotosOp() {
  // Alleen de foto's van het project waarin je werkt; andere worden geladen zodra je ze opent.
  if (fotoBeleid.vooraf && !fotoBeleid.vooraf()) return;
  const actief = fotoBeleid.project?.() ?? null;
  const aanwezig = new Set(await db.sync.fotoIds());
  const nodig = new Map(); // fotoId → projectId
  const records = [...await db.alle('inspecties'), ...await db.alle('werkzaamheden'), ...await db.alle('taken'), ...await db.alle('vrijgaven')];
  for (const record of records) {
    if (actief && record.projectId && record.projectId !== actief) continue;
    for (const id of fotoIdsVan(record)) if (!aanwezig.has(id)) nodig.set(id, record.projectId ?? null);
  }
  let n = 0;
  for (const [id, projectId] of nodig) {
    n += 1;
    zetStatus({ fotosOphalen: `Foto's ophalen: ${n} van ${nodig.size}` });
    try {
      const res = await api(`/storage/v1/object/authenticated/${BUCKET}/${fotoPad(id, projectId)}`);
      const data = await blobNaarDataUrl(await res.blob());
      await db.sync.bewaar('fotos', { id, data, projectId, datum: new Date().toISOString() });
    } catch (fout) {
      if (fout instanceof TypeError || fout instanceof NietIngelogd) throw fout;
      console.warn(`Foto ${id} nog niet beschikbaar`, fout.message); // volgende keer opnieuw
    }
  }
}

// Foto's ophalen gebeurt na de synchronisatie, op de achtergrond: veel of grote foto's houden de rest niet op.
let fotosBezig = null;
function fotosOpAchtergrond() {
  fotosBezig ??= haalOntbrekendeFotosOp().catch((fout) => console.warn('Foto\'s ophalen onderbroken', fout.message))
    .finally(() => { fotosBezig = null; zetStatus({ fotosOphalen: '' }); });
}

const fotoBeleid = {};

/** Eén foto van de server halen (bij openen van een inspectie of werkzaamheid). Geeft null als dat niet lukt. */
export async function haalFoto(id, projectId) {
  if (!isIngesteld() || !sessie() || !navigator.onLine) return null;
  try {
    const res = await api(`/storage/v1/object/authenticated/${BUCKET}/${fotoPad(id, projectId)}`);
    const data = await blobNaarDataUrl(await res.blob());
    await db.sync.bewaar('fotos', { id, data, projectId, datum: new Date().toISOString() });
    return data;
  } catch {
    return null;
  }
}

function blobNaarDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Zorgt dat bij de volgende synchronisatie alles opnieuw van de server wordt opgehaald. */
export function resetOphalen() {
  for (const tabel of TABELLEN) schrijf(cursorSleutel(tabel), null);
}

// ---------------------------------------------------------------------------
// Aansturing
// ---------------------------------------------------------------------------
let bezig = null;
let nogmaals = false;
let timer = null;
let naOphalen = () => {};

export function synchroniseer() {
  if (bezig) {
    nogmaals = true;
    return bezig;
  }
  bezig = (async () => {
    await werkWachtendBij();
    const rust = bepaalRustFase();
    if (rust !== 'ok') {
      zetStatus({ fase: rust });
      return 0;
    }
    zetStatus({ fase: 'bezig', fout: '', voortgang: '' });
    try {
      const rolOpgehaald = haalRolOp().catch((fout) => {
        if (fout instanceof TypeError || fout instanceof NietIngelogd) throw fout;
      });
      rolOpgehaald.catch(() => {}); // stopt het versturen eerder (bijv. geen verbinding), dan geen losse foutmelding
      // Een door de server geweigerde wijziging mag het ophalen niet blokkeren: anders komen wijzigingen
      // van de pc nooit meer binnen op dit apparaat. Eerst alles ophalen, daarna de weigering melden.
      let weigering = null;
      try { await verstuur(); } catch (fout) {
        if (fout instanceof TypeError || fout instanceof NietIngelogd) throw fout;
        weigering = fout;
      }
      zetStatus({ voortgang: 'Ophalen van de server…' });
      const [opgehaald] = await Promise.all([haalOp(), rolOpgehaald]);
      const nu = new Date().toISOString();
      schrijf('laatsteSync', nu);
      // Een nieuwere versie van de server heeft een geweigerde wijziging misschien al vervangen.
      const geweigerd = [];
      for (const g of weigering?.geweigerd ?? []) if (await db.sync.heeftWachtend(g.store, g.id)) geweigerd.push(g);
      if (weigering && (geweigerd.length || !weigering.geweigerd?.length)) {
        zetStatus({ fase: 'fout', fout: geweigerd.length ? geweigerdTekst(geweigerd) : weigering.message, laatsteSync: nu, geweigerd });
      } else zetStatus({ fase: 'ok', laatsteSync: nu, geweigerd: [] });
      if (opgehaald) naOphalen(opgehaald);
      fotosOpAchtergrond();
      return opgehaald;
    } catch (fout) {
      if (fout instanceof NietIngelogd) zetStatus({ fase: 'uitgelogd', fout: fout.message });
      else if (fout instanceof TijdOver) zetStatus({ fase: 'fout', fout: fout.message });
      else if (fout instanceof TypeError) zetStatus({ fase: 'offline', fout: '' });
      else zetStatus({ fase: 'fout', fout: fout.message });
      return 0;
    } finally {
      zetStatus({ voortgang: '' });
      await werkWachtendBij();
    }
  })().finally(() => {
    bezig = null;
    if (nogmaals) {
      nogmaals = false;
      plan(200);
    }
  });
  return bezig;
}

// ---------------------------------------------------------------------------
// Snelle controle: elke paar seconden één klein verzoek of er op de server iets is gewijzigd (update 011).
// Alleen dan volgt een volledige synchronisatie. Zonder de databasefunctie blijft het bij eens per minuut.
// ---------------------------------------------------------------------------
const CONTROLE_MS = 5_000;
let snelleControle = true; // false zodra blijkt dat de server de functie (nog) niet heeft
let gezien = null;
let controleBezig = false;

/** Is de snelle controle beschikbaar (SQL-update 011 uitgevoerd)? */
export const snelleSync = () => snelleControle;

async function controleer() {
  if (!snelleControle || controleBezig || bezig || document.visibilityState !== 'visible') return;
  if (bepaalRustFase() !== 'ok') return;
  controleBezig = true;
  try {
    const res = await api('/rest/v1/rpc/laatste_wijziging', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const laatste = await res.json();
    if (laatste && laatste !== gezien) {
      gezien = laatste;
      synchroniseer();
    }
  } catch (fout) {
    if (/laatste_wijziging|PGRST202|Could not find the function/i.test(String(fout?.message ?? '')) || fout?.status === 404) snelleControle = false;
    // Netwerk- en andere fouten: de volgende controle of de minuutsynchronisatie probeert het opnieuw.
  } finally {
    controleBezig = false;
  }
}

function plan(vertraging = 1500) {
  clearTimeout(timer);
  timer = setTimeout(synchroniseer, vertraging);
}

export function start(opties = {}) {
  naOphalen = opties.naOphalen ?? naOphalen;
  fotoBeleid.project = opties.fotoProject;
  fotoBeleid.vooraf = opties.fotosVooraf;
  db.bijWijziging(() => {
    werkWachtendBij();
    plan();
  });
  window.addEventListener('online', () => plan(500));
  window.addEventListener('offline', () => zetStatus({ fase: bepaalRustFase() }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') plan(500);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') synchroniseer();
  }, 60_000);
  setInterval(controleer, CONTROLE_MS);
  synchroniseer();
}
