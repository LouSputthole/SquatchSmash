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
 * Cost: one group, about fifty meshes and two lights, all unlit or basic
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
   * it is a white screen.
   *
   * Owner, 2026-08-06, on seeing the previous pass: "the mushroom cloud is
   * good but needs to be more defined and more extreme." The whole BLAST
   * table below is bigger as a set — not just the fireball, the column and
   * the cap that carry the silhouette a player actually reads from three
   * thousand feet — so the proportions this file's other comments describe
   * (cap over stem, skirt at the foot, roll at the join) all still hold. */
  fireballRadius: 1150,
  fireballGrow: 1.9,        // seconds to reach it
  /** The shock front. `shockSpeed` is the asymptote; `shockOvershoot` is how
   * many times faster than sound it leaves the fireball. */
  shockSpeed: 336,
  shockOvershoot: 3.4,
  shockDecay: 0.85,         // 1/s the overshoot bleeds off
  shockMax: 9200,
  /** The column. */
  stemTop: 5600,
  stemRise: 11.5,           // seconds for the head to reach the top
  capRadius: 3400,
  capThickness: 0.50,       // as a fraction of the cap radius — a heavier, more overhung head
  /** How long the ACTIVE event runs — the flash, the front, the column going
   * up. The phase timing hangs off this. What happens after it is the linger,
   * below, which is a different thing and a much longer one. */
  duration: 30,
  /**
   * THE FLASH ON THE SCREEN.
   *
   * Owner, 2026-08-05: "the flash from the explosion should completely blind
   * you for a brief moment .4 or something screen all white."
   *
   * Owner, later the same day, revising it: "maybe I was wrong on it blinding
   * you but it needs to be visible as it passes over you that way the player
   * doesn't miss it."
   *
   * That second note is the one this implements, and the difference matters.
   * Four tenths of a second of total white is four tenths of a second in which
   * the player CANNOT SEE THE EXPLOSION — the fireball, the Wilson cloud and
   * the whole first pulse happen behind an opaque screen and the player opens
   * his eyes onto the aftermath. So: a real bleach, because a device this size
   * does bleach an eye, but a SHORT one, and then a WASH the world is visible
   * through rather than a wall it is hidden behind.
   */
  blindSeconds: 0.12,
  /** Seconds the wash takes to bleed off the far side of the bleach. */
  blindFade: 1.15,
  /** How opaque the wash is allowed to get once the bleach is over. Below 1 on
   * purpose: everything above this number is a frame the player does not get
   * to see the shot in. */
  washCeiling: 0.62,
  /**
   * THE BUBBLE. Owner: "I want a the giant bubble explosion ... and then the
   * shockwave to pass over you."
   *
   * The front was drawn only on the GROUND — a ring, a dust annulus and a
   * scorch disc — which is right for a player looking down at the city and
   * completely invisible to one who has turned away and is running east at
   * four hundred metres. `bubbleFade` is the radius, in metres, over which the
   * shell thins from solid to nothing as it expands; `passWidth` is how close
   * the front has to get to the camera before it starts to sweep.
   */
  bubbleFade: 5200,
  /* 300 m, and it was 900. At the range the front actually crosses a player
   * who flew the break turn it is doing about 350 m/s, so 900 m either side is
   * a five-second smear — which reads as the picture having gone dirty, not as
   * something going past. 300 m is a little over a second. */
  passWidth: 300,
  /* And it holds for this long on the way out no matter what the frame rate
   * is. Measured purely against the instantaneous radius, a background tab
   * delivering three-quarter-second steps steps the front straight over the
   * player and the sweep never happens at all — the one thing the owner asked
   * for is that he does not miss it. */
  washDecay: 0.55,
  /**
   * THE LINGER. Owner: "I also want a giant classic mushroom cloud to linger
   * over the crater."
   *
   * It used to fade out at about twenty-three seconds and be disposed at
   * thirty — so a player who flew the escape properly, turned, and looked back
   * for the thing he had just done found an empty sky. The column now settles
   * instead of fading: it stops climbing, goes grey, drifts, and stays there
   * for `lingerSeconds`, which is longer than the rest of the mission takes.
   */
  lingerSeconds: 900,
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
 * So the screen is the EYE, not the device -- one fall rather than two humps.
 * But an eye is not a shutter either, and the version of this that held TOTAL
 * white for four tenths of a second was a shutter: the first pulse, the
 * fireball's whole growth and the Wilson cloud all happened behind it. The
 * curve is now three parts:
 *
 *   BLEACH   `BLAST.blindSeconds` of genuine white. Short. Long enough to be
 *            a hit and not long enough to hide the event.
 *   WASH     a fast drop onto `BLAST.washCeiling`, which is deliberately below
 *            one -- the world stays visible THROUGH the light rather than
 *            behind it. This is the part the owner asked to be able to see.
 *   BLEED    the wash decaying away over `blindFade`, through amber rather
 *            than through clear, because that is what an afterimage does.
 *
 * The device's own curve still drives the two real lights and the fireball's
 * brightness; only the overlay is on this one.
 *
 * Exported so a test can assert the shape rather than a screenshot catching it
 * on a good frame.
 */
export function blastWhiteout(t) {
  if (t <= 0) return 0;
  if (t < BLAST.blindSeconds) return 1;
  const since = (t - BLAST.blindSeconds) / BLAST.blindFade;
  // Off the bleach and onto the wash inside the first tenth of the fade, then
  // the wash itself bleeding off. Monotone the whole way down.
  const off = smoothstep(0, 0.12, since);
  const wash = BLAST.washCeiling * Math.exp(-(since ** 1.35));
  return clamp(lerp(1, wash, off), 0, 1);
}

/**
 * How solid the pressure shell is at radius `r` metres, 0..1.
 *
 * It thins as it grows, because the same amount of compressed air is being
 * spread over a sphere whose area goes as the square of the radius. Exported
 * for the same reason the curves above are: so a test can assert the front is
 * still legible at the ranges the mission actually produces rather than
 * hoping.
 */
export function shellOpacity(r) {
  if (r <= 0) return 0;
  return clamp(1 - r / BLAST.bubbleFade, 0, 1);
}

/**
 * How much the front is ON TOP OF a viewer this frame, 0..1 — 1 exactly as it
 * crosses them, falling away either side over `BLAST.passWidth`.
 *
 * This is the number that makes the shockwave an event rather than a statistic:
 * `Detonation` publishes it as `shockWash`, `../main.js` paints it across the
 * whole screen, and `MissionController` is already shaking the aeroplane on the
 * same crossing. A player facing due east with the city behind him still gets
 * the sky go pale for half a second.
 *
 * @param {number} radius where the front has reached
 * @param {number} range how far the viewer is from ground zero
 */
export function shockPass(radius, range) {
  if (radius <= 0 || range <= 0) return 0;
  return clamp(1 - Math.abs(radius - range) / BLAST.passWidth, 0, 1);
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
/**
 * How much of itself the column still has, `t` seconds in.
 *
 * The column used to fade to NOTHING between about twenty and thirty seconds,
 * which is why the sky was empty by the time anyone flew the escape and looked
 * back. It now eases down to `SETTLE` and stops there — cooler, greyer, thinner
 * than the fresh thing, and still four kilometres of it standing over the hole.
 */
const SETTLE = 0.72;
function settle(t) {
  return lerp(1, SETTLE, smoothstep(17, BLAST.duration, t));
}

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

    /* ---- The front, as the player experiences it ----
     *
     * Owner: "I want a shock wave to pass you ... it needs to be visible as it
     * passes over you that way the player doesn't miss it." These three are
     * what "over you" means in numbers, and `../main.js` and
     * `../mission/MissionController.js` both read them. */
    /** 0..1 — how hard the front is crossing the CAMERA this frame. */
    this.shockWash = 0;
    /** Metres from ground zero to the camera. 0 when there is no camera. */
    this.viewRange = 0;
    /** True from the frame the front overtakes the camera onward. */
    this.shockPassed = false;

    /** True once the active event is over and the column is just standing
     * there over the crater. See `BLAST.lingerSeconds`. */
    this.lingering = false;

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
    this.shockWash = 0;
    this.viewRange = 0;
    this.shockPassed = false;
    this.lingering = false;
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
    const flash = flatMesh(sphereGeo(1, 20, 14), ownMaterial(0xfffaf0, {
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
     * middle still blows out to white.
     *
     * Owner, 2026-08-06: "more defined and more extreme." Peaks pushed up and
     * `to` spread out further apart (0.42/0.62/0.80/0.94/1.00 unchanged in
     * shape, bigger in absolute metres now that `fireballRadius` is) so each
     * ring of colour reads as its own band rather than blurring into its
     * neighbour, and every shell is a sphere with half again the resolution it
     * had, since a shape this close to the screen for a second and a half is
     * worth the extra facets. */
    const fire = [
      { colour: 0xffffff, to: 0.42, at: 0.30, fade: 1.5, add: true, peak: 1.0 },
      { colour: 0xfff0b4, to: 0.63, at: 0.60, fade: 2.6, add: true, peak: 1.0 },
      { colour: 0xffb020, to: 0.81, at: 1.00, fade: 4.2, add: false, peak: 0.97 },
      { colour: 0xff5a08, to: 0.95, at: 1.45, fade: 6.4, add: false, peak: 0.94 },
      { colour: 0x7a1608, to: 1.00, at: 1.90, fade: 9.5, add: false, peak: 0.88 },
    ].map((spec, i) => {
      const ball = flatMesh(sphereGeo(1, 32, 20), ownMaterial(spec.colour, {
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

    /* ---- The bubble, and the front in the air ----
     *
     * Owner: "I want a the giant bubble explosion ... and then the shockwave to
     * pass over you."
     *
     * Before this the front existed only on the DECK — a ring, a dust annulus
     * and a scorch disc, all lying flat on the terrain. Correct, and entirely
     * invisible to a player who has done what the mission told him to do, which
     * is turn away and run east at four hundred metres. The front that reaches
     * the aeroplane is a SPHERE, and these two pieces are that sphere:
     *
     *   `bubble` is the volume — a shell of compressed air on `shockRadius`,
     *     pale and thin, `DoubleSide` so that the moment it overtakes the
     *     camera the player is INSIDE it and the whole world goes briefly pale.
     *     That inside-out flip is the "passes over you", and it costs nothing:
     *     it is the same sphere seen from the other side.
     *
     *   `shellRing` is the front's silhouette — the bright expanding circle
     *     everyone has seen on film. A sphere of radius R seen from outside has
     *     a circular outline of radius R about ground zero, so a billboarded
     *     annulus IS that outline, exactly, for free, and it grows past the
     *     edges of the screen as the front arrives. `depthTest: false`, because
     *     it is a shell wrapped round the world rather than a disc sitting in
     *     it, and a mountain must not take a bite out of it.
     */
    const bubble = flatMesh(sphereGeo(1, 32, 20), ownMaterial(0xcfe4ff, {
      side: THREE.DoubleSide,
    }), 0, 0, 0);
    bubble.renderOrder = 3;
    g.add(bubble);

    const shellGeo = new THREE.RingGeometry(0.90, 1.0, 128);
    shellGeo.userData.detonationOwned = true;
    const shellRing = new THREE.Mesh(shellGeo, ownMaterial(0xe8f4ff, {
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthTest: false,
    }));
    shellRing.renderOrder = 41;
    g.add(shellRing);

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
     * and a lollipop does not — smoke curling under and back up into itself.
     * Higher-resolution sphere than the previous pass ("more defined") — this
     * is the shape a player looks back at for the rest of the mission, not a
     * one-second flash, so the facets matter. */
    const cap = flatMesh(sphereGeo(1, 36, 22), ownMaterial(0xa08262, {}), 0, 0, 0);
    cap.renderOrder = 9;
    g.add(cap);
    const capRoll = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.34, 12, 44),
      ownMaterial(0x6b5442, { side: THREE.DoubleSide }),
    );
    capRoll.geometry.userData.detonationOwned = true;
    capRoll.rotation.x = Math.PI / 2;
    capRoll.renderOrder = 9;
    g.add(capRoll);

    /* The rim: a crisp, dark billboarded edge right at the cap's outer lip.
     * A squashed sphere alone reads soft — nothing shades across an unlit
     * mesh — and a real mushroom cloud's cap has a hard, turbulent rim where
     * moisture is still condensing out of the rising air. That hard edge is
     * most of what makes the silhouette read as a MUSHROOM at three thousand
     * feet rather than a blob with a stick under it. Same billboard trick as
     * `shellRing`: a sphere of radius R has a circular outline of radius R,
     * so an annulus scaled to the cap radius traces it for free. Part of the
     * PERMANENT cloud (not switched off in `_settle()`), because the edge is
     * exactly what still reads once everything transient is gone. */
    const capRim = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.0, 96),
      ownMaterial(0x241a10, { side: THREE.DoubleSide, depthTest: false }),
    );
    capRim.geometry.userData.detonationOwned = true;
    capRim.renderOrder = 9;
    g.add(capRim);

    /* Puffs riding the cap. A squashed sphere on its own renders as one flat
     * ellipse — nothing shades across it, because it is unlit — so
     * twenty-six of these break the silhouette into lumps and give the
     * middle some contrast (eighteen previously; more definition wanted
     * more lumps). */
    const smoke = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const puff = flatMesh(sphereGeo(1, 10, 7), ownMaterial(
        i % 3 === 0 ? 0x4a4038 : i % 3 === 1 ? 0x6b5a44 : 0x8a7358,
      ), 0, 0, 0);
      puff.userData.ang = a;
      puff.userData.ring = 0.68 + (i % 5) * 0.08;
      puff.userData.lift = 0.78 + (i % 4) * 0.14;
      puff.userData.size = 0.24 + (i % 3) * 0.11;
      puff.renderOrder = 9;
      g.add(puff);
      smoke.push(puff);
    }

    /* Puffs riding the stem, so the column is a churn rather than a pipe.
     * Twenty now (fourteen previously) — a taller column (`stemTop` up 30%)
     * needs more of them spaced along it or the churn thins out near the
     * top. */
    const stemPuffs = [];
    for (let i = 0; i < 20; i++) {
      const puff = flatMesh(sphereGeo(1, 8, 6), ownMaterial(i % 2 ? 0x6b5138 : 0x4a3a2a), 0, 0, 0);
      puff.userData.at = 0.06 + (i / 20) * 0.90;
      puff.userData.ang = i * 2.399;
      puff.userData.size = 260 + (i % 4) * 100;
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

    /* Eighty-four pieces of what used to be Squatchbourg (sixty previously),
     * on real ballistic arcs, trailing smoke, thrown faster and higher — the
     * owner's "more extreme" note applies to the violence of the moment as
     * much as to the cloud it leaves behind. */
    const debris = [];
    for (let i = 0; i < 84; i++) {
      const a = (i / 84) * Math.PI * 2 + Math.random() * 0.4;
      const size = 7 + Math.random() * 30;
      const bit = mesh(boxGeo(size, size * (0.4 + Math.random()), size),
        solid(i % 3 ? 0x3a3428 : 0x5a5248, { roughness: 1 }), 0, 30, 0);
      const speed = 180 + Math.random() * 460;
      bit.userData.vel = new THREE.Vector3(
        Math.cos(a) * speed,
        260 + Math.random() * 500,
        Math.sin(a) * speed,
      );
      bit.userData.spin = new THREE.Vector3(Math.random() * 4, Math.random() * 3, Math.random() * 5);
      g.add(bit);
      debris.push(bit);
    }

    this.scene.add(g);
    this.vfx = {
      group: g, flash, light, afterglow, fire, wilson, bubble, shellRing,
      front, dustRing, scorch, surge, stem, skirt, cap, capRoll, capRim,
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

    /* ---- The linger ----
     *
     * Past the active event the column is not animated any more, it is simply
     * THERE, and running the whole timeline for another fifteen minutes to
     * hold it there would be absurd. Everything transient is switched off once
     * and the cheap path below drifts what is left. */
    if (t > BLAST.duration) {
      if (!this.lingering) this._settle();
      this._updateLinger(dt, t - BLAST.duration);
      this.done = t > BLAST.duration + BLAST.lingerSeconds;
      return !this.done;
    }

    /* ---- The front, which drives everything on the ground ---- */
    this._prevShock = this.shockRadius;
    this.shockRadius = shockRadiusAt(t);
    if (this.onShockFront && this.shockRadius > this._prevShock) {
      this.onShockFront(this.shockRadius, this._prevShock);
    }

    /* ---- The front, as it crosses the player ----
     *
     * Owner: "I want a shock wave to pass you ... it needs to be visible as it
     * passes over you that way the player doesn't miss it."
     *
     * Measured against the CAMERA rather than against the aeroplane, and the
     * difference is real: the player can be in the tail turret looking
     * straight back down the fuselage at the thing, which is where a lot of
     * them will be, and the shell should sweep the screen he is actually
     * looking at. `MissionController` separately measures the front against
     * the AIRFRAME for the buffet and the damage, because the aeroplane is
     * what gets hit. */
    if (this.camera) {
      this.viewRange = this.camera.position.distanceTo(this.point);
      /* Squared, so the sweep is a hit rather than a long pale smear -- and
       * held on the way out over `washDecay`, so it survives a bad frame rate.
       * Rising is instant, falling is not: the front arriving is a slam and
       * the dust behind it takes a moment to clear. */
      const pass = shockPass(this.shockRadius, this.viewRange) ** 2;
      this.shockWash = Math.max(pass, this.shockWash - dt / BLAST.washDecay);
      if (this.shockRadius >= this.viewRange) this.shockPassed = true;
    }

    /* ---- The screen ----
     *
     * The luminance curve is the flash; the fall-off past it is the eye
     * recovering, which is why it goes through amber rather than straight to
     * clear. Anybody in that cockpit is seeing purple for a minute. */
    const lum = blastLuminance(t);
    /* `lum` still drives the world -- the two lights and the fireball's own
     * brightness below -- because that is the device. The SCREEN is the eye.
     * See `blastWhiteout()`. */
    this.screenFlash = blastWhiteout(t);
    /* No colour while the bleach is on: an amber tint on a white-out is a
     * player who can still tell it is amber. The cooling starts on the far
     * side of it, which is where an afterimage starts anyway. */
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

    /* ---- The bare flash sphere ----
     * Owner, 2026-08-06: "more extreme." 1500 -> 1900 m of peak flash radius,
     * on the same curve. */
    const flashK = clamp(t / 0.42, 0, 1);
    v.flash.material.opacity = lum;
    v.flash.scale.setScalar(lerp(8, 1900, Math.sqrt(flashK)));
    v.flash.position.y = 40 + t * 20;

    /* ---- The lights ---- */
    v.light.intensity = lum * 1.7e7;
    v.light.color.setHex(t < 0.9 ? 0xffe8c0 : t < 3 ? 0xffa54a : 0xff6a24);
    v.light.position.y = 120 + this._headHeight(t) * 0.4;
    /* Comes up as the flash goes down and then takes half a minute to die —
     * the ground stays lit long after anybody can see the ball. */
    v.afterglow.intensity = 2.9e6 * clamp(smoothstep(0.2, 1.6, t), 0, 1) * Math.exp(-t * 0.11);
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

    /* ---- The bubble, and the front in the air ----
     *
     * The shell is on the same radius as the ground ring, because it is the
     * same front — the ring is simply where the sphere meets the dirt.
     *
     * `DoubleSide` is doing the whole job on the bubble. While the front is
     * still short of the camera the player sees the OUTSIDE of a pale dome
     * standing over the city; the instant it goes past him he is inside it and
     * seeing the inside, which tints everything he can see in every direction
     * at once. Nothing switches, nothing is faded in — the geometry crosses
     * him and the view changes because it did. That is the pass. */
    const R = Math.max(1, this.shockRadius);
    const shell = shellOpacity(R);
    v.bubble.scale.setScalar(R);
    v.bubble.material.opacity = shell * (0.11 + this.shockWash * 0.34);
    v.bubble.visible = v.bubble.material.opacity > 0.004;

    /* The silhouette. Billboarded, so it is the outline of that sphere from
     * wherever the player happens to be, and dropped once the front is past
     * him — from the inside there is no outline to draw, and a ring left
     * behind would read as a disc hanging in the sky. */
    const behind = this.viewRange > 0
      ? clamp(1 - (R - this.viewRange) / (BLAST.passWidth * 0.7), 0, 1)
      : 1;
    v.shellRing.visible = R > 40 && behind > 0.01 && shell > 0.01;
    if (v.shellRing.visible) {
      if (this.camera) v.shellRing.quaternion.copy(this.camera.quaternion);
      v.shellRing.scale.setScalar(R);
      v.shellRing.material.opacity = clamp(shell * 0.75 + this.shockWash * 0.55, 0, 1) * behind;
    }

    /* ---- The front on the deck ---- */
    v.front.scale.set(R, 1, R);
    v.front.material.opacity = clamp(1 - R / 4200, 0, 1) * 0.85;
    v.dustRing.scale.set(R * 1.02, 1, R * 1.02);
    v.dustRing.material.opacity = clamp(1 - R / 5600, 0, 1) * 0.42;
    /* The scorch is the SCAR, and a scar does not fade out over twelve
     * seconds. It used to, along with everything else; it now darkens and
     * stays, and the crater is still black when the aeroplane comes home. */
    const scorchR = Math.min(R * 0.55, 2600);
    v.scorch.scale.set(scorchR, 1, scorchR);
    v.scorch.material.opacity = clamp(smoothstep(0.2, 1.4, t), 0, 1) * 0.7;

    /* The base surge: shorter than the front and much more opaque, because it
     * is the part made of the ground rather than of the air. Cap scaled up
     * with the rest of the event (2300 -> 2900, the same ~26% the cap grew). */
    const surgeR = Math.min(R * 0.72, 2900);
    v.surge.scale.set(surgeR, lerp(60, 560, clamp(t / 7, 0, 1)), surgeR);
    v.surge.position.y = lerp(40, 300, clamp(t / 7, 0, 1));
    v.surge.material.opacity = clamp(smoothstep(0.15, 0.9, t), 0, 1) * clamp(1 - (t - 9) / 11, 0, 1) * 0.5;

    /* ---- The column ---- */
    const stemK = clamp((t - 0.5) / BLAST.stemRise, 0, 1);
    const stemH = Math.max(1, ballHeight * 0.98);
    v.stem.scale.set(1, stemH, 1);
    v.stem.position.y = stemH / 2;
    /* `settle(t)` rather than a fade to zero — see its own note. The column
     * is still there when the player looks back from the coast. */
    v.stem.material.opacity = clamp(stemK * 2.2, 0, 0.7) * settle(t);

    const skirtR = lerp(300, 1700, clamp(t / 9, 0, 1));
    v.skirt.scale.set(skirtR, lerp(120, 1130, clamp(t / 9, 0, 1)), skirtR);
    v.skirt.position.y = lerp(60, 540, clamp(t / 9, 0, 1));
    v.skirt.material.opacity = clamp(smoothstep(0.8, 2.4, t), 0, 1) * clamp(1 - (t - 16) / 12, 0, 1) * 0.4;

    /* ---- The cap. It only starts to unroll once the head is well up ---- */
    const capK = clamp((t - 2.6) / 9.0, 0, 1);
    const capR = lerp(ballR * 1.1, BLAST.capRadius, Math.sqrt(capK));
    const capY = ballHeight + capR * 0.14;
    v.cap.scale.set(capR, capR * BLAST.capThickness, capR);
    v.cap.position.y = capY;
    const capFade = clamp(capK * 1.5, 0, 1) * settle(t);
    v.cap.material.opacity = capFade * 0.82;
    v.capRoll.scale.setScalar(capR * 0.92);
    v.capRoll.position.y = capY - capR * 0.16;
    v.capRoll.material.opacity = capFade * 0.6;
    v.capRoll.rotation.z += dt * 0.24;

    /* The rim — see its own note at construction. Billboarded exactly like
     * `shellRing`, but sitting on the cap's own radius rather than the shock
     * front's, so it grows and settles with the cloud instead of with the
     * blast. */
    if (this.camera) v.capRim.quaternion.copy(this.camera.quaternion);
    v.capRim.position.y = capY;
    v.capRim.scale.setScalar(capR * 1.02);
    v.capRim.material.opacity = capFade * 0.7;

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
      puff.material.opacity = clamp(stemK * 1.6, 0, 1) * settle(t) * 0.42;
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

  /**
   * The active event is over. Switch off everything that was transient and
   * leave the cloud standing.
   *
   * Called exactly once. Everything hidden here is hidden for good: the flash,
   * the fireball shells, the Wilson cloud, the shock front in all four of its
   * forms, the base surge, the skirt, the gag and the sixty pieces of
   * Squatchbourg have all finished being anything by half a minute in, and the
   * two lights have gone out. What survives is the stem, the cap, the roll,
   * the puffs on both, and the black disc on the ground.
   */
  _settle() {
    this.lingering = true;
    this.screenFlash = 0;
    this.shockWash = 0;
    const v = this.vfx;
    if (!v) return;
    for (const o of [v.flash, v.wilson, v.bubble, v.shellRing, v.front,
      v.dustRing, v.surge, v.skirt, v.gag, ...v.fire, ...v.debris]) {
      o.visible = false;
    }
    v.light.intensity = 0;
    v.light.visible = false;
    v.afterglow.intensity = 0;
    v.afterglow.visible = false;
  }

  /**
   * The mushroom cloud, standing over the crater for the rest of the mission.
   *
   * Owner: "I also want a giant classic mushroom cloud to linger over the
   * crater."
   *
   * Deliberately slow and deliberately cheap — about fifty objects getting a
   * position and an opacity, and no trigonometry that was not already there.
   * The cap keeps spreading, because a real one does for a very
   * long time; the whole column leans downwind and thins; the roll keeps
   * turning, at a quarter of the speed it turned while it was hot. It never
   * reaches zero inside `BLAST.lingerSeconds`, which is longer than the flight
   * home.
   *
   * @param {number} dt
   * @param {number} age seconds since the active event ended
   */
  _updateLinger(dt, age) {
    const v = this.vfx;
    if (!v) return;

    /* Fifteen minutes to go from settled to gone, so nothing the player can
     * fly in that time makes it disappear. */
    const life = clamp(1 - age / BLAST.lingerSeconds, 0, 1);
    const spread = 1 + Math.min(age / 240, 0.45);   // still growing, slowly
    const drift = Math.min(age * 5.5, 1400);        // downwind, +X, and capped

    const capR = BLAST.capRadius * spread;
    const capY = BLAST.stemTop + capR * 0.14;
    v.cap.scale.set(capR, capR * BLAST.capThickness * lerp(1, 0.72, 1 - life), capR);
    v.cap.position.set(drift, capY, 0);
    v.cap.material.opacity = SETTLE * 0.82 * life;

    v.capRoll.scale.setScalar(capR * 0.92);
    v.capRoll.position.set(drift, capY - capR * 0.16, 0);
    v.capRoll.material.opacity = SETTLE * 0.6 * life;
    v.capRoll.rotation.z += dt * 0.06;

    /* The rim keeps riding the cloud's own drift and spread, and stays
     * billboarded — a player who flies a lazy circle to look back at it
     * should still see a crisp edge, not one frozen face-on to wherever the
     * camera was when the active event ended. */
    if (this.camera) v.capRim.quaternion.copy(this.camera.quaternion);
    v.capRim.position.set(drift, capY, 0);
    v.capRim.scale.setScalar(capR * 1.02);
    v.capRim.material.opacity = SETTLE * 0.7 * life;

    /* The stem leans: its foot is still on the crater, its head has been
     * carried downwind with the cap. A cylinder cannot bend, so it tilts. */
    const stemH = BLAST.stemTop * 0.98;
    v.stem.position.set(drift * 0.5, stemH / 2, 0);
    v.stem.rotation.z = -Math.atan2(drift, stemH);
    v.stem.material.opacity = 0.7 * SETTLE * life;

    for (const puff of v.smoke) {
      const u = puff.userData;
      const r = capR * u.ring;
      puff.position.set(
        drift + Math.cos(u.ang) * r,
        capY * u.lift + capR * 0.12,
        Math.sin(u.ang) * r,
      );
      puff.scale.setScalar(Math.max(capR * u.size, 1));
      puff.material.opacity = SETTLE * 0.55 * life;
    }
    for (const puff of v.stemPuffs) {
      const u = puff.userData;
      const y = stemH * u.at;
      const r = lerp(260, 420, u.at);
      puff.position.set(drift * u.at + Math.cos(u.ang) * r, y, Math.sin(u.ang) * r);
      puff.material.opacity = 0.42 * SETTLE * life;
    }
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
