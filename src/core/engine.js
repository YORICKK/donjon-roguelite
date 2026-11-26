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
import { TILES, SPINS_PER_ATTACK, MAX_SPINS, ULT_WHEELS, sanitizeWheel, tileValue } from '../data/wheel.js';
import { NODE_TYPES, ELITE, PACK, CONSUMABLES, ITEM_PRICES, XP_LEVELS, BOONS } from '../data/run.js';

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
    luck += b.luck || 0;
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
  else if (type === 'boss') room.enemyId = level.bosses ? rng.pick(level.bosses) : level.boss;
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
  // Mode infini : un escalier après le boss
  if (level.endless) floors.push([{ id: `${level.rooms + 1}-0`, floor: level.rooms + 1, type: 'stairs', room: makeRoom(rng, 'stairs', level), next: [] }]);
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
    party[uid] = { hp: c.maxHp, maxHp: c.maxHp, alive: true, skillUsed: false, poison: 0, boons: [], pet, wheel: sanitizeWheel(p.wheel, null, p.classId) };
  }
  const rng = new Rng(`${seed}|entrance`);
  return {
    levelId, party, map: generateMap(seed, levelId), nodeId: null,
    rooms: [{ type: 'entrance', shape: { w: 10, d: 9, pillars: 2, torches: 2 } }], roomIndex: 0,
    enemy: null, round: 0, phase: 'path', votes: {}, deadline: Date.now() + VOTE_SECONDS * 1000,
    gold: 0, xp: 0, plevel: 1, blessed: 0, cursed: false, flags: {}, revealed: false, intro: [], bag: { potion_soin: 1 }, shop: null,
    offers: {}, picks: {}, loot: [], outcome: null, lastResult: null, seedTag: rng.int(0, 9999),
    kills: 0, floorStart: { gold: 0, xp: 0, loot: 0, kills: 0 }, // récapitulatif d'étage (mode infini)
  };
}

function enemyStats(game) {
  const e = ENEMIES[game.enemy.id];
  const level = getLevel(game.levelId);
  const elite = game.enemy.elite;
  return {
    e,
    dc: e.dc + level.dcBonus + (elite ? ELITE.dc : 0) + (game.enemy.intent === 'defend' ? 4 : 0),
    dmgMax: e.dmg * level.enemyScale * (elite ? ELITE.dmg : 1) * (game.enemy.minion ? PACK.dmg : 1),
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
  game.pack = [];
  game.shop = null;
  game.intro = [];
  game.introPets = [];
  if (room.enemyId) {
    const e = ENEMIES[room.enemyId];
    const n = Object.keys(game.party).length;
    const elite = room.type === 'elite';
    const hp = Math.round(e.hp * level.enemyScale * (1 + 0.5 * (n - 1)) * (elite ? ELITE.hp : 1));
    game.enemy = { id: room.enemyId, hp, maxHp: hp, elite, rage: 0, phase: 1, intent: 'attack', slot: -1 };
    rollIntent(game, rng);
    // Sbires : un par joueur en plus du premier, parfois un en solo dans les niveaux avancés
    const rank = level.rank || level.id;
    let count = Math.round((n - 1) * PACK.perExtraPlayer);
    if (rng.chance(Math.min(PACK.soloMax, PACK.soloChance * rank))) count += 1;
    count = Math.min(PACK.maxSize, count);
    const leader = game.enemy;
    game.pack = [];
    for (let i = 0; i < count; i++) {
      const id = rng.pick(level.enemies);
      const mhp = Math.max(4, Math.round(ENEMIES[id].hp * level.enemyScale * PACK.hp));
      game.enemy = { id, hp: mhp, maxHp: mhp, rage: 0, phase: 1, intent: 'attack', minion: true, slot: i };
      rollIntent(game, rng);
      game.pack.push(game.enemy);
    }
    game.enemy = leader;
    game.rooms[game.roomIndex] = { ...room, pack: game.pack.map((m) => m.id) };
    for (const uid of petOwners(game, 'breath')) {
      const dmg = Math.min(game.enemy.hp - 1, rng.dice(2, 6) + 2 * (level.rank || level.id));
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
  if (room.type === 'stairs') {
    const depth = getLevel(game.levelId).depth;
    return [
      { id: 'descend', stairs: true, label: `⬇️ Descendre à l'étage ${depth + 1}`, desc: `Plus dur, meilleur butin. Le groupe récupère 30 % de ses PV, les morts reviennent.` },
      { id: 'retreat', stairs: true, label: '🏃 Remonter avec tout le butin', safe: true, desc: 'Fin du run : chacun garde tous les objets trouvés.' },
    ];
  }
  const choices = [];
  let fleeChoice = null;
  if (room.type === 'shop') {
    (game.shop || []).forEach((o, i) => {
      if (o.sold) return;
      const def = o.kind === 'item' ? ITEMS[o.id] : CONSUMABLES[o.id];
      const sub = o.kind === 'item' ? (def.companion ? `compagnon ${RARITY[def.rarity].label.toLowerCase()} : ${def.desc}` : def.tile ? `tuile de roue ${RARITY[def.rarity].label.toLowerCase()} : ${def.text}` : `objet ${RARITY[def.rarity].label.toLowerCase()}, conservé après le run`) : def.desc;
      choices.push({ id: `buy:${i}`, label: `${def.icon} ${def.name}`, price: o.price, desc: sub, disabled: game.gold < o.price });
    });
    choices.push({ id: 'leave', label: '🚪 Reprendre la route', safe: true });
    return choices;
  }
  if (isFight(room)) {
    const enemy = ENEMIES[game.enemy.id];
    for (const a of COMBAT_ACTIONS) {
      if (a.noBoss && (enemy.boss || room.type === 'boss')) continue;
      // Fuir n'est utile qu'en mauvaise posture : rangé avec les compétences et objets, selon l'état du groupe
      if (a.flee) fleeChoice = { id: a.id, label: a.label, stat: a.stat, desc: a.desc };
      else choices.push({ id: a.id, label: a.label, desc: a.desc, wheel: true });
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
  if (source === 'hit' && m.pet && ITEMS[m.pet]?.power === 'thorns' && game.enemy?.hp > 1) {
    const back = Math.min(3, game.enemy.hp - 1);
    game.enemy.hp -= back;
    lines.push(`🗿 Le golem de ${players[uid].name} riposte (−${back} PV à l'ennemi).`);
    (game._pets ||= []).push({ uid, kind: 'thorns' });
  }
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

/** Butin : une tuile de roue (55 %) ou un objet d'équipement. */
export const TILE_LOOT_CHANCE = 0.55;
export function rollLoot(rng, levelId, boost = 0, tile = rng.chance(TILE_LOOT_CHANCE)) {
  const level = getLevel(levelId);
  let rarity = rng.weighted(level.lootTable);
  const order = Object.keys(RARITY);
  if (boost) rarity = order[Math.min(order.length - 1, order.indexOf(rarity) + boost)];
  for (let r = order.indexOf(rarity); r >= 0; r--) {
    const pool = Object.keys(ITEMS).filter((id) => !ITEMS[id].companion && !!ITEMS[id].tile === tile && ITEMS[id].rarity === order[r] && ITEMS[id].tier <= (level.rank || level.id));
    if (pool.length) return rng.pick(pool);
  }
  return tile ? 't_epee' : 'dague_rouillee';
}

/** Tire un compagnon selon la rareté du niveau (les plus rares deviennent possibles aux niveaux avancés). */
export function rollCompanion(rng, levelId, boost = 0) {
  const level = getLevel(levelId);
  const order = Object.keys(RARITY);
  let rarity = rng.weighted(level.lootTable);
  if (boost) rarity = order[Math.min(order.length - 1, order.indexOf(rarity) + boost)];
  for (let r = order.indexOf(rarity); r >= 0; r--) {
    const pool = Object.keys(ITEMS).filter((id) => ITEMS[id].companion && !ITEMS[id].shiny && ITEMS[id].rarity === order[r] && ITEMS[id].tier <= (level.rank || level.id));
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
  lines.push(`🎁 ${ITEMS[itemId].tile ? 'Nouvelle tuile de roue' : 'Butin'} : ${ITEMS[itemId].icon} ${ITEMS[itemId].name} (${RARITY[ITEMS[itemId].rarity].label})${ITEMS[itemId].tile ? ` — ${ITEMS[itemId].text}` : ''}`);
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
// ---------- La roue ----------
/** Bonus de dégâts hors classe (objets, bonus de niveau, niveau de héros) ajouté à chaque tuile de dégâts. */
function dmgBonusOf(players, uid, c) {
  return c.dmg - (CLASSES[players[uid].classId]?.dmg || c.dmg);
}

/**
 * Applique une tuile (roue principale ou roue d'ulti). mult : multiplicateur (Jackpot).
 * Retourne { dealt, part, stat, guard }.
 */
function applyTile(game, players, uid, c, t, bonus, mult, halve) {
  const e = ENEMIES[game.enemy.id];
  const statMod = t.stat ? Math.max(0, c.stats[t.stat]) : 0;
  const amount = (t.base || 0) + (t.mult || 1) * statMod;
  const out = { dealt: 0, part: `${t.icon} ${t.name}`, stat: null, guard: false };
  if (t.kind === 'dmg' || t.kind === 'smite' || t.kind === 'gold') {
    const perHit = t.kind === 'gold' ? 2 : Math.max(1, amount + bonus);
    let d = perHit * (t.hits || 1) * (t.undead && e.undead ? t.undead : 1) * mult;
    if (halve) d = Math.ceil(d / 2);
    game.enemy.hp -= d;
    out.dealt = d;
    out.stat = t.stat || null;
    out.part += ` (${d})`;
    if (t.kind === 'gold') game.gold = (game.gold || 0) + t.base * mult;
    if (t.kind === 'smite') healAll(game, t.heal * mult, players, [], false);
  } else if (t.kind === 'heal') {
    healAll(game, amount * mult, players, [], !!t.cleanse);
    out.part += ` (+${amount * mult} PV)`;
    out.stat = 'sag';
  } else if (t.kind === 'guard') {
    out.guard = true;
    if (t.base) healAll(game, t.base * mult, players, [], false);
  } else if (t.kind === 'poison') {
    game.enemy.poison = 3;
    game.enemy.poisonDmg = Math.max(game.enemy.poisonDmg || 0, t.base * mult);
  } else if (t.kind === 'bless') {
    game.blessed = Math.max(game.blessed || 0, (t.base || 2) + 1);
  } else if (t.kind === 'revive') {
    const dead = Object.entries(game.party).find(([, m]) => !m.alive);
    if (dead) {
      const [du, m] = dead;
      m.alive = true;
      m.hp = Math.ceil(m.maxHp / 2);
      m.poison = 0;
      out.part += ` : ${players[du]?.name || 'un allié'} revient à la vie !`;
      (game._revived ||= []).push(du);
    } else {
      healAll(game, t.base * mult, players, [], true);
      out.part += ` (+${t.base * mult} PV)`;
    }
    out.stat = 'sag';
  }
  return out;
}

/** Lance une roue n fois (« Encore ! » / « Surcharge » : 2 lancers de plus, Jackpot : 1 de plus). Retourne les index obtenus. */
function spinIndexes(rng, wheel, n, luck, cap) {
  const picks = [];
  let toSpin = n;
  let rerolls = luck;
  while (toSpin > 0 && picks.length < cap) {
    let idx = rng.int(0, wheel.length - 1);
    if (TILES[wheel[idx]].kind === 'miss' && rerolls > 0) { rerolls -= 1; idx = rng.int(0, wheel.length - 1); }
    picks.push(idx);
    toSpin -= 1;
    if (TILES[wheel[idx]].kind === 'respin') toSpin += 2;
    if (TILES[wheel[idx]].kind === 'jackpot') toSpin += 1;
  }
  return picks;
}

/**
 * Chaque héros vivant fait tourner sa roue 2 fois (plus avec « Encore ! »). Une tuile d'ulti fait apparaître
 * la roue spéciale de la classe, lancée plusieurs fois. Retourne les cases obtenues (pour l'animation),
 * si l'attaque ennemie est bloquée, et le héros qui a fait le plus de dégâts.
 */
function spinWheels(game, players, rng, lines) {
  const e = ENEMIES[game.enemy.id];
  const halve = game.enemy.intent === 'defend';
  const spins = [];
  let guarded = false;
  let best = null, bestDmg = -1, bestStat = null;
  for (const [uid, m] of Object.entries(game.party)) {
    if (!m.alive || !players[uid]) continue;
    const classId = players[uid].classId;
    const wheel = sanitizeWheel(m.wheel, null, classId);
    const c = charOf(game, players, uid);
    const bonus = () => dmgBonusOf(players, uid, c) + (game.blessed > 0 ? 2 : 0) - (game.cursed ? 1 : 0);
    const picks = spinIndexes(rng, wheel, SPINS_PER_ATTACK, c.luck, MAX_SPINS);
    const tiles = picks.map((i) => TILES[wheel[i]]);
    const jm = 2 ** tiles.filter((t) => t.kind === 'jackpot').length;
    let dealt = 0, mainStat = null;
    const parts = [];
    const ults = [];
    for (const t of tiles) {
      if (t.kind === 'ult') {
        parts.push(`${t.icon} ${t.name} !`);
        ults.push(t);
        continue;
      }
      if (t.kind === 'jackpot') { parts.push(`${t.icon} JACKPOT`); continue; }
      const mult = t.kind === 'respin' ? 1 : jm;
      const r = applyTile(game, players, uid, c, t, bonus(), mult, halve);
      dealt += r.dealt;
      guarded ||= r.guard;
      if (r.stat && (!mainStat || r.dealt > 0)) mainStat = r.stat;
      parts.push(r.part);
    }
    lines.push(`🎡 ${players[uid].name} : ${parts.join(' + ')}${jm > 1 ? ` — 💎 tout ×${jm} !` : ''}${dealt ? ` → ${dealt} dégâts` : ''}`);
    // Ultis : la roue spéciale de la classe
    const ultSpins = [];
    for (const t of ults) {
      const def = ULT_WHEELS[t.ult];
      const up = spinIndexes(rng, def.wheel, def.spins, 0, def.spins + 6);
      let ud = 0;
      const uparts = [];
      for (const i of up) {
        const ut = TILES[def.wheel[i]];
        const r = applyTile(game, players, uid, c, ut, bonus(), jm, halve);
        ud += r.dealt;
        guarded ||= r.guard;
        if (r.stat && r.dealt > 0) mainStat = r.stat;
        uparts.push(r.part);
      }
      dealt += ud;
      lines.push(`${def.icon} ${def.name} (${up.length} lancers) : ${uparts.join(' + ')}${ud ? ` → ${ud} dégâts` : ''}`);
      ultSpins.push({ wheel: t.ult, picks: up });
    }
    spins.push({ uid, picks, ...(ultSpins.length ? { ults: ultSpins } : {}) });
    if (dealt > bestDmg) { bestDmg = dealt; best = uid; bestStat = mainStat; }
  }
  if (halve) lines.push(`🛡️ ${e.name} se protège : dégâts divisés par deux.`);
  return { spins, guarded, best, stat: bestStat };
}

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
  } else if (intent === 'drain' && failed && !guarded) {
    const t = randomAlive(game, rng);
    const before = game.party[t].hp;
    hurt(game, t, dmg(), players, lines);
    const gain = Math.ceil((before - game.party[t].hp) / 2);
    if (gain > 0) {
      game.enemy.hp = Math.min(game.enemy.maxHp, game.enemy.hp + gain);
      lines.push(`🦇 ${e.name} draine ${gain} PV.`);
    }
    acted = 'attack';
  } else if (intent === 'enrage') {
    game.enemy.rage += 2;
    lines.push(`😡 ${e.name} entre en rage (+2 dégâts).`);
  } else if (intent === 'defend') {
    // l'effet (+4 DD) s'appliquait déjà à l'action du groupe
  } else if ((intent === 'attack' || intent === 'poison' || intent === 'drain') && guarded) {
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
  if (game.rooms[game.roomIndex]?.type === 'stairs') return takeStairs(game, choiceId, seed);

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
  let spins = null;
  let spinStat = null;
  const enemyBefore = game.enemy ? game.enemy.hp : null;

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
  } else if (fight && choiceId === 'fuir') {
    const champ = bestChampion(game, players, 'dex');
    championUid = champ.uid;
    label = `${players[champ.uid].name} : Fuir`;
    rollRes = roll(rng, champ.mod, choiceDc(game, choiceId), 'dex');
    if (rollRes.success) { lines.push('Le groupe s’échappe dans le couloir suivant !'); roomDone = true; game.enemy.fled = true; enemyActs = false; }
    else { lines.push('Impossible de fuir !'); failed = true; }
  } else if (fight) {
    const res = spinWheels(game, players, rng, lines);
    spins = res.spins;
    guarded = res.guarded;
    failed = true; // pas de jet : l'ennemi frappe à chaque tour, sauf si une tuile de garde est sortie
    championUid = res.best;
    spinStat = res.stat;
    label = '🎡 Les roues tournent !';
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
      const dmg = rng.int(2, 5) + (level.rank || level.id);
      game.enemy.hp -= dmg;
      lines.push(`🐺 Le loup de ${players[uid].name} mord ${ENEMIES[game.enemy.id].name} (−${dmg} PV) !`);
      (game._pets ||= []).push({ uid, kind: 'bite' });
    }
    for (const uid of petOwners(game, 'phoenix')) {
      lines.push(`🦅 Le phénix de ${players[uid].name} répand des flammes guérisseuses.`);
      healAll(game, 2 + Math.floor((level.rank || level.id) / 2), players, lines);
      (game._pets ||= []).push({ uid, kind: 'phoenix' });
    }
  }
  if (game.enemy && !game.enemy.fled && fight && game.enemy.poison > 0 && game.enemy.hp > 0) {
    game.enemy.hp -= game.enemy.poisonDmg || 3;
    game.enemy.poison -= 1;
    lines.push(`🧪 ${ENEMIES[game.enemy.id].name} souffre du poison (−${game.enemy.poisonDmg || 3} PV).`);
  }
  if (game.enemy && !game.enemy.fled) {
    const e = ENEMIES[game.enemy.id];
    // Ennemis vaincus : les dégâts en trop passent au suivant ; la salle est finie quand tout le monde est tombé
    while (game.enemy.hp <= 0) {
      const dead = game.enemy;
      const de = ENEMIES[dead.id];
      const overflow = -dead.hp;
      dead.hp = 0;
      const elite = dead.elite;
      game.kills = (game.kills || 0) + 1;
      lines.push(`🏆 ${de.name}${elite ? ' (élite)' : dead.minion ? ' (sbire)' : ''} est vaincu !`);
      if (dead.minion) {
        gainGold(game, Math.round(rng.int(de.gold[0], de.gold[1]) * PACK.gold), lines);
        gainXp(game, Math.round(de.xp * PACK.xp));
        if (rng.chance(0.12)) gainLoot(game, rng, lines);
      } else {
        gainGold(game, Math.round(rng.int(de.gold[0], de.gold[1]) * (elite ? ELITE.gold : 1)), lines);
        gainXp(game, de.xp * (elite ? ELITE.xp : 1));
        if (de.boss) { gainLoot(game, rng, lines, 1); gainLoot(game, rng, lines); if (rng.chance(0.35)) gainCompanion(game, rng, lines, 1); }
        else if (elite) { gainLoot(game, rng, lines, ELITE.lootBoost); if (rng.chance(0.12)) gainCompanion(game, rng, lines); }
        else if (rng.chance(0.4)) gainLoot(game, rng, lines);
      }
      const rest = Object.values(game.pack || {});
      if (de.boss && rest.length) { lines.push(`💨 Privés de leur maître, les sbires s'enfuient !`); game.pack = []; }
      if (de.boss || !rest.length) { roomDone = true; break; }
      game.pack = rest.slice(1);
      game.enemy = { ...rest[0], hp: rest[0].hp - overflow };
      lines.push(`⚔️ ${ENEMIES[game.enemy.id].name} prend la relève${overflow ? ` (−${Math.min(overflow, rest[0].hp)} PV dans l'élan)` : ''} !`);
    }
    if (roomDone) { /* salle terminée */ } else if (enemyActs) {
      enemyAction = enemyAct(game, players, rng, lines, { failed, guarded });
      if (e.boss && game.enemy.phase === 1 && game.enemy.hp <= game.enemy.maxHp / 2) {
        game.enemy.phase = 2;
        game.enemy.rage += 3;
        lines.push(`🔥 ${e.name} est blessé et devient furieux ! (phase 2)`);
      }
      rollIntent(game, rng);
      // Les sbires frappent aussi, chacun selon son intention
      const front = game.enemy;
      game.pack = Object.values(game.pack || {}).map((m) => {
        game.enemy = { ...m };
        if (Object.values(game.party).some((pm) => pm.alive)) enemyAct(game, players, rng, lines, { failed, guarded });
        rollIntent(game, rng);
        return game.enemy;
      });
      game.enemy = front;
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
    label, lines, roll: rollRes, championUid, roomDone, choiceId, spins, stat: spinStat, enemyBefore,
    hurt: game._hurt || [], poisoned: game._poisoned || [], revived: game._revived || [], healed: !!game._healed, enemyAction, pets: game._pets || [],
  };
  delete game._hurt; delete game._poisoned; delete game._healed; delete game._pets; delete game._revived;
  game.phase = 'result';
  game.votes = {};
  if (!anyAlive) game.outcome = 'defeat';
  else if (roomDone && room.type === 'boss' && !level.endless) game.outcome = 'victory';
  else if (roomDone && room.type === 'boss') {
    game.banked = Object.values(game.loot || {}).length; // butin de l'étage assuré
    if (anyAlive) game.pendingCopy = true; // récompense : copier une tuile pour le reste du run
  }
  return game;
}

/** Mode infini : l'escalier. Descendre = nouvel étage (carte neuve, PV en partie rendus) ; remonter = fin du run, tout le butin. */
function takeStairs(game, choiceId, seed) {
  const depth = getLevel(game.levelId).depth;
  if (choiceId === 'retreat') {
    game.outcome = 'victory';
    game.lastResult = { label: '🏃 Remonter', lines: [`Le groupe remonte à la surface depuis l'étage ${depth}, les bras chargés de butin.`], roomDone: true, choiceId };
    game.phase = 'result';
    game.votes = {};
    return game;
  }
  game.floorStart = { gold: game.gold || 0, xp: game.xp || 0, loot: Object.values(game.loot || {}).length, kills: game.kills || 0 };
  game.levelId += 1;
  game.map = generateMap(`${seed}|${game.levelId}`, game.levelId);
  game.nodeId = null;
  game.rooms = [{ type: 'entrance', shape: { w: 10, d: 9, pillars: 2, torches: 2 } }];
  game.roomIndex = 0;
  game.enemy = null;
  game.round = 0;
  game.revealed = false;
  game.flags = {};
  for (const m of Object.values(game.party)) {
    const gain = Math.ceil(m.maxHp * 0.3);
    if (!m.alive) { m.alive = true; m.hp = gain; m.poison = 0; } else m.hp = Math.min(m.maxHp, m.hp + gain);
  }
  game.phase = 'path';
  game.votes = {};
  game.lastResult = null;
  game.deadline = Date.now() + VOTE_SECONDS * 1000;
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
        const pool = Object.keys(BOONS).filter((id) => id !== 'second_souffle');
        const offer = [];
        while (offer.length < 3 && pool.length) offer.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
        game.offers[uid] = offer;
      }
      game.phase = 'levelup';
      game.offerKind = 'boon';
      game.deadline = Date.now() + PICK_SECONDS * 1000;
      return game;
    }
    if (game.pendingCopy && setupCopy(game)) return game;
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
  const rng = new Rng(`${seed}|picks|${game.plevel}|${game.offerKind || 'boon'}|${game.levelId}`);
  if (game.offerKind === 'copy') {
    for (const [uid, offer] of Object.entries(game.offers || {})) {
      const m = game.party[uid];
      if (!m?.alive) continue;
      const list = Object.values(offer);
      copyTile(m, list.includes(game.picks?.[uid]) ? game.picks[uid] : rng.pick(list));
    }
    game.pendingCopy = false;
    game.offerKind = null;
    game.offers = {};
    game.picks = {};
    game.phase = 'path';
    game.votes = {};
    game.deadline = Date.now() + VOTE_SECONDS * 1000;
    return game;
  }
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
  game.offerKind = null;
  if (game.pendingCopy && setupCopy(game)) return game;
  game.phase = 'path';
  game.votes = {};
  game.deadline = Date.now() + VOTE_SECONDS * 1000;
  return game;
}

// ---------- Mode infini : copier une tuile (valable seulement pendant le run) ----------
export const COPY_OFFERS = 4;

/** Tuiles de la roue du héros qu'il peut copier : les plus fortes, sans doublon ni « Raté ». */
export function copyOffers(m) {
  const wheel = Object.values(m.wheel || {});
  const ids = [...new Set(wheel)].filter((id) => TILES[id] && TILES[id].kind !== 'miss');
  return ids.sort((a, b) => tileValue(b) - tileValue(a)).slice(0, COPY_OFFERS);
}

/** Case remplacée par une copie : un « Raté » d'abord, sinon la tuile la plus faible (autre que celle copiée). */
export function copyTarget(m, tileId) {
  const wheel = Object.values(m.wheel || {});
  const miss = wheel.findIndex((id) => TILES[id]?.kind === 'miss');
  if (miss >= 0) return miss;
  let best = -1;
  wheel.forEach((id, i) => { if (id !== tileId && (best < 0 || tileValue(id) < tileValue(wheel[best]))) best = i; });
  return best;
}

function copyTile(m, tileId) {
  const wheel = Object.values(m.wheel || {});
  const i = copyTarget(m, tileId);
  if (i < 0 || !TILES[tileId]) return;
  m.copies = [...Object.values(m.copies || {}), { tile: tileId, replaced: wheel[i] }];
  wheel[i] = tileId;
  m.wheel = wheel;
}

/** Ouvre le choix de la copie (phase « levelup », offerKind « copy »). Faux si personne ne peut copier. */
function setupCopy(game) {
  game.offers = {};
  game.picks = {};
  for (const [uid, m] of Object.entries(game.party)) {
    if (!m.alive) continue;
    const offer = copyOffers(m);
    if (offer.length) game.offers[uid] = offer;
  }
  if (!Object.keys(game.offers).length) { game.pendingCopy = false; return false; }
  game.offerKind = 'copy';
  game.phase = 'levelup';
  game.deadline = Date.now() + PICK_SECONDS * 1000;
  return true;
}

/**
 * Objets conservés en fin de run : tout en cas de victoire, seulement le plus rare en cas de défaite.
 * Mode infini : le butin des étages terminés (boss vaincu) est assuré, plus le plus rare de l'étage en cours.
 */
export function keptLoot(game) {
  const loot = Object.values(game.loot || {});
  if (game.outcome === 'victory') return [...loot];
  const safe = loot.slice(0, game.banked || 0);
  const rest = loot.slice(game.banked || 0);
  if (!rest.length) return safe;
  const best = [...rest].sort((a, b) => RARITY[ITEMS[b].rarity].rank - RARITY[ITEMS[a].rarity].rank)[0];
  return [...safe, best];
}

/** Mode infini : bilan de l'étage en cours (or, XP, ennemis vaincus, objets trouvés, état du groupe). */
export function floorRecap(game) {
  const st = game.floorStart || { gold: 0, xp: 0, loot: 0, kills: 0 };
  const loot = Object.values(game.loot || {});
  const members = Object.values(game.party || {});
  return {
    gold: (game.gold || 0) - st.gold,
    xp: (game.xp || 0) - st.xp,
    kills: (game.kills || 0) - st.kills,
    found: loot.slice(st.loot),
    banked: loot.slice(0, game.banked || 0),
    hp: members.reduce((a, m) => a + (m.alive ? m.hp : 0), 0),
    maxHp: members.reduce((a, m) => a + m.maxHp, 0),
    alive: members.filter((m) => m.alive).length,
    total: members.length,
  };
}
