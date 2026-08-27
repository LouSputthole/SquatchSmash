#!/usr/bin/env node
/**
 * Drive THE TAKE through every authored phase in a real Chromium instance.
 *
 * This gate used to prove that the scene loaded. It did not prove that the
 * inventory could be switched, that the mask could be reached, that a round
 * could land on a person, that the objective was tracked, or that the road
 * agreed with the calls — every one of which was broken, and every one of
 * which the owner found by playing it. So the rule here is: use the same
 * inputs a player has. Look at a thing and press the key. Click the mouse.
 * `__heistDebug.use()` is allowed only where the target is provably reachable
 * by other checks in this file.
 *
 * The one deliberate exception is throughput: this runs on a software
 * rasteriser at roughly one frame a second, so anything that would measure
 * wall-clock frames measures the rasteriser instead. Driving physics is
 * asserted through `simulateDriving`, which steps the real `updateDriving` at
 * a fixed rate off whatever real key state the keyboard put there.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5221;
const SHOTS = path.join(ROOT, 'artifacts', 'heist');
const INPUT_ONLY = process.argv.includes('--input-only');
const VEHICLE_ONLY = process.env.HEIST_VEHICLE_ONLY === '1';
const INPUT_ONLY_TIMEOUT_MS = 240000;
const INPUT_ONLY_COMPLETE = Symbol('HEIST_INPUT_ONLY_COMPLETE');
const SENTINEL = '{"canonical":"THE TAKE preview must not mutate this"}';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
};

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
await fsp.mkdir(SHOTS, { recursive: true });

let browser = null;
let inputOnlyPhase = 'browser-launch';
const markInputOnlyPhase = (phase) => {
  if (!INPUT_ONLY) return;
  inputOnlyPhase = phase;
  console.log(`[THE TAKE input] ${phase}`);
};
const inputOnlyDeadline = INPUT_ONLY ? setTimeout(async () => {
  console.error(`[THE TAKE input] HARD TIMEOUT after ${INPUT_ONLY_TIMEOUT_MS}ms during ${inputOnlyPhase}`);
  const forceExit = setTimeout(() => process.exit(124), 5000);
  forceExit.unref?.();
  server.closeAllConnections?.();
  server.close?.();
  await browser?.close?.().catch(() => {});
  process.exit(124);
}, INPUT_ONLY_TIMEOUT_MS) : null;
inputOnlyDeadline?.unref?.();
markInputOnlyPhase('browser-launch');
browser = await launchChromium({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
markInputOnlyPhase('page-create');
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript((value) => {
  const marker = 'squatchlife.verify.heist.seeded';
  if (sessionStorage.getItem(marker)) return;
  localStorage.setItem('squatchlife.campaign', value);
  sessionStorage.setItem(marker, '1');
}, SENTINEL);

const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
page.on('requestfailed', (request) => {
  // An aborted request is a page being navigated or closed under an in-flight
  // fetch, which is this harness's own doing rather than a broken asset.
  const reason = request.failure()?.errorText ?? '';
  if (reason.includes('ERR_ABORTED')) return;
  problems.push(`${request.url()} — ${reason}`);
});
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const snapshot = () => page.evaluate(() => window.__heistDebug.snapshot());
const use = async (name) => {
  const result = await page.evaluate((target) => window.__heistDebug.use(target), name);
  if (!result.ok) throw new Error(`interaction ${name}: ${JSON.stringify(result)}`);
  await page.waitForTimeout(40);
  return result;
};
const pose = async (name) => {
  const ok = await page.evaluate((target) => window.__heistDebug.poseForEvidence(target), name);
  if (!ok) throw new Error(`missing evidence pose ${name}`);
  await page.waitForTimeout(120);
};
const promptText = () => page.locator('#prompt span').textContent();
const subtitle = () => page.locator('#subtitle').textContent();

/**
 * Wait until the crosshair is genuinely on a target before pressing anything.
 *
 * `InteractionSystem` picks its target inside the frame loop, and this scene
 * renders at roughly one frame a second on a software rasteriser, so a fixed
 * `waitForTimeout` after moving the camera reads the PREVIOUS frame's target
 * and every prompt in the run comes out one step behind.
 */
const waitForTarget = async (name, timeout = 30000) => {
  await page.waitForFunction(
    (target) => window.__heistDebug.snapshot().currentInteraction?.name === target,
    name, { timeout },
  );
};

/**
 * Hold E until something is true, rather than for a wall-clock duration.
 *
 * `hold` progress accumulates in the scene's own clamped `dt` (0.05 s a frame),
 * so at one frame a second a 1.2 s press is worth 0.05 s of hold and no hold
 * interaction in this scene can ever complete. NO WAKE's verifier had the
 * identical fault and it is written down in the 2026-08-03 continuation notes.
 * Press, poll the real state, release.
 */
const holdE = async (until, timeout = 90000) => {
  await page.keyboard.down('KeyE');
  try {
    await page.waitForFunction(until, null, { timeout, polling: 250 });
  } finally {
    await page.keyboard.up('KeyE');
    await page.waitForTimeout(120);
  }
};

const pressAtPose = async (name, { target = null, until = null } = {}) => {
  await pose(name);
  if (target) await waitForTarget(target);
  const prompt = await promptText();
  const current = await page.evaluate(() => window.__heistDebug.snapshot().currentInteraction);
  console.log(`    real input ${name}: ${JSON.stringify({ prompt, current })}`);
  if (until) await holdE(until);
  else {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(150);
  }
  return prompt;
};
const shot = async (name) => {
  await page.waitForTimeout(name === '02-safehouse-briefing' ? 900 : 180);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

/**
 * Measure the escape car through the actual `vehicle_escape` runtime.
 *
 * Keyboard events remain the source of throttle, brake and steering. The
 * verifier advances the real `updateDriving` at 120 Hz through the existing
 * debug clock because SwiftShader renders too slowly for wall time to mean
 * physics time. GroundVehicle owns every state transition and AudioEngine's
 * live loop handles own the audio evidence; this does not duplicate either
 * implementation in the harness.
 */
async function measureEscapeVehicle(vehiclePage, { completeRoute = false } = {}) {
  const reset = async () => {
    await vehiclePage.keyboard.up('KeyW').catch(() => {});
    await vehiclePage.keyboard.up('KeyA').catch(() => {});
    await vehiclePage.keyboard.up('KeyD').catch(() => {});
    await vehiclePage.keyboard.up('Space').catch(() => {});
    return vehiclePage.evaluate(() => window.__heistDebug.placeCar(
      20, -300, Math.PI,
      { resetRoute: true, resetDamage: true },
    ));
  };
  const stepUntil = (targetMph, maxSeconds = 12) => vehiclePage.evaluate(
    ([target, max]) => {
      const fixedDt = 1 / 120;
      const start = window.__heistDebug.snapshot().vehicle;
      let sample = window.__heistDebug.simulateDriving(fixedDt, fixedDt);
      const gears = [];
      let previousGear = null;
      let seconds = 0;
      let at60 = null;
      let at90 = null;
      while (seconds < max && sample.mph < target) {
        sample = window.__heistDebug.simulateDriving(fixedDt, fixedDt);
        seconds += fixedDt;
        if (sample.audio.gear !== previousGear) {
          gears.push({
            gear: sample.audio.gear,
            seconds,
            mph: sample.mph,
            rate: sample.audio.engine.rate,
          });
          previousGear = sample.audio.gear;
        }
        const point = {
          seconds,
          mph: sample.mph,
          distance: Math.hypot(sample.x - start.x, sample.z - start.z),
          audio: sample.audio,
        };
        if (!at60 && sample.mph >= 60) at60 = structuredClone(point);
        if (!at90 && sample.mph >= 90) at90 = structuredClone(point);
      }
      return {
        seconds,
        mph: sample.mph,
        distance: Math.hypot(sample.x - start.x, sample.z - start.z),
        collisionDamage: sample.collisionDamage,
        audio: sample.audio,
        at60,
        at90,
        gears,
      };
    },
    [targetMph, maxSeconds],
  );

  await reset();
  const idle = await vehiclePage.evaluate(() => window.__heistDebug.simulateDriving(0.5, 1 / 120));
  await vehiclePage.locator('#scene').click({ position: { x: 640, y: 360 } });
  await vehiclePage.keyboard.down('KeyW');
  await vehiclePage.waitForFunction(
    () => window.__heistDebug.inputState().keys.includes('KeyW'),
    null,
    { timeout: 5000 },
  );
  const throttleReceipt = await vehiclePage.evaluate(() => window.__heistDebug.inputState());
  const acceleration = await stepUntil(91.7, 11);
  await vehiclePage.screenshot({ path: path.join(SHOTS, 'job7-vehicle-escape-active.png') });
  await vehiclePage.keyboard.up('KeyW');
  await vehiclePage.waitForFunction(
    () => !window.__heistDebug.inputState().keys.includes('KeyW'),
    null,
    { timeout: 5000 },
  );
  const coast = await vehiclePage.evaluate(() => window.__heistDebug.simulateDriving(0.75, 1 / 120));

  check('real W input reaches the vehicle_escape checkpoint drivetrain',
    throttleReceipt.keys.includes('KeyW')
      && throttleReceipt.driving
      && acceleration.at60?.mph >= 60,
    JSON.stringify({ keys: throttleReceipt.keys, at60: acceleration.at60?.mph }));
  check('the live escape car reaches 90 mph and its 91.7 mph steady top speed',
    acceleration.at90?.seconds >= 7.3
      && acceleration.at90.seconds <= 8.0
      && acceleration.seconds >= 9.3
      && acceleration.seconds <= 10.2
      && acceleration.mph >= 91.65
      && acceleration.mph <= 91.75
      && acceleration.collisionDamage === 0,
    JSON.stringify({
      at90Seconds: acceleration.at90?.seconds,
      topSeconds: acceleration.seconds,
      topMph: acceleration.mph,
      distance: acceleration.distance,
      damage: acceleration.collisionDamage,
    }));
  check('speed crosses all four gears and drives real engine pitch and load',
    acceleration.gears.map((entry) => entry.gear).join(',') === '0,1,2,3'
      && idle.audio.engine.active
      && idle.audio.tires.active
      && acceleration.audio.engine.rate > idle.audio.engine.rate + 0.45
      && acceleration.audio.engine.volume > idle.audio.engine.volume + 0.2
      && acceleration.audio.engine.cutoff === 6200,
    JSON.stringify({ idle: idle.audio, gears: acceleration.gears, top: acceleration.audio }));
  check('lifting at speed removes engine load without restarting either loop',
    coast.audio.engine.active
      && coast.audio.tires.active
      && coast.audio.engine.cutoff === 2400
      && coast.audio.engine.rate < acceleration.audio.engine.rate
      && coast.audio.engine.volume < acceleration.audio.engine.volume,
    JSON.stringify({ loaded: acceleration.audio, coast: coast.audio }));

  await reset();
  await vehiclePage.keyboard.down('KeyW');
  const sixtyForBrake = await stepUntil(60, 4);
  await vehiclePage.keyboard.up('KeyW');
  await vehiclePage.keyboard.down('Space');
  const braking = await vehiclePage.evaluate(() => {
    const fixedDt = 1 / 120;
    const start = window.__heistDebug.snapshot().vehicle;
    let sample = window.__heistDebug.simulateDriving(fixedDt, fixedDt);
    let seconds = 0;
    while (sample.speed > 0 && seconds < 4) {
      sample = window.__heistDebug.simulateDriving(fixedDt, fixedDt);
      seconds += fixedDt;
    }
    return {
      seconds,
      startMph: start.speed * 2.23694,
      stopMph: sample.mph,
      distance: Math.hypot(sample.x - start.x, sample.z - start.z),
      audio: sample.audio,
      collisionDamage: sample.collisionDamage,
    };
  });
  await vehiclePage.keyboard.up('Space');
  check('full braking stops the live car from 60 mph in the measured envelope',
    sixtyForBrake.mph >= 60
      && braking.seconds >= 1.5
      && braking.seconds <= 1.8
      && braking.distance >= 21
      && braking.distance <= 25
      && braking.collisionDamage === 0,
    JSON.stringify(braking));

  await reset();
  await vehiclePage.keyboard.down('KeyW');
  await vehiclePage.keyboard.down('KeyA');
  await vehiclePage.waitForFunction(
    () => ['KeyW', 'KeyA'].every((key) => window.__heistDebug.inputState().keys.includes(key)),
    null,
    { timeout: 5000 },
  );
  /* Stage, snapshot and fixed-step advance must share one browser task. The
   * live RAF also calls updateDriving(), so taking the start snapshot before
   * dispatching KeyA let one or more software-rendered frames land inside a
   * nominal 0.25 s sample. That produced 42.99-44.42 degrees and 9.5 m while
   * the same real car is 35.48 degrees and 6.78 m for exactly thirty 120 Hz
   * steps. placeCar only stages debug state; updateDriving below still reads
   * the real W+A keyboard input recorded above. */
  const steering = await vehiclePage.evaluate(() => {
    const input = window.__heistDebug.inputState();
    const staged = window.__heistDebug.placeCar(20, -300, Math.PI, {
      resetRoute: true,
      resetDamage: true,
      speed: 60 / 2.237,
      throttle: 1,
    });
    const start = window.__heistDebug.snapshot().vehicle;
    const end = window.__heistDebug.simulateDriving(0.25, 1 / 120);
    return { input, staged, start, end };
  });
  await vehiclePage.keyboard.up('KeyA');
  await vehiclePage.keyboard.up('KeyW');
  const { start: steerStart, end: steerEnd } = steering;
  const yawDegrees = Math.abs(Math.atan2(
    Math.sin(steerEnd.heading - steerStart.heading),
    Math.cos(steerEnd.heading - steerStart.heading),
  )) * 180 / Math.PI;
  const steerDistance = Math.hypot(steerEnd.x - steerStart.x, steerEnd.z - steerStart.z);
  check('a quarter-second real steering input produces a responsive, bounded yaw at 60 mph',
    steering.input.keys.includes('KeyW')
      && steering.input.keys.includes('KeyA')
      && steering.staged.ok
      && Math.abs(steerStart.speed * 2.237 - 60) <= 0.001
      && steerStart.steerAngle === 0
      && yawDegrees >= 33
      && yawDegrees <= 38
      && steerDistance >= 6.4
      && steerDistance <= 7.1
      && steerEnd.collisionDamage === 0,
    JSON.stringify({ keys: steering.input.keys, yawDegrees, distance: steerDistance,
      startMph: steerStart.speed * 2.237, endMph: steerEnd.mph,
      steerAngle: steerEnd.steerAngle, damage: steerEnd.collisionDamage }));

  await reset();
  let progression = null;
  if (completeRoute) {
    const nodes = [];
    for (let index = 0; index < 6; index++) {
      nodes.push(await vehiclePage.evaluate(() => window.__heistDebug.driveToNextNode()));
    }
    await vehiclePage.waitForFunction(
      () => window.__heistDebug.state === 'VEHICLE_SWAP',
      null,
      { timeout: 30000, polling: 250 },
    );
    progression = await vehiclePage.evaluate(() => window.__heistDebug.snapshot());
    check('the measured vehicle_escape checkpoint still reaches the existing swap',
      nodes.map((entry) => entry.node).join(',')
        === 'garage_left,warehouse_left,tower_right,roadblock,canal_turn,industrial_swap'
        && progression.state === 'VEHICLE_SWAP'
        && progression.vehicle.pursuitVisible === false,
      JSON.stringify({ nodes: nodes.map((entry) => entry.node), state: progression.state,
        pursuit: progression.vehicle.pursuitVisible }));
  }

  return { idle, acceleration, coast, braking, yawDegrees, steerDistance, progression };
}

async function verifyEscapeVehicleCheckpoint() {
  await page.goto(`http://localhost:${PORT}/heist.html?preview=1&checkpoint=vehicle_escape`,
    { waitUntil: 'load' });
  await page.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 120000 });
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(
    () => window.__heistDebug?.snapshot().state === 'PLAYER_TAKES_WHEEL',
    null,
    { timeout: 120000 },
  );
  const opening = await snapshot();
  check('vehicle_escape preview starts in the live driving state with both shared loops',
    opening.phase === 'driving'
      && opening.vehicle.audio.engine.active
      && opening.vehicle.audio.tires.active,
    JSON.stringify({ state: opening.state, phase: opening.phase, audio: opening.vehicle.audio }));
  const evidence = await measureEscapeVehicle(page, { completeRoute: true });
  console.log(`    vehicle evidence ${JSON.stringify({
    at60: evidence.acceleration.at60,
    at90: evidence.acceleration.at90,
    top: {
      seconds: evidence.acceleration.seconds,
      mph: evidence.acceleration.mph,
      distance: evidence.acceleration.distance,
      audio: evidence.acceleration.audio,
    },
    coast: evidence.coast.audio,
    braking: evidence.braking,
    steering: { yawDegrees: evidence.yawDegrees, distance: evidence.steerDistance },
  })}`);
  check('vehicle_escape checkpoint emitted no page, console, or request failures',
    problems.length === 0, problems.join(' | ').slice(0, 600));
}

async function verifyManagerAndActorRecovery() {
  const managerPage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  managerPage.on('pageerror', (error) => problems.push(`manager-recovery: ${error.message}`));
  await managerPage.addInitScript((value) => {
    localStorage.setItem('squatchlife.campaign', value);
  }, SENTINEL);
  const startManagerPreview = async () => {
    await managerPage.goto(`http://localhost:${PORT}/heist.html?preview=1&checkpoint=bank_lobby`,
      { waitUntil: 'load' });
    await managerPage.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 60000 });
    await managerPage.evaluate(() => document.getElementById('start').click());
    await managerPage.waitForFunction(() => window.__heistDebug.snapshot().phase === 'bank',
      null, { timeout: 60000 });
  };
  const managerSnapshot = () => managerPage.evaluate(() => window.__heistDebug.snapshot());
  const managerUse = async (name) => {
    const result = await managerPage.evaluate((target) => window.__heistDebug.use(target), name);
    if (!result.ok) throw new Error(`manager interaction ${name}: ${JSON.stringify(result)}`);
  };

  try {
    await startManagerPreview();
    const hostageAim = await managerPage.evaluate(() => window.__heistDebug.aimAt('hostage_7'));
    const hostageBefore = await managerSnapshot();
    await managerPage.mouse.click(480, 270);
    await managerPage.waitForTimeout(120);
    let recoveryState = await managerSnapshot();
    check('a real carbine round can incapacitate every ordinary lobby civilian',
      hostageAim.ok
        && recoveryState.inventory.magazine === hostageBefore.inventory.magazine - 1
        && recoveryState.lobbyActors.hostages.hostage_7.incapacitated === true
        && recoveryState.hostageStates[6] === 'down',
      JSON.stringify({ aim: hostageAim, before: hostageBefore.inventory.magazine,
        after: recoveryState.inventory.magazine, actor: recoveryState.lobbyActors.hostages.hostage_7,
        state: recoveryState.hostageStates[6] }));

    await managerPage.evaluate(() => window.__heistDebug.fail('civilian_actor_restore_probe'));
    await managerPage.waitForFunction(() => window.__heistDebug.state === 'FAILED',
      null, { timeout: 30000 });
    await managerPage.waitForFunction(() => window.__heistDebug.state === 'LOBBY_CONTROL',
      null, { timeout: 60000 });
    const civilianRestored = await managerSnapshot();
    await managerPage.evaluate(() => window.__heistDebug.aimAt('hostage_7'));
    await managerPage.mouse.click(480, 270);
    await managerPage.waitForTimeout(120);
    recoveryState = await managerSnapshot();
    check('checkpoint recovery restores civilian combat health as well as the standing pose',
      civilianRestored.hostageStates[6] !== 'down'
        && civilianRestored.lobbyActors.hostages.hostage_7.incapacitated === false
        && recoveryState.lobbyActors.hostages.hostage_7.health
          < civilianRestored.lobbyActors.hostages.hostage_7.health
        && recoveryState.objective.civilianCasualties === 1,
      JSON.stringify({ restoredState: civilianRestored.hostageStates[6],
        restoredActor: civilianRestored.lobbyActors.hostages.hostage_7,
        afterRetry: recoveryState.lobbyActors.hostages.hostage_7,
        casualties: recoveryState.objective.civilianCasualties }));

    await startManagerPreview();
    await managerUse('bank-crowd');
    await managerUse('bank-rear-guard');
    const managerAim = await managerPage.evaluate(() => window.__heistDebug.aimAt('bank_manager'));
    const managerBefore = await managerSnapshot();
    await managerPage.mouse.click(480, 270);
    await managerPage.waitForTimeout(120);
    const managerFatal = await managerSnapshot();
    check('the manager is killable and a fatal player shot immediately enters checkpoint recovery',
      managerAim.ok
        && managerFatal.inventory.magazine === managerBefore.inventory.magazine - 1
        && managerFatal.lobbyActors.manager.incapacitated === true
        && managerFatal.state === 'FAILED'
        && managerFatal.failure?.reason === 'manager_incapacitated',
      JSON.stringify({ aim: managerAim, before: managerBefore.inventory.magazine,
        after: managerFatal.inventory.magazine, actor: managerFatal.lobbyActors.manager,
        state: managerFatal.state, failure: managerFatal.failure }));
    if (managerFatal.state !== 'FAILED') {
      await managerPage.evaluate(() => window.__heistDebug.fail('manager_fatality_probe_cleanup'));
    }
    await managerPage.waitForFunction(() => window.__heistDebug.state === 'LOBBY_CONTROL',
      null, { timeout: 60000 });
    const managerRestored = await managerSnapshot();
    check('manager-fatality recovery restores a living manager and a playable lobby checkpoint',
      managerRestored.lobbyActors.manager.health === managerRestored.lobbyActors.manager.maxHealth
        && managerRestored.lobbyActors.manager.incapacitated === false
        && managerRestored.managerPose === 'stand'
        && managerRestored.objective.civilianCasualties === 0
        && managerRestored.state === 'LOBBY_CONTROL',
      JSON.stringify({ actor: managerRestored.lobbyActors.manager,
        pose: managerRestored.managerPose, casualties: managerRestored.objective.civilianCasualties,
        state: managerRestored.state }));

    /* Health/state green is not enough: prove the restored objective chain can
     * still be played. The room-wide volume is invoked directly; both required
     * people are acquired through a real unobstructed interaction ray and the
     * production E-key path. */
    await managerUse('bank-crowd');
    const rearApproach = await managerPage.evaluate(
      () => window.__heistDebug.approachInteraction('bank-rear-guard'),
    );
    if (!rearApproach.ok) throw new Error(`rear-guard approach: ${JSON.stringify(rearApproach)}`);
    await managerPage.keyboard.press('KeyE');
    await managerPage.waitForFunction(() => window.__heistDebug.state === 'GUARDS_SECURED',
      null, { timeout: 60000 });
    const managerApproach = await managerPage.evaluate(
      () => window.__heistDebug.approachInteraction('bank-manager'),
    );
    if (!managerApproach.ok) throw new Error(`manager approach: ${JSON.stringify(managerApproach)}`);
    await managerPage.keyboard.press('KeyE');
    await managerPage.waitForFunction(() => {
      const snapshot = window.__heistDebug.snapshot();
      return snapshot.state === 'MANAGER_ESCORT' && snapshot.managerEscortProgress > 0;
    }, null, { timeout: 120000, polling: 250 });
    const playableAfterRecovery = await managerSnapshot();
    check('manager-fatality recovery can replay the lobby and start the manager escort',
      playableAfterRecovery.state === 'MANAGER_ESCORT'
        && playableAfterRecovery.managerEscortProgress > 0
        && playableAfterRecovery.lobbyActors.manager.incapacitated === false,
      JSON.stringify({ rearApproach, managerApproach, state: playableAfterRecovery.state,
        progress: playableAfterRecovery.managerEscortProgress,
        manager: playableAfterRecovery.lobbyActors.manager }));
  } finally {
    await managerPage.close();
  }
}

async function verifyPoliceCombatAndRecycle() {
  const policePage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  policePage.on('pageerror', (error) => problems.push(`police-recycle: ${error.message}`));
  await policePage.addInitScript((value) => {
    localStorage.setItem('squatchlife.campaign', value);
  }, SENTINEL);
  const policeSnapshot = () => policePage.evaluate(() => window.__heistDebug.snapshot());

  try {
    await policePage.goto(`http://localhost:${PORT}/heist.html?preview=1&checkpoint=street_withdrawal`,
      { waitUntil: 'load' });
    await policePage.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 60000 });
    await policePage.evaluate(() => document.getElementById('start').click());
    await policePage.waitForFunction(() => {
      const snapshot = window.__heistDebug.snapshot();
      return snapshot.phase === 'street'
        && snapshot.policeActors.some((actor) => actor.phaseId === 'street'
          && actor.visible && !actor.incapacitated);
    }, null, { timeout: 60000 });

    let policeState = await policeSnapshot();
    const target = policeState.policeActors.find((actor) => actor.phaseId === 'street'
      && actor.visible && !actor.incapacitated);
    const firstAim = await policePage.evaluate(
      (actorId) => window.__heistDebug.aimAt(actorId), target.id,
    );
    const firstMagazine = policeState.inventory.magazine;
    const firstHealth = target.health;
    await policePage.mouse.click(480, 270);
    await policePage.waitForFunction(([actorId, health]) => {
      const actor = window.__heistDebug.snapshot().policeActors
        .find((candidate) => candidate.id === actorId);
      return actor && actor.health < health;
    }, [target.id, firstHealth], { timeout: 30000 }).catch(() => {});
    policeState = await policeSnapshot();
    const wounded = policeState.policeActors.find((actor) => actor.id === target.id);
    check('a real carbine round damages an ordinary spawned street officer',
      firstAim.ok
        && policeState.inventory.magazine === firstMagazine - 1
        && wounded.health < firstHealth
        && wounded.incapacitated === false,
      JSON.stringify({ aim: firstAim, before: { health: firstHealth, magazine: firstMagazine },
        after: { actor: wounded, magazine: policeState.inventory.magazine } }));

    const recycled = await policePage.evaluate(
      (actorId) => window.__heistDebug.probePoliceRecycle(actorId), target.id,
    );
    policeState = await policeSnapshot();
    const fresh = policeState.policeActors.find((actor) => actor.id === recycled.actorId);
    check('the real officer pool recycles the same root as a fresh aiming combatant',
      recycled.ok
        && recycled.sameRoot
        && recycled.pose === 'aiming'
        && recycled.health === recycled.maxHealth
        && recycled.incapacitated === false
        && recycled.active
        && recycled.directorUnchanged
        && recycled.checkpointUnchanged
        && recycled.activeCountUnchanged
        && fresh?.rootUuid === recycled.rootUuid
        && fresh?.pose === 'aiming'
        && fresh?.health === fresh?.maxHealth
        && fresh?.incapacitated === false,
      JSON.stringify({ recycled, fresh }));

    const secondAim = await policePage.evaluate(
      (actorId) => window.__heistDebug.aimAt(actorId), recycled.actorId,
    );
    await policePage.waitForFunction(
      () => window.__heistDebug.snapshot().inventory.weaponCooldown === 0,
      null, { timeout: 30000 },
    );
    policeState = await policeSnapshot();
    const secondMagazine = policeState.inventory.magazine;
    const secondHealth = fresh.health;
    await policePage.mouse.click(480, 270);
    await policePage.waitForFunction(([actorId, health]) => {
      const actor = window.__heistDebug.snapshot().policeActors
        .find((candidate) => candidate.id === actorId);
      return actor && actor.health < health;
    }, [recycled.actorId, secondHealth], { timeout: 30000 }).catch(() => {});
    policeState = await policeSnapshot();
    const hitAgain = policeState.policeActors.find((actor) => actor.id === recycled.actorId);
    check('the recycled officer is targetable and loses health to a second real shot',
      secondAim.ok
        && policeState.inventory.magazine === secondMagazine - 1
        && hitAgain.rootUuid === recycled.rootUuid
        && hitAgain.health < secondHealth
        && hitAgain.incapacitated === false,
      JSON.stringify({ aim: secondAim, before: { health: secondHealth, magazine: secondMagazine },
        after: { actor: hitAgain, magazine: policeState.inventory.magazine } }));
  } finally {
    await policePage.close();
  }
}

try {
  if (process.env.HEIST_MANAGER_ONLY === '1') {
    await verifyManagerAndActorRecovery();
  } else if (process.env.HEIST_POLICE_ONLY === '1') {
    await verifyPoliceCombatAndRecycle();
  } else if (VEHICLE_ONLY) {
    await verifyEscapeVehicleCheckpoint();
  } else {
  markInputOnlyPhase('page-load');
  await page.goto(`http://localhost:${PORT}/heist.html?preview=1&checkpoint=safehouse`, { waitUntil: 'load' });
  markInputOnlyPhase('runtime-ready');
  await page.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 120000 });
  markInputOnlyPhase('start-click');
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(() => window.__heistDebug.state === 'CREW_INTRO', null, { timeout: 120000 });
  markInputOnlyPhase('real-input');
  let state = await snapshot();

  /* Cross the browser-to-Player Seam before any verifier pose or interaction
   * helper can make this mission look playable. The click is trusted browser
   * input, the frame loop moves the real Player, and the Adapter's own
   * receipts must agree with the observed look/movement/key lifecycle. */
  const beforeRealInput = await page.evaluate(() => {
    const heist = window.__heistDebug;
    const inputState = heist.inputState();
    const probe = heist.probeCrosshair();
    return {
      x: probe.eye[0],
      z: probe.eye[2],
      yaw: probe.yaw,
      input: inputState.adapter,
    };
  });
  await page.locator('#scene').click({ position: { x: 640, y: 360 } });
  await page.waitForFunction(
    () => window.__heistDebug.inputState().adapter?.captured === true,
    null,
    { timeout: 10000 },
  );
  /* Headless Chromium can consume the first relative packet while settling a
   * new pointer lock. Several trusted sweeps still have to change Player.yaw. */
  for (const [x, y] of [[700, 330], [560, 390], [740, 320]]) {
    await page.mouse.move(x, y, { steps: 3 });
  }
  await page.keyboard.down('w');
  await page.waitForFunction(({ x, z }) => {
    const eye = window.__heistDebug.probeCrosshair().eye;
    return Math.hypot(eye[0] - x, eye[2] - z) > 0.12;
  }, beforeRealInput, { polling: 'raf', timeout: 30000 });
  const heldRealInput = await page.evaluate(() => ({
    keys: window.__heistDebug.inputState().keys,
    input: window.__heistDebug.inputState().adapter,
  }));
  await page.keyboard.up('w');
  await page.waitForFunction(
    () => !window.__heistDebug.inputState().keys.includes('KeyW'),
    null,
    { polling: 'raf', timeout: 5000 },
  );
  const afterRealInput = await page.evaluate(() => {
    const heist = window.__heistDebug;
    const probe = heist.probeCrosshair();
    return {
      x: probe.eye[0],
      z: probe.eye[2],
      yaw: probe.yaw,
      keys: heist.inputState().keys,
      input: heist.inputState().adapter,
    };
  });
  check('real canvas click, mouse, and W input capture, look, move, and release in the safehouse',
    afterRealInput.input.captured
      && afterRealInput.input.mouseDownEvents > beforeRealInput.input.mouseDownEvents
      && afterRealInput.input.lookEvents > beforeRealInput.input.lookEvents
      && afterRealInput.input.movementPresses > beforeRealInput.input.movementPresses
      && afterRealInput.input.lastMovementCode === 'KeyW'
      && heldRealInput.keys.includes('KeyW')
      && !afterRealInput.keys.includes('KeyW')
      && Math.hypot(
        afterRealInput.x - beforeRealInput.x,
        afterRealInput.z - beforeRealInput.z,
      ) > 0.12
      && Math.abs(afterRealInput.yaw - beforeRealInput.yaw) > 0.001,
    JSON.stringify({ beforeRealInput, heldRealInput, afterRealInput }));
  if (INPUT_ONLY) {
    check('focused input receipt emitted no page, console, or request failures',
      problems.length === 0, problems.join(' | ').slice(0, 600));
    markInputOnlyPhase('complete');
    throw INPUT_ONLY_COMPLETE;
  }
  const canonicalCrewPhysical = Object.freeze({
    snow: Object.freeze({
      height: 1.70, outfit: 'work', gender: 'unspecified', bodyShape: 'average',
      photoFace: true, proceduralFace: false, hair: false, beard: false, glasses: false,
      plateCarrier: true, weapon: 'carbine', weaponSling: true,
      maskPresent: false, maskVisible: false,
    }),
    rippinflow: Object.freeze({
      height: 1.77, outfit: 'shirt', gender: 'unspecified', bodyShape: 'average',
      photoFace: true, proceduralFace: false, hair: false, beard: false, glasses: false,
      plateCarrier: true, weapon: 'sidearm', weaponSling: true,
      maskPresent: false, maskVisible: false,
    }),
    shubenator: Object.freeze({
      height: 1.84, outfit: 'tee', gender: 'unspecified', bodyShape: 'average',
      photoFace: true, proceduralFace: false, hair: false, beard: false, glasses: false,
      plateCarrier: true, weapon: 'sidearm', weaponSling: true,
      maskPresent: false, maskVisible: false,
    }),
    /* THE TAKE deliberately layers its plate carrier over DeathMegatron's
     * named utility-shirt variant. Her canonical anatomy remains unchanged;
     * only the scene wardrobe differs from her gown used elsewhere. */
    deathmegatron: Object.freeze({
      height: 1.79, outfit: 'shirt', gender: 'female', bodyShape: 'curvy',
      photoFace: true, proceduralFace: false, hair: false, beard: false, glasses: false,
      plateCarrier: true, weapon: 'carbine', weaponSling: true,
      maskPresent: false, maskVisible: false,
    }),
    numbskull: Object.freeze({
      height: 1.95, outfit: 'tee', gender: 'unspecified', bodyShape: 'average',
      photoFace: false, proceduralFace: true, hair: false, beard: false, glasses: true,
      plateCarrier: true, weapon: 'sidearm', weaponSling: true,
      maskPresent: false, maskVisible: false,
    }),
  });
  const physicalPresentationMatches = (actor, expected) => expected
    && Object.entries(expected).every(([key, value]) => actor.physical?.[key] === value);
  check('safehouse opens with five named crew plus the human player',
    state.phase === 'safehouse'
      && Object.keys(state.squadAnchors).length === 5
      && state.geometry.colliders > 0
      && state.geometry.floorZones > 0
      && state.presentation.crew.every((actor) => actor.facingDot > 0.65)
      && state.presentation.numbskullFace
      && state.presentation.numbskullGlasses
      && state.presentation.lockers === 3,
    JSON.stringify(state.presentation));

  /* THE STANDING ORDER, ON THE SHARED CARD.
   *
   * THE TAKE had no gate on its objective at all. The scene drew its own
   * `#objective` box, nothing ever read it, and that is precisely how "Meet
   * the crew." survived the entire job on the `?checkpoint=` path -- the
   * defect `src/heist/orders.js` exists to kill. The sentence is on the
   * shared card from `src/core/objective-panel.js` now; a gate still reading
   * the deleted id would go green on an empty string, which is
   * docs/ENGINE-TRAPS.md section 5. So this reads the card that exists, and
   * fails if the old box comes back beside it. */
  const objectiveCard = await page.evaluate(() => {
    const panel = document.getElementById('objectives');
    return {
      legacy: Boolean(document.getElementById('objective')),
      shared: Boolean(panel) && panel.classList.contains('op-panel'),
      parent: panel?.parentElement?.id ?? null,
      visible: Boolean(panel) && !panel.classList.contains('hidden'),
      title: panel?.querySelector('.otitle')?.textContent?.trim() ?? '',
      order: panel?.querySelector('.olist li')?.textContent?.trim() ?? '',
    };
  });
  check('the standing order is on the shared objective card and nowhere else',
    objectiveCard.shared && !objectiveCard.legacy
      && objectiveCard.parent === 'heist-hud'
      && objectiveCard.visible
      && /join Snow at the table/i.test(objectiveCard.order),
    JSON.stringify(objectiveCard));

  check('every fixed crew member has canonical anatomy plus real heist overlays',
    state.presentation.crew.length === Object.keys(canonicalCrewPhysical).length
      && state.presentation.crew.every((actor) => physicalPresentationMatches(
        actor, canonicalCrewPhysical[actor.id],
      )),
    JSON.stringify(state.presentation.crew.map(({ id, physical }) => ({ id, physical }))));

  /* ---- scale: the owner's first note, in every phase ---- */
  const canonicalCrewHeights = Object.freeze({
    snow: 1.70,
    rippinflow: 1.77,
    shubenator: 1.84,
    deathmegatron: 1.79,
    numbskull: 1.95,
  });
  check('nobody in THE TAKE is a giant any more',
    state.scale.crew.length === Object.keys(canonicalCrewHeights).length
      && state.scale.crew.every((actor) => actor.height === canonicalCrewHeights[actor.id])
      && state.scale.civilians.every((height) => height >= 1.55 && height <= 1.95)
      && state.scale.guard <= 1.95 && state.scale.manager <= 1.95
      && Math.max(...state.scale.crew.map((a) => a.height))
        - Math.min(...state.scale.civilians) < 0.4,
    JSON.stringify(state.scale));

  check('THE TAKE starts with five visible slots while packed weapons remain on the table',
    state.inventory.slots === 5
      && state.inventory.declared === '5'
      && state.inventory.visible
      && state.inventory.items.every((item) => item == null)
      && state.presentation.armorVisible
      && state.presentation.carbineVisible,
    JSON.stringify(state.inventory));
  check('the expanded heist dialogue bank is wired and recorded lines drive real timing',
    state.voice.authored >= 56
      && state.voice.decoded >= 40
      && state.voice.pending >= 35
      && state.voice.longest > 0
      && state.voice.lastPlayback?.duration > 0
      && state.voice.subtitleRemaining > 0,
    JSON.stringify(state.voice));
  check('the player capsule is physically ejected from authored solids',
    (await page.evaluate(() => window.__heistDebug.probeCollision())).resolved);
  await shot('02-safehouse-briefing');

  const crewPrompts = [];
  for (const actor of state.presentation.crew) {
    await page.evaluate((id) => window.__heistDebug.poseForCrew(id), actor.id);
    await waitForTarget(`crew-${actor.id}`);
    crewPrompts.push(await promptText());
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(150);
  }
  state = await snapshot();
  check('real look-and-E input names every crew member and fires each introduction once',
    state.presentation.crew.every((actor) => actor.introduced)
      && state.presentation.crew.every((actor) => crewPrompts.some((label) => label?.includes(actor.name)))
      && /Snow:|Rippinflow:|Shubenator:|DeathMegatron:|Numbskull:/.test(await subtitle()),
    JSON.stringify(crewPrompts));

  await pressAtPose('briefing', { target: 'briefing-map' });
  await pressAtPose('briefing', { target: 'briefing-map' });
  await pressAtPose('armor', {
    target: 'safehouse-armor',
    until: () => window.__heistDebug.snapshot().presentation.armorVisible === false,
  });
  await pressAtPose('loadout', {
    target: 'safehouse-loadout',
    until: () => window.__heistDebug.snapshot().inventory.items[0] === 'carbine',
  });
  state = await snapshot();
  check('real hold interactions remove the physical gear and reveal the unpacked five-slot loadout',
    !state.presentation.armorVisible
      && !state.presentation.carbineVisible
      && state.inventory.items.slice(0, 4).join(',') === 'carbine,sidearm,mask,duffel',
    JSON.stringify({ presentation: state.presentation, inventory: state.inventory }));

  /* ---- owner note: "I cant switch inventory items" / "cant see whats in my hand" ---- */
  check('the loadout arrives with the carbine selected and drawn in frame',
    state.inventory.selected === 0
      && state.inventory.selectedItem === 'carbine'
      && state.inventory.handsShowing === 'carbine'
      && state.inventory.handsVisible
      && state.inventory.weaponName === 'CONTROLLED',
    JSON.stringify(state.inventory));
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(120);
  let after = await snapshot();
  check('a real number key changes the slot, the hands and the weapon together',
    after.inventory.selected === 1
      && after.inventory.selectedItem === 'sidearm'
      && after.inventory.handsShowing === 'sidearm'
      && after.inventory.handsVisible
      && after.inventory.weaponName === 'COMMANDER'
      /* The sidearm is the shared catalog's fifteen-round 9mm now. */
      && after.inventory.magazine === 15,
    JSON.stringify(after.inventory));
  const barSelected = await page.locator('#hotbar .slot.on').getAttribute('data-key');
  const barLabel = await page.locator('#hotbar .slot.on').getAttribute('aria-label');
  check('the on-screen bar highlights the slot the player actually chose',
    barSelected === '2' && /Commander sidearm/.test(barLabel ?? ''),
    JSON.stringify({ barSelected, barLabel }));
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(120);
  after = await snapshot();
  check('selecting the balaclava puts it in frame and takes the trigger away',
    after.inventory.selectedItem === 'mask'
      && after.inventory.handsShowing === 'mask'
      && after.inventory.selectedIsWeapon === false
      && after.inventory.weaponName === null,
    JSON.stringify(after.inventory));
  await page.keyboard.press('BracketLeft');
  await page.waitForTimeout(200);
  after = await snapshot();
  check('the bracket keys cycle the selection, skipping the empty slot',
    after.inventory.selected === 1 && after.inventory.selectedItem === 'sidearm',
    JSON.stringify(after.inventory));
  await page.dispatchEvent('#scene', 'wheel', { deltaY: 120 });
  await page.waitForTimeout(200);
  after = await snapshot();
  check('a wheel event is a second way to change hands',
    after.inventory.selected === 2 && after.inventory.selectedItem === 'mask',
    JSON.stringify(after.inventory));
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(100);
  await shot('02b-hands-carbine');

  /* The briefing-table frame cannot prove that the escape vehicle stopped
   * being a car. Frame the rear leaves before boarding, and tie that frame to
   * measured named geometry so a sharp screenshot of the wrong corner fails. */
  await pose('safehouse_van');
  state = await snapshot();
  const cargoVan = state.geometry.evidence.safehouseCargoVan;
  check('safehouse evidence frames a full-height cargo van backed through its loading bay',
    state.evidenceFrame?.name === 'safehouse_van'
      && state.evidenceFrame.focus.length === 3
      && state.evidenceFrame.focus.every((item) => item.present && item.inFrame)
      && cargoVan.kind === 'cargo-van'
      && cargoVan.size[2] >= 5.8
      && cargoVan.size[2] > cargoVan.size[0] * 1.65
      && cargoVan.size[1] >= 2.55
      && cargoVan.rearDoorCenter[2] < cargoVan.center[2]
      && cargoVan.minZ < cargoVan.loadingBayZ
      && cargoVan.maxZ > cargoVan.loadingBayZ
      && cargoVan.rearParts === 4
      && cargoVan.loadingBayParts === 3,
    JSON.stringify({ frame: state.evidenceFrame, cargoVan }));
  await shot('02c-safehouse-cargo-van');

  await use('van-door');
  state = await snapshot();
  check('safehouse checkpoint is durable before the van ride',
    state.checkpoint === 'safehouse_ready' && state.state === 'VAN_APPROACH');
  state = await snapshot();
  check('the van ride uses a bounded interior and locks translation until arrival',
    state.phase === 'van' && state.geometry.colliders >= 5, JSON.stringify(state.geometry));

  /* ---- owner note: "In the van Im just standing here I cant pull the mask on" ----
   * This is the check that would have caught it: no debug interaction, no
   * teleport. Stand where the van puts you, look where it points you, press E. */
  await waitForTarget('van-cabin');
  const vanPrompt = await promptText();
  const vanTarget = await page.evaluate(() => window.__heistDebug.snapshot().currentInteraction);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  state = await snapshot();
  check('the mask can be pulled on from the seat, with the key the HUD names',
    state.state === 'MASKS_ON'
      && state.inventory.maskWorn === true
      && state.inventory.items[2] === 'zip_ties'
      && state.presentation.crew.every((actor) => actor.physical.maskPresent
        && actor.physical.maskVisible)
      && /balaclava/i.test(vanPrompt ?? ''),
    JSON.stringify({
      vanPrompt, vanTarget, state: state.state, mask: state.inventory.maskWorn,
      crewMasks: state.presentation.crew.map(({ id, physical }) => ({
        id, present: physical.maskPresent, visible: physical.maskVisible,
      })),
    }));
  await shot('03-van-interior');
  /* And the doors, from the same seat: at 2.7 m of reach the rear door itself
   * was never in range either. */
  await waitForTarget('van-cabin');
  const doorPrompt = await promptText();
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__heistDebug.state === 'BANK_ENTRY',
    null, { timeout: 30000, polling: 300 });
  check('the doors open from the seat too, once the mask is down',
    /van doors/i.test(doorPrompt ?? ''), String(doorPrompt));

  state = await snapshot();
  check('bank entry starts a visible 2.75 second ballistic guard threat',
    state.state === 'BANK_ENTRY'
      && state.guardThreat.state === 'drawing'
      && state.guardThreat.remaining <= 2.75
      && !(await page.locator('#guard-threat').evaluate((element) => element.classList.contains('hidden'))),
    JSON.stringify(state.guardThreat));
  await shot('04a-bank-guard-threat');
  /* Every clock in this scene advances in the frame loop's clamped 0.05 s
   * step, and this rasteriser gives about one frame a second — so a 2.75 s
   * reaction window takes the better part of a minute of wall clock to expire.
   * Timeouts below are sized for that, not for a real machine. */
  await page.waitForFunction(() => {
    const s = window.__heistDebug.snapshot();
    return s.guardFailures === 1 && s.state === 'BANK_ENTRY' && s.phase === 'bank'
      && s.guardThreat.state === 'drawing';
  }, null, { timeout: 180000, polling: 500 });
  state = await snapshot();
  check('missing the guard window restarts at the bank threshold with a fresh threat',
    state.guardFailures === 1 && state.phase === 'bank' && state.guardThreat.remaining > 2.3,
    JSON.stringify(state.guardThreat));

  await page.keyboard.press('Digit1');
  /* Retry the shot: the guard's window keeps expiring and restarting while the
   * harness is between frames, so take the shot on a window we know is open. */
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.waitForFunction(() => {
      const s = window.__heistDebug.snapshot().guardThreat;
      return s.state === 'drawing' && s.remaining > 1.4;
    }, null, { timeout: 180000, polling: 400 });
    await pose('bank_guard');
    await page.mouse.click(640, 360);
    await page.waitForTimeout(300);
    if ((await page.evaluate(() => window.__heistDebug.state)) === 'LOBBY_CONTROL') break;
  }
  await page.waitForFunction(() => window.__heistDebug.state === 'LOBBY_CONTROL', null, { timeout: 30000 });
  state = await snapshot();
  check('a real left-click ballistic hit neutralizes the guard and plays the requested Prospect line',
    state.guardThreat.state === 'neutralized'
      && state.voice.spoken.includes('prospect_counterstrike'),
    JSON.stringify({ threat: state.guardThreat, spoken: state.voice.spoken.slice(-6) }));

  /* ---- owner note: "if I shoot people nothing happens" ---- */
  const lobbyBefore = (await snapshot()).hostages;
  check('the lobby is a room full of people, not sixteen props',
    lobbyBefore.total === 22 && state.geometry.bankCivilians === 22,
    JSON.stringify(lobbyBefore));

  /* ---- the hostage loop, one verb at a time, by real input ---- */
  await page.evaluate(() => window.__heistDebug.aimAt('hostage_2'));
  await waitForTarget('bank-civilian-2');
  await page.waitForFunction(() => {
    const s = window.__heistDebug.snapshot();
    return s.hostageStates[1] === 'pleading'
      && s.voice.spoken.some((id) => id.startsWith('hostage_plead'));
  }, null, { timeout: 120000, polling: 300 });
  state = await snapshot();
  check('aiming at somebody makes them react to the muzzle before anything is fired',
    state.hostageStates[1] === 'pleading'
      && state.hostagePoses[1] === 'pleading'
      && state.voice.spoken.some((id) => id.startsWith('hostage_plead')),
    JSON.stringify({
      state: state.hostageStates[1], pose: state.hostagePoses[1],
      spoken: state.voice.spoken.slice(-4),
    }));
  const hostagePrompt = await promptText();
  /* Every entry is `KEY — verb`, which is the owner's own wording: *"prompts
   * must clearly say E — to the ground, hold E — tie up"*. This assertion was
   * left behind when the prompt was rewritten to satisfy that, and still
   * demanded the old "F REASSURE · G TAKE · ZIP-TIE" phrasing — so it failed
   * on a string that is correct. It checks the KEY AND THE VERB of all four
   * now, which is the thing the note was actually about. */
  const advertises = (pattern) => pattern.test(hostagePrompt ?? '');
  check('the person under the crosshair advertises all four verbs, each with its key',
    advertises(/E — (?:to the ground|keep them down)/)
      && advertises(/HOLD E — (?:tie up|no ties left)/)
      && advertises(/F — talk them down/)
      && advertises(/G — take what they have/),
    String(hostagePrompt));
  await shot('04b-hostage-pleading');

  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => {
    const s = window.__heistDebug.snapshot().voice.spoken;
    return s.some((id) => id.startsWith('hostage_reassured'));
  }, null, { timeout: 60000, polling: 300 }).catch(() => {});
  state = await snapshot();
  check('F reassures the person you are aiming at, and they answer',
    state.voice.spoken.some((id) => id.startsWith('prospect_reassure'))
      && state.voice.spoken.some((id) => id.startsWith('hostage_reassured')),
    JSON.stringify(state.voice.spoken.slice(-6)));

  for (let attempt = 0; attempt < 6; attempt++) {
    if ((await snapshot()).hostageStates[1] === 'prone') break;
    await waitForTarget('bank-civilian-2');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
  }
  state = await snapshot();
  check('tapping E puts them on their knees and then flat on the floor',
    state.hostageStates[1] === 'prone' && state.hostagePoses[1] === 'prone',
    JSON.stringify({ state: state.hostageStates[1], pose: state.hostagePoses[1] }));

  const tiesBefore = state.inventory.zipTies;
  await holdE(() => window.__heistDebug.snapshot().hostageStates[1] === 'restrained');
  state = await snapshot();
  check('holding E zip-ties them, spends a tie, and the pose changes to match',
    state.hostageStates[1] === 'restrained'
      && state.hostagePoses[1] === 'restrained'
      && state.inventory.zipTies === tiesBefore - 1
      && state.hostages.restrained >= 1,
    JSON.stringify({ ties: state.inventory.zipTies, hostages: state.hostages }));

  await page.evaluate(() => window.__heistDebug.aimAt('hostage_4'));
  await waitForTarget('bank-civilian-4');
  await page.waitForFunction(() => window.__heistDebug.snapshot().hostageStates[3] === 'pleading',
    null, { timeout: 60000, polling: 300 });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(900);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(900);
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await snapshot()).hostages.robbed >= 1) break;
    await page.keyboard.press('KeyG');
    await page.waitForTimeout(900);
  }
  state = await snapshot();
  check('G takes what somebody has on them, and the crew says so',
    state.hostages.robbed >= 1
      && state.hostages.personalCashTaken > 0
      && state.objective.hostagesRobbed >= 1
      && state.objective.followedSnow === false
      && state.voice.spoken.includes('prospect_demand'),
    JSON.stringify({ hostages: state.hostages, spoken: state.voice.spoken.slice(-6) }));
  check('cash taken off a customer is booked as compromised, not as take',
    state.bags.compromisedCash >= state.hostages.personalCashTaken,
    JSON.stringify(state.bags));

  const lobbyLine = await page.locator('#lobby-readout').textContent();
  check('the objective spine is on screen while it can still be changed',
    /\/ 22 DOWN/.test(lobbyLine ?? '')
      && /TIES/.test(lobbyLine ?? '')
      && /NOBODY HURT/.test(lobbyLine ?? ''),
    String(lobbyLine));

  /* ---- a civilian casualty is permanent, visible, and costs the verdict ---- */
  const beforeCasualty = await snapshot();
  await page.evaluate(() => window.__heistDebug.shootHostage('hostage_7'));
  await page.waitForTimeout(250);
  state = await snapshot();
  check('a round into a customer drops them, is counted, and loses fire discipline',
    state.objective.civilianCasualties === beforeCasualty.objective.civilianCasualties + 1
      && state.hostageStates[6] === 'down'
      && state.hostagePoses[6] === 'fallen'
      && state.objective.disciplinedFire === false
      && state.objective.civiliansSafe === 21
      && state.objective.grade === 'costly_success',
    JSON.stringify(state.objective));
  const casualtyLine = await page.locator('#lobby-readout .casualties').textContent();
  check('the casualty count is on the HUD the moment it happens',
    /1 CIVILIAN DOWN/.test(casualtyLine ?? ''), String(casualtyLine));

  await use('bank-crowd');
  state = await snapshot();
  check('the room-wide order still exists and puts everybody who is left on the floor',
    state.hostages.controlled >= 20 && new Set(state.hostagePoses).size >= 3,
    JSON.stringify({ controlled: state.hostages.controlled, poses: [...new Set(state.hostagePoses)] }));
  await pose('bank_lobby');
  await shot('04-bank-lobby');
  await use('bank-rear-guard');
  await use('bank-manager');
  const managerStart = (await snapshot()).managerPosition;
  await page.waitForFunction(() => window.__heistDebug.snapshot().managerEscortProgress >= 1, null, { timeout: 180000, polling: 500 });
  state = await snapshot();
  check('bank-secured checkpoint records the real casualty count while the manager walks',
    state.checkpoint === 'bank_secured'
      && state.campaignMission.civiliansHarmed === 1
      && Math.hypot(state.managerPosition[0] - managerStart[0], state.managerPosition[2] - managerStart[2]) > 4,
    JSON.stringify({ harmed: state.campaignMission.civiliansHarmed, start: managerStart, end: state.managerPosition }));
  await use('vault-door');
  await use('vault-door');
  await pose('bank_vault');
  await shot('05-vault');
  /* THE CASH GOES ON THE CIRCLE, NOT ON THE WINDOW.
   *
   * These four calls used to be `cash-1`, `bank-exit`, `cash-2`, `bank-exit`
   * — because the staging interaction lived on `bank-exit`, the pane of glass
   * in the doorway 1.9 m off the floor. Owner: *"The staging point should be
   * clearly marked near the bank door. like a yellow circle maybe. lkets make
   * sure the money bags appear there as duffle bags as you stage them."*
   * It is a painted circle with an interaction volume standing on it now, and
   * the duffles arrive on it one per bag. */
  await use('cash-1');
  await use('cash-staging-volume');
  const stagedOne = await page.evaluate(() => window.__heistDebug.snapshot().staging);
  check('the first cash bag lands on the marked circle as a visible duffle',
    stagedOne?.staged === 1 && stagedOne.duffles === 1 && stagedOne.vaultBagsLeft === 7,
    JSON.stringify(stagedOne));
  await use('cash-2');
  await use('cash-staging-volume');
  const stagedAll = await page.evaluate(() => window.__heistDebug.snapshot().staging);
  check('two by hand and the crew bring the rest, and all eight are on the floor',
    stagedAll?.staged === 8 && stagedAll.duffles === 8 && stagedAll.vaultBagsLeft === 0,
    JSON.stringify(stagedAll));
  /* THE WAY OUT, proved through the crosshair rather than through the handler.
   *
   * This line used to be a bare `use('bank-exit')`, which looks the descriptor
   * up by name and calls its onUse directly -- it never casts a ray, so it
   * passed happily on a door the player could not aim at. That is exactly how
   * the mission shipped hard-blocked after the cash: the glass pane sat four
   * centimetres inside the solid entrance slab and never once won the
   * interaction ray. Acquire it the way a player does, then press the key. */
  const exitApproach = await page.evaluate(
    () => window.__heistDebug.approachInteraction('bank-exit-volume'),
  );
  check('the way out of the bank can actually be aimed at from the lobby floor',
    exitApproach.ok === true, JSON.stringify(exitApproach));
  if (!exitApproach.ok) throw new Error(`bank exit approach: ${JSON.stringify(exitApproach)}`);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__heistDebug.snapshot().phase === 'street',
    null, { timeout: 60000 });

  state = await snapshot();
  const policeBeforeFailure = state.policeTotal;
  check('street contact spawns a bounded first wave of modelled officers',
    state.phase === 'street' && state.checkpoint === 'street_withdrawal'
      && state.policeActive > 0 && state.policeActive <= 8
      && state.scale.police.every((height) => height >= 1.7 && height <= 1.9),
    JSON.stringify({ active: state.policeActive, total: state.policeTotal, heights: state.scale.police }));
  await page.evaluate(() => window.__heistDebug.poseForEvidence('bank_exit'));
  await shot('06-bank-exit');
  await page.evaluate(() => window.__heistDebug.poseForEvidence('downtown_firefight'));
  await shot('07-downtown-firefight');
  await page.evaluate(() => window.__heistDebug.fail('browser_restore_probe'));
  await page.waitForFunction(() => window.__heistDebug.state === 'STREET_BLOCK_ONE', null, { timeout: 60000, polling: 400 });
  state = await snapshot();
  check('failure tears down and rebuilds the checkpoint police wave',
    state.policeTotal === policeBeforeFailure && state.policeActive === policeBeforeFailure,
    JSON.stringify({ before: policeBeforeFailure, after: state.policeTotal }));

  /* ---- owner note: "Everyones just standing ther ... the cops have spawned
   * behind me instead of infront of me" ---- */
  state = await snapshot();
  const contactRanges = state.policeMovement.map((officer) => officer.range);
  check('the opening contact is down the street in front of the player, not behind him',
    state.policeMovement.length > 0
      && state.policeMovement.every((officer) => officer.position[1] < 30)
      && contactRanges.every((range) => range > 4),
    JSON.stringify(state.policeMovement));

  /* Let the block run for a few seconds of real frames and watch it CLOSE.
   * Nothing in this scene ever moved an officer before this pass: he was
   * spawned at a coordinate, called `figure.aiming()`, and stood on it. */
  const opening = new Map(state.policeMovement.map((o) => [o.id, o.range]));
  await page.waitForFunction(() => {
    const officers = window.__heistDebug.snapshot().policeMovement;
    return officers.some((officer) => officer.mode === 'bound' && officer.speed > 0.4);
  }, null, { timeout: 90000, polling: 250 });
  check('officers bound between fire positions instead of standing where they spawned', true);
  await page.waitForFunction((before) => {
    const officers = window.__heistDebug.snapshot().policeMovement;
    return officers.filter((officer) => (before[officer.id] ?? 0) - officer.range > 2).length >= 1;
  }, Object.fromEntries(opening), { timeout: 120000, polling: 400 });
  state = await snapshot();
  const closed = state.policeMovement
    .filter((officer) => (opening.get(officer.id) ?? 0) - officer.range > 2);
  check('the block closes on the player and holds a standoff rather than piling on',
    closed.length >= 1 && state.policeMovement.every((officer) => officer.range > 3.5),
    JSON.stringify({ closed: closed.map((o) => o.id), live: state.policeMovement }));
  check('the block costs more than two officers, so it is a fight and not a turnstile',
    state.officersNeeded >= 4, JSON.stringify({ needed: state.officersNeeded }));

  await page.evaluate(() => window.__heistDebug.neutralizePolice());
  await use('street-start');
  await use('disabled-van');
  await use('dropped-bag');
  await page.evaluate(() => window.__heistDebug.neutralizePolice());
  await use('garage-entry');
  await shot('08-mercer-garage');
  await pose('garage_transfer');
  state = await snapshot();
  const garageTransfer = state.geometry.evidence.garageTransfer;
  check('garage transfer evidence frames the escape sedan, marked bay, and lit tool cart',
    state.evidenceFrame?.name === 'garage_transfer'
      && state.evidenceFrame.focus.length === 3
      && state.evidenceFrame.focus.every((item) => item.present && item.inFrame)
      && garageTransfer.transferZone
      && garageTransfer.sedan
      && garageTransfer.toolCart
      && garageTransfer.taskLight,
    JSON.stringify({ frame: state.evidenceFrame, garageTransfer }));
  await shot('08b-garage-transfer');
  await page.evaluate(() => window.__heistDebug.neutralizePolice());
  await use('garage-hold');
  await use('garage-hold');
  await use('sedan-trunk');
  await use('driver-door');
  state = await snapshot();
  check('the player takes the wheel with cash physically loaded',
    state.state === 'PLAYER_TAKES_WHEEL' && state.bags.recoveredBags >= 8);

  /* ---- owner note: "the instructions tell you to go left but the road is right" ---- */
  const plan = await page.evaluate(() => window.__heistDebug.routePlan());
  check('the drive is six authored junctions in the order the calls give them',
    plan.map((node) => node.id).join(',')
      === 'garage_left,warehouse_left,tower_right,roadblock,canal_turn,industrial_swap'
      && plan.map((node) => node.turn).join(',') === 'left,left,right,straight,left,stop',
    JSON.stringify(plan.map((node) => `${node.id}:${node.turn}`)));
  check('every junction label names the direction the road actually turns',
    plan.every((node) => (node.turn === 'left' ? node.label.startsWith('LEFT') : true))
      && plan.every((node) => (node.turn === 'right' ? node.label.startsWith('RIGHT') : true)),
    JSON.stringify(plan.map((node) => node.label)));
  const routeLabel = await page.locator('#route').textContent();
  check('the drive opens on the first instruction rather than a stale caption',
    routeLabel === plan[0].label, String(routeLabel));

  /* Owner: "I would like the car to be able to go a little bit faster, so
   * like at least 90" and "engine sounds are bad." Measure both claims in the
   * live checkpoint: real W/A/Space input drives the same GroundVehicle and
   * the returned mix comes from AudioEngine's active loop handles. */
  await measureEscapeVehicle(page);
  await shot('09-player-driving');

  /* ---- owner note: "do blocked roads so you just have to stay on the road" ---- */
  const HEADINGS = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };
  const TURNED = {
    N: { left: 'E', right: 'W' }, E: { left: 'S', right: 'N' },
    S: { left: 'W', right: 'E' }, W: { left: 'N', right: 'S' },
  };
  const barrierResults = [];
  for (const node of plan.slice(0, 5)) {
    const wrong = node.turn === 'straight'
      ? TURNED[node.heading].left
      : TURNED[node.heading][node.turn === 'left' ? 'right' : 'left'];
    await page.evaluate(([x, z, heading]) => window.__heistDebug.placeCar(x, z, heading),
      [node.x, node.z, HEADINGS[wrong]]);
    const run = await page.evaluate(() => window.__heistDebug.simulateDriving(3.2));
    const travelled = Math.hypot(run.x - node.x, run.z - node.z);
    barrierResults.push({ node: node.id, wrong, travelled: Number(travelled.toFixed(1)) });
  }
  check('every wrong turn out of a junction runs into something within 30 m',
    barrierResults.every((entry) => entry.travelled < 30),
    JSON.stringify(barrierResults));

  await page.evaluate(() => window.__heistDebug
    .placeCar(-480, 22, 0, { resetRoute: true, resetDamage: true }));
  const routeStates = [];
  for (let i = 0; i < 6; i++) {
    routeStates.push(await page.evaluate(() => window.__heistDebug.driveToNextNode()));
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => window.__heistDebug.state === 'VEHICLE_SWAP',
    null, { timeout: 30000, polling: 300 });
  state = await snapshot();
  check('the authored drive crosses every turn, the roadblock, and the canal node',
    routeStates.map((entry) => entry.node).join(',')
      === 'garage_left,warehouse_left,tower_right,roadblock,canal_turn,industrial_swap'
      && state.state === 'VEHICLE_SWAP',
    JSON.stringify({ nodes: routeStates.map((entry) => entry.node), state: state.state }));
  check('the fixed-step vehicle carries roadblock damage into the swap',
    state.vehicle.collisionDamage > 0 && state.vehicle.lastStableNode === 'industrial_swap',
    JSON.stringify({ damage: state.vehicle.collisionDamage, node: state.vehicle.lastStableNode }));

  const swapObjective = async () => page.evaluate(() => (
    [...document.querySelectorAll('#objectives .olist li')].map((li) => ({
      text: li.textContent?.trim() ?? '',
      done: li.classList.contains('done'),
      current: li.classList.contains('now'),
    }))
  ));
  const openingSwapObjective = await swapObjective();
  check('the swap starts on one actionable 0/7 step without spoiling the other six',
    openingSwapObjective.length === 1
      && /0\/7/.test(openingSwapObjective[0].text)
      && /Open the clean car.s trunk/i.test(openingSwapObjective[0].text)
      && openingSwapObjective[0].current,
    JSON.stringify(openingSwapObjective));

  /* ---- owner note: "If you make it to the end you lose the cops too" ---- */
  await page.waitForFunction(
    () => window.__heistDebug.snapshot().voice.spoken.includes('snow_lost_them'),
    null, { timeout: 60000, polling: 300 },
  ).catch(() => {});
  state = await snapshot();
  check('reaching the swap loses the pursuit, on screen and out loud',
    state.vehicle.pursuitVisible === false
      && state.voice.spoken.includes('snow_lost_them'),
    JSON.stringify({ visible: state.vehicle.pursuitVisible, spoken: state.voice.spoken.slice(-5) }));
  await page.evaluate(() => window.__heistDebug.poseForEvidence('vehicle_swap'));
  await shot('10-vehicle-swap');
  await pose('vehicle_swap_workbench');
  state = await snapshot();
  const swapWorkbench = state.geometry.evidence.vehicleSwapWorkbench;
  check('vehicle-swap evidence frames the workbench, sorting tarp, and cleanup tools',
    state.evidenceFrame?.name === 'vehicle_swap_workbench'
      && state.evidenceFrame.focus.length === 4
      && state.evidenceFrame.focus.every((item) => item.present && item.inFrame)
      && swapWorkbench.workbench
      && swapWorkbench.sortingTarp
      && swapWorkbench.cleanCarBay
      && swapWorkbench.taskLights === 2,
    JSON.stringify({ frame: state.evidenceFrame, swapWorkbench }));
  await shot('10b-vehicle-swap-workbench');

  /* AIMED AT, then pressed. `use()` calls the handler by name and casts no ray,
   * so this loop used to prove that eight handlers worked and nothing at all
   * about whether a player could aim at the eight props -- which is exactly the
   * check the walled-in bank exit shipped behind. `swap-depart` was the one
   * that was wrong: it is the prompt that leaves the swap in the clean car, and
   * it was a box buried inside the clean car's own body. */
  const swapAcquired = [];
  let sixOfSevenObjective = null;
  let completedSwapObjective = null;
  for (const target of [
    'swap-trunk', 'swap-bags', 'swap-aid', 'swap-masks',
    'swap-jackets', 'swap-weapons', 'swap-wipe', 'swap-depart',
  ]) {
    const approach = await page.evaluate(
      (name) => window.__heistDebug.approachInteraction(name), target,
    );
    swapAcquired.push({ target, ok: approach.ok === true, reason: approach.reason ?? null });
    await use(target);
    if (target === 'swap-weapons') sixOfSevenObjective = await swapObjective();
    if (target === 'swap-wipe') completedSwapObjective = await swapObjective();
  }
  check('every evidence prop at the swap is acquired by a real interaction ray',
    swapAcquired.every((entry) => entry.ok), JSON.stringify(swapAcquired));
  check('six completed actions collapse to the one 6/7 wipe step',
    sixOfSevenObjective?.length === 1
      && /6\/7/.test(sixOfSevenObjective[0].text)
      && /Wipe the dirty car/i.test(sixOfSevenObjective[0].text),
    JSON.stringify(sixOfSevenObjective));
  check('the completed 7/7 receipt remains beside the clean-car exit',
    completedSwapObjective?.length === 2
      && completedSwapObjective.some((row) => row.done && /7\/7/.test(row.text))
      && completedSwapObjective.some((row) => /Leave in the clean car/i.test(row.text)),
    JSON.stringify(completedSwapObjective));
  state = await snapshot();
  check('vehicle swap requires every evidence action before safehouse return',
    state.phase === 'safehouse' && Object.values(state.swap).every(Boolean)
      && state.checkpoint === 'vehicle_swap', JSON.stringify(state.swap));

  /* ---- owner note: "everyone is just waiting for me... not sure what the debrief is" ---- */
  const debriefSteps = [];
  /* STEP 1/4 IS ON RIPPINFLOW. It used to be on the plate-carrier stand, which
   * is the owner's *"Rippin's leg just re-arms armor"* -- see
   * `SAFEHOUSE_DEBRIEF_STEPS`. Posed at the man and held, through the real
   * crosshair, so the check would fail again if it wandered back onto a prop. */
  await page.evaluate(() => window.__heistDebug.poseForCrew('rippinflow'));
  await waitForTarget('crew-rippinflow');
  debriefSteps.push(await promptText());
  const armorBefore = (await snapshot()).presentation.armorVisible;
  await holdE(() => window.__heistDebug.state === 'FIRST_AID');
  const armorAfter = (await snapshot()).presentation.armorVisible;
  check('wrapping Rippin\u2019s leg is on Rippinflow and moves no armour',
    armorBefore === armorAfter && /1\/4/.test(debriefSteps[0] ?? ''),
    JSON.stringify({ prompt: debriefSteps[0], armorBefore, armorAfter }));
  debriefSteps.push(await pressAtPose('briefing', {
    target: 'briefing-map',
    until: () => window.__heistDebug.state === 'DEBRIEF',
  }));
  await page.waitForTimeout(400);
  state = await snapshot();
  const boardText = await page.locator('#debrief-board').textContent();
  check('the debrief is a numbered sequence with its steps on the HUD',
    debriefSteps.every((label) => /\d\/4/.test(label ?? '')),
    JSON.stringify(debriefSteps));
  check('the debrief board states both objective numbers and a verdict in the room',
    !(await page.locator('#debrief-board').evaluate((el) => el.classList.contains('hidden')))
      && /Civilians out alive/.test(boardText ?? '')
      && /21 \/ 22/.test(boardText ?? '')
      && /Vault bags recovered/.test(boardText ?? '')
      && /Taken off customers/.test(boardText ?? '')
      && /COSTLY SUCCESS/.test(boardText ?? ''),
    String(boardText).replace(/\s+/g, ' ').slice(0, 240));
  /* Spoken OR still sequenced: a seventeen-line debrief is a minute of speech,
   * and the point of the check is that none of it is dropped. The old bank
   * pushed all of it in one frame into a four-deep queue and lost ten lines. */
  const debriefSaid = [...state.voice.spoken, ...state.voice.queued];
  check('the whole debrief is scheduled — nothing is dropped on the floor',
    debriefSaid.includes('shubes_signature_cleanup')
      && debriefSaid.includes('snow_good')
      && debriefSaid.includes('prospect_debrief')
      && state.voice.queued.length + state.voice.spoken.length > 0,
    JSON.stringify(state.voice.queued));
  check('Big Uncle Lou frames the debrief and says both objective numbers back',
    debriefSaid.includes('lou_debrief_open')
      && debriefSaid.includes('lou_debrief_people_dirty')
      && debriefSaid.some((id) => id.startsWith('lou_debrief_money'))
      && debriefSaid.includes('lou_debrief_souvenirs')
      && debriefSaid.includes('lou_debrief_verdict_bad'),
    JSON.stringify(debriefSaid.filter((id) => id.startsWith('lou_'))));
  const louRadioScheduled = new Set([
    ...state.voice.spoken,
    ...state.voice.busQueued,
    state.voice.busCurrent,
    ...state.voice.commandBacklog,
  ].filter(Boolean));
  check('Lou is on the job as well as at the end of it',
    ['lou_radio_open', 'lou_radio_lobby', 'lou_radio_vault', 'lou_radio_street']
      .every((id) => louRadioScheduled.has(id)),
    JSON.stringify({
      spoken: state.voice.spoken.filter((id) => id.startsWith('lou_radio')),
      current: state.voice.busCurrent,
      queued: state.voice.busQueued.filter((id) => id.startsWith('lou_radio')),
      backlog: state.voice.commandBacklog.filter((id) => id.startsWith('lou_radio')),
    }));
  await shot('11-safehouse-money-count');
  await use('safehouse-loadout');
  await use('van-door');
  await page.waitForFunction(() => window.__heistDebug.snapshot().missionCompleted, null, { timeout: 60000, polling: 400 });
  state = await snapshot();
  check('THE TAKE completes and writes an honest verdict into the campaign',
    state.state === 'SCENE_COMPLETE'
      && state.campaignMission.status === 'complete'
      && state.campaignMission.outcome === 'costly_success'
      && state.campaignMission.disciplinedFire === false
      && state.campaignMission.followedSnow === false
      && state.campaignMission.civiliansHarmed === 1,
    JSON.stringify({
      outcome: state.campaignMission.outcome,
      disciplined: state.campaignMission.disciplinedFire,
      followed: state.campaignMission.followedSnow,
      harmed: state.campaignMission.civiliansHarmed,
    }));
  const cardText = await page.locator('#mission-card').textContent();
  check('the end card reads people first, money second, then the settlement',
    /Civilians out alive/.test(cardText ?? '')
      && (cardText ?? '').indexOf('Civilians out alive') < (cardText ?? '').indexOf('Vault bags recovered')
      && /COSTLY SUCCESS/.test(cardText ?? '')
      && /Compromised cash/.test(cardText ?? ''),
    String(cardText).replace(/\s+/g, ' ').slice(0, 220));
  check('preview play leaves canonical localStorage byte-for-byte untouched',
    await page.evaluate((value) => localStorage.getItem('squatchlife.campaign') === value, SENTINEL));

  const apartmentState = structuredClone(state.campaignState);
  apartmentState.scene = { id: 'apartment', spawn: 'front_door' };
  await page.evaluate((saved) => {
    localStorage.setItem('squatchlife.campaign', JSON.stringify(saved));
  }, apartmentState);
  const returnControl = page.locator('#return-home');
  const returnBox = await returnControl.boundingBox();
  check('the completion return control is visible inside the playable viewport',
    await returnControl.isVisible()
      && returnBox?.x >= 0 && returnBox?.y >= 0
      && returnBox.x + returnBox.width <= 1280
      && returnBox.y + returnBox.height <= 720,
    JSON.stringify(returnBox));
  await page.evaluate(() => document.getElementById('return-home').click());
  await page.waitForURL(/\/index\.html(?:\?|$)/, { timeout: 20000 });
  check('the completion card return control navigates to the apartment',
    new URL(page.url()).pathname.endsWith('/index.html'), page.url());

  /* The preview router correctly preserves `?preview=1`; remove that testing
   * isolation flag in the same tab so the seeded completed campaign becomes
   * the production Apartment state we are validating below. */
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  const apartmentPage = page;
  await apartmentPage.waitForFunction(() => window.__squatch?.apartment?.dressing, null, { timeout: 120000 });
  let apartment = await apartmentPage.evaluate(() => ({
    prep: ['heistArmor', 'heistGloves', 'heistMask', 'heistCarbine', 'heistSidearm', 'heistMagazines', 'heistDuffel']
      .map((id) => window.__squatch.apartment.dressing.get(id).group.visible),
    cleanup: ['heistWash', 'heistChange', 'heistGearSecured']
      .map((id) => window.__squatch.apartment.dressing.get(id).group.visible),
    targets: window.__squatch.interaction.targets.map((target) => target.name),
  }));
  /* The dressing's interaction targets carry a `dress:` prefix on their names
   * — `src/world/dressing.js` builds every one of them as `group('dress:' +
   * id)` — while the dressing MAP is still keyed by the bare id. This lookup
   * only ever knew the bare form, so it failed on a flat that was dressed
   * correctly, and the follow-up `find()` below returned undefined and threw.
   * Accepts either spelling rather than pinning one. */
  const dressed = (id) => apartment.targets.includes(id) || apartment.targets.includes(`dress:${id}`);
  check('post-heist apartment hides packed gear and exposes three physical cleanup stations',
    apartment.prep.every((visible) => !visible)
      && apartment.cleanup.every(Boolean)
      && ['heistWash', 'heistChange', 'heistGearSecured'].every(dressed),
    JSON.stringify(apartment));
  const apartmentStartAt = Date.now();
  await apartmentPage.evaluate(() => document.getElementById('start-btn').click());
  let apartmentAudio = null;
  for (let elapsed = 0; elapsed < 120 && !apartmentAudio?.started; elapsed++) {
    await apartmentPage.waitForTimeout(1000);
    apartmentAudio = await apartmentPage.evaluate(() => ({
      started: window.__squatch?.game?.started === true,
      buffers: window.__squatch?.audio?.buffers?.size ?? 0,
      loaded: window.__squatch?.audio?.loadedCount ?? 0,
      context: window.__squatch?.audio?.ctx?.state ?? null,
    }));
  }
  apartmentAudio.elapsedMs = Date.now() - apartmentStartAt;
  /* 150 s rather than the Apartment's own 30 s budget: the same start gate,
   * measured through a software rasteriser running at about one frame a
   * second. This bound is about the harness, not about the Apartment. */
  check('post-heist Apartment completes its recorded-audio start gate',
    apartmentAudio.started && apartmentAudio.elapsedMs <= 150000,
    JSON.stringify(apartmentAudio));
  if (!apartmentAudio.started) throw new Error(`Apartment audio start stalled: ${JSON.stringify(apartmentAudio)}`);
  await apartmentPage.evaluate(() => {
    for (const name of ['heistWash', 'heistChange', 'heistGearSecured']) {
      // Either spelling — see the `dress:` note above.
      const target = window.__squatch.interaction.targets
        .find((item) => item.name === name || item.name === `dress:${name}`);
      if (!target) throw new Error(`no cleanup station named ${name} or dress:${name}`);
      target.userData.interact.onUse(target);
    }
  });
  apartment = await apartmentPage.evaluate(() => ({
    cleanupComplete: window.__squatch.campaign.state.missions.bank_heist.cleanupComplete,
    visible: ['heistWash', 'heistChange', 'heistGearSecured']
      .map((id) => window.__squatch.apartment.dressing.get(id).group.visible),
    door: window.__squatch.apartmentStory.tryLeave(window.__squatch.activityContext()),
  }));
  check('physical cleanup persists and the post-job night correctly requires sleep',
    apartment.cleanupComplete
      && apartment.visible.every((visible) => !visible)
      && apartment.door.kind === 'stay'
      && apartment.door.id === 'sleep_before_the_course',
    JSON.stringify(apartment));
  await apartmentPage.screenshot({ path: path.join(SHOTS, '13-apartment-cleanup-complete.png') });
  await apartmentPage.close();

  /* ---- a clean run, to prove the good ending is reachable ---- */
  const cleanPage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  cleanPage.on('pageerror', (error) => problems.push(`clean: ${error.message}`));
  await cleanPage.addInitScript((value) => {
    localStorage.setItem('squatchlife.campaign', value);
  }, SENTINEL);
  await cleanPage.goto(`http://localhost:${PORT}/heist.html?preview=1&checkpoint=safehouse_debrief`, { waitUntil: 'load' });
  await cleanPage.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 60000 });
  await cleanPage.evaluate(() => document.getElementById('start').click());
  await cleanPage.waitForFunction(() => window.__heistDebug.snapshot().phase === 'safehouse', null, { timeout: 60000 });
  const cleanState = await cleanPage.evaluate(() => {
    const snap = window.__heistDebug.snapshot();
    return { grade: snap.objective.grade, scorecard: snap.objective.scorecard };
  });
  check('a run with nobody hurt and nothing taken off a customer grades professional',
    cleanState.grade === 'professional'
      && cleanState.scorecard.every((row) => row.good),
    JSON.stringify(cleanState));
  await cleanPage.close();

  /* This focused story is also independently runnable with
   * HEIST_MANAGER_ONLY=1 for a fast RED/GREEN loop. */
  await verifyManagerAndActorRecovery();
  await verifyPoliceCombatAndRecycle();

  const resumeCases = [
    ['safehouse_ready', 'VAN_APPROACH', 'van'],
    ['bank_secured', 'MANAGER_ESCORT', 'bank'],
    ['vault_open', 'CASH_LOADING', 'bank'],
    ['street_withdrawal', 'STREET_BLOCK_ONE', 'street'],
    ['mercer_garage', 'GARAGE_HOLD', 'garage'],
    ['vehicle_swap', 'SAFEHOUSE_RETURN', 'safehouse'],
  ];
  let resumed = 0;
  for (const [checkpointId, expectedState, expectedPhase] of resumeCases) {
    const saved = structuredClone(apartmentState);
    saved.scene = { id: 'bank_heist', spawn: 'safehouse' };
    saved.story.chapter = 'heist_day';
    saved.missions.bank_heist.status = 'in_progress';
    saved.missions.bank_heist.checkpoint = checkpointId;
    saved.missions.bank_heist.outcome = null;
    saved.missions.initiation.status = 'locked';
    const resumePage = await browser.newPage({ viewport: { width: 960, height: 540 } });
    resumePage.on('pageerror', (error) => problems.push(`resume:${checkpointId}: ${error.message}`));
    await resumePage.addInitScript((record) => {
      localStorage.setItem('squatchlife.campaign', JSON.stringify(record));
    }, saved);
    await resumePage.goto(`http://localhost:${PORT}/heist.html`, { waitUntil: 'load' });
    await resumePage.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 60000 });
    await resumePage.evaluate(() => document.getElementById('start').click());
    await resumePage.waitForFunction(([stateName, phaseName]) => {
      const s = window.__heistDebug?.snapshot();
      return s?.state === stateName && s?.phase === phaseName;
    }, [expectedState, expectedPhase], { timeout: 60000 });
    let resumedState = await resumePage.evaluate(() => window.__heistDebug.snapshot());
    const initialOk = resumedState.checkpoint === checkpointId
      && resumedState.geometry.colliders > 0
      && resumedState.geometry.floorZones > 0
      && (expectedPhase !== 'bank' || resumedState.inventory.maskWorn === true);
    await resumePage.evaluate(() => window.__heistDebug.fail('reload_recovery_probe'));
    await resumePage.waitForFunction(() => window.__heistDebug.state === 'FAILED', null, { timeout: 30000 });
    await resumePage.waitForFunction((stateName) => window.__heistDebug.state === stateName,
      expectedState, { timeout: 60000 });
    resumedState = await resumePage.evaluate(() => window.__heistDebug.snapshot());
    if (initialOk && resumedState.checkpoint === checkpointId) resumed++;
    else console.log(`    resume ${checkpointId} failed: ${JSON.stringify({ initialOk, checkpoint: resumedState.checkpoint })}`);
    await resumePage.close();
  }
  check('save/load and failure recovery rebuild every durable heist checkpoint',
    resumed === resumeCases.length, `${resumed}/${resumeCases.length}`);
  check('browser completed without page, console, or request failures', problems.length === 0,
    problems.join(' | ').slice(0, 600));
  }
} catch (error) {
  if (error !== INPUT_ONLY_COMPLETE) throw error;
} finally {
  if (inputOnlyDeadline) clearTimeout(inputOnlyDeadline);
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length} THE TAKE verification check(s) failed.`);
  process.exit(1);
}
console.log(`\nTHE TAKE browser verification passed (${results.length} checks).`);
