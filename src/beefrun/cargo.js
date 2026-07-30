/**
 * CargoWeightSystem — three crates of Silverback Reserve, and what they do to
 * the aeroplane.
 *
 * Weight is the point. Each crate adds mass and moves the centre of gravity,
 * and the physics reads both: too far aft and the nose goes light and the
 * elevator gets vague, too far forward and it will not rotate. The ideal
 * arrangement is one crate in each of the three marked positions, and the
 * diagram on the HUD says so without ever asking anybody to do arithmetic.
 */
import * as THREE from 'three';
import {
  solid, unlit, mat, boxGeo, cylGeo, planeGeo,
  mesh, flatMesh, group, signTexture, clamp, lerp, damp, rng,
} from './util.js';
import { AC } from './config.js';

export const CRATE_MASS = 218;        // kg, each jerky crate
export const GUN_CRATE_MASS = 142;    // kg, each of Old Stove's
const ZONE_ARM = { forward: 1.35, centre: -0.15, rear: -1.75 };   // metres from the datum

/** The label every brick carries. Nobody involved thinks this is funny. */
export function jerkyLabelTexture(batch = '0041') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9cdb0';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = '#5a4a2a';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 148);

  // Cow silhouette.
  ctx.fillStyle = '#2e2418';
  ctx.beginPath();
  ctx.ellipse(52, 62, 26, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(70, 48, 16, 12);                 // head
  ctx.fillRect(34, 74, 6, 16);                  // legs
  ctx.fillRect(64, 74, 6, 16);
  ctx.fillRect(26, 52, 4, 10);                  // tail

  ctx.fillStyle = '#2e2418';
  ctx.font = '900 19px Trebuchet MS, sans-serif';
  ctx.fillText('SILVERBACK', 96, 46);
  ctx.font = '900 15px Trebuchet MS, sans-serif';
  ctx.fillText('RESERVE', 96, 64);
  ctx.font = '700 11px Trebuchet MS, sans-serif';
  ctx.fillText(`BATCH ${batch}`, 96, 82);

  // The silver sasquatch stamp.
  ctx.fillStyle = '#8a90a0';
  ctx.beginPath();
  ctx.arc(210, 60, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d9cdb0';
  ctx.beginPath();
  ctx.ellipse(210, 66, 9, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(202 + i * 5, 48, 2.2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#8a2020';
  ctx.font = '900 12px Trebuchet MS, sans-serif';
  ctx.fillText('NOT FOR INTERNATIONAL RESALE', 14, 112);

  // A cartoon customs officer, crossed out.
  ctx.fillStyle = '#2e2418';
  ctx.fillRect(28, 122, 14, 20);
  ctx.beginPath();
  ctx.arc(35, 118, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(24, 110, 22, 4);                 // peaked cap
  ctx.strokeStyle = '#b42a2a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(18, 106); ctx.lineTo(54, 148);
  ctx.moveTo(54, 106); ctx.lineTo(18, 148);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** One vacuum-sealed brick. */
export function makeJerkyBrick(batch) {
  const g = group('jerky');
  const meat = solid(0x5a2a20, { roughness: 0.55 });
  g.add(mesh(boxGeo(0.28, 0.07, 0.18), meat, 0, 0, 0));
  // The bag: shiny, and slightly bigger than what is in it.
  const bag = mesh(boxGeo(0.31, 0.085, 0.21), mat({
    color: 0xd9cdb0, roughness: 0.3, metalness: 0.25, transparent: true, opacity: 0.85,
  }), 0, 0, 0);
  g.add(bag);
  const label = flatMesh(planeGeo(0.24, 0.15), mat({ map: jerkyLabelTexture(batch), roughness: 0.5 }), 0, 0.045, 0);
  label.rotation.x = -Math.PI / 2;
  g.add(label);
  return g;
}

/**
 * One of Old Stove's crates.
 *
 * Long, flat, stencilled TRACTOR PARTS, and heavier than tractor parts. It does
 * not open, and nobody in the mission ever asks it to.
 */
export function makeGunCrate(index) {
  const g = group(`guncrate${index}`);
  const wood = solid(0x6f6248, { roughness: 1 });
  const woodDark = solid(0x4f4634, { roughness: 1 });
  const W = 1.55, H = 0.42, D = 0.62;
  g.add(mesh(boxGeo(W, H, D), wood, 0, H / 2, 0));
  g.add(mesh(boxGeo(W + 0.05, 0.05, D + 0.05), woodDark, 0, H, 0));
  // Steel banding, and a stencil that fools nobody.
  for (const x of [-W / 3, W / 3]) {
    g.add(mesh(boxGeo(0.05, H + 0.08, D + 0.06), solid(0x8a8578, { roughness: 0.5, metalness: 0.6 }), x, H / 2, 0));
  }
  const stencil = flatMesh(planeGeo(1.15, 0.26), mat({
    map: signTexture(['TRACTOR PARTS', 'FRAGILE'], {
      w: 256, h: 64, bg: '#6f6248', fg: '#22201a', border: null, rough: true,
    }),
    roughness: 1, transparent: true,
  }), 0, H / 2 + 0.02, D / 2 + 0.02);
  g.add(stencil);
  return {
    group: g, lid: null, contents: null, index, kind: 'guns',
    mass: GUN_CRATE_MASS, open: false, damage: 0, slip: 0,
  };
}

/** A crate of jerky, openable so somebody can be serious about the contents. */
export function makeCrate(index) {
  const g = group(`crate${index}`);
  const wood = solid(0x8a6a42, { roughness: 1 });
  const woodDark = solid(0x6b5432, { roughness: 1 });
  const W = 1.15, H = 0.85, D = 0.95;
  // Sides.
  g.add(mesh(boxGeo(W, H, 0.06), wood, 0, H / 2, D / 2));
  g.add(mesh(boxGeo(W, H, 0.06), wood, 0, H / 2, -D / 2));
  g.add(mesh(boxGeo(0.06, H, D), wood, W / 2, H / 2, 0));
  g.add(mesh(boxGeo(0.06, H, D), wood, -W / 2, H / 2, 0));
  g.add(mesh(boxGeo(W, 0.07, D), woodDark, 0, 0.035, 0));
  // Battens.
  for (const y of [0.18, 0.66]) {
    g.add(mesh(boxGeo(W + 0.04, 0.07, 0.02), woodDark, 0, y, D / 2 + 0.04));
  }
  // Stencilled on the side.
  const stencil = flatMesh(planeGeo(0.9, 0.4), mat({
    map: signTexture(['SILVERBACK', `LOT ${40 + index}`], { w: 256, h: 128, bg: '#8a6a42', fg: '#2e2418', border: null, rough: true }),
    roughness: 1, transparent: true,
  }), 0, H / 2, D / 2 + 0.04);
  g.add(stencil);

  // Contents, revealed when the lid comes off.
  const contents = group('contents');
  const rand = rng(0x7e5 + index * 13);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const brick = makeJerkyBrick(String(1200 + index * 30 + row * 3 + col));
      brick.position.set(-0.33 + col * 0.33, 0.14 + row * 0.09, (rand() - 0.5) * 0.1);
      brick.rotation.y = (rand() - 0.5) * 0.14;
      contents.add(brick);
    }
  }
  g.add(contents);

  const lid = mesh(boxGeo(W + 0.06, 0.08, D + 0.06), wood, 0, H, 0);
  g.add(lid);

  return {
    group: g, lid, contents, index, kind: 'jerky',
    mass: CRATE_MASS, open: false, damage: 0, slip: 0,
  };
}

/** The handcart the crates ride to the aeroplane on. */
export function makeHandcart() {
  const g = group('handcart');
  const steel = solid(0x6a5a4a, { roughness: 0.7, metalness: 0.4 });
  g.add(mesh(boxGeo(1.4, 0.09, 1.9), steel, 0, 0.42, 0));
  g.add(mesh(boxGeo(1.4, 0.5, 0.08), steel, 0, 0.7, -0.95));
  for (const sx of [-0.6, 0.6]) {
    g.add(mesh(boxGeo(0.07, 0.4, 0.07), steel, sx, 0.22, 0.7));
    const w = mesh(cylGeo(0.24, 0.24, 0.1, 12), solid(0x22242a, { roughness: 0.9 }), sx, 0.24, -0.6);
    w.rotation.z = Math.PI / 2;
    g.add(w);
    const c = mesh(cylGeo(0.13, 0.13, 0.08, 10), solid(0x22242a, { roughness: 0.9 }), sx, 0.13, 0.75);
    c.rotation.z = Math.PI / 2;
    g.add(c);
  }
  const handle = mesh(boxGeo(1.2, 0.07, 0.07), steel, 0, 1.0, -0.95);
  g.add(handle);
  return { group: g, handle };
}

/* ------------------------------------------------------------------ */

export class CargoWeightSystem {
  /**
   * @param {THREE.Object3D} aircraftGroup crates are parented here once loaded,
   *   so they ride with the aeroplane and shift visibly when it is thrown about.
   */
  constructor(aircraftGroup) {
    this.aircraft = aircraftGroup;
    this.zones = {
      forward: { arm: ZONE_ARM.forward, crate: null, marker: null, strapped: false },
      centre: { arm: ZONE_ARM.centre, crate: null, marker: null, strapped: false },
      rear: { arm: ZONE_ARM.rear, crate: null, marker: null, strapped: false },
    };
    this.loose = [];              // crates in the world, not yet aboard
    this.carried = null;
    this.doorOpen = false;
    this.shift = 0;               // how much the load has moved: 0..1
    this.buildMarkers();
  }

  /** Painted rectangles on the cabin floor, with a stencil in each. */
  buildMarkers() {
    for (const [name, zone] of Object.entries(this.zones)) {
      const g = group(`zone-${name}`);
      const pad = flatMesh(planeGeo(1.3, 1.1), mat({
        map: signTexture([name.toUpperCase()], { w: 256, h: 128, bg: '#3a3226', fg: '#d8c86a', border: '#d8c86a', rough: false }),
        roughness: 1, transparent: true, opacity: 0.9,
      }), 0, -0.92, zone.arm);
      pad.rotation.x = -Math.PI / 2;
      g.add(pad);
      this.aircraft.add(g);
      zone.marker = g;
    }
  }

  showMarkers(on) {
    for (const z of Object.values(this.zones)) z.marker.visible = on;
  }

  /** Total mass of everything aboard, whatever it claims to be. */
  get mass() {
    let m = 0;
    for (const z of Object.values(this.zones)) if (z.crate) m += z.crate.mass ?? CRATE_MASS;
    return m;
  }

  /** What is in the back at the moment: 'jerky', 'guns', 'mixed' or null. */
  get kind() {
    const kinds = new Set(Object.values(this.zones).filter((z) => z.crate).map((z) => z.crate.kind));
    if (!kinds.size) return null;
    return kinds.size > 1 ? 'mixed' : [...kinds][0];
  }

  get crateCount() {
    return Object.values(this.zones).filter((z) => z.crate).length;
  }

  get allStrapped() {
    return Object.values(this.zones).every((z) => !z.crate || z.strapped);
  }

  /**
   * Centre of gravity offset in metres. Positive is nose heavy.
   * Zero when the load is spread the way the placards want it.
   */
  get cgOffset() {
    let moment = 0, mass = 0;
    for (const z of Object.values(this.zones)) {
      if (!z.crate) continue;
      const m = z.crate.mass ?? CRATE_MASS;
      moment += m * (z.arm + z.crate.slip);
      mass += m;
    }
    if (!mass) return 0;
    const arm = moment / mass;
    // Scale into the range the physics expects: a full load all the way aft is
    // about -0.55, which is where the elevator starts feeling like a rumour.
    return clamp(arm * 0.34, -0.6, 0.6);
  }

  /** Where the balance diagram's needle sits: -1 (tail) .. +1 (nose). */
  get balance() {
    return clamp(this.cgOffset / 0.45, -1, 1);
  }

  get balanceState() {
    const b = this.balance;
    if (Math.abs(b) < 0.34) return 'good';
    if (Math.abs(b) < 0.62) return 'marginal';
    return b > 0 ? 'nose' : 'tail';
  }

  /** Put a crate into a marked position. */
  load(zoneName, crate) {
    const zone = this.zones[zoneName];
    if (!zone || zone.crate) return false;
    zone.crate = crate;
    crate.slip = 0;
    crate.zone = zoneName;
    crate.group.position.set(0, -0.86, zone.arm);
    crate.group.rotation.set(0, 0, 0);
    crate.group.scale.setScalar(1);
    this.aircraft.add(crate.group);
    const i = this.loose.indexOf(crate);
    if (i >= 0) this.loose.splice(i, 1);
    return true;
  }

  unload(zoneName) {
    const zone = this.zones[zoneName];
    if (!zone?.crate) return null;
    const crate = zone.crate;
    zone.crate = null;
    zone.strapped = false;
    return crate;
  }

  strap(zoneName) {
    const zone = this.zones[zoneName];
    if (!zone?.crate || zone.strapped) return false;
    zone.strapped = true;
    // The strap itself: two bands over the crate, visibly tight.
    const band = mesh(boxGeo(1.3, 0.05, 0.09), solid(0xd8a13a, { roughness: 0.8 }), 0, 0.45, 0.2);
    zone.crate.group.add(band);
    const band2 = band.clone();
    band2.position.z = -0.2;
    zone.crate.group.add(band2);
    zone.crate.straps = [band, band2];
    return true;
  }

  /**
   * Cargo physics, such as they are: an unstrapped crate slides with lateral
   * and longitudinal acceleration, which moves the CG, which the player then
   * has to fly around. A strapped one creaks and stays put.
   */
  update(dt, { gLat = 0, gLong = 0, gLoad = 1, jolt = 0 } = {}) {
    let worstSlip = 0;
    for (const z of Object.values(this.zones)) {
      const crate = z.crate;
      if (!crate) continue;
      const limit = z.strapped ? 0.06 : 0.42;
      const push = (-gLong * 0.1 + jolt * (Math.random() - 0.5) * 0.4) * (z.strapped ? 0.12 : 1);
      crate.slip = clamp(damp(crate.slip + push * dt, 0, z.strapped ? 6 : 0.5, dt), -limit, limit);
      crate.group.position.z = z.arm + crate.slip;
      crate.group.position.x = clamp(damp(crate.group.position.x + gLat * dt * (z.strapped ? 0.02 : 0.09), 0, 1.5, dt), -0.34, 0.34);
      crate.group.rotation.z = -crate.group.position.x * 0.25;
      if (z.strapped && crate.straps) {
        const strain = clamp(Math.abs(gLoad - 1) * 0.4 + Math.abs(crate.slip) * 3, 0, 1);
        for (const s of crate.straps) s.scale.y = 1 - strain * 0.35;
      }
      // Hard g bruises the packages.
      if (gLoad > 2.6 || jolt > 0.6) {
        crate.damage = clamp(crate.damage + dt * (gLoad - 2.2) * 0.2 + jolt * dt * 0.4, 0, 1);
      }
      worstSlip = Math.max(worstSlip, Math.abs(crate.slip) / 0.42);
    }
    this.shift = worstSlip;
  }

  /** 0..1: how much of the shipment arrived in a state Cecilio would accept. */
  get intact() {
    const crates = Object.values(this.zones).map((z) => z.crate).filter(Boolean);
    if (!crates.length) return 0;
    return 1 - crates.reduce((s, c) => s + c.damage, 0) / crates.length;
  }

  /** Empty the hold, handing the crates back to the caller. */
  removeAll() {
    const out = [];
    for (const name of Object.keys(this.zones)) {
      const crate = this.unload(name);
      if (crate) out.push(crate);
    }
    return out;
  }

  get packagesDelivered() {
    const crates = Object.values(this.zones)
      .map((z) => z.crate)
      .filter((c) => c && c.kind === 'jerky');
    return crates.reduce((n, c) => n + Math.round(9 * (1 - c.damage)), 0);
  }

  /** Mass and balance handed to the physics each frame. */
  applyTo(physics, fuelMass) {
    physics.mass = AC.emptyMass + fuelMass + this.mass;
    physics.cgOffset = this.cgOffset;
    void lerp; void unlit;
  }
}
