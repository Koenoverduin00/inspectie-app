// Opmaak van de status (te doen, gedaan, overgeslagen) op alle kaarten. Instelbaar per project (beheerder)
// en per apparaat. Puur: geen DOM, geen Leaflet.

export const STATUSSEN = [['open', 'Te doen'], ['deels', 'Gedeeltelijk gedaan'], ['gedaan', 'Gedaan'], ['overgeslagen', 'Overgeslagen']];
export const LIJNEN = { doorgetrokken: 'Doorgetrokken', gestreept: 'Gestreept', gestippeld: 'Gestippeld' };
const STREEP = { doorgetrokken: null, gestreept: '8 5', gestippeld: '2 4' };

export const STANDAARD = {
  open: { kleur: '#e07b00', rand: '#7a3300', dikte: 4, vulling: 0.65, dekking: 1, punt: 10, lijn: 'doorgetrokken' },
  deels: { kleur: '#f2c200', rand: '#7a3300', dikte: 3, vulling: 0.55, dekking: 1, punt: 9, lijn: 'gestreept' },
  gedaan: { kleur: '#1a7f37', rand: '', dikte: 1.5, vulling: 0.12, dekking: 0.6, punt: 5, lijn: 'doorgetrokken' },
  overgeslagen: { kleur: '#8a96a3', rand: '', dikte: 1.5, vulling: 0.12, dekking: 0.6, punt: 5, lijn: 'gestreept' },
};

const kleurOk = (v) => /^#[0-9a-f]{6}$/i.test(String(v ?? ''));
const getal = (v, min, max, std) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std; };

const geldig = (k, v) => (k === 'kleur' ? kleurOk(v) : k === 'rand' ? v === '' || kleurOk(v) : k === 'lijn' ? Boolean(LIJNEN[v])
  : ['dikte', 'vulling', 'dekking', 'punt'].includes(k) && v !== '' && v !== null && Number.isFinite(Number(v)));

/** Eén statusopmaak opschonen; onbekende of ongeldige waarden vallen terug op de standaard. */
export function normaliseer(st, o = {}) {
  const s = STANDAARD[st];
  return {
    kleur: kleurOk(o.kleur) ? o.kleur.toLowerCase() : s.kleur,
    rand: o.rand === '' ? '' : kleurOk(o.rand) ? o.rand.toLowerCase() : s.rand,
    dikte: getal(o.dikte, 0, 10, s.dikte),
    vulling: getal(o.vulling, 0, 1, s.vulling),
    dekking: getal(o.dekking, 0.1, 1, s.dekking),
    punt: getal(o.punt, 3, 18, s.punt),
    lijn: LIJNEN[o.lijn] ? o.lijn : s.lijn,
  };
}

/** Standaard ← project ← apparaat (alleen ingevulde statussen tellen). */
export function samenvoegen(...lagen) {
  const uit = {};
  for (const [st] of STATUSSEN) {
    let o = {};
    for (const l of lagen) {
      for (const [k, v] of Object.entries(l?.[st] ?? {})) if (geldig(k, v)) o[k] = v;
    }
    uit[st] = normaliseer(st, o);
  }
  return uit;
}

/** Leaflet-stijl voor een vlak/lijn of punt. `kleur` kan de vulkleur overschrijven. */
export function leaflet(op, punt, kleur = op.kleur) {
  const rand = op.rand || (punt ? '#ffffff' : kleur);
  if (punt) {
    return { radius: op.punt, color: rand, weight: Math.max(op.dikte ? 1 : 0, Math.min(op.dikte, 4)), opacity: op.dikte ? Math.max(op.dekking, 0.8) : 0,
      fillColor: kleur, fillOpacity: Math.min(1, op.vulling + 0.4), dashArray: null };
  }
  return { color: rand, weight: op.dikte, opacity: op.dikte ? op.dekking : 0, fillColor: kleur, fillOpacity: op.vulling, dashArray: STREEP[op.lijn] };
}

/** CSS voor het legendastipje (achtergrond + rand als schaduw). */
export function legendaCss(op) {
  const rand = op.rand || op.kleur;
  const d = op.dikte ? Math.max(1, Math.min(3, op.dikte * 0.6)) : 0;
  return `background:${op.kleur};opacity:${Math.max(0.35, Math.min(1, op.vulling + 0.4)).toFixed(2)};box-shadow:0 0 0 ${d.toFixed(1)}px ${rand}${op.lijn !== 'doorgetrokken' ? ';outline:1px dashed ' + rand + ';outline-offset:1px' : ''}`;
}

/** Wat afwijkt van de standaard (om op te slaan). Leeg object = alles standaard. */
export function verschil(opmaak) {
  const uit = {};
  for (const [st] of STATUSSEN) {
    const o = normaliseer(st, opmaak?.[st]);
    const d = Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== STANDAARD[st][k]));
    if (Object.keys(d).length) uit[st] = d;
  }
  return uit;
}
