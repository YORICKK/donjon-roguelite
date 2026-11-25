// Objets conservés entre les parties. bonus : stats (for/dex/int/sag), hp (PV max), dmg (dégâts).
// tier : niveau de donjon minimum où l'objet peut tomber. Les tiers élevés justifient
// de farmer les premiers niveaux pour survivre aux suivants.
import { TILES } from './wheel.js';

export const RARITY = {
  commun: { label: 'Commun', color: '#bdc3c7', rank: 0 },
  rare: { label: 'Rare', color: '#3498db', rank: 1 },
  epique: { label: 'Épique', color: '#9b59b6', rank: 2 },
  legendaire: { label: 'Légendaire', color: '#e67e22', rank: 3 },
};

export const ITEMS = {
  dague_rouillee: { name: 'Dague rouillée', icon: '🔪', rarity: 'commun', tier: 1, bonus: { dmg: 1 } },
  bouclier_bois: { name: 'Bouclier en bois', icon: '🛡️', rarity: 'commun', tier: 1, bonus: { hp: 3 } },
  bottes_cuir: { name: 'Bottes de cuir', icon: '🥾', rarity: 'commun', tier: 1, bonus: { dex: 1 } },
  amulette_os: { name: 'Amulette en os', icon: '📿', rarity: 'commun', tier: 1, bonus: { sag: 1 } },
  gantelets_fer: { name: 'Gantelets de fer', icon: '🧤', rarity: 'rare', tier: 1, bonus: { for: 1, hp: 2 } },
  grimoire_use: { name: 'Grimoire usé', icon: '📕', rarity: 'rare', tier: 1, bonus: { int: 1, dmg: 1 } },
  anneau_vigueur: { name: 'Anneau de vigueur', icon: '💍', rarity: 'rare', tier: 2, bonus: { hp: 6 } },
  epee_runique: { name: 'Épée runique', icon: '⚔️', rarity: 'epique', tier: 2, bonus: { for: 2, dmg: 3 } },
  cape_ombre: { name: "Cape d'ombre", icon: '🧥', rarity: 'epique', tier: 2, bonus: { dex: 2, hp: 2 } },
  baton_archimage: { name: "Bâton d'archimage", icon: '🪄', rarity: 'legendaire', tier: 3, bonus: { int: 3, dmg: 4 } },
  couronne_liche: { name: 'Couronne de la liche', icon: '👑', rarity: 'legendaire', tier: 3, bonus: { sag: 2, int: 2, hp: 4 } },

  // ---------- Compagnons : conservés comme des objets, un seul par joueur au début d'un run ----------
  // power : effet en jeu (voir engine.js) ; model : nœud du fichier companions.glb.
  pet_ecureuil: {
    name: 'Écureuil', icon: '🐿️', rarity: 'commun', tier: 1, companion: true, model: 'pet_ecureuil', power: 'useless',
    desc: 'Totalement inutile. Mais tellement mignon.',
  },
  pet_chien: {
    name: 'Chien fidèle', icon: '🐕', rarity: 'commun', tier: 1, companion: true, model: 'pet_chien', power: 'dig',
    desc: 'Flaire les trésors : déterre parfois de l’or après une salle, +1 SAG.', bonus: { sag: 1 },
  },
  pet_loup: {
    name: 'Loup gris', icon: '🐺', rarity: 'rare', tier: 1, companion: true, model: 'pet_loup', power: 'bite',
    desc: 'Mord l’ennemi à chaque tour de combat (1 chance sur 3).',
  },
  pet_ours: {
    name: 'Ours brun', icon: '🐻', rarity: 'epique', tier: 2, companion: true, model: 'pet_ours', power: 'guard',
    desc: 'Protège son maître : −2 dégâts sur chaque coup reçu, +4 PV.', bonus: { hp: 4 },
  },
  pet_dragon: {
    name: 'Dragonnet', icon: '🐉', rarity: 'legendaire', tier: 3, companion: true, model: 'pet_dragon', power: 'breath',
    desc: 'Souffle du feu sur chaque ennemi rencontré (2d6 + 2 par niveau).',
  },
};

// ---------- Variantes chromatiques des compagnons ----------
// Chaque compagnon existe aussi en version « chromatique », bien plus flashy, obtenue 1 fois sur 10.
// Même pouvoir ; seul l'aspect change. look : teinte imposée (0-1), saturation, luminosité, lueur, étincelles.
export const SHINY_CHANCE = 0.1;
const SHINY_LOOKS = {
  pet_ecureuil: { label: 'doré', hue: 0.13, sat: 1, light: 1.35, glow: 0xffc030, sparkle: 0xffe27a },
  pet_chien: { label: 'rose bonbon', hue: 0.9, sat: 0.95, light: 1.25, glow: 0xff3fa8, sparkle: 0xff9bd8 },
  pet_loup: { label: 'arctique', hue: 0.54, sat: 0.85, light: 1.7, glow: 0x30d8ff, sparkle: 0xaef4ff },
  pet_ours: { label: 'cosmique', hue: 0.76, sat: 0.9, light: 1.3, glow: 0x9b4dff, sparkle: 0xd2a8ff },
  pet_dragon: { label: 'émeraude', hue: 0.37, sat: 1, light: 1.25, glow: 0x2dff7a, sparkle: 0xb6ffcf },
};
for (const [id, look] of Object.entries(SHINY_LOOKS)) {
  const base = ITEMS[id];
  ITEMS[`${id}_shiny`] = {
    ...base, name: `${base.name} ${look.label}`, shiny: true, variantOf: id, look,
    desc: `✨ Variante chromatique (1 chance sur 10). ${base.desc}`,
  };
}

// ---------- Tuiles de roue : conservées comme des objets (voir data/wheel.js) ----------
for (const [id, t] of Object.entries(TILES)) if (!t.starter) ITEMS[id] = t;

export const MAX_EQUIPPED = 2;
/** Objet d'équipement (ni compagnon ni tuile de roue). */
export const isGear = (id) => !!ITEMS[id] && !ITEMS[id].companion && !ITEMS[id].tile;
export const isCompanion = (id) => !!ITEMS[id]?.companion;

export function describeBonus(bonus = {}) {
  const labels = { for: 'FOR', dex: 'DEX', int: 'INT', sag: 'SAG', hp: 'PV', dmg: 'Dégâts' };
  return Object.entries(bonus).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${labels[k] || k}`).join(', ');
}
