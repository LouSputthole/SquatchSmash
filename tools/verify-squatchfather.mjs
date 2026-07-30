#!/usr/bin/env node
/**
 * Verify the package-gated apartment -> Squatchfather -> apartment round trip
 * in a real browser, including the restaurant's critical state-machine beats.
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

  await target.keyboard.down('KeyW');
  await target.waitForTimeout(550);
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
  await page.waitForURL(`http://localhost:${PORT}/squatchfather.html`, { timeout: 10000 });
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
  await page.waitForURL(`http://localhost:${PORT}/index.html`, { timeout: 10000 });
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
