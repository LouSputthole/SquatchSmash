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
    let apartmentGun = null;
    window.__squatch.apartment.root.traverse((object) => {
      if (object.name === 'revolver') apartmentGun = object;
    });
    return {
      event: state.events.lou_first_call.status,
      mission: state.missions.bada_bing_one.status,
      scene: state.scene.id,
      timeMinutes: state.story.timeMinutes,
      liveMinutes: window.__squatch.time.minutes,
      gunVisible: apartmentGun?.visible,
    };
  });
  check('the campaign opens in the apartment', initial.scene === 'apartment', initial.scene);
  check('Lou has not already called', initial.event === 'pending', initial.event);
  check('Bada Bing starts locked', initial.mission === 'locked', initial.mission);
  check('the apartment revolver is absent before Lou’s first package',
    initial.gunVisible === false, String(initial.gunVisible));
  check('Day One starts at the authored 6:04 AM checkpoint',
    initial.timeMinutes === 6 * 60 + 4 && initial.liveMinutes === 6 * 60 + 4,
    JSON.stringify(initial));

  await page.waitForTimeout(1200);
  const afterIdle = await page.evaluate(() => ({
    saved: window.__squatch.campaign.state.story.timeMinutes,
    live: window.__squatch.time.minutes,
  }));
  check('waiting in the apartment does not advance story time',
    afterIdle.saved === initial.timeMinutes && afterIdle.live === initial.liveMinutes,
    JSON.stringify(afterIdle));

  const ringing = await page.evaluate(() => {
    const game = window.__squatch;
    game.apartmentStory.beginMorning();
    game.apartmentStory.update(6.1);
    return {
      ringing: game.phone.ringing,
      eventId: game.phone.call?.def?.eventId,
      from: game.phone.call?.def?.from,
      instruction: document.querySelector('#toast-stack')?.textContent?.trim(),
    };
  });
  check('Big Uncle Lou rings the physical phone after the player gets up',
    ringing.ringing && ringing.eventId === 'lou_first_call' && ringing.from === 'Big Uncle Lou',
    JSON.stringify(ringing));
  check('the incoming-call prompt explains the real two-step E control',
    ringing.instruction?.includes('Phone on the nightstand')
      && ringing.instruction.includes('press [E] to pick it up')
      && ringing.instruction.includes('then [E] to answer'),
    ringing.instruction);

  /* He is still in what he slept in, and that has to be beside the point. The
   * nightstand drawer's aim proxy stands three quarters of a metre proud of the
   * drawer and so encloses the phone lying on the nightstand; while it was a
   * hard target it answered for the phone, and the only way to reach a ringing
   * phone was to go and get changed first. So: aim at the phone with every
   * chore still undone, and take it the way a player does. */
  const reach = await page.evaluate(async () => {
    const game = window.__squatch;
    const THREE = await import('three');
    game.interaction.setPaused(false);
    game.player.mode = 'walk';
    game.player.position.set(-3.30, 1.66, -3.20);
    game.player.eyeHeight = 1.66;
    game.player.update(0.016);
    game.camera.up.set(0, 1, 0);
    game.camera.lookAt(new THREE.Vector3(-3.36, 0.62, -4.20));
    game.camera.updateMatrixWorld(true);
    game.interaction.update(0.016);
    const target = game.interaction.current;
    const label = target && (typeof target.userData.interact.label === 'function'
      ? target.userData.interact.label()
      : target.userData.interact.label);
    game.interaction.press();
    return {
      dressed: game.apartment.state.dressed,
      label,
      carrying: game.apartment.inventory.has('phone'),
      held: game.apartment.state.heldItem,
    };
  });
  check('the ringing phone can be picked up before he has changed clothes',
    reach.dressed === false
      && reach.label === 'Take your <b>phone</b>'
      && reach.carrying === true
      && reach.held === 'phone',
    JSON.stringify(reach));

  const answered = await page.evaluate(() => {
    const game = window.__squatch;
    if (!game.apartment.inventory.has('phone')) game.apartment.inventory.add('phone');
    game.phone.press();
    return {
      inCall: game.phone.inCall,
      dressed: game.apartment.state.dressed,
      event: game.campaign.state.events.lou_first_call.status,
      mission: game.campaign.state.missions.bada_bing_one.status,
      changedClothes: game.campaign.state.activities.changedClothes,
      timeMinutes: game.campaign.state.story.timeMinutes,
      liveMinutes: game.time.minutes,
    };
  });
  check('answering before the wardrobe leaves the campaign consistent',
    answered.dressed === false
      && answered.changedClothes === false
      && answered.event === 'answered'
      && answered.mission === 'available',
    JSON.stringify(answered));

  /* He answers out loud now. Drive the call until it is his turn and check the
   * cue it reaches is a real one in the manifest, in the player's voice, with
   * the words that are on the screen -- and that an unrecorded reply still
   * holds for a reading beat rather than stalling the call. */
  const reply = await page.evaluate(async () => {
    const game = window.__squatch;
    let turn = null;
    for (let i = 0; i < 400 && game.phone.inCall && !turn; i++) {
      game.phone.update(0.25);
      const t = game.phone.call?.turns?.[game.phone.call.line];
      if (t?.who === 'me') turn = t;
    }
    const manifest = await fetch('assets/sfx/manifest.json').then((r) => r.json());
    const cue = manifest.sfx.find((c) => c.name === turn?.cue);
    return {
      cue: turn?.cue,
      text: turn?.text,
      voice: cue?.voice,
      says: cue?.say,
      hold: game.phone.call?.hold,
      stillTalking: game.phone.inCall,
    };
  });
  check('Tony’s reply on Lou’s call resolves to a cue in his own voice',
    reply.cue === 'vo.call.lou.bada_bing.tony.1'
      && reply.voice === 'player'
      && reply.says === reply.text
      && reply.stillTalking === true
      && reply.hold > 0,
    JSON.stringify(reply));
  check('answering the held phone persists Lou’s call',
    answered.inCall && answered.event === 'answered', JSON.stringify(answered));
  check('the answered call unlocks Bada Bing', answered.mission === 'available', answered.mission);
  check('answering Lou advances the saved and displayed clock by three minutes',
    answered.timeMinutes === 6 * 60 + 7 && answered.liveMinutes === 6 * 60 + 7,
    JSON.stringify(answered));

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
  await page.waitForFunction(
    () => document.querySelector('#clock .time')?.textContent?.trim(),
    null,
    { timeout: 5000 },
  );
  const arrived = await page.evaluate(() => {
    const state = window.__bing.campaign.state;
    return {
      scene: state.scene.id,
      spawn: state.scene.spawn,
      mission: state.missions.bada_bing_one.status,
      activities: state.activities,
      event: state.events.lou_first_call.status,
      timeMinutes: state.story.timeMinutes,
      timeEvents: state.story.timeEvents,
      clock: document.querySelector('#clock .time')?.textContent?.trim(),
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
  check('travel advances once to the authored 11:41 PM Bing arrival',
    arrived.timeMinutes === 23 * 60 + 41
      && arrived.timeEvents.includes('call.lou_first')
      && arrived.timeEvents.includes('travel.bada_bing_one')
      && arrived.clock === '11:41 PM',
    JSON.stringify(arrived));

  /* The durable packageReceived milestone, rather than the parcel currently
   * being in inventory, keeps the apartment gun unlocked on later returns. */
  await page.evaluate(() => {
    const campaign = window.__bing.campaign;
    campaign.update((state) => {
      state.missions.bada_bing_one.status = 'complete';
      state.missions.bada_bing_one.packageReceived = true;
      state.missions.squatchfather.status = 'complete';
      state.inventory.concealed = [];
    });
    campaign.transition('apartment', { spawn: 'front_door' });
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.apartment, null, { timeout: 60000 });
  const laterGun = await page.evaluate(() => {
    let apartmentGun = null;
    window.__squatch.apartment.root.traverse((object) => {
      if (object.name === 'revolver') apartmentGun = object;
    });
    return {
      visible: apartmentGun?.visible,
      packageReceived:
        window.__squatch.campaign.state.missions.bada_bing_one.packageReceived,
      carriesPackage:
        window.__squatch.campaign.state.inventory.concealed.includes('parcel'),
    };
  });
  check('the revolver returns after Lou’s package and remains after delivery',
    laterGun.visible === true
      && laterGun.packageReceived === true
      && laterGun.carriesPackage === false,
    JSON.stringify(laterGun));

  const corruptRaw = '{"version":1,"scene":';
  await page.evaluate((raw) => {
    localStorage.setItem('squatchlife.campaign', raw);
  }, corruptRaw);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__squatch?.campaign, null, { timeout: 60000 });
  await page.waitForTimeout(1100);
  const recovered = await page.evaluate(() => ({
    state: window.__squatch.campaign.state,
    recovery: window.__squatch.campaign.recovery,
    storedRecovery: JSON.parse(localStorage.getItem('squatchlife.campaign.recovery')),
    storedVersion: JSON.parse(localStorage.getItem('squatchlife.campaign')).version,
    recoveryNotice: document.querySelector('#toast-stack')?.textContent?.trim(),
  }));
  check('corrupt browser saves are preserved and visibly recovered',
    recovered.state.version === 2
      && recovered.state.scene.id === 'apartment'
      && recovered.storedVersion === 2
      && recovered.recovery?.reason === 'invalid_json'
      && recovered.recovery?.raw === corruptRaw
      && recovered.storedRecovery?.raw === corruptRaw
      && recovered.recoveryNotice?.includes('Save recovered'),
    JSON.stringify(recovered));

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
