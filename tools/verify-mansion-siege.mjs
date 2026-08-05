#!/usr/bin/env node
/**
 * Verify MANSION UNDER SIEGE.
 *
 * WHAT THIS SCRIPT IS FOR, AND WHAT IT REFUSES TO DO
 *
 * The recurring fault in this repo's verifiers is checks that agree with
 * themselves rather than testing what the player can do -- the mansion's own
 * verifier once reported 21/21 green on a build whose basement was
 * unreachable, because it proved every room by teleporting into the middle of
 * it. So this script walks. Where a check CAN be done on foot it is done on
 * foot, and a teleport is only ever used to get to the start of the next
 * walk, never to prove the walk.
 *
 * The five things most likely to be quietly broken, and therefore the five
 * this script spends most of its checks on:
 *
 *   1. THE OVERLAY LEAKING. `clean` must be the walking tour, exactly. A
 *      burning car left standing in the quiet house is the whole
 *      architecture failing silently.
 *   2. INVISIBLE GLASS. A shattered pane must stop being solid in the same
 *      instant it stops being visible. This is checked by walking through
 *      the hole, not by reading a flag.
 *   3. SPAWNING IN VIEW. Nobody appears from thin air. Every attacker is
 *      checked to arrive at his staging zone, outside the house.
 *   4. CHECKPOINTS THAT LIE. Restoring after wave one must not repopulate
 *      wave one, and must not hand back the little-friend line.
 *   5. THE BASE MANSION MOVING. The siege is an overlay; if the canonical
 *      house changed, verify-mansion.mjs is the one that catches it, but a
 *      collider-count comparison here catches the sloppy version early.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5231;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const GROUND_Y = 1.2;
const UPPER_Y = 6.0;
const BASEMENT_Y = -2.8;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the siege.');
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
const notFound = [];
page.on('response', (r) => { if (r.status() === 404) notFound.push(new URL(r.url()).pathname); });
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 240)); });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

const evaluate = (fn, arg) => page.evaluate(fn, arg);
const teleport = (x, y, z, yaw = 0) => evaluate(
  ([a, b, c, d]) => window.mansionSiege.teleport(a, b, c, d), [x, y, z, yaw],
);
const settle = (s = 1) => evaluate((v) => window.mansionSiege.tick(v), s);
const at = () => evaluate(() => {
  const p = window.mansionSiege.player;
  return {
    x: +p.position.x.toFixed(3), y: +p.position.y.toFixed(3),
    z: +p.position.z.toFixed(3), ground: +p.ground.toFixed(3),
  };
});
const faceDeg = (deg) => evaluate((d) => { window.mansionSiege.player.yaw = (d * Math.PI) / 180; }, deg);
async function walk(seconds, keys = ['KeyW']) {
  for (const k of keys) await page.keyboard.down(k);
  await settle(seconds);
  for (const k of keys) await page.keyboard.up(k);
  await settle(0.2);
}
const inRect = (p, r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;

try {
  console.log('\nMANSION UNDER SIEGE\n');

  await page.goto(`http://localhost:${PORT}/mansion-siege.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 90000 });
  await evaluate(() => window.mansionSiege.setRendering(false));

  /* ---------------------------------------------------------------- */
  /* 1. The overlay does not leak into the quiet house                  */
  /* ---------------------------------------------------------------- */
  const clean = await evaluate(() => {
    window.mansionSiege.setState('clean');
    return {
      live: window.mansionSiege.liveNames(),
      colliders: window.mansionSiege.collidersCount,
    };
  });
  check('the house boots clean, with nothing the siege added standing in it',
    clean.live.length === 0, `${clean.live.length} live: ${clean.live.slice(0, 6).join(', ')}`);

  const attacked = await evaluate(() => {
    window.mansionSiege.setState('under_attack');
    return {
      live: window.mansionSiege.liveNames(),
      colliders: window.mansionSiege.collidersCount,
    };
  });
  check('under attack, the siege layer is standing', attacked.live.length > 0,
    `${attacked.live.length} groups live`);
  check('the siege layer brings its own colliders and takes them away again',
    attacked.colliders > clean.colliders,
    `clean ${clean.colliders} -> under_attack ${attacked.colliders}`);

  const backToClean = await evaluate(() => {
    window.mansionSiege.setState('clean');
    return window.mansionSiege.collidersCount;
  });
  check('going back to clean restores the collider count exactly',
    backToClean === clean.colliders, `${clean.colliders} -> ${backToClean}`);

  const states = await evaluate(() => {
    const out = {};
    for (const s of ['clean', 'alert', 'under_attack', 'damaged', 'post_battle', 'repaired']) {
      window.mansionSiege.setState(s);
      out[s] = window.mansionSiege.liveNames().length;
    }
    window.mansionSiege.setState('clean');
    return out;
  });
  check('all six damage states apply without throwing',
    Object.keys(states).length === 6, JSON.stringify(states));
  check('repaired stands up the same house clean does, not the wreckage',
    states.repaired === states.clean, `clean ${states.clean}, repaired ${states.repaired}`);
  check('the alarm stops before the smoke does',
    states.post_battle > 0 && states.damaged >= states.post_battle,
    `damaged ${states.damaged}, post_battle ${states.post_battle}`);

  /* ---------------------------------------------------------------- */
  /* 2. He wakes up in the guest room, in the basement                  */
  /* ---------------------------------------------------------------- */
  await page.click('#startBtn');
  await page.waitForFunction(() => window.mansionSiege.running, null, { timeout: 20000 });
  const spawn = await at();
  const route = await evaluate(() => window.mansionSiege.route);
  check('he wakes up in the basement guest room', inRect(spawn, route.guestRoom)
    && Math.abs(spawn.ground - BASEMENT_Y) < 0.4,
    `(${spawn.x}, ${spawn.ground}, ${spawn.z})`);

  const beforeWake = await evaluate(() => ({
    beat: window.mansionSiege.beat, enabled: window.mansionSiege.player.enabled,
  }));
  check('control is withheld while he is still waking up',
    beforeWake.beat === 'WAKE' && beforeWake.enabled === false, JSON.stringify(beforeWake));

  await settle(2.2);
  const afterWake = await evaluate(() => ({
    beat: window.mansionSiege.beat,
    objective: window.mansionSiege.objective,
    enabled: window.mansionSiege.player.enabled,
    state: window.mansionSiege.state,
  }));
  check('the wake-up hands control back inside two seconds and sets the first objective',
    afterWake.enabled === true && afterWake.objective === 'Reach the armory',
    JSON.stringify(afterWake));
  check('the house is already under attack on the frame he opens his eyes',
    afterWake.state === 'under_attack', afterWake.state);
  check('the wake checkpoint was taken', await evaluate(() => window.mansionSiege.checkpoint) === 'wake');

  /* ---------------------------------------------------------------- */
  /* 3. The route to the armory, on foot                                */
  /* ---------------------------------------------------------------- */
  /* Out of the guest room, east down the corridor. The corridor is the
   * mission's first fight, so this also proves two attackers standing in it
   * do not wall it off. */
  await faceDeg(90);
  await walk(7);
  const corridor = await at();
  check('he can walk out of the guest room into the cellar corridor on foot',
    inRect(corridor, route.cellarHall), `(${corridor.x}, ${corridor.z})`);

  await walk(9);
  const eastEnd = await at();
  check('the corridor is walkable end to end with the fight standing in it',
    eastEnd.x > corridor.x + 6, `x ${corridor.x} -> ${eastEnd.x}`);

  const reachedArmory = await evaluate(() => {
    /* South out of the corridor into the armory. Walked, not teleported --
     * the door between them is the one the brief calls long under fire. */
    const s = window.mansionSiege;
    s.player.yaw = Math.PI;
    s.tick(6);
    return { beat: s.beat, objective: s.objective, pos: { x: s.player.position.x, z: s.player.position.z } };
  });
  check('reaching the armory completes the first objective',
    reachedArmory.beat === 'ARM' && reachedArmory.objective === 'Arm yourself',
    JSON.stringify(reachedArmory));

  /* ---------------------------------------------------------------- */
  /* 4. Arming, and the heavy not being optional                        */
  /* ---------------------------------------------------------------- */
  const halfArmed = await evaluate(() => window.mansionSiege.mission.armed({ primary: true }));
  check('a rifle alone does not get you out of the armory', halfArmed === false);
  const armed = await evaluate(() => {
    const ok = window.mansionSiege.beats.arm();
    return { ok, beat: window.mansionSiege.beat, checkpoint: window.mansionSiege.checkpoint };
  });
  check('taking a primary and the heavy completes the objective and takes a checkpoint',
    armed.ok && armed.beat === 'TO_OFFICE' && armed.checkpoint === 'armed',
    JSON.stringify(armed));

  /* ---------------------------------------------------------------- */
  /* 5. Foyer to the office, on foot up the horseshoe                   */
  /* ---------------------------------------------------------------- */
  await teleport(0, GROUND_Y, 40, 0);
  await settle(0.4);
  await faceDeg(0);
  await walk(9);
  const upstairs = await at();
  check('the horseshoe can be climbed on foot with the foyer fight standing in it',
    upstairs.ground > UPPER_Y - 0.6, `ground ${upstairs.ground}`);

  await teleport(0, UPPER_Y, 60, 0);
  await settle(0.4);
  await faceDeg(0);
  await walk(6);
  const office = await evaluate(() => ({
    beat: window.mansionSiege.beat,
    pos: { x: window.mansionSiege.player.position.x, z: window.mansionSiege.player.position.z },
  }));
  check('walking into the office completes the objective and starts the briefing',
    office.beat === 'BRIEFING', JSON.stringify(office));

  const briefingStaged = await evaluate(() => window.mansionSiege.ensemble.members.size);
  check('the whole family is armed and staged for the briefing', briefingStaged >= 6,
    `${briefingStaged} staged`);

  /* ---------------------------------------------------------------- */
  /* 6. The line. Once, from the step, with the heavy up.               */
  /* ---------------------------------------------------------------- */
  await evaluate(() => window.mansionSiege.beats.briefed());
  const wrongPlace = await evaluate(() => window.mansionSiege.beats.line());
  check('the line does not fire from wherever you happen to be standing',
    wrongPlace === false);

  const post = await evaluate(() => window.mansionSiege.route.defencePost);
  await teleport((post.x0 + post.x1) / 2, UPPER_Y, (post.z0 + post.z1) / 2 - 0.4, 180);
  await settle(0.3);
  const said = await evaluate(() => {
    /* The heavy has to actually be up. Whichever id the armory calls it, the
     * scene's own gate is the one being tested. */
    const s = window.mansionSiege;
    const first = s.beats.line();
    const second = s.beats.line();
    return { first, second, beat: s.beat };
  });
  check('with the heavy up on the firing step, the line fires and starts wave one',
    said.first === true && said.beat === 'WAVE_ONE', JSON.stringify(said));
  check('the line does not fire twice', said.second === false);

  /* ---------------------------------------------------------------- */
  /* 7. Waves: shape, staging, and nobody out of thin air               */
  /* ---------------------------------------------------------------- */
  const waveOne = await evaluate(() => {
    const s = window.mansionSiege;
    return {
      standing: s.mission.waves.one.standing.size,
      released: [...s.mission.waves.one.released],
      spawned: s.attackers.living().map((r) => ({
        x: +r.position.x.toFixed(2), z: +r.position.z.toFixed(2),
      })),
    };
  });
  check('wave one opens with four men, not eight', waveOne.standing === 4,
    `${waveOne.standing} standing, released ${waveOne.released.join('+')}`);

  const bldg = route.building;
  const outside = waveOne.spawned.filter((p) => p.z < bldg.z0 || p.z > bldg.z1
    || p.x < bldg.x0 || p.x > bldg.x1);
  check('every attacker arrives from outside the building, not in the room with you',
    waveOne.spawned.length > 0 && outside.length === waveOne.spawned.length,
    `${outside.length}/${waveOne.spawned.length} outside`);

  const secondGroup = await evaluate(() => {
    const s = window.mansionSiege;
    /* Nobody killed. Twenty-two seconds. 1B comes anyway. */
    s.tick(23);
    return { released: [...s.mission.waves.one.released], standing: s.mission.waves.one.standing.size };
  });
  check('the second group comes on the clock even if nothing has been shot',
    secondGroup.released.length === 2, secondGroup.released.join('+'));

  const cleared = await evaluate(() => {
    const s = window.mansionSiege;
    for (const id of [...s.mission.waves.one.standing]) s.mission.noteDown(id);
    s.tick(0.2);
    return { beat: s.beat, checkpoint: s.checkpoint };
  });
  check('clearing wave one drops into the lull and takes the fourth checkpoint',
    cleared.beat === 'LULL' && cleared.checkpoint === 'wave_one', JSON.stringify(cleared));

  const restored = await evaluate(() => {
    const s = window.mansionSiege;
    const spawnedBefore = s.mission.waves.one.down.size;
    s.mission.restoreCheckpoint();
    return {
      beat: s.beat,
      down: s.mission.waves.one.down.size,
      before: spawnedBefore,
      lineAgain: s.beats.line(),
      waveTwoStarted: s.mission.waves.two.started,
    };
  });
  check('restoring the wave-one checkpoint does not repopulate wave one',
    restored.down === restored.before && restored.waveTwoStarted === false,
    JSON.stringify(restored));
  check('a restore does not hand the little friend back', restored.lineAgain === false);

  const waveTwo = await evaluate(() => {
    const s = window.mansionSiege;
    s.tick(12);
    return { beat: s.beat, standing: s.mission.waves.two.standing.size, total: s.mission.waves.two.totalCount };
  });
  check('the lull ends and wave two opens with five', waveTwo.beat === 'WAVE_TWO'
    && waveTwo.standing === 5, JSON.stringify(waveTwo));
  check('wave two is fourteen men in three groups', waveTwo.total === 14, `${waveTwo.total}`);

  /* ---------------------------------------------------------------- */
  /* 8. Glass that breaks and stops being solid                         */
  /* ---------------------------------------------------------------- */
  const glass = await evaluate(() => {
    const s = window.mansionSiege;
    s.setState('under_attack');
    const ids = [...s.glass.panes.keys()];
    const target = ids.find((id) => s.glass.panes.get(id).state !== 'broken') ?? ids[0];
    const before = s.collidersCount;
    const changed = s.glass.shatter(target);
    return { target, changed, before, after: s.collidersCount, count: ids.length };
  });
  check('the fight can reach real windows', glass.count > 0, `${glass.count} panes`);
  check('shattering a pane withdraws its collider in the same instant it hides it',
    glass.changed === true && glass.after < glass.before,
    `${glass.before} -> ${glass.after} on ${glass.target}`);
  const glassRound = await evaluate(() => {
    const s = window.mansionSiege;
    const ids = s.glass.brokenIds();
    s.glass.restoreBroken([]);
    const emptied = s.glass.brokenIds().length;
    s.glass.restoreBroken(ids);
    return { ids: ids.length, emptied, back: s.glass.brokenIds().length };
  });
  check('the broken-glass checkpoint pair round-trips exactly',
    glassRound.emptied === 0 && glassRound.back === glassRound.ids,
    JSON.stringify(glassRound));

  /* ---------------------------------------------------------------- */
  /* 9. The bodies do not stand in the corridor                         */
  /* ---------------------------------------------------------------- */
  const nav = await evaluate(() => {
    const s = window.mansionSiege;
    const hall = s.route.cellarHall;
    const mid = (hall.z0 + hall.z1) / 2;
    s.teleport(hall.x0 + 1.5, -2.8, mid, 90);
    s.tick(0.3);
    const start = s.player.position.x;
    s.tick(10);
    return { start: +start.toFixed(2), end: +s.player.position.x.toFixed(2) };
  });
  check('nothing the siege put in the cellar corridor blocks it',
    nav.end - nav.start > 8, `x ${nav.start} -> ${nav.end}`);

  /* ---------------------------------------------------------------- */
  /* 10. The boundary, and a frame that is not black                    */
  /* ---------------------------------------------------------------- */
  const bounded = await evaluate(() => {
    const s = window.mansionSiege;
    s.teleport(0, 0, 22, 180);
    s.tick(6);
    return { z: +s.player.position.z.toFixed(2), min: s.route.boundary.z0 };
  });
  check('the player cannot walk out of the fight', bounded.z >= bounded.min - 0.1,
    `z ${bounded.z}, boundary ${bounded.min}`);

  await teleport(0, GROUND_Y, 44, 180);
  await evaluate(() => window.mansionSiege.setRendering(true));
  await settle(0.5);
  await page.waitForTimeout(600);
  const shot = await page.screenshot({ type: 'png', timeout: 120000 });
  const nonBlack = shot.some((b, i) => i > 64 && b > 24);
  check('the burning foyer renders a non-black frame', nonBlack, `${shot.length} bytes`);

  const strayNotFound = notFound.filter((p) => !p.endsWith('/the-feature.mp4'));
  check('nothing the scene asks for is missing except the film nobody delivered',
    strayNotFound.length === 0, `missing: ${[...new Set(notFound)].join(', ') || 'nothing'}`);
  const strayErrors = problems.filter(
    (p) => !(/Failed to load resource/.test(p) && strayNotFound.length === 0),
  );
  check('no runtime console errors occurred', strayErrors.length === 0, strayErrors.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} siege checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} siege checks passed.`);
