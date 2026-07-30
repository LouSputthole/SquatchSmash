#!/usr/bin/env node
/**
 * Verify the campaign handoff from the apartment's opening morning to the
 * first Bada Bing visit in a real browser.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5201;
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
  console.error('playwright is not installed; cannot verify Day One.');
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

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartmentStory, null, { timeout: 60000 });
  await page.evaluate(() => window.__squatch.postfx.disable?.());

  const initial = await page.evaluate(() => {
    const state = window.__squatch.campaign.state;
    return {
      event: state.events.lou_first_call.status,
      mission: state.missions.bada_bing_one.status,
      scene: state.scene.id,
    };
  });
  check('the campaign opens in the apartment', initial.scene === 'apartment', initial.scene);
  check('Lou has not already called', initial.event === 'pending', initial.event);
  check('Bada Bing starts locked', initial.mission === 'locked', initial.mission);

  const ringing = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartmentStory.beginMorning();
    game.apartmentStory.update(6.1);
    return {
      ringing: game.phone.ringing,
      eventId: game.phone.call?.def?.eventId,
      from: game.phone.call?.def?.from,
    };
  });
  check('Big Uncle Lou rings the physical phone after the player gets up',
    ringing.ringing && ringing.eventId === 'lou_first_call' && ringing.from === 'Big Uncle Lou',
    JSON.stringify(ringing));

  const answered = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartment.inventory.add('phone');
    game.phone.press();
    return {
      inCall: game.phone.inCall,
      event: game.campaign.state.events.lou_first_call.status,
      mission: game.campaign.state.missions.bada_bing_one.status,
    };
  });
  check('answering the held phone persists Lou’s call',
    answered.inCall && answered.event === 'answered', JSON.stringify(answered));
  check('the answered call unlocks Bada Bing', answered.mission === 'available', answered.mission);

  const gates = await page.evaluate(() => {
    const game = window.__squatch;
    const state = game.apartment.state;
    state.fed = false;
    state.showered = false;
    game.game.pooped = false;
    state.dressed = false;
    state.repliedHR = false;

    const found = [];
    found.push(game.tryLeave()?.id);
    state.fed = true;
    found.push(game.tryLeave()?.id);
    state.showered = true;
    found.push(game.tryLeave()?.id);
    game.game.pooped = true;
    found.push(game.tryLeave()?.id);
    state.dressed = true;
    const go = game.tryLeave();
    return { found, go, emailChecked: state.repliedHR };
  });
  check('the live door reports the four chores in order',
    JSON.stringify(gates.found) === JSON.stringify(['eaten', 'showered', 'pooped', 'changedClothes']),
    JSON.stringify(gates.found));
  check('email remains optional for departure',
    gates.emailChecked === false && gates.go?.destination === 'bada_bing_one',
    JSON.stringify(gates.go));

  await page.waitForURL(`http://localhost:${PORT}/bing.html`, { timeout: 10000 });
  await page.waitForFunction(() => window.__bing?.campaign, null, { timeout: 60000 });
  const arrived = await page.evaluate(() => {
    const state = window.__bing.campaign.state;
    return {
      scene: state.scene.id,
      spawn: state.scene.spawn,
      mission: state.missions.bada_bing_one.status,
      activities: state.activities,
      event: state.events.lou_first_call.status,
    };
  });
  check('the apartment door routes directly to Bada Bing',
    arrived.scene === 'bada_bing_one' && arrived.spawn === 'driver_seat',
    `${arrived.scene}/${arrived.spawn}`);
  check('the story handoff persists mission and activity state',
    arrived.mission === 'in_progress'
      && arrived.event === 'answered'
      && arrived.activities.eaten
      && arrived.activities.showered
      && arrived.activities.pooped
      && arrived.activities.changedClothes
      && !arrived.activities.emailChecked,
    JSON.stringify(arrived));

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Day One checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Day One checks passed.`);
