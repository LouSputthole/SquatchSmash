/**
 * Defense — the desert compound's reaction once it has the aeroplane.
 *
 * Per the brief: this is cinematic spectacle, not a combat simulation.
 * Searchlights sweep and occasionally catch the aircraft; tracer streaks
 * climb from the ground and mostly go past; flak puffs bloom near the flight
 * path rather than pathfinding onto it; a couple of light aircraft and a
 * truck or two patrol for scale and readability. None of it does hit
 * detection against the aeroplane's actual geometry — "hits" are a scripted
 * roll against a travelling streak's own miss distance, the same register as
 * `src/heist/bank-threat.js`'s reaction window (a small, explicit state
 * machine standing in for a simulation nobody needs).
 *
 * Damage is equally simple and deliberately shallow: `damageEngine(i)`,
 * `damageRudder()`, `damageElectrical()`, `damageFuel()` just flip a flag,
 * remember it happened, and call `onHit`. They do not touch `EngineSystem`
 * or `AircraftPhysics` themselves — the mission phase owns those, and
 * decides what a "rudder hit" actually costs the player to fly (see
 * `MissionController`'s wiring). `triggerCatastrophic()` is the one
 * explicitly rare, mission-scripted exception the brief asks for: nothing in
 * this file ever escalates to it on its own from ordinary combat.
 */
import * as THREE from 'three';
import {
  solid, unlit, boxGeo, cylGeo, coneGeo, sphereGeo,
  mesh, flatMesh, group, clamp, lerp, damp, smoothstep, rng,
} from '../../beefrun/util.js';

const SEARCHLIGHT_COUNT = 4;
const GUN_COUNT = 5;
const VEHICLE_COUNT = 2;
const PLANE_COUNT = 2;

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
    color: 0xeaf2ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
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
 * One tracer streak: a thin, stretched, unlit box travelling from a gun
 * toward an aim point. Most of the time the aim point is offset from the
 * aircraft's actual position by a "miss" vector; occasionally it is not.
 */
function makeTracerMesh() {
  const m = new THREE.Mesh(
    boxGeo(0.14, 0.14, 1),
    new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0, toneMapped: false }),
  );
  m.frustumCulled = false;
  return m;
}

/** One flak burst: an expanding, fading puff plus a handful of flung debris bits. */
function makeFlakBurst() {
  const g = group('flak-burst');
  const puffMat = new THREE.MeshBasicMaterial({
    color: 0x3a3a3a, transparent: true, opacity: 0, toneMapped: false,
  });
  const puff = new THREE.Mesh(sphereGeo(1, 10, 8), puffMat);
  g.add(puff);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0, toneMapped: false });
  const flash = new THREE.Mesh(sphereGeo(1, 8, 6), flashMat);
  g.add(flash);
  const bits = [];
  for (let i = 0; i < 5; i++) {
    const bit = new THREE.Mesh(boxGeo(0.35, 0.35, 0.35), new THREE.MeshBasicMaterial({
      color: 0x2a2a2a, transparent: true, opacity: 0, toneMapped: false,
    }));
    g.add(bit);
    bits.push(bit);
  }
  return { group: g, puff, puffMat, flash, flashMat, bits };
}

/* ------------------------------------------------------------------ */

export class Defense {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [opts]
   * @param {(x:number,z:number)=>number} [opts.getHeight] ground sampler used
   *   only to sit props on the ground. Defaults to a flat guess at
   *   `groundY` (see `deploy()`) — the eastbound terrain's own ground
   *   function is a later phase's responsibility (see the safety-carve note
   *   at the end of `src/enolasquatch/config.js`), so this file does not
   *   assume `src/beefrun/terrain.js`'s `terrainHeight` is meaningful out
   *   here (it is banded by Beef Run's own southbound `ZONES`, not
   *   `ZONES_EAST`).
   */
  constructor(scene, { getHeight = null } = {}) {
    this.scene = scene;
    this.getHeight = getHeight;
    this.root = group('compound-defense');
    scene.add(this.root);

    this.searchlights = [];
    this.guns = [];
    this.trucks = [];
    this.planes = [];
    this._tracerPool = [];
    this._activeTracers = [];
    this._flakPool = [];
    this._activeFlak = [];

    this.center = new THREE.Vector3();
    this.deployed = false;
    this.state = 'idle';           // idle | opening | active | suppressed
    this._openedFired = false;
    this._fireTimer = 2.4;
    this._flakTimer = 1.6;
    this._t = 0;

    this.caught = false;
    this._caughtDwell = 0;

    /** Rare/scripted intensity multiplier for how aggressively it fires. */
    this.intensity = 1;

    this.damage = {
      engines: [false, false, false, false],
      rudder: false,
      electrical: false,
      fuel: false,
      catastrophic: false,
    };
    this.hitCount = 0;

    this.onOpen = null;             // () => void — first shot fired
    this.onHit = null;              // (kind, detail) => void — a shot/burst actually connected
    this.onCaught = null;           // (caught:boolean) => void — searchlight lock state changed
    this.onSuppressed = null;       // () => void — mission calls suppress() to end active fire
    this.onCatastrophic = null;     // (reason:string) => void
  }

  /**
   * Stand up the compound's defenses around a centre point.
   * @param {{x:number, z:number}} center
   * @param {object} [opts]
   * @param {number} [opts.groundY] flat ground elevation to place props on,
   *   used only if no `getHeight` sampler was given to the constructor.
   * @param {number} [opts.radius] rough spread of the emplacements, metres.
   */
  deploy(center, { groundY = 250, radius = 420 } = {}) {
    this.clear();
    this.center.set(center.x, groundY, center.z);
    const groundAt = (x, z) => (this.getHeight ? this.getHeight(x, z) : groundY);
    const rand = rng(0xE50 + Math.round(center.x));

    for (let i = 0; i < SEARCHLIGHT_COUNT; i++) {
      const a = (i / SEARCHLIGHT_COUNT) * Math.PI * 2 + rand() * 0.6;
      const r = radius * (0.55 + rand() * 0.4);
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

    for (let i = 0; i < PLANE_COUNT; i++) {
      const plane = makeLightAircraft();
      plane.orbitR = radius * (1.1 + i * 0.3);
      plane.orbitY = groundY + 220 + i * 60;
      plane.orbitPhase = rand() * Math.PI * 2;
      plane.orbitSpeed = 0.12 + rand() * 0.04;
      this.root.add(plane.group);
      this.planes.push(plane);
    }

    for (let i = 0; i < 10; i++) this._tracerPool.push(makeTracerMesh());
    for (let i = 0; i < 6; i++) this._flakPool.push(makeFlakBurst());

    this.deployed = true;
    this.state = 'opening';
    this._openedFired = false;
    this._fireTimer = 2.2;
    this._flakTimer = 1.2;
    this._t = 0;
    this.caught = false;
    this._caughtDwell = 0;
  }

  clear() {
    this.root.clear();
    this.searchlights.length = 0;
    this.guns.length = 0;
    this.trucks.length = 0;
    this.planes.length = 0;
    this._tracerPool.length = 0;
    this._activeTracers.length = 0;
    this._flakPool.length = 0;
    this._activeFlak.length = 0;
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

  update(dt, { position, velocity = null } = {}) {
    if (!this.deployed) return this.state;
    this._t += dt;

    this._updateSearchlights(dt, position);
    this._updateTrucks(dt);
    this._updatePlanes(dt);
    this._updateTracers(dt, position);
    this._updateFlak(dt, position, velocity);

    if (this.state === 'opening' || this.state === 'active') {
      this._fireTimer -= dt;
      if (this._fireTimer <= 0) {
        this._fireTracer(position);
        this._fireTimer = lerp(2.6, 0.7, clamp(this.intensity, 0, 1.6) / 1.6) * (0.6 + Math.random() * 0.8);
        if (!this._openedFired) {
          this._openedFired = true;
          this.state = 'active';
          this.onOpen?.();
        }
      }
      this._flakTimer -= dt;
      if (this._flakTimer <= 0) {
        this._fireFlak(position, velocity);
        this._flakTimer = lerp(3.6, 1.4, clamp(this.intensity, 0, 1.6) / 1.6) * (0.6 + Math.random() * 0.8);
      }
    }

    return this.state;
  }

  _updateSearchlights(dt, position) {
    let anyOnTarget = false;
    for (const s of this.searchlights) {
      s.sweepPhase += dt * s.sweepSpeed;
      const toTarget = position ? new THREE.Vector3().subVectors(position, s.group.position) : null;
      const wantYaw = toTarget && toTarget.lengthSq() > 1
        ? Math.atan2(toTarget.x, toTarget.z)
        : s.baseYaw + Math.sin(s.sweepPhase) * 0.9;
      // A sweep that idly patrols, but leans toward the aircraft once it is
      // roughly in front of the light — "hunting, not looking right at it"
      // per the dialogue, until it gets close enough to actually settle.
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

  /** Fire one tracer from a random gun toward (mostly near) the aircraft. */
  _fireTracer(position) {
    if (!position || !this.guns.length) return;
    const gun = this.guns[Math.floor(Math.random() * this.guns.length)];
    const origin = new THREE.Vector3();
    gun.group.getWorldPosition(origin);
    origin.y += 1.4;

    gun.muzzleFlash.visible = true;
    setTimeoutSafe(() => { gun.muzzleFlash.visible = false; }, 90);
    const toTarget = new THREE.Vector3().subVectors(position, origin);
    gun.yoke.rotation.y = Math.atan2(toTarget.x, toTarget.z);

    // Miss most of the time: a random offset scaled by distance, so a near
    // gun barely misses and a far one can miss by a lot — reads as gunners
    // doing their best rather than the compound simply choosing not to hit.
    const dist = toTarget.length();
    const hitRoll = Math.random() < clamp(0.1 * this.intensity, 0, 0.35);
    const missSpread = hitRoll ? dist * 0.01 : dist * (0.06 + Math.random() * 0.1);
    const missOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 2 * missSpread,
      (Math.random() - 0.5) * 2 * missSpread * 0.6,
      (Math.random() - 0.5) * 2 * missSpread,
    );
    const aimPoint = position.clone().add(missOffset);

    const mesh_ = this._tracerPool.pop() || makeTracerMesh();
    mesh_.material.opacity = 0.95;
    mesh_.userData.origin = origin.clone();
    mesh_.userData.target = aimPoint;
    mesh_.userData.life = 0;
    mesh_.userData.duration = clamp(dist / 420, 0.35, 1.4);
    mesh_.userData.hit = hitRoll;
    this.root.add(mesh_);
    this._activeTracers.push(mesh_);
  }

  _updateTracers(dt, position) {
    for (let i = this._activeTracers.length - 1; i >= 0; i--) {
      const t = this._activeTracers[i];
      const d = t.userData;
      d.life += dt;
      const k = clamp(d.life / d.duration, 0, 1);
      const cur = new THREE.Vector3().lerpVectors(d.origin, d.target, k);
      const ahead = new THREE.Vector3().lerpVectors(d.origin, d.target, clamp(k + 0.06, 0, 1));
      t.position.copy(cur);
      t.lookAt(ahead);
      t.scale.set(1, 1, Math.max(0.4, cur.distanceTo(ahead) * 26));
      t.material.opacity = k < 0.9 ? 0.95 : lerp(0.95, 0, (k - 0.9) / 0.1);

      if (k >= 1) {
        if (d.hit && position) this._resolveHit('tracer');
        this.root.remove(t);
        this._activeTracers.splice(i, 1);
        this._tracerPool.push(t);
      }
    }
  }

  /** Flak: bursts near the flight path, not aimed to actually connect. */
  _fireFlak(position, velocity) {
    if (!position) return;
    const ahead = velocity && velocity.lengthSq() > 1
      ? position.clone().addScaledVector(velocity.clone().normalize(), 60 + Math.random() * 260)
      : position.clone();
    const spread = 90 + Math.random() * 140;
    const closeRoll = Math.random() < clamp(0.16 * this.intensity, 0, 0.3);
    const s = closeRoll ? spread * 0.18 : spread;
    const point = ahead.add(new THREE.Vector3(
      (Math.random() - 0.5) * 2 * s,
      (Math.random() - 0.5) * 2 * s * 0.5,
      (Math.random() - 0.5) * 2 * s,
    ));

    const burst = this._flakPool.pop() || makeFlakBurst();
    burst.group.position.copy(point);
    burst.group.userData.life = 0;
    burst.group.userData.hit = closeRoll && point.distanceTo(position) < 45;
    burst.puffMat.opacity = 0;
    burst.flashMat.opacity = 0;
    burst.puff.scale.setScalar(0.5);
    burst.flash.scale.setScalar(0.5);
    for (const bit of burst.bits) {
      bit.material.opacity = 0;
      bit.userData.dir = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.2, (Math.random() - 0.5)).normalize();
    }
    this.root.add(burst.group);
    this._activeFlak.push(burst);
  }

  _updateFlak(dt, position) {
    for (let i = this._activeFlak.length - 1; i >= 0; i--) {
      const b = this._activeFlak[i];
      b.group.userData.life += dt;
      const life = b.group.userData.life;
      const flashK = clamp(life / 0.12, 0, 1);
      b.flashMat.opacity = lerp(0.9, 0, flashK);
      b.flash.scale.setScalar(lerp(1, 4, flashK));

      const puffK = clamp(life / 1.4, 0, 1);
      b.puffMat.opacity = lerp(0, 0.5, clamp(life / 0.2, 0, 1)) * (1 - puffK);
      b.puff.scale.setScalar(lerp(0.5, 9, Math.sqrt(puffK)));

      for (const bit of b.bits) {
        bit.position.addScaledVector(bit.userData.dir, dt * 40);
        bit.userData.dir.y -= dt * 9;
        bit.material.opacity = lerp(0.9, 0, puffK);
      }

      if (life >= 1.4) {
        if (b.group.userData.hit && position) this._resolveHit('flak');
        this.root.remove(b.group);
        this._activeFlak.splice(i, 1);
        this._flakPool.push(b);
      }
    }
  }

  /**
   * A connecting shot rolls what kind of (shallow, cosmetic) damage it is —
   * weighted so an engine is the common case and the others are rarer
   * flavour, matching "one engine overheats" being the mission's own
   * scripted emergency rather than combat needing to cause it too often.
   */
  _resolveHit(source) {
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
