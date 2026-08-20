/**
 * THE SPECIAL MEETING — the Lincoln, from the front passenger seat.
 *
 * This is the set. The player is in it for two minutes with nothing to do but
 * look, and there is no scenery outside for most of that, so everything he can
 * see is in here: the dash, the wheel in Seff's hands, the mirror, the back of
 * his own headrest, and the two men behind him he has to turn round to look at.
 * It is built to be looked at from ONE seat, and every judgement below is made
 * from that seat.
 *
 * THE FRAME
 *
 *   Local +X is forward, +Y up, and +Z is therefore the car's LEFT. Traffic
 *   drives on the right, so the driver is on the left at +Z and the front
 *   passenger — the Prospect — is at −Z, which is the kerb side. That is the
 *   same reasoning `../layout.js` uses to decide which door opens onto the
 *   pavement outside the flat, and it has to be the same car.
 *
 *   Behind him, at −Z, is Numbskull. That seat is the scene.
 *
 * THE SHELL IS BORROWED, THE INSIDE IS NOT
 *
 *   `makeCar('lincoln')` and `openCabin()` from `src/bing/vehicles.js` are the
 *   project's sedan: the same body the block outside the flat parks at its
 *   kerb, so the car that pulls up and the car he is sitting in are the same
 *   object. What they do not have is an interior anybody has sat in at night,
 *   so the cabin below is built here.
 *
 * LIGHT
 *
 *   Eight lights in the whole scene and this file owns four of them. Two are
 *   the headlamps, which do essentially all of the work outside. The other two
 *   are the reason the scene is watchable at all: an instrument glow, and the
 *   phone in Lag's hand. Without them the cabin is black, and a scene about
 *   three men in a car with three invisible men in it is not a scene.
 */

import * as THREE from 'three';
import { makeCar, makeVehicleCollider, openCabin } from '../../bing/vehicles.js';

/**
 * Where people sit, in the car's own space.
 *
 * `hip` is the seat itself, for putting a body in. `eye` is where the head is,
 * for putting a camera in — a Sasquatch is around two metres and sits high, and
 * this Lincoln's side glass runs from 1.71 to 2.19, so an eye at 1.80 looks
 * OUT of the window rather than at the door card under it. That number is the
 * single most load-bearing measurement in the file.
 */
export const SEATS = Object.freeze({
  driver: Object.freeze({ hip: [-0.15, 0.94, 0.52], eye: [-0.15, 1.80, 0.52] }),
  frontPassenger: Object.freeze({ hip: [-0.15, 0.94, -0.52], eye: [-0.15, 1.80, -0.52] }),
  rearLeft: Object.freeze({ hip: [-1.52, 0.96, 0.55], eye: [-1.52, 1.82, 0.55] }),
  rearRight: Object.freeze({ hip: [-1.52, 0.96, -0.55], eye: [-1.52, 1.82, -0.55] }),
});

/**
 * Headlamp photometry.
 *
 * three.js has been physical since r155: a spot's intensity is candela and it
 * falls off as distance^decay, so the number is not a brightness dial, it is a
 * curve. At decay 1.8 — a reflector throws further than a bare bulb — 300 cd
 * puts about 1.4 on the road twenty metres out and rolls off to nothing by
 * sixty, which is what a dipped beam does. Guessing a small number here is how
 * headlights end up as two bright patches on the bonnet.
 *
 * Main beam is reach, not glare: further and flatter, so the middle of the
 * road gets longer while the trees at the edge of it go dark.
 */
const DECAY = 1.8;
/**
 * `aim` is where the beam is pointed, relative to the lamp: `ahead` metres
 * forward, `drop` metres down, `out` metres toward the kerb.
 *
 * These are angles in disguise and the angles are the point. A lamp a metre off
 * the ground aimed two degrees down puts its hotspot thirty metres away, which
 * is what a dipped beam does. Aimed at a target three metres down and thirty
 * ahead — six and a half degrees, which is what "point it at the road" gets you
 * if you write the numbers without checking — the hotspot lands nine metres out
 * and the car drives around inside a puddle of its own light with blackness
 * beyond it.
 */
const DIPPED = Object.freeze({
  intensity: 300, distance: 70, angle: 0.32,
  aim: { ahead: 55, drop: 1.9, out: 2.6 }, beam: 27,
});
const MAIN = Object.freeze({
  intensity: 430, distance: 96, angle: 0.24,
  aim: { ahead: 90, drop: 2.2, out: 1.4 }, beam: 40,
});

/**
 * Build the car.
 *
 * @param {THREE.Object3D} parent
 * @param {object} [options]
 * @param {number} [options.colour] paint. Near black, and it should stay that
 *        way: the only time the player sees the outside of this car is when he
 *        gets out of it in a clearing with the lights off.
 * @param {boolean} [options.shadows] whether the near headlamp casts. One map,
 *        never two — see the note on the lamps.
 */
export function buildNightSedan(parent, { colour = 0x14161c, shadows = true } = {}) {
  const car = makeCar('lincoln', colour);
  const group = car.group;
  group.name = 'specialmeeting.lincoln';
  parent.add(group);

  const cabin = openCabin(car);
  const materials = [];
  const geometries = [];
  const lights = [];
  const track = (thing) => {
    if (thing?.isMaterial) materials.push(thing);
    if (thing?.isBufferGeometry) geometries.push(thing);
    return thing;
  };

  const trim = track(new THREE.MeshLambertMaterial({ color: 0x1a1712 }));
  const leather = track(new THREE.MeshLambertMaterial({ color: 0x241d16 }));
  const darkPlastic = track(new THREE.MeshLambertMaterial({ color: 0x0e0f12 }));
  const chrome = track(new THREE.MeshStandardMaterial({
    color: 0xb4bac4, roughness: 0.22, metalness: 0.95,
  }));
  const rubber = track(new THREE.MeshLambertMaterial({ color: 0x0b0b0d }));

  const box = (w, h, d, x, y, z, material, name) => {
    const geometry = track(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (name) mesh.name = name;
    group.add(mesh);
    return mesh;
  };

  /* ---------------------------------------------------------------- */
  /* Glass                                                             */
  /* ---------------------------------------------------------------- */

  /* The shell ships one box of glass filling the whole greenhouse, which from
   * inside is a tinted cube around your head. It comes out, and six panes go
   * in: a raked windscreen, a rear window and four sides — the front two of
   * which can be wound down, because SM-290 is Numbskull asking whether the
   * Prospect wants the window down and it should be possible to say yes. */
  group.remove(car.glass);
  car.glass.geometry.dispose();

  const glassMat = track(new THREE.MeshStandardMaterial({
    color: 0x11161c,
    roughness: 0.05,
    metalness: 0.2,
    transparent: true,
    /* Barely there. At night a windscreen is a faint sheen with the world
     * straight through it, and anything more opaque puts a wall between the
     * player and the only thing outside — the beams. */
    opacity: 0.16,
    side: THREE.DoubleSide,
  }));

  const { cx0, cx1, cabinHalfW, glassY0, glassY1 } = cabin;
  const paneH = glassY1 - glassY0;

  const windscreen = box(0.05, paneH * 1.34, cabinHalfW * 1.9,
    cx1 + 0.06, (glassY0 + glassY1) / 2 - 0.04, 0, glassMat, 'lincoln.windscreen');
  windscreen.rotation.z = -0.36;          // raked back over the dash

  const rearGlass = box(0.05, paneH * 1.2, cabinHalfW * 1.86,
    cx0 - 0.05, (glassY0 + glassY1) / 2, 0, glassMat, 'lincoln.rear-glass');
  rearGlass.rotation.z = 0.30;

  const sidePanes = {};
  for (const side of [-1, 1]) {
    const key = side > 0 ? 'left' : 'right';
    const z = side * (cabinHalfW - 0.035);
    const front = box(1.16, paneH, 0.04, -0.12, (glassY0 + glassY1) / 2, z,
      glassMat, `lincoln.window.front.${key}`);
    const rear = box(1.02, paneH, 0.04, -1.42, (glassY0 + glassY1) / 2, z,
      glassMat, `lincoln.window.rear.${key}`);
    sidePanes[`front${side > 0 ? 'Left' : 'Right'}`] = front;
    sidePanes[`rear${side > 0 ? 'Left' : 'Right'}`] = rear;
    /* The B-pillar the shell does not build. Without it the two side panes are
     * one long strip of glass and the car reads as a bus. */
    box(0.09, paneH, 0.05, -0.82, (glassY0 + glassY1) / 2, z, car.paint,
      `lincoln.pillar.b.${key}`);
  }

  /* ---------------------------------------------------------------- */
  /* The dash, and the only light in the cabin                         */
  /* ---------------------------------------------------------------- */

  box(0.56, 0.30, cabinHalfW * 1.86, cx1 - 0.34, 1.26, 0, darkPlastic, 'lincoln.dash');
  // The top pad, angled, because the windscreen has to sit on something.
  const pad = box(0.62, 0.06, cabinHalfW * 1.84, cx1 - 0.36, 1.42, 0, trim, 'lincoln.dash.pad');
  pad.rotation.z = 0.06;

  const binnacleMat = track(new THREE.MeshBasicMaterial({ color: 0x2a1704 }));
  const binnacle = box(0.03, 0.17, 0.46, cx1 - 0.62, 1.31, 0.52, binnacleMat, 'lincoln.binnacle');
  binnacle.rotation.z = 0.22;
  // Three dials, unreadable, which is what a binnacle looks like from the far seat.
  const dialGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 10));
  const dialMat = track(new THREE.MeshBasicMaterial({ color: 0x6a4410 }));
  for (const dz of [-0.14, 0, 0.14]) {
    const dial = new THREE.Mesh(dialGeo, dialMat);
    dial.position.set(cx1 - 0.63, 1.31, 0.52 + dz);
    dial.rotation.z = Math.PI / 2;
    group.add(dial);
  }

  /* The instrument glow. Two and a bit metres of range and nothing like enough
   * to light the road — it exists so that when the player turns his head there
   * is a driver there. */
  const cabinLight = new THREE.PointLight(0xffb057, 1.7, 2.8, 2);
  cabinLight.position.set(cx1 - 0.5, 1.30, 0.30);
  cabinLight.castShadow = false;
  group.add(cabinLight);
  lights.push(cabinLight);

  /* Lag's phone, in the back on the left. Cold, small, and it is the only
   * thing in the back seat that moves. The scene turns it off at SM-400, when
   * he puts it away for the first time all night. */
  const phoneLight = new THREE.PointLight(0x9fd0ff, 0.30, 1.6, 2);
  phoneLight.position.set(-1.45, 1.42, 0.52);
  phoneLight.castShadow = false;
  group.add(phoneLight);
  lights.push(phoneLight);
  const phoneFace = box(0.005, 0.14, 0.08, -1.40, 1.42, 0.52,
    track(new THREE.MeshBasicMaterial({ color: 0x8ec4ff })), 'lincoln.phone');
  phoneFace.rotation.set(0, 0, -0.5);

  /* ---------------------------------------------------------------- */
  /* Wheel, column, mirror                                             */
  /* ---------------------------------------------------------------- */

  const wheelRim = track(new THREE.MeshLambertMaterial({ color: 0x101116 }));
  const steeringWheel = new THREE.Group();
  steeringWheel.name = 'lincoln.steering-wheel';
  steeringWheel.position.set(cx1 - 0.52, 1.34, 0.52);
  /* A column rakes the wheel back toward the driver: the wheel's own axis
   * points forward and down. TorusGeometry is built in its own XY plane with
   * its axis on +Z, so the quarter turn about Y lays that axis along the car
   * and the X term — taken in YXZ order, so it lands in the frame the Y turn
   * made — is the rake. In XYZ order the rake would spin the rim in its own
   * plane and do nothing, which is the exact bug `src/bing/vehicles.js`
   * documents at length. */
  steeringWheel.rotation.order = 'YXZ';
  steeringWheel.rotation.y = Math.PI / 2;
  steeringWheel.rotation.x = 0.44;
  const rimGeo = track(new THREE.TorusGeometry(0.20, 0.024, 8, 22));
  steeringWheel.add(new THREE.Mesh(rimGeo, wheelRim));
  const spokeGeo = track(new THREE.BoxGeometry(0.17, 0.018, 0.026));
  for (const a of [Math.PI / 2, -Math.PI / 6, Math.PI + Math.PI / 6]) {
    const spoke = new THREE.Mesh(spokeGeo, wheelRim);
    spoke.position.set(Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0);
    spoke.rotation.z = a;
    steeringWheel.add(spoke);
  }
  const bossGeo = track(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 10));
  const boss = new THREE.Mesh(bossGeo, wheelRim);
  boss.rotation.x = Math.PI / 2;
  boss.position.z = -0.02;
  steeringWheel.add(boss);
  group.add(steeringWheel);

  const columnGeo = track(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 8));
  const column = new THREE.Mesh(columnGeo, darkPlastic);
  column.position.set(cx1 - 0.40, 1.24, 0.52);
  column.rotation.z = Math.PI / 2 - 0.44;
  group.add(column);

  /* The mirror. It is here because a passenger who is being driven somewhere
   * looks at the mirror, and because the man behind him is in it. */
  const mirror = box(0.035, 0.10, 0.34, cx1 - 0.06, glassY1 - 0.10, 0.06,
    track(new THREE.MeshStandardMaterial({
      color: 0x2a3138, roughness: 0.12, metalness: 0.7,
    })), 'lincoln.mirror');
  mirror.rotation.y = 0.10;

  /* ---------------------------------------------------------------- */
  /* Seats                                                             */
  /* ---------------------------------------------------------------- */

  const seatGroups = {};
  const buildSeat = (key, hip, backAt) => {
    const seat = new THREE.Group();
    seat.name = `lincoln.seat.${key}`;
    const [hx, hy, hz] = hip;
    const cushion = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.14, 0.62)), leather);
    cushion.position.set(hx, hy - 0.20, hz);
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.72, 0.60)), leather);
    back.position.set(backAt, hy + 0.24, hz);
    back.rotation.z = 0.10;
    const rest = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 0.24, 0.34)), trim);
    /* The headrest has to finish BELOW the eye. A seat back that comes up past
     * your own head is a wall in the middle of the frame, and the man the
     * scene is about is sitting directly behind it. */
    rest.position.set(backAt - 0.03, hy + 0.72, hz);
    seat.add(cushion, back, rest);
    group.add(seat);
    seatGroups[key] = seat;
    return seat;
  };
  buildSeat('driver', SEATS.driver.hip, -0.56);
  buildSeat('frontPassenger', SEATS.frontPassenger.hip, -0.56);

  // Rear bench: one cushion, one back, three low rests.
  box(0.60, 0.15, cabinHalfW * 1.72, -1.60, 0.78, 0, leather, 'lincoln.bench');
  box(0.17, 0.70, cabinHalfW * 1.74, -1.94, 1.22, 0, leather, 'lincoln.bench.back');
  for (const bz of [-0.55, 0, 0.55]) {
    box(0.15, 0.20, 0.30, -1.96, 1.68, bz, trim, 'lincoln.bench.headrest');
  }

  // Door cards, so the sills are upholstered and not painted steel.
  for (const side of [-1, 1]) {
    const z = side * (cabinHalfW - 0.075);
    box(2.5, 0.42, 0.06, -0.66, 1.20, z, trim, 'lincoln.doorcard');
    box(0.34, 0.05, 0.10, -0.20, 1.35, z, chrome, 'lincoln.armrest');
  }
  // Transmission tunnel, which is why nobody sits in the middle.
  box(2.4, 0.20, 0.36, -0.75, 0.55, 0, darkPlastic, 'lincoln.tunnel');

  /* ---------------------------------------------------------------- */
  /* Lamps                                                             */
  /* ---------------------------------------------------------------- */

  const lensMat = track(new THREE.MeshBasicMaterial({ color: 0xfff2cf }));
  const tailMat = track(new THREE.MeshBasicMaterial({ color: 0x3a0806 }));
  const shape = car.shape;
  const lampY = shape.wheelR + shape.bodyH * 0.66;

  const headlamps = [];
  const spots = [];
  const beams = [];
  const beamMat = track(new THREE.MeshBasicMaterial({
    color: 0xffe9c0,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  const beamGeo = track(new THREE.ConeGeometry(1, 1, 12, 1, true));

  for (const side of [-1, 1]) {
    const z = side * (shape.W / 2 - 0.42);
    const lens = box(0.10, 0.22, 0.42, shape.L / 2 - 0.02, lampY, z, lensMat, 'lincoln.headlamp');
    headlamps.push(lens);

    /* One spot each, and only the NEARSIDE one casts. Two shadow maps on two
     * lights ten centimetres apart draw the forest twice for a difference no
     * eye can find, and the shadow budget is better spent on resolution: this
     * map only has to cover the beam, so the trunks it throws across the road
     * are sharp.
     *
     * Angle and penumbra are a real dipped beam: about twenty-four degrees,
     * soft at the edge, and aimed a little down and a little to the kerb. */
    const spot = new THREE.SpotLight(0xfff0d2, DIPPED.intensity, DIPPED.distance,
      DIPPED.angle, 0.6, DECAY);
    spot.position.set(shape.L / 2 - 0.1, lampY, z);
    spot.target.position.set(shape.L / 2, lampY, z);
    spot.userData.side = side;
    spot.castShadow = shadows && side < 0;
    if (spot.castShadow) {
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.camera.near = 1.2;
      spot.shadow.camera.far = 58;
      spot.shadow.bias = -0.0018;
      spot.shadow.normalBias = 0.04;
    }
    group.add(spot);
    group.add(spot.target);
    spots.push(spot);
    lights.push(spot);

    /* The beam itself, as geometry. A cone of faint additive light does what
     * no light in a forward renderer can: it makes the air visible, so the
     * beam has a shape before it lands on anything. In the fog pockets it is
     * the difference between headlights and two bright spots on the ground. */
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.name = 'lincoln.beam';
    beam.userData.side = side;
    beam.userData.lampY = lampY;
    beam.userData.z = z;
    beam.castShadow = false;
    beam.renderOrder = 3;
    group.add(beam);
    beams.push(beam);

    const tail = box(0.09, 0.16, 0.34, -shape.L / 2 + 0.02, lampY, side * (shape.W / 2 - 0.40),
      tailMat, 'lincoln.taillamp');
    tail.userData.brakeOff = 0x3a0806;
  }

  const tails = group.children.filter((child) => child.name === 'lincoln.taillamp');

  /* ---------------------------------------------------------------- */
  /* The wheels the shell already built                                */
  /* ---------------------------------------------------------------- */

  /* `makeCar` adds four unnamed cylinder meshes with the rubber material and
   * nothing else does, so they are found rather than rebuilt — and then they
   * are named, because a wheel nobody can find is a wheel that stops turning
   * the next time somebody edits this. */
  const wheels = group.children.filter(
    (child) => child.isMesh && child.geometry?.type === 'CylinderGeometry'
      && child.geometry.parameters?.radiusTop === shape.wheelR,
  );
  if (wheels.length !== 4) {
    throw new Error(
      `Special Meeting: found ${wheels.length} wheels on the Lincoln, not 4 — `
      + 'the shell in src/bing/vehicles.js has changed shape and the lookup below it '
      + 'no longer matches. A car with static wheels reads as a prop being slid '
      + 'along the ground, which is exactly what it is.',
    );
  }
  for (const wheel of wheels) {
    wheel.name = 'lincoln.wheel';
    wheel.material = rubber;
  }

  const state = { lit: true, main: false };
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
      /* The cone's own tip is on its +Y. Turned a quarter turn about Z that
       * axis lands on −X, which puts the TIP at the lamp and the mouth of the
       * cone out in front — and the quarter turn is short by the droop, so the
       * mouth is the part that drops. A quarter turn PLUS the droop tips the
       * far end up into the trees instead, which is a searchlight. */
      beam.rotation.set(0, 0, Math.PI / 2 - droop);
      beam.position.set(
        car.length / 2 + Math.cos(droop) * reach * 0.5,
        beam.userData.lampY - Math.sin(droop) * reach * 0.5,
        beam.userData.z + beam.userData.side * 0.9,
      );
    }
    for (const lens of headlamps) {
      lens.material.color.setHex(state.lit ? 0xfff2cf : 0x2a2822);
    }
  }

  const api = {
    group,
    car,
    cabin,
    wheels,
    steeringWheel,
    headlamps,
    spots,
    beams,
    tails,
    lights,
    seats: seatGroups,
    windows: sidePanes,
    phoneLight,
    cabinLight,
    length: car.length,
    width: car.width,

    /** World position of a seat's hip or eye. */
    seatWorld(which, part = 'eye', out = new THREE.Vector3()) {
      const seat = SEATS[which] ?? SEATS.frontPassenger;
      const local = seat[part] ?? seat.eye;
      out.set(local[0], local[1], local[2]);
      return group.localToWorld(out);
    },

    /** Ground beside a door, for getting out at the far end. */
    exitWorld(which, out = new THREE.Vector3()) {
      const seat = SEATS[which] ?? SEATS.frontPassenger;
      const side = Math.sign(seat.hip[2]) || 1;
      out.set(seat.hip[0], 0, side * (car.width / 2 + 0.75));
      return group.localToWorld(out);
    },

    /** Engine bay, for hanging the engine loop on something that moves. */
    engineWorld(out = new THREE.Vector3()) {
      out.set(car.length / 2 - 1.1, 0.7, 0);
      return group.localToWorld(out);
    },

    /* On/off and dipped/main are two independent facts and the lamps are the
     * product of them. Holding that state in the light's own intensity — off
     * meaning zero, and main beam reading the zero back to decide whether it
     * was on — is how a car ends up driving through a forest with the lamps
     * lit and the beams invisible. */
    setHeadlights(on) {
      state.lit = on;
      applyLamps();
      return api;
    },

    /** Full beam. SM-220: the tarmac ends and Seff puts them on. */
    setMainBeam(on) {
      state.main = on;
      applyLamps();
      return api;
    },

    get headlightsOn() { return state.lit; },
    get mainBeamOn() { return state.main; },

    setBrakeLights(on) {
      for (const tail of tails) tail.material.color.setHex(on ? 0xff2a18 : tail.userData.brakeOff);
      return api;
    },

    /** Lag's phone, and the moment it goes away. */
    setPhone(on) {
      phoneLight.visible = on;
      phoneFace.visible = on;
      return api;
    },

    setCabinLight(on) {
      cabinLight.visible = on;
      binnacle.visible = on;
      return api;
    },

    /**
     * Wind a front window down. SM-290, and the answer is usually no.
     * @param {number} t 0 shut, 1 fully down.
     */
    setWindow(which, t) {
      const pane = sidePanes[which];
      if (!pane) return api;
      const drop = (glassY1 - glassY0) * t;
      pane.position.y = (glassY0 + glassY1) / 2 - drop;
      pane.visible = t < 0.98;
      return api;
    },

    /** Turn the rim. Eased, and about two thirds of a turn at full lock. */
    steer(amount) {
      const want = Math.max(-1, Math.min(1, amount)) * 2.0;
      steeringWheel.rotation.z = want;
      return api;
    },

    /** Roll the wheels by a distance travelled, in metres. */
    rollWheels(distance) {
      const spin = distance / shape.wheelR;
      for (const wheel of wheels) wheel.rotation.y += spin;
      return api;
    },

    /** Axis-aligned collider, for the walk once everybody is out. */
    collider(pad = 0.1) {
      return makeVehicleCollider(car, pad);
    },

    /**
     * Give back only what this file made.
     *
     * NOT a `traverse` that disposes every geometry it finds. The shell comes
     * from `src/bing/vehicles.js`, which builds its panels with `box()` from
     * `src/world/build.js` — and that shares ONE unit BoxGeometry across the
     * entire game. Disposing it here would empty every box in every scene the
     * moment this car went away. The same rule covers the materials: `mat()`
     * hands out cached shared ones, and only the `track()`ed list below was
     * minted here.
     */
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      // The four wheels share the one cylinder `makeCar` built for them.
      wheels[0]?.geometry?.dispose?.();
      parent.remove(group);
    },
  };

  applyLamps();
  api.setBrakeLights(false);
  return api;
}

/** Local eye of a seat, without a car. Used by the camera before boarding. */
export function seatEye(which, out = new THREE.Vector3()) {
  const seat = SEATS[which] ?? SEATS.frontPassenger;
  return out.set(seat.eye[0], seat.eye[1], seat.eye[2]);
}
