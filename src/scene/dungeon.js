// Donjon 3D low-poly : une file de salles reliées par des couloirs le long de l'axe -Z.
// La caméra glisse d'une salle à l'autre. Tout est généré en code (pas d'assets externes) ;
// plus tard, les props pourront être remplacés par des modèles GLB faits dans Blender.
import * as THREE from 'three';
import { ENEMIES } from '../data/events.js';
import { loadKit, tintKit, Batch, cloneProp, seeded } from './kit.js';

const SPACING = 20; // distance entre centres de salles
const WALL_H = 4;

export function createDungeonScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 120);
  const world = new THREE.Group();
  scene.add(world);
  scene.add(new THREE.HemisphereLight(0x8899bb, 0x221811, 0.7));
  const fill = new THREE.PointLight(0xffe2c0, 6, 12, 1.5); // lumière portée par le groupe
  camera.add(fill);
  scene.add(camera);

  let rooms = [];
  let current = 0;
  let camFrom = new THREE.Vector3();
  let camTo = new THREE.Vector3();
  let camT = 1;
  const clock = new THREE.Clock();
  let running = true;
  let flashLight = new THREE.PointLight(0xffffff, 0, 14);
  scene.add(flashLight);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

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
    .then((k) => { kit = k; if (lastBuild) { const keep = current; build(...lastBuild); jumpTo(keep); } })
    .catch((e) => console.warn('Kit 3D indisponible, rendu simplifié :', e));

  function jumpTo(i) {
    if (!rooms[i]) return;
    current = i;
    camT = 1;
    placeCamera(i, camTo);
    camera.position.copy(camTo);
    updateLights();
  }

  // Coque d'une salle (sol, murs, arches, piliers, torches, couloir, décor) avec le kit Blender.
  function shellKit(g, def, i, W, D, corridorLen, pal) {
    tintKit(kit, pal);
    const B = new Batch(kit);
    const rnd = seeded(i * 7919 + W * 131 + D * 17 + def.shape.torches);
    const door = 3;
    for (let x = -W / 2 + 1; x < W / 2; x += 2) {
      for (let z = -D / 2 + 1; z < D / 2; z += 2) B.add(`floor_${Math.floor(rnd() * 3)}`, [x, 0, z], Math.floor(rnd() * 4) * Math.PI / 2);
    }
    const run = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.3) return;
      const n = Math.max(1, Math.round(L / 2));
      const rot = Math.atan2(-(bz - az), bx - ax);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        B.add(`wall_${Math.floor(rnd() * 2)}`, [ax + (bx - ax) * t, 0, az + (bz - az) * t], rot, [L / n / 2, 1, 1]);
      }
    };
    for (const z of [-D / 2, D / 2]) {
      run(-W / 2, z, -door / 2, z);
      run(door / 2, z, W / 2, z);
      B.add('door_arch', [0, 0, z]);
    }
    run(-W / 2, D / 2, -W / 2, -D / 2);
    run(W / 2, D / 2, W / 2, -D / 2);
    for (let p = 0; p < def.shape.pillars; p++) B.add('pillar', [(p % 2 ? 1 : -1) * (W / 2 - 2), 0, (p < 2 ? -1 : 1) * (D / 2 - 2.5)]);

    if (corridorLen > 0) {
      const z0 = -D / 2, z1 = -D / 2 - corridorLen;
      const n = Math.max(1, Math.round(corridorLen / 2));
      const seg = corridorLen / n;
      for (let k = 0; k < n; k++) {
        const z = z0 - seg * (k + 0.5);
        B.add(`floor_${Math.floor(rnd() * 3)}`, [0, 0, z], 0, [door / 2, 1, seg / 2]);
        B.add('ceiling', [0, WALL_H - 0.3, z], 0, [(door + 1.2) / 2, 1, seg / 2]);
      }
      run(-door / 2 - 0.3, z0, -door / 2 - 0.3, z1);
      run(door / 2 + 0.3, z0, door / 2 + 0.3, z1);
    }
    B.flush(g);

    // Torches murales avec flamme
    const flameMat = new THREE.MeshBasicMaterial({ color: pal.torch });
    const flameGeo = new THREE.ConeGeometry(0.09, 0.28, 5);
    for (let t = 0; t < def.shape.torches; t++) {
      const left = t % 2 === 0;
      const torch = cloneProp(kit, 'torch');
      torch.position.set(left ? -W / 2 + 0.3 : W / 2 - 0.3, 2.1, -D / 2 + ((t >> 1) + 1) * (D / 3));
      torch.rotation.y = left ? -Math.PI / 2 : Math.PI / 2;
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(0, 0.72, -0.36);
      flame.userData.flame = true;
      torch.add(flame);
      g.add(torch);
    }

    // Décor aléatoire dans les coins (le centre reste libre pour l'événement)
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sz] of corners) {
      if (rnd() < 0.35) continue;
      const name = ['barrel', 'crate', 'bones', 'rubble', 'barrel'][Math.floor(rnd() * 5)];
      const p = cloneProp(kit, name);
      p.position.set(sx * (W / 2 - 1.1 - rnd() * 0.5), 0, sz * (D / 2 - 1.4 - rnd() * 0.6));
      p.rotation.y = rnd() * Math.PI * 2;
      g.add(p);
      if (name === 'crate' && rnd() < 0.5) {
        const top = cloneProp(kit, 'crate');
        top.position.copy(p.position).setY(0.8);
        top.rotation.y = rnd() * Math.PI;
        top.scale.setScalar(0.8);
        g.add(top);
      }
    }
    for (const sx of [-1, 1]) {
      if (rnd() < 0.5) continue;
      const b = cloneProp(kit, 'banner');
      b.position.set(sx * Math.min(W / 2 - 1, 3), 3.5, -D / 2 + 0.36);
      g.add(b);
    }
  }

  function build(roomDefs, level) {
    lastBuild = [roomDefs, level];
    clear();
    const pal = level.palette;
    scene.background = new THREE.Color(pal.fog);
    scene.fog = new THREE.Fog(pal.fog, 6, 34);
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
      if (kit) shellKit(g, def, i, W, D, nextDef ? SPACING - D / 2 - nextD / 2 : 0, pal);
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

      const light = new THREE.PointLight(pal.torch, 0, 22, 1.4);
      light.position.set(0, 3.2, 0);
      g.add(light);

      const props = buildProps(def, mat, kit);
      g.add(props.group);
      world.add(g);
      rooms.push({ def, group: g, light, props, D });
    });

    current = 0;
    camT = 1;
    placeCamera(0, camTo);
    camera.position.copy(camTo);
    updateLights();
  }

  function placeCamera(i, out) {
    const r = rooms[i];
    return out.set(0, 2.7, -i * SPACING + r.D / 2 - 1);
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

  function setRoomState({ enemyHpFrac = null, enemyDead = false, chestOpen = false } = {}) {
    const p = rooms[current]?.props;
    if (!p) return;
    if (p.enemy) {
      p.enemyDead = enemyDead;
      if (enemyHpFrac !== null) p.hpFrac = enemyHpFrac;
    }
    if (p.lid) p.chestOpen = chestOpen;
  }

  function flash(color = 0xff3333) {
    flashLight.color.set(color);
    flashLight.intensity = 40;
    flashLight.position.copy(camera.position).add(new THREE.Vector3(0, 0, -3));
  }

  function shakeHit() { shake = 0.35; }
  let shake = 0;

  function tick() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (camT < 1) {
      camT = Math.min(1, camT + dt / 2.2);
      const e = camT < 0.5 ? 2 * camT * camT : 1 - Math.pow(-2 * camT + 2, 2) / 2;
      camera.position.lerpVectors(camFrom, camTo, e);
      camera.position.y += Math.abs(Math.sin(camT * Math.PI * 8)) * 0.08 * (1 - camT);
    }
    const look = new THREE.Vector3(0, 1.1, camera.position.z - 7);
    camera.lookAt(look);
    if (shake > 0) {
      camera.position.x = (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - dt * 1.5);
      if (shake === 0) camera.position.x = 0;
    }
    flashLight.intensity *= 0.9;

    rooms.forEach((r, i) => {
      if (Math.abs(i - current) > 1) return;
      r.light.intensity = (i === current ? 16 : 6) * (0.9 + Math.sin(t * 9 + i) * 0.05 + Math.sin(t * 23) * 0.03);
      animateProps(r.props, t, dt);
    });
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    build, goToRoom, setRoomState, flash, shakeHit,
    get current() { return current; },
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
      const glow = new THREE.PointLight(0xffd36b, 0, 5);
      glow.position.set(0, 1.2, -2);
      group.add(body, lidPivot, glow);
      Object.assign(props, { lid: lidPivot, glow });
      def = { ...def, type: 'kit-done' };
    } else if (def.type === 'shrine') {
      const altar = cloneProp(kit, 'altar');
      altar.position.set(0, 0, -2.2);
      const gem = cloneProp(kit, 'gem');
      gem.position.set(0, 1.9, -2.2);
      const l = new THREE.PointLight(0x66ffee, 6, 6);
      l.position.set(0, 1.9, -2.2);
      group.add(altar, gem, l);
      Object.assign(props, { gem, gemY: 1.9 });
      def = { ...def, type: 'kit-done' };
    } else if (def.type === 'rest') {
      const camp = cloneProp(kit, 'campfire');
      camp.position.set(0, 0, -1.8);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 5), new THREE.MeshBasicMaterial({ color: 0xff7722 }));
      fire.position.set(0, 0.5, -1.8);
      const fl = new THREE.PointLight(0xff8833, 8, 8);
      fl.position.set(0, 1, -1.8);
      group.add(camp, fire, fl);
      Object.assign(props, { fire, fireLight: fl });
      def = { ...def, type: 'kit-done' };
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
    const model = kit?.pieces[`enemy_${def.enemyId}`];
    // Modèles Blender à l'échelle réelle ; seuls le rat (géant) est agrandi.
    const enemy = model ? model.clone(true) : buildEnemy(e, mat);
    enemy.position.set(0, 0, e.boss ? (model ? -1.2 : -3.5) : -2.2);
    if (model) enemy.scale.setScalar(def.enemyId === 'rat_geant' ? 1.4 : e.boss ? 1.3 : 1);
    else if (e.boss) enemy.scale.setScalar(1.6);
    group.add(enemy);
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
    const glow = new THREE.PointLight(0xffd36b, 0, 5);
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
    const l = new THREE.PointLight(0x66ffee, 6, 6);
    l.position.copy(gem.position);
    group.add(base, gem, l);
    props.gem = gem;
  }
  if (def.type === 'npc' && kit?.pieces.npc_marchand) {
    const npc = cloneProp(kit, 'npc_marchand');
    npc.position.set(0.6, 0, -1.9);
    group.add(npc);
    props.npc = npc;
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
    const fl = new THREE.PointLight(0xff8833, 8, 8);
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
  if (p.enemy) {
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
  if (p.fire) { p.fire.scale.y = 1 + Math.sin(t * 13) * 0.15; p.fireLight.intensity = 7 + Math.sin(t * 17) * 1.5; }
  if (p.portal) p.portal.rotation.z += dt * 0.6;
  if (p.spikes) p.spikes.forEach((s, i) => { s.position.y = 0.05 + Math.max(0, Math.sin(t * 2 + i)) * 0.15; });
}
