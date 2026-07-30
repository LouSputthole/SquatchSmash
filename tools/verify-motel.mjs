#!/usr/bin/env node
/**
 * Verify the campaign-owned Motel runtime, its retry behavior, and its return
 * to the apartment in a real browser.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5204;
const SCREENSHOT_DIR = process.env.MOTEL_SCREENSHOT_DIR
  ? path.resolve(process.env.MOTEL_SCREENSHOT_DIR)
  : null;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Motel.');
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
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });

const problems = [];
function trackRuntimeErrors(target) {
  target.on('pageerror', (error) => problems.push(error.message));
  target.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });
}
trackRuntimeErrors(page);

async function capture(target, name) {
  if (!SCREENSHOT_DIR) return;
  await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  await target.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
  });
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

await page.addInitScript(() => {
  if (localStorage.getItem('squatchlife.campaign')) return;
  localStorage.setItem('squatchlife.campaign', JSON.stringify({
    version: 1,
    revision: 20,
    scene: { id: 'jerky_motel', spawn: 'passenger_seat' },
    story: {
      chapter: 'day_two',
      day: 2,
      timeMinutes: 21 * 60,
      meetingKnown: true,
      meetingLearnedFrom: 'lou',
    },
    activities: {
      eaten: true,
      showered: true,
      pooped: true,
      changedClothes: true,
      emailChecked: false,
    },
    inventory: { carried: [], concealed: [] },
    missions: {
      bada_bing_one: { status: 'complete', packageReceived: true, ending: 'front' },
      squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
      airstrip_smuggling: { status: 'complete', checkpoint: 'landed_home' },
      bada_bing_two: { status: 'complete', assignment: 'reserve_pickup' },
      jerky_motel: {
        status: 'available',
        ending: null,
        cargoRecovered: false,
        packagesIntact: 0,
        freshness: 0,
        policeHeat: 0,
      },
    },
    events: {
      lou_first_call: { status: 'answered' },
      booski_day_two_call: { status: 'answered' },
      lou_second_call: { status: 'answered' },
    },
  }));
});

async function motelState() {
  return page.evaluate(() => {
    const motel = window.MOTEL;
    return {
      phase: motel.phase,
      ending: motel.ending,
      mission: motel.campaignState.missions.jerky_motel,
      playerKind: motel.player?.constructor?.name,
      actorCount: motel.actors.length,
      interactableCount: motel.interactables.length,
    };
  });
}

async function firstPersonState(target) {
  return target.evaluate(() => {
    const motel = window.MOTEL;
    const manny = motel.actors.find((actor) => actor.identity === 'manny');
    return {
      phase: motel.phase,
      mode: motel.cameraMode,
      playerVisible: motel.player.group.visible,
      cameraDistance: Math.hypot(
        motel.camera.position.x - motel.pos.x,
        motel.camera.position.z - motel.pos.z,
      ),
      playerBlocked: motel.isBlocked(
        motel.pos.x,
        motel.pos.z,
        motel.pos.y,
        motel.playerRadius,
      ),
      manny: manny ? {
        identity: manny.identity,
        role: manny.role,
        faction: manny.faction,
        species: manny.rig.species,
        hostile: manny.hostile,
        state: manny.state,
      } : null,
    };
  });
}

async function geometryState(target) {
  return target.evaluate(() => {
    const { level, refs, scene } = window.MOTEL;
    const pool = level.rects.POOL;
    const stairs = level.rects.STAIRS_E;
    const overlaps = (a, b) =>
      a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
    const inside = (rect, x, z) =>
      x > rect.x0 && x < rect.x1 && z > rect.z0 && z < rect.z1;

    const vehicles = refs.vehicleFootprints.map((entry) => ({
      id: entry.id,
      x0: entry.collider.x0,
      x1: entry.collider.x1,
      z0: entry.collider.z0,
      z1: entry.collider.z1,
    }));
    const vehiclePairs = [];
    for (let i = 0; i < vehicles.length; i++) {
      for (let j = i + 1; j < vehicles.length; j++) {
        if (overlaps(vehicles[i], vehicles[j])) {
          vehiclePairs.push(`${vehicles[i].id}/${vehicles[j].id}`);
        }
      }
    }

    const stripeXs = [];
    scene.traverse((object) => {
      if (object.userData?.layoutRole === 'parking-stripe') {
        stripeXs.push(object.position.x);
      }
    });

    const poolFurniture = refs.poolFurniture.map((entry) => ({
      id: entry.id,
      deck: entry.deck,
      insidePool: inside(pool, entry.x, entry.z),
    }));

    const stepTops = refs.poolSteps.map((step, index) => {
      const height = step.geometry.parameters.height;
      const top = step.position.y + height / 2;
      const floor = level.floorAt(
        step.position.x,
        step.position.z,
        pool.y + index * 0.75,
      );
      return {
        index,
        top: Number(top.toFixed(3)),
        floor: Number(floor.toFixed(3)),
      };
    });

    const poolExitX = (level.rects.POOL_STEPS.x0 + level.rects.POOL_STEPS.x1) / 2;
    const poolExitBlocked = level.colliders.some((collider) =>
      collider.enabled
      && collider.tag === 'poolwall'
      && poolExitX > collider.x0
      && poolExitX < collider.x1
      && pool.z1 + 0.3 > collider.z0
      && pool.z1 + 0.3 < collider.z1);

    const furnitureTags = new Set(['bed', 'table', 'tv', 'counter', 'tub']);
    const furniture = level.colliders.filter((collider) => furnitureTags.has(collider.tag));
    const furnitureOverlaps = [];
    for (let i = 0; i < furniture.length; i++) {
      for (let j = i + 1; j < furniture.length; j++) {
        if (overlaps(furniture[i], furniture[j])) {
          furnitureOverlaps.push(`${furniture[i].tag}/${furniture[j].tag}`);
        }
      }
    }

    return {
      stairsOverlapPool: overlaps(stairs, pool),
      vehiclesOverPool: vehicles.filter((vehicle) => overlaps(vehicle, pool)).map((v) => v.id),
      vehiclePairs,
      stripeXs,
      stripesOverPool: stripeXs.filter((x) => x > pool.x0 && x < pool.x1),
      poolFurniture,
      stepTops,
      poolExitBlocked,
      furnitureOverlaps,
    };
  });
}

async function moveForward(target, duration = 550) {
  const before = await target.evaluate(() => ({
    x: window.MOTEL.pos.x,
    z: window.MOTEL.pos.z,
    facing: window.MOTEL.facing,
  }));
  await target.keyboard.down('KeyW');
  await target.waitForTimeout(duration);
  await target.keyboard.up('KeyW');
  await target.waitForTimeout(80);
  const after = await target.evaluate(() => ({
    x: window.MOTEL.pos.x,
    z: window.MOTEL.pos.z,
    blocked: window.MOTEL.isBlocked(
      window.MOTEL.pos.x,
      window.MOTEL.pos.z,
      window.MOTEL.pos.y,
      window.MOTEL.playerRadius,
    ),
  }));
  const dx = after.x - before.x;
  const dz = after.z - before.z;
  return {
    distance: Math.hypot(dx, dz),
    forwardProgress: dx * before.facing.x + dz * before.facing.z,
    blocked: after.blocked,
    before: { x: before.x, z: before.z },
    after: { x: after.x, z: after.z },
  };
}

try {
  const previewPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  trackRuntimeErrors(previewPage);
  await previewPage.goto(
    `http://localhost:${PORT}/motel.html?preview=1`,
    { waitUntil: 'load' },
  );
  await previewPage.waitForFunction(() => window.MOTEL?.story, null, { timeout: 60000 });
  check('the direct Motel preview exposes a playable start',
    await previewPage.locator('#startBtn').isVisible()
      && await previewPage.locator('#squatch-preview-notice').isVisible());

  await previewPage.click('#startBtn');
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'car');
  // SwiftShader can need several frames to compile the first motel materials.
  // Capture after that warm-up, but before the opening dialogue wheel appears.
  await previewPage.waitForTimeout(800);
  let previewState = await firstPersonState(previewPage);
  check('the passenger-seat opening uses first-person presentation',
    previewState.mode === 'first_person'
      && !previewState.playerVisible
      && previewState.cameraDistance < 0.08,
    JSON.stringify(previewState));
  check('Manny is a distinct adult human ally',
    previewState.manny?.identity === 'manny'
      && previewState.manny.role === 'ally'
      && previewState.manny.faction === 'friendly'
      && previewState.manny.species === 'human'
      && !previewState.manny.hostile,
    JSON.stringify(previewState.manny));
  const passengerSightline = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    motel.scene.updateMatrixWorld(true);
    const direction = new motel.three.Vector3();
    motel.camera.getWorldDirection(direction);
    const ray = new motel.three.Raycaster(motel.camera.position, direction, 0, 80);
    return ray.intersectObjects(motel.scene.children, true).slice(0, 6).map((hit) => {
      const world = new motel.three.Vector3();
      hit.object.getWorldPosition(world);
      return {
        distance: Number(hit.distance.toFixed(3)),
        geometry: hit.object.geometry?.type || null,
        color: hit.object.material?.color?.getHexString?.() || null,
        world: world.toArray().map((value) => Number(value.toFixed(3))),
      };
    });
  });
  check('the passenger-seat sightline is clear of opaque car panels',
    passengerSightline.length > 0 && passengerSightline[0].distance > 2,
    JSON.stringify(passengerSightline));
  const clerkSpawn = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const clerk = motel.actors.find((actor) => actor.identity === 'clerk');
    return {
      x: clerk.position.x,
      z: clerk.position.z,
      blocked: motel.isBlocked(clerk.position.x, clerk.position.z, 0, motel.playerRadius),
    };
  });
  check('the motel clerk starts clear behind the office counter',
    !clerkSpawn.blocked,
    JSON.stringify(clerkSpawn));
  await capture(previewPage, 'after-car-first-person');

  await previewPage.evaluate(() => {
    window.MOTEL.pick('calm');
    window.MOTEL.forceInteract('exitCar');
  });
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'lot');

  const friendlyGuardBefore = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const manny = motel.actors.find((actor) => actor.identity === 'manny');
    manny.group.position.set(motel.pos.x + 0.35, 0, motel.pos.z + 0.35);
    manny.hostile = true;
    manny.state = 'chase';
    manny.attackCd = 0;
    return { hp: motel.S.hp };
  });
  await previewPage.waitForTimeout(280);
  await previewPage.evaluate(() => {
    const manny = window.MOTEL.actors.find((actor) => actor.identity === 'manny');
    manny.hostile = true;
    manny.state = 'grab';
    manny.attackCd = 0;
  });
  await previewPage.waitForTimeout(280);
  const friendlyGuardAfter = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const manny = motel.actors.find((actor) => actor.identity === 'manny');
    const result = {
      hp: motel.S.hp,
      hostile: manny.hostile,
      state: manny.state,
      faction: manny.faction,
    };
    manny.group.position.set(-10.6, 0, 16.4);
    manny.anchor = { x: -10.6, z: 16.4 };
    manny.state = 'idle';
    return result;
  });
  check('friendly faction blocks chase, grab, and damage-to-Tony regressions',
    friendlyGuardAfter.hp === friendlyGuardBefore.hp
      && friendlyGuardAfter.faction === 'friendly'
      && !friendlyGuardAfter.hostile
      && friendlyGuardAfter.state === 'idle',
    JSON.stringify({ before: friendlyGuardBefore, after: friendlyGuardAfter }));

  previewState = await firstPersonState(previewPage);
  check('Tony exits into a collision-clear first-person lot',
    previewState.mode === 'first_person'
      && !previewState.playerVisible
      && previewState.cameraDistance < 0.08
      && !previewState.playerBlocked,
    JSON.stringify(previewState));
  const motion = await moveForward(previewPage);
  check('real WASD input moves Tony forward without a collider trap',
    motion.distance > 0.4 && motion.forwardProgress > 0.35 && !motion.blocked,
    JSON.stringify(motion));
  await capture(previewPage, 'after-lot-first-person');

  const geometry = await geometryState(previewPage);
  check('the motel stairs and every vehicle are clear of the pool',
    !geometry.stairsOverlapPool
      && geometry.vehiclesOverPool.length === 0
      && geometry.vehiclePairs.length === 0,
    JSON.stringify(geometry));
  check('parking paint and pool furniture stay in their authored zones',
    geometry.stripesOverPool.length === 0
      && geometry.poolFurniture.filter((item) => item.deck).every((item) => !item.insidePool)
      && geometry.poolFurniture.filter((item) => !item.deck).every((item) => item.insidePool),
    JSON.stringify({
      stripeXs: geometry.stripeXs,
      poolFurniture: geometry.poolFurniture,
    }));
  check('the pool steps match collision floors and leave a real exit',
    !geometry.poolExitBlocked
      && geometry.stepTops.length === 4
      && geometry.stepTops.every((step) => step.top === step.floor),
    JSON.stringify({
      stepTops: geometry.stepTops,
      poolExitBlocked: geometry.poolExitBlocked,
    }));
  check('major Room 12 furniture footprints do not overlap',
    geometry.furnitureOverlaps.length === 0,
    JSON.stringify(geometry.furnitureOverlaps));

  await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const manny = motel.actors.find((actor) => actor.identity === 'manny');
    motel.teleport(0, 18);
    manny.group.position.set(0, 0, 13.5);
    motel.face(manny.position.x, manny.position.z);
  });
  await previewPage.waitForTimeout(180);
  await capture(previewPage, 'after-manny-human');

  await previewPage.evaluate(() => {
    window.MOTEL.teleport(10.5, 14);
    window.MOTEL.face(22, 13);
  });
  await previewPage.waitForTimeout(180);
  await capture(previewPage, 'after-pool-layout');

  await previewPage.evaluate(() => window.MOTEL.forceInteract('knock'));
  await previewPage.waitForTimeout(1300);
  await previewPage.evaluate(() => {
    window.MOTEL.S.doorOpened = true;
    window.MOTEL.forceInteract('enterRoom');
  });
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'room');
  await previewPage.waitForTimeout(180);
  await capture(previewPage, 'after-room-first-person');

  const roomSpawns = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const names = ['Rico', 'Chino', 'Bathroom Seller'];
    const actors = motel.actors.filter((actor) => names.includes(actor.name));
    const points = [
      {
        name: 'Tony',
        x: motel.pos.x,
        z: motel.pos.z,
        radius: motel.playerRadius,
        blocked: motel.isBlocked(
          motel.pos.x,
          motel.pos.z,
          0,
          motel.playerRadius,
        ),
      },
      ...actors.map((actor) => ({
        name: actor.name,
        x: actor.position.x,
        z: actor.position.z,
        radius: actor.rig.radius,
        blocked: motel.isBlocked(
          actor.position.x,
          actor.position.z,
          actor.position.y,
          actor.rig.radius,
        ),
      })),
    ];
    let minClearance = Infinity;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const distance = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
        minClearance = Math.min(
          minClearance,
          distance - points[i].radius - points[j].radius,
        );
      }
    }
    return {
      points,
      minClearance: Number(minClearance.toFixed(3)),
      cameraDistance: Math.hypot(
        motel.camera.position.x - motel.pos.x,
        motel.camera.position.z - motel.pos.z,
      ),
      playerVisible: motel.player.group.visible,
    };
  });
  check('Room 12 starts every participant clear of props and one another',
    roomSpawns.points.every((point) => !point.blocked)
      && roomSpawns.minClearance > 0.2,
    JSON.stringify(roomSpawns));
  check('Room 12 remains first-person instead of wedging Tony behind furniture',
    roomSpawns.cameraDistance < 0.08 && !roomSpawns.playerVisible,
    JSON.stringify(roomSpawns));

  await previewPage.evaluate(() => {
    window.MOTEL.forceInteract('windowSignal');
    const manny = window.MOTEL.actors.find((actor) => actor.identity === 'manny');
    manny.group.position.set(-1, 0, 1.5);
  });
  await previewPage.waitForTimeout(280);
  const signalState = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const manny = motel.actors.find((actor) => actor.identity === 'manny');
    return {
      signalled: motel.S.mannySignalled,
      faction: manny.faction,
      hostile: manny.hostile,
      state: manny.state,
      hp: motel.S.hp,
    };
  });
  check('Manny reaches the signal waypoint without turning on Tony',
    signalState.signalled
      && signalState.faction === 'friendly'
      && !signalState.hostile
      && signalState.state === 'idle',
    JSON.stringify(signalState));

  const mattressState = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    motel.betray();
    motel.forceInteract('mattress');
    const mattress = motel.refs.beds[0].mattress;
    const world = new motel.three.Vector3();
    mattress.getWorldPosition(world);
    const rico = motel.actors.find((actor) => actor.name === 'Rico');
    rico.group.position.set(motel.pos.x + 0.6, 0, motel.pos.z + 0.6);
    rico.hostile = true;
    rico.state = 'chase';
    rico.attackCd = 0;
    motel.S.hp = 1;
    return {
      local: mattress.position.toArray(),
      world: world.toArray(),
    };
  });
  check('the overturned mattress stays inside Room 12 at its intended world position',
    Math.hypot(
      mattressState.world[0] + 1.9,
      mattressState.world[1] - 1.1,
      mattressState.world[2] + 12.6,
    ) < 0.02,
    JSON.stringify(mattressState));

  await previewPage.waitForFunction(() => window.MOTEL.S.captured, null, { timeout: 5000 });
  const capturedStart = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    return {
      x: motel.pos.x,
      z: motel.pos.z,
      blocked: motel.isBlocked(motel.pos.x, motel.pos.z, 0, motel.playerRadius),
    };
  });
  await previewPage.evaluate(() => {
    for (let i = 0; i < 12; i++) window.MOTEL.use();
  });
  await previewPage.waitForFunction(
    () => window.MOTEL.phase === 'recover' || window.MOTEL.phase === 'escape',
    null,
    { timeout: 3000 },
  );
  const captureRecovery = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    return {
      phase: motel.phase,
      x: motel.pos.x,
      z: motel.pos.z,
      blocked: motel.isBlocked(motel.pos.x, motel.pos.z, 0, motel.playerRadius),
    };
  });
  check('capture recovery returns control on clear bathroom tile',
    !captureRecovery.blocked
      && Math.hypot(captureRecovery.x - 2, captureRecovery.z + 10) < 0.05,
    JSON.stringify({ capturedStart, captureRecovery }));
  await capture(previewPage, 'after-capture-recovery');

  const allyCombatBefore = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const manny = motel.actors.find((actor) => actor.identity === 'manny');
    const rico = motel.actors.find((actor) => actor.name === 'Rico');
    for (const actor of motel.actors) {
      if (actor === manny || actor === rico) continue;
      actor.hostile = false;
      actor.state = 'idle';
    }
    motel.S.mannyInside = true;
    manny.group.position.set(rico.position.x - 1, 0, rico.position.z);
    manny.state = 'follow';
    manny.attackCd = 0;
    rico.hostile = true;
    rico.state = 'idle';
    return { playerHp: motel.S.hp, ricoHp: rico.hp };
  });
  await previewPage.waitForTimeout(1150);
  const allyCombatAfter = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const manny = motel.actors.find((actor) => actor.identity === 'manny');
    const rico = motel.actors.find((actor) => actor.name === 'Rico');
    return {
      playerHp: motel.S.hp,
      ricoHp: rico.hp,
      mannyHostile: manny.hostile,
      mannyState: manny.state,
    };
  });
  check('Manny can still defend Tony against a true hostile',
    allyCombatAfter.playerHp === allyCombatBefore.playerHp
      && allyCombatAfter.ricoHp < allyCombatBefore.ricoHp
      && !allyCombatAfter.mannyHostile
      && allyCombatAfter.mannyState === 'follow',
    JSON.stringify({ before: allyCombatBefore, after: allyCombatAfter }));
  await previewPage.close();

  await page.goto(`http://localhost:${PORT}/motel.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: 60000 });

  let current = await motelState();
  check('the campaign opens the Motel at its passenger-seat entry',
    current.phase === 'menu' && current.mission.status === 'available',
    JSON.stringify(current));
  check('Tony Squatchtana is represented as a human in the Motel',
    current.playerKind === 'Person',
    JSON.stringify(current));
  check('the original interactive Motel environment is intact',
    current.interactableCount >= 50, `${current.interactableCount} interactables`);

  await page.click('#startBtn');
  await page.waitForFunction(() => window.MOTEL.phase === 'car');
  current = await motelState();
  check('starting the deal persists an in-progress mission',
    current.mission.status === 'in_progress' && current.actorCount >= 4,
    JSON.stringify(current));

  await page.evaluate(() => window.MOTEL.finish('walked'));
  current = await motelState();
  check('walking away does not silently complete the Motel',
    current.phase === 'end'
      && current.ending === 'walked'
      && current.mission.status === 'in_progress',
    JSON.stringify(current));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: 60000 });
  await page.click('#startBtn');
  await page.waitForFunction(() => window.MOTEL.phase === 'car');
  current = await motelState();
  check('an interrupted deal resumes from durable campaign state',
    current.mission.status === 'in_progress', JSON.stringify(current.mission));

  await page.evaluate(() => {
    const motel = window.MOTEL;
    motel.S.carryingJerky = true;
    motel.S.packagesIntact = 6;
    motel.S.policeHeat = 22;
    motel.freshness.value = 79;
    motel.finish('home');
  });
  current = await motelState();
  check('the successful getaway records the real mission outcome',
    current.phase === 'end'
      && current.ending === 'home'
      && current.mission.status === 'complete'
      && current.mission.cargoRecovered
      && current.mission.packagesIntact === 6
      && current.mission.freshness === 79
      && current.mission.policeHeat === 22,
    JSON.stringify(current.mission));

  await page.click('#continueBtn');
  await page.waitForURL(`http://localhost:${PORT}/index.html`, { timeout: 10000 });
  await page.waitForFunction(() => window.__squatch?.campaign, null, { timeout: 60000 });
  const home = await page.evaluate(() => ({
    scene: window.__squatch.campaign.state.scene,
    mission: window.__squatch.campaign.state.missions.jerky_motel,
  }));
  check('the Motel returns to the apartment front door',
    home.scene.id === 'apartment'
      && home.scene.spawn === 'front_door'
      && home.mission.status === 'complete',
    JSON.stringify(home));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Motel checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Motel checks passed.`);
