/**
 * THE REAL LAB HAS TO ANSWER TO THE CONTRACT IT PUBLISHES.
 *
 * `src/mansion/mission/contract-lab.js` calls itself "the written form of the
 * contract" and says: *"If the real lab and this file disagree, one of them is
 * wrong, and which one is a conversation rather than a mystery."* Nothing
 * checked. They disagreed on three names for eleven days, and it was a
 * mystery.
 *
 *   contract        real lab      what the mission does with it
 *   ---------       ----------    ------------------------------------------
 *   stepOut()       leaveLab()    Beat 7 — Aubbie walks out through the glass
 *   tryHandle()     tryDoor()     Beat 8 — Bezmenov's silent handle-try
 *   slam()          pound()       Beat 10 — fists on the glass
 *
 * `SilentSquatchMission` calls all three as `body?.method?.()`, which is
 * correct defensive style and is exactly what hid this: an optional call to a
 * method that does not exist is a no-op with no error, no warning and no
 * failing test — because `silent-squatch-mission.test.mjs` drives the DOUBLE,
 * and the double had all three.
 *
 * The consequence was not cosmetic. Aubbie never left the sealed lab, so
 * "Eliminate Aubbie" was an order to shoot a man twelve metres away behind
 * twelve centimetres of glass, and `mount.js`'s fallback aim is a five-degree
 * cone around `body.position` — which is a figure's ORIGIN, i.e. the floor
 * between his feet. That is the softlock the owner hit.
 *
 * So this file builds the REAL lab, headless, and asserts the surface. It is
 * docs/ENGINE-TRAPS.md #5 in a sentence: the double is not the thing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim } from '../tools/three-shim.mjs';

/* The lab bakes canvas textures at module load — the monitors, the life-signs
 * readout, the radiation trefoils. One shared stub, installed before the
 * import, for the reason `ensureDomShim` gives: a per-file `??=` stub only
 * wins if this happens to be the first file in `tests/run.mjs` to declare one,
 * and it is not. */
ensureDomShim();

const { buildSilentSquatch, GLASS_WALL, SEALED_LAB } = await import('../src/mansion/scenes/SilentSquatch.js');
const { createContractLab } = await import('../src/mansion/mission/contract-lab.js');

/** Build it once — it is ~200 ms and ~15 MB, and nothing here mutates shared state. */
function realLab() {
  const built = buildSilentSquatch();
  return built.lab;
}

/** Every method the contract's own scientist publishes. */
function contractScientistMethods() {
  const one = createContractLab().scientists[0];
  return Object.keys(one).filter((k) => typeof one[k] === 'function').sort();
}

test('the real lab implements every method the contract publishes for a scientist', () => {
  const missing = [];
  const lab = realLab();
  for (const body of lab.scientists) {
    for (const method of contractScientistMethods()) {
      if (typeof body[method] !== 'function') missing.push(`scientists[${body.index}].${method}`);
    }
  }
  assert.deepEqual(missing, [],
    'the mission calls these through `?.()`, so a missing one is a silent no-op');
});

test('the real lab implements the contract at the top level too', () => {
  const contract = createContractLab();
  const lab = realLab();
  const missing = [];
  for (const key of ['openDoor', 'closeDoor', 'lockDoor']) {
    if (typeof lab[key] !== 'function') missing.push(`lab.${key}`);
  }
  for (const key of ['arm', 'enter']) {
    if (typeof lab.keypad?.[key] !== 'function') missing.push(`lab.keypad.${key}`);
  }
  if (typeof lab.transferDrawer?.send !== 'function') missing.push('lab.transferDrawer.send');
  for (const key of ['begin', 'complete']) {
    if (typeof lab.core?.[key] !== 'function') missing.push(`lab.core.${key}`);
  }
  if (typeof lab.monitors?.setPurple !== 'function') missing.push('lab.monitors.setPurple');
  if (typeof lab.gas?.start !== 'function') missing.push('lab.gas.start');
  for (const key of ['open', 'close']) {
    if (typeof lab.hiddenWall?.[key] !== 'function') missing.push(`lab.hiddenWall.${key}`);
  }
  assert.deepEqual(missing, []);
  /* And the same six people, so an index the mission uses by name (Aubbie is
   * 0, Bezmenov is 3) means the same man in both worlds. */
  assert.equal(lab.scientists.length, contract.scientists.length);
});

test('THE SOFTLOCK: stepOut walks Aubbie out of the sealed lab, not just a flag', () => {
  const built = buildSilentSquatch();
  const aubbie = built.lab.scientists[0];

  /* He starts at the core, well inside the sealed half. */
  assert.ok(aubbie.position.z < SEALED_LAB.z1, 'Aubbie does not start inside the lab');
  assert.equal(aubbie.inside, true);

  aubbie.stepOut();
  /* Fifteen seconds of simulated walking — generous, because the assertion is
   * "did he arrive", not "how fast". See docs/ENGINE-TRAPS.md #2 and #5. */
  for (let i = 0; i < 60 * 15; i++) built.update(1 / 60, { position: { x: 0, y: 0, z: 0 } });

  assert.equal(aubbie.inside, false, 'the lab still thinks he is behind the glass');
  assert.ok(
    aubbie.position.z > GLASS_WALL.z1,
    `Aubbie stopped at z ${aubbie.position.z.toFixed(2)}, still on the lab side of the glass`,
  );
  /* And he is out in the open in front of the pane, not wedged in the door
   * pocket — the brief wants his body to fall "in full view of the
   * scientists through the glass". */
  assert.ok(aubbie.position.z > GLASS_WALL.z1 + 1.0);
});

test('the execution has a body to aim at, so it never falls back to the cone', () => {
  const lab = realLab();
  /* `mission/mount.js` prefers `lab.aubbieTarget`, then `body.object`. With
   * neither it aims a five-degree cone at `body.position`, which is the floor
   * between his feet. Both are published now; this is the assertion that
   * stops them being quietly dropped. */
  assert.ok(lab.aubbieTarget, 'the lab publishes nothing for the shot to hit');
  assert.equal(lab.aubbieTarget, lab.scientists[0].object);
  assert.ok(typeof lab.aubbieTarget.traverse === 'function', 'that is not a scene object');
});

test('Bezmenov tries the handle where the handle is, and does it silently', () => {
  const built = buildSilentSquatch();
  const bezmenov = built.lab.scientists[3];
  const before = bezmenov.position.clone();

  bezmenov.tryHandle();
  for (let i = 0; i < 60 * 12; i++) built.update(1 / 60, { position: { x: 0, y: 0, z: 0 } });

  assert.notDeepEqual(
    [bezmenov.position.x, bezmenov.position.z], [before.x, before.z],
    'he never left his bench',
  );
  /* At the door, on the inside. He does not get through it — that is the
   * point of the beat. */
  assert.ok(bezmenov.position.z < GLASS_WALL.z0, 'he walked through the glass');
  assert.ok(bezmenov.position.z > SEALED_LAB.z1 - 1.2, 'he did not reach the door');
  assert.equal(bezmenov.inside, true);

  /* Then he stops and stares, which is the other half of his part. */
  bezmenov.stare();
  assert.equal(bezmenov.stage, 'staring');
});

test('the six of them are doing something at their benches before the gas', () => {
  const built = buildSilentSquatch();
  const bodies = built.lab.scientists;
  for (const body of bodies) assert.equal(body.stage, 'work');

  /* Nobody is mid-gesture on frame one, and after a minute of the room
   * running, gestures have been played. Measured as "did an arm ever leave
   * its rest angle", because the work loop is deliberately mostly PAUSES —
   * asserting that everybody is gesturing at any one instant would be
   * asserting the bug this replaced. */
  const moved = new Set();
  for (let i = 0; i < 60 * 60; i++) {
    built.update(1 / 60, { position: { x: 0, y: 0, z: 0 } });
    for (const body of bodies) if (body.fig.gestureT > 0) moved.add(body.index);
  }
  assert.equal(moved.size, bodies.length,
    'somebody stood at a laboratory bench for a minute without moving');
});
