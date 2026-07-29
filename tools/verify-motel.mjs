#!/usr/bin/env node
/**
 * Verify the campaign-owned Motel runtime, its retry behavior, and its return
 * to the apartment in a real browser.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5204;
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
  console.error('playwright is not installed; cannot verify the Motel.');
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
    revision: 20,
    scene: { id: 'jerky_motel', spawn: 'passenger_seat' },
    story: {
      chapter: 'day_two',
      day: 2,
      timeMinutes: 21 * 60,
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
      bada_bing_one: { status: 'complete', packageReceived: true, ending: 'front' },
      squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
      airstrip_smuggling: { status: 'complete', checkpoint: 'landed_home' },
      bada_bing_two: { status: 'complete', assignment: 'reserve_pickup' },
      jerky_motel: {
        status: 'available',
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

async function motelState() {
  return page.evaluate(() => {
    const motel = window.MOTEL;
    return {
      phase: motel.phase,
      ending: motel.ending,
      mission: motel.campaignState.missions.jerky_motel,
      actorCount: motel.actors.length,
      interactableCount: motel.interactables.length,
    };
  });
}

try {
  await page.goto(`http://localhost:${PORT}/motel.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: 60000 });

  let current = await motelState();
  check('the campaign opens the Motel at its passenger-seat entry',
    current.phase === 'menu' && current.mission.status === 'available',
    JSON.stringify(current));
  check('the original interactive Motel environment is intact',
    current.interactableCount >= 50, `${current.interactableCount} interactables`);

  await page.click('#startBtn');
  await page.waitForFunction(() => window.MOTEL.phase === 'car');
  current = await motelState();
  check('starting the deal persists an in-progress mission',
    current.mission.status === 'in_progress' && current.actorCount >= 4,
    JSON.stringify(current));

  await page.evaluate(() => window.MOTEL.finish('walked'));
  current = await motelState();
  check('walking away does not silently complete the Motel',
    current.phase === 'end'
      && current.ending === 'walked'
      && current.mission.status === 'in_progress',
    JSON.stringify(current));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: 60000 });
  await page.click('#startBtn');
  await page.waitForFunction(() => window.MOTEL.phase === 'car');
  current = await motelState();
  check('an interrupted deal resumes from durable campaign state',
    current.mission.status === 'in_progress', JSON.stringify(current.mission));

  await page.evaluate(() => {
    const motel = window.MOTEL;
    motel.S.carryingJerky = true;
    motel.S.packagesIntact = 6;
    motel.S.policeHeat = 22;
    motel.freshness.value = 79;
    motel.finish('home');
  });
  current = await motelState();
  check('the successful getaway records the real mission outcome',
    current.phase === 'end'
      && current.ending === 'home'
      && current.mission.status === 'complete'
      && current.mission.cargoRecovered
      && current.mission.packagesIntact === 6
      && current.mission.freshness === 79
      && current.mission.policeHeat === 22,
    JSON.stringify(current.mission));

  await page.click('#continueBtn');
  await page.waitForURL(`http://localhost:${PORT}/index.html`, { timeout: 10000 });
  await page.waitForFunction(() => window.__squatch?.campaign, null, { timeout: 60000 });
  const home = await page.evaluate(() => ({
    scene: window.__squatch.campaign.state.scene,
    mission: window.__squatch.campaign.state.missions.jerky_motel,
  }));
  check('the Motel returns to the apartment front door',
    home.scene.id === 'apartment'
      && home.scene.spawn === 'front_door'
      && home.mission.status === 'complete',
    JSON.stringify(home));
  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Motel checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Motel checks passed.`);
