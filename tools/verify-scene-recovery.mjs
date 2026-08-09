#!/usr/bin/env node
/**
 * Focused browser proof for the shared campaign recovery menu.
 *
 * Beef Run represents a mature scene that already owned a pause menu and a
 * real mission checkpoint. The graveyard represents a scene that gained its
 * first pause surface in this pass. Together they prove the four controls,
 * both retry actions, preview-only durability across full reloads, the
 * two-retry Skip Scene unlock, and completion-before-navigation on the guarded
 * graveyard adapter.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAMPAIGN_STORAGE_KEY,
  MISSION_IDS,
  SCENE_IDS,
} from '../src/core/campaign.js';
import { SCENE_RECOVERY_STORAGE_KEY } from '../src/core/scene-recovery.js';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify campaign recovery.');
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5238;
const BASE = `http://localhost:${PORT}`;
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

function closeServer() {
  return new Promise((resolve) => server.close(() => resolve()));
}

function collectPageErrors(page, target) {
  page.on('pageerror', (error) => target.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') target.push(message.text());
  });
}

async function pauseSnapshot(page) {
  const opened = await page.evaluate(() => window.__scenePause?.pause());
  assert.equal(opened, true, 'the running scene must allow the shared pause menu to open');
  await page.locator('[data-scene-pause]:not(.hidden)').waitFor();
  return page.evaluate(() => {
    const root = document.querySelector('[data-scene-pause]');
    const button = (selector) => {
      const element = root.querySelector(selector);
      return element ? {
        disabled: element.disabled,
        hidden: element.hidden,
        text: element.textContent.trim(),
      } : null;
    };
    return {
      resume: button('[data-scene-pause-resume]'),
      checkpoint: button('[data-scene-recovery-action="checkpoint"]'),
      scene: button('[data-scene-recovery-action="scene"]'),
      skip: button('[data-scene-recovery-action="skip"]'),
    };
  });
}

function assertFourControls(snapshot, { checkpointAvailable, skipAvailable }) {
  assert.deepEqual(snapshot.resume, { disabled: false, hidden: false, text: 'Resume' });
  assert.deepEqual(snapshot.checkpoint, {
    disabled: !checkpointAvailable,
    hidden: false,
    text: 'Restart from checkpoint',
  });
  assert.deepEqual(snapshot.scene, { disabled: false, hidden: false, text: 'Restart scene' });
  assert.deepEqual(snapshot.skip, {
    disabled: !skipAvailable,
    hidden: !skipAvailable,
    text: 'Skip scene',
  });
}

async function assertPreviewIsolation(page, sentinel) {
  const result = await page.evaluate(({ campaignKey, recoveryKey, expected }) => ({
    campaign: localStorage.getItem(campaignKey),
    canonicalRecovery: localStorage.getItem(recoveryKey),
    previewRecovery: sessionStorage.getItem(recoveryKey),
    expected,
  }), {
    campaignKey: CAMPAIGN_STORAGE_KEY,
    recoveryKey: SCENE_RECOVERY_STORAGE_KEY,
    expected: sentinel,
  });
  assert.equal(result.campaign, sentinel, 'preview play must not rewrite the canonical campaign save');
  assert.equal(result.canonicalRecovery, null,
    'preview retries must never leak into the canonical localStorage recovery ledger');
  return result.previewRecovery;
}

async function startGraveyard(page) {
  await page.waitForFunction(() => window.GRAVEYARD && document.getElementById('start-btn'));
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.GRAVEYARD?.phase === 'active'
    && document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 120000 });
}

const report = [];
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

  {
    const sentinel = 'canonical-beefrun-recovery-sentinel';
    const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await context.addInitScript(({ campaignKey, value }) => {
      localStorage.setItem(campaignKey, value);
    }, { campaignKey: CAMPAIGN_STORAGE_KEY, value: sentinel });
    const page = await context.newPage();
    const errors = [];
    collectPageErrors(page, errors);

    await page.goto(`${BASE}/beefrun.html?preview=1&checkpoint=takeoff`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__beefrun?.mission && document.getElementById('start-btn'));
    await page.evaluate(() => document.getElementById('start-btn').click());
    await page.waitForFunction(() => window.__beefrun?.mission?.checkpoint === 'takeoff'
      && document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 300000 });

    const menu = await pauseSnapshot(page);
    assertFourControls(menu, { checkpointAvailable: true, skipAvailable: false });
    assert.equal(await assertPreviewIsolation(page, sentinel), null,
      'opening the menu alone must not count as a retry');
    assert.deepEqual(errors, [], `Beef Run browser errors: ${JSON.stringify(errors)}`);
    report.push({ scene: 'beefrun', checkpoint: 'takeoff', menu });
    await context.close();
  }

  {
    const sentinel = 'canonical-graveyard-recovery-sentinel';
    const proofKey = 'verify.scene-recovery.graveyard-completion';
    const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await context.addInitScript(({ campaignKey, value }) => {
      localStorage.setItem(campaignKey, value);
    }, { campaignKey: CAMPAIGN_STORAGE_KEY, value: sentinel });
    const page = await context.newPage();
    const errors = [];
    collectPageErrors(page, errors);

    await page.goto(`${BASE}/graveyard.html?preview=1`, { waitUntil: 'load' });
    for (let retry = 1; retry <= 2; retry += 1) {
      await startGraveyard(page);
      const menu = await pauseSnapshot(page);
      assertFourControls(menu, { checkpointAvailable: true, skipAvailable: false });
      const navigation = page.waitForNavigation({ waitUntil: 'load' });
      await page.locator('[data-scene-recovery-action="checkpoint"]').click();
      await navigation;

      const ledger = JSON.parse(await assertPreviewIsolation(page, sentinel));
      assert.equal(ledger[SCENE_IDS.SQUATCH_GRAVEYARD].checkpointRestarts, retry,
        `preview reload ${retry} must retain exactly ${retry} checkpoint restart(s)`);
      assert.equal(ledger[SCENE_IDS.SQUATCH_GRAVEYARD].sceneRestarts, 0);
    }

    await startGraveyard(page);
    const unlockedByCheckpoint = await pauseSnapshot(page);
    assertFourControls(unlockedByCheckpoint, { checkpointAvailable: true, skipAvailable: true });
    const sceneRestartNavigation = page.waitForNavigation({ waitUntil: 'load' });
    await page.locator('[data-scene-recovery-action="scene"]').click();
    await sceneRestartNavigation;
    let ledger = JSON.parse(await assertPreviewIsolation(page, sentinel));
    assert.equal(ledger[SCENE_IDS.SQUATCH_GRAVEYARD].checkpointRestarts, 2);
    assert.equal(ledger[SCENE_IDS.SQUATCH_GRAVEYARD].sceneRestarts, 1,
      'Restart Scene must own its distinct durable counter');

    await startGraveyard(page);
    const unlockedAfterSceneRestart = await pauseSnapshot(page);
    assertFourControls(unlockedAfterSceneRestart, { checkpointAvailable: true, skipAvailable: true });

    await page.evaluate(({ key, missionId }) => {
      window.addEventListener('beforeunload', () => {
        const state = window.GRAVEYARD.campaignState;
        const mission = state.missions[missionId];
        sessionStorage.setItem(key, JSON.stringify({
          scene: state.scene,
          incident: {
            status: mission.status,
            checkpoint: mission.checkpoint,
            burialComplete: mission.burialComplete,
          },
        }));
      }, { once: true });
    }, { key: proofKey, missionId: MISSION_IDS.BADA_BING_TWO });

    await Promise.all([
      page.waitForURL(`${BASE}/motel.html?preview=1`, { waitUntil: 'load' }),
      page.locator('[data-scene-recovery-action="skip"]').click(),
    ]);
    const proof = JSON.parse(await page.evaluate((key) => sessionStorage.getItem(key), proofKey));
    assert.deepEqual(proof, {
      scene: { id: SCENE_IDS.JERKY_MOTEL, spawn: 'passenger_seat' },
      incident: { status: 'complete', checkpoint: 'buried', burialComplete: true },
    }, 'Skip Scene must commit the burial and destination before navigation leaves the graveyard');
    ledger = JSON.parse(await assertPreviewIsolation(page, sentinel));
    assert.equal(ledger[SCENE_IDS.SQUATCH_GRAVEYARD].checkpointRestarts, 2);
    assert.equal(ledger[SCENE_IDS.SQUATCH_GRAVEYARD].sceneRestarts, 1);
    assert.deepEqual(errors, [], `Graveyard browser errors: ${JSON.stringify(errors)}`);
    report.push({
      scene: 'graveyard',
      checkpointRestarts: 2,
      sceneRestarts: 1,
      skipUnlocked: true,
      destination: page.url(),
      proof,
    });
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  if (server.listening) await closeServer();
}

for (const item of report) console.log('ok scene recovery', JSON.stringify(item));
assert.deepEqual(report.map(({ scene }) => scene), ['beefrun', 'graveyard']);
