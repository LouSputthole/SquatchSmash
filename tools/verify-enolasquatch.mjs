#!/usr/bin/env node
/**
 * Verify The Enola Squatch end to end in a real browser: boot, preflight,
 * taxi, takeoff (real thrust from all four engines), climb-out and turn, the
 * cruise nav-correction barks, the detection corridor, the compound's
 * defensive fire (damage API), the bombing approach, the bomb-bay
 * malfunction, a real 1-5 release-line choice (payload detaches, mass
 * drops), the explosion, escape, the engine emergency, return, landing
 * (grading), and the epilogue/report card. Asserts no console/page errors
 * across the whole run.
 *
 * Drives the mission through `window.__enolaSquatch` (see
 * `src/enolasquatch/main.js`) rather than simulating raw key/mouse input for
 * every leg: some inter-phase transitions are exercised organically (real
 * physics integration, real phase-exit conditions), others are jumped via
 * `.go(phase)` where holding a precise flight attitude for real would make
 * this script fragile rather than meaningfully more thorough — each shortcut
 * is called out in a comment at the point it is taken.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5225;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Enola Squatch.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });

  await page.goto(`http://localhost:${PORT}/enolasquatch.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.enolaSquatch === true, null, { timeout: 30000 });
  check('the page boots and signals the watchdog', true);

  /* ---- Start button really boots the mission (not just go()) ---- */
  const booted = await page.evaluate(() => {
    document.getElementById('start-btn').click();
    return {
      overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
      hudUp: !document.getElementById('br-hud').classList.contains('hidden'),
      phase: window.__enolaSquatch.mission.phase,
    };
  });
  check('the Start button hides the title card, shows the flight HUD, and begins preflight',
    booted.overlayHidden && booted.hudUp && booted.phase === 'preflight',
    JSON.stringify(booted));

  /* ---- Preflight: checklist reflects real state, all four engines start ---- */
  const preflightBefore = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const rows = document.querySelectorAll('#br-checklist li');
    return {
      checklistUp: !document.getElementById('br-checklist').classList.contains('hidden'),
      rowCount: rows.length,
      running: h.engines.engines.map((e) => e.running),
    };
  });
  check('the preflight checklist is up with five rows before anything is armed',
    preflightBefore.checklistUp && preflightBefore.rowCount === 5
      && preflightBefore.running.every((r) => r === false),
    JSON.stringify(preflightBefore));

  const engineStart = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.engines.masterBattery = true;
    h.engines.fuelSelectors = true;
    h.input.throttle = 0.15;
    h.engines.crank(2);        // "three and four are yours, Prospect"
    h.engines.crank(3);
    // Hold off releasing the parking brake until the restraints (5.0s) and
    // bomb-bay-panel (9.5s) banter have both had time to play — Mission-
    // Controller's own preflight banter is gated on phaseTime, not on
    // completion, so a player (or a test) that clears the gate before then
    // simply never hears them; waiting here exercises the real beats.
    h.tick(11);
    h.input.parkingBrake = false;
    h.tick(1);
    return {
      running: h.engines.engines.map((e) => e.running),
      restraints: h.dialogue.seen('preflight.restraints'),
      bombBay: h.dialogue.seen('preflight.bombbay'),
      phase: h.mission.phase,
    };
  });
  check('all four engines start, the restraints/bomb-bay banter plays, and preflight clears to taxi',
    engineStart.running.every(Boolean) && engineStart.restraints && engineStart.bombBay
      && engineStart.phase === 'taxi',
    JSON.stringify(engineStart));

  /* ---- Takeoff: real thrust from all four engines (the config.js design
   * note flags that only engines 0/1 fed physics unless engineNames encode
   * left/right — this proves both banks actually push). ---- */
  const takeoff = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('takeoff');
    const phaseAtStart = h.mission.phase;
    h.input.key('KeyW', true);
    h.input.throttle = 1;
    h.tick(8);
    h.input.key('KeyW', false);
    return {
      phaseAtStart,
      thrustL: h.physics.thrustL,
      thrustR: h.physics.thrustR,
      ias: h.physics.ias,
      groundSpeed: h.physics.groundSpeed,
    };
  });
  check('go("takeoff") stages the runway, and all four engines produce real thrust under full power',
    takeoff.phaseAtStart === 'takeoff' && takeoff.thrustL > 1000 && takeoff.thrustR > 1000
      && (takeoff.ias > 5 || takeoff.groundSpeed > 5),
    JSON.stringify(takeoff));

  /* Shortcut: an unassisted headless takeoff roll/rotation is a flight-model
   * timing question (already covered by `npm run check:flight`'s tuning
   * tests), not a wiring one — jump the remaining roll/rotate/liftoff. */
  const climbTurnEntry = await page.evaluate(() => window.__enolaSquatch.go('climbTurn'));
  check('go("climbTurn") reaches the climb-out phase', climbTurnEntry === 'climbTurn');

  /* ---- Climb/turn: the real past-the-turn-point + heading-hold logic. ---- */
  const turnBeat = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(6); // physically crosses TURN_POINT.z heading south, per go('climbTurn')'s pose
    return { turnCalled: h.mission.flags.turnCalled, sawTurnLine: h.dialogue.seen('climb.turn.east') };
  });
  check('crossing the real turn point fires the turn-onto-090 beat',
    turnBeat.turnCalled && turnBeat.sawTurnLine, JSON.stringify(turnBeat));

  const cruiseEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    // Heading-hold-for-2.5s is exercised for real; only the turn maneuver
    // itself is short-circuited by setting the heading directly.
    h.physics.setPose(h.physics.position.clone(), 90, Math.max(h.physics.velocity.length(), 60));
    h.tick(4);
    return h.mission.phase;
  });
  check('holding 090 for real transitions climbTurn into cruise', cruiseEntry === 'cruise', cruiseEntry);

  /* ---- Cruise: a real nav-correction bark when off-heading. ---- */
  const navBark = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.physics.setPose(h.physics.position.clone(), 90 + 40, h.physics.velocity.length());
    h.tick(10); // clears cruise.settle's own queue and the 4s nav-call cooldown
    return {
      navOffCourse: h.mission.flags.navOffCourse,
      sawCorrection: h.dialogue.seen('nav.left5') || h.dialogue.seen('nav.right5') || h.dialogue.seen('nav.wrongWay'),
    };
  });
  check('flying 40 degrees off the 090 corridor fires a real Irish heading-correction bark',
    navBark.navOffCourse && navBark.sawCorrection, JSON.stringify(navBark));

  /* ---- Detection corridor: real exposure/attention accumulation, then a
   * real, unassisted straight-line crossing into the compound's defenses. ---- */
  const detectionEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.physics.setPose(h.physics.position.clone(), 90, h.physics.velocity.length());
    const phase = h.go('detection');
    return { phase, active: h.detection.active, state: h.detection.state };
  });
  check('go("detection") deploys the corridor patrol/radar stealth meter',
    detectionEntry.phase === 'detection' && detectionEntry.active
      && ['unnoticed', 'searching', 'located'].includes(detectionEntry.state),
    JSON.stringify(detectionEntry));

  const throughCorridor = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    // Hands-off flight is not trimmed for this loaded, heavy four-engine
    // bomber (per config.js's design note) — with no elevator input at all
    // it noses over into a dive within seconds, same as a real untrimmed
    // aircraft would. A light, duty-cycled climb input (20% of each second)
    // is the same real control the cockpit exposes, just automated rather
    // than held by a human hand, and is what keeps 40 real, physically
    // integrated seconds of forward flight clear of the ground.
    h.input.throttle = 0.85;
    for (let i = 0; i < 40; i++) {
      h.input.key('KeyS', true);
      h.tick(0.2);
      h.input.key('KeyS', false);
      h.tick(0.8);
    }
    return { phase: h.mission.phase, x: h.physics.position.x, agl: h.physics.agl, failed: h.mission.failed };
  });
  check('flying the real corridor for real clears past it into the compound\'s defenses',
    throughCorridor.phase === 'defense' && !throughCorridor.failed, JSON.stringify(throughCorridor));

  /* ---- Defense: the damage API affects real state without crashing. ---- */
  const defenseDamage = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const before = h.engines.engines[0].health;
    h.defense.damageEngine(0);
    h.defense.damageRudder();
    h.defense.damageElectrical();
    h.defense.damageFuel();
    h.tick(1);
    return {
      damage: { ...h.defense.damage, engines: h.defense.damage.engines.slice() },
      engineHealthDropped: h.engines.engines[0].health < before,
      sawHitLine: h.dialogue.seen('defense.hit'),
      phase: h.mission.phase,
    };
  });
  check('Defense\'s damage API flips real state, damages the engine, and plays the hit beat without crashing',
    defenseDamage.damage.engines[0] === true && defenseDamage.damage.rudder
      && defenseDamage.damage.electrical && defenseDamage.damage.fuel
      && defenseDamage.engineHealthDropped && defenseDamage.sawHitLine
      && defenseDamage.phase === 'defense',
    JSON.stringify(defenseDamage));

  /* Shortcut: the rest of the run to the target is straight, undamaging
   * flight already proven above (corridor crossing) — jump to the approach. */
  const bombApproachEntry = await page.evaluate(() => window.__enolaSquatch.go('bombApproach'));
  check('go("bombApproach") stages the bombing run', bombApproachEntry === 'bombApproach');

  const targetingReal = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(1);
    return {
      onHeading: h.targeting.onHeading,
      onAltitude: h.targeting.onAltitude,
      distance: h.targeting.distance,
    };
  });
  check('Targeting really reads the staged approach as on heading and on altitude',
    targetingReal.onHeading && targetingReal.onAltitude && Number.isFinite(targetingReal.distance),
    JSON.stringify(targetingReal));

  const bombMalfunctionEntry = await page.evaluate(() => window.__enolaSquatch.go('bombMalfunction'));
  check('go("bombMalfunction") stages the bomb-bay-doors-stuck beat', bombMalfunctionEntry === 'bombMalfunction');

  const releaseEntry = await page.evaluate(() => window.__enolaSquatch.go('release'));
  check('go("release") arms the release choice', releaseEntry === 'release');

  /* ---- Release: a real 1-5 choice, the payload actually detaches, mass drops. ---- */
  const beforeMass = await page.evaluate(() => window.__enolaSquatch.physics.mass);
  const release = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const before = { released: h.payload.released, mass: h.physics.mass };
    const chose = h.mission.chooseReleaseLine('3'); // "Lou sends his regards."
    h.tick(4); // stuck -> kick -> payload.release()
    return {
      chose,
      before,
      released: h.payload.released,
      afterMass: h.physics.mass,
      phase: h.mission.phase,
      payloadReleasedFlag: h.mission.payloadReleased,
    };
  });
  check('choosing release line 3 via chooseReleaseLine actually detaches the Fat Squatch and drops the mass',
    release.chose && !release.before.released && release.released
      && release.payloadReleasedFlag
      && (release.before.mass - release.afterMass) > 2000
      && release.phase === 'explosion',
    JSON.stringify({ ...release, deltaMass: release.before.mass - release.afterMass }));
  check('the mass drop matches the Fat Squatch\'s payload mass',
    Math.abs((beforeMass - release.afterMass) - 2700) < 5,
    JSON.stringify({ beforeMass, afterMass: release.afterMass }));

  /* ---- Let the payload actually fall and detonate for real, then escape.
   * Escape's own gate needs `p.agl > 220`, and the beat is literally "climb,
   * bank, and don't look at it" — hold real climb input throughout, the same
   * trim reasoning as the corridor crossing above. ---- */
  const explosionReal = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.input.throttle = 0.9;
    // Same duty-cycled climb input as the corridor crossing above (KeyS is
    // this flight model's nose-up — verified empirically, see this phase's
    // report) — held while the payload really falls and the VFX plays.
    for (let i = 0; i < 16; i++) {
      h.input.key('KeyS', true);
      h.tick(0.25);
      h.input.key('KeyS', false);
      h.tick(0.75);
    }
    return {
      impacted: h.payload.impacted,
      bombAccuracy: h.mission.score.bombAccuracy,
      phase: h.mission.phase,
      agl: h.physics.agl,
      failed: h.mission.failed,
    };
  });
  check('the Fat Squatch really falls, really impacts, and the mission really moves through explosion into escape',
    explosionReal.impacted && typeof explosionReal.bombAccuracy === 'number'
      && explosionReal.phase === 'escape' && !explosionReal.failed,
    JSON.stringify(explosionReal));

  /* ---- Escape naturally finds the engine damaged earlier and offers the
   * emergency choice; resolve it with 'baby' (no forced effect, so the
   * scripted overheat decays on its own rather than getting stuck). ---- */
  const emergencyEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    for (let i = 0; i < 12; i++) {
      h.input.key('KeyS', true);
      h.tick(0.25);
      h.input.key('KeyS', false);
      h.tick(0.75);
    } // escape's own 10s + margin decides emergency-or-return
    return {
      phase: h.mission.phase,
      engineHit: h.defense.damage.engines.findIndex(Boolean),
      agl: h.physics.agl,
      failed: h.mission.failed,
    };
  });
  check('escape finds the engine damaged during the defense phase and offers the emergency choice',
    emergencyEntry.phase === 'emergency' && emergencyEntry.engineHit >= 0 && !emergencyEntry.failed,
    JSON.stringify(emergencyEntry));

  const emergencyResolved = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const chose = h.mission.chooseEmergencyResponse('baby');
    h.tick(75); // the scripted overheat (70s) has to decay before return
    return { chose, phase: h.mission.phase };
  });
  check('choosing the emergency response resolves it and the mission moves on to return',
    emergencyResolved.chose && emergencyResolved.phase === 'return',
    JSON.stringify(emergencyResolved));

  /* ---- Return / landing: a real touchdown, a real grade. ---- */
  const landing = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('landing'); // stages a real touchdown pose on runway 18
    h.tick(2);        // registers the touchdown and grades it for real
    return {
      phase: h.mission.phase,
      finalLanding: h.mission.score.finalLanding,
      perfect: h.dialogue.seen('landing.perfect'),
      hard: h.dialogue.seen('landing.hard'),
    };
  });
  check('landing grades a real touchdown and reports a perfect-or-hard result',
    typeof landing.finalLanding === 'number' && landing.finalLanding >= 0 && landing.finalLanding <= 1
      && (landing.perfect || landing.hard) && landing.phase === 'epilogue',
    JSON.stringify(landing));

  /* ---- Epilogue / the report card. ---- */
  const epilogue = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(9);
    return { finished: h.mission.finished, report: h.mission.finished ? h.mission.report() : null };
  });
  check('the epilogue completes the mission and produces a real report card',
    epilogue.finished && epilogue.report
      && typeof epilogue.report.rank === 'string'
      && Array.isArray(epilogue.report.stats) && epilogue.report.stats.length > 0,
    JSON.stringify({ finished: epilogue.finished, rank: epilogue.report?.rank, tier: epilogue.report?.tier }));

  check('no runtime console/page errors occurred across the whole run', problems.length === 0, problems.join(' | '));

  await page.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log('Failed:');
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
