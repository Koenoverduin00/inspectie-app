// Synchronisatie met Supabase via de REST-API's (Auth, PostgREST en Storage).
// Offline-first: de app werkt altijd op de lokale IndexedDB; wijzigingen staan in een
// wachtrij en worden verstuurd zodra er verbinding is. Nieuwe gegevens van andere
// apparaten worden opgehaald op basis van een server-tijdstempel (sync_tijd).
import * as db from './db.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const TABELLEN = ['projecten', 'lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken', 'werkpakketten', 'overgeslagen', 'vrijgaven'];
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
const status = { fase: 'uit', fout: '', laatsteSync: lees('laatsteSync'), wachtend: 0, rol: lees('rol') };
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

const FOUTVERTALINGEN = [
  [/invalid login credentials/i, 'Onjuist e-mailadres of wachtwoord.'],
  [/email not confirmed/i, 'Je e-mailadres is nog niet bevestigd. Klik op de link in de bevestigingsmail.'],
  [/user already registered/i, 'Er bestaat al een account met dit e-mailadres. Log in.'],
  [/password should be at least/i, 'Het wachtwoord moet minimaal 6 tekens lang zijn.'],
  [/rate limit|too many requests|for security purposes/i, 'Te veel pogingen. Wacht even en probeer het opnieuw.'],
  [/new password should be different/i, 'Kies een ander wachtwoord dan je huidige.'],
  [/signups not allowed/i, 'Nieuwe accounts aanmaken is uitgeschakeld. Vraag de beheerder om een uitnodiging.'],
  [/row-level security|permission denied|unauthorized/i,
    'Geen toegang. Staat je e-mailadres in de tabel "teamleden" in Supabase?'],
  [/invalid api key|no api key/i, 'De Supabase-sleutel is ongeldig. Controleer de instellingen.'],
  [/relation .* does not exist|could not find the table/i, 'De database is nog niet ingericht. Voer supabase/schema.sql uit.'],
  [/bucket not found/i, 'De opslag voor foto\'s ontbreekt. Voer supabase/schema.sql uit.'],
];
function vertaal(tekst) {
  return FOUTVERTALINGEN.find(([re]) => re.test(tekst))?.[1] ?? tekst;
}
async function foutUit(res) {
  const data = await res.json().catch(() => ({}));
  return new Error(vertaal(String(data.error_description || data.msg || data.message || data.error || `Serverfout ${res.status}`)));
}

export const sessie = () => lees('sessie');

async function authVerzoek(pad, body) {
  const { url, key } = configuratie();
  const res = await fetch(`${url}/auth/v1/${pad}`, {
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
    gebruiker: { id: d.user?.id, email: d.user?.email },
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

async function toegangstoken(forceer = false) {
  const s = sessie();
  if (!s) throw new NietIngelogd('Niet ingelogd.');
  if (!forceer && Date.now() < s.verloopt - 60_000) return s.access_token;
  try {
    bewaarSessie(await authVerzoek('token?grant_type=refresh_token', { refresh_token: s.refresh_token }));
  } catch (fout) {
    if (fout instanceof TypeError) throw fout; // netwerkfout: later opnieuw proberen
    schrijf('sessie', null);
    throw new NietIngelogd('Je sessie is verlopen. Log opnieuw in.');
  }
  return sessie().access_token;
}

async function api(pad, opties = {}, opnieuw = true) {
  const { url, key } = configuratie();
  const res = await fetch(url + pad, {
    ...opties,
    headers: { apikey: key, Authorization: `Bearer ${await toegangstoken()}`, ...opties.headers },
  });
  if (res.status === 401 && opnieuw) {
    await toegangstoken(true);
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

/** Rol van deze gebruiker. Zonder online account werkt de app lokaal en ben je beheerder. */
export function rol() {
  if (!isIngesteld() || !sessie()) return 'beheerder';
  return status.rol ?? lees('rol') ?? 'lid';
}

// ---------------------------------------------------------------------------
// Versturen (lokale wachtrij → server)
// ---------------------------------------------------------------------------
const VOLGORDE = ['fotos', 'projecten', 'lagen', 'objecten', 'werkpakketten', 'inspecties', 'werkzaamheden', 'taken', 'overgeslagen', 'vrijgaven'];
const BATCH = 200;

async function verstuur() {
  const regels = await db.sync.wachtrij();
  // Foto's eerst (complete inspecties op andere apparaten), dan projecten vóór hun inhoud.
  regels.sort((a, b) => VOLGORDE.indexOf(a.store) - VOLGORDE.indexOf(b.store) || a.tijd.localeCompare(b.tijd));
  let eersteFout = null;
  const weiger = (fout) => {
    if (fout instanceof TypeError || fout instanceof NietIngelogd) throw fout; // geen verbinding: stoppen
    eersteFout ??= fout; // geweigerd door de server: overslaan, de rest gaat wel door
  };

  for (const regel of regels.filter((r) => r.store === 'fotos')) {
    try {
      await verstuurFoto(regel);
      await db.sync.afgehandeld(regel);
      zetStatus({ wachtend: Math.max(0, status.wachtend - 1) });
    } catch (fout) { weiger(fout); }
  }
  for (const store of VOLGORDE.slice(1)) {
    const eigen = regels.filter((r) => r.store === store);
    for (let i = 0; i < eigen.length; i += BATCH) {
      const deel = eigen.slice(i, i + BATCH);
      try {
        await verstuurRecords(store, deel);
        for (const r of deel) await db.sync.afgehandeld(r);
        zetStatus({ wachtend: Math.max(0, status.wachtend - deel.length) });
      } catch (fout) {
        if (fout instanceof TypeError || fout instanceof NietIngelogd) throw fout;
        // Eén afgekeurde regel mag de rest niet blokkeren: probeer de regels in dit deel los.
        for (const r of deel) {
          try {
            await verstuurRecords(store, [r]);
            await db.sync.afgehandeld(r);
          } catch (los) { weiger(los); }
        }
      }
    }
  }
  if (eersteFout) throw eersteFout;
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
  for (const tabel of TABELLEN) {
    const cursor = lees(cursorSleutel(tabel));
    const vanaf = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
    let nieuwsteCursor = cursor;
    for (let offset = 0; ; offset += PAGINA) {
      const filter = vanaf ? `&sync_tijd=gte.${encodeURIComponent(vanaf)}` : '';
      const res = await api(`/rest/v1/${tabel}?select=id,data,gewijzigd,verwijderd,sync_tijd${filter}&order=sync_tijd.asc,id.asc&limit=${PAGINA}&offset=${offset}`);
      const rijen = await res.json();
      for (const rij of rijen) {
        if (await verwerkRij(tabel, rij)) gewijzigd += 1;
        if (!nieuwsteCursor || rij.sync_tijd > nieuwsteCursor) nieuwsteCursor = rij.sync_tijd;
      }
      if (rijen.length < PAGINA) break;
    }
    if (nieuwsteCursor) schrijf(cursorSleutel(tabel), nieuwsteCursor);
  }
  await haalOntbrekendeFotosOp();
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
  for (const [id, projectId] of nodig) {
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
    zetStatus({ fase: 'bezig', fout: '' });
    try {
      await haalRolOp().catch((fout) => {
        if (fout instanceof TypeError || fout instanceof NietIngelogd) throw fout;
      });
      await verstuur();
      const opgehaald = await haalOp();
      const nu = new Date().toISOString();
      schrijf('laatsteSync', nu);
      zetStatus({ fase: 'ok', laatsteSync: nu });
      if (opgehaald) naOphalen(opgehaald);
      return opgehaald;
    } catch (fout) {
      if (fout instanceof NietIngelogd) zetStatus({ fase: 'uitgelogd', fout: fout.message });
      else if (fout instanceof TypeError) zetStatus({ fase: 'offline', fout: '' });
      else zetStatus({ fase: 'fout', fout: fout.message });
      return 0;
    } finally {
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
  synchroniseer();
}
