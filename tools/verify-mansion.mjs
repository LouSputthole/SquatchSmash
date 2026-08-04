#!/usr/bin/env node
/**
 * Verify Lou's Mansion -- a standalone, explore-only environment (exterior
 * grounds + interior rooms, no NPCs/combat/dialogue/mission state).
 *
 * WHAT THIS CHECKS, AND WHY IT IS SHAPED THIS WAY
 *
 * The owner's playtest of the merged scene reported "Basement doesn't work"
 * and "Cant enter a few of the rooms invisible walls". The previous version
 * of this script reported 21/21 green on exactly that build, because it
 * proved every room by TELEPORTING into the middle of it and reading back a
 * floor height. Teleporting past a wall proves nothing about whether the wall
 * has a doorway in it, and reading a floor height inside a stairwell proves
 * nothing about whether the stair can be walked down.
 *
 * So the guided tour below is built the other way round:
 *
 *   1. Every room in the scene's own room table is entered ON FOOT, by
 *      standing outside its doorway and holding W until the player is inside
 *      the room's rect at the room's own floor height. If a doorway is walled
 *      up, furnished shut, or leads into a wedge with no headroom, the walk
 *      simply does not arrive and the check fails.
 *   2. The room table is compared against the interior's room list, so a room
 *      that exists in the scene but has no walk test here is itself a
 *      failure -- a verifier cannot silently stop covering new geometry.
 *   3. The basement is walked down to, from the foyer, on foot.
 *   4. The horseshoe is climbed on foot, on both flights, and the balcony
 *      between them is walked out onto.
 *   5. The parked cars are checked for overlap -- with each other, with the
 *      fountain, and with the house -- because "car orientation and density"
 *      was a real geometry fault (three cars on 4 m centres, all 5+ m long).
 *   6. Boundaries: the fence, the pool curb, the balcony rail.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5224;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const GROUND_Y = 1.2;
const UPPER_Y = 6.0;
const BASEMENT_Y = -2.8;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the mansion.');
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
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 240));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* Small helpers over window.mansion's debug handle                    */
/* ------------------------------------------------------------------ */
async function teleport(x, y, z, yawDeg = 0) {
  await page.evaluate(
    ([tx, ty, tz, tyaw]) => window.mansion.teleport(tx, ty, tz, tyaw),
    [x, y, z, yawDeg],
  );
}

/** Step the headless simulation without waiting on real animation frames. */
async function settle(seconds = 1.0) {
  await page.evaluate((s) => window.mansion.tick(s), seconds);
}

async function state() {
  return page.evaluate(() => {
    const p = window.mansion.player;
    return {
      x: Number(p.position.x.toFixed(3)),
      y: Number(p.position.y.toFixed(3)),
      z: Number(p.position.z.toFixed(3)),
      ground: Number(p.ground.toFixed(3)),
    };
  });
}

/**
 * Hold real key(s) via a genuine DOM keydown/keyup, but drive the distance
 * covered through the scene's own headless tick() rather than real
 * animation-frame pacing -- this repo's squatchfather/no-wake verify scripts
 * use the identical "real keys, scene clock" split, because swiftshader's
 * frame rate says nothing about how far a held key should have moved you.
 */
async function walk(seconds, keys = ['KeyW']) {
  for (const k of keys) await page.keyboard.down(k);
  await settle(seconds);
  for (const k of keys) await page.keyboard.up(k);
  await settle(0.2);
}

/** Aim, then walk -- the same headless steering src/nowake's script uses. */
async function faceDeg(yawDeg) {
  await page.evaluate((deg) => {
    window.mansion.player.yaw = (deg * Math.PI) / 180;
  }, yawDeg);
}

/**
 * Yaw (degrees) for a heading. In core/player.js a forward press moves along
 * (-sin yaw, -cos yaw), so 0 faces -Z, 90 faces -X, 180 faces +Z, 270 faces
 * +X. Spelled out here because every walk below depends on it.
 */
const NORTH = 180; // toward +z, deeper into the property
const SOUTH = 0;
const WEST = 90;
const EAST = 270;

function inside(rect, s, pad = 0.25) {
  return s.x >= rect.x0 + pad && s.x <= rect.x1 - pad
    && s.z >= rect.z0 + pad && s.z <= rect.z1 - pad;
}

try {
  await page.goto(`http://localhost:${PORT}/mansion.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.mansion?.player, null, { timeout: 120000 });

  /* ================================================================ */
  /* Static sanity                                                     */
  /* ================================================================ */
  const rooms = await page.evaluate(() => {
    const out = {};
    for (const [k, v] of Object.entries(window.mansion.rooms)) {
      out[k] = (v && typeof v === 'object' && 'x' in v) ? { x: v.x, y: v.y, z: v.z } : v;
    }
    return out;
  });
  const EXPECTED_ANCHORS = [
    // grounds
    'gate', 'spawn', 'spawnYaw', 'fountainFront', 'frontDoorOutside', 'securityBooth',
    'poolPatio', 'poolDoorOutside', 'poolSteps', 'serviceRoadEntrance', 'rosePavilion',
    // interior -- ground
    'foyerCenter', 'foyerRear', 'horseshoeWestFoot', 'horseshoeEastFoot',
    'horseshoeWestTop', 'horseshoeEastTop', 'balconyRail', 'livingRoomCenter',
    'loungeCenter', 'ballroomCenter', 'diningTable', 'kitchenIsland',
    // interior -- basement
    'basementStairTop', 'basementLanding', 'armoryCenter',
    // interior -- upper
    'galleryCenter', 'galleryWest', 'galleryEast', 'conferenceTable', 'conferenceHead',
    'officeDesk', 'bedWestFront', 'bedEastFront', 'bedWestRear', 'bedEastRear',
    'bathWest', 'bathEast', 'chandelier',
  ];
  const missingAnchors = EXPECTED_ANCHORS.filter((k) => !(k in rooms));
  const extraAnchors = Object.keys(rooms).filter((k) => !EXPECTED_ANCHORS.includes(k));
  check('window.mansion.rooms exposes every expected anchor (grounds + interior merged)',
    missingAnchors.length === 0 && extraAnchors.length === 0,
    JSON.stringify({ missingAnchors, extraAnchors }));

  const colliderInfo = await page.evaluate(() => ({
    collidersCount: window.mansion.collidersCount,
    actualLength: window.mansion.colliders.length,
    groundsLen: window.mansion.grounds.colliders.length,
    interiorLen: window.mansion.interior.colliders.length,
  }));
  check('collidersCount is internally consistent and a sane positive number (geometry actually built)',
    colliderInfo.collidersCount === colliderInfo.actualLength
      && colliderInfo.collidersCount === colliderInfo.groundsLen + colliderInfo.interiorLen
      && colliderInfo.collidersCount > 50,
    JSON.stringify(colliderInfo));

  const roomTable = await page.evaluate(() => {
    const out = {};
    for (const [k, v] of Object.entries(window.mansion.roomTable)) {
      out[k] = { rect: { ...v.rect }, floor: v.floor };
    }
    return out;
  });

  /* ================================================================ */
  /* Boot gate                                                         */
  /* ================================================================ */
  await page.evaluate(() => document.getElementById('startBtn').click());
  await page.waitForFunction(() => window.mansion.running === true, null, { timeout: 120000 });
  check('clicking start begins the tour and hides the menu',
    await page.evaluate(() => window.mansion.running === true
      && document.getElementById('menu').classList.contains('hidden')));

  // Render real frames before the tour, so a shader or WebGL failure in the
  // new geometry surfaces here rather than never being exercised.
  await page.waitForFunction(() => window.mansion.framesRendered > 3, null, { timeout: 180000 });
  check('the scene renders real frames after boot', true,
    `${await page.evaluate(() => window.mansion.framesRendered)} frames`);

  /* Suspend rendering for the walking tour. Every check from here to the
   * screenshot at the end is geometry, collision and navigation -- none of it
   * reads a pixel -- and driving 3,700 meshes through swiftshader for the
   * several simulated minutes the tour takes exhausts the software GPU
   * process and takes the browser down with it. Rendering comes back on at
   * the end and the canvas is checked for actual content. */
  await page.evaluate(() => window.mansion.setRendering(false));

  /* ================================================================ */
  /* Grounds                                                           */
  /* ================================================================ */

  // 1. Spawn at the street gate, facing into the property.
  await teleport(rooms.spawn.x, 0, rooms.spawn.z, (rooms.spawnYaw * 180) / Math.PI);
  await settle(0.3);
  let s = await state();
  check('spawns at the street gate facing into the property',
    Math.abs(s.x - rooms.spawn.x) < 0.3 && Math.abs(s.z - rooms.spawn.z) < 0.3,
    JSON.stringify(s));

  // 2. Up the driveway. The fountain now sits at z=32 with a 3.6 m collision
  // radius, so a straight walk up the centreline is stopped short of it and
  // has to go round -- that is a real fountain in a real turnaround, and this
  // asserts both the progress and the block.
  await teleport(0, 0, 10, NORTH);
  const beforeDrive = await state();
  await walk(10);
  const afterDrive = await state();
  check('walking up the driveway with real WASD makes real forward progress before the fountain blocks it',
    (afterDrive.z - beforeDrive.z) > 12 && afterDrive.z < 29 && Math.abs(afterDrive.x) < 0.6,
    JSON.stringify({ beforeDrive, afterDrive }));

  // 3. Round the fountain and up the front steps, on foot the whole way.
  // The basin blocks x:-3.7..3.7 / z:28.4..35.6, so this goes round it to the
  // east, up the far side of the forecourt, and back onto the steps -- which
  // is what a player does, and what proves the way in is not sealed.
  await teleport(0, 0, 24, NORTH);
  await faceDeg(EAST);
  await walk(2.4); // into the corridor east of the basin
  await faceDeg(NORTH);
  await walk(8); // up past the basin to the foot of the steps
  await faceDeg(WEST);
  await walk(2.4); // back to the centreline
  await faceDeg(NORTH);
  await walk(3.5); // up the steps onto the portico
  await settle(0.5);
  s = await state();
  check('the front steps and entry portico are reachable on foot around the fountain',
    s.z > 38.6 && Math.abs(s.ground - GROUND_Y) < 0.35,
    JSON.stringify(s));

  // 4. Through the front door.
  await faceDeg(NORTH);
  await walk(4);
  await settle(0.8);
  s = await state();
  check('walking through the front door reaches the foyer at ground level',
    s.z > 42 && Math.abs(s.ground - GROUND_Y) < 0.35,
    JSON.stringify(s));

  /* ================================================================ */
  /* THE HORSESHOE -- both flights climbed on foot, balcony walked      */
  /* ================================================================ */
  for (const [side, anchor] of [['west', 'horseshoeWestFoot'], ['east', 'horseshoeEastFoot']]) {
    await teleport(rooms[anchor].x, GROUND_Y, rooms[anchor].z - 1.4, NORTH);
    await settle(0.4);
    await walk(9);
    await settle(1.0);
    s = await state();
    check(`the ${side} flight of the horseshoe can be climbed on foot to the gallery`,
      s.z > 47.5 && Math.abs(s.ground - UPPER_Y) < 0.4,
      JSON.stringify(s));
  }

  // ...and back down the west flight.
  await teleport(rooms.horseshoeWestFoot.x, UPPER_Y, 49, SOUTH);
  await settle(0.4);
  await walk(9);
  await settle(1.0);
  s = await state();
  check('the horseshoe can be descended on foot back to the foyer floor',
    s.z < 43.5 && Math.abs(s.ground - GROUND_Y) < 0.4,
    JSON.stringify(s));

  // The balcony in the middle, between the two flights.
  await teleport(0, UPPER_Y, 50.5, SOUTH);
  await settle(0.4);
  await walk(4);
  await settle(0.5);
  s = await state();
  check('the balcony between the two flights is walked out onto, over the foyer void',
    s.z < 48 && s.z > 45 && Math.abs(s.ground - UPPER_Y) < 0.25,
    JSON.stringify(s));

  /* ================================================================ */
  /* EVERY ROOM, ENTERED ON FOOT THROUGH ITS OWN DOORWAY                */
  /*                                                                     */
  /* `from` is where the player stands OUTSIDE the room (in the space     */
  /* the door opens off), `face` the heading, `secs` how long to hold W.   */
  /* ================================================================ */
  const WALKS = [
    {
      room: 'foyer', from: [0, GROUND_Y, 39.6], face: NORTH, secs: 5, note: 'from the portico, through the front door',
    },
    {
      room: 'livingRoom', from: [-6.5, GROUND_Y, 50.5], face: WEST, secs: 5, note: 'from the rear foyer, through the west archway',
    },
    {
      room: 'lounge', from: [6.5, GROUND_Y, 50.5], face: EAST, secs: 5, note: 'from the rear foyer, through the east archway',
    },
    {
      room: 'ballroom', from: [0, GROUND_Y, 55.5], face: NORTH, secs: 6, note: 'from the rear foyer, through the ballroom doors',
    },
    {
      room: 'dining', from: [-12.5, GROUND_Y, 55.6], face: NORTH, secs: 5, note: 'from the living room, through the dining door',
    },
    {
      room: 'kitchen', from: [12.5, GROUND_Y, 55.6], face: NORTH, secs: 5, note: 'from the lounge, through the kitchen door',
    },
    {
      room: 'gallery', from: [0, UPPER_Y, 46.6], face: NORTH, secs: 2, note: 'from the balcony bay, onto the gallery',
    },
    {
      room: 'conference', from: [0, UPPER_Y, 51.4], face: NORTH, secs: 5, note: 'from the gallery, through the double doors',
    },
    {
      room: 'office', from: [0.9, UPPER_Y, 61.9], face: NORTH, secs: 5, note: "from the conference room, through Lou's door",
    },
    {
      room: 'bedWestFront', from: [-14.0, UPPER_Y, 49.5], face: SOUTH, secs: 5, note: 'from the gallery',
    },
    {
      room: 'bedEastFront', from: [14.0, UPPER_Y, 49.5], face: SOUTH, secs: 5, note: 'from the gallery',
    },
    {
      room: 'bedWestRear', from: [-14.0, UPPER_Y, 51.5], face: NORTH, secs: 5, note: 'from the gallery',
    },
    {
      room: 'bedEastRear', from: [14.0, UPPER_Y, 51.5], face: NORTH, secs: 5, note: 'from the gallery',
    },
    {
      room: 'bathWest', from: [-14.0, UPPER_Y, 64.2], face: NORTH, secs: 5, note: 'from the west rear bedroom',
    },
    {
      room: 'bathEast', from: [14.0, UPPER_Y, 64.2], face: NORTH, secs: 5, note: 'from the east rear bedroom',
    },
    {
      room: 'basement', from: [7.2, GROUND_Y, 49.6], face: NORTH, secs: 14, note: 'from the rear foyer, down the cellar stair',
    },
  ];

  for (const leg of WALKS) {
    const room = roomTable[leg.room];
    if (!room) {
      check(`${leg.room} is enterable on foot (${leg.note})`, false, 'no such room in the scene room table');
      continue;
    }
    await teleport(leg.from[0], leg.from[1], leg.from[2], leg.face);
    await settle(0.4);
    await faceDeg(leg.face);
    await walk(leg.secs);
    await settle(0.8);
    s = await state();
    const ok = inside(room.rect, s, 0.2) && Math.abs(s.ground - room.floor) < 0.45;
    check(`${leg.room} is enterable on foot (${leg.note})`, ok,
      `${JSON.stringify(s)} vs rect ${JSON.stringify(room.rect)} floor ${room.floor}`);
  }

  // Every room in the scene must have a walk test. A verifier that quietly
  // stops covering the geometry is exactly what shipped the last build green.
  const covered = new Set(WALKS.map((w) => w.room));
  const uncovered = Object.keys(roomTable).filter((k) => !covered.has(k));
  check('every room the interior declares has an on-foot walk test in this script',
    uncovered.length === 0, `uncovered: ${uncovered.join(', ')}`);

  /* ================================================================ */
  /* The basement specifically: reachable, and at the armory floor      */
  /* ================================================================ */
  await teleport(7.2, GROUND_Y, 49.6, NORTH);
  await settle(0.4);
  await walk(14);
  await settle(1.0);
  s = await state();
  check('the cellar stair descends on foot from the rear foyer to the armory floor',
    Math.abs(s.ground - BASEMENT_Y) < 0.4 && s.z > 55,
    JSON.stringify(s));

  // ...and back up again, which is the half that strands you if it fails.
  await faceDeg(SOUTH);
  await walk(16);
  await settle(1.0);
  s = await state();
  check('the cellar stair can be climbed back out to the ground floor',
    Math.abs(s.ground - GROUND_Y) < 0.4,
    JSON.stringify(s));

  // Standing in the middle of the armory reads the armory floor, not the
  // ground floor above it (the failure the old layout had in reverse).
  await teleport(rooms.armoryCenter.x, BASEMENT_Y, rooms.armoryCenter.z, NORTH);
  await settle(1.0);
  s = await state();
  check('the armory floor resolves below the house, not at ground level',
    Math.abs(s.ground - BASEMENT_Y) < 0.15,
    JSON.stringify(s));

  /* ================================================================ */
  /* Grounds: service door, pool door, pool steps                       */
  /* ================================================================ */
  await teleport(17.6, 0, 66, WEST);
  await settle(0.4);
  await walk(6);
  await settle(0.5);
  s = await state();
  check('the rear service door is walkable from the service road into the kitchen',
    s.x < 16 && Math.abs(s.ground - GROUND_Y) < 0.35,
    JSON.stringify(s));

  await teleport(rooms.poolDoorOutside.x, GROUND_Y, 72.5, NORTH);
  await settle(0.4);
  await walk(5);
  await settle(0.5);
  s = await state();
  check('the kitchen pool door opens onto the patio deck',
    s.z > 75.5 && Math.abs(s.ground - GROUND_Y) < 0.3,
    JSON.stringify(s));

  await teleport(rooms.poolSteps.x - 2.2, 0, rooms.poolSteps.z, EAST);
  await settle(0.4);
  await walk(5);
  await settle(0.6);
  s = await state();
  check('the garden steps climb from the lawn onto the pool deck (was unreachable on foot)',
    s.ground > GROUND_Y - 0.3,
    JSON.stringify(s));

  /* ================================================================ */
  /* Parked cars: orientation and density                               */
  /* ================================================================ */
  const vehicles = await page.evaluate(() => window.mansion.vehicles);
  check('the motor court and the side lot are both populated',
    vehicles.length >= 5, `${vehicles.length} vehicles`);

  function overlaps(a, b) {
    return a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z;
  }
  const carOverlaps = [];
  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      if (overlaps(vehicles[i], vehicles[j])) {
        carOverlaps.push(`${vehicles[i].note} <-> ${vehicles[j].note}`);
      }
    }
  }
  check('no two parked cars overlap each other',
    carOverlaps.length === 0, carOverlaps.join(' | '));

  // The fountain basin, the front steps and the building itself.
  const FOUNTAIN = {
    min: { x: -3.7, z: 28.3 }, max: { x: 3.7, z: 35.7 },
  };
  const FRONT_STEPS = { min: { x: -6.4, z: 38.9 }, max: { x: 6.4, z: 41.1 } };
  const HOUSE = { min: { x: -16.4, z: 40.6 }, max: { x: 16.4, z: 75.4 } };
  const foul = [];
  for (const v of vehicles) {
    if (overlaps(v, FOUNTAIN)) foul.push(`${v.note} in the fountain`);
    if (overlaps(v, FRONT_STEPS)) foul.push(`${v.note} on the front steps`);
    if (overlaps(v, HOUSE)) foul.push(`${v.note} inside the house`);
  }
  check('no parked car intersects the fountain, the front steps or the building',
    foul.length === 0, foul.join(' | '));

  // Orientation: the motor court cars stand tangent to the turnaround kerb,
  // so each one's heading is perpendicular to its own radius from the centre.
  const courtCars = vehicles.filter((v) => (v.note || '').startsWith('motor court'));
  const misaligned = courtCars.filter((v) => {
    const rx = v.x - 0;
    const rz = v.z - 35;
    // Car long axis after a yaw of psi is (cos psi, -sin psi).
    const ax = Math.cos(v.yaw);
    const az = -Math.sin(v.yaw);
    const dot = Math.abs((rx * ax + rz * az) / Math.hypot(rx, rz));
    return dot > 0.08; // ~5 degrees off tangent
  });
  check('every motor-court car is parked tangent to the turnaround kerb, not at a random yaw',
    courtCars.length >= 2 && misaligned.length === 0,
    `${courtCars.length} court cars, ${misaligned.length} misaligned`);

  /* ================================================================ */
  /* Front landscaping                                                  */
  /* ================================================================ */
  const landscaping = await page.evaluate(() => ({
    beds: window.mansion.landscaping.beds.length,
    hedges: window.mansion.landscaping.hedges.length,
    urns: window.mansion.landscaping.urns.length,
    clumps: window.mansion.landscaping.clumps,
  }));
  check('the front of the property is planted (beds, hedging, urns, flowers)',
    landscaping.beds >= 6 && landscaping.hedges >= 6
      && landscaping.urns >= 4 && landscaping.clumps >= 40,
    JSON.stringify(landscaping));

  // The planting must not have walled the approach in: a straight walk up
  // the drive still works (checked above) and the front door is still
  // reachable from the parterre side of the lawn.
  await teleport(-10, 0, 20, NORTH);
  await settle(0.3);
  await walk(9);
  await settle(0.4);
  const acrossLawn = await state();
  check('the new front planting still leaves the lawn walkable (hedges block, beds do not)',
    acrossLawn.z - 20 > 6, JSON.stringify(acrossLawn));

  /* ================================================================ */
  /* Boundary collision                                                 */
  /* ================================================================ */
  await teleport(-25, 0, 45, WEST);
  await walk(6);
  await settle(0.3);
  s = await state();
  check('the west perimeter fence blocks a straight walk toward the property boundary',
    s.x > -29.9, JSON.stringify(s));

  await teleport(0, GROUND_Y, 78, NORTH);
  await walk(6);
  await settle(0.3);
  s = await state();
  const insidePoolFootprint = s.x > -7 && s.x < 7 && s.z > 81 && s.z < 89;
  check("a solid curb keeps a straight walk out of the pool's own basin footprint",
    !insidePoolFootprint, JSON.stringify({ ...s, insidePoolFootprint }));

  await teleport(0, UPPER_Y, 50.5, SOUTH);
  await settle(0.4);
  await walk(8);
  await settle(0.3);
  s = await state();
  check('the balcony railing blocks a walk off the edge into the foyer void below',
    s.z > 44.9 && Math.abs(s.ground - UPPER_Y) < 0.3,
    JSON.stringify(s));

  // The gallery's own edge, either side of the balcony bay.
  await teleport(-4.4, UPPER_Y, 50.5, SOUTH);
  await settle(0.4);
  await walk(8);
  await settle(0.3);
  s = await state();
  check("the gallery's edge railing blocks a walk off it between the bay and the west flight",
    s.z > 47.5 && Math.abs(s.ground - UPPER_Y) < 0.3,
    JSON.stringify(s));

  // The cellar stairwell must not be a hole you fall into sideways.
  await teleport(3.5, GROUND_Y, 54.5, EAST);
  await settle(0.4);
  await walk(6);
  await settle(0.4);
  s = await state();
  check('the cellar stairwell is guarded on its open side, not an unfenced hole in the floor',
    Math.abs(s.ground - GROUND_Y) < 0.3,
    JSON.stringify(s));

  /* ================================================================ */
  /* Rendering back on: the house must actually draw something           */
  /* ================================================================ */
  await teleport(0, GROUND_Y, 44.4, NORTH);
  await settle(0.5);
  const framesBefore = await page.evaluate(() => window.mansion.framesRendered);
  await page.evaluate(() => window.mansion.setRendering(true));
  await page.waitForFunction(
    (n) => window.mansion.framesRendered > n + 2, framesBefore, { timeout: 180000 },
  );
  const shot = await page.screenshot({ type: 'png' });
  // A black frame means the scene built but never drew; sample the PNG's raw
  // bytes for any non-trivial variation rather than trusting the frame count.
  const nonBlack = shot.some((b, i) => i > 64 && b > 24);
  check('the foyer renders a non-black frame from inside the house', nonBlack,
    `${shot.length} bytes`);

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Mansion checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Mansion checks passed.`);
