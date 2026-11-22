// Règles du jeu : fonctions pures, sans DOM ni réseau.
// L'hôte du salon est le seul à appeler resolveVotes()/advance() ; il écrit le résultat
// dans l'état partagé et les autres clients se contentent de l'afficher.
import { Rng } from './rng.js';
import { CLASSES } from '../data/classes.js';
import { ITEMS, RARITY } from '../data/items.js';
import { getLevel } from '../data/levels.js';
import { ENEMIES, EVENTS, COMBAT_ACTIONS } from '../data/events.js';

export const VOTE_SECONDS = 30;

// ---------- Personnages ----------
export function computeCharacter(classId, equipped = []) {
  const cls = CLASSES[classId];
  const stats = { ...cls.stats };
  let hp = cls.hp;
  let dmg = cls.dmg;
  for (const itemId of equipped) {
    const b = ITEMS[itemId]?.bonus || {};
    for (const k of Object.keys(stats)) stats[k] += b[k] || 0;
    hp += b.hp || 0;
    dmg += b.dmg || 0;
  }
  return { stats, maxHp: hp, dmg };
}

// ---------- Génération du donjon ----------
export function generateDungeon(seed, levelId) {
  const level = getLevel(levelId);
  const rng = new Rng(`${seed}|dungeon|${level.id}`);
  const rooms = [];
  let prev = null;
  for (let i = 0; i < level.rooms; i++) {
    let type;
    do {
      type = rng.weighted(level.weights);
    } while ((type === prev && type !== 'combat') || (i === 0 && type === 'rest'));
    prev = type;
    rooms.push(makeRoom(rng, type, level));
  }
  rooms.push(makeRoom(rng, 'boss', level));
  return rooms;
}

function makeRoom(rng, type, level) {
  const room = {
    type,
    shape: { w: rng.int(8, 13), d: rng.int(8, 12), pillars: rng.int(0, 2) * 2, torches: rng.int(2, 4) },
  };
  if (type === 'combat') room.enemyId = rng.pick(level.enemies);
  else if (type === 'boss') room.enemyId = level.boss;
  else room.eventId = rng.pick(EVENTS[type]).id;
  return room;
}

export function getEvent(room) {
  return EVENTS[room.type]?.find((e) => e.id === room.eventId) || null;
}

// ---------- Démarrage d'un run ----------
export function createGame(seed, levelId, players) {
  const rooms = generateDungeon(seed, levelId);
  const party = {};
  for (const [uid, p] of Object.entries(players)) {
    if (!p.classId) continue;
    const c = computeCharacter(p.classId, p.equipped || []);
    party[uid] = { hp: c.maxHp, maxHp: c.maxHp, alive: true, skillUsed: false };
  }
  const game = {
    levelId, rooms, party, roomIndex: 0, round: 0, phase: 'vote', votes: {},
    deadline: Date.now() + VOTE_SECONDS * 1000, loot: [], outcome: null, lastResult: null,
  };
  enterRoom(game);
  return game;
}

function enterRoom(game) {
  const room = game.rooms[game.roomIndex];
  const level = getLevel(game.levelId);
  game.enemy = null;
  if (room.enemyId) {
    const e = ENEMIES[room.enemyId];
    const n = Object.keys(game.party).length;
    const hp = Math.round(e.hp * level.enemyScale * (1 + 0.5 * (n - 1)));
    game.enemy = { id: room.enemyId, hp, maxHp: hp };
  }
}

// ---------- Choix proposés ----------
export function getChoices(game, players) {
  const room = game.rooms[game.roomIndex];
  const choices = [];
  const isFight = room.type === 'combat' || room.type === 'boss';
  if (isFight) {
    const enemy = ENEMIES[game.enemy.id];
    for (const a of COMBAT_ACTIONS) {
      if (a.undeadOnly && !enemy.undead) continue;
      if (a.noBoss && enemy.boss) continue;
      choices.push({ id: a.id, label: a.label, stat: a.stat });
    }
  } else {
    for (const c of getEvent(room).choices) choices.push({ id: c.id, label: c.label, stat: c.safe ? null : c.stat });
  }
  const skillRoom = isFight ? 'combat' : room.type;
  for (const [uid, m] of Object.entries(game.party)) {
    if (!m.alive || m.skillUsed) continue;
    const cls = CLASSES[players[uid]?.classId];
    if (!cls || !cls.skill.on.includes(skillRoom)) continue;
    choices.push({ id: `skill:${uid}`, label: `${cls.icon} ${cls.skill.name} (${players[uid].name})`, skill: true, desc: cls.skill.desc });
  }
  return choices;
}

// ---------- Vote majoritaire ----------
// Égalité : le vote de l'hôte l'emporte s'il fait partie des ex æquo, sinon le premier choix de la liste.
export function tallyVotes(votes, choices, hostUid, rng) {
  const counts = {};
  for (const c of Object.values(votes || {})) counts[c] = (counts[c] || 0) + 1;
  const valid = choices.map((c) => c.id).filter((id) => counts[id]);
  if (!valid.length) return rng.pick(choices.filter((c) => !c.skill)).id;
  const max = Math.max(...valid.map((id) => counts[id]));
  const top = valid.filter((id) => counts[id] === max);
  if (top.length === 1) return top[0];
  const hostVote = votes?.[hostUid];
  return top.includes(hostVote) ? hostVote : top[0];
}

export function votersFor(game, players) {
  return Object.keys(game.party).filter((uid) => game.party[uid].alive && players[uid]?.online !== false);
}

// ---------- Résolution ----------
function bestChampion(game, players, stat) {
  let best = null;
  for (const [uid, m] of Object.entries(game.party)) {
    if (!m.alive) continue;
    const p = players[uid];
    if (!p) continue;
    const c = computeCharacter(p.classId, p.equipped || []);
    if (!best || c.stats[stat] > best.mod) best = { uid, mod: c.stats[stat], char: c };
  }
  return best;
}

function randomAlive(game, rng) {
  const alive = Object.keys(game.party).filter((u) => game.party[u].alive);
  return rng.pick(alive);
}

function hurt(game, uid, amount, players, lines) {
  const m = game.party[uid];
  m.hp = Math.max(0, m.hp - amount);
  lines.push(`💥 ${players[uid].name} perd ${amount} PV.`);
  if (m.hp <= 0) { m.alive = false; lines.push(`☠️ ${players[uid].name} est mort. Pour de bon.`); }
}

function healAll(game, amount, players, lines) {
  for (const [uid, m] of Object.entries(game.party)) {
    if (!m.alive) continue;
    const before = m.hp;
    m.hp = Math.min(m.maxHp, m.hp + amount);
    if (m.hp > before) lines.push(`💚 ${players[uid].name} récupère ${m.hp - before} PV.`);
  }
}

export function rollLoot(rng, levelId, boost = 0) {
  const level = getLevel(levelId);
  let rarity = rng.weighted(level.lootTable);
  const order = Object.keys(RARITY);
  if (boost) rarity = order[Math.min(order.length - 1, order.indexOf(rarity) + boost)];
  for (let r = order.indexOf(rarity); r >= 0; r--) {
    const pool = Object.keys(ITEMS).filter((id) => ITEMS[id].rarity === order[r] && ITEMS[id].tier <= level.id);
    if (pool.length) return rng.pick(pool);
  }
  return 'dague_rouillee';
}

function gainLoot(game, rng, lines, boost = 0) {
  const itemId = rollLoot(rng, game.levelId, boost);
  game.loot = [...(game.loot || []), itemId];
  lines.push(`🎁 Butin : ${ITEMS[itemId].icon} ${ITEMS[itemId].name} (${RARITY[ITEMS[itemId].rarity].label})`);
}

/**
 * Résout le choix du groupe. Retourne un nouvel objet game (l'entrée n'est pas modifiée).
 * roomDone=true -> la salle est terminée ; sinon on revote dans la même salle (combat, soin).
 */
export function resolveChoice(gameIn, players, choiceId, seed) {
  const game = structuredClone(gameIn);
  game.party = game.party || {};
  const rng = new Rng(`${seed}|${game.roomIndex}|${game.round}|${choiceId}`);
  const level = getLevel(game.levelId);
  const room = game.rooms[game.roomIndex];
  const isFight = room.type === 'combat' || room.type === 'boss';
  const lines = [];
  let roll = null;
  let roomDone = false;
  let championUid = null;
  let label = '';

  if (choiceId.startsWith('skill:')) {
    const uid = choiceId.slice(6);
    const p = players[uid];
    const cls = CLASSES[p.classId];
    const c = computeCharacter(p.classId, p.equipped || []);
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
        if (room.type === 'chest' || rng.chance(0.5)) gainLoot(game, rng, lines);
        roomDone = true;
        break;
      }
      case 'soin_de_groupe': {
        healAll(game, rng.die(8) + Math.max(0, c.stats.sag), players, lines);
        if (isFight) {
          const e = ENEMIES[game.enemy.id];
          const dmg = Math.round(rng.int(Math.ceil(e.dmg / 2), e.dmg) * level.enemyScale);
          lines.push(`${e.name} profite de la prière pour frapper.`);
          hurt(game, randomAlive(game, rng), dmg, players, lines);
        }
        break;
      }
    }
  } else if (isFight) {
    const action = COMBAT_ACTIONS.find((a) => a.id === choiceId);
    const e = ENEMIES[game.enemy.id];
    const champ = bestChampion(game, players, action.stat);
    championUid = champ.uid;
    label = `${players[champ.uid].name} : ${action.label}`;
    const dc = e.dc + level.dcBonus + (action.dcMod || 0) + (action.flee ? -2 : 0);
    const d20 = rng.die(20);
    const total = d20 + champ.mod;
    const success = d20 === 20 || (d20 !== 1 && total >= dc);
    roll = { d20, mod: champ.mod, total, dc, stat: action.stat, success, crit: d20 === 20, fumble: d20 === 1 };
    if (action.flee) {
      if (success) { lines.push('Le groupe s’échappe dans le couloir suivant !'); roomDone = true; game.enemy.fled = true; }
      else {
        lines.push('Impossible de fuir !');
        hurt(game, randomAlive(game, rng), Math.round(rng.int(Math.ceil(e.dmg / 2), e.dmg) * level.enemyScale), players, lines);
      }
    } else if (success) {
      let dmg = rng.int(1, champ.char.dmg) + Math.max(0, champ.mod);
      dmg = Math.round(dmg * (action.dmgMult || 1) * (roll.crit ? 2 : 1));
      game.enemy.hp -= dmg;
      lines.push(`${roll.crit ? 'CRITIQUE ! ' : ''}${e.name} subit ${dmg} dégâts.`);
    } else {
      lines.push(`${roll.fumble ? 'Échec critique… ' : 'Raté. '}${e.name} contre-attaque !`);
      const dmg = Math.round(rng.int(Math.ceil(e.dmg / 2), e.dmg) * level.enemyScale);
      hurt(game, randomAlive(game, rng), dmg, players, lines);
    }
  } else {
    const ev = getEvent(room);
    const choice = ev.choices.find((c) => c.id === choiceId);
    let effect;
    if (choice.safe) {
      effect = choice.success;
      label = choice.label;
    } else {
      const champ = bestChampion(game, players, choice.stat);
      championUid = champ.uid;
      label = `${players[champ.uid].name} : ${choice.label}`;
      const dc = choice.dc + level.dcBonus;
      const d20 = rng.die(20);
      const total = d20 + champ.mod;
      const success = d20 === 20 || (d20 !== 1 && total >= dc);
      roll = { d20, mod: champ.mod, total, dc, stat: choice.stat, success, crit: d20 === 20, fumble: d20 === 1 };
      effect = success ? choice.success : choice.fail;
      if (effect.damage) {
        lines.push(effect.text);
        hurt(game, champ.uid, Math.round(effect.damage * (1 + level.dcBonus / 4)), players, lines);
        effect = { ...effect, text: null };
      }
    }
    if (effect.text) lines.push(effect.text);
    if (effect.heal) healAll(game, effect.heal, players, lines);
    if (effect.loot && rng.chance(effect.loot)) gainLoot(game, rng, lines);
    roomDone = true;
  }

  // Ennemi vaincu ?
  if (game.enemy && game.enemy.hp <= 0 && !game.enemy.fled) {
    const e = ENEMIES[game.enemy.id];
    game.enemy.hp = 0;
    lines.push(`🏆 ${e.name} est vaincu !`);
    if (e.boss) { gainLoot(game, rng, lines, 1); gainLoot(game, rng, lines); }
    else if (rng.chance(0.5)) gainLoot(game, rng, lines);
    roomDone = true;
  }

  const anyAlive = Object.values(game.party).some((m) => m.alive);
  game.lastResult = { label, lines, roll, championUid, roomDone, choiceId };
  game.phase = 'result';
  game.votes = {};
  if (!anyAlive) { game.outcome = 'defeat'; }
  else if (roomDone && game.roomIndex === game.rooms.length - 1) { game.outcome = 'victory'; }
  return game;
}

/** Passe à l'étape suivante après l'affichage du résultat. */
export function advance(gameIn) {
  const game = structuredClone(gameIn);
  if (game.outcome) { game.phase = 'over'; return game; }
  if (game.lastResult?.roomDone) {
    game.roomIndex += 1;
    game.round = 0;
    enterRoom(game);
  } else {
    game.round += 1;
  }
  game.phase = 'vote';
  game.votes = {};
  game.lastResult = null;
  game.deadline = Date.now() + VOTE_SECONDS * 1000;
  return game;
}

/** Objets conservés en fin de run : tout en cas de victoire, seulement le plus rare en cas de défaite. */
export function keptLoot(game) {
  const loot = game.loot || [];
  if (game.outcome === 'victory') return [...loot];
  if (!loot.length) return [];
  const best = [...loot].sort((a, b) => RARITY[ITEMS[b].rarity].rank - RARITY[ITEMS[a].rarity].rank)[0];
  return [best];
}
