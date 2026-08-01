#!/usr/bin/env node
/**
 * Cast screenshots — the visual gate for the character restyle.
 *
 *   node tools/shots-cast.mjs [names...]
 *
 * Renders the people, not the logic: Lou at his desk, the stage, the floor,
 * the dealer, Margo, and a controlled side-by-side of a Bing patron against a
 * Squatchfather figure under identical light. Everything else in this repo
 * asserts numbers; this one exists so a human (or the agent doing the work)
 * can look at the faces and say whether they read as the same family.
 *
 * Software rendering, so every frame is expensive: small viewport, one frame
 * per shot, and the player is parked rather than the camera hijacked, so the
 * scene's own loop keeps drawing the same view instead of racing the capture.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5340;
const OUT = path.join(ROOT, 'docs', 'validation', '2026-08-01');
const ONLY = process.argv.slice(2);
const want = (name) => ONLY.length === 0 || ONLY.includes(name);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const { chromium } = await import('playwright');

/* A synthetic page that puts one Bing person beside one Squatchfather figure
 * under the same two lights and the same camera. Neither scene's lighting can
 * flatter one over the other, which is the only way to judge convergence. */
const STYLE_PAGE = `<!doctype html><meta charset="utf-8">
<title>style compare</title>
<style>html,body{margin:0;background:#15161c;overflow:hidden}</style>
<script type="importmap">{"imports":{"three":"./vendor/three.module.min.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { makePerson } from './src/bing/cast.js';
import { buildFigure } from './src/squatchfather/characters/Figure.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(760, 560);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15161c);
scene.add(new THREE.HemisphereLight(0xbfc6d8, 0x24202a, 1.15));
const key = new THREE.DirectionalLight(0xfff0dd, 1.5);
key.position.set(2.5, 4, 3.5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x88a0ff, 0.5);
rim.position.set(-3, 2, -2.5);
scene.add(rim);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 24),
  new THREE.MeshStandardMaterial({ color: 0x2a2b33, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Left: the Bing's builder. Right: the Squatchfather's, the target look.
const params = new URLSearchParams(location.search);
const dress = params.get('dress') || 'shirt';
/* Lou exactly as the club builds him, on his own, under light that is not
 * a desk lamp six inches from his face. */
const solo = params.get('solo');
const SOLO = {
  lou: {
    height: 1.8, build: 1.4, dress: 'shirt', shirt: 0x6f5a38,
    hairColour: 0x4a4a48, chain: 'gold', chainStyle: 'layered',
    pendant: true, pendantStyle: 'crest', neckline: 'v', luxury: true,
    shirtAccent: 0x9b825b, watch: 'gold', skin: 0xd2a074,
    face: 'assets/faces/lou.png', bandana: false,
  },
  booski: {
    height: 1.8, build: 1.2, dress: 'shirt', shirt: 0x20365f,
    hairColour: 0x2a1c14, skin: 0xd9a97f,
    neckline: 'v', luxury: true, shirtAccent: 0x405a86,
    chain: 'gold', chainStyle: 'layered', pendant: true,
    pendantStyle: 'crest', watch: 'gold',
    face: 'assets/faces/booski.png', bandana: false,
  },
  dancer: {
    role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
    height: 1.73, build: 1.08, dress: 'bikini',
    skin: 0xf0cba6, hairColour: 0xdcb04a, hair: 'long', shirt: 0xd94f9a,
  },
};

// Both builders put their face on +Z, so both face a camera parked on +Z.
const person = makePerson(solo ? SOLO[solo] : { height: 1.78, build: 1.15, dress, hair: 'short', shirt: 0x3a3f52 });
person.group.position.set(solo ? 0 : -0.55, 0, 0);
person.group.rotation.y = 0;
scene.add(person.group);

if (!solo) {
  const fig = buildFigure({ bulk: 1.05 });
  // Figure.js is authored at roughly 1.8m; park it beside the person unscaled.
  fig.group.position.set(0.55, 0, 0);
  fig.group.rotation.y = 0;
  scene.add(fig.group);
}

const camera = new THREE.PerspectiveCamera(40, 760 / 560, 0.1, 100);
const view = params.get('view') || 'full';
if (view === 'head') {
  camera.position.set(0, 1.62, solo ? 0.62 : 1.5);
  camera.lookAt(0, solo ? 1.66 : 1.52, 0);
} else {
  camera.position.set(0, 1.05, solo ? 2.95 : 2.7);
  camera.lookAt(0, 1.0, 0);
}

/* Keep drawing. A single render() leaves nothing for the compositor to
 * screenshot once the drawing buffer is swapped, and the capture comes back
 * empty — the classic blank-WebGL-screenshot trap. */
(function loop() {
  renderer.render(scene, camera);
  window.__styleReady = true;
  requestAnimationFrame(loop);
}());
</script>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/__style.html') {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    res.end(STYLE_PAGE);
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
await new Promise((r) => server.listen(PORT, r));
await fsp.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});

const shot = async (page, name) => {
  /* Software rendering warms up slowly and the first frames of a fresh page
   * come back empty, so wait for several real frames rather than one. */
  await page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    (function spin() {
      if (++n >= 6) return resolve();
      return requestAnimationFrame(spin);
    }());
  }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const { size } = await fsp.stat(path.join(OUT, `${name}.png`));
  console.log(`  wrote ${name}.png (${(size / 1024).toFixed(1)} kB)`);
};

/* ---------------------------------------------------------------- the Bing */
if (want('bing')) {
  const page = await browser.newPage({ viewport: { width: 760, height: 560 } });
  page.on('pageerror', (e) => console.error(`  [bing] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/bing.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__bing?.game.started, null, { timeout: 90000 });
  // These are character studies, not HUD studies.
  await page.addStyleTag({ content: '#hud, .hud, #objective, #clock, #cash, #prompt, #crosshair, #interact-prompt { display: none !important; }' });

  await page.evaluate(() => {
    const b = window.__bing;
    /* Drive the camera, not the player.
     *
     * Parking the player and letting the game place the camera sounds
     * tidier, and it is how the first pass worked, but the player is a body:
     * it collides. Ask for a close portrait and the solver shoves it back out
     * of the desk, and the frame ends up pointed at a wall. Silencing
     * _applyCamera hands the lens over for the rest of the session while
     * everything else in the club carries on updating normally. */
    b.player._applyCamera = () => {};
    const euler = new b.THREE.Euler(0, 0, 0, 'YXZ');
    window.__cam = (from, to) => {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const dz = to[2] - from[2];
      b.camera.position.set(from[0], from[1], from[2]);
      // A camera looks down its own -Z; everyone in the cast faces +Z.
      euler.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
      b.camera.quaternion.setFromEuler(euler);
      // Keep the player near the subject so proximity behaviour still fires
      b.player.position.set(from[0], 1.66, from[2]);
      return { from: from.map((n) => +n.toFixed(2)), to: to.map((n) => +n.toFixed(2)) };
    };
    /** Frame somebody: stand off along their own forward, eyes on their head. */
    window.__portrait = ({ key, dist = 2.2, side = 0, eye = null, lift = 0 }) => {
      const npc = b.cast.byName[key];
      const head = new b.THREE.Vector3();
      npc.group.updateMatrixWorld(true);
      npc.parts.head.getWorldPosition(head);
      const facing = npc.group.rotation.y;
      return window.__cam([
        npc.group.position.x + Math.sin(facing + side) * dist,
        eye ?? head.y + lift,
        npc.group.position.z + Math.cos(facing + side) * dist,
      ], [head.x, head.y + lift, head.z]);
    };
    window.__tick = (secs, step = 1 / 30) => {
      for (let t = 0; t < secs; t += step) b.club.update(step, b.player.position);
    };
  });

  // Let the club settle so nobody is caught in their build pose.
  await page.evaluate(() => window.__tick(3));

  // ---- Lou, close, in his office
  const louAim = await page.evaluate(() => {
    const b = window.__bing;
    b.cast.byName.lou.say(6);         // mouth working, which is the point
    // From his left, off the axis of the desk lamp, at his own eye level.
    return window.__portrait({ key: 'lou', dist: 0.82, side: -0.45, lift: 0.03 });
  });
  console.log(`  lou: camera ${louAim.from} -> head ${louAim.to}`);
  await page.evaluate(() => window.__tick(0.5));
  await shot(page, 'lou-office');

  // ---- Booskibro, turned out from the bar for an unobstructed outfit study
  const booskiAim = await page.evaluate(() => {
    const b = window.__bing;
    const booski = b.family.byId.booski;
    booski.targetYaw = undefined;
    booski.group.rotation.y = Math.PI / 2;
    booski.say(6);
    return window.__portrait({ key: 'booski', dist: 0.92, side: -0.18, lift: 0.02 });
  });
  console.log(`  booski: camera ${booskiAim.from} -> head ${booskiAim.to}`);
  await page.evaluate(() => window.__tick(0.5));
  await shot(page, 'booski-bar');

  /* ---- the four performers on the stage
   * The club's stage is close to unlit at this point in the evening, which is
   * correct for the room and useless for judging a costume. These two frames
   * get a capture-only fill light that is removed straight afterwards; it is
   * not part of the scene. */
  await page.evaluate(() => {
    const b = window.__bing;
    const a = b.club.anchors;
    const mid = a.poles[1];
    // In front of the pole line and above it, so it lights faces and fronts
    for (const [dz, power] of [[2.6, 30], [-1.0, 14]]) {
      const fill = new b.THREE.PointLight(0xffe8d0, power, 16, 2);
      fill.position.set(mid.x, (mid.y || 0) + 2.9, mid.z + dz);
      fill.name = `__shotFill${dz}`;
      b.scene.add(fill);
    }
  });
  await page.evaluate(() => window.__tick(4));

  /* Stand where a customer stands: on the floor beyond the runway tip,
   * looking down the stage at the pole line. Framing off a dancer's own
   * facing does not work here -- during pole work she is turning, so the
   * camera swung somewhere different on every run. */
  await page.evaluate(() => {
    const mid = window.__bing.club.anchors.poles[1];
    window.__cam([mid.x + 1.1, 1.72, -0.2], [mid.x, (mid.y || 0) + 1.25, mid.z]);
  });
  await shot(page, 'performers-stage');

  await page.evaluate(() => window.__tick(2.5));
  await page.evaluate(() => {
    // Off to the side so the pole is not standing down the middle of her
    const p = window.__bing.club.anchors.poles[0];
    window.__cam([p.x + 1.5, (p.y || 0) + 1.3, p.z + 2.0], [p.x, (p.y || 0) + 1.15, p.z]);
  });
  await shot(page, 'performers-close');
  await page.evaluate(() => {
    const b = window.__bing;
    for (const n of ['__shotFill2.6', '__shotFill-1']) {
      const fill = b.scene.getObjectByName(n);
      if (fill) b.scene.remove(fill);
    }
  });

  /* ---- the floor, wide
   * Shot from the bar end, which is the one part of the room with enough
   * light on it to show a dozen people at once. */
  await page.evaluate(() => {
    // Across the room from the tables toward the stage: the one angle that
    // gets the booths, the blackjack table and the stage in one frame.
    window.__cam([-4.6, 2.05, 3.4], [-12.5, 1.15, -5.2]);
  });
  await page.evaluate(() => window.__tick(1));
  await shot(page, 'floor-crowd');

  // ---- the blackjack dealer
  await page.evaluate(() => window.__portrait({ key: 'dealer', dist: 1.35, side: 0.28 }));
  await page.evaluate(() => window.__tick(1));
  await shot(page, 'blackjack-dealer');

  /* ---- the bartender, close, as the in-situ style reference.
   * The coat-check pair were the obvious choice and are standing in the one
   * unlit corner of the club; the bar has light on it. */
  await page.evaluate(() => {
    window.__bing.cast.byName.bartender.say(6);
    return window.__portrait({ key: 'bartender', dist: 1.15, side: 0.4 });
  });
  await page.evaluate(() => window.__tick(0.5));
  await shot(page, 'bing-patron');

  await page.close();
}

/* -------------------------------- arrival car, phone and Booski's shot beat */
if (want('arrival')) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', (e) => console.error(`  [arrival] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/bing.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  /* These frames verify geometry and blocking, not decode coverage. The full
   * scene verifier exercises the audio manifest; making a three-frame visual
   * contact sheet wait for the entire club voice bank just makes it flaky. */
  await page.evaluate(() => {
    window.__bing.audio.loadManifest = async () => ({ loaded: 0, total: 0 });
  });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__bing?.game.started, null, { timeout: 90000 });
  await page.evaluate(() => {
    const b = window.__bing;
    b.postfx.disable?.();
    for (let i = 0; i < 80; i++) b.player.update(1 / 60);
    b.game.paused = true;
    document.querySelectorAll('#hud > *').forEach((el) => { el.dataset.arrivalDisplay = el.style.display; });
  });
  await page.addStyleTag({
    content: '#hud > * { display:none !important; } #hud #phone-osd { display:block !important; }',
  });
  await shot(page, 'bing-arrival-car-interior');

  await page.evaluate(() => {
    const b = window.__bing;
    b.campaign.addItem('phone');
    b.showPhone(true);
    /* The scene is paused for deterministic captures, so its normal frame
     * loop is not available to repaint the phone after raising it. */
    b.phone.draw();
  });
  await shot(page, 'bing-phone-large');

  await page.evaluate(() => {
    const b = window.__bing;
    b.showPhone(false);
    b.teleport(-17.3, 1.5, Math.PI / 2);
    b.player.pitch = -0.08;
    b.dialogue.start(b.familyScripts.booski, 'open', b.family.byId.booski, { resume: true });
    b.dialogue.choose(0);
    for (let t = 0; t < 30 && !b.game.beat; t += 0.1) {
      b.dialogue.update(0.1, b.player.position);
    }
    for (let t = 0; t < 0.9 && b.game.beat; t += 1 / 30) {
      b.game.beat(1 / 30);
      b.cast.byName.bartender.update(1 / 30, b.player.position);
    }
    b.player.update(0.016);
    b.game.paused = true;
  });
  await shot(page, 'bing-booski-bartender-pour');
  await page.close();
}

/* ------------------------------------------------- measurements, not looks */
/* The dance squats, and verify-bing measures each performer's bounding box
 * against a 1.55--1.95 m window at one arbitrary moment. Sweep the whole
 * routine and report the extremes, so the margin is known rather than hoped
 * for. Also sweeps the seated drinkers' floor clearance. */
if (want('probe')) {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  page.on('pageerror', (e) => console.error(`  [probe] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/bing.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__bing?.game.started, null, { timeout: 90000 });
  const report = await page.evaluate(() => {
    const b = window.__bing;
    const performers = Object.entries(b.cast.byName)
      .filter(([key]) => key.startsWith('performer'))
      .map(([key, npc]) => ({ key, npc, min: Infinity, max: -Infinity }));
    const drinkers = b.cast.all.filter((npc) => npc.job === 'drink');
    let worstFloor = Infinity;
    // 40 s at the mover cadence covers several complete four-bar routines
    for (let i = 0; i < 1200; i += 1) {
      for (const p of performers) p.npc.update(1 / 30, b.player.position);
      for (const p of performers) {
        p.npc.group.updateMatrixWorld(true);
        const h = new b.THREE.Box3().setFromObject(p.npc.group).getSize(new b.THREE.Vector3()).y;
        p.min = Math.min(p.min, h);
        p.max = Math.max(p.max, h);
      }
    }
    for (const npc of drinkers) {
      npc.group.updateMatrixWorld(true);
      worstFloor = Math.min(worstFloor, new b.THREE.Box3().setFromObject(npc.group).min.y);
    }
    return {
      performers: performers.map((p) => ({
        key: p.key, min: +p.min.toFixed(3), max: +p.max.toFixed(3),
      })),
      worstFloor: +worstFloor.toFixed(3),
      drift: performers.map((p) => +Math.hypot(
        p.npc.group.position.x - p.npc.homeX, p.npc.group.position.z - p.npc.homeZ,
      ).toFixed(3)),
    };
  });
  console.log('  performer bbox height over a full routine (gate: 1.55 < h < 1.95):');
  for (const p of report.performers) {
    const ok = p.min > 1.55 && p.max < 1.95 ? 'ok  ' : 'FAIL';
    console.log(`    ${ok} ${p.key}: ${p.min} .. ${p.max}`);
  }
  console.log(`  seated drinker lowest point (gate: > -0.08): ${report.worstFloor}`);
  console.log(`  dancer drift from home after 40 s: ${report.drift.join(', ')}`);
  await page.close();
}

/* ------------------------------------------------------------ Silver Room */
if (want('silver')) {
  const page = await browser.newPage({ viewport: { width: 760, height: 560 } });
  page.on('pageerror', (e) => console.error(`  [silver] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/silver.html?preview=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  // Clicked in-page rather than through the mouse: the start panel is taller
  // than this viewport, so Playwright cannot reach the button itself.
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.__silver?.game.started, null, { timeout: 120000 });
  await page.addStyleTag({ content: '#hud, .hud, #objective, #clock, #cash, #prompt, #crosshair, #interact-prompt { display: none !important; }' });
  /* The evening opens on a dark street. Jump to the dining room and put her
   * in her chair -- that is where Margo is a character rather than a
   * silhouette getting out of a taxi. */
  const margoAim = await page.evaluate(() => {
    const s = window.__silver;
    s.debug.phase('table');
    s.debug.seatHer();
    const d = s.date;
    d.npc.say(9);

    /* The evening is a script and it wants her out on the pavement getting
     * out of a taxi. Software rendering takes about a second a frame, so by
     * the time the capture lands she has walked off. Freeze her own update
     * and re-assert both her transform and the camera every frame until the
     * screenshot is taken. */
    d.update = () => {};
    s.player._applyCamera = () => {};
    d.group.updateMatrixWorld(true);
    const seat = d.group.position.clone();
    const seatYaw = d.group.rotation.y;
    const head = new s.THREE.Vector3();
    d.npc.parts.head.getWorldPosition(head);

    /* House lights are down for the band -- correct for the room, and it
     * leaves her a silhouette. Capture-only fill, removed after the frame. */
    const fill = new s.THREE.PointLight(0xffe2c0, 24, 4.5, 2);
    fill.position.set(seat.x + 0.75, seat.y + 2.2, seat.z + 0.75);
    fill.name = '__shotFill';
    s.scene.add(fill);

    /* Frame her from the table rather than from her own forward vector. She
     * is in a high-backed dining chair, and a stand-off computed off her yaw
     * put the camera behind it -- the shot came back as a photograph of
     * upholstery. The table is the one direction guaranteed to be clear,
     * because it is the direction she is looking. */
    const table = s.room.anchors.frontTable;
    const away = new s.THREE.Vector3(table.x - seat.x, 0, table.z - seat.z);
    if (away.lengthSq() < 1e-4) away.set(Math.sin(seatYaw), 0, Math.cos(seatYaw));
    away.normalize();
    const dist = 0.66;
    const from = [
      seat.x + away.x * dist,
      head.y + 0.1,
      seat.z + away.z * dist,
    ];
    const euler = new s.THREE.Euler(
      Math.atan2(head.y - from[1], Math.hypot(head.x - from[0], head.z - from[2])),
      Math.atan2(-(head.x - from[0]), -(head.z - from[2])), 0, 'YXZ',
    );
    (function pin() {
      d.group.position.copy(seat);
      d.group.rotation.y = seatYaw;
      s.camera.position.set(from[0], from[1], from[2]);
      s.camera.quaternion.setFromEuler(euler);
      s.player.position.set(from[0], from[1], from[2]);
      requestAnimationFrame(pin);
    }());
    return { from: from.map((n) => +n.toFixed(2)), head: head.toArray().map((n) => +n.toFixed(2)) };
  });
  console.log(`  margo: camera ${margoAim.from} -> head ${margoAim.head}`);
  await shot(page, 'margo-silver');
  await page.evaluate(() => {
    const s = window.__silver;
    const fill = s.scene.getObjectByName('__shotFill');
    if (fill) s.scene.remove(fill);
  });
  await page.close();
}

/* ------------------------------------------------- controlled A/B of style */
if (want('style')) {
  /* The first page a fresh browser process renders comes back blank under
   * swiftshader however long you wait for frames, so burn one on purpose. */
  const warm = await browser.newPage({ viewport: { width: 760, height: 560 } });
  await warm.goto(`http://localhost:${PORT}/__style.html`, { waitUntil: 'load' });
  await warm.waitForFunction(() => window.__styleReady, null, { timeout: 30000 });
  await warm.waitForTimeout(500);
  await warm.close();

  for (const [name, query] of [
    ['style-side-by-side', ''],
    ['style-heads', '?view=head'],
    ['style-suit', '?dress=suit'],
    ['lou-face-neutral', '?solo=lou&view=head'],
    ['lou-full-neutral', '?solo=lou'],
    ['booski-face-neutral', '?solo=booski&view=head'],
    ['booski-full-neutral', '?solo=booski'],
    ['dancer-neutral', '?solo=dancer'],
  ]) {
    const page = await browser.newPage({ viewport: { width: 760, height: 560 } });
    page.on('pageerror', (e) => console.error(`  [style] pageerror: ${e.message.slice(0, 300)}`));
    page.on('console', (m) => { if (m.type() === 'error') console.error(`  [style] ${m.text().slice(0, 300)}`); });
    page.on('requestfailed', (r) => console.error(`  [style] failed ${r.url()} ${r.failure()?.errorText}`));
    await page.goto(`http://localhost:${PORT}/__style.html${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__styleReady, null, { timeout: 30000 });
    if (!await page.evaluate(() => document.querySelectorAll('canvas').length)) {
      console.error(`  [style] no canvas on ${name}`);
    }
    await shot(page, name);
    await page.close();
  }
}

await browser.close();
server.close();
console.log(`\nshots in ${path.relative(ROOT, OUT)}`);
