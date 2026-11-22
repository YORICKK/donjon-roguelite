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
  // « Attaquer » : arme (FOR) ou sort (INT), selon le meilleur bonus du groupe.
  { id: 'attaque', label: 'Attaquer', stats: ['for', 'int'] },
  { id: 'sournois', label: 'Attaque sournoise (DD +2, dégâts ×1,5)', stat: 'dex', dcMod: 2, dmgMult: 1.5, notUndead: true },
  { id: 'repousser', label: 'Repousser les morts-vivants', stat: 'sag', undeadOnly: true, dmgMult: 1.5 },
  { id: 'defendre', label: "Lever la garde (bloque l'attaque)", stat: 'for', dcMod: -3, guard: true },
  { id: 'fuir', label: 'Fuir (pas de butin)', stat: 'dex', flee: true, noBoss: true },
];

// ---------------------------------------------------------------------------------------------
// Événements. Format d'un choix :
//   { id, label, stat, dc }        jet de d20 + meilleure stat du groupe contre le DD (+ bonus du niveau)
//   safe: true                     sans jet (toujours « success »)
//   class: 'mage'                  réservé à une classe présente et vivante (c'est elle qui agit)
//   requires: { gold, flag, notFlag, cursed, hurt, item }   sinon le choix est grisé ou masqué
//   cost: { gold, item }           payé au moment du choix
//   success / fail : effets
// Effets : text, damage (au héros qui agit), damageAll, heal (groupe), gold: [min, max], loot (probabilité),
//   lootBoost, xp, poison (héros qui agit), poisonAll, bless (tours), item (consommable ajouté au sac),
//   maxHp (+PV max à tous), refreshSkills, flag / unflag (fil rouge du run), curse, cleanse,
//   reveal (révèle les portes « inconnues » de la carte), next (enchaîne un autre événement dans la même salle),
//   companion (+ companionBoost) : un compagnon rejoint la collection (utilisable aux prochains runs).
// themes : biomes où l'événement peut apparaître (absent = partout). hidden : seulement via « next ».
// ---------------------------------------------------------------------------------------------
export const EVENTS = {
  trap: [
    {
      id: 'dalles_piegees', title: 'Dalles piégées',
      text: 'Le sol est couvert de dalles fissurées. Un déclic suspect résonne sous vos pieds.',
      choices: [
        { id: 'sauter', label: 'Sauter de dalle en dalle', stat: 'dex', dc: 11, success: { text: 'Vous traversez avec grâce.', xp: 1 }, fail: { damage: 4, text: 'Des pointes jaillissent du sol !' } },
        { id: 'analyser', label: 'Analyser le mécanisme', stat: 'int', dc: 12, success: { text: 'Vous repérez le motif sûr… et une pièce cachée.', loot: 0.3 }, fail: { damage: 5, text: 'Mauvaise dalle… des flèches partent des murs.' } },
        { id: 'foncer', label: 'Foncer tête baissée', stat: 'for', dc: 13, success: { text: 'Vous encaissez sans broncher.' }, fail: { damage: 6, text: 'Ça fait très mal.' } },
      ],
    },
    {
      id: 'gaz', title: 'Nappe de gaz verdâtre',
      text: "Une brume toxique stagne dans la salle. L'autre porte est à vingt pas.",
      choices: [
        { id: 'retenir', label: 'Retenir son souffle et courir', stat: 'for', dc: 11, success: { text: 'Vous ressortez en toussant, indemnes.' }, fail: { poisonAll: true, text: 'Le gaz vous brûle les poumons.' } },
        { id: 'prier', label: 'Prier pour une protection', stat: 'sag', dc: 12, success: { text: 'Une aura pure vous enveloppe.', bless: 2 }, fail: { poison: true, damage: 3, text: "Les dieux sont sourds aujourd'hui." } },
        { id: 'enflammer', label: '🔮 Brûler le gaz d’un sort', class: 'mage', stat: 'int', dc: 10, success: { text: 'WHOOSH ! Le gaz s’embrase et disparaît.', xp: 2 }, fail: { damageAll: 3, text: 'L’explosion vous roussit tous.' } },
      ],
    },
    {
      id: 'pont_corde', title: 'Le pont de corde',
      text: 'Un gouffre coupe la salle en deux. Un vieux pont de corde grince au-dessus du vide.',
      choices: [
        { id: 'traverser', label: 'Traverser prudemment', stat: 'dex', dc: 12, success: { text: 'Planche après planche, vous passez.', xp: 2 }, fail: { damage: 3, text: 'Une planche cède ! Vous tombez…', next: 'sous_le_pont' } },
        { id: 'consolider', label: 'Consolider le pont', stat: 'for', dc: 11, success: { text: 'Vous retendez les cordes. Le groupe traverse sans encombre.' }, fail: { damage: 2, text: 'La corde vous brûle les mains, mais tient.' } },
        { id: 'contourner', label: 'Chercher un autre passage', stat: 'int', dc: 13, success: { text: 'Une corniche longe le gouffre. Et un sac oublié y pend.', loot: 0.6 }, fail: { damageAll: 2, text: 'Une heure de détours dans le froid et l’humidité.' } },
      ],
    },
    {
      id: 'sous_le_pont', hidden: true, title: 'Au fond du gouffre',
      text: 'Vous atterrissez sur un tas d’ossements… et de pièces. Des siècles de voyageurs malchanceux.',
      choices: [
        { id: 'ramasser', label: 'Ramasser ce qui brille', safe: true, success: { gold: [15, 35], text: 'Vous remplissez vos poches avant de remonter.' } },
        { id: 'fouiller_os', label: 'Fouiller les squelettes', stat: 'sag', dc: 11, success: { loot: 1, text: 'Un aventurier serrait encore son bien le plus précieux.' }, fail: { poison: true, text: 'Un rat porteur de fièvre vous mord.' } },
      ],
    },
    {
      id: 'ossuaire', themes: ['crypt'], title: 'L’ossuaire instable',
      text: 'Les murs sont faits de crânes empilés. Le moindre bruit fait trembler l’édifice.',
      choices: [
        { id: 'silence', label: 'Avancer en silence', stat: 'dex', dc: 12, success: { text: 'Pas un os ne bouge.', xp: 2 }, fail: { damageAll: 3, text: 'Une avalanche d’os s’abat sur le groupe !' } },
        { id: 'etayer', label: 'Étayer la voûte', stat: 'for', dc: 12, success: { text: 'La voûte tient. Derrière un crâne, un anneau.', loot: 0.5 }, fail: { damage: 5, text: 'Le mur vous tombe dessus.' } },
        { id: 'apaiser', label: 'Prier pour les morts', stat: 'sag', dc: 11, success: { text: 'Un murmure de gratitude parcourt l’ossuaire.', bless: 3 }, fail: { text: 'Les morts restent indifférents.' } },
      ],
    },
    {
      id: 'eboulement', themes: ['mine'], title: 'Éboulement !',
      text: 'Le plafond craque. Des cailloux pleuvent. Le tunnel va s’effondrer.',
      choices: [
        { id: 'courir', label: 'Courir vers la sortie', stat: 'dex', dc: 12, success: { text: 'Vous plongez de l’autre côté juste à temps.' }, fail: { damageAll: 4, text: 'Les rochers vous rattrapent.' } },
        { id: 'retenir_poutre', label: 'Retenir la poutre maîtresse', stat: 'for', dc: 14, success: { text: 'Vous tenez la poutre le temps que tout le monde passe. Héroïque.', xp: 3 }, fail: { damage: 7, text: 'La poutre vous écrase l’épaule.' } },
        { id: 'abri', label: 'S’abriter sous le wagonnet', stat: 'int', dc: 11, success: { text: 'Bonne idée : le wagonnet encaisse tout. Il contenait du minerai.', gold: [10, 20] }, fail: { damage: 4, text: 'Le wagonnet bascule sur vous.' } },
      ],
    },
    {
      id: 'chariot_fou', themes: ['mine'], title: 'Le wagonnet fou',
      text: 'Un grondement monte des rails : un wagonnet lancé à pleine vitesse fonce vers vous !',
      choices: [
        { id: 'esquiver', label: 'Plonger sur le côté', stat: 'dex', dc: 11, success: { text: 'Le wagonnet passe en sifflant.' }, fail: { damage: 5, text: 'Il vous accroche au passage.' } },
        { id: 'aiguillage', label: 'Actionner l’aiguillage', stat: 'int', dc: 12, success: { text: 'Le wagonnet dévie et se fracasse contre une paroi… pleine de minerai.', gold: [12, 25], xp: 2 }, fail: { damageAll: 3, text: 'Mauvais levier !' } },
        { id: 'arreter', label: 'L’arrêter à mains nues', stat: 'for', dc: 15, success: { text: 'Impossible ? Pas pour vous. Le wagonnet contenait un coffre.', loot: 1, xp: 3 }, fail: { damage: 8, text: 'Ce n’était pas une bonne idée.' } },
      ],
    },
    {
      id: 'grisou', themes: ['mine'], title: 'Odeur de grisou',
      text: 'Une odeur douceâtre emplit la galerie. Vos torches crépitent dangereusement.',
      choices: [
        { id: 'eteindre', label: 'Éteindre les torches et avancer à tâtons', stat: 'sag', dc: 12, success: { text: 'Dans le noir, vos sens s’aiguisent.', xp: 2 }, fail: { damageAll: 2, text: 'Vous vous cognez partout.' } },
        { id: 'vite', label: 'Traverser au pas de course', stat: 'dex', dc: 13, success: { text: 'Vous sortez avant que ça ne saute.' }, fail: { damageAll: 5, text: 'BOUM ! La galerie s’embrase derrière vous.' } },
      ],
    },
    {
      id: 'cercle_invocation', themes: ['sanctum'], title: 'Le cercle d’invocation',
      text: 'Un cercle de runes pulse au sol. Une présence attend qu’on brise le sceau… ou qu’on le referme.',
      choices: [
        { id: 'refermer', label: 'Refermer le sceau', stat: 'int', dc: 13, success: { text: 'Le cercle s’éteint. Vous en tirez un savoir précieux.', xp: 4 }, fail: { damageAll: 4, text: 'Une décharge arcanique vous traverse.' } },
        { id: 'contourner_c', label: 'Le contourner sans le toucher', stat: 'dex', dc: 11, success: { text: 'Vous évitez la moindre rune.' }, fail: { curse: true, text: 'Votre pied effleure une rune… un froid s’insinue en vous.' } },
        { id: 'puiser', label: 'Puiser dans son énergie', stat: 'sag', dc: 14, success: { text: 'L’énergie vous régénère.', heal: 8, maxHp: 2 }, fail: { curse: true, damage: 4, text: 'L’énergie vous rejette et vous marque.' } },
      ],
    },
  ],

  chest: [
    {
      id: 'oeuf', themes: ['mine', 'sanctum'], title: 'Un œuf brûlant',
      text: 'Dans un nid de cendres, un œuf écailleux palpite de chaleur.',
      choices: [
        { id: 'couver', label: 'L’emporter avec précaution', stat: 'sag', dc: 13, success: { companion: true, companionBoost: 2, text: 'L’œuf éclot dans vos mains !' }, fail: { damage: 4, text: 'Trop chaud : il vous échappe et se brise.' } },
        { id: 'vendre_o', label: 'Le garder pour le revendre', safe: true, success: { gold: [25, 40], text: 'Un collectionneur en donnera un bon prix.' } },
      ],
    },
    {
      id: 'coffre_ferre', title: 'Un coffre ferré',
      text: 'Un lourd coffre bardé de fer trône au centre de la pièce. Sa serrure est complexe.',
      choices: [
        { id: 'crocheter', label: 'Crocheter la serrure', stat: 'dex', dc: 12, success: { loot: 1, gold: [10, 25], text: "Clic. Le coffre s'ouvre." }, fail: { poison: true, damage: 2, text: 'Une aiguille empoisonnée vous pique.' } },
        { id: 'forcer', label: 'Forcer le couvercle', stat: 'for', dc: 13, success: { loot: 1, gold: [8, 20], text: 'Le bois cède dans un craquement.' }, fail: { damage: 2, text: 'Vous vous écrasez les doigts.' } },
        { id: 'ignorer', label: 'Passer son chemin', safe: true, success: { text: 'Prudence est mère de sûreté.' } },
      ],
    },
    {
      id: 'mimique', title: 'Un coffre… qui respire ?',
      text: 'Un coffre doré semble légèrement se soulever, comme s’il respirait.',
      choices: [
        { id: 'examiner', label: "L'examiner de près", stat: 'int', dc: 12, success: { loot: 1, text: "C'était une mimique endormie ! Vous récupérez son trésor." }, fail: { damage: 5, text: 'La mimique vous mord !' } },
        { id: 'frapper', label: "Le frapper d'abord", stat: 'for', dc: 11, success: { loot: 1, xp: 2, text: 'La mimique meurt avant de se réveiller.' }, fail: { damage: 4, text: 'Elle se réveille, furieuse.' } },
        { id: 'ignorer', label: 'Reculer lentement', safe: true, success: { text: 'Vous laissez la chose dormir.' } },
      ],
    },
    {
      id: 'idole', title: 'L’idole dorée',
      text: 'Sur un piédestal, une idole en or massif vous fixe de ses yeux de rubis. Trop facile ?',
      choices: [
        { id: 'prendre', label: 'Prendre l’idole', safe: true, success: { gold: [40, 60], curse: true, text: 'Une fortune ! Mais un frisson glacé vous parcourt : vous êtes maudits (−1 à tous les jets).' } },
        { id: 'echanger', label: 'Remplacer l’idole par un sac de sable', stat: 'dex', dc: 14, success: { gold: [40, 60], xp: 3, text: 'Le mécanisme ne remarque rien. Le trésor est à vous, sans malédiction.' }, fail: { damageAll: 3, curse: true, text: 'Le piédestal se dérobe ! Des dards volent, et la malédiction frappe.' } },
        { id: 'laisser', label: 'Laisser l’idole tranquille', safe: true, success: { text: 'Certaines choses doivent rester où elles sont.' } },
      ],
    },
    {
      id: 'porte_scellee', title: 'La porte scellée',
      text: 'Une petite porte de bronze, couverte de symboles. Il manque une clé… ou une solution.',
      choices: [
        { id: 'enigme', label: 'Résoudre l’énigme gravée', stat: 'int', dc: 13, success: { text: 'La porte pivote sur une salle oubliée.', next: 'salle_oubliee' }, fail: { text: 'Le symbole ne réagit pas. Vous n’y comprenez rien.' } },
        { id: 'crocheter_p', label: '🗡️ Crocheter la serrure', class: 'voleur', stat: 'dex', dc: 11, success: { text: 'Un jeu d’enfant.', next: 'salle_oubliee' }, fail: { damage: 3, text: 'Une lame jaillit de la serrure.' } },
        { id: 'enfoncer', label: 'Enfoncer la porte', stat: 'for', dc: 15, success: { text: 'BAM ! La porte cède.', next: 'salle_oubliee' }, fail: { damage: 4, text: 'Le bronze ne bouge pas. Votre épaule, si.' } },
      ],
    },
    {
      id: 'salle_oubliee', hidden: true, title: 'La salle oubliée',
      text: 'Des étagères poussiéreuses, un coffre, et un livre ouvert sur un pupitre.',
      choices: [
        { id: 'coffre_o', label: 'Ouvrir le coffre', safe: true, success: { loot: 1, lootBoost: 1, text: 'Un objet de grande valeur !' } },
        { id: 'livre', label: 'Lire le livre', stat: 'int', dc: 10, success: { xp: 5, reveal: true, text: 'Le livre contient le plan du donjon. Les portes inconnues sont révélées !' }, fail: { text: 'L’encre est trop pâle.' } },
      ],
    },
    {
      id: 'tombe_profanee', themes: ['crypt'], title: 'La tombe du seigneur',
      text: 'Une dalle funéraire gravée d’un blason. Un seigneur fut enterré ici avec ses richesses.',
      choices: [
        { id: 'ouvrir_t', label: 'Desceller la dalle', stat: 'for', dc: 13, success: { loot: 1, gold: [15, 30], text: 'Bijoux, pièces… et un objet de famille.' }, fail: { damage: 4, text: 'La dalle vous retombe sur les doigts.' } },
        { id: 'respect', label: 'Rendre hommage et repartir', safe: true, success: { bless: 3, text: 'Une voix lointaine : « Allez en paix. » Vous vous sentez protégés.' } },
      ],
    },
    {
      id: 'filon', themes: ['mine'], title: 'Un filon d’or',
      text: 'Une veine dorée court le long de la paroi. Une pioche rouillée traîne au sol.',
      choices: [
        { id: 'miner', label: 'Miner le filon', stat: 'for', dc: 11, success: { gold: [20, 40], text: 'Les pépites tombent dans vos sacs.' }, fail: { damage: 3, text: 'La pioche rebondit et vous frappe.' } },
        { id: 'prudence', label: 'Extraire avec précision', stat: 'int', dc: 13, success: { gold: [35, 55], xp: 2, text: 'Une extraction parfaite : le filon entier est à vous.' }, fail: { damageAll: 3, text: 'Le filon était instable… éboulement.' } },
      ],
    },
    {
      id: 'reliquaire', themes: ['sanctum'], title: 'Le reliquaire',
      text: 'Une châsse de cristal violet contient une relique. Des runes de protection l’entourent.',
      choices: [
        { id: 'briser', label: 'Briser les protections', stat: 'int', dc: 14, success: { loot: 1, lootBoost: 1, text: 'Les runes s’éteignent. La relique est à vous.' }, fail: { damageAll: 4, text: 'Les protections explosent.' } },
        { id: 'benir', label: '✨ Bénir la châsse', class: 'clerc', stat: 'sag', dc: 11, success: { loot: 1, bless: 3, text: 'La châsse s’ouvre d’elle-même devant la foi.' }, fail: { text: 'Rien ne se passe.' } },
        { id: 'laisser_r', label: 'Ne pas y toucher', safe: true, success: { text: 'Vous continuez.' } },
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
        { id: 'purifier', label: 'Purifier la malédiction', requires: { cursed: true }, stat: 'sag', dc: 10, success: { cleanse: true, text: 'La malédiction se dissipe dans une lumière blanche.' }, fail: { text: 'La malédiction résiste.' } },
        { id: 'ignorer', label: 'Ne pas y toucher', safe: true, success: { text: 'Vous continuez.' } },
      ],
    },
    {
      id: 'fontaine', title: 'La fontaine trouble',
      text: 'Une fontaine murmure dans la pénombre. Son eau change de couleur à chaque instant.',
      choices: [
        { id: 'boire', label: 'Boire', safe: true, success: { text: 'Le monde vacille… une vision vous envahit.', next: 'vision' } },
        { id: 'remplir', label: 'Remplir une fiole', stat: 'int', dc: 11, success: { item: 'potion_soin', text: 'L’eau se stabilise dans la fiole : une potion de soin.' }, fail: { text: 'L’eau s’évapore aussitôt.' } },
        { id: 'piece', label: 'Jeter une pièce (5 or)', cost: { gold: 5 }, safe: true, success: { bless: 4, text: 'La pièce s’enfonce sans bruit. La chance vous sourit.' } },
      ],
    },
    {
      id: 'vision', hidden: true, title: 'Une vision',
      text: 'Vous voyez le donjon d’en haut, ses couloirs, ses pièges… et une silhouette qui vous observe.',
      choices: [
        { id: 'retenir_v', label: 'Retenir la carte', stat: 'int', dc: 10, success: { reveal: true, xp: 3, text: 'Vous gravez le plan dans votre mémoire : les portes inconnues sont révélées.' }, fail: { text: 'La vision s’efface trop vite.' } },
        { id: 'silhouette', label: 'Fixer la silhouette', stat: 'sag', dc: 12, success: { xp: 4, bless: 3, text: 'Elle vous sourit et vous bénit.' }, fail: { damageAll: 2, curse: true, text: 'Elle hurle. Vous vous réveillez glacés et maudits.' } },
      ],
    },
    {
      id: 'deesse', title: 'La statue de la déesse',
      text: 'Une statue aux bras ouverts. À ses pieds, une coupe d’offrandes à moitié pleine.',
      choices: [
        { id: 'offrande', label: 'Faire une offrande (15 or)', cost: { gold: 15 }, safe: true, success: { heal: 6, flag: 'faveur', cleanse: true, text: 'La statue s’illumine. La déesse veillera sur vous jusqu’au gardien.' } },
        { id: 'voler', label: 'Voler les offrandes', stat: 'dex', dc: 11, success: { gold: [15, 30], curse: true, text: 'Vous empochez les pièces… et la colère divine.' }, fail: { damage: 4, curse: true, text: 'La statue vous frappe de sa main de pierre.' } },
        { id: 'mediter', label: 'Méditer', stat: 'sag', dc: 12, success: { xp: 3, refreshSkills: true, text: 'L’esprit apaisé, vous retrouvez vos forces : compétences rechargées.' }, fail: { text: 'Impossible de faire le vide.' } },
      ],
    },
    {
      id: 'bibliotheque', themes: ['sanctum'], title: 'La bibliothèque interdite',
      text: 'Des grimoires enchaînés murmurent quand on passe. Certains savoirs ont un prix.',
      choices: [
        { id: 'lire', label: 'Lire un grimoire', stat: 'int', dc: 12, success: { xp: 6, text: 'Des secrets oubliés s’ouvrent à vous.' }, fail: { curse: true, damage: 3, text: 'Le grimoire vous mord l’esprit.' } },
        { id: 'emporter', label: 'Emporter un grimoire', stat: 'dex', dc: 13, success: { loot: 1, text: 'Vous libérez un livre de sa chaîne.' }, fail: { damageAll: 3, text: 'Les chaînes s’animent et fouettent le groupe.' } },
        { id: 'prier_b', label: 'Bénir les rayonnages', requires: { cursed: true }, stat: 'sag', dc: 12, success: { cleanse: true, xp: 2, text: 'Les livres se taisent ; votre malédiction s’éteint avec eux.' }, fail: { text: 'Les murmures redoublent.' } },
      ],
    },
    {
      id: 'miroir', themes: ['sanctum', 'crypt'], title: 'Le miroir d’obsidienne',
      text: 'Votre reflet dans le miroir sourit… alors que vous ne souriez pas.',
      choices: [
        { id: 'briser_m', label: 'Briser le miroir', stat: 'for', dc: 12, success: { xp: 3, text: 'Le reflet hurle et se disperse en éclats.' }, fail: { curse: true, text: 'Sept ans de malheur, au moins.' } },
        { id: 'parler', label: 'Parler au reflet', stat: 'sag', dc: 13, success: { maxHp: 3, heal: 3, text: '« Tu es plus fort que tu ne crois. » Vous vous sentez plus robustes.' }, fail: { damage: 4, text: 'Le reflet vous frappe à travers la glace.' } },
      ],
    },
  ],

  npc: [
    {
      id: 'animal_blesse', title: 'Un animal blessé',
      text: 'Un animal gémit, la patte prise dans un vieux piège à loup. Il vous regarde, méfiant.',
      choices: [
        { id: 'liberer_a', label: 'Ouvrir le piège doucement', stat: 'dex', dc: 11, success: { companion: true, xp: 2, text: 'L’animal se libère… et ne vous quitte plus.' }, fail: { damage: 3, text: 'Il prend peur, vous mord et s’enfuit.' } },
        { id: 'soigner_a', label: 'Soigner sa patte', stat: 'sag', dc: 12, success: { companion: true, companionBoost: 1, text: 'Soigné et rassuré, il vous adopte.' }, fail: { text: 'Il s’échappe en boitant.' } },
        { id: 'nourrir', label: 'Partager vos provisions (5 or)', cost: { gold: 5 }, safe: true, success: { companion: true, text: 'Un repas, et voilà un ami pour la vie.' } },
      ],
    },
    {
      id: 'marchand', title: 'Un marchand égaré',
      text: 'Un vieil homme couvert de sacoches vous fait signe. « Psst… un échange ? »',
      choices: [
        { id: 'negocier', label: 'Négocier', stat: 'int', dc: 11, success: { loot: 1, text: '« Marché conclu ! » Il vous tend un objet.' }, fail: { text: 'Il hausse les épaules et disparaît.' } },
        { id: 'intimider', label: "L'intimider", stat: 'for', dc: 12, success: { loot: 1, text: "Tremblant, il lâche un objet et s'enfuit." }, fail: { damage: 3, text: 'Il vous jette une poudre irritante.' } },
        { id: 'aider', label: "Lui offrir de l'aide", stat: 'sag', dc: 10, success: { heal: 3, item: 'potion_soin', text: 'Reconnaissant, il vous offre une potion.' }, fail: { text: "Il se méfie et s'en va." } },
      ],
    },
    {
      id: 'prisonnier', title: 'Le prisonnier enchaîné',
      text: 'Un guerrier amaigri est enchaîné au mur. « Libérez-moi… je connais le gardien de ce donjon. »',
      choices: [
        { id: 'liberer', label: 'Briser ses chaînes', stat: 'for', dc: 12, success: { flag: 'allie', xp: 2, text: '« Merci. Quand vous affronterez le gardien, je serai là. »' }, fail: { damage: 3, text: 'Les chaînes résistent et vous blessent.' } },
        { id: 'crocheter_c', label: '🗡️ Crocheter les fers', class: 'voleur', stat: 'dex', dc: 10, success: { flag: 'allie', xp: 2, text: '« Rapide et discret. Je me souviendrai de vous. »' }, fail: { text: 'La serrure est trop rouillée.' } },
        { id: 'interroger', label: 'L’interroger sans le libérer', stat: 'int', dc: 11, success: { reveal: true, text: 'Il vous décrit le plan du donjon : les portes inconnues sont révélées.' }, fail: { text: 'Il refuse de parler.' } },
      ],
    },
    {
      id: 'joueur', title: 'Le joueur de dés',
      text: 'Un gobelin édenté secoue des dés dans un gobelet. « Une partie ? Mise : 10 pièces. »',
      choices: [
        { id: 'jouer', label: 'Jouer (10 or)', cost: { gold: 10 }, stat: 'sag', dc: 12, success: { gold: [22, 30], text: 'Double six ! Le gobelin grimace en payant.' }, fail: { text: 'Perdu. Le gobelin ricane.' } },
        { id: 'tricher', label: 'Tricher (10 or)', cost: { gold: 10 }, stat: 'dex', dc: 13, success: { gold: [30, 45], xp: 1, text: 'Vos dés pipés font merveille.' }, fail: { damage: 4, text: 'Pris la main dans le sac ! Le gobelin vous mord.' } },
        { id: 'partir', label: 'Refuser poliment', safe: true, success: { text: '« Froussards ! »' } },
      ],
    },
    {
      id: 'blesse', title: 'Un aventurier blessé',
      text: 'Un explorateur gît contre un mur, une flèche dans la jambe. « Aidez-moi… je vous en prie. »',
      choices: [
        { id: 'potion', label: 'Lui donner une potion', requires: { item: 'potion_soin' }, cost: { item: 'potion_soin' }, safe: true, success: { loot: 1, lootBoost: 1, xp: 2, text: 'Il se relève et vous offre son trésor le plus précieux.' } },
        { id: 'soigner', label: 'Soigner sa blessure', stat: 'sag', dc: 12, success: { loot: 0.7, xp: 2, text: 'Il vous remercie et vous donne ce qu’il peut.' }, fail: { text: 'Il est trop faible. Vous le laissez se reposer.' } },
        { id: 'depouiller', label: 'Le dépouiller', stat: 'dex', dc: 10, success: { gold: [15, 25], curse: true, text: 'Vous prenez sa bourse. Son regard vous maudit.' }, fail: { damage: 3, text: 'Il a encore de la force dans les bras.' } },
      ],
    },
    {
      id: 'cartographe', title: 'Le cartographe perdu',
      text: 'Une femme griffonne sur un parchemin à la lueur d’une bougie. « Vous venez d’où ? Racontez-moi ! »',
      choices: [
        { id: 'echanger_c', label: 'Échanger vos découvertes', stat: 'int', dc: 10, success: { reveal: true, xp: 2, text: 'En échange, elle complète votre carte : les portes inconnues sont révélées.' }, fail: { text: 'Vos souvenirs sont trop confus pour l’aider.' } },
        { id: 'acheter_c', label: 'Acheter sa carte (15 or)', cost: { gold: 15 }, safe: true, success: { reveal: true, text: 'Les portes inconnues sont révélées.' } },
      ],
    },
    {
      id: 'herboriste', title: 'L’herboriste',
      text: 'Un vieil homme cueille des champignons luminescents. « Des remèdes ? Je ne prends pas cher. »',
      choices: [
        { id: 'acheter_h', label: 'Acheter une potion (8 or)', cost: { gold: 8 }, safe: true, success: { item: 'potion_soin', text: 'Il vous tend une fiole verte.' } },
        { id: 'cueillir', label: 'L’aider à cueillir', stat: 'sag', dc: 11, success: { item: 'potion_soin', heal: 3, text: 'Pour vous remercier, il vous donne un remède.' }, fail: { poison: true, text: 'Vous touchez le mauvais champignon.' } },
        { id: 'antidote', label: 'Guérir le poison', requires: { poisoned: true }, safe: true, success: { heal: 2, cure: true, text: 'Il applique un baume : plus de poison.' } },
      ],
    },
    {
      id: 'necromancien', themes: ['crypt', 'sanctum'], title: 'Le nécromancien',
      text: 'Un homme en robe noire relève des os avec patience. « Vous dérangez mon travail. »',
      choices: [
        { id: 'combattre_n', label: 'Le frapper avant qu’il n’incante', stat: 'for', dc: 13, success: { loot: 1, xp: 4, text: 'Il s’écroule. Son grimoire est à vous.' }, fail: { damageAll: 4, text: 'Une vague d’énergie nécrotique vous frappe.' } },
        { id: 'contre_sort', label: '🔮 Contrer son sortilège', class: 'mage', stat: 'int', dc: 12, success: { loot: 1, xp: 5, text: 'Votre contre-sort retourne sa magie contre lui.' }, fail: { damage: 5, curse: true, text: 'Son sort vous marque.' } },
        { id: 'marchander_n', label: 'Négocier un passage', stat: 'int', dc: 12, success: { xp: 2, text: '« Passez. Et ne revenez pas. »' }, fail: { poisonAll: true, text: 'Il souffle une poussière d’os sur vous.' } },
      ],
    },
    {
      id: 'mineurs', themes: ['mine'], title: 'Les mineurs fantômes',
      text: 'Des silhouettes translucides piochent sans fin. L’une d’elles se tourne : « On ne trouve plus la sortie… »',
      choices: [
        { id: 'guider', label: 'Les guider vers la lumière', stat: 'sag', dc: 12, success: { bless: 4, xp: 3, text: 'Les fantômes s’apaisent et vous bénissent en disparaissant.' }, fail: { damageAll: 2, text: 'Ils s’agitent et vous frôlent, glacials.' } },
        { id: 'tresor_m', label: 'Demander où est leur paye', stat: 'int', dc: 11, success: { gold: [25, 40], text: '« Dans la vieille cassette, sous les rails. » Elle y est encore.' }, fail: { text: 'Ils ne comprennent pas la question.' } },
      ],
    },
    {
      id: 'apprenti', themes: ['sanctum'], title: 'L’apprenti de la Liche',
      text: 'Un jeune mage terrifié tient un parchemin. « Il… il me tuera si je ne lui obéis pas. »',
      choices: [
        { id: 'convaincre', label: 'Le convaincre de fuir', stat: 'sag', dc: 12, success: { flag: 'allie', xp: 2, text: '« Je vous rendrai la pareille face à lui. » Il s’éclipse.' }, fail: { text: 'Il a trop peur pour bouger.' } },
        { id: 'parchemin', label: 'Lui prendre son parchemin', stat: 'dex', dc: 12, success: { item: 'parchemin_fuite', xp: 2, text: 'Un parchemin de fuite ! Pratique.' }, fail: { damage: 4, text: 'Il vous lance un éclair par réflexe.' } },
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
    {
      id: 'source', title: 'La source chaude',
      text: 'Une vapeur douce s’élève d’un bassin naturel. L’eau est tiède et claire.',
      choices: [
        { id: 'baigner', label: 'S’y baigner', safe: true, success: { heal: 7, cure: true, text: 'Les muscles se détendent, le poison s’en va.' } },
        { id: 'veiller', label: 'Se baigner à tour de rôle en montant la garde', stat: 'sag', dc: 10, success: { heal: 9, cure: true, xp: 1, text: 'Un repos parfait.' }, fail: { heal: 4, text: 'Des bruits vous empêchent de vous détendre vraiment.' } },
      ],
    },
    {
      id: 'barde', title: 'Le barde solitaire',
      text: 'Un barde accorde son luth près d’un feu. « Asseyez-vous ! Une chanson pour la route ? »',
      choices: [
        { id: 'ecouter', label: 'Écouter sa ballade', safe: true, success: { heal: 3, bless: 3, text: 'Une ballade héroïque : vous voilà gonflés de courage.' } },
        { id: 'chanter', label: 'Chanter avec lui', stat: 'sag', dc: 12, success: { heal: 5, bless: 4, xp: 2, text: 'Vos voix résonnent dans tout le donjon.' }, fail: { text: 'Le barde grimace poliment.' } },
        { id: 'payer_b', label: 'Lui payer à boire (5 or)', cost: { gold: 5 }, safe: true, success: { reveal: true, heal: 2, text: 'Éméché, il vous raconte tout ce qu’il sait des couloirs : portes inconnues révélées.' } },
      ],
    },
    {
      id: 'champignons', themes: ['mine', 'crypt'], title: 'La grotte aux champignons',
      text: 'Des champignons phosphorescents tapissent la grotte. Ils sentent étonnamment bon.',
      choices: [
        { id: 'manger', label: 'Goûter les champignons', stat: 'sag', dc: 11, success: { heal: 8, maxHp: 1, text: 'Délicieux et revigorant !' }, fail: { poisonAll: true, text: 'Il ne fallait pas.' } },
        { id: 'dormir', label: 'Dormir à l’écart', safe: true, success: { heal: 4, text: 'Un sommeil sans rêves.' } },
      ],
    },
  ],
};

export const ROOM_TYPE_LABELS = {
  combat: 'Combat', trap: 'Piège', chest: 'Coffre', shrine: 'Autel', npc: 'Rencontre', rest: 'Repos', boss: 'Boss',
  elite: 'Élite', shop: 'Marchand', entrance: 'Entrée',
};
