#!/usr/bin/env node
/**
 * Flight-model bench for the Brushrunner.
 *
 *   npm run check:flight
 *
 * The Beef Run's aeroplane is the one part of this project that cannot be
 * checked by looking at it. A takeoff roll that is fifty metres too long, an
 * aileron that rolls at 200 degrees a second, a stall that departs and never
 * comes back — all of it renders perfectly and all of it is wrong, and you
 * only find out by flying the mission for ten minutes.
 *
 * So the model is flown here instead, headless, by a crude autopilot: rotate,
 * climb, trim, turn, stall, recover, approach, land, stop. Each run prints its
 * numbers and is checked against the envelope the mission is designed around.
 * `src/beefrun/physics.js` and `engines.js` deliberately touch no DOM so this
 * can import them directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Node has no import map, and the mission modules import 'three' by name the
 * same as the browser does. Rather than rewrite the imports for the sake of a
 * test, point a throwaway node_modules entry at the vendored copy. It is in
 * .gitignore and costs one symlink. */
function ensureThreeShim() {
  const dir = path.join(ROOT, 'node_modules', 'three');
  const target = path.join(ROOT, 'vendor', 'three.module.min.js');
  if (!fs.existsSync(target)) {
    console.error('vendor/three.module.min.js is missing — nothing to test against.');
    process.exit(1);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'three', version: '0.0.0-local', type: 'module', exports: './index.js' }),
  );
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `export * from ${JSON.stringify(pathToFileURL(target).href)};\n`,
  );
}
ensureThreeShim();

/* The engines' cosmetic RPM wobble is phased off the wall clock, which let
 * this bench's centreline-drift number wander half a metre between runs —
 * right across the envelope's 25 m edge. The bench owns time: freezing the
 * clock makes every run the same flight. The phase is chosen so both engines
 * read the SAME wobble value (sin(x) = sin(x + 2.1) at x = (pi - 2.1)/2) —
 * a symmetric constant offset, so no artificial asymmetric thrust is pinned
 * on for the whole takeoff roll the way phase zero pinned it. */
performance.now = () => ((Math.PI - 2.1) / 2 / 7.3) * 1000;

const THREE = await import('three');
const { AircraftPhysics } = await import('../src/beefrun/physics.js');
const { EngineSystem } = await import('../src/beefrun/engines.js');
const { AC, KT } = await import('../src/beefrun/config.js');

const GH = 42;                    // flat test ground
const dt = 1 / 60;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

let failures = 0;
const results = [];
function expect(label, value, min, max, unit = '') {
  const ok = value >= min && value <= max;
  if (!ok) failures++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}: ${typeof value === 'number' ? value.toFixed(1) : value}${unit} (want ${min}–${max}${unit})`);
}

function rig(mass = null, assist = null) {
  const p = new AircraftPhysics({ getHeight: () => GH });
  const eng = new EngineSystem();
  eng.masterBattery = true;
  eng.fuelSelectors = true;
  eng.rightBalks = false;
  eng.crank(0);
  eng.crank(1);
  for (let i = 0; i < 240; i++) eng.update(dt, 0);
  p.engines = eng;
  if (mass) p.mass = mass;
  if (assist) Object.assign(p.assist, assist);
  return { p, eng };
}

function throttle(p, eng, v) {
  eng.setThrottles(v);
  p.controls.throttleL = p.controls.throttleR = v;
}

/**
 * Pitch holds the speed, power holds the flight path.
 *
 * The obvious arrangement — nose at the climb rate, throttle at the speed —
 * flies the aeroplane onto the back of the drag curve and keeps it there, and
 * an earlier version of this bench spent several runs reporting that the
 * Brushrunner could not maintain level flight because of it. It can. It just
 * cannot do it at 20 degrees of alpha.
 */
function autopilot(p, eng, { hdg = 180, speed = 55, climb = 0, thr = null }) {
  climb = clamp(climb, -6, 5);
  const hdgErr = ((hdg - p.headingDeg + 540) % 360) - 180;
  const wantRoll = clamp(hdgErr * 1.2, -22, 22);
  p.controls.roll = clamp((wantRoll - p.rollDeg) * 0.06 - p.omega.z * 0.4, -1, 1);
  // Rudder toward the velocity vector to kill the slip, not away from it.
  p.controls.yaw = clamp(clamp(hdgErr * 0.02, -0.3, 0.3) + p.beta * 4 - p.omega.y * 1.5, -1, 1);
  p.controls.pitch = clamp((p.tas - speed) * 0.07 + (climb - p.vspeed) * 0.02 - p.omega.x * 0.8, -1, 1);
  const power = thr === null
    ? clamp(0.5 + (climb - p.vspeed) * 0.09 + (speed - p.tas) * 0.03, 0.05, 1)
    : thr;
  throttle(p, eng, power);
  eng.update(dt, p.tas);
  p.advance(dt);
}

/** Wheels-off test: airborne, and clear of the compressed gear. */
const airborne = (p) => !p.onGround && p.agl > AC.gearY + 0.6;

console.log('Brushrunner flight model\n');

/* ---------------------------------------------------------------- */
/* 1. Takeoff, empty                                                 */
/* ---------------------------------------------------------------- */
{
  const { p, eng } = rig();
  p.setPose(new THREE.Vector3(0, GH + AC.gearY, 400), 180, 0);
  p.controls.parkingBrake = false;
  let rotated = false, roll = null, t = 0, maxDrift = 0, to300 = null;
  for (let i = 0; i < 60 * 60; i++) {
    t += dt;
    throttle(p, eng, 1);
    if (p.ias * KT > 60) rotated = true;
    p.controls.pitch = !rotated ? 0
      : p.agl > 50 ? clamp((p.tas - 42) * 0.09 - p.omega.x * 0.6, -0.5, 0.55)
        : clamp((9 - p.pitchDeg) * 0.12 - p.omega.x * 0.5, -0.5, 1);
    p.controls.roll = clamp(-p.rollDeg * 0.05, -1, 1);
    const hdgErr = ((180 - p.headingDeg + 540) % 360) - 180;
    p.controls.yaw = clamp(hdgErr * 0.12 - p.omega.y * 1.2, -1, 1);
    eng.update(dt, p.tas);
    p.advance(dt);
    if (p.onGround) maxDrift = Math.max(maxDrift, Math.abs(p.position.x));
    if (roll === null && airborne(p)) roll = 400 - p.position.z;
    if (to300 === null && p.agl > 300) { to300 = t; break; }
  }
  console.log('Takeoff, empty:');
  expect('ground roll', roll ?? 9999, 120, 400, ' m');
  expect('centreline drift on the roll', maxDrift, 0, 25, ' m');
  expect('time to 300 m', to300 ?? 999, 15, 70, ' s');
  expect('climb speed', p.ias * KT, 65, 105, ' kt');
  console.log(results.splice(0).join('\n'));
}

/* ---------------------------------------------------------------- */
/* 2. Takeoff, loaded — the heavy departure out of El Hueso          */
/* ---------------------------------------------------------------- */
{
  const { p, eng } = rig(AC.emptyMass + AC.fuelMass * 0.7 + AC.maxCargo);
  p.setPose(new THREE.Vector3(0, GH + AC.gearY, 400), 180, 0);
  p.controls.parkingBrake = false;
  p.controls.flaps = 0.5;
  let rotated = false, roll = null;
  for (let i = 0; i < 60 * 70; i++) {
    throttle(p, eng, 1);
    if (p.ias * KT > 68) rotated = true;
    // Once the wheels are off, hold the best-climb speed rather than an
    // attitude — heavy, a fixed attitude just mushes.
    p.controls.pitch = !rotated ? 0
      : airborne(p) ? clamp((p.tas - 46) * 0.10 - p.omega.x * 0.6, -0.5, 1)
        : clamp((8 - p.pitchDeg) * 0.12 - p.omega.x * 0.5, -0.5, 1);
    p.controls.roll = clamp(-p.rollDeg * 0.05, -1, 1);
    const hdgErr = ((180 - p.headingDeg + 540) % 360) - 180;
    p.controls.yaw = clamp(hdgErr * 0.12 - p.omega.y * 1.2, -1, 1);
    eng.update(dt, p.tas);
    p.advance(dt);
    if (roll === null && airborne(p)) roll = 400 - p.position.z;
    if (p.agl > 150) break;
  }
  console.log('\nTakeoff, full cargo:');
  expect('ground roll', roll ?? 9999, 180, 700, ' m');
  expect('longer than empty', (roll ?? 0) > 160 ? 1 : 0, 1, 1);
  expect('initial climb rate', p.vspeed, 1.2, 8, ' m/s');
  console.log(results.splice(0).join('\n'));
}

/* ---------------------------------------------------------------- */
/* 3. Cruise and turn                                                */
/* ---------------------------------------------------------------- */
{
  const { p, eng } = rig();
  p.setPose(new THREE.Vector3(0, 900, 0), 180, 58);
  for (let i = 0; i < 60 * 45; i++) autopilot(p, eng, { hdg: 180, speed: 58, climb: clamp((900 - p.position.y) * 0.05, -3, 3) });
  console.log('\nCruise:');
  expect('trimmed speed', p.ias * KT, 90, 135, ' kt');
  expect('altitude held', Math.abs(p.position.y - 900), 0, 60, ' m');
  const alt0 = p.position.y;
  let t = 0;
  for (let i = 0; i < 60 * 60; i++) {
    autopilot(p, eng, { hdg: 270, speed: 58, climb: clamp((alt0 - p.position.y) * 0.05, -3, 3) });
    t += dt;
    if (Math.abs(((270 - p.headingDeg + 540) % 360) - 180) < 3) break;
  }
  expect('90-degree turn', t, 6, 30, ' s');
  expect('altitude lost in the turn', Math.abs(p.position.y - alt0), 0, 90, ' m');
  console.log(results.splice(0).join('\n'));
}

/* ---------------------------------------------------------------- */
/* 4. Control authority                                              */
/* ---------------------------------------------------------------- */
{
  // Airframe authority, so the coordination assist is out of the way.
  const { p, eng } = rig(null, { autoRudder: 0, stability: 0 });
  /* Peak rate over the first second. The settled value is not a measure of
   * authority: hold full elevator long enough and the aeroplane simply finds
   * its trimmed alpha and flies a curve at nearly zero pitch rate. */
  const steady = (axis, input) => {
    p.setPose(new THREE.Vector3(0, 900, 0), 180, 55);
    p.controls.pitch = p.controls.roll = p.controls.yaw = 0;
    const peak = { roll: 0, pitch: 0, yaw: 0 };
    for (let i = 0; i < 90; i++) {
      // Ramped in over a third of a second, the way the yoke actually moves in
      // the game. Slamming the input to the stop measures the integrator.
      p.controls[axis] = input * Math.min(1, i / 20);
      throttle(p, eng, 0.7);
      eng.update(dt, p.tas);
      p.advance(dt);
      peak.roll = Math.max(peak.roll, Math.abs(p.omega.z) * 57.3);
      peak.pitch = Math.max(peak.pitch, Math.abs(p.omega.x) * 57.3);
      peak.yaw = Math.max(peak.yaw, Math.abs(p.omega.y) * 57.3);
    }
    return peak;
  };
  console.log('\nControl authority at 55 m/s:');
  expect('roll rate, full aileron', steady('roll', 1).roll, 25, 90, ' deg/s');
  expect('pitch rate, full elevator', steady('pitch', 1).pitch, 8, 40, ' deg/s');
  expect('yaw rate, full rudder', steady('yaw', 1).yaw, 6, 35, ' deg/s');
  console.log(results.splice(0).join('\n'));
}

/* ---------------------------------------------------------------- */
/* 5. Stall and recovery                                             */
/* ---------------------------------------------------------------- */
{
  const { p, eng } = rig();
  p.setPose(new THREE.Vector3(0, 1400, 0), 180, 55);
  throttle(p, eng, 0);
  /* A level deceleration to the break, not a zoom. Hauling the nose up from
   * cruise and waiting measures how long the aeroplane takes to run out of
   * energy; holding the altitude while the speed bleeds off measures the thing
   * that matters on final approach. */
  let stallSpeed = null, maxRoll = 0, stalledFor = 0;
  for (let i = 0; i < 60 * 60; i++) {
    p.controls.pitch = stallSpeed === null
      ? clamp((1400 - p.position.y) * 0.02 - p.vspeed * 0.2 - p.omega.x * 0.7, -0.4, 1)
      : 1;
    p.controls.roll = stallSpeed === null ? clamp(-p.rollDeg * 0.05, -1, 1) : 0;
    throttle(p, eng, 0);
    eng.update(dt, p.tas);
    p.advance(dt);
    if (!stallSpeed && p.stallT > 0.5) stallSpeed = p.ias * KT;
    if (p.stallT > 0.3) { stalledFor += dt; maxRoll = Math.max(maxRoll, Math.abs(p.rollDeg)); }
    if (stalledFor > 4) break;      // four seconds of it is plenty
  }
  console.log('\nStall:');
  expect('break speed', stallSpeed ?? 0, 45, 75, ' kt');
  expect('wing drop while stalled', maxRoll, 3, 90, ' deg');
  expect('time spent stalled before recovery', stalledFor, 1, 10, ' s');
  let rec = 0;
  for (let i = 0; i < 60 * 25; i++) {
    p.controls.pitch = -0.3;
    p.controls.roll = clamp(-p.rollDeg * 0.05, -1, 1);
    p.controls.yaw = clamp(p.beta * 4, -1, 1);
    throttle(p, eng, 1);
    eng.update(dt, p.tas);
    p.advance(dt);
    rec += dt;
    if (p.stallT < 0.05 && p.ias * KT > 75) break;
  }
  expect('recovery time', rec, 0.5, 15, ' s');
  expect('recovered above ground', p.position.y, 900, 1500, ' m');
  console.log(results.splice(0).join('\n'));
}

/* ---------------------------------------------------------------- */
/* 6. Approach, touchdown and stop                                   */
/* ---------------------------------------------------------------- */
{
  const { p, eng } = rig(AC.emptyMass + 200 + AC.maxCargo);
  p.setPose(new THREE.Vector3(0, GH + 130, 1800), 180, 44);
  p.controls.flaps = 1;
  p.controls.parkingBrake = false;
  let touched = null;
  for (let i = 0; i < 60 * 180; i++) {
    const agl = p.position.y - GH;
    const targetAgl = Math.max(0, (p.position.z - 400) * 0.075);
    // Below the flare height, stop descending and let it settle on.
    const wantVs = agl < 7
      ? clamp(-0.5 - agl * 0.05, -1.2, 0)
      : clamp((targetAgl - agl) * 0.25, -4.5, 3);
    autopilot(p, eng, {
      hdg: 180, speed: agl < 7 ? 36 : 40, climb: wantVs,
      thr: agl < 3 ? 0.08 : null,
    });
    if (p.onGround) { touched = { z: p.position.z, vs: -p.vspeed, spd: p.ias * KT }; break; }
  }
  console.log('\nApproach and landing:');
  if (!touched) {
    failures++;
    console.log('  FAIL  never touched down');
  } else {
    expect('touchdown speed', touched.spd, 45, 80, ' kt');
    expect('touchdown sink rate', touched.vs, 0, 3.5, ' m/s');
    expect('gear damage from a normal landing', p.damage.gear, 0, 0.01);
    const z0 = p.position.z;
    p.controls.brake = 1;
    throttle(p, eng, 0);
    for (let i = 0; i < 60 * 60 && p.groundSpeed > 1.5; i++) { eng.update(dt, p.tas); p.advance(dt); }
    expect('braking distance', z0 - p.position.z, 60, 460, ' m');
    console.log(results.splice(0).join('\n'));
  }
}

/* ---------------------------------------------------------------- */
/* 7. Hard landing must break something                              */
/* ---------------------------------------------------------------- */
{
  const { p } = rig();
  p.setPose(new THREE.Vector3(0, GH + 12, 0), 180, 40);
  p.velocity.y = -8;
  p.controls.parkingBrake = false;
  for (let i = 0; i < 60 * 6; i++) p.advance(dt);
  console.log('\nArrival at 8 m/s:');
  expect('gear damaged', p.damage.gear, 0.3, 1);
  expect('tyre burst', p.damage.tireBurst ? 1 : 0, 1, 1);
  console.log(results.splice(0).join('\n'));
}

/* ---------------------------------------------------------------- */
/* 8. Single-engine handling                                         */
/* ---------------------------------------------------------------- */
{
  const { p, eng } = rig();
  p.setPose(new THREE.Vector3(0, 900, 0), 180, 58);
  for (let i = 0; i < 60 * 10; i++) autopilot(p, eng, { hdg: 180, speed: 58, thr: 0.8 });
  eng.kill(0, 'destroyed');
  let held = true;
  for (let i = 0; i < 60 * 40; i++) {
    autopilot(p, eng, { hdg: 180, speed: 55, climb: -0.5, thr: 1 });
    eng.setThrottle(0, 0);
    if (i < 60) continue;   // allow the initial swing before judging it
    if (Math.abs(((180 - p.headingDeg + 540) % 360) - 180) > 45) held = false;
  }
  console.log('\nOne engine out:');
  expect('heading holdable with rudder', held ? 1 : 0, 1, 1);
  expect('descent rate', -p.vspeed, -3, 6, ' m/s');
  console.log(results.splice(0).join('\n'));
}

/* ---------------------------------------------------------------- */
/* 9. Flying it into a hill must end the flight                       */
/* ---------------------------------------------------------------- */
{
  // A wall of ground rising 200 m over 100 m, straight ahead.
  const hill = (x, z) => (z < -400 ? GH + Math.min(200, (-400 - z) * 2) : GH);
  const p = new AircraftPhysics({ getHeight: hill });
  const eng = new EngineSystem();
  eng.masterBattery = true; eng.fuelSelectors = true; eng.rightBalks = false;
  eng.crank(0); eng.crank(1);
  for (let i = 0; i < 240; i++) eng.update(dt, 0);
  p.engines = eng;
  let worst = 0;
  p.onImpact = (sev) => { worst = Math.max(worst, sev); };
  p.setPose(new THREE.Vector3(0, GH + 40, 0), 180, 55);
  let hitAt = -1;
  for (let i = 0; i < 60 * 30; i++) {
    autopilot(p, eng, { hdg: 180, speed: 55, climb: 0 });
    if (worst > 0 && hitAt < 0) hitAt = i;
    // Keep going for a second and a half after the first contact: the point is
    // that it stops, not that it registers and carries on.
    if (hitAt >= 0 && i - hitAt > 90) break;
  }
  console.log('\nFlown into a hillside at 55 m/s:');
  expect('impact reported', worst, 6.5, 40);
  expect('speed gone a second and a half later', p.groundSpeed, 0, 22, ' m/s');

  // And the opposite case: stopped on a slope with the nose over rising
  // ground is not a crash, which is exactly where an El Hueso arrival parks.
  const slope = (x, z) => GH + Math.max(0, (-z) * 0.09);
  const q = new AircraftPhysics({ getHeight: slope });
  let reported = 0;
  q.onImpact = () => { reported++; };
  q.setPose(new THREE.Vector3(0, slope(0, -100) + AC.gearY, -100), 180, 0);
  for (let i = 0; i < 60 * 5; i++) q.advance(dt);
  expect('no impact from parking on a slope', reported, 0, 0);
  console.log(results.splice(0).join('\n'));
}

console.log(failures ? `\n${failures} out of envelope.` : '\nThe aeroplane flies.');
process.exit(failures ? 1 : 0);
