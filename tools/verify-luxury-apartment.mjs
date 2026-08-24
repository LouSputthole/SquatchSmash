#!/usr/bin/env node
/**
 * Focused browser proof for the standalone late-game luxury apartment.
 *
 * Boots the real WebGL page, inspects the authored two-floor/art/utility
 * contracts, starts the first-person runtime, and exercises every apartment
 * parity activity through the scene's public deterministic verification seam.
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

const EXPECTED_PC_APPS = Object.freeze([
  'mail',
  'smash',
  'shoot',
  'counter',
  'counter-guide',
  'match-result',
  'yuka',
  'doom',
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
  'luxury.arcade.marquee',
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
  'frontDoor', 'elevator', 'bed', 'couch', 'desk', 'tv', 'radio', 'phone',
  'fridge', 'kitchen', 'shower', 'wardrobe', 'toilet',
  'mainLights', 'loftLights', 'cityGlass', 'shades', 'answeringMachine',
  'revolver', 'ammo', 'bong', 'shrooms', 'whiteLine', 'crookedArt',
]);

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
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 400)}`);
  });
  page.on('requestfailed', (request) => {
    problems.push(`request: ${request.url()} - ${request.failure()?.errorText || 'failed'}`);
  });

  await page.goto(`http://127.0.0.1:${PORT}/luxury-apartment.html?preview=1`, {
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
      utilities,
      utilityKeys: Object.keys(home.utilityTargets),
      gameStations: Object.keys(home.gameStations),
      pcApps,
      appLookup,
      pcLaunchById: typeof runtime.pcArcade.launchById === 'function',
      cabinetApps: runtime.cabinetArcade.apps.map(({ id }) => id),
      cabinetStation: Boolean(home.gameStations.arcade?.screen === home.screens.arcade),
      blackjack: Boolean(runtime.blackjack && home.gameStations.poker),
      darts: Boolean(runtime.darts && home.gameStations.darts),
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
  check('all 61 inherited apartment art assets and all 14 additions resolve real files',
    authored.metrics.originalArtSlots === 61
      && authored.metrics.extraArtSlots === 14
      && authored.apartmentArt === 61
      && authored.luxuryArt === 14
      && authored.art.length === 75
      && authored.art.every(({ real, file, width, height, zone, kind }) => (
        real && file && width > 0 && height > 0 && zone && kind
      )),
    JSON.stringify({
      original: authored.apartmentArt,
      extra: authored.luxuryArt,
      unresolved: authored.art.filter(({ real }) => !real).map(({ slot }) => slot),
    }));
  check('art taxonomy proves 55 hung, 6 standing/under-bed, and 14 prop-only placements',
    authored.metrics.hungArtSlots === 55
      && authored.metrics.standingArtSlots === 6
      && authored.metrics.displayArtSlots === 61
      && authored.metrics.propTextureSlots === 14
      && authored.artTargetCount === 61
      && authored.displayArt.length === 61
      && authored.propArt.length === 14
      && authored.propArt.every(({ textureAttached }) => textureAttached)
      && authored.visibleArtSlots.length === 75
      && authored.expectedPropPlaced.every(Boolean)
      && authored.extraArtZones.length === 14
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
  check('the complete domestic utility set is present and interactive',
    authored.utilities.length === EXPECTED_UTILITIES.length
      && authored.utilities.every(({ exists, interactive }) => exists && interactive),
    JSON.stringify({
      utilities: authored.utilities.length,
      missing: authored.utilities.filter(({ exists, interactive }) => !exists || !interactive),
    }));
  check('the loft PC carries exactly the original eight Squatch OS applications',
    JSON.stringify(sorted(authored.pcApps)) === JSON.stringify(sorted(EXPECTED_PC_APPS))
      && authored.appLookup.every(Boolean)
      && authored.pcLaunchById,
    JSON.stringify({ apps: authored.pcApps }));
  check('the cabinet, blackjack table, and darts board are real playable stations',
    authored.cabinetStation
      && JSON.stringify(sorted(authored.cabinetApps)) === JSON.stringify(sorted(EXPECTED_PC_APPS))
      && authored.blackjack
      && authored.darts
      && ['pc', 'arcade', 'poker', 'darts', 'console']
        .every((id) => authored.gameStations.includes(id)),
    JSON.stringify({ stations: authored.gameStations, cabinetApps: authored.cabinetApps }));

  await capture(page, 'luxury-arrival');
  await page.evaluate(() => document.getElementById('start-btn').click());
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

  const arcadeClocks = await page.evaluate(() => ({
    scene: window.LUXURY_APARTMENT.time.clock12,
    pc: window.LUXURY_APARTMENT.pcArcade.clock,
    cabinet: window.LUXURY_APARTMENT.cabinetArcade.clock,
  }));
  check('both Squatch OS screens track the standalone apartment clock',
    arcadeClocks.pc === arcadeClocks.scene && arcadeClocks.cabinet === arcadeClocks.scene,
    JSON.stringify(arcadeClocks));

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
  await page.waitForFunction(() => document.pointerLockElement === null, undefined, { timeout: 10000 });
  await page.waitForFunction(() => {
    const app = window.LUXURY_APARTMENT.pcArcade.app;
    const frame = app?.overlay?.el;
    return app?.id === 'smash' && frame?.contentDocument?.readyState === 'complete';
  }, undefined, { timeout: 10000 });
  await page.evaluate(() => window.LUXURY_APARTMENT.pcArcade.app.overlay.focusFrame());
  await page.waitForFunction(() => {
    const frame = window.LUXURY_APARTMENT.pcArcade.app?.overlay?.el;
    return Boolean(frame) && document.activeElement === frame;
  }, undefined, { timeout: 10000 });
  const releasedForDom = await page.evaluate(() => document.pointerLockElement === null);
  await page.keyboard.down('Tab');
  await page.waitForTimeout(720);
  await page.keyboard.up('Tab');
  await page.waitForFunction(() => {
    const runtime = window.LUXURY_APARTMENT;
    return runtime.pcArcade.mode === 'desktop'
      && runtime.pcArcade.inputMode === 'relative'
      && document.pointerLockElement === document.getElementById('scene');
  }, undefined, { timeout: 10000 });
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
      ground: runtime.home.groundAt(runtime.player.position.x, runtime.player.position.z),
    };
    const loftMoved = runtime.teleport('loft');
    const loft = {
      y: runtime.player.position.y,
      ground: runtime.home.groundAt(runtime.player.position.x, runtime.player.position.z),
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
  check('the physical cabinet and both table games execute deterministic actions',
    parity?.games?.cabinet?.launched
      && parity.games.cabinet.app === 'smash'
      && parity.games.blackjack?.opened
      && parity.games.blackjack.bet > 0
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

  check('the luxury-apartment browser run has no page, console, or request failures',
    problems.length === 0,
    problems.join(' | '));
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
