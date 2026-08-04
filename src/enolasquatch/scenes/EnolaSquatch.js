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

/** Three-bladed prop, same construction idiom as the Brushrunner's. */
function propBlade(material) {
  const g = new THREE.Group();
  const blade = mesh(boxGeo(0.26, 2.05, 0.08), material, 0, 1.14, 0);
  blade.rotation.y = 0.3;
  g.add(blade);
  const tip = mesh(boxGeo(0.26, 0.18, 0.08), solid(0xe8d24a, { roughness: 0.6 }), 0, 2.24, 0);
  g.add(tip);
  return g;
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
    const patch1 = mesh(boxGeo(1.8, 1.5, 0.08), patch, FUSE_W / 2 + 0.02, 0.3, -4.0);
    patch1.rotation.y = Math.PI / 2;
    g.add(patch1);
    patch1.add(rivets());
    const patch2 = mesh(boxGeo(2.4, 1.2, 0.08), patchRough, -FUSE_W / 2 - 0.02, -0.6, 4.2);
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
        g.add(mesh(boxGeo(0.03, FUSE_H - 0.3, 0.06), seam, sx * (FUSE_W / 2 + 0.005), 0, z));
      }
      const run = rivetRun(metal, 13, 1.05, 'z');
      run.position.set(sx * (FUSE_W / 2 + 0.02), FUSE_H / 2 - 0.5, 0);
      run.rotation.z = Math.PI / 2;
      g.add(run);
    }
    for (const z of [-4.2, 0.4, 4.8]) {
      g.add(mesh(boxGeo(FUSE_W - 0.2, 0.05, 0.05), seam, 0, FUSE_H / 2 + 0.005, z));
    }

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
      const spinner = mesh(coneGeo(0.44, 1.0, 14), trim, nx, 0.7, 5.0);
      spinner.rotation.x = Math.PI / 2;
      g.add(spinner);

      const hub = new THREE.Group();
      hub.position.set(nx, 0.7, 4.85);
      const bladeMat = solid(0x24262a, { roughness: 0.5, metalness: 0.42 });
      for (let b = 0; b < 3; b++) {
        const blade = propBlade(bladeMat);
        blade.rotation.z = (b / 3) * Math.PI * 2;
        hub.add(blade);
      }
      g.add(hub);
      this.parts.prop.push(hub);

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(2.35, 24),
        new THREE.MeshBasicMaterial({
          color: 0xb9bec6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      disc.position.set(nx, 0.7, 4.94);
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

    // ---- Livery: purple racing stripe down both sides of the fuselage ----
    for (const sx of [-1, 1]) {
      const stripe = mesh(boxGeo(0.04, 0.55, FUSE_LEN - 1.4), purple, sx * (FUSE_W / 2 + 0.01), 0.1, 0);
      g.add(stripe);
      const pin = mesh(boxGeo(0.045, 0.11, FUSE_LEN - 1.4), purpleLight, sx * (FUSE_W / 2 + 0.012), -0.36, 0);
      g.add(pin);
    }
    // Fin flash, same colour, so the livery reads from behind too.
    g.add(mesh(boxGeo(0.05, 3.9, 0.6), purple, 0.16, 2.8, -FUSE_LEN / 2 - 4.35));

    // ---- Nose art (starboard side, under the cockpit's eyeline) ----
    const noseArtMat = mat({ map: noseArtTexture(), roughness: 0.85, transparent: true, alphaTest: 0.03, unique: true });
    const noseArt = flatMesh(planeGeo(1.9, 1.9), noseArtMat, -FUSE_W / 2 - 0.02, 0.4, 4.2);
    noseArt.rotation.y = -Math.PI / 2;
    g.add(noseArt);
    this.parts.noseArt = noseArt;

    // ---- "ENOLA SQUATCH / Peace Through Superior Foot Size" ----
    // Painted just under the cockpit window, one side only — the same
    // placement real heavy-bomber nose art used, since only one side of the
    // aeroplane is ever framed for the photo.
    const titleTex = signTexture(['ENOLA SQUATCH', 'Peace Through Superior Foot Size'], {
      w: 768, h: 220, bg: '#c9c2d4', fg: '#241a3a', border: '#4a2f8f', rough: true,
    });
    const titlePlate = flatMesh(
      planeGeo(3.6, 1.0),
      mat({ map: titleTex, roughness: 0.85, transparent: true, unique: true }),
      -FUSE_W / 2 - 0.02, -0.7, 1.6,
    );
    titlePlate.rotation.y = -Math.PI / 2;
    g.add(titlePlate);
    this.parts.titlePlate = titlePlate;

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
    const doorFrame = mesh(boxGeo(0.06, 1.7, 0.95), trim, -FUSE_W / 2 - 0.015, -0.35, -3.4);
    g.add(doorFrame);
    const doorPanel = mesh(boxGeo(0.05, 1.5, 0.8), patch, -FUSE_W / 2 - 0.05, -0.35, -3.4);
    g.add(doorPanel);
    doorPanel.add(mesh(boxGeo(0.06, 0.09, 0.26), metal, -0.03, -0.1, 0.24));
    this.parts.crewDoor = doorPanel;
    this.anchors.crewDoor = new THREE.Vector3(-FUSE_W / 2 - 0.6, -0.6, -3.4);
    this.anchors.stepDown = new THREE.Vector3(-FUSE_W / 2 - 3.4, 0, -3.4);
    // Boarding ladder, hooked under the sill.
    const ladder = group('boarding-ladder');
    ladder.position.set(-FUSE_W / 2 - 0.35, -1.1, -3.4);
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
