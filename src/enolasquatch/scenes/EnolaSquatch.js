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
import {
  crestPlaceholderTexture, applyCrest, noseArtTexture, noseNamePlaceholderTexture,
} from '../livery.js';
import { AC_ENOLA } from '../config.js';
import { FAT_SQUATCH_MOUNT_HALF_HEIGHT_M } from '../payload/FatSquatch.js';

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
const CABIN_FLOOR_Y = -0.12;
const CABIN_FLOOR_TOP = CABIN_FLOOR_Y + 0.03;
const CREW_DOOR_SILL_Y = CABIN_FLOOR_TOP;
const CREW_DOOR_TOP_Y = 1.52;
const BAY_Z = 0.4;               // ventral bomb-bay centre, mid-fuselage
const BAY_LEN = 6.4;
const BAY_WIDTH = 3.0;
const BAY_DOOR_THICKNESS = 0.09;
const PAYLOAD_DOOR_CLEARANCE = 0.012;
const BELLY_Y = -FUSE_H / 2;
const ASTRODOME_Z = 3.1;
const ASTRODOME_OPEN_HALF = 0.38;
const DORSAL_TURRET_Z = -2.75;
const DORSAL_OPEN_HALF = 0.75;
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
 * A strut that actually joins two points.
 *
 * Every brace on this aeroplane used to be a cylinder placed at a guessed
 * midpoint with a guessed Euler angle, which is how the tailplane ended up
 * braced against thin air (owner playtest, 2026-08-04: "Thres two struts on
 * the back rudder benath the rudder and the tailwing and I think there
 * supposed to be above it connecting it to the tailwing") and how the main
 * gear legs ended up hanging off nothing. Give this the two ends and it
 * cannot be wrong: the length is the distance between them and the direction
 * is `quaternion.setFromUnitVectors` off the cylinder's own +Y axis.
 *
 * @param {THREE.Material} material
 * @param {number[]} from  [x, y, z] in the aeroplane's frame
 * @param {number[]} to    [x, y, z]
 * @param {number} [r]     radius
 * @param {string} [name]
 * @returns {THREE.Mesh}
 */
const _sA = new THREE.Vector3();
const _sB = new THREE.Vector3();
const _sDir = new THREE.Vector3();
const _sUp = new THREE.Vector3(0, 1, 0);
function strutBetween(material, from, to, r = 0.07, name = 'strut') {
  _sA.set(from[0], from[1], from[2]);
  _sB.set(to[0], to[1], to[2]);
  _sDir.subVectors(_sB, _sA);
  const len = _sDir.length();
  const bar = mesh(cylGeo(r, r, len, 8), material,
    (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  bar.quaternion.setFromUnitVectors(_sUp, _sDir.normalize());
  bar.name = name;
  return bar;
}

/** Scratch vector for the rear gun's aim conversion — one, not one a frame. */
const _aim = new THREE.Vector3();
const _gunEyeLocal = new THREE.Vector3();
const _walkLocal = new THREE.Vector3();
const _walkWorld = new THREE.Vector3();
const _walkVelocity = new THREE.Vector3();

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
    /* The paintings load after the synchronous airframe build. Keep their
     * state on the aircraft that owns the plates so debug consumers inspect
     * the real load promise and real materials, not a parallel composition-
     * root counter that can drift away from them. */
    this.noseArtLoadState = 'idle';
    this.noseArtLoadError = null;
    /** True once `explode()` has replaced the airframe with a fireball. See
     * `explode()` / `updateExplosion()` / `resetDestruction()` at the bottom
     * of this class — ported from `src/beefrun/aircraft.js`'s `Brushrunner`,
     * which is where this mission's own crash had nothing at all: `fail()`
     * put a HUD message up over an aeroplane that just kept flying. */
    this.destroyed = false;
    this.explosion = null;
    this.build();
    if (withCockpit) this.buildCockpit();
    /* The panel has one RPM/temp pair for four engines; show the inner pair —
     * the same engines the audio's stereo channels follow — so the scripted
     * innerRight overheat is on a dial and not only in the sound. */
    this.instruments = withCockpit ? new Instruments(this.parts.panelCanvas, { ac: AC_ENOLA, engineIndices: [1, 2] }) : null;
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

    /* ---- Fuselage ----
     *
     * This used to be one opaque `BoxGeometry` with windows, blisters, bomb
     * doors and the crew door merely drawn over it. From inside, FrontSide
     * culling made the box disappear and disguised the problem; from outside,
     * every pane led straight into metal and the open entry route was still a
     * wall. Build the same 3.2 x 3.4 x 15.5 m skin as explicit thin sheets,
     * omitting only the apertures that the visible glazing/doors occupy. */
    const fuselage = group('fuselage-open-shell');
    g.add(fuselage);
    this.parts.fuselage = fuselage;
    this.parts.fuselageShell = fuselage;
    const HALF_W = FUSE_W / 2;
    const HALF_H = FUSE_H / 2;
    const HALF_L = FUSE_LEN / 2;
    const SKIN_T = 0.08;
    const addSideSkin = (sx, openings) => {
      const ys = [-HALF_H, HALF_H, ...openings.flatMap((opening) => [opening.y0, opening.y1])]
        .sort((a, b) => a - b).filter((value, index, values) => index === 0 || value !== values[index - 1]);
      const zs = [-HALF_L, HALF_L, ...openings.flatMap((opening) => [opening.z0, opening.z1])]
        .sort((a, b) => a - b).filter((value, index, values) => index === 0 || value !== values[index - 1]);
      let panelIndex = 0;
      for (let yi = 0; yi < ys.length - 1; yi++) {
        for (let zi = 0; zi < zs.length - 1; zi++) {
          const [y0, y1] = [ys[yi], ys[yi + 1]];
          const [z0, z1] = [zs[zi], zs[zi + 1]];
          const cy = (y0 + y1) / 2;
          const cz = (z0 + z1) / 2;
          if (openings.some((opening) => cy > opening.y0 && cy < opening.y1
            && cz > opening.z0 && cz < opening.z1)) continue;
          const panel = mesh(
            boxGeo(SKIN_T, y1 - y0, z1 - z0), skin,
            sx * (HALF_W - SKIN_T / 2), cy, cz,
          );
          panel.name = `fuselage-skin-${sx < 0 ? 'starboard' : 'port'}-${++panelIndex}`;
          fuselage.add(panel);
        }
      }
    };
    const cockpitOpening = { y0: 0.8, y1: 1.5, z0: 6.4, z1: HALF_L };
    const waistOpening = { y0: -0.8, y1: 0.4, z0: -6.05, z1: -4.75 };
    addSideSkin(1, [cockpitOpening, waistOpening]);
    addSideSkin(-1, [
      cockpitOpening,
      waistOpening,
      { y0: CREW_DOOR_SILL_Y, y1: CREW_DOOR_TOP_Y, z0: -3.8, z1: -3.0 },
    ]);

    /* The blister and dome skins are curved, while their panel-builder cuts
     * above are necessarily rectangular. Close the unused corners with a
     * fitted opaque annulus so those cuts are not open holes around a round
     * piece of glass. The central ellipse remains the actual aperture. */
    const apertureAnnulus = ({ name, outerX, outerY, holeX, holeY, x, y, z, rotationY = 0, rotationX = 0 }) => {
      const shape = new THREE.Shape();
      shape.moveTo(-outerX, -outerY);
      shape.lineTo(outerX, -outerY);
      shape.lineTo(outerX, outerY);
      shape.lineTo(-outerX, outerY);
      shape.closePath();
      const hole = new THREE.Path();
      hole.absellipse(0, 0, holeX, holeY, 0, Math.PI * 2, false, 0);
      shape.holes.push(hole);
      const panel = mesh(new THREE.ShapeGeometry(shape, 28), skin, x, y, z);
      panel.name = name;
      panel.rotation.x = rotationX;
      panel.rotation.y = rotationY;
      fuselage.add(panel);
      return panel;
    };
    for (const sx of [-1, 1]) {
      apertureAnnulus({
        name: `fuselage-waist-annulus-${sx < 0 ? 'starboard' : 'port'}`,
        /* A 10 mm lap on every edge is the riveted seam; it also keeps the
         * exact panel boundary from being a zero-width ray crack. */
        outerX: 0.66, outerY: 0.61, holeX: 0.55, holeY: 0.48,
        x: sx * HALF_W, y: -0.2, z: -5.4,
        rotationY: sx * Math.PI / 2,
      });
    }

    const addRoofRun = (x0, x1, z0, z1, name) => {
      const panel = mesh(boxGeo(x1 - x0, SKIN_T, z1 - z0), skin,
        (x0 + x1) / 2, HALF_H - SKIN_T / 2, (z0 + z1) / 2);
      panel.name = name;
      fuselage.add(panel);
    };
    addRoofRun(-HALF_W, HALF_W, -HALF_L,
      DORSAL_TURRET_Z - DORSAL_OPEN_HALF, 'fuselage-roof-aft');
    addRoofRun(-HALF_W, -0.7, DORSAL_TURRET_Z - DORSAL_OPEN_HALF,
      DORSAL_TURRET_Z + DORSAL_OPEN_HALF, 'fuselage-roof-dorsal-starboard');
    addRoofRun(0.7, HALF_W, DORSAL_TURRET_Z - DORSAL_OPEN_HALF,
      DORSAL_TURRET_Z + DORSAL_OPEN_HALF, 'fuselage-roof-dorsal-port');
    addRoofRun(-HALF_W, HALF_W, DORSAL_TURRET_Z + DORSAL_OPEN_HALF,
      ASTRODOME_Z - ASTRODOME_OPEN_HALF, 'fuselage-roof-centre');
    addRoofRun(-HALF_W, -0.36, ASTRODOME_Z - ASTRODOME_OPEN_HALF,
      ASTRODOME_Z + ASTRODOME_OPEN_HALF, 'fuselage-roof-astrodome-starboard');
    addRoofRun(0.36, HALF_W, ASTRODOME_Z - ASTRODOME_OPEN_HALF,
      ASTRODOME_Z + ASTRODOME_OPEN_HALF, 'fuselage-roof-astrodome-port');
    addRoofRun(-HALF_W, HALF_W, ASTRODOME_Z + ASTRODOME_OPEN_HALF, HALF_L, 'fuselage-roof-forward');
    apertureAnnulus({
      name: 'fuselage-roof-astrodome-annulus',
      outerX: ASTRODOME_OPEN_HALF + 0.01, outerY: ASTRODOME_OPEN_HALF + 0.01,
      holeX: 0.28, holeY: 0.28,
      x: 0, y: HALF_H, z: ASTRODOME_Z,
      rotationX: -Math.PI / 2,
    });
    apertureAnnulus({
      name: 'fuselage-roof-dorsal-annulus',
      outerX: 0.71, outerY: DORSAL_OPEN_HALF + 0.01,
      holeX: 0.48, holeY: 0.48,
      x: 0, y: HALF_H, z: DORSAL_TURRET_Z,
      rotationX: -Math.PI / 2,
    });

    const addBelly = (x0, x1, z0, z1, name) => {
      const panel = mesh(boxGeo(x1 - x0, SKIN_T, z1 - z0), skin,
        (x0 + x1) / 2, -HALF_H + SKIN_T / 2, (z0 + z1) / 2);
      panel.name = name;
      fuselage.add(panel);
    };
    const bayAft = BAY_Z - BAY_LEN / 2;
    const bayForward = BAY_Z + BAY_LEN / 2;
    addBelly(-HALF_W, HALF_W, -HALF_L, bayAft, 'fuselage-belly-aft');
    addBelly(-HALF_W, -BAY_WIDTH / 2, bayAft, bayForward, 'fuselage-bomb-bay-starboard-edge');
    addBelly(BAY_WIDTH / 2, HALF_W, bayAft, bayForward, 'fuselage-bomb-bay-port-edge');
    addBelly(-HALF_W, HALF_W, bayForward, HALF_L, 'fuselage-belly-forward');
    const aftCap = mesh(boxGeo(FUSE_W, FUSE_H, SKIN_T), skin, 0, 0, -HALF_L + SKIN_T / 2);
    aftCap.name = 'fuselage-aft-cap';
    fuselage.add(aftCap);

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
    fuselage.add(patch1);
    patch1.add(rivets());
    const patch2 = mesh(boxGeo(2.2, 1.1, 0.06), patchRough, -PANEL_X, 0.55, -6.6);
    patch2.rotation.y = -Math.PI / 2;
    fuselage.add(patch2);
    patch2.add(rivets());
    // The third one is on the belly, over the bomb bay's forward bulkhead, and
    // it is the one Numbskull is proudest of.
    const patch3 = mesh(boxGeo(1.6, 0.08, 1.4), patchRough, 0.7, BELLY_Y - 0.02, BAY_Z + BAY_LEN / 2 + 1.0);
    fuselage.add(patch3);
    this.parts.patches = [patch1, patch2, patch3];

    /* Panel-line seams down both flanks and along the spine. Four thin dark
     * strips per side — this is the "more detail" that actually reads, because
     * a bare 15 m box has nothing on it to judge its own size against. */
    const seam = solid(0x7a808c, { roughness: 0.85, metalness: 0.2 });
    for (const sx of [-1, 1]) {
      for (const z of [-5.4, -1.6, 2.2, 5.6]) {
        const verticalRuns = z === -5.4
          ? [[-HALF_H + 0.15, waistOpening.y0], [waistOpening.y1, HALF_H - 0.15]]
          : [[-HALF_H + 0.15, HALF_H - 0.15]];
        for (const [y0, y1] of verticalRuns) {
          const panelLine = mesh(
            boxGeo(0.024, y1 - y0, 0.06), seam,
            sx * SEAM_X, (y0 + y1) / 2, z,
          );
          panelLine.name = 'fuselage-panel-line-'
            + (sx < 0 ? 'starboard' : 'port') + '-' + z + '-' + y0;
          fuselage.add(panelLine);
        }
      }
      const run = rivetRun(metal, 13, 1.05, 'z');
      run.position.set(sx * SEAM_X, FUSE_H / 2 - 0.5, 0);
      run.rotation.z = Math.PI / 2;
      fuselage.add(run);
    }
    for (const z of [-4.2, 0.4, 4.8]) {
      fuselage.add(mesh(boxGeo(FUSE_W - 0.2, 0.05, 0.05), seam, 0, FUSE_H / 2 + 0.005, z));
    }

    /* Corner chamfers. Owner: "Maybe a bit less square in some areas." The
     * fuselage's four longitudinal edges were dead 90-degree corners running
     * the whole 15.5 m, which is the single most box-like thing on the model.
     * See `chamfer()` for why one rolled bar per edge is enough. */
    const chamferMat = solid(SKIN, { roughness: 0.62, metalness: 0.36 });
    const chamferAft = -FUSE_LEN / 2 + 0.1;
    const chamferForward = FUSE_LEN / 2 - 0.1;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        // The upper rolled corner used to continue behind the complete top row
        // of both cockpit side panes. End it at the authored window cut; the
        // lower corner remains continuous because it never enters an aperture.
        const forward = sy > 0 ? cockpitOpening.z0 : chamferForward;
        const bar = chamfer(
          chamferMat, 0.30, forward - chamferAft,
          sx * (FUSE_W / 2 - 0.09), sy * (FUSE_H / 2 - 0.09),
          (chamferAft + forward) / 2, Math.PI / 4,
        );
        bar.name = 'fuselage-chamfer-'
          + (sx < 0 ? 'starboard' : 'port') + '-' + (sy < 0 ? 'lower' : 'upper');
        fuselage.add(bar);
      }
    }
    // A rounded spine and a rounded keel, so the top and bottom read curved.
    // The spine is upper-half surface runs, broken at both roof apertures. A
    // full cylinder hung its lower arc through the side windows; one unbroken
    // half-cylinder still roofed over the navigator's astrodome.
    const spineEnds = FUSE_LEN / 2 - 0.3;
    for (const [index, [z0, z1]] of [
      [-spineEnds, DORSAL_TURRET_Z - DORSAL_OPEN_HALF],
      [DORSAL_TURRET_Z + DORSAL_OPEN_HALF, ASTRODOME_Z - ASTRODOME_OPEN_HALF],
      [ASTRODOME_Z + ASTRODOME_OPEN_HALF, spineEnds],
    ].entries()) {
      const spine = mesh(new THREE.CylinderGeometry(
        0.5, 0.5, z1 - z0, 12, 1, true, Math.PI * 0.75, Math.PI / 2,
      ), chamferMat, 0, FUSE_H / 2 - 0.42, (z0 + z1) / 2);
      spine.name = `fuselage-spine-${index + 1}`;
      spine.rotation.x = Math.PI / 2;
      spine.scale.set(2.6, 1, 1);
      fuselage.add(spine);
    }

    /* Nose cone, tapered, with a glazed bombardier bubble in front of it. The
     * bubble is where Numbskull actually sits.
     *
     * The cone used to run 4.0 m from z 7.65 all the way to z 11.65 — THROUGH
     * the glazing, whose centre is at 11.25 — tapering to 0.42 m of radius at
     * the tip. So the "bombardier's bubble" enclosed nothing but the pointed
     * end of an opaque cone, there was no volume inside it for a man, and
     * Numbskull was consequently placed half in the skin (owner: "a lot of
     * clipping and intersecting"). The cone now STOPS at the collar ring — the
     * frame that was always drawn at z 10.7 — at the diameter the glazing
     * starts at, and the glasshouse forward of it is hollow and real. */
    const NOSE_JOIN = FUSE_LEN / 2 + 2.95;    // 10.70 — where cone meets glass
    const GLASS_Z = FUSE_LEN / 2 + 3.55;      // 11.30 — glasshouse centre
    const GLASS_Y = -0.35;
    const GLASS_R = 1.25;
    /* This shell overlaps the fuselage at its rear, so an end cap there is
     * both invisible from outside and catastrophic from inside: the pilot eye
     * is 50 mm behind it and sees aluminium before the windshield. Keep the
     * tapered side skin, but leave the overlapping ends open so the authored
     * flight deck really looks into its glasshouse. */
    /* Leave the upper windshield sector out of the tapered shell. An open end
     * alone did not help: the curved side skin still crossed the exterior
     * pilot sightline 0.37 m behind the transparent windshield. */
    const nose = mesh(new THREE.CylinderGeometry(
      1.06, FUSE_W / 2, NOSE_JOIN - (FUSE_LEN / 2 - 0.1), 16, 1, true,
      /* Widen the missing windshield sector through the side-pane forward
       * corners too. The former angular edges sat 0.217..0.366 m behind the
       * transparent panes even though the centre sightlines were clear. */
      4.35, Math.PI * 2 - 4.35 + 1.93,
    ), skin,
      0, 0.1, (NOSE_JOIN + FUSE_LEN / 2 - 0.1) / 2);
    nose.rotation.x = Math.PI / 2;
    nose.name = 'nose-cone';
    // Open skin with a missing windshield sector: its filled AABB is not a
    // solid collision volume. Keep auditing every fixture inside it instead.
    nose.userData.geometryGate = { overlap: false, fixedSupportAnchor: true };
    g.add(nose);
    /* The bubble grew with the volume it now has to hold: a seated man is
     * about 1.3 m from heel to crown, and a 1.05 m sphere could not take one
     * however he was posed. */
    const noseGlass = mesh(sphereGeo(GLASS_R, 16, 12), glassMat, 0, GLASS_Y, GLASS_Z);
    noseGlass.castShadow = false;
    noseGlass.name = 'bombardier-glazing';
    // A transparent bubble is a surface around the occupied station, not a
    // solid sphere. Its AABB necessarily contains the seated bombardier.
    noseGlass.userData.geometryGate = { overlap: false };
    g.add(noseGlass);
    /* Framing on the bombardier glazing, so it reads as a glasshouse rather
     * than a soap bubble.
     *
     * Owner playtest, 2026-08-04: "Nose of Aircraft — not sure if that
     * propeller or what that is, is rotated incorrectly and should be
     * vertical?" It was, functionally, a propeller. `cylGeo` stands on +Y;
     * `rotation.z = PI/2` laid each rib flat along X, and the fan was then
     * applied about Y — which keeps a horizontal bar horizontal however far
     * you spin it. The result was three 2.1 m bars sticking a metre out of
     * either side of the nose in ONE plane: a three-bladed prop bolted to the
     * front of the aeroplane, exactly as reported.
     *
     * A glasshouse's frames are meridians, but they must follow its surface.
     * The three former cylinders were still straight diameters through the
     * centre of the occupied bubble: Numbskull's cap intersected the centre
     * rib even though his whole rig cleared the glass shell. Great-circle
     * torus frames retain the same upright/raked read outside the sphere and
     * leave its actual crew volume hollow. */
    for (const ang of [0, 0.72, -0.72]) {
      const rib = mesh(new THREE.TorusGeometry(GLASS_R + 0.02, 0.025, 6, 32), trim, 0, GLASS_Y, GLASS_Z);
      rib.rotation.y = Math.PI / 2;
      rib.rotation.z = ang;
      rib.name = 'nose-glazing-rib';
      // The torus is an annulus; its filled AABB covers the hollow crew volume.
      rib.userData.geometryGate = { overlap: false };
      g.add(rib);
    }
    /* The collar where the glazing meets the nose cone is an annulus, not a
     * capped cylinder. A cap at this occupied seam sealed the bombardier off
     * from the aeroplane and presented an opaque wall from either side. */
    const noseCollar = mesh(new THREE.TorusGeometry(1.1, 0.05, 8, 32), trim, 0, GLASS_Y, NOSE_JOIN);
    noseCollar.name = 'nose-glazing-collar';
    noseCollar.userData.geometryGate = { overlap: false };
    g.add(noseCollar);

    // Tail boom, tapering back to the fin.
    const tailStructure = group('tail-structure');
    tailStructure.userData.geometryGate = { assemblyId: 'enola-aircraft:tail' };
    g.add(tailStructure);
    const boom = mesh(cylGeo(FUSE_W / 2, 0.62, 5.8, 14), skin, 0, 0.05, -FUSE_LEN / 2 - 2.9);
    boom.rotation.x = Math.PI / 2;
    tailStructure.add(boom);

    // ---- Wing: shoulder-mounted, four-engine spar ----
    const wingStructure = group('wing-structure');
    wingStructure.userData.geometryGate = { assemblyId: 'enola-aircraft:wing' };
    g.add(wingStructure);
    const halfSpan = AC_ENOLA.span / 2;
    const wing = mesh(boxGeo(AC_ENOLA.span, 0.62, AC_ENOLA.chord), skin, 0, 1.1, 0.3);
    wing.name = 'main-wing';
    wingStructure.add(wing);
    this.parts.wing = wing;
    // Outer panels, thinner and swept a touch back — a straight slab of wing is
    // the single most model-kit-looking thing on an aeroplane like this.
    for (const sx of [-1, 1]) {
      const tip = mesh(boxGeo(halfSpan * 0.34, 0.42, AC_ENOLA.chord * 0.72), skin,
        sx * (halfSpan * 0.82), 1.14, -0.05);
      tip.rotation.y = -sx * 0.045;
      wingStructure.add(tip);
      // Wing fences over the inboard nacelles.
      wingStructure.add(mesh(boxGeo(0.05, 0.34, 1.5), seam, sx * 9.6, 1.5, 0.2));
    }
    // Fuel-cap rows and the walkway strip nobody has repainted.
    for (const sx of [-1, 1]) {
      for (const d of [4.4, 8.6, 12.2]) {
        wingStructure.add(mesh(cylGeo(0.19, 0.19, 0.05, 10), metal, sx * d, 1.42, -0.5));
      }
      const walk = mesh(boxGeo(2.4, 0.02, AC_ENOLA.chord * 0.5), solid(0x2f3138, { roughness: 1 }), sx * 2.6, 1.42, 0.3);
      wingStructure.add(walk);
    }

    // Ailerons and flaps. Keep each control surface out of the engine/gear
    // envelopes instead of drawing one rectangular slab through a nacelle.
    this.parts.aileron = [];
    for (const sx of [-1, 1]) {
      const side = sx > 0 ? 'left' : 'right';
      const pivot = group(`aileron-${side}`);
      pivot.userData.geometryGate = { assemblyId: 'enola-aircraft:wing' };
      pivot.position.set(sx * 15.5, 1.1, -1.8);
      const surface = mesh(boxGeo(2.2, 0.32, 1.0), patch, 0, 0, -0.5);
      surface.name = `aileron-${side}-surface`;
      pivot.add(surface);
      g.add(pivot);
      this.parts.aileron.push(pivot);
    }
    this.parts.flap = [];
    for (const sx of [-1, 1]) {
      const side = sx > 0 ? 'left' : 'right';
      const pivot = group(`flap-${side}`);
      pivot.userData.geometryGate = { assemblyId: 'enola-aircraft:wing' };
      pivot.position.set(sx * 5.4, 1.08, -1.8);
      const obstructions = [
        { center: sx * (AC_ENOLA.track / 2 - 5.4), halfWidth: 0.55 },
        { center: sx * (6.4 - 5.4), halfWidth: 1.05 },
      ].sort((left, right) => left.center - right.center);
      const ranges = [];
      let rangeStart = -3.3;
      for (const obstruction of obstructions) {
        ranges.push([rangeStart, obstruction.center - obstruction.halfWidth]);
        rangeStart = obstruction.center + obstruction.halfWidth;
      }
      ranges.push([rangeStart, 3.3]);
      ranges.forEach(([x0, x1], index) => {
        const surface = mesh(boxGeo(x1 - x0, 0.3, 1.1), skin, (x0 + x1) / 2, 0, -0.55);
        surface.name = `flap-${side}-surface-${index + 1}`;
        pivot.add(surface);
      });
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
      const nacelleAssembly = group(`nacelle-${i + 1}`);
      nacelleAssembly.userData.geometryGate = {
        assemblyId: `enola-aircraft:nacelle-${i + 1}`,
      };
      g.add(nacelleAssembly);
      const nacelle = mesh(boxGeo(1.75, 1.6, 5.4), skin, nx, 0.7, 1.0);
      nacelle.name = `nacelle-core-${i + 1}`;
      // This is the exact load-bearing core keyed through the wing. The cowl,
      // exhaust and propeller remain collision-visible within their bounded
      // nacelle assembly, while support provenance starts at the real mount.
      nacelle.userData.geometryGate = { fixedSupportAnchor: true };
      nacelleAssembly.add(nacelle);
      /* Rounded nacelle shoulders — the nacelle was a bare box under a round
       * cowl, which made the join read as a can taped to a brick. Two rolled
       * bars along the top edges and a half-round crown fix it for three
       * meshes. Owner: "Maybe a bit less square in some areas." */
      for (const sx of [-1, 1]) {
        nacelleAssembly.add(chamfer(skin, 0.34, 5.2, nx + sx * 0.72, 1.37, 1.0, Math.PI / 4));
        nacelleAssembly.add(chamfer(skin, 0.28, 5.2, nx + sx * 0.74, 0.05, 1.0, Math.PI / 4));
      }
      const crown = mesh(cylGeo(0.5, 0.5, 5.2, 12, true), skin, nx, 1.22, 1.0);
      crown.rotation.x = Math.PI / 2;
      crown.scale.set(1.7, 1, 1);
      nacelleAssembly.add(crown);
      // Nacelle nose fairing and the ring cowl, in two diameters.
      const cowl = mesh(cylGeo(0.8, 0.9, 1.5, 16), trim, nx, 0.7, 3.9);
      cowl.rotation.x = Math.PI / 2;
      nacelleAssembly.add(cowl);
      const cowlLip = mesh(cylGeo(0.9, 0.86, 0.18, 16), metal, nx, 0.7, 4.62);
      cowlLip.rotation.x = Math.PI / 2;
      nacelleAssembly.add(cowlLip);
      // Cooling gills — six little flaps round the back of the cowl.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.4;
        const gill = mesh(boxGeo(0.24, 0.05, 0.34), trim,
          nx + Math.cos(a) * 0.82, 0.7 + Math.sin(a) * 0.82, 3.2);
        gill.rotation.z = a;
        nacelleAssembly.add(gill);
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
      nacelleAssembly.add(gearbox);
      // Back plate: the disc the blade roots come through.
      const backPlate = mesh(cylGeo(0.52, 0.5, 0.1, 18), spinnerMat, nx, 0.7, 5.18);
      backPlate.rotation.x = Math.PI / 2;
      nacelleAssembly.add(backPlate);
      // The spinner proper: base just forward of the roots, apex forward.
      const spinner = mesh(coneGeo(0.5, 1.15, 20), spinnerMat, nx, 0.7, 5.95);
      spinner.rotation.x = Math.PI / 2;
      nacelleAssembly.add(spinner);
      // Rounded tip on the cone, so it is an ogive and not a dart.
      const spinnerTip = mesh(sphereGeo(0.075, 10, 8), spinnerMat, nx, 0.7, 6.5);
      nacelleAssembly.add(spinnerTip);

      const hub = new THREE.Group();
      hub.position.set(nx, 0.7, 5.4);
      const bladeMat = solid(0x24262a, { roughness: 0.5, metalness: 0.42 });
      for (let b = 0; b < 3; b++) {
        const blade = propBlade(bladeMat);
        blade.rotation.z = (b / 3) * Math.PI * 2;
        hub.add(blade);
      }
      nacelleAssembly.add(hub);
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
      nacelleAssembly.add(disc);
      this.parts.propDisc.push(disc);

      // Two stacks a side, because a fourteen-cylinder radial has two banks.
      for (const sx of [-1, 1]) {
        const stack = mesh(cylGeo(0.14, 0.14, 0.75, 6), solid(0x35353a, { roughness: 0.9 }),
          nx + sx * 0.5, 0.1, 2.4);
        stack.rotation.x = Math.PI / 2.2;
        nacelleAssembly.add(stack);
      }
      this.parts.exhaust.push(new THREE.Vector3(nx, -0.1, 2.1));

      // Nacelle-to-wing fairing behind the trailing edge.
      const fairing = mesh(cylGeo(0.8, 0.22, 3.0, 12), skin, nx, 0.72, -2.3);
      fairing.rotation.x = Math.PI / 2;
      nacelleAssembly.add(fairing);

      // Cowl clamp bands for readable scale.
      for (const z of [2.2, 3.2]) {
        nacelleAssembly.add(mesh(boxGeo(1.8, 1.63, 0.06), metal, nx, 0.7, z));
      }
    }

    // ---- Tail: single tall fin, and a broad stabiliser ----
    const fin = mesh(boxGeo(0.28, 5.0, 3.9), skin, 0, 2.8, -FUSE_LEN / 2 - 4.4);
    fin.name = 'vertical-fin';
    tailStructure.add(fin);
    // Fin root fillet running forward onto the spine.
    const fillet = mesh(coneGeo(0.7, 4.2, 6), skin, 0, FUSE_H / 2 - 0.2, -FUSE_LEN / 2 - 1.6);
    fillet.rotation.x = -Math.PI / 2;
    fillet.scale.set(0.28, 1, 0.7);
    tailStructure.add(fillet);
    const rudderPivot = group('rudder-pivot');
    rudderPivot.userData.geometryGate = { assemblyId: 'enola-aircraft:tail' };
    rudderPivot.position.set(0, 2.8, -FUSE_LEN / 2 - 6.2);
    rudderPivot.add(mesh(boxGeo(0.26, 4.5, 1.7), patch, 0, 0, -0.85));
    g.add(rudderPivot);
    this.parts.rudder = rudderPivot;

    const stab = mesh(boxGeo(11.6, 0.32, 2.6), skin, 0, 1.0, -FUSE_LEN / 2 - 4.7);
    stab.name = 'horizontal-stabilizer';
    tailStructure.add(stab);
    const elevPivot = group('elevator-pivot');
    elevPivot.userData.geometryGate = { assemblyId: 'enola-aircraft:tail' };
    elevPivot.position.set(0, 1.0, -FUSE_LEN / 2 - 5.9);
    elevPivot.add(mesh(boxGeo(11.6, 0.26, 1.3), patch, 0, 0, -0.65));
    g.add(elevPivot);
    this.parts.elevator = elevPivot;

    /* ---- Tailplane bracing struts ----
     *
     * Owner playtest, 2026-08-04: "Thres two struts on the back rudder benath
     * the rudder and the tailwing and I think there supposed to be above it
     * connecting it to the tailwing."
     *
     * He was right on both counts. They were a pair of 2.6 m bars centred at
     * y 0.4 and rolled 0.75 rad, which put their lower ends at about y -0.55
     * outboard of the tail boom — hanging BELOW the stabiliser with nothing
     * under them to be braced against. The stabiliser sits at y 1.0 and the
     * fin stands above it, so the load path a braced tailplane actually has
     * runs from a point up the FIN, down and outboard, to the stabiliser
     * spar. That is what these are now, and `strutBetween()` puts the ends
     * exactly on the two parts rather than near them.
     *
     * The fin spans y 0.3 .. 5.3 at z -FUSE_LEN/2-4.4 and the stabiliser is
     * 11.6 m across at y 1.0, z -FUSE_LEN/2-4.7 — so the root is on the fin's
     * side at y 3.5 and the tip lands on the stabiliser's top skin, half way
     * out each side. */
    const FIN_Z = -FUSE_LEN / 2 - 4.4;
    const STAB_Z = -FUSE_LEN / 2 - 4.7;
    this.parts.tailBrace = [];
    for (const sx of [-1, 1]) {
      const brace = strutBetween(metal,
        [sx * 0.15, 3.5, FIN_Z], [sx * 3.6, 1.16, STAB_Z], 0.065, 'tailplane-brace');
      tailStructure.add(brace);
      this.parts.tailBrace.push(brace);
      // A shorter jury strut inboard of it, the way a real braced tail has two.
      const jury = strutBetween(metal,
        [sx * 0.15, 2.2, FIN_Z], [sx * 2.0, 1.16, STAB_Z], 0.05, 'tailplane-jury-strut');
      tailStructure.add(jury);
      this.parts.tailBrace.push(jury);
      // Fittings, so the struts land on something rather than into the skin.
      tailStructure.add(mesh(boxGeo(0.16, 0.14, 0.3), metal, sx * 3.6, 1.2, STAB_Z));
      tailStructure.add(mesh(boxGeo(0.16, 0.14, 0.3), metal, sx * 2.0, 1.2, STAB_Z));
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
      const panel = mesh(boxGeo(BAY_WIDTH / 2 + 0.04, BAY_DOOR_THICKNESS, BAY_LEN), patch, -sx * (BAY_WIDTH / 4 + 0.02), 0, 0);
      panel.name = `bomb-bay-door-${sx > 0 ? 'port' : 'starboard'}-panel`;
      // The panel pivots around a hinge built into the fuselage skin. Preserve
      // that exact fixed mounting without suppressing door-vs-airframe checks.
      panel.userData.geometryGate = { fixedSupportAnchor: true };
      pivot.add(panel);
      g.add(pivot);
      this.parts.bombBayDoors.push(pivot);
    }

    // Where the Fat Squatch rides until it doesn't. A plain anchor, not a
    // visible part — the payload prop parents itself here.
    const payloadMount = new THREE.Group();
    payloadMount.name = 'payload-mount';
    payloadMount.position.set(
      0,
      BELLY_Y + BAY_DOOR_THICKNESS / 2 + FAT_SQUATCH_MOUNT_HALF_HEIGHT_M + PAYLOAD_DOOR_CLEARANCE,
      BAY_Z,
    );
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
       * both sides, the crew door on the -X side only, and the nose-art bay,
       * which since 2026-08-06 is on BOTH. Runs shorter than 0.25 m are
       * dropped by `runs()`, so touching gaps merge on their own.
       *
       * The forward gap was [3.2, 5.4] — sized for the club badge that used to
       * be the only thing on this flank. It now runs from the wing leading edge
       * to the nose, because the whole of that skin is the nose-art bay: the
       * pin-up, the name plate and the badge all stand on it (see the nose-art
       * block below). The last run comes out zero-length and `runs()` drops it,
       * so the stripe simply stops aft of the artwork, which is what a paint
       * shop masking off a nose-art bay actually leaves behind.
       *
       * The +X flank got the same forward gap on 2026-08-06, when the artwork
       * was copied to it: the pin-up's ink runs down to y -0.90 and the stripe
       * band is y -0.80..-0.30, so leaving the stripe on would have drawn a
       * 0.5 m purple bar across her legs on that side only. */
      const gaps = sx < 0
        ? [[-6.2, -4.6], [-4.4, -2.4], [2.6, FUSE_LEN / 2 - 0.7]]
        : [[-6.2, -4.6], [2.6, FUSE_LEN / 2 - 0.7]];
      runs(gaps).forEach(([a, b], runIndex) => {
        const len = b - a;
        const side = sx < 0 ? 'starboard' : 'port';
        const mainStripe = mesh(boxGeo(0.036, 0.5, len), purple, sx * LIVERY_X, STRIPE_Y, (a + b) / 2);
        mainStripe.name = `livery-stripe-${side}-${runIndex}-main`;
        mainStripe.userData.geometryGate = { checkSupport: false };
        g.add(mainStripe);
        const accentStripe = mesh(boxGeo(0.036, 0.1, len), purpleLight, sx * LIVERY_X, STRIPE_Y - 0.37, (a + b) / 2);
        accentStripe.name = `livery-stripe-${side}-${runIndex}-accent`;
        accentStripe.userData.geometryGate = { checkSupport: false };
        g.add(accentStripe);
      });
    }
    // Fin flash, painted on both faces and clear of the stabiliser below.
    for (const sx of [-1, 1]) {
      const finFlash = flatMesh(planeGeo(0.6, 3.5), purple,
        sx * 0.145, 2.95, -FUSE_LEN / 2 - 4.35);
      finFlash.name = 'fin-flash';
      finFlash.rotation.y = sx * Math.PI / 2;
      finFlash.userData.geometryGate = {
        assemblyId: 'enola-aircraft:tail',
        checkSupport: false,
      };
      g.add(finFlash);
    }

    /* ---- The nose art: the owner's pin-up and his name plate ----
     *
     * Owner, 2026-08-05, delivering both paintings: "I want both of these on
     * the Enola Squatch. They should be close together but not touching."
     *
     * `../livery.js` does the image work — matte, glow, bleed, trim — and hands
     * back each painting's REAL aspect ratio, which is the number the two
     * planes below are sized from. Neither sheet fills itself: the pin-up's ink
     * is 0.73:1 and the name's is 2.03:1 inside identical 2:3 portrait files.
     *
     * WHICH SIDE. Owner, 2026-08-06: "put the enola squatch logo on both sides
     * with the pinup girl as well." Both, then — one pair of plates per flank,
     * at the same stations, sized off the same measured aspects.
     *
     * This block used to argue for one flank on the grounds that the far side
     * would need "a second plane whose UVs run the other way", and that doing
     * that with a negative scale is the trap that turns a mesh inside out.
     * The second half of that is true and still is. The first half was wrong,
     * and `artPlate()` below is why: a plane's own +X axis runs to +Z when it
     * is turned -90 degrees about Y and to -Z when it is turned +90. A viewer
     * stood off the -X flank has +Z on his right; a viewer off the +X flank
     * has -Z on his right. So the SAME texture on the SAME geometry reads
     * left-to-right from either side with nothing flipped — no mirrored UVs,
     * no `scale.x = -1`, and nothing for `tools/scene-audit.mjs`'s MIRRORED
     * rule to find. What the two flanks do NOT share is a position, and that
     * is the whole difference between the two plates.
     *
     * Nose-to-tail still reads nose-to-tail on both sides, because both pairs
     * keep the same z stations: the name is forward of the figure in the
     * aeroplane's own frame, so it is on the viewer's right from one flank and
     * his left from the other, exactly as a real aeroplane's two sides do it.
     *
     * WHERE, ALONG THE FUSELAGE. Forward of the wing and under the flight
     * deck, which is both the authentic station and the only clear skin: the
     * wing box runs z -1.9 to +2.5 across the whole span at y 0.79..1.41, so
     * anything aft of z 2.5 lives in permanent shadow under thirty-three metres
     * of wing — which is exactly where the old placeholder plate sat, at z 1.4.
     * Forward, the pilot's side window starts at z 6.40. That leaves z 2.6..6.4
     * of open aluminium, and the racing stripe is masked off across all of it
     * (see the `gaps` table above) the way a paint shop masks a nose-art bay.
     *
     * WHICH SITS WHERE, AND THE GAP. The name goes FORWARD of the figure and
     * the figure aft of it, reading nose-to-tail the way an aeroplane's name
     * is read — the arrangement the Enola Gay herself carried, her name painted
     * forward under the pilot's window. Stacking them instead was measured and
     * does not fit: the name is 0.77 m tall at this width and the figure 1.50,
     * and 2.5 m of stack does not go into a fuselage 3.4 m deep once the
     * chamfered corners, the wing root and the stripe have taken their share.
     * They are TOP-ALIGNED at y 0.95 so the pairing reads as one piece of
     * signwriting, and the gap between them is 0.34 m — 18% of the pin-up's
     * height, mid-range of the "close together but not touching" the owner
     * asked for, and wide enough to survive being seen from an angle.
     *
     * The sizes came off the first set of walkaround photographs rather than
     * off a ruler. At 1.50 m the figure was the smaller half of the pair and
     * the block floated high on a flank 3.4 m deep with a metre and a quarter
     * of bare aluminium under it. She is 1.85 m now — the name deliberately did
     * NOT grow with her, because on a real aeroplane the figure is the picture
     * and the name is the caption — and the whole block came down 0.10 m, which
     * also brings it nearer the eyeline of a man standing on the tarmac looking
     * up at a bomber on three metres of undercarriage. */
    this.parts.noseArt = [];
    /**
     * One painting, on one flank.
     *
     * `sx` is the only thing that differs between the two copies, and it moves
     * the plate and turns it — it never scales it. At `sx * DECAL_X` turned
     * `sx * PI/2` the plate faces outboard and its own +X (the texture's u)
     * runs to the viewer's right on either side; see the WHICH SIDE note above
     * for the derivation. Both plates are built from `new PlaneGeometry` per
     * plate rather than the cached `planeGeo()`, because `applyNoseArt()`
     * replaces each one's geometry when the real ink is measured.
     */
    const artPlate = (name, w, h, y, z, sx) => {
      const plate = flatMesh(
        new THREE.PlaneGeometry(w, h),
        mat({ roughness: 0.82, metalness: 0.05, transparent: true, alphaTest: 0.04, unique: true }),
        sx * DECAL_X, y, z,
      );
      plate.rotation.y = sx * (Math.PI / 2);
      plate.name = name;
      plate.userData.geometryGate = { checkSupport: false };
      g.add(plate);
      this.parts.noseArt.push(plate);
      return plate;
    };

    /* The layout, kept on the instance because `applyNoseArt()` re-runs it once
     * the real ink has been measured. Only the two HEIGHTS and the gap are
     * given; every width comes from the painting's own aspect, and the name is
     * then pushed forward off the pin-up's finished edge. So "close together
     * but not touching" is arithmetic rather than a pair of hand-tuned numbers
     * that a re-export at a different crop would quietly break. */
    this.noseArtLayout = {
      top: 0.95,          // both plates' upper edge — the alignment that reads
      pinupH: 1.85,       // about what a real B-29 pin-up stood
      nameH: 1.42 / 2.024,  // 1.42 m wide at the delivered 2.03:1
      gap: 0.34,          // 18% of the pin-up's height: the owner's "not touching"
      pinupZ: 3.40,       // clear of the wing leading edge at z 2.50
    };
    const L = this.noseArtLayout;
    const PINUP_H = L.pinupH;
    const PINUP_W = PINUP_H * 0.731;          // livery.js's measured ink aspect
    const ART_TOP = L.top;
    const NAME_H = L.nameH;
    const NAME_W = NAME_H * 2.024;

    const pinupZ = L.pinupZ;                  // spans z 2.72 .. 4.08
    const nameZ = pinupZ + PINUP_W / 2 + L.gap + NAME_W / 2;   // 5.13: z 4.42 .. 5.84

    /* The pin-up starts hidden and is shown the moment its painting lands.
     * There is no drawn stand-in for it, deliberately: a hand-drawn pin-up
     * standing in for the owner's own would be worse than bare aluminium, and
     * bare aluminium is what an aeroplane waiting for its nose art looks like.
     * The NAME plate does carry a stand-in, so the aeroplane is never anonymous
     * — the same contract `../livery.js`'s crest placeholder keeps. Each plate
     * gets its OWN stand-in canvas, because each has its own material and
     * `applyCrest()` disposes the map it replaces. */
    this.parts.noseArtPlates = [];
    this.parts.noseNamePlates = [];
    for (const sx of [-1, 1]) {
      const pinup = artPlate('enola-squatch-nose-art', PINUP_W, PINUP_H, ART_TOP - PINUP_H / 2, pinupZ, sx);
      pinup.visible = false;
      Object.assign(pinup.userData, {
        noseArtRole: 'pinup', noseArtSide: sx, ownerArtworkApplied: false,
      });
      const namePlate = artPlate('enola-squatch-nose-name', NAME_W, NAME_H, ART_TOP - NAME_H / 2, nameZ, sx);
      namePlate.material.map = noseNamePlaceholderTexture();
      namePlate.material.needsUpdate = true;
      Object.assign(namePlate.userData, {
        noseArtRole: 'name', noseArtSide: sx, ownerArtworkApplied: false,
      });
      this.parts.noseArtPlates.push(pinup);
      this.parts.noseNamePlates.push(namePlate);
    }

    /** The -X pair, under the singular names the rest of the code still uses. */
    [this.parts.noseArtPlate] = this.parts.noseArtPlates;
    [this.parts.noseNamePlate] = this.parts.noseNamePlates;
    /** Kept under its old name too — the plate IS the nose art now. */
    this.parts.titlePlate = this.parts.noseNamePlate;

    /* Fire-and-forget, exactly like the club crest: the aeroplane is built
     * synchronously at boot and the paintings decode whenever they decode.
     * `applyNoseArt()` is what actually repaints, and it is idempotent, so the
     * console helper in `../main.js` may call it again without harm. */
    this.noseArtLoadState = 'loading';
    this.artReady = Promise.all([noseArtTexture('pinup'), noseArtTexture('name')])
      .then(([pin, nom]) => this.applyNoseArt(pin, nom))
      .then((count) => {
        this.noseArtLoadState = 'ready';
        return count;
      })
      .catch((error) => {
        this.noseArtLoadState = 'failed';
        this.noseArtLoadError = error?.message || String(error);
        return 0;
      });

    /* ---- The Silver Sasquatches crest ----
     *
     * Owner playtest: "Aircraft is nice. Needs Squatch logo." The club's own
     * artwork already exists and is already wired — `assets/art/logo-crest.png`
     * through `src/world/gear.js`'s `crest.round` slot, the same file Big
     * Uncle Lou has framed in his office at the Bing. No new art, no new
     * manifest slot: the composition root resolves that slot and hands the
     * texture to `applyClubLogo()` below.
     *
     * FOUR places, which is where a squadron actually puts its badge: both
     * faces of the fin, and under the cockpit on BOTH sides of the nose.
     *
     * The -X nose badge replaced a drawing. Owner playtest, 2026-08-04: "The
     * squatch head on towards the front of the plane — lets use the Squatch
     * logo." That head was a drawn-from-scratch Sasquatch face on its own
     * canvas, a second piece of club artwork living next to the real one for
     * no reason; it is gone, and the club's actual crest stands in its place.
     *
     * 2026-08-05: it moved forward, from z 4.3 to z 6.6, and came down from
     * 1.75 m to 1.30. It used to be the largest thing on this flank because it
     * was the only thing on it; the flank now carries the aeroplane's own name
     * and her pin-up, and z 4.3 is where the name plate goes. Under the
     * pilot's window, forward of the artwork, is where a squadron badge belongs
     * anyway — it is a badge again instead of the headline act.
     *
     * 2026-08-06: the OTHER nose badge made the same move, for the same
     * reason. It was still at z 4.0 at 1.35 m, sized and placed for a flank
     * that had nothing else on it; the artwork now on that flank runs
     * z 2.72..5.84, straight through it. Both are 1.30 m at z 6.75 now, which
     * also makes the nose symmetrical — the pair are one badge on two sides
     * rather than two different badges. y 0.05 keeps each one's top edge
     * (y 0.70) under the cockpit side glazing, which spans y 0.80..1.50 at
     * z 6.40..7.90 on BOTH sides and would otherwise show through it.
     *
     * Until the texture resolves they carry the drawn placeholder
     * `resolveGear` falls back to, so no surface is ever blank. */
    this.parts.clubLogo = [];
    const logoMat = () => mat({
      map: crestPlaceholderTexture(), roughness: 0.8, transparent: true, alphaTest: 0.02, unique: true,
    });
    for (const sx of [-1, 1]) {
      const finBadge = flatMesh(planeGeo(1.5, 1.5), logoMat(), sx * 0.2, 3.1, -FUSE_LEN / 2 - 4.3);
      finBadge.rotation.y = sx * (Math.PI / 2);
      finBadge.name = 'club-crest-fin';
      finBadge.userData.geometryGate = { checkSupport: false };
      g.add(finBadge);
      this.parts.clubLogo.push(finBadge);
    }
    // Forward of the nose art, under the pilot's window, on both sides.
    for (const sx of [-1, 1]) {
      const noseBadge = flatMesh(planeGeo(1.30, 1.30), logoMat(), sx * DECAL_X, 0.05, 6.75);
      noseBadge.rotation.y = sx * (Math.PI / 2);
      noseBadge.name = 'club-crest-nose';
      noseBadge.userData.geometryGate = { checkSupport: false };
      g.add(noseBadge);
      this.parts.clubLogo.push(noseBadge);
    }

    /* ---- Landing gear: fixed tricycle, scaled up ----
     *
     * Owner playtest, 2026-08-04: "the wheels aren't attached thro struts or
     * anything." They were not. Each leg was a 1.2 m box hung at
     * `-(gearY - 1.2 - r)`, which for the mains put the TOP of the strut at
     * y -0.74 — a metre and a half of clear air between it and the underside
     * of the wing at y 0.79, with nothing in between. The wheels genuinely
     * were floating below the aeroplane.
     *
     * The fix is the structure that was missing, not a longer box: a gear bay
     * fairing on the wing (or the nose skin) that the leg comes OUT of, a
     * trunnion at the top of the leg, and a drag brace and a side brace from
     * the bay down to the axle — the three members that hold a fixed leg on a
     * real aeroplane. `attachY` is the underside of whatever each leg hangs
     * from, so the bay and the braces are derived from the airframe rather
     * than typed in twice.
     *
     * The leg group still compresses on the oleo (`update()` writes
     * `leg.position.y`), so everything inside it moves with the squash and
     * everything bolted to the airframe — the bay, the fairing — does not,
     * which is exactly the right split. */
    this.parts.gear = [];
    const WING_UNDER = 1.1 - 0.31;          // wing box centre 1.1, 0.62 thick
    /* The nose tyre came down from 0.72 m to 0.60 m of radius on the way past.
     * The belly is only `gearY - FUSE_H/2` = 1.3 m off the tarmac at that
     * station, so a 1.44 m tyre could not physically fit under it — the old
     * one stood 0.14 m THROUGH the fuselage floor, which is the nose end of
     * the same "clipping and intersecting" the owner called out inside. At
     * 0.60 the tyre's crown sits at y -1.80, a clear 0.10 m below the skin. */
    const legSpecs = [
      { x: 0, z: FUSE_LEN / 2 - 1.3, r: 0.6, steer: true, attachY: BELLY_Y + 0.25 },
      { x: -AC_ENOLA.track / 2, z: -1.2, r: 1.06, steer: false, attachY: WING_UNDER },
      { x: AC_ENOLA.track / 2, z: -1.2, r: 1.06, steer: false, attachY: WING_UNDER },
    ];
    legSpecs.forEach((spec, i) => {
      const gearName = spec.steer ? 'nose' : spec.x > 0 ? 'port' : 'starboard';
      const gearAssembly = group(`gear-assembly-${gearName}`);
      gearAssembly.userData.geometryGate = { assemblyId: `enola-aircraft:gear-${gearName}` };
      g.add(gearAssembly);
      const leg = new THREE.Group();
      leg.name = `gear-leg-${spec.steer ? 'nose' : spec.x > 0 ? 'port' : 'starboard'}`;
      /* The axle sits `gearY - r` below the aeroplane's origin; the strut runs
       * from there up to the trunnion just inside the bay. Both numbers come
       * off `attachY` now instead of the old fixed 1.2 m. */
      const axleY = -(AC_ENOLA.gearY - spec.r);
      const trunnionY = spec.attachY - 0.18;
      leg.position.set(spec.x, trunnionY, spec.z);
      const strutLen = trunnionY - axleY;    // 2.55 m on the mains, 0.77 on the nose

      /* Gear bay: a shallow fairing bolted to the airframe, so the leg comes
       * out of a hole in a structure instead of out of thin air. Not in the
       * leg group — it does not move when the oleo compresses. */
      const bay = mesh(boxGeo(0.86, 0.4, 1.5), skin, spec.x, spec.attachY - 0.16, spec.z);
      bay.name = `gear-bay-${spec.steer ? 'nose' : spec.x > 0 ? 'port' : 'starboard'}`;
      // Each gear assembly hangs from this fixed airframe fairing. The leg and
      // braces remain ordinary audited geometry below the exact mount.
      bay.userData.geometryGate = { fixedSupportAnchor: true };
      gearAssembly.add(bay);
      gearAssembly.add(mesh(cylGeo(0.44, 0.44, 1.5, 12, true), skin, spec.x, spec.attachY - 0.16, spec.z)
        .rotateX(Math.PI / 2));
      // The trunnion the leg pivots on, at the mouth of the bay.
      leg.add(mesh(cylGeo(0.13, 0.13, 0.62, 10), metal, 0, 0, 0).rotateZ(Math.PI / 2));

      // The main strut, and the polished oleo sliding inside its lower half.
      leg.add(mesh(boxGeo(0.3, strutLen, 0.3), metal, 0, -strutLen / 2, 0));
      leg.add(mesh(cylGeo(0.16, 0.16, strutLen * 0.45, 10), solid(0xc8ccd2, { roughness: 0.25, metalness: 0.85 }), 0, -strutLen * 0.76, 0));
      // Scissor link across the sliding joint.
      leg.add(mesh(boxGeo(0.05, 0.42, 0.08), metal, 0, -strutLen * 0.5, 0.2).rotateX(0.5));
      leg.add(mesh(boxGeo(0.05, 0.42, 0.08), metal, 0, -strutLen * 0.72, 0.2).rotateX(-0.5));

      /* Drag brace, fore-and-aft, and — on the mains — a side brace out to the
       * wing. These are what "attached through struts" means: both ends land
       * on something, one on the bay and one on the axle. */
      const dragZ = spec.steer ? -0.62 : 0.62;
      leg.add(strutBetween(metal, [0, 0.02, dragZ], [0, -strutLen + 0.1, 0], 0.065, 'gear-drag-brace'));
      if (!spec.steer) {
        const out = spec.x > 0 ? 1 : -1;
        leg.add(strutBetween(metal, [out * 0.75, 0.02, 0], [0, -strutLen + 0.1, 0], 0.06, 'gear-side-brace'));
        // Torque link back up into the bay, visible from directly abeam.
        leg.add(strutBetween(metal, [0, 0.02, -0.55], [0, -strutLen * 0.55, -0.16], 0.045, 'gear-torque-link'));
      }

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
        // The axle beam the pair share.
        leg.add(mesh(cylGeo(0.09, 0.09, 1.1, 8), metal, spec.x > 0 ? 0.26 : -0.26, -strutLen, 0).rotateZ(Math.PI / 2));
      }
      gearAssembly.add(leg);
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
    const doorMidY = (CREW_DOOR_SILL_Y + CREW_DOOR_TOP_Y) / 2;
    const doorHeight = CREW_DOOR_TOP_Y - CREW_DOOR_SILL_Y;
    const doorFrame = group('crew-door-frame');
    for (const [name, y] of [
      ['sill', CREW_DOOR_SILL_Y - 0.035],
      ['header', CREW_DOOR_TOP_Y + 0.035],
    ]) {
      const rail = mesh(boxGeo(0.06, 0.07, 1.05), trim, -PANEL_X, y, -3.4);
      rail.name = `crew-door-frame-${name}`;
      if (name === 'sill') rail.userData.geometryGate = { fixedSupportAnchor: true };
      doorFrame.add(rail);
    }
    for (const [name, z] of [['aft', -3.9], ['forward', -2.9]]) {
      const jamb = mesh(boxGeo(0.06, doorHeight, 0.07), trim, -PANEL_X, doorMidY, z);
      jamb.name = `crew-door-frame-${name}-jamb`;
      doorFrame.add(jamb);
    }
    g.add(doorFrame);

    /* A real side-hinged leaf. Closed, it occupies exactly the cut aperture;
     * open, it swings outboard around the aft jamb and leaves a person-sized
     * route from the ladder into the cabin. */
    const doorHinge = group('crew-door-hinge');
    doorHinge.position.set(-PANEL_X - 0.05, doorMidY, -3.8);
    const doorPanel = mesh(boxGeo(0.05, doorHeight, 0.8), patch, 0, 0, 0.4);
    doorPanel.name = 'crew-door-leaf';
    doorHinge.add(doorPanel);
    doorPanel.add(mesh(boxGeo(0.06, 0.09, 0.26), metal, -0.03, -0.1, 0.24));
    doorPanel.add(rivets());
    g.add(doorHinge);
    // "CREW ENTRY" stencilled over the sill — the door has to be findable.
    const doorStencil = flatMesh(
      planeGeo(0.86, 0.28),
      mat({
        map: signTexture(['CREW ENTRY'], { w: 512, h: 160, bg: '#d8d2de', fg: '#241a3a', border: '#4a2f8f', rough: true }),
        roughness: 0.85, transparent: true, unique: true,
      }),
      -0.031, 0.72 - doorMidY, 0.4,
    );
    doorStencil.rotation.y = -Math.PI / 2;
    doorHinge.add(doorStencil);
    this.parts.crewDoorFrame = doorFrame;
    this.parts.crewDoorHinge = doorHinge;
    this.parts.crewDoor = doorPanel;
    this.crewDoorOpen = false;
    this.anchors.crewDoor = new THREE.Vector3(-FUSE_W / 2 - 0.6, -0.6, -3.4);
    this.anchors.stepDown = new THREE.Vector3(-FUSE_W / 2 - 3.4, 0, -3.4);
    /* ---- Boarding ladder, hooked over the sill ----
     *
     * Owner playtest, 2026-08-04: "Crew entry ladder a little funky." Three
     * separate things were wrong with it and all three are geometry:
     *
     *  - It did not reach the ground. The rails were 2.2 m long centred at
     *    y -1.1, so the feet stopped at y -2.2 — and the tarmac is at
     *    `-AC_ENOLA.gearY`, i.e. y -3.0. It hung 0.8 m in the air.
     *  - It overshot the door. The top ended at y 0.0, a metre above the
     *    door panel's own top edge at y 0.40, standing past the frame.
     *  - It leaned the wrong way. `rotation.z = +0.16` on a +Y cylinder takes
     *    the TOP outboard and tucks the FOOT under the fuselage; a ladder
     *    leans the other way round or you cannot stand on it.
     *
     * Rebuilt off the two heights it actually has to join: the door sill
     * (y -1.15, the bottom of `doorPanel`) and the tarmac. The whole assembly
     * is one group raked out at the bottom, so the rails, the treads and the
     * feet cannot drift out of line with each other. */
    const SILL_Y = CREW_DOOR_SILL_Y;
    const LADDER_RAKE = -0.22;           // rad; negative takes the FOOT outboard
    const LADDER_LEN = (SILL_Y - (-AC_ENOLA.gearY)) / Math.cos(LADDER_RAKE);
    const ladder = group('boarding-ladder');
    ladder.position.set(-PANEL_X - 0.16, SILL_Y, -3.4);
    ladder.rotation.z = LADDER_RAKE;
    for (const sz of [-0.26, 0.26]) {
      const rail = mesh(cylGeo(0.045, 0.045, LADDER_LEN, 7), metal, 0, -LADDER_LEN / 2, sz);
      rail.name = 'boarding-ladder-rail';
      ladder.add(rail);
      // A rubber foot, so it stands ON the tarmac rather than in it.
      ladder.add(mesh(cylGeo(0.075, 0.09, 0.06, 8), solid(0x1e2024, { roughness: 0.95 }), 0, -LADDER_LEN + 0.03, sz));
    }
    // Treads: flat rungs you could put a boot on, evenly up the whole rail.
    for (let i = 1; i <= 6; i++) {
      const ry = -LADDER_LEN * (i / 7);
      const tread = mesh(boxGeo(0.1, 0.045, 0.58), metal, 0, ry, 0);
      tread.name = 'boarding-ladder-tread';
      ladder.add(tread);
    }
    // The hooks that hold it on the sill, and the handrail above them.
    for (const sz of [-0.26, 0.26]) {
      ladder.add(mesh(boxGeo(0.24, 0.05, 0.06), metal, 0.09, 0.02, sz));
      ladder.add(mesh(cylGeo(0.035, 0.035, 0.5, 6), metal, 0, 0.25, sz));
    }
    ladder.add(mesh(boxGeo(0.05, 0.05, 0.58), metal, 0, 0.48, 0));
    g.add(ladder);
    this.parts.ladder = ladder;

    // ---- Dorsal turret and two waist blisters ----
    // Not manned — they are what makes the tail gun read as one station on a
    // bomber rather than the only gun on a cargo plane.
    const dorsal = group('dorsal-turret');
    /* A roof opening cannot pass through the main-wing carry-through. The old
     * z=-0.9 station sat over the 4.4 m wing slab, so even after cutting the
     * skin there was solid structure directly under the cup. Mount it behind
     * the wing's -1.9 m trailing edge, with a full dome-radius margin. */
    dorsal.position.set(0, FUSE_H / 2 + 0.3, DORSAL_TURRET_Z);
    const dorsalBase = mesh(cylGeo(0.62, 0.68, 0.42, 14, true), trim, 0, 0, 0);
    dorsalBase.name = 'dorsal-turret-ring';
    dorsalBase.userData.geometryGate = { overlap: false, fixedSupportAnchor: true };
    dorsal.add(dorsalBase);
    const dorsalGlass = mesh(sphereGeo(0.6, 12, 8), glassMat, 0, 0.12, 0);
    dorsalGlass.name = 'dorsal-turret-glazing';
    dorsalGlass.userData.geometryGate = { overlap: false };
    dorsal.add(dorsalGlass);
    const dorsalGun = mesh(cylGeo(0.045, 0.045, 1.2, 6), metal, 0, 0.16, 0.7);
    dorsalGun.rotation.x = Math.PI / 2 - 0.25;
    dorsal.add(dorsalGun);
    g.add(dorsal);
    this.parts.dorsalTurret = dorsal;
    for (const sx of [-1, 1]) {
      const blister = mesh(sphereGeo(0.55, 12, 8), glassMat, sx * (FUSE_W / 2 - 0.05), -0.2, -5.4);
      blister.scale.set(0.6, 1, 1.1);
      blister.castShadow = false;
      blister.name = `waist-blister-${sx < 0 ? 'starboard' : 'port'}`;
      blister.userData.geometryGate = { overlap: false, checkSupport: false };
      g.add(blister);
    }

    // Aerials, pitot mast and the astrodome over the navigator.
    // Route the aerial along the port roof edge so it does not pass through
    // the centreline astrodome and dorsal turret.
    const aerialTop = mesh(cylGeo(0.03, 0.03, 1.5, 5), metal, 0.85, FUSE_H / 2 + 0.75, 3.6);
    aerialTop.name = 'aerial-mast';
    aerialTop.userData.geometryGate = { assemblyId: 'enola-aircraft:fuselage-shell' };
    g.add(aerialTop);
    const wire = mesh(cylGeo(0.016, 0.016, 9.4, 4), solid(0x1a1a1c, { roughness: 1 }), 0.85, FUSE_H / 2 + 1.1, -1.2);
    wire.name = 'aerial-wire';
    wire.rotation.x = Math.PI / 2 - 0.22;
    g.add(wire);
    // Moved outboard and aft onto the cone's flank: at its old station it stood
    // inside the (now bigger) glasshouse instead of out in the airflow.
    const pitot = mesh(cylGeo(0.03, 0.03, 0.9, 5), metal, -1.45, -0.75, FUSE_LEN / 2 + 2.0);
    pitot.rotation.x = Math.PI / 2;
    pitot.name = 'pitot-mast';
    pitot.userData.geometryGate = { checkSupport: false };
    g.add(pitot);
    /* Ahead of the wing's 2.5 m leading edge. At z=2.4 the glass and both
     * roof cuts were real, but the main-wing slab still sealed the opening
     * 0.27 m below it. */
    const astrodome = mesh(sphereGeo(0.34, 10, 7), glassMat, 0, FUSE_H / 2 + 0.05, ASTRODOME_Z);
    astrodome.scale.y = 0.7;
    astrodome.castShadow = false;
    astrodome.name = 'navigator-astrodome';
    astrodome.userData.geometryGate = { overlap: false, checkSupport: false };
    g.add(astrodome);

    /* Inside the glasshouse now that there is an inside — see the nose-cone
     * note above. `crew.js` sits Numbskull off this, so the two cannot drift. */
    this.anchors.bombardierStation = new THREE.Vector3(0, -0.5, FUSE_LEN / 2 + 3.4);

    // Navigation lights.
    this.parts.navLights = [];
    for (const [sx, color] of [[-1, 0xff2a1e], [1, 0x37ff6a]]) {
      const lamp = flatMesh(sphereGeo(0.14), unlit(color), sx * (halfSpan - 0.4), 1.14, 0.3);
      lamp.name = `navigation-light-${sx < 0 ? 'starboard' : 'port'}`;
      wingStructure.add(lamp);
      this.parts.navLights.push(lamp);
    }
    const beacon = flatMesh(sphereGeo(0.15), unlit(0xff4a2a), 0, 5.4, -FUSE_LEN / 2 - 4.4);
    beacon.name = 'tail-beacon';
    tailStructure.add(beacon);
    this.parts.beacon = beacon;

    this.buildRearGun(g, { skin, trim, metal, glassMat });
  }

  /** Put the crew-entry leaf in its exact closed or boarding position. */
  setCrewDoorOpen(open) {
    this.crewDoorOpen = !!open;
    if (this.parts.crewDoorHinge) {
      this.parts.crewDoorHinge.rotation.y = this.crewDoorOpen ? -Math.PI / 2 : 0;
    }
    return this.crewDoorOpen;
  }

  /**
   * Resolve the on-foot capsule against the parked airframe in aircraft-local
   * space. This is intentionally the inhabited fuselage only—not one giant
   * aircraft AABB—so wings, landing gear and the open payload bay retain their
   * authored walk-under routes.
   */
  resolveWalkaroundPlayer(player, axis, radius = 0.3, {
    bombBayOpen = false,
    crewDoorOpen = this.crewDoorOpen,
  } = {}) {
    this.group.updateWorldMatrix(true, false);
    _walkLocal.copy(player.position);
    this.group.worldToLocal(_walkLocal);
    const eyeLocal = _walkLocal.y;
    const feetLocal = eyeLocal - (player.eyeHeight ?? 1.66);
    const shellBottom = -FUSE_H / 2;
    const shellTop = FUSE_H / 2;
    if (eyeLocal + 0.05 < shellBottom || feetLocal > shellTop) return false;

    const halfW = FUSE_W / 2;
    const halfL = FUSE_LEN / 2;
    if (Math.abs(_walkLocal.z) > halfL + radius || Math.abs(_walkLocal.x) > halfW + radius) return false;

    const inOpenBay = bombBayOpen
      && Math.abs(_walkLocal.x) < BAY_WIDTH / 2 - radius
      && _walkLocal.z > BAY_Z - BAY_LEN / 2 + radius
      && _walkLocal.z < BAY_Z + BAY_LEN / 2 - radius
      && eyeLocal <= CABIN_FLOOR_TOP;
    const inOpenDoor = crewDoorOpen
      && _walkLocal.x < 0
      && feetLocal >= CREW_DOOR_SILL_Y - 0.05
      && eyeLocal <= CREW_DOOR_TOP_Y + 0.05
      && _walkLocal.z > -3.8 + radius
      && _walkLocal.z < -3.0 - radius;
    if (inOpenBay || inOpenDoor) return false;

    const outX = halfW + radius;
    const outZ = halfL + radius;
    /* Player resolves one WORLD axis at a time, but this parked aircraft is
     * normally yawed 90 degrees. Treating the incoming `axis` string as an
     * aircraft-local axis ejected a diagonal approach to the crew door toward
     * the tail on the second half of every movement frame. Resolve the actual
     * local OBB by its shallowest penetration instead; that is independent of
     * heading and leaves the other local component free to slide along skin. */
    const xPenetration = outX - Math.abs(_walkLocal.x);
    const zPenetration = outZ - Math.abs(_walkLocal.z);
    const inverse = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    _walkVelocity.copy(player.velocity).transformDirection(inverse);
    if (xPenetration <= zPenetration) {
      const side = _walkLocal.x < 0 || (_walkLocal.x === 0 && _walkVelocity.x < 0) ? -1 : 1;
      _walkLocal.x = side * outX;
      _walkVelocity.x = 0;
    } else {
      const side = _walkLocal.z < 0 || (_walkLocal.z === 0 && _walkVelocity.z < 0) ? -1 : 1;
      _walkLocal.z = side * outZ;
      _walkVelocity.z = 0;
    }
    player.velocity.copy(_walkVelocity).transformDirection(this.group.matrixWorld);
    void axis;
    _walkWorld.copy(_walkLocal);
    this.group.localToWorld(_walkWorld);
    player.position.copy(_walkWorld);
    return true;
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
    /* The cup must sit behind the rudder/elevator envelope. At the former
     * -6.6 station its 1.72 m-wide glazing occupied all four fixed/moving tail
     * surfaces; only the tapered fairing is allowed to run forward into the
     * tail structure. */
    /* The fairing's former forward lip shared 120 mm of the neutral rudder
     * and 56.1 mm of the raised elevator. Carry the complete station one metre
     * aft: its forward lip now meets the tail-control envelope across a real
     * 0.20 m service seam instead of occupying it. */
    const Z = -FUSE_LEN / 2 - 9.75;
    station.position.set(0, 0.05, Z);
    g.add(station);
    this.parts.rearGunStation = station;

    // The fairing that carries the turret, faired into the boom.
    const shell = mesh(cylGeo(0.62, 0.9, 1.6, 14), skin, 0, 0, 0.85);
    shell.rotation.x = Math.PI / 2;
    shell.name = 'rear-gun-fairing';
    // Open fairing around the gunner; the cylinder AABB fills its crew cavity.
    shell.userData.geometryGate = { overlap: false, fixedSupportAnchor: true };
    station.add(shell);
    // Armour annulus behind the gunner's back. This must be a ring, not the
    // capped horizontal cylinder that used to plate over the firing opening.
    const armourRing = mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 24), trim, 0, 0, 0.1);
    armourRing.name = 'rear-gun-armour-ring';
    armourRing.userData.geometryGate = { overlap: false };
    station.add(armourRing);

    /* The traversing part. `rotation.y` is traverse; the yoke inside it takes
     * elevation on `rotation.x`, which is the only way the two axes stay
     * independent when the mission points the gun at something. */
    const turret = group('rear-gun-turret');
    turret.position.set(0, 0, -0.15);
    station.add(turret);
    this.parts.rearGunTurret = turret;

    // Glazing: a hemisphere open toward the tail, with framing.
    const dome = mesh(sphereGeo(0.86, 16, 12), glassMat, 0, 0, 0);
    dome.name = 'rear-gun-glazing';
    dome.castShadow = false;
    dome.userData.geometryGate = { overlap: false };
    turret.add(dome);
    /* Curved glazing frames hug the bubble. The old pair were straight 1.74 m
     * rods through its centre, and the down-traverse sightline hit one before
     * leaving the cup. Offset meridians plus an equator retain a readable
     * cage while leaving the gunner's firing cone open. */
    for (const [name, rotateX, rotateY] of [
      ['equator', Math.PI / 2, 0],
      ['meridian-left', 0, Math.PI / 4],
      ['meridian-right', 0, -Math.PI / 4],
    ]) {
      const rib = mesh(new THREE.TorusGeometry(0.88, 0.022, 6, 28), trim, 0, 0, 0);
      rib.name = `rear-gun-frame-${name}`;
      rib.userData.geometryGate = { overlap: false };
      rib.rotation.x = rotateX;
      rib.rotation.y = rotateY;
      turret.add(rib);
    }
    const glazingRing = mesh(new THREE.TorusGeometry(0.82, 0.05, 8, 28), trim, 0, 0, 0.15);
    glazingRing.name = 'rear-gun-glazing-ring';
    glazingRing.userData.geometryGate = { overlap: false };
    turret.add(glazingRing);

    // The yoke: what the barrels are actually bolted to.
    const yoke = group('rear-gun-yoke');
    /* Keep the elevation pivot ahead of and above the gunner's folded legs.
     * At the former y=-0.06/z=-0.30 datum, full up-elevation swept both
     * barrels through his shins and boots. This measured datum clears the
     * complete body at the real -0.38..+0.58 control limits while putting the
     * hand controls back at his wrists. */
    yoke.position.set(0, 0.1, -0.5);
    turret.add(yoke);
    this.parts.rearGunYoke = yoke;
    /* Two side trunnions carry the barrels. A single 0.62 m cross-block put
     * opaque steel across the central gun sight at full down elevation. */
    for (const sx of [-1, 1]) {
      const trunnion = mesh(boxGeo(0.18, 0.16, 0.2), trim, sx * 0.22, 0, 0);
      trunnion.name = `rear-gun-${sx < 0 ? 'left' : 'right'}-trunnion`;
      yoke.add(trunnion);
    }

    this.parts.gunFlash = [];
    this.parts.gunBarrels = [];
    for (const sx of [-1, 1]) {
      const barrel = mesh(cylGeo(0.055, 0.07, 1.9, 8), metal, sx * 0.21, 0, -0.95);
      barrel.name = `rear-gun-${sx < 0 ? 'left' : 'right'}-barrel`;
      barrel.rotation.x = Math.PI / 2;
      yoke.add(barrel);
      this.parts.gunBarrels.push(barrel);
      // Perforated cooling jacket.
      const jacket = mesh(cylGeo(0.1, 0.1, 0.8, 10), trim, sx * 0.21, 0, -0.55);
      jacket.name = `rear-gun-${sx < 0 ? 'left' : 'right'}-cooling-jacket`;
      jacket.rotation.x = Math.PI / 2;
      yoke.add(jacket);
      // Ammunition can and the belt going into it.
      const ammoCan = mesh(boxGeo(0.22, 0.26, 0.34), solid(0x4a5240, { roughness: 0.95 }), sx * 0.52, -0.02, 0.28);
      ammoCan.name = `rear-gun-${sx < 0 ? 'left' : 'right'}-ammo-can`;
      yoke.add(ammoCan);
      const belt = mesh(boxGeo(0.06, 0.05, 0.44), solid(0xa8873a, { roughness: 0.6, metalness: 0.5 }), sx * 0.39, -0.02, 0.1);
      belt.name = `rear-gun-${sx < 0 ? 'left' : 'right'}-ammo-belt`;
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
      /* Put the handles on an arc both of Shubes' articulated arms can reach
       * at every elevation stop. The former low pivot forced the full-up grip
       * 318 mm past a two-segment human arm even with both joints straight. */
      const grip = mesh(boxGeo(0.05, 0.24, 0.06), solid(0x241c16, { roughness: 1 }), sx * 0.31, 0.08, 0.5);
      grip.name = 'rear-gun-spade-grip';
      yoke.add(grip);
    }
    // Brass chute out of the belly of the fairing, and the spent-case bag.
    const chute = mesh(boxGeo(0.28, 0.1, 0.5), trim, 0, -0.42, 1.3);
    chute.name = 'rear-gun-brass-chute';
    station.add(chute);
    const caseBag = mesh(boxGeo(0.34, 0.36, 0.42), solid(0x4a4238, { roughness: 1 }), 0, -0.66, 1.45);
    caseBag.name = 'rear-gun-case-bag';
    station.add(caseBag);

    // The seat, and the point a seated gunner's hips go.
    const rearSeatMount = group('rear-gun-seat-mount');
    rearSeatMount.position.set(0, -0.47, 0.7);
    turret.add(rearSeatMount);
    this.parts.rearGunSeatMount = rearSeatMount;
    const rearSeatPan = mesh(boxGeo(0.56, 0.14, 0.46), solid(0x3a3228, { roughness: 0.95 }), 0, 0, 0);
    rearSeatPan.name = 'rear-gun-seat-pan';
    // The traversing seat is bolted to its mount; keep occupant support split
    // from collision ownership while anchoring the furniture at the real pan.
    rearSeatPan.userData.geometryGate = { fixedSupportAnchor: true };
    rearSeatMount.add(rearSeatPan);
    const rearSeatBack = mesh(boxGeo(0.5, 0.52, 0.09), solid(0x3a3228, { roughness: 0.95 }), 0, 0.29, 0.25);
    rearSeatBack.name = 'rear-gun-seat-back';
    rearSeatMount.add(rearSeatBack);
    const rearGunEye = group('rear-gun-eye');
    rearGunEye.position.set(0, 0.87, -0.25);
    rearSeatMount.add(rearGunEye);
    this.parts.rearGunEye = rearGunEye;
    this.anchors.rearGunSeat = new THREE.Vector3(0, station.position.y - 0.47, Z + 0.55);
    /** Where the barrels leave the aeroplane, for tracer origins. */
    this.anchors.rearGunMuzzle = new THREE.Vector3(0, station.position.y - 0.01, Z - 2.4);
  }

  /** Current gunner eye after the traversing seat has followed the turret. */
  rearGunEyeWorld(out = new THREE.Vector3()) {
    this.parts.rearGunEye.updateWorldMatrix(true, false);
    return this.parts.rearGunEye.getWorldPosition(out);
  }

  /** Midpoint of the two visible muzzle flashes, after traverse/elevation. */
  rearGunMuzzleWorld(out = new THREE.Vector3()) {
    out.set(0, 0, 0);
    for (const flash of this.parts.gunFlash ?? []) {
      out.add(flash.getWorldPosition(new THREE.Vector3()));
    }
    return out.multiplyScalar(1 / Math.max(1, this.parts.gunFlash?.length ?? 0));
  }

  /** Current gunner eye expressed in the aeroplane frame. */
  rearGunEyeLocal(out = new THREE.Vector3()) {
    this.rearGunEyeWorld(out);
    return this.group.worldToLocal(out);
  }

  /**
   * Paint the club's real crest onto the four badges — both fin faces and
   * both sides of the nose.
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

  /**
   * Put the owner's own artwork on the flank.
   *
   * Called from `build()` when `../livery.js` finishes decoding, and safe to
   * call again. The paintings deliberately bypass the gear resolver: they need
   * their matte read, their glow put back, and their ink measured before they
   * can be sized onto a plane at all; `resolveGear` returns only a texture.
   *
   * Each plate is RESIZED to the painting it receives rather than the painting
   * being squeezed onto the plate. Both files are 2:3 portrait sheets and
   * neither piece of ink is 2:3, so trusting the file's shape would stretch
   * both. Height is what is held fixed — the two are top-aligned on
   * `noseArtLayout.top`, and that alignment is the thing worth keeping — while
   * width follows the measured aspect and the gap is then re-struck off the
   * finished widths, so "not touching" survives a re-export at a different
   * crop. The geometry is replaced rather than scaled: `box()`-style scale
   * writes are the trap this codebase already keeps a note about, and a
   * negative one would turn the plate inside out.
   *
   * BOTH FLANKS, since 2026-08-06. Each painting goes onto its two plates from
   * one prepared texture — the same `CanvasTexture`, shared, since the two
   * plates differ only in where they hang. The layout is struck ONCE off the
   * finished widths and written to both, so the two sides cannot drift apart
   * if a re-export ever changes a crop.
   *
   * @param {?{texture: THREE.Texture, aspect: number}} pinup
   * @param {?{texture: THREE.Texture, aspect: number}} name
   * @returns {number} plates repainted (0-4)
   */
  applyNoseArt(pinup, name = null) {
    const L = this.noseArtLayout;
    let n = 0;
    /* `pinup` may arrive as a bare texture from the old gear-slot route; the
     * measured aspect is the whole point, so fall back to the plate's own. */
    const asArt = (v, plate) => (v?.texture ? v
      : v?.isTexture ? { texture: v, aspect: plate.geometry.parameters.width / plate.geometry.parameters.height }
        : null);
    const fit = (plates, art, height) => {
      const first = plates?.[0];
      if (!first) return 0;
      if (!art?.texture) return first.geometry.parameters.width;
      const width = height * art.aspect;
      for (const plate of plates) {
        const geo = plate.geometry;
        if (Math.abs(geo.parameters.width - width) > 1e-4) {
          plate.geometry = new THREE.PlaneGeometry(width, height);
          geo.dispose();
        }
        applyCrest([plate], art.texture);
        // Top-aligned, whatever height each one ended up at.
        plate.position.y = L.top - height / 2;
        plate.visible = true;
        plate.userData.ownerArtworkApplied = true;
        n++;
      }
      return width;
    };

    const pinups = this.parts.noseArtPlates ?? [];
    const names = this.parts.noseNamePlates ?? [];
    const pinupW = fit(pinups, asArt(pinup, pinups[0] ?? this.parts.noseArtPlate), L.pinupH);
    const nameW = fit(names, asArt(name, names[0] ?? this.parts.noseNamePlate), L.nameH);
    /* Re-strike the gap off the finished widths. Forward is +Z: the name goes
     * ahead of the figure, one gap clear of her leading edge — on both flanks,
     * because both pairs sit at the same stations. */
    for (const plate of names) {
      plate.position.z = L.pinupZ + pinupW / 2 + L.gap + nameW / 2;
    }
    return n;
  }

  /**
   * Read-only nose-art telemetry from the plates themselves.
   *
   * The old debug seam counted an optional `resolveGear` slot that the scene
   * no longer uses, so it reported zero even while both delivered PNGs were
   * visible. This record deliberately derives pairing, paint ownership and
   * separation from live geometry/materials after `artReady` settles.
   */
  noseArtPresentation() {
    const pinups = this.parts.noseArtPlates ?? [];
    const names = this.parts.noseNamePlates ?? [];
    const describe = (plate) => {
      if (!plate) return null;
      const width = plate.geometry?.parameters?.width ?? 0;
      const height = plate.geometry?.parameters?.height ?? 0;
      return {
        name: plate.name,
        side: plate.userData.noseArtSide ?? Math.sign(plate.position.x),
        visible: plate.visible,
        textured: Boolean(plate.material?.map),
        ownerArtwork: Boolean(plate.userData.ownerArtworkApplied),
        width,
        height,
        x: plate.position.x,
        y: plate.position.y,
        z: plate.position.z,
        top: plate.position.y + height / 2,
      };
    };
    const sides = [-1, 1].map((side) => {
      const pinupPlate = pinups.find((plate) => plate.userData.noseArtSide === side);
      const namePlate = names.find((plate) => plate.userData.noseArtSide === side);
      const pinup = describe(pinupPlate);
      const name = describe(namePlate);
      const gap = pinup && name
        ? (name.z - name.width / 2) - (pinup.z + pinup.width / 2)
        : null;
      return {
        side,
        pinup,
        name,
        gap,
        topDelta: pinup && name ? Math.abs(pinup.top - name.top) : null,
        outboard: Boolean(pinupPlate && namePlate
          && Math.abs(pinupPlate.rotation.y - side * Math.PI / 2) < 1e-4
          && Math.abs(namePlate.rotation.y - side * Math.PI / 2) < 1e-4),
      };
    });
    const appliedCount = [...pinups, ...names]
      .filter((plate) => plate.userData.ownerArtworkApplied).length;
    const validGaps = sides.map(({ gap }) => gap).filter(Number.isFinite);
    const summarize = (plates) => ({
      count: plates.length,
      visible: plates.filter((plate) => plate.visible).length,
      textured: plates.filter((plate) => plate.material?.map).length,
      ownerArtwork: plates.filter((plate) => plate.userData.ownerArtworkApplied).length,
    });
    return {
      loadState: this.noseArtLoadState,
      loadError: this.noseArtLoadError,
      artReady: this.noseArtLoadState === 'ready',
      placeholderUp: pinups.length > 0,
      name: pinups[0]?.name ?? null,
      realArtworkApplied: appliedCount,
      expectedGap: this.noseArtLayout.gap,
      minimumGap: validGaps.length ? Math.min(...validGaps) : null,
      paired: sides.every(({ pinup, name, topDelta, outboard }) => Boolean(
        pinup && name && topDelta < 1e-4 && outboard
      )),
      noOverlap: validGaps.length === 2 && validGaps.every((gap) => gap > 1e-4),
      pinups: summarize(pinups),
      names: summarize(names),
      sides,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Cockpit                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * The inside of the aeroplane: a roof, a floor, wall liners, a rear
   * bulkhead, and the crew compartment aft of the flight deck.
   *
   * Owner playtest, 2026-08-04, two notes that are the same note:
   *   "There should be a roof. on it."
   *   "Interior could be outfitted a bit better for the guys behind you as
   *    well. One seat is working, but a lot of clipping and intersecting."
   *
   * There genuinely was no interior. The fuselage is one `boxGeo` with
   * front-facing materials, so from a seat inside it every wall, the floor and
   * the ceiling are back faces and get culled: looking up gave you open sky,
   * looking aft gave you the wing, the nacelles and both main wheels seen
   * straight through the side of the aeroplane you are sitting in. The four
   * seats and the nav table were furniture floating in a hole.
   *
   * So this builds the pressure-vessel side of the same box — a liner set
   * INSIDE the skin — plus the things a heavy bomber's crew compartment
   * actually has aft of the pilots. Cheap boxes, the same register as the rest
   * of the file, and every one of them named.
   *
   * Openings are deliberate and are why the ceiling is three panels rather
   * than one: the astrodome (z 2.4) and the dorsal turret (z -0.9) are holes
   * in the roof on the outside, so they are holes in the roof on the inside
   * too. The crew door (z -3.4, starboard) is a gap in that wall liner for the
   * same reason.
   *
   * @param {THREE.Group} g the cockpit group
   */
  buildCabin(g) {
    /* Interior green, dull and dark, the way the inside of one of these
     * actually was — and deliberately much darker than the skin outside. The
     * scene carries a warm `roomEnvironment` IBL on top of a dimmed night sun,
     * and a mid-grey liner picks up so much of it that a night bomber's cabin
     * comes out the colour of a kitchen. This does not. */
    const liner = solid(0x333c31, { roughness: 0.95, metalness: 0.06 });
    const linerDark = solid(0x23291f, { roughness: 1, metalness: 0.04 });
    const former = solid(0x4a5148, { roughness: 0.8, metalness: 0.2 });
    const deck = solid(0x191c18, { roughness: 1 });

    /* The habitable run. Forward is the windshield header, aft is a bulkhead
     * behind the crew door — past that is tail-boom structure nobody stands
     * in. `IN_X` is the liner's inner face, 6 cm inboard of the skin. */
    const FWD = FUSE_LEN / 2 + 0.5;      // 8.25 — under the windshield
    const AFT = -4.6;
    const IN_X = FUSE_W / 2 - 0.06;      // 1.54
    const FLOOR_Y = CABIN_FLOOR_Y;
    const ROOF_Y = 1.66;
    const cabinLen = FWD - AFT;
    const cabinMid = (FWD + AFT) / 2;
    this.parts.cabin = group('cabin-liner');
    g.add(this.parts.cabin);
    const c = this.parts.cabin;

    /* ---- Floor. A raised deck over the bomb bay, which is where it has to
     * be: the bay runs z -2.8 .. 3.6 at the belly and the seats sit at y 0.05,
     * so the crew walk on top of the bay, not through it. ---- */
    const floor = mesh(boxGeo(FUSE_W - 0.14, 0.06, cabinLen), liner, 0, FLOOR_Y, cabinMid);
    floor.name = 'cabin-floor';
    c.add(floor);
    // The walkway strip down the middle, worn darker than the rest.
    const walkway = mesh(boxGeo(0.72, 0.02, cabinLen - 0.2), deck, 0, FLOOR_Y + 0.04, cabinMid);
    walkway.name = 'cabin-walkway';
    c.add(walkway);
    // Floor beams, so the deck reads as built rather than as a plane.
    for (let z = AFT + 0.7; z < FWD; z += 1.35) {
      c.add(mesh(boxGeo(FUSE_W - 0.16, 0.05, 0.08), linerDark, 0, FLOOR_Y + 0.035, z));
    }

    /* ---- Roof. Three panels: the flight deck, the bay section between the
     * astrodome and the dorsal turret, and the aft section behind the turret.
     * The two gaps are the two things that are genuinely holes. ---- */
    const roofRuns = [
      [ASTRODOME_Z + ASTRODOME_OPEN_HALF, FWD],
      [DORSAL_TURRET_Z + DORSAL_OPEN_HALF, ASTRODOME_Z - ASTRODOME_OPEN_HALF],
      [AFT, DORSAL_TURRET_Z - DORSAL_OPEN_HALF],
    ];
    this.parts.cabinRoof = [];
    for (const [a, b] of roofRuns) {
      const panel = mesh(boxGeo(FUSE_W - 0.14, 0.05, b - a), liner, 0, ROOF_Y, (a + b) / 2);
      panel.name = 'cabin-roof';
      c.add(panel);
      this.parts.cabinRoof.push(panel);
    }
    /* Formers: the hoop frames the skin is riveted to, showing on the inside
     * the way they do in an aeroplane nobody bothered to line properly. Kept
     * at x ±1.0 and above y 0.9 so nothing hangs over a seated head — the
     * pilot's eye is at y 1.42 and the roof's underside is at 1.635. */
    for (let z = AFT + 0.9; z < FWD - 0.4; z += 1.3) {
      for (const sx of [-1, 1]) {
        const rib = mesh(boxGeo(0.05, 0.9, 0.07), former, sx * (IN_X - 0.03), 1.15, z);
        rib.name = 'cabin-former';
        c.add(rib);
      }
      c.add(mesh(boxGeo(1.5, 0.05, 0.07), former, 0, ROOF_Y - 0.05, z));
    }

    /* ---- Wall liners. Below the window line everywhere; full height only aft
     * of the flight deck, where there are no side windows to cover. The
     * starboard run is broken either side of the crew door. ---- */
    const wall = (sx, zA, zB, yLo, yHi) => {
      const w = mesh(boxGeo(0.05, yHi - yLo, zB - zA), liner,
        sx * IN_X, (yLo + yHi) / 2, (zA + zB) / 2);
      w.name = 'cabin-wall-liner';
      c.add(w);
    };
    for (const sx of [-1, 1]) {
      // Under the windows, the length of the flight deck.
      wall(sx, 6.2, FWD, FLOOR_Y, 0.74);
      // Full height from the back of the flight deck aft…
      if (sx > 0) {
        wall(sx, AFT, 6.2, FLOOR_Y, ROOF_Y);
      } else {
        // …except on the starboard side, where the crew door is.
        wall(sx, -2.75, 6.2, FLOOR_Y, ROOF_Y);
        wall(sx, AFT, -4.05, FLOOR_Y, ROOF_Y);
        // Only above the doorway itself. The old lower panel was authored with
        // a negative height and the upper panel began 0.61 m above the cabin
        // finish; together they made the ladder lead into an opaque wall.
        wall(sx, -4.05, -2.75, CREW_DOOR_TOP_Y, ROOF_Y);
      }
    }

    /* ---- Rear bulkhead, with a doorway through it. Three panels rather than
     * one, because a wall you cannot walk through in an aeroplane whose tail
     * gunner has to get past it is the wrong wall. ---- */
    const bulk = (w, h, x, y) => {
      const b = mesh(boxGeo(w, h, 0.07), linerDark, x, y, AFT);
      b.name = 'cabin-rear-bulkhead';
      c.add(b);
    };
    bulk(0.95, ROOF_Y - FLOOR_Y, 0.98, (FLOOR_Y + ROOF_Y) / 2);
    bulk(0.95, ROOF_Y - FLOOR_Y, -0.98, (FLOOR_Y + ROOF_Y) / 2);
    bulk(1.02, 0.5, 0, ROOF_Y - 0.25);

    /* ---- Overhead panel, between the two front seats. Deliberately NOT over
     * either of them: the seats are at x ±0.55 and this spans ±0.34. ---- */
    const overhead = mesh(boxGeo(0.68, 0.1, 1.1), linerDark, 0, ROOF_Y - 0.09, FUSE_LEN / 2 - 0.2);
    overhead.name = 'cockpit-overhead-panel';
    c.add(overhead);
    for (let i = 0; i < 6; i++) {
      overhead.add(mesh(boxGeo(0.05, 0.05, 0.07), former, -0.22 + (i % 3) * 0.22, -0.06, i < 3 ? -0.22 : 0.22));
    }
    // Escape-hatch outline in the flight-deck roof, forward of the astrodome.
    const hatch = mesh(boxGeo(0.78, 0.03, 0.78), linerDark, 0, ROOF_Y - 0.04, 4.6);
    hatch.name = 'cabin-escape-hatch';
    c.add(hatch);

    /* ---------------------------------------------------------------- */
    /* The crew compartment — "the guys behind you"                       */
    /* ---------------------------------------------------------------- */

    /* Radio rack against the starboard liner, opposite the navigator, with
     * the dials the set actually has. Nobody is sitting at it — Irish works
     * the set from his own table — but an empty rack is what the compartment
     * of an aeroplane this size looks like. */
    const rack = group('radio-rack');
    rack.position.set(-(IN_X - 0.24), 0.45, 3.9);
    rack.add(mesh(boxGeo(0.4, 1.05, 1.15), linerDark, 0, 0, 0));
    for (const [ry, rz] of [[0.32, -0.28], [0.32, 0.28], [-0.02, 0]]) {
      rack.add(mesh(boxGeo(0.06, 0.26, 0.44), solid(0x24262a, { roughness: 0.6 }), 0.21, ry, rz));
      rack.add(mesh(cylGeo(0.05, 0.05, 0.05, 10), solid(0xd8c07a, { roughness: 0.5 }), 0.25, ry, rz)
        .rotateZ(Math.PI / 2));
    }
    rack.add(flatMesh(sphereGeo(0.045, 8, 6), unlit(0x37ff6a), 0.23, -0.34, -0.3));
    c.add(rack);
    this.parts.radioRack = rack;

    /* A folding jump seat on the port liner, aft of the navigator — where a
     * spare man rides, and where the Shubenator was supposed to be sitting
     * before he talked his way into the tail. */
    const jump = group('jump-seat');
    jump.position.set(IN_X - 0.2, 0.34, 1.5);
    const jumpPan = mesh(boxGeo(0.32, 0.07, 0.5), solid(0x3a3228, { roughness: 0.95 }), 0, 0, 0);
    jumpPan.name = 'jump-seat-pan';
    jump.add(jumpPan);
    const jumpBack = mesh(boxGeo(0.07, 0.3, 0.5), solid(0x3a3228, { roughness: 0.95 }), 0.14, 0.15, 0);
    jumpBack.name = 'jump-seat-back';
    jump.add(jumpBack);
    jump.add(strutBetween(former, [0.16, -0.02, -0.22], [-0.1, -0.44, -0.22], 0.025, 'jump-seat-leg'));
    jump.add(strutBetween(former, [0.16, -0.02, 0.22], [-0.1, -0.44, 0.22], 0.025, 'jump-seat-leg'));
    c.add(jump);
    this.parts.jumpSeat = jump;

    /* Oxygen bottles in a rack on the starboard wall, ammunition cans for the
     * tail gun stacked against the port one, and a fire extinguisher by the
     * door. Everything is clipped to a liner, so nothing floats and nothing
     * shares a cubic metre with a man. */
    const bottles = group('oxygen-bottles');
    bottles.position.set(-(IN_X - 0.18), 0.28, 1.1);
    for (let i = 0; i < 3; i++) {
      bottles.add(mesh(cylGeo(0.1, 0.1, 0.72, 10), solid(0x2f6a4a, { roughness: 0.6, metalness: 0.3 }), 0, 0, -0.26 + i * 0.26));
      bottles.add(mesh(cylGeo(0.04, 0.04, 0.1, 8), former, 0, 0.4, -0.26 + i * 0.26));
    }
    bottles.add(mesh(boxGeo(0.24, 0.06, 0.86), former, 0.02, 0.22, 0));
    c.add(bottles);
    this.parts.oxygenBottles = bottles;

    const ammo = group('cabin-ammo-cans');
    ammo.position.set(IN_X - 0.26, FLOOR_Y + 0.19, -0.4);
    for (let i = 0; i < 3; i++) {
      const can = mesh(boxGeo(0.34, 0.26, 0.5), solid(0x4a5240, { roughness: 0.95 }),
        i === 2 ? -0.02 : 0, i === 2 ? 0.28 : 0, -0.3 + (i % 2) * 0.6);
      ammo.add(can);
      can.add(mesh(boxGeo(0.1, 0.04, 0.16), former, 0, 0.15, 0));
    }
    c.add(ammo);
    this.parts.ammoCans = ammo;

    const extinguisher = mesh(cylGeo(0.08, 0.08, 0.42, 10), solid(0xb8402a, { roughness: 0.7 }),
      -(IN_X - 0.16), 0.4, -2.4);
    extinguisher.name = 'cabin-extinguisher';
    c.add(extinguisher);

    /* The catwalk aft, over the bomb bay's rear half, and the two handrails
     * that go with it — the walk the owner's crew would take to the tail. */
    for (const sx of [-1, 1]) {
      const rail = mesh(cylGeo(0.03, 0.03, 4.2, 6), former, sx * 0.48, 0.62, -1.6);
      rail.rotation.x = Math.PI / 2;
      rail.name = 'cabin-handrail';
      c.add(rail);
      for (const z of [-3.4, -1.6, 0.2]) {
        c.add(mesh(cylGeo(0.026, 0.026, 0.74, 6), former, sx * 0.48, 0.27, z));
      }
    }

    /* Three dim dome lamps down the ceiling. The whole mission after the cut
     * is flown at night with the sun turned down to a fifth, so without these
     * the compartment this method just built is a black tube nobody can see
     * any of. Unlit spheres, the same trick `navLamp` and the beacon use, so
     * they cost nothing and cast nothing. */
    this.parts.cabinLamps = [];
    for (const z of [5.6, 1.8, -3.2]) {
      const lamp = flatMesh(sphereGeo(0.075, 8, 6), unlit(0xffcf8a), 0, ROOF_Y - 0.11, z);
      lamp.name = 'cabin-lamp';
      lamp.scale.y = 0.55;
      c.add(lamp);
      c.add(mesh(cylGeo(0.1, 0.1, 0.05, 8), linerDark, 0, ROOF_Y - 0.06, z));
      this.parts.cabinLamps.push(lamp);
    }
  }

  buildCockpit() {
    const g = new THREE.Group();
    g.name = 'cockpit';
    this.group.add(g);
    this.parts.cockpit = g;

    const panelDark = solid(0x24222a, { roughness: 0.7 });
    const glassMat = mat({ color: 0xbfd0e0, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.4, unique: true });

    // Windshield, stepped up above the nose glazing, with real framing.
    const windshield = mesh(boxGeo(2.5, 1.15, 0.1), glassMat, 0, 1.35, FUSE_LEN / 2 + 1.2);
    windshield.name = 'cockpit-windshield';
    windshield.rotation.x = -0.3;
    windshield.castShadow = false;
    g.add(windshield);
    this.parts.windshield = windshield;
    const frame = solid(0x2a2c30, { roughness: 0.7 });
    for (const sx of [-0.85, 0, 0.85]) {
      const post = mesh(boxGeo(0.06, 1.2, 0.12), frame, sx, 1.35, FUSE_LEN / 2 + 1.18);
      post.name = `cockpit-windshield-frame-post-${sx < 0 ? 'starboard' : sx > 0 ? 'port' : 'centre'}`;
      post.rotation.x = -0.3;
      g.add(post);
    }
    const windshieldHeader = mesh(boxGeo(2.56, 0.1, 0.14), frame, 0, 1.9, FUSE_LEN / 2 + 1.02);
    windshieldHeader.name = 'cockpit-windshield-frame-header';
    g.add(windshieldHeader);
    // Side windows for the two front seats.
    this.parts.sideWindows = [];
    for (const sx of [-1, 1]) {
      const side = mesh(boxGeo(0.06, 0.7, 1.5), glassMat, sx * (FUSE_W / 2 - 0.02), 1.15, FUSE_LEN / 2 - 0.6);
      side.name = `cockpit-side-window-${sx < 0 ? 'starboard' : 'port'}`;
      side.userData.geometryGate = { overlap: false };
      side.castShadow = false;
      g.add(side);
      this.parts.sideWindows.push(side);
    }

    // The inside of the aeroplane — see `buildCabin()`. Built before the
    // furniture so the furniture stands on a floor rather than over a hole.
    this.buildCabin(g);

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

    /* Keep a measured control gap without crowding the windshield: the panel
     * moved 70 mm forward and the yokes 100 mm aft below, leaving the former
     * 56.2 mm full-forward grip penetration as real air on both sides. */
    const panel = mesh(boxGeo(2.3, 0.95, 0.12), panelDark, 0, 0.82, FUSE_LEN / 2 + 0.77);
    panel.name = 'cockpit-instrument-panel';
    panel.rotation.x = 0.14;
    g.add(panel);
    const face = flatMesh(new THREE.PlaneGeometry(2.14, 0.86), new THREE.MeshBasicMaterial({ map: panelTex }), 0, 0, -0.062);
    face.name = 'cockpit-instrument-face';
    face.rotation.y = Math.PI;
    panel.add(face);
    this.parts.instrumentPanel = panel;
    this.parts.instrumentFace = face;
    this.parts.instrumentPanelSupports = [];
    for (const sx of [-1, 1]) {
      const supportHeight = 0.49;
      const support = mesh(
        boxGeo(0.07, supportHeight, 0.08), frame,
        sx * 0.96, CABIN_FLOOR_TOP + supportHeight / 2, panel.position.z,
      );
      support.name = `cockpit-instrument-panel-support-${sx < 0 ? 'starboard' : 'port'}`;
      g.add(support);
      this.parts.instrumentPanelSupports.push(support);
    }

    // The throttle quadrant between the seats: four levers for four engines,
    // which is the one thing on the flight deck that says how many there are.
    // Keep it just to the pilot side of centre. At x=0 its full-height box
    // occupied 106 mm of Sasole's inboard upper arm, plus his forearm/watch.
    const throttleX = 0.25;
    const pedestal = mesh(boxGeo(0.44, 0.34, 0.9), panelDark, throttleX, 0.55, FUSE_LEN / 2 - 0.35);
    pedestal.name = 'cockpit-throttle-quadrant';
    g.add(pedestal);
    this.parts.throttleQuadrant = pedestal;
    this.parts.throttleQuadrantSupports = [];
    for (const sx of [-1, 1]) {
      const supportHeight = 0.47;
      const support = mesh(
        boxGeo(0.065, supportHeight, 0.1), frame,
        throttleX + sx * 0.14, CABIN_FLOOR_TOP + supportHeight / 2, pedestal.position.z,
      );
      support.name = `cockpit-throttle-quadrant-support-${sx < 0 ? 'starboard' : 'port'}`;
      g.add(support);
      this.parts.throttleQuadrantSupports.push(support);
    }
    this.parts.throttleLevers = [];
    for (let i = 0; i < 4; i++) {
      const lever = new THREE.Group();
      lever.name = `cockpit-throttle-lever-${i + 1}`;
      lever.position.set(throttleX - 0.15 + i * 0.1, 0.72, FUSE_LEN / 2 - 0.5);
      lever.add(mesh(boxGeo(0.045, 0.32, 0.05), solid(0x1e2024, { roughness: 0.7 }), 0, 0.16, 0));
      lever.add(mesh(sphereGeo(0.05, 8, 6), solid(0xd8c07a, { roughness: 0.5 }), 0, 0.34, 0));
      g.add(lever);
      this.parts.throttleLevers.push(lever);
    }

    /* Twin control columns. The flight deck previously had four throttle
     * levers but no primary controls at either front seat. Each column is one
     * deck-mounted assembly: a fixed shoe on the real cabin finish, a pitch
     * pivot rising between the pilot's knees, and a two-handed yoke. */
    this.parts.controlYokes = [];
    for (const [role, x] of [['pilot', 0.55], ['copilot', -0.55]]) {
      const assembly = group(`${role}-control-yoke`);
      assembly.position.set(x, CABIN_FLOOR_TOP, FUSE_LEN / 2 + 0.2);

      const base = mesh(boxGeo(0.18, 0.08, 0.24), frame, 0, 0.04, 0);
      base.name = 'control-yoke-base';
      assembly.add(base);

      const pitchPivot = group('control-yoke-pitch-pivot');
      pitchPivot.rotation.x = 0.28;
      const column = mesh(cylGeo(0.045, 0.045, 0.72, 8), frame, 0, 0.36, 0);
      column.name = 'control-yoke-column';
      pitchPivot.add(column);

      const wheel = group('control-yoke-wheel');
      wheel.position.y = 0.72;
      const hub = mesh(boxGeo(0.14, 0.1, 0.08), frame, 0, 0, 0);
      hub.name = 'control-yoke-hub';
      wheel.add(hub);
      const bar = mesh(boxGeo(0.42, 0.055, 0.065), frame, 0, 0, 0);
      bar.name = 'control-yoke-bar';
      wheel.add(bar);
      for (const sx of [-1, 1]) {
        const grip = mesh(boxGeo(0.07, 0.22, 0.07), solid(0x241c16, { roughness: 1 }), sx * 0.18, 0.1, 0);
        grip.name = 'control-yoke-grip';
        wheel.add(grip);
      }
      pitchPivot.add(wheel);
      assembly.add(pitchPivot);
      g.add(assembly);
      this.parts.controlYokes.push({ assembly, pitchPivot, wheel });
    }

    /* Two complete rudder stations. Each pedal is carried by its own deck
     * bracket and slides fore/aft against the other pedal, which is the motion
     * the actual yaw control below drives. They sit forward of the boots and
     * below the panel, clear of both moving yokes. */
    this.parts.rudderPedals = [];
    for (const [role, stationX] of [['pilot', 0.55], ['copilot', -0.55]]) {
      for (const [side, sideSign] of [['left', 1], ['right', -1]]) {
        const x = stationX + sideSign * 0.15;
        const mount = mesh(boxGeo(0.07, 0.12, 0.2), frame, x, CABIN_FLOOR_TOP + 0.06, FUSE_LEN / 2 + 0.43);
        mount.name = `${role}-rudder-pedal-${side}-mount`;
        g.add(mount);
        const pedal = mesh(boxGeo(0.16, 0.25, 0.055), solid(0x24262a, { roughness: 0.85 }),
          x, CABIN_FLOOR_TOP + 0.18, FUSE_LEN / 2 + 0.47);
        pedal.name = `${role}-rudder-pedal-${side}`;
        pedal.rotation.x = -0.32;
        pedal.userData.restZ = pedal.position.z;
        pedal.userData.rudderSign = sideSign;
        g.add(pedal);
        this.parts.rudderPedals.push(pedal);
      }
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
      const pan = mesh(boxGeo(0.6, 0.14, 0.6), seatMat, 0, 0, 0);
      pan.name = 'cockpit-seat-pan';
      s.add(pan);
      const back = mesh(boxGeo(0.6, 0.8, 0.14), seatMat, 0, 0.4, -0.3);
      back.name = 'cockpit-seat-back';
      s.add(back);
      const panBottom = y - 0.07;
      const legHeight = panBottom - CABIN_FLOOR_TOP;
      const legLocalY = CABIN_FLOOR_TOP - y + legHeight / 2;
      for (const lx of [-0.14, 0.14]) {
        for (const lz of [-0.18, 0.18]) {
          const leg = mesh(boxGeo(0.06, legHeight, 0.06), frame, lx, legLocalY, lz);
          leg.name = 'cockpit-seat-leg';
          s.add(leg);
        }
      }
      // Head armour and a lap belt, so an empty seat still reads as a seat.
      const headArmour = mesh(boxGeo(0.4, 0.3, 0.06), solid(0x2a2c30, { roughness: 0.8 }), 0, 0.9, -0.3);
      headArmour.name = 'cockpit-seat-head-armour';
      s.add(headArmour);
      /* Put the belt's lower face on the cushion. At y=0.12 it floated 25 mm
       * above every pan, conspicuous on the empty pilot seat. */
      const lapBelt = mesh(boxGeo(0.5, 0.05, 0.08), solid(0x6b5a3a, { roughness: 0.95 }), 0, 0.095, 0.18);
      lapBelt.name = 'cockpit-seat-lap-belt';
      s.add(lapBelt);
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
    /* Irish's navigator station: a chart table behind the flight deck, with
     * him sitting against the port liner facing inboard across the cabin.
     *
     * Owner playtest: "a lot of clipping and intersecting." The table used to
     * be a 0.9 m slab centred at x -0.2 with the seat at x 0.62 — 0.82 m
     * apart, which is less than a seated man's thigh, so Irish's knees came
     * out through the far edge of his own desk and the desk had no legs under
     * it. Both are measured now: the seat pan's top face lands at y 0.12 and
     * so do his thighs, the table top sits 0.28 m clear above them, and the
     * near edge is at x 0.45 — outboard of his knees at roughly x 0.5. */
    const navSeat = buildSeat(0.78, 0.05, FUSE_LEN / 2 - 2.9, -Math.PI / 2);
    const navTable = mesh(boxGeo(0.72, 0.07, 0.86), solid(0x4a4238, { roughness: 0.9 }), 0.1, 0.4, FUSE_LEN / 2 - 2.9);
    navTable.name = 'nav-table';
    g.add(navTable);
    // The chart, a rule, and the lip that stops both sliding off in a bank.
    navTable.add(mesh(boxGeo(0.52, 0.02, 0.6), solid(0xd8d2c0, { roughness: 0.95 }), 0, 0.045, 0));
    navTable.add(mesh(boxGeo(0.04, 0.015, 0.5), solid(0xc8a24a, { roughness: 0.6, metalness: 0.4 }), -0.2, 0.05, 0.06));
    navTable.add(mesh(boxGeo(0.72, 0.05, 0.03), solid(0x3a322a, { roughness: 0.95 }), 0, 0.04, -0.43));
    navTable.add(mesh(boxGeo(0.72, 0.05, 0.03), solid(0x3a322a, { roughness: 0.95 }), 0, 0.04, 0.43));
    // Legs down to the deck, and a stay back to the wall liner.
    for (const sz of [-0.36, 0.36]) {
      /* The deck top is CABIN_FLOOR_TOP (-0.09 m). The old 0.49 m legs ended
       * at -0.125 m, burying them 35 mm through the deck — 5 mm beyond the
       * gate's fitted-part convention. Keep their top at the underside of the
       * table and land their feet exactly on the authored deck datum. */
      navTable.add(mesh(boxGeo(0.05, 0.455, 0.05), solid(0x3a322a, { roughness: 0.95 }), -0.3, -0.2625, sz));
      navTable.add(mesh(boxGeo(0.62, 0.04, 0.04), solid(0x3a322a, { roughness: 0.95 }), 0.32, -0.16, sz));
    }
    // A stowage bin under the table, for the bags of charts nobody filed.
    navTable.add(mesh(boxGeo(0.5, 0.24, 0.7), solid(0x40483c, { roughness: 0.95 }), -0.06, -0.2, 0));
    const navLamp = flatMesh(sphereGeo(0.07, 8, 6), unlit(0xffd27a), 0.1, 0.86, FUSE_LEN / 2 - 2.9);
    g.add(navLamp);
    this.parts.navLamp = navLamp;
    // The lamp's gooseneck, so it is a lamp and not a floating bulb.
    g.add(mesh(cylGeo(0.02, 0.02, 0.42, 6), solid(0x2a2c30, { roughness: 0.8 }), 0.32, 0.62, FUSE_LEN / 2 - 2.9));
    g.add(mesh(cylGeo(0.02, 0.02, 0.24, 6), solid(0x2a2c30, { roughness: 0.8 }), 0.21, 0.84, FUSE_LEN / 2 - 2.9)
      .rotateZ(Math.PI / 2));

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
    /* Nothing on the animation rig means anything once the aeroplane is a
     * fireball — see `Brushrunner.update()` in `src/beefrun/aircraft.js`,
     * whose guard this one matches exactly. */
    if (this.destroyed) {
      this.updateExplosion(dt);
      return;
    }
    const a = this.anim;
    const c = phys.controls;
    const engList = engines?.engines;

    /* The controls the player moves are the controls the crew can see. Aft
     * stick brings the columns back toward the seats; lateral stick turns the
     * two wheels together. Damping leaves them heavy without letting their
     * geometry drift from the actual control state. */
    for (const { pitchPivot, wheel } of this.parts.controlYokes ?? []) {
      pitchPivot.rotation.x = damp(pitchPivot.rotation.x, 0.28 - c.pitch * 0.12, 12, dt);
      wheel.rotation.z = damp(wheel.rotation.z, c.roll * 0.65, 14, dt);
    }
    for (const pedal of this.parts.rudderPedals ?? []) {
      const travel = c.yaw * pedal.userData.rudderSign * 0.055;
      pedal.position.z = damp(pedal.position.z, pedal.userData.restZ + travel, 14, dt);
      pedal.rotation.x = damp(pedal.rotation.x, -0.32 - c.yaw * pedal.userData.rudderSign * 0.12, 14, dt);
    }
    for (let i = 0; i < (this.parts.throttleLevers?.length ?? 0); i += 1) {
      const bank = i < 2 ? c.throttleL : c.throttleR;
      this.parts.throttleLevers[i].rotation.x = damp(
        this.parts.throttleLevers[i].rotation.x, -0.5 + bank * 0.9, 10, dt,
      );
    }

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
    /* Each leaf is modelled inward from its outboard hinge. The old signs
     * rotated both centres UP into the payload bay by 0.751 m; reverse them so
     * the real command lets gravity's side of the doors clear the aeroplane. */
    this.parts.bombBayDoors[0].rotation.z = -a.bombBay * 1.35;
    this.parts.bombBayDoors[1].rotation.z = a.bombBay * 1.35;

    this.updateRearGun(dt, phys, state);

    const beaconPulse = (Math.sin(phys.time * 3.4) + 1) / 2;
    this.parts.beacon.material = beaconPulse > 0.6 ? unlit(0xff5a3a) : unlit(0x4a1a10);
    const lit = state.dusk ? 1 : 0.4;
    for (const l of this.parts.navLights) l.scale.setScalar(0.7 + lit * 0.5);

    if (this.instruments) {
      // The cold stand-in carries all four engines so the inner-pair dials
      // still have something to read before the real EngineSystem arrives.
      this.instruments.update(dt, phys, engines ?? { engines: Array.from({ length: 4 }, () => ({ rpm: 0, temp: 40 })), fuel: AC_ENOLA.fuelMass, anyRunning: false }, state);
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
      /* `gunAim` is a line from the gunner's eye, not from the aeroplane
       * origin seventeen metres ahead. Removing that origin offset eliminates
       * the remaining 1.48-degree parallax at the traverse stops. */
      this.rearGunEyeLocal(_gunEyeLocal);
      _aim.sub(_gunEyeLocal);
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
    /* GunnerStation.applyCamera()/aimWorld use positive local X for positive
     * elevation. Keep the steel on that same convention so the reticle,
     * barrels and modeled muzzle are one line rather than mirrored in pitch. */
    yoke.rotation.x = a.gunPitch;

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

  /* ---------------------------------------------------------------- */
  /* The crash                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Replace the intact airframe with a short-lived fireball and debris fan.
   *
   * Ported from `src/beefrun/aircraft.js`'s `Brushrunner.explode()` — same
   * three-part shape (fireballs, smoke, debris), same "hide the children,
   * don't rebuild them" trick that makes a checkpoint restore free — scaled
   * up for an airframe about twice the Brushrunner's span (33.5 m vs 17.2 m):
   * bigger fireballs, one more smoke puff, more debris thrown further, same
   * timing. `src/enolasquatch/mission/MissionController.js`'s `onImpact()`
   * is what calls this, on the same severity gate Beef Run's `onImpact` uses.
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

    const fx = group('enola-squatch-explosion');
    fx.userData.age = 0;
    const fire = [
      [0xffe06a, 2.7, 0, 0.3, 0.3],
      [0xff7a24, 4.0, -1.3, 0.0, 0.5],
      [0xd92e18, 5.1, 1.5, -0.3, -0.4],
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
    for (let i = 0; i < 9; i++) {
      const smoke = mesh(
        sphereGeo(1.6 + (i % 3) * 0.6, 9, 6),
        new THREE.MeshBasicMaterial({ color: 0x2a2522, transparent: true, opacity: 0.76, depthWrite: false }),
        (i - 4) * 1.05, 1.1 + (i % 2) * 0.9, (i % 3) * 1.15 - 0.9,
      );
      smoke.userData.smoke = true;
      fx.add(smoke);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const debris = mesh(
        boxGeo(0.28 + (i % 3) * 0.18, 0.14, 0.65 + (i % 2) * 0.36),
        solid(i % 2 ? 0x7a5230 : METAL, { roughness: 0.8, metalness: i % 2 ? 0 : 0.5 }),
        Math.cos(a) * 2.2, (i % 4) * 0.42 - 0.35, Math.sin(a) * 2.2,
      );
      debris.userData.debris = true;
      debris.userData.velocity = new THREE.Vector3(
        Math.cos(a) * (7 + (i % 3) * 1.8), 5 + (i % 5) * 1.4, Math.sin(a) * (7 + (i % 3) * 1.8),
      );
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
        child.position.y += dt * 2.6;
        child.scale.addScalar(dt * 1.0);
        child.material.opacity = clamp(0.76 - age * 0.16, 0.12, 0.76);
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
    /* Safe to turn everything back on: the only conditional visibility on
     * this model is the prop discs and the front props themselves, both
     * reassigned every frame by `update()`. */
    for (const child of this.group.children) child.visible = true;
  }
}
