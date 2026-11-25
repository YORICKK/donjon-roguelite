// Animations des personnages (héros, ennemis, PNJ).
//
// Les modèles Blender sont articulés en pièces rigides : chaque articulation est un nœud nommé
// « <modèle>__<articulation> » (ex. hero_guerrier__arm_R). Au chargement, on ne garde que le
// suffixe (arm_R) pour que les mêmes clips servent à tous les modèles.
//
// Humanoïde : hips > torso > head, arm_L/arm_R > forearm_L/forearm_R > hand_L/hand_R ;
//             hips > leg_L/leg_R > shin_L/shin_R   (les modèles en robe n'ont pas de jambes)
// Quadrupède (rat, compagnons) : body > head, tail, leg_FL, leg_FR, leg_BL, leg_BR (+ wing_L, wing_R pour le dragonnet)
//
// Repère three.js : Y en haut, le personnage regarde vers +Z.
//   rotation X négative = lever un bras / une jambe vers l'avant ; X positive sur torse = pencher en avant.
import * as THREE from 'three';

const D = Math.PI / 180;

/** Clips décrits par des clés : [temps (s), rotX°, rotY°, rotZ°, (dx, dy, dz) en m]. */
const HUMANOID = {
  idle: {
    loop: true, duration: 2.4,
    torso: [[0, 0, 0, 0], [1.2, 3, 0, 0], [2.4, 0, 0, 0]],
    head: [[0, 0, 0, 0], [1.2, -2, 4, 0], [2.4, 0, 0, 0]],
    arm_L: [[0, 0, 0, 4], [1.2, -3, 0, 7], [2.4, 0, 0, 4]],
    arm_R: [[0, -8, 0, -4], [1.2, -11, 0, -7], [2.4, -8, 0, -4]],
    forearm_R: [[0, -20, 0, 0], [2.4, -20, 0, 0]],
    hips: [[0, 0, 0, 0, 0, 0, 0], [1.2, 0, 0, 0, 0, -0.015, 0], [2.4, 0, 0, 0, 0, 0, 0]],
  },
  walk: {
    loop: true, duration: 0.8,
    leg_L: [[0, -28, 0, 0], [0.4, 24, 0, 0], [0.8, -28, 0, 0]],
    leg_R: [[0, 24, 0, 0], [0.4, -28, 0, 0], [0.8, 24, 0, 0]],
    shin_L: [[0, 0, 0, 0], [0.2, 0, 0, 0], [0.5, 40, 0, 0], [0.8, 0, 0, 0]],
    shin_R: [[0, 40, 0, 0], [0.1, 0, 0, 0], [0.6, 0, 0, 0], [0.8, 40, 0, 0]],
    arm_L: [[0, 22, 0, 5], [0.4, -22, 0, 5], [0.8, 22, 0, 5]],
    arm_R: [[0, -22, 0, -5], [0.4, 22, 0, -5], [0.8, -22, 0, -5]],
    torso: [[0, 4, 4, 0], [0.4, 4, -4, 0], [0.8, 4, 4, 0]],
    hips: [[0, 0, 0, 0, 0, 0, 0], [0.2, 0, 0, 0, 0, 0.04, 0], [0.4, 0, 0, 0, 0, 0, 0], [0.6, 0, 0, 0, 0, 0.04, 0], [0.8, 0, 0, 0, 0, 0, 0]],
  },
  attack: { // coup d'arme lourd : armer au-dessus de la tête, frapper en avançant
    duration: 1.0,
    arm_R: [[0, -8, 0, -4], [0.35, -165, 0, -15], [0.55, -45, 0, 10], [0.75, -40, 0, 5], [1.0, -8, 0, -4]],
    forearm_R: [[0, -20, 0, 0], [0.35, -60, 0, 0], [0.55, -5, 0, 0], [1.0, -20, 0, 0]],
    arm_L: [[0, 0, 0, 4], [0.35, -40, 0, 20], [0.55, 10, 0, 10], [1.0, 0, 0, 4]],
    torso: [[0, 0, 0, 0], [0.35, -12, -25, 0], [0.55, 22, 20, 0], [0.75, 15, 10, 0], [1.0, 0, 0, 0]],
    head: [[0, 0, 0, 0], [0.35, -6, 10, 0], [0.55, 8, -10, 0], [1.0, 0, 0, 0]],
    leg_L: [[0, 0, 0, 0], [0.45, -30, 0, 0], [0.75, -25, 0, 0], [1.0, 0, 0, 0]],
    leg_R: [[0, 0, 0, 0], [0.45, 20, 0, 0], [0.75, 15, 0, 0], [1.0, 0, 0, 0]],
    hips: [[0, 0, 0, 0, 0, 0, 0], [0.35, 0, 0, 0, 0, 0, -0.1], [0.55, 0, 0, 0, 0, -0.08, 0.55], [0.75, 0, 0, 0, 0, -0.06, 0.5], [1.0, 0, 0, 0, 0, 0, 0]],
  },
  stab: { // deux estocades rapides
    duration: 0.8,
    arm_R: [[0, -8, 0, -4], [0.15, -30, 0, -20], [0.25, -85, 0, 0], [0.38, -30, 0, -20], [0.5, -88, 0, 5], [0.8, -8, 0, -4]],
    forearm_R: [[0, -20, 0, 0], [0.15, -90, 0, 0], [0.25, -5, 0, 0], [0.38, -90, 0, 0], [0.5, -5, 0, 0], [0.8, -20, 0, 0]],
    arm_L: [[0, 0, 0, 4], [0.25, -70, 0, -10], [0.5, -80, 0, -5], [0.8, 0, 0, 4]],
    torso: [[0, 0, 0, 0], [0.25, 18, -15, 0], [0.5, 20, 15, 0], [0.8, 0, 0, 0]],
    hips: [[0, 0, 0, 0, 0, 0, 0], [0.25, 0, 0, 0, 0, -0.1, 0.45], [0.5, 0, 0, 0, 0, -0.12, 0.6], [0.8, 0, 0, 0, 0, 0, 0]],
  },
  cast: { // incantation : bras levés puis projetés vers l'avant
    duration: 1.2,
    arm_R: [[0, -8, 0, -4], [0.45, -150, 0, -25], [0.65, -150, 0, -25], [0.8, -85, 0, -5], [1.2, -8, 0, -4]],
    arm_L: [[0, 0, 0, 4], [0.45, -150, 0, 25], [0.65, -150, 0, 25], [0.8, -85, 0, 5], [1.2, 0, 0, 4]],
    forearm_R: [[0, -20, 0, 0], [0.45, -10, 0, 0], [0.8, 0, 0, 0], [1.2, -20, 0, 0]],
    forearm_L: [[0, 0, 0, 0], [0.45, -10, 0, 0], [0.8, 0, 0, 0], [1.2, 0, 0, 0]],
    torso: [[0, 0, 0, 0], [0.45, -14, 0, 0], [0.8, 14, 0, 0], [1.2, 0, 0, 0]],
    head: [[0, 0, 0, 0], [0.45, -18, 0, 0], [0.8, 6, 0, 0], [1.2, 0, 0, 0]],
    hips: [[0, 0, 0, 0, 0, 0, 0], [0.45, 0, 0, 0, 0, 0.06, 0], [0.8, 0, 0, 0, 0, 0, 0.15], [1.2, 0, 0, 0, 0, 0, 0]],
  },
  pray: { // prière / soin : bras ouverts vers le ciel
    duration: 1.4,
    arm_R: [[0, -8, 0, -4], [0.5, -160, 0, -35], [1.0, -160, 0, -35], [1.4, -8, 0, -4]],
    arm_L: [[0, 0, 0, 4], [0.5, -160, 0, 35], [1.0, -160, 0, 35], [1.4, 0, 0, 4]],
    head: [[0, 0, 0, 0], [0.5, -30, 0, 0], [1.0, -30, 0, 0], [1.4, 0, 0, 0]],
    torso: [[0, 0, 0, 0], [0.5, -10, 0, 0], [1.0, -10, 0, 0], [1.4, 0, 0, 0]],
  },
  hit: { // encaisser un coup
    duration: 0.55,
    torso: [[0, 0, 0, 0], [0.1, -22, 8, 0], [0.55, 0, 0, 0]],
    head: [[0, 0, 0, 0], [0.1, -25, -10, 0], [0.55, 0, 0, 0]],
    arm_L: [[0, 0, 0, 4], [0.1, -30, 0, 30], [0.55, 0, 0, 4]],
    arm_R: [[0, -8, 0, -4], [0.1, -35, 0, -30], [0.55, -8, 0, -4]],
    hips: [[0, 0, 0, 0, 0, 0, 0], [0.1, 0, 0, 0, 0, 0, -0.25], [0.55, 0, 0, 0, 0, 0, 0]],
  },
  death: { // chute en arrière, reste au sol
    duration: 1.3, clamp: true,
    hips: [[0, 0, 0, 0, 0, 0, 0], [0.25, -10, 0, 5, 0, -0.1, -0.1], [0.8, -85, 0, 10, 0, -0.62, -0.5], [1.0, -80, 0, 10, 0, -0.66, -0.55], [1.3, -88, 0, 10, 0, -0.7, -0.55]],
    torso: [[0, 0, 0, 0], [0.25, 15, 0, 0], [0.8, -5, 0, 0], [1.3, 0, 0, 0]],
    head: [[0, 0, 0, 0], [0.8, -20, 20, 0], [1.3, -10, 30, 0]],
    arm_L: [[0, 0, 0, 4], [0.5, -100, 0, 40], [1.3, -160, 0, 50]],
    arm_R: [[0, -8, 0, -4], [0.5, -100, 0, -40], [1.3, -150, 0, -60]],
    leg_L: [[0, 0, 0, 0], [0.5, -20, 0, 0], [1.3, -10, 0, 5]],
    leg_R: [[0, 0, 0, 0], [0.5, -35, 0, 0], [1.3, -5, 0, -5]],
    shin_L: [[0, 0, 0, 0], [0.5, 40, 0, 0], [1.3, 10, 0, 0]],
  },
  cheer: {
    duration: 1.2,
    arm_R: [[0, -8, 0, -4], [0.3, -170, 0, -20], [0.6, -150, 0, -20], [0.9, -170, 0, -20], [1.2, -8, 0, -4]],
    arm_L: [[0, 0, 0, 4], [0.3, -170, 0, 20], [0.6, -150, 0, 20], [0.9, -170, 0, 20], [1.2, 0, 0, 4]],
    hips: [[0, 0, 0, 0, 0, 0, 0], [0.3, 0, 0, 0, 0, 0.18, 0], [0.45, 0, 0, 0, 0, 0, 0], [0.75, 0, 0, 0, 0, 0.18, 0], [0.9, 0, 0, 0, 0, 0, 0], [1.2, 0, 0, 0, 0, 0, 0]],
    head: [[0, 0, 0, 0], [0.3, -20, 0, 0], [1.2, 0, 0, 0]],
  },
};

const QUADRUPED = {
  idle: {
    loop: true, duration: 1.6,
    body: [[0, 0, 0, 0, 0, 0, 0], [0.8, 2, 0, 0, 0, 0.02, 0], [1.6, 0, 0, 0, 0, 0, 0]],
    head: [[0, 0, -10, 0], [0.4, 8, 10, 0], [0.8, 0, 15, 0], [1.2, 6, -12, 0], [1.6, 0, -10, 0]],
    tail: [[0, 0, -20, 0], [0.8, 0, 20, 0], [1.6, 0, -20, 0]],
    // ailes (dragonnet) au sol : repliées le long du corps, qui « respirent »
    wing_L: [[0, 0, 65, -25], [0.8, 0, 60, -18], [1.6, 0, 65, -25]],
    wing_R: [[0, 0, -65, 25], [0.8, 0, -60, 18], [1.6, 0, -65, 25]],
  },
  walk: {
    loop: true, duration: 0.5,
    leg_FL: [[0, -30, 0, 0], [0.25, 30, 0, 0], [0.5, -30, 0, 0]],
    leg_BR: [[0, -30, 0, 0], [0.25, 30, 0, 0], [0.5, -30, 0, 0]],
    leg_FR: [[0, 30, 0, 0], [0.25, -30, 0, 0], [0.5, 30, 0, 0]],
    leg_BL: [[0, 30, 0, 0], [0.25, -30, 0, 0], [0.5, 30, 0, 0]],
    tail: [[0, 0, -15, 0], [0.25, 0, 15, 0], [0.5, 0, -15, 0]],
    wing_L: [[0, 0, 62, -22], [0.25, 0, 66, -26], [0.5, 0, 62, -22]],
    wing_R: [[0, 0, -62, 22], [0.25, 0, -66, 26], [0.5, 0, -62, 22]],
  },
  fly: { // vol stationnaire (dragonnet) : pattes repliées, battements amples
    loop: true, duration: 0.7,
    body: [[0, -6, 0, 0, 0, 0, 0], [0.35, -3, 0, 0, 0, 0.06, 0], [0.7, -6, 0, 0, 0, 0, 0]],
    head: [[0, -12, 0, 0], [0.35, -8, 6, 0], [0.7, -12, 0, 0]],
    leg_FL: [[0, 50, 0, 0], [0.7, 50, 0, 0]], leg_FR: [[0, 50, 0, 0], [0.7, 50, 0, 0]],
    leg_BL: [[0, 70, 0, 0], [0.7, 70, 0, 0]], leg_BR: [[0, 70, 0, 0], [0.7, 70, 0, 0]],
    tail: [[0, -10, -12, 0], [0.35, -5, 12, 0], [0.7, -10, -12, 0]],
    wing_L: [[0, 0, 10, 40], [0.35, 0, 0, -35], [0.7, 0, 10, 40]],
    wing_R: [[0, 0, -10, -40], [0.35, 0, 0, 35], [0.7, 0, -10, -40]],
  },
  attack: { // morsure : bond en avant
    duration: 0.8,
    body: [[0, 0, 0, 0, 0, 0, 0], [0.25, -12, 0, 0, 0, 0.05, -0.15], [0.45, 10, 0, 0, 0, 0.25, 0.9], [0.6, 5, 0, 0, 0, 0.05, 0.8], [0.8, 0, 0, 0, 0, 0, 0]],
    head: [[0, 0, 0, 0], [0.25, -25, 0, 0], [0.45, 20, 0, 0], [0.8, 0, 0, 0]],
    leg_FL: [[0, 0, 0, 0], [0.45, -60, 0, 0], [0.8, 0, 0, 0]],
    leg_FR: [[0, 0, 0, 0], [0.45, -60, 0, 0], [0.8, 0, 0, 0]],
    leg_BL: [[0, 0, 0, 0], [0.45, 50, 0, 0], [0.8, 0, 0, 0]],
    leg_BR: [[0, 0, 0, 0], [0.45, 50, 0, 0], [0.8, 0, 0, 0]],
    wing_L: [[0, 0, 0, 0], [0.25, 0, 0, 45], [0.45, 0, 0, -35], [0.8, 0, 0, 0]],
    wing_R: [[0, 0, 0, 0], [0.25, 0, 0, -45], [0.45, 0, 0, 35], [0.8, 0, 0, 0]],
  },
  hit: {
    duration: 0.5,
    body: [[0, 0, 0, 0, 0, 0, 0], [0.1, -10, 15, 0, 0, 0.1, -0.3], [0.5, 0, 0, 0, 0, 0, 0]],
    head: [[0, 0, 0, 0], [0.1, -30, 0, 0], [0.5, 0, 0, 0]],
  },
  death: {
    duration: 1.0, clamp: true,
    body: [[0, 0, 0, 0, 0, 0, 0], [0.3, 0, 0, 40, 0, 0.15, 0], [0.7, 0, 0, 170, 0, 0.0, 0], [1.0, 0, 0, 175, 0, 0.0, 0]],
    leg_FL: [[0, 0, 0, 0], [1.0, -40, 0, 0]], leg_FR: [[0, 0, 0, 0], [1.0, 30, 0, 0]],
    leg_BL: [[0, 0, 0, 0], [1.0, 40, 0, 0]], leg_BR: [[0, 0, 0, 0], [1.0, -30, 0, 0]],
  },
};
QUADRUPED.cast = QUADRUPED.attack;
QUADRUPED.stab = QUADRUPED.attack;
for (const k of ['cast', 'stab', 'pray', 'cheer']) if (!HUMANOID[k]) HUMANOID[k] = HUMANOID.attack;

/** Raccourcit les noms de nœuds « modele__joint » en « joint ». */
export function normalizeJointNames(root) {
  root.traverse((o) => {
    const i = o.name.indexOf('__');
    if (i > 0) o.name = o.name.slice(i + 2);
  });
}

function buildClip(name, def, root) {
  const tracks = [];
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (const [joint, keys] of Object.entries(def)) {
    if (!Array.isArray(keys)) continue;
    const node = root.getObjectByName(joint);
    if (!node) continue;
    const rest = node.userData.restQ || (node.userData.restQ = node.quaternion.clone());
    const restP = node.userData.restP || (node.userData.restP = node.position.clone());
    const times = keys.map((k) => k[0]);
    const qv = [];
    for (const k of keys) {
      q.setFromEuler(euler.set(k[1] * D, k[2] * D, k[3] * D, 'YXZ'));
      q.premultiply(rest).toArray(qv, qv.length);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, qv));
    if (keys.some((k) => k.length > 4)) {
      const pv = [];
      for (const k of keys) pv.push(restP.x + (k[4] || 0), restP.y + (k[5] || 0), restP.z + (k[6] || 0));
      tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, times, pv));
    }
  }
  return tracks.length ? new THREE.AnimationClip(name, def.duration, tracks) : null;
}

/** Pilote l'animation d'un personnage articulé. Sans articulations, ne fait rien (modèle statique). */
export class Animator {
  constructor(root) {
    this.root = root;
    const quad = !!root.getObjectByName('body') && !root.getObjectByName('hips');
    this.defs = quad ? QUADRUPED : HUMANOID;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [name, def] of Object.entries(this.defs)) {
      const clip = buildClip(name, def, root);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (!def.loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[name] = a;
    }
    this.rigged = Object.keys(this.actions).length > 0;
    this.base = 'idle';
    this.current = null;
    this.dead = false;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.current && !this.dead) this.fadeTo(this.base, 0.25);
    });
    if (this.rigged) this.fadeTo('idle', 0);
  }
  fadeTo(name, fade = 0.2) {
    const next = this.actions[name];
    if (!next || (next === this.current && next.isRunning())) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }
  /** Joue une action unique (attack, cast, hit…), puis revient à la boucle de base. */
  play(name) {
    if (this.dead || !this.actions[name]) return 0;
    this.fadeTo(name, 0.12);
    return this.defs[name].duration;
  }
  setBase(name) { // idle ou walk
    if (this.dead || this.base === name) return;
    this.base = name;
    if (!this.current || this.defs[this.current.getClip().name]?.loop) this.fadeTo(name, 0.25);
  }
  die() {
    if (this.dead) return;
    this.fadeTo('death', 0.1);
    this.dead = true;
  }
  revive() {
    if (!this.dead) return;
    this.dead = false;
    this.fadeTo(this.base, 0.3);
  }
  update(dt) { this.mixer.update(dt); }
}

/** Animation de l'action d'un héros selon la stat testée ou la compétence. */
export function actionFor(result, classSkillId) {
  if (result.choiceId?.startsWith('skill:')) {
    return { coup_puissant: 'attack', boule_de_feu: 'cast', mains_agiles: 'stab', soin_de_groupe: 'pray' }[classSkillId] || 'attack';
  }
  const stat = result.roll?.stat || result.stat;
  return { for: 'attack', int: 'cast', dex: 'stab', sag: 'pray' }[stat] || null;
}
