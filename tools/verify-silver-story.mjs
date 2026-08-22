#!/usr/bin/env node
/**
 * Ride the Silver Room's campaign seam in a real browser.
 *
 * Not the evening itself — `npm run verify:silver` plays that end to end. This
 * is the join: returning on Day 3 after NO WAKE, Margo ringing the physical
 * phone, the apartment door routing to `silver.html`, the mission's own story
 * gate opening, the ending folding into campaign state, the walk home, and the
 * sleep that turns the page onto the Day 4 golf morning, Lou's invitation,
 * and the apartment departure that actually routes to Silver Pines.
 *
 * The whole point is that none of these are seams the unit tests can see: each
 * one is a different page, and a save that survives one of them can still be
 * wrong at the next.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5214;
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
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });

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

/*
 * Exactly what NO WAKE's return leaves behind: Day 3, 4:40 in the afternoon,
 * at his own front door, the body gone and Margo's call still pending.
 */
await page.addInitScript(() => {
  if (localStorage.getItem('squatchlife.campaign')) return;
  localStorage.setItem('squatchlife.campaign', JSON.stringify({
    version: 3,
    revision: 44,
    scene: { id: 'apartment', spawn: 'front_door' },
    story: {
      chapter: 'date',
      day: 3,
      timeMinutes: 16 * 60 + 40,
      meetingKnown: true,
      meetingLearnedFrom: 'lou_call',
      timeEvents: [
        'activity.eat', 'activity.shower', 'activity.poop',
        'activity.change_clothes', 'call.lou_first', 'travel.bada_bing_one',
        'call.booski_day_two', 'travel.airstrip', 'mission.airstrip',
        'call.lou_second', 'travel.bada_bing_two', 'mission.bada_bing_two',
        'travel.jerky_motel', 'mission.jerky_motel', 'call.lou_no_wake',
        'travel.no_wake', 'mission.no_wake',
      ],
    },
    activities: {
      eaten: true, showered: true, peed: true, pooped: true, changedClothes: true,
      emailChecked: false,
    },
    inventory: { carried: [], concealed: [] },
    missions: {
      bada_bing_one: { status: 'complete', packageReceived: true, ending: 'front' },
      squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
      airstrip_smuggling: {
        status: 'complete', checkpoint: 'landed_home', cargoLoaded: true,
        detected: false, landingQuality: 'clean',
      },
      bada_bing_two: { status: 'complete', assignment: 'reserve_pickup' },
      jerky_motel: {
        status: 'complete', ending: 'home', cargoRecovered: true,
        packagesIntact: 6, freshness: 74, policeHeat: 12,
      },
      no_wake: {
        status: 'complete', checkpoint: 'returned', betrayalConfirmed: true,
        playerFired: true, bodyDisposed: true,
      },
      silver_room: { status: 'locked' },
      initiation: { status: 'locked' },
    },
    events: {
      lou_first_call: { status: 'answered' },
      booski_day_two_call: { status: 'answered' },
      lou_second_call: { status: 'answered' },
      lou_no_wake_call: { status: 'answered' },
      margo_date_call: { status: 'pending' },
      booski_big_night_call: { status: 'pending' },
    },
  }));
});

try {
  /* ---- 1. return from NO WAKE into the date chapter ---- */
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  const returned = await page.evaluate(() => {
    const game = window.__squatch;
    const state = game.campaign.state;
    return {
      story: state.story,
      noWake: state.missions.no_wake,
      silver: state.missions.silver_room.status,
      initiation: state.missions.initiation.status,
      call: state.events.margo_date_call.status,
    };
  });
  check('returning from NO WAKE opens the date chapter at 4:40 PM on Day 3',
    returned.story.chapter === 'date'
      && returned.story.day === 3
      && returned.story.timeMinutes === 16 * 60 + 40
      && returned.noWake.status === 'complete'
      && returned.noWake.bodyDisposed === true,
    JSON.stringify(returned));
  check('and the date is still locked until she actually rings',
    returned.silver === 'locked'
      && returned.call === 'pending'
      && returned.initiation === 'locked',
    JSON.stringify(returned));

  const woke = await page.evaluate(() => ({
    day: window.__squatch.time.day,
    minutes: window.__squatch.time.minutes,
    tag: document.querySelector('#overlay .tag')?.textContent ?? '',
  }));
  check('the live apartment clock and return card preserve NO WAKE time',
    woke.day === 3
      && Math.abs(woke.minutes - (16 * 60 + 40)) < 1
      && woke.tag.includes('South Harbor'),
    JSON.stringify(woke));

  /* ---- 2. the door waits for her, then she rings ---- */
  const beforeCall = await page.evaluate(() => window.__squatch.apartmentStory.tryLeave({}));
  check('the door refuses to leave before she has rung',
    beforeCall?.kind === 'call' && beforeCall?.id === 'margo_date_call',
    JSON.stringify(beforeCall));

  const ringing = await page.evaluate(() => {
    const game = window.__squatch;
    game.getUp();
    game.apartmentStory.update(6.1);
    const definition = game.phone.call?.def;
    return {
      ringing: game.phone.ringing,
      eventId: definition?.eventId,
      characterId: definition?.characterId,
      from: definition?.from,
      vo: definition?.vo,
      targetSceneId: definition?.targetSceneId,
      lines: definition?.lines?.length ?? 0,
    };
  });
  check('Margo rings the physical phone on the afternoon of the date',
    ringing.ringing
      && ringing.eventId === 'margo_date_call'
      && ringing.characterId === 'margo'
      && ringing.from === 'Margo'
      && ringing.vo === 'call.margo.date'
      && ringing.targetSceneId === 'silver_room'
      && ringing.lines === 4,
    JSON.stringify(ringing));

  const answered = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.add('phone');
    game.phone.press();
    const state = game.campaign.state;
    return {
      inCall: game.phone.inCall,
      call: state.events.margo_date_call.status,
      silver: state.missions.silver_room.status,
      timeMinutes: state.story.timeMinutes,
      door: game.apartmentStory.tryLeave(game.activityContext()),
    };
  });
  check('answering her unlocks the Silver Room on the authored clock',
    answered.inCall
      && answered.call === 'answered'
      && answered.silver === 'available'
      && answered.timeMinutes === 16 * 60 + 45,
    JSON.stringify(answered));
  check('the apartment door now routes to the Silver Room',
    answered.door?.kind === 'go' && answered.door?.destination === 'silver_room',
    JSON.stringify(answered.door));

  /* ---- 3. out the door, at half seven, into the real scene ---- */
  const departed = await page.evaluate(() => {
    window.__squatch.tryLeave();
    const state = window.__squatch.campaign.state;
    return {
      day: state.story.day,
      timeMinutes: state.story.timeMinutes,
      events: state.story.timeEvents,
    };
  });
  check('leaving for the date lands at Day 3, 7:30 PM through the authored clock',
    departed.day === 3
      && departed.timeMinutes === 19 * 60 + 30
      && departed.events.includes('travel.silver_room'),
    JSON.stringify(departed));

  /* `commit`, and a real timeout. This wait failed on every run — on this
   * branch and on a clean checkout alike — and it was not the navigation: the
   * default `waitUntil: 'load'` was giving the Silver Room twenty seconds to
   * fire its `load` event, and this page pulls its whole module graph and its
   * art on a software rasteriser. The harness's own log said as much, with
   * "navigated to .../silver.html" printed one line above the timeout.
   *
   * What this line is for is "the door really took us there", which is the
   * commit. That the scene then boots is the next line's job, and that it
   * boots into the right place is the check under it. */
  await page.waitForURL(/silver\.html/, { timeout: 120000, waitUntil: 'commit' });
  await page.waitForFunction(() => window.__silver?.story, null, { timeout: 120000 });
  await page.evaluate(() => window.__silver.postfx.disable?.());
  const arrived = await page.evaluate(() => ({
    scene: window.__silver.campaignState.scene,
    mission: window.__silver.campaignState.missions.silver_room.status,
  }));
  check('the departure really lands in the Silver Room and claims the scene',
    arrived.scene.id === 'silver_room' && arrived.scene.spawn === 'kerb',
    JSON.stringify(arrived));

  /* ---- 4. the mission's own gate opens, and the evening starts ---- */
  /* The title panel is taller than this deliberately tiny viewport, so the
   * button is off-screen for a real mouse. Same idiom as verify-silver. */
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.__silver.game.started, null, { timeout: 120000 });
  const begun = await page.evaluate(() => ({
    started: window.__silver.game.started,
    mission: window.__silver.campaignState.missions.silver_room.status,
    state: window.__silver.mission.state,
  }));
  check('pressing start opens the story gate and marks the date in progress',
    begun.started && begun.mission === 'in_progress',
    JSON.stringify(begun));

  /* ---- 5. the evening ends and folds into the campaign ----
   * The 30-minute evening itself is verify:silver's job. What is being tested
   * here is only that a real ending reaches campaign state through the real
   * finish path. */
  const ended = await page.evaluate(() => {
    /* The same two calls the invitation makes when she says yes: the mission
     * records the outcome, then the card is drawn. `debug.ending` alone only
     * previews the card, which would let this pass with an outcome the mission
     * never actually reached. */
    window.__silver.mission.finish('strong');
    window.__silver.debug.ending('strong');
    const folded = window.__silver.campaignState.missions.silver_room;
    return {
      over: window.__silver.game.over,
      folded,
      day: window.__silver.campaignState.story.day,
      timeMinutes: window.__silver.campaignState.story.timeMinutes,
      button: document.getElementById('start-btn')?.textContent ?? '',
    };
  });
  check('the ending folds the evening into campaign state',
    ended.over
      && ended.folded.status === 'complete'
      && ended.folded.outcome === 'strong'
      && ended.folded.seeingHerAgain === true,
    JSON.stringify(ended.folded));
  check('and completion lands on the authored clock, late on Day 3',
    ended.day === 3 && ended.timeMinutes === 23 * 60 + 20,
    JSON.stringify({ day: ended.day, timeMinutes: ended.timeMinutes }));
  check('the ending card offers the way home rather than a replay',
    ended.button.toLowerCase().includes('home'), ended.button);

  /* ---- 6. home ---- */
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForURL(/index\.html/, { timeout: 20000 });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());
  const home = await page.evaluate(() => {
    const game = window.__squatch;
    return {
      tag: document.querySelector('#overlay .tag')?.textContent ?? '',
      scene: game.campaign.state.scene,
      day: game.time.day,
      door: game.apartmentStory.tryLeave(game.activityContext()),
    };
  });
  check('coming home is recognised as coming home from the date',
    home.tag.includes('Silver Room')
      && home.scene.id === 'apartment'
      && home.scene.spawn === 'front_door'
      && home.day === 3,
    JSON.stringify(home));
  check('and the door sends him to bed rather than on to the Circle',
    home.door?.kind === 'stay' && home.door?.id === 'sleep_before_big_night',
    JSON.stringify(home.door));

  /* ---- 7. sleep turns the page onto the Day 4 golf morning ---- */
  const golfMorning = await page.evaluate(() => {
    const game = window.__squatch;
    game.lieOnBed();
    game.sleepInBed();
    const state = game.campaign.state;
    return {
      story: state.story,
      silver: state.missions.silver_room.status,
      golf: state.missions.silver_pines.status,
      golfCall: state.events.lou_golf_call.status,
      heistCall: state.events.lou_heist_call.status,
    };
  });
  check('sleeping off the date opens golf morning on Day 4 at seven',
    golfMorning.story.chapter === 'golf_morning'
      && golfMorning.story.day === 4
      && golfMorning.story.timeMinutes === 7 * 60,
    JSON.stringify(golfMorning.story));
  check('the date survives while Golf and THE TAKE remain locked behind their calls',
    golfMorning.silver === 'complete'
      && golfMorning.golf === 'locked'
      && golfMorning.golfCall === 'pending'
      && golfMorning.heistCall === 'pending',
    JSON.stringify(golfMorning));

  await page.waitForFunction(() => window.__squatch.game.passingOut === false, null, {
    timeout: 15000,
  });
  const lou = await page.evaluate(() => {
    const game = window.__squatch;
    game.getUp();
    game.apartmentStory.update(6.1);
    return {
      ringing: game.phone.ringing,
      eventId: game.phone.call?.def?.eventId,
      from: game.phone.call?.def?.from,
      targetSceneId: game.phone.call?.def?.targetSceneId,
    };
  });
  check('and Big Uncle Lou rings with the Silver Pines invitation',
    lou.ringing
      && lou.eventId === 'lou_golf_call'
      && lou.from === 'Big Uncle Lou'
      && lou.targetSceneId === 'silver_pines',
    JSON.stringify(lou));

  const golfUnlocked = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.add('phone');
    game.phone.press();
    const state = game.campaign.state;
    return {
      call: state.events.lou_golf_call.status,
      golf: state.missions.silver_pines.status,
      heistCall: state.events.lou_heist_call.status,
      door: game.apartmentStory.tryLeave(game.activityContext()),
    };
  });
  /* THE MORNING HAS A THING HE HAS TO DO FIRST, and this file did not know
   * either -- the same stale expectation tools/verify-big-night.mjs carried.
   * `CHAPTER_ACTIVITIES.golf_morning` in src/core/apartment-story.js requires
   * `playedSquatchShoot` before the door opens: Lou is putting a club in his
   * hand in front of people and the eye wants warming up. Authored, with a
   * label, a refusal line, a recorded cue and a hint. */
  check('answering Lou unlocks Golf, not THE TAKE, and the door holds for the pastime',
    golfUnlocked.call === 'answered'
      && golfUnlocked.golf === 'available'
      && golfUnlocked.heistCall === 'pending'
      && golfUnlocked.door?.kind === 'activity'
      && golfUnlocked.door?.id === 'playedSquatchShoot',
    JSON.stringify(golfUnlocked));

  /* `pastimeWatch` reads apartment.state.shootScore every frame and completes
   * the activity at SHOOT_TARGET_SCORE, so putting the score on the machine
   * and giving it a frame is the played path with the arcade left out. */
  const warmedUp = await page.evaluate(async () => {
    const game = window.__squatch;
    game.apartment.state.shootScore = 2000;
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    return {
      played: game.campaign.state.activities.playedSquatchShoot,
      door: game.apartmentStory.tryLeave(game.activityContext()),
    };
  });
  check('warming the eye up on Squatch Shoot points the door at Silver Pines',
    warmedUp.played === true
      && warmedUp.door?.kind === 'go'
      && warmedUp.door?.destination === 'silver_pines',
    JSON.stringify(warmedUp));

  const golfDeparture = await page.evaluate(() => {
    const game = window.__squatch;
    game.tryLeave();
    const state = game.campaign.state;
    return {
      story: state.story,
      scene: state.scene,
    };
  });
  check('the apartment spends the Silver Pines travel marker at 7:30',
    golfDeparture.story.day === 4
      && golfDeparture.story.timeMinutes === 7 * 60 + 30
      && golfDeparture.story.timeEvents.includes('travel.silver_pines'),
    JSON.stringify(golfDeparture));

  await page.waitForURL(/golf\.html/, { timeout: 20000 });
  await page.waitForFunction(() => window.__golfReady === true, null, { timeout: 120000 });
  const atGolf = await page.evaluate(() => {
    const state = window.__golf.campaign.state;
    return {
      scene: state.scene,
      story: state.story,
      golf: state.missions.silver_pines.status,
    };
  });
  check('the real route arrives at Silver Pines with the round ready to start',
    atGolf.scene.id === 'silver_pines'
      && atGolf.scene.spawn === 'car_park'
      && atGolf.story.chapter === 'golf_morning'
      && atGolf.golf === 'available',
    JSON.stringify(atGolf));

  /* ---- 8. and none of the completed date or Golf call replays ---- */
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  const replay = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartmentStory.beginMorning();
    game.apartmentStory.update(60);
    const state = game.campaign.state;
    return {
      call: game.phone.call?.def?.eventId ?? null,
      margo: state.events.margo_date_call.status,
      silver: state.missions.silver_room.status,
      golfCall: state.events.lou_golf_call.status,
      golf: state.missions.silver_pines.status,
      heistCall: state.events.lou_heist_call.status,
      chapter: state.story.chapter,
      day: state.story.day,
    };
  });
  check('a reload cannot replay Margo, reopen the date, or ring Lou twice',
    replay.margo === 'answered'
      && replay.silver === 'complete'
      && replay.day === 4
      && replay.chapter === 'golf_morning'
      && replay.golfCall === 'answered'
      && replay.golf === 'available'
      && replay.heistCall === 'pending'
      && replay.call === null,
    JSON.stringify(replay));

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
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
