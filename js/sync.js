// Synchronisatie met Supabase via de REST-API's (Auth, PostgREST en Storage).
// Offline-first: de app werkt altijd op de lokale IndexedDB; wijzigingen staan in een
// wachtrij en worden verstuurd zodra er verbinding is. Nieuwe gegevens van andere
// apparaten worden opgehaald op basis van een server-tijdstempel (sync_tijd).
import * as db from './db.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const TABELLEN = ['objecten', 'inspecties'];
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
const status = { fase: 'uit', fout: '', laatsteSync: lees('laatsteSync'), wachtend: 0 };
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

export async function uitloggen() {
  const s = sessie();
  if (s) {
    const { url, key } = configuratie();
    fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${s.access_token}` } })
      .catch(() => {});
  }
  schrijf('sessie', null);
  zetStatus({ fase: bepaalRustFase(), fout: '' });
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

/** Controleert of de ingelogde gebruiker toegang heeft tot de teamgegevens. */
export async function isTeamlid() {
  const res = await api('/rest/v1/rpc/is_teamlid', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  return (await res.json()) === true;
}

// ---------------------------------------------------------------------------
// Versturen (lokale wachtrij → server)
// ---------------------------------------------------------------------------
async function verstuur() {
  const regels = await db.sync.wachtrij();
  // Foto's eerst, zodat een inspectie op een ander apparaat direct complete foto's heeft.
  regels.sort((a, b) => (a.store === 'fotos' ? 0 : 1) - (b.store === 'fotos' ? 0 : 1) || a.tijd.localeCompare(b.tijd));
  for (const regel of regels) {
    if (regel.store === 'fotos') await verstuurFoto(regel);
    else await verstuurRecord(regel);
    await db.sync.afgehandeld(regel);
    zetStatus({ wachtend: Math.max(0, status.wachtend - 1) });
  }
}

async function verstuurRecord(regel) {
  let rij;
  if (regel.actie === 'opslaan') {
    const item = await db.haal(regel.store, regel.recordId);
    if (!item) return;
    rij = { id: item.id, data: item, gewijzigd: item.gewijzigd || regel.tijd, verwijderd: false };
  } else {
    rij = { id: regel.recordId, data: {}, gewijzigd: regel.tijd, verwijderd: true };
  }
  await api(`/rest/v1/${regel.store}?on_conflict=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rij),
  });
}

async function verstuurFoto(regel) {
  const pad = `${encodeURIComponent(regel.recordId)}.jpg`;
  if (regel.actie === 'opslaan') {
    const foto = await db.haal('fotos', regel.recordId);
    if (!foto) return;
    const blob = await (await fetch(foto.data)).blob();
    await api(`/storage/v1/object/${BUCKET}/${pad}`, {
      method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' }, body: blob,
    });
  } else {
    await api(`/storage/v1/object/${BUCKET}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [pad] }),
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
    if (tabel === 'inspecties') {
      const fotoIds = [...(lokaal.fotoIds ?? []), ...(lokaal.gebreken ?? []).flatMap((g) => g.fotoIds ?? [])];
      for (const id of fotoIds) await db.sync.verwijder('fotos', id);
    }
    await db.sync.verwijder(tabel, rij.id);
    return true;
  }
  if (lokaal && lokaal.gewijzigd === rij.data?.gewijzigd) return false;
  await db.sync.bewaar(tabel, { ...rij.data, id: rij.id });
  return true;
}

async function haalOntbrekendeFotosOp() {
  const aanwezig = new Set(await db.sync.fotoIds());
  const nodig = new Set();
  for (const insp of await db.alle('inspecties')) {
    for (const id of [...(insp.fotoIds ?? []), ...(insp.gebreken ?? []).flatMap((g) => g.fotoIds ?? [])]) {
      if (!aanwezig.has(id)) nodig.add(id);
    }
  }
  for (const id of nodig) {
    try {
      const res = await api(`/storage/v1/object/authenticated/${BUCKET}/${encodeURIComponent(id)}.jpg`);
      const data = await blobNaarDataUrl(await res.blob());
      await db.sync.bewaar('fotos', { id, data, datum: new Date().toISOString() });
    } catch (fout) {
      if (fout instanceof TypeError || fout instanceof NietIngelogd) throw fout;
      console.warn(`Foto ${id} nog niet beschikbaar`, fout.message); // volgende keer opnieuw
    }
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
