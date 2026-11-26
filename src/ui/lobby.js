// Salon : choix de la classe, éditeur de roue, équipement et compagnon.
import { CLASSES } from '../data/classes.js';
import { ITEMS, RARITY, MAX_EQUIPPED, isGear } from '../data/items.js';
import { TILES, WHEEL_SIZE, TILE_GROUPS, ownedTiles, tileColor, tileGroup, tileValue } from '../data/wheel.js';
import { wheelSvg } from './wheel.js';
import { LEVELS, getLevel, isEndless, ENDLESS_START } from '../data/levels.js';
import { computeCharacter } from '../core/engine.js';
import { online } from '../net/index.js';
import { esc } from './dom.js';
import { portrait, statLine, itemChip, heroBar, currentWheel } from './common.js';

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
            <option value="${ENDLESS_START}" ${isEndless(L.levelId) ? 'selected' : ''}>♾️ Mode infini</option>
            ${LEVELS.map((l) => `<option value="${l.id}" ${l.id === L.levelId ? 'selected' : ''} ${l.id > maxLevel ? 'disabled' : ''}>
              ${l.id > maxLevel ? '🔒' : '🏰'} ${l.id}. ${esc(l.name)}</option>`).join('')}
          </select>` : `<p><b>${level.endless ? '♾️ Mode infini' : `${level.id}. ${esc(level.name)}`}</b></p>`}
          <p class="muted small">${level.endless
            ? `Étages de ${level.rooms} salles + boss, de plus en plus durs. Après chaque boss : descendre, ou remonter avec tout le butin. Le butin des étages finis est assuré.${app.profile.bestDepth ? ` Record : étage ${app.profile.bestDepth}.` : ''}`
            : `${level.rooms} salles + boss · DD +${level.dcBonus} · ennemis ×${level.enemyScale}`}</p>
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

function wheelEditor(app, me) {
  const wheel = currentWheel(app, me.classId);
  const slot = Math.min(WHEEL_SIZE - 1, Math.max(0, app.wheelSlot || 0));
  const owned = ownedTiles(app.profile.inventory || {}, me.classId);
  const used = wheel.reduce((m, id) => ({ ...m, [id]: (m[id] || 0) + 1 }), {});
  const stats = CLASSES[me.classId].stats;
  const filter = TILE_GROUPS[app.tileFilter] ? app.tileFilter : 'all';
  // seulement les tuiles encore disponibles, les plus fortes d'abord (« Raté » à la fin : vider une case)
  const left = (id) => (owned[id] === Infinity ? Infinity : owned[id] - (used[id] || 0));
  const ids = Object.keys(owned)
    .filter((id) => TILES[id] && id !== 't_rate' && left(id) > 0 && (filter === 'all' || tileGroup(id) === filter))
    .sort((x, y) => tileValue(y, stats) - tileValue(x, stats));
  const locked = me.ready && !app.solo ? 'disabled' : '';
  const cur = TILES[wheel[slot]];
  const chip = (id) => {
    const t = TILES[id];
    const n = left(id);
    return `<button class="tile-pick" style="--tc:${tileColor(id)};--rc:${RARITY[t.rarity]?.color || '#888'}" data-action="tile" data-id="${id}" title="${esc(t.text)}" ${locked}>
      <span class="ico">${t.icon}</span><span class="nm">${esc(t.name)}</span><span class="tx">${esc(t.text)}</span>${n !== Infinity ? `<span class="n">×${n}</span>` : ''}</button>`;
  };
  return `
    <div class="wheel-editor">
      <div class="wheel-stage">${wheelSvg(wheel, { size: 340, selected: slot, editable: !locked, uid: 'editor' })}</div>
      <div class="wheel-side">
        <h3>Votre roue <span class="chip">${CLASSES[me.classId].name}</span></h3>
        <p class="muted small">${WHEEL_SIZE} cases, 2 lancers par attaque. <b>1.</b> Touchez une case de la roue. <b>2.</b> Touchez une tuile : elle prend sa place.</p>
        <div class="slot-now" style="--tc:${tileColor(wheel[slot])}"><span class="ico">${cur.icon}</span><span><b>Case ${slot + 1} : ${esc(cur.name)}</b><br><span class="muted small">${esc(cur.text)}</span></span></div>
        <div class="seg-tabs">
          ${[['all', 'Tout'], ...Object.entries(TILE_GROUPS)].map(([k, l]) => `<button class="${filter === k ? 'on' : ''}" data-action="tileFilter" data-id="${k}">${l}</button>`).join('')}
        </div>
        <div class="tiles-pick">
          ${ids.map(chip).join('') || '<p class="muted small">Aucune tuile disponible ici : gagnez-en pendant les runs !</p>'}
          ${wheel[slot] !== 't_rate' ? chip('t_rate') : ''}
        </div>
        <div class="row-btns">
          <button class="small" data-action="autoWheel" ${locked}>✨ Roue optimale</button>
          <button class="ghost small" data-action="resetWheel" ${locked}>↺ Roue de départ</button>
        </div>
      </div>
    </div>
    <div class="action-bar sticky">
      <button data-action="prevStep" ${locked}>◀ Classe</button>
      <button class="primary grow" data-action="nextStep">Suivant : équipement ▶</button>
      <button class="ghost" data-action="leave">Quitter</button>
    </div>`;
}
