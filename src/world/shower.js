/**
 * The water coming out of the shower head.
 *
 * Two parts, because either one alone looks wrong: a translucent cone standing
 * in for the sheet of water leaving the rose, and a pool of falling streaks
 * that give it grain and speed. The cone on its own reads as a plastic
 * lampshade; the streaks on their own read as rain in an empty room.
 *
 * Streaks are drawn as a THREE.Points cloud with a vertically smeared sprite
 * rather than as line segments -- points cost one vertex each and the smear
 * gives the motion blur that makes falling water read as fast rather than as
 * hanging dots.
 *
 * Nothing here collides. It is a shower: everything lands in the tub, and the
 * tub is the one place in the flat where a puddle is the expected outcome.
 */
import * as THREE from 'three';

const DROPS = 260;
/** Head to tub floor, roughly. Drops recycle when they pass it. */
const FALL = 1.95;
const SPEED_MIN = 2.6;
const SPEED_MAX = 4.2;
/** How wide the spray has spread by the time it lands. */
const CONE = 0.20;

let _dropTex = null;

/** A single droplet: bright core, smeared downward into a short streak. */
function dropTexture() {
  if (_dropTex) return _dropTex;
  const W = 16;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.45, 'rgba(228,244,255,0.55)');
  grad.addColorStop(0.80, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(210,236,255,0)');
  g.fillStyle = grad;
  g.fillRect(W * 0.32, 0, W * 0.36, H);

  _dropTex = new THREE.CanvasTexture(c);
  _dropTex.colorSpace = THREE.SRGBColorSpace;
  return _dropTex;
}

export class ShowerSystem {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.on = false;
    this.t = 0;
    this.origin = new THREE.Vector3();

    /* ---- the sheet leaving the rose ---- */
    // Open-ended cone, widening as it falls, drawn from inside as well as out
    // so standing under it does not cull the far wall of the spray.
    this.cone = new THREE.Mesh(
      new THREE.ConeGeometry(CONE, FALL, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xdcefff,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.cone.visible = false;
    scene.add(this.cone);

    /* ---- the streaks ---- */
    this.pos = new Float32Array(DROPS * 3);
    this.vel = new Float32Array(DROPS);
    this.life = new Float32Array(DROPS);
    this.spread = new Float32Array(DROPS * 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: dropTexture(),
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);

    for (let i = 0; i < DROPS; i++) this._seed(i, Math.random());
  }

  /** Put drop `i` somewhere along the fall, so the spray starts full. */
  _seed(i, at) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());       // even across the disc, not clumped
    this.spread[i * 2] = Math.cos(a) * r;
    this.spread[i * 2 + 1] = Math.sin(a) * r;
    this.vel[i] = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    this.life[i] = at;
  }

  /** @param {THREE.Vector3} head where the water leaves the rose */
  start(head) {
    this.origin.copy(head);
    this.on = true;
    this.cone.position.set(head.x, head.y - FALL / 2, head.z);
    this.cone.visible = true;
    this.points.visible = true;
  }

  stop() {
    this.on = false;
    this.cone.visible = false;
    this.points.visible = false;
  }

  update(dt) {
    if (!this.on) return;
    this.t += dt;

    // The sheet breathes a little rather than sitting at one opacity.
    this.cone.material.opacity = 0.048 + Math.sin(this.t * 3.1) * 0.010;

    const o = this.origin;
    for (let i = 0; i < DROPS; i++) {
      this.life[i] += (this.vel[i] / FALL) * dt;
      if (this.life[i] >= 1) {
        this._seed(i, this.life[i] - 1);
      }
      const f = this.life[i];
      // Straight down, spreading as it goes -- a rose throws a cone, and the
      // spread has to grow with the fall or the column looks like a pipe.
      const j = i * 3;
      this.pos[j] = o.x + this.spread[i * 2] * CONE * f;
      this.pos[j + 1] = o.y - FALL * f;
      this.pos[j + 2] = o.z + this.spread[i * 2 + 1] * CONE * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
