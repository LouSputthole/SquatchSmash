#!/usr/bin/env node
/**
 * Play Silver Pines headlessly, from the car park through all three holes.
 *
 *   node tools/verify-golf.mjs                 (npm run verify:golf)
 *   node tools/verify-golf.mjs --screenshots   (refresh meter evidence)
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
const CAPTURE_SCREENSHOTS = process.argv.includes('--screenshots')
  || process.env.GOLF_SCREENSHOTS === '1';

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
const GOLF_CANONICAL_URL = `http://localhost:${PORT}/golf.html`;
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
    cartRadio: {
      face: !!g.carts.lead.group.getObjectByName('golf-cart-radio-display'),
      power: !!g.carts.lead.group.getObjectByName('golf-cart-radio-power'),
      position: g.carts.lead.radioWorld().toArray(),
    },
    clubs: Object.keys(g.round.balls.constructor === Map ? {} : {}),
  };
});
check('3. all four characters are in the scene',
  world.golfers.length === 3 && world.hasCourse,
  `${world.golfers.join(', ')} + the first-person Prospect`);
check('3a. both carts have a physical dashboard radio receiver',
  world.cartRadio.face && world.cartRadio.power
    && world.cartRadio.position.every(Number.isFinite),
  JSON.stringify(world.cartRadio));

const clubArt = await page.evaluate(async () => {
  const g = window.__golf;
  const { Box3 } = await import('/vendor/three.module.min.js');
  const bag = g.scene.getObjectByName('three-club-stand-bag');
  const inBag = (bag?.children || [])
    .filter((child) => ['driver', 'iron', 'putter'].includes(child.userData.kind))
    .map((model) => ({
      kind: model.userData.kind,
      head: model.getObjectByName(`club-head-${model.userData.kind}`)?.geometry?.type ?? null,
      hosel: !!model.getObjectByName('club-hosel'),
    }));

  const golfer = g.golfers.eric;
  const ground = g.heightAt(golfer.position.x, golfer.position.z);
  const inHand = {};
  for (const kind of ['driver', 'iron', 'putter']) {
    golfer.setClub(kind);
    golfer.group.updateMatrixWorld(true);
    const head = golfer.club.getObjectByName(`club-head-${kind}`);
    const headBox = new Box3().setFromObject(head);
    inHand[kind] = {
      head: head?.geometry?.type ?? null,
      hosel: !!golfer.club.getObjectByName('club-hosel'),
      refinement: kind === 'driver'
        ? !!golfer.club.getObjectByName('club-alignment-driver')
        : kind === 'iron'
          ? !!golfer.club.getObjectByName('club-cavity-iron')
          : !!golfer.club.getObjectByName('club-alignment-putter'),
      clearance: headBox.min.y - ground,
      carryAngle: golfer.club.rotation.x,
    };
  }
  golfer.setClub('iron');
  return {
    bagParts: bag?.children.map((child) => child.name).filter(Boolean) ?? [],
    inBag,
    inHand,
  };
});
check('3c. the live stand bag contains three complete, fanned clubs',
  clubArt.inBag.map((club) => club.kind).sort().join(',') === 'driver,iron,putter'
    && clubArt.inBag.every((club) => club.head && club.hosel)
    && clubArt.bagParts.includes('bag-rim')
    && clubArt.bagParts.includes('bag-front-pocket'),
  JSON.stringify(clubArt.inBag));
check('3d. every in-hand club swaps to its own head silhouette',
  clubArt.inHand.driver.head === 'SphereGeometry'
    && clubArt.inHand.iron.head === 'ExtrudeGeometry'
    && clubArt.inHand.putter.head === 'BoxGeometry'
    && Object.values(clubArt.inHand).every((club) => club.hosel && club.refinement),
  JSON.stringify(clubArt.inHand));
check('3e. every idle club head stays visible at turf height',
  Object.values(clubArt.inHand).every((club) => club.clearance >= -0.04
    && club.clearance <= 0.20 && club.carryAngle >= 0.80),
  JSON.stringify(clubArt.inHand));

const audioBank = await page.evaluate(async () => {
  const g = window.__golf;
  const { CUES } = await import('/src/golf/script.js');
  const { GOLF_EFFECT_CUES, GOLF_LATER_AUDIO_SCOPES } = await import('/src/golf/audio.js');
  await Promise.all([
    ...GOLF_LATER_AUDIO_SCOPES.map((scope) => g.audio.loadAdditional(scope)),
    g.waitForCartRadioAudio(),
  ]);
  const manifest = g.audio.manifest.sfx || [];
  const names = new Set(manifest.map((cue) => cue.name));
  const expectedVoices = Object.keys(CUES).map((id) => `vo.${id}`);
  const golfNames = new Set([...expectedVoices, ...GOLF_EFFECT_CUES]);
  const available = g.audio._availableFiles || new Set();
  const indexed = manifest.filter((cue) => golfNames.has(cue.name)
    && available.has(cue.file || `${cue.name}.mp3`));
  const radioIndexed = g.cartRadioAudioPlan.full.filter((name) => {
    const cue = manifest.find((entry) => entry.name === name);
    return cue && available.has(cue.file || `${cue.name}.mp3`);
  });
  return {
    voices: expectedVoices.filter((name) => names.has(name)).length,
    expectedVoices: expectedVoices.length,
    missingEffects: GOLF_EFFECT_CUES.filter((name) => !names.has(name)),
    missingDecoded: indexed.filter((cue) => !g.audio.buffers.has(cue.name)).map((cue) => cue.name),
    radioStartup: g.cartRadioAudioPlan.startup.length,
    radioFull: g.cartRadioAudioPlan.full.length,
    missingRadioDecoded: radioIndexed.filter((name) => !g.audio.hasSample(name)),
  };
});
check('3b. complete Golf audio loads while the larger cart-radio bank stays off the start gate',
  audioBank.voices === audioBank.expectedVoices && audioBank.missingEffects.length === 0
    && audioBank.missingDecoded.length === 0
    && audioBank.radioStartup > 0 && audioBank.radioStartup <= 20
    && audioBank.radioFull >= 50 && audioBank.radioStartup < audioBank.radioFull
    && audioBank.missingRadioDecoded.length === 0,
  `${audioBank.voices}/${audioBank.expectedVoices} Golf voices; radio ${audioBank.radioStartup} startup / ${audioBank.radioFull} background; ${audioBank.missingRadioDecoded.length} radio takes not decoded`);

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
/* 4e-4j · the trailside cooler, and the cart's own amenities           */
/* ------------------------------------------------------------------ */

/*
 * Walking up to a target and looking at it is three facts, not one:
 * position inside interaction range, the camera's yaw pointed at it, and
 * the camera's *pitch* pointed at it too. Every earlier interaction check in
 * this file gets the last two for free by construction (spawn faces the
 * bag levelly; the tee walk faces the pin levelly) because those targets
 * sit at roughly eye height along a level sightline. A cooler or a pack of
 * cigarettes sitting on a golf cart does not -- it is close and low, so a
 * level ray sails clean over the top of it. `aimAt` sets both angles from
 * real 3-D geometry (the same "player minus target" yaw convention `main.js`
 * uses to face the spawn at the bag, plus the pitch that keeps the ray on
 * the object). It is re-run before every single press below, not just the
 * first: the walking camera's idle bob shifts the eye a few centimetres each
 * frame, which is nothing at arm's reach but is enough to walk a close-range
 * ray off a small prop between one keypress and the next.
 */
async function aimAt(t) {
  await page.evaluate((p) => {
    const g = window.__golf;
    const dx = p.x - g.player.position.x;
    const dy = p.y - g.player.position.y;
    const dz = p.z - g.player.position.z;
    const r = Math.hypot(dx, dy, dz) || 1;
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = Math.asin(Math.max(-1, Math.min(1, dy / r)));
  }, t);
  await page.waitForTimeout(120);   // let the real frame loop turn the camera to match
}

async function pressE() {
  return page.evaluate(() => {
    /* Empty the stack first. `pressUntilToast` below retries "until a toast
     * appears", and a toast from a minute ago is still in the DOM — so a
     * press that did nothing could return somebody else's message and the
     * retry loop would stop before it had ever landed. Every press now reads
     * only what that press said. */
    const stack = document.getElementById('toast-stack');
    if (stack) stack.replaceChildren();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
    return {
      toast: [...document.querySelectorAll('#toast-stack .toast')]
        .map((el) => el.textContent.trim()).join(' | '),
    };
  });
}

/**
 * Aim and press, retrying the aim a few times if the first attempt lands
 * outside a real toast. The player's eye height eases onto new ground over
 * a couple of real frames rather than snapping, so the very first aim right
 * after a teleport can be a hair off; re-aiming (not re-teleporting) is
 * exactly what a player nudging the mouse to actually look at the thing
 * would do, and it is what settles the shot every time in practice.
 */
async function pressUntilToast(t, attempts = 6) {
  let result = { toast: '' };
  for (let i = 0; i < attempts && !result.toast; i++) {
    await aimAt(t);
    result = await pressE();
  }
  return { ...result, target: t };
}

/** Walk to a target -- standing back far enough that the idle bob is a
 * rounding error rather than a miss -- then aim and press. */
async function walkUpAndPress(getTarget) {
  const t = await page.evaluate(getTarget);
  await page.evaluate((p) => window.__golf.teleport(p.x, p.z + (p.standoff ?? 1.7)), t);
  await page.waitForTimeout(150);   // let the player's eye height settle on the new ground
  return pressUntilToast(t);
}

/* The cart amenities sit below eye height and only 18 cm apart, so their live
 * contract must exercise a real 3-D aim, E press, inventory transfer, and prop
 * removal. Registration alone previously let an unreachable item look green. */


const returnHere = await page.evaluate(() => ({
  x: window.__golf.player.position.x, z: window.__golf.player.position.z,
  yaw: window.__golf.player.yaw, pitch: window.__golf.player.pitch,
}));

const coolerFacts = await page.evaluate(() => {
  const g = window.__golf;
  const cooler = g.course.sideCooler;
  const pos = cooler.group.position;
  return {
    cansStart: cooler.cans.filter((c) => c.visible).length,
    pos: { x: pos.x, z: pos.z },
    expected: g.LAYOUT.sideCooler,
  };
});
check('4e. Hole 1 stocks its own trailside cooler beside the cart path, separate from the cart',
  coolerFacts.cansStart === 6
    && Math.abs(coolerFacts.pos.x - coolerFacts.expected.x) < 0.01
    && Math.abs(coolerFacts.pos.z - coolerFacts.expected.z) < 0.01,
  JSON.stringify(coolerFacts));

const coolerTarget = await page.evaluate(() => {
  const p = window.__golf.course.sideCooler.group.position;
  return { x: p.x, y: p.y + 0.35, z: p.z, standoff: 1.7 };
});
await page.evaluate((p) => window.__golf.teleport(p.x, p.z + p.standoff), coolerTarget);
await page.waitForTimeout(150);
const coolerGrab = await pressUntilToast(coolerTarget);
const coolerAfterGrab = await page.evaluate(() => ({
  remaining: window.__golf.course.sideCooler.cans.filter((c) => c.visible).length,
  carrying: window.__golf.inventory.items.filter((slot) => slot === 'beer').length,
  held: window.__golf.inventory.held,
  hand: document.querySelector('#hand-item .name')?.textContent?.trim() ?? '',
}));
check('4f. walking up to the trailside cooler puts a real can in his inventory',
  coolerAfterGrab.remaining === 5
    && coolerAfterGrab.carrying === 1
    && coolerAfterGrab.held === 'beer'
    && /beer/i.test(coolerAfterGrab.hand)
    && /cold one|left in this cooler/i.test(coolerGrab.toast),
  JSON.stringify({ ...coolerGrab, ...coolerAfterGrab }));

/* Drink it, and the slot comes back. This is the playtest's other half — a can
 * that goes into a slot and can never leave it is a worse bug than one that
 * never arrived. Holding [F] runs the shared apartment drink pose. */
const drank = await page.evaluate(async () => {
  const g = window.__golf;
  const before = g.inventory.items.filter((slot) => slot === 'beer').length;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
  g.player.keys.add('KeyF');
  let lifted = 0;
  for (let t = 0; t < 3.0; t += 1 / 60) {
    g.step(1 / 60);
    lifted = Math.max(lifted, g.heldProps.drinks.can.position.y);
  }
  g.player.keys.delete('KeyF');
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }));
  return {
    before,
    after: g.inventory.items.filter((slot) => slot === 'beer').length,
    lifted,
    canRest: g.heldProps.drinks.can.position.y,
  };
});
check('4f1. holding F drinks the beer with the shared held-can animation and frees the slot',
  drank.before === 1 && drank.after === 0 && drank.lifted > -0.15,
  JSON.stringify(drank));

/* Drain the rest, one authored can at a time, drinking whenever his hands are
 * full -- six cans through five slots that already hold three clubs. */
for (let i = 0; i < 10; i++) {
  const left = await page.evaluate(() => {
    const g = window.__golf;
    /* Empty his hands of beer before reaching for another. Each pass is a
     * real keydown, three seconds of held [F] and a keyup, so it goes through
     * the same `beginItemUse`/`updateItemUse` path a player's finger does. */
    for (let n = 0; n < 4 && g.inventory.has('beer'); n++) {
      g.inventory.select(g.inventory.items.indexOf('beer'));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
      g.player.keys.add('KeyF');
      for (let t = 0; t < 3.0; t += 1 / 60) g.step(1 / 60);
      g.player.keys.delete('KeyF');
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }));
    }
    return g.course.sideCooler.cans.filter((c) => c.visible).length;
  });
  if (left === 0) break;
  await pressUntilToast(coolerTarget);
}
const coolerAfterAll = await page.evaluate(() => (
  window.__golf.course.sideCooler.cans.filter((c) => c.visible).length
));
// One more press once it really is empty: this must not go negative or throw.
const coolerEmptyPress = await pressUntilToast(coolerTarget);
check('4g. the trailside cooler runs out and says so instead of going negative',
  coolerAfterAll === 0 && /picked clean|empty|beat you to it/i.test(coolerEmptyPress.toast),
  JSON.stringify({ afterAll: coolerAfterAll, toast: coolerEmptyPress.toast }));

const cigarettesGrab = await walkUpAndPress(() => {
  const mesh = window.__golf.carts.lead.amenities.cigarettes;
  mesh.updateWorldMatrix(true, false);
  const p = mesh.getWorldPosition(mesh.position.clone());
  return { x: p.x, y: p.y, z: p.z, standoff: 1.55 };
});
const cigarettesState = await page.evaluate(() => ({
  owned: window.__golf.inventory.has('cigs'),
  held: window.__golf.inventory.held,
  visible: window.__golf.carts.lead.amenities.cigarettes.visible,
}));

const zynGrab = await walkUpAndPress(() => {
  const mesh = window.__golf.carts.lead.amenities.zyn;
  mesh.updateWorldMatrix(true, false);
  const p = mesh.getWorldPosition(mesh.position.clone());
  return { x: p.x, y: p.y, z: p.z, standoff: 1.55 };
});
const zynState = await page.evaluate(() => ({
  owned: window.__golf.inventory.has('zyn'),
  held: window.__golf.inventory.held,
  visible: window.__golf.carts.lead.amenities.zyn.visible,
}));

const cartAmenities = await page.evaluate(() => {
  const g = window.__golf;
  const want = ['golf-cart-cooler', 'golf-cart-cigarettes', 'golf-cart-zyn-tin'];
  const out = {};
  for (const name of want) {
    const mesh = g.carts.lead.amenities[
      name === 'golf-cart-cooler' ? 'cooler'
        : name === 'golf-cart-cigarettes' ? 'cigarettes' : 'zyn'
    ];
    const desc = mesh?.userData?.interact || null;
    out[name] = {
      present: !!mesh,
      registered: g.interaction.targets.includes(mesh),
      label: desc ? String(desc.label ?? (typeof desc.label === 'function' ? desc.label() : '')) : null,
      hasUse: typeof desc?.onUse === 'function',
    };
  }
  return out;
});
check('4h. walking up to the cart cigarettes puts them in the shared inventory',
  cartAmenities['golf-cart-cigarettes'].registered
    && cartAmenities['golf-cart-cigarettes'].hasUse
    && /cigarette/i.test(cartAmenities['golf-cart-cigarettes'].label || '')
    && cigarettesState.owned
    && !cigarettesState.visible
    && /smokes|cigarette/i.test(cigarettesGrab.toast || ''),
  JSON.stringify({ target: cartAmenities['golf-cart-cigarettes'], grab: cigarettesGrab, state: cigarettesState }));
check('4i. walking up to the cart Zyn tin puts it in the shared inventory',
  cartAmenities['golf-cart-zyn-tin'].registered
    && cartAmenities['golf-cart-zyn-tin'].hasUse
    && /zyn/i.test(cartAmenities['golf-cart-zyn-tin'].label || '')
    && zynState.owned
    && !zynState.visible
    && /wintergreen|zyn/i.test(zynGrab.toast || ''),
  JSON.stringify({ target: cartAmenities['golf-cart-zyn-tin'], grab: zynGrab, state: zynState }));
check('4j. the cart cooler is its own interaction, distinct from the trailside coolers',
  cartAmenities['golf-cart-cooler'].registered
    && cartAmenities['golf-cart-cooler'].hasUse
    && cartAmenities['golf-cart-cooler'].label !== cartAmenities['golf-cart-zyn-tin'].label,
  JSON.stringify(cartAmenities['golf-cart-cooler']));


await page.evaluate((pos) => {
  const g = window.__golf;
  g.teleport(pos.x, pos.z);
  g.player.yaw = pos.yaw;
  g.player.pitch = pos.pitch;
}, returnHere);

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
  const order = ['eric', 'rippinflow', 'lou'];
  const liveStances = {};
  for (let i = 0; i < 4000 && g.round.beat === 'npc_tee'; i++) {
    const id = order[g.round._npcIndex];
    if (id && g.round._npcPhase === 'swing' && !liveStances[id]) {
      const golfer = g.golfers[id];
      const ball = g.LAYOUT.teeMarks.ball;
      const target = g.LAYOUT.npcTeeShots[id].target ?? g.LAYOUT.pin;
      const shotYaw = Math.atan2(target.x - ball.x, target.z - ball.z);
      const yawDelta = Math.atan2(
        Math.sin(golfer.group.rotation.y - shotYaw),
        Math.cos(golfer.group.rotation.y - shotYaw),
      );
      const distance = Math.hypot(golfer.position.x - ball.x, golfer.position.z - ball.z);
      if (['address', 'practice'].includes(golfer.state) && distance < 1.2) {
        liveStances[id] = {
          distance,
          yawDelta,
          sideOn: Math.abs(Math.abs(yawDelta) - Math.PI / 2) < 0.01,
          state: golfer.state,
        };
      }
    }
    /* A helper-only assertion missed a real staging regression before. Let
     * every golfer walk, address and swing without the scene's skip path. */
    g.round.skipRequested = false;
    g.step(0.05);
  }
  return {
    beat: g.round.beat,
    strokes: ['lou', 'rippinflow', 'eric'].map((id) => g.round.card.hole(id, 1).strokes),
    teeEffect: g.audio.playbacks.filter(({ name }) => name === 'golf.tee').length,
    liveStances,
  };
});
check('19s. every rendered golfer reaches a real side-on address pose',
  Object.keys(npcPlayed.liveStances).length === 3
    && Object.values(npcPlayed.liveStances).every((stance) => stance.sideOn
      && stance.distance > 0.35 && stance.distance < 1.1),
  JSON.stringify(npcPlayed.liveStances));
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

const ballFinder = await page.evaluate(() => {
  const g = window.__golf;
  const map = document.getElementById('golf-map');
  const marker = g.scene.getObjectByName('player-ball-ground-marker');
  return {
    mapVisible: !!map && !map.classList.contains('hidden'),
    mapLabel: map?.querySelector('.ball-label')?.textContent?.trim() || '',
    canvas: !!map?.querySelector('canvas'),
    markerVisible: !!marker?.visible,
    markerRadius: marker?.userData.radius ?? 0,
  };
});
check('19e. the player ball has both a ground highlight and a top-map marker',
  ballFinder.mapVisible && ballFinder.canvas && /your ball/i.test(ballFinder.mapLabel)
    && ballFinder.markerVisible && ballFinder.markerRadius >= 0.4,
  JSON.stringify(ballFinder));
if (CAPTURE_SCREENSHOTS) {
  await fsp.mkdir(path.join(ROOT, 'docs', 'validation', 'golf'), { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(100);
  await page.screenshot({
    path: path.join(ROOT, 'docs', 'validation', 'golf', '10-ball-finder.png'),
  });
  await page.setViewportSize({ width: 480, height: 300 });
}

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

const playerClubView = await page.evaluate(() => {
  const rig = window.__golf.scene.getObjectByName('player-club-rig');
  /* Walked rather than read off `rig.children`, because the rig is a small
   * hierarchy now — a Z-rotating sweep group holding an X-tilt holding the
   * scaled hold group with the clubs and the hands in it — and asserting the
   * child list would be asserting that structure rather than what the player
   * sees. What must be true is that ONE club is showing, that it is the
   * selected one, that it hangs off the camera, and that there are two hands
   * on it. Also assert the head is actually in frame: a first-person rig whose
   * clubhead is below the bottom of the picture cannot make three clubs
   * "readable at address", which is what the gameplay spec asks for. */
  const kinds = [];
  let hands = 0;
  let selected = '';
  rig?.traverse((child) => {
    if (child.name === 'player-hand') hands++;
    if (!child.userData.kind) return;
    kinds.push(child.userData.kind);
    if (child.visible) selected = child.userData.kind;
  });
  const camera = window.__golf.camera;
  camera.updateMatrixWorld(true);
  const head = rig?.getObjectByName(`club-head-${selected}`)
    ?? rig?.getObjectByName(`club-face-${selected}`);
  const at = head
    ? head.getWorldPosition(window.__golf.player.position.clone()).project(camera)
    : null;
  return {
    visible: !!rig?.visible,
    selected,
    kinds: kinds.length,
    cameraMounted: rig?.parent?.type === 'PerspectiveCamera',
    hands,
    headOnScreen: !!at && Math.abs(at.x) < 1 && Math.abs(at.y) < 1 && at.z > -1 && at.z < 1,
    headScreen: at ? [Number(at.x.toFixed(3)), Number(at.y.toFixed(3))] : null,
    plan: window.__golf.plan(),
  };
});
check('5a. address shows the recommended club, in frame, in his own hands',
  playerClubView.visible && playerClubView.selected === 'iron'
    && playerClubView.kinds === 3 && playerClubView.cameraMounted
    && playerClubView.hands === 2 && playerClubView.headOnScreen,
  JSON.stringify(playerClubView));
await page.waitForTimeout(100);
const landingPreview = await page.evaluate(async () => {
  const g = window.__golf;
  const marker = g.scene.getObjectByName('golf-landing-preview');
  const ring = marker?.getObjectByName('golf-landing-preview-ring');
  /* What the ball ACTUALLY carries with the swing the ring is drawn for.
   * The ring is a promise about where it lands, so the only honest check is
   * against the integrator — a fixed metre threshold here is what let a
   * planning model that over-read a full iron by 28% pass for months. */
  const { simulate } = await import('/src/golf/ball.js');
  const { launchFor, powerForDistance } = await import('/src/golf/clubs.js');
  const ball = g.round.playerBall.position;
  const lie = g.surfaceProps(g.round.playerSurface());
  const power = powerForDistance(g.club, g.plan().distance, lie);
  const flown = simulate(
    { x: ball.x, z: ball.z }, g.aimYaw,
    launchFor(g.club, { power, accuracy: 0, lie }),
  );
  return {
    visible: !!marker?.visible,
    distance: marker?.userData.distance ?? 0,
    radius: marker?.userData.radius ?? 0,
    club: marker?.userData.club ?? '',
    actualCarry: flown.carry,
    yellow: ring?.material?.color?.getHex?.() ?? 0,
    label: document.querySelector('#aim .distance')?.textContent?.trim() ?? '',
    reticleVisible: !document.getElementById('landing-reticle')?.classList.contains('hidden'),
    reticleWidth: parseFloat(document.querySelector('#landing-reticle .ring')?.style.width || '0'),
  };
});
check('5a1. addressing shows a yellow landing area that agrees with the real carry',
  landingPreview.visible && landingPreview.club === 'iron'
    && landingPreview.distance > 90 && landingPreview.radius > 2
    && Math.abs(landingPreview.distance / landingPreview.actualCarry - 1) < 0.10
    && landingPreview.yellow === 0xffdf57 && /yd landing area/i.test(landingPreview.label)
    && landingPreview.reticleVisible && landingPreview.reticleWidth >= 54,
  JSON.stringify(landingPreview));
if (CAPTURE_SCREENSHOTS) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({
    path: path.join(ROOT, 'docs', 'validation', 'golf', '13-landing-preview.png'),
  });
  await page.setViewportSize({ width: 480, height: 300 });
}
check('5a2. the first tee recommends the safe middle instead of the water-side pin',
  playerClubView.plan.club === 'iron' && playerClubView.plan.label === 'MIDDLE GREEN'
    && Math.hypot(
      playerClubView.plan.target.x - 11.4,
      playerClubView.plan.target.z - (-150.4),
    ) > 3,
  JSON.stringify(playerClubView.plan));

await page.waitForTimeout(100);
const addressGuide = await page.evaluate(() => document.getElementById('golf-guide')?.textContent?.trim() || '');
check('5b. addressing the ball teaches the first swing click',
  /aim/i.test(addressGuide) && /click once/i.test(addressGuide), addressGuide);

await page.evaluate(() => window.__golf.swing.click());
await page.waitForTimeout(100);
const powerHud = await page.evaluate(() => {
  const meter = document.getElementById('meter');
  return {
    guide: document.getElementById('golf-guide')?.textContent?.trim() || '',
    visible: !meter?.classList.contains('hidden'),
    ideal: meter?.querySelector('.ideal')?.textContent?.trim() || '',
    risk: meter?.querySelector('.risk-copy')?.textContent?.trim() || '',
    targetLeft: meter?.querySelector('.target')?.style.left || '',
    riskWidth: meter?.querySelector('.risk-zone')?.style.width || '',
  };
});
check('5c. the live swing coach teaches the power click',
  /set your power/i.test(powerHud.guide)
    && /(click again|press space)/i.test(powerHud.guide),
  powerHud.guide);
check('5e. the power meter shows both the ideal target and overswing zone',
  powerHud.visible && /ideal \d+%/i.test(powerHud.ideal)
    && /overswing \d+%\+/i.test(powerHud.risk)
    && /%$/.test(powerHud.targetLeft) && parseFloat(powerHud.riskWidth) > 0,
  JSON.stringify(powerHud));
if (CAPTURE_SCREENSHOTS) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(120);
  await fsp.mkdir(path.join(ROOT, 'docs', 'validation', 'golf'), { recursive: true });
  await page.screenshot({
    path: path.join(ROOT, 'docs', 'validation', 'golf', '08-swing-power.png'),
  });
  await page.setViewportSize({ width: 480, height: 300 });
}

await page.evaluate(() => window.__golf.swing.click());
await page.waitForTimeout(100);
const strikeHud = await page.evaluate(() => ({
  guide: document.getElementById('golf-guide')?.textContent?.trim() || '',
  left: document.querySelector('#meter .ideal')?.textContent?.trim() || '',
  right: document.querySelector('#meter .risk-copy')?.textContent?.trim() || '',
}));
check('5d. the live swing coach teaches the strike click',
  /strike/i.test(strikeHud.guide) && /third/i.test(strikeHud.guide), strikeHud.guide);
check('5f. the strike meter teaches the direction of early and late misses',
  /late.*draw.*hook/i.test(strikeHud.left) && /early.*fade.*slice/i.test(strikeHud.right),
  JSON.stringify(strikeHud));
/* Freeze only the verifier's evidence frame. A 1280px software-rendered
 * screenshot can take longer than the entire return sweep; allowing that time
 * to advance would auto-fire a shot while the harness is photographing it. */
await page.evaluate(() => {
  window.__golf.swing.marker = Math.max(0.45, window.__golf.swing.marker);
  window.__golf.swing.strikeSpeed = 0;
});
if (CAPTURE_SCREENSHOTS) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(80);
  await page.screenshot({
    path: path.join(ROOT, 'docs', 'validation', 'golf', '09-swing-strike.png'),
  });
  await page.setViewportSize({ width: 480, height: 300 });
}
await page.evaluate(() => window.__golf.swing.reset());

const aimed = await page.evaluate(() => {
  const g = window.__golf;
  const start = g.aimYaw;
  g.setAim(start + 0.2);
  return { moved: Math.abs(g.aimYaw - start) > 0.15 };
});
check('6. the player can aim', aimed.moved);

const shotOriginReturn = await page.evaluate(() => {
  const g = window.__golf;
  const originalBall = { ...g.round.playerBall.position };
  const originalPlayer = { x: g.player.position.x, z: g.player.position.z };
  g.round.playerBall.placeAt(originalBall.x + 35, originalBall.z - 70);
  g.leaveAddress();
  const returned = { x: g.player.position.x, z: g.player.position.z };
  g.round.playerBall.placeAt(originalBall.x, originalBall.z);
  g.enterAddress();
  return {
    fromOrigin: Math.hypot(returned.x - originalPlayer.x, returned.z - originalPlayer.z),
    fromLanding: Math.hypot(returned.x - (originalBall.x + 35), returned.z - (originalBall.z - 70)),
  };
});
check('6b. flight cleanup returns to the shot origin, not the landing',
  shotOriginReturn.fromOrigin < 0.1 && shotOriginReturn.fromLanding > 10,
  JSON.stringify(shotOriginReturn));

const pointerFallback = await page.evaluate(() => {
  const g = window.__golf;
  document.exitPointerLock?.();
  g.swing.reset();
  const beforeAim = g.aimYaw;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
  window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  const result = { phase: g.swing.phase, aimDelta: Math.abs(g.aimYaw - beforeAim) };
  g.swing.reset();
  return result;
});
check('6c. keyboard aim and unlocked click work without pointer lock',
  pointerFallback.phase === 'power' && pointerFallback.aimDelta > 0.005,
  JSON.stringify(pointerFallback));

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

const tempo = await page.evaluate(async () => {
  const { controlWindow, resolveStrike, shotShape } = await import('/src/golf/swing.js');
  const safe = controlWindow({ club: 'driver', power: 0.82, lieSpread: 0 });
  const hard = controlWindow({ club: 'driver', power: 1, lieSpread: 0 });
  const centered = resolveStrike({ club: 'driver', power: 1, strike: 0 });
  const early = resolveStrike({ club: 'driver', power: 1, strike: 0.15 });
  return {
    narrower: hard.deadZone < safe.deadZone,
    faster: hard.strikeSpeed > safe.strikeSpeed,
    readableSpeed: safe.strikeSpeed < 1.55,
    centered: shotShape(centered.accuracy),
    early: shotShape(early.accuracy),
  };
});
check('7b. overswinging makes the timing harder and produces golf shot shapes',
  tempo.narrower && tempo.faster && tempo.readableSpeed
    && tempo.centered === 'fade' && tempo.early === 'slice',
  JSON.stringify(tempo));

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
  g.setClub('putter');
  g.setAim(Math.atan2(
    g.LAYOUT.pin.x - g.round.playerBall.position.x,
    g.LAYOUT.pin.z - g.round.playerBall.position.z,
  ));
  g.swing.reset();
  g.swing.click();
  g.swing.marker = 0.30;
  g.swing.click();
  g.swing.marker = 0;
  g.swing.click();
  g.fireSwing();
  return { before, after: g.round.card.hole('prospect', 1).strokes };
});
check('18. the stroke count updates on every shot',
  strokeCount.after === strokeCount.before + 1,
  `${strokeCount.before} → ${strokeCount.after}`);

/* This settles purely on the real animation-frame loop rather than the
 * harness's own `step()`, so its wall-clock cost rides on whatever
 * rendering throughput the machine actually has right now, the same way the
 * page-load waits above it already budget 30-60s rather than a tight one.
 * 15s cut it close under real contention (a shared, resource-constrained
 * sandbox running several Playwright instances at once) even though the
 * putt itself settles in a couple of simulated seconds. */
await page.waitForFunction(() => !window.__golf.round.playerBall.moving, null, { timeout: 45000 });
await page.waitForTimeout(120);
const shotPresentation = await page.evaluate(() => {
  const result = document.getElementById('shot-result');
  const tracer = window.__golf.scene.getObjectByName('player-shot-tracer');
  return {
    visible: !!result && !result.classList.contains('hidden'),
    quality: result?.querySelector('.quality')?.textContent?.trim() || '',
    outcome: result?.querySelector('.outcome')?.textContent?.trim() || '',
    tracerPoints: tracer?.geometry?.attributes?.position?.count ?? 0,
  };
});
check('18b. a real swing leaves a flight trace and landing result',
  shotPresentation.visible && /pured/i.test(shotPresentation.quality)
    && /(yds.*ft to pin|in the cup)/i.test(shotPresentation.outcome)
    && shotPresentation.tracerPoints >= 3,
  JSON.stringify(shotPresentation));
if (CAPTURE_SCREENSHOTS) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({
    path: path.join(ROOT, 'docs', 'validation', 'golf', '12-shot-result.png'),
  });
  await page.setViewportSize({ width: 480, height: 300 });
}

/* ------------------------------------------------------------------ */
/* 20–21, 24–25 · the cart, Lou, the green, finishing                  */
/* ------------------------------------------------------------------ */

const cartEvidence = await page.evaluate(() => {
  const g = window.__golf;
  g.leaveAddress();
  for (let i = 0; i < 5000 && g.round.beat !== 'cart'; i++) {
    if (g.dialogue.active && g.dialogue.options.length) g.dialogue.choose(0);
    g.step(0.05);
  }
  const start = { x: g.carts.lead.position.x, z: g.carts.lead.position.z };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  for (let i = 0; i < 80 && g.round.beat === 'cart'; i++) {
    if (g.dialogue.active && g.dialogue.options.length) g.dialogue.choose(0);
    g.step(0.05);
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  return {
    beat: g.round.beat,
    drove: g.carts.playerDriving,
    moved: Math.hypot(
      g.carts.lead.position.x - start.x,
      g.carts.lead.position.z - start.z,
    ),
  };
});
check('20a. live throttle input moves the player cart before the mission can advance',
  cartEvidence.beat === 'cart' && cartEvidence.drove && cartEvidence.moved > 4,
  JSON.stringify(cartEvidence));
await page.setViewportSize({ width: 1280, height: 720 });
/* The verification stepper owns game state, while the real animation frame
 * owns the first-person camera. Let one frame apply the cart view before
 * inspecting and capturing it. */
await page.waitForTimeout(120);
const cartView = await page.evaluate(() => {
  const g = window.__golf;
  const forward = g.camera.getWorldDirection(g.player.position.clone());
  const cartForward = g.player.position.clone().set(0, 0, 1)
    .applyQuaternion(g.carts.lead.group.quaternion).normalize();
  const radioWorld = g.carts.lead.radio.getWorldPosition(g.player.position.clone());
  const radioDirection = radioWorld.clone().sub(g.camera.position).normalize();
  const radioScreen = radioWorld.project(g.camera);
  return {
    forwardDot: forward.dot(cartForward),
    radioOnScreen: forward.dot(radioDirection) > 0
      && Math.abs(radioScreen.x) < 0.96
      && Math.abs(radioScreen.y) < 0.96 && radioScreen.z > -1 && radioScreen.z < 1,
    radioScreen: radioScreen.toArray(),
  };
});
check('20a1. the driver looks forward and can see the physical cart radio',
  cartView.forwardDot > 0.94 && cartView.radioOnScreen,
  JSON.stringify(cartView));
const cartGuide = await page.evaluate(() => ({
  exit: window.__golf.round.cartExitState(),
  distance: window.__golf.round.cartDistanceToBall(),
  text: document.getElementById('golf-guide')?.textContent?.trim() || '',
}));
check('20a2. the driving HUD keeps pointing to a distant ball instead of telling the player to park',
  cartGuide.distance > 12 && /drive/i.test(cartGuide.text) && !/park beside/i.test(cartGuide.text),
  JSON.stringify(cartGuide));
const cartRadioControl = await page.evaluate(async () => {
  const g = window.__golf;
  await g.waitForCartRadioAudio();
  g.audio.clearPlaybackLog();
  const before = g.cartRadio.on;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
  const toggled = g.cartRadio.on;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' }));
  const tuned = g.cartRadio.on;
  const lamp = g.carts.lead.group.getObjectByName('golf-cart-radio-power');
  const ident = g.cartRadio.station?.ident ?? '';
  const panner = g.cartRadio.panner;
  const pannerPosition = panner?.positionX
    ? [panner.positionX.value, panner.positionY.value, panner.positionZ.value]
    : [];
  const sourcePosition = g.cartRadio.position.toArray();
  return {
    mode: g.camMode,
    before, toggled, tuned,
    station: g.cartRadio.station?.dial ?? '',
    lamp: lamp?.material?.color?.getHex?.() ?? 0,
    ident,
    audibleIdent: g.audio.playbacks.some((playback) => (
      playback.name === ident && playback.source === 'buffer'
    )),
    pannerPosition,
    sourcePosition,
    savedPower: g.cartRadio.state?.load?.().power,
    preferredOn: g.cartRadio.preferredOn,
    venue: g.cartRadio.venue,
    playlist: g.cartRadio.playlist.map((track) => track.title),
  };
});
check('20a3. the cart radio is audible, spatial, persistent, and course-scoped',
  cartRadioControl.mode === 'cart'
    && cartRadioControl.toggled !== cartRadioControl.before
    && cartRadioControl.tuned === true
    && !!cartRadioControl.station && cartRadioControl.lamp === 0x6dff9c
    && cartRadioControl.audibleIdent
    && cartRadioControl.pannerPosition.length === 3
    && cartRadioControl.pannerPosition.every((value, index) => (
      Math.abs(value - cartRadioControl.sourcePosition[index]) < 0.001
    ))
    && cartRadioControl.savedPower === cartRadioControl.preferredOn
    && cartRadioControl.venue === 'silver_pines'
    && !cartRadioControl.playlist.includes('Cosmic Drift'),
  JSON.stringify(cartRadioControl));
if (CAPTURE_SCREENSHOTS) {
  await page.waitForTimeout(100);
  await page.screenshot({
    path: path.join(ROOT, 'docs', 'validation', 'golf', '11-cart-drive.png'),
  });
}
await page.setViewportSize({ width: 480, height: 300 });
const played = await page.evaluate(async () => {
  const g = window.__golf;
  const { layoutFor } = await import('/src/golf/hole.js');
  const { SEQUENCES } = await import('/src/golf/script.js');
  const h2GreenExpected = SEQUENCES['h2.green.big_night'];
  const spokenCueOrder = [];
  const originalSay = g.cues.hooks.say;
  g.cues.hooks.say = (cue, seconds) => {
    spokenCueOrder.push(cue.id);
    return originalSay?.(cue, seconds);
  };
  const seen = new Set();
  const beats = [];
  const holesPlayed = [g.HOLE.number];
  const visualState = () => {
    const names = [];
    g.course.holeGroup.traverse((object) => { if (object.name) names.push(object.name); });
    const clubhouse = g.course.holeGroup.getObjectByName('clubhouse');
    return {
      hole: g.HOLE.number,
      cardHole: document.querySelector('#golfcard .hole')?.textContent?.trim() || '',
      plan: g.plan(),
      names,
      hasLot: !!g.LAYOUT.lot,
      clubhouse: clubhouse
        ? { x: clubhouse.position.x, z: clubhouse.position.z }
        : null,
      expectedClubhouse: g.LAYOUT.clubhouse,
      sideCooler: g.course.sideCooler
        ? {
          x: g.course.sideCooler.group.position.x,
          z: g.course.sideCooler.group.position.z,
          cans: g.course.sideCooler.cans.length,
        }
        : null,
      expectedSideCooler: g.LAYOUT.sideCooler ?? null,
    };
  };
  const visuals = [visualState()];
  let louPrivate = false;
  let cartMoved = false;
  let playerDrove = false;
  let earlyExitBlocked = false;
  let parkedCount = 0;
  let louRodePassenger = false;
  let followStayedClose = false;
  let cartStart = null;
  let cartHole = null;
  let npcActionsProper = true;
  let soloRetrievalSeen = false;
  const npcActionSamples = [];

  for (let i = 0; i < 50000; i++) {
    if (!seen.has(g.round.beat)) { seen.add(g.round.beat); beats.push(g.round.beat); }
    if (g.round.beat === 'cart') {
      soloRetrievalSeen ||= g.round._cartFromTee === false;
      if (cartHole !== g.HOLE.number) {
        cartHole = g.HOLE.number;
        cartStart = { x: g.carts.lead.position.x, z: g.carts.lead.position.z };
      }
      playerDrove ||= g.carts.playerDriving;
      cartMoved ||= Math.hypot(
        g.carts.lead.position.x - cartStart.x,
        g.carts.lead.position.z - cartStart.z,
      ) > 5;
      followStayedClose ||= g.carts.follow.position.distanceTo(g.carts.lead.position) < 24;

      const lou = g.golfers.lou.position;
      const passenger = g.carts.lead.seatWorld('passenger');
      const driver = g.carts.lead.seatWorld('driver');
      louRodePassenger ||= Math.hypot(lou.x - passenger.x, lou.z - passenger.z) < 0.25
        && Math.hypot(lou.x - driver.x, lou.z - driver.z) > 0.4;

      if (!earlyExitBlocked) {
        const early = g.round.leaveCart();
        earlyExitBlocked = !early.ok && g.round.beat === 'cart';
      }

      const ball = g.round.playerBall.position;
      const cart = g.carts.lead;
      const dx = ball.x - cart.position.x;
      const dz = ball.z - cart.position.z;
      const distance = Math.hypot(dx, dz);
      const wanted = Math.atan2(dx, dz);
      let delta = (wanted - cart.group.rotation.y) % (Math.PI * 2);
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      if (distance > 9) {
        g.player.setKey('KeyW', true);
        g.player.setKey('KeyA', delta > 0.08);
        g.player.setKey('KeyD', delta < -0.08);
        g.player.setKey('Space', false);
      } else {
        g.player.setKey('KeyW', false);
        g.player.setKey('KeyA', false);
        g.player.setKey('KeyD', false);
        g.player.setKey('Space', true);
        if (Math.abs(cart.velocity) <= 0.55 && !g.dialogue.active && !g.cues.busy) {
          if (g.round.leaveCart().ok) parkedCount++;
        }
      }
    }
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
      /* Hole 2 owns a long authored green conversation. Stay beside the ball
       * until the real CueQueue has spoken that block, otherwise a synthetic
       * tap-in can finish the hole before the line under test reaches the
       * floor and turn this into a static reference check again. */
      const hearingH2Green = g.HOLE.number === 2 && onGreen
        && !h2GreenExpected.every((id) => g.cues.heard(id));
      if (hearingH2Green) {
        /* The solver can address remotely, but the production trigger belongs
         * to the player entering the green. Put the harness beside its live
         * ball, as an actual player must be, before waiting on the dialogue. */
        g.teleport(b.x, b.z);
        g.step(0.05);
        continue;
      }
      const useClub = onGreen || d < 12 ? 'putter' : 'iron';
      g.setClub(useClub);
      const solved = g.solve(
        { x: b.x, z: b.z }, { x: g.LAYOUT.pin.x, z: g.LAYOUT.pin.z }, useClub,
      );
      g.setAim(solved.aim);
      g.hit(solved.power, 0);
    }
    if (g.round.needsRelief()) g.round.takeDrop();
    if (g.round.beat === 'walk_off') {
      g.teleport(g.carts.lead.position.x, g.carts.lead.position.z);
    }
    /* Walk onto the next tee. The scene does this behind a fade; the harness
     * runs faster than the fade, so it takes the same transition directly. */
    if (g.round.beat === 'next_tee') {
      const n = g.advanceToNextHole();
      if (n !== null) {
        holesPlayed.push(n);
        visuals.push(visualState());
      }
    }
    const beforeNpc = ['eric', 'lou', 'rippinflow'].map((id) => ({
      id,
      strokes: g.round.card.hole(id, g.HOLE.number).strokes,
      ball: {
        x: g.round.ballFor(id).position.x,
        z: g.round.ballFor(id).position.z,
      },
      launched: g.round._npcApproachJobs.get(id)?.launched === true,
    }));
    g.step(0.05);
    for (const before of beforeNpc) {
      const after = g.round.card.hole(before.id, g.HOLE.number).strokes;
      const launched = g.round._npcApproachJobs.get(before.id)?.launched === true;
      if (after <= before.strokes || before.strokes < 1 || before.launched || !launched) continue;
      const golfer = g.golfers[before.id].position;
      const distance = Math.hypot(golfer.x - before.ball.x, golfer.z - before.ball.z);
      npcActionSamples.push({ hole: g.HOLE.number, id: before.id, distance });
      npcActionsProper &&= distance < 1.6;
    }
    if (g.round.beat === 'done') break;
  }
  const h = g.round.card.hole('prospect', 1);
  const line = g.round.card.line('prospect');
  const npcTotals = {};
  const expectedNpcTotals = {};
  for (const id of ['eric', 'lou', 'rippinflow']) {
    npcTotals[id] = g.round.card.line(id).strokes;
    expectedNpcTotals[id] = g.round.holes.reduce((sum, hole) => (
      sum + (layoutFor(hole)?.npcPlan?.[id]?.finish ?? 0)
    ), 0);
  }
  const effectCounts = {};
  for (const cue of ['golf.tee', 'golf.pickup', 'golf.flag']) {
    effectCounts[cue] = g.audio.playbacks.filter(({ name }) => name === cue).length;
  }
  return {
    beats, louPrivate, cartMoved, playerDrove, earlyExitBlocked, parkedCount,
    louRodePassenger, followStayedClose, soloRetrievalSeen,
    npcActionsProper, npcActionSamples, holesPlayed,
    npcTotals, expectedNpcTotals,
    finished: h.finished, strokes: h.strokes,
    beat: g.round.beat,
    allFinished: g.round.card.allFinished(1),
    lines: g.round.card.lines().map((l) => `${l.card}:${l.strokes}`),
    roundStrokes: line.strokes,
    roundToPar: line.label,
    built: g.round.holes, visuals, effectCounts,
    h2GreenExpected,
    h2GreenSpoken: spokenCueOrder.filter((id) => h2GreenExpected.includes(id)),
    replayVisible: document.getElementById('endcard-again')?.hidden === false,
    dialogueState: {
      active: g.dialogue.active,
      node: g.dialogue.nodeId,
      reason: g.dialogue.lastEndReason,
      options: g.dialogue.options.length,
      inReplyRange: g.dialogue._inReplyRange,
      timer: g.dialogue.timer,
      distanceToLou: Math.hypot(
        g.player.position.x - g.golfers.lou.position.x,
        g.player.position.z - g.golfers.lou.position.z,
      ),
    },
  };
});
check('20. the player drives and parks the lead cart beside the ball',
  played.beats.includes('cart') && played.playerDrove && played.cartMoved
    && played.earlyExitBlocked && played.parkedCount >= played.built.length,
  JSON.stringify({
    drove: played.playerDrove,
    moved: played.cartMoved,
    earlyExitBlocked: played.earlyExitBlocked,
    parked: played.parkedCount,
    dialogue: played.dialogueState,
  }));
check('20b. Lou rides beside the player and Erican keeps the second cart with them',
  played.louRodePassenger && played.followStayedClose,
  JSON.stringify({ louPassenger: played.louRodePassenger, followClose: played.followStayedClose }));
check('20c. long approach shots return the player to the live cart for retrieval',
  played.soloRetrievalSeen && played.parkedCount > played.built.length,
  JSON.stringify({ soloRetrieval: played.soloRetrievalSeen, parked: played.parkedCount }));
check("21. Lou's private conversation triggers on the ride", played.louPrivate);
check('21a. the authored Hole 2 green conversation plays every line in order, including Nehoo',
  JSON.stringify(played.h2GreenSpoken) === JSON.stringify(played.h2GreenExpected)
    && played.h2GreenSpoken.includes('golf.h2.lou.nehoo'),
  `${played.h2GreenSpoken.length}/${played.h2GreenExpected.length} lines; Nehoo at ${played.h2GreenSpoken.indexOf('golf.h2.lou.nehoo') + 1}`);
check('21b. every NPC walks to his live ball before each approach swing',
  played.npcActionsProper && played.npcActionSamples.length >= 9,
  played.npcActionSamples.map((s) => `H${s.hole} ${s.id} ${s.distance.toFixed(1)}m`).join(' / '));
check('21c. NPC cards finish on their authored story scores',
  Object.keys(played.expectedNpcTotals)
    .every((id) => played.npcTotals[id] === played.expectedNpcTotals[id]),
  JSON.stringify({ actual: played.npcTotals, expected: played.expectedNpcTotals }));
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
const visualBase = ['flag', 'hole-marker', 'tee-marker-left', 'tee-marker-right', 'clubhouse', 'clubhouse-sign'];
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
check('28d1. the clubhouse carries its own name and the Family\'s grille room on its facade',
  [1, 2, 3].every((hole) => visualByHole.get(hole)?.names.includes('clubhouse-sign')),
  played.visuals.map((visual) => `H${visual.hole}: ${visual.names.includes('clubhouse-sign')}`).join(' | '));
check('28d1b. only Hole 1 has a car park, and only Hole 1 builds its entrance sign there',
  visualByHole.get(1)?.names.includes('entrance-sign')
    && !visualByHole.get(2)?.names.includes('entrance-sign')
    && !visualByHole.get(3)?.names.includes('entrance-sign'),
  played.visuals.map((visual) => `H${visual.hole}: ${visual.names.includes('entrance-sign')}`).join(' | '));
check('28d1c. every hole stocks its own trailside cooler at the authored spot beside the path',
  [1, 2, 3].every((hole) => {
    const v = visualByHole.get(hole);
    return v?.sideCooler && v.expectedSideCooler
      && Math.abs(v.sideCooler.x - v.expectedSideCooler.x) < 0.01
      && Math.abs(v.sideCooler.z - v.expectedSideCooler.z) < 0.01
      && v.sideCooler.cans === 6;
  }),
  played.visuals.map((visual) => `H${visual.hole}: ${JSON.stringify(visual.sideCooler)}`).join(' | '));
check('28d2. the score HUD follows the active hole',
  played.visuals.every((visual) => visual.cardHole.startsWith(`HOLE ${visual.hole} ·`)),
  played.visuals.map((visual) => `H${visual.hole}: ${visual.cardHole}`).join(' | '));
check('28d3. every tee opens on its authored safe target and club',
  playerClubView.plan.club === 'iron'
    && playerClubView.plan.label === 'MIDDLE GREEN'
    && visualByHole.get(2)?.plan.club === 'driver'
    && visualByHole.get(2)?.plan.label === 'SAFE SIDE'
    && visualByHole.get(3)?.plan.club === 'driver'
    && visualByHole.get(3)?.plan.label === 'LEFT FAIRWAY',
  [`H1: ${playerClubView.plan.club} at ${playerClubView.plan.label}`]
    .concat(played.visuals.filter((visual) => visual.hole > 1)
      .map((visual) => `H${visual.hole}: ${visual.plan.club} at ${visual.plan.label}`))
    .join(' | '));
check('28e. tee, pickup, and flag cues all fire during the real round',
  npcPlayed.teeEffect >= 1
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

await page.goto(GOLF_CANONICAL_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__golfReady === true', null, { timeout: 60000 });
await page.evaluate(() => window.__golf.campaign.update((state) => {
  state.scene = { id: 'silver_pines', spawn: 'car_park' };
  state.story.chapter = 'golf_morning';
  if (!state.story.timeEvents.includes('travel.silver_pines')) {
    state.story.timeEvents.push('travel.silver_pines');
  }
  state.missions.silver_room.status = 'complete';
  state.events.lou_golf_call.status = 'answered';
  state.missions.silver_pines = {
    ...state.missions.silver_pines,
    status: 'in_progress',
    holesPlayed: 2,
    strokes: 9,
    penalties: 1,
    toPar: 1,
    holes: [
      { hole: 1, par: 3, strokes: 4, penalties: 1 },
      { hole: 2, par: 5, strokes: 5, penalties: 0 },
    ],
    heardInvitation: true,
    rodeWithLou: true,
  };
}));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__golfReady === true', null, { timeout: 60000 });
await page.click('#start-btn');
await page.waitForFunction(
  'window.__golf.HOLE.number === 3 && window.__golf.round.beat === "tee_talk"',
  null,
  { timeout: 60000 },
);
const resumedRound = await page.evaluate(() => ({
  hole: window.__golf.HOLE.number,
  priorStrokes: window.__golf.round.card.line('prospect').strokes,
  priorHoles: window.__golf.round.card.line('prospect').holes
    .filter((hole) => hole.finished).map((hole) => hole.hole),
  npcPrior: window.__golf.round.card.finished('eric', 1)
    && window.__golf.round.card.finished('eric', 2),
  hasBag: window.__golf.round.hasBag,
  card: document.querySelector('#golfcard .hole')?.textContent?.trim() || '',
}));
check('29b. reloading an in-progress round resumes at the first unfinished tee',
  resumedRound.hole === 3 && resumedRound.priorStrokes === 9
    && resumedRound.priorHoles.join(',') === '1,2' && resumedRound.npcPrior
    && resumedRound.hasBag && resumedRound.card.startsWith('HOLE 3 ·'),
  JSON.stringify(resumedRound));

/* ------------------------------------------------------------------ */
/* Preview checkpoint links (?preview=1&checkpoint=...)                 */
/*
 * Each waypoint gets its own fresh page/preview campaign, the way an owner
 * clicking a preview.html link would load it. `__golf.step()` is used
 * elsewhere in this file specifically because software rendering runs at
 * about a frame a second (see the file header) -- these checks lean on the
 * same fact: the checkpoint's own staging in src/golf/main.js is entirely
 * synchronous (`story.recordHole()` / `round.restoreProgress()` /
 * `round.startHole()`), so no waiting on real frames is needed here either.
 */
for (const [id, expect] of [
  ['hole1', { hole: 1, staged: 0 }],
  ['hole2', { hole: 2, staged: 1 }],
  ['hole3', { hole: 3, staged: 2 }],
  ['grille', { hole: null, staged: 3 }],
]) {
  const cpPage = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const cpProblems = [];
  cpPage.on('pageerror', (error) => cpProblems.push(error.message));
  cpPage.on('console', (message) => {
    if (message.type() === 'error') cpProblems.push(message.text().slice(0, 240));
  });
  await cpPage.goto(`http://localhost:${PORT}/golf.html?preview=1&checkpoint=${id}`, { waitUntil: 'load' });
  await cpPage.waitForFunction('window.__golfReady === true', null, { timeout: 60000 });
  const chip = await cpPage.evaluate(() => document.querySelector('#overlay .tag')?.textContent ?? '');
  // Coordinates, not a locator click -- same reasoning as 1a's own start
  // click above: a locator's stable-frame wait can outlast any reasonable
  // ceiling on this software rasteriser's continuous redraw.
  const startBox = await cpPage.evaluate(() => {
    const r = document.getElementById('start-btn').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await cpPage.mouse.click(startBox.x, startBox.y);
  // `window.__golf` (and its round.beat) exists from module load, before
  // Start is ever clicked, so waiting on it alone would resolve before
  // `boot()` has staged anything. `body.playing` is only added inside boot().
  await cpPage.waitForFunction(() => document.body.classList.contains('playing'), null, { timeout: 60000 });
  const result = await cpPage.evaluate(() => {
    const g = window.__golf;
    const mission = g.campaign.state.missions.silver_pines;
    return {
      holeNumber: g.HOLE.number,
      beat: g.round.beat,
      missionStatus: mission.status,
      holesStaged: mission.holes.length,
      endcardHidden: document.getElementById('endcard')?.classList.contains('hidden'),
    };
  });
  const holeOk = expect.hole === null
    ? result.missionStatus === 'complete' && result.endcardHidden === false
    : result.holeNumber === expect.hole && result.endcardHidden !== false;
  check(`?preview=1&checkpoint=${id} loads staged and lands on the right hole`,
    holeOk && result.holesStaged === expect.staged
      && chip.startsWith('Preview checkpoint:') && cpProblems.length === 0,
    JSON.stringify({ ...result, chip, problems: cpProblems }));
  await cpPage.close();
}

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
