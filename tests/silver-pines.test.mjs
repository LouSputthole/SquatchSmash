import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOLES, COURSE_PAR, getHole, nextHole, scoreName, scoreBand, relativeLabel,
  SURFACE, SURFACE_PROPS, surfaceProps, FOURSOME, TEE_ORDER, toYards, toFeet,
} from '../src/golf/course.js';
import {
  heightAt, surfaceAt, slopeAt, dropPointFor, recoveryPointFor, isOutOfBounds,
} from '../src/golf/field.js';
import { simulate, solveShot, Ball } from '../src/golf/ball.js';
import { launchFor, CLUB_IDS } from '../src/golf/clubs.js';
import { Swing, SWING_PHASE, DEAD_ZONE } from '../src/golf/swing.js';
import { Scorecard } from '../src/golf/scorecard.js';
import {
  CUES, SEQUENCES, buildScripts, unreachableCues, pastMissionBanter,
} from '../src/golf/script.js';
import { TEE_MARKS, GREEN, PIN, POND, BUNKER, NPC_TEE_SHOTS } from '../src/golf/hole1.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';

/* These are the facts about the hole that the browser verifier cannot state
 * cheaply and that a careless edit to the layout would silently change. The
 * playthrough lives in tools/verify-golf.mjs; this is the geometry and the
 * arithmetic under it. */

const TEE = { x: TEE_MARKS.ball.x, z: TEE_MARKS.ball.z };
const lieAt = (p) => surfaceProps(surfaceAt(p.x, p.z));

test('the round is a par 3, a par 5 and a par 4, in that order', () => {
  assert.deepEqual(HOLES.map((h) => h.par), [3, 5, 4]);
  assert.equal(COURSE_PAR, 12);
  assert.equal(getHole(1).name, 'The Invitation');
  assert.equal(nextHole(1).name, 'The Long Walk');
  assert.equal(nextHole(3), null);
  // Only Hole 1 is built, and the data says so rather than pretending.
  assert.deepEqual(HOLES.filter((h) => h.playable).map((h) => h.number), [1]);
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

  const eric = shot(CHARACTER_IDS.ERICAN);
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
    CHARACTER_IDS.ERICAN, CHARACTER_IDS.PROSPECT,
  ]);
  assert.deepEqual(FOURSOME.map((g) => g.name), ['Big Uncle Lou', 'Rippin', 'Eric', 'Prospect']);
  // The Prospect hits last, always.
  assert.equal(TEE_ORDER[TEE_ORDER.length - 1], CHARACTER_IDS.PROSPECT);
  // Lou takes no practice swing and does not watch it land.
  const lou = FOURSOME.find((g) => g.id === CHARACTER_IDS.LOU);
  assert.equal(lou.practiceSwings, 0);
  const rippin = FOURSOME.find((g) => g.id === CHARACTER_IDS.RIPPINFLOW);
  assert.ok(rippin.practiceSwings >= 3, 'Rippin takes too many');
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
    assert.ok(/^golf\.h1\.[a-z]+\.[a-z0-9_]+$/.test(id), `unstable cue id: ${id}`);
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
