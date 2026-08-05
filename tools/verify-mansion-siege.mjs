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

/**
 * Hold a key until a condition is true, in one-second bites, still walking.
 *
 * A fixed walk duration has to be re-tuned every time a doorway or a body
 * moves -- and worse, it fails in the direction that looks like broken
 * geometry rather than a stale number. This keeps the walk real and lets the
 * DESTINATION be the assertion. `cap` is the honest failure: if he has not
 * arrived in twenty seconds of held W, the way is genuinely blocked.
 */
async function walkUntil(done, keys = ['KeyW'], cap = 20, bite = 0.35) {
  for (const k of keys) await page.keyboard.down(k);
  let elapsed = 0;
  let where = await at();
  while (elapsed < cap && !done(where)) {
    await settle(bite);
    elapsed += bite;
    const next = await at();
    /* Stopped dead against something with the condition still false. */
    if (Math.hypot(next.x - where.x, next.z - where.z) < 0.02) { where = next; break; }
    where = next;
  }
  for (const k of keys) await page.keyboard.up(k);
  await settle(0.2);
  return { ...(await at()), seconds: Number(elapsed.toFixed(2)) };
}

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
      /* `addedNames`, not `liveNames`. A suppressed entry is LIVE in a clean
       * house on purpose -- the intact pane it names is standing, because
       * nothing is broken yet. Reading liveNames() here reported twenty-two
       * unbroken windows as a leak. */
      live: window.mansionSiege.addedNames(),
      suppressed: window.mansionSiege.suppressedNames(),
      colliders: window.mansionSiege.collidersCount,
    };
  });
  check('the house boots clean, with nothing the siege added standing in it',
    clean.live.length === 0, `${clean.live.length} live: ${clean.live.slice(0, 6).join(', ')}`);
  check('and with nothing of the house taken away',
    clean.suppressed.length === 0, `${clean.suppressed.length} withdrawn`);

  const attacked = await evaluate(() => {
    window.mansionSiege.setState('under_attack');
    return {
      live: window.mansionSiege.addedNames(),
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
      out[s] = window.mansionSiege.addedNames().length;
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

  /* THE ROUTE CHECKS ARE ABOUT GEOMETRY, NOT SURVIVAL.
   *
   * With the corridor pair and the foyer three actually standing in the house
   * -- which they now are -- a verifier that walks the route slowly gets shot
   * on it, the checkpoint correctly puts him back in the armory, and the next
   * check measures a player at BASEMENT_Y and reports the horseshoe
   * unclimbable. That is the mission working, reported as the house broken.
   * Dying is proven on purpose in section 7, with this switched off again. */
  await evaluate(() => window.mansionSiege.setInvulnerable(true));

  /* The corridor pair are in the house before he is on his feet -- they are
   * why the guard on the settee is dead. Nothing released them; they were
   * authored, and for a while nothing PLACED them either, which is the
   * quietest way an encounter can be missing. */
  const corridorMen = await evaluate(() => ({
    placed: window.mansionSiege.placed(),
    standing: window.mansionSiege.encounterStanding('corridor'),
    foyer: window.mansionSiege.encounterStanding('foyer'),
  }));
  check('two men are already in the cellar corridor when he wakes',
    corridorMen.standing === 2 && corridorMen.foyer === 0, JSON.stringify(corridorMen));

  /* ---------------------------------------------------------------- */
  /* 3. The route to the armory, on foot                                */
  /*                                                                     */
  /* HEADINGS, measured rather than assumed. Yaw 0 walks -Z (toward the   */
  /* front of the house), 90 walks -X (west), 180 walks +Z, 270 walks +X  */
  /* (east). The guest room is at z 67.7..74.6 and the corridor at        */
  /* z 64.3..67.4, so the way OUT of the bedroom is yaw 0, and the way    */
  /* along the corridor to the armory door (CELLAR_DOOR, x 5.35..7.05) is */
  /* yaw 270. The first version of this walked him into the west wall and */
  /* reported the corridor unwalkable.                                    */
  /* ---------------------------------------------------------------- */
  await faceDeg(0);
  await walk(6);
  const corridor = await at();
  check('he can walk out of the guest room into the cellar corridor on foot',
    inRect(corridor, route.cellarHall), `(${corridor.x}, ${corridor.z})`);

  /* Off the south wall first. Coming out of the bedroom door carries him to
   * within a third of a metre of the corridor's far side, and a player
   * pressed into a wall walks at a fifth of his own speed -- which measures
   * as a blocked corridor rather than as a bad line. Back up to the centre
   * line, and back up BY DESTINATION: a fixed 1.2 s overshot to z 67.45,
   * which is the corridor's NORTH wall, and pinned him there instead. */
  await walkUntil((p) => p.z >= 65.6, ['KeyS'], 4);
  await faceDeg(270);
  /* CELLAR_DOOR -- the one gap in the armory's north wall -- measures
   * x 5.7..6.8 on the colliders. Walk east until he is under it. */
  const eastEnd = await walkUntil((p) => p.x >= 5.9);
  check('the corridor is walkable east with the fight standing in it',
    eastEnd.x > corridor.x + 8, `x ${corridor.x} -> ${eastEnd.x} in ${eastEnd.seconds}s`);

  /* South through the armory door. Walked, not teleported -- that door is
   * the one the brief calls a long way under fire. */
  await faceDeg(0);
  await walkUntil((p) => p.z <= 62.5, ['KeyW'], 12);
  const reachedArmory = await evaluate(() => ({
    beat: window.mansionSiege.beat,
    objective: window.mansionSiege.objective,
    pos: {
      x: +window.mansionSiege.player.position.x.toFixed(2),
      z: +window.mansionSiege.player.position.z.toFixed(2),
    },
  }));
  check('reaching the armory completes the first objective',
    reachedArmory.beat === 'ARM' && reachedArmory.objective === 'Arm yourself',
    JSON.stringify(reachedArmory));

  /* Placed while he is in the armory -- two rooms and a storey away -- so he
   * does not watch them arrive, he comes up the stair into them. */
  const foyerMen = await evaluate(() => window.mansionSiege.encounterStanding('foyer'));
  check('three men are in the foyer before he ever sees the foyer', foyerMen === 3,
    `${foyerMen} standing`);

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
  /* The east flight of the horseshoe runs z 42..48 at x 5.5..8.85, so the
   * climb is +Z from the foyer floor -- yaw 180. */
  await teleport(7, GROUND_Y, 41, 180);
  await settle(0.4);
  await walk(10);
  const upstairs = await at();
  check('the horseshoe can be climbed on foot with the foyer fight standing in it',
    upstairs.ground > UPPER_Y - 0.6, `ground ${upstairs.ground}`);

  /* The office is z 63.2..75 upstairs and the conference room is south of
   * it, so the walk in is +Z -- yaw 180. */
  await teleport(0, UPPER_Y, 60, 180);
  await settle(0.4);
  await walk(7);
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
  const wrongPlace = await evaluate(() => {
    window.mansionSiege.equip('saw');
    return window.mansionSiege.beats.line();
  });
  check('the line does not fire from wherever you happen to be standing, even with the heavy up',
    wrongPlace === false);

  const post = await evaluate(() => window.mansionSiege.route.defencePost);
  await teleport((post.x0 + post.x1) / 2, UPPER_Y, (post.z0 + post.z1) / 2 - 0.4, 180);
  await settle(0.3);
  const said = await evaluate(() => {
    /* The heavy has to actually be IN HIS HANDS, not merely ticked off the
     * armory's list -- that is the gate being tested. */
    const s = window.mansionSiege;
    s.equip('saw');
    const equipped = s.equipped;
    const first = s.beats.line();
    const second = s.beats.line();
    return { first, second, equipped, beat: s.beat };
  });
  check('with the heavy up on the firing step, the line fires and starts wave one',
    said.first === true && said.beat === 'WAVE_ONE', JSON.stringify(said));
  check('the line does not fire twice', said.second === false);

  /* ---------------------------------------------------------------- */
  /* 7. Waves: shape, staging, and nobody out of thin air               */
  /*                                                                     */
  /* DYING IS TESTED FIRST, AND THEN SWITCHED OFF. Standing on the        */
  /* landing while four men shoot at you is a fine thing for a player to  */
  /* do and a terrible thing for a verifier to do: the checkpoint         */
  /* correctly rewinds the mission to the beat before the line, and every */
  /* wave assertion after that then measures a mission that went back in  */
  /* time. That is the mission WORKING, reported as the mission broken.   */
  /* So: prove the death path once, on purpose, then take it out of the   */
  /* way of the structural checks.                                        */
  /* ---------------------------------------------------------------- */
  const died = await evaluate(() => {
    const s = window.mansionSiege;
    s.setInvulnerable(false);
    const before = s.beat;
    const after = s.killPlayer();
    return { before, after, hp: s.playerHealth, down: s.playerDown, cp: s.checkpoint };
  });
  check('going down in wave one rewinds to the last checkpoint rather than ending the run',
    died.before === 'WAVE_ONE' && died.after === 'LITTLE_FRIEND' && died.hp === 100
      && died.down === false,
    JSON.stringify(died));

  /* Back to the top of the stairs, say it again, and this time do not die. */
  await teleport((post.x0 + post.x1) / 2, UPPER_Y, (post.z0 + post.z1) / 2 - 0.4, 180);
  await settle(0.3);
  await evaluate(() => {
    const s = window.mansionSiege;
    s.setInvulnerable(true);
    s.equip('saw');
    s.beats.line();
  });

  const waveOne = await evaluate(() => {
    const s = window.mansionSiege;
    /* WAVE attackers only. The corridor pair and the foyer three are inside
     * the house on purpose -- they were already in it when he woke up -- so
     * counting them here would report the authored encounters as men
     * appearing in the room with you. */
    const waveIds = new Set(s.mission.waves.one.standing);
    return {
      standing: s.mission.waves.one.standing.size,
      released: [...s.mission.waves.one.released],
      spawned: s.attackers.all()
        .filter((e) => waveIds.has(e.id))
        .map((e) => ({ x: +e.root.position.x.toFixed(2), z: +e.root.position.z.toFixed(2) })),
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

  /* ---------------------------------------------------------------- */
  /* 7a. THE FRONT DOOR IS THE WAY IN                                   */
  /*                                                                     */
  /* OWNER DIRECTION, 2026-08-05: "everyone should funnel in through the  */
  /* main door". Asserted on the ROUTES the men are actually carrying,    */
  /* not on the names of their staging zones -- a zone called             */
  /* `front_steps` whose route enters through a window would pass the      */
  /* second check and fail the player.                                    */
  /* ---------------------------------------------------------------- */
  const doorway = await evaluate(() => {
    const s = window.mansionSiege;
    const waveIds = new Set(s.mission.waves.one.standing);
    const men = s.attackers.all().filter((e) => waveIds.has(e.id));
    return men.map((e) => ({
      id: e.id,
      staging: e.staging.id,
      /* Every opening his authored route crosses, in order. */
      crossings: e.path.filter((p) => p.breaks).map((p) => p.breaks.id),
      /* And where it ends up. */
      last: e.path.length ? e.path[e.path.length - 1].anchor : null,
      dest: e.destination,
    }));
  });
  check('wave one comes up the drive and in the front door, all of it',
    doorway.length > 0 && doorway.every((m) => m.staging === 'front_steps' || m.staging === 'court_north'),
    doorway.map((m) => m.staging).join(', '));
  check('and nobody in wave one breaks a window on the way',
    doorway.every((m) => m.crossings.length === 0),
    doorway.flatMap((m) => m.crossings).join(', ') || 'none');
  check('every one of them is routed onto the landing or the flights',
    doorway.every((m) => /^(gallery|balcony|stair)/.test(m.dest ?? '')),
    doorway.map((m) => `${m.id.slice(-4)}:${m.dest}`).join(' '));
  check('and no two of them are sent to the same place on it',
    new Set(doorway.map((m) => m.dest)).size === doorway.length,
    doorway.map((m) => m.dest).join(', '));

  /* THE ROOM TABLE, AGAINST THE REAL BUILDERS.
   *
   * `src/mansion/siege/nav.js` writes the house out as numbers rather than
   * importing MansionGrounds.js, for the reason every other headless module
   * in this directory gives: that import builds canvas textures at module
   * scope. The copy is only safe if something compares it to the original,
   * and the browser is the one place both are loaded at once. */
  const plan = await evaluate(async () => {
    const nav = await import('/src/mansion/siege/nav.js');
    const grounds = await import('/src/mansion/scenes/MansionGrounds.js');
    const interior = await import('/src/mansion/scenes/MansionInterior.js');
    const near = (a, b) => Math.abs(a - b) < 0.001;
    const same = (room, real) => near(room.x0, real.x0) && near(room.x1, real.x1)
      && near(room.z0, real.z0) && near(room.z1, real.z1);
    const rows = [
      ['foyer', interior.FOYER], ['living', interior.LIVING], ['lounge', interior.LOUNGE],
      ['ballroom', interior.BALLROOM], ['dining', interior.DINING], ['kitchen', interior.KITCHEN],
      ['gallery', interior.GALLERY], ['trophy', grounds.TROPHY_HALL],
      ['bay', grounds.LOUNGE_BAY], ['cellar', grounds.CELLAR_HALL],
      ['guest', grounds.GUEST_ROOM], ['armory', grounds.BASEMENT_ROOM],
      ['stair_west', interior.STAIR_WEST], ['stair_east', interior.STAIR_EAST],
    ];
    const wrong = rows.filter(([id, real]) => !same(nav.ROOMS[id], real)).map(([id]) => id);
    /* And the front door, which is the whole direction. */
    const door = nav.OPENINGS.find((o) => o.id === 'frontDoor');
    const doorOk = near(door.at, grounds.FRONT_DOOR.z)
      && near(door.u0, grounds.FRONT_DOOR.x0) && near(door.u1, grounds.FRONT_DOOR.x1);
    /* And the two flights, whose heights the climb waypoints are lerped from. */
    const flightOk = near(nav.FLIGHT_Z0, interior.STAIR_WEST.z0)
      && near(nav.FLIGHT_Z1, interior.STAIR_WEST.z1)
      && near(nav.GROUND_Y, grounds.GROUND_Y) && near(nav.UPPER_Y, grounds.UPPER_Y);
    return { wrong, doorOk, flightOk, rooms: rows.length };
  });
  check("the nav graph's copy of the floor plan matches the house it is a copy of",
    plan.wrong.length === 0, `${plan.rooms} rooms, wrong: ${plan.wrong.join(', ') || 'none'}`);
  check('the front door the routes funnel through is the front door the house has',
    plan.doorOk && plan.flightOk, JSON.stringify(plan));

  /* AND THE ROUTES ARE WALKABLE, measured against the house's own colliders.
   *
   * The room table above proves the copy matches the plan. This proves the
   * plan is walkable, which is a different claim and the one that matters:
   * an anchor inside a burning car, a stair spandrel or a basement stairwell
   * is a place the graph will happily send eight men to, and a leg through
   * the billiard table is a route nobody would author on purpose.
   *
   * `tools/probe-siege-anchors.mjs` reports the same thing box by box, which
   * is how each of these was moved off the thing it was in rather than
   * nudged until the number went down. Six anchors and eight legs were.
   *
   * A box only obstructs when it stands 0.25 m PROUD of the floor he is on:
   * below that it is a sill, a threshold or a stairwell newel, and
   * docs/ENGINE-TRAPS.md is explicit that nothing lying on a floor should be
   * solid. Measured from his feet, not from the box's own height -- the case
   * that caught this was a four-metre post rising out of the basement whose
   * top clears the foyer floor by six centimetres. */
  const stuck = await evaluate(async () => {
    const nav = await import('/src/mansion/siege/nav.js');
    const attackers = await import('/src/mansion/siege/attackers.js');
    const s = window.mansionSiege;
    /* The SAME ground function the attackers walk on. A check that resolves
     * height differently from the thing it checks measures its own sums. */
    const heightAt = (a) => (a.y != null ? a.y : attackers.groundHeightAt(a.x, a.z));
    const solidTo = (box, y) => box?.min && box.max.y > y + 0.25 && box.min.y < y + 1.75;
    const anchors = [];
    for (const anchor of nav.ANCHORS) {
      const y = heightAt(anchor);
      for (const box of s.colliders) {
        if (!solidTo(box, y)) continue;
        if (anchor.x < box.min.x - 0.3 || anchor.x > box.max.x + 0.3) continue;
        if (anchor.z < box.min.z - 0.3 || anchor.z > box.max.z + 0.3) continue;
        anchors.push(anchor.id);
        break;
      }
    }
    const legs = [];
    const seen = new Set();
    for (const anchor of nav.ANCHORS) {
      for (const id of anchor.neighbors) {
        const other = nav.anchorById(id);
        const key = [anchor.id, id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        /* A pane he BREAKS is not a pane he walks through: the two flank
         * routes are supposed to cross glass, and that is the beat. */
        const crossing = nav.crossingFor(
          { x: anchor.x, z: anchor.z, y: anchor.y },
          { x: other.x, z: other.z, y: other.y },
        );
        if (crossing?.opening.glass) continue;
        const floor = Math.min(heightAt(anchor), heightAt(other));
        const dx = other.x - anchor.x;
        const dz = other.z - anchor.z;
        for (const box of s.colliders) {
          if (!solidTo(box, floor)) continue;
          let t0 = 0;
          let t1 = 1;
          let clear = false;
          for (const [from, delta, lo, hi] of [
            [anchor.x, dx, box.min.x - 0.25, box.max.x + 0.25],
            [anchor.z, dz, box.min.z - 0.25, box.max.z + 0.25],
          ]) {
            if (Math.abs(delta) < 1e-6) {
              if (from < lo || from > hi) { clear = true; break; }
              continue;
            }
            let near = (lo - from) / delta;
            let far = (hi - from) / delta;
            if (near > far) { const sw = near; near = far; far = sw; }
            if (near > t0) t0 = near;
            if (far < t1) t1 = far;
            if (t0 > t1) { clear = true; break; }
          }
          if (clear) continue;
          legs.push(`${anchor.id}->${id}`);
          break;
        }
      }
    }
    return { anchors, legs, count: nav.ANCHORS.length };
  });
  check('no nav anchor is standing inside something solid',
    stuck.anchors.length === 0,
    `${stuck.count} anchors, ${stuck.anchors.slice(0, 6).join(', ') || 'all clear'}`);
  check('and no leg between two of them walks through the furniture',
    stuck.legs.length === 0, stuck.legs.slice(0, 6).join(', ') || 'all clear');

  /* ---------------------------------------------------------------- */
  /* 7b. AND THE FIGHT COMES TO THE RAIL                                */
  /*                                                                     */
  /* The direction, measured rather than reasoned about: put him on the   */
  /* firing step, let wave one walk, and see where it ends up. If nobody  */
  /* climbs, the mission is a shooting gallery pointed at a doorway.      */
  /* ---------------------------------------------------------------- */
  await teleport((post.x0 + post.x1) / 2, UPPER_Y, (post.z0 + post.z1) / 2 - 0.4, 180);
  await settle(0.3);
  const cameToMe = await evaluate(async () => {
    const nav = await import('/src/mansion/siege/nav.js');
    const s = window.mansionSiege;
    const waveIds = new Set([...s.mission.waves.one.standing]);
    let onLanding = 0;
    let closest = Infinity;
    const climbed = new Set();
    /* Sixty seconds is the walk from the turnaround to the gallery with a
     * fight on the way and a suppression roll or two. Nobody is shot -- this
     * measures where they GO. */
    for (let t = 0; t < 60; t += 1.5) {
      s.tick(1.5);
      const men = s.attackers.all()
        .filter((e) => waveIds.has(e.id) && e.active && !e.actor.incapacitated);
      let up = 0;
      for (const man of men) {
        const room = nav.roomAt(man.root.position);
        if (room === 'gallery' || room === 'balcony') { up++; climbed.add(man.id); }
        closest = Math.min(closest, man.root.position.distanceTo(s.player.position));
      }
      onLanding = Math.max(onLanding, up);
    }
    return {
      onLanding, climbed: climbed.size, closest: +closest.toFixed(1), of: waveIds.size,
    };
  });
  /* MOST OF THEM, NOT ALL OF THEM. Whether a given rifleman spends this
   * minute on the landing or behind the wrecked centrepiece is a cover roll,
   * and a verifier that demands four out of four fails on a dice throw. That
   * every one of them is ROUTED to the landing is asserted exactly, above,
   * on the authored path; this is the behavioural half. */
  check('the fight comes to the balcony instead of queueing in the doorway',
    cameToMe.climbed >= 3, `${cameToMe.climbed} of ${cameToMe.of} reached the landing`);
  check('and they get close enough to be a problem at the rail',
    cameToMe.closest < 6, `nearest ${cameToMe.closest}m`);

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
    s.tick(14);
    return {
      beat: s.beat,
      standing: s.mission.waves.two.standing.size,
      total: s.mission.waves.two.totalCount,
      /* The beats actually walked, in order. A mission that quietly rewound
       * on a death shows up here as a repeat rather than as a mystery. */
      history: s.mission.history.join('>'),
    };
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
  /* Held keys, not a bare tick. The first version of this ran the whole walk
   * inside page.evaluate(), where there is no keyboard -- so it ticked ten
   * seconds with no input, measured zero metres, and reported the corridor
   * blocked. A verifier that cannot tell "nobody pressed anything" from "the
   * way is walled up" is worse than no verifier. */
  const hall = route.cellarHall;
  const hallMid = (hall.z0 + hall.z1) / 2;
  await teleport(hall.x0 + 1.5, BASEMENT_Y, hallMid, 270);
  await settle(0.3);
  const navStart = await at();
  await walk(10);
  const navEnd = await at();
  const nav = { start: navStart.x, end: navEnd.x };
  check('nothing the siege put in the cellar corridor blocks it',
    nav.end - nav.start > 8, `x ${nav.start} -> ${nav.end}`);

  /* ---------------------------------------------------------------- */
  /* 10. The boundary, and a frame that is not black                    */
  /* ---------------------------------------------------------------- */
  const bounded = await evaluate(() => {
    const s = window.mansionSiege;
    /* Yaw 0 walks him AWAY from the house, at the boundary. Walking back
     * toward it would pass whatever he was standing on and prove nothing. */
    s.teleport(0, 0, 22, 0);
    s.tick(8);
    return { z: +s.player.position.z.toFixed(2), min: s.route.boundary.z0 };
  });
  check('the player cannot walk out of the fight', bounded.z >= bounded.min - 0.1,
    `z ${bounded.z}, boundary ${bounded.min}`);

  await teleport(0, GROUND_Y, 44, 0);
  await evaluate(() => window.mansionSiege.setRendering(true));
  await settle(0.5);
  await page.waitForTimeout(1200);
  /* Long, and deliberately so. Swiftshader is drawing a burning forecourt,
   * thirty-nine people and three smoke layers with no GPU; every other long
   * wait in this repo's verify scripts exists for the same reason. */
  const shot = await page.screenshot({ type: 'png', timeout: 300000 });
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
