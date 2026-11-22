// Backend Firebase : auth (invité anonyme ou compte Google), Realtime Database pour les salons
// (temps réel), Firestore pour les profils joueurs (inventaire persistant, niveaux débloqués).
import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, GoogleAuthProvider, linkWithPopup, signInWithPopup, signInWithCredential,
  signInWithRedirect, linkWithRedirect, getRedirectResult, signOut,
} from 'firebase/auth';
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
    auth.languageCode = 'fr';
    db = getDatabase(app);
    fs = getFirestore(app);
  }
}

/** Utilisateur déjà connecté (session mémorisée) ou nouvel invité anonyme. */
async function currentOrAnonymous() {
  ensure();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

const describe = (user) => user && {
  uid: user.uid,
  google: !user.isAnonymous && user.providerData.some((p) => p.providerId === 'google.com'),
  email: user.email || null,
  displayName: user.displayName || null,
};

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
  googleAvailable: true,
  async signIn() {
    return (await currentOrAnonymous()).uid;
  },
  /** Compte déjà mémorisé sur cet appareil (sans en créer), et fin d'une éventuelle redirection Google. */
  async account() {
    ensure();
    await auth.authStateReady();
    // Retour d'une redirection Google (repli quand la fenêtre est bloquée)
    const before = auth.currentUser;
    const previousProfile = before?.isAnonymous ? await this.load(before.uid).catch(() => null) : null;
    try {
      await getRedirectResult(auth);
    } catch (e) {
      if (e.code === 'auth/credential-already-in-use') {
        // Ce compte Google existait déjà : on bascule dessus, l'appelant fusionne la progression de l'invité.
        const res = await signInWithCredential(auth, GoogleAuthProvider.credentialFromError(e));
        return { ...describe(res.user), switched: true, previousProfile };
      }
      console.warn('Retour Google :', e.code);
    }
    return describe(auth.currentUser);
  },
  /**
   * Connexion Google. Si un invité est déjà connecté, son compte est « lié » à Google : même identifiant,
   * même progression. Si ce compte Google existait déjà ailleurs, on bascule dessus (`switched`) et
   * l'appelant fusionne la progression de l'invité.
   * À appeler directement depuis un clic (sinon le navigateur bloque la fenêtre Google).
   */
  async google() {
    ensure();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const user = auth.currentUser;
    const previousUid = user?.uid || null;
    try {
      const res = user?.isAnonymous ? await linkWithPopup(user, provider) : await signInWithPopup(auth, provider);
      return { ...describe(res.user), previousUid, switched: false };
    } catch (e) {
      if (e.code === 'auth/credential-already-in-use') {
        const cred = GoogleAuthProvider.credentialFromError(e);
        const res = await signInWithCredential(auth, cred);
        return { ...describe(res.user), previousUid, switched: true };
      }
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        // Repli : redirection vers Google (la page se recharge ensuite)
        if (user?.isAnonymous) await linkWithRedirect(user, provider);
        else await signInWithRedirect(auth, provider);
        return null;
      }
      throw e;
    }
  },
  async signOut() {
    ensure();
    await signOut(auth);
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
