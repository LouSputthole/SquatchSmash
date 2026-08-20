/**
 * THE SPECIAL MEETING — one car for the whole night.
 *
 * THE PROBLEM THIS SOLVES
 *
 * The block outside the flat and the road out of town were built in parallel,
 * and both of them needed a Lincoln. So there are two: `../sedan.js`, which is
 * the block's — a real `GroundVehicle` with four named seats, doors with
 * ground beside them, a dome light and a BOOT WITH SOMEBODY IN IT — and
 * `./car.js`, which is this subtree's, built around the one seat the drive is
 * shot from.
 *
 * They must not both be in the finished scene. A player who watches a car pull
 * up, gets into it, and arrives in a DIFFERENT car has been shown the seams of
 * the production, and this is the one scene in the game that cannot afford
 * that. `../sedan.js` is the one to keep: it has the trunk, and the trunk is
 * Act Four.
 *
 * So this adapts it. `ForestDrive` and `PassengerRig` want a small, dull
 * interface — a group to move, wheels to turn, lamps to switch, seats to read —
 * and everything in that interface exists on the block's sedan under a
 * different name, except the lamps.
 *
 * THE LAMPS ARE THE EXCEPTION, AND IT IS NOT A DETAIL
 *
 * The block's headlights are sized for a lit street: one spot, twenty-six
 * candela, thirty-four metres of range, aimed four degrees down so the pool
 * lands twelve metres ahead. On a street with sodium lamps that is right. On
 * eight hundred metres of unlit forest track, where the brief is that the
 * headlights do all of the visual work, it is a torch. So this bolts the
 * forest's own lamps onto the block's car — the long throw, the dipped and
 * main profiles, and the beam cones that make the fog visible — and leaves the
 * block's set alone for the block to use.
 *
 * WHO OWNS THE TRANSFORM
 *
 * On the block, the sedan drives itself: its `GroundVehicle` is stepped and
 * `syncMesh()` copies the physics onto the mesh. On the forest road the rail
 * owns the transform instead and neither is called — see `driver.js` for why
 * the forest leg is a rail. Nothing in this file steps the vehicle, and the
 * caller must not either while the drive is running.
 */

import * as THREE from 'three';

/* Deliberately NOT importing `../sedan.js`. This subtree does not reach into
 * the block's files, and a headless test of the forest should not have to
 * build a city street to run. The sedan is passed in. */

/** My seat names to the block's. Same four seats, different spelling. */
const SEAT_NAMES = Object.freeze({
  driver: 'driver',
  frontPassenger: 'front_passenger',
  rearLeft: 'rear_left',
  rearRight: 'rear_right',
});

const DECAY = 1.8;
const DIPPED = Object.freeze({
  intensity: 300, distance: 70, angle: 0.32,
  aim: { ahead: 55, drop: 1.9, out: 2.6 }, beam: 27,
});
const MAIN = Object.freeze({
  intensity: 430, distance: 96, angle: 0.24,
  aim: { ahead: 90, drop: 2.2, out: 1.4 }, beam: 40,
});

/**
 * How far a seated eye sits above the cushion, for the drive.
 *
 * The block's sedan says 0.72, and on the block that is fine: the car is
 * stationary, the player is outside it, and nobody looks out of it. For two
 * minutes of being driven it is wrong, and measurably so — this shell's side
 * glass runs from 1.712 to 2.194 and its cushions are at 0.80, so a 0.72 eye
 * sits at 1.52: NINETEEN CENTIMETRES BELOW THE BOTTOM OF THE WINDOW. The
 * player would spend the most important dialogue in the campaign looking at
 * the inside of a door card, unable to see Seff, the mirror, the road or the
 * man behind him.
 *
 * One metre puts it at 1.80 — the lower third of the glass, which is where a
 * head belongs. It is tall for a person and about right for a Sasquatch, and
 * it is the number the whole shot depends on.
 *
 * Overridden here rather than in `../sedan.js` because that file is the
 * block's and the block is entitled to its own answer. If the drive ever
 * becomes the only consumer, move it there and delete this.
 */
const FOREST_SEATED_EYE = 1.0;

const REQUIRED = ['group', 'seatWorld', 'eyeWorld', 'doorWorld', 'setBrake', 'setHeadlights'];

/**
 * Wrap the block's sedan so the forest drive can carry it.
 *
 * @param {object} sedan the object `buildMeetingSedan()` returned.
 * @param {object} [options]
 * @param {boolean} [options.shadows] whether the nearside forest lamp casts.
 * @param {number} [options.length] car length, if the sedan does not say.
 * @param {number} [options.width] car width, likewise.
 * @returns {object} the interface `ForestDrive` and `PassengerRig` expect.
 */
export function adaptMeetingSedan(sedan, { shadows = true, length = null, width = null } = {}) {
  /* Named, loudly. The block's sedan is still being written and this file is
   * the seam between two people's work: a silent `undefined` here surfaces as
   * a car with no brake lights forty seconds into the most important dialogue
   * in the campaign, and nobody would think to look here for it. */
  const missing = REQUIRED.filter((name) => typeof sedan?.[name] === 'undefined');
  if (missing.length) {
    throw new Error(
      `adaptMeetingSedan: the sedan is missing ${missing.join(', ')} — `
      + 'the block\'s car (src/specialmeeting/sedan.js) has changed shape. '
      + 'Fix the mapping here rather than building a second car.',
    );
  }

  const group = sedan.group;
  const carLength = length ?? sedan.car?.length ?? 5.4;
  const carWidth = width ?? sedan.car?.width ?? 2.0;
  const lampY = (sedan.car?.shape?.wheelR ?? 0.37) + (sedan.car?.shape?.bodyH ?? 1.05) * 0.66;

  const materials = [];
  const geometries = [];
  const spots = [];
  const beams = [];

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe9c0,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.ConeGeometry(1, 1, 12, 1, true);
  materials.push(beamMat);
  geometries.push(beamGeo);

  for (const side of [-1, 1]) {
    const z = side * (carWidth / 2 - 0.42);
    const spot = new THREE.SpotLight(0xfff0d2, 0, DIPPED.distance, DIPPED.angle, 0.6, DECAY);
    spot.name = 'forest.headlamp';
    spot.position.set(carLength / 2 - 0.1, lampY, z);
    spot.target.position.set(carLength / 2, lampY, z);
    spot.userData.side = side;
    spot.castShadow = shadows && side < 0;
    if (spot.castShadow) {
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.camera.near = 1.2;
      spot.shadow.camera.far = 58;
      spot.shadow.bias = -0.0018;
      spot.shadow.normalBias = 0.04;
    }
    group.add(spot, spot.target);
    spots.push(spot);

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.name = 'forest.headlamp.beam';
    beam.userData.side = side;
    beam.userData.z = z;
    beam.castShadow = false;
    beam.renderOrder = 3;
    group.add(beam);
    beams.push(beam);
  }

  /* Lag's phone, which the block's car has no reason to carry: on the street
   * he is not in it yet. It is the only thing in the back seat that moves, and
   * SM-400 is the moment it goes away. */
  const phoneLight = new THREE.PointLight(0x9fd0ff, 0.30, 1.6, 2);
  phoneLight.name = 'forest.phone';
  phoneLight.position.set(-1.28, 1.26, 0.48);
  group.add(phoneLight);
  const phoneMat = new THREE.MeshBasicMaterial({ color: 0x8ec4ff });
  const phoneGeo = new THREE.BoxGeometry(0.005, 0.14, 0.08);
  materials.push(phoneMat);
  geometries.push(phoneGeo);
  const phoneFace = new THREE.Mesh(phoneGeo, phoneMat);
  phoneFace.position.set(-1.23, 1.26, 0.48);
  phoneFace.rotation.z = -0.5;
  group.add(phoneFace);

  const state = { lit: false, main: false };
  function applyLamps() {
    const profile = state.main ? MAIN : DIPPED;
    const droop = Math.atan2(profile.aim.drop, profile.aim.ahead);
    for (const spot of spots) {
      const side = spot.userData.side;
      spot.intensity = state.lit ? profile.intensity : 0;
      spot.angle = profile.angle;
      spot.distance = profile.distance;
      spot.target.position.set(
        spot.position.x + profile.aim.ahead,
        spot.position.y - profile.aim.drop,
        spot.position.z + side * profile.aim.out,
      );
      spot.target.updateMatrix();
    }
    for (const beam of beams) {
      beam.visible = state.lit;
      const reach = profile.beam;
      const spread = state.main ? 3.6 : 4.6;
      beam.scale.set(spread, reach, spread);
      beam.rotation.set(0, 0, Math.PI / 2 - droop);
      beam.position.set(
        carLength / 2 + Math.cos(droop) * reach * 0.5,
        lampY - Math.sin(droop) * reach * 0.5,
        beam.userData.z + beam.userData.side * 0.9,
      );
    }
  }

  const wheels = Array.isArray(sedan.wheels) ? sedan.wheels : [];
  const wheelRadius = sedan.car?.shape?.wheelR ?? 0.37;
  const scratch = new THREE.Vector3();

  const api = {
    group,
    sedan,
    spots,
    beams,
    wheels,
    length: carLength,
    width: carWidth,

    seatWorld(which, part = 'eye', out = new THREE.Vector3()) {
      const id = SEAT_NAMES[which] ?? which;
      if (part !== 'eye') return sedan.seatWorld(id, out);
      const seat = sedan.seatLocal?.(id);
      // See FOREST_SEATED_EYE: the block's own eye is under its own windows.
      if (!seat) return sedan.eyeWorld(id, out);
      out.set(seat.x, seat.y + FOREST_SEATED_EYE, seat.z);
      return group.localToWorld(out);
    },

    exitWorld(which, out = new THREE.Vector3()) {
      return sedan.doorWorld(SEAT_NAMES[which] ?? which, out);
    },

    engineWorld(out = new THREE.Vector3()) {
      out.set(carLength / 2 - 1.1, 0.7, 0);
      return group.localToWorld(out);
    },

    /** The boot. Nobody mentions it until SM-410. */
    trunkWorld(out = new THREE.Vector3()) {
      return sedan.trunkWorld ? sedan.trunkWorld(out) : api.engineWorld(out);
    },
    setTrunk(open) {
      sedan.setTrunk?.(open);
      return api;
    },

    setHeadlights(on) {
      state.lit = !!on;
      applyLamps();
      /* The block's own lamps go with them: its filaments are what make the
       * headlamp lenses look lit from outside, and its short spot is a
       * perfectly good pool of light under the nose. */
      sedan.setHeadlights(!!on);
      return api;
    },

    setMainBeam(on) {
      state.main = !!on;
      applyLamps();
      return api;
    },

    get headlightsOn() { return state.lit; },
    get mainBeamOn() { return state.main; },

    setBrakeLights(on) {
      sedan.setBrake(on ? 1 : 0);
      return api;
    },

    setCabinLight(on) {
      sedan.setCabinLight?.(on);
      return api;
    },

    setPhone(on) {
      phoneLight.visible = !!on;
      phoneFace.visible = !!on;
      return api;
    },

    /**
     * Turn the rim.
     *
     * The block's sedan steers through its physics, which the rail does not
     * run — so there is nothing to forward this to. The wheel not turning on a
     * bend is a real loss and it is the one thing this adapter cannot give
     * back; the fix, if it is ever wanted, is for `../sedan.js` to expose its
     * steering rim the way `./car.js` does.
     */
    steer() {
      return api;
    },

    rollWheels(distance) {
      const spin = distance / wheelRadius;
      for (const wheel of wheels) wheel.rotation.y += spin;
      return api;
    },

    collider(pad = 0.1) {
      return sedan.collider ? sedan.collider(pad) : new THREE.Box3(
        scratch.set(-carLength / 2, 0, -carWidth / 2).clone().add(group.position),
        scratch.set(carLength / 2, 1.8, carWidth / 2).clone().add(group.position),
      );
    },

    /** Only what this file added. The sedan is disposed by whoever built it. */
    dispose() {
      for (const spot of spots) {
        group.remove(spot, spot.target);
        spot.dispose?.();
      }
      for (const beam of beams) group.remove(beam);
      group.remove(phoneLight, phoneFace);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      return api;
    },
  };

  applyLamps();
  return api;
}
