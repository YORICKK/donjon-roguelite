// Écran de partie : carte, salle, votes, résultat, montée de niveau, fin de run, escalier du mode infini.
import { CLASSES, STAT_LABELS } from '../data/classes.js';
import { ITEMS } from '../data/items.js';
import { TILES, ULT_WHEELS, sanitizeWheel, tileColor } from '../data/wheel.js';
import { wheelSvg } from './wheel.js';
import { LEVELS, getLevel } from '../data/levels.js';
import { ENEMIES, ROOM_TYPE_LABELS, INTENTS } from '../data/events.js';
import { NODE_TYPES, CONSUMABLES, BOONS, XP_LEVELS, STATUS, ELITE } from '../data/run.js';
import { getChoices, getEvent, votersFor, previewChoice, keptLoot, nextNodes, shownType, floorRecap, copyTarget } from '../core/engine.js';
import { esc, fmtMod } from './dom.js';
import { ROOM_ICONS, portraitUrl, pfilter, portrait, hpClass, itemChip, heroGainLine } from './common.js';

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

/** Mode infini : petit bilan de l'étage terminé, affiché devant l'escalier. */
function stairsRecap(g, level) {
  const r = floorRecap(g);
  const next = getLevel(g.levelId + 1);
  const stat = (ico, val, lbl) => `<div class="recap-stat"><span class="ico">${ico}</span><b>${val}</b><span class="muted small">${lbl}</span></div>`;
  return `<div class="floor-recap">
    <h3>Étage ${level.depth} terminé ✔</h3>
    <div class="recap-grid">
      ${stat('⚔️', r.kills, 'ennemis vaincus')}
      ${stat('💰', (r.gold >= 0 ? '+' : '') + r.gold, 'or')}
      ${stat('⭐', '+' + r.xp, 'XP')}
      ${stat('❤️', `${r.hp}/${r.maxHp}`, `PV du groupe${r.alive < r.total ? ` · ${r.total - r.alive} à terre` : ''}`)}
    </div>
    ${r.found.length ? `<p class="small">Trouvé à cet étage :</p><div class="items">${r.found.map((id) => itemChip(id)).join('')}</div>` : '<p class="muted small">Aucun objet trouvé à cet étage.</p>'}
    <p class="small">🔒 Butin assuré : <b>${r.banked.length} objet${r.banked.length > 1 ? 's' : ''}</b> · En dessous : ${esc(next.biome)}, ennemis ×${next.enemyScale}, DD +${next.dcBonus}.</p>
  </div>`;
}

/** Sbires encore debout à côté de la cible : nom, PV, intention. */
function packLine(g) {
  const pack = Object.values(g.pack || {}).filter((m) => m.hp > 0);
  if (!pack.length) return '';
  return `<div class="pack-line"><span class="muted small">Avec lui :</span>${pack.map((m) => {
    const e = ENEMIES[m.id];
    const it = INTENTS[m.intent] || INTENTS.attack;
    return `<span class="pack-chip" title="${esc(it.label)}"><b>${esc(e.name)}</b> <span class="hp mini"><span style="width:${(100 * m.hp) / m.maxHp}%"></span></span> ${m.hp} PV · ${it.icon}</span>`;
  }).join('')}</div>`;
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
      <div class="kicker"><span class="ico">🧭</span> ${level.endless ? `Étage ${level.depth} · salle` : "Étage"} ${floorNow + 1}/${floors}</div>
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
    const stairs = room.type === 'stairs';
    const ev = stairs
      ? { title: `L'escalier vers l'étage ${level.depth + 1}`, text: 'Le gardien est tombé. Un escalier s’enfonce encore plus bas, dans une obscurité plus froide. Le butin pèse lourd dans vos sacs…' }
      : getEvent(room);
    const title = shop ? 'Le marchand ambulant' : enemy ? `${enemy.name}${g.enemy.elite ? ' <span class="chip bad">ÉLITE</span>' : ''}${g.enemy.phase === 2 ? ' <span class="chip bad">FURIEUX</span>' : ''}` : esc(ev.title);
    const text = shop ? '« Des potions, des bombes, des babioles… Tout a un prix, mais tout peut sauver une vie. »'
      : enemy ? (enemy.boss ? (g.round ? 'Le gardien vacille… ou pas.' : 'Le gardien du donjon se dresse devant vous. Aucune fuite possible.') : g.round ? 'Le combat continue !' : `Un ${enemy.name.toLowerCase()}${g.enemy.elite ? ' d’élite' : ''} vous barre la route.`)
      : ev.text;
    const icon = room.hidden ? '❓' : NODE_TYPES[room.type]?.icon || ROOM_ICONS[room.type];
    body = `
      <div class="kicker"><span class="ico">${icon}</span> ${level.endless ? `Étage ${level.depth} · salle` : "Étage"} ${floorNow}/${floors} · ${room.hidden ? 'Inconnu → ' : ''}${ROOM_TYPE_LABELS[room.type] || NODE_TYPES[room.type]?.label}</div>
      <h2>${title}</h2>
      ${stairs && g.phase === 'vote' ? stairsRecap(g, level) : ''}
      ${enemy ? `<div class="hp enemy"><div style="width:${(100 * shownHp) / g.enemy.maxHp}%"></div></div>
        <div class="enemy-line"><span>❤️ ${shownHp}/${g.enemy.maxHp}</span>${g.enemy.rage ? `<span>😡 +${g.enemy.rage}</span>` : ''}</div>
        ${g.phase === 'vote' ? intentLine(g, level) : ''}${packLine(g)}` : ''}
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
          <div class="lv">${esc(level.name)}${level.endless ? ` <span class="muted small">(${esc(level.biome)})</span>` : ''}</div>
          <div class="runstats"><span title="Or du groupe">💰 ${g.gold || 0}</span><span title="Niveau du groupe">⭐ ${g.plevel}</span>${g.cursed ? '<span title="Maudits : −1 à tous les jets">💀</span>' : ''}${g.flags?.allie ? '<span title="Un allié vous attend au boss">🤝</span>' : ''}${g.flags?.faveur ? '<span title="Faveur de la déesse">🌟</span>' : ''}${g.revealed ? '<span title="Carte révélée">🗺️</span>' : ''}${bag ? `<span class="bag" title="Sac du groupe">${bag}</span>` : ''}</div>
          <div class="xp" title="Expérience : ${g.xp || 0}${nextXp ? ` / ${nextXp}` : ''}"><div style="width:${xpPct}%"></div></div>
          <div class="loot">🎒 ${(g.loot || []).map((id) => ITEMS[id].icon).join(' ') || 'aucun butin'}</div>
        </div>
        <button class="menu-btn auto-btn ${app.auto ? 'on' : ''}" data-action="toggleAuto" aria-pressed="${app.auto}" title="Le jeu vote pour vous le choix le plus probable">🤖 Auto${app.auto ? ' ✓' : ''}</button>
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
  if (g.offerKind === 'copy') {
    const m = g.party?.[app.uid];
    const wheel = m ? Object.values(m.wheel || {}) : [];
    return `
    <div class="kicker"><span class="ico">🪞</span> Récompense du gardien · mode infini</div>
    <h2>Miroir des abîmes</h2>
    <p class="story">${mine.length ? 'Le gardien vaincu laisse un éclat de miroir. Choisissez une tuile de votre roue à <b>copier</b> : la copie prend une case de plus, <b>jusqu’à la fin du run</b> (votre roue enregistrée ne change pas).' : 'Vous regardez vos compagnons copier une tuile.'}</p>
    <div class="choices">
      ${mine.map((id) => {
        const t = TILES[id];
        const n = wheel.filter((x) => x === id).length;
        const out = TILES[wheel[copyTarget(m, id)]];
        return `<button class="choice ${myPick === id ? 'voted' : ''}" data-action="pick" data-id="${id}" style="--tc:${tileColor(id)}">
          <span class="lbl">${t.icon} ${esc(t.name)} <span class="muted small">(×${n} → ×${n + 1})</span></span><span></span>
          <span class="meta"><span class="chip gold">${esc(t.text)}</span>${out ? `<span class="small">remplace : ${out.icon} ${esc(out.name)}</span>` : ''}</span></button>`;
      }).join('')}
    </div>
    <div class="votebar"><span>${waiting.length ? `En attente : ${waiting.join(', ')}` : 'Tout le monde a choisi !'}</span><span data-countdown></span></div>
    <div class="timer"><div data-timerbar style="width:100%"></div></div>`;
  }
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
          .map(([u]) => `<img src="${portraitUrl(players[u]?.classId || 'guerrier')}" style="${pfilter(players[u]?.classId)}" alt="${esc(players[u]?.name || '')}" title="${esc(players[u]?.name || '')}" />`).join('');
        const pct = pv ? Math.round(pv.chance * 100) : null;
        const tone = pct === null ? '' : pct >= 60 ? 'good' : pct >= 35 ? 'mid' : 'bad';
        let meta;
        const priceChip = c.price !== undefined ? `<span class="chip ${c.disabled ? 'bad' : 'gold'}">💰 ${c.price}</span>` : '';
        if (pv) meta = `${priceChip}<span class="chip ${tone}">${pct}%</span><span>${STAT_LABELS[c.stat]} ${fmtMod(pv.mod)} · DD ${pv.dc}</span>`;
        else if (c.disabled && c.desc) meta = `${priceChip}<span>${esc(c.desc)}</span>`;
        else if (c.price !== undefined) meta = `${priceChip}<span>${esc(c.desc || '')}</span>`;
        else if (c.skill) meta = `<span class="chip gold">Compétence</span><span>${esc(c.desc || '')}</span>`;
        else if (c.item) meta = `<span class="chip gold">Objet</span><span>${esc(c.desc || '')}</span>`;
        else if (c.path || c.stairs) meta = `<span>${esc(c.desc || '')}</span>`;
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
  const lvl = getLevel(g.levelId);
  if (lvl.endless) {
    return `
    <h2 class="over-title">${win ? '🏃 Retour à la surface !' : '☠️ Le groupe a péri'}</h2>
    <p class="result-ok">♾️ Étage ${lvl.depth} atteint${app.profile.bestDepth ? ` · record : étage ${app.profile.bestDepth}` : ''}</p>
    <div class="over-portraits">${Object.keys(g.party || {}).map((u) => portrait(players[u]?.classId)).join('')}</div>
    ${r ? `<ul class="lines">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <p class="muted">${win ? 'Chacun rapporte tout le butin.' : 'Le butin des étages terminés est sauvé, plus l’objet le plus précieux de l’étage en cours.'}</p>
    <h3>Objets conservés ${inParty ? '' : '(spectateur)'}</h3>
    <div class="items">${kept.length ? kept.map((id) => itemChip(id)).join('') : '<span class="muted">Aucun.</span>'}</div>
    ${app.heroGain && inParty && app.heroGain.runKey === `${app.code}|${L.seed}` ? heroGainLine(app.heroGain) : ''}
    <div class="action-bar">
      ${isHost ? '<button class="primary grow" data-action="relobby">Nouveau run</button>' : ''}
      <button data-action="leave">Menu</button>
    </div>`;
  }
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

function spinsBlock(g, players, r, myUid, animating = false) {
  const spins = Object.values(r.spins || {}).map((x) => ({ uid: x.uid, picks: Object.values(x.picks || {}), ults: Object.values(x.ults || {}) }));
  const n = spins.length;
  const size = n <= 1 ? 270 : n === 2 ? 200 : 150;
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
