#!/usr/bin/env node
/**
 * Focused browser proof for the countryside cabin hub.
 *
 * This complements the pure story/field tests by booting the real WebGL page,
 * inspecting the authored world contract, starting play, visiting the whole
 * property through the public debug surface, and proving the one-night gate.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5247;
const LAG_VOICE_PREFIX = 'vo.cabin.lag.';
const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(soundIndex.files || []);
const lagVoiceCues = soundManifest.sfx.filter(({ name }) => name?.startsWith(LAG_VOICE_PREFIX));
const lagCueByName = new Map(lagVoiceCues.map((cue) => [cue.name, cue]));
const missingLagDeliveries = lagVoiceCues.filter((cue) => {
  const file = cue.file || `${cue.name}.mp3`;
  return !indexedFiles.has(file) || !fs.existsSync(path.join(ROOT, 'assets', 'sfx', file));
});
/** Budget for the waits that advance on rendered frames; see the note below. */
const FRAME_BOUND_WAIT_MS = 600000;
/** A semantic control response may need dozens of SwiftShader frames. */
const CONTROL_RESPONSE_WAIT_MS = 45000;
const WALK_EYE_HEIGHT = 1.66;
const SCREENSHOT_DIR = process.env.CABIN_SCREENSHOT_DIR
  ? path.resolve(process.env.CABIN_SCREENSHOT_DIR)
  : process.argv.includes('--screenshots')
    ? path.join(ROOT, '.artifacts', 'cabin')
    : null;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const problems = [];
const results = [];
let browser;
let server;

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

async function capture(page, name) {
  if (!SCREENSHOT_DIR) return;
  await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
}

function wrappedAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

/**
 * Rotate the production Player through Playwright's real pointer-lock mouse
 * path. The verifier may read the pose to calculate the required relative
 * motion; it never writes yaw/pitch or calls Player.handleMouseMove itself.
 */
async function aimWithMouse(page, pointer, { yaw, pitch = null }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pose = await page.evaluate(() => {
      const { player } = window.COUNTRYSIDE_CABIN;
      return { yaw: player.yaw, pitch: player.pitch, sensitivity: player.sensitivity };
    });
    const yawError = wrappedAngle(yaw - pose.yaw);
    const pitchError = pitch == null ? 0 : pitch - pose.pitch;
    if (Math.abs(yawError) <= 0.018 && Math.abs(pitchError) <= 0.018) return pose;
    pointer.x += -yawError / pose.sensitivity;
    pointer.y += -pitchError / pose.sensitivity;
    await page.mouse.move(pointer.x, pointer.y);
  }
  return page.evaluate(() => {
    const { player } = window.COUNTRYSIDE_CABIN;
    return { yaw: player.yaw, pitch: player.pitch, sensitivity: player.sensitivity };
  });
}

/** Walk one collision-aware scene segment using only mouse-look + W/sprint. */
async function walkTo(page, pointer, { x, z, radius = 0.42, label }) {
  const desired = await page.evaluate(({ x: targetX, z: targetZ }) => {
    const position = window.COUNTRYSIDE_CABIN.player.position;
    return Math.atan2(-(targetX - position.x), -(targetZ - position.z));
  }, { x, z });
  await aimWithMouse(page, pointer, { yaw: desired });

  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  let reached = false;
  try {
    await page.waitForFunction(({ x: targetX, z: targetZ, radius: targetRadius }) => {
      const position = window.COUNTRYSIDE_CABIN.player.position;
      return Math.hypot(position.x - targetX, position.z - targetZ) <= targetRadius;
    }, { x, z, radius }, { polling: 'raf', timeout: FRAME_BOUND_WAIT_MS });
    reached = true;
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
  }

  const position = await page.evaluate(() => (
    window.COUNTRYSIDE_CABIN.player.position.toArray()
  ));
  return {
    label,
    target: [x, z],
    position,
    distance: Math.hypot(position[0] - x, position[2] - z),
    reached,
  };
}

try {
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(ROOT, relative || 'index.html');
      if (!file.startsWith(`${ROOT}${path.sep}`)
        || !fs.existsSync(file)
        || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(await fsp.readFile(file));
    } catch (error) {
      res.writeHead(500).end(error?.message || 'server error');
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
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  /* Collect the AudioEngine the real Cabin constructs and keep its required
   * recording policy fail-closed. The wrapper below catches only that named
   * QA exception after the engine has recorded it, so one missing Lag take
   * cannot abort the rest of the scene certification. It does not supply a
   * substitute or turn strict QA off; both delivery checks remain red. */
  await page.addInitScript(() => {
    window.__SQUATCH_QA_AUDIO__ = {
      strictRequiredRecordings: true,
      engines: [],
      violations: [],
      caught: [],
      onViolation(receipt) {
        window.__SQUATCH_QA_AUDIO__.violations.push({
          requested: receipt?.requested ?? null,
          actual: receipt?.actual ?? null,
          source: receipt?.source ?? null,
          started: receipt?.started === true,
          fallbackReason: receipt?.fallbackReason ?? null,
        });
      },
    };
  });
  page.setDefaultTimeout(180000);
  /* THE TWO WAITS THAT ARE FRAME-BOUND, NOT NETWORK-BOUND.
   *
   * A held interaction and the rest fade both advance on `dt` accumulated in
   * rendered frames -- and the cabin is 1776 meshes over 4661 instanced forest
   * repeats, rasterised in SOFTWARE. Measured on 2026-08-25 at this page's own
   * 960x600: the 2.4-second smoke took 74 s of wall clock, because the scene
   * renders at roughly two frames a second under ANGLE/SwiftShader, and the
   * same wait had already timed out once at 180 s on a busier box.
   *
   * So these two get a budget for SLOWNESS rather than the file's default.
   * It is not a licence for a hang: a state the scene never reaches still
   * fails the run, it just fails it later. Nothing asserted moved. */
  page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 320)}`);
  });
  page.on('requestfailed', (request) => {
    problems.push(`request: ${request.url()} - ${request.failure()?.errorText || 'failed'}`);
  });

  await page.goto(`http://127.0.0.1:${PORT}/cabin.html?preview=1`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => Boolean(window.COUNTRYSIDE_CABIN?.cabin));
  await page.evaluate(() => {
    const policy = window.__SQUATCH_QA_AUDIO__;
    const engine = policy?.engines?.[0];
    if (!engine) throw new Error('Cabin did not construct a certifiable AudioEngine');
    if (engine.__cabinVerifierRequiredRecordingCatch) return;
    const original = engine.playWithReceipt.bind(engine);
    engine.playWithReceipt = (name, options = {}) => {
      try {
        return original(name, options);
      } catch (error) {
        if (error?.name !== 'RequiredRecordedAudioError' || !error.receipt) throw error;
        policy.caught.push({
          requested: error.receipt.requested,
          actual: error.receipt.actual,
          source: error.receipt.source,
          started: error.receipt.started,
          fallbackReason: error.receipt.fallbackReason,
        });
        return { source: null, receipt: error.receipt };
      }
    };
    engine.__cabinVerifierRequiredRecordingCatch = true;
  });

  const boot = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const world = runtime.cabin;
    let meshes = 0;
    let instances = 0;
    world.root.traverse((object) => {
      if (object.isMesh) meshes += 1;
      if (object.isInstancedMesh) instances += object.count;
    });
    return {
      ready: Boolean(window.CABIN),
      bootFailure: !document.getElementById('bootFailure')?.hidden,
      sceneId: runtime.campaign.state.scene.id,
      spawn: runtime.campaign.state.scene.spawn,
      startDisabled: document.getElementById('start-btn')?.disabled,
      rested: runtime.story.rested(),
      leaveBeforeRest: runtime.story.tryLeave(),
      heldItem: world.inventory.held,
      lightsOn: world.state.lightsOn,
      colliders: world.colliders.length,
      floorZones: world.floorZones.length,
      utilities: Object.keys(world.utilityTargets || {}).length,
      art: world.frames?.length || 0,
      storyLandmarks: ['creek', 'overlook', 'shed', 'firepit']
        .filter((id) => world.interactionTargets?.[id]).length,
      landscape: world.landscape?.counts,
      meshes,
      instances,
    };
  });

  check('the real cabin page reaches its WebGL-ready runtime',
    boot.ready && !boot.bootFailure,
    JSON.stringify({ ready: boot.ready, bootFailure: boot.bootFailure }));
  check('preview starts at the cabin arrival without replacing the apartment',
    boot.sceneId === 'countryside_cabin' && boot.spawn === 'arrival' && !boot.startDisabled,
    JSON.stringify({ scene: boot.sceneId, spawn: boot.spawn }));
  check('the property exports the complete collision and exploration contract',
    boot.colliders >= 650 && boot.floorZones >= 10 && boot.storyLandmarks === 4,
    JSON.stringify({ colliders: boot.colliders, floorZones: boot.floorZones, landmarks: boot.storyLandmarks }));
  check('the cabin carries apartment-scale utilities and imported art',
    boot.utilities >= 18 && boot.art >= 47,
    JSON.stringify({ utilities: boot.utilities, art: boot.art }));
  check('the dusk arrival is lit with Tony’s phone pocketed',
    boot.heldItem === null && boot.lightsOn,
    JSON.stringify({ heldItem: boot.heldItem, lightsOn: boot.lightsOn }));
  check('the authored landscape is dense enough to support free exploration',
    boot.landscape?.trees >= 500
      && boot.landscape?.undergrowth >= 1500
      && boot.landscape?.trailMetres >= 300
      && boot.landscape?.creekMetres >= 200,
    JSON.stringify(boot.landscape));
  check('trail approaches carry grounded wayfinding and real destination seating',
    boot.landscape?.trailBlazes >= 30
      && boot.landscape?.duskBeacons >= 5
      && boot.landscape?.firepitSeats >= 3
      && boot.landscape?.overlookSeats >= 1
      && boot.landscape?.exteriorFootings >= 40,
    JSON.stringify({
      blazes: boot.landscape?.trailBlazes,
      beacons: boot.landscape?.duskBeacons,
      firepitSeats: boot.landscape?.firepitSeats,
      overlookSeats: boot.landscape?.overlookSeats,
      footings: boot.landscape?.exteriorFootings,
    }));
  check('the world renders as real meshes plus instanced forest detail',
    boot.meshes >= 500 && boot.instances >= 2000,
    JSON.stringify({ meshes: boot.meshes, instances: boot.instances }));
  check('the car is gated by one overnight lay-low beat',
    !boot.rested && boot.leaveBeforeRest?.id === 'cabin_rest_first',
    JSON.stringify(boot.leaveBeforeRest));
  check('all 30 authored Lag lines have exact indexed recordings on disk',
    lagVoiceCues.length === 30 && missingLagDeliveries.length === 0,
    JSON.stringify({
      authored: lagVoiceCues.length,
      missing: missingLagDeliveries.map((cue) => cue.file || `${cue.name}.mp3`),
    }));

  await capture(page, 'cabin-title');
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.COUNTRYSIDE_CABIN?.state?.phase === 'active');
  await page.waitForTimeout(500);
  await capture(page, 'cabin-arrival');

  const playing = await page.evaluate(() => ({
    phase: window.COUNTRYSIDE_CABIN.state.phase,
    playerMode: window.COUNTRYSIDE_CABIN.player.mode,
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    objectiveCount: window.COUNTRYSIDE_CABIN.objectives.length,
  }));
  check('starting the scene hands control to the first-person cabin runtime',
    playing.phase === 'active' && playing.playerMode === 'walk' && playing.overlayHidden,
    JSON.stringify(playing));

  const cleanStartBefore = await page.evaluate(() => {
    const { player } = window.COUNTRYSIDE_CABIN;
    return { position: player.position.toArray(), yaw: player.yaw, enabled: player.enabled };
  });
  await page.locator('canvas').click({ position: { x: 640, y: 360 } });
  await page.mouse.move(640, 360);
  await page.mouse.move(700, 330, { steps: 3 });
  // Track the browser pointer's absolute CDP coordinate. Pointer lock turns
  // later absolute moves into the relative deltas consumed by Player.
  const pointer = { x: 700, y: 330 };
  let cleanStartMovementReached = false;
  await page.keyboard.down('w');
  /* Wait on the behavior, not on 720 ms of wall time. This scene renders
   * thousands of wilderness meshes in software under CI; under contention
   * that old fixed sleep could contain zero movement frames and report a
   * working input path as dead. W remains a real held browser key and the
   * quarter-metre bar remains unchanged; only the frame budget is honest. */
  try {
    await page.waitForFunction(([x, z]) => {
      const p = window.COUNTRYSIDE_CABIN.player.position;
      return Math.hypot(p.x - x, p.z - z) >= 0.25;
    }, [cleanStartBefore.position[0], cleanStartBefore.position[2]], {
      polling: 'raf',
      timeout: CONTROL_RESPONSE_WAIT_MS,
    });
    cleanStartMovementReached = true;
  } catch {
    // Keep accumulating the verification report; the check below owns the
    // failure and still records the final pose and pointer-lock state.
  }
  await page.keyboard.up('w');
  const cleanStartAfter = await page.evaluate(() => {
    const { player } = window.COUNTRYSIDE_CABIN;
    return {
      position: player.position.toArray(),
      yaw: player.yaw,
      enabled: player.enabled,
      locked: document.pointerLockElement?.tagName === 'CANVAS',
    };
  });
  const cleanStartDistance = Math.hypot(
    cleanStartAfter.position[0] - cleanStartBefore.position[0],
    cleanStartAfter.position[2] - cleanStartBefore.position[2],
  );
  const cleanStartYaw = Math.abs(Math.atan2(
    Math.sin(cleanStartAfter.yaw - cleanStartBefore.yaw),
    Math.cos(cleanStartAfter.yaw - cleanStartBefore.yaw),
  ));
  check('a clean Cabin start responds to real pointer-lock, mouse-look, and W input',
    cleanStartAfter.enabled
      && cleanStartAfter.locked
      && cleanStartMovementReached
      && cleanStartDistance >= 0.25
      && cleanStartYaw >= 0.01,
    JSON.stringify({
      before: cleanStartBefore,
      after: cleanStartAfter,
      cleanStartMovementReached,
      cleanStartDistance,
      cleanStartYaw,
    }));

  const lagAim = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const target = runtime.cabin.interactionTargets.lag;
    const viewpoint = runtime.cabin.interactionViewpoints.lag;
    const before = {
      selected: runtime.lagHints.debug.lastHintId,
      discovered: [...runtime.lagHints.debug.discovered],
      eligible: [...runtime.lagHints.debug.eligible],
      receiptCount: window.__SQUATCH_QA_AUDIO__.engines[0].playbackReceipts.length,
      lagYaw: runtime.lag.group.rotation.y,
    };
    if (!target || !viewpoint || !runtime.teleport('lag', 'interact')) {
      return { ready: false, before };
    }
    /* This only authors the player's physical starting pose. The production
     * Player camera and InteractionSystem still have to resolve the live Lag
     * rig, and the browser key below is the only thing allowed to talk. */
    runtime.player.update(0.001);
    runtime.player.camera.updateMatrixWorld(true);
    runtime.interaction.update(0);
    return {
      ready: true,
      before,
      currentIsLag: runtime.interaction.current === target,
      currentName: runtime.interaction.current?.name ?? null,
      player: runtime.player.position.toArray(),
      lag: target.position.toArray(),
    };
  });
  await page.keyboard.press('e');
  let lagHintSelected = true;
  try {
    await page.waitForFunction(() => Boolean(window.COUNTRYSIDE_CABIN.lagHints.debug.lastHintId),
      null, { timeout: CONTROL_RESPONSE_WAIT_MS });
  } catch {
    /* Preserve the rest of the scene report. A dead interaction is a failed
     * semantic check, not a reason to lose every later transition result. */
    lagHintSelected = false;
  }
  const lagTalk = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const policy = window.__SQUATCH_QA_AUDIO__;
    const engine = policy.engines[0];
    const selected = runtime.lagHints.debug.lastHintId;
    const requested = `vo.cabin.lag.${selected}`;
    const receipt = [...engine.playbackReceipts].reverse()
      .find((entry) => entry.requested === requested) ?? null;
    const lagPosition = runtime.lag.group.position;
    const expectedYaw = Math.atan2(
      runtime.player.position.x - lagPosition.x,
      runtime.player.position.z - lagPosition.z,
    );
    const yawError = Math.abs(Math.atan2(
      Math.sin(runtime.lag.group.rotation.y - expectedYaw),
      Math.cos(runtime.lag.group.rotation.y - expectedYaw),
    ));
    return {
      selected,
      requested,
      discovered: [...runtime.lagHints.debug.discovered],
      eligible: [...runtime.lagHints.debug.eligible],
      yaw: runtime.lag.group.rotation.y,
      expectedYaw,
      yawError,
      speaking: runtime.lag.npc.speaking,
      subtitle: document.getElementById('subtitle')?.textContent ?? '',
      receipt,
      violations: [...policy.violations],
      caught: [...policy.caught],
    };
  });
  const selectedLagCue = lagCueByName.get(lagTalk.requested);
  check('real E input resolves Lag, chooses an eligible discovery-aware line, and turns him to Tony',
    lagHintSelected
      && lagAim.ready
      && lagAim.currentIsLag
      && lagAim.before.selected == null
      && lagAim.before.eligible.includes(lagTalk.selected)
      && lagTalk.discovered.length === lagAim.before.discovered.length
      && lagTalk.yawError <= 0.01
      && lagTalk.speaking > 0
      && selectedLagCue?.say === lagTalk.receipt?.subtitle
      && lagTalk.subtitle.includes('Lag:')
      && lagTalk.subtitle.includes(selectedLagCue?.say ?? '__missing__'),
    JSON.stringify({ lagHintSelected, aim: lagAim, talk: lagTalk, authored: selectedLagCue?.say ?? null }));
  check('that live Lag subtitle owns its exact delivered positional-audio receipt',
    lagTalk.receipt?.requested === lagTalk.requested
      && lagTalk.receipt?.actual === lagTalk.requested
      && lagTalk.receipt?.source === 'buffer'
      && lagTalk.receipt?.started === true
      && lagTalk.receipt?.requiredRecorded === true
      && lagTalk.receipt?.speakerId === 'lag'
      && lagTalk.receipt?.subtitle === selectedLagCue?.say
      && lagTalk.receipt?.positional?.enabled === true
      && lagTalk.receipt?.positional?.follows === true
      && lagTalk.receipt?.positional?.ref === 2.2
      && lagTalk.receipt?.positional?.maxDist === 30
      && lagTalk.receipt?.positional?.rolloff === 0.7
      && !lagTalk.violations.some(({ requested }) => requested === lagTalk.requested)
      && !lagTalk.caught.some(({ requested }) => requested === lagTalk.requested),
    JSON.stringify({ receipt: lagTalk.receipt, violations: lagTalk.violations, caught: lagTalk.caught }));

  const switchedOff = await page.evaluate(() => {
    const world = window.COUNTRYSIDE_CABIN.cabin;
    world.utilityTargets.ceilingLight.userData.interact.onUse();
    return { lightsOn: world.state.lightsOn, manual: world.state.ceilingManual };
  });
  await page.waitForTimeout(180);
  const stayedOff = await page.evaluate(() => window.COUNTRYSIDE_CABIN.cabin.state.lightsOn);
  check('manual cabin light switches survive the automatic dusk refresh',
    switchedOff.manual && !switchedOff.lightsOn && !stayedOff,
    JSON.stringify({ switchedOff, stayedOff }));
  await page.evaluate(() => {
    window.COUNTRYSIDE_CABIN.cabin.utilityTargets.ceilingLight.userData.interact.onUse();
  });

  const smokePickup = await page.evaluate(() => {
    const world = window.COUNTRYSIDE_CABIN.cabin;
    world.utilityTargets.cigs.userData.interact.onUse();
    return { held: world.inventory.held, left: world.state.cigsLeft };
  });
  await page.keyboard.down('f');
  await page.waitForFunction(() => window.COUNTRYSIDE_CABIN.cabin.state.cigsLeft === 16,
    null, { timeout: FRAME_BOUND_WAIT_MS });
  await page.keyboard.up('f');
  await page.keyboard.press('q');
  const smokeUsed = await page.evaluate(() => ({
    held: window.COUNTRYSIDE_CABIN.cabin.inventory.held,
    hasPack: window.COUNTRYSIDE_CABIN.cabin.inventory.has('cigs'),
    left: window.COUNTRYSIDE_CABIN.cabin.state.cigsLeft,
  }));
  check('imported apartment consumables can be used and pocketed',
    smokePickup.held === 'cigs'
      && smokeUsed.left === 16
      && smokeUsed.hasPack
      && smokeUsed.held === null,
    JSON.stringify({ smokePickup, smokeUsed }));

  await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    runtime.player.position.set(0, 1.66, 3.75);
    runtime.player.yaw = 0;
    runtime.player.pitch = -0.08;
  });
  await page.waitForTimeout(350);
  await capture(page, 'cabin-interior');

  /* The basement is found through the real wardrobe owner and the real live
   * interaction ray. Debug teleport supplies only the authored stance; both
   * uses below are browser E events and the lower-room route is real WASD. */
  const basementEntryBefore = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const world = runtime.cabin;
    const entry = world.utilityTargets.basementEntrance;
    const wardrobe = world.utilityTargets.wardrobe;
    const teleported = runtime.teleport('basementEntrance', 'interact');
    runtime.player.update(0.001);
    runtime.player.camera.updateMatrixWorld(true);
    runtime.interaction.update(0);
    return {
      teleported,
      level: runtime.state.level,
      currentIsWardrobe: runtime.interaction.current === wardrobe,
      currentName: runtime.interaction.current?.name ?? null,
      entryEnabled: entry.userData.interact.enabled?.() ?? true,
      closetOpen: world.state.closetOpen,
      closetT: world.state.closetT,
      discovered: [...runtime.lagHints.debug.discovered],
      wardrobeHintEligible: runtime.lagHints.debug.eligible.includes('cabin.wardrobe'),
      panelArtPreserved: world.basement.panelArt === world.closet.picture,
      hasShaft: Boolean(world.basement.entryAssembly.getObjectByName('cabin-basement-upper-shaft-mouth')),
      hasUpperLadder: Boolean(world.basement.entryAssembly.getObjectByName('cabin-basement-upper-ladder-rung-4')),
      basementLights: world.basement.lights.map(({ intensity }) => intensity),
      basementFill: world.basement.fillLight.intensity,
    };
  });
  await page.keyboard.press('e');
  const basementAfterWardrobeUse = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      closetOpen: runtime.cabin.state.closetOpen,
      discovered: [...runtime.lagHints.debug.discovered],
      wardrobeHintEligible: runtime.lagHints.debug.eligible.includes('cabin.wardrobe'),
    };
  });
  let basementPanelAimed = true;
  try {
    await page.waitForFunction(() => {
      const runtime = window.COUNTRYSIDE_CABIN;
      return runtime.cabin.state.closetT >= 0.82
        && runtime.interaction.current === runtime.cabin.utilityTargets.basementEntrance
        && Math.abs(runtime.cabin.basement.panelPivot.rotation.y - (-0.92)) <= 0.02
        && runtime.cabin.basement.panelLightLeak.visible;
    }, null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });
  } catch {
    basementPanelAimed = false;
  }
  const basementReveal = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const world = runtime.cabin;
    return {
      closetOpen: world.state.closetOpen,
      closetT: world.state.closetT,
      currentIsPanel: runtime.interaction.current === world.utilityTargets.basementEntrance,
      currentName: runtime.interaction.current?.name ?? null,
      entryEnabled: world.utilityTargets.basementEntrance.userData.interact.enabled?.() ?? true,
      panelRotation: world.basement.panelPivot?.rotation?.y ?? null,
      movingPanelArtOnPivot: world.basement.movingPanelArt?.parent === world.basement.panelPivot,
      panelLightLeakVisible: world.basement.panelLightLeak?.visible === true,
      discovered: [...runtime.lagHints.debug.discovered],
      wardrobeHintEligible: runtime.lagHints.debug.eligible.includes('cabin.wardrobe'),
    };
  });
  check('the real wardrobe reveal preserves its art, exposes a legible shaft, and gives the panel the live ray',
    basementEntryBefore.teleported
      && basementEntryBefore.level === 'cabin'
      && basementEntryBefore.currentIsWardrobe
      && !basementEntryBefore.entryEnabled
      && !basementEntryBefore.closetOpen
      && basementEntryBefore.panelArtPreserved
      && basementEntryBefore.hasShaft
      && basementEntryBefore.hasUpperLadder
      && basementEntryBefore.basementLights.every((intensity) => intensity === 0)
      && basementEntryBefore.basementFill === 0
      && basementEntryBefore.wardrobeHintEligible
      && basementAfterWardrobeUse.closetOpen
      && !basementAfterWardrobeUse.discovered.includes('basement')
      && basementAfterWardrobeUse.wardrobeHintEligible
      && basementPanelAimed
      && basementReveal.currentIsPanel
      && basementReveal.entryEnabled
      && Math.abs(basementReveal.panelRotation - (-0.92)) <= 0.02
      && basementReveal.movingPanelArtOnPivot
      && basementReveal.panelLightLeakVisible
      && basementReveal.discovered.includes('basement')
      && !basementReveal.wardrobeHintEligible,
    JSON.stringify({
      before: basementEntryBefore,
      wardrobeUse: basementAfterWardrobeUse,
      panelAimed: basementPanelAimed,
      reveal: basementReveal,
    }));
  await capture(page, 'cabin-basement-entry-revealed');

  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const lights = runtime.cabin.basement.lights.map(({ intensity }) => intensity);
    return runtime.state.level === 'basement'
      && lights.length === 2
      && lights.every((intensity) => Math.abs(intensity - 3) <= 1e-6)
      && Math.abs(runtime.cabin.basement.fillLight.intensity - 1.35) <= 1e-6;
  }, null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });
  const basementArrival = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const spawn = runtime.cabin.spawns.basement;
    const position = runtime.player.position;
    return {
      level: runtime.state.level,
      mode: runtime.player.mode,
      position: position.toArray(),
      authored: spawn.position.toArray(),
      floorY: spawn.floorY,
      ground: runtime.player.ground,
      liveGround: runtime.player.world.groundAt(position.x, position.z),
      lights: runtime.cabin.basement.lights.map(({ intensity }) => intensity),
      fill: runtime.cabin.basement.fillLight.intensity,
      discovered: [...runtime.lagHints.debug.discovered],
    };
  });
  check('the concealed panel performs one grounded transition into the cabin basement',
    basementArrival.level === 'basement'
      && basementArrival.mode === 'walk'
      && basementArrival.discovered.includes('basement')
      && Math.abs(basementArrival.ground - basementArrival.floorY) <= 1e-6
      && Math.abs(basementArrival.liveGround - basementArrival.floorY) <= 1e-6
      && Math.hypot(
        basementArrival.position[0] - basementArrival.authored[0],
        basementArrival.position[2] - basementArrival.authored[2],
      ) <= 1e-6
      && basementArrival.lights.length === 2
      && basementArrival.lights.every((intensity) => Math.abs(intensity - 3) <= 1e-6)
      && Math.abs(basementArrival.fill - 1.35) <= 1e-6,
    JSON.stringify(basementArrival));

  const basementWorkbenchContract = await page.evaluate(() => {
    const world = window.COUNTRYSIDE_CABIN.cabin;
    const target = world.utilityTargets.basementWorkbench;
    const view = world.interactionViewpoints.basementWorkbench;
    return {
      target: Boolean(target?.userData?.interact?.onUse),
      viewpoint: Boolean(view?.position),
      position: view?.position?.toArray?.() ?? null,
      yaw: view?.yaw ?? null,
      pitch: view?.pitch ?? null,
    };
  });
  let basementWorkbenchReceipt = null;
  const basementWalk = [];
  for (const waypoint of [
    { x: 2.40, z: 2.00, label: 'leave the ladder bay' },
    { x: 1.00, z: 0.50, label: 'cross the stocked lower room' },
    ...(basementWorkbenchContract.position ? [{
      x: basementWorkbenchContract.position[0],
      z: basementWorkbenchContract.position[2],
      radius: 0.34,
      label: 'inspect the stocked workbench',
    }] : []),
    { x: 3.00, z: 2.20, label: 'walk back past the supplies' },
    { x: 4.52, z: 3.24, radius: 0.34, label: 'return to the ladder' },
  ]) {
    const walked = await walkTo(page, pointer, waypoint);
    basementWalk.push(walked);
    if (waypoint.label === 'cross the stocked lower room') {
      const scenicAim = await page.evaluate(() => {
        const position = window.COUNTRYSIDE_CABIN.player.position;
        const lookAt = { x: -0.95, y: -2.20, z: -4.00 };
        const dx = lookAt.x - position.x;
        const dy = lookAt.y - position.y;
        const dz = lookAt.z - position.z;
        return {
          yaw: Math.atan2(-dx, -dz),
          pitch: Math.atan2(dy, Math.hypot(dx, dz)),
        };
      });
      await aimWithMouse(page, pointer, scenicAim);
      await page.waitForTimeout(180);
      await capture(page, 'cabin-basement');
    }
    if (waypoint.label === 'inspect the stocked workbench') {
      await aimWithMouse(page, pointer, basementWorkbenchContract);
      let aimed = true;
      try {
        await page.waitForFunction(() => {
          const runtime = window.COUNTRYSIDE_CABIN;
          return runtime.interaction.current === runtime.cabin.utilityTargets.basementWorkbench;
        }, null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });
      } catch {
        aimed = false;
      }
      if (aimed) {
        await page.keyboard.press('e');
        await page.waitForFunction(() => (
          window.COUNTRYSIDE_CABIN.cabin.state.basementInspection === 'workbench'
        ), null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });
      }
      basementWorkbenchReceipt = await page.evaluate(({ reached, aimed: liveAimed }) => ({
        reached,
        aimed: liveAimed,
        inspection: window.COUNTRYSIDE_CABIN.cabin.state.basementInspection,
        toast: document.querySelector('#toast-stack .toast:last-child')?.textContent?.trim() ?? '',
        subtitle: document.getElementById('subtitle')?.textContent?.trim() ?? '',
      }), { reached: walked.reached, aimed });
    }
  }
  check('the stocked workbench resolves from its authored stance and production E publishes its HUD receipt',
    basementWorkbenchContract.target
      && basementWorkbenchContract.viewpoint
      && basementWorkbenchReceipt?.reached
      && basementWorkbenchReceipt?.aimed
      && basementWorkbenchReceipt?.inspection === 'workbench'
      && basementWorkbenchReceipt?.toast === 'Repair supplies'
      && basementWorkbenchReceipt?.subtitle.includes('Hand tools, wire, spare fittings, and a supply ledger.'),
    JSON.stringify({ contract: basementWorkbenchContract, receipt: basementWorkbenchReceipt }));
  const basementWalkFloor = basementWalk.every(({ position }) => (
    Math.abs(position[1] - (basementArrival.floorY + WALK_EYE_HEIGHT)) <= 0.08
  ));
  const basementExitView = await page.evaluate(() => {
    const view = window.COUNTRYSIDE_CABIN.cabin.interactionViewpoints.basementExit;
    return { yaw: view.yaw, pitch: view.pitch };
  });
  await aimWithMouse(page, pointer, basementExitView);
  let basementExitAimed = true;
  try {
    await page.waitForFunction(() => {
      const runtime = window.COUNTRYSIDE_CABIN;
      return runtime.interaction.current === runtime.cabin.utilityTargets.basementExit;
    }, null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });
  } catch {
    basementExitAimed = false;
  }
  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return runtime.state.level === 'cabin'
      && runtime.cabin.basement.lights.every(({ intensity }) => intensity === 0);
  }, null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });
  const basementReturn = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const spawn = runtime.cabin.spawns.wardrobeReturn;
    const position = runtime.player.position;
    return {
      level: runtime.state.level,
      mode: runtime.player.mode,
      position: position.toArray(),
      authored: spawn.position.toArray(),
      floorY: spawn.floorY,
      ground: runtime.player.ground,
      liveGround: runtime.player.world.groundAt(position.x, position.z),
      lights: runtime.cabin.basement.lights.map(({ intensity }) => intensity),
      fill: runtime.cabin.basement.fillLight.intensity,
    };
  });
  check('real basement walking stays height-isolated and the ladder returns to the wardrobe pose',
    basementWalk.every(({ reached }) => reached)
      && basementWalkFloor
      && basementExitAimed
      && basementReturn.level === 'cabin'
      && basementReturn.mode === 'walk'
      && Math.abs(basementReturn.ground - basementReturn.floorY) <= 1e-6
      && Math.abs(basementReturn.liveGround - basementReturn.floorY) <= 1e-6
      && Math.hypot(
        basementReturn.position[0] - basementReturn.authored[0],
        basementReturn.position[2] - basementReturn.authored[2],
      ) <= 1e-6
      && basementReturn.lights.every((intensity) => intensity === 0)
      && basementReturn.fill === 0,
    JSON.stringify({
      route: basementWalk,
      floorIsolated: basementWalkFloor,
      exitAimed: basementExitAimed,
      returned: basementReturn,
    }));

  const visits = [];
  for (const id of ['creek', 'overlook', 'shed', 'firepit']) {
    const approach = await page.evaluate((landmarkId) => {
      const runtime = window.COUNTRYSIDE_CABIN;
      const before = runtime.story.explored().some((entry) => entry.id === landmarkId);
      const viewpoint = runtime.cabin.interactionViewpoints[landmarkId];
      const teleported = runtime.teleport(landmarkId, 'interact');
      const descriptor = runtime.cabin.interactionTargets[landmarkId]?.userData?.interact;
      return {
        id: landmarkId,
        before,
        teleported,
        callback: Boolean(descriptor?.onUse),
        poseMatches: Boolean(viewpoint)
          && runtime.player.position.distanceTo(viewpoint.position) < 1e-6
          && Math.abs(runtime.player.ground - runtime.cabin.groundAt(
            viewpoint.position.x,
            viewpoint.position.z,
          )) < 1e-6
          && Math.abs(runtime.player.yaw - viewpoint.yaw) < 1e-6
          && Math.abs(runtime.player.pitch - viewpoint.pitch) < 1e-6,
      };
    }, id);
    // Let the real camera and InteractionSystem update from the authored pose,
    // then use the same keyboard path as the player. This fails if the target
    // is out of range, behind the camera, or intercepted by another target.
    await page.waitForTimeout(120);
    const aim = await page.evaluate((landmarkId) => {
      const runtime = window.COUNTRYSIDE_CABIN;
      runtime.player.update(0.001);
      // Interaction raycasts precede renderer.render() in the game loop, so a
      // verifier teleport must refresh the camera matrix explicitly instead
      // of relying on a later render frame to publish the new pose.
      runtime.player.camera.updateMatrixWorld(true);
      runtime.interaction.update(0);
      return {
        aimed: runtime.interaction.current === runtime.cabin.interactionTargets[landmarkId],
        current: runtime.interaction.current?.name ?? null,
        paused: runtime.interaction.paused,
      };
    }, id);
    await page.keyboard.press('e');
    await page.waitForTimeout(80);
    const after = await page.evaluate((landmarkId) => (
      window.COUNTRYSIDE_CABIN.story.explored().some((entry) => entry.id === landmarkId)
    ), id);
    visits.push({ ...approach, ...aim, firstVisit: !approach.before && after });
  }
  const exploration = {
    visits,
    explored: await page.evaluate(() => window.COUNTRYSIDE_CABIN.story.explored().map(({ id }) => id)),
  };
  check('safe landmark viewpoints are reachable through live interaction input',
    exploration.visits.every(({ teleported, callback, aimed, firstVisit, poseMatches }) => (
      teleported && callback && aimed && firstVisit && poseMatches
    ))
      && exploration.explored.length === 4,
    JSON.stringify({ visits: exploration.visits, explored: exploration.explored }));

  if (SCREENSHOT_DIR) {
    await page.evaluate(() => {
      const runtime = window.COUNTRYSIDE_CABIN;
      if (!runtime.state.fireLit) {
        // Splitting wood and tending the fire are now two honest activities.
        // Exercise both contracts in the same order the player must use them.
        runtime.cabin.interactionTargets.woodpile?.userData?.interact?.onUse?.();
        runtime.cabin.interactionTargets.firepit?.userData?.interact?.onUse?.();
      }
      runtime.teleport('firepit');
    });
    await page.waitForTimeout(150);
    await capture(page, 'cabin-firepit-lit');
    await page.evaluate(() => window.COUNTRYSIDE_CABIN.teleport('overlook'));
    await page.waitForTimeout(150);
    await capture(page, 'cabin-overlook');
  }

  await page.evaluate(() => window.COUNTRYSIDE_CABIN.rest());
  await page.waitForFunction(() => (
    window.COUNTRYSIDE_CABIN.story.rested()
      && !window.COUNTRYSIDE_CABIN.state.resting
  ), null, { timeout: FRAME_BOUND_WAIT_MS });
  const afterRest = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      rested: runtime.story.rested(),
      leaveAfterRest: runtime.story.tryLeave(),
      scene: runtime.campaign.state.scene,
      day: runtime.campaign.state.story.day,
      timeMinutes: runtime.campaign.state.story.timeMinutes,
      presentedDay: runtime.time.day,
      presentedMinutes: runtime.time.minutes,
    };
  });
  check('one rest advances the hideout to Day Five and unlocks the next job',
    afterRest.rested
      && afterRest.day === 5
      && afterRest.timeMinutes === 14 * 60 + 30
      && afterRest.presentedDay === 5
      && afterRest.presentedMinutes === 14 * 60 + 30
      && afterRest.leaveAfterRest?.kind === 'go'
      && afterRest.leaveAfterRest?.destination === 'silver_case'
      && afterRest.scene?.id === 'countryside_cabin',
    JSON.stringify({
      leave: afterRest.leaveAfterRest,
      scene: afterRest.scene,
      clock: [afterRest.day, afterRest.timeMinutes],
      presentation: [afterRest.presentedDay, afterRest.presentedMinutes],
    }));
  if (SCREENSHOT_DIR) {
    await page.waitForTimeout(220);
    await capture(page, 'cabin-wake-daylight');
  }

  const wake = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      position: runtime.player.position.toArray(),
      authored: runtime.cabin.spawns.wake.position.toArray(),
      mode: runtime.player.mode,
      locked: document.pointerLockElement?.tagName === 'CANVAS',
      doorOpen: runtime.cabin.door.open,
      carView: {
        position: runtime.cabin.interactionViewpoints.car?.position?.toArray?.() ?? null,
        lookAt: runtime.cabin.interactionViewpoints.car?.lookAt?.toArray?.() ?? null,
      },
    };
  });
  check('the completed rest wakes Tony at the authored cabin pose with a real car approach available',
    wake.mode === 'walk'
      && wake.locked
      && !wake.doorOpen
      && wake.carView.position?.length === 3
      && wake.carView.lookAt?.length === 3
      && Math.hypot(
        wake.position[0] - wake.authored[0],
        wake.position[2] - wake.authored[2],
      ) <= 0.05
      && Math.abs(wake.position[1] - WALK_EYE_HEIGHT) <= 0.05,
    JSON.stringify(wake));

  /* The last leg is deliberately not another runtime.teleport(). Tony walks
   * from the bed, threads the furnished cabin, opens the real door, follows
   * the trail/gravel approach, resolves the wagon target, and presses E. */
  const departureWalk = [];
  for (const waypoint of [
    { x: -2.00, z: -2.75, label: 'clear the bed' },
    { x: -2.00, z: -1.00, label: 'bedroom aisle' },
    { x: -2.00, z: 0.00, label: 'centre aisle north' },
    { x: -1.20, z: 0.00, label: 'clear the central chair' },
    { x: -1.20, z: 4.50, label: 'front-door aisle' },
    { x: 0.50, z: 5.05, label: 'inside door approach' },
  ]) departureWalk.push(await walkTo(page, pointer, waypoint));

  const doorAim = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const owner = runtime.cabin.utilityTargets.frontDoor;
    owner.updateWorldMatrix(true, true);
    let mesh = null;
    owner.traverse((object) => { if (!mesh && object.isMesh) mesh = object; });
    mesh.geometry.computeBoundingBox();
    const centre = mesh.geometry.boundingBox.getCenter(mesh.position.clone()).applyMatrix4(mesh.matrixWorld);
    const at = runtime.player.position;
    const dx = centre.x - at.x;
    const dy = centre.y - at.y;
    const dz = centre.z - at.z;
    return {
      yaw: Math.atan2(-dx, -dz),
      pitch: Math.atan2(dy, Math.hypot(dx, dz)),
      centre: centre.toArray(),
    };
  });
  await aimWithMouse(page, pointer, doorAim);
  await page.waitForFunction(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return runtime.interaction.current === runtime.cabin.utilityTargets.frontDoor;
  }, null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });
  await page.keyboard.press('e');
  await page.waitForFunction(() => (
    window.COUNTRYSIDE_CABIN.cabin.door.open
      && window.COUNTRYSIDE_CABIN.cabin.door.openness >= 0.92
  ), null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });

  const carView = await page.evaluate(() => {
    const view = window.COUNTRYSIDE_CABIN.cabin.interactionViewpoints.car;
    return { position: view.position.toArray(), lookAt: view.lookAt.toArray() };
  });
  for (const waypoint of [
    { x: 0.50, z: 3.75, label: 'clear the open door leaf' },
    { x: 2.65, z: 3.75, label: 'line up with the threshold' },
    { x: 2.65, z: 8.80, label: 'cross the real front doorway' },
    { x: 5.50, z: 10.50, label: 'reach the loop trail' },
    { x: 16.00, z: 17.00, label: 'follow the trail toward the wagon' },
    { x: 16.50, z: 24.00, label: 'enter the gravel pull-off' },
    { x: carView.position[0], z: carView.position[2], radius: 0.34, label: 'driver-side car stance' },
  ]) departureWalk.push(await walkTo(page, pointer, waypoint));

  const finalAim = await page.evaluate((lookAt) => {
    const position = window.COUNTRYSIDE_CABIN.player.position;
    const dx = lookAt[0] - position.x;
    const dy = lookAt[1] - position.y;
    const dz = lookAt[2] - position.z;
    return {
      yaw: Math.atan2(-dx, -dz),
      pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    };
  }, carView.lookAt);
  await aimWithMouse(page, pointer, finalAim);
  await page.waitForFunction(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return runtime.interaction.current === runtime.cabin.interactionTargets.car;
  }, null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });
  const carApproach = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const view = runtime.cabin.interactionViewpoints.car;
    return {
      position: runtime.player.position.toArray(),
      authored: view.position.toArray(),
      aimed: runtime.interaction.current === runtime.cabin.interactionTargets.car,
      prompt: document.getElementById('prompt')?.textContent ?? '',
      input: runtime.input.snapshot(),
      loops: [...runtime.audio.loops.keys()],
      radioPaused: runtime.radio._paused,
    };
  });
  check('real movement reaches the authored driver-side stance and resolves the wagon interaction',
    departureWalk.every(({ reached }) => reached)
      && carApproach.aimed
      && carApproach.input.locked
      && Math.hypot(
        carApproach.position[0] - carApproach.authored[0],
        carApproach.position[2] - carApproach.authored[2],
      ) <= 0.5,
    JSON.stringify({ route: departureWalk, carApproach }));
  await capture(page, 'cabin-car-departure');

  // Hold a real movement key across E. The transition must clear it, suspend
  // input, release capture and retire audio before changing documents.
  await page.keyboard.down('w');
  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return runtime.state.phase === 'leaving' && runtime.input.snapshot().suspended;
  }, null, { polling: 'raf', timeout: CONTROL_RESPONSE_WAIT_MS });
  await page.waitForFunction(() => document.pointerLockElement == null,
    null, { timeout: CONTROL_RESPONSE_WAIT_MS });
  const departureCleanup = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    return {
      phase: runtime.state.phase,
      input: runtime.input.snapshot(),
      playerKeys: [...runtime.player.keys],
      interactionPaused: runtime.interaction.paused,
      pointerLocked: document.pointerLockElement != null,
      loops: [...runtime.audio.loops.keys()],
      radioPaused: runtime.radio._paused,
      radioElementPaused: runtime.radio.el?.paused ?? true,
    };
  });
  await page.keyboard.up('w');
  check('the car exit clears held input, pointer capture, interaction, and every cabin/radio audio bed',
    departureCleanup.phase === 'leaving'
      && departureCleanup.input.suspended
      && !departureCleanup.input.enabled
      && departureCleanup.input.lastClearReason === 'suspend'
      && departureCleanup.playerKeys.length === 0
      && departureCleanup.interactionPaused
      && !departureCleanup.pointerLocked
      && departureCleanup.radioPaused
      && departureCleanup.radioElementPaused
      && !departureCleanup.loops.some((key) => key.startsWith('cabin.') || key.startsWith('radio.')),
    JSON.stringify(departureCleanup));

  await page.waitForURL((url) => url.pathname.endsWith('/silvercase.html')
    && url.searchParams.get('preview') === '1', { timeout: CONTROL_RESPONSE_WAIT_MS });
  await page.waitForFunction(() => Boolean(window.silvercase?.fsm),
    null, { timeout: 120000 });
  // Preview sessions are intentionally storage-less, so campaign.state() is
  // null by design. Prove the fixed `car_ride` spawn by pressing the actual
  // destination page button and observing its authored first beat instead.
  await page.click('#beginBtn');
  await page.waitForFunction(() => window.silvercase?.fsm?.name === 'CAR_RIDE',
    null, { timeout: 60000 });
  const silverCaseArrival = await page.evaluate(() => ({
    path: location.pathname,
    preview: new URLSearchParams(location.search).get('preview'),
    beat: window.silvercase.fsm.name,
  }));
  check('the real wagon interaction navigates to The Silver Case car-ride entrypoint',
    silverCaseArrival.path.endsWith('/silvercase.html')
      && silverCaseArrival.preview === '1'
      && silverCaseArrival.beat === 'CAR_RIDE',
    JSON.stringify(silverCaseArrival));
  check('the cabin browser run has no page, console, or request failures',
    problems.length === 0,
    problems.join(' | '));
} finally {
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter(({ ok }) => !ok);
if (failed.length) {
  console.error(`Cabin verification failed: ${failed.length}/${results.length} checks.`);
  process.exit(1);
}
console.log(`Cabin verification passed: ${results.length}/${results.length} checks.`);
