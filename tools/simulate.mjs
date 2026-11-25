// Simulateur d'équilibrage : un bot « raisonnable » joue des runs avec le vrai moteur.
//   node tools/simulate.mjs            (ou npm run simulate)
// Mesure : taux de victoire solo par classe / niveau / équipement, puis une campagne complète
// (on part de rien, on farme, on s'équipe du meilleur butin, on avance de niveau).
import {
  createGame, getChoices, previewChoice, resolveChoice, advance, finishLevelUp, keptLoot, nextNodes, shownType,
  computeCharacter, getEvent,
} from '../src/core/engine.js';
import { Rng } from '../src/core/rng.js';
import { pathToFileURL } from 'node:url';
import { ITEMS, RARITY } from '../src/data/items.js';
import { CLASSES } from '../src/data/classes.js';
import { LEVELS } from '../src/data/levels.js';
import { ENEMIES } from '../src/data/events.js';
import { BOONS } from '../src/data/run.js';
import { heroLevel } from '../src/data/heroes.js';
import { TILES, WHEEL_SIZE, STARTER_WHEEL, ownedTiles } from '../src/data/wheel.js';

const MAIN_STAT = { guerrier: 'for', mage: 'int', voleur: 'dex', clerc: 'sag' };

// ---------- Politique du bot ----------
function hpRatio(g) {
  const alive = Object.values(g.party).filter((m) => m.alive);
  return alive.reduce((s, m) => s + m.hp / m.maxHp, 0) / Math.max(1, alive.length);
}

function effectValue(e = {}, g) {
  let v = 0;
  const hp = hpRatio(g);
  if (e.loot) v += 6 * e.loot * (1 + (e.lootBoost || 0));
  if (e.gold) v += (e.gold[0] + e.gold[1]) / 2 / 5;
  if (e.heal) v += e.heal * (hp < 0.7 ? 1.2 : 0.3);
  if (e.xp) v += e.xp * 0.6;
  if (e.bless) v += 2;
  if (e.item) v += 4;
  if (e.maxHp) v += e.maxHp * 1.5;
  if (e.reveal) v += 1.5;
  if (e.flag) v += 6;
  if (e.cleanse) v += 6;
  if (e.companion) v += 3;
  if (e.next) v += 4;
  if (e.refreshSkills) v += 3;
  if (e.damage) v -= e.damage * (hp < 0.5 ? 2.5 : 1.2);
  if (e.damageAll) v -= e.damageAll * (hp < 0.5 ? 3 : 1.5);
  if (e.poison || e.poisonAll) v -= 4;
  if (e.curse) v -= 9;
  return v;
}

function chooseVote(g, players, choices) {
  const allowed = choices.filter((c) => !c.disabled);
  const room = g.rooms[g.roomIndex];
  const hp = hpRatio(g);
  const has = (id) => allowed.find((c) => c.id === id);
  if (g.phase === 'path') {
    const nodes = nextNodes(g);
    const score = (n) => {
      const t = shownType(g, n);
      if (t === 'rest') return hp < 0.6 ? 10 : 2;
      if (t === 'shop') return g.gold >= 20 ? 7 : 1;
      if (t === 'elite') return hp > 0.8 ? 5 : -5;
      if (t === 'chest' || t === 'shrine') return 4;
      if (t === 'npc') return 3;
      if (t === 'combat') return hp > 0.5 ? 3 : 0;
      if (t === 'trap') return hp > 0.6 ? 1 : -2;
      return 2; // inconnu
    };
    const best = nodes.reduce((a, b) => (score(b) > score(a) ? b : a));
    return `go:${best.id}`;
  }
  if (room.type === 'shop') {
    const buy = allowed.filter((c) => c.id.startsWith('buy:'));
    const potion = buy.find((c) => /Potion/.test(c.label));
    if (potion) return potion.id;
    if (buy.length) return buy.sort((a, b) => b.price - a.price)[0].id;
    return 'leave';
  }
  if (g.enemy) {
    const e = ENEMIES[g.enemy.id];
    if (has('use:potion_soin') && hp < 0.4) return 'use:potion_soin';
    if (has('use:parchemin_fuite') && hp < 0.25 && !e.boss) return 'use:parchemin_fuite';
    if (hp < 0.2 && has('fuir') && !e.boss) return 'fuir';
    const skill = allowed.find((c) => c.skill);
    if (skill && /Soin/.test(skill.label) && hp < 0.5) return skill.id;
    if (skill && !/Soin/.test(skill.label) && (g.enemy.hp > 8 || e.boss)) return skill.id;
    if (has('use:bombe') && g.enemy.hp > 10) return 'use:bombe';
    return has('roue') ? 'roue' : allowed[0].id;
  }
  // Événement : espérance de gain
  const ev = getEvent(room);
  let best = allowed[0].id, bestV = -Infinity;
  for (const c of allowed) {
    if (c.skill) { if (/Mains agiles/.test(c.label)) return c.id; if (/Soin/.test(c.label) && hp < 0.45) return c.id; continue; }
    if (c.item) { if (/Potion/.test(c.label) && hp < 0.35) return c.id; continue; }
    const def = ev.choices.find((x) => x.id === c.id);
    if (!def) continue;
    const pv = previewChoice(g, players, c);
    const p = def.safe ? 1 : (pv?.chance || 0.5);
    const v = p * effectValue(def.success, g) + (1 - p) * effectValue(def.fail, g) - (def.cost?.gold || 0) / 6;
    if (v > bestV) { bestV = v; best = c.id; }
  }
  return best;
}

function pickBoon(classId, offer) {
  const prio = [MAIN_STAT[classId] === 'for' ? 'force' : MAIN_STAT[classId] === 'int' ? 'intellect' : MAIN_STAT[classId] === 'dex' ? 'agilite' : 'sagesse',
    'vigueur', 'chance', 'tranchant', 'second_souffle', 'force', 'agilite', 'intellect', 'sagesse'];
  return prio.find((b) => offer.includes(b)) || offer[0];
}

/** Joue un run complet ; retourne { outcome, loot, rooms }. */
export function playRun(seed, levelId, players) {
  let g = createGame(seed, levelId, players);
  for (let step = 0; g.phase !== 'over' && step < 1000; step++) {
    if (g.phase === 'result') { g = advance(g, seed); continue; }
    if (g.phase === 'levelup') {
      const picks = {};
      for (const [uid, offer] of Object.entries(g.offers)) picks[uid] = pickBoon(players[uid].classId, offer);
      g = finishLevelUp({ ...g, picks }, seed);
      continue;
    }
    const choices = getChoices(g, players);
    g = resolveChoice(g, players, chooseVote(g, players, choices), seed);
  }
  return { outcome: g.outcome, loot: keptLoot(g), rooms: g.rooms.length - 1, xp: g.xp || 0 };
}

// ---------- Équipement ----------
/** Les 2 meilleurs objets possédés pour une classe (stat principale, PV, dégâts). */
function bestGear(classId, owned) {
  const st = MAIN_STAT[classId];
  const score = (id) => {
    const b = ITEMS[id].bonus || {};
    return (b[st] || 0) * 3 + (b.hp || 0) * 0.5 + (b.dmg || 0) * 1.5 + ((b.for || 0) + (b.dex || 0) + (b.int || 0) + (b.sag || 0) - (b[st] || 0)) * 0.6;
  };
  return owned.filter((id) => !ITEMS[id].companion && !ITEMS[id].tile).sort((a, b) => score(b) - score(a)).slice(0, 2);
}
/** Valeur approximative d'une tuile pour une classe (dégâts espérés ; soin, garde et spéciales estimés). */
function tileValue(classId, id) {
  const t = TILES[id];
  const st = t.stat ? Math.max(0, CLASSES[classId].stats[t.stat]) : 0;
  const amount = (t.base || 0) + (t.mult || 1) * st;
  switch (t.kind) {
    case 'dmg': return amount * (t.hits || 1);
    case 'smite': return amount + t.heal * 0.6;
    case 'heal': return amount * 0.6;
    case 'guard': return 4 + (t.base || 0) * 0.6;
    case 'poison': return t.base * 2.5;
    case 'gold': return 3;
    case 'jackpot': return 9;
    case 'respin': return 8;
    default: return 0;
  }
}
export function bestWheel(classId, inventory) {
  const owned = ownedTiles(inventory);
  const pool = [];
  for (const [id, n] of Object.entries(owned)) for (let k = 0; k < Math.min(n, WHEEL_SIZE); k++) pool.push(id);
  pool.sort((a, b) => tileValue(classId, b) - tileValue(classId, a));
  const wheel = pool.slice(0, WHEEL_SIZE);
  while (wheel.length < WHEEL_SIZE) wheel.push('t_rate');
  return wheel;
}

const PET_RANK = { pet_dragon: 5, pet_ours: 4, pet_loup: 3, pet_chien: 2, pet_ecureuil: 1 };
function bestPet(owned) {
  const pets = owned.filter((id) => ITEMS[id].companion).map((id) => ITEMS[id].variantOf || id);
  return pets.sort((a, b) => PET_RANK[b] - PET_RANK[a])[0] || null;
}

export function winRate(classId, levelId, equipped, companion, N, tag, wheel = STARTER_WHEEL, heroLv = 1) {
  let wins = 0;
  for (let k = 0; k < N; k++) {
    const players = { solo: { name: 'Solo', classId, equipped, companion, wheel, heroLevel: heroLv } };
    if (playRun(`${tag}-${classId}-${levelId}-${k}`, levelId, players).outcome === 'victory') wins++;
  }
  return wins / N;
}

// ---------- Campagne complète ----------
export function campaign(classId, seed, maxRuns = 400, keepXp = true) {
  const owned = new Set();
  const inventory = {};
  let xp = 0;
  let unlocked = 1;
  const runsToClear = {};
  for (let run = 0; run < maxRuns && unlocked <= LEVELS.length; run++) {
    // stratégie : on tente le niveau le plus haut débloqué
    const level = unlocked;
    const players = { solo: { name: 'Solo', classId, equipped: bestGear(classId, [...owned]), companion: bestPet([...owned]), heroLevel: keepXp ? heroLevel(xp) : 1, wheel: bestWheel(classId, inventory) } };
    const r = playRun(`${seed}-${run}`, level, players);
    for (const id of r.loot) { owned.add(id); inventory[id] = (inventory[id] || 0) + 1; }
    xp += r.xp;
    if (r.outcome === 'victory') {
      runsToClear[level] = run + 1;
      unlocked = level + 1;
    }
  }
  return { runsToClear, heroLevel: heroLevel(xp), wheel: bestWheel(classId, inventory), gear: bestGear(classId, [...owned]), pet: bestPet([...owned]), owned: owned.size };
}

// ---------- Rapport (seulement si lancé directement) ----------
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) report();
function report() {
const pct = (x) => `${Math.round(x * 100)} %`.padStart(5);
const BEST = {
  guerrier: ['epee_runique', 'couronne_liche'], mage: ['baton_archimage', 'couronne_liche'],
  voleur: ['cape_ombre', 'epee_runique'], clerc: ['couronne_liche', 'epee_runique'],
};
const N = Number(process.argv[2]) || 300;
const RANK = { commun: 0, rare: 1, epique: 2, legendaire: 3 };
// inventaire fictif : toutes les tuiles jusqu'à une rareté donnée, n exemplaires
const inv = (max, n = 1) => Object.fromEntries(Object.values(TILES).filter((t) => !t.starter && RANK[t.rarity] <= max).map((t) => [t.id, n]));
console.log(`\nTaux de victoire SOLO (${N} runs par case) — bot qui joue raisonnablement\n`);
console.log('Classe     Roue / équipement             Niv 1   Niv 2   Niv 3');
for (const classId of Object.keys(CLASSES)) {
  const configs = [
    ['roue de départ', STARTER_WHEEL, [], 1],
    ['tuiles communes', bestWheel(classId, inv(0)), [], 1],
    ['tuiles rares, héros niv 3', bestWheel(classId, inv(1)), [], 3],
    ['épiques + objets, niv 5', bestWheel(classId, inv(2)), BEST[classId], 5],
    ['légendaires + objets, niv 8', bestWheel(classId, inv(3, 2)), BEST[classId], 8],
  ];
  for (const [label, wheel, eq, hl] of configs) {
    const rates = LEVELS.map((l) => winRate(classId, l.id, eq, null, N, label, wheel, hl));
    console.log(`${CLASSES[classId].name.padEnd(10)} ${label.padEnd(29)} ${rates.map(pct).join('   ')}`);
  }
}

const C = Number(process.argv[3]) || 40;
console.log(`\nCampagne solo complète (${C} campagnes par classe, max 400 runs) : nombre de runs pour finir chaque niveau\n`);
console.log('Classe     Niv 1 (médiane)  Niv 2 (médiane)  Niv 3 (médiane)  Campagnes finies');
for (const classId of Object.keys(CLASSES)) {
  const res = Array.from({ length: C }, (_, k) => campaign(classId, `camp-${classId}-${k}`));
  const med = (lvl) => {
    const xs = res.map((r) => r.runsToClear[lvl]).filter(Boolean).sort((a, b) => a - b);
    return xs.length ? `${xs[Math.floor(xs.length / 2)]} (${xs.length}/${C})` : `— (0/${C})`;
  };
  const done = res.filter((r) => r.runsToClear[3]).length;
  console.log(`${CLASSES[classId].name.padEnd(10)} ${med(1).padEnd(16)} ${med(2).padEnd(16)} ${med(3).padEnd(16)} ${done}/${C}`);
}
}
