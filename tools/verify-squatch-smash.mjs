#!/usr/bin/env node
/**
 * Verify the unmerged completion loop after it has been adapted into the
 * apartment computer's canonical Squatch Smash copy.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5208;
const bundleDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'squatch-smash-verify-'));
const bundlePath = path.join(bundleDir, 'squatchsmash.html');
execFileSync(process.execPath, [
  path.join(ROOT, 'game', 'tools', 'bundle.mjs'),
  bundlePath,
], { stdio: 'pipe' });
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify Squatch Smash.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = rel === '/__squatchsmash-bundle.html'
    ? bundlePath
    : path.join(ROOT, path.normalize(rel));
  const allowed = file === bundlePath || file.startsWith(ROOT);
  if (!allowed || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });

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
  await page.goto(`http://localhost:${PORT}/game/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SQUATCH?.goals, null, { timeout: 60000 });

  let state = await page.evaluate(() => ({
    game: window.SQUATCH.state,
    goals: window.SQUATCH.goals.total,
    completed: window.SQUATCH.goals.completed,
    boss: window.SQUATCH.boss.active,
    meta: window.SQUATCH.meta,
    goalRows: document.querySelectorAll('#goalList li').length,
    skinButtons: document.querySelectorAll('#skinList .skin').length,
  }));
  check('the embedded game opens with all 14 goals and six career skins',
    state.game === 'menu' && state.goals === 14 && state.completed === 0
      && state.goalRows === 14 && state.skinButtons === 6,
    JSON.stringify(state));
  check('a fresh apartment computer has a fresh local career',
    state.meta.runs === 0 && state.meta.skin === 'silver',
    JSON.stringify(state.meta));

  await page.click('#startBtn');
  await page.waitForFunction(() => window.SQUATCH.state === 'playing');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__scenePause?.isPaused() === true);
  state = await page.evaluate(() => ({
    game: window.SQUATCH.state,
    objective: document.querySelector('[data-scene-pause-objective]')?.textContent?.trim() || '',
    instructions: document.querySelectorAll('[data-scene-pause-instructions] li').length,
  }));
  check('standalone Tab pauses Squatch Smash and shows its instructions',
    state.game === 'paused' && state.objective.length > 0 && state.instructions >= 4,
    JSON.stringify(state));
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.SQUATCH.state === 'playing');
  check('standalone Tab resumes Squatch Smash',
    await page.evaluate(() => window.__scenePause?.isPaused() === false));
  await page.evaluate(() => { window.SQUATCH.timeLeft = 30; });
  await page.waitForFunction(() => window.SQUATCH.boss.active, null, { timeout: 5000 });

  state = await page.evaluate(() => ({
    active: window.SQUATCH.boss.active,
    hp: window.SQUATCH.boss.hp,
    maxHp: window.SQUATCH.boss.maxHp,
    bar: document.getElementById('bossBar').classList.contains('show'),
    name: document.getElementById('bossName').textContent,
  }));
  check('Ranger Captain Big Buck arrives for the final 30 seconds',
    state.active && state.hp === state.maxHp && state.maxHp === 10
      && state.bar && state.name.includes('BIG BUCK'),
    JSON.stringify(state));

  await page.evaluate(() => {
    const game = window.SQUATCH;
    game.boss.damage(5);
    game.boss.consumeEnrage();
  });
  await page.waitForTimeout(100);
  state = await page.evaluate(() => ({
    hp: window.SQUATCH.boss.hp,
    enraged: window.SQUATCH.boss.enraged,
    width: document.getElementById('bossFill').style.width,
    classed: document.getElementById('bossBar').classList.contains('enraged'),
  }));
  check('the Captain has durable health and a visible enrage state',
    state.hp === 5 && state.enraged && state.classed && state.width === '50%',
    JSON.stringify(state));

  await page.evaluate(() => {
    const game = window.SQUATCH;
    game.goals.complete('boss');
    game.goals.complete('perfecto');
    game.timeLeft = 0.01;
  });
  await page.waitForFunction(() => window.SQUATCH.state === 'over', null, { timeout: 5000 });
  state = await page.evaluate(() => ({
    state: window.SQUATCH.state,
    completed: window.SQUATCH.goals.completed,
    meta: window.SQUATCH.meta,
    stored: JSON.parse(localStorage.getItem('squatchsmash-meta')),
    endVisible: !document.getElementById('end').classList.contains('hidden'),
    rank: document.getElementById('rankLetter').textContent,
    summary: document.getElementById('goalSummaryCount').textContent,
  }));
  check('the end screen settles goals, ranks the run, and records one career run',
    state.state === 'over' && state.completed === 3 && state.endVisible
      && state.meta.runs === 1 && state.stored.runs === 1
      && /^[SABCD]$/.test(state.rank) && state.summary.includes('3/14'),
    JSON.stringify(state));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.SQUATCH?.meta, null, { timeout: 60000 });
  state = await page.evaluate(() => ({
    runs: window.SQUATCH.meta.runs,
    goals: window.SQUATCH.meta.goals,
    skin: window.SQUATCH.meta.skin,
    careerText: document.getElementById('careerStats').textContent,
  }));
  check('career progression survives leaving and reopening the apartment game',
    state.runs === 1 && state.goals === 3 && state.skin === 'silver'
      && /Rampages\s*1/.test(state.careerText),
    JSON.stringify(state));

  await page.goto(`http://localhost:${PORT}/__squatchsmash-bundle.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SQUATCH?.goals, null, { timeout: 60000 });
  state = await page.evaluate(() => ({
    state: window.SQUATCH.state,
    goals: window.SQUATCH.goals.total,
    skins: document.querySelectorAll('#skinList .skin').length,
    scripts: [...document.scripts].filter((script) => script.src).map((script) => script.src),
  }));
  check('the generated single-file build contains the complete enhanced game',
    state.state === 'menu' && state.goals === 14 && state.skins === 6
      && state.scripts.length === 0,
    JSON.stringify(state));

  check('no runtime console errors occurred', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await fsp.rm(bundleDir, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Squatch Smash checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Squatch Smash checks passed.`);
