// Roue de combat façon casino : SVG (8 cases égales, jante dorée, ampoules qui clignotent, aiguille),
// et animation des lancers (la roue décélère et s'arrête sur la case tirée par le moteur).
import { TILES, WHEEL_SIZE, tileColor } from '../data/wheel.js';
import { esc } from './dom.js';

const SEG = 360 / WHEEL_SIZE;
const R = 100; // rayon de la zone des cases
const BULBS = 16;

const polar = (deg, r) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [Math.cos(a) * r, Math.sin(a) * r];
};

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/**
 * SVG d'une roue. opts : { size, uid, selected (index de case en surbrillance), editable (cases cliquables) }.
 * La case i est centrée sur l'angle i × 45° (0° = en haut, sous l'aiguille).
 */
export function wheelSvg(wheel, opts = {}) {
  const { size = 220, uid = '', selected = -1, editable = false, label = '' } = opts;
  const id = `w${Math.random().toString(36).slice(2, 8)}`;
  const segs = wheel.map((tid, i) => {
    const t = TILES[tid] || TILES.t_rate;
    const a0 = i * SEG - SEG / 2;
    const a1 = a0 + SEG;
    const [x0, y0] = polar(a0, R);
    const [x1, y1] = polar(a1, R);
    const col = tileColor(tid);
    const [ix, iy] = polar(i * SEG, R * 0.66);
    const [nx, ny] = polar(i * SEG, R * 0.36);
    const short = t.name.length > 11 ? `${t.name.slice(0, 10)}…` : t.name;
    return `<g class="seg${i === selected ? ' sel' : ''}${t.kind === 'miss' ? ' miss' : ''}" data-seg="${i}" ${editable ? `data-action="slot" data-i="${i}"` : ''}>
      <path d="M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="url(#${id}g${i})" />
      <defs><radialGradient id="${id}g${i}" cx="0" cy="0" r="${R}" gradientUnits="userSpaceOnUse">
        <stop offset="0.15" stop-color="${shade(col, 0.55)}" /><stop offset="0.75" stop-color="${col}" /><stop offset="1" stop-color="${shade(col, 1.35)}" />
      </radialGradient></defs>
      <text x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" class="seg-ico" transform="rotate(${i * SEG} ${ix.toFixed(1)} ${iy.toFixed(1)})">${t.icon}</text>
      <text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" class="seg-name" transform="rotate(${i * SEG > 180 ? i * SEG + 90 : i * SEG - 90} ${nx.toFixed(1)} ${ny.toFixed(1)})">${esc(short)}</text>
    </g>`;
  }).join('');
  const lines = wheel.map((_, i) => {
    const [x, y] = polar(i * SEG - SEG / 2, R);
    return `<line x1="0" y1="0" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" />`;
  }).join('');
  const bulbs = Array.from({ length: BULBS }, (_, i) => {
    const [x, y] = polar((i * 360) / BULBS, R + 11);
    return `<circle class="bulb ${i % 2 ? 'odd' : 'even'}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.6" />`;
  }).join('');
  return `<div class="wheel" style="--size:${size}px" data-wheel="${esc(uid)}">
    <svg viewBox="-125 -125 250 250" aria-label="Roue de combat">
      <defs>
        <linearGradient id="${id}rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff1b8" /><stop offset="0.35" stop-color="#e3b25a" /><stop offset="0.65" stop-color="#8a5a16" /><stop offset="1" stop-color="#f6d27a" />
        </linearGradient>
        <radialGradient id="${id}hub"><stop offset="0" stop-color="#fff6d0" /><stop offset="0.5" stop-color="#e3b25a" /><stop offset="1" stop-color="#7a4b10" /></radialGradient>
      </defs>
      <circle r="${R + 19}" fill="#1b0f08" />
      <circle r="${R + 16}" fill="url(#${id}rim)" />
      <circle r="${R + 6}" fill="#2a1609" />
      <g class="bulbs">${bulbs}</g>
      <g class="rot" data-rot>
        ${segs}
        <g class="sep">${lines}</g>
        <circle r="${R}" fill="none" stroke="#f6d27a" stroke-width="2" />
      </g>
      <circle r="17" fill="url(#${id}hub)" stroke="#5a3a10" stroke-width="2" />
      <circle r="6" fill="#fff6d0" opacity="0.8" />
      <g class="pointer" data-pointer><path d="M-11 -${R + 22} L11 -${R + 22} L0 -${R - 8} Z" fill="url(#${id}rim)" stroke="#5a3a10" stroke-width="2" /><circle cy="-${R + 20}" r="5" fill="#ff2e55" /></g>
    </svg>
    ${label ? `<div class="wheel-label">${label}</div>` : ''}
  </div>`;
}

/** Angle final pour que la case `idx` s'arrête sous l'aiguille (avec un léger décalage aléatoire). */
function targetAngle(current, idx, turns) {
  const base = -idx * SEG + (Math.random() - 0.5) * SEG * 0.6;
  let target = current + turns * 360;
  target += ((base - target) % 360 + 360) % 360;
  return target;
}

/**
 * Anime les lancers : spins = [{ uid, picks: [index…] }]. Toutes les roues tournent en même temps,
 * un lancer après l'autre. Appelle onStep(uid, k, idx) à chaque arrêt et onDone() à la fin.
 */
export function animateWheels(root, spins, { onStep, onDone, duration = 1700 } = {}) {
  const els = spins.map((s) => ({ s, el: root.querySelector(`[data-wheel="${CSS.escape(s.uid)}"]`) })).filter((x) => x.el);
  const rounds = Math.max(0, ...spins.map((s) => s.picks.length));
  let k = 0;
  const angles = new Map();
  const step = () => {
    if (k >= rounds) { onDone?.(); return; }
    for (const { s, el } of els) {
      const idx = s.picks[k];
      const rot = el.querySelector('[data-rot]');
      if (idx === undefined || !rot) continue;
      el.querySelectorAll('.seg.win').forEach((g) => g.classList.remove('win'));
      el.classList.add('spinning');
      const a = targetAngle(angles.get(s.uid) || 0, idx, 4 + Math.floor(Math.random() * 2));
      angles.set(s.uid, a);
      rot.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.72, 0.1, 1)`;
      rot.style.transform = `rotate(${a}deg)`;
    }
    setTimeout(() => {
      for (const { s, el } of els) {
        const idx = s.picks[k];
        el.classList.remove('spinning');
        if (idx === undefined) continue;
        el.querySelector(`.seg[data-seg="${idx}"]`)?.classList.add('win');
        el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
        onStep?.(s.uid, k, idx);
      }
      k += 1;
      setTimeout(step, 450);
    }, duration + 60);
  };
  step();
}

/** Positionne directement les roues sur leur dernier lancer (sans animation). */
export function settleWheels(root, spins) {
  for (const s of spins) {
    const el = root.querySelector(`[data-wheel="${CSS.escape(s.uid)}"]`);
    const idx = s.picks[s.picks.length - 1];
    if (!el || idx === undefined) continue;
    el.querySelector('[data-rot]').style.transform = `rotate(${-idx * SEG}deg)`;
    el.querySelector(`.seg[data-seg="${idx}"]`)?.classList.add('win');
  }
}
