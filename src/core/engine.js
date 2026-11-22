// Règles du jeu : fonctions pures, sans DOM ni réseau.
// L'hôte du salon est le seul à appeler resolveChoice()/advance()/finishLevelUp() ; il écrit le
// résultat dans l'état partagé et les autres clients se contentent de l'afficher.
//
// Déroulé d'un run :
//   path (vote d'une porte) -> vote (choix dans la salle) -> result -> [levelup] -> path … -> boss -> over
import { Rng } from './rng.js';
import { CLASSES } from '../data/classes.js';
import { ITEMS, RARITY, SHINY_CHANCE } from '../data/items.js';
import { getLevel, MAP_EXTRA_WEIGHTS } from '../data/levels.js';
import { ENEMIES, EVENTS, COMBAT_ACTIONS } from '../data/events.js';
import { heroBonus } from '../data/heroes.js';
import { NODE_TYPES, ELITE, CONSUMABLES, ITEM_PRICES, XP_LEVELS, BOONS } from '../data/run.js';

export const VOTE_SECONDS = 30;
export const PICK_SECONDS = 25;

// ---------- Personnages ----------
/** Stats d'un personnage : classe + niveau de héros permanent + objets équipés + bonus de niveau (boons) du run. */
export function computeCharacter(classId, equipped = [], boons = [], companion = null, heroLv = 1) {
  const cls = CLASSES[classId];
  const stats = { ...cls.stats };
  let hp = cls.hp;
  let dmg = cls.dmg;
  let luck = 0;
  const hb = heroBonus(classId, heroLv);
  for (const [k, v] of Object.entries(hb.stats)) stats[k] += v;
  hp += hb.hp;
  dmg += hb.dmg;
  luck += hb.luck;
  for (const itemId of [...equipped, ...(companion ? [companion] : [])]) {
    const b = ITEMS[itemId]?.bonus || {};
    for (const k of Object.keys(stats)) stats[k] += b[k] || 0;
    hp += b.hp || 0;
    dmg += b.dmg || 0;
  }
  for (const id of boons) {
    const b = BOONS[id]?.bonus || {};
    for (const k of Object.keys(stats)) stats[k] += b[k] || 0;
    dmg += b.dmg || 0;
    luck += b.luck || 0;
  }
  return { stats, maxHp: hp, dmg, luck };
}

const charOf = (game, players, uid) => {
  const p = players[uid];
  return computeCharacter(p.classId, p.equipped || [], Object.values(game.party[uid]?.boons || {}), game.party[uid]?.pet || null, p.heroLevel || 1);
};

// ---------- Salles ----------
function makeRoom(rng, type, level, used = null) {
  const room = {
    type,
    shape: { w: rng.int(8, 13), d: rng.int(8, 12), pillars: rng.int(0, 2) * 2, torches: rng.int(2, 4) },
  };
  if (type === 'combat' || type === 'elite') room.enemyId = rng.pick(level.enemies);
  else if (type === 'boss') room.enemyId = level.boss;
  else if (EVENTS[type]) {
    const pool = EVENTS[type].filter((e) => !e.hidden && (!e.themes || e.themes.includes(level.theme)));
    // Pas deux fois le même événement dans un run (tant qu'il en reste d'inédits)
    const fresh = used ? pool.filter((e) => !used.has(e.id)) : pool;
    room.eventId = rng.pick(fresh.length ? fresh : pool.length ? pool : EVENTS[type].filter((e) => !e.hidden)).id;
    used?.add(room.eventId);
  }
  return room;
}

export const isFight = (room) => !!room?.enemyId;

export function getEvent(room) {
  return EVENTS[room?.type]?.find((e) => e.id === room.eventId) || null;
}

/** Donjon linéaire (décor de l'écran d'accueil). */
export function generateDungeon(seed, levelId) {
  const level = getLevel(levelId);
  const rng = new Rng(`${seed}|dungeon|${level.id}`);
  const rooms = [];
  for (let i = 0; i < level.rooms; i++) rooms.push(makeRoom(rng, rng.weighted(level.weights), level));
  rooms.push(makeRoom(rng, 'boss', level));
  return rooms;
}

/**
 * Carte du niveau : `level.rooms` étages de 2-3 portes, puis le boss.
 * Chaque nœud : { id, floor, type (affiché), room (salle réelle), next: [ids] }.
 * Un nœud « inconnu » cache une salle tirée au hasard.
 */
export function generateMap(seed, levelId) {
  const level = getLevel(levelId);
  const rng = new Rng(`${seed}|map|${level.id}`);
  const floors = [];
  const used = new Set();
  for (let f = 0; f < level.rooms; f++) {
    const count = f === 0 ? 2 : rng.int(2, 3);
    const weights = { ...level.weights, ...(f > 0 ? MAP_EXTRA_WEIGHTS : {}) };
    if (f === 0) delete weights.rest;
    const nodes = [];
    for (let i = 0; i < count; i++) {
      let type = rng.weighted(weights);
      // pas deux portes identiques au même étage (sauf combat)
      for (let k = 0; k < 4 && type !== 'combat' && nodes.some((n) => n.type === type); k++) type = rng.weighted(weights);
      const real = type === 'unknown' ? rng.pick(['trap', 'chest', 'shrine', 'npc', 'combat']) : type;
      nodes.push({ id: `${f}-${i}`, floor: f, type, room: makeRoom(rng, real, level, used), next: [] });
    }
    floors.push(nodes);
  }
  floors.push([{ id: `${level.rooms}-0`, floor: level.rooms, type: 'boss', room: makeRoom(rng, 'boss', level), next: [] }]);
  // Liaisons : chaque porte mène à 1 ou 2 portes de l'étage suivant ; toutes sont atteignables.
  for (let f = 0; f < floors.length - 1; f++) {
    const cur = floors[f];
    const nxt = floors[f + 1];
    cur.forEach((n, i) => {
      const j = Math.min(nxt.length - 1, Math.round((i / Math.max(1, cur.length - 1)) * (nxt.length - 1)));
      n.next = [nxt[j].id];
      const k = j + (rng.chance(0.5) ? 1 : -1);
      if (nxt[k] && rng.chance(0.6)) n.next.push(nxt[k].id);
    });
    nxt.forEach((m) => {
      if (!cur.some((n) => n.next.includes(m.id))) rng.pick(cur).next.push(m.id);
    });
  }
  return { floors };
}

export function findNode(game, id) {
  for (const f of game.map.floors) for (const n of Object.values(f)) if (n.id === id) return n;
  return null;
}

/** Type affiché d'une porte (une porte inconnue est révélée par une carte ou une vision). */
export function shownType(game, node) {
  return node.type === 'unknown' && game.revealed ? node.room.type : node.type;
}

export function nextNodes(game) {
  if (!game.nodeId) return Object.values(game.map.floors[0]);
  return Object.values(findNode(game, game.nodeId)?.next || {}).map((id) => findNode(game, id));
}

// ---------- Démarrage d'un run ----------
export function createGame(seed, levelId, players) {
  const party = {};
  for (const [uid, p] of Object.entries(players)) {
    if (!p.classId) continue;
    const pet = ITEMS[p.companion]?.companion ? p.companion : null;
    const c = computeCharacter(p.classId, p.equipped || [], [], pet, p.heroLevel || 1);
    party[uid] = { hp: c.maxHp, maxHp: c.maxHp, alive: true, skillUsed: false, poison: 0, boons: [], pet };
  }
  const rng = new Rng(`${seed}|entrance`);
  return {
    levelId, party, map: generateMap(seed, levelId), nodeId: null,
    rooms: [{ type: 'entrance', shape: { w: 10, d: 9, pillars: 2, torches: 2 } }], roomIndex: 0,
    enemy: null, round: 0, phase: 'path', votes: {}, deadline: Date.now() + VOTE_SECONDS * 1000,
    gold: 0, xp: 0, plevel: 1, blessed: 0, cursed: false, flags: {}, revealed: false, intro: [], bag: { potion_soin: 1 }, shop: null,
    offers: {}, picks: {}, loot: [], outcome: null, lastResult: null, seedTag: rng.int(0, 9999),
  };
}

function enemyStats(game) {
  const e = ENEMIES[game.enemy.id];
  const level = getLevel(game.levelId);
  const elite = game.enemy.elite;
  return {
    e,
    dc: e.dc + level.dcBonus + (elite ? ELITE.dc : 0) + (game.enemy.intent === 'defend' ? 4 : 0),
    dmgMax: e.dmg * level.enemyScale * (elite ? ELITE.dmg : 1),
  };
}

function rollIntent(game, rng) {
  const e = ENEMIES[game.enemy.id];
  const w = { ...(e.intents || { attack: 1 }) };
  if (game.enemy.phase === 2) { w.heavy = (w.heavy || 0) + 2; w.attack = (w.attack || 0) + 1; delete w.defend; }
  // pas deux protections de suite
  if (game.enemy.intent === 'defend') delete w.defend;
  game.enemy.intent = rng.weighted(w);
}

function enterRoom(game, seed) {
  const room = game.rooms[game.roomIndex];
  const level = getLevel(game.levelId);
  const rng = new Rng(`${seed}|enter|${game.roomIndex}`);
  game.enemy = null;
  game.shop = null;
  game.intro = [];
  game.introPets = [];
  if (room.enemyId) {
    const e = ENEMIES[room.enemyId];
    const n = Object.keys(game.party).length;
    const elite = room.type === 'elite';
    const hp = Math.round(e.hp * level.enemyScale * (1 + 0.5 * (n - 1)) * (elite ? ELITE.hp : 1));
    game.enemy = { id: room.enemyId, hp, maxHp: hp, elite, rage: 0, phase: 1, intent: 'attack' };
    rollIntent(game, rng);
    for (const uid of petOwners(game, 'breath')) {
      const dmg = Math.min(game.enemy.hp - 1, rng.dice(2, 6) + 2 * level.id);
      if (dmg <= 0) continue;
      game.enemy.hp -= dmg;
      game.intro.push(`🐉 Le dragonnet crache des flammes sur ${e.name} : −${dmg} PV !`);
      (game.introPets ||= []).push({ uid, kind: 'breath' });
    }
    if (room.type === 'boss') {
      const flags = game.flags || {};
      if (flags.allie) {
        game.enemy.hp = Math.round(hp * 0.8);
        game.intro.push(`⚔️ Votre allié libéré surgit et frappe ${e.name} par surprise (−${hp - game.enemy.hp} PV) !`);
      }
      if (flags.faveur) {
        for (const m of Object.values(game.party)) if (m.alive) m.hp = Math.min(m.maxHp, m.hp + 6);
        game.intro.push('🌟 La déesse tient sa promesse : le groupe est soigné (+6 PV).');
      }
    }
  }
  if (room.type === 'shop') {
    const ids = Object.keys(CONSUMABLES);
    const offers = [];
    while (offers.length < 3) {
      const id = rng.pick(ids);
      if (!offers.some((o) => o.id === id)) offers.push({ kind: 'consumable', id, price: CONSUMABLES[id].price });
    }
    const pet = rng.chance(0.25);
    const item = pet ? rollCompanion(rng, game.levelId) : rollLoot(rng, game.levelId, rng.chance(0.3) ? 1 : 0);
    offers.push({ kind: 'item', id: item, price: Math.round(ITEM_PRICES[ITEMS[item].rarity] * (pet ? 1.3 : 1)) });
    game.shop = offers;
  }
}

// ---------- Choix proposés ----------
function consumableChoices(game, room) {
  const out = [];
  const fight = isFight(room);
  const boss = fight && ENEMIES[game.enemy.id].boss;
  const hurtOrSick = Object.values(game.party).some((m) => m.alive && (m.hp < m.maxHp || m.poison > 0));
  for (const [id, n] of Object.entries(game.bag || {})) {
    if (!n) continue;
    const c = CONSUMABLES[id];
    if (c.combatOnly && !fight) continue;
    if (c.noBoss && boss) continue;
    if (id === 'potion_soin' && !hurtOrSick) continue;
    if (id === 'eau_benite' && game.blessed > 0) continue;
    out.push({ id: `use:${id}`, label: `${c.icon} ${c.name} (×${n})`, item: true, desc: c.desc });
  }
  return out;
}

export function getChoices(game, players) {
  if (game.phase === 'path') {
    return nextNodes(game).map((n, i, arr) => {
      const t = NODE_TYPES[shownType(game, n)];
      const side = arr.length === 1 ? 'Porte' : ['Porte de gauche', 'Porte du milieu', 'Porte de droite'][arr.length === 2 ? i * 2 : i];
      return { id: `go:${n.id}`, label: `${t.icon} ${t.label}`, path: true, desc: side + (t.desc ? ` — ${t.desc}` : '') };
    });
  }
  const room = game.rooms[game.roomIndex];
  const choices = [];
  let fleeChoice = null;
  if (room.type === 'shop') {
    (game.shop || []).forEach((o, i) => {
      if (o.sold) return;
      const def = o.kind === 'item' ? ITEMS[o.id] : CONSUMABLES[o.id];
      const sub = o.kind === 'item' ? (def.companion ? `compagnon ${RARITY[def.rarity].label.toLowerCase()} : ${def.desc}` : `objet ${RARITY[def.rarity].label.toLowerCase()}, conservé après le run`) : def.desc;
      choices.push({ id: `buy:${i}`, label: `${def.icon} ${def.name}`, price: o.price, desc: sub, disabled: game.gold < o.price });
    });
    choices.push({ id: 'leave', label: '🚪 Reprendre la route', safe: true });
    return choices;
  }
  if (isFight(room)) {
    const enemy = ENEMIES[game.enemy.id];
    for (const a of COMBAT_ACTIONS) {
      if (a.undeadOnly && !enemy.undead) continue;
      if (a.notUndead && enemy.undead) continue; // contre les morts-vivants, « Repousser » remplace l'attaque sournoise
      if (a.noBoss && enemy.boss) continue;
      const stat = actionStat(game, players, a);
      const label = a.stats ? (stat === 'int' ? 'Lancer un sort' : "Attaquer à l'arme") : a.label;
      // Fuir n'est utile qu'en mauvaise posture : rangé avec les compétences et objets, selon l'état du groupe
      if (a.flee) fleeChoice = { id: a.id, label, stat, desc: a.desc };
      else choices.push({ id: a.id, label, stat, desc: a.desc });
    }
  } else {
    for (const c of getEvent(room).choices) {
      const v = eventChoiceState(game, players, c);
      if (v.hidden) continue;
      choices.push({ id: c.id, label: c.label, stat: c.safe ? null : c.stat, price: c.cost?.gold, disabled: v.disabled, desc: v.reason, classOnly: c.class });
    }
  }
  const skillRoom = isFight(room) ? 'combat' : room.type;
  const extras = [];
  if (fleeChoice) extras.push({ ...fleeChoice, score: partyHealth(game).ratio < 0.35 ? 80 : 20 });
  for (const [uid, m] of Object.entries(game.party)) {
    if (!m.alive || m.skillUsed) continue;
    const cls = CLASSES[players[uid]?.classId];
    if (!cls || !cls.skill.on.includes(skillRoom)) continue;
    extras.push({ id: `skill:${uid}`, label: `${cls.icon} ${cls.skill.name} (${players[uid].name})`, skill: true, desc: cls.skill.desc, score: skillScore(game, cls.skill.id) });
  }
  for (const c of consumableChoices(game, room)) extras.push({ ...c, score: itemScore(game, c.id.slice(4)) });
  return capChoices(choices, extras);
}

// ---------- 5 choix au maximum ----------
export const MAX_CHOICES = 5;

/** Les choix de la salle d'abord, puis les compétences et objets les plus utiles dans les places restantes. */
function capChoices(base, extras) {
  const kept = base.slice(0, MAX_CHOICES);
  const room = MAX_CHOICES - kept.length;
  extras.sort((a, b) => b.score - a.score);
  return [...kept, ...extras.slice(0, room).map(({ score, ...c }) => c)];
}

function partyHealth(game) {
  const alive = Object.values(game.party).filter((m) => m.alive);
  const ratio = alive.reduce((s, m) => s + m.hp / m.maxHp, 0) / Math.max(1, alive.length);
  return { ratio, low: alive.some((m) => m.hp / m.maxHp <= 0.4), poisoned: alive.some((m) => m.poison > 0) };
}

function skillScore(game, id) {
  const h = partyHealth(game);
  if (id === 'soin_de_groupe') return h.low || h.ratio < 0.6 ? 90 : 15;
  if (id === 'mains_agiles') return 85;
  return game.enemy?.intent === 'defend' ? 40 : 70; // coup puissant / boule de feu : ignorent la défense, utiles tout le temps
}

function itemScore(game, id) {
  const h = partyHealth(game);
  if (id === 'potion_soin') return h.low || h.poisoned ? 95 : 25;
  if (id === 'parchemin_fuite') return h.ratio < 0.35 ? 88 : 5;
  if (id === 'bombe') return game.enemy ? 45 + (game.enemy.hp / game.enemy.maxHp > 0.5 ? 10 : 0) : 0;
  if (id === 'eau_benite') return 30;
  return 10;
}

/** Stat d'une action de combat ; « Attaquer » prend la meilleure entre FOR et INT. */
function actionStat(game, players, a) {
  if (!a.stats) return a.stat;
  let best = a.stats[0], bestMod = -99;
  for (const st of a.stats) {
    const c = bestChampion(game, players, st);
    if (c && c.mod > bestMod) { best = st; bestMod = c.mod; }
  }
  return best;
}

/** Un choix d'événement est-il visible / jouable ? (classe présente, conditions, coût) */
function eventChoiceState(game, players, c) {
  const party = Object.entries(game.party).filter(([, m]) => m.alive);
  if (c.class && !party.some(([u]) => players[u]?.classId === c.class)) return { hidden: true };
  const r = c.requires || {};
  if (r.cursed && !game.cursed) return { hidden: true };
  if (r.poisoned && !party.some(([, m]) => m.poison > 0)) return { hidden: true };
  if (r.item && !(game.bag?.[r.item] > 0)) return { hidden: true };
  if (r.flag && !game.flags?.[r.flag]) return { hidden: true };
  if (r.notFlag && game.flags?.[r.notFlag]) return { hidden: true };
  const gold = (c.cost?.gold || 0) + (r.gold || 0);
  if (gold && (game.gold || 0) < gold) return { disabled: true, reason: `Il faut ${gold} pièces d'or` };
  return {};
}

function choiceDc(game, choiceId) {
  const level = getLevel(game.levelId);
  const room = game.rooms[game.roomIndex];
  if (game.enemy) {
    const a = COMBAT_ACTIONS.find((x) => x.id === choiceId);
    return enemyStats(game).dc + (a?.dcMod || 0) + (a?.flee ? -2 : 0);
  }
  return getEvent(room).choices.find((c) => c.id === choiceId).dc + level.dcBonus;
}

/** Bonus total d'un champion pour une stat (stat + chance + bénédiction). */
function champMod(game, char, stat) {
  return char.stats[stat] + char.luck + (game.blessed > 0 ? 2 : 0) - (game.cursed ? 1 : 0);
}

/**
 * Aperçu d'un choix pour l'interface : qui tentera l'action, son bonus, le DD et la chance de réussite.
 * Retourne null pour les choix sans jet.
 */
export function previewChoice(game, players, choice) {
  if (!choice.stat || choice.skill || game.phase !== 'vote') return null;
  const champ = bestChampion(game, players, choice.stat, choice.classOnly);
  if (!champ) return null;
  const dc = choiceDc(game, choice.id);
  const chance = Math.min(0.95, Math.max(0.05, (21 - (dc - champ.mod)) / 20));
  return { uid: champ.uid, mod: champ.mod, dc, chance };
}

// ---------- Vote majoritaire ----------
// Égalité : le vote de l'hôte l'emporte s'il fait partie des ex æquo, sinon le premier choix de la liste.
export function tallyVotes(votes, choices, hostUid, rng) {
  const allowed = choices.filter((c) => !c.disabled);
  const counts = {};
  for (const c of Object.values(votes || {})) counts[c] = (counts[c] || 0) + 1;
  const valid = allowed.map((c) => c.id).filter((id) => counts[id]);
  if (!valid.length) {
    const pool = allowed.filter((c) => !c.skill && !c.item);
    return rng.pick(pool.length ? pool : allowed).id;
  }
  const max = Math.max(...valid.map((id) => counts[id]));
  const top = valid.filter((id) => counts[id] === max);
  if (top.length === 1) return top[0];
  const hostVote = votes?.[hostUid];
  return top.includes(hostVote) ? hostVote : top[0];
}

export function votersFor(game, players) {
  return Object.keys(game.party).filter((uid) => game.party[uid].alive && players[uid]?.online !== false);
}

// ---------- Outils de résolution ----------
function bestChampion(game, players, stat, classId = null) {
  let best = null;
  for (const [uid, m] of Object.entries(game.party)) {
    if (!m.alive || !players[uid]) continue;
    if (classId && players[uid].classId !== classId) continue;
    const c = charOf(game, players, uid);
    const mod = champMod(game, c, stat);
    if (!best || mod > best.mod) best = { uid, mod, char: c };
  }
  return best;
}

function roll(rng, mod, dc, stat) {
  const d20 = rng.die(20);
  const total = d20 + mod;
  const success = d20 === 20 || (d20 !== 1 && total >= dc);
  return { d20, mod, total, dc, stat, success, crit: d20 === 20, fumble: d20 === 1 };
}

function randomAlive(game, rng) {
  return rng.pick(Object.keys(game.party).filter((u) => game.party[u].alive));
}

function hurt(game, uid, amount, players, lines, source = 'hit') {
  const m = game.party[uid];
  if (!m.alive || amount <= 0) return;
  if (source === 'hit' && m.pet && ITEMS[m.pet]?.power === 'guard' && amount > 1) {
    amount = Math.max(1, amount - 2);
    lines.push(`🐻 L'ours de ${players[uid].name} s'interpose et encaisse une partie du coup.`);
    (game._pets ||= []).push({ uid, kind: 'guard' });
  }
  m.hp = Math.max(0, m.hp - amount);
  lines.push(source === 'poison' ? `🤢 ${players[uid].name} souffre du poison (−${amount} PV).` : `💥 ${players[uid].name} perd ${amount} PV.`);
  (source === 'poison' ? (game._poisoned ||= []) : (game._hurt ||= [])).push(uid);
  if (m.hp <= 0) { m.alive = false; m.poison = 0; lines.push(`☠️ ${players[uid].name} est mort. Pour de bon.`); }
}

function healAll(game, amount, players, lines, cure = false) {
  for (const [uid, m] of Object.entries(game.party)) {
    if (!m.alive) continue;
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + amount);
    if (cure && m.poison) { m.poison = 0; lines.push(`🌿 ${players[uid].name} n'est plus empoisonné.`); }
    if (m.hp > before) lines.push(`💚 ${players[uid].name} récupère ${m.hp - before} PV.`);
  }
  (game._healed = true);
}

export function rollLoot(rng, levelId, boost = 0) {
  const level = getLevel(levelId);
  let rarity = rng.weighted(level.lootTable);
  const order = Object.keys(RARITY);
  if (boost) rarity = order[Math.min(order.length - 1, order.indexOf(rarity) + boost)];
  for (let r = order.indexOf(rarity); r >= 0; r--) {
    const pool = Object.keys(ITEMS).filter((id) => !ITEMS[id].companion && ITEMS[id].rarity === order[r] && ITEMS[id].tier <= level.id);
    if (pool.length) return rng.pick(pool);
  }
  return 'dague_rouillee';
}

/** Tire un compagnon selon la rareté du niveau (les plus rares deviennent possibles aux niveaux avancés). */
export function rollCompanion(rng, levelId, boost = 0) {
  const level = getLevel(levelId);
  const order = Object.keys(RARITY);
  let rarity = rng.weighted(level.lootTable);
  if (boost) rarity = order[Math.min(order.length - 1, order.indexOf(rarity) + boost)];
  for (let r = order.indexOf(rarity); r >= 0; r--) {
    const pool = Object.keys(ITEMS).filter((id) => ITEMS[id].companion && !ITEMS[id].shiny && ITEMS[id].rarity === order[r] && ITEMS[id].tier <= level.id);
    // 1 fois sur 10 : la variante chromatique
    if (pool.length) { const id = rng.pick(pool); return rng.chance(SHINY_CHANCE) && ITEMS[`${id}_shiny`] ? `${id}_shiny` : id; }
  }
  return 'pet_ecureuil';
}

function gainCompanion(game, rng, lines, boost = 0) {
  const id = rollCompanion(rng, game.levelId, boost);
  game.loot = [...(game.loot || []), id];
  if (ITEMS[id].shiny) lines.push('✨✨ INCROYABLE : une variante chromatique (1 chance sur 10) ! ✨✨');
  lines.push(`🐾 Nouveau compagnon : ${ITEMS[id].icon} ${ITEMS[id].name} (${RARITY[ITEMS[id].rarity].label}) ! Il pourra vous accompagner lors des prochains runs.`);
}

// ---------- Pouvoirs des compagnons ----------
const SQUIRREL_LINES = [
  'regarde fixement un mur pendant dix minutes.',
  'a volé une noisette. Personne ne sait d\u2019où elle vient.',
  'a grimpé sur un casque et refuse d\u2019en descendre.',
  'pousse un petit cri. C\u2019est tout.',
  'enterre un bouton de chemise. Pour plus tard.',
];

/** Héros vivants accompagnés d'un compagnon ayant ce pouvoir. */
function petOwners(game, power) {
  return Object.entries(game.party).filter(([, m]) => m.alive && m.pet && ITEMS[m.pet]?.power === power).map(([u]) => u);
}

function gainLoot(game, rng, lines, boost = 0) {
  const itemId = rollLoot(rng, game.levelId, boost);
  game.loot = [...(game.loot || []), itemId];
  lines.push(`🎁 Butin : ${ITEMS[itemId].icon} ${ITEMS[itemId].name} (${RARITY[ITEMS[itemId].rarity].label})`);
}

function gainGold(game, n, lines) {
  if (n <= 0) return;
  game.gold = (game.gold || 0) + n;
  lines.push(`💰 +${n} pièces d'or.`);
}

function gainXp(game, n) {
  game.xp = (game.xp || 0) + n;
}

/** Effets génériques des événements (voir le format dans data/events.js). */
function applyEffect(game, players, rng, lines, e, actor, level) {
  const scale = (n) => Math.round(n * (1 + level.dcBonus / 4));
  const target = actor || randomAlive(game, rng);
  if (e.text) lines.push(e.text);
  if (e.damage) hurt(game, target, scale(e.damage), players, lines);
  if (e.damageAll) for (const u of Object.keys(game.party)) hurt(game, u, scale(e.damageAll), players, lines);
  if (e.poison && game.party[target]?.alive) { game.party[target].poison = 3; lines.push(`🤢 ${players[target].name} est empoisonné.`); }
  if (e.poisonAll) {
    for (const [u, m] of Object.entries(game.party)) if (m.alive) m.poison = 3;
    lines.push('🤢 Tout le groupe est empoisonné.');
  }
  if (e.maxHp) {
    for (const m of Object.values(game.party)) if (m.alive) { m.maxHp += e.maxHp; m.hp += e.maxHp; }
    lines.push(`❤️ +${e.maxHp} PV max pour tout le groupe.`);
  }
  if (e.heal) healAll(game, e.heal, players, lines, !!e.cure);
  else if (e.cure) {
    for (const [u, m] of Object.entries(game.party)) if (m.alive && m.poison) { m.poison = 0; lines.push(`🌿 ${players[u].name} n'est plus empoisonné.`); }
  }
  if (e.bless) { game.blessed = Math.max(game.blessed || 0, e.bless); lines.push(`✨ Béni pendant ${e.bless} tours (+2 aux jets).`); }
  if (e.curse && !game.cursed) { game.cursed = true; lines.push('💀 Le groupe est maudit : −1 à tous les jets.'); }
  if (e.cleanse && game.cursed) { game.cursed = false; lines.push('🕊️ La malédiction est levée.'); }
  if (e.refreshSkills) for (const m of Object.values(game.party)) if (m.alive) m.skillUsed = false;
  if (e.item) { game.bag[e.item] = (game.bag[e.item] || 0) + 1; lines.push(`🎒 ${CONSUMABLES[e.item].icon} ${CONSUMABLES[e.item].name} ajouté au sac.`); }
  if (e.gold) gainGold(game, rng.int(e.gold[0], e.gold[1]), lines);
  if (e.loot && rng.chance(e.loot)) gainLoot(game, rng, lines, e.lootBoost || 0);
  if (e.xp) gainXp(game, e.xp);
  if (e.flag) game.flags = { ...(game.flags || {}), [e.flag]: true };
  if (e.unflag && game.flags) delete game.flags[e.unflag];
  if (e.reveal) game.revealed = true;
  if (e.companion) gainCompanion(game, rng, lines, e.companionBoost || 0);
}

/** L'ennemi agit selon son intention annoncée. */
function enemyAct(game, players, rng, lines, { failed, guarded }) {
  const { e, dmgMax } = enemyStats(game);
  const intent = game.enemy.intent;
  const dmg = () => Math.max(1, Math.round(rng.int(Math.ceil(dmgMax / 2), Math.round(dmgMax)) + game.enemy.rage));
  let acted = null;
  if (intent === 'attack' && failed && !guarded) {
    hurt(game, randomAlive(game, rng), dmg(), players, lines); acted = 'attack';
  } else if (intent === 'heavy') {
    if (guarded) lines.push(`🛡️ La garde encaisse le coup puissant de ${e.name} !`);
    else { lines.push(`💥 ${e.name} assène un coup puissant !`); hurt(game, randomAlive(game, rng), Math.round(dmg() * 1.6), players, lines); acted = 'heavy'; }
  } else if (intent === 'poison' && failed && !guarded) {
    const t = randomAlive(game, rng);
    hurt(game, t, Math.ceil(dmg() / 2), players, lines);
    if (game.party[t].alive) { game.party[t].poison = 3; lines.push(`🤢 ${players[t].name} est empoisonné.`); }
    acted = 'attack';
  } else if (intent === 'enrage') {
    game.enemy.rage += 2;
    lines.push(`😡 ${e.name} entre en rage (+2 dégâts).`);
  } else if (intent === 'defend') {
    // l'effet (+4 DD) s'appliquait déjà à l'action du groupe
  } else if ((intent === 'attack' || intent === 'poison') && guarded) {
    lines.push(`🛡️ La garde bloque l'attaque de ${e.name}.`);
  }
  return acted;
}

function endOfTurn(game, players, lines) {
  for (const [uid, m] of Object.entries(game.party)) {
    if (!m.alive || !m.poison) continue;
    hurt(game, uid, 2, players, lines, 'poison');
    m.poison = Math.max(0, m.poison - 1);
  }
  if (game.blessed > 0) game.blessed -= 1;
}

// ---------- Résolution ----------
/**
 * Résout le choix du groupe. Retourne un nouvel objet game (l'entrée n'est pas modifiée).
 * En phase « path », entre directement dans la salle choisie (phase « vote »).
 */
export function resolveChoice(gameIn, players, choiceId, seed) {
  const game = structuredClone(gameIn);
  if (game.phase === 'path') return enterNode(game, choiceId.slice(3), seed);

  const rng = new Rng(`${seed}|${game.roomIndex}|${game.round}|${choiceId}`);
  const level = getLevel(game.levelId);
  const room = game.rooms[game.roomIndex];
  const fight = isFight(room);
  const lines = [];
  let rollRes = null;
  let roomDone = false;
  let championUid = null;
  let label = '';
  let failed = false;
  let guarded = false;
  let enemyActs = fight; // l'ennemi agit après l'action du groupe

  if (choiceId.startsWith('buy:')) {
    const o = game.shop[Number(choiceId.slice(4))];
    if (o && !o.sold && game.gold >= o.price) {
      game.gold -= o.price;
      o.sold = true;
      if (o.kind === 'item') {
        game.loot = [...(game.loot || []), o.id];
        label = `Achat : ${ITEMS[o.id].icon} ${ITEMS[o.id].name}`;
        lines.push(`🛒 « Excellent choix ! » (−${o.price} or). L'objet rejoindra votre inventaire.`);
      } else {
        game.bag[o.id] = (game.bag[o.id] || 0) + 1;
        label = `Achat : ${CONSUMABLES[o.id].icon} ${CONSUMABLES[o.id].name}`;
        lines.push(`🛒 Ajouté au sac du groupe (−${o.price} or).`);
      }
    } else {
      label = 'Le marchand fronce les sourcils';
      lines.push('« Pas assez d’or, voyageurs. »');
    }
  } else if (choiceId === 'leave') {
    label = 'Le groupe reprend la route';
    lines.push('« Revenez quand vous voulez ! »');
    roomDone = true;
  } else if (choiceId.startsWith('use:')) {
    const id = choiceId.slice(4);
    const c = CONSUMABLES[id];
    game.bag[id] = Math.max(0, (game.bag[id] || 0) - 1);
    label = `${c.icon} ${c.name}`;
    if (id === 'potion_soin') healAll(game, 8, players, lines, true);
    else if (id === 'bombe') { game.enemy.hp -= 12; lines.push(`💣 BOUM ! ${ENEMIES[game.enemy.id].name} subit 12 dégâts.`); }
    else if (id === 'eau_benite') { game.blessed = 3; lines.push('✨ Le groupe est béni : +2 à tous les jets pendant 3 tours.'); }
    else if (id === 'parchemin_fuite') { lines.push('📜 Un éclair de lumière… le groupe disparaît dans le couloir suivant !'); game.enemy.fled = true; roomDone = true; enemyActs = false; }
  } else if (choiceId.startsWith('skill:')) {
    const uid = choiceId.slice(6);
    const p = players[uid];
    const cls = CLASSES[p.classId];
    const c = charOf(game, players, uid);
    game.party[uid].skillUsed = true;
    championUid = uid;
    label = `${cls.icon} ${p.name} utilise ${cls.skill.name}`;
    switch (cls.skill.id) {
      case 'coup_puissant': {
        const d = (rng.int(1, c.dmg) + Math.max(0, c.stats.for)) * 2;
        game.enemy.hp -= d;
        lines.push(`Un coup dévastateur : ${d} dégâts !`);
        break;
      }
      case 'boule_de_feu': {
        const d = rng.dice(3, 6) + Math.max(0, c.stats.int);
        game.enemy.hp -= d;
        lines.push(`🔥 La boule de feu inflige ${d} dégâts !`);
        break;
      }
      case 'mains_agiles': {
        lines.push(room.type === 'chest' ? 'Le coffre s’ouvre sans un bruit.' : 'Le piège est désamorcé en un clin d’œil.');
        if (room.type === 'chest') { gainLoot(game, rng, lines); gainGold(game, rng.int(10, 25), lines); } else if (rng.chance(0.5)) gainLoot(game, rng, lines);
        gainXp(game, 2);
        roomDone = true;
        break;
      }
      case 'soin_de_groupe': {
        healAll(game, rng.die(8) + Math.max(0, c.stats.sag), players, lines, true);
        break;
      }
    }
  } else if (fight) {
    const action = COMBAT_ACTIONS.find((a) => a.id === choiceId);
    const e = ENEMIES[game.enemy.id];
    const stat = actionStat(game, players, action);
    const champ = bestChampion(game, players, stat);
    championUid = champ.uid;
    label = `${players[champ.uid].name} : ${action.stats ? (stat === 'int' ? 'Lancer un sort' : "Attaquer à l'arme") : action.label}`;
    rollRes = roll(rng, champ.mod, choiceDc(game, choiceId), stat);
    if (action.flee) {
      if (rollRes.success) { lines.push('Le groupe s’échappe dans le couloir suivant !'); roomDone = true; game.enemy.fled = true; enemyActs = false; }
      else { lines.push('Impossible de fuir !'); failed = true; }
    } else if (action.guard) {
      if (rollRes.success) { guarded = true; lines.push('🛡️ Le groupe lève sa garde.'); }
      else { failed = true; lines.push('La garde est trop lente…'); }
    } else if (rollRes.success) {
      let dmg = rng.int(1, champ.char.dmg) + Math.max(0, champ.char.stats[stat]);
      dmg = Math.round(dmg * (action.dmgMult || 1) * (rollRes.crit ? 2 : 1));
      game.enemy.hp -= dmg;
      lines.push(`${rollRes.crit ? 'CRITIQUE ! ' : ''}${e.name} subit ${dmg} dégâts.`);
    } else {
      failed = true;
      lines.push(`${rollRes.fumble ? 'Échec critique… ' : 'Raté. '}`);
    }
  } else {
    const ev = getEvent(room);
    const choice = ev.choices.find((c) => c.id === choiceId);
    if (choice.cost?.gold) { game.gold = Math.max(0, (game.gold || 0) - choice.cost.gold); lines.push(`💰 −${choice.cost.gold} pièces d'or.`); }
    if (choice.cost?.item) game.bag[choice.cost.item] = Math.max(0, (game.bag[choice.cost.item] || 0) - 1);
    let effect;
    let actor = null;
    if (choice.safe) {
      effect = choice.success;
      label = choice.label;
    } else {
      const champ = bestChampion(game, players, choice.stat, choice.class);
      championUid = actor = champ.uid;
      label = `${players[champ.uid].name} : ${choice.label}`;
      rollRes = roll(rng, champ.mod, choiceDc(game, choiceId), choice.stat);
      effect = rollRes.success ? choice.success : choice.fail;
      if (rollRes.success) gainXp(game, 2);
    }
    applyEffect(game, players, rng, lines, effect, actor, level);
    if (effect.next) {
      game.rooms[game.roomIndex] = { ...room, eventId: effect.next };
    } else roomDone = true;
  }

  // Combat : ennemi vaincu, sinon il agit, change de phase et annonce sa prochaine intention
  let enemyAction = null;
  if (game.enemy && !game.enemy.fled && game.enemy.hp > 0 && fight) {
    for (const uid of petOwners(game, 'bite')) {
      if (!rng.chance(1 / 3)) continue;
      const dmg = rng.int(2, 5) + level.id;
      game.enemy.hp -= dmg;
      lines.push(`🐺 Le loup de ${players[uid].name} mord ${ENEMIES[game.enemy.id].name} (−${dmg} PV) !`);
      (game._pets ||= []).push({ uid, kind: 'bite' });
    }
  }
  if (game.enemy && !game.enemy.fled) {
    const e = ENEMIES[game.enemy.id];
    if (game.enemy.hp <= 0) {
      game.enemy.hp = 0;
      const elite = game.enemy.elite;
      lines.push(`🏆 ${e.name}${elite ? ' (élite)' : ''} est vaincu !`);
      gainGold(game, Math.round(rng.int(e.gold[0], e.gold[1]) * (elite ? ELITE.gold : 1)), lines);
      gainXp(game, e.xp * (elite ? ELITE.xp : 1));
      if (e.boss) { gainLoot(game, rng, lines, 1); gainLoot(game, rng, lines); if (rng.chance(0.35)) gainCompanion(game, rng, lines, 1); }
      else if (elite) { gainLoot(game, rng, lines, ELITE.lootBoost); if (rng.chance(0.12)) gainCompanion(game, rng, lines); }
      else if (rng.chance(0.4)) gainLoot(game, rng, lines);
      roomDone = true;
    } else if (enemyActs) {
      enemyAction = enemyAct(game, players, rng, lines, { failed, guarded });
      if (e.boss && game.enemy.phase === 1 && game.enemy.hp <= game.enemy.maxHp / 2) {
        game.enemy.phase = 2;
        game.enemy.rage += 3;
        lines.push(`🔥 ${e.name} est blessé et devient furieux ! (phase 2)`);
      }
      rollIntent(game, rng);
    }
  }
  if (roomDone) {
    for (const uid of petOwners(game, 'dig')) {
      if (!rng.chance(0.4)) continue;
      const n = rng.int(3, 10);
      game.gold = (game.gold || 0) + n;
      lines.push(`🐕 Le chien de ${players[uid].name} déterre ${n} pièces d'or !`);
      (game._pets ||= []).push({ uid, kind: 'dig' });
    }
    for (const uid of petOwners(game, 'useless')) {
      if (rng.chance(0.3)) lines.push(`🐿️ L'écureuil de ${players[uid].name} ${rng.pick(SQUIRREL_LINES)}`);
    }
  }
  endOfTurn(game, players, lines);

  const anyAlive = Object.values(game.party).some((m) => m.alive);
  game.lastResult = {
    label, lines, roll: rollRes, championUid, roomDone, choiceId,
    hurt: game._hurt || [], poisoned: game._poisoned || [], healed: !!game._healed, enemyAction, pets: game._pets || [],
  };
  delete game._hurt; delete game._poisoned; delete game._healed; delete game._pets;
  game.phase = 'result';
  game.votes = {};
  if (!anyAlive) game.outcome = 'defeat';
  else if (roomDone && room.type === 'boss') game.outcome = 'victory';
  return game;
}

function enterNode(game, nodeId, seed) {
  const node = findNode(game, nodeId);
  game.rooms = [...game.rooms, { ...node.room, nodeId: node.id, hidden: node.type === 'unknown' }];
  game.roomIndex = game.rooms.length - 1;
  game.nodeId = node.id;
  game.round = 0;
  enterRoom(game, seed);
  game.phase = 'vote';
  game.votes = {};
  game.lastResult = null;
  game.deadline = Date.now() + VOTE_SECONDS * 1000;
  return game;
}

/** Passe à l'étape suivante après l'affichage du résultat. */
export function advance(gameIn, seed = '') {
  const game = structuredClone(gameIn);
  game.votes = {};
  if (game.outcome) { game.phase = 'over'; return game; }
  if (game.lastResult?.roomDone) {
    game.lastResult = null;
    game.enemy = game.enemy && { ...game.enemy };
    // Montée de niveau ?
    let gained = 0;
    while (game.plevel < XP_LEVELS.length && game.xp >= XP_LEVELS[game.plevel]) { game.plevel += 1; gained += 1; }
    if (gained) {
      const rng = new Rng(`${seed}|boons|${game.plevel}`);
      game.offers = {};
      game.picks = {};
      for (const [uid, m] of Object.entries(game.party)) {
        if (!m.alive) continue;
        const pool = Object.keys(BOONS).filter((id) => id !== 'second_souffle' || m.skillUsed);
        const offer = [];
        while (offer.length < 3 && pool.length) offer.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
        game.offers[uid] = offer;
      }
      game.phase = 'levelup';
      game.deadline = Date.now() + PICK_SECONDS * 1000;
      return game;
    }
    game.phase = 'path';
  } else {
    game.round += 1;
    game.phase = 'vote';
    game.lastResult = null;
  }
  game.deadline = Date.now() + VOTE_SECONDS * 1000;
  return game;
}

/** Applique les bonus choisis (ou un bonus au hasard pour qui n'a pas choisi), puis retour à la carte. */
export function finishLevelUp(gameIn, seed = '') {
  const game = structuredClone(gameIn);
  const rng = new Rng(`${seed}|picks|${game.plevel}`);
  for (const [uid, offer] of Object.entries(game.offers || {})) {
    const m = game.party[uid];
    if (!m?.alive) continue;
    const list = Object.values(offer);
    const id = list.includes(game.picks?.[uid]) ? game.picks[uid] : rng.pick(list);
    m.boons = [...Object.values(m.boons || {}), id];
    const b = BOONS[id];
    if (b.bonus?.hp) { m.maxHp += b.bonus.hp; m.hp = Math.min(m.maxHp, m.hp + b.bonus.hp); }
    if (b.refreshSkill) m.skillUsed = false;
  }
  game.offers = {};
  game.picks = {};
  game.phase = 'path';
  game.votes = {};
  game.deadline = Date.now() + VOTE_SECONDS * 1000;
  return game;
}

/** Objets conservés en fin de run : tout en cas de victoire, seulement le plus rare en cas de défaite. */
export function keptLoot(game) {
  const loot = Object.values(game.loot || {});
  if (game.outcome === 'victory') return [...loot];
  if (!loot.length) return [];
  const best = [...loot].sort((a, b) => RARITY[ITEMS[b].rarity].rank - RARITY[ITEMS[a].rarity].rank)[0];
  return [best];
}
