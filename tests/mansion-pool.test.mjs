import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ensureDomShim } from '../tools/three-shim.mjs';

ensureDomShim();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
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
  MANSION_INTERACTION_CUE_NAMES,
  POOL_CUE_NAMES,
  POOL_SFX_CUES,
} = await import('../src/mansion/interaction-audio.js');
const { mansionAudioBanks } = await import('../src/mansion/audio-banks.js');
const { allSilentSquatchLines, SEQUENCES } = await import('../src/mansion/script.js');
const { poolPanelText } = await import('../src/mansion/pool-hud.js');
const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
const manifestNames = new Set(manifest.sfx.map((cue) => cue.name));

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

test('pool: the five table sounds are in the manifest with a prompt to record from', () => {
  assert.equal(POOL_SFX_CUES.length, 5);
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
  /* And the power meter is timed off the clock, not off accumulated dt. */
  assert.match(source, /poolCharge = performance\.now\(\);/);
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
