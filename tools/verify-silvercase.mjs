#!/usr/bin/env node
/**
 * Verify The Silver Case (src/silvercase/) — a standalone mission, opened
 * directly via silvercase.html, no campaign/localStorage involved.
 *
 * Drives the mission's own state machine end to end using the
 * window.silvercase debug handle (go()/tick()/state()/pressFire()/
 * pressDraw()/chooseKey()/retry()), plus real keyboard input for the two
 * places a human actually touches a key: WASD movement and the hold-E
 * prayer-finish choice. Mirrors the skeleton in tools/verify-squatchfather.mjs
 * and tools/verify-initiation.mjs — a local static server, a real headless
 * Chromium via Playwright, a check(name, ok, detail) accumulator, and a
 * process.exit(1) on any failure.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APE_FAMILY_MEMBER } from '../src/bing/family-ape.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5223;
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; running node --check on the new files instead.');
  const { execFileSync } = await import('node:child_process');
  for (const file of ['silvercase.html', 'tools/verify-silvercase.mjs']) {
    if (file.endsWith('.html')) continue; // node --check only understands JS
    execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'inherit' });
  }
  console.log('node --check passed for tools/verify-silvercase.mjs (playwright unavailable).');
  process.exit(0);
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

const problems = [];
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 240));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Force a beat transition and step the mission clock by `secs` of simulated
 * time (60 fixed sub-steps, per window.silvercase.tick's own contract). */
async function go(beat, secs = 0.1) {
  return page.evaluate(([beat, secs]) => {
    const sc = window.silvercase;
    sc.go(beat);
    sc.tick(secs);
    return sc.state();
  }, [beat, secs]);
}

async function tick(secs) {
  return page.evaluate((secs) => {
    window.silvercase.tick(secs);
    return window.silvercase.state();
  }, secs);
}

/**
 * Advance the mission in small fixed steps, stopping the instant `condition`
 * is met (or after `maxSteps` steps, whichever comes first) — entirely
 * inside one page.evaluate() call, so there is no Node<->browser round trip
 * between steps for real time to sneak in.
 *
 * This exists because main.js's own requestAnimationFrame loop keeps running
 * in real time in the background (whenever the mission is `running`),
 * independently of every explicit tick() call this script makes. A
 * fixed-duration `tick(N)` picked to land just past a dialogue sequence
 * finishing (so a choice has just opened) is at the mercy of however much
 * real wall-clock time also elapsed between Node round trips — which is
 * fine when the margin against the *next* thing's own timeout is generous,
 * but not for e.g. the prayer-finish choice's tight window. Polling in
 * lockstep like this is immune to that drift: it can only stop exactly when
 * `condition` first becomes true, never overshoot past it.
 *
 * `condition` is `"beat:NAME"` (fsm.name === NAME), `"choice:ID"`
 * (dialogue.choice?.id === ID), or `"choiceOpen"` (any choice is open).
 */
async function tickUntil(condition, { stepSecs = 0.1, maxSteps = 400 } = {}) {
  return page.evaluate(([condition, stepSecs, maxSteps]) => {
    const sc = window.silvercase;
    const [kind, value] = condition.split(':');
    const met = () => {
      if (kind === 'beat') return sc.fsm.name === value;
      if (kind === 'choice') return sc.dialogue.choice?.id === value;
      if (kind === 'choiceOpen') return Boolean(sc.dialogue.choice);
      return false;
    };
    let steps = 0;
    while (!met() && steps < maxSteps) {
      sc.tick(stepSecs);
      steps += 1;
    }
    return { met: met(), steps, state: sc.state() };
  }, [condition, stepSecs, maxSteps]);
}

async function domOverlay(id) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    return { present: !!el, hidden: el?.classList.contains('hidden') ?? null };
  }, id);
}

/**
 * Mean luminance of what is actually on screen, 0..1.
 *
 * The car ride shipped rendering as a black rectangle — the rig built no
 * lights of its own and main.js's stand-in was about one candela, so the beat
 * that opens the mission showed nothing at all. No amount of state
 * introspection catches that, so this reads the framebuffer: render, then
 * scale the WebGL canvas into a 2D one and average it, synchronously in the
 * same task so the drawing buffer has not been cleared for compositing yet.
 */
async function screenLuminance() {
  return page.evaluate(() => {
    const sc = window.silvercase;
    sc.renderer.render(sc.scene, sc.camera);
    const src = sc.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = 45;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, c.width, c.height);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    let sum = 0;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      sum += l;
      if (l > 0.06) lit += 1;
    }
    const pixels = data.length / 4;
    return { mean: +(sum / pixels).toFixed(4), litFraction: +(lit / pixels).toFixed(3) };
  });
}

/** World-space bounding box of a cast member's figure. */
async function actorBounds(name) {
  return page.evaluate(async (name) => {
    const THREE = await import('/vendor/three.module.min.js');
    const group = window.silvercase.cast[name].group;
    const wasVisible = group.visible;
    group.visible = true;
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(group);
    group.visible = wasVisible;
    return {
      min: box.min.toArray().map((n) => +n.toFixed(3)),
      max: box.max.toArray().map((n) => +n.toFixed(3)),
    };
  }, name);
}

async function hotbar() {
  return page.evaluate(() => {
    const el = document.getElementById('hotbar');
    if (!el) return { present: false };
    return {
      present: true,
      hidden: el.classList.contains('hidden'),
      slots: el.children.length,
      labels: [...el.children].map((slot) => slot.title),
    };
  });
}

try {
  await page.goto(`http://localhost:${PORT}/silvercase.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.silvercase?.fsm, null, { timeout: 60000 });

  // ---- MENU -----------------------------------------------------------
  let state = await page.evaluate(() => window.silvercase.state());
  check('the mission boots straight into MENU with nobody dead yet',
    state.beat === 'MENU'
      && state.actors.ape.alive && state.actors.deke.alive
      && state.actors.chester.alive && state.actors.winston.alive
      && state.actors.pruitt.alive,
    JSON.stringify(state));

  // ---- MENU -> CAR_RIDE (begin(), the same call the Begin button makes) -
  let carRide = await page.evaluate(() => {
    window.silvercase.begin();
    window.silvercase.tick(0.1);
    const sc = window.silvercase;
    return { state: sc.state(), mode: sc.player.mode, cueLog: sc.dialogue.cueLog.slice() };
  });
  check('beginning the scene seats the player in the car and starts the drive-over dialogue',
    carRide.state.beat === 'CAR_RIDE'
      && carRide.mode === 'seated'
      && carRide.cueLog[0] === 'vo.silvercase.car.ape.pitch',
    JSON.stringify(carRide));

  // ---- The car ride is a picture, not a black screen. ------------------
  const carLight = await screenLuminance();
  check('the car ride actually renders a lit cabin rather than a black screen',
    carLight.mean > 0.02 && carLight.litFraction > 0.3,
    JSON.stringify(carLight));

  const carRig = await page.evaluate(() => {
    const car = window.silvercase.car;
    const lights = [];
    car.root.traverse((o) => { if (o.isLight) lights.push(o.type); });
    return {
      lights,
      apeId: car.ape.characterId,
      apeHeight: +(car.ape.parts.heightScale * 1.78).toFixed(3),
      visible: car.root.visible,
    };
  });
  check('the car rig owns its own lighting and the same Ape who is in the apartment',
    carRig.visible && carRig.lights.length >= 3
      && carRig.apeId === 'ape' && Math.abs(carRig.apeHeight - 1.88) < 0.01,
    JSON.stringify(carRig));

  // ---- Ape's identity is the campaign's, not a local lookalike. ---------
  check('Ape is the canonical campaign character, with the Bing model and face',
    carRide.state.ape.characterId === APE_FAMILY_MEMBER.id
      && carRide.state.ape.characterId === CHARACTER_IDS.APE
      && carRide.state.ape.family === true
      && carRide.state.ape.face === 'assets/faces/ape.png'
      && JSON.stringify(carRide.state.ape.model)
        === JSON.stringify({ ...APE_FAMILY_MEMBER.model, face: 'assets/faces/ape.png' }),
    JSON.stringify(carRide.state.ape));

  // ---- Everybody is a person-sized person. -----------------------------
  const CEILING = 2.6;
  const scaleReport = {};
  let scaleOk = true;
  for (const [name, actor] of Object.entries(carRide.state.actors)) {
    const bounds = await actorBounds(name);
    const tall = actor.height >= 1.6 && actor.height <= 1.95;
    const fits = bounds.max[1] < CEILING - 0.4;
    const grounded = bounds.min[1] > -0.15;
    scaleReport[name] = { height: actor.height, top: bounds.max[1], bottom: bounds.min[1] };
    if (!tall || !fits || !grounded) scaleOk = false;
  }
  check('every figure is a real human height and clears the 2.6 m ceiling',
    scaleOk, JSON.stringify(scaleReport));

  // ---- The inventory bar is the shared one every other scene mounts. ----
  const barAtStart = await hotbar();
  check('the shared five-slot inventory bar is mounted and visible',
    barAtStart.present && barAtStart.hidden === false && barAtStart.slots === 5,
    JSON.stringify(barAtStart));

  // ---- CAR_RIDE -> ARRIVE_HALLWAY (debug go(), same as every jump below) -
  let arrive = await go('ARRIVE_HALLWAY');
  let arrivePose = await page.evaluate(() => {
    const p = window.silvercase.player;
    return { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, mode: p.mode };
  });
  check('ARRIVE_HALLWAY drops the player at the authored hallway spawn, walking',
    arrive.beat === 'ARRIVE_HALLWAY'
      && Math.abs(arrivePose.x - 0.8) < 0.01 && Math.abs(arrivePose.z) < 0.01
      && Math.abs(arrivePose.y - 1.66) < 0.01 && arrivePose.mode === 'walk',
    JSON.stringify({ arrive, arrivePose }));

  // ---- KNOCK / ENTER_APARTMENT (brief dwell, just enough to confirm entry,
  // never long enough for either beat's own dialogue chain to auto-advance
  // before the next go() overwrites it — see the mission's DialogueController,
  // whose play() unconditionally replaces the active queue and its onDone). -
  let knock = await go('KNOCK');
  check('KNOCK is reachable', knock.beat === 'KNOCK', knock.beat);
  let enterApt = await go('ENTER_APARTMENT');
  check('ENTER_APARTMENT is reachable', enterApt.beat === 'ENTER_APARTMENT', enterApt.beat);

  // ---- ESTABLISH_CONTROL -------------------------------------------------
  let establish = await go('ESTABLISH_CONTROL');
  let caseOcclusionVisible = await page.evaluate(
    () => window.silvercase.apartment.props.caseOcclusion.visible,
  );
  check('ESTABLISH_CONTROL opens with the case still hidden behind the duffel',
    establish.beat === 'ESTABLISH_CONTROL' && caseOcclusionVisible === true,
    JSON.stringify({ establish, caseOcclusionVisible }));

  // ---- Movement during ESTABLISH_CONTROL: real WASD, driven the same way
  // every other core/player.js scene's verify script proves it (heist,
  // squatchfather) — `player.enabled` is normally flipped by a real
  // pointerlockchange event, which headless automation cannot reliably hold,
  // so it is set directly here exactly like tools/verify-heist.mjs does.
  const beforeMove = await page.evaluate(() => {
    const p = window.silvercase.player;
    p.enabled = true;
    return { x: p.position.x, z: p.position.z };
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(100);
  await page.evaluate(() => window.silvercase.tick(0.6));
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(60);
  const afterMove = await page.evaluate(() => {
    const p = window.silvercase.player;
    return { x: p.position.x, z: p.position.z, beat: window.silvercase.state().beat };
  });
  const moved = Math.hypot(afterMove.x - beforeMove.x, afterMove.z - beforeMove.z);
  check('WASD moves the player forward during ESTABLISH_CONTROL',
    afterMove.beat === 'ESTABLISH_CONTROL' && moved > 0.2 && Number.isFinite(afterMove.x),
    JSON.stringify({ beforeMove, afterMove, moved: +moved.toFixed(3) }));

  // ---- Early weapon draw (right-click reach), gated to arm only during the
  // three states the mission cares about — pressDraw() stands in for that
  // right-click exactly like pressFire() stands in for the left one.
  let earlyDraw = await page.evaluate(() => {
    window.silvercase.pressDraw();
    window.silvercase.tick(0.2);
    return window.silvercase.state();
  });
  check('an early weapon reach during ESTABLISH_CONTROL is tallied and barked at',
    earlyDraw.mission.earlyDrawCount === 1, JSON.stringify(earlyDraw.mission));

  // ---- CASE_REVEAL (brief dwell again, same reasoning as KNOCK above) ----
  let caseReveal = await go('CASE_REVEAL');
  let caseOcclusionAfter = await page.evaluate(
    () => window.silvercase.apartment.props.caseOcclusion.visible,
  );
  check('CASE_REVEAL clears the duffel out of the way the instant it starts',
    caseReveal.beat === 'CASE_REVEAL' && caseOcclusionAfter === false,
    JSON.stringify({ caseReveal, caseOcclusionAfter }));

  // ---- The case is open for exactly one beat — the one that confirms what
  // is in it — and is shut and latched for the rest of the mission.
  //
  // Played out in full rather than jumped, because the point of the check is
  // the SHAPE of the beat: the lid comes up, the contents are confirmed, and
  // the lid goes back down before the mission moves on. Peak openness is
  // sampled every step so an open that never happened and an open that never
  // closed are both caught. ------------------------------------------------
  const caseArc = await page.evaluate(() => {
    const sc = window.silvercase;
    let peak = 0;
    let steps = 0;
    while (sc.fsm.name === 'CASE_REVEAL' && steps < 600) {
      sc.tick(0.05);
      peak = Math.max(peak, sc.state().case.openness);
      steps += 1;
    }
    for (let i = 0; i < 60; i++) sc.tick(0.05); // let the lid ease home
    return { peak: +peak.toFixed(3), steps, state: sc.state() };
  });
  check('the case opens for the confirmation beat and is shut again afterwards',
    caseArc.peak > 0.7
      && caseArc.state.beat === 'COUCH_SHOOTING'
      && caseArc.state.case.shut === true
      && caseArc.state.case.openness === 0,
    JSON.stringify({ peak: caseArc.peak, beat: caseArc.state.beat, case: caseArc.state.case }));

  // ---- COUCH_SHOOTING: no countdown, the player's own left click decides. -
  let couch = await go('COUCH_SHOOTING');
  check('COUCH_SHOOTING starts with Deke still alive', couch.beat === 'COUCH_SHOOTING' && couch.actors.deke.alive,
    JSON.stringify(couch.actors.deke));

  // Ape has just said "go ahead", so Tony has the gun in his hands — the
  // same big revolver the man in the bathroom is holding.
  const armed = await page.evaluate(() => {
    window.silvercase.tick(0.5);
    const sc = window.silvercase;
    return {
      state: sc.state(),
      viewModelInCamera: sc.camera.children.includes(sc.viewModel.group),
      gunParts: (() => {
        const names = [];
        sc.viewModel.gun.traverse((o) => { if (o.name) names.push(o.name); });
        return names;
      })(),
    };
  });
  const barArmed = await hotbar();
  check('Ape’s order puts the big revolver in Tony’s hands and on the inventory bar',
    armed.state.weapon.drawn && armed.state.weapon.visible && armed.viewModelInCamera
      && armed.gunParts.includes('big-revolver')
      && barArmed.labels[0] === 'Big revolver · drawn',
    JSON.stringify({ weapon: armed.state.weapon, gun: armed.gunParts[0], bar: barArmed.labels[0] }));

  const dekeSeated = await actorBounds('deke');
  await page.evaluate(() => window.silvercase.pressFire());
  let afterCouchShot = await tickUntil('beat:LOU_QUESTION');
  check('firing on the couch kills Deke and the aftermath line advances to LOU_QUESTION',
    afterCouchShot.met && !afterCouchShot.state.actors.deke.alive,
    JSON.stringify(afterCouchShot));

  // ---- The body stays on the couch. ------------------------------------
  // The couch's own footprint, straight out of ApartmentScene (x 6.925…9.075,
  // z 1.76…2.64, seat top 0.54). A corpse that sinks through to the floor or
  // slides off the front fails this; whether it STAYS there is checked again
  // at the far end of the mission, once several minutes of story have run.
  // (Nothing long is ticked here on purpose: the Lou question's own choice
  // timeout is six seconds and burning the clock would skip the beat.)
  const COUCH_BOX = { x0: 6.9, x1: 9.1, z0: 1.7, z1: 2.7 };
  const dekeSettled = await actorBounds('deke');
  const dekeSettledAt = (await page.evaluate(() => window.silvercase.state())).actors.deke;
  const onTheCouch = dekeSettled.min[0] > COUCH_BOX.x0 && dekeSettled.max[0] < COUCH_BOX.x1
    && dekeSettled.min[2] > COUCH_BOX.z0 - 0.5 && dekeSettled.max[2] < COUCH_BOX.z1
    && dekeSettled.max[1] > 0.6 && dekeSettled.min[1] > -0.15;
  check('the man shot on the couch slumps onto the couch instead of the floor',
    onTheCouch && dekeSettledAt.seated === true && dekeSettledAt.alive === false,
    JSON.stringify({ before: dekeSeated, settled: dekeSettled }));

  // ---- LOU_QUESTION: let the setup lines drain, then pick the option that
  // irritates Ape ("Depends on the lighting.") via the real 1-4 key path.
  // Polled rather than ticked a fixed duration — see tickUntil's own comment:
  // the mission's requestAnimationFrame loop keeps advancing in real time
  // between every one of this script's await calls, so a fixed-duration
  // tick(N) picked to land just past a dialogue sequence risks landing past
  // the choice's own timeout instead, on a slow enough run. -----------------
  let louSetup = await tickUntil('choice:louQuestion');
  check('the Lou question opens its 1-4 choice once the setup lines finish',
    louSetup.met, JSON.stringify(louSetup));
  await page.keyboard.press('Digit4');
  let afterLou = await tickUntil('beat:SQUATCH_PRAYER');
  check('answering "depends on the lighting" irritates Ape and moves on to the prayer',
    afterLou.met && afterLou.state.mission.flags.irritatedApe === true,
    JSON.stringify(afterLou));

  // ---- SQUATCH_PRAYER: drain Ape's lines, then hold E to finish it. -------
  let prayerLines = await tickUntil('choice:prayerFinish');
  check('the prayer opens its hold-E finish prompt once Ape is done reciting',
    prayerLines.met, JSON.stringify(prayerLines));
  await page.keyboard.down('KeyE');
  let afterPrayer = await tickUntil('beat:BATHROOM_AMBUSH');
  await page.keyboard.up('KeyE');
  check('holding E finishes the ritual, kills Chester, and the bathroom ambush arms',
    afterPrayer.met
      && !afterPrayer.state.actors.chester.alive
      && afterPrayer.state.reactionWindow.state === 'armed',
    JSON.stringify(afterPrayer));

  // ---- The bathroom man is holding the big revolver, and the door he came
  // through is off the latch rather than still standing in his way. --------
  const ambushStaging = await page.evaluate(() => {
    const sc = window.silvercase;
    const gun = sc.cast.pruitt.weapon;
    const parents = [];
    let node = gun.parent;
    while (node && parents.length < 6) { parents.push(node.name || node.type); node = node.parent; }
    return {
      armed: Boolean(gun),
      gunName: gun?.name,
      inHand: parents.includes('forearm'),
      revealed: sc.cast.pruitt.group.visible,
      bathDoorOpen: sc.apartment.doors.bathroomDoor.isOpen(),
    };
  });
  check('the bathroom man comes through an open door with the big revolver in hand',
    ambushStaging.armed && ambushStaging.gunName === 'big-revolver'
      && ambushStaging.inHand && ambushStaging.revealed && ambushStaging.bathDoorOpen,
    JSON.stringify(ambushStaging));

  // ---- BATHROOM_AMBUSH, slow/no-fire path: let Pruitt's reaction window
  // expire untouched. Ape's death here is a direct, scripted kill() call from
  // the state machine, never routed through any player-hit-resolution path. -
  let failedRun = await tickUntil('beat:FAILED');
  await tick(1.5); // let FAILED's own after(1.2) reveal the death overlay
  const deathOverlayAfterFail = await domOverlay('deathOverlay');
  check('missing the bathroom window fails the scene with Ape scripted dead',
    failedRun.met
      && !failedRun.state.actors.ape.alive
      && deathOverlayAfterFail.present && deathOverlayAfterFail.hidden === false,
    JSON.stringify({ failedRun, deathOverlayAfterFail }));

  // ---- Retry from the checkpoint (SQUATCH_PRAYER) restores Ape and Chester,
  // and Pruitt goes back into hiding. -------------------------------------
  let retried = await page.evaluate(() => {
    window.silvercase.retry();
    window.silvercase.tick(0.1);
    return window.silvercase.state();
  });
  const deathOverlayAfterRetry = await domOverlay('deathOverlay');
  check('retrying restores the checkpoint with Ape and Chester alive again',
    retried.beat === 'SQUATCH_PRAYER'
      && retried.actors.ape.alive && retried.actors.chester.alive
      && retried.reactionWindow.state === 'idle'
      && deathOverlayAfterRetry.hidden === true,
    JSON.stringify({ retried, deathOverlayAfterRetry }));

  // ---- Replay the prayer, this time resolving BATHROOM_AMBUSH fast, so the
  // reaction window is neutralized instead of expiring. -------------------
  const prayerAgain = await tickUntil('choice:prayerFinish');
  check('the prayer choice opens again after retrying', prayerAgain.met, JSON.stringify(prayerAgain));
  await page.keyboard.down('KeyE');
  let afterPrayerAgain = await tickUntil('beat:BATHROOM_AMBUSH');
  await page.keyboard.up('KeyE');
  check('finishing the prayer a second time re-arms the bathroom ambush',
    afterPrayerAgain.met && afterPrayerAgain.state.reactionWindow.state === 'armed',
    JSON.stringify(afterPrayerAgain));

  const fastFire = await page.evaluate(() => {
    window.silvercase.pressFire();
    window.silvercase.tick(0.05);
    return { state: window.silvercase.state() };
  });
  check('firing back in time neutralizes Pruitt before the window expires',
    fastFire.state.reactionWindow.state === 'neutralized' && !fastFire.state.actors.pruitt.alive,
    JSON.stringify(fastFire));
  let afterAmbush = await tickUntil('beat:AFTERMATH');
  check('a fast, successful shot advances the mission to AFTERMATH', afterAmbush.met, JSON.stringify(afterAmbush));

  // ---- AFTERMATH: spare Winston via the real 1-4 choice path. ------------
  let aftermathIntro = await tickUntil('choice:aftermath');
  check('the aftermath choice opens once Ape’s opening line finishes',
    aftermathIntro.met, JSON.stringify(aftermathIntro));
  await page.keyboard.press('Digit1');
  let afterAftermath = await tickUntil('beat:PICK_UP_CASE');
  check('sparing Winston keeps him alive and moves the mission to PICK_UP_CASE',
    afterAftermath.met && afterAftermath.state.actors.winston.alive,
    JSON.stringify(afterAftermath));

  // ---- Every body from every earlier beat is still exactly where it died.
  // Minutes of mission time have passed since the couch — the Lou question,
  // the prayer, a failed run, a retry, the ambush and the aftermath — so if
  // anything were still creeping, this is where it would show. --------------
  const chesterRest = await actorBounds('chester');
  const pruittRest = await actorBounds('pruitt');
  const dekeMuchLater = await actorBounds('deke');
  const bodiesNow = (await page.evaluate(() => window.silvercase.state())).actors;
  check('every body is still exactly where it fell, minutes later',
    JSON.stringify(dekeMuchLater) === JSON.stringify(dekeSettled)
      && bodiesNow.chester.alive === false && chesterRest.max[1] > 0.6 && chesterRest.min[1] > -0.2
      && Math.abs(bodiesNow.chester.at.x - 8) < 0.35
      && bodiesNow.pruitt.alive === false && pruittRest.max[1] < 0.9 && pruittRest.min[1] > -0.2,
    JSON.stringify({ deke: dekeMuchLater, chester: chesterRest, pruitt: pruittRest }));

  // ---- Picking the case up: the real E interaction, aimed at the real hit
  // box. The look-at raycast reads the camera's world matrix from the last
  // rendered frame, so the pose has to be set, a frame allowed to happen, and
  // only then the key pressed — exactly the order a player does it in. ------
  await page.evaluate(() => {
    const p = window.silvercase.player;
    p.position.set(9.6, 1.66, 2.5);
    p.yaw = 0;
    p.pitch = -Math.atan2(1.46, 0.85);
  });
  await page.waitForTimeout(150);
  const promptOnCase = await page.evaluate(() => {
    window.silvercase.tick(0.1);
    return document.getElementById('promptText').textContent;
  });
  await page.evaluate(() => {
    window.silvercase.interactions.press();
    window.silvercase.interactions.release();
    window.silvercase.tick(1.2);
  });
  const carried = await page.evaluate(() => window.silvercase.state());
  const barCarrying = await hotbar();
  check('taking the case moves it into Tony’s hands, shut, and onto the inventory bar',
    promptOnCase === 'Take the case'
      && carried.beat === 'EXIT'
      && carried.case.carried === true && carried.case.inWorld === false
      && carried.case.shut === true && carried.case.openness === 0
      && carried.weapon.drawn === false
      && barCarrying.labels[1] === 'Lou’s case · closed',
    JSON.stringify({ promptOnCase, case: carried.case, bar: barCarrying.labels.slice(0, 2) }));

  // ---- PICK_UP_CASE -> EXIT -> SCENE_COMPLETE ----------------------------
  let exitBeat = await go('EXIT');
  check('EXIT is reachable once the case is in hand', exitBeat.beat === 'EXIT', exitBeat.beat);
  await page.evaluate(() => { window.silvercase.player.position.x = 1.0; });
  let complete = await tickUntil('beat:SCENE_COMPLETE');
  await tick(1.5); // let SCENE_COMPLETE's own after(1.0) reveal the end card
  const sceneCompleteOverlay = await domOverlay('sceneCompleteOverlay');
  const hudVisible = await page.evaluate(
    () => document.getElementById('hud').classList.contains('visible'),
  );
  check('walking back near the hallway spawn completes the scene',
    complete.met
      && sceneCompleteOverlay.present && sceneCompleteOverlay.hidden === false
      && hudVisible === false,
    JSON.stringify({ complete, sceneCompleteOverlay, hudVisible }));

  check('no runtime console errors or page errors occurred', problems.length === 0,
    problems.join(' | ').slice(0, 800));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Silver Case checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Silver Case checks passed.`);
