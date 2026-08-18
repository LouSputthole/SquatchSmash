#!/usr/bin/env node
/**
 * Walk the shared first-person controller over low cover and into a wall.
 *
 *   node tools/verify-step-over.mjs        (npm run verify:step-over)
 *
 * `Player._resolve` steps over any collider whose top is within STEP_HEIGHT
 * of the floor he stands on (docs/FUTURE-EDITS.md, "Step-over in
 * Player._resolve"), and rides on top of it while he is over it. That is a
 * change to movement in every scene, so it gets its own gate: a real browser,
 * the real module graph (`three` through the importmap, exactly as every
 * scene page loads it), real keyboard events into the same `setKey` path the
 * scenes wire, and the scene clock stepped deterministically -- swiftshader's
 * frame rate says nothing about how far a held key should have carried him
 * (docs/ENGINE-TRAPS.md entry 2).
 *
 * Three courses on one floor:
 *   - a 35 cm crate across the path      -> walked up onto and off again;
 *   - a 60 cm bench across the path      -> a wall (STEP_HEIGHT is 40 cm);
 *   - a 1.2 m wall                       -> a wall, and still a wall mid-jump.
 * Plus a raised world floor (`groundAt`, the Bing's stage) with a crate on
 * it, to prove the step limit is measured from the floor he is on.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54980;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/* The harness page. Nothing here is a scene: it is the controller, a camera,
 * a world of boxes, and the two things every scene wires -- keydown/keyup
 * into setKey, and a stepped update. `advance(seconds)` is the scene clock. */
const HARNESS = `<!doctype html>
<html><head><meta charset="utf-8"><title>step-over harness</title>
<script type="importmap">{ "imports": { "three": "/vendor/three.module.min.js" } }</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { Player, STEP_HEIGHT } from '/src/core/player.js';

const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
const world = {
  colliders: [],
  floorZones: [],
  /* A raised floor from z = 30 on, west of x = 35: the Bing's stage, in effect. */
  groundAt: (x, z) => (z >= 30 && x < 35 ? 0.6 : 0),
};
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
const player = new Player(camera, world);
player.mode = 'walk';
player.enabled = true;

document.addEventListener('keydown', (e) => player.setKey(e.code, true));
document.addEventListener('keyup', (e) => player.setKey(e.code, false));

const state = () => ({
  x: player.position.x, y: player.position.y, z: player.position.z,
  ground: player.ground, grounded: player.grounded, jump: player.jumpHeight,
});

window.__stepOver = {
  THREE, player, world, STEP_HEIGHT, box,
  place(x, z, yawDeg = 180) {
    player.position.set(x, world.groundAt(x, z) + player.eyeHeight, z);
    player.ground = world.groundAt(x, z);
    player.velocity.set(0, 0, 0);
    player.jumpHeight = 0;
    player.grounded = true;
    player.yaw = (yawDeg * Math.PI) / 180;   // 180: a forward press moves along +z
    player.clearKeys();
    return state();
  },
  /* Step the scene clock. Records the highest and lowest ground he rode on
   * the way so a check can ask "did he stand on it" without racing a frame. */
  advance(seconds, dt = 1 / 60) {
    let hi = -Infinity; let lo = Infinity; let maxZ = -Infinity;
    for (let t = 0; t < seconds; t += dt) {
      player.update(dt);
      hi = Math.max(hi, player.ground);
      lo = Math.min(lo, player.ground);
      maxZ = Math.max(maxZ, player.position.z);
    }
    return { ...state(), hi, lo, maxZ };
  },
  state,
};
window.__stepOverReady = true;
</script>
</body></html>`;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify step-over.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/__step-over.html') {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    res.end(HARNESS);
    return;
  }
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
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}
const fmt = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v));

const RADIUS = 0.30;

try {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)); });
  page.setDefaultTimeout(60000);
  await page.goto(`http://localhost:${PORT}/__step-over.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stepOverReady === true);

  const stepHeight = await page.evaluate(() => window.__stepOver.STEP_HEIGHT);
  check('the controller exports a step height between 0.35 and 0.45 m',
    stepHeight >= 0.35 && stepHeight <= 0.45, `${stepHeight} m`);

  /* Lay the courses out. Each lane is 4 m wide and 20 m long, side by side
   * along x, so one world serves every check and nothing is torn down. */
  await page.evaluate(() => {
    const { world, box } = window.__stepOver;
    world.colliders.push(
      box(-2, 0, 4, 2, 0.35, 6),          // lane A (x 0): 35 cm crate, 2 m deep
      box(8, 0, 4, 12, 0.60, 6),          // lane B (x 10): 60 cm bench
      box(18, 0, 4, 22, 1.20, 4.4),       // lane C (x 20): 1.2 m wall
      box(28, 0.6, 32, 32, 0.95, 34),     // lane D (x 30): 35 cm crate ON the raised floor
      box(38, 0, 32, 42, 0.95, 34),       // lane E (x 40): the same box reached from floor level (95 cm: a wall)
    );
  });

  /* Real keys, scene clock. */
  const walk = async (seconds) => {
    await page.keyboard.down('KeyW');
    const out = await page.evaluate((s) => window.__stepOver.advance(s), seconds);
    await page.keyboard.up('KeyW');
    await page.evaluate(() => window.__stepOver.advance(0.05));
    return out;
  };

  /* ---- lane A: over the crate ---- */
  await page.evaluate(() => window.__stepOver.place(0, 0));
  const onCrate = await walk(2.3);         // ~5.3 m at walking pace: mid-crate
  check('a 35 cm crate is walked up onto (he is over it and his floor is its top)',
    onCrate.z > 4.6 && onCrate.z < 6 && Math.abs(onCrate.ground - 0.35) < 0.01,
    fmt(onCrate));
  const offCrate = await walk(1.5);
  check('...and off the far side, back to the floor',
    offCrate.z > 6.5 && offCrate.ground === 0 && offCrate.hi > 0.34,
    fmt(offCrate));

  /* ---- lane B: the bench is a wall ---- */
  await page.evaluate(() => window.__stepOver.place(10, 0));
  const bench = await walk(3);
  check('a 60 cm bench is still a wall (over STEP_HEIGHT): he stops against its face',
    bench.z > 4 - RADIUS - 0.05 && bench.z <= 4 - RADIUS + 1e-6 && bench.ground === 0,
    fmt(bench));

  /* ---- lane C: the wall, walking and jumping ---- */
  await page.evaluate(() => window.__stepOver.place(20, 0));
  const wall = await walk(3);
  check('a 1.2 m wall stops him',
    wall.z > 4 - RADIUS - 0.05 && wall.z <= 4 - RADIUS + 1e-6,
    fmt(wall));
  await page.evaluate(() => window.__stepOver.place(20, 2.6));
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__stepOver.advance(0.35));   // up to speed
  await page.keyboard.down('Space');
  const leap = await page.evaluate(() => window.__stepOver.advance(1.2));
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  check('...and stays a wall through a running jump (the step limit is measured from the floor)',
    leap.maxZ <= 4 - RADIUS + 1e-6,
    fmt(leap));

  /* ---- lanes D/E: the step limit follows the floor he stands on ---- */
  await page.evaluate(() => window.__stepOver.place(30, 26));
  const stage = await walk(4);
  /* Back on the stage within a centimetre, the same tolerance lane A uses for
   * the crate top, and not the 1e-6 this line asked for at first. `walk`
   * samples the frame the key comes up, and off a 0.95 m crate the soft
   * ground response is still easing down toward 0.6 -- it only snaps once the
   * gap is under 2 mm, so the sample can legitimately land a frame early
   * (measured 0.602). A centimetre cannot confuse the stage with the crate:
   * they are 35 cm apart, which is the whole point of the check. */
  check('a 35 cm crate on a raised world floor is stepped onto from that floor (0.95 top over a 0.6 stage)',
    stage.hi > 0.94 && stage.z > 34.5 && Math.abs(stage.ground - 0.6) < 0.01,
    fmt(stage));
  await page.evaluate(() => window.__stepOver.place(40, 26));
  const fromBelow = await walk(4);
  check('the same 95 cm box met from floor level is a wall',
    fromBelow.z > 32 - RADIUS - 0.05 && fromBelow.z <= 32 - RADIUS + 1e-6 && fromBelow.hi === 0,
    fmt(fromBelow));

  check('no page errors', problems.length === 0, problems.join(' | '));
  await page.close();
} catch (err) {
  check('verifier ran to completion', false, err?.stack || String(err));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
