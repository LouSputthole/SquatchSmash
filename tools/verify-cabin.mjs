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
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 400)}`);
  });
  page.on('requestfailed', (request) => {
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
  await page.waitForFunction(() => window.COUNTRYSIDE_CABIN.state.phase === 'active');
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

  const cellar = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const target = runtime.cabin.basement.entryTarget;
    const used = target.userData.interact.onUse();
    return {
      used,
      open: runtime.story.cellarOpen(),
      phase: runtime.story.phase(),
      level: runtime.state.level,
      floorY: runtime.player.ground,
      secondEnabled: runtime.dungeon.targets.door.userData.interact.enabled(),
    };
  });
  check('First secret interaction records the cellar and moves the player below the Cabin',
    cellar.used && cellar.open && cellar.phase === 'enter_dungeon'
      && cellar.level === 'basement' && cellar.floorY < -3);
  check('Opening the cellar enables—but does not auto-open—the second secret door', cellar.secondEnabled);
  await clearHands(page);
  await teleport(page, 'dungeonDoor', 'interact');
  await capture(page, '04-second-secret-door-closed');

  const dungeonEntry = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const door = runtime.dungeon.targets.door;
    const used = door.userData.interact.onUse();
    for (let index = 0; index < 18; index += 1) {
      runtime.dungeon.update(0.1, runtime.state.elapsed + index * 0.1, runtime.player.position);
    }
    runtime.teleport('dungeonAteamCaptive', 'interact');
    return {
      used,
      entered: runtime.story.dungeonEntered(),
      phase: runtime.story.phase(),
      doorOpen: runtime.dungeon.door.open,
      doorT: runtime.dungeon.door.t,
      colliderLive: runtime.dungeon.door.colliderLive,
      playerY: runtime.player.position.y,
      floorY: runtime.dungeon.bounds.dungeon.floorY,
    };
  });
  check('Second secret-door interaction opens the expanded dungeon and removes its live collider',
    dungeonEntry.used && dungeonEntry.entered && dungeonEntry.phase === 'interrogation'
      && dungeonEntry.doorOpen && dungeonEntry.doorT > 0.95 && !dungeonEntry.colliderLive);
  check('Dungeon spawn lands on its own lower floor',
    Math.abs((dungeonEntry.playerY - 1.66) - dungeonEntry.floorY) < 0.06,
    `floor ${dungeonEntry.floorY.toFixed(2)} m`);
  await clearChapterPresentation(page);
  await clearHands(page);
  await teleport(page, 'dungeon', 'observe');
  await captureScene(page, '05-dungeon-overview-clean');
  await teleport(page, 'dungeonAteamCaptive', 'interact');
  await capture(page, '05-dungeon-interrogation');
  await teleport(page, 'dungeonCounterStrikeCaptive', 'interact');
  await captureScene(page, '05-dungeon-baiter-clean');

  const interrogation = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const { chapter, dungeon, story } = runtime;
    dungeon.targets.tools.pliers.userData.interact.onUse();
    const selectedBeforeHits = chapter.selectedTool;
    const tableToolHidden = dungeon.tools.pliers.visible === false;
    const heldToolVisible = runtime.tortureTools?.snapshot?.().visible?.pliers === true;
    const apply = (id, count) => {
      const outcomes = [];
      for (let index = 0; index < count; index += 1) {
        chapter.dialogue.stop?.();
        chapter.beatQueue.length = 0;
        outcomes.push(runtime.torture(id));
        while (chapter.toolUseRemaining > 0) {
          chapter.update(0.1, {
            playerPosition: runtime.player.position,
            cabinPosition: { x: 0, z: 0 },
          });
        }
      }
      return outcomes;
    };
    const baiter = apply('counter_strike_player', 2);
    const ateam = apply('ateam_member', 6);
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
      selectedBeforeHits,
      tableToolHidden,
      heldToolVisible,
      selectedAfterReveal: chapter.selectedTool,
      tableToolRestored: dungeon.tools.pliers.visible,
      heldToolsCleared: !Object.values(runtime.tortureTools?.snapshot?.().visible ?? {}).some(Boolean),
      baiterApplied: baiter.every((result) => result.ok && result.applied),
      ateamApplied: ateam.every((result) => result.ok && result.applied),
      revealBeat,
      baiter: story.hostageState('counter_strike_player'),
      ateam: story.hostageState('ateam_member'),
      intel: story.ateamIntelLearned(),
      phase: story.phase(),
      baiterActor: dungeon.actors.counterStrike.snapshot,
      ateamActor: dungeon.actors.ateam.snapshot,
    };
  });
  check('Pliers selection drives one visible production tool and returns it before the pistol',
    interrogation.selectedBeforeHits === 'pliers'
      && interrogation.tableToolHidden && interrogation.heldToolVisible
      && interrogation.selectedAfterReveal === null
      && interrogation.tableToolRestored && interrogation.heldToolsCleared);
  check('CS baiter breaks at 2 hits while preserving 8-hit execution durability',
    interrogation.baiterApplied && interrogation.baiter.hits === 2
      && interrogation.baiter.threshold === 2 && interrogation.baiter.maxHits === 8);
  check('A-Team captive resists until 6 hits, reveals the intel, and preserves 8-hit durability',
    interrogation.ateamApplied && interrogation.ateam.hits === 6
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

  const execution = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const { chapter, story } = runtime;
    runtime.chooseExecution('yes');
    const branchStarted = chapter.dialogue.current;
    let branchTicks = 0;
    while (!story.executionBranchVoComplete() && branchTicks < 300) {
      chapter.dialogue.update(0.1);
      branchTicks += 1;
    }
    const branchBeat = {
      expected: 'EXECUTION_YES',
      started: branchStarted,
      completed: story.executionBranchVoComplete(),
      ticks: branchTicks,
    };
    const baiterOne = runtime.shootHostage('counter_strike_player', 4);
    const baiterTwo = runtime.shootHostage('counter_strike_player', 4);
    const ateam = runtime.shootHostage('ateam_member', 4);
    chapter.update(0.1, { playerPosition: runtime.player.position, cabinPosition: { x: 0, z: 0 } });
    const nightfallStarted = chapter.dialogue.current;
    let nightfallTicks = 0;
    while (!story.nightfallBriefingComplete() && nightfallTicks < 600) {
      chapter.dialogue.update(0.1);
      nightfallTicks += 1;
    }
    const nightfallBeats = {
      expected: 'BOTH_DEAD',
      started: nightfallStarted,
      completed: story.nightfallBriefingComplete(),
      ticks: nightfallTicks,
    };
    chapter.callbacks.onSync?.();
    return {
      choice: story.executionChoice(),
      branchBeat,
      nightfallBeats,
      baiterOne,
      baiterTwo,
      ateam,
      baiter: story.hostageState('counter_strike_player'),
      ateamState: story.hostageState('ateam_member'),
      deaths: story.deathsComplete(),
      night: story.nightfallComplete(),
      phase: story.phase(),
      day: runtime.campaign.state.story.day,
      timeMinutes: runtime.campaign.state.story.timeMinutes,
      dark: runtime.time.isDark,
    };
  });
  check('YES branch hands off the pistol and consumes all eight durability slots',
    execution.choice === 'player'
      && execution.branchBeat.started === execution.branchBeat.expected
      && execution.branchBeat.completed
      && execution.baiter.hits === 8 && execution.ateamState.hits === 8
      && execution.baiter.dead && execution.ateamState.dead,
    JSON.stringify(execution.branchBeat));
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

  const wrapped = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const firstTarget = runtime.dungeon.actors.counterStrike.bodyTarget.userData.interact;
    const secondTarget = runtime.dungeon.actors.ateam.bodyTarget.userData.interact;
    const directPrompts = [firstTarget, secondTarget].map((descriptor) => ({
      enabled: descriptor.enabled(),
      label: descriptor.label(),
    }));
    firstTarget.onUse();
    secondTarget.onUse();
    runtime.chapter.dialogue.stop?.();
    runtime.chapter.beatQueue.length = 0;
    const cleanup = runtime.cleanup.snapshot();
    return {
      directPrompts,
      cleanup,
      phase: runtime.story.phase(),
      gratinZ: runtime.dungeon.actors.gratin.group.position.z,
      gratinVisible: runtime.dungeon.actors.gratin.group.visible,
    };
  });
  check('Each dead captive prompt wraps its shared canonical body directly in the dungeon',
    wrapped.directPrompts.every(({ enabled, label }) => enabled && /^Wrap the /i.test(label))
      && Object.values(wrapped.cleanup.bodies).every(({ phase }) => phase === 'wrapped')
      && wrapped.phase === 'carry_bodies');
  check('Gratin stays in the dungeon until the physical carry is actually complete',
    wrapped.gratinVisible && wrapped.gratinZ > 10);
  await clearHands(page);
  await teleport(page, 'dungeon', 'observe');
  await capture(page, '08-wrapped-bodies-in-dungeon');
  await captureScene(page, '08-wrapped-bodies-clean');

  const firstCarry = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const begun = runtime.carryBody('counterstrike-player');
    runtime.player.keys.add('ShiftLeft');
    runtime.player.keys.add('Space');
    runtime.player.sprinting = true;
    return {
      begun,
      cleanup: runtime.cleanup.snapshot(),
      carrying: runtime.state.carryingBody,
      parentIsCamera: runtime.cleanup.bodies.get('counterstrike-player').group.parent === runtime.player.camera,
    };
  });
  await nextFrames(page, 2);
  const carrySuppression = await page.evaluate(() => ({
    sprinting: window.COUNTRYSIDE_CABIN.player.sprinting,
    shift: window.COUNTRYSIDE_CABIN.player.keys.has('ShiftLeft'),
    jump: window.COUNTRYSIDE_CABIN.player.keys.has('Space'),
  }));
  check('Wrapped body attaches to the first-person carry rig inside the dungeon',
    firstCarry.begun && firstCarry.cleanup.carryingId === 'counterstrike-player'
      && firstCarry.carrying === 'counterstrike-player' && firstCarry.parentIsCamera);
  check('Carrying suppresses sprint and jump to protect the ladder/door route',
    !carrySuppression.sprinting && !carrySuppression.shift && !carrySuppression.jump);

  const carryRoute = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const upOne = runtime.transitionBasement('up');
    runtime.teleport('firepit', 'observe');
    const placeOne = runtime.placeBodyAtFire('counterstrike-player');
    const gratinAfterOne = runtime.dungeon.actors.gratin.group.position.z;
    const castAtFireAfterOne = runtime.chapter.snapshot().castAtFire;
    const downTwo = runtime.transitionBasement('down');
    const carryTwo = runtime.carryBody('a-team-member');
    const upTwo = runtime.transitionBasement('up');
    runtime.teleport('firepit', 'observe');
    const placeTwo = runtime.placeBodyAtFire('a-team-member');
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
      upOne, placeOne, downTwo, carryTwo, upTwo, placeTwo,
      cleanup: runtime.cleanup.snapshot(),
      phase: runtime.story.phase(),
      objectiveRows,
      objectiveHint,
      objectivePlan: runtime.story.objectivePlan(),
      gratinAfterOne,
      castAtFireAfterOne,
      castAtFireAfterTwo,
      lagSeatDistance: Math.hypot(lagAt.x - lagSeat.x, lagAt.z - lagSeat.z),
      gratinSeatDistance: Math.hypot(gratinAt.x - gratinSeat.x, gratinAt.z - gratinSeat.z),
      lagJob: lagNpc.job,
      gratinJob: gratinNpc.job,
      lagSeated: lagNpc.seated,
      gratinSeated: gratinNpc.seated,
    };
  });
  check('Each body travels through the wardrobe ladder route and is placed individually on the pyre',
    carryRoute.upOne && carryRoute.placeOne.ok && carryRoute.downTwo && carryRoute.carryTwo
      && carryRoute.upTwo && carryRoute.placeTwo.ok
      && Object.values(carryRoute.cleanup.bodies).every(({ phase }) => phase === 'at-fire'));
  check('Lag and Gratin move to the bonfire only after both bodies arrive',
    carryRoute.gratinAfterOne > 10
      && !carryRoute.castAtFireAfterOne && carryRoute.castAtFireAfterTwo
      && carryRoute.lagSeatDistance < 0.05 && carryRoute.gratinSeatDistance < 0.05
      && carryRoute.lagJob === 'drink' && carryRoute.gratinJob === 'drink'
      && carryRoute.lagSeated && carryRoute.gratinSeated,
    JSON.stringify({
      castAfterOne: carryRoute.castAtFireAfterOne,
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

  const fire = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const gas = runtime.pourGas();
    runtime.chapter.dialogue.stop?.();
    runtime.chapter.beatQueue.length = 0;
    const ignition = runtime.ignitePyre();
    runtime.cleanup.update(1.5);
    return {
      gas,
      ignition,
      cleanup: runtime.cleanup.snapshot(),
      storyGas: runtime.story.gasPoured(),
      storyIgnited: runtime.story.bonfireIgnited(),
      phase: runtime.story.phase(),
      dressing: runtime.cleanup.geometry.dressing,
    };
  });
  check('Gasoline and ignition interactions light the two-body pyre',
    fire.gas.ok && fire.ignition.ok && fire.storyGas && fire.storyIgnited
      && fire.cleanup.gasPoured && fire.cleanup.ignited
      && Object.values(fire.cleanup.bodies).every(({ phase }) => phase === 'burning'));
  check('Bonfire dressing includes the authored drinks, whiskey, and cigarettes',
    fire.dressing.beerCans >= 1 && fire.dressing.whiskeyBottles >= 1 && fire.dressing.cigarettePacks >= 1,
    JSON.stringify(fire.dressing));
  await clearHands(page);
  await teleport(page, 'firepit', 'observe');
  await capture(page, '09-night-bonfire-bonding');
  await captureScene(page, '09-night-bonfire-clean');

  const blackoutStarted = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    runtime.story.completeFireCleanup();
    runtime.story.drink();
    runtime.chapter.dialogue.stop?.();
    runtime.chapter.beatQueue.length = 0;
    return runtime.chapter._blackout();
  });
  check('Fire bonding can enter the authored blackout transition', blackoutStarted);
  await page.waitForFunction(() => (
    window.COUNTRYSIDE_CABIN.story.blackedOut()
      && window.COUNTRYSIDE_CABIN.state.resting === false
  ));
  const morning = await page.evaluate(() => {
    const runtime = window.COUNTRYSIDE_CABIN;
    const wakeCheckpoint = {
      day: runtime.campaign.state.story.day,
      timeMinutes: runtime.campaign.state.story.timeMinutes,
      dark: runtime.time.isDark,
      player: runtime.player.position.toArray(),
      wake: runtime.cabin.spawns.wake.position.toArray(),
    };
    runtime.story.completeBillyCall();
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
   * Beat 7 ends at the Bing now: the wake lands at 09:33 on Day 4 with
   * Booski's call about Billy still owed, and `tryLeave` holds the car with
   * `cabin_wait` until it comes. Measured, not assumed. */
  check('The morning wake leaves Booski’s call owed, and the car still gated',
    !morning.chapterComplete && morning.phase === 'billy_call'
      && morning.leave.kind === 'stay' && morning.leave.id === 'cabin_wait'
      && morning.day === 4 && morning.timeMinutes === 573,
    `phase ${morning.phase}, complete ${morning.chapterComplete}, `
      + `door ${JSON.stringify(morning.leave)}, day ${morning.day}, minute ${morning.timeMinutes}`);
  check('Booski’s call about Billy closes the chapter and points the car at the Bing',
    morning.afterBillyCall.rang && morning.afterBillyCall.chapterComplete
      && morning.afterBillyCall.leave.kind === 'go'
      && morning.afterBillyCall.leave.destination === 'bada_bing_two',
    JSON.stringify(morning.afterBillyCall));
  await capture(page, '10-morning-wake');

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
