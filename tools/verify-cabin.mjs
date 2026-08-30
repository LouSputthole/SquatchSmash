#!/usr/bin/env node
/**
 * Live browser certification for THE HIDEOUT: BELOW THE FLOORBOARDS.
 *
 * This proof intentionally uses the production page, world builders, story
 * ledger, interaction descriptors and chapter presentation callbacks. Slow
 * dialogue is cleared between authored beats so missing recordings waiting on
 * the user's voice pass do not turn a structural verifier into a multi-minute
 * cutscene playback. Pure tests cover every line and both execution branches;
 * this file proves that those contracts are integrated into the real WebGL
 * scene and can be seen at the correct day/night checkpoints.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CABIN_REQUIRED_LINES, cabinScriptCues } from '../src/cabin/script.js';
import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5247;
const SCREENSHOT_DIR = process.env.CABIN_SCREENSHOT_DIR
  ? path.resolve(process.env.CABIN_SCREENSHOT_DIR)
  : process.argv.includes('--screenshots')
    ? path.join(ROOT, '.artifacts', 'cabin')
    : null;
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const authoredCues = cabinScriptCues();
const authoredNames = new Set(authoredCues.map(({ name }) => name));
const manifestNames = new Set((manifest.sfx || []).map(({ name }) => name));
const absentFromManifest = [...authoredNames].filter((name) => !manifestNames.has(name));
const missingRecordings = authoredCues.filter(({ name }) => {
  const row = (manifest.sfx || []).find((entry) => entry.name === name);
  const relative = row?.file || `${name}.mp3`;
  return !fs.existsSync(path.join(ROOT, 'assets', 'sfx', relative));
});

const results = [];
const problems = [];
/* The Cabin's failure ledger closes when the Cabin hands the browser on. The
 * chapter's last act is a real campaign navigation to `bing.html?visit=2`, and
 * neither the Bing's own boot nor the media requests this page has aborted on
 * its way out are Cabin faults. */
let watchingCabinPage = true;
let browser = null;
let server = null;

function check(name, ok, detail = '') {
  const passed = Boolean(ok);
  results.push({ name, ok: passed, detail });
  console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

async function nextFrames(page, count = 2) {
  await page.evaluate((frames) => new Promise((resolve) => {
    let remaining = Math.max(1, Number(frames) || 1);
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), count);
}

async function capture(page, name) {
  if (!SCREENSHOT_DIR) return;
  await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  await nextFrames(page, 2);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), animations: 'disabled' });
}

async function captureScene(page, name) {
  if (!SCREENSHOT_DIR) return;
  await page.evaluate(() => {
    for (const id of ['hud', 'objectives', 'squatch-preview-notice']) {
      const element = document.getElementById(id);
      if (element) element.dataset.cabinVerifierVisibility = element.style.visibility || '';
      if (element) element.style.visibility = 'hidden';
    }
  });
  await capture(page, name);
  await page.evaluate(() => {
    for (const id of ['hud', 'objectives', 'squatch-preview-notice']) {
      const element = document.getElementById(id);
      if (!element) continue;
      element.style.visibility = element.dataset.cabinVerifierVisibility || '';
      delete element.dataset.cabinVerifierVisibility;
    }
  });
}

async function clearHands(page) {
  await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    runtime.weapons?.stow?.({ silent: true });
    const empty = runtime.cabin.inventory.items.findIndex((item) => item === null);
    if (empty >= 0) runtime.cabin.inventory.select(empty);
  });
  await nextFrames(page, 1);
}

async function clearChapterPresentation(page) {
  await page.evaluate(() => {
    const chapter = window.COUNTRYSIDE_CABIN.chapter;
    chapter.dialogue.stop?.();
    chapter.beatQueue.length = 0;
    chapter.pendingConsume = null;
  });
}

async function teleport(page, id, mode = 'interact') {
  const placed = await page.evaluate(({ target, viewMode }) => (
    window.COUNTRYSIDE_CABIN.teleport(target, viewMode)
  ), { target: id, viewMode: mode });
  await nextFrames(page, 2);
  return placed;
}

async function poseAtWrappedBody(page, cleanupId) {
  const receipt = await page.evaluate((bodyId) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const descriptor = runtime.cleanup.interactionDescriptors.bodies[bodyId];
    const target = descriptor?.target;
    if (!target) return { placed: false, bodyId };
    runtime.scene.updateMatrixWorld(true);
    const focus = target.getWorldPosition(target.position.clone());
    focus.y += 0.34;
    const floor = runtime.dungeon.bounds.dungeon.floorY;
    const player = runtime.player;
    player._tween = null;
    player.mode = 'walk';
    player.position.set(focus.x, floor + 1.66, focus.z - 1.72);
    player.ground = floor;
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    player.jumpHeight = 0;
    player.grounded = true;
    player.crouching = false;
    player.sprinting = false;
    player.velocity.set(0, 0, 0);
    player.clearKeys();
    const delta = focus.clone().sub(player.position);
    player.yaw = Math.atan2(-delta.x, -delta.z);
    player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.state.level = 'basement';
    runtime.input.clear(`cabin-verifier-wrapped-body-${bodyId}`);
    player.update(0);
    runtime.player.camera.updateMatrixWorld(true);
    runtime.interaction.setPaused(false);
    runtime.interaction.update(0);
    const currentLabel = runtime.interaction.current?.userData?.interact?.label;
    return {
      placed: true,
      bodyId,
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      label: typeof currentLabel === 'function' ? currentLabel() : currentLabel ?? null,
      distance: player.position.distanceTo(focus),
      position: player.position.toArray(),
      target: focus.toArray(),
    };
  }, cleanupId);
  await nextFrames(page, 2);
  return receipt;
}

async function walkPlayerTo(page, target, { tolerance = 0.22, maxFrames = null } = {}) {
  const start = await page.evaluate((point) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const player = runtime.player;
    const dx = point[0] - player.position.x;
    const dz = point[1] - player.position.z;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = 0;
    player.velocity.set(0, 0, 0);
    player.clearKeys();
    player.camera.updateMatrixWorld(true);
    return {
      position: player.position.toArray(),
      distance: Math.hypot(dx, dz),
      movementPresses: runtime.input.snapshot().movementPresses,
      carrying: runtime.state.carryingBody,
    };
  }, target);
  await page.keyboard.down('w');
  const frameBudget = maxFrames ?? Math.max(240, Math.ceil(start.distance * 180));
  const end = await page.evaluate(({ point, radius, limit, priorPresses }) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const player = runtime.player;
    const samples = [];
    let frames = 0;
    let distance = Math.hypot(player.position.x - point[0], player.position.z - point[1]);
    while (distance > radius && frames < limit) {
      player.update(1 / 60);
      frames += 1;
      distance = Math.hypot(player.position.x - point[0], player.position.z - point[1]);
      if (frames === 1 || frames % 60 === 0 || distance <= radius) {
        samples.push({
          frame: frames,
          position: player.position.toArray(),
          ground: player.ground,
          distance,
        });
      }
    }
    const feet = player.position.y - player.eyeHeight;
    const penetrations = runtime.cabin.colliders.filter((box) => {
      if (player.position.y + 0.05 < box.min.y || feet > box.max.y) return false;
      if (box.max.y <= player.ground + 0.40) return false;
      const closestX = Math.max(box.min.x, Math.min(box.max.x, player.position.x));
      const closestZ = Math.max(box.min.z, Math.min(box.max.z, player.position.z));
      return Math.hypot(player.position.x - closestX, player.position.z - closestZ) < 0.299;
    }).map((box) => box.name || '(unnamed)');
    const input = runtime.input.snapshot();
    return {
      position: player.position.toArray(),
      distance,
      movementPresses: runtime.input.snapshot().movementPresses,
      inputDelta: input.movementPresses - priorPresses,
      lastMovementCode: input.lastMovementCode,
      keyHeld: player.keys.has('KeyW'),
      carrying: runtime.state.carryingBody,
      level: runtime.state.level,
      ground: player.ground,
      feet,
      frames,
      frameBudget: limit,
      reached: distance <= radius,
      samples,
      penetrations,
    };
  }, {
    point: target,
    radius: tolerance,
    limit: frameBudget,
    priorPresses: start.movementPresses,
  });
  await page.keyboard.up('w');
  const released = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const player = runtime.player;
    const keyReleased = !player.keys.has('KeyW');
    player.velocity.set(0, 0, 0);
    return {
      keyReleased,
      position: player.position.toArray(),
      carrying: runtime.state.carryingBody,
    };
  });
  Object.assign(end, {
    keyReleased: released.keyReleased,
    positionAfterRelease: released.position,
    carryingAfterRelease: released.carrying,
  });
  if (!end.reached) {
    throw new Error(`Real W traversal exhausted its frame budget: ${JSON.stringify({ target, start, end })}`);
  }
  return { target, start, end };
}

async function extractBodyThroughRealRoute(page, cleanupId, { checkCarrySuppression = false } = {}) {
  const pickupSetup = await poseAtWrappedBody(page, cleanupId);
  const pickupBefore = await page.evaluate(() => ({
    presses: window.COUNTRYSIDE_CABIN.input.snapshot().interactionPresses,
    current: window.COUNTRYSIDE_CABIN.interaction.current?.name ?? null,
  }));
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const pickup = await page.evaluate(({ bodyId, prior }) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const record = runtime.cleanup.bodies.get(bodyId);
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      carrying: runtime.state.carryingBody,
      cleanupCarrying: runtime.cleanup.snapshot().carryingId,
      phase: record?.phase ?? null,
      parentIsCamera: record?.group?.parent === runtime.player.camera,
    };
  }, { bodyId: cleanupId, prior: pickupBefore.presses });

  let carrySuppression = null;
  if (checkCarrySuppression) {
    await page.keyboard.down('Shift');
    await page.keyboard.down('Space');
    await nextFrames(page, 2);
    carrySuppression = await page.evaluate(() => ({
      carrying: window.COUNTRYSIDE_CABIN.state.carryingBody,
      sprinting: window.COUNTRYSIDE_CABIN.player.sprinting,
      shift: window.COUNTRYSIDE_CABIN.player.keys.has('ShiftLeft'),
      jump: window.COUNTRYSIDE_CABIN.player.keys.has('Space'),
    }));
    await page.keyboard.up('Space');
    await page.keyboard.up('Shift');
  }

  /* Start at the real pickup pose. These body-specific legs clear the west
   * hanging station or east rack into the common aisle; no position mutation
   * is allowed after the body becomes attached to the camera. */
  const cellExitWaypoints = cleanupId === 'counterstrike-player'
    ? [
      [-3.18, 13.65],
      [-2.20, 12.35],
      [-0.20, 10.55],
      [0.92, 9.72],
    ]
    : [
      [6.24, 11.82],
      [5.05, 10.72],
      [3.10, 9.92],
      [0.92, 9.72],
    ];
  const cellExitRoute = [];
  for (const target of cellExitWaypoints) {
    cellExitRoute.push(await walkPlayerTo(page, target, { tolerance: 0.08 }));
  }
  /* Reverse the same capsule-clear bends proved by the shared armory
   * contract. A straight line clips the two mounted guns around z=6.7; these
   * are steering waypoints only, while W, Player.update(), and live collision
   * own every metre of the extraction. */
  const corridorRoute = [];
  for (const target of [
    [0.92, 9.24],
    [0.72, 8.54],
    [0.72, 7.10],
    [0.86, 6.77],
    [0.98, 6.68],
    [1.08, 6.42],
    [1.08, 4.88],
    [1.08, 4.05],
  ]) {
    corridorRoute.push(await walkPlayerTo(page, target, { tolerance: 0.08 }));
  }
  const corridorStart = corridorRoute[0].start;
  const corridorExit = corridorRoute.at(-1).end;
  const cellarTraverse = [];
  for (const target of [
    [3.25, 4.02],
    [4.10, 3.24],
    [4.52, 3.24],
  ]) {
    cellarTraverse.push(await walkPlayerTo(page, target, { tolerance: 0.08 }));
  }
  const ladderApproach = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const target = runtime.cabin.basement.exitTarget;
    runtime.player.velocity.set(0, 0, 0);
    runtime.player.clearKeys();
    runtime.scene.updateMatrixWorld(true);
    const focus = target.getWorldPosition(target.position.clone());
    const delta = focus.clone().sub(runtime.player.position);
    runtime.player.yaw = Math.atan2(-delta.x, -delta.z);
    runtime.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.player.update(0);
    runtime.player.camera.updateMatrixWorld(true);
    runtime.interaction.update(0);
    const currentLabel = runtime.interaction.current?.userData?.interact?.label;
    return {
      position: runtime.player.position.toArray(),
      ground: runtime.player.ground,
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      label: typeof currentLabel === 'function' ? currentLabel() : currentLabel ?? null,
      presses: runtime.input.snapshot().interactionPresses,
      carrying: runtime.state.carryingBody,
      level: runtime.state.level,
    };
  });
  if (!ladderApproach.targetResolved) {
    throw new Error(`Real carry route could not resolve the authored ladder target: ${JSON.stringify({
      cleanupId,
      cellExitRoute,
      corridorRoute,
      cellarTraverse,
      ladderApproach,
    })}`);
  }
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const ladderUp = await page.evaluate((prior) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const record = runtime.cleanup.bodies.get(runtime.state.carryingBody);
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      level: runtime.state.level,
      position: runtime.player.position.toArray(),
      ground: runtime.player.ground,
      carrying: runtime.state.carryingBody,
      cleanupCarrying: runtime.cleanup.snapshot().carryingId,
      parentIsCamera: record?.group?.parent === runtime.player.camera,
    };
  }, ladderApproach.presses);
  if (ladderUp.inputDelta !== 1 || ladderUp.level !== 'cabin') {
    throw new Error(`Real E did not complete the carrying ladder transition: ${JSON.stringify({
      cleanupId,
      ladderApproach,
      ladderUp,
    })}`);
  }

  /* The wardrobe-return spawn faces the concealed panel; backing up points at
   * the refrigerator. Turn west through the authored room opening, then clear
   * the appliance before approaching the front door. */
  const closetExitRoute = [];
  for (const target of [
    [4.20, 3.42],
    [2.65, 2.78],
  ]) {
    closetExitRoute.push(await walkPlayerTo(page, target, { tolerance: 0.08 }));
  }
  const surfaceRoute = [];
  surfaceRoute.push(await walkPlayerTo(page, [2.65, 4.62]));
  const cabinDoorApproach = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const target = runtime.cabin.door.target;
    runtime.scene.updateMatrixWorld(true);
    const focus = runtime.player.position.clone().set(2.49, 1.08, 5.48);
    const delta = focus.clone().sub(runtime.player.position);
    runtime.player.yaw = Math.atan2(-delta.x, -delta.z);
    runtime.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.player.velocity.set(0, 0, 0);
    runtime.player.clearKeys();
    runtime.player.update(0);
    runtime.player.camera.updateMatrixWorld(true);
    runtime.interaction.update(0);
    const currentLabel = runtime.interaction.current?.userData?.interact?.label;
    return {
      wasOpen: runtime.cabin.door.open,
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      label: typeof currentLabel === 'function' ? currentLabel() : currentLabel ?? null,
      presses: runtime.input.snapshot().interactionPresses,
      openness: runtime.cabin.door.openness,
    };
  });
  if (!cabinDoorApproach.wasOpen && !cabinDoorApproach.targetResolved) {
    throw new Error(`Real carry route could not resolve the authored cabin door: ${JSON.stringify({
      cleanupId,
      closetExitRoute,
      cabinDoorApproach,
    })}`);
  }
  if (!cabinDoorApproach.wasOpen) {
    await page.keyboard.press('e');
  }
  const cabinDoorOpen = await page.evaluate(({ prior, alreadyOpen }) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    let animationFrames = 0;
    while (runtime.cabin.door.open
      && runtime.cabin.door.openness <= 0.92
      && animationFrames < 240) {
      animationFrames += 1;
      runtime.cabin.update(
        1 / 60,
        runtime.state.elapsed + animationFrames / 60,
        runtime.player.position,
      );
    }
    return {
      open: runtime.cabin.door.open,
      openness: runtime.cabin.door.openness,
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      carrying: runtime.state.carryingBody,
      animationFrames,
      animationReached: runtime.cabin.door.openness > 0.92,
      alreadyOpen,
    };
  }, { prior: cabinDoorApproach.presses, alreadyOpen: cabinDoorApproach.wasOpen });
  if (!cabinDoorOpen.open || !cabinDoorOpen.animationReached) {
    throw new Error(`Real E did not open the authored cabin door: ${JSON.stringify({
      cleanupId,
      cabinDoorApproach,
      cabinDoorOpen,
    })}`);
  }
  for (const target of [
    [2.65, 7.55],
    [0.25, 10.10],
    [-4.75, 13.25],
    [-9.15, 17.35],
    [-9.15, 20.00],
    [-14.00, 20.00],
    [-14.0, 17.45],
  ]) {
    surfaceRoute.push(await walkPlayerTo(page, target));
  }
  const fireApproach = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const target = runtime.cleanup.interactionDescriptors.fire.target;
    runtime.scene.updateMatrixWorld(true);
    const focus = target.getWorldPosition(target.position.clone());
    const delta = focus.clone().sub(runtime.player.position);
    runtime.player.yaw = Math.atan2(-delta.x, -delta.z);
    runtime.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.player.velocity.set(0, 0, 0);
    runtime.player.clearKeys();
    runtime.player.update(0);
    runtime.player.camera.updateMatrixWorld(true);
    runtime.interaction.update(0);
    const currentLabel = runtime.interaction.current?.userData?.interact?.label;
    return {
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      label: typeof currentLabel === 'function' ? currentLabel() : currentLabel ?? null,
      presses: runtime.input.snapshot().interactionPresses,
      carrying: runtime.state.carryingBody,
    };
  });
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const placed = await page.evaluate(({ bodyId, prior }) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      bodyPhase: runtime.cleanup.bodies.get(bodyId)?.phase ?? null,
      carrying: runtime.state.carryingBody,
      cleanupCarrying: runtime.cleanup.snapshot().carryingId,
      phase: runtime.story.phase(),
      castAtFire: runtime.chapter.snapshot().castAtFire,
    };
  }, { bodyId: cleanupId, prior: fireApproach.presses });

  return {
    cleanupId,
    pickupSetup,
    pickupBefore,
    pickup,
    carrySuppression,
    cellExitRoute,
    corridorRoute,
    corridorStart,
    corridorExit,
    cellarTraverse,
    ladderApproach,
    ladderUp,
    closetExitRoute,
    surfaceRoute,
    cabinDoorApproach,
    cabinDoorOpen,
    fireApproach,
    placed,
  };
}

try {
  check('Cabin script exposes exactly 163 authored VO cues', authoredCues.length === 163, `${authoredCues.length} cues`);
  check('Every authored Cabin VO cue is synchronized into the sound manifest', absentFromManifest.length === 0,
    absentFromManifest.length ? absentFromManifest.slice(0, 3).join(', ') : 'manifest synchronized');
  check('Required inside-joke and polite-choice lines remain authored',
    Object.values(CABIN_REQUIRED_LINES).every((line) => authoredCues.some((cue) => cue.say === line)),
    `${Object.keys(CABIN_REQUIRED_LINES).length} required lines`);
  console.log(`  info  ${missingRecordings.length} Cabin recordings await the user voice-generation pass`);

  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(ROOT, relative || 'index.html');
      if (!file.startsWith(`${ROOT}${path.sep}`)
        || !fs.existsSync(file)
        || fs.statSync(file).isDirectory()) {
        response.writeHead(404).end('not found');
        return;
      }
      response.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      response.end(await fsp.readFile(file));
    } catch (error) {
      response.writeHead(500).end(error?.message || 'server error');
    }
  });
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  browser = await launchChromium({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);
  await page.addInitScript(() => {
    window.__cabinMargoEvents = [];
    window.addEventListener('squatch:cabin-margo-call-ready', (event) => {
      window.__cabinMargoEvents.push(event.detail);
    });
    window.__SQUATCH_QA_AUDIO__ = {
      strictRequiredRecordings: false,
      engines: [],
      violations: [],
      onViolation(receipt) { this.violations.push(receipt); },
    };
  });
  page.on('pageerror', (error) => {
    if (watchingCabinPage) problems.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (watchingCabinPage && message.type() === 'error') {
      problems.push(`console: ${message.text().slice(0, 400)}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (!watchingCabinPage) return;
    problems.push(`request: ${request.url()} - ${request.failure()?.errorText || 'failed'}`);
  });

  await page.goto(`http://127.0.0.1:${PORT}/cabin.html?preview=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.COUNTRYSIDE_CABIN?.chapter));

  const boot = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const { cabin, story, dungeon, range, cleanup } = runtime;
    let meshes = 0;
    let mansionNamedObjects = 0;
    cabin.root.traverse((object) => {
      if (object.isMesh) meshes += 1;
      if (/mansion/i.test(object.name || '')) mansionNamedObjects += 1;
    });
    return {
      ready: Boolean(window.CABIN),
      bootFailure: !document.getElementById('bootFailure')?.hidden,
      sceneId: runtime.campaign.state.scene.id,
      day: runtime.campaign.state.story.day,
      timeMinutes: runtime.campaign.state.story.timeMinutes,
      phase: story.phase(),
      leave: story.tryLeave(),
      entryVisible: cabin.basement.entryTarget.visible,
      entryEnabled: cabin.basement.entryTarget.userData.interact.enabled(),
      secondDoorEnabled: dungeon.targets.door.userData.interact.enabled(),
      secondDoorOpen: dungeon.door.open,
      hostageCount: Object.keys(dungeon.actors).filter((id) => id !== 'gratin').length,
      disposableFlags: [dungeon.actors.ateam, dungeon.actors.counterStrike]
        .map((actor) => actor.bodyTarget.userData.cabinDisposable === true),
      rackName: dungeon.tools.rack.name,
      hangingRotation: dungeon.actors.counterStrike.group.rotation.z,
      armory: dungeon.armory.racks.map(({ id }) => id),
      rangeTargets: range.geometry.targetCount,
      rangeShots: range.geometry.shotLimit,
      cleanupBodies: cleanup.geometry.bodyCount,
      canonicalCleanupBodies: cleanup.geometry.canonicalPrefabCount,
      meshes,
      mansionNamedObjects,
    };
  });
  check('Production Cabin preview boots without a failure surface', boot.ready && !boot.bootFailure);
  /* THE CABIN IS ACT ONE, AND THIS CHECK WAS STILL THE OLD PLACEMENT.
   *
   * It asserted Day 7 at 11:15 -- the post-heist lay-low the cabin used to be
   * -- and the settled story rule is the opposite: *"One cabin, in Act One.
   * The whole Cabin Hideaway chapter IS that scene. Beef Run cuts it in half.
   * It is not a post-heist lay-low."* The driver takes him out of town
   * straight off the Squatchfather, so the preview opens where the campaign
   * marathon lands: `squatchfather -> countryside_cabin | day 2 05:20`.
   *
   * The door's refusal moved with it. On a fresh visit `visitOneComplete()`
   * is false and `tryLeave()` answers `cabin_wait` -- Lou said stay put.
   * `cabin_chapter_incomplete` is the LEGACY refusal, kept for a save that
   * arrived here the old way after the bank, and asserting it on a first
   * visit was asserting the branch this route no longer takes. */
  check('The Act One preview opens at the Cabin on Day 2 at 05:20',
    boot.sceneId === 'countryside_cabin' && boot.day === 2
      && boot.timeMinutes === 5 * 60 + 20,
    `day ${boot.day}, minute ${boot.timeMinutes}`);
  check('The arrival rest is the opening chapter phase and the car is gated',
    boot.phase === 'arrival_rest'
      && boot.leave.kind === 'stay' && boot.leave.id === 'cabin_wait',
    `phase ${boot.phase}, door ${boot.leave.id}`);
  check('First cellar entrance is physically hidden and disabled before Gratin calls',
    !boot.entryVisible && !boot.entryEnabled);
  check('Second concealed door is closed and unavailable before the cellar opens',
    !boot.secondDoorEnabled && !boot.secondDoorOpen);
  check('Dungeon owns two generic disposable captives, a rack, and an upside-down rig',
    boot.hostageCount === 2 && boot.disposableFlags.every(Boolean)
      && /rack/i.test(boot.rackName) && Math.abs(Math.abs(boot.hangingRotation) - Math.PI) < 0.35,
    `rotation ${boot.hangingRotation.toFixed(2)} rad`);
  check('Dungeon armory specifies AK-47 and Barrett racks',
    boot.armory.some((id) => /ak/i.test(id)) && boot.armory.some((id) => /barrett/i.test(id)),
    boot.armory.join(', '));
  check('Crude range exposes five targets and a ten-shot session', boot.rangeTargets === 5 && boot.rangeShots === 10);
  check('Cleanup owns exactly two canonical wrapped-body prefabs',
    boot.cleanupBodies === 2 && boot.canonicalCleanupBodies === 2);
  check('Cabin scene contains no Mansion-named world objects', boot.mansionNamedObjects === 0);
  check('Cabin world is materially populated', boot.meshes > 1000, `${boot.meshes} meshes`);
  await capture(page, '01-day-arrival');

  await page.locator('#start-btn').click();
  /* THE START HANDLER IS 146 SECONDS COLD, and the default 180 000 ms wait was
   * never enough to cover it. Measured on an idle sandbox at 1280x720 under
   * SwiftShader: click to `state.phase === 'active'` took 146 s, spent almost
   * entirely in the handler's own awaits -- audio.init(), the radio manifest,
   * and a decode of roughly two hundred cues (163 authored Cabin VO lines plus
   * the weapon, radio and Lag prefixes). That leaves 34 s of headroom, and the
   * fifteen boot checks and the '01-day-arrival' capture above spend it, which
   * is why this one step failed every run while the other fourteen passed.
   *
   * Ten minutes is not a guess at a bigger number: it is the same budget the
   * Special Meeting verifier already carries for the same reason. A scene that
   * genuinely never starts still fails, four times slower. */
  await page.waitForFunction(() => window.COUNTRYSIDE_CABIN.state.phase === 'active',
    null, { timeout: 600000 });

  /* AHEAD OF THE POINTER-LOCK SEAM ON PURPOSE. This drives the armory and the
   * inventory through evaluate() and needs no captured input, and the capture
   * wait below is the one thing in this file that does not reliably clear on a
   * cold SwiftShader page. A check that needs nothing from that seam must not
   * sit behind it -- everything after a failing step simply never runs. */
  /* ---------------------------------------------------------------- */
  /* A GUN HE TAKES IS A GUN HE STILL HAS                              */
  /* ---------------------------------------------------------------- */
  /* Owner: *"the gun at the cabin also isnt in my inventory. i have it and
   * then I put it away and it dissapears instead of going into my
   * inventory."*
   *
   * It was never destroyed -- `retainTaken` reserves the wall copy, so walking
   * back to the rack re-equipped it -- but the take selected an EMPTY pocket
   * and put nothing in it, so [Q] stowed the rifle out of his hands into
   * nowhere visible. A gun you can only recover by remembering which wall you
   * took it off is a gun you have lost.
   *
   * Take it the way the rack does, stow it the way he did, and require both
   * that the pocket still holds it and that its number key brings it back. */
  const gun = await page.evaluate(async () => {
    const c = window.COUNTRYSIDE_CABIN;
    /* The racks hang off the built world (`c.cabin`), not off the runtime
     * handle; the armories are the runtime's. Try each armory against the
     * wall rack's own first weapon id rather than assuming which mount owns
     * it -- the cabin has three (dungeon, wall, shotgun). */
    const armories = Object.keys(c).filter((k) => /armor/i.test(k))
      .map((k) => c[k]).filter((v) => v && typeof v.take === 'function');
    const id = c.cabin?.wallRack?.racks?.[0]?.id ?? null;
    if (!armories.length || !id) {
      return { ok: false, id, armories: armories.length,
        rackIds: (c.cabin?.wallRack?.racks ?? []).map((r) => r.id) };
    }
    const took = armories.some((a) => a.take(id));
    if (!took) return { ok: false, id, why: 'no armory would take it' };
    const inHand = { held: c.inventory.held, equipped: c.weapons?.equipped ?? null };
    c.weapons.stow();
    const afterStow = {
      items: c.inventory.items.slice(),
      equipped: c.weapons?.equipped ?? null,
    };
    const slot = afterStow.items.indexOf(id);
    if (slot >= 0) {
      c.inventory.select(slot);
      if (c.weapons.equipped !== id) c.weapons.equip(id);
    }
    return {
      ok: true, id, inHand, afterStow, slot,
      redrawn: c.weapons?.equipped ?? null,
    };
  });
  check('a rifle taken off the wall lands in a pocket, survives [Q], and its number key draws it again',
    gun.ok && gun.inHand.equipped === gun.id
      && gun.afterStow.items.includes(gun.id) && gun.afterStow.equipped === null
      && gun.slot >= 0 && gun.redrawn === gun.id,
    JSON.stringify(gun));
  /* Cross the browser-to-Player seam with a real canvas gesture. Headless
   * Chromium does not consistently honor pointer lock requested from the
   * overlay button, even though a direct gameplay click is accepted. */
  await page.locator('#scene').click({ position: { x: 160, y: 100 } });
  /* Five seconds was not enough on a cold SwiftShader page, and the comment
   * above already says why: pointer lock here is not reliably granted on the
   * first ask. The neighbouring waits in this file and in verify-cold-open
   * budget thirty to sixty seconds for exactly this seam. What is being
   * asserted is that capture arrives at all, not that it arrives quickly. */
  await page.waitForFunction(() => (
    window.COUNTRYSIDE_CABIN.input?.captured
      && window.COUNTRYSIDE_CABIN.input?.controls?.movementEnabled
  ), null, { timeout: 30000 });
  const beforeMove = await page.evaluate(() => window.COUNTRYSIDE_CABIN.player.position.toArray());
  await page.keyboard.down('w');
  await nextFrames(page, 8);
  await page.keyboard.up('w');
  const afterMove = await page.evaluate(() => window.COUNTRYSIDE_CABIN.player.position.toArray());
  check('Real production keyboard input moves the first-person player',
    Math.hypot(afterMove[0] - beforeMove[0], afterMove[2] - beforeMove[2]) > 0.025);


  await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const { chapter, story } = runtime;
    chapter._suppressCallEnd = true;
    chapter.phone.hangUp?.();
    chapter._suppressCallEnd = false;
    story.completeArrivalRest();
    story.completeOpeningCall();
    chapter.callbacks.onSync?.();
  });
  await clearChapterPresentation(page);

  const exploration = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const first = runtime.visit('creek');
    const expectedBeat = 'FIRST_EXPLORATION';
    const startedBeat = runtime.chapter.dialogue.current;
    let beatTicks = 0;
    /* The Margo handoff is deliberately durable only after Tony's setup line
     * finishes. Advance the real measured-dialogue director instead of
     * cancelling that required beat (which would correctly leave the story
     * marker and external integration event pending). */
    while (runtime.chapter.dialogue.current === expectedBeat && beatTicks < 300) {
      runtime.chapter.dialogue.update(0.1);
      beatTicks += 1;
    }
    const firstExplorationBeat = {
      expected: expectedBeat,
      started: startedBeat,
      completed: runtime.chapter.dialogue.current !== expectedBeat,
      ticks: beatTicks,
      margoHandled: runtime.story.margoHookHandled(),
    };
    const second = runtime.visit('range');
    const range = runtime.range;
    range.begin();
    const bull = [...range.targets.values()][0].meshes.at(-1);
    for (let index = 0; index < 10; index += 1) {
      const triggerId = `cabin-live-${index}`;
      range.handleWeaponEvent({ type: 'fire', triggerId });
      range.handleImpact({ object: bull, triggerId });
    }
    // RangeSession clamps a single update to 0.25 s; cross the authored
    // 0.35-second post-shot finish delay with two ordinary simulation ticks.
    range.update(0.25);
    range.update(0.25);
    return {
      first,
      second,
      firstExplorationBeat,
      count: runtime.story.explorationCount(),
      margo: window.__cabinMargoEvents.slice(),
      range: range.snapshot(),
      phase: runtime.story.phase(),
    };
  });
  check('Two daylight exploration sites remain part of the spoiler-safe first visit',
    exploration.count === 2 && exploration.phase === 'explore');
  check('First exploration emits the one-shot external Margo integration event',
    exploration.firstExplorationBeat.started === exploration.firstExplorationBeat.expected
      && exploration.firstExplorationBeat.completed
      && exploration.firstExplorationBeat.margoHandled
      && exploration.margo.length === 1
      && exploration.margo[0].sceneId === 'countryside_cabin'
      && exploration.margo[0].explorationCount === 1,
    JSON.stringify(exploration.firstExplorationBeat));
  check('Range scores all ten correlated shots and completes the round',
    exploration.range.complete && exploration.range.shots === 10
      && exploration.range.hits === 10 && exploration.range.currentScore === 500,
    `${exploration.range.currentScore} points`);
  await page.evaluate(() => { window.COUNTRYSIDE_CABIN.chapter.callRetry = 999; });
  await clearHands(page);
  await teleport(page, 'range', 'observe');
  await capture(page, '02-day-shooting-range');
  await page.evaluate(() => window.COUNTRYSIDE_CABIN.range.reset());

  const reveal = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const { chapter, story, cabin } = runtime;
    chapter._suppressCallEnd = true;
    chapter.phone.hangUp?.();
    chapter._suppressCallEnd = false;
    /* The public preview starts at the canonical first arrival. The pure
     * route suite owns the intervening Beef Run; move this live scene to its
     * durable second-rest seam before certifying the dungeon half. */
    story.completeSecondRest();
    const call = story.completeGratinCall();
    chapter.dialogue.stop?.();
    chapter.beatQueue.length = 0;
    cabin.state.closetOpen = true;
    cabin.state.closetT = 1;
    cabin.update(0.2, runtime.state.elapsed, runtime.player.position);
    chapter.callbacks.onSync?.();
    const objectiveRows = [...document.querySelectorAll('#objectives .olist li')]
      .map((item) => item.textContent.trim());
    const objectiveHint = document.querySelector('#objectives .ohint')?.textContent.trim() ?? '';
    return {
      call,
      visible: cabin.basement.entryTarget.visible,
      enabled: cabin.basement.entryTarget.userData.interact.enabled(),
      phase: story.phase(),
      objectiveRows,
      objectiveHint,
      objectivePlan: story.objectivePlan(),
    };
  });
  check('Gratin’s call reveals the first secret only after two explorations',
    reveal.call.ok && reveal.visible && reveal.enabled && reveal.phase === 'open_cellar');
  const revealObjectiveText = [...reveal.objectiveRows, reveal.objectiveHint].join(' ');
  check('HUD shows one current order without unfinished exploration or future dungeon spoilers',
    reveal.objectiveRows.length === 1
      && reveal.objectiveRows[0] === 'Find Gratin'
      && /Supreme Leader/i.test(reveal.objectiveHint)
      && reveal.objectivePlan.id === 'cabin.find_gratin'
      && !/creek|ridge|shed|range|prisoner|execution|bod(?:y|ies)|gas|fire|blackout|morning/i
        .test(revealObjectiveText),
    JSON.stringify({ rows: reveal.objectiveRows, hint: reveal.objectiveHint }));
  await clearHands(page);
  await teleport(page, 'basementEntrance', 'interact');
  await capture(page, '03-supreme-leader-secret');

  const cellarPressesBefore = await page.evaluate(() => window.COUNTRYSIDE_CABIN.input.snapshot().interactionPresses);
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const cellar = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      inputPresses: runtime.input.snapshot().interactionPresses,
      open: runtime.story.cellarOpen(),
      phase: runtime.story.phase(),
      level: runtime.state.level,
      floorY: runtime.player.ground,
      secondEnabled: runtime.dungeon.targets.door.userData.interact.enabled(),
    };
  });
  check('Real E-key interaction records the first secret and moves the player below the Cabin',
    cellar.inputPresses === cellarPressesBefore + 1
      && cellar.open && cellar.phase === 'enter_dungeon'
      && cellar.level === 'basement' && cellar.floorY < -3);
  check('Opening the cellar enables—but does not auto-open—the second secret door', cellar.secondEnabled);

  await clearHands(page);
  await teleport(page, 'basementExit', 'interact');
  const emptyLadderUpBefore = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      presses: runtime.input.snapshot().interactionPresses,
      targetResolved: runtime.interaction.current === runtime.cabin.basement.exitTarget,
      current: runtime.interaction.current?.name ?? null,
      carrying: runtime.state.carryingBody,
      tool: runtime.chapter.selectedTool,
    };
  });
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const emptyLadderUp = await page.evaluate((prior) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      level: runtime.state.level,
      ground: runtime.player.ground,
      carrying: runtime.state.carryingBody,
      tool: runtime.chapter.selectedTool,
    };
  }, emptyLadderUpBefore.presses);
  await teleport(page, 'basementEntrance', 'interact');
  const emptyLadderDownBefore = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      presses: runtime.input.snapshot().interactionPresses,
      targetResolved: runtime.interaction.current === runtime.cabin.basement.entryTarget,
      current: runtime.interaction.current?.name ?? null,
    };
  });
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const emptyLadderDown = await page.evaluate((prior) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      level: runtime.state.level,
      ground: runtime.player.ground,
      carrying: runtime.state.carryingBody,
      tool: runtime.chapter.selectedTool,
    };
  }, emptyLadderDownBefore.presses);
  check('The wardrobe ladder completes an empty-handed real-E round trip without trapping Tony',
    emptyLadderUpBefore.targetResolved
      && emptyLadderDownBefore.targetResolved
      && emptyLadderUp.inputDelta === 1
      && emptyLadderUp.level === 'cabin'
      && Math.abs(emptyLadderUp.ground) < 0.05
      && emptyLadderUp.carrying === null
      && emptyLadderUp.tool === null
      && emptyLadderDown.inputDelta === 1
      && emptyLadderDown.level === 'basement'
      && emptyLadderDown.ground < -3
      && emptyLadderDown.carrying === null
      && emptyLadderDown.tool === null,
    JSON.stringify({ up: emptyLadderUpBefore, afterUp: emptyLadderUp, down: emptyLadderDownBefore, afterDown: emptyLadderDown }));

  await clearHands(page);
  await teleport(page, 'dungeonDoor', 'interact');
  await capture(page, '04-second-secret-door-closed');

  const dungeonDoorPressesBefore = await page.evaluate(() => window.COUNTRYSIDE_CABIN.input.snapshot().interactionPresses);
  await page.keyboard.press('e');
  const dungeonEntry = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    for (let index = 0; index < 18; index += 1) {
      runtime.dungeon.update(0.1, runtime.state.elapsed + index * 0.1, runtime.player.position);
    }
    runtime.teleport('dungeonAteamCaptive', 'interact');
    return {
      inputPresses: runtime.input.snapshot().interactionPresses,
      entered: runtime.story.dungeonEntered(),
      phase: runtime.story.phase(),
      doorOpen: runtime.dungeon.door.open,
      doorT: runtime.dungeon.door.t,
      colliderLive: runtime.dungeon.door.colliderLive,
      playerY: runtime.player.position.y,
      floorY: runtime.dungeon.bounds.dungeon.floorY,
    };
  });
  check('Real E-key interaction opens the second secret and removes its live collider',
    dungeonEntry.inputPresses === dungeonDoorPressesBefore + 1
      && dungeonEntry.entered && dungeonEntry.phase === 'interrogation'
      && dungeonEntry.doorOpen && dungeonEntry.doorT > 0.95 && !dungeonEntry.colliderLive);
  check('Dungeon spawn lands on its own lower floor',
    Math.abs((dungeonEntry.playerY - 1.66) - dungeonEntry.floorY) < 0.06,
    `floor ${dungeonEntry.floorY.toFixed(2)} m`);
  await clearChapterPresentation(page);
  const cellDoorReceipts = [];
  for (const id of ['West', 'East']) {
    await clearHands(page);
    await teleport(page, `dungeonCellDoor${id}`, 'interact');
    const before = await page.evaluate(() => window.COUNTRYSIDE_CABIN.input.snapshot().interactionPresses);
    await page.keyboard.press('e');
    await nextFrames(page, 2);
    cellDoorReceipts.push(await page.evaluate(({ cellId, prior }) => {
      const runtime = window.COUNTRYSIDE_CABIN;
      const id = cellId.toLowerCase();
      for (let index = 0; index < 10; index += 1) {
        runtime.dungeon.update(0.1, runtime.state.elapsed + index * 0.1, runtime.player.position);
      }
      const door = runtime.dungeon.cells[id];
      return {
        id,
        inputDelta: runtime.input.snapshot().interactionPresses - prior,
        open: door.open,
        t: door.t,
        colliderLive: door.colliderLive,
        promptEnabled: door.target.userData.interact.enabled(),
      };
    }, { cellId: id, prior: before }));
  }
  check('Both barred cell doors open inward once through the real E-key path and clear collision',
    cellDoorReceipts.every((receipt) => receipt.inputDelta === 1
      && receipt.open && receipt.t > 0.95 && !receipt.colliderLive && !receipt.promptEnabled),
    JSON.stringify(cellDoorReceipts));
  await clearHands(page);
  await teleport(page, 'dungeon', 'observe');
  await captureScene(page, '05-dungeon-overview-clean');
  await teleport(page, 'dungeonAteamCaptive', 'interact');
  await capture(page, '05-dungeon-interrogation');
  await teleport(page, 'dungeonCounterStrikeCaptive', 'interact');
  await captureScene(page, '05-dungeon-baiter-clean');

  await clearChapterPresentation(page);
  await teleport(page, 'dungeonToolPliers', 'interact');
  await page.keyboard.press('e');
  await nextFrames(page, 1);
  await teleport(page, 'basementExit', 'interact');
  const toolLadderUpBefore = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      presses: runtime.input.snapshot().interactionPresses,
      targetResolved: runtime.interaction.current === runtime.cabin.basement.exitTarget,
      selected: runtime.chapter.selectedTool,
      heldVisible: runtime.tortureTools.snapshot().visible.pliers,
    };
  });
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const toolLadderUp = await page.evaluate((prior) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      level: runtime.state.level,
      selected: runtime.chapter.selectedTool,
      heldVisible: runtime.tortureTools.snapshot().visible.pliers,
    };
  }, toolLadderUpBefore.presses);
  await teleport(page, 'basementEntrance', 'interact');
  const toolLadderDownBefore = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      presses: runtime.input.snapshot().interactionPresses,
      targetResolved: runtime.interaction.current === runtime.cabin.basement.entryTarget,
    };
  });
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const toolLadderDown = await page.evaluate((prior) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      level: runtime.state.level,
      selected: runtime.chapter.selectedTool,
      heldVisible: runtime.tortureTools.snapshot().visible.pliers,
    };
  }, toolLadderDownBefore.presses);
  await page.keyboard.press('q');
  await nextFrames(page, 1);
  const returnedTool = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      selected: runtime.chapter.selectedTool,
      tableVisible: runtime.dungeon.tools.pliers.visible,
      heldVisible: runtime.tortureTools.snapshot().visible.pliers,
    };
  });
  check('A held torture tool survives a real-E ladder round trip and real Q returns it to Gratin’s table',
    toolLadderUpBefore.targetResolved
      && toolLadderUpBefore.selected === 'pliers'
      && toolLadderUpBefore.heldVisible
      && toolLadderUp.inputDelta === 1
      && toolLadderUp.level === 'cabin'
      && toolLadderUp.selected === 'pliers'
      && toolLadderUp.heldVisible
      && toolLadderDownBefore.targetResolved
      && toolLadderDown.inputDelta === 1
      && toolLadderDown.level === 'basement'
      && toolLadderDown.selected === 'pliers'
      && toolLadderDown.heldVisible
      && returnedTool.selected === null
      && returnedTool.tableVisible
      && !returnedTool.heldVisible,
    JSON.stringify({
      upBefore: toolLadderUpBefore,
      up: toolLadderUp,
      downBefore: toolLadderDownBefore,
      down: toolLadderDown,
      returned: returnedTool,
    }));

  const toolPlan = [
    { tool: 'pliers', motion: 'clamp', feedback: 'pinch', cue: 'punch.light', actor: 'counterStrike', storyId: 'counter_strike_player', view: 'dungeonCounterStrikeCaptive' },
    { tool: 'saw', motion: 'saw', feedback: 'saw', cue: 'swing.whiff', actor: 'counterStrike', storyId: 'counter_strike_player', view: 'dungeonCounterStrikeCaptive' },
    { tool: 'battery', motion: 'shock', feedback: 'shock', cue: 'stunprod.arc', actor: 'ateam', storyId: 'ateam_member', view: 'dungeonAteamCaptive' },
    { tool: 'syringes', motion: 'jab', feedback: 'jab', cue: 'switch.click', actor: 'ateam', storyId: 'ateam_member', view: 'dungeonAteamCaptive' },
    { tool: 'towels', motion: 'smother', feedback: 'smother', cue: 'cloth.snap', actor: 'ateam', storyId: 'ateam_member', view: 'dungeonAteamCaptive' },
    { tool: 'leads', motion: 'arc', feedback: 'arc', cue: 'silent.arc', actor: 'ateam', storyId: 'ateam_member', view: 'dungeonAteamCaptive' },
    { tool: 'bucket', motion: 'douse', feedback: 'douse', cue: 'punch.heavy', actor: 'ateam', storyId: 'ateam_member', view: 'dungeonAteamCaptive' },
  ];
  const toolReceipts = [];
  let previousTool = null;
  for (const [index, plan] of toolPlan.entries()) {
    await clearChapterPresentation(page);
    await teleport(page, `dungeonTool${plan.tool[0].toUpperCase()}${plan.tool.slice(1)}`, 'interact');
    const selectBefore = await page.evaluate(() => window.COUNTRYSIDE_CABIN.input.snapshot().interactionPresses);
    await page.keyboard.press('e');
    await nextFrames(page, 1);
    const selection = await page.evaluate(({ tool, priorTool, priorPresses }) => {
      const runtime = window.COUNTRYSIDE_CABIN;
      return {
        inputDelta: runtime.input.snapshot().interactionPresses - priorPresses,
        selected: runtime.chapter.selectedTool,
        tableHidden: runtime.dungeon.tools[tool].visible === false,
        heldVisible: runtime.tortureTools.snapshot().visible[tool] === true,
        priorRestored: priorTool ? runtime.dungeon.tools[priorTool].visible === true : true,
      };
    }, { tool: plan.tool, priorTool: previousTool, priorPresses: selectBefore });

    await teleport(page, plan.view, 'interact');
    const hitBefore = await page.evaluate((storyId) => {
      const runtime = window.COUNTRYSIDE_CABIN;
      return {
        hits: runtime.story.hostageState(storyId).hits,
        inputPresses: runtime.input.snapshot().interactionPresses,
        playbackId: runtime.audio.lastPlaybackReceipt?.id ?? 0,
      };
    }, plan.storyId);
    await page.keyboard.press('e');
    await nextFrames(page, 1);
    const active = await page.evaluate(({ expected, prior }) => {
      const runtime = window.COUNTRYSIDE_CABIN;
      const actor = runtime.dungeon.actors[expected.actor].snapshot;
      const held = runtime.tortureTools.snapshot();
      const receipt = runtime.audio.playbackReceipts.find((row) => (
        row.id > prior.playbackId && row.requested === expected.cue
      ));
      return {
        inputDelta: runtime.input.snapshot().interactionPresses - prior.inputPresses,
        hits: runtime.story.hostageState(expected.storyId).hits,
        feedback: actor.feedback,
        feedbackRemaining: actor.feedbackRemaining,
        motion: held.motion,
        striking: held.striking,
        selected: runtime.chapter.selectedTool,
        cue: receipt ? {
          requested: receipt.requested,
          actual: receipt.actual,
          source: receipt.source,
          started: receipt.started,
        } : null,
      };
    }, { expected: plan, prior: hitBefore });

    let busyBlocked = true;
    if (index === 0) {
      await page.keyboard.press('e');
      await nextFrames(page, 1);
      busyBlocked = await page.evaluate(({ storyId, hits }) => (
        window.COUNTRYSIDE_CABIN.story.hostageState(storyId).hits === hits
          && window.COUNTRYSIDE_CABIN.chapter.toolUseRemaining > 0
      ), { storyId: plan.storyId, hits: active.hits });
    }
    await page.evaluate(() => {
      const runtime = window.COUNTRYSIDE_CABIN;
      while (runtime.chapter.toolUseRemaining > 0) {
        runtime.chapter.update(0.1, {
          playerPosition: runtime.player.position,
          cabinPosition: { x: 0, z: 0 },
        });
      }
      runtime.chapter.dialogue.stop?.();
      runtime.chapter.beatQueue.length = 0;
    });
    toolReceipts.push({ ...plan, selection, active, busyBlocked });
    previousTool = plan.tool;
  }

  check('All seven tools select, swap, animate, react, and sound distinct through real E-key interactions',
    toolReceipts.every(({ tool, motion, feedback, cue, selection, active }) => (
      selection.inputDelta === 1 && selection.selected === tool
        && selection.tableHidden && selection.heldVisible && selection.priorRestored
        && active.inputDelta === 1 && active.motion === motion && active.striking
        && active.feedback === feedback && active.feedbackRemaining > 0
        && active.selected === tool && active.cue?.requested === cue
        && active.cue?.actual === cue && active.cue?.source === 'buffer' && active.cue?.started
    ))
      && new Set(toolReceipts.map(({ active }) => active.motion)).size === toolPlan.length
      && new Set(toolReceipts.map(({ active }) => active.feedback)).size === toolPlan.length
      && new Set(toolReceipts.map(({ active }) => active.cue?.requested)).size === toolPlan.length,
    JSON.stringify(toolReceipts));
  check('A second input during a tool animation cannot stack interrogation damage', toolReceipts[0].busyBlocked);

  await clearChapterPresentation(page);
  await teleport(page, 'dungeonAteamCaptive', 'interact');
  const finalHitBefore = await page.evaluate(() => window.COUNTRYSIDE_CABIN.story.hostageState('ateam_member').hits);
  await page.keyboard.press('e');
  await nextFrames(page, 1);
  const interrogation = await page.evaluate(({ priorHits, toolIds }) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const { chapter, dungeon, story } = runtime;
    const finalHitApplied = story.hostageState('ateam_member').hits === priorHits + 1;
    const revealStarted = chapter.dialogue.current;
    let revealTicks = 0;
    while (!story.ateamIntelLearned() && revealTicks < 300) {
      chapter.dialogue.update(0.1);
      revealTicks += 1;
    }
    const revealBeat = {
      expected: 'ATEAM_REVEAL',
      started: revealStarted,
      completed: story.ateamIntelLearned(),
      ticks: revealTicks,
    };
    // INTERROGATION_DONE / EXECUTION_OFFER are presentation coverage in the
    // pure suite. The durable A-Team reveal above is the live integration gate.
    chapter.dialogue.stop?.();
    chapter.beatQueue.length = 0;
    chapter.callbacks.onSync?.();
    return {
      finalHitApplied,
      selectedAfterReveal: chapter.selectedTool,
      tableToolsRestored: toolIds.every((tool) => dungeon.tools[tool].visible),
      heldToolsCleared: !Object.values(runtime.tortureTools?.snapshot?.().visible ?? {}).some(Boolean),
      revealBeat,
      baiter: story.hostageState('counter_strike_player'),
      ateam: story.hostageState('ateam_member'),
      intel: story.ateamIntelLearned(),
      phase: story.phase(),
      baiterActor: dungeon.actors.counterStrike.snapshot,
      ateamActor: dungeon.actors.ateam.snapshot,
    };
  }, { priorHits: finalHitBefore, toolIds: toolPlan.map(({ tool }) => tool) });
  check('Completing the interrogation clears the scene-limited tool before the pistol',
    interrogation.finalHitApplied && interrogation.selectedAfterReveal === null
      && interrogation.tableToolsRestored && interrogation.heldToolsCleared);
  check('CS baiter breaks at 2 hits while preserving 8-hit execution durability',
    interrogation.baiter.hits === 2
      && interrogation.baiter.threshold === 2 && interrogation.baiter.maxHits === 8);
  check('A-Team captive resists until 6 hits, reveals the intel, and preserves 8-hit durability',
    interrogation.ateam.hits === 6
      && interrogation.ateam.threshold === 6 && interrogation.ateam.maxHits === 8
      && interrogation.revealBeat.started === interrogation.revealBeat.expected
      && interrogation.revealBeat.completed
      && interrogation.intel && interrogation.phase === 'execution_choice',
    JSON.stringify(interrogation.revealBeat));
  check('Mouth/head-capable live captive controllers remain present for dialogue staging',
    interrogation.baiterActor.alive && interrogation.ateamActor.alive);

  await page.evaluate(() => window.COUNTRYSIDE_CABIN.executionChoice.open());
  const choiceUi = await page.evaluate(() => ({
    active: window.COUNTRYSIDE_CABIN.executionChoice.active,
    seconds: window.COUNTRYSIDE_CABIN.executionChoice.seconds,
    remaining: window.COUNTRYSIDE_CABIN.executionChoice.remaining,
    hidden: document.getElementById('cabin-choice').classList.contains('hidden'),
    text: document.getElementById('cabin-choice').textContent,
  }));
  check('Polite yes/no execution UI opens with the full ten-second decision',
    choiceUi.active && !choiceUi.hidden && choiceUi.seconds === 10 && choiceUi.remaining > 9.7
      && /Would you mind taking care of these two for me/i.test(choiceUi.text));
  await capture(page, '06-polite-execution-choice');
  await page.keyboard.press('Digit2');
  await nextFrames(page, 1);

  const execution = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const { chapter, story } = runtime;
    const branchStarted = chapter.dialogue.current;
    let branchTicks = 0;
    while (!story.executionBranchVoComplete() && branchTicks < 300) {
      chapter.update(0.1, {
        playerPosition: runtime.player.position,
        cabinPosition: { x: 0, z: 0 },
      });
      branchTicks += 1;
    }
    const branchBeat = {
      expected: 'EXECUTION_NO',
      started: branchStarted,
      completed: story.executionBranchVoComplete(),
      ticks: branchTicks,
    };
    let executionTicks = 0;
    while (!story.deathsComplete() && executionTicks < 120) {
      chapter.update(0.1, {
        playerPosition: runtime.player.position,
        cabinPosition: { x: 0, z: 0 },
      });
      executionTicks += 1;
    }
    chapter.update(0.1, {
      playerPosition: runtime.player.position,
      cabinPosition: { x: 0, z: 0 },
    });
    const aftermathStarted = chapter.dialogue.current;
    let nightfallTicks = 0;
    while (!story.nightfallBriefingComplete() && nightfallTicks < 600) {
      chapter.update(0.1, {
        playerPosition: runtime.player.position,
        cabinPosition: { x: 0, z: 0 },
      });
      nightfallTicks += 1;
    }
    const nightfallBeats = {
      expected: 'GRATIN_EXECUTES',
      started: aftermathStarted,
      completed: story.nightfallBriefingComplete(),
      ticks: nightfallTicks,
    };
    chapter.callbacks.onSync?.();
    runtime.scene.updateMatrixWorld(true);
    const markReport = (actor) => {
      const head = actor.headAnchor.getWorldPosition(actor.headAnchor.position.clone());
      const body = actor.bodyAnchor.getWorldPosition(actor.bodyAnchor.position.clone());
      return runtime.bloodImpacts.marksFor(actor).map((mark) => {
        const point = mark.getWorldPosition(mark.position.clone());
        return {
          name: mark.name,
          owner: mark.userData.hitOwner === actor,
          parent: mark.parent?.name ?? null,
          distance: Math.min(point.distanceTo(head), point.distanceTo(body)),
        };
      });
    };
    return {
      choice: story.executionChoice(),
      branchBeat,
      executionTicks,
      nightfallBeats,
      baiter: story.hostageState('counter_strike_player'),
      ateamState: story.hostageState('ateam_member'),
      marks: {
        baiter: markReport(runtime.dungeon.actors.counterStrike),
        ateam: markReport(runtime.dungeon.actors.ateam),
      },
      deaths: story.deathsComplete(),
      night: story.nightfallComplete(),
      phase: story.phase(),
      day: runtime.campaign.state.story.day,
      timeMinutes: runtime.campaign.state.story.timeMinutes,
      dark: runtime.time.isDark,
    };
  });
  check('Real 2-key refusal lets Gratin perform both executions after his NO branch',
    execution.choice === 'gratin'
      && execution.branchBeat.started === execution.branchBeat.expected
      && execution.branchBeat.completed
      && execution.executionTicks > 0
      && execution.baiter.hits === 8 && execution.ateamState.hits === 8
      && execution.baiter.dead && execution.ateamState.dead,
    JSON.stringify(execution.branchBeat));
  check('Both Gratin shots leave bounded body-attached impact and spatter marks',
    Object.values(execution.marks).every((marks) => marks.length === 2
      && marks.every((mark) => mark.owner
        && /blood\.(?:impact|spatter)/.test(mark.name)
        && mark.distance < 0.75)),
    JSON.stringify(execution.marks));
  /* CABIN_NIGHTFALL moved Day 5 -> Day 3 with the beats 3-7 rewire; the hour
   * it names, 20:45, never changed. Same for the blackout below at 09:30. */
  check('Both deaths switch the Cabin world to Day 3 at 20:45 nightfall',
    execution.deaths && execution.night
      && execution.nightfallBeats.started === execution.nightfallBeats.expected
      && execution.nightfallBeats.completed
      && execution.phase === 'wrap_bodies'
      && execution.day === 3 && execution.timeMinutes === 20 * 60 + 45 && execution.dark,
    `day ${execution.day}, minute ${execution.timeMinutes}; ${JSON.stringify(execution.nightfallBeats)}`);
  await clearHands(page);
  await teleport(page, 'dungeonCounterStrikeCaptive', 'interact');
  await capture(page, '07-night-dungeon-aftermath');

  const wrapPlan = [
    { storyId: 'counter_strike_player', cleanupId: 'counterstrike-player', actor: 'counterStrike', view: 'dungeonCounterStrikeCaptive' },
    { storyId: 'ateam_member', cleanupId: 'a-team-member', actor: 'ateam', view: 'dungeonAteamCaptive' },
  ];
  const wrapReceipts = [];
  for (const plan of wrapPlan) {
    await clearHands(page);
    await teleport(page, plan.view, 'interact');
    const before = await page.evaluate(({ actor }) => {
      const runtime = window.COUNTRYSIDE_CABIN;
      const target = runtime.dungeon.actors[actor].bodyTarget;
      return {
        presses: runtime.input.snapshot().interactionPresses,
        targetResolved: runtime.interaction.current === target,
        current: runtime.interaction.current?.name ?? null,
        enabled: target.userData.interact.enabled(),
        label: target.userData.interact.label(),
      };
    }, plan);
    await page.keyboard.press('e');
    await nextFrames(page, 2);
    const after = await page.evaluate(({ storyId, cleanupId, actor, prior }) => {
      const runtime = window.COUNTRYSIDE_CABIN;
      return {
        inputDelta: runtime.input.snapshot().interactionPresses - prior,
        story: runtime.story.hostageState(storyId),
        cleanupPhase: runtime.cleanup.bodies.get(cleanupId)?.phase ?? null,
        actorWrapped: runtime.dungeon.actors[actor].snapshot.wrapped,
        directPromptDisabled: !runtime.dungeon.actors[actor].bodyTarget.userData.interact.enabled(),
        phase: runtime.story.phase(),
      };
    }, { ...plan, prior: before.presses });
    wrapReceipts.push({ ...plan, before, after });
    await clearChapterPresentation(page);
  }
  const wrapped = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      cleanup: runtime.cleanup.snapshot(),
      phase: runtime.story.phase(),
      gratinZ: runtime.dungeon.actors.gratin.group.position.z,
      gratinVisible: runtime.dungeon.actors.gratin.group.visible,
    };
  });
  check('Real E on each dead captive wraps its canonical body directly and disables the living prompt',
    wrapReceipts.every(({ before, after }) => (
      before.targetResolved
        && before.enabled
        && /^Wrap the /i.test(before.label)
        && after.inputDelta === 1
        && after.story.dead
        && after.story.wrapped
        && after.cleanupPhase === 'wrapped'
        && after.actorWrapped
        && after.directPromptDisabled
    ))
      && Object.values(wrapped.cleanup.bodies).every(({ phase }) => phase === 'wrapped')
      && wrapped.phase === 'carry_bodies',
    JSON.stringify(wrapReceipts));
  check('Gratin stays in the dungeon until the physical carry is actually complete',
    wrapped.gratinVisible && wrapped.gratinZ > 10);
  await clearHands(page);
  await teleport(page, 'dungeon', 'observe');
  await capture(page, '08-wrapped-bodies-in-dungeon');
  await captureScene(page, '08-wrapped-bodies-clean');

  const firstCarryRoute = await extractBodyThroughRealRoute(page, 'counterstrike-player');
  check('Real-E carry keeps the first body attached through corridor, ladder, cabin, yard, and pyre',
    firstCarryRoute.pickupSetup.targetResolved
      && /^Carry /i.test(firstCarryRoute.pickupSetup.label)
      && firstCarryRoute.pickup.inputDelta === 1
      && firstCarryRoute.pickup.carrying === 'counterstrike-player'
      && firstCarryRoute.pickup.cleanupCarrying === 'counterstrike-player'
      && firstCarryRoute.pickup.phase === 'carrying'
      && firstCarryRoute.pickup.parentIsCamera
      && firstCarryRoute.cellExitRoute.length === 4
      && Math.hypot(
        firstCarryRoute.cellExitRoute[0].start.position[0] - firstCarryRoute.pickupSetup.position[0],
        firstCarryRoute.cellExitRoute[0].start.position[2] - firstCarryRoute.pickupSetup.position[2],
      ) < 0.02
      && firstCarryRoute.cellExitRoute.every(({ start, end }) => (
        start.carrying === 'counterstrike-player'
          && end.carrying === 'counterstrike-player'
          && end.level === 'basement'
          && end.distance <= 0.10
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'counterstrike-player'
          && end.penetrations.length === 0
          && Math.abs(end.feet - end.ground) < 0.08
          && end.movementPresses > start.movementPresses
      ))
      && firstCarryRoute.corridorStart.position[2] - firstCarryRoute.corridorExit.position[2] > 5.5
      && firstCarryRoute.corridorExit.movementPresses > firstCarryRoute.corridorStart.movementPresses
      && firstCarryRoute.corridorExit.carrying === 'counterstrike-player'
      && firstCarryRoute.corridorRoute.length === 8
      && firstCarryRoute.corridorRoute.every(({ start, end }) => (
        start.carrying === 'counterstrike-player'
          && end.carrying === 'counterstrike-player'
          && end.distance <= 0.10
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'counterstrike-player'
          && end.penetrations.length === 0
          && end.movementPresses > start.movementPresses
      ))
      && firstCarryRoute.cellarTraverse.length === 3
      && firstCarryRoute.cellarTraverse.every(({ start, end }) => (
        start.carrying === 'counterstrike-player'
          && end.carrying === 'counterstrike-player'
          && end.level === 'basement'
          && end.distance <= 0.10
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'counterstrike-player'
          && end.penetrations.length === 0
          && Math.abs(end.feet - end.ground) < 0.08
          && end.movementPresses > start.movementPresses
      ))
      && firstCarryRoute.ladderApproach.targetResolved
      && firstCarryRoute.ladderApproach.level === 'basement'
      && firstCarryRoute.ladderApproach.carrying === 'counterstrike-player'
      && /^Climb back up /i.test(firstCarryRoute.ladderApproach.label)
      && firstCarryRoute.ladderUp.inputDelta === 1
      && firstCarryRoute.ladderUp.level === 'cabin'
      && firstCarryRoute.ladderUp.carrying === 'counterstrike-player'
      && firstCarryRoute.ladderUp.cleanupCarrying === 'counterstrike-player'
      && firstCarryRoute.ladderUp.parentIsCamera
      && firstCarryRoute.closetExitRoute.length === 2
      && Math.hypot(
        firstCarryRoute.closetExitRoute[0].start.position[0] - firstCarryRoute.ladderUp.position[0],
        firstCarryRoute.closetExitRoute[0].start.position[2] - firstCarryRoute.ladderUp.position[2],
      ) < 0.02
      && firstCarryRoute.closetExitRoute.every(({ start, end }) => (
        start.carrying === 'counterstrike-player'
          && end.carrying === 'counterstrike-player'
          && end.level === 'cabin'
          && end.distance <= 0.10
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'counterstrike-player'
          && end.penetrations.length === 0
          && Math.abs(end.feet - end.ground) < 0.08
          && end.movementPresses > start.movementPresses
      ))
      && firstCarryRoute.surfaceRoute.length === 8
      && firstCarryRoute.surfaceRoute.every(({ start, end }) => (
        start.carrying === 'counterstrike-player'
          && end.carrying === 'counterstrike-player'
          && end.level === 'cabin'
          && end.distance <= 0.25
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'counterstrike-player'
          && end.penetrations.length === 0
          && end.movementPresses > start.movementPresses
      ))
      && !firstCarryRoute.cabinDoorApproach.wasOpen
      && firstCarryRoute.cabinDoorApproach.targetResolved
      && /^Open the /i.test(firstCarryRoute.cabinDoorApproach.label)
      && firstCarryRoute.cabinDoorOpen.inputDelta === 1
      && firstCarryRoute.cabinDoorOpen.open
      && firstCarryRoute.cabinDoorOpen.openness > 0.92
      && firstCarryRoute.cabinDoorOpen.animationReached
      && firstCarryRoute.cabinDoorOpen.animationFrames > 0
      && !firstCarryRoute.cabinDoorOpen.alreadyOpen
      && firstCarryRoute.cabinDoorOpen.carrying === 'counterstrike-player'
      && firstCarryRoute.fireApproach.targetResolved
      && /^Place the body /i.test(firstCarryRoute.fireApproach.label)
      && firstCarryRoute.placed.inputDelta === 1
      && firstCarryRoute.placed.bodyPhase === 'at-fire'
      && firstCarryRoute.placed.carrying === null
      && firstCarryRoute.placed.cleanupCarrying === null
      && firstCarryRoute.placed.phase === 'carry_bodies'
      && !firstCarryRoute.placed.castAtFire,
    JSON.stringify(firstCarryRoute));
  await clearHands(page);
  await teleport(page, 'basementEntrance', 'interact');
  const secondDescentBefore = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      presses: runtime.input.snapshot().interactionPresses,
      targetResolved: runtime.interaction.current === runtime.cabin.basement.entryTarget,
      current: runtime.interaction.current?.name ?? null,
    };
  });
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const secondDescent = await page.evaluate((prior) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      level: runtime.state.level,
      ground: runtime.player.ground,
      carrying: runtime.state.carryingBody,
    };
  }, secondDescentBefore.presses);
  const secondCarryRoute = await extractBodyThroughRealRoute(page, 'a-team-member', {
    checkCarrySuppression: true,
  });

  const carryRoute = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const castAtFireAfterTwo = runtime.chapter.snapshot().castAtFire;
    const lagNpc = runtime.cabin.lag.npc;
    const gratinNpc = runtime.dungeon.actors.gratin;
    const seats = runtime.cleanup.dressing.seats;
    const lagAt = lagNpc.group.getWorldPosition(lagNpc.group.position.clone());
    const gratinAt = gratinNpc.group.getWorldPosition(gratinNpc.group.position.clone());
    const lagSeat = seats[0].getWorldPosition(seats[0].position.clone());
    const gratinSeat = seats[1].getWorldPosition(seats[1].position.clone());
    const objectiveRows = [...document.querySelectorAll('#objectives .olist li')]
      .map((item) => item.textContent.trim());
    const objectiveHint = document.querySelector('#objectives .ohint')?.textContent.trim() ?? '';
    return {
      cleanup: runtime.cleanup.snapshot(),
      phase: runtime.story.phase(),
      objectiveRows,
      objectiveHint,
      objectivePlan: runtime.story.objectivePlan(),
      castAtFireAfterTwo,
      lagSeatDistance: Math.hypot(lagAt.x - lagSeat.x, lagAt.z - lagSeat.z),
      gratinSeatDistance: Math.hypot(gratinAt.x - gratinSeat.x, gratinAt.z - gratinSeat.z),
      lagJob: lagNpc.job,
      gratinJob: gratinNpc.job,
      lagSeated: lagNpc.seated,
      gratinSeated: gratinNpc.seated,
    };
  });
  check('The second body repeats the real corridor, ladder, cabin, yard, and pyre route without a soft lock',
    secondDescentBefore.targetResolved
      && secondDescent.inputDelta === 1
      && secondDescent.level === 'basement'
      && secondDescent.ground < -3
      && secondDescent.carrying === null
      && secondCarryRoute.pickupSetup.targetResolved
      && secondCarryRoute.pickup.inputDelta === 1
      && secondCarryRoute.pickup.carrying === 'a-team-member'
      && secondCarryRoute.pickup.parentIsCamera
      && secondCarryRoute.cellExitRoute.length === 4
      && Math.hypot(
        secondCarryRoute.cellExitRoute[0].start.position[0] - secondCarryRoute.pickupSetup.position[0],
        secondCarryRoute.cellExitRoute[0].start.position[2] - secondCarryRoute.pickupSetup.position[2],
      ) < 0.02
      && secondCarryRoute.cellExitRoute.every(({ start, end }) => (
        start.carrying === 'a-team-member'
          && end.carrying === 'a-team-member'
          && end.level === 'basement'
          && end.distance <= 0.10
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'a-team-member'
          && end.penetrations.length === 0
          && Math.abs(end.feet - end.ground) < 0.08
          && end.movementPresses > start.movementPresses
      ))
      && secondCarryRoute.corridorStart.position[2] - secondCarryRoute.corridorExit.position[2] > 5.5
      && secondCarryRoute.corridorExit.movementPresses > secondCarryRoute.corridorStart.movementPresses
      && secondCarryRoute.corridorExit.carrying === 'a-team-member'
      && secondCarryRoute.corridorRoute.length === 8
      && secondCarryRoute.corridorRoute.every(({ start, end }) => (
        start.carrying === 'a-team-member'
          && end.carrying === 'a-team-member'
          && end.distance <= 0.10
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'a-team-member'
          && end.penetrations.length === 0
          && end.movementPresses > start.movementPresses
      ))
      && secondCarryRoute.cellarTraverse.length === 3
      && secondCarryRoute.cellarTraverse.every(({ start, end }) => (
        start.carrying === 'a-team-member'
          && end.carrying === 'a-team-member'
          && end.level === 'basement'
          && end.distance <= 0.10
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'a-team-member'
          && end.penetrations.length === 0
          && Math.abs(end.feet - end.ground) < 0.08
          && end.movementPresses > start.movementPresses
      ))
      && secondCarryRoute.ladderApproach.targetResolved
      && secondCarryRoute.ladderApproach.level === 'basement'
      && secondCarryRoute.ladderApproach.carrying === 'a-team-member'
      && secondCarryRoute.ladderUp.inputDelta === 1
      && secondCarryRoute.ladderUp.level === 'cabin'
      && secondCarryRoute.ladderUp.carrying === 'a-team-member'
      && secondCarryRoute.ladderUp.parentIsCamera
      && secondCarryRoute.closetExitRoute.length === 2
      && Math.hypot(
        secondCarryRoute.closetExitRoute[0].start.position[0] - secondCarryRoute.ladderUp.position[0],
        secondCarryRoute.closetExitRoute[0].start.position[2] - secondCarryRoute.ladderUp.position[2],
      ) < 0.02
      && secondCarryRoute.closetExitRoute.every(({ start, end }) => (
        start.carrying === 'a-team-member'
          && end.carrying === 'a-team-member'
          && end.level === 'cabin'
          && end.distance <= 0.10
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'a-team-member'
          && end.penetrations.length === 0
          && Math.abs(end.feet - end.ground) < 0.08
          && end.movementPresses > start.movementPresses
      ))
      && secondCarryRoute.surfaceRoute.length === 8
      && secondCarryRoute.surfaceRoute.every(({ start, end }) => (
        start.carrying === 'a-team-member'
          && end.carrying === 'a-team-member'
          && end.level === 'cabin'
          && end.distance <= 0.25
          && end.reached
          && end.frames > 0
          && end.inputDelta === 1
          && end.lastMovementCode === 'KeyW'
          && end.keyHeld
          && end.keyReleased
          && end.carryingAfterRelease === 'a-team-member'
          && end.penetrations.length === 0
          && end.movementPresses > start.movementPresses
      ))
      && secondCarryRoute.cabinDoorApproach.wasOpen
      && secondCarryRoute.cabinDoorApproach.openness > 0.92
      && secondCarryRoute.cabinDoorOpen.inputDelta === 0
      && secondCarryRoute.cabinDoorOpen.open
      && secondCarryRoute.cabinDoorOpen.openness > 0.92
      && secondCarryRoute.cabinDoorOpen.animationReached
      && secondCarryRoute.cabinDoorOpen.animationFrames === 0
      && secondCarryRoute.cabinDoorOpen.alreadyOpen
      && secondCarryRoute.cabinDoorOpen.carrying === 'a-team-member'
      && secondCarryRoute.fireApproach.targetResolved
      && secondCarryRoute.placed.inputDelta === 1
      && secondCarryRoute.placed.bodyPhase === 'at-fire'
      && secondCarryRoute.placed.carrying === null
      && secondCarryRoute.placed.phase === 'pour_gas'
      && secondCarryRoute.placed.castAtFire
      && Object.values(carryRoute.cleanup.bodies).every(({ phase }) => phase === 'at-fire'),
    JSON.stringify({ descent: secondDescent, route: secondCarryRoute }));
  check('A real carry input suppresses sprint and jump to protect the corridor and ladder route',
    secondCarryRoute.carrySuppression?.carrying === 'a-team-member'
      && !secondCarryRoute.carrySuppression?.sprinting
      && !secondCarryRoute.carrySuppression?.shift
      && !secondCarryRoute.carrySuppression?.jump,
    JSON.stringify(secondCarryRoute.carrySuppression));
  check('Lag and Gratin move to the bonfire only after both bodies arrive',
    !firstCarryRoute.placed.castAtFire && carryRoute.castAtFireAfterTwo
      && carryRoute.lagSeatDistance < 0.05 && carryRoute.gratinSeatDistance < 0.05
      && carryRoute.lagJob === 'drink' && carryRoute.gratinJob === 'drink'
      && carryRoute.lagSeated && carryRoute.gratinSeated,
    JSON.stringify({
      castAfterOne: firstCarryRoute.placed.castAtFire,
      castAfterTwo: carryRoute.castAtFireAfterTwo,
      lagSeatDistance: carryRoute.lagSeatDistance,
      gratinSeatDistance: carryRoute.gratinSeatDistance,
    }));
  const cleanupObjectiveText = [...carryRoute.objectiveRows, carryRoute.objectiveHint].join(' ');
  check('Burn-body cleanup exposes gasoline as the only current soft step',
    carryRoute.phase === 'pour_gas'
      && carryRoute.objectiveRows.length === 1
      && carryRoute.objectiveRows[0] === 'Burn the bodies'
      && /gasoline/i.test(carryRoute.objectiveHint)
      && carryRoute.objectivePlan.id === 'cabin.burn_bodies'
      && !/light|ignite/i.test(cleanupObjectiveText),
    JSON.stringify({ rows: carryRoute.objectiveRows, hint: carryRoute.objectiveHint }));

  const gasApproach = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const target = runtime.cleanup.interactionDescriptors.gasCan.target;
    runtime.scene.updateMatrixWorld(true);
    const focus = target.getWorldPosition(target.position.clone());
    focus.y += 0.36;
    const player = runtime.player;
    const stand = focus.clone();
    stand.z += 1.62;
    const floor = runtime.cabin.groundAt(stand.x, stand.z, player.position.y - player.eyeHeight);
    player._tween = null;
    player.mode = 'walk';
    player.position.set(stand.x, floor + 1.66, stand.z);
    player.ground = floor;
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    player.jumpHeight = 0;
    player.grounded = true;
    player.crouching = false;
    player.sprinting = false;
    player.velocity.set(0, 0, 0);
    player.clearKeys();
    const delta = focus.clone().sub(player.position);
    player.yaw = Math.atan2(-delta.x, -delta.z);
    player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.state.level = 'cabin';
    runtime.input.clear('cabin-verifier-gas-can');
    player.update(0);
    runtime.player.camera.updateMatrixWorld(true);
    runtime.interaction.setPaused(false);
    runtime.interaction.update(0);
    const currentLabel = runtime.interaction.current?.userData?.interact?.label;
    return {
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      label: typeof currentLabel === 'function' ? currentLabel() : currentLabel ?? null,
      presses: runtime.input.snapshot().interactionPresses,
      position: player.position.toArray(),
      target: focus.toArray(),
    };
  });
  await nextFrames(page, 2);
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const gas = await page.evaluate((prior) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      storyGas: runtime.story.gasPoured(),
      cleanupGas: runtime.cleanup.snapshot().gasPoured,
      phase: runtime.story.phase(),
    };
  }, gasApproach.presses);
  await clearChapterPresentation(page);

  const ignitionSetupTeleport = await teleport(page, 'firepit', 'interact');
  const ignitionApproach = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const target = runtime.cleanup.interactionDescriptors.fire.target;
    runtime.scene.updateMatrixWorld(true);
    const focus = target.getWorldPosition(target.position.clone());
    const delta = focus.clone().sub(runtime.player.position);
    runtime.player.yaw = Math.atan2(-delta.x, -delta.z);
    runtime.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.player.velocity.set(0, 0, 0);
    runtime.player.clearKeys();
    runtime.player.update(0);
    runtime.player.camera.updateMatrixWorld(true);
    runtime.interaction.update(0);
    const currentLabel = runtime.interaction.current?.userData?.interact?.label;
    return {
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      label: typeof currentLabel === 'function' ? currentLabel() : currentLabel ?? null,
      presses: runtime.input.snapshot().interactionPresses,
    };
  });
  await page.keyboard.press('e');
  await nextFrames(page, 2);
  const fire = await page.evaluate((prior) => {
    const runtime = window.COUNTRYSIDE_CABIN;
    runtime.chapter.dialogue.stop?.();
    runtime.chapter.beatQueue.length = 0;
    runtime.cleanup.update(1.5);
    return {
      inputDelta: runtime.input.snapshot().interactionPresses - prior,
      cleanup: runtime.cleanup.snapshot(),
      storyGas: runtime.story.gasPoured(),
      storyIgnited: runtime.story.bonfireIgnited(),
      phase: runtime.story.phase(),
      dressing: runtime.cleanup.geometry.dressing,
    };
  }, ignitionApproach.presses);
  check('Real E on the authored gasoline can and pyre lights both bodies',
    gasApproach.targetResolved
      && /gasoline/i.test(gasApproach.label)
      && gas.inputDelta === 1
      && gas.storyGas
      && gas.cleanupGas
      && gas.phase === 'ignite_bonfire'
      && ignitionSetupTeleport
      && ignitionApproach.targetResolved
      && /ignite/i.test(ignitionApproach.label)
      && fire.inputDelta === 1
      && fire.storyGas
      && fire.storyIgnited
      && fire.cleanup.gasPoured && fire.cleanup.ignited
      && Object.values(fire.cleanup.bodies).every(({ phase }) => phase === 'burning'),
    JSON.stringify({ gasApproach, gas, ignitionApproach, fire }));
  check('Bonfire dressing includes the authored drinks, whiskey, and cigarettes',
    fire.dressing.beerCans >= 1 && fire.dressing.whiskeyBottles >= 1 && fire.dressing.cigarettePacks >= 1,
    JSON.stringify(fire.dressing));
  await clearHands(page);
  await teleport(page, 'firepit', 'observe');
  await capture(page, '09-night-bonfire-bonding');
  await captureScene(page, '09-night-bonfire-clean');

  /* Keep the authored 950/1150 ms blackout curtains, but install the test
   * clock immediately before they are scheduled. SwiftShader can starve these
   * late nested timers after both physical extraction routes; runFor executes
   * the same callbacks deterministically without changing shipping timing. */
  await page.clock.install({ time: Date.now() });
  const blackoutStarted = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    runtime.story.completeFireCleanup();
    runtime.story.drink();
    runtime.chapter.dialogue.stop?.();
    runtime.chapter.beatQueue.length = 0;
    return runtime.chapter._blackout();
  });
  check('Fire bonding can enter the authored blackout transition', blackoutStarted);
  await page.clock.runFor(2300);
  await page.clock.resume();
  const blackoutSettled = await page.evaluate(() => (
    window.COUNTRYSIDE_CABIN.story.blackedOut()
      && window.COUNTRYSIDE_CABIN.state.resting === false
  ));
  if (!blackoutSettled) {
    throw new Error('Authored blackout timers did not settle after 2300 deterministic milliseconds');
  }
  const morning = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const wakeCheckpoint = {
      day: runtime.campaign.state.story.day,
      timeMinutes: runtime.campaign.state.story.timeMinutes,
      dark: runtime.time.isDark,
      player: runtime.player.position.toArray(),
      wake: runtime.cabin.spawns.wake.position.toArray(),
    };
    /* Waking only makes Booski's call due. Do not complete it before sampling
     * the gated morning state; the explicit afterBillyCall block below owns
     * the one real story transition this verifier is proving. */
    runtime.chapter.callbacks.onSync?.();
    runtime.chapter.callbacks.onWakeMorning?.({ restored: true });
    return {
      chapterComplete: runtime.story.chapterComplete(),
      phase: runtime.story.phase(),
      leave: runtime.story.tryLeave(),
      day: runtime.campaign.state.story.day,
      timeMinutes: runtime.campaign.state.story.timeMinutes,
      dark: runtime.time.isDark,
      spawn: runtime.campaign.state.scene.spawn,
      player: runtime.player.position.toArray(),
      wake: runtime.cabin.spawns.wake.position.toArray(),
      wakeCheckpoint,
      /* BEAT 7 IS NOT OVER WHEN HE WAKES. Booski still has to ring about
       * Billy, and the door says stay put until he does. Drive that last
       * call here so the exit itself is proved, not just the morning. */
      afterBillyCall: (() => {
        const rang = runtime.story.completeBillyCall();
        return {
          rang,
          chapterComplete: runtime.story.chapterComplete(),
          phase: runtime.story.phase(),
          leave: runtime.story.tryLeave(),
        };
      })(),
    };
  });
  check('Blackout restores Tony fine in bed on Day 4 at 09:30',
    morning.wakeCheckpoint.day === 4 && morning.wakeCheckpoint.timeMinutes === 9 * 60 + 30
      && !morning.wakeCheckpoint.dark
      && Math.hypot(
        morning.wakeCheckpoint.player[0] - morning.wakeCheckpoint.wake[0],
        morning.wakeCheckpoint.player[2] - morning.wakeCheckpoint.wake[2],
      ) < 0.1,
    `day ${morning.wakeCheckpoint.day}, minute ${morning.wakeCheckpoint.timeMinutes}`);
  /* THE OLD ASSERTION WAS THE OLD ROUTE. It expected the morning wake to
   * finish the chapter and release the car toward the Silver Case on Day 8 --
   * which is how a save that reached this cabin after the bank used to leave.
   * Beat 7 ends at the Bing now: the wake lands at 09:30 on Day 4 with
   * Booski's call about Billy still owed, and `tryLeave` holds the car with
   * `cabin_wait` until it comes. Measured, not assumed. */
  check('The morning wake leaves Booski’s call owed, and the car still gated',
    !morning.chapterComplete && morning.phase === 'billy_call'
      && morning.leave.kind === 'stay' && morning.leave.id === 'cabin_wait'
      && morning.day === 4 && morning.timeMinutes === 9 * 60 + 30,
    `phase ${morning.phase}, complete ${morning.chapterComplete}, `
      + `door ${JSON.stringify(morning.leave)}, day ${morning.day}, minute ${morning.timeMinutes}`);
  check('Booski’s call about Billy closes the chapter and points the car at the Bing',
    morning.afterBillyCall.rang && morning.afterBillyCall.chapterComplete
      && morning.afterBillyCall.leave.kind === 'go'
      && morning.afterBillyCall.leave.destination === 'bada_bing_two',
    JSON.stringify(morning.afterBillyCall));
  await capture(page, '10-morning-wake');

  await clearHands(page);
  const exitSetupTeleport = await teleport(page, 'car', 'interact');
  const exitBefore = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const loopKeys = [...runtime.audio.loops.keys()];
    const currentLabel = runtime.interaction.current?.userData?.interact?.label;
    return {
      targetResolved: runtime.interaction.current === runtime.cabin.carTarget,
      current: runtime.interaction.current?.name ?? null,
      label: typeof currentLabel === 'function' ? currentLabel() : currentLabel ?? null,
      presses: runtime.input.snapshot().interactionPresses,
      leave: runtime.story.tryLeave(),
      receiverOn: runtime.radio.on,
      receiverPreferredOn: runtime.radio.preferredOn,
      receiverPaused: runtime.radio._paused,
      receiverVoiceActive: runtime.radio._voice !== null,
      receiverSongPlaying: runtime.radio.songPlaying,
      receiverMediaPaused: !runtime.radio.el || runtime.radio.el.paused,
      receiverPlacement: runtime.radio.position.distanceTo(runtime.cabin.radioPos),
      loopKeys,
      radioLoopKeys: loopKeys.filter((key) => key.startsWith('radio.')),
    };
  });
  /* THE DOOR REALLY OPENS, AND THE PROBE HAS TO EXPECT THAT.
   *
   * `tryLeave` above already answers `go -> bada_bing_two`, so pressing E at
   * the car does for this verifier exactly what it does for the player: 900 ms
   * of BILLY IS OUT, and then `location.assign('bing.html?visit=2')`. The old
   * probe read the teardown back with a `page.evaluate` AFTER the press and
   * kept losing that race -- "Execution context was destroyed, most likely
   * because of a navigation" is the campaign working, not the campaign broken,
   * and it cost this file its last check.
   *
   * So take the receipt inside the page, on the first frame the exit is live,
   * and park it in `sessionStorage`, which survives a same-origin navigation.
   * `leaveCabin` is synchronous from `state.phase = 'leaving'` all the way
   * through `radio.pause()` and the four `audio.stopLoop` calls -- `stopLoop`
   * deletes its key before it schedules the fade -- so a frame that can see
   * the phase can already see the whole teardown. */
  await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    window.sessionStorage.removeItem('__cabinExitReceipt');
    const watch = () => {
      if (runtime.state.phase !== 'leaving') {
        requestAnimationFrame(watch);
        return;
      }
      const loopKeys = [...runtime.audio.loops.keys()];
      const input = runtime.input.snapshot();
      window.sessionStorage.setItem('__cabinExitReceipt', JSON.stringify({
        presses: input.interactionPresses,
        phase: runtime.state.phase,
        inputSuspended: input.suspended,
        interactionPaused: runtime.interaction.paused,
        interactionCleared: runtime.interaction.current === null,
        receiverOn: runtime.radio.on,
        receiverPreferredOn: runtime.radio.preferredOn,
        receiverPaused: runtime.radio._paused,
        receiverVoiceCleared: runtime.radio._voice === null,
        receiverMediaPaused: !runtime.radio.el || runtime.radio.el.paused,
        loopKeys,
        radioLoopKeys: loopKeys.filter((key) => key.startsWith('radio.')),
        cabinLoopKeys: loopKeys.filter((key) => key.startsWith('cabin.')),
      }));
    };
    requestAnimationFrame(watch);
  });
  await page.keyboard.press('e');
  /* `commit` and not `load`: the proof owed here is that the campaign left
   * this page for that href. Sitting through a whole second WebGL scene's boot
   * would only add the Bing's problems to the Cabin's ledger. */
  await page.waitForURL(/bing\.html/, { waitUntil: 'commit' });
  /* The browser belongs to Bada Bing II from here. Stop charging the Cabin for
   * what happens in it -- including the aborted media requests this very
   * navigation leaves behind on the page it just unloaded. */
  watchingCabinPage = false;
  const departure = await page.evaluate(() => {
    const receipt = window.sessionStorage.getItem('__cabinExitReceipt');
    return { url: window.location.href, receipt: receipt ? JSON.parse(receipt) : null };
  });
  const destination = new URL(departure.url);
  check('Real E at the car hands the browser to Bada Bing II at bing.html?visit=2',
    destination.pathname.endsWith('/bing.html')
      && destination.searchParams.get('visit') === '2',
    departure.url);
  const exitAfter = departure.receipt
    ? { ...departure.receipt, inputDelta: departure.receipt.presses - exitBefore.presses }
    : { inputDelta: null };
  check('the Cabin chapter exit tears down the physical receiver with no stale radio beds',
    exitSetupTeleport
      && exitBefore.targetResolved
      && exitBefore.leave.kind === 'go'
      && exitBefore.leave.destination === 'bada_bing_two'
      && exitBefore.receiverOn
      && exitBefore.receiverPreferredOn
      && !exitBefore.receiverPaused
      && exitBefore.receiverPlacement < 0.001
      && exitBefore.radioLoopKeys.length > 0
      && exitAfter.inputDelta === 1
      && exitAfter.phase === 'leaving'
      && exitAfter.inputSuspended
      && exitAfter.interactionPaused
      && exitAfter.interactionCleared
      && exitAfter.receiverOn
      && exitAfter.receiverPreferredOn
      && exitAfter.receiverPaused
      && exitAfter.receiverVoiceCleared
      && exitAfter.receiverMediaPaused
      && exitAfter.radioLoopKeys.length === 0
      && exitAfter.cabinLoopKeys.length === 0,
    JSON.stringify({ before: exitBefore, after: exitAfter }));

  check('Live Cabin browser produced no page, console, or request failures', problems.length === 0,
    problems.slice(0, 3).join(' | '));
} catch (error) {
  problems.push(error?.stack || error?.message || String(error));
  check('Cabin browser certification completed', false, error?.message || String(error));
} finally {
  await browser?.close?.().catch(() => {});
  await new Promise((resolve) => server?.close?.(resolve) ?? resolve());
}

const failed = results.filter(({ ok }) => !ok);
console.log(`\nCabin live certification: ${results.length - failed.length}/${results.length} checks passed.`);
if (SCREENSHOT_DIR) console.log(`Screenshots: ${SCREENSHOT_DIR}`);
if (missingRecordings.length) {
  console.log(`Voice handoff: ${missingRecordings.length} authored recordings are still intentionally absent.`);
}
if (problems.length) {
  console.error('\nRuntime problems:');
  for (const problem of problems) console.error(`  - ${problem}`);
}
if (failed.length || problems.length) process.exitCode = 1;
