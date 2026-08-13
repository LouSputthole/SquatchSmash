#!/usr/bin/env node
/** Focused original-resolution geometry walkthrough for NO WAKE. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rayHitContractError } from './no-wake-evidence-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54964;
const OUT = process.env.NO_WAKE_GEOMETRY_OUT
  ? path.resolve(ROOT, process.env.NO_WAKE_GEOMETRY_OUT)
  : path.join(ROOT, 'docs', 'validation', '2026-08-11', 'no-wake-geometry-walkthrough');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg',
};

const { chromium } = await import('playwright');
await fsp.mkdir(OUT, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found'); return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(await fsp.readFile(file));
  } catch (error) {
    res.writeHead(500).end(error.message);
  }
});

let browser;
const errors = [];
const evidence = {
  generatedAt: new Date().toISOString(), port: PORT, viewport: [1600, 900],
  frames: {}, measurements: {}, errors,
};

async function startPage(page, checkpoint) {
  await page.goto(`http://127.0.0.1:${PORT}/nowake.html?preview=1&checkpoint=${checkpoint}`, {
    waitUntil: 'load', timeout: 180000,
  });
  await page.waitForFunction(() => window.NO_WAKE?.story, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__noWakeGeometryContextLosses = 0;
    document.querySelector('canvas')?.addEventListener('webglcontextlost', () => {
      window.__noWakeGeometryContextLosses++;
    });
    window.NO_WAKE.postfx?.disable?.();
  });
  const start = await page.evaluate(() => {
    const rect = document.getElementById('start-btn').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.click(start.x, start.y);
  await page.waitForFunction(() => !document.getElementById('overlay'), null, { timeout: 300000 });
  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForTimeout(250);
}

async function installViewHelpers(page) {
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const aim = (target) => {
      const delta = target.clone().sub(game.player.camera.position);
      game.player.yaw = Math.atan2(-delta.x, -delta.z);
      game.player.pitch = Math.asin(delta.y / delta.length());
      game.player.update(1 / 60);
      game.player.camera.updateMatrixWorld(true);
      game.scene.updateMatrixWorld(true);
    };
    window.__noWakeWorldView = (from, target) => {
      game.player.clearKeys();
      game.player.enabled = false;
      game.player.position.set(...from);
      game.player.update(1 / 60);
      aim(new V(...target));
    };
    window.__noWakeBoatView = (from, target) => {
      game.player.clearKeys();
      game.player.enabled = false;
      game.player.position.copy(game.world.fromBoatLocal(new V(...from)));
      game.player.update(1 / 60);
      aim(game.world.fromBoatLocal(new V(...target)));
    };
    window.__noWakeCabinView = (from, target) => {
      game.world.setBelow(true);
      game.player.mode = 'walk';
      game.player.enabled = true;
      game.player.clearKeys();
      game.player.velocity.set(0, 0, 0);
      game.player.ground = game.boat.root.position.y + game.boat.cabinDeck.height;
      game.player.position.copy(game.world.fromBoatLocal(
        new V(from[0], game.boat.cabinDeck.height + game.player.eyeHeight, from[1]),
      ));
      game.player.update(1 / 60);
      const actual = game.world.toBoatLocal(game.player.position.clone());
      aim(game.world.fromBoatLocal(new V(...target)));
      return {
        requested: from,
        actual: [actual.x, actual.z],
        displacement: Math.hypot(actual.x - from[0], actual.z - from[1]),
      };
    };
  });
}

async function capture(page, name, note, expectedCentreRay = null, extraRayExpectations = []) {
  await page.waitForTimeout(450);
  const centreExpectation = typeof expectedCentreRay === 'string'
    ? { pattern: expectedCentreRay }
    : (expectedCentreRay ?? {});
  const expectations = [
    { label: 'centre', ndc: [0, 0], ...centreExpectation },
    ...extraRayExpectations,
  ];
  const rays = await page.evaluate((samples) => {
    const game = window.NO_WAKE;
    // Refresh the same visible-hull inverse the production RAF owns before
    // asking the public CPU twin which water fragments the shader discards.
    game.world.update(game.physics.time, 0);
    game.player.camera.updateMatrixWorld(true);
    game.scene.updateMatrixWorld(true);
    const caster = game.interaction.raycaster;
    const previousFar = caster.far;
    caster.far = 2000;
    const effectivelyVisible = (object) => {
      for (let current = object; current; current = current.parent) {
        if (!current.visible) return false;
      }
      return true;
    };
    const result = samples.map(({ label, ndc }) => {
      caster.setFromCamera({ x: ndc[0], y: ndc[1] }, game.player.camera);
      const hits = caster.intersectObjects(game.scene.children, true)
        // Child meshes under a hidden group are raycastable but not rendered.
        .filter((hit) => effectivelyVisible(hit.object) && hit.object.material?.opacity !== 0)
        // The sea is one full plane whose hull-shaped hole is discarded in the
        // production shader. Raycaster cannot see that fragment discard, so use
        // the matching public CPU predicate for this exact water hit before
        // deciding which surface is actually rendered at the sampled pixel.
        .filter((hit) => hit.object.name !== 'open water surface'
          || !game.world.water.excludes(hit.point))
        .slice(0, 6)
        .map((hit) => {
          let owner = hit.object;
          while (owner && !owner.userData?.characterId) owner = owner.parent;
          return {
            name: hit.object.name,
            characterId: owner?.userData?.characterId ?? null,
            distance: Number(hit.distance.toFixed(4)),
          };
        });
      return { label, ndc, hits };
    });
    caster.far = previousFar;
    return result;
  }, expectations.map(({ label, ndc }) => ({ label, ndc })));
  for (let i = 0; i < expectations.length; i++) {
    const expected = expectations[i];
    const actualHit = rays[i]?.hits[0];
    const failure = rayHitContractError(expected, actualHit);
    if (failure) throw new Error(`${name}: ${expected.label} ray ${failure}`);
  }
  const file = path.join(OUT, name);
  await page.screenshot({ path: file });
  evidence.frames[name] = { note, centreRay: rays[0]?.hits ?? [], rays };
  console.log(`CAPTURE ${name}`);
}

async function legalCabinView(page, from, target) {
  const result = await page.evaluate(({ from: pose, target: aim }) => (
    window.__noWakeCabinView(pose, aim)
  ), { from, target });
  if (result.displacement > .025) {
    throw new Error(`cabin evidence pose ${from} resolved to ${result.actual}`);
  }
  return result;
}

async function dockMeasurements(page) {
  return page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const Box3 = game.world.colliders[0].constructor;
    game.scene.updateMatrixWorld(true);
    const namedBox = (name) => {
      const object = game.scene.getObjectByName(name);
      const box = new Box3().setFromObject(object);
      return { name, min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new V()).toArray() };
    };
    const finger = namedBox('finger dock deck');
    const plank = namedBox('finger dock plank 1');
    const cart = game.scene.getObjectByName('dock cart');
    const cartBox = new Box3().setFromObject(cart);
    const wheels = [];
    cart.traverse((object) => {
      if (!/^dock cart wheel/.test(object.name)) return;
      const box = new Box3().setFromObject(object);
      wheels.push({ name: object.name, minY: box.min.y, maxY: box.max.y });
    });
    const pedestals = [];
    for (let i = 1; i <= 3; i++) {
      const body = namedBox(`shore-power body ${i}`);
      pedestals.push({ name: body.name, bottomY: body.min[1], floatAbovePlank: body.min[1] - plank.max[1] });
    }
    const cartCentre = cartBox.getCenter(new V());
    const cartCollider = game.world.marina.colliders.find(
      (box) => box.containsPoint(cartCentre) || box.intersectsBox(cartBox),
    );
    const laneWidth = finger.max[0] - .30 - (cartCollider.max.x + .30);
    const trim = {};
    for (const name of [
      'burgundy sheer stripe starboard', 'burgundy accent stripe starboard',
      'rub strip starboard', 'gunwale cap starboard',
    ]) {
      const object = game.boat.root.getObjectByName(name);
      const supportY = object.userData.hullTrim.supportY;
      const stationMetrics = [];
      const positions = object.geometry.getAttribute('position');
      const byZ = new Map();
      for (let i = 0; i < positions.count; i++) {
        const point = new V().fromBufferAttribute(positions, i);
        const key = point.z.toFixed(5);
        if (!byZ.has(key)) byZ.set(key, []);
        byZ.get(key).push(Math.abs(point.x));
      }
      for (const [zKey, radial] of byZ) {
        const z = Number(zKey);
        const sections = game.world.water.exclusion.sections;
        let width = 0;
        for (let i = 0; i < sections.length - 1; i++) {
          const a = sections[i]; const b = sections[i + 1];
          if (z < a.z || z > b.z) continue;
          width = a.w + (b.w - a.w) * ((z - a.z) / (b.z - a.z));
        }
        const { keelY, chineY, sheerY } = game.world.water.exclusion;
        const vertical = supportY <= chineY
          ? .84 * (supportY - keelY) / (chineY - keelY)
          : .84 + .16 * ((supportY - chineY) / (sheerY - chineY));
        const skin = width * vertical;
        stationMetrics.push({
          z, innerSupportGap: Math.min(...radial) - skin,
          outerProud: Math.max(...radial) - skin,
        });
      }
      trim[name] = { supportY, stations: stationMetrics };
    }
    return {
      finger, plank,
      cart: {
        min: cartBox.min.toArray(), max: cartBox.max.toArray(), laneWidth,
        colliderContainsVisible: cartCollider.containsBox(cartBox),
        wheels: wheels.map((wheel) => ({
          ...wheel,
          burialBelowPlank: plank.max[1] - wheel.minY,
        })),
      },
      pedestals,
      hull: namedBox('cream fiberglass hull'),
      waterline: game.boat.root.userData.waterline,
      trim,
    };
  });
}

async function realDockRoute(page) {
  return page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const Box3 = game.world.colliders[0].constructor;
    const player = game.player;
    const fingerBox = new Box3().setFromObject(game.world.marina.root.getObjectByName('finger dock deck'));
    const cart = game.world.marina.root.getObjectByName('dock cart');
    const cartBox = new Box3().setFromObject(cart);
    const cartCentre = cartBox.getCenter(new V());
    const collider = game.world.marina.colliders.find(
      (box) => box.containsPoint(cartCentre) || box.intersectsBox(cartBox),
    );
    const laneMinX = collider.max.x + .30;
    const laneMaxX = fingerBox.max.x - .30;
    const laneX = (laneMinX + laneMaxX) / 2;
    player.mode = 'walk'; player.enabled = true; player.clearKeys(); player.velocity.set(0, 0, 0);
    player.ground = .20; player.position.set(laneX, 1.86, 20); player.yaw = 0; player.pitch = 0;
    player.setKey('KeyW', true);
    let closest = Infinity; let frames = 0;
    while (frames < 2400 && player.position.z > -17.5) {
      player.update(1 / 60);
      const cx = Math.max(collider.min.x, Math.min(collider.max.x, player.position.x));
      const cz = Math.max(collider.min.z, Math.min(collider.max.z, player.position.z));
      closest = Math.min(closest, Math.hypot(player.position.x - cx, player.position.z - cz));
      frames++;
    }
    player.setKey('KeyW', false);
    const end = player.position.toArray();
    const target = new V(laneX, .58, -12.8);
    const delta = target.sub(player.camera.position);
    player.yaw = Math.atan2(-delta.x, -delta.z);
    player.pitch = Math.asin(delta.y / delta.length());
    player.update(1 / 60);
    player.camera.updateMatrixWorld(true);
    return { end, frames, closestCart: closest, laneWidth: laneMaxX - laneMinX };
  });
}

async function waterMeasurements(page, underway) {
  return page.evaluate(async (move) => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const { CABIN, CABIN_COLLIDERS, CAPSULE_RADIUS, cabinColliderBoxes, deckPenetration } =
      await import('/src/nowake/deck-collision.js');
    if (move) {
      const physics = game.physics;
      physics.running = true; physics.mooringReleased = true;
      physics.throttle = .82; physics.steer = .58;
      for (let i = 0; i < 720; i++) physics.advance(1 / 60);
      const motion = physics.motion();
      game.boat.root.position.set(physics.position.x, game.boat.floatY + motion.heave, physics.position.y);
      game.boat.root.rotation.set(motion.pitch, physics.heading, motion.roll, 'YXZ');
      game.world.update(physics.time, 1 / 60);
    } else {
      game.world.update(0, 0);
    }
    const waterPoint = (frame, x, z) => {
      frame.updateMatrixWorld(true);
      const base = new V(x, 0, z).applyMatrix4(frame.matrixWorld);
      const localY = new V().setFromMatrixColumn(frame.matrixWorld, 1);
      const y = (game.world.water.level - base.y) / localY.y;
      return new V(x, y, z).applyMatrix4(frame.matrixWorld);
    };
    const vBerth = CABIN_COLLIDERS.find(({ name }) => name.includes('V-berth'));
    const galley = CABIN_COLLIDERS.find(({ name }) => name.includes('galley counter'));
    const boxes = cabinColliderBoxes();
    let walkable = 0; const wet = [];
    for (let xi = 0; xi <= Math.round(CABIN.halfBeam * 2 / .05); xi++) {
      const x = -CABIN.halfBeam + xi * .05;
      for (let z = vBerth.max[2] + .05; z <= galley.min[2] - .05 + 1e-9; z += .05) {
        const hit = deckPenetration(boxes, x, z, CAPSULE_RADIUS, CABIN.height + 1.66, 1.66);
        if (hit.depth > 1e-6) continue;
        walkable++;
        if (!game.world.water.excludes(waterPoint(game.boat.root, x, z))) wet.push([x, z]);
      }
    }
    const exterior = [];
    const hull = game.boat.hull;
    const sections = game.world.water.exclusion.sections;
    const halfBeamAt = (y, z) => {
      let width = 0;
      for (let i = 0; i < sections.length - 1; i++) {
        const a = sections[i]; const b = sections[i + 1];
        if (z < a.z || z > b.z) continue;
        width = a.w + (b.w - a.w) * ((z - a.z) / (b.z - a.z));
      }
      const { keelY, chineY, sheerY } = game.world.water.exclusion;
      const vertical = y <= chineY
        ? .84 * (y - keelY) / (chineY - keelY)
        : .84 + (1 - .84) * ((y - chineY) / (sheerY - chineY));
      return width * vertical;
    };
    for (const z of [-5.05, -4.50]) for (const side of [-1, 1]) {
      let x = side;
      for (let i = 0; i < 4; i++) {
        const local = waterPoint(hull, x, z).applyMatrix4(hull.matrixWorld.clone().invert());
        x = side * (halfBeamAt(local.y, local.z) + .01);
      }
      const point = waterPoint(hull, x, z);
      exterior.push({ z, side, dry: game.world.water.excludes(point) });
    }
    return {
      pose: move ? 'underway' : 'rest', walkable, wet,
      exterior, root: { position: game.boat.root.position.toArray(), rotation: game.boat.root.rotation.toArray() },
    };
  }, underway);
}

function assertWaterMeasurements(measurement) {
  if (measurement.walkable <= 0 || measurement.wet.length !== 0) {
    throw new Error(`${measurement.pose} cabin water mask left ${measurement.wet.length}`
      + ` of ${measurement.walkable} walkable samples wet`);
  }
  if (measurement.exterior.length !== 4 || measurement.exterior.some(({ dry }) => dry)) {
    throw new Error(`${measurement.pose} cabin water mask swallowed exterior water:`
      + ` ${JSON.stringify(measurement.exterior)}`);
  }
}

async function cabinFixtureMeasurements(page) {
  return page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const Box3 = game.world.colliders[0].constructor;
    game.world.setBelow(true);
    game.scene.updateMatrixWorld(true);
    const boxOf = (name) => new Box3().setFromObject(game.scene.getObjectByName(name));
    const pedestal = boxOf('dinette table pedestal');
    const tabletop = boxOf('dinette table top');
    return {
      pedestal: { min: pedestal.min.toArray(), max: pedestal.max.toArray() },
      tabletop: { min: tabletop.min.toArray(), max: tabletop.max.toArray() },
      airGap: tabletop.min.y - pedestal.max.y,
      worldWaterLevel: game.world.water.level,
      cabinSoleY: game.boat.root.position.y + game.boat.cabinDeck.height,
      forwardSamples: [[-1.64, -4.80], [1.66, -4.75]].map(([x, z]) => {
        const frame = game.boat.root;
        frame.updateMatrixWorld(true);
        const base = new V(x, 0, z).applyMatrix4(frame.matrixWorld);
        const localY = new V().setFromMatrixColumn(frame.matrixWorld, 1);
        const y = (game.world.water.level - base.y) / localY.y;
        const point = new V(x, y, z).applyMatrix4(frame.matrixWorld);
        return { x, z, dry: game.world.water.excludes(point) };
      }),
    };
  });
}

async function stageWakeAndInlet(page) {
  return page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const Box3 = game.world.colliders[0].constructor;
    game.world.setBelow(false);
    for (const quad of game.world.wake.pool) quad.visible = false;
    for (let i = 0; i < 36; i++) {
      const k = i / 35;
      game.boat.root.position.set(game.world.inlet.x, game.boat.floatY, game.world.inlet.z + 24 * (1 - k));
      const at = game.world.fromBoatLocal(new V(0, 0, 6.55));
      game.world.wake.emit(at, 0, 4.8, .11);
      game.world.wake.update(.11);
    }
    game.boat.root.position.set(game.world.inlet.x, game.boat.floatY, game.world.inlet.z);
    game.boat.root.rotation.set(0, 0, 0);
    game.world.update(4, .11);
    const hull = new Box3().setFromObject(game.boat.hull);
    const headlandObject = game.world.channel.root.getObjectByName('inlet head land');
    const headland = new Box3().setFromObject(headlandObject);
    const gap = Math.max(0, headland.min.z - hull.max.z, hull.min.z - headland.max.z);
    return {
      inlet: game.world.inlet,
      hull: { min: hull.min.toArray(), max: hull.max.toArray() },
      headland: { min: headland.min.toArray(), max: headland.max.toArray() },
      longitudinalGap: gap,
      wakeVisible: game.world.wake.pool.filter((quad) => quad.visible).length,
    };
  });
}

async function castMeasurements(page) {
  return page.evaluate(() => {
    const game = window.NO_WAKE;
    const V = game.player.position.constructor;
    const Box3 = game.world.colliders[0].constructor;
    const shown = (object) => {
      for (let node = object; node; node = node.parent) if (node.visible === false) return false;
      return (object.material?.opacity ?? 1) > .01;
    };
    const meshBoxes = (group) => {
      const entries = [];
      group.traverse((object) => {
        if (object.isMesh && shown(object)) entries.push({ object, box: new Box3().setFromObject(object) });
      });
      return entries;
    };
    const contacts = (left, right) => {
      const hits = [];
      for (const a of meshBoxes(left)) for (const b of meshBoxes(right)) {
        const overlap = a.box.clone().intersect(b.box);
        if (overlap.isEmpty()) continue;
        const size = overlap.getSize(new V());
        if (size.x > 1e-6 && size.y > 1e-6 && size.z > 1e-6) {
          hits.push({ actorMesh: a.object.name, fixtureMesh: b.object.name, overlap: size.toArray() });
        }
      }
      return hits;
    };
    const willy = game.boat.cast.willy;
    const lou = game.boat.cast.lou;
    const booski = game.boat.cast.booski;
    const galley = game.cabin.group.getObjectByName('galley and wet bar');
    const dinette = game.cabin.group.getObjectByName('curved dinette');
    const support = new Box3().setFromObject(game.cabin.group.getObjectByName('dinette booth cushion · aft return'));
    const hips = new Box3().setFromObject(willy.group.getObjectByName('hips'));
    return {
      poses: Object.fromEntries(['booski', 'willy', 'lou'].map((id) => [id, {
        position: game.boat.cast[id].group.position.toArray(),
        yaw: game.boat.cast[id].group.rotation.y,
        job: game.boat.cast[id].job,
      }])),
      booskiGalleyContacts: contacts(booski.group, galley),
      willyLouContacts: contacts(willy.group, lou.group),
      willyNonSupportContacts: contacts(willy.group, dinette)
        .filter(({ fixtureMesh }) => !/aft return/.test(fixtureMesh)),
      willySupport: {
        hips: { min: hips.min.toArray(), max: hips.max.toArray() },
        support: { min: support.min.toArray(), max: support.max.toArray() },
        gap: hips.min.y - support.max.y,
      },
    };
  });
}

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`LISTEN ${PORT}`);

try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM
      || (process.env.PLAYWRIGHT_BROWSERS_PATH
        ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(300000);
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 400)}`);
  });

  await startPage(page, 'dock');
  await installViewHelpers(page);
  evidence.measurements.dock = await dockMeasurements(page);
  evidence.measurements.dockRoute = await realDockRoute(page);
  await capture(page, '01-clear-pier-route.png', 'Real Player walked the full finger past the visible cart.');

  await page.evaluate(() => window.__noWakeWorldView([-3.75, .78, -14.4], [-6.35, .36, -14.4]));
  await capture(page, '02-cart-wheel-close.png', 'Visible wheel/plank support close-up.');
  await page.evaluate(() => window.__noWakeWorldView([-3.85, .72, 1.8], [-6.35, .48, 1.8]));
  await capture(page, '03-shore-power-close.png', 'Visible shore-power/plank support close-up.');
  await page.evaluate(() => window.__noWakeBoatView([7.4, .28, -1.5], [0, -.08, -1.0]));
  await capture(page, '04-starboard-waterline.png', 'Exterior broadside at the real waterline.');
  await page.evaluate(() => window.__noWakeBoatView([6.2, .60, -8.8], [0, .05, -4.65]));
  await capture(page, '05-bow-quarter.png', 'Fine-bow exterior and sea immediately beside the widened forward station.');

  evidence.measurements.waterRest = await waterMeasurements(page, false);
  assertWaterMeasurements(evidence.measurements.waterRest);
  evidence.measurements.cabinFixtures = await cabinFixtureMeasurements(page);
  evidence.measurements.cabinViewRest = await legalCabinView(
    page, [-.25, -2.55], [0, .25, -5.10],
  );
  await capture(page, '06-forward-cabin-dry-rest.png',
    'Legal player pose shows sole, both liner edges, and the V-berth transition at the resting sea plane.',
    'V-berth', [
      { label: 'sole', ndc: [0, -.55], pattern: 'cabin sole' },
      { label: 'port edge', ndc: [-.55, -.35], pattern: 'galley' },
      { label: 'starboard edge', ndc: [.55, -.35], pattern: 'dinette' },
    ]);
  evidence.measurements.tableView = await legalCabinView(
    page, [.20, -3.20], [1.24, .18, -3.80],
  );
  await capture(page, '07-dinette-pedestal-gap.png',
    'Legal central-aisle view of the supported table pedestal and underside.',
    'dinette table');

  evidence.measurements.waterUnderway = await waterMeasurements(page, true);
  assertWaterMeasurements(evidence.measurements.waterUnderway);
  evidence.measurements.cabinViewUnderway = await legalCabinView(
    page, [-.25, -2.55], [0, .25, -5.10],
  );
  await capture(page, '08-forward-cabin-dry-underway.png',
    'Same legal forward-aisle view with the translated/pitched/rolled hull mask.',
    'V-berth', [
      { label: 'sole', ndc: [0, -.55], pattern: 'cabin sole' },
      { label: 'port edge', ndc: [-.55, -.35], pattern: 'galley' },
      { label: 'starboard edge', ndc: [.55, -.35], pattern: 'dinette' },
    ]);

  evidence.measurements.inlet = await stageWakeAndInlet(page);
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    window.__noWakeWorldView([game.world.inlet.x + 10, 2.5, game.world.inlet.z + 12],
      [game.world.inlet.x, .35, game.world.inlet.z - 3]);
  });
  await capture(page, '09-inlet-exterior.png', 'Cruiser in the real inlet with the headland beyond.');
  await page.evaluate(() => {
    const game = window.NO_WAKE;
    window.__noWakeWorldView([game.world.inlet.x, 1.55, game.world.inlet.z + 18],
      [game.world.inlet.x, -.08, game.world.inlet.z + 3]);
  });
  await capture(page, '10-wake-astern.png', 'Exterior view of the bounded production wake pool.');

  await startPage(page, 'confrontation');
  await installViewHelpers(page);
  await page.waitForFunction(() => window.NO_WAKE.phase === 'cabin' && window.NO_WAKE.state.dialogue !== null,
    null, { timeout: 300000 });
  evidence.measurements.castStanding = await castMeasurements(page);
  evidence.measurements.booskiViewFront = await legalCabinView(
    page, [.20, -3.55], [-.95, .35, -4.60],
  );
  await capture(page, '11-booski-galley-front.png',
    'Legal aisle pose, front angle on Booski at the real galley mark.',
    { pattern: 'hips|waist|torso|forearm|thigh|gut|belly', characterId: 'booski' });
  evidence.measurements.booskiViewSide = await legalCabinView(
    page, [.10, -4.75], [-1.12, .18, -4.45],
  );
  await capture(page, '12-booski-galley-side.png',
    'Legal forward-walkway angle distinguishes interpenetration from Box3-only overlap.',
    { pattern: 'hips|waist|torso|forearm|thigh|gut|belly', characterId: 'booski' });

  let reachedSitLine = false;
  for (let i = 0; i < 20; i++) {
    reachedSitLine = await page.evaluate(() => (
      window.NO_WAKE.cueLog.at(-1)?.cue === 'cabin.booski.sit-down'
      && window.NO_WAKE.phase === 'cabin'
    ));
    if (reachedSitLine) break;
    await page.evaluate(() => window.NO_WAKE.skipDialogue());
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => window.NO_WAKE.boat.cast.willy.job === 'sit');
  await page.waitForTimeout(800);
  evidence.measurements.castSeated = await castMeasurements(page);
  evidence.measurements.castSeated.reachedSitLine = reachedSitLine;
  evidence.measurements.willyView = await legalCabinView(
    page, [-.65, -2.52], [1.20, .28, -3.05],
  );
  await capture(page, '13-willy-lou-seated.png',
    'Legal confrontation pose shows exact seated Willy support, legwell, and Lou clearance.',
    { pattern: 'hips|waist|torso|forearm|thigh|gut|belly', characterId: 'willy' });

  evidence.contextLosses = await page.evaluate(() => window.__noWakeGeometryContextLosses ?? 0);
  evidence.ok = errors.length === 0 && evidence.contextLosses === 0;
  await fsp.writeFile(path.join(OUT, 'geometry-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`DONE ${JSON.stringify({ ok: evidence.ok, errors: errors.length, contextLosses: evidence.contextLosses })}`);
} catch (error) {
  errors.push(`fatal: ${error.stack || error.message}`);
  evidence.ok = false;
  await fsp.writeFile(path.join(OUT, 'geometry-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  console.log(`CLOSED ${PORT}`);
}
