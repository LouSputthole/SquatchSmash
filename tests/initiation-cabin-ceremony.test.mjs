/**
 * INITIATION NIGHT — the rewritten ceremony, held to its own rules.
 *
 * The owner's brief is a piece of blocking and a shape of night, and almost
 * everything that can go wrong with either is invisible in a screenshot of a
 * dark clearing. So this file checks them the only way they can be checked:
 *
 *   - THE EXECUTIONS. Every remaining prospect kneels at once. Four are shot
 *     from behind WHERE THE PLAYER CAN SEE IT; Kittenboss is fourth at Tony's
 *     side, then Lou stops Tony's execution — asserted in world-space vectors on
 *     the real `core/person.js` rig, after `Person.update()` has had a go at
 *     the pose, not by eye.
 *   - THE CHOICE. Yes commits, no gets the gunshot and MISSION FAILED: WRONG
 *     ANSWER, and both branches are reachable and both come back.
 *   - NO DEAD ENDS. Every phase in the table is reachable, every one of them
 *     has a way out, and every one that shows a blank objective has a timeout.
 *     A beat that can be entered and not left is the exact bug that stranded a
 *     player in the siege armoury, armed, with the objective frozen.
 *   - THE WORDS. Every scripted line has a cue in the recording handoff, the
 *     owner's own lines are pinned by their exact text, and Kittenboss is
 *     "she" in every file this pass owns.
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
const site = await import('../src/initiation/cabin/site.js');
const staging = await import('../src/initiation/cabin/staging.js');
const script = await import('../src/initiation/script.js');
const { oathChoices } = await import('../src/initiation/dialogue.js');
const phases = await import('../src/initiation/phases.js');
const executions = await import('../src/initiation/executions.js');
const { OUTDOOR_MEMBER_STATIONS } = await import('../src/initiation/ceremony-layout.js');
const { Person } = await import('../src/core/person.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const MAIN = read('src/initiation/main.js');
const HANDOFF_PATH = 'docs/audio/pending-initiation-cues.json';
const HANDOFF = JSON.parse(read(HANDOFF_PATH));
const MANIFEST = JSON.parse(read('assets/sfx/manifest.json'));

const ZERO = new THREE.Vector3();
const { PHASES, PHASE_IDS, START_PHASE } = phases;
const {
  KNEELING_EXECUTIONS,
  STANDING_EXECUTION,
  LINE_UP,
  DOOMED,
  SURVIVORS,
  MASS_KNEEL,
  PLAYER_THREAT,
  LOU_INTERRUPTION,
} = executions;

/** Unit facing of a Person heading, in world space. */
function facingOf(heading) {
  return new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
}

/** Distance from `point` to the segment a→b, in the ground plane. */
function segmentDistance(a, b, point) {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const lengthSquared = vx * vx + vz * vz;
  let t = lengthSquared > 0 ? ((point.x - a.x) * vx + (point.z - a.z) * vz) / lengthSquared : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + vx * t), point.z - (a.z + vz * t));
}

/* ══════════════════════════════════════════════════════════════════════ *
 * THE SHAPE OF THE NIGHT
 * ══════════════════════════════════════════════════════════════════════ */

test('the line-up is six people; Tony alone survives the clearing', () => {
  assert.equal(LINE_UP.length, 6);
  const player = LINE_UP.filter((slot) => slot.player);
  assert.equal(player.length, 1, 'exactly one of them is the man holding the controller');
  assert.equal(player[0].name, 'PROSPECT TWO');

  assert.deepEqual([...DOOMED].sort(),
    ['PROSPECT ONE', 'PROSPECT THREE', 'PROSPECT FOUR', 'PROSPECT FIVE', 'KITTENBOSS'].sort());
  assert.deepEqual(SURVIVORS, ['PROSPECT TWO']);
  assert.equal(SURVIVORS.every((name) => !DOOMED.includes(name)), true);

  /* Left to right, 2.2 m apart, with Kittenboss on the end in front of the
   * boot she came out of. */
  const xs = LINE_UP.map((slot) => slot.x);
  for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i] - xs[i - 1] - 2.2) < 1e-9);
  assert.equal(LINE_UP[LINE_UP.length - 1].name, 'KITTENBOSS');
});

test('the spawn-to-slot ceremonial aisle clears every family and prospect body disc', () => {
  const spawn = { x: 0, z: -78 };
  const playerRadius = 0.30;
  const bodyRadius = 0.48;
  const safety = 0.10;
  const discs = [
    ...OUTDOOR_MEMBER_STATIONS.map((station) => ({ name: station.name, ...station })),
    ...LINE_UP.filter((slot) => !slot.player)
      .map((slot) => ({ name: slot.name, x: slot.x, z: site.LINE_Z })),
  ];

  for (const disc of discs) {
    const clearance = segmentDistance(spawn, site.PLAYER_SLOT, disc)
      - playerRadius - bodyRadius;
    assert.ok(clearance >= safety,
      `${disc.name} pinches the arrival aisle to ${clearance.toFixed(2)} m`);
  }

  const kittenboss = site.kneelMark('kneel-4');
  const routeClearance = segmentDistance(spawn, site.PLAYER_SLOT, kittenboss)
    - playerRadius - bodyRadius;
  assert.ok(routeClearance >= safety,
    `Kittenboss's beside-Tony mark blocks the approach by ${(-routeClearance).toFixed(2)} m`);
});

test('KITTENBOSS kneels beside Tony and is the fourth fatal execution', () => {
  assert.equal(DOOMED.includes('KITTENBOSS'), true);
  const hers = MASS_KNEEL.find((entry) => entry.victim === 'KITTENBOSS');
  assert.ok(hers);
  assert.equal(hers.doomed, true);
  assert.equal(hers.she, true);
  assert.equal(hers.markId, 'kneel-4');

  const witness = site.kneelMark(hers.markId);
  const lateral = Math.abs(witness.x - site.PLAYER_SLOT.x);
  const foreAft = Math.abs(witness.z - site.PLAYER_SLOT.z);
  assert.equal(witness.role, 'execution');
  assert.ok(lateral >= 1.2 && lateral <= 1.5,
    `Kittenboss is ${lateral.toFixed(2)} m lateral from Tony, not beside him`);
  assert.ok(foreAft <= 0.5,
    `Kittenboss is ${foreAft.toFixed(2)} m in front of Tony, not beside him`);

  const fatalMarks = KNEELING_EXECUTIONS.map((step) => site.kneelMark(step.markId));
  assert.equal(fatalMarks.every((mark) => mark.role === 'execution'), true);
  assert.equal(KNEELING_EXECUTIONS.at(-1).victim, 'KITTENBOSS');
  assert.equal(KNEELING_EXECUTIONS.at(-1).beat, 'IN-150');
  assert.equal(KNEELING_EXECUTIONS.at(-1).besidePlayer, true);
  assert.equal(fatalMarks.slice(0, -1).every((mark) => mark.z > witness.z + 2), true,
    'the first three executions must remain clearly in front of Tony and Kittenboss');

  const herLines = script.BEATS.flatMap((beat) => beat.lines)
    .filter((line) => line.who === 'KITTENBOSS');
  assert.ok(herLines.length >= 5, 'she is not a walk-on');
  assert.equal(herLines.every((line) => line.voice === 'kittenboss'), true);
  assert.equal(script.beatById('IN-170').lines.some(
    (line) => /spare her/i.test(line.say),
  ), false);

  /* And nobody remarks on it, ever. */
  const everything = script.BEATS
    .flatMap((beat) => beat.script)
    .map((entry) => (entry.stage ?? entry.text ?? '').toLowerCase())
    .join('\n');
  for (const phrase of script.FORBIDDEN_PHRASES) {
    assert.equal(everything.includes(phrase), false, `"${phrase}" is in the script`);
  }
});

test('KITTENBOSS is she in every file this pass owns', () => {
  const files = [
    'src/initiation/script.js',
    'src/initiation/executions.js',
    'src/initiation/main.js',
    'src/initiation/cabin/site.js',
  ];
  for (const file of files) {
    for (const line of read(file).split('\n')) {
      if (!/kittenboss/i.test(line)) continue;
      /* A male pronoun later on the same line may refer to Tony. Catch only
       * one grammatically attached to Kittenboss's name. "Beside him" is the
       * authored spatial relationship to Tony, so name that antecedent before
       * applying the deliberately broad local-context guard. */
      const pronounContext = line.replace(/\bbeside him\b/gi, 'beside Tony');
      assert.equal(/\bkittenboss(?:'s)?(?:\W+\w+){0,3}\W+\b(he|him|his)\b/i.test(pronounContext), false,
        `${file}: Kittenboss is a woman — "${line.trim()}"`);
    }
  }
});

test('the run order kneels everyone, executes four, then interrupts Tony before release', () => {
  const findings = executions.verifyExecutionStaging();
  assert.deepEqual(findings, [], findings.join('\n'));

  const order = executions.executionRunOrder();
  assert.deepEqual(
    order.map((entry) => entry.kind),
    ['mass_kneel', 'shot', 'shot', 'shot', 'shot', 'aim', 'interrupt', 'release'],
  );
  assert.deepEqual(
    order.filter((entry) => entry.kind === 'shot').map((entry) => entry.step.victim),
    ['PROSPECT THREE', 'PROSPECT FOUR', 'PROSPECT FIVE', 'KITTENBOSS'],
  );
  assert.equal(KNEELING_EXECUTIONS.every((step) => step.rounds === 1), true);
  assert.equal([STANDING_EXECUTION, ...KNEELING_EXECUTIONS, PLAYER_THREAT]
    .every((entry) => entry.weapon === 'revolver'), true);
  assert.equal(PLAYER_THREAT.fires, false);
  assert.equal(PLAYER_THREAT.rounds, 0);
  assert.equal(LOU_INTERRUPTION.beforeShot, true);
  assert.deepEqual(LOU_INTERRUPTION.survivors, SURVIVORS);
  /* Prospect One keeps the staging that ships: standing, frontal, eight. */
  assert.equal(STANDING_EXECUTION.rounds, 8);
  assert.equal(STANDING_EXECUTION.kneeling, false);
  assert.equal(STANDING_EXECUTION.shooter, 'BOOSKIBRO',
    'Booskibro, not a proximity-selected substitute, owns Prospect One\'s execution');
  assert.equal(STANDING_EXECUTION.stance, site.STANDING_SHOOTER_MARK);
  assert.ok(STANDING_EXECUTION.stance.x < STANDING_EXECUTION.mark.x,
    'the standing shooter did not move left of Tony\'s victim sightline');
  assert.ok(Math.hypot(
    STANDING_EXECUTION.stance.x - STANDING_EXECUTION.mark.x,
    STANDING_EXECUTION.stance.z - STANDING_EXECUTION.mark.z,
  ) > 1.5, 'the standing shooter is crowding Prospect One');
});

test('the live clearing stations carry Lou and Booskibro\'s established faces', () => {
  const byKey = new Map(OUTDOOR_MEMBER_STATIONS.map((station) => [station.key, station]));
  assert.equal(byKey.get('BOOSKIBRO').face, 'assets/faces/booski.png');
  assert.equal(byKey.get('LOU').face, 'assets/faces/lou.png');
  assert.match(MAIN, /makeInitiationCeremonyFigure\(spec\.key, \{ face: spec\.face \?\? null \}\)/,
    'the production scene stopped passing station faces to the canonical figure adapter');
});

test('Kittenboss carries her own landed female portrait into the live line-up', () => {
  const kitten = LINE_UP.find((slot) => slot.id === 'kittenboss');
  assert.equal(kitten.face, 'assets/faces/kittenboss.png');
  assert.equal(fs.existsSync(path.join(ROOT, kitten.face)), true);
  assert.match(MAIN,
    /makeInitiationCeremonyFigure\(slot\.name, \{ face: slot\.face \?\? null \}\)/,
    'the production line-up stopped passing Kittenboss\'s portrait to her figure');
});

/* ══════════════════════════════════════════════════════════════════════ *
 * THE EXECUTION GEOMETRY, on the real rig, in world-space vectors
 * ══════════════════════════════════════════════════════════════════════ */

test('every kneeling prospect is on their knees, on the mud, facing the line', () => {
  for (const step of KNEELING_EXECUTIONS) {
    const mark = executions.markForStep(step);
    const victim = new Person({});
    staging.poseKneeling(victim, mark);

    /* `Person.update()` writes legs, yaw and base height EVERY frame and would
     * stand a kneeling figure straight back up — the same class of bug as the
     * scripted snap-face that lost to an ambient turn at the Bing. The scene
     * skips posed figures wholesale, and `isPosed()` is how it knows. */
    assert.equal(staging.isPosed(victim), true, `${step.victim} is not flagged as posed`);
    victim.update(1 / 60, ZERO, 0);
    staging.poseKneeling(victim, mark);
    victim.group.updateMatrixWorld(true);

    const head = new THREE.Vector3();
    victim.head.getWorldPosition(head);
    /* The head is not directly over the knees and should not be: `bodyPitch`
     * is a small forward slump, because nobody kneels to attention while this
     * is being arranged behind them. So the head lands exactly that far in
     * front of the mark, along the way the figure is facing — checked against
     * the pose's own number rather than waved through with a fat tolerance. */
    const slump = 2.3 * Math.sin(staging.KNEEL_POSE.bodyPitch);
    const facingHere = facingOf(mark.heading);
    const expected = {
      x: mark.x + facingHere.x * slump,
      z: mark.z + facingHere.z * slump,
    };
    assert.ok(Math.hypot(head.x - expected.x, head.z - expected.z) < 0.1,
      `${step.victim}'s head is not where the kneel puts it`);
    assert.ok(Math.abs(head.y - site.KNEEL_HEAD_Y) < 0.1,
      `${step.victim}'s head is at ${head.y.toFixed(2)} m, not the muzzle's ${site.KNEEL_HEAD_Y}`);

    /* The knees are ON the ground, not through it and not above it. */
    const boot = new THREE.Vector3();
    victim.legL.children[0].getWorldPosition(boot);
    assert.ok(boot.y > -0.02 && boot.y < 0.45, `${step.victim} is ${boot.y.toFixed(2)} m off the mud`);

    const facing = facingOf(victim.heading);
    if (step.besidePlayer) {
      const toWork = new THREE.Vector3(
        site.KNEEL_MARKS[2].x - head.x, 0, site.KNEEL_MARKS[2].z - head.z,
      ).normalize();
      assert.ok(facing.dot(toWork) > 0.7, `${step.victim} is not facing forward beside Tony`);
    } else {
      /* The three in front turn toward Tony's row, so he gets their faces. */
      const toPlayer = new THREE.Vector3(
        site.PLAYER_EYE.x - head.x, 0, site.PLAYER_EYE.z - head.z,
      ).normalize();
      assert.ok(facing.dot(toPlayer) > 0.35, `${step.victim} is not facing the line`);
    }
  }
});

test('the executioner is behind the kneeling figure, and the player can see it', () => {
  const limits = executions.STAGING_LIMITS;
  /* Bodies already on the ground, accumulated in the order they go down: the
   * sightline has to stay clear as the working ground fills up. */
  const fallen = [];

  for (const step of KNEELING_EXECUTIONS) {
    const mark = executions.markForStep(step);

    const victim = new Person({});
    staging.poseKneeling(victim, mark);
    victim.group.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    victim.head.getWorldPosition(head);

    const shooter = new Person({});
    staging.standOn(shooter, mark.shooter);
    shooter.group.updateMatrixWorld(true);
    const shooterAt = shooter.group.position;

    /* BEHIND, in world-space: the bearing from the head to the man holding the
     * pistol, against the way the kneeling figure is facing. */
    const facing = facingOf(victim.heading);
    const toShooter = new THREE.Vector3(
      shooterAt.x - head.x, 0, shooterAt.z - head.z,
    );
    const reach = toShooter.length();
    toShooter.normalize();
    assert.ok(facing.dot(toShooter) < limits.MAX_BEHIND_DOT,
      `${step.shooter} is not behind ${step.victim}: ${facing.dot(toShooter).toFixed(3)}`);
    assert.ok(reach > 0.7 && reach < 1.4,
      `${step.shooter} is ${reach.toFixed(2)} m away — a man reaches, he does not press it there`);

    /* FACING AWAY, from the other end. */
    const shooterFacing = facingOf(shooter.heading);
    const toHead = new THREE.Vector3(head.x - shooterAt.x, 0, head.z - shooterAt.z).normalize();
    assert.ok(shooterFacing.dot(toHead) > 0.99, `${step.shooter} is not looking at the head`);
    assert.ok(toHead.dot(facing) > limits.MIN_AWAY_DOT,
      `${step.victim} is not facing away from ${step.shooter}`);

    /* VISIBLE. He is further from the player than his victim, so he can never
     * be standing in front of the thing the player is meant to be watching. */
    const eye = site.PLAYER_EYE;
    assert.ok(
      Math.hypot(shooterAt.x - eye.x, shooterAt.z - eye.z) - Math.hypot(head.x - eye.x, head.z - eye.z)
        > limits.MIN_SHOOTER_GAP,
      `${step.shooter} can occlude ${step.victim}`,
    );
    /* And so is everybody else in the frame: the second man, and every body
     * already lying on the working ground. */
    const others = [
      { id: step.second, at: mark.escort },
      ...fallen.map((entry) => ({ id: `${entry.victim}'s body`, at: entry.at })),
    ];
    for (const other of others) {
      assert.ok(segmentDistance(eye, head, other.at) > 0.62,
        `${other.id} is standing on the player's line of sight to ${step.victim}`);
    }
    /* The muzzle sits off the spine, which is the only reason the flash is
     * visible past the skull rather than behind it. */
    assert.ok(segmentDistance(eye, head, mark.muzzle) > limits.MIN_MUZZLE_CLEARANCE);
    /* Close enough to read a face at. */
    assert.ok(Math.hypot(head.x - eye.x, head.z - eye.z) < limits.MAX_PLAYER_DISTANCE);

    fallen.push({ victim: step.victim, at: mark.fall });
  }
});

test('a body shot on its knees goes down forward, on the mark, and stays out of the mud', () => {
  for (const step of KNEELING_EXECUTIONS) {
    const mark = executions.markForStep(step);
    const body = new Person({});
    staging.poseKneeling(body, mark);
    /* Rotated about the KNEES and about the figure's OWN left-right axis. The
     * scene's other death spins the group about its origin on the world X
     * axis, which for a kneeling figure — whose origin is a metre BELOW the
     * mud — sends a man through the ground and out the other side. */
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      /* Pinned to the KNEEL mark — that is the point the body rotates about.
       * `mark.fall` is where site.js says the body ENDS UP, and passing it here
       * would pin the knees to it and slide the whole man 1.5 m down-range. */
      staging.poseFallen(body, mark, k);
      body.group.updateMatrixWorld(true);
      const knee = new THREE.Vector3();
      body.legL.getWorldPosition(knee);
      assert.ok(knee.y > -0.05, `${step.victim}'s knee is ${knee.y.toFixed(2)} m under the mud at k=${k}`);
      assert.ok(Math.hypot(knee.x - mark.x, knee.z - mark.z) < 0.55,
        `${step.victim} slid off the mark at k=${k}`);
    }
    body.group.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    body.head.getWorldPosition(head);
    assert.ok(head.y > 0.1 && head.y < 0.9, `${step.victim} finished at head height ${head.y.toFixed(2)}`);
    /* And the whole body fits inside the reach site.js measures every fall
     * clearance on this site against. */
    assert.ok(Math.hypot(head.x - mark.x, head.z - mark.z) < site.FALL_REACH,
      `${step.victim} reaches further than FALL_REACH`);
    /* FORWARD, toward the line — which is why the last of them finishes at his
     * feet — and never sideways along the row onto the next mark. */
    const facing = facingOf(mark.heading);
    const travelled = new THREE.Vector3(head.x - mark.x, 0, head.z - mark.z);
    assert.ok(travelled.clone().normalize().dot(facing) > 0.8, `${step.victim} did not fall forward`);
  }
});

test('Lou is the only man sitting, and he is sitting ON his chair', () => {
  const seat = site.LOU_SEAT;
  const chair = site.FURNITURE.find((box) => box.id === 'chair-head');
  assert.ok(chair, 'the head of the table has a chair');
  assert.ok(seat.x > chair.minX && seat.x < chair.maxX);
  assert.ok(seat.z > chair.minZ && seat.z < chair.maxZ);
  assert.equal(seat.cushion, site.CUSHION.chair);
  /* `seatBaseY` of this room's cushion is exactly zero because the furniture
   * was BUILT to the pose. The seated pose still has to put the hips on the
   * cushion rather than on the floor, and that is what this checks: a bar
   * stool's number here would sit him 31 cm above the seat. */
  const lou = new Person({});
  staging.poseSeated(lou, seat, site.ROOM.floorY);
  lou.group.updateMatrixWorld(true);
  const hip = new THREE.Vector3();
  lou.legL.getWorldPosition(hip);
  assert.ok(Math.abs(hip.y - (seat.cushion + staging.SEAT_POSE.hipLift)) < 0.01,
    `his hips are at ${hip.y.toFixed(2)} m and the cushion is at ${seat.cushion}`);
  const boot = new THREE.Vector3();
  lou.legL.children[0].getWorldPosition(boot);
  assert.ok(boot.y > -0.05 && boot.y < 0.35, `his feet are at ${boot.y.toFixed(2)} m`);
  assert.equal(staging.isPosed(lou), true, 'a seated figure must be skipped by Person.update()');
});

/* ══════════════════════════════════════════════════════════════════════ *
 * THE STATE MACHINE — reachable, and never a dead end
 * ══════════════════════════════════════════════════════════════════════ */

test('every phase is reachable, every phase has a way out, and none can stall', () => {
  const reachable = phases.reachablePhases(START_PHASE);
  const unreachable = PHASE_IDS.filter((id) => !reachable.has(id));
  assert.deepEqual(unreachable, [], `unreachable: ${unreachable.join(', ')}`);

  assert.deepEqual(phases.deadEndPhases(), [],
    'a beat that can be entered and not left is the siege armoury bug');

  /* A blank objective is only legal while something else is moving, and it is
   * only safe because every one of those beats times out. */
  assert.deepEqual(phases.stallablePhases(), [],
    'a blank objective on a beat that can stall is the armoury bug verbatim');

  for (const id of PHASE_IDS) {
    const spec = PHASES[id];
    for (const exit of spec.exits) {
      assert.ok(PHASES[exit], `${id} exits to "${exit}", which does not exist`);
    }
    assert.ok(phases.ADVANCE_KINDS.includes(spec.advance), `${id} has no advance kind`);
    assert.ok(phases.CAMERA_MODES.includes(spec.camera), `${id} has no camera mode`);
    /* Only the two beats that put a prompt on screen are allowed to wait
     * forever, and both of them are a question somebody asked out loud. */
    if (spec.timeout === null && !spec.terminal) {
      assert.ok(spec.advance === 'player' || spec.advance === 'input',
        `${id} has no timeout and nothing driving it`);
      if (spec.advance === 'input') {
        assert.ok(spec.objective !== '' || spec.card,
          `${id} waits forever with a blank HUD and no card on screen`);
      }
    }
  }
});

test('every camera mode has a shot, so no phase can fall through to the victory orbit', () => {
  /* The specific trap: `updateCamera` used to end in a bare `else` that meant
   * "complete", so every new phase name anybody forgot to add silently got the
   * slow victory orbit — which, on the frame Kittenboss is shot, is a
   * catastrophe nobody would find until playtest. */
  assert.equal(/const CAMERA_SHOTS = \{/.test(MAIN), true);
  for (const mode of phases.CAMERA_MODES) {
    assert.match(MAIN, new RegExp(`\\n  ${mode}\\(`), `main.js has no camera shot for "${mode}"`);
  }
  assert.doesNotMatch(MAIN, /\}\s*else\s*\{\s*\/\/ complete/,
    'the bare else that means "complete" is back');
});

test('the wrong answer fails the mission, and the failure comes back', () => {
  /* FAIL-A — the founders question, entirely unchanged. */
  assert.ok(PHASES.q2_result.exits.includes('exec_player'));
  assert.deepEqual(PHASES.exec_player.exits, ['failed']);
  assert.deepEqual(PHASES.failed.exits, ['q2_choice'],
    'the Circle, inexplicably, lets him have another go');

  /* FAIL-B — the oath. "No. I don't." is the owner's line, and fumbling the
   * words he is asked to repeat is now the third way to die in this room. */
  assert.deepEqual(PHASES.oath_question.exits, ['oath_yes', 'oath_no']);
  for (const id of ['oath_1', 'oath_2']) {
    assert.equal(PHASES[id].choice, true, `${id} must put the words up as a choice`);
    assert.ok(PHASES[id].exits.includes('failed_oath'),
      `${id} must be able to end the night`);
  }
  assert.deepEqual(PHASES.oath_no.exits, ['failed_oath']);
  assert.deepEqual(PHASES.failed_oath.exits, ['oath_question'],
    'FAIL-B must resume on Lou standing, not at the top of the ceremony');

  const failB = script.beatById('FAIL-B');
  assert.equal(failB.lines.length, 1);
  assert.equal(failB.lines[0].say, 'No. I don’t.');
  assert.equal(failB.lines[0].verbatim, true);
  const stage = failB.script.map((entry) => entry.stage ?? '').join(' ');
  for (const owned of ['SILENCE', 'shifts', 'tiniest nod', 'GUNSHOT', 'Cut to black']) {
    assert.ok(stage.includes(owned), `FAIL-B lost the owner's stage direction: ${owned}`);
  }

  /* And the card the player is actually shown. */
  assert.match(MAIN, /failTitleEl\.textContent = 'MISSION FAILED'/);
  /* The REASON is now the caller's, because there are two ways to be shot in
   * this chair and they are not the same mistake: refusing outright is WRONG
   * ANSWER, and getting Lou's words back wrong is WRONG WORDS. The default
   * keeps the refusal's card exactly as it shipped. */
  assert.match(MAIN, /function fireTheOathShot\(reason = 'WRONG ANSWER'\)/);
  assert.match(MAIN, /failReasonEl\.innerHTML = reason;/);
  assert.match(MAIN, /fireTheOathShot\('WRONG WORDS'\)/);
  /* The shot is a real, positional weapon cue and never a raw one. */
  assert.match(MAIN, /function fireTheOathShot\([\s\S]{0,60}\)[\s\S]{0,400}playWeaponCue\(audio, 'revolver', 'fire', \{[\s\S]{0,200}position:/);
  /* Nothing from before the question replays. */
  assert.doesNotMatch(
    MAIN.slice(MAIN.indexOf("if (failFrom === 'oath')"), MAIN.indexOf("/* FAIL-A, entirely unchanged")),
    /IN-3[1-6]\d/,
    'FAIL-B\'s retry replays the ritual',
  );
});

test('the right answer completes the mission, and the path never touches a fail state', () => {
  const FAIL = new Set(['exec_player', 'failed', 'oath_no', 'failed_oath']);
  const seen = new Set([START_PHASE]);
  const queue = [START_PHASE];
  while (queue.length) {
    const id = queue.shift();
    for (const exit of PHASES[id].exits) {
      if (FAIL.has(exit) || seen.has(exit)) continue;
      seen.add(exit);
      queue.push(exit);
    }
  }
  assert.equal(seen.has('complete'), true,
    'there is no way to finish this scene without failing something first');
  assert.equal(PHASES.complete.terminal, true);
  assert.deepEqual(PHASES.oath_yes.exits, ['blade']);

  /* The making itself: the completion event, once, and a real exit home so no
   * save is trapped in a terminal scene. */
  assert.match(MAIN, /TIME_EVENT_IDS\.COMPLETE_INITIATION/);
  assert.match(MAIN, /navigateCampaign\(campaign, SCENE_IDS\.APARTMENT/);
});

test('only Tony survives before the walk to the cabin', () => {
  const order = executions.executionRunOrder();
  const killed = order.filter((entry) => entry.kind === 'shot')
    .map((entry) => entry.step.victim);
  assert.deepEqual([STANDING_EXECUTION.victim, ...killed], DOOMED);
  assert.deepEqual(order.at(-1), { kind: 'release', survivors: SURVIVORS });
  assert.equal(order.findIndex((entry) => entry.kind === 'interrupt')
    < order.findIndex((entry) => entry.kind === 'release'), true);
  assert.equal(order.some((entry) => entry.kind === 'shot'
    && SURVIVORS.includes(entry.step.victim)), false);
});

/* ══════════════════════════════════════════════════════════════════════ *
 * THE WORDS
 * ══════════════════════════════════════════════════════════════════════ */

test('every scripted line has a cue in the recording handoff, in both directions', () => {
  const wanted = script.scriptCues();
  assert.ok(wanted.length > 70, 'the rewrite has lost most of its lines');

  const byName = new Map(HANDOFF.map((cue) => [cue.name, cue]));
  assert.equal(byName.size, HANDOFF.length, `${HANDOFF_PATH} has duplicate cue names`);

  for (const cue of wanted) {
    const got = byName.get(cue.name);
    assert.ok(got, `${cue.name} ("${cue.say}") is missing from ${HANDOFF_PATH}`);
    assert.equal(got.say, cue.say, `${cue.name} says something else in the handoff`);
    assert.equal(got.voice, cue.voice, `${cue.name} is cast differently in the handoff`);
  }
  const wantedNames = new Set(wanted.map((cue) => cue.name));
  for (const cue of HANDOFF) {
    assert.ok(wantedNames.has(cue.name), `${cue.name} is in ${HANDOFF_PATH} and in no line`);
  }

  /* Manifest shape, and a voice the booth can actually cut against. THIS PASS
   * DOES NOT WRITE TO assets/sfx/manifest.json — the orchestrator merges the
   * handoff — but a cue on a profile that does not exist is a cue that can
   * never be recorded. */
  for (const cue of HANDOFF) {
    assert.deepEqual(
      Object.keys(cue).filter((key) => !['name', 'voice', 'say', 'direction'].includes(key)),
      [], `${cue.name} carries a field the manifest has no column for`);
    assert.ok(cue.name.startsWith('vo.initiation.cabin.'), `${cue.name} is on the wrong prefix`);
    assert.ok(MANIFEST.voices?.[cue.voice]?.id, `no voice profile "${cue.voice}" for ${cue.name}`);
  }

  const manifestCabin = MANIFEST.sfx.filter(
    (cue) => cue.name.startsWith('vo.initiation.cabin.'),
  );
  assert.deepEqual(manifestCabin, wanted,
    'the active cabin script and manifest differ in one or both directions');
});

test('the rewrite does not disturb the thirty-two shipped ceremony cues', () => {
  /* `dialogue.js` feeds `tools/initiation-vo-lib.mjs`, which `npm run check`
   * diffs against the manifest in BOTH directions. Adding a line there with no
   * manifest row fails the build as `missing`; removing one fails it as
   * `stale`. So the shipped bank is left exactly as it is and the rewrite's
   * cues live on their own scope. */
  const shipped = MANIFEST.sfx.filter((cue) => cue.name.startsWith('vo.initiation.ceremony.'));
  assert.equal(shipped.length, 32);
  const clash = HANDOFF.filter((cue) => shipped.some((old) => old.name === cue.name));
  assert.deepEqual(clash, []);

  /* What the rewrite stops playing. These stay in `dialogue.js` until the
   * handoff is merged, and then they go to `assets/sfx/rerecord.json`'s
   * retired array — in the same commit, because either half on its own is a
   * red `npm run check`. */
  assert.deepEqual(script.RETIRED_CEREMONY_BEATS, ['endured', 'roar']);
  assert.equal(script.RETIRED_CEREMONY_LINES.length, 2);
  for (const retired of script.RETIRED_CEREMONY_LINES) {
    assert.ok(shipped.some((cue) => cue.say === retired), `"${retired}" is not a shipped line`);
  }
  /* And it really has stopped playing them. */
  for (const gone of ['ENDURED_LINES', 'ROAR_LINES', 'RETRY_LINE', 'startGauntlet', 'spawnGreatLog', 'doRoar']) {
    assert.equal(MAIN.includes(gone), false, `${gone} is still wired into the scene`);
  }
});

test("the owner's own lines are pinned to the words he wrote", () => {
  const every = script.BEATS.flatMap((beat) => beat.lines);
  /* Keyed by speaker AND words: Lou says the two oath lines and Tony repeats
   * them back, so the text alone names two different recordings. */
  const find = (who, text) => every.find((line) => line.speakerKey === who && line.say === text);
  const OWNED = [
    ['LOU', 'Stop. This one is good.'],
    ['LOU', 'Come forward.'],
    ['LOU', 'All of the men in this room are bound by blood. This is a family. And in this thing of ours, we follow a code of honor. There’s a way of life... a brotherhood.'],
    ['BOOSKIBRO', 'You are here because of your deeds and the assertions of those who stand at your side.'],
    ['BOOSKIBRO', 'You did what was asked. You kept your mouth shut. You handled yourself at the Bing. You flew the beef run. When it came time to stand up, you stood up.'],
    ['RIPPINFLOW', 'This life is one of secrecy. If you make a friend, meet a woman, live out there among regular people... they must not know about our thing.'],
    ['LOU', 'It is binding. It is not forgiving. To betray one is to betray all.'],
    ['LOU', 'Do you wish to commit yourself... your life... to this family?'],
    ['PROSPECT', 'Yes. I do.'],
    ['PROSPECT', 'No. I don’t.'],
    ['LOU', 'Then before the eyes of all here present... join me.'],
    ['LOU', 'To become a man of honor... repeat these words.'],
    ['LOU', 'I swear my loyalty to this family.'],
    ['LOU', 'My flesh must burn in hell like this saint if I do not keep my oath.'],
    ['LOU', 'From this day forward, your word is the word of this family. Your enemies are our enemies. Your loyalty is no longer yours alone — it belongs to all of us.'],
    ['LOU', 'Welcome.'],
    ['LOU', 'Tonight, you became one of us. That means something.'],
    ['LOU', 'It also means every move you make reflects on me... and on this family. So don’t embarrass us.'],
    ['LOU', 'And don’t think this means you get to relax. You still got work to do.'],
    ['BOOSKIBRO', 'Drink. Tonight you earned it.'],
    ['ERIC', 'Salud, kid.'],
    ['SNOW', 'You’re family now.'],
    ['IRISH', 'That’s it, brother.'],
    ['NUMBSKULL', 'He made it.'],
    ['SEFF', 'Salud!'],
  ];
  for (const [who, text] of OWNED) {
    const line = find(who, text);
    assert.ok(line, `the owner's line is gone from ${who}: "${text}"`);
    assert.equal(line.verbatim, true, `"${text}" is no longer marked verbatim`);
  }
  /* Tony repeats both oath lines back, word for word, and his takes are his
   * own cues. */
  for (const text of ['I swear my loyalty to this family.',
    'My flesh must burn in hell like this saint if I do not keep my oath.']) {
    const his = find('PROSPECT', text);
    assert.ok(his, `Tony does not repeat "${text}"`);
    assert.notEqual(his.cue, find('LOU', text).cue);
  }
  /* One `Welcome.` from each of them, mixed to land on the same frame. */
  const welcomes = script.beatById('IN-460').lines;
  assert.deepEqual(welcomes.map((line) => line.speakerKey), ['LOU', 'BOOSKIBRO']);
  assert.equal(welcomes[0].cue === welcomes[1].cue, false, 'it has to be two takes');
});

test('the reveal establishes the post-Palace canon before the nuclear option', () => {
  assert.deepEqual(script.beatById('IN-100').lines.map((line) => line.say), [
    'Willy wasn’t the rat.',
    'We killed the wrong man.',
    'Sauce was the rat. The palace proved that.',
    'It also proved he had help on the inside.',
    'There is one place left. We are at quota.',
    'We don’t put a question inside this family.',
    'Nuclear option.',
    'Kittenboss too?',
    "We'll see.",
    'She has to go too.',
  ]);
  assert.deepEqual(script.beatById('IN-110').lines.map((line) => line.say), [
    'All prospects. On your knees.',
    'Face forward.',
  ]);
  for (const retired of ['IN-140', 'IN-181', 'IN-182', 'IN-183', 'IN-184', 'IN-185']) {
    assert.equal(script.hasBeat(retired), false, `${retired} is still active`);
  }
});

test('every choice in the script leads somewhere that exists', () => {
  const withChoices = script.BEATS.filter((beat) => beat.choice);
  assert.ok(withChoices.length >= 3, 'the scene has lost its choices');
  for (const beat of withChoices) {
    assert.ok(beat.choice.options.length <= 3,
      `${beat.id} offers more options than initiation.html has buttons`);
    for (const option of beat.choice.options) {
      assert.ok(script.hasBeat(option.to), `${beat.id} → "${option.text}" leads to nothing`);
    }
    /* A choice either waits forever with a prompt on screen, or it resolves on
     * its own to a destination that exists. Nothing in between. */
    if (beat.choice.timeout === null) {
      assert.equal(beat.choice.fallback, null, `${beat.id} has a fallback it can never take`);
      assert.equal(beat.id, 'IN-370', 'only the oath question waits forever');
    } else {
      assert.ok(script.hasBeat(beat.choice.fallback),
        `${beat.id} times out into nothing`);
      assert.equal(beat.choice.options.some((option) => option.to === beat.choice.fallback), true,
        `${beat.id}'s timeout goes somewhere the player was never offered`);
    }
  }
});

test('the clearing is look-only and Lou has one live aside', () => {
  assert.equal(script.asideFor(false).id, 'IN-365-silent');
  assert.equal(script.asideFor(true).id, 'IN-365-silent');
  assert.deepEqual(script.asideFor(false).lines.map((line) => line.say),
    ['You didn’t say anything out there.', 'Good.']);
  assert.equal(script.hasBeat('IN-365-spoke'), false);
});

/* ══════════════════════════════════════════════════════════════════════ *
 * THE LESSONS THIS SCENE HAD TO OBEY
 * ══════════════════════════════════════════════════════════════════════ */

test('the scene plays its shots through the weapon layer and its lines through the speaker', () => {
  /* 5. WEAPON AUDIO. Never a raw gun cue: `playWeaponCue` applies the per-
   * weapon mix and a gunshot's falloff, and a pistol fired outdoors at night
   * behind a kneeling man is the loudest thing in this scene. */
  assert.equal(MAIN.includes('sfx.gunshot'), false, 'a raw synthesised gunshot is back');
  const shots = MAIN.match(/playWeaponCue\(audio, 'revolver', 'fire'/g) ?? [];
  assert.equal(shots.length, 2, 'the clearing and the cabin, and both positional');
  for (const call of MAIN.matchAll(/playWeaponCue\(audio, 'revolver', 'fire', \{([\s\S]{0,220}?)\}\);/g)) {
    assert.match(call[1], /position:/, 'a gunshot in this scene is always positional');
  }

  /* 4. SPATIAL AUDIO. Every line is glued to its speaker and carries the
   * gentler dialogue rolloff; a one-shot without `follow` freezes where the
   * speaker's mouth was on the first syllable.
   *
   * Through the SHARED path since 2026-08-20. This scene's `sayFrom()` and
   * its `DIALOGUE_MIX` were the only researched positional mix for speech in
   * the game, so they were hoisted into `src/core/dialogue.js` as `speak()`
   * and `SPEECH_MIX` and every other scene now gets them -- the heist had no
   * positional mix at all, which is why a robber at the far end of the lobby
   * was as loud as one on your shoulder. The rolloff assertion moves with
   * them; what it is guarding is the NUMBER, and the number did not change. */
  assert.match(MAIN, /speak\(audio, line\.cue, \{/);
  assert.match(MAIN, /speaker: body \?\? \(\(\) => player\.position\)/);
  assert.equal(staging.FALL_REACH, site.FALL_REACH);
  const dialogue = read('src/core/dialogue.js');
  assert.match(dialogue, /rolloff: 0\.7/);
  assert.match(MAIN, /audio\.updateListener\(camera\)/);
  assert.match(MAIN, /playFootstep\(audio,/);

  /* 2. HAND SOCKETS. The pistol, the staff, the blade and the card go in a
   * HAND, never on a forearm with a magic offset. */
  assert.equal(/^[^*/\n]*\.arm[LR]\.add\(/m.test(MAIN), false,
    'something is hung on a forearm again');
  assert.match(MAIN, /mountInitiationExecutionRevolver\(holder\.sq, gun\)/);
  assert.match(MAIN, /TABLE_SOCKETS\.knife\.hand/);
  assert.match(MAIN, /TABLE_SOCKETS\.card\.hand/);

  /* 1. FACING. Snapped once per frame from where the head actually is, with no
   * stored target yaw left behind to drag it back. */
  assert.equal(MAIN.includes('faceToward('), false, 'the chase-the-target helper is back');
  assert.match(MAIN, /faceAt\(m\.sq, tp\)/);
  /* And the arm goes FORWARD. R_x(+θ) sends a Person's local -y to local -z,
   * and a Person faces +z: the shipped scene's `+1.58` aimed over the
   * executioner's own shoulder. */
  assert.match(MAIN, /const AIM_PITCH_FRONTAL = -\d/);
  assert.match(MAIN, /const AIM_PITCH_NAPE = -\d/);
});

test('only the four sweep beats are allowed to fire', () => {
  assert.deepEqual(script.EXECUTION_BEATS.map((beat) => beat.id),
    ['IN-120', 'IN-130', 'IN-145', 'IN-150']);
  assert.equal(script.beatById('IN-160').fires, false);
  assert.deepEqual(script.beatById('IN-170').lines.map((line) => line.say), [
    'Stop. This one is good.',
    'Get Tony up.',
  ]);
  assert.equal(script.beatById('IN-170').lines[0].verbatim, true);
});

test('all five remaining prospects kneel before the first sweep shot', () => {
  assert.deepEqual(MASS_KNEEL.map((entry) => entry.victim), [
    'PROSPECT THREE', 'PROSPECT FOUR', 'PROSPECT FIVE', 'KITTENBOSS', 'PROSPECT TWO',
  ]);
  assert.equal(new Set(MASS_KNEEL.map((entry) => entry.victim)).size, 5);
  assert.equal(executions.executionRunOrder()[0].kind, 'mass_kneel');
  assert.equal(KNEELING_EXECUTIONS.some((step) => 'walker' in step || 'stepsOutEarly' in step), false);
});

test('every phase names a beat that exists somewhere', () => {
  /* Act One's beats are `dialogue.js`'s and are frozen — the shipped bank the
   * manifest already carries. Everything else is `script.js`'s. A phase naming
   * neither is a typo nobody would ever see. */
  const SHIPPED = new Set(['IN-010', 'IN-020', 'IN-040', 'IN-050', 'IN-070', 'IN-080', 'IN-085', 'IN-090']);
  for (const id of PHASE_IDS) {
    const beat = PHASES[id].beat;
    if (!beat) continue;
    assert.ok(script.hasBeat(beat) || SHIPPED.has(beat), `${id} names beat "${beat}", which is nowhere`);
  }
  /* And the phases that carry the executions' own beats agree with the run
   * order, so the words and the blocking are describing one night. */
  for (const step of KNEELING_EXECUTIONS) {
    assert.ok(script.hasBeat(step.beat), `${step.victim} has no beat`);
    assert.equal(script.beatById(step.beat).phase, 'execution_sweep');
  }
});

test('Gratin and Seff are never cruel, and never enjoy any of it', () => {
  /* The joke is that they are the two gentlest men in the game and this is why
   * they are the two doing it. Nothing in their behaviour may acknowledge it.
   * Every line either of them has is about logistics, footing, the weather, or
   * a piece of manners. */
  const theirs = script.BEATS
    .flatMap((beat) => beat.lines)
    .filter((line) => line.speakerKey === 'GRATIN' || line.speakerKey === 'SEFF');
  assert.ok(theirs.length >= 6, 'the executioners have lost their authored register');
  const BANNED = [
    'shut up', 'beg', 'please', 'scream', 'deserve', 'enjoy', 'fun',
    'kill', 'shoot', 'die', 'dead', 'body', 'blood', 'orders', 'nothing personal',
  ];
  for (const line of theirs) {
    const say = line.say.toLowerCase();
    for (const word of BANNED) {
      /* Whole words: "Nobody's eating it" is not a line about a body. */
      assert.equal(new RegExp(`\\b${word}\\b`).test(say), false,
        `${line.speakerKey}: "${line.say}" contains "${word}"`);
    }
    /* In the clearing and on the trail, neither of them ever raises his voice.
     * The exception is the room, where Seff toasts with everybody else — which
     * is the point of the whole gag and is the owner's own line. */
    const inTheRoom = script.beatById(line.beat).act === 6;
    if (!inTheRoom) {
      assert.equal(/!/.test(line.say), false, `${line.speakerKey} raises his voice: "${line.say}"`);
    }
  }
  /* And Gratin's line in the room is the one to protect: an hour after this he
   * is quietly upset that nobody is eating. */
  const food = script.beatById('IN-510').lines.find((line) => line.speakerKey === 'GRATIN');
  assert.equal(food.say, 'There’s food. Nobody’s eating it.');
});

test('the scene never winks, and the gesture that plays an animation is speaker-bound', () => {
  /* `gesture: 'slam'` used to play BOOSKIBRO's animation for any speaker who
   * was not Lou, which would have had Gratin swinging a founder's staff over a
   * kneeling man. The lookup is by speaker now and an unknown speaker gets
   * nothing at all. */
  assert.match(MAIN, /line\.who === 'BIG UNCLE LOU SPUTTHOLE' \? lou\s*\n\s*: line\.who === 'BOOSKIBRO' \? boosk : null/);
  assert.match(MAIN, /if \(owner\) \{/);
  /* No line in the rewrite carries a gesture at all. */
  assert.equal(script.BEATS.flatMap((beat) => beat.lines).some((line) => line.gesture), false);
});

test('the site is built once, by the cabin module, and main.js scatters nothing', () => {
  /* 3 of `cabin/index.js`'s integration contract: two forests interleave and
   * half of one moves on every reload, two ground planes z-fight, and a lit
   * stage with a purple banner on it forty feet from four people being shot in
   * the mud is the old scene's staging fighting this one. */
  assert.match(MAIN, /buildInitiationCabinSite\(\{ audio \}\)/);
  for (const gone of ['addTree', 'forestFits', 'PlaneGeometry(400, 400)', 'fireLight', 'anointLight']) {
    assert.equal(MAIN.includes(gone), false, `main.js still builds its own ${gone}`);
  }
  /* The three numbers site.js copies out of here still match. */
  assert.match(MAIN, /const LINE_Z = -8;/);
  assert.match(MAIN, /const PLAYER_SLOT = \{ x: -2\.2, z: LINE_Z \};/);
  assert.match(MAIN, /const PROSPECT_XS = \[-4\.4, 0, 2\.2, 4\.4\];/);
  assert.deepEqual([...site.PROSPECT_XS], [-4.4, 0, 2.2, 4.4]);
  assert.equal(site.LINE_Z, -8);
});

test('repeat after me is three lines, one of them his, and the other two get you shot', () => {
  /* THE OWNER'S ASK. Lou says a line, the room stops, and the prospect picks
   * what he says back. Wrong words and the man behind him fires.
   *
   * The correct option is read out of the beat, never typed again, so it can
   * never drift from the line Lou is recorded saying — which is the whole
   * mechanic: repeat what you just heard, word for word. */
  for (const beatId of ['IN-430', 'IN-435']) {
    const beat = script.beatById(beatId);
    const mine = beat.lines.filter((line) => line.who === 'PROSPECT');
    assert.equal(mine.length, 1, `${beatId} must have exactly one line to say back`);

    const options = oathChoices(beatId, mine[0].text);
    assert.equal(options.length, 3, `${beatId} offers three`);

    const right = options.filter((option) => option.correct);
    assert.equal(right.length, 1, `${beatId} has exactly one right answer`);
    assert.equal(right[0].text, mine[0].text,
      `${beatId}'s right answer must be the scripted line verbatim`);

    /* The wrong two are PARAPHRASES, not nonsense and not near-identical. A
     * player who listened can tell; one who did not cannot guess. Distinct
     * from the real line and from each other, and none of them a single word
     * away from it — "the family" against "this family" would be a coin toss
     * with a bullet on it. */
    const wrong = options.filter((option) => !option.correct);
    assert.equal(wrong.length, 2);
    assert.equal(new Set(options.map((o) => o.text)).size, 3, 'no two options read the same');
    for (const option of wrong) {
      assert.ok(option.text.length > 20, 'a wrong line is a real sentence');
      assert.notEqual(option.text, mine[0].text);
    }
    for (const option of options) {
      assert.equal(option.who, 'PROSPECT');
      assert.ok(option.cue, 'every option is a real cue, so it can be recorded');
    }
  }
});
