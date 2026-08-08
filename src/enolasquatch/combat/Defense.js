/**
 * Defense — what the ground does about an aeroplane over Squatchbourg.
 *
 * Owner, 2026-08-04: "the flak coming from the ground is bad ass. Let's really
 * refine that."
 *
 * The first version of this file said, in its own header, that it was
 * "cinematic spectacle, not a combat simulation": puffs bloomed near the flight
 * path rather than being aimed at it, and a "hit" was a roll made when the puff
 * was spawned. It read well and it did not MEAN anything, because nothing about
 * where the player flew changed what the guns did.
 *
 * It is now a real, if simple, anti-aircraft problem, and every part of it is
 * something the player can work against:
 *
 *   BATTERIES, NOT PUFFS. `FLAK_BATTERIES` four-gun positions stand in a ring
 *     round the target. Each one tracks, elevates, flashes and fires a SALVO,
 *     and the shells have flight time — a fuse is set for where the aeroplane
 *     is predicted to be `t` seconds from now, and if the prediction is wrong
 *     the salvo bursts behind it. Turning is therefore the answer to flak, the
 *     same way it is in life.
 *
 *   A BARRAGE BOX. The prediction carries an error that GROWS with how hard the
 *     aeroplane is being manoeuvred and SHRINKS the longer it holds a heading —
 *     `trackQuality` below. Straight and level for twenty seconds and the
 *     battery has the range; that is the price of the autopilot, and it is the
 *     same number `../systems/Autopilot.js` feeds the fighters.
 *
 *   PROXIMITY. A burst does damage as a function of how close it actually was,
 *     not of a coin toss made at spawn time: inside `LETHAL_RADIUS` it takes an
 *     engine or opens the wing; out to `RATTLE_RADIUS` it is shrapnel on the
 *     skin and a shake; beyond that it is a noise and a light. `onFlakBurst` is
 *     handed the real distance so the mission can shake the camera and the
 *     audio can pitch the crack correctly.
 *
 *   DENSITY THAT MEANS SOMETHING. `intensity` scales the salvo rate, the number
 *     of guns that join in and the fuse accuracy together, and the mission
 *     raises it as the aeroplane closes on the target and while a searchlight
 *     has it.
 *
 * Damage stays exactly where it was: `damageEngine(i)`, `damageRudder()`,
 * `damageElectrical()`, `damageFuel()` flip a flag and call `onHit`, and the
 * mission phase decides what that costs the player to fly.
 * `triggerCatastrophic()` is still the one rare, mission-scripted exception
 * that nothing in this file ever calls on its own. `./Interceptors.js` routes
 * ITS damage through the same four methods for the same reason.
 *
 * FIRING BLANKS. `liveFire` (constructor option, default TRUE — this class on
 * its own is a real battery) is the one switch between a barrage that costs
 * something and a barrage that is scenery. False gates `_resolveHit()` and
 * nothing else: every gun, salvo, shell, burst, puff, splinter, tracer,
 * searchlight, camera shake and sound is unchanged, and the four `damageX()`
 * methods still work when something else calls them, because they are also the
 * API a mission or a test drives directly. The Enola Squatch sets it from
 * `LIVE_FIRE.flak` in `../config.js` — see that flag for why, and for how to
 * turn the beating back on.
 */
import * as THREE from 'three';
import {
  solid, unlit, boxGeo, cylGeo, coneGeo, sphereGeo,
  mesh, flatMesh, group, clamp, lerp, damp, smoothstep, rng,
} from '../../beefrun/util.js';
import { TracerPool } from './Tracers.js';

const SEARCHLIGHT_COUNT = 6;
const GUN_COUNT = 7;
const VEHICLE_COUNT = 2;
export const FLAK_BATTERIES = 8;
/** Guns in a battery. They fire together, which is what a salvo is. */
export const BATTERY_GUNS = 4;

/** Inside this a burst takes something off the aeroplane. */
export const LETHAL_RADIUS = 34;
/** Inside this it is splinters on the skin and a very bad noise. */
export const RATTLE_RADIUS = 95;
/** Inside this you hear it and feel it and nothing else happens. */
export const HEARD_RADIUS = 320;
/** Long enough to leave a black flower, short enough not to become a decal. */
export const FLAK_PUFF_SECONDS = 5.5;

const SHELL_SPEED = 720;         // m/s, muzzle — flight time is the whole point
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _forward = new THREE.Vector3(0, 0, 1);

/* ------------------------------------------------------------------ */
/* Props — cheap, readable, built from the same boxes-and-cylinders     */
/* register as the rest of the project.                                */
/* ------------------------------------------------------------------ */

function makeSearchlight() {
  const g = group('defense-searchlight');
  const base = mesh(cylGeo(0.9, 1.1, 0.6, 10), solid(0x3a3a3e, { roughness: 0.7, metalness: 0.4 }), 0, 0.3, 0);
  g.add(base);
  const yoke = new THREE.Group();
  yoke.position.set(0, 0.7, 0);
  g.add(yoke);
  const head = mesh(cylGeo(0.55, 0.6, 0.7, 12), solid(0xc9c4b0, { roughness: 0.35, metalness: 0.5 }), 0, 0, 0);
  head.rotation.x = Math.PI / 2;
  yoke.add(head);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xeaf2ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(14, 340, 14, 1, true), beamMat);
  beam.position.set(0, -170, 0.4);
  beam.rotation.x = Math.PI / 2;
  beam.frustumCulled = false;
  yoke.add(beam);
  const lamp = new THREE.SpotLight(0xeaf2ff, 0, 480, 0.16, 0.4, 1);
  lamp.position.set(0, 0, 0.35);
  yoke.add(lamp, lamp.target);
  lamp.target.position.set(0, 0, 60);

  return { group: g, yoke, beam, beamMat, lamp };
}

/** A ground gun position — a pintle mount on a sandbag ring, no crew model needed. */
function makeGunEmplacement() {
  const g = group('defense-gun');
  const bags = solid(0x8a7a58, { roughness: 1 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(boxGeo(0.9, 0.5, 0.6), bags, Math.cos(a) * 1.6, 0.25, Math.sin(a) * 1.6));
  }
  const mount = mesh(cylGeo(0.18, 0.18, 0.9, 8), solid(0x2a2c30, { roughness: 0.6, metalness: 0.6 }), 0, 0.7, 0);
  g.add(mount);
  const yoke = new THREE.Group();
  yoke.position.set(0, 1.05, 0);
  g.add(yoke);
  const barrel = mesh(cylGeo(0.05, 0.06, 1.6, 8), solid(0x1c1e22, { roughness: 0.5, metalness: 0.7 }), 0, 0, 0.8);
  barrel.rotation.x = Math.PI / 2;
  yoke.add(barrel);
  const muzzleFlash = flatMesh(sphereGeo(0.22, 8, 6), unlit(0xfff2b0), 0, 0, 1.6);
  muzzleFlash.visible = false;
  yoke.add(muzzleFlash);
  return { group: g, yoke, muzzleFlash };
}

/**
 * A heavy anti-aircraft battery: four long guns on a revetted ring, a
 * predictor hut in the middle, and a barrel that actually elevates.
 *
 * The elevation is not decoration. A battery that has the aeroplane tracked
 * points at it, and a battery that has lost it swings about looking — which is
 * legible from three thousand feet and is the only visual tell the player has
 * for whether the box has him.
 */
function makeFlakBattery() {
  const g = group('flak-battery');
  const earth = solid(0x4a4234, { roughness: 1 });
  const steel = solid(0x2a2e32, { roughness: 0.5, metalness: 0.65 });
  // The revetment.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(mesh(boxGeo(4.6, 1.8, 2.2), earth, Math.cos(a) * 12, 0.9, Math.sin(a) * 12));
  }
  // The predictor and its crew hut.
  g.add(mesh(boxGeo(3.4, 2.2, 4.2), solid(0x3a3a34, { roughness: 0.95 }), 0, 1.1, 0));

  const guns = [];
  for (let i = 0; i < BATTERY_GUNS; i++) {
    const a = (i / BATTERY_GUNS) * Math.PI * 2 + Math.PI / 4;
    const gun = new THREE.Group();
    gun.position.set(Math.cos(a) * 6.6, 0, Math.sin(a) * 6.6);
    g.add(gun);
    gun.add(mesh(cylGeo(1.5, 1.7, 0.5, 10), steel, 0, 0.25, 0));
    const traverse = new THREE.Group();
    traverse.position.y = 0.6;
    gun.add(traverse);
    const cradle = mesh(boxGeo(1.2, 0.7, 1.2), steel, 0, 0.35, 0);
    traverse.add(cradle);
    const elevate = new THREE.Group();
    elevate.position.y = 0.9;
    traverse.add(elevate);
    const barrel = mesh(cylGeo(0.16, 0.2, 6.2, 10), steel, 0, 0, 3.1);
    barrel.rotation.x = Math.PI / 2;
    elevate.add(barrel);
    /* Its OWN material. `unlit()` caches by colour-plus-options, so every gun
     * on every battery would otherwise share one — and a salvo from the near
     * battery would flash the muzzles of all eight of them at once. */
    const flash = flatMesh(sphereGeo(0.85, 10, 8), new THREE.MeshBasicMaterial({
      color: 0xfff0b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false,
    }), 0, 0, 6.6);
    elevate.add(flash);
    guns.push({ group: gun, traverse, elevate, flash, muzzle: new THREE.Vector3(0, 1.5, 6.4) });
  }
  return { group: g, guns, yaw: 0, pitch: 0.6 };
}

/** A gun truck — a pickup silhouette with a mount on the bed, patrols a short lane. */
function makeGunTruck() {
  const g = group('defense-truck');
  const body = solid(0x4a4838, { roughness: 0.65, metalness: 0.2 });
  g.add(mesh(boxGeo(2.0, 0.9, 5.0), body, 0, 1.0, 0));
  g.add(mesh(boxGeo(1.8, 0.9, 1.8), body, 0, 1.75, 1.4));
  for (const sx of [-0.85, 0.85]) {
    for (const sz of [-1.6, 1.6]) {
      g.add(mesh(cylGeo(0.42, 0.42, 0.3, 10), solid(0x1c1c20, { roughness: 0.95 }), sx, 0.42, sz));
    }
  }
  const gun = makeGunEmplacement();
  gun.group.position.set(0, 1.5, -1.2);
  gun.group.scale.setScalar(0.7);
  g.add(gun.group);
  return { group: g, gun };
}

/** A small light aircraft, patrolling for scale — decorative, not a shooter. */
function makeLightAircraft() {
  const g = group('defense-plane');
  const skin = solid(0x5a4a3a, { roughness: 0.5, metalness: 0.35 });
  g.add(mesh(boxGeo(1.1, 1.1, 5.6), skin, 0, 0, 0));
  const nose = mesh(coneGeo(0.5, 1.3, 8), skin, 0, 0, 3.1);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  g.add(mesh(boxGeo(8.4, 0.18, 1.1), skin, 0, 0.35, 0.2));
  g.add(mesh(boxGeo(0.14, 1.3, 1.0), skin, 0, 0.7, -2.4));
  g.add(mesh(boxGeo(2.6, 0.14, 0.7), skin, 0, 0.15, -2.5));
  for (const sx of [-1, 1]) {
    const s = flatMesh(sphereGeo(0.1), unlit(sx < 0 ? 0xff2a1e : 0x37ff6a), sx * 4.2, 0, 0.2);
    g.add(s);
  }
  return { group: g };
}

/**
 * One flak burst.
 *
 * Four parts, and each of them is doing a job the others cannot: the white
 * core, which is only there for about a tenth of a second and is what makes it
 * read as an explosion rather than as a cloud appearing; the black puff, which
 * expands fast and then hangs in the air for the best part of ten seconds and
 * drifts, which is what makes a barrage look like a barrage instead of like a
 * particle effect; the shrapnel, thrown outward on real arcs; and a real
 * PointLight, so a close one actually lights the aeroplane.
 */
function makeFlakBurst() {
  const g = group('flak-burst');
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfff6d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
  });
  const core = new THREE.Mesh(sphereGeo(1, 12, 8), coreMat);
  g.add(core);
  const puffMat = new THREE.MeshBasicMaterial({
    color: 0x24211e, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false,
  });
  const puff = new THREE.Mesh(sphereGeo(1, 12, 9), puffMat);
  g.add(puff);
  // A second, offset lump so the puff is not a perfect ball.
  const lumpMat = new THREE.MeshBasicMaterial({
    color: 0x35302a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false,
  });
  const lump = new THREE.Mesh(sphereGeo(1, 10, 8), lumpMat);
  g.add(lump);
  const bits = [];
  for (let i = 0; i < 5; i++) {
    const bit = new THREE.Mesh(boxGeo(0.5, 0.5, 2.2), new THREE.MeshBasicMaterial({
      color: 0xffb060, transparent: true, opacity: 0, toneMapped: false, fog: false,
    }));
    g.add(bit);
    bits.push(bit);
  }
  return { group: g, core, coreMat, puff, puffMat, lump, lumpMat, bits };
}

/* ------------------------------------------------------------------ */

export class Defense {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [opts]
   * @param {(x:number,z:number)=>number} [opts.getHeight] ground sampler used
   *   only to sit props on the ground.
   */
  constructor(scene, { getHeight = null, liveFire = true } = {}) {
    this.scene = scene;
    this.getHeight = getHeight;
    /**
     * Whether a burst or a tracer that connects actually takes something off
     * the aeroplane. See the FIRING BLANKS note in this file's header — false
     * changes the CONSEQUENCE and nothing about the show. Writable at runtime.
     */
    this.liveFire = liveFire;
    this.root = group('compound-defense');
    scene.add(this.root);

    this.searchlights = [];
    this.guns = [];
    this.batteries = [];
    this.trucks = [];
    this.planes = [];
    this.tracers = null;
    this._flakPool = [];
    this._activeFlak = [];
    this._shells = [];
    /* ONE light for the whole barrage, not one per burst.
     *
     * A burst wants a real light on it — that is most of what makes a close
     * one frightening — but twenty pooled bursts each carrying a PointLight is
     * twenty lights in the scene, which recompiles every shader in it and then
     * runs them at twenty lights a fragment. This one is moved to the newest
     * burst and re-struck, which reads identically because a burst is only
     * bright for a tenth of a second anyway. */
    this.flashLight = null;

    this.center = new THREE.Vector3();
    this.deployed = false;
    this.state = 'idle';           // idle | opening | active | suppressed
    this._openedFired = false;
    this._fireTimer = 2.4;
    this._salvoTimer = 1.6;
    this._t = 0;

    this.caught = false;
    this._caughtDwell = 0;

    /** Rare/scripted intensity multiplier for how aggressively it fires. */
    this.intensity = 1;

    /**
     * 0..1 — how well the predictor has the aeroplane. Built up by a target
     * that holds a heading and an altitude, knocked down by one that does not.
     * This is the number that makes flak a MECHANIC rather than weather.
     */
    this.trackQuality = 0;
    this._lastHeading = null;

    this.damage = {
      engines: [false, false, false, false],
      rudder: false,
      electrical: false,
      fuel: false,
      catastrophic: false,
    };
    this.hitCount = 0;
    this.burstsFired = 0;
    this.nearMisses = 0;

    this.onOpen = null;             // () => void — first shot fired
    this.onHit = null;              // (kind, detail) => void — a shot/burst connected
    this.onCaught = null;           // (caught:boolean) => void — searchlight lock changed
    this.onSuppressed = null;       // () => void — mission ends active fire
    this.onCatastrophic = null;     // (reason:string) => void
    /** (distance:number, point:THREE.Vector3, severity:number) => void */
    this.onFlakBurst = null;
    /** () => void — splinters actually struck the aeroplane. */
    this.onShrapnel = null;
  }

  /**
   * Stand up the compound's defenses around a centre point.
   * @param {{x:number, z:number}} center
   * @param {object} [opts]
   * @param {number} [opts.groundY] flat ground elevation to place props on.
   * @param {number} [opts.radius] rough spread of the emplacements, metres.
   * @param {number} [opts.patrolPlanes] decorative light aircraft. Set to 0
   *   when `./Interceptors.js` has real fighters up, so a player never has to
   *   work out which of two similar silhouettes is the one shooting at him.
   */
  deploy(center, { groundY = 250, radius = 420, patrolPlanes = 2 } = {}) {
    this.clear();
    this.center.set(center.x, groundY, center.z);
    const groundAt = (x, z) => (this.getHeight ? this.getHeight(x, z) : groundY);
    const rand = rng(0xE50 + Math.round(center.x));
    this.tracers = new TracerPool(this.root, 120);

    for (let i = 0; i < SEARCHLIGHT_COUNT; i++) {
      const a = (i / SEARCHLIGHT_COUNT) * Math.PI * 2 + rand() * 0.6;
      const r = radius * (0.55 + rand() * 0.5);
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      const s = makeSearchlight();
      s.group.position.set(x, groundAt(x, z), z);
      s.sweepPhase = rand() * Math.PI * 2;
      s.sweepSpeed = 0.35 + rand() * 0.25;
      s.baseYaw = rand() * Math.PI * 2;
      this.root.add(s.group);
      this.searchlights.push(s);
    }

    for (let i = 0; i < GUN_COUNT; i++) {
      const a = (i / GUN_COUNT) * Math.PI * 2 + 0.3;
      const r = radius * (0.35 + rand() * 0.5);
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      const gunProp = makeGunEmplacement();
      gunProp.group.position.set(x, groundAt(x, z), z);
      this.root.add(gunProp.group);
      this.guns.push(gunProp);
    }

    /* The heavy batteries: a ring further out than the light guns, because
     * that is where they belong — they are shooting at four thousand feet, not
     * at the fence. */
    for (let i = 0; i < FLAK_BATTERIES; i++) {
      const a = (i / FLAK_BATTERIES) * Math.PI * 2 + rand() * 0.35;
      const r = radius * (1.15 + rand() * 0.85);
      const x = center.x + Math.cos(a) * r;
      const z = center.z + Math.sin(a) * r;
      const battery = makeFlakBattery();
      battery.group.position.set(x, groundAt(x, z), z);
      battery.position = new THREE.Vector3(x, groundAt(x, z), z);
      battery.cool = rand() * 2;
      battery.tracking = 0;
      this.root.add(battery.group);
      this.batteries.push(battery);
    }

    for (let i = 0; i < VEHICLE_COUNT; i++) {
      const truck = makeGunTruck();
      const a = rand() * Math.PI * 2;
      const r = radius * 0.7;
      truck.from = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
      truck.to = new THREE.Vector3(center.x - Math.cos(a) * r * 0.4, 0, center.z - Math.sin(a) * r * 0.4);
      truck.from.y = groundAt(truck.from.x, truck.from.z);
      truck.to.y = groundAt(truck.to.x, truck.to.z);
      truck.t = rand();
      truck.speed = 0.05 + rand() * 0.03;
      truck.group.position.copy(truck.from);
      this.root.add(truck.group);
      this.trucks.push(truck);
    }

    for (let i = 0; i < patrolPlanes; i++) {
      const plane = makeLightAircraft();
      plane.orbitR = radius * (1.1 + i * 0.3);
      plane.orbitY = groundY + 220 + i * 60;
      plane.orbitPhase = rand() * Math.PI * 2;
      plane.orbitSpeed = 0.12 + rand() * 0.04;
      this.root.add(plane.group);
      this.planes.push(plane);
    }

    for (let i = 0; i < 18; i++) this._flakPool.push(makeFlakBurst());
    this.flashLight = new THREE.PointLight(0xffc070, 0, 900, 1.4);
    this.root.add(this.flashLight);
    this._flashT = 0;

    this.deployed = true;
    this.state = 'opening';
    this._openedFired = false;
    this._fireTimer = 2.2;
    this._salvoTimer = 1.0;
    this._t = 0;
    this.caught = false;
    this._caughtDwell = 0;
    this.trackQuality = 0;
    this._lastHeading = null;
  }

  clear() {
    this.root.clear();
    this.searchlights.length = 0;
    this.guns.length = 0;
    this.batteries.length = 0;
    this.trucks.length = 0;
    this.planes.length = 0;
    this._flakPool.length = 0;
    this._activeFlak.length = 0;
    this._shells.length = 0;
    this.tracers?.dispose();
    this.tracers = null;
    this.flashLight = null;
    this.deployed = false;
    this.state = 'idle';
    this.caught = false;
  }

  /** Mission calls this to script the end of an active engagement. */
  suppress() {
    if (this.state !== 'active' && this.state !== 'opening') return;
    this.state = 'suppressed';
    this.onSuppressed?.();
  }

  /* ---------------------------------------------------------------- */
  /* Damage — simple, mission-driven, see the file header.             */
  /* ---------------------------------------------------------------- */

  damageEngine(index) {
    if (index < 0 || index > 3 || this.damage.engines[index]) return false;
    this.damage.engines[index] = true;
    this.hitCount++;
    this.onHit?.('engine', index);
    return true;
  }

  damageRudder() {
    if (this.damage.rudder) return false;
    this.damage.rudder = true;
    this.hitCount++;
    this.onHit?.('rudder');
    return true;
  }

  damageElectrical() {
    if (this.damage.electrical) return false;
    this.damage.electrical = true;
    this.hitCount++;
    this.onHit?.('electrical');
    return true;
  }

  damageFuel() {
    if (this.damage.fuel) return false;
    this.damage.fuel = true;
    this.hitCount++;
    this.onHit?.('fuel');
    return true;
  }

  /**
   * The one deliberately rare exception. Never called from anywhere in this
   * file's own combat loop — only a mission phase, on its own script, should
   * ever call this. See the class header.
   */
  triggerCatastrophic(reason = 'flak') {
    if (this.damage.catastrophic) return false;
    this.damage.catastrophic = true;
    this.onCatastrophic?.(reason);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Per-frame                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * @param {number} dt
   * @param {object} o
   * @param {THREE.Vector3} o.position   the aeroplane
   * @param {THREE.Vector3} [o.velocity]
   * @param {number} [o.headingDeg]      for the predictor's track quality
   * @param {number} [o.evasion] 0..1 — how hard it is being thrown about. The
   *   mission computes it once and hands the same number here and to
   *   `./Interceptors.js`, so both threats agree about what evading looks like.
   */
  update(dt, { position, velocity = null, headingDeg = null, evasion = 0 } = {}) {
    if (!this.deployed) return this.state;
    this._t += dt;

    this._updateTrack(dt, headingDeg, evasion);
    this._updateSearchlights(dt, position);
    this._updateBatteries(dt, position, velocity);
    this._updateTrucks(dt);
    this._updatePlanes(dt);
    this.tracers?.update(dt);
    this._updateShells(dt, position);
    this._updateFlak(dt);

    if (this.state === 'opening' || this.state === 'active') {
      this._fireTimer -= dt;
      if (this._fireTimer <= 0) {
        this._fireTracer(position);
        this._fireTimer = lerp(2.6, 0.55, clamp(this.intensity, 0, 1.6) / 1.6) * (0.6 + Math.random() * 0.8);
        if (!this._openedFired) {
          this._openedFired = true;
          this.state = 'active';
          this.onOpen?.();
        }
      }
      this._salvoTimer -= dt;
      if (this._salvoTimer <= 0) {
        this._fireSalvo(position, velocity);
        // Density: the harder the battery is pressed, and the better it has
        // the aeroplane, the less time there is between salvos.
        const heat = clamp(this.intensity, 0, 1.8) / 1.8;
        this._salvoTimer = lerp(3.4, 0.9, heat) * lerp(1.25, 0.72, this.trackQuality)
          * (0.65 + Math.random() * 0.7);
      }
    }

    return this.state;
  }

  /**
   * The predictor's confidence.
   *
   * Holding a heading feeds it; changing one starves it. It saturates in about
   * eighteen seconds of straight flight and falls away in about four seconds of
   * genuine manoeuvring, which is roughly the trade a bomber crew is making
   * when they decide whether to fly the run or break out of it.
   */
  _updateTrack(dt, headingDeg, evasion) {
    let change = 0;
    if (headingDeg !== null && this._lastHeading !== null) {
      let d = (headingDeg - this._lastHeading) % 360;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      change = Math.abs(d) / Math.max(dt, 1e-3);
    }
    if (headingDeg !== null) this._lastHeading = headingDeg;
    const disturbed = clamp(change / 6, 0, 1) * 0.7 + clamp(evasion, 0, 1);
    const want = clamp(1 - disturbed, 0, 1);
    this.trackQuality = damp(this.trackQuality, want, want > this.trackQuality ? 0.09 : 0.6, dt);
  }

  _updateSearchlights(dt, position) {
    let anyOnTarget = false;
    for (const s of this.searchlights) {
      s.sweepPhase += dt * s.sweepSpeed;
      const toTarget = position ? _v.subVectors(position, s.group.position).clone() : null;
      const wantYaw = toTarget && toTarget.lengthSq() > 1
        ? Math.atan2(toTarget.x, toTarget.z)
        : s.baseYaw + Math.sin(s.sweepPhase) * 0.9;
      const patrolYaw = s.baseYaw + Math.sin(s.sweepPhase) * 1.1;
      const dist = toTarget ? toTarget.length() : Infinity;
      const canSee = dist < 2600;
      const targetYaw = canSee ? lerp(patrolYaw, wantYaw, smoothstep(2600, 700, dist)) : patrolYaw;
      s.yaw = damp(s.yaw ?? patrolYaw, targetYaw, 1.4, dt);
      s.pitch = damp(s.pitch ?? -0.3, toTarget ? clamp(Math.atan2(toTarget.y, Math.hypot(toTarget.x, toTarget.z)), -1.2, 0.15) : -0.3, 1.4, dt);
      s.yoke.rotation.set(0, s.yaw, 0);
      s.yoke.rotation.x = 0;
      s.yoke.rotateOnAxis(new THREE.Vector3(1, 0, 0), s.pitch);

      const onTarget = canSee && dist < 1500
        && Math.abs(((wantYaw - s.yaw + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.12;
      s.beamMat.opacity = damp(s.beamMat.opacity, onTarget ? 0.3 : (canSee ? 0.1 : 0.045), 3, dt);
      s.lamp.intensity = damp(s.lamp.intensity, onTarget ? 40 : (canSee ? 8 : 3), 3, dt);
      s.lamp.target.position.set(0, 0, dist > 5 ? Math.min(dist, 400) : 60);
      if (onTarget) anyOnTarget = true;
    }

    if (anyOnTarget) {
      this._caughtDwell = Math.min(1.2, this._caughtDwell + dt);
    } else {
      this._caughtDwell = Math.max(0, this._caughtDwell - dt * 1.6);
    }
    const wasCaught = this.caught;
    this.caught = this._caughtDwell > 0.35;
    if (this.caught !== wasCaught) this.onCaught?.(this.caught);
  }

  /** Point the barrels wherever the predictor thinks the aeroplane will be. */
  _updateBatteries(dt, position, velocity) {
    for (const b of this.batteries) {
      let wantYaw = b.yaw;
      let wantPitch = 0.55;
      let tracking = 0;
      if (position) {
        const range = b.position.distanceTo(position);
        if (range < 5200) {
          const flight = range / SHELL_SPEED;
          _w.copy(position);
          if (velocity) _w.addScaledVector(velocity, flight * this.trackQuality);
          _v.subVectors(_w, b.position);
          wantYaw = Math.atan2(_v.x, _v.z);
          wantPitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
          tracking = 1;
        }
      }
      b.tracking = damp(b.tracking, tracking, 2, dt);
      // A four-gun battery is a heavy thing on a hand crank; it never snaps.
      b.yaw = damp(b.yaw, wantYaw, 1.3 + this.trackQuality * 1.6, dt);
      b.pitch = damp(b.pitch ?? 0.55, wantPitch, 1.3 + this.trackQuality * 1.6, dt);
      for (const gun of b.guns) {
        gun.traverse.rotation.y = b.yaw;
        gun.elevate.rotation.x = -b.pitch;
        if (gun.flash.material.opacity > 0) {
          gun.flash.material.opacity = Math.max(0, gun.flash.material.opacity - dt * 9);
        }
      }
    }
  }

  _updateTrucks(dt) {
    for (const truck of this.trucks) {
      truck.t += dt * truck.speed * (truck.dir === -1 ? -1 : 1);
      if (truck.t > 1) { truck.t = 1; truck.dir = -1; }
      if (truck.t < 0) { truck.t = 0; truck.dir = 1; }
      truck.group.position.lerpVectors(truck.from, truck.to, truck.t <= 1 && truck.t >= 0 ? Math.abs(Math.sin(truck.t * Math.PI / 2)) : truck.t);
      const look = (truck.dir === -1 ? truck.from : truck.to);
      const dir = new THREE.Vector3().subVectors(look, truck.group.position);
      if (dir.lengthSq() > 0.01) truck.group.rotation.y = Math.atan2(dir.x, dir.z);
    }
  }

  _updatePlanes(dt) {
    for (const plane of this.planes) {
      plane.orbitPhase += dt * plane.orbitSpeed;
      const x = this.center.x + Math.cos(plane.orbitPhase) * plane.orbitR;
      const z = this.center.z + Math.sin(plane.orbitPhase) * plane.orbitR;
      plane.group.position.set(x, plane.orbitY, z);
      plane.group.rotation.y = plane.orbitPhase + Math.PI / 2;
    }
  }

  /** Light automatic fire from the small guns — visible, mostly harmless. */
  _fireTracer(position) {
    if (!position || !this.guns.length || !this.tracers) return;
    const gun = this.guns[Math.floor(Math.random() * this.guns.length)];
    const origin = new THREE.Vector3();
    gun.group.getWorldPosition(origin);
    origin.y += 1.4;

    gun.muzzleFlash.visible = true;
    setTimeoutSafe(() => { gun.muzzleFlash.visible = false; }, 90);
    const toTarget = _v.subVectors(position, origin).clone();
    gun.yoke.rotation.y = Math.atan2(toTarget.x, toTarget.z);

    const dist = toTarget.length();
    // A burst, not a round — light AA fires in strings.
    const rounds = 5 + Math.floor(Math.random() * 4);
    const spread = dist * (0.03 + Math.random() * 0.06) * lerp(1.5, 0.6, this.trackQuality);
    for (let i = 0; i < rounds; i++) {
      const aim = position.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 2 * spread,
        (Math.random() - 0.5) * 2 * spread * 0.6,
        (Math.random() - 0.5) * 2 * spread,
      ));
      const hit = Math.random() < clamp(0.014 * this.intensity * (0.5 + this.trackQuality), 0, 0.06);
      this.tracers.fire({
        from: origin,
        to: hit ? position.clone() : aim,
        speed: 640,
        colour: 0xffe07a,
        width: 0.45,
        onArrive: hit ? () => this._resolveHit('tracer') : null,
      });
    }
  }

  /**
   * A salvo from one battery.
   *
   * The shells are not drawn — nobody sees a shell — but they are SIMULATED:
   * each carries a fuse time and a burst point derived from where the predictor
   * thought the aeroplane would be when it was fired. If the aeroplane changes
   * anything in the two or three seconds of flight, the salvo bursts where it
   * used to be going, and that is the entire mechanic.
   */
  _fireSalvo(position, velocity) {
    if (!position || !this.batteries.length) return;
    // Which batteries join in: more of them, the harder it is being pressed.
    const joining = Math.max(1, Math.round(lerp(1, this.batteries.length, clamp(this.intensity, 0, 1.8) / 1.8)));
    const ordered = this.batteries
      .map((b) => ({ b, d: b.position.distanceTo(position) }))
      .filter((o) => o.d < 5200)
      .sort((a, c) => a.d - c.d)
      .slice(0, joining);
    if (!ordered.length) return;

    for (const { b, d } of ordered) {
      const flight = clamp(d / SHELL_SPEED, 0.4, 6);
      // Where the predictor says it will be. Confidence scales how much of the
      // aeroplane's own velocity it dares to use.
      const predicted = position.clone();
      if (velocity) predicted.addScaledVector(velocity, flight * lerp(0.35, 1.0, this.trackQuality));
      // And the box: a genuine error volume, tight when tracked and wide when
      // not, plus a floor so it is never a guaranteed hit.
      const box = lerp(230, 26, this.trackQuality) / clamp(this.intensity, 0.5, 1.8);
      for (let i = 0; i < BATTERY_GUNS; i++) {
        const gun = b.guns[i];
        gun.flash.material.opacity = 1;
        /* The world matrices are only recomposed by the renderer, and a
         * headless tick never renders — so ask for this one explicitly or the
         * muzzle is wherever it was when the page last drew a frame. */
        gun.elevate.updateWorldMatrix(true, false);
        const from = gun.muzzle.clone().applyMatrix4(gun.elevate.matrixWorld);
        this._shells.push({
          at: predicted.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 2 * box,
            (Math.random() - 0.5) * 2 * box * 0.55,
            (Math.random() - 0.5) * 2 * box,
          )),
          fuse: flight * (0.94 + Math.random() * 0.12),
          from,
        });
      }
      this.burstsFired += BATTERY_GUNS;
    }
  }

  /** Tick the shells in flight and burst the ones whose fuse has run out. */
  _updateShells(dt, position) {
    for (let i = this._shells.length - 1; i >= 0; i--) {
      const s = this._shells[i];
      s.fuse -= dt;
      if (s.fuse > 0) continue;
      this._shells.splice(i, 1);
      this._burst(s.at, position);
    }
  }

  _burst(point, position) {
    const burst = this._flakPool.pop() || makeFlakBurst();
    burst.group.position.copy(point);
    burst.group.userData.life = 0;
    burst.group.userData.drift = new THREE.Vector3(
      (Math.random() - 0.5) * 6, 1 + Math.random() * 2, (Math.random() - 0.5) * 6,
    );
    burst.coreMat.opacity = 0;
    burst.puffMat.opacity = 0;
    burst.lumpMat.opacity = 0;
    burst.core.scale.setScalar(0.5);
    burst.puff.scale.setScalar(0.5);
    burst.lump.scale.setScalar(0.4);
    burst.lump.position.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
    for (const bit of burst.bits) {
      bit.position.set(0, 0, 0);
      bit.material.opacity = 0;
      bit.userData.dir = new THREE.Vector3(
        Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5,
      ).normalize();
    }
    this.root.add(burst.group);
    this._activeFlak.push(burst);
    if (this.flashLight) {
      this.flashLight.position.copy(point);
      this.flashLight.intensity = 3.2e5;
      this._flashT = 0;
    }

    /* What it did. Distance is real, so the consequence is too. */
    const d = position ? point.distanceTo(position) : Infinity;
    if (d < HEARD_RADIUS) {
      const severity = clamp(1 - d / HEARD_RADIUS, 0, 1);
      this.onFlakBurst?.(d, point, severity);
    }
    if (d < LETHAL_RADIUS) {
      this.nearMisses++;
      this._resolveHit('flak');
    } else if (d < RATTLE_RADIUS) {
      this.nearMisses++;
      this.onShrapnel?.(d);
      // Splinters. Not usually enough to break anything, but it is not nothing.
      if (Math.random() < clamp(0.34 * (1 - d / RATTLE_RADIUS), 0, 0.34)) {
        this._resolveHit('flak');
      }
    }
  }

  _updateFlak(dt) {
    if (this.flashLight) {
      this._flashT += dt;
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 9e5);
    }
    for (let i = this._activeFlak.length - 1; i >= 0; i--) {
      const b = this._activeFlak[i];
      const u = b.group.userData;
      u.life += dt;
      const life = u.life;

      const coreK = clamp(life / 0.14, 0, 1);
      b.coreMat.opacity = lerp(1, 0, coreK * coreK);
      b.core.scale.setScalar(lerp(1.5, 16, coreK));
      /* Anything faded out is switched OFF rather than drawn at zero alpha.
       * A transparent mesh at opacity 0 still costs a draw call, and a sky
       * with twenty bursts in it would otherwise be paying for sixty. */
      b.core.visible = b.coreMat.opacity > 0.01;

      /* The puff. Blooms in a fifth of a second, then hangs there for the best
       * part of ten while it drifts and thins — which is what fills the sky
       * over a defended target with the black flowers that make it read as a
       * barrage rather than as a firework. */
      const bloom = clamp(life / 0.22, 0, 1);
      const age = clamp(life / FLAK_PUFF_SECONDS, 0, 1);
      const r = lerp(3, 26, Math.sqrt(bloom)) + age * 16;
      b.puff.scale.setScalar(r);
      b.lump.scale.setScalar(r * 0.72);
      const fade = bloom * (1 - age * age);
      b.puffMat.opacity = fade * 0.82;
      b.lumpMat.opacity = fade * 0.55;
      b.lump.visible = b.lumpMat.opacity > 0.02;
      b.group.position.addScaledVector(u.drift, dt);

      const splinter = clamp(1 - life / 0.8, 0, 1) * 0.9;
      for (const bit of b.bits) {
        bit.visible = splinter > 0.01;
        if (!bit.visible) continue;
        bit.position.addScaledVector(bit.userData.dir, dt * 120);
        bit.userData.dir.y -= dt * 2.2;
        // The group carries no rotation of its own, so a local quaternion is
        // also the world one — `lookAt` would be reading the wrong space.
        bit.quaternion.setFromUnitVectors(_forward, _w.copy(bit.userData.dir).normalize());
        bit.material.opacity = splinter;
      }

      if (life >= FLAK_PUFF_SECONDS) {
        this.root.remove(b.group);
        this._activeFlak.splice(i, 1);
        this._flakPool.push(b);
      }
    }
  }

  /**
   * A connecting shot rolls what kind of damage it is — weighted so an engine
   * is the common case and the others are rarer flavour.
   *
   * The ONE place `liveFire` gates. Everything the player sees and hears about
   * this shot has already happened by the time this is called — the muzzle
   * flash, the tracer's flight, the burst, the puff, the splinters, the shake
   * and the crack — so a battery firing blanks looks and sounds identical and
   * simply stops billing the aeroplane for it.
   */
  _resolveHit(source) {
    if (!this.liveFire) return;
    this.onHit?.(source === 'flak' ? 'flak-near' : 'tracer-near');
    const roll = Math.random();
    if (roll < 0.55) {
      const dead = this.damage.engines.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
      if (dead.length) this.damageEngine(dead[Math.floor(Math.random() * dead.length)]);
    } else if (roll < 0.75) {
      this.damageElectrical();
    } else if (roll < 0.9) {
      this.damageRudder();
    } else {
      this.damageFuel();
    }
  }
}

/** setTimeout that no-ops instead of throwing outside a DOM/Node event loop. */
function setTimeoutSafe(fn, ms) {
  if (typeof setTimeout === 'function') setTimeout(fn, ms);
  else fn();
}
