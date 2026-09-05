#!/usr/bin/env node
/**
 * Live-browser proof for the complete Special Meeting pickup and drive.
 *
 * It starts from the honest kerb load, uses real pointer-lock, keyboard and
 * choice input, rides the authored kilometre, exhausts the Kittenboss hub,
 * walks the real trail and observes the persisted Initiation navigation. It
 * never skips a beat or writes mission state directly.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptCues as authoredSpecialMeetingCues } from '../src/specialmeeting/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_VOICE_CUE_COUNT = new Set(
  authoredSpecialMeetingCues().map((cue) => cue.name),
).size;
const SFX_ROOT = path.join(ROOT, 'assets', 'sfx');
const AUDIO_MANIFEST = JSON.parse(fs.readFileSync(path.join(SFX_ROOT, 'manifest.json'), 'utf8'));
const AUTHORED_SPECIAL_NAMES = new Set(authoredSpecialMeetingCues().map((cue) => cue.name));
const cueFile = (cue) => cue.file || `${cue.name}.mp3`;
const cueVoice = (cue) => cue.voice || 'player';
const specialRows = AUDIO_MANIFEST.sfx.filter((cue) => AUTHORED_SPECIAL_NAMES.has(cue.name));
const MISSING_SPECIAL_RECORDINGS = specialRows.filter(
  (cue) => !fs.existsSync(path.join(SFX_ROOT, cueFile(cue))),
);
/* Keep the route testable while an external recording pickup is outstanding.
 * This map exists only in this verifier's private HTTP server: production
 * still fails closed, and the first browser assertion below remains red until
 * every exact file lands. A same-performer take preserves a realistic speech
 * clock without pretending it is the requested performance. */
const VERIFIER_AUDIO_SUBSTITUTES = new Map(MISSING_SPECIAL_RECORDINGS.map((missingCue) => {
  const substitute = AUDIO_MANIFEST.sfx.find((candidate) => (
    candidate.say
      && cueVoice(candidate) === cueVoice(missingCue)
      && candidate.name !== missingCue.name
      && fs.existsSync(path.join(SFX_ROOT, cueFile(candidate)))
  ));
  if (!substitute) {
    throw new Error(`No verifier-only same-performer substitute exists for ${missingCue.name}`);
  }
  return [
    `assets/sfx/${cueFile(missingCue).replaceAll('\\', '/')}`,
    path.join(SFX_ROOT, cueFile(substitute)),
  ];
}));
const VERIFIER_INDEX = (() => {
  const index = JSON.parse(fs.readFileSync(path.join(SFX_ROOT, 'index.json'), 'utf8'));
  const files = new Set(index.files || []);
  const versions = { ...(index.versions || {}) };
  for (const missingCue of MISSING_SPECIAL_RECORDINGS) {
    const file = cueFile(missingCue).replaceAll('\\', '/');
    files.add(file);
    /* A verifier-only version keeps this virtual entry distinct from a real
     * generated take should one land while the run is in progress. */
    versions[file] = 'verifier-substitute';
  }
  return Buffer.from(JSON.stringify({
    ...index,
    files: [...files].sort(),
    versions,
  }));
})();
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
    if (relative === 'assets/sfx/index.json') {
      res.writeHead(200, { 'content-type': TYPES['.json'] });
      res.end(VERIFIER_INDEX);
      return;
    }
    const file = VERIFIER_AUDIO_SUBSTITUTES.get(relative) ?? path.resolve(ROOT, relative);
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
/* Collect the engine the scene really constructs and make required VO fail
 * closed. This policy is read by AudioEngine's constructor before any scene
 * code runs; it neither supplies recordings nor changes the dialogue clock. */
await page.addInitScript(() => {
  window.__SQUATCH_QA_AUDIO__ = {
    strictRequiredRecordings: true,
    engines: [],
    violations: [],
    onViolation(receipt) {
      window.__SQUATCH_QA_AUDIO__.violations.push({
        requested: receipt?.requested ?? null,
        actual: receipt?.actual ?? null,
        source: receipt?.source ?? null,
        fallbackReason: receipt?.fallbackReason ?? null,
      });
    },
  };
});
await page.addInitScript((cues) => {
  window.__SPECIAL_MEETING_VERIFIER_SUBSTITUTES__ = cues;
}, MISSING_SPECIAL_RECORDINGS.map((cue) => cue.name));

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

/**
 * Turn the pointer-locked camera toward a world-space point with real mouse
 * input. Reading the authored target and the player's current pose is only the
 * navigation aid; the pose itself still changes exclusively through the same
 * MouseEvent path a player uses.
 */
async function lookAtWorldPoint(point) {
  /* Re-centre Playwright's absolute mouse cursor first. Under pointer lock the
   * browser turns that into relative motion too, so compute the correction
   * only after this event has reached the Player. */
  await page.mouse.move(320, 180);
  await page.waitForTimeout(20);
  const delta = await page.evaluate(({ x, y, z }) => {
    const { player } = window.SPECIAL_MEETING;
    const dx = x - player.position.x;
    const dy = y - player.position.y;
    const dz = z - player.position.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    const desiredPitch = Math.atan2(dy, Math.hypot(dx, dz));
    const shortest = (from, to) => {
      let d = to - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    return {
      movementX: -shortest(player.yaw, desiredYaw) / player.sensitivity,
      movementY: -(desiredPitch - player.pitch) / player.sensitivity,
    };
  }, point);
  /* Pointer lock reports relative motion even when these synthetic screen
   * coordinates fall outside the viewport. Playwright still dispatches a real
   * CDP mouse move, so the canonical Adapter receives `movementX/Y`. */
  await page.mouse.move(320 + delta.movementX, 180 + delta.movementY, { steps: 2 });
  await page.waitForTimeout(40);
}

async function moveLook(movementX, movementY) {
  await page.mouse.move(320, 180);
  await page.waitForTimeout(20);
  await page.mouse.move(320 + movementX, 180 + movementY, { steps: 2 });
  await page.waitForTimeout(40);
}

/** Select a displayed authored option through the real numbered-key route. */
/* SwiftShader can render this forest below 20 fps. The game deliberately caps
 * a frame's simulation delta at 50 ms, so authored seconds then take longer
 * than wall-clock seconds; give the honest clock room instead of skipping its
 * silences or changing playback rate in QA.
 *
 * The room is PROGRESS-shaped, not a fixed wall bound: a loaded box measured
 * the drive covering 8.7 m in 12.7 wall seconds at an authored 13 m/s (the
 * clamped dt pays a metre per rendered frame), which walked straight through
 * the old 600 s allowance while the ride was advancing the whole time. So
 * keep waiting while the beat, the drive distance, or the subtitle moves;
 * fail only when the scene provably stops, or at a hard ceiling, both with
 * the same diagnostics. */
async function chooseAtBeat(beatId, text, { stallSeconds = 300, ceilingSeconds = 1800 } = {}) {
  const startedAt = Date.now();
  let lastProgressAt = Date.now();
  let lastKey = null;
  try {
    for (;;) {
      const reached = await page.waitForFunction(({ beatId: wanted, text: words }) => {
        const ride = window.SPECIAL_MEETING?.ride;
        return ride?.beatId === wanted
          && ride.options?.some((option) => option.text.includes(words));
      }, { beatId, text }, { timeout: 30000 }).then(() => true, () => false);
      if (reached) break;
      const probe = await page.evaluate(() => ({
        beat: window.SPECIAL_MEETING?.ride?.beatId ?? null,
        distance: window.SPECIAL_MEETING?.forest
          ? Math.round(window.SPECIAL_MEETING.forest.drive.distance * 2) / 2
          : null,
        subtitle: document.querySelector('#subtitle')?.textContent?.trim() ?? null,
      }));
      const key = `${probe.beat}|${probe.distance}|${probe.subtitle}`;
      if (key !== lastKey) {
        lastKey = key;
        lastProgressAt = Date.now();
      }
      if (Date.now() - lastProgressAt > stallSeconds * 1000) {
        throw new Error(`the ride stopped moving on the way to ${beatId} (no beat, `
          + `drive, or subtitle progress for ${stallSeconds} s)`);
      }
      if (Date.now() - startedAt > ceilingSeconds * 1000) {
        throw new Error(`the ride never reached ${beatId} inside the `
          + `${ceilingSeconds} s ceiling, though it was still making progress`);
      }
    }
  } catch (error) {
    const state = await page.evaluate(() => {
      const sm = window.SPECIAL_MEETING;
      const playback = window.__specialMeetingDialogueAudit?.calls?.at(-1)?.playback;
      return {
        beat: sm?.ride?.beatId ?? null,
        phase: sm?.ride?.phase ?? null,
        options: sm?.ride?.options?.map((option) => option.text) ?? [],
        objective: sm?.certification?.objectiveText ?? null,
        legalActions: sm?.certification?.legalActions ?? [],
        subtitle: document.querySelector('#subtitle')?.textContent?.trim() ?? null,
        drive: sm?.forest ? {
          distance: sm.forest.drive.distance,
          speed: sm.forest.drive.speed,
          waitingAt: sm.forest.drive.waitingAt,
          arrived: sm.forest.drive.arrived,
          stage: sm.forest.drive.stage,
        } : null,
        lastVoice: window.__specialMeetingDialogueAudit?.calls?.at(-1)
          ? {
            cue: window.__specialMeetingDialogueAudit.calls.at(-1).cue,
            beat: window.__specialMeetingDialogueAudit.calls.at(-1).beat,
            startedAt: playback?.startedAt ?? null,
            expectedEndAt: playback?.expectedEndAt ?? null,
            endedAt: playback?.endedAt ?? null,
            ended: playback?.ended ?? null,
          }
          : null,
        audioTime: window.__specialMeetingDialogueAudit?.engine?.ctx?.currentTime ?? null,
        routeTail: (window.__specialMeetingRouteAudit?.samples ?? []).slice(-20).map((sample) => ({
          t: sample.t,
          beat: sample.beat,
          distance: sample.distance,
          speed: sample.speed,
          waitingAt: sample.waitingAt,
        })),
      };
    });
    throw new Error(`Timed out waiting for ${beatId} / ${JSON.stringify(text)}: ${JSON.stringify(state)}`, { cause: error });
  }
  const choice = await page.evaluate(({ beatId: wanted, text: words }) => {
    const ride = window.SPECIAL_MEETING.ride;
    const ordinal = ride.options.findIndex((option) => option.text.includes(words)) + 1;
    return {
      beat: ride.beatId,
      ordinal,
      option: ride.options[ordinal - 1]?.text ?? null,
      visibleButtons: document.querySelectorAll('#choices button').length,
    };
  }, { beatId, text });
  if (!choice.ordinal) throw new Error(`No ${beatId} option contains ${JSON.stringify(text)}`);
  await page.keyboard.press(String(choice.ordinal));
  console.log(`  input ${beatId} [${choice.ordinal}] ${choice.option}`);
  await page.waitForFunction(
    ({ beatId: previous, text: words }) => {
      const ride = window.SPECIAL_MEETING.ride;
      return ride.beatId !== previous
        || !ride.options?.some((option) => option.text.includes(words));
    },
    { beatId, text },
    { timeout: 5000 },
  );
  return choice;
}

async function doorWorldPoint() {
  return page.evaluate(() => {
    const target = window.SPECIAL_MEETING.stage.sedan.group
      .getObjectByName('specialmeeting.front-passenger-door.interaction-target');
    target.updateWorldMatrix(true, false);
    const point = target.getWorldPosition(new target.position.constructor());
    return { x: point.x, y: point.y, z: point.z };
  });
}

/** A world point genuinely through the windscreen or passenger-side glass. */
async function sedanViewPoint(view, distance = 24) {
  return page.evaluate(({ view: requested, distance: metres }) => {
    const forest = window.SPECIAL_MEETING.forest;
    if (requested === 'forward' && forest?.road && Number.isFinite(forest.drive?.distance)) {
      const ahead = forest.road.at(Math.min(
        forest.road.length(),
        forest.drive.distance + metres,
      ));
      return {
        x: ahead.x,
        y: forest.heightAt(ahead.x, ahead.z) + 0.7,
        z: ahead.z,
      };
    }
    const sedan = window.SPECIAL_MEETING.stage.sedan;
    const eye = sedan.eyeWorld('front_passenger', new window.SPECIAL_MEETING.player.position.constructor());
    let dx;
    let dz;
    if (requested === 'side') {
      const door = sedan.doorWorld('front_passenger', eye.clone());
      const centre = sedan.group.getWorldPosition(eye.clone());
      dx = door.x - centre.x;
      dz = door.z - centre.z;
    } else {
      const yaw = sedan.facingYaw();
      dx = -Math.sin(yaw);
      dz = -Math.cos(yaw);
    }
    const length = Math.hypot(dx, dz) || 1;
    const x = eye.x + (dx / length) * metres;
    const z = eye.z + (dz / length) * metres;
    return {
      x,
      /* A level side glance aims at empty night sky whenever the road falls
       * away from the passenger side. Aim the verifier at the authored tree
       * line instead: four metres above the terrain is trunk/crown, and still
       * inside the real seated look cone. The camera continues to move only
       * through browser mouse events. */
      y: requested === 'side' && forest?.heightAt
        ? forest.heightAt(x, z) + 4
        : eye.y,
      z,
    };
  }, { view, distance });
}

/** Read the pixels from a saved browser frame without a native image package.
 * This is deliberately screenshot-backed: object presence and transparent
 * materials both passed while the player still saw a featureless black side
 * window. */
async function screenshotRegionLuminance(file, region) {
  const png = await fsp.readFile(file);
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  return page.evaluate(async ({ source, crop }) => {
    const bitmap = new Image();
    await new Promise((resolve, reject) => {
      bitmap.onload = resolve;
      bitmap.onerror = () => reject(new Error('Special Meeting evidence PNG failed to decode'));
      bitmap.src = source;
    });
    const sx = Math.round(bitmap.naturalWidth * crop.x);
    const sy = Math.round(bitmap.naturalHeight * crop.y);
    const sw = Math.max(1, Math.round(bitmap.naturalWidth * crop.width));
    const sh = Math.max(1, Math.round(bitmap.naturalHeight * crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 54;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    let readable = 0;
    let distinct = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const light = (
        pixels[index] * 0.2126
        + pixels[index + 1] * 0.7152
        + pixels[index + 2] * 0.0722
      ) / 255;
      total += light;
      if (light > 0.04) readable += 1;
      if (light > 0.08) distinct += 1;
    }
    const count = pixels.length / 4;
    return {
      mean: +(total / count).toFixed(4),
      readableFraction: +(readable / count).toFixed(4),
      distinctFraction: +(distinct / count).toFixed(4),
      sourceSize: [bitmap.naturalWidth, bitmap.naturalHeight],
    };
  }, { source: dataUrl, crop: region });
}

/** Walk the actual Player into the door's look-at interaction range. */
async function approachFrontPassengerDoor() {
  for (let step = 0; step < 28; step += 1) {
    const state = await page.evaluate(() => ({
      current: window.SPECIAL_MEETING.certification.interactionCurrentId,
      mode: window.SPECIAL_MEETING.player.mode,
    }));
    if (state.current === 'specialmeeting.front_passenger_door') return state;
    if (state.mode !== 'walk') return state;
    await lookAtWorldPoint(await doorWorldPoint());
    await page.keyboard.down('w');
    await page.waitForTimeout(180);
    await page.keyboard.up('w');
    await page.waitForTimeout(35);
  }
  return page.evaluate(() => {
    const sm = window.SPECIAL_MEETING;
    const target = sm.stage.sedan.group
      .getObjectByName('specialmeeting.front-passenger-door.interaction-target');
    const point = target.getWorldPosition(new target.position.constructor());
    const dx = point.x - sm.player.position.x;
    const dz = point.z - sm.player.position.z;
    return {
      current: sm.certification.interactionCurrentId,
      mode: sm.player.mode,
      player: { x: sm.player.position.x, y: sm.player.position.y, z: sm.player.position.z },
      target: { x: point.x, y: point.y, z: point.z },
      distance: point.distanceTo(sm.player.position),
      yaw: sm.player.yaw,
      desiredYaw: Math.atan2(-dx, -dz),
      pitch: sm.player.pitch,
    };
  });
}

try {
  await page.goto(`http://localhost:${PORT}/specialmeeting.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SPECIAL_MEETING?.player, null, { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => {
    const policy = window.__SQUATCH_QA_AUDIO__;
    const engine = policy?.engines?.[0];
    if (!engine) throw new Error('Special Meeting did not construct a certifiable AudioEngine');
    const calls = [];
    const original = engine.playWithReceipt.bind(engine);
    engine.playWithReceipt = (name, options = {}) => {
      const played = original(name, options);
      const follow = options.follow ?? null;
      const playback = engine.playbacks.at(-1) ?? null;
      const speaker = ['seff', 'lag', 'numbskull', 'kittenboss', 'tony']
        .find((candidate) => name.includes(`.${candidate}.`)) ?? null;
      calls.push({
        cue: name,
        beat: window.SPECIAL_MEETING?.ride?.beatId ?? null,
        phase: window.SPECIAL_MEETING?.ride?.phase ?? null,
        /* Capture the live semantic seat at the instant the line begins. The
         * rear-seat swap persists after SM-322; deriving this later from the
         * beat id falsely expects Lag to teleport back for SM-325. */
        seatAtPlayback: speaker && speaker !== 'tony'
          ? (window.SPECIAL_MEETING?.cast?.seatOf(speaker) ?? null)
          : null,
        followName: follow?.name ?? null,
        requestedPositionName: options.position?.name ?? null,
        receipt: played.receipt ? {
          requested: played.receipt.requested,
          actual: played.receipt.actual,
          source: played.receipt.source,
          started: played.receipt.started,
          voice: played.receipt.voice,
          follows: played.receipt.positional?.follows ?? false,
          positional: played.receipt.positional?.enabled ?? false,
        } : null,
        /* Keep the real timing record by reference in the page. It is not
         * serialised below; voiceOverlaps() consumes it after the route. */
        playback,
      });
      return played;
    };
    window.__specialMeetingDialogueAudit = { engine, calls };
  });

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
  check('every authored Special Meeting voice take is delivered under its exact filename',
    MISSING_SPECIAL_RECORDINGS.length === 0,
    MISSING_SPECIAL_RECORDINGS.length
      ? `${MISSING_SPECIAL_RECORDINGS.length} missing: ${MISSING_SPECIAL_RECORDINGS.map((cue) => cueFile(cue)).join(', ')}`
      : `${EXPECTED_VOICE_CUE_COUNT} delivered recordings`);
  check('startup is closed before the first player gesture',
    !initial.started && !initial.voiceReady
      && initial.expectedVoiceCueCount === EXPECTED_VOICE_CUE_COUNT
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
        /* Owner, 2026-08-31: "we have to make sure that she's invisible in
         * the trunk." Kittenboss rides a SHUT boot from the first frame, so
         * her visibility belongs to the lid (cast.js rideInTheBoot) and she
         * is REQUIRED to be hidden here. The three men stay visible. */
        && (person.characterId === 'kittenboss' ? !person.visible : person.visible)
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
   * photograph that HAS landed must be on the model. This stays data-driven:
   * Kittenboss now has a landed portrait while the others currently exercise
   * the null branch, and a regenerated index changes the obligation without a
   * verifier edit. */
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
  /* `started` flips when the ARRIVAL settles, not when the cues decode:
   * measured on this runner, all 228 voice cues are ready 10 s after the
   * click and `started` still waits ~130 s for the SwiftShader-slow drive
   * to reach the kerb — identical on an unmodified checkout, so a fixed
   * 120 s here was a race the runner loses by ten seconds. Same honest
   * clock as chooseAtBeat's budget above, and for the same reason. */
  await page.waitForFunction(
    () => window.SPECIAL_MEETING.started || window.SPECIAL_MEETING.voiceLoadError,
    null,
    { timeout: 600000 },
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
  check(`the first click starts SM-100 only after all ${EXPECTED_VOICE_CUE_COUNT} voice slots decode`,
    startup.started && startup.ready
      && startup.expected === EXPECTED_VOICE_CUE_COUNT
      && startup.decoded === EXPECTED_VOICE_CUE_COUNT
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
      verifierSubstitutes: MISSING_SPECIAL_RECORDINGS.map((cue) => cue.name),
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
  /* A starved hosted runner can coalesce or defer the synthetic
   * pointer-locked deltas past any fixed wait (scheduled run 33488181465
   * failed the look check with yaw byte-identical while the same tree
   * passes locally). Wait on the camera itself and nudge again, bounded. */
  for (let nudge = 0; nudge < 3; nudge += 1) {
    const turned = await page.waitForFunction(({ yaw, pitch }) => (
      Math.abs(window.SPECIAL_MEETING.player.yaw - yaw) > 0.01
        && Math.abs(window.SPECIAL_MEETING.player.pitch - pitch) > 0.01
    ), { yaw: beforeInput.yaw, pitch: beforeInput.pitch }, { timeout: 1500 })
      .catch(() => null);
    if (turned) break;
    await page.mouse.move(320 + nudge * 8, 180 + nudge * 6);
    await page.mouse.move(402, 132, { steps: 2 });
  }
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
   * The scene shipped for weeks with its HUD at opacity zero -- all authored voice
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

  /* SM-100 is deliberately unhurried. Walk to the live car while those seven
   * lines play, then wait for the authored hub instead of selecting it through
   * the published sequence object. */
  await approachFrontPassengerDoor();
  await page.waitForFunction(
    () => window.SPECIAL_MEETING.ride.beatId === 'SM-110'
      && window.SPECIAL_MEETING.ride.options?.some((option) => option.accepts),
    null,
    { timeout: 600000 },
  );
  const approached = await approachFrontPassengerDoor();
  await lookAtWorldPoint(await doorWorldPoint());
  if (approached.current !== 'specialmeeting.front_passenger_door') {
    throw new Error(`real-input door approach did not acquire the target: ${JSON.stringify(approached)}`);
  }
  const doorPrompt = await page.evaluate(() => ({
    id: window.SPECIAL_MEETING.certification.interactionCurrentId,
    prompt: document.getElementById('prompt')?.textContent?.trim() ?? '',
    display: getComputedStyle(document.getElementById('prompt')).display,
    actions: window.SPECIAL_MEETING.certification.legalActions,
    distance: (() => {
      const sm = window.SPECIAL_MEETING;
      const target = sm.stage.sedan.group
        .getObjectByName('specialmeeting.front-passenger-door.interaction-target');
      const point = target.getWorldPosition(new target.position.constructor());
      return point.distanceTo(sm.player.position);
    })(),
  }));
  check('the parked car exposes a visible, reachable front-seat interaction',
    approached.mode === 'walk'
      && doorPrompt.id === 'specialmeeting.front_passenger_door'
      && doorPrompt.prompt.includes('Get in the front passenger seat')
      && doorPrompt.display !== 'none'
      && doorPrompt.distance <= 2.7
      && doorPrompt.actions.includes('interaction.specialmeeting.front_passenger_door'),
    JSON.stringify({ approached, ...doorPrompt }));

  const pickupAttention = await page.evaluate(() => {
    const sm = window.SPECIAL_MEETING;
    const inspect = (key) => {
      const npc = sm.cast.byKey(key);
      const world = npc.group.getWorldPosition(npc.group.position.clone());
      const toward = sm.player.position.clone().sub(world).setY(0).normalize();
      const bodyForward = new npc.group.position.constructor(0, 0, 1)
        .applyQuaternion(npc.group.getWorldQuaternion(npc.group.quaternion.clone()))
        .setY(0).normalize();
      const headForward = new npc.group.position.constructor(0, 0, 1)
        .applyQuaternion(npc.parts.head.getWorldQuaternion(npc.parts.head.quaternion.clone()))
        .setY(0).normalize();
      return {
        key,
        seated: Boolean(npc.seated),
        seat: sm.cast.seatOf(key),
        distance: world.distanceTo(sm.player.position),
        bodyDot: bodyForward.dot(toward),
        headDot: headForward.dot(toward),
        headYaw: npc.parts.head.rotation.y,
      };
    };
    return ['seff', 'lag', 'numbskull'].map(inspect);
  });
  const lagAttention = pickupAttention.find((entry) => entry.key === 'lag');
  const numbskullAttention = pickupAttention.find((entry) => entry.key === 'numbskull');
  const seffAttention = pickupAttention.find((entry) => entry.key === 'seff');
  check('the two standing escorts turn their bodies and heads naturally toward the Prospect',
    [lagAttention, numbskullAttention].every((entry) => (
      entry
        && !entry.seated
        && entry.distance < 7
        && entry.bodyDot > 0.45
        && entry.headDot > 0.72
    )),
    JSON.stringify(pickupAttention));
  check('the seated driver keeps his body at the wheel while his head acknowledges the Prospect',
    seffAttention
      && seffAttention.seated
      && seffAttention.seat === 'driver'
      && seffAttention.distance < 7
      && seffAttention.headDot > 0.65,
    JSON.stringify(pickupAttention));

  /* This is the scene's actual physical acceptance path. Number 3 would reach
   * the same authored option, but would not prove the car is interactable. */
  await page.keyboard.press('e');
  await page.waitForFunction(
    () => window.SPECIAL_MEETING.certification.interactionUseCount === 1,
    null,
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () => window.SPECIAL_MEETING.player.mode === 'seated'
      && window.SPECIAL_MEETING.ride.seated === true,
    null,
    { timeout: 600000 },
  );
  const seated = await page.evaluate(() => {
    const sm = window.SPECIAL_MEETING;
    const eye = sm.stage.sedan.eyeWorld('front_passenger', new sm.player.position.constructor());
    return {
      useCount: sm.certification.interactionUseCount,
      receipt: sm.certification.lastInteractionUse,
      mode: sm.player.mode,
      phase: sm.ride.phase,
      eyeError: sm.player.position.distanceTo(eye),
      yawCenter: sm.player.yawCenter,
      yawRange: sm.player.yawRange,
      pitchMin: sm.player.pitchMin,
      pitchMax: sm.player.pitchMax,
      occupants: sm.stage.sedan.occupantIds(),
      seatedAs: sm.cast.seatedAs(),
    };
  });
  check('pressing E takes the authored acceptance branch and seats the player',
    seated.useCount === 1
      && seated.receipt?.beat === 'SM-110'
      && seated.mode === 'seated'
      && seated.phase === 'seated'
      && seated.eyeError < 1e-4,
    JSON.stringify(seated));

  /* A seated player keeps their eyes but loses locomotion. Hit every edge of
   * the authored cone through real pointer-lock motion, then hold W long
   * enough that a walk-mode controller would have moved more than a metre. */
  await moveLook(5000, 5000);
  const lowerLook = await page.evaluate(() => {
    const p = window.SPECIAL_MEETING.player;
    return { yaw: p.yaw, centre: p.yawCenter, range: p.yawRange,
      pitch: p.pitch, min: p.pitchMin, max: p.pitchMax };
  });
  await moveLook(-10000, -10000);
  const upperLook = await page.evaluate(() => {
    const p = window.SPECIAL_MEETING.player;
    return { yaw: p.yaw, centre: p.yawCenter, range: p.yawRange,
      pitch: p.pitch, min: p.pitchMin, max: p.pitchMax };
  });
  check('the passenger can look around the cabin but cannot rotate like an owl',
    Math.abs(lowerLook.yaw - (lowerLook.centre - lowerLook.range)) < 0.01
      && Math.abs(upperLook.yaw - (upperLook.centre + upperLook.range)) < 0.01
      && Math.abs(lowerLook.pitch - lowerLook.min) < 0.01
      && Math.abs(upperLook.pitch - upperLook.max) < 0.01
      && lowerLook.range > 2.3 && lowerLook.range < Math.PI,
    JSON.stringify({ lowerLook, upperLook }));

  const forwardPoint = await sedanViewPoint('forward');
  await lookAtWorldPoint(forwardPoint);
  const beforeSeatedMove = await page.evaluate(() => {
    const sm = window.SPECIAL_MEETING;
    const local = sm.stage.sedan.group.worldToLocal(sm.player.position.clone());
    return { local: local.toArray(), mode: sm.player.mode };
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(650);
  await page.keyboard.up('w');
  const afterSeatedMove = await page.evaluate(() => {
    const sm = window.SPECIAL_MEETING;
    const local = sm.stage.sedan.group.worldToLocal(sm.player.position.clone());
    const eye = sm.stage.sedan.eyeWorld('front_passenger', sm.player.position.clone());
    return {
      local: local.toArray(), mode: sm.player.mode,
      eyeError: eye.distanceTo(sm.player.position),
      keys: [...sm.player.keys],
    };
  });
  const seatedLocalDrift = Math.hypot(...afterSeatedMove.local.map(
    (value, index) => value - beforeSeatedMove.local[index],
  ));
  check('W cannot make a seated passenger walk, stand, or leave the car',
    beforeSeatedMove.mode === 'seated'
      && afterSeatedMove.mode === 'seated'
      && seatedLocalDrift < 1e-4
      && afterSeatedMove.eyeError < 1e-4
      && afterSeatedMove.keys.length === 0,
    JSON.stringify({ beforeSeatedMove, afterSeatedMove, seatedLocalDrift }));

  const glazing = await page.evaluate(() => {
    const sedan = window.SPECIAL_MEETING.stage.sedan;
    const pane = (object) => ({
      name: object?.name ?? null,
      transparent: object?.material?.transparent ?? false,
      opacity: object?.material?.opacity ?? 1,
      depthWrite: object?.material?.depthWrite ?? true,
      side: object?.material?.side ?? null,
      visible: object?.visible ?? false,
    });
    return {
      windscreen: pane(sedan.group.getObjectByName('sedan.windscreen')),
      sideGlass: pane(sedan.car.glass),
      panes: sedan.glazing.panes.map(pane),
      paneNames: sedan.glazing.panes.map((object) => object.name),
      windscreenLayers: sedan.glazing.panes.filter(
        (object) => /\.windscreen$/.test(object.name),
      ).length,
      borrowedGreenhouseAttached: Boolean(sedan.glazing.borrowedGreenhouse.parent),
      legacyGreenhousePresent: Boolean(sedan.group.getObjectByName('car.glass')),
      cameraFar: window.SPECIAL_MEETING.player.camera.far,
    };
  });
  check('six discrete panes replace the obstructing greenhouse and preserve the route view',
    glazing.windscreen.visible
      && glazing.windscreen.transparent
      && glazing.windscreen.opacity <= 0.2
      && glazing.sideGlass.visible
      && glazing.sideGlass.transparent
      && glazing.sideGlass.opacity <= 0.24
      && glazing.panes.length === 6
      && glazing.panes.every((pane) => (
        pane.visible && pane.transparent && !pane.depthWrite
      ))
      && glazing.windscreenLayers === 1
      && !glazing.borrowedGreenhouseAttached
      && !glazing.legacyGreenhousePresent
      && glazing.cameraFar >= 300,
    JSON.stringify(glazing));

  const liveArtifactDir = path.join(ROOT, '.artifacts', 'specialmeeting-live');
  await fsp.mkdir(liveArtifactDir, { recursive: true });
  await lookAtWorldPoint(await sedanViewPoint('forward'));
  await page.screenshot({ path: path.join(liveArtifactDir, 'seated-forward.png') });
  await lookAtWorldPoint(await sedanViewPoint('side', 12));
  await page.screenshot({ path: path.join(liveArtifactDir, 'seated-side-window.png') });
  await lookAtWorldPoint(await sedanViewPoint('forward'));

  /* Observe the real rail, passenger rig, car-owned cast anchors and WebAudio
   * followers at 10 Hz. The sampler never writes into any gameplay object. */
  await page.evaluate(async () => {
    const { boundsInFrame } = await import('/src/core/spatial-bounds.js');
    const audit = { samples: [], followerAnchors: new Set() };
    const sample = () => {
      const sm = window.SPECIAL_MEETING;
      const forest = sm?.forest;
      if (!forest) return;
      const eye = sm.stage.sedan.eyeWorld('front_passenger', sm.player.position.clone());
      const numbskull = sm.cast.byKey('numbskull');
      const headliner = sm.stage.sedan.group.getObjectByName('sedan.headliner');
      const numbskullBounds = boundsInFrame(numbskull.group, sm.stage.sedan.group);
      const headlinerBounds = boundsInFrame(headliner, sm.stage.sedan.group);
      const engine = window.__specialMeetingDialogueAudit.engine;
      const followers = [...(engine._following ?? [])].map((entry) => entry.target?.name ?? null)
        .filter(Boolean);
      followers.forEach((name) => audit.followerAnchors.add(name));
      audit.samples.push({
        t: performance.now(),
        beat: sm.ride.beatId,
        phase: sm.ride.phase,
        distance: forest.drive.distance,
        speed: forest.drive.speed,
        waitingAt: forest.drive.waitingAt,
        arrived: forest.drive.arrived,
        /* Low speed immediately before an authored stop is deceleration, not
         * a softlock. Record that semantic fact in-page so a starved 100 ms
         * sampler cannot turn one braking frame into a fake multi-second
         * unexplained pause. */
        approachingAuthoredStop: forest.drive._events.some((event) => (
          event.stop
            && !event.fired
            && event.s >= forest.drive.distance - 0.05
            && event.s - forest.drive.distance < 3
        )),
        stage: forest.drive.stage,
        blackout: document.querySelector('#blackout')?.classList.contains('on') ?? false,
        travelLoops: ['sm.forest.engine', 'sm.forest.road'].filter(
          (key) => engine.loops.has(key),
        ),
        car: [forest.car.group.position.x, forest.car.group.position.y, forest.car.group.position.z],
        eyeError: eye.distanceTo(sm.player.position),
        numbskullRoofClearance: headlinerBounds.min.y - numbskullBounds.max.y,
        mode: sm.player.mode,
        chunks: forest.terrain.chunks.size,
        trees: forest.terrain.treeCount,
        seatedAs: sm.cast.seatedAs(),
        parents: ['seff', 'lag', 'numbskull'].map((key) => {
          const npc = sm.cast.byKey(key);
          const seat = sm.cast.seatOf(key);
          const expected = seat ? sm.stage.sedan.seatAnchor(seat) : null;
          return {
            key,
            seat,
            parent: npc.group.parent?.name ?? null,
            local: npc.group.position.toArray(),
            attachedCorrectly: !seat || npc.group.parent === expected,
          };
        }),
        followers,
      });
    };
    audit.timer = setInterval(sample, 100);
    window.__specialMeetingRouteAudit = audit;
  });

  const choicesTaken = [];
  choicesTaken.push(await chooseAtBeat('SM-210', 'No. Thanks.'));
  const radioGagLifecycle = await page.evaluate(() => (
    window.SPECIAL_MEETING.radioGagReceipts.at(-1) ?? null
  ));
  check('SM-200 plays the delivered announcer recording and Seff cuts it at exactly two seconds',
    radioGagLifecycle?.started === true
      && radioGagLifecycle.receipt?.requested === 'radio.vo.announcer.0177le3'
      && radioGagLifecycle.receipt?.actual === 'radio.vo.announcer.0177le3'
      && radioGagLifecycle.receipt?.source === 'buffer'
      && radioGagLifecycle.receipt?.started === true
      && radioGagLifecycle.naturalSeconds > radioGagLifecycle.seconds
      && radioGagLifecycle.cutScheduled === true
      && Math.abs(
        radioGagLifecycle.stopAt
          - radioGagLifecycle.startedAt
          - radioGagLifecycle.seconds,
      ) < 1e-6
      && radioGagLifecycle.seconds === 2
      && radioGagLifecycle.ended === true
      && radioGagLifecycle.endedReason === 'cut'
      && radioGagLifecycle.lifecycle === 'cut',
    JSON.stringify(radioGagLifecycle));
  choicesTaken.push(await chooseAtBeat('SM-250', 'Say nothing. Sit in it.'));
  choicesTaken.push(await chooseAtBeat('SM-260', '[Say nothing.]'));
  choicesTaken.push(await chooseAtBeat('SM-280', '[Say nothing.]'));
  await lookAtWorldPoint(await sedanViewPoint('forward', 60));
  const forwardEvidence = path.join(liveArtifactDir, 'drive-remote-forward.png');
  await page.screenshot({ path: forwardEvidence });
  /* Exercise the harder branch: the men physically trade rear seats while the
   * car is moving and the voice origins must trade with them. */
  choicesTaken.push(await chooseAtBeat('SM-320', 'Yeah. Actually'));
  await lookAtWorldPoint(await sedanViewPoint('side', 12));
  const sideEvidence = path.join(liveArtifactDir, 'drive-remote-side.png');
  await page.screenshot({ path: sideEvidence });
  const [forwardVisibility, sideVisibility] = await Promise.all([
    screenshotRegionLuminance(forwardEvidence, {
      x: 0.03, y: 0.37, width: 0.58, height: 0.41,
    }),
    screenshotRegionLuminance(sideEvidence, {
      x: 0.28, y: 0.22, width: 0.69, height: 0.48,
    }),
  ]);
  check('the rendered road and side woods remain readable through the live cabin glass',
    forwardVisibility.mean >= 0.055
      && forwardVisibility.readableFraction >= 0.55
      && sideVisibility.mean >= 0.04
      && sideVisibility.readableFraction >= 0.25,
    JSON.stringify({ forward: forwardVisibility, side: sideVisibility }));
  await lookAtWorldPoint(await sedanViewPoint('forward'));

  /* Observe the reveal while it is authored to be visible: SM-410 raises the
   * lid, SM-420 lets Kittenboss out and Numbskull shuts it after "Long story."
   * Waiting until the later question hub would certify the aftermath, not the
   * reveal itself. */
  await page.waitForFunction(
    () => window.SPECIAL_MEETING.ride.beatId === 'SM-420'
      && window.SPECIAL_MEETING.ride.trunkOpen
      && window.SPECIAL_MEETING.stage.sedan.trunkOpen >= 0.98,
    null,
    { timeout: 600000 },
  );

  const kittenReveal = await page.evaluate(async () => {
    const { Raycaster, Vector3 } = await import('three');
    const sm = window.SPECIAL_MEETING;
    const kitten = sm.cast.byKey('kittenboss');
    const exit = sm.stage.sedan.doorWorld('trunk', kitten.group.position.clone());
    const world = kitten.group.getWorldPosition(kitten.group.position.clone());
    const head = kitten.parts.head.getWorldPosition(new Vector3());
    sm.player.camera.updateMatrixWorld(true);
    const screen = head.clone().project(sm.player.camera);
    const eye = sm.player.camera.getWorldPosition(new Vector3());
    const sightline = head.clone().sub(eye);
    const sightlineLength = sightline.length();
    const raycaster = new Raycaster(
      eye,
      sightline.normalize(),
      0.02,
      Math.max(0.02, sightlineLength - 0.03),
    );
    const materialIsOpaque = (material) => {
      const materials = Array.isArray(material) ? material : [material];
      return materials.some((entry) => entry && entry.visible !== false
        && !entry.transparent && (entry.opacity ?? 1) >= 0.98);
    };
    const opaqueCarHits = raycaster.intersectObject(sm.stage.sedan.group, true)
      .filter((hit) => materialIsOpaque(hit.object.material))
      .map((hit) => ({ name: hit.object.name, distance: hit.distance }));
    return {
      beat: sm.ride.beatId,
      visible: kitten.group.visible,
      seated: Boolean(kitten.seated),
      seat: sm.cast.seatOf('kittenboss'),
      parent: kitten.group.parent?.name ?? null,
      profile: {
        gender: kitten.parts.profile.gender ?? null,
        bodyShape: kitten.parts.profile.bodyShape ?? null,
      },
      rideTrunkOpen: sm.ride.trunkOpen,
      renderedTrunkOpen: sm.stage.sedan.trunkOpen,
      occupants: sm.stage.sedan.occupantIds(),
      distanceFromTrunkExit: world.distanceTo(exit),
      screen: { x: screen.x, y: screen.y, z: screen.z },
      opaqueCarHits,
    };
  });
  await page.screenshot({ path: path.join(liveArtifactDir, 'arrival-kittenboss-reveal.png') });

  /* SAY WHICH BEAT IT DIED ON. This wait -- and its twin above -- report a
   * bare TimeoutError, which cannot distinguish a ride that is STUCK from one
   * that is merely slow: `chooseAtBeat` budgets 600 s for exactly this seam
   * and explains why (SwiftShader renders this forest under 20 fps, and the
   * game caps a frame's simulation delta at 50 ms, so authored seconds run
   * long). Raising the number before knowing which of the two it is would be
   * papering over a stall, so the state gets dumped first. It answered:
   *
   *   beat SM-430, phase "spur", optionCount null, trunkOpen 0,
   *   objective "Wait by the car."
   *
   * The ride is one beat short of SM-440, the trunk condition is already met,
   * and the beat it is sitting in is an authored wait — the objective says so.
   * Nothing is stuck; the pause is real content playing out at headless frame
   * rates. So these two raw waits get the same 600 s `chooseAtBeat` gives
   * every other beat wait in this file, for the reason it already documents.
   * The dump stays: the next person to see this time out should get the beat
   * id rather than a bare TimeoutError, the way this one did not. */
  try {
    await page.waitForFunction(
      () => window.SPECIAL_MEETING.ride.beatId === 'SM-440'
        && window.SPECIAL_MEETING.ride.options?.length >= 7
        && window.SPECIAL_MEETING.stage.sedan.trunkOpen <= 0.02,
      null,
      { timeout: 600000 },
    );
  } catch (error) {
    const stalled = await page.evaluate(() => {
      const sm = window.SPECIAL_MEETING;
      return {
        beat: sm?.ride?.beatId ?? null,
        phase: sm?.ride?.phase ?? null,
        optionCount: sm?.ride?.options?.length ?? null,
        trunkOpen: sm?.stage?.sedan?.trunkOpen ?? null,
        objective: sm?.certification?.objectiveText ?? null,
      };
    }).catch(() => null);
    /* console.error, not `error.message +=`. Node prints an uncaught
     * exception's `stack`, and that string is built when the Error is
     * constructed — appending to `.message` afterwards leaves the stack
     * holding the original text, so the first version of this diagnostic
     * captured the ride state and then threw it away. Print it. */
    console.error(`Ride stalled waiting for SM-440: ${JSON.stringify(stalled)}`);
    throw error;
  }
  const revealAftermath = await page.evaluate(() => ({
    beat: window.SPECIAL_MEETING.ride.beatId,
    rideTrunkOpen: window.SPECIAL_MEETING.ride.trunkOpen,
    renderedTrunkOpen: window.SPECIAL_MEETING.stage.sedan.trunkOpen,
  }));

  check('the parked arrival opens for Kittenboss, releases her, then shuts after the reveal',
    kittenReveal.beat === 'SM-420'
      && kittenReveal.visible
      && !kittenReveal.seated
      && kittenReveal.seat === null
      && !kittenReveal.occupants.includes('trunk')
      && kittenReveal.rideTrunkOpen
      && kittenReveal.renderedTrunkOpen >= 0.98
      && kittenReveal.distanceFromTrunkExit < 1.8
      && Math.abs(kittenReveal.screen.x) < 0.95
      && Math.abs(kittenReveal.screen.y) < 0.95
      && kittenReveal.screen.z >= -1
      && kittenReveal.screen.z <= 1
      && kittenReveal.opaqueCarHits.length === 0
      && kittenReveal.profile.gender === 'female'
      && kittenReveal.profile.bodyShape === 'curvy'
      && revealAftermath.beat === 'SM-440'
      && !revealAftermath.rideTrunkOpen
      && revealAftermath.renderedTrunkOpen <= 0.02,
    JSON.stringify({ reveal: kittenReveal, aftermath: revealAftermath }));

  /* This hub is explicitly repeatable. Exercise every authored answer once,
   * including silence, before leaving through the real numbered-key path. */
  for (const option of [
    'Are you all right?',
    'Why were you in the trunk?',
    'Are you a prospect?',
    'Do you know what this is?',
    'Nice to meet you.',
    '[Say nothing.]',
    '[Leave it. They are waiting.]',
  ]) {
    choicesTaken.push(await chooseAtBeat('SM-440', option));
  }
  await page.waitForFunction(
    () => window.SPECIAL_MEETING.ride.beatId === 'SM-520'
      && window.SPECIAL_MEETING.ride.options?.length === 5,
    null,
    { timeout: 600000 },
  );
  check('real numbered input completes every reachable car and Kittenboss choice branch',
    choicesTaken.length === 12
      && choicesTaken.every((choice) => choice.ordinal > 0 && choice.visibleButtons > 0),
    JSON.stringify(choicesTaken));

  const certification = await page.evaluate(async () => {
    const sm = window.SPECIAL_MEETING;
    const audit = window.__specialMeetingRouteAudit;
    clearInterval(audit.timer);
    const samples = audit.samples;
    const driving = samples.filter((sample) => sample.phase === 'driving');

    let progressRegressions = 0;
    for (let i = 1; i < driving.length; i += 1) {
      if (driving[i].distance + 1e-5 < driving[i - 1].distance) progressRegressions += 1;
    }

    let quietStarted = null;
    let maxUnexplainedStopMs = 0;
    for (const sample of driving) {
      const unexplained = sample.distance > 2
        && sample.speed < 0.2
        && !sample.waitingAt
        && !sample.arrived
        && !sample.approachingAuthoredStop;
      if (unexplained && quietStarted === null) quietStarted = sample.t;
      if (!unexplained && quietStarted !== null) {
        maxUnexplainedStopMs = Math.max(maxUnexplainedStopMs, sample.t - quietStarted);
        quietStarted = null;
      }
    }
    if (quietStarted !== null && driving.length) {
      maxUnexplainedStopMs = Math.max(
        maxUnexplainedStopMs,
        driving.at(-1).t - quietStarted,
      );
    }

    const localStarts = new Map();
    let maxOccupantLocalDrift = 0;
    const attachmentFailures = [];
    for (const sample of driving) {
      for (const rider of sample.parents) {
        if (!rider.seat) continue;
        if (!rider.attachedCorrectly) {
          attachmentFailures.push({ t: sample.t, beat: sample.beat, ...rider });
        }
        if (!localStarts.has(rider.key)) localStarts.set(rider.key, rider.local);
        const start = localStarts.get(rider.key);
        maxOccupantLocalDrift = Math.max(
          maxOccupantLocalDrift,
          Math.hypot(...rider.local.map((value, index) => value - start[index])),
        );
      }
    }
    const modeFailures = driving.filter((sample) => sample.mode !== 'seated').length;
    const maxEyeError = Math.max(0, ...driving.map((sample) => sample.eyeError));
    const minNumbskullRoofClearance = Math.min(
      ...driving.map((sample) => sample.numbskullRoofClearance),
    );
    const swapSeen = driving.some((sample) => (
      sample.seatedAs.rear_left === 'numbskull'
      && sample.seatedAs.rear_right === 'lag'
    ));

    const stats = sm.forest.stats();
    const stagesSeen = [...new Set(driving.map((sample) => sample.stage))];
    const waitsSeen = [...new Set(samples.map((sample) => sample.waitingAt).filter(Boolean))];
    /* A real numbered choice can release the chain in the same <100 ms window
     * in which the driver stops. The driver's fired receipts are authoritative
     * for traversal; the sampler remains authoritative for unexplained holds. */
    const firedEvents = sm.forest.drive._events
      .filter((event) => event.fired)
      .map((event) => event.id);
    const minChunks = Math.min(...samples.map((sample) => sample.chunks));
    const minTrees = Math.min(...samples.map((sample) => sample.trees));
    /* Crossing a chunk boundary diagonally leaves the 4x4 intersection of the
     * old and new radius-two grids while nine replacements stream in. Sixteen
     * is therefore the designed minimum, not an arbitrary relaxation from 25. */
    const minimumStreamingOverlap = (sm.forest.terrain.radius * 2) ** 2;
    const transition = sm.certification.driveTransition;
    const earlyBlackSamples = samples.filter((sample) => (
      sample.blackout && !['SM-326', 'SM-327'].includes(sample.beat)
    ));
    const finalBlackSamples = samples.filter((sample) => (
      sample.blackout && ['SM-326', 'SM-327'].includes(sample.beat)
    ));
    const finalCodaSamples = samples.filter((sample) => (
      ['SM-324', 'SM-325'].includes(sample.beat)
    ));

    const road = sm.forest.road.at(sm.forest.drive.distance);
    const carPosition = sm.forest.car.group.position;
    const wheelRadius = sm.stage.sedan.car.shape.wheelR;
    const wheelContacts = sm.forest.car.wheels.map((wheel) => {
      const centre = wheel.getWorldPosition(wheel.position.clone());
      const ground = sm.forest.heightAt(centre.x, centre.z);
      return {
        name: wheel.name,
        gap: centre.y - wheelRadius - ground,
        spin: wheel.rotation.y,
      };
    });
    const parkedVehicles = [];
    const unexpectedTraffic = [];
    const carWorld = sm.forest.car.group.getWorldPosition(sm.forest.car.group.position.clone());
    sm.forest.group.traverse((object) => {
      if (object !== sm.forest.car.group && object.userData?.vehicle) {
        const world = object.getWorldPosition(object.position.clone());
        const receipt = {
          name: object.name || '(unnamed vehicle)',
          distanceFromSedan: world.distanceTo(carWorld),
        };
        if (object.name?.startsWith('forest.parked.')) parkedVehicles.push(receipt);
        else unexpectedTraffic.push(receipt);
      }
    });
    const parking = {
      arrived: sm.forest.drive.arrived,
      waitingAt: sm.forest.drive.waitingAt,
      speed: sm.forest.drive.speed,
      roadError: Math.hypot(carPosition.x - road.x, carPosition.z - road.z),
      finitePose: [
        carPosition.x, carPosition.y, carPosition.z,
        sm.forest.car.group.rotation.x,
        sm.forest.car.group.rotation.y,
        sm.forest.car.group.rotation.z,
      ].every(Number.isFinite),
      wheelContacts,
      parkedVehicles,
      unexpectedTraffic,
    };

    const dialogueAudit = window.__specialMeetingDialogueAudit;
    const voiceCalls = dialogueAudit.calls.filter((call) => (
      call.cue.startsWith('vo.specialmeeting.') && call.receipt?.voice
    ));
    const { voiceOverlaps } = await import('/src/core/dialogue.js');
    const overlaps = voiceOverlaps(voiceCalls.map((call) => call.playback).filter(Boolean));
    const invalidReceipts = voiceCalls.filter((call) => (
      !call.receipt?.started
      || call.receipt.source !== 'buffer'
      || call.receipt.actual !== call.receipt.requested
    )).map((call) => ({ cue: call.cue, receipt: call.receipt }));
    const speakerFor = (cue) => (
      ['seff', 'lag', 'numbskull', 'kittenboss', 'tony']
        .find((speaker) => cue.includes(`.${speaker}.`)) ?? null
    );
    const inCarPhysical = voiceCalls.filter((call) => (
      (call.phase === 'seated' || call.phase === 'driving')
      && speakerFor(call.cue) !== 'tony'
    ));
    const expectedSeat = (call) => call.seatAtPlayback;
    const followFailures = inCarPhysical.filter((call) => {
      const seat = expectedSeat(call);
      return call.followName !== `sedan.voice.${seat}`
        || !call.receipt.follows
        || !call.receipt.positional;
    }).map((call) => ({
      cue: call.cue,
      beat: call.beat,
      followName: call.followName,
      expected: `sedan.voice.${expectedSeat(call)}`,
      receipt: call.receipt,
    }));
    const prospectSpatialFailures = voiceCalls.filter((call) => (
      speakerFor(call.cue) === 'tony'
      && (call.followName !== null || call.receipt.positional || call.receipt.follows)
    )).map((call) => ({ cue: call.cue, followName: call.followName, receipt: call.receipt }));
    const voiceReceiptCount = dialogueAudit.engine.playbackReceipts.filter((receipt) => (
      receipt.voice && receipt.requested.startsWith('vo.specialmeeting.')
    )).length;

    return {
      route: {
        samples: samples.length,
        drivingSamples: driving.length,
        startDistance: driving[0]?.distance ?? null,
        endDistance: stats.distance,
        progressRegressions,
        maxUnexplainedStopMs,
        waitsSeen,
        firedEvents,
        stats,
        stagesSeen,
        minChunks,
        minTrees,
        minimumStreamingOverlap,
        transition: {
          ...transition,
          earlyBlackSamples: earlyBlackSamples.slice(0, 4),
          finalBlackSampleCount: finalBlackSamples.length,
          finalCodaSampleCount: finalCodaSamples.length,
          minimumCodaSpeed: finalCodaSamples.length
            ? Math.min(...finalCodaSamples.map((sample) => sample.speed))
            : null,
          driveTimeScale: sm.forest.drive.timeScale,
          effectiveCruiseSeconds: stats.driveSeconds / sm.forest.drive.timeScale,
          finalBlackLoopsRetained: finalBlackSamples.some((sample) => (
            sample.travelLoops.includes('sm.forest.engine')
              && sample.travelLoops.includes('sm.forest.road')
          )),
        },
      },
      attachment: {
        maxEyeError,
        maxOccupantLocalDrift,
        minNumbskullRoofClearance,
        modeFailures,
        attachmentFailures: attachmentFailures.slice(0, 4),
        swapSeen,
      },
      parking,
      dialogue: {
        voiceCount: voiceCalls.length,
        voiceReceiptCount,
        verifierSubstitutes: window.__SPECIAL_MEETING_VERIFIER_SUBSTITUTES__ ?? [],
        kittenbossVoiceCount: voiceCalls.filter((call) => speakerFor(call.cue) === 'kittenboss').length,
        inCarPhysicalCount: inCarPhysical.length,
        invalidReceipts,
        overlaps,
        followFailures,
        prospectSpatialFailures,
        followerAnchors: [...audit.followerAnchors],
        qaViolations: window.__SQUATCH_QA_AUDIO__.violations,
      },
    };
  });

  check('the kilometre drive makes monotonic progress with only authored stops',
    certification.route.samples > 500
      && certification.route.progressRegressions === 0
      && certification.route.maxUnexplainedStopMs < 1500
      && certification.route.waitsSeen.includes('arrival')
      && certification.route.waitsSeen.every((id) => ['chain', 'arrival'].includes(id))
      && certification.route.firedEvents.includes('chain')
      && certification.route.firedEvents.includes('arrival')
      && certification.route.stats.roadLength > 900
      && certification.route.stats.driveSeconds > 95
      && certification.route.stats.driveSeconds < 120
      && Math.abs(
        certification.route.endDistance - (certification.route.stats.roadLength - 4)
      ) < 0.25,
    JSON.stringify(certification.route));

  check('the drive stays visible until its final exchange, then fades briefly with travel audio retained',
    certification.route.firedEvents.includes('final_approach')
      && certification.route.firedEvents.includes('arrival_fade')
      && certification.route.transition.matchCutAt !== null
      && certification.route.transition.earlyBlackSamples.length === 0
      && certification.route.transition.finalBlackSampleCount > 0
      && certification.route.transition.finalCodaSampleCount > 0
      && certification.route.transition.minimumCodaSpeed > 0.5
      && certification.route.transition.driveTimeScale === 0.60
      && certification.route.transition.effectiveCruiseSeconds > 170
      && certification.route.transition.effectiveCruiseSeconds < 180
      && certification.route.transition.finalBlackLoopsRetained
      && certification.route.transition.fadeOutSeconds === 1.2
      && certification.route.transition.fadeInSeconds === 0.8
      && certification.route.transition.blackDurationMs >= 1200
      && certification.route.transition.blackDurationMs <= 2500
      && certification.route.transition.arrivalAt >= certification.route.transition.fadeInAt
      && certification.route.transition.arrivalBeatAt >= certification.route.transition.arrivalAt
      && ['sm.forest.engine', 'sm.forest.road'].every(
        (key) => certification.route.transition.loopsAtFadeOut.includes(key)
          && certification.route.transition.loopsAtFadeIn.includes(key),
      ),
    JSON.stringify(certification.route.transition));

  check('the player and all three men inherit the moving car without chase, jitter, or seat loss',
    certification.attachment.modeFailures === 0
      && certification.attachment.maxEyeError < 1e-4
      && certification.attachment.maxOccupantLocalDrift < 1e-4
      && certification.attachment.minNumbskullRoofClearance >= 0.015
      && certification.attachment.attachmentFailures.length === 0
      && certification.attachment.swapSeen,
    JSON.stringify(certification.attachment));

  check('all four route stages keep a populated streamed forest beyond the car',
    ['outskirts', 'rural', 'dirt', 'deep'].every(
      (stageName) => certification.route.stagesSeen.includes(stageName),
    )
      && certification.route.minChunks >= certification.route.minimumStreamingOverlap
      && certification.route.minTrees > 200
      && certification.route.stats.legSeparation > 30,
    JSON.stringify({
      stagesSeen: certification.route.stagesSeen,
      minChunks: certification.route.minChunks,
      minTrees: certification.route.minTrees,
      legSeparation: certification.route.stats.legSeparation,
    }));

  check('the sedan parks on the authored spur with four tyres grounded and the four arrivals clear',
    certification.parking.arrived
      && certification.parking.waitingAt === 'arrival'
      && certification.parking.speed < 0.01
      && certification.parking.roadError < 0.15
      && certification.parking.finitePose
      && certification.parking.wheelContacts.length === 4
      && certification.parking.wheelContacts.every((wheel) => Math.abs(wheel.gap) < 0.18)
      && certification.parking.parkedVehicles.length === 4
      && certification.parking.parkedVehicles.every((vehicle) => vehicle.distanceFromSedan > 10)
      && certification.parking.unexpectedTraffic.length === 0,
    JSON.stringify(certification.parking));

  check('the selected path exercises buffered speech without overlap or runtime audio violations',
    certification.dialogue.voiceCount >= 95
      && certification.dialogue.voiceReceiptCount >= 95
      && certification.dialogue.kittenbossVoiceCount >= 22
      && certification.dialogue.invalidReceipts.length === 0
      && certification.dialogue.overlaps.length === 0
      && certification.dialogue.qaViolations.length === 0,
    JSON.stringify(certification.dialogue));

  check('every physical in-car voice follows its live car-owned mouth anchor',
    certification.dialogue.inCarPhysicalCount >= 24
      && certification.dialogue.followFailures.length === 0
      && certification.dialogue.prospectSpatialFailures.length === 0
      && ['sedan.voice.driver', 'sedan.voice.rear_left', 'sedan.voice.rear_right'].every(
        (anchor) => certification.dialogue.followerAnchors.includes(anchor),
      ),
    JSON.stringify({
      inCarPhysicalCount: certification.dialogue.inCarPhysicalCount,
      followFailures: certification.dialogue.followFailures,
      prospectSpatialFailures: certification.dialogue.prospectSpatialFailures,
      followerAnchors: certification.dialogue.followerAnchors,
    }));

  /* Finish the mission as a player. Start walking through the numbered choice,
   * use real W until the liveness contract sees the authored trail distance,
   * answer the last optional beat, then observe the page and persisted campaign
   * change performed by production `navigateCampaign`. */
  choicesTaken.push(await chooseAtBeat('SM-520', '[Start walking.]'));
  await page.waitForFunction(
    () => window.SPECIAL_MEETING.ride.phase === 'trail',
    null,
    { timeout: 600000 },
  );
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(
      () => window.SPECIAL_MEETING.certification.trailDistance
        >= window.SPECIAL_MEETING.certification.trailRequiredDistance,
      null,
      { timeout: 600000 },
    );
  } finally {
    await page.keyboard.up('w').catch(() => {});
  }
  choicesTaken.push(await chooseAtBeat('SM-534', '[Say nothing.]'));

  const navigation = page.waitForURL('**/initiation.html', {
    waitUntil: 'load',
    timeout: 600000,
  });
  await page.waitForFunction(
    () => window.SPECIAL_MEETING.certification.handoff.attempted === 1,
    null,
    { timeout: 600000 },
  );
  const handoffBeforeNavigation = await page.evaluate(() => ({
    ...window.SPECIAL_MEETING.certification.handoff,
    trailDistance: window.SPECIAL_MEETING.certification.trailDistance,
    blackout: document.querySelector('#blackout')?.classList.contains('on') ?? false,
  }));
  await navigation;
  await page.waitForFunction(() => window.INITIATION, null, { timeout: 60000 });
  const initiationArrival = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('squatchlife.campaign') || 'null');
    return {
      pathname: location.pathname,
      globalReady: Boolean(window.INITIATION),
      scene: saved?.scene ?? null,
    };
  });
  check('real trail travel fades out and navigates to the persisted Initiation gathering',
    handoffBeforeNavigation.attempted === 1
      && handoffBeforeNavigation.completed === 0
      && handoffBeforeNavigation.destination?.sceneId === 'initiation'
      && handoffBeforeNavigation.destination?.spawn === 'gathering'
      && handoffBeforeNavigation.trailDistance >= 8
      && handoffBeforeNavigation.blackout
      && initiationArrival.pathname.endsWith('/initiation.html')
      && initiationArrival.globalReady
      && initiationArrival.scene?.id === 'initiation'
      && initiationArrival.scene?.spawn === 'gathering',
    JSON.stringify({ handoffBeforeNavigation, initiationArrival }));

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
