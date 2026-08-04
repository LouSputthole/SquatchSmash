#!/usr/bin/env node
/**
 * Verify that locked scenes are playable through developer preview mode while
 * the browser's canonical campaign storage remains byte-for-byte untouched.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5210;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};
const SENTINEL = '{"version":999,"canonical":"preview verifier must not touch this"}';
const EXPECTED_SCENE_LINKS = Object.freeze({
  'bing-one': 'bing.html?preview=1',
  squatchfather: 'squatchfather.html?preview=1',
  beefrun: 'beefrun.html?preview=1',
  'bing-two': 'bing.html?visit=2&preview=1',
  graveyard: 'graveyard.html?preview=1',
  motel: 'motel.html?preview=1',
  'no-wake': 'nowake.html?preview=1',
  silver: 'silver.html?preview=1',
  golf: 'golf.html?preview=1',
  heist: 'heist.html?preview=1&checkpoint=safehouse',
  initiation: 'initiation.html?preview=1',
  /* The three scenes merged on 2026-08-03. They were deployed and playable by
   * direct URL for a day before anybody noticed they were missing from the
   * launcher — this check is an exact match in both directions, so a scene
   * that ships without a card here now fails rather than quietly hiding. */
  silvercase: 'silvercase.html?preview=1',
  mansion: 'mansion.html?preview=1',
  enolasquatch: 'enolasquatch.html?preview=1',
});
const APARTMENT_PREVIEW_CASES = Object.freeze([
  Object.freeze({
    variant: 'day-one-wake', spawn: 'wake', chapter: 'day_one', day: 1,
    timeMinutes: 6 * 60 + 4, mission: 'bada_bing_one', missionStatus: 'locked',
    pendingEvent: 'lou_first_call',
  }),
  Object.freeze({
    variant: 'after-bing-one', spawn: 'front_door', chapter: 'day_one', day: 1,
    timeMinutes: 23 * 60 + 41, mission: 'squatchfather', missionStatus: 'available',
    pendingEvent: 'lou_attaboy_call',
  }),
  Object.freeze({
    variant: 'after-squatchfather', spawn: 'front_door', chapter: 'day_one', day: 2,
    timeMinutes: 3 * 60, mission: 'squatchfather', missionStatus: 'complete',
    pendingEvent: 'lou_attaboy_call',
  }),
  Object.freeze({
    variant: 'day-two-wake', spawn: 'wake', chapter: 'day_two', day: 2,
    timeMinutes: 7 * 60, mission: 'airstrip_smuggling', missionStatus: 'locked',
    pendingEvent: 'booski_day_two_call',
  }),
  Object.freeze({
    variant: 'after-beef-run', spawn: 'front_door', chapter: 'day_two', day: 2,
    timeMinutes: 20 * 60 + 30, mission: 'airstrip_smuggling', missionStatus: 'complete',
    pendingEvent: 'lou_second_call',
  }),
  Object.freeze({
    variant: 'after-motel', spawn: 'front_door', chapter: 'day_two', day: 3,
    timeMinutes: 4 * 60 + 30, mission: 'jerky_motel', missionStatus: 'complete',
    pendingEvent: 'lou_no_wake_call',
  }),
  Object.freeze({
    variant: 'day-three-wake', spawn: 'wake', chapter: 'no_wake', day: 3,
    timeMinutes: 12 * 60, mission: 'no_wake', missionStatus: 'locked',
    pendingEvent: 'lou_no_wake_call',
  }),
  Object.freeze({
    variant: 'after-no-wake', spawn: 'front_door', chapter: 'date', day: 3,
    timeMinutes: 16 * 60 + 40, mission: 'no_wake', missionStatus: 'complete',
    pendingEvent: 'margo_date_call',
  }),
  Object.freeze({
    variant: 'after-silver-room', spawn: 'front_door', chapter: 'date', day: 3,
    timeMinutes: 23 * 60 + 20, mission: 'silver_room', missionStatus: 'complete',
    pendingEvent: 'lou_golf_call',
  }),
  Object.freeze({
    variant: 'day-four-wake', spawn: 'wake', chapter: 'golf_morning', day: 4,
    timeMinutes: 7 * 60, mission: 'silver_pines', missionStatus: 'locked',
    pendingEvent: 'lou_golf_call',
  }),
  Object.freeze({
    variant: 'after-golf', spawn: 'front_door', chapter: 'heist_day', day: 4,
    timeMinutes: 10 * 60 + 30, mission: 'silver_pines', missionStatus: 'complete',
    pendingEvent: 'lou_heist_call',
  }),
]);
const EXPECTED_APARTMENT_RETURN_SOURCES = Object.freeze({
  'after-bing-one': 'bada_bing_one',
  'after-squatchfather': 'squatchfather',
  'after-beef-run': 'airstrip_smuggling',
  'after-motel': 'jerky_motel',
  'after-no-wake': 'no_wake',
  'after-silver-room': 'silver_room',
  'after-golf': 'silver_pines',
});

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify scene previews.');
  process.exit(1);
}

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
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
await page.addInitScript((sentinel) => {
  if (localStorage.getItem('squatchlife.campaign') === null) {
    localStorage.setItem('squatchlife.campaign', sentinel);
  }
}, SENTINEL);

const browserProblems = [];
page.on('pageerror', (error) => browserProblems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') browserProblems.push(message.text().slice(0, 240));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

async function storageSnapshot() {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
}

function unchanged(snapshot) {
  // Preview isolation owns the campaign namespace, not every browser setting
  // another scene may legitimately remember (mute state, read markers, etc.).
  // Comparing the entire origin made one harmless setting written by Bing
  // poison every later save-isolation assertion in this same browser page.
  const campaign = Object.fromEntries(Object.entries(snapshot)
    .filter(([key]) => key.startsWith('squatchlife.campaign')));
  return JSON.stringify(campaign) === JSON.stringify({
    'squatchlife.campaign': SENTINEL,
  });
}

function linksMatchExpected(links, expected) {
  const entries = Object.entries(expected);
  return links.length === entries.length
    && entries.every(([key, href]) => links.some(([actualKey, actualHref]) => (
      actualKey === key && actualHref === href
    )));
}

async function verifyTabPause(label) {
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__scenePause?.isPaused() === true);
  const paused = await page.evaluate(() => ({
    visible: !document.querySelector('[data-scene-pause]')?.classList.contains('hidden'),
    objective: document.querySelector('[data-scene-pause-objective]')?.textContent?.trim() || '',
    instructions: document.querySelectorAll('[data-scene-pause-instructions] li').length,
  }));
  check(`${label}: Tab opens current instructions`,
    paused.visible && paused.objective.length > 0 && paused.instructions >= 4,
    JSON.stringify(paused));
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__scenePause?.isPaused() === false);
  const resumed = await page.evaluate(() =>
    document.querySelector('[data-scene-pause]')?.classList.contains('hidden') === true);
  check(`${label}: Tab returns control`, resumed);
}

try {
  await page.goto(`http://localhost:${PORT}/preview.html`, { waitUntil: 'load' });
  const launcher = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    links: [...document.querySelectorAll('[data-preview-scene]')]
      .map((link) => [link.dataset.previewScene, link.getAttribute('href')]),
    apartments: [...document.querySelectorAll('[data-preview-apartment]')]
      .map((link) => [link.dataset.previewApartment, link.getAttribute('href')]),
  }));
  check('the launcher exposes every authored mission preview',
    launcher.title === 'Scene preview'
      && linksMatchExpected(launcher.links, EXPECTED_SCENE_LINKS),
    JSON.stringify(launcher));
  const expectedApartmentLinks = Object.fromEntries(APARTMENT_PREVIEW_CASES.map(({ variant }) => [
    variant,
    `index.html?preview=1&apartment=${variant}`,
  ]));
  check('the launcher exposes every canonical apartment iteration',
    linksMatchExpected(launcher.apartments, expectedApartmentLinks),
    JSON.stringify(launcher.apartments));
  check('opening the launcher leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  for (const expected of APARTMENT_PREVIEW_CASES) {
    await page.goto(
      `http://localhost:${PORT}/index.html?preview=1&apartment=${expected.variant}`,
      { waitUntil: 'load' },
    );
    await page.waitForFunction(() => window.__squatch?.campaign?.state, null, {
      timeout: 180000,
    });
    const apartment = await page.evaluate(() => {
      const state = window.__squatch.campaign.state;
      return {
        scene: state.scene,
        story: state.story,
        missions: state.missions,
        events: state.events,
        returnSource: window.__squatch.apartmentReturnSource,
        previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
      };
    });
    check(`apartment preview ${expected.variant} boots at its canonical checkpoint`,
      apartment.scene.id === 'apartment'
        && apartment.scene.spawn === expected.spawn
        && apartment.story.chapter === expected.chapter
        && apartment.story.day === expected.day
        && apartment.story.timeMinutes === expected.timeMinutes
        && apartment.missions[expected.mission].status === expected.missionStatus
        && apartment.events[expected.pendingEvent].status === 'pending'
        && apartment.returnSource
          === (EXPECTED_APARTMENT_RETURN_SOURCES[expected.variant] ?? null)
        && apartment.previewNotice,
      JSON.stringify({
        scene: apartment.scene,
        story: apartment.story,
        mission: apartment.missions[expected.mission],
        event: apartment.events[expected.pendingEvent],
        returnSource: apartment.returnSource,
      }));
  }
  check('all apartment previews leave the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/nowake.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NO_WAKE?.story, null, { timeout: 180000 });
  const noWakeBeforeStart = await page.evaluate(() => ({
    mission: window.NO_WAKE.campaignState.missions.no_wake.status,
    scene: window.NO_WAKE.campaignState.scene.id,
  }));
  check('loading NO WAKE preview is read-only until Start',
    noWakeBeforeStart.mission === 'available' && noWakeBeforeStart.scene === 'no_wake',
    JSON.stringify(noWakeBeforeStart));
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.NO_WAKE.campaignState.missions.no_wake.status === 'in_progress');
  const noWake = await page.evaluate(() => ({
    mission: window.NO_WAKE.campaignState.missions.no_wake,
    motel: window.NO_WAKE.campaignState.missions.jerky_motel.status,
    call: window.NO_WAKE.campaignState.events.lou_no_wake_call.status,
    chapter: window.NO_WAKE.campaignState.story.chapter,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('NO WAKE starts with temporary prerequisites and a preview notice',
    noWake.mission.status === 'in_progress'
      && noWake.motel === 'complete'
      && noWake.call === 'answered'
      && noWake.chapter === 'no_wake'
      && noWake.previewNotice,
    JSON.stringify(noWake));
  check('NO WAKE preview leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/beefrun.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__beefrun?.mission, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => document.getElementById('overlay')?.classList.contains('hidden'),
    null, { timeout: 180000 });
  await verifyTabPause('The Beef Run');
  check('playing The Beef Run leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/motel.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: 180000 });
  let motel = await page.evaluate(() => ({
    phase: window.MOTEL.phase,
    mission: window.MOTEL.campaignState.missions.jerky_motel,
    prior: window.MOTEL.campaignState.missions.bada_bing_two,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('the Motel opens unlocked with a visible preview notice',
    motel.phase === 'menu'
      && motel.mission.status === 'available'
      && motel.prior.status === 'complete'
      && motel.previewNotice,
    JSON.stringify(motel));
  /* Dispatched rather than clicked: Playwright's actionability check waits
   * for the page to go quiet, and a scene rendering under a software
   * rasteriser never does. The listener only wants the event. */
  await page.evaluate(() => document.querySelector('#startBtn').click());
  await page.waitForFunction(() => window.MOTEL.phase === 'car');
  motel = await page.evaluate(() => ({
    phase: window.MOTEL.phase,
    status: window.MOTEL.campaignState.missions.jerky_motel.status,
  }));
  check('the Motel preview starts playing', motel.phase === 'car' && motel.status === 'in_progress',
    JSON.stringify(motel));
  await verifyTabPause('The Jerky Motel');
  check('playing the Motel leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/bing.html?visit=2&preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.HOTDOG_INCIDENT?.story && window.HOTDOG_INCIDENT === window.__bing,
    null,
    { timeout: 180000 },
  );
  let bing = await page.evaluate(() => ({
    secondVisit: window.HOTDOG_INCIDENT.isSecondVisit,
    routerAlias: window.HOTDOG_INCIDENT === window.__bing,
    dedicated: !('blackjack' in window.HOTDOG_INCIDENT)
      && !('slots' in window.HOTDOG_INCIDENT),
    castCount: window.HOTDOG_INCIDENT.cast.all.length,
    mission: window.HOTDOG_INCIDENT.campaignState.missions.bada_bing_two,
    airstrip: window.HOTDOG_INCIDENT.campaignState.missions.airstrip_smuggling,
    motel: window.HOTDOG_INCIDENT.campaignState.missions.jerky_motel,
  }));
  check('the router opens the dedicated HotDog party with its prerequisites',
    bing.secondVisit
      && bing.routerAlias
      && bing.dedicated
      && bing.castCount >= 20
      && bing.mission.status === 'available'
      && bing.airstrip.status === 'complete'
      && bing.motel.status === 'locked',
    JSON.stringify(bing));
  /* Dispatched rather than clicked: Playwright's actionability check waits
   * for the page to go quiet, and a scene rendering under a software
   * rasteriser never does. The listener only wants the event. */
  await page.evaluate(() => document.querySelector('#start-btn').click());
  await page.waitForFunction(() => window.HOTDOG_INCIDENT.game.started, null, { timeout: 180000 });
  bing = await page.evaluate(() => ({
    started: window.HOTDOG_INCIDENT.game.started,
    mission: window.HOTDOG_INCIDENT.campaignState.missions.bada_bing_two,
    motel: window.HOTDOG_INCIDENT.campaignState.missions.jerky_motel.status,
  }));
  check('the HotDog party starts at its own durable checkpoint',
    bing.started
      && bing.mission.status === 'in_progress'
      && bing.mission.checkpoint === 'party'
      && bing.motel === 'locked',
    JSON.stringify(bing));
  check('playing Bada Bing Scene Two leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/graveyard.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GRAVEYARD?.story, null, { timeout: 180000 });
  let graveyard = await page.evaluate(() => ({
    scene: window.GRAVEYARD.campaignState.scene.id,
    incident: window.GRAVEYARD.campaignState.missions.bada_bing_two,
    motel: window.GRAVEYARD.campaignState.missions.jerky_motel.status,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('the Squatch Graveyard opens with HotDog loaded and the Motel still locked',
    graveyard.scene === 'squatch_graveyard'
      && graveyard.incident.status === 'in_progress'
      && graveyard.incident.checkpoint === 'body_loaded'
      && graveyard.incident.bodyLoaded
      && graveyard.motel === 'locked'
      && graveyard.previewNotice,
    JSON.stringify(graveyard));
  await page.evaluate(() => document.querySelector('#start-btn').click());
  await page.waitForFunction(
    () => window.GRAVEYARD.campaignState.missions.bada_bing_two.checkpoint === 'graveyard',
    null,
    { timeout: 180000 },
  );
  graveyard = await page.evaluate(() => ({
    checkpoint: window.GRAVEYARD.campaignState.missions.bada_bing_two.checkpoint,
    motel: window.GRAVEYARD.campaignState.missions.jerky_motel.status,
  }));
  check('starting the graveyard claims only the temporary burial checkpoint',
    graveyard.checkpoint === 'graveyard' && graveyard.motel === 'locked',
    JSON.stringify(graveyard));
  check('playing the Squatch Graveyard leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/squatchfather.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.squatchfather?.campaignStory, null, { timeout: 180000 });
  let meeting = await page.evaluate(() => ({
    mission: window.squatchfather.campaign.state.missions.squatchfather,
    hasPackage: window.squatchfather.campaign.hasItem('parcel'),
  }));
  check('Squatchfather opens with Lou’s package and an available meeting',
    meeting.mission.status === 'available' && meeting.hasPackage,
    JSON.stringify(meeting));
  /* Dispatched rather than clicked: Playwright's actionability check waits
   * for the page to go quiet, and a scene rendering under a software
   * rasteriser never does. The listener only wants the event. */
  await page.evaluate(() => document.querySelector('#startBtn').click());
  await page.waitForFunction(
    () => window.squatchfather.state() === 'START_EXTERIOR',
    null,
    { timeout: 180000 },
  );
  meeting = await page.evaluate(() => ({
    state: window.squatchfather.state(),
    mission: window.squatchfather.campaign.state.missions.squatchfather,
  }));
  check('Squatchfather starts playing',
    meeting.state === 'START_EXTERIOR'
      && meeting.mission.status === 'in_progress'
      && meeting.mission.weaponStaged,
    JSON.stringify(meeting));
  check('playing Squatchfather leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/silver.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__silver?.story, null, { timeout: 180000 });
  const silver = await page.evaluate(() => ({
    mission: window.__silver.campaignState.missions.silver_room,
    motel: window.__silver.campaignState.missions.jerky_motel.status,
    call: window.__silver.campaignState.events.margo_date_call.status,
    chapter: window.__silver.campaignState.story.chapter,
    day: window.__silver.campaignState.story.day,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('the Silver Room opens on the date chapter with Margo already rung',
    silver.mission.status === 'available'
      && silver.motel === 'complete'
      && silver.call === 'answered'
      && silver.chapter === 'date'
      && silver.day === 3
      && silver.previewNotice,
    JSON.stringify(silver));
  check('opening the Silver Room leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/golf.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__golfReady && window.__golf?.campaign, null, {
    timeout: 180000,
  });
  const golf = await page.evaluate(() => {
    const state = window.__golf.campaign.state;
    return {
      mission: state.missions.silver_pines,
      silver: state.missions.silver_room.status,
      call: state.events.lou_golf_call.status,
      chapter: state.story.chapter,
      day: state.story.day,
      previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
    };
  });
  check('Silver Pines opens after the date with Lou already rung',
    golf.mission.status === 'available'
      && golf.silver === 'complete'
      && golf.call === 'answered'
      && golf.chapter === 'golf_morning'
      && golf.day === 4
      && golf.previewNotice,
    JSON.stringify(golf));
  check('opening Silver Pines leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(
    `http://localhost:${PORT}/heist.html?preview=1&checkpoint=safehouse`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 180000 });
  const heistOpening = await page.evaluate(() => ({
    preview: window.__heistDebug.preview,
    difficulty: window.__heistDebug.difficulty,
    crewHuman: window.__heistDebug.crewHuman,
    notice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('THE TAKE preview opens safely with the canonical human crew',
    heistOpening.preview && heistOpening.difficulty === 'professional'
      && heistOpening.crewHuman && heistOpening.notice,
    JSON.stringify(heistOpening));
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(() => window.__heistDebug.state === 'CREW_INTRO', null, {
    timeout: 180000,
  });
  const heistStarted = await page.evaluate(() => ({
    state: window.__heistDebug.state,
    slots: document.getElementById('hotbar')?.children.length ?? 0,
    visible: !document.getElementById('hotbar')?.classList.contains('hidden'),
  }));
  check('THE TAKE starts with the shared visible five-slot inventory',
    heistStarted.state === 'CREW_INTRO'
      && heistStarted.slots === 5 && heistStarted.visible,
    JSON.stringify(heistStarted));
  check('opening THE TAKE leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/initiation.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.INITIATION?.player, null, { timeout: 180000 });
  const initiation = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('the current Initiation build boots directly in preview mode',
    typeof initiation.phase === 'string' && initiation.previewNotice,
    JSON.stringify(initiation));
  check('opening Initiation leaves the canonical save untouched',
    unchanged(await storageSnapshot()));
  check('no runtime console errors occurred',
    browserProblems.length === 0, browserProblems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} preview checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} preview checks passed.`);
