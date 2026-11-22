// Ennemis et événements. Un choix teste une stat : d20 + meilleure valeur de cette stat
// parmi les personnages vivants du groupe (le « champion » qui tente l'action), contre un DD
// (+ dcBonus du niveau). Effets : damage (au champion), heal (à tout le groupe), loot (probabilité 0..1).
export const ENEMIES = {
  rat_geant: { name: 'Rat géant', hp: 6, dmg: 3, dc: 9, color: 0x8d6e63, shape: 'rat', xp: 4, gold: [2, 6], intents: { attack: 3, poison: 2 } },
  squelette: { name: 'Squelette', hp: 9, dmg: 4, dc: 11, color: 0xe0e0d0, shape: 'humanoid', undead: true, xp: 6, gold: [4, 10], intents: { attack: 3, defend: 2, heavy: 1 } },
  gobelin: { name: 'Gobelin', hp: 8, dmg: 4, dc: 10, color: 0x6ab04c, shape: 'humanoid', xp: 5, gold: [5, 12], intents: { attack: 4, heavy: 1, defend: 1 } },
  ogre: { name: 'Ogre', hp: 18, dmg: 7, dc: 12, color: 0x9c8b5e, shape: 'brute', xp: 10, gold: [8, 18], intents: { attack: 2, heavy: 2, enrage: 1 } },
  spectre: { name: 'Spectre', hp: 12, dmg: 6, dc: 13, color: 0x9fd3ff, shape: 'ghost', undead: true, xp: 9, gold: [6, 14], intents: { attack: 3, poison: 2, defend: 1 } },
  chef_gobelin: { name: 'Chef gobelin', hp: 18, dmg: 5, dc: 12, color: 0x3d8b37, shape: 'brute', boss: true, xp: 20, gold: [25, 40], intents: { attack: 3, heavy: 2, defend: 1, enrage: 1 } },
  golem: { name: 'Golem de pierre', hp: 30, dmg: 8, dc: 13, color: 0x7f8c8d, shape: 'brute', boss: true, xp: 30, gold: [40, 60], intents: { attack: 2, heavy: 3, defend: 2 } },
  liche: { name: 'La Liche', hp: 40, dmg: 10, dc: 15, color: 0xb388ff, shape: 'ghost', boss: true, undead: true, xp: 40, gold: [60, 90], intents: { attack: 3, heavy: 2, poison: 2, enrage: 1 } },
};

// Intentions des ennemis (annoncées avant le vote, résolues après l'action du groupe).
//   attack : frappe si l'action du groupe échoue ; heavy : frappe fort quoi qu'il arrive, sauf garde levée ;
//   defend : +4 au DD ce tour ; poison : frappe faible + empoisonne si l'action échoue ; enrage : +2 dégâts.
export const INTENTS = {
  attack: { icon: '⚔️', label: 'Attaque' },
  heavy: { icon: '💥', label: 'Coup puissant' },
  defend: { icon: '🛡️', label: 'Se protège (DD +4)' },
  poison: { icon: '🧪', label: 'Attaque empoisonnée' },
  enrage: { icon: '😡', label: 'Entre en rage (+2 dégâts)' },
};

// Actions de combat de base (toujours proposées). dcMod : ajusté au DD de l'ennemi.
export const COMBAT_ACTIONS = [
  { id: 'attaque', label: "Attaquer à l'arme", stat: 'for' },
  { id: 'sort', label: 'Lancer un sort', stat: 'int' },
  { id: 'sournois', label: 'Attaque sournoise (DD +2, dégâts ×1,5)', stat: 'dex', dcMod: 2, dmgMult: 1.5 },
  { id: 'repousser', label: 'Repousser les morts-vivants', stat: 'sag', undeadOnly: true, dmgMult: 1.5 },
  { id: 'defendre', label: "Lever la garde (bloque l'attaque)", stat: 'for', dcMod: -3, guard: true },
  { id: 'fuir', label: 'Fuir (pas de butin)', stat: 'dex', flee: true, noBoss: true },
];

export const EVENTS = {
  trap: [
    {
      id: 'dalles_piegees', title: 'Dalles piégées',
      text: 'Le sol est couvert de dalles fissurées. Un déclic suspect résonne sous vos pieds.',
      choices: [
        { id: 'sauter', label: 'Sauter de dalle en dalle', stat: 'dex', dc: 11, success: { text: 'Vous traversez avec grâce.' }, fail: { damage: 4, text: 'Des pointes jaillissent du sol !' } },
        { id: 'analyser', label: 'Analyser le mécanisme', stat: 'int', dc: 12, success: { text: 'Vous repérez le motif sûr… et une pièce cachée.', loot: 0.3 }, fail: { damage: 5, text: 'Mauvaise dalle… des flèches partent des murs.' } },
        { id: 'foncer', label: 'Foncer tête baissée', stat: 'for', dc: 13, success: { text: 'Vous encaissez sans broncher.' }, fail: { damage: 6, text: 'Ça fait très mal.' } },
      ],
    },
    {
      id: 'gaz', title: 'Nappe de gaz verdâtre',
      text: "Une brume toxique stagne dans la salle. L'autre porte est à vingt pas.",
      choices: [
        { id: 'retenir', label: 'Retenir son souffle et courir', stat: 'for', dc: 11, success: { text: 'Vous ressortez en toussant, indemnes.' }, fail: { damage: 4, text: 'Le gaz vous brûle les poumons.' } },
        { id: 'prier', label: 'Prier pour une protection', stat: 'sag', dc: 12, success: { text: 'Une aura pure vous enveloppe.' }, fail: { damage: 5, text: "Les dieux sont sourds aujourd'hui." } },
      ],
    },
  ],
  chest: [
    {
      id: 'coffre_ferre', title: 'Un coffre ferré',
      text: 'Un lourd coffre bardé de fer trône au centre de la pièce. Sa serrure est complexe.',
      choices: [
        { id: 'crocheter', label: 'Crocheter la serrure', stat: 'dex', dc: 12, success: { loot: 1, gold: [10, 25], text: "Clic. Le coffre s'ouvre." }, fail: { damage: 3, text: 'Une aiguille empoisonnée vous pique.' } },
        { id: 'forcer', label: 'Forcer le couvercle', stat: 'for', dc: 13, success: { loot: 1, gold: [8, 20], text: 'Le bois cède dans un craquement.' }, fail: { damage: 2, text: 'Vous vous écrasez les doigts.' } },
        { id: 'ignorer', label: 'Passer son chemin', safe: true, success: { text: 'Prudence est mère de sûreté.' } },
      ],
    },
    {
      id: 'mimique', title: 'Un coffre… qui respire ?',
      text: 'Un coffre doré semble légèrement se soulever, comme s’il respirait.',
      choices: [
        { id: 'examiner', label: "L'examiner de près", stat: 'int', dc: 12, success: { loot: 1, text: "C'était une mimique endormie ! Vous récupérez son trésor." }, fail: { damage: 5, text: 'La mimique vous mord !' } },
        { id: 'frapper', label: "Le frapper d'abord", stat: 'for', dc: 11, success: { loot: 1, text: 'La mimique meurt avant de se réveiller.' }, fail: { damage: 4, text: 'Elle se réveille, furieuse.' } },
        { id: 'ignorer', label: 'Reculer lentement', safe: true, success: { text: 'Vous laissez la chose dormir.' } },
      ],
    },
  ],
  shrine: [
    {
      id: 'autel', title: 'Un autel oublié',
      text: 'Un autel ancien luit faiblement. Des runes demandent une offrande.',
      choices: [
        { id: 'prier', label: 'Prier', stat: 'sag', dc: 11, success: { heal: 6, text: 'Une chaleur divine vous soigne.' }, fail: { damage: 2, text: 'Le dieu est mécontent.' } },
        { id: 'dechiffrer', label: 'Déchiffrer les runes', stat: 'int', dc: 13, success: { loot: 1, text: "Un compartiment secret s'ouvre." }, fail: { text: 'Les runes restent muettes.' } },
        { id: 'ignorer', label: 'Ne pas y toucher', safe: true, success: { text: 'Vous continuez.' } },
      ],
    },
  ],
  npc: [
    {
      id: 'marchand', title: 'Un marchand égaré',
      text: 'Un vieil homme couvert de sacoches vous fait signe. « Psst… un échange ? »',
      choices: [
        { id: 'negocier', label: 'Négocier', stat: 'int', dc: 11, success: { loot: 1, text: '« Marché conclu ! » Il vous tend un objet.' }, fail: { text: 'Il hausse les épaules et disparaît.' } },
        { id: 'intimider', label: "L'intimider", stat: 'for', dc: 12, success: { loot: 1, text: "Tremblant, il lâche un objet et s'enfuit." }, fail: { damage: 3, text: 'Il vous jette une poudre irritante.' } },
        { id: 'aider', label: "Lui offrir de l'aide", stat: 'sag', dc: 10, success: { heal: 3, text: 'Reconnaissant, il partage ses provisions.' }, fail: { text: "Il se méfie et s'en va." } },
      ],
    },
  ],
  rest: [
    {
      id: 'campement', title: 'Un ancien campement',
      text: "Les restes d'un feu de camp. L'endroit semble calme.",
      choices: [
        { id: 'reposer', label: 'Se reposer', safe: true, success: { heal: 5, text: 'Vous reprenez des forces.' } },
        { id: 'fouiller', label: 'Fouiller les sacs abandonnés', stat: 'dex', dc: 10, success: { loot: 0.4, gold: [5, 15], text: 'Vous trouvez quelque chose.' }, fail: { damage: 2, text: 'Un scorpion se cachait dans un sac.' } },
      ],
    },
  ],
};

export const ROOM_TYPE_LABELS = {
  combat: 'Combat', trap: 'Piège', chest: 'Coffre', shrine: 'Autel', npc: 'Rencontre', rest: 'Repos', boss: 'Boss',
};
