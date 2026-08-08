import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { MissionController } from '../src/beefrun/mission.js';

function flightCommonHarness(overrides = {}) {
  const horn = [];
  const barks = [];
  const warnings = [];
  const physics = {
    position: new THREE.Vector3(0, 1, 0),
    velocity: new THREE.Vector3(),
    wind: new THREE.Vector3(),
    gust: new THREE.Vector3(),
    agl: 0.5,
    onGround: true,
    tas: 0,
    ias: 0,
    vspeed: 0,
    stallT: 0,
    rollDeg: 0,
    pitchDeg: 0,
    gLoad: 1,
    groundSpeed: 0,
    thrustL: 0,
    thrustR: 0,
    suspension: [0, 0, 0],
    damage: { wing: 0, gear: 0, tireBurst: false },
    ...overrides.physics,
  };
  const fake = {
    physics,
    phase: 'taxi',
    _ambientBarkTimer: 30,
    _lastTas: 0,
    score: {
      roughAir: 0,
      fuelRemaining: 1,
      cargoDamage: 0,
      patrolPeak: 0,
      damage: 0,
    },
    weather: { sampleAir() {}, inCloud: () => false },
    audio: { setStallHorn: (on) => horn.push(on) },
    dialogue: { bark: (pool) => { barks.push(pool); return true; } },
    engines: {
      fuel: 100,
      engines: [
        { temp: 100, health: 1, dead: false },
        { temp: 100, health: 1, dead: false },
      ],
    },
    cargo: {
      shift: 0,
      intact: 1,
      update() {},
      applyTo() {},
    },
    detection: { active: false, patrols: [], state: 'unnoticed', attention: 0, locatedFor: 0 },
    cameras: { addShake() {} },
    flightHud: {
      setNav() {}, setDirection() {}, ageControls() {},
      setWarnings: (value) => warnings.push([...value]),
      setPatrol() {}, hidePatrol() {},
    },
    approachGates: null,
    navTarget: () => null,
    lateralG: () => 0,
    fail() {},
    ...overrides.controller,
  };
  return { fake, horn, barks, warnings };
}

test('the stall warning is silent while the aircraft is on the ground', () => {
  const { fake, horn, barks, warnings } = flightCommonHarness({
    physics: { stallT: 0.9, onGround: true, agl: 0.3, tas: 25, ias: 25 },
  });

  MissionController.prototype.updateFlightCommon.call(fake, 0.016);

  assert.equal(horn.at(-1), false);
  assert.ok(!warnings.at(-1).includes('stall'));
  assert.ok(!barks.includes('stall'));
});

test('airborne handling barks cannot trigger during taxi or landing rollout', () => {
  const harness = flightCommonHarness({
    physics: {
      onGround: true,
      agl: 0.3,
      tas: 80,
      ias: 80,
      rollDeg: 55,
    },
  });
  harness.fake.cargo.shift = 0.8;

  MissionController.prototype.updateFlightCommon.call(harness.fake, 0.016);

  assert.deepEqual(
    harness.barks.filter((pool) => ['overspeed', 'cargoShift', 'banked'].includes(pool)),
    [],
  );
});

test('an engine event on the ground cannot trigger Sasole\'s stall bark', () => {
  const heard = [];
  const fake = {
    physics: { onGround: true },
    flags: { inCockpit: true },
    dialogue: { bark: (pool) => heard.push(pool) },
  };

  MissionController.prototype.onEngineEvent.call(fake, 'failed', 0);

  assert.deepEqual(heard, []);
});

test('leaving the aircraft immediately clears the stall horn and warning panel', () => {
  const horn = [];
  const warningSets = [];
  const fake = {
    flags: { inCockpit: true },
    flightHud: {
      showControls() {},
      setDirection() {},
      setWarnings: (warnings) => warningSets.push([...warnings]),
    },
    interaction: { setPaused() {} },
    audio: {
      setHeadset() {},
      setStallHorn: (on) => horn.push(on),
      setAirspeed() {},
    },
    dialogue: { setHeadset() {} },
    input: { rudderKeys: true, clear() {} },
    physics: {
      position: new THREE.Vector3(0, 10, 0),
      quat: new THREE.Quaternion(),
    },
    player: {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      enabled: false,
      mode: 'frozen',
      ground: 0,
      yaw: 0,
      pitch: 0,
    },
  };

  MissionController.prototype.exitCockpit.call(fake);

  assert.equal(horn.at(-1), false);
  assert.deepEqual(warningSets.at(-1), []);
  assert.equal(fake.flags.inCockpit, false);
});

test('fast taxi uses the authored ground warning instead of an airborne smooth-flight bark', () => {
  const plays = [];
  const barks = [];
  const fake = {
    physics: { position: new THREE.Vector3(), groundSpeed: 16 },
    airfield: { anchors: { holdShort: new THREE.Vector3(100, 0, 0) } },
    taxi: { bestDistance: Infinity },
    dialogue: {
      busy: false,
      seen: () => true,
      play: (cue) => { plays.push(cue); return true; },
      bark: (pool) => { barks.push(pool); return true; },
    },
    phaseTime: 0,
    setObjective() {},
    setPhase() {},
  };

  MissionController.prototype.updateTaxi.call(fake, 0.016);

  assert.deepEqual(plays, ['taxi.fast']);
  assert.deepEqual(barks, []);
});

test('standing near Cecilio does not keep his mouth moving after dialogue ends', () => {
  const cecilio = { group: { position: new THREE.Vector3() }, lookAt: null, talk: 0 };
  const fake = {
    player: { position: new THREE.Vector3(1, 0, 0) },
    airstrip: { cecilio },
    score: { gunsDelivered: 0 },
    dialogue: { busy: true, seen: () => false, play() {} },
    setPhase() {},
  };

  MissionController.prototype.updateOnFootStrip.call(fake, 0.016);

  assert.equal(cecilio.talk, 0);
  assert.equal(cecilio.lookAt, fake.player.position);
});

function impactHarness() {
  const events = [];
  const fake = {
    aircraft: {
      destroyed: false,
      explode() {
        this.destroyed = true;
        events.push('explode');
        return true;
      },
    },
    physics: {
      damage: { wing: 0 },
      controls: { throttleL: 0.7, throttleR: 0.7 },
      velocity: new THREE.Vector3(20, -3, 40),
      omega: new THREE.Vector3(0.2, 0.1, 0.3),
    },
    cameras: { addShake: (amount) => events.push(['shake', amount]) },
    audio: {
      play: (name) => events.push(['play', name]),
      explosion: () => events.push('explosion-sound'),
    },
    engines: {
      engines: [{}, {}],
      kill: (index, reason) => events.push(['kill', index, reason]),
    },
    fail: (reason) => events.push(['fail', reason]),
  };
  return { fake, events };
}

test('a light terrain brush is forgiven without damage, failure, or explosion', () => {
  const { fake, events } = impactHarness();

  MissionController.prototype.onImpact.call(fake, 2.2, 'terrain');

  assert.equal(fake.physics.damage.wing, 0);
  assert.equal(fake.aircraft.destroyed, false);
  assert.deepEqual(events, []);
});

test('only a hard terrain crash explodes the aircraft and kills both engines', () => {
  const { fake, events } = impactHarness();

  MissionController.prototype.onImpact.call(fake, 7.7, 'terrain');

  assert.equal(fake.aircraft.destroyed, true);
  assert.ok(events.includes('explode'));
  assert.ok(events.includes('explosion-sound'));
  assert.deepEqual(
    events.filter((event) => Array.isArray(event) && event[0] === 'kill'),
    [['kill', 0, 'destroyed'], ['kill', 1, 'destroyed']],
  );
  assert.ok(events.some((event) => Array.isArray(event)
    && event[0] === 'fail' && /ground/i.test(event[1])));
  assert.equal(fake.physics.controls.throttleL, 0);
  assert.equal(fake.physics.controls.throttleR, 0);
  assert.ok(fake.physics.velocity.length() < 2, 'the wreck should shed nearly all of its velocity');
  assert.equal(fake.physics.omega.length(), 0);
});
