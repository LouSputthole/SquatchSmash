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
    const bathroomWestRail = home.colliders.find(({ name }) => name === 'luxury-stair-rail-west-collider');
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
        walls: bathroomParts.filter((name) => name.startsWith('luxury-bath-wall-')).length,
        doorPresent: Boolean(home.bathroom.door?.target),
        doorWidth: bathroomBounds.doorX1 - bathroomBounds.doorX0,
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
          home.root.traverse((object) => {
            if (object.userData?.actor) seated += 1;
          });
          return seated;
        })(),
        seats: home.poker?.seats?.length ?? 0,
        railPresent: Boolean(home.poker?.rail),
        feltPresent: Boolean(home.poker?.felt),
      },
      dartsPolish: {
        board: Boolean(home.darts?.board),
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
      blackjackMounted: 'blackjack' in runtime,
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
      && authored.bathroom.walls === 5
      && authored.bathroom.doorPresent
      && authored.bathroom.doorWidth >= 0.78
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
      && authored.bathroom.toiletPaper.y > 0.5,
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
      && authored.dartsPolish.board
      && authored.dartsPolish.backing
      && authored.dartsPolish.rack
      && authored.dartsPolish.impactRoot
      && Math.abs(authored.dartsPolish.normal.x) < 1e-9
      && Math.abs(authored.dartsPolish.normal.y) < 1e-9
      && Math.abs(authored.dartsPolish.normal.z - 1) < 1e-9
      && authored.bedroomPolish.wallPresent
      && authored.bedroomPolish.wallPanels === 2
      && authored.bedroomPolish.bannerZones.every((zone) => zone === 'bedroom-privacy-wall')
      && authored.cityGround.present
      && authored.cityGround.groundY === authored.cityGround.lowestBuildingY,
    JSON.stringify({
      workstation: authored.workstation,
      poker: authored.pokerPolish,
      darts: authored.dartsPolish,
      bedroom: authored.bedroomPolish,
      cityGround: authored.cityGround,
    }));
  check('the bathroom mirror and darts physics consume the approved shared foundations',
    LUXURY_MAIN_SOURCE.includes("from '../core/planar-mirror.js'")
      && LUXURY_MAIN_SOURCE.includes('new PlanarMirror(')
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
  check('the cabinet and darts board are real playable stations, and no table game is mounted',
    authored.cabinetStation
      && JSON.stringify(sorted(authored.cabinetApps)) === JSON.stringify(sorted(EXPECTED_PC_APPS))
      && !authored.blackjackMounted
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

    home.utilityTargets.elevator.userData.interact.onUse();
    advance();
    const elevatorCalled = {
      open: home.doors.elevator.isOpen(),
      stateOpen: home.state.elevatorOpen,
      colliderDisabled: home.doors.elevator.collider.max.y < 0,
    };

    return { serviceDoor, elevatorCalled };
  });
  check('the sealed service door cannot bypass the private elevator, which can be called into the apartment',
    doorFlows.serviceDoor.result === false
      && doorFlows.serviceDoor.locked
      && !doorFlows.serviceDoor.open
      && !doorFlows.serviceDoor.stateOpen
      && doorFlows.elevatorCalled.open
      && doorFlows.elevatorCalled.stateOpen
      && doorFlows.elevatorCalled.colliderDisabled,
    JSON.stringify({ serviceDoor: doorFlows.serviceDoor, call: doorFlows.elevatorCalled }));

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
  await page.keyboard.press('e');
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
      null, { timeout: 30000, polling: 50 });
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

  let bathroomReturnedByInput = true;
  await page.keyboard.down('s');
  try {
    await page.waitForFunction(() => window.LUXURY_APARTMENT.player.position.z >= -0.40,
      null, { timeout: 30000, polling: 50 });
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
      afterReturn: bathroomAfterReturn,
      closedViaInput: bathroomClosedViaInput,
      closed: bathroomExited,
    }));

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
  await page.waitForFunction(() => document.pointerLockElement === null, undefined, { timeout: 60000 });
  await page.waitForFunction(() => {
    const app = window.LUXURY_APARTMENT.pcArcade.app;
    const frame = app?.overlay?.el;
    return app?.id === 'smash' && frame?.contentDocument?.readyState === 'complete';
  }, undefined, { timeout: 60000 });
  await page.evaluate(() => window.LUXURY_APARTMENT.pcArcade.app.overlay.focusFrame());
  await page.waitForFunction(() => {
    const frame = window.LUXURY_APARTMENT.pcArcade.app?.overlay?.el;
    return Boolean(frame) && document.activeElement === frame;
  }, undefined, { timeout: 60000 });
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
  }, undefined, { timeout: 60000 });
  // `hover()` is not an instruction to emit pointerenter when the mouse is
  // already over the element. Leave the control first, then enter it exactly
  // as a player would. Without this move the verifier intermittently waited
  // for focus that the browser had no event-driven reason to change.
  await page.mouse.move(640, 400, { steps: 4 });
  await framedExit.hover();
  await page.waitForFunction(() => (
    document.activeElement?.getAttribute?.('aria-label') === 'Exit to the SquatchOS desktop'
  ), undefined, { timeout: 60000 });
  await page.keyboard.down('Tab');
  await page.waitForTimeout(720);
  await page.keyboard.up('Tab');
  await page.waitForFunction(() => {
    const runtime = window.LUXURY_APARTMENT;
    return runtime.pcArcade.mode === 'desktop'
      && runtime.pcArcade.inputMode === 'relative'
      && document.pointerLockElement === document.getElementById('scene');
  }, undefined, { timeout: 60000 });
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
    };
  });
  await page.waitForFunction(() => (
    window.LUXURY_APARTMENT.state.posture === 'darts'
      && window.LUXURY_APARTMENT.darts.active
  ), null, { timeout: 60000 });
  const dartImpacts = [];
  const dartCharges = [];
  for (const targetCharge of [0.20, 0.55]) {
    const beforeThrows = await page.evaluate(() => window.LUXURY_APARTMENT.darts.throws);
    await page.keyboard.down('e');
    await page.waitForFunction((minimum) => (
      window.LUXURY_APARTMENT.darts.charge.active
        && window.LUXURY_APARTMENT.darts.charge.amount >= minimum
    ), targetCharge, { timeout: 60000, polling: 100 });
    dartCharges.push(await page.evaluate(() => ({
      active: window.LUXURY_APARTMENT.darts.charge.active,
      amount: window.LUXURY_APARTMENT.darts.charge.amount,
    })));
    await page.keyboard.up('e');
    await page.waitForFunction((prior) => {
      const darts = window.LUXURY_APARTMENT.darts;
      return darts.throws > prior && !darts.inFlight && Boolean(darts.lastImpact);
    }, beforeThrows, { timeout: 60000, polling: 100 });
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
  }));
  check('real hold-and-release input throws multiple ballistic darts, scores impacts, resets, and exits cleanly',
    dartsEntry.entered
      && dartsEntry.posture === 'darts'
      && dartsEntry.playerMode === 'seated'
      && dartsEntry.active
      && dartsEntry.aimedAtBoard > 0.99
      && dartsEntry.throws === 0
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
      && dartsExit.mode === 'walk',
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
  check('the cabinet and the dartboard execute deterministic actions, and poker refuses',
    parity?.games?.cabinet?.launched
      && parity.games.cabinet.app === 'smash'
      && parity.games.poker?.played === false
      && parity.games.poker.posture === null
      && typeof parity.games.poker?.line === 'string'
      && parity.games.poker.line.length > 0
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
  }, null, { timeout: 30000, polling: 25 });
  await page.keyboard.press('e');
  await elevatorReceipt;
  const elevatorTransition = await page.evaluate(() => {
    const runtime = window.LUXURY_APARTMENT;
    const curtain = document.getElementById('luxury-elevator-exit');
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
      && elevatorTransition.curtainOpacity >= 0.5,
    JSON.stringify({ approach: elevatorApproach, transition: elevatorTransition }));
  /* Begin this only after the intermediate receipt is captured. Previously a
   * failure in that receipt closed the browser in finally and turned this
   * unobserved promise into a misleading "Target page has been closed" error. */
  const previewNavigation = page.waitForURL('**/preview.html', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
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
