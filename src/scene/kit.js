// Kit de donjon modélisé dans Blender (blender/dungeon_kit.blend -> public/models/dungeon_kit.glb).
// Chaque pièce est un nœud nommé à l'origine (Y en haut, mètres) :
//   floor_0..2 (dalle 2x2, dessus à y=0), wall_0..1 (2 m de long sur X, 4 m de haut, 0,6 d'épaisseur),
//   pillar, door_arch (ouverture 3 m), torch (fixée au mur, sort vers -Z), ceiling (2x2),
//   chest_body + chest_lid (charnière à l'origine du couvercle), altar, gem, campfire,
//   barrel, crate, bones, rubble, banner.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
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
      // Blender exporte tout en double face : inutile pour des volumes fermés et deux fois plus coûteux.
      o.material.side = o.material.name === 'C_Holy' ? THREE.DoubleSide : THREE.FrontSide;
      // Lueurs : intensité modérée pour garder la couleur (sinon elles saturent en blanc)
      if (o.material.emissiveIntensity > 1) o.material.emissiveIntensity = o.material.name === 'M_RuneGlow' ? 0.7 : 1.2;
      if (o.material.name === 'M_Ghost' || o.material.name === 'C_Ghost') {
        o.material.transparent = true;
        o.material.opacity = 0.7;
        o.material.depthWrite = false;
      }
      materials[o.material.name] = o.material;
    });
    bakeScene(gltf);
    gltf.scene.updateMatrixWorld(true);
    skinCharacters(gltf);
  }
  return { pieces, materials };
}

// ---------- Fusion des sous-maillages (moins d'appels de dessin, surtout sur mobile) ----------
// Un nœud Blender à plusieurs matériaux devient plusieurs maillages (un par matériau) dans three.js.
// On fusionne ceux qui n'ont rien de particulier en un seul maillage, la couleur du matériau étant
// « cuite » dans les couleurs de sommets. On garde à part : la pierre teintée par niveau, les lueurs,
// les matériaux translucides ou double face.
const TINTED = new Set(['M_Stone', 'M_StoneFloor']);
const bakedMaterial = new THREE.MeshStandardMaterial({ name: 'Baked', vertexColors: true, roughness: 0.8, metalness: 0.1 });
bakedMaterial.userData.kit = true;

function bakeable(m) {
  const glow = m.emissive && m.emissiveIntensity > 0 && m.emissive.r + m.emissive.g + m.emissive.b > 0.01;
  return !TINTED.has(m.name) && !m.transparent && !glow && m.side === THREE.FrontSide && !Array.isArray(m);
}

function bakedGeometry(mesh) {
  const src = mesh.geometry;
  const g = new THREE.BufferGeometry();
  const n = src.attributes.position.count;
  g.setAttribute('position', src.attributes.position.clone());
  if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
  const col = src.attributes.color;
  const c = mesh.material.color;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = col ? col.getX(i) : 1, gg = col ? col.getY(i) : 1, b = col ? col.getZ(i) : 1;
    out[i * 3] = r * c.r; out[i * 3 + 1] = gg * c.g; out[i * 3 + 2] = b * c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  if (src.index) g.setIndex(src.index.clone());
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(mesh.matrix);
  return g;
}

function bakeScene(gltf) {
  const assoc = gltf.parser.associations;
  const parents = new Map();
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.parent) return;
    const a = assoc.get(o);
    // sous-maillage d'un nœud à plusieurs matériaux (et non un nœud à part entière, ex. une articulation)
    if (!a || a.nodes !== undefined || a.primitives === undefined || o.children.length) return;
    if (!bakeable(o.material)) return;
    if (!parents.has(o.parent)) parents.set(o.parent, []);
    parents.get(o.parent).push(o);
  });
  for (const [parent, meshes] of parents) {
    if (meshes.length < 2) continue;
    const geos = meshes.map(bakedGeometry);
    if (geos.some((g) => !!g.index) && geos.some((g) => !g.index)) geos.forEach((g, i) => { if (g.index) geos[i] = g.toNonIndexed(); });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.userData.kit = true;
    const mesh = new THREE.Mesh(merged, bakedMaterial);
    mesh.name = `${parent.name}_baked`;
    for (const m of meshes) parent.remove(m);
    parent.add(mesh);
  }
}

// ---------- Personnages : un seul maillage à squelette rigide ----------
// Chaque membre articulé (hips, arm_R…) devient un « os » ; tous les morceaux ordinaires sont fusionnés
// en un SkinnedMesh dont chaque sommet suit son membre à 100 %. Les animations (anim.js) visent toujours
// les mêmes nœuds nommés, mais un personnage ne coûte plus qu'un ou deux appels de dessin.
const CHARACTER = /^(hero|enemy|npc)_/;
const EMPTY = new THREE.BufferGeometry();

function skinCharacters(gltf) {
  const assoc = gltf.parser.associations;
  for (const root of gltf.scene.children) {
    if (!CHARACTER.test(root.name)) continue;
    root.updateMatrixWorld(true);
    const bones = [];
    root.traverse((o) => { if (o !== root && assoc.get(o)?.nodes !== undefined) bones.push(o); });
    if (!bones.length) continue;
    const boneIndex = new Map(bones.map((b, i) => [b, i]));
    const parts = [];
    root.traverse((o) => {
      if (!o.isMesh || !(o.material === bakedMaterial || bakeable(o.material))) return;
      let owner = boneIndex.has(o) ? o : o.parent;
      while (owner && !boneIndex.has(owner)) owner = owner.parent;
      if (!owner) return;
      parts.push({ mesh: o, owner });
    });
    const geos = parts.map(({ mesh, owner }) => {
      let g;
      // Géométrie ramenée dans le repère du membre, puis dans celui du personnage (pose de repos)
      if (mesh.material === bakedMaterial) g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      else {
        g = bakedGeometry(mesh); // applique déjà mesh.matrix
        if (mesh === owner) g.applyMatrix4(new THREE.Matrix4().copy(mesh.matrix).invert());
      }
      g.applyMatrix4(owner.matrixWorld);
      const n = g.attributes.position.count;
      const idx = new Uint16Array(n * 4);
      const w = new Float32Array(n * 4);
      const bi = boneIndex.get(owner);
      for (let i = 0; i < n; i++) { idx[i * 4] = bi; w[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
      return g.index ? g.toNonIndexed() : g;
    });
    if (!geos.length) continue;
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.userData.kit = true;
    const skinned = new THREE.SkinnedMesh(merged, bakedMaterial);
    skinned.name = `${root.name}_body`;
    skinned.frustumCulled = false;
    root.add(skinned);
    root.updateMatrixWorld(true);
    skinned.bind(new THREE.Skeleton(bones));
    // Les morceaux absorbés ne dessinent plus rien (les membres restent, ce sont les os animés).
    for (const { mesh, owner } of parts) {
      if (mesh === owner) mesh.geometry = EMPTY;
      else mesh.parent.remove(mesh);
    }
    root.userData.skinned = true;
  }
}

/** Copie un modèle ; les personnages (squelette) sont copiés avec leurs os. */
export function cloneModel(piece) {
  return piece.userData.skinned ? skeletonClone(piece) : piece.clone(true);
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
  return p ? cloneModel(p) : new THREE.Group();
}

/** Petit aléatoire déterministe pour le décor (même salle -> même décor chez tous les joueurs). */
export function seeded(n) {
  let s = (n * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
