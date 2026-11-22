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
import { ITEMS } from '../src/data/items.js';

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
