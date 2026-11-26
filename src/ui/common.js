// Petits éléments partagés par les écrans : portraits, barres de PV, objets, tuiles, compte.
import { CLASSES, STAT_LABELS } from '../data/classes.js';
import { ITEMS, RARITY, describeBonus } from '../data/items.js';
import { TILES, WHEEL_SIZE, sanitizeWheel, tileColor } from '../data/wheel.js';
import { HERO_MAX, heroProgress, perkLabel } from '../data/heroes.js';
import { online, profiles } from '../net/index.js';
import { esc, fmtMod } from './dom.js';

const BASE = import.meta.env.BASE_URL;

export const ROOM_ICONS = { combat: '⚔️', trap: '🪤', chest: '🧰', shrine: '⛩️', npc: '🧙', rest: '🔥', boss: '💀', elite: '💀', shop: '🛒', entrance: '🚪' };

export const portraitUrl = (classId) => `${BASE}portraits/${CLASSES[classId]?.portrait || classId}.png`;

export const pfilter = (classId) => (CLASSES[classId]?.portraitFilter ? `filter:${CLASSES[classId].portraitFilter};` : '');

export const portrait = (classId, cls = '') =>
  classId ? `<img class="portrait ${cls}" src="${portraitUrl(classId)}" alt="" style="--cc:${CLASSES[classId].color};${pfilter(classId)}" />`
    : `<span class="portrait ${cls}" style="display:grid;place-items:center">?</span>`;

export function hpClass(hp, max) {
  const f = hp / max;
  return f <= 0.25 ? 'crit' : f <= 0.5 ? 'low' : '';
}

export function statLine(stats) {
  return Object.entries(stats)
    .map(([k, v]) => `<span class="stat ${v >= 2 ? 'hi' : v < 0 ? 'lo' : ''}">${STAT_LABELS[k]} ${fmtMod(v)}</span>`).join('');
}

export function itemChip(id, extra = '', attrs = '', selected = false) {
  const it = ITEMS[id];
  if (!it) return '';
  const r = RARITY[it.rarity];
  return `<button class="item ${selected ? 'selected' : ''} ${it.shiny ? 'shiny' : ''}" style="--rc:${r.color}" ${attrs} title="${esc(r.label)}${it.shiny ? ' — variante chromatique' : ''}">
    <span class="ico">${it.icon}${it.shiny ? '✨' : ''}</span><span>${esc(it.name)}<br><span class="muted small">${esc(it.companion ? it.desc : it.tile ? it.text : describeBonus(it.bonus))}</span></span>${extra}</button>`;
}

const G_LOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

export function accountBlock(app, where) {
  if (!online || !profiles.googleAvailable) return '';
  const acc = app.account;
  if (acc?.google) {
    return `<div class="account">${G_LOGO}<span>Connecté : <b>${esc(acc.email || acc.displayName || 'compte Google')}</b></span>
      ${where === 'menu' ? '<button class="ghost small" data-action="googleLogout">Se déconnecter</button>' : ''}</div>`;
  }
  return `<button class="google" data-action="google">${G_LOGO}<span>${where === 'menu' ? 'Sauvegarder avec Google' : 'Continuer avec Google'}</span></button>
    <p class="muted small">${where === 'menu' ? 'Vous jouez en invité : connectez Google pour retrouver vos objets sur tous vos appareils.' : 'Ou entrez un pseudo pour jouer en invité.'}</p>`;
}

export const strip = () => `<div class="heroes-strip">${Object.keys(CLASSES).map((c) => `<img src="${portraitUrl(c)}" alt="" style="${pfilter(c)}" />`).join('')}</div>`;

// ---------- Niveau de héros (permanent, par classe) ----------
export function heroBar(app, classId, compact = false) {
  const p = heroProgress(app.profile.heroXp?.[classId] || 0);
  const next = p.level < HERO_MAX ? `${p.into}/${p.need} XP · prochain : ${perkLabel(classId, p.level + 1)}` : 'Niveau maximum';
  return `<span class="hero-lv${compact ? ' compact' : ''}" title="${esc(next)}"><span class="chip">Niv. ${p.level}</span><span class="xpbar"><i style="width:${Math.round(p.frac * 100)}%"></i></span>${compact ? '' : `<span class="muted small">${esc(next)}</span>`}</span>`;
}

export function heroGainLine(h) {
  const up = h.after > h.before;
  const perks = [];
  for (let lv = h.before + 1; lv <= h.after; lv++) perks.push(perkLabel(h.classId, lv));
  return `<p class="${up ? 'result-ok' : 'muted'}">⭐ ${esc(CLASSES[h.classId].name)} : +${h.gain} XP conservés${up ? ` — niveau ${h.after} ! (${esc(perks.join(', '))})` : ` (niveau ${h.after})`}</p>`;
}

// ---------- Roue de combat ----------
export function tileChip(id, extra = '', attrs = '', selected = false) {
  const t = TILES[id];
  if (!t) return '';
  const r = RARITY[t.rarity];
  return `<button class="item tile ${selected ? 'selected' : ''}" style="--rc:${r.color};--tc:${tileColor(id)}" ${attrs} title="${esc(r.label)} — ${esc(t.text)}">
    <span class="ico">${t.icon}</span><span>${esc(t.name)}<br><span class="muted small">${esc(t.text)}</span></span>${extra}</button>`;
}

/** Roue de la classe choisie (profil), corrigée selon les tuiles possédées. */
export function currentWheel(app, classId) {
  const saved = app.profile.wheels?.[classId] || [];
  const wheel = sanitizeWheel(saved, app.profile.inventory || {}, classId);
  // l'ulti est reçu dès le niveau 1 : on le place d'office la première fois (remplace un « Raté »)
  const ult = `ult_${classId}`;
  if (saved.length && TILES[ult] && !wheel.includes(ult) && !app.profile.ultSeen?.[classId]) {
    const i = wheel.lastIndexOf('t_rate');
    wheel[i >= 0 ? i : WHEEL_SIZE - 1] = ult;
  }
  return wheel;
}
