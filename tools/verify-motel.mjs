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
trackRuntimeErrors(page);

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
async function answerWheel(target, style, { timeout = 45000 } = {}) {
  await target.waitForFunction(() => window.MOTEL.dialogue?.ready === true, null, { timeout, polling: 80 });
  const taken = await target.evaluate((pick) => window.MOTEL.pick(pick), style);
  if (!taken) throw new Error(`the wheel refused the "${style}" answer`);
  await target.waitForFunction(() => window.MOTEL.dialogue === null, null, { timeout: 5000 });
  return taken;
}

/** Wait until nobody in room twelve is mid-sentence. */
async function waitQuiet(target, { timeout = 45000 } = {}) {
  await target.waitForFunction(() => !window.MOTEL.voice.busy(), null, { timeout, polling: 80 })
    .catch(() => { /* reported by whatever assertion comes next */ });
}

async function moveForward(target, { want = 0.6, timeout = 12000 } = {}) {
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
  await previewPage.goto(
    `http://localhost:${PORT}/motel.html?preview=1`,
    { waitUntil: 'load' },
  );
  await previewPage.waitForFunction(() => window.MOTEL?.story, null, { timeout: 60000 });
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
  await previewPage.waitForFunction(
    () => window.MOTEL.arrival.progress > 0.18 && window.MOTEL.arrival.progress < 0.82,
    null,
    { timeout: 8000, polling: 60 },
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
    };
  });
  check('the survey message stays hidden until Tony receives playable control',
    arrivalSurveyBrief.text === 'Survey the Motel before going into your meeting or go right into it'
      && arrivalSurveyBrief.opacity === 0
      && arrivalSurveyBrief.visible === 'hidden'
      && arrivalSurveyBrief.width >= 500,
    JSON.stringify(arrivalSurveyBrief));

  await previewPage.waitForFunction(() => window.MOTEL.phase === 'car');
  await previewPage.waitForFunction(() => {
    const element = document.getElementById('surveyBrief');
    return document.getElementById('hud')?.classList.contains('control-ready')
      && Number(getComputedStyle(element).opacity) > 0.5;
  }, null, { timeout: 3000, polling: 30 });
  const controlHandoffBrief = await previewPage.evaluate(() => {
    const element = document.getElementById('surveyBrief');
    const style = getComputedStyle(element);
    return {
      phase: window.MOTEL.phase,
      controlReady: document.getElementById('hud').classList.contains('control-ready'),
      opacity: Number(style.opacity),
      visible: style.visibility,
      animations: element.getAnimations().map((animation) => ({
        currentTime: Number(animation.currentTime?.toFixed?.(1) || 0),
        playState: animation.playState,
      })),
    };
  });
  check('the full ten-second survey brief starts at the playable passenger-seat handoff',
    controlHandoffBrief.phase === 'car'
      && controlHandoffBrief.controlReady
      && controlHandoffBrief.opacity > 0.5
      && controlHandoffBrief.visible === 'visible'
      && controlHandoffBrief.animations.some((animation) => animation.playState === 'running'
        && animation.currentTime < 2000),
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
    { timeout: 45000 },
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
  check('aiming at the glovebox selects the revolver rather than the door or case',
    gloveboxAim.active === 'glovebox' && /weapon/i.test(gloveboxAim.prompt),
    JSON.stringify(gloveboxAim));
  const earlyDoorAim = await aimPublicInteract(previewPage, 'exitCar');
  check('aiming at the passenger door selects the exit without stealing other cabin targets',
    earlyDoorAim.active === 'exitCar' && /passenger door/i.test(earlyDoorAim.prompt),
    JSON.stringify(earlyDoorAim));
  // Public interaction path: return the crosshair to the glovebox and press E.
  await aimPublicInteract(previewPage, 'glovebox');
  await previewPage.keyboard.press('KeyE');
  await previewPage.waitForTimeout(120);
  const revolverPresentation = await previewPage.evaluate(() => {
    const motel = window.MOTEL;
    motel.scene.updateMatrixWorld(true);
    const held = motel.camera.children.find((child) => child.type === 'Group')?.children[0];
    const partNames = [];
    held?.traverse((node) => { if (node.name) partNames.push(node.name); });
    const item = motel.inventory.find((entry) => entry.id === 'weapon:revolver');
    return {
      kind: motel.viewmodel.kind,
      visible: motel.viewmodel.visible,
      partNames,
      inventoryText: item?.text || '',
      selected: item?.selected === true,
    };
  });
  check('the glovebox revolver is a readable equipped gun with ammo in the shared inventory',
    revolverPresentation.kind === 'revolver'
      && revolverPresentation.visible
      && revolverPresentation.selected
      && revolverPresentation.inventoryText.includes('EQUIPPED')
      && revolverPresentation.inventoryText.includes('6/6')
      && ['revolver.barrel', 'revolver.cylinder', 'revolver.grip', 'revolver.muzzle']
        .every((name) => revolverPresentation.partNames.includes(name)),
    JSON.stringify(revolverPresentation));
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
  }, null, { timeout: 45000, polling: 80 }).catch(() => {});
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
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'lot', null, { timeout: 5000 })
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
  try {
    await qPage.addInitScript((seed) => {
      if (seed) localStorage.setItem('squatchlife.campaign', seed);
    }, campaignSeed);
    await qPage.goto(
      `http://localhost:${PORT}/motel.html?preview=1&q-exit=1`,
      { waitUntil: 'load' },
    );
    await qPage.waitForFunction(() => window.MOTEL?.story, null, { timeout: 60000 });
    await qPage.click('#startBtn');
    await qPage.waitForFunction(() => window.MOTEL.phase === 'arrival');
    await qPage.evaluate(() => window.MOTEL.completeArrival());
    await qPage.waitForFunction(() => window.MOTEL.phase === 'car', null, { timeout: 5000 });
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
  await previewPage.waitForFunction(() => {
    const clerk = window.MOTEL.actors.find((actor) => actor.identity === 'clerk');
    return clerk?.state === 'idle';
  }, null, { timeout: 30000, polling: 80 }).catch(() => {});
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
      ndc: [Number(ndc.x.toFixed(2)), Number(ndc.y.toFixed(2))],
      onScreen: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z > -1 && ndc.z < 1,
    };
  });
  check('an equipped weapon is visible in first person',
    armed.visible
      && armed.inCamera
      && armed.children > 0
      && armed.kind === 'crowbar'
      && armed.onScreen,
    JSON.stringify(armed));

  await previewPage.evaluate(() => { window.MOTEL.S.weapon = 'fists'; });
  await previewPage.waitForFunction(
    () => window.MOTEL.viewmodel.kind === null,
    null,
    { timeout: 20000 },
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
    { timeout: 20000 },
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
    { timeout: 30000 },
  );
  check('knocking brings Rico to the door of room twelve',
    await previewPage.evaluate(() => window.MOTEL.phase === 'door'
      && window.MOTEL.actors.some((actor) => actor.name === 'Rico')));
  await previewPage.evaluate(() => {
    const rico = window.MOTEL.actors.find((actor) => actor.name === 'Rico');
    rico.talkT = 1.2;
  });
  await previewPage.waitForTimeout(120);
  const ricoPresentation = await previewPage.evaluate(() => {
    const rico = window.MOTEL.actors.find((actor) => actor.name === 'Rico');
    return {
      identity: rico.identity,
      face: rico.rig.faceMesh?.name || null,
      mouth: rico.rig.mouth?.name || null,
      mouthOpen: rico.rig.mouth?.scale.y > 1,
      talkRemaining: rico.talkT,
    };
  });
  check('Rico keeps his own face identity and visibly mouths his lines',
    ricoPresentation.identity === 'rico'
      && ricoPresentation.face === 'actor.face.rico'
      && ricoPresentation.mouth === 'actor.mouth'
      && ricoPresentation.mouthOpen
      && ricoPresentation.talkRemaining > 0,
    JSON.stringify(ricoPresentation));
  await previewPage.evaluate(() => {
    window.MOTEL.teleport(0, -2.6);
    window.MOTEL.face(0, -5.4);
  });
  /* Answer him for real rather than setting `doorOpened` by hand: the door
   * opening is a consequence of a chosen line, and the objective that follows
   * is the thing this scene keeps failing to deliver. */
  await answerWheel(previewPage, 'calm');
  await previewPage.waitForFunction(
    () => document.getElementById('subtitle').textContent.includes('Come in before'),
    null,
    { timeout: 45000 },
  );
  await previewPage.waitForTimeout(80);
  const invitation = await previewPage.evaluate(() => {
    const rico = window.MOTEL.actors.find((actor) => actor.name === 'Rico');
    return {
      objective: window.MOTEL.objective,
      active: window.MOTEL.activeInteract(),
      voiceBusy: window.MOTEL.voice.busy(),
      rico: rico ? { x: rico.position.x, z: rico.position.z, state: rico.state } : null,
    };
  });
  check('Rico steps aside and the [E] doorway prompt is live while he says come in',
    invitation.voiceBusy
      && invitation.objective.sub.includes('[E]')
      && invitation.active === 'enterRoom'
      && Math.abs(invitation.rico?.x || 0) >= 0.8,
    JSON.stringify(invitation));
  await previewPage.waitForFunction(
    () => window.MOTEL.S.doorOpened && window.MOTEL.objective.sub.includes('Step inside'),
    null,
    { timeout: 45000 },
  );
  const doorObjective = await previewPage.evaluate(() => window.MOTEL.objective);
  check('answering at the door opens it and says, in words, to go in',
    doorObjective.sub.includes('Step inside') && doorObjective.sub.includes('[E]'),
    JSON.stringify(doorObjective));

  await previewPage.evaluate(() => window.MOTEL.forceInteract('enterRoom'));
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'room');
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
  await previewPage.waitForFunction(() => window.MOTEL.S.sampleOut, null, { timeout: 60000 });
  await previewPage.waitForFunction(() => window.MOTEL.deal.step === 'sample', null, { timeout: 45000 });
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
    { timeout: 30000 },
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
  await previewPage.waitForFunction(() => window.MOTEL.deal.step === 'count', null, { timeout: 60000 });
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

  await previewPage.waitForFunction(() => window.MOTEL.deal.step === 'pay', null, { timeout: 60000 });
  const payStep = await previewPage.evaluate(() => ({
    deal: window.MOTEL.deal,
    objective: window.MOTEL.objective,
    label: window.MOTEL.interactableList.find((entry) => entry.id === 'placeMoney').label(),
  }));
  check('counting moves the deal on to your case, and says whose it is',
    payStep.deal.step === 'pay'
      && payStep.objective.id === 'payment'
      && /your case/i.test(payStep.objective.title)
      && /put your case on the table/i.test(payStep.label)
      && payStep.deal.board?.theirs.includes('eight counted'),
    JSON.stringify(payStep));

  await previewPage.evaluate(() => window.MOTEL.forceInteract('placeMoney'));
  await previewPage.waitForFunction(() => window.MOTEL.deal.step === 'open', null, { timeout: 60000 });
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

  /* Rico has to cross the room and take him. That is simulation time, not wall
   * time, and this scene draws at a couple of frames a second on a software
   * rasteriser, so the budget is generous on purpose. */
  await previewPage.waitForFunction(() => window.MOTEL.S.captured, null, { timeout: 45000 });
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
    { timeout: 30000 },
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
  await previewPage.evaluate(() => window.MOTEL.drive());
  await previewPage.waitForFunction(() => window.MOTEL.phase === 'drive', null, { timeout: 20000 });
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
