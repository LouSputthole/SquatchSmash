/**
 * Mammoth M-12 "Brushrunner".
 *
 * An aging twin-piston utility aeroplane, built the way everything else in
 * this project is built: out of boxes and cylinders, with the paint and the
 * placards drawn onto canvases at runtime. Nose points +Z, right wing +X.
 *
 * The group is a single rigid body driven by AircraftPhysics; everything that
 * moves relative to it — propellers, control surfaces, gear legs, the
 * bobblehead, Lou's coffee — is a child transform updated in `update()`.
 */
import * as THREE from 'three';
import {
  mat, solid, unlit, boxGeo, cylGeo, coneGeo, sphereGeo, mesh, flatMesh, group,
  clamp, lerp, damp, signTexture,
} from './util.js';
import { AC } from './config.js';
import { drawSquatchSilhouette } from '../world/textures.js';
import { assetUrl } from '../core/assets.js';
import { Instruments } from './instruments.js';

const CREAM = 0xd9cfb4;
const CREAM_PATCH = 0xc3b795;
const BROWN = 0x7a5230;
const BROWN_DARK = 0x4f351f;
const METAL = 0x9aa0a6;

/* The hold, in aeroplane-local metres.
 *
 * `DECK_Y` is the surface the crates have always sat on: `CargoWeightSystem`
 * puts a loaded crate at local y -0.86 and a crate's own origin is its base.
 * The aeroplane group rides `AC.gearY` above the tarmac, so the deck stands
 * 1.62 - 0.86 = 0.76 m above the ground a man walks on, which is exactly the
 * step the owner could not climb. `RAMP_DROP` is that step; `RAMP_ANGLE` is
 * the angle two `RAMP_LEAF` boards make covering it. */
const DECK_Y = -0.86;
const HOLD_Z_AFT = -2.7;
const HOLD_Z_FWD = 2.34;
const RAMP_Z = -1.05;              // the cargo doorway's centreline
const RAMP_LEAF = 1.08;
const RAMP_DROP = 0.76;
const RAMP_ANGLE = Math.asin(Math.min(1, RAMP_DROP / (RAMP_LEAF * 2)));

const _deckPoint = new THREE.Vector3();
const _deckMat = new THREE.Matrix4();

/**
 * The Squatch Family emblem, painted on both sides of the fuselage. The real
 * squatch — the shared silhouette off the flat's posters, the arcade cabinet
 * and the wallpaper — walking in front of a moon, not the footprint that used
 * to stand in for him.
 */
function emblemTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9cfb4';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#4a2f8f';
  ctx.beginPath();
  ctx.arc(128, 120, 96, 0, Math.PI * 2);
  ctx.fill();
  // The moon he is always photographed against.
  ctx.fillStyle = 'rgba(207, 212, 224, 0.34)';
  ctx.beginPath();
  ctx.arc(128, 102, 60, 0, Math.PI * 2);
  ctx.fill();
  drawSquatchSilhouette(ctx, 128, 196, 148, '#cfd4e0');
  ctx.fillStyle = '#d92e2e';
  ctx.font = '900 26px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SQUATCH FAMILY', 128, 244);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The exact crest in Tony's apartment, carried onto the family aeroplane. */
function apartmentCrestTexture() {
  const tex = new THREE.TextureLoader().load(assetUrl('assets/art/', 'logo-crest.png'));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The old apartment-fridge pin-up, carried into the cockpit unchanged. */
function tammyStickerTexture() {
  const tex = new THREE.TextureLoader().load(assetUrl('assets/art/', 'sticker-pinup.png'));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Mission tally: completed runs, marked beside the cargo door.
 *
 * Owner's note: *"Pawprints on the side kind of weird."* They were — nine
 * identical purple blobs the size of a hand, spaced evenly across a bare cream
 * strip with no heading, no frame and no wear, stretched over a metre of
 * fuselage. Read at any distance it was a row of bruises.
 *
 * A mission tally on a real aeroplane is a small stencilled block under a
 * hand-painted heading, and it is DENSE: the marks are little, they run in
 * rows, they are struck with the same worn plate every time so the ink is
 * uneven, and the last one is always half done because the run is not finished
 * yet. That is what this draws — and the mark is a proper sasquatch print,
 * a heel pad with five separate toes above it, rather than an oval with three
 * dots over it.
 */
function tallyTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const ctx = c.getContext('2d');

  // Painted panel: the crew scrubbed a rectangle of the skin and worked in it.
  ctx.fillStyle = '#cfc4a6';
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = '#c6b998';
  ctx.fillRect(6, 6, 500, 148);
  ctx.strokeStyle = 'rgba(58,47,95,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 492, 140);

  ctx.fillStyle = '#3a2f5f';
  ctx.font = '900 30px Trebuchet MS, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RUNS', 22, 44);
  ctx.font = '700 17px Trebuchet MS, sans-serif';
  ctx.fillStyle = 'rgba(58,47,95,0.72)';
  ctx.fillText('EL HUESO', 22, 66);
  ctx.beginPath();
  ctx.moveTo(22, 76); ctx.lineTo(126, 76);
  ctx.strokeStyle = 'rgba(58,47,95,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  /* One print: a heel pad and five toes, struck small. `ink` carries the
   * unevenness — the plate is old and the paint is not. */
  const print = (x, y, s, ink) => {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(x, y, 4.6 * s, 6.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const toes = [[-4.4, -8.2, 1.5], [-2.1, -10.4, 1.7], [0.4, -11.0, 1.8], [2.8, -10.1, 1.6], [4.7, -8.0, 1.4]];
    for (const [tx, ty, tr] of toes) {
      ctx.beginPath();
      ctx.ellipse(x + tx * s, y + ty * s, tr * s, (tr + 0.5) * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // Fourteen struck, in two rows of seven, and a fifteenth only half inked.
  const x0 = 152, y0 = 58, dx = 25, dy = 52;
  for (let i = 0; i < 14; i++) {
    const col = i % 7, row = (i / 7) | 0;
    // Alternating strength plus a slow drift: no two strikes came out the same.
    const wear = 0.62 + ((i * 37) % 11) / 11 * 0.33;
    print(x0 + col * dx + row * 3, y0 + row * dy + ((i * 13) % 5) - 2, 1.05, `rgba(58,47,95,${wear.toFixed(2)})`);
  }
  ctx.save();
  ctx.globalAlpha = 0.34;
  print(x0 + 7 * dx + 3, y0 + dy, 1.05, '#3a2f5f');
  ctx.restore();

  // Two runs paid for in aeroplane: the crew crossed those out.
  ctx.strokeStyle = 'rgba(140,40,36,0.8)';
  ctx.lineWidth = 3;
  for (const i of [4, 9]) {
    const col = i % 7, row = (i / 7) | 0;
    const x = x0 + col * dx + row * 3, y = y0 + row * dy;
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 13); ctx.lineTo(x + 9, y + 7);
    ctx.moveTo(x + 9, y - 13); ctx.lineTo(x - 9, y + 7);
    ctx.stroke();
  }

  // Exhaust and rain have been over all of it for years.
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(70,58,40,${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 160, Math.random() * 46, Math.random() * 2.5);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function propBlade(material) {
  const g = new THREE.Group();
  const blade = mesh(boxGeo(0.16, 1.28, 0.05), material, 0, 0.72, 0);
  blade.rotation.y = 0.32;                 // pitch on the blade
  g.add(blade);
  const tip = mesh(boxGeo(0.16, 0.12, 0.05), solid(0xe8d24a, { roughness: 0.6 }), 0, 1.4, 0);
  g.add(tip);
  return g;
}

/**
 * A straight structural member run between two points — struts, braces, the
 * gear frame. Placing these by centre-plus-rotation is how both ends of a
 * strut ended up in mid-air twice on this aeroplane; naming the two points it
 * connects makes "attached" a property of the code rather than of luck.
 */
function memberBetween(a, b, w, d, material) {
  const m = mesh(boxGeo(w, a.distanceTo(b), d), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, _dir.copy(b).sub(a).normalize());
  m.userData.memberEnds = { a: a.clone(), b: b.clone() };
  return m;
}
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

export class Brushrunner {
  constructor({ withCockpit = true } = {}) {
    this.group = group('brushrunner');
    this.parts = {};
    this.anim = {
      propPhase: [0, 0],
      bobble: new THREE.Vector2(),
      bobbleVel: new THREE.Vector2(),
      cargoDoor: 0,
      flapVisual: 0,
      airBrakeVisual: 0,
      concern: 0,
      lighterSpark: 0,
    };
    /* Set only by a hard crash, and cleared by `resetDestruction` when a
     * checkpoint puts the aeroplane back. While it is true the airframe is
     * hidden and `update` drives the fireball instead of the animation rig. */
    this.destroyed = false;
    this.explosion = null;
    this.build();
    if (withCockpit) this.buildCockpit();
    this.instruments = withCockpit ? new Instruments(this.parts.panelCanvas) : null;
  }

  /* ---------------------------------------------------------------- */
  /* Exterior                                                          */
  /* ---------------------------------------------------------------- */

  build() {
    const skin = solid(CREAM, { roughness: 0.78, metalness: 0.12 });
    const patch = solid(CREAM_PATCH, { roughness: 0.86, metalness: 0.1 });
    const trim = solid(BROWN, { roughness: 0.72 });
    const dark = solid(BROWN_DARK, { roughness: 0.8 });
    const metal = solid(METAL, { roughness: 0.42, metalness: 0.7 });
    const rubber = solid(0x22242a, { roughness: 0.9 });
    const glassMat = mat({
      color: 0xcfe0e6, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.42,
    });

    const g = this.group;

    /* ---- Fuselage ----
     *
     * Owner's note: *"A little less square for the main hull."* It was a plain
     * 1.86 x 1.94 box, and from three-quarters on it read as a shipping
     * container with wings. A utility aeroplane of this vintage is slab-SIDED,
     * which is not the same as slab-cornered: the sides are flat panels, and
     * the four longitudinal corners are rolled, with a curved turtledeck over
     * the cabin and a rounded keel underneath.
     *
     * The box stays — it is the silhouette everything else is placed against,
     * and nothing dimensional changes — but it is narrowed a little at the
     * corners and the corners themselves are filled with rolled sections, so
     * the shape reads as sheet metal bent round a frame. */
    const body = mesh(boxGeo(1.78, 1.86, 7.4), skin, 0, 0, 0.4);
    body.name = 'fuselage-body';
    g.add(body);

    const hull = group('fuselage-shell');
    // Four rolled corner sections running the length of the cabin. Each is a
    // long cylinder set into the corner it fills.
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const roll = mesh(cylGeo(0.19, 0.19, 7.4, 10), skin, sx * 0.795, sy * 0.835, 0.4);
        roll.name = `fuselage-corner-${sy > 0 ? 'upper' : 'lower'}-${sx < 0 ? 'starboard' : 'port'}`;
        roll.rotation.x = Math.PI / 2;
        hull.add(roll);
      }
    }
    /* Turtledeck over the cabin, and the keel under it: half-round rather than
     * a flat lid and a flat floor pan.
     *
     * Radius 0.7, up from 0.5: at the old radius the dome only reached the
     * fuselage-body's own flat top (y 0.93) at the seat stations (x = ±0.42)
     * and fell fully inside it by the outboard edge of a seated head box —
     * so the cockpit's real ceiling there was the flat top, not the dome,
     * with no headroom to speak of. Widened to actually cover both seats;
     * see the seat comment below for the measured clearance this buys. */
    const deckRoll = mesh(cylGeo(0.7, 0.7, 6.9, 12, true), skin, 0, 0.66, 0.4);
    deckRoll.name = 'fuselage-turtledeck';
    deckRoll.rotation.x = Math.PI / 2;
    hull.add(deckRoll);
    const keel = mesh(cylGeo(0.62, 0.62, 7.0, 12, true), skin, 0, -0.5, 0.4);
    keel.name = 'fuselage-keel';
    keel.rotation.x = Math.PI / 2;
    hull.add(keel);
    g.add(hull);
    this.parts.hull = hull;

    /* Mismatched replacement panels. Nobody has ever repainted this aeroplane.
     * Named with the rest of the skin (`fuselage-` prefix) so the cockpit
     * verifier's shell allowlist catches them the same way: a patch riveted
     * over the belly is structurally the fuselage, and its bounding box
     * necessarily contains the cabin air behind it exactly like the skin it
     * is patching — that is not a fixture poking into the pilot or Sasole. */
    const patchAft = mesh(boxGeo(1.82, 0.62, 1.5), patch, 0, 0.34, -1.2);
    patchAft.name = 'fuselage-patch-aft';
    g.add(patchAft);
    const patchFwd = mesh(boxGeo(1.82, 0.44, 0.9), patch, 0, -0.5, 1.9);
    patchFwd.name = 'fuselage-patch-fwd';
    g.add(patchFwd);
    // Riveted belly strake.
    const strake = mesh(boxGeo(1.5, 0.1, 6.8), metal, 0, -0.99, 0.4);
    strake.name = 'fuselage-belly-strake';
    g.add(strake);

    const nose = mesh(cylGeo(0.42, 0.9, 1.5, 14), skin, 0, 0.05, 4.6);
    nose.name = 'nose-cone';
    nose.rotation.x = Math.PI / 2;
    g.add(nose);
    g.add(mesh(boxGeo(1.62, 1.52, 0.9), skin, 0, 0.05, 3.9));
    // The shoulder between the nose cone and the cabin, so the join is a
    // fairing rather than a step.
    const noseFairing = mesh(cylGeo(0.9, 1.02, 0.7, 14), skin, 0, 0.05, 3.62);
    noseFairing.name = 'nose-fairing';
    noseFairing.rotation.x = Math.PI / 2;
    g.add(noseFairing);

    /* Tail boom. Owner's note: *"Tail can be a bit thinner the tail rod
     * connecting it."* It was 0.92 m across at the root and 0.42 at the fin,
     * which is nearly the width of the cabin carried all the way aft — the
     * aeroplane had no waist. Taken in to 0.66 / 0.28 and given one more radial
     * segment, so it tapers away from the cabin the way a boom should. */
    const boom = mesh(cylGeo(0.28, 0.66, 4.8, 14), skin, 0, 0.16, -4.65);
    boom.name = 'tail-boom';
    boom.rotation.x = Math.PI / 2;
    g.add(boom);
    // Where the boom leaves the cabin, faired rather than butted.
    const boomRoot = mesh(cylGeo(0.66, 0.86, 0.8, 14), skin, 0, 0.16, -2.15);
    boomRoot.name = 'tail-boom-fairing';
    boomRoot.rotation.x = Math.PI / 2;
    g.add(boomRoot);

    // ---- Wing: high-mounted, with a slab spar and lift struts ----
    const wing = mesh(boxGeo(AC.span, 0.3, AC.chord), skin, 0, 1.16, 0.5);
    g.add(wing);
    this.parts.wing = wing;
    g.add(mesh(boxGeo(AC.span, 0.16, 0.34), trim, 0, 1.3, 0.5));  // spine stripe
    /* Lift struts, wing to fuselage. The old centre-plus-rotation placement
     * had the tilt backwards, so each strut left the wing and arrived at
     * nothing — outboard, below, in clean air. Named endpoints instead: top
     * buried in the wing underside just inboard of the nacelle, bottom in the
     * lower fuselage longeron, both sides. */
    for (const sx of [-1, 1]) {
      g.add(memberBetween(
        new THREE.Vector3(sx * 2.45, 1.06, 0.5),
        new THREE.Vector3(sx * 0.9, -0.6, 0.5),
        0.14, 0.4, metal,
      ));
    }

    // Ailerons and flaps hang off the wing trailing edge.
    this.parts.aileron = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 6.4, 1.16, -0.42);
      const surf = mesh(boxGeo(3.6, 0.16, 0.62), patch, 0, 0, -0.31);
      pivot.add(surf);
      g.add(pivot);
      this.parts.aileron.push(pivot);
    }
    this.parts.flap = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 2.6, 1.14, -0.42);
      const surf = mesh(boxGeo(3.4, 0.15, 0.66), skin, 0, 0, -0.33);
      pivot.add(surf);
      g.add(pivot);
      this.parts.flap.push(pivot);
    }
    // Twin spoilers give the new drag control a visible mechanical cause.
    // They sit inboard of the ailerons and hinge up only while Space is held.
    this.parts.airBrake = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = `air-brake-${sx < 0 ? 'left' : 'right'}`;
      pivot.position.set(sx * 2.25, 1.33, 0.55);
      const panel = mesh(boxGeo(2.2, 0.07, 0.52), patch, 0, 0, -0.24);
      pivot.add(panel);
      g.add(pivot);
      this.parts.airBrake.push(pivot);
    }

    // ---- Engines ----
    this.parts.prop = [];
    this.parts.propDisc = [];
    this.parts.exhaust = [];
    for (let i = 0; i < 2; i++) {
      /* Engine 0 is the LEFT engine everywhere else in this mission — the one
       * Sasole tells you to start first, the one that runs hot on the way
       * home. The aeroplane's left is +X (nose is +Z), so engine 0 hangs on
       * +X. It used to hang on -X, which is the starboard wing, so the "left"
       * engine coughed, smoked and overheated out of the right-hand window.
       * `physics.js` carries the matching moment arm. */
      const sx = i === 0 ? 1 : -1;
      const nx = sx * 3.05;
      const nacelle = mesh(boxGeo(1.02, 0.96, 3.3), skin, nx, 1.0, 0.9);
      g.add(nacelle);
      const cowl = mesh(cylGeo(0.44, 0.5, 0.9, 12), trim, nx, 1.0, 2.55);
      cowl.rotation.x = Math.PI / 2;
      g.add(cowl);
      const spinner = mesh(coneGeo(0.26, 0.6, 10), dark, nx, 1.0, 3.14);
      spinner.rotation.x = Math.PI / 2;
      g.add(spinner);

      const hub = new THREE.Group();
      hub.position.set(nx, 1.0, 3.06);
      const bladeMat = solid(0x2c2f34, { roughness: 0.55, metalness: 0.4 });
      for (let b = 0; b < 3; b++) {
        const blade = propBlade(bladeMat);
        blade.rotation.z = (b / 3) * Math.PI * 2;
        hub.add(blade);
      }
      // The chipped blade. Cosmetic, and Lou is not interested.
      if (i === 0) {
        const nick = mesh(boxGeo(0.17, 0.1, 0.06), solid(0xb8bcc2, { roughness: 0.4, metalness: 0.6 }), 0, 1.1, 0.02);
        hub.children[0].add(nick);
      }
      g.add(hub);
      this.parts.prop.push(hub);

      // Blur disc, faded in with RPM.
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.42, 24),
        new THREE.MeshBasicMaterial({
          color: 0xb9bec6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      disc.position.set(nx, 1.0, 3.1);
      g.add(disc);
      this.parts.propDisc.push(disc);

      // Exhaust stack, where the smoke comes from.
      const stack = mesh(cylGeo(0.1, 0.1, 0.5, 6), solid(0x3a3a3e, { roughness: 0.9 }), nx + sx * 0.36, 0.62, 1.5);
      stack.rotation.x = Math.PI / 2.2;
      g.add(stack);
      this.parts.exhaust.push(new THREE.Vector3(nx + sx * 0.36, 0.5, 1.2));
    }

    /* ---- Tail ----
     *
     * Thinner across the board on the same note. Aerofoils this size are a
     * hand's width thick, not a fist; the fin, rudder, tailplane and elevator
     * all come in, and the fin gains a leading-edge fillet running forward into
     * the boom so it grows out of the aeroplane instead of being stuck on it. */
    const fin = mesh(boxGeo(0.13, 2.5, 1.9), skin, 0, 1.6, -6.1);
    fin.name = 'fin';
    g.add(fin);
    const finFillet = mesh(boxGeo(0.12, 0.9, 1.5), skin, 0, 0.6, -5.05);
    finFillet.name = 'fin-dorsal-fillet';
    finFillet.rotation.x = -0.42;
    g.add(finFillet);
    g.add(mesh(boxGeo(0.15, 0.7, 1.0), trim, 0, 2.6, -6.3));
    const rudderPivot = new THREE.Group();
    rudderPivot.position.set(0, 1.5, -6.9);
    rudderPivot.add(mesh(boxGeo(0.115, 2.3, 0.9), patch, 0, 0, -0.45));
    g.add(rudderPivot);
    this.parts.rudder = rudderPivot;

    const stab = mesh(boxGeo(5.4, 0.12, 1.2), skin, 0, 0.66, -5.9);
    stab.name = 'tailplane';
    g.add(stab);
    const elevPivot = new THREE.Group();
    elevPivot.position.set(0, 0.66, -6.5);
    elevPivot.add(mesh(boxGeo(5.4, 0.105, 0.7), patch, 0, 0, -0.35));
    g.add(elevPivot);
    this.parts.elevator = elevPivot;

    /* The horizontal tail is wire-braced into the rear boom. Besides giving
     * the old utility airframe the right hand-built silhouette, named endpoints
     * guarantee every bar actually terminates in structure instead of floating
     * a few inches shy of the fuselage. These are visual children only: no
     * collider or flight-model dimensions change. */
    const tailFrame = group('tail-support-frame');
    for (const sx of [-1, 1]) {
      const upper = memberBetween(
        new THREE.Vector3(sx * 2.15, 0.58, -5.72),
        new THREE.Vector3(sx * 0.34, -0.22, -4.92),
        0.08, 0.08, metal,
      );
      /* Port is the aeroplane's left, and the nose is +Z, so port is +X. These
       * two names were the wrong way round, which is the same reading mistake
       * that put the pilot in the right seat. */
      upper.name = `tail-brace-${sx < 0 ? 'starboard' : 'port'}-forward`;
      tailFrame.add(upper);
      const aft = memberBetween(
        new THREE.Vector3(sx * 2.15, 0.58, -6.10),
        new THREE.Vector3(sx * 0.30, -0.18, -5.50),
        0.07, 0.07, metal,
      );
      aft.name = `tail-brace-${sx < 0 ? 'starboard' : 'port'}-aft`;
      tailFrame.add(aft);
    }
    g.add(tailFrame);
    this.parts.tailSupport = tailFrame;

    // Cowling clamp bands and an aft radio aerial add readable scale outside.
    const exteriorDetails = group('aircraft-exterior-details');
    for (const sx of [-1, 1]) {
      for (const z of [1.42, 2.18]) {
        const band = mesh(boxGeo(1.05, 0.99, 0.055), metal, sx * 3.05, 1.0, z);
        band.name = `nacelle-band-${sx < 0 ? 'starboard' : 'port'}-${z < 2 ? 'aft' : 'forward'}`;
        exteriorDetails.add(band);
      }
    }
    const aerial = memberBetween(
      new THREE.Vector3(0, 0.98, -2.15),
      new THREE.Vector3(0.08, 1.62, -2.36),
      0.035, 0.035, dark,
    );
    aerial.name = 'vhf-radio-aerial';
    exteriorDetails.add(aerial);
    g.add(exteriorDetails);
    this.parts.exteriorDetails = exteriorDetails;

    /* ---- Hull detail ----
     *
     * Owner's note: *"Just some more detail."* Everything here is skin: frame
     * stations, stringers, a door frame, the boarding step, static wicks, a
     * pitot mast, aerials, and the two stains an old aeroplane always has.
     * Nothing is registered with the interaction system and nothing moves, so
     * this is silhouette and read only. Kept in its own named group so the
     * exterior checks that count nacelle bands keep counting four. */
    const detail = group('aircraft-hull-detail');
    const rivet = solid(0xb2a88c, { roughness: 0.75, metalness: 0.25 });
    const shadowLine = solid(0xa79b7f, { roughness: 0.9 });

    // Frame stations: raised bands round the cabin, at the pitch a real
    // airframe puts its bulkheads.
    for (const [n, fz] of [[0, 3.1], [1, 1.9], [2, 0.7], [3, -0.5], [4, -1.7], [5, -2.7]]) {
      const band = mesh(boxGeo(1.83, 1.9, 0.045), rivet, 0, 0, fz);
      band.name = `fuselage-frame-${n}`;
      detail.add(band);
    }
    // Stringers: two long shallow lines down each side, the seams of the skin.
    for (const sx of [-1, 1]) {
      for (const [n, sy] of [[0, 0.44], [1, -0.36]]) {
        const line = mesh(boxGeo(0.035, 0.05, 6.9), shadowLine, sx * 0.905, sy, 0.4);
        line.name = `fuselage-stringer-${n}-${sx < 0 ? 'starboard' : 'port'}`;
        detail.add(line);
      }
    }
    // The cargo doorway, framed. A hole in a slab is a hole; a hole with a
    // frame round it is a door.
    for (const [n, dy] of [[0, 0.66], [1, -0.86]]) {
      const rail = mesh(boxGeo(0.05, 0.07, 1.78), rivet, -0.925, dy, -1.05);
      rail.name = `cargo-door-frame-${n === 0 ? 'head' : 'sill'}`;
      detail.add(rail);
    }
    for (const [n, dz] of [[0, -0.15], [1, -1.95]]) {
      const jamb = mesh(boxGeo(0.05, 1.6, 0.07), rivet, -0.925, -0.1, dz);
      jamb.name = `cargo-door-jamb-${n}`;
      detail.add(jamb);
    }
    // The step under the cabin door, which is how everybody but the cargo gets in.
    const step = mesh(boxGeo(0.34, 0.06, 0.5), metal, 1.0, -1.02, 1.55);
    step.name = 'boarding-step';
    detail.add(step);
    detail.add(memberBetween(
      new THREE.Vector3(0.94, -0.62, 1.55),
      new THREE.Vector3(1.0, -1.0, 1.55),
      0.05, 0.05, metal,
    ));
    // Pitot mast under the left wing root, and a static port each side.
    const pitot = mesh(cylGeo(0.028, 0.028, 0.42, 6), metal, 1.62, 1.02, 0.92);
    pitot.name = 'pitot-mast';
    pitot.rotation.x = Math.PI / 2;
    detail.add(pitot);
    for (const sx of [-1, 1]) {
      const portDisc = flatMesh(cylGeo(0.05, 0.05, 0.01, 8), metal, sx * 0.9, -0.1, 2.75);
      portDisc.name = `static-port-${sx < 0 ? 'starboard' : 'port'}`;
      portDisc.rotation.z = Math.PI / 2;
      detail.add(portDisc);
    }
    // Static wicks off the trailing edges, the little wire whiskers.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const wick = mesh(cylGeo(0.012, 0.012, 0.24, 4), solid(0x2a2a2e, { roughness: 0.9 }), sx * (4.6 + i * 1.6), 1.16, -0.78);
        wick.name = `static-wick-${sx < 0 ? 'starboard' : 'port'}-${i}`;
        wick.rotation.x = Math.PI / 2;
        wick.rotation.z = 0.2;
        detail.add(wick);
      }
    }
    // A second, shorter aerial on the belly, and the rotating-beacon plinth.
    const belly = mesh(boxGeo(0.05, 0.3, 0.18), solid(0x2a2a2e, { roughness: 0.85 }), 0, -1.16, -0.9);
    belly.name = 'belly-aerial';
    detail.add(belly);
    // Exhaust staining aft of each stack, and an oil weep under each nacelle.
    const soot = mat({ color: 0x3a332b, roughness: 1, transparent: true, opacity: 0.34 });
    for (const sx of [-1, 1]) {
      const streak = flatMesh(new THREE.PlaneGeometry(0.9, 2.6), soot, sx * 3.05, 0.52, -0.4);
      streak.name = `exhaust-stain-${sx < 0 ? 'starboard' : 'port'}`;
      streak.rotation.x = Math.PI / 2;
      detail.add(streak);
      const weep = flatMesh(new THREE.PlaneGeometry(0.22, 1.1), soot, sx * 3.4, 0.53, 0.6);
      weep.name = `oil-weep-${sx < 0 ? 'starboard' : 'port'}`;
      weep.rotation.y = sx * Math.PI / 2;
      detail.add(weep);
    }
    g.add(detail);
    this.parts.hullDetail = detail;

    this.buildCargoRamp(metal, patch);

    // ---- Landing gear: fixed, rugged, and slightly bent ----
    this.parts.gear = [];
    const legSpecs = [
      { x: 0, z: 2.15, r: 0.34 },
      { x: -AC.track / 2, z: -0.55, r: 0.46 },
      { x: AC.track / 2, z: -0.55, r: 0.46 },
    ];
    legSpecs.forEach((spec, i) => {
      const leg = new THREE.Group();
      /* The wheel hangs 0.7 below the leg origin and then its own radius below
       * that, so the leg has to sit exactly AC.gearY minus both — that is the
       * height the physics holds the CG at, and anything else buries the tyres
       * in the ground or floats the aeroplane above it. */
      leg.position.set(spec.x, -(AC.gearY - 0.7 - spec.r), spec.z);
      const strut = mesh(boxGeo(0.16, 0.7, 0.16), metal, 0, -0.35, 0);
      leg.add(strut);
      if (i > 0) {
        /* The wheel frame. It used to be a short brace that leaned inward and
         * stopped 0.4 m shy of the skin, so the whole main gear read as
         * parked luggage floating beside the aeroplane. Two members per side
         * now carry the leg into the fuselage — one into the side, one up
         * into the belly — with their inboard ends buried past the skin so
         * the suspension can compress without opening a daylight gap. */
        const inb = -Math.sign(spec.x);
        leg.add(memberBetween(
          new THREE.Vector3(0, -0.04, 0),
          new THREE.Vector3(inb * (Math.abs(spec.x) - 0.8), -0.1, 0),
          0.13, 0.13, metal,
        ));
        leg.add(memberBetween(
          new THREE.Vector3(0, -0.62, 0),
          new THREE.Vector3(inb * (Math.abs(spec.x) - 0.7), -0.44, 0),
          0.11, 0.11, metal,
        ));
      }
      const wheel = mesh(cylGeo(spec.r, spec.r, 0.28, 14), rubber, 0, -0.7 - spec.r * 0.0, 0);
      wheel.rotation.z = Math.PI / 2;
      leg.add(wheel);
      const hubCap = mesh(cylGeo(spec.r * 0.4, spec.r * 0.4, 0.3, 8), metal, 0, -0.7, 0);
      hubCap.rotation.z = Math.PI / 2;
      leg.add(hubCap);
      g.add(leg);
      this.parts.gear.push({ leg, wheel, rest: leg.position.y, base: leg.position.y });
    });

    // ---- Cargo door, starboard side aft (-X; the nose is +Z) ----
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-0.93, -0.1, -0.2);
    const door = mesh(boxGeo(0.08, 1.5, 1.7), patch, 0, 0, -0.85);
    doorPivot.add(door);
    /* The handle is a fixed mount with a lever inside it. Only the lever turns,
     * because anything that interacts with the handle hangs its reach proxy off
     * the mount — and a proxy that rotates ninety degrees mid-hold swings out
     * from under the crosshair and cancels the hold it was there to support. */
    const handleMount = new THREE.Group();
    handleMount.position.set(-0.09, -0.2, -0.3);
    handleMount.name = 'door-handle';
    const lever = mesh(boxGeo(0.14, 0.1, 0.42), metal, 0, 0, 0);
    handleMount.add(lever);
    doorPivot.add(handleMount);
    this.parts.doorHandle = handleMount;
    this.parts.doorLever = lever;
    g.add(doorPivot);
    this.parts.cargoDoor = doorPivot;

    /* The emblem goes on BOTH sides — an aeroplane with one good side is a
     * hearse — at z 1.28 so its aft edge stays clear of the side glazing,
     * whose outer face sits proud of the skin. The tally stays port-only,
     * beside the door: it is the crew's scoreboard, not livery. */
    const emblemMat = mat({ map: apartmentCrestTexture(), roughness: 0.9, transparent: true, alphaTest: 0.03 });
    for (const sx of [-1, 1]) {
      const emblem = flatMesh(new THREE.PlaneGeometry(0.9, 0.9), emblemMat, sx * 0.945, 0.28, 1.28);
      emblem.name = `fuselage-emblem-${sx < 0 ? 'right' : 'left'}`;
      emblem.rotation.y = sx * Math.PI / 2;
      g.add(emblem);
    }
    // Smaller than it was, because a run tally is a stencilled block on the
    // skin rather than a second piece of livery competing with the crest.
    const tally = flatMesh(new THREE.PlaneGeometry(0.78, 0.244), mat({ map: tallyTexture(), roughness: 0.9 }), -0.945, -0.37, 1.32);
    tally.name = 'run-tally';
    tally.rotation.y = -Math.PI / 2;
    g.add(tally);

    /* ---- Glazing ----
     * Named so the cockpit verifier's shell/canopy allowlist can name it
     * explicitly rather than guessing: this is the intended glass around the
     * pilot's head, not a fixture that should ever be flagged as poking into
     * his view. */
    const windshield = mesh(boxGeo(1.62, 0.92, 0.1), glassMat, 0, 0.72, 3.42);
    windshield.name = 'windshield';
    windshield.rotation.x = -0.34;
    windshield.castShadow = false;
    g.add(windshield);
    this.parts.windshield = windshield;
    for (const sx of [-1, 1]) {
      const side = mesh(boxGeo(0.06, 0.72, 1.5), glassMat, sx * 0.94, 0.55, 2.5);
      side.name = `cabin-glass-side-${sx < 0 ? 'right' : 'left'}`;
      side.castShadow = false;
      g.add(side);
      const port = mesh(boxGeo(0.06, 0.5, 0.6), glassMat, sx * 0.94, 0.45, 0.6);
      port.name = `cabin-glass-quarter-${sx < 0 ? 'right' : 'left'}`;
      port.castShadow = false;
      g.add(port);
    }

    // Navigation lights.
    this.parts.navLights = [];
    for (const [sx, color] of [[-1, 0xff2a1e], [1, 0x37ff6a]]) {
      const lamp = flatMesh(sphereGeo(0.09), unlit(color), sx * 8.5, 1.16, 0.2);
      g.add(lamp);
      this.parts.navLights.push(lamp);
    }
    const beacon = flatMesh(sphereGeo(0.1), unlit(0xff4a2a), 0, 2.9, -6.2);
    g.add(beacon);
    this.parts.beacon = beacon;

    /* Wing walk step, fuel caps and sample drains. The walkaround asks you to
     * find all of these from the ground, and as bare grey metal on a cream
     * wing they were four little discs nobody could see. Real aeroplanes
     * solve this the same way: the filler is a red anodised cap standing on a
     * painted contrast ring, with a handle across it so it reads as a thing
     * that turns, and the sample drain wears the same red at the bottom of a
     * dark collar. Colour only — every position is where it was. */
    const fuelRed = solid(0xc0392b, { roughness: 0.34, metalness: 0.55 });
    const placard = solid(0x1e1c1a, { roughness: 0.92 });
    const capBar = solid(0xe8e2d4, { roughness: 0.6 });

    this.parts.fuelCap = [];
    for (const sx of [-1, 1]) {
      g.add(flatMesh(cylGeo(0.30, 0.30, 0.012, 16), placard, sx * 4.4, 1.313, 0.5));
      const cap = mesh(cylGeo(0.16, 0.16, 0.07, 10), fuelRed, sx * 4.4, 1.34, 0.5);
      cap.add(mesh(boxGeo(0.24, 0.022, 0.05), capBar, 0, 0.04, 0));
      g.add(cap);
      this.parts.fuelCap.push(cap);
    }
    for (const sx of [-1, 1]) {
      g.add(mesh(boxGeo(0.34, 0.06, 0.24), metal, sx * 1.05, -0.55, 1.4));
    }
    // Fuel sample drains, under the wing roots.
    this.parts.drain = [];
    for (const sx of [-1, 1]) {
      g.add(flatMesh(cylGeo(0.15, 0.15, 0.012, 12), placard, sx * 1.4, 1.004, 0.4));
      const d = mesh(cylGeo(0.05, 0.05, 0.14, 6), fuelRed, sx * 1.4, 0.99, 0.4);
      g.add(d);
      this.parts.drain.push(d);
    }
  }

  /* ---------------------------------------------------------------- */
  /* The hold, and how a man gets into it                              */
  /* ---------------------------------------------------------------- */

  /**
   * A cabin floor and a fold-out loading ramp.
   *
   * Owner's note: *"When you open the cargo door the only way to get to the
   * crates is by clipping into the plane."* He is exactly right, and it was not
   * a collision bug — there was no route at all. The cabin floor sits 0.70 m
   * above the tarmac (measured: deck at world y 42.70, apron at 42.00), the
   * three loading bays are registered on markers parented INSIDE the fuselage,
   * and `world.groundAt` returned flat terrain everywhere including under the
   * door and inside the skin. So the only way to put the crosshair on a bay was
   * to walk through the side of the aeroplane.
   *
   * Two halves to the fix, and both are here:
   *
   *  - **Something to walk on.** A visible plank floor through the hold, and a
   *    two-leaf ramp hinged on the door sill. Stowed, the leaves fold back on
   *    each other and stand in the doorway behind the closed door; deployed,
   *    they straighten into one 2.1 m run at about 20 degrees.
   *  - **Somewhere to stand.** `deckHeightAt()` below answers the walk height
   *    at any world point over the ramp or the hold, and `src/beefrun/main.js`
   *    hands it to the player's `groundAt`, so he actually climbs.
   */
  buildCargoRamp(metal, patch) {
    const g = this.group;
    const plank = solid(0x6b5432, { roughness: 1 });
    const tread = solid(0x4f4634, { roughness: 1 });

    /* The hold floor. The crates already sit at local y -0.86, so this is the
     * surface they have been standing on all along, finally drawn. */
    const floor = group('cargo-floor');
    floor.position.set(0, DECK_Y, 0);
    for (let i = 0; i < 7; i++) {
      const board = mesh(boxGeo(1.66, 0.05, 0.68), i % 2 ? plank : tread, 0, -0.025, HOLD_Z_AFT + 0.34 + i * 0.72);
      board.name = `cargo-floor-board-${i}`;
      floor.add(board);
    }
    // Tie-down rails down each side of the floor, which is what the straps
    // would actually be hooked to.
    for (const sx of [-1, 1]) {
      const rail = mesh(boxGeo(0.07, 0.05, HOLD_Z_FWD - HOLD_Z_AFT), metal, sx * 0.74, 0.01, (HOLD_Z_FWD + HOLD_Z_AFT) / 2);
      rail.name = `cargo-tiedown-rail-${sx < 0 ? 'starboard' : 'port'}`;
      floor.add(rail);
    }
    g.add(floor);
    this.parts.cargoFloor = floor;

    /* The ramp. Leaf A hinges on the sill, leaf B on the end of A. */
    const hinge = new THREE.Group();
    hinge.name = 'cargo-ramp';
    hinge.position.set(-0.9, DECK_Y, RAMP_Z);
    const leafA = mesh(boxGeo(RAMP_LEAF, 0.06, 1.34), plank, -RAMP_LEAF / 2, 0, 0);
    leafA.name = 'cargo-ramp-leaf-inner';
    hinge.add(leafA);
    for (const sx of [-1, 1]) {
      const kerb = mesh(boxGeo(RAMP_LEAF, 0.09, 0.06), metal, -RAMP_LEAF / 2, 0.05, sx * 0.66);
      kerb.name = `cargo-ramp-kerb-inner-${sx < 0 ? 'aft' : 'forward'}`;
      hinge.add(kerb);
    }
    const knuckle = new THREE.Group();
    knuckle.name = 'cargo-ramp-knuckle';
    knuckle.position.set(-RAMP_LEAF, 0, 0);
    const leafB = mesh(boxGeo(RAMP_LEAF, 0.06, 1.34), tread, -RAMP_LEAF / 2, 0, 0);
    leafB.name = 'cargo-ramp-leaf-outer';
    knuckle.add(leafB);
    for (const sx of [-1, 1]) {
      const kerb = mesh(boxGeo(RAMP_LEAF, 0.09, 0.06), metal, -RAMP_LEAF / 2, 0.05, sx * 0.66);
      kerb.name = `cargo-ramp-kerb-outer-${sx < 0 ? 'aft' : 'forward'}`;
      knuckle.add(kerb);
    }
    // Cross cleats, so it reads as something you can get a grip on.
    for (let i = 0; i < 4; i++) {
      const cleat = mesh(boxGeo(0.07, 0.035, 1.2), patch, -0.16 - i * 0.24, 0.045, 0);
      cleat.name = `cargo-ramp-cleat-${i}`;
      knuckle.add(cleat);
    }
    hinge.add(knuckle);
    g.add(hinge);
    this.parts.cargoRamp = hinge;
    this.parts.cargoRampKnuckle = knuckle;

    /* 0 stowed, 1 down. Driven by `setCargoRamp()` from the mission, animated
     * in `update()`, and read by `deckHeightAt()`. */
    this.rampT = 0;
    this.rampWanted = 0;
    this.applyRampPose();
  }

  /** Put the two leaves where `rampT` says they are. */
  applyRampPose() {
    const t = clamp(this.rampT, 0, 1);
    const hinge = this.parts.cargoRamp;
    const knuckle = this.parts.cargoRampKnuckle;
    if (!hinge || !knuckle) return;
    // Stowed: leaf A straight up the door frame, leaf B folded back onto it.
    // Down: A at the ramp angle, B a straight continuation of it.
    hinge.rotation.z = lerp(-Math.PI / 2, RAMP_ANGLE, t);
    knuckle.rotation.z = lerp(-Math.PI, 0, t);
    hinge.visible = t > 0.001;
    this.parts.cargoFloor.visible = true;
  }

  /**
   * Ask for the ramp down (`true`) or stowed (`false`).
   * The mission calls this from the cargo door, and unconditionally before the
   * aeroplane is handed to a pilot.
   */
  setCargoRamp(down) {
    this.rampWanted = down ? 1 : 0;
    return this.rampWanted;
  }

  /** True while there is a route between the tarmac and the hold. */
  get cargoRampDown() {
    return this.rampT > 0.92;
  }

  /**
   * The height a walking man stands at over this aeroplane, or `null` if he is
   * not over it at all.
   *
   * Answered in the aeroplane's OWN frame, so it is still correct on the far
   * strip where the aeroplane is parked on a different heading and a slope.
   * `null` means "ask the terrain", which is what `main.js` then does.
   *
   * @param {number} x world metres
   * @param {number} z world metres
   * @returns {number|null} world height of the walking surface
   */
  deckHeightAt(x, z) {
    if (!this.cargoRampDown) return null;
    const g = this.group;
    g.updateWorldMatrix(true, false);
    _deckPoint.set(x, 0, z);
    _deckMat.copy(g.matrixWorld).invert();
    _deckPoint.applyMatrix4(_deckMat);
    const lx = _deckPoint.x, lz = _deckPoint.z;

    // Inside the hold: flat floor.
    if (lx > -0.86 && lx < 0.86 && lz > HOLD_Z_AFT && lz < HOLD_Z_FWD) {
      return this.deckWorldY(lx, DECK_Y, lz);
    }
    // On the ramp: a straight run outboard of the sill, over the door's width.
    const run = RAMP_LEAF * 2;
    if (lx <= -0.86 && lx > -0.9 - run && lz > RAMP_Z - 0.67 && lz < RAMP_Z + 0.67) {
      const along = clamp((-0.9 - lx) / run, 0, 1);
      // The far end of the ramp is on the ground; the near end is the sill.
      return this.deckWorldY(lx, DECK_Y - along * RAMP_DROP, lz);
    }
    return null;
  }

  /** Local deck point to world height. */
  deckWorldY(lx, ly, lz) {
    _deckPoint.set(lx, ly, lz).applyMatrix4(this.group.matrixWorld);
    return _deckPoint.y;
  }

  /**
   * Keep a man standing in the hold from walking out through the skin.
   *
   * The player's own collider list is world-axis-aligned boxes, which cannot
   * describe a rotated aeroplane. `Player._resolve` already leaves a hook for
   * exactly this case — "moving/rotated scenes resolve the capsule in their
   * own local frame" — so the cabin sides are resolved here, in aeroplane
   * space, and only while the man is actually up on the deck.
   */
  resolveOnDeck(player, axis, radius) {
    if (!this.cargoRampDown) return;
    const g = this.group;
    g.updateWorldMatrix(true, false);
    _deckMat.copy(g.matrixWorld).invert();
    _deckPoint.set(player.position.x, 0, player.position.z).applyMatrix4(_deckMat);
    const lx = _deckPoint.x, lz = _deckPoint.z;
    // Only inside the hold's own footprint, and only when he is up at deck
    // height rather than walking past underneath.
    if (lz <= HOLD_Z_AFT - radius || lz >= HOLD_Z_FWD + radius) return;
    if (lx < -0.9) return;                       // outboard of the door: the ramp
    const wall = 0.86 - radius;
    let pushed = false;
    if (lx > wall) { _deckPoint.x = wall; pushed = true; }
    if (lx < -wall && lz > RAMP_Z + 0.6) { _deckPoint.x = -wall; pushed = true; }
    if (lx < -wall && lz < RAMP_Z - 0.6) { _deckPoint.x = -wall; pushed = true; }
    // The forward bulkhead: the cockpit is not part of the hold.
    if (lz > HOLD_Z_FWD - radius) { _deckPoint.z = HOLD_Z_FWD - radius; pushed = true; }
    if (lz < HOLD_Z_AFT + radius) { _deckPoint.z = HOLD_Z_AFT + radius; pushed = true; }
    if (!pushed) return;
    _deckPoint.y = 0;
    _deckPoint.applyMatrix4(g.matrixWorld);
    if (axis === 'x') { player.position.x = _deckPoint.x; player.velocity.x = 0; }
    else { player.position.z = _deckPoint.z; player.velocity.z = 0; }
  }

  /* ---------------------------------------------------------------- */
  /* Cockpit                                                           */
  /* ---------------------------------------------------------------- */

  buildCockpit() {
    const g = new THREE.Group();
    g.name = 'cockpit';
    this.group.add(g);
    this.parts.cockpit = g;

    const panelDark = solid(0x2e2c29, { roughness: 0.72 });
    const trimMat = solid(0x4a4038, { roughness: 0.8 });
    const metal = solid(0x9aa0a6, { roughness: 0.4, metalness: 0.7 });
    const seatMat = solid(0x5c4a38, { roughness: 0.95 });

    /* Which way is left.
     *
     * The Brushrunner's nose is +Z (the fuselage above) and a seated pilot
     * faces it. In Three's right-handed frame, facing +Z with +Y up puts his
     * RIGHT at -X and his LEFT at +X — the mirror of what you read standing on
     * the apron looking at the aeroplane. Every asymmetric station below is
     * placed from INSIDE the cabin against these two constants, so "left seat"
     * means the seat the pilot in command actually occupies and the words
     * Captain Sasole says on the apron are true once you are sitting down.
     *
     * They used to be the other way round: the eye went in at -X, which is the
     * right seat, while the objective said "get into the left seat" and Sasole
     * announced he was taking the right one and then climbed into the left. */
    const LEFT = 1;
    const RIGHT = -1;

    /* Owner's note (8-6): *"cockpit still has shit intersecting my view and
     * of Sasole."* MEASURED CAUSE, second half: Sasole leans toward whoever
     * is flying every frame he is aboard — `updateFigure()` in npc.js aims
     * his neck and torso at `camera.position`, not only while he is talking
     * — and that lean swings his seated body's local x as far as +0.27,
     * across the centreline and past the pilot seat's own inboard edge at
     * 0.17. `tools/verify-beefrun.mjs`'s cockpit-clipping checks measured
     * this on all five flight-phase checkpoints, not one: the pilot seat and
     * the inboard rudder pedal came out 5-10 cm inside his body box every
     * time. Nobody is ever seated in the pilot seat to see it move (same
     * fact the seat comment below already leans on), so it and the pedals
     * riding under it go `PILOT_SEAT_CLEARANCE` further from the
     * centreline; the eye point, panel, coaming and yoke — everything the
     * pilot's own view is built from — are untouched. */
    const PILOT_SEAT_CLEARANCE = 0.14;

    // Instrument panel: one canvas for all six gauges, redrawn in flight.
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    this.parts.panelCanvas = canvas;
    const panelTex = new THREE.CanvasTexture(canvas);
    panelTex.colorSpace = THREE.SRGBColorSpace;
    this.parts.panelTex = panelTex;

    /* Panel and coaming both sit lower than they used to. The seated eye is
     * where a pilot's eye goes -- a hand's width under the cabin roof -- and
     * from there the old glare shield stood level with the horizon, so the
     * view out of the windshield was a strip of trim. Everything in front of
     * the seat now lives below the sightline, and the nose is the only thing
     * left in the way, which is how it should be. */
    const panel = mesh(boxGeo(1.62, 0.72, 0.1), panelDark, 0, 0.30, 2.86);
    panel.name = 'instrument-panel';
    panel.rotation.x = 0.16;
    g.add(panel);
    /* The gauges hang off the panel's own back face, turned to look into the
     * cabin. They used to be a plane facing the propeller, which is a
     * single-sided material pointed at nobody: six instruments drawn every
     * frame into a canvas that the only person aboard could not see. */
    const face = flatMesh(new THREE.PlaneGeometry(1.5, 0.64), new THREE.MeshBasicMaterial({ map: panelTex }), 0, 0, -0.052);
    face.rotation.y = Math.PI;
    panel.add(face);

    // Glare shield and coaming.
    const coaming = mesh(boxGeo(1.7, 0.1, 0.5), trimMat, 0, 0.70, 2.9);
    coaming.name = 'glare-shield-coaming';
    g.add(coaming);

    /* A complete radio stack rather than three anonymous green bars: three
     * separate boxes, lit frequency windows, tuning knobs, and a guarded power
     * switch. It is still decorative, but it now reads as equipment from either
     * seat and the exterior aerial makes the installation make sense. */
    const radio = group('cockpit-radio-stack');
    // Keep the stack below the forward sightline, but high enough that its
    // frequency windows are in the normal cockpit scan instead of below the
    // bottom of the screen. The slightly smaller housing fits between gauges.
    radio.position.set(0, 0.57, 2.87);
    radio.scale.setScalar(0.72);
    const radioShell = mesh(boxGeo(0.42, 0.62, 0.22), trimMat);
    radioShell.name = 'radio-stack-housing';
    radio.add(radioShell);
    const radioRows = [
      ['COM 1', '121.50'],
      ['SQUATCH FM', '97.80'],
      ['XPDR', '1200'],
    ];
    for (let i = 0; i < radioRows.length; i++) {
      const y = 0.2 - i * 0.2;
      const unit = mesh(boxGeo(0.38, 0.17, 0.08), panelDark, 0, y, -0.13);
      unit.name = `radio-unit-${i + 1}`;
      radio.add(unit);
      const display = flatMesh(
        new THREE.PlaneGeometry(0.23, 0.075),
        new THREE.MeshBasicMaterial({
          map: signTexture(radioRows[i], {
            w: 384, h: 128, bg: '#07130c', fg: '#72e593', border: '#26352d', rough: false,
          }),
          toneMapped: false,
        }),
        -0.025, y, -0.172,
      );
      display.name = `radio-display-${i + 1}`;
      display.rotation.y = Math.PI;
      radio.add(display);
      for (const x of [-0.16, 0.16]) {
        const knob = mesh(cylGeo(0.035, 0.035, 0.035, 10), metal, x, y, -0.18);
        knob.rotation.x = Math.PI / 2;
        knob.name = `radio-knob-${i + 1}-${x < 0 ? 'left' : 'right'}`;
        radio.add(knob);
      }
    }
    const radioGuard = mesh(boxGeo(0.09, 0.035, 0.035), solid(0xc44636, { roughness: 0.65 }), 0.13, -0.29, -0.18);
    radioGuard.name = 'radio-master-guard';
    radio.add(radioGuard);
    g.add(radio);
    this.parts.radioStack = radio;

    // Two yokes.
    this.parts.yoke = [];
    for (const sx of [-1, 1]) {
      const yokeRoot = new THREE.Group();
      yokeRoot.name = `yoke-${sx === RIGHT ? 'copilot' : 'pilot'}`;
      yokeRoot.position.set(sx * 0.42, 0.3, 2.42);
      const column = mesh(cylGeo(0.045, 0.045, 0.5, 8), metal, 0, 0, 0.2);
      column.rotation.x = Math.PI / 2;
      yokeRoot.add(column);
      const bar = mesh(boxGeo(0.44, 0.05, 0.05), panelDark, 0, 0, -0.05);
      yokeRoot.add(bar);
      for (const hx of [-0.22, 0.22]) {
        yokeRoot.add(mesh(boxGeo(0.06, 0.16, 0.05), panelDark, hx, 0.08, -0.05));
      }
      g.add(yokeRoot);
      this.parts.yoke.push(yokeRoot);
    }

    // Throttle / prop / mixture quadrant.
    this.parts.lever = [];
    const leverColors = [0x1d1d1f, 0x1d1d1f, 0x2f6bd9, 0x2f6bd9, 0xd94f2a, 0xd94f2a];
    const leverNames = ['lever-throttle-left', 'lever-throttle-right', 'lever-prop-left', 'lever-prop-right', 'lever-mixture-left', 'lever-mixture-right'];
    for (let i = 0; i < 6; i++) {
      const lever = new THREE.Group();
      lever.name = leverNames[i];
      lever.position.set(-0.16 + (i % 2) * 0.09 + Math.floor(i / 2) * 0.14 - 0.06, 0.06, 2.44);
      const shaft = mesh(boxGeo(0.035, 0.24, 0.035), metal, 0, 0.12, 0);
      lever.add(shaft);
      lever.add(mesh(sphereGeo(0.045), solid(leverColors[i], { roughness: 0.6 }), 0, 0.25, 0));
      g.add(lever);
      this.parts.lever.push(lever);
    }
    // Flap lever, off to the left of the quadrant.
    const flapLever = new THREE.Group();
    flapLever.name = 'flap-lever';
    flapLever.position.set(-0.34, 0.06, 2.4);
    flapLever.add(mesh(boxGeo(0.04, 0.3, 0.04), metal, 0, 0.15, 0));
    flapLever.add(mesh(boxGeo(0.1, 0.06, 0.1), solid(0xd9d2c4, { roughness: 0.7 }), 0, 0.31, 0));
    g.add(flapLever);
    this.parts.flapLever = flapLever;

    // Magnetic compass on the windshield post.
    // Hung just under the cabin roof at 0.97, not through it.
    const compassHousing = mesh(boxGeo(0.16, 0.14, 0.14), panelDark, 0, 0.90, 3.0);
    compassHousing.name = 'compass-housing';
    g.add(compassHousing);
    const compassCanvas = document.createElement('canvas');
    compassCanvas.width = 256; compassCanvas.height = 64;
    this.parts.compassCanvas = compassCanvas;
    const compassTex = new THREE.CanvasTexture(compassCanvas);
    compassTex.colorSpace = THREE.SRGBColorSpace;
    this.parts.compassTex = compassTex;
    // Same again: the card reads from the seat, not from outside the glass.
    const compassFace = flatMesh(new THREE.PlaneGeometry(0.15, 0.05), new THREE.MeshBasicMaterial({ map: compassTex }), 0, 0, -0.072);
    compassFace.rotation.y = Math.PI;
    compassHousing.add(compassFace);

    // Rudder pedals, under the flying pilot's feet — so, the left seat.
    // Shifted outboard by PILOT_SEAT_CLEARANCE with the seat below; see the
    // note by that constant.
    this.parts.pedal = [];
    for (const sx of [-1, 1]) {
      const pedal = mesh(boxGeo(0.12, 0.04, 0.2), metal, sx * 0.16 + LEFT * 0.42 + PILOT_SEAT_CLEARANCE, -0.42, 2.3);
      pedal.name = `rudder-pedal-${sx < 0 ? 'right' : 'left'}`;
      pedal.rotation.x = 0.5;
      g.add(pedal);
      this.parts.pedal.push(pedal);
    }

    /* Seats.
     *
     * Owner's note: *"a ton of shit clipping through my view and clipping
     * through Capt Sasole."* MEASURED CAUSE: `copilotSeat.y` (below) put
     * Sasole's seated head box at world y 0.89..1.17, against a cabin
     * ceiling that is the flat fuselage-body top (y 0.93) everywhere except
     * a narrow strip under the old 0.5 m turtledeck radius — so the outboard
     * side of his head, at his own seat's x, sat in the flat-roof zone and
     * came out the top of the aeroplane by up to 24 cm. The pilot's own eye
     * (`pilotEye`, unchanged here) grazed the same ceiling by about 3 cm,
     * which is what put fuselage skin in the camera's own near field.
     *
     * The turtledeck radius grows below to actually dome over both seat
     * stations rather than only the centreline, which alone clears the
     * pilot; Sasole's seat also drops 14 cm, cushion included, because his
     * head box is wider than the pilot's eye point and the outboard edge of
     * it still needs the extra room. The pilot's own seat also moves now —
     * see `PILOT_SEAT_CLEARANCE` above — because nobody sitting in it to
     * look at is exactly why it was free to sit in Sasole's swept path. */
    const copilotSeatDrop = 0.14;
    for (const sx of [-1, 1]) {
      const who = sx === RIGHT ? 'copilot' : 'pilot';
      const drop = sx === RIGHT ? copilotSeatDrop : 0;
      const clearance = sx === LEFT ? PILOT_SEAT_CLEARANCE : 0;
      const cushion = mesh(boxGeo(0.5, 0.12, 0.5), seatMat, sx * 0.42 + clearance, -0.35 - drop, 1.72);
      cushion.name = `${who}-seat-cushion`;
      g.add(cushion);
      const back = mesh(boxGeo(0.5, 0.62, 0.12), seatMat, sx * 0.42 + clearance, -0.05 - drop, 1.5);
      back.name = `${who}-seat-back`;
      g.add(back);
    }

    // The bobblehead: a sasquatch on a spring, and the honest instrument.
    const bobble = new THREE.Group();
    bobble.name = 'bobblehead';
    bobble.position.set(RIGHT * 0.3, 0.70, 2.94);  // stands on the coaming, inboard
    const bobBody = mesh(cylGeo(0.035, 0.045, 0.07, 8), solid(0x6b5a44, { roughness: 1 }), 0, 0.03, 0);
    bobble.add(bobBody);
    const bobHead = new THREE.Group();
    bobHead.position.y = 0.075;
    bobHead.add(mesh(sphereGeo(0.05), solid(0xa8a2b4, { roughness: 1 }), 0, 0, 0));
    bobHead.add(mesh(boxGeo(0.09, 0.02, 0.02), solid(0xd92e2e, { roughness: 0.9 }), 0, 0.01, 0.045));
    bobble.add(bobHead);
    g.add(bobble);
    this.parts.bobble = bobHead;

    /* Tammy is the exact old sticker from the apartment fridge: the pin-up
     * holding the AK, not a procedural text mug. She sits on the outboard end
     * of the flying pilot's own upper rail — the side away from Sasole, and
     * inside the ordinary forward scan from the left seat. */
    const tammy = flatMesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({
        map: tammyStickerTexture(), transparent: true, alphaTest: 0.06,
        side: THREE.DoubleSide, toneMapped: false,
      }),
      LEFT * 0.63, 0.77, 2.82,
    );
    tammy.name = 'tammy-golden-ak-sticker';
    tammy.rotation.y = Math.PI;
    tammy.renderOrder = 2;
    tammy.userData.sourceSlot = 'sticker.fridge';
    tammy.userData.sourceFile = 'sticker-pinup.png';
    g.add(tammy);
    this.parts.tammySticker = tammy;

    // Placards: the ones somebody wrote by hand and meant.
    const placard = (text, w, h, x, y, z, opts) => {
      const m = flatMesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: signTexture([text], { w: 256, h: 64, bg: '#d8d2c0', fg: '#1c1a17', border: null, rough: false, ...opts }) }),
        x, y, z,
      );
      m.rotation.x = 0.16;
      g.add(m);
      return m;
    };
    placard('IGNORE BELOW 20', 0.3, 0.05, LEFT * 0.42, 0.05, 2.79).name = 'placard-ignore-below-20';
    placard('GENERAL CONCERN', 0.26, 0.045, RIGHT * 0.52, 0.72, 2.83, { bg: '#3a3630', fg: '#e8c86a' }).name = 'placard-general-concern';

    // The warning light itself, above its label, over on Sasole's side.
    const concern = flatMesh(boxGeo(0.09, 0.045, 0.02), unlit(0x3a2a10), RIGHT * 0.52, 0.77, 2.82);
    concern.name = 'concern-light';
    g.add(concern);
    this.parts.concernLight = concern;

    // The taped map, wedged behind the right-seat yoke — Sasole's, to hold.
    const map = flatMesh(
      new THREE.PlaneGeometry(0.34, 0.24),
      new THREE.MeshBasicMaterial({
        map: signTexture(['EL HUESO', '(approx.)'], { w: 256, h: 192, bg: '#ddd0ab', fg: '#5a4a2a', border: '#9a8a5a', rough: true }),
      }),
      RIGHT * 0.62, 0.2, 2.7,
    );
    map.name = 'nav-map';
    map.rotation.set(0.7, -0.3, 0.12);
    g.add(map);
    for (const [ti, tx] of [-0.14, 0.14].entries()) {
      const tape = flatMesh(new THREE.PlaneGeometry(0.06, 0.05), unlit(0xe8e2c8, { transparent: true, opacity: 0.7 }), RIGHT * 0.62 + tx, 0.29, 2.69);
      tape.name = `nav-map-tape-${ti + 1}`;
      tape.rotation.copy(map.rotation);
      g.add(tape);
    }

    // Cigarette lighter that sometimes has an opinion.
    const lighter = flatMesh(cylGeo(0.02, 0.02, 0.02, 8), unlit(0x2a2a2a), LEFT * 0.6, 0.12, 2.78);
    lighter.name = 'cigarette-lighter';
    lighter.rotation.x = Math.PI / 2 + 0.16;
    g.add(lighter);
    this.parts.lighter = lighter;

    /* Where the cameras and the copilot live.
     *
     * Seated eye: the LEFT seat — +X, per the constants at the top of the
     * cockpit — just under the cabin roof. Raising the last 3 cm opens a
     * useful strip of windshield above the coaming without putting the camera
     * through the fuselage skin — true again now the turtledeck actually
     * domes over this x, with room to spare (measured clearance ~26 cm to the
     * dome above, ~3 cm was the fuselage-skin overlap before it widened).
     * Sasole rides the right seat opposite, which is what he says he is going
     * to do while he is still on the apron; his seat carries `copilotSeatDrop`
     * (above) so his own, wider head box clears the same roof on its
     * outboard side — see the seat comment for the measured numbers. */
    this.pilotEye = new THREE.Vector3(LEFT * 0.42, 0.96, 2.22);
    this.copilotSeat = new THREE.Vector3(RIGHT * 0.42, -0.28 - copilotSeatDrop, 1.66);
  }

  /* ---------------------------------------------------------------- */
  /* Per-frame                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * @param {number} dt
   * @param {object} phys   AircraftPhysics
   * @param {object} engines EngineSystem
   * @param {object} state  { cargoDoorOpen, dusk, gLat, warnings }
   */
  update(dt, phys, engines, state = {}) {
    /* Nothing on the animation rig means anything once the aeroplane is a
     * fireball — the props are gone, the flaps are gone, and the parts the
     * rest of this method reaches for are hidden. */
    if (this.destroyed) {
      this.updateExplosion(dt);
      return;
    }
    const a = this.anim;
    const c = phys.controls;

    // Props: spin, and fade into a disc as the RPM comes up.
    for (let i = 0; i < 2; i++) {
      const e = engines.engines[i];
      const rate = (e.rpm / 60) * Math.PI * 2 * (i === 0 ? 1 : -1);
      // Above a few hundred RPM the blades are a strobe artefact, so slow the
      // visible spin and let the disc carry the illusion instead.
      const visible = e.rpm < 420 ? rate : rate * 0.06;
      a.propPhase[i] += visible * dt;
      this.parts.prop[i].rotation.z = a.propPhase[i];
      const discOpacity = clamp((e.rpm - 380) / 900, 0, 0.34);
      this.parts.propDisc[i].material.opacity = discOpacity;
      this.parts.prop[i].visible = e.rpm < 1500;
    }

    // Control surfaces follow the yokes and the pedals.
    const elev = -c.pitch * 0.34;
    this.parts.elevator.rotation.x = elev;
    this.parts.rudder.rotation.y = -c.yaw * 0.38;
    this.parts.aileron[0].rotation.x = c.roll * 0.36;
    this.parts.aileron[1].rotation.x = -c.roll * 0.36;
    a.flapVisual = damp(a.flapVisual, c.flaps, 4, dt);
    this.parts.flap[0].rotation.x = a.flapVisual * 0.62;
    this.parts.flap[1].rotation.x = a.flapVisual * 0.62;
    a.airBrakeVisual = damp(a.airBrakeVisual, c.airBrake || 0, 9, dt);
    this.parts.airBrake[0].rotation.x = a.airBrakeVisual * 0.95;
    this.parts.airBrake[1].rotation.x = a.airBrakeVisual * 0.95;

    if (this.parts.cockpit) {
      for (const yoke of this.parts.yoke) {
        yoke.position.z = 2.42 - c.pitch * 0.07;
        yoke.rotation.z = -c.roll * 0.5;
      }
      this.parts.pedal[0].position.z = 2.3 + c.yaw * 0.05;
      this.parts.pedal[1].position.z = 2.3 - c.yaw * 0.05;
      this.parts.flapLever.rotation.x = a.flapVisual * 0.5;
      const throttle = (c.throttleL + c.throttleR) / 2;
      this.parts.lever[0].rotation.x = -0.5 + c.throttleL * 0.9;
      this.parts.lever[1].rotation.x = -0.5 + c.throttleR * 0.9;
      this.parts.lever[2].rotation.x = -0.5 + throttle * 0.5;
      this.parts.lever[3].rotation.x = -0.5 + throttle * 0.5;
    }

    // Gear legs compress under load.
    for (let i = 0; i < this.parts.gear.length; i++) {
      const gear = this.parts.gear[i];
      const squash = clamp(phys.suspension[i], 0, 1) * 0.22;
      gear.leg.position.y = gear.rest + squash;
      gear.wheel.rotation.x -= (phys.groundSpeed / 0.46) * dt * (phys.onGround ? 1 : 0.15);
    }

    // Cargo door.
    a.cargoDoor = damp(a.cargoDoor, state.cargoDoorOpen ? 1 : 0, 3.5, dt);
    this.parts.cargoDoor.rotation.z = -a.cargoDoor * 1.25;

    /* The loading ramp. It follows the door by default — the point of the door
     * is the hold, and the point of the hold is being able to get into it —
     * but the mission can pin it stowed, and does before anybody takes the
     * aeroplane anywhere. It also folds itself up the moment the wheels start
     * turning, on the same rule the chocks now obey. */
    if (this.parts.cargoRamp) {
      /* "Moving" has to be read off speed and height, not off `onGround`:
       * `physics.advance()` only runs while somebody is in the seat, so a
       * parked aeroplane the player is walking around still reports
       * `onGround === false` from its constructor and would fold the ramp the
       * player is standing on. */
      const rolling = phys.groundSpeed > 1.2 || phys.agl > 2;
      const want = rolling ? 0 : clamp(this.rampWanted, 0, 1);
      this.rampT = damp(this.rampT, want, 3, dt);
      if (Math.abs(this.rampT - want) < 0.004) this.rampT = want;
      this.applyRampPose();
    }

    // Beacon and nav lights: the beacon still turns in daylight because nobody
    // has ever found the switch.
    const beaconPulse = (Math.sin(phys.time * 3.4) + 1) / 2;
    this.parts.beacon.material = beaconPulse > 0.6 ? unlit(0xff5a3a) : unlit(0x4a1a10);
    const lit = state.dusk ? 1 : 0.35;
    for (const l of this.parts.navLights) l.scale.setScalar(0.7 + lit * 0.5);

    if (!this.parts.cockpit) return;

    // The bobblehead is a spring-mass on the dashboard: it reads g and gust,
    // which makes it the most honest instrument in the aeroplane.
    const shake = (phys.gLoad - 1) * 0.9 + phys.stallT * 1.4 + (state.roughness || 0);
    a.bobbleVel.x += (-a.bobble.x * 42 - a.bobbleVel.x * 5.5 + (state.gLat || 0) * 6 + (Math.random() - 0.5) * shake * 6) * dt;
    a.bobbleVel.y += (-a.bobble.y * 38 - a.bobbleVel.y * 5 + (phys.gLoad - 1) * 4 + (Math.random() - 0.5) * shake * 5) * dt;
    a.bobble.x = clamp(a.bobble.x + a.bobbleVel.x * dt, -0.6, 0.6);
    a.bobble.y = clamp(a.bobble.y + a.bobbleVel.y * dt, -0.6, 0.6);
    this.parts.bobble.rotation.z = a.bobble.x;
    this.parts.bobble.rotation.x = a.bobble.y;

    // GENERAL CONCERN. Nobody has ever established what it means.
    const concerned = state.concern ?? (phys.stalled || engines.engines.some((e) => e.temp > 240 || !e.running));
    a.concern = damp(a.concern, concerned ? 1 : 0, 6, dt);
    const flash = concerned && Math.sin(phys.time * 9) > 0;
    this.parts.concernLight.material = flash ? unlit(0xffb648) : unlit(0x3a2a10);

    // The lighter sparks when it feels like it.
    a.lighterSpark -= dt;
    if (a.lighterSpark < 0) {
      a.lighterSpark = 6 + Math.random() * 14;
      this.parts.lighter.material = unlit(0xff8a3a);
      setTimeout(() => { this.parts.lighter.material = unlit(0x2a2a2a); }, 90);
    }

    // Instruments — redrawn at a fraction of the frame rate; needles wobble.
    this.instruments?.update(dt, phys, engines, state);
    if (this.instruments?.dirty) {
      this.parts.panelTex.needsUpdate = true;
      this.instruments.dirty = false;
    }
    this._compassAccum = (this._compassAccum || 0) + dt;
    if (this._compassAccum > 0.1) {
      this._compassAccum = 0;
      this.drawCompass(phys.headingDeg);
    }
  }

  /**
   * Replace the intact airframe with a short-lived fireball and debris fan.
   *
   * Hiding the direct children rather than emptying the group is what makes
   * `resetDestruction` cheap and lossless: the aeroplane is still built, still
   * has every part and canvas it had, and a checkpoint restore just turns it
   * back on. Nothing here is rebuilt.
   *
   * @returns {boolean} false if it was already destroyed
   */
  explode() {
    if (this.destroyed) return false;
    this.destroyed = true;
    for (const child of this.group.children) child.visible = false;

    const fx = group('brushrunner-explosion');
    fx.userData.age = 0;
    const fire = [
      [0xffe06a, 1.5, 0, 0.2, 1.0],
      [0xff7a24, 2.2, -0.7, 0.0, 0.3],
      [0xd92e18, 2.8, 0.8, -0.2, 0.1],
    ];
    for (const [colour, radius, x, y, z] of fire) {
      const material = new THREE.MeshBasicMaterial({
        color: colour, transparent: true, opacity: 0.96,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const ball = mesh(sphereGeo(radius, 14, 9), material, x, y, z);
      ball.userData.fireball = true;
      fx.add(ball);
    }
    for (let i = 0; i < 7; i++) {
      const smoke = mesh(
        sphereGeo(0.9 + (i % 3) * 0.35, 9, 6),
        new THREE.MeshBasicMaterial({ color: 0x2a2522, transparent: true, opacity: 0.76, depthWrite: false }),
        (i - 3) * 0.58, 0.6 + (i % 2) * 0.5, (i % 3) * 0.65 - 0.5,
      );
      smoke.userData.smoke = true;
      fx.add(smoke);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const debris = mesh(
        boxGeo(0.15 + (i % 3) * 0.1, 0.08, 0.35 + (i % 2) * 0.2),
        solid(i % 2 ? BROWN : METAL, { roughness: 0.8, metalness: i % 2 ? 0 : 0.5 }),
        Math.cos(a) * 1.2, (i % 4) * 0.24 - 0.2, Math.sin(a) * 1.2,
      );
      debris.userData.debris = true;
      debris.userData.velocity = new THREE.Vector3(Math.cos(a) * (4 + i % 3), 3 + (i % 5), Math.sin(a) * (4 + i % 3));
      fx.add(debris);
    }
    /* Added after the hide loop, so it is the one thing still visible. */
    this.group.add(fx);
    this.explosion = fx;
    return true;
  }

  updateExplosion(dt) {
    const fx = this.explosion;
    if (!fx) return;
    fx.userData.age += dt;
    const age = fx.userData.age;
    for (const child of fx.children) {
      if (child.userData.fireball) {
        child.scale.setScalar(1 + age * 2.8);
        child.material.opacity = clamp(1 - age / 1.15, 0, 1);
      } else if (child.userData.smoke) {
        child.position.y += dt * 2.1;
        child.scale.addScalar(dt * 0.8);
        child.material.opacity = clamp(0.76 - age * 0.18, 0.12, 0.76);
      } else if (child.userData.debris) {
        child.position.addScaledVector(child.userData.velocity, dt);
        child.userData.velocity.y -= 9.8 * dt;
        child.rotation.x += dt * 5;
        child.rotation.z += dt * 3;
      }
    }
  }

  /** Put the aeroplane back, for a checkpoint restore. */
  resetDestruction() {
    if (this.explosion) {
      this.group.remove(this.explosion);
      /* Every material here is made fresh in `explode`, so nothing shared is
       * being disposed and a second crash builds its own. */
      this.explosion.traverse((o) => o.material?.dispose?.());
    }
    this.explosion = null;
    this.destroyed = false;
    /* Safe to turn everything back on: the only conditional visibility on this
     * model is the prop discs, which live inside the nacelle groups rather than
     * at this level and are reassigned every frame by `update`. */
    for (const child of this.group.children) child.visible = true;
  }

  drawCompass(heading) {
    const c = this.parts.compassCanvas;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1815';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#c8bda4';
    ctx.fillStyle = '#e8dcc0';
    ctx.font = '700 22px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pxPerDeg = 2.4;
    for (let d = -60; d <= 60; d += 5) {
      const h = ((heading + d) % 360 + 360) % 360;
      const x = c.width / 2 + d * pxPerDeg;
      if (x < 0 || x > c.width) continue;
      if (h % 30 < 2.5 || h % 30 > 27.5) {
        const label = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'][Math.round(h / 30) % 12];
        ctx.fillText(label, x, 34);
      } else {
        ctx.fillRect(x - 1, 12, 2, 8);
      }
    }
    ctx.fillStyle = '#d92e2e';
    ctx.fillRect(c.width / 2 - 1.5, 0, 3, c.height);
    this.parts.compassTex.needsUpdate = true;
  }

  /** Point in world space where an engine's exhaust leaves the aeroplane. */
  exhaustPoint(i, out = new THREE.Vector3()) {
    return out.copy(this.parts.exhaust[i]).applyMatrix4(this.group.matrixWorld);
  }

  /** Follow the physics body. Called once per frame after the sim. */
  syncTo(phys) {
    this.group.position.copy(phys.position);
    this.group.quaternion.copy(phys.quat);
  }

  setCargoWeightVisual(kg) {
    // The gear sits lower with a load on. Small, but you can see it.
    const sag = clamp(kg / AC.maxCargo, 0, 1) * 0.08;
    // Each leg keeps its own base — the nose wheel is smaller than the mains,
    // so one shared number would put one set of tyres in the dirt.
    for (const gear of this.parts.gear) gear.rest = gear.base - sag * 0.4;
    void lerp;
  }
}
