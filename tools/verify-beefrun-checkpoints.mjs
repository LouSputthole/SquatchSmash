#!/usr/bin/env node
/**
 * Fast browser contract for the shareable Beef Run demo links.  The complete
 * Beef Run verifier flies the whole campaign; this one proves the two public
 * recovery/demo starts reach a live cockpit without touching saved progress.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { HOME_APPROACH } from '../src/beefrun/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5222;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

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

function close(serverOrBrowser) {
  return new Promise((resolve) => serverOrBrowser.close(() => resolve()));
}

const report = [];
let browser;
try {
  await new Promise((resolve) => server.listen(PORT, resolve));
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  for (const spec of [
    {
      checkpoint: 'takeoff',
      phase: 'lineup',
      campaignCheckpoint: 'airstrip',
      cargoLoaded: false,
      verify(state) {
        return Math.abs(state.position.x - state.lineUp.x) < 0.1
          && Math.abs(state.position.z - state.lineUp.z) < 0.1;
      },
    },
    {
      checkpoint: 'landing',
      phase: 'home',
      campaignCheckpoint: 'landed_home',
      cargoLoaded: true,
      verify(state) {
        return Math.abs(state.position.x - HOME_APPROACH.demoLanding.x) < 0.1
          && Math.abs(state.position.z - HOME_APPROACH.demoLanding.z) < 90
          && state.heightAboveGround > 20;
      },
    },
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`http://localhost:${PORT}/beefrun.html?preview=1&checkpoint=${spec.checkpoint}`, {
      waitUntil: 'load',
    });
    await page.waitForFunction(() => window.__beefrun?.mission && document.getElementById('start-btn'));
    const startLabel = await page.locator('#start-btn').textContent();
    await page.locator('#start-btn').click({ force: true });
    await page.waitForFunction((phase) => {
      const game = window.__beefrun;
      return game?.mission?.flags?.inCockpit && game.mission.phase === phase;
    }, spec.phase, { timeout: 300000 });
    // The title card fades over half a second.  Wait for the actual visual
    // handoff, not merely the mission state, before claiming a playable link.
    await page.waitForFunction(() => {
      const overlay = document.getElementById('overlay');
      return overlay?.classList.contains('hidden') && Number(getComputedStyle(overlay).opacity) < 0.01;
    }, null, { timeout: 10000 });
    const state = await page.evaluate(() => {
      const game = window.__beefrun;
      const mission = game.campaignState.missions.airstrip_smuggling;
      return {
        phase: game.mission.phase,
        inCockpit: game.mission.flags.inCockpit,
        checkpoint: game.mission.checkpoint,
        campaignCheckpoint: mission.checkpoint,
        cargoLoaded: mission.cargoLoaded,
        enginesRunning: game.engines.bothRunning,
        flightHudVisible: !document.getElementById('br-hud').classList.contains('hidden'),
        controlsVisible: !document.getElementById('br-controls').classList.contains('hidden'),
        overlayHidden: document.getElementById('overlay').classList.contains('hidden')
          && Number(getComputedStyle(document.getElementById('overlay')).opacity) < 0.01,
        heightAboveGround: game.physics.agl,
        position: { x: game.physics.position.x, y: game.physics.position.y, z: game.physics.position.z },
        lineUp: {
          x: game.mission.airfield.anchors.lineUp.x,
          z: game.mission.airfield.anchors.lineUp.z,
        },
      };
    });
    const screenshot = path.join(os.tmpdir(), `beefrun-${spec.checkpoint}-checkpoint.png`);
    await page.screenshot({ path: screenshot });
    const ok = startLabel.toLowerCase().includes(spec.checkpoint === 'landing' ? 'final landing' : 'runway takeoff')
      && state.phase === spec.phase
      && state.inCockpit
      && state.checkpoint === (spec.checkpoint === 'landing' ? 'return' : spec.checkpoint)
      && state.campaignCheckpoint === spec.campaignCheckpoint
      && state.cargoLoaded === spec.cargoLoaded
      && state.enginesRunning
      && state.flightHudVisible
      && state.controlsVisible
      && state.overlayHidden
      && spec.verify(state)
      && errors.length === 0;
    report.push({ checkpoint: spec.checkpoint, ok, state, errors, screenshot });
    await page.close();
    assert.ok(ok, `Beef Run ${spec.checkpoint} checkpoint failed: ${JSON.stringify(report.at(-1))}`);
  }
} finally {
  if (browser) await browser.close();
  await close(server);
}

for (const item of report) {
  console.log(`${item.ok ? 'ok' : 'FAIL'} ${item.checkpoint}`, JSON.stringify(item.state));
}
