#!/usr/bin/env node
/**
 * Play Front and Center, headlessly, from the pavement to the ending card.
 *
 *   node tools/verify-silver.mjs        (npm run verify:silver)
 *
 * Same reasoning as verify-bing.mjs, and more of it. This mission is a state
 * machine wired to a building *and* to a woman walking next to you, and almost
 * everything that can go wrong with it is invisible to a syntax check:
 *
 *   - the companion gets stuck in the cellar and the player never finds out
 *     until he turns round at the host station and she is two rooms back;
 *   - a tip pays out twice, or pays out after a checkpoint reload;
 *   - the table cutscene builds a table and then the table is not there;
 *   - the conversation queue stalls because a round never reported done;
 *   - an ending resolves to a node that does not exist.
 *
 * So this drives the real systems in a real browser: it walks the whole route,
 * tips everybody, sits down, talks, watches both cutscenes, and asserts the
 * mission state at each beat. It steps the update functions directly rather
 * than waiting on frames, because software rendering runs at about a frame a
 * second and the point here is the logic.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5212;

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
  console.error('playwright is not installed; cannot verify the club.');
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
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });

const problems = [];
page.on('pageerror', (e) => problems.push(`${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 240)); });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/* Preview mode seeds a page-local campaign in which the Motel is done and
 * Margo has rung, so the story gate opens without touching a real save. */
await page.goto(`http://localhost:${PORT}/silver.html?preview=1`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const failedToLoad = await page.evaluate(() => {
  const el = document.getElementById('loading');
  return el?.classList.contains('failed') ? el.textContent : null;
});
if (failedToLoad) {
  console.error(`The club did not load: ${failedToLoad}`);
  await browser.close();
  server.close();
  process.exit(1);
}

/* Clicked in-page rather than through the mouse: this panel is taller than
 * the Bing's and the button falls outside the deliberately tiny viewport,
 * which every pixel of is drawn on the CPU. */
await page.evaluate(() => document.getElementById('start-btn').click());
await page.waitForFunction(() => window.__silver?.game.started, null, { timeout: 90000 });
await page.evaluate(() => window.__silver.postfx.disable?.());

/**
 * Step the game's own update path for `secs` of simulated time.
 *
 * Everything the frame loop calls, in the order it calls it. `__evening` is the
 * one that used to be missing: the car outside, the dance, and the two things
 * she notices about being ignored all lived inline in `frame()`, so this driver
 * never ran them — which is exactly why a dance that could not be started and a
 * car that drove off mid-conversation both got past it.
 */
async function tick(secs = 1, step = 0.25) {
  await page.evaluate(([s, st]) => {
    const b = window.__silver;
    for (let t = 0; t < s; t += st) {
      b.player.update(st);
      if (b.game.drive) b.game.drive(st);
      if (b.game.scene) b.game.scene.update(st);
      b.room.update(st, b.player.position);
      b.dialogue.update(st, b.player.position);
      b.date.update(st, b.player.position, b.player.yaw);
      b.performance.update(st);
      b.mission.update(st, { trailing: b.date.isTrailing });
      b.__zones();
      b.__seatTick(st);
      b.__host();
      b.__evening(st);
    }
  }, [secs, step]);
}


/** Walk, rather than teleport, so the companion has to keep up. */
async function walkTo(x, z) {
  await page.evaluate(([tx, tz]) => {
    const b = window.__silver;
    const d0 = Math.hypot(tx - b.player.position.x, tz - b.player.position.z);
    const s = Math.max(0.6, d0 / 3.2);        // his actual walking speed
    b.player.mode = 'walk';
    b.player._tween = null;
    b.player.yawCenter = null;
    const from = b.player.position.clone();
    const steps = Math.ceil(s / 0.05);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const px = from.x + (tx - from.x) * k;
      const pz = from.z + (tz - from.z) * k;
      /* Pass his own current height, exactly as world.groundAt does in the
       * game: the cellar is under the kitchen and x/z alone cannot say which
       * floor you are on. Asking without it walks you along the ceiling. */
      const y0 = b.player.position.y - 1.66;
      b.player.position.set(px, b.room.groundAt(px, pz, y0) + 1.66, pz);
      b.player.yaw = Math.atan2(-(tx - from.x), -(tz - from.z));
      b.date.update(0.05, b.player.position, b.player.yaw);
      b.room.update(0.05, b.player.position);
      b.mission.update(0.05, { trailing: b.date.isTrailing });
      b.__zones();
    }
    b.player.update(0.016);
  }, [x, z]);
  await tick(0.8);
}

/** Stand still and let her arrive, which is what a player does. */
async function waitForHer(secs = 12) {
  for (let i = 0; i < secs; i++) {
    const gap = await page.evaluate(() => Math.hypot(
      window.__silver.date.position.x - window.__silver.player.position.x,
      window.__silver.date.position.z - window.__silver.player.position.z,
    ));
    if (gap < 3) return gap;
    await tick(1, 0.1);
  }
  return page.evaluate(() => Math.hypot(
    window.__silver.date.position.x - window.__silver.player.position.x,
    window.__silver.date.position.z - window.__silver.player.position.z,
  ));
}

const state = () => page.evaluate(() => {
  const b = window.__silver;
  const p = b.player.position;
  return {
    mission: b.mission.state,
    room: b.room.roomAt(p.x, p.z, p.y - 1.6),
    objectives: b.mission.objectives.map((o) => `${o.done ? 'x' : ' '}${o.id}`),
    flags: { ...b.mission.flags },
    money: b.game.money,
    woo: b.woo.score,
    tips: b.woo.tipCount,
    tipsLeft: b.woo.tipsLeft,
    streak: b.woo.streakClosed,
    options: b.dialogue.active ? b.dialogue.options.length : -1,
    dateGap: Math.hypot(b.date.position.x - p.x, b.date.position.z - p.z),
    dateRoom: b.room.roomAt(b.date.position.x, b.date.position.z, b.date.position.y),
    dateMode: b.date.mode,
    seated: b.game.seated,
    scene: !!b.game.scene,
  };
});

const choose = async (i) => {
  await page.evaluate((n) => window.__silver.dialogue.choose(n), i);
  await tick(3);
};

/* ---- the building, before anybody walks it ----
 *
 * Everything below this block drives the mission by setting the player's
 * position, which is the only way to play a first-person game headlessly and
 * also the reason none of it has ever noticed a wall. It walked through the
 * street set built inside the lobby, four bricked-up doorways, ten route legs
 * that went through a wine rack or a range, and two route nodes labelled with
 * rooms they were not in — and passed. So the geometry gets asserted directly,
 * against the same colliders and the same `groundAt` the player uses.
 */
const geometry = await page.evaluate(() => {
  const b = window.__silver;
  const room = b.room;
  const EYE = 1.66;
  const RADIUS = 0.30;
  /* Doors a player can open are open: the service door is the only way in and
   * the point of the sweep is the route somebody can actually walk. */
  for (const d of Object.values(room.doors)) if (!d.locked && !d.open) d.toggle();

  const blocking = (x, z, feet) => {
    for (const c of room.colliders) {
      if (feet + EYE + 0.05 < c.min.y || feet > c.max.y) continue;
      const cx = Math.max(c.min.x, Math.min(x, c.max.x));
      const cz = Math.max(c.min.z, Math.min(z, c.max.z));
      if (Math.hypot(x - cx, z - cz) < RADIUS) {
        return `${c.min.x.toFixed(1)}..${c.max.x.toFixed(1)} × ${c.min.z.toFixed(1)}..${c.max.z.toFixed(1)}`;
      }
    }
    return null;
  };

  /* (a) every leg, sampled at 200mm, clear at the height it is walked at */
  const R = room.ROUTE;
  const fouled = [];
  for (let i = 0; i + 1 < R.length; i++) {
    const a = R[i]; const c = R[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / 0.2));
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const x = a.x + (c.x - a.x) * k;
      const z = a.z + (c.z - a.z) * k;
      const hit = blocking(x, z, room.groundAt(x, z, a.y ?? 0));
      if (hit) { fouled.push(`${i}→${i + 1} at ${x.toFixed(1)},${z.toFixed(1)} in ${hit}`); break; }
    }
  }

  /* (b) every node is in the room it says it is in */
  const mislabelled = R
    .map((n, i) => ({ i, n, got: room.roomAt(n.x, n.z, n.y ?? 0) }))
    .filter((e) => e.got !== e.n.room)
    .map((e) => `${e.i} (${e.n.x},${e.n.z}) says ${e.n.room}, is ${e.got}`);

  /* (c) can a man who obeys collision actually get in?
   *
   * A flood fill on a quarter-metre grid with his own capsule, from the mouth
   * of the alley. Two levels, because the cellar is under the kitchen and
   * `groundAt` answers differently depending on which one you are already on;
   * they join where the two answers agree, which is exactly the ramps and
   * nowhere else.
   *
   * This is the check the four bricked-up doorways needed. Every one of them
   * was a `wall` drawn over the top of a `wallGap` in the same plane — an
   * opening with a wall standing in it — and not one of them is visible in a
   * diff, in a screenshot taken from the other side, or to a driver that moves
   * the player by assignment.
   */
  const CELL = 0.25;
  const X0 = -32; const Z0 = -24; const NX = 288; const NZ = 256;
  const gx = (i) => X0 + i * CELL;
  const gz = (j) => Z0 + j * CELL;
  const at = (i, j) => i * NZ + j;
  const gnd = [new Float32Array(NX * NZ), new Float32Array(NX * NZ)];
  const free = [new Uint8Array(NX * NZ), new Uint8Array(NX * NZ)];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      for (const L of [0, 1]) {
        const g = room.groundAt(gx(i), gz(j), L ? -2.9 : 0);
        gnd[L][at(i, j)] = g;
        free[L][at(i, j)] = blocking(gx(i), gz(j), g) ? 0 : 1;
      }
    }
  }
  const seen = [new Uint8Array(NX * NZ), new Uint8Array(NX * NZ)];
  const si = Math.round((34 - X0) / CELL); const sj = Math.round((20 - Z0) / CELL);
  const queue = [[si, sj, 0]];
  seen[0][at(si, sj)] = 1;
  while (queue.length) {
    const [i, j, L] = queue.pop();
    const g = gnd[L][at(i, j)];
    const o = L ^ 1;
    if (!seen[o][at(i, j)] && free[o][at(i, j)] && Math.abs(gnd[o][at(i, j)] - g) < 0.01) {
      seen[o][at(i, j)] = 1; queue.push([i, j, o]);
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di; const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      if (seen[L][at(ni, nj)] || !free[L][at(ni, nj)]) continue;
      if (Math.abs(gnd[L][at(ni, nj)] - g) > 0.6) continue;
      seen[L][at(ni, nj)] = 1; queue.push([ni, nj, L]);
    }
  }
  const A = room.anchors;
  const canReach = (x, z, L) => {
    const i = Math.round((x - X0) / CELL); const j = Math.round((z - Z0) / CELL);
    return i >= 0 && j >= 0 && i < NX && j < NZ && !!seen[L][at(i, j)];
  };
  const unreachable = [
    ['the landing inside the service door', 28.5, 11.7, 0],
    ['the cellar floor', 22, 1, 1],
    ['the dry store', 19, -10, 1],
    ['the walk-in', 24.5, -10, 1],
    ['the prep kitchen', 19, 3.2, 0],
    ['the pass', 19, -5, 0],
    ['the dish pit', 28.4, -14, 0],
    ['the corridor', 12.5, 20, 0],
    ['the floor of the club', 6, 24, 0],
    ['the front table', A.frontTable.x + 1.2, A.frontTable.z + 1.2, 0],
    /* Through the front-of-house doorway rather than round through the staff
     * corridor: the lobby is the other side of a wall that had an opening
     * drawn in it and a wall standing in the opening. */
    ['the lobby', 0, 30, 0],
  ].filter(([, x, z, L]) => !canReach(x, z, L)).map(([n]) => n);

  /* (d) and every doorway is a doorway.
   *
   * Reachability alone will not see this: the lobby was still reachable with
   * its own front-of-house opening walled up, because you could go the long way
   * round through the staff corridor. So the middle of each opening is tested
   * directly. Every one of the five that were sealed had a `wall` covering a
   * `wallGap` in the same plane, which is invisible in a diff. */
  const sealed = [
    ['the alley service door', 29.8, 11.7, 0],
    ['the cellar into the walk-in', 24.4, -6.2, -2.9],
    ['the cellar into the dry store', 19.8, -6.2, -2.9],
    ['the walk-in door', 21, -10, -2.9],
    ['the kitchen swing doors', 15, -7.8, 0],
    ['the corridor into the prep kitchen', 15, 4.8, 0],
    ['the lobby into the dining room', 0, 26.2, 0],
    ['the curtain', 9.8, 24, 0],
    ['the dining room into the restrooms', -2.5, -8.1, 0],
    ['the dining room into the back corridor', 3.9, -8.1, 0],
    ['the back corridor into the restrooms', -2.5, -15.2, 0],
    ['the rear exit', -3, -21.6, 0],
  ].filter(([, x, z, y]) => blocking(x, z, y)).map(([n]) => n);

  return { legs: R.length - 1, fouled, nodes: R.length, mislabelled, unreachable, sealed };
});
check('every leg of the route is clear of every collider at walking height',
  geometry.fouled.length === 0,
  `${geometry.legs - geometry.fouled.length}/${geometry.legs} legs`
    + (geometry.fouled.length ? ` — ${geometry.fouled.slice(0, 3).join('; ')}` : ''));
check('and every node on it is in the room it claims',
  geometry.mislabelled.length === 0,
  `${geometry.nodes - geometry.mislabelled.length}/${geometry.nodes} nodes`
    + (geometry.mislabelled.length ? ` — ${geometry.mislabelled.slice(0, 3).join('; ')}` : ''));
check('a man who cannot walk through walls can get in at the service door '
  + 'and reach the best table in the building',
  geometry.unreachable.length === 0,
  geometry.unreachable.length ? `cannot reach ${geometry.unreachable.join(', ')}` : 'all eleven rooms');
check('and none of the twelve doorways has a wall standing in it',
  geometry.sealed.length === 0,
  geometry.sealed.length ? `bricked up: ${geometry.sealed.join(', ')}` : 'all twelve open');

/* ---- the wave-2 set dressing ----
 *
 * Everything here is a thing the second playtest saw and the first harness
 * could not: a queue that was a crowd, staff standing inside walls, chairs
 * dealt into columns, a lidded stairwell, and a route with no signposting.
 * All of it is asserted against the built scene, not against the source.
 */
const dressing = await page.evaluate(() => {
  const b = window.__silver;
  const T = b.THREE;
  const room = b.room;
  const out = {};

  /* (a) the stairwells read open: from eye height at the top of each ramp,
   * the sight line to eye height at the bottom hits nothing on the way down.
   * The 300m street plane used to lid both wells at y=-0.02. */
  const ray = new T.Raycaster();
  out.stairs = [
    ['entry ramp', [23, 1.66, 11.6], [15.9, -1.35, 10.6]],
    ['kitchen well', [20.6, 1.66, 1], [15.7, -1.35, 1]],
  ].map(([name, from, to]) => {
    const o = new T.Vector3(...from);
    const t = new T.Vector3(...to);
    const dir = t.clone().sub(o);
    const len = dir.length();
    ray.set(o, dir.normalize());
    ray.far = len - 0.05;
    const hit = ray.intersectObjects(b.scene.children, true).find((h) => h.object.visible);
    return { name, len: +len.toFixed(2), hit: hit ? +hit.distance.toFixed(2) : null };
  });

  /* (b) the front queue is a line: along the rope, evenly spaced, everybody
   * facing up it and the head of it facing the man on the door. */
  const q = [];
  for (let i = 0; i < 12; i++) {
    const npc = b.cast.byName[`queue${i}`];
    if (!npc) break;
    q.push({ x: npc.group.position.x, z: npc.group.position.z, yaw: npc.group.rotation.y });
  }
  q.sort((m, n) => m.x - n.x);
  const gaps = q.slice(1).map((m, i) => m.x - q[i].x);
  const head = q[q.length - 1];
  const toDoor = Math.atan2(room.anchors.doorman.x - head.x, room.anchors.doorman.z - head.z);
  out.queue = {
    n: q.length,
    offRope: +Math.max(...q.map((m) => Math.abs(m.z - 38.14))).toFixed(2),
    gapMin: +Math.min(...gaps).toFixed(2),
    gapMax: +Math.max(...gaps).toFixed(2),
    facingLine: q.slice(0, -1).every((m) => Math.abs(m.yaw - Math.PI / 2) < 0.5),
    headFacesDoor: Math.abs(Math.atan2(Math.sin(head.yaw - toDoor), Math.cos(head.yaw - toDoor))) < 0.5,
  };

  /* (c) the wayfinding exists: a service plate at the alley end of the
   * frontage, a painted lane through the kitchen, FLOOR plates both sides of
   * the swing doors, and a marquee whose emissive is a sign, not a flare. */
  let plates = 0; let lanes = 0; let service = null; let marquee = null;
  b.scene.traverse((o) => {
    if (o.name === 'floor-plate') plates++;
    if (o.name === 'service-lane') lanes++;
    if (o.name === 'service-plate') service = { x: +o.position.x.toFixed(1), z: +o.position.z.toFixed(1) };
    if (o.name === 'marquee') marquee = { intensity: o.material.emissiveIntensity };
  });
  out.signs = { plates, lanes, service, marquee };

  /* (d) nobody on their feet is inside a wall or a piece of furniture. The
   * service bar man used to work from inside the corridor's east wainscot. */
  const inside = [];
  for (const [key, npc] of Object.entries(b.cast.byName)) {
    if (npc.job === 'sit' || npc.job === 'drink') continue;
    if (!npc.group.visible) continue;
    const p = npc.group.position;
    for (const c of room.colliders) {
      if (p.x > c.min.x + 0.02 && p.x < c.max.x - 0.02
          && p.z > c.min.z + 0.02 && p.z < c.max.z - 0.02
          && p.y + 1.5 > c.min.y && p.y + 0.05 < c.max.y) {
        inside.push(`${key} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
        break;
      }
    }
  }
  out.inside = inside;

  /* (e) chairs belong to tables: none dealt into a column, the pillar crew
   * sitting on the pillar table's own chairs, every diner in a real chair. */
  const COLUMNS = [[-8, 6], [-8, 16], [-20, 6], [-20, 16]];
  out.chairsInColumns = room.anchors.diningSeats
    .filter((s) => COLUMNS.some(([cx, cz]) => Math.hypot(s.x - cx, s.z - cz) < 0.72)).length;
  const crewKeys = ['bing-bouncer', 'ape', 'crew1', 'crew2'];
  out.crewSeated = crewKeys.every((k) => {
    const npc = b.cast.byName[k];
    return npc && room.anchors.crewSeats.some((s) => Math.hypot(npc.group.position.x - s.x, npc.group.position.z - s.z) < 0.3);
  });
  let dinersOffChair = 0;
  for (const [key, npc] of Object.entries(b.cast.byName)) {
    if (!/^diner\d+$/.test(key)) continue;
    const p = npc.group.position;
    const seated = room.anchors.tableSeats.some((t) => t.seats.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 0.3));
    if (!seated) dinersOffChair++;
  }
  out.dinersOffChair = dinersOffChair;

  return out;
});
check('both stairwells read open from the top — nothing across the sight line down',
  dressing.stairs.every((s) => s.hit === null),
  dressing.stairs.map((s) => `${s.name}: ${s.hit === null ? 'clear' : `hit at ${s.hit}m of ${s.len}`}`).join('; '));
check('the front queue is an actual line along the rope, facing the door',
  dressing.queue.n >= 8 && dressing.queue.offRope < 0.35
    && dressing.queue.gapMin > 0.7 && dressing.queue.gapMax < 1.5
    && dressing.queue.facingLine && dressing.queue.headFacesDoor,
  JSON.stringify(dressing.queue));
check('the side entrance is signposted from the street and the marquee is a sign, not a flare',
  dressing.signs.service && dressing.signs.service.x > 17 && dressing.signs.service.z > 34.2
    && dressing.signs.marquee && dressing.signs.marquee.intensity <= 0.7,
  JSON.stringify(dressing.signs));
check('the way from the kitchen to the floor is painted on it, with a plate over each door',
  dressing.signs.lanes >= 4 && dressing.signs.plates === 2,
  `${dressing.signs.lanes} lane stripes, ${dressing.signs.plates} plates`);
check('nobody on their feet is standing inside a wall or the furniture',
  dressing.inside.length === 0, dressing.inside.join('; ') || 'all clear');
check('chairs belong to their tables: none in a column, the crew on their own chairs, every diner in one',
  dressing.chairsInColumns === 0 && dressing.crewSeated && dressing.dinersOffChair === 0,
  JSON.stringify({ inColumns: dressing.chairsInColumns, crew: dressing.crewSeated, offChair: dressing.dinersOffChair }));

/* ---- and she can walk it, rather than being teleported down it ----
 *
 * `_stuck` recovery exists so a companion who gets wedged behind a range is
 * not lost for the evening; it is not a way of getting round the building, and
 * every time it fires the player either sees her pop or turns round and finds
 * her somewhere she did not walk to. Drive the real follower over the whole
 * route with collision on, with him one node ahead of her the entire way, and
 * require that it never fires once.
 */
const walkedRoute = await page.evaluate(() => {
  const b = window.__silver;
  const R = b.room.ROUTE;
  let pops = 0;
  const realCaughtUp = b.date.hooks.onCaughtUp;
  b.date.hooks.onCaughtUp = (...a) => { pops++; realCaughtUp?.(...a); };
  b.date.mode = 'follow';
  b.date.at = 0;
  b.date._stuck = 0;
  b.date.group.position.set(R[0].x, b.room.groundAt(R[0].x, R[0].z, R[0].y ?? 0), R[0].z);
  b.date._lastPos.copy(b.date.group.position);

  let worst = 0; let worstAt = 0;
  for (let i = 1; i < R.length; i++) {
    const from = R[i - 1]; const to = R[i];
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(4, Math.ceil(len / 0.15));
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      const px = from.x + (to.x - from.x) * k;
      const pz = from.z + (to.z - from.z) * k;
      const feet = b.room.groundAt(px, pz, to.y ?? from.y ?? 0);
      const pos = { x: px, y: feet + 1.66, z: pz };
      const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
      /* Two ticks per 150mm of his walk: 0.06s at 2.35m/s is about that, and
       * she is given the same clock he is rather than a generous one. */
      for (let t = 0; t < 2; t++) b.date.update(0.06, pos, yaw);
      const gap = Math.hypot(b.date.position.x - px, b.date.position.z - pz);
      if (gap > worst) { worst = gap; worstAt = i; }
    }
  }
  b.date.hooks.onCaughtUp = realCaughtUp;
  const end = R[R.length - 1];
  return {
    pops,
    worst: +worst.toFixed(1),
    worstAt,
    at: b.date.at,
    of: R.length - 1,
    finalGap: +Math.hypot(b.date.position.x - end.x, b.date.position.z - end.z).toFixed(1),
    room: b.room.roomAt(b.date.position.x, b.date.position.z, b.date.position.y),
  };
});
check('she walks the whole route on her own legs, with nothing teleporting her',
  walkedRoute.pops === 0,
  `${walkedRoute.pops} recoveries, worst gap ${walkedRoute.worst}m at leg ${walkedRoute.worstAt}`);
check('and she arrives at the far end of it, on the floor of the club',
  walkedRoute.finalGap < 3 && walkedRoute.room === 'floor',
  JSON.stringify(walkedRoute));

/* Put her back where the mission expects her before the evening starts. */
await page.evaluate(() => {
  const b = window.__silver;
  for (const d of Object.values(b.room.doors)) if (d.open) d.toggle();
  b.date.at = 0;
  b.date._stuck = 0;
  b.date.group.position.set(b.room.anchors.dropOff.x - 1.3, 0, b.room.anchors.dropOff.z - 0.4);
  b.date._lastPos.copy(b.date.group.position);
});

/* ---- and she is somebody you would ask to dinner ----
 *
 * The owner's wave-2 note, verbatim enough: her hair should come down on the
 * side, and her face needed work. Both are authored geometry in
 * src/silver/margo.js now, and both are pinned here by measurement rather
 * than by eye: the hair is shaped masses with the fall on exactly one side
 * reaching well below the jaw while the other side stays tucked above it,
 * and the face has the proportions somebody chose on purpose — two brows,
 * eyes an eye-width apart, a nose that stops short of being a snout, a
 * mouth wider than the nose, a jaw narrower than the skull. If a later pass
 * regresses her to the stock crowd face, both of these go red.
 */
const margo = await page.evaluate(() => {
  const head = window.__silver.date.npc.parts.head;
  const get = (n) => head.getObjectByName(n);
  const need = ['margo.hair.crown', 'margo.hair.fringe', 'margo.hair.fall.main',
    'margo.hair.fall.end', 'margo.hair.tuck', 'margo.face.skull', 'margo.face.jaw',
    'margo.face.brow.left', 'margo.face.brow.right', 'margo.face.eye.left',
    'margo.face.eye.right', 'margo.face.iris.left', 'margo.face.iris.right',
    'margo.face.nose.tip', 'margo.face.mouth'];
  const missing = need.filter((n) => !get(n));
  if (missing.length) return { missing };
  /* Head-local extents. box() keeps a mesh's size in its scale, so the
   * lowest point of a z-rotated slab is centre minus the rotated half. */
  const bottom = (m) => m.position.y
    - (m.scale.x * Math.abs(Math.sin(m.rotation.z))
      + m.scale.y * Math.abs(Math.cos(m.rotation.z))) / 2;
  const falls = ['margo.hair.fall.main', 'margo.hair.fall.end'].map(get);
  const tuck = get('margo.hair.tuck');
  const jaw = get('margo.face.jaw');
  const skull = get('margo.face.skull');
  const eyeL = get('margo.face.eye.left');
  const eyeR = get('margo.face.eye.right');
  const browL = get('margo.face.brow.left');
  const browR = get('margo.face.brow.right');
  const nose = get('margo.face.nose.tip');
  const mouth = get('margo.face.mouth');
  return {
    missing,
    fallBottom: Math.min(...falls.map(bottom)),
    fallOneSide: falls.every((m) => m.position.x > 0.06)
      || falls.every((m) => m.position.x < -0.06),
    tuckOtherSide: tuck.position.x * falls[0].position.x < 0,
    tuckBottom: bottom(tuck),
    jawBottom: jaw.position.y - jaw.scale.y / 2,
    jawWidth: jaw.scale.x,
    skullWidth: skull.scale.x,
    skullFront: skull.position.z + skull.scale.z / 2,
    eyeWidth: eyeL.scale.x,
    eyeGap: Math.abs(eyeL.position.x - eyeR.position.x) - eyeL.scale.x,
    browGap: Math.abs(browL.position.x - browR.position.x) - browL.scale.x,
    noseFront: nose.position.z + nose.scale.z / 2,
    noseWidth: nose.scale.x,
    mouthWidth: mouth.scale.x,
  };
});
check('her hair comes down one side of her face, and is tucked on the other',
  !margo.missing.length && margo.fallOneSide && margo.tuckOtherSide
    && margo.fallBottom < margo.jawBottom - 0.06
    && margo.tuckBottom > margo.jawBottom,
  margo.missing.length
    ? `missing ${margo.missing.join(', ')}`
    : `fall to ${margo.fallBottom.toFixed(2)}, tuck to ${margo.tuckBottom.toFixed(2)}, `
      + `jaw at ${margo.jawBottom.toFixed(2)}`);
const eyeApart = margo.missing.length ? 0 : margo.eyeGap / margo.eyeWidth;
check('and the face across the table has proportions somebody chose',
  !margo.missing.length
    && eyeApart > 0.8 && eyeApart < 1.5            // eyes about an eye-width apart
    && margo.browGap > 0.02                        // two brows, not a ledge
    && margo.noseFront < margo.skullFront + 0.03   // a nose, not a snout
    && margo.mouthWidth > margo.noseWidth          // a mouth wider than the nose
    && margo.jawWidth < margo.skullWidth * 0.85,   // a jaw that tapers
  margo.missing.length
    ? `missing ${margo.missing.join(', ')}`
    : `eyes ${eyeApart.toFixed(2)} widths apart, brow gap ${margo.browGap.toFixed(3)}, `
      + `nose ${(margo.noseFront - margo.skullFront).toFixed(3)} off the face, `
      + `jaw ${(margo.jawWidth / margo.skullWidth).toFixed(2)} of the skull`);

await page.evaluate(() => { window.__roomLog = []; });
console.log('Driving the evening…');

/* ---- arrival ---- */
await tick(5, 0.2);
let s = await state();
check('the car pulls up and hands control back inside five seconds',
  s.mission === 'arrived', s.mission);
check('she is out of the car and next to him', s.dateGap < 4, s.dateGap.toFixed(1));
/* And he started beside it rather than twenty-two metres up the street welded
 * to its flank. `__spawn` is stamped by `arrive()` on the first frame, before
 * anything has had a chance to walk anywhere. */
const spawn = await page.evaluate(() => window.__silver.game.spawn);
check('he starts on the pavement beside the car, not walking up to it from somewhere else',
  spawn && spawn.toCar < 4 && spawn.toPark < 4 && spawn.feet > 0.1 && spawn.toHer < 3,
  JSON.stringify(spawn));
check('the wallet can pay for the evening',
  s.money >= 600, `$${s.money}`);

/* ---- the arrival has room ----
 * The car used to slide SIDEWAYS down the z axis and stop with its nose over
 * the kerb, on the pavement, in the canopy posts, with the pair of them
 * dropped between it and the rope. Parallel to the kerb, on the road, with
 * clear air around everybody. */
const kerbside = await page.evaluate(() => {
  const b = window.__silver;
  const box = new b.THREE.Box3().setFromObject(b.taxi.group);
  const p = b.player.position;
  const posts = [[-5.2, 38.2], [5.2, 38.2]];
  const d = b.date.position;
  return {
    carMinZ: +box.min.z.toFixed(2),
    onRoad: box.min.z > 38.5,
    longWays: (box.max.x - box.min.x) > (box.max.z - box.min.z),
    playerClear: !box.containsPoint(p),
    postGap: +Math.min(...posts.map(([px, pz]) => Math.min(
      Math.hypot(p.x - px, p.z - pz), Math.hypot(d.x - px, d.z - pz),
    ))).toFixed(2),
  };
});
check('the car parks parallel to the kerb, on the road, clear of the posts and the pair of them',
  kerbside.onRoad && kerbside.longWays && kerbside.playerClear && kerbside.postGap > 1,
  JSON.stringify(kerbside));

/* ---- the marquee is readable, measured rather than eyeballed ----
 * Bloom on, camera on the pavement where a person reads it, and the sign's
 * own screen rectangle sampled: it must be lit (mean well above the night
 * sky) and not blown to a flare (almost nothing at clipping white). */
const marquee = await page.evaluate(() => {
  const b = window.__silver;
  const T = b.THREE;
  const was = { x: b.player.position.x, z: b.player.position.z, yaw: b.player.yaw, pitch: b.player.pitch };
  b.player.mode = 'walk';
  b.player._tween = null;
  b.player.position.set(4, 1.66, 47);
  const to = new T.Vector3(0, 5.6, 34.45);
  const dir = to.clone().sub(b.player.position);
  b.player.yaw = Math.atan2(-dir.x, -dir.z);
  b.player.pitch = Math.atan2(dir.y - 1.66, Math.hypot(dir.x, dir.z));
  b.player.update(0.016);
  b.room.update(0.3, b.player.position);
  b.postfx.enable();
  b.postfx.render(0.016);
  const canvas = document.getElementById('scene');
  const c2 = document.createElement('canvas');
  c2.width = canvas.width; c2.height = canvas.height;
  const g = c2.getContext('2d');
  g.drawImage(canvas, 0, 0);
  const W = c2.width; const H = c2.height;
  const img = g.getImageData(0, 0, W, H).data;
  const cam = b.camera;
  cam.updateMatrixWorld();
  const corners = [[-5, 4.65, 34.45], [5, 6.55, 34.45]].map(([x, y, z]) => {
    const p = new T.Vector3(x, y, z).project(cam);
    return [Math.round((p.x * 0.5 + 0.5) * W), Math.round((-p.y * 0.5 + 0.5) * H)];
  });
  const x0 = Math.max(0, Math.min(corners[0][0], corners[1][0]));
  const x1 = Math.min(W, Math.max(corners[0][0], corners[1][0]));
  const y0 = Math.max(0, Math.min(corners[0][1], corners[1][1]));
  const y1 = Math.min(H, Math.max(corners[0][1], corners[1][1]));
  let blown = 0; let n = 0; let sum = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      sum += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
      n++;
      if (img[i] >= 250 && img[i + 1] >= 245 && img[i + 2] >= 230) blown++;
    }
  }
  b.postfx.disable();
  b.player.position.set(was.x, 1.8, was.z);
  b.player.yaw = was.yaw;
  b.player.pitch = was.pitch;
  b.player.update(0.016);
  return { n, mean: +(sum / Math.max(1, n)).toFixed(1), blownFrac: +(blown / Math.max(1, n)).toFixed(4) };
});
check('THE SILVER ROOM reads off its own marquee: lit, and not blown out by bloom',
  marquee.n > 400 && marquee.mean >= 30 && marquee.blownFrac <= 0.02,
  JSON.stringify(marquee));

/* ---- the driver ----
 * Through the conversation's own doubled-up option, because that is the only
 * elective generosity on the route and `Woo.GenerousTip` had nothing at all
 * that could fire it. The hold-to-tip interface is then tested doing the other
 * half of its job — refusing a second one — and pays out for fourteen other
 * people later in the kitchen.
 */
const drove = await page.evaluate(() => {
  const b = window.__silver;
  const before = b.game.money;
  const big = b.scripts.driver.open.options().find((o) => o.tone === '$80');
  const offered = !!big?.when?.();
  big?.effect?.();
  const once = { money: b.game.money, woo: b.woo.score, generous: b.woo.has('Woo.GenerousTip') };
  big?.effect?.();                             // try to farm it
  b.taxi.window.userData.interact.onUse();     // and the hold, on a man already looked after
  return { before, offered, once, after: b.game.money, wooAfter: b.woo.score };
});
check('tipping the driver costs money and pays Woo',
  drove.once.money === drove.before - 80 && drove.once.woo > 12,
  `$${drove.before} → $${drove.once.money}, woo ${drove.once.woo}`);
check('and handing him double is generous, which is its own small thing',
  drove.offered && drove.once.generous, JSON.stringify(drove.once));
check('and a second attempt pays nothing and costs nothing',
  drove.after === drove.once.money && drove.wooAfter === drove.once.woo,
  `$${drove.after}, woo ${drove.wooAfter}`);

/* ---- the car waits for the conversation ----
 * It used to go on a forty-five second timer started the moment control came
 * back, so reading her opening line and picking an answer cost you the driver,
 * the tip, the full-roster streak and a line of the ending card. Nothing on
 * screen said that was a clock.
 */
await tick(70, 0.5);
const stillThere = await page.evaluate(() => ({
  gone: window.__silver.debug.taxiGone(),
  prompt: !!window.__silver.taxi.window.userData.interact,
  state: window.__silver.mission.state,
}));
check('the car is still at the kerb a minute later, because nobody has walked away',
  !stillThere.gone && stillThere.prompt, JSON.stringify(stillThere));

/* ---- her question about the front door ---- */
await page.evaluate(() => {
  const b = window.__silver;
  b.dialogue.start(b.scripts.arrival, 'open', b.date.npc);
});
await tick(1);
check('she asks about the front entrance, and there are four answers',
  (await state()).options === 4, String((await state()).options));
await choose(0);
await tick(5);

/* ---- the route ----
 * Along the front and in at the alley mouth, which is what ROUTE does. Cutting
 * the corner from (20,38) to (34,26) crosses the yard between the frontage and
 * the alley wall, where there is no room at all — so the room log read
 * street → outside → alley and she was left behind in the gap. */
await walkTo(22, 37.5);
await walkTo(33, 36);
await walkTo(34, 30);
await walkTo(34, 26);
s = await state();
check('the alley starts the service route', s.mission === 'service-route', s.mission);
check('she came down the alley too', s.dateRoom === 'alley' || s.dateGap < 6,
  `${s.dateRoom}, ${s.dateGap.toFixed(1)}m`);

const drovOff = await page.evaluate(() => ({
  gone: window.__silver.debug.taxiGone(),
  prompt: !!window.__silver.taxi.window.userData.interact,
}));
check('and once he has walked off the car goes, and takes its prompt with it',
  drovOff.gone && !drovOff.prompt, JSON.stringify(drovOff));

await page.evaluate(() => window.__silver.room.doors.service.toggle());
await walkTo(34, 13.5);
await walkTo(31.6, 11.7);
await walkTo(28.4, 11.7);    // through the service door onto the landing
await walkTo(20, 11.5);
await walkTo(15.6, 10.6);    // the full length of the ramp
await walkTo(15.9, 8);
s = await state();
check('the ramp puts him underground', s.mission === 'cellar' && s.room === 'cellar',
  `${s.mission} / ${s.room}`);
/* Get in front of her on purpose, then stand still.
 *
 * This used to happen by itself, because she could not get down the ramp
 * without being teleported and arrived late every single run — so the point
 * for waiting was collected by accident, by a player who had not waited for
 * anything. Now that she walks it, the gap never opens unless he opens it, and
 * the only honest way to test "he stopped and she arrived" is to put her a
 * flight of ramp behind him and let her walk down. */
await page.evaluate(() => {
  const b = window.__silver;
  /* Back in the alley: the point needs 2.4 seconds of open gap before it will
   * pay, and she walks the ramp down in less than that. */
  const n = b.room.ROUTE[5];
  b.date.at = 5;
  b.date.group.position.set(n.x, b.room.groundAt(n.x, n.z, n.y ?? 0), n.z);
  b.date._lastPos.copy(b.date.group.position);
});
const caughtUp = await waitForHer(25);
await tick(4, 0.1);                               // and he is still standing there
const her = await page.evaluate(() => {
  const b = window.__silver;
  return {
    x: +b.date.position.x.toFixed(1), y: +b.date.position.y.toFixed(1),
    z: +b.date.position.z.toFixed(1), at: b.date.at, stuck: +b.date._stuck.toFixed(1),
    room: b.room.roomAt(b.date.position.x, b.date.position.z, b.date.position.y),
  };
});
check('and she followed him down the ramp and caught up', caughtUp < 3,
  `${caughtUp.toFixed(1)}m — she is ${JSON.stringify(her)}`);
/* Standing still until she arrives is a thing the player does deliberately and
 * the table had a point in it for — with nothing anywhere that fired it. */
check('stopping and letting her catch up is worth the point it is worth',
  await page.evaluate(() => window.__silver.woo.has('Woo.WaitedForDate')), '');
console.log('    rooms:', (await page.evaluate(() => window.__roomLog)).join(' → '));
check('the cellar floor is only the cellar floor to somebody already down there',
  await page.evaluate(() => {
    const g = window.__silver.room.groundAt;
    return g(22, 1, -2.9) < -2 && g(22, 1, 0) === 0;
  }), 'the kitchen is directly above it');

/* Every doorway on the route, which is where a follower dies. */
await walkTo(23.5, 1.5);
await walkTo(25.4, -3);
await walkTo(24.4, -9);      // through the cellar wall into the walk-in
await walkTo(19.6, -10);     // and the walk-in door into the dry store
await walkTo(19.8, -5);      // and back into the cellar
await walkTo(15.9, -1.2);
await walkTo(18, 1);
await walkTo(20.8, 1);       // back up the other ramp
await walkTo(22.5, -3);
s = await state();
check('the ramp brings him back up to the kitchen',
  s.mission === 'kitchen' && Math.abs(await page.evaluate(() => window.__silver.player.position.y - 1.66)) < 0.4,
  /* Room and height as well as mission state: "cellar" on its own cannot tell
   * a ramp that refused to climb from a room change that never fired. */
  `${s.mission} — ${s.room} at ${(await page.evaluate(() => window.__silver.player.position.y - 1.66)).toFixed(2)}, `
    + `rooms ${(await page.evaluate(() => window.__roomLog.slice(-4))).join(' → ')}`);
const afterRamps = await waitForHer();
check('she is still with him after four doorways and two ramps',
  afterRamps < 3, `${afterRamps.toFixed(1)}m`);

/* ---- the controller has to walk it, not be placed on it ----
 * Everything above moves the player by setting his position, which is the
 * only way to drive a first-person game headlessly and also the reason this
 * check has to exist: setting position.y hides the question of whether the
 * *controller* can get down there. It eases its ground height and resolves
 * collision, and either of those can refuse a ramp. So: put him at the top,
 * give him nothing but x and z, and see where his feet end up.
 */
const walked = await page.evaluate(() => {
  const b = window.__silver;
  b.game.drive = null;                 // the arrival tween would drag him back
  b.player.mode = 'walk';
  b.player._tween = null;
  b.player.position.set(34, 1.66, 20);
  b.player.ground = 0;
  const legs = [[34, 13.5], [31.6, 11.7], [26, 11.7], [20, 11.5], [15.6, 10.6], [15.9, 8], [20, 4]];
  const trace = [];
  let from = { x: 34, z: 20 };
  for (const [tx, tz] of legs) {
    for (let i = 1; i <= 60; i++) {
      const k = i / 60;
      b.player.position.x = from.x + (tx - from.x) * k;
      b.player.position.z = from.z + (tz - from.z) * k;
      b.player.update(0.05);           // and nothing else touches y
    }
    trace.push(`${tx},${tz}=${b.player.ground.toFixed(2)}`);
    from = { x: b.player.position.x, z: b.player.position.z };
  }
  return { trace, ground: b.player.ground, x: b.player.position.x, z: b.player.position.z };
});
check('the controller walks itself down the ramp into the cellar',
  walked.ground < -2.5 && Math.abs(walked.x - 20) < 0.8,
  walked.trace.join(' → '));

/* ---- and it does not put him back upstairs when he keeps walking ----
 *
 * The check above follows the route's own polyline, which turns south into
 * the cellar at the foot of the ramp. A player does not: he holds W, the ramp
 * takes him west and down, and he keeps going west. There was nothing at the
 * west end of the well — the cellar's below-grade wall stops at z=8.2, the
 * corridor's starts at y=0 and is skipped by anybody whose head is under it,
 * and `groundAt` answered street level for x<15 — so he crossed x=15 at feet
 * −2.9 and the floor-follow smoothing lifted him 2.9m onto the corridor
 * carpet beside the service bar. That is the whole back-of-house route gone,
 * and it passed every check in this file.
 *
 * So: keys, not assignment. Real collision, both descents, and back up.
 */
const descent = await page.evaluate(() => {
  const b = window.__silver;
  const p = b.player;
  for (const d of Object.values(b.room.doors)) if (!d.locked && !d.open) d.toggle();
  b.game.drive = null;
  const feet = () => p.position.y - p.eyeHeight;
  const at = () => b.room.roomAt(p.position.x, p.position.z, feet());
  /* Hold W and face a heading, exactly as a man playing it does. */
  const hold = (tx, tz, secs) => {
    p.mode = 'walk';
    p.enabled = true;
    p._tween = null;
    p.yawCenter = null;
    p.yaw = Math.atan2(-(tx - p.position.x), -(tz - p.position.z));
    p.clearKeys();
    p.setKey('KeyW', true);
    let jumped = 0;
    for (let t = 0; t < secs; t += 1 / 60) {
      const was = feet();
      p.update(1 / 60);
      if (Math.abs(feet() - was) > 0.12) jumped++;    // 7m/s of vertical: a pop
    }
    p.clearKeys();
    p.update(1 / 60);
    return jumped;
  };
  const place = (x, z) => { p.position.set(x, 1.66, z); p.ground = 0; p.update(0.016); };
  const was = { enabled: p.enabled, impair: p.impair, mode: p.mode };
  p.impair = 0;                                     // sober, so W means west
  const out = {};

  // (a) in at the service door and straight on down, without turning off
  place(33, 13);
  let pops = hold(29.8, 11.7, 3);
  pops += hold(14, 11.6, 10);
  out.alley = { x: +p.position.x.toFixed(2), feet: +feet().toFixed(2), room: at(), pops };

  // (b) and back up the way he came, on the same keys
  pops = hold(24, 11.6, 6) + hold(31, 11.7, 5);
  out.backUp = { x: +p.position.x.toFixed(2), feet: +feet().toFixed(2), room: at(), pops };

  // (c) the other descent: off the prep kitchen, down the well, keep going
  place(21.5, 1);
  pops = hold(14, 1, 9);
  out.kitchen = { x: +p.position.x.toFixed(2), feet: +feet().toFixed(2), room: at(), pops };
  // and up again into the prep kitchen
  pops = hold(23, 1, 8);
  out.upToPrep = { x: +p.position.x.toFixed(2), feet: +feet().toFixed(2), room: at(), pops };
  /* Put him back where the route driver left him, so the rest of the evening
   * carries on from the kitchen rather than from wherever this finished. */
  p.clearKeys();
  p.impair = was.impair;
  p.enabled = was.enabled;
  p.mode = was.mode;
  place(20, 4);
  return out;
});
check('walking the descent on the keys ends up in the cellar, not back beside the bar',
  descent.alley.feet < -2.4 && ['stair', 'cellar'].includes(descent.alley.room)
    && descent.alley.pops === 0
    && descent.kitchen.feet < -2.4 && ['cellar', 'drystore'].includes(descent.kitchen.room)
    && descent.kitchen.pops === 0,
  `${JSON.stringify(descent.alley)} / ${JSON.stringify(descent.kitchen)}`);
check('and he can walk back up out of it the same way',
  descent.backUp.feet > -0.4 && ['stair', 'alley'].includes(descent.backUp.room)
    && descent.upToPrep.feet > -0.4 && ['prep', 'kitchen'].includes(descent.upToPrep.room),
  `${JSON.stringify(descent.backUp)} / ${JSON.stringify(descent.upToPrep)}`);

/* ---- and nowhere below grade hands a man a floor over his head ----
 *
 * The stairwell was one instance of a class: a ramp is a floor to the man on
 * it and a ceiling to the man under it, and `groundAt` could not tell them
 * apart. Flood the back of house on a 100mm grid carrying the height each
 * cell is actually stood at — which is the one thing the two-level flood at
 * the top of this file cannot do, because it fixes a height per level — and
 * require that nothing reachable ever lifts him more than a step. Anything
 * that does is a teleport with a slope drawn on it.
 */
const lifts = await page.evaluate(() => {
  const b = window.__silver;
  const room = b.room;
  const EYE = 1.66; const RADIUS = 0.30; const STEP_UP = 1.0;
  const blocking = (x, z, feet) => room.colliders.some((c) => {
    if (feet + EYE + 0.05 < c.min.y || feet > c.max.y) return false;
    const cx = Math.max(c.min.x, Math.min(x, c.max.x));
    const cz = Math.max(c.min.z, Math.min(z, c.max.z));
    return Math.hypot(x - cx, z - cz) < RADIUS;
  });
  const CELL = 0.1; const X0 = 13; const Z0 = -17; const NX = 180; const NZ = 340;
  const at = (i, j) => i * NZ + j;
  const H = new Float32Array(NX * NZ).fill(NaN);
  const si = Math.round((22 - X0) / CELL); const sj = Math.round((1 - Z0) / CELL);
  H[at(si, sj)] = room.groundAt(22, 1, -2.9);
  const q = [[si, sj]];
  const found = [];
  while (q.length) {
    const [i, j] = q.pop();
    const y = H[at(i, j)];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di; const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const nx = X0 + ni * CELL; const nz = Z0 + nj * CELL;
      const ny = room.groundAt(nx, nz, y);
      if (blocking(nx, nz, ny)) continue;
      if (ny - y > STEP_UP + 1e-6) {
        found.push(`${nx.toFixed(1)},${nz.toFixed(1)}: ${y.toFixed(2)}→${ny.toFixed(2)}`);
        continue;
      }
      if (!Number.isNaN(H[at(ni, nj)])) continue;
      H[at(ni, nj)] = ny;
      q.push([ni, nj]);
    }
  }
  let cells = 0; let top = -9; let bottom = 9;
  for (let k = 0; k < H.length; k++) {
    if (Number.isNaN(H[k])) continue;
    cells++; top = Math.max(top, H[k]); bottom = Math.min(bottom, H[k]);
  }
  return { cells, top: +top.toFixed(2), bottom: +bottom.toFixed(2), found: found.slice(0, 6), n: found.length };
});
check('nothing a man can walk to below grade lifts him more than a step',
  lifts.n === 0 && lifts.bottom < -2.8 && lifts.top > -0.1 && lifts.cells > 20000,
  lifts.n ? `${lifts.n} lifts, e.g. ${lifts.found.join('; ')}` : `${lifts.cells} cells, ${lifts.bottom}..${lifts.top}`);

/* ---- the hazard, and the kitchen ---- */
const hazard = await page.evaluate(() => {
  const b = window.__silver;
  let pad = null;
  b.scene.traverse((o) => {
    const l = o.userData?.interact?.label;
    const text = typeof l === 'function' ? l() : l;
    if (text && String(text).includes('Put a hand out')) pad = o;
  });
  if (!pad) return { found: false };
  const before = b.woo.score;
  pad.userData.interact.onUse();
  const after = b.woo.score;
  pad.userData.interact.onUse();
  return { found: true, before, after, again: b.woo.score };
});
check('there is a hazard on the line worth getting her round',
  hazard.found && hazard.after > hazard.before, JSON.stringify(hazard));
check('and it cannot be farmed', hazard.again === hazard.after, String(hazard.again));

/* ---- tip the back of house ---- */
const tipEveryone = () => page.evaluate(() => {
  const b = window.__silver;
  const before = b.game.money;
  for (const npc of Object.values(b.cast.byName)) npc.group.userData?.interact?.onUse?.();
  return {
    spent: before - b.game.money,
    tips: b.woo.tipCount,
    left: b.woo.tipsLeft,
    streak: b.woo.streakClosed,
    woo: b.woo.score,
  };
});
let tipped = await tipEveryone();
check('the back of house can be looked after on the way through',
  tipped.tips >= 8, `${tipped.tips} so far`);
check('and it cost real money', tipped.spent > 200, `$${tipped.spent}`);

const farm = await page.evaluate(() => {
  const b = window.__silver;
  const before = { money: b.game.money, woo: b.woo.score };
  for (let i = 0; i < 3; i++) {
    for (const npc of Object.values(b.cast.byName)) npc.group.userData?.interact?.onUse?.();
  }
  return { before, money: b.game.money, woo: b.woo.score };
});
check('Woo cannot be farmed by tipping the room again',
  farm.money === farm.before.money && farm.woo === farm.before.woo,
  `$${farm.money}, woo ${farm.woo}`);

/* ---- the corridor and the floor ---- */
await walkTo(27.6, -8.9);
await walkTo(28.4, -14);
await walkTo(25.2, -17.4);
await walkTo(17.2, -14.2);
await walkTo(16.2, -8.6);    // round the west end of the line
await walkTo(14, -7.9);      // and out through the swing doors
await walkTo(12.5, 4);
check('the corridor is on the way', (await state()).mission === 'corridor', (await state()).mission);
await walkTo(12.3, 22);
await walkTo(7.5, 24);
s = await state();
check('and it comes out on the floor of the club', s.mission === 'host', s.mission);
const pace = await page.evaluate(() => ({
  kept: window.__silver.woo.has('Woo.KeptPace'),
  left: window.__silver.mission.flags.abandonments,
}));
check('walking the whole route without losing her once pays, and losing her forfeits it',
  pace.kept === (pace.left === 0), `kept ${pace.kept}, left behind ${pace.left}×`);
check('no loading screen anywhere between the alley and the room',
  await page.evaluate(() => !document.getElementById('blackout')?.classList.contains('on')), '');

/* ---- cutscene one ---- */
const beforeTable = await page.evaluate(() => window.__silver.room.frontTable.group.visible);
await walkTo(2.2, 23.4);
await tick(1);
check('walking up to the host station starts the table scene',
  (await state()).scene === true && !beforeTable, String((await state()).scene));

/* ---- the whole scene, with the camera under surveillance ----
 * Two things the playtest saw and a state assertion cannot: every later shot
 * used to begin by teleporting the camera back to where the player had been
 * standing (a visible cut), and the camera left the host/manager exchange for
 * the empty carpet half a second before "Front and center" landed. So: no
 * single step may move the camera like a cut, and at the nine-second mark it
 * must still be looking at the host station, not the table spot. */
const cut = await page.evaluate(() => {
  const b = window.__silver;
  const A = b.room.anchors;
  let t = 0;
  let maxStep = 0;
  let yawAtNine = null;
  const last = b.player.position.clone();
  for (let i = 0; i < 120; i++) {
    const st = 0.25;
    b.player.update(st);
    if (b.game.drive) b.game.drive(st);
    if (b.game.scene) b.game.scene.update(st);
    b.room.update(st, b.player.position);
    b.dialogue.update(st, b.player.position);
    b.date.update(st, b.player.position, b.player.yaw);
    b.performance.update(st);
    b.mission.update(st, { trailing: b.date.isTrailing });
    b.__zones();
    b.__seatTick(st);
    b.__host();
    b.__evening(st);
    t += st;
    if (i > 0) maxStep = Math.max(maxStep, b.player.position.distanceTo(last));
    last.copy(b.player.position);
    /* On the SCENE's clock, not the loop's — the scene was already a second
     * old when this loop picked it up. */
    if (yawAtNine === null && b.game.scene && b.game.scene.t >= 8.6 && b.game.scene.t < 9.2) {
      const want = Math.atan2(-(A.host.x - 1.2 - b.player.position.x), -(A.host.z - 0.3 - b.player.position.z));
      yawAtNine = Math.abs(Math.atan2(Math.sin(b.player.yaw - want), Math.cos(b.player.yaw - want)));
    }
  }
  return { maxStep: +maxStep.toFixed(2), yawAtNine: yawAtNine === null ? null : +yawAtNine.toFixed(2) };
});
check('the camera never cuts mid-scene, and holds the host while the manager overrules him',
  cut.maxStep < 2.0 && cut.yawAtNine !== null && cut.yawAtNine < 0.6,
  `worst step ${cut.maxStep}m, ${cut.yawAtNine} rad off the host at 9s`);
s = await state();
check('the scene ends and gives control back', s.scene === false && s.mission === 'seating', s.mission);

const table = await page.evaluate(() => {
  const b = window.__silver;
  const g = b.room.frontTable.group;
  const want = b.room.anchors.frontTable;
  return {
    visible: g.visible,
    at: [g.position.x, g.position.z],
    want: [want.x, want.z],
    chairs: b.room.frontTable.chairs.filter((c) => c.visible).length,
    /* The one thing that must be true: there is exactly one table object and
     * it is the one the staff carried. */
    count: (() => { let n = 0; b.scene.traverse((o) => { if (o.name === 'front-table') n++; }); return n; })(),
  };
});
check('the table is real, in place, and there is only one of it',
  table.visible && table.count === 1
    && Math.abs(table.at[0] - table.want[0]) < 0.1 && Math.abs(table.at[1] - table.want[1]) < 0.1,
  JSON.stringify(table));
check('with two chairs at it', table.chairs === 2, String(table.chairs));

/* ---- the two chairs ----
 *
 * Where the seats are and which way they point is the whole seated half of the
 * mission. They used to be one behind the other on the line from the table to
 * the stage, with the view pointed down it: she sat behind his head, outside the
 * yaw clamp, unlookable-at, for twenty minutes of conversation.
 */
const facing = await page.evaluate(() => {
  const b = window.__silver;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const [his, hers] = b.room.anchors.frontSeats;
  const stage = b.room.anchors.stageCentre;
  const toward = (t, from) => Math.atan2(-(t.x - from.x), -(t.z - from.z));
  return {
    range: 1.7,
    toHer: Math.abs(wrap(toward(hers, his) - his.faceYaw)),
    toStage: Math.abs(wrap(toward(stage, his) - his.faceYaw)),
    apart: Math.hypot(hers.x - his.x, hers.z - his.z),
  };
});
check('his chair looks at her, with the stage a turn away and still inside the clamp',
  facing.toHer < 0.2 && facing.toStage < facing.range && facing.apart > 1
    && facing.apart < 2.2,
  `she is ${facing.toHer.toFixed(2)} rad off centre, the stage ${facing.toStage.toFixed(2)} `
    + `of ${facing.range}, ${facing.apart.toFixed(2)}m apart`);

/* ---- sitting down ----
 * Sitting down has to seat both of them. It used to seat only him unless the
 * optional chair-pull pad was used, so a player who simply sat down spent the
 * entire seated half of the evening talking to a woman standing beside the
 * table — and the harness never saw it, because the harness always pulled the
 * chair first.
 */
const satAlone = await page.evaluate(() => {
  const b = window.__silver;
  b.player.position.set(b.room.anchors.frontTable.x + 1.2, 1.66, b.room.anchors.frontTable.z + 1.2);
  b.game.chairPads.his.userData.interact.onUse();
  return { seated: b.game.seated, dateMode: b.date.mode, sitting: !!b.date.npc.seated,
    chairPulled: b.mission.flags.chairPulled };
});
check('sitting down puts her in the other chair, with no chair-pull involved',
  satAlone.seated && satAlone.dateMode === 'seated' && satAlone.sitting
    && !satAlone.chairPulled, JSON.stringify(satAlone));

/* Both of them back on their feet, so the optional pad is tested doing what it
 * is for rather than re-seating somebody already sitting. */
const chair = await page.evaluate(() => {
  const b = window.__silver;
  b.game.chairPads.his.userData.interact.onUse();       // he stands
  b.date.standFrom({ x: b.room.anchors.frontTable.x + 1.4, z: b.room.anchors.frontTable.z + 1.6 });
  b.date.follow();
  b.player.position.set(b.room.anchors.frontTable.x + 1.2, 1.66, b.room.anchors.frontTable.z + 1.2);
  const before = b.woo.score;
  b.game.chairPads.her.userData.interact.onUse();
  return { before, after: b.woo.score, dateMode: b.date.mode };
});
check('pulling her chair out is worth something, and sits her down',
  chair.after > chair.before && chair.dateMode === 'seated', JSON.stringify(chair));

await page.evaluate(() => window.__silver.game.chairPads.his.userData.interact.onUse());
await tick(2.5, 0.1);
s = await state();
check('and he can sit down opposite her', s.seated === true && s.mission === 'round-one', s.mission);

/* ---- the lamp does not outshine her, measured in rendered pixels ----
 * The wave-2 note: table lamps glaring under bloom, Margo invisible across
 * the table. So: bloom ON, the camera in his chair exactly as he sits, one
 * frame rendered and read back. The glare is counted (pixels at clipping
 * white — the old lamp scorched its own shade and the cloth into a flare of
 * them) and her face is sampled where her head actually projects. */
const acrossTheTable = await page.evaluate(() => {
  const b = window.__silver;
  const T = b.THREE;
  b.player.update(0.016);
  b.room.update(0.3, b.player.position);
  for (const npc of b.cast.all) npc.update(0.05, b.player.position);
  b.date.update(0.05, b.player.position, b.player.yaw);
  b.postfx.enable();
  b.postfx.render(0.016);
  const canvas = document.getElementById('scene');
  const c2 = document.createElement('canvas');
  c2.width = canvas.width; c2.height = canvas.height;
  const g = c2.getContext('2d');
  g.drawImage(canvas, 0, 0);
  const W = c2.width; const H = c2.height;
  const img = g.getImageData(0, 0, W, H).data;
  let clipped = 0;
  for (let i = 0; i < img.length; i += 4) {
    if (img[i] >= 250 && img[i + 1] >= 245 && img[i + 2] >= 235) clipped++;
  }
  const cam = b.camera;
  cam.updateMatrixWorld();
  const head = new T.Vector3();
  b.date.npc.parts.head.getWorldPosition(head);
  head.y += 0.16;
  const p = head.clone().project(cam);
  const px = Math.round((p.x * 0.5 + 0.5) * W);
  const py = Math.round((-p.y * 0.5 + 0.5) * H);
  let herSum = 0; let herN = 0;
  for (let y = Math.max(0, py - 10); y < Math.min(H, py + 10); y++) {
    for (let x = Math.max(0, px - 8); x < Math.min(W, px + 8); x++) {
      const i = (y * W + x) * 4;
      herSum += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
      herN++;
    }
  }
  b.postfx.disable();
  return {
    onScreen: p.z < 1 && px >= 0 && px < W && py >= 0 && py < H,
    clippedFrac: +(clipped / (W * H)).toFixed(4),
    her: +(herSum / Math.max(1, herN)).toFixed(1),
  };
});
check('with bloom on, the table lamp does not glare and she is visible across the table',
  acrossTheTable.onScreen && acrossTheTable.clippedFrac <= 0.004
    && acrossTheTable.her >= 40 && acrossTheTable.her <= 245,
  `clipped ${(acrossTheTable.clippedFrac * 100).toFixed(2)}% of the frame, her face at `
    + `${acrossTheTable.her}/255`);

/* ---- the conversation ---- */
await tick(2);
check('sitting down starts her talking', (await state()).options > 0, String((await state()).options));
await choose(0);
await tick(6);

/* Drive the whole seated queue: every round, always taking the first answer.
 * Nothing is skipped and nothing is forced -- this is the queue running at its
 * own pace with somebody pressing 1 every time it stops. */
let sawShowScene = false;
let sawDrinks = false;
for (let i = 0; i < 140; i++) {
  const st = await state();
  if (st.flags.drinkOrdered) sawDrinks = true;
  if (st.scene && st.flags.showStarted === false && sawDrinks) sawShowScene = true;
  if (st.mission === 'performance') break;
  if (st.options > 0) await choose(0);
  else await tick(6, 0.5);
}
s = await state();
check('the whole roster, front and back, can be looked after',
  s.tipsLeft <= 1, `${s.tips} tipped, ${s.tipsLeft} left`);
check('the drink order happens and she gets what she drinks',
  s.flags.drinkOrdered !== null, String(s.flags.drinkOrdered));
check('somebody from the family stops by the table',
  s.flags.familyMet?.length > 0 || s.flags.introducedAs !== null,
  JSON.stringify({ met: s.flags.familyMet, as: s.flags.introducedAs }));
check('the champagne arrives from the table by the pillar',
  s.flags.champagneSent === true, String(s.flags.champagneSent));

/* ---- "funny how?" ----
 * Reached by taking the first answer every time, which is the point: the
 * homage is on the main line of the conversation, not down a branch. */
check('the "you\'re funny" exchange happened and the room went quiet',
  s.flags.funnyHow === true, String(s.flags.funnyHow));
check('and breaking the tension paid',
  await page.evaluate(() => window.__silver.woo.has('Woo.FunnyHowSuccess')));

/* ---- everybody who came to the table has gone home again ----
 * The ape used to be parked at the waiter's own mark for the rest of the
 * night — his conversation was started around `greet`, so its end never knew
 * whose walk home to run — and the next waiter was summoned into the space
 * he was standing in. */
const visitors = await page.evaluate(() => {
  const b = window.__silver;
  const ape = b.cast.byName.ape;
  const w = b.cast.byName.waiter;
  return {
    apeHome: ape.homeSeat
      ? +Math.hypot(ape.group.position.x - ape.homeSeat.x, ape.group.position.z - ape.homeSeat.z).toFixed(2)
      : null,
    apeJob: ape.job,
    waiterJob: w.job,
    waiterHasRound: !!w.route,
  };
});
check('the ape is back at his own table and the waiter back on his round',
  visitors.apeHome !== null && visitors.apeHome < 0.5 && visitors.apeJob === 'sit'
    && visitors.waiterJob === 'patrol' && visitors.waiterHasRound,
  JSON.stringify(visitors));

/* ---- cutscene two ---- */
check('the lights going down is the second scene, and it ran on its own',
  sawShowScene, sawShowScene ? 'reached on its own clock' : 'never saw the scene');
await tick(16, 0.25);
s = await state();
check('the band arrives and control comes back at the table',
  s.mission === 'performance' && s.scene === false && s.seated === true, s.mission);
const showState = await page.evaluate(() => {
  const b = window.__silver;
  return {
    playing: b.performance.playing,
    visible: b.band.members.filter((m) => m.group.visible).length,
    curtain: b.room.lighting.stage,
    house: b.room.lighting.house,
    /* The lamps near you stay lit when the house goes down — that is the
     * whole look of the second half. The ones across the room are switched
     * off by the pool, which is a performance decision and invisible: what
     * you see at that distance is the emissive shade, not the light. */
    lampsNear: b.room.lamps.filter((l) => l.light.intensity > 0).length,
    lampsTotal: b.room.lamps.length,
    lights: (() => { let n = 0; b.scene.traverse((o) => { if (o.isLight && o.intensity > 0) n++; }); return n; })(),
  };
});
check('seven of them, on stage, with the house down and the near table lamps still lit',
  showState.playing && showState.visible === 7 && showState.lampsNear > 0,
  JSON.stringify(showState));

/* ---- and they perform ----
 * The wave-2 note: the performers "just shake and face the wrong way". They
 * were built at yaw π — pointed at the back wall — with the bar-wipe idle
 * loop re-posing their arms twenty times a second underneath the show
 * animation. Facing the room now, with instrument poses that the frame order
 * lets stand: horns at the mouth, a bass worked, brushes trading, a leader
 * out front with the mic. */
const stagecraft = await page.evaluate(() => {
  const b = window.__silver;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const members = b.band.members.map((m) => ({
    holds: m.holds,
    yaw: +wrap(m.group.rotation.y).toFixed(2),
    job: m.job,
    foreL: +m.parts.foreL.rotation.x.toFixed(2),
    armR: +m.parts.armR.rotation.x.toFixed(2),
  }));
  return {
    facing: members.every((m) => Math.abs(m.yaw) < 0.9),
    noWipers: members.every((m) => m.job !== 'work'),
    hornsUp: members.filter((m) => m.holds === 'horn').every((m) => m.foreL < -1.0),
    leadWorking: (() => {
      const l = members.find((m) => m.holds === 'lead');
      return !!l && l.armR < -0.2;
    })(),
    members,
  };
});
check('the band faces the audience and plays its instruments rather than shaking',
  stagecraft.facing && stagecraft.noWipers && stagecraft.hornsUp && stagecraft.leadWorking,
  JSON.stringify({ facing: stagecraft.facing, noWipers: stagecraft.noWipers,
    hornsUp: stagecraft.hornsUp, lead: stagecraft.leadWorking }));

/* A cutscene takes her over, and the end of one used to hand her back to
 * `follow` unconditionally — so the champagne stood her up out of her chair for
 * the rest of the evening, and the moment the band arrived she got up and walked
 * away from the table she had just said "oh, they're real" at. */
const stillSitting = await page.evaluate(() => {
  const b = window.__silver;
  const seat = b.room.anchors.frontSeats[1];
  return {
    mode: b.date.mode,
    sitting: !!b.date.npc.seated,
    off: Math.hypot(b.date.position.x - seat.x, b.date.position.z - seat.z),
  };
});
check('and both cutscenes leave her in her chair rather than on her feet',
  stillSitting.mode === 'seated' && stillSitting.sitting && stillSitting.off < 0.2,
  JSON.stringify(stillSitting));
check('and the light budget stays sane in a room with eighty fittings in it',
  showState.lights <= 45 && showState.lampsNear < showState.lampsTotal,
  `${showState.lights} live lights, ${showState.lampsNear}/${showState.lampsTotal} lamps`);

/* ---- the things the evening still has in it after the band ---- */
const afterBand = await page.evaluate(() => {
  const b = window.__silver;
  const out = {};
  // The champagne thank-you: one look and one press, and it is worth something.
  let pad = null;
  b.scene.traverse((o) => {
    const l = o.userData?.interact?.label;
    const t = typeof l === 'function' ? l() : l;
    if (t && String(t).includes('pillar')) pad = o;
  });
  out.foundPillar = !!pad;
  if (pad) {
    const before = b.woo.score;
    pad.userData.interact.onUse();
    pad.userData.interact.onUse();            // and only once
    out.thanked = b.mission.flags.champagneThanked;
    out.gain = b.woo.score - before;
  }
  return out;
});
check('the table by the pillar can be thanked, once',
  afterBand.foundPillar && afterBand.thanked && afterBand.gain > 0,
  JSON.stringify(afterBand));

await page.evaluate(() => window.__silver.dialogue.end());
await page.evaluate(() => window.__silver.debug.toast());
await tick(1);
check('there is a toast, and it has options', (await state()).options >= 3,
  String((await state()).options));
await choose(0);
await tick(4);
check('and making one is worth something', (await state()).flags.toast !== null,
  String((await state()).flags.toast));

/* ---- the sway ----
 *
 * Driven through `startSway()` and the real key handler, which is the whole
 * point. Starting the minigame by hand — which is what this used to do — tested
 * four lines of `Sway` and nothing else, and hid the fact that the dance was
 * unstartable: the latch went up nine hundred milliseconds before the first bar,
 * the frame loop judged it lost on the next frame, and `Woo.SwayCompleted` was
 * unreachable by any route a player could take.
 */
await page.evaluate(() => {
  const b = window.__silver;
  b.dialogue.end();
  b.settings.assist = true;                    // the wide window, not the tight one
});
await page.evaluate(() => window.__silver.debug.sway());
await tick(0.6, 0.1);
const swayPending = await page.evaluate(() => {
  const b = window.__silver;
  return {
    swayed: b.mission.flags.swayed, state: b.mission.state,
    running: b.game.swayRunning, starting: b.game.swayStarting, active: b.sway.active,
  };
});
/* `starting` OR `running`, because the nine hundred milliseconds are a real
 * setTimeout and the round trips above are real milliseconds: on a machine
 * drawing every pixel on the CPU the pre-roll is often over before this can
 * ask, and the check failed two runs in three for a game that was behaving.
 * The bug it is for is not the pre-roll elapsing — it is the dance being
 * *judged* during it, and that shows up as `swayed` set, or as the latch up
 * with no minigame under it. Both are still assertions. */
check('getting up out of the chair is not itself a failed dance',
  swayPending.swayed === null && swayPending.state === 'sway'
    && (swayPending.starting || (swayPending.running && swayPending.active)),
  JSON.stringify(swayPending));

await page.waitForTimeout(1100);               // the band gets to the bar, on a real clock
const swayLive = await page.evaluate(() => ({
  active: window.__silver.sway.active,
  running: window.__silver.game.swayRunning,
  bar: !!window.__silver.sway.view,
}));
check('and then there is a dance, running, with a bar to hit',
  swayLive.active && swayLive.running && swayLive.bar, JSON.stringify(swayLive));

/* The four bars, in one pass in the page.
 *
 * One pass because the real frame loop is running in there: a press per round
 * trip leaves twenty milliseconds of animation frames between each one, the
 * timing bar moves on, and the beat you were aiming at goes by unplayed. The
 * presses themselves are real keydowns through the real handler — the pinning
 * of `t` is the metronome standing still, not the input being faked. */
const swayPlay = await page.evaluate(() => {
  const b = window.__silver;
  const E = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  };
  b.sway.t = b.sway.beatLength * 0.5;             // dead on the first beat
  for (let i = 0; i < 6; i++) E();                // and mash it
  const mashed = {
    hits: b.sway.hits, misses: b.sway.misses, beat: b.sway.beat, active: b.sway.active,
  };
  for (let k = 1; k < 4; k++) {
    b.sway.t = b.sway.beatLength * (k + 0.5);
    E();
  }
  return {
    mashed,
    hits: b.sway.hits, misses: b.sway.misses, result: b.sway.result,
    active: b.sway.active, swayed: b.mission.flags.swayed,
    completed: b.woo.has('Woo.SwayCompleted'),
  };
});
check('six presses inside one beat is one judgement, not four hits and an early finish',
  swayPlay.mashed.hits === 1 && swayPlay.mashed.misses === 0
    && swayPlay.mashed.beat === 1 && swayPlay.mashed.active,
  JSON.stringify(swayPlay.mashed));
check('four beats on the beat is a dance, and it pays',
  swayPlay.hits === 4 && swayPlay.misses === 0 && swayPlay.result === 'good'
    && !swayPlay.active && swayPlay.swayed === 'good' && swayPlay.completed,
  JSON.stringify(swayPlay));

await page.waitForTimeout(3500);
await tick(1, 0.25);
const backAtTable = await page.evaluate(() => {
  const b = window.__silver;
  return {
    state: b.mission.state, seated: b.game.seated,
    dateMode: b.date.mode, hers: !!b.date.npc.seated, running: b.game.swayRunning,
  };
});
check('and it puts the evening back somewhere the rest of it is written for',
  backAtTable.state === 'performance' && backAtTable.seated
    && backAtTable.dateMode === 'seated' && !backAtTable.running,
  JSON.stringify(backAtTable));

/* Which is the thing that actually broke: stuck in `sway`, she stopped being
 * able to notice being kept waiting, for the rest of the mission. */
const impatience = await page.evaluate(() => {
  const b = window.__silver;
  const heard = [];
  const real = b.mission.hooks.onImpatient;
  b.mission.hooks.onImpatient = (key, st) => { heard.push(`${key}@${st}`); };
  b.mission.inState = 74;
  b.mission._impatient = 0;
  for (let i = 0; i < 20; i++) b.mission.update(0.5, { trailing: false });
  b.mission.hooks.onImpatient = real;
  return { heard, state: b.mission.state };
});
check('so she starts noticing being kept waiting again',
  impatience.heard.length > 0, `${impatience.state}: ${impatience.heard.join(', ') || 'silence'}`);

/* ---- the set ends ----
 * It used to wrap round to the top and play forever, so the third number — the
 * one three separate people tell you is *the* one — came round again, and with
 * it the callback, the toast and another offer to dance.
 */
for (let i = 0; i < 7; i++) {
  if (await page.evaluate(() => window.__silver.performance.setEnded)) break;
  await page.evaluate(() => {
    const p = window.__silver.performance;
    if (p.current) p.t = p.current.dur + 0.05;
  });
  await tick(0.4, 0.2);
  await page.waitForTimeout(2600);
}
const setEnd = await page.evaluate(() => {
  const b = window.__silver;
  return {
    ended: b.performance.setEnded, playing: b.performance.playing,
    played: b.performance.numbersPlayed.slice(),
    theOne: b.performance.numbersPlayed.filter((n) => n === 'third').length,
  };
});
check('the band play their four numbers, once each, and then the set is over',
  setEnd.ended && !setEnd.playing && setEnd.played.length === 4 && setEnd.theOne === 1,
  setEnd.played.join(' → '));

/* ---- a conversation talked over is ended, not orphaned ----
 * `dialogue.start` on top of a live conversation never fired the old one's
 * onEnd, so a waiter summoned to the table and then talked past kept his
 * post there for the night. Greeting anybody now closes the open
 * conversation through its own cleanup first. */
const orphan = await page.evaluate(() => {
  const b = window.__silver;
  b.dialogue.end();
  b.debug.waiter();
  const during = { job: b.cast.byName.waiter.job, active: b.dialogue.active };
  b.cast.byName.smoker.group.userData.interact.onUse();
  return {
    during,
    after: { job: b.cast.byName.waiter.job, hasRound: !!b.cast.byName.waiter.route },
  };
});
check('a waiter talked past mid-service goes back to his round instead of haunting the table',
  orphan.during.job === 'stand' && orphan.during.active
    && orphan.after.job === 'patrol' && orphan.after.hasRound,
  JSON.stringify(orphan));

/* ---- finished conversations stay finished ----
 * The playtest's "talking loops": the coat check's Both answer looped back to
 * its own opening question, the waiter re-ran the drink order on every later
 * tap, the host re-ran "we're full" over a built table, and the bandleader
 * re-offered the one request. Each node is driven or read here in the state
 * the loop happened in. */
const loops = await page.evaluate(() => {
  const b = window.__silver;
  b.dialogue.end();
  const out = {};
  const cc = b.cast.byName.coatcheck;
  b.dialogue.start(b.scripts.coatcheck, 'open', cc);
  const both = b.dialogue.options.findIndex((o) => o.tone === 'Both');
  out.bothOffered = both >= 0;
  b.dialogue.choose(both);
  for (let t = 0; t < 48; t++) b.dialogue.update(0.25, cc.group.position);
  out.coatEnds = !b.dialogue.active;
  out.reorderTones = b.scripts.waiter.open.options().map((o) => o.tone);
  out.hostLine = b.scripts.host.open.line();
  const hadRequest = b.mission.flags.songRequested;
  b.mission.flags.songRequested = hadRequest || 'horns';
  out.leadTones = b.scripts.bandleader.open.options().map((o) => o.tone);
  b.mission.flags.songRequested = hadRequest;
  return out;
});
check('finished conversations stay finished: coats, drink order, the book, the one request',
  loops.bothOffered && loops.coatEnds
    && !loops.reorderTones.includes('Remember')
    && !loops.hostLine.includes('full')
    && !loops.leadTones.includes('Her band'),
  JSON.stringify(loops));

/* ---- checkpoint reload cannot pay a tip twice, and puts the evening back ----
 *
 * It used to save the flags, the money and the score, and drop the mission
 * state, the rounds already had, whether he was sitting down and every latch in
 * main.js — so a "restored" evening came back with the right number over a
 * mission that thought it was still standing on the pavement. Scramble
 * everything the checkpoint claims to own, and see what comes back.
 */
const reload = await page.evaluate(() => {
  const b = window.__silver;
  const snap = (x) => ({
    woo: x.woo.score, tips: x.woo.tipCount, money: x.game.money,
    state: x.mission.state, rounds: [...x.mission.roundsDone].sort().join(','),
    objectives: x.mission.objectives.length, ledger: x.woo.ledger.length,
    seated: x.game.seated, swayed: x.mission.flags.swayed, hers: x.date.mode,
  });
  b.dialogue.end();
  const cp = b.debug.save();
  const before = snap(b);
  b.woo.score = 3;
  b.woo.ledger.length = 0;
  b.woo.fired.delete('Woo.CookTipped');
  b.mission.state = 'arrived';
  b.mission.roundsDone.clear();
  b.mission.objectives.length = 0;
  b.mission.flags.swayed = null;
  b.game.seated = false;
  b.game.money = 7;
  b.date.follow();
  b.debug.load();
  const after = snap(b);
  // And then try to be paid again for everything already on the ledger
  for (const npc of Object.values(b.cast.byName)) npc.group.userData?.interact?.onUse?.();
  return { cp: !!cp, before, after, farmed: b.woo.score, saved: !!cp.mission };
});
check('a checkpoint restores the score and the ledger',
  reload.after.woo === reload.before.woo && reload.after.tips === reload.before.tips
    && reload.after.ledger === reload.before.ledger,
  JSON.stringify(reload.after));
const cpFields = ['state', 'rounds', 'objectives', 'seated', 'swayed', 'hers', 'money'];
const cpWrong = cpFields.filter((k) => reload.after[k] !== reload.before[k]);
check('and it round-trips the evening it claims to: state, rounds, chairs and all',
  reload.saved && cpWrong.length === 0,
  cpWrong.length
    ? cpWrong.map((k) => `${k}: ${reload.before[k]} → ${reload.after[k]}`).join('; ')
    : `${reload.after.state}, rounds ${reload.after.rounds || 'none'}, seated ${reload.after.seated}`);
check('and reloading does not let a tip pay out twice',
  reload.farmed === reload.after.woo, String(reload.farmed));

/* ---- the endings ---- */
const endings = await page.evaluate(() => {
  const { Mission } = window.__silver.mission.constructor
    ? { Mission: window.__silver.mission.constructor } : {};
  const out = {};
  const cases = [
    ['perfect', 98, 'perfect', { drinkOrdered: 'rye', funnyHow: true, invitation: 'callback' }],
    ['strong', 84, 'strong', { invitation: 'plain' }],
    ['good', 70, 'good', { invitation: 'plain' }],
    ['awkward', 45, 'bad', { invitation: 'plain' }],
    ['disaster', 20, 'disaster', { invitation: 'plain' }],
    ['gentleman', 72, 'good', { invitation: 'none' }],
    ['insult', 99, 'perfect', { invitation: 'transactional' }],
    ['from-a-distance', 60, 'decent', { chaos: 5, invitation: 'plain' }],
  ];
  for (const [name, score, band, flags] of cases) {
    const m = new Mission();
    Object.assign(m.flags, flags);
    out[name] = m.resolve(score, band);
  }
  return out;
});
const wanted = {
  perfect: 'perfect', strong: 'strong', good: 'good', awkward: 'awkward',
  disaster: 'disaster', gentleman: 'gentleman', insult: 'insult',
  'from-a-distance': 'from-a-distance',
};
const wrong = Object.entries(wanted).filter(([k, v]) => endings[k] !== v);
check('every ending resolves to the one it should', wrong.length === 0,
  wrong.map(([k, v]) => `${k}: wanted ${v}, got ${endings[k]}`).join('; '));

const cards = await page.evaluate((names) => names.filter((n) => !window.__silver.ENDINGS[n]),
  Object.keys(wanted));
check('and every one of them has a card written for it', cards.length === 0, cards.join(', '));

/* ---- money is not required to finish ---- */
const broke = await page.evaluate(() => {
  const b = window.__silver;
  b.game.money = 0;
  const before = b.woo.score;
  b.debug.resetTips();
  for (const npc of Object.values(b.cast.byName)) npc.group.userData?.interact?.onUse?.();
  return { woo: b.woo.score, before, money: b.game.money };
});
check('with an empty wallet nothing is charged and nothing is awarded',
  broke.money === 0, `$${broke.money}`);

/* ---- accessibility ---- */
const access = await page.evaluate(() => {
  const ids = ['opt-subs', 'opt-bigsubs', 'opt-shake', 'opt-assist'];
  const present = ids.filter((i) => document.getElementById(i)).length;
  const big = document.getElementById('opt-bigsubs');
  big.checked = true;
  big.dispatchEvent(new Event('change'));
  const applied = document.body.classList.contains('bigsubs');
  const stored = localStorage.getItem('squatch.bigsubs');
  big.checked = false;
  big.dispatchEvent(new Event('change'));
  return { present, applied, stored, cleared: !document.body.classList.contains('bigsubs') };
});
check('the accessibility switches exist, apply, and persist',
  access.present === 4 && access.applied && access.stored === '1' && access.cleared,
  JSON.stringify(access));
check('the dance timing can be widened',
  await page.evaluate(() => {
    const b = window.__silver;
    b.sway.start(false);
    const tight = b.sway.window;
    b.sway.start(true);
    return b.sway.window > tight;
  }), '');

/* ---- the debug panel is not in a shipped page ---- */
check('the dev panel is absent without ?dev',
  await page.evaluate(() => !document.getElementById('debug')), '');

/* ---- the invitation, and what "rushed" is measured against ----
 *
 * `Woo.InvitationRushed` fired on every single run of this mission, careful or
 * not, because the judgement read `inState` two nodes after the move into
 * `invitation` had reset it — so it was measuring how fast the player reads a
 * menu. The harness never saw it, because it called the ending resolver
 * directly and never once used the invitation the game offers.
 */
const asked = await page.evaluate(() => {
  const b = window.__silver;
  b.dialogue.end();
  b.mission.inState = 150;                     // he has sat through the show
  const opened = b.debug.invite();
  return {
    opened, state: b.mission.state, options: b.dialogue.options.length,
    askedAfter: b.mission.askedAfter, rushed: b.mission.rushedIt,
  };
});
check('the invitation comes up off the back of the evening, with a way out of it',
  asked.opened && asked.state === 'invitation' && asked.options >= 5,
  JSON.stringify(asked));
check('and a man who sat through the show has not rushed it',
  asked.rushed === false && asked.askedAfter >= 150, JSON.stringify(asked));

const rushing = await page.evaluate(() => {
  const Mission = window.__silver.mission.constructor;
  const fresh = (secs) => {
    const m = new Mission();
    m.flags.showStarted = true;
    m.setState('performance');
    m.roundsDone = new Set(['entrance', 'drinks', 'family', 'personal']);
    m.inState = secs;
    const ok = m.offerInvitation();
    m.flags.invitation = 'plain';
    return { ok, rushed: m.rushedIt, askedAfter: m.askedAfter };
  };
  const declined = new Mission();
  declined.flags.showStarted = true;
  declined.setState('performance');
  declined.roundsDone = new Set(['entrance', 'drinks', 'family', 'personal']);
  declined.inState = 2;
  declined.offerInvitation();
  declined.flags.invitation = 'none';
  return { early: fresh(4), late: fresh(140), declined: declined.rushedIt };
});
check('but asking four seconds after the curtain is rushing it',
  rushing.early.ok && rushing.early.rushed && !rushing.late.rushed,
  JSON.stringify(rushing));
check('and deciding not to ask is never rushing it', rushing.declined === false, '');

await choose(0);                               // the plain one, and let it play out
await tick(2);
const judged = await page.evaluate(() => {
  const b = window.__silver;
  return {
    rushed: b.woo.has('Woo.InvitationRushed'),
    outcome: b.mission.flags.outcome,
    woo: b.woo.score,
  };
});
check('so the rush penalty stays in its box on a careful evening',
  !judged.rushed && !!judged.outcome, JSON.stringify(judged));

/* ---- and it ends ---- */
await page.waitForFunction(() => window.__silver.game.over, null, { timeout: 20000 });
/* The evening is written into the campaign now, not into a private key only
 * this page ever read. `saved` is the mission's own persist() payload; `folded`
 * is what the campaign kept of it, which is what a later scene can ask. */
const ended = await page.evaluate(() => ({
  over: window.__silver.game.over,
  card: document.getElementById('overlay').classList.contains('ending'),
  title: document.querySelector('#overlay .tag')?.textContent || '',
  saved: window.__silver.mission.persist(window.__silver.woo),
  folded: window.__silver.campaignState.missions.silver_room,
  chapter: window.__silver.campaignState.story.chapter,
  legacyKey: localStorage.getItem('squatch.frontAndCenter'),
}));
check('the evening ends on a card, reached by asking her rather than by a debug button',
  ended.over && ended.card && !!ended.saved?.outcome,
  `${ended.title} — ${ended.saved?.outcome}`);
check('and the relationship is folded into the campaign for the next scene',
  ended.folded.status === 'complete'
    && ended.folded.outcome === ended.saved.outcome
    && typeof ended.folded.woo === 'number'
    && ended.folded.seeingHerAgain === ended.saved.seeingHerAgain,
  JSON.stringify(ended.folded));
check('and nothing is left behind in the mission’s old private save key',
  ended.legacyKey === null, String(ended.legacyKey));

/* ---- and the one line the score cannot buy back ----
 * Last, because it fires into the live ledger, and by here the evening has been
 * written down and there is nothing left to spoil. "Car's outside. Come on."
 * used to cost nothing whatsoever above eighty: the flag was set, the ending
 * looked at it, and the twelve points in the table never left the table.
 */
const crude = await page.evaluate(() => {
  const b = window.__silver;
  const opt = b.scripts.invitation.open.options().find((o) => o.tone === 'Overconfident');
  const before = b.woo.score;
  opt?.effect?.();
  const Mission = b.mission.constructor;
  const low = new Mission();
  low.flags.invitation = 'crude';
  return {
    found: !!opt, before, after: b.woo.score,
    fired: b.woo.has('Woo.CrudeInvitation'),
    andThen: low.resolve(50, 'decent'),
  };
});
check('"car’s outside, come on" costs what it costs at any score',
  crude.found && crude.fired && crude.after <= crude.before - 12
    && crude.andThen === 'disaster',
  JSON.stringify(crude));

/* ---- the set dressing, measured ----
 *
 * "The railings and the scenery need work" is not a thing a harness can be
 * told, but two thirds of what it turned out to mean is arithmetic. Every
 * fitting in the back of house hung somewhere between 45mm and 100mm below
 * the ceiling it is screwed to; the meat in the walk-in hung 70mm under its
 * own rail; the wet patches on the road sat 3mm over the asphalt, which is
 * inside what the depth buffer can tell apart forty metres down a street
 * with a 300m far plane, and two of them sat on top of each other.
 *
 * So: nothing small floats with clear air under it and nothing beside it,
 * and no two flat faces share a plane. Neither of those can see a crude
 * handrail — that is what the screenshots are for — but both of them catch
 * the next one of these before a player does.
 */
const dressed = await page.evaluate(() => {
  const b = window.__silver;
  const T = b.THREE;
  const items = [];
  b.room.root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.visible) return;
    const bb = new T.Box3().setFromObject(o);
    if (!Number.isFinite(bb.min.y)) return;
    items.push({ o, bb, size: bb.getSize(new T.Vector3()) });
  });
  /* The heights something is allowed to be standing on, and the two ramps,
   * which are a floor at every height between them. */
  const LEVELS = [-2.9, -0.02, 0, 0.14, 0.75];
  const onARamp = (bb) => b.room.ROUTE && [[15, 22, 8.4, 14.6], [15.5, 20, -0.6, 2.6]]
    .some(([x0, x1, z0, z1]) => bb.min.x > x0 - 0.4 && bb.max.x < x1 + 0.4
      && bb.min.z > z0 - 0.4 && bb.max.z < z1 + 0.4);
  const floaters = [];
  for (const it of items) {
    const { bb, size } = it;
    if (size.x > 6 || size.z > 6 || size.y > 4) continue;      // architecture
    if (size.x < 0.02 || size.z < 0.02) continue;              // signs on walls
    if (LEVELS.some((L) => Math.abs(bb.min.y - L) < 0.06)) continue;
    if (bb.min.y < -3 || bb.min.y > 3.2) continue;
    if (onARamp(bb)) continue;
    let held = false;
    for (const q of items) {
      if (q === it) continue;
      // something directly under it, close enough to be standing on
      if (q.bb.max.y <= bb.min.y + 0.06 && q.bb.max.y >= bb.min.y - 0.9
        && q.bb.max.x >= bb.min.x && q.bb.min.x <= bb.max.x
        && q.bb.max.z >= bb.min.z && q.bb.min.z <= bb.max.z) { held = true; break; }
      // or touching it at its own height, which is a bracket or a wall
      if (q.bb.max.y >= bb.min.y && q.bb.min.y <= bb.max.y
        && Math.max(q.bb.min.x - bb.max.x, bb.min.x - q.bb.max.x, 0) < 0.03
        && Math.max(q.bb.min.z - bb.max.z, bb.min.z - q.bb.max.z, 0) < 0.03) { held = true; break; }
    }
    if (!held) floaters.push(`${it.o.name || it.o.geometry.type} at ${bb.min.toArray().map((n) => n.toFixed(2)).join(',')}`);
  }
  /* Two large flat faces in the same plane: z-fighting, before you see it. */
  const flats = items.filter((it) => {
    const s = it.size;
    return (s.y < 0.02 && s.x > 1.5 && s.z > 1.5) || (s.x < 0.02 && s.y > 1.5 && s.z > 1.5)
      || (s.z < 0.02 && s.x > 1.5 && s.y > 1.5);
  });
  const fighting = [];
  for (let i = 0; i < flats.length; i++) {
    for (let j = i + 1; j < flats.length; j++) {
      const a = flats[i]; const c = flats[j];
      for (const ax of ['x', 'y', 'z']) {
        if (a.size[ax] > 0.02 || c.size[ax] > 0.02) continue;
        if (Math.abs(a.bb.min[ax] - c.bb.min[ax]) > 0.004) continue;
        const ov = (k) => Math.min(a.bb.max[k], c.bb.max[k]) - Math.max(a.bb.min[k], c.bb.min[k]);
        const [o1, o2] = ax === 'y' ? ['x', 'z'] : ax === 'x' ? ['y', 'z'] : ['x', 'y'];
        if (ov(o1) > 0.4 && ov(o2) > 0.4) fighting.push(`${ax}=${a.bb.min[ax].toFixed(3)}`);
      }
    }
  }
  /* The two ramp rails: a run, a mid-rail under it, and posts to the deck. */
  const rails = { entry: 0, well: 0 };
  for (const it of items) {
    const s = it.size;
    const long = Math.max(s.x, s.z);
    if (long < 1.2 || Math.max(s.y, Math.min(s.x, s.z)) > 0.14) continue;
    if (it.bb.min.z > 8 && it.bb.max.z < 15 && it.bb.max.y > -2.2 && it.bb.min.y < 1.2) rails.entry++;
    if (it.bb.min.z > -1 && it.bb.max.z < 3 && it.bb.min.y > 0 && it.bb.max.y < 1.1) rails.well++;
  }
  return { meshes: items.length, floaters: floaters.slice(0, 8), n: floaters.length, fighting: [...new Set(fighting)], rails };
});
check('nothing in the building is hanging in the air with nothing holding it up',
  dressed.n === 0, dressed.n ? `${dressed.n}: ${dressed.floaters.join('; ')}` : `${dressed.meshes} meshes, all sitting on something`);
check('and no two flat faces share a plane to fight over',
  dressed.fighting.length === 0, dressed.fighting.join(', ') || 'no coplanar sheets');
check('both ramps have a handrail with more than one bar in it',
  dressed.rails.entry >= 4 && dressed.rails.well >= 6,
  JSON.stringify(dressed.rails));

/* ---- she walks beside him, and stays put when he turns round ----
 *
 * The single worst thing about the evening: her spot was hung off his *look*
 * yaw, so it swung round him whenever he moved the mouse, and a man who
 * stopped to talk to his date set her walking a circle round his back to
 * reach his other shoulder. You could not turn and look at her.
 *
 * Two measurements, both of them of the thing the player feels. Walking: is
 * she off his shoulder or in his wake. Standing: spin the camera a full turn
 * and require that she does not take a step — which is the whole fix, because
 * the target is hung off his heading now and a mouse does not move that.
 */
const beside = await page.evaluate(() => {
  const b = window.__silver;
  const P = b.player; const D = b.date;
  const was = { mode: P.mode, enabled: P.enabled, impair: P.impair, dm: D.mode, at: D.at,
    p: P.position.clone(), d: D.group.position.clone() };
  P.mode = 'walk'; P.enabled = true; P.impair = 0; P._tween = null; P.yawCenter = null;
  D.mode = 'follow'; D.at = 3; D._stuck = 0;
  P.position.set(34, 1.66, 26); P.ground = 0;
  D.group.position.set(33, 0, 27.5);
  const step = (yaw, secs, forward) => {
    P.yaw = yaw; P.clearKeys();
    if (forward) P.setKey('KeyW', true);
    for (let t = 0; t < secs; t += 1 / 60) { P.update(1 / 60); D.update(1 / 60, P.position, P.yaw); }
    P.clearKeys();
  };
  /* Her place in his frame: forward is (-sin yaw, -cos yaw), right is its
   * perpendicular. Positive `side` is one shoulder, negative the other; what
   * matters is that it is not nearly zero, which is directly behind. */
  const rel = () => {
    const dx = D.position.x - P.position.x; const dz = D.position.z - P.position.z;
    return {
      fwd: +(-Math.sin(P.yaw) * dx + -Math.cos(P.yaw) * dz).toFixed(2),
      side: +(-Math.cos(P.yaw) * dx + Math.sin(P.yaw) * dz).toFixed(2),
      gap: +Math.hypot(dx, dz).toFixed(2),
    };
  };
  step(Math.atan2(0, 16), 6, true);              // south down the alley, abreast
  const walking = rel();
  // He stops and turns to face her. She should turn to him and not walk.
  const toHer = Math.atan2(-(D.position.x - P.position.x), -(D.position.z - P.position.z));
  step(toHer, 2.5, false);
  const turned = rel();
  const faces = Math.abs(Math.atan2(
    Math.sin(D.npc.group.rotation.y - Math.atan2(P.position.x - D.position.x, P.position.z - D.position.z)),
    Math.cos(D.npc.group.rotation.y - Math.atan2(P.position.x - D.position.x, P.position.z - D.position.z)),
  ));
  // And a full turn of the camera, with him standing still.
  let walked = 0;
  let last = { x: D.position.x, z: D.position.z };
  for (let i = 0; i < 180; i++) {
    const y = (i / 180) * Math.PI * 2;
    for (let t = 0; t < 1 / 30; t += 1 / 60) { P.update(1 / 60); D.update(1 / 60, P.position, y); }
    walked += Math.hypot(D.position.x - last.x, D.position.z - last.z);
    last = { x: D.position.x, z: D.position.z };
  }
  P.clearKeys();
  P.mode = was.mode; P.enabled = was.enabled; P.impair = was.impair;
  D.mode = was.dm; D.at = was.at;
  P.position.copy(was.p); D.group.position.copy(was.d);
  return { walking, turned, faces: +faces.toFixed(2), orbited: +walked.toFixed(2) };
});
check('she walks at his shoulder rather than in his wake',
  Math.abs(beside.walking.side) > 0.6 && beside.walking.gap < 2.6,
  JSON.stringify(beside.walking));
check('and when he stops and turns to her she stays where she is and looks at him',
  beside.faces < 0.35 && beside.orbited < 0.6,
  `faces him ${beside.faces} rad off; a full turn of the camera moved her ${beside.orbited}m`);

/* ---- the board ----
 * Driven on its own Mission, because the one in the page has been all the way
 * to the end and the point is that the list tracks the evening as it goes. */
const board = await page.evaluate(() => {
  const Mission = window.__silver.mission.constructor;
  const m = new Mission();
  const seen = (tag) => ({
    tag,
    n: m.objectives.length,
    now: m.objectives.find((o) => !o.done && !o.optional)?.id ?? null,
    done: m.objectives.filter((o) => o.done).length,
    optional: m.objectives.filter((o) => o.optional).length,
  });
  const trail = [seen('starting')];
  m.outOfCar(); trail.push(seen('arrived'));
  m.intoAlley(); trail.push(seen('service-route'));
  m.intoCellar(); trail.push(seen('cellar'));
  m.intoKitchen(); m.intoCorridor(); m.atHostStation(); trail.push(seen('host'));
  m.tableBuilt(); m.satDown(); trail.push(seen('round-one'));
  m.roundDone('entrance'); m.roundDone('drinks'); m.roundDone('family'); m.roundDone('personal');
  m.showCutscene(); m.showStarted(); trail.push(seen('performance'));
  const beforeTick = m.objectives.filter((o) => o.done).length;
  m.flags.songRequested = 'horns';
  m.update(0.016, {});
  return { trail, beforeTick, afterTick: m.objectives.filter((o) => o.done).length,
    texts: m.objectives.map((o) => o.text) };
});
check('the evening is on the side of the screen, and it fills in as it happens',
  board.trail[0].n >= 1 && board.trail.at(-1).n >= 16
    && board.trail.every((t, i) => i === 0 || t.n >= board.trail[i - 1].n)
    && board.trail.every((t, i) => i === 0 || t.done >= board.trail[i - 1].done)
    && board.trail[2].now === 'cellar' && board.trail.at(-1).now === 'ask'
    && board.trail.at(-1).optional >= 6,
  board.trail.map((t) => `${t.tag}: ${t.n} lines, ${t.done} done, now ${t.now}`).join(' → '));
check('and the optional ones tick themselves off when they are done',
  board.afterTick === board.beforeTick + 1,
  `${board.beforeTick} → ${board.afterTick} of ${board.texts.length}`);

/* ---- the voice ----
 *
 * The scene was subtitles-only with four recordings of Margo sitting in the
 * manifest that nothing in the building could reach, so there are two
 * separate things to prove and neither is "an mp3 played".
 *
 * First, that the wiring fires: `game.voLog` collects every cue the evening
 * asks for whether or not a file exists behind it, so the run above — which
 * has just played the entire mission — must have asked for a great many.
 *
 * Second, that the names are real. Every line a cast speaker says gets a cue
 * from its node id, and if that name is not in the manifest then the line can
 * never be given a recording and nothing anywhere would say so. Walk the
 * built trees under every branch of every `variant()` and hold the manifest
 * to what the subtitle actually says, stage directions stripped — a reworded
 * line with a stale cue is a line delivered in words nobody wrote.
 */
const manifest = JSON.parse(await fsp.readFile(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
const voice = await page.evaluate(({ cues, voices }) => {
  const b = window.__silver;
  const S = b.scripts;
  const VOICE_OF = b.VOICE_OF;
  const said = new Map(cues.map((c) => [c.name, c.say]));
  /* The same reduction the manifest was authored with: the words, without
   * the stage directions, which are for the reader and not for the actor. */
  const spoken = (html) => String(html)
    .replace(/<em>\s*\([^)]*\)\s*<\/em>/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[—–-]\s*/, '').trim();

  const missing = []; const drifted = []; const badVoice = [];
  let lines = 0;
  const visit = (node) => {
    if (!node?.line) return;
    const v = VOICE_OF[node.who];
    if (!v) return;
    if (!node.cue) { missing.push(`${node.who}: uncast line`); return; }
    const name = typeof node.cue === 'function' ? node.cue() : node.cue;
    const text = spoken(typeof node.line === 'function' ? node.line() : node.line);
    if (!text) return;                       // all stage direction: nothing to record
    lines++;
    if (!said.has(name)) { missing.push(name); return; }
    if (said.get(name) !== text) drifted.push(`${name}: manifest says ${JSON.stringify(said.get(name).slice(0, 40))}`);
    const profile = b.PROFILE_OF[v] ?? v;
    if (voices[name] !== profile) badVoice.push(`${name} is ${voices[name]}, should be ${profile}`);
  };
  /* Every branch: the flags the `variant()`s read, driven directly. */
  const F = b.mission.flags;
  const was = { ...F };
  const wooWas = b.woo.score;
  for (const tableBuilt of [false, true]) {
    for (const seated of [false, true]) {
      for (const drinkOrdered of [false, 'rye']) {
        for (const songRequested of [false, 'horns']) {
          for (const introducedAs of ['right', 'wrong']) {
            for (const abandonments of [0, 2]) {
              for (const score of [20, 65, 92]) {
                Object.assign(F, { tableBuilt, seated, drinkOrdered, songRequested, introducedAs, abandonments });
                b.woo.score = score;
                for (const [key, tree] of Object.entries(S)) {
                  if (key === 'scenes') { for (const beats of Object.values(tree)) beats.forEach(visit); continue; }
                  Object.values(tree).forEach(visit);
                }
              }
            }
          }
        }
      }
    }
  }
  Object.assign(F, was);
  b.woo.score = wooWas;
  return {
    asked: b.game.voLog.length,
    distinct: new Set(b.game.voLog).size,
    sample: [...new Set(b.game.voLog)].slice(0, 4),
    lines,
    missing: [...new Set(missing)].slice(0, 6),
    nMissing: new Set(missing).size,
    drifted: [...new Set(drifted)].slice(0, 4),
    nDrifted: new Set(drifted).size,
    badVoice: badVoice.slice(0, 4),
  };
}, {
  cues: manifest.sfx.filter((c) => c.name.startsWith('vo.silver.')).map((c) => ({ name: c.name, say: c.say })),
  voices: Object.fromEntries(manifest.sfx.filter((c) => c.name.startsWith('vo.silver.')).map((c) => [c.name, c.voice])),
});
check('the evening actually asked for its voice, line by line, rather than staying silent',
  voice.asked > 40 && voice.distinct > 25,
  `${voice.asked} cues asked for, ${voice.distinct} distinct — e.g. ${voice.sample.join(', ')}`);
check('and every line anybody cast can say has a cue in the manifest that says the same words',
  voice.nMissing === 0 && voice.nDrifted === 0 && voice.badVoice.length === 0,
  voice.nMissing || voice.nDrifted || voice.badVoice.length
    ? `${voice.nMissing} missing (${voice.missing.join(', ')}); ${voice.nDrifted} drifted (${voice.drifted.join('; ')}); ${voice.badVoice.join('; ')}`
    : `${voice.lines} lines across ${new Set(Object.values(await page.evaluate(() => window.__silver.VOICE_OF))).size} voices`);
/* The bank is who is speaking; the profile is whose larynx it comes out of,
 * and only the second one needs an id on the owner's sheet. Four of the six
 * banks in this scene share the wait staff's. */
const profiles = await page.evaluate(() => window.__silver.PROFILE_OF);
check('every voice the scene names resolves to a profile with an id behind it',
  Object.values(await page.evaluate(() => window.__silver.VOICE_OF))
    .every((v) => manifest.voices[profiles[v] ?? v]?.id),
  Object.entries(profiles)
    .map(([bank, v]) => `${bank}→${v}:${manifest.voices[v]?.id ? 'cast' : 'UNCAST'}`).join(' '));

check('nothing threw on the way round', problems.length === 0, problems.slice(0, 3).join(' / '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length
  ? `\n${failed.length} of ${results.length} checks failed.`
  : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
