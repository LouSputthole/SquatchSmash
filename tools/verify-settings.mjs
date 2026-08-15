#!/usr/bin/env node
/**
 * Focused browser proof for the shared settings (src/core/settings.js) as the
 * pause menu (src/core/pause-menu.js) renders them.
 *
 * Three pages that pause through the shared menu and reach a pausable state
 * quickly: the graveyard (shared Player — proves the keymap and the live
 * sensitivity), the Motel (bespoke keys, its own audio module) and the
 * Initiation (which gained its pause menu with the settings). One browser
 * context throughout, so a switch flipped on one page is proved to be the
 * same switch on the next.
 *
 * Screenshots of the open menu land in docs/validation/2026-08-15-settings/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the settings menu.');
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54970;
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.join(ROOT, 'docs', 'validation', '2026-08-15-settings');
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  response.end(await fsp.readFile(file));
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, resolve);
  });
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const SETTING_NAMES = ['subtitles', 'bigSubtitles', 'reduceShake', 'assist', 'volume', 'sensitivity'];
const ACTIONS = ['forward', 'back', 'left', 'right', 'sprint', 'crouch', 'jump'];

/** Open the shared menu and read back what it renders. */
async function openMenu(page) {
  const opened = await page.evaluate(() => window.__scenePause?.pause());
  await page.locator('[data-scene-pause]:not(.hidden)').waitFor({ timeout: 10000 });
  const snapshot = await page.evaluate(() => {
    const root = document.querySelector('[data-scene-pause]');
    const inputs = {};
    for (const input of root.querySelectorAll('[data-scene-setting]')) {
      inputs[input.dataset.sceneSetting] = input.type === 'checkbox' ? input.checked : Number(input.value);
    }
    const rebinds = {};
    for (const button of root.querySelectorAll('[data-scene-rebind]')) {
      rebinds[button.dataset.sceneRebind] = button.textContent.trim();
    }
    return {
      settingsBlock: Boolean(root.querySelector('[data-scene-settings]')),
      resume: Boolean(root.querySelector('[data-scene-pause-resume]')),
      reset: Boolean(root.querySelector('[data-scene-rebind-reset]')),
      inputs,
      rebinds,
    };
  });
  return { opened, ...snapshot };
}

async function closeMenu(page) {
  await page.evaluate(() => window.__scenePause?.resume());
  await page.waitForFunction(() => window.__scenePause?.isPaused() === false);
}

async function setCheckbox(page, name, value) {
  return page.evaluate(({ name, value }) => {
    const input = document.querySelector(`[data-scene-setting="${name}"]`);
    if (input.checked !== value) input.click();
    return {
      checked: input.checked,
      body: [...document.body.classList].filter((c) => c === 'nosubs' || c === 'bigsubs').sort(),
    };
  }, { name, value });
}

async function setSlider(page, name, value) {
  return page.evaluate(({ name, value }) => {
    const input = document.querySelector(`[data-scene-setting="${name}"]`);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return document.querySelector(`[data-scene-setting-value="${name}"]`).textContent;
  }, { name, value });
}

async function storage(page) {
  return page.evaluate(() => {
    const out = {};
    for (const key of ['squatch.subs', 'squatch.bigsubs', 'squatch.reduceShake', 'squatch.assist',
      'squatch.volume', 'squatch.sensitivity', 'squatch.keys']) {
      out[key] = localStorage.getItem(key);
    }
    return out;
  });
}

async function screenshot(page, name) {
  await fsp.mkdir(SHOTS, { recursive: true });
  await page.evaluate(() => {
    document.querySelector('[data-scene-pause] [data-scene-settings]')?.scrollIntoView({ block: 'start' });
  });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

function commonChecks(scene, menu) {
  check(`${scene}: the shared pause menu opens`, menu.opened === true && menu.resume);
  check(`${scene}: the settings block is rendered with every control`,
    menu.settingsBlock && menu.reset
      && SETTING_NAMES.every((name) => name in menu.inputs)
      && ACTIONS.every((action) => action in menu.rebinds),
    JSON.stringify({ inputs: Object.keys(menu.inputs), rebinds: Object.keys(menu.rebinds) }));
}

let browser;
try {
  await listen();
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM
      || (process.env.PLAYWRIGHT_BROWSERS_PATH
        ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const pageErrors = [];

  /* ---------------------------------------------------------------- */
  /* Graveyard — the shared Player: keymap and live sensitivity        */
  /* ---------------------------------------------------------------- */
  {
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(`graveyard: ${error.message}`));
    await page.goto(`${BASE}/graveyard.html?preview=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.GRAVEYARD && document.getElementById('start-btn'), null, { timeout: 120000 });
    await page.evaluate(() => document.getElementById('start-btn').click());
    await page.waitForFunction(() => window.GRAVEYARD?.phase === 'active'
      && document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 180000 });

    const menu = await openMenu(page);
    commonChecks('graveyard', menu);
    check('graveyard: defaults — subtitles on, everything else off, volume and sensitivity at 100%',
      menu.inputs.subtitles === true && menu.inputs.bigSubtitles === false
        && menu.inputs.reduceShake === false && menu.inputs.assist === false
        && menu.inputs.volume === 100 && menu.inputs.sensitivity === 100,
      JSON.stringify(menu.inputs));
    check('graveyard: the rebind buttons show the shared Player defaults',
      menu.rebinds.forward === 'W' && menu.rebinds.sprint === 'Left Shift'
        && menu.rebinds.jump === 'Space' && menu.rebinds.crouch === 'C',
      JSON.stringify(menu.rebinds));

    const big = await setCheckbox(page, 'bigSubtitles', true);
    const nosubs = await setCheckbox(page, 'subtitles', false);
    const subtitleHidden = await page.evaluate(() => {
      const el = document.getElementById('subtitle');
      return el ? getComputedStyle(el).display === 'none' : null;
    });
    let stored = await storage(page);
    check('graveyard: subtitle switches apply to the body and persist on the Silver keys',
      big.checked === true && nosubs.checked === false
        && nosubs.body.join(',') === 'bigsubs,nosubs'
        && stored['squatch.bigsubs'] === '1' && stored['squatch.subs'] === '0',
      JSON.stringify({ big, nosubs, stored }));
    check('graveyard: subtitles off hides the scene\'s subtitle bar', subtitleHidden === true, String(subtitleHidden));
    await setCheckbox(page, 'subtitles', true);
    await setCheckbox(page, 'bigSubtitles', false);
    const shake = await setCheckbox(page, 'reduceShake', true);
    check('graveyard: reduce shake is remembered for the next page', shake.checked === true);

    const volumeLabel = await setSlider(page, 'volume', 30);
    const sensitivityLabel = await setSlider(page, 'sensitivity', 200);
    stored = await storage(page);
    const sensitivity = await page.evaluate(() => window.GRAVEYARD.player.sensitivity);
    check('graveyard: the volume slider persists and labels itself',
      volumeLabel === '30%' && stored['squatch.volume'] === '0.3', JSON.stringify({ volumeLabel, stored }));
    check('graveyard: the sensitivity slider is live on the shared Player (0.0022 × 2)',
      sensitivityLabel === '200%' && Math.abs(sensitivity - 0.0044) < 1e-9,
      JSON.stringify({ sensitivityLabel, sensitivity }));
    await setSlider(page, 'volume', 100);
    await setSlider(page, 'sensitivity', 100);

    /* Rebind: click Move forward, Tab must not close the menu, ArrowUp binds. */
    await page.click('[data-scene-rebind="forward"]');
    const listening = await page.evaluate(() => document.querySelector('[data-scene-rebind="forward"]').textContent.trim());
    await page.keyboard.press('Tab');
    const stillOpen = await page.evaluate(() => window.__scenePause.isPaused());
    const afterTab = await page.evaluate(() => document.querySelector('[data-scene-rebind="forward"]').textContent.trim());
    check('graveyard: a rebind waits for a key, and Tab cancels rather than closing the menu',
      listening === 'Press a key…' && stillOpen === true && afterTab === 'W',
      JSON.stringify({ listening, stillOpen, afterTab }));
    await page.click('[data-scene-rebind="forward"]');
    await page.keyboard.press('ArrowUp');
    const bound = await page.evaluate(() => document.querySelector('[data-scene-rebind="forward"]').textContent.trim());
    stored = await storage(page);
    check('graveyard: pressing a key binds it and persists',
      bound === 'Arrow Up' && JSON.parse(stored['squatch.keys'] || '{}').forward === 'ArrowUp',
      JSON.stringify({ bound, keys: stored['squatch.keys'] }));

    await screenshot(page, 'graveyard-pause-settings');
    await closeMenu(page);

    /* The bound key drives the shared Player; the old key no longer does. */
    await page.keyboard.down('ArrowUp');
    const arrowMoves = await page.evaluate(() => window.GRAVEYARD.player.keys.has('KeyW'));
    await page.keyboard.up('ArrowUp');
    await page.keyboard.down('KeyW');
    const wStillMoves = await page.evaluate(() => window.GRAVEYARD.player.keys.has('KeyW'));
    await page.keyboard.up('KeyW');
    check('graveyard: the rebound key reaches the shared Player as forward, and W stops',
      arrowMoves === true && wStillMoves === false, JSON.stringify({ arrowMoves, wStillMoves }));

    await openMenu(page);
    await page.click('[data-scene-rebind-reset]');
    const resetLabel = await page.evaluate(() => document.querySelector('[data-scene-rebind="forward"]').textContent.trim());
    stored = await storage(page);
    check('graveyard: reset controls restores the defaults', resetLabel === 'W' && stored['squatch.keys'] === '{}',
      JSON.stringify({ resetLabel, keys: stored['squatch.keys'] }));
    await closeMenu(page);
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  /* Motel — bespoke keys, its own audio module                        */
  /* ---------------------------------------------------------------- */
  {
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(`motel: ${error.message}`));
    await page.goto(`${BASE}/motel.html?preview=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.MOTEL?.story && document.getElementById('startBtn'), null, { timeout: 120000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => window.MOTEL.phase === 'arrival', null, { timeout: 60000 });

    const menu = await openMenu(page);
    commonChecks('motel', menu);
    check('motel: the switch flipped on the graveyard is the same switch here',
      menu.inputs.reduceShake === true && menu.inputs.subtitles === true && menu.inputs.bigSubtitles === false,
      JSON.stringify(menu.inputs));
    const nosubs = await setCheckbox(page, 'subtitles', false);
    const subtitleHidden = await page.evaluate(() => {
      const el = document.getElementById('subtitle');
      return el ? getComputedStyle(el).display === 'none' : null;
    });
    check('motel: subtitles off hides the Motel\'s subtitle bar',
      nosubs.body.includes('nosubs') && subtitleHidden === true, JSON.stringify({ nosubs, subtitleHidden }));
    await setCheckbox(page, 'subtitles', true);
    await setCheckbox(page, 'reduceShake', false);
    await screenshot(page, 'motel-pause-settings');
    await closeMenu(page);
    await page.close();
  }

  /* ---------------------------------------------------------------- */
  /* Initiation — a pause menu it did not have before this pass        */
  /* ---------------------------------------------------------------- */
  {
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(`initiation: ${error.message}`));
    await page.goto(`${BASE}/initiation.html?preview=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.INITIATION?.phase, null, { timeout: 120000 });
    await page.waitForTimeout(800);

    const menu = await openMenu(page);
    commonChecks('initiation', menu);
    check('initiation: everything is back to defaults after the earlier pages reset themselves',
      menu.inputs.reduceShake === false && menu.inputs.subtitles === true && menu.rebinds.forward === 'W',
      JSON.stringify({ inputs: menu.inputs, forward: menu.rebinds.forward }));
    const before = await page.evaluate(() => window.INITIATION.phase);
    const big = await setCheckbox(page, 'bigSubtitles', true);
    const lineSize = await page.evaluate(() => getComputedStyle(document.getElementById('line')).fontSize);
    check('initiation: larger subtitles reach the ceremony\'s dialogue line',
      big.body.includes('bigsubs') && lineSize === '25px', JSON.stringify({ big, lineSize }));
    await setCheckbox(page, 'bigSubtitles', false);
    await screenshot(page, 'initiation-pause-settings');
    await closeMenu(page);
    const after = await page.evaluate(() => window.INITIATION.phase);
    check('initiation: pausing and resuming leaves the ceremony where it was', before === after, `${before} → ${after}`);
    await page.close();
  }

  check('no uncaught page errors on any of the three pages', pageErrors.length === 0, pageErrors.join(' | '));
  await context.close();
} finally {
  if (browser) await browser.close();
  if (server.listening) await new Promise((resolve) => server.close(() => resolve()));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} settings checks passed`);
if (failed.length) {
  console.error(failed.map((r) => `FAIL ${r.name}${r.detail ? ` — ${r.detail}` : ''}`).join('\n'));
  process.exit(1);
}
assert.equal(failed.length, 0);
