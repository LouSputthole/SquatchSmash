#!/usr/bin/env node
/**
 * Verify The Silver Case through a seeded canonical campaign entry. Separate
 * checkpoint pages use save-free preview URLs.
 *
 * The long legacy audit still uses the scene's debug handle to compress old
 * dialogue/setup beats, but the player-facing seams use the actual page:
 * visible Begin button, pointer lock, keyboard/mouse input, persisted ordinary
 * URL resumes, a wall-clock decision timeout, the case interaction, and the
 * walk out. Mirrors the skeleton in tools/verify-squatchfather.mjs and
 * tools/verify-initiation.mjs — a local static server, real headless Chromium
 * via Playwright, a check(name, ok, detail) accumulator, and process.exit(1)
 * on any failure.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APE_FAMILY_MEMBER } from '../src/bing/family-ape.js';
import {
  CAMPAIGN_STORAGE_KEY,
  CHARACTER_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { isSilverCasePreloadCue } from '../src/silvercase/audio.js';

// ApartmentScene.js's own ROOMS.apartment box (x 6…12, z -2.5…2.5) — not
// imported: that module transitively pulls in src/world/props.js, which
// calls a `document.createElement('canvas')` texture builder at MODULE TOP
// LEVEL (brushedMetal(), eagerly evaluated), so importing it here in plain
// Node (this file runs outside the browser, unlike everything under page.
// evaluate) throws `ReferenceError: document is not defined` before a single
// check runs. Same reason the hallway-spawn check just above hardcodes `6` as
// the wall between the corridor and the flat instead of importing it.
const APARTMENT_ROOM = Object.freeze({ x0: 6, x1: 12, z0: -2.5, z1: 2.5 });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5223;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}
const campaignSeed = createCampaign({ storage: new MemoryStorage() });
campaignSeed.update((state) => {
  state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
});
const SILVER_CASE_CAMPAIGN_SEED = campaignSeed.state;

// The residency contract this mission is held to — see src/silvercase/audio.js.
const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(soundIndex.files || []);
const selectedSilverCaseCues = soundManifest.sfx.filter((cue) => isSilverCasePreloadCue(cue));
const missingSilverCaseDeliveries = selectedSilverCaseCues.filter((cue) => {
  const file = cue.file || `${cue.name}.mp3`;
  return !indexedFiles.has(file) || !fs.existsSync(path.join(ROOT, 'assets', 'sfx', file));
});
const expectedSilverCaseResidentNames = selectedSilverCaseCues
  .filter((cue) => {
    const file = cue.file || `${cue.name}.mp3`;
    return indexedFiles.has(file) && fs.existsSync(path.join(ROOT, 'assets', 'sfx', file));
  })
  .map((cue) => cue.name)
  .sort();

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
    /* Current Chromium's direct SwiftShader GL backend can lose the WebGL
     * context at boot and leave a 0x0 drawing buffer. Route SwiftShader
     * through ANGLE instead: same software renderer, stable WebGL lifecycle. */
    '--use-gl=angle',
    '--use-angle=swiftshader',
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
 * (dialogue.choice?.id === ID), `"choiceOpen"` (any choice is open), or
 * `"instruction"` (the on-screen instruction is up).
 *
 * `instruction` exists because the HUD deliberately does NOT appear on the
 * frame the beat is entered. The owner's rule is that the character speaks
 * first and the screen clarifies afterwards, so `sayThenInstruct` raises it in
 * the sequence's `onDone` — see docs/TONE-AND-PARODY.md. Reading the element
 * straight after entering the beat therefore reads the empty string, which is
 * correct behaviour and used to be a failing check.
 */
async function tickUntil(condition, { stepSecs = 0.1, maxSteps = 400 } = {}) {
  return page.evaluate(([condition, stepSecs, maxSteps]) => {
    const sc = window.silvercase;
    const [kind, value] = condition.split(':');
    const met = () => {
      if (kind === 'beat') return sc.fsm.name === value;
      if (kind === 'choice') return sc.dialogue.choice?.id === value;
      if (kind === 'choiceOpen') return Boolean(sc.dialogue.choice);
      if (kind === 'instruction') {
        const el = document.getElementById('instruction');
        return Boolean(el && el.classList.contains('show') && el.textContent.trim());
      }
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
    const gl = sc.renderer.getContext();
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
    return {
      mean: +(sum / pixels).toFixed(4),
      litFraction: +(lit / pixels).toFixed(3),
      contextLost: gl.isContextLost(),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    };
  });
}

/**
 * World-space bounding box of a cast member's FIGURE.
 *
 * Decals stuck to a man (`silvercase.mark`) are excluded deliberately: a 31 cm
 * blood quad on a body that then topples reaches well outside its silhouette,
 * and every measurement taken here — real heights, the 2.6 m ceiling, "the
 * body is still exactly where it fell" — is about the man rather than about
 * what was done to him.
 */
async function actorBounds(name) {
  return page.evaluate(async (name) => {
    const THREE = await import('/vendor/three.module.min.js');
    const group = window.silvercase.cast[name].group;
    const wasVisible = group.visible;
    group.visible = true;
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    group.traverse((node) => {
      if (!node.isMesh || node.name === 'silvercase.mark') return;
      box.expandByObject(node);
    });
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

/**
 * Open a saved campaign in an isolated context through the same ordinary URL
 * and visible Begin button a returning player uses. This deliberately avoids
 * `?preview=1`, `?checkpoint=...`, `go()` and `tick()`: branch QA below must
 * exercise persisted resume, real timers and browser input rather than a
 * verifier-only state teleport.
 */
async function openOrdinaryResume(rawCampaign, label) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const branchPage = await context.newPage();
  const branchProblems = [];
  branchPage.on('pageerror', (error) => branchProblems.push(error.message));
  branchPage.on('console', (message) => {
    if (message.type() === 'error') branchProblems.push(message.text().slice(0, 240));
  });
  await branchPage.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: CAMPAIGN_STORAGE_KEY, raw: rawCampaign });
  await branchPage.goto(`http://localhost:${PORT}/silvercase.html`, {
    waitUntil: 'load',
    timeout: 60000,
  });
  await branchPage.waitForFunction(() => window.silvercase?.fsm, null, { timeout: 60000 });
  await branchPage.click('#beginBtn');
  await branchPage.waitForFunction(
    () => window.silvercase.fsm.name !== 'MENU', null, { timeout: 60000 },
  );
  await branchPage.waitForFunction(
    () => window.silvercase.input.snapshot().locked, null, { timeout: 5000 },
  );
  return {
    page: branchPage,
    problems: branchProblems,
    close: async () => {
      if (branchProblems.length) {
        problems.push(...branchProblems.map((problem) => `${label}: ${problem}`));
      }
      await context.close();
    },
  };
}

/*
 * Input-only clean-path helpers.
 *
 * These deliberately never call the scene's go(), aimAt(), shootAt(),
 * pressFire(), pressDraw(), retry(), or write Player transforms.  The only
 * verifier-only seam they retain is deterministic clock advancement through
 * tick(): SwiftShader can render far below real time, but authored dialogue
 * and movement still need stable game-time steps.  Every decision, look,
 * interaction, shot and metre travelled enters through the same keyboard and
 * pointer events a player uses.
 */
const pointerPositions = new WeakMap();

async function advanceCleanPathUntil(branchPage, predicate, {
  stepSecs = 0.05,
  maxSteps = 1200,
} = {}) {
  return branchPage.evaluate(([predicate, stepSecs, maxSteps]) => {
    const sc = window.silvercase;
    const [kind, value] = predicate.split(':');
    const met = () => {
      if (kind === 'beat') return sc.fsm.name === value;
      if (kind === 'choice') return sc.dialogue.choice?.id === value;
      if (kind === 'instruction') {
        const el = document.getElementById('instruction');
        return Boolean(el?.classList.contains('show') && el.textContent.trim());
      }
      return false;
    };
    let steps = 0;
    while (!met() && steps < maxSteps) {
      sc.tick(stepSecs);
      steps += 1;
    }
    return { met: met(), steps, state: sc.state() };
  }, [predicate, stepSecs, maxSteps]);
}

async function ensureCleanPathCapture(branchPage) {
  if (await branchPage.evaluate(() => window.silvercase.input.snapshot().captured)) return;
  await branchPage.locator('canvas').click({ position: { x: 480, y: 270 } });
  await branchPage.waitForFunction(
    () => window.silvercase.input.snapshot().captured,
    null,
    { timeout: 5000 },
  );
}

async function walkCleanPathTo(branchPage, target, {
  tolerance = 0.38,
  maxBursts = 180,
  burstSecs = 0.08,
} = {}) {
  await ensureCleanPathCapture(branchPage);
  let report = null;
  let stalled = 0;
  for (let burst = 0; burst < maxBursts; burst += 1) {
    const pose = await branchPage.evaluate(() => {
      const p = window.silvercase.player;
      return { x: p.position.x, z: p.position.z, yaw: p.yaw };
    });
    const dx = target.x - pose.x;
    const dz = target.z - pose.z;
    const distance = Math.hypot(dx, dz);
    report = { ...pose, distance, bursts: burst };
    if (distance <= tolerance) return { reached: true, ...report };

    const sin = Math.sin(pose.yaw);
    const cos = Math.cos(pose.yaw);
    const forward = dx * -sin + dz * -cos;
    const right = dx * cos + dz * -sin;
    const keys = [];
    if (Math.abs(forward) > tolerance * 0.35) keys.push(forward > 0 ? 'KeyW' : 'KeyS');
    if (Math.abs(right) > tolerance * 0.35) keys.push(right > 0 ? 'KeyD' : 'KeyA');
    if (!keys.length) return { reached: true, ...report };

    for (const key of keys) await branchPage.keyboard.down(key);
    try {
      await branchPage.evaluate((secs) => window.silvercase.tick(secs), burstSecs);
    } finally {
      for (const key of [...keys].reverse()) await branchPage.keyboard.up(key);
    }

    const next = await branchPage.evaluate(() => {
      const p = window.silvercase.player;
      return { x: p.position.x, z: p.position.z };
    });
    const moved = Math.hypot(next.x - pose.x, next.z - pose.z);
    stalled = moved < 0.002 ? stalled + 1 : 0;
    if (stalled >= 12) return { reached: false, stalled: true, ...report, at: next };
  }
  return { reached: false, stalled: false, ...report };
}

function shortestAngleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

async function lookCleanPathAt(branchPage, targetResolver, {
  tolerance = 0.018,
  maxMoves = 6,
} = {}) {
  await ensureCleanPathCapture(branchPage);
  let cursor = pointerPositions.get(branchPage);
  if (!cursor) {
    cursor = { x: 480, y: 270 };
    await branchPage.mouse.move(cursor.x, cursor.y);
    pointerPositions.set(branchPage, cursor);
  }

  let report = null;
  for (let move = 0; move < maxMoves; move += 1) {
    report = await branchPage.evaluate((resolver) => {
      const sc = window.silvercase;
      const p = sc.player;
      let at = null;
      if (resolver.kind === 'actor') {
        const actor = sc.cast[resolver.name];
        if (!actor) return { error: `unknown actor ${resolver.name}` };
        at = actor.parts.head.getWorldPosition(actor.parts.head.position.clone());
        at.y += resolver.offsetY ?? -0.28;
      } else if (resolver.kind === 'interactable') {
        const hit = sc.apartment.interactables.find((mesh) => mesh.name === resolver.name);
        if (!hit) return { error: `unknown interactable ${resolver.name}` };
        hit.updateWorldMatrix(true, false);
        at = hit.getWorldPosition(hit.position.clone());
      } else if (resolver.kind === 'point') {
        at = { x: resolver.x, y: resolver.y, z: resolver.z };
      }
      const dx = at.x - sc.camera.position.x;
      const dy = at.y - sc.camera.position.y;
      const dz = at.z - sc.camera.position.z;
      return {
        yaw: p.yaw,
        pitch: p.pitch,
        sensitivity: p.sensitivity,
        desiredYaw: Math.atan2(-dx, -dz),
        desiredPitch: Math.atan2(dy, Math.hypot(dx, dz)),
        target: [at.x, at.y, at.z],
      };
    }, targetResolver);
    if (report.error) return { aimed: false, ...report };
    const yawDelta = shortestAngleDelta(report.yaw, report.desiredYaw);
    const pitchDelta = report.desiredPitch - report.pitch;
    report = { ...report, yawDelta, pitchDelta, moves: move };
    if (Math.abs(yawDelta) <= tolerance && Math.abs(pitchDelta) <= tolerance) {
      await branchPage.evaluate(() => window.silvercase.tick(0.001));
      return { aimed: true, ...report };
    }
    const dx = Math.max(-650, Math.min(650, -yawDelta / report.sensitivity));
    const dy = Math.max(-420, Math.min(420, -pitchDelta / report.sensitivity));
    cursor = { x: cursor.x + dx, y: cursor.y + dy };
    pointerPositions.set(branchPage, cursor);
    await branchPage.mouse.move(cursor.x, cursor.y, { steps: 2 });
    await branchPage.evaluate(() => window.silvercase.tick(0.001));
  }
  return { aimed: false, ...report };
}

async function pressCleanPathInteraction(branchPage) {
  const before = await branchPage.evaluate(
    () => window.silvercase.input.snapshot().interactionPresses,
  );
  await branchPage.keyboard.press('KeyE');
  const after = await branchPage.evaluate(
    () => window.silvercase.input.snapshot().interactionPresses,
  );
  return { before, after, recorded: after > before };
}

async function fireCleanPathShot(branchPage) {
  const before = await branchPage.evaluate(
    () => window.silvercase.input.snapshot().mouseDownEvents,
  );
  await branchPage.mouse.down({ button: 'left' });
  await branchPage.mouse.up({ button: 'left' });
  await branchPage.evaluate(() => window.silvercase.tick(0.02));
  const after = await branchPage.evaluate(
    () => window.silvercase.input.snapshot().mouseDownEvents,
  );
  return { before, after, recorded: after > before };
}

async function runCleanStartGoldenPath() {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const goldenPage = await context.newPage();
  const goldenProblems = [];
  goldenPage.on('pageerror', (error) => goldenProblems.push(error.message));
  goldenPage.on('console', (message) => {
    if (message.type() === 'error') goldenProblems.push(message.text().slice(0, 240));
  });
  try {
    await goldenPage.addInitScript(({ key, state }) => {
      localStorage.setItem(key, JSON.stringify(state));
    }, { key: CAMPAIGN_STORAGE_KEY, state: SILVER_CASE_CAMPAIGN_SEED });
    await goldenPage.goto(`http://localhost:${PORT}/silvercase.html`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await goldenPage.waitForFunction(() => window.silvercase?.fsm, null, { timeout: 60000 });

    await goldenPage.click('#beginBtn');
    await goldenPage.waitForFunction(
      () => window.silvercase.fsm.name === 'CAR_RIDE',
      null,
      { timeout: 60000 },
    );
    await ensureCleanPathCapture(goldenPage);
    const inputAtStart = await goldenPage.evaluate(() => window.silvercase.input.snapshot());

    const arrived = await advanceCleanPathUntil(goldenPage, 'beat:ARRIVE_HALLWAY');
    const toDoor = await walkCleanPathTo(goldenPage, { x: 4.75, z: 0 }, { tolerance: 0.3 });
    const doorLook = await lookCleanPathAt(
      goldenPage,
      { kind: 'interactable', name: 'frontDoor' },
    );
    await goldenPage.evaluate(() => window.silvercase.tick(0.02));
    const knockPrompt = await goldenPage.evaluate(
      () => document.getElementById('promptText')?.textContent ?? '',
    );
    const knockInput = await pressCleanPathInteraction(goldenPage);
    await goldenPage.waitForFunction(
      () => window.silvercase.fsm.name === 'KNOCK',
      null,
      { timeout: 3000 },
    );

    const apartmentReady = await advanceCleanPathUntil(goldenPage, 'beat:ENTER_APARTMENT');
    const throughDoor = await walkCleanPathTo(
      goldenPage,
      { x: 6.85, z: 0 },
      { tolerance: 0.25 },
    );
    const closeDoorLook = await lookCleanPathAt(
      goldenPage,
      { kind: 'interactable', name: 'frontDoor' },
    );
    await goldenPage.evaluate(() => window.silvercase.tick(0.02));
    const closePrompt = await goldenPage.evaluate(
      () => document.getElementById('promptText')?.textContent ?? '',
    );
    const closeInput = await pressCleanPathInteraction(goldenPage);
    await goldenPage.waitForFunction(
      () => window.silvercase.fsm.name === 'ESTABLISH_CONTROL',
      null,
      { timeout: 3000 },
    );

    // Travel around the coffee table instead of walking a mathematical
    // diagonal through it.  Both legs are collision-resolved Player movement.
    const caseLegA = await walkCleanPathTo(
      goldenPage,
      { x: 9.45, z: 0.05 },
      { tolerance: 0.3 },
    );
    const caseLegB = await walkCleanPathTo(
      goldenPage,
      { x: 9.45, z: 0.9 },
      { tolerance: 0.28 },
    );
    const caseLook = await lookCleanPathAt(
      goldenPage,
      { kind: 'interactable', name: 'caseHiding' },
    );
    await goldenPage.evaluate(() => window.silvercase.tick(0.02));
    const searchPrompt = await goldenPage.evaluate(
      () => document.getElementById('promptText')?.textContent ?? '',
    );
    const searchInput = await pressCleanPathInteraction(goldenPage);
    await goldenPage.waitForFunction(
      () => window.silvercase.fsm.name === 'CASE_REVEAL',
      null,
      { timeout: 3000 },
    );

    const couchBeat = await advanceCleanPathUntil(goldenPage, 'beat:COUCH_SHOOTING');
    const couchInstruction = await advanceCleanPathUntil(goldenPage, 'instruction');
    const dekeLook = await lookCleanPathAt(goldenPage, { kind: 'actor', name: 'deke' });
    const dekeTarget = await goldenPage.evaluate(() => window.silvercase.state().aim);
    const dekeShot = await fireCleanPathShot(goldenPage);
    const louBeat = await advanceCleanPathUntil(goldenPage, 'beat:SQUATCH_PRAYER');

    const prayerChoice = await advanceCleanPathUntil(goldenPage, 'choice:prayerFinish');
    await goldenPage.keyboard.down('KeyE');
    const chairBeat = await advanceCleanPathUntil(goldenPage, 'beat:CHAIR_SHOOTING');
    await goldenPage.keyboard.up('KeyE');
    const chairInstruction = await advanceCleanPathUntil(goldenPage, 'instruction');
    const chesterLook = await lookCleanPathAt(goldenPage, { kind: 'actor', name: 'chester' });
    const chesterTarget = await goldenPage.evaluate(() => window.silvercase.state().aim);
    const chesterShot = await fireCleanPathShot(goldenPage);

    const ambushBeat = await advanceCleanPathUntil(goldenPage, 'beat:BATHROOM_AMBUSH');
    // Pruitt's opening pair are guaranteed authored misses. The return-fire
    // window deliberately does not arm until both rounds and impacts land.
    await goldenPage.evaluate(() => window.silvercase.tick(2.1));
    const pruittLook = await lookCleanPathAt(goldenPage, { kind: 'actor', name: 'pruitt' });
    const pruittTarget = await goldenPage.evaluate(() => window.silvercase.state().aim);
    const pruittShot = await fireCleanPathShot(goldenPage);
    const aftermathChoice = await advanceCleanPathUntil(goldenPage, 'choice:aftermath');
    await goldenPage.keyboard.press('Digit1');
    const pickupBeat = await advanceCleanPathUntil(goldenPage, 'beat:PICK_UP_CASE');

    const pickupLeg = await walkCleanPathTo(
      goldenPage,
      { x: 9.45, z: 0.9 },
      { tolerance: 0.3 },
    );
    const pickupLook = await lookCleanPathAt(
      goldenPage,
      { kind: 'interactable', name: 'caseHiding' },
    );
    await goldenPage.evaluate(() => window.silvercase.tick(0.02));
    const pickupPrompt = await goldenPage.evaluate(
      () => document.getElementById('promptText')?.textContent ?? '',
    );
    const pickupInput = await pressCleanPathInteraction(goldenPage);
    await goldenPage.waitForFunction(
      () => window.silvercase.fsm.name === 'EXIT',
      null,
      { timeout: 3000 },
    );

    const exitLegA = await walkCleanPathTo(
      goldenPage,
      { x: 9.45, z: 0.05 },
      { tolerance: 0.3 },
    );
    const exitLegB = await walkCleanPathTo(
      goldenPage,
      { x: 6.75, z: 0 },
      { tolerance: 0.28 },
    );
    const exitLegC = await walkCleanPathTo(
      goldenPage,
      { x: 4.8, z: 0 },
      { tolerance: 0.3 },
    );
    const exitLegD = await walkCleanPathTo(
      goldenPage,
      { x: 1.15, z: 0 },
      { tolerance: 0.25 },
    );
    await goldenPage.evaluate(() => window.silvercase.tick(1.1));

    const final = await goldenPage.evaluate(() => ({
      state: window.silvercase.state(),
      campaign: window.silvercase.campaign.state(),
      input: window.silvercase.input.snapshot(),
      overlay: !document.getElementById('sceneCompleteOverlay').classList.contains('hidden'),
      player: {
        x: window.silvercase.player.position.x,
        z: window.silvercase.player.position.z,
      },
    }));
    const path = {
      arrived,
      toDoor,
      doorLook,
      knockPrompt,
      knockInput,
      apartmentReady,
      throughDoor,
      closeDoorLook,
      closePrompt,
      closeInput,
      caseLegA,
      caseLegB,
      caseLook,
      searchPrompt,
      searchInput,
      couchBeat,
      couchInstruction,
      dekeLook,
      dekeTarget,
      dekeShot,
      louBeat,
      prayerChoice,
      chairBeat,
      chairInstruction,
      chesterLook,
      chesterTarget,
      chesterShot,
      ambushBeat,
      pruittLook,
      pruittTarget,
      pruittShot,
      aftermathChoice,
      pickupBeat,
      pickupLeg,
      pickupLook,
      pickupPrompt,
      pickupInput,
      exitLegA,
      exitLegB,
      exitLegC,
      exitLegD,
    };
    const pathOk = [
      arrived, toDoor, doorLook, apartmentReady, throughDoor, closeDoorLook,
      caseLegA, caseLegB, caseLook, couchBeat, couchInstruction, dekeLook,
      louBeat, prayerChoice, chairBeat, chairInstruction, chesterLook,
      ambushBeat, pruittLook, aftermathChoice, pickupBeat, pickupLeg, pickupLook,
      exitLegA, exitLegB, exitLegC,
    ].every((step) => step.met ?? step.reached ?? step.aimed ?? false)
      // The scene-complete trigger sits just inside the last walk target. Once
      // it fires, input is correctly disabled, so the walker can report its
      // final 25 cm as "stalled" even though the authored exit succeeded.
      && (exitLegD.reached || final.state.beat === 'SCENE_COMPLETE');
    const inputOk = knockInput.recorded && closeInput.recorded && searchInput.recorded
      && dekeShot.recorded && chesterShot.recorded && pruittShot.recorded
      && pickupInput.recorded
      && final.input.movementPresses >= inputAtStart.movementPresses + 8
      && final.input.interactionPresses >= inputAtStart.interactionPresses + 4
      && final.input.lookEvents >= inputAtStart.lookEvents + 5
      && final.input.mouseDownEvents >= inputAtStart.mouseDownEvents + 3;
    const targetsOk = dekeTarget.at === 'Deke' && dekeTarget.onTarget
      && chesterTarget.at === 'Chester' && chesterTarget.onTarget
      && pruittTarget.at === 'Pruitt' && pruittTarget.onTarget;
    const promptsOk = knockPrompt === 'Knock'
      && closePrompt === 'Close the door'
      && searchPrompt === 'Look for the case'
      && pickupPrompt === 'Take the case';
    const pathSummary = Object.fromEntries(Object.entries(path).map(([name, step]) => {
      if (typeof step === 'string') return [name, step];
      if (typeof step?.recorded === 'boolean') return [name, { recorded: step.recorded }];
      return [name, {
        ok: step?.met ?? step?.reached ?? step?.aimed ?? null,
        beat: step?.state?.beat ?? null,
        distance: Number.isFinite(step?.distance) ? +step.distance.toFixed(3) : null,
        stalled: step?.stalled ?? false,
      }];
    }));
    pathSummary.sceneComplete = final.state.beat === 'SCENE_COMPLETE';
    check('clean-start golden path reaches every beat through authored state transitions, not go()',
      pathOk,
      JSON.stringify(pathSummary));
    check('clean-start golden path uses real keyboard/pointer receipts for travel, looks, interactions and shots',
      inputOk && targetsOk && promptsOk,
      JSON.stringify({
        input: {
          movement: final.input.movementPresses - inputAtStart.movementPresses,
          interaction: final.input.interactionPresses - inputAtStart.interactionPresses,
          look: final.input.lookEvents - inputAtStart.lookEvents,
          fire: final.input.mouseDownEvents - inputAtStart.mouseDownEvents,
        },
        targets: { deke: dekeTarget.at, chester: chesterTarget.at, pruitt: pruittTarget.at },
        prompts: { knockPrompt, closePrompt, searchPrompt, pickupPrompt },
      }));
    check('clean-start golden path carries Lou’s case out and completes the canonical campaign mission',
      final.state.beat === 'SCENE_COMPLETE'
        && final.state.case.carried === true
        && final.state.actors.deke.alive === false
        && final.state.actors.chester.alive === false
        && final.state.actors.pruitt.alive === false
        && final.state.actors.winston.alive === true
        && final.campaign?.missions?.[MISSION_IDS.SILVER_CASE]?.status === 'complete'
        && final.overlay === true
        && final.player.x < 1.4,
      JSON.stringify({
        beat: final.state.beat,
        caseCarried: final.state.case.carried,
        alive: Object.fromEntries(Object.entries(final.state.actors)
          .map(([name, actor]) => [name, actor.alive])),
        mission: final.campaign?.missions?.[MISSION_IDS.SILVER_CASE],
        player: final.player,
        overlay: final.overlay,
        problems: goldenProblems,
      }));
    check('clean-start golden path produces no browser console or page errors',
      goldenProblems.length === 0,
      goldenProblems.join(' | ').slice(0, 800));
  } finally {
    await context.close();
  }
}

try {
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: CAMPAIGN_STORAGE_KEY, state: SILVER_CASE_CAMPAIGN_SEED });
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

  // ---- Bloom mounts at its unmodified, subtle defaults with the
  // self-measuring frame-time fallback armed — same contract every other
  // PostFX-mounted scene is held to (see src/core/postfx.js). ---------------
  const postfxBoot = await page.evaluate(() => {
    const fx = window.silvercase.postfx;
    return {
      present: Boolean(fx),
      enabled: fx?.enabled,
      hasComposer: Boolean(fx?.composer),
      hasBloom: Boolean(fx?.bloom),
      strength: fx?.bloom?.strength ?? null,
      radius: fx?.bloom?.radius ?? null,
      threshold: fx?.bloom?.threshold ?? null,
      manual: fx?._manual,
    };
  });
  check('PostFX mounts enabled, unmodified (subtle default bloom) with the auto-fallback still armed',
    postfxBoot.present && postfxBoot.enabled && postfxBoot.hasComposer && postfxBoot.hasBloom
      && postfxBoot.strength === 0.42 && postfxBoot.radius === 0.34 && postfxBoot.threshold === 0.82
      && postfxBoot.manual === false,
    JSON.stringify(postfxBoot));

  // ---- MENU -> CAR_RIDE through the visible Begin button ----------------
  //
  // `begin()` now AWAITS `audio.loadManifest(...)` before it ever calls
  // `fsm.go(S.CAR_RIDE)` (see main.js's own comment on the bug this fixes),
  // so `window.silvercase.begin()` returns a promise that only resolves once
  // the mission is genuinely sitting in CAR_RIDE with its manifest resident —
  // A programmatic `window.silvercase.begin()` proved the implementation but
  // not the click/pointer-lock socket. Use the actual button and wait for the
  // async handler to finish loading its audio bank and enter CAR_RIDE.
  await page.click('#beginBtn');
  await page.waitForFunction(
    () => window.silvercase.fsm.name === 'CAR_RIDE', null, { timeout: 60000 },
  );
  await page.waitForFunction(
    () => window.silvercase.input.snapshot().locked, null, { timeout: 5000 },
  );
  let carRide = await page.evaluate(() => {
    const sc = window.silvercase;
    const subs = document.getElementById('subs');
    const shell = { ribcage: [], deltoid: [], upperarm: [] };
    sc.car.ape.group.traverse((node) => {
      if (!Object.hasOwn(shell, node.name) || !node.material?.color) return;
      shell[node.name].push(node.material.color.getHex());
    });
    sc.car.ape.group.updateWorldMatrix(true, false);
    const matrix = sc.car.ape.group.matrixWorld.elements;
    return {
      state: sc.state(),
      mode: sc.player.mode,
      input: sc.input.snapshot(),
      cueLog: sc.dialogue.cueLog.slice(),
      voiceLog: sc.dialogue.voiceLog.slice(),
      openingReceipt: [...sc.audio.playbackReceipts].reverse()
        .find((receipt) => receipt.requested === 'vo.silvercase.car.ape.pitch') ?? null,
      apeDialoguePose: {
        shell,
        mouth: sc.mouths().ape,
      },
      apeEmitter: { x: matrix[12], y: matrix[13], z: matrix[14] },
      subtitle: {
        shown: subs?.classList.contains('show') ?? false,
        who: document.getElementById('subsWho')?.textContent ?? '',
        line: document.getElementById('subsLine')?.textContent ?? '',
      },
    };
  });
  check('beginning the scene seats the player in the car and starts the drive-over dialogue',
    carRide.state.beat === 'CAR_RIDE'
      && carRide.mode === 'seated'
      && carRide.input.locked === true
      && carRide.cueLog[0] === 'vo.silvercase.car.ape.pitch',
    JSON.stringify(carRide));
  const campaignEntry = await page.evaluate(() => ({
    preview: window.silvercase.campaign.preview,
    state: window.silvercase.campaign.state(),
  }));
  check('beginning the ordinary URL claims the canonical Silver Case campaign scene',
    campaignEntry.preview === false
      && campaignEntry.state?.scene?.id === SCENE_IDS.SILVER_CASE
      && campaignEntry.state?.missions?.[MISSION_IDS.SILVER_CASE]?.status === 'in_progress',
    JSON.stringify({
      preview: campaignEntry.preview,
      scene: campaignEntry.state?.scene,
      status: campaignEntry.state?.missions?.[MISSION_IDS.SILVER_CASE]?.status,
    }));

  // ---- V1 (2026-08-06 playtest): "Ape's first line still doesn't play."
  //
  // Root cause was a race, not a missing cue or a missing recording: begin()
  // used to fire `audio.loadManifest(...)` and, in the SAME tick, transition
  // into CAR_RIDE — whose enter() plays the mission's very first line
  // synchronously, before the fetch/decode had a single tick to run. Every
  // later line was fine because its own multi-second `hold` gave that same
  // in-flight load time no earlier line ever got, which is why only the
  // FIRST line ever went quiet. Pinned two ways: the DOM subtitle (which
  // never depended on audio and would have papered over a "just no sound"
  // read of this bug) really is showing Ape's line, AND — the actual
  // regression target — `voiceLog[0]`, populated from `playCue`'s own
  // real-time return value rather than a retroactive `hasSample()` re-check
  // (which by now, after the manifest has long since finished loading, could
  // no longer see the race at all), reports that the take actually played. -
  const firstLine = carRide.voiceLog[0];
  check('the first Ape cue/subtitle registered in the event log during a fresh playthrough is his opening pitch',
    firstLine?.speaker === 'APE'
      && firstLine?.cue === 'vo.silvercase.car.ape.pitch'
      && carRide.subtitle.shown === true
      && carRide.subtitle.who === 'Ape'
      && carRide.subtitle.line === firstLine?.text,
    JSON.stringify({ firstLine, subtitle: carRide.subtitle }));
  check('the first Ape line of a fresh playthrough actually plays its recorded audio, not a silent subtitle',
    firstLine?.playedAudio === true,
    JSON.stringify(firstLine));
  check('Ape’s dialogue animation keeps the complete underarm jacket shell opaque',
    carRide.apeDialoguePose.shell.ribcage.length === 1
      && carRide.apeDialoguePose.shell.deltoid.length === 2
      && carRide.apeDialoguePose.shell.upperarm.length === 2
      && Object.values(carRide.apeDialoguePose.shell).flat()
        .every((colour) => colour === 0x111116),
    JSON.stringify(carRide.apeDialoguePose));
  const openingPosition = carRide.openingReceipt?.positional?.position;
  check('Ape’s opening take is a receipt-backed indoor emitter following the live driver rig',
    carRide.openingReceipt?.source === 'buffer'
      && carRide.openingReceipt?.started === true
      && carRide.openingReceipt?.speakerId === 'ape'
      && carRide.openingReceipt?.subtitle === firstLine?.text
      && carRide.openingReceipt?.positional?.enabled === true
      && carRide.openingReceipt?.positional?.follows === true
      && carRide.openingReceipt?.positional?.ref === 1.8
      && carRide.openingReceipt?.positional?.maxDist === 16
      && carRide.openingReceipt?.positional?.rolloff === 1
      && openingPosition
      && Math.abs(openingPosition.x - carRide.apeEmitter.x) < 0.001
      && Math.abs(openingPosition.y - carRide.apeEmitter.y) < 0.001
      && Math.abs(openingPosition.z - carRide.apeEmitter.z) < 0.001,
    JSON.stringify({ receipt: carRide.openingReceipt, emitter: carRide.apeEmitter }));

  // ---- Audio residency: begin() now genuinely awaits audio.loadManifest(...)
  // before returning (see above), so by this point in the script the promise
  // is already settled — this re-await is just a defensive no-op guard
  // against a future regression reintroducing the old fire-and-forget shape. -
  await page.evaluate(async () => {
    const audio = window.silvercase.audio;
    if (audio._manifestLoadPromise) await audio._manifestLoadPromise;
  });
  const silverCaseAudioResidency = await page.evaluate(() => {
    const audio = window.silvercase.audio;
    return {
      plan: audio.preloadStats ?? null,
      loaded: audio.loadedCount,
      resident: [...audio.buffers.keys()].sort(),
    };
  });
  const missingSilverCaseNames = expectedSilverCaseResidentNames
    .filter((name) => !silverCaseAudioResidency.resident.includes(name));
  const unexpectedSilverCaseNames = silverCaseAudioResidency.resident
    .filter((name) => !expectedSilverCaseResidentNames.includes(name));
  check('every selected Silver Case cue has an indexed recording on disk',
    missingSilverCaseDeliveries.length === 0,
    JSON.stringify({
      missing: missingSilverCaseDeliveries.map((cue) => ({
        cue: cue.name,
        file: cue.file || `${cue.name}.mp3`,
      })),
    }));
  check('The Silver Case decodes exactly its own vo.silvercase.* dialogue plus its named effect cues',
    silverCaseAudioResidency.plan?.manifestTotal === soundManifest.sfx.length
      && silverCaseAudioResidency.plan?.selected === selectedSilverCaseCues.length
      && silverCaseAudioResidency.loaded === expectedSilverCaseResidentNames.length
      && silverCaseAudioResidency.resident.length === expectedSilverCaseResidentNames.length
      && missingSilverCaseNames.length === 0
      && unexpectedSilverCaseNames.length === 0,
    JSON.stringify({
      plan: silverCaseAudioResidency.plan,
      loaded: silverCaseAudioResidency.loaded,
      expected: expectedSilverCaseResidentNames.length,
      missing: missingSilverCaseNames.slice(0, 5),
      unexpected: unexpectedSilverCaseNames.slice(0, 5),
    }));
  check('the resident bank is a small slice of the shared manifest, not the whole bank',
    expectedSilverCaseResidentNames.length < soundManifest.sfx.length * 0.05,
    JSON.stringify({ resident: expectedSilverCaseResidentNames.length, manifest: soundManifest.sfx.length }));

  // ---- The car ride is a picture, not a black screen. ------------------
  /* `sc.tick()` advances mission state but intentionally does not render.
   * Give the real frame loop one full painted frame after the async Begin
   * seam resolves; otherwise a faster Begin can sample the menu's cleared
   * backbuffer before CAR_RIDE has ever reached WebGL. */
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const carLight = await screenLuminance();
  check('the car ride actually renders a lit cabin rather than a black screen',
    carLight.contextLost === false
      && carLight.drawingBuffer[0] > 0 && carLight.drawingBuffer[1] > 0
      && carLight.mean > 0.02 && carLight.litFraction > 0.3,
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

  const pulpSuits = await page.evaluate(async () => {
    const sc = window.silvercase;
    const { SILVERCASE_PROSPECT_PRESENTATION } = await import('/src/silvercase/cast/prospect.js');
    const colour = (root, name) => root.getObjectByName(name)?.material?.color?.getHex() ?? null;
    const apeSuit = (npc) => ({
      id: npc.characterId,
      outfit: npc.group.userData.npc?.outfit ?? null,
      jacket: colour(npc.group, 'suit.lapel.left'),
      shirt: colour(npc.group, 'suit.collar.point'),
      tie: colour(npc.group, 'suit.tie'),
      knot: colour(npc.group, 'suit.tie.knot'),
      pocketSquare: Boolean(npc.group.getObjectByName('suit.pocket-square')),
    });
    const arm = sc.viewModel.viewArm;
    return {
      face: sc.state().ape.face,
      carApe: apeSuit(sc.car.ape),
      apartmentApe: apeSuit(sc.cast.ape.npc),
      prospect: {
        id: arm.userData.characterPresentation?.id ?? null,
        face: SILVERCASE_PROSPECT_PRESENTATION.face,
        jacket: colour(arm, 'silvercase.viewmodel.suit-sleeve'),
        shirt: colour(arm, 'silvercase.viewmodel.shirt-cuff'),
        tie: SILVERCASE_PROSPECT_PRESENTATION.model.tieColour,
      },
    };
  });
  const suitedApe = (ape) => ape.id === CHARACTER_IDS.APE
    && ape.outfit === 'suit'
    && ape.jacket === 0x111116
    && ape.shirt === 0xf2efe7
    && ape.tie === 0x09090c
    && ape.knot === 0x09090c
    && ape.pocketSquare === false;
  check('both canonical Ape instances and Tony wear the live Pulp Fiction black/white suit contract',
    pulpSuits.face === 'assets/faces/ape.png'
      && suitedApe(pulpSuits.carApe)
      && suitedApe(pulpSuits.apartmentApe)
      && pulpSuits.prospect.id === CHARACTER_IDS.PROSPECT
      && pulpSuits.prospect.face === null
      && pulpSuits.prospect.jacket === 0x111116
      && pulpSuits.prospect.shirt === 0xf2efe7
      && pulpSuits.prospect.tie === 0x09090c,
    JSON.stringify(pulpSuits));

  const apeUnderarmShellAtBoot = await page.evaluate(() => {
    const inspect = (root) => {
      const byName = { ribcage: [], deltoid: [], upperarm: [] };
      root.traverse((node) => {
        if (!Object.hasOwn(byName, node.name) || !node.material?.color) return;
        byName[node.name].push(node.material.color.getHex());
      });
      return byName;
    };
    return {
      car: inspect(window.silvercase.car.ape.group),
      apartment: inspect(window.silvercase.cast.ape.group),
    };
  });
  const solidDarkSuitShell = (report) => report.ribcage.length === 1
    && report.deltoid.length === 2
    && report.upperarm.length === 2
    && Object.values(report).flat().every((colour) => colour === 0x111116);
  check('Ape’s underarm shell is jacket-dark in both live character rigs, not white shirt wedges',
    solidDarkSuitShell(apeUnderarmShellAtBoot.car)
      && solidDarkSuitShell(apeUnderarmShellAtBoot.apartment),
    JSON.stringify(apeUnderarmShellAtBoot));

  const prospectCloseReceipt = await page.evaluate(() => {
    const sc = window.silvercase;
    const cue = 'vo.silvercase.car.prospect.ask';
    let steps = 0;
    while (!sc.dialogue.voiceLog.some((entry) => entry.cue === cue) && steps < 200) {
      sc.tick(0.05);
      steps += 1;
    }
    const line = sc.dialogue.voiceLog.find((entry) => entry.cue === cue) ?? null;
    const receipt = [...sc.audio.playbackReceipts].reverse()
      .find((entry) => entry.requested === cue) ?? null;
    return { steps, line, receipt };
  });
  check('Tony’s first-person car line stays close/non-positional while retaining speaker and subtitle evidence',
    prospectCloseReceipt.line?.playedAudio === true
      && prospectCloseReceipt.receipt?.source === 'buffer'
      && prospectCloseReceipt.receipt?.started === true
      && prospectCloseReceipt.receipt?.speakerId === 'prospect'
      && prospectCloseReceipt.receipt?.subtitle === prospectCloseReceipt.line?.text
      && prospectCloseReceipt.receipt?.positional?.enabled === false
      && prospectCloseReceipt.receipt?.positional?.follows === false,
    JSON.stringify(prospectCloseReceipt));

  // ---- The steering wheel is a steering wheel. ---------------------------
  // "Apes steering wheel is sideways." A TorusGeometry's axis is +Z, which in
  // this cabin is already "facing the driver"; the old `rotation.x = PI/2.4`
  // (75°) laid it almost flat, so its axis pointed at the floor. A car wheel
  // rakes the other way and by a quarter as much, so the axis stays mostly
  // horizontal. Measured off the world matrix rather than off the authored
  // number, so a re-parent or a rebuilt rig is still held to the same thing.
  const wheelRig = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const car = window.silvercase.car;
    const rig = car.root.getObjectByName('steeringWheel');
    if (!rig) return { present: false };
    car.root.updateWorldMatrix(true, true);
    const axis = new THREE.Vector3(0, 0, 1)
      .transformDirection(rig.matrixWorld).normalize();
    let parts = 0;
    rig.traverse((o) => { if (o.isMesh) parts += 1; });
    return {
      present: true,
      axis: axis.toArray().map((n) => +n.toFixed(3)),
      rake: +rig.rotation.x.toFixed(3),
      parts,
    };
  });
  check('the steering wheel faces the driver instead of lying flat like a table',
    wheelRig.present
      && wheelRig.axis[2] > 0.8 && Math.abs(wheelRig.axis[1]) < 0.5
      && wheelRig.rake < 0 && wheelRig.rake > -0.8
      && wheelRig.parts >= 6,
    JSON.stringify(wheelRig));

  // ---- …and the cabin around it has something in it. --------------------
  const carDressing = await page.evaluate(() => {
    let meshes = 0;
    window.silvercase.car.root.traverse((o) => { if (o.isMesh) meshes += 1; });
    return { meshes };
  });
  check('the car interior is dressed rather than a dashboard in a void',
    carDressing.meshes >= 60, JSON.stringify(carDressing));

  // ---- Ape's identity is the campaign's, not a local lookalike. His suit
  // is deliberately scene-local, so compare the body/head facts that define
  // the man rather than demanding the Bing's casual tee on this job. --------
  const canonicalApeFields = ['height', 'build', 'hair', 'hairColour', 'beard', 'skin'];
  check('Ape is the canonical campaign character and body beneath the mission suit',
    carRide.state.ape.characterId === APE_FAMILY_MEMBER.id
      && carRide.state.ape.characterId === CHARACTER_IDS.APE
      && carRide.state.ape.family === true
      && carRide.state.ape.face === 'assets/faces/ape.png'
      && canonicalApeFields.every(
        (field) => carRide.state.ape.model[field] === APE_FAMILY_MEMBER.model[field],
      ),
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
  const arrivalScore = await page.evaluate(() => window.silvercase.arrivalScore());
  check('the Silver Case pickup score starts once and fades at hallway arrival',
    arrivalScore.key === 'music.arrival.silver-case'
      && arrivalScore.startCount === 1
      && arrivalScore.stopCount === 1
      && arrivalScore.stopReason === 'hallway-arrival'
      && arrivalScore.active === false
      && arrivalScore.duckedByCanonicalVoiceBus === true,
    JSON.stringify(arrivalScore));

  // ---- "Ape is not in the hallway - he should be in the hallway with you
  // when you spawn in." The hallway runs x 0…6; the flat starts at x 6. He
  // used to be built at x 7.1, i.e. already inside, before the player had
  // knocked. Being in the corridor is the check — and being close enough to
  // the spawn to be in frame, not at the far end of it. -------------------
  const apeAtSpawn = await page.evaluate(() => {
    const sc = window.silvercase;
    const ape = sc.cast.ape.group.position;
    const player = sc.player.position;
    return {
      x: +ape.x.toFixed(3),
      z: +ape.z.toFixed(3),
      distance: +Math.hypot(ape.x - player.x, ape.z - player.z).toFixed(3),
      visible: sc.cast.ape.group.visible,
    };
  });
  check('Ape is standing in the hallway with the player at spawn, not already inside',
    apeAtSpawn.visible && apeAtSpawn.x > 0.8 && apeAtSpawn.x < 6
      && apeAtSpawn.distance < 3.5,
    JSON.stringify(apeAtSpawn));

  // ---- KNOCK / ENTER_APARTMENT (brief dwell, just enough to confirm entry,
  // never long enough for either beat's own dialogue chain to auto-advance
  // before the next go() overwrites it — see the mission's DialogueController,
  // whose play() unconditionally replaces the active queue and its onDone). -
  let knock = await go('KNOCK');
  check('KNOCK is reachable', knock.beat === 'KNOCK', knock.beat);
  let enterApt = await go('ENTER_APARTMENT');
  check('ENTER_APARTMENT is reachable', enterApt.beat === 'ENTER_APARTMENT', enterApt.beat);

  // ---- V2 (2026-08-06 playtest): "After the player opens the door, the
  // Ape should step INTO the apartment (currently stays outside)." --------
  // The front door is already open by this point — its own creak-and-swing
  // tween runs on a fixed 0.5s+0.8s timer inside KNOCK, well before this
  // beat is ever reached — so this dwells inside ENTER_APARTMENT itself,
  // simulating a player who takes a few seconds to walk through the open
  // doorway before shutting it, and reads Ape's position WHILE that beat is
  // still current. That is the actual regression: he used to sit at
  // APE_SPOTS.door (hallway side, x 5.25) for this entire beat and only ever
  // walked in once ESTABLISH_CONTROL began, i.e. once the player closed the
  // door behind themselves — so checking his position only after that beat
  // (as the mission always has) would pass on the old, buggy staging too.
  // APARTMENT_ROOM starts at x=6; the 0.5 margin below clears the doorway/
  // threshold itself, not just the room's nominal edge.
  const apeWalkStart = enterApt.ape.at;
  const apeWalking = await tick(0.4);
  const apeWalkingOutfit = await page.evaluate(() => {
    const ape = window.silvercase.cast.ape;
    const shell = { ribcage: [], deltoid: [], upperarm: [] };
    ape.group.traverse((node) => {
      if (!Object.hasOwn(shell, node.name) || !node.material?.color) return;
      shell[node.name].push(node.material.color.getHex());
    });
    return { shell };
  });
  check('Ape’s jacket remains a complete dark shell while he walks through the doorway',
    Math.hypot(apeWalking.ape.at.x - apeWalkStart.x, apeWalking.ape.at.z - apeWalkStart.z) > 0.1
      && apeWalkingOutfit.shell.ribcage.length === 1
      && apeWalkingOutfit.shell.deltoid.length === 2
      && apeWalkingOutfit.shell.upperarm.length === 2
      && Object.values(apeWalkingOutfit.shell).flat().every((colour) => colour === 0x111116),
    JSON.stringify({ from: apeWalkStart, to: apeWalking.ape.at, ...apeWalkingOutfit }));
  const apeDuringEntry = await tick(2.1);
  check('ENTER_APARTMENT dialogue/timing is unaffected by the walk-in',
    apeDuringEntry.beat === 'ENTER_APARTMENT', apeDuringEntry.beat);
  check("Ape steps into the apartment volume while the door stands open, not left waiting in the hallway",
    apeDuringEntry.ape.at.x > APARTMENT_ROOM.x0 + 0.5
      && apeDuringEntry.ape.at.x < APARTMENT_ROOM.x1
      && apeDuringEntry.ape.at.z > APARTMENT_ROOM.z0
      && apeDuringEntry.ape.at.z < APARTMENT_ROOM.z1,
    JSON.stringify({ at: apeDuringEntry.ape.at, apartment: APARTMENT_ROOM }));

  // ---- "Coffee table is in the couch need to move it." -------------------
  // Measured, not asserted against a literal position: the two props' own
  // world bounding boxes must not intersect, and the gap in front of the couch
  // has to be walkable (the player's capsule is 0.30 m — core/player.js).
  const furniture = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const props = window.silvercase.apartment.props;
    const boxOf = (obj) => {
      obj.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(obj);
    };
    const couch = boxOf(props.couch.group);
    const table = boxOf(props.coffeeTable.group);
    return {
      couch: { min: couch.min.toArray(), max: couch.max.toArray() },
      table: { min: table.min.toArray(), max: table.max.toArray() },
      intersects: couch.intersectsBox(table),
      gap: +(couch.min.z - table.max.z).toFixed(3),
    };
  });
  check('the coffee table sits in front of the couch instead of inside it',
    furniture.intersects === false && furniture.gap > 0.25,
    JSON.stringify(furniture));

  // ---- "The bathroom door also doesn't look like a door." ---------------
  // It is a door now: a leaf with panels, hardware and a lined casing rather
  // than one slab of laminate — and it starts genuinely off the latch, which
  // is what the mission's own clue line claims about it.
  const bathDoorAtRest = await page.evaluate(() => {
    const door = window.silvercase.apartment.doors.bathroomDoor;
    let parts = 0;
    door.group.traverse((o) => { if (o.isMesh) parts += 1; });
    return {
      parts,
      rotation: +door.group.rotation.y.toFixed(3),
      ajar: door.isAjar(),
      open: door.isOpen(),
      casing: Boolean(window.silvercase.apartment.root.getObjectByName('bathroomCasing')),
    };
  });
  check('the bathroom door is a built door, hanging ajar before anybody kicks it',
    bathDoorAtRest.parts >= 8 && bathDoorAtRest.casing
      && bathDoorAtRest.ajar === true && bathDoorAtRest.open === false,
    JSON.stringify(bathDoorAtRest));

  // ---- ESTABLISH_CONTROL -------------------------------------------------
  let establish = await go('ESTABLISH_CONTROL');
  let caseOcclusionVisible = await page.evaluate(
    () => window.silvercase.apartment.props.caseOcclusion.visible,
  );
  check('ESTABLISH_CONTROL opens with the case still hidden behind the duffel',
    establish.beat === 'ESTABLISH_CONTROL' && caseOcclusionVisible === true,
    JSON.stringify({ establish, caseOcclusionVisible }));

  // ---- Movement during ESTABLISH_CONTROL: cross the real browser Adapter
  // Seam. Directly setting `player.enabled` used to let a scene with no DOM
  // input wiring pass this check.
  await page.locator('canvas').click({ position: { x: 480, y: 300 } });
  await page.waitForFunction(() => window.silvercase.input.snapshot().captured, null, {
    timeout: 5000,
  });
  const beforeMove = await page.evaluate(() => {
    const p = window.silvercase.player;
    return { x: p.position.x, z: p.position.z, yaw: p.yaw };
  });
  await page.mouse.move(480, 300);
  await page.mouse.move(550, 265, { steps: 2 });
  await page.keyboard.down('w');
  await page.waitForTimeout(100);
  await page.evaluate(() => window.silvercase.tick(0.6));
  const heldKeys = await page.evaluate(() => [...window.silvercase.player.keys]);
  await page.keyboard.up('w');
  await page.waitForTimeout(60);
  const afterMove = await page.evaluate(() => {
    const p = window.silvercase.player;
    return {
      x: p.position.x,
      z: p.position.z,
      yaw: p.yaw,
      keys: [...p.keys],
      beat: window.silvercase.state().beat,
      input: window.silvercase.input.snapshot(),
    };
  });
  const moved = Math.hypot(afterMove.x - beforeMove.x, afterMove.z - beforeMove.z);
  check('real click, mouse and W input capture, look, move and release during ESTABLISH_CONTROL',
    afterMove.beat === 'ESTABLISH_CONTROL'
      && afterMove.input.captured
      && heldKeys.includes('KeyW')
      && !afterMove.keys.includes('KeyW')
      && moved > 0.2
      && Math.abs(afterMove.yaw - beforeMove.yaw) > 0.01
      && Number.isFinite(afterMove.x),
    JSON.stringify({ beforeMove, heldKeys, afterMove, moved: +moved.toFixed(3) }));

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

  // ---- Ape is holding a gun of his own. ----------------------------------
  // "Ape needs a gun … Ape should be holding his gun." Mounted in his right
  // hand from build (the same `mountHandRevolver` the bathroom man's uses) and
  // shown the moment he gives the order. Arming him must not make him a
  // threat: Actor's locked `hostile` setter is what guarantees that, so it is
  // checked here rather than assumed.
  const apeArmed = await page.evaluate(() => window.silvercase.state().ape);
  check('Ape draws his own big revolver, in his own hand, and is still not hostile',
    apeArmed.armed && apeArmed.gun === 'big-revolver' && apeArmed.gunInHand
      && apeArmed.weaponDrawn === true && apeArmed.weaponVisible === true
      && apeArmed.hostile === false,
    JSON.stringify(apeArmed));
  const apeUnderarmShellArmed = await page.evaluate(() => {
    const ape = window.silvercase.cast.ape;
    const colours = { ribcage: [], deltoid: [], upperarm: [] };
    ape.group.traverse((node) => {
      if (!Object.hasOwn(colours, node.name) || !node.material?.color) return;
      colours[node.name].push(node.material.color.getHex());
    });
    return {
      colours,
      armRotations: {
        left: ape.parts.armL.rotation.toArray(),
        right: ape.parts.armR.rotation.toArray(),
        foreRight: ape.parts.foreR.rotation.toArray(),
      },
    };
  });
  const rotationMagnitude = (rotation) => rotation
    .filter((value) => typeof value === 'number')
    .reduce((sum, value) => sum + Math.abs(value), 0);
  check('Ape’s jacket shell stays solid while his live gun-carry pose raises and bends both arms',
    solidDarkSuitShell(apeUnderarmShellArmed.colours)
      && rotationMagnitude(apeUnderarmShellArmed.armRotations.left) > 0.4
      && rotationMagnitude(apeUnderarmShellArmed.armRotations.right) > 0.1
      && rotationMagnitude(apeUnderarmShellArmed.armRotations.foreRight) > 0.1,
    JSON.stringify(apeUnderarmShellArmed));

  // ---- The on-screen instruction. ----------------------------------------
  // "There should be a pop up to kill the guy on the couch. Its unclear who to
  // shoot. So the screen should say it like in the hub as a game instruction
  // (not another character or anything)." So: no speaker, no cue, on screen
  // for as long as the order stands.
  /* Wait for Ape to finish naming the man before reading the screen. */
  await tickUntil('instruction');
  const couchInstruction = await page.evaluate(() => {
    const el = document.getElementById('instruction');
    return { text: el.textContent, shown: el.classList.contains('show') };
  });
  check('the couch order puts a speakerless on-screen instruction up and leaves it up',
    couchInstruction.shown && /couch/i.test(couchInstruction.text)
      && /left click/i.test(couchInstruction.text),
    JSON.stringify(couchInstruction));

  // ---- Stand somewhere a person can see the room from. -------------------
  // The WASD check above left the player partway down the corridor, and the
  // shot is a real ray now: from the hallway every one of these checks would
  // be measuring the wall. Put him on the floor of the flat, facing in.
  await page.evaluate(() => {
    const p = window.silvercase.player;
    p.position.set(9.2, 1.66, 0.3);
    p.pitch = 0;
    p.velocity.set(0, 0, 0);
  });
  await page.evaluate(() => window.silvercase.tick(0.05));

  // ---- THE ONE. ----------------------------------------------------------
  //
  //   "you should also actually have to shoot where you are aiming. I just
  //    clicked on the guy in the chair and it killed the bathroom guy."
  //
  // This is that bug, reproduced deliberately: put the crosshair on the man in
  // the chair during the beat that ordered the man on the COUCH shot, and pull
  // the trigger. Nobody may die, the bathroom man least of all — he is still
  // hidden in the alcove and two beats away from existing.
  const wrongMan = await page.evaluate(() => {
    const sc = window.silvercase;
    const aim = sc.shootAt('chester');
    sc.tick(0.2);
    return { aim, state: sc.state() };
  });
  check('aiming at the man in the chair and firing does not kill the man on the couch',
    wrongMan.aim.resolvesTo === 'chester'
      && wrongMan.state.actors.deke.alive === true
      && wrongMan.state.actors.pruitt.alive === true
      && wrongMan.state.beat === 'COUCH_SHOOTING'
      && wrongMan.state.mission.lastShot.actor === 'Chester'
      && wrongMan.state.mission.lastShot.intended === 'Deke'
      && wrongMan.state.mission.lastShot.onTarget === false,
    JSON.stringify({ aim: wrongMan.aim, shot: wrongMan.state.mission.lastShot }));

  check('the man the stray round found is hit but never killed by it',
    wrongMan.state.actors.chester.alive === true
      && wrongMan.state.actors.chester.hp < 60
      && wrongMan.state.marks.onBodies.chester >= 1,
    JSON.stringify({ chester: wrongMan.state.actors.chester, marks: wrongMan.state.marks }));

  // ---- A round that finds nobody still goes somewhere. -------------------
  const strayRound = await page.evaluate(() => {
    const sc = window.silvercase;
    const before = sc.state().marks.holes;
    // Square at the south wall, past the east end of the couch — a shot with
    // nobody anywhere along it.
    sc.player.yaw = Math.PI;
    sc.player.pitch = 0;
    sc.player.update(0);
    sc.pressFire();
    sc.tick(0.2);
    const state = sc.state();
    return { before, after: state.marks.holes, state };
  });
  check('a shot that finds nobody marks the room instead of killing somebody',
    strayRound.after > strayRound.before
      && strayRound.state.mission.lastShot.actor === null
      && strayRound.state.mission.lastShot.surface === true
      && strayRound.state.actors.deke.alive === true
      && strayRound.state.beat === 'COUCH_SHOOTING',
    JSON.stringify({ holes: [strayRound.before, strayRound.after], shot: strayRound.state.mission.lastShot }));

  // ---- Now shoot the man you were told to. -------------------------------
  const dekeSeated = await actorBounds('deke');
  const onTargetCouch = await page.evaluate(() => {
    const sc = window.silvercase;
    const aim = sc.aimAt('deke');
    sc.tick(0.05);
    const hud = {
      tag: document.getElementById('targetTag').classList.contains('show'),
      reticleHot: document.getElementById('reticle').classList.contains('hot'),
      name: document.getElementById('targetTag').textContent,
    };
    return { aim, hud, aimState: sc.state().aim };
  });
  check('putting the crosshair on the ordered man lights the reticle and names him',
    onTargetCouch.aim.resolvesTo === 'deke'
      && onTargetCouch.aimState.onTarget === true
      && onTargetCouch.aimState.ordered === 'Deke'
      && onTargetCouch.hud.tag && onTargetCouch.hud.reticleHot
      && /DEKE/.test(onTargetCouch.hud.name),
    JSON.stringify(onTargetCouch));

  const couchMouseDownBefore = await page.evaluate(
    () => window.silvercase.input.snapshot().mouseDownEvents,
  );
  /* Pointer-lock mouse moves are relative camera input. locator.click() first
   * repositions the synthetic cursor and can turn a correctly aimed camera
   * away from the target before mousedown. Down/up is the player's real
   * trigger without injecting a verifier-only look delta. */
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await page.waitForFunction(
    (before) => window.silvercase.input.snapshot().mouseDownEvents > before,
    couchMouseDownBefore,
    { timeout: 3000 },
  );
  /* Capture the subtitle receipt IN-PAGE, on the frame Chester owns the
   * card. The old flow waited for his cue in the voiceLog and then read the
   * card from the harness -- but "What the hell, man?!" is a short take, and
   * by the time that second round trip landed the card could legitimately
   * belong to Ape's follow-up (observed live: ape.moreseating 1.5 s in at
   * sample time, on the scheduled runner and on a loaded local box alike).
   * The rAF-polled predicate sees every frame, so a Chester card that never
   * shows still times out and fails honestly. */
  await page.waitForFunction(() => {
    const sc = window.silvercase;
    const subs = document.getElementById('subs');
    const who = document.getElementById('subsWho')?.textContent ?? '';
    if (subs?.classList.contains('show') && who === 'Chester' && !window.__chesterSubtitleReceipt) {
      window.__chesterSubtitleReceipt = {
        shown: true,
        who,
        text: document.getElementById('subsLine')?.textContent ?? '',
      };
    }
    return !sc.cast.deke.alive
      && sc.dialogue.voiceLog.some((line) => line.cue === 'vo.silvercase.couch.chester.whatthehell')
      && Boolean(window.__chesterSubtitleReceipt);
  }, null, { timeout: 5000 });
  const chesterSubtitleReceipt = await page.evaluate(() => window.__chesterSubtitleReceipt);
  /* A wall-clock sleep is not a game-frame guarantee under SwiftShader. The
   * old 120 ms pause could contain no rendered update, then sample Chester at
   * the first few milliseconds of a valid flinch: his limbs had visibly
   * started moving, but the connected root had not yet crossed the 1.5 cm
   * invariant asserted below. Wait for that exact live displacement instead;
   * a broken reaction still times out and fails rather than being advanced by
   * a verifier-only tick. */
  await page.waitForFunction(() => {
    const chester = window.silvercase.cast.chester;
    const reaction = chester.reaction;
    if (!reaction) return false;
    const dx = chester.group.position.x - reaction.origin.x;
    const dy = chester.group.position.y - reaction.origin.y;
    const dz = chester.group.position.z - reaction.origin.z;
    return dx * reaction.away.x + dy * reaction.away.y + dz * reaction.away.z > 0.015;
  }, null, { timeout: 5000 });
  const chesterImmediateReaction = await page.evaluate(() => {
    const sc = window.silvercase;
    const line = [...sc.dialogue.voiceLog].reverse()
      .find((entry) => entry.cue === 'vo.silvercase.couch.chester.whatthehell');
    const subs = document.getElementById('subs');
    const chester = sc.cast.chester;
    return {
      line,
      subtitle: {
        shown: subs?.classList.contains('show') ?? false,
        who: document.getElementById('subsWho')?.textContent ?? '',
        text: document.getElementById('subsLine')?.textContent ?? '',
      },
      reaction: chester.reaction ? {
        elapsed: chester.reaction.elapsed,
        duration: chester.reaction.duration,
        origin: chester.reaction.origin.toArray(),
        away: chester.reaction.away.toArray(),
        stepDistance: chester.reaction.stepDistance,
      } : null,
      pose: {
        position: chester.group.position.toArray(),
        head: chester.parts.head.rotation.toArray(),
        armL: chester.parts.armL.rotation.toArray(),
        armR: chester.parts.armR.rotation.toArray(),
        torso: chester.parts.torsoWrap.rotation.toArray(),
        connected: [
          chester.parts.torsoWrap,
          chester.parts.hips,
          chester.parts.legL,
          chester.parts.legR,
        ].every((part) => {
          for (let node = part; node; node = node.parent) if (node === chester.group) return true;
          return false;
        }),
      },
      input: sc.input.snapshot(),
      state: sc.state(),
    };
  });
  chesterImmediateReaction.subtitle = chesterSubtitleReceipt;
  const chesterFlinch = chesterImmediateReaction.reaction
    ? Math.sin(Math.PI * (
      chesterImmediateReaction.reaction.elapsed / chesterImmediateReaction.reaction.duration
    ))
    : 0;
  check('a real left click on Deke immediately gives Chester his own subtitle and authored flinch',
    chesterImmediateReaction.state.actors.deke.alive === false
      && chesterImmediateReaction.line?.speaker === 'CHESTER'
      && chesterImmediateReaction.line?.text === 'What the hell, man?!'
      && chesterImmediateReaction.subtitle.shown
      && chesterImmediateReaction.subtitle.who === 'Chester'
      && chesterImmediateReaction.subtitle.text === 'What the hell, man?!'
      && chesterImmediateReaction.reaction?.elapsed > 0
      && chesterImmediateReaction.reaction?.elapsed < chesterImmediateReaction.reaction?.duration
      && chesterFlinch > 0.02
      && Math.abs(chesterImmediateReaction.pose.head[0] - (-0.16 * chesterFlinch)) < 0.005
      && Math.abs(chesterImmediateReaction.pose.armL[0] - (-0.5 * chesterFlinch)) < 0.005
      && Math.abs(chesterImmediateReaction.pose.armR[0] - (-0.42 * chesterFlinch)) < 0.005
      && Math.abs(chesterImmediateReaction.pose.torso[2] - (0.08 * chesterFlinch)) < 0.005
      && chesterImmediateReaction.input.mouseDownEvents > couchMouseDownBefore,
    JSON.stringify(chesterImmediateReaction));
  check('Chester’s immediate reaction plays its delivered recording rather than hiding behind subtitles',
    chesterImmediateReaction.line?.playedAudio === true,
    JSON.stringify(chesterImmediateReaction.line));
  {
    const reaction = chesterImmediateReaction.reaction;
    const displacement = reaction
      ? chesterImmediateReaction.pose.position.map((value, i) => value - reaction.origin[i])
      : [0, 0, 0];
    const awayTravel = reaction
      ? displacement.reduce((sum, value, i) => sum + value * reaction.away[i], 0)
      : 0;
    check('Chester’s flinch moves his complete connected body backward from the shooter',
      chesterImmediateReaction.pose.connected === true
        && reaction?.stepDistance >= 0.08
        && awayTravel > 0.015,
      JSON.stringify({ reaction, displacement, awayTravel, pose: chesterImmediateReaction.pose }));
  }
  let afterCouchShot = await tickUntil('beat:LOU_QUESTION');
  check('firing on the couch kills Deke and the aftermath line advances to LOU_QUESTION',
    afterCouchShot.met && !afterCouchShot.state.actors.deke.alive
      && afterCouchShot.state.mission.lastShot.onTarget === true,
    JSON.stringify(afterCouchShot));

  // ---- "There also needs to be a bullet impact and blood on the guy." ----
  // The wound is parented to his own trunk, so it travels with the slump
  // rather than hanging in the air where he used to be.
  const dekeBlood = await page.evaluate(() => {
    const sc = window.silvercase;
    const marks = sc.impacts.marksFor(sc.cast.deke);
    return {
      count: sc.state().marks.onBodies.deke,
      attachedToFigure: marks.length > 0 && marks.every((m) => {
        let node = m.parent;
        while (node) { if (node === sc.cast.deke.group) return true; node = node.parent; }
        return false;
      }),
    };
  });
  check('the man shot on the couch wears the wound, and it goes down with him',
    dekeBlood.count >= 2 && dekeBlood.attachedToFigure,
    JSON.stringify(dekeBlood));

  // ---- The body stays on the couch. ------------------------------------
  // The couch's own footprint, straight out of ApartmentScene (x 6.925…9.075,
  // z 1.76…2.64, seat top 0.54). A corpse that sinks through to the floor or
  // slides off the front fails this; whether it STAYS there is checked again
  // at the far end of the mission, once several minutes of story have run.
  // (Nothing long is ticked here on purpose: the Lou question's own choice
  // timeout is six seconds and burning the clock would skip the beat.) Wait
  // only for the actor's authored 0.75 s collapse to finish. Capturing the
  // first box mid-slump and comparing it to the final corpse minutes later
  // reports ordinary death animation as corpse drift.
  // Sim-clock wait: funded for the slow box, finishes early on a fast one.
  await page.waitForFunction(() => window.silvercase.cast.deke.downT >= 0.75,
    null, { timeout: 120000 });
  const COUCH_BOX = { x0: 6.9, x1: 9.1, z0: 1.7, z1: 2.7 };
  const dekeSettled = await actorBounds('deke');
  const dekeSettledAt = (await page.evaluate(() => window.silvercase.state())).actors.deke;
  const couchOverlapX = Math.min(dekeSettled.max[0], COUCH_BOX.x1)
    - Math.max(dekeSettled.min[0], COUCH_BOX.x0);
  const couchOverlapZ = Math.min(dekeSettled.max[2], COUCH_BOX.z1)
    - Math.max(dekeSettled.min[2], COUCH_BOX.z0);
  const onTheCouch = couchOverlapX > 0.8 && couchOverlapZ > 0.4
    && dekeSettled.max[1] > 0.6 && dekeSettled.min[1] > -0.15;
  check('the man shot on the couch slumps onto the couch instead of the floor',
    onTheCouch && dekeSettledAt.seated === true && dekeSettledAt.alive === false,
    JSON.stringify({ before: dekeSeated, settled: dekeSettled }));

  // ---- LOU_QUESTION: this is Ape interrogating Chester, never a player
  // choice. Let the five-line exchange drain and prove the actual lines that
  // ran, their speaker labels, and the two men's final blocking. ------------
  let afterLou = await tickUntil('beat:SQUATCH_PRAYER');
  const louInterrogation = await page.evaluate(async () => {
    const [{ SEQUENCES, CHOICES }, { ANCHORS }] = await Promise.all([
      import('/src/silvercase/dialogue/script.js'),
      import('/src/silvercase/scenes/ApartmentScene.js'),
    ]);
    const sc = window.silvercase;
    const expected = [...SEQUENCES.louQuestionOpening, ...SEQUENCES.louQuestionPress]
      .map(({ speaker, text, cue }) => ({ speaker, text, cue }));
    const expectedCues = new Set(expected.map((line) => line.cue));
    const actual = sc.dialogue.voiceLog
      .filter((line) => expectedCues.has(line.cue))
      .map(({ speaker, text, cue }) => ({ speaker, text, cue }));
    const ape = sc.cast.ape;
    const chester = sc.cast.chester;
    const dx = chester.group.position.x - ape.group.position.x;
    const dz = chester.group.position.z - ape.group.position.z;
    const distance = Math.hypot(dx, dz);
    const chairDistance = Math.hypot(
      ANCHORS.chairSeat.x - ape.group.position.x,
      ANCHORS.chairSeat.z - ape.group.position.z,
    );
    const apeDot = distance > 0
      ? (Math.sin(ape.group.rotation.y) * dx + Math.cos(ape.group.rotation.y) * dz) / distance
      : 0;
    const chesterDot = distance > 0
      ? (Math.sin(chester.group.rotation.y) * -dx + Math.cos(chester.group.rotation.y) * -dz) / distance
      : 0;
    return {
      expected,
      actual,
      playerChoiceRemoved: !Object.hasOwn(CHOICES, 'louQuestion'),
      distance,
      chairDistance,
      apeDot,
      chesterDot,
      apeLooksAtPlayer: ape.npc.look,
      chesterLooksAtPlayer: chester.npc.look,
    };
  });
  check('Ape and Chester perform the exact five-line interrogation with no player/colors choice',
    afterLou.met
      && louInterrogation.playerChoiceRemoved
      && JSON.stringify(louInterrogation.actual) === JSON.stringify(louInterrogation.expected),
    JSON.stringify(louInterrogation));
  check('Ape closes to the chair and both men keep their eyelines on each other',
    louInterrogation.chairDistance >= 0.78 && louInterrogation.chairDistance <= 0.86
      // Chester has just recoiled his connected body away from the couch shot,
      // so live actor-to-actor distance is intentionally a little over 0.82 m.
      && louInterrogation.distance <= 1.05
      && louInterrogation.apeDot > 0.98
      && louInterrogation.chesterDot > 0.98
      && louInterrogation.apeLooksAtPlayer === false
      && louInterrogation.chesterLooksAtPlayer === false,
    JSON.stringify(louInterrogation));

  // ---- SQUATCH_PRAYER: drain Ape's lines, then hold E to finish it. -------
  let prayerLines = await tickUntil('choice:prayerFinish');
  check('the prayer opens its hold-E finish prompt once Ape is done reciting',
    prayerLines.met, JSON.stringify(prayerLines));
  const prayerPerformance = await page.evaluate(async () => {
    const { SEQUENCES } = await import('/src/silvercase/dialogue/script.js');
    const expected = [...SEQUENCES.squatchPrayerIntro, ...SEQUENCES.squatchPrayer]
      .map(({ speaker, text, cue }) => ({ speaker, text, cue }));
    const expectedCues = new Set(expected.map((line) => line.cue));
    const actual = window.silvercase.dialogue.voiceLog
      .filter((line) => expectedCues.has(line.cue))
      .map(({ speaker, text, cue }) => ({ speaker, text, cue }));
    return { expected, actual };
  });
  check('Ape performs the complete Squatchiel 69:17 intro and four-line passage in order',
    JSON.stringify(prayerPerformance.actual) === JSON.stringify(prayerPerformance.expected),
    JSON.stringify(prayerPerformance));
  await page.keyboard.down('KeyE');
  let afterPrayer = await tickUntil('beat:CHAIR_SHOOTING');
  /* Ape sets the chair up before the screen names the button. */
  await tickUntil('instruction');
  afterPrayer = { ...afterPrayer, state: await page.evaluate(() => window.silvercase.state()) };
  await page.keyboard.up('KeyE');
  check('finishing the ritual hands over to the chair beat with Chester still alive',
    afterPrayer.met
      && afterPrayer.state.actors.chester.alive === true
      && afterPrayer.state.aim.ordered === 'Chester'
      && /chair/i.test(afterPrayer.state.aim.instruction)
      && afterPrayer.state.aim.instructionShown === true,
    JSON.stringify(afterPrayer));
  const playerPrayerFinish = await page.evaluate(async () => {
    const { SEQUENCES } = await import('/src/silvercase/dialogue/script.js');
    const expected = SEQUENCES.squatchPrayerFinish.map(({ speaker, text, cue }) => ({ speaker, text, cue }));
    const expectedCues = new Set(expected.map((line) => line.cue));
    const actual = window.silvercase.dialogue.voiceLog
      .filter((line) => expectedCues.has(line.cue))
      .map(({ speaker, text, cue }) => ({ speaker, text, cue }));
    return { expected, actual };
  });
  check('the player-synced final vengeance line lands before the chair execution arms',
    JSON.stringify(playerPrayerFinish.actual) === JSON.stringify(playerPrayerFinish.expected),
    JSON.stringify(playerPrayerFinish));

  // ---- "Ape needs a gun. There should also be a prompt to shoot the guy in
  // the chair with Ape." Both guns are up, the prompt is on screen, and the
  // shot has to land on the man in the chair like every other shot now. ----
  const chairAim = await page.evaluate(() => {
    const sc = window.silvercase;
    const shell = { ribcage: [], deltoid: [], upperarm: [] };
    sc.cast.ape.group.traverse((node) => {
      if (!Object.hasOwn(shell, node.name) || !node.material?.color) return;
      shell[node.name].push(node.material.color.getHex());
    });
    return {
      apeBefore: sc.state().ape,
      shell,
      aim: sc.aimAt('chester'),
      mouseDownEvents: sc.input.snapshot().mouseDownEvents,
    };
  });
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await page.waitForFunction(() => {
    const state = window.silvercase.state();
    return state.mission.lastShot?.intended === 'Chester'
      && state.mission.lastShot?.onTarget === true;
  }, null, { timeout: 5000 });
  const chairImmediately = await page.evaluate(() => ({
    state: window.silvercase.state(),
    input: window.silvercase.input.snapshot(),
  }));
  // Do not confuse a slow SwiftShader frame cadence with a partial corpse.
  // This waits on the live animation clock rather than calling sc.tick().
  /* downT is a SIM clock: SwiftShader renders at well under a tenth of wall
   * speed on a loaded box (17.8 sim-seconds in 209 wall-seconds, measured in
   * the luxury verifier), so 0.75 sim-seconds can honestly need over a
   * minute of wall time. 12 s timed out on the scheduled runner and on a
   * loaded local box; the wait now funds the slow box and finishes early on
   * a fast one. */
  await page.waitForFunction(() => window.silvercase.cast.chester.downT >= 0.75,
    null, { timeout: 120000 });
  const chairShot = {
    ...chairAim,
    immediately: chairImmediately.state,
    input: chairImmediately.input,
    state: await page.evaluate(() => window.silvercase.state()),
  };
  check('Ape has his gun levelled at the chair while the prompt is up',
    chairShot.apeBefore.weaponDrawn === true && chairShot.apeBefore.weaponVisible === true
      && Math.abs(chairShot.apeBefore.at.x - 8) < 0.6
      && chairShot.shell.ribcage.length === 1
      && chairShot.shell.deltoid.length === 2
      && chairShot.shell.upperarm.length === 2
      && Object.values(chairShot.shell).flat().every((colour) => colour === 0x111116),
    JSON.stringify({ ape: chairShot.apeBefore, shell: chairShot.shell }));
  check('a real left click on the man in the chair kills him, and Ape fires with you',
    chairShot.aim.resolvesTo === 'chester'
      && chairShot.immediately.mission.lastShot.onTarget === true
      && chairShot.state.actors.chester.alive === false
      && chairShot.state.mission.flags.apeFinishedChester === false
      && chairShot.input.mouseDownEvents > chairShot.mouseDownEvents
      // Tony's wound plus its spatter, plus the round Ape put in him.
      && chairShot.state.marks.onBodies.chester >= 3,
    JSON.stringify({ aim: chairShot.aim, marks: chairShot.state.marks.onBodies }));

  const connectedChairDeath = await page.evaluate(async () => {
    const THREE = await import('/vendor/three.module.min.js');
    const sc = window.silvercase;
    const actor = sc.cast.chester;
    const parts = [
      actor.parts.torsoWrap,
      actor.parts.waist,
      actor.parts.hips,
      actor.parts.legL,
      actor.parts.legR,
    ];
    const connected = parts.every((part) => {
      for (let node = part; node; node = node.parent) if (node === actor.group) return true;
      return false;
    });
    actor.group.updateWorldMatrix(true, true);
    sc.apartment.props.chair.group.updateWorldMatrix(true, true);
    const actorBox = new THREE.Box3();
    actor.group.traverse((node) => {
      if (node.isMesh && node.name !== 'silvercase.mark') actorBox.expandByObject(node);
    });
    const chairBox = new THREE.Box3().setFromObject(sc.apartment.props.chair.group);
    const hip = actor.parts.hips.getWorldPosition(new THREE.Vector3());
    return {
      connected,
      bodyRotation: actor.parts.body.rotation.toArray(),
      hip: hip.toArray(),
      actor: { min: actorBox.min.toArray(), max: actorBox.max.toArray() },
      chair: { min: chairBox.min.toArray(), max: chairBox.max.toArray() },
      downT: actor.downT,
    };
  });
  check('Chester’s settled seated death remains one connected body anchored in the chair',
    connectedChairDeath.connected
      && connectedChairDeath.downT >= 0.75
      && connectedChairDeath.bodyRotation.slice(0, 3).every((value) => Math.abs(value) < 1e-5)
      && connectedChairDeath.hip[0] >= connectedChairDeath.chair.min[0] - 0.35
      && connectedChairDeath.hip[0] <= connectedChairDeath.chair.max[0] + 0.35
      && connectedChairDeath.hip[2] >= connectedChairDeath.chair.min[2] - 0.35
      && connectedChairDeath.hip[2] <= connectedChairDeath.chair.max[2] + 0.35
      && connectedChairDeath.actor.min[1] > -0.25
      && connectedChairDeath.actor.max[1] > 0.8,
    JSON.stringify(connectedChairDeath));
  let afterPrayerChain = await tickUntil('beat:BATHROOM_AMBUSH');
  await tick(2.1);
  afterPrayerChain = {
    ...afterPrayerChain,
    state: await page.evaluate(() => window.silvercase.state()),
  };
  check('the bathroom attacker lands two intentional misses before the return-fire window opens',
    afterPrayerChain.met
      && afterPrayerChain.state.reactionWindow.state === 'armed'
      && afterPrayerChain.state.reactionWindow.windowSeconds >= 3.2
      && afterPrayerChain.state.bathroomAmbush.openingShots === 2
      && afterPrayerChain.state.bathroomAmbush.openingImpacts.length === 2
      && afterPrayerChain.state.bathroomAmbush.playerWindowOpened === true
      && afterPrayerChain.state.bathroomAmbush.attackerMoving === false
      && afterPrayerChain.state.marks.holes >= afterLou.state.marks.holes + 2,
    JSON.stringify({
      window: afterPrayerChain.state.reactionWindow,
      ambush: afterPrayerChain.state.bathroomAmbush,
      marks: afterPrayerChain.state.marks,
    }));

  // ---- The bathroom man is holding the big revolver, and the door he came
  // through is off the latch rather than still standing in his way. The two
  // opening shots above already gave the door and attacker their authored
  // staging time, so this measures the completed entrance. -----------------
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
      bathDoorRotation: +sc.apartment.doors.bathroomDoor.group.rotation.y.toFixed(3),
    };
  });
  check('the bathroom man comes through an open door with the big revolver in hand',
    ambushStaging.armed && ambushStaging.gunName === 'big-revolver'
      && ambushStaging.inHand && ambushStaging.revealed && ambushStaging.bathDoorOpen,
    JSON.stringify(ambushStaging));

  // ---- Dirty the doomed attempt first: a graze on Winston and a round into
  // the floor — attempt-scoped marks and damage the retry must take back out
  // of the room, while Deke's couch wounds (pre-checkpoint history) stay. ---
  const dirtyAttempt = await page.evaluate(() => {
    const sc = window.silvercase;
    const wrongMan = sc.shootAt('winston');
    sc.tick(0.1);
    sc.player.pitch = -1.2;
    sc.player.update(0);
    sc.camera.updateMatrixWorld(true);
    sc.pressFire();
    sc.tick(0.1);
    return { wrongMan, state: sc.state() };
  });
  check('the failed attempt genuinely dirties the room: Winston grazed, plaster marked',
    dirtyAttempt.wrongMan.resolvesTo === 'winston'
      && dirtyAttempt.state.actors.winston.alive === true
      && dirtyAttempt.state.actors.winston.hp < afterLou.state.actors.winston.hp
      && dirtyAttempt.state.marks.onBodies.winston >= 1
      && dirtyAttempt.state.marks.holes > afterLou.state.marks.holes,
    JSON.stringify({
      wrongMan: dirtyAttempt.wrongMan,
      winston: dirtyAttempt.state.actors.winston,
      marks: dirtyAttempt.state.marks,
      baselineMarks: afterLou.state.marks,
    }));

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

  // ---- The retry is a rollback, not a fresh coat of paint. `afterLou.state`
  // is the state at the moment SQUATCH_PRAYER — the mission's one death
  // checkpoint — was first entered: attempt-scoped marks and damage vanish,
  // pre-checkpoint history (Deke's wounds) survives, and no timer, tween or
  // line from the failed timeline keeps running. --------------------------
  {
    const baseline = afterLou.state;
    // Chester's baseline marks are the couch-beat wrong-man graze — REAL
    // pre-checkpoint history, kept exactly like Deke's; only the chair-beat
    // kill wounds and the ambush graze on Winston are attempt-scoped.
    check('retry rolls the room back to the checkpoint: attempt marks gone, history kept',
      retried.marks.holes === baseline.marks.holes
        && retried.marks.onBodies.chester === baseline.marks.onBodies.chester
        && retried.marks.onBodies.winston === baseline.marks.onBodies.winston
        && retried.marks.onBodies.pruitt === 0
        && retried.marks.onBodies.deke === baseline.marks.onBodies.deke
        && retried.marks.onBodies.deke >= 1
        && retried.actors.winston.hp === baseline.actors.winston.hp
        && retried.actors.pruitt.revealed === false,
      JSON.stringify({
        retried: { marks: retried.marks, winstonHp: retried.actors.winston.hp },
        baseline: { marks: baseline.marks, winstonHp: baseline.actors.winston.hp },
      }));
    const retryHygiene = await page.evaluate(async () => {
      const { SEQUENCES } = await import('/src/silvercase/dialogue/script.js');
      const sc = window.silvercase;
      const prayerTexts = new Set(
        [...SEQUENCES.squatchPrayerIntro, ...SEQUENCES.squatchPrayer,
          ...SEQUENCES.squatchPrayerFinish].map((line) => line.text),
      );
      const failedTexts = new Set(SEQUENCES.bathroomFailed.map((line) => line.text));
      const live = [sc.dialogue.active, ...sc.dialogue.queue].filter(Boolean);
      return {
        liveLines: live.length,
        choiceOpen: Boolean(sc.dialogue.choice),
        allPrayer: live.every((line) => prayerTexts.has(line.text)),
        anyFailed: live.some((line) => failedTexts.has(line.text)),
        pendingTweens: sc.pendingTweens,
        flags: sc.state().mission.flags,
      };
    });
    check('retry cancels the failed run\'s dialogue and timers — only the prayer speaks',
      (retryHygiene.liveLines >= 1 ? retryHygiene.allPrayer : retryHygiene.choiceOpen)
        && retryHygiene.anyFailed === false
        && retryHygiene.flags.apeFinishedChester === false
        && retryHygiene.flags.apeFinishedWinston === false,
      JSON.stringify(retryHygiene));
  }

  // ---- Replay the prayer, this time resolving BATHROOM_AMBUSH fast, so the
  // reaction window is neutralized instead of expiring. -------------------
  const prayerAgain = await tickUntil('choice:prayerFinish');
  check('the prayer choice opens again after retrying', prayerAgain.met, JSON.stringify(prayerAgain));
  await page.keyboard.down('KeyE');
  // Second time through the chair beat, nobody pulls the trigger: the stall
  // path has Ape finish it himself after twelve seconds rather than leaving
  // the mission parked on a prompt forever, so this also proves that fallback.
  let afterPrayerAgain = await tickUntil('beat:BATHROOM_AMBUSH');
  await page.keyboard.up('KeyE');
  await tick(2.1);
  afterPrayerAgain = {
    ...afterPrayerAgain,
    state: await page.evaluate(() => window.silvercase.state()),
  };
  check('a player who will not take the chair shot has Ape take it, and the scene goes on',
    afterPrayerAgain.met
      && afterPrayerAgain.state.mission.flags.apeFinishedChester === true
      && afterPrayerAgain.state.actors.chester.alive === false
      && afterPrayerAgain.state.reactionWindow.state === 'armed'
      && afterPrayerAgain.state.bathroomAmbush.openingShots === 2
      && afterPrayerAgain.state.bathroomAmbush.openingImpacts.length === 2,
    JSON.stringify({
      flags: afterPrayerAgain.state.mission.flags,
      window: afterPrayerAgain.state.reactionWindow,
    }));
  // This is a new death after the checkpoint retry, not a continuation of
  // the first chair death measured above. The first fall began from Chester's
  // pre-checkpoint startle position; revive() deliberately rebuilt the replay
  // at its checkpoint pose, and Ape then killed him alone. Use this second
  // settled fall as the stability baseline for the remainder of this branch.
  // Sim-clock wait: funded for the slow box, finishes early on a fast one.
  await page.waitForFunction(() => window.silvercase.cast.chester.downT >= 0.75,
    null, { timeout: 120000 });
  const chesterReplaySettled = await actorBounds('chester');

  // ---- The owner's bug, in the beat it actually happened in. -------------
  // Do not actually shoot the already-dead chair target:
  // depending on Ape's live staging pose, his body can legitimately occlude
  // Chester and turn that unrelated negative-ray assertion into a fatal shot
  // at Ape, poisoning the successful branch this block is meant to certify.
  const wrongTarget = await page.evaluate(() => {
    const sc = window.silvercase;
    // Point at the man in the CHAIR — dead, in the wrong direction entirely.
    // Target acquisition itself must not resolve to the bathroom assailant.
    const wrongAim = sc.aimAt('chester');
    const afterWrong = sc.state();
    return { wrongAim, afterWrong };
  });
  // Now acquire the man who is actually pointing a gun at you. Publish his
  // moved doorway pose through rendered matrices before reading the ray: the
  // old synthetic tick could leave Raycaster looking at his pre-reveal matrix.
  await page.evaluate(() => window.silvercase.aimAt('pruitt'));
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const rightAim = await page.evaluate(() => {
    const sc = window.silvercase;
    sc.scene.updateMatrixWorld(true);
    return sc.aimAt('pruitt');
  });
  const ambushTriggerBefore = await page.evaluate(
    () => window.silvercase.input.snapshot().mouseDownEvents,
  );
  await page.mouse.down({ button: 'left' });
  try {
    await page.waitForFunction(() => window.silvercase.cast.pruitt.alive === false, null, {
      timeout: 5000,
    });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      state: window.silvercase.state(),
      input: window.silvercase.input.snapshot(),
      trace: (() => {
        const hit = window.silvercase.shots.trace();
        return hit ? {
          actor: hit.actor?.name ?? null,
          object: hit.object?.name ?? null,
          type: hit.object?.type ?? null,
          geometry: hit.object?.geometry?.type ?? null,
          userData: hit.object?.userData ?? null,
          distance: hit.distance,
          point: hit.point?.toArray?.() ?? null,
        } : null;
      })(),
      activeElement: document.activeElement?.tagName ?? null,
      pointerLock: document.pointerLockElement?.tagName ?? null,
    }));
    throw new Error(`Bathroom ambush click did not kill Pruitt: ${JSON.stringify({ rightAim, diagnostic })}`, {
      cause: error,
    });
  } finally {
    await page.mouse.up({ button: 'left' });
  }
  const ambushAim = await page.evaluate(({ before, aim }) => ({
    wrongAim: null,
    afterWrong: null,
    rightAim: aim,
    state: window.silvercase.state(),
    input: window.silvercase.input.snapshot(),
    triggerBefore: before,
  }), { before: ambushTriggerBefore, aim: rightAim });
  ambushAim.wrongAim = wrongTarget.wrongAim;
  ambushAim.afterWrong = wrongTarget.afterWrong;
  // Ape can stand between the camera and the slumped chair target, so the
  // useful invariant is that this ray does not resolve to Pruitt.
  check('aiming at the chair during the ambush does NOT acquire the bathroom man',
    ambushAim.wrongAim.resolvesTo !== 'pruitt'
      && ambushAim.afterWrong.actors.pruitt.alive === true
      && ambushAim.afterWrong.reactionWindow.state === 'armed'
      && ambushAim.afterWrong.mission.lastShot.intended === 'Pruitt'
      && ambushAim.afterWrong.mission.lastShot.actor !== 'Pruitt'
      && ambushAim.afterWrong.mission.lastShot.onTarget === false,
    JSON.stringify({ aim: ambushAim.wrongAim, shot: ambushAim.afterWrong.mission.lastShot }));
  check('firing at the bathroom man neutralizes him, with blood on him',
    ambushAim.rightAim.resolvesTo === 'pruitt'
      && ambushAim.state.reactionWindow.state === 'neutralized'
      && ambushAim.state.actors.pruitt.alive === false
      && ambushAim.state.marks.onBodies.pruitt >= 2
      && ambushAim.input.mouseDownEvents > ambushAim.triggerBefore,
    JSON.stringify({ aim: ambushAim.rightAim, marks: ambushAim.state.marks.onBodies }));
  let afterAmbush = await tickUntil('beat:AFTERMATH');
  check('a fast, successful shot advances the mission to AFTERMATH', afterAmbush.met, JSON.stringify(afterAmbush));

  // ---- AFTERMATH: spare Winston via the real 1-4 choice path. ------------
  let aftermathIntro = await tickUntil('choice:aftermath');
  check('the aftermath choice opens once Ape’s opening line finishes',
    aftermathIntro.met, JSON.stringify(aftermathIntro));
  const aftermathCampaignSnapshot = await page.evaluate(
    (key) => localStorage.getItem(key), CAMPAIGN_STORAGE_KEY,
  );
  check('AFTERMATH publishes a persisted ordinary-URL resume before the decision',
    typeof aftermathCampaignSnapshot === 'string'
      && JSON.parse(aftermathCampaignSnapshot).missions?.[MISSION_IDS.SILVER_CASE]?.checkpoint === 'aftermath',
    aftermathCampaignSnapshot?.slice(0, 500) ?? 'missing');
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
      && JSON.stringify(chesterRest) === JSON.stringify(chesterReplaySettled)
      && bodiesNow.chester.alive === false && chesterRest.max[1] > 0.6 && chesterRest.min[1] > -0.25
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
  // A wall-clock sleep is not a rendered-frame guarantee in headless Chromium:
  // under load, 150 ms can elapse before requestAnimationFrame paints even
  // once. The interaction ray reads camera.matrixWorld from the last render,
  // so wait for the frame loop itself (twice, to clear callback ordering)
  // instead of hoping a timer happened to contain one.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const promptOnCase = await page.evaluate(() => {
    window.silvercase.tick(0.1);
    return document.getElementById('promptText').textContent;
  });
  if (!await page.evaluate(() => window.silvercase.input.snapshot().captured)) {
    await page.locator('canvas').click({ position: { x: 480, y: 270 } });
    await page.waitForFunction(() => window.silvercase.input.snapshot().captured, null, {
      timeout: 5000,
    });
  }
  const caseInteractionBefore = await page.evaluate(
    () => window.silvercase.input.snapshot().interactionPresses,
  );
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.silvercase.fsm.name === 'EXIT', null, { timeout: 5000 });
  const carried = await page.evaluate(() => window.silvercase.state());
  const caseInteractionRecorded = await page.evaluate(
    (before) => window.silvercase.input.snapshot().interactionPresses > before,
    caseInteractionBefore,
  );
  const barCarrying = await hotbar();
  check('taking the case moves it into Tony’s hands, shut, and onto the inventory bar',
    promptOnCase === 'Take the case'
      && carried.beat === 'EXIT'
      && carried.case.carried === true && carried.case.inWorld === false
      && carried.case.shut === true && carried.case.openness === 0
      && carried.weapon.drawn === false
      && caseInteractionRecorded
      && barCarrying.labels[1] === 'Lou’s case · closed',
    JSON.stringify({ promptOnCase, case: carried.case, bar: barCarrying.labels.slice(0, 2) }));

  // ---- PICK_UP_CASE -> EXIT -> SCENE_COMPLETE ----------------------------
  const exitStart = await page.evaluate(() => ({
    beat: window.silvercase.fsm.name,
    x: window.silvercase.player.position.x,
    z: window.silvercase.player.position.z,
    movementPresses: window.silvercase.input.snapshot().movementPresses,
  }));
  // Face north from the case: W clears the living-room furniture to the open
  // doorway's z, then A walks west through it and down the corridor. Both keys
  // enter through the real browser Adapter. Advance the held-key intervals in
  // small normal game-update slices: software-rendered requestAnimationFrame
  // is deliberately not a movement clock (this scene can render well below
  // real time under SwiftShader), while Player collision and FSM progression
  // are. Stop at the authored 1.1 m opening instead of sleeping for a guessed
  // duration and overshooting into the wall. No pose write or beat jump
  // participates.
  await page.keyboard.down('w');
  try {
    await page.evaluate(() => {
      const sc = window.silvercase;
      for (let i = 0; i < 240 && sc.player.position.z >= 0.4; i += 1) sc.tick(0.025);
    });
  } finally {
    await page.keyboard.up('w');
  }
  // Releasing W does not zero velocity: Player correctly coasts to a stop.
  // Let that normal friction settle before strafing, otherwise a fast run can
  // drift north of the narrow door opening and make the westward leg collide
  // with the wall beside it.
  await page.evaluate(() => {
    const sc = window.silvercase;
    for (let i = 0; i < 80 && Math.abs(sc.player.velocity.z) >= 0.03; i += 1) sc.tick(0.025);
  });
  const exitTurn = await page.evaluate(() => ({
    x: window.silvercase.player.position.x,
    z: window.silvercase.player.position.z,
  }));
  await page.keyboard.down('a');
  try {
    await page.evaluate(() => {
      const sc = window.silvercase;
      for (let i = 0; i < 480 && sc.fsm.name !== 'SCENE_COMPLETE'; i += 1) sc.tick(0.025);
    });
  } finally {
    await page.keyboard.up('a');
  }
  // SCENE_COMPLETE intentionally holds one authored second before revealing
  // its overlay. Advance that ordinary tween through the game loop instead of
  // assuming software-rendered requestAnimationFrame can supply a game second
  // inside a five-second wall-clock timeout.
  await page.evaluate(() => window.silvercase.tick(1.1));
  await page.waitForFunction(
    () => !document.getElementById('sceneCompleteOverlay').classList.contains('hidden'),
    null,
    { timeout: 5000 },
  );
  const complete = await page.evaluate(() => ({
    state: window.silvercase.state(),
    position: {
      x: window.silvercase.player.position.x,
      z: window.silvercase.player.position.z,
    },
    input: window.silvercase.input.snapshot(),
  }));
  const sceneCompleteOverlay = await domOverlay('sceneCompleteOverlay');
  const hudVisible = await page.evaluate(
    () => document.getElementById('hud').classList.contains('visible'),
  );
  check('real W/A movement carries the case through the doorway and completes the scene',
    complete.state.beat === 'SCENE_COMPLETE'
      && exitStart.beat === 'EXIT'
      && exitTurn.z < exitStart.z - 1
      && Math.abs(exitTurn.z) < 0.55
      && complete.position.x < 1.4
      && complete.input.movementPresses >= exitStart.movementPresses + 2
      && sceneCompleteOverlay.present && sceneCompleteOverlay.hidden === false
      && hudVisible === false,
    JSON.stringify({ exitStart, exitTurn, complete, sceneCompleteOverlay, hudVisible }));

  /* SCENE_COMPLETE stops mission updates but the page deliberately keeps
   * rendering PostFX. Release that finished SwiftShader context before the
   * isolated ordinary-URL branches below; otherwise a healthy second page can
   * miss Playwright's navigation deadline while competing with a page whose
   * evidence has already been fully collected. */
  await page.close();

  // One complete ordinary-URL run now proves the mission as a player flow.
  // The large forensic audit above intentionally retains targeted debug
  // probes for wrong-hit, rollback and corpse invariants; this second run is
  // the clean contract: no beat jumps, pose writes or scripted targeting.
  await runCleanStartGoldenPath();

  // ---- Ordinary-URL Winston decision certification ----------------------
  // Re-open the campaign snapshot written by the real AFTERMATH entry. Each
  // branch has a private browser context, clicks the visible Begin button and
  // resumes through campaign.js. No preview/checkpoint query and no debug
  // beat/tick call participates in these tests.
  {
    const noInputRun = await openOrdinaryResume(aftermathCampaignSnapshot, 'Winston no-input');
    try {
      const p = noInputRun.page;
      await p.waitForFunction(
        () => window.silvercase.fsm.name === 'AFTERMATH'
          && window.silvercase.dialogue.choice?.id === 'aftermath',
        null,
        { timeout: 20000 },
      );
      const timerStart = await p.evaluate(() => ({
        now: performance.now(),
        remaining: window.silvercase.dialogue.choiceTimer,
        input: window.silvercase.input.snapshot(),
        tension: window.silvercase.state().winstonTension,
      }));
      await p.waitForTimeout(25000);
      const beforeDefault = await p.evaluate((started) => ({
        elapsed: (performance.now() - started) / 1000,
        beat: window.silvercase.fsm.name,
        choice: window.silvercase.dialogue.choice?.id ?? null,
        remaining: window.silvercase.dialogue.choiceTimer,
        winstonAlive: window.silvercase.cast.winston.alive,
        input: window.silvercase.input.snapshot(),
        tension: window.silvercase.state().winstonTension,
      }), timerStart.now);
      check('Winston is not spared early: the no-input choice is still live at 25 real seconds',
        beforeDefault.elapsed >= 24.8
          && beforeDefault.beat === 'AFTERMATH'
          && beforeDefault.choice === 'aftermath'
          && beforeDefault.remaining > 0
          && beforeDefault.winstonAlive === true,
        JSON.stringify({ timerStart, beforeDefault }));
      check('Winston and the recorded room tension continue through the full no-input decision window',
        timerStart.tension?.active === true
          && beforeDefault.tension?.active === true
          && beforeDefault.tension.elapsed >= 24.5
          && beforeDefault.tension.updates >= timerStart.tension.updates + 5
          && beforeDefault.tension.motion > timerStart.tension.motion + 0.1
          && beforeDefault.tension.pulses >= 4
          && beforeDefault.tension.ambientReceipts === beforeDefault.tension.pulses,
        JSON.stringify({ start: timerStart.tension, after25s: beforeDefault.tension }));
      await p.waitForFunction(
        () => window.silvercase.dialogue.choice === null,
        null,
        { timeout: 7000 },
      );
      const defaulted = await p.evaluate((started) => ({
        elapsed: (performance.now() - started) / 1000,
        beat: window.silvercase.fsm.name,
        winstonAlive: window.silvercase.cast.winston.alive,
        latestCue: [...window.silvercase.dialogue.cueLog].reverse().find(Boolean) ?? null,
        input: window.silvercase.input.snapshot(),
      }), timerStart.now);
      check('25–30 seconds of real inactivity takes the authored spare default and leaves Winston alive',
        defaulted.elapsed >= 25
          && defaulted.elapsed <= 30
          && defaulted.beat === 'AFTERMATH'
          && defaulted.winstonAlive === true
          && defaulted.latestCue === 'vo.silvercase.aftermath.ape.cleanup'
          && defaulted.input.movementPresses === timerStart.input.movementPresses
          && defaulted.input.interactionPresses === timerStart.input.interactionPresses
          && defaulted.input.mouseDownEvents === timerStart.input.mouseDownEvents,
        JSON.stringify({ timerStart, defaulted }));
    } finally {
      await noInputRun.close();
    }
  }

  {
    const spareRun = await openOrdinaryResume(aftermathCampaignSnapshot, 'Winston spare');
    try {
      const p = spareRun.page;
      await p.waitForFunction(
        () => window.silvercase.dialogue.choice?.id === 'aftermath',
        null,
        { timeout: 20000 },
      );
      await p.keyboard.press('Digit1');
      await p.waitForFunction(
        () => window.silvercase.dialogue.choice === null,
        null,
        { timeout: 3000 },
      );
      const spared = await p.evaluate(() => ({
        beat: window.silvercase.fsm.name,
        winstonAlive: window.silvercase.cast.winston.alive,
        latestCue: [...window.silvercase.dialogue.cueLog].reverse().find(Boolean) ?? null,
      }));
      check('Digit1 on a clean ordinary resume takes the real Winston spare branch',
        spared.beat === 'AFTERMATH'
          && spared.winstonAlive === true
          && spared.latestCue === 'vo.silvercase.aftermath.ape.cleanup',
        JSON.stringify(spared));
    } finally {
      await spareRun.close();
    }
  }

  {
    const killRun = await openOrdinaryResume(aftermathCampaignSnapshot, 'Winston kill');
    try {
      const p = killRun.page;
      await p.waitForFunction(
        () => window.silvercase.dialogue.choice?.id === 'aftermath',
        null,
        { timeout: 20000 },
      );
      await p.keyboard.press('Digit2');
      await p.waitForFunction(
        () => window.silvercase.fsm.name === 'EXECUTE_WINSTON',
        null,
        { timeout: 3000 },
      );
      const ordered = await p.evaluate(() => window.silvercase.state());
      check('Digit2 enters the Winston execution beat without killing him on the choice key',
        ordered.actors.winston.alive === true
          && ordered.aim.ordered === 'Winston'
          && ordered.weapon.drawn === true,
        JSON.stringify({ beat: ordered.beat, aim: ordered.aim, winston: ordered.actors.winston }));
      await p.waitForFunction(
        () => document.getElementById('instruction').classList.contains('show')
          && /winston/i.test(document.getElementById('instruction').textContent),
        null,
        { timeout: 15000 },
      );
      const killLookBefore = await p.evaluate(
        () => window.silvercase.input.snapshot().lookEvents,
      );
      await p.mouse.move(480, 270);
      await p.mouse.move(500, 260, { steps: 2 });
      const killAim = await p.evaluate(() => ({
        aim: window.silvercase.aimAt('winston'),
        input: window.silvercase.input.snapshot(),
      }));
      await p.mouse.down({ button: 'left' });
      await p.mouse.up({ button: 'left' });
      await p.waitForFunction(
        (before) => {
          const sc = window.silvercase;
          return sc.input.snapshot().mouseDownEvents > before
            && (sc.cast.winston.alive === false || sc.state().mission.lastShot !== null);
        },
        killAim.input.mouseDownEvents,
        /* The main verification page keeps a second SwiftShader scene alive.
         * Under CPU contention a real input can take several wall-clock
         * seconds to reach the next rendered update even though the branch is
         * not stalled. Wait for the input receipt plus its shot result rather
         * than treating a five-second renderer hiccup as a mission failure. */
        { timeout: 15000 },
      );
      const killed = await p.evaluate(() => ({
        state: window.silvercase.state(),
        input: window.silvercase.input.snapshot(),
      }));
      check('a real mouse trigger on the ordered man takes the kill branch with blood and impact',
        killAim.aim?.resolvesTo === 'winston'
          && killed.state.mission.lastShot?.onTarget === true
          && killed.state.actors.winston.alive === false
          && killed.state.marks.onBodies.winston >= 2
          && killAim.input.lookEvents > killLookBefore
          && killed.input.mouseDownEvents > killAim.input.mouseDownEvents,
        JSON.stringify({ killAim, killed }));

      // A branch is not certified merely because its target fell. Drain the
      // authored reaction, pick up the actual case with E, and carry it out
      // with real movement keys so both Winston outcomes prove the same
      // completion contract rather than only the spare path doing so.
      await p.waitForFunction(
        () => window.silvercase.fsm.name === 'PICK_UP_CASE',
        null,
        { timeout: 20000 },
      );
      await p.evaluate(() => {
        const sc = window.silvercase;
        sc.player.position.set(9.6, 1.66, 2.5);
        sc.player.yaw = 0;
        sc.player.pitch = -Math.atan2(1.46, 0.85);
        sc.player.velocity.set(0, 0, 0);
        sc.player.update(0);
      });
      await p.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));
      const killCaseInteractionBefore = await p.evaluate(
        () => window.silvercase.input.snapshot().interactionPresses,
      );
      await p.keyboard.press('KeyE');
      await p.waitForFunction(
        () => window.silvercase.fsm.name === 'EXIT',
        null,
        { timeout: 5000 },
      );
      const killExitStart = await p.evaluate(() => ({
        x: window.silvercase.player.position.x,
        z: window.silvercase.player.position.z,
        interactionPresses: window.silvercase.input.snapshot().interactionPresses,
        movementPresses: window.silvercase.input.snapshot().movementPresses,
      }));
      await p.keyboard.down('w');
      try {
        await p.evaluate(() => {
          const sc = window.silvercase;
          for (let i = 0; i < 240 && sc.player.position.z >= 0.4; i += 1) sc.tick(0.025);
        });
      } finally {
        await p.keyboard.up('w');
      }
      await p.evaluate(() => {
        const sc = window.silvercase;
        for (let i = 0; i < 80 && Math.abs(sc.player.velocity.z) >= 0.03; i += 1) sc.tick(0.025);
      });
      await p.keyboard.down('a');
      try {
        await p.evaluate(() => {
          const sc = window.silvercase;
          for (let i = 0; i < 480 && sc.fsm.name !== 'SCENE_COMPLETE'; i += 1) sc.tick(0.025);
        });
      } finally {
        await p.keyboard.up('a');
      }
      await p.evaluate(() => window.silvercase.tick(1.1));
      await p.waitForFunction(
        () => !document.getElementById('sceneCompleteOverlay').classList.contains('hidden'),
        null,
        { timeout: 5000 },
      );
      const killComplete = await p.evaluate(() => ({
        state: window.silvercase.state(),
        campaign: window.silvercase.campaign.state(),
        input: window.silvercase.input.snapshot(),
        overlay: !document.getElementById('sceneCompleteOverlay').classList.contains('hidden'),
      }));
      check('the Winston kill outcome still takes the case, exits, and completes the mission',
        killComplete.state.beat === 'SCENE_COMPLETE'
          && killComplete.state.case.carried === true
          && killComplete.state.actors.winston.alive === false
          && killComplete.campaign?.missions?.[MISSION_IDS.SILVER_CASE]?.status === 'complete'
          && killComplete.campaign?.missions?.[MISSION_IDS.SILVER_CASE]?.winstonOutcome === 'player_killed'
          && killExitStart.interactionPresses > killCaseInteractionBefore
          && killComplete.input.movementPresses >= killExitStart.movementPresses + 2
          && killComplete.overlay === true,
        JSON.stringify({ killExitStart, killComplete }));
    } finally {
      await killRun.close();
    }
  }

  // ---- Preview checkpoint links (?checkpoint=...) ------------------------
  // Standalone scene, no `?preview=1` gate needed (see the doc comment above
  // `jumpToPreviewCheckpoint` in src/silvercase/main.js). Each of the six
  // owner-facing waypoints gets its own fresh page so `previewCheckpoint` is
  // parsed from that page's own URL at load time, exactly the way an owner
  // clicking a preview.html link would load it.
  for (const [id, expectBeat] of [
    ['car', 'CAR_RIDE'],
    ['hallway', 'ARRIVE_HALLWAY'],
    ['room', 'ESTABLISH_CONTROL'],
    ['prayer', 'SQUATCH_PRAYER'],
    ['bathroom', 'BATHROOM_AMBUSH'],
    ['aftermath', 'AFTERMATH'],
  ]) {
    const cpPage = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const cpProblems = [];
    cpPage.on('pageerror', (error) => cpProblems.push(error.message));
    cpPage.on('console', (message) => {
      if (message.type() === 'error') cpProblems.push(message.text().slice(0, 240));
    });
    await cpPage.goto(`http://localhost:${PORT}/silvercase.html?preview=1&checkpoint=${id}`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await cpPage.waitForFunction(() => window.silvercase?.fsm, null, { timeout: 60000 });
    const chip = await cpPage.evaluate(() => document.querySelector('#menu .subtitle')?.textContent ?? '');
    const result = await cpPage.evaluate(async () => {
      // begin() awaits audio.loadManifest(...) before it transitions the FSM
      // at all (see the CAR_RIDE/V1 check above) — await it here too, or
      // every one of these six preview checkpoints would still be reading
      // MENU rather than its own waypoint.
      await window.silvercase.begin();
      window.silvercase.tick(0.2);
      return window.silvercase.state();
    });
    check(`?checkpoint=${id} loads staged and lands on ${expectBeat}`,
      result.beat === expectBeat
        && chip.startsWith('Preview checkpoint:')
        && cpProblems.length === 0,
      JSON.stringify({ beat: result.beat, chip, problems: cpProblems }));
    await cpPage.close();
  }

  check('no runtime console errors or page errors occurred', problems.length === 0,
    problems.join(' | ').slice(0, 800));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Silver Case checks failed.`);
  for (const result of failed) console.error(`  - ${result.name}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Silver Case checks passed.`);
