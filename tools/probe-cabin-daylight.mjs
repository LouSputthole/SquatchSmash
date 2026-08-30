#!/usr/bin/env node
/**
 * What the cabin actually looks like, and what it costs to draw.
 *
 *   node tools/probe-cabin-daylight.mjs
 *   PROBE_SHOTS=overlook-0920,trailhead-2045 node tools/probe-cabin-daylight.mjs
 *   PROBE_OUT=.artifacts/before node tools/probe-cabin-daylight.mjs
 *
 * A shot id is `<viewpoint>-<hhmm>` with an optional `-up` to pitch the
 * camera into the sky; the day is Day 2 before 20:00 and Day 3 after, which
 * is the cabin's two authored halves. Each shot teleports to the authored
 * viewpoint, sets the clock, renders one frame with the shadow pass counted,
 * and writes a PNG.
 *
 * This is a measuring stick, not a gate. It exists because "the day looks
 * grey" and "the forest is bare" are both claims with numbers behind them --
 * a 0x4d7ad7 zenith, 1,617 plants, 6,210 draw calls -- and this is where
 * those numbers come from. It never presses START: the title card is a DOM
 * overlay over a canvas that renders from module load, and the scene's audio
 * manifest takes minutes to decode under software rendering.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5311;
const OUT = path.resolve(ROOT, process.env.PROBE_OUT || '.artifacts/cabin-daylight');
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end('not found');
      return;
    }
    const body = await fsp.readFile(file);
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch (error) {
    response.writeHead(500).end(error?.message || 'error');
  }
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
fs.mkdirSync(OUT, { recursive: true });

const browser = await launchChromium({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
page.on('pageerror', (error) => console.log(`  pageerror: ${error.message}`));
await page.goto(`http://127.0.0.1:${PORT}/cabin.html?preview=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.CABIN?.chapter));
/* The title card is a DOM overlay over a canvas that renders every frame
 * from module load, and `teleport` + `setTime` both work before the start
 * button's audio manifest has finished loading. Hiding the overlay is
 * therefore the whole of "start the scene" for a screenshot probe, and it
 * takes 0 s instead of the manifest's minutes. */
await page.evaluate(() => {
  for (const id of ['overlay', 'loading', 'hud', 'squatch-preview-notice']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  document.body.classList.add('playing');
});

const SHOTS = (process.env.PROBE_SHOTS || 'trailhead-0920,creek-0920,overlook-0920,trailhead-0520,trailhead-2045')
  .split(',')
  .map((id) => {
    const [view, hhmm, lift] = id.split('-');
    const minutes = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));
    return { id, view, day: minutes > 20 * 60 ? 3 : 2, minutes, pitch: lift === 'up' ? 0.42 : null };
  });

const rows = [];
for (const shot of SHOTS) {
  const placed = await page.evaluate(([view, day, minutes, pitch]) => {
    const runtime = window.CABIN;
    const ok = runtime.teleport(view, 'observe');
    if (pitch !== null) runtime.player.pitch = pitch;
    /* The frame loop only syncs the camera to the player while the scene is
     * `active`, and this probe deliberately never leaves the title card, so
     * the pose the teleport just set has to be pushed to the camera here or
     * every shot is taken from the spawn. */
    runtime.player._applyCamera(0);
    // Drive the forest LOD for the new pose; nothing else ticks it here.
    runtime.cabin.update(1, 1, runtime.player.position);
    runtime.setTime(day, minutes);
    return {
      ok,
      clock: runtime.time.clock12,
      dayness: runtime.time.dayness,
      at: runtime.player.position.toArray().map((v) => Number(v.toFixed(2))),
    };
  }, [shot.view, shot.day, shot.minutes, shot.pitch]);
  await page.evaluate(() => new Promise((resolve) => {
    let frames = 6;
    const tick = () => { frames -= 1; if (frames <= 0) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  const perf = await page.evaluate(() => window.CABIN.perf.drawCalls());
  await page.screenshot({ path: path.join(OUT, `${shot.id}.png`) });
  rows.push({ ...shot, ...placed, ...perf });
  console.log(`${shot.id.padEnd(18)} placed=${placed.ok} ${String(placed.clock).padStart(8)} `
    + `dayness ${placed.dayness.toFixed(3)}  calls ${String(perf.calls).padStart(5)}  tris ${perf.triangles}`);
}

console.log(JSON.stringify(rows));
await browser.close();
await new Promise((resolve) => server.close(resolve));
