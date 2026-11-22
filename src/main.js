// Contrôleur de l'application : écrans, salon, boucle de l'hôte, sauvegarde du butin.
import { MAX_EQUIPPED } from './data/items.js';
import { LEVELS, getLevel } from './data/levels.js';
import { Rng, randomSeed } from './core/rng.js';
import {
  createGame, generateDungeon, getChoices, tallyVotes, votersFor, resolveChoice, advance, finishLevelUp, keptLoot,
  VOTE_SECONDS, PICK_SECONDS,
} from './core/engine.js';
import { profiles, multiLobbies, soloLobbies, makeCode, emptyProfile, mergeProfiles } from './net/index.js';
import { createDungeonScene } from './scene/dungeon.js';
import { toast } from './ui/dom.js';
import { renderName, renderMenu, renderInventory, renderLobby, renderGame } from './ui/views.js';
import { CLASSES } from './data/classes.js';
import { actionFor } from './scene/anim.js';

const RESULT_AUTO_MS = 9000;
const ui = document.getElementById('ui');
const scene = createDungeonScene(document.getElementById('scene'));
scene.build(generateDungeon('menu', 1), getLevel(1));
if (import.meta.env.DEV) window.__scene = scene; // débogage uniquement (absent du build)

// Compteur de performance : ajouter ?fps à l'adresse (ex. https://…/?fps) pour l'afficher, y compris sur téléphone.
if (new URLSearchParams(location.search).has('fps')) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:20;font:11px monospace;color:#0f0;background:rgba(0,0,0,.65);padding:3px 6px;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(box);
  setInterval(() => {
    const s = scene.stats();
    box.textContent = `${s.fps} i/s · ${s.calls} appels · ${Math.round(s.triangles / 1000)}k tri · ${s.lights} lum · res ×${s.pixelRatio}`;
  }, 500);
}

const app = {
  screen: 'name', // name | menu | inventory | lobby
  name: localStorage.getItem('donjon:name') || '',
  uid: null,
  profile: null,
  api: null, // backend du salon courant
  code: null,
  lobby: null,
  unsub: null,
  unpresence: null,
  solo: false,
  builtSeed: null,
  animatedResult: null,
  savedRun: null,
  busy: false,
  waLink: '',
};
const pendingRoom = new URLSearchParams(location.search).get('room');

// ---------- Rendu ----------
function render() {
  const L = app.lobby;
  let html;
  if (app.screen === 'name') html = renderName(app, pendingRoom);
  else if (app.screen === 'menu') html = renderMenu(app);
  else if (app.screen === 'inventory') html = renderInventory(app);
  else if (!L) html = '<div class="screen"><div class="panel">Connexion au salon…</div></div>';
  else if (L.status === 'playing' && L.game) html = renderGame(app, L);
  else html = renderLobby(app, L);
  // Préserve le défilement du panneau d'événement entre deux rendus
  const sheet = ui.querySelector('[data-sheet]');
  const keepScroll = sheet ? sheet.scrollTop : 0;
  ui.innerHTML = html;
  const nextSheet = ui.querySelector('[data-sheet]');
  if (nextSheet) nextSheet.scrollTop = keepScroll;
  afterRender();
}

// ---------- Effets après rendu (dés, timer, scène, mobile) ----------
function afterRender() {
  const g = app.lobby?.status === 'playing' ? app.lobby.game : null;
  const key = g ? `${app.lobby.seed}|${g.roomIndex}|${g.round}` : null;
  const die = ui.querySelector('[data-die]');
  if (die && g?.lastResult) {
    const finalCls = die.dataset.success === 'true' ? 'success' : 'fail';
    if (app.animatedResult !== key) {
      app.animatedResult = key;
      const lines = ui.querySelector('[data-lines]');
      const txt = ui.querySelector('[data-rolltext]');
      lines.style.visibility = 'hidden';
      txt.style.visibility = 'hidden';
      die.classList.add('rolling');
      reactScene(g); // l'action se joue pendant que le dé roule
      const iv = setInterval(() => { die.textContent = 1 + Math.floor(Math.random() * 20); }, 60);
      setTimeout(() => {
        clearInterval(iv);
        die.classList.remove('rolling');
        die.classList.add(finalCls);
        die.textContent = die.dataset.final;
        lines.style.visibility = '';
        txt.style.visibility = '';
      }, 900);
    } else die.classList.add(finalCls);
  } else if (g?.lastResult && app.animatedResult !== key) {
    app.animatedResult = key;
    reactScene(g);
  }
  tickCountdown();
  updateInset();
}

// Vibration (mobile) : seulement après une interaction réelle, sinon le navigateur la refuse.
const buzz = (p) => { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(p); };

function reactScene(g) {
  const r = g.lastResult;
  const room = g.rooms[g.roomIndex];
  const players = app.lobby.players || {};
  const champ = players[r.championUid];
  const hurt = r.hurt || [];
  if (hurt.includes(app.uid)) buzz([60, 40, 120]);
  scene.playResult({
    championUid: r.championUid,
    anim: actionFor(r, champ ? CLASSES[champ.classId]?.skill.id : null),
    skillId: r.choiceId?.startsWith('skill:') && champ ? CLASSES[champ.classId]?.skill.id : null,
    success: r.roll ? r.roll.success : true,
    fled: !!g.enemy?.fled,
    enemyDied: !!(g.enemy && g.enemy.hp <= 0 && !g.enemy.fled),
    enemyHpFrac: g.enemy ? g.enemy.hp / g.enemy.maxHp : null,
    hurt,
    poisoned: r.poisoned || [],
    healed: !!r.healed || r.lines.some((l) => l.startsWith('💚')),
    chestOpen: room.type === 'chest' && r.lines.some((l) => l.startsWith('🎁')),
  });
  if (g.outcome === 'victory') setTimeout(() => scene.cheer(), 2200);
}

function tickCountdown() {
  const g = app.lobby?.game;
  const el = ui.querySelector('[data-countdown]');
  const bar = ui.querySelector('[data-timerbar]');
  if (!el || !g || !['vote', 'path', 'levelup'].includes(g.phase)) return;
  const left = Math.max(0, (g.deadline - Date.now()) / 1000);
  el.textContent = `⏳ ${Math.ceil(left)} s`;
  bar.style.width = `${(100 * left) / (g.phase === 'levelup' ? PICK_SECONDS : VOTE_SECONDS)}%`;
  bar.parentElement.classList.toggle('urgent', left < 8);
}
setInterval(tickCountdown, 250);

// Sur mobile, le panneau du bas cache une partie de la scène : on décale la caméra vers le haut.
function updateInset() {
  const sheet = ui.querySelector('[data-sheet]');
  if (!sheet) { scene.setBottomInset(0); return; }
  const r = sheet.getBoundingClientRect();
  const fullWidth = r.width > window.innerWidth * 0.8;
  scene.setBottomInset(fullWidth ? window.innerHeight - r.top : 0);
}
window.addEventListener('resize', () => updateInset());

// ---------- Synchronisation de la scène avec l'état ----------
function syncScene() {
  const L = app.lobby;
  if (L?.status === 'playing' && L.game) {
    const g = L.game;
    const key = `${L.seed}|${g.rooms.length}`;
    if (app.builtSeed !== key) {
      const sameRun = app.builtSeed?.startsWith(`${L.seed}|`);
      scene.build(g.rooms, getLevel(g.levelId));
      // Nouvelle salle ajoutée : on repart de la précédente pour marcher jusqu'à elle
      if (sameRun) scene.jumpTo(Math.max(0, g.roomIndex - 1));
      app.builtSeed = key;
    }
    scene.goToRoom(g.roomIndex);
    if (g.phase === 'levelup' && app.levelFx !== g.plevel) { app.levelFx = g.plevel; scene.cheer(); }
    scene.setParty(Object.entries(g.party).map(([uid, m]) => ({ uid, classId: L.players?.[uid]?.classId, alive: m.alive })));
    if (g.phase === 'vote' && g.enemy) scene.setRoomState({ enemyHpFrac: g.enemy.hp / g.enemy.maxHp });
  } else {
    if (app.builtSeed !== 'menu') {
      scene.build(generateDungeon('menu', L?.levelId || 1), getLevel(L?.levelId || 1));
      app.builtSeed = 'menu';
    }
    // Dans le salon, on voit déjà son groupe se former
    const players = Object.entries(L?.players || {}).filter(([, p]) => p.classId && p.online !== false);
    scene.setParty(players.map(([uid, p]) => ({ uid, classId: p.classId, alive: true })));
  }
}

// ---------- Salon ----------
function inviteUrl() {
  return `${location.origin}${location.pathname}?room=${app.code}`;
}
const inviteText = () => `⚔️ Rejoins mon donjon ! Code ${app.code} : ${inviteUrl()}`;

function onLobby(state) {
  if (!state) {
    toast('Ce salon n’existe plus.');
    leaveLobby();
    return;
  }
  const sig = JSON.stringify(state);
  if (sig === app.lobbySig) return;
  app.lobbySig = sig;
  app.lobby = normalize(state);
  maybeSaveRun();
  syncScene();
  render();
}

function normalize(L) {
  if (L.game) {
    L.game.party = L.game.party || {};
    L.game.votes = L.game.votes || {};
    L.game.loot = L.game.loot ? Object.values(L.game.loot) : [];
    L.game.rooms = Object.values(L.game.rooms || {});
    L.game.enemy = L.game.enemy || null;
    L.game.bag = L.game.bag || {};
    L.game.intro = L.game.intro ? Object.values(L.game.intro) : [];
    L.game.flags = L.game.flags || {};
    L.game.offers = L.game.offers || {};
    L.game.picks = L.game.picks || {};
    if (L.game.shop) L.game.shop = Object.values(L.game.shop);
    if (L.game.lastResult) {
      L.game.lastResult.lines = Object.values(L.game.lastResult.lines || {});
      L.game.lastResult.hurt = Object.values(L.game.lastResult.hurt || {});
      L.game.lastResult.poisoned = Object.values(L.game.lastResult.poisoned || {});
    }
  }
  for (const p of Object.values(L.players || {})) p.equipped = p.equipped ? Object.values(p.equipped) : [];
  return L;
}

async function enterLobby(api, code, create) {
  app.api = api;
  app.code = code;
  app.waLink = `https://wa.me/?text=${encodeURIComponent(inviteText())}`;
  app.lobby = null;
  app.lobbySig = null;
  app.screen = 'lobby';
  render();
  const player = { name: app.name, joinedAt: Date.now(), online: true, classId: null, ready: false, equipped: [] };
  if (create) {
    await api.create(code, {
      hostUid: app.uid, status: 'lobby', levelId: Math.min(app.profile.unlockedLevel || 1, LEVELS.length), seed: randomSeed(),
      players: { [app.uid]: player },
    });
  } else {
    if (!(await api.exists(code))) { toast('Salon introuvable.'); app.screen = 'menu'; render(); return; }
    await api.update(code, { [`players/${app.uid}/name`]: app.name, [`players/${app.uid}/joinedAt`]: Date.now() });
  }
  if (!app.solo) history.replaceState(null, '', `?room=${code}`);
  app.unpresence = api.setupPresence(code, app.uid);
  app.unsub = api.subscribe(code, onLobby);
}

function leaveLobby() {
  app.unsub?.();
  app.unpresence?.();
  if (app.api && app.code && app.lobby) {
    const p = app.lobby.players?.[app.uid];
    if (app.lobby.status === 'lobby' && p && app.lobby.hostUid !== app.uid) app.api.update(app.code, { [`players/${app.uid}`]: null });
    else app.api.update(app.code, { [`players/${app.uid}/online`]: false });
  }
  Object.assign(app, { api: null, code: null, lobby: null, unsub: null, unpresence: null, solo: false, screen: 'menu' });
  history.replaceState(null, '', location.pathname);
  syncScene();
  render();
}

const upd = (patch) => app.api.update(app.code, patch);

// ---------- Boucle de l'hôte ----------
let resolving = null;
setInterval(async () => {
  const L = app.lobby;
  if (!L || L.hostUid !== app.uid || L.status !== 'playing' || !L.game) return;
  const g = L.game;
  const key = `${L.seed}|${g.roomIndex}|${g.round}|${g.phase}`;
  if (resolving === key) return;
  const players = L.players || {};
  if (g.phase === 'levelup') {
    const pickers = Object.keys(g.offers || {}).filter((u) => g.party[u]?.alive && players[u]?.online !== false);
    if (!pickers.every((u) => g.picks?.[u]) && Date.now() < g.deadline) return;
    resolving = key;
    await upd({ game: finishLevelUp(g, L.seed) });
  } else if (g.phase === 'vote' || g.phase === 'path') {
    const voters = votersFor(g, players);
    const allVoted = voters.length > 0 && voters.every((u) => g.votes[u]);
    if (!allVoted && Date.now() < g.deadline) return;
    resolving = key;
    const choices = getChoices(g, players);
    const rng = new Rng(`${L.seed}|tally|${g.roomIndex}|${g.round}`);
    const choiceId = tallyVotes(g.votes, choices, L.hostUid, rng);
    const next = resolveChoice(g, players, choiceId, L.seed);
    next.resultAt = Date.now();
    await upd({ game: next });
  } else if (g.phase === 'result') {
    if (Date.now() - (g.resultAt || 0) < RESULT_AUTO_MS) return;
    resolving = key;
    await doContinue();
  }
}, 400);

async function doContinue() {
  const next = advance(app.lobby.game, app.lobby.seed);
  const patch = { game: next };
  if (next.phase === 'over') patch.lastOutcome = next.outcome;
  await upd(patch);
}

// ---------- Sauvegarde du butin (chaque joueur sauvegarde son propre profil) ----------
async function maybeSaveRun() {
  const L = app.lobby;
  const g = L?.game;
  if (!g || !g.outcome || !g.party?.[app.uid]) return;
  const runKey = `${app.code}|${L.seed}`;
  if (app.savedRun === runKey || localStorage.getItem(`donjon:saved:${app.uid}`) === runKey) return;
  app.savedRun = runKey;
  localStorage.setItem(`donjon:saved:${app.uid}`, runKey);
  const inv = { ...(app.profile.inventory || {}) };
  for (const id of keptLoot(g)) inv[id] = (inv[id] || 0) + 1;
  app.profile.inventory = inv;
  app.profile.runs = (app.profile.runs || 0) + 1;
  if (g.outcome === 'victory') {
    app.profile.wins = (app.profile.wins || 0) + 1;
    app.profile.unlockedLevel = Math.min(LEVELS.length, Math.max(app.profile.unlockedLevel || 1, g.levelId + 1));
  }
  try { await profiles.save(app.uid, app.profile); } catch (e) { console.error(e); toast('Sauvegarde impossible : ' + e.message); }
}

// ---------- Actions ----------
const actions = {
  async solo() {
    app.solo = true;
    await enterLobby(soloLobbies, `SOLO-${app.uid}`, true);
  },
  async create() {
    let code = makeCode();
    for (let i = 0; i < 5 && (await multiLobbies.exists(code)); i++) code = makeCode();
    await enterLobby(multiLobbies, code, true);
  },
  inventory() { app.screen = 'inventory'; render(); },
  menu() { app.screen = 'menu'; render(); },
  logout() { app.screen = 'name'; render(); },
  /** Connexion Google : lie le compte invité (même progression) ou bascule sur un compte existant (fusion). */
  async google() {
    const typed = document.querySelector('#pseudo')?.value.trim();
    const before = app.profile || app.cachedProfile || null;
    let res;
    try {
      res = await profiles.google(); // la fenêtre Google s'ouvre tout de suite (geste de l'utilisateur)
    } catch (e) {
      console.error(e);
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast('Connexion Google impossible : ' + (e.code || e.message));
      return;
    }
    if (!res) return; // redirection en cours
    let profile = await profiles.load(res.uid);
    if (res.switched && before) {
      profile = mergeProfiles(profile, before);
      toast('Compte Google retrouvé : vos objets d’invité y ont été ajoutés.');
    } else {
      profile = profile || before;
      toast('Connecté avec Google ✔ Votre progression est sauvegardée sur ce compte.');
    }
    const name = (typed || profile?.name || app.name || res.displayName?.split(' ')[0] || 'Aventurier').slice(0, 16);
    profile = { ...(profile || emptyProfile(name)), name };
    await profiles.save(res.uid, profile);
    Object.assign(app, { uid: res.uid, name, profile, account: res, cachedProfile: profile, screen: 'menu' });
    localStorage.setItem('donjon:name', name);
    render();
    if (pendingRoom) enterLobby(multiLobbies, pendingRoom.toUpperCase(), false);
  },
  async googleLogout() {
    if (!confirm('Se déconnecter du compte Google ? Votre progression reste enregistrée sur ce compte.')) return;
    await profiles.signOut();
    Object.assign(app, { uid: null, profile: null, cachedProfile: null, account: null, screen: 'name' });
    render();
    toast('Déconnecté. Vous jouerez en invité jusqu’à la prochaine connexion.');
  },
  copy() {
    navigator.clipboard?.writeText(inviteUrl()).then(() => toast('Lien copié !'), () => toast(inviteUrl()));
  },
  async share() {
    try { await navigator.share({ title: 'Donjon Roguelite', text: inviteText(), url: inviteUrl() }); }
    catch (e) { if (e.name !== 'AbortError') actions.copy(); }
  },
  class(el) { upd({ [`players/${app.uid}/classId`]: el.dataset.id }); },
  equip(el) {
    const me = app.lobby.players[app.uid];
    let eq = [...(me.equipped || [])];
    const id = el.dataset.id;
    if (eq.includes(id)) eq = eq.filter((x) => x !== id);
    else if (eq.length < MAX_EQUIPPED) eq.push(id);
    else { toast(`Maximum ${MAX_EQUIPPED} objets.`); return; }
    upd({ [`players/${app.uid}/equipped`]: eq });
  },
  ready() {
    const me = app.lobby.players[app.uid];
    upd({ [`players/${app.uid}/ready`]: !me.ready });
  },
  start() {
    const L = app.lobby;
    const seed = L.seed || randomSeed();
    const players = Object.fromEntries(Object.entries(L.players || {}).filter(([, p]) => p.online !== false && p.classId));
    upd({ status: 'playing', seed, game: createGame(seed, L.levelId || 1, players) });
  },
  pick(el) {
    buzz(15);
    upd({ [`game/picks/${app.uid}`]: el.dataset.id });
  },
  vote(el) {
    buzz(15);
    upd({ [`game/votes/${app.uid}`]: el.dataset.id });
  },
  continue() { resolving = `${app.lobby.seed}|${app.lobby.game.roomIndex}|${app.lobby.game.round}|result`; doContinue(); },
  relobby() {
    const patch = { status: 'lobby', game: null, seed: randomSeed() };
    for (const uid of Object.keys(app.lobby.players || {})) patch[`players/${uid}/ready`] = false;
    upd(patch);
  },
  abandon() {
    if (app.lobby.hostUid === app.uid) {
      if (!confirm('Abandonner le run pour tout le groupe ? Aucun butin ne sera conservé.')) return;
      actions.relobby();
    } else leaveLobby();
  },
  leave() { leaveLobby(); },
};

ui.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  e.preventDefault();
  actions[el.dataset.action]?.(el);
});

ui.addEventListener('change', (e) => {
  if (e.target.matches('[data-change="level"]')) upd({ levelId: Number(e.target.value) });
});

ui.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.form === 'name') {
    const name = form.name.value.trim().slice(0, 16);
    if (!name) return;
    form.name.blur(); // ferme le clavier mobile
    app.busy = true; render();
    try {
      app.uid = await profiles.signIn(name);
      app.name = name;
      localStorage.setItem('donjon:name', name);
      app.profile = (await profiles.load(app.uid)) || emptyProfile(name);
      app.account = (await profiles.account?.()) || null;
      if (app.profile.name !== name) { app.profile.name = name; profiles.save(app.uid, app.profile); }
      app.screen = 'menu';
    } catch (err) {
      console.error(err);
      toast('Connexion impossible : ' + err.message);
    }
    app.busy = false;
    render();
    if (app.screen === 'menu' && pendingRoom) enterLobby(multiLobbies, pendingRoom.toUpperCase(), false);
  } else if (form.dataset.form === 'join') {
    const code = form.code.value.trim().toUpperCase();
    form.code.blur();
    if (code) enterLobby(multiLobbies, code, false);
  }
});

// Compte déjà mémorisé sur cet appareil : on précharge sa progression (utile pour la fusion vers Google)
// et on reprend son pseudo.
if (profiles.googleAvailable) {
  profiles.account().then(async (acc) => {
    if (!acc) return;
    app.account = acc;
    try { app.cachedProfile = await profiles.load(acc.uid); } catch { /* hors ligne */ }
    if (acc.switched && acc.previousProfile) {
      app.cachedProfile = mergeProfiles(app.cachedProfile, acc.previousProfile);
      await profiles.save(acc.uid, app.cachedProfile);
      toast('Compte Google retrouvé : vos objets d’invité y ont été ajoutés.');
    }
    if (!app.name) app.name = app.cachedProfile?.name || acc.displayName?.split(' ')[0] || '';
    if (app.screen === 'name') render();
  }).catch((e) => console.warn(e));
}

render();
