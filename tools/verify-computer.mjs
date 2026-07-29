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
      osMode: game.arcade.mode,
      appId: app?.id ?? null,
      apps: game.arcade.apps.map(({ id, label }) => ({ id, label })),
      overlayVisible: app?.overlay?.visible === true,
      overlayDisplay: app?.overlay?.el?.style?.display ?? null,
      quitConnected: app?.quit?.isConnected === true,
      campaignScene: game.campaign.state.scene.id,
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

  for (const id of ['mail', 'shoot', 'counter', 'yuka']) {
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

  await page.evaluate(() => {
    const os = window.__squatch.arcade;
    os.launch(os.apps.find(({ id }) => id === 'smash'));
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
  check('Squatch Smash runs as the real same-origin campground game',
    state.appId === 'smash' && state.overlayVisible && state.quitConnected && gameLoaded,
    JSON.stringify({ state, frame: campground?.url() ?? null, gameLoaded }));

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
  check('Tab inside Squatch Smash returns through the apartment-owned desktop',
    state.osMode === 'desktop' && state.appId === null && !state.overlayVisible && !state.quitConnected,
    JSON.stringify(state));

  await page.evaluate(() => {
    const os = window.__squatch.arcade;
    os.launch(os.apps.find(({ id }) => id === 'doom'));
  });
  state = await computerState();
  check('the cross-origin DOOM frame has a parent-owned escape control',
    state.appId === 'doom' && state.overlayVisible && state.quitConnected,
    JSON.stringify(state));
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
