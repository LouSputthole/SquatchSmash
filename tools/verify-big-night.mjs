#!/usr/bin/env node
/**
 * Verify the final apartment return in a real browser: home from the Jerky
 * Motel before dawn, the post-Motel sleep, Booskibro's one-shot big-night call,
 * and the apartment door actually routing to the unchanged Initiation.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5213;
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
  console.error('playwright is not installed; cannot verify the big night.');
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
 * The state the Silver Room's end card leaves behind: Day 3, twenty past
 * eleven at night, standing at his own front door with the Motel long done,
 * the date behind him, and nothing on the calendar but the big night.
 *
 * Day 3 is the `date` chapter. Sleeping it off is what turns the page onto
 * Day 4, which is the only day the Initiation happens.
 */
await page.addInitScript(() => {
  if (localStorage.getItem('squatchlife.campaign')) return;
  localStorage.setItem('squatchlife.campaign', JSON.stringify({
    version: 2,
    revision: 44,
    scene: { id: 'apartment', spawn: 'front_door' },
    story: {
      chapter: 'date',
      day: 3,
      timeMinutes: 23 * 60 + 20,
      meetingKnown: true,
      meetingLearnedFrom: 'lou_call',
      timeEvents: [
        'activity.eat', 'activity.shower', 'activity.poop',
        'activity.change_clothes', 'call.lou_first', 'travel.bada_bing_one',
        'call.booski_day_two', 'travel.airstrip', 'mission.airstrip',
        'call.lou_second', 'travel.bada_bing_two', 'mission.bada_bing_two',
        'travel.jerky_motel', 'mission.jerky_motel',
        'call.margo_date', 'travel.silver_room', 'mission.silver_room',
      ],
    },
    activities: {
      eaten: true,
      showered: true,
      pooped: true,
      changedClothes: true,
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
      silver_room: {
        status: 'complete', outcome: 'strong', woo: 74, band: 'strong',
        tippedEverybody: true, rememberedDrink: true,
        seeingHerAgain: true, knowsWhatHeDoes: true,
      },
      initiation: { status: 'locked' },
    },
    events: {
      lou_first_call: { status: 'answered' },
      booski_day_two_call: { status: 'answered' },
      lou_second_call: { status: 'answered' },
      margo_date_call: { status: 'answered' },
      booski_big_night_call: { status: 'pending' },
    },
  }));
});

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  const home = await page.evaluate(() => {
    const game = window.__squatch;
    return {
      tag: document.querySelector('#overlay .tag')?.textContent ?? '',
      day: game.time.day,
      minutes: game.time.minutes,
      door: game.apartmentStory.tryLeave({
        eaten: true, showered: true, pooped: true, changedClothes: true,
      }),
    };
  });
  check('the apartment recognises the return from the Silver Room',
    home.tag.includes('Silver Room')
      && home.day === 3
      && Math.abs(home.minutes - (23 * 60 + 20)) < 1,
    JSON.stringify(home));
  check('the door sends him to bed instead of out to the Circle',
    home.door?.kind === 'stay' && home.door?.id === 'sleep_before_big_night',
    JSON.stringify(home.door));

  const slept = await page.evaluate(() => {
    const game = window.__squatch;
    game.lieOnBed();
    game.sleepInBed();
    const state = game.campaign.state;
    return {
      story: state.story,
      scene: state.scene,
      motel: state.missions.jerky_motel.status,
      silver: state.missions.silver_room.status,
      initiation: state.missions.initiation.status,
      call: state.events.booski_big_night_call.status,
    };
  });
  check('sleep writes the Day Four big-night checkpoint at ten in the morning',
    slept.story.chapter === 'big_night'
      && slept.story.day === 4
      && slept.story.timeMinutes === 10 * 60
      && slept.scene.spawn === 'wake',
    JSON.stringify(slept));
  check('the campaign so far survives the last sleep',
    slept.motel === 'complete' && slept.silver === 'complete', JSON.stringify(slept));
  check('the big-night call and the Initiation stay shut until he wakes',
    slept.call === 'pending' && slept.initiation === 'locked',
    JSON.stringify(slept));

  await page.waitForFunction(() => window.__squatch.game.passingOut === false, null, {
    timeout: 15000,
  });
  const woke = await page.evaluate(() => ({
    day: window.__squatch.time.day,
    minutes: window.__squatch.time.minutes,
    mode: window.__squatch.player.mode,
  }));
  check('the live apartment wakes in bed at ten on Day Four',
    woke.day === 4 && Math.abs(woke.minutes - 10 * 60) < 1 && woke.mode === 'bed',
    JSON.stringify(woke));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());
  const reload = await page.evaluate(() => ({
    tag: document.querySelector('#overlay .tag')?.textContent ?? '',
    story: window.__squatch.campaign.state.story,
    scene: window.__squatch.campaign.state.scene,
  }));
  check('a reload restores the big-night wake checkpoint',
    reload.story.chapter === 'big_night'
      && reload.story.day === 4
      && reload.story.timeMinutes === 10 * 60
      && reload.scene.spawn === 'wake'
      && reload.tag.includes('Day Four'),
    JSON.stringify(reload));

  /* ---------------------------------------------------------------- */
  /* The morning comes first                                           */
  /* ---------------------------------------------------------------- */

  const golfRing = await page.evaluate(() => {
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
  check('Lou rings about the golf before anybody mentions the ceremony',
    golfRing.ringing
      && golfRing.eventId === 'lou_golf_call'
      && golfRing.characterId === 'lou'
      && golfRing.vo === 'call.lou.golf'
      && golfRing.targetSceneId === 'silver_pines'
      && golfRing.lines === 4,
    JSON.stringify(golfRing));

  const golfAnswered = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.add('phone');
    game.phone.press();
    const state = game.campaign.state;
    return {
      inCall: game.phone.inCall,
      call: state.events.lou_golf_call.status,
      pines: state.missions.silver_pines.status,
      initiation: state.missions.initiation.status,
      timeMinutes: state.story.timeMinutes,
      door: game.apartmentStory.tryLeave({}),
    };
  });
  check('answering Lou unlocks the round and not the ceremony',
    golfAnswered.inCall
      && golfAnswered.call === 'answered'
      && golfAnswered.pines === 'available'
      && golfAnswered.initiation === 'locked'
      && golfAnswered.timeMinutes === 10 * 60 + 3,
    JSON.stringify(golfAnswered));
  check('the apartment door routes to Silver Pines, not the Circle',
    golfAnswered.door?.kind === 'go' && golfAnswered.door?.destination === 'silver_pines',
    JSON.stringify(golfAnswered.door));

  const teedOff = await page.evaluate(() => {
    window.__squatch.tryLeave();
    const state = window.__squatch.campaign.state;
    return {
      day: state.story.day,
      timeMinutes: state.story.timeMinutes,
      events: state.story.timeEvents,
    };
  });
  check('leaving for the course lands at Day 4, half past ten',
    teedOff.day === 4
      && teedOff.timeMinutes >= 10 * 60 + 30
      && teedOff.events.includes('travel.silver_pines'),
    JSON.stringify(teedOff));

  // The door really navigates, and the round really claims the scene.
  await page.waitForURL(/golf\.html/, { timeout: 20000 });
  await page.waitForFunction(() => window.__golfReady === true, null, { timeout: 90000 });
  const onCourse = await page.evaluate(() => {
    const g = window.__golf;
    return {
      beat: g.round.beat,
      routed: g.story.begin().unrouted === false || g.story.mission.status !== 'locked',
      savedScene: JSON.parse(localStorage.getItem('squatchlife.campaign')).scene,
      mission: g.campaign.state.missions.silver_pines.status,
    };
  });
  check('the round claims the scene and knows it was invited',
    onCourse.savedScene.id === 'silver_pines'
      && onCourse.savedScene.spawn === 'car_park'
      && onCourse.mission === 'in_progress',
    JSON.stringify(onCourse));

  /* Playing all three holes is verify:golf's job. Here the round is marked
   * finished the way its own end card will, so the seam on the far side of it
   * can be ridden. */
  await page.evaluate(() => {
    window.__golf.campaign.update((state) => {
      state.missions.silver_pines.status = 'complete';
      state.missions.silver_pines.holesPlayed = 3;
    });
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  /* ---------------------------------------------------------------- */
  /* And then the night                                                */
  /* ---------------------------------------------------------------- */

  const ringing = await page.evaluate(() => {
    const game = window.__squatch;
    game.getUp?.();
    game.apartmentStory.beginMorning();
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
  check('Booskibro rings the physical phone about the big night',
    ringing.ringing
      && ringing.eventId === 'booski_big_night_call'
      && ringing.characterId === 'booski'
      && ringing.from === 'Booskibro'
      && ringing.vo === 'call.booski.bignight'
      && ringing.lines === 4,
    JSON.stringify(ringing));

  const answered = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.add('phone');
    game.phone.press();
    const story = game.campaign.state.story;
    return {
      inCall: game.phone.inCall,
      call: game.campaign.state.events.booski_big_night_call.status,
      initiation: game.campaign.state.missions.initiation.status,
      timeMinutes: story.timeMinutes,
      door: game.apartmentStory.tryLeave({}),
    };
  });
  check('answering the big-night call unlocks the Initiation on the authored clock',
    answered.inCall
      && answered.call === 'answered'
      && answered.initiation === 'available'
      && answered.timeMinutes >= 10 * 60 + 8,
    JSON.stringify(answered));
  check('the apartment door now routes to the Initiation',
    answered.door?.kind === 'go' && answered.door?.destination === 'initiation',
    JSON.stringify(answered.door));

  const departed = await page.evaluate(() => {
    window.__squatch.tryLeave();
    const state = window.__squatch.campaign.state;
    return {
      day: state.story.day,
      timeMinutes: state.story.timeMinutes,
      events: state.story.timeEvents,
      initiation: state.missions.initiation.status,
    };
  });
  check('leaving for the Circle lands at Day 4, 7:00 PM through the authored clock',
    departed.day === 4
      && departed.timeMinutes === 19 * 60
      && departed.events.includes('travel.initiation')
      && departed.initiation === 'in_progress',
    JSON.stringify(departed));

  // The door's fade-out really navigates. Ride it into the unchanged scene.
  await page.waitForURL(/initiation\.html/, { timeout: 20000 });
  await page.waitForFunction(() => window.INITIATION?.player, null, { timeout: 60000 });
  const arrived = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    savedScene: JSON.parse(localStorage.getItem('squatchlife.campaign')).scene,
  }));
  check('the departure really lands in the Initiation with the scene saved',
    typeof arrived.phase === 'string'
      && arrived.savedScene.id === 'initiation'
      && arrived.savedScene.spawn === 'gathering',
    JSON.stringify(arrived));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  const replay = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartmentStory.beginMorning();
    game.apartmentStory.update(60);
    const state = game.campaign.state;
    return {
      call: game.phone.call?.def?.eventId ?? null,
      answered: state.events.booski_big_night_call.status,
      timeMinutes: state.story.timeMinutes,
      door: game.apartmentStory.tryLeave({}),
    };
  });
  check('coming back home does not replay the call or refarm the evening',
    replay.call === null
      && replay.answered === 'answered'
      && replay.timeMinutes === 19 * 60
      && replay.door?.destination === 'initiation',
    JSON.stringify(replay));

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} big-night checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} big-night checks passed.`);
