// Mode auto : choisit pour le joueur le choix le plus probable / le plus rentable.
// Même politique que le bot du simulateur d'équilibrage (tools/simulate.mjs), donc mesurée sur des milliers de runs.
//   chooseVote(g, players, choices) -> id du choix (porte, action de combat, option d'événement, achat…)
//   pickBoon(classId, offer)        -> bonus de montée de niveau ; pour le Miroir (copie), la 1re tuile = la plus forte
import { nextNodes, shownType, getEvent, previewChoice } from './engine.js';
import { ENEMIES } from '../data/events.js';
import { MAIN_STAT } from '../data/heroes.js';

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

export function chooseVote(g, players, choices) {
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
  if (room.type === 'stairs') return hp >= 0.45 && has('descend') ? 'descend' : 'retreat';
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

export function pickBoon(classId, offer) {
  offer = Object.values(offer || {});
  const prio = [MAIN_STAT[classId] === 'for' ? 'force' : MAIN_STAT[classId] === 'int' ? 'intellect' : MAIN_STAT[classId] === 'dex' ? 'agilite' : 'sagesse',
    'vigueur', 'chance', 'tranchant', 'second_souffle', 'force', 'agilite', 'intellect', 'sagesse'];
  return prio.find((b) => offer.includes(b)) || offer[0];
}
