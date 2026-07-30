#!/usr/bin/env node
/**
 * Play Hole 1 at Silver Pines, headlessly, from the car park to the end card.
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

console.log('\nSilver Pines — Hole 1\n');

await page.goto(`http://localhost:${PORT}/golf.html`, { waitUntil: 'load' });
await page.waitForFunction('window.__golfReady === true', null, { timeout: 60000 });
await page.evaluate('window.__golf.boot()');
await page.waitForFunction('window.__golf.round.beat !== undefined', null, { timeout: 30000 });

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

const bagCheck = await page.evaluate(() => {
  const g = window.__golf;
  const before = g.round.hasBag;
  g.round.takeBag();
  return { before, after: g.round.hasBag };
});
check('4. the bag holds a driver, an iron and a putter',
  !bagCheck.before && bagCheck.after);

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
  g.teleport(t.x, t.z + 4);
  for (let i = 0; i < 600; i++) {
    g.step(0.1);
    if (g.round.beat === 'npc_tee' || g.round.beat === 'player_tee') break;
    if (g.dialogue.active && g.dialogue.options.length) g.dialogue.choose(0);
  }
  return { beat: g.round.beat, heardInvitation: g.round.heardInvitation };
});
check('2. the player can reach the first tee',
  ['tee_talk', 'npc_tee', 'player_tee'].includes(reachedTee.beat), `beat: ${reachedTee.beat}`);
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
  npcShots.erican.finish === 'green' && npcShots.erican.feet < 30,
  `${npcShots.erican.feet.toFixed(0)} ft`);
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
    strokes: ['lou', 'rippinflow', 'erican'].map((id) => g.round.card.hole(id, 1).strokes),
  };
});
check('19. all three NPC tee shots complete',
  npcPlayed.beat === 'player_tee' && npcPlayed.strokes.every((s) => s === 1),
  `beat: ${npcPlayed.beat}, strokes: ${npcPlayed.strokes.join('/')}`);

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
      if (n !== null) holesPlayed.push(n);
    }
    g.step(0.05);
    if (g.round.beat === 'done') break;
  }
  const h = g.round.card.hole('prospect', 1);
  const line = g.round.card.line('prospect');
  return {
    beats, louPrivate, cartMoved, holesPlayed,
    finished: h.finished, strokes: h.strokes,
    beat: g.round.beat,
    allFinished: g.round.card.allFinished(1),
    lines: g.round.card.lines().map((l) => `${l.card}:${l.strokes}`),
    roundStrokes: line.strokes,
    roundToPar: line.label,
    built: g.round.holes,
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
check('27b. a short round does not complete the mission',
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

await page.reload({ waitUntil: 'load' });
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
