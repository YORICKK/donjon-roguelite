// Contrôleur de l'application : écrans, salon, boucle de l'hôte, sauvegarde du butin.
import { CLASSES, STAT_LABELS } from './data/classes.js';
import { ITEMS, RARITY, MAX_EQUIPPED, describeBonus } from './data/items.js';
import { LEVELS, getLevel } from './data/levels.js';
import { ENEMIES, ROOM_TYPE_LABELS } from './data/events.js';
import { Rng, randomSeed } from './core/rng.js';
import {
  computeCharacter, createGame, generateDungeon, getChoices, getEvent, tallyVotes,
  votersFor, resolveChoice, advance, keptLoot, VOTE_SECONDS,
} from './core/engine.js';
import { online, profiles, multiLobbies, soloLobbies, makeCode, emptyProfile } from './net/index.js';
import { createDungeonScene } from './scene/dungeon.js';
import { esc, toast, fmtMod } from './ui/dom.js';

const RESULT_AUTO_MS = 9000;
const ui = document.getElementById('ui');
const scene = createDungeonScene(document.getElementById('scene'));
scene.build(generateDungeon('menu', 1), getLevel(1));
if (import.meta.env.DEV) window.__scene = scene; // débogage uniquement (absent du build)

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
};
const pendingRoom = new URLSearchParams(location.search).get('room');

// ---------- Rendu ----------
function render() {
  const fn = { name: renderName, menu: renderMenu, inventory: renderInventory, lobby: renderLobby }[app.screen];
  ui.innerHTML = fn();
  afterRender();
}

function renderName() {
  return `
  <div class="center-screen"><div class="panel menu">
    <h1>Donjon Roguelite</h1>
    <p class="muted">Un donjon, des choix, des dés. Mourir fait partie du voyage.</p>
    ${pendingRoom ? `<p>Invitation au salon <b class="code" style="font-size:1.2rem">${esc(pendingRoom)}</b></p>` : ''}
    <form data-form="name" class="row">
      <input name="name" maxlength="16" placeholder="Votre pseudo" value="${esc(app.name)}" autocomplete="nickname" required autofocus />
      <button class="primary" ${app.busy ? 'disabled' : ''}>Entrer</button>
    </form>
    <span class="badge ${online ? 'online' : ''}">${online ? '● En ligne (Firebase)' : '● Mode local (Firebase non configuré)'}</span>
  </div></div>`;
}

function renderMenu() {
  const inv = Object.values(app.profile.inventory || {}).reduce((a, b) => a + b, 0);
  return `
  <div class="center-screen"><div class="panel menu">
    <h1>Donjon Roguelite</h1>
    <p>Bienvenue, <b>${esc(app.name)}</b>. <span class="muted small">${app.profile.runs || 0} runs · ${app.profile.wins || 0} victoires</span></p>
    <button class="primary" data-action="solo">Jouer en solo</button>
    <button data-action="create">Créer un salon multijoueur</button>
    <form data-form="join" class="row">
      <input name="code" maxlength="5" placeholder="Code du salon" style="text-transform:uppercase" required />
      <button>Rejoindre</button>
    </form>
    <button data-action="inventory">Inventaire (${inv} objet${inv > 1 ? 's' : ''})</button>
    <button class="ghost small" data-action="logout">Changer de pseudo</button>
    ${online ? '' : '<p class="muted small">Mode local : le multijoueur fonctionne entre onglets de ce navigateur (un pseudo différent par onglet). Configurez Firebase pour jouer à distance.</p>'}
  </div></div>`;
}

function renderInventory() {
  const entries = Object.entries(app.profile.inventory || {}).filter(([, n]) => n > 0);
  return `
  <div class="center-screen"><div class="panel menu wide" style="text-align:left">
    <h2>Inventaire de ${esc(app.name)}</h2>
    <p class="muted small">Les objets sont conservés entre les parties. Équipez-en jusqu'à ${MAX_EQUIPPED} avant chaque run.
    Niveau débloqué : ${app.profile.unlockedLevel || 1} / ${LEVELS.length}</p>
    <div class="items">
      ${entries.length ? entries.map(([id, n]) => itemChip(id, `×${n}`)).join('') : '<p class="muted">Rien pour le moment. Ouvrez des coffres !</p>'}
    </div>
    <div class="row" style="margin-top:16px"><button data-action="menu">Retour</button></div>
  </div></div>`;
}

function itemChip(id, extra = '', attrs = '', selected = false) {
  const it = ITEMS[id];
  if (!it) return '';
  const r = RARITY[it.rarity];
  return `<button class="item ${selected ? 'selected' : ''}" style="--rc:${r.color}" ${attrs} title="${esc(r.label)}">
    ${it.icon} ${esc(it.name)} <span class="muted">${esc(describeBonus(it.bonus))}</span> ${extra}</button>`;
}

function renderLobby() {
  const L = app.lobby;
  if (!L) return `<div class="center-screen"><div class="panel">Connexion au salon…</div></div>`;
  if (L.status === 'playing' && L.game) return renderGame(L);
  const players = L.players || {};
  const me = players[app.uid] || {};
  const isHost = L.hostUid === app.uid;
  const url = inviteUrl();
  const wa = `https://wa.me/?text=${encodeURIComponent(`⚔️ Rejoins mon donjon ! Code ${app.code} : ${url}`)}`;
  const allReady = Object.values(players).filter((p) => p.online !== false).every((p) => (p.ready || app.solo) && p.classId);
  const owned = Object.entries(app.profile.inventory || {}).filter(([, n]) => n > 0).map(([id]) => id);
  const equipped = me.equipped || [];
  const maxLevel = isHost ? app.profile.unlockedLevel || 1 : LEVELS.length;
  const level = getLevel(L.levelId);
  const preview = me.classId ? computeCharacter(me.classId, equipped) : null;

  return `
  <div class="center-screen"><div class="panel wide">
    <div class="lobby-grid">
      <div>
        ${app.solo ? '<h2>Partie solo</h2>' : `
        <h2>Salon</h2>
        <div class="code">${esc(app.code)}</div>
        <div class="row" style="margin:8px 0 14px">
          <button data-action="copy">Copier le lien</button>
          <a class="btn whatsapp" href="${wa}" target="_blank" rel="noopener">Inviter sur WhatsApp</a>
        </div>
        ${online ? '' : '<p class="muted small">Mode local : le lien ne marche que dans ce navigateur.</p>'}`}
        <h3>Aventuriers</h3>
        <ul class="player-list">
          ${Object.entries(players).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0)).map(([uid, p]) => `
            <li class="${p.online === false ? 'offline' : ''}">
              <span>${uid === L.hostUid ? '👑 ' : ''}${esc(p.name)}${uid === app.uid ? ' (vous)' : ''}</span>
              <span>${p.classId ? `${CLASSES[p.classId].icon} ${CLASSES[p.classId].name}` : '<span class="muted">…</span>'}
              ${p.ready ? '✅' : '⏳'}</span>
            </li>`).join('')}
        </ul>
        <h3 style="margin-top:16px">Donjon</h3>
        ${isHost ? `<select data-change="level">
          ${LEVELS.map((l) => `<option value="${l.id}" ${l.id === L.levelId ? 'selected' : ''} ${l.id > maxLevel ? 'disabled' : ''}>
            Niveau ${l.id} — ${esc(l.name)}${l.id > maxLevel ? ' 🔒' : ''}</option>`).join('')}
        </select>` : `<p>Niveau ${level.id} — ${esc(level.name)}</p>`}
        <p class="muted small">${level.rooms} salles + boss · DD +${level.dcBonus} · ennemis ×${level.enemyScale}</p>
        ${L.lastOutcome ? `<p class="small">Dernier run : ${L.lastOutcome === 'victory' ? '🏆 Victoire' : '☠️ Défaite'}</p>` : ''}
      </div>
      <div>
        <h3>Choisissez votre classe</h3>
        <div class="class-grid">
          ${Object.values(CLASSES).map((c) => `
            <button class="class-card ${me.classId === c.id ? 'selected' : ''}" data-action="class" data-id="${c.id}" ${me.ready ? 'disabled' : ''}>
              <span class="name">${c.icon} ${c.name}</span>
              <span class="small muted">${c.desc}</span>
              <span class="stats">${Object.entries(c.stats).map(([k, v]) => `${STAT_LABELS[k]} ${fmtMod(v)}`).join(' ')}<br/>PV ${c.hp} · Dégâts d${c.dmg}</span>
              <span class="small">★ ${c.skill.name} : <span class="muted">${c.skill.desc}</span></span>
            </button>`).join('')}
        </div>
        <h3 style="margin-top:14px">Équipement (${equipped.length}/${MAX_EQUIPPED})</h3>
        <div class="items">
          ${owned.length ? owned.map((id) => itemChip(id, '', `data-action="equip" data-id="${id}" ${me.ready ? 'disabled' : ''}`, equipped.includes(id))).join('') : '<p class="muted small">Aucun objet. Survivez pour en rapporter !</p>'}
        </div>
        ${preview ? `<p class="stats" style="margin-top:8px">Votre perso : ${Object.entries(preview.stats).map(([k, v]) => `${STAT_LABELS[k]} ${fmtMod(v)}`).join(' ')} · PV ${preview.maxHp} · d${preview.dmg}</p>` : ''}
        <div class="row" style="margin-top:14px">
          ${app.solo ? '' : `<button class="${me.ready ? '' : 'primary'}" data-action="ready" ${me.classId ? '' : 'disabled'}>${me.ready ? 'Changer' : 'Prêt !'}</button>`}
          ${isHost ? `<button class="primary" data-action="start" ${allReady ? '' : 'disabled'}>Lancer le run</button>` : '<span class="muted small">L’hôte lance la partie quand tout le monde est prêt.</span>'}
          <button class="ghost" data-action="leave">Quitter</button>
        </div>
      </div>
    </div>
  </div></div>`;
}

function renderGame(L) {
  const g = L.game;
  const players = L.players || {};
  const party = g.party || {};
  const room = g.rooms[g.roomIndex];
  const level = getLevel(g.levelId);
  const me = party[app.uid];
  const isHost = L.hostUid === app.uid;

  const partyHtml = Object.entries(party).map(([uid, m]) => {
    const p = players[uid] || {};
    const c = CLASSES[p.classId] || {};
    return `<div class="panel member ${m.alive ? '' : 'dead'}">
      <div>${c.icon || ''} <b>${esc(p.name)}</b>${p.online === false ? ' <span class="muted small">(hors ligne)</span>' : ''}</div>
      <div class="small muted">${c.name || ''} · ${m.alive ? `${m.hp}/${m.maxHp} PV` : '☠️ mort'}${m.skillUsed ? '' : ' · ★'}</div>
      <div class="bar"><div style="width:${(100 * m.hp) / m.maxHp}%"></div></div>
    </div>`;
  }).join('');

  let body;
  if (g.phase === 'over') body = renderOver(L);
  else {
    const ev = getEvent(room);
    const enemy = g.enemy ? ENEMIES[g.enemy.id] : null;
    const title = enemy ? `${enemy.boss ? '👹 ' : ''}${enemy.name}` : ev.title;
    const text = enemy
      ? (enemy.boss ? `Le gardien du donjon se dresse devant vous. ${g.round ? '' : 'Il n’y aura pas de fuite possible.'}` : g.round ? 'Le combat continue !' : `Un ${enemy.name.toLowerCase()} vous barre la route.`)
      : ev.text;
    body = `
      <div class="type">Salle ${g.roomIndex + 1}/${g.rooms.length} · ${ROOM_TYPE_LABELS[room.type]}</div>
      <h2>${esc(title)}</h2>
      ${enemy ? `<div class="small">${g.enemy.hp}/${g.enemy.maxHp} PV · DD ${enemy.dc + level.dcBonus}</div><div class="bar enemy"><div style="width:${(100 * g.enemy.hp) / g.enemy.maxHp}%"></div></div>` : ''}
      <p>${esc(text)}</p>
      ${g.phase === 'vote' ? renderVote(L) : renderResult(L, isHost)}`;
  }

  return `
  <div class="hud">
    <div class="hud-top">
      <div class="party">${partyHtml}</div>
      <div class="panel progress small">
        <div>${esc(level.name)}</div>
        <div class="muted">Butin : ${(g.loot || []).map((id) => ITEMS[id].icon).join(' ') || '—'}</div>
        ${me && !me.alive ? '<div class="result-ko">Vous êtes mort — spectateur</div>' : ''}
        <button class="ghost small" data-action="abandon" style="margin-top:6px">${isHost ? 'Abandonner le run' : 'Quitter'}</button>
      </div>
    </div>
    <div class="panel event">${body}</div>
  </div>`;
}

function renderVote(L) {
  const g = L.game;
  const players = L.players || {};
  const choices = getChoices(g, players);
  const votes = g.votes || {};
  const voters = votersFor(g, players);
  const canVote = voters.includes(app.uid);
  const myVote = votes[app.uid];
  return `
    <div class="choices">
      ${choices.map((c) => {
        const who = Object.entries(votes).filter(([, v]) => v === c.id).map(([u]) => players[u]?.name || '?');
        return `<button class="choice ${myVote === c.id ? 'voted' : ''}" data-action="vote" data-id="${esc(c.id)}" ${canVote ? '' : 'disabled'} title="${esc(c.desc || '')}">
          <span>${esc(c.label)} ${c.stat ? `<span class="stat">[${STAT_LABELS[c.stat]}]</span>` : ''}</span>
          <span class="votes">${who.length ? `${who.length} · ${esc(who.join(', '))}` : ''}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="row small muted" style="justify-content:space-between;margin-top:8px">
      <span>Vote majoritaire · ${Object.keys(votes).length}/${voters.length} votes</span>
      <span data-countdown></span>
    </div>
    <div class="timer"><div data-timerbar style="width:100%"></div></div>`;
}

function renderResult(L, isHost) {
  const r = L.game.lastResult;
  if (!r) return '';
  const roll = r.roll;
  return `
    <h3>${esc(r.label)}</h3>
    ${roll ? `<div class="roll">
      <div class="die" data-die data-final="${roll.d20}" data-success="${roll.success}">${roll.d20}</div>
      <div data-rolltext>
        <div>d20 (${roll.d20}) ${fmtMod(roll.mod)} ${STAT_LABELS[roll.stat]} = <b>${roll.total}</b> contre DD ${roll.dc}</div>
        <div class="${roll.success ? 'result-ok' : 'result-ko'}">${roll.crit ? 'Réussite critique !' : roll.fumble ? 'Échec critique !' : roll.success ? 'Réussite' : 'Échec'}</div>
      </div>
    </div>` : ''}
    <ul class="lines" data-lines>${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="row" style="margin-top:12px">
      ${isHost ? '<button class="primary" data-action="continue">Continuer</button><span class="muted small">(automatique dans quelques secondes)</span>' : '<span class="muted small">En attente de l’hôte…</span>'}
    </div>`;
}

function renderOver(L) {
  const g = L.game;
  const kept = keptLoot(g);
  const isHost = L.hostUid === app.uid;
  const inParty = !!(g.party || {})[app.uid];
  const r = g.lastResult;
  return `
    <h2>${g.outcome === 'victory' ? '🏆 Victoire !' : '☠️ Le groupe a péri'}</h2>
    ${r ? `<ul class="lines">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <p>${g.outcome === 'victory'
      ? `Le boss de « ${esc(getLevel(g.levelId).name)} » est tombé. Chaque survivant… et chaque mort rapporte tout le butin.`
      : 'La mort est définitive pour ce run. Chaque aventurier ne sauve que l’objet le plus précieux.'}</p>
    <h3>Objets conservés ${inParty ? '(ajoutés à votre inventaire)' : ''}</h3>
    <div class="items">${kept.length ? kept.map((id) => itemChip(id)).join('') : '<span class="muted">Aucun.</span>'}</div>
    ${g.outcome === 'victory' && g.levelId < LEVELS.length ? `<p class="result-ok">Niveau ${g.levelId + 1} débloqué : ${esc(getLevel(g.levelId + 1).name)} !</p>` : ''}
    <div class="row" style="margin-top:14px">
      ${isHost ? '<button class="primary" data-action="relobby">Nouveau run</button>' : '<span class="muted small">L’hôte peut relancer un run.</span>'}
      <button data-action="leave">Menu principal</button>
    </div>`;
}

// ---------- Effets après rendu (dés, timer, scène) ----------
function afterRender() {
  const g = app.lobby?.status === 'playing' ? app.lobby.game : null;
  const die = ui.querySelector('[data-die]');
  if (die && g?.lastResult) {
    const key = `${app.lobby.seed}|${g.roomIndex}|${g.round}`;
    const finalCls = die.dataset.success === 'true' ? 'success' : 'fail';
    if (app.animatedResult !== key) {
      app.animatedResult = key;
      const lines = ui.querySelector('[data-lines]');
      const txt = ui.querySelector('[data-rolltext]');
      lines.style.visibility = 'hidden';
      txt.style.visibility = 'hidden';
      die.classList.add('rolling');
      const iv = setInterval(() => { die.textContent = 1 + Math.floor(Math.random() * 20); }, 60);
      setTimeout(() => {
        clearInterval(iv);
        die.classList.remove('rolling');
        die.classList.add(finalCls);
        die.textContent = die.dataset.final;
        lines.style.visibility = '';
        txt.style.visibility = '';
        reactScene(g);
      }, 900);
    } else die.classList.add(finalCls);
  } else if (g?.lastResult && app.animatedResult !== `${app.lobby.seed}|${g.roomIndex}|${g.round}`) {
    app.animatedResult = `${app.lobby.seed}|${g.roomIndex}|${g.round}`;
    reactScene(g);
  }
  tickCountdown();
}

function reactScene(g) {
  const r = g.lastResult;
  const room = g.rooms[g.roomIndex];
  const hurt = r.lines.some((l) => l.startsWith('💥'));
  if (hurt) { scene.flash(0xff2222); scene.shakeHit(); }
  else if (r.roll?.success || !r.roll) scene.flash(0xffdd66);
  scene.setRoomState({
    enemyHpFrac: g.enemy ? g.enemy.hp / g.enemy.maxHp : null,
    enemyDead: !!(g.enemy && g.enemy.hp <= 0),
    chestOpen: room.type === 'chest' && r.lines.some((l) => l.startsWith('🎁')),
  });
}

function tickCountdown() {
  const g = app.lobby?.game;
  const el = ui.querySelector('[data-countdown]');
  const bar = ui.querySelector('[data-timerbar]');
  if (!el || !g || g.phase !== 'vote') return;
  const left = Math.max(0, (g.deadline - Date.now()) / 1000);
  el.textContent = `${Math.ceil(left)} s`;
  bar.style.width = `${(100 * left) / VOTE_SECONDS}%`;
}
setInterval(tickCountdown, 250);

// ---------- Synchronisation de la scène avec l'état ----------
function syncScene() {
  const L = app.lobby;
  if (L?.status === 'playing' && L.game) {
    const g = L.game;
    if (app.builtSeed !== L.seed) {
      scene.build(g.rooms, getLevel(g.levelId));
      app.builtSeed = L.seed;
    }
    scene.goToRoom(g.roomIndex);
    if (g.phase === 'vote' && g.enemy) scene.setRoomState({ enemyHpFrac: g.enemy.hp / g.enemy.maxHp });
  } else if (app.builtSeed !== 'menu') {
    scene.build(generateDungeon('menu', L?.levelId || 1), getLevel(L?.levelId || 1));
    app.builtSeed = 'menu';
  }
}

// ---------- Salon ----------
function inviteUrl() {
  return `${location.origin}${location.pathname}?room=${app.code}`;
}

function onLobby(state) {
  if (!state) {
    toast('Ce salon n’existe plus.');
    leaveLobby();
    return;
  }
  const prevSig = app.lobbySig;
  app.lobby = normalize(state);
  const sig = JSON.stringify(state);
  if (sig === prevSig) return;
  app.lobbySig = sig;
  maybeSaveRun();
  syncScene();
  // Évite de re-rendre l'écran du salon pendant qu'on tape (rien à taper dedans, mais garde le select ouvert)
  render();
}

function normalize(L) {
  if (L.game) {
    L.game.party = L.game.party || {};
    L.game.votes = L.game.votes || {};
    L.game.loot = L.game.loot ? Object.values(L.game.loot) : [];
    L.game.rooms = Object.values(L.game.rooms || {});
    L.game.enemy = L.game.enemy || null;
    if (L.game.lastResult) L.game.lastResult.lines = Object.values(L.game.lastResult.lines || {});
  }
  for (const p of Object.values(L.players || {})) p.equipped = p.equipped ? Object.values(p.equipped) : [];
  return L;
}

async function enterLobby(api, code, create) {
  app.api = api;
  app.code = code;
  app.lobby = null;
  app.lobbySig = null;
  app.screen = 'lobby';
  render();
  const player = { name: app.name, joinedAt: Date.now(), online: true, classId: null, ready: false, equipped: [] };
  if (create) {
    await api.create(code, {
      hostUid: app.uid, status: 'lobby', levelId: 1, seed: randomSeed(),
      players: { [app.uid]: player },
    });
  } else {
    const existing = (await api.exists(code));
    if (!existing) { toast('Salon introuvable.'); app.screen = 'menu'; render(); return; }
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
  if (g.phase === 'vote') {
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
  const g = app.lobby.game;
  const next = advance(g);
  const patch = { game: next };
  if (next.phase === 'over') patch.lastOutcome = next.outcome;
  await upd(patch);
}

// ---------- Sauvegarde du butin (chaque joueur sauvegarde son propre profil) ----------
async function maybeSaveRun() {
  const L = app.lobby;
  const g = L?.game;
  if (!g || !g.outcome || !g.party?.[app.uid]) return;
  const runKey = `${L.code || app.code}|${L.seed}`;
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
  copy() {
    navigator.clipboard?.writeText(inviteUrl()).then(() => toast('Lien copié !'), () => toast(inviteUrl()));
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
    const game = createGame(seed, L.levelId || 1, players);
    upd({ status: 'playing', seed, game });
  },
  vote(el) { upd({ [`game/votes/${app.uid}`]: el.dataset.id }); },
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
    app.busy = true; render();
    try {
      app.uid = await profiles.signIn(name);
      app.name = name;
      localStorage.setItem('donjon:name', name);
      app.profile = (await profiles.load(app.uid)) || emptyProfile(name);
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
    if (code) enterLobby(multiLobbies, code, false);
  }
});

render();
