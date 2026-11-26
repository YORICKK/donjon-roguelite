// Écrans hors partie : pseudo, menu principal, classement du mode infini, inventaire.
import { CLASSES } from '../data/classes.js';
import { ITEMS, RARITY, MAX_EQUIPPED, isGear } from '../data/items.js';
import { online } from '../net/index.js';
import { esc } from './dom.js';
import { portrait, itemChip, tileChip, accountBlock, strip, heroBar } from './common.js';

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

// ---------- Menu ----------
export function renderMenu(app) {
  const inv = Object.values(app.profile.inventory || {}).reduce((a, b) => a + b, 0);
  return `
  <div class="screen"><div class="panel ornate menu">
    ${strip()}
    <h1>Donjon<br>Roguelite</h1>
    <p>Bienvenue, <b>${esc(app.name)}</b><br><span class="muted small">${app.profile.runs || 0} runs · ${app.profile.wins || 0} victoires · niveau ${app.profile.unlockedLevel || 1} débloqué</span></p>
    <button class="primary endless-btn" data-action="endless">♾️ Mode infini<br><span class="small">Des étages sans fin${app.profile.bestDepth ? ` · record : étage ${app.profile.bestDepth}` : ''}</span></button>
    <button data-action="solo">⚔️ Campagne solo</button>
    <button data-action="create">👥 Créer un salon</button>
    <form data-form="join" class="row">
      <input name="code" maxlength="5" placeholder="CODE" autocapitalize="characters" autocomplete="off" enterkeyhint="go" style="text-transform:uppercase;letter-spacing:0.2em;text-align:center" required />
      <button>Rejoindre</button>
    </form>
    <button data-action="inventory">🎒 Inventaire (${inv})</button>
    <button data-action="leaderboard">🏆 Classement du mode infini</button>
    ${accountBlock(app, 'menu')}
    <button class="ghost small" data-action="logout">Changer de pseudo</button>
    ${online ? '' : '<p class="muted small">Mode local : le multijoueur marche entre onglets de ce navigateur.</p>'}
  </div></div>`;
}

export function renderLeaderboard(app) {
  const rows = app.board;
  const mine = (app.profile.bestDepth || 0);
  return `
  <div class="screen"><div class="panel ornate">
    <h2>🏆 Classement — mode infini</h2>
    <p class="muted small">L'étage le plus profond atteint par chaque joueur.${mine ? ` Votre record : <b>étage ${mine}</b>.` : ' Jouez au mode infini pour y figurer !'}</p>
    ${!rows ? '<p class="muted">Chargement…</p>' : !rows.length ? `<p class="muted">${app.boardError ? 'Classement indisponible pour le moment.' : 'Personne pour l’instant : soyez le premier !'}</p>` : `
    <ol class="board">${rows.map((r, i) => `
      <li class="${r.uid === app.uid ? 'me' : ''}">
        <span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
        ${r.classId ? portrait(r.classId) : ''}
        <span class="grow"><b>${esc(r.name || '?')}</b>${r.uid === app.uid ? ' <span class="muted">(vous)</span>' : ''}<br>
          <span class="muted small">${r.classId && CLASSES[r.classId] ? esc(CLASSES[r.classId].name) : ''}${r.party > 1 ? ` · à ${r.party}` : ' · solo'}</span></span>
        <span class="depth">étage <b>${r.depth}</b></span>
      </li>`).join('')}</ol>`}
    <div class="action-bar"><button data-action="menu">← Retour</button></div>
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
