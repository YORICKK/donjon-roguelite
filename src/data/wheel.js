// La roue de combat : chaque héros a une roue de 8 tuiles de même taille. À chaque attaque, il la fait
// tourner 2 fois et applique les 2 tuiles obtenues. Tout le monde commence avec la même roue (médiocre) ;
// on gagne des tuiles pendant les runs pour remplacer les mauvaises (une roue par classe).
//
// Tuile : { name, icon, rarity, tier, kind, stat?, base?, mult?, hits?, text }
//   kind : miss (rien) | dmg (base + mult × stat + bonus de dégâts) | heal (groupe : base + mult × stat)
//          | guard (bloque l'attaque ennemie du tour, + soin éventuel) | poison (poison sur l'ennemi)
//          | gold (or) | jackpot (double l'autre tuile) | respin (2 tours de roue en plus) | smite (dégâts + soin)
//   starter : fait partie de la roue de départ (exemplaires fournis gratuitement, jamais en butin).

export const WHEEL_SIZE = 8;
export const SPINS_PER_ATTACK = 2;

export const STAT_COLORS = { for: '#c0392b', int: '#2e86de', dex: '#27ae60', sag: '#e1b12c' };
export const KIND_COLORS = { miss: '#3a3a44', guard: '#7f8c9a', poison: '#6ab04c', gold: '#d4a017', jackpot: '#ff2e88', respin: '#8e44ad' };

export const TILES = {
  // ---------- Roue de départ ----------
  t_rate: { name: 'Raté', icon: '💨', rarity: 'commun', starter: true, kind: 'miss', text: 'Rien. Absolument rien.' },
  t_gifle: { name: 'Gifle', icon: '🖐️', rarity: 'commun', starter: true, kind: 'dmg', stat: 'for', base: 3, text: '3 + FOR' },
  t_etincelle: { name: 'Étincelle', icon: '✨', rarity: 'commun', starter: true, kind: 'dmg', stat: 'int', base: 3, text: '3 + INT' },
  t_croche: { name: 'Croche-pied', icon: '🦶', rarity: 'commun', starter: true, kind: 'dmg', stat: 'dex', base: 3, text: '3 + DEX' },
  t_priere: { name: 'Petite prière', icon: '🙏', rarity: 'commun', starter: true, kind: 'heal', stat: 'sag', base: 2, text: 'Soigne le groupe : 2 + SAG' },
  t_parade: { name: 'Parade', icon: '🛡️', rarity: 'commun', starter: true, kind: 'guard', text: "Bloque l'attaque ennemie du tour" },
  t_caillou: { name: 'Caillou', icon: '🥌', rarity: 'commun', starter: true, kind: 'dmg', base: 3, text: '3 dégâts' },

  // ---------- Communes ----------
  t_epee: { name: "Coup d'épée", icon: '🗡️', rarity: 'commun', tier: 1, kind: 'dmg', stat: 'for', base: 5, text: '5 + FOR' },
  t_feu: { name: 'Trait de feu', icon: '🔥', rarity: 'commun', tier: 1, kind: 'dmg', stat: 'int', base: 5, text: '5 + INT' },
  t_dague: { name: 'Dague vive', icon: '🔪', rarity: 'commun', tier: 1, kind: 'dmg', stat: 'dex', base: 4, text: '4 + DEX' },
  t_soin: { name: 'Soin', icon: '💚', rarity: 'commun', tier: 1, kind: 'heal', stat: 'sag', base: 3, text: 'Soigne le groupe : 3 + SAG' },
  t_piece: { name: "Pièce d'or", icon: '💰', rarity: 'commun', tier: 1, kind: 'gold', base: 8, text: '+8 or et 2 dégâts' },

  // ---------- Rares ----------
  t_hache: { name: 'Hache lourde', icon: '⚒️', rarity: 'rare', tier: 1, kind: 'dmg', stat: 'for', base: 8, text: '8 + FOR' },
  t_eclair: { name: 'Éclair', icon: '⚡', rarity: 'rare', tier: 1, kind: 'dmg', stat: 'int', base: 8, text: '8 + INT' },
  t_double: { name: 'Double dague', icon: '⚔️', rarity: 'rare', tier: 1, kind: 'dmg', stat: 'dex', base: 3, hits: 2, text: '2 coups de 3 + DEX' },
  t_lumiere: { name: 'Lumière sacrée', icon: '🌞', rarity: 'rare', tier: 1, kind: 'dmg', stat: 'sag', base: 4, undead: 2, text: '4 + SAG, ×2 contre les morts-vivants' },
  t_rempart: { name: 'Rempart', icon: '🏰', rarity: 'rare', tier: 1, kind: 'guard', base: 3, text: 'Bloque l’attaque et soigne le groupe de 3' },
  t_fiole: { name: 'Fiole de poison', icon: '🧪', rarity: 'rare', tier: 1, kind: 'poison', base: 3, text: "Empoisonne l'ennemi : 3 dégâts × 3 tours" },

  // ---------- Épiques ----------
  t_tourbillon: { name: 'Tourbillon', icon: '🌪️', rarity: 'epique', tier: 2, kind: 'dmg', stat: 'for', base: 7, mult: 2, text: '7 + 2 × FOR' },
  t_meteore: { name: 'Météore', icon: '☄️', rarity: 'epique', tier: 2, kind: 'dmg', stat: 'int', base: 9, mult: 2, text: '9 + 2 × INT' },
  t_assassinat: { name: 'Assassinat', icon: '🎯', rarity: 'epique', tier: 2, kind: 'dmg', stat: 'dex', base: 6, mult: 3, text: '6 + 3 × DEX' },
  t_miracle: { name: 'Miracle', icon: '😇', rarity: 'epique', tier: 2, kind: 'heal', stat: 'sag', base: 5, mult: 2, cleanse: true, text: 'Soigne le groupe : 5 + 2 × SAG, guérit le poison' },
  t_encore: { name: 'Encore !', icon: '🔄', rarity: 'epique', tier: 2, kind: 'respin', text: 'Fait tourner la roue 2 fois de plus' },

  // ---------- Légendaires ----------
  t_jackpot: { name: 'Jackpot', icon: '💎', rarity: 'legendaire', tier: 2, kind: 'jackpot', text: "Double l'effet de l'autre tuile" },
  t_colere: { name: 'Colère divine', icon: '🌩️', rarity: 'legendaire', tier: 3, kind: 'smite', stat: 'sag', base: 8, mult: 2, heal: 4, text: '8 + 2 × SAG et soigne le groupe de 4' },
  t_destin: { name: 'Lame du destin', icon: '🌟', rarity: 'legendaire', tier: 3, kind: 'dmg', stat: 'for', base: 14, mult: 2, text: '14 + 2 × FOR' },
  t_apocalypse: { name: 'Apocalypse', icon: '🌋', rarity: 'legendaire', tier: 3, kind: 'dmg', stat: 'int', base: 16, mult: 2, text: '16 + 2 × INT' },
  t_ombre: { name: "Mille coups d'ombre", icon: '🌑', rarity: 'legendaire', tier: 3, kind: 'dmg', stat: 'dex', base: 4, hits: 4, text: '4 coups de 4 + DEX' },
};
for (const [id, t] of Object.entries(TILES)) { t.id = id; t.tile = true; t.tier ||= 1; }

/** Roue de départ, identique pour tous : deux « Raté » et une tuile de chaque stat. */
export const STARTER_WHEEL = ['t_gifle', 't_rate', 't_etincelle', 't_parade', 't_croche', 't_rate', 't_priere', 't_caillou'];

/** Exemplaires gratuits des tuiles de départ (ce qui compose la roue de départ). */
export const STARTER_COUNTS = STARTER_WHEEL.reduce((m, id) => ({ ...m, [id]: (m[id] || 0) + 1 }), {});

export const isTile = (id) => !!TILES[id];

export function tileColor(id) {
  const t = TILES[id];
  if (!t) return KIND_COLORS.miss;
  if (t.kind === 'dmg' || t.kind === 'heal' || t.kind === 'smite') return t.stat ? STAT_COLORS[t.stat] : '#a0703c';
  return KIND_COLORS[t.kind] || '#555';
}

/** Exemplaires possédés de chaque tuile : tuiles de départ + inventaire du profil. « Raté » est illimité (case vide). */
export function ownedTiles(inventory = {}) {
  const out = { ...STARTER_COUNTS };
  for (const [id, n] of Object.entries(inventory)) if (TILES[id] && n > 0) out[id] = (out[id] || 0) + n;
  out.t_rate = Infinity;
  return out;
}

/** Roue valide : 8 tuiles connues, sans dépasser les exemplaires possédés (si inventaire fourni) ; sinon « Raté ». */
export function sanitizeWheel(wheel, inventory = null) {
  const list = Array.isArray(wheel) ? wheel : Object.values(wheel || {});
  if (!list.length) return [...STARTER_WHEEL];
  const left = inventory ? ownedTiles(inventory) : null;
  const out = [];
  for (let i = 0; i < WHEEL_SIZE; i++) {
    let id = TILES[list[i]] ? list[i] : 't_rate';
    if (left) { if ((left[id] || 0) > 0) left[id] -= 1; else id = 't_rate'; }
    out.push(id);
  }
  return out;
}
