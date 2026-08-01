#!/usr/bin/env node
/**
 * Verify that the second Bada Bing visit reuses the existing club, records a
 * distinct assignment, and routes directly to the Jerky Motel.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5205;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify Bada Bing Scene Two.');
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
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

await page.addInitScript(() => {
  if (localStorage.getItem('squatchlife.campaign')) return;
  localStorage.setItem('squatchlife.campaign', JSON.stringify({
    version: 1,
    revision: 19,
    scene: { id: 'bada_bing_two', spawn: 'driver_seat' },
    story: {
      chapter: 'day_two',
      day: 2,
      timeMinutes: 20 * 60 + 15,
      meetingKnown: true,
      meetingLearnedFrom: 'lou',
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
      bada_bing_one: { status: 'complete', packageReceived: true, ending: 'rear' },
      squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
      airstrip_smuggling: { status: 'complete', checkpoint: 'landed_home' },
      bada_bing_two: { status: 'available', assignment: null },
      jerky_motel: {
        status: 'locked',
        ending: null,
        cargoRecovered: false,
        packagesIntact: 0,
        freshness: 0,
        policeHeat: 0,
      },
    },
    events: {
      lou_first_call: { status: 'answered' },
      booski_day_two_call: { status: 'answered' },
      lou_second_call: { status: 'answered' },
    },
  }));
});

async function tick(seconds = 1, step = 0.25) {
  await page.evaluate(([seconds, step]) => {
    const bing = window.__bing;
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      bing.dialogue.update(step, bing.player.position);
      bing.mission.update(step);
      bing.club.update(step, bing.player.position);
      bing.game.drive?.(step);
    }
  }, [seconds, step]);
}

async function state() {
  return page.evaluate(() => {
    const bing = window.__bing;
    return {
      isSecondVisit: bing.isSecondVisit,
      missionState: bing.mission.state,
      readyToLeave: bing.mission.readyToLeave,
      assignment: bing.mission.assignment,
      packageFlag: bing.mission.flags.gotPackage,
      inventory: bing.campaign.state.inventory,
      bingOne: bing.campaign.state.missions.bada_bing_one,
      bingTwo: bing.campaign.state.missions.bada_bing_two,
      motel: bing.campaign.state.missions.jerky_motel,
      scene: bing.campaign.state.scene,
      day: bing.campaign.state.story.day,
      timeMinutes: bing.campaign.state.story.timeMinutes,
      castCount: bing.cast.all.length,
      nextHref: document.getElementById('next-level')?.getAttribute('href') ?? null,
    };
  });
}

try {
  await page.goto(`http://localhost:${PORT}/bing.html?visit=2`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bing?.secondVisitStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__bing.postfx.disable?.());

  let current = await state();
  check('Scene Two selects the reused Bada Bing runtime',
    current.isSecondVisit && current.castCount >= 20,
    `${current.castCount} cast members`);
  check('loading Scene Two does not claim it or advance campaign time before Start',
    current.bingTwo.status === 'available'
      && current.scene.id === 'bada_bing_two'
      && current.day === 2
      && current.timeMinutes === 20 * 60 + 15,
    JSON.stringify({ mission: current.bingTwo, scene: current.scene, day: current.day, time: current.timeMinutes }));
  /* Nothing of the first night's is handed back: the package went to the
   * Squatchfather and stays gone. The phone is not that kind of item -- it is
   * the one thing he has carried since Day One, in `carried` for good, and the
   * club's kit and its [P] key both read it from there. */
  check('the first visit remains complete and no old package is recreated',
    current.bingOne.status === 'complete'
      && !current.inventory.carried.includes('parcel')
      && !current.inventory.concealed.includes('parcel')
      && current.inventory.concealed.length === 0
      && current.inventory.carried.includes('phone'),
    JSON.stringify(current));

  await page.click('#start-btn');
  await page.waitForFunction(() => window.__bing.game.started, null, { timeout: 90000 });
  current = await state();
  check('starting Scene Two persists its own in-progress mission',
    current.bingTwo.status === 'in_progress' && current.missionState === 'lot',
    JSON.stringify(current.bingTwo));

  await page.evaluate(() => {
    const bing = window.__bing;
    const louPosition = bing.cast.byName.lou.group.position;
    bing.game.seatedIn = null;
    bing.teleport(louPosition.x, louPosition.z + 2, Math.PI);
    bing.mission.enteredClub();
    bing.mission.reachedHallway();
    bing.mission.enteredOffice();
    bing.dialogue.start(bing.scripts.lou, 'enter');
    bing.dialogue.go('greet');
  });
  check('Lou presents a real second-visit dialogue choice',
    await page.evaluate(() => window.__bing.dialogue.options.length >= 3));

  await page.evaluate(() => window.__bing.dialogue.choose(0));
  await page.evaluate(() => window.__bing.dialogue.go('assignment'));
  check('the assignment names the Jerky Motel and room twelve',
    await page.evaluate(() => /Jerky Motel/i.test(window.__bing.dialogue.ui.line.textContent)
      && /room twelve/i.test(window.__bing.dialogue.ui.line.textContent)));
  await page.evaluate(() => window.__bing.dialogue.choose(0));
  await page.evaluate(() => window.__bing.dialogue.go('confirm'));

  current = await state();
  check('Lou gives the Motel assignment without a second package',
    current.readyToLeave
      && current.assignment === 'reserve_pickup'
      && current.packageFlag === false
      && !current.inventory.carried.includes('parcel')
      && current.inventory.concealed.length === 0,
    JSON.stringify(current));

  await page.evaluate(() => {
    const bing = window.__bing;
    bing.mission.leftOffice();
    bing.mission.backInLot();
    bing.car.wheel.userData.interact.onUse();
  });
  /* The drive out is a tween at 0.16/second, so it needs seven seconds of
   * simulated time before the ending card is appended -- and this stepper is
   * racing the page's own rAF, which is running at about a frame a second
   * under software rendering. Step generously and wait generously; the
   * assignment itself is banked in driveAway(), before the tween starts, so
   * nothing about the record depends on how long this takes. */
  await tick(14);
  await page.waitForFunction(() => document.getElementById('next-level'), null, { timeout: 45000 });
  current = await state();
  check('Scene Two completion unlocks the Motel in shared state',
    current.bingTwo.status === 'complete'
      && current.bingTwo.assignment === 'reserve_pickup'
      && current.motel.status === 'available',
    JSON.stringify(current));
  check('the ending targets the Motel instead of the apartment',
    current.nextHref === 'motel.html', current.nextHref);

  /* Click it in the page rather than through the driver: the handler
   * navigates, and Playwright's click waits for post-click stability on a
   * document that is already being torn down. */
  await page.evaluate(() => document.getElementById('next-level').click());
  await page.waitForURL(`http://localhost:${PORT}/motel.html`, { timeout: 45000 });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: 60000 });
  const motel = await page.evaluate(() => ({
    phase: window.MOTEL.phase,
    scene: window.MOTEL.campaignState.scene,
    mission: window.MOTEL.campaignState.missions.jerky_motel,
  }));
  check('the transition goes directly into the Motel passenger-seat entry',
    motel.phase === 'menu'
      && motel.scene.id === 'jerky_motel'
      && motel.scene.spawn === 'passenger_seat'
      && motel.mission.status === 'available',
    JSON.stringify(motel));

  const blockedContext = await browser.newContext({ viewport: { width: 480, height: 300 } });
  const blockedPage = await blockedContext.newPage();
  await blockedPage.goto(`http://localhost:${PORT}/bing.html?visit=2`, { waitUntil: 'load' });
  await blockedPage.waitForFunction(() => window.__bing?.secondVisitStory, null, { timeout: 60000 });
  const beforeBlockedStart = await blockedPage.evaluate(() => ({
    scene: window.__bing.campaign.state.scene,
    story: window.__bing.campaign.state.story,
    mission: window.__bing.campaign.state.missions.bada_bing_two,
  }));
  await blockedPage.click('#start-btn');
  await blockedPage.waitForFunction(() => document.getElementById('start-btn').disabled, null, { timeout: 10000 });
  const afterBlockedStart = await blockedPage.evaluate(() => ({
    scene: window.__bing.campaign.state.scene,
    story: window.__bing.campaign.state.story,
    mission: window.__bing.campaign.state.missions.bada_bing_two,
  }));
  check('an unauthorized direct Scene Two URL cannot alter a fresh campaign',
    JSON.stringify(afterBlockedStart) === JSON.stringify(beforeBlockedStart)
      && afterBlockedStart.scene.id === 'apartment'
      && afterBlockedStart.mission.status === 'locked',
    JSON.stringify(afterBlockedStart));
  await blockedContext.close();
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Bada Bing Scene Two checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Bada Bing Scene Two checks passed.`);
