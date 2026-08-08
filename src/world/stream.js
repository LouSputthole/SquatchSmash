/**
 * Liquid stream + the mess it leaves.
 *
 * Droplets are pooled, fall under gravity, and stop when they hit something.
 * Collision reuses the apartment's existing collider boxes, so the stream
 * splashes off walls, the fridge, the couch -- anything solid -- and stains
 * whichever face it actually struck. Everything else lands on the floor.
 *
 * Stains are pooled decals that merge when they land near each other, so a
 * sustained stream grows one puddle instead of stacking hundreds of quads.
 */
import * as THREE from 'three';

const DROPS = 140;
const STAINS = 56;
const GRAVITY = -9.4;

let _stainTex = null;

/** Soft irregular blob, so puddles do not read as perfect circles. */
function stainTexture() {
  if (_stainTex) return _stainTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');

  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.85, 'rgba(255,255,255,0.20)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, 7);
  g.fill();

  // Nibble the edge so the outline is uneven.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = (0.36 + Math.random() * 0.2) * S;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, S * (0.10 + Math.random() * 0.14), 0, 7);
    g.fill();
  }

  _stainTex = new THREE.CanvasTexture(c);
  _stainTex.colorSpace = THREE.SRGBColorSpace;
  return _stainTex;
}

export class StreamSystem {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.target = null;      // { centre: Vector3, radius, top } -- scores a clean hit
    this.ignore = null;      // collider to skip (the toilet itself)
    this.floorHeight = 0;

    this.stats = { total: 0, onTarget: 0, onFloor: 0, onWall: 0 };

    /* ---- droplets ---- */
    const dropGeo = new THREE.SphereGeometry(1, 6, 5);
    const dropMat = new THREE.MeshStandardMaterial({
      color: 0xe8d24a, roughness: 0.15, metalness: 0,
      transparent: true, opacity: 0.72, emissive: 0x3a3208, emissiveIntensity: 0.3,
    });
    this.drops = [];
    for (let i = 0; i < DROPS; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.visible = false;
      m.castShadow = false;
      m.receiveShadow = false;
      scene.add(m);
      this.drops.push({ mesh: m, vel: new THREE.Vector3(), life: 0, alive: false });
    }
    this._nextDrop = 0;

    /* ---- stains ---- */
    const stainGeo = new THREE.CircleGeometry(0.5, 18);
    this.stains = [];
    for (let i = 0; i < STAINS; i++) {
      const m = new THREE.Mesh(stainGeo, new THREE.MeshStandardMaterial({
        map: stainTexture(),
        color: 0xd6c04a,
        roughness: 0.28,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }));
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.stains.push({ mesh: m, size: 0, used: false, pos: new THREE.Vector3() });
    }
    this._nextStain = 0;
    this._emitAcc = 0;
  }

  /** Boxes the stream can splash off. Pass the apartment's collider list. */
  setColliders(list) {
    this.colliders = list;
  }

  /** Floor under the active fixture. Defaults to the apartment's y=0. */
  setFloorHeight(y = 0) {
    this.floorHeight = Number.isFinite(y) ? y : 0;
  }

  /**
   * The toilet bowl: hits inside it count, and leave no mess.
   *
   * `ignore` is the toilet's own collider box. Without skipping it the stream
   * splashes off the porcelain on the way down and never reaches the water.
   */
  setTarget(centre, radius, top, ignore = null) {
    this.target = { centre: centre.clone(), radius, top };
    this.ignore = ignore;
  }

  /**
   * Emit for this frame. Call every frame while the stream is running.
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} dir     unit aim direction
   * @param {number} dt
   * @param {number} power          0..1, tapers off as the tank empties
   */
  emit(origin, dir, dt, power = 1) {
    // Fixed emission rate, independent of frame rate.
    this._emitAcc += dt * (60 + power * 60);
    let n = Math.floor(this._emitAcc);
    this._emitAcc -= n;
    if (n > 8) n = 8;

    for (let i = 0; i < n; i++) {
      const d = this.drops[this._nextDrop];
      this._nextDrop = (this._nextDrop + 1) % this.drops.length;

      d.mesh.visible = true;
      d.alive = true;
      d.life = 0;
      d.mesh.position.copy(origin);
      // A little jitter so it is a stream and not a laser.
      d.mesh.position.x += (Math.random() - 0.5) * 0.012;
      d.mesh.position.y += (Math.random() - 0.5) * 0.012;
      d.mesh.position.z += (Math.random() - 0.5) * 0.012;

      const speed = (2.6 + power * 2.2) * (0.9 + Math.random() * 0.2);
      d.vel.copy(dir).multiplyScalar(speed);
      d.vel.x += (Math.random() - 0.5) * 0.28;
      d.vel.y += (Math.random() - 0.5) * 0.18;
      d.vel.z += (Math.random() - 0.5) * 0.28;

      const s = 0.008 + Math.random() * 0.006;
      d.mesh.scale.set(s, s, s);
    }
  }

  update(dt) {
    for (const d of this.drops) {
      if (!d.alive) continue;

      d.life += dt;
      d.vel.y += GRAVITY * dt;

      const p = d.mesh.position;
      const nx = p.x + d.vel.x * dt;
      const ny = p.y + d.vel.y * dt;
      const nz = p.z + d.vel.z * dt;

      // Stretch along travel so fast drops read as streaks.
      const sp = Math.hypot(d.vel.x, d.vel.y, d.vel.z);
      const base = 0.009;
      d.mesh.scale.set(base, base * (1 + Math.min(2.4, sp * 0.22)), base);

      // Into the bowl? Tested as a volume under the seat, not a plane, so a
      // drop cannot step straight past it in one frame.
      if (this.target) {
        const t = this.target;
        if (ny <= t.top && ny > t.top - 0.45) {
          const dx = nx - t.centre.x;
          const dz = nz - t.centre.z;
          if (dx * dx + dz * dz <= t.radius * t.radius) {
            this._kill(d);
            this.stats.total++;
            this.stats.onTarget++;
            continue;
          }
        }
      }

      // Floor.
      if (ny <= this.floorHeight + 0.004) {
        this._stain(nx, this.floorHeight + 0.006, nz, UP);
        this._kill(d);
        this.stats.total++;
        this.stats.onFloor++;
        continue;
      }

      // Solid things.
      const hit = this._hitBox(nx, ny, nz);
      if (hit) {
        this._stain(hit.x, hit.y, hit.z, hit.normal);
        this._kill(d);
        this.stats.total++;
        this.stats.onWall++;
        continue;
      }

      p.set(nx, ny, nz);
      if (d.life > 4) this._kill(d);
    }

    // Stains creep outward for a moment after they land.
    for (const s of this.stains) {
      if (!s.used) continue;
      const want = Math.min(0.42, s.size);
      const cur = s.mesh.scale.x;
      if (cur < want) s.mesh.scale.setScalar(cur + (want - cur) * Math.min(1, dt * 3));
      if (s.mesh.material.opacity < 0.55) {
        s.mesh.material.opacity = Math.min(0.55, s.mesh.material.opacity + dt * 0.9);
      }
    }
  }

  /** Which face of which box did we enter, if any. */
  _hitBox(x, y, z) {
    for (const b of this.colliders) {
      if (b === this.ignore) continue;
      if (x < b.min.x || x > b.max.x || y < b.min.y || y > b.max.y || z < b.min.z || z > b.max.z) {
        continue;
      }
      // Inside: push out along the shallowest axis and stain that face.
      const dxMin = x - b.min.x, dxMax = b.max.x - x;
      const dyMin = y - b.min.y, dyMax = b.max.y - y;
      const dzMin = z - b.min.z, dzMax = b.max.z - z;
      const m = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax);
      if (m === dxMin) return { x: b.min.x - 0.004, y, z, normal: NEG_X };
      if (m === dxMax) return { x: b.max.x + 0.004, y, z, normal: POS_X };
      if (m === dyMin) return { x, y: b.min.y - 0.004, z, normal: NEG_Y };
      if (m === dyMax) return { x, y: b.max.y + 0.004, z, normal: UP };
      if (m === dzMin) return { x, y, z: b.min.z - 0.004, normal: NEG_Z };
      return { x, y, z: b.max.z + 0.004, normal: POS_Z };
    }
    return null;
  }

  _kill(d) {
    d.alive = false;
    d.mesh.visible = false;
  }

  /** Land a stain, merging into a nearby one if there is one. */
  _stain(x, y, z, normal) {
    const NEAR = 0.13;
    for (const s of this.stains) {
      if (!s.used) continue;
      if (Math.abs(s.pos.x - x) < NEAR && Math.abs(s.pos.y - y) < NEAR && Math.abs(s.pos.z - z) < NEAR) {
        s.size = Math.min(0.42, s.size + 0.006);
        return;
      }
    }
    const s = this.stains[this._nextStain];
    this._nextStain = (this._nextStain + 1) % this.stains.length;
    s.used = true;
    s.size = 0.07;
    s.pos.set(x, y, z);
    s.mesh.visible = true;
    s.mesh.position.set(x, y, z);
    s.mesh.scale.setScalar(0.03);
    s.mesh.material.opacity = 0.12;
    // Lie the decal flat against whatever it hit.
    if (normal === UP) s.mesh.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    else if (normal === NEG_Y) s.mesh.rotation.set(Math.PI / 2, 0, Math.random() * 6.28);
    else s.mesh.lookAt(x + normal.x, y + normal.y, z + normal.z);
  }

  resetStats() {
    this.stats = { total: 0, onTarget: 0, onFloor: 0, onWall: 0 };
  }

  /** Mop up. */
  clear() {
    for (const d of this.drops) this._kill(d);
    for (const s of this.stains) {
      s.used = false;
      s.size = 0;
      s.mesh.visible = false;
      s.mesh.material.opacity = 0;
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const NEG_Y = new THREE.Vector3(0, -1, 0);
const POS_X = new THREE.Vector3(1, 0, 0);
const NEG_X = new THREE.Vector3(-1, 0, 0);
const POS_Z = new THREE.Vector3(0, 0, 1);
const NEG_Z = new THREE.Vector3(0, 0, -1);
