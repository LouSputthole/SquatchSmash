#!/usr/bin/env node
/**
 * Browser proof for the final arc's durable reload seams.
 *
 * These checks deliberately enter ordinary, non-preview URLs with a campaign
 * save already on disk. They then press each scene's real Start button and
 * inspect the scene's established debug surface. Conflicting `?checkpoint=`
 * query strings are included on ordinary URLs to prove that shareable preview
 * shortcuts cannot override the durable checkpoint.
 *
 * A second set of cold loads proves that completed Silver Case, Mansion Siege,
 * and Enola saves reopen their existing Continue cards without navigating or
 * rewriting campaign storage. Finally, each scene is opened in preview mode
 * over sentinel localStorage values to prove preview play remains isolated.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAMPAIGN_STORAGE_KEY,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { FINAL_ARC_LOADOUT_STORAGE_KEY } from '../src/core/final-arc-loadout-storage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5232;
const BASE = `http://localhost:${PORT}`;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Build a normalized, realistic final-arc state and then let one scenario
 * override the mission it is testing. Keeping upstream chapters complete is
 * important: this is a reload proof, not a direct-entry unlock bypass.
 */
function finalArcState({ sceneId, spawn, mutate }) {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    Object.assign(state.missions[MISSION_IDS.SILVER_CASE], {
      status: 'complete',
      checkpoint: 'case_recovered',
      caseRecovered: true,
      winstonOutcome: 'spared',
    });
    Object.assign(state.missions[MISSION_IDS.SILENT_SQUATCH], {
      status: 'complete',
      checkpoint: 'clear',
      casePlaced: true,
      caseDelivered: true,
      labLocked: true,
      aubbieEliminated: true,
      silentNightActivated: true,
      scientistsLost: 6,
      basementUnlocked: true,
      notesRecovered: true,
      conspiracyBoard: true,
      trophyAwarded: true,
      eveningReady: true,
      sleptAtMansion: true,
    });
    Object.assign(state.missions[MISSION_IDS.MANSION_SIEGE], {
      status: 'complete',
      checkpoint: 'wave_one',
      attackersDown: 21,
      littleFriendSaid: true,
      sasoleMet: true,
    });
    Object.assign(state.missions[MISSION_IDS.ENOLA_SQUATCH], {
      status: 'complete',
      checkpoint: 'return',
      rank: 'Night Ops Professional',
      score: 0.84,
      unlocks: ['precision_release'],
      payloadReleased: true,
      returnedHome: true,
    });
    state.missions[MISSION_IDS.MANSION_RETURN].status = 'available';
    state.inventory.carried = state.inventory.carried
      .filter((id) => id !== ITEM_IDS.SILVER_CASE);
    state.scene = { id: sceneId, spawn };
    mutate?.(state);
  });
  return campaign.state;
}

const STATES = {
  silverSpared: finalArcState({
    sceneId: SCENE_IDS.SILVER_CASE,
    spawn: 'car_ride',
    mutate(state) {
      Object.assign(state.missions[MISSION_IDS.SILVER_CASE], {
        status: 'in_progress',
        checkpoint: 'case_recovered',
        caseRecovered: false,
        winstonOutcome: 'spared',
        irritatedApe: true,
        apeFinishedChester: false,
        apeFinishedWinston: false,
      });
      state.missions[MISSION_IDS.SILENT_SQUATCH].status = 'locked';
      state.story.chapter = 'silver_case';
    },
  }),
  silverPlayerKilled: finalArcState({
    sceneId: SCENE_IDS.SILVER_CASE,
    spawn: 'car_ride',
    mutate(state) {
      Object.assign(state.missions[MISSION_IDS.SILVER_CASE], {
        status: 'in_progress',
        checkpoint: 'case_recovered',
        caseRecovered: false,
        winstonOutcome: 'player_killed',
        irritatedApe: false,
        apeFinishedChester: true,
        apeFinishedWinston: false,
      });
      state.missions[MISSION_IDS.SILENT_SQUATCH].status = 'locked';
      state.story.chapter = 'silver_case';
    },
  }),
  silverApeKilled: finalArcState({
    sceneId: SCENE_IDS.SILVER_CASE,
    spawn: 'car_ride',
    mutate(state) {
      Object.assign(state.missions[MISSION_IDS.SILVER_CASE], {
        status: 'in_progress',
        checkpoint: 'case_recovered',
        caseRecovered: false,
        winstonOutcome: 'ape_killed',
        irritatedApe: true,
        apeFinishedChester: true,
        apeFinishedWinston: true,
      });
      state.missions[MISSION_IDS.SILENT_SQUATCH].status = 'locked';
      state.story.chapter = 'silver_case';
    },
  }),
  mansionLocked: finalArcState({
    sceneId: SCENE_IDS.MANSION,
    spawn: 'gate',
    mutate(state) {
      Object.assign(state.missions[MISSION_IDS.SILENT_SQUATCH], {
        status: 'in_progress',
        checkpoint: 'locked',
        casePlaced: true,
        caseDelivered: true,
        labLocked: true,
        aubbieEliminated: false,
        silentNightActivated: false,
        scientistsLost: 0,
        basementUnlocked: true,
        notesRecovered: false,
        conspiracyBoard: false,
        trophyAwarded: false,
        eveningReady: false,
        sleptAtMansion: false,
      });
      state.missions[MISSION_IDS.MANSION_SIEGE].status = 'locked';
      state.story.chapter = 'mansion';
    },
  }),
  siegeBriefed: finalArcState({
    sceneId: SCENE_IDS.MANSION_SIEGE,
    spawn: 'guest_room',
    mutate(state) {
      Object.assign(state.missions[MISSION_IDS.MANSION_SIEGE], {
        status: 'in_progress',
        checkpoint: 'briefed',
        attackersDown: 3,
        littleFriendSaid: false,
        sasoleMet: false,
      });
      state.missions[MISSION_IDS.ENOLA_SQUATCH].status = 'locked';
      state.story.chapter = 'mansion_siege';
    },
  }),
  enolaPreRelease: finalArcState({
    sceneId: SCENE_IDS.ENOLA_SQUATCH,
    spawn: 'airfield',
    mutate(state) {
      Object.assign(state.missions[MISSION_IDS.ENOLA_SQUATCH], {
        status: 'in_progress',
        checkpoint: 'preRelease',
        checkpointSnapshot: {
          name: 'preRelease',
          fuel: 1712.25,
          damage: { wing: 0.21, gear: 0.08, tireBurst: true },
          targeting: { scoreSum: 91, scoreTime: 100 },
          score: {
            takeoff: 0.86,
            finalLanding: null,
            patrolPeak: 0.23,
            flightTime: 812.5,
            fuelRemaining: 0.57075,
            damage: 0.329,
            bombAccuracy: 0.78,
            expressShipping: false,
            corridorScore: 0.91,
            fightersDestroyed: 2,
            fighterPasses: 4,
            autopilotSeconds: 17.5,
            blastDistance: 1460,
          },
        },
        rank: null,
        score: 0,
        unlocks: [],
        payloadReleased: false,
        returnedHome: false,
      });
      state.missions[MISSION_IDS.MANSION_RETURN].status = 'locked';
      state.story.chapter = 'enola_squatch';
    },
  }),
  palaceAlarmedDiningRoom: finalArcState({
    sceneId: SCENE_IDS.CARTEL_PALACE,
    spawn: 'approach',
    mutate(state) {
      Object.assign(state.missions[MISSION_IDS.MANSION_RETURN], {
        status: 'complete',
        briefingComplete: true,
        wrongCityConfirmed: true,
        sauceMissingConfirmed: true,
        palaceLocationKnown: true,
      });
      Object.assign(state.missions[MISSION_IDS.CARTEL_PALACE], {
        status: 'in_progress',
        checkpoint: 'dining_room',
        evidenceFound: [
          'sauce_belongings',
          'sauce_payment_ledger',
          'sauce_security_still',
        ],
        sauceBetrayalConfirmed: true,
        alarmRaised: true,
        alarmReason: 'gunshot',
        markEliminated: false,
        sauceEliminated: false,
        outcome: null,
      });
      state.story.chapter = 'cartel_palace';
    },
  }),
  silverComplete: finalArcState({
    sceneId: SCENE_IDS.SILVER_CASE,
    spawn: 'car_ride',
  }),
  siegeComplete: finalArcState({
    sceneId: SCENE_IDS.MANSION_SIEGE,
    spawn: 'guest_room',
  }),
  enolaComplete: finalArcState({
    sceneId: SCENE_IDS.ENOLA_SQUATCH,
    spawn: 'airfield',
  }),
};

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot browser-verify final-arc reloads.');
  process.exit(1);
}

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

const browser = await chromium.launch({
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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

const CAMPAIGN_SENTINEL = JSON.stringify(STATES.enolaComplete);
const LOADOUT_SENTINEL = JSON.stringify({
  version: 1,
  slots: ['revolver', null, null, null, null],
  selected: 0,
  equipped: 'revolver',
  ammo: { revolver: { rounds: 5, reserve: 17 } },
});

async function openSeeded({ state, url, ready }) {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 280)}`);
  });
  await page.addInitScript(({ campaignKey, loadoutKey, campaignValue, loadoutValue }) => {
    /* Seed the new context once. A real page.reload() must then consume the
     * writes made by the first runtime, not silently overwrite them with the
     * fixture again. */
    if (localStorage.getItem(campaignKey) === null) {
      localStorage.setItem(campaignKey, campaignValue);
    }
    if (localStorage.getItem(loadoutKey) === null) {
      localStorage.setItem(loadoutKey, loadoutValue);
    }
  }, {
    campaignKey: CAMPAIGN_STORAGE_KEY,
    loadoutKey: FINAL_ARC_LOADOUT_STORAGE_KEY,
    campaignValue: JSON.stringify(state),
    loadoutValue: LOADOUT_SENTINEL,
  });
  await page.goto(`${BASE}${url}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(ready, null, { timeout: 120_000 });
  return { context, page, errors };
}

async function storage(page) {
  return page.evaluate(({ campaignKey, loadoutKey }) => ({
    campaign: localStorage.getItem(campaignKey),
    loadout: localStorage.getItem(loadoutKey),
  }), { campaignKey: CAMPAIGN_STORAGE_KEY, loadoutKey: FINAL_ARC_LOADOUT_STORAGE_KEY });
}

async function stayedPut(page, initialUrl, ms = 650) {
  await page.waitForTimeout(ms);
  return page.url() === initialUrl;
}

async function closeScenario(context) {
  await context.close();
}

try {
  // Keeping one browser but one context at a time releases each heavy WebGL
  // scene before the next one starts.

  console.log('\nThe Silver Case durable branch reloads');
  for (const branch of [
    {
      label: 'spared', state: STATES.silverSpared,
      alive: true, irritatedApe: true, apeFinishedChester: false, apeFinishedWinston: false,
    },
    {
      label: 'player killed', state: STATES.silverPlayerKilled,
      alive: false, irritatedApe: false, apeFinishedChester: true, apeFinishedWinston: false,
    },
    {
      label: 'Ape killed', state: STATES.silverApeKilled,
      alive: false, irritatedApe: true, apeFinishedChester: true, apeFinishedWinston: true,
    },
  ]) {
    const { context, page, errors } = await openSeeded({
      state: branch.state,
      url: '/silvercase.html?checkpoint=car',
      ready: () => Boolean(window.silvercase?.fsm),
    });
    const initialUrl = page.url();
    await page.evaluate(() => window.silvercase.begin());
    /* SilverCaseStateMachine.go() deliberately applies transitions at the end
     * of the next real update. Waiting here proves the scene's played beat,
     * rather than mistaking that one-frame request queue for a failed resume. */
    await page.waitForFunction(() => window.silvercase.state().beat === 'PICK_UP_CASE');
    const restored = await page.evaluate(() => {
      const played = window.silvercase.state();
      return {
        preview: window.silvercase.campaign.preview,
        beat: played.beat,
        winstonAlive: played.actors.winston.alive,
        flags: played.mission.flags,
        saved: window.silvercase.campaign.state().missions.silver_case,
      };
    });
    check(`Silver ${branch.label} reload reaches case recovery, not the conflicting car query`,
      !restored.preview && restored.beat === 'PICK_UP_CASE'
        && restored.saved.checkpoint === 'case_recovered',
      JSON.stringify(restored));
    check(`Silver ${branch.label} reload preserves Winston and Ape branch facts`,
      restored.winstonAlive === branch.alive
        && restored.flags.irritatedApe === branch.irritatedApe
        && restored.flags.apeFinishedChester === branch.apeFinishedChester
        && restored.flags.apeFinishedWinston === branch.apeFinishedWinston,
      JSON.stringify(restored));
    check(`Silver ${branch.label} reload remains on-page until the player advances`,
      await stayedPut(page, initialUrl));
    check(`Silver ${branch.label} reload raises no browser errors`,
      errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  console.log('\nMansion / PROJECT SILENT SQUATCH durable reload');
  {
    const { context, page, errors } = await openSeeded({
      state: STATES.mansionLocked,
      url: '/mansion.html?checkpoint=office',
      ready: () => Boolean(window.mansion?.mission),
    });
    const initialUrl = page.url();
    const entry = await page.evaluate(() => ({
      preview: window.mansion.campaign.preview,
      resumed: window.mansion.campaign.entry?.resumed,
      checkpoint: window.mansion.campaign.entry?.checkpoint,
      jumped: window.mansion.checkpoints.jumped,
    }));
    check('Mansion recognizes the ordinary save as a durable locked-beat resume',
      !entry.preview && entry.resumed === true && entry.checkpoint === 'locked', JSON.stringify(entry));
    check('Mansion does not consume the conflicting ordinary URL checkpoint before Start',
      entry.jumped === null, JSON.stringify(entry));
    await page.click('#startBtn');
    await page.waitForFunction(() => window.mansion?.checkpoints?.jumped === 'locked', null, { timeout: 120_000 });
    const restored = await page.evaluate(() => ({
      jumped: window.mansion.checkpoints.jumped,
      saved: window.mansion.campaign.state().missions.silent_squatch,
      running: window.mansion.player.enabled,
    }));
    check('Mansion replays the real ladder to the durable locked checkpoint',
      restored.jumped === 'locked'
        && restored.saved.checkpoint === 'locked'
        && restored.saved.labLocked === true
        && restored.saved.aubbieEliminated === false,
      JSON.stringify(restored));
    check('Mansion reload remains on the loaded page until the player advances',
      await stayedPut(page, initialUrl));
    check('Mansion reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  console.log('\nMansion Siege durable reload');
  {
    const { context, page, errors } = await openSeeded({
      state: STATES.siegeBriefed,
      url: '/mansion-siege.html?checkpoint=wave_one',
      ready: () => Boolean(window.mansionSiege?.scene),
    });
    const initialUrl = page.url();
    const before = await page.evaluate(() => ({
      preview: window.mansionSiege.campaign.preview,
      requested: window.mansionSiege.startCheckpoint,
      saved: window.mansionSiege.campaign.state().missions.mansion_siege,
      card: window.mansionSiege.hud().complete,
    }));
    check('Siege ignores a conflicting ordinary URL checkpoint',
      !before.preview && before.requested === null && before.saved.checkpoint === 'briefed',
      JSON.stringify(before));
    check('Siege does not show a completion card for an in-progress save before Start',
      before.card === false, JSON.stringify(before));
    await page.click('#startBtn');
    await page.waitForFunction(() => window.mansionSiege?.running && window.mansionSiege?.checkpoint === 'briefed', null, { timeout: 120_000 });
    const restored = await page.evaluate(() => ({
      checkpoint: window.mansionSiege.checkpoint,
      beat: window.mansionSiege.beat,
      saved: window.mansionSiege.campaign.state().missions.mansion_siege,
      card: window.mansionSiege.hud().complete,
    }));
    check('Siege replays its real briefing chain to the durable checkpoint',
      restored.checkpoint === 'briefed'
        && restored.saved.checkpoint === 'briefed'
        && restored.saved.attackersDown === 3
        && restored.card === false,
      JSON.stringify(restored));
    check('Siege reload remains on the loaded page until the player advances',
      await stayedPut(page, initialUrl));
    check('Siege reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  console.log('\nThe Enola Squatch durable flight snapshot reload');
  {
    const { context, page, errors } = await openSeeded({
      state: STATES.enolaPreRelease,
      url: '/enolasquatch.html?checkpoint=preflight',
      ready: () => window.__squatch?.enolaSquatch === true,
    });
    const initialUrl = page.url();
    const before = await page.evaluate(() => ({
      preview: window.__enolaSquatch.campaign.preview,
      saved: window.__enolaSquatch.campaign.state().missions.enola_squatch,
      phase: window.__enolaSquatch.state().phase,
    }));
    check('Enola sees the durable preRelease snapshot and ignores the ordinary preflight query',
      !before.preview
        && before.saved.checkpoint === 'preRelease'
        && before.saved.checkpointSnapshot?.fuel === 1712.25
        && before.phase === 'idle',
      JSON.stringify(before));
    const restored = await page.evaluate(() => {
      /* The handler is synchronous; pausing in the same task prevents the RAF
       * loop from burning fuel between restoration and this measurement. */
      document.getElementById('start-btn').click();
      window.__enolaSquatch.mission.paused = true;
      const live = window.__enolaSquatch.state();
      const report = window.__enolaSquatch.mission.report();
      return {
        phase: live.phase,
        checkpoint: live.checkpoint,
        fuel: live.fuel,
        damage: live.physicsDamage,
        score: live.score,
        report: { rank: report.rank, tier: report.tier, total: report.total },
      };
    });
    check('Enola restores the canonical bomb approach with fuel and primitive damage intact',
      restored.phase === 'bombApproach'
        && restored.checkpoint === 'preRelease'
        && restored.fuel === 1712.25
        && restored.damage.wing === 0.21
        && restored.damage.gear === 0.08
        && restored.damage.tireBurst === true,
      JSON.stringify(restored));
    check('Enola restores the score ledger that determines the final rank',
      restored.score.takeoff === 0.86
        && restored.score.bombAccuracy === 0.78
        && restored.score.corridorScore === 0.91
        && restored.score.fightersDestroyed === 2
        && restored.score.fighterPasses === 4
        && restored.report.rank === 'Night Ops Professional'
        && restored.report.tier === 3
        && Math.abs(restored.report.total - 0.8025) < 1e-9,
      JSON.stringify(restored.report));
    check('Enola snapshot reload remains on-page until the player advances',
      await stayedPut(page, initialUrl));
    check('Enola snapshot reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  console.log('\nCartel Palace alarmed clear reload and extraction');
  {
    const { context, page, errors } = await openSeeded({
      state: STATES.palaceAlarmedDiningRoom,
      url: '/cartel-palace.html?checkpoint=approach',
      ready: () => Boolean(window.CARTEL_PALACE?.mission),
    });
    const initialUrl = page.url();
    const before = await page.evaluate(() => ({
      phase: window.CARTEL_PALACE.phase,
      snapshot: window.CARTEL_PALACE.snapshot(),
      saved: window.CARTEL_PALACE.campaignState.missions.cartel_palace,
    }));
    check('Palace sees the alarmed dining-room save and ignores the ordinary approach query before Start',
      before.phase === 'menu'
        && before.saved.checkpoint === 'dining_room'
        && before.saved.alarmRaised === true
        && before.saved.alarmReason === 'gunshot',
      JSON.stringify(before));

    await page.evaluate(() => document.getElementById('start-btn').click());
    await page.waitForFunction(() => window.CARTEL_PALACE.phase === 'active');
    const restoredAlarm = await page.evaluate(() => ({
      snapshot: window.CARTEL_PALACE.snapshot(),
      securityAlarm: window.CARTEL_PALACE.security.alarm,
      checkpoint: window.CARTEL_PALACE.checkpoint,
    }));
    check('Palace physically restores the raised alarm at the dining-room checkpoint',
      restoredAlarm.snapshot.beat === 'dining_room'
        && restoredAlarm.snapshot.alarmRaised === true
        && restoredAlarm.snapshot.alarmReason === 'gunshot'
        && restoredAlarm.securityAlarm === true
        && restoredAlarm.checkpoint === 'dining_room',
      JSON.stringify(restoredAlarm));

    const cleared = await page.evaluate(() => {
      const runtime = window.CARTEL_PALACE;
      const markAccepted = runtime.mission.registerTargetDown('mark');
      const sauceAccepted = runtime.mission.registerTargetDown('sauce');
      return {
        markAccepted,
        sauceAccepted,
        snapshot: runtime.snapshot(),
        saved: runtime.campaignState.missions.cartel_palace,
      };
    });
    check('Palace derives and durably saves hard_exit when both targets fall under alarm',
      cleared.markAccepted === true
        && cleared.sauceAccepted === true
        && cleared.snapshot.beat === 'clear'
        && cleared.snapshot.outcome === 'hard_exit'
        && cleared.saved.checkpoint === 'clear'
        && cleared.saved.alarmRaised === true
        && cleared.saved.markEliminated === true
        && cleared.saved.sauceEliminated === true
        && cleared.saved.outcome === 'hard_exit',
      JSON.stringify(cleared));

    await page.reload({ waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => Boolean(window.CARTEL_PALACE?.mission), null, { timeout: 120_000 });
    await page.evaluate(() => document.getElementById('start-btn').click());
    await page.waitForFunction(() => window.CARTEL_PALACE.phase === 'active');
    const reloadedClear = await page.evaluate(() => ({
      snapshot: window.CARTEL_PALACE.snapshot(),
      saved: window.CARTEL_PALACE.campaignState.missions.cartel_palace,
      markDown: window.CARTEL_PALACE.cast.mark.actor.incapacitated,
      sauceDown: window.CARTEL_PALACE.cast.sauce.actor.incapacitated,
      securityAlarm: window.CARTEL_PALACE.security.alarm,
    }));
    check('Palace reload restages the alarm, both target bodies, and hard_exit clear',
      reloadedClear.snapshot.beat === 'clear'
        && reloadedClear.snapshot.alarmRaised === true
        && reloadedClear.snapshot.outcome === 'hard_exit'
        && reloadedClear.markDown === true
        && reloadedClear.sauceDown === true
        && reloadedClear.securityAlarm === true
        && reloadedClear.saved.outcome === 'hard_exit',
      JSON.stringify(reloadedClear));

    const extracted = await page.evaluate(() => {
      const accepted = window.CARTEL_PALACE.mission.extract();
      return {
        accepted,
        phase: window.CARTEL_PALACE.phase,
        saved: window.CARTEL_PALACE.campaignState.missions.cartel_palace,
        endingVisible: !document.getElementById('ending').classList.contains('hidden'),
      };
    });
    check('Palace extracts from the reloaded clear and completes without changing hard_exit',
      extracted.accepted === true
        && extracted.phase === 'complete'
        && extracted.saved.status === 'complete'
        && extracted.saved.checkpoint === 'clear'
        && extracted.saved.outcome === 'hard_exit'
        && extracted.endingVisible === true,
      JSON.stringify(extracted));
    check('Palace clear reload and extraction remain on-page until Continue is clicked',
      await stayedPut(page, initialUrl));
    check('Palace durable reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  console.log('\nCompleted final-arc cards reopen without auto-navigation');
  {
    const { context, page, errors } = await openSeeded({
      state: STATES.silverComplete,
      url: '/silvercase.html?checkpoint=car',
      ready: () => Boolean(window.silvercase?.fsm),
    });
    const initialUrl = page.url();
    const beforeStorage = await storage(page);
    check('Silver completion card starts hidden on the menu',
      await page.locator('#sceneCompleteOverlay').evaluate((el) => el.classList.contains('hidden')));
    await page.click('#beginBtn');
    await page.waitForFunction(() => !document.getElementById('sceneCompleteOverlay')?.classList.contains('hidden'), null, { timeout: 120_000 });
    const card = await page.evaluate(() => ({
      completed: window.silvercase.campaign.completed,
      text: document.getElementById('playAgainBtn')?.textContent?.trim(),
      hidden: document.getElementById('sceneCompleteOverlay')?.classList.contains('hidden'),
    }));
    check('Silver completed reload restores its established Continue card',
      card.completed && !card.hidden && card.text === "CONTINUE TO LOU'S MANSION", JSON.stringify(card));
    check('Silver completion restore is UI-only and does not rewrite campaign storage',
      (await storage(page)).campaign === beforeStorage.campaign);
    check('Silver completion restore waits for the player to click Continue',
      await stayedPut(page, initialUrl));
    check('Silver completion reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  {
    const { context, page, errors } = await openSeeded({
      state: STATES.siegeComplete,
      url: '/mansion-siege.html?checkpoint=wake',
      ready: () => Boolean(window.mansionSiege?.scene),
    });
    const initialUrl = page.url();
    const beforeStorage = await storage(page);
    check('Siege completion card starts hidden on the menu',
      await page.locator('#missionCard').evaluate((el) => el.classList.contains('hidden')));
    await page.click('#startBtn');
    await page.waitForFunction(() => window.mansionSiege?.hud().complete === true, null, { timeout: 120_000 });
    const card = await page.evaluate(() => ({
      completed: window.mansionSiege.campaign.completed,
      card: window.mansionSiege.hud().complete,
      attackers: document.getElementById('tallyAttackers')?.textContent?.trim(),
      link: document.getElementById('continueBtn')?.getAttribute('href'),
    }));
    check('Siege completed reload restores its existing card with saved tally',
      card.completed && card.card && card.attackers === '21' && card.link === './enolasquatch.html',
      JSON.stringify(card));
    check('Siege completion restore is UI-only and does not rewrite campaign storage',
      (await storage(page)).campaign === beforeStorage.campaign);
    check('Siege completion restore waits for the player to click Continue',
      await stayedPut(page, initialUrl));
    check('Siege completion reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  {
    const { context, page, errors } = await openSeeded({
      state: STATES.enolaComplete,
      url: '/enolasquatch.html?checkpoint=preflight',
      ready: () => window.__squatch?.enolaSquatch === true,
    });
    const initialUrl = page.url();
    const beforeStorage = await storage(page);
    check('Enola completion card starts hidden on the title screen',
      await page.locator('#br-complete').evaluate((el) => el.classList.contains('hidden')));
    await page.click('#start-btn');
    await page.waitForFunction(() => !document.getElementById('br-complete')?.classList.contains('hidden'), null, { timeout: 120_000 });
    const card = await page.evaluate(() => ({
      completed: window.__enolaSquatch.campaign.completed,
      hidden: document.getElementById('br-complete')?.classList.contains('hidden'),
      rank: document.getElementById('br-rank')?.textContent?.trim(),
      button: document.getElementById('es-again')?.textContent?.trim(),
    }));
    check('Enola completed reload rebuilds the FlightHud card from saved facts',
      card.completed && !card.hidden
        && card.rank === 'Night Ops Professional'
        && card.button === "Return to Lou's mansion",
      JSON.stringify(card));
    check('Enola completion restore is UI-only and does not rewrite campaign storage',
      (await storage(page)).campaign === beforeStorage.campaign);
    check('Enola completion restore waits for the player to click Continue',
      await stayedPut(page, initialUrl));
    check('Enola completion reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  console.log('\nPreview isolation over a completed local campaign');
  {
    const { context, page, errors } = await openSeeded({
      state: STATES.enolaComplete,
      url: '/silvercase.html?preview=1&checkpoint=prayer',
      ready: () => Boolean(window.silvercase?.fsm),
    });
    const initialUrl = page.url();
    const beforeStorage = await storage(page);
    await page.click('#beginBtn');
    await page.waitForFunction(() => window.silvercase?.state().beat === 'SQUATCH_PRAYER', null, { timeout: 120_000 });
    const view = await page.evaluate(() => ({
      preview: window.silvercase.campaign.preview,
      beat: window.silvercase.state().beat,
      completionHidden: document.getElementById('sceneCompleteOverlay')?.classList.contains('hidden'),
    }));
    const afterStorage = await storage(page);
    check('Silver preview plays its requested prayer instead of reading completed local progress',
      view.preview && view.beat === 'SQUATCH_PRAYER' && view.completionHidden, JSON.stringify(view));
    check('Silver preview leaves campaign and final-arc loadout localStorage byte-for-byte unchanged',
      afterStorage.campaign === beforeStorage.campaign && afterStorage.loadout === beforeStorage.loadout);
    check('Silver preview does not navigate on its own', await stayedPut(page, initialUrl));
    check('Silver preview reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  {
    const { context, page, errors } = await openSeeded({
      state: STATES.enolaComplete,
      url: '/mansion.html?preview=1&checkpoint=locked',
      ready: () => Boolean(window.mansion?.mission),
    });
    const initialUrl = page.url();
    const beforeStorage = await storage(page);
    await page.waitForFunction(() => window.mansion?.checkpoints?.jumped === 'locked', null, { timeout: 120_000 });
    const view = await page.evaluate(() => ({
      preview: window.mansion.campaign.preview,
      jumped: window.mansion.checkpoints.jumped,
      saved: window.mansion.campaign.state(),
    }));
    const afterStorage = await storage(page);
    check('Mansion preview replays the requested laboratory beat in isolated memory',
      view.preview && view.jumped === 'locked' && view.saved === null, JSON.stringify(view));
    check('Mansion preview leaves campaign and final-arc loadout localStorage byte-for-byte unchanged',
      afterStorage.campaign === beforeStorage.campaign && afterStorage.loadout === beforeStorage.loadout);
    check('Mansion preview does not navigate on its own', await stayedPut(page, initialUrl));
    check('Mansion preview reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  {
    const { context, page, errors } = await openSeeded({
      state: STATES.enolaComplete,
      url: '/mansion-siege.html?preview=1&checkpoint=briefed',
      ready: () => Boolean(window.mansionSiege?.scene),
    });
    const initialUrl = page.url();
    const beforeStorage = await storage(page);
    await page.click('#startBtn');
    await page.waitForFunction(() => window.mansionSiege?.running && window.mansionSiege?.checkpoint === 'briefed', null, { timeout: 120_000 });
    const view = await page.evaluate(() => ({
      preview: window.mansionSiege.campaign.preview,
      requested: window.mansionSiege.startCheckpoint,
      checkpoint: window.mansionSiege.checkpoint,
      card: window.mansionSiege.hud().complete,
    }));
    const afterStorage = await storage(page);
    check('Siege preview plays its requested briefing instead of the completed local save',
      view.preview && view.requested === 'briefed' && view.checkpoint === 'briefed' && !view.card,
      JSON.stringify(view));
    check('Siege preview leaves campaign and final-arc loadout localStorage byte-for-byte unchanged',
      afterStorage.campaign === beforeStorage.campaign && afterStorage.loadout === beforeStorage.loadout);
    check('Siege preview does not navigate on its own', await stayedPut(page, initialUrl));
    check('Siege preview reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  {
    const { context, page, errors } = await openSeeded({
      state: STATES.enolaComplete,
      url: '/enolasquatch.html?preview=1&checkpoint=bombrun',
      ready: () => window.__squatch?.enolaSquatch === true,
    });
    const initialUrl = page.url();
    const beforeStorage = await storage(page);
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__enolaSquatch?.state().phase === 'bombApproach', null, { timeout: 120_000 });
    const view = await page.evaluate(() => ({
      preview: window.__enolaSquatch.campaign.preview,
      phase: window.__enolaSquatch.state().phase,
      completionHidden: document.getElementById('br-complete')?.classList.contains('hidden'),
    }));
    const afterStorage = await storage(page);
    check('Enola preview plays the requested bomb run instead of the completed local save',
      view.preview && view.phase === 'bombApproach' && view.completionHidden, JSON.stringify(view));
    check('Enola preview leaves campaign and final-arc loadout localStorage byte-for-byte unchanged',
      afterStorage.campaign === beforeStorage.campaign && afterStorage.loadout === beforeStorage.loadout);
    check('Enola preview does not navigate on its own', await stayedPut(page, initialUrl));
    check('Enola preview reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }

  {
    const { context, page, errors } = await openSeeded({
      state: STATES.enolaComplete,
      url: '/cartel-palace.html?preview=1&checkpoint=clear',
      ready: () => Boolean(window.CARTEL_PALACE?.mission),
    });
    const initialUrl = page.url();
    const beforeStorage = await storage(page);
    await page.click('#start-btn');
    await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'active' && window.CARTEL_PALACE?.checkpoint === 'clear', null, { timeout: 120_000 });
    const view = await page.evaluate(() => ({
      checkpoint: window.CARTEL_PALACE.checkpoint,
      beat: window.CARTEL_PALACE.snapshot().beat,
      completionHidden: document.getElementById('ending')?.classList.contains('hidden'),
    }));
    const afterStorage = await storage(page);
    check('Palace preview plays isolated extraction instead of the completed local save',
      view.checkpoint === 'clear' && view.beat === 'clear' && view.completionHidden,
      JSON.stringify(view));
    check('Palace preview leaves campaign and final-arc loadout localStorage byte-for-byte unchanged',
      afterStorage.campaign === beforeStorage.campaign && afterStorage.loadout === beforeStorage.loadout);
    check('Palace preview does not navigate on its own', await stayedPut(page, initialUrl));
    check('Palace preview reload raises no browser errors', errors.length === 0, errors.join(' | '));
    await closeScenario(context);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} final-arc reload checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} final-arc reload checks passed.`);
