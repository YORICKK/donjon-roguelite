// Biomes visuels, pilotés par les données. Chaque niveau choisit un thème (levels.js : `theme`).
// Les noms correspondent aux pièces des fichiers GLB (dungeon_kit.glb, themes.glb).
//   walls / floors : listes pondérées par répétition (tirées au hasard pour chaque segment)
//   pillar        : pièce utilisée pour les piliers
//   alongWalls    : gros éléments posés contre les murs latéraux (sarcophage, bibliothèque, étai…)
//   corners       : petit décor dans les coins
//   ceilingCorners: décor accroché en haut des coins (toiles d'araignée)
//   floating      : pièces qui flottent et tournent lentement
//   particles     : poussière / étincelles d'ambiance ; fog : distance de brume (début, fin)
export const THEMES = {
  crypt: {
    walls: ['wall_0', 'wall_1', 'wall_0', 'wall_1', 'crypt_wall_0', 'crypt_wall_1'],
    floors: ['floor_0', 'floor_1', 'floor_2'],
    pillar: 'pillar',
    alongWalls: ['sarcophagus', 'statue', 'coffin', 'tombstone'],
    corners: ['urn', 'candles', 'bones', 'tombstone', 'rubble', 'candles', 'barrel'],
    ceilingCorners: ['cobweb'],
    banner: true,
    particles: { color: 0xe8d6b0, count: 90, size: 0.05, speed: 0.06, rise: 0.02 },
    fog: [6, 32],
  },
  mine: {
    walls: ['mine_wall_0', 'mine_wall_1'],
    floors: ['mine_floor_0', 'mine_floor_1'],
    pillar: 'stalagmite',
    supports: 'mine_support',
    alongWalls: ['minecart', 'ore_pile', 'crystal_blue', 'crate'],
    corners: ['crystal_blue', 'ore_pile', 'stalagmite', 'crate', 'barrel', 'rubble'],
    rails: true,
    particles: { color: 0xc8a878, count: 120, size: 0.04, speed: 0.1, rise: -0.03 },
    fog: [4, 26],
  },
  sanctum: {
    walls: ['sanctum_wall_0', 'sanctum_wall_1'],
    floors: ['sanctum_floor_1', 'sanctum_floor_1', 'sanctum_floor_1', 'sanctum_floor_0'],
    pillar: 'obelisk',
    alongWalls: ['bookshelf', 'brazier', 'statue', 'crystal_purple'],
    corners: ['brazier', 'crystal_purple', 'candles', 'urn'],
    floating: ['rune_stone'],
    particles: { color: 0xc58cff, count: 110, size: 0.07, speed: 0.05, rise: 0.12, additive: true },
    fog: [6, 30],
  },
};

/** Décor ajouté selon le type de salle, quel que soit le biome. */
export const ROOM_DRESSING = {
  rest: ['bedroll', 'bedroll', 'table_set'],
  combat: ['weapon_rack'],
  elite: ['weapon_rack', 'weapon_rack'],
  shop: ['table_set'],
  npc: ['table_set'],
  entrance: ['weapon_rack'],
};

export const getTheme = (level) => THEMES[level?.theme] || THEMES.crypt;
