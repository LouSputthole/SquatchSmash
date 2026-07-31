#!/usr/bin/env node
/**
 * Verify the package-gated apartment -> Squatchfather -> apartment round trip
 * in a real browser, including the restaurant's critical state-machine beats,
 * the recorded audio (VO, footsteps, ambience and train beds), and that every
 * seated man faces the way his beat was authored.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5203;
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify Squatchfather.');
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
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const problems = [];
function trackRuntimeErrors(page) {
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });
}

const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
trackRuntimeErrors(page);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

await page.addInitScript(() => {
  if (localStorage.getItem('squatchlife.campaign')) return;
  localStorage.setItem('squatchlife.campaign', JSON.stringify({
    version: 1,
    revision: 7,
    scene: { id: 'apartment', spawn: 'front_door' },
    story: {
      chapter: 'day_one',
      day: 1,
      timeMinutes: 23 * 60 + 55,
      meetingKnown: false,
      meetingLearnedFrom: null,
    },
    activities: {
      eaten: true,
      showered: true,
      pooped: true,
      changedClothes: true,
      emailChecked: false,
    },
    inventory: { carried: [], concealed: ['parcel'] },
    missions: {
      bada_bing_one: {
        status: 'complete',
        packageReceived: true,
        ending: 'rear',
      },
      squatchfather: {
        status: 'available',
        weaponStaged: false,
        weaponDropped: false,
      },
    },
    events: { lou_first_call: { status: 'answered' } },
  }));
});

async function state() {
  return page.evaluate(() => {
    const scene = window.squatchfather;
    const campaign = scene.campaign.state;
    return {
      beat: scene.state(),
      hasWeapon: scene.prospect.hasWeapon,
      weaponDropped: scene.prospect.weaponDropped,
      packageCarried: scene.campaign.hasItem('parcel'),
      mission: campaign.missions.squatchfather,
      endVisible: !document.getElementById('endCard').classList.contains('hidden'),
    };
  });
}

async function go(beat, seconds = 0.2) {
  return page.evaluate(([beat, seconds]) => {
    const scene = window.squatchfather;
    scene.go(beat);
    scene.tick(seconds);
    return scene.state();
  }, [beat, seconds]);
}

async function openingSnapshot(target) {
  return target.evaluate(() => {
    const scene = window.squatchfather;
    const { prospect } = scene;
    return {
      beat: scene.state(),
      canMove: prospect.canMove,
      canLook: prospect.canLook,
      seated: prospect.seated,
      scripted: prospect.autoTarget !== null,
      blocked: prospect.blocked(prospect.pos.x, prospect.pos.z),
      position: {
        x: prospect.pos.x,
        z: prospect.pos.z,
      },
      forward: {
        x: -Math.sin(prospect.yaw),
        z: -Math.cos(prospect.yaw),
      },
    };
  });
}

async function verifyOpeningMovement(target, label) {
  const before = await openingSnapshot(target);
  check(`${label} starts Tony outside every active collider`,
    before.beat === 'START_EXTERIOR'
      && before.canMove
      && before.canLook
      && !before.seated
      && !before.scripted
      && !before.blocked,
    JSON.stringify(before));

  // Real keyboard input drives the real listeners, but the simulation time
  // comes from the scene's own tick so the distance is deterministic even
  // when a loaded machine renders the page at a crawl.
  await target.keyboard.down('KeyW');
  await target.waitForTimeout(120);
  await target.evaluate(() => window.squatchfather.tick(0.6));
  await target.keyboard.up('KeyW');
  await target.waitForTimeout(80);

  const after = await openingSnapshot(target);
  const dx = after.position.x - before.position.x;
  const dz = after.position.z - before.position.z;
  const distance = Math.hypot(dx, dz);
  const forwardProgress = dx * before.forward.x + dz * before.forward.z;
  check(`${label} accepts W movement in the camera-facing direction`,
    distance > 0.35 && forwardProgress > 0.3 && !after.blocked,
    JSON.stringify({
      before: before.position,
      after: after.position,
      distance: Number(distance.toFixed(3)),
      forwardProgress: Number(forwardProgress.toFixed(3)),
      beat: after.beat,
      blocked: after.blocked,
    }));
}

try {
  const previewPage = await browser.newPage({ viewport: { width: 480, height: 300 } });
  trackRuntimeErrors(previewPage);
  await previewPage.goto(
    `http://localhost:${PORT}/squatchfather.html?preview=1`,
    { waitUntil: 'load' },
  );
  await previewPage.waitForFunction(() => window.squatchfather?.fsm, null, { timeout: 60000 });
  check('the direct preview exposes a playable start button',
    await previewPage.locator('#startBtn').isVisible()
      && await previewPage.locator('#squatch-preview-notice').isVisible());
  await previewPage.click('#startBtn');
  await previewPage.waitForFunction(
    () => window.squatchfather.state() === 'START_EXTERIOR',
  );
  await verifyOpeningMovement(previewPage, 'the direct preview');
  await previewPage.close();

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  const departure = await page.evaluate(() => window.__squatch.tryLeave());
  check('the apartment selects Squatchfather after the Bing',
    departure?.destination === 'squatchfather', JSON.stringify(departure));
  await page.waitForURL(`http://localhost:${PORT}/squatchfather.html`, { timeout: 45000 });
  await page.waitForFunction(() => window.squatchfather?.fsm, null, { timeout: 60000 });

  let before = await state();
  check('Lou’s package is still carried before the player begins',
    before.packageCarried && before.mission.status === 'available',
    JSON.stringify(before.mission));

  await page.click('#startBtn');
  await page.waitForFunction(() => window.squatchfather.state() === 'START_EXTERIOR');
  let current = await state();
  check('beginning stages the package as the bathroom weapon',
    !current.packageCarried
      && current.mission.status === 'in_progress'
      && current.mission.weaponStaged,
    JSON.stringify(current.mission));
  await verifyOpeningMovement(page, 'the saved-game entry');

  // ---- Recorded audio: the samples must decode, the beds must run on them,
  // the footsteps must land on real files, and a VO beat must actually play.
  const REQUIRED_SAMPLES = [
    'footstep.wood', 'footstep.tile', 'footstep.street.wet',
    'restaurant.room.tone', 'restaurant.murmur', 'restaurant.kitchen',
    'street.wet.night', 'bathroom.tone',
    'train.elevated.rumble', 'train.elevated.roar', 'train.elevated.sub',
    'ear.ringing', 'vo.sf.greeting.1', 'vo.sf.opening.1',
  ];
  await page.waitForFunction(
    (names) => names.every((n) => window.squatchfather.audio.sampleReady(n)),
    REQUIRED_SAMPLES,
    { timeout: 30000 },
  ).catch(() => {});

  const audioState = await page.evaluate((names) => {
    const scene = window.squatchfather;
    scene.tick(0.5); // lets any synth stand-in bed upgrade to its recording
    const missing = names.filter((n) => !scene.audio.sampleReady(n));
    const beds = {};
    for (const [key, bed] of Object.entries(scene.ambience.beds)) {
      if (bed.name) beds[`ambience.${key}`] = !!bed.isSample;
    }
    for (const [key, bed] of Object.entries(scene.train.beds)) {
      beds[`train.${key}`] = !!bed.isSample;
    }
    return { missing, beds, synthBeds: Object.keys(beds).filter((k) => !beds[k]) };
  }, REQUIRED_SAMPLES);
  check('the ambience and train recordings load and drive the live beds',
    audioState.missing.length === 0 && audioState.synthBeds.length === 0,
    JSON.stringify(audioState));

  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.squatchfather.tick(2));
  await page.keyboard.up('KeyW');
  const steps = await page.evaluate(() => ({
    ready: ['footstep.wood', 'footstep.tile', 'footstep.street.wet']
      .every((n) => window.squatchfather.audio.sampleReady(n)),
    played: window.squatchfather.audio.playLog().filter((n) => n.startsWith('footstep.')),
  }));
  check('footsteps resolve to the recorded surface files',
    steps.ready && steps.played.length > 0,
    JSON.stringify({ ready: steps.ready, played: steps.played.slice(0, 4) }));

  // ---- Every seated man faces his authored direction: McClawsky walks in
  // and takes his chair, Sal is across the table, and Prospect's mirror body
  // sits under the camera. The face is checked empirically from the tie's
  // world position, not just the yaw number.
  const facing = await page.evaluate(() => {
    const scene = window.squatchfather;
    scene.go('APPROACH_TABLE');
    scene.tick(8); // the escort walk ends in the chair

    const worldOf = (obj) => {
      obj.updateWorldMatrix(true, false);
      const m = obj.matrixWorld.elements;
      return { x: m[12], z: m[14] };
    };
    const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const measure = (fig, want, lookTarget) => {
      const at = { x: fig.group.position.x, z: fig.group.position.z };
      const tie = worldOf(fig.tie);
      const face = { x: tie.x - at.x, z: tie.z - at.z };
      const fl = Math.hypot(face.x, face.z) || 1;
      const to = { x: lookTarget.x - at.x, z: lookTarget.z - at.z };
      const tl = Math.hypot(to.x, to.z) || 1;
      return {
        yaw: +fig.group.rotation.y.toFixed(3),
        want: +want.toFixed(3),
        yawErr: +Math.abs(wrap(fig.group.rotation.y - want)).toFixed(3),
        faceDot: +((face.x / fl) * (to.x / tl) + (face.z / fl) * (to.z / tl)).toFixed(3),
        seated: fig.seated,
      };
    };

    const table = { x: 0, z: 5 };
    const playerSeat = { x: 0, z: 3.1 };
    const out = { mcMode: scene.mcclawsky.mode };
    out.sal = measure(scene.sal.fig, Math.PI, playerSeat);
    out.mcclawsky = measure(scene.mcclawsky.fig, -Math.PI / 2, table);

    // Prospect's body: sit, measure, and put everything back.
    const p = scene.prospect;
    const saved = { x: p.pos.x, z: p.pos.z, yaw: p.yaw, canMove: p.canMove };
    p.sit();
    out.prospect = measure(p.fig, 0, table);
    p.stand();
    p.teleport({ x: saved.x, z: saved.z }, saved.yaw);
    p.canMove = saved.canMove;
    p.fig.group.position.set(saved.x, 0, saved.z);
    return out;
  });
  const facingOk = (m) => m.seated && m.yawErr <= 0.05 && m.faceDot >= 0.95;
  check('every seated man faces his authored direction',
    facing.mcMode === 'seated'
      && facingOk(facing.sal) && facingOk(facing.mcclawsky) && facingOk(facing.prospect),
    JSON.stringify(facing));

  // ---- A recorded VO beat plays and holds for the clip's real length.
  const vo = await page.evaluate(() => {
    const scene = window.squatchfather;
    scene.go('OPENING_DIALOGUE');
    scene.tick(2.6); // through the opening beat into Sal's first line
    const log = scene.audio.voLog().slice();
    const hold = scene.dialogue.current && scene.dialogue.current.speaker
      ? +scene.dialogue.t.toFixed(2) : null;
    scene.dialogue.stop(); // don't let the sequence finish under later beats
    return { log, hold };
  });
  check('a recorded VO line plays for the opening beat',
    vo.log.some((v) => v.name === 'vo.sf.opening.1' && v.sample && v.duration > 0.5),
    JSON.stringify(vo));

  await go('SEARCH_TOILET');
  current = await state();
  check('the bathroom objective is reachable', current.beat === 'SEARCH_TOILET', current.beat);

  await go('RETRIEVE_WEAPON', 6.2);
  current = await state();
  check('the real retrieval sequence returns to the table with the weapon',
    current.beat === 'RETURN_TO_TABLE' && current.hasWeapon,
    `${current.beat}, weapon ${current.hasWeapon}`);

  await go('TRAIN_APPROACH');
  await page.evaluate(() => {
    window.squatchfather.pressFire();
    window.squatchfather.tick(0.8);
  });
  current = await state();
  check('the train cue advances into the first shooting beat',
    current.beat === 'SHOOT_SAL', current.beat);

  await page.evaluate(() => {
    window.squatchfather.pressFire();
    window.squatchfather.tick(0.2);
  });
  current = await state();
  check('shooting Sal advances to McClawsky', current.beat === 'SHOOT_MCCLAWSKY', current.beat);

  await page.evaluate(() => {
    window.squatchfather.pressFire();
    window.squatchfather.tick(0.2);
  });
  current = await state();
  check('shooting McClawsky requires the weapon drop', current.beat === 'DROP_WEAPON', current.beat);

  await page.evaluate(() => {
    window.squatchfather.dropInteraction.drop();
    window.squatchfather.tick(0.2);
  });
  current = await state();
  check('dropping the weapon opens the exit', current.beat === 'WALK_TO_EXIT', current.beat);

  await go('SCENE_COMPLETE', 2.1);
  current = await state();
  check('scene completion persists the dropped weapon',
    current.mission.status === 'complete'
      && current.mission.weaponStaged
      && current.mission.weaponDropped,
    JSON.stringify(current.mission));
  check('the chapter card appears after the car exit', current.endVisible);

  await page.click('#againBtn');
  await page.waitForURL(`http://localhost:${PORT}/index.html`, { timeout: 45000 });
  await page.waitForFunction(() => window.__squatch?.campaign, null, { timeout: 60000 });
  const home = await page.evaluate(() => {
    const game = window.__squatch;
    const mission = game.campaign.state.missions.squatchfather;
    return {
      scene: game.campaign.state.scene,
      mission,
      hasPackage: game.campaign.hasItem('parcel'),
      player: {
        mode: game.player.mode,
        x: Number(game.player.position.x.toFixed(2)),
        z: Number(game.player.position.z.toFixed(2)),
      },
    };
  });
  check('Squatchfather returns to the apartment’s front door',
    home.scene.id === 'apartment'
      && home.scene.spawn === 'front_door'
      && home.player.mode === 'walk'
      && home.player.x === 2.55
      && home.player.z === 3.72,
    JSON.stringify(home));
  check('the package does not return after the weapon was dropped',
    !home.hasPackage && home.mission.status === 'complete',
    JSON.stringify(home.mission));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Squatchfather checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Squatchfather checks passed.`);
