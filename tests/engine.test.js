// Tests des règles (node --test). Simule des runs complets avec des votes automatiques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, createGame, getChoices, tallyVotes, resolveChoice, advance, keptLoot, votersFor } from '../src/core/engine.js';
import { Rng } from '../src/core/rng.js';
import { LEVELS } from '../src/data/levels.js';
import { ITEMS } from '../src/data/items.js';

const players = {
  a: { name: 'Alice', classId: 'guerrier', equipped: [] },
  b: { name: 'Bob', classId: 'mage', equipped: ['grimoire_use'] },
};

test('le donjon est déterministe et se termine par un boss', () => {
  const d1 = generateDungeon('abc', 1);
  const d2 = generateDungeon('abc', 1);
  assert.deepEqual(d1, d2);
  assert.equal(d1.length, LEVELS[0].rooms + 1);
  assert.equal(d1.at(-1).type, 'boss');
});

test('vote majoritaire, égalité tranchée par l\'hôte', () => {
  const choices = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
  const rng = new Rng('t');
  assert.equal(tallyVotes({ a: 'y', b: 'y', c: 'x' }, choices, 'c', rng), 'y');
  assert.equal(tallyVotes({ a: 'x', c: 'z' }, choices, 'c', rng), 'z');
  assert.ok(['x', 'y', 'z'].includes(tallyVotes({}, choices, 'c', rng)));
});

test('des runs complets se terminent toujours (victoire ou défaite) et le butin est valide', () => {
  const outcomes = { victory: 0, defeat: 0 };
  for (let s = 0; s < 200; s++) {
    for (const level of LEVELS) {
      let g = createGame(`seed${s}`, level.id, players);
      let steps = 0;
      while (g.phase !== 'over') {
        assert.ok(steps++ < 500, 'run infini');
        const choices = getChoices(g, players);
        assert.ok(choices.length > 0);
        const rng = new Rng(`${s}|${steps}`);
        const votes = Object.fromEntries(votersFor(g, players).map((u) => [u, rng.pick(choices).id]));
        g = resolveChoice(g, players, tallyVotes(votes, choices, 'a', rng), `seed${s}`);
        g = advance(g);
      }
      outcomes[g.outcome]++;
      for (const id of g.loot) assert.ok(ITEMS[id], `objet inconnu ${id}`);
      assert.ok(keptLoot(g).length <= g.loot.length);
      if (g.outcome === 'defeat') assert.ok(keptLoot(g).length <= 1);
    }
  }
  assert.ok(outcomes.victory > 0 && outcomes.defeat > 0, JSON.stringify(outcomes));
  console.log('Issues des runs simulés :', outcomes);
});
