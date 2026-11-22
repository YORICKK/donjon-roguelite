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
  return { name, inventory: {}, unlockedLevel: 1, runs: 0, wins: 0 };
}
