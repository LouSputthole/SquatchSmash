#!/usr/bin/env node
/**
 * Live-WebGL proof that the 2026-08-14 asset diet (PNG -> JPG/WebP conversions,
 * WebP re-encodes, face downscales) still decodes onto the walls it dresses.
 *
 * Boots the three scenes that hang converted art -- the Bing, Squatchfather
 * and the Mansion -- on a local static server, waits for each scene's own
 * `artReady`, points the camera at every slot that took a converted file, and
 * writes one 1280x720 view per shot plus a report into
 * docs/validation/2026-08-15-asset-diet/. A broken path shows up here as a
 * slot whose `real` flag stays false, a 404 in the report, or a blank plate in
 * the PNG.
 *
 * Modeled on tools/verify-mansion-art.mjs and tools/capture-mansion-dynasty-art.mjs.
 * PORT env overrides the default (parallel agents share the box). Optional
 * positional args restrict the run: `bing`, `squatchfather`, `mansion`.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 56031;
const OUT = path.join(ROOT, 'docs', 'validation', '2026-08-15-asset-diet');
const ONLY = new Set(process.argv.slice(2));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

/* Camera positions: for the Bing and the Mansion these are player-standing
 * positions (Bing eye height is 1.66; Mansion teleports take floor height);
 * for Squatchfather they are camera positions directly. `slots` are the art
 * slots the camera is aimed at (centre of their union) and reported on. A
 * null Mansion position is resolved from the mansion-art evidence contract. */
const SHOTS = {
  bing: [
    {
      name: '01-bing-hallway-first-four', room: 'Bing rear hall, first four portraits',
      slots: ['bing.hallway.uncle_lou', 'bing.hallway.rippinflow', 'bing.hallway.booskibro', 'bing.hallway.shubenator'],
      position: [7.4, 1.66, -7.25],
    },
    {
      name: '02-bing-hallway-down-the-row', room: 'Bing rear hall, down the gallery',
      slots: ['bing.hallway.rippinflow', 'bing.hallway.sauce', 'bing.hallway.hogmama', 'bing.hallway.eric', 'bing.hallway.seff'],
      position: [7.1, 1.66, -9.2],
    },
    {
      name: '03-bing-hallway-family-webps', room: 'Bing rear hall, re-encoded family portraits',
      slots: ['bing.hallway.sauce', 'bing.hallway.lag', 'bing.hallway.hogmama', 'bing.hallway.ape', 'bing.hallway.eric', 'bing.hallway.irish', 'bing.hallway.seff'],
      position: [7.4, 1.66, -1.25],
    },
    {
      name: '04-bing-office-squatches-bing', room: "Lou's office at the Bing, behind the desk",
      slots: ['bing.office.squatches_bing'],
      position: [12.9, 1.66, -7.1],
    },
    {
      name: '05-bing-office-noir', room: "Lou's office at the Bing, east wall",
      slots: ['bing.office.noir_print'],
      position: [11.5, 1.66, -6.2],
    },
  ],
  squatchfather: [
    {
      name: '06-squatchfather-coast', room: 'Squatchfather dining room, coast print',
      slots: ['squatchfather.dining.coast'],
      position: [-3.6, 1.75, 10.5],
    },
    {
      name: '07-squatchfather-portraits-upper', room: 'Squatchfather dining room, upper portrait row',
      slots: ['squatchfather.portrait.uncle_lou', 'squatchfather.portrait.rippinflow', 'squatchfather.portrait.booskibro', 'squatchfather.portrait.shubenator'],
      position: [4.3, 2.0, 3.9],
    },
    {
      name: '08-squatchfather-portraits-lower', room: 'Squatchfather dining room, lower portrait row',
      slots: ['squatchfather.portrait.hogmama', 'squatchfather.portrait.ape', 'squatchfather.portrait.eric', 'squatchfather.portrait.irish', 'squatchfather.portrait.seff'],
      position: [4.3, 1.4, 5.25],
    },
  ],
  mansion: [
    {
      name: '09-mansion-office-hog-mama', room: "Lou's office in the Mansion, north pier",
      slots: ['mansion.office.hogmama'],
      position: [0, 6.0, 71.2],
    },
    {
      name: '10-mansion-gallery-roster', room: 'Mansion upper gallery, roster',
      slots: ['mansion.gallery.roster'],
      position: null,
    },
    {
      name: '11-mansion-winter-almighty', room: 'Mansion winter garden, the Almighty',
      slots: ['mansion.winter.almighty'],
      position: null,
    },
  ],
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

const results = [];
function check(label, ok, payload) {
  results.push({ label, ok, payload });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label} - ${JSON.stringify(payload)}`);
}

/* Installed into each page as window.__describeSlots: find each slot's mesh,
 * describe what is decoded onto it, and return the union centre to aim at. */
function describeSlots(scene, slots, T) {
  const found = new Map();
  scene.traverse((o) => {
    const slot = o.userData?.art?.slot;
    if (slot && slots.includes(slot)) found.set(slot, o);
  });
  const union = new T.Box3();
  const items = slots.map((slot) => {
    const mesh = found.get(slot);
    if (!mesh) return { slot, missing: true };
    mesh.updateWorldMatrix(true, false);
    const box = new T.Box3().setFromObject(mesh);
    union.union(box);
    const map = mesh.material?.map;
    const image = map?.image ?? map?.source?.data ?? null;
    return {
      slot,
      file: mesh.userData.art.file ?? null,
      real: mesh.userData.art.real === true,
      mapped: Boolean(map),
      image: [image?.naturalWidth ?? image?.width ?? 0, image?.naturalHeight ?? image?.height ?? 0],
      centre: box.getCenter(new T.Vector3()).toArray().map((v) => +v.toFixed(3)),
    };
  });
  return { items, centre: union.isEmpty() ? null : union.getCenter(new T.Vector3()).toArray() };
}
const DESCRIBE_TAG = `window.__describeSlots = ${describeSlots.toString()};`;

async function launch() {
  return chromium.launch({
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
}

function wirePage(page, sink) {
  page.on('pageerror', (error) => sink.errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') sink.errors.push(message.text().slice(0, 300)); });
  page.on('response', (response) => {
    if (response.status() === 404) sink.notFound.push(new URL(response.url()).pathname);
  });
}

async function writeDataUrl(name, dataUrl) {
  const file = path.join(OUT, `${name}.png`);
  await fsp.writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`  wrote ${path.basename(file)}`);
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

const evidence = [];
const sinks = {};

/* ------------------------------------------------------------------ Bing */
async function captureBing(browser) {
  const sink = { errors: [], notFound: [] };
  sinks.bing = sink;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  wirePage(page, sink);
  await page.goto(`http://localhost:${PORT}/bing.html`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__bing?.carRadio && window.__bing?.campaign, null, { timeout: 180000 });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__bing?.game.started, null, { timeout: 180000 });
  await page.addScriptTag({ content: DESCRIBE_TAG });
  await page.evaluate(async () => {
    const b = window.__bing;
    b.postfx.disable?.();
    await b.club.artReady;
  });
  for (const shot of SHOTS.bing) {
    const out = await page.evaluate((shot) => {
      const b = window.__bing;
      const desc = window.__describeSlots(b.scene, shot.slots, b.THREE);
      if (!desc.centre) return { error: `no slot of ${shot.slots.join(',')} found` };
      b.game.seatedIn = null;
      b.player.mode = 'walk';
      b.player._tween = null;
      b.player.yawCenter = null;
      b.player.position.set(shot.position[0], shot.position[1], shot.position[2]);
      const [cx, cy, cz] = desc.centre;
      const dx = cx - b.player.position.x;
      const dz = cz - b.player.position.z;
      const dy = cy - b.player.position.y;
      b.player.yaw = Math.atan2(-dx, -dz);
      b.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      b.player.velocity?.set(0, 0, 0);
      b.player.update(0.016);
      b.camera.updateMatrixWorld(true);
      b.renderer.render(b.scene, b.camera);
      return { desc, dataUrl: b.renderer.domElement.toDataURL('image/png') };
    }, shot);
    if (out.error) throw new Error(out.error);
    const screenshot = await writeDataUrl(shot.name, out.dataUrl);
    evidence.push({ scene: 'bing', name: shot.name, room: shot.room, screenshot, slots: out.desc.items });
  }
  await page.close();
}

/* --------------------------------------------------------- Squatchfather */
async function captureSquatchfather(browser) {
  const sink = { errors: [], notFound: [] };
  sinks.squatchfather = sink;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  wirePage(page, sink);
  await page.goto(`http://localhost:${PORT}/squatchfather.html?preview=1`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.squatchfather?.fsm, null, { timeout: 180000 });
  await page.addScriptTag({ content: DESCRIBE_TAG });
  await page.evaluate(async () => { await window.squatchfather.sceneState.artReady; });
  for (const shot of SHOTS.squatchfather) {
    /* The Squatchfather handle does not export THREE; the page's own vendored
     * module is the same instance the scene was built with. */
    const out = await page.evaluate(async (shot) => {
      const sf = window.squatchfather;
      const T = await import('/vendor/three.module.min.js');
      const desc = window.__describeSlots(sf.scene, shot.slots, T);
      if (!desc.centre) return { error: `no slot of ${shot.slots.join(',')} found` };
      const cam = sf.camera;
      cam.position.set(shot.position[0], shot.position[1], shot.position[2]);
      cam.lookAt(desc.centre[0], desc.centre[1], desc.centre[2]);
      cam.updateMatrixWorld(true);
      sf.scene.updateMatrixWorld(true);
      sf.renderer.render(sf.scene, cam);
      return { desc, dataUrl: sf.renderer.domElement.toDataURL('image/png') };
    }, shot);
    if (out.error) throw new Error(out.error);
    const screenshot = await writeDataUrl(shot.name, out.dataUrl);
    evidence.push({ scene: 'squatchfather', name: shot.name, room: shot.room, screenshot, slots: out.desc.items });
  }
  await page.close();
}

/* --------------------------------------------------------------- Mansion */
async function captureMansion(browser) {
  const sink = { errors: [], notFound: [] };
  sinks.mansion = sink;
  const { MANSION_ART_EVIDENCE_SHOTS } = await import('./mansion-art-evidence-contract.mjs');
  const contractPosition = (slot) => MANSION_ART_EVIDENCE_SHOTS.find((s) => s.slot === slot)?.position ?? null;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  wirePage(page, sink);
  await page.goto(`http://localhost:${PORT}/mansion.html?preview=1`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.mansion?.player, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById('startBtn').click());
  await page.waitForFunction(() => window.mansion.running === true, null, { timeout: 180000 });
  await page.waitForFunction(() => window.mansion.framesRendered > 3, null, { timeout: 180000 });
  await page.addScriptTag({ content: DESCRIBE_TAG });
  await page.evaluate(async () => {
    await window.mansion.interior.artReady;
    window.mansion.setRendering(false);
  });
  for (const shot of SHOTS.mansion) {
    const position = shot.position ?? contractPosition(shot.slots[0]);
    if (!position) throw new Error(`${shot.name}: no camera position`);
    const desc = await page.evaluate(({ shot, position }) => {
      const m = window.mansion;
      const desc = window.__describeSlots(m.scene, shot.slots, m.THREE);
      if (!desc.centre) return { error: `no slot of ${shot.slots.join(',')} found` };
      m.teleport(position[0], position[1], position[2], 0);
      m.scene.updateMatrixWorld(true);
      const [cx, cy, cz] = desc.centre;
      const player = m.player;
      const dx = cx - player.position.x;
      const dz = cz - player.position.z;
      const dy = cy - player.position.y;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.max(player.pitchMin, Math.min(player.pitchMax,
        Math.atan2(dy, Math.hypot(dx, dz))));
      player.update(1 / 60);
      m.scene.updateMatrixWorld(true);
      m.camera.updateMatrixWorld(true);
      m.camera.updateProjectionMatrix();
      return desc;
    }, { shot, position });
    if (desc.error) throw new Error(desc.error);
    const file = path.join(OUT, `${shot.name}.png`);
    const before = await page.evaluate(() => window.mansion.framesRendered);
    await page.evaluate(() => window.mansion.setRendering(true));
    await page.waitForFunction((frame) => window.mansion.framesRendered >= frame + 4, before, { timeout: 180000 });
    await page.screenshot({ path: file, timeout: 120000 });
    await page.evaluate(() => window.mansion.setRendering(false));
    console.log(`  wrote ${path.basename(file)}`);
    evidence.push({
      scene: 'mansion', name: shot.name, room: shot.room,
      screenshot: path.relative(ROOT, file).replaceAll('\\', '/'), slots: desc.items,
    });
  }
  await page.close();
}

let browser;
let failed = false;
try {
  browser = await launch();
  const runs = [
    ['bing', captureBing],
    ['squatchfather', captureSquatchfather],
    ['mansion', captureMansion],
  ].filter(([name]) => ONLY.size === 0 || ONLY.has(name));
  for (const [name, run] of runs) {
    console.log(`\n${name}`);
    try {
      await run(browser);
    } catch (err) {
      failed = true;
      console.log(`  FAIL  ${name} capture threw - ${err.message}`);
      results.push({ label: `${name} capture`, ok: false, payload: err.message });
    }
  }
  for (const item of evidence) {
    for (const slot of item.slots) {
      check(`${item.name}: ${slot.slot} carries its delivered file, decoded`,
        !slot.missing && slot.real && slot.mapped && slot.image[0] > 0 && slot.image[1] > 0,
        { file: slot.file, image: slot.image });
    }
  }
  for (const [name, sink] of Object.entries(sinks)) {
    check(`${name}: no 404s and no runtime errors while the art loaded`,
      sink.notFound.length === 0 && sink.errors.length === 0,
      { notFound: [...new Set(sink.notFound)], errors: sink.errors.slice(0, 8) });
  }
} finally {
  await browser?.close();
  server.close();
}

const ok = !failed && results.every((r) => r.ok);
await fsp.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify({
  generated: new Date().toISOString(),
  ok,
  shots: evidence,
  checks: results,
}, null, 2)}\n`);
console.log(`\n${ok ? 'PASS' : 'FAIL'}: ${results.filter((r) => r.ok).length}/${results.length} checks; report at ${path.relative(ROOT, OUT).replaceAll('\\', '/')}/report.json`);
process.exit(ok ? 0 : 1);
