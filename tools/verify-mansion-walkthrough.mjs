#!/usr/bin/env node
/**
 * Focused production-browser verification for the 2026-08-09 Mansion QA
 * walkthrough. This boots mansion.html, drives the real Player,
 * InteractionSystem, cast, speech gate, colliders, and scene graph, and never
 * builds substitute geometry.
 *
 * Usage:
 *   node tools/verify-mansion-walkthrough.mjs final
 *   MANSION_BASE_URL=https://example.test/ node tools/verify-mansion-walkthrough.mjs deployed
 *
 * Artifacts are written only when the verifier is actually run:
 * docs/validation/2026-08-09/mansion-walkthrough/<label>/report.json
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MANSION_WALKTHROUGH_COVERAGE,
  MANSION_WALKTHROUGH_VIEWS,
  assertWalkthroughSpec,
} from './mansion-walkthrough-spec.mjs';

assertWalkthroughSpec();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = (process.argv[2] || 'final').replace(/[^a-z0-9_-]/gi, '-');
const OUT = path.join(ROOT, 'docs', 'validation', '2026-08-09', 'mansion-walkthrough', LABEL);
const PORT = Number(process.env.PORT) || 54941;
const EXTERNAL_BASE = process.env.MANSION_BASE_URL?.replace(/\/+$/, '') || null;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Mansion walkthrough.');
  process.exit(1);
}

async function startStaticServer() {
  if (EXTERNAL_BASE) return { server: null, base: EXTERNAL_BASE };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const file = path.resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
      if ((file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`))
        || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(await fsp.readFile(file));
    } catch (error) {
      res.writeHead(500).end(error.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
  return { server, base: `http://127.0.0.1:${PORT}` };
}

const { server, base } = await startStaticServer();
await fsp.mkdir(OUT, { recursive: true });

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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  window.__mansionQaWebglLosses = [];
  document.addEventListener('webglcontextlost', (event) => {
    window.__mansionQaWebglLosses.push({ at: performance.now(), status: event.statusMessage || '' });
  }, true);
});

const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
const httpErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
});
page.on('requestfailed', (request) => failedRequests.push({
  url: request.url(),
  error: request.failure()?.errorText ?? 'request failed',
}));
page.on('response', (response) => {
  if (response.status() >= 400) httpErrors.push({ status: response.status(), url: response.url() });
});

const results = [];
function check(section, name, ok, detail = '') {
  const result = { section, name, ok: Boolean(ok), detail: String(detail || '') };
  results.push(result);
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  §${section} ${name}${detail ? ` - ${detail}` : ''}`);
  return result.ok;
}

function blocked(section, name, detail) {
  const result = {
    section, name, ok: null, status: 'content-blocked', detail: String(detail || ''),
  };
  results.push(result);
  console.log(`  BLOCK §${section} ${name}${detail ? ` - ${detail}` : ''}`);
  return result;
}

async function mansionState() {
  return page.evaluate(() => {
    const m = window.mansion;
    const p = m.player;
    const feetY = p.position.y - p.eyeHeight;
    return {
      x: Number(p.position.x.toFixed(3)),
      y: Number(feetY.toFixed(3)),
      z: Number(p.position.z.toFixed(3)),
      ground: Number(p.ground.toFixed(3)),
      interiorFloor: m.interior?.floorAt?.(p.position.x, p.position.z, feetY) ?? null,
      enabled: p.enabled,
    };
  });
}

async function settle(seconds = 0.3) {
  await page.evaluate((duration) => window.mansion.tick(duration), seconds);
}

async function facePoint(x, y, z) {
  await page.evaluate(([tx, ty, tz]) => {
    const p = window.mansion.player;
    const dx = tx - p.position.x;
    const dy = ty - p.position.y;
    const dz = tz - p.position.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.max(1e-6, Math.hypot(dx, dz)));
    window.mansion.tick(0.1);
  }, [x, y, z]);
}

async function walk(seconds, keys = ['KeyW']) {
  for (const key of keys) await page.keyboard.down(key);
  await settle(seconds);
  for (const key of keys) await page.keyboard.up(key);
  await settle(0.1);
}

async function walkTo(x, z, {
  steps = 32,
  tolerance = 0.65,
  expectedInteriorFloor = null,
} = {}) {
  let current = await mansionState();
  for (let i = 0; i < steps; i++) {
    const dx = x - current.x;
    const dz = z - current.z;
    const distance = Math.hypot(dx, dz);
    const floorResolved = expectedInteriorFloor === null
      || (current.interiorFloor !== null
        && Math.abs(current.interiorFloor - expectedInteriorFloor) <= 1e-9);
    if (distance <= tolerance && floorResolved) return { ok: true, steps: i, state: current };
    await page.evaluate((yaw) => { window.mansion.player.yaw = yaw; }, Math.atan2(-dx, -dz));
    await walk(Math.min(0.5, Math.max(0.18, distance / 3.2)));
    current = await mansionState();
  }
  const floorResolved = expectedInteriorFloor === null
    || (current.interiorFloor !== null
      && Math.abs(current.interiorFloor - expectedInteriorFloor) <= 1e-9);
  return {
    ok: Math.hypot(x - current.x, z - current.z) <= tolerance && floorResolved,
    steps,
    state: current,
  };
}

async function teleport(x, y, z, yaw = 0) {
  await page.evaluate(([tx, ty, tz, heading]) => {
    window.mansion.teleport(tx, ty, tz, heading);
  }, [x, y, z, yaw]);
  await settle(0.15);
}

async function findInteractionPose(id, radius = 1.75) {
  return page.evaluate(({ id: npcId, radius: distance }) => {
    const m = window.mansion;
    const speaker = m.cast.people[npcId];
    if (!speaker) return null;
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const x = speaker.x + Math.cos(angle) * distance;
      const z = speaker.z + Math.sin(angle) * distance;
      m.teleport(x, speaker.y, z, 0);
      const p = m.player;
      p.yaw = Math.atan2(-(speaker.x - p.position.x), -(speaker.z - p.position.z));
      p.pitch = Math.atan2(
        speaker.y + 1.05 - p.position.y,
        Math.max(1e-6, Math.hypot(speaker.x - p.position.x, speaker.z - p.position.z)),
      );
      m.tick(0.12);
      if (m.prompt.visible && m.prompt.key === 'E') {
        return { x, y: speaker.y, z, label: m.prompt.label };
      }
    }
    return null;
  }, { id, radius });
}

let boot = null;
let staticAudit = null;
let routeAudit = null;
let guardAudit = null;
let speechAudit = null;
let performerAudit = null;
let dressAudit = null;
let finalGl = null;

try {
  const url = `${base}/mansion.html?preview=1&qa=${Date.now()}`;
  const response = await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  const httpStatus = response?.status() ?? 0;
  await page.waitForFunction(() => window.mansion?.player && window.mansion?.renderer, null, {
    timeout: 180000,
  });
  await page.evaluate(() => document.getElementById('startBtn').click());
  await page.waitForFunction(() => window.mansion.running === true, null, { timeout: 120000 });
  await page.waitForFunction(() => window.mansion.framesRendered > 3, null, { timeout: 180000 });

  boot = await page.evaluate(() => {
    const m = window.mansion;
    const gl = m.renderer.getContext();
    return {
      title: document.title,
      canvasCount: document.querySelectorAll('canvas').length,
      rendererCanvasConnected: m.renderer.domElement.isConnected,
      frames: m.framesRendered,
      contextType: gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1',
      contextLost: gl.isContextLost(),
      glError: gl.getError(),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      losses: [...(window.__mansionQaWebglLosses ?? [])],
      overlay: document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')?.textContent ?? null,
    };
  });
  check(21, 'production page returns HTTP 200', httpStatus === 200, `HTTP ${httpStatus}`);
  check(21, 'real scene renders frames on a connected canvas',
    boot.frames > 3 && boot.canvasCount >= 1 && boot.rendererCanvasConnected,
    JSON.stringify({ frames: boot.frames, canvasCount: boot.canvasCount }));
  check(21, 'WebGL2 context is live with a non-empty drawing buffer',
    boot.contextType === 'webgl2' && !boot.contextLost && boot.glError === 0
      && boot.drawingBuffer.every((value) => value > 0) && boot.losses.length === 0,
    JSON.stringify(boot));
  check(21, 'no browser framework error overlay is present', !boot.overlay, boot.overlay ?? 'none');

  staticAudit = await page.evaluate(async () => {
    const m = window.mansion;
    const T = m.THREE;
    const groundsModule = await import(new URL('./src/mansion/scenes/MansionGrounds.js', location.href).href);
    const resolvedArtSlots = await m.interior.artReady;
    m.scene.updateMatrixWorld(true);

    const allNamed = (parent, name) => {
      const found = [];
      parent?.traverse?.((object) => { if (object.name === name) found.push(object); });
      return found;
    };
    const bounds = (object) => (object ? new T.Box3().setFromObject(object) : null);
    const boxData = (box) => box ? ({
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    }) : null;
    const axisGap = (a, b, axis) => Math.max(
      0,
      a.min[axis] - b.max[axis],
      b.min[axis] - a.max[axis],
    );
    const boxGap = (a, b) => Math.hypot(
      axisGap(a, b, 'x'), axisGap(a, b, 'y'), axisGap(a, b, 'z'),
    );
    const size = (object) => bounds(object)?.getSize(new T.Vector3()) ?? null;
    const intersects = (a, b) => Boolean(a && b && bounds(a).intersectsBox(bounds(b)));
    const clearXZ = (a, b, clearance = 0.05) => {
      if (!a || !b) return false;
      const aa = bounds(a);
      const bb = bounds(b);
      return aa.max.x + clearance <= bb.min.x || bb.max.x + clearance <= aa.min.x
        || aa.max.z + clearance <= bb.min.z || bb.max.z + clearance <= aa.min.z;
    };
    const pointClearance = (box, x, z) => {
      const cx = Math.max(box.min.x, Math.min(box.max.x, x));
      const cz = Math.max(box.min.z, Math.min(box.max.z, z));
      return Math.hypot(x - cx, z - cz);
    };
    const visibleBounds = (root) => {
      const result = new T.Box3();
      root?.traverse?.((object) => {
        if (!object.isMesh || !object.visible) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.every((material) => material?.transparent && material?.opacity <= 0.001)) return;
        result.union(bounds(object));
      });
      return result;
    };
    const planGap = (a, b) => {
      const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
      const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
      return Math.hypot(dx, dz);
    };

    const lampFixtures = m.grounds.props.lamps;
    const lampMatches = lampFixtures.map(([x, z]) => m.grounds.lights.find((light) => (
      Math.abs(light.position.x - x) < 0.01 && Math.abs(light.position.z - z) < 0.01
    ))).map((light) => light ? { intensity: light.intensity, distance: light.distance } : null);
    const flowers = m.grounds.props.landscaping.flowers ?? [];
    const flowerFaults = [];
    for (const flower of flowers) {
      if (flower.baseY < 0.1 || flower.scale < 0.72 || flower.scale > 1.02
        || flower.radius > 0.29 || flower.height > 0.38) {
        flowerFaults.push(`shape@${flower.x},${flower.z}`);
      }
      for (const [lx, lz] of lampFixtures) {
        if (Math.hypot(flower.x - lx, flower.z - lz) - flower.radius < 0.32) {
          flowerFaults.push(`lamp@${flower.x},${flower.z}`);
        }
      }
    }
    const approachBeds = (m.grounds.props.landscaping.beds ?? []).filter((bed) => (
      bed.z0 < 12 && (Math.abs(bed.x0 - 4.35) < 0.01 || Math.abs(bed.x1 + 4.35) < 0.01)
    ));
    const northBeds = approachBeds.filter((bed) => bed.z1 > 10).map((bed) => {
      const dz = bed.z1 - groundsModule.FOUNTAIN_POS.z;
      const fountainHalfWidth = Math.sqrt(Math.max(0, 6 ** 2 - dz ** 2));
      const innerEdge = bed.x0 > 0 ? bed.x0 : -bed.x1;
      return { shortenedBy: 22 - bed.z1, clearance: innerEdge - fountainHalfWidth };
    });

    const gateGuard = (() => {
      let found = null;
      m.scene.traverse((object) => {
        if (!found && object.userData?.npc?.name === 'the man on the door') found = object;
      });
      return found;
    })();
    const gateBounds = bounds(gateGuard);
    const facadeFace = groundsModule.BUILDING.z0 - groundsModule.WALL_T;

    const trophyReport = (name) => allNamed(m.interior.root, name).map((trophy) => {
      const baseObject = trophy.getObjectByName('display-trophy-base');
      const stem = trophy.getObjectByName('display-trophy-stem');
      const cup = trophy.getObjectByName('display-trophy-cup');
      const shelf = trophy.parent?.getObjectByName('display-case-shelf');
      if (!baseObject || !stem || !cup || !shelf) return { complete: false };
      const baseBox = bounds(baseObject);
      const stemBox = bounds(stem);
      const cupBox = bounds(cup);
      const shelfBox = bounds(shelf);
      const trophyBox = bounds(trophy);
      return {
        complete: true,
        baseStemAir: stemBox.min.y - baseBox.max.y,
        stemCupAir: cupBox.min.y - stemBox.max.y,
        shelfAir: trophyBox.min.y - shelfBox.max.y,
      };
    });
    const loungeTrophies = trophyReport('lounge-display-trophy');
    const hallTrophies = trophyReport('trophy-hall-display-trophy');
    const shield = m.interior.props.lounge.bayShield;
    const backBar = m.interior.root.getObjectByName('back-bar');
    const shieldFrame = m.interior.root.getObjectByName('bay-shield-frame');
    const shieldBox = bounds(shield);
    const backBarBox = bounds(backBar);
    const shieldClearance = shieldBox && backBarBox ? shieldBox.min.y - backBarBox.max.y : -Infinity;
    const shieldBarOverlap = shieldBox && backBarBox
      ? shieldBox.clone().intersect(backBarBox).getSize(new T.Vector3()) : null;

    const refrigerator = m.interior.props.kitchen.refrigerator;
    const fridgeSize = size(refrigerator);
    const microwave = m.interior.props.kitchen.microwave;
    const service = m.grounds.props.serviceRoad;
    const serviceDoor = m.grounds.doors.rearService;

    const gardenGate = m.grounds.props.rearGarden.roseGarden.gate;
    const gardenCorridor = new T.Box3(
      new T.Vector3(gardenGate.x - 1.2, 0, gardenGate.z - 1.0),
      new T.Vector3(gardenGate.x + 5.5, 1.8, gardenGate.z + 1.0),
    );
    const gardenFlowerBlocks = allNamed(m.grounds.root, 'mansion-garden-flower-clump')
      .filter((flower) => bounds(flower).intersectsBox(gardenCorridor)).length;
    const gardenColliderBlocks = m.grounds.colliders.filter((box) => box.intersectsBox(gardenCorridor)).length;

    const winter = m.interior.props.winterGarden;
    const winterStructure = winter.fountainStructure ?? [];
    const winterPairs = (winter.plants ?? []).flatMap((plant, plantIndex) => {
      const plantBox = bounds(plant);
      return winterStructure.map((fixture, fixtureIndex) => {
        const fixtureBox = bounds(fixture);
        return {
          plant: plantIndex,
          fixture: fixtureIndex,
          fixtureName: fixture?.name ?? null,
          intersects: plantBox.intersectsBox(fixtureBox),
          planAir: Math.hypot(
            Math.max(0, plantBox.min.x - fixtureBox.max.x, fixtureBox.min.x - plantBox.max.x),
            Math.max(0, plantBox.min.z - fixtureBox.max.z, fixtureBox.min.z - plantBox.max.z),
          ),
        };
      });
    });

    const trophyHall = m.interior.props.trophyHall;
    const includerCup = trophyHall.trophy.getObjectByName('great-includer-cup');
    const includerHandles = allNamed(trophyHall.trophy, 'great-includer-handle').map((handle) => ({
      upright: Math.abs(handle.rotation.x) <= 0.05,
      closed: Math.abs(handle.geometry.parameters.arc - Math.PI * 2) <= 0.001,
      connected: intersects(handle, includerCup),
    }));
    const trophyEntrance = m.grounds.props.trophyEntrance;
    const entranceWidths = trophyEntrance.arches.map((arch) => arch.z1 - arch.z0);
    const entrancePiers = trophyEntrance.arches.slice(0, -1).map((arch, index) => (
      trophyEntrance.arches[index + 1].z0 - arch.z1
    ));
    const middleArch = trophyEntrance.arches[1];
    const trophyCorridor = new T.Box3(
      new T.Vector3(trophyEntrance.x0 - 0.5, 1.2, middleArch.z0 + 0.1),
      new T.Vector3(trophyEntrance.x1 + 0.5, 3.0, middleArch.z1 - 0.1),
    );

    const living = m.interior.props.livingRoom;
    const fireBefore = living.flames?.[0]
      ? `${living.flames[0].position.y}:${living.flames[0].scale.y}` : null;
    living.updateFire(0.1);
    const fireAfter = living.flames?.[0]
      ? `${living.flames[0].position.y}:${living.flames[0].scale.y}` : null;

    const bedroomRects = {
      westFront: m.interior.rooms.bedWestFront.rect,
      eastFront: m.interior.rooms.bedEastFront.rect,
      westRear: m.interior.rooms.bedWestRear.rect,
      eastRear: m.interior.rooms.bedEastRear.rect,
    };
    const bedroomPlacards = [
      ['westFront', 'north', 'old-chapel-room-placard'],
      ['eastFront', 'north', 'old-country-room-placard'],
      ['westRear', 'south', 'lake-room-placard'],
      ['eastRear', 'south', 'booski-death-room-exterior-placard'],
    ].map(([id, wall, name]) => {
      const placard = m.interior.props.bedrooms[id].placard;
      const pz = placard?.getWorldPosition(new T.Vector3()).z;
      const rect = bedroomRects[id];
      return {
        id,
        expectedName: name,
        actualName: placard?.name ?? null,
        outside: wall === 'north' ? pz > rect.z1 : pz < rect.z0,
        above: placard ? bounds(placard).min.y >= 8.5 : false,
        contractOutside: placard?.userData?.roomPlacard?.outside === true,
      };
    });
    const bedrooms = m.interior.props.bedrooms;
    const gothicWardrobe = m.interior.root.getObjectByName('bed-west-front-wardrobe');
    const classicWardrobe = m.interior.root.getObjectByName('bed-east-front-wardrobe');
    const modernWardrobe = m.interior.root.getObjectByName('bed-east-rear-wardrobe');
    const classicWeight = bounds(bedrooms.eastFront.weightSet).getCenter(new T.Vector3());
    const lake = bedrooms.westRear;
    const lakePaddles = allNamed(m.interior.root, 'lake-paddle');
    const lakeLifeRing = m.interior.root.getObjectByName('lake-life-ring');
    const lakeCross = lake.whiteCross;
    const lakeWallBoxes = allNamed(m.interior.root, 'gallery-north-solid').map((wall) => bounds(wall));
    const lakeMount = (id, object) => {
      if (!object) return { id, name: null, wallTargets: 0, gap: Infinity, penetrates: true };
      const objectBox = bounds(object);
      const actualWalls = lakeWallBoxes.filter((wallBox) => (
        wallBox.max.x >= objectBox.min.x && wallBox.min.x <= objectBox.max.x
        && wallBox.max.y >= objectBox.min.y && wallBox.min.y <= objectBox.max.y
      ));
      return {
        id,
        name: object.name || '(unnamed)',
        wallTargets: actualWalls.length,
        penetrates: actualWalls.some((wallBox) => wallBox.intersectsBox(objectBox)),
        gap: actualWalls.length ? Math.min(...actualWalls.map((wallBox) => Math.max(
          0,
          objectBox.min.z - wallBox.max.z,
          wallBox.min.z - objectBox.max.z,
        ))) : Infinity,
      };
    };
    const lakeMounts = [
      lakeMount('picture', lake.artFrame.group),
      ...lakePaddles.map((object, index) => lakeMount(`paddle-${index}`, object)),
      lakeMount('life-ring', lakeLifeRing),
      lakeMount('white-cross', lakeCross),
    ];
    const lakeCrossVertical = lakeCross?.getObjectByName('lake-white-cross-vertical');
    const lakeCrossHorizontal = lakeCross?.getObjectByName('lake-white-cross-horizontal');
    const lakeCrossAdjacent = [lake.artFrame.group, ...lakePaddles, lakeLifeRing, lake.bed]
      .filter(Boolean)
      .filter((object) => intersects(lakeCross, object))
      .map((object) => object.name || '(unnamed)');
    const lakeFloor = m.interior.rooms.bedWestRear.floor;
    const lakeRoomWallBoxes = lakeWallBoxes.filter((wallBox) => (
      wallBox.max.x >= bedroomRects.westRear.x0 && wallBox.min.x <= bedroomRects.westRear.x1
    ));
    const lakeCeiling = lakeRoomWallBoxes.length
      ? Math.max(...lakeRoomWallBoxes.map((wallBox) => wallBox.max.y)) : lakeFloor;
    const lakeFootprintPlants = allNamed(m.interior.root, 'plant').map((plant) => ({
      name: plant.name,
      position: plant.getWorldPosition(new T.Vector3()),
      box: bounds(plant),
    })).filter(({ position }) => (
      position.x >= bedroomRects.westRear.x0 && position.x <= bedroomRects.westRear.x1
      && position.z >= bedroomRects.westRear.z0 && position.z <= bedroomRects.westRear.z1
    ));
    const lakePlants = lakeFootprintPlants.filter(({ box }) => (
      box.max.y >= lakeFloor - 0.001 && box.min.y <= lakeCeiling + 0.001
    ));
    const lakeLowerPlants = lakeFootprintPlants.filter(({ box }) => box.max.y < lakeFloor - 0.001);
    const modernPortraitClear = bedrooms.eastRear.identity.accentPortraits
      .every((portrait) => clearXZ(portrait, modernWardrobe, 0.2));
    const removedModernAccent = allNamed(m.interior.root, 'booski-death-room-deathmegatron-accent');

    const suiteBarLights = allNamed(m.interior.root, 'suite-bar-wall-light');
    const suiteBeams = allNamed(m.interior.root, 'suite-ceiling-beam');
    const suiteLightHeight = suiteBarLights[0]
      ? suiteBarLights[0].getWorldPosition(new T.Vector3()).y - m.interior.rooms.masterSuite.floor
      : Infinity;
    const railChain = [
      ['horseshoe-west-rail', 'gallery-edge-west-rail'],
      ['gallery-edge-west-rail', 'balcony-west-rail'],
      ['balcony-west-rail', 'balcony-south-rail'],
      ['balcony-south-rail', 'balcony-east-rail'],
      ['balcony-east-rail', 'gallery-edge-east-rail'],
      ['gallery-edge-east-rail', 'horseshoe-east-rail'],
    ].map(([from, to]) => ({ from, to, connected: intersects(
      m.interior.root.getObjectByName(from), m.interior.root.getObjectByName(to),
    ) }));

    const basement = m.interior.props.basement;
    const pegboard = basement.toolBench?.pegboard;
    const pegboardBox = bounds(pegboard);
    const basementWall = m.interior.root.getObjectByName('basement-wall-panel-north');
    const basementWallBox = bounds(basementWall);
    const pegboardWallOverlap = pegboardBox && basementWallBox ? {
      x: Math.min(pegboardBox.max.x, basementWallBox.max.x) - Math.max(pegboardBox.min.x, basementWallBox.min.x),
      y: Math.min(pegboardBox.max.y, basementWallBox.max.y) - Math.max(pegboardBox.min.y, basementWallBox.min.y),
    } : { x: -Infinity, y: -Infinity };
    const pegboardGap = pegboardBox && basementWallBox
      ? basementWallBox.min.z - pegboardBox.max.z : Infinity;
    const pegboardTools = (basement.toolBench?.tools ?? []).map((tool, index) => ({
      index,
      name: tool?.name ?? null,
      box: boxData(bounds(tool)),
      contacts: intersects(tool, pegboard),
    }));
    const cellarBottleParts = ['cellar-wine-body', 'cellar-wine-shoulder', 'cellar-wine-neck', 'cellar-wine-cork', 'cellar-wine-label'];
    const armoryBottles = basement.wineBottles ?? [];
    const armoryBottleFaults = armoryBottles.filter((bottle) => (
      cellarBottleParts.some((name) => !bottle.getObjectByName(name))
    )).length;
    const innocentBottleParts = [
      'cellar-wine-bottle-body', 'cellar-wine-bottle-shoulder', 'cellar-wine-bottle-neck',
      'cellar-wine-bottle-cork', 'cellar-wine-bottle-label',
    ];
    const innocentBottles = m.lab.innocent?.wine?.bottles ?? [];
    const innocentBottleFaults = innocentBottles.filter((bottle) => (
      innocentBottleParts.some((name) => !bottle.getObjectByName(name))
    )).length;
    const vaultMark = m.interior.props.vault.mark;
    const vaultMarkBox = bounds(vaultMark);
    const vaultWalls = allNamed(m.interior.root, 'cellar-rooms-solid')
      .map((wall) => ({ name: wall.name, box: bounds(wall) }))
      .filter(({ box }) => (
        box.max.x >= vaultMarkBox.min.x && box.min.x <= vaultMarkBox.max.x
        && box.max.y >= vaultMarkBox.min.y && box.min.y <= vaultMarkBox.max.y
      ));
    const vaultWallClearances = vaultWalls.map(({ box }) => Math.max(
      0,
      box.min.z - vaultMarkBox.max.z,
      vaultMarkBox.min.z - box.max.z,
    ));
    const vaultVisibleIntersections = [];
    m.interior.root.traverse((object) => {
      if (!object.isMesh || object.isInstancedMesh || object === vaultMark || !object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every((material) => material?.transparent && material.opacity <= 0.001)) return;
      if (bounds(object).intersectsBox(vaultMarkBox)) {
        vaultVisibleIntersections.push(object.name || '(unnamed)');
      }
    });
    const vaultJambs = allNamed(m.interior.root, 'cellar-rooms-case')
      .map((object, index) => ({
        index,
        name: object.name,
        box: bounds(object),
      }))
      .filter(({ box }) => (
        box.max.y >= vaultMarkBox.min.y && box.min.y <= vaultMarkBox.max.y
        && axisGap(box, vaultMarkBox, 'z') <= 0.5
      ))
      .map((entry) => ({ ...entry, gap: boxGap(entry.box, vaultMarkBox) }))
      .sort((a, b) => a.gap - b.gap);
    const vaultJambClearance = vaultJambs[0]?.gap ?? -Infinity;

    const [footlocker, jacket, boots] = m.interior.props.guestRoom.identity.belongings;
    const jacketBody = jacket?.getObjectByName('prospect-jacket-body');
    const jacketSleeves = allNamed(jacket, 'prospect-jacket-sleeve');
    const jacketParts = [
      'prospect-jacket-collar', 'prospect-jacket-lapel', 'prospect-jacket-hanger',
      'prospect-jacket-hook',
    ];
    const jacketBox = bounds(jacket);
    const bootsBox = bounds(boots);
    const bootsSize = size(boots);

    const bust = m.lab.hiddenWall.bust;
    const bustBox = visibleBounds(bust);
    const pierPoint = new T.Vector3(-14.8, groundsModule.BASEMENT_Y + 1.2, groundsModule.CELLAR_HALL.z0 + 0.22);
    let pier = null;
    m.interior.root.traverse((object) => {
      if (pier || !object.isMesh || !object.visible) return;
      const objectBox = bounds(object);
      if (objectBox.containsPoint(pierPoint)) pier = { name: object.name || '(unnamed)', box: objectBox };
    });
    const bustIntersection = pier
      ? pier.box.clone().intersect(bustBox).getSize(new T.Vector3()) : new T.Vector3(Infinity, Infinity, Infinity);
    const bustDisplay = m.lab.hiddenWall.bustDisplay;
    const structureOverlaps = [];
    m.interior.root.traverse((object) => {
      if (!object.isMesh || object.isInstancedMesh || !object.visible) return;
      const objectBox = bounds(object);
      const overlap = objectBox.clone().intersect(bustBox).getSize(new T.Vector3());
      if (overlap.x <= 0.001 || overlap.y <= 0.001 || overlap.z <= 0.001) return;
      if (objectBox.max.y > groundsModule.BASEMENT_Y + 0.03) structureOverlaps.push(object.name || '(unnamed)');
    });

    return {
      lamps: { fixtures: lampFixtures.length, matches: lampMatches, flowerCount: flowers.length, flowerFaults },
      court: { radius: groundsModule.COURT_RADIUS, approachBeds: approachBeds.length, northBeds },
      guard: {
        exists: Boolean(gateGuard),
        maxZ: gateBounds?.max.z ?? Infinity,
        facadeFace,
        routeCount: m.grounds.props.frontGuardRoutes?.length ?? 0,
        routeLengths: m.grounds.props.frontGuardRoutes?.map((route) => route.length) ?? [],
      },
      trophies: { lounge: loungeTrophies, hall: hallTrophies },
      artResolution: {
        ready: Boolean(m.interior.artReady),
        productionSeam: typeof m.interior.applyResolvedArt === 'function',
        resolvedSlots: Array.isArray(resolvedArtSlots) ? resolvedArtSlots : [],
      },
      bar: {
        shieldClearance,
        shield: {
          name: shield?.name ?? null,
          artPiece: shield?.userData?.artPiece ?? null,
          resolved: shield?.userData?.art?.real === true,
          box: boxData(shieldBox),
        },
        frame: {
          name: shieldFrame?.name ?? null,
          box: boxData(bounds(shieldFrame)),
          clearance: shieldFrame && backBarBox ? bounds(shieldFrame).min.y - backBarBox.max.y : -Infinity,
        },
        backBar: { name: backBar?.name ?? null, box: boxData(backBarBox) },
        overlap: shieldBarOverlap ? {
          x: shieldBarOverlap.x, y: shieldBarOverlap.y, z: shieldBarOverlap.z,
        } : null,
      },
      kitchen: {
        fridgeSize: fridgeSize ? { x: fridgeSize.x, y: fridgeSize.y, z: fridgeSize.z } : null,
        fridgeDoors: allNamed(refrigerator, 'kitchen-fridge-door').length,
        fridgeHandles: allNamed(refrigerator, 'kitchen-fridge-handle').length,
        microwaveParts: ['microwave-window', 'microwave-door-handle', 'microwave-control-panel', 'microwave-display']
          .map((name) => Boolean(microwave?.getObjectByName(name))),
        microwaveButtons: allNamed(microwave, 'microwave-button').length,
        service: {
          landing: service.landing,
          ramp: service.ramp,
          supports: service.supports.length,
          door: serviceDoor,
          samples: {
            landing: service.groundAt((service.landing.x0 + service.landing.x1) / 2, (serviceDoor.z0 + serviceDoor.z1) / 2),
            head: service.groundAt(service.ramp.x0, (serviceDoor.z0 + serviceDoor.z1) / 2),
            middle: service.groundAt((service.ramp.x0 + service.ramp.x1) / 2, (serviceDoor.z0 + serviceDoor.z1) / 2),
            foot: service.groundAt(service.ramp.x1, (serviceDoor.z0 + serviceDoor.z1) / 2),
          },
        },
      },
      garden: {
        gate: gardenGate,
        arch: Boolean(m.grounds.root.getObjectByName('rose-garden-entry-arch')),
        redundantHead: Boolean(m.grounds.root.getObjectByName('rose-gate-head')),
        redundantCoping: Boolean(m.grounds.root.getObjectByName('rose-gate-coping')),
        colliderBlocks: gardenColliderBlocks,
        flowerBlocks: gardenFlowerBlocks,
        puttingGreen: Boolean(m.grounds.root.getObjectByName('putting-green')),
        maze: Boolean(m.grounds.props.rearGarden.maze?.route?.length),
      },
      winter: {
        plantCount: winter.plants?.length ?? 0,
        plantNames: (winter.plants ?? []).map(({ name }) => name),
        structureCount: winterStructure.length,
        structureNames: winterStructure.map(({ name }) => name),
        pairs: winterPairs,
        minimumPlanAir: winterPairs.length ? Math.min(...winterPairs.map(({ planAir }) => planAir)) : -Infinity,
        intersections: winterPairs.filter(({ intersects }) => intersects),
      },
      trophyHall: {
        handles: includerHandles,
        statues: trophyHall.statues.length,
        floorLights: trophyHall.floorLights.length,
        entranceWidths,
        entrancePiers,
        entranceColliderBlocks: m.grounds.colliders.filter((box) => box.intersectsBox(trophyCorridor)).length,
      },
      living: {
        glow: living.fireGlow ? { intensity: living.fireGlow.intensity, distance: living.fireGlow.distance } : null,
        flames: living.flames?.length ?? 0,
        emissive: living.flames?.every((flame) => flame.material.emissive?.getHex() > 0) ?? false,
        animated: fireBefore !== fireAfter,
        galleryArt: living.galleryArt?.length ?? 0,
      },
      bedrooms: {
        placards: bedroomPlacards,
        gothic: {
          chairWardrobe: clearXZ(bedrooms.westFront.chair, gothicWardrobe, 0.18),
          tableBed: clearXZ(bedrooms.westFront.sideTable, bedrooms.westFront.bed, 0.15),
          clusterWardrobe: clearXZ(bedrooms.westFront.cluster.root, gothicWardrobe, 0.08),
        },
        classic: {
          chairWardrobe: clearXZ(bedrooms.eastFront.chair, classicWardrobe, 0.18),
          tableBed: clearXZ(bedrooms.eastFront.sideTable, bedrooms.eastFront.bed, 0.15),
          tvAngle: Math.abs(bedrooms.eastFront.tv.rotation.y),
          weight: { x: classicWeight.x, z: classicWeight.z },
        },
        lake: {
          chairCluster: clearXZ(lake.chair, lake.cluster.root, 0.18),
          tableCluster: clearXZ(lake.sideTable, lake.cluster.root, 0.18),
          plants: lakePlants.map(({ name, position, box }) => ({
            name,
            position: { x: position.x, y: position.y, z: position.z },
            box: boxData(box),
          })),
          plantVolume: { floor: lakeFloor, ceiling: lakeCeiling },
          excludedLowerPlants: lakeLowerPlants.map(({ name, position, box }) => ({
            name,
            position: { x: position.x, y: position.y, z: position.z },
            box: boxData(box),
          })),
          wallName: 'gallery-north-solid',
          wallMeshes: lakeWallBoxes.length,
          mounts: lakeMounts,
          whiteCross: {
            name: lakeCross?.name ?? null,
            vertical: Boolean(lakeCrossVertical),
            horizontal: Boolean(lakeCrossHorizontal),
            connected: intersects(lakeCrossVertical, lakeCrossHorizontal),
            adjacentIntersections: lakeCrossAdjacent,
          },
        },
        modern: {
          tableBench: clearXZ(bedrooms.eastRear.sideTable, bedrooms.eastRear.cluster.inventory[0], 0.18),
          portraitsClear: modernPortraitClear,
          accentPortraits: bedrooms.eastRear.identity.accentPortraits.map(({ name }) => name),
          removedDeathMegatronAccentCount: removedModernAccent.length,
        },
      },
      frozen: {
        bathrooms: Object.keys(m.interior.props.bathrooms).length,
        toilets: Object.values(m.interior.props.bathrooms).filter((entry) => entry.toilet?.group).length,
        conferenceRoom: Boolean(m.interior.rooms.conference && m.rooms.conferenceTable && m.rooms.conferenceHead),
      },
      suite: { barLights: suiteBarLights.length, beams: suiteBeams.length, lightHeight: suiteLightHeight },
      balcony: railChain,
      cellar: {
        pegboard: {
          name: pegboard?.name ?? null,
          box: boxData(pegboardBox),
          wall: { name: basementWall?.name ?? null, box: boxData(basementWallBox) },
          wallOverlap: pegboardWallOverlap,
          gap: pegboardGap,
          tools: pegboardTools,
        },
        armoryBottles: armoryBottles.length, armoryBottleFaults,
        innocentBottles: innocentBottles.length, innocentBottleFaults,
        vaultWallTargets: vaultWalls.length,
        vaultWallClearances,
        vaultMinimumWallClearance: vaultWallClearances.length
          ? Math.min(...vaultWallClearances) : -Infinity,
        vaultMark: {
          name: vaultMark?.name ?? null,
          artPiece: vaultMark?.userData?.artPiece ?? null,
          resolved: vaultMark?.userData?.art?.real === true,
          box: boxData(vaultMarkBox),
        },
        vaultJambTargets: vaultJambs.length,
        vaultJambClearance,
        vaultJambs: vaultJambs.slice(0, 6).map(({ index, name, box, gap }) => ({
          index, name, box: boxData(box), gap,
        })),
        vaultVisibleIntersections,
        vaultRoomInset: vaultMarkBox ? Math.min(
          vaultMarkBox.min.x - m.interior.rooms.vault.rect.x0,
          m.interior.rooms.vault.rect.x1 - vaultMarkBox.max.x,
        ) : -Infinity,
      },
      prospect: {
        belongings: [footlocker?.name, jacket?.name, boots?.name],
        jacketBody: Boolean(jacketBody),
        jacketSleeves: jacketSleeves.length,
        jacketParts: jacketParts.map((name) => Boolean(jacket?.getObjectByName(name))),
        jacketConnected: jacketBody ? jacketSleeves.every((sleeve) => intersects(sleeve, jacketBody)) : false,
        jacketWallGap: jacketBox ? m.interior.rooms.guestRoom.rect.x1 - jacketBox.max.x : Infinity,
        bootsSize: bootsSize ? { x: bootsSize.x, y: bootsSize.y, z: bootsSize.z } : null,
        bootsFloorGap: bootsBox ? bootsBox.min.y - m.interior.rooms.guestRoom.floor : Infinity,
        bust: {
          pier: pier?.name ?? null,
          intersection: { x: bustIntersection.x, y: bustIntersection.y, z: bustIntersection.z },
          clearance: pier ? planGap(bustBox, pier.box) : -Infinity,
          minimum: bustDisplay?.minimumStructureClearance ?? Infinity,
          viewIds: bustDisplay?.inspectionViews?.map(({ id }) => id) ?? [],
          structureOverlaps,
        },
      },
      art: {
        total: m.interior.art.length,
        vaultMark: Boolean(m.interior.props.vault.mark),
      },
      colliderClearanceHelperSample: pointClearance(m.grounds.colliders[0], 0, 0),
    };
  });

  const lampLive = staticAudit.lamps.matches.filter(Boolean);
  check(1, 'every intended driveway fixture has one live light',
    staticAudit.lamps.fixtures >= 10 && lampLive.length === staticAudit.lamps.fixtures,
    JSON.stringify({ fixtures: staticAudit.lamps.fixtures, live: lampLive.length }));
  check(1, 'driveway lights share useful brightness and radius',
    lampLive.length > 0
      && new Set(lampLive.map(({ intensity }) => intensity)).size === 1
      && new Set(lampLive.map(({ distance }) => distance)).size === 1
      && lampLive[0].intensity >= 8 && lampLive[0].distance >= 16 && lampLive[0].distance <= 22,
    JSON.stringify(lampLive[0] ?? null));
  check(1, 'front flowers are grounded, scaled, and clear of lamps',
    staticAudit.lamps.flowerCount >= 50 && staticAudit.lamps.flowerFaults.length === 0,
    JSON.stringify({ count: staticAudit.lamps.flowerCount, faults: staticAudit.lamps.flowerFaults.slice(0, 8) }));
  check(1, 'fountain motor court and shortened beds have useful clearance',
    staticAudit.court.radius >= 15.2 && staticAudit.court.approachBeds === 3
      && staticAudit.court.northBeds.length === 2
      && staticAudit.court.northBeds.every(({ shortenedBy, clearance }) => (
        shortenedBy >= 0.75 && shortenedBy <= 0.95 && clearance >= 3.0
      )), JSON.stringify(staticAudit.court));
  check(1, 'front guard routes and facade-clear door post are published',
    staticAudit.guard.exists && staticAudit.guard.routeCount === 3
      && staticAudit.guard.routeLengths.every((length) => length >= 4)
      && staticAudit.guard.maxZ <= staticAudit.guard.facadeFace - 0.08,
    JSON.stringify(staticAudit.guard));

  const trophiesGood = (entries, count) => entries.length === count && entries.every((entry) => (
    entry.complete && Math.abs(entry.baseStemAir) <= 0.012 && Math.abs(entry.stemCupAir) <= 0.012
      && Math.abs(entry.shelfAir) <= 0.018
  ));
  check(3, 'all pool-room display trophies are connected and shelf-seated',
    trophiesGood(staticAudit.trophies.lounge, 9), JSON.stringify(staticAudit.trophies.lounge));
  check(3, 'pool-room artwork has visible air above the bar',
    staticAudit.artResolution.ready && staticAudit.artResolution.productionSeam
      && staticAudit.artResolution.resolvedSlots.includes('mansion.bay.shield')
      && staticAudit.bar.shield?.artPiece === 'mansion.bay.shield'
      && staticAudit.bar.shield?.resolved
      && staticAudit.bar.backBar?.name === 'back-bar'
      && staticAudit.bar.shieldClearance >= 0.12,
    JSON.stringify(staticAudit.bar));
  check(4, 'bar artwork is intentionally framed above the back bar',
    staticAudit.bar.frame?.name === 'bay-shield-frame'
      && staticAudit.bar.frame.clearance >= 0.12
      && staticAudit.bar.shieldClearance >= 0.12,
    JSON.stringify(staticAudit.bar));

  const kitchen = staticAudit.kitchen;
  check(5, 'refrigerator faces the room at Mansion scale with two handled doors',
    kitchen.fridgeSize && kitchen.fridgeSize.z > kitchen.fridgeSize.x
      && kitchen.fridgeSize.y >= 2.1 && kitchen.fridgeSize.z >= 0.95
      && kitchen.fridgeDoors === 2 && kitchen.fridgeHandles === 2,
    JSON.stringify(kitchen.fridgeSize));
  check(5, 'microwave publishes all appliance details',
    kitchen.microwaveParts.every(Boolean) && kitchen.microwaveButtons >= 8,
    JSON.stringify({ parts: kitchen.microwaveParts, buttons: kitchen.microwaveButtons }));
  const service = kitchen.service;
  check(5, 'kitchen exterior stair meets a supported flush landing',
    service.landing.x0 === service.door.x1
      && service.landing.z0 <= service.door.z0 && service.landing.z1 >= service.door.z1
      && service.landing.y === 1.2 && service.ramp.axis === 'x' && service.ramp.highAt === 'min'
      && service.ramp.x0 === service.landing.x1 && service.supports >= 2
      && service.samples.landing === 1.2 && service.samples.head === 1.2
      && service.samples.middle > 0.5 && service.samples.middle < 0.7 && service.samples.foot === 0,
    JSON.stringify(service));
  const sinkWorked = await page.evaluate(() => {
    const m = window.mansion;
    const before = m.sink.running;
    m.sink.set(true);
    const on = m.sink.running;
    m.sink.set(false);
    return { before, on, after: m.sink.running };
  });
  check(5, 'accepted working sink still toggles cleanly', sinkWorked.on && !sinkWorked.after,
    JSON.stringify(sinkWorked));

  check(6, 'garden arch is widened and is the entrance itself',
    staticAudit.garden.gate.w >= 2.75 && staticAudit.garden.gate.w <= 2.8
      && staticAudit.garden.arch && !staticAudit.garden.redundantHead && !staticAudit.garden.redundantCoping,
    JSON.stringify(staticAudit.garden));
  check(6, 'garden-arch player corridor is clear of solids and flowers',
    staticAudit.garden.colliderBlocks === 0 && staticAudit.garden.flowerBlocks === 0,
    JSON.stringify({ colliders: staticAudit.garden.colliderBlocks, flowers: staticAudit.garden.flowerBlocks }));
  check(6, 'accepted smaller garden and putting green remain present',
    staticAudit.garden.puttingGreen && staticAudit.garden.maze,
    JSON.stringify({ puttingGreen: staticAudit.garden.puttingGreen, maze: staticAudit.garden.maze }));
  check(7, 'every winter-garden planter Box3 clears all actual named fountain structure',
    staticAudit.winter.plantCount === 5
      && staticAudit.winter.plantNames.every((name) => name === 'winter-garden-planter')
      && staticAudit.winter.structureCount === 10
      && staticAudit.winter.structureNames.filter((name) => name === 'winter-fountain-kerb').length === 8
      && staticAudit.winter.structureNames.filter((name) => name === 'winter-fountain-pedestal').length === 1
      && staticAudit.winter.structureNames.filter((name) => name === 'winter-fountain-bowl').length === 1
      && staticAudit.winter.pairs.length === 50
      && staticAudit.winter.intersections.length === 0
      && staticAudit.winter.minimumPlanAir >= 0.15,
    JSON.stringify(staticAudit.winter));

  check(8, 'trophy entrance is grander, supported, and collision-clear',
    staticAudit.trophyHall.entranceWidths.length === 3
      && Math.min(...staticAudit.trophyHall.entranceWidths) >= 1.5
      && staticAudit.trophyHall.entranceWidths[1] >= 1.6
      && staticAudit.trophyHall.entrancePiers.every((pier) => pier >= 0.18)
      && staticAudit.trophyHall.entranceColliderBlocks === 0,
    JSON.stringify(staticAudit.trophyHall));
  check(8, 'Great Includer handles are upright, closed, and connected',
    staticAudit.trophyHall.handles.length === 2
      && staticAudit.trophyHall.handles.every(({ upright, closed, connected }) => upright && closed && connected),
    JSON.stringify(staticAudit.trophyHall.handles));
  check(8, 'unrelated trophy-room statue and lamp are gone',
    staticAudit.trophyHall.statues === 0 && staticAudit.trophyHall.floorLights === 0,
    JSON.stringify({ statues: staticAudit.trophyHall.statues, floorLights: staticAudit.trophyHall.floorLights }));
  check(8, 'all hall-case trophies are connected and shelf-seated',
    trophiesGood(staticAudit.trophies.hall, 8), JSON.stringify(staticAudit.trophies.hall));

  check(9, 'family fireplace has animated emissive flames and room glow',
    staticAudit.living.glow?.intensity > 0 && staticAudit.living.glow?.distance >= 18
      && staticAudit.living.flames >= 4 && staticAudit.living.emissive && staticAudit.living.animated,
    JSON.stringify(staticAudit.living));
  check(9, 'family fireplace wall has curated secondary art', staticAudit.living.galleryArt >= 2,
    `${staticAudit.living.galleryArt} pieces`);

  const placardsGood = staticAudit.bedrooms.placards.every((entry) => (
    entry.actualName === entry.expectedName && entry.outside && entry.above && entry.contractOutside
  ));
  check(10, 'modern room placard is outside and above the doorway',
    placardsGood && staticAudit.bedrooms.placards.find(({ id }) => id === 'eastRear')?.actualName === 'booski-death-room-exterior-placard',
    JSON.stringify(staticAudit.bedrooms.placards));
  check(10, 'modern TV furniture and portraits clear the wardrobe',
    staticAudit.bedrooms.modern.tableBench && staticAudit.bedrooms.modern.portraitsClear
      && JSON.stringify(staticAudit.bedrooms.modern.accentPortraits)
        === JSON.stringify(['booski-death-room-booski-accent'])
      && staticAudit.bedrooms.modern.removedDeathMegatronAccentCount === 0,
    JSON.stringify(staticAudit.bedrooms.modern));
  check(11, 'accepted upstairs bathrooms remain intact',
    staticAudit.frozen.bathrooms === 2 && staticAudit.frozen.toilets === 2,
    JSON.stringify(staticAudit.frozen));
  check(12, 'classic bedroom furniture has requested spacing and angle',
    staticAudit.bedrooms.classic.chairWardrobe && staticAudit.bedrooms.classic.tableBed
      && staticAudit.bedrooms.classic.tvAngle >= 0.2
      /* z >= 44.5 was the window-corner placement that put the weight set
       * inside the steamer trunk (owner playtest 2026-08-18); it now stands
       * on the same window wall south of the trunk. */
      && staticAudit.bedrooms.classic.weight.x >= 14.5
      && staticAudit.bedrooms.classic.weight.z >= 42.0 && staticAudit.bedrooms.classic.weight.z <= 44.0,
    JSON.stringify(staticAudit.bedrooms.classic));
  check(13, 'Gothic furniture clears and Old Chapel placard is outside',
    staticAudit.bedrooms.gothic.chairWardrobe && staticAudit.bedrooms.gothic.tableBed
      && staticAudit.bedrooms.gothic.clusterWardrobe && placardsGood
      && staticAudit.bedrooms.placards.find(({ id }) => id === 'westFront')?.actualName === 'old-chapel-room-placard',
    JSON.stringify(staticAudit.bedrooms.gothic));
  check(14, 'Lake plant audit excludes the existing ground-floor plant and finds no upstairs occupant',
    staticAudit.bedrooms.lake.plants.length === 0
      && staticAudit.bedrooms.lake.plantVolume.floor === 6
      && staticAudit.bedrooms.lake.plantVolume.ceiling > staticAudit.bedrooms.lake.plantVolume.floor
      && staticAudit.bedrooms.lake.excludedLowerPlants.some(({ name, position, box }) => (
        name === 'plant' && Math.abs(position.y - 1.2) <= 0.001
          && box.max.y < staticAudit.bedrooms.lake.plantVolume.floor
      )),
    JSON.stringify({
      volume: staticAudit.bedrooms.lake.plantVolume,
      occupants: staticAudit.bedrooms.lake.plants,
      excludedLowerPlants: staticAudit.bedrooms.lake.excludedLowerPlants,
    }));
  check(14, 'lake wall decorations and white cross sit flush to actual gallery-north-solid geometry',
    staticAudit.bedrooms.lake.chairCluster && staticAudit.bedrooms.lake.tableCluster
      && staticAudit.bedrooms.lake.plants.length === 0
      && staticAudit.bedrooms.lake.wallMeshes > 0
      && staticAudit.bedrooms.lake.mounts.every(({ wallTargets, penetrates, gap }) => (
        wallTargets > 0 && !penetrates && gap <= 0.005
      ))
      && staticAudit.bedrooms.lake.whiteCross.name === 'lake-white-cross'
      && staticAudit.bedrooms.lake.whiteCross.vertical
      && staticAudit.bedrooms.lake.whiteCross.horizontal
      && staticAudit.bedrooms.lake.whiteCross.connected
      && staticAudit.bedrooms.lake.whiteCross.adjacentIntersections.length === 0,
    JSON.stringify(staticAudit.bedrooms.lake));
  check(14, 'LAKE ROOM placard is outside above the doorway',
    placardsGood && staticAudit.bedrooms.placards.find(({ id }) => id === 'westRear')?.actualName === 'lake-room-placard',
    JSON.stringify(staticAudit.bedrooms.placards.find(({ id }) => id === 'westRear')));
  check(15, 'accepted conference room anchors remain published', staticAudit.frozen.conferenceRoom,
    JSON.stringify(staticAudit.frozen));
  check(16, 'Lou suite has one lowered bar light and no crossing beam',
    staticAudit.suite.barLights === 1 && staticAudit.suite.beams === 0 && staticAudit.suite.lightHeight <= 2.6,
    JSON.stringify(staticAudit.suite));
  check(17, 'balcony railing is continuous from both stair tops',
    staticAudit.balcony.every(({ connected }) => connected), JSON.stringify(staticAudit.balcony));

  check(18, 'cellar pegboard is named, wall-mounted, and carries its tools',
    staticAudit.cellar.pegboard.name === 'cellar-tool-pegboard'
      && staticAudit.cellar.pegboard.wall.name === 'basement-wall-panel-north'
      && staticAudit.cellar.pegboard.wallOverlap.x > 0
      && staticAudit.cellar.pegboard.wallOverlap.y > 0
      && staticAudit.cellar.pegboard.gap >= -0.001
      && Math.abs(staticAudit.cellar.pegboard.gap) <= 0.005
      && staticAudit.cellar.pegboard.tools.length > 0
      && staticAudit.cellar.pegboard.tools.every(({ name, contacts }) => (
        name === 'cellar-pegboard-tool' && contacts
      )),
    JSON.stringify(staticAudit.cellar));
  check(18, 'both cellar wine racks contain complete multi-part bottles',
    staticAudit.cellar.armoryBottles === 18 && staticAudit.cellar.armoryBottleFaults === 0
      && staticAudit.cellar.innocentBottles === 48 && staticAudit.cellar.innocentBottleFaults === 0,
    JSON.stringify(staticAudit.cellar));
  check(18, 'vault art clears actual named cellar structure and the white jamb',
    staticAudit.cellar.vaultMark?.artPiece === 'mansion.vault.mark'
      && staticAudit.cellar.vaultMark?.resolved
      && staticAudit.artResolution.resolvedSlots.includes('mansion.vault.mark')
      && staticAudit.cellar.vaultWallTargets > 0
      && staticAudit.cellar.vaultMinimumWallClearance >= 0.025
      && staticAudit.cellar.vaultJambTargets > 0
      && staticAudit.cellar.vaultJambs.every(({ name }) => name === 'cellar-rooms-case')
      && staticAudit.cellar.vaultJambClearance >= 0.08
      && staticAudit.cellar.vaultRoomInset >= 0.1
      && staticAudit.cellar.vaultVisibleIntersections.length === 0,
    JSON.stringify({
      wallTargets: staticAudit.cellar.vaultWallTargets,
      wallClearances: staticAudit.cellar.vaultWallClearances,
      jambTargets: staticAudit.cellar.vaultJambTargets,
      jambClearance: staticAudit.cellar.vaultJambClearance,
      mark: staticAudit.cellar.vaultMark,
      jambs: staticAudit.cellar.vaultJambs,
      roomInset: staticAudit.cellar.vaultRoomInset,
      visibleIntersections: staticAudit.cellar.vaultVisibleIntersections,
    }));

  const prospect = staticAudit.prospect;
  check(19, 'Prospect wall object is an explicit complete work jacket',
    JSON.stringify(prospect.belongings) === JSON.stringify(['prospect-footlocker', 'prospect-work-jacket', 'prospect-work-boots'])
      && prospect.jacketBody && prospect.jacketSleeves === 2 && prospect.jacketParts.every(Boolean)
      && prospect.jacketConnected && prospect.jacketWallGap <= 0.06,
    JSON.stringify(prospect));
  check(19, 'Prospect boots are character-scaled and floor-seated',
    prospect.bootsSize?.x <= 0.45 && prospect.bootsSize?.y <= 0.3 && prospect.bootsSize?.z <= 0.55
      && Math.abs(prospect.bootsFloorGap) <= 0.01,
    JSON.stringify({ size: prospect.bootsSize, floorGap: prospect.bootsFloorGap }));
  const bust = prospect.bust;
  check(19, 'Prospect bust clears the red pier and all Mansion structure',
    bust.pier && (bust.intersection.x <= 0 || bust.intersection.y <= 0 || bust.intersection.z <= 0)
      && bust.clearance >= bust.minimum && bust.structureOverlaps.length === 0,
    JSON.stringify(bust));
  check(19, 'Prospect bust publishes all three required inspection views',
    JSON.stringify(bust.viewIds) === JSON.stringify(['corridor-east', 'corridor-north', 'doorway']),
    JSON.stringify(bust.viewIds));

  await page.evaluate(() => window.mansion.setRendering(false));

  routeAudit = {};
  const serviceRoute = await page.evaluate(() => {
    const m = window.mansion;
    const { serviceRoad } = m.grounds.props;
    const door = m.grounds.doors.rearService;
    const kitchen = m.interior.rooms.kitchen;
    const doorDepth = Math.abs(door.x1 - door.x0);
    const z = (door.z0 + door.z1) / 2;
    const thresholdX = Math.min(door.x0, kitchen.rect.x1);
    const insideX = thresholdX - doorDepth * 2;
    const oldEarlyX = 16.09;
    return {
      start: [serviceRoad.ramp.x1 + 0.35, 0, z],
      landing: [(serviceRoad.landing.x0 + serviceRoad.landing.x1) / 2, z],
      kitchen: [insideX, z],
      contract: {
        landing: { ...serviceRoad.landing },
        door: { x0: door.x0, x1: door.x1, z0: door.z0, z1: door.z1 },
        doorDepth,
        kitchenRect: { ...kitchen.rect },
        roomFloor: kitchen.floor,
        insideBoundary: thresholdX - doorDepth,
        oldEarlyPoint: {
          x: oldEarlyX,
          z,
          inside: oldEarlyX >= kitchen.rect.x0 && oldEarlyX <= kitchen.rect.x1
            && z >= kitchen.rect.z0 && z <= kitchen.rect.z1,
          floor: m.interior.floorAt(oldEarlyX, z, kitchen.floor),
        },
      },
    };
  });
  await teleport(...serviceRoute.start);
  const toLanding = await walkTo(...serviceRoute.landing, { steps: 36, tolerance: 0.7 });
  const intoKitchen = await walkTo(...serviceRoute.kitchen, {
    steps: 24,
    tolerance: 0.16,
    expectedInteriorFloor: serviceRoute.contract.roomFloor,
  });
  await settle(0.75);
  const kitchenSettled = await mansionState();
  const kitchenFloor = await page.evaluate(() => {
    const m = window.mansion;
    const p = m.player;
    const x = p.position.x;
    const z = p.position.z;
    const feetY = p.position.y - p.eyeHeight;
    const interior = m.interior.floorAt(x, z, feetY);
    const service = m.grounds.props.serviceRoad.groundAt(x, z);
    return {
      sample: { x, z, feetY },
      room: m.interior.rooms.kitchen.floor,
      interior,
      service,
      resolved: interior ?? service ?? 0,
    };
  });
  routeAudit.kitchenService = {
    contract: serviceRoute.contract,
    toLanding,
    intoKitchen,
    settled: kitchenSettled,
    floor: kitchenFloor,
  };
  check(5, 'real Player walks road → stair → landing → kitchen',
    toLanding.ok && intoKitchen.ok
      && toLanding.state.x >= serviceRoute.contract.landing.x0
      && toLanding.state.x <= serviceRoute.contract.landing.x1
      && toLanding.state.z >= serviceRoute.contract.landing.z0
      && toLanding.state.z <= serviceRoute.contract.landing.z1
      && Math.abs(toLanding.state.ground - serviceRoute.contract.roomFloor) <= 0.01
      && serviceRoute.contract.oldEarlyPoint.inside === false
      && serviceRoute.contract.oldEarlyPoint.floor === null
      && intoKitchen.state.x <= serviceRoute.contract.insideBoundary
      && intoKitchen.state.x >= serviceRoute.contract.kitchenRect.x0
      && intoKitchen.state.z >= serviceRoute.contract.kitchenRect.z0
      && intoKitchen.state.z <= serviceRoute.contract.kitchenRect.z1
      && Math.abs(kitchenFloor.room - 1.2) <= 1e-9
      && Math.abs(kitchenFloor.interior - kitchenFloor.room) <= 1e-9
      && Math.abs(kitchenFloor.resolved - kitchenFloor.room) <= 1e-9
      && Math.abs(kitchenSettled.ground - kitchenFloor.resolved) <= 0.01
      && Math.abs(kitchenSettled.y - kitchenFloor.resolved) <= 0.02,
    JSON.stringify(routeAudit.kitchenService));

  const gardenRoute = await page.evaluate(() => {
    const gate = window.mansion.grounds.props.rearGarden.roseGarden.gate;
    return { start: [gate.x + 4.6, 0, gate.z], end: [gate.x - 0.8, gate.z] };
  });
  await teleport(...gardenRoute.start);
  routeAudit.gardenArch = await walkTo(...gardenRoute.end, { steps: 32, tolerance: 0.75 });
  check(6, 'real Player walks through the garden arch', routeAudit.gardenArch.ok,
    JSON.stringify(routeAudit.gardenArch));

  const trophyRoute = await page.evaluate(() => {
    const entrance = window.mansion.grounds.props.trophyEntrance;
    const middle = entrance.arches[1];
    return {
      start: [entrance.x1 + 1.2, 1.2, (middle.z0 + middle.z1) / 2],
      end: [entrance.x0 - 1.0, (middle.z0 + middle.z1) / 2],
    };
  });
  await teleport(...trophyRoute.start);
  routeAudit.trophyEntrance = await walkTo(...trophyRoute.end, { steps: 24, tolerance: 0.75 });
  check(8, 'real Player walks through the widened trophy entrance', routeAudit.trophyEntrance.ok,
    JSON.stringify(routeAudit.trophyEntrance));

  guardAudit = await page.evaluate(() => {
    const m = window.mansion;
    const ids = ['patrol0', 'patrol1', 'patrol2'];
    const traces = Object.fromEntries(ids.map((id) => [id, []]));
    const collisions = [];
    for (let sample = 0; sample <= 45; sample++) {
      const people = m.cast.people;
      for (const id of ids) traces[id].push({ ...people[id] });
      collisions.push(...m.cast.inSolid.filter((line) => ids.some((id) => line.startsWith(id))));
      if (sample < 45) m.tick(4);
    }
    const travelled = Object.fromEntries(ids.map((id) => {
      const trace = traces[id];
      let total = 0;
      for (let i = 1; i < trace.length; i++) {
        total += Math.hypot(trace[i].x - trace[i - 1].x, trace[i].z - trace[i - 1].z);
      }
      return [id, total];
    }));
    return { seconds: 180, traces, travelled, collisions: [...new Set(collisions)] };
  });
  check(1, 'front patrols run for three simulated minutes without entering solids',
    guardAudit.seconds === 180 && guardAudit.collisions.length === 0
      && Object.values(guardAudit.travelled).every((distance) => distance >= 30),
    JSON.stringify({ travelled: guardAudit.travelled, collisions: guardAudit.collisions }));

  performerAudit = await page.evaluate(() => {
    const m = window.mansion;
    const T = m.THREE;
    const swimmer = [];
    for (let frame = 0; frame < 60 * 12; frame++) {
      m.tick(1 / 60);
      if (frame % 15 === 0) {
        const composition = m.cast.evening.poolComposition;
        swimmer.push({ ...composition.find(({ id }) => id === 'poolPerformer2') });
      }
    }

    const chairMeshes = (chair) => {
      const meshes = [];
      chair?.traverse?.((mesh) => {
        if (!mesh.isMesh || !mesh.visible) return;
        let inBack = false;
        for (let at = mesh.parent; at && at !== chair; at = at.parent) {
          if (at.name === 'pool-lounger-back') inBack = true;
        }
        const fixture = inBack ? 'back'
          : Math.abs(mesh.position.y - 0.465) < 0.012 ? 'cushion' : 'frame';
        meshes.push({ mesh, fixture });
      });
      return meshes;
    };
    const legReports = [0, 1].map((index) => {
      const rig = m.cast.poolPerformerRig(index);
      const expectedChair = m.grounds.props.poolPatio.chairs[index === 0 ? 4 : 6];
      const counts = {};
      const hits = [];
      rig?.target?.updateMatrixWorld?.(true);
      rig?.chair?.updateMatrixWorld?.(true);
      for (const side of ['left', 'right']) {
        counts[side] = {};
        for (const part of ['thigh', 'shin', 'foot']) {
          const limbs = rig?.legs?.[side]?.[part] ?? [];
          counts[side][part] = limbs.length;
          for (const limb of limbs) {
            const limbBox = new T.Box3().setFromObject(limb);
            for (const fixture of chairMeshes(rig?.chair)) {
              const fixtureBox = new T.Box3().setFromObject(fixture.mesh);
              const overlap = limbBox.clone().intersect(fixtureBox);
              if (overlap.isEmpty()) continue;
              const overlapSize = overlap.getSize(new T.Vector3());
              const penetration = Math.min(overlapSize.x, overlapSize.y, overlapSize.z);
              if (penetration <= 1e-6) continue;
              hits.push({
                side,
                part,
                fixture: fixture.fixture,
                mesh: limb.name || '(unnamed)',
                penetration: +penetration.toFixed(4),
                overlap: {
                  x: +overlapSize.x.toFixed(4),
                  y: +overlapSize.y.toFixed(4),
                  z: +overlapSize.z.toFixed(4),
                },
              });
            }
          }
        }
      }
      return {
        id: `poolPerformer${index}`,
        published: Boolean(rig?.target && rig?.chair),
        actualChair: rig?.chair === expectedChair,
        counts,
        hits: hits.sort((a, b) => b.penetration - a.penetration),
        violations: hits.filter(({ penetration }) => penetration > 0.012),
      };
    });
    return {
      swimmer,
      legReports,
      pool: { ...m.poolRect },
      composition: m.cast.evening.poolComposition,
    };
  });
  const swimmerXs = performerAudit.swimmer.map(({ x }) => x);
  const swimmerYs = performerAudit.swimmer.map(({ y }) => y);
  const swimmerZs = performerAudit.swimmer.map(({ z }) => z);
  const swimmerComposition = performerAudit.composition.find(({ id }) => id === 'poolPerformer2');
  check(3, 'pool NPC visibly treads, bobs, and drifts inside the water',
    swimmerComposition?.motion === 'treading'
      && Math.max(...swimmerYs) - Math.min(...swimmerYs) >= 0.04
      && (Math.max(...swimmerXs) - Math.min(...swimmerXs) >= 0.12
        || Math.max(...swimmerZs) - Math.min(...swimmerZs) >= 0.12)
      && Math.min(...swimmerXs) > performerAudit.pool.x0 + 0.35
      && Math.max(...swimmerXs) < performerAudit.pool.x1 - 0.35
      && Math.min(...swimmerZs) > performerAudit.pool.z0 + 0.35
      && Math.max(...swimmerZs) < performerAudit.pool.z1 - 0.35,
    JSON.stringify({ composition: swimmerComposition, x: [Math.min(...swimmerXs), Math.max(...swimmerXs)], y: [Math.min(...swimmerYs), Math.max(...swimmerYs)], z: [Math.min(...swimmerZs), Math.max(...swimmerZs)] }));
  check(3, 'both pool recliners expose visible thigh/shin/foot meshes clear of their actual loungers',
    performerAudit.legReports.length === 2 && performerAudit.legReports.every((report) => (
      report.published && report.actualChair && report.violations.length === 0
      && ['left', 'right'].every((side) => (
        ['thigh', 'shin', 'foot'].every((part) => report.counts[side][part] > 0)
      ))
    )),
    JSON.stringify(performerAudit.legReports));

  const interactionPose = await findInteractionPose('poolPerformer1');
  dressAudit = { interactionPose };
  if (interactionPose) {
    dressAudit.before = await page.evaluate(() => {
      const target = window.mansion.cast.poolPerformerRig(1)?.target;
      return target ? {
        position: { x: target.position.x, y: target.position.y, z: target.position.z },
        yaw: target.rotation.y,
      } : null;
    });
    for (let step = 0; step < 3; step++) {
      await page.keyboard.press('KeyE');
      await settle(step < 2 ? 8 : 0.2);
    }
    dressAudit.active = await page.evaluate(() => {
      const m = window.mansion;
      const secondDress = m.cast.evening.secondDress;
      const marker = secondDress.focus?.marker;
      const target = m.cast.poolPerformerRig(1)?.target;
      const feetY = marker ? marker.y - m.player.eyeHeight : NaN;
      const radius = 0.32;
      const blocking = marker ? m.colliders.filter((box) => (
        box.max.y > feetY + 0.08 && box.min.y < marker.y + 0.08
        && box.max.x > marker.x - radius && box.min.x < marker.x + radius
        && box.max.z > marker.z - radius && box.min.z < marker.z + radius
      )).map((box) => ({
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z },
      })) : [{ error: 'missing marker' }];
      return {
        active: secondDress.active,
        focus: secondDress.focus,
        actorStaging: secondDress.actorStaging,
        playerEnabled: m.player.enabled,
        interactionPaused: m.interaction.paused,
        blocking,
        performer: target ? {
          position: { x: target.position.x, y: target.position.y, z: target.position.z },
          yaw: target.rotation.y,
        } : null,
      };
    });
    await page.keyboard.press('KeyQ');
    await settle(0.2);
    dressAudit.abandoned = await page.evaluate(() => {
      const m = window.mansion;
      const target = m.cast.poolPerformerRig(1)?.target;
      return {
        active: m.cast.evening.secondDress.active,
        playerEnabled: m.player.enabled,
        interactionPaused: m.interaction.paused,
        performer: target ? {
          position: { x: target.position.x, y: target.position.y, z: target.position.z },
          yaw: target.rotation.y,
        } : null,
      };
    });
    await page.keyboard.press('KeyE');
    await settle(0.2);
    dressAudit.restarted = await page.evaluate(() => ({
      active: window.mansion.cast.evening.secondDress.active,
      focus: window.mansion.cast.evening.secondDress.focus,
      actorStaging: window.mansion.cast.evening.secondDress.actorStaging,
    }));
    for (let hit = 0; hit < 7; hit++) {
      await page.evaluate(() => window.mansion.cast.setSecondPoolDressTarget(true));
      await page.keyboard.press('KeyE');
      await settle(0.08);
    }
    dressAudit.done = await page.evaluate(() => ({
      active: window.mansion.cast.evening.secondDress.active,
      helped: window.mansion.cast.evening.secondDressHelped,
      hits: window.mansion.cast.evening.secondDress.hits,
      focus: window.mansion.cast.evening.secondDress.focus,
      actorStaging: window.mansion.cast.evening.secondDress.actorStaging,
      playerEnabled: window.mansion.player.enabled,
      interactionPaused: window.mansion.interaction.paused,
      performer: (() => {
        const target = window.mansion.cast.poolPerformerRig(1)?.target;
        return target ? {
          position: { x: target.position.x, y: target.position.y, z: target.position.z },
          yaw: target.rotation.y,
        } : null;
      })(),
    }));
  }
  const transformRestored = (state) => {
    const before = dressAudit.before;
    const after = state?.performer;
    if (!before || !after) return false;
    const distance = Math.hypot(
      after.position.x - before.position.x,
      after.position.y - before.position.y,
      after.position.z - before.position.z,
    );
    const yawError = Math.abs(Math.atan2(
      Math.sin(after.yaw - before.yaw), Math.cos(after.yaw - before.yaw),
    ));
    return distance < 1e-9 && yawError < 1e-9;
  };
  const stagedDistance = dressAudit.before && dressAudit.active?.performer
    ? Math.hypot(
      dressAudit.active.performer.position.x - dressAudit.before.position.x,
      dressAudit.active.performer.position.y - dressAudit.before.position.y,
      dressAudit.active.performer.position.z - dressAudit.before.position.z,
    ) : 0;
  check(3, 'real InteractionSystem E enters the shared dress-focus lifecycle',
    dressAudit.interactionPose && dressAudit.active?.active
      && dressAudit.active.focus?.active
      && dressAudit.active.focus?.markerDistance < 1e-9
      && dressAudit.active.focus?.targetDistance > 0.5
      && dressAudit.active.focus?.targetDistance < 2.5
      && dressAudit.active.actorStaging?.active
      && dressAudit.active.actorStaging?.markerDistance < 1e-9
      && dressAudit.active.actorStaging?.yawError < 1e-9
      && dressAudit.active.blocking?.length === 0
      && stagedDistance > 0.05
      && dressAudit.active.playerEnabled === false && dressAudit.active.interactionPaused === true,
    JSON.stringify(dressAudit));
  check(3, 'real Q restores the performer and one real E restarts the shared lifecycle',
    !dressAudit.abandoned?.active && dressAudit.abandoned?.playerEnabled === true
      && dressAudit.abandoned?.interactionPaused === false && transformRestored(dressAudit.abandoned)
      && dressAudit.restarted?.active && dressAudit.restarted?.focus?.active
      && dressAudit.restarted?.actorStaging?.active,
    JSON.stringify({ abandoned: dressAudit.abandoned, restarted: dressAudit.restarted }));
  check(3, 'seven direct real E pulls finish and restore player, interaction, and performer',
    dressAudit.done?.hits === 7 && dressAudit.done?.helped && !dressAudit.done?.active
      && !dressAudit.done?.focus?.active && dressAudit.done?.playerEnabled === true
      && dressAudit.done?.interactionPaused === false
      && !dressAudit.done?.actorStaging?.active && transformRestored(dressAudit.done),
    JSON.stringify(dressAudit.done ?? null));

  speechAudit = await page.evaluate(() => {
    const m = window.mansion;
    const T = m.THREE;
    const ids = ['rippin', 'eric', 'sauce'];
    const speakers = {};
    const boxData = (box) => ({
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    });
    const segmentCrossesBox = (from, to, box, padding = 0.24) => {
      const delta = {
        x: to.x - from.x,
        y: to.y - from.y,
        z: to.z - from.z,
      };
      const length = Math.hypot(delta.x, delta.y, delta.z);
      if (length <= 1e-8) return false;
      let enter = Math.min(0.49, Math.max(0, padding) / length);
      let leave = 1 - enter;
      for (const axis of ['x', 'y', 'z']) {
        const origin = from[axis];
        const direction = delta[axis];
        const min = Math.min(box.min[axis], box.max[axis]);
        const max = Math.max(box.min[axis], box.max[axis]);
        if (Math.abs(direction) <= 1e-8) {
          if (origin < min || origin > max) return false;
          continue;
        }
        let a = (min - origin) / direction;
        let b = (max - origin) / direction;
        if (a > b) [a, b] = [b, a];
        enter = Math.max(enter, a);
        leave = Math.min(leave, b);
        if (enter > leave) return false;
      }
      return enter <= leave;
    };
    const standingClear = (x, floor, z) => !m.colliders.some((box) => (
      floor + 1.55 >= box.min.y && floor + 0.05 <= box.max.y
      && x >= box.min.x - 0.28 && x <= box.max.x + 0.28
      && z >= box.min.z - 0.28 && z <= box.max.z + 0.28
    ));
    const placeListener = (id, speaker, x, z) => {
      const floor = m.interior.floorAt(x, z, speaker.y);
      if (floor === null || Math.abs(floor - speaker.y) > 2.4 || !standingClear(x, floor, z)) return null;
      m.teleport(x, floor, z, 0);
      const listener = {
        x: m.player.position.x,
        y: m.player.position.y - m.player.eyeHeight,
        z: m.player.position.z,
      };
      return { listener, floor, result: m.npcSpeech.physical(id) };
    };
    const blockingCollider = (listener, speaker) => {
      const from = { x: listener.x, y: listener.y + 1.42, z: listener.z };
      const to = { x: speaker.x, y: speaker.y + 1.42, z: speaker.z };
      const index = m.colliders.findIndex((box) => segmentCrossesBox(from, to, box));
      if (index < 0) return null;
      const box = m.colliders[index];
      const sources = [
        ['grounds', m.grounds.colliders],
        ['interior', m.interior.colliders],
        ['lab', m.labColliders],
        ['cast', m.castColliders],
      ].map(([scope, list]) => ({ scope, index: Array.isArray(list) ? list.indexOf(box) : -1 }))
        .filter(({ index: localIndex }) => localIndex >= 0);
      const meshMatches = [];
      m.scene.traverse((object) => {
        if (!object.isMesh || !object.visible || !object.name) return;
        const meshBox = new T.Box3().setFromObject(object);
        if (!meshBox.intersectsBox(box)) return;
        const overlap = meshBox.clone().intersect(box).getSize(new T.Vector3());
        if (overlap.x <= 1e-5 || overlap.y <= 1e-5 || overlap.z <= 1e-5) return;
        const extentDelta = ['x', 'y', 'z'].reduce((total, axis) => (
          total + Math.abs(meshBox.min[axis] - box.min[axis]) + Math.abs(meshBox.max[axis] - box.max[axis])
        ), 0);
        meshMatches.push({ name: object.name, box: boxData(meshBox), extentDelta });
      });
      meshMatches.sort((a, b) => a.extentDelta - b.extentDelta);
      return { index, box: boxData(box), sources, meshMatches: meshMatches.slice(0, 6) };
    };

    let occluded = null;
    for (const id of ids) {
      const speaker = m.npcSpeech.speaker(id);
      if (!speaker) {
        speakers[id] = { speaker: null, near: null, far: null, floor: null };
        continue;
      }
      let near = null;
      for (const radius of [0.9, 1.5, 2.2, 2.9]) {
        for (let i = 0; i < 32; i++) {
          const angle = (i / 32) * Math.PI * 2;
          const sample = placeListener(
            id,
            speaker,
            speaker.x + Math.cos(angle) * radius,
            speaker.z + Math.sin(angle) * radius,
          );
          if (sample?.result.allowed) { near = { radius, angle, ...sample }; break; }
        }
        if (near) break;
      }
      m.teleport(speaker.x + 24, speaker.y, speaker.z, 0);
      const far = m.npcSpeech.physical(id);
      m.teleport(speaker.x, speaker.y + 6, speaker.z, 0);
      const floor = m.npcSpeech.physical(id);
      speakers[id] = { speaker, near, far, floor };
    }

    for (const id of ids) {
      if (occluded) break;
      const speaker = speakers[id]?.speaker;
      if (!speaker) continue;
      for (let radius = 0.8; radius <= 4.8 + 1e-9 && !occluded; radius += 0.2) {
        for (let i = 0; i < 96; i++) {
          const angle = (i / 96) * Math.PI * 2;
          const sample = placeListener(
            id,
            speaker,
            speaker.x + Math.cos(angle) * radius,
            speaker.z + Math.sin(angle) * radius,
          );
          if (sample?.result.reason !== 'occluded') continue;
          const blocker = blockingCollider(sample.listener, speaker);
          if (!blocker) continue;
          occluded = { id, radius, angle, speaker, ...sample, blocker };
          break;
        }
      }
    }
    const authored = m.cast.ambientSpeakers ?? null;
    let cooldown = null;
    for (const id of ids) {
      const data = speakers[id];
      if (!data?.near) continue;
      const { listener } = data.near;
      m.teleport(listener.x, listener.y, listener.z, 0);
      m.tick(2.0);
      const remaining = m.npcSpeech.remaining(id);
      if (remaining > 0) { cooldown = { id, remaining, heard: m.npcSpeech.heard(id) }; break; }
    }
    return { speakers, occluded, cooldown, authored };
  });
  const requiredSpeakers = Object.values(speechAudit.speakers);
  check(2, 'all required proximity speakers publish real body positions',
    requiredSpeakers.every(({ speaker }) => speaker), JSON.stringify(speechAudit.speakers));
  check(2, 'required speakers are nearby-only and floor-aware',
    requiredSpeakers.every(({ speaker, near, far, floor }) => speaker && near?.result?.allowed
      && far?.reason === 'distance' && floor?.reason === 'floor'),
    JSON.stringify(speechAudit.speakers));
  check(2, 'actual Mansion geometry can occlude a nearby speaker',
    speechAudit.occluded?.result?.reason === 'occluded'
      && speechAudit.occluded.result.distance <= 5
      && speechAudit.occluded.result.vertical <= 2.4
      && Math.abs(speechAudit.occluded.listener.y - speechAudit.occluded.floor) <= 1e-9
      && speechAudit.occluded.blocker?.index >= 0
      && speechAudit.occluded.blocker?.box
      && speechAudit.occluded.blocker.sources?.length > 0,
    JSON.stringify(speechAudit.occluded));
  check(2, 'a real nearby bark commits the shared cooldown',
    speechAudit.cooldown?.heard === true && speechAudit.cooldown?.remaining > 0,
    JSON.stringify(speechAudit.cooldown));

  const authoredFor = (id) => {
    const source = speechAudit.authored;
    if (!source) return null;
    const value = Array.isArray(source)
      ? source.find((entry) => entry?.id === id || entry?.speaker === id)
      : source[id];
    if (!value) return null;
    if (Array.isArray(value)) return value.length;
    if (Array.isArray(value.cues)) return value.cues.length;
    if (Array.isArray(value.lines)) return value.lines.length;
    if (Number.isFinite(value.count)) return value.count;
    return 0;
  };
  const ambientIds = ['sauce', 'eric'];
  const ambientLedger = Array.isArray(speechAudit.authored) ? speechAudit.authored : [];
  const voiceCounts = Object.fromEntries(ambientIds.map((id) => [id, authoredFor(id)]));
  check(20, 'Sauce and Eric publish authored Mansion ambient cue coverage',
    Object.values(voiceCounts).every((count) => Number.isFinite(count) && count > 0),
    JSON.stringify({ voiceCounts, authored: speechAudit.authored }));
  check(20, 'Sauce and Eric are the complete present real-character ambient ledger',
    ambientLedger.length === ambientIds.length
      && new Set(ambientLedger.map(({ id }) => id)).size === ambientIds.length
      && ambientIds.every((id) => {
        const entry = ambientLedger.find((candidate) => candidate?.id === id);
        return entry?.present === true && Array.isArray(entry.cues)
          && entry.cues.length > 0 && entry.count === entry.cues.length;
      }), JSON.stringify(ambientLedger));
  check(20, 'Sauce and Eric use the same proximity policy',
    ambientIds.every((id) => {
      const entry = speechAudit.speakers[id];
      return entry?.near?.result?.allowed && entry?.far?.reason === 'distance' && entry?.floor?.reason === 'floor';
    }), JSON.stringify(speechAudit.speakers));

  const beforeFinalFrame = await page.evaluate(() => window.mansion.framesRendered);
  await page.evaluate(() => window.mansion.setRendering(true));
  await page.waitForFunction((frames) => window.mansion.framesRendered >= frames + 3, beforeFinalFrame, {
    timeout: 180000,
  });
  finalGl = await page.evaluate(() => {
    const gl = window.mansion.renderer.getContext();
    return {
      contextLost: gl.isContextLost(),
      error: gl.getError(),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      losses: [...(window.__mansionQaWebglLosses ?? [])],
      frames: window.mansion.framesRendered,
    };
  });
  check(21, 'WebGL remains healthy after the full simulated walkthrough',
    !finalGl.contextLost && finalGl.error === 0 && finalGl.losses.length === 0
      && finalGl.drawingBuffer.every((value) => value > 0), JSON.stringify(finalGl));
  check(21, 'no page errors, console errors, failed requests, or HTTP errors occurred',
    pageErrors.length === 0 && consoleErrors.length === 0
      && failedRequests.length === 0 && httpErrors.length === 0,
    JSON.stringify({ pageErrors, consoleErrors, failedRequests, httpErrors }));

  const repeatedBlockers = [
    results.find(({ name }) => name.startsWith('vault art clears')),
    results.find(({ name }) => name.startsWith('Prospect bust clears')),
    results.find(({ name }) => name.startsWith('Great Includer handles')),
    results.find(({ name }) => name.startsWith('all hall-case trophies')),
    results.find(({ name }) => name.startsWith('lake wall decorations')),
    results.find(({ name }) => name.startsWith('front guard routes')),
    results.find(({ name }) => name.startsWith('every winter-garden planter Box3')),
  ];
  check(21, 'all seven repeatedly reported blockers have explicit green geometry proof',
    repeatedBlockers.length === 7 && repeatedBlockers.every((result) => result?.ok),
    JSON.stringify(repeatedBlockers.map((result) => ({ name: result?.name, ok: result?.ok }))));
} finally {
  const sectionSummary = MANSION_WALKTHROUGH_COVERAGE.map((entry) => {
    const sectionResults = results.filter(({ section }) => section === entry.section);
    return {
      ...entry,
      availableViews: entry.views.filter((id) => MANSION_WALKTHROUGH_VIEWS.some((view) => view.id === id)),
      assertions: sectionResults.length,
      passed: sectionResults.filter(({ ok }) => ok === true).length,
      blocked: sectionResults.filter(({ status }) => status === 'content-blocked')
        .map(({ name, detail }) => ({ name, detail })),
      failed: sectionResults.filter(({ ok }) => ok === false).map(({ name, detail }) => ({ name, detail })),
    };
  });
  const report = {
    label: LABEL,
    url: `${base}/mansion.html?preview=1`,
    external: Boolean(EXTERNAL_BASE),
    generatedAt: new Date().toISOString(),
    coverage: sectionSummary,
    results,
    boot,
    finalGl,
    pageErrors,
    consoleErrors,
    failedRequests,
    httpErrors,
    audits: { static: staticAudit, routes: routeAudit, guards: guardAudit, speech: speechAudit, performers: performerAudit, dress: dressAudit },
  };
  await fsp.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter(({ ok }) => ok === false);
const contentBlocked = results.filter(({ status }) => status === 'content-blocked');
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Mansion walkthrough checks failed.`);
  process.exit(1);
}
console.log(`\n${results.length - contentBlocked.length}/${results.length} Mansion walkthrough checks passed; ${contentBlocked.length} explicitly content-blocked.`);
