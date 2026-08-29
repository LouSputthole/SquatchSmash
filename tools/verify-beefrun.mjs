#!/usr/bin/env node
/**
 * Verify the Beef Run's campaign integration in a real browser: the preview
 * boots save-isolated, the mission begins through the airstrip story, every
 * checkpoint persists, completion is durable, the ending routes home, and a
 * saved mid-mission campaign resumes in the cockpit rather than starting over.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allCues, BARKS } from '../src/beefrun/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5211;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const SENTINEL = '{"version":999,"canonical":"beefrun verifier must not touch this"}';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Beef Run.');
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
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

/* Script is the authority for spoken words. This closes the silent failure
 * where a subtitle exists but no exact cue reaches the manifest/audio bank. */
const authoredCues = allCues();
const authoredNames = authoredCues.map((line) => `vo.${line.cue}.1`);
const authoredNameSet = new Set(authoredNames);
const authoredFileSet = new Set(authoredNames.map((name) => `${name}.mp3`));
const voiceManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const beefManifest = voiceManifest.sfx.filter((cue) => cue.name.startsWith('vo.beefrun.'));
const manifestByName = new Map(beefManifest.map((cue) => [cue.name, cue]));
const cueMismatches = authoredCues.filter((line) => {
  const manifestCue = manifestByName.get(`vo.${line.cue}.1`);
  return !manifestCue || manifestCue.say !== line.text;
});
const recordedFiles = fs.readdirSync(path.join(ROOT, 'assets', 'sfx'))
  .filter((name) => name.startsWith('vo.beefrun.') && name.endsWith('.mp3'));
const orphanedRecordings = recordedFiles.filter((name) => !authoredFileSet.has(name));
const audioIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(audioIndex.files || []);
const unindexedRecordings = recordedFiles.filter((name) => !indexedFiles.has(name));
const runtimeSharedCues = new Set([
  'gun.dry',
  'neighbours.thump',
  'switch.click',
  'gun.impact',
  'can.set',
  'pc.boot',
  'can.crack',
  'gun.shot',
  'can.crush',
  'glue.slip',
  'ui.select',
  'frame.adjust',
  'door.knob',
  'closet.slide',
]);
const expectedResidentCues = voiceManifest.sfx
  .filter((cue) => indexedFiles.has(cue.file || `${cue.name}.mp3`))
  .filter((cue) => cue.name.startsWith('vo.beefrun.')
    || cue.name.startsWith('beefrun.')
    || cue.name.startsWith('footstep.')
    || cue.name.startsWith('ambience.')
    || runtimeSharedCues.has(cue.name))
  .map((cue) => cue.name);
check('every spoken line has one unique exact cue in the voice manifest',
  authoredNameSet.size === authoredNames.length
    && beefManifest.length === authoredNames.length
    && cueMismatches.length === 0,
  JSON.stringify({ authored: authoredNames.length, manifest: beefManifest.length, mismatches: cueMismatches.length }));
check('every Beef Run recording still maps to an authored line',
  orphanedRecordings.length === 0 && unindexedRecordings.length === 0,
  JSON.stringify({ recorded: recordedFiles.length, orphaned: orphanedRecordings,
    unindexed: unindexedRecordings }));
check('Sasole has a full stable-flight rotation and contextual final-approach pools',
  BARKS.cruise.length >= 6
    && ['finalLine', 'finalFast', 'finalHigh', 'finalFlare'].every((pool) => BARKS[pool]?.length >= 3),
  JSON.stringify({ cruise: BARKS.cruise.length,
    final: Object.fromEntries(['finalLine', 'finalFast', 'finalHigh', 'finalFlare'].map((pool) => [pool, BARKS[pool]?.length])) }));

try {
  /* ---- pass one: the save-isolated preview, played through ---- */

  const page = await browser.newPage({
    viewport: { width: 960, height: 600 },
    // Exercise the renderer cap on the high-DPI display it is meant to tame.
    deviceScaleFactor: 2,
  });
  await page.addInitScript((sentinel) => {
    if (localStorage.getItem('squatchlife.campaign') === null) {
      localStorage.setItem('squatchlife.campaign', sentinel);
    }
  }, SENTINEL);
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });
  const storageSnapshot = () => page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  const unchanged = (snapshot) => JSON.stringify(snapshot)
    === JSON.stringify({ 'squatchlife.campaign': SENTINEL });

  /* airSeed pins the gust field -- unseeded weather was cause #1 of "flaky"
   autopilot runs (docs/ENGINE-TRAPS.md entry 7). Any fixed number does. */
  await page.goto(`http://localhost:${PORT}/beefrun.html?preview=1&airSeed=1977`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__beefrun?.story, null, { timeout: 60000 });

  const booted = await page.evaluate(() => {
    const b = window.__beefrun;
    const terrainBefore = { chunks: b.terrain.chunks.size, queued: b.terrain.queue.length };
    const parking = b.mission.airfield.anchors.parking;
    b.terrain.update(parking.x, parking.z, 0);
    const builtInOneUpdate = b.terrain.chunks.size;
    b.terrain.clear();
    return {
      scene: b.campaignState.scene.id,
      mission: b.campaignState.missions.airstrip_smuggling,
      squatchfather: b.campaignState.missions.squatchfather.status,
      booski: b.campaignState.events.booski_day_two_call.status,
      previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
      watchdogReady: window.__squatch?.beefrun === true,
      pixelRatio: b.mission.renderer.getPixelRatio(),
      shadowType: b.mission.renderer.shadowMap.type,
      shadowMap: [b.weather.sun.shadow.mapSize.x, b.weather.sun.shadow.mapSize.y],
      terrainBefore,
      builtInOneUpdate,
    };
  });
  check('the preview boots with the airstrip available and its prerequisites seeded',
    booted.scene === 'airstrip_smuggling'
      && booted.mission.status === 'available'
      && booted.squatchfather === 'complete'
      && booted.booski === 'answered'
      && booted.previewNotice,
    JSON.stringify(booted));
  check('the preview defers terrain and caps high-DPI shadow work before Start',
    booted.watchdogReady
      && booted.pixelRatio === 1.25
      && booted.shadowType === 1
      && booted.shadowMap[0] === 1024
      && booted.shadowMap[1] === 1024
      && booted.terrainBefore.chunks === 0
      && booted.terrainBefore.queued === 0
      && booted.builtInOneUpdate === 1,
    JSON.stringify({
      watchdogReady: booted.watchdogReady,
      pixelRatio: booted.pixelRatio,
      shadowType: booted.shadowType,
      shadowMap: booted.shadowMap,
      terrainBefore: booted.terrainBefore,
      builtInOneUpdate: booted.builtInOneUpdate,
    }));

  const keyboardRudder = await page.evaluate(() => {
    const input = window.__beefrun.input;
    input.clear();
    input.usingGamepad = false;
    input.rudderKeys = true;
    input.key('KeyQ', true);
    input.update(.25);
    const q = input.axes.yaw;
    input.clear();
    input.key('KeyE', true);
    input.update(.25);
    const e = input.axes.yaw;
    input.clear();
    return { q, e };
  });
  check('Q and E use the corrected cockpit rudder polarity',
    keyboardRudder.q > 0 && keyboardRudder.e < 0,
    JSON.stringify(keyboardRudder));

  /* Pressing start decodes the whole sample bank before the mission begins,
   * and that bank is now over a thousand recordings. On a software renderer
   * that is minutes, not seconds — so this wait is budgeted for the load, not
   * for the frame. */
  /* Dispatched rather than clicked: Playwright's actionability check waits for
   * the page to go quiet, and a page rendering a mountain range on a software
   * rasteriser never does. The listener only wants the event. */
  const audioLoadStartedAt = Date.now();
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.__beefrun.mission.phase === 'arrival', null, { timeout: 300000 });
  const audioLoadMs = Date.now() - audioLoadStartedAt;
  const started = await page.evaluate((expectedCues) => {
    const b = window.__beefrun;
    const audioEngine = b.audio.engine;
    const residentNames = [...audioEngine.buffers.keys()];
    const expectedSet = new Set(expectedCues);
    const radioSet = new Set(b.radioAudioPlan.full);
    const cx = Math.round(b.player.position.x / 500);
    const cz = Math.round(b.player.position.z / 500);
    return {
      phase: b.mission.phase,
      status: b.campaignState.missions.airstrip_smuggling.status,
      checkpoint: b.campaignState.missions.airstrip_smuggling.checkpoint,
      terrainChunks: b.terrain.chunks.size,
      centreChunkReady: b.terrain.chunks.has(`${cx},${cz}`),
      inventorySlots: document.querySelectorAll('#hotbar .slot').length,
      inventoryVisible: !!document.getElementById('hotbar')
        && !document.getElementById('hotbar').classList.contains('hidden'),
      inventorySlotCount: document.getElementById('hotbar')?.dataset.slotCount ?? null,
      audio: {
        manifestTotal: audioEngine.preloadStats?.manifestTotal ?? null,
        selected: audioEngine.preloadStats?.selected ?? null,
        loaded: audioEngine.loadedCount,
        residentNames: residentNames.length,
        missingExpected: expectedCues.filter((name) => !audioEngine.buffers.has(name)),
        missingRadioStartup: b.radioAudioPlan.startup
          .filter((name) => !audioEngine.buffers.has(name)),
        unexpectedResident: residentNames
          .filter((name) => !expectedSet.has(name) && !radioSet.has(name)),
        unrelatedCampaignVo: residentNames.filter((name) => name.startsWith('vo.')
          && !name.startsWith('vo.beefrun.') && !name.startsWith('vo.radio.')),
        radioStartup: b.radioAudioPlan.startup.length,
        radioFull: b.radioAudioPlan.full.length,
      },
      radio: {
        station: b.radio.station.name,
        powered: b.radio.on,
        tracks: b.radio.tracks.length,
      },
    };
  }, expectedResidentCues);
  check('starting the mission records in_progress at the airstrip checkpoint',
    started.phase === 'arrival'
      && started.status === 'in_progress'
      && started.checkpoint === 'airstrip'
      && started.terrainChunks >= 1
      && started.centreChunkReady,
    JSON.stringify(started));
  check('Beef Run keeps the shared five-box inventory visible during gameplay',
    started.inventoryVisible && started.inventorySlots === 5 && started.inventorySlotCount === '5',
    JSON.stringify({ visible: started.inventoryVisible, slots: started.inventorySlots,
      slotCount: started.inventorySlotCount }));
  check('Beef Run decodes its complete mission bank plus only the bounded shared radio bank',
    started.audio.manifestTotal === voiceManifest.sfx.length
      && started.audio.selected === expectedResidentCues.length
      && started.audio.loaded >= expectedResidentCues.length + started.audio.radioStartup
      && started.audio.loaded <= expectedResidentCues.length + started.audio.radioFull
      && started.audio.missingExpected.length === 0
      && started.audio.missingRadioStartup.length === 0
      && started.audio.unexpectedResident.length === 0
      && started.audio.unrelatedCampaignVo.length === 0,
    JSON.stringify({ ...started.audio, expected: expectedResidentCues.length, loadMs: audioLoadMs }));
  check('the shared cockpit receiver is tuned to the campaign station and starts under player control',
    started.radio.station === '97.8 THE SQUATCH'
      && started.radio.powered === false
      && started.radio.tracks > 0,
    JSON.stringify(started.radio));

  /* The old verifier exercised FlightInput directly but never crossed the
   * browser-to-Player Seam. Earn capture with a real click, then prove that
   * mouse look, a held W, and release all reach the live on-foot Player. */
  await page.locator('#scene').click({ position: { x: 480, y: 300 } });
  await page.waitForFunction(() => window.__beefrun.browserInput.snapshot().captured, null, {
    timeout: 5000,
  });
  const beforeRealInput = await page.evaluate(() => {
    const player = window.__beefrun.player;
    return { x: player.position.x, z: player.position.z, yaw: player.yaw };
  });
  await page.mouse.move(480, 300);
  await page.mouse.move(550, 265, { steps: 2 });
  await page.keyboard.down('w');
  await page.waitForFunction(({ x, z }) => {
    const player = window.__beefrun.player;
    return Math.hypot(player.position.x - x, player.position.z - z) > 0.35;
  }, beforeRealInput, { polling: 'raf', timeout: 5000 });
  const heldRealInput = await page.evaluate(() => ({
    keys: [...window.__beefrun.player.keys],
    yaw: window.__beefrun.player.yaw,
  }));
  await page.keyboard.up('w');
  const afterRealInput = await page.evaluate(() => {
    const b = window.__beefrun;
    return {
      x: b.player.position.x,
      z: b.player.position.z,
      yaw: b.player.yaw,
      keys: [...b.player.keys],
      input: b.browserInput.snapshot(),
    };
  });
  check('real click, mouse, and W input capture, look, move, and release on the airstrip',
    afterRealInput.input.captured
      && heldRealInput.keys.includes('KeyW')
      && !afterRealInput.keys.includes('KeyW')
      && Math.hypot(
        afterRealInput.x - beforeRealInput.x,
        afterRealInput.z - beforeRealInput.z,
      ) > 0.35
      && Math.abs(afterRealInput.yaw - beforeRealInput.yaw) > 0.01,
    JSON.stringify({ beforeRealInput, heldRealInput, afterRealInput }));

  const knockingIntro = await page.evaluate(async () => {
    const b = window.__beefrun;
    const handle = await b.mission.playTakeoffRecord();
    /* WAIT FOR THE RECORD TO ACTUALLY START.
     *
     * `beefIntroBoost` is stamped by `armTakeoffRecordIntro` on the element's
     * `playing` event -- deliberately, so an autoplay retry cannot burn the
     * louder twenty-four seconds in silence (see src/beefrun/audio.js). This
     * used to poll for forty fiftieths of a second and give up, which is two
     * seconds to fetch and decode `cant-you-hear-me-knocking.mp3`. It is ten
     * megabytes. So the check reported four nulls and read as a boost that was
     * never armed, when the boost was armed correctly every time and simply
     * had not started yet.
     *
     * Thirty seconds, and the readyState and currentTime come back with it, so
     * a record that genuinely never plays is distinguishable from one that was
     * still loading. */
    const deadline = Date.now() + 30000;
    while (!handle?.beefIntroBoost && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const authored = handle?.beefIntroBoost ?? null;
    const result = {
      startedVolume: handle?.volume ?? null,
      baseVolume: authored?.baseVolume ?? null,
      boostedVolume: authored?.boostedVolume ?? null,
      seconds: authored?.seconds ?? null,
      // What the element was doing, for the case where the boost never arms.
      readyState: handle?.element?.readyState ?? null,
      elementTime: Number(handle?.element?.currentTime) || 0,
      audibleSecondsRemaining: authored
        ? authored.settlesAt - b.audio.engine.ctx.currentTime
          + (Number(handle.element?.currentTime) || 0)
        : null,
    };
    b.audio.engine.stopLoop('music.knocking', 0);
    return result;
  });
  check('Can’t You Hear Me Knocking opens 30% louder for exactly 24 audible seconds',
    Math.abs(knockingIntro.startedVolume - 0.39) < 0.0001
      && Math.abs(knockingIntro.baseVolume - 0.30) < 0.0001
      && Math.abs(knockingIntro.boostedVolume - 0.39) < 0.0001
      && knockingIntro.seconds === 24
      && Math.abs(knockingIntro.audibleSecondsRemaining - 24) < 0.15,
    JSON.stringify(knockingIntro));

  const earlyRestart = await page.evaluate(async () => {
    const b = window.__beefrun;
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Tab', bubbles: true, cancelable: true,
    }));
    const menu = document.querySelector('[data-scene-pause]');
    const button = [...(menu?.querySelectorAll('button') || [])]
      .find((candidate) => candidate.textContent.trim() === 'Restart scene');
    const state = {
      checkpoint: b.mission.checkpoint,
      opened: !!menu && !menu.classList.contains('hidden'),
      restartVisible: !!button && !button.hidden && !button.disabled,
    };
    /* A player cannot hit Resume in the same event turn that Tab requested
     * pointer-lock exit. Let that real browser event settle first; otherwise
     * its delayed `pointerlockchange` arrives after resume and quite correctly
     * reopens the pause menu, freezing every later verifier action. */
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__scenePause?.resume();
    await new Promise((resolve) => setTimeout(resolve, 100));
    state.closed = !!menu && menu.classList.contains('hidden');
    state.missionPaused = b.mission.paused;
    state.pauseLayer = window.__scenePause?.isPaused() ?? null;
    return state;
  });
  check('Tab always exposes a scene restart before the first flight checkpoint',
    earlyRestart.checkpoint === null
      && earlyRestart.opened && earlyRestart.restartVisible && earlyRestart.closed
      && earlyRestart.missionPaused === false && earlyRestart.pauseLayer === false,
    JSON.stringify(earlyRestart));

  const genericChromeShift = await page.evaluate(() => {
    const b = window.__beefrun;
    b.input.clear();
    b.input.usingGamepad = false;
    b.input.enabled = true;
    b.input.throttle = 0;
    /* Exercise the same event normalizer the document listener uses. Browser
     * automation's synthetic events do not always cross pointer-lock focus,
     * so direct dispatch here would test Playwright rather than the control. */
    b.input.keyEvent(new KeyboardEvent('keydown', {
      code: '', key: 'Shift', bubbles: true, cancelable: true,
    }), true);
    b.input.update(.5);
    const held = b.input.keys.has('Shift');
    const throttle = b.input.throttle;
    b.input.keyEvent(new KeyboardEvent('keyup', {
      code: '', key: 'Shift', bubbles: true, cancelable: true,
    }), false);
    const released = !b.input.keys.has('Shift');
    b.input.clear();
    return { held, throttle, released };
  });
  check('a generic Chrome Shift modifier raises throttle and releases cleanly',
    genericChromeShift.held && genericChromeShift.throttle > .3 && genericChromeShift.released,
    JSON.stringify(genericChromeShift));

  const eye = await page.evaluate(() => {
    const p = window.__beefrun.player;
    return { y: p.position.y, ground: p.ground, eye: p.position.y - p.ground };
  });
  check('the on-foot camera rides the terrain at human eye height',
    eye.eye > 1.0 && eye.eye < 2.2 && Number.isFinite(eye.ground),
    JSON.stringify(eye));

  /* The wave-2 scene notes: the walkaround must be guided (a named next item,
   * six checklist rows, a marker that lives in the scene), the parked wing
   * must not stand inside the hangar's front wall at z=396, and Old Stove
   * starts inside the hangar (z past the door plane) so he has somewhere to
   * walk out from. */
  const scenePass = await page.evaluate(() => {
    const m = window.__beefrun.mission;
    const rows = m.preflight.checklist;
    const dx = m.player.position.x - m.lou.group.position.x;
    const dz = m.player.position.z - m.lou.group.position.z;
    const facing = Math.abs(Math.atan2(Math.sin(m.lou.group.rotation.y - Math.atan2(dx, dz)), Math.cos(m.lou.group.rotation.y - Math.atan2(dx, dz))));
    return {
      next: m.preflight.next?.name,
      rows: rows.length,
      states: rows.map((r) => r.state).join(','),
      markerInScene: !!m.preflight.marker?.parent,
      wingtipClear: m.airfield.anchors.parking.z + 17.2 / 2 < 396,
      stoveInHangar: m.stove.group.position.z > 396,
      louFaceToward: typeof m.lou.faceToward === 'function',
      louFacingPlayer: +facing.toFixed(3),
    };
  });
  check('the walkaround is guided, Lou faces Tony, and the parked aeroplane fits the field',
    scenePass.next === 'chocks'
      && scenePass.rows === 6
      && scenePass.states === 'next,todo,todo,todo,todo,todo'
      && scenePass.markerInScene
      && scenePass.wingtipClear
      && scenePass.stoveInHangar
      && scenePass.louFaceToward
      && scenePass.louFacingPlayer < 0.01,
    JSON.stringify(scenePass));

  const handoffStaging = await page.evaluate(async () => {
    const b = window.__beefrun;
    const m = b.mission;
    const THREE = b.THREE;
    const npc = await import('/src/beefrun/npc.js');
    const stand = m.airfield.anchors.stoveStand;
    const louStand = m.airfield.anchors.louStand;
    const crates = m.airfield.anchors.stoveCrates;

    // Test the actual standing figure against the parked aircraft, then put
    // him back in the hangar so the live scene still owns his entrance.
    const oldPosition = m.stove.group.position.clone();
    m.stove.group.position.copy(stand);
    m.stove.group.updateMatrixWorld(true);
    m.aircraft.group.updateMatrixWorld(true);
    const characterMeshes = [];
    const aircraftMeshes = [];
    m.stove.group.traverse((part) => { if (part.isMesh && part.visible) characterMeshes.push(part); });
    m.aircraft.group.traverse((part) => {
      if (part.isMesh && part.visible && part.material?.visible !== false) aircraftMeshes.push(part);
    });
    const collisions = [];
    for (const body of characterMeshes) {
      const bodyBox = new THREE.Box3().setFromObject(body);
      for (const part of aircraftMeshes) {
        const overlap = bodyBox.clone().intersect(new THREE.Box3().setFromObject(part));
        if (!overlap.isEmpty()) {
          const size = overlap.getSize(new THREE.Vector3());
          if (Math.min(size.x, size.y, size.z) > 0.001) collisions.push(part.name || '(unnamed)');
        }
      }
    }
    m.stove.group.position.copy(oldPosition);
    m.stove.group.updateMatrixWorld(true);

    // Reapply the authored briefing pose and inspect the pieces below the
    // shoulder joint. Shoulder contact is expected; a forearm in the torso is
    // the player-reported clipping bug.
    npc.setPose(m.lou, 'lean');
    const louRotation = m.lou.group.rotation.clone();
    /* Compare in the authored body frame. World-axis AABBs around a yawed
     * figure can overlap even when the two oriented boxes are clear. */
    m.lou.group.rotation.set(0, 0, 0);
    m.lou.group.updateMatrixWorld(true);
    const torso = new THREE.Box3().setFromObject(
      m.lou.group.getObjectByName('captain_lou_sasole-torso'),
    );
    const armClips = [];
    for (const [index, arm] of m.lou.arms.entries()) {
      for (const [part, object] of [['forearm', arm.elbow.children[0]], ['hand', arm.hand]]) {
        if (!torso.clone().intersect(new THREE.Box3().setFromObject(object)).isEmpty()) {
          armClips.push(`${index}:${part}`);
        }
      }
    }
    m.lou.group.rotation.copy(louRotation);
    m.lou.group.updateMatrixWorld(true);
    return {
      distanceToSasole: stand.distanceTo(louStand),
      distanceToCrates: stand.distanceTo(crates),
      collisions: [...new Set(collisions)],
      armClips,
    };
  });
  check('Stove joins the handoff within nine metres, stays with his crates, and clears the parked aircraft',
    handoffStaging.distanceToSasole < 9.5
      && handoffStaging.distanceToCrates < 4
      && handoffStaging.collisions.length === 0,
    JSON.stringify(handoffStaging));
  check('Sasole\'s live apron lean keeps both forearms and hands outside his torso',
    handoffStaging.armClips.length === 0,
    JSON.stringify(handoffStaging.armClips));

  /* The two men on the apron are named, and the names ride with them. */
  const tags = await page.evaluate(async () => {
    const m = window.__beefrun.mission;
    const V = window.__beefrun.physics.position.constructor;
    const read = (f) => {
      const p = new V();
      f.tag?.getWorldPosition(p);
      return {
        text: f.tag?.userData.text ?? null,
        sprite: f.tag?.type === 'Sprite',
        onFigure: f.tag?.parent === f.group,
        world: p.clone(),
      };
    };
    const lou = read(m.lou);
    const stoveBefore = read(m.stove);
    // Walk him a few metres and see whether the name goes with him.
    const npc = await import('/src/beefrun/npc.js');
    const from = m.stove.group.position.clone();
    npc.walkTo(m.stove, from.x + 6, from.z - 6, { speed: 40 });
    for (let i = 0; i < 30; i++) npc.updateFigure(m.stove, 0.05, null);
    const stoveAfter = read(m.stove);
    const figureMoved = +m.stove.group.position.distanceTo(from).toFixed(2);
    const tagMoved = +stoveAfter.world.distanceTo(stoveBefore.world).toFixed(2);
    m.stove.group.position.copy(from);
    m.stove.walk = null;
    m.stove.group.updateMatrixWorld(true);
    return {
      lou: { text: lou.text, sprite: lou.sprite, onFigure: lou.onFigure },
      stove: { text: stoveBefore.text, sprite: stoveBefore.sprite, onFigure: stoveBefore.onFigure },
      figureMoved,
      tagMoved,
    };
  });
  check('both airfield NPCs carry a name tag that tracks them',
    tags.lou.text === 'CAPT. LOU SASOLE' && tags.lou.sprite && tags.lou.onFigure
      && tags.stove.text === 'OLD STOVE' && tags.stove.sprite && tags.stove.onFigure
      && tags.figureMoved > 1 && Math.abs(tags.tagMoved - tags.figureMoved) < 0.5,
    JSON.stringify(tags));

  /* Captain Sasole wears his own face, and does not stand perfectly still. */
  const sasole = await page.evaluate(async () => {
    const m = window.__beefrun.mission;
    const npc = await import('/src/beefrun/npc.js');
    const skull = m.lou.neck.children.find((c) => Array.isArray(c.material));
    const faceMat = skull?.material[4];
    const img = faceMat?.map?.image;
    // Twenty seconds of standing about, sampled.
    const seen = { hipX: [], hipZ: [], arm: [] };
    for (let i = 0; i < 400; i++) {
      npc.updateFigure(m.lou, 0.05, null);
      seen.hipX.push(m.lou.hips.position.x);
      seen.hipZ.push(m.lou.hips.rotation.z);
      seen.arm.push(m.lou.arms[0].shoulder.rotation.x);
    }
    const span = (a) => +(Math.max(...a) - Math.min(...a)).toFixed(4);
    return {
      photoSkull: !!skull,
      faceOnFront: !!faceMat?.map,
      textureLoaded: !!(img && img.width > 0),
      src: faceMat?.map?.image?.currentSrc?.split('/').slice(-2).join('/') ?? null,
      sway: span(seen.hipX),
      lean: span(seen.hipZ),
      gesture: span(seen.arm),
    };
  });
  check("Captain Sasole wears his own photograph and does not stand like a post",
    sasole.photoSkull && sasole.faceOnFront && sasole.textureLoaded
      && sasole.src === 'faces/sasole.png'
      && sasole.sway > 0.01 && sasole.lean > 0.01 && sasole.gesture > 0.3,
    JSON.stringify(sasole));

  /* The walkaround marker stands on the part, not on the grass behind it. */
  const marks = await page.evaluate(() => {
    const b = window.__beefrun;
    // The marker only exists once the walkaround is armed.
    b.mission.setPhase('preflight');
    const pf = b.mission.preflight;
    const V = b.physics.position.constructor;
    const names = ['chocks', 'caps', 'props', 'sample', 'door', 'surfaces'];
    const rows = [];
    for (const name of names) {
      for (const n of names) pf.tasks[n].done = names.indexOf(n) < names.indexOf(name);
      pf.update(0.016, b.physics, b.mission.camera);
      const target = pf.markerTarget();
      const tw = new V(); target.getWorldPosition(tw);
      const mw = new V(); pf.marker.getWorldPosition(mw);
      rows.push({ name, off: +mw.distanceTo(tw).toFixed(2), up: +(mw.y - tw.y).toFixed(2) });
    }
    for (const n of names) pf.tasks[n].done = false;
    pf.update(0.016, b.physics, b.mission.camera);
    return {
      rows,
      // The highlight has to be readable through the aeroplane it is on.
      throughMetal: pf.markerRing.material.depthTest === false,
    };
  });
  check('every walkaround marker sits on its own part, drawn through the airframe',
    marks.rows.every((r) => r.off < 0.6) && marks.throughMetal,
    JSON.stringify(marks));

  /* The fuel sample: stand where the marker is, press E, get a cup. Twice. */
  const sample = await page.evaluate(() => {
    const b = window.__beefrun;
    const pf = b.mission.preflight;
    for (const n of ['chocks', 'caps', 'props']) pf.tasks[n].done = true;
    const standAtMarker = () => {
      pf.update(0.016, b.physics, b.mission.camera);
      /* The scoped audio bank makes Start fast enough that this synthetic
       * teleport can run before the renderer's first post-begin matrix pass.
       * A player cannot interact before a displayed frame; mirror that frame
       * boundary so the drain's child hit proxy has its current world matrix. */
      b.mission.scene.updateMatrixWorld(true);
      const target = pf.markerTarget();
      const V = b.physics.position.constructor;
      const wp = new V(); target.getWorldPosition(wp);
      /* The bright marker stays on the actual valve; its footprint is the
       * player-facing stand point. The fuel drains deliberately put that
       * footprint outboard of the wing root so the player can see and reach
       * the valve rather than standing directly underneath it. */
      const mk = new V();
      pf.markerFoot.getWorldPosition(mk);
      b.player.position.x = mk.x;
      b.player.position.z = mk.z;
      b.player.ground = b.player.position.y - b.player.eyeHeight;
      const dx = wp.x - b.player.position.x;
      const dz = wp.z - b.player.position.z;
      const dy = wp.y - b.player.position.y;
      const h = Math.hypot(dx, dz);
      b.player.yaw = Math.atan2(-dx, -dz);
      b.player.pitch = Math.max(b.player.pitchMin, Math.min(b.player.pitchMax, Math.atan2(dy, h)));
      b.player.update(0.001);
      b.player.camera.updateMatrixWorld(true);
      b.interaction.update(0.016);
      return b.interaction.current === target;
    };
    const found = [];
    const tap = () => { b.interaction.press(); b.interaction.release(); };
    found.push(standAtMarker());
    const promptShown = !document.getElementById('prompt').classList.contains('hidden');
    tap();
    const afterOne = pf.tasks.sample.count;
    found.push(standAtMarker());
    tap();
    return {
      crosshairFoundBoth: found.every(Boolean),
      promptShown,
      afterOne,
      done: pf.tasks.sample.done,
      count: pf.tasks.sample.count,
      need: pf.tasks.sample.need,
      drawn: pf.sampleDrawn.slice(),
      puddles: pf.puddles.size,
    };
  });
  check('a fuel sample can be drawn by pressing E where the marker stands',
    sample.crosshairFoundBoth && sample.promptShown
      && sample.afterOne === 1 && sample.done && sample.count === 2
      && sample.drawn.every(Boolean) && sample.puddles === 2,
    JSON.stringify(sample));

  /* Old Stove's crates say what they are on the lid and what they are not on
   * both sides. */
  const crates = await page.evaluate(async () => {
    const cargo = await import('/src/beefrun/cargo.js');
    const crate = cargo.makeGunCrate(0);
    const decals = crate.group.children.filter((c) => c.material?.map);
    const lid = decals.find((d) => Math.abs(d.rotation.x + Math.PI / 2) < 0.01);
    const sides = decals.filter((d) => d !== lid);
    return {
      lid: !!lid,
      lidPainted: !!(lid?.material.map.image?.width),
      sides: sides.length,
      bothFaces: sides.length === 2
        && sides.some((s) => s.position.z > 0) && sides.some((s) => s.position.z < 0),
      sharedSideArt: sides.length === 2 && sides[0].material.map === sides[1].material.map,
    };
  });
check("the gun crates carry a rifle on the lid and Stove's story on both sides",
  crates.lid && crates.lidPainted && crates.bothFaces && crates.sharedSideArt,
  JSON.stringify(crates));

/* Loading used to be a cart-routing minigame: lift, park, push, choose a bay,
 * strap, then close the door. The authored route is now deliberately direct:
 * each E on a crate secures the next bay and the third closes the door. */
const directLoading = await page.evaluate(async () => {
  const b = window.__beefrun;
  const { Loading } = await import('/src/beefrun/loading.js');
  const { CargoWeightSystem } = await import('/src/beefrun/cargo.js');
  const Group = b.aircraft.group.constructor;
  const stage = new Group();
  const hold = new Group();
  b.mission.scene.add(stage);
  const cargo = new CargoWeightSystem(hold);
  const loading = new Loading({
    scene: stage,
    interaction: b.interaction,
    aircraft: { group: new Group() },
    cargo,
    dialogue: { play() {} },
    audio: { play() {} },
    groundAt: () => 0,
    stackAt: { x: 9000, z: 9000 },
    kind: 'jerky',
    count: 3,
  });
  let completed = false;
  loading.onComplete = () => { completed = true; };
  loading.arm();
  const openedForCrates = loading.doorOpen && !loading.doorLatched;
  const targets = loading.registered.length;
  const labels = loading.crates.map((crate) => loading.loadCrate(crate));
  const result = {
    noCart: !loading.cart,
    openedForCrates,
    targets,
    labels,
    aboard: cargo.crateCount,
    strapped: cargo.allStrapped,
    doorClosed: !loading.doorOpen && loading.doorLatched,
    completed,
  };
  loading.dispose();
  stage.parent?.remove(stage);
  return result;
});
check('each crate loads directly with E, without a cart or hold-bay steps',
  directLoading.noCart && directLoading.openedForCrates
    && directLoading.targets === 3 && directLoading.labels.every(Boolean)
    && directLoading.aboard === 3 && directLoading.strapped
    && directLoading.doorClosed && directLoading.completed,
  JSON.stringify(directLoading));

const stoveDelivery = await page.evaluate(async () => {
  const { Loading } = await import('/src/beefrun/loading.js');
  const { CargoWeightSystem } = await import('/src/beefrun/cargo.js');
  const Group = window.__beefrun.aircraft.group.constructor;
  const aircraft = {
    group: new Group(),
    parts: { doorHandle: new Group(), doorLever: new Group() },
  };
  const cargo = new CargoWeightSystem(aircraft.group);
  const interaction = {
    register(mesh, desc) { mesh.userData.interact = desc; },
    unregister(mesh) { delete mesh.userData.interact; },
  };
  const loading = new Loading({
    scene: new Group(), interaction, aircraft, cargo,
    dialogue: { play() {} }, audio: { play() {} },
    groundAt: () => 0, stackAt: { x: 0, z: 0 }, kind: 'guns', count: 3,
  });
  loading.arm();
  loading.crates.forEach((crate) => loading.loadCrate(crate));
  loading.armUnload({ x: 8, z: 8 });
  const door = aircraft.parts.doorHandle.userData.interact;
  const doorLabel = door.label();
  door.onUse();
  const bayLabels = Object.values(loading.zoneHits).map((hit) => hit.userData.interact.label());
  const visibleBays = Object.values(loading.zoneHits).every((hit) => hit.visible);
  loading.dispose();
  return { doorLabel, bayLabels, visibleBays };
});
check('Old Stove delivery names the door action and every marked cargo bay',
  /Old Stove/i.test(stoveDelivery.doorLabel)
    && stoveDelivery.visibleBays
    && stoveDelivery.bayLabels.length === 3
    && stoveDelivery.bayLabels.every((label) => /Deliver Old Stove.+bay/i.test(label)),
  JSON.stringify(stoveDelivery));

const runwayStart = await page.evaluate(() => {
  const b = window.__beefrun;
  const m = b.mission;
  m.disarmBoardingTarget();
  m.flags.louAboard = false;
  m.flags.inCockpit = false;
  m.setPhase('boarding');
  const hiddenUntilLouSeats = !m.boardTarget;

  // A direct or stale interaction cannot cut away while Lou is still climbing.
  m.enterCockpit();
  const earlyBoardBlocked = m.phase === 'boarding' && !m.flags.inCockpit;
  // Real frames cross the reparent point before the climb finishes. Advancing
  // in slices catches world/local transform bugs that a single 3.5 s jump hides.
  for (let i = 0; i < 14; i++) m.updateBoarding(0.25);
  const offeredAfterLouSeats = m.flags.louAboard && !!m.boardTarget;
  const louSeat = {
    parented: m.lou.group.parent === b.aircraft.group,
    localError: m.lou.group.position.distanceTo(b.aircraft.copilotSeat),
    pose: m.lou.pose,
  };
  m.enterCockpit();
  // Exercise one real cockpit frame after this FRESH boarding, not only the
  // checkpoint-resume pose checked later in this verifier. This was the path
  // that could leave the right seat visually empty even though a saved flight
  // happened to restore Sasole correctly.
  b.aircraft.syncTo(b.physics);
  m.updateLou(0.016);
  b.aircraft.group.updateMatrixWorld(true);
  const expectedSeatWorld = b.aircraft.copilotSeat.clone().applyMatrix4(b.aircraft.group.matrixWorld);
  const actualSeatWorld = m.lou.group.getWorldPosition(b.physics.position.clone());
  let visibleMeshes = 0;
  m.lou.group.traverse((part) => {
    if (!part.isMesh) return;
    let visible = true;
    for (let node = part; node; node = node.parent) visible = visible && node.visible;
    if (visible) visibleMeshes++;
  });
  const freshRightSeat = {
    parented: m.lou.group.parent === b.aircraft.group,
    localError: m.lou.group.position.distanceTo(b.aircraft.copilotSeat),
    worldError: actualSeatWorld.distanceTo(expectedSeatWorld),
    groupVisible: m.lou.group.visible,
    visibleMeshes,
    torsoVisible: m.lou.group.getObjectByName('captain_lou_sasole-torso')?.visible,
    cupHidden: m.lou.cup?.visible === false,
    tagHidden: m.lou.tag?.visible === false,
  };

  const target = m.airfield.anchors.lineUp;
  const staged = {
    phase: m.phase,
    flagged: m.flags.runwayStaged,
    x: b.physics.position.x,
    z: b.physics.position.z,
    targetX: target.x,
    targetZ: target.z,
    heading: b.physics.headingDeg,
    targetHeading: m.airfield.anchors.departHeading,
    speed: b.physics.velocity.length(),
    inputBrake: b.input.parkingBrake,
    physicsBrake: b.physics.controls.parkingBrake,
  };

  // Complete the checklist state and release the brake: the next phase must be
  // takeoff on this same centreline, never the removed player-taxi leg.
  b.engines.forceRunning();
  b.input.throttle = 0.1;
  b.input.parkingBrake = false;
  b.physics.controls.parkingBrake = false;
  m.updateStartup(0.016);

  return {
    hiddenUntilLouSeats,
    earlyBoardBlocked,
    offeredAfterLouSeats,
    louSeat,
    freshRightSeat,
    staged,
    takeoffPhase: m.phase,
    lineupReady: m.flags.lineupReady,
    objective: m.objective,
  };
});
check('Lou seats first, then boarding cuts the stopped aircraft to runway 18',
  runwayStart.hiddenUntilLouSeats
    && runwayStart.earlyBoardBlocked
    && runwayStart.offeredAfterLouSeats
    && runwayStart.louSeat.parented
    && runwayStart.louSeat.localError < 0.001
    && runwayStart.louSeat.pose === 'sit'
    && runwayStart.freshRightSeat.parented
    && runwayStart.freshRightSeat.localError < 0.001
    && runwayStart.freshRightSeat.worldError < 0.001
    && runwayStart.freshRightSeat.groupVisible
    && runwayStart.freshRightSeat.visibleMeshes >= 8
    && runwayStart.freshRightSeat.torsoVisible
    && runwayStart.freshRightSeat.cupHidden
    && runwayStart.freshRightSeat.tagHidden
    && runwayStart.staged.phase === 'startup'
    && runwayStart.staged.flagged
    && Math.abs(runwayStart.staged.x - runwayStart.staged.targetX) < 0.01
    && Math.abs(runwayStart.staged.z - runwayStart.staged.targetZ) < 0.01
    && Math.abs(runwayStart.staged.heading - runwayStart.staged.targetHeading) < 0.01
    && runwayStart.staged.speed < 0.01
    && runwayStart.staged.inputBrake
    && runwayStart.staged.physicsBrake,
  JSON.stringify(runwayStart));
check('finishing the runway startup goes directly to takeoff, not taxi',
  runwayStart.takeoffPhase === 'lineup'
    && runwayStart.lineupReady
    && /take off/i.test(runwayStart.objective),
  JSON.stringify({
    phase: runwayStart.takeoffPhase,
    lineupReady: runwayStart.lineupReady,
    objective: runwayStart.objective,
  }));

const chain = await page.evaluate(() => {
    const m = window.__beefrun.mission;
    const out = [];
    const record = () => {
      const mission = window.__beefrun.campaignState.missions.airstrip_smuggling;
      out.push({ checkpoint: mission.checkpoint, cargoLoaded: mission.cargoLoaded });
    };
    m.saveCheckpoint('takeoff'); record();
    m.saveCheckpoint('approach'); record();
    m.saveCheckpoint('departure'); record();
    m.saveCheckpoint('return'); record();
    return out;
  });
  check('every mission checkpoint persists through the campaign save',
    chain[0].checkpoint === 'airstrip'
      && chain[1].checkpoint === 'remote_strip'
      && chain[2].checkpoint === 'returning' && chain[2].cargoLoaded
      && chain[3].checkpoint === 'landed_home',
    JSON.stringify(chain));

  const detected = await page.evaluate(() => {
    window.__beefrun.mission.onDetectionState('located');
    return window.__beefrun.campaignState.missions.airstrip_smuggling.detected;
  });
  check('being located by the patrol persists on the mission record', detected === true);

  const completed = await page.evaluate(async () => {
    const b = window.__beefrun;
    const m = b.mission;
    const p = b.physics;
    const beforeTransition = {
      pauseLayer: window.__scenePause?.isPaused() ?? null,
      missionPaused: m.paused,
      completeUp: b.flightHud.completeUp,
      pointerLocked: document.pointerLockElement === b.renderer.domElement,
    };
    /* Exercise the authored landed flow instead of calling the ending. A real
     * stopped touchdown advances final -> shutdown; a real stop at the hangar
     * advances shutdown -> ending and is what invokes runEnding(). */
    m.finished = false;
    m.phase = 'final';
    p.position.x = m.airfield.anchors.lineUp.x;
    p.onGround = true;
    p.groundSpeed = 0;
    p.velocity.set(0, 0, 0);
    m.updateFinal(0.016);
    const phaseAfterLanding = m.phase;

    const hangar = m.airfield.anchors.hangarDoor;
    p.setPose(new b.THREE.Vector3(
      hangar.x,
      p.getHeight(hangar.x, hangar.z) + p.ac.gearY,
      hangar.z,
    ), m.airfield.anchors.parkingHeading, 0);
    p.onGround = true;
    p.groundSpeed = 0;
    b.aircraft.syncTo(p);
    m.updateShutdown(0.016);
    const phaseAfterTaxi = m.phase;

    b.aircraft.group.updateMatrixWorld(true);
    const aircraftLocal = b.aircraft.group.worldToLocal(b.player.position.clone());
    const colliderHits = b.player.world.colliders.filter((box) => {
      const position = b.player.position;
      if (position.y + 0.05 < box.min.y
        || position.y - b.player.eyeHeight > box.max.y) return false;
      const cx = Math.max(box.min.x, Math.min(box.max.x, position.x));
      const cz = Math.max(box.min.z, Math.min(box.max.z, position.z));
      return (position.x - cx) ** 2 + (position.z - cz) ** 2 < 0.30 ** 2;
    }).length;
    const beforeWalk = b.player.position.clone();
    b.player.keys.add('KeyW');
    /* WAIT FOR FRAMES, NOT FOR THE CLOCK.
     *
     * This held W for 400 ms of wall time and then asked how far he had gone.
     * Under load that is not a walk, it is a coin: this check reported `moved`
     * and `velocity` both at EXACTLY zero -- which reads as a player who
     * refuses to move -- while three other browser verifiers and a handful of
     * agents were competing for the machine and the page had been handed
     * approximately no animation frames at all. Zero frames, zero movement,
     * and a report that the end of the mission strands you beside the
     * aeroplane unable to walk. It does not; it was starved.
     *
     * So the walk is measured in FRAMES the page actually got. Twenty-four of
     * them is four hundred milliseconds on a machine doing nothing else and
     * however long it takes on one that is busy, which is the same
     * measurement either way. The 5 s ceiling keeps a genuinely dead loop
     * failing instead of hanging. */
    const frames = await new Promise((resolve) => {
      let n = 0;
      const deadline = Date.now() + 5000;
      const tick = () => {
        if (++n >= 24 || Date.now() > deadline) { resolve(n); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    /* Why he did not move, for the case where he does not.
     *
     * `moved` on its own cannot tell "the player refused to walk" from "the
     * frame loop never called him", and those want completely different
     * fixes. Everything the walk itself needs is in here; a reading of all-
     * correct-but-speed-zero means `player.update()` is not being reached,
     * which puts the fault in the caller (see the on-foot branch of `frame()`
     * in src/beefrun/main.js and what gates it) rather than in the player. */
    const walkProbe = {
      moveScale: b.player.moveScale,
      speed: b.player.velocity.length(),
      tween: !!b.player._tween,
      mode: b.player.mode,
      enabled: b.player.enabled,
      keysHeld: [...b.player.keys],
      completeUp: b.flightHud.completeUp ?? null,
      /* The frame loop's own gate, so "he would not walk" and "he was never
       * asked to" stop looking identical from out here. */
      gameStarted: b.game?.started ?? null,
      gamePaused: b.game?.paused ?? null,
      inCockpitFlag: b.mission.flags.inCockpit,
      framesGranted: frames,
    };
    b.player.keys.delete('KeyW');
    const state = b.campaignState;
    return {
      status: state.missions.airstrip_smuggling.status,
      landingQuality: state.missions.airstrip_smuggling.landingQuality,
      day: state.story.day,
      timeMinutes: state.story.timeMinutes,
      timeEvents: state.story.timeEvents,
      exit: {
        beforeTransition,
        phaseAfterLanding,
        phaseAfterTaxi,
        finished: m.finished,
        pauseLayer: window.__scenePause?.isPaused() ?? null,
        missionPaused: m.paused,
        completeUp: b.flightHud.completeUp,
        pointerLocked: document.pointerLockElement === b.renderer.domElement,
        inCockpit: b.mission.flags.inCockpit,
        enabled: b.player.enabled,
        mode: b.player.mode,
        aircraftLocal: aircraftLocal.toArray(),
        colliderHits,
        moved: b.player.position.distanceTo(beforeWalk),
        walkProbe,
        cameraDistance: b.camera.position.distanceTo(b.player.position),
      },
    };
  });
  check('the ending records durable completion with a landing quality',
    completed.status === 'complete'
      && typeof completed.landingQuality === 'string'
      && completed.landingQuality.length > 0,
    JSON.stringify({ status: completed.status, landingQuality: completed.landingQuality }));
  check('completion lands the authored clock at Day 2, 8:30 PM',
    completed.day === 2
      && completed.timeMinutes === 20 * 60 + 30
      && completed.timeEvents.includes('mission.airstrip'),
    JSON.stringify({ day: completed.day, timeMinutes: completed.timeMinutes }));
  check('completion puts the player outside the fuselage with walking and camera control',
    completed.exit.phaseAfterLanding === 'shutdown'
      && completed.exit.phaseAfterTaxi === 'ending'
      && completed.exit.finished === true
      && completed.exit.inCockpit === false
      && completed.exit.enabled === true
      && completed.exit.mode === 'walk'
      && Math.abs(completed.exit.aircraftLocal[0]) > 2.5
      && completed.exit.colliderHits === 0
      && completed.exit.moved > 0.2
      && completed.exit.cameraDistance < 0.2,
    JSON.stringify(completed.exit));

  await page.evaluate(() => {
    // The real end-card path: releases pointer lock and shows the buttons.
    window.__beefrun.flightHud.showComplete(window.__beefrun.mission.report());
  });
  const frozen = await page.evaluate(async () => {
    // Give the aeroplane a shove; a live simulation would integrate it.
    const b = window.__beefrun;
    b.physics.velocity.set(0, 0, 5);
    const before = { x: b.physics.position.x, z: b.physics.position.z };
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      completeUp: b.flightHud.completeUp,
      moved: Math.abs(b.physics.position.x - before.x)
        + Math.abs(b.physics.position.z - before.z),
      radio: {
        on: b.radio.on,
        paused: b.radio._paused,
        mediaPaused: b.radio.el?.paused ?? true,
        beds: [...b.audio.engine.loops.keys()].filter((key) => key.startsWith('radio.')).sort(),
      },
    };
  });
  check('the simulation freezes under the report card',
    frozen.completeUp === true && frozen.moved < 0.01, JSON.stringify(frozen));
  check('the Beef Run report card pauses its physical receiver with no stale radio beds',
    (!frozen.radio.on || frozen.radio.paused)
      && frozen.radio.mediaPaused && frozen.radio.beds.length === 0,
    JSON.stringify(frozen.radio));
  const endPauseState = await page.evaluate(() => {
    const wasPaused = window.__scenePause?.isPaused() ?? false;
    window.__scenePause?.resume();
    return { wasPaused, closed: !window.__scenePause?.isPaused() };
  });
  check('the pause layer is closed before the completion-card action',
    endPauseState.closed,
    JSON.stringify(endPauseState));
  await page.click('#br-home');
  await page.waitForFunction(
    () => /index\.html/.test(location.pathname) || location.pathname.endsWith('/'),
    null,
    { timeout: 20000 },
  );
  check('the end card returns to the apartment in preview mode',
    await page.evaluate(() => new URLSearchParams(location.search).get('preview') === '1'));
  check('the whole playthrough leaves the canonical save untouched',
    unchanged(await storageSnapshot()));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
  await page.close();

  /* ---- pass two: a saved mid-mission campaign resumes in the cockpit ---- */

  const resumePage = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const resumeProblems = [];
  resumePage.on('pageerror', (error) => resumeProblems.push(error.message));
  resumePage.on('console', (message) => {
    if (message.type() === 'error') resumeProblems.push(message.text().slice(0, 240));
  });
  await resumePage.addInitScript(() => {
    // A campaign parked mid-mission on the loaded return leg.
    const save = {
      version: 2,
      revision: 1,
      scene: { id: 'airstrip_smuggling', spawn: 'hangar' },
      story: {
        chapter: 'day_two',
        day: 2,
        timeMinutes: 9 * 60 + 10,
        meetingKnown: false,
        meetingLearnedFrom: null,
        timeEvents: ['travel.airstrip'],
      },
      activities: {},
      inventory: { held: [], concealed: [] },
      events: {
        lou_first_call: { status: 'answered' },
        booski_day_two_call: { status: 'answered' },
        lou_second_call: { status: 'pending' },
      },
      missions: {
        bada_bing_one: { status: 'complete', packageReceived: true },
        squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
        airstrip_smuggling: {
          status: 'in_progress', checkpoint: 'returning', cargoLoaded: true,
          detected: false, landingQuality: null,
        },
        bada_bing_two: { status: 'locked' },
        jerky_motel: { status: 'locked' },
      },
    };
    localStorage.setItem('squatchlife.campaign', JSON.stringify(save));
  });
  await resumePage.goto(`http://localhost:${PORT}/beefrun.html?airSeed=1977`, { waitUntil: 'load' });
  await resumePage.waitForFunction(() => window.__beefrun?.story, null, { timeout: 60000 });
  await resumePage.evaluate(() => document.getElementById('start-btn').click());
  await resumePage.waitForFunction(
    () => window.__beefrun.mission.flags.inCockpit,
    null,
    { timeout: 300000 },
  );
  const resumed = await resumePage.evaluate(async () => {
    const b = window.__beefrun;
    const { AC } = await import('/src/beefrun/config.js');
    const start = b.mission.airstrip.anchors.departStart;
    return {
      phase: b.mission.phase,
      inCockpit: b.mission.flags.inCockpit,
      checkpoint: b.campaignState.missions.airstrip_smuggling.checkpoint,
      restartCheckpoint: b.mission.checkpoint,
      cargoLoaded: b.campaignState.missions.airstrip_smuggling.cargoLoaded,
      position: { x: b.physics.position.x, y: b.physics.position.y, z: b.physics.position.z },
      start,
      fuel: b.engines.fuel,
      fullFuel: AC.fuelMass,
      enginesRunning: b.engines.bothRunning,
      damage: { ...b.physics.damage },
      input: {
        throttle: b.input.throttle,
        flaps: b.input.flaps,
        airBrake: b.input.airBrake,
        parkingBrake: b.input.parkingBrake,
      },
    };
  });
  check('a saved returning checkpoint resumes loaded in the cockpit at departure',
    resumed.inCockpit
      && resumed.phase === 'heavyTakeoff'
      && resumed.checkpoint === 'returning'
      && resumed.restartCheckpoint === 'departure'
      && resumed.cargoLoaded,
    JSON.stringify(resumed));
  check('the Cecilio handoff repairs, refuels, restarts, and stages the return aeroplane',
    Math.abs(resumed.position.x - resumed.start.x) < 0.01
      && Math.abs(resumed.position.y - (resumed.start.y + 1.62)) < 0.01
      && Math.abs(resumed.position.z - resumed.start.z) < 0.01
      && resumed.fuel === resumed.fullFuel
      && resumed.enginesRunning
      && resumed.damage.wing === 0 && resumed.damage.gear === 0 && !resumed.damage.tireBurst
      && resumed.input.throttle === 0 && resumed.input.flaps === 0.5
      && resumed.input.airBrake === 0 && resumed.input.parkingBrake,
    JSON.stringify(resumed));

  /* The seat looks where the aeroplane is going, over the top of its own
   * panel, and the gauges face the man who has to read them. */
  const seat = await resumePage.evaluate(() => {
    const b = window.__beefrun;
    const m = b.mission;
    const cam = b.player.camera;
    const ac = b.aircraft;
    const V = b.physics.position.constructor;
    const camFwd = new V(0, 0, -1).applyQuaternion(cam.quaternion);
    const noseFwd = new V(0, 0, 1).applyQuaternion(ac.group.quaternion);
    // The tallest thing between the eye and the windshield.
    const coaming = ac.parts.cockpit.children.find(
      (c) => c.geometry?.parameters?.width === 1.7 && c.geometry.parameters.height === 0.1,
    );
    const panel = ac.parts.cockpit.children.find(
      (c) => c.geometry?.parameters?.width === 1.62,
    );
    const gauges = panel?.children.find((c) => c.material?.map === ac.parts.panelTex);
    ac.group.updateMatrixWorld(true);
    cam.updateMatrixWorld(true);
    const project = (object) => {
      if (!object) return null;
      const point = new V();
      object.getWorldPosition(point);
      point.project(cam);
      return { x: point.x, y: point.y, z: point.z,
        visible: Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && point.z >= -1 && point.z <= 1 };
    };
    const tammyImage = ac.parts.tammySticker?.material?.map?.image;
    return {
      facesNose: +camFwd.dot(noseFwd).toFixed(3),
      eyeY: ac.pilotEye.y,
      eyeX: ac.pilotEye.x,
      copilotX: ac.copilotSeat.x,
      louSeatedX: m.flags.louAboard ? m.lou.group.position.x : null,
      // Which side each nacelle is on, indexed the way engines.js names them.
      nacelleX: ac.parts.prop?.map((hub) => +hub.position.x.toFixed(2)),
      coamingTopY: coaming ? +(coaming.position.y + 0.05).toFixed(3) : null,
      panelTopY: panel ? +(panel.position.y + panel.geometry.parameters.height / 2).toFixed(3) : null,
      gaugesFacePilot: !!gauges && Math.abs(gauges.rotation.y - Math.PI) < 0.01,
      hudUp: !document.getElementById('br-hud').classList.contains('hidden'),
      controlsUp: !document.getElementById('br-controls').classList.contains('hidden'),
      controlKeys: document.querySelectorAll('#br-controls kbd').length,
      controlsText: document.getElementById('br-controls').textContent,
      airBrakeHud: document.getElementById('br-airbrake')?.textContent,
      tammy: {
        name: ac.parts.tammySticker?.name,
        x: ac.parts.tammySticker?.position.x,
        sourceSlot: ac.parts.tammySticker?.userData.sourceSlot,
        sourceFile: ac.parts.tammySticker?.userData.sourceFile,
        imageSrc: tammyImage?.currentSrc || tammyImage?.src || '',
        loadedWidth: tammyImage?.naturalWidth || tammyImage?.width || 0,
        projected: project(ac.parts.tammySticker),
      },
      radio: {
        name: ac.parts.radioStack?.name,
        units: ac.parts.radioStack?.children.filter((c) => /^radio-unit-/.test(c.name)).length,
        displays: ac.parts.radioStack?.children.filter((c) => /^radio-display-/.test(c.name)).length,
        knobs: ac.parts.radioStack?.children.filter((c) => /^radio-knob-/.test(c.name)).length,
        projected: project(ac.parts.radioStack),
      },
      tailSupport: ac.parts.tailSupport?.children.map((brace) => ({
        name: brace.name,
        endpoints: !!brace.userData.memberEnds?.a && !!brace.userData.memberEnds?.b,
        span: brace.userData.memberEnds?.a?.distanceTo(brace.userData.memberEnds?.b),
        geometryLength: brace.geometry?.parameters?.height,
      })),
      exterior: ac.parts.exteriorDetails?.children.map((part) => part.name),
      airBrakePanels: ac.parts.airBrake?.map((panel) => panel.name),
    };
  });
  check('the left seat looks over the panel at where the nose is pointing',
    seat.facesNose > 0.99
      && seat.eyeY >= 0.96
      && seat.eyeY > seat.coamingTopY && seat.eyeY > seat.panelTopY
      && seat.gaugesFacePilot,
    JSON.stringify(seat));
  /* The words and the world have to agree. The nose is +Z, so the aeroplane's
   * left — the seat the objective names and the one Sasole leaves for you — is
   * +X, Sasole's right seat is -X, and the engine Sasole calls the left one
   * (index 0, started with key 1) hangs on +X too. All three used to be
   * mirrored, which is how "get into the left seat" seated the player on the
   * right while the captain climbed into the left. */
  check('the pilot is in the aeroplane\'s real left seat and Sasole is in the right',
    seat.eyeX > 0.2 && seat.copilotX < -0.2
      && (seat.louSeatedX === null || seat.louSeatedX < -0.2),
    JSON.stringify({ eyeX: seat.eyeX, copilotX: seat.copilotX, louSeatedX: seat.louSeatedX }));
  check('the engine Sasole calls the left one is on the aeroplane\'s left',
    Array.isArray(seat.nacelleX) && seat.nacelleX.length === 2
      && seat.nacelleX[0] > 0 && seat.nacelleX[1] < 0,
    JSON.stringify(seat.nacelleX));
  check('the flight HUD and the controls legend are up for the flight',
    seat.hudUp && seat.controlsUp && seat.controlKeys >= 16,
    JSON.stringify({ hudUp: seat.hudUp, controlsUp: seat.controlsUp, keys: seat.controlKeys }));
  check('keyboard bank labels match conventional flight controls',
    /A\s*bank left/i.test(seat.controlsText) && /D\s*bank right/i.test(seat.controlsText),
    seat.controlsText.replace(/\s+/g, ' ').trim());
  check('the cockpit teaches and visibly models the hold-to-deploy air brake',
    /Space\s*hold air brake/i.test(seat.controlsText)
      && /AIR BRAKE STOWED/i.test(seat.airBrakeHud || '')
      && seat.airBrakePanels?.length === 2,
    JSON.stringify({ text: seat.controlsText.replace(/\s+/g, ' ').trim(),
      hud: seat.airBrakeHud, panels: seat.airBrakePanels }));
  check('the apartment-fridge Tammy sticker rides the flying pilot\'s dash rail',
    seat.tammy.name === 'tammy-golden-ak-sticker'
      // +X is the aeroplane's left, because its nose is +Z. Her rail is the
      // outboard end of the left seat's dash, away from Sasole.
      && seat.tammy.x > 0.5
      && seat.tammy.sourceSlot === 'sticker.fridge'
      && seat.tammy.sourceFile === 'sticker-pinup.png'
      && /assets\/art\/sticker-pinup\.png(?:\?|$)/.test(seat.tammy.imageSrc)
      && seat.tammy.loadedWidth > 1
      && seat.tammy.projected?.visible,
    JSON.stringify(seat.tammy));
  check('the cockpit carries a complete readable radio stack',
    seat.radio.name === 'cockpit-radio-stack'
      && seat.radio.units === 3
      && seat.radio.displays === 3
      && seat.radio.knobs === 6
      && seat.radio.projected?.visible,
    JSON.stringify(seat.radio));
  check('tail braces, cowling bands, and the VHF aerial are attached visual detail',
    seat.tailSupport?.length === 4
      && seat.tailSupport.every((brace) => brace.endpoints)
      && seat.tailSupport.every((brace) => Math.abs(brace.span - brace.geometryLength) < 0.001)
      && seat.exterior?.filter((name) => name.startsWith('nacelle-band-')).length === 4
      && seat.exterior?.includes('vhf-radio-aerial'),
    JSON.stringify({ tailSupport: seat.tailSupport, exterior: seat.exterior }));

  const remotePresentation = await resumePage.evaluate(async () => {
    const b = window.__beefrun;
    const m = b.mission;
    const falls = m.landmarks.marks.falls.group;
    const cecilio = m.airstrip.cecilio;
    const { speak, updateFigure } = await import('/src/beefrun/npc.js');
    const mouthRest = cecilio.faceRig?.mouthRest;
    const lidRest = cecilio.faceRig?.lidRest;
    cecilio.t = 0.37;
    speak(cecilio, 1);
    updateFigure(cecilio, 0.05, null);
    const talkingFace = {
      mouth: cecilio.faceRig?.mouth.scale.y,
      jaw: cecilio.faceRig?.jaw.position.y,
    };
    cecilio.talk = 0;
    for (let i = 0; i < 20; i += 1) updateFigure(cecilio, 0.05, null);
    cecilio.faceRig.nextBlink = cecilio.t + 0.01;
    updateFigure(cecilio, 0.05, null);
    const blinkScale = cecilio.faceRig?.lids[0].scale.y;
    const nearCecilio = cecilio.group.position.clone();
    nearCecilio.z += 2;
    updateFigure(cecilio, 0.05, nearCecilio);
    const tagVisible = cecilio.tag?.visible;
    const tagOpacity = cecilio.tag?.material?.opacity;
    cecilio.talk = 0;
    for (let i = 0; i < 20; i += 1) updateFigure(cecilio, 0.05, nearCecilio);
    const settledMouth = cecilio.faceRig?.mouth.scale.y;
    return {
      falls: {
        centrelineOffset: Math.abs(falls.position.x - m.airstrip.anchors.threshold.x),
        waterlineOffset: Math.abs(
          falls.position.x + (falls.userData.waterSheets?.[0]?.position.x || 0)
            - m.airstrip.anchors.threshold.x,
        ),
        cliffPieces: falls.getObjectByName('waterfall-cliff-wall')?.children.length || 0,
        sheets: falls.userData.waterSheets?.length || 0,
        mist: falls.userData.mist?.length || 0,
        foliagePieces: falls.getObjectByName('waterfall-foliage')?.children.length || 0,
      },
      jungle: await (async () => {
        const j = m.airstrip.jungle;
        const trees = [...(j?.palms ?? []), ...(j?.canopy ?? [])];
        /* Grounding, checked against the surface the chunk MESH draws at the
         * two detail levels the strip is drawn at (and the heightfield), not
         * against the airstrip's own arithmetic -- a base above any of them
         * is a trunk on air from some seat. Exclusion, checked with the
         * airstrip's own predicate at zero margin. */
        const T = await import('/src/beefrun/terrain.js');
        const drawnGround = (x, z) => Math.min(
          T.terrainHeight(x, z),
          T.terrainMeshHeight(x, z, T.TERRAIN_DETAIL[0]),
          T.terrainMeshHeight(x, z, T.TERRAIN_DETAIL[1]),
        );
        /* Instance counts, by NAME, and `null` when the named mesh is not
         * there at all.
         *
         * That distinction is the whole reason this reads the way it does.
         * Two of these four were looking for meshes that had been renamed and
         * re-split -- the crowns are `el-hueso-jungle-foliage`, and the fronds
         * stopped being one 672-instance mesh and became seven fans of 96 so
         * each frond in the fan can carry its own droop -- and `|| 0` reported
         * a jungle that is standing there in full as "zero crowns, zero
         * fronds". A number that cannot tell a missing mesh from an empty one
         * is worse than no number: it reads as a scene that failed to build.
         *
         * The fronds are summed across the fan batches rather than pinned to
         * seven of them, so splitting or merging the fan again is not a
         * failure -- the count of fronds in the air is what this check is
         * about, and it stays 7 per palm either way. */
        const count = (name) => {
          const mesh = m.airstrip.root.getObjectByName(name);
          return mesh ? (mesh.count ?? 0) : null;
        };
        let palmFronds = null;
        m.airstrip.root.traverse((o) => {
          if (!/^el-hueso-palm-frond-fan-\d+$/.test(o.name || '')) return;
          palmFronds = (palmFronds ?? 0) + (o.count ?? 0);
        });
        return {
          trunks: count('el-hueso-jungle-trunks'),
          crowns: count('el-hueso-jungle-foliage'),
          palmTrunks: count('el-hueso-palm-trunks'),
          palmFronds,
          planted: trees.length,
          floating: trees.filter((t) => t.y > drawnGround(t.x, t.z) + 1e-6).length,
          onSurface: trees.filter((t) => j.onOperatingSurface(t.x, t.z, 0)).length,
          nearestToCentreline: Math.min(...trees.map((t) => Math.abs(t.x - m.airstrip.anchors.threshold.x))),
          sizes: (() => {
            const ss = trees.map((t) => t.s);
            return { min: Math.min(...ss), max: Math.max(...ss) };
          })(),
        };
      })(),
      airport: {
        huts: m.airstrip.root.children.filter((part) => part.name === 'hut').length,
        shelters: m.airstrip.root.children.filter((part) => part.name === 'shelter').length,
        trucks: m.airstrip.root.children.filter((part) => part.name === 'mil-truck').length,
        cargoStacks: m.airstrip.root.children.filter((part) => part.name === 'cargo-stack').length,
        antennas: m.airstrip.root.children.filter((part) => part.name === 'antenna').length,
        windsocks: m.airstrip.root.children.filter((part) => part.name === 'shirt-sock').length,
        drums: m.airstrip.drums.length,
        chickens: m.airstrip.chickens.length,
        guards: m.airstrip.guards.length,
        colliders: m.airstrip.colliders.length,
      },
      cecilio: {
        tag: cecilio.tag?.userData.text,
        authoredFace: !!cecilio.group.getObjectByName('cecilio-face'),
        eyes: cecilio.faceRig?.eyes.length,
        brows: cecilio.faceRig?.brows.length,
        mouth: !!cecilio.group.getObjectByName('cecilio-face-mouth'),
        moustache: !!cecilio.group.getObjectByName('cecilio-moustache'),
        nose: !!cecilio.group.getObjectByName('cecilio-nose'),
        medallion: !!cecilio.group.getObjectByName('cecilio-medallion'),
        jacketColour: cecilio.hips.children[0]?.material?.color?.getHex(),
        mouthRest,
        lidRest,
        talkingFace,
        blinkScale,
        tagVisible,
        tagOpacity,
        settledMouth,
      },
      guardsUntouched: m.airstrip.guards.every((guard) =>
        !guard.group.getObjectByName('cecilio-moustache')
        && !guard.group.getObjectByName('cecilio-medallion')),
    };
  });
  check('the waterfall is a layered landmark safely clear of the runway centreline',
    remotePresentation.falls.centrelineOffset >= 200
      && remotePresentation.falls.waterlineOffset <= 100
      && remotePresentation.falls.cliffPieces >= 12
      && remotePresentation.falls.sheets === 3
      && remotePresentation.falls.mist >= 6
      && remotePresentation.falls.foliagePieces >= 30,
    JSON.stringify(remotePresentation.falls));
  /* Every crowned trunk crowned, every palm with its full fan, and the whole
   * hillside still cheap to draw. The two equalities are the load-bearing
   * half: a canopy with fewer crowns than trunks is bare poles up the valley
   * wall, and a palm short of its seven fronds is a stick. */
  check('El Hueso has a low-draw-call jungle: instanced palms and an instanced canopy wall',
    remotePresentation.jungle.trunks >= 44
      && remotePresentation.jungle.crowns === remotePresentation.jungle.trunks
      && remotePresentation.jungle.palmTrunks >= 60
      && remotePresentation.jungle.palmFronds === remotePresentation.jungle.palmTrunks * 7,
    JSON.stringify(remotePresentation.jungle));
  check('every El Hueso tree is rooted at or under the drawn ground, off the strip, turnaround, apron and camp, and not all one size',
    remotePresentation.jungle.planted > 100
      && remotePresentation.jungle.floating === 0
      && remotePresentation.jungle.onSurface === 0
      && remotePresentation.jungle.nearestToCentreline >= 12
      && remotePresentation.jungle.sizes.max / remotePresentation.jungle.sizes.min > 1.6,
    JSON.stringify(remotePresentation.jungle));
  check('El Hueso already has a complete working airport camp, not an empty destination pad',
    remotePresentation.airport.huts === 4
      && remotePresentation.airport.shelters === 1
      && remotePresentation.airport.trucks === 2
      && remotePresentation.airport.cargoStacks === 3
      && remotePresentation.airport.antennas === 1
      && remotePresentation.airport.windsocks === 1
      && remotePresentation.airport.drums === 11
      && remotePresentation.airport.chickens === 7
      && remotePresentation.airport.guards === 4
      && remotePresentation.airport.colliders >= 10,
    JSON.stringify(remotePresentation.airport));
  check('Don Cecilio has a readable identity and tailored outfit while the rear guards stay unchanged',
    remotePresentation.cecilio.tag === 'DON CECILIO'
      && remotePresentation.cecilio.authoredFace
      && remotePresentation.cecilio.eyes === 2
      && remotePresentation.cecilio.brows === 2
      && remotePresentation.cecilio.mouth
      && remotePresentation.cecilio.moustache
      && remotePresentation.cecilio.nose
      && remotePresentation.cecilio.medallion
      && remotePresentation.cecilio.jacketColour === 0x6f3029
      && remotePresentation.guardsUntouched,
    JSON.stringify(remotePresentation));
  check('Cecilio’s authored face speaks and blinks during the live handoff',
    remotePresentation.cecilio.talkingFace.mouth > remotePresentation.cecilio.mouthRest
      && remotePresentation.cecilio.talkingFace.jaw < 0
      && remotePresentation.cecilio.blinkScale > remotePresentation.cecilio.lidRest
      && remotePresentation.cecilio.tagVisible
      && remotePresentation.cecilio.tagOpacity > 0
      && Math.abs(remotePresentation.cecilio.settledMouth - remotePresentation.cecilio.mouthRest) < 0.001,
    JSON.stringify({ mouthRest: remotePresentation.cecilio.mouthRest,
      lidRest: remotePresentation.cecilio.lidRest,
      talking: remotePresentation.cecilio.talkingFace,
      blink: remotePresentation.cecilio.blinkScale,
      tag: { visible: remotePresentation.cecilio.tagVisible, opacity: remotePresentation.cecilio.tagOpacity },
      settledMouth: remotePresentation.cecilio.settledMouth }));

  const cecilioProximity = await resumePage.evaluate(async () => {
    const b = window.__beefrun;
    const { MissionController } = await import('/src/beefrun/mission.js');
    const Vector3 = b.player.position.constructor;
    const heard = [];
    const played = new Set();
    let busy = false;
    const fake = {
      phase: 'onfoot-strip',
      objective: '',
      score: { gunsDelivered: 0 },
      setObjective(text) { this.objective = text; },
      setPhase(name) { this.phase = name; },
      /* `voiceMouth` is a stub of `core/mouth.js`'s `Mouth`, not an
       * omission: `speak()` in `npc.js` has called `f.voiceMouth.speak(...)`
       * since the mouth-on-the-take pass (00bab88), and this fixture (and
       * the two below built the same way) predate that -- MEASURED, without
       * it `updateGunUnload`'s `speak(cecilio, 2.2)` crashed the whole
       * verifier with "Cannot read properties of undefined (reading
       * 'speak')" the moment the proximity gate opened. Nothing here calls
       * `.update()` on this mock, only `.speak()`, so that is the only
       * method that has to exist. */
      airstrip: { cecilio: { group: { position: new Vector3(0, 0, 0) }, talk: 0, lookAt: null, voiceMouth: { speak() {}, stop() {} } } },
      player: { position: new Vector3(30, 0, 0) },
      dialogue: {
        get busy() { return busy; },
        seen(id) { return played.has(id); },
        play(id) { played.add(id); heard.push(id); busy = true; return true; },
      },
    };
    MissionController.prototype.onEnterPhase.call(fake, 'onfoot-strip');
    const onEntry = heard.slice();
    MissionController.prototype.updateOnFootStrip.call(fake, 0.016);
    const whileFar = heard.slice();
    busy = false;
    fake.player.position.set(2, 0, 0);
    MissionController.prototype.updateOnFootStrip.call(fake, 0.016);
    return { onEntry, whileFar, afterApproach: heard.slice(), objective: fake.objective,
      talkAfterApproach: fake.airstrip.cecilio.talk };
  });
  check('Cecilio and his crew wait until the player is actually in conversation range',
    cecilioProximity.onEntry.length === 0
      && cecilioProximity.whileFar.length === 0
      && cecilioProximity.afterApproach[0] === 'cecilio.meet'
      && cecilioProximity.talkAfterApproach === 0
      && /Cecilio/i.test(cecilioProximity.objective),
    JSON.stringify(cecilioProximity));

  const deliveryProximity = await resumePage.evaluate(async () => {
    const b = window.__beefrun;
    const { MissionController } = await import('/src/beefrun/mission.js');
    const Vector3 = b.player.position.constructor;
    const heard = [];
    const played = new Set();
    let busy = false;
    const fake = {
      objective: '', started: false,
      setObjective(text) { this.objective = text; },
      airstrip: { cecilio: { group: { position: new Vector3(0, 0, 0) }, talk: 0, lookAt: null, voiceMouth: { speak() {}, stop() {} } } },
      player: { position: new Vector3(30, 0, 0), yaw: 0 },
      cargo: { crateCount: 3 },
      gunLoad: { armed: false, update() {} },
      startGunUnload() { this.started = true; this.gunLoad.armed = true; },
      dialogue: {
        get busy() { return busy; },
        seen(id) { return played.has(id); },
        play(id) { played.add(id); heard.push(id); busy = true; return true; },
      },
    };
    MissionController.prototype.onEnterPhase.call(fake, 'unloadGuns');
    const entryObjective = fake.objective;
    const onEntry = heard.slice();
    MissionController.prototype.updateGunUnload.call(fake, 0.016);
    const whileFar = heard.slice();
    fake.player.position.set(2, 0, 0);
    MissionController.prototype.updateGunUnload.call(fake, 0.016);
    const atShelter = heard.slice();
    busy = false;
    MissionController.prototype.updateGunUnload.call(fake, 0.016);
    const briefing = heard.slice();
    busy = false;
    MissionController.prototype.updateGunUnload.call(fake, 0.016);
    return { onEntry, whileFar, atShelter, briefing, started: fake.started,
      entryObjective, unloadObjective: fake.objective };
  });
  check('the Old Stove handoff and unloading briefing are also proximity-gated',
    deliveryProximity.onEntry.length === 0
      && deliveryProximity.whileFar.length === 0
      && deliveryProximity.atShelter[0] === 'guns.arrive'
      && deliveryProximity.briefing[1] === 'guns.unloading'
      && deliveryProximity.started
      && /Cecilio.+shelter/i.test(deliveryProximity.entryObjective)
      && /cargo door.+press E/i.test(deliveryProximity.unloadObjective),
    JSON.stringify(deliveryProximity));

  const deliveredReaction = await resumePage.evaluate(async () => {
    const b = window.__beefrun;
    const { MissionController } = await import('/src/beefrun/mission.js');
    const Vector3 = b.player.position.constructor;
    const heard = [];
    const played = new Set();
    const fake = {
      phase: 'onfoot-strip', score: { gunsDelivered: 3 },
      airstrip: { cecilio: { group: { position: new Vector3(0, 0, 0) }, talk: 0, lookAt: null, voiceMouth: { speak() {}, stop() {} } } },
      player: { position: new Vector3(2, 0, 0) },
      dialogue: {
        busy: false,
        seen(id) { return played.has(id); },
        play(id) { played.add(id); heard.push(id); this.busy = true; return true; },
      },
      setPhase(name) { this.phase = name; },
    };
    MissionController.prototype.updateOnFootStrip.call(fake, 0.016);
    return heard;
  });
  check('Cecilio waits for Tony to return before reacting to the delivered crates',
    deliveredReaction.length === 1 && deliveredReaction[0] === 'guns.done',
    JSON.stringify(deliveredReaction));

  const terminalApproachCall = await resumePage.evaluate(async () => {
    const { selectApproachCall } = await import('/src/beefrun/approach-coaching.js');
    let approachCalls = 0; let highFinalSeen = false;
    const heard = [];
    for (let i = 0; i < 6; i++) {
      const next = selectApproachCall({
        height: 260, wantHeight: 80, toGo: 900, ias: 78,
        approachCalls, highFinalSeen,
      });
      approachCalls = next.approachCalls;
      if (next.call) heard.push(next.call);
      if (next.call === 'approach.high3') highFinalSeen = true;
    }
    return heard;
  });
  check('“Now you’re proving a point” is the terminal high-approach call, not a loop',
    JSON.stringify(terminalApproachCall)
      === JSON.stringify(['approach.high', 'approach.high2', 'approach.high3']),
    JSON.stringify(terminalApproachCall));

  const groundGuidance = await resumePage.evaluate(() => {
    const b = window.__beefrun;
    const phase = b.mission.phase;
    b.mission.phase = 'taxi';
    const taxi = b.mission.navTarget();
    b.mission.phase = 'lineup';
    const lineup = b.mission.navTarget();
    b.mission.phase = 'south';
    const outbound = b.mission.navTarget();
    b.mission.phase = 'return';
    const returning = b.mission.navTarget();
    b.mission.phase = 'home';
    const home = b.mission.navTarget();
    b.mission.phase = 'final';
    const final = b.mission.navTarget();
    b.mission.phase = phase;
    return { taxi, lineup, outbound, returning, home, final };
  });
  check('taxi and runway lineup have named physical guidance targets',
    /HOLD SHORT/.test(groundGuidance.taxi?.label || '')
      && /RUNWAY 18/.test(groundGuidance.lineup?.label || ''),
    JSON.stringify(groundGuidance));
  check('both flights progress through named approach, threshold, and touchdown targets',
    /EL HUESO RUNWAY/.test(groundGuidance.outbound?.label || '')
      && /WHISPERING PINES APPROACH/.test(groundGuidance.returning?.label || '')
      && /RWY 36 THRESHOLD/.test(groundGuidance.home?.label || '')
      && /RWY 36 TOUCHDOWN/.test(groundGuidance.final?.label || '')
      && groundGuidance.home.z < groundGuidance.final.z,
    JSON.stringify({ outbound: groundGuidance.outbound, returning: groundGuidance.returning,
      home: groundGuidance.home, final: groundGuidance.final }));

  const taxiRoute = await resumePage.evaluate(() => {
    const root = window.__beefrun.mission.airfield.root;
    return [
      'taxi-route-parking', 'taxi-route-turn', 'taxi-route-apron',
      'taxi-route-hold-short-a', 'taxi-route-hold-short-b',
    ].map((name) => ({ name, found: !!root.getObjectByName(name) }));
  });
  check('the parking stand has a continuous painted taxi route and hold-short bars',
    taxiRoute.every((part) => part.found),
    JSON.stringify(taxiRoute));

  const riverCourse = await resumePage.evaluate(() => {
    const river = window.__beefrun.mission.landmarks.marks.river.group;
    const THREE = window.__beefrun.THREE;
    const surface = river.getObjectByName('river-course-surface');
    const waterSurfaces = [];
    river.updateMatrixWorld(true);
    river.traverse((part) => {
      if (part.isMesh && part.name.endsWith('-surface')) waterSurfaces.push(part.name);
    });
    const position = surface?.geometry?.getAttribute('position');
    const vertices = position?.count || 0;
    const centres = [];
    for (let vertex = 0; vertex < vertices; vertex += 2) {
      const leftX = position.getX(vertex);
      const leftZ = position.getZ(vertex);
      const rightX = position.getX(vertex + 1);
      const rightZ = position.getZ(vertex + 1);
      centres.push({
        x: (leftX + rightX) * 0.5,
        z: (leftZ + rightZ) * 0.5,
        halfWidth: Math.hypot(leftX - rightX, leftZ - rightZ) * 0.5,
      });
    }
    let minSegmentMetres = Infinity;
    let maxTurnDegrees = 0;
    let maxTurnRow = -1;
    for (let row = 1; row < centres.length - 1; row++) {
      const ax = centres[row].x - centres[row - 1].x;
      const az = centres[row].z - centres[row - 1].z;
      const bx = centres[row + 1].x - centres[row].x;
      const bz = centres[row + 1].z - centres[row].z;
      const aLength = Math.hypot(ax, az);
      const bLength = Math.hypot(bx, bz);
      minSegmentMetres = Math.min(minSegmentMetres, aLength, bLength);
      if (aLength <= 0.01 || bLength <= 0.01) continue;
      const cosine = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (aLength * bLength)));
      const turnDegrees = Math.acos(cosine) * 180 / Math.PI;
      if (turnDegrees > maxTurnDegrees) {
        maxTurnDegrees = turnDegrees;
        maxTurnRow = row;
      }
    }
    let gravelBarCount = 0;
    let maxBarGapMetres = -Infinity;
    let maxBarGapName = null;
    river.traverse((part) => {
      if (!part.isMesh || !/-bar-\d+$/.test(part.name)) return;
      gravelBarCount++;
      const centre = river.worldToLocal(part.getWorldPosition(new THREE.Vector3()));
      const scale = part.getWorldScale(new THREE.Vector3());
      const radius = part.geometry.parameters.radius * Math.max(scale.x, scale.y, scale.z);
      let nearest = { distance: Infinity, halfWidth: 0 };
      for (const row of centres) {
        const distance = Math.hypot(centre.x - row.x, centre.z - row.z);
        if (distance < nearest.distance) nearest = { distance, halfWidth: row.halfWidth };
      }
      const gap = nearest.distance - nearest.halfWidth - radius;
      if (gap > maxBarGapMetres) {
        maxBarGapMetres = gap;
        maxBarGapName = part.name;
      }
    });
    return {
      waterSurfaces,
      vertices,
      indices: surface?.geometry?.index?.count || 0,
      rotation: surface ? [surface.rotation.x, surface.rotation.y, surface.rotation.z] : null,
      minSegmentMetres,
      maxTurnDegrees,
      maxTurnRow,
      gravelBarCount,
      maxBarGapMetres,
      maxBarGapName,
      reaches: ['river-upstream', 'river-horseshoe', 'river-downstream']
        .map((name) => !!river.getObjectByName(name)),
    };
  });
  check('the horseshoe and both reaches share one contiguous ribbon with no rotated rectangles, seams, folded tangent, or detached gravel',
    riverCourse.waterSurfaces.length === 1
      && riverCourse.waterSurfaces[0] === 'river-course-surface'
      && riverCourse.vertices > 300
      && riverCourse.indices === (riverCourse.vertices / 2 - 1) * 6
      && riverCourse.rotation.every((angle) => Math.abs(angle) < 0.000001)
      && riverCourse.minSegmentMetres > 0.01
      && riverCourse.maxTurnDegrees < 90
      && riverCourse.gravelBarCount > 0
      && riverCourse.maxBarGapMetres <= 0
      && riverCourse.reaches.every(Boolean),
    JSON.stringify(riverCourse));

  const rollKeys = await resumePage.evaluate(async () => {
    const { FlightInput } = await import('/src/beefrun/input.js');
    const { AircraftPhysics } = await import('/src/beefrun/physics.js');
    const THREE = window.__beefrun.THREE;
    const fly = ({ code = null, padX = null, padYaw = 0 }) => {
      const input = new FlightInput();
      input.pollGamepad = padX === null
        ? () => null
        : () => ({ axes: [padX, 0, padYaw, 0], buttons: [] });
      if (code) input.key(code, true);
      input.update(0.2);
      const axes = { roll: input.axes.roll, yaw: input.axes.yaw };
      const physics = new AircraftPhysics({ getHeight: () => 0 });
      physics.assisted = false;
      physics.setPose(new THREE.Vector3(0, 500, 0), 0, 55);
      physics.controls.parkingBrake = false;
      input.applyTo(physics.controls);
      for (let i = 0; i < 60; i++) physics.step(1 / 120);
      /* Brushrunner's visible nose is +Z. Seen from its left pilot seat, +X
       * is therefore the player's left wing and -X is the right one. */
      const left = new THREE.Vector3(1, 0, 0).applyQuaternion(physics.quat).add(physics.position);
      const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(physics.quat).add(physics.position);
      const headingDelta = ((physics.headingDeg + 540) % 360) - 180;
      return { ...axes, leftY: left.y, rightY: right.y, headingDelta };
    };
    return {
      a: fly({ code: 'KeyA' }),
      d: fly({ code: 'KeyD' }),
      gamepadRight: fly({ padX: 1, padYaw: 1 }),
      gamepadLeft: fly({ padX: -1, padYaw: -1 }),
    };
  });
  check('from the pilot view A banks and turns left while D banks and turns right',
    rollKeys.a.leftY < rollKeys.a.rightY
      && rollKeys.a.headingDelta > 0
      && rollKeys.d.rightY < rollKeys.d.leftY
      && rollKeys.d.headingDelta < 0,
    JSON.stringify({ a: rollKeys.a, d: rollKeys.d }));
  check('gamepad bank matches the same player-facing wing movement and rudder polarity',
    rollKeys.gamepadRight.rightY < rollKeys.gamepadRight.leftY
      && rollKeys.gamepadRight.headingDelta < 0
      && rollKeys.gamepadRight.yaw < 0
      && rollKeys.gamepadLeft.leftY < rollKeys.gamepadLeft.rightY
      && rollKeys.gamepadLeft.headingDelta > 0
      && rollKeys.gamepadLeft.yaw > 0,
    JSON.stringify({ right: rollKeys.gamepadRight, left: rollKeys.gamepadLeft }));

  const restartGuard = await resumePage.evaluate(() => {
    const b = window.__beefrun;
    const original = b.mission.requestRestart;
    let restartCalls = 0;
    b.mission.requestRestart = () => { restartCalls++; };
    const radioBefore = b.radio.on;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyR', bubbles: true, cancelable: true,
    }));
    document.dispatchEvent(new KeyboardEvent('keyup', {
      code: 'KeyR', bubbles: true, cancelable: true,
    }));
    const afterRawR = restartCalls;
    const radioToggled = b.radio.on !== radioBefore;
    /* Put the receiver back exactly as this resume page found it. */
    document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyR', bubbles: true, cancelable: true,
    }));
    document.dispatchEvent(new KeyboardEvent('keyup', {
      code: 'KeyR', bubbles: true, cancelable: true,
    }));
    const radioRestored = b.radio.on === radioBefore;

    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Tab', bubbles: true, cancelable: true,
    }));
    const menu = document.querySelector('[data-scene-pause]');
    const restartButton = [...(menu?.querySelectorAll('button') || [])]
      .find((button) => button.textContent.trim() === 'Restart from checkpoint');
    const opened = !!menu && !menu.classList.contains('hidden');
    const pauseInstructions = [...(menu?.querySelectorAll('[data-scene-pause-instructions] li') || [])]
      .map((line) => line.textContent.trim());
    const titleControls = [...document.querySelectorAll('#overlay .controls li')]
      .map((line) => line.textContent.trim());
    const flightControls = [...document.querySelectorAll('#br-controls li')]
      .map((line) => line.textContent.trim());
    restartButton?.click();
    const afterMenu = restartCalls;
    const closed = !!menu && menu.classList.contains('hidden');

    b.mission.requestRestart = original;
    return {
      afterRawR,
      radioToggled,
      radioRestored,
      opened,
      restartLabel: restartButton?.textContent.trim() || '',
      pauseInstructions,
      titleControls,
      flightControls,
      afterMenu,
      closed,
    };
  });
  check('R powers only the cockpit receiver and restart still runs only from the pause menu',
    restartGuard.afterRawR === 0
      && restartGuard.radioToggled
      && restartGuard.radioRestored
      && restartGuard.opened
      && restartGuard.restartLabel === 'Restart from checkpoint'
      && restartGuard.afterMenu === 1
      && restartGuard.closed,
    JSON.stringify(restartGuard));
  check('every Beef Run control card points restart through the pause menu',
    restartGuard.pauseInstructions.some((line) => /use the button in this menu/i.test(line))
      && restartGuard.titleControls.some((line) => /Tab.*restart/i.test(line))
      && restartGuard.flightControls.some((line) => /Tab.*restart/i.test(line)),
    JSON.stringify({ pause: restartGuard.pauseInstructions,
      title: restartGuard.titleControls, flight: restartGuard.flightControls }));

  const failureRestartCopy = await resumePage.evaluate(async () => {
    const { MissionController } = await import('/src/beefrun/mission.js');
    let hud = '';
    let checkpoint = '';
    const fake = {
      failed: false,
      finished: false,
      checkpoint: 'return',
      audio: { setPhase() {}, setStallHorn() {} },
      dialogue: { clear() {} },
      hud: { say: (text) => { hud = text; } },
      flightHud: { showCheckpoint: (text) => { checkpoint = text; } },
    };
    MissionController.prototype.fail.call(fake, 'Test failure.');
    return { hud, checkpoint };
  });
  check('failure copy directs the player to Tab and Restart from checkpoint instead of raw R',
    /Tab menu/i.test(failureRestartCopy.hud)
      && /Restart from checkpoint/i.test(failureRestartCopy.hud)
      && /TAB MENU/i.test(failureRestartCopy.checkpoint)
      && !/PRESS R/i.test(failureRestartCopy.checkpoint),
    JSON.stringify(failureRestartCopy));

  const flightSafety = await resumePage.evaluate(async () => {
    const { MissionController } = await import('/src/beefrun/mission.js');
    const THREE = await import('/vendor/three.module.min.js');
    const horn = [];
    const barks = [];
    const warningSets = [];
    const fake = {
      physics: {
        position: new THREE.Vector3(0, 1, 0),
        velocity: new THREE.Vector3(),
        wind: new THREE.Vector3(),
        gust: new THREE.Vector3(),
        agl: 0.3, onGround: true, tas: 80, ias: 80, vspeed: 0,
        stallT: 0.9, rollDeg: 55, pitchDeg: 0, gLoad: 1,
        groundSpeed: 0, thrustL: 0, thrustR: 0,
        suspension: [0, 0, 0],
        damage: { wing: 0, gear: 0, tireBurst: false },
      },
      phase: 'taxi', _ambientBarkTimer: 30, _lastTas: 0,
      score: { roughAir: 0, fuelRemaining: 1, cargoDamage: 0, patrolPeak: 0, damage: 0 },
      weather: { sampleAir() {}, inCloud: () => false },
      audio: { setStallHorn: (on) => horn.push(on) },
      dialogue: { bark: (pool) => { barks.push(pool); return true; } },
      engines: {
        fuel: 100,
        engines: [{ temp: 100, health: 1, dead: false }, { temp: 100, health: 1, dead: false }],
      },
      cargo: { shift: 0.8, intact: 1, update() {}, applyTo() {} },
      detection: { active: false, patrols: [], state: 'unnoticed', attention: 0, locatedFor: 0 },
      cameras: { addShake() {} },
      flightHud: {
        setNav() {}, setDirection() {}, ageControls() {},
        setWarnings: (warnings) => warningSets.push([...warnings]),
        setPatrol() {}, hidePatrol() {},
      },
      approachGates: null,
      navTarget: () => null,
      lateralG: () => 0,
      fail() {},
    };
    MissionController.prototype.updateFlightCommon.call(fake, 0.016);

    const exitHorn = [];
    const exitWarnings = [];
    const exitFake = {
      flags: { inCockpit: true },
      flightHud: {
        showControls() {}, setDirection() {},
        setWarnings: (warnings) => exitWarnings.push([...warnings]),
      },
      interaction: { setPaused() {} },
      audio: { setHeadset() {}, setStallHorn: (on) => exitHorn.push(on), setAirspeed() {} },
      dialogue: { setHeadset() {} },
      input: { rudderKeys: true, clear() {} },
      physics: { position: new THREE.Vector3(), quat: new THREE.Quaternion() },
      player: {
        position: new THREE.Vector3(), velocity: new THREE.Vector3(),
        enabled: false, mode: 'frozen', ground: 0, yaw: 0, pitch: 0,
      },
    };
    MissionController.prototype.exitCockpit.call(exitFake);
    return {
      groundHorn: horn.at(-1),
      groundWarnings: warningSets.at(-1),
      groundBarks: barks,
      exitHorn: exitHorn.at(-1),
      exitWarnings: exitWarnings.at(-1),
    };
  });
  check('ground handling suppresses flight alarms and Sasole flight barks',
    flightSafety.groundHorn === false
      && !flightSafety.groundWarnings.includes('stall')
      && !flightSafety.groundBarks.some((pool) => ['stall', 'overspeed', 'cargoShift', 'banked'].includes(pool)),
    JSON.stringify(flightSafety));
  check('leaving the aircraft clears the stall horn and warning panel immediately',
    flightSafety.exitHorn === false && flightSafety.exitWarnings.length === 0,
    JSON.stringify(flightSafety));

  const skippedLineup = await resumePage.evaluate(async () => {
    const { MissionController } = await import('/src/beefrun/mission.js');
    const fake = {
      physics: {
        position: { x: 1000, z: 1000 },
        headingDeg: 90,
        groundSpeed: 30,
        ias: 65 / 1.943844,
        onGround: false,
        agl: 20,
      },
      airfield: { anchors: { lineUp: { x: 0, z: 0 }, departHeading: 180 } },
      flags: { lineupReady: false, rotateCalled: false, grassOffs: 0 },
      score: { patience: 1 },
      dialogue: { play() {} },
      setObjective(text) { this.objective = text; },
      gradeTakeoff() { this.graded = true; },
      setPhase(phase) { this.phase = phase; },
      restoreCheckpoint() {},
    };
    MissionController.prototype.updateLineup.call(fake, 0.016);
    return {
      lineupReady: fake.flags.lineupReady,
      graded: fake.graded === true,
      phase: fake.phase,
    };
  });
  check('taking off without stopping on the lineup target cannot softlock the mission',
    skippedLineup.lineupReady && skippedLineup.graded && skippedLineup.phase === 'climbout',
    JSON.stringify(skippedLineup));

  /* Where the mission wants the nose: on the glass, both on and off screen. */
  const pointing = await resumePage.evaluate(() => {
    const b = window.__beefrun;
    const el = document.getElementById('br-dir');
    const nav = b.mission.navTarget();
    const dx = nav.x - b.physics.position.x;
    const dz = nav.z - b.physics.position.z;
    const bearing = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
    const read = () => ({
      shown: !el.classList.contains('hidden'),
      edge: el.classList.contains('edge'),
      x: parseFloat(el.style.getPropertyValue('--x')),
      y: parseFloat(el.style.getPropertyValue('--y')),
      tag: el.querySelector('.tag').textContent,
    });
    // Drive the readout directly off the projection, so this does not depend
    // on how many frames the software renderer has managed since the turn.
    const at = (hdg) => {
      b.physics.setPose(b.physics.position.clone(), hdg, 60);
      b.aircraft.syncTo(b.physics);
      b.cameras.lookYaw = 0;
      b.cameras.lookPitch = 0;
      b.cameras.update(0.016, b.physics, b.aircraft.group, b.aircraft.pilotEye, {});
      b.flightHud.setDirection(b.mission.projectNav(nav, 5));
      return read();
    };
    return { ahead: at(bearing), behind: at((bearing + 180) % 360) };
  });
  check('the objective is drawn on the glass ahead and pinned to the edge behind',
    pointing.ahead.shown && !pointing.ahead.edge
      && Math.abs(pointing.ahead.x - 50) < 12 && Math.abs(pointing.ahead.y - 50) < 25
      && pointing.behind.shown && pointing.behind.edge
      && pointing.behind.y > 90
      && /WHISPERING PINES/.test(pointing.ahead.tag),
    JSON.stringify(pointing));

  const barkRotation = await resumePage.evaluate(async () => {
    const { DialogueSystem } = await import('/src/beefrun/dialogue.js');
    const heard = [];
    const d = new DialogueSystem({ say() {} }, { audio: { line: (line) => heard.push(line) } });
    const queued = [];
    for (let i = 0; i < 7; i++) {
      d.bark('cruise', { force: true });
      const line = d.queue[d.queue.length - 1];
      queued.push({ text: line.text, cue: line.cue });
      d.clear();
    }
    return queued;
  });
  check('Sasole exhausts the stable-flight pool before any line repeats and every bark is cued',
    new Set(barkRotation.slice(0, 6).map((line) => line.text)).size === 6
      && barkRotation[6].text === barkRotation[0].text
      && barkRotation.every((line) => /^beefrun\.sasole\.bark-cruise-\d+$/.test(line.cue)),
    JSON.stringify(barkRotation));

  const homeSetup = await resumePage.evaluate(async () => {
    const b = window.__beefrun;
    const { HOME_APPROACH } = await import('/src/beefrun/config.js');
    const { TerrainStreamingSystem } = await import('/src/beefrun/terrain.js');
    const Scene = b.mission.scene.constructor;
    const isolated = new TerrainStreamingSystem(new Scene());
    isolated.prime(HOME_APPROACH.entry.x, HOME_APPROACH.entry.z);
    const terrain = { chunks: isolated.chunks.size, queued: isolated.queue.length };
    isolated.clear();

    b.mission.restoreCheckpoint('return');
    const nav = b.mission.navTarget();
    const gates = b.mission.approachGates;
    const runwayLights = b.mission.airfield.root.getObjectByName('runway-36-edge-lights');
    return {
      phase: b.mission.phase,
      position: {
        x: +b.physics.position.x.toFixed(1),
        y: +b.physics.position.y.toFixed(1),
        z: +b.physics.position.z.toFixed(1),
      },
      entry: HOME_APPROACH.entry,
      nav,
      gates: {
        name: gates?.name,
        count: gates?.children.length,
        faceFlightPath: gates?.children.every((gate) => Math.abs(gate.rotation.x) < 0.01),
      },
      runwayLights: { visible: runwayLights?.visible, count: runwayLights?.count },
      guide: document.getElementById('br-guide').textContent,
      terrain,
    };
  });
  check('the saved return begins on the authored runway profile, not a dive over the threshold',
    homeSetup.phase === 'home'
      && homeSetup.position.x === homeSetup.entry.x
      && homeSetup.position.y === +homeSetup.entry.y.toFixed(1)
      && homeSetup.position.z === homeSetup.entry.z,
    JSON.stringify({ phase: homeSetup.phase, position: homeSetup.position, entry: homeSetup.entry }));
  check('the return identifies RWY 36 and lights a ten-gate path plus both runway edges',
    /RWY 36 THRESHOLD/.test(homeSetup.nav?.label || '')
      && homeSetup.gates.name === 'home-approach-gates'
      && homeSetup.gates.count === 10
      && homeSetup.gates.faceFlightPath
      && homeSetup.runwayLights.visible
      && homeSetup.runwayLights.count === 24
      && /RWY 36/.test(homeSetup.guide),
    JSON.stringify({ nav: homeSetup.nav, gates: homeSetup.gates,
      runwayLights: homeSetup.runwayLights, guide: homeSetup.guide }));
  check('checkpoint restart warms only nearby terrain and streams the far rings',
    homeSetup.terrain.chunks >= 1 && homeSetup.terrain.chunks <= 9 && homeSetup.terrain.queued >= 100,
    JSON.stringify(homeSetup.terrain));

  const touchdownCoaching = await resumePage.evaluate(async () => {
    const { MissionController } = await import('/src/beefrun/mission.js');
    const called = [];
    const fake = {
      phase: 'final', missionTime: 1, _touchdowns: [],
      audio: { play() {} }, cameras: { addShake() {} },
      score: { patience: 1 },
      dialogue: { bark() {}, play: (id) => called.push(id) },
      setObjective(text) { this.objective = text; },
    };
    MissionController.prototype.onTouchdown.call(fake, 1.2, 1, 'both');
    return { objective: fake.objective, called };
  });
  check('touchdown immediately cues braking and its matching Sasole line',
    /hold B/i.test(touchdownCoaching.objective || '')
      && touchdownCoaching.called.includes('home.brake'),
    JSON.stringify(touchdownCoaching));

  /* ---- Cockpit clipping: nothing pokes into the pilot's view or into Sasole ----
   *
   * Owner's note, 8-6: *"cockpit still has shit intersecting my view and of
   * Sasole."* Two machine checks, one per half of the complaint:
   *
   *   (a) no cockpit FIXTURE comes within a small radius of the pilot's own
   *       camera position. The shell/canopy around him is EXPECTED to
   *       enclose that point — a hollow shell's own bounding box contains
   *       the cabin air inside it, that is not a strut through the near
   *       plane — so shell and glazing meshes are named and excluded BY
   *       NAME rather than silently skipped by distance.
   *   (b) no cockpit FIXTURE's bounding box intersects Capt Sasole's own
   *       body box, on all five flight-phase checkpoints and however he
   *       happens to be turned at that moment: `updateFigure()` in npc.js
   *       aims his neck and torso at `camera.position` every frame he is
   *       aboard, not only while he is talking (see the comment there), so
   *       his swept reach has to be measured moving, not just at rest — a
   *       snapshot at his rest pose is exactly what let the pilot seat and
   *       the inboard rudder pedal ship 5-10 cm inside him. His own seat is
   *       excluded from (b): he is meant to touch it, that is what sitting
   *       in it means. His own body meshes never enter either check — this
   *       walks `aircraft.group`, and his figure only becomes a child of it
   *       once he boards, at which point his own clothes and cup are still
   *       excluded (see `louBox` below).
   */
  const cockpitClipping = await resumePage.evaluate((checkpoints) => {
    // Structural skin: frame stations, stringers, the rolled corners, the
    // turtledeck and keel, riveted skin patches, decals painted on the
    // skin, and the glazing that is meant to sit close around the pilot's
    // head. Every one of these has a bounding box that legitimately
    // contains the cabin air a fixture would not be allowed to.
    const SHELL_NAMES = [
      'windshield', 'cabin-glass-side-left', 'cabin-glass-side-right',
      'cabin-glass-quarter-left', 'cabin-glass-quarter-right',
      'nose-cone', 'nose-fairing', 'tail-boom', 'tail-boom-fairing', 'run-tally',
    ];
    const SHELL_ANCESTORS = [
      'fuselage-shell', 'aircraft-hull-detail', 'aircraft-exterior-details',
      'tail-support-frame', 'cargo-floor',
    ];
    // Everything a hand or a knee could actually be stopped by. Deliberately
    // an ALLOWLIST rather than "everything else": the shell above already
    // covers structure, and a bare denylist would need to name every rivet
    // line this scene ever grows.
    const FIXTURE_NAMES = [
      'instrument-panel', 'glare-shield-coaming', 'yoke-pilot', 'yoke-copilot',
      'lever-throttle-left', 'lever-throttle-right', 'lever-prop-left', 'lever-prop-right',
      'lever-mixture-left', 'lever-mixture-right', 'flap-lever', 'compass-housing',
      'rudder-pedal-left', 'rudder-pedal-right',
      'pilot-seat-cushion', 'pilot-seat-back',
      'placard-ignore-below-20', 'placard-general-concern', 'concern-light',
      'nav-map', 'nav-map-tape-1', 'nav-map-tape-2', 'cigarette-lighter', 'bobblehead',
      'tammy-golden-ak-sticker', 'cockpit-radio-stack',
    ];
    const CAM_RADIUS = 0.35;   // measured clearance to the nearest real fixture is ~0.44 m
    const MIN_OVERLAP = 0.001; // metres per axis — below this is touching, not clipping

    const b = window.__beefrun;
    const THREE = b.THREE;
    const aircraft = b.aircraft;
    const lou = b.mission.lou;
    const box = new THREE.Box3();

    const isShell = (n) => {
      if (SHELL_NAMES.includes(n.name) || /^fuselage-/.test(n.name)) return true;
      for (let p = n; p; p = p.parent) if (SHELL_ANCESTORS.includes(p.name)) return true;
      return false;
    };
    const isFixture = (n) => {
      for (let p = n; p; p = p.parent) if (FIXTURE_NAMES.includes(p.name)) return true;
      return false;
    };
    const fixtureName = (n) => {
      for (let p = n; p; p = p.parent) if (FIXTURE_NAMES.includes(p.name)) return p.name;
      return n.name || '(unnamed)';
    };
    const distPointBox = (p, bx) => {
      const dx = Math.max(bx.min.x - p.x, 0, p.x - bx.max.x);
      const dy = Math.max(bx.min.y - p.y, 0, p.y - bx.max.y);
      const dz = Math.max(bx.min.z - p.z, 0, p.z - bx.max.z);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    const perCheckpoint = [];
    for (const cp of checkpoints) {
      const restored = cp === 'landing' ? b.mission.restorePreviewLanding() : b.mission.restoreCheckpoint(cp);
      if (!restored) { perCheckpoint.push({ checkpoint: cp, error: 'restore failed' }); continue; }
      aircraft.group.updateMatrixWorld(true);
      lou.group.updateMatrixWorld(true);

      const camPos = b.camera.position.clone();

      /* Sasole's visible body geometry, one box per mesh. A single union box
       * spans the empty air between his rotated limbs and torso, which can
       * falsely report a nearby lever as clipping him. Mesh geometry also
       * excludes his floating name-tag sprite, while the visibility walk
       * excludes his hidden coffee cup once he boards. */
      const louBodyMeshes = [];
      const bodyPartName = (n) => {
        for (let p = n; p && p !== lou.group; p = p.parent) {
          if (p.name) return p.name;
        }
        return '(unnamed body mesh)';
      };
      lou.group.traverse((n) => {
        if (!n.isMesh || !n.geometry) return;
        for (let p = n; p; p = p.parent) if (p.visible === false) return;
        box.setFromObject(n);
        if (!Number.isFinite(box.min.x)) return;
        louBodyMeshes.push({ name: bodyPartName(n), box: box.clone() });
      });

      const camNear = [];
      const louOverlaps = [];
      aircraft.group.traverse((n) => {
        if (!n.isMesh || !n.geometry) return;
        for (let p = n; p; p = p.parent) if (p.visible === false) return;
        box.setFromObject(n);
        if (!Number.isFinite(box.min.x)) return;

        if (!isShell(n)) {
          const d = distPointBox(camPos, box);
          if (d < CAM_RADIUS) camNear.push({ name: n.name || '(unnamed)', metres: +d.toFixed(3) });
        }
        if (louBodyMeshes.length && isFixture(n)) {
          for (const body of louBodyMeshes) {
            const ox = Math.min(box.max.x, body.box.max.x) - Math.max(box.min.x, body.box.min.x);
            const oy = Math.min(box.max.y, body.box.max.y) - Math.max(box.min.y, body.box.min.y);
            const oz = Math.min(box.max.z, body.box.max.z) - Math.max(box.min.z, body.box.min.z);
            if (ox > MIN_OVERLAP && oy > MIN_OVERLAP && oz > MIN_OVERLAP) {
              louOverlaps.push({
                fixture: fixtureName(n),
                mesh: n.name || '(unnamed fixture mesh)',
                body: body.name,
                overlap: [ox, oy, oz].map((value) => +value.toFixed(5)),
                cubicMetres: +(ox * oy * oz).toFixed(7),
              });
            }
          }
        }
      });
      perCheckpoint.push({ checkpoint: cp, phase: b.mission.phase, camNear, louOverlaps });
    }
    return perCheckpoint;
  }, ['takeoff', 'approach', 'departure', 'return', 'landing']);

  check('no cockpit fixture comes within 0.35 m of the pilot camera on any flight-phase checkpoint (shell/canopy excluded by name)',
    cockpitClipping.every((c) => !c.error && c.camNear.length === 0),
    JSON.stringify(cockpitClipping.map((c) => ({ checkpoint: c.checkpoint, camNear: c.camNear }))));
  check("no cockpit fixture intersects Capt Sasole's visible body geometry on any flight-phase checkpoint, however he is turned (his own seat excluded)",
    cockpitClipping.every((c) => !c.error && c.louOverlaps.length === 0),
    JSON.stringify(cockpitClipping.map((c) => ({ checkpoint: c.checkpoint, louOverlaps: c.louOverlaps }))));

  check('no console errors during the resume', resumeProblems.length === 0,
    resumeProblems.join(' | '));
  await resumePage.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Beef Run checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Beef Run checks passed.`);
