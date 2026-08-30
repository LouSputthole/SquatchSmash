#!/usr/bin/env node
/**
 * Ride the CURRENT Silver Pines -> Front & Center campaign seam in a browser.
 *
 * The date is scheduled once, from the Act-One cabin. After THE TAKE, Lou's
 * new-space call sends Tony to Silver Pines; the completed round hands him the
 * apartment keys; the new address owns the three get-ready chores; and its
 * elevator goes directly to Front & Center. There is no later Margo telephone
 * call in either apartment.
 *
 * `verify:golf`, `verify:luxury-apartment-browser`, and `verify:silver` own the
 * long play inside each scene. This verifier owns the durable joins between
 * them, including a reload-sized navigation at every boundary.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5214;
const BASE = `http://localhost:${PORT}`;
const EVIDENCE = path.join(ROOT, 'artifacts', 'silver-story-route');
const LOAD_WAIT = 120000;
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
  console.error('playwright is not installed; cannot verify the Silver Room story.');
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
await fsp.mkdir(EVIDENCE, { recursive: true });

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
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.setDefaultTimeout(LOAD_WAIT);

const problems = [];
page.on('pageerror', (error) => problems.push(`page: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 240)}`);
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

try {
  /* ------------------------------------------------------------------ *
   * 0. Seed a canonical CURRENT save at the evening after THE TAKE.
   *
   * Build it through createCampaign() rather than copying a save schema into
   * the verifier. The old verifier carried a v3 object long after the game was
   * on v24, which let migration behaviour obscure the route it meant to test.
   * ------------------------------------------------------------------ */
  await page.goto(`${BASE}/preview.html`, { waitUntil: 'load' });
  const seeded = await page.evaluate(async () => {
    localStorage.clear();
    const {
      EVENT_IDS, ITEM_IDS, MISSION_IDS, SCENE_IDS, TIME_EVENT_IDS, createCampaign,
    } = await import('./src/core/campaign.js');
    const campaign = createCampaign();
    campaign.update((state) => {
      state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
      state.story.chapter = 'post_heist';
      state.story.day = 5;
      state.story.timeMinutes = 18 * 60 + 50;
      for (const eventId of [
        TIME_EVENT_IDS.CABIN_MARGO_READY,
        TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL,
        TIME_EVENT_IDS.LOU_HEIST_CALL,
        TIME_EVENT_IDS.DEPART_BANK_HEIST,
        TIME_EVENT_IDS.COMPLETE_BANK_HEIST,
      ]) {
        if (!state.story.timeEvents.includes(eventId)) state.story.timeEvents.push(eventId);
      }

      state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
      const heist = state.missions[MISSION_IDS.BANK_HEIST];
      heist.status = 'complete';
      heist.checkpoint = 'vehicle_swap';
      heist.briefingComplete = true;
      heist.preparationComplete = true;
      Object.assign(heist.cleanup, {
        washed: true,
        changed: true,
        gearSecured: true,
        finalCalls: true,
      });
      state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
      state.missions[MISSION_IDS.SILVER_PINES].status = 'locked';
      state.missions[MISSION_IDS.SILVER_ROOM].status = 'locked';

      state.events[EVENT_IDS.CABIN_MARGO_CALL].status = 'answered';
      /* Legacy event key, current meaning: the appointment exists. */
      state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
      state.events[EVENT_IDS.LOU_HEIST_CALL].status = 'answered';
      state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'pending';
      if (!state.inventory.carried.includes(ITEM_IDS.PHONE)) {
        state.inventory.carried.push(ITEM_IDS.PHONE);
      }
    });
    return {
      version: campaign.state.version,
      scene: campaign.state.scene,
      story: campaign.state.story,
      cabinCall: campaign.state.events[EVENT_IDS.CABIN_MARGO_CALL].status,
      appointment: campaign.state.events[EVENT_IDS.MARGO_DATE_CALL].status,
      retiredCallSpent: campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.MARGO_DATE_CALL),
      cabinCallSpent: campaign.state.story.timeEvents
        .includes(TIME_EVENT_IDS.CABIN_LAY_LOW_MARGO_CALL),
    };
  });
  check('the fixture is a current-schema save whose date was scheduled in the cabin',
    seeded.version >= 24
      && seeded.scene.id === 'apartment'
      && seeded.story.chapter === 'post_heist'
      && seeded.cabinCall === 'answered'
      && seeded.appointment === 'answered'
      && seeded.cabinCallSpent
      && !seeded.retiredCallSpent,
    JSON.stringify(seeded));

  /* ------------------------------------------------------------------ *
   * 1. The starter flat has Lou's new-space call, never Margo's date call.
   * ------------------------------------------------------------------ */
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory);
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  const starter = await page.evaluate(() => {
    const game = window.__squatch;
    const pending = game.apartmentStory.pendingCall();
    return {
      scene: game.campaign.state.scene,
      day: game.campaign.state.story.day,
      minutes: game.campaign.state.story.timeMinutes,
      chapter: game.campaign.state.story.chapter,
      pending: pending && {
        eventId: pending.eventId,
        from: pending.from,
        vo: pending.vo,
        targetSceneId: pending.targetSceneId,
      },
      door: game.apartmentStory.tryLeave(game.activityContext()),
    };
  });
  check('after THE TAKE, only Lou owes a new-space call in the starter flat',
    starter.scene.id === 'apartment'
      && starter.day === 5
      && starter.minutes === 18 * 60 + 50
      && starter.chapter === 'post_heist'
      && starter.pending?.eventId === 'lou_golf_call'
      && starter.pending?.vo === 'call.lou.new_space'
      && starter.pending?.targetSceneId === 'silver_pines'
      && starter.door?.kind === 'call'
      && starter.door?.id === 'lou_golf_call',
    JSON.stringify(starter));

  const louCall = await page.evaluate(() => {
    const game = window.__squatch;
    game.getUp();
    game.apartmentStory.update(6.1);
    const definition = game.phone.call?.def;
    const before = {
      ringing: game.phone.ringing,
      eventId: definition?.eventId,
      from: definition?.from,
      vo: definition?.vo,
      targetSceneId: definition?.targetSceneId,
    };
    game.apartment.inventory.add('phone');
    game.phone.press();
    const state = game.campaign.state;
    return {
      before,
      answered: state.events.lou_golf_call.status,
      cabinCall: state.events.cabin_margo_call.status,
      appointment: state.events.margo_date_call.status,
      silverPines: state.missions.silver_pines.status,
      retiredCallSpent: state.story.timeEvents.includes('call.margo_date'),
      door: game.apartmentStory.tryLeave(game.activityContext()),
    };
  });
  check('the physical ring is Lou, not a duplicate call from Margo',
    louCall.before.ringing
      && louCall.before.eventId === 'lou_golf_call'
      && louCall.before.from === 'Big Uncle Lou'
      && louCall.before.vo === 'call.lou.new_space'
      && louCall.before.targetSceneId === 'silver_pines',
    JSON.stringify(louCall.before));
  check('answering Lou preserves the cabin appointment and points the night at bed',
    louCall.answered === 'answered'
      && louCall.cabinCall === 'answered'
      && louCall.appointment === 'answered'
      && louCall.silverPines === 'available'
      && !louCall.retiredCallSpent
      && louCall.door?.kind === 'stay'
      && louCall.door?.id === 'sleep_before_the_course',
    JSON.stringify(louCall));

  /* ------------------------------------------------------------------ *
   * 2. Sleep, warm up on Squatch Shoot, and leave through the real door.
   * ------------------------------------------------------------------ */
  const morning = await page.evaluate(() => {
    const game = window.__squatch;
    game.lieOnBed();
    game.sleepInBed();
    const state = game.campaign.state;
    return {
      chapter: state.story.chapter,
      day: state.story.day,
      minutes: state.story.timeMinutes,
      pending: game.apartmentStory.pendingCall()?.eventId ?? null,
      door: game.apartmentStory.tryLeave(game.activityContext()),
    };
  });
  check('sleep opens the Day 6 golf morning without another telephone',
    morning.chapter === 'golf_morning'
      && morning.day === 6
      && morning.minutes === 7 * 60
      && morning.pending === null
      && morning.door?.kind === 'activity'
      && morning.door?.id === 'playedSquatchShoot',
    JSON.stringify(morning));

  await page.waitForFunction(() => window.__squatch.game.passingOut === false, null, {
    timeout: 30000,
  });
  const golfDoor = await page.evaluate(async () => {
    const game = window.__squatch;
    game.apartment.state.shootScore = 2000;
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    return {
      played: game.campaign.state.activities.playedSquatchShoot,
      door: game.apartmentStory.tryLeave(game.activityContext()),
    };
  });
  check('the shared pastime gate releases the starter-flat door to Silver Pines',
    golfDoor.played === true
      && golfDoor.door?.kind === 'go'
      && golfDoor.door?.destination === 'silver_pines',
    JSON.stringify(golfDoor));

  await page.evaluate(() => window.__squatch.tryLeave());
  await page.waitForURL(/golf\.html/, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__golfReady === true);

  const atGolf = await page.evaluate(() => ({
    scene: window.__golf.campaign.state.scene,
    story: window.__golf.campaign.state.story,
    mission: window.__golf.story.mission.status,
  }));
  check('the real route arrives at Silver Pines at the authored half past seven',
    atGolf.scene.id === 'silver_pines'
      && atGolf.scene.spawn === 'car_park'
      && atGolf.story.chapter === 'golf_morning'
      && atGolf.story.day === 6
      && atGolf.story.timeMinutes === 7 * 60 + 30
      && atGolf.mission === 'available',
    JSON.stringify(atGolf));

  /* ------------------------------------------------------------------ *
   * 3. Close a complete three-hole card through the scene's own finish hook.
   *
   * The full round belongs to verify:golf. This seam uses the same end-card
   * callback that real Hole 3 invokes, including story.complete(), rather than
   * writing mission status or navigating around the handover.
   * ------------------------------------------------------------------ */
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.__golf?.story?.mission?.status === 'in_progress');
  const handover = await page.evaluate(() => {
    const game = window.__golf;
    const holes = [
      { hole: 1, par: 4, strokes: 4, penalties: 0, heardInvitation: true },
      { hole: 2, par: 3, strokes: 3, penalties: 0, rodeWithLou: true },
      { hole: 3, par: 4, strokes: 4, penalties: 0 },
    ];
    const offered = game.presentApartmentKeys('offer_apartment_keys');
    const received = game.presentApartmentKeys('receive_apartment_keys');
    game.round.hooks.onRoundComplete({
      holes,
      strokes: 11,
      toPar: 0,
      lines: holes.map((hole) => ({
        card: `H${hole.hole}`,
        strokes: hole.strokes,
        label: 'E',
      })),
    });
    const state = game.campaign.state;
    return {
      offered,
      received,
      keyState: game.apartmentKeyState,
      keyVisible: game.apartmentKeys.visible,
      keyParentIsCamera: game.apartmentKeys.parent === game.camera,
      mission: state.missions.silver_pines,
      story: state.story,
      endCardVisible: !document.getElementById('endcard')?.classList.contains('hidden'),
      continueText: document.getElementById('endcard-home')?.textContent ?? '',
    };
  });
  check('Silver Pines ends with the apartment keys physically in Tony\'s hand',
    handover.offered
      && handover.received
      && handover.keyState === 'received'
      && handover.keyVisible
      && handover.keyParentIsCamera,
    JSON.stringify(handover));
  check('the real round-complete hook closes Beat 13 and exposes Continue',
    handover.mission.status === 'complete'
      && handover.mission.holesPlayed === 3
      && handover.story.chapter === 'luxury_apartment'
      && handover.story.day === 6
      && handover.story.timeMinutes === 10 * 60 + 30
      && handover.endCardVisible
      && handover.continueText.trim().toLowerCase() === 'continue',
    JSON.stringify(handover));
  await page.screenshot({
    path: path.join(EVIDENCE, '01-silver-pines-key-handoff.png'),
    fullPage: true,
  });

  await page.evaluate(() => document.getElementById('endcard-home').click());
  await page.waitForURL(/luxury-apartment\.html/, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.LUXURY_APARTMENT?.home);

  /* ------------------------------------------------------------------ *
   * 4. Beat 14 is the new flat, three chores, and a direct date departure.
   * ------------------------------------------------------------------ */
  const arrived = await page.evaluate(async () => {
    const runtime = window.LUXURY_APARTMENT;
    const { createCampaign } = await import('./src/core/campaign.js');
    const { createLuxuryApartmentStory } = await import('./src/core/luxury-apartment-story.js');
    const campaign = createCampaign();
    const story = createLuxuryApartmentStory({ campaign });
    return {
      scene: campaign.state.scene,
      story: campaign.state.story,
      phase: story.phase(),
      pendingCall: story.pendingCall()?.eventId ?? null,
      door: story.tryLeave(),
      cabinCall: campaign.state.events.cabin_margo_call.status,
      appointment: campaign.state.events.margo_date_call.status,
      retiredCallSpent: campaign.state.story.timeEvents.includes('call.margo_date'),
      phoneRinging: runtime.phone.ringing,
    };
  });
  check('the key handoff routes to the luxury apartment at 11:45',
    arrived.scene.id === 'luxury_apartment'
      && arrived.scene.spawn === 'arrival'
      && arrived.story.chapter === 'luxury_apartment'
      && arrived.story.day === 6
      && arrived.story.timeMinutes === 11 * 60 + 45
      && arrived.phase === 'get_ready',
    JSON.stringify(arrived));
  check('Beat 14 waits on chores, not a later Margo ring',
    arrived.door?.kind === 'activity'
      && arrived.door?.id === 'activity.luxury.get_ready'
      && arrived.pendingCall === null
      && !arrived.phoneRinging
      && arrived.cabinCall === 'answered'
      && arrived.appointment === 'answered'
      && !arrived.retiredCallSpent,
    JSON.stringify(arrived));

  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.LUXURY_APARTMENT.state.phase === 'active');
  const ready = await page.evaluate(async () => {
    const runtime = window.LUXURY_APARTMENT;
    const completed = [
      runtime.actions.ready('showered'),
      runtime.actions.ready('dressed'),
      runtime.actions.ready('phoneTaken'),
    ];
    const { createCampaign } = await import('./src/core/campaign.js');
    const { createLuxuryApartmentStory } = await import('./src/core/luxury-apartment-story.js');
    const campaign = createCampaign();
    const story = createLuxuryApartmentStory({ campaign });
    return {
      completed,
      tally: runtime.readyTally.snapshot(),
      story: campaign.state.story,
      silver: campaign.state.missions.silver_room.status,
      phase: story.phase(),
      pendingCall: story.pendingCall()?.eventId ?? null,
      door: story.tryLeave(),
      retiredCallSpent: campaign.state.story.timeEvents.includes('call.margo_date'),
      phoneRinging: runtime.phone.ringing,
    };
  });
  check('the three visible get-ready facts spend their exact-once beat',
    ready.completed[0] === true
      && ready.completed[1] === true
      /* The campaign phone is already in inventory on this routed landing.
       * `complete()` returning false is the exact-once receipt: the visible
       * tally remains complete without pretending the same phone was taken
       * twice. */
      && ready.completed[2] === false
      && ready.tally.completedCount === 3
      && ready.tally.ready
      && ready.story.timeEvents.includes('activity.luxury.get_ready')
      && ready.story.day === 6
      && ready.story.timeMinutes === 12 * 60 + 30,
    JSON.stringify(ready));
  check('finished chores unlock a direct Front & Center departure with no phone beat',
    ready.silver === 'available'
      && ready.phase === 'date'
      && ready.pendingCall === null
      && ready.door?.kind === 'go'
      && ready.door?.destination === 'silver_room'
      && !ready.retiredCallSpent
      && !ready.phoneRinging,
    JSON.stringify(ready));
  await page.screenshot({
    path: path.join(EVIDENCE, '02-luxury-ready-for-front-and-center.png'),
    fullPage: true,
  });

  const elevator = await page.evaluate(() => window.LUXURY_APARTMENT.actions.elevator('ride'));
  check('the private elevator accepts the real direct-date route', elevator === true,
    String(elevator));
  await page.waitForURL(/silver\.html/, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__silver?.story);
  await page.evaluate(() => window.__silver.postfx.disable?.());

  /* ------------------------------------------------------------------ *
   * 5. Preserve the current Silver Room completion seam: home means luxury.
   * ------------------------------------------------------------------ */
  const atSilver = await page.evaluate(() => ({
    scene: window.__silver.campaignState.scene,
    story: window.__silver.campaignState.story,
    silver: window.__silver.campaignState.missions.silver_room.status,
    golf: window.__silver.campaignState.missions.silver_pines.status,
    appointment: window.__silver.campaignState.events.margo_date_call.status,
    retiredCallSpent: window.__silver.campaignState.story.timeEvents.includes('call.margo_date'),
  }));
  check('Front & Center accepts the cabin appointment after the completed round',
    atSilver.scene.id === 'silver_room'
      && atSilver.scene.spawn === 'kerb'
      && atSilver.story.day === 6
      && atSilver.story.timeMinutes === 19 * 60 + 30
      && atSilver.silver === 'available'
      && atSilver.golf === 'complete'
      && atSilver.appointment === 'answered'
      && !atSilver.retiredCallSpent,
    JSON.stringify(atSilver));

  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.__silver.game.started);
  const ended = await page.evaluate(() => {
    window.__silver.mission.finish('strong');
    window.__silver.debug.ending('strong');
    const state = window.__silver.campaignState;
    return {
      over: window.__silver.game.over,
      silver: state.missions.silver_room,
      story: state.story,
      button: document.getElementById('start-btn')?.textContent ?? '',
    };
  });
  check('the date ending still folds through the real mission seam on Day 6',
    ended.over
      && ended.silver.status === 'complete'
      && ended.silver.outcome === 'strong'
      && ended.silver.seeingHerAgain === true
      && ended.story.day === 6
      && ended.story.timeMinutes === 23 * 60 + 20
      && ended.button.toLowerCase().includes('home'),
    JSON.stringify(ended));

  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForURL(/luxury-apartment\.html/, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.LUXURY_APARTMENT?.home);
  const home = await page.evaluate(async () => {
    const { createCampaign } = await import('./src/core/campaign.js');
    const { createLuxuryApartmentStory } = await import('./src/core/luxury-apartment-story.js');
    const campaign = createCampaign();
    const story = createLuxuryApartmentStory({ campaign });
    return {
      scene: campaign.state.scene,
      story: campaign.state.story,
      phase: story.phase(),
      pendingCall: story.pendingCall()?.eventId ?? null,
      phoneRinging: window.LUXURY_APARTMENT.phone.ringing,
    };
  });
  check('Front & Center returns to the luxury stayover, not the starter apartment',
    home.scene.id === 'luxury_apartment'
      && home.scene.spawn === 'main'
      && home.story.day === 6
      && home.story.timeMinutes === 23 * 60 + 20
      && home.phase === 'come_home'
      && home.pendingCall === null
      && !home.phoneRinging,
    JSON.stringify(home));

  check('no runtime console or page errors occurred', problems.length === 0,
    problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Silver Room story checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Silver Room story checks passed.`);
