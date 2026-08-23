/**
 * INITIATION NIGHT — the published shot list, held to the scene it describes.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS FOR
 *
 * The whole of act five of this scene — the blade, the hand, the cut, the
 * saint card, both oath lines and the burning — played OFF SCREEN for the
 * entire life of the scene, because the ritual camera aimed at a fixed patch
 * of tabletop 2.4 m in front of where the player stands. `docs/FRAMING-GATE.md`
 * is that fault turned into arithmetic, and `src/initiation/framing.js`
 * publishes this scene's shots so the gate has something to read.
 *
 * A published shot list is only worth anything while three things are true,
 * and each of them is a test below:
 *
 *   1. IT IS THE SAME ARITHMETIC THE SCENE USES. `main.js`'s `CAMERA_SHOTS`
 *      calls through to `INITIATION_SHOTS` for every mode. A shot list written
 *      out separately for a gate to read is a description of the scene, and a
 *      description goes stale the first time somebody moves a camera — which
 *      is exactly the failure the gate exists to end.
 *   2. THE POINTS IT NAMES ARE WHERE THE BODIES ARE. Every rig offset in
 *      `RIG`, and the seated and hand-height derivations built on them, are
 *      re-measured here against a real `core/person.js` body. Nothing in that
 *      file is allowed to be a number somebody remembered.
 *   3. THE INCIDENT STAYS CAUGHT. The historical ritual shot is reconstructed
 *      and run through the gate, and the finding it produces is pinned by its
 *      measured distance.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const framing = await import('../src/initiation/framing.js');
const site = await import('../src/initiation/cabin/site.js');
const staging = await import('../src/initiation/cabin/staging.js');
const phases = await import('../src/initiation/phases.js');
const { Person } = await import('../src/core/person.js');
const { framingFindings } = await import('../tools/framing-gate.mjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = fs.readFileSync(path.join(HERE, '..', 'src/initiation/main.js'), 'utf8');
const CAST = fs.readFileSync(path.join(HERE, '..', 'src/initiation/cast.js'), 'utf8');

const {
  CABIN_STANCES, CLEARING_STANCES, FIGURE_SCALE, INITIATION_SHOTS, RIG,
  allInitiationFramingBeats, handAt, initiationFramingBeats, seatedHead, seatedTorso,
} = framing;

const ZERO = new THREE.Vector3();
const world = (node) => node.getWorldPosition(new THREE.Vector3()).toArray();
const near = (actual, expected, tolerance, message) => assert.ok(
  Math.hypot(actual[0] - expected[0], actual[1] - expected[1], actual[2] - expected[2]) <= tolerance,
  `${message}: ${actual.map((n) => n.toFixed(3))} vs ${expected.map((n) => n.toFixed(3))}`,
);

/** A body, built and settled the way the scene builds one. */
function person(scale = 1) {
  const figure = new Person({});
  figure.group.scale.setScalar(scale);
  return figure;
}

/* ══════════════════════════════════════════════════════════════════════
 * 1. THE RIG THE BEATS DESCRIBE
 * ══════════════════════════════════════════════════════════════════════ */

test('every rig offset the shot list uses is where the real body actually is', () => {
  const figure = person();
  figure.update(1 / 60, ZERO, 0);
  figure.group.updateMatrixWorld(true);

  assert.equal(Number(world(figure.head)[1].toFixed(4)), RIG.headY, 'head height');
  assert.equal(Number(world(figure.torso)[1].toFixed(4)), RIG.torsoY, 'torso height');

  /* The hand is the one that matters most: the ritual camera is 0.62 m from
   * it, so a hand offset that has drifted is a camera pointed at a shoulder. */
  const left = world(staging.handSocket(figure, 'L'));
  const right = world(staging.handSocket(figure, 'R'));
  assert.equal(Number(left[1].toFixed(4)), RIG.handY, 'hand height');
  assert.equal(Number(Math.abs(left[0]).toFixed(4)), RIG.handX, 'left hand reach');
  assert.equal(Number(Math.abs(right[0]).toFixed(4)), RIG.handX, 'right hand reach');
  assert.ok(left[0] < 0 && right[0] > 0, 'the left hand is on the body\'s own left');
});

test('the ritual subject is the hand of a body standing where the player stands', () => {
  /* THE POINT OF THE WHOLE EXERCISE. `handAt` is what act five's eight beats
   * name as their subject, and if it is not the hand then the gate is checking
   * that the camera is pointed at a place nobody's hand is. */
  const figure = person();
  figure.group.position.set(site.CEREMONY_CENTRE.x, 0, site.CEREMONY_CENTRE.z);
  figure.heading = site.CEREMONY_CENTRE.heading;
  figure.group.rotation.y = figure.heading;
  figure.update(1 / 60, ZERO, 0);
  figure.group.updateMatrixWorld(true);

  const measured = world(staging.handSocket(figure, site.TABLE_SOCKETS.card.hand ?? 'L'));
  near(handAt(site.CEREMONY_CENTRE, 'L'), measured, 1e-3, 'published ritual hand');
});

test('a seated head and torso are where a seated body puts them', () => {
  /* Lou is the only man in this game who is sat down while he talks, and the
   * pose drops him 0.57 m and tips him back — so a beat that used a standing
   * head for him would be aiming half a metre over him. Posed and NOT updated,
   * because `Person.update()` would undo the pose; `isPosed` is what keeps the
   * scene's own loop off it. */
  const lou = person(FIGURE_SCALE.founder);
  staging.poseSeated(lou, site.LOU_SEAT, site.ROOM.floorY);
  lou.group.updateMatrixWorld(true);
  assert.equal(staging.isPosed(lou), true, 'the fixture must actually be seated');

  near(seatedHead(site.LOU_SEAT, FIGURE_SCALE.founder), world(lou.head), 1e-3, 'seated head');
  near(seatedTorso(site.LOU_SEAT, FIGURE_SCALE.founder), world(lou.torso), 1e-3, 'seated torso');

  /* And on a seat facing another way, because the first draft of the pitch had
   * its sign the wrong way round and Lou's chair faces due south — the one
   * heading at which a sign error is invisible in x and merely mirrored in z. */
  const across = { x: 3.5, z: -1.25, cushion: site.CUSHION.chair, heading: Math.PI / 2 };
  const other = person(FIGURE_SCALE.founder);
  staging.poseSeated(other, across, site.ROOM.floorY);
  other.group.updateMatrixWorld(true);
  near(seatedHead(across, FIGURE_SCALE.founder), world(other.head), 1e-3, 'seated head, turned');
});

/* ══════════════════════════════════════════════════════════════════════
 * 2. ONE COPY OF EVERY SHOT
 * ══════════════════════════════════════════════════════════════════════ */

test('every camera mode is implemented once, in the shared table, and main.js calls it', () => {
  for (const mode of phases.CAMERA_MODES) {
    assert.equal(typeof INITIATION_SHOTS[mode], 'function', `no shared shot for "${mode}"`);
    /* main.js keeps its `CAMERA_SHOTS` entry — the phase table's camera names
     * are asserted against it elsewhere — but the entry must DELEGATE. A
     * hand-written position in there is a second copy of the shot, and the
     * gate would then be checking the copy. */
    assert.match(MAIN, new RegExp(`INITIATION_SHOTS\\.${mode}\\(`),
      `main.js does not call the shared shot for "${mode}"`);
  }
  const extra = Object.keys(INITIATION_SHOTS).filter((mode) => !phases.CAMERA_MODES.includes(mode));
  assert.deepEqual(extra, [], 'a shot nothing can reach is a shot nothing checks');
});

test('the stances the shot list copies still match the tables main.js builds bodies from', () => {
  /* Same contract as `cabin/site.js`'s copy of the line-up: this module has to
   * be readable headless, so the handful of positions it needs are copied and
   * pinned HERE. A body moved in one file and not the other fails this rather
   * than leaving a beat filming an empty patch of mud -- which is what it just
   * did when SEFF came out of the treeline.
   *
   * Read out of `cast.js` rather than out of main.js. The roster used to live
   * at module scope inside two thousand nine hundred lines that also boot a
   * page, so this had to scrape it with a regular expression; now the Circle
   * has one home and the geometry adapter mounts the same one. */
  const circle = new Map();
  for (const match of CAST.matchAll(/\{ key: '(\w+)',[^}]*?x: (-?[\d.]+), z: (-?[\d.]+)/g)) {
    circle.set(match[1], { x: Number(match[2]), z: Number(match[3]) });
  }
  assert.ok(circle.size >= 15, `parsed only ${circle.size} of cast.js's CIRCLE`);
  for (const [key, stance] of Object.entries(CLEARING_STANCES)) {
    assert.deepEqual({ x: stance.x, z: stance.z }, circle.get(key), `${key} has moved in main.js`);
  }

  const blocking = MAIN.slice(MAIN.indexOf('const CABIN_BLOCKING = {'));
  for (const [key, slot] of Object.entries(CABIN_STANCES)) {
    assert.match(blocking.slice(0, blocking.indexOf('};')), new RegExp(`${key}: '${slot}'`),
      `${key} no longer stands on ${slot} in main.js`);
    assert.ok(site.blockingSlot(slot), `${slot} is not a slot site.js publishes`);
  }
});

/* ══════════════════════════════════════════════════════════════════════
 * 3. THE SHOT LIST ITSELF
 * ══════════════════════════════════════════════════════════════════════ */

const BEATS = allInitiationFramingBeats();

test('every published beat names a real phase, on the camera that phase uses', () => {
  const seen = new Set();
  for (const beat of BEATS) {
    assert.ok(beat.id, 'a beat with no id cannot be allowlisted or reported');
    assert.equal(seen.has(beat.id), false, `two beats share the id "${beat.id}"`);
    seen.add(beat.id);

    const spec = phases.PHASES[beat.phase];
    assert.ok(spec, `${beat.id} names phase "${beat.phase}", which does not exist`);
    /* The one that would otherwise rot quietly: a beat still describing the
     * shot a phase used to be filmed on. */
    assert.equal(beat.mode, spec.camera,
      `${beat.id} is published on "${beat.mode}" but ${beat.phase} is filmed on "${spec.camera}"`);

    for (const point of [beat.camera.position, beat.camera.lookAt]) {
      assert.equal(point.length, 3);
      assert.ok(point.every(Number.isFinite), `${beat.id} has a camera point that is not a number`);
    }
    for (const slot of ['speaker', 'subject']) {
      if (!beat[slot]) continue;
      assert.ok(beat[slot].point?.every(Number.isFinite), `${beat.id} ${slot} has no usable point`);
    }
  }
});

/**
 * Phases with no published beat, and the reason for each.
 *
 * This list is the point of the test below: a phase added to the scene with no
 * shot published for it fails a run rather than joining the dark.
 */
const UNPUBLISHED = new Map([
  ['q2_result', 'the same frontal as q2_choice, on the same man, published once'],
  ['exec_player', 'the same frontal again, on the beat he is shot on'],
  ['failed', 'a full-screen fail card is up; the camera holds where it was'],
  ['oath_no', 'FAIL-B — the screen is already black'],
  ['failed_oath', 'the FAIL-B card; the camera holds where it was'],
  ['trail_choice', 'the same over-the-shoulder as the trail, published twice already'],
  ['mass_kneel', 'the same clearing wide as the reveal, published as clear-line'],
  ['player_aim', 'the same clearing wide again, on the beat the gun reaches Tony'],
  ['lou_interrupt', 'the same clearing wide, held while Lou crosses to stop it'],
  ['complete', 'the last frame of the pullback, published as pullback-end'],
]);

test('every phase the scene can hold on somebody has a beat, or a reason', () => {
  const published = new Set(BEATS.map((beat) => beat.phase));
  const dark = phases.PHASE_IDS.filter((id) => !published.has(id) && !UNPUBLISHED.has(id));
  assert.deepEqual(dark, [], 'phases with no published shot and no stated reason');
  /* And the reasons stay honest: a phase that IS published has no business
   * carrying an excuse for not being. */
  for (const id of UNPUBLISHED.keys()) {
    assert.ok(phases.PHASES[id], `${id} is excused from publishing and does not exist`);
  }
});

/* ══════════════════════════════════════════════════════════════════════
 * 4. THE INCIDENT, PINNED
 * ══════════════════════════════════════════════════════════════════════ */

const ACT_FIVE = ['blade', 'hand', 'cut', 'card', 'oath-1', 'oath-2', 'burn', 'made'];

test('act five is aimed at the hand, on every one of its eight beats', () => {
  const cabin = initiationFramingBeats('cabin');
  const hand = handAt(site.CEREMONY_CENTRE, 'L');
  for (const id of ACT_FIVE) {
    const beat = cabin.find((entry) => entry.id === id);
    assert.ok(beat, `act five lost its "${id}" beat`);
    assert.equal(beat.subject.id, 'player-hand');
    near(beat.camera.lookAt, hand, 1e-9, `${id} aims off the hand`);
    /* And the camera is close and low on it rather than across the room. */
    const range = Math.hypot(...beat.camera.position.map((n, i) => n - hand[i]));
    assert.ok(range > 0.4 && range < 1.2, `${id} is ${range.toFixed(2)} m from the hand`);
  }
});

test('the gate catches the ritual shot as it shipped: 2.3 m off the hand', () => {
  /* THE SHOT THAT LOST THE ACT, reconstructed: the camera at the table's west
   * end, aimed at `TABLE_SOCKETS.card` — the patch of tabletop the card is
   * picked UP from — while the player stands at CEREMONY_CENTRE, 2.4 m short
   * of the table. Run against the same published subject the fixed shot uses,
   * so what this measures is the real distance between the two.
   *
   * It fails on `aim` and not only on `look`, which is the distinction
   * docs/FRAMING-GATE.md was written around: aim is where the shot INTENDS to
   * look and is always fair game. */
  const hand = handAt(site.CEREMONY_CENTRE, 'L');
  const asItWas = {
    id: 'ritual-as-it-shipped',
    phase: 'hand',
    camera: {
      position: [site.TABLE.x - 1.9, 1.35, site.TABLE.z - 1.2],
      lookAt: [site.TABLE_SOCKETS.card.x, site.TABLE.topY + 0.27, site.TABLE_SOCKETS.card.z],
    },
    subject: { id: 'player-hand', point: hand },
  };
  const { findings } = framingFindings({ id: 'initiation:cabin', beats: [asItWas] });
  const miss = findings.find((finding) => finding.kind === 'CAMERA_AIM_MISS');
  assert.ok(miss, 'the gate did not see the shot that lost act five');
  assert.equal(miss.missM, 2.3);
  assert.equal(miss.subject, 'player-hand');

  /* And the shot as it is now, through the same gate, on the same subject. */
  const now = initiationFramingBeats('cabin').filter((beat) => ACT_FIVE.includes(beat.id));
  const clean = framingFindings({ id: 'initiation:cabin', beats: now });
  assert.deepEqual(clean.findings, [], 'the fixed ritual shot must be clean');
});

/* ══════════════════════════════════════════════════════════════════════
 * 5. THE FAULT THE GATE FOUND ON ITS FIRST RUN
 * ══════════════════════════════════════════════════════════════════════ */

test('the line and the standing execution are not filmed from inside the west car', async () => {
  /* Both of these shots stood INSIDE a parked car's collision volume — the
   * line-up wide at 0.32 m off its cabin roof, and the three-quarter front on
   * Prospect One at EIGHT CENTIMETRES, which is the shot that carries the
   * founders' first question and the man asking for another go. Nothing had
   * ever checked, because the only way to check was to play it.
   *
   * Measured against the site's own colliders, in the circles the scene's
   * movement actually uses. */
  const { buildInitiationCabinSite } = await import('../src/initiation/cabin/index.js');
  const built = buildInitiationCabinSite({ woods: false, clearing: true, cabin: false, audio: null });
  const circles = built.colliders.filter((collider) => (
    Number.isFinite(collider?.x) && Number.isFinite(collider?.z) && Number.isFinite(collider?.r)
  ));
  assert.ok(circles.length > 0, 'the clearing built no colliders to check against');

  const inLine = { x: site.PROSPECT_XS[0], z: site.LINE_Z };
  const shots = [
    ['line', INITIATION_SHOTS.line()],
    ['stand_exec, victim still in the row', INITIATION_SHOTS.stand_exec({ victim: [inLine.x, 0, inLine.z] })],
    ['stand_exec, victim on the mark', INITIATION_SHOTS.stand_exec({ victim: [site.STAND_MARK.x, 0, site.STAND_MARK.z] })],
  ];
  for (const [label, shot] of shots) {
    for (const circle of circles) {
      const gap = Math.hypot(shot.position[0] - circle.x, shot.position[2] - circle.z) - circle.r;
      assert.ok(gap > 0, `the ${label} camera stands ${(-gap).toFixed(2)} m inside a collider`);
    }
  }
});
