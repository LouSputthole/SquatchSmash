/** NO WAKE must reach the inlet on time and leave a human route down Gate C. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { Player } = await import('../src/core/player.js');
const {
  BoatPhysics,
  BOAT_FORWARD_TARGET_SPEED,
  BOAT_REVERSE_TARGET_SPEED,
  boatSpeedFraction,
} = await import('../src/nowake/physics.js');
const {
  buildNoWakeWorld, CRUISER_HULL_SECTIONS, INLET, INLET_HEADLAND,
} = await import('../src/nowake/world.js');
const {
  shouldReachNoWakeInlet, takeDueCruiseLines,
} = await import('../src/nowake/route-policy.js');
const {
  NO_WAKE_INLET_LINES, buildNoWakeCruise,
} = await import('../src/nowake/dialogue.js');

const PLAYER_RADIUS = 0.30;
const AUTHORED_RUN_SECONDS = 90;

const mainSource = fs.readFileSync(new URL('../src/nowake/main.js', import.meta.url), 'utf8');
const audioSource = fs.readFileSync(new URL('../src/nowake/audio.js', import.meta.url), 'utf8');
const physicsSource = fs.readFileSync(new URL('../src/nowake/physics.js', import.meta.url), 'utf8');

function requestedStep(physics, dt, requestedThrottle, requestedSteer = 0) {
  const throttleRate = requestedThrottle === 0 ? 2.8 : requestedThrottle > 0 ? 1.25 : 1.65;
  physics.throttle += (requestedThrottle - physics.throttle)
    * (1 - Math.exp(-dt * throttleRate));
  physics.steer += (requestedSteer - physics.steer) * (1 - Math.exp(-dt * 4.2));
  physics.advance(dt);
}

test('one exported speed contract owns forward, reverse, steering, gauges, wake, and engine way', () => {
  assert.match(physicsSource, /export const BOAT_REVERSE_TARGET_SPEED\s*=\s*2\.9/,
    'reverse target speed is not part of the exported boat contract');
  assert.doesNotMatch(physicsSource, /Math\.abs\(this\.speed\)\s*\/\s*5\.2/,
    'steering authority still duplicates the forward target literal');
  assert.doesNotMatch(mainSource, /Math\.abs\(physics\.speed\)\s*\/\s*8\.5/,
    'cockpit presentation still normalizes against the retired 8.5 m/s scale');
  assert.doesNotMatch(audioSource, /Math\.abs\(speed\)\s*\/\s*8\.6/,
    'engine way still normalizes against the retired 8.6 m/s scale');
  assert.match(mainSource, /boatSpeedFraction\(physics\.speed\)/,
    'main does not drive the gauge and propulsion mix from the shared speed contract');
  assert.match(audioSource, /boatSpeedFraction\(speed\)/,
    'engine audio does not drive way from the shared speed contract');

  const settle = (throttle, steer = 0) => {
    const physics = new BoatPhysics();
    physics.running = true;
    physics.mooringReleased = true;
    physics.throttle = throttle;
    physics.steer = steer;
    for (let i = 0; i < 30 * 120; i++) physics.advance(1 / 120);
    return physics;
  };
  const forward = settle(1);
  assert.ok(forward.speed > BOAT_FORWARD_TARGET_SPEED * .92
    && forward.speed < BOAT_FORWARD_TARGET_SPEED,
  `forward steady speed ${forward.speed.toFixed(3)} does not approach the shared target`);
  const reverse = settle(-1);
  assert.ok(reverse.speed < -BOAT_REVERSE_TARGET_SPEED * .92
    && reverse.speed > -BOAT_REVERSE_TARGET_SPEED,
  `reverse steady speed ${reverse.speed.toFixed(3)} does not approach the shared target`);
  assert.equal(boatSpeedFraction(BOAT_FORWARD_TARGET_SPEED), 1);
  assert.equal(boatSpeedFraction(-BOAT_REVERSE_TARGET_SPEED), 1);
  assert.ok(boatSpeedFraction(forward.speed) > .92,
    'steady forward motion never reaches the presentation/handling range');

  const forwardTurn = settle(1, .6);
  const reverseTurn = settle(-1, .6);
  assert.ok(forwardTurn.heading < 0, `forward starboard helm turned to ${forwardTurn.heading}`);
  assert.ok(reverseTurn.heading > 0, `reverse starboard helm turned to ${reverseTurn.heading}`);
});

test('the inlet trigger reads actual corridor position instead of accepting odometer progress', () => {
  assert.match(mainSource, /shouldReachNoWakeInlet\(\{/,
    'main still advances the mission without the positional inlet policy');
  assert.doesNotMatch(mainSource,
    /state\.driveSeconds\s*>=\s*DRIVE_SECONDS\s*&&\s*physics\.distance\s*>=\s*360/,
    'the retired odometer-only inlet gate is still live');
  assert.match(mainSource, /takeDueCruiseLines\(/,
    'main does not drain every authored cruise cue in source order');
});

function routeState(physics, driveSeconds) {
  return {
    driveSeconds,
    x: physics.position.x,
    z: physics.position.y,
    inlet: INLET,
  };
}

test('reverse out-and-back and a circle cannot bank the open-water checkpoint', () => {
  const dt = 1 / 60;
  const outAndBack = new BoatPhysics();
  outAndBack.running = true;
  outAndBack.mooringReleased = true;
  let driveSeconds = 0;
  let reached = false;
  let t = 0;
  while (t < 110) {
    requestedStep(outAndBack, dt, t < 65 ? 1 : -.48);
    if (Math.abs(outAndBack.speed) > .8) driveSeconds += dt;
    reached ||= shouldReachNoWakeInlet(routeState(outAndBack, driveSeconds));
    t += dt;
  }
  assert.equal(reached, false, 'out-and-back odometer progress reached the inlet policy');
  assert.ok(outAndBack.distance >= 360 && driveSeconds >= AUTHORED_RUN_SECONDS,
    'out-and-back regression never accumulated the old gate inputs');
  /* 65 s out at the 20 kn hull reaches ~-640; the inlet window now starts
   * past -900, so shy of -700 proves the odometer alone earned nothing. */
  assert.ok(outAndBack.position.y > -700 && outAndBack.speed < 0,
    `out-and-back test accidentally reached the inlet at ${outAndBack.position.toArray()}`);

  const circling = new BoatPhysics();
  circling.running = true;
  circling.mooringReleased = true;
  driveSeconds = 0;
  reached = false;
  for (let frame = 0; frame < 110 * 60; frame++) {
    requestedStep(circling, dt, 1, 1);
    if (Math.abs(circling.speed) > .8) driveSeconds += dt;
    reached ||= shouldReachNoWakeInlet(routeState(circling, driveSeconds));
  }
  assert.equal(reached, false, 'circling odometer progress reached the inlet policy');
  assert.ok(circling.distance >= 360 && driveSeconds >= AUTHORED_RUN_SECONDS,
    'circling regression never accumulated the old gate inputs');
});

function applyBoatTransform(world, physics, dt) {
  const motion = physics.motion();
  world.boat.root.position.set(
    physics.position.x,
    world.boat.floatY + motion.heave,
    physics.position.y,
  );
  world.boat.root.rotation.set(motion.pitch, physics.heading, motion.roll, 'YXZ');
  world.update(physics.time, dt);
}

test('the real-ramp canonical run dispatches every cue in order and naturally coasts clear of head land', () => {
  const dt = 1 / 60;
  const physics = new BoatPhysics();
  physics.running = true;
  physics.mooringReleased = true;
  const world = buildNoWakeWorld(new THREE.Scene());
  const headland = world.channel.root.getObjectByName('inlet head land');
  const headlandBox = new THREE.Box3().setFromObject(headland);
  const cruiseLines = buildNoWakeCruise({});
  const cues = [];
  let cueIndex = 0;
  let driveSeconds = 0;
  let reached = false;
  let frames = 0;

  while (!reached && frames < 120 * 60) {
    requestedStep(physics, dt, 1);
    if (Math.abs(physics.speed) > .8) driveSeconds += dt;
    const due = takeDueCruiseLines(cruiseLines, cueIndex, driveSeconds);
    cues.push(...due.due.map((line) => line.cue));
    cueIndex = due.nextIndex;
    applyBoatTransform(world, physics, dt);
    reached = shouldReachNoWakeInlet(routeState(physics, driveSeconds));
    frames++;
  }
  assert.equal(reached, true, `canonical route missed the inlet at ${physics.position.toArray()}`);
  cues.push(NO_WAKE_INLET_LINES.bringHerDown.cue);

  let minimumClearance = Infinity;
  let intersected = false;
  const sampleClearance = () => {
    const hullBox = new THREE.Box3().setFromObject(world.boat.hull);
    minimumClearance = Math.min(minimumClearance, hullBox.min.z - headlandBox.max.z);
    intersected ||= hullBox.intersectsBox(headlandBox);
  };
  sampleClearance();

  /* The authored order owns the voice channel for 2.2 s before the HUD asks
   * for neutral. Hold W through that reading window, then let the real throttle
   * and displacement hull coast down to the production kill threshold. */
  for (let i = 0; i < 2.2 / dt; i++) {
    requestedStep(physics, dt, 1);
    applyBoatTransform(world, physics, dt);
    sampleClearance();
  }
  let coastFrames = 0;
  while ((Math.abs(physics.throttle) >= .08 || Math.abs(physics.speed) >= .62)
    && coastFrames < 30 * 60) {
    requestedStep(physics, dt, 0);
    applyBoatTransform(world, physics, dt);
    sampleClearance();
    coastFrames++;
  }
  cues.push(NO_WAKE_INLET_LINES.killThem.cue);

  assert.deepEqual(cues, [
    ...cruiseLines.map((line) => line.cue),
    NO_WAKE_INLET_LINES.bringHerDown.cue,
    NO_WAKE_INLET_LINES.killThem.cue,
  ]);
  assert.equal(intersected, false, 'the naturally coasting visible hull entered head land');
  assert.ok(minimumClearance >= 15,
    `natural neutral left only ${minimumClearance.toFixed(3)} m before head land`);
  assert.ok(coastFrames < 30 * 60 && Math.abs(physics.speed) < .62,
    `the cruiser never reached the natural engine-kill threshold (${physics.speed})`);
});

test('full throttle for the authored 90 seconds reaches the inlet without sweeping the headland', () => {
  const physics = new BoatPhysics();
  physics.running = true;
  physics.mooringReleased = true;
  physics.throttle = 1;
  let minimumHullClearance = Infinity;

  for (let i = 0; i < AUTHORED_RUN_SECONDS * 120; i++) {
    physics.advance(1 / 120);
    const bowWorldZ = physics.position.y + CRUISER_HULL_SECTIONS[0].z;
    minimumHullClearance = Math.min(minimumHullClearance, bowWorldZ - INLET_HEADLAND.nearZ);
  }

  assert.ok(Math.abs(physics.position.y - INLET.z) <= 7,
    `90 seconds ended at z ${physics.position.y.toFixed(2)}, not the inlet ${INLET.z}`);
  assert.ok(physics.distance >= 400,
    `90-second run covered only ${physics.distance.toFixed(2)} m and cannot clear the mission gate`);
  assert.ok(minimumHullClearance >= 39,
    `the swept bow left only ${minimumHullClearance.toFixed(2)} m before inlet head land`);
});

test('the real player capsule has a plainly walkable lane past the visible dock cart', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const finger = world.marina.root.getObjectByName('finger dock deck');
  const cart = world.marina.root.getObjectByName('dock cart');
  assert.ok(finger && cart, 'real Gate C finger/cart geometry is missing');
  world.marina.root.updateMatrixWorld(true);
  const fingerBox = new THREE.Box3().setFromObject(finger);
  const visibleCartBox = new THREE.Box3().setFromObject(cart);
  const cartCentre = visibleCartBox.getCenter(new THREE.Vector3());
  const cartCollider = world.marina.colliders.find(
    (box) => box.containsPoint(cartCentre) || box.intersectsBox(visibleCartBox),
  );
  assert.ok(cartCollider, 'visible dock cart has no real player collider');
  assert.ok(cartCollider.containsBox(visibleCartBox),
    `cart collider does not cover visible cart: ${JSON.stringify({ visibleCartBox, cartCollider })}`);

  const laneMinX = cartCollider.max.x + PLAYER_RADIUS;
  const laneMaxX = fingerBox.max.x - PLAYER_RADIUS;
  const centreLaneWidth = laneMaxX - laneMinX;
  assert.ok(centreLaneWidth >= 1.2,
    `dock cart leaves only ${centreLaneWidth.toFixed(3)} m for a 0.60 m player capsule`);

  const laneX = (laneMinX + laneMaxX) / 2;
  const player = new Player(new THREE.PerspectiveCamera(), world);
  player.mode = 'walk';
  player.enabled = true;
  player.ground = 0.2;
  player.position.set(laneX, player.ground + player.eyeHeight, 20);
  player.yaw = 0;
  player.setKey('KeyW', true);
  let closestCart = Infinity;
  let frames = 0;
  while (frames < 2400 && player.position.z > -17.5) {
    player.update(1 / 60);
    const cx = THREE.MathUtils.clamp(player.position.x, cartCollider.min.x, cartCollider.max.x);
    const cz = THREE.MathUtils.clamp(player.position.z, cartCollider.min.z, cartCollider.max.z);
    closestCart = Math.min(closestCart, Math.hypot(player.position.x - cx, player.position.z - cz));
    assert.ok(player.position.x >= fingerBox.min.x + PLAYER_RADIUS
      && player.position.x <= fingerBox.max.x - PLAYER_RADIUS,
    `player was pushed off the 3.35 m finger at ${player.position.toArray()}`);
    frames++;
  }
  player.setKey('KeyW', false);

  assert.ok(player.position.z <= -17.5,
    `real Player stalled at z ${player.position.z.toFixed(2)} before passing the cart`);
  assert.ok(closestCart >= PLAYER_RADIUS - 1e-6,
    `real Player overlapped the cart by ${(PLAYER_RADIUS - closestCart).toFixed(3)} m`);
});

test('dock furniture is visibly supported without taking back the clear cart lane', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  world.update(0, 0);
  const finger = world.marina.root.getObjectByName('finger dock deck');
  const cart = world.marina.root.getObjectByName('dock cart');
  assert.ok(finger && cart, 'real Gate C finger/cart geometry is missing');
  world.marina.root.updateMatrixWorld(true);

  const plankBoxes = [];
  world.marina.root.traverse((object) => {
    if (/^finger dock plank /.test(object.name)) {
      plankBoxes.push(new THREE.Box3().setFromObject(object));
    }
  });
  const supportingPlankTop = (box) => Math.max(...plankBoxes
    .filter((plank) => plank.max.x >= box.min.x && plank.min.x <= box.max.x
      && plank.max.z >= box.min.z && plank.min.z <= box.max.z)
    .map((plank) => plank.max.y));

  const supportErrors = [];
  for (let i = 1; i <= 3; i++) {
    const body = new THREE.Box3().setFromObject(
      world.marina.root.getObjectByName(`shore-power body ${i}`),
    );
    const gap = body.min.y - supportingPlankTop(body);
    if (Math.abs(gap) > 0.005) supportErrors.push({ object: `shore-power body ${i}`, gap });
  }
  for (let i = 1; i <= 4; i++) {
    const wheel = new THREE.Box3().setFromObject(
      world.marina.root.getObjectByName(`dock cart wheel ${i}`),
    );
    const gap = wheel.min.y - supportingPlankTop(wheel);
    if (Math.abs(gap) > 0.005) supportErrors.push({ object: `dock cart wheel ${i}`, gap });
  }

  const fingerBox = new THREE.Box3().setFromObject(finger);
  const cartBox = new THREE.Box3().setFromObject(cart);
  const cartCentre = cartBox.getCenter(new THREE.Vector3());
  const collider = world.marina.colliders.find(
    (box) => box.containsPoint(cartCentre) || box.intersectsBox(cartBox),
  );
  assert.ok(collider?.containsBox(cartBox), 'support correction escaped the cart collider');
  const laneWidth = fingerBox.max.x - PLAYER_RADIUS - (collider.max.x + PLAYER_RADIUS);
  assert.ok(laneWidth >= 1.2, `supported cart leaves only ${laneWidth.toFixed(3)} m of clear lane`);
  assert.deepEqual(supportErrors, [], supportErrors
    .map(({ object, gap }) => `${object}: ${(gap * 1000).toFixed(1)} mm ${gap > 0 ? 'above' : 'below'} the visible planks`)
    .join('\n'));
});
