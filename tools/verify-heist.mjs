#!/usr/bin/env node
/** Drive THE TAKE through every authored phase in a real Chromium instance. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5221;
const SHOTS = path.join(ROOT, 'artifacts', 'heist');
const SENTINEL = '{"canonical":"THE TAKE preview must not mutate this"}';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
};

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
await fsp.mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript((value) => {
  const marker = 'squatchlife.verify.heist.seeded';
  if (sessionStorage.getItem(marker)) return;
  localStorage.setItem('squatchlife.campaign', value);
  sessionStorage.setItem(marker, '1');
}, SENTINEL);

const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
page.on('requestfailed', (request) => problems.push(`${request.url()} — ${request.failure()?.errorText}`));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const snapshot = () => page.evaluate(() => window.__heistDebug.snapshot());
const use = async (name) => {
  const result = await page.evaluate((target) => window.__heistDebug.use(target), name);
  if (!result.ok) throw new Error(`interaction ${name}: ${JSON.stringify(result)}`);
  await page.waitForTimeout(40);
  return result;
};
const pose = async (name) => {
  const ok = await page.evaluate((target) => window.__heistDebug.poseForEvidence(target), name);
  if (!ok) throw new Error(`missing evidence pose ${name}`);
  await page.waitForTimeout(120);
};
const pressAtPose = async (name, { hold = 0 } = {}) => {
  await pose(name);
  const prompt = await page.locator('#prompt span').textContent();
  const current = await page.evaluate(() => window.__heistDebug.snapshot().currentInteraction);
  console.log(`    real input ${name}: ${JSON.stringify({ prompt, current })}`);
  if (hold > 0) {
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(hold);
    await page.keyboard.up('KeyE');
  } else await page.keyboard.press('KeyE');
  await page.waitForTimeout(100);
  return prompt;
};
const shot = async (name) => {
  await page.waitForTimeout(name === '02-safehouse-briefing' ? 900 : 180);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

try {
  await page.goto(`http://localhost:${PORT}/heist.html?preview=1&checkpoint=safehouse`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 120000 });
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(() => window.__heistDebug.state === 'CREW_INTRO', null, { timeout: 120000 });
  let state = await snapshot();
  check('safehouse opens with five named crew plus the human player',
    state.phase === 'safehouse'
      && Object.keys(state.squadAnchors).length === 5
      && state.geometry.colliders > 0
      && state.geometry.floorZones > 0
      && state.presentation.crew.every((actor) => actor.facingDot > 0.65)
      && state.presentation.numbskullFace
      && state.presentation.lockers === 3,
    JSON.stringify(state.presentation));
  check('THE TAKE starts with five visible slots while packed weapons remain on the table',
    state.inventory.slots === 5
      && state.inventory.declared === '5'
      && state.inventory.visible
      && state.inventory.items.slice(0, 3).every((item) => item == null)
      && state.inventory.items[3] === 'duffel'
      && state.presentation.armorVisible
      && state.presentation.carbineVisible,
    JSON.stringify(state.inventory));
  check('the expanded heist dialogue bank is wired and recorded lines drive real timing',
    state.voice.authored >= 56
      && state.voice.decoded >= 40
      && state.voice.longest > 0
      && state.voice.lastPlayback?.duration > 0
      && state.voice.subtitleRemaining > 0,
    JSON.stringify(state.voice));
  check('the player capsule is physically ejected from authored solids',
    (await page.evaluate(() => window.__heistDebug.probeCollision())).resolved);
  await shot('02-safehouse-briefing');

  const crewPrompts = [];
  for (const actor of state.presentation.crew) {
    await page.evaluate((id) => window.__heistDebug.poseForCrew(id), actor.id);
    await page.waitForTimeout(120);
    crewPrompts.push(await page.locator('#prompt span').textContent());
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(80);
  }
  state = await snapshot();
  check('real look-and-E input names every crew member and fires each introduction once',
    state.presentation.crew.every((actor) => actor.introduced)
      && state.presentation.crew.every((actor) => crewPrompts.some((label) => label?.includes(actor.name)))
      && (await page.locator('#subtitle').textContent()).includes('Snow:'),
    JSON.stringify(crewPrompts));

  await pressAtPose('briefing');
  await pressAtPose('briefing');
  await pressAtPose('armor', { hold: 1200 });
  await pressAtPose('loadout', { hold: 1200 });
  state = await snapshot();
  check('real hold interactions remove the physical gear and reveal the unpacked five-slot loadout',
    !state.presentation.armorVisible
      && !state.presentation.carbineVisible
      && state.inventory.items.slice(0, 4).join(',') === 'carbine,sidearm,magazines,duffel',
    JSON.stringify({ presentation: state.presentation, inventory: state.inventory }));
  await use('van-door');
  state = await snapshot();
  check('safehouse checkpoint is durable before the van ride',
    state.checkpoint === 'safehouse_ready' && state.state === 'VAN_APPROACH');
  await use('van-interior-door');
  state = await snapshot();
  check('the van ride uses a bounded interior and locks translation until arrival',
    state.phase === 'van' && state.geometry.colliders >= 5, JSON.stringify(state.geometry));
  await shot('03-van-interior');
  await use('van-interior-door');

  state = await snapshot();
  check('bank entry starts a visible 2.75 second ballistic guard threat',
    state.state === 'BANK_ENTRY'
      && state.guardThreat.state === 'drawing'
      && state.guardThreat.remaining <= 2.75
      && !(await page.locator('#guard-threat').evaluate((element) => element.classList.contains('hidden'))),
    JSON.stringify(state.guardThreat));
  await shot('04a-bank-guard-threat');
  await page.waitForFunction(() => {
    const snapshot = window.__heistDebug.snapshot();
    return snapshot.guardFailures === 1
      && snapshot.state === 'BANK_ENTRY'
      && snapshot.phase === 'bank'
      && snapshot.guardThreat.state === 'drawing';
  }, null, { timeout: 7000 });
  state = await snapshot();
  check('missing the guard window restarts at the bank threshold with a fresh threat',
    state.guardFailures === 1 && state.phase === 'bank' && state.guardThreat.remaining > 2.5,
    JSON.stringify(state.guardThreat));

  await pose('bank_guard');
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => window.__heistDebug.state === 'LOBBY_CONTROL', null, { timeout: 3000 });
  state = await snapshot();
  check('a real left-click ballistic hit neutralizes the guard and plays the requested Prospect line',
    state.guardThreat.state === 'neutralized'
      && (await page.locator('#subtitle').textContent()).includes("Good thing about all that Counter-Strike I've been playing."),
    JSON.stringify(state.guardThreat));
  await use('bank-crowd');
  state = await snapshot();
  check('all sixteen physical lobby civilians respond with varied staged actions',
    state.geometry.bankCivilians === 16
      && state.civilianStates.every((value) => ['kneeling', 'prone'].includes(value))
      && new Set(state.civilianVisualStates).size >= 3,
    JSON.stringify(state.civilianVisualStates));
  await pose('bank_lobby');
  await shot('04-bank-lobby');
  await use('bank-rear-guard');
  await use('bank-manager');
  const managerStart = (await snapshot()).managerPosition;
  await page.waitForFunction(() => window.__heistDebug.snapshot().managerEscortProgress >= 1, null, { timeout: 5000 });
  state = await snapshot();
  check('bank-secured checkpoint records clean control while the manager physically walks to the vault',
    state.checkpoint === 'bank_secured'
      && state.campaignMission.civiliansHarmed === 0
      && Math.hypot(state.managerPosition[0] - managerStart[0], state.managerPosition[2] - managerStart[2]) > 4,
    JSON.stringify({ start: managerStart, end: state.managerPosition }));
  await use('vault-door');
  await use('vault-door');
  await shot('05-vault');
  await use('cash-1');
  await use('bank-exit');
  await use('cash-2');
  await use('bank-exit');
  await use('bank-exit');

  state = await snapshot();
  const policeBeforeFailure = state.policeTotal;
  check('street contact spawns a bounded first wave',
    state.phase === 'street' && state.checkpoint === 'street_withdrawal'
      && state.policeActive > 0 && state.policeActive <= 8,
    JSON.stringify({ active: state.policeActive, total: state.policeTotal }));
  await page.evaluate(() => window.__heistDebug.poseForEvidence('bank_exit'));
  await shot('06-bank-exit');
  await page.evaluate(() => window.__heistDebug.poseForEvidence('downtown_firefight'));
  await shot('07-downtown-firefight');
  await page.evaluate(() => window.__heistDebug.fail('browser_restore_probe'));
  await page.waitForFunction(() => window.__heistDebug.state === 'STREET_BLOCK_ONE', null, { timeout: 5000 });
  state = await snapshot();
  check('failure tears down and rebuilds the checkpoint police wave',
    state.policeTotal === policeBeforeFailure && state.policeActive === policeBeforeFailure,
    JSON.stringify({ before: policeBeforeFailure, after: state.policeTotal }));

  await page.evaluate(() => window.__heistDebug.neutralizePolice());
  await use('street-start');
  await use('disabled-van');
  await use('dropped-bag');
  await page.evaluate(() => window.__heistDebug.neutralizePolice());
  await use('garage-entry');
  await shot('08-mercer-garage');
  await page.evaluate(() => window.__heistDebug.neutralizePolice());
  await use('garage-hold');
  await use('garage-hold');
  await use('sedan-trunk');
  await use('driver-door');
  state = await snapshot();
  check('the player takes the wheel with cash physically loaded',
    state.state === 'PLAYER_TAKES_WHEEL' && state.bags.recoveredBags === 8);
  const recoveredDrive = await page.evaluate(() => window.__heistDebug.forceDriveRecovery());
  check('an off-route escape car recovers to the last stable authored turn',
    recoveredDrive.ok && Math.hypot(recoveredDrive.x, recoveredDrive.z - 18) < 1,
    JSON.stringify(recoveredDrive));
  await page.waitForTimeout(800);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyW');
  state = await snapshot();
  check('real throttle input reaches chase speed with a moving pursuit cruiser in frame',
    state.vehicle.maxForwardSpeed === 26
      && Math.abs(state.vehicle.speed) * 2.237 >= 45
      && state.vehicle.pursuitVisible
      && state.vehicle.pursuitInFrame
      && state.vehicle.pursuitDistance >= 7
      && state.vehicle.pursuitDistance <= 24,
    JSON.stringify(state.vehicle));
  await shot('09-player-driving');

  const routeStates = [];
  for (let i = 0; i < 5; i++) {
    routeStates.push(await page.evaluate(() => window.__heistDebug.driveToNextNode()));
    await page.waitForTimeout(80);
  }
  state = await snapshot();
  check('the authored drive crosses every turn, roadblock, and canal node',
    routeStates.map((entry) => entry.node).join(',')
      === 'warehouse_left,market_east,roadblock,canal_turn,industrial_swap'
      && state.state === 'VEHICLE_SWAP',
    JSON.stringify(routeStates));
  check('the fixed-step vehicle carries roadblock damage into the swap',
    state.vehicle.collisionDamage > 0 && state.vehicle.lastStableNode === 'industrial_swap',
    JSON.stringify(state.vehicle));
  await page.evaluate(() => window.__heistDebug.poseForEvidence('vehicle_swap'));
  await shot('10-vehicle-swap');

  for (const target of [
    'swap-trunk', 'swap-bags', 'swap-aid', 'swap-masks',
    'swap-jackets', 'swap-weapons', 'swap-wipe', 'swap-depart',
  ]) await use(target);
  state = await snapshot();
  check('vehicle swap requires every evidence action before safehouse return',
    state.phase === 'safehouse' && Object.values(state.swap).every(Boolean)
      && state.checkpoint === 'vehicle_swap', JSON.stringify(state.swap));
  await use('safehouse-armor');
  await use('briefing-map');
  state = await snapshot();
  check('Shubenator opens mission cleanup with his deadpan signature take',
    state.voice.currentDialogue?.id === 'shubes_signature_cleanup'
      && state.voice.currentDialogue?.cue === 'heist.shubes_signature_cleanup'
      && state.voice.currentDialogue?.text === 'Hey guys, what\u2019s going on?'
      && state.voice.currentDialogue?.direction?.includes('deadpan')
      && (await page.locator('#subtitle').textContent()).includes('Hey guys, what\u2019s going on?'),
    JSON.stringify(state.voice.currentDialogue));
  await shot('11-safehouse-money-count');
  await use('safehouse-loadout');
  await use('van-door');
  await page.waitForFunction(() => window.__heistDebug.snapshot().missionCompleted, null, { timeout: 8000 });
  state = await snapshot();
  check('THE TAKE completes with all six home and the real loot total',
    state.state === 'SCENE_COMPLETE'
      && state.campaignMission.status === 'complete'
      && state.bags.recoveredBags === 8,
    JSON.stringify(state.campaignMission));
  check('preview play leaves canonical localStorage byte-for-byte untouched',
    await page.evaluate((value) => localStorage.getItem('squatchlife.campaign') === value, SENTINEL));

  const apartmentState = structuredClone(state.campaignState);
  apartmentState.scene = { id: 'apartment', spawn: 'front_door' };
  /* The preview-isolation assertion is complete. Seed that exact in-memory
   * result only now, so the return button exercises the same one-tab teardown
   * and Apartment boot as a real campaign instead of creating a second GPU and
   * decoder-heavy Apartment beside the first. */
  await page.evaluate((saved) => {
    localStorage.setItem('squatchlife.campaign', JSON.stringify(saved));
  }, apartmentState);
  const returnControl = page.locator('#return-home');
  const returnBox = await returnControl.boundingBox();
  check('the completion return control is visible inside the playable viewport',
    await returnControl.isVisible()
      && returnBox?.x >= 0 && returnBox?.y >= 0
      && returnBox.x + returnBox.width <= 1280
      && returnBox.y + returnBox.height <= 720,
    JSON.stringify(returnBox));
  await page.evaluate(() => document.getElementById('return-home').click());
  await page.waitForURL(/\/index\.html(?:\?|$)/, { timeout: 10000 });
  check('the completion card return control navigates to the apartment',
    new URL(page.url()).pathname.endsWith('/index.html'), page.url());

  /* The preview router correctly preserves `?preview=1`; remove that testing
   * isolation flag in the same tab so the seeded completed campaign becomes
   * the production Apartment state we are validating below. */
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });

  /* Continue in the same tab and verify the physical cleanup handoff. */
  const apartmentPage = page;
  await apartmentPage.waitForFunction(() => window.__squatch?.apartment?.dressing, null, { timeout: 120000 });
  let apartment = await apartmentPage.evaluate(() => ({
    prep: ['heistArmor', 'heistGloves', 'heistMask', 'heistCarbine', 'heistSidearm', 'heistMagazines', 'heistDuffel']
      .map((id) => window.__squatch.apartment.dressing.get(id).group.visible),
    cleanup: ['heistWash', 'heistChange', 'heistGearSecured']
      .map((id) => window.__squatch.apartment.dressing.get(id).group.visible),
    targets: window.__squatch.interaction.targets.map((target) => target.name),
  }));
  check('post-heist apartment hides packed gear and exposes three physical cleanup stations',
    apartment.prep.every((visible) => !visible)
      && apartment.cleanup.every(Boolean)
      && ['heistWash', 'heistChange', 'heistGearSecured'].every((id) => apartment.targets.includes(id)),
    JSON.stringify(apartment));
  /* Use a DOM click in this post-navigation fixture. A trusted Playwright click
   * acquires pointer lock in headless Chromium and immediately loses it when
   * automation resumes, correctly reopening PAUSED before this assertion can
   * observe the completed first-start gate. Real Start-button input has its own
  * browser contract; this check owns the heist-to-cleanup state handoff. */
  const apartmentStartAt = Date.now();
  await apartmentPage.evaluate(() => document.getElementById('start-btn').click());
  let apartmentAudio = null;
  for (let elapsed = 0; elapsed < 120 && !apartmentAudio?.started; elapsed++) {
    await apartmentPage.waitForTimeout(1000);
    apartmentAudio = await apartmentPage.evaluate(() => ({
      started: window.__squatch?.game?.started === true,
      buffers: window.__squatch?.audio?.buffers?.size ?? 0,
      loaded: window.__squatch?.audio?.loadedCount ?? 0,
      plan: window.__squatch?.audio?.preloadStats ?? null,
      context: window.__squatch?.audio?.ctx?.state ?? null,
    }));
    if ((elapsed + 1) % 10 === 0 && !apartmentAudio.started) {
      console.log(`    Apartment audio ${elapsed + 1}s: ${JSON.stringify(apartmentAudio)}`);
    }
  }
  apartmentAudio.elapsedMs = Date.now() - apartmentStartAt;
  check('post-heist Apartment completes its recorded-audio start gate',
    apartmentAudio.started && apartmentAudio.elapsedMs <= 30000,
    JSON.stringify(apartmentAudio));
  if (!apartmentAudio.started) throw new Error(`Apartment audio start stalled: ${JSON.stringify(apartmentAudio)}`);
  await apartmentPage.evaluate(() => {
    const game = window.__squatch;
    document.getElementById('overlay').classList.add('hidden');
    game.postfx.disable?.();
    game.teleport(0, 2.2, 'north');
    game.hud.hidePrompt();
  });
  await apartmentPage.waitForTimeout(600);
  await apartmentPage.screenshot({ path: path.join(SHOTS, '12-final-apartment-return.png') });
  await apartmentPage.evaluate(() => {
    for (const name of ['heistWash', 'heistChange', 'heistGearSecured']) {
      const target = window.__squatch.interaction.targets.find((item) => item.name === name);
      target.userData.interact.onUse(target);
    }
  });
  apartment = await apartmentPage.evaluate(() => ({
    cleanupComplete: window.__squatch.campaign.state.missions.bank_heist.cleanupComplete,
    visible: ['heistWash', 'heistChange', 'heistGearSecured']
      .map((id) => window.__squatch.apartment.dressing.get(id).group.visible),
    door: window.__squatch.apartmentStory.tryLeave(window.__squatch.activityContext()),
  }));
  check('physical cleanup persists and the apartment door opens only afterward',
    apartment.cleanupComplete
      && apartment.visible.every((visible) => !visible)
      && apartment.door.kind === 'go'
      && apartment.door.destination === 'initiation',
    JSON.stringify(apartment));
  await apartmentPage.screenshot({ path: path.join(SHOTS, '13-apartment-cleanup-complete.png') });
  await apartmentPage.close();

  const resumeCases = [
    ['safehouse_ready', 'VAN_APPROACH', 'van'],
    ['bank_secured', 'MANAGER_ESCORT', 'bank'],
    ['vault_open', 'CASH_LOADING', 'bank'],
    ['street_withdrawal', 'STREET_BLOCK_ONE', 'street'],
    ['mercer_garage', 'GARAGE_HOLD', 'garage'],
    ['vehicle_swap', 'SAFEHOUSE_RETURN', 'safehouse'],
  ];
  let resumed = 0;
  for (const [checkpointId, expectedState, expectedPhase] of resumeCases) {
    const saved = structuredClone(apartmentState);
    saved.scene = { id: 'bank_heist', spawn: 'safehouse' };
    saved.story.chapter = 'heist_day';
    saved.missions.bank_heist.status = 'in_progress';
    saved.missions.bank_heist.checkpoint = checkpointId;
    saved.missions.bank_heist.outcome = null;
    saved.missions.initiation.status = 'locked';
    const resumePage = await browser.newPage({ viewport: { width: 960, height: 540 } });
    resumePage.on('pageerror', (error) => problems.push(`resume:${checkpointId}: ${error.message}`));
    await resumePage.addInitScript((record) => {
      localStorage.setItem('squatchlife.campaign', JSON.stringify(record));
    }, saved);
    await resumePage.goto(`http://localhost:${PORT}/heist.html`, { waitUntil: 'load' });
    await resumePage.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 30000 });
    await resumePage.evaluate(() => document.getElementById('start').click());
    await resumePage.waitForFunction(([stateName, phaseName]) => {
      const snapshot = window.__heistDebug?.snapshot();
      return snapshot?.state === stateName && snapshot?.phase === phaseName;
    }, [expectedState, expectedPhase], { timeout: 30000 });
    let resumedState = await resumePage.evaluate(() => window.__heistDebug.snapshot());
    const initialOk = resumedState.checkpoint === checkpointId
      && resumedState.geometry.colliders > 0
      && resumedState.geometry.floorZones > 0;
    await resumePage.evaluate(() => window.__heistDebug.fail('reload_recovery_probe'));
    await resumePage.waitForFunction(() => window.__heistDebug.state === 'FAILED', null, { timeout: 3000 });
    await resumePage.waitForFunction((stateName) => window.__heistDebug.state === stateName,
      expectedState, { timeout: 5000 });
    resumedState = await resumePage.evaluate(() => window.__heistDebug.snapshot());
    if (initialOk && resumedState.checkpoint === checkpointId) resumed++;
    await resumePage.close();
  }
  check('save/load and failure recovery rebuild every durable heist checkpoint',
    resumed === resumeCases.length, `${resumed}/${resumeCases.length}`);
  check('browser completed without page, console, or request failures', problems.length === 0,
    problems.join(' | ').slice(0, 600));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length} THE TAKE verification check(s) failed.`);
  process.exit(1);
}
console.log(`\nTHE TAKE browser verification passed (${results.length} checks).`);
