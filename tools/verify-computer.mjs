#!/usr/bin/env node
/**
 * Verify the apartment computer as one lifecycle rather than eight unrelated
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
      started: game.game.started,
      seated: game.game.seated,
      playerMode: game.player.mode,
      playerEnabled: game.player.enabled,
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
      /* The pointer is unlocked for a framed app, and the room hides the
       * cursor over its own canvas whenever it is locked. If that rule is
       * still in force there is a way out on screen that nobody can aim at. */
      roomCursor: getComputedStyle(game.renderer.domElement).cursor,
      pointerLocked: document.pointerLockElement === game.renderer.domElement,
      apartmentOverlayHidden: document.querySelector('#overlay')?.classList.contains('hidden') === true,
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
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const describe = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const className = typeof element.className === 'string'
        ? element.className : element.className?.baseVal ?? '';
      return {
        tag: element.tagName,
        id: element.id || null,
        className,
        parent: element.parentElement?.id || element.parentElement?.tagName || null,
        position: style.position,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        transform: style.transform === 'none' ? 'none' : style.transform,
      };
    };
    const hit = document.elementFromPoint(cx, cy);
    return {
      x: r.left, y: r.top, w: r.width, h: r.height,
      cx: Math.round(cx), cy: Math.round(cy),
      onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      onTop: hit === q || q.contains(hit),
      focused: document.activeElement === q,
      how: window.__squatch.arcade.app.quitHow.textContent,
      quitStyle: describe(q),
      hit: describe(hit),
      hitStack: document.elementsFromPoint(cx, cy).slice(0, 10).map(describe),
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
  /* PREVIEW, NOT A FRESH SAVE, and the reason is the cold open.
   *
   * A brand new day-one player is booted straight into full-screen Squatch
   * Smash (`coldOpenEligible` in src/main.js): the title overlay is hidden,
   * the game is already started, and the arcade iframe sits over #start-btn,
   * which is why this file used to hang for thirty seconds on a click that
   * could never land. Driving out through the arcade instead gets past the
   * click and then leaves the wrong room behind it -- the player still in the
   * chair with SQUATCH SMASH.exe still open on the monitor, which is exactly
   * the state the cold open is SUPPOSED to end in and not the state the other
   * thirty-eight checks here were written against.
   *
   * `isPreviewMode()` is the first thing `coldOpenEligible` asks about, so
   * `?preview=1` is the supported way to say "boot this page for inspection,
   * not as somebody's first night". That is what this file is about: the desk
   * PC, on an ordinary visit. The opening itself has a whole verifier of its
   * own in tools/verify-cold-open.mjs. */
  await page.goto(`http://localhost:${PORT}/index.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.arcade, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  /* Preview keeps the title card, so the button is a button again. Assert
   * that rather than branching on it: a build where the cold open leaks into
   * preview mode should fail here, loudly, not quietly take the other door. */
  await page.waitForFunction(() => window.__squatch.coldOpenState?.active === false,
    null, { timeout: 30000 });
  await page.click('#start-btn');
  /* A DOM click settles when the event has been dispatched, not when an async
   * listener has finished. First start intentionally keeps the title overlay
   * above the room while its recorded Apartment bank is decoded; driving the
   * console-only seating seam before that promise resolves creates an
   * impossible state (apps running behind the title card). */
  await page.waitForFunction(() => window.__squatch.game.started
    && document.querySelector('#overlay')?.classList.contains('hidden'), null, { timeout: 90000 });
  // The async start handler marks `started` before its final input-state write.
  // Let that same click finish before testing a separate Tab gesture.
  await page.waitForTimeout(200);

  await page.keyboard.press('Tab');
  let apartmentPause = await page.evaluate(() => ({
    paused: window.__squatch.game.paused,
    menu: window.__scenePause?.isPaused() ?? false,
    objective: document.querySelector('[data-scene-pause-objective]')?.textContent?.trim() || '',
  }));
  check('Tab away from the computer opens the apartment pause instructions',
    apartmentPause.paused && apartmentPause.menu && apartmentPause.objective.length > 0,
    JSON.stringify(apartmentPause));
  await page.keyboard.press('Tab');
  apartmentPause = await page.evaluate(() => ({
    paused: window.__squatch.game.paused,
    menu: window.__scenePause?.isPaused() ?? true,
  }));
  check('a second Tab returns control to the apartment',
    !apartmentPause.paused && !apartmentPause.menu,
    JSON.stringify(apartmentPause));

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
  await page.keyboard.press('Tab');
  const desktopTab = await computerState();
  check('while seated at SquatchOS, Tab stays with the computer and never opens pause',
    desktopTab.seated && desktopTab.osMode === 'desktop' && !desktopTab.paused,
    JSON.stringify(desktopTab));
  /* Seven, not eight: DOOM was taken off the desktop on 2026-08-24. See the
   * long note further down, and `src/arcade/mount.js`. */
  check('all seven known applications are installed once',
    JSON.stringify(appIds) === JSON.stringify([
      'mail', 'smash', 'shoot', 'counter', 'counter-guide', 'match-result', 'yuka',
    ])
      && new Set(appIds).size === appIds.length,
    JSON.stringify(state.apps));
  await page.waitForFunction(() => window.__squatch?.arcade?.wallpaper?.naturalWidth > 0,
    null, { timeout: 30000 });
  const wallpaper = await page.evaluate(() => ({
    width: window.__squatch.arcade.wallpaper.naturalWidth,
    height: window.__squatch.arcade.wallpaper.naturalHeight,
    src: window.__squatch.arcade.wallpaper.currentSrc || window.__squatch.arcade.wallpaper.src,
  }));
  check('the desktop wallpaper uses the real Silver Sasquatches shield',
    wallpaper.width > 0 && wallpaper.height > 0 && /assets\/art\/logo-shield\.jpg$/.test(wallpaper.src),
    JSON.stringify(wallpaper));

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

  for (const id of ['shoot', 'counter', 'counter-guide', 'match-result', 'yuka']) {
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

  const counterDeck = await page.evaluate(async () => {
    const os = window.__squatch.arcade;
    const app = os.apps.find(({ id }) => id === 'counter-guide');
    os.launch(app);
    await app.loading;
    os.update(0.1);
    const first = { slide: app.slide, teamplay: app.images.has('counter-squatch.teamplay') };
    app.onKey('ArrowRight', true);
    os.update(0.1);
    const second = { slide: app.slide, baiters: app.images.has('counter-squatch.baiters-brain') };
    os.onKey('Tab', true);
    return { first, second, mode: os.mode };
  });
  check('the Counter-Squatch guide presents TeamPlay and Baiter’s Brain as readable slides',
    counterDeck.first.slide === 0 && counterDeck.first.teamplay
      && counterDeck.second.slide === 1 && counterDeck.second.baiters
      && counterDeck.mode === 'desktop',
    JSON.stringify(counterDeck));

  const matchPhoto = await page.evaluate(async () => {
    const os = window.__squatch.arcade;
    const app = os.apps.find(({ id }) => id === 'match-result');
    os.launch(app);
    await app.loading;
    os.update(0.1);
    const imageLoaded = app.images.has('counter-squatch.match-result');
    os.onKey('Tab', true);
    return { imageLoaded, mode: os.mode };
  });
  check('the saved Counter-Squatch match result opens as its own desktop picture',
    matchPhoto.imageLoaded && matchPhoto.mode === 'desktop',
    JSON.stringify(matchPhoto));

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

  /* ================================================================== *
   * DOOM IS NOT INSTALLED, AND THAT IS THE CHECK NOW
   *
   * Eight checks used to live here, all of them about getting back out of a
   * cross-origin frame: a parent-drawn escape control over somebody else's
   * page, a held Tab that must not reach the apartment, a click route for a
   * player who cannot find a key. They were written because the owner could
   * not quit DOOM, and they passed while he still could not.
   *
   * They could only ever have passed. `doom.js` frames `mrdoob.github.io`
   * deliberately -- three-doom is GPL, this repository is MIT, so the page is
   * linked rather than copied -- and a cross-origin frame is sealed. No key
   * pressed inside it is visible from out here. Esc could never be made to
   * work; the corner control was the only way out, and a way out you have to
   * find with a mouse on top of a fullscreen game is a way out a player does
   * not find.
   *
   * So DOOM is off the desktop (see `src/arcade/mount.js`) and the invariant
   * that replaces those eight is stronger and cheaper: nothing installed on
   * this machine is cross-origin. Every framed app is one we serve, which
   * means every framed app can be listened to, paused and quit from the
   * apartment. The same-origin exit path is proved just above this, on
   * Squatch Smash, by pressing the key rather than by finding a button.
   * ================================================================== */
  /* ================================================================== *
   * THE APARTMENT DOES NOT DRAW OVER THE ARCADE
   *
   * The opening only works if the player believes Squatch Smash is the game.
   * Measured before the fix: with Smash up and the player in the chair, `#hud`
   * computed to opacity 1 over the top of it, carrying an interaction prompt,
   * the inventory bar, a day clock reading "Day 1 6:04 AM" and a bladder
   * meter -- a status bar for a character the player does not know he has yet.
   *
   * Asserted on the computed VISIBILITY rather than the class, because the
   * class is the mechanism and being invisible is the promise -- and because
   * `#hud`'s opacity is transitioned over 0.4 s, so sampling that reads the
   * animation rather than the state. This is what the first version of this
   * check got wrong in both directions at once.
   * ================================================================== */
  await page.evaluate(() => {
    const os = window.__squatch.arcade;
    os.launch(os.apps.find(({ id }) => id === 'smash'));
    os.setSeated?.(true);
    os.update(0.1);
  });
  await page.waitForTimeout(900);
  const owned = await page.evaluate(() => ({
    body: document.body.className,
    hud: getComputedStyle(document.getElementById('hud')).visibility,
    appId: window.__squatch.arcade.app?.id ?? null,
  }));
  check('Squatch Smash owns the whole screen and Squatch Life draws nothing over it',
    owned.appId === 'smash'
      && owned.body.includes('arcade-owns-screen')
      && owned.hud === 'hidden',
    JSON.stringify(owned));

  await page.evaluate(() => { const os = window.__squatch.arcade; os.toDesktop(); os.update(0.1); });
  await page.waitForTimeout(900);
  const released = await page.evaluate(() => ({
    body: document.body.className,
    hud: getComputedStyle(document.getElementById('hud')).visibility,
  }));
  check('and gives the screen back the moment the game is quit',
    !released.body.includes('arcade-owns-screen') && released.hud === 'visible',
    JSON.stringify(released));

  const origins = await page.evaluate(() => window.__squatch.arcade.apps.map((app) => ({
    id: app.id,
    sameOrigin: app.sameOrigin !== false,
    src: app.src ?? null,
  })));
  const foreign = origins.filter((app) => app.src && !app.sameOrigin);
  check('no installed application runs on somebody else\'s origin',
    foreign.length === 0,
    JSON.stringify({ foreign, origins }));

  /* The route that needs no keyboard at all: a real click, real coordinates. */
  await page.evaluate(() => {
    const game = window.__squatch;
    game.game.paused = false;
    game.sitAtPC();
    game.player.update(2);
    const os = game.arcade;
    os.launch(os.apps.find(({ id }) => id === 'smash'));
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
    const canvas = game.renderer.domElement;
    const requestPointerLock = canvas.requestPointerLock?.bind(canvas);
    window.__computerRelockCalls = 0;
    canvas.requestPointerLock = (...args) => {
      window.__computerRelockCalls++;
      return requestPointerLock?.(...args);
    };
    os.launch(os.apps.find(({ id }) => id === 'smash'));
  });
  await page.waitForFunction(() => window.__squatch.arcade.app?.quit?.isConnected === true,
    null, { timeout: 30000 });
  const standAt = await wayOut();
  /* Off the control first. The way out arms on `pointerenter`, and the previous
   * block left the cursor sitting on it -- moving to a point you are already on
   * fires nothing. This used to pass by accident because that block drove a
   * different app whose control was somewhere else. */
  await page.mouse.move(standAt.cx + 260, standAt.cy + 180, { steps: 4 });
  await page.mouse.move(standAt.cx, standAt.cy, { steps: 6 });
  await page.waitForFunction(() => document.activeElement === window.__squatch.arcade.app?.quit,
    null, { timeout: 10000 });
  await page.keyboard.press('q');
  await page.waitForFunction(() => window.__squatch.game.seated === false,
    null, { timeout: 10000 });
  await page.evaluate(() => window.__squatch.player.update(1));
  await page.waitForTimeout(750);
  const yawBeforeWalk = await page.evaluate(() => window.__squatch.player.yaw);
  await page.mouse.down();
  await page.mouse.move(standAt.cx + 50, standAt.cy + 10, { steps: 5 });
  await page.mouse.up();
  const yawAfterWalk = await page.evaluate(() => window.__squatch.player.yaw);
  state = await computerState();
  const relockCalls = await page.evaluate(() => window.__computerRelockCalls);
  check('Q on a framed app exit control leaves the chair and resumes playable Apartment input',
    !state.seated
      && state.playerMode === 'walk'
      && state.playerEnabled
      && !state.paused
      && state.apartmentOverlayHidden
      && relockCalls >= 1
      && Math.abs(yawAfterWalk - yawBeforeWalk) > 0.001
      && state.appId === 'smash'
      && !state.overlayVisible
      && !state.quitConnected
      && state.campaignScene === 'apartment',
    JSON.stringify({ standAt, state, relockCalls, yawBeforeWalk, yawAfterWalk }));

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

  /* ---- A FRAMED APP THAT IS QUIT HAS TO STOP, NOT JUST GO AWAY ----
   *
   * Owner playtest, 2026-08-20: *"I still can't quit Doom on the computer, and
   * the music volume is playing at full even after I get up from the desk."*
   *
   * Both of those were one defect. DOOM and SQUATCH SMASH run as real pages in
   * an iframe on the monitor (`src/arcade/webapp.js`), and exiting hid the
   * frame and left the page RUNNING. So the way out worked perfectly and was
   * completely invisible: the desktop came back and the soundtrack carried on
   * at full volume out of an iframe nobody could see, which from where the
   * player is standing is a game that will not quit. Standing up went the same
   * way, and so did switching the tower off — three doors onto one room.
   *
   * THE TWO APPS STOP DIFFERENTLY, ON PURPOSE, and this checks each on its own
   * terms rather than flattening them:
   *
   *   SQUATCH SMASH is ours, served out of this repo, so `Campground.suspend()`
   *     presses P inside it. The run is PAUSED and is still there when he sits
   *     back down, which is the better answer and the reason that override
   *     exists.
   *   DOOM is cross-origin. There is no reaching into it and no styling that
   *     silences it, so the frame is blanked. That costs the session, and it
   *     is the right trade: the alternative on offer is not "keep your
   *     progress", it is "keep your progress AND the music, everywhere, until
   *     you quit the tab".
   *
   * LAST in this file deliberately. It leaves apps quit and frames blanked,
   * and run any earlier it pulls the ground out from under the checks below
   * it — which it did, on its first outing, by handing the cross-origin
   * keyboard check a DOOM that was no longer there. */
  const framedStop = await page.evaluate(async () => {
    const os = window.__squatch.arcade;
    const playing = (app) => {
      let state = null;
      try { app.overlay?.withWindow?.((w) => { state = w.SQUATCH?.state ?? null; }); } catch { state = 'unreachable'; }
      return state;
    };
    const out = {};
    for (const id of ['smash']) {
      const app = os.apps.find((candidate) => candidate.id === id);
      const sample = () => playing(app);
      os.launch(app);
      os.setSeated?.(true);
      os.update(0.1);
      const running = sample();
      os.toDesktop();
      os.update(0.1);
      const afterQuit = sample();
      os.launch(app);
      os.setSeated?.(true);
      os.update(0.1);
      os.setSeated?.(false);
      os.update(0.1);
      const afterStandingUp = sample();
      os.launch(app);
      os.setSeated?.(true);
      os.update(0.1);
      os.powerOff();
      os.update(0.1);
      const afterPowerOff = sample();
      out[id] = { running, afterQuit, afterStandingUp, afterPowerOff };
    }
    return out;
  });
  /* DOOM used to be checked here too, on the frame's SRC rather than on any
   * audio API, because nothing about a cross-origin page can be read from out
   * here. It is not installed any more; see the long note above. */
  /* SQUATCH SMASH: paused rather than binned, by every one of the same three.
   * `null` is the campground sitting on its title screen, which is stopped as
   * far as this is concerned; what must never come back is 'playing'. */
  check('SQUATCH SMASH pauses rather than running on behind the desktop',
    framedStop.smash.afterQuit !== 'playing'
      && framedStop.smash.afterStandingUp !== 'playing'
      && framedStop.smash.afterPowerOff !== 'playing',
    JSON.stringify(framedStop.smash));

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
