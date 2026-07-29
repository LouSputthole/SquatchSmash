#!/usr/bin/env node
/**
 * Verify the apartment's persistent Day One -> Day Two transition and
 * Booski's one-shot airstrip call in a real browser.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5202;
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
  console.error('playwright is not installed; cannot verify Day Two.');
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

await page.addInitScript(() => {
  if (localStorage.getItem('squatchlife.campaign')) return;
  localStorage.setItem('squatchlife.campaign', JSON.stringify({
    version: 1,
    revision: 12,
    scene: { id: 'apartment', spawn: 'front_door' },
    story: {
      chapter: 'day_one',
      day: 1,
      timeMinutes: 23 * 60 + 20,
      meetingKnown: true,
      meetingLearnedFrom: 'lou_call',
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
      airstrip_smuggling: { status: 'locked' },
    },
    events: {
      lou_first_call: { status: 'answered' },
      booski_day_two_call: { status: 'pending' },
    },
  }));
});

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  const sleepStarted = await page.evaluate(() => {
    const game = window.__squatch;
    game.lieOnBed();
    game.sleepInBed();
    const state = game.campaign.state;
    return {
      story: state.story,
      scene: state.scene,
      bada: state.missions.bada_bing_one.status,
      squatchfather: state.missions.squatchfather,
      lou: state.events.lou_first_call.status,
      booski: state.events.booski_day_two_call.status,
      airstrip: state.missions.airstrip_smuggling.status,
    };
  });
  check('sleep writes the Day Two checkpoint before the transition animation ends',
    sleepStarted.story.day === 2
      && sleepStarted.story.chapter === 'day_two'
      && sleepStarted.story.timeMinutes === 420
      && sleepStarted.scene.spawn === 'wake',
    JSON.stringify(sleepStarted));
  check('Day One completion survives sleep',
    sleepStarted.bada === 'complete'
      && sleepStarted.squatchfather.status === 'complete'
      && sleepStarted.squatchfather.weaponDropped
      && sleepStarted.lou === 'answered',
    JSON.stringify(sleepStarted));
  check('the Day Two call and airstrip remain pending until the player wakes',
    sleepStarted.booski === 'pending' && sleepStarted.airstrip === 'locked',
    JSON.stringify(sleepStarted));

  await page.waitForFunction(() => window.__squatch.game.passingOut === false, null, {
    timeout: 10000,
  });
  const woke = await page.evaluate(() => ({
    day: window.__squatch.time.day,
    minutes: window.__squatch.time.minutes,
    mode: window.__squatch.player.mode,
  }));
  check('the live apartment wakes in bed at 7:00 AM on Day Two',
    woke.day === 2 && Math.abs(woke.minutes - 420) < 1 && woke.mode === 'bed',
    JSON.stringify(woke));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());
  const reload = await page.evaluate(() => ({
    tag: document.querySelector('#overlay .tag')?.textContent ?? '',
    story: window.__squatch.campaign.state.story,
    scene: window.__squatch.campaign.state.scene,
  }));
  check('a reload restores the Day Two wake checkpoint',
    reload.story.day === 2
      && reload.story.timeMinutes === 420
      && reload.scene.spawn === 'wake'
      && reload.tag.includes('Day Two'),
    JSON.stringify(reload));

  const ringing = await page.evaluate(() => {
    const game = window.__squatch;
    game.getUp();
    game.apartmentStory.update(6.1);
    const definition = game.phone.call?.def;
    return {
      ringing: game.phone.ringing,
      eventId: definition?.eventId,
      characterId: definition?.characterId,
      targetCharacterId: definition?.targetCharacterId,
      from: definition?.from,
    };
  });
  check('Booski rings the physical phone after the Day Two wake-up',
    ringing.ringing
      && ringing.eventId === 'booski_day_two_call'
      && ringing.characterId === 'booski'
      && ringing.from === 'Booski',
    JSON.stringify(ringing));
  check('Booski names Captain Lou Sasole without colliding with Lou',
    ringing.targetCharacterId === 'captain_lou_sasole'
      && ringing.targetCharacterId !== 'lou',
    JSON.stringify(ringing));

  const answered = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.add('phone');
    game.phone.press();
    const departure = game.tryLeave();
    return {
      inCall: game.phone.inCall,
      event: game.campaign.state.events.booski_day_two_call.status,
      mission: game.campaign.state.missions.airstrip_smuggling.status,
      departure,
    };
  });
  check('answering Booski persists the event and unlocks the airstrip mission',
    answered.inCall
      && answered.event === 'answered'
      && answered.mission === 'available',
    JSON.stringify(answered));
  check('the apartment door exposes the airstrip gate without navigating to a fake scene',
    answered.departure?.kind === 'mission'
      && answered.departure?.id === 'airstrip_smuggling'
      && answered.departure?.characterId === 'captain_lou_sasole',
    JSON.stringify(answered.departure));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  const replay = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartmentStory.beginMorning();
    game.apartmentStory.update(60);
    const state = game.campaign.state;
    return {
      call: game.phone.call?.def?.eventId ?? null,
      lou: state.events.lou_first_call.status,
      booski: state.events.booski_day_two_call.status,
      airstrip: state.missions.airstrip_smuggling.status,
    };
  });
  check('reload does not replay either completed call',
    replay.call === null
      && replay.lou === 'answered'
      && replay.booski === 'answered'
      && replay.airstrip === 'available',
    JSON.stringify(replay));

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Day Two checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Day Two checks passed.`);
