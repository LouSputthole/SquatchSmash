#!/usr/bin/env node
/**
 * Focused browser proof for the standalone late-game luxury apartment.
 *
 * Boots the real WebGL page, inspects the authored two-floor/art/utility
 * contracts, starts the first-person runtime, exercises the apartment's
 * player-facing entrance/utility/game flows with real input, and then runs the
 * public deterministic parity seam for the longer-form activity coverage.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5248;
const SCREENSHOT_DIR = process.env.LUXURY_APARTMENT_SCREENSHOT_DIR
  ? path.resolve(process.env.LUXURY_APARTMENT_SCREENSHOT_DIR)
  : process.argv.includes('--screenshots')
    ? path.join(ROOT, '.artifacts', 'luxury-apartment')
    : null;
const AUXILIARY_VIEWPORT = Object.freeze({
  width: 640,
  height: 400,
  deviceScaleFactor: 0.5,
  mobile: false,
});
/* 600 s, the sim-gated-wait convention verify-specialmeeting.mjs set, not a
 * guess: measured 2026-08-31 on an otherwise idle box, the SwiftShader page
 * renders this scene at ~2 fps and the frame dt clamp then advances the sim
 * at ~8.5% of wall time (17.8 sim-seconds in 209 wall-seconds, probed at the
 * Beat 27 call). The 13-turn Booski drain is ~25 sim-seconds — roughly 300
 * wall-seconds — so the old 180 s timeout failed a call that was draining
 * perfectly. Waits that pass fast still pass fast; this is only headroom. */
const AUXILIARY_WAIT = Object.freeze({ polling: 200, timeout: 600000 });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * SEVEN, NOT EIGHT. DOOM IS DELIBERATELY NOT INSTALLED.
 *
 * This flat was authored on a branch cut before the owner's 2026-08-24 ruling
 * on the opening -- *"the player can accidentally enter Doom, Doom is
 * difficult to exit... Squatch Smash is the joke. Doom is currently stepping
 * on the punchline with steel-toed boots."* `src/arcade/doom.js` is still in
 * the tree and still correct; `mount.js` simply no longer registers it, and
 * its header explains at length why the exit problem cannot be fixed from
 * this side of a cross-origin frame.
 *
 * So a luxury PC carrying eight apps would mean Doom had come back, in a
 * second place, for nobody's reason. This list is the seven the shared arcade
 * OS actually installs -- and because it is asserted as an EXACT set, it is
 * also the gate that catches Doom being quietly re-registered here.
 */
const EXPECTED_PC_APPS = Object.freeze([
  'mail',
  'smash',
  'shoot',
  'counter',
  'counter-guide',
  'match-result',
  'yuka',
]);

const EXPECTED_EXTRA_ART = Object.freeze([
  'luxury.night-watch',
  'luxury.ascension',
  'luxury.foyer.statement',
  'luxury.city.night',
  'luxury.loft.triptych.a',
  'luxury.loft.triptych.b',
  'luxury.loft.triptych.c',
  'luxury.stair.memory.a',
  'luxury.stair.memory.b',
  'luxury.bedroom.private',
  'luxury.office.victory',
  'luxury.poker.champions',
  'luxury.bath.monochrome',
]);

const EXPECTED_PROP_ART = Object.freeze([
  'closet.back', 'closet.shirt.a', 'closet.shirt.b',
  'fridge.magnet', 'fridge.photo.a', 'fridge.photo.b',
  'sticker.tower', 'sticker.fridge', 'sticker.fridge.b',
  'zyn.lid', 'label.beer', 'label.whiskey', 'eggs.carton', 'cereal.box',
]);

const EXPECTED_UTILITIES = Object.freeze([
  'frontDoor', 'elevator', 'bathroomDoor', 'bed', 'couch', 'desk', 'tv', 'radio', 'phone',
  'fridge', 'kitchen', 'cigarettes', 'shower', 'wardrobe', 'toilet',
  'mainLights', 'loftLights', 'cityGlass', 'shades', 'answeringMachine',
  'revolver', 'ammo', 'bong', 'shrooms', 'whiteLine', 'crookedArt',
]);

const LUXURY_MAIN_SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'luxury-apartment', 'main.js'), 'utf8');
const LUXURY_RUNTIME_SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'luxury-apartment', 'runtime.js'), 'utf8');

const problems = [];
const results = [];
let browser;
let server;

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

function sorted(values) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b)));
}

async function capture(page, name) {
  if (!SCREENSHOT_DIR) return;
  await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
}

async function settleRenderedFrames(page, count = 2) {
  await page.evaluate((frames) => new Promise((resolve) => {
    let remaining = Math.max(1, frames);
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }), count);
}

/**
 * Keep the saved Beat-27 journey playable under SwiftShader without shrinking
 * the CSS viewport (the real Start control and canvas interactions still need
 * their normal layout). CDP metrics are document-scoped in some Chromium
 * builds, so reapply them after every navigation/reload; the explicit renderer
 * pin is a verifier-only backstop for the apartment's deterministic dpr seam.
 */
async function applyAuxiliaryMetrics(page, session, { pinLuxuryRenderer = false } = {}) {
  await session.send('Emulation.setDeviceMetricsOverride', AUXILIARY_VIEWPORT);
  if (!pinLuxuryRenderer) return null;
  return page.evaluate(({ width, height, deviceScaleFactor }) => {
    const renderer = window.LUXURY_APARTMENT?.renderer;
    if (!renderer) throw new Error('Luxury renderer unavailable for auxiliary metrics');
    renderer.setPixelRatio(deviceScaleFactor);
    renderer.setSize(width, height, false);
    return {
      css: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      rendererDpr: renderer.getPixelRatio(),
      backing: [renderer.domElement.width, renderer.domElement.height],
    };
  }, AUXILIARY_VIEWPORT);
}

/** Read back a sparse crop immediately after rendering the shipping scene. */
async function sampleCanvasTone(page, crop = 0.68) {
  return page.evaluate((cropRatio) => {
    const runtime = window.LUXURY_APARTMENT;
    const renderer = runtime.renderer;
    const source = renderer.domElement;
    const width = source.width;
    const height = source.height;
    const cropWidth = Math.max(1, Math.floor(width * cropRatio));
    const cropHeight = Math.max(1, Math.floor(height * cropRatio));
    const x0 = Math.floor((width - cropWidth) / 2);
    const y0 = Math.floor((height - cropHeight) / 2);
    const gl = renderer.getContext();
    const pixels = new Uint8Array(cropWidth * cropHeight * 4);
    // preserveDrawingBuffer is intentionally disabled in production. Render
    // and sample in this same task so headless Chromium cannot discard the
    // back buffer before verification reads it.
    renderer.render(runtime.scene, runtime.camera);
    gl.readPixels(x0, y0, cropWidth, cropHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const readError = gl.getError();
    const values = [];
    let clipped = 0;
    let dark = 0;
    for (let index = 0; index < pixels.length; index += 4 * 11) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      values.push(luminance);
      if (red >= 250 && green >= 250 && blue >= 250) clipped += 1;
      if (luminance <= 12) dark += 1;
    }
    values.sort((left, right) => left - right);
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const percentile = (ratio) => values[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0;
    return {
      mean,
      p10: percentile(0.10),
      p50: percentile(0.50),
      p95: percentile(0.95),
      p99: percentile(0.99),
      clippedFraction: clipped / Math.max(1, values.length),
      darkFraction: dark / Math.max(1, values.length),
      samples: values.length,
      readError,
    };
  }, crop);
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
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(await fsp.readFile(file));
    } catch (error) {
      res.writeHead(500).end(error?.message || 'server error');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  browser = await launchChromium({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
    headless: true,
    // The portable CI receipt uses SwiftShader; a local GPU run can exercise
    // the same real-input sequence at normal playable frame rates.
    args: process.env.LUXURY_APARTMENT_NATIVE_GPU === '1' ? [
      '--autoplay-policy=no-user-gesture-required',
    ] : [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  /* This verifier ordinarily needs one page. The receiver reload receipt
   * needs a second tab sharing the first tab's localStorage, so own an
   * explicit context instead of Browser.newPage's one-page convenience
   * context (which Playwright deliberately refuses to extend). */
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let page = await context.newPage();
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 400)}`);
  });
  page.on('requestfailed', (request) => {
    /* ERR_ABORTED is a CANCELLATION, not a failure: the two real elevator
     * rides navigate this page to preview.html while wall art is still
     * streaming, and every in-flight image is aborted by design. A missing
     * file reports as a 404 through the static server, never as an abort. */
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    problems.push(`request: ${request.url()} - ${request.failure()?.errorText || 'failed'}`);
  });

  /* No preview query here: preview campaign storage is intentionally
   * page-local and disposable. This standalone fresh-save landing is still
   * unrouted, but it owns real browser localStorage, which is the receiver
   * persistence boundary this verifier is proving. */
  await page.goto(`http://127.0.0.1:${PORT}/luxury-apartment.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => Boolean(window.LUXURY_APARTMENT?.home));

  const authored = await page.evaluate(({ expectedUtilities, expectedApps, expectedExtraArt, expectedPropArt }) => {
    const runtime = window.LUXURY_APARTMENT;
    const home = runtime.home;
    home.root.updateMatrixWorld(true);

    const meshes = [];
    const stairTops = [];
    const windowPanes = [];
    const skylineMasses = [];
    const skylineWindows = [];
    const skylineWindowsSouth = [];
    const skylineWindowsEast = [];
    const skylineRoofFeatures = [];
    const skylineDepthBands = new Set();
    home.root.traverse((object) => {
      if (object.isMesh) meshes.push(object);
      if (object.name.startsWith('luxury-stair-tread-')) {
        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
        stairTops.push(box.max.y);
      }
      if (/^luxury-window-(south|east)-pane-/.test(object.name)) windowPanes.push(object.name);
      if (/^luxury-city-building-(south|east)-\d+(-mass)?$/.test(object.name)) {
        skylineMasses.push(object.name);
      }
      if (object.isMesh && /^luxury-city-window-[se]-\d+-\d+-\d+$/.test(object.name)) {
        skylineWindows.push(object.name);
        if (object.name.startsWith('luxury-city-window-s-')) skylineWindowsSouth.push(object.name);
        if (object.name.startsWith('luxury-city-window-e-')) skylineWindowsEast.push(object.name);
      }
      if (/^luxury-city-building-(south|east)-\d+-(roof|antenna)$/.test(object.name)) {
        skylineRoofFeatures.push(object.name);
      }
      if (object.userData?.depthBand) skylineDepthBands.add(object.userData.depthBand);
    });
    stairTops.sort((a, b) => a - b);
    const stairRises = stairTops.slice(1).map((top, index) => top - stairTops[index]);
    const lastRise = home.spawns.loft.position.y - home.spawns.main.position.y
      - (stairTops.at(-1) ?? 0);

    const mainZone = home.floorZones.find(({ name }) => name === 'luxury-main-floor-zone');
    const loftZone = home.floorZones.find(({ name }) => name === 'luxury-loft-floor-zone');
    const overlapX = Math.min(mainZone.box.max.x, loftZone.box.max.x)
      - Math.max(mainZone.box.min.x, loftZone.box.min.x);
    const overlapZ = Math.min(mainZone.box.max.z, loftZone.box.max.z)
      - Math.max(mainZone.box.min.z, loftZone.box.min.z);

    const art = [...home.resolvedArt.entries()].map(([slot, record]) => {
      const placement = home.artTargets[slot] ?? home.propArtPlacements[slot];
      return {
        slot,
        real: record.real,
        file: record.file,
        width: record.texture?.image?.width ?? 0,
        height: record.texture?.image?.height ?? 0,
        source: placement?.userData?.artSource ?? null,
        zone: placement?.userData?.artZone ?? null,
        kind: placement?.userData?.artDisplayKind ?? null,
      };
    });
    const apartmentArt = art.filter(({ source }) => source === 'apartment');
    const luxuryArt = art.filter(({ source }) => source === 'luxury');
    const displayArt = Object.entries(home.artTargets).map(([slot, target]) => ({
      slot,
      zone: target.userData.artZone,
      kind: target.userData.artDisplayKind,
      source: target.userData.artSource,
    }));
    const propArt = Object.entries(home.propArtPlacements).map(([slot, target]) => ({
      slot,
      zone: target.userData.artZone,
      kind: target.userData.artDisplayKind,
      source: target.userData.artSource,
      textureAttached: target.userData.artTextureAttached === true,
    }));
    const visibleArtSlots = [...new Set([...displayArt, ...propArt].map(({ slot }) => slot))];
    const extraArtZones = expectedExtraArt.map((slot) => home.artTargets[slot]?.userData?.artZone ?? null);
    const expectedPropPlaced = expectedPropArt.map((slot) => Boolean(home.propArtPlacements[slot]));

    const bodyClearance = (point, box) => {
      const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x);
      const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z);
      return Math.hypot(dx, dz);
    };
    const poseExitClearances = Object.entries(home.poses).map(([id, stationPose]) => {
      const low = stationPose.exit.y + 0.05;
      const high = stationPose.exit.y + 1.68;
      const relevant = home.colliders.filter((entry) => entry.max.y > low && entry.min.y < high);
      return {
        id,
        clearance: Math.min(...relevant.map((entry) => bodyClearance(stationPose.exit, entry))),
      };
    });

    const colliderNamed = (name) => home.colliders.find((entry) => entry.name === name);
    const primaryCouch = colliderNamed('luxury-lounge-sectional-collider');
    const returnCouch = colliderNamed('luxury-lounge-return-collider');
    const returnGroup = home.root.getObjectByName('luxury-lounge-return');
    const officeSlats = home.colliders.filter(
      (entry) => /^luxury-office-slat-divider-slat-\d-collider$/.test(entry.name),
    );
    const officeCirculation = { x: 2.18, z: -3.12 };
    const officeCirculationClearance = Math.min(
      ...officeSlats.map((entry) => bodyClearance(officeCirculation, entry)),
    );

    const worldPoint = (object) => {
      const point = home.spawns.main.position.clone().set(0, 0, 0);
      object?.getWorldPosition?.(point);
      return { x: point.x, y: point.y, z: point.z };
    };
    const bathroomBounds = home.bathroom.bounds;
    const bathroomCenter = {
      x: (bathroomBounds.x0 + bathroomBounds.x1) / 2,
      z: (bathroomBounds.z0 + bathroomBounds.z1) / 2,
    };
    const bathroomZone = home.floorZones.find(({ name }) => name === 'luxury-bath-tile-zone');
    const bathroomThresholdZone = home.floorZones.find(({ name }) => name === 'luxury-bathroom-threshold-zone');
    /* The west rail stopped being one slab on 2026-08-31: it is 18 per-step
     * boxes (`luxury-stair-rail-west-collider-NN`) so the player can walk
     * beneath the open flight. The clearance question is unchanged — does
     * ANY piece of that rail intrude past the bathroom door opening — so
     * take the westernmost face across the whole set. */
    const westRailSteps = home.colliders.filter(({ name }) => (
      typeof name === 'string' && name.startsWith('luxury-stair-rail-west-collider')
    ));
    const bathroomWestRail = westRailSteps.length
      ? { min: { x: Math.min(...westRailSteps.map((step) => step.min.x)) } }
      : null;
    const bathroomLight = home.lights.bathroom;
    const bathroomCeiling = home.bathroom.ceiling;
    bathroomCeiling.geometry.computeBoundingBox();
    const bathroomCeilingBounds = bathroomCeiling.geometry.boundingBox.clone()
      .applyMatrix4(bathroomCeiling.matrixWorld);
    const bathroomStem = bathroomLight.fixture.getObjectByName('luxury-light-main-bathroom-stem');
    bathroomStem.geometry.computeBoundingBox();
    const bathroomStemBounds = bathroomStem.geometry.boundingBox.clone()
      .applyMatrix4(bathroomStem.matrixWorld);
    const bathroomParts = [];
    home.bathroom.shell.traverse((object) => bathroomParts.push(object.name));
    const toiletPaperParts = [];
    home.bathroom.toiletPaper.traverse((object) => toiletPaperParts.push(object.name));
    const elevatorParts = [];
    home.doors.elevator.group.traverse((object) => elevatorParts.push(object.name));
    const bedroomWallParts = [];
    home.root.getObjectByName('luxury-bedroom-privacy-wall')?.traverse((object) => {
      bedroomWallParts.push(object.name);
    });

    const southSky = home.root.getObjectByName('luxury-city-panorama-south');
    const eastSky = home.root.getObjectByName('luxury-city-panorama-east');
    const originalMinutes = home.state.cityMinutes;
    home.setCityTime(8 * 60);
    const morningSky = {
      southColor: southSky.material.color.getHex(),
      eastColor: eastSky.material.color.getHex(),
      southOpacity: southSky.material.opacity,
      eastOpacity: eastSky.material.opacity,
      phase: southSky.material.userData.citySkyPhase,
    };
    home.setCityTime(20 * 60 + 30);
    const nightSky = {
      southColor: southSky.material.color.getHex(),
      eastColor: eastSky.material.color.getHex(),
      southOpacity: southSky.material.opacity,
      eastOpacity: eastSky.material.opacity,
      phase: southSky.material.userData.citySkyPhase,
    };
    home.setCityTime(originalMinutes);

    const utilities = expectedUtilities.map((id) => {
      const target = home.utilityTargets[id];
      return {
        id,
        exists: Boolean(target),
        interactive: Boolean(target?.userData?.interact),
      };
    });
    const pcApps = runtime.pcArcade.apps.map(({ id }) => id);
    const appLookup = expectedApps.map((id) => Boolean(runtime.pcArcade.appById(id)));

    return {
      ready: Boolean(window.LUXURY_APARTMENT && window.LUXURY_APARTMENT.home),
      bootFailure: !document.getElementById('bootFailure')?.hidden,
      contextLost: runtime.renderer.getContext().isContextLost(),
      rootAttached: home.root.parent === runtime.scene,
      meshCount: meshes.length,
      metrics: home.metrics,
      mainFloorY: mainZone?.y,
      loftFloorY: loftZone?.y,
      walkableOverlap: overlapX > 0 && overlapZ > 0,
      stairTops,
      stairRises,
      lastRise,
      reportedStepRise: home.stairs.stepRise,
      reportedStepRun: home.stairs.stepRun,
      windowPanes,
      skylineMasses,
      skylineWindows: skylineWindows.length,
      skylineWindowsSouth: skylineWindowsSouth.length,
      skylineWindowsEast: skylineWindowsEast.length,
      skylineRoofFeatures: skylineRoofFeatures.length,
      skylineDepthBands: [...skylineDepthBands],
      skyMaterialShared: southSky.material === eastSky.material,
      skyCornerOverlap: Math.min(
        southSky.geometry.parameters.width / 2 - eastSky.position.x,
        eastSky.geometry.parameters.width / 2 - southSky.position.z,
      ),
      morningSky,
      nightSky,
      art,
      apartmentArt: apartmentArt.length,
      luxuryArt: luxuryArt.length,
      artTargetCount: Object.keys(home.artTargets).length,
      displayArt,
      propArt,
      visibleArtSlots,
      extraArtZones,
      expectedPropPlaced,
      poseExitClearances,
      chandelier: {
        pointLight: Boolean(home.lights.chandelierLight?.isPointLight),
        intensity: home.lights.chandelierLight?.intensity ?? 0,
      },
      artLightIntensities: home.artLights.map(({ light }) => light.intensity),
      sectional: {
        returnYaw: returnGroup?.rotation.y ?? null,
        primaryExists: Boolean(primaryCouch),
        returnExists: Boolean(returnCouch),
        returnWidth: returnCouch ? returnCouch.max.x - returnCouch.min.x - 0.04 : null,
        returnDepth: returnCouch ? returnCouch.max.z - returnCouch.min.z - 0.04 : null,
        returnCenterZ: returnCouch ? (returnCouch.min.z + returnCouch.max.z) / 2 : null,
        joined: Boolean(primaryCouch?.intersectsBox(returnCouch)),
      },
      seating: {
        arcade: home.gameStations.arcade?.seat?.name ?? null,
        arcadeCollider: Boolean(colliderNamed('luxury-arcade-stool-collider')),
        poker: home.gameStations.poker?.seats?.map(({ name }) => name) ?? [],
        pokerColliders: home.gameStations.poker?.seats?.map(({ name }) => Boolean(colliderNamed(`${name}-collider`))) ?? [],
      },
      officeDivider: {
        colliders: officeSlats.length,
        circulationClearance: officeCirculationClearance,
      },
      entrance: {
        serviceDoorLocked: home.doors.front.locked === true,
        serviceDoorOpen: home.doors.front.isOpen(),
        servicePlate: Boolean(home.doors.front.servicePlate),
        elevatorOpen: home.doors.elevator.isOpen(),
        elevatorCab: elevatorParts.includes('luxury-elevator-cab'),
        elevatorCabParts: elevatorParts.filter((name) => name.startsWith('luxury-elevator-cab-')).length,
        arrivalGround: home.groundAt(
          home.spawns.arrival.position.x,
          home.spawns.arrival.position.z,
          home.spawns.arrival.position.y,
        ),
      },
      bathroom: {
        floorY: home.bathroom.floorY,
        metricFloorY: home.metrics.bathroomFloorY,
        lowGround: home.groundAt(bathroomCenter.x, bathroomCenter.z, 1.68),
        highGround: home.groundAt(bathroomCenter.x, bathroomCenter.z, home.metrics.bathroomFloorY + 4.98),
        shellName: home.bathroom.shell.name,
        floorPresent: bathroomParts.includes('luxury-bath-floor'),
        ceiling: {
          name: bathroomCeiling.name,
          min: bathroomCeilingBounds.min.toArray(),
          max: bathroomCeilingBounds.max.toArray(),
          stemGap: bathroomCeilingBounds.min.y - bathroomStemBounds.max.y,
        },
        walls: bathroomParts.filter((name) => name.startsWith('luxury-bath-wall-')).length,
        doorPresent: Boolean(home.bathroom.door?.target),
        doorInitiallyOpen: home.bathroom.door?.isOpen?.() === true,
        doorGlassOpacity: home.bathroom.door?.leaf?.material?.opacity ?? null,
        doorWidth: bathroomBounds.doorX1 - bathroomBounds.doorX0,
        roomWidth: bathroomBounds.x1 - bathroomBounds.x0,
        doorClearsStairRail: Boolean(bathroomWestRail)
          && bathroomWestRail.min.x - bathroomBounds.doorX1 >= -1e-6,
        thresholdPresent: Boolean(home.root.getObjectByName('luxury-bathroom-threshold')),
        thresholdZone: bathroomThresholdZone?.surface ?? null,
        plinthDoorJamb: Boolean(home.root.getObjectByName('luxury-service-plinth-bathroom-jamb')),
        plinthDoorCap: Boolean(home.root.getObjectByName('luxury-service-plinth-bathroom-cap')),
        tileZone: bathroomZone?.surface ?? null,
        tileZoneY: bathroomZone?.y ?? null,
        mirrorGeometry: home.mirrorMesh?.geometry?.type ?? null,
        toilet: worldPoint(home.bathroom.toilet.group),
        sink: worldPoint(home.bathroom.sink.group),
        toiletPaper: worldPoint(home.bathroom.toiletPaper.getObjectByName('luxury-toilet-paper-wall-plate')),
        toiletPaperMounted: toiletPaperParts.includes('luxury-toilet-paper-wall-plate')
          && toiletPaperParts.includes('luxury-toilet-paper-holder')
          && toiletPaperParts.includes('luxury-toilet-paper-roll'),
        artZone: home.artTargets['luxury.bath.monochrome']?.userData?.artZone ?? null,
        light: {
          fixtureName: bathroomLight?.fixture?.name ?? null,
          position: worldPoint(bathroomLight?.light),
          intensity: bathroomLight?.intensity ?? null,
          distance: bathroomLight?.light?.distance ?? null,
          color: bathroomLight?.light?.color?.getHex?.() ?? null,
          mainCircuit: home.lights.main.includes(bathroomLight),
          loftCircuit: home.lights.loft.includes(bathroomLight),
          retiredLoftFixtureAbsent: !home.root.getObjectByName('luxury-light-loft-bath'),
        },
        bounds: bathroomBounds,
      },
      workstation: {
        chairMaterial: home.deskChair?.group?.userData?.workstationMaterial ?? null,
        zynDesktopHalf: home.deskZyn?.group?.userData?.desktopHalf ?? null,
        zyn: worldPoint(home.deskZyn?.group),
      },
      pokerPolish: {
        /* ZERO, and the gate holds it at zero. Owner note 2026-08-26: the three
         * civilian patrons who used to hold the north, west and east chairs are
         * gone, and the table stays as furniture. */
        patrons: home.poker?.patrons?.length ?? 0,
        actors: (() => {
          let seated = 0;
          /* Count only the poker assembly. Beats 16/17 now keep a hidden
           * principal actor rig in the apartment root; treating every actor
           * anywhere in the home as a poker patron made this furniture gate
           * reject the very story staging it was supposed to coexist with. */
          home.poker?.group?.traverse((object) => {
            if (object.userData?.actor) seated += 1;
          });
          return seated;
        })(),
        seats: home.poker?.seats?.length ?? 0,
        railPresent: Boolean(home.poker?.rail),
        feltPresent: Boolean(home.poker?.felt),
        railOval: home.poker?.rail?.scale?.z ?? null,
        feltOval: home.poker?.felt?.scale?.z ?? null,
      },
      dartsPolish: {
        board: Boolean(home.darts?.board),
        numberedFace: home.darts?.face?.name ?? null,
        faceTexture: Boolean(home.darts?.face?.material?.map?.isTexture),
        sections: home.darts?.sections?.length ?? 0,
        topSection: home.darts?.sections?.[0] ?? null,
        spotLight: Boolean(home.darts?.light?.isSpotLight),
        backing: Boolean(home.darts?.backing),
        rack: Boolean(home.darts?.rack),
        impactRoot: Boolean(home.darts?.impactRoot),
        center: home.darts?.center ? {
          x: home.darts.center.x,
          y: home.darts.center.y,
          z: home.darts.center.z,
        } : null,
        normal: home.darts?.normal ? {
          x: home.darts.normal.x,
          y: home.darts.normal.y,
          z: home.darts.normal.z,
        } : null,
      },
      bedroomPolish: {
        wallPresent: bedroomWallParts.includes('luxury-bedroom-privacy-wall'),
        wallPanels: bedroomWallParts.filter((name) => name.startsWith('luxury-bedroom-wall-panel-')).length,
        bannerZones: [
          home.artTargets['banner.main']?.userData?.artZone ?? null,
          home.artTargets['banner.twitch']?.userData?.artZone ?? null,
        ],
        photoZones: [
          home.artTargets['cork.above']?.userData?.artZone ?? null,
          home.artTargets['bath.toilet.poster']?.userData?.artZone ?? null,
        ],
      },
      decorPolish: {
        fittedAppliance: Boolean(home.root.getObjectByName('luxury-fitted-wine-cooler')),
        stairFocal: Boolean(home.root.getObjectByName('luxury-top-stair-focal')),
        consoleYaw: home.root.getObjectByName('luxury-entertainment-console')?.rotation?.y ?? null,
        consoleChildren: home.root.getObjectByName('luxury-entertainment-console')?.children?.length ?? 0,
        crestX: home.artTargets['crest.round']?.position?.x ?? null,
        removedArcadeArt: !home.artTargets['luxury.arcade.marquee'],
        historyRow: ['feature.stacks', 'couch.left', 'couch.right', 'west.late']
          .map((slot) => home.artTargets[slot]?.userData?.artZone ?? null),
      },
      cityGround: {
        present: Boolean(home.cityGround),
        groundY: home.metrics.cityGroundY,
        lowestBuildingY: home.metrics.cityLowestBuildingY,
      },
      utilities,
      utilityKeys: Object.keys(home.utilityTargets),
      gameStations: Object.keys(home.gameStations),
      pcApps,
      appLookup,
      pcLaunchById: typeof runtime.pcArcade.launchById === 'function',
      cabinetApps: runtime.cabinetArcade.apps.map(({ id }) => id),
      cabinetStation: Boolean(home.gameStations.arcade?.screen === home.screens.arcade),
      pokerSolo: Boolean(home.poker?.patrons?.length === 0),
      blackjackMounted: 'blackjack' in runtime,
      darts: Boolean(runtime.darts && home.gameStations.darts),
      reflectionBody: {
        present: Boolean(runtime.firstPersonBody?.group?.userData?.firstPersonBody),
        outfitId: runtime.firstPersonBody?.outfitId ?? null,
        layer: runtime.firstPersonBody?.group?.userData?.firstPersonBody?.reflectionLayer ?? null,
      },
      campaignAssigned: Boolean(runtime.campaign),
    };
  }, {
    expectedUtilities: EXPECTED_UTILITIES,
    expectedApps: EXPECTED_PC_APPS,
    expectedExtraArt: EXPECTED_EXTRA_ART,
    expectedPropArt: EXPECTED_PROP_ART,
  });

  check('the real luxury-apartment page reaches a clean WebGL-ready runtime',
    authored.ready && !authored.bootFailure && !authored.contextLost && authored.rootAttached,
    JSON.stringify({
      ready: authored.ready,
      bootFailure: authored.bootFailure,
      contextLost: authored.contextLost,
      rootAttached: authored.rootAttached,
      meshes: authored.meshCount,
    }));
  check('the future home remains a standalone preview with no campaign placement',
    !authored.campaignAssigned,
    JSON.stringify({ campaignAssigned: authored.campaignAssigned }));

  /* SwiftShader has one software GPU process for the whole browser context.
   * The authored snapshot above is now ordinary data, so close this untouched
   * menu page while the saved Beat-27 page owns the process. Background-page
   * lifecycle throttling still made its simulation six times slower even when
   * this page was frozen; serial pages keep both receipts on production timing.
   * A clean standalone page is reopened after the campaign handoff. */
  await page.close();

  /* The ordinary page above is intentionally a fresh, unrouted apartment: it
   * must still begin with the table phone and a 0/3 get-ready tally. Persistent
   * ownership only exists on campaign landings. Prove the restoration on the
   * canonical beat-27 direct-entry state instead of asking the standalone page
   * for campaign state it deliberately does not publish. */
  const specialMeetingPage = await context.newPage();
  await specialMeetingPage.bringToFront();
  await specialMeetingPage.setViewportSize({ width: 640, height: 400 });
  const specialMeetingPageSession = await context.newCDPSession(specialMeetingPage);
  await applyAuxiliaryMetrics(specialMeetingPage, specialMeetingPageSession);
  specialMeetingPage.setDefaultTimeout(180000);
  specialMeetingPage.setDefaultNavigationTimeout(180000);
  specialMeetingPage.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  specialMeetingPage.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 400)}`);
  });
  specialMeetingPage.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    problems.push(`request: ${request.url()} - ${request.failure()?.errorText || 'failed'}`);
  });
  await specialMeetingPage.goto(
    `http://127.0.0.1:${PORT}/luxury-apartment.html?preview=1&beat=special_meeting_call&dpr=0.5`,
    { waitUntil: 'domcontentloaded' },
  );
  await specialMeetingPage.waitForFunction(() => Boolean(
    window.LUXURY_APARTMENT?.home
      && window.__squatchLifePreviewRuntime?.seeded
      && window.__squatchLifePreviewRuntime.storage?.getItem?.('squatchlife.campaign'),
  ), null, AUXILIARY_WAIT);
  await applyAuxiliaryMetrics(specialMeetingPage, specialMeetingPageSession, {
    pinLuxuryRenderer: true,
  });
  const persistentPhone = await specialMeetingPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const saved = JSON.parse(
      window.__squatchLifePreviewRuntime.storage.getItem('squatchlife.campaign'),
    );
    return {
      campaignCopies: saved.inventory.carried.filter((id) => id === 'phone').length,
      hotbarCopies: runtime.home.inventory.items.filter((id) => id === 'phone').length,
      held: runtime.home.inventory.held,
      stateTaken: runtime.home.state.phoneTaken,
      tablePropHidden: runtime.home.phoneProp?.group?.visible === false,
      callStatus: saved.events.booski_special_meeting_call?.status ?? null,
    };
  });
  const persistentPhoneSeed = await specialMeetingPage.evaluate(() => (
    window.__squatchLifePreviewRuntime.storage.getItem('squatchlife.campaign')
  ));
  check('beat 27 restores the persistent phone exactly once without manufacturing a table copy',
    persistentPhone.campaignCopies === 1
      && persistentPhone.hotbarCopies === 1
      && persistentPhone.held === null
      && persistentPhone.stateTaken
      && persistentPhone.tablePropHidden
      && persistentPhone.callStatus === 'pending',
    JSON.stringify(persistentPhone));
  await specialMeetingPage.close();

  /* A preview reload intentionally reseeds. Copy the same normalized Beat-27
   * state into ordinary localStorage so this second receipt is a real save:
   * reload once while ringing, answer from the loft, drain the whole call, reload
   * again, and then take the real lift into the real pickup. This is one saved
   * page from ring to SM-100 -- no standalone Special Meeting preview can stand
   * in for the apartment handoff. */
  const ringingReloadPage = await context.newPage();
  await ringingReloadPage.bringToFront();
  await ringingReloadPage.setViewportSize({ width: 640, height: 400 });
  const ringingReloadPageSession = await context.newCDPSession(ringingReloadPage);
  await applyAuxiliaryMetrics(ringingReloadPage, ringingReloadPageSession);
  ringingReloadPage.setDefaultTimeout(180000);
  ringingReloadPage.setDefaultNavigationTimeout(180000);
  ringingReloadPage.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  ringingReloadPage.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 400)}`);
  });
  ringingReloadPage.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    problems.push(`request: ${request.url()} - ${request.failure()?.errorText || 'failed'}`);
  });
  await ringingReloadPage.goto(`http://127.0.0.1:${PORT}/index.html`, {
    waitUntil: 'domcontentloaded',
  });
  await ringingReloadPage.evaluate((seed) => {
    localStorage.setItem('squatchlife.campaign', seed);
  }, persistentPhoneSeed);
  await ringingReloadPage.goto(`http://127.0.0.1:${PORT}/luxury-apartment.html?dpr=0.5`, {
    waitUntil: 'domcontentloaded',
  });
  await ringingReloadPage.bringToFront();
  await ringingReloadPage.waitForFunction(
    () => Boolean(window.LUXURY_APARTMENT?.home),
    null,
    AUXILIARY_WAIT,
  );
  const initialAuxiliaryMetrics = await applyAuxiliaryMetrics(
    ringingReloadPage,
    ringingReloadPageSession,
    { pinLuxuryRenderer: true },
  );
  console.log('  ...   Beat 27 saved page ready; starting the real phone scheduler');
  await ringingReloadPage.locator('#start-btn').click();
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.state.phase === 'active'
      && window.LUXURY_APARTMENT.audio.hasSample('vo.specialmeeting.tony.idle_before.1')
  ), null, AUXILIARY_WAIT);
  /* Compress only authored WAIT clocks through the scene's public QA seam.
   * The actual idle take, scheduler, ringtone, phone key, call, inventory,
   * callback and lift remain the production controllers. */
  await ringingReloadPage.evaluate(() => {
    window.LUXURY_APARTMENT.debug.specialMeeting.advance({
      seconds: 19.1, phoneClock: false, preludeClock: true, busy: false,
    });
  });
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.debug.specialMeeting.receipts()
      .some(({ cue, receipt }) => cue === 'vo.specialmeeting.tony.idle_before.1'
        && receipt?.started === true)
  ), null, AUXILIARY_WAIT);
  const firstIdleReceipt = await ringingReloadPage.evaluate(() => (
    window.LUXURY_APARTMENT.debug.specialMeeting.receipts()
      .find(({ cue }) => cue === 'vo.specialmeeting.tony.idle_before.1')
  ));
  await ringingReloadPage.evaluate(() => {
    window.LUXURY_APARTMENT.debug.specialMeeting.advance({
      seconds: 75, phoneClock: true, preludeClock: false,
    });
  });
  await ringingReloadPage.waitForFunction(
    () => window.LUXURY_APARTMENT.phone.ringing === true,
    null,
    AUXILIARY_WAIT,
  );
  console.log('  ...   Beat 27 first scheduled ring received; reloading mid-ring');
  const beforeRingReload = await ringingReloadPage.evaluate(() => ({
    ringing: window.LUXURY_APARTMENT.phone.ringing,
    held: window.LUXURY_APARTMENT.home.inventory.held,
    status: JSON.parse(localStorage.getItem('squatchlife.campaign'))
      .events.booski_special_meeting_call?.status ?? null,
  }));
  await ringingReloadPage.reload({ waitUntil: 'domcontentloaded' });
  await ringingReloadPage.bringToFront();
  await ringingReloadPage.waitForFunction(
    () => Boolean(window.LUXURY_APARTMENT?.home),
    null,
    AUXILIARY_WAIT,
  );
  const ringingAuxiliaryMetrics = await applyAuxiliaryMetrics(
    ringingReloadPage,
    ringingReloadPageSession,
    { pinLuxuryRenderer: true },
  );
  await ringingReloadPage.locator('#start-btn').click();
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.state.phase === 'active'
      && window.LUXURY_APARTMENT.audio.hasSample('vo.specialmeeting.tony.dead_line.1')
  ), null, AUXILIARY_WAIT);
  await ringingReloadPage.evaluate(() => {
    window.LUXURY_APARTMENT.debug.specialMeeting.advance({
      seconds: 75, phoneClock: true, preludeClock: false,
    });
  });
  await ringingReloadPage.waitForFunction(
    () => window.LUXURY_APARTMENT.phone.ringing === true,
    null,
    AUXILIARY_WAIT,
  );
  console.log('  ...   Beat 27 scheduled ring recovered after reload; answering with real E');
  const savedDistantRing = await ringingReloadPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.teleport('loft');
    /* `teleportToSpawn` moves the eye but intentionally leaves the shared
     * Player's last sampled ground alone. Seed the authored loft support as
     * part of this deterministic setup so the next production frame cannot
     * reinterpret a loft spawn with the main floor's stale support hint. */
    const loftGround = runtime.home.spawns.loft.position.y - 1.68;
    runtime.player.position.y = loftGround + 1.66;
    runtime.player.ground = loftGround;
    runtime.player.grounded = true;
    runtime.player.jumpHeight = 0;
    runtime.player.update(0.001);
    return {
      ringing: runtime.phone.ringing,
      held: runtime.home.inventory.held,
      floor: runtime.player.position.y > 3 ? 'loft' : 'main',
      objective: document.getElementById('objectives')?.textContent ?? '',
    };
  });
  await ringingReloadPage.keyboard.press('e');
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.phone.inCall
      && JSON.parse(localStorage.getItem('squatchlife.campaign'))
        .events.booski_special_meeting_call?.status === 'answered'
  ), null, AUXILIARY_WAIT);
  const afterRingReload = await ringingReloadPage.evaluate(() => ({
    ringing: window.LUXURY_APARTMENT.phone.ringing,
    inCall: window.LUXURY_APARTMENT.phone.inCall,
    held: window.LUXURY_APARTMENT.home.inventory.held,
    floor: window.LUXURY_APARTMENT.player.position.y > 3 ? 'loft' : 'main',
    status: JSON.parse(localStorage.getItem('squatchlife.campaign'))
      .events.booski_special_meeting_call?.status ?? null,
    objective: document.getElementById('objectives')?.textContent ?? '',
    ringLoop: window.LUXURY_APARTMENT.audio.loops.has('phone.ring'),
  }));
  check('Beat 27 answers the pocketed saved-game phone from the loft with the real interaction key',
    savedDistantRing.ringing
      && savedDistantRing.held === null
      && savedDistantRing.floor === 'loft'
      && /Answer Booskibro/i.test(savedDistantRing.objective)
      && !afterRingReload.ringing
      && afterRingReload.inCall
      && afterRingReload.held === null
      && afterRingReload.floor === 'loft'
      && afterRingReload.status === 'answered'
      && /Stay on the line/i.test(afterRingReload.objective)
      && !afterRingReload.ringLoop,
    JSON.stringify({
      initialAuxiliaryMetrics,
      ringingAuxiliaryMetrics,
      before: savedDistantRing,
      after: afterRingReload,
    }));
  console.log('  ...   Beat 27 real E answer received; draining the complete authored call');
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.phone.inCall === false
      && window.LUXURY_APARTMENT.phone.ringing === false
      && window.LUXURY_APARTMENT.debug.specialMeeting.receipts()
        .some(({ cue, receipt }) => cue === 'vo.specialmeeting.tony.dead_line.1'
          && receipt?.started === true)
  ), null, AUXILIARY_WAIT);
  /* The callback is player-authored: select the persisted phone with its real
   * number key, press real R, let the shared prelude expire the unanswered
   * ring, then pocket it before interacting with the room again. */
  const phoneSlot = await ringingReloadPage.evaluate(() => (
    window.LUXURY_APARTMENT.home.inventory.items.indexOf('phone') + 1
  ));
  if (phoneSlot < 1 || phoneSlot > 5) throw new Error(`Beat 27 phone slot invalid: ${phoneSlot}`);
  await ringingReloadPage.keyboard.press(String(phoneSlot));
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.home.inventory.held === 'phone'
  ), null, AUXILIARY_WAIT);
  await ringingReloadPage.keyboard.press('r');
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.debug.specialMeeting.snapshot().ringingOut > 0
  ), null, AUXILIARY_WAIT);
  await ringingReloadPage.evaluate(() => {
    const qa = window.LUXURY_APARTMENT.debug.specialMeeting;
    qa.advance({ seconds: 11.1, phoneClock: false, preludeClock: true, busy: true });
    qa.advance({ seconds: 0.6, phoneClock: false, preludeClock: true, busy: true });
  });
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.debug.specialMeeting.receipts()
      .some(({ cue, receipt }) => cue === 'vo.specialmeeting.tony.call_back.1'
        && receipt?.started === true)
  ), null, AUXILIARY_WAIT);
  await ringingReloadPage.keyboard.press('q');
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.home.inventory.held === null
      && !window.LUXURY_APARTMENT.audio.busy()
  ), null, AUXILIARY_WAIT);

  /* SM-060 replaces the pre-call stillness bank; this advances only that
   * authored idle wait and observes the real receipt. */
  await ringingReloadPage.evaluate(() => {
    window.LUXURY_APARTMENT.debug.specialMeeting.advance({
      seconds: 19.1, phoneClock: false, preludeClock: true, busy: false,
    });
  });
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.debug.specialMeeting.receipts()
      .some(({ cue, receipt }) => cue === 'vo.specialmeeting.tony.idle_after.1'
        && receipt?.started === true)
  ), null, AUXILIARY_WAIT);
  await ringingReloadPage.waitForFunction(
    () => !window.LUXURY_APARTMENT.audio.busy(), null, AUXILIARY_WAIT,
  );

  /* Stand at the authored wardrobe exit, aim the production camera and press
   * the real interaction key. The setup is the same pose-only allowance used
   * for the elevator below; the action still resolves through the raycaster. */
  const wardrobeApproach = await ringingReloadPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const target = runtime.home.utilityTargets.wardrobe;
    const pose = runtime.home.poses.wardrobe;
    runtime.player.position.set(pose.position.x, pose.exit.y + 1.66, pose.position.z);
    runtime.player.ground = pose.exit.y;
    runtime.player.grounded = true;
    runtime.player.jumpHeight = 0;
    runtime.player.yaw = pose.yaw;
    runtime.player.pitch = pose.pitch;
    runtime.player.update(0.001);
    runtime.camera.updateMatrixWorld(true);
    runtime.interaction.setPaused(false);
    runtime.interaction.update(0);
    return {
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      dressed: runtime.home.state.dressed,
    };
  });
  await ringingReloadPage.keyboard.press('e');
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.home.state.dressed === true
  ), null, AUXILIARY_WAIT);
  await ringingReloadPage.evaluate(() => {
    window.LUXURY_APARTMENT.debug.specialMeeting.advance({
      seconds: 1.7, phoneClock: false, preludeClock: true, busy: true,
    });
  });
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.debug.specialMeeting.receipts()
      .some(({ cue, receipt }) => cue === 'vo.specialmeeting.tony.getting_ready.1'
        && receipt?.started === true)
  ), null, AUXILIARY_WAIT);
  await ringingReloadPage.waitForFunction(
    () => !window.LUXURY_APARTMENT.audio.busy(), null, AUXILIARY_WAIT,
  );

  /* Try the actual elevator before the car. It must stay shut and speak the
   * first recorded SM-080 refusal, rather than silently opening its collider.
   * The wardrobe can legitimately return pointer lock to the browser; move out
   * of that posture first, then reacquire the game through the same canvas click
   * a player uses before aiming and pressing E. */
  await ringingReloadPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.teleport('arrival');
    /* `teleportToSpawn` moves the eye but deliberately leaves the previous
     * support sample alone. We just came from the loft wardrobe, so seed the
     * authored arrival floor before the next production Player update exactly
     * as the earlier loft setup does. */
    const arrivalGround = runtime.home.spawns.arrival.position.y - 1.68;
    runtime.player.position.y = arrivalGround + 1.66;
    runtime.player.ground = arrivalGround;
    runtime.player.grounded = true;
    runtime.player.jumpHeight = 0;
  });
  const beat27InputCaptured = await ringingReloadPage.evaluate(() => (
    window.LUXURY_APARTMENT.player.enabled
      && document.pointerLockElement === document.getElementById('scene')
  ));
  if (!beat27InputCaptured) {
    await ringingReloadPage.locator('#scene').click({ position: { x: 12, y: 12 } });
    await ringingReloadPage.waitForFunction(() => (
      window.LUXURY_APARTMENT.player.enabled
        && document.pointerLockElement === document.getElementById('scene')
    ), null, AUXILIARY_WAIT);
  }
  const earlyElevator = await ringingReloadPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const target = runtime.home.utilityTargets.elevator;
    const point = target.getWorldPosition(new target.position.constructor());
    const delta = point.clone().sub(runtime.player.position);
    runtime.player.yaw = Math.atan2(-delta.x, -delta.z);
    runtime.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.player.update(0.001);
    runtime.camera.updateMatrixWorld(true);
    runtime.interaction.setPaused(false);
    runtime.interaction.update(0);
    return {
      targetResolved: runtime.interaction.current === target,
      playerEnabled: runtime.player.enabled,
      pointerLocked: document.pointerLockElement === document.getElementById('scene'),
      position: runtime.player.position.toArray(),
      ground: runtime.player.ground,
      carOutside: runtime.debug.specialMeeting.activities().carOutside,
      elevatorOpen: runtime.home.state.elevatorOpen,
    };
  });
  if (!earlyElevator.targetResolved || !earlyElevator.playerEnabled || !earlyElevator.pointerLocked) {
    throw new Error(`Beat 27 early elevator input was not live: ${JSON.stringify(earlyElevator)}`);
  }
  await ringingReloadPage.keyboard.press('e');
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.debug.specialMeeting.receipts()
      .some(({ cue, receipt }) => cue === 'vo.specialmeeting.tony.door_refusal.1'
        && receipt?.started === true)
  ), null, AUXILIARY_WAIT);
  const afterCallDrained = await ringingReloadPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const saved = JSON.parse(localStorage.getItem('squatchlife.campaign'));
    return {
      ringing: runtime.phone.ringing,
      inCall: runtime.phone.inCall,
      status: saved.events.booski_special_meeting_call?.status ?? null,
      timeEventCopies: saved.story.timeEvents
        .filter((id) => id === 'call.booski_special_meeting').length,
      objective: document.getElementById('objectives')?.textContent ?? '',
      elevatorOpen: runtime.home.state.elevatorOpen,
      prelude: runtime.debug.specialMeeting.snapshot(),
      receipts: runtime.debug.specialMeeting.receipts(),
    };
  });
  await ringingReloadPage.reload({ waitUntil: 'domcontentloaded' });
  await ringingReloadPage.bringToFront();
  await ringingReloadPage.waitForFunction(
    () => Boolean(window.LUXURY_APARTMENT?.home),
    null,
    AUXILIARY_WAIT,
  );
  const answeredAuxiliaryMetrics = await applyAuxiliaryMetrics(
    ringingReloadPage,
    ringingReloadPageSession,
    { pinLuxuryRenderer: true },
  );
  console.log('  ...   Beat 27 call drained; reloading the answered save for duplicate suppression');
  await ringingReloadPage.locator('#start-btn').click();
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.state.phase === 'active'
      && window.LUXURY_APARTMENT.audio.hasSample('vo.specialmeeting.tony.headlights.1')
  ), null, AUXILIARY_WAIT);
  /* An answered reload resumes the existing pickup at 16 seconds instead of
   * replaying the 170-second first wait. Compress that wait, then the 1.5 s
   * authored headlight-line delay, through the runtime's clock seam. */
  await ringingReloadPage.evaluate(() => {
    const qa = window.LUXURY_APARTMENT.debug.specialMeeting;
    qa.advance({ seconds: 16.1, phoneClock: false, preludeClock: true, busy: true });
    qa.advance({ seconds: 1.6, phoneClock: false, preludeClock: true, busy: true });
  });
  await ringingReloadPage.waitForFunction(() => {
    const qa = window.LUXURY_APARTMENT.debug.specialMeeting;
    return qa.activities().carOutside
      && qa.receipts().some(({ cue, receipt }) => (
        cue === 'vo.specialmeeting.tony.headlights.1' && receipt?.started === true
      ));
  }, null, AUXILIARY_WAIT);
  const afterAnsweredReload = await ringingReloadPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const saved = JSON.parse(localStorage.getItem('squatchlife.campaign'));
    return {
      ringing: runtime.phone.ringing,
      inCall: runtime.phone.inCall,
      hotbarCopies: runtime.home.inventory.items.filter((id) => id === 'phone').length,
      campaignCopies: saved.inventory.carried.filter((id) => id === 'phone').length,
      status: saved.events.booski_special_meeting_call?.status ?? null,
      timeEventCopies: saved.story.timeEvents
        .filter((id) => id === 'call.booski_special_meeting').length,
      objective: document.getElementById('objectives')?.textContent ?? '',
      prelude: runtime.debug.specialMeeting.snapshot(),
      receipts: runtime.debug.specialMeeting.receipts(),
      engineLoop: runtime.audio.loops.has('specialmeeting.car'),
    };
  });
  const requiredPreludeCues = [
    'vo.specialmeeting.tony.idle_before.1',
    'vo.specialmeeting.tony.dead_line.1',
    'vo.specialmeeting.tony.call_back.1',
    'vo.specialmeeting.tony.idle_after.1',
    'vo.specialmeeting.tony.getting_ready.1',
    'vo.specialmeeting.tony.door_refusal.1',
    'vo.specialmeeting.tony.headlights.1',
  ];
  const allPreludeReceipts = [
    firstIdleReceipt,
    ...afterCallDrained.receipts,
    ...afterAnsweredReload.receipts,
  ].filter(Boolean);
  const preludeReceiptByCue = new Map(allPreludeReceipts.map((entry) => [entry.cue, entry]));
  check('a real save reload during the ring recovers the call, while an answered reload cannot duplicate it',
    beforeRingReload.ringing
      && beforeRingReload.held === null
      && beforeRingReload.status === 'pending'
      && !afterRingReload.ringing
      && afterRingReload.inCall
      && afterRingReload.held === null
      && afterRingReload.status === 'answered'
      && !afterRingReload.ringLoop
      && !afterCallDrained.ringing
      && !afterCallDrained.inCall
      && afterCallDrained.status === 'answered'
      && afterCallDrained.timeEventCopies === 1
      && /Wait in for the text/i.test(afterCallDrained.objective)
      && !afterCallDrained.elevatorOpen
      && !afterCallDrained.prelude.carOutside
      && !afterAnsweredReload.ringing
      && !afterAnsweredReload.inCall
      && afterAnsweredReload.hotbarCopies === 1
      && afterAnsweredReload.campaignCopies === 1
      && afterAnsweredReload.status === 'answered'
      && afterAnsweredReload.timeEventCopies === 1
      && !/Answer Booskibro/i.test(afterAnsweredReload.objective)
      && /Leave for the car downstairs/i.test(afterAnsweredReload.objective)
      && afterAnsweredReload.prelude.carOutside
      && afterAnsweredReload.engineLoop
      && [initialAuxiliaryMetrics, ringingAuxiliaryMetrics, answeredAuxiliaryMetrics]
        .every((metrics) => (
          metrics.css[0] === 640
            && metrics.css[1] === 400
            && metrics.dpr === 0.5
            && metrics.rendererDpr === 0.5
            && metrics.backing[0] === 320
            && metrics.backing[1] === 200
        )),
    JSON.stringify({
      beforeRingReload,
      afterRingReload,
      afterCallDrained,
      afterAnsweredReload,
      auxiliaryMetrics: {
        initial: initialAuxiliaryMetrics,
        ringing: ringingAuxiliaryMetrics,
        answered: answeredAuxiliaryMetrics,
      },
    }));
  check('all seven authored Beat 27 home-prelude banks reach the canonical luxury route as real recordings',
    wardrobeApproach.targetResolved
      && earlyElevator.targetResolved
      && !earlyElevator.carOutside
      && !earlyElevator.elevatorOpen
      && requiredPreludeCues.every((cue) => {
        const entry = preludeReceiptByCue.get(cue);
        return entry?.receipt?.started === true
          && entry.receipt.requested === cue
          && entry.receipt.actual === cue
          && entry.receipt.source === 'buffer';
      }),
    JSON.stringify({
      wardrobeApproach,
      earlyElevator,
      receipts: Object.fromEntries(requiredPreludeCues.map((cue) => [
        cue, preludeReceiptByCue.get(cue)?.receipt ?? null,
      ])),
    }));

  /* The `teleport` and pose calls below are setup only: they put the player
   * at the authored arrival spawn and aim the production camera. Both verbs --
   * calling the lift and riding it -- still have to resolve through the live
   * raycaster and the physical E key. */
  const beat27ElevatorApproach = await ringingReloadPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const target = runtime.home.utilityTargets.elevator;
    const moved = runtime.teleport('arrival');
    const targetPosition = target.getWorldPosition(new target.position.constructor());
    const delta = targetPosition.clone().sub(runtime.player.position);
    runtime.player.yaw = Math.atan2(-delta.x, -delta.z);
    runtime.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.player.update(0.001);
    runtime.camera.updateMatrixWorld(true);
    runtime.interaction.setPaused(false);
    runtime.interaction.update(0);
    return {
      moved,
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      elevatorOpen: runtime.home.state.elevatorOpen,
      colliderDisabled: runtime.home.doors.elevator.collider.max.y < 0,
      objective: document.getElementById('objectives')?.textContent ?? '',
    };
  });
  console.log('  ...   Beat 27 answered save stable; calling and riding the lift with two real E presses');
  await ringingReloadPage.keyboard.press('e');
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT.home.state.elevatorOpen
      && window.LUXURY_APARTMENT.home.doors.elevator.collider.max.y < 0
  ), null, AUXILIARY_WAIT);
  const beat27ElevatorCalled = await ringingReloadPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const target = runtime.home.utilityTargets.elevator;
    runtime.player.update(0.001);
    runtime.camera.updateMatrixWorld(true);
    runtime.interaction.update(0);
    return {
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      elevatorOpen: runtime.home.state.elevatorOpen,
      colliderDisabled: runtime.home.doors.elevator.collider.max.y < 0,
      phase: runtime.state.phase,
    };
  });
  const beat27Navigation = ringingReloadPage.waitForURL('**/specialmeeting.html*', {
    waitUntil: 'domcontentloaded',
    timeout: AUXILIARY_WAIT.timeout,
  });
  await ringingReloadPage.keyboard.press('e');
  await ringingReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT?.state?.phase === 'exiting'
  ), null, AUXILIARY_WAIT);
  await beat27Navigation;
  await ringingReloadPage.bringToFront();
  await applyAuxiliaryMetrics(ringingReloadPage, ringingReloadPageSession);
  await ringingReloadPage.waitForFunction(
    () => Boolean(window.SPECIAL_MEETING),
    null,
    AUXILIARY_WAIT,
  );
  /* A real click on the destination canvas is its canonical browser-required
   * audio gesture (the scene's own verifier uses the same path). The
   * pickup cannot enter SM-100 until the voice bank is ready and the authored
   * street arrival has physically settled, so this wait proves the real first
   * scene beat rather than merely accepting a URL. */
  await ringingReloadPage.locator('#scene').click({ position: { x: 320, y: 180 } });
  await ringingReloadPage.waitForFunction(() => {
    const runtime = window.SPECIAL_MEETING;
    return runtime.voiceReady || runtime.voiceLoadError;
  }, null, AUXILIARY_WAIT);
  const beat27Voice = await ringingReloadPage.evaluate(() => {
    const runtime = window.SPECIAL_MEETING;
    return {
      ready: runtime.voiceReady,
      expected: runtime.expectedVoiceCueCount,
      decoded: runtime.decodedVoiceCueCount,
      missing: runtime.missingVoiceCues,
      failed: runtime.failedCues,
      error: runtime.voiceLoadError,
    };
  });
  console.log(`  ...   Beat 27 destination voice bank ready: ${beat27Voice.decoded}/${beat27Voice.expected}`);
  /* The street arrival settling took ~130 s on an otherwise IDLE box in
   * verify-specialmeeting.mjs's own measurement — its whole file runs on a
   * 600 s convention for sim-gated waits. The 90 s this wait launched with
   * was never enough wall clock for SwiftShader to land the car. */
  await ringingReloadPage.waitForFunction(() => {
    const runtime = window.SPECIAL_MEETING;
    return runtime.stage.arrival?.settled
      && runtime.ride.beatId === 'SM-100';
  }, null, AUXILIARY_WAIT);
  const beat27Landing = await ringingReloadPage.evaluate(() => {
    const runtime = window.SPECIAL_MEETING;
    const saved = JSON.parse(localStorage.getItem('squatchlife.campaign'));
    return {
      path: location.pathname,
      requestedSpawn: runtime.certification.requestedSpawn,
      effectiveSpawn: runtime.certification.effectiveSpawn,
      campaignScene: runtime.certification.campaignScene,
      featuredPickup: Boolean(runtime.stage.block.group.getObjectByName('featured-pickup')),
      voiceReady: runtime.voiceReady,
      expectedVoiceCues: runtime.expectedVoiceCueCount,
      decodedVoiceCues: runtime.decodedVoiceCueCount,
      missingVoiceCues: runtime.missingVoiceCues,
      failedVoiceCues: runtime.failedCues,
      voiceLoadError: runtime.voiceLoadError,
      arrival: runtime.certification.arrival,
      rideBeat: runtime.certification.rideBeat,
      callStatus: saved.events.booski_special_meeting_call?.status ?? null,
      timeEventCopies: saved.story.timeEvents
        .filter((id) => id === 'call.booski_special_meeting').length,
    };
  });
  check('Beat 27 uses two real elevator E presses and lands at the authored kerb pickup',
    beat27ElevatorApproach.moved
      && beat27ElevatorApproach.targetResolved
      && !beat27ElevatorApproach.elevatorOpen
      && !beat27ElevatorApproach.colliderDisabled
      && /Leave for the car downstairs/i.test(beat27ElevatorApproach.objective)
      && beat27ElevatorCalled.targetResolved
      && beat27ElevatorCalled.elevatorOpen
      && beat27ElevatorCalled.colliderDisabled
      && beat27ElevatorCalled.phase === 'active'
      && beat27Landing.path.endsWith('/specialmeeting.html')
      && beat27Landing.requestedSpawn === 'kerb'
      && beat27Landing.effectiveSpawn === 'kerb'
      && beat27Landing.campaignScene.id === 'special_meeting'
      && beat27Landing.campaignScene.spawn === 'kerb'
      && beat27Landing.featuredPickup
      && beat27Landing.voiceReady
      && beat27Landing.decodedVoiceCues === beat27Landing.expectedVoiceCues
      && beat27Landing.missingVoiceCues.length === 0
      && beat27Landing.failedVoiceCues.length === 0
      && !beat27Landing.voiceLoadError
      && beat27Landing.arrival.settled
      && beat27Landing.rideBeat === 'SM-100'
      && beat27Landing.callStatus === 'answered'
      && beat27Landing.timeEventCopies === 1,
    JSON.stringify({
      approach: beat27ElevatorApproach,
      called: beat27ElevatorCalled,
      voice: beat27Voice,
      landing: beat27Landing,
    }));
  await ringingReloadPage.close();
  page = await context.newPage();
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 400)}`);
  });
  page.on('requestfailed', (request) => {
    /* ERR_ABORTED is a CANCELLATION, not a failure: the two real elevator
     * rides navigate this page to preview.html while wall art is still
     * streaming, and every in-flight image is aborted by design. A missing
     * file reports as a 404 through the static server, never as an abort. */
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    problems.push(`request: ${request.url()} - ${request.failure()?.errorText || 'failed'}`);
  });
  await page.bringToFront();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://127.0.0.1:${PORT}/luxury-apartment.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => Boolean(window.LUXURY_APARTMENT?.home));
  await settleRenderedFrames(page, 2);
  if (process.env.LUXURY_APARTMENT_BEAT27_ONLY !== '1') {
    check('the authored walkable contract is two disjoint floors joined by elevation',
    authored.metrics.floors === 2
      && authored.mainFloorY === 0
      && authored.loftFloorY > authored.mainFloorY
      && !authored.walkableOverlap,
    JSON.stringify({
      floors: authored.metrics.floors,
      mainY: authored.mainFloorY,
      loftY: authored.loftFloorY,
      walkableOverlap: authored.walkableOverlap,
    }));
  check('all 18 stair treads and the loft landing stay within the player step limit',
    authored.metrics.stairSteps === 18
      && authored.stairTops.length === 18
      && authored.reportedStepRise > 0
      && authored.reportedStepRise <= 0.4
      && authored.reportedStepRun > 0
      && authored.stairRises.every((rise) => rise > 0 && rise <= 0.4)
      && authored.lastRise > 0
      && authored.lastRise <= 0.4,
    JSON.stringify({
      steps: authored.stairTops.length,
      stepRise: authored.reportedStepRise,
      stepRun: authored.reportedStepRun,
      largestMeasuredRise: Math.max(authored.lastRise, ...authored.stairRises),
    }));
  check('double-height panoramic glass spans the south and east city walls',
    authored.windowPanes.length === 19
      && authored.windowPanes.some((name) => name.includes('-south-'))
      && authored.windowPanes.some((name) => name.includes('-east-'))
      && authored.metrics.doubleHeightMetres >= 6.5
      && authored.metrics.panoramicWindowArea > authored.metrics.mainFloorArea,
    JSON.stringify({
      panes: authored.windowPanes.length,
      height: authored.metrics.doubleHeightMetres,
      windowArea: authored.metrics.panoramicWindowArea,
      mainFloorArea: authored.metrics.mainFloorArea,
    }));
  check('the skyline is a setback, multi-depth two-facade city with roof detail',
    authored.metrics.cityBuildings >= 14
      && authored.skylineMasses.length >= authored.metrics.cityBuildings
      && authored.skylineWindows >= authored.metrics.cityBuildings * 10
      && authored.skylineWindows === authored.metrics.cityWindows
      && authored.skylineWindowsSouth === authored.metrics.cityWindowsSouth
      && authored.skylineWindowsEast === authored.metrics.cityWindowsEast
      && authored.skylineWindowsSouth >= 100
      && authored.skylineWindowsEast >= 100
      && authored.skylineDepthBands.length >= 3
      && authored.metrics.cityMinimumSetback >= 12
      && authored.skylineRoofFeatures >= authored.metrics.cityBuildings,
    JSON.stringify({
      buildings: authored.metrics.cityBuildings,
      masses: authored.skylineMasses.length,
      litWindows: authored.skylineWindows,
      southWindows: authored.skylineWindowsSouth,
      eastWindows: authored.skylineWindowsEast,
      depthBands: authored.skylineDepthBands,
      setback: authored.metrics.cityMinimumSetback,
      roofs: authored.skylineRoofFeatures,
    }));
  check('both panorama skies respond together to morning and authored 8:30 PM grading',
    authored.skyMaterialShared
      && authored.skyCornerOverlap >= 5
      && authored.morningSky.southColor === authored.morningSky.eastColor
      && authored.nightSky.southColor === authored.nightSky.eastColor
      && authored.morningSky.southOpacity === authored.morningSky.eastOpacity
      && authored.nightSky.southOpacity === authored.nightSky.eastOpacity
      && authored.morningSky.southOpacity > authored.nightSky.southOpacity
      && authored.morningSky.phase === 'day'
      && authored.nightSky.phase === 'night',
    JSON.stringify({
      cornerOverlap: authored.skyCornerOverlap,
      morning: authored.morningSky,
      night: authored.nightSky,
    }));
  check('all 61 inherited apartment art assets and all 13 non-conflicting additions resolve real files',
    authored.metrics.originalArtSlots === 61
      && authored.metrics.extraArtSlots === 13
      && authored.apartmentArt === 61
      && authored.luxuryArt === 13
      && authored.art.length === 74
      && authored.art.every(({ real, file, width, height, zone, kind }) => (
        real && file && width > 0 && height > 0 && zone && kind
      )),
    JSON.stringify({
      original: authored.apartmentArt,
      extra: authored.luxuryArt,
      unresolved: authored.art.filter(({ real }) => !real).map(({ slot }) => slot),
    }));
  check('art taxonomy proves 54 hung, 6 standing/under-bed, and 14 prop-only placements',
    authored.metrics.hungArtSlots === 54
      && authored.metrics.standingArtSlots === 6
      && authored.metrics.displayArtSlots === 60
      && authored.metrics.propTextureSlots === 14
      && authored.artTargetCount === 60
      && authored.displayArt.length === 60
      && authored.propArt.length === 14
      && authored.propArt.every(({ textureAttached }) => textureAttached)
      && authored.visibleArtSlots.length === 74
      && authored.expectedPropPlaced.every(Boolean)
      && authored.extraArtZones.length === 13
      && authored.extraArtZones.every(Boolean),
    JSON.stringify({
      hung: authored.metrics.hungArtSlots,
      standing: authored.metrics.standingArtSlots,
      displays: authored.displayArt.length,
      propOnly: authored.propArt.length,
      missingPropTextures: authored.propArt.filter(({ textureAttached }) => !textureAttached).map(({ slot }) => slot),
      visible: authored.visibleArtSlots.length,
      extraZones: authored.extraArtZones,
    }));
  check('every station pose exit has at least 0.30m clear of collision',
    authored.poseExitClearances.length === 12
      && authored.poseExitClearances.every(({ clearance }) => clearance >= 0.30 - 1e-6),
    JSON.stringify(authored.poseExitClearances));
  check('the 8:30 PM interior has a live chandelier and controlled museum hero-art washes',
    authored.chandelier.pointLight
      && authored.chandelier.intensity >= 100
      && authored.artLightIntensities.length === 2
      && authored.artLightIntensities.every((intensity) => intensity >= 35 && intensity <= 45),
    JSON.stringify({ chandelier: authored.chandelier, art: authored.artLightIntensities }));
  check('the lounge return is a joined 90-degree sectional with rotated collision',
    authored.sectional.primaryExists
      && authored.sectional.returnExists
      && Math.abs(authored.sectional.returnYaw - Math.PI / 2) < 1e-9
      && Math.abs(authored.sectional.returnWidth - 2.18) < 1e-9
      && Math.abs(authored.sectional.returnDepth - 0.94) < 1e-9
      && authored.sectional.returnCenterZ >= 5.29
      && authored.sectional.joined,
    JSON.stringify(authored.sectional));
  check('arcade and poker seating are aligned physical fixtures with collision',
    authored.seating.arcade === 'luxury-arcade-stool'
      && authored.seating.arcadeCollider
      && authored.seating.poker.length === 4
      && authored.seating.pokerColliders.every(Boolean),
    JSON.stringify(authored.seating));
  check('the office slat divider collides without closing its circulation end',
    authored.officeDivider.colliders === 7
      && authored.officeDivider.circulationClearance >= 0.30,
    JSON.stringify(authored.officeDivider));
  check('the service door is sealed and the furnished private elevator is the canonical arrival',
    authored.entrance.serviceDoorLocked
      && !authored.entrance.serviceDoorOpen
      && authored.entrance.servicePlate
      && !authored.entrance.elevatorOpen
      && authored.entrance.elevatorCab
      && authored.entrance.elevatorCabParts >= 5
      && authored.entrance.arrivalGround === 0,
    JSON.stringify(authored.entrance));
  check('the under-stair bathroom is a complete main-floor room with mounted fixtures',
    authored.bathroom.floorY === 0
      && authored.bathroom.metricFloorY === 0
      && authored.bathroom.lowGround === 0
      && authored.bathroom.highGround === authored.loftFloorY
      && authored.bathroom.shellName === 'luxury-under-stair-bathroom'
      && authored.bathroom.floorPresent
      && authored.bathroom.ceiling.name === 'luxury-bath-ceiling'
      && authored.bathroom.ceiling.min[0] <= authored.bathroom.bounds.x0 + 1e-6
      && authored.bathroom.ceiling.max[0] >= authored.bathroom.bounds.x1 - 1e-6
      && authored.bathroom.ceiling.min[2] <= authored.bathroom.bounds.z0 + 1e-6
      && authored.bathroom.ceiling.max[2] >= authored.bathroom.bounds.z1 - 1e-6
      && authored.bathroom.ceiling.stemGap >= 0
      && authored.bathroom.ceiling.stemGap <= 0.05
      && authored.bathroom.walls === 5
      && authored.bathroom.doorPresent
      && authored.bathroom.doorInitiallyOpen
      && authored.bathroom.doorGlassOpacity <= 0.28
      && authored.bathroom.doorWidth >= 0.78
      && authored.bathroom.roomWidth >= 3.6
      && authored.bathroom.doorClearsStairRail
      && authored.bathroom.thresholdPresent
      && authored.bathroom.thresholdZone === 'tile'
      && authored.bathroom.plinthDoorJamb
      && authored.bathroom.plinthDoorCap
      && authored.bathroom.tileZone === 'tile'
      && authored.bathroom.tileZoneY === 0
      && authored.bathroom.mirrorGeometry === 'PlaneGeometry'
      && authored.bathroom.toiletPaperMounted
      && authored.bathroom.artZone === 'under-stair-bathroom'
      && authored.bathroom.toilet.x > authored.bathroom.bounds.x0
      && authored.bathroom.toilet.x < authored.bathroom.bounds.x1
      && authored.bathroom.toilet.z > authored.bathroom.bounds.z0
      && authored.bathroom.toilet.z < authored.bathroom.bounds.z1
      && authored.bathroom.sink.x > authored.bathroom.bounds.x0
      && authored.bathroom.sink.x < authored.bathroom.bounds.x1
      && authored.bathroom.sink.z > authored.bathroom.bounds.z0
      && authored.bathroom.sink.z < authored.bathroom.bounds.z1
      && Math.abs(authored.bathroom.bounds.x1 - authored.bathroom.toiletPaper.x) <= 0.15
      && authored.bathroom.toiletPaper.y > 0.5
      && authored.bathroom.light.fixtureName === 'luxury-light-main-bathroom'
      && authored.bathroom.light.position.x > authored.bathroom.bounds.x0
      && authored.bathroom.light.position.x < authored.bathroom.bounds.x1
      && authored.bathroom.light.position.y > 2.2
      && authored.bathroom.light.position.y < 2.66
      && authored.bathroom.light.position.z > authored.bathroom.bounds.z0
      && authored.bathroom.light.position.z < authored.bathroom.bounds.z1
      && authored.bathroom.light.intensity === 4
      && authored.bathroom.light.distance >= 5
      && authored.bathroom.light.color === 0xe9f2ff
      && authored.bathroom.light.mainCircuit
      && !authored.bathroom.light.loftCircuit
      && authored.bathroom.light.retiredLoftFixtureAbsent,
    JSON.stringify(authored.bathroom));
  check('the workstation, poker room, darts wall, bedroom, and skyline retain the authored polish contracts',
    authored.workstation.chairMaterial === 'dark'
      && authored.workstation.zynDesktopHalf === 'front'
      && authored.workstation.zyn.y > authored.loftFloorY
      && authored.pokerPolish.patrons === 0
      && authored.pokerPolish.actors === 0
      && authored.pokerPolish.seats === 4
      && authored.pokerPolish.railPresent
      && authored.pokerPolish.feltPresent
      && authored.pokerPolish.railOval === 1
      && authored.pokerPolish.feltOval === 1
      && authored.dartsPolish.board
      && authored.dartsPolish.numberedFace === 'luxury-darts-numbered-face'
      && authored.dartsPolish.faceTexture
      && authored.dartsPolish.sections === 20
      && authored.dartsPolish.topSection === 20
      && authored.dartsPolish.spotLight
      && authored.dartsPolish.backing
      && authored.dartsPolish.rack
      && authored.dartsPolish.impactRoot
      && Math.abs(authored.dartsPolish.normal.x) < 1e-9
      && Math.abs(authored.dartsPolish.normal.y) < 1e-9
      && Math.abs(authored.dartsPolish.normal.z - 1) < 1e-9
      && authored.bedroomPolish.wallPresent
      && authored.bedroomPolish.wallPanels === 2
      && authored.bedroomPolish.bannerZones.every((zone) => zone === 'bedroom-privacy-wall')
      && authored.bedroomPolish.photoZones.every((zone) => zone === 'bedroom-headboard-photos')
      && authored.decorPolish.fittedAppliance
      && authored.decorPolish.stairFocal
      && Math.abs(authored.decorPolish.consoleYaw - Math.PI) < 1e-9
      && authored.decorPolish.consoleChildren >= 6
      && authored.decorPolish.crestX === -5.55
      && authored.decorPolish.removedArcadeArt
      && authored.decorPolish.historyRow.every((zone) => zone === 'loft-office-history-row')
      && authored.cityGround.present
      && authored.cityGround.groundY === authored.cityGround.lowestBuildingY,
    JSON.stringify({
      workstation: authored.workstation,
      poker: authored.pokerPolish,
      darts: authored.dartsPolish,
      bedroom: authored.bedroomPolish,
      decor: authored.decorPolish,
      cityGround: authored.cityGround,
    }));
  check('the bathroom mirror and darts physics consume the approved shared foundations',
    LUXURY_MAIN_SOURCE.includes("from '../core/planar-mirror.js'")
      && LUXURY_MAIN_SOURCE.includes('new PlanarMirror(')
      && LUXURY_MAIN_SOURCE.includes("from '../core/first-person-body.js'")
      && LUXURY_MAIN_SOURCE.includes('new FirstPersonBody(')
      && authored.reflectionBody.present
      && authored.reflectionBody.layer === 1
      && LUXURY_RUNTIME_SOURCE.includes("from '../core/throwable.js'")
      && LUXURY_RUNTIME_SOURCE.includes('new BallisticProjectile(')
      && LUXURY_RUNTIME_SOURCE.includes('new ThrowCharge('),
    'PlanarMirror + shared throwable primitives');
  check('the complete domestic utility set is present and interactive',
    authored.utilities.length === EXPECTED_UTILITIES.length
      && authored.utilities.every(({ exists, interactive }) => exists && interactive),
    JSON.stringify({
      utilities: authored.utilities.length,
      missing: authored.utilities.filter(({ exists, interactive }) => !exists || !interactive),
    }));
  check('the loft PC carries exactly the seven installed Squatch OS applications',
    JSON.stringify(sorted(authored.pcApps)) === JSON.stringify(sorted(EXPECTED_PC_APPS))
      && authored.appLookup.every(Boolean)
      && authored.pcLaunchById,
    JSON.stringify({ apps: authored.pcApps }));
  check('the cabinet, deliberately solo poker table, and darts board are authored stations',
    authored.cabinetStation
      && JSON.stringify(sorted(authored.cabinetApps)) === JSON.stringify(sorted(EXPECTED_PC_APPS))
      && authored.pokerSolo
      && !authored.blackjackMounted
      && authored.darts
      && ['pc', 'arcade', 'poker', 'darts', 'console']
        .every((id) => authored.gameStations.includes(id)),
    JSON.stringify({ stations: authored.gameStations, cabinetApps: authored.cabinetApps }));

  await capture(page, 'luxury-arrival');
  await page.locator('#start-btn').click();
  await page.waitForFunction(() => window.LUXURY_APARTMENT?.state?.phase === 'active');
  await page.waitForTimeout(250);

  const playing = await page.evaluate(() => ({
    phase: window.LUXURY_APARTMENT.state.phase,
    mode: window.LUXURY_APARTMENT.player.mode,
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  }));
  check('entering the apartment hands control to the first-person runtime',
    playing.phase === 'active' && playing.mode === 'walk' && playing.overlayHidden,
    JSON.stringify(playing));

  /* The hi-fi is a real physical receiver, so prove its save through the
   * same quick E press a player uses. Positioning the player is only test
   * setup; target resolution and the toggle travel through the live camera
   * ray, shared InteractionSystem, canonical input Adapter, and DOM key. */
  const stageLuxuryRadio = async (targetPage) => targetPage.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const target = runtime.home.utilityTargets.radio;
    const pose = runtime.home.poses.radio;
    runtime.teleport('main');
    runtime.player.position.set(pose.exit.x, pose.exit.y + 1.68, pose.exit.z);
    runtime.player.ground = pose.exit.y;
    runtime.player.mode = 'walk';
    runtime.player.velocity.set(0, 0, 0);
    runtime.player.clearKeys();
    runtime.home.root.updateMatrixWorld(true);
    const targetPosition = target.getWorldPosition(new target.position.constructor());
    const delta = targetPosition.clone().sub(runtime.player.position);
    runtime.player.yaw = Math.atan2(-delta.x, -delta.z);
    runtime.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.player.update(0.001);
    runtime.camera.updateMatrixWorld(true);
    runtime.interaction.setPaused(false);
    runtime.interaction.update(0);
    return {
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      distance: runtime.camera.position.distanceTo(targetPosition),
    };
  });
  const initialRadio = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    return {
      on: runtime.radio.on,
      preferredOn: runtime.radio.preferredOn,
      savedPower: runtime.radio.state.load().power,
      worldOn: runtime.home.state.radioOn,
    };
  });
  check('a fresh luxury-apartment receiver is default-off',
    !initialRadio.on && !initialRadio.preferredOn
      && !initialRadio.savedPower && !initialRadio.worldOn,
    JSON.stringify(initialRadio));

  if (!await page.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS')) {
    await page.locator('canvas').click({ position: { x: 640, y: 360 } });
  }
  const luxuryRadioApproach = await stageLuxuryRadio(page);
  check('the hi-fi resolves before the real E press', luxuryRadioApproach.targetResolved,
    JSON.stringify(luxuryRadioApproach));
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.LUXURY_APARTMENT.radio.on === true);
  const radioOn = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    return {
      on: runtime.radio.on,
      preferredOn: runtime.radio.preferredOn,
      savedPower: runtime.radio.state.load().power,
      worldOn: runtime.home.state.radioOn,
      talkBeds: Number(runtime.audio.loops.has('radio.talk')),
    };
  });
  check('real E on the luxury hi-fi resolves the target and persists its switch',
    luxuryRadioApproach.targetResolved && luxuryRadioApproach.distance < 3
      && radioOn.on && radioOn.preferredOn && radioOn.savedPower && radioOn.worldOn
      && radioOn.talkBeds === 1,
    JSON.stringify({ approach: luxuryRadioApproach, radioOn }));

  /* A second page in the SAME browser context is the reload receipt. The
   * constructor may remember the switch, but it must remain silent until a
   * new start-button gesture has unlocked that page's AudioContext. Suspend
   * the first page before opening it so this lifecycle proof never creates
   * two audible station contexts merely for the sake of testing one. */
  await page.evaluate(() => window.LUXURY_APARTMENT.audio.ctx?.suspend());
  await page.waitForFunction(() => window.LUXURY_APARTMENT.audio.ctx?.state === 'suspended');
  const radioReloadPage = await page.context().newPage();
  radioReloadPage.setDefaultTimeout(180000);
  radioReloadPage.on('pageerror', (error) => problems.push(`radio reload pageerror: ${error.message}`));
  radioReloadPage.on('console', (message) => {
    if (message.type() === 'error') problems.push(`radio reload console: ${message.text().slice(0, 400)}`);
  });
  radioReloadPage.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    problems.push(`radio reload request: ${request.url()} - ${request.failure()?.errorText || 'failed'}`);
  });
  await radioReloadPage.goto(`http://127.0.0.1:${PORT}/luxury-apartment.html`, {
    waitUntil: 'domcontentloaded',
  });
  await radioReloadPage.waitForFunction(() => Boolean(window.LUXURY_APARTMENT?.home));
  const beforeReloadGesture = await radioReloadPage.evaluate(() => ({
    on: window.LUXURY_APARTMENT.radio.on,
    preferredOn: window.LUXURY_APARTMENT.radio.preferredOn,
    savedPower: window.LUXURY_APARTMENT.radio.state.load().power,
    worldOn: window.LUXURY_APARTMENT.home.state.radioOn,
  }));
  check('reload remembers luxury receiver power without attempting pre-gesture autoplay',
    !beforeReloadGesture.on && beforeReloadGesture.preferredOn
      && beforeReloadGesture.savedPower && !beforeReloadGesture.worldOn,
    JSON.stringify(beforeReloadGesture));
  await radioReloadPage.locator('#start-btn').click();
  await radioReloadPage.waitForFunction(() => (
    window.LUXURY_APARTMENT?.state?.phase === 'active'
      && window.LUXURY_APARTMENT.radio.on === true
  ));
  const afterReloadGesture = await radioReloadPage.evaluate(() => ({
    on: window.LUXURY_APARTMENT.radio.on,
    preferredOn: window.LUXURY_APARTMENT.radio.preferredOn,
    savedPower: window.LUXURY_APARTMENT.radio.state.load().power,
    worldOn: window.LUXURY_APARTMENT.home.state.radioOn,
    talkBeds: Number(window.LUXURY_APARTMENT.audio.loops.has('radio.talk')),
  }));
  const originalRadioContext = await page.evaluate(() => window.LUXURY_APARTMENT.audio.ctx?.state ?? null);
  check('the next real start gesture restores one luxury receiver bed and synchronizes the world prop',
    afterReloadGesture.on && afterReloadGesture.preferredOn
      && afterReloadGesture.savedPower && afterReloadGesture.worldOn
      && afterReloadGesture.talkBeds === 1 && originalRadioContext === 'suspended',
    JSON.stringify({ reload: afterReloadGesture, originalRadioContext }));
  await radioReloadPage.close();

  await page.bringToFront();
  await page.evaluate(() => window.LUXURY_APARTMENT.audio.ctx?.resume());
  if (!await page.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS')) {
    await page.locator('canvas').click({ position: { x: 640, y: 360 } });
  }
  await stageLuxuryRadio(page);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.LUXURY_APARTMENT.radio.on === false);
  const radioOff = await page.evaluate(() => ({
    on: window.LUXURY_APARTMENT.radio.on,
    preferredOn: window.LUXURY_APARTMENT.radio.preferredOn,
    savedPower: window.LUXURY_APARTMENT.radio.state.load().power,
    worldOn: window.LUXURY_APARTMENT.home.state.radioOn,
  }));
  check('a second real E press persists off and leaves later verifier work with no station overlap',
    !radioOff.on && !radioOff.preferredOn && !radioOff.savedPower && !radioOff.worldOn,
    JSON.stringify(radioOff));

  /* Beats 16 and 17 are one physical two-floor scene, so their evidence is
   * staged from its own deterministic presentation hooks rather than from
   * arbitrary sleeps. These hooks spend no campaign markers and call no
   * interaction handler; the unit contract separately drives the real
   * seven-pull sequence. Here the live WebGL composition proves that every
   * authored position exists, is visible, and stays on the intended floor. */
  await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.state.paused = true;
    /* Screenshots may cause headless Chromium to abandon pointer lock. Do the
     * release through the shared Adapter first so its drag-fallback state
     * cannot turn the next capture click into a world interaction. */
    runtime.input.releasePointerLock();
  });
  await page.waitForFunction(() => document.pointerLockElement === null);
  const margoIds = await page.evaluate(() => window.LUXURY_APARTMENT.debug.margo.checkpointIds);
  const margoExpectations = [
    { id: margoIds.ENTRANCE, pose: 'standing', phase: 'entrance', y: [0.80, 1.00], progress: [0.02, 0.08], snoring: false, eye: [0, 0.9, 2.4] },
    { id: margoIds.STAIRS, pose: 'standing', phase: 'stairs', y: [2.40, 2.70], progress: [0.20, 0.80], snoring: false, eye: [2.5, 1.2, 2.2] },
    { id: margoIds.UPSTAIRS_DRESS, pose: 'kneeling', phase: 'dress-help', y: [3.70, 3.90], progress: [0.99, 1], snoring: false, eye: [-2.2, 1.15, 2.0] },
    { id: margoIds.SLEEP, pose: 'lying', phase: 'sleep', y: [4.15, 4.32], progress: [0.99, 1], snoring: true, eye: [-2.5, 1.0, 2.1] },
    { id: margoIds.MORNING_DEPARTURE, pose: 'standing', phase: 'morning-departure', y: [0.80, 1.80], progress: [0.90, 0.94], snoring: false, eye: [-2.4, 1.1, 2.0] },
  ];
  const margoReports = [];
  for (const expected of margoExpectations) {
    let report = await page.evaluate(({ id, eye }) => {
      const runtime = window.LUXURY_APARTMENT;
      const staged = runtime.debug.margo.stage(id);
      runtime.state.paused = true;
      /* The checkpoint freezes the main frame immediately. Settle the actual
       * lift leaves to the checkpoint's requested state so entrance/departure
       * evidence cannot photograph Margo hidden behind a still-closing door. */
      for (let index = 0; index < 180; index++) {
        runtime.home.doors.elevator.update(1 / 120);
      }
      runtime.camera.position.set(
        staged.position[0] + eye[0],
        staged.position[1] + eye[1],
        staged.position[2] + eye[2],
      );
      runtime.camera.lookAt(staged.position[0], staged.position[1] + 0.38, staged.position[2]);
      runtime.camera.updateMatrixWorld(true);
      return staged;
    }, expected);

    if (expected.id === margoIds.SLEEP) {
      await page.evaluate(() => { window.LUXURY_APARTMENT.state.paused = false; });
      await page.waitForFunction(() => window.LUXURY_APARTMENT.debug.margo.report().snoring.plays >= 1);
      report = await page.evaluate(({ eye }) => {
        const runtime = window.LUXURY_APARTMENT;
        const staged = runtime.debug.margo.report();
        runtime.state.paused = true;
        runtime.camera.position.set(
          staged.position[0] + eye[0],
          staged.position[1] + eye[1],
          staged.position[2] + eye[2],
        );
        runtime.camera.lookAt(staged.position[0], staged.position[1] + 0.25, staged.position[2]);
        runtime.camera.updateMatrixWorld(true);
        return {
          ...staged,
          snoreEvidence: {
            decoded: (runtime.audio.buffers.get('margo.snore')?.length ?? 0) > 0,
            playedBuffer: runtime.audio.playbacks.some((playback) => (
              playback.name === 'margo.snore' && playback.source === 'buffer'
            )),
          },
        };
      }, expected);
    }

    const position = report.position;
    const valid = report.checkpoint === expected.id
      && report.visible
      && report.pose === expected.pose
      && report.phase === expected.phase
      && position.every(Number.isFinite)
      && position[1] >= expected.y[0]
      && position[1] <= expected.y[1]
      && report.pathProgress >= expected.progress[0]
      && report.pathProgress <= expected.progress[1]
      && report.snoring.active === expected.snoring
      && (expected.id !== margoIds.SLEEP || (
        report.snoring.plays >= 1
        && report.snoreEvidence?.decoded
        && report.snoreEvidence?.playedBuffer
      ));
    margoReports.push({ ...report, valid });
    check(`Margo's ${expected.id} checkpoint is visibly staged on the authored route`,
      valid,
      JSON.stringify(report));
    await capture(page, `margo-${expected.id}`);
  }
  await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.debug.margo.clear();
    runtime.state.paused = false;
    /* Evidence staging freezes the authored frame without opening the pause
     * menu. Re-read the real input policy at the same seam so a pointer-lock
     * change observed while frozen cannot leave the Player disabled. */
    runtime.input.refresh('margo-evidence-complete');
  });

  const cleanStartBefore = await page.evaluate(() => {
    const { player } = window.LUXURY_APARTMENT;
    return { position: player.position.toArray(), yaw: player.yaw, enabled: player.enabled };
  });
  const cleanStartPointerLocked = await page.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS');
  if (!cleanStartPointerLocked) {
    // The first click acquires pointer lock. If lock is already held, clicking
    // would itself invoke the live interaction and make the following E close
    // the door again before the verifier samples the open state.
    await page.locator('canvas').click({ position: { x: 640, y: 360 } });
  }
  await page.mouse.move(640, 360);
  await page.mouse.move(700, 330, { steps: 3 });
  await page.keyboard.down('w');
  await page.waitForFunction(({ x, z }) => {
    const position = window.LUXURY_APARTMENT.player.position;
    return Math.hypot(position.x - x, position.z - z) >= 0.08;
  }, { x: cleanStartBefore.position[0], z: cleanStartBefore.position[2] }, {
    timeout: 15000,
    polling: 100,
  });
  await page.keyboard.up('w');
  const cleanStartAfter = await page.evaluate(() => {
    const { player } = window.LUXURY_APARTMENT;
    return {
      position: player.position.toArray(),
      yaw: player.yaw,
      enabled: player.enabled,
      locked: document.pointerLockElement?.tagName === 'CANVAS',
    };
  });
  const cleanStartDistance = Math.hypot(
    cleanStartAfter.position[0] - cleanStartBefore.position[0],
    cleanStartAfter.position[2] - cleanStartBefore.position[2],
  );
  const cleanStartYaw = Math.abs(Math.atan2(
    Math.sin(cleanStartAfter.yaw - cleanStartBefore.yaw),
    Math.cos(cleanStartAfter.yaw - cleanStartBefore.yaw),
  ));
  check('a clean Luxury start responds to real pointer-lock, mouse-look, and W input',
    cleanStartAfter.enabled
      && cleanStartAfter.locked
      // The private-elevator arrival starts close to its cab threshold; the
      // invariant is that real W produces meaningful displacement before the
      // collision boundary, not that the verifier gets to walk through it.
      && cleanStartDistance >= 0.08
      && cleanStartYaw >= 0.01,
    JSON.stringify({ before: cleanStartBefore, after: cleanStartAfter, cleanStartDistance, cleanStartYaw }));

  /* Staging establishes only a known pose. Every traversal below enters the
   * production Player through the canonical browser Adapter's real keyboard
   * listeners; no teleport crosses a tread, and no debug interaction fires. */
  const stageStairPose = async ({ direction = 'up', offset = 0 } = {}) => page.evaluate((spec) => {
    const runtime = window.LUXURY_APARTMENT;
    const bounds = runtime.home.stairs.bounds;
    const authoredStair = {
      x0: bounds.x0,
      x1: bounds.x1,
      z0: bounds.z0,
      z1: bounds.z1,
      loftY: runtime.home.spawns.loft.position.y - 1.66,
    };
    const upward = spec.direction === 'up';
    const floor = upward ? 0 : authoredStair.loftY;
    const player = runtime.player;
    player._tween = null;
    player.position.set(
      (authoredStair.x0 + authoredStair.x1) / 2 + spec.offset,
      floor + 1.66,
      upward ? authoredStair.z1 + 0.22 : authoredStair.z0 - 0.18,
    );
    player.ground = floor;
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    player.velocity.set(0, 0, 0);
    player.jumpHeight = 0;
    player.grounded = true;
    player.crouching = false;
    player.sprinting = false;
    player.mode = 'walk';
    player.yaw = upward ? 0 : Math.PI;
    player.pitch = 0;
    player.clearKeys();
    runtime.interaction.setPaused(false);
    runtime.input.refresh(`stair-${spec.direction}-setup`);
    return {
      position: player.position.toArray(),
      ground: player.ground,
      input: runtime.input.snapshot(),
      stair: authoredStair,
    };
  }, { direction, offset });

  if (!await page.evaluate(() => window.LUXURY_APARTMENT.input.captured)) {
    await page.locator('canvas').click({ position: { x: 640, y: 360 } });
    await page.waitForFunction(() => window.LUXURY_APARTMENT.input.captured === true);
  }

  const liveStairStart = await stageStairPose({ direction: 'up', offset: -0.44 });
  let liveStairUpReached = true;
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(({ topZ, loftY }) => {
      const player = window.LUXURY_APARTMENT.player;
      return player.position.z <= topZ && player.ground >= loftY - 0.22;
    }, { topZ: liveStairStart.stair.z0 - 0.14, loftY: liveStairStart.stair.loftY }, {
      timeout: AUXILIARY_WAIT.timeout,
      polling: 50,
    });
  } catch {
    liveStairUpReached = false;
  }
  const liveStairTop = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    return {
      position: runtime.player.position.toArray(),
      ground: runtime.player.ground,
      held: [...runtime.player.keys],
      input: runtime.input.snapshot(),
    };
  });
  await page.keyboard.up('w');

  let liveStairDownReached = true;
  await page.keyboard.down('s');
  try {
    await page.waitForFunction(({ bottomZ }) => {
      const player = window.LUXURY_APARTMENT.player;
      return player.position.z >= bottomZ && player.ground <= 0.22;
    }, { bottomZ: liveStairStart.stair.z1 + 0.16 }, {
      timeout: AUXILIARY_WAIT.timeout,
      polling: 50,
    });
  } catch {
    liveStairDownReached = false;
  }
  const liveStairBottom = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    return {
      position: runtime.player.position.toArray(),
      ground: runtime.player.ground,
      held: [...runtime.player.keys],
      input: runtime.input.snapshot(),
    };
  });
  await page.keyboard.up('s');
  const liveStairReleased = await page.evaluate(() => window.LUXURY_APARTMENT.player.keys.size);
  check('real W climbs the complete off-centre stair and real S walks back down to the main floor',
    liveStairStart.input.enabled
      && liveStairUpReached
      && liveStairTop.position[2] <= liveStairStart.stair.z0 - 0.14
      && liveStairTop.ground >= liveStairStart.stair.loftY - 0.22
      && liveStairTop.held.includes('KeyW')
      && liveStairDownReached
      && liveStairBottom.position[2] >= liveStairStart.stair.z1 + 0.16
      && liveStairBottom.ground <= 0.22
      && liveStairBottom.held.includes('KeyS')
      && Math.abs(liveStairTop.position[0] - liveStairStart.position[0]) <= 0.08
      && Math.abs(liveStairBottom.position[0] - liveStairStart.position[0]) <= 0.08
      && liveStairBottom.input.movementPresses >= liveStairStart.input.movementPresses + 2
      && liveStairReleased === 0,
    JSON.stringify({ start: liveStairStart, top: liveStairTop, bottom: liveStairBottom, liveStairReleased }));

  const retreatStart = await stageStairPose({ direction: 'up', offset: 0.48 });
  let retreatEntered = true;
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => window.LUXURY_APARTMENT.player.ground >= 0.72,
      null, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    retreatEntered = false;
  }
  const retreatHigh = await page.evaluate(() => ({
    position: window.LUXURY_APARTMENT.player.position.toArray(),
    ground: window.LUXURY_APARTMENT.player.ground,
  }));
  await page.keyboard.up('w');
  let retreatEscaped = true;
  await page.keyboard.down('s');
  try {
    await page.waitForFunction(({ startZ }) => {
      const player = window.LUXURY_APARTMENT.player;
      return player.position.z >= startZ - 0.04 && player.ground <= 0.12;
    }, { startZ: retreatStart.position[2] }, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    retreatEscaped = false;
  }
  const retreatEnd = await page.evaluate(() => ({
    position: window.LUXURY_APARTMENT.player.position.toArray(),
    ground: window.LUXURY_APARTMENT.player.ground,
    held: [...window.LUXURY_APARTMENT.player.keys],
  }));
  await page.keyboard.up('s');
  check('an off-centre player can retreat from the lower flight without wedging beneath the stair',
    retreatEntered
      && retreatHigh.ground >= 0.72
      && retreatEscaped
      && retreatEnd.position[2] >= retreatStart.position[2] - 0.04
      && retreatEnd.ground <= 0.12
      && retreatEnd.held.includes('KeyS'),
    JSON.stringify({ start: retreatStart, high: retreatHigh, end: retreatEnd }));

  /* Stable timestep isolation runs inside one browser task so rAF cannot add
   * extra samples between cases. The held state still originates in trusted
   * keyboard events and each step is the shipping Player.update method. */
  const stableStairSpecs = [
    { label: 'walk-up-30', direction: 'up', dt: 1 / 30, offset: -0.46, mode: 'walk' },
    { label: 'walk-down-120', direction: 'down', dt: 1 / 120, offset: 0.46, mode: 'walk' },
    { label: 'sprint-up-60', direction: 'up', dt: 1 / 60, offset: 0.46, mode: 'sprint' },
    { label: 'sprint-down-30', direction: 'down', dt: 1 / 30, offset: -0.46, mode: 'sprint' },
    { label: 'crouch-up-120', direction: 'up', dt: 1 / 120, offset: -0.34, mode: 'crouch' },
    { label: 'crouch-down-60', direction: 'down', dt: 1 / 60, offset: 0.34, mode: 'crouch' },
  ];
  const stableStairReports = [];
  for (const spec of stableStairSpecs) {
    const staged = await stageStairPose(spec);
    const modifier = spec.mode === 'sprint' ? 'Shift' : spec.mode === 'crouch' ? 'c' : null;
    if (modifier) await page.keyboard.down(modifier);
    await page.keyboard.down('w');
    await page.waitForFunction((mode) => {
      const keys = window.LUXURY_APARTMENT.player.keys;
      return keys.has('KeyW')
        && (mode !== 'sprint' || keys.has('ShiftLeft'))
        && (mode !== 'crouch' || keys.has('KeyC'));
    }, spec.mode, { timeout: 5000, polling: 25 });
    const report = await page.evaluate((condition) => {
      const runtime = window.LUXURY_APARTMENT;
      const player = runtime.player;
      const upward = condition.direction === 'up';
      const stair = runtime.home.stairs.bounds;
      const targetZ = upward ? stair.z0 - 0.18 : stair.z1 + 0.22;
      const startX = player.position.x;
      let minX = startX;
      let maxX = startX;
      let minGround = player.ground;
      let maxGround = player.ground;
      let previousGround = player.ground;
      let maxReverseStep = 0;
      let reached = false;
      const limit = Math.ceil(9 / condition.dt);
      for (let frame = 0; frame < limit; frame++) {
        player.update(condition.dt);
        minX = Math.min(minX, player.position.x);
        maxX = Math.max(maxX, player.position.x);
        minGround = Math.min(minGround, player.ground);
        maxGround = Math.max(maxGround, player.ground);
        maxReverseStep = Math.max(maxReverseStep,
          upward ? previousGround - player.ground : player.ground - previousGround);
        previousGround = player.ground;
        if (upward ? player.position.z <= targetZ : player.position.z >= targetZ) {
          reached = true;
          break;
        }
      }
      return {
        ...condition,
        reached,
        position: player.position.toArray(),
        ground: player.ground,
        minGround,
        maxGround,
        maxReverseStep,
        lateralDrift: Math.max(Math.abs(minX - startX), Math.abs(maxX - startX)),
        sprinting: player.sprinting,
        crouching: player.crouching,
        held: [...player.keys],
        input: runtime.input.snapshot(),
      };
    }, spec);
    await page.keyboard.up('w');
    if (modifier) await page.keyboard.up(modifier);
    report.releasedKeys = await page.evaluate(() => window.LUXURY_APARTMENT.player.keys.size);
    report.movementPressDelta = report.input.movementPresses - staged.input.movementPresses;
    stableStairReports.push(report);
  }
  check('real-key stair traversal is stable at 30/60/120 Hz for walk, sprint, and crouch speeds',
    stableStairReports.length === stableStairSpecs.length
      && stableStairReports.every((report) => report.reached
        && report.lateralDrift <= 0.04
        && report.minGround >= -1e-6
        && report.maxGround <= liveStairStart.stair.loftY + 1e-6
        && (report.direction === 'up'
          ? report.ground >= liveStairStart.stair.loftY - 0.25
          : report.ground <= 0.12)
        && report.maxGround - report.minGround >= liveStairStart.stair.loftY - 0.30
        && report.maxReverseStep <= 0.06
        && report.sprinting === (report.mode === 'sprint')
        && report.crouching === (report.mode === 'crouch')
        && report.held.includes('KeyW')
        && report.movementPressDelta >= (report.mode === 'walk' ? 1 : 2)
        && report.releasedKeys === 0),
    JSON.stringify(stableStairReports));

  const arcadeClocks = await page.evaluate(() => ({
    scene: window.LUXURY_APARTMENT.time.clock12,
    pc: window.LUXURY_APARTMENT.pcArcade.clock,
    cabinet: window.LUXURY_APARTMENT.cabinetArcade.clock,
  }));
  check('both Squatch OS screens track the standalone apartment clock',
    arcadeClocks.pc === arcadeClocks.scene && arcadeClocks.cabinet === arcadeClocks.scene,
    JSON.stringify(arcadeClocks));

  const doorFlows = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const home = runtime.home;
    const advance = () => {
      for (let index = 0; index < 120; index++) home.update(1 / 120);
    };

    const frontResult = home.utilityTargets.frontDoor.userData.interact.onUse();
    advance();
    const serviceDoor = {
      result: frontResult,
      locked: home.doors.front.locked,
      open: home.doors.front.isOpen(),
      stateOpen: home.state.frontDoorOpen,
    };

    const elevatorDescriptor = home.utilityTargets.elevator.userData.interact;
    const label = () => typeof elevatorDescriptor.label === 'function'
      ? elevatorDescriptor.label()
      : elevatorDescriptor.label;
    const initialObjective = runtime.readyTally.objective;
    const earlyLabel = label();
    elevatorDescriptor.onUse();
    advance();
    const elevatorBlocked = {
      open: home.doors.elevator.isOpen(),
      stateOpen: home.state.elevatorOpen,
      colliderDisabled: home.doors.elevator.collider.max.y < 0,
      story: runtime.readyTally.snapshot(),
    };
    for (const task of ['showered', 'dressed', 'phoneTaken']) runtime.actions.ready(task);
    const readyObjective = runtime.readyTally.objective;
    const readyLabel = label();
    elevatorDescriptor.onUse();
    advance();
    const elevatorCalled = {
      open: home.doors.elevator.isOpen(),
      stateOpen: home.state.elevatorOpen,
      colliderDisabled: home.doors.elevator.collider.max.y < 0,
      story: runtime.readyTally.snapshot(),
    };

    return {
      serviceDoor,
      initialObjective,
      earlyLabel,
      elevatorBlocked,
      readyObjective,
      readyLabel,
      elevatorCalled,
    };
  });
  check('the service door stays sealed and the elevator refuses early use before one ready-state unlock',
    doorFlows.serviceDoor.result === false
      && doorFlows.serviceDoor.locked
      && !doorFlows.serviceDoor.open
      && !doorFlows.serviceDoor.stateOpen
      && /0\/3/.test(doorFlows.initialObjective)
      && /get ready/i.test(doorFlows.earlyLabel)
      && !doorFlows.elevatorBlocked.open
      && !doorFlows.elevatorBlocked.stateOpen
      && !doorFlows.elevatorBlocked.colliderDisabled
      && !doorFlows.elevatorBlocked.story.ready
      && doorFlows.readyObjective === 'Use the private elevator.'
      && /Call the private/.test(doorFlows.readyLabel)
      && doorFlows.elevatorCalled.open
      && doorFlows.elevatorCalled.stateOpen
      && doorFlows.elevatorCalled.colliderDisabled
      && doorFlows.elevatorCalled.story.ready,
    JSON.stringify(doorFlows));

  const bathroomApproach = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const bath = runtime.home.bathroom.bounds;
    const doorwayX = (bath.doorX0 + bath.doorX1) / 2;
    runtime.teleport('main');
    runtime.player.position.set(doorwayX, 1.68, -0.30);
    runtime.player.velocity.set(0, 0, 0);
    runtime.player.ground = 0;
    runtime.player.mode = 'walk';
    runtime.player.yaw = 0;
    runtime.player.pitch = 0;
    runtime.player.clearKeys();
    runtime.interaction.setPaused(false);
    /* This verifier moved the player between animation frames. Synchronize the
     * camera and interaction ray once at the setup seam instead of assuming a
     * busy SwiftShader frame will happen inside an arbitrary five seconds. */
    runtime.player.update(1 / 60);
    runtime.camera.updateMatrixWorld(true);
    runtime.interaction.update(1 / 60);
    return {
      doorwayX,
      position: runtime.player.position.toArray(),
      camera: runtime.camera.position.toArray(),
      yaw: runtime.player.yaw,
      pitch: runtime.player.pitch,
      interactionPaused: runtime.interaction.paused,
      targetResolved: runtime.interaction.current === runtime.home.utilityTargets.bathroomDoor,
      targetName: runtime.interaction.current?.name ?? null,
    };
  });
  const bathroomPointerLocked = await page.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS');
  if (!bathroomPointerLocked) {
    // On an unlocked canvas this click only acquires capture. With capture
    // already held the same click is gameplay input and would toggle the live
    // door before the explicit E press below.
    await page.locator('canvas').click({ position: { x: 640, y: 360 } });
  }
  await page.waitForFunction(() => {
    const runtime = window.LUXURY_APARTMENT;
    return runtime.interaction.current === runtime.home.utilityTargets.bathroomDoor;
  }, null, { timeout: 5000, polling: 50 });
  await page.waitForFunction(() => window.LUXURY_APARTMENT.home.doors.bathroom.isOpen(),
    null, { timeout: 5000, polling: 50 });
  await page.evaluate(() => {
    const home = window.LUXURY_APARTMENT.home;
    for (let index = 0; index < 180; index++) home.update(1 / 120);
  });
  const bathroomOpened = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    return {
      open: runtime.home.doors.bathroom.isOpen(),
      stateOpen: runtime.home.state.bathroomDoorOpen,
      yaw: runtime.home.doors.bathroom.pivot.rotation.y,
    };
  });

  let bathroomReachedInside = true;
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => window.LUXURY_APARTMENT.player.position.z <= -1.40,
      null, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    bathroomReachedInside = false;
  } finally {
    await page.keyboard.up('w');
  }
  const bathroomInside = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const bath = runtime.home.bathroom.bounds;
    return {
      position: runtime.player.position.toArray(),
      insideBounds: runtime.player.position.x >= bath.x0 + 0.30
        && runtime.player.position.x <= bath.x1 - 0.30
        && runtime.player.position.z < bath.z1 - 0.30,
      heldKeys: runtime.player.keys.size,
      enabled: runtime.player.enabled,
      mode: runtime.player.mode,
      ground: runtime.player.ground,
      velocity: runtime.player.velocity.toArray(),
      doorCollider: {
        min: runtime.home.doors.bathroom.collider.min.toArray(),
        max: runtime.home.doors.bathroom.collider.max.toArray(),
      },
    };
  });

  let bathroomCrossedTurningBay = true;
  await page.keyboard.down('d');
  try {
    await page.waitForFunction(() => {
      const runtime = window.LUXURY_APARTMENT;
      const bath = runtime.home.bathroom.bounds;
      return runtime.player.position.x >= (bath.x0 + bath.x1) / 2 + 0.18;
    }, null, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    bathroomCrossedTurningBay = false;
  }
  const bathroomAcross = await page.evaluate(() => ({
    position: window.LUXURY_APARTMENT.player.position.toArray(),
    held: [...window.LUXURY_APARTMENT.player.keys],
  }));
  await page.keyboard.up('d');
  let bathroomReturnedAcrossBay = true;
  await page.keyboard.down('a');
  try {
    await page.waitForFunction((returnX) => window.LUXURY_APARTMENT.player.position.x <= returnX + 0.08,
      bathroomApproach.doorwayX, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    bathroomReturnedAcrossBay = false;
  }
  const bathroomTurned = await page.evaluate(() => ({
    position: window.LUXURY_APARTMENT.player.position.toArray(),
    held: [...window.LUXURY_APARTMENT.player.keys],
  }));
  await page.keyboard.up('a');

  let bathroomReturnedByInput = true;
  await page.keyboard.down('s');
  try {
    await page.waitForFunction(() => window.LUXURY_APARTMENT.player.position.z >= -0.40,
      null, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    bathroomReturnedByInput = false;
  } finally {
    await page.keyboard.up('s');
  }
  const bathroomAfterReturn = await page.evaluate((returnedByInput) => {
    const runtime = window.LUXURY_APARTMENT;
    return {
      position: runtime.player.position.toArray(),
      reachedDoor: returnedByInput && runtime.player.position.z >= -0.40,
      heldKeys: runtime.player.keys.size,
      enabled: runtime.player.enabled,
      mode: runtime.player.mode,
      ground: runtime.player.ground,
      velocity: runtime.player.velocity.toArray(),
    };
  }, bathroomReturnedByInput);
  let bathroomClosedViaInput = false;
  if (bathroomAfterReturn.reachedDoor) {
    try {
      await page.waitForFunction(() => {
        const runtime = window.LUXURY_APARTMENT;
        return runtime.interaction.current === runtime.home.utilityTargets.bathroomDoor;
      }, null, { timeout: 15000, polling: 50 });
      await page.keyboard.press('e');
      await page.waitForFunction(() => !window.LUXURY_APARTMENT.home.doors.bathroom.isOpen(),
        null, { timeout: 5000, polling: 50 });
      bathroomClosedViaInput = true;
    } catch {
      bathroomClosedViaInput = false;
    }
  }
  if (!bathroomClosedViaInput) {
    // Cleanup is deliberately separate from the assertion: preserve all
    // sampled failure evidence, but do not let one failed flow prevent the
    // verifier from auditing unrelated systems later in the scene.
    await page.evaluate(() => {
      const runtime = window.LUXURY_APARTMENT;
      runtime.home.doors.bathroom.close();
      for (let index = 0; index < 180; index++) runtime.home.update(1 / 120);
    });
  } else {
    await page.evaluate(() => {
      const home = window.LUXURY_APARTMENT.home;
      for (let index = 0; index < 180; index++) home.update(1 / 120);
    });
  }
  const bathroomExited = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    return {
      position: runtime.player.position.toArray(),
      open: runtime.home.doors.bathroom.isOpen(),
      stateOpen: runtime.home.state.bathroomDoorOpen,
      yaw: runtime.home.doors.bathroom.pivot.rotation.y,
      heldKeys: runtime.player.keys.size,
    };
  });
  check('the relocated bathroom opens and supports a real-input main-floor round trip',
    bathroomApproach.targetResolved
      && bathroomOpened.open
      && bathroomOpened.stateOpen
      && Math.abs(bathroomOpened.yaw) > 1.55
      && bathroomReachedInside
      && bathroomInside.insideBounds
      && bathroomInside.heldKeys === 0
      && bathroomCrossedTurningBay
      && bathroomAcross.held.includes('KeyD')
      && bathroomReturnedAcrossBay
      && bathroomTurned.held.includes('KeyA')
      && bathroomAfterReturn.reachedDoor
      && bathroomAfterReturn.heldKeys === 0
      && bathroomClosedViaInput
      && !bathroomExited.open
      && !bathroomExited.stateOpen
      && Math.abs(bathroomExited.yaw) < 0.01
      && bathroomExited.heldKeys === 0,
    JSON.stringify({
      approach: bathroomApproach,
      open: bathroomOpened,
      inside: bathroomInside,
      turningBay: { crossed: bathroomCrossedTurningBay, across: bathroomAcross,
        returned: bathroomReturnedAcrossBay, turn: bathroomTurned },
      afterReturn: bathroomAfterReturn,
      closedViaInput: bathroomClosedViaInput,
      closed: bathroomExited,
    }));

  const bathroomLightSetup = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const home = runtime.home;
    const bath = home.bathroom.bounds;
    const saved = {
      day: runtime.time.day,
      minutes: runtime.time.minutes,
      mainLightsOn: home.state.mainLightsOn,
      loftLightsOn: home.state.loftLightsOn,
      mainLightsManual: home.state.mainLightsManual,
      loftLightsManual: home.state.loftLightsManual,
    };
    runtime.setTime(saved.day, 20 * 60 + 30);
    runtime.setLights('loft', false);
    runtime.setLights('main', true);
    const bathroomFixture = home.lights.bathroom;
    bathroomFixture.light.intensity = 0;
    bathroomFixture.bulb.material = home.materials.bulbOff;
    const otherMainIntensity = home.lights.main
      .filter((fixture) => fixture !== bathroomFixture)
      .reduce((sum, fixture) => sum + fixture.light.intensity, 0);
    const player = runtime.player;
    player._tween = null;
    player.position.set((bath.x0 + bath.x1) / 2 - 0.24, 1.66, (bath.z0 + bath.z1) / 2 + 0.28);
    player.ground = 0;
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    player.velocity.set(0, 0, 0);
    player.mode = 'walk';
    player.clearKeys();
    const mirror = home.mirrorMesh;
    const target = mirror.getWorldPosition(player.position.clone());
    const delta = target.sub(player.position);
    player.yaw = Math.atan2(-delta.x, -delta.z);
    player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    player.update(0.001);
    runtime.camera.updateMatrixWorld(true);
    return {
      saved,
      position: player.position.toArray(),
      yaw: player.yaw,
      pitch: player.pitch,
      fixture: {
        name: bathroomFixture.fixture.name,
        intensity: bathroomFixture.light.intensity,
        mainCircuit: home.lights.main.includes(bathroomFixture),
        otherMainIntensity,
      },
    };
  });
  await settleRenderedFrames(page, 3);
  const bathroomToneOff = await sampleCanvasTone(page, 0.52);
  const bathroomLightOn = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const bathroomFixture = runtime.home.lights.bathroom;
    bathroomFixture.light.intensity = bathroomFixture.intensity;
    bathroomFixture.bulb.material = runtime.home.materials.bulbOn;
    return {
      intensity: bathroomFixture.light.intensity,
      configured: bathroomFixture.intensity,
      bulbOn: bathroomFixture.bulb.material === runtime.home.materials.bulbOn,
      mainLightsOn: runtime.home.state.mainLightsOn,
      loftLightsOn: runtime.home.state.loftLightsOn,
      otherMainIntensity: runtime.home.lights.main
        .filter((fixture) => fixture !== bathroomFixture)
        .reduce((sum, fixture) => sum + fixture.light.intensity, 0),
    };
  });
  await settleRenderedFrames(page, 3);
  const bathroomToneOn = await sampleCanvasTone(page, 0.52);
  const bathroomMirrorToneOn = await sampleCanvasTone(page, 0.22);
  await capture(page, 'luxury-under-stair-bathroom-lighting');
  const bathroomLightRestore = await page.evaluate((saved) => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.setTime(saved.day, saved.minutes);
    runtime.setLights('main', saved.mainLightsOn);
    runtime.setLights('loft', saved.loftLightsOn);
    runtime.home.state.mainLightsManual = saved.mainLightsManual;
    runtime.home.state.loftLightsManual = saved.loftLightsManual;
    return {
      day: runtime.time.day,
      minutes: runtime.time.minutes,
      mainLightsOn: runtime.home.state.mainLightsOn,
      loftLightsOn: runtime.home.state.loftLightsOn,
      mainLightsManual: runtime.home.state.mainLightsManual,
      loftLightsManual: runtime.home.state.loftLightsManual,
    };
  }, bathroomLightSetup.saved);
  check('the real under-stair practical lifts bathroom visibility without mirror glare clipping the frame',
    bathroomLightSetup.fixture.name === 'luxury-light-main-bathroom'
      && bathroomLightSetup.fixture.mainCircuit
      && bathroomLightSetup.fixture.intensity === 0
      && bathroomLightOn.intensity === bathroomLightOn.configured
      && bathroomLightOn.intensity === 4
      && bathroomLightOn.bulbOn
      && bathroomLightOn.mainLightsOn
      && !bathroomLightOn.loftLightsOn
      && bathroomLightSetup.fixture.otherMainIntensity > 0
      && bathroomLightOn.otherMainIntensity === bathroomLightSetup.fixture.otherMainIntensity
      && bathroomToneOff.readError === 0
      && bathroomToneOn.readError === 0
      && bathroomMirrorToneOn.readError === 0
      && bathroomToneOn.mean >= bathroomToneOff.mean + 4
      && bathroomToneOn.p50 >= bathroomToneOff.p50 + 2
      && bathroomToneOn.darkFraction < bathroomToneOff.darkFraction
      && bathroomMirrorToneOn.clippedFraction <= 0.02
      && bathroomMirrorToneOn.p99 < 254
      && JSON.stringify(bathroomLightRestore) === JSON.stringify(bathroomLightSetup.saved),
    JSON.stringify({ setup: bathroomLightSetup, off: bathroomToneOff, on: bathroomToneOn,
      mirror: bathroomMirrorToneOn, state: bathroomLightOn, restored: bathroomLightRestore }));

  const bedroomStart = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const player = runtime.player;
    runtime.teleport('loft');
    player.position.set(3.80, runtime.home.spawns.loft.position.y, -2.72);
    player.ground = runtime.home.spawns.loft.position.y - 1.66;
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    player.velocity.set(0, 0, 0);
    player.mode = 'walk';
    player.yaw = 0;
    player.pitch = 0;
    player.clearKeys();
    runtime.interaction.setPaused(false);
    runtime.input.refresh('bedroom-circulation-setup');
    return {
      position: player.position.toArray(),
      movementPresses: runtime.input.snapshot().movementPresses,
    };
  });
  let bedroomEntered = true;
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => window.LUXURY_APARTMENT.player.position.z <= -3.82,
      null, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    bedroomEntered = false;
  }
  const bedroomInside = await page.evaluate(() => ({
    position: window.LUXURY_APARTMENT.player.position.toArray(),
    held: [...window.LUXURY_APARTMENT.player.keys],
  }));
  await page.keyboard.up('w');
  let wardrobeReached = true;
  await page.keyboard.down('d');
  try {
    await page.waitForFunction(() => window.LUXURY_APARTMENT.player.position.x >= 8.00,
      null, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    wardrobeReached = false;
  }
  const wardrobeApproach = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const pose = runtime.home.poses.wardrobe.exit;
    return {
      position: runtime.player.position.toArray(),
      held: [...runtime.player.keys],
      distanceToAuthoredExit: Math.hypot(
        runtime.player.position.x - pose.x,
        runtime.player.position.z - pose.z,
      ),
    };
  });
  await page.keyboard.up('d');
  let bedroomCrossedBack = true;
  await page.keyboard.down('a');
  try {
    await page.waitForFunction(() => window.LUXURY_APARTMENT.player.position.x <= 3.88,
      null, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    bedroomCrossedBack = false;
  }
  const bedroomReturnLane = await page.evaluate(() => ({
    position: window.LUXURY_APARTMENT.player.position.toArray(),
    held: [...window.LUXURY_APARTMENT.player.keys],
  }));
  await page.keyboard.up('a');
  let bedroomExitedByInput = true;
  await page.keyboard.down('s');
  try {
    await page.waitForFunction(() => window.LUXURY_APARTMENT.player.position.z >= -2.72,
      null, { timeout: AUXILIARY_WAIT.timeout, polling: 50 });
  } catch {
    bedroomExitedByInput = false;
  }
  const bedroomExit = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    return {
      position: runtime.player.position.toArray(),
      held: [...runtime.player.keys],
      movementPresses: runtime.input.snapshot().movementPresses,
    };
  });
  await page.keyboard.up('s');

  const bedroomWallFaces = [];
  for (const face of [
    { id: 'lounge', z: -2.36, normal: 1 },
    { id: 'bedroom', z: -4.08, normal: -1 },
  ]) {
    const report = await page.evaluate((side) => {
      const runtime = window.LUXURY_APARTMENT;
      const player = runtime.player;
      const panel = runtime.home.root.getObjectByName('luxury-bedroom-wall-panel-1');
      panel.geometry.computeBoundingBox();
      const panelBounds = panel.geometry.boundingBox.clone().applyMatrix4(panel.matrixWorld);
      const target = player.position.clone().set(
        panelBounds.min.x + 0.32,
        (panelBounds.min.y + panelBounds.max.y) / 2,
        (panelBounds.min.z + panelBounds.max.z) / 2,
      );
      player._tween = null;
      player.position.set(target.x, runtime.home.spawns.loft.position.y, side.z);
      player.ground = runtime.home.spawns.loft.position.y - 1.66;
      player.eyeHeight = 1.66;
      player.targetEye = 1.66;
      player.velocity.set(0, 0, 0);
      player.mode = 'walk';
      player.clearKeys();
      const delta = target.clone().sub(player.position);
      player.yaw = Math.atan2(-delta.x, -delta.z);
      player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
      player.update(0.001);
      runtime.camera.updateMatrixWorld(true);
      const ray = runtime.interaction.raycaster;
      ray.set(runtime.camera.position, target.clone().sub(runtime.camera.position).normalize());
      const visibleInHierarchy = (object) => {
        for (let current = object; current; current = current.parent) {
          if (!current.visible) return false;
        }
        return true;
      };
      const hit = ray.intersectObject(runtime.home.root, true).find(({ object }) => {
        if (!object.isMesh || !visibleInHierarchy(object)) return false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        return materials.some((material) => material?.visible !== false && (material?.opacity ?? 1) > 0.05);
      });
      const panelMaterials = Array.isArray(panel.material) ? panel.material : [panel.material];
      return {
        id: side.id,
        camera: runtime.camera.position.toArray(),
        target: target.toArray(),
        hit: hit?.object?.name ?? null,
        distance: hit?.distance ?? null,
        normalZ: hit?.face?.normal?.z ?? null,
        panelVisible: visibleInHierarchy(panel),
        panelMaterialVisible: panelMaterials.every((material) => (
          material?.visible !== false && (material?.opacity ?? 1) > 0.05
        )),
      };
    }, face);
    await settleRenderedFrames(page, 2);
    report.tone = await sampleCanvasTone(page, 0.22);
    await capture(page, `luxury-bedroom-wall-${face.id}-face`);
    bedroomWallFaces.push(report);
  }
  check('real movement circulates through the bedroom to the wardrobe and the finished wall reads from both sides',
    bedroomEntered
      && bedroomInside.held.includes('KeyW')
      && wardrobeReached
      && wardrobeApproach.held.includes('KeyD')
      && wardrobeApproach.distanceToAuthoredExit <= 0.35
      && bedroomCrossedBack
      && bedroomReturnLane.held.includes('KeyA')
      && bedroomExitedByInput
      && bedroomExit.held.includes('KeyS')
      && bedroomExit.movementPresses >= bedroomStart.movementPresses + 4
      && bedroomWallFaces.length === 2
      && bedroomWallFaces.every((face) => face.hit === 'luxury-bedroom-wall-panel-1'
        && face.panelVisible
        && face.panelMaterialVisible
        && face.distance > 0.5
        && face.distance < 1.5
        && face.tone.readError === 0
        && face.tone.p50 > 12
        && face.tone.clippedFraction < 0.20)
      && bedroomWallFaces[0].normalZ > 0.9
      && bedroomWallFaces[1].normalZ < -0.9,
    JSON.stringify({ start: bedroomStart, inside: bedroomInside, wardrobe: wardrobeApproach,
      returnLane: bedroomReturnLane, exit: bedroomExit, faces: bedroomWallFaces }));

  const cigaretteFlow = await page.evaluate(() => {
    const target = window.LUXURY_APARTMENT.home.utilityTargets.cigarettes;
    const descriptor = target.userData.interact;
    const label = () => typeof descriptor.label === 'function' ? descriptor.label() : descriptor.label;
    const beforeLabel = label();
    const replenished = descriptor.onUse();
    const fullLabel = label();
    const fullAgain = descriptor.onUse();
    return { beforeLabel, replenished, fullLabel, fullAgain };
  });
  check('the desk cigarette pack replenishes once and gives explicit full-pack feedback thereafter',
    /replenish/i.test(cigaretteFlow.beforeLabel)
      && cigaretteFlow.replenished?.owned
      && cigaretteFlow.replenished.count === 12
      && cigaretteFlow.replenished.added > 0
      && cigaretteFlow.replenished.reason === 'replenished'
      && /already have a full pack/i.test(cigaretteFlow.fullLabel)
      && cigaretteFlow.fullAgain?.full
      && cigaretteFlow.fullAgain.added === 0
      && cigaretteFlow.fullAgain.reason === 'already-full',
    JSON.stringify(cigaretteFlow));

  if (SCREENSHOT_DIR) {
    await page.evaluate(() => {
      const runtime = window.LUXURY_APARTMENT;
      runtime.teleport('main');
      runtime.player.position.set(0, 1.68, 1.05);
      runtime.player.ground = 0;
      runtime.player.yaw = Math.PI;
      runtime.player.pitch = -0.05;
    });
    await page.waitForTimeout(220);
    await capture(page, 'luxury-main-city');
    await page.evaluate(() => {
      const runtime = window.LUXURY_APARTMENT;
      runtime.player.position.set(3.68, 1.68, 1.48);
      runtime.player.ground = 0;
      runtime.player.yaw = 0;
      runtime.player.pitch = -0.04;
    });
    await page.waitForTimeout(220);
    await capture(page, 'luxury-hero-art');
  }

  const pcEntry = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const entered = runtime.station('pc');
    for (let i = 0; entered && runtime.state.posture === 'transition' && i < 120; i++) {
      runtime.player.update(1 / 60);
    }
    return { entered, posture: runtime.state.posture, mode: runtime.player.mode };
  });
  const framedApp = await page.evaluate(() => {
    const os = window.LUXURY_APARTMENT.pcArcade;
    os.skipBoot?.();
    return {
      launched: os.launchById('smash'),
      app: os.app?.id ?? null,
      inputMode: os.inputMode,
    };
  });
  await page.waitForFunction(() => document.pointerLockElement === null, undefined, { timeout: AUXILIARY_WAIT.timeout });
  await page.waitForFunction(() => {
    const app = window.LUXURY_APARTMENT.pcArcade.app;
    const frame = app?.overlay?.el;
    return app?.id === 'smash' && frame?.contentDocument?.readyState === 'complete';
  }, undefined, { timeout: AUXILIARY_WAIT.timeout });
  await page.evaluate(() => window.LUXURY_APARTMENT.pcArcade.app.overlay.focusFrame());
  await page.waitForFunction(() => {
    const frame = window.LUXURY_APARTMENT.pcArcade.app?.overlay?.el;
    return Boolean(frame) && document.activeElement === frame;
  }, undefined, { timeout: AUXILIARY_WAIT.timeout });
  const releasedForDom = await page.evaluate(() => document.pointerLockElement === null);
  /* The embedded game correctly owns keyboard focus. Use the player-facing
   * parent exit control to reclaim it before holding Tab; sending Tab to an
   * iframe and hoping the event bubbles to its parent is browser-race luck,
   * not an acceptance test. */
  const framedExit = page.getByRole('button', { name: 'Exit to the SquatchOS desktop' });
  /* Regression setup: leave the pointer on the parent-owned control, then
   * explicitly give keyboard focus back to the frame. Calling hover() again
   * from this state does not create another pointerenter event. */
  await framedExit.hover();
  await page.evaluate(() => window.LUXURY_APARTMENT.pcArcade.app.overlay.focusFrame());
  await page.waitForFunction(() => {
    const frame = window.LUXURY_APARTMENT.pcArcade.app?.overlay?.el;
    return Boolean(frame) && document.activeElement === frame;
  }, undefined, { timeout: AUXILIARY_WAIT.timeout });
  // `hover()` is not an instruction to emit pointerenter when the mouse is
  // already over the element. Leave the control first, then enter it exactly
  // as a player would. Without this move the verifier intermittently waited
  // for focus that the browser had no event-driven reason to change.
  await page.mouse.move(640, 400, { steps: 4 });
  await framedExit.hover();
  await page.waitForFunction(() => (
    document.activeElement?.getAttribute?.('aria-label') === 'Exit to the SquatchOS desktop'
  ), undefined, { timeout: AUXILIARY_WAIT.timeout });
  await page.keyboard.down('Tab');
  await page.waitForTimeout(720);
  await page.keyboard.up('Tab');
  await page.waitForFunction(() => {
    const runtime = window.LUXURY_APARTMENT;
    return runtime.pcArcade.mode === 'desktop'
      && runtime.pcArcade.inputMode === 'relative'
      && document.pointerLockElement === document.getElementById('scene');
  }, undefined, { timeout: AUXILIARY_WAIT.timeout });
  const desktopRecovered = await page.evaluate(() => ({
    mode: window.LUXURY_APARTMENT.pcArcade.mode,
    inputMode: window.LUXURY_APARTMENT.pcArcade.inputMode,
    locked: document.pointerLockElement === document.getElementById('scene'),
  }));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(80);
  const seatedTab = await page.evaluate(() => ({
    paused: window.LUXURY_APARTMENT.state.paused,
    posture: window.LUXURY_APARTMENT.state.posture,
    mode: window.LUXURY_APARTMENT.pcArcade.mode,
    locked: document.pointerLockElement === document.getElementById('scene'),
  }));
  await page.keyboard.press('q');
  await page.waitForFunction(() => window.LUXURY_APARTMENT.state.posture === null
    && window.LUXURY_APARTMENT.player.mode === 'walk');
  check('framed Squatch OS apps release the DOM cursor and restore desktop mouse control',
    pcEntry.entered
      && pcEntry.posture === 'desk'
      && pcEntry.mode === 'seated'
      && framedApp.launched
      && framedApp.app === 'smash'
      && framedApp.inputMode === 'dom'
      && releasedForDom
      && desktopRecovered.mode === 'desktop'
      && desktopRecovered.inputMode === 'relative'
      && desktopRecovered.locked
      && !seatedTab.paused
      && seatedTab.posture === 'desk'
      && seatedTab.mode === 'desktop'
      && seatedTab.locked,
    JSON.stringify({ pcEntry, framedApp, releasedForDom, desktopRecovered, seatedTab }));

  const arcadeEntry = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.teleport('main');
    const entered = runtime.station('arcade');
    for (let index = 0; entered && runtime.state.posture === 'transition' && index < 180; index++) {
      runtime.player.update(1 / 60);
    }

    const screen = runtime.home.gameStations.arcade.screen;
    const camera = runtime.camera;
    screen.geometry.computeBoundingBox();
    screen.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const bounds = screen.geometry.boundingBox;
    const project = (x, y) => {
      const point = camera.position.clone().set(x, y, 0);
      screen.localToWorld(point);
      point.project(camera);
      return { x: point.x, y: point.y, z: point.z };
    };
    const corners = [
      project(bounds.min.x, bounds.min.y),
      project(bounds.max.x, bounds.min.y),
      project(bounds.max.x, bounds.max.y),
      project(bounds.min.x, bounds.max.y),
    ];
    const center = project(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
    );
    const xs = corners.map(({ x }) => x);
    const ys = corners.map(({ y }) => y);
    const result = {
      entered,
      posture: runtime.state.posture,
      playerMode: runtime.player.mode,
      active: runtime.state.activeArcade === runtime.cabinetArcade,
      app: runtime.cabinetArcade.app?.id ?? null,
      center,
      corners,
      ndcWidth: Math.max(...xs) - Math.min(...xs),
      ndcHeight: Math.max(...ys) - Math.min(...ys),
    };
    if (runtime.cabinetArcade.mode === 'app') runtime.cabinetArcade.toDesktop();
    return result;
  });
  await page.waitForFunction(() => (
    window.LUXURY_APARTMENT.state.posture === 'arcade'
      && window.LUXURY_APARTMENT.cabinetArcade.mode === 'desktop'
      && window.LUXURY_APARTMENT.cabinetArcade.inputMode === 'relative'
  ));
  await page.keyboard.press('q');
  await page.waitForFunction(() => (
    window.LUXURY_APARTMENT.state.posture === null
      && window.LUXURY_APARTMENT.player.mode === 'walk'
  ));
  const arcadeExit = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const exit = runtime.home.poses.arcade.exit;
    return {
      posture: runtime.state.posture,
      playerMode: runtime.player.mode,
      active: runtime.state.activeArcade !== null,
      distanceFromExit: Math.hypot(
        runtime.player.position.x - exit.x,
        runtime.player.position.z - exit.z,
      ),
    };
  });
  check('the cabinet seats cleanly with its screen centered and fully visible, then exits on real Q input',
    arcadeEntry.entered
      && arcadeEntry.posture === 'arcade'
      && arcadeEntry.playerMode === 'seated'
      && arcadeEntry.active
      && arcadeEntry.app === 'smash'
      && Math.abs(arcadeEntry.center.x) <= 0.08
      && Math.abs(arcadeEntry.center.y) <= 0.08
      && arcadeEntry.ndcWidth >= 0.75
      && arcadeEntry.ndcHeight >= 0.75
      && arcadeEntry.corners.every(({ x, y, z }) => (
        Math.abs(x) < 0.98 && Math.abs(y) < 0.98 && z > -1 && z < 1
      ))
      && arcadeExit.posture === null
      && arcadeExit.playerMode === 'walk'
      && !arcadeExit.active
      && arcadeExit.distanceFromExit < 0.05,
    JSON.stringify({ entry: arcadeEntry, exit: arcadeExit }));

  const soloPoker = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.teleport('main');
    const postureBefore = runtime.state.posture;
    const played = runtime.station('poker');
    return {
      played,
      postureBefore,
      postureAfter: runtime.state.posture,
      playerMode: runtime.player.mode,
      blackjackMounted: 'blackjack' in runtime,
      patrons: runtime.home.poker.patrons.length,
    };
  });
  check('the empty poker table gives its solo response without launching blackjack or seating Tony',
    !soloPoker.played
      && soloPoker.postureBefore === null
      && soloPoker.postureAfter === null
      && soloPoker.playerMode === 'walk'
      && !soloPoker.blackjackMounted
      && soloPoker.patrons === 0,
    JSON.stringify(soloPoker));

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.LUXURY_APARTMENT.state.paused === true);
  const escapePaused = await page.evaluate(() => ({
    paused: window.LUXURY_APARTMENT.state.paused,
    locked: document.pointerLockElement === document.getElementById('scene'),
  }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.LUXURY_APARTMENT.state.paused === false
    && document.pointerLockElement === document.getElementById('scene'));
  const escapeResumed = await page.evaluate(() => ({
    paused: window.LUXURY_APARTMENT.state.paused,
    locked: document.pointerLockElement === document.getElementById('scene'),
  }));
  check('Escape opens and resumes the shared pause menu in ordinary apartment play',
    escapePaused.paused && !escapePaused.locked
      && !escapeResumed.paused && escapeResumed.locked,
    JSON.stringify({ escapePaused, escapeResumed }));

  await page.evaluate(() => {
    const home = window.LUXURY_APARTMENT.home;
    window.__luxuryShadeBefore = home.shades.south.concat(home.shades.east)
      .map((shade) => shade.scale.y);
    home.utilityTargets.shades.userData.interact.onUse();
  });
  await page.waitForFunction(() => window.LUXURY_APARTMENT.home.state.shadesT > 0.95);
  const closedShades = await page.evaluate(() => {
    const home = window.LUXURY_APARTMENT.home;
    return {
      closed: home.state.shadesClosed,
      amount: home.state.shadesT,
      before: window.__luxuryShadeBefore,
      after: home.shades.south.concat(home.shades.east).map((shade) => shade.scale.y),
    };
  });
  await page.evaluate(() => {
    const home = window.LUXURY_APARTMENT.home;
    home.utilityTargets.shades.userData.interact.onUse();
  });
  await page.waitForFunction(() => window.LUXURY_APARTMENT.home.state.shadesT < 0.05);
  const openedShades = await page.evaluate(() => {
    const home = window.LUXURY_APARTMENT.home;
    return {
      closed: home.state.shadesClosed,
      amount: home.state.shadesT,
      scales: home.shades.south.concat(home.shades.east).map((shade) => shade.scale.y),
    };
  });
  check('all 19 motorized city shades travel closed and return open',
    closedShades.closed
      && closedShades.before.length === 19
      && closedShades.amount > 0.95
      && closedShades.after.every((scale) => scale > 0.95)
      && !openedShades.closed
      && openedShades.amount < 0.05
      && openedShades.scales.every((scale) => scale < 0.05),
    JSON.stringify({
      shadeCount: closedShades.after.length,
      closedAmount: closedShades.amount,
      openAmount: openedShades.amount,
    }));

  const floors = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const mainMoved = runtime.teleport('main');
    const main = {
      y: runtime.player.position.y,
      ground: runtime.home.groundAt(
        runtime.player.position.x,
        runtime.player.position.z,
        runtime.player.position.y,
      ),
    };
    const loftMoved = runtime.teleport('loft');
    const loft = {
      y: runtime.player.position.y,
      ground: runtime.home.groundAt(
        runtime.player.position.x,
        runtime.player.position.z,
        runtime.player.position.y,
      ),
    };
    return { mainMoved, loftMoved, main, loft };
  });
  check('public main-floor and loft teleports land on their authored walkable surfaces',
    floors.mainMoved
      && floors.loftMoved
      && Math.abs((floors.main.y - floors.main.ground) - 1.68) < 0.03
      && Math.abs((floors.loft.y - floors.loft.ground) - 1.68) < 0.03
      && floors.loft.ground - floors.main.ground > 3,
    JSON.stringify(floors));
  if (SCREENSHOT_DIR) {
    await page.evaluate(() => {
      const runtime = window.LUXURY_APARTMENT;
      runtime.teleport('loft');
      runtime.player.position.set(-2.15, 4.98, -2.15);
      runtime.player.ground = 3.3;
      runtime.player.yaw = -2.40;
      runtime.player.pitch = -0.08;
    });
    await page.waitForTimeout(220);
    await capture(page, 'luxury-loft');
  }

  /* The preceding SquatchOS proof deliberately focused its iframe. A player
   * reaches darts from the top-level canvas, whereas a verifier calling the
   * public station seam would otherwise leave real keyboard events inside that
   * now-hidden frame. A middle click moves browser focus back to the game
   * without firing a dart or invoking an apartment interaction. */
  await page.locator('canvas').click({ button: 'middle', position: { x: 640, y: 360 } });
  const dartsEntry = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.teleport('main');
    runtime.darts.reset();
    const entered = runtime.station('darts');
    for (let index = 0; entered && runtime.state.posture === 'transition' && index < 180; index++) {
      runtime.player.update(1 / 60);
    }
    const direction = runtime.camera.position.clone();
    runtime.camera.getWorldDirection(direction);
    const toBoard = runtime.home.darts.center.clone().sub(runtime.camera.position).normalize();
    return {
      entered,
      posture: runtime.state.posture,
      playerMode: runtime.player.mode,
      active: runtime.darts.active,
      aimedAtBoard: direction.dot(toBoard),
      throws: runtime.darts.throws,
      fov: runtime.camera.fov,
      numberedSections: runtime.home.darts.sections.length,
      reticle: document.getElementById('luxury-game-panel').classList.contains('darts-active'),
    };
  });
  await page.waitForFunction(() => (
    window.LUXURY_APARTMENT.state.posture === 'darts'
      && window.LUXURY_APARTMENT.darts.active
  ), null, { timeout: AUXILIARY_WAIT.timeout });
  const dartImpacts = [];
  const dartCharges = [];
  for (const targetCharge of [0.20, 0.55]) {
    const beforeThrows = await page.evaluate(() => window.LUXURY_APARTMENT.darts.throws);
    await page.keyboard.down('e');
    await page.waitForFunction((minimum) => (
      window.LUXURY_APARTMENT.darts.charge.active
        && window.LUXURY_APARTMENT.darts.charge.amount >= minimum
    ), targetCharge, { timeout: AUXILIARY_WAIT.timeout, polling: 100 });
    dartCharges.push(await page.evaluate(() => ({
      active: window.LUXURY_APARTMENT.darts.charge.active,
      amount: window.LUXURY_APARTMENT.darts.charge.amount,
    })));
    await page.keyboard.up('e');
    await page.waitForFunction((prior) => {
      const darts = window.LUXURY_APARTMENT.darts;
      return darts.throws > prior && !darts.inFlight && Boolean(darts.lastImpact);
    }, beforeThrows, { timeout: AUXILIARY_WAIT.timeout, polling: 100 });
    dartImpacts.push(await page.evaluate(() => {
      const impact = window.LUXURY_APARTMENT.darts.lastImpact;
      return {
        target: impact.target,
        score: impact.score,
        label: impact.label,
        age: impact.age,
        point: { x: impact.point.x, y: impact.point.y, z: impact.point.z },
        remaining: impact.remaining,
      };
    }));
  }
  const dartsBeforeReset = await page.evaluate(() => ({
    throws: window.LUXURY_APARTMENT.darts.throws,
    projectiles: window.LUXURY_APARTMENT.darts.projectiles.length,
    last: window.LUXURY_APARTMENT.darts.last,
  }));
  await page.keyboard.press('r');
  const dartsAfterReset = await page.evaluate(() => ({
    throws: window.LUXURY_APARTMENT.darts.throws,
    projectiles: window.LUXURY_APARTMENT.darts.projectiles.length,
    lastImpact: window.LUXURY_APARTMENT.darts.lastImpact,
    remaining: window.LUXURY_APARTMENT.darts.remaining,
  }));
  await page.keyboard.press('q');
  await page.waitForFunction(() => (
    window.LUXURY_APARTMENT.state.posture === null
      && window.LUXURY_APARTMENT.player.mode === 'walk'
  ));
  const dartsExit = await page.evaluate(() => ({
    active: window.LUXURY_APARTMENT.darts.active,
    posture: window.LUXURY_APARTMENT.state.posture,
    mode: window.LUXURY_APARTMENT.player.mode,
    fov: window.LUXURY_APARTMENT.camera.fov,
    reticle: document.getElementById('luxury-game-panel').classList.contains('darts-active'),
  }));
  check('real hold-and-release input throws multiple ballistic darts, scores impacts, resets, and exits cleanly',
    dartsEntry.entered
      && dartsEntry.posture === 'darts'
      && dartsEntry.playerMode === 'seated'
      && dartsEntry.active
      && dartsEntry.aimedAtBoard > 0.99
      && dartsEntry.throws === 0
      && dartsEntry.fov === 50
      && dartsEntry.numberedSections === 20
      && dartsEntry.reticle
      && dartCharges.every(({ active, amount }) => active && amount > 0)
      && dartCharges[1].amount > dartCharges[0].amount
      && dartImpacts.length === 2
      && dartImpacts.every(({ target, age }) => target === 'dartboard' && age > 0)
      && dartImpacts.some(({ score }) => score > 0)
      && dartsBeforeReset.throws === 2
      && dartsBeforeReset.projectiles === 2
      && /scored|left|won/i.test(dartsBeforeReset.last)
      && dartsAfterReset.throws === 0
      && dartsAfterReset.projectiles === 0
      && dartsAfterReset.lastImpact === null
      && dartsAfterReset.remaining === 301
      && !dartsExit.active
      && dartsExit.posture === null
      && dartsExit.mode === 'walk'
      && dartsExit.fov === 68
      && !dartsExit.reticle,
    JSON.stringify({
      entry: dartsEntry,
      charges: dartCharges,
      impacts: dartImpacts,
      beforeReset: dartsBeforeReset,
      afterReset: dartsAfterReset,
      exit: dartsExit,
    }));

  // The parity/runtime proof is appended below once the public verification
  // surface has been exercised. Keeping it in one browser session ensures the
  // controllers are connected to the same real world handles proven above.
  const parity = await page.evaluate(() => window.LUXURY_APARTMENT.verifyParity?.());

  check('the public parity surface exercises toilet free-aim and seated push play',
    parity?.toilet?.aim?.started
      && parity.toilet.aim.completed
      && parity.toilet.aim.report?.lastPee?.inside === true
      && parity.toilet.push?.started
      && parity.toilet.push.solved
      && parity.toilet.push.report?.pushes?.hits > 0
      && parity.toilet.push.report?.progress >= 0.98,
    JSON.stringify(parity?.toilet));
  check('the crooked-frame TimingBar is solved through its live controller',
    parity?.crookedArt?.started
      && parity.crookedArt.solved
      && parity.crookedArt.report?.completed
      && parity.crookedArt.report?.hits === parity.crookedArt.report?.total,
    JSON.stringify(parity?.crookedArt));
  check('the answering machine plays and clears its complete message queue',
    parity?.answeringMachine?.started
      && parity.answeringMachine.completed
      && parity.answeringMachine.report?.heard
      && parity.answeringMachine.report?.waiting === 0
      && parity.answeringMachine.report?.transcript?.length >= 2,
    JSON.stringify(parity?.answeringMachine));
  check('the revolver pickup, ammunition, shot, and reload loop is live',
    parity?.revolver?.pickedUp
      && parity.revolver.ammoTaken
      && parity.revolver.shot?.fired
      && parity.revolver.reloaded > 0
      && parity.revolver.report?.owned
      && parity.revolver.report?.shots >= 1,
    JSON.stringify(parity?.revolver));
  check('the bong, mushrooms, and white-line apartment props all run their real effects',
    parity?.substances?.bongUsed
      && parity.substances.shroomsUsed
      && parity.substances.whiteLineUsed
      && parity.substances.state?.bongUses >= 1
      && parity.substances.state?.shroomsTaken
      && parity.substances.state?.whiteLineConsumed,
    JSON.stringify(parity?.substances));
  check('the physical cabinet, solo poker refusal, and darts execute deterministic actions',
    parity?.games?.cabinet?.launched
      && parity.games.cabinet.app === 'smash'
      && parity.games.poker?.played === false
      && parity.games.poker.posture === null
      && typeof parity.games.poker?.line === 'string'
      && parity.games.poker.line.length > 0
      && parity.games.poker.patrons === 0
      && parity.games.darts?.entered
      && parity.games.darts.throw?.score > 0,
    JSON.stringify(parity?.games));

  const sleepStarted = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    runtime.teleport('loft');
    return runtime.sleep();
  });
  await page.waitForFunction(() => (
    window.LUXURY_APARTMENT.state.sleepCount === 1
      && !window.LUXURY_APARTMENT.state.resting
  ));
  await page.waitForFunction(() => {
    const runtime = window.LUXURY_APARTMENT;
    const ground = runtime.home.groundAt(
      runtime.player.position.x,
      runtime.player.position.z,
    );
    return Math.abs((runtime.player.position.y - ground) - 1.68) < 0.03;
  });
  const slept = await page.evaluate(() => ({
    sleepCount: window.LUXURY_APARTMENT.state.sleepCount,
    day: window.LUXURY_APARTMENT.time.day,
    positionY: window.LUXURY_APARTMENT.player.position.y,
    ground: window.LUXURY_APARTMENT.home.groundAt(
      window.LUXURY_APARTMENT.player.position.x,
      window.LUXURY_APARTMENT.player.position.z,
    ),
  }));
  check('sleep advances the standalone clock and restores a loft-safe walking pose',
    sleepStarted
      && slept.sleepCount === 1
      && slept.day === 9
      && Math.abs((slept.positionY - slept.ground) - 1.68) < 0.03,
    JSON.stringify(slept));
  if (SCREENSHOT_DIR) {
    await page.evaluate(() => {
      const runtime = window.LUXURY_APARTMENT;
      runtime.teleport('main');
      runtime.player.position.set(0.75, 1.68, 1.35);
      runtime.player.ground = 0;
      runtime.player.yaw = Math.PI;
      runtime.player.pitch = -0.04;
    });
    await page.waitForTimeout(220);
    await capture(page, 'luxury-morning');
  }

  /* The earlier door proof only called the lift. Finish on the actual exit so
   * a navigating interaction cannot strand the rest of this verifier on the
   * scene-select page. Positioning authors the player's physical starting
   * pose; the production camera, raycaster, keyboard handler and elevator
   * descriptor still have to resolve and perform the ride. */
  const elevatorApproach = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const target = runtime.home.utilityTargets.elevator;
    const moved = runtime.teleport('arrival');
    const targetPosition = target.getWorldPosition(new target.position.constructor());
    const delta = targetPosition.clone().sub(runtime.player.position);
    runtime.player.yaw = Math.atan2(-delta.x, -delta.z);
    runtime.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    runtime.player.update(0.001);
    runtime.camera.updateMatrixWorld(true);
    runtime.interaction.setPaused(false);
    runtime.interaction.update(0);
    return {
      moved,
      targetResolved: runtime.interaction.current === target,
      current: runtime.interaction.current?.name ?? null,
      elevatorOpen: runtime.home.state.elevatorOpen,
      colliderDisabled: runtime.home.doors.elevator.collider.max.y < 0,
      position: runtime.player.position.toArray(),
      yaw: runtime.player.yaw,
      pitch: runtime.player.pitch,
      campaignBefore: localStorage.getItem('squatchlife.campaign'),
    };
  });
  /* Install the intermediate-state observer before the real keypress. The
   * production receipt intentionally exists only during the final 940 ms of
   * the curtain hold; on a saturated SwiftShader frame the old post-keypress
   * observer could be scheduled after navigation and turn a successful ride
   * into an opaque timeout. Keeping the navigation wait separate below still
   * guarantees that a failed interaction cannot leave a dangling promise. */
  const elevatorReceipt = page.waitForFunction(() => {
    const runtime = window.LUXURY_APARTMENT;
    const curtain = document.getElementById('luxury-elevator-exit');
    return runtime?.state?.phase === 'exiting'
      && runtime.state.exitAudioStopped
      && runtime.player.enabled === false
      && runtime.player.keys.size === 0
      && runtime.interaction.paused
      && document.pointerLockElement === null
      && !runtime.home.state.elevatorOpen
      && runtime.home.doors.elevator.collider.max.y > 2
      && curtain?.classList.contains('active')
      && Number.parseFloat(getComputedStyle(curtain).opacity) >= 0.5;
  }, null, { timeout: AUXILIARY_WAIT.timeout, polling: 25 });
  await page.keyboard.press('e');
  await elevatorReceipt;
  const elevatorTransition = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const curtain = document.getElementById('luxury-elevator-exit');
    const duplicateRide = runtime.actions.elevator('ride');
    return {
      phase: runtime.state.phase,
      destination: runtime.state.exitDestination,
      audioStopped: runtime.state.exitAudioStopped,
      audioContext: runtime.audio.ctx?.state ?? null,
      activeLoops: runtime.audio.loops.size,
      activeSpeech: runtime.audio._voiceSources?.size ?? 0,
      playerEnabled: runtime.player.enabled,
      heldKeys: runtime.player.keys.size,
      interactionPaused: runtime.interaction.paused,
      pointerLocked: Boolean(document.pointerLockElement),
      elevatorOpen: runtime.home.state.elevatorOpen,
      colliderRestored: runtime.home.doors.elevator.collider.max.y > 2,
      curtainActive: curtain.classList.contains('active'),
      curtainHidden: curtain.getAttribute('aria-hidden'),
      curtainOpacity: Number.parseFloat(getComputedStyle(curtain).opacity),
      duplicateRide,
    };
  });
  check('real E input takes the called elevator, closes the scene, locks control, and silences active audio',
    elevatorApproach.moved
      && elevatorApproach.targetResolved
      && elevatorApproach.elevatorOpen
      && elevatorApproach.colliderDisabled
      && elevatorTransition.phase === 'exiting'
      && elevatorTransition.destination === './preview.html'
      && elevatorTransition.audioStopped
      && elevatorTransition.audioContext === 'suspended'
      && elevatorTransition.activeLoops === 0
      && elevatorTransition.activeSpeech === 0
      && !elevatorTransition.playerEnabled
      && elevatorTransition.heldKeys === 0
      && elevatorTransition.interactionPaused
      && !elevatorTransition.pointerLocked
      && !elevatorTransition.elevatorOpen
      && elevatorTransition.colliderRestored
      && elevatorTransition.curtainActive
      && elevatorTransition.curtainHidden === 'false'
      && elevatorTransition.curtainOpacity >= 0.5
      && elevatorTransition.duplicateRide === false,
    JSON.stringify({ approach: elevatorApproach, transition: elevatorTransition }));
  /* Begin this only after the intermediate receipt is captured. Previously a
   * failure in that receipt closed the browser in finally and turned this
   * unobserved promise into a misleading "Target page has been closed" error. */
  const previewNavigation = page.waitForURL('**/preview.html', {
    waitUntil: 'domcontentloaded',
    timeout: AUXILIARY_WAIT.timeout,
  });
  await previewNavigation;
  const elevatorDestination = await page.evaluate(() => ({
    path: location.pathname,
    campaignAfter: localStorage.getItem('squatchlife.campaign'),
  }));
  check('the real private-elevator ride navigates to scene select without mutating campaign state',
    elevatorDestination.path.endsWith('/preview.html')
      && elevatorDestination.campaignAfter === elevatorApproach.campaignBefore,
    JSON.stringify({ before: elevatorApproach.campaignBefore, ...elevatorDestination }));

  check('the luxury-apartment browser run has no page, console, or request failures',
    problems.length === 0,
    problems.join(' | '));
  } else {
    check('the Beat-27 auxiliary browser run has no page, console, or request failures',
      problems.length === 0,
      problems.join(' | '));
  }
} finally {
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter(({ ok }) => !ok);
if (failed.length) {
  console.error(`Luxury apartment verification failed: ${failed.length}/${results.length} checks.`);
  process.exit(1);
}
console.log(`Luxury apartment verification passed: ${results.length}/${results.length} checks.`);
