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
  page.setDefaultTimeout(180000);
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
  await page.waitForFunction(() => window.COUNTRYSIDE_CABIN.cabin.state.cigsLeft === 16);
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
        runtime.cabin.interactionTargets.woodpile?.userData?.interact?.onUse?.();
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
  ));
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
    await page.evaluate(() => window.COUNTRYSIDE_CABIN.teleport('overlook'));
    await page.waitForTimeout(220);
    await capture(page, 'cabin-overlook-daylight');
  }
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
