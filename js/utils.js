export function esc(waarde) {
  return String(waarde ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function nieuwId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function vandaag() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function datumNL(iso) {
  if (!iso) return '–';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function euro(bedrag) {
  const n = Number(bedrag);
  if (!Number.isFinite(n) || bedrag === '' || bedrag == null) return '–';
  return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

export function optie(waarde, label, geselecteerd) {
  return `<option value="${esc(waarde)}"${String(waarde) === String(geselecteerd ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
}

export function formulierData(form) {
  const data = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (typeof v === 'string') data[k] = v.trim();
  }
  return data;
}

// Verklein een foto in de browser zodat de opslag beperkt blijft.
export function verkleinFoto(bestand, maxZijde = 1600, kwaliteit = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(bestand);
    const img = new Image();
    img.onload = () => {
      const schaal = Math.min(1, maxZijde / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * schaal);
      canvas.height = Math.round(img.height * schaal);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', kwaliteit));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Afbeelding kon niet worden gelezen.'));
    };
    img.src = url;
  });
}

export function csv(rijen) {
  const cel = (v) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Puntkomma als scheidingsteken: opent direct goed in Nederlandse Excel.
  return '﻿' + rijen.map((r) => r.map(cel).join(';')).join('\r\n');
}

export function download(bestandsnaam, inhoud, type) {
  const blob = new Blob([inhoud], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = bestandsnaam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function melding(tekst, soort = 'ok') {
  document.querySelectorAll('.toast').forEach((t) => t.remove()); // nieuwste melding vervangt de vorige
  const el = document.createElement('div');
  el.className = `toast toast-${soort}`;
  el.setAttribute('role', 'status');
  el.textContent = tekst;
  document.body.append(el);
  setTimeout(() => el.classList.add('weg'), 2500);
  setTimeout(() => el.remove(), 3000);
}
