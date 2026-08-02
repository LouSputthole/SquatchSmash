#!/usr/bin/env node
/**
 * A direct URL is not an invitation to rewrite campaign progress. Each large
 * mission may build its title scene, but it must pass its story guard before
 * claiming the scene in localStorage.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAMPAIGN_STORAGE_KEY,
  EVENT_IDS,
  MISSION_IDS,
  createCampaign,
} from '../src/core/campaign.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5218;
const CASES = [
  { page: 'squatchfather.html', start: '#startBtn', label: 'Squatchfather' },
  { page: 'beefrun.html', start: '#start-btn', label: 'Beef Run' },
  { page: 'bing.html?visit=2', start: '#start-btn', label: 'HotDog Incident' },
  { page: 'graveyard.html', start: '#start-btn', label: 'Squatch Graveyard' },
  { page: 'motel.html', start: '#startBtn', label: 'Jerky Motel' },
  { page: 'nowake.html', start: '#start-btn', label: 'NO WAKE' },
  { page: 'silver.html', start: '#start-btn', label: 'Silver Room' },
  { page: 'golf.html', start: '#start-btn', label: 'Silver Pines' },
];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
};

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

const seed = createCampaign({ storage: new MemoryStorage() }).state;
const seedJson = JSON.stringify(seed);
const invitedStorage = new MemoryStorage();
const invitedCampaign = createCampaign({ storage: invitedStorage });
invitedCampaign.update((state) => {
  state.story.chapter = 'golf_morning';
  state.story.day = 4;
  state.story.timeMinutes = 7 * 60 + 3;
  state.missions[MISSION_IDS.SILVER_ROOM].status = 'complete';
  state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
  state.missions[MISSION_IDS.SILVER_PINES].status = 'available';
});
/* Lou has invited him, but the apartment has not spent the travel marker or
 * transitioned the save. This is the dangerous direct-URL boundary: it must
 * look locked and leave the authorized save byte-for-byte unchanged. */
const invitedGolfJson = JSON.stringify(invitedCampaign.state);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify direct entry guards.');
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
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

try {
  for (const spec of CASES) {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
    await context.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key: CAMPAIGN_STORAGE_KEY, value: seedJson });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text().slice(0, 240));
    });

    await page.goto(`http://localhost:${PORT}/${spec.page}`, { waitUntil: 'load' });
    await page.waitForSelector(spec.start, { timeout: 60000 });
    const afterLoad = await page.evaluate((key) => localStorage.getItem(key), CAMPAIGN_STORAGE_KEY);
    await page.evaluate((selector) => document.querySelector(selector)?.click(), spec.start);
    await page.waitForTimeout(350);
    const afterRejectedStart = await page.evaluate((key) => localStorage.getItem(key), CAMPAIGN_STORAGE_KEY);

    check(`${spec.label} direct load leaves the fresh campaign untouched`,
      afterLoad === seedJson);
    check(`${spec.label} rejected Start leaves the fresh campaign untouched`,
      afterRejectedStart === seedJson);
    check(`${spec.label} guard reports no runtime errors`,
      problems.length === 0, problems.join(' | '));
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await context.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: CAMPAIGN_STORAGE_KEY, value: invitedGolfJson });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });

  await page.goto(`http://localhost:${PORT}/golf.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__golfReady === true, null, { timeout: 60000 });
  const afterLoad = await page.evaluate((key) => localStorage.getItem(key), CAMPAIGN_STORAGE_KEY);
  await page.evaluate(() => document.querySelector('#start-btn')?.click());
  await page.waitForFunction(() => window.__golfStartBlocked === 'travel_incomplete', null, {
    timeout: 5000,
  });
  const rejected = await page.evaluate((key) => ({
    saved: localStorage.getItem(key),
    reason: window.__golfStartBlocked,
  }), CAMPAIGN_STORAGE_KEY);

  check('Silver Pines invited bare load leaves the not-departed campaign untouched',
    afterLoad === invitedGolfJson);
  check('Silver Pines invited bare Start requires the apartment departure',
    rejected.saved === invitedGolfJson && rejected.reason === 'travel_incomplete',
    rejected.reason);
  check('Silver Pines invited bare guard reports no runtime errors',
    problems.length === 0, problems.join(' | '));
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} direct-entry checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} direct-entry checks passed.`);
