#!/usr/bin/env node
/**
 * On-foot livery walkaround shots for the Enola Squatch.
 *
 * Usage: node shots.mjs <outdir>
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const ROOT = '/home/user/SquatchSmash';
const OUT = process.argv[2] || '/tmp/shots';
const PORT = Number(process.env.PORT) || 5993;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const { chromium } = await import('playwright');

fs.mkdirSync(OUT, { recursive: true });

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
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)); });

await page.goto(`http://localhost:${PORT}/enolasquatch.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__squatch?.enolaSquatch === true, null, { timeout: 60000 });
await page.evaluate(() => document.getElementById('start-btn').click());
// let the art + gear resolve
await page.waitForFunction(() => window.__enolaSquatch.state().clubLogo.realArtworkApplied > 0,
  null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);

// Hide the checklist HUD so it doesn't cover the paint.
await page.evaluate(() => {
  for (const id of ['br-checklist', 'br-hud', 'enola-camera-tip', 'hud-subtitle', 'br-subs']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  document.querySelectorAll('#hud, .hud, #crosshair').forEach((e) => { e.style.opacity = '0.0'; });
});

const info = await page.evaluate(() => {
  const h = window.__enolaSquatch;
  const THREE = h.scene.constructor;
  const p = h.physics.position;
  const bomb = h.payload.group.getWorldPosition(new h.scene.children[0].position.constructor());
  return {
    aircraft: { x: p.x, y: p.y, z: p.z },
    quat: [h.physics.quat.x, h.physics.quat.y, h.physics.quat.z, h.physics.quat.w],
    bomb: { x: bomb.x, y: bomb.y, z: bomb.z },
    ground: h.groundHeight(p.x, p.z),
    phase: h.mission.phase,
  };
});
console.log(JSON.stringify(info, null, 2));

/**
 * Stand at a point in the AEROPLANE's local frame and look at another local
 * point. Both are converted to world through the aircraft group's matrix.
 */
async function shot(name, fromLocal, atLocal, { eye = 1.66, fov = 66 } = {}) {
  await page.evaluate(([from, at, eyeH, fovDeg]) => {
    const h = window.__enolaSquatch;
    const g = h.aircraft.group;
    g.updateMatrixWorld(true);
    const V = h.camera.position.constructor;
    const fw = new V(from[0], from[1], from[2]).applyMatrix4(g.matrixWorld);
    const aw = new V(at[0], at[1], at[2]).applyMatrix4(g.matrixWorld);
    const gy = h.groundHeight(fw.x, fw.z);
    h.player.position.set(fw.x, gy + eyeH, fw.z);
    h.player.ground = gy;
    h.player.velocity?.set?.(0, 0, 0);
    const dx = aw.x - fw.x, dy = aw.y - (gy + eyeH), dz = aw.z - fw.z;
    h.player.yaw = Math.atan2(-dx, -dz);
    h.player.pitch = Math.max(-1.5, Math.min(1.5, Math.atan2(dy, Math.hypot(dx, dz))));
    h.camera.fov = fovDeg;
    h.camera.updateProjectionMatrix();
    h.tick(1 / 60);
  }, [fromLocal, atLocal, eye, fov]);
  await page.waitForTimeout(160);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('  shot', name);
}

/** A free camera, for places a man cannot stand (under the bomb bay). */
async function freeShot(name, fromLocal, atLocal, fov = 60) {
  await page.evaluate(([from, at, fovDeg]) => {
    const h = window.__enolaSquatch;
    const g = h.aircraft.group;
    g.updateMatrixWorld(true);
    const V = h.camera.position.constructor;
    const fw = new V(from[0], from[1], from[2]).applyMatrix4(g.matrixWorld);
    const aw = new V(at[0], at[1], at[2]).applyMatrix4(g.matrixWorld);
    h.player.enabled = false;
    h.player.mode = 'frozen';
    window.__freeCam = { fw, aw, fovDeg };
    const loop = () => {
      const c = h.camera;
      c.position.copy(fw);
      c.up.set(0, 1, 0);
      c.lookAt(aw);
      c.fov = fovDeg;
      c.updateProjectionMatrix();
      c.updateMatrixWorld();
    };
    loop();
    window.__freeLoop && cancelAnimationFrame(window.__freeLoop);
    const spin = () => { loop(); window.__freeLoop = requestAnimationFrame(spin); };
    spin();
  }, [fromLocal, atLocal, fov]);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('  shot', name);
}

const SHOTS = JSON.parse(fs.readFileSync(process.env.SHOTLIST || path.join(path.dirname(new URL(import.meta.url).pathname), 'shotlist.json'), 'utf8'));
for (const s of SHOTS) {
  if (s.free) await freeShot(s.name, s.from, s.at, s.fov || 60);
  else await shot(s.name, s.from, s.at, { eye: s.eye ?? 1.66, fov: s.fov ?? 66 });
}

console.log('problems:', JSON.stringify(problems.slice(0, 10)));
await browser.close();
server.close();
