#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverChromium, launchChromium } from './launch-chromium.mjs';

const base = process.env.POLISH_BASE_URL || 'http://localhost:54982';
const server = process.env.POLISH_BASE_URL ? null : spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], {
  env: { ...process.env, PORT: '54982' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
if (server) await new Promise((resolve, reject) => {
  server.once('error', reject); server.once('exit', (code) => reject(new Error(`Server exited ${code}`)));
  server.stdout.once('data', resolve);
});
const output = new URL('../artifacts/followup/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await launchChromium({ headless: true,
  executablePath: process.env.PLAYWRIGHT_NATIVE_CHROME || (process.platform === 'win32' ? discoverChromium() : undefined),
  args: ['--mute-audio'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage(); page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
page.on('requestfailed', (request) => { if (!/ERR_ABORTED/.test(request.failure()?.errorText || '')) errors.push(request.failure()?.errorText); });
async function shot(name) { await page.screenshot({ path: fileURLToPath(new URL(name, output)) }); }
async function apartment(url) {
  console.log(`Starting ${url}`);
  await page.goto(`${base}/${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__squatch?.apartment);
  await page.locator('#start-btn').click();
  await page.waitForFunction(() => window.__squatch.game.started);
  if (await page.evaluate(() => window.__squatch.player.mode === 'bed')) await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.player.mode === 'walk');
}

try {
  // Select a checkpoint with the reveal already earned, then use a normal durable save.
  await apartment('index.html?preview=1&beat=first_apartment');
  await page.evaluate(() => {
    const seed = window.__squatch.campaign.state;
    seed.scene.spawn = 'front_door'; // A durable room checkpoint, past the arcade reveal.
    localStorage.setItem('squatchlife.campaign', JSON.stringify(seed));
  });
  await apartment('index.html');
  await page.evaluate(() => { window.__squatch.apartmentStory.beginMorning(); window.__squatch.apartmentStory.update(6.1); });
  await page.waitForFunction(() => window.__squatch.phone.ringing);
  const aim = await page.evaluate(() => {
    const b = window.__squatch;
    b.teleport(-3.30, -3.20, 'north');
    const dx = -3.36 - b.player.position.x, dz = -4.20 - b.player.position.z;
    b.player.yaw = Math.atan2(-dx, -dz);
    b.player.pitch = Math.atan2(0.62 - b.player.position.y, Math.hypot(dx, dz));
    b.player.update(0); b.scene.updateMatrixWorld(true); b.interaction.update(0);
    const label = b.interaction.current?.userData.interact.label;
    return typeof label === 'function' ? label() : label;
  });
  console.log('Phone approach', aim);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.apartment.state.heldItem === 'phone');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.phone.inCall);
  assert.equal(await page.evaluate(() => window.__squatch.campaign.state.phoneBriefings.length), 0);
  // Let all recorded turns finish at their normal playback rate.
  await page.waitForFunction(() => !window.__squatch.phone.call && window.__squatch.phone.briefings.length === 1);
  assert.equal(await page.locator('#campaign-save-receipt').isVisible(), true);
  await shot('progress-saved.png');
  console.log('PASS real phone pickup, answer and natural completion save one briefing');
  for (let i = 0; i < 4; i++) await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.phone.screen === 'briefings');
  await page.evaluate(() => { const b = window.__squatch; b.player.pitch = 0; b.player.yaw = Math.PI / 2; b.player.update(0); });
  await shot('phone-call-notes.png');
  await page.keyboard.press('Tab');
  await page.locator('[data-scene-call-notes] > summary').click();
  await page.locator('[data-scene-call-note-list] summary').first().click();
  assert.match(await page.locator('[data-scene-save-receipt]').textContent(), /^Saved /);
  assert.match(await page.locator('[data-scene-call-note-list]').textContent(), /Bada Bing/);
  await shot('pause-save-and-briefing.png');
  await apartment('index.html');
  await page.keyboard.press('Tab');
  assert.match(await page.locator('[data-scene-call-note-list]').textContent(), /Bada Bing/);
  console.log('PASS ordinary reload retains call notes and last successful save');

  // An isolated second caller tests selection without pretending to advance the story.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => window.__squatch.apartment.state.heldItem === 'phone');
  await page.evaluate(() => window.__squatch.phone.ring({
    eventId: 'qa.notes.navigation', from: 'Test caller',
    lines: ['A second completed call exercises the note selector.'],
  }));
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !window.__squatch.phone.call && window.__squatch.phone.briefings.length === 2);
  for (let i = 0; i < 4; i++) await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__squatch.phone.screen === 'briefings');
  await page.waitForFunction(() => Boolean(document.pointerLockElement));
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => window.__squatch.phone.briefing === 1);
  assert.equal(await page.evaluate(() => window.__squatch.apartment.state.heldItem), 'phone');
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(() => window.__squatch.phone.briefing === 0);
  console.log('PASS real mouse wheel browses both completed notes without switching inventory');

  await page.goto(`${base}/bing.html?preview=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__bing?.club);
  await page.locator('#start-btn').click();
  await page.waitForFunction(() => window.__bing.game.started);
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(() => window.__bing.player.mode === 'walk');
  async function aimBing(id, x, z) {
    return page.evaluate(({ id, x, z }) => {
      const b = window.__bing;
      const object = id === 'door' ? b.club.doors.storage.leaf : b.licenseToGrill.cart.get(id).pad;
      object.updateWorldMatrix(true, true);
      const centre = new b.THREE.Box3().setFromObject(object).getCenter(new b.THREE.Vector3());
      b.teleport(x, z, 0);
      const delta = centre.clone().sub(b.player.position);
      b.player.yaw = Math.atan2(-delta.x, -delta.z);
      b.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
      b.player.update(0); b.scene.updateMatrixWorld(true); b.interaction.update(0);
      return b.interaction.current === object;
    }, { id, x, z });
  }
  assert.equal(await aimBing('door', 6.75, -7.75), true);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__bing.licenseToGrill.phase === 'open');
  await page.evaluate(() => {
    const b = window.__bing; b.teleport(7.65, -10.9, 0);
    for (let i = 0; i < 400; i++) { b.licenseToGrill.update(0.25); b.dialogue.update(0.25, b.player.position); }
  });
  await page.waitForFunction(() => window.__bing.licenseToGrill.hasCord && !window.__bing.dialogue.active);
  const poses = [];
  for (const [id, x] of [['tenderizer', 7.95], ['ice', 8.1], ['tongs', 8.35], ['sauce', 8.5]]) {
    assert.equal(await aimBing(id, x, -11.15), true, `${id} must resolve through the live ray`);
    await page.keyboard.press('KeyE');
    await page.waitForFunction((id) => window.__bing.licenseToGrill.tool === id, id);
    const priorHits = await page.evaluate(() => window.__bing.licenseToGrill.state.hits);
    await page.evaluate(() => {
      const b = window.__bing; b.teleport(7.2, -10.0, 0);
      b.player.yaw = Math.atan2(-(9.6 - b.player.position.x), -(-12.3 - b.player.position.z));
      b.player.pitch = -0.18; b.player.update(0);
    });
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(() => window.__bing.licenseToGrill.toolSwing < 0);
    assert.match(await page.locator('#toast-stack').textContent(), /Move closer/);
    assert.equal(await page.evaluate(() => window.__bing.licenseToGrill.state.hits), priorHits);
    // Aim within reach; the full License to Grill gate separately proves damage/routes.
    await page.evaluate(() => { const b = window.__bing; b.teleport(9.6, -10.45, 0); b.player.yaw = 0; b.player.pitch = -0.3; b.player.update(0); });
    await page.mouse.down(); await page.mouse.up();
    await page.waitForFunction(() => window.__bing.licenseToGrill.toolSwing > 0.28);
    poses.push(await page.evaluate((id) => {
      const b = window.__bing, model = b.camera.getObjectByName(`grill.tool.${id}`);
      return { id, progress: b.licenseToGrill.toolSwing, position: model.position.toArray(), rotation: model.rotation.toArray().slice(0, 3) };
    }, id));
    await shot(`blond-${id}-motion.png`);
    await page.waitForFunction(() => window.__bing.licenseToGrill.toolSwing < 0);
    await page.evaluate(() => {
      const b = window.__bing; b.teleport(0, 0, 0);
      for (let i = 0; i < 120; i++) { b.licenseToGrill.update(0.25); b.dialogue.update(0.25, b.player.position); }
    });
    await page.keyboard.press('KeyQ');
  }
  await fs.writeFile(new URL('tool-motion-receipts.json', output), JSON.stringify(poses, null, 2));
  console.log('PASS four physical tool pickups, range feedback, real mouse animations and put-downs');
  assert.deepEqual(errors, []);
  console.log('Follow-up polish browser proof passed; no page, console or request errors.');
} finally {
  await fs.writeFile(new URL('browser-errors.json', output), JSON.stringify(errors, null, 2));
  await browser.close(); server?.kill();
}
