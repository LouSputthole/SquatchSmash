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

  /* THE WAY OUT OF THE GAME, DRIVEN THE WAY A PLAYER DRIVES IT.
   *
   * Not `window.__SQUATCH_SMASH_HOST.quitSquatchSmash()` -- the cold-open
   * verifier already calls that directly, and it passed for weeks while the
   * player was trapped. The QUIT button lives on `#pause`, and `#pause` has
   * not opened since the shared pause menu was adopted: `togglePause()`
   * delegates to it whenever one exists, and one always does. So the reveal
   * had no reachable door and the owner reported being stuck twice.
   *
   * This walks the real menu: pause, find the action by its LABEL, click it,
   * and assert the confirm box takes the screen with the game still paused
   * behind it. GIVE UP ends the run; only QUIT closes the game, so finding
   * "an action exists" is not enough -- it has to be this one.
   */
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__scenePause?.isPaused() === true);
  const quitRoute = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('[data-scene-pause] .scene-pause-actions button')]
      .map((button) => button.textContent.trim());
    const quit = [...document.querySelectorAll('[data-scene-pause] .scene-pause-actions button')]
      .find((button) => /quit/i.test(button.textContent));
    quit?.click();
    const confirm = document.getElementById('quitConfirm');
    const menu = document.querySelector('[data-scene-pause]');
    return {
      labels,
      clicked: Boolean(quit),
      confirmShown: confirm ? !confirm.classList.contains('hidden') : false,
      menuHidden: menu ? menu.classList.contains('hidden') : null,
      stillPaused: window.SQUATCH.state === 'paused',
    };
  });
  check('the pause menu offers a real way OUT of the game, not just out of the run',
    quitRoute.clicked && quitRoute.confirmShown && quitRoute.menuHidden
      && quitRoute.stillPaused
      && quitRoute.labels.some((label) => /give up/i.test(label)),
    JSON.stringify(quitRoute));

  /* Backing out must land him back in the menu, still paused -- not in a
   * running campground with a box over it, and not nowhere at all. */
  await page.click('#quitNo');
  const backedOut = await page.evaluate(() => ({
    confirmShown: !document.getElementById('quitConfirm').classList.contains('hidden'),
    menuShown: !document.querySelector('[data-scene-pause]').classList.contains('hidden'),
    state: window.SQUATCH.state,
  }));
  check('saying NO to the quit box returns to the paused menu',
    !backedOut.confirmShown && backedOut.menuShown && backedOut.state === 'paused',
    JSON.stringify(backedOut));

  /* And YES actually closes it. Standalone that is a reload, so the assertion
   * stops at the shutdown card the host hand-off fires behind. */
  await page.evaluate(() => {
    const quit = [...document.querySelectorAll('[data-scene-pause] .scene-pause-actions button')]
      .find((button) => /quit/i.test(button.textContent));
    quit?.click();
  });
  await page.click('#quitYes');
  const closing = await page.evaluate(() => ({
    shutdown: !document.getElementById('shutdown').classList.contains('hidden'),
  }));
  check('saying YES closes the game', closing.shutdown, JSON.stringify(closing));
  await page.goto(`http://localhost:${PORT}/game/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#startBtn');
  await page.click('#startBtn');
  await page.waitForFunction(() => window.SQUATCH.state === 'playing');
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
  /* Say what it was doing when it did not come up, rather than "timeout".
   * A single-file build that throws on the way to `window.SQUATCH` looks
   * exactly like one that is merely slow, and the two want opposite fixes. */
  try {
    await page.waitForFunction(() => window.SQUATCH?.goals, null, { timeout: 60000 });
  } catch (error) {
    const why = await page.evaluate(() => ({
      hasSquatch: typeof window.SQUATCH,
      readyState: document.readyState,
      canvas: !!document.getElementById('game'),
      menuText: document.querySelector('.title')?.textContent ?? null,
      scripts: document.scripts.length,
      bodyLength: document.body?.innerHTML?.length ?? 0,
    })).catch((e) => ({ evaluateFailed: e.message }));
    throw new Error(`${error.message}\nbundle state ${JSON.stringify(why)}`
      + `\npage errors: ${JSON.stringify(problems.slice(0, 5))}`);
  }
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
