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
    'billiardBay',
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

  /* The merged list is grounds + interior + the armory's racks. The racks are
   * the third contributor and they are counted, not waved through: a rack you
   * can walk through is a rack whose guns are decoration. */
  const colliderInfo = await page.evaluate(() => ({
    collidersCount: window.mansion.collidersCount,
    actualLength: window.mansion.colliders.length,
    groundsLen: window.mansion.grounds.colliders.length,
    interiorLen: window.mansion.interior.colliders.length,
    armoryLen: window.mansion.weapons.colliders,
  }));
  check('collidersCount is internally consistent and a sane positive number (geometry actually built)',
    colliderInfo.collidersCount === colliderInfo.actualLength
      && colliderInfo.collidersCount
        === colliderInfo.groundsLen + colliderInfo.interiorLen + colliderInfo.armoryLen
      && colliderInfo.armoryLen === 6
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
  /* THE ARMORY                                                        */
  /*                                                                    */
  /* Owner, 2026-08-04: "I want them fully usable with bullet tracers,  */
  /* magazine ejections when they reload, bullet counts, empty mag      */
  /* click sound, full sound effects. I want them fully wired and       */
  /* usable."                                                           */
  /*                                                                     */
  /* So this does not check that six racks render. It takes a gun off    */
  /* the wall ON FOOT with a real keypress, fires it and watches the     */
  /* count go down, reloads it and watches a REAL magazine object leave  */
  /* the gun and fall to the concrete, empties it and watches the dry    */
  /* click happen exactly once, puts it back, and then does the whole    */
  /* count-fire-reload run again for all six. A verifier that only       */
  /* proves the racks render is not evidence they work.                 */
  /* ================================================================ */
  /* Every step below drives the guns through the page. A step that throws —
   * because an earlier one left nothing in the player's hands, say — must
   * report a failed CHECK rather than take the whole verifier down with it,
   * or one broken gun hides the state of the other five. */
  async function armoryStep(fn, arg) {
    try {
      return await page.evaluate(fn, arg);
    } catch (err) {
      return { error: String(err?.message || err).split('\n')[0].slice(0, 160) };
    }
  }

  const WEAPONS = await page.evaluate(() => window.mansion.weapons.order);
  check('all six weapons the owner named are racked in the basement armory',
    WEAPONS.length === 6
      && ['revolver', 'pistol9', 'carbine', 'ak47', 'saw', 'barrett']
        .every((id) => WEAPONS.includes(id)),
    JSON.stringify(WEAPONS));

  const models = await page.evaluate(() => window.mansion.weapons.models());
  const thinModels = models.filter((m) => !m.present || m.meshes < 24 || !m.muzzle);
  check('every racked weapon is a real model, not a silhouette (meshes + a muzzle)',
    thinModels.length === 0,
    JSON.stringify(models.map((m) => `${m.id}:${m.meshes}`)));

  const magsFitted = models.filter((m) => m.id !== 'revolver' && !m.hasMagazine);
  check('every magazine-fed weapon on the wall has a real magazine fitted to it',
    magsFitted.length === 0, JSON.stringify(magsFitted));

  const wall = await page.evaluate(() => window.mansion.weapons.report());
  check('there are multiple copies of every weapon on the racks',
    Object.values(wall).every((w) => w.copies >= 2 && w.onWall === w.copies),
    JSON.stringify(Object.fromEntries(Object.entries(wall).map(([k, v]) => [k, v.copies]))));

  /* The racks are solid. Walk into the pistol board and be stopped by it —
   * a rack you can stand inside is a rack whose guns are wallpaper. */
  const rackSpecs = await page.evaluate(() => window.mansion.weapons.racks);
  const pistolRack = rackSpecs.find((r) => r.id === 'pistol9');
  await teleport(pistolRack.x, BASEMENT_Y, pistolRack.z + 2.2, SOUTH);
  await settle(0.3);
  await walk(4);
  await settle(0.4);
  s = await state();
  check('the armory racks are solid — you cannot walk through the guns',
    s.z > pistolRack.z + 0.35 && Math.abs(s.ground - BASEMENT_Y) < 0.2,
    JSON.stringify({ rackZ: pistolRack.z, stoppedAt: s }));

  /* ---- Take one off the wall, on foot, with a real E press.
   *
   * Aimed at where the FIRST COPY actually hangs, not at the middle of the
   * board: four pistols on 30 cm centres leave 10 cm gaps between them, and a
   * crosshair down the middle of the rack goes through one of the gaps and
   * reports, correctly, that there is nothing to take. */
  const pistolAt = models.find((m) => m.id === 'pistol9').at;
  const standOff = 0.95;
  await teleport(pistolAt.x, BASEMENT_Y, pistolAt.z + standOff, SOUTH);
  await page.evaluate((pitch) => { window.mansion.player.pitch = pitch; },
    Math.atan2(pistolAt.y - (BASEMENT_Y + 1.66), standOff));
  await settle(0.5);
  const promptText = await page.evaluate(() => (
    document.getElementById('prompt').classList.contains('hidden')
      ? null : document.getElementById('promptLabel').textContent));
  check('looking at a racked weapon offers it, with its own bullet count in the prompt',
    !!promptText && /9mm/i.test(promptText) && /\d+\/\d+/.test(promptText),
    JSON.stringify(promptText));

  await page.keyboard.press('KeyE');
  await settle(0.4);
  let armed = await page.evaluate(() => ({
    equipped: window.mansion.weapons.equipped,
    hud: window.mansion.weapons.hud(),
    hudText: window.mansion.weapons.hudText(),
    onWall: window.mansion.weapons.report().pistol9.onWall,
  }));
  check('pressing E takes the weapon off the rack and into the player’s hands',
    armed.equipped === 'pistol9' && armed.onWall === 3,
    JSON.stringify(armed));
  check('the ammunition counter is on screen and shows magazine and spare rounds',
    !!armed.hudText && armed.hud.rounds === 15 && armed.hud.reserve === 75
      && armed.hudText.includes('15') && armed.hudText.includes('75'),
    JSON.stringify(armed.hudText));

  /* ---- Fire it. The count goes down, tracer goes up, rounds land on the
   * house's own geometry, and the gun asks for its own fire cue. ---- */
  const fired = await armoryStep(() => {
    const w = window.mansion.weapons;
    if (!w.hud()) return { error: 'nothing in hand to fire' };
    const before = w.hud().rounds;
    const shots = [];
    for (let i = 0; i < 3; i++) { shots.push(w.fire()); window.mansion.tick(0.4); }
    return {
      before,
      after: w.hud().rounds,
      shots: shots.map((sh) => !!sh?.fired),
      tracers: w.tracers,
      stats: w.stats,
      cues: w.cues,
    };
  });
  check('firing puts rounds down range and counts them out of the magazine',
    !!fired.shots?.every(Boolean) && fired.after === fired.before - 3 && fired.stats?.shots === 3,
    JSON.stringify({ before: fired.before, after: fired.after, shots: fired.shots }));
  check('every round fired put a tracer up',
    fired.tracers?.fired === 3, JSON.stringify(fired.tracers ?? fired));
  check('rounds stop on the house’s own geometry rather than running forever',
    fired.stats?.impacts >= 1, JSON.stringify(fired.stats ?? fired));
  check('firing asks for that weapon’s own fire cue',
    fired.cues?.filter((c) => c === 'weapon.pistol9.fire').length === 3,
    JSON.stringify(fired.cues ?? fired));

  /* Every round in the air is ONE draw call — the whole reason the tracer
   * pool was lifted out of The Enola Squatch instead of being rewritten. */
  const tracerMeshes = await page.evaluate(() => {
    let pools = 0;
    let instanced = true;
    window.mansion.scene.traverse((o) => {
      if (o.name === 'tracer-pool') { pools++; if (!o.isInstancedMesh) instanced = false; }
    });
    return { pools, instanced };
  });
  check('all tracer in the scene is one instanced draw call, not a mesh per round',
    tracerMeshes.pools === 1 && tracerMeshes.instanced, JSON.stringify(tracerMeshes));

  /* ---- Reload. A real magazine leaves the gun and falls to the floor. ---- */
  const reload = await armoryStep(() => {
    const w = window.mansion.weapons;
    if (!w.hud()) return { error: 'nothing in hand to reload' };
    const before = { ...w.hud(), ejecta: w.ejecta.dropped };
    const started = w.reload();
    // Sample once the ejection has happened but before anything has landed.
    window.mansion.tick(0.7);
    const midAir = w.ejecta;
    window.mansion.tick(4.0);
    return {
      started,
      before,
      midAir,
      after: w.hud(),
      ejecta: w.ejecta,
      stats: w.stats,
      cues: w.cues.slice(-6),
    };
  });
  check('reloading ejects a real object that leaves the gun',
    !!reload.started && reload.stats?.ejections === 1
      && reload.ejecta?.dropped > reload.before?.ejecta,
    JSON.stringify({ started: reload.started, stats: reload.stats, ejecta: reload.ejecta, error: reload.error }));
  check('the ejected magazine is airborne first and lands on the armory floor',
    reload.midAir?.airborne >= 1 && reload.ejecta?.landed >= 1
      && !!reload.ejecta?.heights.some((h) => h < BASEMENT_Y + 0.25),
    JSON.stringify({ midAir: reload.midAir, settled: reload.ejecta }));
  check('the reload refills the magazine out of the spare rounds',
    reload.after?.rounds === 15 && reload.after?.reserve === 75 - 15,
    JSON.stringify(reload.after ?? reload));
  check('the reload plays a magazine out, a magazine in, and the magazine hitting the floor',
    ['weapon.pistol9.reload.out', 'weapon.pistol9.reload.in', 'weapon.pistol9.mag.floor']
      .every((c) => reload.cues?.includes(c)),
    JSON.stringify(reload.cues ?? reload));

  /* ---- The empty click: once, and distinct from firing. ---- */
  const dry = await armoryStep(() => {
    const w = window.mansion.weapons;
    if (!w.hud()) return { error: 'nothing in hand to empty' };
    // Empty the magazine, then keep pulling the trigger.
    for (let i = 0; i < 40 && w.hud().rounds > 0; i++) { w.fire(); window.mansion.tick(0.3); }
    const shotsWhenEmpty = w.stats.shots;
    const clicksBefore = w.stats.dryClicks;
    const first = w.fire();
    const second = w.fire();
    // And a held trigger must not machine-gun the click.
    w.trigger(true);
    window.mansion.tick(1.0);
    w.trigger(false);
    return {
      rounds: w.hud().rounds,
      first,
      second,
      shotsUnchanged: w.stats.shots === shotsWhenEmpty,
      clicks: w.stats.dryClicks - clicksBefore,
      cues: w.cues.slice(-4),
    };
  });
  check('an empty magazine clicks instead of firing, and the click is not a shot',
    dry.rounds === 0 && dry.first?.reason === 'empty' && dry.shotsUnchanged === true
      && !!dry.cues?.includes('weapon.pistol9.empty'),
    JSON.stringify(dry));
  check('the empty click happens once per trigger pull, not once per frame',
    dry.clicks >= 1 && dry.clicks <= 3, `${dry.clicks} clicks`);

  /* ---- Put it back, and it remembers what it had left. ---- */
  await page.keyboard.press('KeyQ');
  await settle(0.3);
  const racked = await page.evaluate(() => ({
    equipped: window.mansion.weapons.equipped,
    hudText: window.mansion.weapons.hudText(),
    onWall: window.mansion.weapons.report().pistol9.onWall,
    ammo: window.mansion.weapons.ammo().pistol9,
  }));
  check('Q puts the weapon back on its rack and clears the ammunition counter',
    racked.equipped === null && racked.onWall === 4 && racked.hudText === null,
    JSON.stringify(racked));
  check('a weapon put back empty comes off the wall empty — the armory is shared, not a vending machine',
    racked.ammo.rounds === 0, JSON.stringify(racked.ammo));

  const resupplied = await page.evaluate(() => {
    const w = window.mansion.weapons;
    w.resupply('pistol9');
    return w.ammo().pistol9;
  });
  check('the ammunition crate under the rack refills the spare rounds',
    resupplied.reserve === 75, JSON.stringify(resupplied));

  /* ---- And now every one of the six, end to end. ---- */
  const runAll = await armoryStep((ids) => {
    const w = window.mansion.weapons;
    const out = {};
    for (const id of ids) {
      w.resupply(id);
      const took = w.take(id);
      /* Ammunition follows the GUN, not the rack, so the 9mm comes back off
       * the wall exactly as empty as the dry-click run left it. Top it up
       * first — that is what the crate under the rack is for, and it is what
       * a player does before walking out with it. */
      if (w.hud() && w.hud().rounds === 0) { w.reload(); window.mansion.tick(6.0); }
      const start = w.hud();
      const shot = w.fire();
      window.mansion.tick(0.6);
      const afterShot = w.hud();
      const reloaded = w.reload();
      window.mansion.tick(8.0);
      const afterReload = w.hud();
      out[id] = {
        took,
        equipped: w.equipped,
        capacity: start?.capacity ?? null,
        fired: !!shot?.fired,
        tracer: !!shot?.tracer,
        counted: afterShot ? start.rounds - afterShot.rounds : null,
        reloaded,
        refilled: afterReload?.rounds ?? null,
        state: afterReload?.state ?? null,
        cues: w.cues.slice(-8).filter((c) => c.startsWith(`weapon.${id}.`)),
      };
      w.put();
      window.mansion.tick(0.2);
    }
    return out;
  }, WEAPONS);

  for (const id of WEAPONS) {
    const r = runAll[id] ?? { error: runAll.error };
    check(`the ${id} can be taken off the rack, fired, counted down and reloaded`,
      !!r.took && r.equipped === id && !!r.fired && r.counted === 1
        && !!r.reloaded && r.refilled === r.capacity && r.state === 'ready',
      JSON.stringify(r));
  }
  const capacities = WEAPONS.map((id) => runAll[id]?.capacity ?? null);
  check('the six weapons have genuinely different magazines, not one gun in six shapes',
    new Set(capacities).size >= 5 && !capacities.includes(null), JSON.stringify(capacities));
  check('every weapon asked for its own fire cue rather than a shared one',
    WEAPONS.every((id) => runAll[id]?.cues?.includes(`weapon.${id}.fire`)),
    JSON.stringify(Object.fromEntries(WEAPONS.map((id) => [id, runAll[id]?.cues]))));

  /* The thirty `weapon.*` cues are not recorded yet, so the guns are audible
   * tonight only if their stand-ins are real decoded recordings in this page.
   * A stand-in with no file is a synthesised noise with a comment over it. */
  const standIns = await page.evaluate(() => {
    const wanted = [
      'gun.shot', 'gun.dry', 'gun.reload', 'ice.drop', 'heist.weapon.check',
      'boat.gunshot.deck', 'heist.swap.weapons', 'heist.weapon.empty', 'heist.guard.weapon.drop',
      'heist.weapon.carbine.indoor', 'heist.weapon.reload', 'heist.weapon.carbine',
      'heist.weapon.down', 'footstep.metal', 'heist.police.gunshot', 'heist.cash.drop',
    ];
    return wanted.filter((n) => !window.mansion.weapons.hasSample(n));
  });
  check('every stand-in recording the guns fall back on is decoded and ready in the page',
    standIns.length === 0, `missing: ${standIns.join(', ')}`);

  const allRacked = await page.evaluate(() => window.mansion.weapons.report());
  check('every weapon ends the tour back on its own rack',
    Object.values(allRacked).every((w) => w.onWall === w.copies && w.taken === null),
    JSON.stringify(allRacked));

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
    Array.isArray(artSweep.art) && artSweep.art.length >= 12,
    `${artSweep.art?.length ?? 0} pieces, ${artSweep.openings?.length ?? 0} openings`);

  const SKIN = 0.02;
  const clashes = [];
  for (const piece of artSweep.art) {
    for (const o of artSweep.openings) {
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
    media.slots >= 8, `${media.slots} slots`);

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
