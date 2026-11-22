// Backend Firebase : auth anonyme, Realtime Database pour les salons (temps réel),
// Firestore pour les profils joueurs (inventaire persistant, niveaux débloqués).
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, onValue, update, get, set, onDisconnect, serverTimestamp } from 'firebase/database';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const env = import.meta.env;
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId);

let app, auth, db, fs;
function ensure() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    fs = getFirestore(app);
  }
}

function waitForUser() {
  ensure();
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user); }
    });
    signInAnonymously(auth).catch((e) => { unsub(); reject(e); });
  });
}

export const firebaseLobbies = {
  mode: 'firebase',
  async exists(code) {
    ensure();
    return (await get(ref(db, `lobbies/${code}/hostUid`))).exists();
  },
  async create(code, data) {
    ensure();
    await set(ref(db, `lobbies/${code}`), { ...data, createdAt: serverTimestamp() });
  },
  subscribe(code, cb) {
    ensure();
    return onValue(ref(db, `lobbies/${code}`), (snap) => cb(snap.val()));
  },
  async update(code, patch) {
    ensure();
    await update(ref(db, `lobbies/${code}`), patch);
  },
  setupPresence(code, uid) {
    ensure();
    const onlineRef = ref(db, `lobbies/${code}/players/${uid}/online`);
    onDisconnect(onlineRef).set(false);
    set(onlineRef, true);
    return () => onDisconnect(onlineRef).cancel();
  },
};

export const firebaseProfiles = {
  mode: 'firebase',
  async signIn() {
    const user = await waitForUser();
    return user.uid;
  },
  async load(uid) {
    ensure();
    const snap = await getDoc(doc(fs, 'players', uid));
    return snap.exists() ? snap.data() : null;
  },
  async save(uid, profile) {
    ensure();
    await setDoc(doc(fs, 'players', uid), { ...profile, updatedAt: Date.now() }, { merge: true });
  },
};
