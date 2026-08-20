/**
 * The bomb trolley — the Fat Squatch, on the ground, where you can read it.
 *
 * Owner playtest, 2026-08-19:
 *
 *   *"THE BOMB — replaces the current restraint interaction, which can trap the
 *   player inside the plane/interactable. Put the Fat Squatch OUTSIDE the
 *   aircraft on a bomb trolley/cart before takeoff, fully visible so the player
 *   can walk around and read its ridiculous markings. Interaction prompt: LOAD
 *   FAT SQUATCH. On use: short loading animation, cart moves toward the
 *   aircraft, bomb transitions into its secured bomb-bay position, objective
 *   updates. Owner is explicit: keep it SIMPLE. No complex rolling animation
 *   that can lock the player in the scene. The point is that the player gets to
 *   look at the bomb."*
 *
 * Two problems and one fix.
 *
 * THE PROBLEM WITH THE OLD BEAT. `../preflight.js`'s fourth check registered
 * `payload.group` itself as an interaction target and hung a 2.6 x 2.4 x 3.4 m
 * invisible hit proxy on it. That proxy is a child of the bomb, the bomb is a
 * child of the aeroplane's `payloadMount`, and `payloadMount` is 0.95 m under a
 * belly that is itself 3 m off the tarmac — so the only way to put a crosshair
 * on it was to walk in under the open bomb bay and stand inside the aeroplane's
 * own footprint, between the mainwheels, under a hanging 2.7-tonne prop, with a
 * 3.4 m interaction volume around your head. That is the trap.
 *
 * THE PROBLEM WITH THE BOMB. It is the best-dressed object in this mission —
 * a hand-lettered FAT SQUATCH placard, the club crest on both shoulders, a
 * scattering of stickers — and every one of those decals is authored to be
 * legible from the side (see `DECAL_ANGLE` in `./FatSquatch.js`). Mounted, all
 * of that is inside the fuselage. The player never saw any of it.
 *
 * THE FIX is one prop and one three-step animation. The bomb starts on this
 * trolley, parked off the port side clear of the wing, at eye height, where a
 * man on foot can walk a full circle round it and read every sticker. `LOAD FAT
 * SQUATCH` then plays the shortest honest version of loading a bomb: the cart
 * rolls in under the bay, the bomb rises onto its shackles, the cart rolls back
 * out. Roughly five seconds, all of it on a timer that cannot stall, and the
 * player keeps his controls the entire time — nothing here freezes the player,
 * captures the camera, or registers a collider. That is what "keep it SIMPLE"
 * means here: there is no state this can reach where anybody is stuck.
 */
import * as THREE from 'three';
import { solid, boxGeo, cylGeo, mesh, group, clamp } from '../../beefrun/util.js';

/** Seconds for each leg of the load. Short on purpose — see the header. */
export const LOAD_TIMING = Object.freeze({
  roll: 1.9,
  lift: 1.8,
  withdraw: 1.4,
});

/** How far the cart travels to get under the bay, in metres. */
const ROLL_DISTANCE = 6.0;

const _lift = new THREE.Vector3();
const _mountWorld = new THREE.Vector3();

/**
 * The trolley itself: a long low chassis on four small hard wheels, a cradle
 * with two padded saddles the casing lies in, a tow bar somebody has dropped on
 * the concrete, and a stencilled warning nobody has ever read.
 *
 * @returns {THREE.Group} with `userData.cradle`, the anchor a payload parents to
 */
export function makeBombTrolley() {
  const g = group('fat-squatch-trolley');
  const steelDark = solid(0x3d434a, { roughness: 0.7, metalness: 0.35 });
  const steel = solid(0x6b727a, { roughness: 0.55, metalness: 0.5 });
  const rubber = solid(0x1e2024, { roughness: 0.95 });
  const pad = solid(0x4a4238, { roughness: 1 });
  const yellow = solid(0xc8a832, { roughness: 0.8 });

  /* The chassis. Long enough for a 5.2 m casing with a hand's width either end,
   * and low enough that a man standing beside it looks DOWN at the artwork —
   * which is the whole reason the thing is out here. */
  const deck = mesh(boxGeo(1.5, 0.16, 5.8), steelDark, 0, 0.44, 0);
  deck.name = 'trolley-chassis';
  g.add(deck);
  for (const sx of [-1, 1]) {
    const rail = mesh(boxGeo(0.12, 0.26, 5.9), steel, sx * 0.72, 0.5, 0);
    rail.name = `trolley-side-rail-${sx < 0 ? 'starboard' : 'port'}`;
    g.add(rail);
  }
  // Cross members, so the deck reads as fabricated rather than extruded.
  for (const z of [-2.2, -0.8, 0.8, 2.2]) {
    g.add(mesh(boxGeo(1.44, 0.1, 0.14), steel, 0, 0.36, z));
  }

  // Four small hard wheels on stub axles. A bomb trolley's wheels are tiny.
  g.userData.wheels = [];
  for (const sx of [-1, 1]) {
    for (const z of [-2.35, 2.35]) {
      g.add(mesh(cylGeo(0.05, 0.05, 0.5, 6), steel, sx * 0.5, 0.2, z).rotateZ(Math.PI / 2));
      const wheel = mesh(cylGeo(0.2, 0.2, 0.13, 12), rubber, sx * 0.74, 0.2, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.name = `trolley-wheel-${sx < 0 ? 'starboard' : 'port'}-${z < 0 ? 'aft' : 'forward'}`;
      g.add(wheel);
      g.userData.wheels.push(wheel);
    }
  }

  /* The cradle. Two saddles rather than a continuous bed, because that is how a
   * round casing is carried and because two saddles let the player see the
   * underside of the bomb between them. `cradle` is the anchor the payload
   * parents to; the saddles are placed to meet the casing where it actually is
   * once it is sitting on them. */
  const cradle = group('trolley-cradle');
  cradle.position.set(0, 1.32, 0);
  g.add(cradle);
  g.userData.cradle = cradle;
  for (const z of [-1.35, 1.35]) {
    const saddleBase = mesh(boxGeo(1.1, 0.5, 0.34), steel, 0, -0.68, z);
    saddleBase.name = 'trolley-saddle-post';
    g.add(saddleBase);
    for (const sx of [-1, 1]) {
      const cheek = mesh(boxGeo(0.16, 0.42, 0.36), pad, sx * 0.5, -0.36, z);
      cheek.rotation.z = -sx * 0.42;
      cheek.name = `trolley-saddle-pad-${sx < 0 ? 'starboard' : 'port'}`;
      g.add(cheek);
    }
  }

  // The tow bar, dropped on the concrete where the last man left it.
  const tow = group('trolley-tow-bar');
  tow.position.set(0, 0.42, 3.0);
  tow.rotation.x = 0.42;
  tow.add(mesh(boxGeo(0.12, 0.1, 1.5), steel, 0, 0, 0.75));
  tow.add(mesh(boxGeo(0.62, 0.09, 0.1), steel, 0, 0, 1.42));
  g.add(tow);

  /* A stencilled hazard band and a warning plate. Both are the same joke the
   * casing itself is telling: this is a serious piece of ordnance handling
   * equipment carrying something ridiculous. */
  for (const sx of [-1, 1]) {
    for (const z of [-1.9, 1.9]) {
      const flash = mesh(boxGeo(0.03, 0.2, 0.7), yellow, sx * 0.79, 0.5, z);
      flash.name = 'trolley-hazard-stripe';
      g.add(flash);
    }
  }
  const plate = mesh(boxGeo(0.03, 0.3, 0.9), yellow, 0.8, 0.72, -0.4);
  plate.name = 'trolley-warning-plate';
  g.add(plate);

  // Wheel chocks, because the last thing anybody wants is this rolling away.
  for (const z of [-2.75, 2.75]) {
    const chock = mesh(boxGeo(0.36, 0.2, 0.3), solid(0x8a6a42, { roughness: 1 }), 0.74, 0.1, z);
    chock.rotation.x = z < 0 ? -0.24 : 0.24;
    chock.name = 'trolley-chock';
    g.add(chock);
  }

  return g;
}

/**
 * Sway braces, shackles and a release hook, on the aeroplane's own mount.
 *
 * Owner: *"Once loaded: bomb visible where appropriate, proper mounting
 * straps/brackets, no clipping into the airframe, obvious release mechanism."*
 *
 * The bomb already carries its own two suspension lugs and three restraint
 * straps (`./FatSquatch.js`). What it had nothing to hang FROM was the
 * aeroplane: `anchors.payloadMount` was a bare `THREE.Group` with no geometry
 * at all, so a loaded Fat Squatch floated in the bay attached to nothing. This
 * is the other half of the joint — two hooks over the lugs, four sway braces
 * bearing on the shoulders of the casing, and one red release lever that is
 * visibly the thing that lets go.
 *
 * @param {THREE.Object3D} mount `aircraft.anchors.payloadMount`
 * @returns {object} named parts, including `releaseLever`
 */
export function buildBombShackles(mount) {
  const steel = solid(0x7a828c, { roughness: 0.45, metalness: 0.7 });
  const dark = solid(0x2a2c30, { roughness: 0.7, metalness: 0.4 });
  const red = solid(0xb8342a, { roughness: 0.6 });
  const parts = { hooks: [], braces: [] };

  /* The two hooks sit over the casing's own lugs, which `FatSquatch` puts at
   * y = BODY_H * 0.98 (0.666) either side of centre. The beam above them is the
   * bay's centre keel, which is what the whole load actually hangs off. */
  const beam = mesh(boxGeo(0.26, 0.14, 3.4), dark, 0, 0.86, 0);
  beam.name = 'bomb-shackle-beam';
  mount.add(beam);
  parts.beam = beam;

  for (const z of [-1.1, 1.1]) {
    const body = mesh(boxGeo(0.22, 0.3, 0.24), steel, 0, 0.72, z);
    body.name = 'bomb-shackle';
    mount.add(body);
    parts.hooks.push(body);
    // The hook itself, closed over the lug.
    const hook = mesh(boxGeo(0.07, 0.2, 0.2), dark, 0.1, 0.62, z);
    hook.name = 'bomb-shackle-hook';
    mount.add(hook);
  }

  /* Four sway braces, angled onto the shoulders of the casing. These are what
   * stop a bomb swinging in the bay, and they are also what visibly makes the
   * bomb part of the aeroplane rather than a prop parked near it. */
  for (const sx of [-1, 1]) {
    for (const z of [-1.5, 1.5]) {
      const brace = mesh(boxGeo(0.09, 0.46, 0.12), steel, sx * 0.5, 0.55, z);
      brace.rotation.z = sx * 0.5;
      brace.name = `bomb-sway-brace-${sx < 0 ? 'starboard' : 'port'}`;
      mount.add(brace);
      parts.braces.push(brace);
      // The foot that bears on the paint.
      mount.add(mesh(boxGeo(0.16, 0.06, 0.16), dark, sx * 0.62, 0.34, z));
    }
  }

  /* The release. One red lever on the beam, connected to both shackles by a
   * visible rod — the "obvious release mechanism" the note asks for, and the
   * thing `MissionController.updateRelease()`'s stuck/kick beats are about. */
  const linkage = mesh(boxGeo(0.06, 0.06, 2.3), dark, -0.18, 0.86, 0);
  linkage.name = 'bomb-release-linkage';
  mount.add(linkage);
  const lever = group('bomb-release-lever');
  lever.position.set(-0.18, 0.86, 0);
  lever.add(mesh(boxGeo(0.07, 0.42, 0.07), red, 0, 0.21, 0));
  lever.add(mesh(boxGeo(0.13, 0.1, 0.13), red, 0, 0.44, 0));
  mount.add(lever);
  parts.releaseLever = lever;

  return parts;
}

/**
 * The trolley as a mission object: where it is parked, and the load sequence.
 *
 * The whole animation is three timed legs with no branches and no waiting on
 * anything the player does, so `state` can only ever move forwards and the
 * sequence cannot stall. `onLoaded` fires exactly once, at the instant the bomb
 * becomes a child of the aeroplane.
 */
export class BombTrolley {
  /**
   * @param {object} o
   * @param {THREE.Object3D} o.scene where the trolley lives (the world, not the
   *   aeroplane — it is ground equipment and it stays on the ground)
   * @param {object} o.aircraft the EnolaSquatch
   * @param {object} o.payload the FatSquatch
   * @param {{x:number,z:number,heading:number,elev:number}} o.park where the
   *   aeroplane is standing, so the trolley can be placed relative to it
   */
  constructor({ scene, aircraft, payload, park }) {
    this.scene = scene;
    this.aircraft = aircraft;
    this.payload = payload;
    this.group = makeBombTrolley();
    this.shackles = buildBombShackles(aircraft.anchors.payloadMount);
    this.state = 'parked';
    this.t = 0;
    this.loaded = false;
    this.onLoaded = null;

    /* Parked off the PORT side, abeam the bomb bay and outboard of the
     * propeller arc, on the same side as the crew door so the walkaround does
     * not double back. The aeroplane's port is +X in its own frame (see the
     * frame note at the top of `../scenes/EnolaSquatch.js`), and this converts
     * that to world exactly the way `../crew.js`'s `standOnApron()` does. */
    const yaw = (park.heading * Math.PI) / 180;
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const lx = ROLL_DISTANCE;
    const lz = 0.4;
    this.parked = new THREE.Vector3(park.x + lx * c + lz * s, park.elev, park.z - lx * s + lz * c);
    this.underBay = new THREE.Vector3(park.x + lz * s, park.elev, park.z + lz * c);
    this.group.position.copy(this.parked);
    this.group.rotation.y = yaw;
    scene.add(this.group);

    // The bomb starts here, on the cradle, at head height, out in the open.
    this.group.userData.cradle.add(payload.group);
    payload.group.position.set(0, 0, 0);
    payload.group.rotation.set(0, 0, 0);
  }

  /** The world point an interaction marker should stand on. */
  markerPoint(out = new THREE.Vector3()) {
    return out.set(this.group.position.x, this.group.position.y + 2.1, this.group.position.z);
  }

  /**
   * LOAD FAT SQUATCH.
   *
   * @returns {boolean} false if it is already running or already done
   */
  beginLoad() {
    if (this.state !== 'parked') return false;
    this.state = 'rolling';
    this.t = 0;
    return true;
  }

  /** True while the sequence is running — the prompt is gone in this window. */
  get busy() { return this.state === 'rolling' || this.state === 'lifting'; }

  /**
   * One frame. Safe to call before, during and after the sequence, and safe to
   * call forever afterwards.
   */
  update(dt) {
    if (this.state === 'parked' || this.state === 'done') return;
    this.t += dt;

    if (this.state === 'rolling') {
      const k = clamp(this.t / LOAD_TIMING.roll, 0, 1);
      // Smoothstep, so a heavy trolley starts and stops like one.
      const e = k * k * (3 - 2 * k);
      this.group.position.lerpVectors(this.parked, this.underBay, e);
      this._rollWheels(dt, this.parked.distanceTo(this.underBay) / LOAD_TIMING.roll);
      if (k >= 1) { this.state = 'lifting'; this.t = 0; }
      return;
    }

    if (this.state === 'lifting') {
      const k = clamp(this.t / LOAD_TIMING.lift, 0, 1);
      const e = k * k * (3 - 2 * k);
      /* The bomb travels in WORLD space from the cradle to the mount, and is
       * only reparented at the end. Interpolating the local position inside a
       * cradle that is itself moving is how a lift like this ends up somewhere
       * nobody predicted. */
      this.aircraft.anchors.payloadMount.updateWorldMatrix(true, false);
      this.aircraft.anchors.payloadMount.getWorldPosition(_mountWorld);
      if (!this._liftFrom) {
        this._liftFrom = this.payload.group.getWorldPosition(new THREE.Vector3());
      }
      _lift.lerpVectors(this._liftFrom, _mountWorld, e);
      this.payload.group.position.copy(this.group.userData.cradle.worldToLocal(_lift.clone()));
      if (k >= 1) {
        this._seat();
        this.state = 'withdrawing';
        this.t = 0;
      }
      return;
    }

    // withdrawing
    const k = clamp(this.t / LOAD_TIMING.withdraw, 0, 1);
    const e = k * k * (3 - 2 * k);
    this.group.position.lerpVectors(this.underBay, this.parked, e);
    this._rollWheels(dt, -this.parked.distanceTo(this.underBay) / LOAD_TIMING.withdraw);
    if (k >= 1) this.state = 'done';
  }

  /**
   * Put the bomb where it belongs immediately, wherever the sequence had got to.
   *
   * Called by `MissionController.enterCockpit()`. Nobody takes off with the
   * Fat Squatch still on the concrete, and the load is the one apron action
   * with an animation on it — so a player who climbs the ladder half a second
   * after pressing E must not leave the mission's whole reason for existing
   * parked on the hardstand.
   */
  forceSeat() {
    this._seat();
    this.group.position.copy(this.parked);
    this.state = 'done';
    this.t = 0;
  }

  /** Hand the bomb to the aeroplane, once. */
  _seat() {
    if (this.loaded) return;
    this.loaded = true;
    const mount = this.aircraft.anchors.payloadMount;
    mount.add(this.payload.group);
    this.payload.group.position.set(0, 0, 0);
    this.payload.group.rotation.set(0, 0, 0);
    this.onLoaded?.();
  }

  /** Spin the wheels at the speed the trolley is actually travelling. */
  _rollWheels(dt, speed) {
    for (const wheel of this.group.userData.wheels) wheel.rotation.x -= (speed / 0.2) * dt;
  }

  /**
   * Put the bomb back on the cart, for a walkaround restart.
   *
   * Every checkpoint in this mission is airborne or lined up on the runway, so
   * nothing in normal play rewinds past the load — but a console `go()` back to
   * the walkaround must not leave the trolley empty and the prompt gone.
   */
  reset() {
    this.state = 'parked';
    this.t = 0;
    this.loaded = false;
    this._liftFrom = null;
    this.group.position.copy(this.parked);
    this.group.userData.cradle.add(this.payload.group);
    this.payload.group.position.set(0, 0, 0);
    this.payload.group.rotation.set(0, 0, 0);
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}
