#!/usr/bin/env node
/**
 * Drive THE TAKE through every authored phase in a real Chromium instance.
 *
 * This gate used to prove that the scene loaded. It did not prove that the
 * inventory could be switched, that the mask could be reached, that a round
 * could land on a person, that the objective was tracked, or that the road
 * agreed with the calls — every one of which was broken, and every one of
 * which the owner found by playing it. So the rule here is: use the same
 * inputs a player has. Look at a thing and press the key. Click the mouse.
 * `__heistDebug.use()` is allowed only where the target is provably reachable
 * by other checks in this file.
 *
 * The one deliberate exception is throughput: this runs on a software
 * rasteriser at roughly one frame a second, so anything that would measure
 * wall-clock frames measures the rasteriser instead. Driving physics is
 * asserted through `simulateDriving`, which steps the real `updateDriving` at
 * a fixed rate off whatever real key state the keyboard put there.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './launch-chromium.mjs';

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

const browser = await launchChromium({
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
page.on('requestfailed', (request) => {
  // An aborted request is a page being navigated or closed under an in-flight
  // fetch, which is this harness's own doing rather than a broken asset.
  const reason = request.failure()?.errorText ?? '';
  if (reason.includes('ERR_ABORTED')) return;
  problems.push(`${request.url()} — ${reason}`);
});
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
const promptText = () => page.locator('#prompt span').textContent();
const subtitle = () => page.locator('#subtitle').textContent();

/**
 * Wait until the crosshair is genuinely on a target before pressing anything.
 *
 * `InteractionSystem` picks its target inside the frame loop, and this scene
 * renders at roughly one frame a second on a software rasteriser, so a fixed
 * `waitForTimeout` after moving the camera reads the PREVIOUS frame's target
 * and every prompt in the run comes out one step behind.
 */
const waitForTarget = async (name, timeout = 30000) => {
  await page.waitForFunction(
    (target) => window.__heistDebug.snapshot().currentInteraction?.name === target,
    name, { timeout },
  );
};

/**
 * Hold E until something is true, rather than for a wall-clock duration.
 *
 * `hold` progress accumulates in the scene's own clamped `dt` (0.05 s a frame),
 * so at one frame a second a 1.2 s press is worth 0.05 s of hold and no hold
 * interaction in this scene can ever complete. NO WAKE's verifier had the
 * identical fault and it is written down in the 2026-08-03 continuation notes.
 * Press, poll the real state, release.
 */
const holdE = async (until, timeout = 90000) => {
  await page.keyboard.down('KeyE');
  try {
    await page.waitForFunction(until, null, { timeout, polling: 250 });
  } finally {
    await page.keyboard.up('KeyE');
    await page.waitForTimeout(120);
  }
};

const pressAtPose = async (name, { target = null, until = null } = {}) => {
  await pose(name);
  if (target) await waitForTarget(target);
  const prompt = await promptText();
  const current = await page.evaluate(() => window.__heistDebug.snapshot().currentInteraction);
  console.log(`    real input ${name}: ${JSON.stringify({ prompt, current })}`);
  if (until) await holdE(until);
  else {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(150);
  }
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

  /* ---- scale: the owner's first note, in every phase ---- */
  check('nobody in THE TAKE is a giant any more',
    state.scale.crew.every((actor) => actor.height >= 1.7 && actor.height <= 1.9)
      && state.scale.civilians.every((height) => height >= 1.55 && height <= 1.95)
      && state.scale.guard <= 1.95 && state.scale.manager <= 1.95
      && Math.max(...state.scale.crew.map((a) => a.height))
        - Math.min(...state.scale.civilians) < 0.32,
    JSON.stringify(state.scale));

  check('THE TAKE starts with five visible slots while packed weapons remain on the table',
    state.inventory.slots === 5
      && state.inventory.declared === '5'
      && state.inventory.visible
      && state.inventory.items.every((item) => item == null)
      && state.presentation.armorVisible
      && state.presentation.carbineVisible,
    JSON.stringify(state.inventory));
  check('the expanded heist dialogue bank is wired and recorded lines drive real timing',
    state.voice.authored >= 56
      && state.voice.decoded >= 40
      && state.voice.pending >= 35
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
    await waitForTarget(`crew-${actor.id}`);
    crewPrompts.push(await promptText());
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(150);
  }
  state = await snapshot();
  check('real look-and-E input names every crew member and fires each introduction once',
    state.presentation.crew.every((actor) => actor.introduced)
      && state.presentation.crew.every((actor) => crewPrompts.some((label) => label?.includes(actor.name)))
      && /Snow:|Rippinflow:|Shubenator:|DeathMegatron:|Numbskull:/.test(await subtitle()),
    JSON.stringify(crewPrompts));

  await pressAtPose('briefing', { target: 'briefing-map' });
  await pressAtPose('briefing', { target: 'briefing-map' });
  await pressAtPose('armor', {
    target: 'safehouse-armor',
    until: () => window.__heistDebug.snapshot().presentation.armorVisible === false,
  });
  await pressAtPose('loadout', {
    target: 'safehouse-loadout',
    until: () => window.__heistDebug.snapshot().inventory.items[0] === 'carbine',
  });
  state = await snapshot();
  check('real hold interactions remove the physical gear and reveal the unpacked five-slot loadout',
    !state.presentation.armorVisible
      && !state.presentation.carbineVisible
      && state.inventory.items.slice(0, 4).join(',') === 'carbine,sidearm,mask,duffel',
    JSON.stringify({ presentation: state.presentation, inventory: state.inventory }));

  /* ---- owner note: "I cant switch inventory items" / "cant see whats in my hand" ---- */
  check('the loadout arrives with the carbine selected and drawn in frame',
    state.inventory.selected === 0
      && state.inventory.selectedItem === 'carbine'
      && state.inventory.handsShowing === 'carbine'
      && state.inventory.handsVisible
      && state.inventory.weaponName === 'CONTROLLED',
    JSON.stringify(state.inventory));
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(120);
  let after = await snapshot();
  check('a real number key changes the slot, the hands and the weapon together',
    after.inventory.selected === 1
      && after.inventory.selectedItem === 'sidearm'
      && after.inventory.handsShowing === 'sidearm'
      && after.inventory.handsVisible
      && after.inventory.weaponName === 'COMMANDER'
      && after.inventory.magazine === 10,
    JSON.stringify(after.inventory));
  const barSelected = await page.locator('#hotbar .slot.on').getAttribute('data-key');
  const barLabel = await page.locator('#hotbar .slot.on').getAttribute('aria-label');
  check('the on-screen bar highlights the slot the player actually chose',
    barSelected === '2' && /Commander sidearm/.test(barLabel ?? ''),
    JSON.stringify({ barSelected, barLabel }));
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(120);
  after = await snapshot();
  check('selecting the balaclava puts it in frame and takes the trigger away',
    after.inventory.selectedItem === 'mask'
      && after.inventory.handsShowing === 'mask'
      && after.inventory.selectedIsWeapon === false
      && after.inventory.weaponName === null,
    JSON.stringify(after.inventory));
  await page.keyboard.press('BracketLeft');
  await page.waitForTimeout(200);
  after = await snapshot();
  check('the bracket keys cycle the selection, skipping the empty slot',
    after.inventory.selected === 1 && after.inventory.selectedItem === 'sidearm',
    JSON.stringify(after.inventory));
  await page.dispatchEvent('#scene', 'wheel', { deltaY: 120 });
  await page.waitForTimeout(200);
  after = await snapshot();
  check('a wheel event is a second way to change hands',
    after.inventory.selected === 2 && after.inventory.selectedItem === 'mask',
    JSON.stringify(after.inventory));
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(100);
  await shot('02b-hands-carbine');

  await use('van-door');
  state = await snapshot();
  check('safehouse checkpoint is durable before the van ride',
    state.checkpoint === 'safehouse_ready' && state.state === 'VAN_APPROACH');
  state = await snapshot();
  check('the van ride uses a bounded interior and locks translation until arrival',
    state.phase === 'van' && state.geometry.colliders >= 5, JSON.stringify(state.geometry));

  /* ---- owner note: "In the van Im just standing here I cant pull the mask on" ----
   * This is the check that would have caught it: no debug interaction, no
   * teleport. Stand where the van puts you, look where it points you, press E. */
  await waitForTarget('van-cabin');
  const vanPrompt = await promptText();
  const vanTarget = await page.evaluate(() => window.__heistDebug.snapshot().currentInteraction);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  state = await snapshot();
  check('the mask can be pulled on from the seat, with the key the HUD names',
    state.state === 'MASKS_ON'
      && state.inventory.maskWorn === true
      && state.inventory.items[2] === 'zip_ties'
      && /balaclava/i.test(vanPrompt ?? ''),
    JSON.stringify({ vanPrompt, vanTarget, state: state.state, mask: state.inventory.maskWorn }));
  await shot('03-van-interior');
  /* And the doors, from the same seat: at 2.7 m of reach the rear door itself
   * was never in range either. */
  await waitForTarget('van-cabin');
  const doorPrompt = await promptText();
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__heistDebug.state === 'BANK_ENTRY',
    null, { timeout: 30000, polling: 300 });
  check('the doors open from the seat too, once the mask is down',
    /van doors/i.test(doorPrompt ?? ''), String(doorPrompt));

  state = await snapshot();
  check('bank entry starts a visible 2.75 second ballistic guard threat',
    state.state === 'BANK_ENTRY'
      && state.guardThreat.state === 'drawing'
      && state.guardThreat.remaining <= 2.75
      && !(await page.locator('#guard-threat').evaluate((element) => element.classList.contains('hidden'))),
    JSON.stringify(state.guardThreat));
  await shot('04a-bank-guard-threat');
  /* Every clock in this scene advances in the frame loop's clamped 0.05 s
   * step, and this rasteriser gives about one frame a second — so a 2.75 s
   * reaction window takes the better part of a minute of wall clock to expire.
   * Timeouts below are sized for that, not for a real machine. */
  await page.waitForFunction(() => {
    const s = window.__heistDebug.snapshot();
    return s.guardFailures === 1 && s.state === 'BANK_ENTRY' && s.phase === 'bank'
      && s.guardThreat.state === 'drawing';
  }, null, { timeout: 180000, polling: 500 });
  state = await snapshot();
  check('missing the guard window restarts at the bank threshold with a fresh threat',
    state.guardFailures === 1 && state.phase === 'bank' && state.guardThreat.remaining > 2.3,
    JSON.stringify(state.guardThreat));

  await page.keyboard.press('Digit1');
  /* Retry the shot: the guard's window keeps expiring and restarting while the
   * harness is between frames, so take the shot on a window we know is open. */
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.waitForFunction(() => {
      const s = window.__heistDebug.snapshot().guardThreat;
      return s.state === 'drawing' && s.remaining > 1.4;
    }, null, { timeout: 180000, polling: 400 });
    await pose('bank_guard');
    await page.mouse.click(640, 360);
    await page.waitForTimeout(300);
    if ((await page.evaluate(() => window.__heistDebug.state)) === 'LOBBY_CONTROL') break;
  }
  await page.waitForFunction(() => window.__heistDebug.state === 'LOBBY_CONTROL', null, { timeout: 30000 });
  state = await snapshot();
  check('a real left-click ballistic hit neutralizes the guard and plays the requested Prospect line',
    state.guardThreat.state === 'neutralized'
      && state.voice.spoken.includes('prospect_counterstrike'),
    JSON.stringify({ threat: state.guardThreat, spoken: state.voice.spoken.slice(-6) }));

  /* ---- owner note: "if I shoot people nothing happens" ---- */
  const lobbyBefore = (await snapshot()).hostages;
  check('the lobby is a room full of people, not sixteen props',
    lobbyBefore.total === 22 && state.geometry.bankCivilians === 22,
    JSON.stringify(lobbyBefore));

  /* ---- the hostage loop, one verb at a time, by real input ---- */
  await page.evaluate(() => window.__heistDebug.aimAt('hostage_2'));
  await waitForTarget('bank-civilian-2');
  await page.waitForFunction(() => {
    const s = window.__heistDebug.snapshot();
    return s.hostageStates[1] === 'pleading'
      && s.voice.spoken.some((id) => id.startsWith('hostage_plead'));
  }, null, { timeout: 120000, polling: 300 });
  state = await snapshot();
  check('aiming at somebody makes them react to the muzzle before anything is fired',
    state.hostageStates[1] === 'pleading'
      && state.hostagePoses[1] === 'pleading'
      && state.voice.spoken.some((id) => id.startsWith('hostage_plead')),
    JSON.stringify({
      state: state.hostageStates[1], pose: state.hostagePoses[1],
      spoken: state.voice.spoken.slice(-4),
    }));
  const hostagePrompt = await promptText();
  /* Every entry is `KEY — verb`, which is the owner's own wording: *"prompts
   * must clearly say E — to the ground, hold E — tie up"*. This assertion was
   * left behind when the prompt was rewritten to satisfy that, and still
   * demanded the old "F REASSURE · G TAKE · ZIP-TIE" phrasing — so it failed
   * on a string that is correct. It checks the KEY AND THE VERB of all four
   * now, which is the thing the note was actually about. */
  const advertises = (pattern) => pattern.test(hostagePrompt ?? '');
  check('the person under the crosshair advertises all four verbs, each with its key',
    advertises(/E — (?:to the ground|keep them down)/)
      && advertises(/HOLD E — (?:tie up|no ties left)/)
      && advertises(/F — talk them down/)
      && advertises(/G — take what they have/),
    String(hostagePrompt));
  await shot('04b-hostage-pleading');

  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => {
    const s = window.__heistDebug.snapshot().voice.spoken;
    return s.some((id) => id.startsWith('hostage_reassured'));
  }, null, { timeout: 60000, polling: 300 }).catch(() => {});
  state = await snapshot();
  check('F reassures the person you are aiming at, and they answer',
    state.voice.spoken.some((id) => id.startsWith('prospect_reassure'))
      && state.voice.spoken.some((id) => id.startsWith('hostage_reassured')),
    JSON.stringify(state.voice.spoken.slice(-6)));

  for (let attempt = 0; attempt < 6; attempt++) {
    if ((await snapshot()).hostageStates[1] === 'prone') break;
    await waitForTarget('bank-civilian-2');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
  }
  state = await snapshot();
  check('tapping E puts them on their knees and then flat on the floor',
    state.hostageStates[1] === 'prone' && state.hostagePoses[1] === 'prone',
    JSON.stringify({ state: state.hostageStates[1], pose: state.hostagePoses[1] }));

  const tiesBefore = state.inventory.zipTies;
  await holdE(() => window.__heistDebug.snapshot().hostageStates[1] === 'restrained');
  state = await snapshot();
  check('holding E zip-ties them, spends a tie, and the pose changes to match',
    state.hostageStates[1] === 'restrained'
      && state.hostagePoses[1] === 'restrained'
      && state.inventory.zipTies === tiesBefore - 1
      && state.hostages.restrained >= 1,
    JSON.stringify({ ties: state.inventory.zipTies, hostages: state.hostages }));

  await page.evaluate(() => window.__heistDebug.aimAt('hostage_4'));
  await waitForTarget('bank-civilian-4');
  await page.waitForFunction(() => window.__heistDebug.snapshot().hostageStates[3] === 'pleading',
    null, { timeout: 60000, polling: 300 });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(900);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(900);
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await snapshot()).hostages.robbed >= 1) break;
    await page.keyboard.press('KeyG');
    await page.waitForTimeout(900);
  }
  state = await snapshot();
  check('G takes what somebody has on them, and the crew says so',
    state.hostages.robbed >= 1
      && state.hostages.personalCashTaken > 0
      && state.objective.hostagesRobbed >= 1
      && state.objective.followedSnow === false
      && state.voice.spoken.includes('prospect_demand'),
    JSON.stringify({ hostages: state.hostages, spoken: state.voice.spoken.slice(-6) }));
  check('cash taken off a customer is booked as compromised, not as take',
    state.bags.compromisedCash >= state.hostages.personalCashTaken,
    JSON.stringify(state.bags));

  const lobbyLine = await page.locator('#lobby-readout').textContent();
  check('the objective spine is on screen while it can still be changed',
    /\/ 22 DOWN/.test(lobbyLine ?? '')
      && /TIES/.test(lobbyLine ?? '')
      && /NOBODY HURT/.test(lobbyLine ?? ''),
    String(lobbyLine));

  /* ---- a civilian casualty is permanent, visible, and costs the verdict ---- */
  const beforeCasualty = await snapshot();
  await page.evaluate(() => window.__heistDebug.shootHostage('hostage_7'));
  await page.waitForTimeout(250);
  state = await snapshot();
  check('a round into a customer drops them, is counted, and loses fire discipline',
    state.objective.civilianCasualties === beforeCasualty.objective.civilianCasualties + 1
      && state.hostageStates[6] === 'down'
      && state.hostagePoses[6] === 'fallen'
      && state.objective.disciplinedFire === false
      && state.objective.civiliansSafe === 21
      && state.objective.grade === 'costly_success',
    JSON.stringify(state.objective));
  const casualtyLine = await page.locator('#lobby-readout .casualties').textContent();
  check('the casualty count is on the HUD the moment it happens',
    /1 CIVILIAN DOWN/.test(casualtyLine ?? ''), String(casualtyLine));

  await use('bank-crowd');
  state = await snapshot();
  check('the room-wide order still exists and puts everybody who is left on the floor',
    state.hostages.controlled >= 20 && new Set(state.hostagePoses).size >= 3,
    JSON.stringify({ controlled: state.hostages.controlled, poses: [...new Set(state.hostagePoses)] }));
  await pose('bank_lobby');
  await shot('04-bank-lobby');
  await use('bank-rear-guard');
  await use('bank-manager');
  const managerStart = (await snapshot()).managerPosition;
  await page.waitForFunction(() => window.__heistDebug.snapshot().managerEscortProgress >= 1, null, { timeout: 180000, polling: 500 });
  state = await snapshot();
  check('bank-secured checkpoint records the real casualty count while the manager walks',
    state.checkpoint === 'bank_secured'
      && state.campaignMission.civiliansHarmed === 1
      && Math.hypot(state.managerPosition[0] - managerStart[0], state.managerPosition[2] - managerStart[2]) > 4,
    JSON.stringify({ harmed: state.campaignMission.civiliansHarmed, start: managerStart, end: state.managerPosition }));
  await use('vault-door');
  await use('vault-door');
  await pose('bank_vault');
  await shot('05-vault');
  await use('cash-1');
  await use('bank-exit');
  await use('cash-2');
  await use('bank-exit');
  await use('bank-exit');

  state = await snapshot();
  const policeBeforeFailure = state.policeTotal;
  check('street contact spawns a bounded first wave of modelled officers',
    state.phase === 'street' && state.checkpoint === 'street_withdrawal'
      && state.policeActive > 0 && state.policeActive <= 8
      && state.scale.police.every((height) => height >= 1.7 && height <= 1.9),
    JSON.stringify({ active: state.policeActive, total: state.policeTotal, heights: state.scale.police }));
  await page.evaluate(() => window.__heistDebug.poseForEvidence('bank_exit'));
  await shot('06-bank-exit');
  await page.evaluate(() => window.__heistDebug.poseForEvidence('downtown_firefight'));
  await shot('07-downtown-firefight');
  await page.evaluate(() => window.__heistDebug.fail('browser_restore_probe'));
  await page.waitForFunction(() => window.__heistDebug.state === 'STREET_BLOCK_ONE', null, { timeout: 60000, polling: 400 });
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
    state.state === 'PLAYER_TAKES_WHEEL' && state.bags.recoveredBags >= 8);

  /* ---- owner note: "the instructions tell you to go left but the road is right" ---- */
  const plan = await page.evaluate(() => window.__heistDebug.routePlan());
  check('the drive is six authored junctions in the order the calls give them',
    plan.map((node) => node.id).join(',')
      === 'garage_left,warehouse_left,tower_right,roadblock,canal_turn,industrial_swap'
      && plan.map((node) => node.turn).join(',') === 'left,left,right,straight,left,stop',
    JSON.stringify(plan.map((node) => `${node.id}:${node.turn}`)));
  check('every junction label names the direction the road actually turns',
    plan.every((node) => (node.turn === 'left' ? node.label.startsWith('LEFT') : true))
      && plan.every((node) => (node.turn === 'right' ? node.label.startsWith('RIGHT') : true)),
    JSON.stringify(plan.map((node) => node.label)));
  const routeLabel = await page.locator('#route').textContent();
  check('the drive opens on the first instruction rather than a stale caption',
    routeLabel === plan[0].label, String(routeLabel));

  /* Real throttle: prove the key reaches the car, then step the physics at a
   * fixed rate because this rasteriser cannot render fast enough to measure it. */
  await page.mouse.click(640, 400);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(150);
  const inputState = await page.evaluate(() => window.__heistDebug.inputState());
  const drive = await page.evaluate(() => window.__heistDebug.simulateDriving(4));
  await page.keyboard.up('KeyW');
  check('real throttle input reaches the escape car and it accelerates like a car',
    inputState.keys.includes('KeyW') && inputState.driving
      && drive.ok && drive.mph >= 45,
    JSON.stringify({ keys: inputState.keys, mph: drive.mph?.toFixed?.(1) }));
  await shot('09-player-driving');

  /* ---- owner note: "do blocked roads so you just have to stay on the road" ---- */
  const HEADINGS = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };
  const TURNED = {
    N: { left: 'E', right: 'W' }, E: { left: 'S', right: 'N' },
    S: { left: 'W', right: 'E' }, W: { left: 'N', right: 'S' },
  };
  const barrierResults = [];
  for (const node of plan.slice(0, 5)) {
    const wrong = node.turn === 'straight'
      ? TURNED[node.heading].left
      : TURNED[node.heading][node.turn === 'left' ? 'right' : 'left'];
    await page.evaluate(([x, z, heading]) => window.__heistDebug.placeCar(x, z, heading),
      [node.x, node.z, HEADINGS[wrong]]);
    const run = await page.evaluate(() => window.__heistDebug.simulateDriving(3.2));
    const travelled = Math.hypot(run.x - node.x, run.z - node.z);
    barrierResults.push({ node: node.id, wrong, travelled: Number(travelled.toFixed(1)) });
  }
  check('every wrong turn out of a junction runs into something within 30 m',
    barrierResults.every((entry) => entry.travelled < 30),
    JSON.stringify(barrierResults));

  await page.evaluate(() => window.__heistDebug
    .placeCar(-480, 22, 0, { resetRoute: true, resetDamage: true }));
  const routeStates = [];
  for (let i = 0; i < 6; i++) {
    routeStates.push(await page.evaluate(() => window.__heistDebug.driveToNextNode()));
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => window.__heistDebug.state === 'VEHICLE_SWAP',
    null, { timeout: 30000, polling: 300 });
  state = await snapshot();
  check('the authored drive crosses every turn, the roadblock, and the canal node',
    routeStates.map((entry) => entry.node).join(',')
      === 'garage_left,warehouse_left,tower_right,roadblock,canal_turn,industrial_swap'
      && state.state === 'VEHICLE_SWAP',
    JSON.stringify({ nodes: routeStates.map((entry) => entry.node), state: state.state }));
  check('the fixed-step vehicle carries roadblock damage into the swap',
    state.vehicle.collisionDamage > 0 && state.vehicle.lastStableNode === 'industrial_swap',
    JSON.stringify({ damage: state.vehicle.collisionDamage, node: state.vehicle.lastStableNode }));

  /* ---- owner note: "If you make it to the end you lose the cops too" ---- */
  await page.waitForFunction(
    () => window.__heistDebug.snapshot().voice.spoken.includes('snow_lost_them'),
    null, { timeout: 60000, polling: 300 },
  ).catch(() => {});
  state = await snapshot();
  check('reaching the swap loses the pursuit, on screen and out loud',
    state.vehicle.pursuitVisible === false
      && state.voice.spoken.includes('snow_lost_them'),
    JSON.stringify({ visible: state.vehicle.pursuitVisible, spoken: state.voice.spoken.slice(-5) }));
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

  /* ---- owner note: "everyone is just waiting for me... not sure what the debrief is" ---- */
  const debriefSteps = [];
  debriefSteps.push(await pressAtPose('armor', {
    target: 'safehouse-armor',
    until: () => window.__heistDebug.state === 'FIRST_AID',
  }));
  debriefSteps.push(await pressAtPose('briefing', {
    target: 'briefing-map',
    until: () => window.__heistDebug.state === 'DEBRIEF',
  }));
  await page.waitForTimeout(400);
  state = await snapshot();
  const boardText = await page.locator('#debrief-board').textContent();
  check('the debrief is a numbered sequence with its steps on the HUD',
    debriefSteps.every((label) => /\d\/4/.test(label ?? '')),
    JSON.stringify(debriefSteps));
  check('the debrief board states both objective numbers and a verdict in the room',
    !(await page.locator('#debrief-board').evaluate((el) => el.classList.contains('hidden')))
      && /Civilians out alive/.test(boardText ?? '')
      && /21 \/ 22/.test(boardText ?? '')
      && /Vault bags recovered/.test(boardText ?? '')
      && /Taken off customers/.test(boardText ?? '')
      && /COSTLY SUCCESS/.test(boardText ?? ''),
    String(boardText).replace(/\s+/g, ' ').slice(0, 240));
  /* Spoken OR still sequenced: a seventeen-line debrief is a minute of speech,
   * and the point of the check is that none of it is dropped. The old bank
   * pushed all of it in one frame into a four-deep queue and lost ten lines. */
  const debriefSaid = [...state.voice.spoken, ...state.voice.queued];
  check('the whole debrief is scheduled — nothing is dropped on the floor',
    debriefSaid.includes('shubes_signature_cleanup')
      && debriefSaid.includes('snow_good')
      && debriefSaid.includes('prospect_debrief')
      && state.voice.queued.length + state.voice.spoken.length > 0,
    JSON.stringify(state.voice.queued));
  check('Big Uncle Lou frames the debrief and says both objective numbers back',
    debriefSaid.includes('lou_debrief_open')
      && debriefSaid.includes('lou_debrief_people_dirty')
      && debriefSaid.some((id) => id.startsWith('lou_debrief_money'))
      && debriefSaid.includes('lou_debrief_souvenirs')
      && debriefSaid.includes('lou_debrief_verdict_bad'),
    JSON.stringify(debriefSaid.filter((id) => id.startsWith('lou_'))));
  const louRadioScheduled = new Set([
    ...state.voice.spoken,
    ...state.voice.busQueued,
    state.voice.busCurrent,
    ...state.voice.commandBacklog,
  ].filter(Boolean));
  check('Lou is on the job as well as at the end of it',
    ['lou_radio_open', 'lou_radio_lobby', 'lou_radio_vault', 'lou_radio_street']
      .every((id) => louRadioScheduled.has(id)),
    JSON.stringify({
      spoken: state.voice.spoken.filter((id) => id.startsWith('lou_radio')),
      current: state.voice.busCurrent,
      queued: state.voice.busQueued.filter((id) => id.startsWith('lou_radio')),
      backlog: state.voice.commandBacklog.filter((id) => id.startsWith('lou_radio')),
    }));
  await shot('11-safehouse-money-count');
  await use('safehouse-loadout');
  await use('van-door');
  await page.waitForFunction(() => window.__heistDebug.snapshot().missionCompleted, null, { timeout: 60000, polling: 400 });
  state = await snapshot();
  check('THE TAKE completes and writes an honest verdict into the campaign',
    state.state === 'SCENE_COMPLETE'
      && state.campaignMission.status === 'complete'
      && state.campaignMission.outcome === 'costly_success'
      && state.campaignMission.disciplinedFire === false
      && state.campaignMission.followedSnow === false
      && state.campaignMission.civiliansHarmed === 1,
    JSON.stringify({
      outcome: state.campaignMission.outcome,
      disciplined: state.campaignMission.disciplinedFire,
      followed: state.campaignMission.followedSnow,
      harmed: state.campaignMission.civiliansHarmed,
    }));
  const cardText = await page.locator('#mission-card').textContent();
  check('the end card reads people first, money second, then the settlement',
    /Civilians out alive/.test(cardText ?? '')
      && (cardText ?? '').indexOf('Civilians out alive') < (cardText ?? '').indexOf('Vault bags recovered')
      && /COSTLY SUCCESS/.test(cardText ?? '')
      && /Compromised cash/.test(cardText ?? ''),
    String(cardText).replace(/\s+/g, ' ').slice(0, 220));
  check('preview play leaves canonical localStorage byte-for-byte untouched',
    await page.evaluate((value) => localStorage.getItem('squatchlife.campaign') === value, SENTINEL));

  const apartmentState = structuredClone(state.campaignState);
  apartmentState.scene = { id: 'apartment', spawn: 'front_door' };
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
  await page.waitForURL(/\/index\.html(?:\?|$)/, { timeout: 20000 });
  check('the completion card return control navigates to the apartment',
    new URL(page.url()).pathname.endsWith('/index.html'), page.url());

  /* The preview router correctly preserves `?preview=1`; remove that testing
   * isolation flag in the same tab so the seeded completed campaign becomes
   * the production Apartment state we are validating below. */
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  const apartmentPage = page;
  await apartmentPage.waitForFunction(() => window.__squatch?.apartment?.dressing, null, { timeout: 120000 });
  let apartment = await apartmentPage.evaluate(() => ({
    prep: ['heistArmor', 'heistGloves', 'heistMask', 'heistCarbine', 'heistSidearm', 'heistMagazines', 'heistDuffel']
      .map((id) => window.__squatch.apartment.dressing.get(id).group.visible),
    cleanup: ['heistWash', 'heistChange', 'heistGearSecured']
      .map((id) => window.__squatch.apartment.dressing.get(id).group.visible),
    targets: window.__squatch.interaction.targets.map((target) => target.name),
  }));
  /* The dressing's interaction targets carry a `dress:` prefix on their names
   * — `src/world/dressing.js` builds every one of them as `group('dress:' +
   * id)` — while the dressing MAP is still keyed by the bare id. This lookup
   * only ever knew the bare form, so it failed on a flat that was dressed
   * correctly, and the follow-up `find()` below returned undefined and threw.
   * Accepts either spelling rather than pinning one. */
  const dressed = (id) => apartment.targets.includes(id) || apartment.targets.includes(`dress:${id}`);
  check('post-heist apartment hides packed gear and exposes three physical cleanup stations',
    apartment.prep.every((visible) => !visible)
      && apartment.cleanup.every(Boolean)
      && ['heistWash', 'heistChange', 'heistGearSecured'].every(dressed),
    JSON.stringify(apartment));
  const apartmentStartAt = Date.now();
  await apartmentPage.evaluate(() => document.getElementById('start-btn').click());
  let apartmentAudio = null;
  for (let elapsed = 0; elapsed < 120 && !apartmentAudio?.started; elapsed++) {
    await apartmentPage.waitForTimeout(1000);
    apartmentAudio = await apartmentPage.evaluate(() => ({
      started: window.__squatch?.game?.started === true,
      buffers: window.__squatch?.audio?.buffers?.size ?? 0,
      loaded: window.__squatch?.audio?.loadedCount ?? 0,
      context: window.__squatch?.audio?.ctx?.state ?? null,
    }));
  }
  apartmentAudio.elapsedMs = Date.now() - apartmentStartAt;
  /* 150 s rather than the Apartment's own 30 s budget: the same start gate,
   * measured through a software rasteriser running at about one frame a
   * second. This bound is about the harness, not about the Apartment. */
  check('post-heist Apartment completes its recorded-audio start gate',
    apartmentAudio.started && apartmentAudio.elapsedMs <= 150000,
    JSON.stringify(apartmentAudio));
  if (!apartmentAudio.started) throw new Error(`Apartment audio start stalled: ${JSON.stringify(apartmentAudio)}`);
  await apartmentPage.evaluate(() => {
    for (const name of ['heistWash', 'heistChange', 'heistGearSecured']) {
      // Either spelling — see the `dress:` note above.
      const target = window.__squatch.interaction.targets
        .find((item) => item.name === name || item.name === `dress:${name}`);
      if (!target) throw new Error(`no cleanup station named ${name} or dress:${name}`);
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
      && apartment.door.destination === 'silver_case',
    JSON.stringify(apartment));
  await apartmentPage.screenshot({ path: path.join(SHOTS, '13-apartment-cleanup-complete.png') });
  await apartmentPage.close();

  /* ---- a clean run, to prove the good ending is reachable ---- */
  const cleanPage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  cleanPage.on('pageerror', (error) => problems.push(`clean: ${error.message}`));
  await cleanPage.addInitScript((value) => {
    localStorage.setItem('squatchlife.campaign', value);
  }, SENTINEL);
  await cleanPage.goto(`http://localhost:${PORT}/heist.html?preview=1&checkpoint=safehouse_debrief`, { waitUntil: 'load' });
  await cleanPage.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 60000 });
  await cleanPage.evaluate(() => document.getElementById('start').click());
  await cleanPage.waitForFunction(() => window.__heistDebug.snapshot().phase === 'safehouse', null, { timeout: 60000 });
  const cleanState = await cleanPage.evaluate(() => {
    const snap = window.__heistDebug.snapshot();
    return { grade: snap.objective.grade, scorecard: snap.objective.scorecard };
  });
  check('a run with nobody hurt and nothing taken off a customer grades professional',
    cleanState.grade === 'professional'
      && cleanState.scorecard.every((row) => row.good),
    JSON.stringify(cleanState));
  await cleanPage.close();

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
    await resumePage.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 60000 });
    await resumePage.evaluate(() => document.getElementById('start').click());
    await resumePage.waitForFunction(([stateName, phaseName]) => {
      const s = window.__heistDebug?.snapshot();
      return s?.state === stateName && s?.phase === phaseName;
    }, [expectedState, expectedPhase], { timeout: 60000 });
    let resumedState = await resumePage.evaluate(() => window.__heistDebug.snapshot());
    const initialOk = resumedState.checkpoint === checkpointId
      && resumedState.geometry.colliders > 0
      && resumedState.geometry.floorZones > 0
      && (expectedPhase !== 'bank' || resumedState.inventory.maskWorn === true);
    await resumePage.evaluate(() => window.__heistDebug.fail('reload_recovery_probe'));
    await resumePage.waitForFunction(() => window.__heistDebug.state === 'FAILED', null, { timeout: 30000 });
    await resumePage.waitForFunction((stateName) => window.__heistDebug.state === stateName,
      expectedState, { timeout: 60000 });
    resumedState = await resumePage.evaluate(() => window.__heistDebug.snapshot());
    if (initialOk && resumedState.checkpoint === checkpointId) resumed++;
    else console.log(`    resume ${checkpointId} failed: ${JSON.stringify({ initialOk, checkpoint: resumedState.checkpoint })}`);
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
