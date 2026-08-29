#!/usr/bin/env node
/**
 * Real-browser proof for the campaign bridge from the Jerky Motel to Front &
 * Center.
 *
 * Canonical order:
 *
 *   Motel -> starter Apartment -> THE TAKE -> starter Apartment/new-space call
 *     -> Silver Pines -> Luxury Apartment/get ready -> Front & Center
 *
 * This used to verify a retired route that brought Margo into the starter
 * apartment, played Front & Center before Silver Pines, returned to the old
 * flat again, and only then opened THE TAKE. Keep this gate deliberately
 * narrow: campaign state crosses real documents in localStorage, each mission
 * starts through its production story contract, and supported scene skips
 * stand in only for the hours of mission play between route seams. Margo's
 * stayover belongs to the later Luxury Apartment visit and is verified there.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import {
  CAMPAIGN_STORAGE_KEY,
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
} from '../src/core/campaign.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 5213;
const ORIGIN = `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = Number(process.env.BIG_NIGHT_READY_TIMEOUT_MS) || 180_000;
const NAVIGATION_TIMEOUT_MS = Number(process.env.BIG_NIGHT_NAVIGATION_TIMEOUT_MS) || 45_000;
const TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
});

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the big-night route.');
  process.exit(1);
}

function fileForRequest(url) {
  const requested = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, requested);
  const relative = path.relative(ROOT, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return file;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  /* A neutral same-origin page lets the verifier ask the production preview
   * seed for `return_to_old_apartment` without booting an unrelated WebGL
   * apartment. The first rendered scene below is the Motel itself. */
  if (url.pathname === '/__big-night-seed.html') {
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    });
    res.end('<!doctype html><meta charset="utf-8"><title>Big Night route seed</title>');
    return;
  }

  const file = fileForRequest(url);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'cache-control': 'no-store' }).end('not found');
    return;
  }
  res.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
  });
  res.end(await fsp.readFile(file));
});

await new Promise((resolve) => server.listen(PORT, HOST, resolve));

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
const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
const page = await context.newPage();

const results = [];
const runtimeErrors = [];
const visited = [];
let fatal = null;

page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`console: ${message.text().slice(0, 400)}`);
});
page.on('framenavigated', (frame) => {
  if (frame !== page.mainFrame()) return;
  try {
    visited.push(new URL(frame.url()).pathname);
  } catch {
    // about:blank before the first request is not a campaign landing.
  }
});

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function occurrences(list, value) {
  return Array.isArray(list) ? list.filter((entry) => entry === value).length : 0;
}

function navigationContextLoss(error) {
  return /Execution context was destroyed|Cannot find context with specified id|Target page, context or browser has been closed/i
    .test(error?.message ?? '');
}

async function navigateFromPage(pathname, action) {
  const navigation = page.waitForURL(
    (url) => url.pathname.endsWith(pathname),
    { timeout: NAVIGATION_TIMEOUT_MS },
  );
  const actionResult = page.evaluate(action).catch((error) => {
    if (navigationContextLoss(error)) return null;
    throw error;
  });
  const [, receipt] = await Promise.all([navigation, actionResult]);
  await page.waitForLoadState('load', { timeout: READY_TIMEOUT_MS });
  return receipt;
}

async function campaignSnapshot() {
  return page.evaluate(async () => {
    const { createCampaign } = await import('/src/core/campaign.js');
    const state = createCampaign().state;
    return {
      scene: state.scene,
      story: {
        chapter: state.story.chapter,
        day: state.story.day,
        timeMinutes: state.story.timeMinutes,
        timeEvents: state.story.timeEvents,
      },
      events: Object.fromEntries(Object.entries(state.events).map(([id, value]) => [id, value.status])),
      missions: state.missions,
      statistics: state.statistics,
    };
  });
}

const startedAt = performance.now();

try {
  /* Build the exact post-Motel hub seed through the production preview helper,
   * then rewind only the Motel boundary so the verifier can cross it itself.
   * This retains the cabin appointment and every current Act-One prerequisite;
   * a hand-authored old-schema fixture is exactly how the former gate drifted. */
  await page.goto(`${ORIGIN}/__big-night-seed.html?preview=1&beat=return_to_old_apartment`, {
    waitUntil: 'load',
  });
  const seed = await page.evaluate(async ({ key, completeMotel }) => {
    const { createCampaign } = await import('/src/core/campaign.js');
    const campaign = createCampaign();
    const state = campaign.state;
    const preview = window.__squatchLifePreviewRuntime;
    const receipt = {
      beatId: preview?.beatId ?? null,
      scene: state.scene,
      chapter: state.story.chapter,
      day: state.story.day,
      timeMinutes: state.story.timeMinutes,
      motel: state.missions.jerky_motel.status,
      margoDate: state.events.margo_date_call.status,
      completeMotelCount: state.story.timeEvents.filter((id) => id === completeMotel).length,
    };

    state.scene = { id: 'jerky_motel', spawn: 'passenger_seat' };
    state.story.chapter = 'day_two';
    state.story.day = 5;
    state.story.timeMinutes = 90;
    state.story.timeEvents = state.story.timeEvents.filter((id) => id !== completeMotel);
    Object.assign(state.missions.jerky_motel, {
      status: 'available',
      ending: null,
      cargoRecovered: false,
      packagesIntact: 0,
      freshness: 0,
      policeHeat: 0,
    });
    if (Array.isArray(state.statistics?.completedMissionIds)) {
      state.statistics.completedMissionIds = state.statistics.completedMissionIds
        .filter((id) => id !== 'jerky_motel');
      state.statistics.missionsCompleted = state.statistics.completedMissionIds.length;
    }
    state.revision += 1;
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(state));
    return receipt;
  }, {
    key: CAMPAIGN_STORAGE_KEY,
    completeMotel: TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL,
  });
  check('the verifier seed comes from the current post-Motel campaign bridge',
    seed.beatId === 'return_to_old_apartment'
      && seed.scene.id === SCENE_IDS.APARTMENT
      && seed.chapter === 'day_two'
      && seed.day === 5
      && seed.timeMinutes === 6 * 60 + 30
      && seed.motel === 'complete'
      && seed.margoDate === 'answered'
      && seed.completeMotelCount === 1,
    JSON.stringify(seed));

  visited.length = 0;
  await page.goto(`${ORIGIN}/motel.html`, { waitUntil: 'load', timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: READY_TIMEOUT_MS });

  const motelEntry = await campaignSnapshot();
  check('the real Motel page resumes the canonical Day 5 route seam',
    motelEntry.scene.id === SCENE_IDS.JERKY_MOTEL
      && motelEntry.scene.spawn === 'passenger_seat'
      && motelEntry.story.chapter === 'day_two'
      && motelEntry.story.day === 5
      && motelEntry.story.timeMinutes === 90
      && motelEntry.missions[MISSION_IDS.JERKY_MOTEL].status === 'available'
      && occurrences(motelEntry.story.timeEvents, TIME_EVENT_IDS.DEPART_JERKY_MOTEL) === 1
      && occurrences(motelEntry.story.timeEvents, TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL) === 0,
    JSON.stringify({
      scene: motelEntry.scene,
      chapter: motelEntry.story.chapter,
      clock: [motelEntry.story.day, motelEntry.story.timeMinutes],
      motel: motelEntry.missions[MISSION_IDS.JERKY_MOTEL].status,
    }));

  await navigateFromPage('/index.html', async () => {
    const game = window.MOTEL;
    const begun = game.story.begin();
    if (begun?.ok !== true) throw new Error(`Motel begin failed: ${JSON.stringify(begun)}`);
    const { createCampaignSceneSkipAdapter } = await import('/src/core/campaign-scene-skip.js');
    const skip = createCampaignSceneSkipAdapter({
      campaign: game.campaign,
      sceneId: 'jerky_motel',
      location,
    });
    const result = skip?.();
    if (result?.ok !== true || result.to !== 'apartment') {
      throw new Error(`Motel skip failed: ${JSON.stringify(result)}`);
    }
    return { begun, result };
  });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, {
    timeout: READY_TIMEOUT_MS,
  });

  const motelHome = await campaignSnapshot();
  const firstStarterMargo = await page.evaluate(() => ({
    active: Boolean(window.__squatch.game.margoScene),
    visible: window.__squatch.apartment.margo.group.visible,
    comeHomeOwed: window.__squatch.apartmentStory.margoComeHomeOwed(),
    wakeOwed: window.__squatch.apartmentStory.margoWakeOwed(),
  }));
  check('Motel returns to the regular apartment at Day 5, 6:30 AM',
    motelHome.scene.id === SCENE_IDS.APARTMENT
      && motelHome.scene.spawn === 'front_door'
      && motelHome.story.chapter === 'day_two'
      && motelHome.story.day === 5
      && motelHome.story.timeMinutes === 6 * 60 + 30
      && motelHome.missions[MISSION_IDS.JERKY_MOTEL].status === 'complete'
      && occurrences(motelHome.story.timeEvents, TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL) === 1,
    JSON.stringify({
      scene: motelHome.scene,
      chapter: motelHome.story.chapter,
      clock: [motelHome.story.day, motelHome.story.timeMinutes],
      motel: motelHome.missions[MISSION_IDS.JERKY_MOTEL].status,
    }));
  check('the starter apartment does not restage Margo after the Motel',
    firstStarterMargo.active === false
      && firstStarterMargo.visible === false
      && firstStarterMargo.comeHomeOwed === false
      && firstStarterMargo.wakeOwed === false,
    JSON.stringify(firstStarterMargo));

  const heistGate = await page.evaluate(async () => {
    const game = window.__squatch;
    const apartment = await import('/src/core/apartment-story.js');
    const slept = game.apartmentStory.sleep();
    const callGate = game.apartmentStory.tryLeave(game.activityContext());
    const answered = game.apartmentStory.callAnswered(apartment.DAY_FOUR_LOU_HEIST_CALL);
    const pastimeGate = game.apartmentStory.tryLeave(game.activityContext());
    const pastimeEvent = apartment.pastimeActivityEvents().playedCounterSquatch;
    const pastime = game.campaign.advanceTime(pastimeEvent, (state) => {
      state.activities.playedCounterSquatch = true;
    });
    const kitGate = game.apartmentStory.tryLeave(game.activityContext());
    const prepared = apartment.HEIST_PREPARATION_ITEMS.map((item) => ({
      id: item.id,
      changed: game.apartmentStory.collectHeistPreparation(item.id),
    }));
    const door = game.apartmentStory.tryLeave(game.activityContext());
    const state = game.campaign.state;
    return {
      slept,
      callGate,
      answered,
      pastimeGate,
      pastimeApplied: pastime.applied,
      kitGate,
      prepared,
      door,
      clock: [state.story.day, state.story.timeMinutes],
      heist: state.missions.bank_heist.status,
      call: state.events.lou_heist_call.status,
    };
  });
  check('the Day 5 apartment gates THE TAKE through sleep, Lou, pastime, and kit',
    heistGate.slept?.ok === true
      && heistGate.slept.day === 5
      && heistGate.slept.timeMinutes === 12 * 60
      && heistGate.callGate?.kind === 'call'
      && heistGate.callGate.id === EVENT_IDS.LOU_HEIST_CALL
      && heistGate.answered === true
      && heistGate.pastimeGate?.id === 'playedCounterSquatch'
      && heistGate.pastimeApplied === true
      && heistGate.kitGate?.kind === 'activity'
      && heistGate.prepared.every((item) => item.changed)
      && heistGate.door?.kind === 'go'
      && heistGate.door.destination === SCENE_IDS.BANK_HEIST
      && heistGate.clock[0] === 5
      && heistGate.clock[1] === 12 * 60 + 28
      && heistGate.heist === 'available'
      && heistGate.call === 'answered',
    JSON.stringify(heistGate));

  await navigateFromPage('/heist.html', () => window.__squatch.tryLeave());
  await page.waitForFunction(() => window.__heistDebug, null, { timeout: READY_TIMEOUT_MS });
  const heistEntry = await campaignSnapshot();
  check('the regular-apartment door lands in THE TAKE at Day 5, 12:45 PM',
    heistEntry.scene.id === SCENE_IDS.BANK_HEIST
      && heistEntry.scene.spawn === 'safehouse'
      && heistEntry.story.day === 5
      && heistEntry.story.timeMinutes === 12 * 60 + 45
      && heistEntry.missions[MISSION_IDS.BANK_HEIST].status === 'in_progress'
      && occurrences(heistEntry.story.timeEvents, TIME_EVENT_IDS.DEPART_BANK_HEIST) === 1,
    JSON.stringify({
      scene: heistEntry.scene,
      clock: [heistEntry.story.day, heistEntry.story.timeMinutes],
      heist: heistEntry.missions[MISSION_IDS.BANK_HEIST].status,
    }));

  await navigateFromPage('/index.html', async () => {
    const { createCampaign, SCENE_IDS: scenes } = await import('/src/core/campaign.js');
    const { createBankHeistStory } = await import('/src/core/bank-heist-story.js');
    const { createCampaignSceneSkipAdapter } = await import('/src/core/campaign-scene-skip.js');
    const campaign = createCampaign();
    const begun = createBankHeistStory({ campaign }).begin();
    if (begun?.ok !== true || begun.resumed !== true) {
      throw new Error(`THE TAKE begin failed: ${JSON.stringify(begun)}`);
    }
    const result = createCampaignSceneSkipAdapter({
      campaign,
      sceneId: scenes.BANK_HEIST,
      location,
    })?.();
    if (result?.ok !== true || result.to !== scenes.APARTMENT) {
      throw new Error(`THE TAKE skip failed: ${JSON.stringify(result)}`);
    }
    return { begun, result };
  });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, {
    timeout: READY_TIMEOUT_MS,
  });

  const heistHome = await campaignSnapshot();
  const secondStarterMargo = await page.evaluate(() => ({
    active: Boolean(window.__squatch.game.margoScene),
    visible: window.__squatch.apartment.margo.group.visible,
    comeHomeOwed: window.__squatch.apartmentStory.margoComeHomeOwed(),
    wakeOwed: window.__squatch.apartmentStory.margoWakeOwed(),
  }));
  check('THE TAKE returns to the regular apartment at Day 5, 6:50 PM',
    heistHome.scene.id === SCENE_IDS.APARTMENT
      && heistHome.scene.spawn === 'front_door'
      && heistHome.story.chapter === 'post_heist'
      && heistHome.story.day === 5
      && heistHome.story.timeMinutes === 18 * 60 + 50
      && heistHome.missions[MISSION_IDS.BANK_HEIST].status === 'complete'
      && heistHome.missions[MISSION_IDS.BANK_HEIST].checkpoint === 'vehicle_swap'
      && heistHome.missions[MISSION_IDS.SILVER_CASE].status === 'available'
      && occurrences(heistHome.story.timeEvents, TIME_EVENT_IDS.COMPLETE_BANK_HEIST) === 1,
    JSON.stringify({
      scene: heistHome.scene,
      chapter: heistHome.story.chapter,
      clock: [heistHome.story.day, heistHome.story.timeMinutes],
      heist: heistHome.missions[MISSION_IDS.BANK_HEIST].status,
    }));
  check('the post-heist starter apartment still does not stage Margo',
    secondStarterMargo.active === false
      && secondStarterMargo.visible === false
      && secondStarterMargo.comeHomeOwed === false
      && secondStarterMargo.wakeOwed === false,
    JSON.stringify(secondStarterMargo));

  const newSpaceGate = await page.evaluate(async () => {
    const game = window.__squatch;
    const apartment = await import('/src/core/apartment-story.js');
    const cleanup = apartment.HEIST_CLEANUP_ITEMS.map((item) => ({
      id: item.id,
      changed: game.apartmentStory.completeHeistCleanup(item.id),
    }));
    const callGate = game.apartmentStory.tryLeave(game.activityContext());
    const answered = game.apartmentStory.callAnswered(apartment.NEW_SPACE_LOU_CALL);
    const bedGate = game.apartmentStory.tryLeave(game.activityContext());
    const callClock = [game.campaign.state.story.day, game.campaign.state.story.timeMinutes];
    const slept = game.apartmentStory.sleep();
    const pastimeGate = game.apartmentStory.tryLeave(game.activityContext());
    const pastimeEvent = apartment.pastimeActivityEvents().playedSquatchShoot;
    const pastime = game.campaign.advanceTime(pastimeEvent, (state) => {
      state.activities.playedSquatchShoot = true;
    });
    const door = game.apartmentStory.tryLeave(game.activityContext());
    const state = game.campaign.state;
    return {
      cleanup,
      callGate,
      answered,
      bedGate,
      callClock,
      slept,
      pastimeGate,
      pastimeApplied: pastime.applied,
      door,
      clock: [state.story.day, state.story.timeMinutes],
      call: state.events.lou_golf_call.status,
      golf: state.missions.silver_pines.status,
    };
  });
  check('the new-space call is a post-heist gate before the Silver Pines morning',
    newSpaceGate.cleanup.every((item) => item.changed)
      && newSpaceGate.callGate?.kind === 'call'
      && newSpaceGate.callGate.id === EVENT_IDS.LOU_GOLF_CALL
      && newSpaceGate.answered === true
      && newSpaceGate.callClock[0] === 5
      && newSpaceGate.callClock[1] === 18 * 60 + 53
      && newSpaceGate.bedGate?.kind === 'stay'
      && newSpaceGate.slept?.ok === true
      && newSpaceGate.slept.day === 6
      && newSpaceGate.slept.timeMinutes === 7 * 60
      && newSpaceGate.pastimeGate?.id === 'playedSquatchShoot'
      && newSpaceGate.pastimeApplied === true
      && newSpaceGate.door?.kind === 'go'
      && newSpaceGate.door.destination === SCENE_IDS.SILVER_PINES
      && newSpaceGate.clock[0] === 6
      && newSpaceGate.clock[1] === 7 * 60 + 15
      && newSpaceGate.call === 'answered'
      && newSpaceGate.golf === 'available',
    JSON.stringify(newSpaceGate));

  await navigateFromPage('/golf.html', () => window.__squatch.tryLeave());
  await page.waitForFunction(() => window.__golfReady === true && window.__golf?.story, null, {
    timeout: READY_TIMEOUT_MS,
  });
  const golfEntry = await campaignSnapshot();
  check('the final starter-apartment exit lands at Silver Pines on Day 6, 7:30 AM',
    golfEntry.scene.id === SCENE_IDS.SILVER_PINES
      && golfEntry.scene.spawn === 'car_park'
      && golfEntry.story.chapter === 'golf_morning'
      && golfEntry.story.day === 6
      && golfEntry.story.timeMinutes === 7 * 60 + 30
      && golfEntry.missions[MISSION_IDS.SILVER_PINES].status === 'available'
      && occurrences(golfEntry.story.timeEvents, TIME_EVENT_IDS.DEPART_SILVER_PINES) === 1,
    JSON.stringify({
      scene: golfEntry.scene,
      chapter: golfEntry.story.chapter,
      clock: [golfEntry.story.day, golfEntry.story.timeMinutes],
      golf: golfEntry.missions[MISSION_IDS.SILVER_PINES].status,
    }));

  await navigateFromPage('/luxury-apartment.html', async () => {
    const game = window.__golf;
    const begun = game.story.begin();
    if (begun?.ok !== true) throw new Error(`Silver Pines begin failed: ${JSON.stringify(begun)}`);
    const { createCampaignSceneSkipAdapter } = await import('/src/core/campaign-scene-skip.js');
    const result = createCampaignSceneSkipAdapter({
      campaign: game.campaign,
      sceneId: 'silver_pines',
      location,
    })?.();
    if (result?.ok !== true || result.to !== 'luxury_apartment') {
      throw new Error(`Silver Pines skip failed: ${JSON.stringify(result)}`);
    }
    return { begun, result };
  });
  await page.waitForFunction(() => window.LUXURY_APARTMENT?.debug?.margo, null, {
    timeout: READY_TIMEOUT_MS,
  });

  const luxuryEntry = await campaignSnapshot();
  const luxuryPresentation = await page.evaluate(async () => {
    const { createCampaign } = await import('/src/core/campaign.js');
    const { createLuxuryApartmentStory } = await import('/src/core/luxury-apartment-story.js');
    const campaign = createCampaign();
    const story = createLuxuryApartmentStory({ campaign });
    return {
      phase: story.phase(),
      door: story.tryLeave(),
      pendingCall: story.pendingCall()?.eventId ?? null,
      margo: window.LUXURY_APARTMENT.debug.margo.report(),
      ready: window.LUXURY_APARTMENT.readyTally.snapshot(),
    };
  });
  check('Silver Pines hands the player to the Luxury Apartment at Day 6, 11:45 AM',
    luxuryEntry.scene.id === SCENE_IDS.LUXURY_APARTMENT
      && luxuryEntry.scene.spawn === 'arrival'
      && luxuryEntry.story.chapter === 'luxury_apartment'
      && luxuryEntry.story.day === 6
      && luxuryEntry.story.timeMinutes === 11 * 60 + 45
      && luxuryEntry.missions[MISSION_IDS.SILVER_PINES].status === 'complete'
      && luxuryEntry.missions[MISSION_IDS.SILVER_PINES].holesPlayed >= 3
      && occurrences(luxuryEntry.story.timeEvents, TIME_EVENT_IDS.COMPLETE_SILVER_PINES) === 1
      && occurrences(luxuryEntry.story.timeEvents, TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT) === 1,
    JSON.stringify({
      scene: luxuryEntry.scene,
      chapter: luxuryEntry.story.chapter,
      clock: [luxuryEntry.story.day, luxuryEntry.story.timeMinutes],
      holes: luxuryEntry.missions[MISSION_IDS.SILVER_PINES].holesPlayed,
    }));
  check('the first Luxury visit is get-ready, not the later Margo stayover',
    luxuryPresentation.phase === 'get_ready'
      && luxuryPresentation.door?.kind === 'activity'
      && luxuryPresentation.door.id === TIME_EVENT_IDS.LUXURY_GET_READY
      && luxuryPresentation.pendingCall === null
      && luxuryPresentation.margo.visible === false
      && luxuryPresentation.margo.kind === null
      && luxuryPresentation.ready.ready === false,
    JSON.stringify(luxuryPresentation));

  const luxuryReady = await page.evaluate(async () => {
    const game = window.LUXURY_APARTMENT;
    const before = game.readyTally.snapshot();
    const changed = ['showered', 'dressed', 'phoneTaken'].map((id) => ({
      id,
      changed: game.actions.ready(id),
    }));
    const { createCampaign, TIME_EVENT_IDS: timeEvents } = await import('/src/core/campaign.js');
    const { createLuxuryApartmentStory } = await import('/src/core/luxury-apartment-story.js');
    const campaign = createCampaign();
    const story = createLuxuryApartmentStory({ campaign });
    const state = campaign.state;
    return {
      before,
      changed,
      tally: game.readyTally.snapshot(),
      phase: story.phase(),
      door: story.tryLeave(),
      pendingCall: story.pendingCall()?.eventId ?? null,
      clock: [state.story.day, state.story.timeMinutes],
      silver: state.missions.silver_room.status,
      dateCall: state.events.margo_date_call.status,
      retiredDateClock: state.story.timeEvents.includes(timeEvents.MARGO_DATE_CALL),
    };
  });
  check('the Luxury get-ready tally unlocks Front & Center without a duplicate Margo call',
    luxuryReady.changed.every((item) => item.changed || luxuryReady.before.facts[item.id] === true)
      && luxuryReady.tally.ready === true
      && luxuryReady.phase === 'date'
      && luxuryReady.door?.kind === 'go'
      && luxuryReady.door.destination === SCENE_IDS.SILVER_ROOM
      && luxuryReady.pendingCall === null
      && luxuryReady.clock[0] === 6
      && luxuryReady.clock[1] === 12 * 60 + 30
      && luxuryReady.silver === 'available'
      && luxuryReady.dateCall === 'answered'
      && luxuryReady.retiredDateClock === false,
    JSON.stringify(luxuryReady));

  await navigateFromPage('/silver.html', async () => {
    const campaignModule = await import('/src/core/campaign.js');
    const { createLuxuryApartmentStory } = await import('/src/core/luxury-apartment-story.js');
    const campaign = campaignModule.createCampaign();
    const story = createLuxuryApartmentStory({ campaign });
    const door = story.tryLeave();
    if (door?.kind !== 'go' || door.destination !== campaignModule.SCENE_IDS.SILVER_ROOM) {
      throw new Error(`Luxury departure refused: ${JSON.stringify(door)}`);
    }
    campaign.advanceTime(campaignModule.TIME_EVENT_IDS.DEPART_SILVER_ROOM);
    return campaignModule.navigateCampaign(campaign, campaignModule.SCENE_IDS.SILVER_ROOM, {
      spawn: 'kerb',
      location,
    });
  });
  await page.waitForFunction(() => window.__silver?.story, null, { timeout: READY_TIMEOUT_MS });

  const silverBegin = await page.evaluate(() => window.__silver.story.begin());
  const silverEntry = await campaignSnapshot();
  check('Front & Center accepts the real Day 6, 7:30 PM landing',
    silverBegin?.ok === true
      && silverBegin.resumed === false
      && silverEntry.scene.id === SCENE_IDS.SILVER_ROOM
      && silverEntry.scene.spawn === 'kerb'
      && silverEntry.story.day === 6
      && silverEntry.story.timeMinutes === 19 * 60 + 30
      && silverEntry.missions[MISSION_IDS.BANK_HEIST].status === 'complete'
      && silverEntry.missions[MISSION_IDS.SILVER_PINES].status === 'complete'
      && silverEntry.missions[MISSION_IDS.SILVER_ROOM].status === 'in_progress'
      && silverEntry.events[EVENT_IDS.MARGO_DATE_CALL] === 'answered'
      && occurrences(silverEntry.story.timeEvents, TIME_EVENT_IDS.DEPART_SILVER_ROOM) === 1
      && occurrences(silverEntry.story.timeEvents, TIME_EVENT_IDS.COMPLETE_SILVER_ROOM) === 0,
    JSON.stringify({
      begun: silverBegin,
      scene: silverEntry.scene,
      clock: [silverEntry.story.day, silverEntry.story.timeMinutes],
      silver: silverEntry.missions[MISSION_IDS.SILVER_ROOM].status,
    }));

  const expectedRoute = [
    '/motel.html',
    '/index.html',
    '/heist.html',
    '/index.html',
    '/golf.html',
    '/luxury-apartment.html',
    '/silver.html',
  ];
  const campaignVisits = visited.filter((pathname) => expectedRoute.includes(pathname));
  check('the browser followed the canonical bridge with no retired apartment return',
    JSON.stringify(campaignVisits) === JSON.stringify(expectedRoute),
    JSON.stringify(campaignVisits));

  const exactOnce = [
    TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL,
    TIME_EVENT_IDS.LOU_HEIST_CALL,
    TIME_EVENT_IDS.PLAY_COUNTER_SQUATCH,
    TIME_EVENT_IDS.DEPART_BANK_HEIST,
    TIME_EVENT_IDS.COMPLETE_BANK_HEIST,
    TIME_EVENT_IDS.LOU_GOLF_CALL,
    TIME_EVENT_IDS.PLAY_SQUATCH_SHOOT,
    TIME_EVENT_IDS.DEPART_SILVER_PINES,
    TIME_EVENT_IDS.COMPLETE_SILVER_PINES,
    TIME_EVENT_IDS.ARRIVE_LUXURY_APARTMENT,
    TIME_EVENT_IDS.LUXURY_GET_READY,
    TIME_EVENT_IDS.DEPART_SILVER_ROOM,
  ].map((id) => ({ id, count: occurrences(silverEntry.story.timeEvents, id) }));
  check('every clock seam in this bridge is recorded exactly once',
    exactOnce.every(({ count }) => count === 1),
    JSON.stringify(exactOnce));
  check('no runtime console or page errors occurred',
    runtimeErrors.length === 0,
    runtimeErrors.join(' | '));
} catch (error) {
  fatal = error;
  console.error(`  FATAL  ${error.stack || error.message || String(error)}`);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}

const durationSeconds = (performance.now() - startedAt) / 1000;
const failed = results.filter((result) => !result.ok);
if (fatal || failed.length) {
  const receipt = {
    checks: results.length,
    passed: results.length - failed.length,
    failed: failed.map((result) => result.name),
    fatal: fatal?.message ?? null,
    durationSeconds: Number(durationSeconds.toFixed(3)),
  };
  console.error(`\nBig-night route verification failed: ${JSON.stringify(receipt)}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} big-night route checks passed in ${durationSeconds.toFixed(3)}s.`);
