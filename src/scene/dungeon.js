// Donjon 3D low-poly : une file de salles reliées par des couloirs le long de l'axe -Z.
// La caméra glisse d'une salle à l'autre. Tout est généré en code (pas d'assets externes) ;
// plus tard, les props pourront être remplacés par des modèles GLB faits dans Blender.
import * as THREE from 'three';
import { ENEMIES } from '../data/events.js';
import { loadKit, tintKit, Batch, cloneProp, cloneModel, applyShinyLook, seeded } from './kit.js';
import { Animator } from './anim.js';
import { Fx } from './fx.js';
import { getTheme, ROOM_DRESSING } from '../data/themes.js';
import { ITEMS } from '../data/items.js';

const SPACING = 20; // distance entre centres de salles

/**
 * Lumière déclarée par une salle ou un objet, sans coût de rendu. À chaque image, un petit pool de
 * vraies PointLight (nombre fixe => aucun shader recompilé) prend la place des plus importantes
 * de la salle courante. Même interface que PointLight (color, intensity, distance, decay).
 */
class FakeLight extends THREE.Object3D {
  constructor(color, intensity = 1, distance = 0, decay = 2, priority = 1) {
    super();
    this.isFakeLight = true;
    this.color = new THREE.Color(color);
    this.intensity = intensity;
    this.distance = distance;
    this.decay = decay;
    this.priority = priority;
  }
}
const WALL_H = 4;

export function createDungeonScene(canvas) {
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
  // Sur smartphone, on limite la résolution interne pour garder 60 i/s et la batterie.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2)); // ajusté ensuite par adaptQuality()
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  // Ombres douces sur ordinateur ; désactivées sur mobile (coût GPU).
  renderer.shadowMap.enabled = !isTouch;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 120);
  const world = new THREE.Group();
  scene.add(world);
  scene.add(new THREE.HemisphereLight(0x8899bb, 0x221811, 0.7));
  const fill = new THREE.PointLight(0xffe2c0, 6, 12, 1.5); // lumière portée par le groupe
  camera.add(fill);
  scene.add(camera);
  // Lumière principale qui suit la salle courante et projette les ombres des personnages
  const keyLight = new THREE.SpotLight(0xffd9a8, 24, 26, 0.85, 0.6, 1.2);
  keyLight.castShadow = !isTouch;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight, keyLight.target);

  let rooms = [];
  let current = 0;
  let camFrom = new THREE.Vector3();
  let camTo = new THREE.Vector3();
  let camT = 1;
  const clock = new THREE.Clock();
  let running = true;
  let flashLight = new THREE.PointLight(0xffffff, 0, 14);
  scene.add(flashLight);

  // Pool fixe de vraies lumières pour les FakeLight de la salle courante (et des voisines)
  const POOL = isTouch ? 3 : 5;
  const pool = Array.from({ length: POOL }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    scene.add(l);
    return l;
  });
  const tmpV = new THREE.Vector3();
  function updateLightPool() {
    const cands = [];
    rooms.forEach((r, i) => {
      if (Math.abs(i - current) > 1) return;
      for (const f of r.fakes) {
        if (f.intensity <= 0.01) continue;
        // priorité : salle courante d'abord, lumière principale avant les objets
        cands.push({ f, score: (i === current ? 100 : 0) + f.priority * 5 + f.intensity * 0.1 });
      }
    });
    cands.sort((a, b) => b.score - a.score);
    pool.forEach((l, k) => {
      const c = cands[k];
      if (!c) { l.intensity = 0; return; }
      c.f.getWorldPosition(tmpV);
      l.position.copy(tmpV);
      l.color.copy(c.f.color);
      l.intensity = c.f.intensity;
      l.distance = c.f.distance;
      l.decay = c.f.decay;
    });
  }

  // Résolution adaptative : on baisse la définition si l'image passe sous ~45 i/s, on remonte si c'est fluide.
  const maxRatio = Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2);
  // Plancher à ×1 : un écran bridé à 30 i/s (mode économie) ne doit pas devenir flou.
  const minRatio = Math.min(maxRatio, 1);
  let ratio = maxRatio;
  let frames = 0, acc = 0, goodWindows = 0, fps = 60;
  function adaptQuality(dt) {
    frames++; acc += dt;
    if (acc < 2) return;
    fps = frames / acc;
    frames = 0; acc = 0;
    if (document.hidden) return;
    if (fps < 40 && ratio > minRatio) { ratio = Math.max(minRatio, ratio - 0.25); goodWindows = 0; renderer.setPixelRatio(ratio); resize(); }
    else if (fps > 57) {
      goodWindows++;
      if (goodWindows >= 3 && ratio < maxRatio) { ratio = Math.min(maxRatio, ratio + 0.25); goodWindows = 0; renderer.setPixelRatio(ratio); resize(); }
    } else goodWindows = 0;
  }

  // bottomInset : hauteur (px) cachée par le panneau du bas sur mobile ; on décale l'image vers le haut
  // pour que l'action reste visible au-dessus du panneau.
  let bottomInset = 0;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    // FOV vertical : 62° en paysage ; en portrait on garde ~68° d'angle horizontal.
    const aspect = w / h;
    const vfov = aspect >= 1 ? 62 : Math.min(100, (2 * Math.atan(Math.tan((34 * Math.PI) / 180) / aspect) * 180) / Math.PI);
    const k = Math.min(bottomInset / 2, h * 0.3);
    if (k > 1) {
      const fullH = h + 2 * k;
      camera.fov = (2 * Math.atan((Math.tan((vfov * Math.PI) / 360) * fullH) / h) * 180) / Math.PI;
      camera.aspect = w / fullH;
      camera.setViewOffset(w, fullH, 0, 2 * k, w, h);
    } else {
      camera.fov = vfov;
      camera.aspect = aspect;
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  function setBottomInset(px) {
    if (Math.abs(px - bottomInset) < 4) return;
    bottomInset = px;
    resize();
  }

  // ---------- Groupe de héros (modèles Blender) qui suit la caméra ----------
  const partyGroup = new THREE.Group();
  scene.add(partyGroup);
  let heroes = []; // { uid, classId, obj, alive, lunge, anim }
  let partyKey = '';
  let lastMembers = [];
  function setParty(members) {
    lastMembers = members;
    // On ne reconstruit le groupe que si sa composition change ; la mort est animée sur place.
    const key = JSON.stringify(members.map((m) => [m.uid, m.classId, m.pet || null]));
    if (key === partyKey) {
      for (const m of members) {
        const h = heroes.find((x) => x.uid === m.uid);
        if (!h || h.alive === m.alive) continue;
        h.alive = m.alive;
        if (!m.alive) setTimeout(() => h.anim?.die(), 700);
        else h.anim?.revive();
      }
      return;
    }
    partyKey = key;
    partyGroup.clear();
    heroes = [];
    if (!kit) return;
    // Héros de part et d'autre de l'axe central, pour laisser voir l'ennemi ou l'objet.
    const SLOTS = [[-1.15, 0], [1.15, 0], [-2.0, -1.0], [2.0, -1.0]];
    members.forEach((m, idx) => {
      const model = kit.pieces[`hero_${m.classId}`];
      const obj = model ? cloneModel(model) : new THREE.Group();
      castShadows(obj);
      const [x, z] = SLOTS[idx % SLOTS.length];
      obj.position.set(x, 0, z);
      obj.userData.baseZ = z;
      obj.rotation.y = Math.PI + x * 0.22; // de dos, tournés vers le centre de la salle
      partyGroup.add(obj);
      const anim = new Animator(obj);
      if (!m.alive) anim.die();
      // Compagnon de chaque héros
      let pet = null;
      const petDef = ITEMS[m.pet];
      if (petDef?.companion && kit.pieces[petDef.model]) {
        const pobj = cloneModel(kit.pieces[petDef.model]);
        if (petDef.look) applyShinyLook(pobj, petDef.look, petDef.model); // variante chromatique
        castShadows(pobj);
        // devant son maître, vers le centre : la caméra plongeante le montre sous l'ennemi
        pobj.position.set(x * 0.6, 0, z - 0.9);
        pobj.rotation.y = obj.rotation.y;
        pobj.scale.setScalar({ useless: 1.8, guard: 0.8 }[petDef.power] || 1);
        partyGroup.add(pobj);
        pet = {
          obj: pobj, anim: new Animator(pobj), power: petDef.power, sparkle: petDef.look?.sparkle, sparkleT: Math.random(),
          // le dragonnet alterne vol et sol
          flyer: petDef.power === 'breath', mode: 'ground', modeT: 3 + Math.random() * 4, curY: 0,
        };
      }
      heroes.push({ ...m, obj, lunge: 0, anim, pet });
    });
  }
  function heroAct(uid) {
    const h = heroes.find((x) => x.uid === uid);
    if (h && !h.anim.rigged) h.lunge = 1;
  }
  function animateParty(t, dt) {
    partyGroup.position.set(0, 0, camera.position.z - 3.4);
    const walking = camT < 1;
    heroes.forEach((h, i) => {
      const o = h.obj;
      if (h.pet) {
        const pt = h.pet;
        if (pt.flyer) {
          // alterne entre vol et sol toutes les 5 à 11 s (poussière au décollage et à l'atterrissage)
          if ((pt.modeT -= dt) <= 0) {
            pt.mode = pt.mode === 'air' ? 'ground' : 'air';
            pt.modeT = 5 + Math.random() * 6;
            fx.burst(worldPos(pt.obj, 0.05), 0xb8a68a, { count: 18, speed: 1.6, up: 0.6, gravity: -1, life: 0.8, size: 0.16 });
          }
          const air = pt.mode === 'air';
          pt.curY = THREE.MathUtils.lerp(pt.curY, air ? 1.0 : 0, dt * 1.8);
          pt.obj.position.y = pt.curY + (air ? Math.sin(t * 2.4 + i) * 0.12 : 0);
          pt.anim.setBase(pt.curY > 0.25 ? 'fly' : walking ? 'walk' : 'idle');
        } else {
          pt.anim.setBase(walking ? 'walk' : 'idle');
        }
        pt.anim.update(dt);
        // variante chromatique : étincelles en continu
        if (h.pet.sparkle && (h.pet.sparkleT -= dt) <= 0) {
          h.pet.sparkleT = 0.35 + Math.random() * 0.3;
          const p = worldPos(h.pet.obj, h.pet.curY + 0.25 + Math.random() * 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6));
          fx.burst(p, h.pet.sparkle, { count: 3, speed: 0.4, up: 2, gravity: 0.6, life: 0.9, size: 0.09 });
        }
      }
      if (h.anim.rigged) {
        h.anim.setBase(walking ? 'walk' : 'idle');
        h.anim.update(dt);
        return;
      }
      // Modèle statique : petite animation procédurale de secours
      h.lunge = Math.max(0, h.lunge - dt * 1.8);
      const lungeZ = -Math.sin(h.lunge * Math.PI) * 0.8;
      if (!h.alive) {
        o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, -Math.PI / 2, dt * 4);
        o.position.y = THREE.MathUtils.lerp(o.position.y, 0.15, dt * 4);
        return;
      }
      o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, 0, dt * 6);
      o.position.y = walking ? Math.abs(Math.sin(t * 9 + i)) * 0.08 : Math.sin(t * 2 + i) * 0.01;
      o.position.z = o.userData.baseZ + lungeZ;
      o.rotation.z = walking ? Math.sin(t * 9 + i) * 0.05 : 0;
    });
  }

  // ---------- Effets et chorégraphie des résultats ----------
  const fx = new Fx(scene);
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const worldPos = (obj, y = 1.2) => obj.getWorldPosition(new THREE.Vector3()).setY(y);
  const enemyObj = () => rooms[current]?.props.enemy || null;
  const enemyAnim = () => rooms[current]?.props.anim || null;
  // Moment de l'impact dans chaque animation d'action (secondes)
  const IMPACT = { attack: 0.55, stab: 0.25, cast: 0.8, pray: 0.55 };
  const SKILL_COLORS = { boule_de_feu: 0xff6a1a, soin_de_groupe: 0x9dffb0 };

  /**
   * Joue le résultat d'un choix : action du héros, impact sur l'ennemi, contre-attaque, blessures.
   * r = { championUid, anim, skillId, success, enemyDied, hurt[], healed, chestOpen, enemyHpFrac, fled }
   */
  function playResult(r) {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    const hero = heroes.find((h) => h.uid === r.championUid);
    const enemy = enemyObj();
    const eAnim = enemyAnim();
    const action = r.anim;
    let t = 0;
    if (hero && action) {
      if (hero.anim.rigged) hero.anim.play(action); else hero.lunge = 1;
      const hand = worldPos(hero.obj, 1.3);
      const target = enemy ? worldPos(enemy, 1.1) : hand.clone().add(new THREE.Vector3(0, 0, -4));
      t = (IMPACT[action] || 0.5) * 1000;
      if (action === 'cast') {
        const color = SKILL_COLORS[r.skillId] || 0x7fb6ff;
        later(t - 150, () => fx.projectile(worldPos(hero.obj, 1.5), target, color, { duration: 0.4, size: r.skillId === 'boule_de_feu' ? 0.35 : 0.2 }));
        t += 300;
      } else if (action === 'pray') {
        later(t - 200, () => heroes.forEach((h) => {
          if (!h.alive) return;
          fx.ring(worldPos(h.obj, 0), r.healed ? 0x2bd45a : 0xd9a93a);
          fx.burst(worldPos(h.obj, 0.3), r.healed ? 0x9dffb0 : 0xffe08a, { count: 18, speed: 1.2, up: 3, gravity: 1.5, life: 1.0, size: 0.14 });
        }));
      } else if (enemy && (action === 'attack' || action === 'stab')) {
        later(t, () => fx.slash(target.clone().add(new THREE.Vector3(0, 0, 0.6)), 0xffffff, action === 'stab' ? -1 : 1));
      }
    }
    // Impact sur l'ennemi
    if (enemy && r.success && !r.fled) {
      later(t, () => {
        fx.burst(worldPos(enemy, 1.1), r.skillId === 'boule_de_feu' ? 0xff7a2a : 0xffe3a0, { count: 30, speed: 3.5 });
        shakeHit(0.2);
        if (r.enemyDied) {
          if (eAnim?.rigged) eAnim.die();
          setRoomState({ enemyHpFrac: 0, enemyDead: true });
        } else {
          eAnim?.play('hit');
          setRoomState({ enemyHpFrac: r.enemyHpFrac });
        }
      });
    }
    // Contre-attaque / piège : les héros touchés encaissent
    if (r.hurt.length) {
      let tHit = t + 150;
      if (enemy && !r.enemyDied) {
        later(t + 100, () => {
          const d = eAnim?.rigged ? eAnim.play('attack') : 0;
          if (!d) fx.burst(worldPos(enemy, 1.0), 0xff5544, { count: 12 });
        });
        tHit = t + 100 + (eAnim?.rigged ? 550 : 300);
      }
      later(tHit, () => {
        flash(0xff2222);
        shakeHit(0.35);
        for (const uid of r.hurt) {
          const h = heroes.find((x) => x.uid === uid);
          if (!h) continue;
          if (h.anim.rigged) h.anim.play('hit');
          fx.burst(worldPos(h.obj, 1.2), 0xd0201a, { count: 22, speed: 2.5, size: 0.12 });
        }
      });
    } else if (r.success || !hero) {
      later(t, () => flash(0xffdd66));
    }
    if (r.poisoned?.length) later(t + 700, () => {
      for (const uid of r.poisoned) {
        const h = heroes.find((x) => x.uid === uid);
        if (h) fx.burst(worldPos(h.obj, 1.0), 0x7ccf5a, { count: 16, speed: 1, up: 2, gravity: 1, life: 0.9, size: 0.14 });
      }
    });
    if (r.pets?.length) playPets(r.pets, t + 250);
    if (r.chestOpen) later(t + 200, () => {
      setRoomState({ chestOpen: true });
      const c = rooms[current]?.props.lid;
      if (c) fx.burst(c.getWorldPosition(new THREE.Vector3()).setY(1.2), 0xffd36b, { count: 40, speed: 2.5, up: 3, life: 1.2, size: 0.16 });
    });
  }

  /** Actions visibles des compagnons : morsure (loup), souffle (dragon), fouille (chien), protection (ours). */
  function playPets(list, delay = 0) {
    const enemy = enemyObj();
    list.forEach(({ uid, kind }, k) => {
      const h = heroes.find((x) => x.uid === uid);
      if (!h?.pet) return;
      later(delay + k * 250, () => {
        h.pet.anim.play('attack');
        const at = worldPos(h.pet.obj, h.pet.curY + 0.4);
        if (kind === 'breath' && enemy) {
          fx.projectile(at, worldPos(enemy, 1.2), 0xff5a1a, { duration: 0.45, size: 0.3 });
          later(450, () => { shakeHit(0.2); setRoomState({ enemyHpFrac: rooms[current]?.props.hpFrac }); });
        } else if (kind === 'bite' && enemy) {
          later(380, () => { fx.burst(worldPos(enemy, 0.9), 0xffffff, { count: 16, speed: 2.5 }); rooms[current]?.props.anim?.play('hit'); });
        } else if (kind === 'dig') {
          fx.burst(worldPos(h.pet.obj, 0.2), 0xffd36b, { count: 24, speed: 2, up: 3, life: 1 });
        } else if (kind === 'guard') {
          fx.ring(worldPos(h.obj, 0), 0xb07a3c, { radius: 1, life: 0.6 });
        }
      });
    });
  }

  function cheer() {
    heroes.forEach((h, i) => { if (h.alive) later(i * 120, () => h.anim.play('cheer')); });
    later(200, () => heroes.forEach((h) => h.alive && fx.burst(worldPos(h.obj, 2.2), 0xffd36b, { count: 20, up: 3, gravity: -3, life: 1.2 })));
  }

  function castShadows(obj) {
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

  function clear() {
    world.traverse((o) => {
      if (o.geometry && !o.geometry.userData.kit) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { if (!m.userData.kit) m.dispose(); });
      if (o.isInstancedMesh) o.dispose();
    });
    world.clear();
    rooms = [];
  }

  // Kit Blender chargé en arrière-plan ; en attendant (ou en cas d'échec) on garde les formes simples.
  let kit = null;
  let lastBuild = null;
  loadKit()
    .then((k) => { kit = k; if (lastBuild) { const keep = current; build(...lastBuild); jumpTo(keep); } partyKey = ''; setParty(lastMembers); })
    .catch((e) => console.warn('Kit 3D indisponible, rendu simplifié :', e));

  function jumpTo(i) {
    if (!rooms[i]) return;
    current = i;
    camT = 1;
    placeCamera(i, camTo);
    camera.position.copy(camTo);
    updateLights();
  }

  // Coque d'une salle (sol, murs, arches, piliers, torches, couloir, décor) avec le kit Blender,
  // habillée selon le biome du niveau (src/data/themes.js) et le type de salle.
  const ALIGNED = new Set(['sarcophagus', 'coffin', 'minecart']); // posés dans l'axe du mur
  function shellKit(g, def, i, W, D, corridorLen, pal, theme) {
    tintKit(kit, pal);
    const B = new Batch(kit);
    const rnd = seeded(i * 7919 + W * 131 + D * 17 + def.shape.torches);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const door = 3;
    const floaters = [];
    for (let x = -W / 2 + 1; x < W / 2; x += 2) {
      for (let z = -D / 2 + 1; z < D / 2; z += 2) B.add(pick(theme.floors), [x, 0, z], Math.floor(rnd() * 4) * Math.PI / 2);
    }
    const run = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.3) return;
      const n = Math.max(1, Math.round(L / 2));
      const rot = Math.atan2(-(bz - az), bx - ax);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        B.add(pick(theme.walls), [ax + (bx - ax) * t, 0, az + (bz - az) * t], rot, [L / n / 2, 1, 1]);
      }
    };
    for (const z of [-D / 2, D / 2]) {
      run(-W / 2, z, -door / 2, z);
      run(door / 2, z, W / 2, z);
      B.add('door_arch', [0, 0, z]);
    }
    run(-W / 2, D / 2, -W / 2, -D / 2);
    run(W / 2, D / 2, W / 2, -D / 2);
    for (let p = 0; p < def.shape.pillars; p++) {
      B.add(theme.pillar, [(p % 2 ? 1 : -1) * (W / 2 - 2), 0, (p < 2 ? -1 : 1) * (D / 2 - 2.5)], rnd() * Math.PI * 2);
    }
    if (theme.rails && rnd() < 0.55) {
      for (let z = -D / 2 + 1; z < D / 2; z += 2) B.add('rails', [0.0, 0.01, z]);
    }

    if (corridorLen > 0) {
      const z0 = -D / 2, z1 = -D / 2 - corridorLen;
      const n = Math.max(1, Math.round(corridorLen / 2));
      const seg = corridorLen / n;
      for (let k = 0; k < n; k++) {
        const z = z0 - seg * (k + 0.5);
        B.add(pick(theme.floors), [0, 0, z], 0, [door / 2, 1, seg / 2]);
        B.add('ceiling', [0, WALL_H - 0.3, z], 0, [(door + 1.2) / 2, 1, seg / 2]);
      }
      run(-door / 2 - 0.3, z0, -door / 2 - 0.3, z1);
      run(door / 2 + 0.3, z0, door / 2 + 0.3, z1);
    }
    B.flush(g);

    const place = (name, x, z, rotY = 0, y = 0, scale = 1) => {
      if (!kit.pieces[name]) return null;
      const p = cloneProp(kit, name);
      p.position.set(x, y, z);
      p.rotation.y = rotY;
      if (scale !== 1) p.scale.setScalar(scale);
      p.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      g.add(p);
      return p;
    };

    // Torches murales avec flamme
    const flameMat = new THREE.MeshBasicMaterial({ color: pal.torch });
    const flameGeo = new THREE.ConeGeometry(0.09, 0.28, 5);
    const torchZ = [];
    for (let t = 0; t < def.shape.torches; t++) {
      const left = t % 2 === 0;
      const z = -D / 2 + ((t >> 1) + 1) * (D / 3);
      torchZ.push(z);
      const torch = place('torch', left ? -W / 2 + 0.3 : W / 2 - 0.3, z, left ? -Math.PI / 2 : Math.PI / 2, 2.1);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(0, 0.72, -0.36);
      torch?.add(flame);
    }

    // Étais de mine le long des murs latéraux
    if (theme.supports) {
      for (const sx of [-1, 1]) {
        for (let z = -D / 2 + 1.2; z < D / 2 - 0.8; z += 3.2) {
          if (torchZ.some((tz) => Math.abs(tz - z) < 0.6)) continue;
          place(theme.supports, sx * (W / 2 - 0.3), z, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
        }
      }
    }

    // Grands éléments contre les murs latéraux, vers le fond de la salle
    for (const sx of [-1, 1]) {
      if (rnd() < 0.3) continue;
      const name = pick(theme.alongWalls);
      const z = -D / 2 + 1.5 + rnd() * 0.6;
      const aligned = ALIGNED.has(name);
      place(name, sx * (W / 2 - (aligned ? 1.0 : 0.75)), z, aligned ? 0 : (sx < 0 ? Math.PI / 2 : -Math.PI / 2));
    }

    // Décor selon le type de salle (lits de camp, râteliers, table…)
    const dressing = ROOM_DRESSING[def.type] || [];
    const slots = [[-(door / 2 + 1.4), -D / 2 + 0.55, 0], [door / 2 + 1.4, -D / 2 + 0.55, 0], [-(W / 2 - 1.6), 0.6, Math.PI / 2], [W / 2 - 1.6, 0.6, -Math.PI / 2]];
    dressing.forEach((name, k) => {
      const [x, z, r] = slots[k % slots.length];
      if (name === 'bedroll') place(name, x * 0.8, z + 2.2, r + 0.3);
      else place(name, x, z, r);
    });

    // Petit décor dans les coins (le centre reste libre pour l'événement)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (rnd() < 0.3) continue;
      const name = pick(theme.corners);
      const p = place(name, sx * (W / 2 - 1.1 - rnd() * 0.4), sz * (D / 2 - 1.3 - rnd() * 0.5), rnd() * Math.PI * 2);
      if (name === 'crate' && p && rnd() < 0.5) place('crate', p.position.x, p.position.z, rnd() * Math.PI, 0.8, 0.8);
    }

    // Toiles d'araignée dans les angles du plafond
    for (const name of theme.ceilingCorners || []) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (rnd() < 0.4) continue;
        const rot = Math.atan2(-sx, -sz) - Math.atan2(1, -1);
        place(name, sx * (W / 2 - 0.32), sz * (D / 2 - 0.32), rot, 3.75, 1 + rnd() * 0.6);
      }
    }

    // Pierres runiques flottantes
    for (const name of theme.floating || []) {
      for (let k = 0; k < 3; k++) {
        const p = place(name, (rnd() - 0.5) * (W - 3), -D / 2 + 1 + rnd() * (D - 3), rnd() * 6, 1.6 + rnd() * 1.4);
        if (p) floaters.push({ obj: p, y: p.position.y, phase: rnd() * 6, spin: 0.2 + rnd() * 0.4 });
      }
    }

    if (theme.banner) {
      for (const sx of [-1, 1]) {
        if (rnd() < 0.5) continue;
        const b = place('banner', sx * Math.min(W / 2 - 1, 3), -D / 2 + 0.36, 0, 3.5);
        b?.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      }
    }
    return floaters;
  }

  // ---------- Particules d'ambiance (poussière, étincelles), centrées sur la caméra ----------
  let ambient = null;
  function setAmbient(theme) {
    if (ambient) { scene.remove(ambient.points); ambient.points.geometry.dispose(); ambient.points.material.dispose(); ambient = null; }
    const cfg = theme.particles;
    if (!cfg) return;
    const count = Math.round(cfg.count * (isTouch ? 0.5 : 1));
    const pos = new Float32Array(count * 3);
    const box = [12, 4, 16];
    for (let k = 0; k < count; k++) pos.set([(Math.random() - 0.5) * box[0], Math.random() * box[1], -Math.random() * box[2]], k * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: cfg.color, size: cfg.size, map: fx.tex, transparent: true, depthWrite: false, opacity: 0.75,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    points.frustumCulled = false;
    scene.add(points);
    ambient = { points, cfg, box, seeds: Array.from({ length: count }, () => Math.random() * 100) };
  }
  function animateAmbient(t, dt) {
    if (!ambient) return;
    const { points, cfg, box, seeds } = ambient;
    points.position.set(0, 0, camera.position.z + 2);
    const a = points.geometry.attributes.position.array;
    for (let k = 0; k < seeds.length; k++) {
      const s = seeds[k];
      a[k * 3] += Math.sin(t * 0.3 + s) * cfg.speed * dt;
      a[k * 3 + 1] += (cfg.rise + Math.cos(t * 0.5 + s) * cfg.speed * 0.5) * dt;
      a[k * 3 + 2] += Math.cos(t * 0.2 + s * 1.3) * cfg.speed * dt;
      if (a[k * 3 + 1] > box[1]) a[k * 3 + 1] = 0;
      if (a[k * 3 + 1] < 0) a[k * 3 + 1] = box[1];
    }
    points.geometry.attributes.position.needsUpdate = true;
  }

  function build(roomDefs, level) {
    lastBuild = [roomDefs, level];
    clear();
    const pal = level.palette;
    const theme = getTheme(level);
    scene.background = new THREE.Color(pal.fog);
    scene.fog = new THREE.Fog(pal.fog, theme.fog[0], theme.fog[1]);
    setAmbient(theme);
    keyLight.color.set(pal.torch).lerp(new THREE.Color(0xffffff), 0.55);
    const floorMat = mat(pal.floor);
    const wallMat = mat(pal.wall);

    roomDefs.forEach((def, i) => {
      const g = new THREE.Group();
      const z = -i * SPACING;
      g.position.set(0, 0, z);
      const { w, d } = def.shape;
      const isBoss = def.type === 'boss';
      const W = isBoss ? w + 4 : w;
      const D = isBoss ? d + 3 : d;

      const nextDef = roomDefs[i + 1];
      const nextD = nextDef ? (nextDef.type === 'boss' ? nextDef.shape.d + 3 : nextDef.shape.d) : 0;
      let floaters = [];
      if (kit) floaters = shellKit(g, def, i, W, D, nextDef ? SPACING - D / 2 - nextD / 2 : 0, pal, theme);
      else {
      // Sol en dalles légèrement irrégulières
      const tiles = new THREE.Group();
      for (let x = -W / 2 + 1; x < W / 2; x += 2) {
        for (let zz = -D / 2 + 1; zz < D / 2; zz += 2) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.2, 1.95), floorMat);
          t.position.set(x, -0.1 + Math.sin(x * 3.1 + zz * 1.7 + i) * 0.03, zz);
          tiles.add(t);
        }
      }
      g.add(tiles);

      // Murs avec ouvertures (porte avant/arrière de 3 m)
      const door = 3;
      const addWall = (len, x, zz, rotY) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, WALL_H, 0.6), wallMat);
        m.position.set(x, WALL_H / 2, zz);
        m.rotation.y = rotY;
        g.add(m);
      };
      const side = (W - door) / 2;
      for (const zz of [-D / 2, D / 2]) {
        addWall(side, -(door / 2 + side / 2), zz, 0);
        addWall(side, door / 2 + side / 2, zz, 0);
      }
      addWall(D, -W / 2, 0, Math.PI / 2);
      addWall(D, W / 2, 0, Math.PI / 2);

      // Piliers
      for (let p = 0; p < def.shape.pillars; p++) {
        const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, WALL_H, 6), wallMat);
        pil.position.set((p % 2 ? 1 : -1) * (W / 2 - 2), WALL_H / 2, (p < 2 ? -1 : 1) * (D / 2 - 2.5));
        g.add(pil);
      }

      // Torches + une lumière par salle
      const torchGeo = new THREE.ConeGeometry(0.15, 0.4, 5);
      const flameMat = new THREE.MeshBasicMaterial({ color: pal.torch });
      for (let t = 0; t < def.shape.torches; t++) {
        const fl = new THREE.Mesh(torchGeo, flameMat);
        const left = t % 2 === 0;
        fl.position.set(left ? -W / 2 + 0.45 : W / 2 - 0.45, 2.4, -D / 2 + ((t >> 1) + 1) * (D / 3));
        g.add(fl);
      }

      // Couloir vers la salle suivante
      if (i < roomDefs.length - 1) {
        const len = SPACING - D / 2 - nextD / 2;
        const cz = -D / 2 - len / 2;
        const floor = new THREE.Mesh(new THREE.BoxGeometry(door, 0.2, len), floorMat);
        floor.position.set(0, -0.1, cz);
        g.add(floor);
        for (const sx of [-1, 1]) {
          const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_H - 0.6, len), wallMat);
          wall.position.set(sx * (door / 2 + 0.3), (WALL_H - 0.6) / 2, cz);
          g.add(wall);
        }
        const ceil = new THREE.Mesh(new THREE.BoxGeometry(door + 1.2, 0.4, len), wallMat);
        ceil.position.set(0, WALL_H - 0.4, cz);
        g.add(ceil);
      }
      } // fin du rendu sans kit

      const light = new FakeLight(pal.torch, 0, 22, 1.4, 10);
      light.position.set(0, 3.2, 0);
      g.add(light);

      const props = buildProps(def, mat, kit);
      g.add(props.group);
      world.add(g);
      const fakes = [];
      g.traverse((o) => { if (o.isFakeLight) fakes.push(o); });
      rooms.push({ def, group: g, light, props, D, floaters, fakes });
    });

    current = 0;
    camT = 1;
    placeCamera(0, camTo);
    camera.position.copy(camTo);
    updateLights();
  }

  function placeCamera(i, out) {
    const r = rooms[i];
    return out.set(0, 3.4, -i * SPACING + r.D / 2 - 0.6);
  }

  function updateLights() {
    rooms.forEach((r, i) => { r.light.intensity = Math.abs(i - current) <= 1 ? (i === current ? 16 : 6) : 0; });
  }

  function goToRoom(i) {
    if (!rooms[i] || i === current) return;
    camFrom.copy(camera.position);
    placeCamera(i, camTo);
    current = i;
    camT = 0;
    updateLights();
  }

  function setRoomState({ enemyHpFrac, enemyDead, chestOpen } = {}) {
    const p = rooms[current]?.props;
    if (!p) return;
    if (p.enemy) {
      if (enemyDead !== undefined) {
        if (enemyDead && !p.enemyDead) p.anim?.die();
        p.enemyDead = enemyDead;
      }
      if (enemyHpFrac != null) p.hpFrac = enemyHpFrac;
    }
    if (p.lid && chestOpen !== undefined) p.chestOpen = chestOpen;
  }

  function flash(color = 0xff3333) {
    flashLight.color.set(color);
    flashLight.intensity = 40;
    flashLight.position.copy(camera.position).add(new THREE.Vector3(0, 0, -3));
  }

  function shakeHit(amount = 0.35) { shake = Math.max(shake, amount); }
  let shake = 0;

  function tick() {
    if (!running) return;
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05);
    const t = clock.elapsedTime;
    if (camT < 1) {
      camT = Math.min(1, camT + dt / 2.2);
      const e = camT < 0.5 ? 2 * camT * camT : 1 - Math.pow(-2 * camT + 2, 2) / 2;
      camera.position.lerpVectors(camFrom, camTo, e);
      camera.position.y += Math.abs(Math.sin(camT * Math.PI * 8)) * 0.08 * (1 - camT);
    }
    const look = new THREE.Vector3(0, 1.0, camera.position.z - 7);
    camera.lookAt(look);
    animateParty(t, dt);
    if (shake > 0) {
      camera.position.x = (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - dt * 1.5);
      if (shake === 0) camera.position.x = 0;
    }
    flashLight.intensity *= 0.9;
    adaptQuality(raw);
    rooms.forEach((r, i) => { r.group.visible = Math.abs(i - current) <= 1; });
    fx.update(dt);
    animateAmbient(t, dt);
    const roomZ = -current * SPACING;
    keyLight.position.set(0, 7.5, camera.position.z - 1.5);
    keyLight.target.position.set(0, 0, roomZ - 1);

    rooms.forEach((r, i) => {
      if (Math.abs(i - current) > 1) return;
      r.light.intensity = (i === current ? 16 : 6) * (0.9 + Math.sin(t * 9 + i) * 0.05 + Math.sin(t * 23) * 0.03);
      animateProps(r.props, t, dt);
      for (const f of r.floaters) { f.obj.position.y = f.y + Math.sin(t * 0.8 + f.phase) * 0.18; f.obj.rotation.y += f.spin * dt; }
    });
    updateLightPool();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    build, goToRoom, jumpTo, setRoomState, flash, shakeHit, setParty, heroAct, setBottomInset, playResult, cheer, playPets,
    get current() { return current; },
    get three() { return scene; }, // débogage
    /** Diagnostic de performance (appels de dessin, triangles, lumières, shaders). */
    stats() {
      let lights = 0;
      scene.traverse((o) => { if (o.isLight && o.visible) lights++; });
      return { fps: Math.round(fps), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, lights, programs: renderer.info.programs?.length, geometries: renderer.info.memory.geometries, pixelRatio: renderer.getPixelRatio() };
    },
    dispose() { running = false; clear(); renderer.dispose(); window.removeEventListener('resize', resize); },
  };
}

// ---------- Props ----------
function buildProps(def, mat, kit) {
  const group = new THREE.Group();
  const props = { group, type: def.type };
  if (kit) {
    if (def.type === 'chest') {
      const body = cloneProp(kit, 'chest_body');
      body.position.set(0, 0, -2);
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.7, -2 - 0.425);
      lidPivot.add(cloneProp(kit, 'chest_lid'));
      const glow = new FakeLight(0xffd36b, 0, 5);
      glow.position.set(0, 1.2, -2);
      group.add(body, lidPivot, glow);
      Object.assign(props, { lid: lidPivot, glow });
      def = { ...def, type: 'kit-done' };
    } else if (def.type === 'shrine') {
      const altar = cloneProp(kit, 'altar');
      altar.position.set(0, 0, -2.2);
      const gem = cloneProp(kit, 'gem');
      gem.position.set(0, 1.9, -2.2);
      const l = new FakeLight(0x66ffee, 6, 6);
      l.position.set(0, 1.9, -2.2);
      group.add(altar, gem, l);
      Object.assign(props, { gem, gemY: 1.9 });
      def = { ...def, type: 'kit-done' };
    } else if (def.type === 'rest') {
      const camp = cloneProp(kit, 'campfire');
      camp.position.set(0, 0, -1.8);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 5), new THREE.MeshBasicMaterial({ color: 0xff7722 }));
      fire.position.set(0, 0.5, -1.8);
      const fl = new FakeLight(0xff8833, 8, 8);
      fl.position.set(0, 1, -1.8);
      group.add(camp, fire, fl);
      Object.assign(props, { fire, fireLight: fl });
      def = { ...def, type: 'kit-done' };
    } else if (def.type === 'shop') {
      const stall = [['crate', -1.4, -2.4, 0.3], ['crate', 1.5, -2.3, -0.4], ['barrel', -0.9, -3.1, 0], ['barrel', 1.0, -3.2, 0], ['chest_body', 0, -3.2, 0]];
      for (const [name, x, z, ry] of stall) {
        const p = cloneProp(kit, name);
        p.position.set(x, 0, z);
        p.rotation.y = ry;
        group.add(p);
      }
      const glow = new FakeLight(0xffc870, 8, 7);
      glow.position.set(0, 2, -2);
      group.add(glow);
      def = { ...def, type: 'npc', shop: true };
    } else if (def.type === 'npc') {
      const barrel = cloneProp(kit, 'barrel');
      barrel.position.set(-0.6, 0, -1.9);
      const crate = cloneProp(kit, 'crate');
      crate.position.set(-0.4, 0, -2.8);
      crate.rotation.y = 0.4;
      group.add(barrel, crate);
    } else if (def.type === 'trap') {
      const rubble = cloneProp(kit, 'rubble');
      rubble.position.set(2.2, 0, -0.5);
      const bones = cloneProp(kit, 'bones');
      bones.position.set(-1.2, 0, -0.3);
      bones.rotation.y = 2;
      group.add(rubble, bones);
    }
  }
  if (def.enemyId) {
    const e = ENEMIES[def.enemyId];
    const model = kit?.pieces[e.model || `enemy_${def.enemyId}`];
    // Modèles Blender à l'échelle réelle ; seuls le rat (géant) est agrandi.
    const enemy = model ? cloneModel(model) : buildEnemy(e, mat);
    enemy.position.set(0, 0, e.boss ? (model ? -1.2 : -3.5) : -2.2);
    if (model && e.look) applyShinyLook(enemy, e.look, `enemy_${def.enemyId}`);
    if (model) enemy.scale.setScalar((e.scale || { rat_geant: 1.3, chef_gobelin: 1.15 }[def.enemyId] || 1) * (def.type === 'elite' ? 1.18 : 1));
    if (def.type === 'elite') {
      const aura = new FakeLight(0xff3020, 10, 5);
      aura.position.set(0, 1.2, enemy.position.z + 0.6);
      group.add(aura);
    }
    else if (e.boss && !e.scale) enemy.scale.setScalar(1.6);
    group.add(enemy);
    enemy.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (model) {
      const anim = new Animator(enemy);
      if (anim.rigged) props.anim = anim;
    }
    props.enemy = enemy;
    props.baseScale = enemy.scale.x;
    props.hpFrac = 1;
    props.ghost = e.shape === 'ghost';
  }
  if (def.type === 'chest') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), mat(0x7a4a22));
    body.position.set(0, 0.4, -1.5);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.8, -1.95);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.4, 6, 1, false, 0, Math.PI), mat(0x8b5a2b));
    lid.rotation.z = Math.PI / 2;
    lid.rotation.y = Math.PI / 2;
    lid.position.set(0, 0, 0.45);
    lidPivot.add(lid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 0.95), mat(0xc9a43b, { metalness: 0.6 }));
    band.position.set(0, 0.55, -1.5);
    group.add(body, lidPivot, band);
    const glow = new FakeLight(0xffd36b, 0, 5);
    glow.position.set(0, 1.2, -1.5);
    group.add(glow);
    props.lid = lidPivot;
    props.glow = glow;
  }
  if (def.type === 'trap') {
    const spikeMat = mat(0x999999, { metalness: 0.5 });
    for (let x = -2; x <= 2; x++) {
      for (let z = -1; z <= 1; z++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 4), spikeMat);
        s.position.set(x * 0.8, 0.1, z * 0.8 - 1);
        group.add(s);
      }
    }
    props.spikes = group.children.filter((c) => c.isMesh && c.geometry.type === 'ConeGeometry');
  }
  if (def.type === 'shrine') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1, 6), mat(0x888899));
    base.position.set(0, 0.5, -2);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), mat(0x66ffee, { emissive: 0x33aa99, emissiveIntensity: 1.2 }));
    gem.position.set(0, 1.7, -2);
    const l = new FakeLight(0x66ffee, 6, 6);
    l.position.copy(gem.position);
    group.add(base, gem, l);
    props.gem = gem;
  }
  if (def.type === 'npc' && kit?.pieces.npc_marchand) {
    const npc = cloneProp(kit, 'npc_marchand');
    npc.position.set(0.6, 0, -1.9);
    group.add(npc);
    const anim = new Animator(npc);
    if (anim.rigged) props.npcAnim = anim; else props.npc = npc;
  } else if (def.type === 'npc') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 6), mat(0x5d4e8c));
    robe.position.set(0.5, 0.75, -1.8);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), mat(0xe0b48a));
    head.position.set(0.5, 1.7, -1.8);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 6), mat(0x3e2f6b));
    hat.position.set(0.5, 2.05, -1.8);
    group.add(robe, head, hat);
    if (!kit) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.4), mat(0x8b6a3e));
      bag.position.set(-0.4, 0.25, -1.6);
      group.add(bag);
    }
    props.npc = head;
  }
  if (def.type === 'rest') {
    for (let k = 0; k < 6; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 5), mat(0x5a3a1a));
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (k / 6) * Math.PI;
      log.position.set(0, 0.1, -1.5);
      group.add(log);
    }
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 5), new THREE.MeshBasicMaterial({ color: 0xff7722 }));
    fire.position.set(0, 0.55, -1.5);
    const fl = new FakeLight(0xff8833, 8, 8);
    fl.position.set(0, 1, -1.5);
    group.add(fire, fl);
    props.fire = fire;
    props.fireLight = fl;
  }
  if (def.type === 'boss') {
    const portal = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 6, 16), mat(0x220033, { emissive: 0x8844ff, emissiveIntensity: 0.6 }));
    portal.position.set(0, 1.6, -def.shape.d / 2 - 1);
    group.add(portal);
    props.portal = portal;
  }
  return props;
}

function buildEnemy(e, mat) {
  const g = new THREE.Group();
  const m = mat(e.color, e.shape === 'ghost' ? { transparent: true, opacity: 0.75, emissive: e.color, emissiveIntensity: 0.3 } : {});
  const eyeMat = new THREE.MeshBasicMaterial({ color: e.boss ? 0xff2200 : 0xffee55 });
  const eyes = (y, z, spread = 0.12) => {
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), eyeMat);
      eye.position.set(s * spread, y, z);
      g.add(eye);
    }
  };
  if (e.shape === 'rat') {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), m);
    body.scale.set(1, 0.6, 1.5);
    body.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 5), m);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.4, 0.85);
    g.add(body, head);
    eyes(0.5, 0.85, 0.1);
  } else if (e.shape === 'ghost') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 7, 1, true), m);
    body.rotation.x = Math.PI;
    body.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), m);
    head.position.y = 2.2;
    g.add(body, head);
    eyes(2.25, 0.33);
  } else {
    const brute = e.shape === 'brute';
    const body = new THREE.Mesh(new THREE.BoxGeometry(brute ? 1.1 : 0.7, brute ? 1.2 : 0.9, brute ? 0.7 : 0.4), m);
    body.position.y = brute ? 1.3 : 1.05;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(brute ? 0.38 : 0.28, 0), m);
    head.position.y = brute ? 2.15 : 1.75;
    g.add(body, head);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, brute ? 0.75 : 0.6, 0.22), m);
      leg.position.set(s * 0.2, brute ? 0.37 : 0.3, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, brute ? 1 : 0.7, 0.18), m);
      arm.position.set(s * (brute ? 0.68 : 0.46), brute ? 1.3 : 1.05, 0);
      g.add(leg, arm);
    }
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), mat(0x777777, { metalness: 0.7 }));
    weapon.position.set(brute ? 0.75 : 0.5, brute ? 1.3 : 1.05, 0.35);
    weapon.rotation.x = 0.8;
    g.add(weapon);
    eyes(head.position.y + 0.03, brute ? 0.33 : 0.24);
  }
  return g;
}

function animateProps(p, t, dt) {
  if (p.anim) {
    // Ennemi articulé : l'animation gère attaque, coups reçus et mort ; on garde le flottement des spectres.
    p.anim.update(dt);
    if (p.ghost && !p.enemyDead) p.enemy.position.y = 0.25 + Math.sin(t * 2) * 0.15;
  } else if (p.enemy) {
    const target = p.enemyDead ? 0.001 : p.baseScale;
    const s = THREE.MathUtils.lerp(p.enemy.scale.x, target, dt * 4);
    p.enemy.scale.setScalar(s);
    p.enemy.position.y = p.ghost ? 0.3 + Math.sin(t * 2) * 0.2 : Math.abs(Math.sin(t * 3)) * 0.05;
    p.enemy.rotation.y = Math.sin(t * 1.3) * 0.25;
    if (p.enemyDead) p.enemy.rotation.z = THREE.MathUtils.lerp(p.enemy.rotation.z, 1.4, dt * 3);
  }
  if (p.lid) {
    p.lid.rotation.x = THREE.MathUtils.lerp(p.lid.rotation.x, p.chestOpen ? -1.9 : 0, dt * 4);
    p.glow.intensity = THREE.MathUtils.lerp(p.glow.intensity, p.chestOpen ? 8 : 0, dt * 3);
  }
  if (p.gem) { p.gem.rotation.y += dt; p.gem.position.y = (p.gemY || 1.7) + Math.sin(t * 2) * 0.1; }
  if (p.npc) p.npc.rotation.y = Math.sin(t) * 0.4;
  if (p.npcAnim) p.npcAnim.update(dt);
  if (p.fire) { p.fire.scale.y = 1 + Math.sin(t * 13) * 0.15; p.fireLight.intensity = 7 + Math.sin(t * 17) * 1.5; }
  if (p.portal) p.portal.rotation.z += dt * 0.6;
  if (p.spikes) p.spikes.forEach((s, i) => { s.position.y = 0.05 + Math.max(0, Math.sin(t * 2 + i)) * 0.15; });
}
