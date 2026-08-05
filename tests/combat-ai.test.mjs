/**
 * The combat AI: perception that degrades, squads that share slowly, cover
 * that gets claimed and chewed, morale that breaks, and a brain that walks
 * the states the owner listed — without ever knowing the player's position
 * by magic.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Perception } from '../src/core/combat/perception.js';
import { SquadBlackboard } from '../src/core/combat/squad.js';
import { CoverField } from '../src/core/combat/cover.js';
import { MoraleModel } from '../src/core/combat/morale.js';
import { CombatBrain, BRAIN_STATES as S } from '../src/core/combat/brain.js';
import { SuppressionModel } from '../src/core/combat/suppression.js';
import { archetype } from '../src/core/combat/archetypes.js';
import { resolveDifficulty } from '../src/core/combat/config.js';

const flat = () => 0.5;

function brainRig({ arch = 'rifleman', canSee = () => true, cover = null, squad = null, difficulty = null } = {}) {
  const perception = new Perception({ reaction: 0.3, canSee });
  const morale = new MoraleModel({ start: 0.8 });
  const suppression = new SuppressionModel();
  const brain = new CombatBrain({
    id: 't', archetype: archetype(arch), perception, morale, suppression,
    squad, cover, retreatPoints: [{ x: 0, z: -30 }], difficulty, rng: flat,
  });
  return { brain, perception, morale, suppression };
}

function tick(rig, me, player, seconds, { stuck = false } = {}) {
  const step = 1 / 15;
  for (let t = 0; t < seconds; t += step) {
    rig.perception.update(step, me, player);
    rig.brain.update(step, { me, player, stuck, playerDead: false });
  }
}

/* ------------------------------------------------------------------ */
/* Perception                                                           */
/* ------------------------------------------------------------------ */

test('an NPC facing away sees nothing; facing the player it resolves in time, not instantly', () => {
  const p = new Perception({ reaction: 0.4, canSee: () => true });
  const me = { x: 0, z: 0, heading: Math.PI }; // facing +... away from +z
  for (let i = 0; i < 30; i++) p.update(1 / 30, me, { x: 0, z: 6, moving: true });
  assert.equal(p.seeing, false);
  assert.equal(p.confidence, 0);

  const facing = { x: 0, z: 0, heading: 0 };
  p.update(1 / 30, facing, { x: 0, z: 6, moving: true });
  assert.equal(p.seeing, true);
  assert.equal(p.reacted, false, 'one frame of sight is not a reaction');
  for (let i = 0; i < 20; i++) p.update(1 / 30, facing, { x: 0, z: 6, moving: true });
  assert.equal(p.reacted, true);
  assert.ok(p.confidence > 0.4);
});

test('losing sight decays knowledge; the last known point ages and eventually dies', () => {
  const p = new Perception({ canSee: () => true });
  const me = { x: 0, z: 0, heading: 0 };
  for (let i = 0; i < 60; i++) p.update(1 / 30, me, { x: 0, z: 8, moving: true });
  const peak = p.confidence;
  assert.ok(p.lastKnown);
  // Sight breaks (a wall).
  p.canSee = () => false;
  for (let i = 0; i < 90; i++) p.update(1 / 30, me, { x: 0, z: 8, moving: true });
  assert.ok(p.confidence < peak, 'confidence must decay out of sight');
  assert.ok(p.lastKnown.age > 2.5);
  for (let i = 0; i < 30 * 30; i++) p.update(1 / 30, me, { x: 0, z: 8, moving: true });
  assert.equal(p.lastKnown, null, 'stale knowledge must die');
});

test('hearing sets an investigation point within radius and not beyond it', () => {
  const p = new Perception({ canSee: () => false });
  const me = { x: 0, z: 0 };
  assert.equal(p.hear({ x: 100, z: 0, radius: 50, priority: 0.5 }, me), false);
  assert.equal(p.hear({ x: 20, z: 0, radius: 50, priority: 0.5 }, me), true);
  assert.ok(p.investigate);
  assert.equal(p.investigate.x, 20);
});

/* ------------------------------------------------------------------ */
/* Squad                                                                */
/* ------------------------------------------------------------------ */

test('a sighting reaches the squad after the share delay, and only within range', () => {
  const squad = new SquadBlackboard({ shareDelay: 1.0, shareRange: 30 });
  squad.join('a');
  squad.join('b');
  squad.updateMember('a', 0, 0);
  squad.updateMember('b', 10, 0);
  squad.report('a', { x: 5, z: 5 });
  squad.update(0.4);
  assert.equal(squad.lastKnown, null, 'intel travelled faster than the delay');
  squad.update(0.7);
  assert.ok(squad.lastKnown);
  assert.ok(squad.intelFor('b'), 'a nearby member receives the callout');
  squad.updateMember('b', 500, 0);
  assert.equal(squad.intelFor('b'), null, 'a member across the map does not');
});

test('flank and push tokens are budgeted; death releases everything held', () => {
  const squad = new SquadBlackboard({ flankBudget: 1, pushBudget: 1 });
  squad.join('a');
  squad.join('b');
  assert.equal(squad.requestFlank('a'), true);
  assert.equal(squad.requestFlank('b'), false, 'two flankers on a budget of one');
  assert.equal(squad.claimCover('crate', 'a'), true);
  assert.equal(squad.claimCover('crate', 'b'), false, 'two men on one crate');
  squad.reportDown('a');
  assert.equal(squad.requestFlank('b'), true, 'the token died with him');
  assert.equal(squad.claimCover('crate', 'b'), true);
  assert.equal(squad.downed, 1);
});

test('the squad hears the player reloading, then forgets in seconds', () => {
  const squad = new SquadBlackboard({});
  squad.reportPlayerReloading();
  assert.equal(squad.playerReloading, true);
  squad.update(2.5);
  assert.equal(squad.playerReloading, false);
});

/* ------------------------------------------------------------------ */
/* Cover                                                                */
/* ------------------------------------------------------------------ */

test('cover queries prefer points that face the threat, and refuse points beside it', () => {
  const field = new CoverField({
    points: [
      // Good: the crate is between the occupant and a threat to the north.
      { id: 'good', x: 0, z: 10, facing: { x: 0, z: 1 }, height: 'low' },
      // Bad: same spot, facing away — the occupant would be exposed.
      { id: 'bad', x: 3, z: 10, facing: { x: 0, z: -1 }, height: 'low' },
    ],
  });
  const pick = field.query({ from: { x: 0, z: 14 }, threat: { x: 0, z: -10 } });
  assert.equal(pick.id, 'good');
});

test('claims stop two NPCs sharing a crate; compromise pushes them off it', () => {
  const squad = new SquadBlackboard({});
  const field = new CoverField({
    points: [
      { id: 'c1', x: 0, z: 10, facing: { x: 0, z: 1 }, height: 'low' },
      { id: 'c2', x: 6, z: 10, facing: { x: 0, z: 1 }, height: 'high' },
    ],
  });
  const first = field.query({ from: { x: 0, z: 13 }, threat: { x: 0, z: -10 }, claimBy: 'a', squad });
  const second = field.query({ from: { x: 0, z: 13 }, threat: { x: 0, z: -10 }, claimBy: 'b', squad });
  assert.notEqual(first.id, second.id, 'both men picked the same cover');

  for (let i = 0; i < 6; i++) field.noteImpactNear(0, 10);
  assert.ok(field.points[0].compromised > 0.6, 'cover under fire must register it');
});

test('derived cover comes off chest-high boxes only, facing outward', () => {
  const field = new CoverField({});
  const added = field.deriveFromBoxes([
    { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 1.0, z: 1 } }, // chest-high crate
    { min: { x: 5, y: 0, z: 5 }, max: { x: 6, y: 3.4, z: 6 } }, // a wall — too tall
    { min: { x: 9, y: 0, z: 9 }, max: { x: 9.2, y: 0.2, z: 9.2 } }, // a pebble
  ]);
  assert.equal(added, 4, 'one box, four faces');
  assert.ok(field.points.every((p) => p.height === 'low'));
});

/* ------------------------------------------------------------------ */
/* Morale                                                               */
/* ------------------------------------------------------------------ */

test('morale sinks on losses, breaks, may surrender, and fight-to-death never does', () => {
  const m = new MoraleModel({ start: 0.6, surrenderBelow: 0.5 });
  m.note('allyDown');
  m.note('leaderDown');
  m.note('flanked');
  assert.equal(m.band, 'broken');
  assert.ok(m.accuracyPenalty > 1.5);
  assert.equal(m.considerSurrender(() => 0.9), true);
  assert.equal(m.surrendered, true);

  const loyal = new MoraleModel({ start: 0.6, fightToDeath: true });
  for (let i = 0; i < 10; i++) loyal.note('allyDown');
  assert.equal(loyal.band, 'steady', 'fight-to-death never leaves steady behaviour');
  assert.equal(loyal.considerSurrender(() => 0), false);
});

/* ------------------------------------------------------------------ */
/* The brain                                                            */
/* ------------------------------------------------------------------ */

test('the classic arc: unaware -> alerted -> seeking cover -> in cover, peeking', () => {
  const cover = new CoverField({
    points: [{ id: 'c', x: 1, z: 1, facing: { x: 0, z: 1 }, height: 'low' }],
  });
  const rig = brainRig({ cover });
  const me = { x: 0, z: 0, heading: 0 };
  tick(rig, me, { x: 0, z: 6, moving: true }, 2);
  assert.ok(rig.brain.history.includes(S.ALERTED), rig.brain.history.join('>'));
  assert.ok(
    rig.brain.is(S.SEEKING_COVER, S.IN_COVER, S.FIRING),
    `expected a fighting state, got ${rig.brain.name}`,
  );
  // Stand him on the cover point: whatever phase he is in, within a few
  // seconds the cycle brings him back to cover and he settles into the peek.
  const atCover = { x: 1, z: 1, heading: 0 };
  tick(rig, atCover, { x: 0, z: 6, moving: true }, 5);
  assert.equal(rig.brain.name, S.IN_COVER, rig.brain.history.join('>'));
});

test('losing sight sends him to the last known point, then searching — never psychic fire', () => {
  let visible = true;
  const rig = brainRig({ canSee: () => visible });
  const me = { x: 0, z: 0, heading: 0 };
  tick(rig, me, { x: 0, z: 8, moving: true }, 1.5);
  visible = false;
  tick(rig, me, { x: 0, z: 8, moving: true }, 10);
  const intent = rig.brain.intent;
  assert.equal(rig.perception.seeing, false);
  if (intent.fire) {
    assert.equal(intent.suppressing, true,
      'out of sight, only suppression at last-known is allowed — never aimed fire');
  }
  assert.ok(
    rig.brain.is(S.SEARCHING, S.FIRING, S.IN_COVER, S.SEEKING_COVER, S.SUSPICIOUS),
    rig.brain.name,
  );
});

test('heavy suppression pins him; morale broken by losses sends him to the fallback', () => {
  const rig = brainRig();
  const me = { x: 0, z: 0, heading: 0 };
  tick(rig, me, { x: 0, z: 8, moving: true }, 1.5);
  for (let i = 0; i < 20; i++) rig.suppression.noteNearMiss(0.3, 1);
  tick(rig, me, { x: 0, z: 8, moving: true }, 0.5);
  assert.equal(rig.brain.name, S.SUPPRESSED);

  const broken = brainRig();
  tick(broken, me, { x: 0, z: 8, moving: true }, 1.5);
  broken.morale.value = 0.1;
  tick(broken, me, { x: 0, z: 8, moving: true }, 1);
  assert.equal(broken.brain.name, S.RETREATING);
  const intent = broken.brain.intent;
  assert.ok(intent.move, 'a retreating man moves');
  assert.ok(intent.move.z < 0, 'and he moves toward the fallback, away from the player');
});

test('a flanker takes the token and swings wide instead of walking the player\'s lane', () => {
  const squad = new SquadBlackboard({ flankBudget: 1 });
  squad.join('t');
  const rig = brainRig({ arch: 'flanker', squad });
  const me = { x: 0, z: 0, heading: 0 };
  tick(rig, me, { x: 0, z: 12, moving: true }, 2);
  assert.equal(rig.brain.name, S.FLANKING, rig.brain.history.join('>'));
  const intent = rig.brain.intent;
  assert.ok(intent.move);
  // The flank point is off the direct line to the player.
  const offAxis = Math.abs(intent.move.x);
  assert.ok(offAxis > 3, `flank target x=${intent.move.x} is straight down the lane`);
});

test('difficulty scales reactions without touching the states themselves', () => {
  const easy = brainRig({ difficulty: resolveDifficulty('easy') });
  const hard = brainRig({ difficulty: resolveDifficulty('hard') });
  const me = { x: 0, z: 0, heading: 0 };
  // After the same short exposure the hard brain has committed; easy has not.
  tick(hard, me, { x: 0, z: 6, moving: true }, 0.8);
  tick(easy, me, { x: 0, z: 6, moving: true }, 0.8);
  const hardMoved = hard.brain.history.length;
  const easyMoved = easy.brain.history.length;
  assert.ok(hardMoved >= easyMoved, 'hard reacts no slower than easy');
});

test('the dead brain stays dead and reports its history for the verifier', () => {
  const rig = brainRig();
  rig.brain.die();
  const before = rig.brain.history.length;
  rig.brain.update(1, { me: { x: 0, z: 0 }, player: { x: 0, z: 5 }, stuck: false });
  assert.equal(rig.brain.name, S.DEAD);
  assert.equal(rig.brain.history.length, before);
  const report = rig.brain.report();
  assert.equal(report.state, S.DEAD);
  assert.ok(Array.isArray(report.history));
});
