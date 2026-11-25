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
export const KIND_COLORS = { miss: '#3a3a44', guard: '#7f8c9a', poison: '#6ab04c', gold: '#d4a017', jackpot: '#ff2e88', respin: '#8e44ad', revive: '#f5f0dc', bless: '#f7d774' };

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
// Tuile de niveau 4
TILES.t_souffle = { name: 'Souffle du dragon', icon: '🐲', rarity: 'legendaire', tier: 4, kind: 'dmg', base: 22, text: '22 dégâts, quelle que soit la classe' };

// ---------- Ultis : la compétence de chaque classe est une tuile, reçue dès le niveau 1 du héros ----------
// En tombant dessus, une roue spéciale propre à la classe apparaît et tourne plusieurs fois.
const ULT_TILES = {
  ult_guerrier: { name: 'Berserker', icon: '💢', class: 'guerrier', ult: 'berserker', text: 'Ulti : la roue du berserker apparaît (3 lancers dévastateurs)' },
  ult_mage: { name: 'Arcanes', icon: '🔮', class: 'mage', ult: 'arcanes', text: 'Ulti : la roue des arcanes apparaît (3 lancers de sorts)' },
  ult_voleur: { name: 'Assassin', icon: '🎭', class: 'voleur', ult: 'assassin', text: "Ulti : la roue de l'assassin apparaît (7 lancers, peu de dégâts… sauf le point vital)" },
  ult_clerc: { name: 'Grâce divine', icon: '👼', class: 'clerc', ult: 'sacree', text: 'Ulti : la roue sacrée apparaît (3 lancers : soins, jugement, résurrection)' },
};
for (const [id, t] of Object.entries(ULT_TILES)) TILES[id] = { ...t, rarity: 'legendaire', kind: 'ult', ultTile: true };

// Cases des roues d'ulti (jamais en butin ni dans l'éditeur)
const U = {
  u_rate: { name: 'Raté', icon: '💨', kind: 'miss', text: 'Rien.' },
  // berserker
  u_execution: { name: 'Exécution', icon: '☠️', kind: 'dmg', stat: 'for', base: 18, mult: 3, text: '18 + 3 × FOR' },
  u_fendoir: { name: 'Fendoir', icon: '🗡️', kind: 'dmg', stat: 'for', base: 6, text: '6 + FOR' },
  u_coup: { name: 'Coup puissant', icon: '💥', kind: 'dmg', stat: 'for', base: 10, mult: 2, text: '10 + 2 × FOR' },
  u_cri: { name: 'Cri de guerre', icon: '📯', kind: 'guard', base: 4, text: "Bloque l'attaque et soigne le groupe de 4" },
  u_frenesie: { name: 'Frénésie', icon: '😤', kind: 'dmg', stat: 'for', base: 4, hits: 2, text: '2 coups de 4 + FOR' },
  // arcanes
  u_nova: { name: 'Nova', icon: '💫', kind: 'dmg', stat: 'int', base: 18, mult: 3, text: '18 + 3 × INT' },
  u_boule: { name: 'Boule de feu', icon: '🔥', kind: 'dmg', stat: 'int', base: 9, mult: 2, text: '9 + 2 × INT' },
  u_gel: { name: 'Gel', icon: '❄️', kind: 'guard', text: "L'ennemi est gelé : son attaque est bloquée" },
  u_foudre: { name: "Chaîne d'éclairs", icon: '⚡', kind: 'dmg', stat: 'int', base: 5, hits: 2, text: '2 éclairs de 5 + INT' },
  u_surcharge: { name: 'Surcharge', icon: '🔁', kind: 'respin', text: '2 lancers de plus' },
  // assassin : beaucoup de lancers, peu de dégâts… sauf le point vital
  u_point_vital: { name: 'Point vital', icon: '🎯', kind: 'dmg', stat: 'dex', base: 16, mult: 3, text: '16 + 3 × DEX' },
  u_entaille: { name: 'Entaille', icon: '🔪', kind: 'dmg', stat: 'dex', base: 1, text: '1 + DEX' },
  u_saignee: { name: 'Saignée', icon: '🩸', kind: 'poison', base: 4, text: "Empoisonne l'ennemi : 4 × 3 tours" },
  u_vol: { name: 'Vol à la tire', icon: '💰', kind: 'gold', base: 6, text: '+6 or et 2 dégâts' },
  u_esquive: { name: 'Esquive', icon: '🌫️', kind: 'guard', text: "Bloque l'attaque ennemie" },
  // sacrée
  u_resurrection: { name: 'Résurrection', icon: '🕊️', kind: 'revive', base: 8, text: 'Ramène un allié mort à mi-vie (sinon soigne le groupe de 8)' },
  u_soin: { name: 'Soin de groupe', icon: '💖', kind: 'heal', stat: 'sag', base: 6, mult: 2, cleanse: true, text: 'Soigne le groupe : 6 + 2 × SAG, guérit le poison' },
  u_jugement: { name: 'Jugement', icon: '⚖️', kind: 'dmg', stat: 'sag', base: 8, mult: 2, undead: 2, text: '8 + 2 × SAG, ×2 contre les morts-vivants' },
  u_bouclier: { name: 'Bouclier divin', icon: '🛡️', kind: 'guard', base: 3, text: "Bloque l'attaque et soigne le groupe de 3" },
  u_benediction: { name: 'Bénédiction', icon: '✨', kind: 'bless', base: 2, text: 'Béni 2 tours : +2 dégâts par tuile' },
};
for (const [id, t] of Object.entries(U)) TILES[id] = { ...t, rarity: 'legendaire', ultOnly: true };

/** Roues d'ulti : 8 cases (une case peut revenir plusieurs fois) et nombre de lancers. */
export const ULT_WHEELS = {
  berserker: { name: 'Roue du berserker', icon: '💢', spins: 3, wheel: ['u_execution', 'u_fendoir', 'u_coup', 'u_cri', 'u_fendoir', 'u_frenesie', 'u_coup', 'u_rate'] },
  arcanes: { name: 'Roue des arcanes', icon: '🔮', spins: 3, wheel: ['u_nova', 'u_boule', 'u_gel', 'u_foudre', 'u_boule', 'u_surcharge', 'u_foudre', 'u_rate'] },
  assassin: { name: "Roue de l'assassin", icon: '🎭', spins: 7, wheel: ['u_point_vital', 'u_entaille', 'u_entaille', 'u_vol', 'u_entaille', 'u_esquive', 'u_saignee', 'u_rate'] },
  sacree: { name: 'Roue sacrée', icon: '👼', spins: 3, wheel: ['u_resurrection', 'u_soin', 'u_jugement', 'u_bouclier', 'u_soin', 'u_benediction', 'u_jugement', 'u_rate'] },
};

for (const [id, t] of Object.entries(TILES)) { t.id = id; t.tile = true; t.tier ||= 1; }

/** Roue de départ, identique pour tous : deux « Raté » et une tuile de chaque stat. */
export const STARTER_WHEEL = ['t_gifle', 't_rate', 't_etincelle', 't_parade', 't_croche', 't_rate', 't_priere', 't_caillou'];

/** Roue de départ d'une classe : la roue commune, avec la tuile d'ulti de la classe à la place d'un « Raté ». */
export function classStarterWheel(classId) {
  const w = [...STARTER_WHEEL];
  if (TILES[`ult_${classId}`]) w[5] = `ult_${classId}`;
  return w;
}

/** Exemplaires gratuits des tuiles de départ (ce qui compose la roue de départ). */
export const STARTER_COUNTS = STARTER_WHEEL.reduce((m, id) => ({ ...m, [id]: (m[id] || 0) + 1 }), {});

export const isTile = (id) => !!TILES[id];

export function tileColor(id) {
  const t = TILES[id];
  if (!t) return KIND_COLORS.miss;
  if (t.kind === 'ult') return '#ff6a00';
  if (t.kind === 'dmg' || t.kind === 'heal' || t.kind === 'smite') return t.stat ? STAT_COLORS[t.stat] : '#a0703c';
  return KIND_COLORS[t.kind] || '#555';
}

/** Tuile placable sur la roue d'une classe (pas une case d'ulti, et l'ulti seulement pour sa classe). */
export function tileAllowed(id, classId = null) {
  const t = TILES[id];
  if (!t || t.ultOnly) return false;
  return !t.class || !classId || t.class === classId;
}

/** Exemplaires possédés : tuiles de départ + ulti de la classe + inventaire. « Raté » est illimité (case vide). */
export function ownedTiles(inventory = {}, classId = null) {
  const out = { ...STARTER_COUNTS };
  for (const [id, n] of Object.entries(inventory)) if (TILES[id] && !TILES[id].ultOnly && !TILES[id].class && n > 0) out[id] = (out[id] || 0) + n;
  if (classId && TILES[`ult_${classId}`]) out[`ult_${classId}`] = 1;
  out.t_rate = Infinity;
  return out;
}

/** Roue valide : 8 tuiles autorisées, sans dépasser les exemplaires possédés (si inventaire fourni) ; sinon « Raté ». */
export function sanitizeWheel(wheel, inventory = null, classId = null) {
  const list = Array.isArray(wheel) ? wheel : Object.values(wheel || {});
  if (!list.length) return classId ? classStarterWheel(classId) : [...STARTER_WHEEL];
  const left = inventory ? ownedTiles(inventory, classId) : null;
  const out = [];
  for (let i = 0; i < WHEEL_SIZE; i++) {
    let id = tileAllowed(list[i], classId) ? list[i] : 't_rate';
    if (left) { if ((left[id] || 0) > 0) left[id] -= 1; else id = 't_rate'; }
    out.push(id);
  }
  return out;
}
