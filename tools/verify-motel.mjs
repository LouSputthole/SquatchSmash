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
  '.css': 'text/css; charset=utf-8',
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
const notFound = [];
function trackRuntimeErrors(target) {
  target.on('pageerror', (error) => problems.push(error.message));
  target.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });
  target.on('response', (response) => {
    if (response.status() === 404) notFound.push(response.url());
  });
}

/**
 * THE MOTEL IS RASTERISED IN SOFTWARE, and every implicit budget in this file
 * was Playwright's thirty seconds, which is a number about networks.
 *
 * Nothing here waits on a network -- the whole scene is served off localhost.
 * What these calls wait on is the page's MAIN THREAD, which is busy drawing a
 * motel forecourt: `previewPage.click('#startBtn')` timed out on 2026-08-20
 * with the log reading "element is visible, enabled and stable ... done
 * scrolling", i.e. the button was found, was clickable, and the click itself
 * could not be dispatched inside thirty seconds. `goto(..., 'load')` has the
 * same shape, because the level is built during module evaluation and `load`
 * does not fire until it exists.
 *
 * The file's own explicit budgets were the same number in smaller clothes:
 * five, twelve, twenty, thirty, forty-five, sixty seconds, all of them sized
 * on a machine that renders this motel faster than this one does. They are
 * all quantities of GAME time -- a line finishing, a wheel closing, a man
 * walking sixty centimetres, the pull-in reaching eighteen per cent -- and
 * game time advances on the runtime's clamped frame delta
 * (`Math.min(clock.getDelta(), 0.05)` in src/motel/main.js), so each of them
 * costs a fixed number of FRAMES and takes whatever wall time those frames
 * take. Measured 2026-08-20 at 1280x720 on a contended four-core box: the
 * 4.4 s pull-in took 256 s, and its mid-drive sample window -- budgeted at
 * 45 s -- did not open until about 46 s. Every one of them now reads
 * SCENE_WAIT_MS.
 *
 * NONE of these waits is an assertion. Each is followed by a `check()` that
 * samples the state and does the asserting, and the conditions themselves are
 * untouched -- the mid-drive sample still has to land strictly between 18%
 * and 82% of the drive, whenever it lands. This is a budget for SLOWNESS, not
 * a licence for a hang: a state the scene never reaches still fails the run,
 * three minutes later instead of forty-five seconds later.
 */
const SCENE_WAIT_MS = 180000;
function budgetForSoftwareRasteriser(target) {
  target.setDefaultTimeout(SCENE_WAIT_MS);
  target.setDefaultNavigationTimeout(SCENE_WAIT_MS);
}

trackRuntimeErrors(page);
budgetForSoftwareRasteriser(page);

async function capture(target, name) {
  if (!SCREENSHOT_DIR) return;
  await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  await target.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
  });
}

async function aimPublicInteract(target, id) {
  const aimed = await target.evaluate((targetId) => {
    const motel = window.MOTEL;
    const interact = motel.interactableList.find((entry) => entry.id === targetId);
    const point = interact?.follow?.() ?? interact;
    if (!interact || !point) return null;
    motel.face(point.x, point.z, point.y);
    return { id: targetId, point: [point.x, point.y, point.z] };
  }, id);
  if (!aimed) return { intended: id, active: null, point: null, prompt: '' };
  await target.waitForTimeout(180);
  return target.evaluate(({ targetId, point }) => ({
    intended: targetId,
    active: window.MOTEL.activeInteract(),
    point,
    prompt: document.getElementById('prompt')?.textContent ?? '',
  }), { targetId: id, point: aimed.point });
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
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
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
      snow: snow ? {
        identity: snow.identity,
        role: snow.role,
        faction: snow.faction,
        species: snow.rig.species,
        hostile: snow.hostile,
        state: snow.state,
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

/**
 * Hold W until he has actually covered some ground.
 *
 * This used to hold the key for a fixed 550ms, which measures the renderer as
 * much as the movement code: the motel draws at a couple of frames a second
 * under swiftshader, so half a second of real time is one simulated step and
 * a real walk read as 0.24m. Holding until he has moved, with a ceiling, tests
 * the same thing — genuine key events driving genuine movement — without
 * asking a software rasteriser to keep up with a stopwatch.
 */
/**
 * Answer the dialogue wheel the way a player has to.
 *
 * `MOTEL.pick` refuses while the character is still asking — the four answers
 * are not on screen yet. This used to be invisible: `pick` returned nothing,
 * the harness moved on believing it had answered, `dialogue` stayed set, and
 * the knock's gate (which also read `!dialogue`) quietly stopped working, so
 * Rico was never sent for and this verifier waited out a three-minute ceiling
 * for a man nobody had knocked for. Both halves are fixed; this waits for the
 * real gate and asserts the answer was taken.
 */
async function answerWheel(target, style, { timeout = SCENE_WAIT_MS } = {}) {
  await target.waitForFunction(() => window.MOTEL.dialogue?.ready === true, null, { timeout, polling: 80 });
  const taken = await target.evaluate((pick) => window.MOTEL.pick(pick), style);
  if (!taken) throw new Error(`the wheel refused the "${style}" answer`);
  await target.waitForFunction(() => window.MOTEL.dialogue === null, null, { timeout: SCENE_WAIT_MS });
  return taken;
}

/** Wait until nobody in room twelve is mid-sentence. */
async function waitQuiet(target, { timeout = SCENE_WAIT_MS } = {}) {
  await target.waitForFunction(() => !window.MOTEL.voice.busy(), null, { timeout, polling: 80 })
    .catch(() => { /* reported by whatever assertion comes next */ });
}

/**
 * WAIT OUT THE PULL-IN, BOUNDED BY PROGRESS RATHER THAN BY THE CLOCK.
 *
 * This was a flat wall-clock budget, and no number was ever going to be the
 * right one. `updateArrival` advances on the runtime's clamped frame delta
 * (`Math.min(clock.getDelta(), 0.05)` in src/motel/main.js), so the 4.4 s
 * pull-in costs EIGHTY-EIGHT rendered frames whatever those frames cost:
 * about 40 s on a quiet box, 256 s measured on 2026-08-20 at 1280x720 with
 * the machine contended, and over 300 s an hour later with more browsers on
 * it. Every budget picked from one of those runs is wrong for the next one,
 * and the run dies on a drive that was finishing perfectly well.
 *
 * The thing worth failing on is a drive that has STOPPED, and that is a
 * question about `arrival.progress`, not about seconds. So this watches the
 * pull-in advance and only gives up when it has not moved for a full minute
 * -- which on a scene that needs eighty-eight frames means the frames
 * themselves have stopped arriving, i.e. a real hang rather than a slow box.
 * A drive that crawls still passes; a drive that dies still fails, and says
 * where it died.
 */
const ARRIVAL_STALL_MS = 60000;
async function waitForArrivalHandoff(target) {
  let furthest = -1;
  let movedAt = Date.now();
  for (;;) {
    const state = await target.evaluate(() => ({
      phase: window.MOTEL.phase,
      progress: window.MOTEL.arrival.progress,
    }));
    if (state.phase === 'car') return state;
    if (state.progress > furthest) {
      furthest = state.progress;
      movedAt = Date.now();
    } else if (Date.now() - movedAt > ARRIVAL_STALL_MS) {
      throw new Error(
        `the arrival pull-in stalled at progress ${furthest.toFixed(3)} in phase ${state.phase}`,
      );
    }
    await target.waitForTimeout(1000);
  }
}

async function moveForward(target, { want = 0.6, timeout = SCENE_WAIT_MS } = {}) {
  const before = await target.evaluate(() => ({
    x: window.MOTEL.pos.x,
    z: window.MOTEL.pos.z,
    facing: window.MOTEL.facing,
  }));
  await target.keyboard.down('KeyW');
  await target.waitForFunction(
    ([start, distance]) => {
      const { pos } = window.MOTEL;
      return Math.hypot(pos.x - start.x, pos.z - start.z) >= distance;
    },
    [{ x: before.x, z: before.z }, want],
    { timeout, polling: 60 },
  ).catch(() => { /* let the assertion below report what actually happened */ });
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
  budgetForSoftwareRasteriser(previewPage);
  await previewPage.goto(
    `http://localhost:${PORT}/motel.html?preview=1`,
    { waitUntil: 'load' },
  );
  await previewPage.waitForFunction(() => window.MOTEL?.story, null, { timeout: SCENE_WAIT_MS });
  const campaignSeed = await previewPage.evaluate(
    () => localStorage.getItem('squatchlife.campaign'),
  );
  check('the direct Motel preview exposes a playable start',
    await previewPage.locator('#startBtn').isVisible()
      && await previewPage.locator('#squatch-preview-notice').isVisible());
  const packagePrimer = await previewPage.locator('#dealPrimer').innerText();
  check('the opening primer distinguishes your money from their meat',
    /YOUR PACKAGE[\s\S]*\$40,000/i.test(packagePrimer)
      && /THEIR SAMPLE[\s\S]*One Reserve strip/i.test(packagePrimer)
      && /THEIR PACKAGES[\s\S]*Eight sealed packages/i.test(packagePrimer),
    JSON.stringify(packagePrimer));

  await previewPage.click('#startBtn');
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'arrival');
  /* The arrival drive is real-time on this page's own clock: a software
   * rasteriser takes ~8 s of wall time just to reach 0.18. The budget only
   * bounds a hang — the upper edge of the window still proves the sample
   * was taken mid-drive. */
  await previewPage.waitForFunction(
    () => window.MOTEL.arrival.progress > 0.18 && window.MOTEL.arrival.progress < 0.82,
    null,
    { timeout: SCENE_WAIT_MS, polling: 60 },
  );
  const arrivalComposition = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
    const driver = new motel.three.Vector3(...motel.arrival.driver);
    const passenger = new motel.three.Vector3(...motel.arrival.passenger);
    motel.scene.updateMatrixWorld(true);
    motel.camera.updateMatrixWorld(true);
    const projectVisible = (object) => {
      const point = new motel.three.Vector3();
      object.getWorldPosition(point);
      point.project(motel.camera);
      return Math.abs(point.x) < 0.96
        && Math.abs(point.y) < 0.96
        && point.z > -1 && point.z < 1;
    };
    const face = snow.group.getObjectByName('actor.face.snow');
    const torso = snow.group.getObjectByName('actor.anatomy.torso');
    const shoulders = snow.group.getObjectByName('actor.garment.shoulders');
    const projectedPixels = (object) => {
      const bounds = new motel.three.Box3().setFromObject(object);
      const corners = [];
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            corners.push(new motel.three.Vector3(x, y, z).project(motel.camera));
          }
        }
      }
      const xs = corners.map((point) => point.x);
      const ys = corners.map((point) => point.y);
      const left = (Math.min(...xs) + 1) * innerWidth / 2;
      const right = (Math.max(...xs) + 1) * innerWidth / 2;
      const top = (1 - Math.max(...ys)) * innerHeight / 2;
      const bottom = (1 - Math.min(...ys)) * innerHeight / 2;
      return {
        left: Number(left.toFixed(1)),
        right: Number(right.toFixed(1)),
        top: Number(top.toFixed(1)),
        bottom: Number(bottom.toFixed(1)),
        centerX: Number(((left + right) / 2).toFixed(1)),
        width: Number((right - left).toFixed(1)),
        height: Number((bottom - top).toFixed(1)),
      };
    };
    const faceWorld = new motel.three.Vector3();
    face.getWorldPosition(faceWorld);
    const toFace = faceWorld.clone().sub(motel.camera.position);
    const faceRay = new motel.three.Raycaster(
      motel.camera.position,
      toFace.clone().normalize(),
      0.02,
      toFace.length() + 0.1,
    );
    const firstOpaque = faceRay.intersectObjects(motel.scene.children, true).find((hit) => {
      const materials = [].concat(hit.object.material || []);
      return materials.some((material) => !material.transparent || material.opacity >= 0.8);
    });
    const faceNormal = new motel.three.Vector3(0, 0, 1)
      .applyQuaternion(face.getWorldQuaternion(new motel.three.Quaternion()));
    const faceToCamera = motel.camera.position.clone().sub(faceWorld).normalize();
    const driverSeat = motel.refs.manCar.group.getObjectByName('cockpit.seat.driver');
    const passengerSeat = motel.refs.manCar.group.getObjectByName('cockpit.seat.passenger');
    const wheel = motel.refs.manCar.group.getObjectByName('cockpit.steering-wheel');
    const dashboard = motel.refs.manCar.group.getObjectByName('cockpit.dashboard');
    const snowHands = [
      snow.group.getObjectByName('actor.anatomy.hand.left'),
      snow.group.getObjectByName('actor.anatomy.hand.right'),
    ];
    const body = motel.refs.manCar.group.getObjectByName('car.body.front');
    const cabinFill = motel.refs.manCar.group.getObjectByName('vehicle.motel.cabin-fill');
    const yaw = Math.atan2(motel.facing.x, motel.facing.z);
    const forward = motel.refs.manCar.forwardYaw();
    const towardSnow = motel.refs.manCar.passengerFacingDriverYaw();
    const angle = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const viewBlend = Math.abs(angle(yaw, forward) / angle(towardSnow, forward));
    const cameraClips = [];
    for (const root of [motel.refs.manCar.group, snow.group]) {
      root.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.computeBoundingBox();
        const localEye = object.worldToLocal(motel.camera.position.clone());
        if (object.geometry.boundingBox?.containsPoint(localEye)) {
          cameraClips.push(object.name || object.geometry?.type || 'anonymous mesh');
        }
      });
    }
    return {
      phase: motel.phase,
      progress: motel.arrival.progress,
      cameraFov: motel.camera.fov,
      sharedBase: motel.refs.manCar.group.userData.sharedVehicleBase,
      bodyStyle: motel.refs.manCar.group.userData.bodyStyle,
      paint: body.material.color.getHexString(),
      roof: Boolean(motel.refs.manCar.group.getObjectByName('car.roof')),
      seats: ['cockpit.seat.driver', 'cockpit.seat.passenger']
        .every((name) => Boolean(motel.refs.manCar.group.getObjectByName(name))),
      playerAtPassenger: Math.hypot(motel.pos.x - passenger.x, motel.pos.z - passenger.z),
      snowState: snow.state,
      snowAtDriver: snow.group.position.distanceTo(driver),
      snowFaceOnScreen: Boolean(face) && projectVisible(face),
      snowTorsoOnScreen: Boolean(torso) && projectVisible(torso),
      snowFacePixels: projectedPixels(face),
      snowTorsoPixels: projectedPixels(torso),
      snowShouldersPixels: projectedPixels(shoulders),
      snowFaceFirstOpaque: firstOpaque?.object?.name || null,
      snowPhotoFacesTony: Number(faceNormal.dot(faceToCamera).toFixed(3)),
      viewBlendTowardSnow: Number(viewBlend.toFixed(3)),
      wheelOnScreen: projectVisible(wheel),
      dashboardOnScreen: projectVisible(dashboard),
      snowHandsOnScreen: snowHands.every((hand) => hand && projectVisible(hand)),
      cameraClips,
      seatAssignments: {
        driver: { role: driverSeat.userData.seatRole, occupant: driverSeat.userData.occupant },
        passenger: {
          role: passengerSeat.userData.seatRole,
          occupant: passengerSeat.userData.occupant,
        },
      },
      cabinFill: cabinFill
        ? { intensity: cabinFill.intensity, distance: cabinFill.distance }
        : null,
      carToPark: motel.refs.manCar.group.position.distanceTo(motel.refs.manCar.park),
      colliderEnabled: motel.refs.manCar.collider.enabled,
    };
  });
  check('Tony and Snow visibly pull in seated in the shared maroon convertible',
    arrivalComposition.phase === 'arrival'
      && arrivalComposition.progress > 0.18
      && arrivalComposition.cameraFov === 75
      && arrivalComposition.sharedBase === 'bing.makePlayerCar'
      && arrivalComposition.bodyStyle === 'convertible'
      && arrivalComposition.paint === '8b3f5d'
      && !arrivalComposition.roof
      && arrivalComposition.seats
      && arrivalComposition.playerAtPassenger < 0.05
      && arrivalComposition.snowState === 'seated'
      && arrivalComposition.snowAtDriver < 0.05
      && arrivalComposition.snowFaceOnScreen
      && arrivalComposition.snowTorsoOnScreen
      && arrivalComposition.snowFacePixels.width >= 80
      && arrivalComposition.snowFacePixels.height >= 80
      && arrivalComposition.snowTorsoPixels.height >= 120
      && arrivalComposition.snowFacePixels.left >= 0
      && arrivalComposition.snowFacePixels.right <= 1280
      && arrivalComposition.snowFacePixels.top >= 0
      && arrivalComposition.snowFacePixels.bottom <= 720
      && arrivalComposition.snowShouldersPixels.left >= 0
      && arrivalComposition.snowShouldersPixels.right <= 1280
      && arrivalComposition.snowShouldersPixels.top >= 0
      && arrivalComposition.snowShouldersPixels.bottom <= 720
      && (arrivalComposition.snowFacePixels.centerX < 1280 * 0.42
        || arrivalComposition.snowFacePixels.centerX > 1280 * 0.58)
      && arrivalComposition.snowPhotoFacesTony > 0.7
      && arrivalComposition.viewBlendTowardSnow >= 0.25
      && arrivalComposition.viewBlendTowardSnow <= 0.36
      && arrivalComposition.wheelOnScreen
      && arrivalComposition.dashboardOnScreen
      && arrivalComposition.snowHandsOnScreen
      && arrivalComposition.cameraClips.length === 0
      && arrivalComposition.seatAssignments.driver.role === 'driver'
      && arrivalComposition.seatAssignments.driver.occupant === 'snow'
      && arrivalComposition.seatAssignments.passenger.role === 'passenger'
      && arrivalComposition.seatAssignments.passenger.occupant === 'tony'
      && arrivalComposition.cabinFill?.intensity > 0
      && arrivalComposition.cabinFill.distance <= 4
      && arrivalComposition.carToPark > 1
      && !arrivalComposition.colliderEnabled,
    JSON.stringify(arrivalComposition));
  await capture(previewPage, 'arrival-shared-convertible');
  await previewPage.evaluate(() => window.MOTEL.setArrivalCameraMode('exterior'));
  await previewPage.waitForTimeout(160);
  const exteriorOccupants = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
    const driver = new motel.three.Vector3(...motel.arrival.driver);
    const passenger = new motel.three.Vector3(...motel.arrival.passengerActor);
    motel.scene.updateMatrixWorld(true);
    motel.camera.updateMatrixWorld(true);
    const onScreen = (object) => {
      const bounds = new motel.three.Box3().setFromObject(object);
      const center = bounds.getCenter(new motel.three.Vector3()).project(motel.camera);
      return Math.abs(center.x) < 0.92 && Math.abs(center.y) < 0.92
        && center.z > -1 && center.z < 1;
    };
    const driverSeat = motel.refs.manCar.group.getObjectByName('cockpit.seat.driver');
    const passengerSeat = motel.refs.manCar.group.getObjectByName('cockpit.seat.passenger');
    return {
      phase: motel.phase,
      cameraMode: motel.arrival.cameraMode,
      cameraDistance: motel.camera.position.distanceTo(motel.refs.manCar.cabinCenterPosition()),
      snowState: snow.state,
      snowAtDriver: snow.group.position.distanceTo(driver),
      tonyAtPassenger: motel.player.group.position.distanceTo(passenger),
      snowScale: snow.group.scale.x,
      snowBaseScale: snow.baseScale,
      tonyScale: motel.player.group.scale.x,
      playerVisible: motel.player.group.visible,
      snowOnScreen: onScreen(snow.group),
      tonyOnScreen: onScreen(motel.player.group),
      occupants: [driverSeat.userData.occupant, passengerSeat.userData.occupant],
    };
  });
  check('the exterior pull-in proves Snow and Tony physically seated in their assigned seats',
    exteriorOccupants.phase === 'arrival'
      && exteriorOccupants.cameraMode === 'exterior'
      && exteriorOccupants.cameraDistance > 3
      && exteriorOccupants.snowState === 'seated'
      && exteriorOccupants.snowAtDriver < 0.05
      && exteriorOccupants.tonyAtPassenger < 0.05
      && exteriorOccupants.snowScale < exteriorOccupants.snowBaseScale
      && exteriorOccupants.tonyScale < 0.85
      && exteriorOccupants.playerVisible
      && exteriorOccupants.snowOnScreen
      && exteriorOccupants.tonyOnScreen
      && exteriorOccupants.occupants.join(',') === 'snow,tony',
    JSON.stringify(exteriorOccupants));
  await capture(previewPage, 'arrival-exterior-both-occupants');
  await previewPage.evaluate(() => window.MOTEL.setArrivalCameraMode('passenger'));
  await previewPage.waitForTimeout(80);
  const arrivalSurveyBrief = await previewPage.evaluate(() => {
    const element = document.getElementById('surveyBrief');
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      text: element.textContent.trim(),
      opacity: Number(style.opacity),
      visible: style.visibility,
      width: rect.width,
      /* The brief is driven by ONE authored rule, `#hud.visible.control-ready
       * #surveyBrief { animation: surveyBriefIn 10s ... }` in motel.html, so
       * while Tony is still locked into the pull-in there is no animation on
       * the element AT ALL -- not a paused one, not a finished one. Proving
       * that here is what lets the handoff check below say the ten seconds
       * begins at the handoff without having to time-stamp anything. */
      animationName: style.animationName,
      animations: element.getAnimations().length,
    };
  });
  check('the survey message stays hidden until Tony receives playable control',
    arrivalSurveyBrief.text === 'Survey the Motel before going into your meeting or go right into it'
      && arrivalSurveyBrief.opacity === 0
      && arrivalSurveyBrief.visible === 'hidden'
      && arrivalSurveyBrief.width >= 500
      && arrivalSurveyBrief.animationName === 'none'
      && arrivalSurveyBrief.animations === 0,
    JSON.stringify(arrivalSurveyBrief));

  await waitForArrivalHandoff(previewPage);
  /**
   * THE HANDOFF, and why this wait used to be three seconds and is not now.
   *
   * `finishArrival()` sets `phase = 'car'` and adds `control-ready` to the HUD
   * in the same synchronous block, so the state itself lands instantly -- but
   * the thing this used to wait on was the brief's COMPUTED OPACITY passing
   * 0.5, and a CSS animation only advances on a composited frame. On a
   * software rasteriser at 1280x720 the first frames after the handoff are
   * seconds apart, so the animation sat at currentTime 0 (opacity 0) long
   * after the class had landed: measured 2026-08-20, `control-ready` present
   * within one poll, opacity crossing 0.5 at +16.5 s. Three seconds was
   * measuring the frame rate, not the scene, and the run died on a beat that
   * arrives every time.
   *
   * The wait is now generous, and the assertion no longer samples a clock at
   * all -- see below.
   */
  await previewPage.waitForFunction(() => {
    const element = document.getElementById('surveyBrief');
    return document.getElementById('hud')?.classList.contains('control-ready')
      && Number(getComputedStyle(element).opacity) > 0.5;
  }, null, { timeout: SCENE_WAIT_MS, polling: 30 });
  const controlHandoffBrief = await previewPage.evaluate(() => {
    const element = document.getElementById('surveyBrief');
    const style = getComputedStyle(element);
    return {
      phase: window.MOTEL.phase,
      controlReady: document.getElementById('hud').classList.contains('control-ready'),
      opacity: Number(style.opacity),
      visible: style.visibility,
      /* Cascade-derived, not frame-sampled: these read the rule that is
       * attached to the element the instant `control-ready` lands, whether or
       * not a frame has been composited since. */
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationFillMode: style.animationFillMode,
      animations: element.getAnimations().map((animation) => ({
        currentTime: Number(animation.currentTime?.toFixed?.(1) || 0),
        playState: animation.playState,
      })),
    };
  });
  check('the full ten-second survey brief starts at the playable passenger-seat handoff',
    /* The old form of this asserted `currentTime < 2000` on the running
     * animation, meaning "it started just now rather than during the
     * cutscene". That is the right INTENT and the wrong INSTRUMENT: an
     * animation's currentTime advances with composited frames, so on a slow
     * box it can read 0 for seconds and then jump past 2000 in one step, and
     * the assertion fails on a scene that is behaving perfectly.
     *
     * The same intent is proved exactly instead, without a stopwatch: the
     * check above established that NO animation existed on this element
     * before the handoff, and this one establishes that the animation now
     * attached is the authored ten-second brief and is still running. An
     * animation that did not exist a moment ago and has not finished yet has,
     * by construction, its whole ten seconds still ahead of the player --
     * which is what "the full ten-second survey brief" means. `playState ===
     * 'running'` carries the "not finished" half on its own: the rule fills
     * forwards, so a brief that had already burned away would report
     * 'finished' here. */
    controlHandoffBrief.phase === 'car'
      && controlHandoffBrief.controlReady
      && controlHandoffBrief.opacity > 0.5
      && controlHandoffBrief.visible === 'visible'
      && controlHandoffBrief.animationName === 'surveyBriefIn'
      && controlHandoffBrief.animationDuration === '10s'
      && controlHandoffBrief.animationFillMode === 'forwards'
      && controlHandoffBrief.animations.length === 1
      && controlHandoffBrief.animations[0].playState === 'running',
    JSON.stringify(controlHandoffBrief));
  const parkedComposition = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
    const exit = motel.refs.manCar.driverExitPosition();
    return {
      flags: motel.arrival,
      snowState: snow.state,
      snow: snow.group.position.toArray(),
      distanceToDriverExit: snow.group.position.distanceTo(exit),
      floor: motel.level.floorAt(snow.position.x, snow.position.z, 0),
      playerBlocked: motel.isBlocked(motel.pos.x, motel.pos.z, motel.feetY, motel.playerRadius),
    };
  });
  check('Snow gets out onto grounded pavement while Tony remains free in the passenger seat',
    parkedComposition.flags.complete
      && !parkedComposition.flags.snowSeated
      && parkedComposition.flags.snowExitedCar
      && parkedComposition.snowState === 'idle'
      && parkedComposition.distanceToDriverExit < 0.08
      && Math.abs(parkedComposition.snow[1] - parkedComposition.floor) < 0.02
      && !parkedComposition.playerBlocked,
    JSON.stringify(parkedComposition));
  await capture(previewPage, 'arrival-snow-grounded-exit');
  const motelInventory = await previewPage.evaluate(() => {
    const hands = document.querySelector('#hotbar');
    const gear = document.querySelector('#gearBox');
    const a = hands?.getBoundingClientRect();
    const b = gear?.getBoundingClientRect();
    const slotRects = [...document.querySelectorAll('#hotbar .slot')].map((slot) => {
      const rect = slot.getBoundingClientRect();
      return {
        left: Number(rect.left.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        width: Number(rect.width.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
      };
    });
    const overlaps = a && b
      ? a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
      : null;
    return {
      visible: Boolean(document.querySelector('#hotbar'))
        && getComputedStyle(document.querySelector('#hotbar')).display !== 'none',
      slots: document.querySelectorAll('#hotbar .slot').length,
      overlapsGearDescription: overlaps,
      centerDelta: a ? Math.abs((a.left + a.right) / 2 - innerWidth / 2) : null,
      width: a?.width ?? null,
      slotRects,
    };
  });
  check('the Motel uses the shared five-slot bottom inventory',
    motelInventory.visible
      && motelInventory.slots === 5
      && motelInventory.overlapsGearDescription === false
      && motelInventory.centerDelta < 2
      && motelInventory.width >= 230
      && motelInventory.slotRects.every((rect) => rect.width >= 40
        && rect.height >= 40 && rect.left >= 0 && rect.right <= 1280),
    JSON.stringify(motelInventory));
  await previewPage.waitForTimeout(700);
  // SwiftShader can need several frames to compile the first motel materials.
  // Capture after that warm-up, but before the opening dialogue wheel appears.
  await previewPage.waitForTimeout(800);
  let previewState = await firstPersonState(previewPage);
  check('the passenger-seat opening uses first-person presentation',
    previewState.mode === 'first_person'
      && !previewState.playerVisible
      && previewState.cameraDistance < 0.08,
    JSON.stringify(previewState));
  check('Snow is a distinct adult human ally',
    previewState.snow?.identity === 'snow'
      && previewState.snow.role === 'ally'
      && previewState.snow.faction === 'friendly'
      && previewState.snow.species === 'human'
      && !previewState.snow.hostile,
    JSON.stringify(previewState.snow));

  /* The ally is Snow of the Family, wearing his own photograph. */
  const allyIdentity = await previewPage.evaluate(() => {
    const snow = window.MOTEL.actors.find((actor) => actor.identity === 'snow');
    if (!snow) return null;
    let photoMaterials = 0;
    snow.group.traverse((object) => {
      for (const material of [].concat(object.material || [])) {
        if (material?.map?.image) photoMaterials++;
      }
    });
    return {
      name: snow.name,
      identity: snow.identity,
      face: snow.rig.face,
      photoMaterials,
      subtitleName: window.MOTEL.voice.cueFor('Snow', 'x').split('.')[0],
    };
  });
  check('the ally is Snow, with his own face on him',
    allyIdentity?.identity === 'snow'
      && allyIdentity.name === 'Snow'
      && allyIdentity.face === 'assets/faces/snow.png'
      && allyIdentity.photoMaterials >= 1,
    JSON.stringify(allyIdentity));

  /* Idle actors keep the pose the scene gave them. The old idle aimed at a
   * point due east of each actor's own anchor, so everybody in the lot turned
   * to face +x within a second whatever the scene intended. */
  const idlePoses = await previewPage.evaluate(() => {
    const norm = (r) => Math.atan2(Math.sin(r), Math.cos(r));
    return window.MOTEL.actors
      .filter((actor) => actor.state === 'idle')
      .map((actor) => ({
        name: actor.name,
        idleHeading: Number(actor.idleHeading.toFixed(3)),
        rotY: Number(norm(actor.group.rotation.y).toFixed(3)),
        off: Number(Math.abs(norm(actor.group.rotation.y - actor.idleHeading)).toFixed(3)),
      }));
  });
  check('idle actors hold the facing the scene authored',
    idlePoses.length >= 3
      && idlePoses.every((pose) => pose.off < 0.25)
      && new Set(idlePoses.map((pose) => pose.idleHeading)).size > 1,
    JSON.stringify(idlePoses));

  const passengerSightline = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    motel.scene.updateMatrixWorld(true);
    const visibleInTree = (object) => {
      for (let node = object; node; node = node.parent) {
        if (!node.visible) return false;
      }
      return true;
    };
    const direction = new motel.three.Vector3();
    motel.camera.getWorldDirection(direction);
    const ray = new motel.three.Raycaster(motel.camera.position, direction, 0, 80);
    return ray.intersectObjects(motel.scene.children, true).slice(0, 6).map((hit) => {
      const world = new motel.three.Vector3();
      hit.object.getWorldPosition(world);
      return {
        distance: Number(hit.distance.toFixed(3)),
        name: hit.object.name || null,
        geometry: hit.object.geometry?.type || null,
        color: hit.object.material?.color?.getHexString?.() || null,
        transparent: [].concat(hit.object.material || [])
          .every((material) => material.transparent && material.opacity < 0.8),
        visible: visibleInTree(hit.object),
        world: world.toArray().map((value) => Number(value.toFixed(3))),
      };
    });
  });
  const firstOpaquePassengerHit = passengerSightline.find((hit) => hit.visible && !hit.transparent);
  check('the passenger-seat sightline is clear of opaque car panels',
    passengerSightline.length > 0 && firstOpaquePassengerHit?.distance > 2,
    JSON.stringify(passengerSightline));

  /* The scene's first line is Snow's, it is recorded, and it used to be
   * decided silent before it was ever spoken: `init()` kicked off an index
   * fetch and 167 parallel downloads, and the line was said in the same
   * synchronous block, so `prepareVoice` found nothing decoded and returned
   * silence every time. Measured on `e2d9e96`: at the frame the subtitle
   * appeared, the only buffers that had ever started were three 1.5 s noise
   * beds, and `voice.playing()` was false 1.5 s later. */
  await previewPage.waitForFunction(
    () => document.getElementById('subtitle')?.textContent.includes('Room twelve. Meat first'),
    null,
    { timeout: SCENE_WAIT_MS },
  );
  const openingVoice = await previewPage.evaluate(() => ({
    cue: window.MOTEL.openingCue,
    decoded: window.MOTEL.voiceReadyFor(window.MOTEL.openingCue),
    played: window.MOTEL.voice.played.filter((entry) => entry.cue === window.MOTEL.openingCue),
    subtitle: document.getElementById('subtitle').textContent,
    /* Under the old code this line arrived four seconds before the wheel, from
     * `startScene`, and the wheel then said the whole sentence again. */
    node: window.MOTEL.dialogue?.nodeId ?? null,
  }));
  check("Snow's opening line is voiced, not just subtitled",
    openingVoice.decoded
      && openingVoice.played.length === 1
      && openingVoice.played[0].duration > 0.5
      && openingVoice.subtitle.includes('Room twelve. Meat first'),
    JSON.stringify(openingVoice));
  check('the briefing is delivered once, by the wheel that asks for an answer',
    openingVoice.node === 'snowBrief' && openingVoice.played.length === 1,
    JSON.stringify({ node: openingVoice.node, plays: openingVoice.played.length }));

  const moneyCaseAim = await aimPublicInteract(previewPage, 'moneyCase');
  check('aiming at Tony\'s case selects the case rather than a cabin neighbour',
    moneyCaseAim.active === 'moneyCase' && /case/i.test(moneyCaseAim.prompt),
    JSON.stringify(moneyCaseAim));
  const gloveboxAim = await aimPublicInteract(previewPage, 'glovebox');
  /* The glovebox answers with one of two authored labels (src/motel/main.js):
   * 'Check your weapon' before the .45 has been looked at, and 'The .45 is
   * checked and put away' after. This used to test for /weapon/i, which only
   * matched the first one -- and the arrival now draws the .45, looks at it
   * and holsters it before Tony can reach a door handle, so the first label
   * is never the one a player sees here. The scene's own comment says as
   * much: "in practice this is always the second label". The check went red
   * on a scene doing exactly what it was rebuilt to do.
   *
   * Pinned to the label the beat actually produces, which is a stronger
   * statement than "the word weapon appears somewhere": the crosshair has to
   * resolve to the GLOVEBOX, the prompt has to be the already-checked line,
   * and it must not read as either of the neighbours this check exists to
   * rule out -- the passenger door beside it and the case on the seat. */
  check('aiming at the glovebox selects the checked .45 rather than the door or case',
    gloveboxAim.active === 'glovebox'
      && /the \.45 is checked and put away/i.test(gloveboxAim.prompt)
      && !/passenger door|case/i.test(gloveboxAim.prompt),
    JSON.stringify(gloveboxAim));
  const earlyDoorAim = await aimPublicInteract(previewPage, 'exitCar');
  check('aiming at the passenger door selects the exit without stealing other cabin targets',
    earlyDoorAim.active === 'exitCar' && /passenger door/i.test(earlyDoorAim.prompt),
    JSON.stringify(earlyDoorAim));
  /* THE GUN IS PUT AWAY FOR THE WHOLE TRANSACTION -- and this is where that
   * is proved, because it is where the old check assumed the opposite.
   *
   * This used to aim at the glovebox, press E, and wait for the revolver to
   * rise into the hold so it could measure it. That worked when the glovebox
   * was how Tony first got the .45. The arrival now does it for him: the
   * gun comes out, he looks at it, and it goes away again before he can
   * reach a door handle, "because nobody sells meat to a man with his hand
   * full" (runArrivalInventory in src/motel/main.js). Pressing E on the
   * glovebox afterwards is the throttled second label, not a second draw --
   * `holsterWeapon()` says the gun "stays away until the room takes that
   * decision back", and only `releaseWeapon()` at the betrayal takes it
   * back. So the old wait sat on a view model that is deliberately null.
   *
   * The beat is asserted as it now is: the public press does NOT re-arm him.
   * The shared system still owns the .45 with six in it, the HUD says PUT
   * AWAY rather than EQUIPPED, and nothing is at the lens. The proof that
   * the .45 is the shared catalog revolver, right-side up in the frame, has
   * moved with the gun -- see the betrayal below, where the scene itself
   * says it "appears at the lens". */
  await aimPublicInteract(previewPage, 'glovebox');
  await previewPage.keyboard.press('KeyE');
  await previewPage.waitForTimeout(240);
  const gloveboxAgain = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const item = motel.inventory.find((entry) => entry.id === 'weapon:revolver');
    return {
      viewmodel: motel.viewmodel,
      held: Boolean(motel.heldModel),
      systemEquipped: motel.weapons.equipped,
      hud: motel.weapons.hud,
      inventoryText: item?.text || '',
      selected: item?.selected === true,
      subtitle: document.getElementById('subtitle').textContent,
    };
  });
  check('the glovebox does not put the .45 back in his hands once the arrival has put it away',
    /* Holstering releases the shared rack as well as the lens -- `equipped`
     * is null and there is no weapon HUD, which is the whole point of playing
     * the transaction unarmed: there is nothing to fire, not merely nothing
     * to see. What survives is the INVENTORY line, and it still reads six in
     * the wheel, because "the round you did not fire is still in there"
     * (equipWeapon, src/motel/main.js). And the press is heard, not ignored:
     * the throttled second line answers it. */
    gloveboxAgain.viewmodel.kind === null
      && !gloveboxAgain.held
      && !gloveboxAgain.viewmodel.visible
      && gloveboxAgain.systemEquipped === null
      && gloveboxAgain.inventoryText.includes('Compact revolver')
      && gloveboxAgain.inventoryText.includes('PUT AWAY')
      && gloveboxAgain.inventoryText.includes('6/6')
      && !gloveboxAgain.selected
      && /still six/i.test(gloveboxAgain.subtitle),
    JSON.stringify(gloveboxAgain));

  /* Owner: "I check revolver and he just keeps saying the voice line over and
   * over." The pickup line is delivered exactly once; every later press gets
   * a different, throttled sentence and no re-equip. Pressed here the way a
   * player does it — real [E], twice more, on the same prompt — and only
   * after the recording is decoded, so a repeat would be COUNTED rather than
   * lost to a download race. */
  await previewPage.waitForFunction(() => window.MOTEL.voiceReadyFor(
    window.MOTEL.voice.cueForLine('Prospect', 'Compact revolver. Six in the wheel. For emergencies and disrespect.'),
  ), null, { timeout: SCENE_WAIT_MS, polling: 120 });
  await previewPage.keyboard.press('KeyE');
  await previewPage.waitForTimeout(150);
  await previewPage.keyboard.press('KeyE');
  await previewPage.waitForTimeout(150);
  const gloveboxRepeat = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const pickupCue = motel.voice.cueForLine('Prospect', 'Compact revolver. Six in the wheel. For emergencies and disrespect.');
    const glovebox = motel.interactableList.find((entry) => entry.id === 'glovebox');
    return {
      weaponChecked: motel.S.weaponChecked,
      label: glovebox.label(),
      pickupPlays: motel.voice.played.filter((entry) => entry.cue === pickupCue).length,
    };
  });
  check('the glovebox pickup line refuses to repeat, however many times [E] lands',
    /* <= 1, not === 1: the FIRST press may have beaten the download, in which
     * case the line was subtitled silent. What a regression produces here is
     * 2+, because the decoded take replays on the later presses.
     *
     * The label test used to read /already out/i, which was the second
     * glovebox label before the arrival started drawing and holstering the
     * .45 for him. The gun is not out any more once that beat has finished,
     * so the authored second label now says so: 'The .45 is checked and put
     * away' (src/motel/main.js). Same statement, current words -- the point
     * was always that a second press gets the OTHER label, not the pickup
     * one, and it still is. */
    gloveboxRepeat.weaponChecked
      && gloveboxRepeat.pickupPlays <= 1
      && /checked and put away/i.test(gloveboxRepeat.label)
      && !/check your weapon/i.test(gloveboxRepeat.label),
    JSON.stringify(gloveboxRepeat));
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

  await answerWheel(previewPage, 'calm');
  await previewPage.waitForFunction(() => {
    const motel = window.MOTEL;
    const cue = motel.voice.cueForLine('Snow', 'Under the coat. Seven in it. Do not let them see the crest and do not make me explain a Family gun to a night clerk.');
    return motel.voice.played.some((entry) => entry.cue === cue);
  }, null, { timeout: SCENE_WAIT_MS, polling: 80 }).catch(() => {});
  const snowOffer = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const cue = motel.voice.cueForLine('Snow', 'Under the coat. Seven in it. Do not let them see the crest and do not make me explain a Family gun to a night clerk.');
    const commander = motel.interactableList.find((entry) => entry.id === 'silverback');
    return {
      cue,
      spoken: motel.S.snowGunOfferSpoken,
      played: motel.voice.played.filter((entry) => entry.cue === cue),
      enabled: commander.enabled(),
      label: commander.label(),
    };
  });
  check('Snow audibly calls attention to the optional Commander handoff',
    snowOffer.spoken
      && snowOffer.played.length === 1
      && snowOffer.enabled
      && /Snow offers/i.test(snowOffer.label),
    JSON.stringify(snowOffer));
  const snowAim = await aimPublicInteract(previewPage, 'silverback');
  check('aiming at Snow selects his offered Commander rather than the close money case',
    snowAim.active === 'silverback' && /Snow offers/i.test(snowAim.prompt),
    JSON.stringify(snowAim));
  /* Leave through the same public path as a player. `forceInteract` used to
   * jump around the point-target and collision adapter, which let a camera
   * trapped inside the car collider pass this verifier while [E] did nothing
   * in the shipped scene. */
  await aimPublicInteract(previewPage, 'exitCar');
  const passengerDoorAim = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const door = motel.refs.manCar.passengerDoorPosition();
    const dx = door.x - motel.pos.x;
    const dz = door.z - motel.pos.z;
    const dy = door.y - 1.55;
    const horizontal = Math.hypot(dx, dz);
    const distance = Math.hypot(horizontal, dy);
    return {
      phase: motel.phase,
      active: motel.activeInteract(),
      distance,
      facingDot: distance < 0.001 ? 1
        : (dx * motel.facing.x + dy * motel.facing.y + dz * motel.facing.z) / distance,
      door: door.toArray(),
      player: [motel.pos.x, motel.feetY, motel.pos.z],
    };
  });
  check('aiming at the actual passenger door exposes the public [E] exit prompt',
    passengerDoorAim.phase === 'car'
      && passengerDoorAim.active === 'exitCar'
      && passengerDoorAim.distance < 1.5
      && passengerDoorAim.facingDot > 0.9,
    JSON.stringify(passengerDoorAim));
  await previewPage.keyboard.press('KeyE');
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'lot', null, { timeout: SCENE_WAIT_MS })
    .catch(() => {});
  const realDoorExit = await previewPage.evaluate(() => ({
    phase: window.MOTEL.phase,
    blocked: window.MOTEL.isBlocked(
      window.MOTEL.pos.x,
      window.MOTEL.pos.z,
      window.MOTEL.feetY,
      window.MOTEL.playerRadius,
    ),
    colliderEnabled: window.MOTEL.refs.manCar.collider.enabled,
    position: [window.MOTEL.pos.x, window.MOTEL.feetY, window.MOTEL.pos.z],
  }));
  check('real [E] on the passenger door exits to clear pavement',
    realDoorExit.phase === 'lot'
      && !realDoorExit.blocked
      && realDoorExit.colliderEnabled,
    JSON.stringify(realDoorExit));
  await capture(previewPage, 'after-real-e-passenger-exit');
  await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    motel.teleport(-13.5, 21.5);
    motel.face(motel.refs.manCar.park.x, motel.refs.manCar.park.z);
  });
  await previewPage.waitForTimeout(180);
  await capture(previewPage, 'parked-maroon-convertible-exterior');

  const friendlyGuardBefore = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
    snow.group.position.set(motel.pos.x + 0.35, 0, motel.pos.z + 0.35);
    snow.hostile = true;
    snow.state = 'chase';
    snow.attackCd = 0;
    return { hp: motel.S.hp };
  });
  await previewPage.waitForTimeout(280);
  await previewPage.evaluate(() => {
    const snow = window.MOTEL.actors.find((actor) => actor.identity === 'snow');
    snow.hostile = true;
    snow.state = 'grab';
    snow.attackCd = 0;
  });
  await previewPage.waitForTimeout(280);
  const friendlyGuardAfter = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
    const result = {
      hp: motel.S.hp,
      hostile: snow.hostile,
      state: snow.state,
      faction: snow.faction,
    };
    snow.group.position.set(-10.6, 0, 16.4);
    snow.anchor = { x: -10.6, z: 16.4 };
    snow.state = 'idle';
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

  /* Independent public Q path, from a clean campaign and a genuinely seated
   * player. Reusing the E page after it reached the lot would only prove that
   * Q is harmless on foot. */
  const qContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const qPage = await qContext.newPage();
  trackRuntimeErrors(qPage);
  budgetForSoftwareRasteriser(qPage);
  try {
    await qPage.addInitScript((seed) => {
      if (seed) localStorage.setItem('squatchlife.campaign', seed);
    }, campaignSeed);
    await qPage.goto(
      `http://localhost:${PORT}/motel.html?preview=1&q-exit=1`,
      { waitUntil: 'load' },
    );
    await qPage.waitForFunction(() => window.MOTEL?.story, null, { timeout: SCENE_WAIT_MS });
    await qPage.click('#startBtn');
    await qPage.waitForFunction(() => window.MOTEL.phase === 'arrival');
    await qPage.evaluate(() => window.MOTEL.completeArrival());
    await qPage.waitForFunction(() => window.MOTEL.phase === 'car', null, { timeout: SCENE_WAIT_MS });
    /* Take the .45 with him: this context is closed after the probes below,
     * so it is the safe place to actually pull a trigger. */
    await qPage.evaluate(() => window.MOTEL.forceInteract('glovebox'));
    const beforeQ = await qPage.evaluate(() => ({
      phase: window.MOTEL.phase,
      snowExitedCar: window.MOTEL.arrival.snowExitedCar,
      blocked: window.MOTEL.isBlocked(
        window.MOTEL.pos.x,
        window.MOTEL.pos.z,
        window.MOTEL.feetY,
        window.MOTEL.playerRadius,
      ),
    }));
    await qPage.keyboard.press('KeyQ');
    await qPage.waitForFunction(() => window.MOTEL.phase === 'lot');
    const afterQ = await qPage.evaluate(() => ({
      phase: window.MOTEL.phase,
      blocked: window.MOTEL.isBlocked(
        window.MOTEL.pos.x,
        window.MOTEL.pos.z,
        window.MOTEL.feetY,
        window.MOTEL.playerRadius,
      ),
      colliderEnabled: window.MOTEL.refs.manCar.collider.enabled,
      position: [window.MOTEL.pos.x, window.MOTEL.feetY, window.MOTEL.pos.z],
    }));
    check('[Q] independently exits the parked car to clear pavement',
      beforeQ.phase === 'car'
        && beforeQ.snowExitedCar
        && !beforeQ.blocked
        && afterQ.phase === 'lot'
        && !afterQ.blocked
        && afterQ.colliderEnabled,
      JSON.stringify({ beforeQ, afterQ }));
    await capture(qPage, 'after-independent-q-exit');

    /* ---- the shared .45, and the trigger the deal will not let him pull ----
     *
     * This used to fire a live round in the lot and run a real [R] reload:
     * one pull spends one round out of the shared Firearm, logs the shared
     * cue, and costs Tony what a gunshot costs in this scene. It could,
     * because the glovebox was how the .45 got into his hands and it stayed
     * there.
     *
     * The scene pass sealed the deal. The arrival draws the .45, looks at it
     * and puts it away, and `dealSealed()` refuses a trigger pull "before a
     * round, a cue, or a cadence timer is spent" for every phase up to and
     * including room twelve -- only `releaseWeapon()` at the betrayal takes
     * that decision back. A Q-exit into the lot is squarely inside the seal,
     * so what this context can prove is the REFUSAL, and it proves it hard:
     * nothing spent, nothing logged, nothing shot, and a man with an opinion
     * rather than a man with a jammed gun.
     *
     * WHAT IS NO LONGER COVERED ANYWHERE, and should be: one pull spending
     * one shared round and one [R] running the catalog's two-phase reload.
     * Those belong after the betrayal, in the fight, and this disposable
     * context cannot reach that beat -- `maybeBetray()` returns unless the
     * phase is already 'room' or 'door'. Moving them needs a fight-phase
     * probe the file does not have yet; it is a gap, not a decision. */
    await qPage.evaluate(() => window.MOTEL.face(0, -12));
    await qPage.waitForTimeout(200);
    await capture(qPage, 'shared-revolver-sealed-lot');
    const beforeFire = await qPage.evaluate(() => ({
      ammo: window.MOTEL.S.ammo,
      shots: window.MOTEL.weapons.stats.shots,
      refusals: window.MOTEL.S.weaponRefusals,
      viewmodel: window.MOTEL.viewmodel,
    }));
    await qPage.evaluate(() => window.MOTEL.fire());
    await qPage.waitForTimeout(200);
    const afterFire = await qPage.evaluate(() => ({
      ammo: window.MOTEL.S.ammo,
      shots: window.MOTEL.weapons.stats.shots,
      cues: window.MOTEL.weapons.cues,
      refusals: window.MOTEL.S.weaponRefusals,
      firedWeapon: window.MOTEL.S.firedWeapon,
      noshotFailed: window.MOTEL.objectives.failed.includes('noshot'),
      subtitle: document.getElementById('subtitle').textContent,
      /* The subtitle is whatever won the floor at the instant this ran; the
       * log is what was said. See `spokenLog` in src/motel/main.js. */
      spoken: window.MOTEL.spoken.slice(-8),
    }));
    /* THE SPEECH FLOOR QUEUES. `say()` returns once it has reserved a slot,
     * and the words arrive when the floor gets to them, so sampling right
     * after the trigger pull reads whoever was already talking -- Snow, in
     * the run that exposed this. Wait for the refusal to actually be said. */
    const refusalLines = [
      'I should work the deal before resorting to that.',
      'Not yet. Let us see how this plays out.',
      'Lou sent me here to buy meat. Not to redecorate a motel.',
    ];
    const refusalSaid = await qPage.waitForFunction((lines) => window.MOTEL.spoken
      .some((said) => lines.some((line) => said.includes(line))), refusalLines,
    { timeout: 30000 }).then(() => true, () => false);
    afterFire.spoken = await qPage.evaluate(() => window.MOTEL.spoken.slice(-8));
    check('the sealed deal refuses the trigger before a round, a cue or a shot is spent',
      beforeFire.viewmodel.kind === null
        && !beforeFire.viewmodel.visible
        && beforeFire.ammo === 6
        && afterFire.ammo === 6
        && afterFire.shots === beforeFire.shots
        && !afterFire.cues.includes('weapon.revolver.fire')
        && !afterFire.firedWeapon
        && !afterFire.noshotFailed
        && afterFire.refusals === beforeFire.refusals + 1
        && refusalSaid,
      JSON.stringify({ beforeFire, afterFire }));

    await qPage.evaluate(() => window.MOTEL.reload());
    await qPage.waitForTimeout(400);
    const reloaded = await qPage.evaluate(() => ({
      ammo: window.MOTEL.S.ammo,
      reserve: window.MOTEL.weapons.reserve,
      reloads: window.MOTEL.weapons.stats.reloads,
      cues: window.MOTEL.weapons.cues,
    }));
    check('[R] spends nothing out of a cylinder that is still full and put away',
      reloaded.ammo === 6
        && reloaded.reserve === 12
        && reloaded.cues.every((cue) => !cue.startsWith('weapon.revolver.reload')),
      JSON.stringify(reloaded));
  } finally {
    await qContext.close();
  }

  /* A point prompt must obey the same three-dimensional reach and wall
   * occlusion as every physical target in the shared InteractionSystem. The
   * Motel still owns a legacy point list, so these two probes exercise its
   * adapter directly: first a room-nine prompt one storey above the player,
   * then the shipment through room eleven's solid rear wall. */
  await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const door9 = motel.interactableList.find((entry) => entry.id === 'door9');
    motel.teleport(-19, -1.0, motel.level.DECK_Y);
    motel.face(door9.x, door9.z);
  });
  await previewPage.waitForTimeout(180);
  const verticalReach = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const door9 = motel.interactableList.find((entry) => entry.id === 'door9');
    return {
      active: motel.activeInteract(),
      targetY: door9.y,
      playerFeetY: motel.feetY,
      playerInteractionY: motel.feetY + 1.4,
    };
  });
  check('a second-floor listener cannot use the room-nine prompt below',
    verticalReach.active !== 'door9', JSON.stringify(verticalReach));

  await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    motel.teleport(motel.refs.crates.x, -17.0);
    motel.face(motel.refs.crates.x, motel.refs.crates.z);
  });
  await previewPage.waitForTimeout(180);
  const shipmentWall = await previewPage.evaluate(() => ({
    active: window.MOTEL.activeInteract(),
    crates: { x: window.MOTEL.refs.crates.x, z: window.MOTEL.refs.crates.z },
    player: { x: window.MOTEL.pos.x, z: window.MOTEL.pos.z },
  }));
  check('the room-eleven rear wall blocks the shipment interaction',
    shipmentWall.active !== 'crates', JSON.stringify(shipmentWall));
  await capture(previewPage, 'after-shipment-wall');
  await previewPage.evaluate(() => {
    window.MOTEL.teleport(-12, -19.5);
    window.MOTEL.face(-12, -15.35);
  });
  await previewPage.waitForTimeout(120);
  await capture(previewPage, 'after-rear-window-11');
  await previewPage.evaluate(() => {
    window.MOTEL.teleport(3.3, -19.5);
    window.MOTEL.face(3.3, -15.35);
  });
  await previewPage.waitForTimeout(120);
  await capture(previewPage, 'after-rear-window-12');

  await waitQuiet(previewPage);
  await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    motel.teleport(-44, -1.0);
    motel.face(-44, -6.2);
  });
  await previewPage.waitForTimeout(180);
  await capture(previewPage, 'after-office-door-open');
  await previewPage.evaluate(() => window.MOTEL.forceInteract('clerk'));
  /* His panic run is real time on the page's own clock, like the arrival
   * drive above: under swiftshader the sprint to the wall can outlast the
   * old 30 s budget with the sample missing idle by a few hundred ms. */
  await previewPage.waitForFunction(() => {
    const clerk = window.MOTEL.actors.find((actor) => actor.identity === 'clerk');
    return clerk?.state === 'idle';
  }, null, { timeout: SCENE_WAIT_MS, polling: 80 }).catch(() => {});
  const clerkStoppedA = await previewPage.evaluate(() => {
    const clerk = window.MOTEL.actors.find((actor) => actor.identity === 'clerk');
    return clerk ? { x: clerk.position.x, z: clerk.position.z, state: clerk.state } : null;
  });
  await previewPage.waitForTimeout(450);
  const clerkStoppedB = await previewPage.evaluate(() => {
    const clerk = window.MOTEL.actors.find((actor) => actor.identity === 'clerk');
    return clerk ? { x: clerk.position.x, z: clerk.position.z, state: clerk.state } : null;
  });
  check('the cowed clerk reaches the wall and stops his running animation',
    clerkStoppedA?.state === 'idle'
      && clerkStoppedB?.state === 'idle'
      && Math.hypot(clerkStoppedB.x - clerkStoppedA.x, clerkStoppedB.z - clerkStoppedA.z) < 0.03,
    JSON.stringify({ first: clerkStoppedA, second: clerkStoppedB }));
  await capture(previewPage, 'after-clerk-stopped');

  await previewPage.evaluate(() => {
    window.MOTEL.teleport(-5.4, 16.0);
    window.MOTEL.face(0, 0);
  });

  /* The HUD shows what he is carrying, and grows a row when he picks
   * something up. */
  const packBefore = await previewPage.evaluate(() => ({
    items: window.MOTEL.inventory.map((item) => item.id),
    hidden: document.getElementById('packBox').classList.contains('empty'),
    text: document.getElementById('packList').textContent,
  }));
  await previewPage.evaluate(() => window.MOTEL.forceInteract('trunk'));
  await previewPage.evaluate(() => window.MOTEL.forceInteract('trunk'));
  await previewPage.waitForTimeout(120);
  const packAfter = await previewPage.evaluate(() => ({
    items: window.MOTEL.inventory.map((item) => item.id),
    hidden: document.getElementById('packBox').classList.contains('empty'),
    text: document.getElementById('packList').textContent,
    weapon: window.MOTEL.S.weapon,
  }));
  check('the carrying HUD keeps one equipped slot and updates it on pickup',
    !packBefore.hidden
      && packBefore.items.includes('money')
      && packBefore.items.includes('weapon:revolver')
      && packAfter.items.includes('money')
      && packAfter.items.filter((id) => id.startsWith('weapon:')).length === 1
      && packAfter.items.includes('weapon:crowbar')
      && packAfter.text.includes('crowbar'),
    JSON.stringify({ before: packBefore.items, after: packAfter.items, weapon: packAfter.weapon }));

  /* And the thing in his hands is visible from his own eyes. */
  const armed = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const THREE = motel.three;
    motel.scene.updateMatrixWorld(true);
    const view = motel.viewmodel;
    const group = motel.camera.children.find((child) => child.type === 'Group');
    if (!group) return { ...view, onScreen: false };
    const box = new THREE.Box3().setFromObject(group);
    const ndc = box.getCenter(new THREE.Vector3()).project(motel.camera);
    return {
      ...view,
      weapon: motel.S.weapon,
      holstered: motel.S.holstered,
      ndc: [Number(ndc.x.toFixed(2)), Number(ndc.y.toFixed(2))],
      onScreen: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z > -1 && ndc.z < 1,
    };
  });
  /* NOBODY SELLS MEAT TO A MAN WITH HIS HAND FULL, which the Prospect says
   * out loud when he picks one up: taking a weapon out of the trunk during
   * the deal HOLSTERS it. This check demanded it drawn at the lens, which was
   * true before the sealed-deal holster existed and has not been since --
   * `heldKind()` returns null while `S.holstered`, so there is no viewmodel
   * to see and there should not be. What must be true here is that the room
   * knows he is carrying it. The gun at the lens is the betrayal's business,
   * and it is proved at `releaseWeapon()` further down. */
  check('a weapon taken during the deal is carried, and deliberately not drawn',
    armed.weapon === 'crowbar'
      && armed.holstered === true
      && armed.kind === null
      && !armed.visible,
    JSON.stringify(armed));

  await previewPage.evaluate(() => { window.MOTEL.S.weapon = 'fists'; });
  await previewPage.waitForFunction(
    () => window.MOTEL.viewmodel.kind === null,
    null,
    { timeout: SCENE_WAIT_MS },
  ).catch(() => { /* reported by the assertion */ });
  const unarmed = await previewPage.evaluate(() => ({
    weapon: window.MOTEL.S.weapon, view: window.MOTEL.viewmodel,
  }));
  check('and nothing is drawn in his hands when he is empty-handed',
    unarmed.view.kind === null && unarmed.view.visible === false,
    JSON.stringify(unarmed));

  /* The Reserve is a room-twelve prop and must not be reachable from the lot,
   * let alone from the passenger seat, where taking it skipped the whole deal. */
  const reserveGate = await previewPage.evaluate(() => {
    const reserve = window.MOTEL.interactableList.find((entry) => entry.id === 'jerkyCase');
    return { phase: window.MOTEL.phase, enabledInLot: !!reserve.enabled() };
  });
  check('the Reserve cannot be taken before Tony is in the room',
    reserveGate.phase === 'lot' && reserveGate.enabledInLot === false,
    JSON.stringify(reserveGate));

  /* Lines ask the audio layer for a recording and survive not getting one. */
  const voiceWiring = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const line = 'Seatbelt. Or do not.';
    const before = motel.voice.requested.length;
    motel.voice.say('Snow', line, 2, motel.voice.cueForLine('Snow', line));
    const coverage = motel.voice.coverage();
    return {
      grew: motel.voice.requested.length > before,
      asked: coverage.requested.includes(motel.voice.cueForLine('Snow', line)),
      namespaced: coverage.requested.every((cue) => cue.startsWith('vo.motel.')),
      recorded: coverage.recorded.length,
      immediateSubtitle: document.getElementById('subtitle').textContent,
      queued: motel.voice.busy(),
    };
  });
  await previewPage.waitForFunction(
    () => document.getElementById('subtitle')?.textContent.includes('Seatbelt. Or do not.'),
    null,
    { timeout: SCENE_WAIT_MS },
  );
  const deliveredSubtitle = await previewPage.evaluate(() => ({
    subtitle: document.getElementById('subtitle').textContent,
    shown: document.getElementById('subtitle').classList.contains('show'),
  }));
  check('spoken lines ask for a recording and still read without one',
    voiceWiring.grew
      && voiceWiring.asked
      && voiceWiring.namespaced
      && voiceWiring.queued
      && deliveredSubtitle.shown
      && deliveredSubtitle.subtitle.includes('Seatbelt. Or do not.'),
    JSON.stringify({ ...voiceWiring, ...deliveredSubtitle }));
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
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
    motel.teleport(0, 18);
    snow.group.position.set(0, 0, 13.5);
    motel.face(snow.position.x, snow.position.z);
  });
  await previewPage.waitForTimeout(180);
  await capture(previewPage, 'after-snow-human');

  await previewPage.evaluate(() => {
    window.MOTEL.teleport(10.5, 14);
    window.MOTEL.face(22, 13);
  });
  await previewPage.waitForTimeout(180);
  await capture(previewPage, 'after-pool-layout');

  /* THE ONLY DOOR IN THE SCENE IS SOLID WHILE IT IS SHUT.
   *
   * Owner: "we need to make sure there is collision because you can easily
   * break thro it and it breaks the whole scene." Measured before the fix:
   * hold W from the lot at (0, 2) and Tony walked to (0, -11) — inside room
   * twelve, phase `lot`, nobody knocked, the entire script stranded. Walked
   * here rather than probed (docs/ENGINE-TRAPS.md entry 5): if the player
   * walks somewhere, the check walks there. */
  await previewPage.evaluate(() => {
    window.MOTEL.teleport(0, 2.0);
    window.MOTEL.face(0, -12);
  });
  /* Walk until the doorway is within reach, then keep pushing on it. The body
   * radius stops a legal walk at about z = -3.8; a walked-through door sails
   * past -4.5 into the room, and the extra shove is what would carry him. */
  await previewPage.keyboard.down('KeyW');
  await previewPage.waitForFunction(() => window.MOTEL.pos.z < -3.4, null, { timeout: SCENE_WAIT_MS, polling: 60 })
    .catch(() => { /* reported by the assertion below */ });
  await previewPage.waitForTimeout(1400);
  await previewPage.keyboard.up('KeyW');
  await previewPage.waitForTimeout(100);
  const closedDoorState = await previewPage.evaluate(() => ({
    phase: window.MOTEL.phase,
    knocked: window.MOTEL.S.knocked,
    enteredRoom: window.MOTEL.S.enteredRoom,
    insideRoom: window.MOTEL.level.insideRoom12(window.MOTEL.pos.x, window.MOTEL.pos.z),
    doorOpen: window.MOTEL.refs.frontDoor.open,
    doorSolid: window.MOTEL.refs.frontDoor.collider.enabled,
    z: Number(window.MOTEL.pos.z.toFixed(2)),
  }));
  check('the shut door of room twelve stops a player walking straight at it',
    closedDoorState.phase === 'lot'
      && !closedDoorState.knocked
      && !closedDoorState.enteredRoom
      && !closedDoorState.insideRoom
      && !closedDoorState.doorOpen
      && closedDoorState.doorSolid
      && closedDoorState.z < -3.0
      && closedDoorState.z > -4.6,
    JSON.stringify(closedDoorState));

  /* Room twelve answers the door even when the player walked away from a
   * conversation. This is the soft-lock that made the scene unfinishable and
   * this verifier unrunnable: the wheel is deliberately not modal, so leaving
   * the car mid-briefing left `dialogue` set forever, and the knock's own gate
   * read `!dialogue`. Measured on `e2d9e96`: phase `lot`, wheel still up,
   * `knock.enabled()` false, Rico never spawned, and nothing on screen to say
   * why. The gate is the phase now, and getting out closes the wheel. */
  const walkAwayGate = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    motel.talk('snowBrief');
    const knock = motel.interactableList.find((entry) => entry.id === 'knock');
    return { phase: motel.phase, dialogue: motel.dialogue, knockEnabled: !!knock.enabled() };
  });
  check('walking away from a conversation still leaves room twelve knockable',
    walkAwayGate.phase === 'lot'
      && walkAwayGate.dialogue?.nodeId === 'snowBrief'
      && walkAwayGate.knockEnabled,
    JSON.stringify(walkAwayGate));

  await previewPage.evaluate(() => window.MOTEL.forceInteract('knock'));
  /* Rico is spawned by a timer a second after the knock. Waiting for him
   * rather than for the clock keeps this honest on a slow renderer, where a
   * frame can outlast the timer and the old fixed sleep stepped into an empty
   * doorway. */
  await previewPage.waitForFunction(
    () => window.MOTEL.actors.some((actor) => actor.name === 'Rico'),
    null,
    { timeout: SCENE_WAIT_MS },
  );
  check('knocking brings Rico to the door of room twelve',
    await previewPage.evaluate(() => window.MOTEL.phase === 'door'
      && window.MOTEL.actors.some((actor) => actor.name === 'Rico')));
  /* Owner: "Going to the door takes too long they should open the door right
   * after you knock on it." The leaf swings when Rico answers — within a
   * second of the knuckles, on the wall clock the setTimeout actually runs on
   * — and does not wait for the doorstep wheel. The timestamps are recorded
   * by the scene at both ends, so this measures the door and not the
   * rasteriser. */
  const knockAnswer = await previewPage.evaluate(() => ({
    doorOpen: window.MOTEL.refs.frontDoor.open,
    doorSolid: window.MOTEL.refs.frontDoor.collider.enabled,
    thresholdHeld: window.MOTEL.refs.roomTwelveThreshold.enabled,
    answeredAfterMs: Math.round(window.MOTEL.S.doorAnsweredAt - window.MOTEL.S.knockedAt),
    /* The doorstep wheel is what the door used to wait for. It is open and
     * unanswered here, which is the owner's complaint answered in the one
     * form no clock can argue with. */
    doorstepNode: window.MOTEL.dialogue?.nodeId ?? null,
    doorstepAnswered: window.MOTEL.dialogue === null,
  }));
  check('room twelve opens its door on the knock, not on the doorstep conversation',
    /* The old bound was `answeredAfterMs <= 1000` and it read 2697 on
     * 2026-08-20. Nothing about the door had changed: both timestamps are
     * `performance.now()` (src/motel/main.js) taken either side of a
     * `setTimeout(..., KNOCK_ANSWER_MS)` of 420 ms, and a setTimeout is
     * DELIVERED late when the main thread is three seconds into rasterising a
     * motel forecourt in software. The measurement was of the browser's task
     * queue, not of Rico.
     *
     * What the owner actually asked for -- "they should open the door right
     * after you knock on it", against a door that used to wait four lines for
     * the doorstep wheel -- is a statement about ORDER, and order is exact:
     * the leaf is open, its collider is off, Rico's body still holds the
     * threshold, and the doorstep wheel is still sitting there UNANSWERED.
     * That is pinned first. The elapsed time is kept as a sanity bound, and
     * widened to five seconds with the delivery lag named, so it still
     * catches a door that waits on a conversation (which would take tens of
     * seconds here) without failing a box that is merely slow. */
    knockAnswer.doorOpen
      && !knockAnswer.doorSolid
      && knockAnswer.thresholdHeld
      && knockAnswer.doorstepNode === 'atDoor'
      && !knockAnswer.doorstepAnswered
      && knockAnswer.answeredAfterMs > 0
      && knockAnswer.answeredAfterMs <= 5000,
    JSON.stringify(knockAnswer));

  /* Open is not the same as clear: until the doorstep wheel is answered, the
   * man filling the doorway is a wall. Walked, again. */
  await previewPage.evaluate(() => {
    window.MOTEL.teleport(0, -3.4);
    window.MOTEL.face(0, -12);
  });
  /* From -3.4 the threshold body stops him at about -4.08. Push on it: the
   * wheel is up, so time runs slow, and every extra frame of held W is
   * another frame a hole would let him through. */
  await previewPage.keyboard.down('KeyW');
  await previewPage.waitForFunction(() => window.MOTEL.pos.z < -3.8, null, { timeout: SCENE_WAIT_MS, polling: 60 })
    .catch(() => { /* reported by the assertion below */ });
  await previewPage.waitForTimeout(1400);
  await previewPage.keyboard.up('KeyW');
  await previewPage.waitForTimeout(100);
  const heldDoorway = await previewPage.evaluate(() => ({
    phase: window.MOTEL.phase,
    enteredRoom: window.MOTEL.S.enteredRoom,
    doorOpened: window.MOTEL.S.doorOpened,
    z: Number(window.MOTEL.pos.z.toFixed(2)),
  }));
  check('Rico holds the doorway until the doorstep conversation is answered',
    heldDoorway.phase === 'door'
      && !heldDoorway.enteredRoom
      && !heldDoorway.doorOpened
      && heldDoorway.z < -3.7
      && heldDoorway.z > -4.4,
    JSON.stringify(heldDoorway));
  await previewPage.evaluate(() => {
    const rico = window.MOTEL.actors.find((actor) => actor.name === 'Rico');
    rico.talkT = 1.2;
  });
  /* A mouth that is talking is OPEN AND SHUT, and which of the two a single
   * sample catches is a coin toss weighted by the frame rate: this read
   * `mouth.scale.y > 1` once, 120 ms after setting `talkT`, and on a software
   * rasteriser 120 ms is a fraction of one frame. It caught the mouth closed
   * on 2026-08-20 and called a working mouth broken.
   *
   * Watched across frames instead, from inside the page so no round trip can
   * land between them: the claim is that the mouth MOVES while he speaks, and
   * that is what "opened at least once before the line ran out" says. It is
   * the stronger reading as well -- one lucky open frame never proved motion.
   *
   * AND WATCHED FOR THE WHOLE LINE, NOT FOR TWENTY FRAMES. The cap was the
   * same coin toss one storey up: twenty requestAnimationFrames is a tenth of
   * a second on a real GPU and the best part of ten seconds on the software
   * rasteriser this runs on, and a line has quiet in it between words. Two
   * runs an hour apart, same commit, same scene: one caught the mouth open on
   * frame 1, the other watched twenty frames, saw it shut every time, and
   * exited with 0.83 s of the line still to go. That is a sampling race
   * reporting itself as a broken mouth -- docs/ENGINE-TRAPS.md entry 2, the dt
   * clamp, wearing a different hat.
   *
   * So the loop ends when the LINE ends, bounded by a wall clock rather than a
   * frame count, and it reports the widest the mouth ever got. The threshold
   * is deliberately untouched: a check tuned until it passes is a check that
   * has stopped asking. If `maxScaleY` comes back at 1.4 this was bad luck; if
   * it comes back at exactly the rest value, the mouth genuinely never opens
   * and there is a real defect under it, which is the answer this could not
   * give before. */
  const ricoPresentation = await previewPage.evaluate(async () => {
    const rico = window.MOTEL.actors.find((actor) => actor.name === 'Rico');
    const frame = () => new Promise((resolve) => { requestAnimationFrame(resolve); });
    const deadline = performance.now() + 12000;
    let opened = false;
    let frames = 0;
    let maxScaleY = 0;
    while (rico.talkT > 0 && performance.now() < deadline) {
      await frame();
      frames += 1;
      const scaleY = rico.rig.mouth?.scale.y ?? 0;
      if (scaleY > maxScaleY) maxScaleY = scaleY;
      if (scaleY > 1) opened = true;
    }
    return {
      identity: rico.identity,
      face: rico.rig.faceMesh?.name || null,
      mouth: rico.rig.mouth?.name || null,
      mouthOpened: opened,
      /* What the threshold was actually compared against, so a failure says
       * how close it got instead of only that it did not get there. */
      maxScaleY: Math.round(maxScaleY * 1000) / 1000,
      framesWatched: frames,
      talkRemaining: rico.talkT,
    };
  });
  check('Rico keeps his own face identity and visibly mouths his lines',
    ricoPresentation.identity === 'rico'
      && ricoPresentation.face === 'actor.face.rico'
      && ricoPresentation.mouth === 'actor.mouth'
      && ricoPresentation.mouthOpened,
    JSON.stringify(ricoPresentation));
  await previewPage.evaluate(() => {
    window.MOTEL.teleport(0, -2.6);
    window.MOTEL.face(0, -5.4);
  });
  /* Answer him for real rather than setting `doorOpened` by hand: the door
   * opening is a consequence of a chosen line, and the objective that follows
   * is the thing this scene keeps failing to deliver. */
  await answerWheel(previewPage, 'calm');
  /* "WHILE he says come in" is a statement about two things being true at the
   * same instant, and this used to try to catch that instant with a wait, an
   * 80 ms sleep and a round trip -- three chances for the line to finish in
   * between. It did finish, on 2026-08-20: `voiceBusy` read false against a
   * scene that had said the line perfectly well, because a line lasts a fixed
   * number of SECONDS and the sampling took longer than that on a software
   * rasteriser.
   *
   * Sampled from inside the page instead, on the frame where both halves hold
   * together, so nothing can land between them. The claim is unchanged and
   * the proof is now exact: while the invitation is still being spoken, the
   * doorway already offers its [E]. */
  const invitation = await previewPage.evaluate(() => new Promise((resolve, reject) => {
    const motel = window.MOTEL;
    const deadline = performance.now() + 180000;
    const tick = () => {
      const subtitle = document.getElementById('subtitle').textContent;
      if (subtitle.includes('Come in before') && motel.voice.busy()
        && motel.activeInteract() === 'enterRoom') {
        const rico = motel.actors.find((actor) => actor.name === 'Rico');
        resolve({
          objective: motel.objective,
          active: motel.activeInteract(),
          voiceBusy: motel.voice.busy(),
          subtitle,
          rico: rico ? { x: rico.position.x, z: rico.position.z, state: rico.state } : null,
        });
        return;
      }
      if (performance.now() > deadline) {
        reject(new Error(`the doorway [E] never went live during the invitation: ${subtitle}`));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  check('Rico steps aside and the [E] doorway prompt is live while he says come in',
    invitation.voiceBusy
      && invitation.objective.sub.includes('[E]')
      && invitation.active === 'enterRoom'
      && Math.abs(invitation.rico?.x || 0) >= 0.8,
    JSON.stringify(invitation));
  await previewPage.waitForFunction(
    () => window.MOTEL.S.doorOpened && window.MOTEL.objective.sub.includes('Step inside'),
    null,
    { timeout: SCENE_WAIT_MS },
  );
  const doorObjective = await previewPage.evaluate(() => window.MOTEL.objective);
  check('answering at the door opens it and says, in words, to go in',
    doorObjective.sub.includes('Step inside') && doorObjective.sub.includes('[E]'),
    JSON.stringify(doorObjective));

  /* Step in by WALKING in. Crossing the threshold runs the same `enterRoom()`
   * the [E] prompt runs — there is no way to be inside room twelve that did
   * not go through the state machine, and this proves the doorway really is
   * passable once Rico has been answered. */
  await previewPage.evaluate(() => {
    window.MOTEL.teleport(0, -2.6);
    window.MOTEL.face(0, -12);
  });
  await previewPage.keyboard.down('KeyW');
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'room', null, { timeout: SCENE_WAIT_MS, polling: 60 })
    .catch(() => { /* reported by the assertion below */ });
  await previewPage.keyboard.up('KeyW');
  const walkedIn = await previewPage.evaluate(() => ({
    phase: window.MOTEL.phase,
    enteredRoom: window.MOTEL.S.enteredRoom,
    dealStarted: window.MOTEL.S.dealStarted,
    insideRoom: window.MOTEL.level.insideRoom12(window.MOTEL.pos.x, window.MOTEL.pos.z),
  }));
  check('walking through the answered door IS stepping inside',
    walkedIn.phase === 'room'
      && walkedIn.enteredRoom
      && walkedIn.dealStarted
      && walkedIn.insideRoom,
    JSON.stringify(walkedIn));
  await previewPage.waitForTimeout(180);
  await capture(previewPage, 'after-room-first-person');
  const meetingGate = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const enabled = Object.fromEntries(['sample', 'jerkyCase', 'placeMoney'].map((id) => {
      const target = motel.interactableList.find((entry) => entry.id === id);
      return [id, target ? target.enabled() : null];
    }));
    return { sampleOut: motel.S.sampleOut, active: motel.activeInteract(), enabled };
  });
  check('the three transaction objects wait for the spoken package briefing',
    !meetingGate.sampleOut
      && Object.values(meetingGate.enabled).every((enabled) => enabled === false)
      && !['sample', 'jerkyCase', 'placeMoney'].includes(meetingGate.active),
    JSON.stringify(meetingGate));

  /* ---- the transaction, step by step ----
   *
   * Three objects with three owners: their sample, their case of eight, your
   * forty thousand. The owner's report was "the sample is on the bed, or do i
   * need to put my sample on the table?" — the scene had four different nouns
   * for those three things and never said whose was whose. Every step below
   * asserts that the HUD names the object, the owner and the button. */
  await previewPage.waitForFunction(() => window.MOTEL.S.sampleOut, null, { timeout: SCENE_WAIT_MS });
  await previewPage.waitForFunction(() => window.MOTEL.deal.step === 'sample', null, { timeout: SCENE_WAIT_MS });
  const sampleStep = await previewPage.evaluate(() => ({
    deal: window.MOTEL.deal,
    objective: window.MOTEL.objective,
    packageBeatOrder: [
      ['Chino', 'Door stays shut. Air conditioning.'],
      ['Rico', 'Mountain reserve. Eleven-year cure. No fillers.'],
      ['Prospect', 'Eight in their case. One on the table. Neither of them is mine yet.'],
      ['Rico', 'Meat first. Money second. That is how this works.'],
    ].map(([speaker, line]) => window.MOTEL.voice.played.findIndex((entry) => (
      entry.cue === window.MOTEL.voice.cueForLine(speaker, line)
    ))),
  }));
  check('step one names their sample, the table and the button',
    sampleStep.deal.step === 'sample'
      && sampleStep.objective.id === 'inspect'
      && /their sample/i.test(sampleStep.objective.title)
      && sampleStep.objective.sub.includes('[E]')
      && sampleStep.deal.board?.yours.includes('$40,000')
      && sampleStep.deal.board.order === 'Meat first. Money second.',
    JSON.stringify(sampleStep));
  check('the meeting establishes their sample, their eight packages, and the transaction order out loud',
    sampleStep.packageBeatOrder.every((index) => index >= 0)
      && sampleStep.packageBeatOrder.every((index, i, all) => i === 0 || index > all[i - 1]),
    JSON.stringify(sampleStep.packageBeatOrder));

  /* Rico pushes the money back once if nothing has been checked. Meat first is
   * the rule of the room and a character says it, rather than the game simply
   * refusing the button with no explanation. */
  await previewPage.evaluate(() => window.MOTEL.forceInteract('placeMoney'));
  await previewPage.waitForFunction(
    () => document.getElementById('subtitle').textContent.includes('Meat first. Money second.'),
    null,
    { timeout: SCENE_WAIT_MS },
  );
  const refused = await previewPage.evaluate(() => ({
    onTable: window.MOTEL.S.moneyOnTable,
    refused: window.MOTEL.S.payRefused,
    subtitle: document.getElementById('subtitle').textContent,
  }));
  check('paying before checking is refused out loud, by Rico, not by a dead button',
    !refused.onTable && refused.refused && refused.subtitle.includes('Rico'),
    JSON.stringify(refused));

  await waitQuiet(previewPage);
  await previewPage.evaluate(() => window.MOTEL.forceInteract('sample'));
  const roomClockBeforeInspection = await previewPage.evaluate(() => window.MOTEL.roomClock);
  await previewPage.waitForTimeout(500);
  const roomClockDuringInspection = await previewPage.evaluate(() => window.MOTEL.roomClock);
  check('inspection and dialogue pause the slow-burn room clock',
    Math.abs(roomClockDuringInspection - roomClockBeforeInspection) < 0.02,
    JSON.stringify({ before: roomClockBeforeInspection, during: roomClockDuringInspection }));
  await capture(previewPage, 'after-inspection-options');
  await previewPage.evaluate(() => window.MOTEL.inspect(window.MOTEL.inspection.available()[0].id));
  await previewPage.waitForFunction(() => window.MOTEL.deal.step === 'count', null, { timeout: SCENE_WAIT_MS });
  const countStep = await previewPage.evaluate(() => ({
    deal: window.MOTEL.deal,
    objective: window.MOTEL.objective,
    label: window.MOTEL.interactableList.find((entry) => entry.id === 'jerkyCase').label(),
    sellerReplyPlayed: window.MOTEL.voice.played.some((entry) => (
      entry.cue === window.MOTEL.voice.cueForLine('Rico', 'I told you.')
    )),
    choices: [...document.querySelectorAll('#inspectList .insp')].map((button) => ({
      id: button.dataset.id,
      key: button.dataset.key,
      label: button.textContent.trim(),
      disabled: button.disabled,
    })),
  }));
  check('checking the sample moves the deal on to counting their case of eight',
    countStep.deal.sampleChecked
      && countStep.deal.step === 'count'
      && countStep.objective.id === 'count'
      && /their case of eight/i.test(countStep.objective.title)
      && /count their case of eight/i.test(countStep.label),
    JSON.stringify(countStep));
  check('inspection choices stay centered, numbered and grey in their authored slots',
    countStep.choices.length === 8
      && countStep.choices[0]?.id === 'smell'
      && countStep.choices[0]?.key === '1'
      && countStep.choices[0]?.disabled
      && countStep.choices[0]?.label.includes('Smell it')
      && countStep.choices[1]?.id === 'bend'
      && countStep.choices[1]?.key === '2'
      && !countStep.choices[1]?.disabled,
    JSON.stringify(countStep.choices));
  check('a seller answers the inspection before the deal advances',
    countStep.sellerReplyPlayed, JSON.stringify({ played: countStep.sellerReplyPlayed }));
  await capture(previewPage, 'after-inspection-selected');

  /* "i keep repeating 8 packages line". The count had no gate at all, so every
   * [E] at the case said the same sentence again and stacked six suspicion and
   * eight read on top each time — and the case sits next to the table, so it
   * was hit by accident constantly. */
  const beforeCount = await previewPage.evaluate(() => ({ heat: window.MOTEL.S.heat }));
  await previewPage.evaluate(() => {
    for (let i = 0; i < 5; i++) window.MOTEL.forceInteract('jerkyCase');
  });
  await previewPage.waitForTimeout(400);
  const counted = await previewPage.evaluate(() => ({
    counted: window.MOTEL.S.packagesCounted,
    heat: window.MOTEL.S.heat,
    countLines: window.MOTEL.voice.played.filter((entry) => entry.cue
      === window.MOTEL.voice.cueForLine('Prospect', 'Eight packages. Numbered labels. Seals all intact.')
      || entry.cue === window.MOTEL.voice.cueForLine('Prospect', 'Eight packages. Numbered labels. Two of these seals have been opened and re-pressed.')).length,
    label: window.MOTEL.interactableList.find((entry) => entry.id === 'jerkyCase').label(),
  }));
  check('the eight packages are counted once, however many times [E] is pressed',
    counted.counted
      && counted.countLines <= 1
      && counted.heat - beforeCount.heat <= 7
      && /counted/i.test(counted.label),
    JSON.stringify({ beforeCount, ...counted }));

  await previewPage.waitForFunction(() => window.MOTEL.deal.step === 'pay', null, { timeout: SCENE_WAIT_MS });
  const payStep = await previewPage.evaluate(() => ({
    deal: window.MOTEL.deal,
    objective: window.MOTEL.objective,
    label: window.MOTEL.interactableList.find((entry) => entry.id === 'placeMoney').label(),
  }));
  check('counting moves the deal on to your case, and says whose it is',
    /* The label test read /put your case on the table/i. That interaction was
     * found during the scene pass to be UNSELECTABLE -- it shared a point and
     * a radius with the sample check, which was declared first, and selection
     * uses a strict greater-than -- so the three table props were given
     * distinct points and a priority that follows the deal step, and the act
     * was renamed to what it now is: pushing your case ACROSS the table to
     * him, rather than putting it down on it. The words moved with the fix.
     *
     * Pinned to the authored label as it now reads, and still saying the
     * thing this check exists to say: the prompt names the PLAYER's case and
     * the table it is going across, so it cannot be mistaken for theirs. */
    payStep.deal.step === 'pay'
      && payStep.objective.id === 'payment'
      && /your case/i.test(payStep.objective.title)
      && /push your case across the table/i.test(payStep.label)
      && payStep.deal.board?.theirs.includes('eight counted'),
    JSON.stringify(payStep));

  await previewPage.evaluate(() => window.MOTEL.forceInteract('placeMoney'));
  await previewPage.waitForFunction(() => window.MOTEL.deal.step === 'open', null, { timeout: SCENE_WAIT_MS });
  const openStep = await previewPage.evaluate(() => ({
    deal: window.MOTEL.deal,
    objective: window.MOTEL.objective,
    label: window.MOTEL.interactableList.find((entry) => entry.id === 'placeMoney').label(),
  }));
  check('with the money down, the last step says what opening it costs',
    openStep.deal.moneyOnTable
      && openStep.deal.step === 'open'
      && /open your case/i.test(openStep.label)
      && /nothing you have not checked/i.test(openStep.objective.sub),
    JSON.stringify(openStep));

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
    const snow = window.MOTEL.actors.find((actor) => actor.identity === 'snow');
    snow.group.position.set(-1, 0, 1.5);
  });
  await previewPage.waitForTimeout(280);
  const signalState = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
    return {
      signalled: motel.S.snowSignalled,
      faction: snow.faction,
      hostile: snow.hostile,
      state: snow.state,
      hp: motel.S.hp,
    };
  });
  check('Snow reaches the signal waypoint without turning on Tony',
    signalState.signalled
      && signalState.faction === 'friendly'
      && !signalState.hostile
      && signalState.state === 'idle',
    JSON.stringify(signalState));

  /* THE HINGE. `releaseWeapon()` is the one place the room takes the holster
   * decision back: "one frame the room is a transaction and the trigger does
   * nothing, the next frame it is a gunfight and the same trigger kills
   * people", announced by the .45 appearing at the lens. So the shared-gun
   * proof that used to live at the glovebox lives here, where the gun is
   * genuinely in his hands and STAYS there -- no three-second draw window to
   * race, on any machine. Every assertion below is the one the glovebox
   * block used to make. */
  /* HE HAS TO HAVE THE GUN FOR THE GUN TO APPEAR. This block asserts the .45
   * at the lens the frame the deal dies, and on this page nothing had ever put
   * one in his hands -- `S.weapon` was `fists`, so `heldKind()` was null and
   * `releaseWeapon()` correctly toasted "Nothing in your hands. Take something
   * off somebody". The glovebox is where the revolver comes from; it is
   * anonymous and it is the scene's own answer to this -- but its interaction
   * is `enabled: () => phase === 'car'`, so a page that jumped into the room
   * can never reach it. `MOTEL.equip` is the same call the drive makes. */
  const armedForBetrayal = await previewPage.evaluate(() => ({
    weapon: window.MOTEL.equip('revolver'),
    holstered: window.MOTEL.S.holstered,
  }));
  check('the glovebox revolver is his before the deal turns, and stays put away',
    armedForBetrayal.weapon === 'revolver' && armedForBetrayal.holstered === true,
    JSON.stringify(armedForBetrayal));

  await previewPage.evaluate(() => window.MOTEL.betray());
  /* `releaseWeapon()` is synchronous inside `maybeBetray`, so the holster is
   * already off; only the viewmodel needs a frame to be built. A SHORT fuse on
   * purpose -- the old SCENE_WAIT_MS poll let the entire betrayal, the
   * gunfight and the recovery play out underneath it, and then read `fists`
   * in phase `recover`, where the weapon has been disposed of as evidence and
   * is SUPPOSED to be gone. Sample the hinge, not the aftermath. */
  try {
    await previewPage.waitForFunction(() => {
      const model = window.MOTEL.heldModel;
      return model && model.position.y > -0.27;
    }, null, { timeout: 20000, polling: 80 });
  } catch (error) {
    /* "no held model" and "held model still on its way up" want opposite
     * fixes and read identically as a timeout. Say which. */
    const why = await previewPage.evaluate(() => {
      const motel = window.MOTEL;
      return {
        weapon: motel.S.weapon,
        holstered: motel.S.holstered,
        heldModel: motel.heldModel ? motel.heldModel.position.toArray() : null,
        viewmodelKind: motel.viewmodel?.kind ?? null,
        weaponsModel: !!motel.weapons?.model,
        weaponsRigVisible: motel.weapons?.rig?.visible ?? null,
        phase: motel.phase,
      };
    }).catch((e) => ({ evaluateFailed: e.message }));
    throw new Error(`${error.message}\nafter betray(): ${JSON.stringify(why)}`);
  }
  const revolverPresentation = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const THREE = motel.three;
    motel.scene.updateMatrixWorld(true);
    motel.camera.updateMatrixWorld(true);
    const view = motel.viewmodel;
    const model = motel.heldModel;
    const item = motel.inventory.find((entry) => entry.id === 'weapon:revolver');
    let screenBox = null;
    let up = null;
    if (model) {
      /* Project the model's own bounding-box corners: the claim is that the
       * gun overlaps the frame, and a corner test survives a hold pose that
       * deliberately tucks the grip below the bottom edge. */
      const box = new THREE.Box3().setFromObject(model);
      const xs = [];
      const ys = [];
      const zs = [];
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(motel.camera);
            xs.push(p.x);
            ys.push(p.y);
            zs.push(p.z);
          }
        }
      }
      screenBox = {
        minX: Number(Math.min(...xs).toFixed(2)),
        maxX: Number(Math.max(...xs).toFixed(2)),
        minY: Number(Math.min(...ys).toFixed(2)),
        maxY: Number(Math.max(...ys).toFixed(2)),
        minZ: Number(Math.min(...zs).toFixed(2)),
      };
      /* Right-side up: the model's local +Y, taken to world and back through
       * the view, still points up the screen. An upside-down mount flips it. */
      const q = model.getWorldQuaternion(new THREE.Quaternion());
      const camQ = motel.camera.getWorldQuaternion(new THREE.Quaternion());
      up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
        .applyQuaternion(camQ.invert());
    }
    const rounds = model?.userData?.moving?.rounds ?? [];
    return {
      kind: view.kind,
      shared: view.shared,
      visible: view.visible,
      inCamera: view.inCamera,
      systemEquipped: motel.weapons.equipped,
      hud: motel.weapons.hud,
      parts: view.parts,
      visibleRounds: rounds.filter((round) => round.visible).length,
      screenBox,
      screenUpY: up ? Number(up.y.toFixed(2)) : null,
      inventoryText: item?.text || '',
      selected: item?.selected === true,
    };
  });
  check('the betrayal puts the shared catalog .45 in his hands, right-side up at the lens',
    revolverPresentation.kind === 'revolver'
      && revolverPresentation.shared === 'revolver'
      && revolverPresentation.visible
      && revolverPresentation.inCamera
      && revolverPresentation.systemEquipped === 'revolver'
      && revolverPresentation.hud?.rounds === 6
      && revolverPresentation.hud?.capacity === 6
      && revolverPresentation.visibleRounds === 6
      && ['revolver-barrel', 'revolver-cylinder', 'revolver-grip', 'revolver-trigger',
        'revolver-ejector-rod'].every((name) => revolverPresentation.parts.includes(name))
      && revolverPresentation.screenBox
      && revolverPresentation.screenBox.maxY > -1
      && revolverPresentation.screenBox.minY < 1
      && revolverPresentation.screenBox.maxX > -1
      && revolverPresentation.screenBox.minX < 1
      && revolverPresentation.screenBox.minZ > -1
      && revolverPresentation.screenUpY > 0.7
      && revolverPresentation.inventoryText.includes('EQUIPPED')
      && revolverPresentation.inventoryText.includes('6/6')
      && revolverPresentation.selected,
    JSON.stringify(revolverPresentation));
  await capture(previewPage, 'shared-revolver-viewmodel-car');

  const mattressState = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
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

  /* Rico has to cross the room and take him. That is simulation time, not wall
   * time, and this scene draws at a couple of frames a second on a software
   * rasteriser, so the budget is generous on purpose. */
  await previewPage.waitForFunction(() => window.MOTEL.S.captured, null, { timeout: SCENE_WAIT_MS });
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
    { timeout: SCENE_WAIT_MS },
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
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
    const rico = motel.actors.find((actor) => actor.name === 'Rico');
    for (const actor of motel.actors) {
      if (actor === snow || actor === rico) continue;
      actor.hostile = false;
      actor.state = 'idle';
    }
    motel.S.snowInside = true;
    snow.group.position.set(rico.position.x - 1, 0, rico.position.z);
    snow.state = 'follow';
    snow.attackCd = 0;
    rico.hostile = true;
    rico.state = 'idle';
    return { playerHp: motel.S.hp, ricoHp: rico.hp };
  });
  await previewPage.waitForTimeout(1150);
  const allyCombatAfter = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const snow = motel.actors.find((actor) => actor.identity === 'snow');
    const rico = motel.actors.find((actor) => actor.name === 'Rico');
    return {
      playerHp: motel.S.hp,
      ricoHp: rico.hp,
      snowHostile: snow.hostile,
      snowState: snow.state,
    };
  });
  check('Snow can still defend Tony against a true hostile',
    allyCombatAfter.playerHp === allyCombatBefore.playerHp
      && allyCombatAfter.ricoHp < allyCombatBefore.ricoHp
      && !allyCombatAfter.snowHostile
      && allyCombatAfter.snowState === 'follow',
    JSON.stringify({ before: allyCombatBefore, after: allyCombatAfter }));

  /* ---- the getaway, from the driver's eye ---- */
  /* THE .45's OWN VOICE, tested here rather than the moment it is drawn.
   *
   * Emptying a cylinder costs simulated seconds, and the room this gun is
   * drawn in is a live gunfight -- Lou, Booskibro and Snow are all shooting
   * while it runs. Spending that time right after the betrayal let the fight
   * resolve and took Rico with it, and the mattress, capture and ally checks
   * above all need Rico standing. So the gun is heard last, after the room
   * has stopped mattering and before the car pulls away, where time is free
   * and nobody left alive is anybody's dependency.
   */
  const revolverVoice = await previewPage.evaluate(async () => {
    const motel = window.MOTEL;
    const aliveBefore = motel.actors.filter((a) => a.alive).length;
    /* Fired into the room as it stands. Every check that needed a particular
     * man upright has already run, so this does not have to pick a heading
     * with nobody down it -- an earlier draft did, and in a room with hostiles
     * on every side it could not find one and fired nothing at all. */
    /* WAIT ON THE GUN, NOT ON THE CLOCK.
     *
     * The .45 runs at 2.4 rps out of the shared catalog and `Firearm` drains
     * that cooldown on the scene's own `update(dt)` -- simulated seconds, not
     * wall seconds. Under swiftshader this page draws about one and a third
     * frames a second with dt clamped to 0.05, so one wall second buys roughly
     * a fifteenth of a simulated one (ENGINE-TRAPS entry 2) and a 700 ms pause
     * between pulls is nowhere near the gun's 420 ms. Six pulls on a timer
     * produced two shots and an empty dry-click log, which reads exactly like
     * a dead audio bank and is nothing of the sort. The round count is the
     * gun's own answer to "are you ready", and it cannot be outrun. */
    const emptyTheCylinder = async (attempts = 400) => {
      for (let i = 0; i < attempts; i += 1) {
        if (motel.weapons.hud.rounds === 0) return true;
        motel.fire();
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return motel.weapons.hud.rounds === 0;
    };
    const before = motel.weapons.cues.length;
    const emptied = await emptyTheCylinder();
    const afterSix = motel.weapons.cues.slice(before);
    /* One more on a spent chamber: the hammer falls and nothing else does.
     * Same clock problem as the shots -- a pull inside the cadence comes back
     * refused rather than empty, and never reaches the dry click -- so keep
     * pulling until the gun actually clicks. */
    const dryBefore = motel.weapons.stats.dryClicks;
    for (let i = 0; i < 60 && motel.weapons.stats.dryClicks === dryBefore; i += 1) {
      motel.fire();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const onEmpty = motel.weapons.cues.slice(before + afterSix.length);
    motel.reload();
    /* reloadOut 0.85 s then reloadIn 1.55 s of SIMULATED time, same clock. */
    for (let i = 0; i < 80 && motel.weapons.hud.rounds < 6; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const onReload = motel.weapons.cues.slice(before + afterSix.length + onEmpty.length);
    /* WHO MATTERS IS RICO, not the body count. This is a live gunfight -- Lou,
     * Booskibro and Snow are all shooting while this block empties a cylinder
     * -- so "nobody died" is a claim about the scene's crossfire and not about
     * these six rounds, and it fails on a room that is behaving correctly.
     * What the six rounds must not do is take out the man the mattress and
     * grapple checks below still need, which is what the first draft did. */
    const aliveAfter = motel.actors.filter((a) => a.alive).length;
    return {
      aliveBefore,
      aliveAfter,
      emptied,
      rounds: motel.weapons.hud.rounds,
      fired: afterSix,
      onEmpty,
      onReload,
      standIns: motel.weapons.standIns,
      hasRealFire: motel.weapons.hasSample('weapon.revolver.fire'),
      hasRealEmpty: motel.weapons.hasSample('weapon.revolver.empty'),
    };
  }).catch((error) => ({ evaluateFailed: error.message }));
  check('the .45 plays its own five recordings, not the stand-ins',
    revolverVoice.emptied === true
      && revolverVoice.rounds === 6
      && revolverVoice.hasRealFire === true
      && revolverVoice.hasRealEmpty === true
      && revolverVoice.fired.filter((cue) => cue === 'weapon.revolver.fire').length === 6
      && revolverVoice.onEmpty.includes('weapon.revolver.empty')
      && revolverVoice.onReload.includes('weapon.revolver.reload.out')
      /* THE LOAD-BEARING CLAUSE. `cueLog` records what the gun ASKED for, and
       * `playWeaponCue` falls through to a verified stand-in for anything this
       * page has not decoded -- so a log full of the right names proves
       * nothing on its own. `standInCues` is the other half: empty means every
       * one of those names was the .45's own recording. */
      && revolverVoice.standIns.length === 0,
    JSON.stringify(revolverVoice));


  await previewPage.evaluate(() => window.MOTEL.drive());
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'drive', null, { timeout: SCENE_WAIT_MS });
  await previewPage.waitForTimeout(900);
  await capture(previewPage, 'after-drive-first-person');

  const driveView = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const THREE = motel.three;
    motel.camera.updateMatrixWorld(true);
    motel.driveState.scene.updateMatrixWorld(true);
    const direction = new THREE.Vector3();
    motel.camera.getWorldDirection(direction);
    const ray = new THREE.Raycaster(motel.camera.position.clone(), direction);
    const hits = ray.intersectObjects(motel.driveState.scene.children, true);
    const opaque = hits.find((hit) => {
      const material = hit.object.material;
      return material && !material.transparent && material.opacity !== 0;
    });
    /* What is in the middle of the frame, and how far away, and is any of it
     * something you cannot see through. */
    return {
      camera: motel.camera.position.toArray().map((n) => Number(n.toFixed(2))),
      first: hits[0]
        ? { role: hits[0].object.userData?.role ?? null, distance: Number(hits[0].distance.toFixed(2)) }
        : null,
      firstOpaque: opaque
        ? { role: opaque.object.userData?.role ?? null, distance: Number(opaque.distance.toFixed(2)) }
        : null,
      roadVisible: hits.some((hit) => hit.object.geometry?.type === 'PlaneGeometry'),
    };
  });
  check('the driving view looks out of the car, not into its own upholstery',
    driveView.first?.role !== 'seat-back'
      && (!driveView.firstOpaque || driveView.firstOpaque.distance > 20)
      && driveView.roadVisible,
    JSON.stringify(driveView));

  const headlights = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    const THREE = motel.three;
    const spots = [];
    motel.driveState.scene.traverse((object) => { if (object.isSpotLight) spots.push(object); });
    let ambient = 0;
    motel.driveState.scene.traverse((object) => {
      if (object.isHemisphereLight || object.isDirectionalLight || object.isAmbientLight) {
        ambient += object.intensity;
      }
    });
    /* How much the headlights deliver to a patch of road ahead of the car. */
    const probe = new THREE.Vector3(0, 0.02, -14);
    let onRoad = 0;
    for (const spot of spots) {
      const from = spot.getWorldPosition(new THREE.Vector3());
      const aim = spot.target.getWorldPosition(new THREE.Vector3()).sub(from).normalize();
      const toProbe = probe.clone().sub(from);
      const distance = toProbe.length();
      if (distance > spot.distance) continue;
      if (Math.acos(Math.max(-1, Math.min(1, toProbe.normalize().dot(aim)))) > spot.angle) continue;
      onRoad += spot.intensity / (distance ** spot.decay);
    }
    let pool = null;
    motel.driveState.scene.traverse((object) => {
      if (object.userData?.role === 'headlight-pool') pool = { visible: object.visible };
    });
    return { spots: spots.length, ambient: Number(ambient.toFixed(2)), onRoad: Number(onRoad.toFixed(1)), pool };
  });
  check('the headlights put unmistakable light on the road ahead',
    headlights.spots === 2
      && headlights.onRoad > headlights.ambient * 20
      && headlights.pool?.visible === true,
    JSON.stringify(headlights));

  const webgl = await previewPage.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    return {
      kind: gl?.constructor?.name || null,
      contextLost: gl?.isContextLost?.() ?? true,
      error: gl?.getError?.() ?? -1,
    };
  });
  check('the final Motel WebGL context remains healthy',
    !!webgl.kind && !webgl.contextLost && webgl.error === 0, JSON.stringify(webgl));

  await previewPage.close();

  await page.goto(`http://localhost:${PORT}/motel.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: SCENE_WAIT_MS });

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
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: SCENE_WAIT_MS });
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
  await page.waitForURL(`http://localhost:${PORT}/index.html`, { timeout: SCENE_WAIT_MS });
  await page.waitForFunction(() => window.__squatch?.campaign, null, { timeout: SCENE_WAIT_MS });
  const home = await page.evaluate(() => ({
    scene: window.__squatch.campaign.state.scene,
    mission: window.__squatch.campaign.state.missions.jerky_motel,
  }));
  check('the Motel returns to the apartment front door',
    home.scene.id === 'apartment'
      && home.scene.spawn === 'front_door'
      && home.mission.status === 'complete',
    JSON.stringify(home));
  check('the Motel loads without missing resources', notFound.length === 0, JSON.stringify(notFound));
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
