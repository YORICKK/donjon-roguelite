// Objets conservés entre les parties. bonus : stats (for/dex/int/sag), hp (PV max), dmg (dégâts).
// tier : niveau de donjon minimum où l'objet peut tomber. Les tiers élevés justifient
// de farmer les premiers niveaux pour survivre aux suivants.
export const RARITY = {
  commun: { label: 'Commun', color: '#bdc3c7', rank: 0 },
  rare: { label: 'Rare', color: '#3498db', rank: 1 },
  epique: { label: 'Épique', color: '#9b59b6', rank: 2 },
  legendaire: { label: 'Légendaire', color: '#e67e22', rank: 3 },
};

export const ITEMS = {
  dague_rouillee: { name: 'Dague rouillée', icon: '🔪', rarity: 'commun', tier: 1, bonus: { dmg: 1 } },
  bouclier_bois: { name: 'Bouclier en bois', icon: '🛡️', rarity: 'commun', tier: 1, bonus: { hp: 3 } },
  bottes_cuir: { name: 'Bottes de cuir', icon: '🥾', rarity: 'commun', tier: 1, bonus: { dex: 1 } },
  amulette_os: { name: 'Amulette en os', icon: '📿', rarity: 'commun', tier: 1, bonus: { sag: 1 } },
  gantelets_fer: { name: 'Gantelets de fer', icon: '🧤', rarity: 'rare', tier: 1, bonus: { for: 1, hp: 2 } },
  grimoire_use: { name: 'Grimoire usé', icon: '📕', rarity: 'rare', tier: 1, bonus: { int: 1, dmg: 1 } },
  anneau_vigueur: { name: 'Anneau de vigueur', icon: '💍', rarity: 'rare', tier: 2, bonus: { hp: 6 } },
  epee_runique: { name: 'Épée runique', icon: '⚔️', rarity: 'epique', tier: 2, bonus: { for: 2, dmg: 3 } },
  cape_ombre: { name: "Cape d'ombre", icon: '🧥', rarity: 'epique', tier: 2, bonus: { dex: 2, hp: 2 } },
  baton_archimage: { name: "Bâton d'archimage", icon: '🪄', rarity: 'legendaire', tier: 3, bonus: { int: 3, dmg: 4 } },
  couronne_liche: { name: 'Couronne de la liche', icon: '👑', rarity: 'legendaire', tier: 3, bonus: { sag: 2, int: 2, hp: 4 } },
};

export const MAX_EQUIPPED = 2;

export function describeBonus(bonus = {}) {
  const labels = { for: 'FOR', dex: 'DEX', int: 'INT', sag: 'SAG', hp: 'PV', dmg: 'Dégâts' };
  return Object.entries(bonus).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${labels[k] || k}`).join(', ');
}
