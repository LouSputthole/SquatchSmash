#!/usr/bin/env node
/**
 * Verify Lou's Mansion -- a standalone, explore-only environment (exterior
 * grounds + interior rooms, no NPCs/combat/dialogue/mission state). Boots
 * mansion.html directly (the same way tools/verify-squatchfather.mjs boots
 * squatchfather.html?preview=1), walks a guided tour of every named room via
 * window.mansion.teleport()/tick() plus real simulated WASD, and checks a
 * handful of concrete boundary-collision assertions.
 *
 * Shell datum numbers below (GROUND_Y/UPPER_Y/BASEMENT_Y) are copied from
 * src/mansion/scenes/MansionGrounds.js for readability in this file's own
 * assertions -- they are not imported (this script only touches the page
 * over the wire, exactly like every other verify-*.mjs in this repo).
 *
 * Two geometry quirks discovered while writing this script (both in the
 * already-committed Phase 1/2 files, out of this job's scope to fix -- see
 * the final report):
 *
 *   1. The fountain's Box3 collider (a 12.6m square approximating the round
 *      basin, centred on FOUNTAIN_POS z=35) fully engulfs the front-entry
 *      steps and portico (z: 35-41 both sit inside the fountain's z: 28.7-
 *      41.3 collision band). A straight WASD walk up the driveway centreline
 *      is hard-blocked at the fountain's south face (~z=28.4) and never
 *      reaches the stairs at all -- confirmed empirically. This script does
 *      not fight that: it demonstrates the (real, correct) block as part of
 *      the driveway leg, then reaches the portico by teleporting to a point
 *      just past the fountain's z-extent instead of walking through it.
 *   2. `window.mansion.teleport()` sets `player.ground` to the requested
 *      floor height BEFORE running one internal `player.update()`, so that
 *      first frame's `world.groundAt()` call still uses the *previous*
 *      frame's stale eye height to disambiguate multi-level columns (see
 *      `MansionInterior.js`'s `floorAt()`). For small vertical gaps (e.g.
 *      hall ground floor vs. basement) this self-corrects within a couple of
 *      simulated frames. For a LARGE gap -- teleporting straight onto the
 *      upper-floor balcony, which shares its x/z footprint with the
 *      descending basement stairwell -- the first (wrong, low) resolution
 *      can be too far from the truth to recover by smoothing alone, and the
 *      player gets stuck reading a basement-ish height while visually still
 *      "on" the balcony. This script avoids that trap the same way a real
 *      player would avoid it: it always *walks* onto the balcony from the
 *      already-resolved, unambiguous upper hallway, rather than teleporting
 *      cold onto the ambiguous column.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 5223 is verify-silvercase.mjs's port (a separate, concurrent mission's
// verify script) -- picked the next free one instead of colliding with it.
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
 * Hold real key(s) via a genuine DOM keydown/keyup, but drive the actual
 * distance covered through the scene's own headless tick() rather than real
 * animation-frame pacing -- this repo's squatchfather/no-wake verify scripts
 * use the identical "real keys, scene clock" split for the same reason:
 * swiftshader's frame rate says nothing useful about how far a held key
 * should have moved the player in a fixed amount of simulated time.
 */
async function walk(seconds, keys = ['KeyW']) {
  for (const k of keys) await page.keyboard.down(k);
  await settle(seconds);
  for (const k of keys) await page.keyboard.up(k);
  await settle(0.2);
}

/** Directly set the player's look yaw (degrees) -- the same "aim, then walk"
 * pattern src/nowake's verify script uses for its own headless steering,
 * since this scene has no mission dialogue driving the camera for us. */
async function faceDeg(yawDeg) {
  await page.evaluate((deg) => {
    window.mansion.player.yaw = (deg * Math.PI) / 180;
  }, yawDeg);
}

try {
  await page.goto(`http://localhost:${PORT}/mansion.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.mansion?.player, null, { timeout: 60000 });

  /* ================================================================ */
  /* Static sanity: every named anchor exists, geometry actually built  */
  /* ================================================================ */
  const rooms = await page.evaluate(() => {
    const out = {};
    for (const [k, v] of Object.entries(window.mansion.rooms)) {
      out[k] = (v && typeof v === 'object' && 'x' in v) ? { x: v.x, y: v.y, z: v.z } : v;
    }
    return out;
  });
  const EXPECTED_ANCHORS = [
    'gate', 'spawn', 'spawnYaw', 'fountainFront', 'frontDoorOutside', 'securityBooth',
    'poolPatio', 'serviceRoadEntrance', 'hallCenter', 'chandelier', 'grandStairBottom',
    'grandStairTop', 'basementLanding', 'livingRoomCenter', 'boardroomHead', 'boardroomTable',
    'kitchenIsland', 'officeDesk', 'trophyRoomCenter', 'upperHallway', 'balconyRail',
  ];
  check('window.mansion.rooms exposes every expected anchor (grounds + interior merged)',
    EXPECTED_ANCHORS.every((k) => k in rooms) && Object.keys(rooms).length === EXPECTED_ANCHORS.length,
    JSON.stringify(Object.keys(rooms)));

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

  /* ================================================================ */
  /* Boot gate: a real click is the user gesture that starts the tour   */
  /* ================================================================ */
  await page.click('#startBtn');
  await page.waitForFunction(() => window.mansion.running === true, null, { timeout: 20000 });
  await page.waitForTimeout(300); // let swiftshader warm up its first materials
  check('clicking start begins the tour and hides the menu',
    await page.evaluate(() => window.mansion.running === true
      && document.getElementById('menu').classList.contains('hidden')));

  /* ================================================================ */
  /* Guided tour                                                        */
  /* ================================================================ */

  // 1. Spawn at the street gate, facing into the property.
  await teleport(rooms.spawn.x, 0, rooms.spawn.z, (rooms.spawnYaw * 180) / Math.PI);
  await settle(0.3);
  let s = await state();
  check('spawns at the street gate facing into the property',
    Math.abs(s.x - rooms.spawn.x) < 0.3 && Math.abs(s.z - rooms.spawn.z) < 0.3,
    JSON.stringify(s));

  // 2. Up the driveway toward the fountain -- real WASD, not a teleport, to
  // exercise genuine input on open, obstacle-free ground. The fountain's
  // tiered collider (fz +/- 3.6, i.e. z: 31.4-38.6 for fz=35 -- narrowed from
  // an earlier oversized single box that used to engulf the front steps)
  // genuinely blocks a straight walk a little short of the basin itself --
  // confirmed real collision, not a stall -- so this asserts real forward
  // progress plus that a walking player is held there rather than clipping
  // through (this doubles as a boundary check). The threshold below tracks
  // the collider's actual near face (~31.4) plus a small margin, not the
  // pre-tiering number.
  await teleport(0, 0, 10, 180);
  const beforeDrive = await state();
  await walk(10);
  const afterDrive = await state();
  check('walking up the driveway with real WASD input makes real forward progress before the fountain blocks it',
    (afterDrive.z - beforeDrive.z) > 12 && afterDrive.z < 32 && Math.abs(afterDrive.x) < 0.5,
    JSON.stringify({ beforeDrive, afterDrive }));

  // 3. Up the front steps onto the raised entry portico.
  //
  // The stair/portico footprint (z: 35-41) sits entirely inside the
  // fountain's collision band (z: 28.7-41.3, see this file's header) in the
  // already-committed grounds file, so a straight walk from the driveway
  // cannot reach it (confirmed above). Teleporting straight past the
  // fountain's z-extent reaches the portico cleanly instead.
  await teleport(0, GROUND_Y, 41.5, 180);
  await settle(0.5);
  s = await state();
  check('the raised entry portico is reachable at ground level, just past the fountain',
    Math.abs(s.z - 41.5) < 0.5 && Math.abs(s.ground - GROUND_Y) < 0.2,
    JSON.stringify(s));

  // 4. Through the front door into the central hall -- real WASD from the
  // portico, crossing the door threshold into the atrium.
  await walk(4);
  await settle(0.8);
  s = await state();
  check('walking through the front door reaches the central hall at ground level',
    s.z > 43 && Math.abs(s.ground - GROUND_Y) < 0.35,
    JSON.stringify(s));

  // 5. Up the grand staircase to the upper floor.
  await teleport(rooms.grandStairBottom.x, GROUND_Y, 43.3, 180);
  await settle(0.5);
  await walk(6);
  await settle(1.0);
  s = await state();
  check('climbing the grand staircase with real WASD input reaches the upper floor',
    s.z > 47 && Math.abs(s.ground - UPPER_Y) < 0.4,
    JSON.stringify(s));

  // ...and out onto the balcony overlooking the hall.
  await teleport(rooms.upperHallway.x, UPPER_Y, rooms.upperHallway.z, 0);
  await settle(1.0);
  s = await state();
  check('the upper hallway sits at the upper-floor level, connecting to the balcony',
    Math.abs(s.ground - UPPER_Y) < 0.2,
    JSON.stringify(s));

  // Walk from the (safe, single-level) upper hallway onto the balcony, which
  // shares its x/z footprint with the descending basement stairwell -- see
  // this file's header for why this is walked into rather than teleported.
  await teleport(rooms.balconyRail.x, UPPER_Y, 53, 0);
  await settle(0.5);
  await faceDeg(0); // heading -z, toward the balcony/rail
  await walk(5);
  await settle(0.5);
  s = await state();
  check('walking onto the balcony overlooks the hall from the upper floor without falling through the shared stairwell column',
    s.z < 49 && s.z > 43 && Math.abs(s.ground - UPPER_Y) < 0.25,
    JSON.stringify(s));

  // 6. Back down the grand staircase to the ground floor.
  await teleport(rooms.grandStairBottom.x, UPPER_Y, 47, 0);
  await settle(0.5);
  await walk(6);
  await settle(1.0);
  s = await state();
  check('descending the grand staircase with real WASD input returns to ground level',
    s.z < 44 && Math.abs(s.ground - GROUND_Y) < 0.4,
    JSON.stringify(s));

  // 7. Into the sunken living room.
  //
  // NOTE: src/mansion/scenes/MansionInterior.js documents a deliberate
  // deviation here -- Phase 1's podium slab under this footprint is solid
  // and un-notched, so a literal ~0.4m recess would render as furniture
  // buried in solid stone. Phase 2 kept the floor flush with the hall
  // (GROUND_Y) and built the "sunken lounge" feel through furniture staging
  // only (couches/rug/coffee table), not a real floor drop. That is ground
  // truth already committed to this mission's own files, which this job is
  // not permitted to edit -- so this checks what is actually built (flush
  // with the hall) instead of asserting a physical drop that file explicitly
  // chose not to build. See this script's own final report for the flag.
  //
  // Also note: `livingRoomCenter` is authored at the coffee table's own
  // collider centre, so a teleport there is nudged clear by collision
  // resolution -- this only asserts reachability and floor height, not an
  // exact resting x/z, matching the boardroom/kitchen checks below (whose
  // anchors are likewise their furniture's centre).
  await teleport(rooms.livingRoomCenter.x, GROUND_Y, rooms.livingRoomCenter.z, 90);
  await settle(1.0);
  s = await state();
  check('the living room is reachable and flush with the hall floor (documented interior deviation, not a drop)',
    Math.abs(s.ground - GROUND_Y) < 0.15,
    JSON.stringify(s));

  // 8. Into the boardroom.
  await teleport(rooms.boardroomTable.x, GROUND_Y, rooms.boardroomTable.z, 0);
  await settle(1.0);
  s = await state();
  check('the boardroom sits at ground level east of the hall',
    Math.abs(s.ground - GROUND_Y) < 0.15,
    JSON.stringify(s));

  // 9. Through to the kitchen and service corridor to the rear door.
  await teleport(rooms.kitchenIsland.x, GROUND_Y, rooms.kitchenIsland.z, 0);
  await settle(1.0);
  s = await state();
  check('the kitchen sits at ground level north of the boardroom',
    Math.abs(s.ground - GROUND_Y) < 0.15,
    JSON.stringify(s));

  await teleport(16, GROUND_Y, 66, 0);
  await settle(1.0);
  s = await state();
  check('the rear service door is reachable at ground level',
    Math.abs(s.ground - GROUND_Y) < 0.3,
    JSON.stringify(s));

  // 10. Down into the basement armory, below the central hall. The landing
  // anchor sits half a metre shy of the bottom (still one tread up from the
  // flat armory floor), so a small, one-directional gap from BASEMENT_Y is
  // the correct reading here, not smoothing noise.
  await teleport(rooms.basementLanding.x, rooms.basementLanding.y, rooms.basementLanding.z, 0);
  await settle(1.2);
  s = await state();
  check('the basement stairwell reaches the armory floor below the hall',
    s.ground <= (BASEMENT_Y + 0.5) && s.ground >= (BASEMENT_Y - 0.1),
    JSON.stringify(s));

  // 11. Out back to the pool patio.
  await teleport(rooms.poolPatio.x, GROUND_Y, rooms.poolPatio.z, 0);
  await settle(1.0);
  s = await state();
  check('the pool patio deck sits at the raised ground-floor level',
    Math.abs(s.ground - GROUND_Y) < 0.15,
    JSON.stringify(s));

  /* ================================================================ */
  /* Boundary collision checks                                          */
  /* ================================================================ */

  // A. Cannot walk through the west perimeter fence.
  await teleport(-25, 0, 45, 90); // yaw 90: heading is -x
  await walk(6);
  await settle(0.3);
  s = await state();
  check('the west perimeter fence blocks a straight walk toward the property boundary',
    s.x > -29.9,
    JSON.stringify(s));

  // B. A solid curb rings the pool -- cannot walk into its own footprint.
  await teleport(0, GROUND_Y, 78, 180); // yaw 180: heading is +z, toward the water
  await walk(6);
  await settle(0.3);
  s = await state();
  const insidePoolFootprint = s.x > -7 && s.x < 7 && s.z > 81 && s.z < 89;
  check("a solid curb keeps a straight walk out of the pool's own basin footprint",
    !insidePoolFootprint,
    JSON.stringify({ ...s, insidePoolFootprint }));

  // C. The balcony's south railing blocks a walk off its edge into the
  // atrium void below (falling there without using the stairs). Reached by
  // walking in from the safe upper hallway, per this file's header note.
  await teleport(rooms.balconyRail.x, UPPER_Y, 53, 0);
  await settle(0.5);
  await faceDeg(0); // heading -z, toward the rail at z~43
  await walk(6);
  await settle(0.3);
  s = await state();
  check('the balcony south railing blocks a walk off the edge into the hall void below',
    s.z > 42.6 && Math.abs(s.ground - UPPER_Y) < 0.3,
    JSON.stringify(s));

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
