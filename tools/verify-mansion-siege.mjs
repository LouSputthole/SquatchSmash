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
import { inspectRequiredAudioBank } from './required-audio-bank.mjs';

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
    /* Direct SwiftShader intermittently invalidates the first instanced
     * MeshDepthMaterial link in this shadow-heavy scene. Keep software
     * rendering deterministic by routing it through Chromium's ANGLE path. */
    '--use-gl=angle',
    '--use-angle=swiftshader',
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

  /* ---------------------------------------------------------------- */
  /* 0. THE FRAME'S BILL                                                */
  /*                                                                    */
  /* This block is first because everything after it turns rendering    */
  /* OFF, and a scene that is never drawn cannot be caught being        */
  /* undrawable. That is not hypothetical: this file reported 93/93     */
  /* green on the build the owner measured at a five-minute load and    */
  /* one frame per second on an RTX 4080. It passed because             */
  /* `setRendering(false)` was the third line of the run, so no check   */
  /* here had ever waited for a picture.                               */
  /*                                                                    */
  /* The cause was `main.js` seeding its practical-light rig with       */
  /* nothing, leaving all 228 of the house's point lights visible;      */
  /* three.js compiles every visible light into every material, and     */
  /* the first frame's shader compile never returned. So the pin is a   */
  /* WALL CLOCK on the first drawn frame, plus the three structural     */
  /* budgets that keep the frame affordable in the first place.         */
  /* ---------------------------------------------------------------- */
  const bootStart = Date.now();
  await page.goto(`http://localhost:${PORT}/mansion-siege.html?preview=1`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 90000 });
  const readyMs = Date.now() - bootStart;
  /* A scene handle is not a picture. Measured in this harness: 4.6 s to the
   * handle and 15.3 s to the fourth frame with the rig seeded; with it empty,
   * the handle still arrived in 58 s and no frame ever did -- the tab was
   * killed at 360 s. 120 s is far above any healthy value on a loaded box and
   * far below a scene that cannot compile. */
  await page.waitForFunction(() => window.mansionSiege.framesRendered > 3, null, { timeout: 180000 });
  const firstFrameMs = Date.now() - bootStart;
  check('the siege draws its first frames inside the boot budget',
    firstFrameMs < 120000,
    `${(readyMs / 1000).toFixed(1)}s to the scene, ${(firstFrameMs / 1000).toFixed(1)}s to frame four (budget 120s)`);

  const budget = await evaluate(() => {
    const s = window.mansionSiege;
    let interiorCasters = 0;
    s.interior.root.traverse((o) => { if (o.isMesh && o.castShadow) interiorCasters++; });
    return {
      lights: s.perf.visibleLights,
      shadowCasters: s.perf.shadowCasters(),
      interiorCasters,
      transmissive: s.perf.transmissiveMeshes(),
      minMetres: +s.perf.minMetres.toFixed(3),
    };
  });
  /* three.js compiles every VISIBLE light into every material's shader. The
   * rig holds ten practicals; the rest of the allowance is the moon, the
   * hemisphere fill, the five exterior spots and the sets' own glows. */
  check('no more lights are lit than the shader budget allows',
    budget.lights <= 24, `${budget.lights} lit (budget 24)`);
  /* The only shadow-casting light in this scene is the moon, and it is
   * outside. The shell is already between it and everything indoors. */
  check('nothing inside the house casts the moon\'s shadow',
    budget.interiorCasters === 0, `${budget.interiorCasters} interior casters`);
  check('the shadow pass is a few hundred objects, not a few thousand',
    budget.shadowCasters <= 1200,
    `${budget.shadowCasters} casters, minimum ${budget.minMetres} m (budget 1200)`);
  /* One transmissive object makes three re-render the whole opaque list into
   * an offscreen target. One decanter therefore draws the house twice. */
  check('nothing refracts, so the opaque scene is drawn once per frame',
    budget.transmissive === 0, `${budget.transmissive} transmissive meshes`);

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
  const arrivalLoadout = await evaluate(() => ({
    ...window.mansionSiege.loadout.checkpoint(),
    equippedInHands: window.mansionSiege.equipped,
    renderedSlots: document.querySelectorAll('#hotbar .slot').length,
    hotbarHidden: document.getElementById('hotbar')?.classList.contains('hidden') ?? true,
  }));
  check('the inherited final-arc loadout renders as five usable slots on arrival',
    arrivalLoadout.slots.length === 5 && arrivalLoadout.renderedSlots === 5
      && arrivalLoadout.hotbarHidden === false && arrivalLoadout.slots.includes('revolver')
      && arrivalLoadout.equipped === 'revolver' && arrivalLoadout.equippedInHands === 'revolver',
    JSON.stringify(arrivalLoadout));

  await page.keyboard.press('KeyQ');
  await settle(0.1);
  const stowedLoadout = await evaluate(() => ({
    ...window.mansionSiege.loadout.checkpoint(),
    equippedInHands: window.mansionSiege.equipped,
  }));
  check('Q gives empty hands without deleting the owned gun or its ammunition',
    stowedLoadout.equipped === null && stowedLoadout.equippedInHands === null
      && stowedLoadout.slots.includes('revolver')
      && stowedLoadout.ammo.revolver.rounds === arrivalLoadout.ammo.revolver.rounds
      && stowedLoadout.ammo.revolver.reserve === arrivalLoadout.ammo.revolver.reserve,
    JSON.stringify(stowedLoadout));
  await page.keyboard.press('Digit1');
  await settle(0.1);
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
  /* 5a. THE BRIEFING ENDS BY ITSELF                                    */
  /*                                                                     */
  /* THE CHECK THIS SCRIPT WAS MISSING, and the reason it reported a      */
  /* healthy mission that could not be finished. Every beat below this    */
  /* line used to be reached by calling `beats.briefed()` from the         */
  /* verifier -- a method that existed, worked, and that NOTHING IN THE    */
  /* SCENE EVER CALLED. Walking into Lou's office put the player in        */
  /* BRIEFING with a blank objective card and left him there permanently.  */
  /*                                                                       */
  /* docs/ENGINE-TRAPS.md #5: "a check that asks a different question than */
  /* the one that matters". "Does briefingEnded() advance the beat" is not */
  /* the question. "Can a player who walks into this room ever leave it"   */
  /* is, and it is asked here, on the clock, with nothing pressed.         */
  /* ---------------------------------------------------------------- */
  const briefingTalks = await evaluate(() => ({
    speaking: window.mansionSiege.speaking,
    sequence: window.mansionSiege.speakingSequence,
    subtitle: window.mansionSiege.hud().subtitle,
  }));
  check('walking in starts Lou talking, with a subtitle, not silence',
    briefingTalks.sequence === 'briefing' && !!briefingTalks.speaking
      && briefingTalks.subtitle === briefingTalks.speaking,
    JSON.stringify(briefingTalks));

  const briefingEnds = await evaluate(() => {
    const s = window.mansionSiege;
    /* Nothing pressed. Ninety simulated seconds is far longer than the seven
     * authored lines need and far shorter than forever, which is what the
     * beat used to take. */
    for (let t = 0; t < 90 && s.beat === 'BRIEFING'; t += 0.5) s.tick(0.5);
    return {
      beat: s.beat, objective: s.objective, hint: s.hint,
      subtitle: s.hud().subtitle,
    };
  });
  check('the briefing ends on its own and puts him on the stairs',
    briefingEnds.beat === 'LITTLE_FRIEND' && briefingEnds.objective === 'Hold the house',
    JSON.stringify(briefingEnds));
  check('and the objective says WHERE to stand and WHAT to press',
    /rail|step|gallery/i.test(briefingEnds.hint ?? '') && /\bF\b/.test(briefingEnds.hint ?? ''),
    briefingEnds.hint ?? 'no hint');
  check('the subtitle bar clears when nobody is talking',
    briefingEnds.subtitle === null, String(briefingEnds.subtitle));

  /* ---------------------------------------------------------------- */
  /* 5b. THE FIRING STEP IS FINDABLE                                    */
  /*                                                                     */
  /* PART VI asks for "partial cover at the rail, an ammunition point".   */
  /* Neither existed, so the one bay of a 32 m landing that the mission   */
  /* is waiting for looked exactly like the other twenty-six metres.      */
  /* ---------------------------------------------------------------- */
  const step = await evaluate(() => {
    const s = window.mansionSiege;
    const bay = s.route.defencePost;
    const dressing = s.dressing.props.firingStep;
    const solid = s.colliders.filter((b) => b.min.y >= 5.9 && b.max.y <= 7.2
      && b.min.z >= 45.0 && b.max.z <= 46.4 && Math.abs(b.min.x) < 4);
    return {
      lit: !!dressing?.lamp,
      warm: dressing?.lamp ? dressing.lamp.color.getHex() : 0,
      cover: solid.length,
      stand: dressing?.stand ?? null,
      bay,
    };
  });
  check('the firing step is lit, so it is the brightest thing on the landing',
    step.lit === true, `lamp 0x${step.warm.toString(16)}`);
  check('and it has real cover at the rail to fight from',
    step.cover >= 2, `${step.cover} chest-high volumes on the bay's rail line`);
  check('and the place it wants him standing is inside the defence post',
    step.stand && step.stand.x >= step.bay.x0 && step.stand.x <= step.bay.x1
      && step.stand.z >= step.bay.z0 && step.stand.z <= step.bay.z1,
    JSON.stringify(step.stand));

  /* The step has to be WALKABLE, not merely dressed. Sandbags either side of
   * the middle are cover; sandbags across the middle are a wall between the
   * player and his own firing position. Walked, from the gallery, on foot. */
  /* Yaw 0, not 180. The balcony bay hangs SOUTH off the gallery's edge --
   * gallery z 48.2..52.8, bay z 45.2..48 -- so the walk onto the step is -Z,
   * and the first version of this check walked him six metres north into the
   * conference room and reported the step unreachable. Same heading
   * convention as section 3: 0 is -Z, 180 is +Z. */
  await teleport(0, UPPER_Y, 50.4, 0);
  await settle(0.3);
  const ontoStep = await walkUntil((p) => p.z <= 46.5, ['KeyW'], 10);
  check('and he can walk onto it from the gallery without going round anything',
    ontoStep.z <= 46.6, `z 50.4 -> ${ontoStep.z} in ${ontoStep.seconds}s`);

  /* ---------------------------------------------------------------- */
  /* 6. The line. Once, from the step, with the heavy up.               */
  /*                                                                     */
  /* THE WRONG PLACE HAS TO BE PUT THERE ON PURPOSE. This check used to   */
  /* fire from wherever the walk above finished -- which is the middle of  */
  /* the firing step, the one place in the house where the line SHOULD     */
  /* work. So it asserted the gate was shut while standing on the far side */
  /* of it, said the line, started wave one, and then failed the next two   */
  /* checks because the line had already been spent. Two red lines, one     */
  /* missing teleport, and nothing wrong with the game at all.              */
  /*                                                                        */
  /* Two metres north of the bay's mouth is the sharpest wrong place there   */
  /* is: same floor, same room, in sight of the sandbags, outside the post.  */
  /* ---------------------------------------------------------------- */
  const post = await evaluate(() => window.mansionSiege.route.defencePost);
  await teleport(0, UPPER_Y, post.z1 + 2, 180);
  await settle(0.3);
  const wrongPlace = await evaluate(() => {
    const s = window.mansionSiege;
    s.equip('saw');
    return {
      fired: s.beats.line(), z: +s.player.position.z.toFixed(2), beat: s.beat,
      nudge: s.hud().nudge,
    };
  });
  check('the line does not fire from wherever you happen to be standing, even with the heavy up',
    wrongPlace.fired === false && wrongPlace.beat === 'LITTLE_FRIEND',
    `z ${wrongPlace.z}, post ends at ${post.z1}`);
  /* A REFUSED KEY HAS TO SAY SO. All three of this gate's conditions used to
   * fail in silence, which leaves a first-time player pressing the key his own
   * HUD told him to press and watching nothing happen -- indistinguishable
   * from a broken mission, and the commonest way this scene stalled. */
  check('and it says why, instead of eating the key press',
    /step|rail|sandbag/i.test(wrongPlace.nudge ?? ''), wrongPlace.nudge ?? 'nothing said');

  await teleport((post.x0 + post.x1) / 2, UPPER_Y, (post.z0 + post.z1) / 2 - 0.4, 180);
  await settle(0.3);

  /* THE WRONG GUN ON THE RIGHT STEP, which is the reachable version of this:
   * `mountArmory` SWAPS rather than stacks, so a player who takes the belt-fed
   * before the rifle walks out carrying the rifle, and the belt-fed is two
   * floors below him when the mission asks for it. */
  const wrongGun = await evaluate(() => {
    const s = window.mansionSiege;
    s.equip('carbine');
    const fired = s.beats.line();
    return { fired, equipped: s.equipped, beat: s.beat, nudge: s.hud().nudge };
  });
  check('the wrong gun on the right step says WHICH gun, and where it was left',
    wrongGun.fired === false && wrongGun.beat === 'LITTLE_FRIEND'
      && /belt-fed/i.test(wrongGun.nudge ?? ''), JSON.stringify(wrongGun));
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

  /* ---------------------------------------------------------------- */
  /* 7b. THE LULL READS AS A LULL, NOT AS THE END OF THE MISSION        */
  /*                                                                     */
  /* Nine seconds after three minutes of shooting, with the attacker      */
  /* counter gone and a stale "Hold the house" the only thing left on     */
  /* screen. That is indistinguishable from a mission that has finished,  */
  /* and a player who believes it has finished walks off the firing step  */
  /* and is downstairs when 2A comes through the door. Two signals: the   */
  /* counter counts the lull DOWN, and somebody says it out loud.         */
  /* ---------------------------------------------------------------- */
  const lull = await evaluate(() => {
    const s = window.mansionSiege;
    s.tick(0.2);
    return {
      hud: s.hud(), remaining: s.mission.lullRemaining, sequence: s.speakingSequence,
    };
  });
  check('the counter counts the lull down instead of going blank',
    /UNTIL THE NEXT/i.test(lull.hud.counter ?? ''), String(lull.hud.counter));
  check('and somebody says the next lot are forming up',
    lull.sequence === 'lull' && /reload|forming/i.test(lull.hud.subtitle ?? ''),
    JSON.stringify({ sequence: lull.sequence, said: lull.hud.subtitle }));

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
  /* 7c. THE MISSION CAN ACTUALLY BE FINISHED                           */
  /*                                                                     */
  /* Everything from here used to be reachable only by a verifier calling */
  /* `beats.aftermath()` and `beats.sasole()` by hand. In the game, wave   */
  /* two clearing put the player in AFTERMATH with a blank objective card  */
  /* on a landing full of bodies, and that was the last thing that ever    */
  /* happened. The whole of PART IX -- Lou coming to the landing, the      */
  /* cartel being bigger than anyone thought, the handoff to Sasole -- was */
  /* authored in the brief, staged in `ensemble.js` (he has three postings */
  /* in this house) and unreachable.                                       */
  /*                                                                       */
  /* So this walks it: clear wave two, let Lou talk on the clock, WALK to  */
  /* Sasole, and require the card. Nothing is pressed and nothing is       */
  /* called on the mission object.                                         */
  /* ---------------------------------------------------------------- */
  const aftermath = await evaluate(() => {
    const s = window.mansionSiege;
    /* Fight wave two out. Release everything, then put it all down. */
    for (let t = 0; t < 200 && s.beat === 'WAVE_TWO'; t += 0.5) {
      for (const id of [...s.mission.waves.two.standing]) s.mission.noteDown(id);
      s.tick(0.5);
    }
    return {
      beat: s.beat, state: s.state, objective: s.objective,
      hud: s.hud(), sequence: s.speakingSequence,
    };
  });
  check('clearing wave two drops into the aftermath with the fires still burning',
    aftermath.beat === 'AFTERMATH' && aftermath.state === 'damaged', JSON.stringify({
      beat: aftermath.beat, state: aftermath.state,
    }));
  check('and the objective reads as HELD rather than going blank',
    aftermath.objective === 'The house is held' && aftermath.hud.objective === 'The house is held',
    JSON.stringify(aftermath.hud));
  check('Lou comes to the landing and talks, unprompted',
    aftermath.sequence === 'aftermath' && !!aftermath.hud.subtitle,
    JSON.stringify({ sequence: aftermath.sequence, said: aftermath.hud.subtitle }));

  const toSasole = await evaluate(() => {
    const s = window.mansionSiege;
    for (let t = 0; t < 120 && s.beat === 'AFTERMATH'; t += 0.5) s.tick(0.5);
    const man = s.ensemble.members.get('captain_lou_sasole');
    return {
      beat: s.beat, objective: s.objective, hint: s.hint, state: s.state,
      here: !!man && man.root.visible,
      at: man ? { x: +man.root.position.x.toFixed(2), z: +man.root.position.z.toFixed(2) } : null,
    };
  });
  check("Lou's conversation ends on its own and sets the last objective",
    toSasole.beat === 'TO_SASOLE' && toSasole.objective === 'Meet Captain Sasole'
      && toSasole.state === 'post_battle',
    JSON.stringify({ beat: toSasole.beat, objective: toSasole.objective, state: toSasole.state }));
  check('and Captain Sasole is standing where the objective says he is',
    toSasole.here === true && toSasole.at !== null, JSON.stringify(toSasole.at));

  /* ON FOOT. The whole point of the last objective is that the player walks
   * across his own wrecked landing to a man he has never met; a teleport
   * onto his toes would prove the trigger and nothing about the walk. */
  await teleport(toSasole.at.x - 4.4, UPPER_Y, toSasole.at.z, 270);
  await settle(0.3);
  const walkedToHim = await walkUntil(
    (p) => Math.hypot(p.x - toSasole.at.x, p.z - toSasole.at.z) < 2.2, ['KeyW'], 12,
  );
  const met = await evaluate(() => {
    const s = window.mansionSiege;
    return { beat: s.beat, sequence: s.speakingSequence, said: s.hud().subtitle };
  });
  check('walking up to him starts the handoff',
    met.sequence === 'sasole' && !!met.said,
    JSON.stringify({ ...met, arrivedAt: `${walkedToHim.x}, ${walkedToHim.z}` }));

  const finished = await evaluate(() => {
    const s = window.mansionSiege;
    for (let t = 0; t < 120 && s.beat !== 'COMPLETE'; t += 0.5) s.tick(0.5);
    return {
      beat: s.beat, complete: s.mission.complete, hud: s.hud(),
      running: s.running, locked: document.pointerLockElement !== null,
    };
  });
  check('the handoff completes the mission', finished.complete === true
    && finished.beat === 'COMPLETE', JSON.stringify({ beat: finished.beat }));
  /* THE CARD IS THE END OF THE PREVIEW AND IT HAS TO BE HONEST AND CLICKABLE.
   * It names the now-wired Enola handoff, and the pointer goes back to the
   * player because a card full of links behind a locked pointer is a softlock
   * with better typography. */
  check('and puts up a mission-complete card with the mouse handed back',
    finished.hud.complete === true && finished.running === false && finished.locked === false,
    JSON.stringify({ card: finished.hud.complete, running: finished.running }));

  const card = await evaluate(() => {
    const el = document.getElementById('missionCard');
    const links = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    const text = (id) => document.getElementById(id)?.textContent ?? '';
    return {
      note: el.querySelector('.note')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      links,
      tally: {
        attackers: text('tallyAttackers'),
        attackersOf: text('tallyAttackersOf'),
        family: text('tallyFamily'),
        familyOf: text('tallyFamilyOf'),
      },
      /* What the mission and the roster actually hold, to check the card
       * against something other than itself. */
      truth: {
        down: window.mansionSiege.mission.attackersDown,
        roll: window.mansionSiege.attackerRoll().total,
        census: window.mansionSiege.ensemble.census(),
      },
      replay: !!document.getElementById('replayBtn'),
    };
  });
  check('the card offers the direct Enola Squatch handoff and keeps replay available',
    card.links.includes('./enolasquatch.html') && card.replay === true, card.links.join(' '));
  check('and says out loud that the Enola Squatch handoff is wired',
    /handoff now carries directly into\s+the enola squatch/i.test(card.note),
    card.note.slice(0, 90));
  /* ## THIS CHECK IS AGAINST THE LEDGER, NOT AGAINST "MORE THAN NOUGHT"
   *
   * It used to assert `attackers > 0 && family > 0` and it caught a card that
   * said 2 and 0 at the end of a run that had put down twenty-seven men --
   * caught the family half, missed the attacker half, because 2 is more than
   * nought. Both numbers now have to EQUAL what the mission and the roster
   * hold, so a card that drifts from the fight it is summarising is red the
   * next time this runs rather than plausible forever.
   *
   * The family count is deliberately ALIVE and not STANDING. Headless, with
   * nobody shooting back for three minutes, every friendly in the house is on
   * the floor at the end -- correctly, and `SURVIVES_THE_SIEGE` is why they
   * are down rather than dead. "Still up" would be nought here and would be a
   * true statement about a fight the player did not fight. */
  check('and counts what he actually did, off the mission ledger',
    Number(card.tally.attackers) === card.truth.down
      && Number(card.tally.family) === card.truth.census.alive
      && card.truth.down > 0,
    JSON.stringify({ ...card.tally, ledger: card.truth.down, alive: card.truth.census.alive }));
  check('and says what those numbers are out of, so they mean something',
    card.tally.attackersOf === `OF ${card.truth.roll} ATTACKERS DOWN`
      && card.tally.familyOf === `OF ${card.truth.census.total} FAMILY ALIVE`,
    `${card.tally.attackersOf} / ${card.tally.familyOf}`);

  /* The card is a full-screen overlay and the checks below take a photograph
   * of the burning foyer. Put it away before measuring anything else -- see
   * ENGINE-TRAPS #7 rule 2 on a shared page carrying state between checks. */
  await evaluate(() => document.getElementById('missionCard')?.classList.add('hidden'));

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
  /* 9b. Audio selector residency -- the same enforcement pattern         */
  /* tools/verify-mansion.mjs and tools/verify-no-wake.mjs use for their    */
  /* own scoped banks.                                                      */
  /*                                                                         */
  /* beginSiege()'s audio.loadManifest() call is weaponCueNames() +          */
  /* siegeCueNames(). Required effects are checked BEFORE the manifest is      */
  /* allowed to filter the residency expectation: otherwise an absent cue      */
  /* disappears from both lists and produces a false green.                    */
  /* No `vo.siege.*` dialogue prefix exists, because the                        */
  /* siege has none: `siege.prospect.little_friend` is a bark, not a line     */
  /* with a cue-name prefix of its own. This recomputes that exact selection   */
  /* from the manifest the page loaded (importing `siegeCueNames` from the     */
  /* scene itself, in the page, since it is authored beside the four            */
  /* `audio.play()` call sites that use it) and asserts the live buffer         */
  /* table equals it -- catching the drift the 2026-08-06 pass found and        */
  /* fixed (`siege.friendly.revived` was missing from this list).               */
  /* ---------------------------------------------------------------- */
  const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
  const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
  const indexedFiles = new Set(soundIndex.files || []);
  const siegeCueLists = await evaluate(async () => {
    const [weapons, siege] = await Promise.all([
      import('/src/core/weapons/audio.js'),
      import('/src/mansion/siege/main.js'),
    ]);
    return {
      weaponCueNames: weapons.weaponCueNames(),
      siegeCueNames: siege.siegeCueNames(),
      siegeEffectCueNames: siege.siegeEffectCueNames(),
    };
  });
  const siegeAuthoredEffects = inspectRequiredAudioBank({
    requiredNames: siegeCueLists.siegeEffectCueNames,
    manifest: soundManifest,
    index: soundIndex,
  });
  check('every required Siege effect has authored manifest metadata and an indexed recording',
    siegeAuthoredEffects.ok,
    JSON.stringify({
      required: siegeAuthoredEffects.requiredNames.length,
      missingManifest: siegeAuthoredEffects.missingManifest,
      missingFiles: siegeAuthoredEffects.missingFiles,
    }));
  const siegeSelectedNames = new Set([...siegeCueLists.weaponCueNames, ...siegeCueLists.siegeCueNames]);
  const expectedSiegeResident = soundManifest.sfx
    .filter((cue) => siegeSelectedNames.has(cue.name))
    .filter((cue) => indexedFiles.has(cue.file || `${cue.name}.mp3`))
    .map((cue) => cue.name).sort();
  /* Fire-and-forget, same as the tour: wait for the buffer table explicitly
   * rather than trust however much of the mission happened to run first. */
  await page.waitForFunction(
    (n) => (window.mansionSiege.audio?.buffers.size ?? 0) >= n,
    expectedSiegeResident.length,
    { timeout: 180000 },
  );
  const siegeAudioResidency = await evaluate((expected) => {
    const audio = window.mansionSiege.audio;
    const resident = audio ? [...audio.buffers.keys()].sort() : [];
    const wanted = new Set(expected);
    return {
      exposed: Boolean(audio),
      resident: resident.length,
      missing: expected.filter((name) => !audio?.buffers.has(name)),
      unexpected: resident.filter((name) => !wanted.has(name)),
    };
  }, expectedSiegeResident);
  check('the siege decodes exactly its scoped bank -- armoury cues and its own siege cues, nothing unscoped',
    siegeAudioResidency.exposed
      && siegeAudioResidency.resident === expectedSiegeResident.length
      && siegeAudioResidency.missing.length === 0
      && siegeAudioResidency.unexpected.length === 0,
    JSON.stringify({
      ...siegeAudioResidency,
      expected: expectedSiegeResident.length,
      missing: siegeAudioResidency.missing.slice(0, 5),
      unexpected: siegeAudioResidency.unexpected.slice(0, 5),
    }));

  /* ---------------------------------------------------------------- */
  /* 9c. Instancing coverage -- the mansion's shared builders now instance   */
  /* the sconces, balusters, vault gold bars and perimeter fence (2026-08-  */
  /* 06). The siege calls those same two builders directly (see this file's  */
  /* own header), so it inherits the reduction with no siege-specific         */
  /* geometry change -- this proves that inheritance rather than assuming it. */
  /* ---------------------------------------------------------------- */
  const siegeInstancing = await evaluate(() => {
    const counts = {};
    window.mansionSiege.scene.traverse((o) => {
      if (o.isInstancedMesh && o.name) counts[o.name] = o.count;
    });
    return counts;
  });
  /* The counts are structural, not pinned: the third-floor suite added its
   * own sconces and stair balusters to the same instanced pools (38/127 the
   * day it landed), and a legitimate build change must not fail this check.
   * What CAN'T drift is the consistency between an instanced fixture's own
   * parts -- a shade without an arm is the instancing bug this guards. */
  check('the siege inherits the tour\'s instanced sconces, balusters, gold bars and fence',
    siegeInstancing['sconce-shade'] >= 30
      && siegeInstancing['sconce-shade'] === siegeInstancing['sconce-arm']
      && siegeInstancing['sconce-shade'] === siegeInstancing['sconce-backplate']
      && siegeInstancing['baluster-shaft'] > 0
      && siegeInstancing['baluster-shaft'] === siegeInstancing['baluster-collar-top']
      && siegeInstancing['vault-gold-bar'] === 171
      && siegeInstancing['fence-post'] > 0
      && siegeInstancing['fence-post'] === siegeInstancing['fence-post-cap'],
    JSON.stringify(siegeInstancing));

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
  /* AND PUT THE RENDERER BACK DOWN. This page stays open for the rest of the
   * run, and section 11 below opens four MORE pages on the same browser. Left
   * drawing a burning forecourt on swiftshader it eats the whole CPU, and the
   * symptom is not "the screenshot is slow" -- it is the fourth checkpoint
   * page timing out in `goto` thirty seconds later, which reads as a broken
   * checkpoint entry. One line, and it is the difference between section 11
   * measuring the mission and section 11 measuring the software renderer. */
  await evaluate(() => window.mansionSiege.setRendering(false));

  /* ---------------------------------------------------------------- */
  /* 11. ?checkpoint= -- the four phases, each on its own fresh page     */
  /*                                                                     */
  /* The siege is reachable only by URL, so the owner's first look at it  */
  /* is four separate sittings unless he can jump. Each of these opens a  */
  /* NEW PAGE, presses the scene's own start button, and asks the mission */
  /* where it ended up -- because a checkpoint entry that only works on a  */
  /* page that has already played the mission is not an entry.            */
  /*                                                                      */
  /* AND IT REPLAYS THE BEATS RATHER THAN WRITING THEM. `history` is the   */
  /* assertion that matters: a jump that produced beat=LULL by assignment  */
  /* would pass a beat check and leave a house with no foyer encounter in  */
  /* it and no wave-one roster. The chain has to be walked.                */
  /* ---------------------------------------------------------------- */
  const CHECKPOINT_EXPECTATIONS = [
    { id: 'wake', beat: 'WAKE', label: null },
    { id: 'armed', beat: 'TO_OFFICE', label: 'ARMED', weapon: 'carbine' },
    { id: 'briefed', beat: 'LITTLE_FRIEND', label: 'BRIEFED', weapon: 'saw' },
    { id: 'wave_one', beat: 'LULL', label: 'WAVE ONE HELD', weapon: 'saw' },
  ];
  for (const want of CHECKPOINT_EXPECTATIONS) {
    const jump = await browser.newPage({ viewport: { width: 400, height: 260 } });
    const jumpErrors = [];
    jump.on('pageerror', (e) => jumpErrors.push(e.message));
    /* `domcontentloaded`, not `load`, and with a timeout of its own.
     * `load` waits for every texture the mansion generates, on a browser that
     * already has this scene open once; playwright's default 30 s is not
     * enough for that on swiftshader and the failure it produces is a
     * navigation timeout, which looks nothing like what it is. The real
     * readiness signal is the next line, and it has always had 90 s. */
    await jump.goto(`http://localhost:${PORT}/mansion-siege.html?preview=1&checkpoint=${want.id}`,
      { waitUntil: 'domcontentloaded', timeout: 120000 });
    await jump.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 120000 });
    /* Before anything else: this page is a fresh scene and its render loop is
     * on. Nothing here needs a picture. */
    await jump.evaluate(() => window.mansionSiege.setRendering(false));
    const tag = await jump.evaluate(() => ({
      button: document.getElementById('startBtn')?.textContent?.trim() ?? '',
      tag: document.getElementById('checkpointTag')?.hidden === false,
      requested: window.mansionSiege.startCheckpoint,
    }));
    await jump.click('#startBtn');
    await jump.waitForFunction(() => window.mansionSiege.running, null, { timeout: 20000 });
    await jump.evaluate(() => window.mansionSiege.tick(0.4));
    const landed = await jump.evaluate(() => {
      const s = window.mansionSiege;
      return {
        beat: s.beat,
        history: s.mission.history.join('>'),
        equipped: s.equipped,
        placed: s.placed(),
        waveOneDown: s.mission.waves.one.down.size,
        littleFriend: s.mission.littleFriendSaid,
        at: { x: +s.player.position.x.toFixed(1), z: +s.player.position.z.toFixed(1) },
        objective: s.objective,
      };
    });
    check(`?checkpoint=${want.id} starts the mission at ${want.beat}`,
      landed.beat === want.beat && tag.requested === want.id,
      JSON.stringify({ beat: landed.beat, at: landed.at, objective: landed.objective }));
    if (want.label) {
      check(`  and says so on the menu before you press start`,
        tag.tag === true && tag.button.includes(want.label), `"${tag.button}"`);
      check(`  and puts the right gun in his hands`,
        landed.equipped === want.weapon, String(landed.equipped));
      check(`  and it got there by walking the beat chain, not by assignment`,
        landed.history.startsWith('WAKE>TO_ARMORY>ARM>TO_OFFICE')
          && landed.placed.includes('corridor') && landed.placed.includes('foyer'),
        `${landed.history} | placed ${landed.placed.join('+')}`);
    }
    if (want.id === 'wave_one') {
      check('  and wave one is HELD rather than skipped',
        landed.waveOneDown === 8 && landed.littleFriend === true,
        `${landed.waveOneDown} of 8 down, line said ${landed.littleFriend}`);
    }
    for (const message of jumpErrors) problems.push(`[${want.id}] ${message}`);
    await jump.close();
  }

  /* ---------------------------------------------------------------- */
  /* DRAW CALLS, from two poses the mission actually stands in          */
  /*                                                                    */
  /* Last, because it needs the camera moved and `teleport` starts the  */
  /* mission -- doing this earlier would make `#startBtn` a no-op and    */
  /* take the whole run with it. `setState('clean')` first so the number */
  /* is the house rather than however many bodies this playthrough left  */
  /* on the floor.                                                       */
  /*                                                                     */
  /* `perf.drawCalls()` turns `renderer.info.autoReset` OFF for the      */
  /* measurement on purpose: this three build resets `info` AFTER        */
  /* `shadowMap.render()`, so with the default on the shadow pass reads  */
  /* as zero however many thousand objects it drew.                      */
  /* ---------------------------------------------------------------- */
  {
    const drawn = await evaluate(() => {
      const s = window.mansionSiege;
      s.setState('clean');
      s.setRendering(false);
      const out = {};
      for (const [name, y, yaw] of [['foyer', 1.2, 180], ['gallery', 6.0, 200]]) {
        const r = s.route[name];
        s.teleport((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2, yaw);
        out[name] = s.perf.drawCalls().calls;
      }
      return out;
    });
    /* Measured here, foyer/gallery: 18,536 / 16,200 before the transmission
     * and shadow-caster passes landed, 7,218 / 6,042 after. 11,000 sits
     * between them with room for a wing of new furniture. */
    check('the foyer costs fewer draw calls than the budget',
      drawn.foyer <= 11000, `${drawn.foyer} calls (budget 11000)`);
    check('and so does the gallery',
      drawn.gallery <= 11000, `${drawn.gallery} calls (budget 11000)`);
  }

  const contextHealth = await evaluate(() => {
    const gl = window.mansionSiege.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      lost: gl.isContextLost(),
      version: gl.getParameter(gl.VERSION),
      renderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    };
  });
  check('the ANGLE SwiftShader context stays healthy through every render probe',
    contextHealth.lost === false,
    JSON.stringify(contextHealth));

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
