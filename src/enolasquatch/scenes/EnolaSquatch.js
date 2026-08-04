/**
 * "The Enola Squatch" — a much heavier four-engine bomber, built the same
 * way everything else in this project is built: out of boxes and cylinders,
 * with the paint and the placards drawn onto canvases at runtime.
 *
 * FRAME (read this before moving anything sideways). The nose points +Z and
 * the aeroplane is upright in a right-handed Y-up world, so forward x up =
 * (0,0,1) x (0,1,0) = (-1,0,0): the pilot's RIGHT is -X and the pilot's LEFT
 * — and therefore PORT — is +X. This is the same convention
 * `src/beefrun/aircraft.js`'s `Brushrunner` uses, and getting it backwards is
 * exactly the bug that put Tony in the wrong seat of the Brushrunner for
 * months (see the 2026-08-03 continuation notes, "Beef Run seats are
 * mirrored"). This file had inherited the same reversal — `pilotEye` was at
 * -X under a comment claiming it was the left seat — and it is corrected
 * below, which matters now that Captain Sasole is a visible figure sitting in
 * the other one.
 *
 * The group is a single rigid body meant to be driven by Beef Run's
 * `AircraftPhysics` (see `src/enolasquatch/config.js`'s `AC_ENOLA`, passed in
 * as `AircraftPhysics`'s `ac` option) exactly the way `Brushrunner` is: props,
 * control surfaces, gear legs and the bomb-bay doors are child transforms
 * updated in `update()`, following the physics body.
 */
import * as THREE from 'three';
import {
  mat, solid, unlit, boxGeo, cylGeo, coneGeo, sphereGeo, planeGeo,
  mesh, flatMesh, group, clamp, damp, signTexture,
} from '../../beefrun/util.js';
import { Instruments } from '../../beefrun/instruments.js';
import { crestPlaceholderTexture, applyCrest } from '../livery.js';
import { AC_ENOLA } from '../config.js';

const SKIN = 0x9aa0ac;          // bare-metal grey, unlike the Brushrunner's cream
const SKIN_PATCH = 0x7c828e;    // a shade off, for the "suspicious repairs"
const PATCH_ROUGH = 0x5a5248;   // a *different* mismatched patch — rougher, browner
const TRIM = 0x2a2c30;
const METAL = 0x8a8f96;
const PURPLE = 0x4a2f8f;
const PURPLE_LIGHT = 0x8a6fd9;

/* 2026-08-04: the airframe grew ~20% in every linear dimension to match
 * `AC_ENOLA`'s bigger span/chord/mass (see the note above the constant in
 * ../config.js). Everything below is derived from these five numbers, so the
 * proportions moved as one piece rather than drifting part by part. */
const FUSE_W = 3.2, FUSE_H = 3.4, FUSE_LEN = 15.5;
const BAY_Z = 0.4;               // ventral bomb-bay centre, mid-fuselage
const BAY_LEN = 6.4;
const BAY_WIDTH = 3.0;
const BELLY_Y = -FUSE_H / 2;
/* Nacelle stations. `AC_ENOLA.engineArm` is the average of |x| over one side's
 * pair and must be kept in step with these. */
const NACELLE_X = [-13.4, -6.4, 6.4, 13.4];

/* ------------------------------------------------------------------ */
/* Skin layering.
 *
 * Owner playtest, 2026-08-04: "Lot of intersecting things on the side."
 * There were. Every flank decoration was placed at its own ad-hoc offset
 * within a couple of centimetres of the skin, so they all landed in the same
 * two-centimetre shell and fought: the purple racing stripe ran straight
 * THROUGH the nose art and the "ENOLA SQUATCH" title plate, the second patch
 * panel enclosed the stripe entirely (a 0.08 m box around a 0.04 m box, both
 * centred on the same plane), and the crew-door frame did the same thing
 * further aft.
 *
 * These four constants are the fix: one declared stacking order out from the
 * skin, with real separation between the layers, and every flank part placed
 * against the layer it belongs to rather than against a number typed at the
 * call site. Anything added to the fuselage sides later goes on one of these.
 *
 *   SKIN_X    the aluminium itself
 *   SEAM_X    panel lines and rivet runs — scribed into the skin
 *   LIVERY_X  paint: the racing stripe and its pinstripe
 *   DECAL_X   painted-on artwork: nose art, title plate, club crests
 *   PANEL_X   bolted-on hardware: the repair patches, the crew door
 *
 * Paint goes over the metal, artwork goes over the paint, and a riveted patch
 * covers all of it — which is also the right story for this aeroplane. */
const SKIN_X = FUSE_W / 2;
const SEAM_X = SKIN_X + 0.004;    // boxes 0.024 thick -> outer face +0.016
const LIVERY_X = SKIN_X + 0.038;  // boxes 0.036 thick -> +0.020 .. +0.056
const DECAL_X = SKIN_X + 0.068;   // flat planes, clear of the livery
const PANEL_X = SKIN_X + 0.105;   // boxes 0.06 thick -> +0.075 .. +0.135

/**
 * Three-bladed prop.
 *
 * Owner playtest: "Front propeller looks off." It was — a straight untwisted
 * slab standing out of a bare hub, with the spinner cone BEHIND the blades
 * instead of in front of them (`coneGeo` centred at z 5.0 with the blades at
 * z 4.85, so the blades came out of the middle of the cone and the only thing
 * visible from the front was the cowl ring). A real constant-speed blade is
 * wide and thick at the root, thin and narrow at the tip, and twisted maybe
 * thirty degrees between the two, which is most of why a propeller reads as a
 * propeller and not as three sticks. Four tapered, progressively twisted
 * segments plus a root cuff get that for twelve boxes an engine.
 */
function propBlade(material) {
  const g = new THREE.Group();
  // Root cuff: the fat cylindrical shank that goes into the hub.
  const cuff = mesh(cylGeo(0.115, 0.13, 0.34, 10), solid(0x3a3d43, { roughness: 0.45, metalness: 0.5 }), 0, 0.3, 0);
  g.add(cuff);
  /* [halfway-out, width, thickness, twist] — the aerofoil narrows and flattens
   * outboard while the pitch angle unwinds, same as the real thing. */
  const stations = [
    [0.62, 0.30, 0.105, 0.62],
    [1.10, 0.27, 0.078, 0.44],
    [1.56, 0.23, 0.058, 0.28],
    [1.98, 0.17, 0.042, 0.16],
  ];
  let prev = 0.45;
  for (const [y, w, t, twist] of stations) {
    const len = (y - prev) * 2;
    const seg = mesh(boxGeo(w, len, t), material, 0, prev + len / 2, 0);
    seg.rotation.y = twist;
    g.add(seg);
    prev = y;
  }
  // The yellow tip stripe every ground-crew-bitten propeller has.
  const tip = mesh(boxGeo(0.17, 0.2, 0.042), solid(0xe8d24a, { roughness: 0.6 }), 0, 2.06, 0);
  tip.rotation.y = 0.16;
  g.add(tip);
  return g;
}

/**
 * A rounded corner strake.
 *
 * Owner playtest: "Maybe a bit less square in some areas." The fuselage, the
 * nacelles and the fin are all boxes, and a box's giveaway is its four hard
 * longitudinal edges catching the light as one continuous line. A thin bar
 * rolled 45 degrees into each edge turns one 90-degree corner into two
 * 45-degree ones for one box per edge, which is the cheapest chamfer there is
 * and reads from every angle a walkaround puts the player at.
 */
function chamfer(material, w, len, x, y, z, roll, axis = 'z') {
  const bar = mesh(axis === 'z' ? boxGeo(w, w, len) : boxGeo(len, w, w), material, x, y, z);
  if (axis === 'z') bar.rotation.z = roll;
  else bar.rotation.x = roll;
  return bar;
}

/**
 * A run of rivets along a panel seam. Cheap detail that reads at the distance
 * a walkaround puts the player at — three metres — and disappears at cruise.
 * One small cylinder each, parented to whatever panel owns them.
 */
function rivetRun(material, count, spacing, axis = 'z') {
  const g = group('rivets');
  const half = ((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    const d = -half + i * spacing;
    g.add(mesh(cylGeo(0.028, 0.028, 0.03, 6), material, axis === 'x' ? d : 0, 0, axis === 'z' ? d : 0));
  }
  return g;
}

/**
 * The stylized painted nose art: a flat, hand-painted-looking Sasquatch
 * face rather than the Squatch Family's full walking silhouette (that emblem
 * lives on the Brushrunner; this crew wanted something that reads at a
 * glance from the hangar floor). One canvas, drawn once.
 */
function noseArtTexture() {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 384;
  const ctx = c.getContext('2d');
  ctx.fillStyle = SKIN_HEX(SKIN_PATCH);
  ctx.fillRect(0, 0, 384, 384);
  // A rough painted disc backdrop — nobody masked this off cleanly.
  ctx.fillStyle = '#2a2438';
  ctx.beginPath();
  ctx.arc(192, 200, 156, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PURPLE_HEX();
  ctx.beginPath();
  ctx.arc(192, 200, 150, 0, Math.PI * 2);
  ctx.fill();

  const fur = '#c9c2d4';
  ctx.fillStyle = fur;
  // Head silhouette, front-on.
  ctx.beginPath();
  ctx.ellipse(192, 210, 118, 132, 0, 0, Math.PI * 2);
  ctx.fill();
  // Brow ridge.
  ctx.fillStyle = '#a9a0b8';
  ctx.beginPath();
  ctx.ellipse(192, 148, 108, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes: friendly, a little cross-eyed, which is the joke.
  ctx.fillStyle = '#1a1620';
  for (const ex of [-42, 42]) {
    ctx.beginPath();
    ctx.ellipse(192 + ex, 176, 20, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#eee6d8';
  for (const ex of [-46, 38]) {
    ctx.beginPath();
    ctx.arc(192 + ex, 170, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Snout and grin, wide enough to see from the ramp.
  ctx.fillStyle = '#e6d9b8';
  ctx.beginPath();
  ctx.ellipse(192, 254, 62, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#241c14';
  ctx.beginPath();
  ctx.ellipse(178, 240, 7, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(206, 240, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a2018';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(140, 268);
  ctx.quadraticCurveTo(192, 300, 244, 268);
  ctx.stroke();
  // A drip run, because the paint job was rattle-canned in the hangar at 2am.
  ctx.strokeStyle = 'rgba(74,47,143,0.55)';
  ctx.lineWidth = 4;
  for (const dx of [-70, 20, 88]) {
    ctx.beginPath();
    ctx.moveTo(192 + dx, 330);
    ctx.lineTo(192 + dx + 4, 372);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function SKIN_HEX(n) { return `#${n.toString(16).padStart(6, '0')}`; }
function PURPLE_HEX() { return `#${PURPLE.toString(16).padStart(6, '0')}`; }

/** Scratch vector for the rear gun's aim conversion — one, not one a frame. */
const _aim = new THREE.Vector3();

export class EnolaSquatch {
  constructor({ withCockpit = true } = {}) {
    this.group = group('enola-squatch');
    this.parts = {};
    this.anchors = {};
    this.anim = {
      propPhase: [0, 0, 0, 0],
      bombBay: 0,
      flapVisual: 0,
      airBrakeVisual: 0,
      /* The rear gun. `yaw`/`pitch` are where the barrels are pointing right
       * now, `traverse` is the slow sweep Shubes does when nothing is
       * happening, and `flash` counts down the muzzle-flash frames. */
      gunYaw: 0,
      gunPitch: 0,
      gunSweep: 0,
      gunFlash: 0,
      gunRecoil: 0,
    };
    /** Set by the mission during the defence phase; read in `update()`. */
    this.rearGunFiring = false;
    this.build();
    if (withCockpit) this.buildCockpit();
    this.instruments = withCockpit ? new Instruments(this.parts.panelCanvas, { ac: AC_ENOLA }) : null;
  }

  /* ---------------------------------------------------------------- */
  /* Exterior                                                          */
  /* ---------------------------------------------------------------- */

  build() {
    const skin = solid(SKIN, { roughness: 0.68, metalness: 0.32 });
    const patch = solid(SKIN_PATCH, { roughness: 0.8, metalness: 0.22 });
    const patchRough = solid(PATCH_ROUGH, { roughness: 0.96, metalness: 0.05 });
    const trim = solid(TRIM, { roughness: 0.7 });
    const metal = solid(METAL, { roughness: 0.4, metalness: 0.68 });
    const rubber = solid(0x1e2024, { roughness: 0.92 });
    const glassMat = mat({
      color: 0xbfd0e0, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.4,
    });
    const purple = solid(PURPLE, { roughness: 0.5, metalness: 0.15 });
    const purpleLight = solid(PURPLE_LIGHT, { roughness: 0.5, metalness: 0.1 });

    const g = this.group;

    // ---- Fuselage ----
    const body = mesh(boxGeo(FUSE_W, FUSE_H, FUSE_LEN), skin, 0, 0, 0);
    g.add(body);
    this.parts.fuselage = body;

    // "Several suspicious repairs" — three mismatched patch panels, riveted
    // over the skin in colours and finishes that do not match it or each
    // other. None hides structure; all are purely cosmetic overlays,
    // same trick as the Brushrunner's own replacement panels.
    const rivets = () => {
      const rg = group('rivets');
      for (let rx = -0.7; rx <= 0.7; rx += 0.7) {
        for (let ry = -0.55; ry <= 0.55; ry += 0.55) {
          rg.add(mesh(cylGeo(0.03, 0.03, 0.03, 6), metal, rx, ry, 0.05));
        }
      }
      return rg;
    };
    /* Both flank patches sit on PANEL_X — proud of the paint, not buried in
     * it. `patch2` also moved aft, from z 4.2 to z -6.6: at 4.2 it occupied
     * exactly the same square metre of skin as the nose art and they z-fought
     * for the whole walkaround. Aft of the wing it has the flank to itself. */
    const patch1 = mesh(boxGeo(1.8, 1.5, 0.06), patch, PANEL_X, 0.3, -4.0);
    patch1.rotation.y = Math.PI / 2;
    g.add(patch1);
    patch1.add(rivets());
    const patch2 = mesh(boxGeo(2.2, 1.1, 0.06), patchRough, -PANEL_X, 0.55, -6.6);
    patch2.rotation.y = -Math.PI / 2;
    g.add(patch2);
    patch2.add(rivets());
    // The third one is on the belly, over the bomb bay's forward bulkhead, and
    // it is the one Numbskull is proudest of.
    const patch3 = mesh(boxGeo(1.6, 0.08, 1.4), patchRough, 0.7, BELLY_Y - 0.02, BAY_Z + BAY_LEN / 2 + 1.0);
    g.add(patch3);
    this.parts.patches = [patch1, patch2, patch3];

    /* Panel-line seams down both flanks and along the spine. Four thin dark
     * strips per side — this is the "more detail" that actually reads, because
     * a bare 15 m box has nothing on it to judge its own size against. */
    const seam = solid(0x7a808c, { roughness: 0.85, metalness: 0.2 });
    for (const sx of [-1, 1]) {
      for (const z of [-5.4, -1.6, 2.2, 5.6]) {
        g.add(mesh(boxGeo(0.024, FUSE_H - 0.3, 0.06), seam, sx * SEAM_X, 0, z));
      }
      const run = rivetRun(metal, 13, 1.05, 'z');
      run.position.set(sx * SEAM_X, FUSE_H / 2 - 0.5, 0);
      run.rotation.z = Math.PI / 2;
      g.add(run);
    }
    for (const z of [-4.2, 0.4, 4.8]) {
      g.add(mesh(boxGeo(FUSE_W - 0.2, 0.05, 0.05), seam, 0, FUSE_H / 2 + 0.005, z));
    }

    /* Corner chamfers. Owner: "Maybe a bit less square in some areas." The
     * fuselage's four longitudinal edges were dead 90-degree corners running
     * the whole 15.5 m, which is the single most box-like thing on the model.
     * See `chamfer()` for why one rolled bar per edge is enough. */
    const chamferMat = solid(SKIN, { roughness: 0.62, metalness: 0.36 });
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        g.add(chamfer(chamferMat, 0.30, FUSE_LEN - 0.2,
          sx * (FUSE_W / 2 - 0.09), sy * (FUSE_H / 2 - 0.09), 0, Math.PI / 4));
      }
    }
    // A rounded spine and a rounded keel, so the top and bottom read curved.
    const spine = mesh(cylGeo(0.5, 0.5, FUSE_LEN - 0.6, 12, true), chamferMat, 0, FUSE_H / 2 - 0.42, 0);
    spine.rotation.x = Math.PI / 2;
    spine.scale.set(2.6, 1, 1);
    g.add(spine);

    // Nose cone, tapered, with a glazed bombardier bubble. The bubble is where
    // Numbskull actually sits — see `buildCrewStations()`.
    const nose = mesh(cylGeo(0.42, FUSE_W / 2, 4.0, 16), skin, 0, 0.1, FUSE_LEN / 2 + 1.9);
    nose.rotation.x = Math.PI / 2;
    g.add(nose);
    const noseGlass = mesh(sphereGeo(1.05, 14, 10), glassMat, 0, -0.2, FUSE_LEN / 2 + 3.5);
    noseGlass.castShadow = false;
    g.add(noseGlass);
    // Framing on the bombardier glazing, so it reads as a glasshouse rather
    // than a soap bubble.
    for (const ang of [0, 0.7, -0.7]) {
      const rib = mesh(cylGeo(0.035, 0.035, 2.1, 6), trim, 0, -0.2, FUSE_LEN / 2 + 3.5);
      rib.rotation.z = Math.PI / 2;
      rib.rotation.y = ang;
      g.add(rib);
    }
    g.add(mesh(cylGeo(1.06, 1.06, 0.05, 16), trim, 0, -0.2, FUSE_LEN / 2 + 2.95));

    // Tail boom, tapering back to the fin.
    const boom = mesh(cylGeo(FUSE_W / 2, 0.62, 5.8, 14), skin, 0, 0.05, -FUSE_LEN / 2 - 2.9);
    boom.rotation.x = Math.PI / 2;
    g.add(boom);

    // ---- Wing: shoulder-mounted, four-engine spar ----
    const halfSpan = AC_ENOLA.span / 2;
    const wing = mesh(boxGeo(AC_ENOLA.span, 0.62, AC_ENOLA.chord), skin, 0, 1.1, 0.3);
    g.add(wing);
    this.parts.wing = wing;
    // Outer panels, thinner and swept a touch back — a straight slab of wing is
    // the single most model-kit-looking thing on an aeroplane like this.
    for (const sx of [-1, 1]) {
      const tip = mesh(boxGeo(halfSpan * 0.34, 0.42, AC_ENOLA.chord * 0.72), skin,
        sx * (halfSpan * 0.82), 1.14, -0.05);
      tip.rotation.y = -sx * 0.045;
      g.add(tip);
      // Wing fences over the inboard nacelles.
      g.add(mesh(boxGeo(0.05, 0.34, 1.5), seam, sx * 9.6, 1.5, 0.2));
    }
    // Fuel-cap rows and the walkway strip nobody has repainted.
    for (const sx of [-1, 1]) {
      for (const d of [4.4, 8.6, 12.2]) {
        g.add(mesh(cylGeo(0.19, 0.19, 0.05, 10), metal, sx * d, 1.42, -0.5));
      }
      const walk = mesh(boxGeo(2.4, 0.02, AC_ENOLA.chord * 0.5), solid(0x2f3138, { roughness: 1 }), sx * 2.6, 1.42, 0.3);
      g.add(walk);
    }

    // Ailerons, flaps.
    this.parts.aileron = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 14.6, 1.1, -1.8);
      pivot.add(mesh(boxGeo(5.2, 0.32, 1.0), patch, 0, 0, -0.5));
      g.add(pivot);
      this.parts.aileron.push(pivot);
    }
    this.parts.flap = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 5.4, 1.08, -1.8);
      pivot.add(mesh(boxGeo(6.6, 0.3, 1.1), skin, 0, 0, -0.55));
      g.add(pivot);
      this.parts.flap.push(pivot);
    }
    this.parts.airBrake = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = `air-brake-${sx > 0 ? 'left' : 'right'}`;   // +X is the pilot's left
      pivot.position.set(sx * 3.4, 1.42, 0.9);
      pivot.add(mesh(boxGeo(3.8, 0.1, 0.85), patch, 0, 0, -0.4));
      g.add(pivot);
      this.parts.airBrake.push(pivot);
    }

    // ---- Four engines, two nacelles per side ----
    this.parts.prop = [];
    this.parts.propDisc = [];
    this.parts.exhaust = [];
    for (let i = 0; i < 4; i++) {
      const nx = NACELLE_X[i];
      const nacelle = mesh(boxGeo(1.75, 1.6, 5.4), skin, nx, 0.7, 1.0);
      g.add(nacelle);
      /* Rounded nacelle shoulders — the nacelle was a bare box under a round
       * cowl, which made the join read as a can taped to a brick. Two rolled
       * bars along the top edges and a half-round crown fix it for three
       * meshes. Owner: "Maybe a bit less square in some areas." */
      for (const sx of [-1, 1]) {
        g.add(chamfer(skin, 0.34, 5.2, nx + sx * 0.72, 1.37, 1.0, Math.PI / 4));
        g.add(chamfer(skin, 0.28, 5.2, nx + sx * 0.74, 0.05, 1.0, Math.PI / 4));
      }
      const crown = mesh(cylGeo(0.5, 0.5, 5.2, 12, true), skin, nx, 1.22, 1.0);
      crown.rotation.x = Math.PI / 2;
      crown.scale.set(1.7, 1, 1);
      g.add(crown);
      // Nacelle nose fairing and the ring cowl, in two diameters.
      const cowl = mesh(cylGeo(0.8, 0.9, 1.5, 16), trim, nx, 0.7, 3.9);
      cowl.rotation.x = Math.PI / 2;
      g.add(cowl);
      const cowlLip = mesh(cylGeo(0.9, 0.86, 0.18, 16), metal, nx, 0.7, 4.62);
      cowlLip.rotation.x = Math.PI / 2;
      g.add(cowlLip);
      // Cooling gills — six little flaps round the back of the cowl.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.4;
        const gill = mesh(boxGeo(0.24, 0.05, 0.34), trim,
          nx + Math.cos(a) * 0.82, 0.7 + Math.sin(a) * 0.82, 3.2);
        gill.rotation.z = a;
        g.add(gill);
      }

      /* THE FRONT END, rebuilt. Owner: "Front propeller looks off."
       *
       * It was assembled inside out. The blade hub sat at z 4.85 and the
       * spinner cone was centred at z 5.0 — a 1.0 m cone whose base was at
       * 4.5, BEHIND the blades — so the blades grew out of the middle of the
       * spinner and the only thing visible head-on was the cowl ring with a
       * black knuckle in the middle of it. Correct order, front to back, is:
       * spinner apex, spinner, blade roots, back plate, reduction-gear
       * housing, cowl. That is what this now is, and it is why nothing here
       * shares a z with anything else.
       */
      const spinnerMat = solid(0x35373d, { roughness: 0.32, metalness: 0.55 });
      // Gearbox housing between cowl lip and spinner — fills the gap that
      // used to be a hole you could see the nacelle box through.
      const gearbox = mesh(cylGeo(0.5, 0.72, 0.5, 16), metal, nx, 0.7, 4.9);
      gearbox.rotation.x = Math.PI / 2;
      g.add(gearbox);
      // Back plate: the disc the blade roots come through.
      const backPlate = mesh(cylGeo(0.52, 0.5, 0.1, 18), spinnerMat, nx, 0.7, 5.18);
      backPlate.rotation.x = Math.PI / 2;
      g.add(backPlate);
      // The spinner proper: base just forward of the roots, apex forward.
      const spinner = mesh(coneGeo(0.5, 1.15, 20), spinnerMat, nx, 0.7, 5.95);
      spinner.rotation.x = Math.PI / 2;
      g.add(spinner);
      // Rounded tip on the cone, so it is an ogive and not a dart.
      const spinnerTip = mesh(sphereGeo(0.075, 10, 8), spinnerMat, nx, 0.7, 6.5);
      g.add(spinnerTip);

      const hub = new THREE.Group();
      hub.position.set(nx, 0.7, 5.4);
      const bladeMat = solid(0x24262a, { roughness: 0.5, metalness: 0.42 });
      for (let b = 0; b < 3; b++) {
        const blade = propBlade(bladeMat);
        blade.rotation.z = (b / 3) * Math.PI * 2;
        hub.add(blade);
      }
      g.add(hub);
      this.parts.prop.push(hub);

      // The blurred disc lives FORWARD of the spinner tip so that, at speed,
      // it never cuts a bright ellipse through the nose cone.
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(2.35, 24),
        new THREE.MeshBasicMaterial({
          color: 0xb9bec6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      disc.position.set(nx, 0.7, 6.6);
      g.add(disc);
      this.parts.propDisc.push(disc);

      // Two stacks a side, because a fourteen-cylinder radial has two banks.
      for (const sx of [-1, 1]) {
        const stack = mesh(cylGeo(0.14, 0.14, 0.75, 6), solid(0x35353a, { roughness: 0.9 }),
          nx + sx * 0.5, 0.1, 2.4);
        stack.rotation.x = Math.PI / 2.2;
        g.add(stack);
      }
      this.parts.exhaust.push(new THREE.Vector3(nx, -0.1, 2.1));

      // Nacelle-to-wing fairing behind the trailing edge.
      const fairing = mesh(cylGeo(0.8, 0.22, 3.0, 12), skin, nx, 0.72, -2.3);
      fairing.rotation.x = Math.PI / 2;
      g.add(fairing);

      // Cowl clamp bands for readable scale.
      for (const z of [2.2, 3.2]) {
        g.add(mesh(boxGeo(1.8, 1.63, 0.06), metal, nx, 0.7, z));
      }
    }

    // ---- Tail: single tall fin, and a broad stabiliser ----
    const fin = mesh(boxGeo(0.28, 5.0, 3.9), skin, 0, 2.8, -FUSE_LEN / 2 - 4.4);
    g.add(fin);
    // Fin root fillet running forward onto the spine.
    const fillet = mesh(coneGeo(0.7, 4.2, 6), skin, 0, FUSE_H / 2 - 0.2, -FUSE_LEN / 2 - 1.6);
    fillet.rotation.x = -Math.PI / 2;
    fillet.scale.set(0.28, 1, 0.7);
    g.add(fillet);
    const rudderPivot = new THREE.Group();
    rudderPivot.position.set(0, 2.8, -FUSE_LEN / 2 - 6.2);
    rudderPivot.add(mesh(boxGeo(0.26, 4.5, 1.7), patch, 0, 0, -0.85));
    g.add(rudderPivot);
    this.parts.rudder = rudderPivot;

    const stab = mesh(boxGeo(11.6, 0.32, 2.6), skin, 0, 1.0, -FUSE_LEN / 2 - 4.7);
    g.add(stab);
    const elevPivot = new THREE.Group();
    elevPivot.position.set(0, 1.0, -FUSE_LEN / 2 - 5.9);
    elevPivot.add(mesh(boxGeo(11.6, 0.26, 1.3), patch, 0, 0, -0.65));
    g.add(elevPivot);
    this.parts.elevator = elevPivot;
    // Tailplane bracing struts.
    for (const sx of [-1, 1]) {
      const strut = mesh(cylGeo(0.07, 0.07, 2.6, 6), metal, sx * 2.4, 0.4, -FUSE_LEN / 2 - 4.6);
      strut.rotation.z = sx * 0.75;
      g.add(strut);
    }

    // ---- Bomb bay: two hinged panel groups on the ventral centreline ----
    // Hinge lines run fore-aft along the two outboard edges (x = +-BAY_WIDTH/2)
    // so `rotation.z` swings each panel outward-and-down, exactly like the
    // Brushrunner's own single cargo door (`this.parts.cargoDoor.rotation.z`
    // in src/beefrun/aircraft.js) — same axis, doubled.
    this.parts.bombBayDoors = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = `bomb-bay-door-${sx > 0 ? 'port' : 'starboard'}`;   // +X is port — see the frame note at the top
      pivot.position.set(sx * (BAY_WIDTH / 2), BELLY_Y, BAY_Z);
      const panel = mesh(boxGeo(BAY_WIDTH / 2 + 0.04, 0.09, BAY_LEN), patch, -sx * (BAY_WIDTH / 4 + 0.02), 0, 0);
      pivot.add(panel);
      g.add(pivot);
      this.parts.bombBayDoors.push(pivot);
    }

    // Where the Fat Squatch rides until it doesn't. A plain anchor, not a
    // visible part — the payload prop parents itself here.
    const payloadMount = new THREE.Group();
    payloadMount.name = 'payload-mount';
    payloadMount.position.set(0, BELLY_Y - 0.25, BAY_Z);
    g.add(payloadMount);
    this.anchors.payloadMount = payloadMount;
    this.anchors.bombBayCenter = new THREE.Vector3(0, BELLY_Y, BAY_Z);

    /* ---- Livery: purple racing stripe down both sides of the fuselage ----
     *
     * Laid in RUNS with gaps, not as one 14 m bar. The single bar ran through
     * the crew door's frame and under both decals; every one of those was a
     * pair of coplanar boxes fighting for the same pixels. The gaps below are
     * where hardware and artwork live, and the stripe now stops either side of
     * them the way a paint shop would have masked it off. Dropped to y -0.55
     * as well, clearing the decal band entirely. */
    const STRIPE_Y = -0.55;
    const runs = (gaps) => {
      const out = [];
      let from = -(FUSE_LEN / 2 - 0.7);
      for (const [a, b] of gaps) { out.push([from, a]); from = b; }
      out.push([from, FUSE_LEN / 2 - 0.7]);
      return out.filter(([a, b]) => b - a > 0.25);
    };
    for (const sx of [-1, 1]) {
      /* Ascending, non-overlapping. Every gap is a real object that would
       * otherwise be inside the stripe box: the waist blister at z -5.4 on
       * both sides, and on the port side the crew door and the nose art. Runs
       * shorter than 0.25 m are dropped by `runs()`, so touching gaps merge on
       * their own. */
      const gaps = sx < 0
        ? [[-6.2, -4.6], [-4.4, -2.4], [3.2, 5.4]]
        : [[-6.2, -4.6]];
      for (const [a, b] of runs(gaps)) {
        const len = b - a;
        g.add(mesh(boxGeo(0.036, 0.5, len), purple, sx * LIVERY_X, STRIPE_Y, (a + b) / 2));
        g.add(mesh(boxGeo(0.036, 0.1, len), purpleLight, sx * LIVERY_X, STRIPE_Y - 0.37, (a + b) / 2));
      }
    }
    // Fin flash, same colour, so the livery reads from behind too.
    g.add(mesh(boxGeo(0.05, 3.9, 0.6), purple, 0.16, 2.8, -FUSE_LEN / 2 - 4.35));

    // ---- Nose art (port side, under the cockpit's eyeline) ----
    const noseArtMat = mat({ map: noseArtTexture(), roughness: 0.85, transparent: true, alphaTest: 0.03, unique: true });
    const noseArt = flatMesh(planeGeo(1.9, 1.9), noseArtMat, -DECAL_X, 0.5, 4.3);
    noseArt.rotation.y = -Math.PI / 2;
    g.add(noseArt);
    this.parts.noseArt = noseArt;

    // ---- "ENOLA SQUATCH / Peace Through Superior Foot Size" ----
    // Painted just under the cockpit window, one side only — the same
    // placement real heavy-bomber nose art used, since only one side of the
    // aeroplane is ever framed for the photo. On DECAL_X, forward of the
    // stripe's y band, and moved forward to z 1.4 so it no longer shares any
    // skin with the nose art.
    const titleTex = signTexture(['ENOLA SQUATCH', 'Peace Through Superior Foot Size'], {
      w: 768, h: 220, bg: '#c9c2d4', fg: '#241a3a', border: '#4a2f8f', rough: true,
    });
    const titlePlate = flatMesh(
      planeGeo(3.4, 0.94),
      mat({ map: titleTex, roughness: 0.85, transparent: true, unique: true }),
      -DECAL_X, 0.42, 1.4,
    );
    titlePlate.rotation.y = -Math.PI / 2;
    g.add(titlePlate);
    this.parts.titlePlate = titlePlate;

    /* ---- The Silver Sasquatches crest ----
     *
     * Owner playtest: "Aircraft is nice. Needs Squatch logo." The club's own
     * artwork already exists and is already wired — `assets/art/logo-crest.png`
     * through `src/world/gear.js`'s `crest.round` slot, the same file Big
     * Uncle Lou has framed in his office at the Bing. No new art, no new
     * manifest slot: the composition root resolves that slot and hands the
     * texture to `applyClubLogo()` below.
     *
     * Three places, which is where a squadron actually puts its badge: both
     * faces of the fin, and under the cockpit on the starboard side — the
     * side the nose art is NOT on, so neither has to share skin with the
     * other. Until the texture resolves they carry the drawn placeholder
     * `resolveGear` falls back to, so no surface is ever blank. */
    this.parts.clubLogo = [];
    const logoMat = () => mat({
      map: crestPlaceholderTexture(), roughness: 0.8, transparent: true, alphaTest: 0.02, unique: true,
    });
    for (const sx of [-1, 1]) {
      const finBadge = flatMesh(planeGeo(1.5, 1.5), logoMat(), sx * 0.2, 3.1, -FUSE_LEN / 2 - 4.3);
      finBadge.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      finBadge.name = 'club-crest-fin';
      g.add(finBadge);
      this.parts.clubLogo.push(finBadge);
    }
    const noseBadge = flatMesh(planeGeo(1.35, 1.35), logoMat(), DECAL_X, 0.45, 4.0);
    noseBadge.rotation.y = Math.PI / 2;
    noseBadge.name = 'club-crest-nose';
    g.add(noseBadge);
    this.parts.clubLogo.push(noseBadge);

    // ---- Landing gear: fixed tricycle, scaled up ----
    this.parts.gear = [];
    const legSpecs = [
      { x: 0, z: FUSE_LEN / 2 - 1.3, r: 0.72, steer: true },
      { x: -AC_ENOLA.track / 2, z: -1.2, r: 1.06, steer: false },
      { x: AC_ENOLA.track / 2, z: -1.2, r: 1.06, steer: false },
    ];
    legSpecs.forEach((spec, i) => {
      const leg = new THREE.Group();
      leg.position.set(spec.x, -(AC_ENOLA.gearY - 1.2 - spec.r), spec.z);
      const strutLen = 1.2;
      leg.add(mesh(boxGeo(0.3, strutLen, 0.3), metal, 0, -strutLen / 2, 0));
      // Oleo, scissor link and a drag brace — the parts you can see from the
      // ground during a walkaround, which is now a thing that happens.
      leg.add(mesh(cylGeo(0.16, 0.16, strutLen * 0.55, 10), solid(0xc8ccd2, { roughness: 0.25, metalness: 0.85 }), 0, -strutLen * 0.72, 0));
      const brace = mesh(cylGeo(0.07, 0.07, 1.1, 6), metal, 0, -strutLen * 0.5, spec.steer ? -0.45 : 0.45);
      brace.rotation.x = spec.steer ? -0.7 : 0.7;
      leg.add(brace);
      const wheel = mesh(cylGeo(spec.r, spec.r, 0.46, 16), rubber, 0, -strutLen, 0);
      wheel.rotation.z = Math.PI / 2;
      leg.add(wheel);
      const hubCap = mesh(cylGeo(spec.r * 0.4, spec.r * 0.4, 0.48, 8), metal, 0, -strutLen, 0);
      hubCap.rotation.z = Math.PI / 2;
      leg.add(hubCap);
      // Twin main wheels, because it is a heavy now.
      if (!spec.steer) {
        const outer = mesh(cylGeo(spec.r, spec.r, 0.46, 16), rubber, spec.x > 0 ? 0.52 : -0.52, -strutLen, 0);
        outer.rotation.z = Math.PI / 2;
        leg.add(outer);
      }
      g.add(leg);
      this.parts.gear.push({ leg, wheel, rest: leg.position.y, base: leg.position.y, steer: !!spec.steer });
    });

    /* ---- The crew door, starboard side aft of the wing ----
     * The one part of the aeroplane the walkaround ends at: `anchors.crewDoor`
     * is the local point the boarding hit-box hangs on, and `anchors.stepDown`
     * is where the player is put back on the tarmac if he ever gets out. */
    /* On PANEL_X, with the racing stripe masked off either side of it (see
     * the livery block below) — the frame used to enclose the stripe box and
     * the two flickered against each other from every angle. The door is also
     * the one part of the aeroplane a stranded player has to be able to pick
     * out, so it is deliberately the highest-contrast thing on this flank:
     * dark frame, mismatched panel, white boarding stencil. */
    const doorFrame = mesh(boxGeo(0.06, 1.8, 1.05), trim, -PANEL_X, -0.35, -3.4);
    g.add(doorFrame);
    const doorPanel = mesh(boxGeo(0.05, 1.5, 0.8), patch, -PANEL_X - 0.05, -0.35, -3.4);
    g.add(doorPanel);
    doorPanel.add(mesh(boxGeo(0.06, 0.09, 0.26), metal, -0.03, -0.1, 0.24));
    doorPanel.add(rivets());
    // "CREW ENTRY" stencilled over the sill — the door has to be findable.
    const doorStencil = flatMesh(
      planeGeo(0.86, 0.28),
      mat({
        map: signTexture(['CREW ENTRY'], { w: 512, h: 160, bg: '#d8d2de', fg: '#241a3a', border: '#4a2f8f', rough: true }),
        roughness: 0.85, transparent: true, unique: true,
      }),
      -PANEL_X - 0.1, 0.72, -3.4,
    );
    doorStencil.rotation.y = -Math.PI / 2;
    g.add(doorStencil);
    this.parts.crewDoor = doorPanel;
    this.anchors.crewDoor = new THREE.Vector3(-FUSE_W / 2 - 0.6, -0.6, -3.4);
    this.anchors.stepDown = new THREE.Vector3(-FUSE_W / 2 - 3.4, 0, -3.4);
    // Boarding ladder, hooked under the sill.
    const ladder = group('boarding-ladder');
    ladder.position.set(-PANEL_X - 0.25, -1.1, -3.4);
    for (const sx of [-0.28, 0.28]) {
      const rail = mesh(cylGeo(0.05, 0.05, 2.2, 6), metal, 0, 0, sx);
      rail.rotation.z = 0.16;
      ladder.add(rail);
    }
    for (const ry of [-0.75, -0.25, 0.25, 0.75]) {
      ladder.add(mesh(boxGeo(0.06, 0.05, 0.6), metal, -ry * 0.16, ry, 0));
    }
    g.add(ladder);
    this.parts.ladder = ladder;

    // ---- Dorsal turret and two waist blisters ----
    // Not manned — they are what makes the tail gun read as one station on a
    // bomber rather than the only gun on a cargo plane.
    const dorsal = group('dorsal-turret');
    dorsal.position.set(0, FUSE_H / 2 + 0.3, -0.9);
    dorsal.add(mesh(cylGeo(0.62, 0.68, 0.42, 14), trim, 0, 0, 0));
    dorsal.add(mesh(sphereGeo(0.6, 12, 8), glassMat, 0, 0.12, 0));
    const dorsalGun = mesh(cylGeo(0.045, 0.045, 1.2, 6), metal, 0, 0.16, 0.7);
    dorsalGun.rotation.x = Math.PI / 2 - 0.25;
    dorsal.add(dorsalGun);
    g.add(dorsal);
    this.parts.dorsalTurret = dorsal;
    for (const sx of [-1, 1]) {
      const blister = mesh(sphereGeo(0.55, 12, 8), glassMat, sx * (FUSE_W / 2 - 0.05), -0.2, -5.4);
      blister.scale.set(0.6, 1, 1.1);
      blister.castShadow = false;
      g.add(blister);
    }

    // Aerials, pitot mast and the astrodome over the navigator.
    const aerialTop = mesh(cylGeo(0.03, 0.03, 1.5, 5), metal, 0, FUSE_H / 2 + 0.75, 3.6);
    g.add(aerialTop);
    const wire = mesh(cylGeo(0.016, 0.016, 9.4, 4), solid(0x1a1a1c, { roughness: 1 }), 0, FUSE_H / 2 + 1.1, -1.2);
    wire.rotation.x = Math.PI / 2 - 0.22;
    g.add(wire);
    const pitot = mesh(cylGeo(0.03, 0.03, 0.9, 5), metal, -1.1, -0.4, FUSE_LEN / 2 + 3.2);
    pitot.rotation.x = Math.PI / 2;
    g.add(pitot);
    const astrodome = mesh(sphereGeo(0.34, 10, 7), glassMat, 0, FUSE_H / 2 + 0.05, 2.4);
    astrodome.scale.y = 0.7;
    astrodome.castShadow = false;
    g.add(astrodome);

    this.anchors.bombardierStation = new THREE.Vector3(0, -0.5, FUSE_LEN / 2 + 2.4);

    // Navigation lights.
    this.parts.navLights = [];
    for (const [sx, color] of [[-1, 0xff2a1e], [1, 0x37ff6a]]) {
      const lamp = flatMesh(sphereGeo(0.14), unlit(color), sx * (halfSpan - 0.4), 1.14, 0.3);
      g.add(lamp);
      this.parts.navLights.push(lamp);
    }
    const beacon = flatMesh(sphereGeo(0.15), unlit(0xff4a2a), 0, 5.4, -FUSE_LEN / 2 - 4.4);
    g.add(beacon);
    this.parts.beacon = beacon;

    this.buildRearGun(g, { skin, trim, metal, glassMat });
  }

  /* ---------------------------------------------------------------- */
  /* The rear gun — an actual station, not a decal                     */
  /* ---------------------------------------------------------------- */

  /**
   * The Shubenator's office.
   *
   * The old version of this was one glass sphere and one stick, four metres
   * behind the tail, with nothing inside it. `BARKS.gunnerIdle` and
   * `BARKS.gunnerFiring` had been written for a man who did not exist and a
   * gun that could not point anywhere.
   *
   * What is here now: a real turret at the very back of the boom with a
   * traversing yoke, twin barrels that elevate together, a ring-and-bead
   * sight, an ammunition feed either side, a fired-brass chute, a seat, and
   * `anchors.rearGunSeat` sitting far enough back inside the glass that a
   * seated figure fills it (`crew.js` puts Shubes there). `parts.rearGun` is
   * the group `update()` swings; `parts.gunFlash` are the two muzzle flashes
   * that light for a few frames each time `rearGunFiring` is true.
   */
  buildRearGun(g, { skin, trim, metal, glassMat }) {
    const station = group('rear-gun-station');
    // Right at the back of the boom, on the aeroplane's centreline.
    const Z = -FUSE_LEN / 2 - 6.6;
    station.position.set(0, 0.05, Z);
    g.add(station);
    this.parts.rearGunStation = station;

    // The fairing that carries the turret, faired into the boom.
    const shell = mesh(cylGeo(0.62, 0.9, 1.6, 14), skin, 0, 0, 0.85);
    shell.rotation.x = Math.PI / 2;
    station.add(shell);
    // Armour ring behind the gunner's back.
    station.add(mesh(cylGeo(0.66, 0.66, 0.12, 14), trim, 0, 0, 0.1));

    /* The traversing part. `rotation.y` is traverse; the yoke inside it takes
     * elevation on `rotation.x`, which is the only way the two axes stay
     * independent when the mission points the gun at something. */
    const turret = group('rear-gun-turret');
    turret.position.set(0, 0, -0.15);
    station.add(turret);
    this.parts.rearGunTurret = turret;

    // Glazing: a hemisphere open toward the tail, with framing.
    const dome = mesh(sphereGeo(0.86, 16, 12), glassMat, 0, 0, 0);
    dome.castShadow = false;
    turret.add(dome);
    for (const ang of [0, Math.PI / 2]) {
      const rib = mesh(cylGeo(0.03, 0.03, 1.74, 6), trim, 0, 0, 0);
      rib.rotation.z = Math.PI / 2;
      rib.rotation.y = ang;
      turret.add(rib);
    }
    turret.add(mesh(cylGeo(0.87, 0.87, 0.05, 16), trim, 0, 0, 0.15));

    // The yoke: what the barrels are actually bolted to.
    const yoke = group('rear-gun-yoke');
    yoke.position.set(0, -0.06, -0.3);
    turret.add(yoke);
    this.parts.rearGunYoke = yoke;
    yoke.add(mesh(boxGeo(0.62, 0.16, 0.2), trim, 0, 0, 0));

    this.parts.gunFlash = [];
    this.parts.gunBarrels = [];
    for (const sx of [-1, 1]) {
      const barrel = mesh(cylGeo(0.055, 0.07, 1.9, 8), metal, sx * 0.21, 0, -0.95);
      barrel.rotation.x = Math.PI / 2;
      yoke.add(barrel);
      this.parts.gunBarrels.push(barrel);
      // Perforated cooling jacket.
      const jacket = mesh(cylGeo(0.1, 0.1, 0.8, 10), trim, sx * 0.21, 0, -0.55);
      jacket.rotation.x = Math.PI / 2;
      yoke.add(jacket);
      // Ammunition can and the belt going into it.
      yoke.add(mesh(boxGeo(0.22, 0.26, 0.34), solid(0x4a5240, { roughness: 0.95 }), sx * 0.44, -0.02, 0.28));
      const belt = mesh(boxGeo(0.06, 0.05, 0.44), solid(0xa8873a, { roughness: 0.6, metalness: 0.5 }), sx * 0.32, -0.02, 0.1);
      belt.rotation.y = -sx * 0.5;
      yoke.add(belt);
      // Muzzle flash — off until the gun fires.
      const flash = flatMesh(sphereGeo(0.34, 8, 6), unlit(0xffd27a, {
        transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }), sx * 0.21, 0, -2.0);
      flash.scale.set(0.7, 0.7, 1.7);
      yoke.add(flash);
      this.parts.gunFlash.push(flash);
    }
    // Ring-and-bead sight between the barrels.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.6 }));
    ring.position.set(0, 0.16, -0.5);
    yoke.add(ring);
    yoke.add(mesh(sphereGeo(0.02, 6, 4), metal, 0, 0.16, -1.0));
    // Spade grips.
    for (const sx of [-1, 1]) {
      const grip = mesh(boxGeo(0.05, 0.24, 0.06), solid(0x241c16, { roughness: 1 }), sx * 0.19, -0.16, 0.16);
      yoke.add(grip);
    }
    // Brass chute out of the belly of the fairing, and the spent-case bag.
    const chute = mesh(boxGeo(0.28, 0.1, 0.5), trim, 0, -0.42, 0.3);
    station.add(chute);
    station.add(mesh(boxGeo(0.34, 0.36, 0.42), solid(0x4a4238, { roughness: 1 }), 0, -0.66, 0.45));

    // The seat, and the point a seated gunner's hips go.
    station.add(mesh(boxGeo(0.5, 0.08, 0.46), solid(0x3a3228, { roughness: 0.95 }), 0, -0.44, 0.55));
    station.add(mesh(boxGeo(0.5, 0.52, 0.09), solid(0x3a3228, { roughness: 0.95 }), 0, -0.18, 0.8));
    this.anchors.rearGunSeat = new THREE.Vector3(0, station.position.y - 0.42, Z + 0.6);
    /** Where the barrels leave the aeroplane, for tracer origins. */
    this.anchors.rearGunMuzzle = new THREE.Vector3(0, station.position.y - 0.01, Z - 2.4);
  }

  /**
   * Paint the club's real crest onto the three badges.
   *
   * Called by the composition root once `resolveGear('crest.round')` settles —
   * see `../livery.js`. Until then the badges wear the drawn crest, so this is
   * an upgrade rather than a requirement.
   *
   * @param {?THREE.Texture} texture
   * @returns {number} badges repainted
   */
  applyClubLogo(texture) {
    return applyCrest(this.parts.clubLogo, texture);
  }

  /* ---------------------------------------------------------------- */
  /* Cockpit                                                           */
  /* ---------------------------------------------------------------- */

  buildCockpit() {
    const g = new THREE.Group();
    g.name = 'cockpit';
    this.group.add(g);
    this.parts.cockpit = g;

    const panelDark = solid(0x24222a, { roughness: 0.7 });
    const glassMat = mat({ color: 0xbfd0e0, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.4, unique: true });

    // Windshield, stepped up above the nose glazing, with real framing.
    const windshield = mesh(boxGeo(2.5, 1.15, 0.1), glassMat, 0, 1.35, FUSE_LEN / 2 + 1.2);
    windshield.rotation.x = -0.3;
    windshield.castShadow = false;
    g.add(windshield);
    this.parts.windshield = windshield;
    const frame = solid(0x2a2c30, { roughness: 0.7 });
    for (const sx of [-0.85, 0, 0.85]) {
      const post = mesh(boxGeo(0.06, 1.2, 0.12), frame, sx, 1.35, FUSE_LEN / 2 + 1.18);
      post.rotation.x = -0.3;
      g.add(post);
    }
    g.add(mesh(boxGeo(2.56, 0.1, 0.14), frame, 0, 1.9, FUSE_LEN / 2 + 1.02));
    // Side windows for the two front seats.
    for (const sx of [-1, 1]) {
      const side = mesh(boxGeo(0.06, 0.7, 1.5), glassMat, sx * (FUSE_W / 2 - 0.02), 1.15, FUSE_LEN / 2 - 0.6);
      side.castShadow = false;
      g.add(side);
    }

    // Instrument panel — reuses `Instruments` from `src/beefrun/instruments.js`
    // unmodified, the same way `Brushrunner.buildCockpit` does, just fed
    // `AC_ENOLA` instead of Beef Run's `AC`.
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    this.parts.panelCanvas = canvas;
    const panelTex = new THREE.CanvasTexture(canvas);
    panelTex.colorSpace = THREE.SRGBColorSpace;
    this.parts.panelTex = panelTex;

    const panel = mesh(boxGeo(2.3, 0.95, 0.12), panelDark, 0, 0.82, FUSE_LEN / 2 + 0.7);
    panel.rotation.x = 0.14;
    g.add(panel);
    const face = flatMesh(new THREE.PlaneGeometry(2.14, 0.86), new THREE.MeshBasicMaterial({ map: panelTex }), 0, 0, -0.062);
    face.rotation.y = Math.PI;
    panel.add(face);

    // The throttle quadrant between the seats: four levers for four engines,
    // which is the one thing on the flight deck that says how many there are.
    const pedestal = mesh(boxGeo(0.44, 0.34, 0.9), panelDark, 0, 0.55, FUSE_LEN / 2 - 0.35);
    g.add(pedestal);
    this.parts.throttleLevers = [];
    for (let i = 0; i < 4; i++) {
      const lever = new THREE.Group();
      lever.position.set(-0.15 + i * 0.1, 0.72, FUSE_LEN / 2 - 0.5);
      lever.add(mesh(boxGeo(0.045, 0.32, 0.05), solid(0x1e2024, { roughness: 0.7 }), 0, 0.16, 0));
      lever.add(mesh(sphereGeo(0.05, 8, 6), solid(0xd8c07a, { roughness: 0.5 }), 0, 0.34, 0));
      g.add(lever);
      this.parts.throttleLevers.push(lever);
    }

    /* Four seats: the two up front (Prospect flying, Captain Sasole beside
     * him) and the navigator's table behind the left seat where Irish works.
     * `anchors.seats` is what `crew.js` parents its seated figures to, so the
     * furniture and the men who sit in it cannot drift apart. */
    const seatMat = solid(0x3a3228, { roughness: 0.95 });
    const buildSeat = (x, y, z, facing = 0) => {
      const s = group('seat');
      s.position.set(x, y, z);
      s.rotation.y = facing;
      s.add(mesh(boxGeo(0.6, 0.14, 0.6), seatMat, 0, 0, 0));
      s.add(mesh(boxGeo(0.6, 0.8, 0.14), seatMat, 0, 0.4, -0.3));
      // Head armour and a lap belt, so an empty seat still reads as a seat.
      s.add(mesh(boxGeo(0.4, 0.3, 0.06), solid(0x2a2c30, { roughness: 0.8 }), 0, 0.9, -0.3));
      s.add(mesh(boxGeo(0.5, 0.05, 0.08), solid(0x6b5a3a, { roughness: 0.95 }), 0, 0.12, 0.18));
      g.add(s);
      return s;
    };
    // Aeroplane frame: nose is +Z, so the pilot's left is +X (see the note at
    // the top of the file). Prospect flies from the LEFT seat — +0.55 — and
    // Captain Sasole takes the RIGHT, at -0.55.
    /* SEAT HEIGHT. The flight deck sits on a raised floor over the bomb bay, so
     * the seats are ABOVE the aeroplane's centreline, not below it: a seated
     * man's eye then lands at about y 1.4, which is over the top of the
     * instrument panel (centre 0.82, top ~1.3) and inside the windshield
     * (which spans roughly y 0.8 to 1.9). With the seats at -0.42, where they
     * were, `pilotEye` had to sit at the panel's own height and the cockpit
     * view was a wall of gauges with no horizon in it at all — visible in the
     * first screenshot taken of this scene from the seat. */
    const pilotSeat = buildSeat(0.55, 0.05, FUSE_LEN / 2 - 0.35);
    const copilotSeat = buildSeat(-0.55, 0.05, FUSE_LEN / 2 - 0.35);
    // Irish's navigator station: side table behind the flight deck, facing
    // inboard across the cabin.
    const navSeat = buildSeat(0.62, 0.05, FUSE_LEN / 2 - 2.9, -Math.PI / 2);
    const navTable = mesh(boxGeo(0.9, 0.08, 0.7), solid(0x4a4238, { roughness: 0.9 }), -0.2, 0.31, FUSE_LEN / 2 - 2.9);
    g.add(navTable);
    navTable.add(mesh(boxGeo(0.5, 0.02, 0.4), solid(0xd8d2c0, { roughness: 0.95 }), 0.05, 0.05, 0));
    const navLamp = flatMesh(sphereGeo(0.07, 8, 6), unlit(0xffd27a), -0.2, 0.81, FUSE_LEN / 2 - 2.9);
    g.add(navLamp);
    this.parts.navLamp = navLamp;

    this.anchors.seats = {
      pilot: pilotSeat,
      copilot: copilotSeat,
      navigator: navSeat,
    };

    /* Seated eye: the flying seat, just under the cabin roof — same reasoning
     * as the Brushrunner's `pilotEye`: high enough to see over the coaming,
     * low enough to stay under the roof line (the roof is at +1.7). Kept right
     * up at the front bulkhead, as it was: further aft and the inside of the
     * forward fuselage wall is between the pilot and his own windshield. */
    this.pilotEye = new THREE.Vector3(0.55, 1.42, FUSE_LEN / 2 - 0.15);
    this.copilotSeat = new THREE.Vector3(-0.55, 0.2, FUSE_LEN / 2 - 0.35);
  }

  /* ---------------------------------------------------------------- */
  /* Per-frame                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * @param {number} dt
   * @param {object} phys    AircraftPhysics
   * @param {object} [engines] EngineSystem — `engines.engines` may have 2 or
   *   4 entries (see the engine-count note in `src/enolasquatch/config.js`);
   *   this maps whichever it gets onto the four visual propellers so the
   *   mesh never assumes one particular `EngineSystem` layout.
   * @param {object} [state] { bombBayOpen, dusk, gLat, roughness, concern,
   *   gunFiring, gunManned }
   */
  update(dt, phys, engines, state = {}) {
    const a = this.anim;
    const c = phys.controls;
    const engList = engines?.engines;

    for (let i = 0; i < 4; i++) {
      const e = engList ? engList[engList.length === 4 ? i : i < 2 ? 0 : 1] : null;
      const rpm = e ? e.rpm : 0;
      const spinSign = i < 2 ? 1 : -1;
      const rate = (rpm / 60) * Math.PI * 2 * spinSign;
      const visible = rpm < 420 ? rate : rate * 0.06;
      a.propPhase[i] += visible * dt;
      this.parts.prop[i].rotation.z = a.propPhase[i];
      const discOpacity = clamp((rpm - 380) / 900, 0, 0.34);
      this.parts.propDisc[i].material.opacity = discOpacity;
      this.parts.prop[i].visible = rpm < 1500;
    }

    const elev = -c.pitch * 0.3;
    this.parts.elevator.rotation.x = elev;
    this.parts.rudder.rotation.y = -c.yaw * 0.3;
    this.parts.aileron[0].rotation.x = c.roll * 0.3;
    this.parts.aileron[1].rotation.x = -c.roll * 0.3;
    a.flapVisual = damp(a.flapVisual, c.flaps, 4, dt);
    this.parts.flap[0].rotation.x = a.flapVisual * 0.55;
    this.parts.flap[1].rotation.x = a.flapVisual * 0.55;
    a.airBrakeVisual = damp(a.airBrakeVisual, c.airBrake || 0, 9, dt);
    this.parts.airBrake[0].rotation.x = a.airBrakeVisual * 0.9;
    this.parts.airBrake[1].rotation.x = a.airBrakeVisual * 0.9;

    for (let i = 0; i < this.parts.gear.length; i++) {
      const gear = this.parts.gear[i];
      const squash = clamp(phys.suspension?.[i] ?? 0, 0, 1) * 0.2;
      gear.leg.position.y = gear.rest + squash;
      gear.wheel.rotation.x -= ((phys.groundSpeed ?? 0) / (gear.wheel.geometry.parameters.radiusTop || 0.9)) * dt * (phys.onGround ? 1 : 0.15);
    }

    // Bomb-bay doors: `state.bombBayOpen` is the target (0 closed .. 1 open),
    // set by the mission phase, not decided here.
    a.bombBay = damp(a.bombBay, state.bombBayOpen ? 1 : 0, 2.6, dt);
    this.parts.bombBayDoors[0].rotation.z = a.bombBay * 1.35;
    this.parts.bombBayDoors[1].rotation.z = -a.bombBay * 1.35;

    this.updateRearGun(dt, phys, state);

    const beaconPulse = (Math.sin(phys.time * 3.4) + 1) / 2;
    this.parts.beacon.material = beaconPulse > 0.6 ? unlit(0xff5a3a) : unlit(0x4a1a10);
    const lit = state.dusk ? 1 : 0.4;
    for (const l of this.parts.navLights) l.scale.setScalar(0.7 + lit * 0.5);

    if (this.instruments) {
      this.instruments.update(dt, phys, engines ?? { engines: [{ rpm: 0, temp: 40 }, { rpm: 0, temp: 40 }], fuel: AC_ENOLA.fuelMass, anyRunning: false }, state);
      if (this.instruments.dirty) {
        this.parts.panelTex.needsUpdate = true;
        this.instruments.dirty = false;
      }
    }
  }

  /**
   * Swing the rear gun.
   *
   * Idle it sweeps slowly across the tail cone, which is what a man watching
   * an empty sky does with a gun in his hands. Firing, it snaps to
   * `state.gunAim` (a world-space point the mission hands over — normally the
   * ground battery that is shooting at them), the barrels recoil, and the two
   * muzzle flashes strobe. Nothing here decides WHETHER to fire; the mission's
   * defence phase does that, the same way `bombBayOpen` is somebody else's
   * decision.
   */
  updateRearGun(dt, phys, state = {}) {
    const a = this.anim;
    const yoke = this.parts.rearGunYoke;
    const turret = this.parts.rearGunTurret;
    if (!yoke || !turret) return;

    const firing = !!state.gunFiring;
    this.rearGunFiring = firing;

    let wantYaw;
    let wantPitch;
    if (firing && state.gunAim) {
      /* Convert the aim point into the aeroplane's own frame, then read the
       * traverse and elevation straight off it. The turret faces -Z (aft), so
       * the yaw is measured from -Z, not +Z. */
      _aim.copy(state.gunAim);
      this.group.worldToLocal(_aim);
      wantYaw = Math.atan2(-_aim.x, -_aim.z);
      wantPitch = Math.atan2(_aim.y, Math.hypot(_aim.x, _aim.z));
    } else {
      a.gunSweep += dt * 0.42;
      wantYaw = Math.sin(a.gunSweep) * 0.55;
      wantPitch = Math.sin(a.gunSweep * 0.61) * 0.16 - 0.06;
    }
    // The turret is a heavy thing on a hand crank: it never snaps.
    const rate = firing ? 5.5 : 1.6;
    a.gunYaw = damp(a.gunYaw, clamp(wantYaw, -1.15, 1.15), rate, dt);
    a.gunPitch = damp(a.gunPitch, clamp(wantPitch, -0.45, 0.65), rate, dt);
    turret.rotation.y = a.gunYaw;
    yoke.rotation.x = -a.gunPitch;

    // Muzzle flash and recoil, on a 12-rounds-a-second cadence.
    if (firing) {
      a.gunFlash -= dt;
      if (a.gunFlash <= 0) {
        a.gunFlash = 1 / 12;
        a.gunRecoil = 1;
      }
    } else {
      a.gunFlash = 0;
    }
    a.gunRecoil = Math.max(0, a.gunRecoil - dt * 14);
    const lit = firing ? clamp(a.gunRecoil, 0, 1) : 0;
    for (const flash of this.parts.gunFlash) {
      flash.material.opacity = lit * 0.95;
      const s = 0.55 + lit * 0.9;
      flash.scale.set(s, s, s * 2.4);
    }
    for (const barrel of this.parts.gunBarrels) barrel.position.z = -0.95 + a.gunRecoil * 0.09;
    void phys;
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
}
