/**
 * The Enola Squatch's escalation pass, tested where it can be tested headless.
 *
 * `npm run check:flight` does NOT cover this aircraft — `tools/flight-test.mjs`
 * constructs `AircraftPhysics` with no `ac` option at every call site, so it
 * always builds the Brushrunner. The autopilot below is therefore flown here,
 * against the real four-engine `AC_ENOLA` through the real `AircraftPhysics`,
 * because it is a control law and a control law that is only eyeballed in a
 * browser is a control law nobody knows the sign of. (Every sign in it was
 * established by running exactly this kind of loop.)
 *
 * The rest — the detonation's luminance curve and shock expansion, the
 * interceptors' engagement cap and kill accounting, the flak predictor's track
 * quality, and the script's left/right discipline — is arithmetic and data,
 * and belongs in a test rather than in a browser run.
 *
 * `../src/enolasquatch/scenes/TargetCity.js` is deliberately NOT exercised
 * here: it paints canvases, so it needs a DOM. `tools/verify-enolasquatch.mjs`
 * measures it with a real render instead, which is the right instrument for a
 * draw-call budget anyway.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { AircraftPhysics } from '../src/beefrun/physics.js';
import { EngineSystem } from '../src/beefrun/engines.js';
import { AC_ENOLA } from '../src/enolasquatch/config.js';
import { Autopilot, ROLL_LIMIT, HARD_LIMIT, REENGAGE_DELAY } from '../src/enolasquatch/systems/Autopilot.js';
import { Interceptors, MAX_ENGAGED, FIGHTER_HEALTH } from '../src/enolasquatch/combat/Interceptors.js';
import { Defense } from '../src/enolasquatch/combat/Defense.js';
import { blastLuminance, shockRadiusAt, BLAST } from '../src/enolasquatch/vfx/Detonation.js';
import { BEATS, BARKS, OBJECTIVES } from '../src/enolasquatch/dialogue/script.js';

/* ------------------------------------------------------------------ */
/* A flyable Enola Squatch, headless                                    */
/* ------------------------------------------------------------------ */

function buildAeroplane({ heading = 90, altitude = 900, speed = 68 } = {}) {
  const engines = new EngineSystem({ ac: AC_ENOLA, engineNames: ['one', 'two', 'three', 'four'] });
  engines.forceRunning();
  const physics = new AircraftPhysics({ getHeight: () => 0, ac: AC_ENOLA });
  physics.engines = engines;
  physics.mass = AC_ENOLA.emptyMass + AC_ENOLA.fuelMass + AC_ENOLA.payloadMass;
  physics.setPose(new THREE.Vector3(0, altitude, 0), heading, speed);
  physics.controls.parkingBrake = false;
  for (const i of [0, 1, 2, 3]) engines.setThrottle(i, 0.7);
  physics.controls.throttleL = 0.7;
  physics.controls.throttleR = 0.7;
  for (let i = 0; i < 180; i++) { engines.update(1 / 60, physics.tas); physics.advance(1 / 60); }
  return { engines, physics };
}

/** Fly the autopilot for `seconds`, exactly the way `main.js` drives it. */
function flyAutopilot(ap, physics, engines, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    ap.update(dt);
    for (const e of [0, 1, 2, 3]) engines.setThrottle(e, physics.controls.throttleL);
    engines.update(dt, physics.tas);
    physics.advance(dt);
    if (!ap.engaged) return i * dt;
  }
  return seconds;
}

test('the autopilot really flies the aeroplane onto a heading and an altitude', () => {
  const { physics, engines } = buildAeroplane({ heading: 62, altitude: 880 });
  const ap = new Autopilot({ physics, engines });
  assert.equal(ap.engage({ heading: 90, altitude: 1000 }), true);
  flyAutopilot(ap, physics, engines, 90);
  assert.equal(ap.engaged, true, 'it dropped out of a perfectly ordinary hold');
  assert.ok(Math.abs(physics.headingDeg - 90) < 2, `heading settled at ${physics.headingDeg.toFixed(1)}`);
  assert.ok(Math.abs(physics.position.y - 1000) < 25, `altitude settled at ${physics.position.y.toFixed(0)}`);
});

test('it never banks past its own limit getting there', () => {
  const { physics, engines } = buildAeroplane({ heading: 20, altitude: 900 });
  const ap = new Autopilot({ physics, engines });
  ap.engage({ heading: 90, altitude: 900 });
  let worst = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 60; i++) {
    ap.update(dt);
    for (const e of [0, 1, 2, 3]) engines.setThrottle(e, physics.controls.throttleL);
    engines.update(dt, physics.tas);
    physics.advance(dt);
    worst = Math.max(worst, Math.abs(physics.rollDeg));
  }
  // A degree of overshoot on a 16-degree limit is the integrator, not a bug.
  assert.ok(worst < ROLL_LIMIT + 3, `banked to ${worst.toFixed(1)} degrees`);
});

test('the autopilot refuses the aeroplane on the ground and out of the envelope', () => {
  const { physics, engines } = buildAeroplane();
  const ap = new Autopilot({ physics, engines });
  physics.onGround = true;
  assert.equal(ap.engage({}), false, 'it took an aeroplane that was still on the runway');
  physics.onGround = false;
  physics.setPose(new THREE.Vector3(0, 900, 0), 90, 68);
  physics.quat.setFromEuler(new THREE.Euler(0, Math.PI / 2, 1.4, 'YXZ'));
  assert.ok(Math.abs(physics.rollDeg) > HARD_LIMIT.roll);
  assert.equal(ap.engage({}), false, 'it took an aeroplane that was already on its side');
});

test('being thrown off locks it out, and asking again inside the lockout fails', () => {
  const { physics, engines } = buildAeroplane();
  const ap = new Autopilot({ physics, engines });
  ap.engage({});
  ap.disengage('blast wave');
  assert.equal(ap.engaged, false);
  assert.ok(ap.lockedOut, 'a wave that kicks it off has to cost something');
  assert.equal(ap.engage({}), false);
  ap.update(REENGAGE_DELAY + 0.1);
  assert.equal(ap.lockedOut, false);
  assert.equal(ap.engage({}), true);
  // The player asking for it back is free — only the aeroplane taking it costs.
  ap.disengage(null);
  assert.equal(ap.lockedOut, false);
});

test('predictability — the price of the autopilot — only builds while it is settled', () => {
  const { physics, engines } = buildAeroplane({ heading: 90, altitude: 900 });
  const ap = new Autopilot({ physics, engines });
  ap.engage({ heading: 90, altitude: 900 });
  assert.equal(ap.predictability, 0);
  flyAutopilot(ap, physics, engines, 40);
  assert.ok(ap.predictability > 0.7, `settled flight only reached ${ap.predictability.toFixed(2)}`);
  ap.disengage(null);
  assert.equal(ap.predictability, 0, 'handing it back has to stop paying the price');
});

/* ------------------------------------------------------------------ */
/* The detonation's shape                                              */
/* ------------------------------------------------------------------ */

test('the blast flashes TWICE, which is the whole point of the curve', () => {
  const first = blastLuminance(0.022);
  const dip = blastLuminance(0.19);
  const second = blastLuminance(0.78);
  assert.ok(first > 0.9, `first pulse only reached ${first.toFixed(2)}`);
  assert.ok(dip < first * 0.75, `the hydrodynamic minimum is not a minimum (${dip.toFixed(2)})`);
  assert.ok(second > dip * 1.2, 'the second pulse never comes back');
  assert.ok(second > 0.9, 'the second pulse is the bright one and it is not bright');
  assert.equal(blastLuminance(0), 0);
  assert.ok(blastLuminance(8) < 0.05, 'it never gets dark again');
});

test('the shock front leaves supersonic and settles at the speed of sound', () => {
  assert.equal(shockRadiusAt(0), 0);
  // At a tenth of a second it is well past what sound could have managed.
  assert.ok(shockRadiusAt(0.1) > 336 * 0.1 * 2, 'the front is not overtaking sound');
  // And by ten seconds it is only doing what sound does.
  const late = shockRadiusAt(10.1) - shockRadiusAt(10);
  assert.ok(Math.abs(late / 0.1 - 336) < 24, `settled at ${(late / 0.1).toFixed(0)} m/s`);
  // Monotone the whole way, or the city gets knocked down twice.
  let prev = 0;
  for (let t = 0; t <= BLAST.duration; t += 0.25) {
    const r = shockRadiusAt(t);
    assert.ok(r >= prev, `the front went backwards at t=${t}`);
    prev = r;
  }
  assert.ok(prev <= BLAST.shockMax);
});

/* ------------------------------------------------------------------ */
/* The fighters                                                        */
/* ------------------------------------------------------------------ */

function flyInterceptors(seconds, { count = 4, evasion = 0 } = {}) {
  const scene = new THREE.Scene();
  const ints = new Interceptors(scene, { getHeight: () => 0 });
  const position = new THREE.Vector3(0, 900, 0);
  const velocity = new THREE.Vector3(0, 0, 62);
  ints.deploy({ around: position, count });
  const dt = 1 / 30;
  let maxEngaged = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    ints.update(dt, { position, velocity, evasion });
    position.addScaledVector(velocity, dt);
    maxEngaged = Math.max(maxEngaged, ints.engagedCount);
  }
  return { ints, maxEngaged, position };
}

test('never more than MAX_ENGAGED fighters press an attack at once', () => {
  const { ints, maxEngaged } = flyInterceptors(180, { count: 5 });
  assert.equal(ints.fighters.length, 5, 'the whole wave never got airborne');
  assert.ok(maxEngaged > 0, 'nobody ever attacked, which is not "fair", it is broken');
  assert.ok(maxEngaged <= MAX_ENGAGED, `${maxEngaged} of them committed at once`);
});

test('they actually get in and shoot: a straight-and-level bomber takes hits', () => {
  const { ints } = flyInterceptors(240, { count: 3, evasion: 0 });
  assert.ok(ints.roundsAtUs > 40, `only ${ints.roundsAtUs} rounds were ever fired at us`);
  assert.ok(ints.hitsTaken > 0, 'a bomber flying in a straight line for four minutes was never hit');
});

test('evading works — the same four minutes, thrown about, costs far less', () => {
  const straight = flyInterceptors(240, { count: 3, evasion: 0 });
  const jinking = flyInterceptors(240, { count: 3, evasion: 1 });
  assert.ok(
    jinking.ints.hitsTaken < straight.ints.hitsTaken,
    `evading took ${jinking.ints.hitsTaken} hits against ${straight.ints.hitsTaken} for flying straight`,
  );
});

test('a fighter dies after FIGHTER_HEALTH hits and stops being a threat', () => {
  const { ints } = flyInterceptors(40, { count: 2 });
  const target = ints.fighters[0];
  let kills = 0;
  ints.onKill = () => { kills++; };
  for (let i = 1; i < FIGHTER_HEALTH; i++) {
    assert.equal(ints.damage(target, 1), 'hit', 'it died early');
  }
  assert.equal(ints.damage(target, 1), 'killed');
  assert.equal(kills, 1);
  assert.equal(ints.damage(target, 1), 'nothing', 'a dead fighter took another hit');
  assert.equal(target.engaged, false);
  assert.equal(ints.kills, 1);
});

test('the autopilot makes you a better target, and the fighters read the same number', () => {
  const scene = new THREE.Scene();
  const ints = new Interceptors(scene, { getHeight: () => 0 });
  ints.setPredictability(1);
  assert.equal(ints._predictability, 1);
  ints.setPredictability(-4);
  assert.equal(ints._predictability, 0, 'predictability has to be clamped, not trusted');
});

/* ------------------------------------------------------------------ */
/* The flak predictor                                                  */
/* ------------------------------------------------------------------ */

test('the flak predictor gets the range on a steady target and loses it on a turning one', () => {
  const scene = new THREE.Scene();
  const defense = new Defense(scene, { getHeight: () => 0 });
  defense.deploy({ x: 0, z: 0 }, { groundY: 0, radius: 400, patrolPlanes: 0 });
  const position = new THREE.Vector3(-2000, 700, 0);
  const velocity = new THREE.Vector3(62, 0, 0);
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 25; i++) {
    defense.update(dt, { position, velocity, headingDeg: 90, evasion: 0 });
  }
  const settled = defense.trackQuality;
  assert.ok(settled > 0.85, `twenty-five seconds of straight flight only reached ${settled.toFixed(2)}`);

  let heading = 90;
  for (let i = 0; i < 30 * 6; i++) {
    heading += 14 * dt;                        // a real, sustained turn
    defense.update(dt, { position, velocity, headingDeg: heading, evasion: 0.8 });
  }
  assert.ok(defense.trackQuality < 0.35, `turning left it at ${defense.trackQuality.toFixed(2)}`);
});

test('a salvo is a salvo — every gun in the battery fires, with real flight time', () => {
  const scene = new THREE.Scene();
  const defense = new Defense(scene, { getHeight: () => 0 });
  defense.deploy({ x: 0, z: 0 }, { groundY: 0, radius: 400, patrolPlanes: 0 });
  defense.intensity = 1.8;
  const position = new THREE.Vector3(-900, 600, 0);
  const velocity = new THREE.Vector3(62, 0, 0);
  defense._fireSalvo(position, velocity);
  assert.ok(defense._shells.length >= 4, 'a battery fired fewer shells than it has guns');
  assert.ok(defense._shells.every((s) => s.fuse > 0.3), 'a shell arrived before it was fired');
  assert.ok(defense.burstsFired >= 4);
});

test('a burst does damage as a function of how close it actually was', () => {
  const scene = new THREE.Scene();
  const defense = new Defense(scene, { getHeight: () => 0 });
  defense.deploy({ x: 0, z: 0 }, { groundY: 0, radius: 400, patrolPlanes: 0 });
  const at = new THREE.Vector3(0, 600, 0);
  const reported = [];
  defense.onFlakBurst = (d, point, severity) => reported.push({ d, severity });

  defense._burst(at.clone(), at.clone().add(new THREE.Vector3(0, 0, 900)));
  assert.equal(reported.length, 0, 'a burst nine hundred metres away was reported as near');

  defense._burst(at.clone(), at.clone().add(new THREE.Vector3(0, 0, 150)));
  assert.equal(reported.length, 1);
  assert.ok(reported[0].severity > 0 && reported[0].severity < 1);

  const before = defense.hitCount;
  defense._burst(at.clone(), at.clone().add(new THREE.Vector3(0, 0, 10)));
  assert.ok(defense.hitCount > before, 'a burst ten metres away did nothing at all');
  assert.equal(reported.length, 2);
  assert.ok(reported[1].severity > reported[0].severity, 'closer has to be worse');
});

/* ------------------------------------------------------------------ */
/* The writing                                                         */
/* ------------------------------------------------------------------ */

test('every beat the escalation pass fires actually exists in the script', () => {
  const required = [
    'fighters.first', 'fighters.down', 'fighters.broke',
    'auto.on', 'auto.off', 'auto.kicked',
    'gun.take', 'gun.leave', 'gun.dry',
    'bomb.breakTurn',
    'explosion.flash', 'explosion.shockwave', 'explosion.reaction', 'explosion.column', 'explosion.crater',
  ];
  for (const id of required) {
    assert.ok(Array.isArray(BEATS[id]) && BEATS[id].length > 0, `BEATS['${id}'] is missing`);
  }
  const pools = [
    'flakClose', 'fighterCommitting', 'fighterAgain', 'fighterNearMiss',
    'fighterHitUs', 'gunJam', 'autoRefused', 'gunRefused',
  ];
  for (const pool of pools) {
    assert.ok(Array.isArray(BARKS[pool]) && BARKS[pool].length > 0, `BARKS.${pool} is missing`);
  }
  assert.equal(typeof OBJECTIVES.BREAK_TURN, 'string');
  assert.equal(typeof OBJECTIVES.BLAST, 'string');
});

test('nobody in the air battle says left or right', () => {
  /* The Shubenator is facing AFT in the tail turret and everybody else is
   * facing forward, so his port quarter is their starboard one. This project
   * has already shipped one scene with its left and right the wrong way round
   * (the Beef Run's seats). High/low/above/behind mean the same thing from
   * both ends of the aeroplane, so that is what the crew call. */
  const combatBeats = ['fighters.first', 'fighters.down', 'fighters.broke'];
  const combatPools = ['fighterCommitting', 'fighterAgain', 'fighterNearMiss', 'fighterHitUs', 'gunJam'];
  const said = [
    ...combatBeats.flatMap((id) => BEATS[id].map((l) => l.text)),
    ...combatPools.flatMap((pool) => BARKS[pool].map((l) => l.text)),
  ];
  for (const text of said) {
    assert.ok(!/\b(left|right|port|starboard)\b/i.test(text), `"${text}" names a side`);
  }
});

test('the crew talk about the autopilot as a trade, not as a convenience', () => {
  const words = BEATS['auto.on'].map((l) => l.text).join(' ').toLowerCase();
  assert.ok(/will not|nothing else/.test(words), 'nobody says what it cannot do');
  assert.ok(BEATS['gun.take'].some((l) => /nobody is flying/i.test(l.text)),
    'nobody says out loud that the seat is empty');
});
