import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CabinExecutionChoice,
  EXECUTION_CHOICE_SECONDS,
  GRATIN_AIM_SECONDS,
  GRATIN_RECOVER_SECONDS,
  createCabinGratinExecutionStaging,
} from '../src/cabin/execution-choice.js';

test('Cabin execution choice gives exactly ten simulation seconds', () => {
  const outcomes = [];
  const choice = new CabinExecutionChoice({
    onResolve: (result, reason) => outcomes.push({ result, reason }),
  });
  choice.open();
  choice.update(EXECUTION_CHOICE_SECONDS - 0.01);
  assert.equal(choice.active, true);
  choice.update(0.01);
  assert.equal(choice.active, false);
  assert.deepEqual(outcomes, [{ result: 'gratin', reason: 'timeout' }]);
});

test('yes selects Tony and no selects Gratin exactly once', () => {
  const outcomes = [];
  const yes = new CabinExecutionChoice({
    onResolve: (result, reason) => outcomes.push({ result, reason }),
  });
  yes.open();
  assert.equal(yes.handleKey('Digit1'), true);
  assert.equal(yes.handleKey('Digit2'), false);
  assert.deepEqual(outcomes, [{ result: 'player', reason: 'player' }]);

  const no = new CabinExecutionChoice({
    onResolve: (result, reason) => outcomes.push({ result, reason }),
  });
  no.open();
  assert.equal(no.handleKey('Numpad2'), true);
  assert.deepEqual(outcomes.at(-1), { result: 'gratin', reason: 'player' });
});

/* ------------------------------------------------------------------ */
/* Gratin actually faces the man he is shooting                        */
/* ------------------------------------------------------------------ */

/** A stand-in for the dungeon Npc: just the fields the staging writes. */
function fakeGratin(yaw = 1.1671) {
  const euler = () => {
    const r = { x: 0, y: 0, z: 0 };
    r.set = (x, y, z) => { r.x = x; r.y = y; r.z = z; };
    return r;
  };
  return {
    group: { position: { x: 0.42, y: -5.05, z: 12.92 }, rotation: { x: 0, y: yaw, z: 0 } },
    parts: { armR: { rotation: euler() }, foreR: { rotation: euler() }, armL: { rotation: euler() }, foreL: { rotation: euler() } },
    targetYaw: 2.5,
  };
}

const degrees = (radians) => (radians * 180) / Math.PI;
const settle = (staging, seconds) => {
  for (let t = 0; t < seconds; t += 0.05) staging.update(0.05);
};

test('Gratin turns onto each victim inside the authored aim window', () => {
  const actor = fakeGratin();
  const staging = createCabinGratinExecutionStaging({ actor });
  staging.markHome(actor.group.rotation.y);

  // The two authored head positions, measured in the built dungeon with the
  // restraint poses running.
  const baiter = { x: -3.14, y: -4.18, z: 14.83 };
  const ateam = { x: 3.65, y: -3.98, z: 13.89 };

  assert.equal(staging.aimAt(baiter), true);
  const opening = staging.snapshot();
  assert.ok(opening.turnedDegrees > 130 && opening.turnedDegrees < 145,
    `the baiter is behind his left shoulder, not in front of him: ${opening.turnedDegrees}`);
  // A snap from anything else must not drag him back through the turn.
  assert.equal(actor.targetYaw, undefined);

  settle(staging, GRATIN_AIM_SECONDS);
  const onBaiter = staging.snapshot();
  assert.ok(onBaiter.offByDegrees < 0.5, `off the baiter by ${onBaiter.offByDegrees} deg`);
  assert.ok(onBaiter.present > 0.98, 'the pistol is up before the round leaves it');
  assert.ok(staging.settled(), 'settled() must agree with the reading');
  // Down at a man hanging from the beam, not level.
  assert.ok(onBaiter.elevationDegrees < -4 && onBaiter.elevationDegrees > -20,
    `baiter elevation ${onBaiter.elevationDegrees}`);

  assert.equal(staging.fire(), true);
  assert.equal(staging.snapshot().kick, 1);

  assert.equal(staging.aimAt(ateam), true);
  const swing = staging.snapshot();
  assert.ok(swing.turnedDegrees > 128 && swing.turnedDegrees < 142,
    `and the A-Team man is behind the other shoulder: ${swing.turnedDegrees}`);
  settle(staging, GRATIN_AIM_SECONDS);
  const onAteam = staging.snapshot();
  assert.ok(onAteam.offByDegrees < 0.5, `off the A-Team man by ${onAteam.offByDegrees} deg`);

  // Nobody is left aiming at a body: he squares back up on his own heading.
  assert.equal(staging.release(), true);
  settle(staging, GRATIN_AIM_SECONDS + GRATIN_RECOVER_SECONDS);
  const done = staging.snapshot();
  assert.equal(done.aiming, false);
  assert.ok(Math.abs(degrees(done.yaw) - degrees(done.homeYaw)) < 0.5,
    `back on his heading, got ${degrees(done.yaw)} vs ${degrees(done.homeYaw)}`);
  assert.ok(done.present < 0.02, 'and the gun is down');
});

test('the aim solves for the muzzle, not for the middle of his chest', () => {
  const actor = fakeGratin();
  const staging = createCabinGratinExecutionStaging({ actor });
  const baiter = { x: -3.14, y: -4.18, z: 14.83 };
  staging.aimAt(baiter);
  const chestBearing = Math.atan2(
    baiter.x - actor.group.position.x,
    baiter.z - actor.group.position.z,
  );
  const solved = staging.snapshot().targetYaw;
  const correction = Math.abs(degrees(solved - chestBearing));
  /* The 9 mm rides 0.345 m right of his centre line and its bore leaves 4.31
   * degrees right of his heading, so squaring his chest at the man left the
   * round 10.2 degrees wide. */
  assert.ok(correction > 6 && correction < 14,
    `expected a real muzzle correction, got ${correction} deg`);
});

test('a staging with no actor is inert rather than throwing', () => {
  const staging = createCabinGratinExecutionStaging({});
  assert.equal(staging.aimAt({ x: 1, y: 0, z: 1 }), false);
  assert.equal(staging.fire(), false);
  assert.equal(staging.release(), false);
  assert.equal(staging.update(0.1).aiming, false);
});
