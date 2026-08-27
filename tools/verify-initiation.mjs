#!/usr/bin/env node
/**
 * Verify INITIATION NIGHT — the cabin ceremony, all six acts.
 *
 * WHAT THIS FILE USED TO BE, AND WHY THAT MATTERED.
 *
 * It was written for the OLD Initiation -- the gauntlet -- and was never
 * updated when the scene was rewritten as the cabin ceremony. It asserted a
 * cast of 13 with 4 prospects (the ceremony has 15 and 5), expected voice cues
 * under `vo.initiation.ceremony.` (they are `vo.initiation.cabin.` now), and
 * called `skipToGauntlet()` to wait for a phase named `gauntlet_in` that no
 * longer exists in the source. It then read `.requested` off a probe that
 * stopped returning it, threw a TypeError, and DIED -- so acts two through six
 * were never reached, and every check after line 113 had silently not run for
 * as long as the ceremony has existed.
 *
 * That is how the scene's whole fifth act shipped broken. The ritual camera
 * framed a fixed patch of tabletop 2.4 m in front of where the player actually
 * stands, so the hand, the cut, the card and the burning all happened behind
 * the camera; the saint card never burned at all; and the cut sprayed floor
 * decals a metre wide across the cabin for a beat whose stage direction reads
 * "this is not a gore beat". None of it was hard to see. Nothing was looking.
 *
 * So this walks the real phase graph: approach, the line, the clearing, the
 * trail, the cabin, the ritual, the room. It is deliberately blunt about act
 * five, because act five is the one that was never checked.
 *
 * The 2026-08-23 systems pass folded in the first-person rework: the formal
 * articulated cast, voice readiness (loaded/decoded/played, never a synth
 * stand-in), execution free-look, and the mass-kneel staging checks below.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CABIN,
  CABIN_DOOR,
  CEREMONY_CENTRE,
  PLAYER_SLOT as AUTHORED_PLAYER_SLOT,
  TRACK,
  TRAIL,
} from '../src/initiation/cabin/site.js';
import { voiceOverlapFindings } from './voice-overlap-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5206;
const KITTEN_BEG_CUE_FILE = 'vo.initiation.cabin.in-150-kittenboss.1baf5ya.1.mp3';
const KITTEN_BEG_CUE_PATH = path.join(ROOT, 'assets', 'sfx', KITTEN_BEG_CUE_FILE);
const KITTEN_TEST_SUBSTITUTE_PATH = path.join(
  ROOT,
  'assets',
  'sfx',
  'vo.initiation.cabin.in-030-kittenboss.1ba2x2c.1.mp3',
);
const REQUIRED_TRAIL_BEATS = Object.freeze(['IN-210', 'IN-220', 'IN-230', 'IN-240']);
/* A cold approach usually finishes well inside two minutes. The same walk
 * after a complete SwiftShader playthrough and a page reload does not: shader
 * compilation and WebGL teardown can leave the next page rendering slowly
 * while the production Player is still making steady progress. Every woods
 * traversal gets the same budget as the clean-start golden path so elapsed
 * wall time is never misreported as a collision softlock. */
const APPROACH_WALK_TIMEOUT_MS = 240_000;
const productionKittenBegCueExists = fs.existsSync(KITTEN_BEG_CUE_PATH);
const verifierSfxIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json')));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Initiation scene.');
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
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

/* Keep the production failure singular without allowing it to hide the rest of
 * the ceremony. The active voice bank correctly fail-closes when the delivered
 * IN-150 take is absent. In verifier-only traffic, route that one request to an
 * existing recording by the same female performer so decoding and the later
 * state graph can still be exercised. The explicit file-system assertion below
 * remains red until the real take is delivered; nothing is copied into assets,
 * and production runtime behavior is unchanged. */
if (!productionKittenBegCueExists) {
  await page.route('**/assets/sfx/index.json*', async (route) => {
    const files = new Set(verifierSfxIndex.files ?? []);
    files.add(KITTEN_BEG_CUE_FILE);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...verifierSfxIndex, files: [...files] }),
    });
  });
  await page.route(`**/assets/sfx/${KITTEN_BEG_CUE_FILE}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      path: KITTEN_TEST_SUBSTITUTE_PATH,
    });
  });
}

const problems = [];
const pointerLockWarnings = [];
const missing = [];
page.on('pageerror', (error) => {
  /* WITH THE STACK. A bare message names the Web Audio call that threw and
   * not the code that fed it, and there are twenty-five ramp sites in this
   * game. Two runs were spent narrowing it by hand. */
  const where = (error.stack ?? '').split('\n').slice(1, 4).join(' | ');
  problems.push(where ? `${error.message} @ ${where}` : error.message);
});
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text().slice(0, 240);
  /* Headless Chromium can reject the first otherwise-trusted Playwright click
   * while another software-rendered page has focus. It is only harmless if a
   * subsequent real click actually captures the scene; that behavioral proof
   * is asserted before walking and again in ritual free-look. */
  if (/user gesture is required to request pointer lock/i.test(text)) {
    pointerLockWarnings.push(text);
    return;
  }
  problems.push(text);
});
page.on('response', (response) => {
  if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
});

/**
 * Get the scene to `phase`, pressing the action button the way a player does.
 *
 * One press is not enough and assuming it was cost two verifier runs. The
 * scene has ONE button: `actionPress()` advances the subtitle when a line is
 * up and only arms the ritual input once the line has cleared. So a beat that
 * speaks and then asks for a press needs at least two, and a slow software
 * renderer stretches every authored second into three or four real ones.
 *
 * Pressing on a slow tick until the phase moves is both what a player does and
 * the only thing that is not a race.
 */
async function driveTo(page, phase, { timeout = 90000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate((want) => window.INITIATION.phase === want, phase)) return true;
    if (Date.now() > deadline) {
      const seen = await page.evaluate(() => window.INITIATION.phase);
      /* WITH WHAT THE PAGE SAID. A stall is almost always an exception in the
       * frame loop, and a bare "never reached X" sends you reading phase
       * tables for an hour. Two runs went that way. */
      const said = problems.length ? ` — page said: ${problems.slice(0, 2).join(' ;; ')}` : '';
      const at = await page.evaluate(() => ({
        t: window.INITIATION.phaseT, paused: window.INITIATION.paused,
      })).catch(() => null);
      throw new Error(`Initiation never reached '${phase}' — stuck in '${seen}' `
        + `(phaseT ${at?.t?.toFixed?.(1) ?? '?'}s, paused ${at?.paused})${said}`);
    }
    await page.evaluate(() => window.INITIATION.smashAction());
    await page.waitForTimeout(400);
  }
}

/**
 * Reach a phase through the production keyboard action path.
 *
 * `driveTo()` predates the real-input pass and invokes the public diagnostic
 * handle directly. Keep it for the failure/checkpoint coverage above, whose
 * purpose is state recovery. The successful run uses this helper instead: a
 * genuine Space keydown reaches the same listener a player uses, and an
 * unexpected numbered choice is a hard stop rather than something Space can
 * accidentally bypass.
 */
async function pressActionTo(page, phase, { timeout = 120000, seen = null } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const at = await page.evaluate(() => ({
      phase: window.INITIATION.phase,
      phaseT: window.INITIATION.phaseT,
      paused: window.INITIATION.paused,
      quizOpen: window.INITIATION.quizOpen,
    }));
    seen?.add(at.phase);
    if (at.phase === phase) return at;
    if (at.quizOpen) {
      throw new Error(`Initiation exposed a numbered choice in '${at.phase}' while driving to '${phase}'`);
    }
    if (Date.now() > deadline) {
      const said = problems.length ? ` — page said: ${problems.slice(0, 2).join(' ;; ')}` : '';
      throw new Error(`Initiation never reached '${phase}' through real Space input — stuck in `
        + `'${at.phase}' (phaseT ${at.phaseT?.toFixed?.(1) ?? '?'}s, paused ${at.paused})${said}`);
    }
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
  }
}

/**
 * Clear spoken lines with the production Space-key route until the requested
 * numbered choice is visibly available.
 *
 * This is deliberately separate from `driveTo()`: a clean-start run is not
 * allowed to invoke the debug handle that calls `actionPress()` directly.
 */
async function pressActionUntilChoice(page, phase, { timeout = 120000, seen = null } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const at = await page.evaluate(() => ({
      phase: window.INITIATION.phase,
      phaseT: window.INITIATION.phaseT,
      quizOpen: window.INITIATION.quizOpen,
    }));
    seen?.add(at.phase);
    if (at.phase === phase && at.quizOpen) return at;
    if (Date.now() > deadline) {
      throw new Error(`Initiation never exposed the real numbered choice in '${phase}' — `
        + `stuck in '${at.phase}' (phaseT ${at.phaseT?.toFixed?.(1) ?? '?'}s)`);
    }
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
  }
}

/**
 * Read the actual on-screen option text, then use the matching number key.
 * The DOM is observation only: no click handler, answer function or scene
 * state is called from JavaScript.
 */
async function chooseDisplayedOption(page, predicate, label) {
  const options = await page.locator('#quiz .quiz-opt').evaluateAll((buttons) => buttons
    .filter((button) => !button.hidden && getComputedStyle(button).display !== 'none')
    .map((button) => ({
      index: Number(button.dataset.i),
      text: button.textContent.replace(/\s+/g, ' ').trim(),
    })));
  const selected = options.find(predicate);
  if (!selected) {
    throw new Error(`Initiation ${label} did not display its authored successful option: `
      + JSON.stringify(options));
  }
  await page.keyboard.press(`Digit${selected.index + 1}`);
  return { options, selected };
}

async function capturePointerLock(page, { attempts = 3 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await page.evaluate(() => document.pointerLockElement === document.querySelector('canvas'))) {
      return { captured: true, attempts: attempt - 1 };
    }
    await page.locator('canvas').first().click({ position: { x: 320, y: 180 } });
    await page.waitForTimeout(250);
  }
  return {
    captured: await page.evaluate(() => document.pointerLockElement === document.querySelector('canvas')),
    attempts,
  };
}

/**
 * Walk the player, on the real keys, until the phase moves.
 *
 * `approach` and `line_up` advance on DISTANCE -- within 17 m of the line,
 * then within 1.05 m of the slot -- so pressing the action key at them does
 * nothing at all, which is why the first attempt at driving the middle acts
 * sat in `approach` for four two-minute timeouts and reported the scene
 * broken. It was the driver that had no legs.
 *
 * Which key is forward is MEASURED rather than assumed: it holds one, watches
 * whether the gap to the target actually closes, and swaps if it does not.
 * The spawn heading is authored and could be re-authored, and a walker that
 * silently strolls the wrong way would look exactly like a scene that cannot
 * advance.
 */
async function walkTo(page, phase, { timeout = APPROACH_WALK_TIMEOUT_MS } = {}) {
  /* Where he is, which way he is pointed, and how far off the mark.
   *
   * `window.INITIATION.player` is the SHARED `Player` (see
   * src/initiation/player-adapter.js), which carries `position` and `yaw`
   * directly. This used to read `player.group.position`, which is a figure's
   * shape and not a controller's -- so every call threw
   * "Cannot read properties of undefined", the walk never took a step, and the
   * four phases downstream of it timed out one after another. Five red checks
   * from one stale property name, and none of them said so. The fallbacks keep
   * it working either way. */
  const state = (target) => page.evaluate((destination) => {
    const player = window.INITIATION.player;
    const p = player.position ?? player.group.position;
    return {
      x: p.x,
      z: p.z,
      dx: destination.x - p.x,
      dz: destination.z - p.z,
      yaw: player.yaw ?? player.group.rotation.y,
      enabled: player.enabled === true,
      phase: window.INITIATION.phase,
      control: window.INITIATION.control,
      mode: player.mode,
      keys: [...player.keys],
      velocity: player.velocity?.toArray?.() ?? null,
      input: window.INITIATION.input?.snapshot?.() ?? null,
    };
  }, target);

  const held = new Set();
  const hold = async (keys) => {
    for (const key of [...held]) if (!keys.has(key)) { await page.keyboard.up(key); held.delete(key); }
    for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
  };

  const startedAt = Date.now();
  const deadline = startedAt + timeout;
  let best = Infinity;
  let lastProgressAt = Date.now();
  let avoidanceDirection = 1;
  let steeringTicks = 0;
  /* Follow the authored dirt track instead of drawing a verifier-only chord
   * through its trees and rocks. The prior driver aimed directly from spawn
   * to the prospect slot; it left TRACK near its final bend and correctly hit
   * wilderness collision 13 m from the line. */
  const waypoints = [...TRACK.slice(1), AUTHORED_PLAYER_SLOT];
  let waypointIndex = 0;
  try {
    for (;;) {
      const target = waypoints[waypointIndex];
      const at = await state(target);
      if (at.phase === phase) {
        return {
          phase: at.phase,
          durationMs: Date.now() - startedAt,
          steeringTicks,
          waypointIndex,
          waypointCount: waypoints.length,
          x: at.x,
          z: at.z,
        };
      }
      const gap = Math.hypot(at.dx, at.dz);
      /* Do not cut the corner when `approach` becomes `line_up`. That phase
       * changes as soon as Tony enters the 17 m clearing radius, while the
       * authored track still has one bend left at z=-14. Jumping straight to
       * the line from that trigger draws a chord through the forest-edge
       * colliders and made identical clean starts pass or wedge depending on
       * the exact frame that crossed the radius. The player keeps walking the
       * visible track, then takes the short final leg to his marked slot. */
      if (waypointIndex < waypoints.length - 1 && gap < 1.25) {
        await hold(new Set());
        waypointIndex += 1;
        best = Infinity;
        lastProgressAt = Date.now();
        continue;
      }
      if (Date.now() > deadline) {
        /* SAY WHICH OF THE TWO IT WAS.
         *
         * A walker that never moves has two completely different causes and
         * one symptom. Either the scene will not take input -- `Player.enabled`
         * is gated on `inputActive`, which the adapter drives off pointer lock,
         * and a headless Chromium that refuses the lock leaves the keys inert
         * -- or input is arriving and the walk is genuinely going nowhere.
         * Reporting the distance alone sent the first of those to be
         * investigated as the second. */
        throw new Error(at.enabled
          ? `Initiation never walked to '${phase}' — in '${at.phase}', ${gap.toFixed(1)} m from `
            + `track waypoint ${waypointIndex + 1}/${waypoints.length} at `
            + `(${at.x.toFixed(1)}, ${at.z.toFixed(1)}) with input live, so the keys are reaching `
            + `the scene and the walk itself is stuck; diagnostics=${JSON.stringify({
              elapsedMs: Date.now() - startedAt,
              lastProgressMsAgo: Date.now() - lastProgressAt,
              yaw: at.yaw,
              control: at.control,
              mode: at.mode,
              keys: at.keys,
              velocity: at.velocity,
              input: at.input,
            })}`
          : `Initiation never walked to '${phase}': the scene never enabled input `
            + `(Player.enabled false in '${at.phase}'). The adapter gates that on pointer `
            + 'lock, which this browser did not grant — the walk was never driveable.');
      }
      if (gap < best - 0.2 || !Number.isFinite(best)) {
        best = gap;
        lastProgressAt = Date.now();
      }

      /* The path is authored as a clear corridor, but the actual controller
       * is a circle moving through other circles. At low SwiftShader frame
       * rates, a diagonal can land exactly nose-on to a tree and keep a live
       * forward velocity while `pushOut` returns the same position forever.
       * A player naturally steps around it. Do exactly that with a real A/D
       * hold after five seconds without 20 cm of progress, then resume toward
       * the visible waypoint. Alternating sides keeps a second obstacle from
       * turning the verifier's recovery into another deterministic wedge. */
      if (at.enabled && Date.now() - lastProgressAt > 5000) {
        await hold(new Set([avoidanceDirection > 0 ? 'KeyA' : 'KeyD']));
        await page.waitForTimeout(5500);
        await hold(new Set());
        avoidanceDirection *= -1;
        best = Infinity;
        lastProgressAt = Date.now();
        continue;
      }

      /* Shared Player forward is (-sin(yaw), -cos(yaw)); its right vector is
       * (cos(yaw), -sin(yaw)). Project the target delta onto those exact
       * vectors. A previous "learn by flipping keys" loop could reverse a
       * correct sign after four collision-limited samples and walk away from
       * the slot on the second pass through this route. */
      const sin = Math.sin(at.yaw);
      const cos = Math.cos(at.yaw);
      const forward = -(at.dx * sin + at.dz * cos);
      const right = at.dx * cos - at.dz * sin;
      const keys = new Set();
      if (forward > 0.4) keys.add('KeyW');
      else if (forward < -0.4) keys.add('KeyS');
      if (right > 0.4) keys.add('KeyD');
      else if (right < -0.4) keys.add('KeyA');
      await hold(keys);
      steeringTicks += 1;
      await page.waitForTimeout(450);
    }
  } finally {
    await hold(new Set());
  }
}

/**
 * Walk a supplied authored route with real WASD until production changes phase.
 *
 * This deliberately does not set position, yaw, phase, or mission state. The
 * browser only reads the shared Player to decide which real movement keys to
 * hold. A trail conversation may release pointer lock for its numbered reply;
 * the verifier answers "keep walking" with Digit3 and recaptures the canvas
 * before taking another step.
 */
async function walkAuthoredRouteTo(page, phase, waypoints, { timeout = 240000 } = {}) {
  if (!waypoints.length) throw new Error(`Initiation route to '${phase}' has no authored waypoints`);

  const state = (target) => page.evaluate((destination) => {
    const player = window.INITIATION.player;
    const p = player.position ?? player.group.position;
    return {
      x: p.x,
      z: p.z,
      dx: destination.x - p.x,
      dz: destination.z - p.z,
      yaw: player.yaw ?? player.group.rotation.y,
      enabled: player.enabled === true,
      phase: window.INITIATION.phase,
      quizOpen: window.INITIATION.quizOpen,
      trail: window.INITIATION.trail,
    };
  }, target);

  const held = new Set();
  const hold = async (keys) => {
    for (const key of [...held]) if (!keys.has(key)) { await page.keyboard.up(key); held.delete(key); }
    for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
  };

  const deadline = Date.now() + timeout;
  let waypointIndex = 0;
  let keyTicks = 0;
  let trailChoiceAnswered = false;
  let best = Infinity;
  let lastProgressAt = Date.now();
  let avoidanceDirection = 1;
  try {
    for (;;) {
      const target = waypoints[waypointIndex];
      const at = await state(target);
      if (at.phase === phase) {
        return {
          ...at,
          keyTicks,
          reachedWaypoints: waypointIndex,
          trailChoiceAnswered,
        };
      }

      if (at.phase === 'trail_choice') {
        await hold(new Set());
        if (at.quizOpen) {
          await page.keyboard.press('Digit3');
          trailChoiceAnswered = true;
          await page.waitForTimeout(300);
        }
        const recapture = await capturePointerLock(page);
        if (!recapture.captured) {
          throw new Error('Initiation trail reply released pointer lock and real WASD could not be re-armed');
        }
        continue;
      }

      if (!at.enabled) {
        await hold(new Set());
        const recapture = await capturePointerLock(page);
        if (!recapture.captured && Date.now() > deadline) {
          throw new Error(`Initiation could not enable real WASD in '${at.phase}' while walking to '${phase}'`);
        }
        await page.waitForTimeout(250);
        continue;
      }

      const gap = Math.hypot(at.dx, at.dz);
      if (waypointIndex < waypoints.length - 1 && gap < 0.8) {
        await hold(new Set());
        waypointIndex += 1;
        best = Infinity;
        lastProgressAt = Date.now();
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`Initiation never walked to '${phase}' — in '${at.phase}', ${gap.toFixed(1)} m from `
          + `authored waypoint ${waypointIndex + 1}/${waypoints.length} at `
          + `(${at.x.toFixed(1)}, ${at.z.toFixed(1)}) after ${keyTicks} real WASD ticks`);
      }

      if (gap < best - 0.2 || !Number.isFinite(best)) {
        best = gap;
        lastProgressAt = Date.now();
      }
      if (at.enabled && Date.now() - lastProgressAt > 5000) {
        await hold(new Set([avoidanceDirection > 0 ? 'KeyA' : 'KeyD']));
        await page.waitForTimeout(5500);
        await hold(new Set());
        avoidanceDirection *= -1;
        best = Infinity;
        lastProgressAt = Date.now();
        continue;
      }

      const sin = Math.sin(at.yaw);
      const cos = Math.cos(at.yaw);
      const forward = -(at.dx * sin + at.dz * cos);
      const right = at.dx * cos - at.dz * sin;
      const keys = new Set();
      if (forward > 0.35) keys.add('KeyW');
      else if (forward < -0.35) keys.add('KeyS');
      if (right > 0.35) keys.add('KeyD');
      else if (right < -0.35) keys.add('KeyA');
      await hold(keys);
      keyTicks += 1;
      await page.waitForTimeout(350);
    }
  } finally {
    await hold(new Set());
  }
}

async function chooseCorrectDisplayedOath(page, expectedPhase) {
  await page.waitForFunction((wanted) => window.INITIATION.phase === wanted
    && document.querySelector('#quiz')?.classList.contains('show')
    && [...document.querySelectorAll('#quiz .quiz-opt')]
      .some((button) => !button.hidden && button.dataset.correct === '1'), expectedPhase,
  { timeout: 120000 });
  const options = await page.locator('#quiz .quiz-opt').evaluateAll((buttons) => buttons
    .filter((button) => !button.hidden)
    .map((button) => ({
      index: Number(button.dataset.i),
      correct: button.dataset.correct === '1',
      text: button.textContent.replace(/\s+/g, ' ').trim(),
    })));
  const correct = options.find((option) => option.correct);
  if (!correct) throw new Error(`Initiation ${expectedPhase} displayed no correct oath wording`);
  await page.keyboard.press(`Digit${correct.index + 1}`);
  return { options, selected: correct };
}

const CLEAN_START_FORBIDDEN_SHORTCUT_TOKENS = Object.freeze([
  'window.INITIATION.smashAction',
  'window.INITIATION.advanceSay',
  'window.INITIATION.chooseAnswer',
  '.skipTo',
  '.teleport(',
  '.position.set(',
  '.position.copy(',
]);

function cleanStartShortcutTokens(functions) {
  const source = functions.map((fn) => fn.toString()).join('\n');
  return CLEAN_START_FORBIDDEN_SHORTCUT_TOKENS.filter((token) => source.includes(token));
}

/**
 * Certify one successful mission from a fresh ordinary URL with only the
 * inputs available to a player.
 *
 * Reads of `window.INITIATION` are receipts only. This path never calls a
 * diagnostic action, phase skip, teleport, position setter or mission-state
 * mutator. The sole browser-side write is Playwright's normal keyboard,
 * pointer and button input. Keep this function distinct from the legacy
 * failure/retry coverage below: that older coverage still uses `driveTo()` to
 * exercise its checkpoint twice, and must not be mistaken for a golden path.
 */
async function runCleanStartGoldenPath(page) {
  console.log('\n  --- clean-start real-input golden path ---');
  const ordinaryUrl = `http://localhost:${PORT}/initiation.html`;
  const seen = new Set();

  await page.goto(ordinaryUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.INITIATION?.phase === 'approach', null, {
    timeout: 60000,
  });
  seen.add('approach');

  const capture = await capturePointerLock(page);
  if (!capture.captured) {
    throw new Error('Initiation clean start could not capture the real first-person canvas');
  }
  await page.waitForFunction(() => window.INITIATION.audioReady || window.INITIATION.audioLoadError,
    null, { timeout: 120000 });
  const audio = await page.evaluate(() => ({
    ready: window.INITIATION.audioReady,
    error: window.INITIATION.audioLoadError,
    missing: window.INITIATION.missingVoiceCues,
  }));
  if (!audio.ready || audio.error || audio.missing.length) {
    throw new Error(`Initiation clean start could not arm its voice bank: ${JSON.stringify(audio)}`);
  }

  /* Woods -> exact place in the prospect line, entirely through shared WASD. */
  await walkTo(page, 'line_chat', { timeout: APPROACH_WALK_TIMEOUT_MS });
  seen.add('line_up');
  seen.add('line_chat');
  console.log('  clean start: woods approach and prospect-line mark reached through WASD');

  /* Kitten Boss's first question releases pointer lock for a visible choice.
   * Pick the first displayed response with its ordinary number key. All three
   * are valid conversation branches and rejoin the speech. */
  await pressActionUntilChoice(page, 'line_chat', { timeout: 120000, seen });
  await page.keyboard.press('Digit1');

  /* Clear the speech and Prospect One's visible execution with Space, then
   * answer the founders prompt from the wording shown on screen. */
  await pressActionTo(page, 'q2_choice', { timeout: 360000, seen });
  const founders = await chooseDisplayedOption(
    page,
    (option) => option.text.includes('Rippinflow')
      && option.text.includes('The Shubenator')
      && option.text.includes('Deathmegatron'),
    'founders quiz',
  );
  await pressActionTo(page, 'walk_out', { timeout: 900000, seen });
  const execution = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    dead: window.INITIATION.deadProspects,
    pose: window.INITIATION.playerPose,
    control: window.INITIATION.control,
  }));
  const requiredExecutionPhases = [
    'speech', 'q1', 'q1_again', 'exec_one', 'q2_intro', 'q2_choice',
    'q2_result', 'q2_correct', 'conspiracy_reveal', 'mass_kneel',
    'execution_sweep', 'player_aim', 'lou_interrupt', 'walk_out',
  ];
  const unseenExecutionPhases = requiredExecutionPhases.filter((phase) => !seen.has(phase));
  if (unseenExecutionPhases.length
    || execution.phase !== 'walk_out'
    || execution.dead.length !== 5
    || execution.dead.includes('PROSPECT TWO')) {
    throw new Error(`Initiation clean start did not traverse the complete question/execution run: `
      + JSON.stringify({ unseenExecutionPhases, execution, seen: [...seen] }));
  }
  console.log('  clean start: visible questions and complete execution run cleared through keys');

  /* Walk the authored trail, answer its live walking choice, cross the real
   * door threshold, then move to Lou's exact ceremony mark. */
  const trailStart = await page.evaluate(() => ({
    x: window.INITIATION.player.position.x,
    z: window.INITIATION.player.position.z,
  }));
  const trailCapture = await capturePointerLock(page);
  if (!trailCapture.captured) {
    throw new Error('Initiation clean start could not re-arm WASD after the execution run');
  }
  const cabinWalk = await walkAuthoredRouteTo(page, 'ceremony', [
    ...TRAIL,
    CABIN_DOOR.outside,
    CABIN_DOOR.inside,
  ], { timeout: 360000 });
  const trailDistance = Math.hypot(cabinWalk.x - trailStart.x, cabinWalk.z - trailStart.z);
  if (!cabinWalk.trailChoiceAnswered
    || !cabinWalk.trail?.storyComplete
    || trailDistance <= 25
    || cabinWalk.z <= CABIN.frontZ + 0.6) {
    throw new Error(`Initiation clean start did not complete its player-driven trail: `
      + JSON.stringify({ cabinWalk, trailStart, trailDistance }));
  }
  console.log('  clean start: authored trail, walking reply and cabin doorway crossed through WASD');

  await pressActionTo(page, 'ceremony_approach', { timeout: 240000, seen });
  const ceremonyWalk = await walkAuthoredRouteTo(page, 'ceremony', [CEREMONY_CENTRE], {
    timeout: 120000,
  });
  const ceremonyMiss = Math.hypot(
    ceremonyWalk.x - CEREMONY_CENTRE.x,
    ceremonyWalk.z - CEREMONY_CENTRE.z,
  );
  if (ceremonyWalk.keyTicks < 1 || ceremonyMiss >= 0.05) {
    throw new Error(`Initiation clean start missed the player-driven ceremony mark: `
      + JSON.stringify({ ceremonyWalk, ceremonyMiss }));
  }
  console.log('  clean start: authored ceremony mark reached through WASD');

  /* Continue through the room with Space and choose the visible commitment
   * answer with its real randomized number key. */
  await pressActionUntilChoice(page, 'oath_question', { timeout: 360000, seen });
  const commitment = await chooseDisplayedOption(
    page,
    (option) => option.text.endsWith('Yes. I do.'),
    'commitment question',
  );
  await pressActionTo(page, 'blade', { timeout: 180000, seen });

  /* Act five keeps mouse look, Space presses and the held burn on production
   * input. The exact oath wording is selected from the visible text rather
   * than the diagnostic `data-correct` flag. */
  const ritualCapture = await capturePointerLock(page);
  if (!ritualCapture.captured) {
    throw new Error('Initiation clean start could not capture ritual mouse-look');
  }
  await page.mouse.move(360, 180);
  await page.mouse.move(420, 180, { steps: 3 });
  await pressActionTo(page, 'hand', { timeout: 180000, seen });
  await pressActionTo(page, 'cut', { timeout: 120000, seen });
  await pressActionTo(page, 'card', { timeout: 120000, seen });
  await pressActionUntilChoice(page, 'oath_1', { timeout: 180000, seen });
  const firstOath = await chooseDisplayedOption(
    page,
    (option) => option.text.endsWith('I swear my loyalty to this family.'),
    'first oath',
  );
  await pressActionUntilChoice(page, 'oath_2', { timeout: 180000, seen });
  const secondOath = await chooseDisplayedOption(
    page,
    (option) => option.text
      .endsWith('My flesh must burn in hell like this saint if I do not keep my oath.'),
    'second oath',
  );
  await pressActionTo(page, 'burn', { timeout: 180000, seen });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.INITIATION.ritual.char > 0
    && window.INITIATION.ritual.committed, null, { timeout: 120000 });
  await page.keyboard.up('Space');
  await pressActionTo(page, 'complete', { timeout: 900000, seen });

  const completion = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    visible: document.querySelector('#credits')?.classList.contains('showing') === true
      && document.querySelector('#credits')?.getAttribute('aria-hidden') === 'false',
    rows: document.querySelectorAll('#credits-track .credits-row').length,
    headings: [...document.querySelectorAll('#credits-track .credits-section')]
      .map((heading) => heading.textContent?.trim()),
    buttonVisible: (() => {
      const rect = document.querySelector('#credits-skip')?.getBoundingClientRect();
      return Boolean(rect && rect.width > 0 && rect.height > 0);
    })(),
    pointerReleased: document.pointerLockElement === null,
    focusId: document.activeElement?.id ?? null,
    pathname: location.pathname,
  }));
  if (completion.phase !== 'complete'
    || !completion.visible
    || completion.rows < 250
    || completion.headings.join('|') !== "THE PROSPECT'S RECORD|THE FAMILY|BIG UNCLE LOU SPUTTHOLE"
    || !completion.buttonVisible
    || !completion.pointerReleased
    || completion.focusId !== 'credits') {
    throw new Error(`Initiation clean start did not reach its full campaign credit roll: `
      + JSON.stringify(completion));
  }

  /* The same Space that completed the ceremony used to activate the focused
   * native Skip button on release. Reproduce that exact player input before
   * deliberately clicking Skip. */
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  const afterResidualSpace = await page.evaluate(() => ({
    phase: window.INITIATION?.phase ?? null,
    visible: document.querySelector('#credits')?.classList.contains('showing') === true,
    focusId: document.activeElement?.id ?? null,
    pathname: location.pathname,
  }));
  if (afterResidualSpace.phase !== 'complete'
    || !afterResidualSpace.visible
    || afterResidualSpace.focusId !== 'credits'
    || !afterResidualSpace.pathname.endsWith('/initiation.html')) {
    throw new Error(`Residual ceremony Space skipped the credit roll: ${JSON.stringify(afterResidualSpace)}`);
  }

  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith('/index.html'), {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    }),
    page.locator('#credits-skip').click(),
  ]);
  const exit = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('squatchlife.campaign') || 'null');
    return {
      pathname: location.pathname,
      sceneId: saved?.scene?.id ?? null,
      spawn: saved?.scene?.spawn ?? null,
      status: saved?.missions?.initiation?.status ?? null,
    };
  });
  if (!exit.pathname.endsWith('/index.html')
    || exit.status !== 'complete') {
    throw new Error(`Initiation clean start did not save completion before returning to title: ${JSON.stringify(exit)}`);
  }
  console.log('  clean start: ritual, induction, full credits and title return completed');

  /* Mechanical guardrail: this function and every helper it delegates to
   * must remain free of the known test-only state-changing APIs. */
  const shortcutTokensFound = cleanStartShortcutTokens([
    runCleanStartGoldenPath,
    pressActionTo,
    pressActionUntilChoice,
    chooseDisplayedOption,
    capturePointerLock,
    walkTo,
    walkAuthoredRouteTo,
  ]);
  if (shortcutTokensFound.length) {
    throw new Error(`Initiation clean-start verifier contains forbidden shortcut calls: `
      + shortcutTokensFound.join(', '));
  }

  return {
    ordinaryUrl,
    pointerCapture: capture,
    founders: founders.selected.text,
    commitment: commitment.selected.text,
    oaths: [firstOath.selected.text, secondOath.selected.text],
    execution,
    trailDistance,
    ceremonyMiss,
    seen: [...seen],
    exit,
    shortcutTokensFound,
  };
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  const cleanStart = await runCleanStartGoldenPath(page);
  check('a distinct clean-start golden path completes through only real player input',
    cleanStart.shortcutTokensFound.length === 0
      && cleanStart.exit.status === 'complete'
      && cleanStart.execution.phase === 'walk_out'
      && cleanStart.trailDistance > 25
      && cleanStart.ceremonyMiss < 0.05,
    JSON.stringify({
      url: cleanStart.ordinaryUrl,
      founders: cleanStart.founders,
      commitment: cleanStart.commitment,
      oaths: cleanStart.oaths,
      trailDistance: cleanStart.trailDistance,
      ceremonyMiss: cleanStart.ceremonyMiss,
      exit: cleanStart.exit,
      shortcutTokensFound: cleanStart.shortcutTokensFound,
    }));

  /* The remainder is broader failure/retry, staging and visual evidence. It
   * starts from a new ordinary navigation so none of the clean-start mission
   * state above is mistaken for a setup shortcut. */
  await page.goto(`http://localhost:${PORT}/initiation.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.INITIATION?.phase, null, { timeout: 60000 });

  const initial = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    members: window.INITIATION.members.length,
    memberNames: window.INITIATION.members.map((member) => member.name).filter(Boolean),
    prospects: window.INITIATION.prospects.length,
    playerController: window.INITIATION.player?.constructor?.name,
    presentationFigure: window.INITIATION.playerFigure?.constructor?.name,
    control: window.INITIATION.control,
    pose: window.INITIATION.playerPose,
    formalMembers: window.INITIATION.members.every((member) => member.sq?.model?.dress === 'suit'),
    formalProspects: window.INITIATION.prospects.every((prospect) => prospect.sq?.model?.dress === 'suit'),
    actorColliders: window.INITIATION.actorColliders,
    objective: document.querySelector('#objective')?.textContent,
    /* WHAT THE PLAYER ACTUALLY READS, which is now the shared upper-left
     * panel every other scene uses rather than this scene's own div. The keys
     * live in the panel's hint line, so a check that wants to know the player
     * was told how to move has to look at both halves. */
    panel: document.querySelector('#objectives')?.textContent ?? null,
    canvasCount: document.querySelectorAll('canvas').length,
    inventoryVisible: Boolean(document.querySelector('#hotbar'))
      && getComputedStyle(document.querySelector('#hotbar')).display !== 'none',
    inventorySlots: document.querySelectorAll('#hotbar .slot').length,
  }));

  check('the namespaced Initiation scene reaches its interactive approach phase',
    initial.phase === 'approach' && initial.control === 'playable' && initial.canvasCount >= 1,
    JSON.stringify(initial));
  /* The ceremony's cast, not the gauntlet's: fifteen of the Circle in the
   * clearing and five prospects in the line, Kittenboss among them. */
  check('the ceremony cast and prospect line are preserved',
    initial.members === 15 && initial.prospects === 5,
    `${initial.members} members, ${initial.prospects} NPC prospects`);
  check('Tony uses the shared first-person Player with a separate articulated ceremony body',
    initial.playerController === 'Player'
      && initial.presentationFigure === 'InitiationCeremonyFigure'
      && initial.pose === 'standing',
    JSON.stringify(initial));
  check('every attendee keeps their canonical body in a formal suit',
    initial.formalMembers && initial.formalProspects,
    JSON.stringify({ members: initial.formalMembers, prospects: initial.formalProspects }));
  check('soft actor collision is live but smaller than a roadblock',
    initial.actorColliders.length === 20
      && initial.actorColliders.every((circle) => circle.active && circle.r >= 0.32 && circle.r <= 0.45),
    JSON.stringify(initial.actorColliders));
  check('Captain Lou Sasole appears under his canonical identity',
    initial.memberNames.includes('CAPTAIN LOU SASOLE'),
    initial.memberNames.join(' | '));
  check('the scene gives a visible movement objective, on the shared panel',
    Boolean(initial.objective) && (initial.panel ?? '').includes('WASD'),
    `${initial.objective || 'no objective'} | panel: ${initial.panel ?? 'absent'}`);
  check('Initiation keeps the shared five-slot inventory visible',
    initial.inventoryVisible && initial.inventorySlots === 5,
    JSON.stringify({ visible: initial.inventoryVisible, slots: initial.inventorySlots }));

  await page.locator('canvas').first().click({ position: { x: 320, y: 180 } });
  await page.waitForFunction(() => window.INITIATION.audioReady || window.INITIATION.audioLoadError,
    null, { timeout: 120000 });
  const audioState = await page.evaluate(() => ({
    ready: window.INITIATION.audioReady,
    error: window.INITIATION.audioLoadError,
    missing: window.INITIATION.missingVoiceCues,
    failed: window.INITIATION.failedCues,
  }));
  check('the delivered Kitten Boss begging take exists in the production voice bank',
    productionKittenBegCueExists,
    productionKittenBegCueExists
      ? KITTEN_BEG_CUE_FILE
      : `${KITTEN_BEG_CUE_FILE} is absent; later flow uses a verifier-only same-performer substitute`);
  check('the first gesture decodes the active Initiation voice bank before ceremony dialogue',
    audioState.ready && !audioState.error && audioState.missing.length === 0 && audioState.failed.length === 0,
    JSON.stringify({ ...audioState, verifierSubstitute: !productionKittenBegCueExists }));
  check('all scene modules, art and face textures load', missing.length === 0, missing.join(' | '));

  /* ---------------------------------------------------------------- */
  /* ACT ONE — the clearing                                             */
  /* ---------------------------------------------------------------- */

  const voiceProbe = await page.evaluate(() => window.INITIATION.speakVoiceProbe());
  check('the conspiracy reveal uses the authored Lou cue',
    voiceProbe.speaker === 'BIG UNCLE LOU SPUTTHOLE'
      && voiceProbe.line.includes('Willy wasn’t the rat')
      && voiceProbe.cue.startsWith('vo.initiation.cabin.'),
    JSON.stringify(voiceProbe));
  check('the conspiracy reveal cue actually entered the audible buffer graph',
    voiceProbe.loaded && voiceProbe.duration > 0 && voiceProbe.played && !voiceProbe.blocked,
    JSON.stringify(voiceProbe));

  const quizVoiceProbe = await page.evaluate(() => window.INITIATION.speakQuizVoiceProbe());
  check('Tony reads the selected founders answer through a decoded voice take',
    quizVoiceProbe.speaker === 'PROSPECT TWO'
      && quizVoiceProbe.line.includes('Deathmegatron')
      && quizVoiceProbe.cue.startsWith('vo.initiation.ceremony.prospect-two.')
      && quizVoiceProbe.loaded && quizVoiceProbe.duration > 0
      && quizVoiceProbe.played && !quizVoiceProbe.blocked,
    JSON.stringify(quizVoiceProbe));

  const approachCapture = await capturePointerLock(page);
  check('a real canvas gesture captures first-person input before the woods walk',
    approachCapture.captured,
    JSON.stringify({ ...approachCapture, transientWarnings: pointerLockWarnings.length }));

  /* ---------------------------------------------------------------- */
  /* ACTS TWO TO FOUR — the part nothing had ever played               */
  /* ---------------------------------------------------------------- */

  /* THIS IS THE GAP THAT LET ACT FIVE SHIP BROKEN, ONE ACT EARLIER.
   *
   * Until now this verifier touched `approach` and then called
   * `skipToRitual()`, so forty of the scene's forty-five phases were never
   * once played by anything. The pure tests prove the phase graph is sound --
   * every phase reachable, every exit real, every beat authored -- and that is
   * a different claim from the runtime actually walking it: timers firing,
   * cameras cutting, lines playing, the pistol changing hands. Act five was
   * proven as data too, and shipped broken. See docs/ENGINE-TRAPS.md 5.
   *
   * Driven, not skipped. `driveTo` presses the action key on a slow tick,
   * which is what a player does and the only thing that is not a race. */
  /* On foot to the line, because that is how a player gets there. */
  let walked = true;
  try {
    await walkTo(page, 'line_chat', { timeout: APPROACH_WALK_TIMEOUT_MS });
  } catch (error) {
    walked = false;
    check('the player can walk from the woods to his place in the line', false, error.message);
  }
  if (walked) check('the player can walk from the woods to his place in the line', true);

  const MIDDLE = [
    ['speech', 'Booskibro speaks to the line'],
    ['q1', 'the first question is asked'],
    ['exec_one', 'the first man is taken out of the line'],
    ['q2_intro', 'the second question comes round'],
  ];
  for (const [phase, what] of MIDDLE) {
    let reached = true;
    try {
      await driveTo(page, phase, { timeout: 120000 });
    } catch (error) {
      reached = false;
      check(`the scene reaches ${phase} — ${what}`, false, error.message);
    }
    if (reached) check(`the scene reaches ${phase} — ${what}`, true);
  }

  /* Exercise the failure path with the same numbered keys a player uses. This
   * specifically guards the historical raw "Could not load scene" failure,
   * proves the whole connected death completes, and then reloads the browser
   * from that terminal state. A reload and an in-page retry are different
   * recovery paths; certifying only the latter left the explicit reload
   * requirement untested. */
  await driveTo(page, 'q2_choice', { timeout: 120000 });
  const wrongChoice = await page.evaluate(() => {
    const correct = window.INITIATION.correctChoice;
    return { correct, wrong: (correct + 1) % 3, url: location.href };
  });
  await page.keyboard.press(`Digit${wrongChoice.wrong + 1}`);
  await driveTo(page, 'failed', { timeout: 180000 });
  const failedAttempt = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    visible: !document.querySelector('#fail')?.classList.contains('hidden'),
    title: document.querySelector('#fail .title')?.textContent?.trim(),
    reason: document.querySelector('#failReason')?.textContent?.replace(/\s+/g, ' ').trim(),
    url: location.href,
  }));
  check('a wrong founders answer executes the player through the connected failure flow',
    failedAttempt.phase === 'failed'
      && failedAttempt.visible
      && failedAttempt.title === 'INITIATION FAILED'
      && failedAttempt.reason?.includes('Wrong founders'),
    JSON.stringify(failedAttempt));
  check('the wrong answer remains in the live Initiation page instead of loading an error scene',
    failedAttempt.url === wrongChoice.url
      && !failedAttempt.reason?.includes('Could not load scene'),
    JSON.stringify({ before: wrongChoice.url, after: failedAttempt.url, reason: failedAttempt.reason }));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.INITIATION?.phase, null, { timeout: 60000 });
  const reloadedAttempt = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    control: window.INITIATION.control,
    failHidden: document.querySelector('#fail')?.classList.contains('hidden'),
    objective: document.querySelector('#objective')?.textContent?.trim(),
    url: location.href,
  }));
  check('reloading after a wrong answer restores a playable Initiation scene entry',
    reloadedAttempt.phase === 'approach'
      && reloadedAttempt.control === 'playable'
      && reloadedAttempt.failHidden
      && Boolean(reloadedAttempt.objective)
      && reloadedAttempt.url === wrongChoice.url,
    JSON.stringify(reloadedAttempt));

  const reloadCapture = await capturePointerLock(page);
  await page.waitForFunction(() => window.INITIATION.audioReady || window.INITIATION.audioLoadError,
    null, { timeout: 120000 });
  const reloadReady = await page.evaluate(() => ({
    input: document.pointerLockElement === document.querySelector('canvas'),
    audioReady: window.INITIATION.audioReady,
    audioError: window.INITIATION.audioLoadError,
    missing: window.INITIATION.missingVoiceCues,
  }));
  check('the reloaded scene re-arms real input and the active voice bank',
    reloadCapture.captured
      && reloadReady.input
      && reloadReady.audioReady
      && !reloadReady.audioError
      && reloadReady.missing.length === 0,
    JSON.stringify({ ...reloadReady, attempts: reloadCapture.attempts }));

  const reloadedWalk = await walkTo(page, 'line_chat', {
    timeout: APPROACH_WALK_TIMEOUT_MS,
  });
  check('the post-failure browser reload can walk the full woods route again with real WASD',
    reloadedWalk.phase === 'line_chat'
      && reloadedWalk.steeringTicks > 0
      && reloadedWalk.waypointIndex === reloadedWalk.waypointCount - 1,
    JSON.stringify(reloadedWalk));
  for (const [phase] of MIDDLE) await driveTo(page, phase, { timeout: 120000 });
  await driveTo(page, 'q2_choice', { timeout: 120000 });
  const secondWrongChoice = await page.evaluate(() => {
    const correct = window.INITIATION.correctChoice;
    return { correct, wrong: (correct + 2) % 3 };
  });
  await page.keyboard.press(`Digit${secondWrongChoice.wrong + 1}`);
  await driveTo(page, 'failed', { timeout: 180000 });
  const secondFailure = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    visible: !document.querySelector('#fail')?.classList.contains('hidden'),
    title: document.querySelector('#fail .title')?.textContent?.trim(),
    reason: document.querySelector('#failReason')?.textContent?.replace(/\s+/g, ' ').trim(),
    url: location.href,
  }));
  check('a second wrong attempt repeats the connected death flow without a raw scene-load error',
    secondFailure.phase === 'failed'
      && secondFailure.visible
      && secondFailure.title === 'INITIATION FAILED'
      && secondFailure.reason?.includes('Wrong founders')
      && !secondFailure.reason?.includes('Could not load scene')
      && secondFailure.url === wrongChoice.url,
    JSON.stringify(secondFailure));

  /* The failure lands while the first-person canvas still owns pointer lock.
   * Escape is the real browser gesture that returns the cursor before the
  * player clicks the visible retry button; forcing a locator click would
   * bypass that browser state instead of certifying it. Headless Chromium
   * does not always route Playwright's synthetic Escape through browser chrome,
   * so release only the browser lock if it remains; the retry itself is still
   * a real hit-tested pointer click. */
  await page.keyboard.press('Escape');
  if (await page.evaluate(() => document.pointerLockElement !== null)) {
    await page.evaluate(() => document.exitPointerLock());
  }
  await page.waitForFunction(() => document.pointerLockElement === null, null, { timeout: 3000 });
  await page.locator('#retryBtn').click();
  await page.waitForFunction(() => window.INITIATION.phase === 'q2_choice'
    && window.INITIATION.quizOpen, null, { timeout: 30000 });
  const retried = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    quizOpen: window.INITIATION.quizOpen,
    failHidden: document.querySelector('#fail')?.classList.contains('hidden'),
    correct: window.INITIATION.correctChoice,
    playerPose: window.INITIATION.playerPose,
    input: window.INITIATION.input?.snapshot?.() ?? null,
  }));
  check('TRY AGAIN restores the live founders checkpoint for repeated attempts',
    retried.phase === 'q2_choice'
      && retried.quizOpen
      && retried.failHidden
      && retried.correct >= 0
      && retried.playerPose === 'standing'
      && retried.input?.suspended === false
      && retried.input?.inputEnabled === true,
    JSON.stringify(retried));
  await page.keyboard.press(`Digit${retried.correct + 1}`);
  await pressActionTo(page, 'q2_correct', { timeout: 120000 });
  check('a correct retry resumes the successful initiation graph', true,
    JSON.stringify({ phase: await page.evaluate(() => window.INITIATION.phase) }));

  /* Nobody talked over anybody on the way here. The engine's own playback log
   * is the evidence; `voiceOverlaps()` is the arithmetic. A line that MEANS
   * to cut in says so with `interrupt: true` and is not reported. */
  const midOverlap = await voiceOverlapFindings(page, 'window.INITIATION.audio');
  check('the audio engine is reachable, so silence here means silence',
    midOverlap.reachable, midOverlap.reachable ? `${midOverlap.voices} voice lines heard ${JSON.stringify(midOverlap.windows?.slice(0, 5))}` : 'window.INITIATION.audio did not resolve');
  check('no two people talk over each other through the executions',
    midOverlap.reachable && midOverlap.findings.length === 0,
    midOverlap.findings.length
      ? JSON.stringify(midOverlap.findings.slice(0, 4))
      : `${midOverlap.voices} lines, none overlapping`);

  /* ---------------------------------------------------------------- */
  /* ACT FIVE — the blade, the hand, the cut, the card, the burning    */
  /* ---------------------------------------------------------------- */

  await pressActionTo(page, 'mass_kneel', { timeout: 180000 });
  const kneel = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    control: window.INITIATION.control,
    pose: window.INITIATION.playerPose,
    eyeY: window.INITIATION.player.position.y,
    kneeling: window.INITIATION.prospects
      .filter((prospect) => prospect.name !== 'PROSPECT ONE')
      .map((prospect) => ({ name: prospect.name, pose: prospect.sq.pose, rootY: prospect.sq.position.y })),
  }));
  check('mass execution staging keeps Tony kneeling in first-person free-look',
    kneel.phase === 'mass_kneel' && kneel.control === 'look-only'
      && kneel.pose === 'kneeling' && kneel.eyeY < 1.1,
    JSON.stringify(kneel));
  check('all four remaining prospects kneel on articulated legs without buried roots',
    kneel.kneeling.length === 4
      && kneel.kneeling.every((entry) => entry.pose === 'kneeling' && entry.rootY >= -0.01),
    JSON.stringify(kneel.kneeling));

  /* Finish the execution run through the same Space-key action path, then let
   * Tony walk every authored metre himself. No phase, player-position, or
   * mission-state seam participates in the successful route. */
  await pressActionTo(page, 'walk_out', { timeout: 900000 });
  const trailStart = await page.evaluate(() => ({
    x: window.INITIATION.player.position.x,
    z: window.INITIATION.player.position.z,
  }));
  const trailCapture = await capturePointerLock(page);
  check('the successful execution run releases Tony into real first-person movement',
    trailCapture.captured
      && await page.evaluate(() => window.INITIATION.phase === 'walk_out'
        && window.INITIATION.control === 'playable'),
    JSON.stringify({ phase: await page.evaluate(() => window.INITIATION.phase), ...trailCapture }));

  /* Try the exact bypass that used to skip three markers: hold run and walk.
   * The key events are real; the scene must keep W while rejecting Shift at
   * the shared Player socket, not patch position after the fact. */
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(350);
  const processionInput = await page.evaluate(() => window.INITIATION.trail);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  check('the trail keeps real walking while rejecting keyboard sprint bypass',
    processionInput.moveScale === 0.78
      && processionInput.allowSprint === false
      && processionInput.dialogueTiming === 'recorded'
      && processionInput.playerSprinting === false
      && !processionInput.heldKeys.includes('ShiftLeft')
      && !processionInput.heldKeys.includes('ShiftRight'),
    JSON.stringify(processionInput));

  const cabinWalk = await walkAuthoredRouteTo(page, 'ceremony', [
    ...TRAIL,
    CABIN_DOOR.outside,
    CABIN_DOOR.inside,
  ], { timeout: 360000 });
  const trailDistance = Math.hypot(cabinWalk.x - trailStart.x, cabinWalk.z - trailStart.z);
  check('real WASD follows the authored trail and crosses the cabin doorway',
    cabinWalk.phase === 'ceremony'
      && cabinWalk.keyTicks > 0
      && cabinWalk.reachedWaypoints >= TRAIL.length + 1
      && cabinWalk.z > CABIN.frontZ + 0.6
      && trailDistance > 25,
    JSON.stringify({ ...cabinWalk, trailStart, trailDistance }));
  check('the cabin gate waits for every trail beat and the resolved player choice',
    cabinWalk.trailChoiceAnswered
      && cabinWalk.trail?.storyComplete
      && cabinWalk.trail?.pendingBeatIds?.length === 0
      && JSON.stringify(cabinWalk.trail?.requiredBeatIds) === JSON.stringify(REQUIRED_TRAIL_BEATS)
      && JSON.stringify(cabinWalk.trail?.firedBeatIds) === JSON.stringify(REQUIRED_TRAIL_BEATS)
      && cabinWalk.trail?.choiceUsed
      && cabinWalk.trail?.choiceResolved,
    JSON.stringify({ answered: cabinWalk.trailChoiceAnswered, trail: cabinWalk.trail }));

  await pressActionTo(page, 'ceremony_approach', { timeout: 240000 });
  const ceremonyWalk = await walkAuthoredRouteTo(
    page,
    'ceremony',
    [CEREMONY_CENTRE],
    { timeout: 120000 },
  );
  const ceremonyMiss = Math.hypot(
    ceremonyWalk.x - CEREMONY_CENTRE.x,
    ceremonyWalk.z - CEREMONY_CENTRE.z,
  );
  check('Tony physically walks to the authored ceremony mark before translation locks',
    ceremonyWalk.phase === 'ceremony'
      && ceremonyWalk.keyTicks > 0
      && ceremonyMiss < 0.05,
    JSON.stringify({ ...ceremonyWalk, ceremonyMiss }));

  /* Evidence only: this is intentionally not a visual-regression oracle. It
   * lets a human inspect Lou, Booski, face readability and bloom at the exact
   * clean-start room tableau reached above. */
  const ceremonyArtifact = path.join(ROOT, '.artifacts', 'initiation-ceremony-real-flow.png');
  await fsp.mkdir(path.dirname(ceremonyArtifact), { recursive: true });
  await page.waitForTimeout(750);
  await page.screenshot({ path: ceremonyArtifact });

  await pressActionTo(page, 'oath_question', { timeout: 360000 });
  await page.waitForFunction(() => window.INITIATION.phase === 'oath_question'
    && window.INITIATION.quizOpen, null, { timeout: 120000 });
  const commitmentOptions = await page.locator('#quiz .quiz-opt').evaluateAll((buttons) => buttons
    .filter((button) => !button.hidden)
    .map((button) => ({
      index: Number(button.dataset.i),
      text: button.textContent.replace(/\s+/g, ' ').trim(),
    })));
  const yes = commitmentOptions.find((option) => option.text.includes('Yes. I do.'));
  if (!yes) throw new Error(`Initiation commitment choice did not offer its authored successful answer: ${JSON.stringify(commitmentOptions)}`);
  await page.keyboard.press(`Digit${yes.index + 1}`);
  await page.waitForFunction(() => window.INITIATION.phase === 'oath_yes', null, { timeout: 30000 });
  check('the real numbered commitment input chooses the successful oath path',
    yes.index >= 0,
    JSON.stringify({ options: commitmentOptions, selected: yes }));

  await pressActionTo(page, 'blade', { timeout: 180000 });
  const ritualCapture = await capturePointerLock(page);
  check('the successful oath re-arms real first-person look for the ritual',
    ritualCapture.captured,
    JSON.stringify(ritualCapture));

  /* The retry button sits below the centre of this 640 x 360 viewport. A
   * numbered keyboard choice can re-lock the canvas while Playwright's
   * virtual pointer remains at that button. An absolute "horizontal" move
   * from there contains a hidden negative movementY and pitches the real
   * Player upward. Reacquire from the canvas centre through actual browser
   * input so the look assertion measures horizontal mouse-look rather than a
   * stale harness coordinate. This changes pointer-lock state only; it never
   * writes the Player's yaw, pitch, position, phase, or mission state. */
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => document.pointerLockElement === null, null, { timeout: 30000 });
  await page.mouse.move(320, 180);
  const centeredRitualCapture = await capturePointerLock(page);
  check('the ritual look probe reacquires pointer lock from the canvas centre',
    centeredRitualCapture.captured,
    JSON.stringify(centeredRitualCapture));

  const ritualStart = await page.evaluate(() => ({
    ...window.INITIATION.ritual,
    yaw: window.INITIATION.player.yaw,
    pitch: window.INITIATION.player.pitch,
    position: window.INITIATION.player.position.toArray(),
  }));
  check('the blade reveal remains first-person while Tony\'s hands stay lowered',
    ritualStart.control === 'look-only'
      && ritualStart.cameraOwnedByPlayer
      && !ritualStart.firstPersonHandsVisible,
    JSON.stringify(ritualStart));

  /* Real input, because importing Player is not evidence that the player owns
   * the camera. Translation must stay locked while pointer-lock mouse input
   * continues to rotate the view. */
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.keyboard.up('w');
  await page.mouse.move(360, 180);
  await page.mouse.move(420, 180, { steps: 3 });
  await page.waitForTimeout(120);
  const ritualInput = await page.evaluate(() => ({
    yaw: window.INITIATION.player.yaw,
    pitch: window.INITIATION.player.pitch,
    position: window.INITIATION.player.position.toArray(),
    control: window.INITIATION.control,
  }));
  const ritualMoved = Math.hypot(
    ritualInput.position[0] - ritualStart.position[0],
    ritualInput.position[2] - ritualStart.position[2],
  );
  check('ritual input locks walking but preserves natural mouse-look',
    ritualInput.control === 'look-only'
      && ritualMoved < 0.01
      && Math.abs(ritualInput.yaw - ritualStart.yaw) > 0.001
      && Math.abs(ritualInput.pitch - ritualStart.pitch) < 0.001,
    JSON.stringify({ before: ritualStart, after: ritualInput, moved: ritualMoved }));

  /* Drive it: the blade runs on a timer, then the hand is asked for, then the
   * cut. Every one of those beats speaks first, so every one needs more than
   * one press. */
  await page.waitForFunction(() => window.INITIATION.phase === 'hand', null, { timeout: 90000 });
  const handPrompt = await page.evaluate(() => window.INITIATION.ritual);
  check('the hand prompt arrives before the player raises Tony\'s hands',
    handPrompt.phase === 'hand'
      && handPrompt.control === 'look-only'
      && handPrompt.cameraOwnedByPlayer,
    JSON.stringify(handPrompt));
  /* Owner sequence: prompt, player clicks, then the hands visibly rise. Drive
   * that click through the real Space listener before asking the renderer to
   * prove the hand is in frame. The earlier verifier waited for the raised
   * `cut` pose while insisting the phase was still `hand`, contradicting the
   * authored sequence and its source contract. */
  await pressActionTo(page, 'cut');
  /* The scene clock clamps every rendered frame to 0.05 s. Use the same
   * loaded-browser budget as the surrounding input seam; the six-second
   * `cut` watchdog still leaves a wide deterministic rendered-frame window
   * in which to observe the 0.58-s raise. */
  await page.waitForFunction(() => {
    const ritual = window.INITIATION?.ritual;
    return ritual?.phase === 'cut'
      && ritual.firstPersonHandsVisible
      && ritual.handNdc.every(Number.isFinite)
      && Math.abs(ritual.handNdc[0]) <= 1
      && Math.abs(ritual.handNdc[1]) <= 1
      && ritual.handNdc[2] >= -1
      && ritual.handNdc[2] <= 1;
  }, null, { timeout: 120000 });
  const handPresentation = await page.evaluate(() => window.INITIATION.ritual);
  check('the real hand input raises Tony\'s hands inside the first-person view',
    handPresentation.control === 'look-only'
      && handPresentation.cameraOwnedByPlayer
      && handPresentation.firstPersonHandsVisible,
    JSON.stringify(handPresentation));
  check('the raised ritual hand is framed inside the viewport',
    handPresentation.handNdc.every(Number.isFinite)
      && Math.abs(handPresentation.handNdc[0]) <= 1
      && Math.abs(handPresentation.handNdc[1]) <= 1
      && handPresentation.handNdc[2] >= -1
      && handPresentation.handNdc[2] <= 1,
    JSON.stringify({ handNdc: handPresentation.handNdc }));
  await pressActionTo(page, 'card');

  const afterCut = await page.evaluate(() => window.INITIATION.ritual);
  check('the cut is marked on the palm, not on the floorboards',
    afterCut.palmCut, JSON.stringify(afterCut));
  check('the saint card is in the player\'s hand from IN-420, before the oath',
    afterCut.cardInPlayerHand && afterCut.cardVisible,
    JSON.stringify(afterCut));

  /* Both oath lines -- Lou says each, the prompt goes up, Tony chooses the
   * exact wording with the real randomized numbered key, and then the card
   * burns under a real held Space input. */
  await pressActionTo(page, 'oath_1', { timeout: 180000 });
  const firstOath = await chooseCorrectDisplayedOath(page, 'oath_1');
  await pressActionTo(page, 'oath_2', { timeout: 180000 });
  const secondOath = await chooseCorrectDisplayedOath(page, 'oath_2');
  await pressActionTo(page, 'burn', { timeout: 180000 });
  check('both randomized oath lines are repeated word-for-word through real numbered input',
    firstOath.selected.correct && secondOath.selected.correct,
    JSON.stringify({ first: firstOath, second: secondOath }));
  await page.keyboard.down('Space');
  /* The burn tick is held off while IN-440 is still speaking, so this waits
   * for the line as well as for the card to take. */
  await page.waitForFunction(() => window.INITIATION.ritual.char > 0, null, { timeout: 90000 });

  const burning = await page.evaluate(() => window.INITIATION.ritual);
  check('the card catches, and there is a flame on it',
    burning.char > 0 && burning.flame && burning.cardVisible,
    JSON.stringify(burning));
  check('the card is burning in the player\'s own hand',
    burning.cardInPlayerHand, JSON.stringify(burning));
  check('the burning remains attached to visible first-person hands',
    burning.firstPersonHandsVisible && burning.cameraOwnedByPlayer,
    JSON.stringify(burning));

  /* Let go. Past the commit, Lou has it and nothing dead-ends. */
  await page.waitForFunction(() => window.INITIATION.ritual.committed, null, { timeout: 90000 });
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.INITIATION.phase === 'made', null, { timeout: 120000 });

  const made = await page.evaluate(() => window.INITIATION.ritual);
  check('a player who lets go after the commit is held, and it burns down',
    made.char === 1 && !made.cardVisible,
    JSON.stringify(made));

  /* ---------------------------------------------------------------- */
  /* ACT SIX — the room, and out                                       */
  /* ---------------------------------------------------------------- */

  /* Act six is the room, Lou's aside, and the pull-back out of the window:
   * about 76 authored seconds, several of which wait on a press.
   *
   * THE BUDGET IS ARITHMETIC, NOT A NUDGE. `main.js` clamps its frame delta to
   * 0.05 s, so a phase timer advances at (fps / 20) of real time and never
   * faster. Measured here at the stall: phaseT reached 10.9 s in 420 s of wall
   * clock -- about 2.6% of real time, which is half a frame a second. At that
   * rate `pullback`'s 14 s timer alone needs nine minutes, so 420 s was never
   * enough and the runs that passed inside it were lucky rather than fast.
   *
   * A real player at 60 fps sees no clamp at all and act six takes act six.
   *
   * AND IT IS NOT ACT SIX. `tools/probe-initiation-fps.mjs` samples the same
   * phase clock across the scene and measured 2.9 fps in the clearing, 1.5 in
   * the cabin and 1.3 at the pull-back: uniformly slow, declining gently with
   * how much is dressed in front of the camera. That is the headless software
   * renderer, not a beat doing something expensive, and there is nothing here
   * to fix. Act six only LOOKED singular because it is the one act gated on a
   * long unattended timer rather than on a keypress. */
  await pressActionTo(page, 'complete', { timeout: 900000 });
  const inducted = await page.evaluate(() => ({
    controller: window.INITIATION.player?.constructor?.name,
    figure: window.INITIATION.playerFigure?.constructor?.name,
    bandana: window.INITIATION.playerFigure?.model?.bandana,
    dead: window.INITIATION.deadProspects,
    phase: window.INITIATION.phase,
    creditsVisible: document.querySelector('#credits')?.classList.contains('showing') === true,
    creditRows: document.querySelectorAll('#credits-track .credits-row').length,
    creditNames: [...document.querySelectorAll('#credits-track .credits-name')]
      .map((name) => name.textContent?.trim()),
    focusId: document.activeElement?.id ?? null,
  }));
  check('induction keeps shared first-person control and awards Tony the member bandana',
    inducted.controller === 'Player'
      && inducted.figure === 'InitiationCeremonyFigure'
      && inducted.bandana === true,
    JSON.stringify(inducted));
  check('Kittenboss dies beside Tony and Tony is the only surviving prospect',
    ['PROSPECT ONE', 'PROSPECT THREE', 'PROSPECT FOUR', 'PROSPECT FIVE', 'KITTENBOSS']
      .every((name) => inducted.dead.includes(name))
      && !inducted.dead.includes('PROSPECT TWO'),
    JSON.stringify(inducted.dead));
  check('the induction resolves directly into the full family credit roll',
    inducted.phase === 'complete'
      && inducted.creditsVisible
      && inducted.creditRows >= 250
      && inducted.creditNames.includes('Prospect')
      && inducted.creditNames.filter((name) => name === 'Lou Sputthole').length === 240
      && inducted.focusId === 'credits',
    JSON.stringify(inducted));

  const completionPointer = await page.evaluate(() => {
    const button = document.querySelector('#credits-skip');
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      pointerReleased: document.pointerLockElement === null,
      hitId: hit?.id ?? null,
      buttonVisible: rect.width > 0 && rect.height > 0,
    };
  });
  check('the full-screen credits release pointer lock and leave Skip clickable',
    completionPointer.pointerReleased
      && completionPointer.buttonVisible
      && completionPointer.hitId === 'credits-skip',
    JSON.stringify(completionPointer));

  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  const afterResidualSpace = await page.evaluate(() => ({
    pathname: location.pathname,
    phase: window.INITIATION?.phase ?? null,
    creditsVisible: document.querySelector('#credits')?.classList.contains('showing') === true,
    focusId: document.activeElement?.id ?? null,
  }));
  check('residual ceremony Space cannot skip the full campaign credit roll',
    afterResidualSpace.pathname.endsWith('/initiation.html')
      && afterResidualSpace.phase === 'complete'
      && afterResidualSpace.creditsVisible
      && afterResidualSpace.focusId === 'credits',
    JSON.stringify(afterResidualSpace));

  const completionUrl = page.url();
  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith('/index.html'), {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    }),
    page.locator('#credits-skip').click(),
  ]);
  const successfulExit = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('squatchlife.campaign') || 'null');
    return {
      url: location.href,
      sceneId: saved?.scene?.id ?? null,
      spawn: saved?.scene?.spawn ?? null,
      initiationStatus: saved?.missions?.initiation?.status ?? null,
    };
  });
  check('skipping the completed credit roll returns to the title without losing completion',
    completionUrl.endsWith('/initiation.html')
      && new URL(successfulExit.url).pathname.endsWith('/index.html')
      && successfulExit.initiationStatus === 'complete',
    JSON.stringify({ completionUrl, ...successfulExit }));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} catch (error) {
  console.error('Initiation verifier aborted before checks completed.');
  console.error('Runtime errors:', problems);
  console.error('Missing responses:', missing);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Initiation checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Initiation checks passed.`);
