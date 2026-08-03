/**
 * "The Enola Squatch" — a much heavier four-engine bomber, built the same
 * way everything else in this project is built: out of boxes and cylinders,
 * with the paint and the placards drawn onto canvases at runtime. Nose
 * points +Z, right wing +X (same convention as `src/beefrun/aircraft.js`'s
 * `Brushrunner`, which this is a sibling of rather than a subclass of — the
 * geometry is new, only the idiom is borrowed).
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

const FUSE_W = 2.8, FUSE_H = 3.0, FUSE_LEN = 12;
const BAY_Z = 0.6;               // ventral bomb-bay centre, mid-fuselage
const BAY_LEN = 5.2;
const BAY_WIDTH = 2.6;
const BELLY_Y = -FUSE_H / 2;

/** Three-bladed prop, same construction idiom as the Brushrunner's. */
function propBlade(material) {
  const g = new THREE.Group();
  const blade = mesh(boxGeo(0.22, 1.7, 0.07), material, 0, 0.95, 0);
  blade.rotation.y = 0.3;
  g.add(blade);
  const tip = mesh(boxGeo(0.22, 0.16, 0.07), solid(0xe8d24a, { roughness: 0.6 }), 0, 1.86, 0);
  g.add(tip);
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
    };
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

    // "Several suspicious repairs" — two mismatched patch panels, riveted
    // over the skin in colours and finishes that do not match it or each
    // other. Neither hides structure; both are purely cosmetic overlays,
    // same trick as the Brushrunner's own replacement panels.
    const patch1 = mesh(boxGeo(1.5, 1.3, 0.08), patch, FUSE_W / 2 + 0.02, 0.3, -3.2);
    patch1.rotation.y = Math.PI / 2;
    g.add(patch1);
    const rivets = () => {
      const rg = group('rivets');
      for (let rx = -0.55; rx <= 0.55; rx += 0.55) {
        for (let ry = -0.45; ry <= 0.45; ry += 0.45) {
          rg.add(mesh(cylGeo(0.03, 0.03, 0.03, 6), metal, rx, ry, 0.045));
        }
      }
      return rg;
    };
    patch1.add(rivets());
    const patch2 = mesh(boxGeo(2.0, 1.0, 0.08), patchRough, -FUSE_W / 2 - 0.02, -0.5, 3.4);
    patch2.rotation.y = -Math.PI / 2;
    g.add(patch2);
    patch2.add(rivets());
    this.parts.patches = [patch1, patch2];

    // Nose cone, tapered, with a glazed bombardier bubble.
    const nose = mesh(cylGeo(0.35, FUSE_W / 2, 3.2, 14), skin, 0, 0.1, FUSE_LEN / 2 + 1.5);
    nose.rotation.x = Math.PI / 2;
    g.add(nose);
    const noseGlass = mesh(sphereGeo(0.85, 12, 8), glassMat, 0, -0.2, FUSE_LEN / 2 + 2.9);
    noseGlass.castShadow = false;
    g.add(noseGlass);

    // Tail boom, tapering back to the fin.
    const boom = mesh(cylGeo(FUSE_W / 2, 0.55, 4.6, 12), skin, 0, 0.05, -FUSE_LEN / 2 - 2.3);
    boom.rotation.x = Math.PI / 2;
    g.add(boom);

    // ---- Wing: shoulder-mounted, four-engine spar ----
    const wing = mesh(boxGeo(AC_ENOLA.span, 0.55, AC_ENOLA.chord), skin, 0, 0.95, 0.3);
    g.add(wing);
    this.parts.wing = wing;

    // Ailerons, flaps.
    this.parts.aileron = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 12.5, 0.95, -1.55);
      pivot.add(mesh(boxGeo(4.4, 0.3, 0.9), patch, 0, 0, -0.45));
      g.add(pivot);
      this.parts.aileron.push(pivot);
    }
    this.parts.flap = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 4.6, 0.93, -1.55);
      pivot.add(mesh(boxGeo(5.6, 0.28, 0.95), skin, 0, 0, -0.48));
      g.add(pivot);
      this.parts.flap.push(pivot);
    }
    this.parts.airBrake = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = `air-brake-${sx < 0 ? 'left' : 'right'}`;
      pivot.position.set(sx * 3.0, 1.24, 0.85);
      pivot.add(mesh(boxGeo(3.2, 0.1, 0.75), patch, 0, 0, -0.35));
      g.add(pivot);
      this.parts.airBrake.push(pivot);
    }

    // ---- Four engines, two nacelles per side ----
    this.parts.prop = [];
    this.parts.propDisc = [];
    this.parts.exhaust = [];
    const nacelleX = [-11.2, -5.4, 5.4, 11.2];   // outer-left, inner-left, inner-right, outer-right
    for (let i = 0; i < 4; i++) {
      const nx = nacelleX[i];
      const nacelle = mesh(boxGeo(1.5, 1.35, 4.6), skin, nx, 0.55, 0.9);
      g.add(nacelle);
      const cowl = mesh(cylGeo(0.66, 0.74, 1.2, 14), trim, nx, 0.55, 3.3);
      cowl.rotation.x = Math.PI / 2;
      g.add(cowl);
      const spinner = mesh(coneGeo(0.38, 0.85, 12), trim, nx, 0.55, 4.15);
      spinner.rotation.x = Math.PI / 2;
      g.add(spinner);

      const hub = new THREE.Group();
      hub.position.set(nx, 0.55, 4.05);
      const bladeMat = solid(0x24262a, { roughness: 0.5, metalness: 0.42 });
      for (let b = 0; b < 3; b++) {
        const blade = propBlade(bladeMat);
        blade.rotation.z = (b / 3) * Math.PI * 2;
        hub.add(blade);
      }
      g.add(hub);
      this.parts.prop.push(hub);

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.95, 24),
        new THREE.MeshBasicMaterial({
          color: 0xb9bec6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      disc.position.set(nx, 0.55, 4.12);
      g.add(disc);
      this.parts.propDisc.push(disc);

      const stack = mesh(cylGeo(0.13, 0.13, 0.65, 6), solid(0x35353a, { roughness: 0.9 }), nx, 0.02, 2.2);
      stack.rotation.x = Math.PI / 2.2;
      g.add(stack);
      this.parts.exhaust.push(new THREE.Vector3(nx, -0.15, 1.9));

      // Cowl clamp bands for readable scale.
      for (const z of [2.0, 2.9]) {
        g.add(mesh(boxGeo(1.55, 1.38, 0.06), metal, nx, 0.55, z));
      }
    }

    // ---- Tail: single tall fin, and a broad stabiliser ----
    const fin = mesh(boxGeo(0.24, 4.1, 3.1), skin, 0, 2.3, -FUSE_LEN / 2 - 3.6);
    g.add(fin);
    const rudderPivot = new THREE.Group();
    rudderPivot.position.set(0, 2.3, -FUSE_LEN / 2 - 5.0);
    rudderPivot.add(mesh(boxGeo(0.22, 3.7, 1.4), patch, 0, 0, -0.7));
    g.add(rudderPivot);
    this.parts.rudder = rudderPivot;

    const stab = mesh(boxGeo(9.6, 0.28, 2.1), skin, 0, 0.9, -FUSE_LEN / 2 - 3.9);
    g.add(stab);
    const elevPivot = new THREE.Group();
    elevPivot.position.set(0, 0.9, -FUSE_LEN / 2 - 4.9);
    elevPivot.add(mesh(boxGeo(9.6, 0.24, 1.1), patch, 0, 0, -0.55));
    g.add(elevPivot);
    this.parts.elevator = elevPivot;

    // ---- Bomb bay: two hinged panel groups on the ventral centreline ----
    // Hinge lines run fore-aft along the two outboard edges (x = +-BAY_WIDTH/2)
    // so `rotation.z` swings each panel outward-and-down, exactly like the
    // Brushrunner's own single cargo door (`this.parts.cargoDoor.rotation.z`
    // in src/beefrun/aircraft.js) — same axis, doubled.
    this.parts.bombBayDoors = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = `bomb-bay-door-${sx < 0 ? 'port' : 'starboard'}`;
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
      const stripe = mesh(boxGeo(0.04, 0.5, FUSE_LEN - 1.2), purple, sx * (FUSE_W / 2 + 0.01), 0.1, 0);
      g.add(stripe);
      const pin = mesh(boxGeo(0.045, 0.1, FUSE_LEN - 1.2), purpleLight, sx * (FUSE_W / 2 + 0.012), -0.32, 0);
      g.add(pin);
    }
    // Fin flash, same colour, so the livery reads from behind too.
    g.add(mesh(boxGeo(0.05, 3.2, 0.5), purple, FUSE_W * 0 + 0.13, 2.3, -FUSE_LEN / 2 - 3.55));

    // ---- Nose art (port side, under the cockpit's eyeline) ----
    const noseArtMat = mat({ map: noseArtTexture(), roughness: 0.85, transparent: true, alphaTest: 0.03, unique: true });
    const noseArt = flatMesh(planeGeo(1.6, 1.6), noseArtMat, -FUSE_W / 2 - 0.02, 0.4, 3.4);
    noseArt.rotation.y = -Math.PI / 2;
    g.add(noseArt);
    this.parts.noseArt = noseArt;

    // ---- "ENOLA SQUATCH / Peace Through Superior Foot Size" ----
    // Painted just under the cockpit window, port side only — the same
    // placement real heavy-bomber nose art used, since only one side of the
    // aeroplane is ever framed for the photo.
    const titleTex = signTexture(['ENOLA SQUATCH', 'Peace Through Superior Foot Size'], {
      w: 768, h: 220, bg: '#c9c2d4', fg: '#241a3a', border: '#4a2f8f', rough: true,
    });
    const titlePlate = flatMesh(
      planeGeo(3.0, 0.86),
      mat({ map: titleTex, roughness: 0.85, transparent: true, unique: true }),
      -FUSE_W / 2 - 0.02, -0.55, 1.3,
    );
    titlePlate.rotation.y = -Math.PI / 2;
    g.add(titlePlate);
    this.parts.titlePlate = titlePlate;

    // ---- Landing gear: fixed tricycle, scaled up ----
    this.parts.gear = [];
    const legSpecs = [
      { x: 0, z: FUSE_LEN / 2 - 1.1, r: 0.62, steer: true },
      { x: -AC_ENOLA.track / 2, z: -1.0, r: 0.92, steer: false },
      { x: AC_ENOLA.track / 2, z: -1.0, r: 0.92, steer: false },
    ];
    legSpecs.forEach((spec, i) => {
      const leg = new THREE.Group();
      leg.position.set(spec.x, -(AC_ENOLA.gearY - 1.05 - spec.r), spec.z);
      const strutLen = 1.05;
      leg.add(mesh(boxGeo(0.26, strutLen, 0.26), metal, 0, -strutLen / 2, 0));
      const wheel = mesh(cylGeo(spec.r, spec.r, 0.4, 16), rubber, 0, -strutLen, 0);
      wheel.rotation.z = Math.PI / 2;
      leg.add(wheel);
      const hubCap = mesh(cylGeo(spec.r * 0.4, spec.r * 0.4, 0.42, 8), metal, 0, -strutLen, 0);
      hubCap.rotation.z = Math.PI / 2;
      leg.add(hubCap);
      g.add(leg);
      this.parts.gear.push({ leg, wheel, rest: leg.position.y, base: leg.position.y, steer: !!spec.steer });
    });

    // ---- Rear gun turret (Shubes' station) and bombardier station ----
    const turret = group('rear-gun-turret');
    turret.position.set(0, -0.2, -FUSE_LEN / 2 - 2.0);
    turret.add(mesh(sphereGeo(0.62, 12, 8), glassMat, 0, 0, 0));
    const barrel = mesh(cylGeo(0.05, 0.05, 1.1, 8), metal, 0, 0, -1.1);
    barrel.rotation.x = Math.PI / 2;
    turret.add(barrel);
    g.add(turret);
    this.parts.rearGunTurret = turret;
    this.anchors.rearGunSeat = new THREE.Vector3(0, -0.2, -FUSE_LEN / 2 - 1.7);
    this.anchors.bombardierStation = new THREE.Vector3(0, -0.35, FUSE_LEN / 2 + 2.2);

    // Navigation lights.
    this.parts.navLights = [];
    for (const [sx, color] of [[-1, 0xff2a1e], [1, 0x37ff6a]]) {
      const lamp = flatMesh(sphereGeo(0.12), unlit(color), sx * 14, 0.95, 0.3);
      g.add(lamp);
      this.parts.navLights.push(lamp);
    }
    const beacon = flatMesh(sphereGeo(0.13), unlit(0xff4a2a), 0, 4.4, -FUSE_LEN / 2 - 3.6);
    g.add(beacon);
    this.parts.beacon = beacon;
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

    // Windshield, stepped up above the nose glazing.
    const windshield = mesh(boxGeo(2.2, 1.0, 0.1), glassMat, 0, 1.15, FUSE_LEN / 2 + 1.0);
    windshield.rotation.x = -0.3;
    windshield.castShadow = false;
    g.add(windshield);
    this.parts.windshield = windshield;

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

    const panel = mesh(boxGeo(2.0, 0.85, 0.12), panelDark, 0, 0.7, FUSE_LEN / 2 + 0.55);
    panel.rotation.x = 0.14;
    g.add(panel);
    const face = flatMesh(new THREE.PlaneGeometry(1.86, 0.76), new THREE.MeshBasicMaterial({ map: panelTex }), 0, 0, -0.062);
    face.rotation.y = Math.PI;
    panel.add(face);

    // Two seats (pilot Prospect, copilot/navigator Irish) and the eye point.
    const seatMat = solid(0x3a3228, { roughness: 0.95 });
    for (const sx of [-1, 1]) {
      g.add(mesh(boxGeo(0.55, 0.14, 0.55), seatMat, sx * 0.5, -0.25, FUSE_LEN / 2 - 0.2));
      g.add(mesh(boxGeo(0.55, 0.7, 0.14), seatMat, sx * 0.5, 0.1, FUSE_LEN / 2 - 0.45));
    }

    /* Seated eye: left seat (Prospect flies), just under the cabin roof —
     * same reasoning as the Brushrunner's `pilotEye`: high enough to see over
     * the coaming, low enough to stay under the roof line. */
    this.pilotEye = new THREE.Vector3(-0.5, 1.05, FUSE_LEN / 2 - 0.1);
    this.copilotSeat = new THREE.Vector3(0.5, -0.15, FUSE_LEN / 2 - 0.35);
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
   * @param {object} [state] { bombBayOpen, dusk, gLat, roughness, concern }
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
