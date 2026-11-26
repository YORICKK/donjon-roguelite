// Progression permanente des héros : l'XP gagnée pendant un run (victoire ou défaite) s'ajoute
// au niveau de héros de la classe jouée, conservé dans le profil (profile.heroXp[classId]).
// Un run rapporte ~30 XP au niveau 1 et 10-20 XP aux niveaux 2-3 (voir tools/simulate.mjs).

/** XP cumulée pour atteindre chaque niveau de héros (index 0 = niveau 1). */
export const HERO_XP = [0, 30, 75, 135, 210, 300, 410, 540, 690, 860];
export const HERO_MAX = HERO_XP.length;

/** Stat principale de chaque classe (reçoit les bonus de niveau « stat »). */
export const MAIN_STAT = { guerrier: 'for', mage: 'int', voleur: 'dex', clerc: 'sag', necromancien: 'int' };
const STAT_LABEL = { for: 'FOR', dex: 'DEX', int: 'INT', sag: 'SAG' };

/** Bonus débloqué en atteignant chaque niveau (2 à 10), cumulatif. */
const PERKS = { 2: 'hp', 3: 'stat', 4: 'hp', 5: 'dmg', 6: 'hp', 7: 'stat', 8: 'hp', 9: 'dmg', 10: 'luck' };
const HP_PER_PERK = 2;

export function heroLevel(xp = 0) {
  let lv = 1;
  while (lv < HERO_MAX && xp >= HERO_XP[lv]) lv += 1;
  return lv;
}

/** Avancement vers le niveau suivant : { level, into, need, frac } (need = 0 au niveau max). */
export function heroProgress(xp = 0) {
  const level = heroLevel(xp);
  if (level >= HERO_MAX) return { level, into: 0, need: 0, frac: 1 };
  const into = xp - HERO_XP[level - 1];
  const need = HERO_XP[level] - HERO_XP[level - 1];
  return { level, into, need, frac: into / need };
}

/** Description courte du bonus d'un niveau donné. */
export function perkLabel(classId, level) {
  const p = PERKS[level];
  if (p === 'hp') return `+${HP_PER_PERK} PV max`;
  if (p === 'stat') return `+1 ${STAT_LABEL[MAIN_STAT[classId]] || 'stat'}`;
  if (p === 'dmg') return '+1 dégâts';
  if (p === 'luck') return '+1 à tous les jets';
  return '';
}

/** Somme des bonus permanents jusqu'au niveau donné. */
export function heroBonus(classId, level = 1) {
  const b = { stats: {}, hp: 0, dmg: 0, luck: 0 };
  for (let lv = 2; lv <= Math.min(level, HERO_MAX); lv++) {
    const p = PERKS[lv];
    if (p === 'hp') b.hp += HP_PER_PERK;
    else if (p === 'stat') { const s = MAIN_STAT[classId]; b.stats[s] = (b.stats[s] || 0) + 1; }
    else if (p === 'dmg') b.dmg += 1;
    else if (p === 'luck') b.luck += 1;
  }
  return b;
}
