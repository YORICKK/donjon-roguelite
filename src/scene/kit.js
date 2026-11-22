// Kit de donjon modélisé dans Blender (blender/dungeon_kit.blend -> public/models/dungeon_kit.glb).
// Chaque pièce est un nœud nommé à l'origine (Y en haut, mètres) :
//   floor_0..2 (dalle 2x2, dessus à y=0), wall_0..1 (2 m de long sur X, 4 m de haut, 0,6 d'épaisseur),
//   pillar, door_arch (ouverture 3 m), torch (fixée au mur, sort vers -Z), ceiling (2x2),
//   chest_body + chest_lid (charnière à l'origine du couvercle), altar, gem, campfire,
//   barrel, crate, bones, rubble, banner.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { normalizeJointNames } from './anim.js';

// enemies.glb : enemy_<id> pour chaque ennemi de data/events.js (face vers +Z, pieds à y=0), npc_marchand.
// heroes.glb : hero_<classId> (guerrier, mage, voleur, clerc), même convention.
// themes.glb : pièces des biomes (voir src/data/themes.js).
const MODEL_FILES = ['dungeon_kit.glb', 'themes.glb', 'enemies.glb', 'heroes.glb'];

export async function loadKit(files = MODEL_FILES) {
  const loader = new GLTFLoader();
  const gltfs = await Promise.all(files.map((f) => loader.loadAsync(`${import.meta.env.BASE_URL}models/${f}`)));
  const pieces = {};
  const materials = {};
  for (const gltf of gltfs) {
    for (const node of [...gltf.scene.children]) {
      node.position.set(0, 0, 0);
      normalizeJointNames(node);
      node.updateMatrixWorld(true);
      pieces[node.name] = node;
    }
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.userData.kit = true;
      o.material.userData.kit = true;
      // Sans carte d'environnement, un métal pur paraît noir : on garde un éclat discret.
      o.material.metalness = Math.min(o.material.metalness, 0.3);
      if (o.material.name === 'C_Holy') o.material.side = THREE.DoubleSide;
      // Lueurs : intensité modérée pour garder la couleur (sinon elles saturent en blanc)
      if (o.material.emissiveIntensity > 1) o.material.emissiveIntensity = o.material.name === 'M_RuneGlow' ? 0.7 : 1.2;
      if (o.material.name === 'M_Ghost' || o.material.name === 'C_Ghost') {
        o.material.transparent = true;
        o.material.opacity = 0.7;
        o.material.depthWrite = false;
      }
      materials[o.material.name] = o.material;
    });
  }
  return { pieces, materials };
}

/** Teinte la pierre selon la palette du niveau (garde la luminosité d'origine). */
export function tintKit(kit, palette) {
  const tint = (matName, hex, base) => {
    const m = kit.materials[matName];
    if (!m) return;
    const c = new THREE.Color(hex);
    const l = (c.r + c.g + c.b) / 3 || 1;
    m.color.setRGB((base * c.r) / l, (base * c.g) / l, (base * c.b) / l);
  };
  tint('M_Stone', palette.wall, 0.55);
  tint('M_StoneFloor', palette.floor, 0.45);
}

/** Accumule des placements puis crée un InstancedMesh par (pièce, sous-maillage). */
export class Batch {
  constructor(kit) { this.kit = kit; this.items = new Map(); }
  add(name, pos, rotY = 0, scale = [1, 1, 1]) {
    if (!this.kit.pieces[name]) return;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(...scale),
    );
    if (!this.items.has(name)) this.items.set(name, []);
    this.items.get(name).push(m);
  }
  flush(parent) {
    const tmp = new THREE.Matrix4();
    for (const [name, mats] of this.items) {
      this.kit.pieces[name].traverse((mesh) => {
        if (!mesh.isMesh) return;
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, mesh.matrixWorld)));
        im.instanceMatrix.needsUpdate = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        parent.add(im);
      });
    }
    this.items.clear();
  }
}

export function cloneProp(kit, name) {
  const p = kit.pieces[name];
  return p ? p.clone(true) : new THREE.Group();
}

/** Petit aléatoire déterministe pour le décor (même salle -> même décor chez tous les joueurs). */
export function seeded(n) {
  let s = (n * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
