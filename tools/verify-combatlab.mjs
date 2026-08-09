#!/usr/bin/env node
/** Focused browser proof for the preview launcher and Combat System tool. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5237;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  response.end(await fsp.readFile(file));
});

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify Combat System.');
  process.exit(1);
}

await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 300)}`);
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  await page.goto(`http://localhost:${PORT}/preview.html`, { waitUntil: 'load' });
  const tools = await page.evaluate(() => [...document.querySelectorAll('[data-preview-tool]')].map((link) => ({
    id: link.dataset.previewTool,
    href: link.getAttribute('href'),
    title: link.closest('article')?.querySelector('h2')?.textContent?.trim(),
    visible: Boolean(link.offsetWidth && link.offsetHeight),
  })));
  check('Wardrobe Preview is visibly reachable',
    tools.some((tool) => tool.id === 'wardrobe' && tool.href === 'wardrobe.html'
      && tool.title === 'Wardrobe Preview' && tool.visible), JSON.stringify(tools));
  check('Combat System is visibly reachable',
    tools.some((tool) => tool.id === 'combat' && tool.href === 'combatlab.html?preview=1'
      && tool.title === 'Combat System' && tool.visible), JSON.stringify(tools));

  await page.click('[data-preview-tool="combat"]');
  await page.waitForFunction(() => window.combatSystem?.targetVisuals?.size === 3, null, { timeout: 30000 });
  const boot = await page.evaluate(() => ({
    title: document.title,
    startVisible: Boolean(document.getElementById('startBtn')?.offsetWidth),
    targetNames: [...window.combatSystem.targetVisuals.values()].flatMap((visual) => [
      visual.root.name, visual.body.name, visual.head.name,
    ]),
    cordName: window.combatSystem.scene.getObjectByName('combatlab.weapon.cord-whip')?.name ?? null,
  }));
  check('the tool boots with a visible start and three labeled targets',
    boot.title.startsWith('Combat System') && boot.startVisible && boot.targetNames.length === 9
      && boot.targetNames.every((name) => name.startsWith('combatlab.target.')),
    JSON.stringify(boot));
  check('the reused cord whip is labeled in the scene',
    boot.cordName === 'combatlab.weapon.cord-whip', JSON.stringify(boot));

  await page.click('#startBtn');
  await page.waitForFunction(() => window.combatSystem?.state().running === true);
  await page.evaluate(() => {
    window.combatSystem.setAutomaticSimulation(false);
    window.combatSystem.setRenderEnabled(true);
  });
  const started = await page.evaluate(() => ({
    state: window.combatSystem.state(),
    menuHidden: document.getElementById('menu').classList.contains('hidden'),
    hudVisible: !document.getElementById('hud').classList.contains('hidden'),
  }));
  check('Start returns immediate player control with the carbine equipped',
    started.state.running && started.state.selected === 'carbine'
      && started.menuHidden && started.hudVisible,
    JSON.stringify(started));

  const moveBefore = await page.evaluate(() => window.combatSystem.state().player);
  await page.keyboard.down('w');
  await page.evaluate(() => { for (let i = 0; i < 90; i++) window.combatSystem.tick(1 / 60); });
  await page.keyboard.up('w');
  const moveAfter = await page.evaluate(() => window.combatSystem.state().player);
  const travel = Math.hypot(moveAfter.x - moveBefore.x, moveAfter.z - moveBefore.z);
  check('WASD movement responds without depending on pointer-lock state',
    travel > 2.2, `travel=${travel.toFixed(3)}m before=${JSON.stringify(moveBefore)} after=${JSON.stringify(moveAfter)}`);

  await page.evaluate(() => {
    window.combatSystem.reset();
    window.combatSystem.aimAt('alpha');
    window.combatSystem.renderer.render(window.combatSystem.scene, window.combatSystem.camera);
    window.combatSystem.renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    for (let i = 0; i < 20; i++) window.combatSystem.tick(1 / 60);
  });
  const firstShot = await page.evaluate(() => ({
    target: window.combatSystem.state().session.targets.find((target) => target.id === 'alpha'),
    shots: window.combatSystem.weaponSystem.stats.shots,
    impacts: window.combatSystem.weaponSystem.stats.impacts,
    feedback: window.combatSystem.session.feedback,
    cueLog: [...window.combatSystem.weaponSystem.cueLog],
  }));
  check('left click fires the shared weapon and damages the aimed target',
    firstShot.shots === 1 && firstShot.impacts === 1 && firstShot.target.health < 100
      && firstShot.feedback.kind === 'gun-hit', JSON.stringify(firstShot));
  check('the gun produces observable shot and cue feedback',
    firstShot.cueLog.some((cue) => cue.includes('weapon.carbine.fire')),
    JSON.stringify(firstShot.cueLog));

  await page.evaluate(() => {
    for (let shot = 0; shot < 3 && !window.combatSystem.session.target('alpha').actor.incapacitated; shot++) {
      window.combatSystem.fire();
      for (let i = 0; i < 20; i++) window.combatSystem.tick(1 / 60);
    }
  });
  const death = await page.evaluate(() => ({
    target: window.combatSystem.state().session.targets.find((target) => target.id === 'alpha'),
    row: document.querySelector('[data-target="alpha"] .target-state')?.textContent,
    rotation: window.combatSystem.targetVisuals.get('alpha').root.rotation.z,
  }));
  check('repeated damage kills and visibly drops a target',
    death.target.dead && death.target.health === 0 && death.row === 'DOWN' && death.rotation > 1,
    JSON.stringify(death));

  await page.keyboard.press('r');
  const reloadStarted = await page.evaluate(() => window.combatSystem.weaponSystem.hud());
  check('R starts the shared reload state', reloadStarted?.reloading === true, JSON.stringify(reloadStarted));
  await page.evaluate(() => { for (let i = 0; i < 180; i++) window.combatSystem.tick(1 / 60); });
  const reloadDone = await page.evaluate(() => window.combatSystem.weaponSystem.hud());
  check('reload completes with a full magazine',
    reloadDone?.reloading === false && reloadDone.rounds === reloadDone.capacity,
    JSON.stringify(reloadDone));

  await page.keyboard.press('3');
  await page.evaluate(() => {
    window.combatSystem.placeNear('bravo');
    window.combatSystem.renderer.render(window.combatSystem.scene, window.combatSystem.camera);
    window.combatSystem.renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    window.combatSystem.tick(1 / 60);
  });
  const whip = await page.evaluate(() => ({
    selected: window.combatSystem.state().selected,
    target: window.combatSystem.state().session.targets.find((target) => target.id === 'bravo'),
    feedback: window.combatSystem.session.feedback,
    visible: window.combatSystem.scene.getObjectByName('combatlab.weapon.cord-whip').visible,
  }));
  check('3 equips the visible reusable whip and click applies whip feedback/damage',
    whip.selected === 'whip' && whip.visible && whip.target.health < 100
      && whip.feedback.kind === 'whip-hit', JSON.stringify(whip));

  /* Pointer lock correctly routes clicks to the canvas. Escape first, exactly
   * as a human does before pressing the visible Reset button. */
  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForFunction(() => document.pointerLockElement === null);
  await page.click('#resetBtn');
  const reset = await page.evaluate(() => window.combatSystem.state());
  check('the Reset button restores targets, ammunition and player spawn',
    reset.session.targets.every((target) => !target.dead && target.health === target.maxHealth)
      && reset.weapon.rounds === reset.weapon.capacity
      && reset.selected === 'carbine'
      && Math.abs(reset.player.x) < 0.01 && Math.abs(reset.player.z - 7.5) < 0.01,
    JSON.stringify(reset));
  check('the focused run has zero runtime errors', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} Combat System checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Combat System checks passed.`);
