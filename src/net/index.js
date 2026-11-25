// Choix du backend : Firebase si configuré (.env.local), sinon tout en local.
// Le mode solo utilise toujours le salon local (pas besoin de réseau) mais garde
// le profil (inventaire) dans Firebase quand il est disponible.
import { isFirebaseConfigured, firebaseLobbies, firebaseProfiles } from './firebase.js';
import { localLobbies, localProfiles } from './local.js';

export const online = isFirebaseConfigured;
export const profiles = online ? firebaseProfiles : localProfiles;
export const multiLobbies = online ? firebaseLobbies : localLobbies;
export const soloLobbies = localLobbies;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export function emptyProfile(name) {
  return { name, inventory: {}, heroXp: {}, unlockedLevel: 1, runs: 0, wins: 0 };
}

/** Fusionne deux progressions (ex. invité -> compte Google existant) : objets additionnés, meilleur niveau. */
export function mergeProfiles(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const inventory = { ...(a.inventory || {}) };
  for (const [id, n] of Object.entries(b.inventory || {})) inventory[id] = (inventory[id] || 0) + n;
  const heroXp = { ...(a.heroXp || {}) };
  for (const [c, xp] of Object.entries(b.heroXp || {})) heroXp[c] = Math.max(heroXp[c] || 0, xp);
  return {
    ...a,
    inventory,
    heroXp,
    wheels: { ...(b.wheels || {}), ...(a.wheels || {}) },
    unlockedLevel: Math.max(a.unlockedLevel || 1, b.unlockedLevel || 1),
    runs: (a.runs || 0) + (b.runs || 0),
    wins: (a.wins || 0) + (b.wins || 0),
  };
}
