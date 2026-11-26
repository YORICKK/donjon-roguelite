// Niveaux de donjon pilotés par les données.
// Ajouter un niveau = ajouter une entrée ici (+ ennemis/objets de tier supérieur si besoin).
// dcBonus : ajouté à tous les DD. enemyScale : multiplie PV et dégâts des ennemis.
// lootTable : poids de tirage par rareté. rooms : nombre de salles avant le boss.
// Un niveau N se débloque quand le joueur a vaincu le boss du niveau N-1.
// bosses : gardiens possibles (tiré au sort à chaque run) ; boss : le gardien principal.
export const LEVELS = [
  {
    id: 1, name: 'Les Cryptes oubliées', theme: 'crypt', rooms: 4, dcBonus: 0, enemyScale: 1,
    palette: { floor: 0x4a4038, wall: 0x6b5d50, fog: 0x0d0a08, torch: 0xff9944 },
    weights: { combat: 3, trap: 2, chest: 2, shrine: 1, npc: 1, rest: 1 },
    enemies: ['rat_geant', 'squelette', 'gobelin'], boss: 'chef_gobelin', bosses: ['chef_gobelin', 'reine_rats'],
    lootTable: { commun: 70, rare: 28, epique: 2, legendaire: 0 },
  },
  {
    id: 2, name: 'Les Mines profondes', theme: 'mine', rooms: 5, dcBonus: 2, enemyScale: 1.4,
    palette: { floor: 0x4a4038, wall: 0x5a4c3e, fog: 0x080604, torch: 0xffb060 },
    weights: { combat: 4, trap: 2, chest: 2, shrine: 1, npc: 1, rest: 1 },
    enemies: ['squelette', 'gobelin', 'ogre'], boss: 'golem', bosses: ['golem', 'roi_ogre'],
    lootTable: { commun: 35, rare: 45, epique: 18, legendaire: 2 },
  },
  {
    id: 3, name: 'Le Sanctuaire de la Liche', theme: 'sanctum', rooms: 6, dcBonus: 4, enemyScale: 1.9,
    palette: { floor: 0x2c2238, wall: 0x45365a, fog: 0x07040c, torch: 0xaa66ff },
    weights: { combat: 5, trap: 2, chest: 2, shrine: 1, npc: 1, rest: 1 },
    enemies: ['ogre', 'spectre', 'squelette'], boss: 'liche', bosses: ['liche', 'chevalier_mort'],
    lootTable: { commun: 10, rare: 40, epique: 38, legendaire: 12 },
  },
  {
    id: 4, name: 'La Forge du Dragon-Roi', theme: 'forge', rooms: 7, dcBonus: 5, enemyScale: 2.2,
    palette: { floor: 0x3a2018, wall: 0x5c2a1c, fog: 0x0e0302, torch: 0xff5a1a },
    weights: { combat: 5, trap: 2, chest: 2, shrine: 1, npc: 1, rest: 1 },
    enemies: ['salamandre', 'demon_lave', 'spectre_cendre', 'golem_magma'], boss: 'dragon_roi',
    lootTable: { commun: 5, rare: 25, epique: 45, legendaire: 25 },
  },
  {
    id: 5, name: 'Le Néant astral', theme: 'astral', rooms: 8, dcBonus: 6, enemyScale: 2.6,
    palette: { floor: 0x1c1a33, wall: 0x2a2550, fog: 0x030210, torch: 0x8a6aff },
    weights: { combat: 5, trap: 2, chest: 2, shrine: 1, npc: 1, rest: 1 },
    enemies: ['ombre_astrale', 'chevalier_vide', 'horreur_astrale', 'gardien_cristal'],
    boss: 'vorath', bosses: ['vorath', 'colosse_astral'],
    lootTable: { commun: 0, rare: 15, epique: 45, legendaire: 40 },
  },
  {
    id: 6, name: 'Les Abysses engloutis', theme: 'abyss', rooms: 8, dcBonus: 7, enemyScale: 3,
    palette: { floor: 0x1a3a3c, wall: 0x1f4a50, fog: 0x01080c, torch: 0x40e0d0 },
    weights: { combat: 5, trap: 2, chest: 2, shrine: 1, npc: 1, rest: 1 },
    enemies: ['noye', 'homme_poisson', 'crabe_abyssal', 'meduse'],
    boss: 'kraken', bosses: ['kraken', 'thalassa'],
    lootTable: { commun: 0, rare: 10, epique: 40, legendaire: 50 },
  },
];

// Carte : `rooms` étages avant le boss, 2 à 3 portes par étage. Les poids `weights` décident
// du type de chaque porte ; élite, marchand et inconnu sont ajoutés à partir du 2e étage.
export const MAP_EXTRA_WEIGHTS = { elite: 1, shop: 1, unknown: 1.5 };

// ---------- Mode infini ----------
// Étages sans fin : l'étage N reprend le biome du niveau ((N-1) mod 6) + 1, avec une difficulté qui
// monte à chaque étage (l'étage 6 vaut le niveau 6, puis ça continue). Après chaque boss, un escalier :
// descendre plus bas, ou remonter avec tout le butin. Les étages sont codés levelId = ENDLESS_BASE + N.
export const ENDLESS_BASE = 100;
export const ENDLESS_START = ENDLESS_BASE + 1;
export const isEndless = (id) => id > ENDLESS_BASE;
export function endlessLevel(depth) {
  const base = LEVELS[(depth - 1) % LEVELS.length];
  return {
    ...base,
    id: ENDLESS_BASE + depth, depth, endless: true, rank: depth,
    name: `Mode infini — étage ${depth}`, biome: base.name,
    rooms: 4,
    dcBonus: Math.min(12, Math.round((depth - 1) * 1.4)),
    enemyScale: Math.round((1 + 0.4 * (depth - 1)) * 100) / 100,
  };
}

export const getLevel = (id) => (isEndless(id) ? endlessLevel(id - ENDLESS_BASE) : LEVELS.find((l) => l.id === id) || LEVELS[0]);
