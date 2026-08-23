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
 *
 * THE RING, THE PROJECTION AND THE RECYCLING RULE NOW LIVE IN `decals.js`,
 * which is where blood.js takes them from as well. What is left here is what
 * is actually about being shot at: the plaster skin, the revolver-sized
 * ceiling above, and the muzzle flash -- which is not a decal at all and is
 * only in this class because the thing that punches a hole is the thing that
 * lights the room while it does it.
 */
import * as THREE from 'three';
import { DecalPool, decalTexture, woundDecalOptions } from './decals.js';

/** Six in the cylinder, and a couple spare in case something splits a shot. */
const MAX = 8;

/** Dark pit, bright lip, and the plaster cracking away from it. */
function holeTexture() {
  return decalTexture('bullets.hole', (g, S) => {
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
  });
}

/** A hole in a room: small, single-sided, and lifted off the plaster. */
function holeDecalOptions() {
  return {
    size: 0.09,
    renderOrder: 3,
    material: new THREE.MeshBasicMaterial({
      map: holeTexture(),
      transparent: true,
      depthWrite: false,
      /* Plaster is not a body: a hole is only ever seen from the side the
       * round arrived on, so it pays for one face rather than two. */
      side: THREE.FrontSide,
      /* Sits in front of whatever it is on, and must not fight it. The lift
       * handles most of that; polygonOffset covers surfaces at a glancing
       * angle, where a fixed lift is not enough. */
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  };
}

/**
 * A revolver's worth of holes, in one of two flavours.
 *
 * `kind` is 'hole' for a room and 'blood' for a person; the wound skin comes
 * from decals.js so the marks this leaves on a man and the ones
 * BloodImpactSystem leaves on him are the same marks.
 */
export class BulletHoles extends DecalPool {
  constructor(scene, kind = 'hole', { capacity = MAX, random = Math.random } = {}) {
    super(scene, {
      capacity,
      random,
      ...(kind === 'blood' ? woundDecalOptions() : holeDecalOptions()),
    });

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
    return this.place(point, normal);
  }

  /** Put a wound on a moving actor so it follows their fall, not the room. */
  punchAttached(parent, point, normal) {
    return this.placeOn(parent, point, normal);
  }

  /** Light the room for an instant from `at`. */
  muzzle(at) {
    this.flash.position.copy(at);
    this.flash.visible = true;
    this.flash.intensity = 9;
    this._flashT = 0.055;
  }

  update(dt) {
    super.update(dt);
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
}
