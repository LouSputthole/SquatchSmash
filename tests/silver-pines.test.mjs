import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  HOLES, COURSE_PAR, getHole, nextHole, scoreName, scoreBand, relativeLabel,
  SURFACE, SURFACE_PROPS, surfaceProps, FOURSOME, TEE_ORDER, toYards, toFeet,
} from '../src/golf/course.js';
import {
  heightAt, surfaceAt, slopeAt, dropPointFor, recoveryPointFor, isOutOfBounds,
} from '../src/golf/field.js';
import { simulate, solveShot, Ball } from '../src/golf/ball.js';
import {
  launchFor, CLUB_IDS, estimateCarry, powerForCarry,
} from '../src/golf/clubs.js';
import {
  Swing, SWING_PHASE, DEAD_ZONE, controlWindow, resolveStrike, shotShape,
} from '../src/golf/swing.js';
import { Scorecard } from '../src/golf/scorecard.js';
import { Round, BEAT } from '../src/golf/mission.js';
import {
  CUES, SEQUENCES, buildScripts, unreachableCues, pastMissionBanter,
} from '../src/golf/script.js';
import {
  TEE_MARKS, GREEN, PIN, POND, BUNKER, NPC_TEE_SHOTS, LAYOUT as HOLE1,
} from '../src/golf/hole1.js';
import { LAYOUT as HOLE2 } from '../src/golf/hole2.js';
import { LAYOUT as HOLE3 } from '../src/golf/hole3.js';
import { builtHoles, setActiveHole, HOLE } from '../src/golf/hole.js';
import { bunkers } from '../src/golf/field.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { voiceProfileFor } from '../src/core/characters.js';
import {
  GOLF_EFFECT_CUES, GOLF_LATER_AUDIO_SCOPES, GOLF_START_AUDIO_SCOPE,
  playRecordedGolfChoice, playRecordedGolfCue, recordedGolfClip,
} from '../src/golf/audio.js';
import { makeBag, makeClub } from '../src/golf/cast.js';
import { CartPair } from '../src/golf/carts.js';

/* These are the facts about the hole that the browser verifier cannot state
 * cheaply and that a careless edit to the layout would silently change. The
 * playthrough lives in tools/verify-golf.mjs; this is the geometry and the
 * arithmetic under it. */

const TEE = { x: TEE_MARKS.ball.x, z: TEE_MARKS.ball.z };
const lieAt = (p) => surfaceProps(surfaceAt(p.x, p.z));

function makeRound() {
  return new Round({
    cues: {
      busy: false,
      play() {},
      playSequence() {},
      suppressBanter() {},
      lengthOf() { return 0; },
    },
    dialogue: {},
  });
}

test('a water or out-of-bounds ball must be dropped before it can be addressed', () => {
  const round = makeRound();
  round.beat = BEAT.APPROACH;
  round.playerBall.state = 'water';
  assert.equal(round.needsRelief(), true);
  assert.equal(round.canAddress(), false);
  round.playerBall.state = 'oob';
  assert.equal(round.needsRelief(), true);
  assert.equal(round.canAddress(), false);
});

test('taking tee-shot relief cannot skip the required cart beat', () => {
  const round = makeRound();
  round.beat = BEAT.TEE_RESULT;
  round._resultPlayed = true;
  round.playerBall.state = 'water';
  round.takeDrop('water');
  assert.equal(round.beat, BEAT.TEE_RESULT,
    'the tee-result beat must remain responsible for starting the cart ride');
});

test('a tap-in gimme costs one stroke and ends at the live cup', () => {
  setActiveHole(1);
  const round = makeRound();
  round.beat = BEAT.APPROACH;
  round.playerBall.placeAt(HOLE1.pin.x, HOLE1.pin.z + 0.65);
  round.card.addStroke(CHARACTER_IDS.PROSPECT, 1);
  const before = round.card.hole(CHARACTER_IDS.PROSPECT, 1).strokes;
  const result = round.takeGimme();
  assert.equal(result.ok, true);
  assert.equal(round.card.hole(CHARACTER_IDS.PROSPECT, 1).strokes, before + 1);
  assert.equal(round.playerBall.state, 'holed');
  assert.ok(round.playerBall.distanceToPin() < 0.01);
});

test('the mercy cap picks up an endless ball instead of softlocking the round', () => {
  setActiveHole(1);
  const round = makeRound();
  round.beat = BEAT.APPROACH;
  round.playerBall.placeAt(HOLE1.green.x, HOLE1.green.z + 5);
  for (let i = 0; i < 8; i++) round.card.addStroke(CHARACTER_IDS.PROSPECT, 1);
  round._updateApproach(0.05, { x: HOLE1.green.x, z: HOLE1.green.z + 5 });
  assert.equal(round.playerBall.state, 'holed');
  assert.equal(round.card.finished(CHARACTER_IDS.PROSPECT, 1), true);
  assert.equal(round.beat, BEAT.HOLE_OUT);
});

test('walking away cannot permanently skip the first-tee invitation', () => {
  const round = makeRound();
  const lou = { group: { position: { x: 0, z: 0 } }, npc: {} };
  round.golfers[CHARACTER_IDS.LOU] = lou;
  round.dialogue = {
    active: false,
    lastEndReason: 'walked-away',
    starts: 0,
    start() { this.active = true; this.lastEndReason = null; this.starts++; },
  };
  round.beat = BEAT.TEE_TALK;
  round._step = 1;
  round._wait = 0;

  round._updateTeeTalk(0, { x: 30, z: 0 });
  assert.equal(round.beat, BEAT.TEE_TALK);
  assert.equal(round.dialogue.starts, 0, 'the exchange waits until the player comes back');

  round._updateTeeTalk(0, { x: 3, z: 0 });
  assert.equal(round.beat, BEAT.TEE_TALK);
  assert.equal(round.dialogue.starts, 1, 'the unanswered exchange is offered again near Lou');

  round.dialogue.active = false;
  round.dialogue.lastEndReason = 'interrupted';
  round._updateTeeTalk(0, { x: 30, z: 0 });
  assert.equal(round.beat, BEAT.TEE_TALK,
    'an interrupted required exchange cannot be mistaken for completion');

  round._updateTeeTalk(0, { x: 3, z: 0 });
  assert.equal(round.dialogue.starts, 2, 'an interrupted exchange resumes near Lou too');

  round.dialogue.active = false;
  round.dialogue.lastEndReason = 'done';
  round._updateTeeTalk(0, { x: 3, z: 0 });
  assert.equal(round.beat, BEAT.NPC_TEE, 'only a completed branch releases the tee');
});

test('fade and slice visibly curve during flight instead of only launching offline', () => {
  setActiveHole(1);
  const from = { x: HOLE1.teeMarks.ball.x, z: HOLE1.teeMarks.ball.z };
  const lie = surfaceProps(surfaceAt(from.x, from.z));
  const trace = (accuracy) => {
    const ball = new Ball();
    ball.placeAt(from.x, from.z);
    ball.strike(0, launchFor('driver', { power: 0.9, accuracy, lie }));
    let elapsed = 0;
    let early = null;
    while (ball.moving && elapsed < 2.6) {
      ball.update(1 / 120);
      elapsed += 1 / 120;
      if (!early && elapsed >= 0.35) early = { x: ball.position.x, z: ball.position.z };
    }
    return { early, late: { x: ball.position.x, z: ball.position.z } };
  };
  const straight = trace(0);
  const fade = trace(1);
  const earlyAngle = Math.atan2(
    fade.early.x - straight.early.x,
    fade.early.z - from.z,
  );
  const lateAngle = Math.atan2(
    fade.late.x - straight.late.x,
    fade.late.z - from.z,
  );
  assert.ok(lateAngle > earlyAngle + 0.012,
    `shot shape should build in flight: early ${earlyAngle}, late ${lateAngle}`);
});

test('a long approach starts a reusable solo cart retrieval without replaying dialogue', () => {
  setActiveHole(1);
  const round = makeRound();
  let drives = 0;
  round.carts = {
    lead: { position: { x: 0, z: -100 }, velocity: 0 },
    beginPlayerDrive(options) { drives++; this.options = options; },
  };
  round.dialogue = { active: false };
  round.beat = BEAT.APPROACH;
  round._approachShotPending = true;
  round.playerBall.placeAt(0, -100);
  round._updateApproach(0.016, { x: 0, z: 0 });
  assert.equal(round.beat, BEAT.CART);
  assert.equal(round._cartFromTee, false);
  assert.equal(drives, 1);
  assert.deepEqual(round.carts.options, { follow: false });
  let reseated = 0;
  round._rideAlong = () => { reseated++; };
  round._updateCart(0.016);
  assert.equal(reseated, 0, 'the live group keeps playing instead of teleporting into the carts');
  assert.equal(round.cartExitState().ok, true,
    'later retrievals do not wait on the one-time private conversation');
});

test('walking back to the cart completes at the place the player actually parked it', () => {
  setActiveHole(1);
  const round = makeRound();
  let completed = 0;
  round.hooks.onHoleComplete = () => { completed++; };
  round.carts = { lead: { position: { x: 42, z: -118 } } };
  round.beat = BEAT.WALK_OFF;

  round._updateWalkOff(0.016, { x: 42, z: -118 });

  assert.equal(completed, 1, 'the live lead cart is the walk-off destination');
  assert.equal(round.beat, BEAT.NEXT_TEE);
});

test('the round is a par 3, a par 5 and a par 4, in that order', () => {
  assert.deepEqual(HOLES.map((h) => h.par), [3, 5, 4]);
  assert.equal(COURSE_PAR, 12);
  assert.equal(getHole(1).name, 'The Invitation');
  assert.equal(nextHole(1).name, 'The Long Walk');
  assert.equal(nextHole(3), null);
  /* What the card claims is playable and what the course can actually load
   * have to be the same list. A hole that claims to be playable with no layout
   * behind it strands a round on its own tee. */
  assert.deepEqual(HOLES.filter((h) => h.playable).map((h) => h.number), builtHoles());
});

test('the marker on the tee is telling the truth about the hole', () => {
  const hole = getHole(1);
  const toCentre = toYards(Math.hypot(GREEN.x - TEE.x, GREEN.z - TEE.z));
  assert.ok(Math.abs(toCentre - hole.yards) < 3, `${toCentre.toFixed(1)} yds vs ${hole.yards}`);
});

test('the tee is elevated four to five metres above the green', () => {
  const drop = heightAt(TEE.x, TEE.z) - heightAt(GREEN.x, GREEN.z);
  assert.ok(drop >= 4 && drop <= 5, `${drop.toFixed(2)} m`);
});

test('the green can be seen from the tee', () => {
  /* The reason the hole needs no tutorial box. An eye on the tee box must
   * clear the ground the whole way to the green, or every decision the hole
   * asks for is being made blind. */
  const eye = heightAt(TEE.x, TEE.z) + 1.66;
  const target = heightAt(GREEN.x, GREEN.z);
  for (let t = 0.05; t < 1; t += 0.05) {
    const x = TEE.x + (GREEN.x - TEE.x) * t;
    const z = TEE.z + (GREEN.z - TEE.z) * t;
    const sight = eye + (target - eye) * t;
    assert.ok(heightAt(x, z) < sight,
      `ground blocks the view at z=${z.toFixed(0)} (${heightAt(x, z).toFixed(2)} > ${sight.toFixed(2)})`);
  }
});

test('the hole is laid out the way the marker describes it', () => {
  assert.equal(surfaceAt(TEE.x, TEE.z), SURFACE.TEE);
  assert.equal(surfaceAt(GREEN.x, GREEN.z), SURFACE.GREEN);
  assert.equal(surfaceAt(PIN.x, PIN.z), SURFACE.GREEN);
  assert.equal(surfaceAt(POND.x, POND.z), SURFACE.WATER);
  assert.equal(surfaceAt(BUNKER.x, BUNKER.z), SURFACE.BUNKER);
  // Water short and right; bunker front and left.
  assert.ok(POND.x > GREEN.x, 'the pond is right of the green');
  assert.ok(POND.z > GREEN.z, 'the pond is short of the green');
  assert.ok(BUNKER.x < GREEN.x, 'the bunker is left of the green');
  assert.ok(BUNKER.z > GREEN.z, 'the bunker is short of the green');
});

test('the Prospect drives the lead cart while Erican keeps the follow cart with the group', () => {
  setActiveHole(1);
  const carts = new CartPair(new THREE.Scene());
  carts.stage();
  const start = carts.lead.position.clone();
  const startYaw = carts.lead.group.rotation.y;

  carts.beginPlayerDrive();
  carts.setPlayerInput({ throttle: 1, steer: 0, brake: false });
  for (let i = 0; i < 180; i++) carts.update(1 / 60);
  assert.ok(carts.lead.position.distanceTo(start) > 5, 'holding W should move the lead cart');

  carts.setPlayerInput({ throttle: 1, steer: 1, brake: false });
  for (let i = 0; i < 90; i++) carts.update(1 / 60);
  assert.ok(Math.abs(carts.lead.group.rotation.y - startYaw) > 0.25,
    'holding A or D should change the cart heading');
  assert.ok(carts.follow.position.distanceTo(carts.lead.position) < 24,
    'Erican should keep the second cart with the group');

  carts.setPlayerInput({ throttle: 0, steer: 0, brake: true });
  for (let i = 0; i < 120; i++) carts.update(1 / 60);
  assert.ok(Math.abs(carts.lead.velocity) < 0.05, 'holding Space should stop the lead cart');
});

test('getting out is gated by Lou, cart speed and proximity to the live ball', () => {
  setActiveHole(1);
  const scene = new THREE.Scene();
  const carts = new CartPair(scene);
  const dialogue = { active: true };
  const cues = {
    busy: false,
    suppressBanter() {},
    play() {},
    playSequence() {},
    lengthOf() { return 0; },
  };
  const golfers = Object.fromEntries(
    [CHARACTER_IDS.LOU, CHARACTER_IDS.ERIC, CHARACTER_IDS.RIPPINFLOW]
      .map((id) => [id, {
        standUp() {},
        placeAt() {},
        walkTo() {},
      }]),
  );
  const round = new Round({ cues, dialogue, golfers, carts });
  round.beat = 'cart';
  carts.stage();
  carts.beginPlayerDrive();

  assert.match(round.cartExitState().reason, /Lou/i, 'the talk finishes before an exit');
  dialogue.active = false;
  carts.lead.group.position.set(
    round.playerBall.position.x + 25,
    0,
    round.playerBall.position.z,
  );
  assert.match(round.cartExitState().reason, /closer/i, 'a distant exit stays blocked');

  carts.lead.group.position.set(
    round.playerBall.position.x + 5,
    0,
    round.playerBall.position.z,
  );
  carts.lead.velocity = 2;
  assert.match(round.cartExitState().reason, /Stop/i, 'a moving exit stays blocked');

  carts.lead.velocity = 0;
  const exit = round.leaveCart();
  assert.equal(exit.ok, true);
  assert.equal(round.beat, 'approach');
  assert.equal(carts.playerDriving, false);
});

test('ready golf walks every NPC to his live ball before an approach stroke', () => {
  setActiveHole(1);
  const actions = new Map();
  const golfers = Object.fromEntries(
    [CHARACTER_IDS.ERIC, CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW].map((id) => {
      const state = { position: new THREE.Vector3(), walking: false, busy: false };
      actions.set(id, { walks: [], swings: 0, addresses: 0, state });
      return [id, {
        ...state,
        setClub() {},
        walkTo(x, z) {
          actions.get(id).walks.push({ x, z });
          this.position.set(x, 0, z);
          this.walking = false;
        },
        faceToward() {},
        address() { actions.get(id).addresses++; },
        swing({ onImpact, onDone } = {}) {
          actions.get(id).swings++;
          onImpact?.();
          onDone?.();
        },
        markBall() {},
        leanOnClub() {},
        retrieveFromCup() {},
      }];
    }),
  );
  const cues = {
    busy: false,
    suppressBanter() {},
    play() {},
    playSequence() {},
    lengthOf() { return 0; },
  };
  const round = new Round({
    cues,
    dialogue: { active: false },
    golfers,
    hooks: {},
  });
  round.beat = 'approach';

  round.update(3, { x: HOLE.teeMarks.ball.x, z: HOLE.teeMarks.ball.z });
  for (const id of [CHARACTER_IDS.ERIC, CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW]) {
    assert.equal(actions.get(id).walks.length, 1, `${id} should start toward his own ball`);
    assert.equal(round.card.hole(id, HOLE.number).strokes, 0,
      `${id} cannot record a remote stroke before addressing`);
  }

  round.update(0.05, { x: HOLE.teeMarks.ball.x, z: HOLE.teeMarks.ball.z });
  round.update(0.5, { x: HOLE.teeMarks.ball.x, z: HOLE.teeMarks.ball.z });
  for (const id of [CHARACTER_IDS.ERIC, CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW]) {
    const ball = round.ballFor(id).position;
    const golfer = actions.get(id).state.position;
    assert.ok(Math.hypot(golfer.x - ball.x, golfer.z - ball.z) < 1.2,
      `${id} should swing from the live lie, not a staging anchor`);
    assert.equal(actions.get(id).addresses, 1);
    assert.equal(actions.get(id).swings, 1);
    assert.equal(round.card.hole(id, HOLE.number).strokes, 1);
  }
});

test('each hole preserves the visual composition it was designed around', () => {
  /* The clubhouse regression passed every physics check because no test said
   * Hole 3 was designed to end on that building. State those visual promises. */
  const h1 = HOLE1;
  assert.ok(h1.pond && h1.pond.x > h1.green.x && h1.pond.z > h1.green.z,
    'Hole 1 keeps water short-right of the green');
  assert.ok(h1.bunker.x < h1.green.x && h1.bunker.z > h1.green.z,
    'Hole 1 keeps the bail-out bunker short-left');

  const path = HOLE2.corridor.path;
  assert.ok(path.at(-1).x - path[0].x > 120, 'Hole 2 still turns decisively right');
  assert.ok(path[0].halfWidth - Math.min(...path.map((p) => p.halfWidth)) >= 10,
    'Hole 2 still narrows at the conversation corner');
  assert.ok(Math.hypot(HOLE2.cornerBunker.x - path[2].x,
    HOLE2.cornerBunker.z - path[2].z) < 30,
    'Hole 2 keeps the bunker at the inside of the dogleg');

  const tee = HOLE3.teeMarks.ball;
  const forward = { x: HOLE3.green.x - tee.x, z: HOLE3.green.z - tee.z };
  const progress = (p) => (p.x - tee.x) * forward.x + (p.z - tee.z) * forward.z;
  assert.equal(HOLE3.lot, null, 'Hole 3 deliberately has no car park');
  assert.ok(HOLE3.clubhouse, 'Hole 3 is staged on the clubhouse');
  assert.ok(progress(HOLE3.clubhouse) > progress(HOLE3.green),
    'the clubhouse remains behind the last green');
  assert.ok(Math.hypot(HOLE3.clubhouse.x - HOLE3.green.x,
    HOLE3.clubhouse.z - HOLE3.green.z) < 36, 'the clubhouse remains close enough to read');
});

test('recorded golf speech is timed and played without a synthetic voice fallback', () => {
  const clip = { duration: 2.75 };
  const calls = [];
  const engine = {
    buffers: new Map([['vo.golf.h1.lou.there_he_is', [clip]]]),
    play: (...args) => { calls.push(args); return { stop() {} }; },
  };
  assert.equal(recordedGolfClip(engine, 'golf.h1.lou.there_he_is'), clip);
  assert.equal(recordedGolfClip(engine, 'golf.h1.eric.morning'), null);
  assert.ok(playRecordedGolfCue(engine, 'golf.h1.lou.there_he_is', { volume: 0.8 }));
  assert.equal(playRecordedGolfCue(engine, 'golf.h1.eric.morning'), null);
  assert.deepEqual(calls, [['vo.golf.h1.lou.there_he_is', { volume: 0.8 }]]);
  assert.equal(new Set(GOLF_EFFECT_CUES).size, GOLF_EFFECT_CUES.length,
    'the recordable effect bank contains no duplicate cues');
  assert.deepEqual(GOLF_START_AUDIO_SCOPE.prefixes, ['vo.golf.h1.', 'footstep.']);
  assert.ok(!GOLF_START_AUDIO_SCOPE.prefixes.includes('vo.golf.'),
    'startup does not decode every hole before the player can move');
  assert.deepEqual(GOLF_LATER_AUDIO_SCOPES.map((scope) => scope.prefixes[0]),
    ['vo.golf.h2.', 'vo.golf.h3.']);
});

test('the pond bed is under the waterline everywhere it is called water', () => {
  /* Otherwise the edge of the hazard is painted blue at grass height, which
   * reads as a rug and makes a ball that lands there look like it is floating. */
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    for (const r of [0, 0.4, 0.75, 0.95]) {
      const x = POND.x + Math.cos(a) * POND.rx * r;
      const z = POND.z + Math.sin(a) * POND.rz * r;
      if (surfaceAt(x, z) !== SURFACE.WATER) continue;
      assert.ok(heightAt(x, z) < POND.level,
        `pond bed at (${x.toFixed(1)}, ${z.toFixed(1)}) is above the waterline`);
    }
  }
});

test('the green falls back to front and tilts toward the water', () => {
  const g = slopeAt(PIN.x, PIN.z);
  assert.ok(g.z > 0, 'the green should fall toward the front');
  assert.ok(g.x > 0, 'the green should fall toward the pond');
  // Gentle: a green you read by looking at it, not a ski slope.
  assert.ok(Math.hypot(g.x, g.z) < 0.06, `gradient ${Math.hypot(g.x, g.z).toFixed(3)}`);
});

test('the hole teaches its own safe line', () => {
  /* Eric says "middle of the green, ignore the flag" and the hole has to make
   * him right, or the best advice in the scene is decoration. */
  const lie = lieAt(TEE);
  const swing = { power: 0.85, accuracy: 0, lie };

  const safe = simulate(TEE, Math.atan2(GREEN.x - TEE.x, GREEN.z - TEE.z),
    launchFor('iron', swing));
  assert.equal(safe.surface, SURFACE.GREEN, 'the centre line should find the green');

  const greedy = simulate(TEE, Math.atan2(PIN.x - TEE.x, PIN.z - TEE.z),
    launchFor('iron', swing));
  assert.equal(greedy.state, 'water', 'the flag line should bring the water in');
});

test('three clubs, and each one is for something different', () => {
  assert.deepEqual(CLUB_IDS, ['driver', 'iron', 'putter']);
  const lie = lieAt(TEE);
  const aim = Math.atan2(GREEN.x - TEE.x, GREEN.z - TEE.z);
  const go = (club, power) => {
    const b = simulate(TEE, aim, launchFor(club, { power, accuracy: 0, lie }));
    return {
      yards: toYards(Math.hypot(b.position.x - TEE.x, b.position.z - TEE.z)),
      apex: b.apex,
    };
  };

  const driver = go('driver', 1);
  assert.ok(driver.yards > 240, `driver only went ${driver.yards.toFixed(0)} yds`);

  const iron = go('iron', 1);
  assert.ok(iron.yards > 175 && iron.yards < 205, `iron went ${iron.yards.toFixed(0)} yds`);
  assert.ok(driver.yards > iron.yards + 50, 'the driver must be obviously the long club');

  // The putter never leaves the ground, wherever it is used from.
  const putter = go('putter', 1);
  assert.ok(putter.apex < heightAt(TEE.x, TEE.z) + 0.4, 'the putter got airborne');
});

test('driver, iron and putter have three readable head silhouettes and angled hosels', () => {
  const models = Object.fromEntries(CLUB_IDS.map((kind) => [kind, makeClub(kind)]));
  const headSize = {};

  for (const [kind, model] of Object.entries(models)) {
    model.updateMatrixWorld(true);
    const head = model.getObjectByName(`club-head-${kind}`);
    const shaft = model.getObjectByName('club-shaft');
    const hosel = model.getObjectByName('club-hosel');
    assert.ok(head, `${kind} needs a named, inspectable head`);
    assert.ok(shaft, `${kind} needs a shaft`);
    assert.ok(hosel, `${kind} needs an angled hosel between shaft and head`);
    assert.ok(model.userData.hoselOffset >= 0.05,
      `${kind} shaft still enters the center of the head`);
    headSize[kind] = new THREE.Box3().setFromObject(head).getSize(new THREE.Vector3());
  }

  assert.equal(models.driver.getObjectByName('club-head-driver').geometry.type, 'SphereGeometry');
  assert.ok(headSize.driver.z > headSize.iron.z * 4,
    'the driver needs a deep wood head rather than an iron-shaped block');
  assert.equal(models.iron.getObjectByName('club-head-iron').geometry.type, 'ExtrudeGeometry');
  assert.ok(headSize.iron.y > headSize.putter.y * 2.5 && headSize.iron.z < 0.07,
    'the iron needs a tall, thin, angled blade');
  assert.equal(models.putter.getObjectByName('club-head-putter').geometry.type, 'BoxGeometry');
  assert.ok(headSize.putter.x > 0.20 && headSize.putter.y < 0.05,
    'the putter needs a long, genuinely flat blade');
});

test('the stand bag contains three complete clubs with their heads above the rim', () => {
  const scene = new THREE.Scene();
  const bag = makeBag(scene, 0, 0);
  bag.updateMatrixWorld(true);
  const rim = bag.getObjectByName('bag-rim');
  const clubs = bag.children.filter((child) => CLUB_IDS.includes(child.userData.kind));

  assert.ok(rim, 'the bag needs a readable opening and rim');
  assert.deepEqual(clubs.map((club) => club.userData.kind).sort(), [...CLUB_IDS].sort());
  const rimY = rim.getWorldPosition(new THREE.Vector3()).y;
  const headXs = [];
  for (const club of clubs) {
    const head = club.getObjectByName(`club-head-${club.userData.kind}`);
    assert.ok(head, `${club.userData.kind} is only a bare shaft in the bag`);
    const headPosition = head.getWorldPosition(new THREE.Vector3());
    headXs.push(headPosition.x);
    assert.ok(headPosition.y > rimY + 0.30,
      `${club.userData.kind} head does not visibly clear the bag opening`);
  }
  assert.ok(Math.max(...headXs) - Math.min(...headXs) > 0.45,
    'the three heads need to fan out instead of hiding in one clump');
  assert.ok(bag.getObjectByName('bag-front-pocket'), 'the bag needs a front pocket silhouette');
  assert.equal(bag.getObjectsByProperty('name', 'bag-stand-leg').length, 2,
    'the stand bag needs both deployed legs');
});

test('the lie is most of what a shot costs', () => {
  const aim = Math.PI;
  const carry = (surface) => {
    const b = simulate(TEE, aim, launchFor('iron', {
      power: 0.9, accuracy: 0, lie: SURFACE_PROPS[surface],
    }));
    return toYards(b.carry);
  };
  const tee = carry(SURFACE.TEE);
  assert.ok(carry(SURFACE.FAIRWAY) < tee, 'a fairway lie should cost something');
  assert.ok(carry(SURFACE.ROUGH) < carry(SURFACE.FAIRWAY) * 0.95, 'rough should cost more');
  assert.ok(carry(SURFACE.DEEP_ROUGH) < carry(SURFACE.ROUGH), 'heavy rough should cost most');
  assert.ok(carry(SURFACE.BUNKER) < tee * 0.75, 'sand should cost a lot');
});

test('a struck ball always ends up somewhere it can be played from', () => {
  /* The scene-ending bug this suite exists to prevent. Wherever a ball gets
   * to — the pond, a hundred metres out of bounds, under the world — the
   * recovery point has to be dry, in bounds and not in a bunker. */
  const nowhere = [
    { x: POND.x, z: POND.z },
    { x: -400, z: -400 },
    { x: 0, z: -320 },
    { x: 900, z: 12 },
    { x: BUNKER.x, z: BUNKER.z },
  ];
  for (const spot of nowhere) {
    for (const point of [recoveryPointFor(spot.x, spot.z), dropPointFor(spot.x, spot.z)]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z));
      assert.ok(!isOutOfBounds(point.x, point.z), `drop went out of bounds from ${JSON.stringify(spot)}`);
      assert.notEqual(surfaceAt(point.x, point.z), SURFACE.WATER,
        `drop went in the water from ${JSON.stringify(spot)}`);
      assert.ok(Number.isFinite(heightAt(point.x, point.z)));
    }
  }
});

test('a ball that has gone under the world is caught rather than lost', () => {
  const b = new Ball();
  b.placeAt(GREEN.x, GREEN.z);
  b.position.y -= 40;
  b.state = 'roll';
  assert.equal(b.watchdog(0.1), 'below_terrain');
});

test("the NPCs' authored tee shots really fly where the writing says", () => {
  const lie = lieAt(TEE);
  const shot = (who) => solveShot({
    from: TEE, target: NPC_TEE_SHOTS[who].target,
    club: NPC_TEE_SHOTS[who].club, lie, loftBias: NPC_TEE_SHOTS[who].loftBias,
  });

  const eric = shot(CHARACTER_IDS.ERIC);
  assert.equal(eric.surface, SURFACE.GREEN, 'Eric hits the middle of the green');
  assert.ok(toFeet(Math.hypot(eric.landedAt.x - PIN.x, eric.landedAt.z - PIN.z)) < 30);

  const rippin = shot(CHARACTER_IDS.RIPPINFLOW);
  assert.equal(rippin.surface, SURFACE.BUNKER, 'Rippin finds the bunker he wanted');

  const lou = shot(CHARACTER_IDS.LOU);
  assert.equal(lou.surface, SURFACE.GREEN, 'Lou finishes on the green');
  assert.notEqual(lou.landing.surface, SURFACE.GREEN, 'Lou lands short and releases');
  // "It's closer than yours."
  const louFeet = Math.hypot(lou.landedAt.x - PIN.x, lou.landedAt.z - PIN.z);
  const ripFeet = Math.hypot(rippin.landedAt.x - PIN.x, rippin.landedAt.z - PIN.z);
  assert.ok(louFeet < ripFeet, 'Lou has to finish inside Rippin');
});

test('the swing is forgiving in the middle and punishing at the edges', () => {
  const s = new Swing();
  s.click();
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  s.click();
  assert.equal(s.phase, SWING_PHASE.STRIKE);
  assert.ok(s.power > 0.3 && s.power <= 1);

  // Inside the dead zone the strike is pure, not merely good.
  const pure = new Swing();
  pure.power = 0.9;
  pure._resolve(DEAD_ZONE * 0.5);
  assert.equal(pure.accuracy, 0);
  assert.equal(pure.strikeLabel(), 'PURED');

  // Outside it, the sign of the miss is the direction of the miss.
  const right = new Swing();
  right._resolve(0.3);
  const left = new Swing();
  left._resolve(-0.3);
  assert.ok(right.accuracy > 0 && left.accuracy < 0);
  assert.equal(Math.abs(right.accuracy), Math.abs(left.accuracy));
});

test('the power target recommends a useful club-specific shot instead of full power', () => {
  const lie = lieAt(TEE);
  const distance = Math.hypot(PIN.x - TEE.x, PIN.z - TEE.z);
  const iron = powerForCarry('iron', distance, lie);
  const driver = powerForCarry('driver', distance, lie);

  assert.ok(iron > 0.82 && iron < 0.89,
    `the 167-yard iron should read near 85%, got ${(iron * 100).toFixed(0)}%`);
  assert.ok(driver < iron,
    `the longer driver should need less power (${driver.toFixed(2)} vs ${iron.toFixed(2)})`);
  assert.ok(Math.abs(estimateCarry('iron', iron, lie) - distance) < 1,
    'the ideal-power marker should agree with the HUD carry estimate');
});

test('overswinging shrinks the sweet spot and turns an open face into a slice', () => {
  const safeWindow = controlWindow({ club: 'driver', power: 0.82, lieSpread: 0 });
  const hardWindow = controlWindow({ club: 'driver', power: 1, lieSpread: 0 });
  assert.equal(safeWindow.risk, 0);
  assert.ok(hardWindow.risk > 0.95, 'full driver should be in the overswing zone');
  assert.ok(hardWindow.deadZone < safeWindow.deadZone * 0.65,
    'overswinging should visibly shrink the straight-shot band');
  assert.ok(hardWindow.strikeSpeed > safeWindow.strikeSpeed,
    'overswinging should make the return sweep quicker');

  const controlled = resolveStrike({ club: 'driver', power: 0.82, strike: 0 });
  const full = resolveStrike({ club: 'driver', power: 1, strike: 0 });
  const early = resolveStrike({ club: 'driver', power: 1, strike: 0.15 });
  assert.equal(shotShape(controlled.accuracy), 'straight');
  assert.equal(shotShape(full.accuracy), 'fade',
    'even a centered 100% driver should carry a small controllable fade');
  assert.equal(shotShape(early.accuracy), 'slice',
    'an early strike at 100% should compound into a slice');
});

test('club choice and a bad lie change how much timing help the player gets', () => {
  const driver = controlWindow({ club: 'driver', power: 0.8, lieSpread: 0 });
  const iron = controlWindow({ club: 'iron', power: 0.8, lieSpread: 0 });
  const putter = controlWindow({ club: 'putter', power: 0.8, lieSpread: 0 });
  const roughIron = controlWindow({ club: 'iron', power: 0.8, lieSpread: 5 });

  assert.ok(driver.deadZone < iron.deadZone && iron.deadZone < putter.deadZone,
    'driver, iron and putter should have increasingly forgiving sweet spots');
  assert.ok(roughIron.deadZone < iron.deadZone,
    'heavy rough should make an iron harder to square');
});

test('the card keeps what happened and what Lou wrote down', () => {
  const card = new Scorecard();
  const you = CHARACTER_IDS.PROSPECT;
  for (let i = 0; i < 11; i++) card.addStroke(you, 1);
  card.addPenalty(you, 1, 'water');
  card.finish(you, 1);

  const result = card.result(you, 1);
  assert.equal(result.strokes, 12);
  assert.equal(result.penalties, 1);
  assert.ok(result.foundWater);
  assert.equal(result.band, 'blowup');
  // "We are not putting all of that on the card."
  assert.equal(result.written, 8);
  assert.ok(result.merciful);

  assert.deepEqual(card.persist(you).holes, [
    { hole: 1, par: 3, strokes: 12, penalties: 1 },
  ]);
});

test('score names and bands agree about what a number means', () => {
  assert.equal(scoreName(1, 3), 'ACE');
  assert.equal(scoreName(2, 3), 'BIRDIE');
  assert.equal(scoreName(3, 3), 'PAR');
  assert.equal(scoreName(4, 3), 'BOGEY');
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((n) => scoreBand(n, 3)),
    ['ace', 'birdie', 'par', 'bogey', 'double', 'blowup']);
  // Every band the writing can produce has something to say about it.
  for (const band of ['ace', 'birdie', 'par', 'bogey', 'double', 'blowup']) {
    assert.ok(SEQUENCES[`hole.${band}`], `no reaction written for a ${band}`);
  }
  assert.equal(relativeLabel(0), 'E');
  assert.equal(relativeLabel(2), '+2');
  assert.equal(relativeLabel(-1), '-1');
});

test('the foursome is the campaign cast, not four new people', () => {
  assert.deepEqual(FOURSOME.map((g) => g.id), [
    CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW,
    CHARACTER_IDS.ERIC, CHARACTER_IDS.PROSPECT,
  ]);
  assert.deepEqual(FOURSOME.map((g) => g.name), ['Big Uncle Lou', 'Rippinflow', 'Eric', 'Prospect']);
  // The Prospect hits last, always.
  assert.equal(TEE_ORDER[TEE_ORDER.length - 1], CHARACTER_IDS.PROSPECT);
  // Lou takes no practice swing and does not watch it land.
  const lou = FOURSOME.find((g) => g.id === CHARACTER_IDS.LOU);
  assert.equal(lou.practiceSwings, 0);
  const rippin = FOURSOME.find((g) => g.id === CHARACTER_IDS.RIPPINFLOW);
  assert.ok(rippin.practiceSwings >= 3, 'Rippin takes too many');
  assert.equal(voiceProfileFor(CHARACTER_IDS.RIPPINFLOW), 'rippinflow');
  assert.equal(voiceProfileFor(CHARACTER_IDS.ERIC), 'eric',
    'Eric keeps the established eric audio profile, not a golf-only recast');
});

test('every line in the script can be heard, and none is addressed by position', () => {
  const noop = () => {};
  const trees = buildScripts({
    play: noop, playSequence: noop, playCallbacks: noop,
    callbackHold: () => 1, remember: noop, flag: noop,
  });
  assert.deepEqual(unreachableCues(trees), []);
  for (const [name, ids] of Object.entries(SEQUENCES)) {
    for (const id of ids) assert.ok(CUES[id], `${name} refers to a cue that does not exist: ${id}`);
  }
  // Every cue is keyed by a stable id that names it, not by where it sits.
  for (const [id, cue] of Object.entries(CUES)) {
    assert.equal(cue.id, id);
    /* golf.h<hole>.<speaker>.<what it is>. Never an index, never a position:
     * reordering an exchange must not be able to attach yesterday's recording
     * to today's line. */
    assert.ok(/^golf\.h[1-9]\d?\.[a-z]+\.[a-z0-9_]+$/.test(id), `unstable cue id: ${id}`);
  }
});

test('campaign-continuity rewrites use versioned cue ids and the seven o’clock choice', () => {
  const expected = {
    'golf.h1.lou.you_kept_listening': 'The Bing. The restaurant. The plane. The motel. The boat. You listened when it mattered.',
    'golf.h1.lou.job_and_night': 'You’ve got a big job and a big night coming.',
    'golf.h1.prospect.what_kind_of_job': 'What kind of job?',
    'golf.h1.lou.first_the_job': 'First, the job. Everybody’s on it.',
    'golf.h1.lou.after_that_the_room': 'After that, the room. Everybody’s there.',
    'golf.h1.lou.job_then_no_prospect': 'If the job goes how I think, tonight they stop calling you Prospect.',
    'golf.h1.rippin.job_big_one_today': 'So the job’s the big one today.',
    'golf.h1.rippin.eric_not_cricket': 'Eric, this isn’t cricket.',
    'golf.h2.rippin.eric_finds_it_every_time': 'Eric hits it nowhere and finds it every time.',
    'golf.h2.eric.thats_after_the_job': 'That’s after the job, yes.',
    'golf.h2.lou.one_thing_at_a_time': 'One thing at a time.',
    'golf.h3.lou.job_between_now_and_seven': 'There’s a job between now and seven. Nothing you can do about either one from a fairway. That’s why we’re out here.',
  };
  for (const [id, text] of Object.entries(expected)) assert.equal(CUES[id]?.text, text, id);

  const superseded = [
    'golf.h1.lou.you_listened', 'golf.h1.lou.big_nights_coming',
    'golf.h1.prospect.what_kind_of_nights', 'golf.h1.lou.wednesday_is_the_room',
    'golf.h1.lou.another_night_bigger', 'golf.h1.lou.stop_calling_you_prospect',
    'golf.h1.rippin.wednesday_big_night', 'golf.h1.rippin.not_cricket',
    'golf.h2.rippin.eric_hits_it_nowhere', 'golf.h2.eric.thats_the_second_night',
    'golf.h2.lou.one_night_at_a_time', 'golf.h3.lou.nothing_you_can_do_now',
  ];
  for (const id of superseded) assert.equal(CUES[id], undefined, `${id} should stay retired`);

  const trees = buildScripts({
    play() {}, playSequence() {}, playCallbacks() {}, callbackHold: () => 1,
    remember() {}, flag() {},
  });
  const direct = trees.cartRide.answer.options.find((option) => option.tone === 'Direct');
  assert.equal(direct.text, 'What happens at seven?');
  assert.equal(direct.next, 'at_seven');
  assert.ok(trees.cartRide.at_seven);
  assert.equal(trees.cartRide.wednesday, undefined);
});

test('every spoken Prospect reply is an exact stable Silver Pines voice cue', () => {
  const trees = buildScripts({
    play() {}, playSequence() {}, playCallbacks() {}, callbackHold: () => 1,
    remember() {}, flag() {},
  });
  const options = Object.values(trees).flatMap((tree) => (
    Object.values(tree).flatMap((node) => node.options || [])
  ));
  const spoken = options.filter((option) => /[\p{L}\p{N}]/u.test(option.text));
  const silent = options.filter((option) => !/[\p{L}\p{N}]/u.test(option.text));

  assert.equal(spoken.length, 14);
  assert.equal(silent.length, 2);
  for (const option of spoken) {
    assert.match(option.cue, /^golf\.h1\.prospect\.[a-z0-9_]+$/, option.text);
    assert.equal(CUES[option.cue]?.speaker, CHARACTER_IDS.PROSPECT, option.cue);
    assert.equal(CUES[option.cue]?.text, option.text, option.cue);
    assert.ok(CUES[option.cue]?.direction, `${option.cue} needs recording direction`);
  }
  for (const option of silent) assert.equal(option.cue, undefined, option.tone);
});

test('selecting every spoken Prospect reply requests its exact recorded cue', () => {
  const trees = buildScripts({
    play() {}, playSequence() {}, playCallbacks() {}, callbackHold: () => 1,
    remember() {}, flag() {},
  });
  const options = Object.values(trees).flatMap((tree) => (
    Object.values(tree).flatMap((node) => node.options || [])
  ));
  const spoken = options.filter((option) => option.cue);
  const played = [];
  const engine = {
    buffers: new Map(spoken.map((option) => [`vo.${option.cue}`, [{ duration: 2.4 }]])),
    play: (...args) => { played.push(args); return { stop() {} }; },
  };

  for (const option of spoken) {
    assert.ok(playRecordedGolfChoice(engine, option, { volume: 0.92 }), option.cue);
  }
  for (const option of options.filter((entry) => !entry.cue)) {
    assert.equal(playRecordedGolfChoice(engine, option), null, option.tone);
  }
  assert.deepEqual(played, spoken.map((option) => [
    `vo.${option.cue}`,
    { volume: 0.92 },
  ]));
});

test('a saved card resumes at the next incomplete hole', () => {
  const round = new Round({
    cues: { suppressBanter() {} }, dialogue: {}, golfers: {}, missions: {}, hooks: {},
  });
  const next = round.restoreProgress({
    holes: [
      { hole: 1, par: 3, strokes: 4, penalties: 1 },
      { hole: 2, par: 5, strokes: 6, penalties: 0 },
    ],
    heardInvitation: true,
    rodeWithLou: true,
  });
  assert.equal(next, 3);
  assert.equal(round.hasBag, true);
  assert.equal(round.heardInvitation, true);
  assert.equal(round.rodeWithLou, true);
  assert.deepEqual(round.roundSummary().holes, [
    { hole: 1, par: 3, strokes: 4, penalties: 1 },
    { hole: 2, par: 5, strokes: 6, penalties: 0 },
  ]);
  assert.equal(round.card.hole(CHARACTER_IDS.ERIC, 2).strokes, 5);
  assert.equal(round.card.hole(CHARACTER_IDS.RIPPINFLOW, 2).strokes,
    HOLE2.npcPlan.rippinflow.finish);
});

test('every hole has something of its own to say', () => {
  /* The per-hole fallback means a hole with no lines of its own silently
   * borrows the first hole's, which is the correct behaviour and also exactly
   * how a hole ships with nobody noticing it was never written. */
  for (const hole of builtHoles()) {
    const mine = Object.keys(CUES).filter((id) => id.startsWith(`golf.h${hole}.`));
    assert.ok(mine.length > 20, `hole ${hole} only has ${mine.length} lines of its own`);
    const owners = new Set(mine.map((id) => CUES[id].speaker));
    for (const who of [CHARACTER_IDS.LOU, CHARACTER_IDS.RIPPINFLOW, CHARACTER_IDS.ERIC]) {
      assert.ok(owners.has(who), `hole ${hole}: ${who} says nothing`);
    }
    // And the round has to actually reach them.
    for (const beat of ['tee.arrival', 'end.walk_off']) {
      assert.ok(SEQUENCES[`h${hole}.${beat}`] || hole === 1,
        `hole ${hole} has no ${beat} of its own`);
    }
  }
});

test('the line the scene is built around is uninterruptible and holds its silence', () => {
  const cue = CUES['golf.h1.lou.invited_you'];
  assert.equal(cue.text, 'We can find a fourth. We invited you.');
  assert.equal(cue.speaker, CHARACTER_IDS.LOU);
  assert.equal(cue.priority, 'story');
  assert.equal(cue.once, true);
  assert.equal(cue.interruptible, false);
  assert.ok(cue.hold >= 2.5, 'the pause after it is part of the writing');
  assert.ok(cue.direction.length > 0, 'somebody has to record this');
});

test('past-mission callbacks read real save state and degrade to nothing', () => {
  assert.deepEqual(pastMissionBanter({}), []);
  assert.deepEqual(pastMissionBanter({ bada_bing_one: {} }), []);

  // `ending: 'warned'` is the man who told Lou about the grey sedan.
  const sedan = pastMissionBanter({ bada_bing_one: { ending: 'warned' } });
  assert.ok(sedan.some((e) => e.lines.includes('golf.h1.lou.noticed_the_car')));

  // Someone who did nothing about it does not get the compliment.
  const ignored = pastMissionBanter({ bada_bing_one: { ending: 'followed' } });
  assert.ok(!ignored.some((e) => e.lines.includes('golf.h1.lou.noticed_the_car')));

  const clean = pastMissionBanter({
    airstrip_smuggling: { status: 'complete', detected: false, landingQuality: 'clean' },
  });
  assert.ok(clean.some((e) => e.lines.includes('golf.h1.lou.wings_still_attached')));

  const rough = pastMissionBanter({
    airstrip_smuggling: { status: 'complete', detected: true, landingQuality: 'rough' },
  });
  assert.ok(rough.some((e) => e.lines.includes('golf.h1.lou.most_of_the_plane')));

  // Every callback names a bucket the round actually plays.
  for (const entry of pastMissionBanter({
    bada_bing_one: { ending: 'warned', handsPlayed: 9, jackpot: true },
    squatchfather: { status: 'complete', weaponStaged: true, weaponDropped: true },
    airstrip_smuggling: { status: 'complete', detected: false, landingQuality: 'clean' },
    silver_room: { status: 'complete', seeingHerAgain: true },
  })) {
    assert.ok(['tee', 'cart', 'green'].includes(entry.at), `unknown bucket ${entry.at}`);
    for (const id of entry.lines) assert.ok(CUES[id], `callback names a missing cue: ${id}`);
  }
});


/* ------------------------------------------------------------------ */
/* Every hole the course has built                                     */
/* ------------------------------------------------------------------ */

/** Tee to green along the mown centreline — a dogleg's played length. */
function playedLength() {
  const path = HOLE.corridor.path;
  let len = Math.hypot(path[0].x - HOLE.tee.x, path[0].z - HOLE.tee.z);
  for (let i = 0; i < path.length - 1; i++) {
    len += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
  }
  return len + Math.hypot(HOLE.green.x - path.at(-1).x, HOLE.green.z - path.at(-1).z);
}

test('the course has built the round the card describes', () => {
  const built = builtHoles();
  assert.deepEqual(built, [1, 2, 3]);
  try {
    for (const number of built) {
      setActiveHole(number);
      const meta = getHole(number);
      assert.equal(HOLE.par, meta.par, `hole ${number} par`);
      assert.equal(HOLE.yards, meta.yards, `hole ${number} yardage`);
    }
  } finally {
    setActiveHole(1);
  }
});

test('every marker on the course is telling the truth', () => {
  try {
    for (const number of builtHoles()) {
      setActiveHole(number);
      const played = toYards(playedLength());
      assert.ok(Math.abs(played - HOLE.yards) <= 4,
        `hole ${number} plays ${played.toFixed(0)} yds and the marker says ${HOLE.yards}`);
    }
  } finally {
    setActiveHole(1);
  }
});

test('every hole is playable from its own tee to its own cup', () => {
  /* The cheap structural mistakes, on every hole at once: a tee that is not
   * mown, a pin off the green, a bunker swallowed by the fringe collar so it
   * plays as grass, a cart park in the trees, or a drop zone in a hazard. */
  try {
    for (const number of builtHoles()) {
      setActiveHole(number);
      const where = (p) => surfaceAt(p.x, p.z);
      assert.equal(where(HOLE.teeMarks.ball), SURFACE.TEE, `hole ${number} tee`);
      assert.equal(where(HOLE.green), SURFACE.GREEN, `hole ${number} green`);
      assert.equal(where(HOLE.pin), SURFACE.GREEN, `hole ${number} pin`);

      for (const [i, b] of bunkers().entries()) {
        assert.equal(where(b), SURFACE.BUNKER,
          `hole ${number} bunker ${i} plays as ${where(b)}`);
      }

      const drop = where(HOLE.dropZone);
      assert.ok(drop !== SURFACE.WATER && drop !== SURFACE.BUNKER,
        `hole ${number} drop zone is ${drop}`);
      assert.ok(!isOutOfBounds(HOLE.dropZone.x, HOLE.dropZone.z));
      assert.ok(!isOutOfBounds(HOLE.cartPark.x, HOLE.cartPark.z));

      // The whole hole has to fit inside the ground that was built for it.
      assert.ok(HOLE.green.x > HOLE.terrain.minX && HOLE.green.x < HOLE.terrain.maxX);
      assert.ok(HOLE.green.z > HOLE.terrain.minZ && HOLE.green.z < HOLE.terrain.maxZ);
    }
  } finally {
    setActiveHole(1);
  }
});

test('every hole can be seen from its own tee', () => {
  /* Hole 1 needed the ground flattening down the middle to be readable. The
   * other two are longer, and the same rule applies to whatever a player is
   * being asked to aim at from the tee — the first turn of a dogleg counts. */
  try {
    for (const number of builtHoles()) {
      setActiveHole(number);
      const tee = HOLE.teeMarks.ball;
      const aim = HOLE.corridor.path[Math.min(1, HOLE.corridor.path.length - 1)];
      const eye = heightAt(tee.x, tee.z) + 1.66;
      const target = heightAt(aim.x, aim.z) + 1;
      for (let t = 0.1; t < 1; t += 0.1) {
        const x = tee.x + (aim.x - tee.x) * t;
        const z = tee.z + (aim.z - tee.z) * t;
        assert.ok(heightAt(x, z) < eye + (target - eye) * t,
          `hole ${number} is blind at ${(t * 100).toFixed(0)}% of the first shot`);
      }
    }
  } finally {
    setActiveHole(1);
  }
});

test('the authored NPC scores are the ones the writing depends on', () => {
  try {
    for (const number of builtHoles()) {
      setActiveHole(number);
      const plan = HOLE.npcPlan;
      assert.ok(plan, `hole ${number} has no authored scores`);
      // Eric and Lou play to par; Rippin does not, on any hole.
      assert.equal(plan.eric.finish, HOLE.par, `hole ${number}: Eric makes par`);
      assert.equal(plan.lou.finish, HOLE.par, `hole ${number}: Lou makes par`);
      assert.ok(plan.rippinflow.finish > HOLE.par, `hole ${number}: Rippin does not`);
    }
  } finally {
    setActiveHole(1);
  }
});
