// Classes jouables. Stats = modificateurs façon D&D (ajoutés au d20).
// skill : compétence utilisable une fois par run, proposée comme choix quand elle s'applique
// (on = types de salle où elle apparaît).
export const CLASSES = {
  guerrier: {
    id: 'guerrier', name: 'Guerrier', icon: '⚔️', color: '#c0392b',
    desc: 'Robuste et redoutable au corps à corps.',
    stats: { for: 3, dex: 1, int: -1, sag: 0 }, hp: 16, dmg: 8,
    skill: { id: 'coup_puissant', name: 'Coup puissant', desc: 'Réussite automatique, dégâts doublés.', on: ['combat'] },
  },
  mage: {
    id: 'mage', name: 'Mage', icon: '🔮', color: '#2e86de',
    desc: 'Fragile, mais ses sorts dévastent.',
    stats: { for: -1, dex: 0, int: 3, sag: 1 }, hp: 9, dmg: 6,
    skill: { id: 'boule_de_feu', name: 'Boule de feu', desc: "Inflige 3d6 + INT à l'ennemi, sans jet.", on: ['combat'] },
  },
  voleur: {
    id: 'voleur', name: 'Voleur', icon: '🗡️', color: '#27ae60',
    desc: 'Agile, expert des pièges et des serrures.',
    stats: { for: 0, dex: 3, int: 1, sag: -1 }, hp: 11, dmg: 6,
    skill: { id: 'mains_agiles', name: 'Mains agiles', desc: 'Désamorce un piège ou ouvre un coffre sans risque.', on: ['trap', 'chest'] },
  },
  clerc: {
    id: 'clerc', name: 'Clerc', icon: '✨', color: '#f1c40f',
    desc: 'Soigne le groupe et repousse les morts-vivants.',
    stats: { for: 1, dex: -1, int: 0, sag: 3 }, hp: 13, dmg: 6,
    skill: { id: 'soin_de_groupe', name: 'Soin de groupe', desc: 'Soigne tout le groupe de 1d8 + SAG.', on: ['combat', 'trap', 'shrine', 'npc', 'chest', 'rest'] },
  },
};

export const STAT_LABELS = { for: 'FOR', dex: 'DEX', int: 'INT', sag: 'SAG' };
