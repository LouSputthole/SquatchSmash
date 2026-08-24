import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { AabbCombatSpace } from '../src/core/combat/spatial.js';
import { buildMotel } from '../src/motel/level.js';
import { MOTEL_REINFORCEMENT_STAGES } from '../src/motel/runtime-geometry.js';

/* ===========================================================================
 * THE MOTEL SHOOTING THROUGH ITS OWN WALLS
 *
 * Owner, on the Jerky Motel: "Also you start getting shot thro walls I think
 * as well."
 *
 * He was, and the reason was that this scene answered "is there anything
 * between these two points" by marching ten evenly spaced points down the
 * segment and asking whether any of them had landed inside a blocker. Motel
 * walls are 0.3 m thick. Ten samples over a fifteen-metre engagement sit
 * 1.5 m apart. The wall was not hit; it was stepped over.
 *
 * These tests exist because that failure is RANGE-DEPENDENT, which is the
 * property that let it survive: the same wall, the same two rooms, the same
 * geometry, and the shot is stopped at ten metres and goes through at
 * twenty-five. Anyone who checked this by standing on the walkway and firing
 * at the door would have seen it work. `theTenSampleMarch` below is the exact
 * code that shipped, kept here so the test can show what it did rather than
 * describe it, and so nobody is tempted to "fix" this by raising `steps`.
 * ======================================================================== */

/** Eye height for both ends of a shot: `main.js` fires from `y + 1.5`. */
const EYE = 1.5;

/**
 * The player behind the mattress in the back corner of room twelve. Not an
 * arbitrary point -- `main.js` prices `S.mattressCover` at exactly
 * `Math.hypot(pos.x + 1.9, pos.z + 12.6) < 2.5`, so this is the spot the scene
 * itself expects a man to be taking fire in.
 */
const MATTRESS_COVER = Object.freeze({ x: -1.9, y: EYE, z: -12.6 });

function installCanvasDocument() {
  const previous = globalThis.document;
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 0,
            font: '',
            textAlign: '',
            textBaseline: '',
            fillRect() {},
            strokeRect() {},
            fillText() {},
          };
        },
      };
    },
  };
  return () => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  };
}

/**
 * Build the real level headlessly, in the state a firefight happens in.
 *
 * The front door is opened because every shot in this mission is fired after
 * `openDoor(refs.frontDoor)` has run on the knock; leaving the leaf shut would
 * let the door collider stand in for the wall and hide the thing under test.
 */
function buildLevel() {
  const restore = installCanvasDocument();
  try {
    const level = buildMotel(new THREE.Scene(), null);
    level.refs.frontDoor.collider.enabled = false;
    return level;
  } finally {
    restore();
  }
}

const level = buildLevel();
const { colliders } = level;

function range(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function eye(x, z, y = EYE) {
  return { x, y, z };
}

/**
 * The point march this scene used to ship, verbatim from the old
 * `src/motel/main.js` -- ten samples, the two skipped furniture tags, and the
 * 0.25 m box inflation it used to try to give itself a bigger target. Kept so
 * the tests below can assert what it actually did.
 */
function theTenSampleMarch(from, to) {
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = THREE.MathUtils.lerp(from.x, to.x, t);
    const z = THREE.MathUtils.lerp(from.z, to.z, t);
    const y = THREE.MathUtils.lerp(from.y, to.y, t);
    for (const c of colliders) {
      if (!c.enabled || c.tag === 'bed' || c.tag === 'table') continue;
      if (y <= c.y0 || y >= c.y1) continue;
      if (x > c.x0 - 0.25 && x < c.x1 + 0.25 && z > c.z0 - 0.25 && z < c.z1 + 0.25) return t;
    }
  }
  return 1;
}

/** The gate every caller in `main.js` applies to the returned fraction. */
function shotReachesTarget(from, to) {
  return level.segmentBlocked(from, to) >= 0.95;
}

/**
 * Room twelve is not a sealed box, and a test that pretended otherwise would
 * be wrong about the level rather than about the bug. The front wall has two
 * holes in it, both authored in `level.js`: the doorway at x -1.1..1.0 under
 * a 2.7 m header, and the front window at x 2.0..4.0 between 1.1 and 2.6 m.
 * A bullet through either of those is a bullet through an opening, which is
 * the game working.
 *
 * Returns 'door', 'window', or null for a line that crosses the front wall
 * plane in solid stucco (or does not cross it at all).
 */
function frontWallAperture(from, to) {
  const PLANE_Z = -4.35;   // the middle of the 0.3 m panel band, -4.5..-4.2
  if ((from.z > PLANE_Z) === (to.z > PLANE_Z)) return null;
  const t = (PLANE_Z - from.z) / (to.z - from.z);
  const x = from.x + t * (to.x - from.x);
  const y = from.y + t * (to.y - from.y);
  if (x > -1.1 && x < 1.0 && y > 0 && y < 2.7) return 'door';
  if (x > 2.0 && x < 4.0 && y > 1.1 && y < 2.6) return 'window';
  return null;
}

test('the walls this bug is about really are 0.3 m thick', () => {
  const frontOfRoomTwelve = colliders.filter((c) => (
    c.tag === 'wall' && c.z0 === -4.5 && c.z1 === -4.2
  ));
  assert.ok(frontOfRoomTwelve.length >= 6, 'room twelve has a modelled front wall');
  for (const c of frontOfRoomTwelve) {
    assert.equal(Number((c.z1 - c.z0).toFixed(3)), 0.3, `${c.name} is a 0.3 m panel`);
  }

  /* Ten samples over these ranges is the arithmetic the bug is made of. A
   * panel narrower than the spacing can always fall between two samples. */
  for (const shotRange of [12.8, 24.9, 33.2]) {
    assert.ok(shotRange / 10 > 0.3,
      `at ${shotRange} m the old march stepped ${(shotRange / 10).toFixed(2)} m at a time`);
  }
});

test('every blocker presents the Box3 view the shared slab test reads', () => {
  assert.ok(colliders.length > 100);
  for (const c of colliders) {
    assert.ok(c.min && c.max, `${c.name} has no Box3 view`);
    assert.deepEqual(
      [c.min.x, c.min.y, c.min.z],
      [c.x0, Math.min(c.y0, c.y1), c.z0],
      `${c.name} min disagrees with its scalars`,
    );
    assert.deepEqual(
      [c.max.x, c.max.y, c.max.z],
      [c.x1, Math.max(c.y0, c.y1), c.z1],
      `${c.name} max disagrees with its scalars`,
    );
  }
});

test('a shot from the lot into room twelve is stopped at every range', () => {
  /* Three firing positions in the open lot, all with the solid west half of
   * room twelve's front wall between them and the man behind the mattress.
   * The ranges are the point: 12.8 m is across the lot, 33.2 m is from the
   * road end of it, and the wall is the same 0.3 m of stucco in both cases. */
  const posts = [
    ['near lot, across the parked cars', eye(-4, 0)],
    ['mid lot', eye(-6, 12)],
    ['the far end of the lot, by the road', eye(-8, 20)],
  ];

  for (const [label, from] of posts) {
    const shotRange = range(from, MATTRESS_COVER);
    const contact = level.sightContact(from, MATTRESS_COVER);
    assert.ok(contact, `${label} (${shotRange.toFixed(1)} m) has no blocker at all`);
    assert.equal(contact.box.tag, 'wall',
      `${label} (${shotRange.toFixed(1)} m) is stopped by ${contact.box.name}`);
    assert.ok(!shotReachesTarget(from, MATTRESS_COVER),
      `${label} (${shotRange.toFixed(1)} m) still reaches the player`);
  }

  /* The long one is the one that matters, and it is the one that used to
   * work: this is the assertion a short-range-only test would never have
   * made. */
  const longPost = posts[2][1];
  assert.ok(range(longPost, MATTRESS_COVER) > 30);
});

test('the ten-sample march went through the wall, and only at range', () => {
  /* Short range: the samples are close enough together that one of them lands
   * in the panel, so the old test looked correct. This is why the bug lived. */
  const close = eye(-3.4, -2);
  assert.ok(range(close, MATTRESS_COVER) < 11);
  assert.ok(theTenSampleMarch(close, MATTRESS_COVER) < 0.95,
    'the old march did stop a shot fired from just outside the door');

  /* Long range: the same wall, the same direction, and the round walks
   * straight through the front of the building. */
  let tunnelled = 0;
  let sampled = 0;
  for (let x = -20; x <= 26; x += 2) {
    for (let z = 0; z <= 20; z += 4) {
      const from = eye(x, z);
      sampled += 1;
      if (theTenSampleMarch(from, MATTRESS_COVER) >= 0.95
        && level.segmentBlocked(from, MATTRESS_COVER) < 0.95) tunnelled += 1;
    }
  }
  assert.ok(tunnelled >= 20,
    `only ${tunnelled} of ${sampled} lot positions tunnelled; the reproduction has drifted`);

  /* And nowhere in the lot is there still a way through the SHELL. A line is
   * allowed to reach the man behind the mattress only by going through the
   * doorway or the front window, which is what a doorway and a window are
   * for. Anything else has to be stopped. */
  for (let x = -20; x <= 26; x += 2) {
    for (let z = 0; z <= 20; z += 4) {
      const from = eye(x, z);
      if (!shotReachesTarget(from, MATTRESS_COVER)) continue;
      assert.ok(frontWallAperture(from, MATTRESS_COVER),
        `(${x}, ${z}) reaches the mattress corner through solid wall`);
    }
  }
});

test('the authored reinforcement posts cannot shoot into the room they are running at', () => {
  /* The three men who arrive when the deal goes wrong, at the exact corners of
   * the lot `runtime-geometry.js` stands them on. They are 27-35 m out, which
   * is the range band the old march was blindest in. */
  for (const post of MOTEL_REINFORCEMENT_STAGES) {
    const from = eye(post.x, post.z);
    for (const target of [MATTRESS_COVER, eye(0.6, -6.4), eye(3.2, -13.6)]) {
      assert.ok(range(from, target) > 20, `${post.id} is a long-range post`);
      if (!shotReachesTarget(from, target)) continue;
      /* The one line that survives is `reinforcement-pistol` at (16, 16) to
       * the mattress corner, and it survives because it goes through room
       * twelve's front window at eye height. That is a man shooting through a
       * window, not through a wall, and the old march let him do it from
       * everywhere. */
      assert.equal(frontWallAperture(from, target), 'window',
        `${post.id} at (${post.x}, ${post.z}) shoots into room twelve through the shell`);
    }
  }
});

test('the room-twelve fight is still winnable from inside the room', () => {
  /* A sight-line test that blocks too much fails just as badly as one that
   * blocks too little: if the room's own fittings became cover, nobody in room
   * twelve could shoot anybody and the scene would simply stop. These are the
   * lines the deal and the fight are actually made of.
   *
   * Note the second one: the old march BLOCKED it, on the 0.25 m inflation it
   * gave every box. The point march was wrong in both directions. */
  const clear = [
    ['Chino across the deal table', eye(-1.2, -7.8), eye(0.6, -6.4)],
    ['Chino at the man behind the mattress', eye(-1.2, -7.8), MATTRESS_COVER],
    ['Rico in the doorway at the deal table', eye(0, -4.9), eye(0.6, -6.4)],
    ['corner to corner of room twelve', eye(-4.4, -5.2), eye(0.9, -14.8)],
  ];
  for (const [label, from, to] of clear) {
    assert.ok(shotReachesTarget(from, to),
      `${label} is blocked: ${JSON.stringify(level.sightContact(from, to)?.box?.name)}`);
  }

  /* And the walls INSIDE the room still work -- the bathroom is cover. */
  assert.ok(!shotReachesTarget(eye(-1.2, -7.8), eye(3.2, -13.6)),
    'the bathroom wall no longer stops a shot from the room');
});

test('the bed and the table are furniture below every sight line, not cover', () => {
  const furniture = colliders.filter((c) => c.tag === 'bed' || c.tag === 'table');
  assert.equal(furniture.length, 3, 'two beds and one deal table');
  for (const c of furniture) {
    assert.ok(c.y1 <= 0.9,
      `${c.name} tops out at ${c.y1} m and would now be on an eye-height line`);
    assert.ok(c.y1 < EYE);
  }

  /* Which is the whole argument for leaving them skipped, and it is checkable
   * rather than a matter of taste: run the slab test over the room with the
   * two tags NOT skipped, across every eye-height line between the room's
   * corners, and neither box is ever on one. Promoting them to blockers would
   * change no shot in this mission -- what it would change is the three deal
   * prompts that rest on the table's own surface. */
  const everythingBlocks = new AabbCombatSpace({});
  const R = level.rects.ROOM12;
  let lines = 0;
  for (let ax = R.x0 + 0.6; ax < R.x1; ax += 1.1) {
    for (let az = R.z0 + 0.6; az < R.z1; az += 1.1) {
      for (let bx = R.x0 + 0.6; bx < R.x1; bx += 1.1) {
        for (let bz = R.z0 + 0.6; bz < R.z1; bz += 1.1) {
          if (ax === bx && az === bz) continue;
          lines += 1;
          const contacts = everythingBlocks.traceAll(eye(ax, az), eye(bx, bz), {
            boxes: colliders,
            ignore: (c) => c.enabled === false,
          });
          for (const contact of contacts) {
            assert.ok(contact.box.tag !== 'bed' && contact.box.tag !== 'table',
              `${contact.box.name} is on an eye-height line from `
              + `(${ax.toFixed(1)}, ${az.toFixed(1)}) to (${bx.toFixed(1)}, ${bz.toFixed(1)})`);
          }
        }
      }
    }
  }
  assert.ok(lines > 1000, `only ${lines} lines sampled`);
});

test('no vertical engagement exists, which is why the ceilings need no blocker', () => {
  /* The room ceilings are meshes with no collider. That is only safe because
   * nothing can get above them, and this is the measurement that says so. If
   * someone opens the upstairs rooms up, this test is where it comes apart --
   * and then the ceilings need blockers. See the note in `level.js`. */
  const insideRoomTwelve = [eye(0, -6), eye(0, -10), eye(-3, -14), eye(3.2, -13.6)];
  /* Room eleven is the other modelled interior and gets the same treatment,
   * because the `motel-upper` shell is one box across the whole building and
   * the claim in `level.js` is made about both rooms. */
  const insideRoomEleven = [eye(-12, -8), eye(-12, -13)];

  /* 1. Nobody can stand over the room: the whole storey is one solid box. */
  function bodyBlockedBy(x, z, y, radius = 0.42) {
    const bot = y + 0.25;
    const top = y + 2.6;
    for (const c of colliders) {
      if (!c.enabled) continue;
      if (top <= c.y0 || bot >= c.y1) continue;
      if (x > c.x0 - radius && x < c.x1 + radius && z > c.z0 - radius && z < c.z1 + radius) return c;
    }
    return null;
  }
  for (const spot of [...insideRoomTwelve, ...insideRoomEleven]) {
    const blocker = bodyBlockedBy(spot.x, spot.z, level.DECK_Y);
    assert.ok(blocker, `(${spot.x}, ${spot.z}) is standable one floor up`);
    assert.equal(blocker.tag, 'motel-upper',
      `(${spot.x}, ${spot.z}) is not sealed by the upper-floor shell`);
  }

  /* 2. And from the deck -- the only second-floor ground there is -- no line
   *    reaches into either room. The watcher stands at x 6 on that deck. */
  for (const deckX of [-14, -4, 0, 6, 12]) {
    const from = eye(deckX, -2.5, level.DECK_Y + EYE);
    for (const target of [...insideRoomTwelve, ...insideRoomEleven]) {
      assert.ok(!shotReachesTarget(from, target),
        `the deck at x ${deckX} can shoot (${target.x}, ${target.z}) indoors`);
    }
  }
});
