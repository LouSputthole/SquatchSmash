/**
 * The Fat Squatch going off.
 *
 * Owner, 2026-08-04: "the EXPLOSION should be absolutely ridiculously
 * thermonuclear tsar bomba level insanity hardcore badass." The previous pass
 * built a good one — a 900 m flash, four fireball shells, a stem and a cap over
 * eighteen seconds — and this is that event rebuilt as a set-piece with a
 * timeline rather than a bag of tweens. The four things the brief names are the
 * four things this file is organised around:
 *
 *   THE FLASH THAT WHITES OUT THE COCKPIT. `screenFlash` is a 0..1 number this
 *     class publishes every frame; `../main.js` paints it as a full-screen
 *     overlay. It is not one ramp: a real device flashes TWICE — the first
 *     pulse is the bare fireball, then the shock front races out in front of it
 *     and the opaque shocked air HIDES the fireball (the "hydrodynamic
 *     separation" minimum), then the shock goes transparent and the much
 *     bigger, hotter ball behind it comes back brighter and stays. That double
 *     pulse is the single most recognisable thing about a nuclear detonation
 *     and it is why this does not just fade out from white.
 *
 *   THE SHOCK FRONT VISIBLY CROSSING THE GROUND. `shockRadius` grows on a
 *     Taylor–Sedov-ish curve — very fast, decaying to the speed of sound — and
 *     is drawn as a bright ring, a dust annulus dragging behind it, and a
 *     scorch disc that stays. The same radius is handed to `onShockFront`
 *     every frame, which is what lets `TargetCity` knock its outskirts down
 *     progressively as the ring reaches them instead of all at once at t=0.
 *
 *   THE COLUMN AND THE CAP. The fireball detaches from the ground and climbs
 *     under its own buoyancy, cooling white -> yellow -> orange -> deep red ->
 *     brown smoke; the stem is drawn up behind it; the cap unrolls off the top
 *     with a real torus of rolling smoke inside it (that roll is what makes a
 *     mushroom a mushroom rather than a lollipop); a skirt spreads at the base
 *     where the afterwind is dragging dirt back in.
 *
 *   THE LIGHT COMING BACK. Two real lights, not one: a colossal short one for
 *     the flash and the fireball, and a long, dim, warm one that keeps the
 *     landscape lit from the wrong direction for half a minute and then lets
 *     the night close back over it. `screenFlash` bleeds down through a warm
 *     afterimage rather than cutting, because that is what an eye does.
 *
 * NOTHING IN THIS FILE TOUCHES THE AEROPLANE. The buffet, the damage and the
 * late-arriving sound all belong to `../mission/MissionController.js`, which
 * owns the physics and reads `shockRadius` to decide when the front reaches
 * the aircraft. This file is scene dressing with a clock.
 *
 * Cost: one group, about thirty meshes and two lights, all unlit or basic
 * except the debris. Everything sets `fog: false` — see the note in
 * `_build()`.
 */
import * as THREE from 'three';
import {
  clamp, lerp, smoothstep, boxGeo, sphereGeo, planeGeo, mat, solid, group, flatMesh, mesh,
} from '../../beefrun/util.js';

/** Every dimension of the event, in metres and seconds, in one place. */
export const BLAST = Object.freeze({
  /** Peak radius of the visible fireball. Tsar Bomba's was about 2.3 km; this
   * is a browser game whose bombing run is flown at four hundred metres, so
   * the ball is deliberately smaller than life and the COLUMN carries the
   * scale instead — a fireball the aeroplane is standing inside is not a shot,
   * it is a white screen. */
  fireballRadius: 900,
  fireballGrow: 1.9,        // seconds to reach it
  /** The shock front. `shockSpeed` is the asymptote; `shockOvershoot` is how
   * many times faster than sound it leaves the fireball. */
  shockSpeed: 336,
  shockOvershoot: 3.4,
  shockDecay: 0.85,         // 1/s the overshoot bleeds off
  shockMax: 7600,
  /** The column. */
  stemTop: 4300,
  stemRise: 11.5,           // seconds for the head to reach the top
  capRadius: 2700,
  capThickness: 0.46,       // as a fraction of the cap radius
  /** How long the whole thing runs before the phase moves on. */
  duration: 30,
  /**
   * THE BLIND. Owner, 2026-08-05: "the flash from the explosion should
   * completely blind you for a brief moment .4 or something screen all white."
   *
   * Seconds of TOTAL white, from the instant of the flash. Not "bright" --
   * nothing on screen at all, the HUD included. See `blastWhiteout()` for why
   * this is not simply the luminance curve turned up.
   */
  blindSeconds: 0.4,
  /** Seconds the afterimage takes to bleed off the far side of the blind. */
  blindFade: 0.95,
});

/* ------------------------------------------------------------------ */
/* The double flash                                                    */
/* ------------------------------------------------------------------ */

/**
 * Luminance of the event, 0..1, `t` seconds in — the real double-humped curve.
 *
 * Rise to the first maximum in about 25 ms, a minimum at ~0.19 s where the
 * shock front is opaque and in the way, then a second, broader, brighter
 * maximum at ~0.75 s that decays for several seconds. Exported so the
 * verifier can assert the shape rather than a screenshot.
 */
export function blastLuminance(t) {
  if (t <= 0) return 0;
  const first = Math.exp(-((t - 0.022) ** 2) / (2 * 0.026 ** 2));
  const dip = 1 - 0.72 * Math.exp(-((t - 0.19) ** 2) / (2 * 0.075 ** 2));
  const second = 1.06 * Math.exp(-((t - 0.78) ** 2) / (2 * 0.62 ** 2));
  const tail = 0.5 * Math.exp(-t * 0.42);
  return clamp(Math.max(first * dip, second, tail), 0, 1);
}

/**
 * What the SCREEN does, 0..1, `t` seconds in. Not the same thing as the
 * luminance above, and the difference is the whole point.
 *
 * `blastLuminance` is what the DEVICE emits, and it is right: two humps with
 * a hydrodynamic minimum between them. Painted straight onto the screen it
 * measured as full white for 20 ms, a drop to 0.59, a slow climb, and full
 * white again around 0.5 s -- so what the player actually saw at the moment
 * of the drop was a FLICKER. Physically faithful, and completely wrong as an
 * experience: nobody in that cockpit gets a good look at anything between
 * those humps, because a bleached retina does not un-bleach in eighty
 * milliseconds to catch the dip.
 *
 * So the screen is the EYE, not the device. Total white for
 * `BLAST.blindSeconds`, then an afterimage bleeding off over `blindFade` --
 * which `Detonation` runs through amber rather than clear, because that is
 * what an eye does. The device's own curve still drives the two real lights
 * and the fireball; only the overlay is on this one.
 *
 * Exported so a test can assert the blind is unbroken rather than a
 * screenshot catching it on a good frame.
 */
export function blastWhiteout(t) {
  if (t <= 0) return 0;
  if (t < BLAST.blindSeconds) return 1;
  const since = (t - BLAST.blindSeconds) / BLAST.blindFade;
  return clamp(Math.exp(-(since ** 1.5)), 0, 1);
}

/** Where the shock front is, `t` seconds in. Fast, then sonic. */
export function shockRadiusAt(t) {
  if (t <= 0) return 0;
  const over = 1 + (BLAST.shockOvershoot - 1) * Math.exp(-t * BLAST.shockDecay);
  return Math.min(BLAST.shockMax, BLAST.shockSpeed * t * over);
}

/* ------------------------------------------------------------------ */

/** A silhouette for the one frame the fireball wears a face. */
function sasquatchSilhouetteTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#1a1420';
  ctx.beginPath();
  ctx.ellipse(128, 150, 92, 100, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(128, 96, 84, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const ex of [-70, 70]) {
    ctx.beginPath();
    ctx.ellipse(128 + ex, 128, 22, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A basic material nobody else shares — everything animated here needs one.
 *
 * Tagged, because `dispose()` has to be able to tell them apart from the ones
 * this file BORROWS. `solid()` and the `*Geo()` helpers in
 * `../../beefrun/util.js` hand back SHARED, CACHED objects, and the sixty
 * pieces of debris below are built from them; a `traverse(o =>
 * o.material.dispose())` at the end of the event therefore used to destroy a
 * material the rest of the project is still drawing with. Only what is tagged
 * here is ours to free.
 */
function ownMaterial(color, extra = {}) {
  const m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false, ...extra,
  });
  m.userData.detonationOwned = true;
  return m;
}

export class Detonation {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [opts]
   * @param {THREE.Camera} [opts.camera] used only to billboard the gag frame.
   * @param {(radius:number, previous:number)=>void} [opts.onShockFront] called
   *   every frame the front is still growing, with the radius it has reached.
   */
  constructor(scene, { camera = null, onShockFront = null } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.onShockFront = onShockFront;

    this.point = null;
    this.t = 0;
    this.live = false;
    this.done = false;

    /** 0..1 — how white the screen is. `../main.js` paints this. */
    this.screenFlash = 0;
    /** The colour that whiteness is, as it cools through the afterimage. */
    this.flashColour = { r: 1, g: 1, b: 1 };
    /** Where the front has got to. Metres from ground zero. */
    this.shockRadius = 0;
    this._prevShock = 0;

    this.vfx = null;
  }

  /** Light the thing. Idempotent — a second call while live is ignored. */
  fire(point) {
    if (this.live) return false;
    this.point = point.clone();
    this.t = 0;
    this.live = true;
    this.done = false;
    this.shockRadius = 0;
    this._prevShock = 0;
    this._build(this.point);
    return true;
  }

  /* ---------------------------------------------------------------- */

  _build(point) {
    const g = group('fat-squatch-detonation');
    g.position.copy(point);

    /* EVERYTHING IN HERE SETS `fog: false`.
     *
     * `MeshBasicMaterial` respects scene fog by default and this route's zones
     * cut fog between 1.4 km and 4.2 km. A four-kilometre column of fire two
     * kilometres behind the aeroplane — which is exactly where the player
     * watches it from, because the escape phase's whole instruction is to fly
     * away from it — otherwise blends almost entirely into the fog colour. A
     * detonation this size is not something the weather gets to stand in front
     * of. */

    /* ---- The flash: a bare, enormous, additive ball of white ---- */
    const flash = flatMesh(sphereGeo(1, 16, 12), ownMaterial(0xfffaf0, {
      blending: THREE.AdditiveBlending,
    }), 0, 40, 0);
    flash.renderOrder = 40;
    g.add(flash);

    /* ---- The lights. Two, doing two different jobs ---- */
    const light = new THREE.PointLight(0xffe8c0, 0, 0, 1.35);
    light.position.set(0, 120, 0);
    g.add(light);
    /* The afterglow: dim, warm, unhurried. This is "the light coming back" —
     * the landscape stays lit from the wrong direction long after the flash,
     * and the night only closes over it when this finally goes out. */
    const afterglow = new THREE.PointLight(0xff7a32, 0, 0, 1.1);
    afterglow.position.set(0, 700, 0);
    g.add(afterglow);

    /* ---- The fireball: five shells, each with its own colour and rate ----
     *
     * Only the two INNER shells are additive. Additive blending adds light to
     * whatever is behind it, so a deep-red shell 900 m across drawn additively
     * against this route's pale night sky brightens the sky slightly and is
     * otherwise invisible. The outer shells are ordinary transparent geometry,
     * which is opaque enough to be a SHAPE, and the core stays additive so the
     * middle still blows out to white. */
    const fire = [
      { colour: 0xffffff, to: 0.42, at: 0.30, fade: 1.5, add: true, peak: 1.0 },
      { colour: 0xfff0b4, to: 0.62, at: 0.60, fade: 2.6, add: true, peak: 0.96 },
      { colour: 0xffc23a, to: 0.80, at: 1.00, fade: 4.2, add: false, peak: 0.92 },
      { colour: 0xff6a12, to: 0.94, at: 1.45, fade: 6.4, add: false, peak: 0.88 },
      { colour: 0x8e1c0e, to: 1.00, at: 1.90, fade: 9.5, add: false, peak: 0.82 },
    ].map((spec, i) => {
      const ball = flatMesh(sphereGeo(1, 24, 16), ownMaterial(spec.colour, {
        ...(spec.add ? { blending: THREE.AdditiveBlending } : {}),
      }), 0, 0, 0);
      ball.userData.spec = spec;
      /* Drawn back to front by shell: three.js sorts transparent objects by
       * distance and five concentric spheres are all at the same distance, so
       * the outermost has to be told to go first or the red shell paints over
       * the white core it is meant to be wrapped around. */
      ball.renderOrder = 10 + i;
      g.add(ball);
      return ball;
    });

    /* ---- The Wilson cloud ----
     *
     * The shock front drops the pressure behind it far enough to condense the
     * water out of the air, so for about two seconds the whole fireball is
     * inside a white shell that then evaporates from the inside out. It is
     * free — one sphere — and it is the second most recognisable thing about
     * a large detonation after the double flash. */
    const wilson = flatMesh(sphereGeo(1, 20, 14), ownMaterial(0xeaf2ff, {
      side: THREE.DoubleSide,
    }), 0, 0, 0);
    wilson.renderOrder = 20;
    g.add(wilson);

    /* ---- The shock front on the ground ----
     *
     * Three pieces: a hard bright ring at the front itself, a wide dust
     * annulus dragging behind it, and a scorch disc that stays. All laid flat
     * and lifted clear of the terrain, because the ground out here is a real
     * heightfield and a mathematically flat ring would saw through it. */
    const frontGeo = new THREE.RingGeometry(0.93, 1.0, 128);
    frontGeo.rotateX(-Math.PI / 2);
    frontGeo.userData.detonationOwned = true;
    const front = new THREE.Mesh(frontGeo, ownMaterial(0xfff2c8, {
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    front.position.y = 70;
    front.renderOrder = 6;
    g.add(front);

    const dustGeo = new THREE.RingGeometry(0.42, 1.0, 96, 1);
    dustGeo.rotateX(-Math.PI / 2);
    dustGeo.userData.detonationOwned = true;
    const dustRing = new THREE.Mesh(dustGeo, ownMaterial(0x8a7050, {
      side: THREE.DoubleSide,
    }));
    dustRing.position.y = 46;
    dustRing.renderOrder = 5;
    g.add(dustRing);

    const scorchGeo = new THREE.RingGeometry(0.02, 1.0, 72, 1);
    scorchGeo.rotateX(-Math.PI / 2);
    scorchGeo.userData.detonationOwned = true;
    const scorch = new THREE.Mesh(scorchGeo, ownMaterial(0x1a120c, { blending: THREE.NormalBlending }));
    scorch.position.y = 14;
    scorch.renderOrder = 4;
    g.add(scorch);

    /* ---- The base surge: the wall of dirt that rolls out along the deck ---- */
    const surge = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 44, 1, true),
      ownMaterial(0x6b5a44, { side: THREE.DoubleSide }),
    );
    surge.geometry.userData.detonationOwned = true;
    surge.position.y = 40;
    surge.renderOrder = 7;
    g.add(surge);

    /* ---- The column ---- */
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(210, 380, 1, 26, 1, true),
      ownMaterial(0x8a6a4a, { side: THREE.DoubleSide }),
    );
    stem.geometry.userData.detonationOwned = true;
    stem.renderOrder = 8;
    g.add(stem);

    /* The skirt: the afterwind dragging dirt back up around the stem's foot. */
    const skirt = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 32, 1, true),
      ownMaterial(0x7a6448, { side: THREE.DoubleSide }),
    );
    skirt.geometry.userData.detonationOwned = true;
    skirt.renderOrder = 7;
    g.add(skirt);

    /* The cap, and the roll inside it. A squashed sphere gives the silhouette;
     * a torus threaded through its equator gives the thing a real mushroom has
     * and a lollipop does not — smoke curling under and back up into itself. */
    const cap = flatMesh(sphereGeo(1, 28, 18), ownMaterial(0xa08262, {}), 0, 0, 0);
    cap.renderOrder = 9;
    g.add(cap);
    const capRoll = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.34, 12, 40),
      ownMaterial(0x6b5442, { side: THREE.DoubleSide }),
    );
    capRoll.geometry.userData.detonationOwned = true;
    capRoll.rotation.x = Math.PI / 2;
    capRoll.renderOrder = 9;
    g.add(capRoll);

    /* Puffs riding the cap. A squashed sphere on its own renders as one flat
     * ellipse — nothing shades across it, because it is unlit — so eighteen of
     * these break the silhouette into lumps and give the middle some contrast. */
    const smoke = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const puff = flatMesh(sphereGeo(1, 10, 7), ownMaterial(
        i % 3 === 0 ? 0x4a4038 : i % 3 === 1 ? 0x6b5a44 : 0x8a7358,
      ), 0, 0, 0);
      puff.userData.ang = a;
      puff.userData.ring = 0.70 + (i % 5) * 0.08;
      puff.userData.lift = 0.80 + (i % 4) * 0.13;
      puff.userData.size = 0.26 + (i % 3) * 0.10;
      puff.renderOrder = 9;
      g.add(puff);
      smoke.push(puff);
    }

    /* Puffs riding the stem, so the column is a churn rather than a pipe. */
    const stemPuffs = [];
    for (let i = 0; i < 14; i++) {
      const puff = flatMesh(sphereGeo(1, 8, 6), ownMaterial(i % 2 ? 0x6b5138 : 0x4a3a2a), 0, 0, 0);
      puff.userData.at = 0.08 + (i / 14) * 0.86;
      puff.userData.ang = i * 2.399;
      puff.userData.size = 240 + (i % 4) * 90;
      puff.renderOrder = 8;
      g.add(puff);
      stemPuffs.push(puff);
    }

    /* The gag frame. A flat plane in the XY plane is edge-on to a camera
     * approaching along X, which is the axis this whole mission flies along —
     * so it is billboarded, or the joke is a one-pixel vertical line. */
    const gag = flatMesh(planeGeo(1, 1), mat({
      map: sasquatchSilhouetteTexture(), transparent: true, alphaTest: 0.05,
      depthWrite: false, fog: false, unique: true,
    }), 0, 420, 0);
    gag.visible = false;
    gag.renderOrder = 30;
    g.add(gag);

    /* Sixty pieces of what used to be Squatchbourg, on real ballistic arcs,
     * trailing smoke. */
    const debris = [];
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 + Math.random() * 0.4;
      const size = 7 + Math.random() * 26;
      const bit = mesh(boxGeo(size, size * (0.4 + Math.random()), size),
        solid(i % 3 ? 0x3a3428 : 0x5a5248, { roughness: 1 }), 0, 30, 0);
      const speed = 150 + Math.random() * 380;
      bit.userData.vel = new THREE.Vector3(
        Math.cos(a) * speed,
        220 + Math.random() * 420,
        Math.sin(a) * speed,
      );
      bit.userData.spin = new THREE.Vector3(Math.random() * 4, Math.random() * 3, Math.random() * 5);
      g.add(bit);
      debris.push(bit);
    }

    this.scene.add(g);
    this.vfx = {
      group: g, flash, light, afterglow, fire, wilson,
      front, dustRing, scorch, surge, stem, skirt, cap, capRoll,
      smoke, stemPuffs, gag, debris,
    };
    return this.vfx;
  }

  /* ---------------------------------------------------------------- */

  /**
   * @param {number} dt
   * @returns {boolean} still running
   */
  update(dt) {
    if (!this.live) return false;
    this.t += dt;
    const t = this.t;
    const v = this.vfx;

    /* ---- The front, which drives everything on the ground ---- */
    this._prevShock = this.shockRadius;
    this.shockRadius = shockRadiusAt(t);
    if (this.onShockFront && this.shockRadius > this._prevShock) {
      this.onShockFront(this.shockRadius, this._prevShock);
    }

    /* ---- The screen ----
     *
     * The luminance curve is the flash; the fall-off past it is the eye
     * recovering, which is why it goes through amber rather than straight to
     * clear. Anybody in that cockpit is seeing purple for a minute. */
    const lum = blastLuminance(t);
    /* `lum` still drives the world -- the two lights and the fireball's own
     * brightness below -- because that is the device. The SCREEN is the eye,
     * and the eye stays blind through the dip. See `blastWhiteout()`. */
    this.screenFlash = blastWhiteout(t);
    /* No colour while he is properly blind: an amber tint on a white-out is a
     * player who can still tell it is amber. The cooling starts on the far
     * side of the blind, which is where an afterimage starts anyway. */
    const cool = clamp((t - BLAST.blindSeconds) / 3.4, 0, 1);
    this.flashColour = {
      r: 1,
      g: lerp(1, 0.62, cool),
      b: lerp(1, 0.30, cool),
    };

    if (!v) {
      this.done = t > BLAST.duration;
      return !this.done;
    }

    /* ---- The bare flash sphere ---- */
    const flashK = clamp(t / 0.42, 0, 1);
    v.flash.material.opacity = lum;
    v.flash.scale.setScalar(lerp(8, 1500, Math.sqrt(flashK)));
    v.flash.position.y = 40 + t * 20;

    /* ---- The lights ---- */
    v.light.intensity = lum * 1.4e7;
    v.light.color.setHex(t < 0.9 ? 0xffe8c0 : t < 3 ? 0xffa54a : 0xff6a24);
    v.light.position.y = 120 + this._headHeight(t) * 0.4;
    /* Comes up as the flash goes down and then takes half a minute to die —
     * the ground stays lit long after anybody can see the ball. */
    v.afterglow.intensity = 2.4e6 * clamp(smoothstep(0.2, 1.6, t), 0, 1) * Math.exp(-t * 0.11);
    v.afterglow.position.y = 400 + this._headHeight(t) * 0.6;

    /* ---- The fireball, and its climb ---- */
    const ballHeight = this._headHeight(t);
    const ballR = BLAST.fireballRadius * Math.pow(clamp(t / BLAST.fireballGrow, 0, 1), 0.42);
    for (const ball of v.fire) {
      const s = ball.userData.spec;
      const k = clamp(t / s.at, 0, 1);
      const r = Math.max(6, ballR * s.to * (0.35 + 0.65 * Math.sqrt(k)));
      ball.scale.setScalar(r);
      ball.position.y = ballHeight;
      ball.material.opacity = clamp(1 - t / s.fade, 0, 1) * s.peak;
    }

    /* ---- The Wilson cloud: on at 0.35 s, gone by 3 ---- */
    const wilsonK = smoothstep(0.30, 0.62, t) * (1 - smoothstep(1.5, 3.1, t));
    v.wilson.material.opacity = wilsonK * 0.42;
    v.wilson.scale.setScalar(Math.max(1, ballR * lerp(1.35, 2.3, clamp((t - 0.3) / 2.2, 0, 1))));
    v.wilson.position.y = ballHeight * 0.8;
    v.wilson.visible = wilsonK > 0.01;

    /* ---- The front on the deck ---- */
    const R = Math.max(1, this.shockRadius);
    v.front.scale.set(R, 1, R);
    v.front.material.opacity = clamp(1 - R / 4200, 0, 1) * 0.85;
    v.dustRing.scale.set(R * 1.02, 1, R * 1.02);
    v.dustRing.material.opacity = clamp(1 - R / 5600, 0, 1) * 0.42;
    const scorchR = Math.min(R * 0.55, 2600);
    v.scorch.scale.set(scorchR, 1, scorchR);
    v.scorch.material.opacity = clamp(smoothstep(0.2, 1.4, t), 0, 1) * clamp(1 - (t - 16) / 12, 0, 1) * 0.7;

    /* The base surge: shorter than the front and much more opaque, because it
     * is the part made of the ground rather than of the air. */
    const surgeR = Math.min(R * 0.72, 2300);
    v.surge.scale.set(surgeR, lerp(60, 560, clamp(t / 7, 0, 1)), surgeR);
    v.surge.position.y = lerp(40, 300, clamp(t / 7, 0, 1));
    v.surge.material.opacity = clamp(smoothstep(0.15, 0.9, t), 0, 1) * clamp(1 - (t - 9) / 11, 0, 1) * 0.5;

    /* ---- The column ---- */
    const stemK = clamp((t - 0.5) / BLAST.stemRise, 0, 1);
    const stemH = Math.max(1, ballHeight * 0.98);
    v.stem.scale.set(1, stemH, 1);
    v.stem.position.y = stemH / 2;
    v.stem.material.opacity = clamp(stemK * 2.2, 0, 0.7) * clamp(1 - (t - 21) / 9, 0, 1);

    const skirtR = lerp(300, 1350, clamp(t / 9, 0, 1));
    v.skirt.scale.set(skirtR, lerp(120, 900, clamp(t / 9, 0, 1)), skirtR);
    v.skirt.position.y = lerp(60, 430, clamp(t / 9, 0, 1));
    v.skirt.material.opacity = clamp(smoothstep(0.8, 2.4, t), 0, 1) * clamp(1 - (t - 16) / 12, 0, 1) * 0.4;

    /* ---- The cap. It only starts to unroll once the head is well up ---- */
    const capK = clamp((t - 2.6) / 9.0, 0, 1);
    const capR = lerp(ballR * 1.1, BLAST.capRadius, Math.sqrt(capK));
    const capY = ballHeight + capR * 0.14;
    v.cap.scale.set(capR, capR * BLAST.capThickness, capR);
    v.cap.position.y = capY;
    const capFade = clamp(capK * 1.5, 0, 1) * clamp(1 - (t - 23) / 8, 0, 1);
    v.cap.material.opacity = capFade * 0.82;
    v.capRoll.scale.setScalar(capR * 0.92);
    v.capRoll.position.y = capY - capR * 0.16;
    v.capRoll.material.opacity = capFade * 0.6;
    v.capRoll.rotation.z += dt * 0.24;

    for (const puff of v.smoke) {
      const u = puff.userData;
      const r = capR * u.ring;
      puff.position.set(
        Math.cos(u.ang) * r,
        capY * u.lift + capR * 0.12,
        Math.sin(u.ang) * r,
      );
      puff.scale.setScalar(Math.max(capR * u.size, 1));
      puff.material.opacity = capFade * 0.55;
    }
    for (const puff of v.stemPuffs) {
      const u = puff.userData;
      const y = stemH * u.at;
      const r = lerp(260, 420, u.at) * (0.6 + 0.4 * Math.sin(t * 0.5 + u.ang));
      puff.position.set(Math.cos(u.ang + t * 0.12) * r, y, Math.sin(u.ang + t * 0.12) * r);
      puff.scale.setScalar(u.size);
      puff.material.opacity = clamp(stemK * 1.6, 0, 1) * clamp(1 - (t - 20) / 10, 0, 1) * 0.42;
    }

    /* ---- The gag frame, at nine hundred metres of Sasquatch ---- */
    v.gag.visible = t > 1.25 && t < 2.7;
    if (v.gag.visible) {
      if (this.camera) v.gag.quaternion.copy(this.camera.quaternion);
      const gagK = clamp((t - 1.25) / 1.45, 0, 1);
      const s = lerp(340, 1080, Math.sin(gagK * Math.PI));
      v.gag.scale.set(s, s, 1);
      v.gag.position.y = lerp(ballHeight * 0.9, ballHeight * 1.25, gagK);
      v.gag.material.opacity = Math.sin(gagK * Math.PI) * 0.92;
    }

    for (const bit of v.debris) {
      bit.userData.vel.y -= 40 * dt;
      bit.position.addScaledVector(bit.userData.vel, dt);
      bit.rotation.x += bit.userData.spin.x * dt;
      bit.rotation.y += bit.userData.spin.y * dt;
      bit.rotation.z += bit.userData.spin.z * dt;
    }

    this.done = t > BLAST.duration;
    return !this.done;
  }

  /** How high the head of the column is, `t` seconds in. */
  _headHeight(t) {
    if (t <= 0) return 60;
    // Rises fast while the ball is hot and buoyant, then slows as it cools and
    // spreads — the same shape the real thing has on film.
    const k = clamp(t / BLAST.stemRise, 0, 1);
    return lerp(60, BLAST.stemTop, Math.pow(k, 0.62));
  }

  /**
   * Take the whole thing off the scene and free it.
   *
   * ONLY what this file made. The debris are built out of `solid()` and
   * `boxGeo()`, which are the project's shared caches, and freeing those takes
   * a material and a geometry away from every other object still using them —
   * so a mesh is only disposed if its material carries the tag `ownMaterial()`
   * puts on it, and geometry likewise (`RingGeometry`, `TorusGeometry`, the
   * two open cylinders and the skirt cone are the ones built here; every
   * sphere and box comes from the cache).
   */
  dispose() {
    const v = this.vfx;
    this.vfx = null;
    this.live = false;
    this.screenFlash = 0;
    if (!v) return;
    this.scene.remove(v.group);
    v.group.traverse((o) => {
      if (!o.material?.userData?.detonationOwned) return;
      o.material.map?.dispose?.();
      o.material.dispose();
      if (o.geometry?.userData?.detonationOwned) o.geometry.dispose();
    });
  }
}
