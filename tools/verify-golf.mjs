#!/usr/bin/env node
/**
 * Play Silver Pines headlessly, from the car park through all three holes.
 *
 *   node tools/verify-golf.mjs        (npm run verify:golf)
 *
 * Same reasoning as verify-silver.mjs. A golf hole is a physics system wired
 * to a conversation, and almost everything that can go wrong with it is
 * invisible to a syntax check:
 *
 *   - the ball comes to rest half a metre under the green;
 *   - the drop after a water ball lands him back in the water;
 *   - an NPC's authored tee shot misses the bunker it is supposed to find;
 *   - the number keys take a driver out while he is answering Lou;
 *   - the hole cannot end because somebody's ball never stopped;
 *   - a putt on a green that slopes one way in the renderer and the other in
 *     the physics.
 *
 * So this drives the real systems in a real browser: it walks to the tee, sits
 * through the conversation, watches three men hit, hits, takes the cart, putts
 * out and reads the card. It steps the update functions directly rather than
 * waiting on frames, because software rendering runs at about a frame a second
 * and the point here is the logic.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5219;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the round.');
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
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });

const problems = [];
page.on('pageerror', (e) => problems.push(`${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 240)); });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nSilver Pines — Full Round\n');

const GOLF_URL = `http://localhost:${PORT}/golf.html?preview=1`;
await page.goto(GOLF_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__golfReady === true', null, { timeout: 60000 });
let startError = '';
try {
  await page.locator('#start-btn').click({ timeout: 2000 });
  await page.waitForFunction(
    'document.getElementById("overlay").classList.contains("hidden")',
    null,
    { timeout: 5000 },
  );
} catch (error) {
  startError = error.message;
  /* Keep the remainder of the verifier useful while this assertion reports
   * the real UI regression. The direct hook is recovery, not the tested path. */
  await page.evaluate('window.__golf.boot()');
}
check('1a. the visible start button enters the round', !startError,
  startError ? startError.split('\n')[0] : 'opening card dismissed');
await page.waitForFunction('window.__golf.round.beat !== undefined', null, { timeout: 30000 });

const beforePause = await page.evaluate(() => ({
  beat: window.__golf.round.beat,
  x: window.__golf.player.position.x,
  z: window.__golf.player.position.z,
}));
await page.keyboard.press('Tab');
await page.waitForTimeout(120);
const tabPause = await page.evaluate(() => ({
  paused: window.__scenePause?.isPaused() ?? false,
  visible: !document.querySelector('[data-scene-pause]')?.classList.contains('hidden'),
  objective: document.querySelector('[data-scene-pause-objective]')?.textContent?.trim() || '',
  beat: window.__golf.round.beat,
  x: window.__golf.player.position.x,
  z: window.__golf.player.position.z,
}));
check('1b. Tab opens a pause screen with the current instructions',
  tabPause.paused && tabPause.visible && tabPause.objective.length > 0,
  JSON.stringify(tabPause));
check('1c. pausing does not advance or move the round',
  tabPause.beat === beforePause.beat && tabPause.x === beforePause.x && tabPause.z === beforePause.z,
  JSON.stringify({ beforePause, tabPause }));
await page.keyboard.press('Tab');
await page.waitForTimeout(120);
const resumedFromTab = await page.evaluate(() => ({
  paused: window.__scenePause?.isPaused() ?? true,
  hidden: document.querySelector('[data-scene-pause]')?.classList.contains('hidden') ?? false,
}));
check('1d. Tab returns control to the round',
  !resumedFromTab.paused && resumedFromTab.hidden,
  JSON.stringify(resumedFromTab));

/* Shared HUD visibility fades in; assert the settled player-facing state,
 * not an arbitrary point inside its 400 ms presentation transition. */
await page.waitForTimeout(450);
const openingGuide = await page.evaluate(() => {
  const g = window.__golf;
  g.camera.updateMatrixWorld();
  const forward = new g.player.position.constructor();
  g.camera.getWorldDirection(forward);
  const toBag = new g.player.position.constructor(
    g.LAYOUT.lot.bag.x - g.camera.position.x,
    0,
    g.LAYOUT.lot.bag.z - g.camera.position.z,
  ).normalize();
  const guide = document.getElementById('golf-guide');
  const waypoint = document.getElementById('golf-waypoint');
  return {
    hudOpacity: Number(getComputedStyle(document.getElementById('hud')).opacity),
    guideVisible: !!guide && !guide.classList.contains('hidden'),
    task: guide?.querySelector('.task')?.textContent?.trim() || '',
    detail: guide?.querySelector('.detail')?.textContent?.trim() || '',
    waypointVisible: !!waypoint && !waypoint.classList.contains('hidden'),
    waypointLabel: waypoint?.querySelector('.label')?.textContent?.trim() || '',
    facingBag: forward.dot(toBag),
  };
});
check('1e. control opens facing the group and the golf bag',
  openingGuide.facingBag > 0.75,
  `camera/target alignment ${openingGuide.facingBag.toFixed(2)}`);
check('1e2. the gameplay HUD is actually visible after control begins',
  openingGuide.hudOpacity > 0.9,
  `computed opacity ${openingGuide.hudOpacity}`);
check('1f. the first required action stays visible without opening a menu',
  openingGuide.guideVisible
    && /golf bag/i.test(`${openingGuide.task} ${openingGuide.detail}`)
    && /press e/i.test(openingGuide.detail),
  JSON.stringify(openingGuide));
check('1g. the golf bag has a visible waypoint from spawn',
  openingGuide.waypointVisible && /golf bag/i.test(openingGuide.waypointLabel),
  JSON.stringify(openingGuide));

const blockedBall = await page.evaluate(() => {
  const g = window.__golf;
  const start = { x: g.player.position.x, z: g.player.position.z };
  const b = g.round.playerBall.position;
  g.teleport(b.x, b.z + 1);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  const feedback = [...document.querySelectorAll('#toast-stack .toast')]
    .map((el) => el.textContent.trim()).join(' | ');
  g.teleport(start.x, start.z);
  return feedback;
});
check('1h. trying the ball early explains the missing prerequisite',
  /bag/i.test(blockedBall), blockedBall || 'no feedback');

/* ------------------------------------------------------------------ */
/* 1–4 · the scene, the cast, the bag                                  */
/* ------------------------------------------------------------------ */

check('1. scene loads with no console errors', problems.length === 0, problems.slice(0, 2).join(' | '));

const world = await page.evaluate(() => {
  const g = window.__golf;
  return {
    golfers: Object.keys(g.golfers),
    trees: g.course.treeCount,
    beat: g.round.beat,
    hasCourse: !!g.course.mesh,
    clubs: Object.keys(g.round.balls.constructor === Map ? {} : {}),
  };
});
check('3. all four characters are in the scene',
  world.golfers.length === 3 && world.hasCourse,
  `${world.golfers.join(', ')} + the first-person Prospect`);

const audioBank = await page.evaluate(async () => {
  const g = window.__golf;
  const { CUES } = await import('/src/golf/script.js');
  const { GOLF_EFFECT_CUES, GOLF_LATER_AUDIO_SCOPES } = await import('/src/golf/audio.js');
  await Promise.all(GOLF_LATER_AUDIO_SCOPES.map((scope) => g.audio.loadAdditional(scope)));
  const manifest = g.audio.manifest.sfx || [];
  const names = new Set(manifest.map((cue) => cue.name));
  const expectedVoices = Object.keys(CUES).map((id) => `vo.${id}`);
  const golfNames = new Set([...expectedVoices, ...GOLF_EFFECT_CUES]);
  const available = g.audio._availableFiles || new Set();
  const indexed = manifest.filter((cue) => golfNames.has(cue.name)
    && available.has(cue.file || `${cue.name}.mp3`));
  return {
    voices: expectedVoices.filter((name) => names.has(name)).length,
    expectedVoices: expectedVoices.length,
    missingEffects: GOLF_EFFECT_CUES.filter((name) => !names.has(name)),
    missingDecoded: indexed.filter((cue) => !g.audio.buffers.has(cue.name)).map((cue) => cue.name),
  };
});
check('3b. the scene loads its complete recordable audio catalog and indexed takes',
  audioBank.voices === audioBank.expectedVoices && audioBank.missingEffects.length === 0
    && audioBank.missingDecoded.length === 0,
  `${audioBank.voices}/${audioBank.expectedVoices} voice cues; ${audioBank.missingEffects.length} missing effects; ${audioBank.missingDecoded.length} indexed takes not decoded`);

const bagCheck = await page.evaluate(() => {
  const g = window.__golf;
  const before = g.round.hasBag;
  g.round.takeBag();
  const slots = [...document.querySelectorAll('#hotbar .slot')];
  return {
    before,
    after: g.round.hasBag,
    slots: slots.length,
    labels: slots.slice(0, 3).map((slot) => slot.getAttribute('aria-label')),
  };
});
check('4. the bag holds a driver, an iron and a putter',
  !bagCheck.before && bagCheck.after);
check('4a. the shared inventory stays five slots wide',
  bagCheck.slots === 5 && bagCheck.labels.join(',') === 'Driver,Iron,Putter',
  `${bagCheck.slots} slots · ${bagCheck.labels.join(', ')}`);

await page.waitForTimeout(100);
const teeGuide = await page.evaluate(() => {
  const guide = document.getElementById('golf-guide');
  const waypoint = document.getElementById('golf-waypoint');
  return {
    task: guide?.querySelector('.task')?.textContent?.trim() || '',
    detail: guide?.querySelector('.detail')?.textContent?.trim() || '',
    waypointLabel: waypoint?.querySelector('.label')?.textContent?.trim() || '',
  };
});
check('4c. picking up the bag immediately redirects the player to the first tee',
  /first tee/i.test(`${teeGuide.task} ${teeGuide.detail}`)
    && /first tee/i.test(teeGuide.waypointLabel),
  JSON.stringify(teeGuide));

const clubList = await page.evaluate(async () => {
  const m = await import('/src/golf/clubs.js');
  return m.CLUB_IDS;
});
check('4b. three clubs and no more', clubList.join(',') === 'driver,iron,putter', clubList.join(', '));

/* ------------------------------------------------------------------ */
/* 2 · walk to the tee                                                 */
/* ------------------------------------------------------------------ */

const reachedTee = await page.evaluate(async () => {
  const g = window.__golf;
  // Skip the arrival conversation the way a player does: by answering it.
  for (let i = 0; i < 400 && g.dialogue.active; i++) {
    if (g.dialogue.options.length) g.dialogue.choose(0);
    g.step(0.1);
  }
  const t = g.LAYOUT.teeMarks.ball;
  g.audio.clearPlaybackLog();
  g.teleport(t.x, t.z + 4);
  g.player.clearKeys();
  g.player.setKey('KeyW', true);
  for (let i = 0; i < 20; i++) g.player.update(0.1);
  g.player.setKey('KeyW', false);
  const footsteps = g.audio.playbacks
    .filter(({ name }) => name.startsWith('footstep.'))
    .map(({ name }) => name);
  g.teleport(t.x, t.z + 4);
  for (let i = 0; i < 3000; i++) {
    g.step(0.1);
    if (g.round.beat === 'npc_tee' || g.round.beat === 'player_tee') break;
    if (g.dialogue.active && g.dialogue.options.length) {
      /* Replies require arm's-reach proximity. The tee marker is farther from
       * Lou than that, so walk the harness to the actual speaker before using
       * the same choose() path as a player. */
      const lou = g.golfers.lou.position;
      g.teleport(lou.x, lou.z);
      g.dialogue.update(0, g.player.position);
      g.dialogue.choose(0);
    }
  }
  return {
    beat: g.round.beat,
    heardInvitation: g.round.heardInvitation,
    wait: g.round._wait,
    step: g.round._step,
    cue: g.cues.current?.id ?? null,
    queued: g.cues.queue.length,
    dialogue: g.dialogue.active,
    options: g.dialogue.options.length,
    footsteps,
  };
});
check('2. the player can reach the first tee',
  ['tee_talk', 'npc_tee', 'player_tee'].includes(reachedTee.beat), JSON.stringify(reachedTee));
check('2a. walking the live Player produces course-surface footsteps',
  reachedTee.footsteps.some((name) => name === 'footstep.grass'),
  reachedTee.footsteps.join(', ') || 'no footsteps');
check('22. dialogue choices work and are recorded',
  reachedTee.heardInvitation === true, 'answered "You needed a fourth"');

/* ------------------------------------------------------------------ */
/* 23 · the input rule                                                 */
/* ------------------------------------------------------------------ */

const keyRule = await page.evaluate(async () => {
  const m = await import('/src/golf/dialogue.js');
  return {
    withOptions: m.numberKeyOwner({ active: true, options: [1, 2, 3] }),
    without: m.numberKeyOwner({ active: true, options: [] }),
    inactive: m.numberKeyOwner(null),
  };
});
check('23. number keys never select a club during dialogue',
  keyRule.withOptions === 'dialogue' && keyRule.without === 'clubs' && keyRule.inactive === 'clubs');

/* ------------------------------------------------------------------ */
/* 19 · the three authored tee shots                                   */
/* ------------------------------------------------------------------ */

const npcShots = await page.evaluate(async () => {
  const { solveShot } = await import('/src/golf/ball.js');
  const { SURFACE_PROPS, toFeet } = await import('/src/golf/course.js');
  const { surfaceAt } = await import('/src/golf/field.js');
  const H = await import('/src/golf/hole1.js');
  const from = { x: H.TEE_MARKS.ball.x, z: H.TEE_MARKS.ball.z };
  const lie = SURFACE_PROPS[surfaceAt(from.x, from.z)];
  const out = {};
  for (const [who, spec] of Object.entries(H.NPC_TEE_SHOTS)) {
    const r = solveShot({ from, target: spec.target, club: spec.club, lie, loftBias: spec.loftBias });
    out[who] = {
      finish: r.surface,
      landing: r.landing?.surface ?? null,
      feet: toFeet(Math.hypot(r.landedAt.x - H.PIN.x, r.landedAt.z - H.PIN.z)),
      error: r.error,
    };
  }
  return out;
});
check('19a. Eric hits the middle of the green',
  npcShots.eric.finish === 'green' && npcShots.eric.feet < 30,
  `${npcShots.eric.feet.toFixed(0)} ft`);
check('19b. Rippin finds the front bunker',
  npcShots.rippinflow.finish === 'bunker', npcShots.rippinflow.finish);
check('19c. Lou lands short and releases onto the green',
  npcShots.lou.finish === 'green' && npcShots.lou.landing !== 'green'
  && npcShots.lou.feet < npcShots.rippinflow.feet,
  `lands on ${npcShots.lou.landing}, finishes ${npcShots.lou.feet.toFixed(0)} ft — inside Rippin's ${npcShots.rippinflow.feet.toFixed(0)} ft`);

const npcPlayed = await page.evaluate(() => {
  const g = window.__golf;
  for (let i = 0; i < 4000 && g.round.beat === 'npc_tee'; i++) {
    g.round.skipRequested = true;
    g.step(0.05);
  }
  return {
    beat: g.round.beat,
    strokes: ['lou', 'rippinflow', 'eric'].map((id) => g.round.card.hole(id, 1).strokes),
  };
});
check('19. all three NPC tee shots complete',
  npcPlayed.beat === 'player_tee' && npcPlayed.strokes.every((s) => s === 1),
  `beat: ${npcPlayed.beat}, strokes: ${npcPlayed.strokes.join('/')}`);

const hotbarSelection = await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));
  const selected = document.querySelector('#hotbar .slot.on');
  const result = { club: window.__golf.club, key: selected?.dataset.key ?? null };
  window.__golf.setClub('iron');
  return result;
});
check('4d. club number keys and the shared inventory selection stay in sync',
  hotbarSelection.club === 'driver' && hotbarSelection.key === '1',
  `${hotbarSelection.club} · slot ${hotbarSelection.key}`);

await page.waitForTimeout(100);
const playerTurnGuide = await page.evaluate(() => {
  const guide = document.getElementById('golf-guide');
  const waypoint = document.getElementById('golf-waypoint');
  return {
    text: guide?.textContent?.trim() || '',
    waypointLabel: waypoint?.querySelector('.label')?.textContent?.trim() || '',
  };
});
check('19d. the HUD clearly announces the player turn and marks the ball',
  /your tee shot|take your tee shot/i.test(playerTurnGuide.text)
    && /press e/i.test(playerTurnGuide.text)
    && /your ball/i.test(playerTurnGuide.waypointLabel),
  JSON.stringify(playerTurnGuide));

/* ------------------------------------------------------------------ */
/* 5–12 · the swing and the ball                                       */
/* ------------------------------------------------------------------ */

const address = await page.evaluate(() => {
  const g = window.__golf;
  const b = g.round.playerBall.position;
  g.teleport(b.x, b.z + 1);
  const ok = g.enterAddress();
  return { ok, mode: g.camMode, canAddress: g.round.canAddress() };
});
check('5. the player can address the ball', address.ok && address.mode === 'address');

await page.waitForTimeout(100);
const addressGuide = await page.evaluate(() => document.getElementById('golf-guide')?.textContent?.trim() || '');
check('5b. addressing the ball teaches the first swing click',
  /aim/i.test(addressGuide) && /click once/i.test(addressGuide), addressGuide);

await page.evaluate(() => window.__golf.swing.click());
await page.waitForTimeout(100);
const powerGuide = await page.evaluate(() => document.getElementById('golf-guide')?.textContent?.trim() || '');
check('5c. the live swing coach teaches the power click',
  /power/i.test(powerGuide) && /second/i.test(powerGuide), powerGuide);

await page.evaluate(() => window.__golf.swing.click());
await page.waitForTimeout(100);
const strikeGuide = await page.evaluate(() => document.getElementById('golf-guide')?.textContent?.trim() || '');
check('5d. the live swing coach teaches the strike click',
  /strike/i.test(strikeGuide) && /third/i.test(strikeGuide), strikeGuide);
await page.evaluate(() => window.__golf.swing.reset());

const aimed = await page.evaluate(() => {
  const g = window.__golf;
  const start = g.aimYaw;
  g.setAim(start + 0.2);
  return { moved: Math.abs(g.aimYaw - start) > 0.15 };
});
check('6. the player can aim', aimed.moved);

const meter = await page.evaluate(async () => {
  const { Swing, SWING_PHASE } = await import('/src/golf/swing.js');
  const s = new Swing();
  s.click();                       // start
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  s.click();                       // power
  const power = s.power;
  for (let i = 0; i < 18; i++) s.update(1 / 60);
  s.click();                       // strike
  return { phase: s.phase, power, accuracy: s.accuracy, result: !!s.result };
});
check('7. the swing meter completes',
  meter.phase === 'done' && meter.result && meter.power > 0.3,
  `power ${meter.power.toFixed(2)}, accuracy ${meter.accuracy.toFixed(2)}`);

const ranges = await page.evaluate(async () => {
  const { Ball } = await import('/src/golf/ball.js');
  const { launchFor } = await import('/src/golf/clubs.js');
  const { SURFACE_PROPS, toYards } = await import('/src/golf/course.js');
  const { surfaceAt } = await import('/src/golf/field.js');
  const H = await import('/src/golf/hole1.js');
  const from = { x: H.TEE_MARKS.ball.x, z: H.TEE_MARKS.ball.z };
  const lie = SURFACE_PROPS[surfaceAt(from.x, from.z)];
  const atGreen = Math.atan2(H.GREEN.x - from.x, H.GREEN.z - from.z);
  const atPin = Math.atan2(H.PIN.x - from.x, H.PIN.z - from.z);
  const shoot = (club, power, aim = atGreen) => {
    const b = new Ball();
    b.placeAt(from.x, from.z);
    b.strike(aim, launchFor(club, { power, accuracy: 0, lie }));
    let t = 0;
    let flew = false;
    while (b.moving && t < 60) { if (b.position.y > b.landing?.y ?? 0) flew = true; b.update(1 / 120); t += 1 / 120; }
    return {
      total: toYards(Math.hypot(b.position.x - from.x, b.position.z - from.z)),
      apex: b.apex, surface: b.surface, state: b.state, flew,
    };
  };
  return {
    ironGreen: shoot('iron', 0.85),
    ironAtPin: shoot('iron', 0.85, atPin),
    driverLong: shoot('driver', 1.0),
    putter: shoot('putter', 1.0),
  };
});
check('8/9. the ball launches, lands and stops',
  ranges.ironGreen.state === 'stopped' && ranges.ironGreen.apex > 5,
  `apex ${ranges.ironGreen.apex.toFixed(1)} m`);
check('10. an iron reaches the green',
  ranges.ironGreen.surface === 'green',
  `${ranges.ironGreen.total.toFixed(0)} yds, finishes on the ${ranges.ironGreen.surface}`);
check("10b. Eric's advice is real: the flag line brings the water in",
  ranges.ironAtPin.surface === 'water' || ranges.ironAtPin.state === 'water',
  `same swing at the pin finishes in the ${ranges.ironAtPin.surface}`);
check('11. a driver dramatically overshoots the green',
  ranges.driverLong.total > 220 && ranges.driverLong.surface !== 'green',
  `${ranges.driverLong.total.toFixed(0)} yds`);
check('12. a putter rolls along the terrain and never leaves it',
  ranges.putter.apex < 5 && ranges.putter.total > 20,
  `${ranges.putter.total.toFixed(0)} yds, apex ${ranges.putter.apex.toFixed(2)} m`);

/* ------------------------------------------------------------------ */
/* 13–16 · hazards, drops, bunkers, slope                              */
/* ------------------------------------------------------------------ */

const water = await page.evaluate(async () => {
  const { Ball } = await import('/src/golf/ball.js');
  const { launchFor } = await import('/src/golf/clubs.js');
  const { SURFACE_PROPS } = await import('/src/golf/course.js');
  const { surfaceAt, isOutOfBounds } = await import('/src/golf/field.js');
  const H = await import('/src/golf/hole1.js');
  const from = { x: H.TEE_MARKS.ball.x, z: H.TEE_MARKS.ball.z };
  const b = new Ball();
  b.placeAt(from.x, from.z);
  const aim = Math.atan2(H.POND.x - from.x, H.POND.z - from.z);
  b.strike(aim, launchFor('iron', { power: 0.86, accuracy: 0, lie: SURFACE_PROPS.tee }));
  let t = 0;
  while (b.moving && t < 60) { b.update(1 / 120); t += 1 / 120; }
  const drop = b.dropPoint();
  return {
    state: b.state,
    dropSurface: surfaceAt(drop.x, drop.z),
    dropOob: isOutOfBounds(drop.x, drop.z),
    dropTowardTee: Math.hypot(drop.x, drop.z) < Math.hypot(b.position.x, b.position.z),
  };
});
check('13. water is detected', water.state === 'water', water.state);
check('14. the drop is dry, in bounds and playable',
  water.dropSurface !== 'water' && water.dropSurface !== 'bunker' && !water.dropOob
  && water.dropTowardTee,
  `drops on ${water.dropSurface}`);

const penalty = await page.evaluate(() => {
  const g = window.__golf;
  const before = g.round.card.hole('prospect', 1).strokes;
  g.round.playerBall.placeAt(g.LAYOUT.pond.x, g.LAYOUT.pond.z);
  g.round.playerBall.state = 'water';
  g.round.takeDrop('water');
  const h = g.round.card.hole('prospect', 1);
  return { before, after: h.strokes, penalties: h.penalties, foundWater: h.foundWater };
});
check('13b. water costs exactly one stroke',
  penalty.after === penalty.before + 1 && penalty.penalties === 1 && penalty.foundWater,
  `${penalty.before} → ${penalty.after}`);

const bunker = await page.evaluate(async () => {
  const { Ball } = await import('/src/golf/ball.js');
  const { launchFor } = await import('/src/golf/clubs.js');
  const { SURFACE_PROPS, toYards } = await import('/src/golf/course.js');
  const H = await import('/src/golf/hole1.js');
  const run = (surface) => {
    const b = new Ball();
    const from = surface === 'bunker'
      ? { x: H.BUNKER.x, z: H.BUNKER.z }
      : { x: H.TEE_MARKS.ball.x, z: H.TEE_MARKS.ball.z };
    b.placeAt(from.x, from.z);
    b.strike(Math.PI, launchFor('iron', { power: 0.8, accuracy: 0, lie: SURFACE_PROPS[surface] }));
    let t = 0;
    while (b.moving && t < 60) { b.update(1 / 120); t += 1 / 120; }
    const carry = toYards(b.carry);
    return { carry, total: toYards(Math.hypot(b.position.x - from.x, b.position.z - from.z)) };
  };
  return { sand: run('bunker'), tee: run('tee') };
});
check('15. sand changes the ball: shorter, and it stops',
  bunker.sand.carry < bunker.tee.carry * 0.75
  && (bunker.sand.total - bunker.sand.carry) < (bunker.tee.total - bunker.tee.carry),
  `sand ${bunker.sand.carry.toFixed(0)} yd carry vs tee ${bunker.tee.carry.toFixed(0)}, less run-out`);

const slope = await page.evaluate(async () => {
  const { Ball } = await import('/src/golf/ball.js');
  const { launchFor } = await import('/src/golf/clubs.js');
  const { SURFACE_PROPS } = await import('/src/golf/course.js');
  const { slopeAt } = await import('/src/golf/field.js');
  const H = await import('/src/golf/hole1.js');
  // A putt from directly behind the hole, struck dead straight.
  const from = { x: H.PIN.x, z: H.PIN.z - 7 };
  const b = new Ball();
  b.placeAt(from.x, from.z);
  b.strike(Math.PI, launchFor('putter', { power: 0.42, accuracy: 0, lie: SURFACE_PROPS.green }));
  let t = 0;
  while (b.moving && t < 40) { b.update(1 / 120); t += 1 / 120; }
  return { drift: b.position.x - from.x, grad: slopeAt(H.PIN.x, H.PIN.z) };
});
check('16. the green slope bends a straight putt toward the water',
  slope.drift > 0.04 && slope.grad.x > 0,
  `drifted ${(slope.drift * 100).toFixed(0)} cm toward the pond`);

/* ------------------------------------------------------------------ */
/* 17–18 · the cup                                                     */
/* ------------------------------------------------------------------ */

const holed = await page.evaluate(async () => {
  const { Ball } = await import('/src/golf/ball.js');
  const { launchFor } = await import('/src/golf/clubs.js');
  const { SURFACE_PROPS } = await import('/src/golf/course.js');
  const H = await import('/src/golf/hole1.js');
  // Straight up the slope from below the hole, so gravity does not help.
  for (let power = 0.14; power < 0.5; power += 0.004) {
    const b = new Ball();
    b.placeAt(H.PIN.x, H.PIN.z + 2.2);
    b.strike(Math.PI, launchFor('putter', { power, accuracy: 0, lie: SURFACE_PROPS.green }));
    let t = 0;
    while (b.moving && t < 40) { b.update(1 / 120); t += 1 / 120; }
    if (b.state === 'holed') return { holed: true, power };
  }
  return { holed: false };
});
check('17. the ball can go in the cup', holed.holed, holed.holed ? `at power ${holed.power.toFixed(3)}` : '');

const strokeCount = await page.evaluate(() => {
  const g = window.__golf;
  const before = g.round.card.hole('prospect', 1).strokes;
  g.round.playerBall.placeAt(g.LAYOUT.pin.x, g.LAYOUT.pin.z + 3);
  g.hit(0.3, 0);
  return { before, after: g.round.card.hole('prospect', 1).strokes };
});
check('18. the stroke count updates on every shot',
  strokeCount.after === strokeCount.before + 1,
  `${strokeCount.before} → ${strokeCount.after}`);

/* ------------------------------------------------------------------ */
/* 20–21, 24–25 · the cart, Lou, the green, finishing                  */
/* ------------------------------------------------------------------ */

const played = await page.evaluate(() => {
  const g = window.__golf;
  const seen = new Set();
  const beats = [];
  const holesPlayed = [g.HOLE.number];
  const visualState = () => {
    const names = [];
    g.course.holeGroup.traverse((object) => { if (object.name) names.push(object.name); });
    const clubhouse = g.course.holeGroup.getObjectByName('clubhouse');
    return {
      hole: g.HOLE.number,
      names,
      hasLot: !!g.LAYOUT.lot,
      clubhouse: clubhouse
        ? { x: clubhouse.position.x, z: clubhouse.position.z }
        : null,
      expectedClubhouse: g.LAYOUT.clubhouse,
    };
  };
  const visuals = [visualState()];
  let louPrivate = false;
  let cartMoved = false;
  const startCart = g.carts.lead.distance;

  for (let i = 0; i < 20000; i++) {
    if (!seen.has(g.round.beat)) { seen.add(g.round.beat); beats.push(g.round.beat); }
    if (g.round.beat === 'cart' && g.carts.lead.distance > startCart + 5) cartMoved = true;
    if (g.cues.heard('golf.h1.lou.you_did_good')) louPrivate = true;
    if (g.dialogue.active && g.dialogue.options.length) g.dialogue.choose(0);

    /* Play the hole out using the game's own shot solver, so the autoplayer
     * is exercising the same aiming code an NPC uses rather than a formula
     * invented in the test that could agree with nothing. */
    if (g.round.canAddress() && !g.round.playerBall.moving) {
      const b = g.round.playerBall.position;
      const d = Math.hypot(b.x - g.LAYOUT.pin.x, b.z - g.LAYOUT.pin.z);
      const surface = g.surfaceAt(b.x, b.z);
      const onGreen = surface === 'green' || surface === 'fringe';
      const useClub = onGreen || d < 12 ? 'putter' : 'iron';
      g.setClub(useClub);
      const solved = g.solve(
        { x: b.x, z: b.z }, { x: g.LAYOUT.pin.x, z: g.LAYOUT.pin.z }, useClub,
      );
      g.setAim(solved.aim);
      g.hit(solved.power, 0);
    }
    if (g.round.needsRelief()) g.round.takeDrop();
    if (g.round.beat === 'walk_off') g.teleport(g.LAYOUT.cartPark.x, g.LAYOUT.cartPark.z);
    /* Walk onto the next tee. The scene does this behind a fade; the harness
     * runs faster than the fade, so it takes the same transition directly. */
    if (g.round.beat === 'next_tee') {
      const n = g.advanceToNextHole();
      if (n !== null) {
        holesPlayed.push(n);
        visuals.push(visualState());
      }
    }
    g.step(0.05);
    if (g.round.beat === 'done') break;
  }
  const h = g.round.card.hole('prospect', 1);
  const line = g.round.card.line('prospect');
  const effectCounts = {};
  for (const cue of ['golf.tee', 'golf.pickup', 'golf.flag']) {
    effectCounts[cue] = g.audio.playbacks.filter(({ name }) => name === cue).length;
  }
  return {
    beats, louPrivate, cartMoved, holesPlayed,
    finished: h.finished, strokes: h.strokes,
    beat: g.round.beat,
    allFinished: g.round.card.allFinished(1),
    lines: g.round.card.lines().map((l) => `${l.card}:${l.strokes}`),
    roundStrokes: line.strokes,
    roundToPar: line.label,
    built: g.round.holes, visuals, effectCounts,
    replayVisible: document.getElementById('endcard-again')?.hidden === false,
  };
});
check('20. the cart ride begins and the carts actually move',
  played.beats.includes('cart') && played.cartMoved);
check("21. Lou's private conversation triggers on the ride", played.louPrivate);
check('24. the group reaches the green and everybody finishes',
  played.allFinished, played.lines.join(' '));
check('25. the player can complete the hole',
  played.finished && played.strokes > 0, `${played.strokes} strokes`);
check('28. the end card appears when the round is over',
  played.beat === 'done', `beats: ${played.beats.join(' → ')}`);
check('28b. the round plays every hole the course has built',
  played.holesPlayed.join(',') === played.built.join(','),
  `played ${played.holesPlayed.join(', ')} of ${played.built.join(', ')} — ${played.roundStrokes} strokes, ${played.roundToPar}`);
const visualByHole = new Map(played.visuals.map((visual) => [visual.hole, visual]));
const visualBase = ['flag', 'hole-marker', 'tee-marker-left', 'tee-marker-right', 'clubhouse'];
check('28c. every hole builds its authored visual anchors',
  [1, 2, 3].every((hole) => visualBase.every((name) => visualByHole.get(hole)?.names.includes(name)))
    && visualByHole.get(1)?.names.includes('pond')
    && !visualByHole.get(2)?.names.includes('pond')
    && !visualByHole.get(3)?.names.includes('pond')
    && visualByHole.get(1)?.names.includes('next-tee-hint')
    && visualByHole.get(2)?.names.includes('next-tee-hint')
    && !visualByHole.get(3)?.names.includes('next-tee-hint'),
  played.visuals.map((visual) => `H${visual.hole}: ${visual.names.join(', ')}`).join(' | '));
const lastVisual = visualByHole.get(3);
check('28d. Hole 3 renders the clubhouse even though it has no car park',
  lastVisual?.hasLot === false && !!lastVisual.clubhouse
    && Math.abs(lastVisual.clubhouse.x - lastVisual.expectedClubhouse.x) < 0.01
    && Math.abs(lastVisual.clubhouse.z - lastVisual.expectedClubhouse.z) < 0.01,
  lastVisual ? `clubhouse ${lastVisual.clubhouse?.x},${lastVisual.clubhouse?.z}; lot ${lastVisual.hasLot}` : 'Hole 3 missing');
check('28e. tee, pickup, and flag cues all fire during the real round',
  played.effectCounts['golf.tee'] >= 1
    && played.effectCounts['golf.pickup'] >= 1
    && played.effectCounts['golf.flag'] >= 1,
  JSON.stringify(played.effectCounts));
check('28f. disposable preview rounds honestly offer replay', played.replayVisible);

/* ------------------------------------------------------------------ */
/* 26 · every score branch                                             */
/* ------------------------------------------------------------------ */

const bands = await page.evaluate(async () => {
  const { scoreBand, scoreName } = await import('/src/golf/course.js');
  const { SEQUENCES } = await import('/src/golf/script.js');
  const out = {};
  for (const strokes of [1, 2, 3, 4, 5, 9]) {
    const band = scoreBand(strokes, 3);
    out[strokes] = { band, name: scoreName(strokes, 3), hasSequence: !!SEQUENCES[`hole.${band}`] };
  }
  return out;
});
const allBands = Object.values(bands).every((b) => b.hasSequence);
check('26. ace, birdie, par, bogey and worse all have a reaction',
  allBands && bands[1].band === 'ace' && bands[2].band === 'birdie'
  && bands[3].band === 'par' && bands[4].band === 'bogey',
  Object.entries(bands).map(([s, b]) => `${s}=${b.band}`).join(' '));

/* ------------------------------------------------------------------ */
/* 27 · the save                                                       */
/* ------------------------------------------------------------------ */

const saved = await page.evaluate(() => {
  const g = window.__golf;
  const record = g.campaign.state.missions.silver_pines;
  return {
    status: record.status,
    holes: record.holes.length,
    strokes: record.strokes,
    heardInvitation: record.heardInvitation,
    rodeWithLou: record.rodeWithLou,
    toPar: record.toPar,
  };
});
check('27. every hole played is saved to the campaign',
  saved.holes === played.built.length && saved.strokes > 0,
  `${saved.holes} hole(s), ${saved.strokes} strokes, ${saved.toPar >= 0 ? '+' : ''}${saved.toPar}, invitation heard: ${saved.heardInvitation}`);
/* The campaign's round is three holes and the course has not built three yet,
 * so the mission must stay open. When Hole 3 lands this flips to `complete`
 * on its own and this assertion is what will say so. */
check('27b. mission completion matches the playable round',
  played.built.length === 3
    ? saved.status === 'complete'
    : saved.status === 'in_progress',
  `${played.built.length} of 3 built, mission is ${saved.status}`);

/* ------------------------------------------------------------------ */
/* 30 · nothing softlocks                                              */
/* ------------------------------------------------------------------ */

const recovery = await page.evaluate(async () => {
  const { recoveryPointFor, isOutOfBounds, surfaceAt, heightAt } = await import('/src/golf/field.js');
  const spots = [
    { x: 21.5, z: -137, why: 'in the pond' },
    { x: -400, z: -400, why: 'far out of bounds' },
    { x: 0, z: -300, why: 'past the back boundary' },
    { x: -8.5, z: -141.5, why: 'in the bunker' },
  ];
  return spots.map((s) => {
    const p = recoveryPointFor(s.x, s.z);
    return {
      why: s.why,
      ok: !isOutOfBounds(p.x, p.z) && surfaceAt(p.x, p.z) !== 'water'
        && Number.isFinite(p.x) && Number.isFinite(heightAt(p.x, p.z)),
      surface: surfaceAt(p.x, p.z),
    };
  });
});
check('30. no ball position can softlock the scene',
  recovery.every((r) => r.ok),
  recovery.map((r) => `${r.why}→${r.surface}`).join(', '));

const belowTerrain = await page.evaluate(() => {
  const g = window.__golf;
  const b = g.round.playerBall;
  b.placeAt(6, -152.5);
  b.position.y -= 40;
  b.state = 'roll';
  const trouble = b.watchdog(0.1);
  return { trouble };
});
check('30b. a ball below the terrain is caught by the watchdog',
  belowTerrain.trouble === 'below_terrain', belowTerrain.trouble ?? 'not caught');

/* ------------------------------------------------------------------ */
/* 29 · restart                                                        */
/* ------------------------------------------------------------------ */

await page.goto(GOLF_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__golfReady === true', null, { timeout: 60000 });
const restarted = await page.evaluate(() => ({
  beat: window.__golf.round.beat,
  strokes: window.__golf.round.card.hole('prospect', 1).strokes,
}));
check('29. the scene restarts cleanly',
  restarted.beat === 'lot' && restarted.strokes === 0,
  `beat: ${restarted.beat}`);

/* ------------------------------------------------------------------ */
/* Script integrity                                                    */
/* ------------------------------------------------------------------ */

const script = await page.evaluate(async () => {
  const m = await import('/src/golf/script.js');
  const noop = () => {};
  const trees = m.buildScripts({
    play: noop, playSequence: noop, playCallbacks: noop,
    callbackHold: () => 1, remember: noop, flag: noop,
  });
  const dangling = [];
  for (const [name, ids] of Object.entries(m.SEQUENCES)) {
    for (const id of ids) if (!m.CUES[id]) dangling.push(`${name} → ${id}`);
  }
  return {
    cues: m.allCueIds().length,
    unreachable: m.unreachableCues(trees),
    dangling,
    emptySave: m.pastMissionBanter({}).length,
    fullSave: m.pastMissionBanter({
      bada_bing_one: { ending: 'warned', handsPlayed: 9, jackpot: true },
      squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
      airstrip_smuggling: { status: 'complete', detected: false, landingQuality: 'clean' },
      silver_room: { status: 'complete', seeingHerAgain: true },
    }).length,
  };
});
check('S1. every cue is reachable and every reference resolves',
  script.unreachable.length === 0 && script.dangling.length === 0,
  `${script.cues} cues; ${script.unreachable.length} orphaned, ${script.dangling.length} dangling`);
check('S2. a save with no history gets no callbacks and no holes',
  script.emptySave === 0 && script.fullSave > 0,
  `empty: ${script.emptySave}, full: ${script.fullSave}`);

/* ------------------------------------------------------------------ */

const errorsAfter = problems.length;
check('1b. no console errors across the whole round',
  errorsAfter === 0, problems.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.\n`);
if (failed.length) {
  console.log('Failed:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  console.log('');
  process.exit(1);
}
