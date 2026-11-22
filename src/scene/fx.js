// Effets visuels légers : gerbes de particules, projectiles magiques, anneaux de soin.
// Aucune lumière n'est créée à la volée (cela forcerait three.js à recompiler les shaders) :
// une seule lumière de projectile est réutilisée.
import * as THREE from 'three';

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.tex = dotTexture();
    this.items = [];
    this.light = new THREE.PointLight(0xffaa55, 0, 8, 1.6);
    scene.add(this.light);
  }

  /** Gerbe de particules (étincelles, sang, poussière, éclats magiques). */
  burst(pos, color = 0xffcc66, { count = 24, speed = 3, life = 0.7, size = 0.18, gravity = -6, up = 1.5, spread = 1 } = {}) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const v = [];
    for (let i = 0; i < count; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2 * spread, Math.random() * up, (Math.random() - 0.5) * 2 * spread).normalize();
      v.push(dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({
      color, size, map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.items.push({ kind: 'burst', obj: pts, v, life, t: 0, gravity });
  }

  /** Projectile (boule de feu, trait magique) de `from` vers `to`, avec traînée. */
  projectile(from, to, color = 0x66aaff, { duration = 0.45, size = 0.22, onHit } = {}) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), new THREE.MeshBasicMaterial({ color }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(size * 6);
    mesh.add(halo);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.light.color.set(color);
    this.items.push({ kind: 'proj', obj: mesh, from: from.clone(), to: to.clone(), duration, t: 0, onHit, color, trail: 0 });
  }

  /** Anneau qui s'élargit au sol (soin, prière, onde de choc). */
  ring(pos, color = 0x88ff99, { radius = 1.6, life = 0.9 } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.45, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos).setY(0.05);
    this.scene.add(mesh);
    this.items.push({ kind: 'ring', obj: mesh, life, t: 0, radius });
  }

  /** Arc de coup d'arme devant un personnage. */
  slash(pos, color = 0xffffff, dir = 1) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 24, 1, Math.PI * 0.15, Math.PI * 0.7),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    mesh.position.copy(pos);
    mesh.rotation.set(0, 0, dir * 0.6);
    this.scene.add(mesh);
    this.items.push({ kind: 'slash', obj: mesh, life: 0.3, t: 0 });
  }

  update(dt) {
    this.light.intensity *= 0.85;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.kind === 'burst') {
        const a = it.obj.geometry.attributes.position;
        for (let k = 0; k < it.v.length; k++) {
          it.v[k].y += it.gravity * dt;
          a.array[k * 3] += it.v[k].x * dt;
          a.array[k * 3 + 1] = Math.max(0.02, a.array[k * 3 + 1] + it.v[k].y * dt);
          a.array[k * 3 + 2] += it.v[k].z * dt;
        }
        a.needsUpdate = true;
        it.obj.material.opacity = Math.max(0, 1 - it.t / it.life);
        if (it.t >= it.life) this.remove(i);
      } else if (it.kind === 'proj') {
        const f = Math.min(1, it.t / it.duration);
        it.obj.position.lerpVectors(it.from, it.to, f);
        it.obj.position.y += Math.sin(f * Math.PI) * 0.5;
        it.obj.rotation.x += dt * 10;
        this.light.position.copy(it.obj.position);
        this.light.intensity = 25;
        it.trail += dt;
        if (it.trail > 0.03) {
          it.trail = 0;
          this.burst(it.obj.position, it.color, { count: 4, speed: 0.6, life: 0.35, size: 0.14, gravity: 0, up: 1 });
        }
        if (f >= 1) {
          it.onHit?.(it.to.clone());
          this.burst(it.to, it.color, { count: 40, speed: 4, life: 0.7, size: 0.22 });
          this.light.intensity = 40;
          this.remove(i);
        }
      } else if (it.kind === 'ring') {
        const f = it.t / it.life;
        it.obj.scale.setScalar(1 + f * it.radius * 3);
        it.obj.material.opacity = Math.max(0, 1 - f);
        if (f >= 1) this.remove(i);
      } else if (it.kind === 'slash') {
        const f = it.t / it.life;
        it.obj.rotation.z -= dt * 9;
        it.obj.material.opacity = Math.max(0, 1 - f);
        if (f >= 1) this.remove(i);
      }
    }
  }

  remove(i) {
    const it = this.items[i];
    this.scene.remove(it.obj);
    it.obj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    this.items.splice(i, 1);
  }
}
