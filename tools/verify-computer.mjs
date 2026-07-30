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

// DOOM is deliberately cross-origin. Its availability is not an apartment
// lifecycle invariant, so keep the verifier deterministic and test the
// parent-owned escape path without depending on that external host.
await page.route('https://mrdoob.github.io/**', (route) => route.abort('blockedbyclient'));

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
      quitText: app?.quit?.textContent ?? null,
      pointerLocked: document.pointerLockElement === game.renderer.domElement,
      campaignScene: game.campaign.state.scene.id,
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

  await page.evaluate(() => {
    const game = window.__squatch;
    game.getUp();
    game.player.update(2);
    game.game.paused = false;
    game.sitAtPC();
    game.player.update(2);
    game.arcade.update(3.5);
  });

  let state = await computerState();
  const appIds = state.apps.map(({ id }) => id);
  check('the apartment PC boots while the player is seated',
    state.seated && state.playerMode === 'seated' && state.osMode === 'desktop',
    JSON.stringify(state));
  check('all six known applications are installed once',
    JSON.stringify(appIds) === JSON.stringify(['mail', 'smash', 'shoot', 'counter', 'yuka', 'doom'])
      && new Set(appIds).size === appIds.length,
    JSON.stringify(state.apps));

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
      && state.quitText === 'TAB = EXIT TO DESKTOP' && !state.paused && gameLoaded
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

  await page.evaluate(() => {
    const framedWindow = window.__squatch.arcade.app.overlay.el.contentWindow;
    framedWindow.dispatchEvent(new framedWindow.KeyboardEvent('keydown', {
      code: 'Tab',
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    }));
  });
  await page.waitForFunction(() => window.__squatch.arcade.mode === 'desktop');
  state = await computerState();
  const smashAfterTab = await campground.evaluate(() => window.SQUATCH?.state);
  check('Tab inside Squatch Smash returns through the apartment-owned desktop',
    state.osMode === 'desktop' && state.inputMode === 'relative'
      && state.appId === null && !state.overlayVisible && !state.quitConnected
      && smashAfterTab === 'paused',
    JSON.stringify({ state, smashAfterTab }));

  await page.evaluate(() => {
    const os = window.__squatch.arcade;
    os.launch(os.apps.find(({ id }) => id === 'doom'));
  });
  state = await computerState();
  check('the cross-origin DOOM frame has a parent-owned escape control',
    state.appId === 'doom' && state.inputMode === 'dom'
      && state.overlayVisible && state.quitConnected
      && state.quitText === 'TAB = EXIT TO DESKTOP',
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
  await page.evaluate(() => window.__squatch.arcade.app.quit.click());
  state = await computerState();
  check('the DOOM escape control returns without cross-origin access',
    state.osMode === 'desktop' && state.appId === null,
    JSON.stringify(state));

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
