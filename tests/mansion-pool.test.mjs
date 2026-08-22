import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ensureDomShim } from '../tools/three-shim.mjs';

ensureDomShim();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  CUE_STROKE,
  CUE_STROKE_SECONDS,
  MISCUE_RAD,
  POOL_BALLS,
  POOL_RULES,
  POOL_RULE_SETS,
  POOL_TABLE,
  PoolFrame,
  SUB_DT,
  ballGroupOf,
  chooseShot,
  legalTargets,
  rackLayout,
  resolveShot,
  stepTable,
  strikeSpeed,
  tableStill,
} = await import('../src/mansion/pool.js');
const {
  SWING_CONTROL, SWING_PHASE, npcSwing, resolveStrike,
} = await import('../src/golf/swing.js');
const {
  MANSION_INTERACTION_CUE_NAMES,
  POOL_CUE_NAMES,
  POOL_SFX_CUES,
} = await import('../src/mansion/interaction-audio.js');
const { mansionAudioBanks } = await import('../src/mansion/audio-banks.js');
const { allSilentSquatchLines, SEQUENCES } = await import('../src/mansion/script.js');
const { poolMeterState, poolPanelText } = await import('../src/mansion/pool-hud.js');
const {
  POOL_FRAME_RESPECT,
  SCENE_IDS,
  TIME_EVENT_IDS,
  awardPoolFrameRespect,
  createCampaign,
} = await import('../src/core/campaign.js');
const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
const manifestNames = new Set(manifest.sfx.map((cue) => cue.name));

/** The save, in memory, so a reload is a real second `createCampaign`. */
class MemoryStorage {
  constructor() { this.values = new Map(); }

  getItem(key) { return this.values.get(key) ?? null; }

  setItem(key, value) { this.values.set(key, String(value)); }

  removeItem(key) { this.values.delete(key); }
}

/** A campaign standing in Lou's house, which is where the table is. */
function atTheMansion(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.enter(SCENE_IDS.MANSION, { spawn: 'gate' });
  return { campaign, storage };
}

/** A steady hand, so a test asserts the rules rather than a seed. */
const steady = () => 0.5;
/** A repeatable wobble, for the runs that want him to actually miss. */
function wobble(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 4294967296;
  };
}

/* ================================================================== */
/* THE RACK IS AUTHORED                                                 */
/* ================================================================== */

test('pool: the rack is authored data, not a shuffle', () => {
  /* The geometry gate records the bucket every authored position falls in.
   * One `Math.random` in a layout and the house is a different house on every
   * boot and the gate can never say anything true about it. */
  const source = fs.readFileSync(path.join(ROOT, 'src/mansion/pool.js'), 'utf8');
  /* Comments off first: the block that says NOT ONE Math.random IN HERE is
   * allowed to say so. */
  const authored = source.slice(0, source.indexOf('/* THE RULES, AS DATA'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/Math\.random/.test(authored), false,
    'the table, the ball catalogue and the rack must contain no Math.random');

  const first = rackLayout('eight-ball');
  const second = rackLayout('eight-ball');
  assert.deepEqual(first, second);
  assert.equal(first.length, 16);
  assert.equal(rackLayout('nine-ball').length, 10);
});

test('pool: every racked ball is on the table and none of them overlap', () => {
  for (const id of ['eight-ball', 'nine-ball']) {
    const rack = rackLayout(id);
    for (const ball of rack) {
      assert.ok(Math.abs(ball.x) <= POOL_TABLE.halfX - POOL_TABLE.ballRadius, `${id} ${ball.id} x`);
      assert.ok(Math.abs(ball.z) <= POOL_TABLE.halfZ - POOL_TABLE.ballRadius, `${id} ${ball.id} z`);
      for (const pocket of POOL_TABLE.pockets) {
        assert.ok(Math.hypot(ball.x - pocket.x, ball.z - pocket.z) > pocket.mouth,
          `${id} ${ball.id} is racked inside ${pocket.id}`);
      }
    }
    for (let i = 0; i < rack.length; i++) {
      for (let j = i + 1; j < rack.length; j++) {
        const gap = Math.hypot(rack[i].x - rack[j].x, rack[i].z - rack[j].z);
        assert.ok(gap >= POOL_TABLE.ballRadius * 2, `${id}: ${rack[i].id}/${rack[j].id} overlap`);
      }
    }
  }
});

test('pool: the 8-ball rack is a legal rack', () => {
  const rack = rackLayout('eight-ball');
  const at = (id) => rack.find((ball) => ball.id === id);
  const rows = new Map();
  for (const ball of rack) {
    if (ball.id === 0) continue;
    const key = ball.z.toFixed(4);
    rows.set(key, [...(rows.get(key) ?? []), ball]);
  }
  const ordered = [...rows.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));
  assert.deepEqual(ordered.map(([, row]) => row.length), [1, 2, 3, 4, 5]);
  // The eight is the middle of the third row.
  assert.equal(at(8).z.toFixed(4), ordered[2][0]);
  assert.equal(Math.abs(at(8).x) < 1e-9, true);
  // The back corners are one solid and one stripe.
  const back = ordered[4][1].slice().sort((a, b) => a.x - b.x);
  const corners = [back[0].id, back[back.length - 1].id].map(ballGroupOf).sort();
  assert.deepEqual(corners, ['solid', 'stripe']);
});

/* ================================================================== */
/* THE SUB-STEP                                                         */
/* ================================================================== */

test('pool: a break at the scene dt clamp does not tunnel a single ball', () => {
  /* THE CONDITION THAT BREAKS THE NAIVE VERSION. src/mansion/main.js clamps
   * dt to 0.05 s and the software rasteriser these gates run under renders at
   * about 1.3 fps, so 0.05 is the step every frame actually asks for. At the
   * top strike speed a whole-frame integration moves the cue ball 27 cm --
   * five radii -- straight through the pack and out through a cushion. */
  const frame = new PoolFrame({ rng: steady });
  frame.takeCue();
  frame.shoot({ angle: Math.PI, power: 1 });
  let guard = 0;
  while (frame.state === 'rolling' && guard++ < 6000) frame.update(0.05);
  assert.ok(guard < 6000, 'the break never came to rest');

  for (const ball of frame.balls) {
    if (ball.potted) continue;
    assert.ok(Math.abs(ball.x) <= POOL_TABLE.halfX - POOL_TABLE.ballRadius + 1e-9,
      `ball ${ball.id} is through the side cushion at x=${ball.x}`);
    assert.ok(Math.abs(ball.z) <= POOL_TABLE.halfZ - POOL_TABLE.ballRadius + 1e-9,
      `ball ${ball.id} is through the end cushion at z=${ball.z}`);
  }
  assert.equal(frame.balls.length, 16);
});

test('pool: the naive whole-frame integration this sub-steps around really does tunnel', () => {
  /* THE PROOF THAT THE TEST ABOVE IS TESTING SOMETHING, in the cheapest form
   * the failure takes: one ball rolled hard down the side cushion into the
   * middle pocket. At the top strike speed a whole-frame step of 0.05 s moves
   * it 27 cm between position samples and the pocket mouth is 8.6 cm across,
   * so the sampled positions straddle the pocket and it sails past a hole it
   * went straight over. Sub-stepped, it drops. Nothing about that failure
   * looks like a physics bug from the outside; it looks like a table where
   * hard shots never go in. */
  function rollIntoTheMiddlePocket(step) {
    const ball = {
      id: 0, x: -(POOL_TABLE.halfX - POOL_TABLE.ballRadius), z: 2, vx: 0, vz: -strikeSpeed(1), potted: false,
    };
    const balls = [ball];
    const events = [];
    for (let i = 0; i < Math.ceil(12 / step) && !tableStill(balls); i++) {
      stepTable(balls, step, events);
    }
    return events.find((event) => event.type === 'pocket')?.pocket ?? null;
  }
  assert.equal(rollIntoTheMiddlePocket(SUB_DT), 'side-left',
    'the sub-stepped ball missed the pocket — the geometry moved, re-derive this');
  assert.notEqual(rollIntoTheMiddlePocket(0.05), 'side-left',
    'the naive step has stopped tunnelling — re-derive this guard');
});

test('pool: no sub-step ever moves a ball further than its own radius', () => {
  const frame = new PoolFrame({ rng: wobble(7) });
  frame.takeCue();
  frame.shoot({ angle: Math.PI, power: 1 });
  let worst = 0;
  let guard = 0;
  while (frame.state === 'rolling' && guard++ < 6000) {
    for (const ball of frame.balls) {
      worst = Math.max(worst, Math.hypot(ball.vx, ball.vz) * SUB_DT);
    }
    frame.update(0.05);
  }
  assert.ok(worst < POOL_TABLE.ballRadius, `worst sub-step travel was ${worst.toFixed(4)} m`);
});

test('pool: balls are conserved — potted plus on the table is always the rack', () => {
  const frame = new PoolFrame({ rng: wobble(11) });
  frame.takeCue();
  let guard = 0;
  while (frame.state !== 'over' && guard++ < 60000) {
    if (frame.state === 'aim') {
      const shot = chooseShot(frame.rules, frame, 'player');
      frame.shoot(shot ?? { angle: Math.PI, power: 0.8 });
    }
    frame.update(0.05);
    assert.equal(frame.balls.length, 16);
  }
  assert.equal(frame.state, 'over');
});

/* ================================================================== */
/* THE RULES ARE A TABLE                                                */
/* ================================================================== */

test('pool: the rule sets differ only in data, and 9-ball is one line away', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/mansion/pool.js'), 'utf8');
  const resolver = source.slice(source.indexOf('export function resolveShot'),
    source.indexOf('function legalTargetsAfter'));
  assert.equal(/rules\.id\s*===/.test(resolver), false,
    'the referee has grown a branch on which game it is — put it in the table');
  assert.match(source, /export const POOL_RULES = POOL_RULE_SETS\['eight-ball'\];/);
  assert.equal(POOL_RULES.id, 'eight-ball');
  assert.equal(POOL_RULE_SETS['nine-ball'].target, 'lowest');
});

test('pool: 9-ball is always on the lowest ball; 8-ball is on your own group', () => {
  const nine = new PoolFrame({ rules: POOL_RULE_SETS['nine-ball'], rng: steady });
  assert.deepEqual(legalTargets(nine.rules, nine, 'player'), [1]);
  nine.balls.find((ball) => ball.id === 1).potted = true;
  assert.deepEqual(legalTargets(nine.rules, nine, 'player'), [2]);

  const eight = new PoolFrame({ rng: steady });
  const open = legalTargets(eight.rules, eight, 'player');
  assert.equal(open.includes(8), false, 'the eight is never a legal first contact on an open table');
  assert.equal(open.length, 14);
  eight.groups = { player: 'solid', rippin: 'stripe' };
  assert.deepEqual(legalTargets(eight.rules, eight, 'player').sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7]);
});

test('pool: the four fouls hand the table over with the cue ball in hand', () => {
  const frame = new PoolFrame({ rng: steady });
  frame.groups = { player: 'solid', rippin: 'stripe' };
  const shots = {
    'cue ball': { firstContact: 1, railAfterContact: true, potted: [], cueBallPotted: true },
    'no contact': { firstContact: null, railAfterContact: false, potted: [], cueBallPotted: false },
    'wrong ball first': { firstContact: 9, railAfterContact: true, potted: [], cueBallPotted: false },
    'no rail': { firstContact: 1, railAfterContact: false, potted: [], cueBallPotted: false },
  };
  for (const [reason, shot] of Object.entries(shots)) {
    const outcome = resolveShot(frame.rules, frame, 'player', shot);
    assert.equal(outcome.foul, reason);
    assert.equal(outcome.turn, 'rippin');
    assert.equal(outcome.ballInHand, true);
    assert.equal(outcome.frameOver, false);
  }
});

test('pool: the eight early is the frame, and the eight on time is the frame', () => {
  const frame = new PoolFrame({ rng: steady });
  frame.groups = { player: 'solid', rippin: 'stripe' };
  const early = resolveShot(frame.rules, frame, 'player', {
    firstContact: 1, railAfterContact: true, potted: [8], cueBallPotted: false,
  });
  assert.equal(early.frameOver, true);
  assert.equal(early.winner, 'rippin');

  for (const id of [1, 2, 3, 4, 5, 6]) {
    frame.balls.find((ball) => ball.id === id).potted = true;
  }
  const onTime = resolveShot(frame.rules, frame, 'player', {
    firstContact: 7, railAfterContact: true, potted: [7, 8], cueBallPotted: false,
  });
  assert.equal(onTime.frameOver, true);
  assert.equal(onTime.winner, 'player');

  /* And the same shot in 9-ball, where the nine early is not a loss at all --
   * it goes back on the spot. Same resolver, different row of the table. */
  const nine = new PoolFrame({ rules: POOL_RULE_SETS['nine-ball'], rng: steady });
  const respot = resolveShot(nine.rules, nine, 'player', {
    firstContact: 2, railAfterContact: true, potted: [9], cueBallPotted: false,
  });
  assert.equal(respot.frameOver, false);
  assert.deepEqual(respot.respot, [9]);
});

test('pool: the open table assigns both groups off the first pot', () => {
  const frame = new PoolFrame({ rng: steady });
  const outcome = resolveShot(frame.rules, frame, 'player', {
    firstContact: 3, railAfterContact: true, potted: [3], cueBallPotted: false,
  });
  assert.deepEqual(outcome.groups, { player: 'solid', rippin: 'stripe' });
  assert.equal(outcome.turn, 'player', 'a pot keeps you at the table');
});

/* ================================================================== */
/* RIPPINFLOW                                                           */
/* ================================================================== */

test('pool: Rippinflow plays real shots through the same physics and finishes frames', () => {
  /* NOT A COIN FLIP THAT TELEPORTS BALLS. He picks a pocket, aims at a ghost
   * ball, strikes the cue ball, and the same `stepTable` that carries the
   * player's break carries his. */
  let wins = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const frame = new PoolFrame({ rng: wobble(seed * 977) });
    frame.takeCue();
    let guard = 0;
    let playerShots = 0;
    while (frame.state !== 'over' && guard++ < 60000) {
      if (frame.state === 'aim') {
        const shot = chooseShot(frame.rules, frame, 'player');
        frame.shoot(shot ?? { angle: Math.PI, power: 0.8 });
        playerShots++;
      }
      frame.update(0.05);
    }
    assert.equal(frame.state, 'over', `seed ${seed} never finished`);
    assert.ok(frame.shots > playerShots, `seed ${seed}: Rippinflow never took a shot`);
    if (frame.winner === 'rippin') wins++;
  }
  assert.ok(wins > 0, 'Rippinflow never won a frame in six — he is not a real opponent');
});

test('pool: his skill is authored and only his hand is random', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/mansion/pool.js'), 'utf8');
  const chooser = source.slice(source.indexOf('export function chooseShot'),
    source.indexOf('export class PoolFrame'));
  assert.equal(/Math\.random/.test(chooser), false,
    'the shot search must be deterministic — the wobble is applied at strike time');
  /* Twice from the same table with the same hand is the same shot. */
  const a = new PoolFrame({ rng: steady });
  const b = new PoolFrame({ rng: steady });
  assert.deepEqual(chooseShot(a.rules, a, 'rippin'), chooseShot(b.rules, b, 'rippin'));
});

/* ================================================================== */
/* THE TABLE IN THE HOUSE                                               */
/* ================================================================== */

test('pool: the built table rests its rack on the felt and publishes what the game drives', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const table = interior.props.lounge.billiard;
  assert.ok(table, 'the lounge publishes no billiard table');
  assert.ok(table.target?.isObject3D, 'there is no mesh to press E on');
  assert.match(table.target.name, /billiard-bed/);
  assert.equal(table.balls.size, 16);

  /* The staging/geometry gates check that a resting object rests. A ball sits
   * on the cloth when its centre is exactly one radius above the felt plane,
   * and every one of the sixteen must, not just the cue ball. */
  assert.equal(Number((table.ballY - table.feltY).toFixed(6)), POOL_TABLE.ballRadius);
  for (const [id, node] of table.balls) {
    const seat = rackLayout(POOL_RULES.id).find((ball) => ball.id === id);
    assert.equal(Number(node.position.y.toFixed(6)), Number(table.ballY.toFixed(6)), `ball ${id}`);
    assert.ok(Math.abs(node.position.x - (table.centre.x + seat.x)) < 1e-6, `ball ${id} x`);
    assert.ok(Math.abs(node.position.z - (table.centre.z + seat.z)) < 1e-6, `ball ${id} z`);
  }

  /* Six pockets, in the felt, where the rules say they are. */
  for (const pocket of POOL_TABLE.pockets) {
    const mesh = interior.root.getObjectByName(`billiard-pocket-${pocket.id}`);
    assert.ok(mesh, `no mouth built for ${pocket.id}`);
    assert.ok(Math.abs(mesh.position.x - (table.centre.x + pocket.x)) < 1e-6, pocket.id);
    assert.ok(Math.abs(mesh.position.z - (table.centre.z + pocket.z)) < 1e-6, pocket.id);
  }

  /* And the game moves those exact meshes. */
  const frame = new PoolFrame({ rng: steady });
  frame.attach(table);
  frame.takeCue();
  frame.shoot({ angle: Math.PI, power: 1 });
  let guard = 0;
  while (frame.state === 'rolling' && guard++ < 6000) frame.update(0.05);
  const cue = frame.balls.find((ball) => ball.id === 0);
  const cueMesh = table.balls.get(0);
  assert.ok(Math.abs(cueMesh.position.x - (table.centre.x + cue.x)) < 1e-6);
  assert.ok(Math.abs(cueMesh.position.z - (table.centre.z + cue.z)) < 1e-6);
  const potted = frame.balls.filter((ball) => ball.potted);
  for (const ball of potted) assert.equal(table.balls.get(ball.id).visible, false);
});

/* ================================================================== */
/* AUDIO: MINTED, AND ACTUALLY DECODED                                  */
/* ================================================================== */

test('pool: the table sounds are in the manifest with a prompt to record from', () => {
  /* Six now, not five. The sixth is `billiards.miscue`, and it exists because
   * the golf meter created a shot the table had no sound for -- see the note
   * on it in src/mansion/interaction-audio.js. */
  assert.equal(POOL_SFX_CUES.length, 6);
  assert.ok(POOL_CUE_NAMES.includes('billiards.miscue'));
  for (const [name, prompt, seconds] of POOL_SFX_CUES) {
    const cue = manifest.sfx.find((entry) => entry.name === name);
    assert.ok(cue, `${name} is not in assets/sfx/manifest.json — run npm run sfx:pool`);
    assert.equal(cue.prompt, prompt);
    assert.equal(cue.duration, seconds);
    assert.equal(cue.voice, undefined, `${name} is cast to a voice`);
  }
});

test('pool: the bank the mansion actually decodes contains every one of them', () => {
  /* THE BUG THIS TEST EXISTS FOR HAS BEEN FOUND THREE TIMES IN A WEEK: a
   * recording that is delivered, indexed, and outside the one filter deciding
   * what the page decodes plays as a synth stand-in while every gate stays
   * green (the suite's four takes, the sixty-seven radio takes,
   * `enola.blast.*`). A cue in the manifest is not a cue the house can hear. */
  for (const name of POOL_CUE_NAMES) {
    assert.ok(MANSION_INTERACTION_CUE_NAMES.includes(name), name);
  }
  for (const visit of ['first', 'return']) {
    const banks = mansionAudioBanks(visit);
    for (const name of POOL_CUE_NAMES) {
      assert.ok(banks.start.names.includes(name),
        `${visit} visit: ${name} is never decoded, so the table clicks on a synth`);
    }
  }
});

test('pool: Rippinflow\'s table lines are catalogued and reachable from the start bank', () => {
  const lines = allSilentSquatchLines().filter((line) => line.name.includes('.rippin.pool.'));
  assert.ok(lines.length >= 12, `only ${lines.length} pool lines are catalogued`);
  for (const line of lines) {
    assert.equal(line.voice, 'rippinflow');
    assert.ok(manifestNames.has(line.name),
      `${line.name} is not in the manifest — run npm run vo:mansion`);
    /* `house` is a START-bank scope. An unrecorded line is fine and there is a
     * whole pipeline for it; an unbanked one is a man talking over a synth. */
    assert.match(line.name, /^vo\.silentsquatch\.house\./);
  }
  const banks = mansionAudioBanks('first');
  assert.ok(banks.start.prefixes.includes('vo.silentsquatch.house.'));

  /* Every beat of a frame he can be at has something to say. */
  for (const key of ['poolRacked', 'poolResumed', 'poolPlayerPots', 'poolPlayerMisses',
    'poolPlayerFouls', 'poolHePots', 'poolHeMisses', 'poolHeWins', 'poolHeLoses',
    'poolWalksOff']) {
    assert.ok(SEQUENCES[key]?.length, `${key} is empty`);
  }
});

/* ================================================================== */
/* THE WIRING IN THE HOUSE                                              */
/* ================================================================== */

test('pool: the mansion registers the felt, keeps E for the game and Q for the door', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/mansion/main.js'), 'utf8');
  assert.match(source, /interaction\.register\(billiard\.target/);
  assert.match(source, /if \(atPool\) \{\n\s+poolKeys\.add\(e\.code\);/);
  assert.match(source, /if \(e\.code === 'KeyQ' && !e\.repeat\) \{ poolPutCueBack\(\); /);
  /* The camera goes to the shot through the shared seated pose, not through a
   * second camera rig this scene invented. */
  assert.match(source, /player\.sitAt\(\{\n\s+position: new THREE\.Vector3\(pose\.x, pose\.y, pose\.z\)/);
  /* AND THE POWER METER IS NOW TIMED OFF ACCUMULATED dt, WHICH IS THE EXACT
   * OPPOSITE OF WHAT THIS TEST USED TO ASSERT, ON PURPOSE.
   *
   * It used to demand `poolCharge = performance.now()`, and that was right
   * for a HOLD-to-fill bar: there the power IS the elapsed time, so charging
   * per frame makes a soft roll impossible on a slow machine. The bar is now
   * golf's click-stop-click meter, where the player is not measuring a
   * duration but stopping a marker where he can SEE it -- so the thing that
   * has to be stable is how far the marker moves between two PAINTS. At the
   * 1.3 fps this scene renders at under the software rasteriser a wall-clock
   * sweep crosses the whole bar between paints and cannot be stopped at all.
   * So: no clock at the table, and the meter lives in the frame. */
  const poolSection = source.slice(
    source.indexOf('const billiard = interior.props.lounge'),
    source.indexOf('interaction.register(billiard.target'),
  ).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/performance\.now\(\)/.test(poolSection), false,
    'the pool section is timing something off the wall clock again');
  assert.match(source, /pool\.cueClick\(\);/);
});

test('pool: the panel says whose shot it is without the player doing arithmetic', () => {
  const frame = new PoolFrame({ rng: steady });
  frame.takeCue();
  assert.match(poolPanelText(frame.view), /Table is <b>open<\/b>/);
  assert.match(poolPanelText(frame.view), /Your shot/);
  frame.groups = { player: 'stripe', rippin: 'solid' };
  frame.turn = 'rippin';
  assert.match(poolPanelText(frame.view), /stripes/);
  assert.match(poolPanelText(frame.view), /Rippinflow is on/);
  assert.equal(poolPanelText(null), '');
});

test('pool: walking away mid-shot still finishes the shot', () => {
  const frame = new PoolFrame({ rng: steady });
  frame.takeCue();
  frame.shoot({ angle: Math.PI, power: 1 });
  frame.update(0.05);
  assert.equal(frame.state, 'rolling');
  frame.putCueBack();
  assert.equal(frame.state, 'idle');
  assert.equal(tableStill(frame.balls), true);
  assert.ok(frame.lastShot, 'the referee never saw the shot he walked away from');
  /* And coming back picks the same frame up rather than racking a new one. */
  frame.takeCue();
  assert.notEqual(frame.state, 'idle');
  assert.equal(frame.shots, 1);
});

test('pool: the ball catalogue is seven solids, seven stripes, an eight and a cue', () => {
  const byGroup = {};
  for (const ball of POOL_BALLS) byGroup[ball.group] = (byGroup[ball.group] ?? 0) + 1;
  assert.deepEqual(byGroup, {
    cue: 1, solid: 7, eight: 1, stripe: 7,
  });
});

/* ================================================================== */
/* THE STAKE                                                            */
/* ================================================================== */

test('pool: taking a frame off Rippinflow moves familyRespect, once, for good', () => {
  const { campaign } = atTheMansion();
  assert.equal(campaign.state.story.familyRespect, 0);

  assert.equal(awardPoolFrameRespect(campaign), true);
  assert.equal(campaign.state.story.familyRespect, POOL_FRAME_RESPECT);
  assert.equal(
    campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.BEAT_RIPPINFLOW_AT_POOL), true,
  );
});

test('pool: racking again and winning again is worth nothing — the grind is shut', () => {
  /* A game about respect in which respect can be farmed by pressing E on the
   * felt eleven times is the exact failure this is here to hold shut. The
   * award is on the exact-once time-event ledger, so every call after the
   * first is refused and refuses SILENTLY -- the caller is told false and the
   * scene therefore raises no banner. */
  const { campaign } = atTheMansion();
  assert.equal(awardPoolFrameRespect(campaign), true);
  for (let frame = 0; frame < 10; frame++) {
    assert.equal(awardPoolFrameRespect(campaign), false, `frame ${frame + 2} paid twice`);
  }
  assert.equal(campaign.state.story.familyRespect, POOL_FRAME_RESPECT);
  /* And it did not creep the clock either: a marker, not an errand. */
  assert.equal(campaign.state.story.timeMinutes, atTheMansion().campaign.state.story.timeMinutes);
});

test('pool: the respect survives a reload, and cannot be earned a second time after one', () => {
  const storage = new MemoryStorage();
  const first = atTheMansion(storage).campaign;
  assert.equal(awardPoolFrameRespect(first), true);

  /* A genuinely new Campaign over the same storage — the reload. */
  const reloaded = createCampaign({ storage });
  assert.equal(reloaded.state.story.familyRespect, POOL_FRAME_RESPECT,
    'the frame he won was never written to the save');
  assert.equal(
    reloaded.state.story.timeEvents.includes(TIME_EVENT_IDS.BEAT_RIPPINFLOW_AT_POOL), true,
  );
  assert.equal(awardPoolFrameRespect(reloaded), false,
    'reloading is a way to play the same frame for pay twice');
  assert.equal(reloaded.state.story.familyRespect, POOL_FRAME_RESPECT);
});

test('pool: losing costs nothing and leaves the marker unspent, so he can play again', () => {
  /* The asymmetry, as a property rather than as a comment. Rippinflow has been
   * waiting twenty minutes for anybody to pick up the other cue; the house
   * does not think less of a man who sits down and gets beaten. A loss writes
   * nothing at all, which is why the scene calls the writer ONLY on a win --
   * and because the marker is still unspent, the frame he eventually takes off
   * Rippinflow still pays. */
  const { campaign } = atTheMansion();
  const frame = new PoolFrame({ rng: steady });
  frame.takeCue();
  frame.groups = { player: 'solid', rippin: 'stripe' };
  /* Throw it away the way 8-ball is famous for: the eight, early, for real.
   * One of his solids is still on the table, so the eight is not his ball; the
   * cue ball, the eight and a corner pocket are lined up dead straight and he
   * hits it. No poking at the frame's internals -- the referee does this. */
  for (const ball of frame.balls) {
    if (![0, 1, 8].includes(ball.id)) ball.potted = true;
  }
  const solid = frame.balls.find((ball) => ball.id === 1);
  solid.x = 0.9;
  solid.z = 1.8;
  const eight = frame.balls.find((ball) => ball.id === 8);
  eight.x = -0.6;
  eight.z = -1.4;
  const corner = POOL_TABLE.pockets.find((pocket) => pocket.id === 'corner-foot-left');
  const dx = corner.x - eight.x;
  const dz = corner.z - eight.z;
  const reach = Math.hypot(dx, dz);
  const cueBall = frame.balls.find((ball) => ball.id === 0);
  cueBall.x = eight.x - (dx / reach);
  cueBall.z = eight.z - (dz / reach);
  frame.shoot({ angle: Math.atan2(dx, dz), power: 0.55 });
  let guard = 0;
  while (frame.state !== 'over' && guard++ < 6000) frame.update(0.05);
  assert.equal(frame.state, 'over');
  assert.equal(frame.winner, 'rippin', 'the eight went early and he did not lose the frame');

  assert.equal(campaign.state.story.familyRespect, 0);
  assert.equal(
    campaign.state.story.timeEvents.includes(TIME_EVENT_IDS.BEAT_RIPPINFLOW_AT_POOL), false,
  );
  /* And the win that comes later still pays. */
  assert.equal(awardPoolFrameRespect(campaign), true);
  assert.equal(campaign.state.story.familyRespect, POOL_FRAME_RESPECT);
});

test('pool: a preview boot has no campaign, and the table quietly pays nothing', () => {
  assert.equal(awardPoolFrameRespect(null), false);
  assert.equal(awardPoolFrameRespect(undefined), false);
  assert.equal(awardPoolFrameRespect({}), false);
});

test('pool: the scene banks the win through the campaign and only announces a real one', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/mansion/main.js'), 'utf8');
  /* Only on a win. */
  assert.match(source, /if \(winner !== 'player'\) return;/);
  /* Through the campaign, not into scene-local state. */
  assert.match(source, /if \(!awardPoolFrameRespect\(mansionCampaign\.campaign\)\) return;/);
  /* And the banner is downstream of the bank, so a refused second win is
   * silent rather than a lie on the screen. */
  const hook = source.slice(source.indexOf('onFrameOver:'), source.indexOf('function poolShotPose'));
  const bank = hook.indexOf('awardPoolFrameRespect');
  const banner = hook.indexOf('announceCheckpoint');
  assert.ok(bank > 0 && banner > bank, 'the banner is raised before the save agrees');
  /* No second respect field and no money on the felt. */
  const poolSection = source.slice(source.indexOf('/* THE BILLIARD TABLE'), source.indexOf('/* ================================================================== */\n/* THE BASEMENT ARMORY'));
  assert.equal(/poolRespect|respectEarned|\bmoney\b|payout|wager/.test(poolSection), false,
    'the pool table has grown a second economy');
});

/* ================================================================== */
/* THE CUE IS A CUE                                                     */
/* ================================================================== */

test('pool: the cue is built like a cue and there is only one of it in the room', () => {
  /* IT WAS A BROOM HANDLE. r 0.02, h 1.5, one wood, parallel end to end --
   * and the one silhouette a cue has is its taper, so from the shooting
   * camera it read as a stick lying on the felt. The real article is about
   * 1.45 m, roughly 13 mm at the tip and 30 mm at the butt. */
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const table = interior.props.lounge.billiard;
  const cue = table.cue;
  assert.ok(cue?.isMesh, 'the cue is not a mesh any more');
  assert.equal(table.cueLength, 1.45, 'the table does not publish the cue it built');

  /* The shaft itself is the taper, and the taper is the whole read. THREE's
   * CylinderGeometry takes (radiusTop, radiusBottom, height); local +Y is the
   * TIP end, because the game lays the cue flat with rotX and that maps +Y
   * down the line of the shot. */
  const shaft = cue.geometry.parameters;
  assert.equal(Number(shaft.height.toFixed(3)), 1.45);
  assert.equal(Number((shaft.radiusTop * 2000).toFixed(1)), 13.2, 'the tip is not 13 mm');
  assert.equal(Number((shaft.radiusBottom * 2000).toFixed(1)), 30.4, 'the butt is not 30 mm');
  assert.ok(shaft.radiusBottom > shaft.radiusTop * 2, 'the cue does not taper');

  /* Every piece the owner asked for, present and in the right place along the
   * stick. Measured from the butt at -0.725, because that is how a cue is
   * described and how these can be checked against a real one. */
  const fromButt = (name) => {
    const part = cue.getObjectByName(`billiard-cue-${name}`);
    assert.ok(part, `the cue has no ${name}`);
    return Number((part.position.y + 1.45 / 2).toFixed(3));
  };
  assert.ok(fromButt('bumper') < 0.03, 'the bumper is not on the butt');
  assert.ok(fromButt('butt') < fromButt('wrap'), 'the wrap is below the butt sleeve');
  assert.ok(fromButt('wrap') > 0.12 && fromButt('wrap') < 0.42,
    'the wrap is not where a hand goes');
  assert.ok(fromButt('forearm') > fromButt('wrap'));
  assert.ok(fromButt('collar') > 0.7 && fromButt('collar') < 0.79,
    'the joint is not at the middle of the cue');
  assert.ok(fromButt('ferrule') > 1.39, 'the ferrule is not at the business end');
  assert.ok(fromButt('tip') > fromButt('ferrule'), 'the tip is behind the ferrule');

  /* THE SPARES IN THE WALL RACK ARE THE SAME OBJECT, not five more cylinders
   * that happen to look similar. A room whose spare cues are a different
   * build from the one in your hands is a room that will drift. */
  const racked = interior.root.children.filter((child) => (
    child.isMesh && child.getObjectByName('lounge-rack-cue-0-tip')
      ? true
      : child.isMesh && /lounge-rack-cue-\d+-tip/.test(child.children[6]?.name ?? '')
  ));
  assert.equal(racked.length, 5, 'the wall rack is not holding five built cues');
  for (const spare of racked) {
    assert.deepEqual(
      { ...spare.geometry.parameters, radialSegments: undefined },
      { ...cue.geometry.parameters, radialSegments: undefined },
      'a rack cue is a different stick from the one on the table',
    );
    assert.equal(spare.children.length, cue.children.length);
  }
});

test('pool: the detailed cue fits inside the bare cylinder it replaced', () => {
  /* THE ARGUMENT THAT THIS CANNOT HAVE BROKEN THE GEOMETRY GATE. The old cue
   * was a cylinder of radius 0.02 and length 1.5 and the old rack cues were
   * radius 0.018 by 1.45. Every piece of the new one is inside those bounds,
   * so it cannot be through anything the cylinder was not already through --
   * which is worth asserting rather than asserting once by hand, because the
   * mansion allowlist is 19 MB of reviewed entries and nobody re-reads it. */
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const cue = interior.props.lounge.billiard.cue;
  const widest = [cue, ...cue.children].reduce((worst, part) => {
    const p = part.geometry.parameters;
    /* Uniform-radius pieces come back as a scaled unit cylinder; tapered ones
     * carry their real radii. Both, in metres. */
    const radius = part === cue || p.radiusTop !== p.radiusBottom
      ? Math.max(p.radiusTop, p.radiusBottom)
      : part.scale.x;
    return Math.max(worst, radius);
  }, 0);
  assert.ok(widest <= 0.018, `the new cue is ${widest} m across, wider than the rack cylinder`);
  assert.ok(widest <= 0.02, 'the new cue is wider than the table cylinder it replaced');
});

/* ================================================================== */
/* THE FORWARD STROKE                                                   */
/* ================================================================== */

test('pool: the cue accelerates through the ball, follows through and settles', () => {
  /* HALF AN ANIMATION IS WHAT THIS REPLACES. The cue was drawn BACK in
   * proportion to power and then the strike was instantaneous, so the stick
   * never travelled and read as a prop lying on the felt while the balls
   * moved by themselves. */
  const frame = new PoolFrame({ rng: steady });
  frame.takeCue();
  const address = frame.cueBack(1.45);
  frame.shoot({ angle: Math.PI, power: 1 });
  const contact = 1.45 / 2 + POOL_TABLE.ballRadius;

  const poses = [];
  for (let i = 0; i < 40 && frame.state === 'rolling'; i++) {
    poses.push(frame.cueBack(1.45));
    frame.update(0.05);
  }

  /* Drawn back further for a full-power shot than for the 0.6 it was resting
   * at, and the first pose is the address it was drawn to. */
  assert.ok(poses[0] > address, 'a harder shot is not drawn back further');

  /* THE PROOF THAT A 0.05 s STEP DOES NOT SKIP IT. src/mansion/main.js clamps
   * dt to 0.05 and this scene renders at about 1.3 frames a second, so one
   * rendered frame advances the stroke by exactly this much. CUE_STROKE.draw
   * is 0.16 s, which is why there are three drawn poses between the address
   * and the ball rather than none. Anything at or under the clamp would be
   * resolved inside a single update and the cue would teleport. */
  assert.ok(CUE_STROKE.draw > 0.05,
    'the approach is shorter than one clamped frame — the stroke is invisible');
  const deepestAt = poses.indexOf(Math.min(...poses));
  const approach = poses.slice(0, deepestAt).filter((back) => back > contact);
  assert.ok(approach.length >= 3,
    `only ${approach.length} drawn poses between the address and the ball`);
  /* And it is accelerating, not sliding: each step covers more ground than
   * the one before it, which is what a cue does between the last pause of the
   * address and the ball. */
  for (let i = 2; i < approach.length; i++) {
    const step = approach[i - 1] - approach[i];
    const before = approach[i - 2] - approach[i - 1];
    assert.ok(step > before, 'the approach is linear, not an acceleration');
  }

  /* It goes THROUGH the ball. A cue that stops on contact is a poke. */
  const deepest = Math.min(...poses);
  assert.ok(deepest < contact - 0.05, `the follow-through only reached ${deepest}`);

  /* And it comes back, rather than being left lying where it finished. */
  const settled = poses[poses.length - 1];
  assert.ok(settled > deepest, 'the cue never straightened up again');
  assert.ok(CUE_STROKE_SECONDS < 1, 'the stroke outlasts most shots');
});

test('pool: nothing on the table moves until the tip actually gets there', () => {
  /* The cue ball used to leave on the same line that started the animation,
   * which is a ball moving before it is hit. The state is 'rolling' from the
   * instant he commits -- nothing outside pool.js has to learn a new one --
   * but the table is held still for CUE_STROKE.draw of simulated seconds. */
  const frame = new PoolFrame({ rng: steady });
  frame.takeCue();
  const strikes = [];
  frame.hooks.onEvent = (event) => { if (event.type === 'strike') strikes.push(event); };
  frame.shoot({ angle: Math.PI, power: 1 });
  assert.equal(frame.state, 'rolling');
  assert.equal(strikes.length, 0, 'the strike rang before the cue arrived');
  const cue = frame.balls.find((ball) => ball.id === 0);
  const startZ = cue.z;

  frame.update(0.05);
  assert.equal(cue.z, startZ, 'the cue ball moved while the cue was still coming');
  assert.equal(strikes.length, 0);

  let guard = 0;
  while (strikes.length === 0 && guard++ < 40) frame.update(0.05);
  assert.ok(guard <= 4, `the tip took ${guard} frames to land`);
  assert.ok(cue.z !== startZ, 'the tip landed and nothing happened');
  assert.equal(strikes[0].speed, strikeSpeed(1));
});

test('pool: walking away between the address and the ball still plays the shot', () => {
  /* THE HOLE THE DELAY OPENS, SHUT. `_shot` is on the referee's book from the
   * moment he commits, so running the table out from a stroke that has not
   * landed would settle a shot in which nothing was ever hit and rule it a
   * foul for no contact — a man penalised for a shot the game had not let him
   * play yet. `putCueBack` lands the tip first. */
  const frame = new PoolFrame({ rng: steady });
  frame.takeCue();
  frame.shoot({ angle: Math.PI, power: 0.8 });
  frame.update(0.05);
  assert.equal(frame.state, 'rolling');
  frame.putCueBack();
  assert.equal(tableStill(frame.balls), true);
  assert.ok(frame.lastShot, 'the referee never saw it');
  assert.notEqual(frame.lastShot.foul, 'no contact');
  assert.ok(frame.lastShot.firstContact !== null, 'the break never touched the pack');
});

/* ================================================================== */
/* THE POWER METER IS GOLF'S                                            */
/* ================================================================== */

test('pool: the meter is the golf swing, not a third power bar', () => {
  /* Owner, standing complaint: "we keep reinventing and using different
   * systems instead of using what we already have." src/golf/swing.js is a
   * click-stop-click meter with a dead zone, an overswing band and an
   * accuracy model, and this is that meter -- imported, not copied. */
  for (const file of ['src/mansion/pool.js', 'src/mansion/pool-hud.js']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /from '\.\.\/golf\/swing\.js'/, `${file} does not use the golf swing`);
  }
  const pool = fs.readFileSync(path.join(ROOT, 'src/mansion/pool.js'), 'utf8');
  assert.equal(/POWER_TIME|STRIKE_START_FLOOR|deadZone\s*[:=]\s*0\./.test(pool), false,
    'pool.js has started re-deciding the swing timing for itself');
  /* The cue's own row lives in the shared table, so there is one place the
   * numbers for every meter in the game can be read side by side. */
  assert.ok(SWING_CONTROL.cue, 'the cue has no tuning in SWING_CONTROL');
  assert.ok(SWING_CONTROL.cue.strikeSpeed < 0.952,
    'the cue strike sweep is faster than the power sweep');
});

test('pool: three clicks take a shot, and the bar draws the rule it is judged by', () => {
  const frame = new PoolFrame({ rng: steady });
  frame.takeCue();
  assert.equal(frame.swing.phase, SWING_PHASE.IDLE);
  assert.equal(frame.cueClick(), SWING_PHASE.POWER);

  /* Eight clamped frames of the sweep. The meter is driven by ACCUMULATED
   * SIMULATED TIME, so this is 0.4 s of a 1.05 s bar wherever it is run --
   * and the marker is where the last drawn frame put it, which is the whole
   * requirement for a bar you stop by eye. */
  for (let i = 0; i < 8; i++) frame.update(0.05);
  assert.ok(Math.abs(frame.swing.marker - 0.4 / 1.05) < 1e-9);
  /* The cue on the table is drawn back to the marker, not to a power nobody
   * has chosen yet -- the same read golf's arms take. */
  assert.ok(Math.abs(frame.drawPower - frame.swing.marker) < 1e-9);

  const meter = poolMeterState(frame.view);
  assert.equal(meter.phase, SWING_PHASE.POWER);
  assert.ok(meter.mark > 0 && meter.mark < 100);
  /* The orange band starts at the swing's own control point, and the pale
   * middle is the swing's own dead zone -- there is no second set of numbers
   * on the panel that could agree with the physics today and not tomorrow. */
  assert.ok(Math.abs(meter.riskLeft - ((SWING_CONTROL.cue.safePower + 0.3) / 1.3) * 100) < 1e-9);
  assert.ok(meter.zoneWidth > 0);

  assert.equal(frame.cueClick(), SWING_PHASE.STRIKE);
  const striking = poolMeterState(frame.view);
  assert.equal(striking.striking, true);
  assert.match(striking.hint, /STRIKE|SWEET SPOT/);

  assert.equal(frame.cueClick(), SWING_PHASE.DONE);
  assert.equal(frame.state, 'rolling', 'the third click did not take the shot');
  assert.equal(frame.shots, 1);
  assert.ok(frame.lastSwing, 'the frame kept no record of how it was struck');
});

test('pool: a botched meter and an overswing both push the cue off line', () => {
  /* THE POINT OF HAVING A METER AT ALL. Accuracy has to reach the felt, or
   * the bar is decoration -- exactly as an early third click pushes a golf
   * shot right rather than merely printing SLICED. */
  const straight = new PoolFrame({ rng: steady });
  straight.takeCue();
  straight.shoot({ angle: 1, power: 0.5, accuracy: 0 });
  assert.equal(straight.aimAngle, 1);

  const duffed = new PoolFrame({ rng: steady });
  duffed.takeCue();
  duffed.shoot({ angle: 1, power: 0.5, accuracy: 1 });
  assert.equal(Number((duffed.aimAngle - 1).toFixed(6)), MISCUE_RAD);
  /* Wide enough to cost a pot at the length of the table, and not so wide the
   * cue ball goes somewhere he did not point it: about a hand's width at a
   * metre and a half. */
  const missAt = Math.tan(MISCUE_RAD) * 1.5;
  assert.ok(missAt > 0.06 && missAt < 0.12, `a full miss-time is ${missAt} m off at 1.5 m`);

  /* And an overswing leans it over even when the timing was clean: `risk`
   * comes out of the shared window, `fadeBias` turns it into a bias, and the
   * bias is a real angle here rather than a curve in flight. */
  const held = resolveStrike({ club: 'cue', power: SWING_CONTROL.cue.safePower, strike: 0 });
  const forced = resolveStrike({ club: 'cue', power: 1, strike: 0 });
  assert.equal(held.accuracy, 0, 'a controlled stroke is not straight');
  assert.ok(forced.accuracy > 0.15, 'a full overswing costs nothing');
  assert.ok(forced.deadZone < held.deadZone, 'an overswing is not a smaller sweet spot');
});

test('pool: Rippinflow keeps his authored hand and reports it in golf\'s shape', () => {
  /* His skill is data (RIPPINFLOW.aimError, in radians, because that is the
   * unit a shaking hand is measured in) and `npcSwing` is golf's NPC result
   * -- a clamped {power, accuracy} pair that was exported and used by nobody.
   * Expressing his shake through it is exact arithmetic, not a re-tune. */
  const source = fs.readFileSync(path.join(ROOT, 'src/mansion/pool.js'), 'utf8');
  assert.match(source, /npcSwing\(/, 'Rippinflow is not going through the shared NPC shape');
  const shake = 0.026;
  assert.equal(
    Number((npcSwing(0.5, shake / MISCUE_RAD).accuracy * MISCUE_RAD).toFixed(12)),
    Number(shake.toFixed(12)),
    'routing his hand through npcSwing changed how much it shakes',
  );

  /* And he still misses sometimes and still wins sometimes -- the same claim
   * the frame-playing tests above make, restated here as the reason his hand
   * is allowed to be random at all. */
  const frame = new PoolFrame({ rng: wobble(3) });
  frame.takeCue();
  frame.turn = 'rippin';
  frame.state = 'think';
  let guard = 0;
  while (frame.state === 'think' && guard++ < 200) frame.update(0.05);
  assert.equal(frame.state, 'rolling', 'he never took the shot');
  assert.equal(frame.lastSwing, null, 'the player meter recorded his shot');
});
