#!/usr/bin/env node
/**
 * Verify the apartment computer as one lifecycle rather than six unrelated
 * demos: sit down, launch every installed app, return to the desktop, leave
 * the chair, and resume a framed game without losing the apartment.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_HOLD, EXIT_LABEL } from '../src/arcade/webapp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5207;
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
  console.error('playwright is not installed; cannot verify the apartment computer.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, path.normalize(rel));
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
const context = await browser.newContext({ viewport: { width: 720, height: 450 } });
const page = await context.newPage();

/*
 * DOOM is deliberately cross-origin, and its availability is not an apartment
 * lifecycle invariant -- CI has no business depending on somebody else's host.
 *
 * But an ABORTED request leaves an empty frame that swallows nothing, and the
 * whole reason the way out is shaped the way it is, is that the real page
 * takes the keyboard and eats every key including Tab. So the request is
 * fulfilled from here instead, with a stand-in served under mrdoob's origin
 * -- genuinely cross-origin, genuinely a sealed box, genuinely deaf to us --
 * and the escape route is tested against a frame that behaves like the real
 * one rather than against a hole where it should be.
 */
const DOOM_STANDIN = `<!doctype html><meta charset="utf-8"><title>DOOM</title>
<style>html,body{margin:0;height:100%;background:#1a0505;cursor:crosshair}</style>
<canvas id="c" style="position:fixed;inset:0"></canvas>
<script>
  const swallowed = [];
  window.SWALLOWED = swallowed;
  addEventListener('keydown', (e) => { swallowed.push(e.code); e.preventDefault(); e.stopPropagation(); }, true);
  addEventListener('keyup', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
  const c = document.getElementById('c');
  const g = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  g.fillStyle = '#1a0505'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#c0392b'; g.font = 'bold 44px monospace'; g.textAlign = 'center';
  g.fillText('DOOM', c.width / 2, c.height / 2);
<\/script>`;
await page.route('https://mrdoob.github.io/**', (route) => route.fulfill({
  status: 200, contentType: 'text/html; charset=utf-8', body: DOOM_STANDIN,
}));

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

async function computerState() {
  return page.evaluate(() => {
    const game = window.__squatch;
    const app = game.arcade.app;
    return {
      seated: game.game.seated,
      playerMode: game.player.mode,
      paused: game.game.paused,
      osMode: game.arcade.mode,
      inputMode: game.arcade.inputMode,
      appId: app?.id ?? null,
      cursor: { ...game.arcade.cursor },
      exitHintText: game.arcade.exitHintText,
      apps: game.arcade.apps.map(({ id, label }) => ({ id, label })),
      overlayVisible: app?.overlay?.visible === true,
      overlayDisplay: app?.overlay?.el?.style?.display ?? null,
      quitConnected: app?.quit?.isConnected === true,
      quitText: app?.quitLabel?.textContent ?? null,
      quitHow: app?.quitHow?.textContent ?? null,
      audioLoad: { ...game.audio.loadReport },
      /* The pointer is unlocked for a framed app, and the room hides the
       * cursor over its own canvas whenever it is locked. If that rule is
       * still in force there is a way out on screen that nobody can aim at. */
      roomCursor: getComputedStyle(game.renderer.domElement).cursor,
      pointerLocked: document.pointerLockElement === game.renderer.domElement,
      campaignScene: game.campaign.state.scene.id,
    };
  });
}

/** Where the parent-owned way out is, and whether anything is on top of it. */
async function wayOut() {
  return page.evaluate(() => {
    const q = window.__squatch.arcade.app?.quit;
    if (!q?.isConnected) return null;
    const r = q.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      x: r.left, y: r.top, w: r.width, h: r.height,
      cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
      onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      onTop: hit === q || q.contains(hit),
      focused: document.activeElement === q,
      how: window.__squatch.arcade.app.quitHow.textContent,
    };
  });
}

async function monitorGeometry() {
  return page.evaluate(() => {
    const { monitorNeck, screen } = window.__squatch.apartment.desk;

    function zExtents(object) {
      object.geometry.computeBoundingBox();
      object.updateWorldMatrix(true, false);
      const b = object.geometry.boundingBox;
      const m = object.matrixWorld.elements;
      const zs = [];
      for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
          for (const z of [b.min.z, b.max.z]) {
            zs.push(m[2] * x + m[6] * y + m[10] * z + m[14]);
          }
        }
      }
      return { min: Math.min(...zs), max: Math.max(...zs) };
    }

    return {
      neckName: monitorNeck?.name,
      neck: zExtents(monitorNeck),
      screen: zExtents(screen),
    };
  });
}

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.arcade, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());
  await page.click('#start-btn');
  /* A real player cannot reach the PC until the start handler has finished
   * loading audio. Await that same boundary so this test does not race the
   * scene bootstrap and mistake a deliberately in-progress load for runtime
   * errors from the computer. */
  await page.waitForFunction(() => window.__squatch?.game?.started === true,
    null, { timeout: 120000 });

  /* Walk up with a wound-up yaw, the way a player who has turned round the
   * flat a few times arrives at the desk.
   *
   * Owner report: sitting down threw the view left. Yaw accumulates without
   * wrapping -- two laps and it is twelve radians -- and the seated tween
   * lands on the representation of the pose's yaw NEAREST the one he walked up
   * with, while the look clamp is centred on the pose's own value. The camera
   * finishes pointing the right way and then the first mouse movement runs the
   * clamp and slams it to the edge of the cone. */
  const seating = await page.evaluate(async () => {
    const game = window.__squatch;
    const THREE = await import('three');
    game.getUp();
    game.player.update(2);
    game.game.paused = false;
    game.player.mode = 'walk';
    game.player.position.set(1.05, 1.66, -2.85);
    game.player.yaw = Math.PI * 4 + 0.15;
    game.player.pitch = 0;
    game.player.update(0.016);
    const wound = game.player.yaw;
    game.sitAtPC();
    for (let i = 0; i < 200; i++) game.player.update(0.02);
    const seatedYaw = game.player.yaw;

    const monitor = game.apartment.desk.monitorPos.clone();
    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    game.camera.getWorldPosition(camPos);
    game.camera.getWorldDirection(camDir);
    const toMonitor = monitor.clone().sub(camPos).normalize();
    const offAxis = Math.acos(Math.max(-1, Math.min(1, camDir.dot(toMonitor))));

    // And the thing that used to lurch: the first movement of the mouse.
    game.player.handleMouseMove(1, 0);
    const nudged = game.player.yaw;
    game.arcade.update(3.5);
    return {
      wound,
      seatedYaw,
      yawCenter: game.player.yawCenter,
      yawRange: game.player.yawRange,
      offAxisDeg: (offAxis * 180) / Math.PI,
      snapDeg: (Math.abs(nudged - seatedYaw) * 180) / Math.PI,
    };
  });
  check('sitting down lands the view square on the monitor',
    seating.offAxisDeg < 4, JSON.stringify(seating));
  check('the seated look clamp agrees with where the tween put the camera',
    Math.abs(seating.seatedYaw - seating.yawCenter) < 0.01
      && seating.snapDeg < 1
      && seating.yawRange > 0.5,
    JSON.stringify(seating));

  let state = await computerState();
  const appIds = state.apps.map(({ id }) => id);
  check('the apartment PC boots while the player is seated',
    state.seated && state.playerMode === 'seated' && state.osMode === 'desktop',
    JSON.stringify(state));
  check('all six known applications are installed once',
    JSON.stringify(appIds) === JSON.stringify(['mail', 'smash', 'shoot', 'counter', 'yuka', 'doom'])
      && new Set(appIds).size === appIds.length,
    JSON.stringify(state.apps));
  check('the shared audio bank starts through a bounded request queue',
    state.audioLoad.requested > 0
      && state.audioLoad.peakConcurrent > 0
      && state.audioLoad.peakConcurrent <= state.audioLoad.concurrency,
    JSON.stringify(state.audioLoad));

  const geometry = await monitorGeometry();
  check('the monitor neck stays behind the display instead of clipping through it',
    geometry.neckName === 'monitor-neck' && geometry.neck.max < geometry.screen.min - 0.003,
    JSON.stringify(geometry));

  const mailInput = await page.evaluate(() => {
    const os = window.__squatch.arcade;
    const mail = os.apps.find(({ id }) => id === 'mail');
    os.launch(mail);

    const from = { ...os.cursor };
    const target = { x: 100, y: 99 }; // second visible inbox row
    os.onPointer((target.x - from.x) / 0.62, (target.y - from.y) / 0.62);
    const moved = { ...os.cursor };

    const drawnText = [];
    const fillText = os.g.fillText.bind(os.g);
    os.g.fillText = (text, ...args) => {
      drawnText.push(String(text));
      return fillText(text, ...args);
    };
    let cursorDraws = 0;
    const drawCursor = os.drawCursor.bind(os);
    os.drawCursor = (...args) => {
      cursorDraws++;
      return drawCursor(...args);
    };
    os.update(0.1);
    os.g.fillText = fillText;
    os.drawCursor = drawCursor;

    os.onClick(true);
    return {
      from,
      moved,
      selected: mail.sel,
      inputMode: os.inputMode,
      cursorDraws,
      exitHintDrawn: drawnText.some((text) => text.includes(os.exitHintText)),
      consumed: os.onKey('Tab', true),
      mode: os.mode,
      appId: os.app?.id ?? null,
    };
  });
  check('Mail has a visible moving cursor and mouse clicks navigate the inbox',
    mailInput.moved.x !== mailInput.from.x
      && mailInput.moved.y !== mailInput.from.y
      && mailInput.selected === 1
      && mailInput.inputMode === 'relative'
      && mailInput.cursorDraws > 0,
    JSON.stringify(mailInput));
  check('active canvas apps clearly render the Tab desktop instruction',
    mailInput.exitHintDrawn && mailInput.consumed
      && mailInput.mode === 'desktop' && mailInput.appId === null,
    JSON.stringify(mailInput));

  for (const id of ['shoot', 'counter', 'yuka']) {
    const lifecycle = await page.evaluate((appId) => {
      const os = window.__squatch.arcade;
      const app = os.apps.find(({ id: candidate }) => candidate === appId);
      os.launch(app);
      os.update(0.1);
      const entered = os.mode === 'app' && os.app?.id === appId;
      const consumed = os.onKey('Tab', true);
      return {
        entered,
        consumed,
        mode: os.mode,
        appId: os.app?.id ?? null,
      };
    }, id);
    check(`${id} launches and Tab returns to the desktop`,
      lifecycle.entered && lifecycle.consumed && lifecycle.mode === 'desktop' && lifecycle.appId === null,
      JSON.stringify(lifecycle));
  }

  const smashLaunch = await page.evaluate(() => {
    const os = window.__squatch.arcade;
    const index = os.apps.findIndex(({ id }) => id === 'smash');
    const rect = os._iconRect(index);
    os.cursor.x = rect.x + rect.w / 2;
    os.cursor.y = rect.y + rect.h / 2;
    os.onClick(true);
    return {
      mode: os.mode,
      appId: os.app?.id ?? null,
      inputMode: os.inputMode,
    };
  });
  await page.waitForFunction(() => {
    const app = window.__squatch.arcade.app;
    return app?.id === 'smash'
      && app.overlay.visible
      && app.overlay.el.contentWindow?.location?.pathname === '/game/index.html'
      && app.overlay.el.contentDocument?.readyState === 'complete';
  }, null, { timeout: 60000 });

  state = await computerState();
  const campground = page.frames().find((frame) => /\/game\/index\.html$/.test(frame.url()));
  const gameLoaded = campground
    ? await campground.locator('#startBtn').isVisible().catch(() => false)
    : false;
  const smashButtonViewport = campground
    ? await campground.evaluate(() => {
      const button = document.querySelector('#startBtn');
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const center = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        centerIsButton: center === button || button.contains(center),
      };
    })
    : null;
  const smashButtonOnScreen = Boolean(
    smashButtonViewport
      && smashButtonViewport.left >= 0
      && smashButtonViewport.top >= 0
      && smashButtonViewport.right <= smashButtonViewport.viewportWidth
      && smashButtonViewport.bottom <= smashButtonViewport.viewportHeight
      && smashButtonViewport.width > 0
      && smashButtonViewport.height > 0
      && smashButtonViewport.display !== 'none'
      && smashButtonViewport.visibility !== 'hidden'
      && smashButtonViewport.pointerEvents !== 'none'
      && smashButtonViewport.centerIsButton,
  );
  check('clicking the Squatch Smash desktop icon launches its real campground game',
    smashLaunch.mode === 'app' && smashLaunch.appId === 'smash' && smashLaunch.inputMode === 'dom'
      && state.appId === 'smash' && state.overlayVisible && state.quitConnected
      && state.quitText === EXIT_LABEL && !state.paused && gameLoaded
      && smashButtonOnScreen,
    JSON.stringify({
      smashLaunch,
      state,
      frame: campground?.url() ?? null,
      gameLoaded,
      smashButtonOnScreen,
      smashButtonViewport,
    }));

  // The apartment monitor is a CSS matrix3d-transformed iframe. Chromium's
  // automation hit-testing does not reliably deliver synthetic pointer events
  // through that transform, even though a real browser click does. Verify the
  // physical hit target above, then invoke the same on-screen button's native
  // click handler inside the same-origin frame to keep this check deterministic.
  await campground.evaluate(() => document.querySelector('#startBtn')?.click());
  await campground.waitForFunction(() => window.SQUATCH?.state === 'playing');
  const smashPlaying = await campground.evaluate(() => ({
    state: window.SQUATCH?.state,
    menuHidden: document.querySelector('#menu')?.classList.contains('hidden') === true,
    hudVisible: document.querySelector('#hud')?.classList.contains('visible') === true,
  }));
  check('Squatch Smash starts from its on-screen START RAMPAGE button',
    smashPlaying.state === 'playing' && smashPlaying.menuHidden && smashPlaying.hudVisible,
    JSON.stringify(smashPlaying));

  /* Tab inside a same-origin app is a HOLD, not a tap: a tap belongs to
   * whatever is running -- it is DOOM's automap, and one day it will be
   * something of the campground's -- and only the hold is the way out. */
  const tabIn = (type) => campground.evaluate((eventType) => {
    window.dispatchEvent(new KeyboardEvent(eventType, {
      code: 'Tab',
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    }));
  }, type);
  await tabIn('keydown');
  await page.waitForTimeout(120);
  await tabIn('keyup');
  await page.waitForTimeout(200);
  const smashAfterTap = await computerState();
  check('a tap of Tab inside Squatch Smash is left to the game',
    smashAfterTap.osMode === 'app' && smashAfterTap.appId === 'smash'
      && smashAfterTap.overlayVisible,
    JSON.stringify(smashAfterTap));

  await tabIn('keydown');
  await page.waitForFunction(() => window.__squatch.arcade.mode === 'desktop',
    null, { timeout: 20000 });
  await tabIn('keyup');
  state = await computerState();
  const smashAfterTab = await campground.evaluate(() => window.SQUATCH?.state);
  check('holding Tab inside Squatch Smash returns through the apartment-owned desktop',
    state.osMode === 'desktop' && state.inputMode === 'relative'
      && state.appId === null && !state.overlayVisible && !state.quitConnected
      && smashAfterTab === 'paused',
    JSON.stringify({ state, smashAfterTab, hold: EXIT_HOLD }));

  await page.evaluate(() => {
    const os = window.__squatch.arcade;
    os.launch(os.apps.find(({ id }) => id === 'doom'));
  });
  await page.waitForFunction(() => {
    const app = window.__squatch.arcade.app;
    return app?.id === 'doom' && app.overlay.visible;
  }, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  state = await computerState();
  check('the cross-origin DOOM frame has a parent-owned escape control',
    state.appId === 'doom' && state.inputMode === 'dom'
      && state.overlayVisible && state.quitConnected
      && state.quitText === EXIT_LABEL,
    JSON.stringify(state));
  const doomLaunch = await page.evaluate(() => {
    const app = window.__squatch.arcade.app;
    const url = new URL(app.overlay.el.src);
    return {
      map: url.searchParams.get('map'),
      src: url.href,
    };
  });
  check('DOOM starts a real E1M1 session instead of recorded attract-mode input',
    doomLaunch.map === 'E1M1',
    JSON.stringify(doomLaunch));

  /* ------------------------------------------------------------------ *
   * The way out of a running app.
   *
   * Driven the way a player drives it -- real mouse, real keys -- because
   * every part of this that was broken was broken in a way that a call to
   * .click() from the console could not see.
   * ------------------------------------------------------------------ */
  const doomFrame = () => page.frames().find((f) => /mrdoob\.github\.io/.test(f.url()));
  await page.waitForFunction(() => document.activeElement?.tagName === 'IFRAME',
    null, { timeout: 10000 }).catch(() => {});
  const framedKeyboard = await page.evaluate(() => ({
    active: document.activeElement?.tagName ?? null,
    // The parent still thinks it has focus. There is nothing here to test.
    hasFocus: document.hasFocus(),
  }));

  const exitAt = await wayOut();
  check('the way out is on screen, on top of the frame, and the room shows a cursor',
    Boolean(exitAt) && exitAt.onScreen && exitAt.onTop
      && exitAt.w > 60 && exitAt.h > 12 && state.roomCursor !== 'none',
    JSON.stringify({ exitAt, roomCursor: state.roomCursor }));

  /* A held Tab with the frame in focus reaches the frame and nobody else --
   * this is the whole reason the label cannot just say TAB. */
  await page.evaluate(() => { window.__parentKeys = []; window.addEventListener('keydown', (e) => window.__parentKeys.push(e.code), true); });
  await page.keyboard.down('Tab');
  await page.waitForTimeout(EXIT_HOLD * 1000 + 500);
  await page.keyboard.up('Tab');
  const swallowed = await doomFrame()?.evaluate(() => window.SWALLOWED?.slice() ?? []);
  const heldInFrame = await page.evaluate(() => ({
    parentKeys: window.__parentKeys.slice(),
    osMode: window.__squatch.arcade.mode,
    appId: window.__squatch.arcade.app?.id ?? null,
  }));
  check('a held Tab inside the cross-origin frame never reaches the apartment',
    framedKeyboard.active === 'IFRAME' && heldInFrame.parentKeys.length === 0
      && Array.isArray(swallowed) && swallowed.includes('Tab')
      && heldInFrame.osMode === 'app' && heldInFrame.appId === 'doom',
    JSON.stringify({ framedKeyboard, heldInFrame, swallowed }));

  /* Pointing at the control is what hands the keyboard back. */
  await page.mouse.move(exitAt.cx, exitAt.cy, { steps: 8 });
  await page.waitForTimeout(200);
  const armed = await wayOut();
  const stillPut = armed && Math.abs(armed.x - exitAt.x) < 2 && Math.abs(armed.y - exitAt.y) < 2;
  check('pointing at the way out arms it and it does not drift while he looks',
    Boolean(armed) && armed.focused && armed.onTop && stillPut
      && armed.how !== exitAt.how,
    JSON.stringify({ exitAt, armed }));

  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);
  const afterTap = await computerState();
  check('a tap of Tab still belongs to the game, even with the way out armed',
    afterTap.osMode === 'app' && afterTap.appId === 'doom' && afterTap.overlayVisible,
    JSON.stringify(afterTap));

  await page.keyboard.down('Tab');
  await page.waitForTimeout(180);
  const midHold = await page.evaluate(() => {
    const app = window.__squatch.arcade.app;
    return { holding: app?._holding === true, fill: app?.quitFill?.style.width ?? null };
  });
  await page.waitForFunction(() => window.__squatch.arcade.mode === 'desktop',
    null, { timeout: 20000 });
  await page.keyboard.up('Tab');
  state = await computerState();
  check('holding Tab on the way out quits a running DOOM to the desktop',
    state.osMode === 'desktop' && state.appId === null && state.inputMode === 'relative'
      && !state.overlayVisible && !state.quitConnected && midHold.holding,
    JSON.stringify({ state, midHold }));

  await page.keyboard.press('q');
  await page.evaluate(() => window.__squatch.player.update(2));
  state = await computerState();
  check('and Q gets him out of the chair straight after quitting an app',
    !state.seated && state.playerMode === 'walk' && state.campaignScene === 'apartment',
    JSON.stringify(state));

  /* The route that needs no keyboard at all: a real click, real coordinates. */
  await page.evaluate(() => {
    const game = window.__squatch;
    game.game.paused = false;
    game.sitAtPC();
    game.player.update(2);
    const os = game.arcade;
    os.launch(os.apps.find(({ id }) => id === 'doom'));
  });
  await page.waitForFunction(() => window.__squatch.arcade.app?.quit?.isConnected === true,
    null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const clickAt = await wayOut();
  await page.mouse.move(clickAt.cx, clickAt.cy, { steps: 6 });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  state = await computerState();
  check('clicking the way out quits a running app without touching the keyboard',
    state.osMode === 'desktop' && state.appId === null && !state.quitConnected,
    JSON.stringify({ clickAt, state }));

  await page.evaluate(() => {
    const game = window.__squatch;
    if (!game.game.seated) { game.sitAtPC(); game.player.update(2); }
  });

  await page.evaluate(() => {
    const game = window.__squatch;
    const os = game.arcade;
    os.launch(os.apps.find(({ id }) => id === 'smash'));
    game.standFromPC();
    game.player.update(1);
  });
  state = await computerState();
  check('leaving the chair hides framed input and resumes the apartment',
    !state.seated
      && state.playerMode === 'walk'
      && state.appId === 'smash'
      && !state.overlayVisible
      && !state.quitConnected
      && state.campaignScene === 'apartment',
    JSON.stringify(state));

  await page.evaluate(() => {
    const game = window.__squatch;
    game.sitAtPC();
    game.player.update(2);
  });
  state = await computerState();
  check('sitting back down restores the paused Squatch Smash session',
    state.seated && state.playerMode === 'seated' && state.appId === 'smash'
      && state.overlayVisible && state.quitConnected,
    JSON.stringify(state));

  await page.evaluate(() => {
    const game = window.__squatch;
    game.arcade.toDesktop();
    game.standFromPC();
    game.player.update(1);
  });
  state = await computerState();
  check('the final computer exit leaves the apartment playable',
    !state.seated && state.playerMode === 'walk'
      && state.osMode === 'desktop' && state.appId === null
      && state.campaignScene === 'apartment',
    JSON.stringify(state));

  /* Seated, the keyboard belongs to the computer -- whole. Driven with REAL
   * key events through the document handler, because the regression this
   * guards lived exactly there: WASD reached the arcade AND the player, and
   * rolled the chair out from under whatever you were typing into. */
  await page.evaluate(() => {
    const game = window.__squatch;
    game.game.paused = false;
    game.sitAtPC();
    game.player.update(2);
  });
  const wasdBefore = await page.evaluate(() => {
    const game = window.__squatch;
    const os = game.arcade;
    os.__wasdProbe = 0;
    if (!os.__wasdWrapped) {
      os.__wasdWrapped = true;
      const real = os.onKey.bind(os);
      os.onKey = (code, down) => {
        if (down) os.__wasdProbe += 1;
        return real(code, down);
      };
    }
    return {
      seated: game.game.seated,
      x: game.player.position.x,
      z: game.player.position.z,
      chairX: game.apartment.chair.position.x,
      chairZ: game.apartment.chair.position.z,
    };
  });
  for (const key of ['w', 'a', 's', 'd']) await page.keyboard.down(key);
  await page.waitForTimeout(700);
  const wasdAfter = await page.evaluate(() => {
    const game = window.__squatch;
    return {
      seated: game.game.seated,
      x: game.player.position.x,
      z: game.player.position.z,
      chairX: game.apartment.chair.position.x,
      chairZ: game.apartment.chair.position.z,
      heldByPlayer: ['KeyW', 'KeyA', 'KeyS', 'KeyD']
        .filter((code) => game.player.keys.has(code)),
      arcadeSawKeys: game.arcade.__wasdProbe,
    };
  });
  for (const key of ['w', 'a', 's', 'd']) await page.keyboard.up(key);
  check('WASD while seated goes to the computer and never moves the player',
    wasdBefore.seated && wasdAfter.seated
      && Math.abs(wasdAfter.x - wasdBefore.x) < 1e-6
      && Math.abs(wasdAfter.z - wasdBefore.z) < 1e-6
      && Math.abs(wasdAfter.chairX - wasdBefore.chairX) < 1e-6
      && Math.abs(wasdAfter.chairZ - wasdBefore.chairZ) < 1e-6
      && wasdAfter.heldByPlayer.length === 0
      && wasdAfter.arcadeSawKeys >= 4,
    JSON.stringify({ wasdBefore, wasdAfter }));

  // And the one key that is still the player's: [Q] stands him up. The tween
  // is finished by hand like every other transition here -- software GL runs
  // the frame loop too slowly to wait it out in real time.
  await page.keyboard.press('q');
  await page.evaluate(() => window.__squatch.player.update(2));
  state = await computerState();
  check('Q remains the stand-up escape from the seat',
    !state.seated && state.playerMode === 'walk' && state.campaignScene === 'apartment',
    JSON.stringify(state));

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} apartment-computer checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} apartment-computer checks passed.`);
