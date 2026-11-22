// Gabarits HTML des écrans. Fonctions pures : (app, état) -> chaîne HTML.
import { CLASSES, STAT_LABELS } from '../data/classes.js';
import { ITEMS, RARITY, MAX_EQUIPPED, describeBonus } from '../data/items.js';
import { LEVELS, getLevel } from '../data/levels.js';
import { ENEMIES, ROOM_TYPE_LABELS, INTENTS } from '../data/events.js';
import { NODE_TYPES, CONSUMABLES, BOONS, XP_LEVELS, STATUS, ELITE } from '../data/run.js';
import { computeCharacter, getChoices, getEvent, votersFor, previewChoice, keptLoot, nextNodes } from '../core/engine.js';
import { online } from '../net/index.js';
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
  return `<button class="item ${selected ? 'selected' : ''}" style="--rc:${r.color}" ${attrs} title="${esc(r.label)}">
    <span class="ico">${it.icon}</span><span>${esc(it.name)}<br><span class="muted small">${esc(describeBonus(it.bonus))}</span></span>${extra}</button>`;
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
    <div><span class="badge ${online ? 'online' : ''}">● ${online ? 'En ligne' : 'Mode local (Firebase non configuré)'}</span></div>
  </div></div>`;
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
    <button class="ghost small" data-action="logout">Changer de pseudo</button>
    ${online ? '' : '<p class="muted small">Mode local : le multijoueur marche entre onglets de ce navigateur.</p>'}
  </div></div>`;
}

export function renderInventory(app) {
  const entries = Object.entries(app.profile.inventory || {}).filter(([, n]) => n > 0)
    .sort((a, b) => RARITY[ITEMS[b[0]].rarity].rank - RARITY[ITEMS[a[0]].rarity].rank);
  return `
  <div class="screen"><div class="panel ornate menu wide" style="text-align:left;max-width:640px">
    <h2>🎒 Inventaire</h2>
    <p class="muted small">Conservé entre les parties. Équipez jusqu'à ${MAX_EQUIPPED} objets avant chaque run.</p>
    <div class="items">${entries.length ? entries.map(([id, n]) => itemChip(id, `<span class="chip">×${n}</span>`)).join('') : '<p class="muted">Rien pour le moment. Ouvrez des coffres !</p>'}</div>
    <div class="action-bar"><button data-action="menu">← Retour</button></div>
  </div></div>`;
}

// ---------- Salon ----------
export function renderLobby(app, L) {
  const players = L.players || {};
  const me = players[app.uid] || {};
  const isHost = L.hostUid === app.uid;
  const allReady = Object.values(players).filter((p) => p.online !== false).every((p) => (p.ready || app.solo) && p.classId);
  const owned = Object.entries(app.profile.inventory || {}).filter(([, n]) => n > 0).map(([id]) => id);
  const equipped = me.equipped || [];
  const maxLevel = isHost ? app.profile.unlockedLevel || 1 : LEVELS.length;
  const level = getLevel(L.levelId);
  const preview = me.classId ? computeCharacter(me.classId, equipped) : null;
  const canShare = typeof navigator.share === 'function';

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
                <span class="muted small">${p.classId ? CLASSES[p.classId].name : 'choisit sa classe…'}</span></span>
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
        <h3>Votre classe</h3>
        <div class="class-grid">
          ${Object.values(CLASSES).map((c) => `
            <button class="class-card ${me.classId === c.id ? 'selected' : ''}" style="--cc:${c.color}" data-action="class" data-id="${c.id}" ${me.ready && !app.solo ? 'disabled' : ''}>
              ${portrait(c.id, 'lg')}
              <span>
                <span class="name">${c.name}</span><br>
                <span class="desc">${c.desc}</span>
                <span class="statline">${statLine(c.stats)}<span class="stat">❤️ ${c.hp}</span><span class="stat">🗡 d${c.dmg}</span></span>
              </span>
              <span class="skill">★ <b>${c.skill.name}</b> — ${c.skill.desc}</span>
            </button>`).join('')}
        </div>
        <h3 style="margin-top:14px">Équipement <span class="chip">${equipped.length}/${MAX_EQUIPPED}</span></h3>
        <div class="items">
          ${owned.length ? owned.map((id) => itemChip(id, '', `data-action="equip" data-id="${id}" ${me.ready && !app.solo ? 'disabled' : ''}`, equipped.includes(id))).join('') : '<p class="muted small">Aucun objet. Survivez pour en rapporter !</p>'}
        </div>
        ${preview ? `<div class="statline" style="margin-top:10px"><span class="muted small">Votre héros :</span> ${statLine(preview.stats)}<span class="stat hi">❤️ ${preview.maxHp}</span><span class="stat">🗡 d${preview.dmg}</span></div>` : ''}
        <div class="action-bar sticky">
          ${app.solo ? '' : `<button class="${me.ready ? '' : 'primary'}" data-action="ready" ${me.classId ? '' : 'disabled'}>${me.ready ? 'Modifier' : 'Prêt !'}</button>`}
          ${isHost ? `<button class="primary" data-action="start" ${allReady ? '' : 'disabled'}>Lancer le run ▶</button>` : '<span class="muted small hint grow">L’hôte lance la partie quand tout le monde est prêt.</span>'}
          <button class="ghost" data-action="leave">Quitter</button>
        </div>
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
    return `<span class="map-node ${cls}" title="${esc(NODE_TYPES[n.type].label)}">${NODE_TYPES[n.type].icon}</span>`;
  }).join('')}</div>`).join('<span class="map-link">›</span>')}</div>`;
}

export function renderGame(app, L) {
  const g = L.game;
  const players = L.players || {};
  const party = g.party || {};
  const level = getLevel(g.levelId);
  const isHost = L.hostUid === app.uid;
  const votes = g.votes || {};
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
        <div class="nm">${esc(p.name)}${m.skillUsed ? '' : ' <span title="Compétence disponible">★</span>'}</div>
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
      ${enemy ? `<div class="hp enemy"><div style="width:${(100 * g.enemy.hp) / g.enemy.maxHp}%"></div></div>
        <div class="enemy-line"><span>❤️ ${g.enemy.hp}/${g.enemy.maxHp}</span>${g.enemy.rage ? `<span>😡 +${g.enemy.rage}</span>` : ''}</div>
        ${g.phase === 'vote' ? intentLine(g, level) : ''}` : ''}
      ${shop ? `<p class="gold-line">💰 ${g.gold} pièces d'or</p>` : ''}
      ${g.phase === 'vote' ? `<p class="story">${esc(text)}</p>${renderVote(app, L)}` : renderResult(app, L, isHost)}`;
  }

  return `
  <div class="hud">
    <div class="topbar">
      <div class="party">${partyHtml}</div>
      <div class="status">
        <div class="panel levelbox">
          <div class="lv">${esc(level.name)}</div>
          <div class="runstats"><span title="Or du groupe">💰 ${g.gold || 0}</span><span title="Niveau du groupe">⭐ ${g.plevel}</span>${bag ? `<span class="bag" title="Sac du groupe">${bag}</span>` : ''}</div>
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
        if (pv) meta = `<span class="chip ${tone}">${pct}%</span><span>${STAT_LABELS[c.stat]} ${fmtMod(pv.mod)} (${esc(players[pv.uid]?.name || '')}) vs DD ${pv.dc}</span>`;
        else if (c.price !== undefined) meta = `<span class="chip ${c.disabled ? 'bad' : 'gold'}">💰 ${c.price}</span><span>${esc(c.desc || '')}</span>`;
        else if (c.skill) meta = `<span class="chip gold">Compétence</span><span>${esc(c.desc || '')}</span>`;
        else if (c.item) meta = `<span class="chip gold">Objet</span><span>${esc(c.desc || '')}</span>`;
        else if (c.path) meta = `<span>${esc(c.desc || '')}</span>`;
        else meta = '<span class="chip">Sans risque</span>';
        return `<button class="choice ${myVote === c.id ? 'voted' : ''} ${c.skill || c.item ? 'skill' : ''}" data-action="vote" data-id="${esc(c.id)}" ${canVote && !c.disabled ? '' : 'disabled'}>
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
    <ul class="lines" data-lines>${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="action-bar">
      ${isHost ? '<button class="primary grow" data-action="continue">Continuer ▶</button>' : '<span class="muted small">En attente de l’hôte…</span>'}
    </div>`;
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
    ${win && g.levelId < LEVELS.length ? `<p class="result-ok">🔓 Niveau ${g.levelId + 1} débloqué : ${esc(getLevel(g.levelId + 1).name)} !</p>` : ''}
    <div class="action-bar">
      ${isHost ? '<button class="primary grow" data-action="relobby">Nouveau run</button>' : ''}
      <button data-action="leave">Menu</button>
    </div>`;
}
