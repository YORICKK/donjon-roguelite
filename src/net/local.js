// Backend local (sans Firebase) : profils et salons dans localStorage.
// Les onglets d'un même navigateur se synchronisent via l'événement 'storage',
// ce qui permet de tester le multijoueur à plusieurs onglets sans rien configurer.
import { applyPatch } from './patch.js';

const LOBBY_KEY = (code) => `donjon:lobby:${code}`;
const PROFILE_KEY = (uid) => `donjon:profile:${uid}`;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('localStorage indisponible', e); }
}

export function slug(name) {
  return name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'joueur';
}

const listeners = new Map(); // code -> Set(cb)
window.addEventListener('storage', (e) => {
  if (!e.key?.startsWith('donjon:lobby:')) return;
  const code = e.key.slice('donjon:lobby:'.length);
  const value = read(e.key);
  listeners.get(code)?.forEach((cb) => cb(value));
});

export const localLobbies = {
  mode: 'local',
  async exists(code) { return !!read(LOBBY_KEY(code)); },
  async create(code, data) { write(LOBBY_KEY(code), data); },
  subscribe(code, cb) {
    if (!listeners.has(code)) listeners.set(code, new Set());
    listeners.get(code).add(cb);
    queueMicrotask(() => cb(read(LOBBY_KEY(code))));
    return () => listeners.get(code)?.delete(cb);
  },
  async update(code, patch) {
    const next = applyPatch(read(LOBBY_KEY(code)) || {}, patch);
    write(LOBBY_KEY(code), next);
    listeners.get(code)?.forEach((cb) => cb(next));
  },
  setupPresence(code, uid) {
    const off = () => { this.update(code, { [`players/${uid}/online`]: false }); };
    window.addEventListener('beforeunload', off);
    this.update(code, { [`players/${uid}/online`]: true });
    return () => window.removeEventListener('beforeunload', off);
  },
};

export const localProfiles = {
  mode: 'local',
  googleAvailable: false,
  async signIn(name) { return `local-${slug(name)}`; },
  async account() { return null; },
  async load(uid) { return read(PROFILE_KEY(uid)); },
  async save(uid, profile) { write(PROFILE_KEY(uid), profile); },
};
