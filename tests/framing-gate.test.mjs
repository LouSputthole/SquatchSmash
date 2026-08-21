/**
 * THE CAMERA HAS TO BE POINTED AT THE THING THE BEAT IS ABOUT.
 *
 * Initiation Night's fifth act -- the blade, the hand, the cut, the saint
 * card, both oath lines and the burning -- played out off screen for as long
 * as the scene existed, because the ritual shot aimed at a fixed patch of
 * tabletop 2.4 m in front of where the player actually stands, which put him
 * BEHIND the camera. The only way to find that was to play the scene, and the
 * only person playing it was the person who had just written it.
 *
 * So these are the fixtures that would have found it: a shot, a speaker, a
 * room, and the arithmetic in between. Pure, because the gate is pure --
 * fixtures in, findings out. The runner that feeds it real scene builds is
 * tools/verify-framing.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIM_MISS_TOLERANCE_M,
  DEFAULT_FOV_DEG,
  OCCLUSION_SKIN_M,
  cameraBasis,
  framePlacement,
  framingFindings,
  rayBoxDistance,
} from '../tools/framing-gate.mjs';

/** A body where `collectActors` would have put one: head at the eye height. */
const actor = (id, [x, y, z], { role = 'principal', eyeHeight = 2.3 } = {}) => ({
  id,
  role,
  posture: 'stand',
  position: [x, y, z],
  eye: [x, y + eyeHeight, z],
  hip: [x, y + 1.16, z],
});

const box = (min, max, name = null) => ({ name, min, max });

/** A shot: where it stands, where it looks, on the house lens. */
const shot = (position, lookAt, extra = {}) => ({
  position, lookAt, fovDeg: DEFAULT_FOV_DEG, aspect: 16 / 9, near: 0.05, far: 220, ...extra,
});

const beat = (id, camera, rest = {}) => ({ id, camera, ...rest });

const kinds = (result) => result.findings.map(({ kind }) => kind).sort();

/* ------------------------------------------------------------------ */
/* The frustum, on its own                                            */
/* ------------------------------------------------------------------ */

test('a camera looking straight down still has a basis', () => {
  // The graveyard hangs a camera over a grave. Forward parallel to world up
  // collapses the cross product, and a NaN basis reports every head in the
  // shot as off camera -- silently, which is the failure mode being ended.
  const basis = cameraBasis([0, 6, 0], [0, 0, 0]);
  assert.ok(basis);
  for (const axis of [basis.forward, basis.right, basis.up]) {
    for (const n of axis) assert.ok(Number.isFinite(n));
  }
  assert.ok(Math.abs(Math.hypot(...basis.right) - 1) < 1e-9);
});

test('a shot that looks at its own position is degenerate, not NaN', () => {
  const placement = framePlacement(shot([1, 2, 3], [1, 2, 3]), [1, 2, 6]);
  assert.equal(placement.inside, false);
  assert.equal(placement.reason, 'degenerate');
});

test('a head behind the camera is behind it, not merely out of frame', () => {
  // The Initiation bug in one line: the camera at the table's west end looking
  // east, the player 2.4 m the other way.
  const placement = framePlacement(shot([0, 1.7, 0], [0, 1.7, 4]), [0, 1.7, -2.4]);
  assert.equal(placement.inside, false);
  assert.equal(placement.reason, 'behind');
  assert.ok(placement.depthM < 0);
});

test('a head past the far plane is out, and one inside the near plane is out', () => {
  assert.equal(framePlacement(shot([0, 0, 0], [0, 0, 1], { far: 20 }), [0, 0, 40]).reason, 'far');
  assert.equal(framePlacement(shot([0, 0, 0], [0, 0, 1], { near: 0.5 }), [0, 0, 0.2]).reason, 'near');
});

test('a head exactly on the frame edge is in frame', () => {
  // Framing to the edge of the lens is a decision. `tan(45°)` coming back as
  // 0.9999999999999999 is not, and a strict comparison would turn the second
  // into a finding about the first.
  const lens = shot([0, 0, 0], [0, 0, 10], { fovDeg: 90, aspect: 1 });
  const limit = 10 * Math.tan((90 * Math.PI) / 360);
  assert.equal(framePlacement(lens, [0, limit, 10]).inside, true);
  assert.equal(framePlacement(lens, [-limit, 0, 10]).inside, true);
  // A centimetre past it is out, and says which way.
  assert.equal(framePlacement(lens, [0, limit + 0.01, 10]).reason, 'above');
  assert.equal(framePlacement(lens, [limit + 0.01, 0, 10]).reason, 'right');
});

test('the frame is wider than it is tall, because the screen is', () => {
  const lens = shot([0, 0, 0], [0, 0, 10], { fovDeg: 60, aspect: 16 / 9 });
  const limitY = 10 * Math.tan((60 * Math.PI) / 360);
  assert.equal(framePlacement(lens, [limitY * 1.5, 0, 10]).inside, true);
  assert.equal(framePlacement(lens, [0, limitY * 1.5, 10]).reason, 'above');
});

/* ------------------------------------------------------------------ */
/* The findings                                                        */
/* ------------------------------------------------------------------ */

test('a clean beat is silent', () => {
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('lou-oath', shot([0, 1.75, -2], [0, 1.75, 0]), { speaker: 'lou' })],
    actors: [actor('lou', [0, 0, 0], { eyeHeight: 1.75 })],
    boxes: [box([-6, 0, -6], [6, 0.05, 6], 'floor')],
  });
  assert.deepEqual(result.findings, []);
  assert.equal(result.id, 'fixture');
});

test('a beat with no camera and no speaker says nothing rather than throwing', () => {
  assert.deepEqual(framingFindings({ id: 'fixture', beats: [{ id: 'empty' }] }).findings, []);
  assert.deepEqual(framingFindings().findings, []);
});

test('the ritual shot: the speaker is behind the camera and the aim is on the table', () => {
  // The real numbers. The card socket sits on the tabletop; the player stands
  // at the ceremony centre, 2.4 m short of it, and the shot looked at the
  // socket. Both findings fire, and between them they describe the bug.
  const result = framingFindings({
    id: 'initiation:cabin',
    beats: [beat('ritual', shot([0, 1.2, 0.6], [0, 1.05, 1.2]), {
      phase: 'ritual',
      speaker: 'player',
      subject: { id: 'player-hand', point: [0, 1.25, -2.3] },
    })],
    actors: [actor('player', [0, 0, -2.4], { role: 'player', eyeHeight: 1.75 })],
  });
  assert.deepEqual(kinds(result), ['CAMERA_AIM_MISS', 'SPEAKER_OFF_CAMERA']);

  const aim = result.findings.find(({ kind }) => kind === 'CAMERA_AIM_MISS');
  assert.equal(aim.beat, 'ritual');
  assert.equal(aim.subject, 'player-hand');
  assert.ok(aim.missM > AIM_MISS_TOLERANCE_M);

  const off = result.findings.find(({ kind }) => kind === 'SPEAKER_OFF_CAMERA');
  assert.equal(off.reason, 'behind');
  assert.equal(off.speaker, 'player');
});

test('a shot aimed within tolerance of its subject is not a miss', () => {
  // The fixed shot: the offsets `ritual()` now uses, relative to the hand.
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('ritual', shot([-0.62, 1.53, -0.54], [0, 1.25, 0]), {
      speaker: 'player',
      subject: { id: 'player-hand', point: [0.2, 1.3, 0.1] },
    })],
    actors: [actor('player', [0, 0, 0], { eyeHeight: 1.25 })],
  });
  assert.deepEqual(result.findings, []);
});

test('a wall between the camera and the speaker is a finding', () => {
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('office', shot([0, 1.7, -6], [0, 1.7, 0]), { speaker: 'boss' })],
    actors: [actor('boss', [0, 0, 0], { eyeHeight: 1.7 })],
    boxes: [box([-4, 0, -3.2], [4, 3, -2.8], 'office-wall')],
  });
  assert.deepEqual(kinds(result), ['SPEAKER_OCCLUDED']);
  const [hit] = result.findings;
  assert.equal(hit.solid, 'office-wall');
  assert.ok(hit.blockedAtM < hit.speakerAtM);
});

test('a doorway the shot passes through is not a wall', () => {
  // Two jambs with a gap between them, and the sightline goes through the gap.
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('office', shot([0, 1.7, -6], [0, 1.7, 0]), { speaker: 'boss' })],
    actors: [actor('boss', [0, 0, 0], { eyeHeight: 1.7 })],
    boxes: [
      box([-4, 0, -3.2], [-0.6, 3, -2.8], 'jamb-west'),
      box([0.6, 0, -3.2], [4, 3, -2.8], 'jamb-east'),
    ],
  });
  assert.deepEqual(result.findings, []);
});

test('the wall a speaker has his back to is not in front of his face', () => {
  // Without the skin, the box ending a few centimetres behind a head reads as
  // occlusion because of where the eye height happened to land.
  const backWall = box([-4, 0, 0.05], [4, 3, 0.4], 'back-wall');
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('office', shot([0, 1.7, -6], [0, 1.7, 0]), { speaker: 'boss' })],
    actors: [actor('boss', [0, 0, 0], { eyeHeight: 1.7 })],
    boxes: [backWall],
  });
  assert.deepEqual(result.findings, []);
  // And the skin really is the reason: the same wall a metre nearer blocks.
  assert.ok(OCCLUSION_SKIN_M > 0);
  const nearer = framingFindings({
    id: 'fixture',
    beats: [beat('office', shot([0, 1.7, -6], [0, 1.7, 0]), { speaker: 'boss' })],
    actors: [actor('boss', [0, 0, 0], { eyeHeight: 1.7 })],
    boxes: [box([-4, 0, -1.4], [4, 3, -1.0], 'nearer-wall')],
  });
  assert.deepEqual(kinds(nearer), ['SPEAKER_OCCLUDED']);
});

test('a camera inside a solid is reported once, and does not also report a wall', () => {
  // One fault, one note. A camera buried in the masonry is trivially occluded
  // by the masonry it is buried in, and saying so twice is noise.
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('office', shot([0, 1.7, -6], [0, 1.7, 0]), { speaker: 'boss' })],
    actors: [actor('boss', [0, 0, 0], { eyeHeight: 1.7 })],
    boxes: [box([-4, 0, -8], [4, 3, -5], 'chimney-breast')],
  });
  assert.deepEqual(kinds(result), ['CAMERA_INSIDE_SOLID']);
  assert.equal(result.findings[0].solid, 'chimney-breast');
  assert.deepEqual(result.findings[0].camera, [0, 1.7, -6]);
});

test('a two-hander held on the listener loses the speaker off the side', () => {
  // The shot is correctly aimed at the man it names -- so no aim miss -- and
  // the man TALKING is nine metres off to one side of the frame. That is the
  // ritual bug's quieter cousin, and it is why the speaker and the subject of
  // a beat are two fields rather than one.
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('office', shot([0, 1.7, -6], [0, 1.7, 0]), {
      speaker: 'boss',
      subject: 'mark',
    })],
    actors: [
      actor('mark', [0, 0, 0], { eyeHeight: 1.7 }),
      actor('boss', [9, 0, 0], { eyeHeight: 1.7 }),
    ],
    boxes: [box([-4, 0, -3.2], [4, 3, -2.8], 'office-wall')],
  });
  // And nothing about the wall the speaker is behind: a head that is not in
  // the rectangle is not then chased through the masonry.
  assert.deepEqual(kinds(result), ['SPEAKER_OFF_CAMERA']);
  assert.equal(result.findings[0].reason, 'right');
  assert.equal(result.findings[0].speaker, 'boss');
});

/* ------------------------------------------------------------------ */
/* Aim against look: the distinction that cost a verifier run          */
/* ------------------------------------------------------------------ */

test('a smoothed look point mid-flight is travel, not a miss', () => {
  // The camera flies rather than cuts -- about 3.2 per second -- so a debug
  // skip from the clearing to the cabin starts the smoothed point seventy
  // metres out. The first draft of this measurement read 55 m and called it a
  // bug. A beat that has not declared itself settled is not asked.
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('ritual', shot([-0.62, 1.53, -0.54], [0, 1.25, 0]), {
      speaker: 'player',
      look: [0, 2.4, -55],
    })],
    actors: [actor('player', [0, 0, 0], { eyeHeight: 1.25 })],
  });
  assert.deepEqual(result.findings, []);
});

test('once the cut has landed, the look point is held to the subject', () => {
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('ritual', shot([-0.62, 1.53, -0.54], [0, 1.25, 0]), {
      speaker: 'player',
      look: [0, 2.4, -55],
      settled: true,
    })],
    actors: [actor('player', [0, 0, 0], { eyeHeight: 1.25 })],
  });
  assert.deepEqual(kinds(result), ['CAMERA_LOOK_MISS']);
  assert.ok(result.findings[0].missM > 50);
});

test('a settled shot whose aim is wrong reports the aim as well as the look', () => {
  // Both, because they are two facts: the shot intends the wrong place AND
  // the player is currently seeing the wrong place.
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('ritual', shot([0, 1.2, 0.6], [0, 1.05, 3.0]), {
      speaker: 'player',
      look: [0, 1.05, 3.0],
      settled: true,
    })],
    actors: [actor('player', [0, 0, 0], { eyeHeight: 1.25 })],
  });
  assert.deepEqual(kinds(result), ['CAMERA_AIM_MISS', 'CAMERA_LOOK_MISS', 'SPEAKER_OFF_CAMERA']);
});

/* ------------------------------------------------------------------ */
/* Drift and hygiene                                                   */
/* ------------------------------------------------------------------ */

test('a beat that names a body no longer in the scene says so', () => {
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('oath', shot([0, 1.7, -2], [0, 1.7, 0]), { speaker: 'lou-the-barber' })],
    actors: [actor('lou', [0, 0, 0])],
  });
  assert.deepEqual(kinds(result), ['BEAT_ACTOR_MISSING']);
  assert.equal(result.findings[0].field, 'speaker');
  assert.equal(result.findings[0].actor, 'lou-the-barber');
});

test('a missing subject and a present speaker are separate notes', () => {
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('oath', shot([0, 1.7, -2], [0, 1.7, 0]), { speaker: 'lou', subject: 'the-card' })],
    actors: [actor('lou', [0, 0, 0], { eyeHeight: 1.7 })],
  });
  assert.deepEqual(kinds(result), ['BEAT_ACTOR_MISSING']);
  assert.equal(result.findings[0].field, 'subject');
});

test('two beats sharing an id is a finding, because ids end up in allowlists', () => {
  const camera = shot([0, 1.7, -2], [0, 1.7, 0]);
  const result = framingFindings({
    id: 'fixture',
    beats: [beat('oath', camera, { speaker: 'lou' }), beat('oath', camera, { speaker: 'lou' })],
    actors: [actor('lou', [0, 0, 0], { eyeHeight: 1.7 })],
  });
  assert.deepEqual(kinds(result), ['BEAT_ID_DUPLICATE']);
});

test('the slab test is the staging gate\'s, re-exported rather than rewritten', () => {
  // docs/REUSE-FIRST.md rule 2. Two copies of a numerical routine drift the
  // moment one of them learns something, and this one is already under test
  // in tests/staging-gate.test.mjs.
  const wall = box([-1, 0, 5], [1, 3, 5.2]);
  assert.equal(rayBoxDistance([0, 1, 0], [0, 0, 1], wall), 5);
  assert.equal(rayBoxDistance([0, 1, 0], [1, 0, 0], wall), Infinity);
});
