/**
 * LIL TOM CRUZE'S ROUTE, AGAINST THE STAIR HE ACTUALLY WALKS.
 *
 * `src/mansion/dog.js` was written before the third floor existed, with a
 * plausible six-point route and a note saying a `MasterSuite.js` would
 * re-export it "so the two can never drift". That file never arrived and the
 * route stayed a guess; the suite exists now and the route is measured off it.
 *
 * This is the contract test that keeps them together. It is here rather than
 * in a comment because his walker LERPS `y` between consecutive waypoints: a
 * point 0.4 m short of a flight's top tread puts him 0.35 m under the stone
 * for the whole leg, and nothing in the game says so. The rule the file below
 * enforces is exactly that — every leg that crosses a flight starts and ends
 * on that flight's own published z, and every height in the list is one of the
 * three floors the house actually has.
 *
 * `src/mansion/scenes/MansionInterior.js` builds canvas textures at module
 * scope, so this file needs the DOM shim `tests/run.mjs` installs before it
 * imports anything — the same arrangement `tests/mansion-siege-people.test.mjs`
 * uses. Running it on its own with plain `node --test` will not work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

await ensureDomShim();
await ensureThreeShim();

const { LIL_TOM_ROUTE, DOG_SHOULDER_HEIGHT } = await import('../src/mansion/dog.js');
const {
  MASTER_SUITE, SUITE_Y, SUITE_STAIR_HALL, SUITE_STAIR_LANDING_Y,
  SUITE_FLIGHT_A, SUITE_FLIGHT_B, SUITE_HALF_LANDING, SUITE_SECRET_DOOR,
} = await import('../src/mansion/scenes/MansionInterior.js');
const { UPPER_Y } = await import('../src/mansion/scenes/MansionGrounds.js');

const inRect = (r, p, pad = 0) => p.x >= r.x0 - pad && p.x <= r.x1 + pad
  && p.z >= r.z0 - pad && p.z <= r.z1 + pad;

test('every height on the dog’s route is one of the three floors the house has', () => {
  const floors = [UPPER_Y, SUITE_STAIR_LANDING_Y, SUITE_Y];
  const strays = LIL_TOM_ROUTE
    .map((p, i) => ({ i, y: p.y }))
    .filter(({ y }) => !floors.some((f) => Math.abs(f - y) < 1e-6));
  assert.deepEqual(strays, [], `route heights must be one of ${floors.join(', ')}`);
});

test('he starts on his cushion in the suite, with the longest wait in the list', () => {
  const first = LIL_TOM_ROUTE[0];
  assert.equal(first.y, SUITE_Y);
  assert.ok(inRect(MASTER_SUITE, first), 'the first waypoint is inside the suite');
  const longest = Math.max(...LIL_TOM_ROUTE.map((p) => p.wait ?? 0));
  assert.equal(first.wait, longest, 'his cushion holds him longer than anywhere else');
  assert.ok(first.wait >= 10, 'long enough that the player meets a dog lying down');
});

test('he ends up in Lou’s office, on the office floor', () => {
  const last = LIL_TOM_ROUTE[LIL_TOM_ROUTE.length - 1];
  assert.equal(last.y, UPPER_Y);
  assert.ok(last.z > 63.15 && last.z < 75 && Math.abs(last.x) < 8.85);
  assert.ok((last.wait ?? 0) >= 8, 'and he stays a while when he gets there');
});

/**
 * THE LEGS THAT CROSS A FLIGHT ARE THE WHOLE POINT.
 *
 * `mountLilTomCruze`'s update lerps y linearly between waypoints, so a leg
 * that changes height has to start and end exactly where the flight does.
 * Both flights run along z at a fixed x, so each such leg is checked against
 * the flight's own z0/z1 and its own two floor heights.
 */
test('each climbing leg starts and ends on its flight’s own published ends', () => {
  const legs = [];
  for (let i = 0; i < LIL_TOM_ROUTE.length - 1; i++) {
    const a = LIL_TOM_ROUTE[i];
    const b = LIL_TOM_ROUTE[i + 1];
    if (Math.abs(a.y - b.y) > 1e-6) legs.push({ i, a, b });
  }
  assert.equal(legs.length, 2, 'exactly two legs change height: one flight each');

  for (const { i, a, b } of legs) {
    const hi = a.y > b.y ? a : b;
    const lo = a.y > b.y ? b : a;
    const flight = inRect(SUITE_FLIGHT_A, a, 0.06) ? SUITE_FLIGHT_A : SUITE_FLIGHT_B;
    const zEnds = [flight.z0, flight.z1];
    assert.ok(
      zEnds.some((z) => Math.abs(z - a.z) < 1e-6) && zEnds.some((z) => Math.abs(z - b.z) < 1e-6),
      `leg ${i} must run between the flight's own z ends ${zEnds.join('..')}, got ${a.z} -> ${b.z}`,
    );
    assert.ok(
      Math.abs(a.x - b.x) < 0.05,
      `leg ${i} must stay on one flight's x line, got ${a.x} -> ${b.x}`,
    );
    if (flight === SUITE_FLIGHT_A) {
      assert.equal(lo.y, UPPER_Y);
      assert.equal(hi.y, SUITE_STAIR_LANDING_Y);
    } else {
      assert.equal(lo.y, SUITE_STAIR_LANDING_Y);
      assert.equal(hi.y, SUITE_Y);
    }
    assert.ok(
      a.x > flight.x0 - 0.06 && a.x < flight.x1 + 0.06,
      `leg ${i} must be inside its flight in x`,
    );
  }
});

test('the half-landing waypoint is on the half-landing, at its height', () => {
  const landing = LIL_TOM_ROUTE.filter((p) => Math.abs(p.y - SUITE_STAIR_LANDING_Y) < 1e-6
    && inRect(SUITE_HALF_LANDING, p, 0.12));
  assert.ok(landing.length >= 1, 'he turns on the landing rather than in mid-air');
});

test('he goes through the bookcase rather than through the wall beside it', () => {
  /* THE WALL IS ONLY A WALL ON THE OFFICE FLOOR. The hall's west wall stops
   * at the roof slab and the suite's floor runs clean over its head, so a leg
   * that crosses x = 6.55 up at SUITE_Y is crossing open floor and is fine.
   * The one that crosses it at UPPER_Y has to go through the door's opening,
   * or the dog is walking through 200 kg of oak -- which is the thing his
   * `enabled` gate exists to prevent in the first place. */
  let doorCrossings = 0;
  for (let i = 0; i < LIL_TOM_ROUTE.length - 1; i++) {
    const a = LIL_TOM_ROUTE[i];
    const b = LIL_TOM_ROUTE[i + 1];
    const wall = SUITE_STAIR_HALL.x0;
    if ((a.x - wall) * (b.x - wall) >= 0) continue;
    if (a.y !== UPPER_Y || b.y !== UPPER_Y) continue;   // over the wall head
    doorCrossings += 1;
    const t = (wall - a.x) / (b.x - a.x);
    const z = a.z + (b.z - a.z) * t;
    assert.ok(
      z > SUITE_SECRET_DOOR.z0 + 0.1 && z < SUITE_SECRET_DOOR.z1 - 0.1,
      `he crosses the wall at z ${z.toFixed(2)}, outside the door (${SUITE_SECRET_DOOR.z0}..${SUITE_SECRET_DOOR.z1})`,
    );
  }
  assert.equal(doorCrossings, 1, 'exactly one leg goes through the doorway');
});

test('he is a dog-sized dog, and the suite has headroom for him', () => {
  assert.ok(DOG_SHOULDER_HEIGHT > 0.55 && DOG_SHOULDER_HEIGHT < 0.7);
  assert.ok(SUITE_Y > UPPER_Y + 4.0, 'the third floor really is a storey above the office');
});
