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
/* The 2026-08-04 pass pulled the front wall out 5 m (BUILDING.z0 41 -> 36) so
 * the horseshoe's bottom treads are not jammed against it, and moved the whole
 * forecourt the same 5 m to keep the approach's proportions. Every hard number
 * on the approach below is written against these two, not typed in twice. */
const FACADE_Z = 36;
const COURT_Z = 30;
const FOUNTAIN_Z = 27;

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
/* Every 404 the page takes, by path. The home theatre's film seam deliberately
 * points at a tape that has not been delivered (assets/video/the-feature.mp4),
 * and switching the projector on is what proves the seam is wired -- so the
 * fetch, and its 404, are the correct behaviour rather than a fault. They are
 * recorded here so the console check can say WHICH resource was missing
 * instead of either failing on it or waving all 404s through. */
const notFound = [];
page.on('response', (r) => {
  if (r.status() === 404) notFound.push(new URL(r.url()).pathname);
});
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
 * Steer to a point, on foot, re-aiming as it goes.
 *
 * Every other leg in this script is a fixed heading held for a fixed time,
 * which is right for a doorway and useless for a maze: a maze is a sequence of
 * turns, and a route that has to be walked cannot be expressed as one heading.
 * This closes the loop instead -- read the player's real position, aim at the
 * next waypoint, hold W for a moment, repeat -- so if a hedge is standing in
 * the corridor the walk simply never arrives and the check fails. It uses
 * nothing but real keys and the scene's own clock, exactly like `walk`.
 *
 * In core/player.js a forward press moves along (-sin yaw, -cos yaw), so the
 * heading toward (dx, dz) is atan2(-dx, -dz).
 */
async function walkTo(tx, tz, { steps = 26, tol = 0.75 } = {}) {
  let s = await state();
  for (let i = 0; i < steps; i++) {
    const dx = tx - s.x;
    const dz = tz - s.z;
    const d = Math.hypot(dx, dz);
    if (d < tol) return { ok: true, s, steps: i };
    await faceDeg((Math.atan2(-dx, -dz) * 180) / Math.PI);
    await walk(Math.min(0.55, Math.max(0.2, d / 3)));
    s = await state();
  }
  return { ok: Math.hypot(tx - s.x, tz - s.z) < tol, s, steps };
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
    'billiardBay',
    // grounds -- the rear garden
    'gardenCrossWalk', 'gardenStairsTop', 'mazeEntrance', 'mazeHeart', 'mazeExit',
    'roseGardenGate', 'gardenPavilion', 'firePit', 'outdoorKitchen',
    // interior -- ground
    'foyerCenter', 'foyerRear', 'horseshoeWestFoot', 'horseshoeEastFoot',
    'horseshoeWestTop', 'horseshoeEastTop', 'balconyRail', 'livingRoomCenter',
    'loungeCenter', 'ballroomCenter', 'diningTable', 'kitchenIsland',
    // interior -- the west wing
    'trophyHallCenter', 'greatIncluder', 'winterGardenCenter',
    // interior -- basement
    'basementStairTop', 'basementLanding', 'armoryCenter',
    // interior -- the lower level
    'cellarDoor', 'cellarHallCenter', 'cellarHallWestEnd', 'guestRoomCenter',
    'theatreCenter', 'lanRoomCenter', 'vaultCenter',
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

  // 2. Up the driveway. The whole forecourt moved 5 m south with the facade
  // (see FORECOURT_SHIFT), so the fountain now sits at z=27 with a 3.6 m
  // collision radius: a straight walk up the centreline is stopped short of
  // it and has to go round -- a real fountain in a real turnaround. This
  // asserts both the progress and the block.
  await teleport(0, 0, 6, NORTH);
  const beforeDrive = await state();
  await walk(10);
  const afterDrive = await state();
  check('walking up the driveway with real WASD makes real forward progress before the fountain blocks it',
    (afterDrive.z - beforeDrive.z) > 12 && afterDrive.z < 24 && Math.abs(afterDrive.x) < 0.6,
    JSON.stringify({ beforeDrive, afterDrive }));

  // 3. Round the fountain and up the front steps, on foot the whole way.
  // The basin blocks x:-3.7..3.7 / z:28.4..35.6, so this goes round it to the
  // east, up the far side of the forecourt, and back onto the steps -- which
  // is what a player does, and what proves the way in is not sealed.
  await teleport(0, 0, 19, NORTH);
  await settle(0.3);
  const atStreetGrade = await state();
  await faceDeg(EAST);
  await walk(2.4); // into the corridor east of the basin
  await faceDeg(NORTH);
  await walk(8); // up past the basin to the foot of the steps
  await faceDeg(WEST);
  await walk(2.4); // back to the centreline
  await faceDeg(NORTH);
  await walk(2.2); // up the steps onto the raised entry
  await settle(0.5);
  s = await state();
  /* Asserted as a CLIMB, not as a position. "past z=38.6 at ground height" is
   * also satisfied by standing in the middle of the foyer, so it would pass
   * without the steps ever being walked up. This requires the whole approach
   * to have started at street grade out on the turnaround and finished on the
   * raised entry -- with nothing but held keys in between, so the only thing
   * that can have lifted the player 1.2 m is the steps. */
  check('the front steps lift the player from street grade to the raised entry, on foot',
    atStreetGrade.ground < 0.05 && atStreetGrade.z < 20
      && Math.abs(s.ground - GROUND_Y) < 0.35 && s.z > FACADE_Z - 2.2,
    JSON.stringify({ atStreetGrade, after: s }));

  /* 4. Through the front door and up the hall. Nothing stands on this line:
   * the owner's "something in that main room when you walk in" is the centre
   * table, and it sits under the chandelier at z=44.4 rather than halfway
   * across the processional route -- which is where the first attempt put it,
   * and which this leg caught. */
  await faceDeg(NORTH);
  await walk(5);
  await settle(0.8);
  s = await state();
  check('walking through the front door reaches the foyer at ground level',
    s.z > FACADE_Z + 5 && Math.abs(s.ground - GROUND_Y) < 0.35,
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
      room: 'foyer', from: [0, GROUND_Y, FACADE_Z - 1.4], face: NORTH, secs: 5, note: 'from the portico, through the front door',
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
    /* The west wing, off the ground floor. */
    {
      room: 'trophyHall', from: [-14.5, GROUND_Y, 43.9], face: WEST, secs: 6, note: 'from the living room, through the arcade',
    },
    {
      room: 'winterGarden', from: [-14.5, GROUND_Y, 70.3], face: WEST, secs: 6, note: 'from the dining room, through the French doors',
    },
    /* The lower level. Every one of these starts in the corridor and goes in
     * through the room's own doorway, and the corridor itself is reached from
     * the armory through the one hole this pass cut in its north wall. */
    {
      room: 'cellarHall', from: [6.2, BASEMENT_Y, 62.0], face: NORTH, secs: 1.8, note: 'from the armory, through the north-wall doorway',
    },
    {
      room: 'guestRoom', from: [-12.1, BASEMENT_Y, 66.0], face: NORTH, secs: 4, note: 'from the cellar corridor',
    },
    {
      room: 'theatre', from: [-2.85, BASEMENT_Y, 66.0], face: NORTH, secs: 5, note: 'from the cellar corridor, up the centre aisle',
    },
    {
      room: 'lanRoom', from: [6.4, BASEMENT_Y, 66.0], face: NORTH, secs: 5, note: 'from the cellar corridor',
    },
    {
      room: 'vault', from: [13.35, BASEMENT_Y, 66.0], face: NORTH, secs: 5, note: 'from the cellar corridor, past the open door',
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

  /* ================================================================ */
  /* The layout itself, against the owner's brief                       */
  /*                                                                     */
  /* "the Conference room to be at the top of the stairs ... with the     */
  /*  balcony in the middle ... the conference room then behind it Lous   */
  /*  office up there at the top of the stairs in the middle. Then bed    */
  /*  rooms on the side."                                                 */
  /*                                                                      */
  /* Walking into a room called `conference` proves the room exists; it    */
  /* does not prove it is where it was asked to be. These read the rects   */
  /* the scene actually built and assert the relationships.               */
  /* ================================================================ */
  const layout = await page.evaluate(() => {
    const t = window.mansion.roomTable;
    const i = window.mansion.interior;
    return {
      gallery: t.gallery.rect,
      conference: t.conference.rect,
      office: t.office.rect,
      beds: [t.bedWestFront.rect, t.bedEastFront.rect, t.bedWestRear.rect, t.bedEastRear.rect],
      foyer: t.foyer.rect,
      stairWest: i.props.foyer.stairWest,
      stairEast: i.props.foyer.stairEast,
      balcony: i.props.foyer.balcony,
      upperY: t.gallery.floor,
      groundY: t.foyer.floor,
    };
  });

  const centred = (r) => Math.abs(r.x0 + r.x1) < 0.001;
  check('the conference room is at the top of the stairs, in the middle, straight off the gallery',
    centred(layout.conference)
      && layout.conference.z0 > layout.gallery.z1
      && layout.conference.z0 - layout.gallery.z1 < 0.5
      && layout.conference.floor !== 0,
    JSON.stringify({ gallery: layout.gallery, conference: layout.conference }));

  check("Lou's office is directly behind the conference room, in the same middle band",
    centred(layout.office)
      && layout.office.z0 > layout.conference.z1
      && layout.office.z0 - layout.conference.z1 < 0.5
      && Math.abs(layout.office.x0 - layout.conference.x0) < 0.001,
    JSON.stringify({ conference: layout.conference, office: layout.office }));

  check('all four bedrooms are in the side wings, clear of the middle band',
    layout.beds.length === 4
      && layout.beds.every((b) => b.x1 <= layout.conference.x0 || b.x0 >= layout.conference.x1),
    JSON.stringify(layout.beds));

  check('the horseshoe is two separate flights, up opposite flanks of the foyer, rising the same way',
    layout.stairWest.x1 < layout.stairEast.x0
      && layout.stairWest.z0 === layout.stairEast.z0
      && layout.stairWest.z1 === layout.stairEast.z1
      && layout.stairWest.z1 > layout.stairWest.z0,
    JSON.stringify({ west: layout.stairWest, east: layout.stairEast }));

  check('the balcony sits in the middle, between the two flights and out over the foyer',
    layout.balcony.x0 > layout.stairWest.x1
      && layout.balcony.x1 < layout.stairEast.x0
      && Math.abs(layout.balcony.x0 + layout.balcony.x1) < 0.001
      && layout.balcony.z0 < layout.stairWest.z1,
    JSON.stringify({ balcony: layout.balcony, west: layout.stairWest, east: layout.stairEast }));

  check('the foyer is one big open room, not a corridor',
    (layout.foyer.x1 - layout.foyer.x0) > 15 && (layout.foyer.z1 - layout.foyer.z0) > 15,
    `${(layout.foyer.x1 - layout.foyer.x0).toFixed(1)} x ${(layout.foyer.z1 - layout.foyer.z0).toFixed(1)} m`);

  /* ================================================================ */
  /* STAIR CLEARANCE                                                   */
  /*                                                                    */
  /* Owner playtest 2026-08-04: "both the front stairs go right into the */
  /* front wall so we either need to pull the front wall out a bit and   */
  /* widen the room so you can get on the stairs".                       */
  /*                                                                      */
  /* Two checks, because "there is room on the plan" and "you can get on   */
  /* the stairs" are different claims. The first measures the run of floor  */
  /* between the inside face of the front wall and the bottom tread; the    */
  /* second walks it, squaring up to a flight from the middle of the hall   */
  /* and holding W until it is standing on the upper floor.                 */
  /* ================================================================ */
  const stairRun = layout.stairWest.z0 - layout.foyer.z0;
  check('there is a proper run of floor between the front wall and the bottom tread',
    stairRun >= 4.5,
    `${stairRun.toFixed(2)} m of hall in front of the horseshoe (was 1.00 m)`);

  for (const [side, anchor] of [['west', 'horseshoeWestFoot'], ['east', 'horseshoeEastFoot']]) {
    // Stand square in front of the flight, back against the front wall.
    await teleport(rooms[anchor].x, GROUND_Y, layout.foyer.z0 + 1.0, NORTH);
    await settle(0.4);
    const atDoor = await state();
    await walk(11);
    await settle(1.0);
    s = await state();
    check(`the ${side} flight can be reached and climbed from just inside the front door`,
      atDoor.z < layout.stairWest.z0 - 4
        && s.z > layout.stairWest.z1 - 0.6 && Math.abs(s.ground - UPPER_Y) < 0.4,
      JSON.stringify({ atDoor, after: s }));
  }

  // Every room in the scene must have a walk test. A verifier that quietly
  // stops covering the geometry is exactly what shipped the last build green.
  const covered = new Set(WALKS.map((w) => w.room));
  const uncovered = Object.keys(roomTable).filter((k) => !covered.has(k));
  check('every room the interior declares has an on-foot walk test in this script',
    uncovered.length === 0, `uncovered: ${uncovered.join(', ')}`);

  /* ================================================================ */
  /* THE UPPER FLOOR, IN ONE CONTINUOUS WALK FROM THE HEAD OF THE      */
  /* STAIRS -- NO TELEPORTS AFTER THE BOTTOM TREAD                     */
  /*                                                                     */
  /* Owner playtest: "Theres like an invisible wall upstairs in the       */
  /* mansion preventing me from going into the side rooms." This gate was */
  /* green on that build, and this is why: every leg in WALKS above       */
  /* TELEPORTS to a spot already squared up in front of the room's own    */
  /* door and then holds W for the last metre and a half. That proves the */
  /* doorway is a doorway. It proves nothing whatever about being able to */
  /* REACH the doorway -- and the thing in the way was thirteen ground-   */
  /* floor wall colliders whose tops sat exactly on the upper floor's own */
  /* walking surface, cutting the gallery into three and the conference   */
  /* room in half. Every teleport in this script hopped straight over     */
  /* them.                                                                */
  /*                                                                       */
  /* So this walks the whole storey as a player does: up one flight, and   */
  /* then on held keys from room to room and back out again, with the      */
  /* rect asserted at every stop. A teleport anywhere in here would put    */
  /* the hole straight back.                                               */
  /* ================================================================ */
  await teleport(rooms.horseshoeWestFoot.x, GROUND_Y, layout.foyer.z0 + 1.0, NORTH);
  await settle(0.4);
  await walk(11);
  await settle(0.8);
  s = await state();
  const climbedOnFoot = Math.abs(s.ground - UPPER_Y) < 0.4;

  const TOUR = [
    { at: [-7.2, 50.5], note: 'onto the gallery off the west flight' },
    { at: [-14.0, 50.5], room: 'gallery', note: 'west along the gallery, past the foyer flank wall' },
    { at: [-14.0, 45.2], room: 'bedWestFront', note: 'into the west front bedroom' },
    { at: [-14.0, 50.5], note: 'back out onto the gallery' },
    { at: [-14.0, 57.0], room: 'bedWestRear', note: 'into the west rear bedroom' },
    { at: [-14.0, 69.0], room: 'bathWest', note: 'through it into the west ensuite' },
    { at: [-14.0, 57.0], note: 'back out of the ensuite' },
    { at: [-14.0, 50.5], note: 'back onto the gallery' },
    { at: [0.0, 50.8], note: 'east along the gallery to the conference doors' },
    { at: [0.0, 54.4], room: 'conference', note: 'through the double doors into the conference room' },
    { at: [-3.2, 56.0], note: 'round the head of the long table' },
    { at: [-3.2, 61.0], note: 'up the west side of it, across the z=58 line' },
    { at: [0.0, 62.4], note: "to Lou's door" },
    { at: [0.0, 67.0], room: 'office', note: "into Lou's office" },
    { at: [0.0, 62.4], note: 'back out of the office' },
    { at: [3.2, 61.0], note: 'back down the east side of the table' },
    { at: [3.2, 55.0], note: '...and out past its head' },
    { at: [0.0, 50.8], note: 'out onto the gallery again' },
    { at: [14.0, 50.5], room: 'gallery', note: 'east along the gallery, past the other flank wall' },
    { at: [14.0, 45.2], room: 'bedEastFront', note: 'into the east front bedroom' },
    { at: [14.0, 50.5], note: 'back out onto the gallery' },
    { at: [14.0, 57.0], room: 'bedEastRear', note: 'into the east rear bedroom' },
    { at: [14.0, 69.0], room: 'bathEast', note: 'through it into the east ensuite' },
  ];
  const tourFails = [];
  const tourRooms = new Set();
  for (const leg of TOUR) {
    const reached = await walkTo(leg.at[0], leg.at[1], { steps: 30, tol: 0.8 });
    if (!reached.ok) {
      tourFails.push(`${leg.note} — stuck at ${JSON.stringify(reached.s)}`);
      break;
    }
    if (leg.room) {
      const room = roomTable[leg.room];
      if (!inside(room.rect, reached.s, 0.2) || Math.abs(reached.s.ground - room.floor) > 0.4) {
        tourFails.push(`${leg.note} — arrived outside ${leg.room}: ${JSON.stringify(reached.s)}`);
        break;
      }
      tourRooms.add(leg.room);
    }
  }
  check('the whole upper floor is walkable from the head of the stairs, with no teleports',
    climbedOnFoot && tourFails.length === 0 && tourRooms.size === 9,
    tourFails.join(' | ') || `${tourRooms.size} upper rooms entered on one continuous walk`);

  /* ...and the invariant behind it, asserted directly on the built geometry.
   *
   * `p.y - eyeHeight > box.max.y` is a STRICT comparison, so a collider whose
   * top is exactly a floor's walking surface blocks everyone standing on that
   * floor. Nothing inside the house may end at one. Scoped to the building
   * footprint because that is where floors are -- a palm on the front lawn is
   * allowed to be six metres tall. */
  const floorTraps = await page.evaluate(([gy, uy]) => window.mansion.colliders
    .filter((c) => c.min.x > -17 && c.max.x < 17 && c.min.z > 35 && c.max.z < 76)
    .filter((c) => [gy, uy].some((d) => Math.abs(c.max.y - d) < 0.06))
    .map((c) => ({
      x: [+c.min.x.toFixed(2), +c.max.x.toFixed(2)],
      y: [+c.min.y.toFixed(2), +c.max.y.toFixed(2)],
      z: [+c.min.z.toFixed(2), +c.max.z.toFixed(2)],
    })), [GROUND_Y, UPPER_Y]);
  check('no collider in the house tops out exactly on a floor somebody stands on',
    floorTraps.length === 0,
    floorTraps.length ? `${floorTraps.length} floor-level collider tops: ${JSON.stringify(floorTraps.slice(0, 4))}` : '');

  /* The same treatment for the other two storeys. One walk each, no teleports
   * inside it, every room entered through its own door from the room next to
   * it -- because "each room is enterable from a spot squared up outside its
   * door" and "the floor is walkable" are different claims and only the second
   * one is what a player experiences. */
  async function tour(name, start, legs, expectRooms) {
    await teleport(start[0], start[1], start[2], start[3]);
    await settle(0.5);
    const fails = [];
    const seen = new Set();
    for (const leg of legs) {
      const got = await walkTo(leg.at[0], leg.at[1], { steps: 30, tol: 0.8 });
      if (!got.ok) { fails.push(`${leg.note} — stuck at ${JSON.stringify(got.s)}`); break; }
      if (leg.room) {
        const room = roomTable[leg.room];
        if (!inside(room.rect, got.s, 0.2) || Math.abs(got.s.ground - room.floor) > 0.4) {
          fails.push(`${leg.note} — arrived outside ${leg.room}: ${JSON.stringify(got.s)}`);
          break;
        }
        seen.add(leg.room);
      }
    }
    check(name, fails.length === 0 && seen.size === expectRooms,
      fails.join(' | ') || `${seen.size} rooms entered on one continuous walk`);
  }

  await tour(
    'the whole ground floor, including the west wing, is one continuous walk from the front door',
    [0, GROUND_Y, FACADE_Z + 2.0, NORTH],
    [
      { at: [-4.0, 43.0], room: 'foyer', note: 'up the hall, past the centre table under the chandelier' },
      { at: [0, 50.6], note: 'round the horseshoe into the rear hall' },
      { at: [-12.5, 50.5], room: 'livingRoom', note: 'west through the archway into the living room' },
      { at: [-14.0, 47.8], note: 'down the channel between the couches and the coffee table' },
      { at: [-14.6, 44.4], note: 'round the end of the south couch to the wing arcade' },
      { at: [-20.0, 43.9], room: 'trophyHall', note: 'through the middle arch into the Great Includer hall' },
      { at: [-16.9, 50.0], note: 'up the east side of the hall, past the dais' },
      { at: [-16.9, 58.0], room: 'winterGarden', note: 'through the wing door into the winter garden' },
      { at: [-16.7, 70.4], note: 'up the winter garden to the dining doors' },
      { at: [-13.6, 70.8], room: 'dining', note: 'through the French doors into the dining room' },
      { at: [-10.4, 71.2], note: 'round the head of the long table' },
      { at: [-10.1, 62.0], note: 'down the east side of it, past ten chairs' },
      { at: [-12.5, 59.0], note: 'to the living room door' },
      { at: [-12.5, 56.0], note: 'through into the living room' },
      { at: [-11.0, 50.6], note: 'back into the rear hall' },
      { at: [0, 55.0], note: 'to the ballroom doors' },
      { at: [0, 62.0], room: 'ballroom', note: 'into the ballroom' },
      { at: [7.6, 65.8], note: 'east across the ballroom to the kitchen door' },
      { at: [10.0, 68.5], room: 'kitchen', note: 'through into the kitchen, round the island' },
      { at: [9.9, 63.0], note: 'down the west side of the island' },
      { at: [12.5, 60.0], note: 'across to the lounge door' },
      { at: [12.5, 55.0], room: 'lounge', note: 'through into the lounge' },
      { at: [14.8, 53.0], note: 'down the east side of the billiard table' },
      { at: [14.8, 47.5], note: 'to the middle bay arch' },
      { at: [18.4, 47.5], note: 'out through the arch into the billiard bay' },
    ],
    8,
  );

  await tour(
    'the whole lower level is one continuous walk from the foot of the cellar stair',
    [7.2, BASEMENT_Y, 57.6, NORTH],
    [
      { at: [6.2, 61.8], room: 'basement', note: 'north across the armory, between the bench and the boiler' },
      { at: [6.2, 65.9], room: 'cellarHall', note: 'through the north-wall doorway into the corridor' },
      { at: [-12.1, 65.9], note: 'west down the corridor' },
      { at: [-12.1, 70.0], room: 'guestRoom', note: 'into the guest bedroom' },
      { at: [-12.1, 65.9], note: 'back into the corridor' },
      { at: [-2.85, 65.9], note: 'east to the theatre doors' },
      { at: [-2.85, 72.6], room: 'theatre', note: 'down the theatre aisle to the screen' },
      { at: [-2.85, 65.9], note: 'back into the corridor' },
      { at: [6.4, 65.9], note: 'east to the LAN room' },
      { at: [6.4, 71.4], room: 'lanRoom', note: 'into the LAN room' },
      { at: [6.4, 65.9], note: 'back into the corridor' },
      { at: [13.35, 65.9], note: 'east past the open vault door' },
      { at: [13.35, 71.0], room: 'vault', note: 'into the vault' },
      { at: [13.35, 65.9], note: 'back out of the vault' },
      { at: [-14.4, 65.9], note: "to the corridor's blank west end" },
    ],
    6,
  );

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
  /* THE GAP BEHIND THE CELLAR STAIR                                   */
  /*                                                                    */
  /* Owner playtest 2026-08-04: "There is a gap behind the stairs so you */
  /* can get behind the stairs." The armory floor runs a metre south of  */
  /* the shaft, and with no spandrel under the flight that strip walked   */
  /* you straight in underneath it, into a void with the treads overhead. */
  /*                                                                       */
  /* Walked, not measured: stand in that strip at basement level and hold   */
  /* W straight at the flight. The head wall has to stop you south of the   */
  /* shaft, at the armory's own floor height -- ending up under the stair    */
  /* (z past the shaft mouth) or lifted onto a tread is a fail.             */
  /* ================================================================ */
  for (const [label, x] of [['the middle of the alcove', 7.2], ['its east side', 8.4]]) {
    await teleport(x, BASEMENT_Y, 50.4, NORTH);
    await settle(0.4);
    await walk(6);
    await settle(0.5);
    s = await state();
    check(`there is no way in behind the cellar stair from ${label}`,
      s.z < 51.05 && Math.abs(s.ground - BASEMENT_Y) < 0.2,
      JSON.stringify(s));
  }

  /* ================================================================ */
  /* Grounds: service door, pool door, pool steps                       */
  /* ================================================================ */
  await teleport(21.4, 0, 66, WEST);
  await settle(0.4);
  await walk(8);
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
  /* THE POOL: FIT, AND THE DECK'S SKIRT                                */
  /*                                                                     */
  /* Owner playtest 2026-08-04: "Pool needs to be fitted to the area its  */
  /* in (small gap)" and "the pool deck is also raised which is nice but   */
  /* there needs to be a side wall around it so that you cant see under    */
  /* it".                                                                  */
  /*                                                                        */
  /* The first is geometry, so it is measured: the water plane's own world   */
  /* bounding box against the basin rect it is supposed to fill. It used to  */
  /* be 13x7 in a 14x8 hole -- half a metre of bare liner all the way round. */
  /* The second is walked: the fascia has to stop someone at lawn level      */
  /* from getting in under the deck, and must NOT stop someone standing on   */
  /* the deck, which is the failure mode a full-height skirt would have.     */
  /* ================================================================ */
  const poolFit = await page.evaluate(() => {
    const water = window.mansion.grounds.props.poolPatio.water;
    water.updateMatrixWorld(true);
    const b = new window.mansion.THREE.Box3().setFromObject(water);
    const p = window.mansion.poolRect;
    return {
      gapX0: Math.abs(b.min.x - p.x0),
      gapX1: Math.abs(b.max.x - p.x1),
      gapZ0: Math.abs(b.min.z - p.z0),
      gapZ1: Math.abs(b.max.z - p.z1),
    };
  });
  const worstGap = Math.max(poolFit.gapX0, poolFit.gapX1, poolFit.gapZ0, poolFit.gapZ1);
  check('the pool water fills its own basin -- no strip of bare liner round the water line',
    worstGap <= 0.08, `worst edge gap ${worstGap.toFixed(3)} m (was 0.500)`);

  const skirt = await page.evaluate(() => window.mansion.poolSkirt);
  check('the raised pool deck is skirted on every open edge',
    Array.isArray(skirt) && skirt.length >= 4
      && skirt.every((seg) => seg.y0 <= 0.01 && seg.y1 >= GROUND_Y - 0.01),
    JSON.stringify(skirt?.length ?? null));

  // At lawn level, walking straight at the deck's north edge must be stopped
  // by the fascia rather than walking in under the slab.
  await teleport(0, 0, 99, SOUTH);
  await settle(0.4);
  await walk(6);
  await settle(0.4);
  s = await state();
  check("the deck's side wall stops you walking in underneath it from the lawn",
    s.z > 94.9 && s.ground < 0.05, JSON.stringify(s));

  /* ...and standing ON the deck, the same fascia must NOT be an invisible
   * wall. Asserted as "gets past the fascia line", not as "is still at deck
   * height": the skirt's outer face IS the deck's edge, so anyone who walks
   * through it walks off a 1.2 m drop onto the lawn, which is the correct
   * behaviour and would make a height assertion contradict itself. Being
   * stopped at z=94.6 is the failure this is looking for. */
  await teleport(0, GROUND_Y, 92.5, NORTH);
  await settle(0.4);
  await walk(2.5);
  await settle(0.4);
  s = await state();
  check('the skirt is not an invisible wall for anyone walking on the deck',
    s.z > 95.0, JSON.stringify(s));

  /* ================================================================ */
  /* THE BILLIARD BAY                                                   */
  /*                                                                     */
  /* Owner playtest 2026-08-04: "lets expand it a bit out to the exterior */
  /* so there is enough room for the bar stools and the bar". Walked from  */
  /* the middle of the lounge, straight out through the middle archway.    */
  /* ================================================================ */
  const bay = await page.evaluate(() => window.mansion.loungeBay);
  await teleport(13.0, GROUND_Y, 47.5, EAST);
  await settle(0.4);
  await walk(6);
  await settle(0.6);
  s = await state();
  check('the billiard bay is walked into from the lounge, at the lounge floor',
    s.x > bay.x0 + 0.4 && s.x < bay.x1 && Math.abs(s.ground - GROUND_Y) < 0.3,
    `${JSON.stringify(s)} vs bay ${JSON.stringify(bay)}`);

  // ...and back in, so the arch is a way through rather than a way out.
  await faceDeg(WEST);
  await walk(6);
  await settle(0.5);
  s = await state();
  check('the bay archway is a way back into the lounge as well as out of it',
    s.x < bay.x0 - 0.4 && Math.abs(s.ground - GROUND_Y) < 0.3, JSON.stringify(s));

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
    min: { x: -3.7, z: FOUNTAIN_Z - 3.7 }, max: { x: 3.7, z: FOUNTAIN_Z + 3.7 },
  };
  const FRONT_STEPS = { min: { x: -6.4, z: FACADE_Z - 2.1 }, max: { x: 6.4, z: FACADE_Z + 0.1 } };
  const HOUSE = { min: { x: -16.4, z: FACADE_Z - 0.4 }, max: { x: 16.4, z: 75.4 } };
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
    const rz = v.z - COURT_Z;
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
  await teleport(-10, 0, 18, NORTH);
  await settle(0.3);
  await walk(9);
  await settle(0.4);
  const acrossLawn = await state();
  check('the new front planting still leaves the lawn walkable (hedges block, beds do not)',
    acrossLawn.z - 18 > 6, JSON.stringify(acrossLawn));

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
  /* ART vs OPENINGS -- the systematic sweep                             */
  /*                                                                      */
  /* Owner playtest 2026-08-04: "A lot of the art is over doorways and     */
  /* stuff ... but I like the big art layouts". This has come back more     */
  /* than once, so it is checked as a CLASS rather than picture by picture: */
  /* every hung piece registers its own world box (MansionInterior's        */
  /* `wallArt`/`flatArt`), the scene hands out every opening it declares    */
  /* (interior doorways, exterior doors, and the glazing), and this         */
  /* intersects the two lists. A new picture hung across a door or a        */
  /* window fails here, with the pair named, whether or not anybody         */
  /* thought to look.                                                       */
  /*                                                                         */
  /* Two deliberate tolerances, both about the SAME plane rather than the    */
  /* opening: a piece is only judged against an opening it actually          */
  /* overlaps in every axis, and a 2 cm skin is allowed so a frame's         */
  /* backing board resting on the reveal of an adjacent wall is not a        */
  /* finding.                                                                */
  /* ================================================================ */
  const artSweep = await page.evaluate(() => ({
    art: window.mansion.art,
    openings: window.mansion.openings,
  }));
  check('every picture in the house registered itself with the art sweep',
    Array.isArray(artSweep.art) && artSweep.art.length >= 24,
    `${artSweep.art?.length ?? 0} pieces, ${artSweep.openings?.length ?? 0} openings`);

  /* THE OPENING IS GROWN OUT OF ITS OWN WALL BEFORE INTERSECTING.
   *
   * The first version of this sweep compared each piece against the reveal
   * only -- the 30 cm of wall thickness the doorway is cut through -- and a
   * banner hung eleven centimetres in front of a doorway therefore passed,
   * while hanging squarely across the top of it. That is exactly the fault
   * the owner reported, so it is the fault the check has to catch: an opening
   * is extended REVEAL metres out of the wall on both faces, because that is
   * the volume a doorway needs kept clear on either side of it.
   *
   * Grown along the opening's own THIN axis only. Growing all three would
   * start failing pictures hung a sensible distance to the side of a door,
   * which is where pictures go. */
  const SKIN = 0.02;
  const REVEAL = 0.34;
  const grown = artSweep.openings.map((o) => {
    const dx = o.x1 - o.x0;
    const dy = o.y1 - o.y0;
    const dz = o.z1 - o.z0;
    const g = { ...o };
    if (dz <= dx && dz <= dy) { g.z0 = o.z0 - REVEAL; g.z1 = o.z1 + REVEAL; } else if (dx <= dy) { g.x0 = o.x0 - REVEAL; g.x1 = o.x1 + REVEAL; } else { g.y0 = o.y0 - REVEAL; g.y1 = o.y1 + REVEAL; }
    return g;
  });
  const clashes = [];
  for (const piece of artSweep.art) {
    for (const o of grown) {
      const overlapX = Math.min(piece.x1, o.x1) - Math.max(piece.x0, o.x0);
      const overlapY = Math.min(piece.y1, o.y1) - Math.max(piece.y0, o.y0);
      const overlapZ = Math.min(piece.z1, o.z1) - Math.max(piece.z0, o.z0);
      if (overlapX > SKIN && overlapY > SKIN && overlapZ > SKIN) {
        clashes.push(`${piece.id} over ${o.id}`);
      }
    }
  }
  check('no picture, banner or mirror is hung across a doorway or a window',
    clashes.length === 0, clashes.join(' | '));

  /* ================================================================ */
  /* Working sets, and the working sink                                 */
  /* ================================================================ */
  const media = await page.evaluate(() => ({
    tvs: window.mansion.media.tvs.length,
    radioSets: window.mansion.media.radioSets,
    radioOn: window.mansion.media.radioOn,
    slots: window.mansion.artSlots.length,
  }));
  check('the house has working televisions and two radio sets, and the radio starts off',
    media.tvs >= 2 && media.radioSets >= 2 && media.radioOn === false,
    JSON.stringify(media));

  const tvRun = await page.evaluate(async () => {
    const tv = window.mansion.media.tvs[0];
    const first = tv.channel;
    tv.next();
    const second = tv.channel;
    return { on: tv.on, first, second };
  });
  check('a television is genuinely running a channel list, not a still picture',
    tvRun.on === true && tvRun.first !== tvRun.second,
    JSON.stringify(tvRun));

  const radioRun = await page.evaluate(() => {
    window.mansion.media.useRadio(1);
    const afterOn = window.mansion.media.radioOn;
    window.mansion.media.useRadio(1);
    return { afterOn, afterOff: window.mansion.media.radioOn };
  });
  check('either radio set switches the house receiver on and off',
    radioRun.afterOn === true && radioRun.afterOff === false,
    JSON.stringify(radioRun));

  const sinkRun = await page.evaluate(() => {
    window.mansion.sink.set(true);
    const on = window.mansion.sink.running;
    window.mansion.sink.set(false);
    return { on, off: window.mansion.sink.running };
  });
  check('the kitchen sink actually runs', sinkRun.on === true && sinkRun.off === false,
    JSON.stringify(sinkRun));

  check('the Squatch logo art slots are declared for the apartment gear pipeline',
    media.slots >= 16, `${media.slots} slots`);

  /* ================================================================ */
  /* THE WEST WING, AND THE GREAT INCLUDER                             */
  /*                                                                    */
  /* The walk-in test above proves the hall can be entered. These prove  */
  /* the arcade is a way back as well as a way in (a room with one       */
  /* direction of travel is a trap), and that the thing the hall was     */
  /* built for is actually massive and actually says what it says.       */
  /* ================================================================ */
  await teleport(-20.1, GROUND_Y, 43.9, EAST);
  await settle(0.4);
  await walk(6);
  await settle(0.5);
  s = await state();
  check('the trophy hall arcade is a way back into the living room as well as out of it',
    s.x > -15.5 && Math.abs(s.ground - GROUND_Y) < 0.3, JSON.stringify(s));

  // ...and the trophy hall connects to the winter garden without going back
  // through the house, so the wing is a range rather than two dead ends.
  await teleport(-16.8, GROUND_Y, 54.4, NORTH);
  await settle(0.4);
  await walk(6);
  await settle(0.5);
  s = await state();
  check('the west wing runs through from the trophy hall into the winter garden',
    s.z > 57.5 && Math.abs(s.ground - GROUND_Y) < 0.3, JSON.stringify(s));

  const includer = await page.evaluate(() => ({
    engraving: window.mansion.greatIncluder.engraving,
    height: window.mansion.greatIncluder.height,
    top: window.mansion.greatIncluder.top,
    dais: window.mansion.greatIncluder.dais,
    ceiling: window.mansion.grounds.shell.wingRoofY0,
  }));
  check('THE GREAT INCLUDER is engraved with exactly that, and nothing else',
    includer.engraving === 'THE GREAT INCLUDER', JSON.stringify(includer.engraving));
  check('the trophy is massive -- over three metres of cup, and it clears its own ceiling',
    includer.height > 3.0 && includer.top < includer.ceiling && includer.top > 5.0,
    `${includer.height} m tall, top at ${includer.top}, ceiling ${includer.ceiling}`);

  // The engraving has to be READABLE, which means at eye height on the face
  // you approach from -- not on top of a plinth you cannot see over.
  const plate = await page.evaluate(() => window.mansion.art.find((a) => a.id === 'mansion.trophy.engraving'));
  check("the engraving is on the plinth's front face at eye height, facing the way in",
    plate && plate.y0 > GROUND_Y + 0.9 && plate.y1 < GROUND_Y + 2.0 && (plate.x1 - plate.x0) > 2.0,
    JSON.stringify(plate));

  // You must be able to walk up to it and read it; the velvet rope stops you
  // at the dais, not three metres short of the room.
  await teleport(includer.dais.x, GROUND_Y, includer.dais.z - 6.0, NORTH);
  await settle(0.4);
  await walk(5);
  await settle(0.5);
  s = await state();
  check('you can walk the length of the hall up to the foot of the trophy',
    s.z > includer.dais.z - 4.4 && Math.abs(s.ground - GROUND_Y) < 0.35, JSON.stringify(s));

  /* ================================================================ */
  /* THE LOWER LEVEL                                                   */
  /* ================================================================ */
  // The spine corridor, walked end to end, because four rooms off a
  // corridor is only four rooms if the corridor goes anywhere.
  await teleport(-14.4, BASEMENT_Y, 65.85, EAST);
  await settle(0.4);
  const cellarWestEnd = await state();
  await walk(14);
  await settle(0.6);
  s = await state();
  check('the cellar corridor is walkable from its west end to the vault door',
    s.x - cellarWestEnd.x > 20 && Math.abs(s.ground - BASEMENT_Y) < 0.25,
    JSON.stringify({ from: cellarWestEnd, to: s }));

  // ...and back out into the armory, which is the half that strands you.
  /* Three seconds, not six: six walks you straight across the armory and onto
   * the cellar stair, which reads as "the ground floor" and fails a check that
   * is about a doorway. */
  await teleport(6.2, BASEMENT_Y, 66.0, SOUTH);
  await settle(0.4);
  await walk(3);
  await settle(0.5);
  s = await state();
  check('the lower level lets you back out into the armory through the same doorway',
    s.z < 63.0 && Math.abs(s.ground - BASEMENT_Y) < 0.25, JSON.stringify(s));

  /* The corridor's west end wall is being kept blank on purpose -- a later
   * pass puts a secret door there. Asserted, so a future dressing pass cannot
   * quietly hang something on it and take the seam away. */
  const westEndArt = await page.evaluate(() => window.mansion.art.filter(
    (a) => a.x0 < -15.0 && a.z1 > 64.0 && a.z0 < 67.6 && a.y1 < 0,
  ).map((a) => a.id));
  check("the cellar corridor's west end wall is left blank for the secret door",
    westEndArt.length === 0, westEndArt.join(', '));

  // The theatre's rear riser: you come in at the top of the rake and step
  // DOWN toward the screen, which is the way round a cinema is built.
  const rake = await page.evaluate(async () => {
    const back = window.mansion.player;
    window.mansion.teleport(-2.85, -2.5, 69.0, 180);
    window.mansion.tick(0.4);
    const atBack = Number(back.ground.toFixed(3));
    window.mansion.teleport(-2.85, -2.8, 73.0, 180);
    window.mansion.tick(0.4);
    return { atBack, atFront: Number(back.ground.toFixed(3)) };
  });
  check('the theatre is raked -- the back row stands above the front row',
    rake.atBack > rake.atFront + 0.2 && Math.abs(rake.atFront - BASEMENT_Y) < 0.1,
    JSON.stringify(rake));

  // ...and the step down is walkable rather than a ledge you get stuck on.
  await teleport(-2.85, -2.5, 68.6, NORTH);
  await settle(0.4);
  await walk(4);
  await settle(0.5);
  s = await state();
  check('the riser can be walked down off, toward the screen',
    s.z > 71.0 && Math.abs(s.ground - BASEMENT_Y) < 0.12, JSON.stringify(s));

  const lan = await page.evaluate(() => window.mansion.lan);
  check('the LAN room has real apartment PCs, one per seat, and a logo on every chair',
    lan.stations >= 5 && lan.chairLogos === lan.stations,
    JSON.stringify(lan));

  const theatre = await page.evaluate(() => window.mansion.theatre);
  check('the home theatre has a working projector with a film seam wired into it',
    theatre && theatre.on === false && theatre.channels[0] === 'THE FEATURE'
      && theatre.channels.length > 1,
    JSON.stringify(theatre));
  const theatreRun = await page.evaluate(() => {
    const t = window.mansion.theatre;
    t.toggle();
    const on = t.on;
    const showing = t.channel;
    t.toggle();
    return { on, showing, off: t.on };
  });
  check('the projector switches on, runs the feature channel, and switches off again',
    theatreRun.on === true && theatreRun.off === false && theatreRun.showing === 'THE FEATURE',
    JSON.stringify(theatreRun));

  /* ================================================================ */
  /* THE REAR GARDEN                                                   */
  /* ================================================================ */
  const garden = await page.evaluate(() => window.mansion.garden);

  // Down onto the garden from the terrace, on foot.
  await teleport(7.0, GROUND_Y, 93.4, NORTH);
  await settle(0.4);
  const onTerrace = await state();
  await walk(8);
  await settle(0.6);
  s = await state();
  check('the terrace steps descend on foot from the pool deck into the formal garden',
    Math.abs(onTerrace.ground - GROUND_Y) < 0.2 && s.ground < 0.1 && s.z > 99,
    JSON.stringify({ onTerrace, inGarden: s }));

  // The brick estate wall is a real boundary on all three of its runs.
  await teleport(27.5, 0, 116, NORTH);
  await settle(0.3);
  await walk(8);
  await settle(0.3);
  s = await state();
  check('the brick estate wall closes the garden at its north end',
    s.z < garden.wall.z1 && s.z > 122, JSON.stringify(s));
  await teleport(27.0, 0, 110, EAST);
  await settle(0.3);
  await walk(6);
  await settle(0.3);
  s = await state();
  check('the brick estate wall closes the garden on its east side',
    s.x < garden.wall.x1 - 0.2 && s.x > 27.0, JSON.stringify(s));

  /* ---- THE HEDGE MAZE -------------------------------------------------
   * Two separate claims, checked separately: the maze cannot pinch, and the
   * maze can be walked. The first is measured off the built hedge geometry
   * (every run's centre line, sorted, so the gaps between them are the
   * corridors); the second is walked, waypoint by waypoint, with real keys.
   */
  check('every corridor in the maze is far wider than the player is',
    garden.maze.corridor.x > 2.0 && garden.maze.corridor.z > 2.0,
    `${garden.maze.corridor.x.toFixed(2)} x ${garden.maze.corridor.z.toFixed(2)} m clear`);

  const T = garden.maze.rect.hedge;
  function lineGaps(walls, axis) {
    const thin = walls.filter((w) => (axis === 'x'
      ? (w.x1 - w.x0) < T * 1.5 : (w.z1 - w.z0) < T * 1.5));
    const lines = [...new Set(thin.map((w) => Number((axis === 'x'
      ? (w.x0 + w.x1) / 2 : (w.z0 + w.z1) / 2).toFixed(3))))].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < lines.length; i++) gaps.push(lines[i] - lines[i - 1] - T);
    return gaps;
  }
  const gapsX = lineGaps(garden.maze.walls, 'x');
  const gapsZ = lineGaps(garden.maze.walls, 'z');
  const worstMazeGap = Math.min(...gapsX, ...gapsZ);
  check('no two hedges anywhere in the maze leave a channel under 0.6 m',
    worstMazeGap >= 2.0,
    `narrowest measured channel ${worstMazeGap.toFixed(2)} m across ${gapsX.length + gapsZ.length} bays`);

  check('the maze is a real maze -- carved walls, an entrance, an exit and a route',
    garden.maze.walls.length >= 12 && garden.maze.route.length >= 6
      && garden.maze.entry.z < garden.maze.rect.z0
      && garden.maze.exit.z > garden.maze.rect.z1,
    `${garden.maze.walls.length} hedge runs, ${garden.maze.route.length} waypoints`);

  // Walked. Not solved on paper -- walked, from the plaque at the mouth to
  // the far side, on held keys, through whatever the hedges actually are.
  await teleport(garden.maze.entry.x, 0, garden.maze.entry.z - 1.2, NORTH);
  await settle(0.4);
  const mazeLegs = [];
  let mazeOk = true;
  /* The heart of the maze is ON the route (it is the middle cell of the solved
   * path), so whether it can be stood in is answered by this same walk rather
   * than by a second trip -- and it has to be answered here, because once you
   * are out the far side there is a hedge maze between you and it. */
  let heartStood = null;
  for (const wp of garden.maze.route) {
    const leg = await walkTo(wp.x, wp.z);
    mazeLegs.push(leg.ok ? 1 : 0);
    if (Math.abs(wp.x - garden.maze.heart.x) < 0.01
      && Math.abs(wp.z - garden.maze.heart.z) < 0.01) heartStood = leg;
    if (!leg.ok) { mazeOk = false; break; }
  }
  s = await state();
  check('the hedge maze can be walked on foot from its entrance to its exit',
    mazeOk && s.z > garden.maze.rect.z1,
    `${mazeLegs.filter(Boolean).length}/${garden.maze.route.length} waypoints reached, ended ${JSON.stringify(s)}`);

  check('the middle of the maze is reachable and standable, lantern and bench included',
    heartStood !== null && heartStood.ok,
    heartStood ? JSON.stringify(heartStood.s) : 'the heart is not on the solved route');

  // The walled rose garden's moon gate is a way in AND a way out.
  await teleport(garden.roseGarden.gate.x - 2.0, 0, garden.roseGarden.gate.z, EAST);
  await settle(0.4);
  await walk(5);
  await settle(0.5);
  s = await state();
  check('the rose garden is entered on foot through the moon gate in its brick wall',
    s.x > garden.roseGarden.x0 + 0.8, JSON.stringify(s));
  await faceDeg(WEST);
  await walk(5);
  await settle(0.5);
  s = await state();
  check('...and the moon gate lets you back out again',
    s.x < garden.roseGarden.x0 - 0.6, JSON.stringify(s));

  /* The pavilion at the head of the axis, up the walk BESIDE the canal --
   * the canal is on the centre line and is a hole full of water with a kerb
   * round it, so the centre line is precisely where you do not walk. */
  await teleport(2.8, 0, 100.5, NORTH);
  await settle(0.4);
  await walk(12);
  await settle(0.6);
  s = await state();
  check('the garden axis walks from the cross walk past the canal to the pavilion',
    s.z > 114 && Math.abs(s.x - 2.8) < 2.0, JSON.stringify(s));

  check('the garden is lit -- lamp standards, the pavilion, the fire pit and the canal',
    garden.lanterns >= 20, `${garden.lanterns} practical lights in the garden`);

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

  /* The film that has not landed yet is allowed to 404 and nothing else is.
   * A blanket "ignore 404s" would let a missing texture or a missing module
   * through; naming the file keeps the seam honest in both directions. */
  const strayNotFound = notFound.filter((p) => !p.endsWith('/the-feature.mp4'));
  check('the only resource the house cannot find is the film nobody has delivered yet',
    strayNotFound.length === 0,
    `missing: ${[...new Set(notFound)].join(', ') || 'nothing'}`);
  const strayErrors = problems.filter(
    (p) => !(/Failed to load resource/.test(p) && strayNotFound.length === 0),
  );
  check('no runtime console errors occurred', strayErrors.length === 0, strayErrors.join(' | '));
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
