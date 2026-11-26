// Classes jouables. Stats = modificateurs façon D&D (ajoutés au d20).
// skill : l'ulti de la classe. C'est une tuile de roue (data/wheel.js, ult_<classe>) reçue dès le niveau 1 :
// en tombant dessus, une roue spéciale apparaît. on : [] (plus de choix « compétence » à part).
export const CLASSES = {
  guerrier: {
    id: 'guerrier', name: 'Guerrier', icon: '⚔️', color: '#c0392b',
    desc: 'Robuste et redoutable au corps à corps.',
    stats: { for: 3, dex: 1, int: -1, sag: 0 }, hp: 16, dmg: 8,
    skill: { id: 'berserker', name: 'Ulti : Berserker', desc: 'Tuile de roue : fait apparaître la roue du berserker (3 lancers, dont Exécution).', on: [] },
  },
  mage: {
    id: 'mage', name: 'Mage', icon: '🔮', color: '#2e86de',
    desc: 'Fragile, mais ses sorts dévastent.',
    stats: { for: -1, dex: 0, int: 3, sag: 1 }, hp: 9, dmg: 6,
    skill: { id: 'arcanes', name: 'Ulti : Arcanes', desc: 'Tuile de roue : fait apparaître la roue des arcanes (Nova, Boule de feu, Gel…).', on: [] },
  },
  voleur: {
    id: 'voleur', name: 'Voleur', icon: '🗡️', color: '#27ae60',
    desc: 'Agile, expert des pièges et des serrures.',
    stats: { for: 0, dex: 3, int: 1, sag: -1 }, hp: 11, dmg: 6,
    skill: { id: 'assassin', name: 'Ulti : Assassin', desc: 'Tuile de roue : la roue de l’assassin tourne 7 fois. Peu de dégâts… sauf le point vital.', on: [] },
  },
  clerc: {
    id: 'clerc', name: 'Clerc', icon: '✨', color: '#f1c40f',
    desc: 'Soigne le groupe et repousse les morts-vivants.',
    stats: { for: 1, dex: -1, int: 0, sag: 3 }, hp: 13, dmg: 6,
    skill: { id: 'sacree', name: 'Ulti : Grâce divine', desc: 'Tuile de roue : la roue sacrée soigne, juge les morts-vivants et peut ressusciter.', on: [] },
  },
  necromancien: {
    id: 'necromancien', name: 'Nécromancien', icon: '💀', color: '#8e44ad',
    desc: 'Draine la vie de ses ennemis et relève les morts.',
    stats: { for: 0, dex: -1, int: 2, sag: 2 }, hp: 11, dmg: 6,
    skill: { id: 'macabre', name: 'Ulti : Danse macabre', desc: 'Tuile de roue : la roue macabre tourne 4 fois. Drain de vie, peste, os… et Moisson des âmes.', on: [] },
  },
};

export const STAT_LABELS = { for: 'FOR', dex: 'DEX', int: 'INT', sag: 'SAG' };
