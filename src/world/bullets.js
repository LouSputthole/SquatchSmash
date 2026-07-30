/**
 * Holes, and the flash that makes them.
 *
 * A pooled set of quads laid flat against whatever was shot, oriented to the
 * surface normal rather than to a fixed plane -- which is the difference
 * between this and SplatSystem next door. The glue only ever lands on one
 * known wall, so it can cheat; a bullet goes wherever the crosshair was, and
 * a hole floating a centimetre off a skirting board at the wrong angle is
 * immediately wrong.
 *
 * The pool is small on purpose. He has six rounds and there is nothing to
 * reload with, so there is a hard ceiling on how much of this can ever exist,
 * and holes are cheaper to keep than to recycle.
 */
import * as THREE from 'three';

/** Six in the cylinder, and a couple spare in case something splits a shot. */
const MAX = 8;
/** How far off the surface the decal floats, to beat z-fighting. */
const LIFT = 0.004;

let _tex = null;

/** Dark pit, bright lip, and the plaster cracking away from it. */
function holeTexture() {
  if (_tex) return _tex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');

  // Dust halo first, so everything else sits on top of it.
  const halo = g.createRadialGradient(S / 2, S / 2, S * 0.10, S / 2, S / 2, S * 0.48);
  halo.addColorStop(0, 'rgba(60,54,48,0.55)');
  halo.addColorStop(0.55, 'rgba(90,84,76,0.20)');
  halo.addColorStop(1, 'rgba(120,114,104,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);

  // Cracks, before the hole, so they appear to run out from under it.
  g.strokeStyle = 'rgba(48,42,38,0.5)';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.4;
    const len = S * (0.16 + ((i * 7) % 5) / 26);
    g.lineWidth = 1.6 - (i % 3) * 0.4;
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(a) * S * 0.10, S / 2 + Math.sin(a) * S * 0.10);
    g.lineTo(S / 2 + Math.cos(a + 0.12) * len, S / 2 + Math.sin(a + 0.12) * len);
    g.stroke();
  }

  // The lip: brighter than the wall, because the paint has blown off it.
  g.fillStyle = 'rgba(226,220,208,0.85)';
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.165, 0, 7);
  g.fill();

  // The hole.
  const pit = g.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S * 0.135);
  pit.addColorStop(0, 'rgba(6,5,5,1)');
  pit.addColorStop(0.7, 'rgba(16,13,12,1)');
  pit.addColorStop(1, 'rgba(40,34,30,0.9)');
  g.fillStyle = pit;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.135, 0, 7);
  g.fill();

  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}

let _bloodTex = null;

/** Dark centre, bright arterial edge, and a scatter of droplets. */
function bloodTexture() {
  if (_bloodTex) return _bloodTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');

  const core = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S * 0.30);
  core.addColorStop(0, 'rgba(60,6,8,0.95)');
  core.addColorStop(0.55, 'rgba(110,14,16,0.85)');
  core.addColorStop(1, 'rgba(140,20,20,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, S, S);

  // Droplets thrown out from the centre, heavier on one side.
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + (i % 5) * 0.21;
    const d = S * (0.18 + ((i * 11) % 7) / 24);
    const r = 1.2 + ((i * 5) % 4);
    g.fillStyle = `rgba(${96 + (i % 3) * 18},10,12,${0.5 + (i % 3) * 0.15})`;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d * (i % 2 ? 1 : 0.6), S / 2 + Math.sin(a) * d, r, 0, 7);
    g.fill();
  }

  _bloodTex = new THREE.CanvasTexture(c);
  _bloodTex.colorSpace = THREE.SRGBColorSpace;
  return _bloodTex;
}

export class BulletHoles {
  constructor(scene, kind = 'hole') {
    this.scene = scene;
    this.pool = [];
    this.next = 0;

    const size = kind === 'blood' ? 0.17 : 0.09;
    const mat = new THREE.MeshBasicMaterial({
      map: kind === 'blood' ? bloodTexture() : holeTexture(),
      transparent: true,
      depthWrite: false,
      /* Sits in front of whatever it is on, and must not fight it. The lift
       * handles most of that; polygonOffset covers surfaces at a glancing
       * angle, where a fixed lift is not enough. */
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.pool.push(m);
    }

    /* The flash. One light, reused -- six of them would be six shadow-casting
     * lights in a room that only has two, for a total of about 50ms of visible
     * effect each. */
    this.flash = new THREE.PointLight(0xffd9a0, 0, 5.5, 2.0);
    this.flash.visible = false;
    scene.add(this.flash);
    this._flashT = 0;
  }

  /**
   * Put a hole where something was hit.
   * @param {THREE.Vector3} point
   * @param {THREE.Vector3} normal  surface normal, world space
   */
  punch(point, normal) {
    const m = this.pool[this.next % this.pool.length];
    this.next++;
    m.position.copy(point).addScaledVector(normal, LIFT);
    /* Face along the normal. lookAt orients -Z at the target, and a plane's
     * face is +Z, so aim it at a point OUT from the surface rather than at the
     * surface itself -- otherwise every hole is drawn facing into the wall. */
    m.lookAt(point.clone().addScaledVector(normal, 1));
    m.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.85 + Math.random() * 0.4;
    m.scale.set(s, s, 1);
    m.visible = true;
  }

  /** Light the room for an instant from `at`. */
  muzzle(at) {
    this.flash.position.copy(at);
    this.flash.visible = true;
    this.flash.intensity = 9;
    this._flashT = 0.055;
  }

  update(dt) {
    if (this._flashT <= 0) return;
    this._flashT -= dt;
    // Falls off fast and unevenly, the way a powder flash does.
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 190);
    if (this._flashT <= 0 || this.flash.intensity <= 0) {
      this.flash.visible = false;
      this.flash.intensity = 0;
      this._flashT = 0;
    }
  }

  /** Wipe the holes, for a fresh run. */
  reset() {
    for (const m of this.pool) m.visible = false;
    this.next = 0;
  }
}
