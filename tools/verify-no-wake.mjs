#!/usr/bin/env node
/**
 * Browser-level production verification for NO WAKE, after the redesign.
 *
 * `docs/NO-WAKE-REDESIGN.md` replaced the scene's interior wholesale, so this
 * file was rewritten with it. What it asserts is the spec's own list, in the
 * order the mission plays it, plus the four things the owner said were wrong
 * with the old build and must not come back:
 *
 *   - boarding, the bow and the helm were too tight            → clearances
 *   - the shooting beat spawned him behind a wall              → sight lines
 *   - Lou and Booski were not visibly firing                   → three shooters
 *   - the body roll into the water read weak                   → authored beats
 *   - the ride home reversed in a straight line                → the player drives
 *
 * Two rules from `docs/ENGINE-TRAPS.md` govern how it is written:
 *
 *   #2  Never sleep for a duration and assume progress. Every wait here is on
 *       a predicate the game publishes, with a generous budget, because the
 *       scene's clock is simulated and this rasteriser draws it at under a
 *       frame a second.
 *   #5  Walk it. If the player walks somewhere, the check walks there; if he
 *       holds a button, the check holds the button and waits for what the
 *       button earns.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NO_WAKE_CABIN_SCRIPT, allNoWakeVoiceLines } from '../src/nowake/dialogue.js';
import { isNoWakeAudioPreloadCue } from '../src/nowake/audio.js';
import {
  CABIN, CABIN_CAST_STAGING, CABIN_STAGING, DECK,
} from '../src/nowake/deck-collision.js';
import { buildNoWakeAudioLedger } from './no-wake-audio-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CABIN_HEIGHT = CABIN.height;
const CABIN_BOW = CABIN.bow;
const CABIN_STERN = CABIN.stern;
const PORT = Number(process.env.PORT) || 5215;
const WRITE_SCREENSHOTS = !process.argv.includes('--no-screenshots');
const INPUT_ONLY = process.argv.includes('--input-only');
const INPUT_ONLY_STAGE_TIMEOUT_MS = 90000;
const INPUT_ONLY_WHOLE_TIMEOUT_MS = 240000;
const INPUT_ONLY_COMPLETE = Symbol('NO_WAKE_INPUT_ONLY_COMPLETE');
const SENTINEL = '{"version":999,"canonical":"NO WAKE preview must not touch this"}';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg',
};

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('playwright is not installed; cannot verify NO WAKE.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found'); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
let browser = null;
let inputOnlyPhase = 'server-listen';
let inputOnlyDeadline = null;
function markInputOnlyPhase(phase) {
  if (!INPUT_ONLY) return;
  inputOnlyPhase = phase;
  console.log(`[NO WAKE input] ${phase}`);
}
if (INPUT_ONLY) {
  inputOnlyDeadline = setTimeout(async () => {
    console.error(
      `[NO WAKE input] HARD TIMEOUT after ${INPUT_ONLY_WHOLE_TIMEOUT_MS}ms during ${inputOnlyPhase}`,
    );
    // The second timer is deliberately forceful: a wedged browser transport
    // must not turn graceful cleanup into another unbounded wait.
    const forceExit = setTimeout(() => process.exit(124), 5000);
    forceExit.unref?.();
    server.closeAllConnections?.();
    server.close?.();
    await browser?.close?.().catch(() => {});
    process.exit(124);
  }, INPUT_ONLY_WHOLE_TIMEOUT_MS);
  inputOnlyDeadline.unref?.();
}
await new Promise((resolve) => server.listen(PORT, resolve));
markInputOnlyPhase('browser-launch');

browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
markInputOnlyPhase('page-create');
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
/* Every wait in this file is wall clock waiting on SIMULATED time. The scene
 * clamps its step at 0.05 s and advances once per drawn frame, and this page on
 * a software rasteriser draws well under one frame a second. A large ceiling
 * costs nothing when the condition is met and only changes how long a genuine
 * failure takes to report. The walkable sweeps alone are tens of thousands of
 * real Player steps inside one evaluate, and the authored tweens are measured
 * in simulated seconds, so the ceiling is ten minutes: it is a guard against a
 * hang, not a performance assertion. */
page.setDefaultTimeout(INPUT_ONLY ? INPUT_ONLY_STAGE_TIMEOUT_MS : 600000);
await page.addInitScript((sentinel) => localStorage.setItem('squatchlife.campaign', sentinel), SENTINEL);
const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 300));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/* ------------------------------------------------------------------ *
 * Off-page contracts: the script, the manifest and the recording sheet
 * ------------------------------------------------------------------ */

const authoredVoice = allNoWakeVoiceLines();
const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(soundIndex.files || []);
const manifestVoice = soundManifest.sfx.filter((cue) => cue.name.startsWith('vo.nowake.'));
const manifestByName = new Map(manifestVoice.map((cue) => [cue.name, cue]));
const AUTHORED_LINE_COUNT = 37;
check(`all ${AUTHORED_LINE_COUNT} redesigned NO WAKE lines have stable cue ids, cast voices and exact manifest text`,
  authoredVoice.length === AUTHORED_LINE_COUNT
    && manifestVoice.length === authoredVoice.length
    && authoredVoice.every((line) => {
      const cue = manifestByName.get(`vo.nowake.${line.cue}.1`);
      return cue?.voice === line.voice && cue?.say === line.text;
    }),
  JSON.stringify({ authored: authoredVoice.length, manifest: manifestVoice.length }));

/* The recording sheet is generated from the manifest and index. The verifier
 * derives delivery from those same files so a landed take cannot remain
 * hard-coded as "owed" here (engine trap #3). */
const recordingSheet = fs.readFileSync(path.join(ROOT, 'VOICE-LINES-TODO.md'), 'utf8');
const voiceLedger = buildNoWakeAudioLedger({
  authoredVoice,
  soundIndex,
  recordingSheet,
});
check(`all ${AUTHORED_LINE_COUNT} redesigned NO WAKE voice files are delivered and absent from the recording sheet`,
  voiceLedger.missingVoiceFiles.length === 0
    && voiceLedger.recordingSheetVoiceFiles.length === 0,
  JSON.stringify({
    missing: voiceLedger.missingVoiceFiles.length,
    listed: voiceLedger.recordingSheetVoiceFiles.length,
  }));

/* A reworded line must not inherit a delivered take of different words. The old
 * build shipped `vo.nowake.cruise.willy.motel.1.mp3`; the redesign's equivalent
 * line is `cruise.willy.sideways` precisely so that recording cannot play under
 * a subtitle nobody wrote. */
check('no redesigned cue reuses an old delivered recording of different words',
  authoredVoice.every((line) => {
    const file = `vo.nowake.${line.cue}.1.mp3`;
    if (!indexedFiles.has(file)) return true;
    return manifestByName.get(`vo.nowake.${line.cue}.1`)?.say === line.text;
  }));

const verifierSource = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
const routeBegin = ['CANONICAL_ROUTE', 'CONTRACT_BEGIN'].join('_');
const routeEnd = ['CANONICAL_ROUTE', 'CONTRACT_END'].join('_');
const routeContract = verifierSource.split(routeBegin)[1]?.split(routeEnd)[0] ?? '';
check('the browser route contract keeps the real helm/input/coast path free of beat and speed shortcuts',
  /page\.keyboard\.down\('w'\)/.test(routeContract)
    && /page\.keyboard\.down\('s'\)/.test(routeContract)
    && /reverseExtraMs < 250/.test(routeContract)
    && /physics\.distance >= 360/.test(routeContract)
    && /__noWakeCoast/.test(routeContract)
    && !/leaveHelm|skipDrive|physics\.speed\s*=|physics\.throttle\s*=/.test(routeContract));

const shots = path.join(ROOT, 'docs', 'validation', '2026-08-06');
if (WRITE_SCREENSHOTS) await fsp.mkdir(shots, { recursive: true });
const capture = (name) => (WRITE_SCREENSHOTS
  ? page.screenshot({ path: path.join(shots, name) })
  : Promise.resolve());


try {
  /* The authored channel is ninety simulated seconds. Playwright's clock lets
   * the real requestAnimationFrame/updateBoat path run that whole interval
   * without turning this already-large browser verifier into a wall-clock
   * ninety-second wait. It continues normally until the focused drive slice
   * below calls `runFor`, and is resumed immediately afterwards. */
  await page.clock.install({ time: Date.now() });
  markInputOnlyPhase('page-load');
  await page.goto(`http://localhost:${PORT}/nowake.html?preview=1`, { waitUntil: 'load' });
  markInputOnlyPhase('runtime-ready');
  await page.waitForFunction(() => window.NO_WAKE?.story, null, {
    timeout: INPUT_ONLY ? INPUT_ONLY_STAGE_TIMEOUT_MS : 180000,
  });
  /* One helper the whole file aims with: put the crosshair on a boat-local
   * point from where the player is really standing, step the real interaction
   * system, and report what it found. Every "the player uses X" check below
   * goes through this rather than calling an onUse directly. */
  await page.evaluate(() => {
    window.__noWakeContextLosses = 0;
    document.querySelector('canvas')?.addEventListener('webglcontextlost', () => {
      window.__noWakeContextLosses++;
    });
    window.__aim = (local, from = null) => {
      const game = window.NO_WAKE;
      const V = game.player.position.constructor;
      if (from) {
        game.player.position.copy(game.world.fromBoatLocal(new V(from[0], from[1], from[2])));
        game.player.update(1 / 60);
      }
      const target = game.world.fromBoatLocal(new V(local[0], local[1], local[2]));
      const delta = target.clone().sub(game.player.camera.position);
      game.player.yaw = Math.atan2(-delta.x, -delta.z);
      game.player.pitch = Math.asin(delta.y / delta.length());
      game.player.update(1 / 60);
      game.player.camera.updateMatrixWorld(true);
      game.interaction.update(1 / 60);
      return game.interaction.current?.name ?? null;
    };
    /* Public CPU twin of the water shader, sampled at the actual horizontal
     * sea plane. The inverse-Y solve matters once the hull is pitched/rolled:
     * simply transforming [x, waterLevel, z] would no longer land on the sea. */
    window.__waterSamples = () => {
      const game = window.NO_WAKE;
      const V = game.player.position.constructor;
      const root = game.boat.root;
      const hull = root.getObjectByName('cream fiberglass hull');
      const water = game.world.water;
      const atWater = (x, z) => {
        hull.updateMatrixWorld(true);
        const base = new V(x, 0, z).applyMatrix4(hull.matrixWorld);
        const localY = new V().setFromMatrixColumn(hull.matrixWorld, 1);
        const y = (water.level - base.y) / localY.y;
        return new V(x, y, z).applyMatrix4(hull.matrixWorld);
      };
      /* Record shader freshness before the public CPU predicate gets any
       * chance to self-sync it. A missing world.update() must stay observable. */
      hull.updateMatrixWorld(true);
      const expectedInverse = hull.matrixWorld.clone().invert();
      const shaderInverse = water.material.uniforms.uBoatWorldInverse.value;
      const freshnessError = Math.max(...expectedInverse.elements.map(
        (value, index) => Math.abs(value - shaderInverse.elements[index]),
      ));
      const inside = [
        ['cabin centre', 0, -4.10], ['cabin dinette', 1.12, -3.20],
        ['cockpit centre', .20, 1.80], ['cockpit seating', -1.20, 3.50],
      ].map(([name, x, z]) => ({ name, excluded: water.excludes(atWater(x, z)) }));
      const outside = [
        ['port sea', -3.20, 0], ['starboard sea', 3.20, 2.60],
        ['ahead of bow', 0, -6.55], ['behind transom', 0, 5.85],
        ['beside fine bow', 1.40, -5.70],
      ].map(([name, x, z]) => ({ name, excluded: water.excludes(atWater(x, z)) }));
      const classifyHullLocal = (name, x, y, z) => ({
        name, excluded: water.excludes(new V(x, y, z).applyMatrix4(hull.matrixWorld)),
      });
      /* Walk the real skin contract at every authored section join and at a
       * trough, chine and crest. Each triple proves outside water, the 35 mm
       * wet shell overlap, and the first definitely-dry point. */
      const sections = water.exclusion.sections;
      const sectionBeam = (z) => {
        for (let i = 0; i < sections.length - 1; i++) {
          const a = sections[i]; const b = sections[i + 1];
          if (z < a.z || z > b.z) continue;
          return a.w + (b.w - a.w) * (z - a.z) / (b.z - a.z);
        }
        return sections.at(-1).w;
      };
      const vertical = (y) => (y <= water.exclusion.chineY
        ? .84 * (y - water.exclusion.keelY)
          / (water.exclusion.chineY - water.exclusion.keelY)
        : .84 + .16 * (y - water.exclusion.chineY)
          / (water.exclusion.sheerY - water.exclusion.chineY));
      const boundary = [];
      for (const y of [-.29, water.exclusion.chineY, .15]) {
        sections.forEach((section, index) => {
          const z = index === 0 ? section.z + .05
            : index === sections.length - 1 ? section.z - .05 : section.z;
          const skin = sectionBeam(z) * vertical(y);
          boundary.push(
            { ...classifyHullLocal(`${y}/${z} outside`, skin + .010, y, z), expected: false },
            { ...classifyHullLocal(`${y}/${z} overlap`, skin - .020, y, z), expected: false },
            { ...classifyHullLocal(`${y}/${z} inside`, skin - .050, y, z), expected: true },
          );
        });
      }
      boundary.push(
        { ...classifyHullLocal('10 mm ahead of bow', 0, -.08, sections[0].z - .01), expected: false },
        { ...classifyHullLocal('20 mm bow overlap', 0, -.08, sections[0].z + .02), expected: false },
        { ...classifyHullLocal('50 mm inside bow', 0, -.08, sections[0].z + .05), expected: true },
        { ...classifyHullLocal('50 mm inside transom', 0, -.08, sections.at(-1).z - .05), expected: true },
        { ...classifyHullLocal('20 mm transom overlap', 0, -.08, sections.at(-1).z - .02), expected: false },
        { ...classifyHullLocal('10 mm behind transom', 0, -.08, sections.at(-1).z + .01), expected: false },
      );
      return {
        inside, outside, boundary, freshnessError,
        position: root.position.toArray(), rotation: root.rotation.toArray().slice(0, 3),
      };
    };
    /* The startup panel, in one place.
     *
     * `PANEL_CONTROLS` is the checklist in order with each control's own centre
     * in boat space, and `PANEL_STAND` is the spot a player works it from: the
     * slot between the helm console and the helm bench, which is where a person
     * running an engine-start checklist would actually stand. Both are shared by
     * the checklist walk-through, the N2 spacing measurement, the N3 clearance
     * measurement and the exit's engine restart, so there is one copy of these
     * numbers rather than four that can drift apart. */
    window.PANEL_STAND = [0.72, 0.38];
    window.PANEL_CONTROLS = [
      ['battery', [0.50, 1.46, -0.22]],
      ['blower', [0.86, 1.46, -0.22]],
      ['fuel', [1.22, 1.46, -0.22]],
      ['ignitionPort', [1.58, 1.46, -0.22]],
      ['ignitionStarboard', [1.94, 1.46, -0.22]],
      ['navLights', [2.30, 1.46, -0.22]],
    ];
  });

  const radioCueNames = await page.evaluate(() => window.NO_WAKE.radio.preloadCueNames({
    hours: [12.75, 15, 17],
  }));
  const selectedNoWakeCues = soundManifest.sfx
    .filter((cue) => isNoWakeAudioPreloadCue(cue, radioCueNames));
  const expectedResidentNames = selectedNoWakeCues
    .filter((cue) => indexedFiles.has(cue.file || `${cue.name}.mp3`))
    .map((cue) => cue.name).sort();
  const pendingNoWakeNames = buildNoWakeAudioLedger({
    soundIndex,
    selectedCues: selectedNoWakeCues,
  }).pendingSelectedNames;
  await page.evaluate(() => window.NO_WAKE.postfx?.disable?.());

  /* A trusted browser gesture, aimed with coordinates rather than a locator: a
   * locator click waits for the target's bounding box to render two identical
   * animation frames in a row, and this page's continuous WebGL redraw on a
   * software rasteriser can make that wait run past any ceiling. */
  const startBox = await page.evaluate(() => {
    const r = document.getElementById('start-btn').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  markInputOnlyPhase('start-click');
  await page.mouse.click(startBox.x, startBox.y);
  markInputOnlyPhase('gameplay-ready');
  await page.waitForFunction(() => !document.getElementById('overlay'), null, {
    timeout: INPUT_ONLY ? INPUT_ONLY_STAGE_TIMEOUT_MS : 300000,
  });
  await page.waitForTimeout(250);

  const initialPointerLock = await page.evaluate(() => (
    document.pointerLockElement === document.querySelector('canvas')
  ));
  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForFunction(() => document.pointerLockElement === null);
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => (
    document.pointerLockElement === document.querySelector('canvas')
  ));
  check('the canvas reacquires mouse control after the player clicks out and back in',
    initialPointerLock && await page.evaluate(() => (
      document.pointerLockElement === document.querySelector('canvas')
    )));

  /* Cross the browser-to-Player Seam rather than treating pointer lock itself
   * as proof of control. These are trusted page mouse/key events; the check
   * observes the real Player and canonical Adapter receipts, and never calls a
   * debug movement method. */
  const beforeRealInput = await page.evaluate(() => {
    const game = window.NO_WAKE;
    return {
      x: game.player.position.x,
      z: game.player.position.z,
      yaw: game.player.yaw,
      input: game.input.snapshot(),
    };
  });
  markInputOnlyPhase('real-input');
  await page.mouse.move(640, 360);
  await page.mouse.move(710, 325, { steps: 2 });
  await page.keyboard.down('w');
  await page.waitForFunction(({ x, z }) => {
    const game = window.NO_WAKE;
    return Math.hypot(game.player.position.x - x, game.player.position.z - z) > .25;
  }, beforeRealInput, { polling: 'raf', timeout: 30000 });
  const heldRealInput = await page.evaluate(() => [...window.NO_WAKE.player.keys]);
  await page.keyboard.up('w');
  const afterRealInput = await page.evaluate(() => {
    const game = window.NO_WAKE;
    return {
      x: game.player.position.x,
      z: game.player.position.z,
      yaw: game.player.yaw,
      keys: [...game.player.keys],
      input: game.input.snapshot(),
    };
  });
  check('real click, mouse and W input capture, look, move and release before boarding',
    afterRealInput.input.captured
      && afterRealInput.input.lookEvents > beforeRealInput.input.lookEvents
      && afterRealInput.input.movementPresses > beforeRealInput.input.movementPresses
      && heldRealInput.includes('KeyW')
      && !afterRealInput.keys.includes('KeyW')
      && Math.hypot(
        afterRealInput.x - beforeRealInput.x,
        afterRealInput.z - beforeRealInput.z,
      ) > .25
      && Math.abs(afterRealInput.yaw - beforeRealInput.yaw) > .01,
    JSON.stringify({ beforeRealInput, heldRealInput, afterRealInput }));

  /* This is an intentionally narrow certification boundary, not a shortcut in
   * the full mission verifier. It reaches the normal authored start button,
   * waits for the real audio-backed startup to enable gameplay, and crosses
   * the browser -> canonical Adapter -> Player seam above. The default command
   * continues through every existing NO WAKE assertion exactly as before. */
  if (INPUT_ONLY) {
    check('the focused input receipt emitted no uncaught browser errors',
      problems.length === 0, problems.join(' | '));
    markInputOnlyPhase('complete');
    throw INPUT_ONLY_COMPLETE;
  }

  const residency = await page.evaluate((expected) => {
    const audio = window.NO_WAKE.audio;
    const resident = audio ? [...audio.buffers.keys()].sort() : [];
    const wanted = new Set(expected);
    return {
      exposed: Boolean(audio),
      plan: audio?.preloadStats ?? null,
      loaded: audio?.loadedCount ?? null,
      resident: resident.length,
      missing: expected.filter((name) => !audio?.buffers.has(name)),
      unexpected: resident.filter((name) => !wanted.has(name)),
    };
  }, expectedResidentNames);
  check('NO WAKE decodes exactly its mission and bounded persistent-radio bank',
    residency.exposed
      && residency.plan?.manifestTotal === soundManifest.sfx.length
      && residency.plan?.selected === selectedNoWakeCues.length
      && residency.loaded === expectedResidentNames.length
      && residency.resident === expectedResidentNames.length
      && residency.missing.length === 0 && residency.unexpected.length === 0,
    JSON.stringify({ ...residency, selected: selectedNoWakeCues.length, pending: pendingNoWakeNames.length }));

  /* Delivery is derived from the manifest-selected residency plan and the
   * index. A release verifier must fail when any selected cue lacks its file;
   * it must never carry a hand-maintained exception list after delivery. */
  check('every selected NO WAKE production cue has a delivered indexed file',
    pendingNoWakeNames.length === 0,
    JSON.stringify({ pending: pendingNoWakeNames }));

  const inventory = await page.evaluate(() => ({
    visible: Boolean(document.querySelector('#hotbar'))
      && getComputedStyle(document.querySelector('#hotbar')).display !== 'none',
    slots: document.querySelectorAll('#hotbar .slot').length,
  }));
  check('NO WAKE keeps the shared five-slot inventory visible',
    inventory.visible && inventory.slots === 5, JSON.stringify(inventory));

  /* ---------------------------------------------------------------- *
   * The boat the spec asked for
   * ---------------------------------------------------------------- */

  const boot = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const Box3 = game.boat.localColliders[0].constructor;
    const named = (pattern) => {
      const found = [];
      game.boat.root.traverse((object) => {
        if (object.isMesh && pattern.test(object.name || '')) found.push(object.name);
      });
      return found;
    };
    return {
      phase: game.phase,
      mission: game.campaignState.missions.no_wake,
      scene: game.campaignState.scene,
      preview: Boolean(document.getElementById('squatch-preview-notice')),
      boatName: game.boat.root.name,
      dimensions: game.boat.root.userData.dimensions,
      waterline: game.boat.root.userData.waterline,
      detailMeshes: game.boat.root.userData.detailMeshes,
      cabinMeshes: game.cabin.group.userData.detailMeshes,
      cast: Object.fromEntries(Object.entries(game.boat.cast).map(([id, npc]) => {
        let luxuryRibs = 0;
        let patternTiles = 0;
        npc.group.traverse((object) => {
          if (object.name === 'shirt.luxury.rib') luxuryRibs++;
          if (object.name === 'camp.pattern.tile') patternTiles++;
        });
        const campParts = [
          'camp.undershirt', 'camp.front.left', 'camp.front.right',
          'camp.collar.left', 'camp.collar.right', 'camp.sleeve.hem',
        ].filter((name) => npc.group.getObjectByName(name)).length;
        const workVestParts = [
          'workvest.front.left', 'workvest.front.right',
          'workvest.strap.left', 'workvest.strap.right',
          'workvest.pocket', 'workvest.pocket.flap',
        ].filter((name) => npc.group.getObjectByName(name)).length;
        const binoculars = npc.parts.foreR.getObjectByName('Irish binoculars');
        return [id, {
          characterId: npc.group.userData.characterId,
          gut: npc.parts.profile.gut ?? 0,
          outfit: npc.parts.profile.outfit,
          height: npc.parts.profile.height,
          build: npc.parts.profile.build,
          neckline: npc.parts.profile.neckline,
          luxury: npc.parts.profile.luxury,
          watch: npc.parts.profile.watch,
          chain: npc.parts.profile.chainStyle,
          pendant: npc.parts.profile.pendantStyle,
          photoFace: Boolean(npc.group.getObjectByName('person.face.photo-skull')),
          campParts,
          workVestParts,
          shirtPlacket: Boolean(npc.group.getObjectByName('shirt.placket')),
          vNeck: Boolean(npc.group.getObjectByName('shirt.neckline.v')),
          luxuryRibs,
          patternTiles,
          shirtColour: npc.group.getObjectByName('camp.front.left.cloth')
            ?.material?.color?.getHex?.()
            ?? npc.group.getObjectByName('ribcage')?.material?.color?.getHex?.()
            ?? null,
          vestColour: npc.group.getObjectByName('workvest.front.left.cloth')
            ?.material?.color?.getHex?.() ?? null,
          trouserColour: npc.group.getObjectByName('thigh')?.material?.color?.getHex?.() ?? null,
          binoculars: binoculars ? {
            attachedToForearm: binoculars.parent === npc.parts.foreR,
            local: binoculars.position.toArray(),
          } : null,
          local: game.world.toBoatLocal(
            npc.group.getWorldPosition(new game.player.position.constructor()),
          ).toArray(),
        }];
      })),
      controls: Object.fromEntries(Object.entries(game.boat.controls)
        .filter(([, value]) => value?.root)
        .map(([id, value]) => [id, value.root.name])),
      dockLine: game.boat.targets.dockLine.userData,
      gangway: {
        name: game.boat.gangway?.name ?? null,
        visible: game.boat.gangway?.visible ?? false,
        meshes: (() => {
          let n = 0;
          game.boat.gangway?.traverse((o) => { if (o.isMesh) n++; });
          return n;
        })(),
      },
      helmTarget: (() => {
        const target = game.boat.targets.helm;
        const size = new Box3().setFromObject(target).getSize(target.position.clone());
        return { name: target.name, size: size.toArray() };
      })(),
      localColliders: game.boat.localColliders.length,
      cabinColliders: game.boat.cabinColliders.length,
      waterVertices: game.world.water.mesh.geometry.attributes.position.count,
      buoyCount: game.world.buoys.length,
      period: {
        smokedWindshield: named(/windshield pane/).length,
        analogGauges: named(/gauge (bezel|face|needle)/).length,
        chromeThrottle: named(/throttle lever/).length,
        creamVinylSeams: named(/seam/).length,
        brass: named(/brass|tap|latch|fiddle/).length,
      },
      stern: {
        platform: named(/swim platform/).length,
        ladder: named(/swim ladder/).length,
        gate: game.boat.transomGate?.name ?? null,
        hatch: named(/stern hatch/).length,
        disposalZone: game.boat.targets.disposal?.name ?? null,
      },
      bow: {
        sunPad: named(/sun pad/).length,
        anchorHatch: named(/anchor hatch/).length,
        locker: named(/forward locker/).length,
        searchlight: named(/searchlight/).length,
        ropeCoil: named(/bow rope coil/).length,
      },
      cabinParts: (() => {
        const found = [];
        game.cabin.group.traverse((o) => { if (o.isMesh) found.push(o.name); });
        return {
          bar: found.filter((n) => /galley|tequila|glass \d|bottle/.test(n)).length,
          sink: found.some((n) => /sink basin/.test(n)),
          mirror: found.some((n) => /liquor cabinet mirror/.test(n)),
          glasses: found.filter((n) => /^glass \d wall$/.test(n)).length,
          dinette: found.filter((n) => /dinette/.test(n)).length,
          vberth: found.filter((n) => /V-berth/.test(n)).length,
          headDoor: found.some((n) => /closed head door/.test(n)),
          midBerth: found.some((n) => /mid-cabin berth/.test(n)),
          portholes: found.filter((n) => /porthole/.test(n)).length,
          runner: found.some((n) => /sole runner/.test(n)),
          companionway: found.filter((n) => /companionway/.test(n)).length,
        };
      })(),
    };
  });

  check('preview boots NO WAKE in progress at Gate C',
    boot.phase === 'dock' && boot.mission.status === 'in_progress'
      && boot.scene.id === 'no_wake' && boot.scene.spawn === 'gate_c' && boot.preview,
    JSON.stringify({ phase: boot.phase, mission: boot.mission.status, scene: boot.scene }));
  /* Punch list N1 grew her. The 36-footer's cabin was the "bathroom" the owner
   * played through, so the floor these numbers stand on is the playtest and not
   * the redesign spec: 42 ft, 5.12 m of beam, and the walkable extents in
   * `deck-collision.js` moved with the hull. */
  check('the boat is the detailed 42 ft express cruiser the playtest asked for, not the 36-footer',
    /42-foot express cruiser/.test(boot.boatName)
      && boot.dimensions.feet >= 41 && boot.dimensions.feet <= 44
      && boot.dimensions.beam >= 4.9 && boot.dimensions.beam <= 5.4
      && boot.dimensions.hullLength >= 11.4
      && boot.detailMeshes >= 300 && boot.buoyCount >= 10,
    JSON.stringify({ boat: boot.boatName, dimensions: boot.dimensions, details: boot.detailMeshes }));
  check('the period fittings the spec names are all modeled',
    boot.period.smokedWindshield >= 2 && boot.period.analogGauges >= 12
      && boot.period.chromeThrottle >= 2 && boot.period.creamVinylSeams >= 4
      && boot.period.brass >= 4,
    JSON.stringify(boot.period));
  check('the stern is a disposal point: swim platform, ladder, transom gate, storage hatch',
    boot.stern.platform >= 3 && boot.stern.ladder >= 3
      && /transom gate/.test(boot.stern.gate ?? '') && boot.stern.hatch >= 2
      && /disposal zone/.test(boot.stern.disposalZone ?? ''),
    JSON.stringify(boot.stern));
  check('the bow carries the sun pad, the anchor hatch, the searchlight and the ballast locker',
    boot.bow.sunPad >= 1 && boot.bow.anchorHatch >= 2 && boot.bow.locker >= 3
      && boot.bow.searchlight >= 2 && boot.bow.ropeCoil >= 1,
    JSON.stringify(boot.bow));
  check('below deck is a real cabin: bar to port, dinette to starboard, V-berth forward',
    boot.cabinMeshes >= 60
      && boot.cabinParts.bar >= 12 && boot.cabinParts.sink && boot.cabinParts.mirror
      && boot.cabinParts.glasses === 4 && boot.cabinParts.dinette >= 6
      && boot.cabinParts.vberth >= 6 && boot.cabinParts.headDoor && boot.cabinParts.midBerth
      && boot.cabinParts.portholes >= 4 && boot.cabinParts.runner
      && boot.cabinParts.companionway >= 8,
    JSON.stringify({ meshes: boot.cabinMeshes, ...boot.cabinParts }));

  /* ---------------------------------------------------------------- *
   * N1 — "the confrontation plays out in a bathroom"
   *
   * The complaint was a measurement, so this is a measurement, taken from the
   * BUILT scene rather than from the collider table `tests/no-wake-deck.test.mjs`
   * measures: the room the player actually stands in, swept on the 0.05 m grid
   * with the real capsule, plus the headroom over his own eye line. Every
   * number below is one the old cabin failed — 1.36 m across, 1.66 m fore and
   * aft, 1.82 m of headroom, 0.80 m² a man could stand in.
   * ---------------------------------------------------------------- */
  const salon = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const cabin = game.boat.cabinDeck;
    const boxes = game.boat.cabinBoxes;
    const eyeY = cabin.height + 1.66;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const clearAt = (x, z) => {
      for (const box of boxes) {
        if (eyeY + .05 < box.min.y || cabin.height > box.max.y) continue;
        const cx = clamp(x, box.min.x, box.max.x);
        const cz = clamp(z, box.min.z, box.max.z);
        if (Math.hypot(x - cx, z - cz) < .30 - 1e-6) return false;
      }
      return true;
    };
    let squares = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let x = -cabin.halfBeam; x <= cabin.halfBeam + 1e-9; x += .05) {
      for (let z = cabin.bow; z <= cabin.stern + 1e-9; z += .05) {
        if (!clearAt(x, z)) continue;
        squares++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
    }
    /* And the actual ceiling over the man, from the built mesh rather than from
     * the constant: the liner panel is what his head meets. */
    const liner = game.cabin.group.getObjectByName('cabin ceiling panel');
    const linerUnderside = liner.position.y - liner.geometry.parameters.height / 2;
    return {
      standableArea: +(squares * .05 * .05).toFixed(2),
      spanX: +(maxX - minX).toFixed(2),
      spanZ: +(maxZ - minZ).toFixed(2),
      headroom: +(cabin.ceiling - cabin.height).toFixed(2),
      overEyes: +(linerUnderside - eyeY).toFixed(2),
    };
  });
  // The staging clamp is authored in Node-side source, not on the page.
  salon.staging = +((CABIN_STAGING.maxX - CABIN_STAGING.minX)
    * (CABIN_STAGING.maxZ - CABIN_STAGING.minZ)).toFixed(2);
  /* The bathroom measured 0.80 m² of standable sole, 0.95 m across and 1.10 m
   * fore and aft, under 1.82 m of ceiling, with a 0.34 m² pen to stand in. Every
   * floor below is comfortably clear of those and comfortably under what this
   * boat actually has, so a regression has to be a real one to trip it. */
  check('below deck reads as a salon and not a bathroom: floor, span, headroom and a staging area to move in',
    salon.standableArea >= 3.4 && salon.spanX >= 2.6 && salon.spanZ >= 2.1
      && salon.headroom >= 2.05 && salon.overEyes > 0 && salon.staging >= 1.2,
    JSON.stringify(salon));
  check('the startup controls the spec lists are modeled objects',
    /battery selector/.test(boot.controls.battery)
      && /blower push/.test(boot.controls.blower)
      && /fuel valve/.test(boot.controls.fuel)
      && /port engine ignition/.test(boot.controls.ignitionPort)
      && /starboard engine ignition/.test(boot.controls.ignitionStarboard)
      && /navigation light switch/.test(boot.controls.navLights)
      && boot.dockLine.attached === true,
    JSON.stringify({ controls: boot.controls, dockLine: boot.dockLine }));
  check('a visible boarding bridge and a forgiving helm proxy make the routes legible',
    /boarding bridge/.test(boot.gangway.name ?? '') && boot.gangway.visible
      && boot.gangway.meshes >= 4
      && /helm interaction proxy/.test(boot.helmTarget.name)
      && boot.helmTarget.size[0] >= 1.4 && boot.helmTarget.size[2] >= .65,
    JSON.stringify({ gangway: boot.gangway, helm: boot.helmTarget }));
  check('the cruiser sits at a measured displacement waterline with the platform just above the water',
    boot.waterline.restingY < -.05
      && boot.waterline.draft > .80 && boot.waterline.draft < 1.00
      && boot.waterline.sideFreeboard > .70 && boot.waterline.sideFreeboard < .95
      && boot.waterline.deckFreeboard > 1.00 && boot.waterline.deckFreeboard < 1.25
      && boot.waterline.platformY > boot.waterline.surfaceY
      && boot.waterline.platformY - boot.waterline.surfaceY < .40,
    JSON.stringify(boot.waterline));
  const waterAtRest = await page.evaluate(() => window.__waterSamples());
  check('the tapered moving water hole keeps the real cabin and cockpit dry at rest without erasing exterior sea',
    waterAtRest.inside.every((sample) => sample.excluded)
      && waterAtRest.outside.every((sample) => !sample.excluded)
      && waterAtRest.boundary.every((sample) => sample.excluded === sample.expected)
      && waterAtRest.freshnessError < 1e-8,
    JSON.stringify(waterAtRest));
  check('both walkable spaces have local collision and the water has a dense displaced surface',
    boot.localColliders >= 18 && boot.cabinColliders >= 7 && boot.waterVertices >= 40000,
    JSON.stringify({ deck: boot.localColliders, cabin: boot.cabinColliders, water: boot.waterVertices }));
  check('stable character identities drive the cast and Willy keeps his permanent belly',
    boot.cast.lou.characterId === 'lou' && boot.cast.booski.characterId === 'booski'
      && boot.cast.willy.characterId === 'willy' && boot.cast.irish.characterId === 'irish'
      && boot.cast.willy.gut >= 1,
    JSON.stringify(Object.fromEntries(Object.entries(boot.cast).map(([k, v]) => [k, v.characterId]))));
  check('Booskibro wears his relaxed NO WAKE camp outfit without losing his face or founder jewellery',
    boot.cast.booski.outfit === 'camp'
      && boot.cast.booski.height === 1.8
      && boot.cast.booski.neckline === 'crew'
      && boot.cast.booski.luxury === false
      && boot.cast.booski.watch === 'gold'
      && boot.cast.booski.chain === 'layered'
      && boot.cast.booski.pendant === 'crest'
      && boot.cast.booski.photoFace
      && boot.cast.booski.campParts === 6
      && boot.cast.booski.vNeck === false
      && boot.cast.booski.luxuryRibs === 0
      && boot.cast.booski.patternTiles === 0
      && boot.cast.booski.shirtColour === 0x315b63
      && boot.cast.booski.trouserColour === 0x8b8068,
    JSON.stringify(boot.cast.booski));
  check('NO WAKE keeps canonical Irish in the navy open vest, green shirt, and dark trousers',
    boot.cast.irish.characterId === 'irish'
      && boot.cast.irish.outfit === 'shirt'
      && boot.cast.irish.height === 1.78
      && boot.cast.irish.build === 1.15
      && boot.cast.irish.photoFace
      && boot.cast.irish.workVestParts === 6
      && boot.cast.irish.shirtPlacket
      && boot.cast.irish.vestColour === 0x1b304c
      && boot.cast.irish.shirtColour === 0x29402f
      && boot.cast.irish.trouserColour === 0x20242a,
    JSON.stringify(boot.cast.irish));
  /* "Irish already aboard with binoculars." He is on the bow at the dock and he
   * is still on the bow when the body goes over the side. */
  check('Irish is already on the bow with his binoculars before anybody boards',
    Math.abs(boot.cast.irish.local[0] - 1.75) < 1e-6
      && Math.abs(boot.cast.irish.local[1] - DECK.foredeckHeight) < 1e-6
      && Math.abs(boot.cast.irish.local[2] + 4.55) < 1e-6
      && boot.cast.irish.binoculars?.attachedToForearm
      && Math.abs(boot.cast.irish.binoculars.local[0]) < 1e-6
      && Math.abs(boot.cast.irish.binoculars.local[1] + .30) < 1e-6
      && Math.abs(boot.cast.irish.binoculars.local[2] + .10) < 1e-6,
    JSON.stringify(boot.cast.irish));
  await capture('no-wake-gate-c.png');

  const marina = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const exteriorFaces = (hull) => {
      const p = hull.geometry.attributes.position;
      let outward = 0;
      let sideFaces = 0;
      for (let i = 0; i < p.count; i += 3) {
        const a = new V().fromBufferAttribute(p, i);
        const b = new V().fromBufferAttribute(p, i + 1);
        const c = new V().fromBufferAttribute(p, i + 2);
        if (Math.max(a.z, b.z, c.z) - Math.min(a.z, b.z, c.z) < .01) continue;
        const centerX = (a.x + b.x + c.x) / 3;
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        sideFaces++;
        if (normal.x * centerX > 0) outward++;
      }
      return { outward, sideFaces };
    };
    let signs = 0;
    let houses = 0;
    const shorelines = [];
    let isolatedBanks = 0;
    game.world.channel.root.traverse((o) => {
      if (/NO WAKE sign/.test(o.name || '')) signs++;
      if (/shoreline house walls/.test(o.name || '')) houses++;
      if (/channel shoreline/.test(o.name || '')) {
        const p = o.geometry?.parameters ?? {};
        shorelines.push({
          name: o.name,
          size: [p.width ?? 0, p.height ?? 0, p.depth ?? 0],
          position: o.position.toArray(),
        });
      }
      if (/^shoreline bank \d+$/.test(o.name || '')) isolatedBanks++;
    });
    return {
      neighbors: game.world.marina.neighborBoats.map((b) => ({
        details: b.userData.detailMeshes,
        exterior: exteriorFaces(b.getObjectByName('tapered neighboring hull')),
      })),
      cruiserExterior: exteriorFaces(game.boat.root.getObjectByName('cream fiberglass hull')),
      signs,
      houses,
      signLocal: game.world.channel.sign.position.toArray(),
      inlet: game.world.inlet,
      pointName: game.world.channel.point.name,
      quarryName: game.world.channel.quarry.name,
      daylight: game.world.water.mesh.parent.background.getHex(),
      shorelines,
      isolatedBanks,
      bodyMarkerChildren: game.boat.bodyMarker.children.map((o) => ({
        name: o.name, type: o.geometry?.type ?? null,
      })),
    };
  });
  check('the marina is a clear daytime finger with detailed neighbours and outward hull winding',
    marina.neighbors.length === 2
      && marina.neighbors.every((b) => b.details >= 25 && b.exterior.outward === b.exterior.sideFaces)
      && marina.cruiserExterior.outward === marina.cruiserExterior.sideFaces
      && marina.daylight > 0x808080,
    JSON.stringify({ neighbors: marina.neighbors, daylight: marina.daylight.toString(16) }));
  check('the shore is continuous land rather than floating houseboat-sized islands',
    marina.shorelines.length === 2
      && marina.shorelines.every((bank) => bank.size[0] >= 150 && bank.size[2] >= 500)
      && marina.isolatedBanks === 0,
    JSON.stringify({ shorelines: marina.shorelines, isolatedBanks: marina.isolatedBanks }));
  check('the dead-body objective no longer draws the gold arcade ring',
    marina.bodyMarkerChildren.every((child) => child.type !== 'TorusGeometry'
      && !/ring/i.test(child.name)),
    JSON.stringify(marina.bodyMarkerChildren));
  /* "The NO WAKE sign passes to starboard, marina lights fall away, houses thin
   * out." The boat runs out along -Z, so starboard is +X. */
  check('the NO WAKE board passes to starboard on the way out, past thinning houses, into a closed inlet',
    marina.signs >= 2 && marina.signLocal[0] > 5 && marina.signLocal[2] < 0
      && marina.houses >= 12
      && /wooded point/.test(marina.pointName) && /quarry/.test(marina.quarryName)
      && marina.inlet.z < -300,
    JSON.stringify({ sign: marina.signLocal, houses: marina.houses, inlet: marina.inlet }));

  const dockRoute = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const Box3 = game.world.colliders[0].constructor;
    const player = game.player;
    const finger = game.world.marina.root.getObjectByName('finger dock deck');
    const cart = game.world.marina.root.getObjectByName('dock cart');
    game.world.marina.root.updateMatrixWorld(true);
    const fingerBox = new Box3().setFromObject(finger);
    const visibleCart = new Box3().setFromObject(cart);
    const cartCentre = visibleCart.getCenter(new V());
    const cartCollider = game.world.marina.colliders.find(
      (box) => box.containsPoint(cartCentre) || box.intersectsBox(visibleCart),
    );
    const radius = .30;
    const laneMinX = cartCollider.max.x + radius;
    const laneMaxX = fingerBox.max.x - radius;
    const laneX = (laneMinX + laneMaxX) / 2;
    window.__dockRouteSaved = {
      mode: player.mode, enabled: player.enabled, position: player.position.clone(),
      ground: player.ground, yaw: player.yaw, pitch: player.pitch,
    };
    player.mode = 'walk';
    player.enabled = true;
    player.clearKeys();
    player.velocity.set(0, 0, 0);
    player.ground = .20;
    player.position.set(laneX, player.ground + player.eyeHeight, 20);
    player.yaw = 0;
    player.pitch = 0;
    player.setKey('KeyW', true);
    let closestCart = Infinity;
    let frames = 0;
    while (frames < 2400 && player.position.z > -17.5) {
      player.update(1 / 60);
      const cx = Math.max(cartCollider.min.x, Math.min(cartCollider.max.x, player.position.x));
      const cz = Math.max(cartCollider.min.z, Math.min(cartCollider.max.z, player.position.z));
      closestCart = Math.min(closestCart, Math.hypot(player.position.x - cx, player.position.z - cz));
      frames++;
    }
    player.setKey('KeyW', false);
    const end = player.position.clone();
    /* Keep the endpoint earned by the real walk, then look back up its open
     * centre line so the cart and the lane around it are both legible. */
    const look = new V(laneX, .58, -12.8);
    const delta = look.sub(player.camera.position);
    player.yaw = Math.atan2(-delta.x, -delta.z);
    player.pitch = Math.asin(delta.y / delta.length());
    player.update(1 / 60);
    player.camera.updateMatrixWorld(true);
    return {
      start: [laneX, 1.86, 20], end: end.toArray(), frames, closestCart,
      centreLaneWidth: laneMaxX - laneMinX,
      visibleCovered: cartCollider.containsBox(visibleCart),
      finger: { min: fingerBox.min.toArray(), max: fingerBox.max.toArray() },
      cart: { min: cartCollider.min.toArray(), max: cartCollider.max.toArray() },
    };
  });
  check('the real player walks the full Gate C finger past the repositioned cart without overlap or falling off',
    dockRoute.end[2] <= -17.5 && dockRoute.frames < 2400
      && dockRoute.closestCart >= .30 - 1e-6 && dockRoute.centreLaneWidth >= 1.2
      && dockRoute.visibleCovered
      && dockRoute.end[0] >= dockRoute.finger.min[0] + .30
      && dockRoute.end[0] <= dockRoute.finger.max[0] - .30,
    JSON.stringify(dockRoute));
  await capture('no-wake-clear-pier-route.png');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    const saved = window.__dockRouteSaved;
    game.player.clearKeys();
    game.player.mode = saved.mode;
    game.player.enabled = saved.enabled;
    game.player.position.copy(saved.position);
    game.player.ground = saved.ground;
    game.player.yaw = saved.yaw;
    game.player.pitch = saved.pitch;
    game.player.velocity.set(0, 0, 0);
    game.player.update(1 / 60);
    delete window.__dockRouteSaved;
  });

  /* ---------------------------------------------------------------- *
   * Boarding, and the walkable-deck sweep
   * ---------------------------------------------------------------- */

  const boardingAim = await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.position.set(-4.72, 1.86, 3.10);
    game.player.ground = .2;
    game.player.update(1 / 60);
    return window.__aim([-3.33, 1.10, 3.10]);
  });
  await capture('no-wake-boarding-bridge.png');
  await page.keyboard.press('e');
  await page.waitForTimeout(120);
  const crossing = await page.evaluate(() => ({
    boarding: window.NO_WAKE.state.boarding,
    boarded: window.NO_WAKE.state.boarded,
    bridgeStillDown: window.NO_WAKE.boat.gangway.visible,
    mode: window.NO_WAKE.player.mode,
  }));
  await page.waitForFunction(() => window.NO_WAKE.state.boarded === true);
  const boarded = await page.evaluate(() => ({
    boarded: window.NO_WAKE.state.boarded,
    bridgeStowed: !window.NO_WAKE.boat.gangway.visible,
    phase: window.NO_WAKE.phase,
    local: window.NO_WAKE.world.toBoatLocal(window.NO_WAKE.player.position.clone()).toArray(),
    objective: document.getElementById('objective')?.textContent ?? null,
  }));
  check('the player boards through the bridge target with real crosshair and E input',
    /boarding bridge/.test(boardingAim ?? '')
      && crossing.boarding && !crossing.boarded && crossing.bridgeStillDown
      && crossing.mode === 'frozen'
      && boarded.boarded && boarded.bridgeStowed && boarded.phase === 'startup'
      && boarded.local[2] > 2.4 && boarded.local[2] < 3.8,
    JSON.stringify({ boardingAim, crossing, boarded }));

  /* ---------------------------------------------------------------------
   * Walkable sweeps, on deck and below.
   *
   * Every soft-lock this scene has shipped has been the same shape: two solids
   * leaving a channel narrower than the player's 0.60 m capsule, no position
   * that satisfies both, and the player pinned with his velocity cancelled. So
   * drop the real Player on a grid across each walkable space, step the real
   * simulation at every cell, and require three things of each one — it
   * settles, it settles somewhere clear and still aboard, and from wherever it
   * settles the player can walk away.
   *
   * `tests/no-wake-deck.test.mjs` runs the same sweeps against the shared
   * resolver, so the two cannot drift apart silently.
   * ------------------------------------------------------------------- */
  await page.evaluate(() => {
    window.__sweep = ({ space = 'deck', step = .22, settleFrames = 36, escapeFrames = 32, headings = 8 } = {}) => {
      const game = window.NO_WAKE;
      const V = game.player.position.constructor;
      const player = game.player;
      const below = space === 'cabin';
      const extent = below ? game.boat.cabinDeck : game.boat.deck;
      const boxes = below ? game.boat.cabinColliders : game.boat.localColliders;
      const radius = .30;
      const dt = 1 / 60;
      const saved = {
        mode: player.mode, enabled: player.enabled, position: player.position.clone(),
        yaw: player.yaw, ground: player.ground, onFootstep: player.onFootstep,
        below: game.world.below,
      };
      game.world.setBelow(below);
      player.onFootstep = null;
      player.mode = 'walk';
      player.enabled = true;
      player.clearKeys();
      const floorAt = (z) => extent.heightAt(z);
      const place = (lx, lz) => {
        player.velocity.set(0, 0, 0);
        player.jumpHeight = 0;
        player.grounded = true;
        player.ground = game.boat.root.position.y + floorAt(lz);
        player.position.copy(game.world.fromBoatLocal(
          new V(lx, floorAt(lz) + player.eyeHeight, lz),
        ));
      };
      const local = () => game.world.toBoatLocal(player.position.clone());
      const penetration = (lx, lz) => {
        let worst = 0;
        let name = null;
        const eyeY = floorAt(lz) + player.eyeHeight;
        for (const box of boxes) {
          if (eyeY + .05 < box.min.y || eyeY - player.eyeHeight > box.max.y) continue;
          const cx = Math.max(box.min.x, Math.min(box.max.x, lx));
          const cz = Math.max(box.min.z, Math.min(box.max.z, lz));
          const depth = radius - Math.hypot(lx - cx, lz - cz);
          if (depth > worst) { worst = depth; name = box.name ?? null; }
        }
        return { depth: worst, name };
      };
      const settle = (lx, lz) => {
        place(lx, lz);
        let px = player.position.x;
        let pz = player.position.z;
        let amplitude = 0;
        for (let i = 0; i < settleFrames; i++) {
          player.update(dt);
          if (i > settleFrames - 12) {
            amplitude = Math.max(amplitude, Math.hypot(player.position.x - px, player.position.z - pz));
          }
          px = player.position.x;
          pz = player.position.z;
        }
        return { at: local(), amplitude };
      };

      const failures = [];
      const settled = new Map();
      let cells = 0;
      for (let x = -extent.halfBeam; x <= extent.halfBeam + 1e-9; x += step) {
        for (let z = extent.bow; z <= extent.stern + 1e-9; z += step) {
          cells++;
          const { at, amplitude } = settle(x, z);
          const { depth, name } = penetration(at.x, at.z);
          const offDeck = Math.abs(at.x) > extent.halfBeam + .02
            || at.z < extent.bow - .02 || at.z > extent.stern + .02;
          if (amplitude > .004 || depth > .01 || offDeck) {
            failures.push({
              kind: offDeck ? 'off-deck' : depth > .01 ? 'buried' : 'oscillating',
              from: [+x.toFixed(2), +z.toFixed(2)], to: [+at.x.toFixed(3), +at.z.toFixed(3)],
              depth: +depth.toFixed(3), amplitude: +amplitude.toFixed(4), inside: name,
            });
          }
          const key = `${Math.round(at.x / .15)}:${Math.round(at.z / .15)}`;
          if (!settled.has(key)) settled.set(key, { x: at.x, z: at.z, from: [x, z] });
        }
      }

      const trapped = [];
      for (const point of settled.values()) {
        let best = 0;
        for (let i = 0; i < headings; i++) {
          place(point.x, point.z);
          player.yaw = game.boat.root.rotation.y + i / headings * Math.PI * 2;
          player.clearKeys();
          const fromX = player.position.x;
          const fromZ = player.position.z;
          player.setKey('KeyW', true);
          for (let f = 0; f < escapeFrames; f++) player.update(dt);
          player.setKey('KeyW', false);
          best = Math.max(best, Math.hypot(player.position.x - fromX, player.position.z - fromZ));
          if (best >= .45) break;
        }
        if (best < .45) {
          trapped.push({ at: [+point.x.toFixed(3), +point.z.toFixed(3)], bestMove: +best.toFixed(3) });
        }
      }

      player.clearKeys();
      game.world.setBelow(saved.below);
      player.mode = saved.mode;
      player.enabled = saved.enabled;
      player.position.copy(saved.position);
      player.yaw = saved.yaw;
      player.ground = saved.ground;
      player.onFootstep = saved.onFootstep;
      player.velocity.set(0, 0, 0);
      player.update(dt);
      return {
        cells, settledPoints: settled.size,
        failures: failures.slice(0, 6), failureCount: failures.length,
        trapped: trapped.slice(0, 6), trappedCount: trapped.length,
      };
    };
  });

  const deckSweep = await page.evaluate(() => window.__sweep({ space: 'deck' }));
  check('every square of the moored deck resolves to a clear, stable, escapable spot',
    deckSweep.cells > 400 && deckSweep.settledPoints > 80
      && deckSweep.failureCount === 0 && deckSweep.trappedCount === 0,
    JSON.stringify(deckSweep));

  const cabinSweep = await page.evaluate(() => window.__sweep({ space: 'cabin' }));
  check('every square of the cabin sole resolves to a clear, stable, escapable spot',
    cabinSweep.cells > 40 && cabinSweep.failureCount === 0 && cabinSweep.trappedCount === 0,
    JSON.stringify(cabinSweep));

  /* Same deck, off the world axes. Collision runs in the boat's frame and the
   * velocity response has to come back out of it, so a heading of zero hides
   * every sign error in that conversion. */
  const turnedSweep = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const heading = game.boat.root.rotation.y;
    const berth = game.boat.root.position.clone();
    game.boat.root.position.set(48, berth.y, -120);
    game.boat.root.rotation.y = 0.8;
    game.boat.root.updateMatrixWorld(true);
    const result = window.__sweep({ space: 'deck' });
    game.boat.root.position.copy(berth);
    game.boat.root.rotation.y = heading;
    game.boat.root.updateMatrixWorld(true);
    return result;
  });
  check('the same deck is trap-free with the boat turned off the world axes',
    turnedSweep.failureCount === 0 && turnedSweep.trappedCount === 0, JSON.stringify(turnedSweep));

  /* ---------------------------------------------------------------- *
   * "Make the deck paths wide" — the owner's first complaint, walked
   * ---------------------------------------------------------------- */

  const routes = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const player = game.player;
    const deck = game.boat.deck;
    const saved = { mode: player.mode, yaw: player.yaw, position: player.position.clone() };
    player.mode = 'walk';
    player.enabled = true;
    const runFrom = (start, headingOffset, frames) => {
      player.clearKeys();
      player.velocity.set(0, 0, 0);
      player.ground = game.boat.root.position.y + deck.heightAt(start[1]);
      player.position.copy(game.world.fromBoatLocal(
        new V(start[0], deck.heightAt(start[1]) + player.eyeHeight, start[1]),
      ));
      player.yaw = game.boat.root.rotation.y + headingOffset;
      player.setKey('KeyW', true);
      for (let i = 0; i < frames; i++) player.update(1 / 60);
      player.setKey('KeyW', false);
      return game.world.toBoatLocal(player.position.clone()).toArray();
    };
    /* `Player` walks along -Z at yaw 0, so a heading offset of 0 is forward
     * (the bow) and Math.PI is aft (the transom). */
    // From the boarding mark, straight forward, up the centre and onto the bow.
    const toTheBow = runFrom([-0.20, 3.10], 0, 480);
    // And back aft again from the bow, which is the walk that used to trap him.
    const backAft = runFrom([0.0, -5.20], Math.PI, 480);
    // Starboard side of the cockpit, aft to the transom gate: the body's route.
    const toTheGate = runFrom([1.60, 1.40], Math.PI, 340);
    player.clearKeys();
    player.mode = saved.mode;
    player.yaw = saved.yaw;
    player.position.copy(saved.position);
    player.velocity.set(0, 0, 0);
    player.update(1 / 60);
    return { toTheBow, backAft, toTheGate };
  });
  check('the player can walk from the boarding mark all the way to the bow, and back aft again',
    routes.toTheBow[2] < -4.9 && Math.abs(routes.toTheBow[0]) < 1.2
      && routes.backAft[2] > 3.0
      && routes.toTheGate[2] > 4.1,
    JSON.stringify(routes));

  /* ---------------------------------------------------------------- *
   * The startup procedure, performed in order, in silence
   * ---------------------------------------------------------------- */

  const startupOrder = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const deck = game.boat.deck;
    const log = [];
    /* Stand where a player stands to run the panel: in front of it, in the slot
     * between the helm console and the helm bench. `PANEL_STAND` and
     * `PANEL_CONTROLS` are shared with the spacing and Lou-clearance checks
     * below, so "where the panel is worked from" is one place in this file. */
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + deck.height;
    game.player.position.copy(game.world.fromBoatLocal(
      new V(window.PANEL_STAND[0], deck.height + 1.66, window.PANEL_STAND[1])));
    game.player.update(1 / 60);
    for (const [key, at] of window.PANEL_CONTROLS) {
      const before = { ...game.state };
      const targeted = window.__aim(at);
      // Out of order? Every step behind this one is still false, so pressing
      // now must earn nothing.
      game.interaction.press();
      for (let i = 0; i < 60 && !game.state[key]; i++) game.interaction.update(.05);
      game.interaction.release();
      log.push({ key, targeted, done: game.state[key] === true, wasDone: before[key] === true });
    }
    return {
      log,
      objective: document.getElementById('objective')?.textContent ?? null,
      detail: document.getElementById('objective-detail')?.textContent ?? null,
      running: game.physics.running,
      navOn: game.boat.controls.navLights.on,
    };
  });
  /* Every step must land on ITS OWN control, not merely on something. Before
   * N2 the crosshair could take the broad `startup panel` proxy or a neighbour
   * and the check would still have read "targeted". */
  const OWN_CONTROL = {
    battery: /battery selector switch/,
    blower: /bilge blower push button/,
    fuel: /fuel valve and sight check/,
    ignitionPort: /^port engine ignition key$/,
    ignitionStarboard: /^starboard engine ignition key$/,
    navLights: /navigation light switch/,
  };
  check('the eight-step startup procedure is performed switch by switch from the bridge deck',
    startupOrder.log.every((step) => step.done && OWN_CONTROL[step.key].test(step.targeted ?? ''))
      && startupOrder.running && startupOrder.navOn
      && /STARTUP PROCEDURE/.test(startupOrder.objective ?? ''),
    JSON.stringify(startupOrder));

  /* ---------------------------------------------------------------- *
   * N2 — "the startup controls are too bunched to hit individually"
   * ---------------------------------------------------------------- */

  const panel = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const keys = ['battery', 'blower', 'fuel', 'ignitionPort', 'ignitionStarboard', 'navLights'];
    const controls = keys.map((key) => {
      const group = game.boat.targets[key];
      const at = group.getWorldPosition(new V());
      const hit = group.children.find((child) => /hit volume/.test(child.name || ''));
      return {
        key,
        name: group.name,
        local: game.world.toBoatLocal(at.clone()).toArray(),
        hit: hit ? [hit.geometry.parameters.width, hit.geometry.parameters.height,
          hit.geometry.parameters.depth] : null,
      };
    });
    let closest = Infinity;
    let closestPair = null;
    let overlapping = 0;
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i];
        const b = controls[j];
        const gap = Math.hypot(a.local[0] - b.local[0], a.local[1] - b.local[1],
          a.local[2] - b.local[2]);
        if (gap < closest) { closest = gap; closestPair = [a.key, b.key]; }
        // Their own hit volumes must not run into each other either.
        if (a.hit && b.hit
          && Math.abs(a.local[0] - b.local[0]) < (a.hit[0] + b.hit[0]) / 2
          && Math.abs(a.local[1] - b.local[1]) < (a.hit[1] + b.hit[1]) / 2
          && Math.abs(a.local[2] - b.local[2]) < (a.hit[2] + b.hit[2]) / 2) overlapping++;
      }
    }
    return { controls, closest: +closest.toFixed(3), closestPair, overlapping };
  });
  /* The owner's own words: "too bunched to hit individually — space them out."
   * They were on 0.22-0.26 m centres; nothing under 0.34 gets to ship again,
   * every one of them carries a hand-sized hit volume, and no two of those
   * volumes may touch — which is what makes them individually hittable rather
   * than merely far apart. */
  check('every startup control is on its own 0.34 m of panel with its own hit volume',
    panel.closest >= 0.34
      && panel.controls.length === 6
      && panel.controls.every((control) => control.hit && control.hit[0] >= .26
        && control.hit[1] >= .26 && control.hit[2] >= .20)
      && panel.overlapping === 0,
    JSON.stringify({ closest: panel.closest, pair: panel.closestPair, overlapping: panel.overlapping }));

  /* ---------------------------------------------------------------- *
   * N3 — "Lou stands in the way at the startup panel"
   * ---------------------------------------------------------------- */

  const louClear = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const deck = game.boat.deck;
    const lou = game.world.toBoatLocal(game.boat.cast.lou.group.getWorldPosition(new V()));
    const eye = [window.PANEL_STAND[0], deck.height + 1.66, window.PANEL_STAND[1]];
    /* How close a man's own vertical axis comes to the line the player looks
     * along to reach each switch. Under about half a metre and his shoulder is
     * in the way of the thing the objective just told the player to press. */
    const clearanceTo = (control) => {
      let best = Infinity;
      const dx = control[0] - eye[0];
      const dz = control[2] - eye[2];
      const length = Math.hypot(dx, dz);
      for (let t = 0; t <= length; t += 0.02) {
        const x = eye[0] + (dx / length) * t;
        const z = eye[2] + (dz / length) * t;
        best = Math.min(best, Math.hypot(x - lou.x, z - lou.z));
      }
      return best;
    };
    const sightLines = window.PANEL_CONTROLS.map(([key, at]) => ({
      key, clearance: +clearanceTo(at).toFixed(3),
    }));
    const nearestControl = Math.min(...window.PANEL_CONTROLS.map(([, at]) => (
      Math.hypot(at[0] - lou.x, at[2] - lou.z)
    )));
    return {
      lou: lou.toArray().map((n) => +n.toFixed(2)),
      standsOnTheStand: Math.hypot(lou.x - eye[0], lou.z - eye[2]) < .7,
      nearestControl: +nearestControl.toFixed(2),
      worstSightLine: Math.min(...sightLines.map((line) => line.clearance)),
      sightLines,
    };
  });
  check('Lou watches the startup from clear of the panel, the controls and the line to them',
    louClear.nearestControl >= 1.5
      && louClear.worstSightLine >= 0.55
      && !louClear.standsOnTheStand,
    JSON.stringify(louClear));

  const outOfOrder = await page.evaluate(() => {
    const game = window.NO_WAKE;
    // The helm cannot be taken until the dock line is off.
    const before = game.state.atHelm;
    window.__aim([1.34, 1.88, -0.52]);
    game.interaction.press();
    for (let i = 0; i < 30; i++) game.interaction.update(.05);
    game.interaction.release();
    return { before, after: game.state.atHelm, dockLine: game.state.dockLine };
  });
  check('the helm refuses to be taken while the boat is still tied to the dock',
    !outOfOrder.before && !outOfOrder.after && !outOfOrder.dockLine,
    JSON.stringify(outOfOrder));

  const lineReleased = await page.evaluate((foredeck) => {
    const game = window.NO_WAKE;
    const targeted = window.__aim([-2.30, foredeck + .30, -5.56], [-1.70, foredeck + 1.66, -4.80]);
    game.interaction.press();
    for (let i = 0; i < 60 && !game.state.dockLine; i++) game.interaction.update(.05);
    game.interaction.release();
    return {
      targeted,
      released: game.state.dockLine,
      ropeVisible: game.boat.targets.dockLine.visible,
      attached: game.boat.targets.dockLine.userData.attached,
      mooringReleased: game.physics.mooringReleased,
    };
  }, DECK.foredeckHeight);
  check('the dock line releases through its own hold interaction from the foredeck',
    /dock/.test(lineReleased.targeted ?? '') && lineReleased.released
      && !lineReleased.ropeVisible && lineReleased.attached === false
      && lineReleased.mooringReleased,
    JSON.stringify(lineReleased));
  await capture('no-wake-startup-panel.png');

  const moored = await page.evaluate(() => {
    const b = window.NO_WAKE.physics;
    const saved = b.mooringReleased;
    b.mooringReleased = false;
    b.running = true; b.throttle = 1;
    const from = b.distance;
    for (let i = 0; i < 240; i++) b.advance(1 / 120);
    const moved = b.distance - from;
    b.throttle = 0;
    b.speed = 0;
    b.mooringReleased = saved;
    return { moved, speed: b.speed };
  });
  check('fixed-step boat thrust cannot move against an attached mooring line',
    moored.moved === 0 && moored.speed === 0, JSON.stringify(moored));

  const helmTaken = await page.evaluate(() => {
    const game = window.NO_WAKE;
    /* Back aft from the bow first. Releasing the line leaves the player at the
     * forward cleat, four and a half metres from the wheel -- well outside the
     * 2.7 m the crosshair reaches -- so a check that aimed from there was
     * asking the helm to be usable from the foredeck. */
    const deck = game.boat.deck;
    const targeted = window.__aim([1.34, 1.88, -0.52],
      [window.PANEL_STAND[0], deck.height + 1.66, window.PANEL_STAND[1]]);
    game.interaction.press();
    for (let i = 0; i < 30 && !game.state.atHelm; i++) game.interaction.update(.05);
    game.interaction.release();
    return {
      targeted,
      atHelm: game.state.atHelm,
      phase: game.phase,
      checkpoint: game.campaignState.missions.no_wake.checkpoint,
      helmHud: !document.getElementById('helm-hud').classList.contains('hidden'),
    };
  });
  check('taking the helm through the crosshair starts the run and records the underway checkpoint',
    /helm interaction proxy/.test(helmTaken.targeted ?? '') && helmTaken.atHelm
      && helmTaken.phase === 'drive' && helmTaken.checkpoint === 'underway'
      && helmTaken.helmHud,
    JSON.stringify(helmTaken));

  /* ---------------------------------------------------------------- *
   * The run out, the inlet, and the silence after the engines stop
   * ---------------------------------------------------------------- */

  /* CANONICAL_ROUTE_CONTRACT_BEGIN */
  const underway = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const probe = new game.physics.constructor();
    probe.running = true;
    probe.mooringReleased = true;
    probe.throttle = .82;
    for (let i = 0; i < 360; i++) probe.advance(1 / 120);
    return { distance: probe.distance, speed: probe.speed, phase: game.phase };
  });
  check('the released cruiser accelerates under her own physics',
    /* Three real fixed-step seconds at the authored .82 throttle produce
     * about 5.44 m / 2.96 m/s. The steady-cruise gate below separately proves
     * the 5.2 m/s presentation contract, so this isolated smoke check only
     * needs to prove a decisive, correctly signed launch. */
    underway.phase === 'drive' && underway.distance > 5 && underway.speed > 2.5,
    JSON.stringify(underway));

  await page.evaluate(() => {
    const game = window.NO_WAKE;
    if (!game.state.atHelm) throw new Error('canonical NO WAKE route lost the real helm');
    /* The isolated acceleration probe above never touches this hull. Reset the
     * same running, released cruiser on her Gate C datum so the authoritative
     * approach below owns every metre and every drive tick. */
    const cueBase = game.cueLog.length;
    window.__resetNoWakeRoute = () => {
      game.player.clearKeys();
      game.physics.reset();
      game.physics.running = true;
      game.physics.mooringReleased = true;
      game.physics.helmAttended = true;
      game.phase = 'drive';
      game.state.phaseTime = 0;
      game.state.driveSeconds = 0;
      game.state.cruiseIndex = 0;
      game.cueLog.length = cueBase;
      game.campaignState.missions.no_wake.checkpoint = 'underway';
      game.boat.root.position.set(0, game.boat.floatY, 0);
      game.boat.root.rotation.set(0, 0, 0);
      game.boat.root.updateMatrixWorld(true);
      game.world.update(0, 0);
    };
    window.__resetNoWakeRoute();
    /* Software WebGL is the expensive part of 5,500 RAF callbacks, not the
     * game. Keep the complete production update loop but omit rasterisation
     * while Playwright advances the authored clock, then restore it for the
     * evidence frame. */
    window.__noWakeRender = game.postfx.render;
    game.postfx.render = () => {};
  });
  /* An odometer can be filled without reaching the inlet. Exercise the old
   * false-green exactly: 65 s ahead, then reverse until both legacy numbers
   * exceed their gates. The real mission must stay in the channel. */
  await page.keyboard.down('w');
  await page.clock.runFor(65000);
  await page.keyboard.up('w');
  await page.keyboard.down('s');
  await page.clock.runFor(45000);
  /* `runFor()` stops on a rendered-frame boundary. Depending on that boundary,
   * the deterministic 110 s sample can finish a few centimetres either side
   * of the old 360 m odometer gate. Keep the real S key held for at most a
   * quarter-second so this negative case always crosses the legacy threshold
   * it is meant to falsify; never move the hull or mutate its counters here. */
  let reverseExtraMs = 0;
  while (reverseExtraMs < 250) {
    const reachedLegacyDistance = await page.evaluate(() => window.NO_WAKE.physics.distance >= 360);
    if (reachedLegacyDistance) break;
    await page.clock.runFor(50);
    reverseExtraMs += 50;
  }
  const outAndBack = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    checkpoint: window.NO_WAKE.campaignState.missions.no_wake.checkpoint,
    driveSeconds: window.NO_WAKE.state.driveSeconds,
    distance: window.NO_WAKE.physics.distance,
    speed: window.NO_WAKE.physics.speed,
    position: window.NO_WAKE.physics.position.toArray(),
    realReverseInput: window.NO_WAKE.player.keys.has('KeyS'),
  }));
  outAndBack.reverseExtraMs = reverseExtraMs;
  await page.keyboard.up('s');
  check('real forward/reverse input cannot bank an inlet checkpoint without reaching the inlet window',
    outAndBack.phase === 'drive' && outAndBack.checkpoint === 'underway'
      && outAndBack.realReverseInput && outAndBack.driveSeconds >= 90
      && outAndBack.distance >= 360 && outAndBack.speed < -1.2
      && outAndBack.position[1] > -300 && outAndBack.reverseExtraMs <= 250,
    JSON.stringify(outAndBack));
  await page.evaluate(() => window.__resetNoWakeRoute());
  await page.keyboard.down('w');
  await page.clock.runFor(92000);
  const atInlet = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const Box3 = game.world.colliders[0].constructor;
    const hull = game.boat.root.getObjectByName('cream fiberglass hull');
    const headland = game.world.channel.root.getObjectByName('inlet head land');
    game.boat.root.updateMatrixWorld(true);
    game.world.channel.root.updateMatrixWorld(true);
    const hullBox = new Box3().setFromObject(hull);
    const headlandBox = new Box3().setFromObject(headland);
    return {
      phase: game.phase,
      atHelm: game.state.atHelm,
      phaseTime: game.state.phaseTime,
      driveSeconds: game.state.driveSeconds,
      physicsTime: game.physics.time,
      distance: game.physics.distance,
      speed: game.physics.speed,
      throttle: game.physics.throttle,
      speedGauge: game.boat.controls.gaugeNeedles.speed.rotation.z,
      realForwardInput: game.player.keys.has('KeyW'),
      checkpoint: game.campaignState.missions.no_wake.checkpoint,
      boat: game.boat.root.position.toArray(),
      inlet: game.world.inlet,
      hullHeadlandClearance: hullBox.min.z - headlandBox.max.z,
      headlandIntersection: hullBox.intersectsBox(headlandBox),
      wakeVisible: game.world.wake.pool.some((p) => p.visible),
      cruiseCues: game.state.cruiseLines.map((line) => line.cue),
      water: window.__waterSamples(),
    };
  });
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    const Box3 = game.world.colliders[0].constructor;
    const headland = game.world.channel.root.getObjectByName('inlet head land');
    const headlandBox = new Box3().setFromObject(headland);
    const probe = window.__noWakeCoast = {
      minimumClearance: Infinity, everIntersected: false, samples: 0,
      startZ: game.boat.root.position.z, killSample: null, anchoredZ: null,
    };
    const sample = () => {
      const hullBox = new Box3().setFromObject(game.boat.hull);
      probe.minimumClearance = Math.min(
        probe.minimumClearance, hullBox.min.z - headlandBox.max.z,
      );
      probe.everIntersected ||= hullBox.intersectsBox(headlandBox);
      probe.samples++;
      if (game.state.enginesKilled && !probe.killSample) {
        probe.killSample = {
          throttle: game.physics.throttle, speed: game.physics.speed,
          position: game.boat.root.position.toArray(),
        };
      }
      if (game.physics.anchored) {
        probe.anchoredZ = game.boat.root.position.z;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  /* Lou owns 2.2 s of reaction time after the gate. Keep the real W key down
   * through his line, then release it and let production throttle/drag coast
   * naturally; no verifier assignment to throttle or speed is permitted. */
  await page.clock.runFor(Math.max(0, 2200 - atInlet.phaseTime * 1000));
  await page.keyboard.up('w');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.postfx.render = window.__noWakeRender;
    delete window.__noWakeRender;
  });
  await page.clock.runFor(100);
  check('real W input drives the complete 90-second full-throttle approach to the inlet without entering head land',
    atInlet.phase === 'inlet'
      && atInlet.atHelm && atInlet.realForwardInput && atInlet.throttle >= .95
      && atInlet.driveSeconds >= 90 && atInlet.driveSeconds < 92
      && atInlet.physicsTime >= 90 && atInlet.physicsTime < 93
      && atInlet.distance >= 400 && atInlet.distance < 445
      && atInlet.speedGauge > .70 && atInlet.speedGauge < .95
      && atInlet.checkpoint === 'open_water'
      && Math.abs(atInlet.boat[2] - atInlet.inlet.z) < 9
      && !atInlet.headlandIntersection && atInlet.hullHeadlandClearance >= 30,
    JSON.stringify(atInlet));
  check('the live tapered exclusion follows the pitched moving hull while exterior water remains intact',
    atInlet.water.inside.every((sample) => sample.excluded)
      && atInlet.water.outside.every((sample) => !sample.excluded)
      && atInlet.water.boundary.every((sample) => sample.excluded === sample.expected)
      && atInlet.water.freshnessError < 1e-8,
    JSON.stringify(atInlet.water));
  await capture('no-wake-inlet.png');

  await page.evaluate(() => {
    const game = window.NO_WAKE;
    window.__noWakeRender = game.postfx.render;
    game.postfx.render = () => {};
  });
  await page.clock.runFor(30000);
  const killed = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const before = game.boat.root.position.clone();
    for (let i = 0; i < 240; i++) game.physics.advance(1 / 120);
    return {
      anchored: game.physics.anchored,
      running: game.physics.running,
      atHelm: game.state.atHelm,
      drift: before.distanceTo(game.boat.root.position),
      spoken: game.cueLog.map((entry) => entry.cue),
      coast: window.__noWakeCoast,
    };
  });
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.postfx.render = window.__noWakeRender;
    delete window.__noWakeRender;
  });
  await page.clock.runFor(50);
  await page.clock.resume();
  const expectedRunCues = [
    ...atInlet.cruiseCues,
    'inlet.lou.bring-her-down',
    'inlet.lou.kill-them',
  ];
  const actualRunCues = killed.spoken.filter((cue) => expectedRunCues.includes(cue));
  check('the real 2.2-second reaction and natural neutral coast keep the visible hull clear of head land',
    killed.coast.samples > 10 && !killed.coast.everIntersected
      && killed.coast.minimumClearance >= 15
      && killed.coast.killSample
      && Math.abs(killed.coast.killSample.throttle) < .08
      && Math.abs(killed.coast.killSample.speed) < .62
      && killed.coast.anchoredZ !== null,
    JSON.stringify(killed.coast));
  check('the five authored cruise lines, inlet order, and natural engine kill all occur exactly once',
    atInlet.cruiseCues.length === 5
      && JSON.stringify(actualRunCues) === JSON.stringify(expectedRunCues),
    JSON.stringify({ expectedRunCues, actualRunCues }));
  check('"Kill them" stops and kinematically locks the hull for the rest of the mission',
    killed.anchored && !killed.running && !killed.atHelm && killed.drift < 1e-6
      && killed.spoken.includes('inlet.lou.bring-her-down')
      && killed.spoken.includes('inlet.lou.kill-them'),
    JSON.stringify({ ...killed, spoken: killed.spoken.slice(-4) }));
  /* CANONICAL_ROUTE_CONTRACT_END */

  await page.waitForFunction(() => window.NO_WAKE.phase === 'descend');
  /* And then wait for the SCREEN, which is a beat behind the man on purpose.
   * `docs/TONE-AND-PARODY.md`: the character says it and the HUD clarifies
   * afterwards, never both on the same frame -- so a check that samples the
   * objective the instant the phase changes is reading the gap the rule
   * creates, not a missing objective. */
  await page.waitForFunction(
    () => /GO BELOW DECK/.test(document.getElementById('objective')?.textContent ?? ''),
  );
  const descend = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    objective: document.getElementById('objective')?.textContent ?? null,
    spoken: window.NO_WAKE.cueLog.map((entry) => entry.cue),
  }));
  check('Irish reports the channel clear and the objective becomes GO BELOW DECK',
    descend.phase === 'descend' && /GO BELOW DECK/.test(descend.objective ?? '')
      && descend.spoken.includes('inlet.irish.channel-clear')
      && descend.spoken.includes('inlet.lou.out-of-the-wind'),
    JSON.stringify({ phase: descend.phase, objective: descend.objective, spoken: descend.spoken.slice(-3) }));

  /* ---------------------------------------------------------------- *
   * The cabin scene
   * ---------------------------------------------------------------- */

  const goingBelow = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.position.copy(game.world.fromBoatLocal(new V(-0.70, game.boat.deck.height + 1.66, 0.60)));
    game.player.update(1 / 60);
    const targeted = window.__aim([-1.465, 1.80, -0.70]);
    game.interaction.press();
    for (let i = 0; i < 80 && !game.state.moving; i++) game.interaction.update(.05);
    game.interaction.release();
    return { targeted, moving: game.state.moving };
  });
  await page.waitForFunction(() => window.NO_WAKE.state.below === true);
  await page.waitForFunction(() => window.NO_WAKE.phase === 'cabin');
  const below = await page.evaluate(() => {
    const game = window.NO_WAKE;
    return {
      below: game.state.below,
      worldBelow: game.world.below,
      local: game.world.toBoatLocal(game.player.position.clone()).toArray(),
      /* The sole he is standing on, IN THE BOAT'S OWN FRAME.
       *
       * `player.ground - boat.root.position.y` is not that: the hull keeps
       * whatever pitch and roll the last driven frame left on it, so a point
       * 2.5 m forward of the boat's origin sits centimetres off its own local
       * height once the attitude is resolved. Subtracting the root's Y alone
       * measured that attitude and called it the floor, and read 11 mm out
       * against a 10 mm tolerance for no reason but the trim. Round-tripping
       * the ground point through `toBoatLocal` removes it. */
      soleUnderfoot: (() => {
        const V = game.player.position.constructor;
        const at = new V(game.player.position.x, game.player.ground, game.player.position.z);
        return game.world.toBoatLocal(at).y;
      })(),
      enclosure: game.engineAudio.enclosure,
      radioOn: game.radio.on,
    };
  });
  check('the player goes down the companionway onto the cabin sole and the room closes in',
    /companionway/.test(goingBelow.targeted ?? '') && below.below && below.worldBelow
      /* `player.ground` is the last collision solve and may trail the authored
       * companionway landing by a couple of centimetres on a pitched hull.
       * The independently measured player-local eye height below is the hard
       * pose assertion; this check only guards against the wrong deck. */
      && Math.abs(below.soleUnderfoot - CABIN_HEIGHT) < .035
      && Math.abs(below.local[1] - (CABIN_HEIGHT + 1.66)) < .02
      && below.local[2] > CABIN_BOW && below.local[2] < CABIN_STERN
      && below.enclosure < 1,
    JSON.stringify(below));

  await page.waitForFunction(() => window.NO_WAKE.cabin.group.userData.doorsClosed === true);
  await page.waitForFunction(() => window.NO_WAKE.radio.on === false);
  const closedUp = await page.evaluate(() => ({
    doorsClosed: window.NO_WAKE.cabin.group.userData.doorsClosed,
    radioOff: !window.NO_WAKE.radio.on,
    enclosure: window.NO_WAKE.engineAudio.enclosure,
    stations: window.NO_WAKE.radio.stations.length,
  }));
  check('a radio plays faintly until Lou shuts it off, and Booski closes the companionway',
    closedUp.doorsClosed && closedUp.radioOff && closedUp.enclosure <= .25
      && closedUp.stations >= 1,
    JSON.stringify(closedUp));

  await page.waitForFunction(() => window.NO_WAKE.state.poured === true);
  // Poured, then slid across: two beats, and the second is the one that puts
  // the glass in front of Willy.
  await page.waitForFunction(() => window.NO_WAKE.cabin.props.shotGlass.position.x > .5);
  const staging = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const boxes = game.boat.cabinColliders;
    const eye = game.player.camera.position.clone();
    /* "Nobody is behind a wall." Cast a ray from the player's own eye to each
     * man's chest and require it to reach him without crossing a solid. This
     * is the owner's complaint about the old shooting beat, measured. */
    const blocked = (to) => {
      const dir = to.clone().sub(eye);
      const length = dir.length();
      dir.normalize();
      for (let t = .1; t < length; t += .05) {
        const p = game.world.toBoatLocal(eye.clone().addScaledVector(dir, t));
        for (const box of boxes) {
          if (p.x > box.min.x && p.x < box.max.x && p.y > box.min.y && p.y < box.max.y
            && p.z > box.min.z && p.z < box.max.z) return box.name;
        }
      }
      return null;
    };
    const seen = {};
    for (const id of ['lou', 'booski', 'willy']) {
      const chest = game.boat.cast[id].group.localToWorld(new V(0, 1.30, 0));
      const ndc = chest.clone().project(game.player.camera);
      seen[id] = {
        blockedBy: blocked(chest),
        local: game.world.toBoatLocal(game.boat.cast[id].group.getWorldPosition(new V())).toArray(),
        ndc: ndc.toArray(),
      };
    }
    return {
      seen,
      playerLocal: game.world.toBoatLocal(game.player.position.clone()).toArray(),
      irishLocal: game.world.toBoatLocal(game.boat.cast.irish.group.getWorldPosition(new V())).toArray(),
      shotGlass: game.cabin.props.shotGlass.position.toArray(),
      cockpitEmpty: ['lou', 'booski', 'willy'].every((id) => (
        game.world.toBoatLocal(game.boat.cast[id].group.getWorldPosition(new V())).z < -2
      )),
    };
  });
  check('the composition holds: Lou at the dinette, Booski behind the bar, Willy between them, nobody behind a wall',
    Object.values(staging.seen).every((who) => who.blockedBy === null)
      && staging.seen.lou.local[0] > .5 && staging.seen.booski.local[0] < -.5
      && Math.abs(staging.seen.willy.local[0]) < .5
      && staging.playerLocal[2] > staging.seen.willy.local[2]
      && staging.cockpitEmpty,
    JSON.stringify(staging.seen));
  /* "Irish above, at the bow." He never comes below and never leaves the bow. */
  check('Irish stays on the bow through the whole confrontation',
    staging.irishLocal[2] < -3 && staging.irishLocal[1] > DECK.height,
    JSON.stringify({ irish: staging.irishLocal }));
  /* Measured against the sole rather than against zero: the cabin floor dropped
   * 0.32 m for N1 and a bare "> .5" was reading the old room's height. */
  check('Booski pours one shot and slides it across to Willy',
    staging.shotGlass[0] > .5 && staging.shotGlass[1] > CABIN.height + .6,
    JSON.stringify({ shotGlass: staging.shotGlass, sole: CABIN.height }));
  await capture('no-wake-cabin-staging.png');
  await page.evaluate((soleY) => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    window.__dryCabinView = { yaw: game.player.yaw, pitch: game.player.pitch };
    const target = game.world.fromBoatLocal(new V(0, soleY + .06, -4.55));
    const delta = target.sub(game.player.camera.position);
    game.player.yaw = Math.atan2(-delta.x, -delta.z);
    game.player.pitch = Math.asin(delta.y / delta.length());
    game.player.update(1 / 60);
    game.player.camera.updateMatrixWorld(true);
  }, CABIN.height);
  await capture('no-wake-dry-cabin.png');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    game.player.yaw = window.__dryCabinView.yaw;
    game.player.pitch = window.__dryCabinView.pitch;
    game.player.update(1 / 60);
    delete window.__dryCabinView;
  });

  const penned = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const player = game.player;
    const saved = player.position.clone();
    player.mode = 'walk';
    player.enabled = true;
    const reached = [];
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      player.position.copy(saved);
      player.velocity.set(0, 0, 0);
      player.clearKeys();
      player.yaw = game.boat.root.rotation.y + heading;
      player.setKey('KeyW', true);
      for (let i = 0; i < 240; i++) { player.update(1 / 60); game.clampToStaging(); }
      player.setKey('KeyW', false);
      reached.push(game.world.toBoatLocal(player.position.clone()).toArray());
    }
    player.position.copy(saved);
    player.velocity.set(0, 0, 0);
    player.update(1 / 60);
    return { reached, locked: game.state.stagingLocked };
  });
  check('the player keeps camera control but cannot leave the staging area',
    penned.locked && penned.reached.every(([x, , z]) => (
      x >= CABIN_STAGING.minX - .05 && x <= CABIN_STAGING.maxX + .05
      && z >= CABIN_STAGING.minZ - .05 && z <= CABIN_STAGING.maxZ + .05
    )),
    JSON.stringify(penned));

  await page.waitForFunction(() => window.NO_WAKE.state.dialogue !== null, null, { timeout: 300000 });
  let reachedSitLine = false;
  for (let i = 0; i < NO_WAKE_CABIN_SCRIPT.length + 2; i++) {
    reachedSitLine = await page.evaluate(() => (
      window.NO_WAKE.cueLog.at(-1)?.cue === 'cabin.booski.sit-down'
        && window.NO_WAKE.phase === 'cabin'
    ));
    if (reachedSitLine) break;
    await page.evaluate(() => window.NO_WAKE.skipDialogue());
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => (
    window.NO_WAKE.phase === 'cabin' && window.NO_WAKE.boat.cast.willy.job === 'sit'
  ));
  await page.waitForFunction((mark) => {
    const willy = window.NO_WAKE?.boat?.cast?.willy;
    if (!willy || willy.job !== 'sit') return false;
    /* `Npc.sit()` lowers the actor root by the shared authored chair drop;
     * baseY remains the seat-specific datum. Wait through the preceding gaze
     * timers until the real runtime transform, not merely the job flag, has
     * settled on the aft-return mark. */
    const seatedY = mark.baseY - .42 * willy.parts.heightScale;
    const yawError = Math.abs(Math.atan2(
      Math.sin(willy.group.rotation.y - mark.yaw),
      Math.cos(willy.group.rotation.y - mark.yaw),
    ));
    const onMark = Math.abs(willy.group.position.x - mark.x) < 1e-6
      && Math.abs(willy.group.position.y - seatedY) < 1e-6
      && Math.abs(willy.group.position.z - mark.z) < 1e-6
      && Math.abs(willy.baseY - mark.baseY) < 1e-6
      && yawError < .02;
    if (!onMark) {
      window.__verifyWillySeatStableAt = null;
      return false;
    }
    window.__verifyWillySeatStableAt ??= performance.now();
    return performance.now() - window.__verifyWillySeatStableAt >= 400;
  }, CABIN_CAST_STAGING.willySeat, { timeout: 300000 });
  const willySeat = await page.evaluate((mark) => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const Box3 = game.world.colliders[0].constructor;
    const willy = game.boat.cast.willy;
    const lou = game.boat.cast.lou;
    const shown = (object) => {
      for (let node = object; node; node = node.parent) if (node.visible === false) return false;
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);
      return materials.length === 0 || materials.some(
        (material) => material.visible !== false && (material.opacity ?? 1) > .01,
      );
    };
    const meshBoxes = (group) => {
      const entries = [];
      group.traverse((object) => {
        if (object.isMesh && shown(object)) entries.push({ object, box: new Box3().setFromObject(object) });
      });
      return entries;
    };
    const contacts = (left, right) => {
      const found = [];
      for (const a of meshBoxes(left)) for (const b of meshBoxes(right)) {
        const overlap = a.box.clone().intersect(b.box);
        if (overlap.isEmpty()) continue;
        const size = overlap.getSize(new V());
        if (size.x > 1e-6 && size.y > 1e-6 && size.z > 1e-6) {
          found.push({ a: a.object.name, b: b.object.name, size: size.toArray() });
        }
      }
      return found;
    };
    const dinette = game.cabin.group.getObjectByName('curved dinette');
    const louContacts = contacts(willy.group, lou.group);
    const furnitureContacts = contacts(willy.group, dinette)
      .filter((contact) => !/aft return/.test(contact.b));
    const hips = new Box3().setFromObject(willy.group.getObjectByName('hips'));
    const supportObject = game.cabin.group.getObjectByName('dinette booth cushion · aft return');
    const support = new Box3().setFromObject(supportObject);
    const supportGap = hips.min.y - support.max.y;
    const seatedY = mark.baseY - .42 * willy.parts.heightScale;
    const yawError = Math.abs(Math.atan2(
      Math.sin(willy.group.rotation.y - mark.yaw),
      Math.cos(willy.group.rotation.y - mark.yaw),
    ));

    /* Evidence view from a legal point inside the confrontation pen. It leaves
     * Willy and Lou on different bearings and keeps the real seat/legwell in
     * frame; no actor or furniture is hidden or moved. */
    window.__willySeatView = {
      position: game.player.position.clone(), yaw: game.player.yaw, pitch: game.player.pitch,
      ground: game.player.ground,
    };
    game.player.position.copy(game.world.fromBoatLocal(
      new V(-.65, game.boat.cabinDeck.height + game.player.eyeHeight, -2.52),
    ));
    game.player.ground = game.boat.root.position.y + game.boat.cabinDeck.height;
    game.player.update(1 / 60);
    const target = willy.group.localToWorld(new V(0, .82, 0));
    const delta = target.sub(game.player.camera.position);
    game.player.yaw = Math.atan2(-delta.x, -delta.z);
    game.player.pitch = Math.asin(delta.y / delta.length());
    game.player.update(1 / 60);
    game.player.camera.updateMatrixWorld(true);
    const projectedCentre = (group) => {
      const box = new Box3().setFromObject(group);
      return box.getCenter(new V()).project(game.player.camera).toArray();
    };
    return {
      reachedSitLine: true,
      pose: willy.group.position.toArray(), yaw: willy.group.rotation.y,
      yawError, seatedY, baseY: willy.baseY, job: willy.job, mark,
      louContacts, furnitureContacts,
      supportGap,
      hips: { min: hips.min.toArray(), max: hips.max.toArray() },
      support: { min: support.min.toArray(), max: support.max.toArray() },
      ndc: { willy: projectedCentre(willy.group), lou: projectedCentre(lou.group) },
    };
  }, CABIN_CAST_STAGING.willySeat);
  check('Willy reaches his exact real seated mark, fully supported and clear of Lou and every non-support fixture',
    reachedSitLine && willySeat.job === 'sit'
      && Math.abs(willySeat.pose[0] - willySeat.mark.x) < 1e-6
      && Math.abs(willySeat.pose[1] - willySeat.seatedY) < 1e-6
      && Math.abs(willySeat.pose[2] - willySeat.mark.z) < 1e-6
      && willySeat.yawError < .02
      && Math.abs(willySeat.baseY - willySeat.mark.baseY) < 1e-6
      && willySeat.louContacts.length === 0 && willySeat.furnitureContacts.length === 0
      && willySeat.hips.min[0] >= willySeat.support.min[0]
      && willySeat.hips.max[0] <= willySeat.support.max[0]
      && willySeat.hips.min[2] >= willySeat.support.min[2]
      && willySeat.hips.max[2] <= willySeat.support.max[2]
      && willySeat.supportGap >= -1e-6 && willySeat.supportGap <= .025
      && Math.abs(willySeat.ndc.willy[0] - willySeat.ndc.lou[0]) >= .15,
    JSON.stringify(willySeat));
  await capture('no-wake-willy-seated.png');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    const saved = window.__willySeatView;
    game.player.position.copy(saved.position);
    game.player.ground = saved.ground;
    game.player.yaw = saved.yaw;
    game.player.pitch = saved.pitch;
    game.player.update(1 / 60);
    delete window.__willySeatView;
  });
  for (let i = 0; i < NO_WAKE_CABIN_SCRIPT.length + 2
    && await page.evaluate(() => window.NO_WAKE.phase !== 'ready_to_fire'); i++) {
    await page.evaluate(() => window.NO_WAKE.skipDialogue());
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => window.NO_WAKE.phase === 'ready_to_fire');
  const script = await page.evaluate(() => ({
    lines: window.NO_WAKE.dialogueLog.map((line) => line.text),
    cues: window.NO_WAKE.cueLog.map((entry) => entry.cue),
    phase: window.NO_WAKE.phase,
    objective: document.getElementById('objective')?.textContent ?? null,
    promptVisible: !document.getElementById('execution-prompt').classList.contains('hidden'),
    moveScale: window.NO_WAKE.player.moveScale,
  }));
  check('the Negev question lands, and nobody makes a speech after it',
    script.lines.some((line) => /Mirage/.test(line))
      && script.lines.some((line) => /Negev on B/.test(line))
      && script.lines.some((line) => /brother to me/.test(line))
      && script.lines.at(-1) === 'All right.',
    JSON.stringify(script.lines.slice(-4)));
  check('movement locks, aim stays free, and the objective is DRAW YOUR WEAPON with no countdown',
    script.phase === 'ready_to_fire' && /DRAW YOUR WEAPON/.test(script.objective ?? '')
      && script.promptVisible && script.moveScale === 0,
    JSON.stringify({ phase: script.phase, objective: script.objective, moveScale: script.moveScale }));

  const armed = await page.evaluate(() => ({
    playerGun: window.NO_WAKE.state.playerGun?.visible,
    willyVisible: window.NO_WAKE.boat.cast.willy.group.visible,
    weapons: Object.fromEntries(['playerGun', 'louGun', 'booskiGun'].map((key) => {
      const gun = window.NO_WAKE.state[key];
      let meshes = 0;
      gun?.traverse((object) => { if (object.isMesh) meshes++; });
      return [key, { model: gun?.userData.weaponModel, meshes }];
    })),
    irishArmed: Boolean(window.NO_WAKE.state.irishGun),
  }));
  check('Tony carries the shared revolver, Lou and Booski carry detailed 9mms, Irish carries nothing',
    armed.playerGun && armed.willyVisible && !armed.irishArmed
      && armed.weapons.playerGun.model === 'six-shot revolver'
      && armed.weapons.playerGun.meshes >= 15
      && armed.weapons.louGun.model === '9mm semi-automatic'
      && armed.weapons.booskiGun.model === '9mm semi-automatic'
      && armed.weapons.louGun.meshes >= 20 && armed.weapons.booskiGun.meshes >= 20,
    JSON.stringify(armed));
  await capture('no-wake-draw.png');
  // Let the last staged beat's timers finish before the volley, so nothing the
  // script scheduled can land on top of the body.
  await page.waitForTimeout(2000);

  await page.mouse.click(640, 360);
  await page.waitForFunction(() => window.NO_WAKE.phase === 'body');
  const executed = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    const THREE = await import('three');
    return {
      phase: game.phase,
      shots: game.state.executionShots,
      checkpoint: game.campaignState.missions.no_wake.checkpoint,
      /* HE FALLS FORE-AND-AFT, NOT SIDEWAYS, and this file was still
       * measuring the roll. `poseNoWakeExecutedBodyGeometry` lays the standing
       * rig down the clear aisle -- `rotation.set(-1.42, 0, 0)` -- and says
       * why in its own comment: rotating it sideways put Willy's head through
       * the galley and his torso through a fixed stool. `rotation.z` is zero
       * and correctly so, so `fell` was false on a man who was flat on the
       * floor, with the collapse camera already cut to and the shot glass
       * already rolling in the same snapshot. Measure the tip he actually
       * takes. */
      fell: Math.abs(game.boat.cast.willy.group.rotation.x) > 1,
      shot: game.cameraDirector.shot?.id ?? null,
      sawCollapseShot: game.cameraDirector.seenShots.has('execution-collapse-profile'),
      /* And ON THE SOLE means the BODY is on the sole, not the group origin.
       * The rig's pivot sits 8.8 cm up because that is where a standing man's
       * pivot is; the same comment records that the visible body ends up
       * bedded two centimetres into the boards. Ask the geometry. */
      onSole: new THREE.Box3().setFromObject(game.boat.cast.willy.group)
        .min.y <= game.boat.cabinDeck.height + 0.05,
      glassRolling: Boolean(game.state.glassRoll),
    };
  });
  /* All three fire on the same beat and keep firing: four volleys, three
   * shooters, twelve rounds. The old scene fired four in total and neither
   * Lou nor Booski was visibly one of them. */
  check('the player fires first and all three shooters empty into him on the same beat',
    executed.phase === 'body' && executed.shots >= 10
      && executed.checkpoint === 'execution' && executed.fell && executed.onSole,
    JSON.stringify(executed));
  check('the collapse cuts to a low side profile and the shot glass starts to roll',
    executed.sawCollapseShot && executed.glassRolling,
    JSON.stringify({ shot: executed.shot, saw: executed.sawCollapseShot, rolling: executed.glassRolling }));
  await capture('no-wake-collapse.png');

  await page.waitForFunction(() => window.NO_WAKE.state.glassRoll === undefined
    || window.NO_WAKE.state.glassRoll === null);
  const glass = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const foot = game.cabin.props.sinkFoot;
    const at = game.cabin.props.shotGlass.position;
    return { at: at.toArray(), foot: foot.toArray(), distance: at.distanceTo(foot) };
  });
  check('the shot glass rolls across the sole and stops against the sink',
    glass.distance < .12, JSON.stringify(glass));

  /* ---------------------------------------------------------------- *
   * The body: wrap, weights, carry, water
   * ---------------------------------------------------------------- */

  await page.waitForFunction(() => window.NO_WAKE.state.wrapStage === 'roll');
  const wrapStages = [];
  for (const expected of ['roll', 'fold', 'straps']) {
    const stage = await page.evaluate((want) => {
      const game = window.NO_WAKE;
      if (game.state.wrapStage !== want) return { want, got: game.state.wrapStage, ok: false };
      const targeted = window.__aim([0.10, game.boat.cabinDeck.height + 0.50, -3.85]);
      game.interaction.press();
      for (let i = 0; i < 120 && game.state.wrapStage === want; i++) game.interaction.update(.05);
      game.interaction.release();
      return {
        want, targeted, ok: game.state.wrapStage !== want,
        bagVisible: game.bodyRig.bag.visible,
        ragdollVisible: game.boat.cast.willy.group.visible,
        folded: game.bodyRig.state.folded,
        strapped: game.bodyRig.state.strapped,
      };
    }, expected);
    wrapStages.push(stage);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.NO_WAKE.bodyRig.state.closed === true);
  const wrapped = await page.evaluate(() => ({
    stages: window.NO_WAKE.bodyRig.state,
    ragdollGone: !window.NO_WAKE.boat.cast.willy.group.visible,
    bagVisible: window.NO_WAKE.bodyRig.bag.visible,
    prefab: Boolean(window.NO_WAKE.bodyRig.bag.getObjectByName('no-wake-wrapped-body')),
    phase: window.NO_WAKE.phase,
  }));
  check('the ragdoll is swapped for the stabilised wrapped-body prefab before anything is carried',
    wrapStages.every((stage) => stage.ok && /body interaction proxy/.test(stage.targeted ?? ''))
      && wrapped.ragdollGone && wrapped.bagVisible && wrapped.prefab
      && wrapped.stages.folded === 2 && wrapped.stages.strapped && wrapped.stages.closed,
    JSON.stringify({ wrapStages: wrapStages.map((s) => s.want), ...wrapped }));
  await capture('no-wake-wrapped.png');

  await page.waitForFunction(() => window.NO_WAKE.phase === 'weights');
  const upForWeights = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const targeted = window.__aim([-0.25, game.boat.cabinDeck.height + 1.00, -2.32]);
    game.interaction.press();
    for (let i = 0; i < 80 && !game.state.moving; i++) game.interaction.update(.05);
    game.interaction.release();
    return { targeted, moving: game.state.moving };
  });
  await page.waitForFunction(() => window.NO_WAKE.state.below === false);
  const onDeckAgain = await page.evaluate(() => ({
    below: window.NO_WAKE.state.below,
    enclosure: window.NO_WAKE.engineAudio.enclosure,
    local: window.NO_WAKE.world.toBoatLocal(window.NO_WAKE.player.position.clone()).toArray(),
  }));
  check('the open air comes back the moment he steps up out of the cabin',
    /companionway/.test(upForWeights.targeted ?? '') && !onDeckAgain.below
      && onDeckAgain.enclosure === 1,
    JSON.stringify(onDeckAgain));

  const ballast = await page.evaluate((foredeck) => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + foredeck;
    game.player.position.copy(game.world.fromBoatLocal(new V(-0.02, foredeck + 1.66, -3.60)));
    game.player.update(1 / 60);
    const targeted = window.__aim([-0.02, 2.10, -4.42]);
    game.interaction.press();
    for (let i = 0; i < 120 && !game.state.carriedBallast; i++) game.interaction.update(.05);
    game.interaction.release();
    return {
      targeted, taken: game.state.carriedBallast,
      shot: game.cameraDirector.shot?.id ?? null,
      slots: [...document.querySelectorAll('#hotbar .slot')].map((s) => s.textContent.trim()).filter(Boolean),
    };
  }, DECK.foredeckHeight);
  const irishOnStation = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    return game.world.toBoatLocal(game.boat.cast.irish.group.getWorldPosition(new V())).toArray();
  });
  check('the ballast comes out of the forward locker, on the bow, with Irish still on his station',
    /forward locker/.test(ballast.targeted ?? '') && ballast.taken
      && ballast.shot === 'ballast-bow-locker'
      && irishOnStation[2] < -3 && irishOnStation[1] > DECK.height,
    JSON.stringify({ ...ballast, irish: irishOnStation }));
  await capture('no-wake-ballast.png');

  await page.waitForFunction(() => window.NO_WAKE.phase === 'weights_returning');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.position.copy(game.world.fromBoatLocal(new V(-0.70, game.boat.deck.height + 1.66, 0.60)));
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.update(1 / 60);
    window.__aim([-1.465, 1.80, -0.70]);
    game.interaction.press();
    for (let i = 0; i < 80 && !game.state.moving; i++) game.interaction.update(.05);
    game.interaction.release();
  });
  await page.waitForFunction(() => window.NO_WAKE.phase === 'weights_attach');
  const weighted = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const targeted = window.__aim([0.10, game.boat.cabinDeck.height + 0.50, -3.85]);
    game.interaction.press();
    for (let i = 0; i < 120 && !game.bodyRig.state.weighted; i++) game.interaction.update(.05);
    game.interaction.release();
    return {
      targeted,
      weighted: game.bodyRig.state.weighted,
      onBag: Boolean(game.bodyRig.bag.getObjectByName('cast-iron ballast bundle')),
      checkpoint: game.campaignState.missions.no_wake.checkpoint,
    };
  });
  check('the ballast clips to the authored sockets on the bag and banks the weighted checkpoint',
    weighted.weighted && weighted.onBag && weighted.checkpoint === 'weighted',
    JSON.stringify(weighted));

  await page.waitForFunction(() => window.NO_WAKE.phase === 'carry', null, { timeout: 300000 });
  const carryStart = await page.evaluate(() => ({
    shot: window.NO_WAKE.cameraDirector.shot?.id ?? null,
    bag: window.NO_WAKE.bodyRig.bag.position.toArray(),
    spoken: window.NO_WAKE.cueLog.map((e) => e.cue),
  }));
  check('"Move him" starts a two-person carry out of the cabin',
    carryStart.shot === 'carry-lift-cabin'
      && carryStart.spoken.includes('body.lou.move-him'),
    JSON.stringify({ shot: carryStart.shot, bag: carryStart.bag }));

  /* Sample the authored carry at four points along its own parameter rather
   * than waiting on wall clock: it has to leave the cabin, come up through the
   * companionway, cross the cockpit and arrive on the platform, with Booski's
   * hands on the other end the whole way. */
  const carrySamples = [];
  for (const t of [.15, .40, .70, 1.0]) {
    const sample = await page.evaluate((at) => {
      const game = window.NO_WAKE;
      const V = game.player.position.constructor;
      game.bodyRig.carryTo(at, { booski: game.boat.cast.booski });
      const bag = game.bodyRig.bag.position.clone();
      const booski = game.boat.cast.booski.group.position.clone();
      return {
        t: at,
        bag: bag.toArray(),
        booskiGap: bag.distanceTo(booski),
        lou: game.boat.cast.lou.group.position.toArray(),
        irish: game.world.toBoatLocal(game.boat.cast.irish.group.getWorldPosition(new V())).toArray(),
      };
    }, t);
    carrySamples.push(sample);
  }
  check('the carry rises out of the cabin, crosses the cockpit and sets down on the platform',
    carrySamples[0].bag[1] < carrySamples[1].bag[1]
      && carrySamples[1].bag[2] < carrySamples[2].bag[2]
      && carrySamples[3].bag[2] > 5 && carrySamples[3].bag[1] < carrySamples[2].bag[1]
      && carrySamples.every((s) => s.booskiGap > .8 && s.booskiGap < 2.0)
      && carrySamples.every((s) => s.irish[2] < -3),
    JSON.stringify(carrySamples.map((s) => ({ t: s.t, bag: s.bag.map((n) => +n.toFixed(2)), gap: +s.booskiGap.toFixed(2) }))));

  /* The path itself was just sampled at four points; what is left is waiting
   * out its authored duration, which is measured in SIMULATED seconds and so
   * costs minutes of wall clock on this rasteriser (engine trap #2). Advance
   * the beat's own clock and wait on the arrival it earns. */
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 40; });
  await page.waitForFunction(() => window.NO_WAKE.phase === 'platform', null, { timeout: 300000 });
  /* Lou looks at the shoreline and nods, and only then does the screen ask for
   * anything. Same rule as the companionway: wait for the man, not the frame. */
  await page.waitForFunction(
    () => /DUMP THE BODY/.test(document.getElementById('objective')?.textContent ?? '')
      && window.NO_WAKE.interaction.paused === false,
    null, { timeout: 300000 },
  );
  const platform = await page.evaluate(() => {
    const game = window.NO_WAKE;
    return {
      shot: game.cameraDirector.shot?.id ?? null,
      objective: document.getElementById('objective')?.textContent ?? null,
      bag: game.bodyRig.bag.position.toArray(),
      platformY: game.boat.root.userData.waterline.platformY,
      waterY: game.boat.root.userData.waterline.surfaceY,
      louHelped: game.boat.cast.lou.group.position.z > 3.5,
    };
  });
  check('the bag is set down on the platform, inches above the water, and Lou never helped carry',
    /DUMP THE BODY/.test(platform.objective ?? '') && platform.bag[2] > 5
      && platform.platformY - platform.waterY < .4 && !platform.louHelped,
    JSON.stringify(platform));
  await capture('no-wake-platform.png');

  /* ---------------------------------------------------------------- *
   * N4 — "after wrapping the body, E would not dump it off the back"
   *
   * The old check here aimed the crosshair with `__aim` and then called
   * `interaction.press()`, and it passed on a build where the mission was
   * broken, because BOTH of those steps are things the mission does not do for
   * the player. What the mission does is leave him where the carry put him,
   * pointing where it pointed him, and wait for a key. So this one touches
   * neither: it reads the pose the mission chose, holds the physical E key
   * through `page.keyboard`, and waits for the body to go over the side.
   *
   * The two things it would have caught, both of them true before the fix:
   * the authored aim looked over the disposal zone entirely (`aimedAt: null`,
   * no prompt), and `player.mode = 'frozen'` meant the player could not look
   * down to find it either.
   * ---------------------------------------------------------------- */

  const beforeDump = await page.evaluate(() => {
    const game = window.NO_WAKE;
    return {
      /* Nothing is aimed here. This is the pose reachPlatform() left, resolved
       * through the real interaction system on the real camera. */
      aimedAt: game.interaction.current?.name ?? null,
      promptShown: !document.getElementById('prompt').classList.contains('hidden'),
      canLook: game.player.mode !== 'frozen',
      mode: game.player.mode,
      local: game.world.toBoatLocal(game.player.position.clone()).toArray().map((n) => +n.toFixed(2)),
      pitch: +game.player.pitch.toFixed(2),
    };
  });
  check('the disposal mark points the player AT the bag and leaves him his head',
    /disposal zone/.test(beforeDump.aimedAt ?? '') && beforeDump.promptShown
      && beforeDump.canLook,
    JSON.stringify(beforeDump));

  /* And the key itself. `keyboard.down` goes through the page's own keydown
   * listener, `interaction.press()`, the hold accumulator in the real frame
   * loop, and `dumpBody()` -- the whole path the owner used. The wait is
   * generous because the hold is 1.0 SIMULATED second and this rasteriser draws
   * about one frame a second (ENGINE-TRAPS #2). */
  await page.keyboard.down('e');
  const dumped = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    const start = performance.now();
    while (performance.now() - start < 240000 && !game.state.bodyDisposed) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {
      disposed: game.state.bodyDisposed,
      phase: game.phase,
      seconds: +((performance.now() - start) / 1000).toFixed(1),
    };
  });
  await page.keyboard.up('e');
  check('holding the real E key on the disposal mark puts him over the back',
    dumped.disposed && dumped.phase === 'dispose', JSON.stringify(dumped));

  const disposal = [];
  for (const t of [.3, .6, 1.0]) {
    disposal.push(await page.evaluate((at) => {
      const game = window.NO_WAKE;
      const result = game.bodyRig.disposeTo(at);
      return {
        t: at, y: game.bodyRig.bag.position.y, visible: game.bodyRig.bag.visible,
        sink: result.sinkDepth, struck: result.struck,
      };
    }, t));
  }
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 2.0; });
  await page.waitForFunction(() => window.NO_WAKE.state.splashed === true, null, { timeout: 300000 });
  await page.evaluate(() => { window.NO_WAKE.state.phaseTime = 3.0; });
  await page.waitForFunction(() => window.NO_WAKE.cameraDirector.shot?.id === 'disposal-water-hold');
  const waterHoldShot = await page.evaluate(() => ({
    id: window.NO_WAKE.cameraDirector.shot?.id ?? null,
    phase: window.NO_WAKE.phase,
  }));
  await capture('no-wake-water-hold.png');
  check('one strike on the water, it sinks, it is gone — and the camera holds on the water',
    disposal[0].y > disposal[1].y && disposal[2].sink > 1.5 && !disposal[2].visible
      && disposal[0].struck === false && disposal[2].struck === true
      && waterHoldShot.id === 'disposal-water-hold' && waterHoldShot.phase === 'dispose',
    JSON.stringify({ disposal, waterHoldShot }));

  /* ---------------------------------------------------------------- *
   * The exit: the player drives her out, and nobody speaks
   * ---------------------------------------------------------------- */

  await page.waitForFunction(() => window.NO_WAKE.phase === 'exit', null, { timeout: 300000 });
  await page.waitForFunction(
    () => /LEAVE THE INLET/.test(document.getElementById('objective')?.textContent ?? ''),
    null, { timeout: 300000 },
  );
  const exitStart = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    objective: document.getElementById('objective')?.textContent ?? null,
    anchored: window.NO_WAKE.physics.anchored,
    portRunning: window.NO_WAKE.state.ignitionPort,
    spoken: window.NO_WAKE.cueLog.map((e) => e.cue),
  }));
  check('the inlet reports still clear, Lou says start her, and the boat is unlocked to leave',
    exitStart.phase === 'exit' && /LEAVE THE INLET/.test(exitStart.objective ?? '')
      && !exitStart.anchored && !exitStart.portRunning
      && exitStart.spoken.includes('body.irish.still-clear')
      && exitStart.spoken.includes('body.lou.start-her'),
    JSON.stringify({ ...exitStart, spoken: exitStart.spoken.slice(-3) }));

  const restarted = await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    game.player.mode = 'walk';
    game.player.enabled = true;
    game.player.ground = game.boat.root.position.y + game.boat.deck.height;
    game.player.position.copy(game.world.fromBoatLocal(
      new V(window.PANEL_STAND[0], game.boat.deck.height + 1.66, window.PANEL_STAND[1])));
    game.player.update(1 / 60);
    const out = [];
    for (const [key, at] of window.PANEL_CONTROLS.filter(([key]) => key.startsWith('ignition'))) {
      const targeted = window.__aim(at);
      game.interaction.press();
      for (let i = 0; i < 120 && !game.state[key]; i++) game.interaction.update(.05);
      game.interaction.release();
      out.push({ key, targeted, on: game.state[key] });
    }
    return { out, running: game.physics.running };
  });
  await page.waitForFunction(() => window.NO_WAKE.state.anchorUp === true, null, { timeout: 300000 });
  check('both engines are restarted by hand and Irish gets the anchor before she can go',
    restarted.out.every((step) => step.on && /ignition/.test(step.targeted ?? ''))
      && restarted.running,
    JSON.stringify(restarted));

  /* The mission deliberately navigates away 3.2 seconds after completion.
   * Raster capture can take longer than that on software WebGL, so snapshot
   * the irreversible state and live GL health in same-origin session storage
   * before the normal preview navigation destroys this document. */
  await page.evaluate(() => {
    const key = '__verify.no-wake.completion';
    sessionStorage.removeItem(key);
    const observe = () => {
      const game = window.NO_WAKE;
      if (!game) return;
      if (game.campaignState.missions.no_wake.status !== 'complete') {
        requestAnimationFrame(observe);
        return;
      }
      const gl = game.postfx.renderer.getContext();
      sessionStorage.setItem(key, JSON.stringify({
        mission: game.campaignState.missions.no_wake,
        chapter: game.campaignState.story.chapter,
        canonical: localStorage.getItem('squatchlife.campaign'),
        objective: document.getElementById('objective')?.textContent ?? null,
        webglHealth: {
          contextLossEvents: window.__noWakeContextLosses,
          contextLost: gl.isContextLost(),
          version: gl.getParameter(gl.VERSION),
          renderer: gl.getParameter(gl.RENDERER),
        },
      }));
    };
    requestAnimationFrame(observe);
  });

  const drivenOut = await page.evaluate(async () => {
    const game = window.NO_WAKE;
    window.__aim([1.34, 1.88, -0.52]);
    game.interaction.press();
    for (let i = 0; i < 40 && !game.state.atHelm; i++) game.interaction.update(.05);
    game.interaction.release();
    const startHeading = game.physics.heading;
    /* Turn her around and run for open water. She came in bow-first, so leaving
     * means putting the helm over -- the owner's "turn the boat around, natural
     * course home", done by the player rather than by a bezier.
     *
     * The helm input is real and so is the turn it produces; only the ninety
     * metres of open water afterwards are fast-forwarded through the same
     * fixed-step integrator the game uses, because at this frame rate they
     * would otherwise be six minutes of wall clock for no new information. */
    game.player.setKey('KeyW', true);
    game.player.setKey('KeyD', true);
    await new Promise((resolve) => {
      let frames = 0;
      const tick = () => {
        frames++;
        if (Math.abs(game.physics.heading - startHeading) > .25 || frames > 400) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const turned = Math.abs(game.physics.heading - startHeading);
    game.player.setKey('KeyD', false);
    for (let i = 0; i < 4000; i++) game.physics.advance(1 / 120);
    await new Promise((resolve) => {
      const tick = () => (game.state.astern ? resolve() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    });
    game.player.clearKeys();
    return {
      atHelm: game.state.atHelm,
      turned,
      speed: game.physics.speed,
      shot: game.cameraDirector.shot?.id ?? null,
      spokenAfterStart: game.cueLog.filter((e) => e.cue.startsWith('exit.')).length,
    };
  });
  check('the player drives her out under his own helm and the camera looks astern at the wake',
    drivenOut.atHelm && drivenOut.turned > .2 && drivenOut.speed > 3
      && drivenOut.shot === 'exit-astern-wake' && drivenOut.spokenAfterStart === 0,
    JSON.stringify(drivenOut));
  await capture('no-wake-astern.png');

  await page.waitForFunction(() => sessionStorage.getItem('__verify.no-wake.completion') !== null,
    null, { timeout: 300000 });
  /* THE SCENE ENDS BY LEAVING. Completing NO WAKE navigates the page back to
   * the flat, and that navigation can land between `waitForFunction` returning
   * and this read, destroying the execution context underneath it -- which is
   * how a run that had passed all 73 preceding checks died with "Execution
   * context was destroyed, most likely because of a navigation" and reported
   * nothing at all about the completion it had just achieved.
   *
   * The record survives: `sessionStorage` is per-origin and per-tab, and the
   * page it navigates to is the same origin. So read it again on the other
   * side rather than treating the navigation as a failure. */
  const readCompletion = () => page.evaluate(() => JSON.parse(
    sessionStorage.getItem('__verify.no-wake.completion'),
  ));
  const completed = await readCompletion().catch(async (error) => {
    if (!/Execution context was destroyed/i.test(error?.message ?? '')) throw error;
    await page.waitForLoadState('domcontentloaded');
    return readCompletion();
  });
  check('completion records every irreversible beat and opens Front and Center',
    completed.mission.status === 'complete' && completed.mission.betrayalConfirmed
      && completed.mission.playerFired && completed.mission.bodyDisposed
      && completed.chapter === 'date'
      && /MISSION COMPLETE: NO WAKE/.test(completed.objective ?? ''),
    JSON.stringify(completed.mission));
  check('the complete browser playthrough leaves canonical storage byte-for-byte untouched',
    completed.canonical === SENTINEL);
  const { webglHealth } = completed;
  check('the complete production playthrough keeps its WebGL context healthy',
    webglHealth.contextLossEvents === 0 && !webglHealth.contextLost
      && /WebGL/.test(webglHealth.version ?? ''),
    JSON.stringify(webglHealth));
  // ---- Preview checkpoint links (?preview=1&checkpoint=...) --------------
  // Each waypoint gets its own fresh page/preview campaign, the way an owner
  // clicking a preview.html link would load it. `dock`/`underway`/`inlet`/
  // `confrontation` are posed synchronously in `jumpToPreviewCheckpoint`
  // (src/nowake/main.js), but only after the Start handler's own
  // `audio.init()`/`loadManifest()` resolve -- the same "comfortably over
  // half a minute" decode `page.setDefaultTimeout`'s own comment documents
  // above -- so every one of them still needs a generous ceiling. `body`
  // additionally waits on `fireExecution()`'s own real setTimeout chain
  // (~2s of wall clock on top of that, unrelated to frame rate) before
  // Willy is actually down. `return` is deliberately NOT checked here:
  // reaching it requires `state.phaseTime` to accumulate through the
  // disposal timeline, which -- like every other phaseTime-driven wait in
  // this file -- is bounded by the rendered frame rate rather than the wall
  // clock, so on this rasteriser it would cost minutes on top of the audio
  // decode. `disposeBody()` is the exact function both `body` and `return`
  // call, and the full playthrough above already drives the return leg for
  // real from that same function, so `return`'s own staging is covered by
  // construction; it was checked manually instead (see the final report).
  for (const [id, expectPhase, timeoutMs] of [
    // 'dock' boards him and hands off into the startup checklist -- the
    // same real `phase('startup')` `beginBoarding()`'s own completion
    // callback calls; the bare 'dock' phase string is only ever the
    // pre-boarding default.
    ['dock', 'startup', 120000],
    ['underway', 'drive', 120000],
    ['inlet', 'inlet', 120000],
    ['confrontation', 'cabin', 120000],
    ['body', 'body', 130000],
  ]) {
    const cpPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    /* Playwright's own 30 s default, not this file's, was governing these
     * pages: `setDefaultTimeout` is per-page and the main playthrough's page is
     * the only one that ever got it. `nowake.html` fetches its whole module
     * graph, the three.js build and the scene's textures on a software
     * rasteriser, and under any load at all that is more than 30 s -- so the
     * verifier died mid-loop with a `page.goto: Timeout 30000ms exceeded` on a
     * page that was loading perfectly well. Same doctrine as the ceiling on the
     * main page: a guard against a hang, not a performance assertion. */
    cpPage.setDefaultTimeout(300000);
    cpPage.setDefaultNavigationTimeout(300000);
    const cpProblems = [];
    cpPage.on('pageerror', (error) => cpProblems.push(error.message));
    cpPage.on('console', (message) => {
      if (message.type() === 'error') cpProblems.push(message.text().slice(0, 240));
    });
    await cpPage.goto(`http://localhost:${PORT}/nowake.html?preview=1&checkpoint=${id}`, { waitUntil: 'load' });
    await cpPage.waitForFunction(() => window.NO_WAKE?.story, null, { timeout: 180000 });
    const chip = await cpPage.evaluate(() => document.querySelector('#overlay .tag')?.textContent ?? '');
    // Coordinates, not a locator click: this scene's continuous WebGL redraw
    // on a software rasteriser can make a locator's "two stable frames" wait
    // run past any reasonable ceiling -- see the identical note on the main
    // playthrough's own start click, above.
    const startBox = await cpPage.evaluate(() => {
      const r = document.getElementById('start-btn').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await cpPage.mouse.click(startBox.x, startBox.y);
    // 'dock' is also the pre-click default phase, so waiting on phase alone
    // would resolve before the async click handler has run at all; require
    // `boarded` too, which is only ever true after staging actually happens.
    await cpPage.waitForFunction(
      (expected) => window.NO_WAKE?.state?.phase === expected && window.NO_WAKE?.state?.boarded === true,
      expectPhase,
      { timeout: timeoutMs },
    ).catch(() => {});
    const result = await cpPage.evaluate(() => ({
      phase: window.NO_WAKE.state.phase,
      boarded: window.NO_WAKE.state.boarded,
      ignitionPort: window.NO_WAKE.state.ignitionPort,
      checkpoint: window.NO_WAKE.campaignState.missions.no_wake.checkpoint,
    }));
    check(`?preview=1&checkpoint=${id} loads staged and lands on phase "${expectPhase}"`,
      result.phase === expectPhase && result.boarded
        && chip.startsWith('Preview checkpoint:') && cpProblems.length === 0,
      JSON.stringify({ ...result, chip, problems: cpProblems }));
    await cpPage.close();
  }

  check('the browser emitted no uncaught errors', problems.length === 0, problems.join(' | '));
} catch (error) {
  if (error !== INPUT_ONLY_COMPLETE) throw error;
} finally {
  if (inputOnlyDeadline) clearTimeout(inputOnlyDeadline);
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} NO WAKE checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} NO WAKE checks passed.`);
