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

/* THE SEATED EYE MOVED TO `../sedan.js`, AND THIS IS THE NOTE THAT SENT IT.
 *
 * This file used to override it, on the reasoning that the block's car is
 * stationary, the player is outside it, and nobody looks out of it. The first
 * two are true and the third was not: `../main.js`'s `onSeated` puts the
 * camera in the block sedan's front passenger seat and leaves it there until
 * `board()` runs inside the drive — which happens AFTER the cut to black. So
 * for the ten seconds between shutting the door and the picture going, the
 * player sat at the block's own 0.72 eye.
 *
 * That is 1.52 in world terms, and this shell's side glass runs from 1.712 to
 * 2.194 over cushions at 0.80: NINETEEN CENTIMETRES BELOW THE BOTTOM OF THE
 * WINDOW, in an unlit cabin. The owner reported it as the screen going black a
 * few seconds after he got in the car — before the scripted cut to black, and
 * indistinguishable from it.
 *
 * One metre puts the eye at 1.80, the lower third of the glass, which is where
 * a head belongs. It is tall for a person and about right for a Sasquatch, and
 * it is the number the whole shot depends on. The old note here said to move it
 * to `../sedan.js` if the drive ever became the only consumer; what actually
 * happened is that the block became a consumer too, which is the same
 * conclusion from the other end.
 */

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

  /* THE CABIN, WHICH HAD NO LIGHT IN IT AT ALL.
   *
   * `../sedan.js`'s `setCabinLight` moves an emissive value on the dome lamp
   * MESH (sedan.js `domeLamp`) and emits nothing onto anybody -- an emissive
   * material lights itself and nothing else. The car that does carry a real
   * cabin light is `./car.js`, and this adapter exists precisely because that
   * car is not the one the scene ships: `../main.js` hands the block's sedan
   * to `createNightForestRoad`, so `buildNightSedan` never runs and its
   * `PointLight` never exists. The headlamps and Lag's phone were ported here;
   * the light that lets you see the men was not.
   *
   * The result on screen: the forest night is moon 0.34 and hemi 0.34 with no
   * ambient at all (`./night.js`), a closed roof takes both, and every face in
   * the car renders black for the whole drive. That is the owner's "characters
   * appear to have missing faces" AND his "the vehicle interior is far too
   * dark" -- one cause under two reports.
   *
   * Four lights, because "ominous does not mean invisible" was the note:
   *
   *   dome      the door light. Bright, warm, and ON only while a door is
   *             open, exactly as before -- this is what `setCabinLight` drives.
   *   dash      the instrument glow. Amber, weak, under the driver's hands.
   *             Never off during the drive; it is why there is a driver there
   *             when the player turns his head.
   *   moonFill  moonlight through the side glass. Cool, above and outboard of
   *             the passenger, angled down across the seats. This is the one
   *             that reads a face, and it is cold enough that the cabin still
   *             looks like a car at night rather than a lit room.
   *   sweep     what goes past. A single cool point that runs the length of
   *             the car and dies, re-fired from `updateCabin` against distance
   *             travelled, so the interior keeps changing while the road does.
   *
   * All four are car-local and parented to the car group, so they ride with it
   * and cost nothing to move. None of them is a mesh: adding a lamp lens here
   * would resync `tools/geometry-allowlists/specialmeeting.json`.
   */
  const dome = new THREE.PointLight(0xffb057, 0, 3.2, 2);
  dome.name = 'forest.cabin.dome';
  dome.position.set(-0.42, 1.86, 0);
  dome.castShadow = false;
  group.add(dome);

  const dash = new THREE.PointLight(0xffa24a, 1.3, 1.9, 2);
  dash.name = 'forest.cabin.dash';
  dash.position.set(0.40, 1.06, 0.30);
  dash.castShadow = false;
  group.add(dash);

  const moonFill = new THREE.PointLight(0xa8c4ff, 5.4, 4.6, 2);
  moonFill.name = 'forest.cabin.moon';
  moonFill.position.set(-0.42, 1.76, -1.06);
  moonFill.castShadow = false;
  group.add(moonFill);

  /* The same moon, off the other side of the car, so a face is modelled rather
   * than lit from one edge. Weaker, because there is only one moon and this is
   * what comes back off the driver's glass. */
  const moonBounce = new THREE.PointLight(0x8fa8d8, 3.6, 4.2, 2);
  moonBounce.name = 'forest.cabin.moon-bounce';
  moonBounce.position.set(-0.42, 1.76, 1.06);
  moonBounce.castShadow = false;
  group.add(moonBounce);

  const sweep = new THREE.PointLight(0xdfe8ff, 0, 4.0, 2);
  sweep.name = 'forest.cabin.sweep';
  sweep.position.set(0, 1.55, 1.25);
  sweep.castShadow = false;
  group.add(sweep);

  /* What the moon is worth inside the car, and how much the trees take off it.
   * Tuned against a rendered frame from the front passenger seat rather than
   * by eye: below about 5 the driver's face does not read at all, and much
   * above 8 the cabin stops looking like a car at night. */
  const MOON_BASE = 5.4;
  const MOON_SWING = 1.4;

  /* Metres between one thing going past and the next. Authored, not random --
   * `../cast.js`'s header rules out Math.random in this scene, and a fixed
   * interval against a varying road speed already reads as irregular. */
  const SWEEP_EVERY = 74;
  /* How far the light travels front-to-back before it dies, in metres of road. */
  const SWEEP_RUN = 9;
  const cabinState = { sinceSweep: SWEEP_EVERY * 0.5, sweeping: -1 };

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
      /* One eye height, and it lives on the car. See the note above. */
      return sedan.eyeWorld(id, out);
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

    /**
     * The door light, and only the door light.
     *
     * The dome goes with an open door; the dash, the moonlight and whatever is
     * going past outside are not a switch anybody flips and stay where
     * `updateCabin` puts them. `../main.js` turns this off the moment he sits
     * down, which used to take the cabin's only nominal light source with it
     * and now takes nothing the player was seeing by.
     */
    setCabinLight(on) {
      dome.intensity = on ? 3.4 : 0;
      sedan.setCabinLight?.(on);
      return api;
    },

    /**
     * Keep the inside of the car alive while the outside of it moves.
     *
     * Called every frame from `./index.js` with the drive's own speed and
     * distance, so a stopped car stops getting light past its windows -- at
     * the chain and on the spur the cabin goes still, which is the point of
     * both beats.
     *
     * @param {number} dt seconds
     * @param {{speed:number, distance:number}} drive the rail's own state
     */
    updateCabin(dt, drive = {}) {
      const speed = Number.isFinite(drive.speed) ? drive.speed : 0;
      const travelled = Math.max(0, speed) * Math.max(0, dt);

      /* Something going past. It starts ahead of the windscreen, runs back
       * over the roof line and is gone -- one pass per SWEEP_EVERY metres. */
      if (cabinState.sweeping >= 0) {
        cabinState.sweeping += travelled;
        const t = cabinState.sweeping / SWEEP_RUN;
        if (t >= 1) {
          cabinState.sweeping = -1;
          sweep.intensity = 0;
        } else {
          sweep.position.set(1.9 - t * 4.6, 1.62, 1.15);
          /* Up and back down over the pass, so it arrives and leaves rather
           * than switching on beside the car. */
          sweep.intensity = 3.6 * Math.sin(Math.PI * t) ** 2;
        }
      } else {
        cabinState.sinceSweep += travelled;
        if (cabinState.sinceSweep >= SWEEP_EVERY) {
          cabinState.sinceSweep = 0;
          cabinState.sweeping = 0;
        }
      }

      /* The moon does not flicker, but the trees between it and the car do.
       * Tied to distance, not to a clock, so it holds still when the car does. */
      const shade = MOON_BASE + MOON_SWING * Math.sin(drive.distance * 0.21)
        * Math.max(0, Math.min(1, speed / 6));
      moonFill.intensity = shade;
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
      group.remove(phoneLight, phoneFace, dome, dash, moonFill, moonBounce, sweep);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      return api;
    },
  };

  applyLamps();
  return api;
}
