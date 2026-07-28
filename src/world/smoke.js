/**
 * Smoke.
 *
 * A pooled set of soft billboard sprites. Used for cigarette smoke: thin
 * wisps curling off the ember continuously, and a real cloud on every exhale
 * that billows out in front of you, expands, slows, and drifts up.
 *
 * Sprites are used rather than meshes so the puffs always face the camera,
 * which is what makes a handful of quads read as volume.
 */
import * as THREE from 'three';

const POOL = 64;

let _texture = null;

/** Soft, slightly lumpy radial falloff. A clean gradient reads as a ball. */
function smokeTexture() {
  if (_texture) return _texture;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');

  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  // Break the perfect circle up so overlapping puffs look like one mass.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = (0.28 + Math.random() * 0.34) * S / 2;
    const rad = (0.06 + Math.random() * 0.16) * S;
    const blob = g.createRadialGradient(
      S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 0,
      S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, rad,
    );
    blob.addColorStop(0, `rgba(0,0,0,${0.10 + Math.random() * 0.16})`);
    blob.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = blob;
    g.fillRect(0, 0, S, S);
  }

  _texture = new THREE.CanvasTexture(c);
  _texture.colorSpace = THREE.SRGBColorSpace;
  return _texture;
}

export class SmokeSystem {
  constructor(scene) {
    this.scene = scene;
    this.puffs = [];

    const tex = smokeTexture();
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        color: 0xb6bac2,
        fog: true,
      });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.renderOrder = 5;
      scene.add(s);
      this.puffs.push({
        sprite: s,
        life: 0, max: 1,
        vel: new THREE.Vector3(),
        spin: 0,
        size0: 0.05,
        size1: 0.4,
        peak: 0.3,
      });
    }
    this._next = 0;
  }

  _take() {
    // Round-robin: the oldest puff is recycled if we run out, which is fine
    // at this scale and avoids ever allocating mid-frame.
    const p = this.puffs[this._next];
    this._next = (this._next + 1) % this.puffs.length;
    return p;
  }

  /**
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} dir      unit direction the smoke is pushed in
   * @param {object} o  { count, speed, spread, size0, size1, life, peak, rise }
   */
  emit(origin, dir, o = {}) {
    const {
      count = 1, speed = 0.5, spread = 0.25,
      size0 = 0.05, size1 = 0.45, life = 2.6, peak = 0.10, rise = 0.16,
    } = o;

    for (let i = 0; i < count; i++) {
      const p = this._take();
      p.sprite.visible = true;
      p.sprite.position.copy(origin);
      p.sprite.position.x += (Math.random() - 0.5) * 0.04;
      p.sprite.position.y += (Math.random() - 0.5) * 0.04;
      p.sprite.position.z += (Math.random() - 0.5) * 0.04;

      p.vel.copy(dir).multiplyScalar(speed * (0.6 + Math.random() * 0.8));
      p.vel.x += (Math.random() - 0.5) * spread;
      p.vel.y += (Math.random() - 0.5) * spread * 0.6 + rise * 0.35;
      p.vel.z += (Math.random() - 0.5) * spread;

      p.life = 0;
      p.max = life * (0.75 + Math.random() * 0.5);
      p.size0 = size0 * (0.8 + Math.random() * 0.4);
      p.size1 = size1 * (0.75 + Math.random() * 0.6);
      p.peak = peak;
      p.rise = rise;
      p.spin = (Math.random() - 0.5) * 0.7;
      p.sprite.material.opacity = 0;
      p.sprite.material.rotation = Math.random() * Math.PI * 2;
      p.sprite.scale.setScalar(p.size0);
    }
  }

  /** A single thin wisp, for smoke curling off a resting ember. */
  wisp(origin) {
    this.emit(origin, UP, {
      count: 1, speed: 0.10, spread: 0.035,
      size0: 0.012, size1: 0.14, life: 2.4, peak: 0.075, rise: 0.14,
    });
  }

  update(dt) {
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;

      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        p.sprite.visible = false;
        p.sprite.material.opacity = 0;
        continue;
      }

      // Air drag, then buoyancy takes over as it slows.
      const drag = Math.exp(-dt * 1.9);
      p.vel.multiplyScalar(drag);
      p.vel.y += p.rise * dt;
      p.sprite.position.addScaledVector(p.vel, dt);

      // Grows the whole time; fades in fast, out slow.
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * easeOut(k));
      p.sprite.material.rotation += p.spin * dt;
      p.sprite.material.opacity = k < 0.12
        ? (k / 0.12) * p.peak
        : p.peak * (1 - (k - 0.12) / 0.88);
    }
  }

  dispose() {
    for (const p of this.puffs) {
      this.scene.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.puffs.length = 0;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }
