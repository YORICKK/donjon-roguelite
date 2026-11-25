// Gabarits HTML des écrans. Fonctions pures : (app, état) -> chaîne HTML.
import { CLASSES, STAT_LABELS } from '../data/classes.js';
import { ITEMS, RARITY, MAX_EQUIPPED, describeBonus, isGear } from '../data/items.js';
import { TILES, WHEEL_SIZE, ULT_WHEELS, ownedTiles, sanitizeWheel, tileColor } from '../data/wheel.js';
import { wheelSvg } from './wheel.js';
import { LEVELS, getLevel } from '../data/levels.js';
import { ENEMIES, ROOM_TYPE_LABELS, INTENTS } from '../data/events.js';
import { NODE_TYPES, CONSUMABLES, BOONS, XP_LEVELS, STATUS, ELITE } from '../data/run.js';
import { HERO_MAX, heroProgress, perkLabel } from '../data/heroes.js';
import { computeCharacter, getChoices, getEvent, votersFor, previewChoice, keptLoot, nextNodes, shownType } from '../core/engine.js';
import { online, profiles } from '../net/index.js';
import { esc, fmtMod } from './dom.js';

const BASE = import.meta.env.BASE_URL;
export const ROOM_ICONS = { combat: '⚔️', trap: '🪤', chest: '🧰', shrine: '⛩️', npc: '🧙', rest: '🔥', boss: '💀', elite: '💀', shop: '🛒', entrance: '🚪' };

export const portraitUrl = (classId) => `${BASE}portraits/${classId}.png`;
const portrait = (classId, cls = '') =>
  classId ? `<img class="portrait ${cls}" src="${portraitUrl(classId)}" alt="" style="--cc:${CLASSES[classId].color}" />`
    : `<span class="portrait ${cls}" style="display:grid;place-items:center">?</span>`;

function hpClass(hp, max) {
  const f = hp / max;
  return f <= 0.25 ? 'crit' : f <= 0.5 ? 'low' : '';
}

function statLine(stats) {
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

function accountBlock(app, where) {
  if (!online || !profiles.googleAvailable) return '';
  const acc = app.account;
  if (acc?.google) {
    return `<div class="account">${G_LOGO}<span>Connecté : <b>${esc(acc.email || acc.displayName || 'compte Google')}</b></span>
      ${where === 'menu' ? '<button class="ghost small" data-action="googleLogout">Se déconnecter</button>' : ''}</div>`;
  }
  return `<button class="google" data-action="google">${G_LOGO}<span>${where === 'menu' ? 'Sauvegarder avec Google' : 'Continuer avec Google'}</span></button>
    <p class="muted small">${where === 'menu' ? 'Vous jouez en invité : connectez Google pour retrouver vos objets sur tous vos appareils.' : 'Ou entrez un pseudo pour jouer en invité.'}</p>`;
}

const strip = () => `<div class="heroes-strip">${Object.keys(CLASSES).map((c) => `<img src="${portraitUrl(c)}" alt="" />`).join('')}</div>`;

// ---------- Accueil ----------
export function renderName(app, pendingRoom) {
  return `
  <div class="screen"><div class="panel ornate menu">
    ${strip()}
    <h1>Donjon<br>Roguelite</h1>
    <p class="tagline">Un donjon, des choix, des dés. Mourir fait partie du voyage.</p>
    ${pendingRoom ? `<p>On vous invite au salon <b class="chip gold">${esc(pendingRoom)}</b></p>` : ''}
    <form data-form="name" class="stack">
      <label class="sr" for="pseudo">Pseudo</label>
      <input id="pseudo" name="name" maxlength="16" placeholder="Votre pseudo" value="${esc(app.name)}" autocomplete="nickname" enterkeyhint="go" required />
      <button class="primary" ${app.busy ? 'disabled' : ''}>${pendingRoom ? 'Rejoindre la partie' : 'Entrer dans le donjon'}</button>
    </form>
    ${accountBlock(app, 'name')}
    <div><span class="badge ${online ? 'online' : ''}">● ${online ? 'En ligne' : 'Mode local (Firebase non configuré)'}</span></div>
  </div></div>`;
}

// ---------- Niveau de héros (permanent, par classe) ----------
function heroBar(app, classId, compact = false) {
  const p = heroProgress(app.profile.heroXp?.[classId] || 0);
  const next = p.level < HERO_MAX ? `${p.into}/${p.need} XP · prochain : ${perkLabel(classId, p.level + 1)}` : 'Niveau maximum';
  return `<span class="hero-lv${compact ? ' compact' : ''}" title="${esc(next)}"><span class="chip">Niv. ${p.level}</span><span class="xpbar"><i style="width:${Math.round(p.frac * 100)}%"></i></span>${compact ? '' : `<span class="muted small">${esc(next)}</span>`}</span>`;
}

function heroGainLine(h) {
  const up = h.after > h.before;
  const perks = [];
  for (let lv = h.before + 1; lv <= h.after; lv++) perks.push(perkLabel(h.classId, lv));
  return `<p class="${up ? 'result-ok' : 'muted'}">⭐ ${esc(CLASSES[h.classId].name)} : +${h.gain} XP conservés${up ? ` — niveau ${h.after} ! (${esc(perks.join(', '))})` : ` (niveau ${h.after})`}</p>`;
}

// ---------- Menu ----------
export function renderMenu(app) {
  const inv = Object.values(app.profile.inventory || {}).reduce((a, b) => a + b, 0);
  return `
  <div class="screen"><div class="panel ornate menu">
    ${strip()}
    <h1>Donjon<br>Roguelite</h1>
    <p>Bienvenue, <b>${esc(app.name)}</b><br><span class="muted small">${app.profile.runs || 0} runs · ${app.profile.wins || 0} victoires · niveau ${app.profile.unlockedLevel || 1} débloqué</span></p>
    <button class="primary" data-action="solo">⚔️ Jouer en solo</button>
    <button data-action="create">👥 Créer un salon</button>
    <form data-form="join" class="row">
      <input name="code" maxlength="5" placeholder="CODE" autocapitalize="characters" autocomplete="off" enterkeyhint="go" style="text-transform:uppercase;letter-spacing:0.2em;text-align:center" required />
      <button>Rejoindre</button>
    </form>
    <button data-action="inventory">🎒 Inventaire (${inv})</button>
    ${accountBlock(app, 'menu')}
    <button class="ghost small" data-action="logout">Changer de pseudo</button>
    ${online ? '' : '<p class="muted small">Mode local : le multijoueur marche entre onglets de ce navigateur.</p>'}
  </div></div>`;
}

export function renderInventory(app) {
  const entries = Object.entries(app.profile.inventory || {}).filter(([id, n]) => n > 0 && ITEMS[id])
    .sort((a, b) => RARITY[ITEMS[b[0]].rarity].rank - RARITY[ITEMS[a[0]].rarity].rank);
  const items = entries.filter(([id]) => isGear(id));
  const tiles = entries.filter(([id]) => ITEMS[id].tile);
  const pets = entries.filter(([id]) => ITEMS[id].companion);
  return `
  <div class="screen"><div class="panel ornate menu wide" style="text-align:left;max-width:640px">
    <h2>🎒 Inventaire</h2>
    <p class="muted small">Conservé entre les parties. Équipez jusqu'à ${MAX_EQUIPPED} objets avant chaque run.</p>
    <div class="items">${items.length ? items.map(([id, n]) => itemChip(id, `<span class="chip">×${n}</span>`)).join('') : '<p class="muted">Rien pour le moment. Ouvrez des coffres !</p>'}</div>
    <h3 style="margin-top:14px">🎡 Tuiles de roue</h3>
    <p class="muted small">Gagnées dans les donjons. Placez-les sur la roue de chaque classe dans le salon pour remplacer les « Raté ».</p>
    <div class="items">${tiles.length ? tiles.map(([id, n]) => tileChip(id, `<span class="chip">×${n}</span>`)).join('') : '<p class="muted">Aucune tuile pour le moment.</p>'}</div>
    <h3 style="margin-top:14px">⭐ Héros</h3>
    <p class="muted small">L’XP gagnée pendant un run, même perdu, reste acquise par la classe jouée et débloque des bonus permanents.</p>
    <div class="heroes">${Object.values(CLASSES).map((c) => `<div class="hero-row">${portrait(c.id)}<b>${c.name}</b>${heroBar(app, c.id)}</div>`).join('')}</div>
    <h3 style="margin-top:14px">🐾 Compagnons</h3>
    <p class="muted small">Un compagnon par joueur et par run. On en trouve sur les boss, les élites, chez le marchand… ou en secourant un animal. ✨ 1 fois sur 10, c’est une variante chromatique : si vous avez les deux, choisissez celle qui vous accompagne.</p>
    <div class="items">${pets.length ? pets.map(([id]) => itemChip(id)).join('') : '<p class="muted">Aucun compagnon pour l\u2019instant.</p>'}</div>
    <div class="action-bar"><button data-action="menu">← Retour</button></div>
  </div></div>`;
}

// ---------- Salon ----------
export function renderLobby(app, L) {
  const players = L.players || {};
  const me = players[app.uid] || {};
  const isHost = L.hostUid === app.uid;
  const allReady = Object.values(players).filter((p) => p.online !== false).every((p) => (p.ready || app.solo) && p.classId);
  const ownedAll = Object.entries(app.profile.inventory || {}).filter(([id, n]) => n > 0 && ITEMS[id]).map(([id]) => id);
  const owned = ownedAll.filter((id) => isGear(id));
  const ownedPets = ownedAll.filter((id) => ITEMS[id].companion);
  const equipped = me.equipped || [];
  const maxLevel = isHost ? app.profile.unlockedLevel || 1 : LEVELS.length;
  const level = getLevel(L.levelId);
  const preview = me.classId ? computeCharacter(me.classId, equipped, [], me.companion || null, me.heroLevel || 1) : null;
  const canShare = typeof navigator.share === 'function';
  // Deux pages : 1) classe, 2) équipement + compagnon (retour forcé à la 1re si aucune classe)
  const step = me.classId && ['wheel', 'gear'].includes(app.lobbyStep) ? app.lobbyStep : 'class';

  return `
  <div class="screen lobby-screen"><div class="panel ornate wide">
    <div class="lobby">
      <section class="stack">
        ${app.solo ? '<h2>Partie solo</h2>' : `
        <div><h3>Salon</h3><div class="code">${esc(app.code)}</div></div>
        <div class="row">
          ${canShare ? '<button class="primary" data-action="share">📤 Inviter</button>' : ''}
          <a class="btn whatsapp" href="${esc(app.waLink)}" target="_blank" rel="noopener">WhatsApp</a>
          <button data-action="copy">Copier le lien</button>
        </div>
        ${online ? '' : '<p class="muted small">Mode local : le lien ne marche que dans ce navigateur.</p>'}`}
        <div>
          <h3>Aventuriers</h3>
          <ul class="player-list">
            ${Object.entries(players).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0)).map(([uid, p]) => `
              <li class="${p.online === false ? 'offline' : ''}">
                ${portrait(p.classId)}
                <span class="grow">${uid === L.hostUid ? '👑 ' : ''}<b>${esc(p.name)}</b>${uid === app.uid ? ' <span class="muted">(vous)</span>' : ''}<br>
                <span class="muted small">${p.classId ? `${CLASSES[p.classId].name} niv. ${p.heroLevel || 1}` : 'choisit sa classe…'}${ITEMS[p.companion]?.companion ? ` · ${ITEMS[p.companion].icon}${ITEMS[p.companion].shiny ? '✨' : ''} ${esc(ITEMS[p.companion].name)}` : ''}</span></span>
                <span>${p.ready || app.solo ? '✅' : '⏳'}</span>
              </li>`).join('')}
          </ul>
        </div>
        <div>
          <h3>Donjon</h3>
          ${isHost ? `<select data-change="level" aria-label="Niveau">
            ${LEVELS.map((l) => `<option value="${l.id}" ${l.id === L.levelId ? 'selected' : ''} ${l.id > maxLevel ? 'disabled' : ''}>
              ${l.id > maxLevel ? '🔒' : '🏰'} ${l.id}. ${esc(l.name)}</option>`).join('')}
          </select>` : `<p><b>${level.id}. ${esc(level.name)}</b></p>`}
          <p class="muted small">${level.rooms} salles + boss · DD +${level.dcBonus} · ennemis ×${level.enemyScale}</p>
          ${L.lastOutcome ? `<p class="small">Dernier run : ${L.lastOutcome === 'victory' ? '🏆 Victoire' : '☠️ Défaite'}</p>` : ''}
        </div>
      </section>
      <section>
        <div class="steps">
          <span class="${step === 'class' ? 'on' : 'done'}">1. Classe</span>
          <span class="${step === 'wheel' ? 'on' : step === 'gear' ? 'done' : ''}">2. Roue</span>
          <span class="${step === 'gear' ? 'on' : ''}">3. Équipement</span>
        </div>
        ${step === 'class' ? `
        <h3>Votre classe</h3>
        <div class="class-grid">
          ${Object.values(CLASSES).map((c) => `
            <button class="class-card ${me.classId === c.id ? 'selected' : ''}" style="--cc:${c.color}" data-action="class" data-id="${c.id}" ${me.ready && !app.solo ? 'disabled' : ''}>
              ${portrait(c.id, 'lg')}
              <span>
                <span class="name">${c.name}</span> ${heroBar(app, c.id, true)}<br>
                <span class="desc">${c.desc}</span>
                <span class="statline">${statLine(c.stats)}<span class="stat">❤️ ${c.hp}</span><span class="stat">🗡 d${c.dmg}</span></span>
              </span>
              <span class="skill">★ <b>${c.skill.name}</b> — ${c.skill.desc}</span>
            </button>`).join('')}
        </div>
        <div class="action-bar sticky">
          <button class="primary grow" data-action="nextStep" ${me.classId ? '' : 'disabled'}>${me.classId ? `Suivant : la roue ▶` : 'Choisissez une classe'}</button>
          <button class="ghost" data-action="leave">Quitter</button>
        </div>` : step === 'wheel' ? wheelEditor(app, me) : `
        <div class="chosen-class" style="--cc:${CLASSES[me.classId].color}">
          ${portrait(me.classId, 'lg')}
          <span class="grow"><span class="name">${CLASSES[me.classId].name}</span> ${heroBar(app, me.classId, true)}<br>
          <span class="muted small">★ ${CLASSES[me.classId].skill.name} — ${CLASSES[me.classId].skill.desc}</span></span>
        </div>
        <h3 style="margin-top:14px">Équipement <span class="chip">${equipped.length}/${MAX_EQUIPPED}</span></h3>
        <div class="items">
          ${owned.length ? owned.map((id) => itemChip(id, '', `data-action="equip" data-id="${id}" ${me.ready && !app.solo ? 'disabled' : ''}`, equipped.includes(id))).join('') : '<p class="muted small">Aucun objet. Survivez pour en rapporter !</p>'}
        </div>
        <h3 style="margin-top:14px">Compagnon <span class="chip">${me.companion ? 1 : 0}/1</span></h3>
        <div class="items">
          ${ownedPets.length ? ownedPets.map((id) => itemChip(id, '', `data-action="pet" data-id="${id}" ${me.ready && !app.solo ? 'disabled' : ''}`, me.companion === id)).join('') : '<p class="muted small">Aucun compagnon. Secourez un animal ou battez un boss pour en gagner un !</p>'}
        </div>
        ${preview ? `<div class="statline" style="margin-top:10px"><span class="muted small">Votre héros :</span> ${statLine(preview.stats)}<span class="stat hi">❤️ ${preview.maxHp}</span><span class="stat">🗡 d${preview.dmg}</span></div>` : ''}
        <div class="action-bar sticky">
          <button data-action="prevStep" ${me.ready && !app.solo ? 'disabled' : ''}>◀ Roue</button>
          ${app.solo ? '' : `<button class="${me.ready ? '' : 'primary'}" data-action="ready">${me.ready ? 'Modifier' : 'Prêt !'}</button>`}
          ${isHost ? `<button class="primary" data-action="start" ${allReady ? '' : 'disabled'}>Lancer le run ▶</button>` : '<span class="muted small hint grow">L’hôte lance la partie quand tout le monde est prêt.</span>'}
          <button class="ghost" data-action="leave">Quitter</button>
        </div>`}
      </section>
    </div>
  </div></div>`;
}

// ---------- Partie ----------
function intentLine(g, level) {
  const e = ENEMIES[g.enemy.id];
  const it = INTENTS[g.enemy.intent] || INTENTS.attack;
  const max = Math.round(e.dmg * level.enemyScale * (g.enemy.elite ? ELITE.dmg : 1) + (g.enemy.rage || 0));
  const dmgTxt = g.enemy.intent === 'heavy' ? ` · ~${Math.round(max * 1.3)} dégâts, même si vous réussissez` :
    g.enemy.intent === 'attack' ? ` · jusqu'à ${max} dégâts si vous échouez` :
    g.enemy.intent === 'poison' ? ' · empoisonne si vous échouez' : '';
  const hint = g.enemy.intent === 'heavy' ? ' — levez la garde !' : g.enemy.intent === 'defend' ? ' — bon moment pour se soigner' : '';
  return `<div class="intent intent-${g.enemy.intent}"><span class="ico">${it.icon}</span><span><b>Intention : ${it.label}</b>${dmgTxt}${hint}</span></div>`;
}

function renderMap(g) {
  const reachable = new Set(nextNodes(g).map((n) => n.id));
  const visited = new Set(g.rooms.map((r) => r.nodeId).filter(Boolean));
  const floors = Object.values(g.map.floors);
  return `<div class="map">${floors.map((f) => `<div class="map-floor">${Object.values(f).map((n) => {
    const cls = n.id === g.nodeId ? 'cur' : visited.has(n.id) ? 'done' : reachable.has(n.id) ? 'next' : '';
    const t = NODE_TYPES[shownType(g, n)];
    return `<span class="map-node ${cls}" title="${esc(t.label)}">${t.icon}</span>`;
  }).join('')}</div>`).join('<span class="map-link">›</span>')}</div>`;
}

export function renderGame(app, L) {
  const g = L.game;
  const players = L.players || {};
  const party = g.party || {};
  const level = getLevel(g.levelId);
  const isHost = L.hostUid === app.uid;
  const votes = g.votes || {};
  // pendant que les roues tournent, on n'affiche pas encore les PV restants de l'ennemi
  const spinKey = `${L.seed}|${g.roomIndex}|${g.round}`;
  const holding = g.lastResult?.spins && g.lastResult.enemyBefore != null && (app.animatedResult !== spinKey || app.spinning === spinKey);
  const shownHp = g.enemy ? (holding ? Math.max(0, g.lastResult.enemyBefore) : g.enemy.hp) : 0;
  const voting = g.phase === 'vote' || g.phase === 'path';
  const picking = g.phase === 'levelup';

  const partyHtml = Object.entries(party).map(([uid, m]) => {
    const p = players[uid] || {};
    const c = CLASSES[p.classId] || {};
    const done = (voting && votes[uid]) || (picking && g.picks?.[uid]);
    const boons = Object.values(m.boons || {}).map((b) => BOONS[b]?.icon).join('');
    return `<div class="member ${m.alive ? '' : 'dead'} ${uid === app.uid ? 'me' : ''}">
      ${portrait(p.classId)}
      <div class="info">
        <div class="nm">${esc(p.name)}${m.pet && ITEMS[m.pet] ? ` <span title="${esc(ITEMS[m.pet].name)}">${ITEMS[m.pet].icon}${ITEMS[m.pet].shiny ? '✨' : ''}</span>` : ''}</div>
        <div class="sub"><span class="cls">${c.name || ''}</span><span>${m.alive ? `${m.hp}/${m.maxHp}` : '☠️'}</span>
          ${m.poison ? `<span title="Empoisonné">${STATUS.poison.icon}</span>` : ''}${g.blessed > 0 && m.alive ? `<span title="Béni">${STATUS.blessed.icon}</span>` : ''}
          ${boons ? `<span class="boons" title="Bonus de niveau">${boons}</span>` : ''}${p.online === false ? '<span>📴</span>' : ''}</div>
        <div class="hp ${hpClass(m.hp, m.maxHp)}"><div style="width:${(100 * m.hp) / m.maxHp}%"></div></div>
      </div>
      ${(voting || picking) && m.alive ? `<span class="tag ${done ? '' : 'wait'}">${done ? '✓' : '…'}</span>` : ''}
    </div>`;
  }).join('');

  const floors = Object.values(g.map.floors).length;
  const floorNow = g.nodeId ? Number(g.nodeId.split('-')[0]) + 1 : 0;
  const nextXp = XP_LEVELS[g.plevel] ?? null;
  const prevXp = XP_LEVELS[g.plevel - 1] ?? 0;
  const xpPct = nextXp ? Math.min(100, ((g.xp - prevXp) / (nextXp - prevXp)) * 100) : 100;
  const bag = Object.entries(g.bag || {}).filter(([, n]) => n > 0).map(([id, n]) => `<span title="${esc(CONSUMABLES[id].name)}">${CONSUMABLES[id].icon}${n > 1 ? `<sub>${n}</sub>` : ''}</span>`).join('');

  let body;
  if (g.phase === 'over') body = renderOver(app, L);
  else if (g.phase === 'path') {
    body = `
      <div class="kicker"><span class="ico">🧭</span> Étage ${floorNow + 1}/${floors}</div>
      <h2>${floorNow === 0 ? 'L’entrée du donjon' : 'Le couloir se divise'}</h2>
      ${renderMap(g)}
      <p class="story">${floorNow === 0 ? 'Deux passages s’enfoncent dans l’obscurité. Par où commencer ?' : 'Plusieurs portes s’offrent à vous. Chaque choix ferme les autres chemins.'}</p>
      ${renderVote(app, L)}`;
  } else if (g.phase === 'levelup') {
    body = renderLevelUp(app, L);
  } else {
    const room = g.rooms[g.roomIndex];
    const enemy = g.enemy ? ENEMIES[g.enemy.id] : null;
    const shop = room.type === 'shop';
    const ev = getEvent(room);
    const title = shop ? 'Le marchand ambulant' : enemy ? `${enemy.name}${g.enemy.elite ? ' <span class="chip bad">ÉLITE</span>' : ''}${g.enemy.phase === 2 ? ' <span class="chip bad">FURIEUX</span>' : ''}` : esc(ev.title);
    const text = shop ? '« Des potions, des bombes, des babioles… Tout a un prix, mais tout peut sauver une vie. »'
      : enemy ? (enemy.boss ? (g.round ? 'Le gardien vacille… ou pas.' : 'Le gardien du donjon se dresse devant vous. Aucune fuite possible.') : g.round ? 'Le combat continue !' : `Un ${enemy.name.toLowerCase()}${g.enemy.elite ? ' d’élite' : ''} vous barre la route.`)
      : ev.text;
    const icon = room.hidden ? '❓' : NODE_TYPES[room.type]?.icon || ROOM_ICONS[room.type];
    body = `
      <div class="kicker"><span class="ico">${icon}</span> Étage ${floorNow}/${floors} · ${room.hidden ? 'Inconnu → ' : ''}${ROOM_TYPE_LABELS[room.type] || NODE_TYPES[room.type]?.label}</div>
      <h2>${title}</h2>
      ${enemy ? `<div class="hp enemy"><div style="width:${(100 * shownHp) / g.enemy.maxHp}%"></div></div>
        <div class="enemy-line"><span>❤️ ${shownHp}/${g.enemy.maxHp}</span>${g.enemy.rage ? `<span>😡 +${g.enemy.rage}</span>` : ''}</div>
        ${g.phase === 'vote' ? intentLine(g, level) : ''}` : ''}
      ${shop ? `<p class="gold-line">💰 ${g.gold} pièces d'or</p>` : ''}
      ${g.phase === 'vote' && g.round === 0 && g.intro?.length ? `<ul class="lines intro">${g.intro.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${g.phase === 'vote' ? `<p class="story">${esc(text)}</p>${g.cursed ? '<p class="small result-ko">💀 Vous êtes maudits : −1 à tous les jets.</p>' : ''}${renderVote(app, L)}` : renderResult(app, L, isHost)}`;
  }

  return `
  <div class="hud">
    <div class="topbar">
      <div class="party">${partyHtml}</div>
      <div class="status">
        <div class="panel levelbox">
          <div class="lv">${esc(level.name)}</div>
          <div class="runstats"><span title="Or du groupe">💰 ${g.gold || 0}</span><span title="Niveau du groupe">⭐ ${g.plevel}</span>${g.cursed ? '<span title="Maudits : −1 à tous les jets">💀</span>' : ''}${g.flags?.allie ? '<span title="Un allié vous attend au boss">🤝</span>' : ''}${g.flags?.faveur ? '<span title="Faveur de la déesse">🌟</span>' : ''}${g.revealed ? '<span title="Carte révélée">🗺️</span>' : ''}${bag ? `<span class="bag" title="Sac du groupe">${bag}</span>` : ''}</div>
          <div class="xp" title="Expérience : ${g.xp || 0}${nextXp ? ` / ${nextXp}` : ''}"><div style="width:${xpPct}%"></div></div>
          <div class="loot">🎒 ${(g.loot || []).map((id) => ITEMS[id].icon).join(' ') || 'aucun butin'}</div>
        </div>
        <button class="menu-btn" data-action="abandon" aria-label="${isHost ? 'Abandonner le run' : 'Quitter'}">${isHost ? '🏳️ Abandon' : '🚪 Quitter'}</button>
      </div>
    </div>
    <div class="panel ornate sheet" data-sheet>${body}</div>
  </div>`;
}

function renderLevelUp(app, L) {
  const g = L.game;
  const players = L.players || {};
  const mine = Object.values(g.offers?.[app.uid] || {});
  const myPick = g.picks?.[app.uid];
  const waiting = Object.keys(g.offers || {}).filter((u) => !g.picks?.[u]).map((u) => esc(players[u]?.name || '?'));
  return `
    <div class="kicker"><span class="ico">⭐</span> Montée de niveau</div>
    <h2>Le groupe passe niveau ${g.plevel} !</h2>
    <p class="story">L’expérience forge les héros. ${mine.length ? 'Choisissez votre bonus pour la suite du run :' : 'Vous regardez vos compagnons choisir.'}</p>
    <div class="choices">
      ${mine.map((id) => {
        const b = BOONS[id];
        return `<button class="choice ${myPick === id ? 'voted' : ''}" data-action="pick" data-id="${id}">
          <span class="lbl">${b.icon} ${b.name}</span><span></span>
          <span class="meta"><span class="chip gold">${esc(b.desc)}</span></span></button>`;
      }).join('')}
    </div>
    <div class="votebar"><span>${waiting.length ? `En attente : ${waiting.join(', ')}` : 'Tout le monde a choisi !'}</span><span data-countdown></span></div>
    <div class="timer"><div data-timerbar style="width:100%"></div></div>`;
}

function renderVote(app, L) {
  const g = L.game;
  const players = L.players || {};
  const choices = getChoices(g, players);
  const votes = g.votes || {};
  const voters = votersFor(g, players);
  const canVote = voters.includes(app.uid);
  const myVote = votes[app.uid];
  return `
    ${canVote ? '' : '<p class="result-ko small">☠️ Vous êtes mort — vous regardez la suite.</p>'}
    <div class="choices">
      ${choices.map((c) => {
        const pv = previewChoice(g, players, c);
        const voterImgs = Object.entries(votes).filter(([, v]) => v === c.id)
          .map(([u]) => `<img src="${portraitUrl(players[u]?.classId || 'guerrier')}" alt="${esc(players[u]?.name || '')}" title="${esc(players[u]?.name || '')}" />`).join('');
        const pct = pv ? Math.round(pv.chance * 100) : null;
        const tone = pct === null ? '' : pct >= 60 ? 'good' : pct >= 35 ? 'mid' : 'bad';
        let meta;
        const priceChip = c.price !== undefined ? `<span class="chip ${c.disabled ? 'bad' : 'gold'}">💰 ${c.price}</span>` : '';
        if (pv) meta = `${priceChip}<span class="chip ${tone}">${pct}%</span><span>${STAT_LABELS[c.stat]} ${fmtMod(pv.mod)} · DD ${pv.dc}</span>`;
        else if (c.disabled && c.desc) meta = `${priceChip}<span>${esc(c.desc)}</span>`;
        else if (c.price !== undefined) meta = `${priceChip}<span>${esc(c.desc || '')}</span>`;
        else if (c.skill) meta = `<span class="chip gold">Compétence</span><span>${esc(c.desc || '')}</span>`;
        else if (c.item) meta = `<span class="chip gold">Objet</span><span>${esc(c.desc || '')}</span>`;
        else if (c.path) meta = `<span>${esc(c.desc || '')}</span>`;
        else meta = '<span class="chip">Sans risque</span>';
        // détail complet au survol / appui long (le bouton n'en montre qu'un résumé)
        const tip = [c.label, pv ? `${players[pv.uid]?.name || ''} tente : ${STAT_LABELS[c.stat]} ${fmtMod(pv.mod)} contre DD ${pv.dc} (${pct} %)` : '', c.desc || ''].filter(Boolean).join(' — ');
        return `<button class="choice ${myVote === c.id ? 'voted' : ''} ${c.skill || c.item ? 'skill' : ''}" title="${esc(tip)}" data-action="vote" data-id="${esc(c.id)}" ${canVote && !c.disabled ? '' : 'disabled'}>
          <span class="lbl">${esc(c.label)}</span>
          <span class="voters">${voterImgs}</span>
          <span class="meta">${meta}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="votebar"><span>🗳️ Vote majoritaire · ${Object.keys(votes).length}/${voters.length}</span><span data-countdown></span></div>
    <div class="timer"><div data-timerbar style="width:100%"></div></div>`;
}

function renderResult(app, L, isHost) {
  const r = L.game.lastResult;
  if (!r) return '';
  const roll = r.roll;
  return `
    <p class="story"><b>${esc(r.label)}</b></p>
    ${roll ? `<div class="roll">
      <div class="die" data-die data-final="${roll.d20}" data-success="${roll.success}">${roll.d20}</div>
      <div data-rolltext>
        <div class="verdict ${roll.success ? 'result-ok' : 'result-ko'}">${roll.crit ? 'RÉUSSITE CRITIQUE !' : roll.fumble ? 'ÉCHEC CRITIQUE !' : roll.success ? 'Réussite' : 'Échec'}</div>
        <div class="small muted">d20 ${roll.d20} ${fmtMod(roll.mod)} ${STAT_LABELS[roll.stat]} = <b>${roll.total}</b> contre DD ${roll.dc}</div>
      </div>
    </div>` : ''}
    ${r.spins ? spinsBlock(L.game, L.players || {}, r, app.uid, app.animatedResult !== `${L.seed}|${L.game.roomIndex}|${L.game.round}` || app.spinning === `${L.seed}|${L.game.roomIndex}|${L.game.round}`) : ''}
    <ul class="lines" data-lines>${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="action-bar">
      ${isHost ? `<button class="primary grow" data-action="continue" ${wheelsTurning(app, L) ? 'disabled' : ''}>Continuer ▶</button>` : '<span class="muted small">En attente de l’hôte…</span>'}
    </div>`;
}

/** Les roues du dernier résultat sont-elles encore en train de tourner sur cet écran ? */
function wheelsTurning(app, L) {
  const key = `${L.seed}|${L.game.roomIndex}|${L.game.round}`;
  return !!L.game.lastResult?.spins && (app.animatedResult !== key || app.spinning === key);
}

function renderOver(app, L) {
  const g = L.game;
  const kept = keptLoot(g);
  const isHost = L.hostUid === app.uid;
  const inParty = !!(g.party || {})[app.uid];
  const r = g.lastResult;
  const players = L.players || {};
  const win = g.outcome === 'victory';
  return `
    <h2 class="over-title">${win ? '🏆 Victoire !' : '☠️ Le groupe a péri'}</h2>
    <div class="over-portraits">${Object.keys(g.party || {}).map((u) => portrait(players[u]?.classId)).join('')}</div>
    ${r ? `<ul class="lines">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <p class="muted">${win
      ? `Le boss de « ${esc(getLevel(g.levelId).name)} » est tombé. Chacun rapporte tout le butin.`
      : 'La mort est définitive pour ce run. Chacun ne sauve que l’objet le plus précieux.'}</p>
    <h3>Objets conservés ${inParty ? '' : '(spectateur)'}</h3>
    <div class="items">${kept.length ? kept.map((id) => itemChip(id)).join('') : '<span class="muted">Aucun.</span>'}</div>
    ${app.heroGain && inParty && app.heroGain.runKey === `${app.code}|${L.seed}` ? heroGainLine(app.heroGain) : ''}
    ${win && g.levelId < LEVELS.length ? `<p class="result-ok">🔓 Niveau ${g.levelId + 1} débloqué : ${esc(getLevel(g.levelId + 1).name)} !</p>` : ''}
    <div class="action-bar">
      ${isHost ? '<button class="primary grow" data-action="relobby">Nouveau run</button>' : ''}
      <button data-action="leave">Menu</button>
    </div>`;
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

function wheelEditor(app, me) {
  const wheel = currentWheel(app, me.classId);
  const slot = Math.min(WHEEL_SIZE - 1, Math.max(0, app.wheelSlot || 0));
  const owned = ownedTiles(app.profile.inventory || {}, me.classId);
  const used = wheel.reduce((m, id) => ({ ...m, [id]: (m[id] || 0) + 1 }), {});
  const order = { commun: 0, rare: 1, epique: 2, legendaire: 3 };
  const ids = Object.keys(owned).filter((id) => TILES[id]).sort((a, b) => order[TILES[b].rarity] - order[TILES[a].rarity] || TILES[a].name.localeCompare(TILES[b].name));
  const locked = me.ready && !app.solo ? 'disabled' : '';
  const cur = TILES[wheel[slot]];
  return `
    <div class="wheel-editor">
      <div class="wheel-stage">${wheelSvg(wheel, { size: 230, selected: slot, editable: !locked, uid: 'editor' })}</div>
      <div class="wheel-side">
        <h3>Votre roue <span class="chip">${CLASSES[me.classId].name}</span></h3>
        <p class="muted small">À chaque attaque, la roue tourne 2 fois. Touchez une case, puis une tuile pour l'y placer. Toutes les cases ont la même taille : plus une tuile est présente, plus elle tombe souvent.</p>
        <p class="small">Case ${slot + 1} : <b>${cur.icon} ${esc(cur.name)}</b> <span class="muted">— ${esc(cur.text)}</span></p>
        <div class="items tiles-pick">
          ${ids.map((id) => {
            const left = owned[id] === Infinity ? '∞' : owned[id] - (used[id] || 0);
            const can = !locked && (left === '∞' || left > 0) && wheel[slot] !== id;
            return tileChip(id, `<span class="chip">${left === '∞' ? '∞' : `${left}/${owned[id]}`}</span>`, `data-action="tile" data-id="${id}" ${can ? '' : 'disabled'}`, wheel[slot] === id);
          }).join('')}
        </div>
        <button class="ghost small" data-action="resetWheel" ${locked}>↺ Remettre la roue de départ</button>
      </div>
    </div>
    <div class="action-bar sticky">
      <button data-action="prevStep" ${locked}>◀ Classe</button>
      <button class="primary grow" data-action="nextStep">Suivant : équipement ▶</button>
      <button class="ghost" data-action="leave">Quitter</button>
    </div>`;
}

function spinsBlock(g, players, r, myUid, animating = false) {
  const spins = Object.values(r.spins || {}).map((x) => ({ uid: x.uid, picks: Object.values(x.picks || {}), ults: Object.values(x.ults || {}) }));
  const n = spins.length;
  const size = n <= 1 ? 210 : n === 2 ? 160 : 118;
  // la roue du joueur en premier
  spins.sort((a, b) => (b.uid === myUid) - (a.uid === myUid));
  return `<div class="spins n${Math.min(n, 4)}">${spins.map((sp) => {
    const wheel = sanitizeWheel(g.party?.[sp.uid]?.wheel || [], null, players[sp.uid]?.classId);
    const chips = (w, picks) => picks.map((i) => {
      const t = TILES[w[i]];
      return `<span class="got" data-got style="--tc:${tileColor(w[i])}">${t.icon} ${esc(t.name)}</span>`;
    }).join('');
    const main = `<div class="spin">${wheelSvg(wheel, { size, uid: sp.uid, label: esc(players[sp.uid]?.name || '') })}<div class="gots">${chips(wheel, sp.picks)}</div></div>`;
    // roue d'ulti : apparaît quand la roue principale tombe sur la tuile d'ulti
    const ults = sp.ults.map((u, k) => {
      const def = ULT_WHEELS[u.wheel];
      if (!def) return '';
      const picks = Object.values(u.picks || {});
      return `<div class="spin ult-spin ${animating ? 'hidden' : ''}">${wheelSvg(def.wheel, { size: Math.max(size, 150), uid: `${sp.uid}:u${k}`, label: `${def.icon} ${esc(def.name)} · ${picks.length} lancers` })}<div class="gots">${chips(def.wheel, picks)}</div></div>`;
    }).join('');
    return main + ults;
  }).join('')}</div>`;
}
