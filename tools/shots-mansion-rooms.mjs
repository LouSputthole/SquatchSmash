#!/usr/bin/env node
/**
 * Focused visual evidence for the Mansion room-refinement pass.
 *
 * Usage:
 *   node tools/shots-mansion-rooms.mjs before
 *   node tools/shots-mansion-rooms.mjs after
 *   node tools/shots-mansion-rooms.mjs after-pass-3 final
 *
 * Captures the real production mansion with its real materials, lights and
 * camera. The script only teleports the player between shots; it does not
 * construct a parallel preview scene.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = (process.argv[2] || 'after').replace(/[^a-z0-9_-]/gi, '-');
const MODE = process.argv[3] || 'all';
const OUT = path.join(ROOT, 'docs', 'validation', '2026-08-09', 'mansion-rooms', LABEL);
const PORT = Number(process.env.PORT) || 54931;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

await fsp.mkdir(OUT, { recursive: true });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const notFound = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() === 404) notFound.push(new URL(response.url()).pathname);
});

async function capture(name, position, target) {
  const result = await page.evaluate(({ position: at, target: look }) => {
    const m = window.mansion;
    const T = m.THREE;
    m.teleport(at[0], at[1], at[2], 0);
    m.scene.updateMatrixWorld(true);
    let centre;
    if (typeof look === 'string') {
      const object = m.scene.getObjectByName(look);
      if (!object) return { error: `missing target ${look}` };
      centre = new T.Box3().setFromObject(object).getCenter(new T.Vector3());
    } else {
      centre = new T.Vector3(look[0], look[1], look[2]);
    }
    const p = m.player;
    const dx = centre.x - p.position.x;
    const dz = centre.z - p.position.z;
    const dy = centre.y - p.position.y;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.hypot(dx, dz))));
    m.tick(0.5);
    return {
      player: [p.position.x, p.position.y, p.position.z],
      target: [centre.x, centre.y, centre.z],
    };
  }, { position, target });
  if (result.error) throw new Error(`${name}: ${result.error}`);
  const before = await page.evaluate(() => window.mansion.framesRendered);
  await page.evaluate(() => window.mansion.setRendering(true));
  await page.waitForFunction((n) => window.mansion.framesRendered >= n + 3, before, { timeout: 180000 });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 120000 });
  await page.evaluate(() => window.mansion.setRendering(false));
  return { name, ...result };
}

const evidence = [];
try {
  await page.goto(`http://localhost:${PORT}/mansion.html?preview=1`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.mansion?.player, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById('startBtn').click());
  await page.waitForFunction(() => window.mansion.running === true, null, { timeout: 120000 });
  await page.waitForFunction(() => window.mansion.framesRendered > 3, null, { timeout: 180000 });
  await page.evaluate(() => window.mansion.setRendering(false));

  let shots = [
    ['kitchen-wide', [9.8, 1.2, 66.2], 'kitchen-island'],
    ['kitchen-sink', [14.0, 1.2, 61.5], 'kitchen-sink-faucet'],
    ['lou-suite-wide', [7.25, 10.6, 64.25], [-1.0, 11.55, 69.2]],
    ['lou-suite-bed', [0, 10.6, 68.2], 'suite-bed-headboard'],
    ['lou-suite-tub', [2.3, 10.6, 69.4], 'suite-tub-water'],
    ['bedroom-gothic', [-12.55, 6.0, 37.2], 'bed-west-front-headboard'],
    ['bedroom-old-timey', [12.55, 6.0, 37.2], 'bed-east-front-headboard'],
    ['bedroom-lake', [-12.55, 6.0, 64.6], 'bed-west-rear-headboard'],
    ['bedroom-modern', [12.55, 6.0, 64.6], 'bed-east-rear-headboard'],
    ['bedroom-prospect', [-12.55, -2.8, 67.0], 'guest-headboard'],
    ['lou-suite-lighting', [5.5, 10.6, 68.4], 'suite-bed-bench'],
    ['lou-suite-portrait', [-2.5, 10.6, 64.8], 'suite-lou-accent'],
    ['bedroom-gothic-cluster', [-12.55, 6.0, 37.2], 'gothic-packing-cluster'],
    ['bedroom-old-timey-cluster', [14.7, 6.0, 42.2], 'oldtime-washstand-cluster'],
    ['bedroom-lake-cluster', [-14.75, 6.0, 58.3], 'lake-writing-cluster'],
    ['bedroom-modern-cluster', [14.75, 6.0, 58.3], 'modern-dressing-cluster'],
    ['bedroom-prospect-cluster', [-12.55, -2.8, 67.0], 'prospect-dressing-cluster'],
  ];
  if (MODE === 'bedrooms') shots = shots.filter(([name]) => name.startsWith('bedroom-'));
  if (MODE === 'final') shots = shots.filter(([name]) => name === 'lou-suite-lighting'
    || name === 'lou-suite-portrait' || name.endsWith('-cluster'));
  if (MODE === 'suite') shots = shots.filter(([name]) => name === 'lou-suite-lighting'
    || name === 'lou-suite-portrait');
  for (const [name, position, target] of shots) {
    evidence.push(await capture(name, position, target));
    console.log(`  wrote ${name}.png`);
  }

  const gl = await page.evaluate(() => {
    const context = window.mansion.renderer.getContext();
    return {
      lost: context.isContextLost(),
      drawingBuffer: [context.drawingBufferWidth, context.drawingBufferHeight],
    };
  });
  const report = { label: LABEL, screenshots: evidence, gl, notFound: [...new Set(notFound)], errors };
  await fsp.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (gl.lost || gl.drawingBuffer.some((n) => n <= 0) || notFound.length || errors.length) {
    throw new Error(JSON.stringify(report));
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log(`Mansion room evidence: ${evidence.length}/${evidence.length} screenshots, zero runtime errors`);
