#!/usr/bin/env node
/**
 * Bounded live-browser proof for the Special Meeting opening.
 *
 * This deliberately stops during SM-100. It proves the exact voice-bank gate,
 * shared first-person input, formal cast and featured pickup without riding the
 * scene all the way into the Initiation.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5227;
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Special Meeting scene.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(`${ROOT}${path.sep}`)
        || !fs.existsSync(file)
        || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(await fsp.readFile(file));
  } catch (error) {
    res.writeHead(500).end(error?.message || 'server error');
  }
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
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const problems = [];
const missing = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 300));
});
page.on('response', (response) => {
  if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  await page.goto(`http://localhost:${PORT}/specialmeeting.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SPECIAL_MEETING?.player, null, { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  const initial = await page.evaluate(() => {
    const game = window.SPECIAL_MEETING;
    const people = game.cast.all.map((person) => ({
      characterId: person.characterId,
      stampedId: person.group.userData.characterId,
      outfit: person.parts.profile.outfit,
      tuxedo: person.parts.profile.tuxedo,
      visible: person.group.visible,
      attached: Boolean(person.group.parent),
      meshes: (() => {
        let count = 0;
        person.group.traverse((object) => { if (object.isMesh) count += 1; });
        return count;
      })(),
    }));
    const pickup = game.stage.block.group.getObjectByName('featured-pickup');
    const objects = [];
    pickup?.traverse((object) => objects.push(object));
    const exact = (name) => objects.filter((object) => object.name === name).length;
    const prefix = (name) => objects.filter((object) => object.name.startsWith(name));
    const glass = objects.filter((object) => /^pickup\.(window|windscreen|rear-window)/.test(object.name));
    return {
      started: game.started,
      voiceReady: game.voiceReady,
      missingVoiceCues: game.missingVoiceCues,
      failedCues: game.failedCues,
      voiceLoadError: game.voiceLoadError,
      expectedVoiceCueCount: game.expectedVoiceCueCount,
      decodedVoiceCueCount: game.decodedVoiceCueCount,
      playerController: game.player.constructor?.name,
      playerMode: game.player.mode,
      playerEnabled: game.player.enabled,
      canvasCount: document.querySelectorAll('#scene').length,
      bootFailureVisible: !document.querySelector('#bootFailure')?.hidden,
      people,
      pickup: pickup ? {
        vehicle: pickup.userData.vehicle,
        wheels: exact('pickup.wheel'),
        headlights: prefix('pickup.headlight.').length,
        taillights: prefix('pickup.taillight.').length,
        doorSeams: prefix('pickup.door-seam.').length,
        grille: exact('pickup.grille'),
        mirrors: prefix('pickup.mirror.').filter((object) => object.isGroup).length,
        handles: prefix('pickup.handle.').length,
        seats: prefix('pickup.seat.').filter((object) => object.isGroup).length,
        dashboard: exact('pickup.dashboard'),
        windows: glass.length,
        transparentWindows: glass.every((object) => object.material?.transparent === true
          && object.material?.depthWrite === false),
      } : null,
    };
  });

  check('the page boots without an error overlay and publishes its scene',
    initial.canvasCount === 1 && !initial.bootFailureVisible,
    JSON.stringify({ canvas: initial.canvasCount, bootFailure: initial.bootFailureVisible }));
  check('startup is closed before the first player gesture',
    !initial.started && !initial.voiceReady
      && initial.expectedVoiceCueCount === 220
      && initial.decodedVoiceCueCount === 0
      && initial.missingVoiceCues.length === 0
      && initial.failedCues.length === 0
      && !initial.voiceLoadError,
    JSON.stringify({
      started: initial.started,
      ready: initial.voiceReady,
      expected: initial.expectedVoiceCueCount,
      decoded: initial.decodedVoiceCueCount,
    }));
  check('the opening uses the shared walking Player controller',
    initial.playerController === 'Player' && initial.playerMode === 'walk' && !initial.playerEnabled,
    JSON.stringify({
      controller: initial.playerController,
      mode: initial.playerMode,
      enabled: initial.playerEnabled,
    }));
  check('all four canonical attendees are loaded as restrained formal-suit figures',
    initial.people.length === 4
      && new Set(initial.people.map((person) => person.characterId)).size === 4
      && initial.people.every((person) => person.characterId === person.stampedId
        && person.outfit === 'suit'
        && person.tuxedo === false
        && person.visible
        && person.attached
        && person.meshes > 10),
    JSON.stringify(initial.people));

  /* THE FACES.
   *
   * The owner reported the Special Meeting cast as "missing faces". Half of
   * that was the cabin light rig; the other half was this scene never passing
   * `face` to the shared builder at all, so four people who wear the owner's
   * photographs in the Bing, the Mansion and the Initiation were built here on
   * the procedural drawn head. Nothing could have caught it: the check above
   * counts meshes and reads garments, and a head with no photograph on it has
   * exactly the same meshes and exactly the same suit.
   *
   * The index is fetched here rather than read off the scene, so this proves
   * the built cast against what is genuinely on the server instead of against
   * the scene's own copy of that answer. A photograph that has NOT landed must
   * come back null -- asking for a file that is not there is a 404 in every
   * player's console, which is the whole reason the index exists -- and a
   * photograph that HAS landed must be on the model. Today no seff.png,
   * lag.png, numbskull.png or kittenboss.png exists, so the first half is what
   * runs and the second half is what starts proving something the moment the
   * art is dropped in and `node tools/faces-index.mjs` re-runs. */
  const faces = await page.evaluate(async () => {
    const index = await fetch('assets/faces/index.json')
      .then((response) => response.json())
      .catch(() => ({ files: [] }));
    const landed = new Set(Array.isArray(index.files) ? index.files : []);
    const { cast } = window.SPECIAL_MEETING;
    return Object.entries(cast.facePhotos).map(([key, named]) => ({
      key,
      photo: named.photo,
      landed: landed.has(named.photo)
        || Boolean(named.photoFallback && landed.has(named.photoFallback)),
      face: cast.models[key]?.face ?? null,
    }));
  });
  check('every attendee whose photograph has landed is wearing it, and nobody else asks for one',
    faces.length === 4 && faces.every((person) => (person.landed
      ? typeof person.face === 'string' && person.face.startsWith('assets/faces/')
      : person.face === null)),
    JSON.stringify(faces));

  check('the featured pickup is believable scale and has its complete exterior and cabin',
    initial.pickup?.vehicle?.kind === 'pickup'
      && initial.pickup.vehicle.detailed === true
      && initial.pickup.vehicle.length > 4.5 && initial.pickup.vehicle.length < 5.5
      && initial.pickup.vehicle.width > 1.7 && initial.pickup.vehicle.width < 2.1
      && initial.pickup.vehicle.height > 1.6 && initial.pickup.vehicle.height < 1.9
      && initial.pickup.wheels === 4
      && initial.pickup.headlights === 2
      && initial.pickup.taillights === 2
      && initial.pickup.doorSeams === 2
      && initial.pickup.grille === 1
      && initial.pickup.mirrors === 2
      && initial.pickup.handles === 2
      && initial.pickup.seats === 2
      && initial.pickup.dashboard === 1
      && initial.pickup.windows === 4
      && initial.pickup.transparentWindows,
    JSON.stringify(initial.pickup));

  await page.evaluate(() => {
    const sample = () => ({
      started: window.SPECIAL_MEETING.started,
      ready: window.SPECIAL_MEETING.voiceReady,
      expected: window.SPECIAL_MEETING.expectedVoiceCueCount,
      decoded: window.SPECIAL_MEETING.decodedVoiceCueCount,
      missing: window.SPECIAL_MEETING.missingVoiceCues.length,
      failed: window.SPECIAL_MEETING.failedCues.length,
    });
    window.__specialMeetingStartTrace = [sample()];
    window.__specialMeetingStartTimer = setInterval(() => {
      window.__specialMeetingStartTrace.push(sample());
    }, 5);
  });

  await page.locator('#scene').click({ position: { x: 320, y: 180 } });
  await page.waitForFunction(
    () => window.SPECIAL_MEETING.started || window.SPECIAL_MEETING.voiceLoadError,
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(25);
  const startup = await page.evaluate(() => {
    clearInterval(window.__specialMeetingStartTimer);
    const game = window.SPECIAL_MEETING;
    return {
      started: game.started,
      ready: game.voiceReady,
      expected: game.expectedVoiceCueCount,
      decoded: game.decodedVoiceCueCount,
      missing: game.missingVoiceCues,
      failed: game.failedCues,
      error: game.voiceLoadError,
      trace: window.__specialMeetingStartTrace,
    };
  });
  const invalidStartedSample = startup.trace.find((sample) => sample.started
    && (!sample.ready
      || sample.decoded !== sample.expected
      || sample.missing !== 0
      || sample.failed !== 0));
  check('the first click starts SM-100 only after all 220 authored voice cues decode',
    startup.started && startup.ready
      && startup.expected === 220
      && startup.decoded === 220
      && startup.missing.length === 0
      && startup.failed.length === 0
      && !startup.error
      && !invalidStartedSample,
    JSON.stringify({
      started: startup.started,
      ready: startup.ready,
      expected: startup.expected,
      decoded: startup.decoded,
      missing: startup.missing.length,
      failed: startup.failed.length,
      error: startup.error,
      traceSamples: startup.trace.length,
      invalidStartedSample,
    }));

  await page.waitForFunction(
    () => document.pointerLockElement === document.querySelector('#scene')
      && window.SPECIAL_MEETING.player.enabled,
    null,
    { timeout: 10000 },
  );
  const beforeInput = await page.evaluate(() => ({
    x: window.SPECIAL_MEETING.player.position.x,
    z: window.SPECIAL_MEETING.player.position.z,
    yaw: window.SPECIAL_MEETING.player.yaw,
    pitch: window.SPECIAL_MEETING.player.pitch,
  }));
  await page.mouse.move(320, 180);
  await page.mouse.move(402, 132, { steps: 2 });
  await page.waitForTimeout(50);
  const afterLook = await page.evaluate(() => ({
    yaw: window.SPECIAL_MEETING.player.yaw,
    pitch: window.SPECIAL_MEETING.player.pitch,
  }));
  /* Forward faces the narrow doorway-to-kerb lane and can legitimately brush
   * its edge after the mouse-look probe. Use a clear lateral WASD direction
   * so this check measures keyboard dispatch and walking rather than authored
   * collision at the threshold. Shader compilation and audio decode can also
   * make the first few headless animation frames sparse, so wait on measured
   * Player motion rather than assuming 450 ms contains a fixed frame count. */
  let walkWaitError = null;
  await page.keyboard.down('d');
  try {
    await page.waitForFunction(({ x, z }) => {
      const player = window.SPECIAL_MEETING.player;
      return player.enabled
        && player.mode === 'walk'
        && player.keys.has('KeyD')
        && Math.hypot(player.position.x - x, player.position.z - z) > 0.35;
    }, { x: beforeInput.x, z: beforeInput.z }, { polling: 'raf', timeout: 3000 });
  } catch (error) {
    walkWaitError = error?.message || String(error);
  }
  const heldWalk = await page.evaluate(() => ({
    enabled: window.SPECIAL_MEETING.player.enabled,
    mode: window.SPECIAL_MEETING.player.mode,
    keys: [...window.SPECIAL_MEETING.player.keys],
  }));
  await page.keyboard.up('d');
  const afterWalk = await page.evaluate(() => ({
    x: window.SPECIAL_MEETING.player.position.x,
    z: window.SPECIAL_MEETING.player.position.z,
  }));
  await page.keyboard.down('Space');
  await page.waitForTimeout(110);
  const duringJump = await page.evaluate(() => ({
    jumpHeight: window.SPECIAL_MEETING.player.jumpHeight,
    grounded: window.SPECIAL_MEETING.player.grounded,
    y: window.SPECIAL_MEETING.player.position.y,
  }));
  await page.keyboard.up('Space');
  const walked = Math.hypot(afterWalk.x - beforeInput.x, afterWalk.z - beforeInput.z);
  /* The two getters the input incident added: `pointerlockchange` is the one
   * thing that enables him, and he opens the scene on his feet at the kerb --
   * not already seated in the car. */
  const gateProbe = await page.evaluate(() => ({
    lockedToCanvas: document.pointerLockElement?.tagName === 'CANVAS',
    enabled: window.SPECIAL_MEETING.playerEnabled,
    mode: window.SPECIAL_MEETING.playerMode,
  }));
  check('clicking the canvas takes pointer lock and enables the player',
    gateProbe.lockedToCanvas && gateProbe.enabled === true, JSON.stringify(gateProbe));
  check('he starts the scene on his feet at the kerb, not already in the car',
    gateProbe.mode === 'walk', JSON.stringify(gateProbe));

  check('pointer-locked mouse input changes the shared first-person camera',
    Math.abs(afterLook.yaw - beforeInput.yaw) > 0.01
      && Math.abs(afterLook.pitch - beforeInput.pitch) > 0.01,
    JSON.stringify({ before: beforeInput, after: afterLook }));
  check('WASD input moves the shared Player through the staged world',
    !walkWaitError
      && walked > 0.35
      && heldWalk.enabled
      && heldWalk.mode === 'walk'
      && heldWalk.keys.includes('KeyD'),
    `${walked.toFixed(3)} metres; ${JSON.stringify({ ...heldWalk, walkWaitError })}`);
  check('the shared Player performs a real grounded jump',
    duringJump.jumpHeight > 0.03 && !duringJump.grounded,
    JSON.stringify(duringJump));
  /* ================================================================== *
   * THE TWO THINGS THIS FILE COULD NOT SEE
   *
   * The scene shipped for weeks with its HUD at opacity zero -- all 220 voice
   * lines playing with no subtitle on screen -- and with the script starting
   * on the player's click rather than on the car's arrival, so Seff spoke
   * while the car was still driving down the block. Every check above was
   * green throughout both. Neither is visible to a headless test and neither
   * was visible to this one: it never read a computed style, and it stopped
   * before the car had finished arriving.
   * ================================================================== */
  const hudVisible = await page.evaluate(() => {
    const hud = document.getElementById('hud');
    return {
      opacity: hud ? getComputedStyle(hud).opacity : null,
      playing: document.body.classList.contains('playing'),
    };
  });
  check('the HUD the subtitles are drawn in is actually visible',
    hudVisible.playing && Number(hudVisible.opacity) > 0.9,
    JSON.stringify(hudVisible));

  /* The arrival settles about 28 s after the gesture. Waiting for it is the
   * only way to prove the script is pinned to the car rather than the click. */
  const arrival = await page.evaluate(() => new Promise((resolve) => {
    const deadline = performance.now() + 75000;
    const tick = () => {
      const sm = window.SPECIAL_MEETING;
      const beat = sm?.ride?.beatId ?? null;
      const car = sm?.stage?.sedan?.group?.position;
      if (beat) {
        resolve({ beat, settled: sm.stage.arrival?.settled ?? null,
          car: car ? { x: +car.x.toFixed(2), z: +car.z.toFixed(2) } : null,
          subtitle: document.getElementById('subtitle')?.textContent ?? '' });
        return;
      }
      if (performance.now() > deadline) { resolve({ beat: null, timedOut: true }); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  check('the script does not start until the car has arrived and stopped',
    arrival.beat === 'SM-100' && arrival.settled === true,
    JSON.stringify(arrival));

  check('all page modules, voice files, face textures and scene assets load',
    missing.length === 0,
    missing.join(' | '));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} catch (error) {
  console.error('Special Meeting verifier aborted before checks completed.');
  console.error('Runtime errors:', problems);
  console.error('Missing responses:', missing);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Special Meeting checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Special Meeting checks passed.`);
