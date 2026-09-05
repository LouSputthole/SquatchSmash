#!/usr/bin/env node
/** Starts a local server unless GUIDANCE_BASE_URL is supplied. Staging chooses a checkpoint; every
 * tested interaction then goes through the real ray and browser key input. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverChromium, launchChromium } from './launch-chromium.mjs';

const base = process.env.GUIDANCE_BASE_URL || 'http://localhost:5249';
const server = process.env.GUIDANCE_BASE_URL ? null : spawn(process.execPath,
  [fileURLToPath(new URL('./serve.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '5249' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
if (server) await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Guidance server exited: ${code}`)));
  server.stdout.once('data', resolve);
});
const output = new URL('../artifacts/polish/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await launchChromium({ headless: true,
  executablePath: process.env.PLAYWRIGHT_NATIVE_CHROME || (process.platform === 'win32' ? discoverChromium() : undefined),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
page.setDefaultTimeout(120_000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => {
  if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? '')) errors.push(`${r.failure()?.errorText} ${r.url()}`);
});
async function start(url, ready, button = '#start-btn') {
  console.log(`Starting ${url}`);
  await page.goto(`${base}/${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((key) => Boolean(window[key]), ready);
  await page.locator(button).click();
  await page.waitForFunction(() => Boolean(window.__objectiveGuide));
  if (ready === 'LUXURY_APARTMENT') await page.waitForFunction(() => window.LUXURY_APARTMENT.state.phase === 'active');
}
async function marker(id, shot) {
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#overlay');
    return !overlay || getComputedStyle(overlay).opacity === '0' || getComputedStyle(overlay).display === 'none';
  });
  await page.keyboard.press('KeyJ');
  await page.waitForFunction((expected) => {
    const m = document.querySelector('[data-objective-marker]');
    return m && !m.hidden && m.dataset.target === expected;
  }, id);
  const receipt = await page.locator('[data-objective-marker]').evaluate((m) => ({
    target: m.dataset.target, text: m.textContent, x: m.getBoundingClientRect().x,
    y: m.getBoundingClientRect().y, onScreen: m.dataset.onScreen,
  }));
  await page.screenshot({ path: fileURLToPath(new URL(shot, output)) });
  console.log(JSON.stringify(receipt));
  return receipt;
}

try {
  await start('index.html?preview=1&beat=first_apartment', '__squatch');
  await page.waitForFunction(() => window.__squatch.game.started && !window.__squatch.game.paused);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.player.mode === 'walk');
  await page.evaluate(async () => {
    const b = window.__squatch;
    const { DAY_ONE_LOU_CALL } = await import('/src/core/apartment-story.js');
    b.apartmentStory.callAnswered(DAY_ONE_LOU_CALL);
    Object.assign(b.apartment.state, { fed: true, showered: true, dressed: true, bowel: 0, bladder: 0 });
    b.game.peed = true; b.game.pooped = false;
    b.updateObjectives();
  });
  assert.match(await page.locator('#objectives .ohint').textContent(), /raw milk.*fridge/i);
  await marker('fridge', 'apartment-prerequisite.png');
  await page.evaluate(() => {
    const b = window.__squatch;
    b.teleport(3.1, 1.95, 'east');
    const at = b.apartment.fridgePos;
    b.player.yaw = Math.atan2(at.x - b.player.position.x, at.z - b.player.position.z) + Math.PI;
    b.player.pitch = Math.atan2(at.y - b.player.position.y, Math.hypot(at.x - b.player.position.x, at.z - b.player.position.z));
    b.player.update(0);
    b.scene.updateMatrixWorld(true);
    b.interaction.update(0);
  });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.apartment.state.fridgeOpen);
  await page.waitForTimeout(800); // Let the physical door swing out of the pickup ray.
  const milkAim = await page.evaluate(() => {
    const b = window.__squatch;
    const target = b.apartment.root.getObjectByName('milk');
    const at = target.position;
    const dx = at.x - b.player.position.x, dz = at.z - b.player.position.z;
    b.player.yaw = Math.atan2(-dx, -dz);
    b.player.pitch = Math.atan2(at.y - b.player.position.y, Math.hypot(dx, dz));
    b.player.update(0);
    b.scene.updateMatrixWorld(true);
    b.interaction.update(0);
    return b.interaction.current === target;
  });
  assert.equal(milkAim, true, 'raw milk must be reachable through the open fridge');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.apartment.state.heldItem === 'milk');
  await page.keyboard.down('KeyF');
  await page.waitForFunction(() => window.__squatch.apartment.state.milkDrunk === 1);
  await page.keyboard.up('KeyF');
  await page.waitForFunction(() => document.querySelector('#objectives .ohint')?.textContent.includes('You are ready'));
  assert.match(await page.locator('#objectives .ohint').textContent(), /ready.*toilet.*\[E\]/i);
  await marker('toilet', 'apartment-toilet-direction.png');
  await page.evaluate(() => {
    const b = window.__squatch;
    const stand = b.apartment.toiletStand;
    const at = b.apartment.toiletSeat;
    b.teleport(stand.x, stand.z, 'north');
    const dx = at.x - b.player.position.x, dz = at.z - b.player.position.z;
    b.player.yaw = Math.atan2(-dx, -dz);
    b.player.pitch = Math.atan2(at.y - b.player.position.y, Math.hypot(dx, dz));
    b.player.update(0);
    b.scene.updateMatrixWorld(true);
    b.interaction.update(0);
  });
  const prompt = await page.evaluate(() => {
    const d = window.__squatch.interaction.current?.userData.interact;
    return typeof d?.label === 'function' ? d.label() : d?.label;
  });
  assert.match(prompt, /toilet|sit/i);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.game.onToilet);
  await page.waitForFunction(() => window.__squatch.game.pooped);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.player.mode === 'walk');
  assert.equal(await page.locator('#objectives').textContent().then((text) => text.includes('Take a dump')), false);
  console.log('PASS apartment: real fridge E, milk E, drink F, target update, toilet E, seated completion and stand up retire the objective');

  await start('cabin.html?preview=1&beat=cabin_lay_low', 'COUNTRYSIDE_CABIN');
  await page.waitForFunction(() => window.COUNTRYSIDE_CABIN.state.phase === 'active');
  console.log(await page.evaluate(() => ({ phase: window.COUNTRYSIDE_CABIN.story.phase(), plan: window.COUNTRYSIDE_CABIN.story.objectivePlan() })));
  // This preview begins at the authored arrival-rest beat.
  await marker('bed', 'cabin-bed-direction.png');
  await page.keyboard.press('Tab');
  await page.locator('[data-scene-objective-direction]:visible').click();
  await page.waitForFunction(() => !document.querySelector('[data-objective-marker]').hidden);
  console.log('PASS cabin: marker and pause-menu direction button');

  await start('graveyard.html?preview=1', 'GRAVEYARD');
  await page.waitForFunction(() => window.GRAVEYARD.phase === 'active');
  await marker('body', 'graveyard-body-direction.png');
  console.log('PASS graveyard: current pickup marked');

  await start('luxury-apartment.html?preview=1', 'LUXURY_APARTMENT');
  await page.waitForFunction(() => window.LUXURY_APARTMENT.state.phase === 'active');
  assert.equal(await page.locator('[data-objective-marker]').isHidden(), true,
    'a fresh objective must give the player time to explore');
  const idleStarted = Date.now();
  await page.waitForFunction(() => {
    const target = document.querySelector('[data-objective-marker]');
    return target && !target.hidden && target.dataset.target === 'shower';
  }, null, { timeout: 90000 });
  assert.ok(Date.now() - idleStarted >= 43000, 'automatic help must follow the idle interval');
  console.log('PASS automatic assistance: unresolved objective reveals its direction without a help key');
  await marker('shower', 'luxury-shower-direction.png');
  console.log('PASS luxury apartment: first unfinished preparation marked');

  await start('bing.html?preview=1', '__bing');
  await page.waitForFunction(() => window.__bing.game.started && !window.__bing.game.paused);
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(() => window.__bing.player.mode === 'walk');
  async function aimBing(kind, x, z) {
    return page.evaluate(({ kind, x, z }) => {
      const b = window.__bing;
      const object = kind === 'door' ? b.club.doors.storage.leaf : b.licenseToGrill.table.get('watch').pad;
      object.updateWorldMatrix(true, true);
      const centre = new b.THREE.Box3().setFromObject(object).getCenter(new b.THREE.Vector3());
      b.teleport(x, z, 0);
      const dx = centre.x - b.player.position.x, dz = centre.z - b.player.position.z;
      b.player.yaw = Math.atan2(-dx, -dz);
      b.player.pitch = Math.atan2(centre.y - b.player.position.y, Math.hypot(dx, dz));
      b.player.update(0);
      b.camera.lookAt(centre);
      b.camera.updateMatrixWorld(true);
      b.interaction.update(0);
      return b.interaction.current === object;
    }, { kind, x, z });
  }
  // Checkpoint staging chooses a reachable door; real E opens it.
  assert.equal(await aimBing('door', 6.75, -7.75), true);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__bing.licenseToGrill.phase === 'open');
  await page.evaluate(() => {
    const b = window.__bing;
    b.teleport(7.65, -10.9, 0);
    // Advance authored dialogue time, without choosing options or calling handlers.
    for (let i = 0; i < 400; i++) {
      b.licenseToGrill.update(0.25);
      b.dialogue.update(0.25, b.player.position);
    }
  });
  await page.waitForFunction(() => window.__bing.licenseToGrill.hasCord && !window.__bing.dialogue.active);
  await page.waitForFunction(() => document.querySelector('#objectives')?.textContent.includes('prep table'));
  assert.equal(await page.locator('#objectives .ohint').isVisible(), true, 'back-room instructions must be visible, not just present in the DOM');
  assert.match(await page.locator('#objectives').textContent(), /LICENSE TO GRILL/);
  await marker('blond-belongings', 'james-blond-direction.png');
  assert.equal(await aimBing('watch', 9.25, -11.7), true);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__bing.licenseToGrill.held === 'watch');
  await page.waitForFunction(() => document.querySelector('#objectives')?.textContent.includes('[Q] put it back'));
  assert.match(await page.locator('#objectives').textContent(), /Inspect.*watch/i);
  await page.evaluate(() => window.__bing.teleport(0, 0, 0));
  await page.waitForFunction(() => !document.querySelector('#objectives')?.textContent.includes('LICENSE TO GRILL'));
  // Verify the required number takes precedence over the car at Lou's exit checkpoint.
  await page.evaluate(() => {
    const b = window.__bing;
    b.dialogue.end();
    b.mission.flags.gotPackage = true;
    b.mission.state = 'briefed';
    b.mission.flags.hasMargoNumber = false;
  });
  await marker('margo', 'bing-margo-direction.png');
  console.log('PASS Bing: real door and watch input, live back-room card, main objective restored on leaving, Margo before the car');

  // Isolated DOM proof of failed recovery; all buttons use the production menu/controller.
  await page.route('**/guidance-recovery-harness.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Recovery proof</title><body></body>' }));
  await page.goto(`${base}/guidance-recovery-harness.html`);
  await page.evaluate(async () => {
    const { createPauseMenu } = await import('/src/core/pause-menu.js');
    const { createSceneRecovery } = await import('/src/core/scene-recovery.js');
    const recovery = createSceneRecovery({ sceneId: 'proof',
      storage: { getItem: () => null, setItem: () => { throw new Error('quota'); } },
      restartCheckpoint: () => ({ ok: false }), restartScene: () => ({ ok: false }),
      completeAndSkip: () => { document.body.dataset.skipped = 'true'; return { ok: true }; },
    });
    window.__scenePause = createPauseMenu({ title: 'Recovery proof', canPause: () => true, recovery });
    window.__scenePause.pause();
  });
  await page.locator('[data-scene-recovery-action="checkpoint"]').click();
  await page.waitForFunction(() => document.querySelector('[data-scene-recovery-help]').textContent.includes('could not finish'));
  await page.locator('[data-scene-recovery-action="scene"]').click();
  await page.locator('[data-scene-recovery-action="skip"]:visible').click();
  assert.equal(await page.getAttribute('body', 'data-skipped'), 'true');
  console.log('PASS recovery: failed action reopens the menu and mixed retries unlock skip despite refused storage writes');
  assert.deepEqual(errors, []);
  console.log('Objective guidance browser proof passed; no page/console/HTTP errors.');
} finally {
  await page.screenshot({ path: fileURLToPath(new URL('guidance-last-frame.png', output)) }).catch(() => {});
  await fs.writeFile(new URL('guidance-errors.json', output), JSON.stringify(errors, null, 2));
  await browser.close();
  server?.kill();
}
