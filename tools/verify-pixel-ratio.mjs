#!/usr/bin/env node
/**
 * The shared pixel-ratio helper, on a real scene page.
 *
 *   node tools/verify-pixel-ratio.mjs        (npm run verify:pixel-ratio)
 *
 * Two things, both on the Combat System page because it is the lightest
 * scene with a renderer of its own:
 *
 *   1. Under automation the ratio is FIXED at min(devicePixelRatio, cap) and
 *      never moves -- every screenshot tool and verifier in this repo runs
 *      under Playwright, and a backing store that shrinks with the
 *      rasteriser's mood would shift every pixel they compare.
 *   2. With `?adaptiveDpr=1` the ladder is live: a page whose frames are
 *      made slow steps its ratio down within a few seconds, re-fits the
 *      renderer, and stops at the floor. The slowness is manufactured (a
 *      spin in requestAnimationFrame), not assumed of swiftshader, so the
 *      check means the same thing on a fast machine and a loaded one.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54981;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the pixel-ratio helper.');
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
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

const readState = () => ({
  renderer: window.combatSystem?.renderer?.getPixelRatio?.() ?? null,
  control: globalThis.__pixelRatio ? {
    cap: globalThis.__pixelRatio.cap,
    initial: globalThis.__pixelRatio.initial,
    ratio: globalThis.__pixelRatio.ratio,
    level: globalThis.__pixelRatio.level,
    adaptive: globalThis.__pixelRatio.adaptive,
    changes: globalThis.__pixelRatio.changes,
  } : null,
  webdriver: navigator.webdriver,
});

/* Wait on a predicate the page publishes, never on a duration alone
 * (docs/ENGINE-TRAPS.md entry 2). */
async function waitFor(page, pred, timeout = 60000) {
  await page.waitForFunction(pred, null, { timeout, polling: 100 });
}

try {
  /* ---- 1. deterministic under automation ---- */
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 2 });
    const problems = [];
    page.on('pageerror', (e) => problems.push(String(e.message)));
    await page.goto(`http://localhost:${PORT}/combatlab.html`, { waitUntil: 'load' });
    await waitFor(page, () => Boolean(window.combatSystem?.renderer && globalThis.__pixelRatio));
    const first = await page.evaluate(readState);
    check('under automation the helper is attached, not adaptive, and the renderer sits at min(dpr, cap)',
      first.webdriver === true && first.control?.adaptive === false
        && first.renderer === Math.min(2, first.control.cap) && first.control.cap === 1.5,
      JSON.stringify(first));
    /* Hog the frame for a while: nothing may move. */
    await page.evaluate(() => new Promise((resolve) => {
      const until = performance.now() + 7000;
      (function spin(now) {
        const stop = performance.now() + 60;
        while (performance.now() < stop) { /* burn */ }
        if (now < until) requestAnimationFrame(spin); else resolve();
      }(performance.now()));
    }));
    const after = await page.evaluate(readState);
    check('...and seven seconds of 60 ms frames do not move it',
      after.renderer === first.renderer && after.control.changes === 0,
      JSON.stringify(after));
    check('no page errors (fixed run)', problems.length === 0, problems.join(' | '));
    await page.close();
  }

  /* ---- 2. the ladder, forced on ---- */
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 2 });
    const problems = [];
    page.on('pageerror', (e) => problems.push(String(e.message)));
    await page.goto(`http://localhost:${PORT}/combatlab.html?adaptiveDpr=1`, { waitUntil: 'load' });
    await waitFor(page, () => Boolean(window.combatSystem?.renderer && globalThis.__pixelRatio));
    const start = await page.evaluate(readState);
    check('?adaptiveDpr=1 turns the ladder on and starts at the same capped ratio',
      start.control?.adaptive === true && start.renderer === 1.5 && start.control.level === 0,
      JSON.stringify(start));
    /* Manufacture the slowness in the page's own frame loop and watch the
     * ratio come down. The policy needs a 3 s hold and a 2 s window per step;
     * give it long enough for two, and stop the hog once it has stepped. */
    await page.evaluate(() => {
      window.__hog = { on: true };
      (function spin() {
        if (!window.__hog.on) return;
        const stop = performance.now() + 60;
        while (performance.now() < stop) { /* burn */ }
        requestAnimationFrame(spin);
      }());
    });
    await waitFor(page, () => globalThis.__pixelRatio.level >= 1, 45000);
    const stepped = await page.evaluate(readState);
    check('sustained slow frames step the ratio down and the renderer follows',
      stepped.control.level >= 1 && stepped.renderer === stepped.control.ratio && stepped.renderer < 1.5,
      JSON.stringify(stepped));
    await waitFor(page, () => globalThis.__pixelRatio.level >= 2, 45000);
    const twice = await page.evaluate(readState);
    check('...one rung at a time, still following',
      twice.control.level >= 2 && twice.renderer === twice.control.ratio && twice.renderer < stepped.renderer,
      JSON.stringify(twice));
    await page.evaluate(() => { window.__hog.on = false; });
    const size = await page.evaluate(() => {
      const c = window.combatSystem.renderer.domElement;
      return { w: c.width, h: c.height, ratio: window.combatSystem.renderer.getPixelRatio() };
    });
    check('the drawing buffer really shrank with the ratio',
      Math.abs(size.w - Math.floor(320 * size.ratio)) <= 1 && Math.abs(size.h - Math.floor(200 * size.ratio)) <= 1,
      JSON.stringify(size));
    check('no page errors (adaptive run)', problems.length === 0, problems.join(' | '));
    await page.close();
  }
} catch (err) {
  check('verifier ran to completion', false, err?.stack || String(err));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
