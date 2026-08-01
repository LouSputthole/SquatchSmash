#!/usr/bin/env node
/** Browser-level production verification for NO WAKE. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5215;
const SENTINEL = '{"version":999,"canonical":"NO WAKE preview must not touch this"}';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg',
};

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('playwright is not installed; cannot verify NO WAKE.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found'); return;
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.addInitScript((sentinel) => localStorage.setItem('squatchlife.campaign', sentinel), SENTINEL);
const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text().slice(0, 300));
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const shots = path.join(ROOT, 'docs', 'validation', '2026-07-31');
await fsp.mkdir(shots, { recursive: true });

try {
  await page.goto(`http://localhost:${PORT}/nowake.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NO_WAKE?.story, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.NO_WAKE.postfx?.disable?.();
    document.getElementById('start-btn').click();
  });
  await page.waitForFunction(() => !document.getElementById('overlay'), null, { timeout: 30000 });
  await page.waitForTimeout(250);

  const boot = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    mission: window.NO_WAKE.campaignState.missions.no_wake,
    scene: window.NO_WAKE.campaignState.scene,
    cast: Object.fromEntries(Object.entries(window.NO_WAKE.boat.cast).map(([id, npc]) => [id, {
      characterId: npc.group.userData.characterId,
      gut: npc.parts.profile.gut ?? 0,
    }])),
    boatName: window.NO_WAKE.boat.root.name,
    buoyCount: window.NO_WAKE.world.buoys.length,
    preview: Boolean(document.getElementById('squatch-preview-notice')),
  }));
  check('preview boots NO WAKE in progress at Gate C',
    boot.phase === 'dock' && boot.mission.status === 'in_progress'
      && boot.scene.id === 'no_wake' && boot.scene.spawn === 'gate_c' && boot.preview,
    JSON.stringify(boot));
  check('the production world contains the authored cruiser and marked channel',
    /38-foot cabin cruiser/.test(boot.boatName) && boot.buoyCount >= 10,
    JSON.stringify({ boat: boot.boatName, buoys: boot.buoyCount }));
  check('stable character identities drive the cast and Willy keeps his permanent belly',
    boot.cast.lou.characterId === 'lou' && boot.cast.booski.characterId === 'booski'
      && boot.cast.willy.characterId === 'willy' && boot.cast.willy.gut >= 1,
    JSON.stringify(boot.cast));
  await page.screenshot({ path: path.join(shots, 'no-wake-gate-c.png') });

  const moored = await page.evaluate(() => {
    const b = window.NO_WAKE.physics;
    b.running = true; b.throttle = 1;
    for (let i = 0; i < 240; i++) b.advance(1 / 120);
    return { distance: b.distance, speed: b.speed };
  });
  check('fixed-step boat thrust cannot move against attached mooring lines',
    moored.distance === 0 && moored.speed === 0, JSON.stringify(moored));

  await page.evaluate(() => {
    window.NO_WAKE.startUnderway();
    window.NO_WAKE.physics.throttle = .82;
    for (let i = 0; i < 360; i++) window.NO_WAKE.physics.advance(1 / 120);
  });
  const underway = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    distance: window.NO_WAKE.physics.distance,
    speed: window.NO_WAKE.physics.speed,
    checkpoint: window.NO_WAKE.campaignState.missions.no_wake.checkpoint,
  }));
  check('released cruiser accelerates and records the underway checkpoint',
    underway.phase === 'drive' && underway.distance > 10 && underway.speed > 1
      && underway.checkpoint === 'underway', JSON.stringify(underway));

  await page.evaluate(() => window.NO_WAKE.skipDrive());
  await page.waitForTimeout(350);
  const offshore = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    distance: window.NO_WAKE.physics.distance,
    checkpoint: window.NO_WAKE.campaignState.missions.no_wake.checkpoint,
    wakeVisible: window.NO_WAKE.world.wake.pool.some((p) => p.visible),
  }));
  check('the authored 90-second run gate resolves only into the open-water checkpoint',
    offshore.phase === 'coast' && offshore.distance >= 360
      && offshore.checkpoint === 'open_water', JSON.stringify(offshore));
  await page.screenshot({ path: path.join(shots, 'no-wake-open-water.png') });

  await page.evaluate(() => window.NO_WAKE.beginConfrontation());
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.NO_WAKE.skipDialogue());
    await page.waitForTimeout(90);
  }
  const reveal = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    lines: window.NO_WAKE.dialogueLog.map((line) => line.text),
  }));
  check('the reveal cites established Beef Run and Motel campaign history',
    reveal.lines.some((line) => /Beef Run/.test(line))
      && reveal.lines.some((line) => /Motel|Bureau/.test(line))
      && reveal.lines.some((line) => /know you did/.test(line)),
    JSON.stringify(reveal.lines));

  await page.evaluate(() => window.NO_WAKE.prepareExecution());
  await page.waitForTimeout(250);
  const armed = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    playerGun: window.NO_WAKE.state.playerGun?.visible,
    willyVisible: window.NO_WAKE.boat.cast.willy.group.visible,
  }));
  check('Willy returns to three armed men and waits for the player-authored shot',
    armed.phase === 'ready_to_fire' && armed.playerGun && armed.willyVisible,
    JSON.stringify(armed));
  await page.screenshot({ path: path.join(shots, 'no-wake-execution-ready.png') });

  await page.evaluate(() => window.NO_WAKE.fire());
  await page.waitForTimeout(1100);
  const body = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    shots: window.NO_WAKE.state.executionShots,
    fell: Math.abs(window.NO_WAKE.boat.cast.willy.group.rotation.z) > 1,
  }));
  check('Tony fires first, Lou and Booski join, and Willy falls on deck',
    body.phase === 'body' && body.shots >= 4 && body.fell, JSON.stringify(body));

  await page.evaluate(() => window.NO_WAKE.disposeBody());
  await page.waitForTimeout(1750);
  const disposal = await page.evaluate(() => ({
    phase: window.NO_WAKE.phase,
    disposed: window.NO_WAKE.state.bodyDisposed,
    willyVisible: window.NO_WAKE.boat.cast.willy.group.visible,
  }));
  check('body disposal enters the silent return with Willy removed from the boat',
    disposal.phase === 'return' && disposal.disposed && !disposal.willyVisible,
    JSON.stringify(disposal));

  await page.evaluate(() => window.NO_WAKE.completeMission());
  await page.waitForTimeout(250);
  const completed = await page.evaluate(() => ({
    mission: window.NO_WAKE.campaignState.missions.no_wake,
    chapter: window.NO_WAKE.campaignState.story.chapter,
    canonical: localStorage.getItem('squatchlife.campaign'),
  }));
  check('completion records every irreversible beat and opens Front and Center',
    completed.mission.status === 'complete' && completed.mission.betrayalConfirmed
      && completed.mission.playerFired && completed.mission.bodyDisposed
      && completed.chapter === 'date', JSON.stringify(completed));
  check('the complete browser playthrough leaves canonical storage byte-for-byte untouched',
    completed.canonical === SENTINEL);
  check('the browser emitted no uncaught errors', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} NO WAKE checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} NO WAKE checks passed.`);
