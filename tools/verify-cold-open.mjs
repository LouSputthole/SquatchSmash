#!/usr/bin/env node
/**
 * Verify THE COLD OPEN in a real browser.
 *
 * The opening's whole job is to make the player believe Squatch Smash is the
 * product he downloaded, and then take that belief off him. Every claim in
 * that sentence is checkable, and none of it is checkable by reading code:
 *
 *   - the monitor has to COVER the viewport. Not fit it. A black band round
 *     the edge of "the game" is the one tell that gives the opening away
 *     before it has started, and whether the quad clears the frustum edge
 *     depends on the desk, the field of view AND the window shape.
 *   - the camera must not move until he says yes to quitting.
 *   - the reveal has to land him in his own chair with the radio on.
 *   - the phone must NOT ring during the beat afterwards. Forty seconds of
 *     nothing is what carries him from "I quit the game" to "that was a game
 *     inside this game", and a call landing in it steps on all of it.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5240;
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the cold open.');
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
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Let the page render for a while: the reveal is a five-second camera move. */
async function settle(seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  }
}

const state = () => page.evaluate(() => window.__squatch.coldOpenState);

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.coldOpenState, null, { timeout: 90000 });
  /* The cold open is armed after boot resolves, which is a tick later than
   * the debug surface appearing. */
  await page.waitForFunction(() => window.__squatch.coldOpenState.active, null, { timeout: 60000 });

  /* ---------------------------------------------------------------- */
  /* 1. IT OPENS IN SQUATCH SMASH                                      */
  /* ---------------------------------------------------------------- */
  const opening = await state();
  check('the game opens straight into Squatch Smash, with no title card',
    opening.active && opening.overlayHidden && opening.app === 'smash',
    JSON.stringify(opening));
  check('he is in the chair, and never asked to sit in it',
    opening.seated && opening.posture === null,
    `seated=${opening.seated} posture=${JSON.stringify(opening.posture)}`);
  check('SquatchOS never shows him it booted',
    opening.osMode === 'app', `os mode ${opening.osMode}`);

  /* THE CHECK THE WHOLE OPENING RESTS ON. */
  check('the monitor COVERS the viewport — no room visible around the game',
    opening.covers,
    `quad ndc x[${opening.cover.minX?.toFixed(2)}, ${opening.cover.maxX?.toFixed(2)}] `
    + `y[${opening.cover.minY?.toFixed(2)}, ${opening.cover.maxY?.toFixed(2)}] (needs to pass ±1)`);

  check('the real Squatch Smash page is the thing on screen',
    (await page.locator('iframe').count()) > 0
      && await page.evaluate(() => {
        const frame = document.querySelector('iframe');
        return !!frame && getComputedStyle(frame).display !== 'none'
          && (frame.getAttribute('src') || '').includes('game/');
      }),
    'the embedded page is game/index.html, not a mock');

  /* ---------------------------------------------------------------- */
  /* 2. NOTHING MOVES UNTIL HE QUITS                                    */
  /* ---------------------------------------------------------------- */
  await settle(1.5);
  const held = await state();
  check('the camera does not drift while he plays',
    held.phase === 'playing' && held.pullbackK === 0 && held.covers,
    JSON.stringify({ phase: held.phase, k: held.pullbackK, covers: held.covers }));
  check('and the phone is not counting down yet',
    held.ringsIn === null, `ringsIn=${held.ringsIn}`);

  /* ---------------------------------------------------------------- */
  /* 3. THE FAKE QUIT, AND THE REVEAL                                   */
  /* ---------------------------------------------------------------- */
  const startedAt = held.cameraToMonitor;
  await page.evaluate(() => window.__squatch.quitSquatchSmash());
  const shutting = await state();
  check('saying yes looks like the game closing, not like a cutscene starting',
    shutting.phase === 'shutdown' && shutting.pullbackK === 0,
    JSON.stringify({ phase: shutting.phase, k: shutting.pullbackK }));

  await page.waitForFunction(() => window.__squatch.coldOpenState.phase === 'pullback',
    null, { timeout: 20000 });
  const moving = await state();
  check('the radio comes on the moment the camera starts to move',
    moving.radioOn, `radio ${moving.radioOn}`);

  /* WAIT ON THE DOLLY, NOT ON THE CLOCK. The first draft slept 1.2 seconds
   * and asserted the room was visible; under swiftshader this page renders at
   * about ten frames a second, so 1.2 s of wall time is 11% of a five-second
   * pull-back -- the camera had barely left the monitor and the monitor still
   * filled the screen. The check was measuring too early and calling the
   * sequence broken. Wait for the move to be half done and then look. */
  await page.waitForFunction(() => window.__squatch.coldOpenState.pullbackK > 0.5,
    null, { timeout: 60000 });
  const midway = await state();
  check('the room appears around the monitor as the camera comes off it',
    midway.cameraToMonitor > startedAt && !midway.covers,
    JSON.stringify({ k: midway.pullbackK.toFixed(2), covers: midway.covers }));

  /* Ten frames a second against a 5.2 s dolly is a minute of patience. */
  await page.waitForFunction(() => window.__squatch.coldOpenState.phase === 'beat',
    null, { timeout: 120000 });
  const landed = await state();
  check('it lands him in his own chair, at the desk',
    landed.cameraToSeat < 0.2 && landed.seated,
    `${landed.cameraToSeat.toFixed(3)} m from the seated pose`);
  check('and hands the game back with one prompt and no narration',
    !landed.active && /get up/i.test(landed.posture || ''),
    JSON.stringify({ active: landed.active, posture: landed.posture }));

  /* ---------------------------------------------------------------- */
  /* 4. THE BEAT                                                        */
  /* ---------------------------------------------------------------- */
  check('Lou is a long way off ringing: the silence is the point',
    landed.ringsIn > 30,
    `rings in ${landed.ringsIn?.toFixed(1)}s`);

  await settle(4);
  const thinking = await state();
  check('nothing happens while he works out what just happened',
    thinking.ringsIn > 25 && thinking.ringsIn < landed.ringsIn,
    `rings in ${thinking.ringsIn?.toFixed(1)}s, counting down`);

  check('no runtime console errors occurred', problems.length === 0, problems.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} cold open checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} cold open checks passed.`);
