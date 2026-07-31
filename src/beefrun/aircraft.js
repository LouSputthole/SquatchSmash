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
import { Instruments } from './instruments.js';

const CREAM = 0xd9cfb4;
const CREAM_PATCH = 0xc3b795;
const BROWN = 0x7a5230;
const BROWN_DARK = 0x4f351f;
const METAL = 0x9aa0a6;

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

/** Mission tally: little footprints under the completed-run markings. */
function tallyTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9cfb4';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#3a2f5f';
  for (let i = 0; i < 9; i++) {
    const x = 18 + i * 26;
    ctx.beginPath();
    ctx.ellipse(x, 38, 6, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let t = 0; t < 3; t++) {
      ctx.beginPath();
      ctx.ellipse(x - 5 + t * 5, 24, 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
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
      cup: 0, cupVel: 0,
      cargoDoor: 0,
      flapVisual: 0,
      concern: 0,
      lighterSpark: 0,
    };
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

    // ---- Fuselage: slab-sided box with a rounded nose and a tapered boom ----
    const body = mesh(boxGeo(1.86, 1.94, 7.4), skin, 0, 0, 0.4);
    g.add(body);
    // Mismatched replacement panels. Nobody has ever repainted this aeroplane.
    g.add(mesh(boxGeo(1.9, 0.62, 1.5), patch, 0, 0.34, -1.2));
    g.add(mesh(boxGeo(1.9, 0.44, 0.9), patch, 0, -0.5, 1.9));
    // Riveted belly strake.
    g.add(mesh(boxGeo(1.5, 0.1, 6.8), metal, 0, -0.99, 0.4));

    const nose = mesh(cylGeo(0.42, 0.94, 1.5, 12), skin, 0, 0.05, 4.6);
    nose.rotation.x = Math.PI / 2;
    g.add(nose);
    g.add(mesh(boxGeo(1.7, 1.6, 0.9), skin, 0, 0.05, 3.9));

    // Tail boom.
    const boom = mesh(cylGeo(0.42, 0.92, 4.6, 10), skin, 0, 0.16, -4.6);
    boom.rotation.x = Math.PI / 2;
    g.add(boom);

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

    // ---- Engines ----
    this.parts.prop = [];
    this.parts.propDisc = [];
    this.parts.exhaust = [];
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
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

    // ---- Tail ----
    const fin = mesh(boxGeo(0.18, 2.5, 1.9), skin, 0, 1.6, -6.1);
    g.add(fin);
    g.add(mesh(boxGeo(0.2, 0.7, 1.0), trim, 0, 2.6, -6.3));
    const rudderPivot = new THREE.Group();
    rudderPivot.position.set(0, 1.5, -6.9);
    rudderPivot.add(mesh(boxGeo(0.16, 2.3, 0.9), patch, 0, 0, -0.45));
    g.add(rudderPivot);
    this.parts.rudder = rudderPivot;

    const stab = mesh(boxGeo(5.4, 0.16, 1.2), skin, 0, 0.66, -5.9);
    g.add(stab);
    const elevPivot = new THREE.Group();
    elevPivot.position.set(0, 0.66, -6.5);
    elevPivot.add(mesh(boxGeo(5.4, 0.14, 0.7), patch, 0, 0, -0.35));
    g.add(elevPivot);
    this.parts.elevator = elevPivot;

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

    // ---- Cargo door, port side aft ----
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
    const emblemMat = mat({ map: emblemTexture(), roughness: 0.9 });
    for (const sx of [-1, 1]) {
      const emblem = flatMesh(new THREE.PlaneGeometry(0.9, 0.9), emblemMat, sx * 0.945, 0.28, 1.28);
      emblem.rotation.y = sx * Math.PI / 2;
      g.add(emblem);
    }
    const tally = flatMesh(new THREE.PlaneGeometry(1.1, 0.28), mat({ map: tallyTexture(), roughness: 0.9 }), -0.945, -0.35, 1.35);
    tally.rotation.y = -Math.PI / 2;
    g.add(tally);

    // ---- Glazing ----
    const windshield = mesh(boxGeo(1.62, 0.92, 0.1), glassMat, 0, 0.72, 3.42);
    windshield.rotation.x = -0.34;
    windshield.castShadow = false;
    g.add(windshield);
    this.parts.windshield = windshield;
    for (const sx of [-1, 1]) {
      const side = mesh(boxGeo(0.06, 0.72, 1.5), glassMat, sx * 0.94, 0.55, 2.5);
      side.castShadow = false;
      g.add(side);
      const port = mesh(boxGeo(0.06, 0.5, 0.6), glassMat, sx * 0.94, 0.45, 0.6);
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
    panel.rotation.x = 0.16;
    g.add(panel);
    /* The gauges hang off the panel's own back face, turned to look at the
     * left seat. They used to be a plane facing the propeller, which is a
     * single-sided material pointed at nobody: six instruments drawn every
     * frame into a canvas that the only person aboard could not see. */
    const face = flatMesh(new THREE.PlaneGeometry(1.5, 0.64), new THREE.MeshBasicMaterial({ map: panelTex }), 0, 0, -0.052);
    face.rotation.y = Math.PI;
    panel.add(face);

    // Glare shield and coaming.
    g.add(mesh(boxGeo(1.7, 0.1, 0.5), trimMat, 0, 0.70, 2.9));

    // Radio stack in the centre pedestal.
    const stack = mesh(boxGeo(0.36, 0.62, 0.28), panelDark, 0, 0.1, 2.7);
    g.add(stack);
    for (let i = 0; i < 3; i++) {
      g.add(flatMesh(boxGeo(0.28, 0.07, 0.02), unlit(0x2fa85c), 0, 0.3 - i * 0.16, 2.56));
    }

    // Two yokes.
    this.parts.yoke = [];
    for (const sx of [-1, 1]) {
      const yokeRoot = new THREE.Group();
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
    for (let i = 0; i < 6; i++) {
      const lever = new THREE.Group();
      lever.position.set(-0.16 + (i % 2) * 0.09 + Math.floor(i / 2) * 0.14 - 0.06, 0.06, 2.44);
      const shaft = mesh(boxGeo(0.035, 0.24, 0.035), metal, 0, 0.12, 0);
      lever.add(shaft);
      lever.add(mesh(sphereGeo(0.045), solid(leverColors[i], { roughness: 0.6 }), 0, 0.25, 0));
      g.add(lever);
      this.parts.lever.push(lever);
    }
    // Flap lever, off to the left of the quadrant.
    const flapLever = new THREE.Group();
    flapLever.position.set(-0.34, 0.06, 2.4);
    flapLever.add(mesh(boxGeo(0.04, 0.3, 0.04), metal, 0, 0.15, 0));
    flapLever.add(mesh(boxGeo(0.1, 0.06, 0.1), solid(0xd9d2c4, { roughness: 0.7 }), 0, 0.31, 0));
    g.add(flapLever);
    this.parts.flapLever = flapLever;

    // Magnetic compass on the windshield post.
    // Hung just under the cabin roof at 0.97, not through it.
    const compassHousing = mesh(boxGeo(0.16, 0.14, 0.14), panelDark, 0, 0.90, 3.0);
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

    // Rudder pedals.
    this.parts.pedal = [];
    for (const sx of [-1, 1]) {
      const pedal = mesh(boxGeo(0.12, 0.04, 0.2), metal, sx * 0.16 - 0.42, -0.42, 2.3);
      pedal.rotation.x = 0.5;
      g.add(pedal);
      this.parts.pedal.push(pedal);
    }

    // Seats.
    for (const sx of [-1, 1]) {
      g.add(mesh(boxGeo(0.5, 0.12, 0.5), seatMat, sx * 0.42, -0.35, 1.72));
      g.add(mesh(boxGeo(0.5, 0.62, 0.12), seatMat, sx * 0.42, -0.05, 1.5));
    }

    // The bobblehead: a sasquatch on a spring, and the honest instrument.
    const bobble = new THREE.Group();
    bobble.position.set(0.3, 0.70, 2.94);          // stands on the coaming
    const bobBody = mesh(cylGeo(0.035, 0.045, 0.07, 8), solid(0x6b5a44, { roughness: 1 }), 0, 0.03, 0);
    bobble.add(bobBody);
    const bobHead = new THREE.Group();
    bobHead.position.y = 0.075;
    bobHead.add(mesh(sphereGeo(0.05), solid(0xa8a2b4, { roughness: 1 }), 0, 0, 0));
    bobHead.add(mesh(boxGeo(0.09, 0.02, 0.02), solid(0xd92e2e, { roughness: 0.9 }), 0, 0.01, 0.045));
    bobble.add(bobHead);
    g.add(bobble);
    this.parts.bobble = bobHead;

    // "World's Okayest Pilot", parked on the coaming where it will not stay.
    const cup = new THREE.Group();
    cup.position.set(-0.2, 0.77, 2.86);            // and so does the coffee
    cup.add(mesh(cylGeo(0.045, 0.04, 0.11, 10), solid(0xe8e2d4, { roughness: 0.75 }), 0, 0.055, 0));
    const handle = mesh(cylGeo(0.022, 0.022, 0.014, 8), solid(0xe8e2d4, { roughness: 0.75 }), 0.052, 0.055, 0);
    handle.rotation.x = Math.PI / 2;
    cup.add(handle);
    g.add(cup);
    this.parts.cup = cup;
    this.parts.cupHome = cup.position.clone();

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
    placard('IGNORE BELOW 20', 0.3, 0.05, -0.42, 0.05, 2.79);
    placard('GENERAL CONCERN', 0.26, 0.045, 0.52, 0.72, 2.83, { bg: '#3a3630', fg: '#e8c86a' });

    // The warning light itself, above its label.
    const concern = flatMesh(boxGeo(0.09, 0.045, 0.02), unlit(0x3a2a10), 0.52, 0.77, 2.82);
    g.add(concern);
    this.parts.concernLight = concern;

    // The taped map, wedged behind the copilot's yoke.
    const map = flatMesh(
      new THREE.PlaneGeometry(0.34, 0.24),
      new THREE.MeshBasicMaterial({
        map: signTexture(['EL HUESO', '(approx.)'], { w: 256, h: 192, bg: '#ddd0ab', fg: '#5a4a2a', border: '#9a8a5a', rough: true }),
      }),
      0.62, 0.2, 2.7,
    );
    map.rotation.set(0.7, -0.3, 0.12);
    g.add(map);
    for (const tx of [-0.14, 0.14]) {
      const tape = flatMesh(new THREE.PlaneGeometry(0.06, 0.05), unlit(0xe8e2c8, { transparent: true, opacity: 0.7 }), 0.62 + tx, 0.29, 2.69);
      tape.rotation.copy(map.rotation);
      g.add(tape);
    }

    // Cigarette lighter that sometimes has an opinion.
    const lighter = flatMesh(cylGeo(0.02, 0.02, 0.02, 8), unlit(0x2a2a2a), -0.6, 0.12, 2.78);
    lighter.rotation.x = Math.PI / 2 + 0.16;
    g.add(lighter);
    this.parts.lighter = lighter;

    // Where the cameras and the copilot live.
    /* Seated eye: left seat, a hand's width below the cabin roof at y = 0.97,
     * which is where a head goes and where the windshield's glazing actually
     * is. The old 0.62 sat the pilot's eye level with the glare shield. */
    this.pilotEye = new THREE.Vector3(-0.42, 0.80, 2.22);
    this.copilotSeat = new THREE.Vector3(0.42, -0.28, 1.66);
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

    // Lou's coffee slides across the coaming in a bank and comes back.
    const lat = clamp(state.gLat || 0, -3, 3);
    a.cupVel += (-lat * 0.16 - a.cup * 5.5 - a.cupVel * 2.4) * dt;
    a.cup = clamp(a.cup + a.cupVel * dt, -0.34, 0.34);
    this.parts.cup.position.x = this.parts.cupHome.x + a.cup;
    this.parts.cup.rotation.z = -a.cup * 0.6;

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
