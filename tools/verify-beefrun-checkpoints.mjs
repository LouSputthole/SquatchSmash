#!/usr/bin/env node
/**
 * Fast browser contract for the shareable Beef Run demo links.  The complete
 * Beef Run verifier flies the whole campaign; this one proves the public
 * walkaround/recovery/demo starts reach their playable state without touching
 * saved progress.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { EH, HOME_APPROACH } from '../src/beefrun/config.js';

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

function planarDistance(position, origin) {
  return Math.hypot(position.x - origin.x, position.z - origin.z);
}

const report = [];
let browser;
try {
  await new Promise((resolve) => server.listen(PORT, resolve));
  browser = await chromium.launch({
    /* Same resolution as every other verifier here. Without the
     * PLAYWRIGHT_BROWSERS_PATH arm this falls back to the bundled headless
     * shell, which is not installed in the container, so the script died on
     * launch rather than on anything it was meant to check. */
    executablePath: process.env.PLAYWRIGHT_CHROMIUM
      || (process.env.PLAYWRIGHT_BROWSERS_PATH
        ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  for (const spec of [
    {
      checkpoint: 'preflight',
      startLabel: 'preflight check',
      phase: 'preflight',
      inCockpit: false,
      missionCheckpoint: null,
      campaignCheckpoint: 'airstrip',
      cargoLoaded: false,
      cargoCrates: 0,
      verify(state) {
        return state.playerToFirstCheck >= 1
          && state.playerToFirstCheck <= 4
          && state.playerEnabled
          && state.playerMode === 'walk'
          && state.preflightWalked > 0.2
          && state.checklistVisible
          && !state.flightHudVisible
          && !state.controlsVisible;
      },
    },
    {
      checkpoint: 'takeoff',
      startLabel: 'runway takeoff',
      phase: 'lineup',
      inCockpit: true,
      missionCheckpoint: 'takeoff',
      campaignCheckpoint: 'airstrip',
      cargoLoaded: false,
      cargoCrates: 0,
      verify(state) {
        return Math.abs(state.position.x - state.lineUp.x) < 0.1
          && Math.abs(state.position.z - state.lineUp.z) < 0.1
          && state.radio?.present
          && state.radio.station === '97.8 THE SQUATCH'
          && state.radio.startupCuesResident
          && state.radio.poweredOn
          && state.radio.osdVisible
          && state.radio.positionError < 0.02
          && state.radio.pannerPositionError < 0.02
          && state.radio.duckedForMissionComms
          && state.radio.restoredAfterMissionComms
          && state.radio.survivedCheckpointRestore
          && state.radio.checkpointSplitReset
          && state.radio.checkpointThrottlesBalanced
          && state.radio.musicOwnersBefore.join('|') === state.radio.musicOwnersAfter.join('|')
          && state.radio.poweredOff
          && state.radio.receiverSavedOff;
      },
    },
    {
      checkpoint: 'approach',
      startLabel: 'el hueso approach',
      phase: 'approach',
      inCockpit: true,
      missionCheckpoint: 'approach',
      campaignCheckpoint: 'remote_strip',
      cargoLoaded: false,
      cargoCrates: 0,
      verify(state) {
        return planarDistance(state.position, { x: EH.x - 40, z: EH.zLow + 2600 }) < 90
          && state.heightAboveGround > 300
          && state.speed > 40
          && state.throttlesBalanced
          && state.throttleL > 0.3
          && state.flaps === 0.5
          && !state.parkingBrake
          && !state.inputParkingBrake;
      },
    },
    {
      checkpoint: 'departure',
      startLabel: 'loaded departure',
      phase: 'heavyTakeoff',
      inCockpit: true,
      missionCheckpoint: 'departure',
      campaignCheckpoint: 'returning',
      cargoLoaded: true,
      cargoCrates: 3,
      verify(state) {
        return Math.abs(state.position.x - state.remoteDeparture.x) < 0.1
          && Math.abs(state.position.z - state.remoteDeparture.z) < 0.1
          && state.flaps === 0.5
          && state.parkingBrake
          && state.inputParkingBrake
          && state.physicalCargo.loaded === 3
          && state.physicalCargo.strapped === 3;
      },
    },
    {
      checkpoint: 'return',
      startLabel: 'home approach',
      phase: 'home',
      inCockpit: true,
      missionCheckpoint: 'return',
      campaignCheckpoint: 'landed_home',
      cargoLoaded: true,
      cargoCrates: 3,
      verify(state) {
        return planarDistance(state.position, HOME_APPROACH.entry) < 90
          && state.heightAboveGround > 20
          && state.speed > 30
          && state.throttlesBalanced
          && state.throttleL > 0.2
          && state.flaps === 0
          && !state.parkingBrake
          && !state.inputParkingBrake
          && state.physicalCargo.loaded === 3
          && state.physicalCargo.strapped === 3;
      },
    },
    {
      checkpoint: 'landing',
      startLabel: 'final landing',
      phase: 'home',
      inCockpit: true,
      missionCheckpoint: 'return',
      campaignCheckpoint: 'landed_home',
      cargoLoaded: true,
      cargoCrates: 3,
      verify(state) {
        return planarDistance(state.position, HOME_APPROACH.demoLanding) < 90
          && state.heightAboveGround > 20
          && state.speed > 30
          && state.throttlesBalanced
          && state.throttleL > 0.2
          && state.flaps === 0.5
          && !state.parkingBrake
          && !state.inputParkingBrake
          && state.physicalCargo.loaded === 3
          && state.physicalCargo.strapped === 3;
      },
    },
  ]) {
    /* One clean origin per public link. The sentinel is the player's real
     * campaign; the preview may create and mutate its page-local campaign as
     * much as it needs to, but this value and namespace must remain untouched. */
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const canonicalSentinel = `canonical-beefrun-${spec.checkpoint}`;
    await context.addInitScript((sentinel) => {
      localStorage.setItem('squatchlife.campaign', sentinel);
    }, canonicalSentinel);
    const page = await context.newPage();
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
    await page.waitForFunction(({ phase, inCockpit }) => {
      const game = window.__beefrun;
      return game?.mission?.flags?.inCockpit === inCockpit && game.mission.phase === phase;
    }, { phase: spec.phase, inCockpit: spec.inCockpit }, { timeout: 300000 });
    // The title card fades over half a second.  Wait for the actual visual
    // handoff, not merely the mission state, before claiming a playable link.
    await page.waitForFunction(() => {
      const overlay = document.getElementById('overlay');
      return overlay?.classList.contains('hidden') && Number(getComputedStyle(overlay).opacity) < 0.01;
    }, null, { timeout: 10000 });
    let preflightWalked = 0;
    if (!spec.inCockpit) {
      const before = await page.evaluate(() => ({
        x: window.__beefrun.player.position.x,
        z: window.__beefrun.player.position.z,
      }));
      await page.keyboard.down('w');
      await page.waitForTimeout(180);
      await page.keyboard.up('w');
      await page.waitForTimeout(50);
      const after = await page.evaluate(() => ({
        x: window.__beefrun.player.position.x,
        z: window.__beefrun.player.position.z,
      }));
      preflightWalked = planarDistance(before, after);
    }
    const radioContract = await page.evaluate(async (exerciseControls) => {
        const game = window.__beefrun;
        const radio = game?.radio;
        if (!radio) return { present: false };

        const frames = () => new Promise((resolve) => requestAnimationFrame(
          () => requestAnimationFrame(resolve),
        ));
        const press = async (code) => {
          document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
          await frames();
        };
        const musicOwners = () => [...game.audio.engine.loops.keys()]
          .filter((key) => key.startsWith('music.')).sort();

        const musicOwnersBefore = musicOwners();
        const expectedPosition = game.aircraft.parts.radioStack.getWorldPosition(new game.THREE.Vector3());
        const common = {
          present: true,
          station: radio.station?.name,
          venue: radio.venue,
          startupCuesResident: radio.preloadCueNames({
            hours: [game.radioClock.hour], startupOnly: true,
          }).every((name) => game.audio.engine.buffers.has(name)),
          /* The receiver's authored position exists even while the set is
           * off; its WebAudio panner is deliberately lazy and does not. */
          positionError: radio.position.distanceTo(expectedPosition),
          duplicateMusicOwners: musicOwnersBefore.length - new Set(musicOwnersBefore).size,
          poweredOff: !radio.on,
          receiverPrefersOff: radio.preferredOn === false
            && game.campaignState.radio.receivers.beefrun_cockpit !== true,
        };
        if (!exerciseControls) return common;

        await press('KeyR');
        const poweredOn = radio.on;
        const pannerPosition = radio.panner
          ? new game.THREE.Vector3(
            radio.panner.positionX?.value ?? 0,
            radio.panner.positionY?.value ?? 0,
            radio.panner.positionZ?.value ?? 0,
          ) : new game.THREE.Vector3(Infinity, Infinity, Infinity);
        const pannerPositionError = pannerPosition.distanceTo(expectedPosition);
        const osd = document.getElementById('radio-osd');
        const osdVisible = !osd.classList.contains('hidden') && getComputedStyle(osd).display !== 'none';

        game.dialogue.clear();
        game.dialogue.play('start.begin', { urgent: true });
        await frames();
        const duckedForMissionComms = game.dialogue.busy && radio.phoneDucked;
        game.dialogue.clear();
        await frames();
        const restoredAfterMissionComms = !radio.phoneDucked;

        game.input.throttleSplit = 1;
        const survivedCheckpointRestore = game.mission.restoreCheckpoint('takeoff') && radio.on;
        await frames();
        const checkpointSplitReset = game.input.throttleSplit === 0;
        const checkpointThrottlesBalanced = Math.abs(
          game.physics.controls.throttleL - game.physics.controls.throttleR,
        ) < 1e-6;
        await press('KeyN');
        await press('KeyT');
        const musicOwnersAfter = musicOwners();
        await press('KeyR');

        return {
          ...common,
          poweredOn,
          pannerPositionError,
          osdVisible,
          duckedForMissionComms,
          restoredAfterMissionComms,
          survivedCheckpointRestore,
          checkpointSplitReset,
          checkpointThrottlesBalanced,
          musicOwnersBefore,
          musicOwnersAfter,
          poweredOff: !radio.on && osd.classList.contains('hidden'),
          receiverSavedOff: game.campaignState.radio.receivers.beefrun_cockpit === false,
        };
      }, spec.checkpoint === 'takeoff');
    const state = await page.evaluate(({ canonicalSentinel, preflightWalked }) => {
      const game = window.__beefrun;
      const mission = game.campaignState.missions.airstrip_smuggling;
      const firstCheck = game.mission.preflight.chocks[0].getWorldPosition(game.physics.position.clone());
      const physicalCargo = Object.values(game.cargo.zones).reduce((summary, zone) => ({
        loaded: summary.loaded + Number(Boolean(zone.crate)),
        strapped: summary.strapped + Number(Boolean(zone.crate && zone.strapped)),
      }), { loaded: 0, strapped: 0 });
      const campaignKeys = Object.keys(localStorage)
        .filter((key) => key.startsWith('squatchlife.campaign')).sort();
      return {
        phase: game.mission.phase,
        inCockpit: game.mission.flags.inCockpit,
        checkpoint: game.mission.checkpoint,
        campaignCheckpoint: mission.checkpoint,
        cargoLoaded: mission.cargoLoaded,
        enginesRunning: game.engines.bothRunning,
        playerEnabled: game.player.enabled,
        playerMode: game.player.mode,
        preflightWalked,
        flightHudVisible: !document.getElementById('br-hud').classList.contains('hidden'),
        controlsVisible: !document.getElementById('br-controls').classList.contains('hidden'),
        checklistVisible: !document.getElementById('br-checklist').classList.contains('hidden'),
        overlayHidden: document.getElementById('overlay').classList.contains('hidden')
          && Number(getComputedStyle(document.getElementById('overlay')).opacity) < 0.01,
        flaps: game.physics.controls.flaps,
        speed: game.physics.velocity.length(),
        heading: game.physics.headingDeg,
        throttleL: game.physics.controls.throttleL,
        throttleR: game.physics.controls.throttleR,
        throttleSplit: game.input.throttleSplit,
        throttlesBalanced: Math.abs(
          game.physics.controls.throttleL - game.physics.controls.throttleR,
        ) < 1e-6,
        parkingBrake: game.physics.controls.parkingBrake,
        inputParkingBrake: game.input.parkingBrake,
        physicalCargo,
        playerToFirstCheck: game.player.position.distanceTo(firstCheck),
        heightAboveGround: game.physics.agl,
        position: { x: game.physics.position.x, y: game.physics.position.y, z: game.physics.position.z },
        lineUp: {
          x: game.mission.airfield.anchors.lineUp.x,
          z: game.mission.airfield.anchors.lineUp.z,
        },
        remoteDeparture: {
          x: game.mission.airstrip.anchors.departStart.x,
          z: game.mission.airstrip.anchors.departStart.z,
        },
        saveIsolation: {
          campaignKeys,
          canonicalUnchanged: localStorage.getItem('squatchlife.campaign') === canonicalSentinel,
          storageClass: game.campaign.storage?.constructor?.name ?? null,
          storageDistinct: game.campaign.storage !== localStorage,
          previewStored: game.campaign.storage?.getItem?.('squatchlife.campaign') !== null,
        },
      };
    }, { canonicalSentinel, preflightWalked });
    state.radio = radioContract;
    const screenshot = path.join(os.tmpdir(), `beefrun-${spec.checkpoint}-checkpoint.png`);
    await page.screenshot({ path: screenshot });
    const flightReady = spec.inCockpit
      ? state.enginesRunning && state.flightHudVisible && state.controlsVisible
      : !state.enginesRunning && !state.flightHudVisible && !state.controlsVisible;
    const radioReady = state.radio.present
      && state.radio.station === '97.8 THE SQUATCH'
      && state.radio.venue === 'beefrun'
      && state.radio.startupCuesResident
      && state.radio.positionError < 0.02
      && state.radio.duplicateMusicOwners === 0
      && state.radio.poweredOff
      && state.radio.receiverPrefersOff;
    const saveIsolated = state.saveIsolation.canonicalUnchanged
      && state.saveIsolation.campaignKeys.join('|') === 'squatchlife.campaign'
      && state.saveIsolation.storageClass === 'PreviewMemoryStorage'
      && state.saveIsolation.storageDistinct
      && state.saveIsolation.previewStored;
    const ok = startLabel.toLowerCase().includes(spec.startLabel)
      && state.phase === spec.phase
      && state.inCockpit === spec.inCockpit
      && state.checkpoint === spec.missionCheckpoint
      && state.campaignCheckpoint === spec.campaignCheckpoint
      && state.cargoLoaded === spec.cargoLoaded
      && state.physicalCargo.loaded === spec.cargoCrates
      && state.physicalCargo.strapped === spec.cargoCrates
      && flightReady
      && radioReady
      && saveIsolated
      && state.overlayHidden
      && spec.verify(state)
      && errors.length === 0;
    report.push({ checkpoint: spec.checkpoint, ok, state, errors, screenshot });
    await context.close();
    assert.ok(ok, `Beef Run ${spec.checkpoint} checkpoint failed: ${JSON.stringify(report.at(-1))}`);
  }
} finally {
  if (browser) await browser.close();
  await close(server);
}

for (const item of report) {
  console.log(`${item.ok ? 'ok' : 'FAIL'} ${item.checkpoint}`, JSON.stringify(item.state));
}
assert.deepEqual(
  report.map(({ checkpoint }) => checkpoint),
  ['preflight', 'takeoff', 'approach', 'departure', 'return', 'landing'],
  'the public Beef Run launcher has six phase links and every one needs a live contract',
);
