// Systèmes propres à un run : carte, or, consommables, montée de niveau.
// Tout est perdu à la fin du run, sauf le butin (objets) qui rejoint l'inventaire.

/** Types de salles proposés sur la carte (icône + libellé de la porte). */
export const NODE_TYPES = {
  entrance: { icon: '🚪', label: 'Entrée' },
  combat: { icon: '⚔️', label: 'Combat' },
  elite: { icon: '💀', label: 'Élite', desc: 'Ennemi renforcé : plus d’or, d’XP et un meilleur butin' },
  trap: { icon: '🪤', label: 'Piège' },
  chest: { icon: '🧰', label: 'Trésor' },
  shrine: { icon: '⛩️', label: 'Autel' },
  npc: { icon: '🧙', label: 'Rencontre' },
  rest: { icon: '🔥', label: 'Repos' },
  shop: { icon: '🛒', label: 'Marchand' },
  unknown: { icon: '❓', label: 'Inconnu' },
  boss: { icon: '👹', label: 'Boss' },
  stairs: { icon: '🪜', label: 'Escalier', desc: 'Descendre plus bas… ou remonter avec le butin' },
};

/** Modificateurs des ennemis d'élite. */
export const ELITE = { hp: 1.6, dmg: 1.25, dc: 1, gold: 2, xp: 2, lootBoost: 1 };

/** Consommables du groupe (sac commun), utilisables à la place d'une action. */
export const CONSUMABLES = {
  potion_soin: { name: 'Potion de soin', icon: '🧪', price: 15, desc: 'Soigne tout le groupe de 8 PV et guérit le poison.' },
  bombe: { name: 'Bombe', icon: '💣', price: 22, desc: 'Inflige 12 dégâts à l’ennemi, sans jet.', combatOnly: true },
  eau_benite: { name: 'Eau bénite', icon: '💧', price: 18, desc: 'Béni pendant 3 tours : +2 à tous les jets.' },
  parchemin_fuite: { name: 'Parchemin de fuite', icon: '📜', price: 12, desc: 'Fuite garantie d’un combat (sauf boss).', combatOnly: true, noBoss: true },
};

/** Prix des objets permanents vendus par le marchand, selon la rareté. */
export const ITEM_PRICES = { commun: 25, rare: 45, epique: 80, legendaire: 140 };

/** XP de groupe nécessaire pour chaque niveau (niveau 1 = départ). */
export const XP_LEVELS = [0, 10, 24, 42, 66, 96, 132];

/** Bonus proposés à chaque joueur quand le groupe monte de niveau (3 tirés au hasard). */
export const BOONS = {
  force: { name: 'Force', icon: '💪', desc: '+1 FOR', bonus: { for: 1 } },
  agilite: { name: 'Agilité', icon: '🤸', desc: '+1 DEX', bonus: { dex: 1 } },
  intellect: { name: 'Intellect', icon: '🧠', desc: '+1 INT', bonus: { int: 1 } },
  sagesse: { name: 'Sagesse', icon: '🙏', desc: '+1 SAG', bonus: { sag: 1 } },
  vigueur: { name: 'Vigueur', icon: '❤️', desc: '+5 PV max (et soigne 5)', bonus: { hp: 5 } },
  tranchant: { name: 'Tranchant', icon: '🗡️', desc: '+2 dégâts', bonus: { dmg: 2 } },
  chance: { name: 'Chance', icon: '🍀', desc: '+1 à tous les jets', bonus: { luck: 1 } },
  second_souffle: { name: 'Second souffle', icon: '🔄', desc: 'Récupère sa compétence de classe', refreshSkill: true },
};

/** Durées des statuts. */
export const STATUS = {
  poison: { icon: '🤢', label: 'Empoisonné', perTurn: 2 },
  blessed: { icon: '✨', label: 'Béni (+2 aux jets)' },
};
