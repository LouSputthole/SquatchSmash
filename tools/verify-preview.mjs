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
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const SENTINEL = '{"version":999,"canonical":"preview verifier must not touch this"}';

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
  return JSON.stringify(snapshot) === JSON.stringify({
    'squatchlife.campaign': SENTINEL,
  });
}

try {
  await page.goto(`http://localhost:${PORT}/preview.html`, { waitUntil: 'load' });
  const launcher = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    links: [...document.querySelectorAll('[data-preview-scene]')]
      .map((link) => [link.dataset.previewScene, link.getAttribute('href')]),
  }));
  check('the launcher exposes all four requested previews',
    launcher.title === 'Scene preview'
      && launcher.links.length === 4
      && launcher.links.every(([, href]) => href.includes('preview=1')),
    JSON.stringify(launcher));
  check('opening the launcher leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/motel.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: 60000 });
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
  await page.click('#startBtn');
  await page.waitForFunction(() => window.MOTEL.phase === 'car');
  motel = await page.evaluate(() => ({
    phase: window.MOTEL.phase,
    status: window.MOTEL.campaignState.missions.jerky_motel.status,
  }));
  check('the Motel preview starts playing', motel.phase === 'car' && motel.status === 'in_progress',
    JSON.stringify(motel));
  check('playing the Motel leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/bing.html?visit=2&preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bing?.secondVisitStory, null, { timeout: 60000 });
  let bing = await page.evaluate(() => ({
    secondVisit: window.__bing.isSecondVisit,
    mission: window.__bing.campaign.state.missions.bada_bing_two,
    airstrip: window.__bing.campaign.state.missions.airstrip_smuggling,
  }));
  check('Bada Bing Scene Two opens with its prerequisites',
    bing.secondVisit
      && bing.mission.status === 'available'
      && bing.airstrip.status === 'complete',
    JSON.stringify(bing));
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__bing.game.started, null, { timeout: 60000 });
  bing = await page.evaluate(() => ({
    started: window.__bing.game.started,
    status: window.__bing.campaign.state.missions.bada_bing_two.status,
  }));
  check('Bada Bing Scene Two starts playing',
    bing.started && bing.status === 'in_progress', JSON.stringify(bing));
  check('playing Bada Bing Scene Two leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/squatchfather.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.squatchfather?.campaignStory, null, { timeout: 60000 });
  let meeting = await page.evaluate(() => ({
    mission: window.squatchfather.campaign.state.missions.squatchfather,
    hasPackage: window.squatchfather.campaign.hasItem('parcel'),
  }));
  check('Squatchfather opens with Lou’s package and an available meeting',
    meeting.mission.status === 'available' && meeting.hasPackage,
    JSON.stringify(meeting));
  await page.click('#startBtn');
  await page.waitForFunction(
    () => window.squatchfather.state() === 'START_EXTERIOR',
    null,
    { timeout: 60000 },
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

  await page.goto(`http://localhost:${PORT}/initiation.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.INITIATION?.player, null, { timeout: 60000 });
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
