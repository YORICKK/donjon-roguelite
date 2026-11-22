// Niveaux de donjon pilotés par les données.
// Ajouter un niveau = ajouter une entrée ici (+ ennemis/objets de tier supérieur si besoin).
// dcBonus : ajouté à tous les DD. enemyScale : multiplie PV et dégâts des ennemis.
// lootTable : poids de tirage par rareté. rooms : nombre de salles avant le boss.
// Un niveau N se débloque quand le joueur a vaincu le boss du niveau N-1.
export const LEVELS = [
  {
    id: 1, name: 'Les Cryptes oubliées', rooms: 4, dcBonus: 0, enemyScale: 1,
    palette: { floor: 0x4a4038, wall: 0x6b5d50, fog: 0x0d0a08, torch: 0xff9944 },
    weights: { combat: 3, trap: 2, chest: 2, shrine: 1, npc: 1, rest: 1 },
    enemies: ['rat_geant', 'squelette', 'gobelin'], boss: 'chef_gobelin',
    lootTable: { commun: 70, rare: 28, epique: 2, legendaire: 0 },
  },
  {
    id: 2, name: 'Les Mines profondes', rooms: 5, dcBonus: 2, enemyScale: 1.4,
    palette: { floor: 0x353b40, wall: 0x50585e, fog: 0x05080a, torch: 0x66ccff },
    weights: { combat: 4, trap: 2, chest: 2, shrine: 1, npc: 1, rest: 1 },
    enemies: ['squelette', 'gobelin', 'ogre'], boss: 'golem',
    lootTable: { commun: 35, rare: 45, epique: 18, legendaire: 2 },
  },
  {
    id: 3, name: 'Le Sanctuaire de la Liche', rooms: 6, dcBonus: 4, enemyScale: 1.9,
    palette: { floor: 0x2c2238, wall: 0x45365a, fog: 0x07040c, torch: 0xaa66ff },
    weights: { combat: 5, trap: 2, chest: 2, shrine: 1, npc: 1, rest: 1 },
    enemies: ['ogre', 'spectre', 'squelette'], boss: 'liche',
    lootTable: { commun: 10, rare: 40, epique: 38, legendaire: 12 },
  },
];

export const getLevel = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
