#!/usr/bin/env node
/**
 * On-foot livery walkaround shots of the Enola Squatch, plus the measurements
 * behind them.
 *
 * Written on 2026-08-06, after a pass that had "verified" the nose art from a
 * chase camera thirty metres dead astern and consequently could not see that
 * half the paint on the bomb was inside the fuselage. Everything here is shot
 * from where a man actually stands: the two flanks from three to five metres
 * abeam at eye height, and the payload from under the wing.
 *
 * Camera placements are given in the AEROPLANE's own frame (+X port, +Z nose,
 * y 0 at the fuselage centreline, tarmac at y -3.0) and converted through the
 * aircraft group's matrix, so a shot list stays valid wherever on the field
 * the aeroplane happens to be parked.
 *
 * Also dumps `measurements.json`: the world/local extents of every decal, and
 * a full-scene traversal for negative scales — the MIRRORED defect
 * `tools/scene-audit.mjs` names, which is the thing that would break if
 * anybody ever "mirrored" the nose art onto the far flank with `scale.x = -1`.
 *
 * Usage: PORT=5993 node tools/shots-enola-livery.mjs <outdir>
 *        SHOTLIST=<file.json> to override the shot list.
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

const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.setDefaultTimeout(180000);
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
  const p = h.physics.position;
  const round = (v) => Math.round(v * 1000) / 1000;

  /* Every decal's extent, in the frame of the thing it is painted on: the
   * aeroplane for the nose art and the badges, the casing for the bomb's. */
  const extents = (root, node) => {
    node.updateWorldMatrix(true, false);
    root.updateWorldMatrix(true, false);
    const g = node.geometry;
    if (!g) return null;
    const pos = g.attributes.position;
    const inv = root.matrixWorld.clone().invert();
    const V = h.camera.position.constructor;
    const v = new V();
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld).applyMatrix4(inv);
      lo[0] = Math.min(lo[0], v.x); hi[0] = Math.max(hi[0], v.x);
      lo[1] = Math.min(lo[1], v.y); hi[1] = Math.max(hi[1], v.y);
      lo[2] = Math.min(lo[2], v.z); hi[2] = Math.max(hi[2], v.z);
    }
    return {
      name: node.name,
      visible: node.visible,
      x: [round(lo[0]), round(hi[0])],
      y: [round(lo[1]), round(hi[1])],
      z: [round(lo[2]), round(hi[2])],
      scale: [node.scale.x, node.scale.y, node.scale.z].map(round),
    };
  };

  /* The MIRRORED audit, over the WHOLE scene rather than the aeroplane: a
   * negative scale on any axis turns a mesh inside out. */
  const mirrored = [];
  let objects = 0;
  h.scene.traverse((o) => {
    objects++;
    if (o.scale && (o.scale.x < 0 || o.scale.y < 0 || o.scale.z < 0)) {
      mirrored.push({ name: o.name || o.type, scale: [o.scale.x, o.scale.y, o.scale.z] });
    }
  });

  const ac = h.aircraft;
  const pay = h.payload;
  return {
    phase: h.mission.phase,
    aircraft: { x: round(p.x), y: round(p.y), z: round(p.z) },
    ground: round(h.groundHeight(p.x, p.z)),
    sceneObjects: objects,
    negativeScales: mirrored,
    noseArt: [...(ac.parts.noseArt || [])].map((m) => extents(ac.group, m)),
    aircraftCrests: [...(ac.parts.clubLogo || [])].map((m) => extents(ac.group, m)),
    bombCrests: [...(pay.parts.clubLogo || [])].map((m) => extents(pay.group, m)),
    bombPlacard: pay.parts.placard ? [extents(pay.group, pay.parts.placard)] : [],
    bombStickers: [...(pay.parts.stickers || [])].map((m) => extents(pay.group, m)),
    /* The bomb's own local y above which the casing is inside the fuselage —
     * the belly is at aeroplane-local y -1.7 and the mount hangs below it. */
    bombBellyLine: round(-1.7 - ((pay.group.parent?.position.y ?? 0) + pay.group.position.y)),
  };
});
fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(info, null, 2));
console.log(JSON.stringify({
  negativeScales: info.negativeScales, sceneObjects: info.sceneObjects, bombBellyLine: info.bombBellyLine,
}, null, 2));

/**
 * Stand at a point in the AEROPLANE's local frame and look at another local
 * point. Both are converted to world through the aircraft group's matrix.
 */
async function shot(name, fromLocal, atLocal, { eye = 1.66, fov = 66 } = {}) {
  await page.evaluate(([from, at, eyeH, fovDeg]) => {
    const h = window.__enolaSquatch;
    window.__freeCam = null;                 // give the camera back to the man
    h.player.enabled = true;
    h.player.mode = 'walk';
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
  await page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 180000, animations: 'disabled' });
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
    /* The composition root writes the camera from the player and then renders
     * in the SAME frame callback, so anything we set from our own rAF is
     * overwritten before it is ever drawn. Overriding `render` is the only
     * hook that is guaranteed to be the last word on the matrix. */
    const r = h.renderer;
    if (!r.__origRender) r.__origRender = r.render.bind(r);
    window.__freeCam = { fw, aw, fovDeg };
    r.render = (scene, cam) => {
      const f = window.__freeCam;
      if (f) {
        cam.position.copy(f.fw);
        cam.up.set(0, 1, 0);
        cam.lookAt(f.aw);
        cam.fov = f.fovDeg;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld(true);
      }
      r.__origRender(scene, cam);
    };
  }, [fromLocal, atLocal, fov]);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 180000, animations: 'disabled' });
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
