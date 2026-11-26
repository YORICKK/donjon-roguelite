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
import { heroLevel, MAIN_STAT } from '../src/data/heroes.js';
import { TILES, autoWheel, classStarterWheel } from '../src/data/wheel.js';


// ---------- Politique du bot : src/core/autoplay.js (partagée avec le mode auto du jeu) ----------
import { chooseVote, pickBoon } from '../src/core/autoplay.js';
export { chooseVote, pickBoon };

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
export function bestGear(classId, owned) {
  const st = MAIN_STAT[classId];
  const score = (id) => {
    const b = ITEMS[id].bonus || {};
    return (b[st] || 0) * 3 + (b.hp || 0) * 0.5 + (b.dmg || 0) * 1.5 + ((b.for || 0) + (b.dex || 0) + (b.int || 0) + (b.sag || 0) - (b[st] || 0)) * 0.6;
  };
  return owned.filter((id) => !ITEMS[id].companion && !ITEMS[id].tile).sort((a, b) => score(b) - score(a)).slice(0, 2);
}
export const bestWheel = (classId, inventory) => autoWheel(classId, inventory, CLASSES[classId].stats);

const PET_RANK = { pet_phenix: 7, pet_dragon: 6, pet_golem: 5, pet_ours: 4, pet_chat: 3.5, pet_loup: 3, pet_chien: 2, pet_ecureuil: 1 };
export function bestPet(owned) {
  const pets = owned.filter((id) => ITEMS[id].companion).map((id) => ITEMS[id].variantOf || id);
  return pets.sort((a, b) => (PET_RANK[b] || 0) - (PET_RANK[a] || 0))[0] || null;
}

export function winRate(classId, levelId, equipped, companion, N, tag, wheel = classStarterWheel(classId), heroLv = 1) {
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
  voleur: ['cape_ombre', 'epee_runique'], clerc: ['couronne_liche', 'epee_runique'], necromancien: ['baton_archimage', 'couronne_liche'],
};
const N = Number(process.argv[2]) || 300;
const RANK = { commun: 0, rare: 1, epique: 2, legendaire: 3 };
// inventaire fictif : toutes les tuiles jusqu'à une rareté donnée, n exemplaires
const inv = (max, n = 1) => Object.fromEntries(Object.values(TILES).filter((t) => !t.starter && RANK[t.rarity] <= max).map((t) => [t.id, n]));
console.log(`\nTaux de victoire SOLO (${N} runs par case) — bot qui joue raisonnablement\n`);
console.log(`Classe     Roue / équipement             ${LEVELS.map((l) => `Niv ${l.id}`).join('   ')}`);
for (const classId of Object.keys(CLASSES)) {
  const configs = [
    ['roue de départ', classStarterWheel(classId), [], 1],
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
console.log(`Classe     ${LEVELS.map((l) => `Niv ${l.id} (médiane)`.padEnd(17)).join('')}Campagnes finies`);
for (const classId of Object.keys(CLASSES)) {
  const res = Array.from({ length: C }, (_, k) => campaign(classId, `camp-${classId}-${k}`));
  const med = (lvl) => {
    const xs = res.map((r) => r.runsToClear[lvl]).filter(Boolean).sort((a, b) => a - b);
    return xs.length ? `${xs[Math.floor(xs.length / 2)]} (${xs.length}/${C})` : `— (0/${C})`;
  };
  const done = res.filter((r) => r.runsToClear[LEVELS.length]).length;
  console.log(`${CLASSES[classId].name.padEnd(10)} ${LEVELS.map((l) => med(l.id).padEnd(17)).join('')}${done}/${C}`);
}
}
