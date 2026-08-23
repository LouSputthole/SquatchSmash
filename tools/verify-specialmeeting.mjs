#!/usr/bin/env node
/**
 * THE SPECIAL MEETING, PLAYED RATHER THAN INSPECTED.
 *
 * This scene had NO INPUT WIRING AT ALL and shipped that way for weeks. Owner,
 * verbatim: *"I spawn in and I cant move. Theres nothing to do. I cant move and
 * I cant move my camera."*
 *
 * `core/player.js` listens to nothing by design -- it exposes `setKey` and
 * `handleMouseMove` for the scene to feed, and `enabled` defaults to FALSE.
 * src/specialmeeting/main.js fed it neither and never enabled it, so it ran a
 * player update sixty times a second against an empty input set.
 *
 * ---- Why nothing caught it ----
 *
 * Every gate this scene had passes on a scene nobody can play:
 *
 *   verify:campaign-marathon   drives it through handoff CALLS, not keys
 *   verify:webgl-health        reads the renderer
 *   verify:boot-errors         blocks the module and checks the error screen
 *   geometry / staging / framing   analyse a scene that was BUILT, not played
 *
 * That is the hole this file exists to close, and the reason it is worth a
 * whole verifier for one scene: the question "can the player move" had no
 * asker anywhere in the repository. It is asked here by pressing a key and
 * measuring the man, which is the only form of the question that cannot be
 * satisfied by a scene that merely constructs correctly.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5271;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}
const fmt = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v));

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

const browser = await launchChromium({
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const context = await browser.newContext({ viewport: { width: 900, height: 560 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto(`http://localhost:${PORT}/specialmeeting.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.SPECIAL_MEETING?.player, null, { timeout: 60000 });

  /* THE CLICK IS THE POINT. A first-person scene acquires pointer lock on a
   * click into the canvas, and the player is enabled by `pointerlockchange`.
   * Headless Chromium grants it, so this is the real path a player takes. */
  await page.mouse.click(450, 280);
  await page.waitForTimeout(400);

  const locked = await page.evaluate(() => ({
    lockedToCanvas: document.pointerLockElement === document.getElementById('scene'),
    enabled: window.SPECIAL_MEETING.playerEnabled,
    mode: window.SPECIAL_MEETING.playerMode,
  }));
  check('clicking the canvas takes pointer lock and enables the player',
    locked.lockedToCanvas && locked.enabled === true, fmt(locked));

  check('he starts on his feet at the kerb, not already in the car',
    locked.mode === 'walk', fmt(locked));

  /* WALKING. Held, not tapped: `_updateWalk` integrates a key that is DOWN,
   * and a keypress that goes down and up inside one frame moves nobody. */
  const before = await page.evaluate(() => window.SPECIAL_MEETING.player.position.toArray());
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.SPECIAL_MEETING.player.position.toArray());
  const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
  check('holding W walks him — the whole thing that was missing',
    moved > 0.5, `moved ${moved.toFixed(3)} m ${fmt({ before, after })}`);

  /* LOOKING. `handleMouseMove` banks the delta and `update` spends it, so the
   * yaw is read after a frame rather than in the same turn. */
  const yawBefore = await page.evaluate(() => window.SPECIAL_MEETING.player.yaw);
  await page.mouse.move(450, 280);
  await page.mouse.move(650, 280);
  await page.waitForTimeout(400);
  const yawAfter = await page.evaluate(() => window.SPECIAL_MEETING.player.yaw);
  check('moving the mouse turns his head',
    Math.abs(yawAfter - yawBefore) > 0.01,
    fmt({ yawBefore, yawAfter, delta: yawAfter - yawBefore }));

  check('no runtime console errors occurred', pageErrors.length === 0, fmt(pageErrors));
} finally {
  await context.close();
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log();
if (failed.length) {
  console.log(`${failed.length}/${results.length} Special Meeting checks failed.`);
  for (const r of failed) console.log(`  FAIL  ${r.name}`);
  process.exitCode = 1;
} else {
  console.log(`All ${results.length} Special Meeting checks passed.`);
}
