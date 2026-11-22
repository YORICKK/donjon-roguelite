// Tests des règles (node --test). Simule des runs complets (carte, salles, boutique, niveaux)
// avec des votes automatiques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMap, createGame, getChoices, tallyVotes, resolveChoice, advance, finishLevelUp, keptLoot, votersFor,
  nextNodes, previewChoice,
} from '../src/core/engine.js';
import { Rng } from '../src/core/rng.js';
import { LEVELS } from '../src/data/levels.js';
const players = {
  a: { name: 'Alice', classId: 'guerrier', equipped: [] },
  b: { name: 'Bob', classId: 'mage', equipped: ['grimoire_use'] },
};

test('la carte est déterministe, connexe, et finit par le boss', () => {
  for (const level of LEVELS) {
    const m1 = generateMap('abc', level.id);
    assert.deepEqual(m1, generateMap('abc', level.id));
    assert.equal(m1.floors.length, level.rooms + 1);
    assert.equal(m1.floors.at(-1)[0].type, 'boss');
    for (let f = 0; f < m1.floors.length - 1; f++) {
      for (const n of m1.floors[f]) assert.ok(n.next.length >= 1, `porte sans issue ${n.id}`);
      for (const n of m1.floors[f + 1]) assert.ok(m1.floors[f].some((p) => p.next.includes(n.id)), `porte inaccessible ${n.id}`);
    }
  }
});

test('vote majoritaire, égalité tranchée par l\'hôte, choix désactivés ignorés', () => {
  const choices = [{ id: 'x' }, { id: 'y' }, { id: 'z', disabled: true }];
  const rng = new Rng('t');
  assert.equal(tallyVotes({ a: 'y', b: 'y', c: 'x' }, choices, 'c', rng), 'y');
  assert.equal(tallyVotes({ a: 'x', c: 'y' }, choices, 'c', rng), 'y');
  assert.notEqual(tallyVotes({ a: 'z' }, choices, 'c', rng), 'z');
});

function playRun(seed, levelId) {
  let g = createGame(seed, levelId, players);
  const stats = { shops: 0, buys: 0, levelups: 0, elites: 0, uses: 0 };
  for (let steps = 0; g.phase !== 'over'; steps++) {
    assert.ok(steps < 800, 'run infini');
    const rng = new Rng(`${seed}|${steps}`);
    if (g.phase === 'levelup') {
      stats.levelups++;
      const picks = {};
      for (const [uid, offer] of Object.entries(g.offers)) picks[uid] = rng.pick(offer);
      g = finishLevelUp({ ...g, picks }, seed);
      continue;
    }
    if (g.phase === 'result') { g = advance(g, seed); continue; }
    const choices = getChoices(g, players);
    assert.ok(choices.filter((c) => !c.disabled).length > 0, `aucun choix en phase ${g.phase}`);
    assert.ok(choices.length <= 5, `${choices.length} choix proposés (max 5) en phase ${g.phase}`);
    stats.maxChoices = Math.max(stats.maxChoices || 0, choices.length);
    for (const c of choices) {
      const p = previewChoice(g, players, c);
      if (p) assert.ok(p.chance >= 0.05 && p.chance <= 0.95);
    }
    const allowed = choices.filter((c) => !c.disabled);
    // Bot : achète quand il peut, sinon choix au hasard (sans fuir trop souvent)
    let pick = allowed.find((c) => c.id.startsWith('buy:')) || rng.pick(allowed.filter((c) => c.id !== 'fuir') || allowed);
    if (!pick) pick = allowed[0];
    if (g.phase === 'path' && nextNodes(g).some((n) => n.type === 'shop')) stats.shops++;
    if (pick.id.startsWith('buy:')) stats.buys++;
    if (pick.id.startsWith('use:')) stats.uses++;
    const votes = Object.fromEntries(votersFor(g, players).map((u) => [u, pick.id]));
    g = resolveChoice(g, players, tallyVotes(votes, choices, 'a', rng), seed);
    if (g.rooms[g.roomIndex].type === 'elite' && g.round === 0 && g.phase === 'vote') stats.elites++;
    assert.ok(g.gold >= 0, 'or négatif');
    for (const m of Object.values(g.party)) assert.ok(m.hp >= 0 && m.hp <= m.maxHp, 'PV hors limites');
  }
  return { g, stats };
}

test('des runs complets se terminent, avec boutiques, niveaux, objets valides', () => {
  const outcomes = { victory: 0, defeat: 0 };
  const total = { shops: 0, buys: 0, levelups: 0, elites: 0, uses: 0 };
  for (let s = 0; s < 150; s++) {
    for (const level of LEVELS) {
      const { g, stats } = playRun(`seed${s}`, level.id);
      outcomes[g.outcome]++;
      for (const k of Object.keys(total)) total[k] += stats[k];
      for (const id of g.loot) assert.ok(ITEMS[id], `objet inconnu ${id}`);
      if (g.outcome === 'defeat') assert.ok(keptLoot(g).length <= 1);
    }
  }
  assert.ok(outcomes.victory > 0 && outcomes.defeat > 0, JSON.stringify(outcomes));
  assert.ok(total.levelups > 0 && total.buys > 0 && total.elites > 0 && total.uses > 0, JSON.stringify(total));
  console.log('Issues :', outcomes, 'Systèmes :', total);
});

import { EVENTS } from '../src/data/events.js';
import { CONSUMABLES } from '../src/data/run.js';
import { CLASSES } from '../src/data/classes.js';

const EFFECT_KEYS = new Set(['text', 'damage', 'damageAll', 'heal', 'gold', 'loot', 'lootBoost', 'xp', 'poison', 'poisonAll', 'bless',
  'item', 'maxHp', 'refreshSkills', 'flag', 'unflag', 'curse', 'cleanse', 'reveal', 'next', 'cure', 'companion', 'companionBoost']);

test('contenu des événements cohérent', () => {
  const all = Object.values(EVENTS).flat();
  const ids = new Set(all.map((e) => e.id));
  assert.equal(ids.size, all.length, 'identifiants d’événements en double');
  for (const ev of all) {
    for (const c of ev.choices) {
      assert.ok(c.safe || (c.stat && c.dc), `${ev.id}/${c.id} : ni jet ni safe`);
      if (c.class) assert.ok(CLASSES[c.class], `${ev.id}/${c.id} : classe inconnue`);
      for (const eff of [c.success, c.fail].filter(Boolean)) {
        for (const k of Object.keys(eff)) assert.ok(EFFECT_KEYS.has(k), `${ev.id}/${c.id} : effet inconnu ${k}`);
        if (eff.next) assert.ok(ids.has(eff.next), `${ev.id}/${c.id} : enchaînement vers ${eff.next} introuvable`);
        if (eff.item) assert.ok(CONSUMABLES[eff.item], `${ev.id}/${c.id} : consommable inconnu`);
      }
      if (!c.safe) assert.ok(c.fail, `${ev.id}/${c.id} : jet sans effet d'échec`);
    }
  }
  // Chaque événement caché est atteignable par un enchaînement
  const targets = new Set(all.flatMap((e) => e.choices.flatMap((c) => [c.success?.next, c.fail?.next])).filter(Boolean));
  for (const ev of all.filter((e) => e.hidden)) assert.ok(targets.has(ev.id), `${ev.id} caché mais jamais atteint`);
  // Assez de variété par biome et par type
  for (const level of LEVELS) {
    for (const [type, list] of Object.entries(EVENTS)) {
      const pool = list.filter((e) => !e.hidden && (!e.themes || e.themes.includes(level.theme)));
      assert.ok(pool.length >= 3, `${level.theme}/${type} : seulement ${pool.length} événements`);
    }
  }
});

test('fils rouges : un allié libéré affaiblit le boss, la déesse soigne', () => {
  let g = createGame('arc', 1, players);
  const withAlly = structuredClone(g);
  withAlly.flags = { allie: true, faveur: true };
  // on saute directement au boss
  const bossNode = g.map.floors.at(-1)[0];
  const go = (state) => { const s = structuredClone(state); s.nodeId = g.map.floors.at(-2)[0].id; s.phase = 'path'; return resolveChoice(s, players, `go:${bossNode.id}`, 'arc'); };
  const plain = go(g);
  for (const m of Object.values(withAlly.party)) m.hp = 3;
  const ally = go(withAlly);
  assert.ok(ally.enemy.hp < plain.enemy.hp, 'le boss devrait être affaibli');
  assert.ok(Object.values(ally.party).every((m) => m.hp === 9), 'la déesse soigne de 6');
  assert.equal(ally.intro.length, 2);
});

test('jamais plus de 5 choix, même à 4 héros avec un sac plein', () => {
  const four = {
    a: { name: 'A', classId: 'guerrier', equipped: [] }, b: { name: 'B', classId: 'mage', equipped: [] },
    c: { name: 'C', classId: 'voleur', equipped: [] }, d: { name: 'D', classId: 'clerc', equipped: [] },
  };
  for (let s = 0; s < 60; s++) {
    let g = createGame(`full${s}`, 1 + (s % 3), four);
    g.bag = { potion_soin: 2, bombe: 2, eau_benite: 1, parchemin_fuite: 1 };
    for (const m of Object.values(g.party)) m.hp = Math.ceil(m.maxHp / 3);
    for (let step = 0; step < 6 && g.phase !== 'over'; step++) {
      if (g.phase === 'result') { g = advance(g, 'x'); continue; }
      if (g.phase === 'levelup') { g = finishLevelUp(g, 'x'); continue; }
      const choices = getChoices(g, four);
      assert.ok(choices.length <= 5, `${choices.length} choix`);
      const ids = choices.map((c) => c.id);
      if (g.phase === 'vote' && g.enemy) assert.ok(ids.includes('attaque'), 'l\'attaque reste toujours proposée');
      if (g.phase === 'vote' && g.enemy) assert.ok(ids.includes('use:potion_soin'), 'potion proposée quand le groupe est blessé');
      g = resolveChoice(g, four, choices.find((c) => !c.disabled).id, `full${s}`);
    }
  }
});

import { ITEMS } from '../src/data/items.js';

test('compagnons : pouvoirs en jeu et obtention', () => {
  const pp = (pet) => ({ a: { name: 'A', classId: 'guerrier', equipped: [], companion: pet }, b: { name: 'B', classId: 'mage', equipped: [] } });
  const enterFight = (P, seed, levelId = 3) => {
    let g = createGame(seed, levelId, P);
    const n = g.map.floors[0][0];
    n.room = { type: 'combat', enemyId: 'ogre', shape: { w: 10, d: 10, pillars: 0, torches: 2 } };
    return resolveChoice(g, P, `go:${n.id}`, seed);
  };
  // Dragon : souffle à l'entrée du combat
  const withDragon = enterFight(pp('pet_dragon'), 'd1');
  const without = enterFight(pp(null), 'd1');
  assert.ok(withDragon.enemy.hp < without.enemy.hp, 'le dragon doit brûler l\'ennemi');
  assert.ok(withDragon.intro.some((l) => l.includes('dragonnet')));
  // Ours : +4 PV et coups atténués
  const bearGame = createGame('b1', 1, pp('pet_ours'));
  const plainGame = createGame('b1', 1, pp(null));
  assert.equal(bearGame.party.a.maxHp, plainGame.party.a.maxHp + 4);
  // Loup : mord au moins une fois sur plusieurs tours
  let bites = 0;
  for (let k = 0; k < 30; k++) {
    const g = enterFight(pp('pet_loup'), `w${k}`);
    const r = resolveChoice(g, pp('pet_loup'), 'defendre', `w${k}`);
    if (r.lastResult.pets.some((p) => p.kind === 'bite')) bites++;
  }
  assert.ok(bites > 3 && bites < 25, `morsures : ${bites}/30`);
  // Un compagnon n'est jamais tiré comme objet ordinaire, mais bien par l'événement
  for (let k = 0; k < 200; k++) {
    for (const lv of [1, 2, 3]) {
      const g = createGame(`c${k}`, lv, pp(null));
      assert.ok(!g.loot.some((id) => ITEMS[id].companion));
    }
  }
  let found = 0;
  for (let k = 0; k < 40; k++) {
    let g = createGame(`ev${k}`, 1, pp(null));
    const n = g.map.floors[0][0];
    n.room = { type: 'npc', eventId: 'animal_blesse', shape: { w: 10, d: 10, pillars: 0, torches: 2 } };
    g = resolveChoice(g, pp(null), `go:${n.id}`, `ev${k}`);
    g.gold = 10;
    g = resolveChoice(g, pp(null), 'nourrir', `ev${k}`);
    if (g.loot.some((id) => ITEMS[id].companion)) found++;
  }
  assert.equal(found, 40, 'nourrir l\'animal donne toujours un compagnon');
});
