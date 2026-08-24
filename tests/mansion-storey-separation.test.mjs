/**
 * The mansion has floors, and a bullet has to know it.
 *
 * Owner playtest, verbatim: "In the siege I'm getting killed in the cellar
 * before I even go up, no one is down there, so I don't know if the combat
 * system through walls and floors is working as intended."
 *
 * It was not, and this file is the test that would have caught it. Simulated
 * against the real built house, an attacker standing in the FOYER on the
 * ground floor acquired the player in the BASEMENT armory with
 * targetVisible=true, landed his first round at t=6.97 s and killed him at
 * t=10.93 s, without ever coming downstairs and without the player ever
 * getting a frame in which he could see the man shooting him. A second man in
 * the rear hall put a round into the player at his own spawn point four
 * metres below him at t=0.78 s. A ray fired from the player's head straight up
 * sixteen metres crossed ZERO colliders.
 *
 * The cause was structural, in both senses. Every slab in this building --
 * podium, upper floor, roof, basement raft, cellar soffits, every `topping()`
 * -- was a bare mesh with no collider, and deliberately so: the collider array
 * is the MOVEMENT list that `core/player.js` resolves against, and a floor
 * slab in it ejects a standing player sideways off his own footprint
 * (MansionGrounds.js's `solid()` and the long note at MansionInterior.js's
 * FLOOR-LEVEL COLLIDER TRAP are both scar tissue from exactly that). But the
 * siege hands that same movement list to the shared combat Modules as its
 * line-of-sight and Ballistic-path model, so a storey missing from it is a
 * storey a bullet and a pair of eyes cross as if it were open air.
 *
 * So the two builders now return a second array, `combatBlockers`, holding
 * what stops a round and a line of sight and cannot be in the movement list:
 * every floor slab, ceiling soffit and roof slab, tagged with its real Combat
 * material (docs/CONTEXT.md), plus the 0.3 m of wall that `wallColliderTop`
 * has to give away under each floor above.
 *
 * This file asserts three things that together are the whole fix:
 *   1. no two storeys can see or shoot through each other;
 *   2. the three places the house is DELIBERATELY open vertically are still
 *      open, because sealing them is the same lie pointed the other way;
 *   3. the movement array still contains no floor slab, so nobody can "fix"
 *      a future hole by putting one in the wrong list.
 *
 * It builds the real mansion headlessly, the same way
 * tests/mansion-siege-dressing.test.mjs does -- every fault here is a fault in
 * the relationship between the two builders and the shared combat Modules, and
 * none of it is visible in a file that only imports constants.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { ensureDomShim } from '../tools/three-shim.mjs';

ensureDomShim();

const {
  buildMansionGrounds, BUILDING, GROUND_Y, UPPER_Y, BASEMENT_Y, SUITE_Y,
  BASEMENT_SHAFT, FOYER_VOID, SUITE_STAIR_WELL,
} = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
const { AabbCombatSpace } = await import('../src/core/combat/spatial.js');
const { resolveMaterialPath } = await import('../src/core/combat/ballistics.js');

/** One built house, shared by every test below -- the pair is about half a
 * second together and nothing here mutates either of them. */
const grounds = buildMansionGrounds(null);
const interior = buildMansionInterior(grounds.shell);

/** The movement list, exactly as `src/mansion/siege/main.js` composes it. */
const colliders = [...grounds.colliders, ...interior.colliders];
/** The storey model the movement list is not allowed to carry. */
const combatBlockers = [...grounds.combatBlockers, ...interior.combatBlockers];
/** The one line a composition root writes to get a truthful combat model. */
const combatSpace = new AabbCombatSpace({ boxes: [...colliders, ...combatBlockers] });
/** The same query with the storeys taken away again -- the shipped bug. */
const movementOnlySpace = new AabbCombatSpace({ boxes: colliders });
/** The storeys ALONE, with every wall, rail and stick of furniture removed.
 * This is how the assertions below make a claim about the BUILDING rather
 * than about wherever a sideboard happens to be standing this week: if a
 * line is stopped in here, it is stopped by a floor. */
const storeySpace = new AabbCombatSpace({ boxes: combatBlockers });

const blockerSet = new Set(combatBlockers);

/** Eye height for a standing Combatant, matching the siege's own rigs. */
const EYE = 1.6;
const at = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Resolve one truthful shot: every Combat-material contact in travel order,
 * spent against the most generous penetration budget the model allows.
 *
 * `penetration: 1` is the ceiling in core/combat/ballistics.js, so a surface
 * that stops this stops anything anyone in the siege is carrying. Concrete is
 * not in that module's PENETRABLE set at all, which is the point: a poured
 * slab is the terminal point of the shot, not a tax on it.
 */
function shoot(from, to, { space = combatSpace } = {}) {
  const contacts = space.traceAll(from, to);
  return { contacts, path: resolveMaterialPath(contacts, { penetration: 1, energy: 1 }) };
}

/**
 * Every pair of adjacent (and one non-adjacent) storeys, shot both ways,
 * between two points a standing man could really occupy.
 *
 * These are eye-to-eye deliberately. A perception scan in
 * core/combat/perception.js runs from the shooter's eye to the Sampled aim
 * point and treats ANY truthy trace result as blocking, so an eye-to-eye line
 * that crosses a slab is simultaneously the sight test and the shot test.
 */
const STOREY_LINES = [
  ['guest room -> dining, straight up through the cellar ceiling',
    [-12, BASEMENT_Y + EYE, 70], [-12, GROUND_Y + EYE, 70]],
  ['dining -> guest room, the shot the owner was killed by',
    [-12, GROUND_Y + EYE, 70], [-12, BASEMENT_Y + EYE, 70]],
  ['armory -> foyer, up through the armory soffit and the podium',
    [-2, BASEMENT_Y + EYE, 55.5], [-2, GROUND_Y + EYE, 55.5]],
  ['living room -> west front bedroom, up through the upper slab',
    [-12, GROUND_Y + EYE, 44], [-12, UPPER_Y + EYE, 44]],
  ['east ensuite -> kitchen, down through the upper slab',
    [12, UPPER_Y + EYE, 70], [12, GROUND_Y + EYE, 70]],
  ['lounge -> east front bedroom',
    [12, GROUND_Y + EYE, 44], [12, UPPER_Y + EYE, 44]],
  ["office -> Lou's suite, up through the main roof slab",
    [0, UPPER_Y + EYE, 70], [0, SUITE_Y + EYE, 70]],
  ['suite -> office, down through the same slab',
    [-4, SUITE_Y + EYE, 70], [-4, UPPER_Y + EYE, 70]],
  ['cellar hall -> gallery, two storeys at once',
    [0, BASEMENT_Y + EYE, 65.85], [0, UPPER_Y + EYE, 65.85]],
];

test('no Combatant can see or shoot from one storey into another', () => {
  const leaks = [];
  for (const [label, from, to] of STOREY_LINES) {
    const { contacts, path } = shoot(at(...from), at(...to));
    if (!path.blocked) {
      leaks.push(`${label}: ${contacts.length} contacts, nothing stopped the round`);
      continue;
    }
    /* ...and it is the BUILDING doing it, not a sideboard. The same line
     * against the storey model alone has to come back stopped too, or this
     * suite would go green on furniture and stay green after somebody moved
     * the furniture. */
    const bare = shoot(at(...from), at(...to), { space: storeySpace });
    if (!bare.path.blocked) {
      leaks.push(`${label}: stopped only by ${path.blocker.box?.name ?? 'an unnamed box'}, `
        + 'which is not a storey separator -- the floor is still missing and something '
        + 'incidental is standing in for it');
    }
  }
  assert.deepEqual(leaks, []);
});

test('every storey separator declares its Combat material, and the slabs are concrete', () => {
  const untagged = combatBlockers
    .filter((box) => typeof (box.combatMaterial ?? box.userData?.combatMaterial) !== 'string')
    .map((box) => box.name ?? '(unnamed)');
  assert.deepEqual(untagged, [],
    'core/combat/spatial.js reads ONLY an explicit tag; an untagged box is an '
    + 'undeclared material and core/combat/ballistics.js treats it as an opaque stop '
    + 'with no honest reason for being one');

  for (const [label, from, to] of STOREY_LINES) {
    const { path } = shoot(at(...from), at(...to), { space: storeySpace });
    assert.equal(path.blocker.material, 'concrete',
      `${label}: a poured slab in this house is concrete, and it was reported as `
      + `${path.blocker.material}`);
  }
});

/* THE OTHER HALF OF THE CLAIM, AND THE REASON THE SECOND ARRAY HAD TO EXIST.
 *
 * Asserting "the storeys are separated" proves nothing on its own unless the
 * thing that separates them is the new array: if a future author deletes
 * `combatBlockers` and the suite above still passes, it is passing on
 * furniture. So this runs the identical queries against the movement list
 * alone and requires them to leak. It is the shipped bug, written down. */
test('the movement list alone cannot separate the storeys -- that is why there are two', () => {
  const stopped = [];
  for (const [label, from, to] of STOREY_LINES) {
    const { path } = shoot(at(...from), at(...to), { space: movementOnlySpace });
    if (path.blocked) stopped.push(`${label}: ${path.blocker.box?.name ?? '(unnamed)'}`);
  }
  assert.deepEqual(stopped, [],
    'a floor slab has appeared in the MOVEMENT collider array. It ejects a standing '
    + 'player sideways off his own footprint -- see MansionGrounds.js solid() and the '
    + 'FLOOR-LEVEL COLLIDER TRAP note in MansionInterior.js. Storeys belong in '
    + 'combatBlockers, not here.');
});

test('the exact lines from the owner\'s siege report are stopped', () => {
  /* The two shots the simulation recorded, at the coordinates it recorded
   * them. Both are floor-datum origins because that is what the attacker pool
   * logged -- the man's feet, not his eye. */
  const foyerToArmory = shoot(at(0, GROUND_Y, 41.6), at(-2, BASEMENT_Y + EYE, 55.5));
  assert.ok(foyerToArmory.path.blocked,
    'a man standing in the foyer still has a clear shot into the basement armory');

  const rearHallToSpawn = shoot(at(0, GROUND_Y, 62), at(-12.05, -1.14, 70.48));
  assert.ok(rearHallToSpawn.path.blocked,
    'the rear hall still has a clear shot at the player spawn four metres below it');
  assert.ok(blockerSet.has(rearHallToSpawn.path.blocker.box),
    'the t=0.78 s shot is stopped by something other than the cellar ceiling');
  assert.equal(rearHallToSpawn.path.blocker.material, 'concrete');

  /* AND THE SAME TWO LINES FROM THE SHOOTER'S EYE, WHICH IS WHERE A
   * PERCEPTION SCAN ACTUALLY STARTS.
   *
   * Both origins above are at a floor DATUM, because that is what the
   * attacker pool logged -- the man's feet. A point at y = GROUND_Y sits
   * exactly on the top face of the podium, and core/combat/spatial.js skips
   * any box containing the trace origin so that a Combatant is never blinded
   * by the cover he is leaning on. That rule is right and it means the foyer
   * line above is stopped by the basement's south wall rather than by a
   * slab. So the claim about the FLOOR is made here, an eye height up, and
   * against the storey model alone. */
  for (const [label, from, to] of [
    ['the foyer, into the armory', [0, GROUND_Y + EYE, 44.4], [-2, BASEMENT_Y + EYE, 55.5]],
    ['the rear hall, at the spawn', [0, GROUND_Y + EYE, 62], [-12.05, -1.14, 70.48]],
  ]) {
    const bare = shoot(at(...from), at(...to), { space: storeySpace });
    assert.ok(bare.path.blocked, `${label}: the storeys alone do not stop this shot`);
    assert.equal(bare.path.blocker.material, 'concrete', `${label}: stopped by the wrong thing`);
  }
});

test('a ray from a player\'s head straight up crosses the house he is standing under', () => {
  /* The single measurement that opened the investigation: sixteen metres of
   * vertical ray, zero colliders, from the basement to well above the roof. */
  const heads = [
    ['the guest-room spawn', -12.05, -1.14, 70.48],
    ['the armory', -2, BASEMENT_Y + EYE, 55.5],
    ['the ballroom', 0, GROUND_Y + EYE, 66],
    ['the west gallery', -13, UPPER_Y + EYE, 50.5],
  ];
  for (const [label, x, y, z] of heads) {
    const { contacts } = shoot(at(x, y, z), at(x, y + 16, z));
    const storeys = contacts.filter((contact) => blockerSet.has(contact.box));
    assert.ok(storeys.length > 0,
      `sixteen metres straight up from ${label} still crosses no floor, ceiling or roof`);
  }
});

/* ================================================================== */
/* THE HOLES ARE AS LOAD-BEARING AS THE SLABS                          */
/*                                                                      */
/* This house is open between storeys in exactly three places, and each */
/* of them is a sight line the siege is fought on: the basement stair   */
/* shaft cut through the podium inside the foyer, the double-height     */
/* foyer that the gallery rail looks down into ("Hold the rail" is the  */
/* mission's own nudge), and the concealed stair out of Lou's office. A */
/* storey model that seals them is exactly as wrong as one that leaves  */
/* the whole floor open -- it just fails in the other direction, and it */
/* fails silently, as a fight that stops happening.                     */
/* ================================================================== */
test('the three authored vertical voids are still open', () => {
  const voids = [
    ['the basement stairwell, foyer down into the armory',
      [7.2, GROUND_Y + EYE, 54.5], [7.2, BASEMENT_Y + EYE, 54.5]],
    ['the double-height foyer, floor up to the gallery rail',
      [0, GROUND_Y + EYE, 44.4], [0, UPPER_Y + EYE, 48.5]],
    ["the concealed stair, Lou's office up into the suite",
      [7.7, UPPER_Y + EYE, 67], [7.7, SUITE_Y + EYE, 67]],
  ];
  for (const [label, from, to] of voids) {
    const { contacts } = shoot(at(...from), at(...to));
    const sealed = contacts.filter((contact) => blockerSet.has(contact.box))
      .map((contact) => contact.box.name);
    assert.deepEqual(sealed, [], `${label} has been floored over`);
  }
});

/* ================================================================== */
/* THE 0.3 M SLOT                                                       */
/*                                                                      */
/* `wallColliderTop` in MansionInterior.js pulls thirteen wall colliders */
/* 0.3 m clear of the floor above them, to cure the invisible wall the   */
/* owner hit across the upper gallery. The MESH still reaches the slab,  */
/* so the player sees an unbroken wall -- and the combat model, reading  */
/* the same collider array, saw a 300 mm letterbox running the length of */
/* every one of those walls at ceiling level. Two men on the same storey */
/* trading rounds through a slot neither of them can see.                */
/* ================================================================== */
test('the thirteen trimmed walls are full height to a bullet', () => {
  const slots = combatBlockers.filter((box) => /ceiling-slot/.test(box.name ?? ''));
  assert.equal(slots.length, 13,
    'thirteen wall colliders are trimmed by FLOOR_CLEARANCE and thirteen slots have '
    + 'to be filled; if this number moved, wallColliderTop moved with it');

  const open = [];
  for (const slot of slots) {
    /* Shoot across the middle of the slot, perpendicular to the wall, from
     * clear air on one side to clear air on the other. */
    const thinAxis = (slot.max.x - slot.min.x) < (slot.max.z - slot.min.z) ? 'x' : 'z';
    const mid = {
      x: (slot.min.x + slot.max.x) / 2,
      y: (slot.min.y + slot.max.y) / 2,
      z: (slot.min.z + slot.max.z) / 2,
    };
    const from = at(mid.x, mid.y, mid.z);
    const to = at(mid.x, mid.y, mid.z);
    from[thinAxis] -= 1.5;
    to[thinAxis] += 1.5;
    const { contacts } = shoot(from, to);
    if (!contacts.some((contact) => contact.box === slot)) {
      open.push(slot.name);
    }
  }
  assert.deepEqual(open, [],
    'a wall is still open at ceiling level to a round fired straight through it');
});

test('the trimmed collider and its slot meet edge to edge, and never overlap', () => {
  /* A full-height DUPLICATE of each trimmed wall would be the obvious fix and
   * is the wrong one: it overlaps the box already in `colliders`, and a
   * consumer that concatenates the two arrays then pays for one partition
   * twice. Interior WALL_T is 0.3 m and core/combat/ballistics.js penetrates
   * up to 0.35 m of drywall, so double-charging does not make the model
   * stricter -- it stops every round in the first wall it meets and makes a
   * plasterboard house bulletproof. So the slot is the SLOT, and this holds
   * it to that: no storey separator may contain a movement collider. */
  const faults = [];
  for (const slot of combatBlockers.filter((box) => /ceiling-slot/.test(box.name ?? ''))) {
    /* `wallSeg` names the pair off the same tag and segment index, so the
     * wall this slot belongs to is found by name rather than by proximity --
     * partitions meeting at a corner legitimately lap each other's boxes and
     * a geometric search would report those instead. */
    const wallName = slot.name.replace(/-ceiling-slot-(\d+)$/, '-collider-$1');
    const wall = colliders.find((box) => box.name === wallName);
    if (!wall) {
      faults.push(`${slot.name} has no wall collider called ${wallName}`);
      continue;
    }
    for (const axis of ['x', 'z']) {
      if (Math.abs(wall.min[axis] - slot.min[axis]) > 1e-6
        || Math.abs(wall.max[axis] - slot.max[axis]) > 1e-6) {
        faults.push(`${slot.name} does not sit on its own wall's ${axis} footprint`);
      }
    }
    if (Math.abs(wall.max.y - slot.min.y) > 1e-6) {
      faults.push(`${slot.name} starts at ${slot.min.y} but its wall stops at ${wall.max.y}`
        + ' -- a gap here is a hole and an overlap is a double charge');
    }
  }
  assert.deepEqual(faults, []);
});

/* ================================================================== */
/* THE INVARIANT THAT KEEPS THE TWO ARRAYS APART                        */
/* ================================================================== */
test('the movement array contains no floor slab, and never shares a box with the storey model', () => {
  const shared = colliders.filter((box) => blockerSet.has(box));
  assert.deepEqual(shared, [],
    'the same Box3 is in both arrays. `core/player.js` reads the movement one, so a '
    + 'storey separator reaching it is an invisible wall in the room above.');

  /* And the shape test, independent of who pushed what: nothing inside the
   * building footprint may be a wide, flat, horizontal plate. That is what a
   * floor is, and `_resolve` in core/player.js reads it as a wall. */
  const slabs = colliders
    .filter((box) => box.min.x > BUILDING.x0 - 1 && box.max.x < BUILDING.x1 + 1
      && box.min.z > BUILDING.z0 - 1 && box.max.z < BUILDING.z1 + 1)
    .filter((box) => (box.max.y - box.min.y) < 0.6
      && (box.max.x - box.min.x) > 3 && (box.max.z - box.min.z) > 3)
    .map((box) => ({
      name: box.name ?? '(unnamed)',
      y: [+box.min.y.toFixed(2), +box.max.y.toFixed(2)],
    }));
  assert.deepEqual(slabs, [],
    'a wide flat horizontal plate has been added to the MOVEMENT colliders. It will '
    + 'eject anyone standing on it sideways off its own footprint. Put it in '
    + 'combatBlockers.');
});

test('every floor datum in the house is represented in the storey model', () => {
  /* A named check rather than a count, so adding a room is not a red build:
   * what has to hold is that each storey somebody can stand on is separated
   * from the one above it by something concrete, at the datum the builders
   * agree on. */
  for (const datum of [BASEMENT_Y, GROUND_Y, UPPER_Y, SUITE_Y]) {
    const atDatum = combatBlockers.filter((box) => Math.abs(box.max.y - datum) < 0.35);
    assert.ok(atDatum.length > 0, `no storey separator anywhere near y=${datum}`);
  }
});

test('the storey model agrees with the shell about where the holes are', () => {
  /* The grounds notch their slabs round these three rects and the interior
   * cuts its room floors to match. If the two ever disagree the seam shows up
   * as a slab crossing a void, which is what this measures. */
  for (const [label, hole, datum] of [
    ['the basement stairwell', BASEMENT_SHAFT, GROUND_Y],
    ['the foyer void', FOYER_VOID, UPPER_Y],
    ['the suite stairwell', SUITE_STAIR_WELL, SUITE_Y],
  ]) {
    const centre = {
      x: (hole.x0 + hole.x1) / 2,
      z: (hole.z0 + hole.z1) / 2,
    };
    const covering = combatBlockers.filter((box) => (
      Math.abs(box.max.y - datum) < 0.35
      && box.min.x < centre.x && box.max.x > centre.x
      && box.min.z < centre.z && box.max.z > centre.z
    )).map((box) => box.name);
    assert.deepEqual(covering, [], `${label} has a slab poured across the middle of it`);
  }
});

/* ================================================================== */
/* AND THE SIEGE HAS TO ACTUALLY ASK THE RIGHT LIST                     */
/* ================================================================== */

/**
 * Everything above proves the house HAS a storey model. This proves the scene
 * hands it to the code that needs it -- which is the half that was missing, and
 * the half nothing would have caught.
 *
 * `src/mansion/siege/main.js` is a browser composition root: it touches
 * `document` at module scope and cannot be imported here. Reading its source is
 * what every other test in this directory does to it, and what it is being read
 * for is a single invariant with two directions:
 *
 *   perception, ballistics and suppression  ->  combatColliders  (floors in)
 *   movement, the player's world, the overlay ->  colliders       (floors out)
 *
 * Get the first wrong and a man shoots you through the floor. Get the second
 * wrong and the player is ejected sideways off the floor he is standing on.
 * There is no list that is right for both, which is the entire reason there are
 * two of them.
 */
const SIEGE_MAIN = readFileSync(new URL('../src/mansion/siege/main.js', import.meta.url), 'utf8');

test('sight, shot and suppression are handed the list with floors in it', () => {
  const wired = [
    ['the attacker pool', /attackers\.update\(dt,\s*\{[^}]*?colliders:\s*combatColliders/s],
    ['the friendly ensemble', /ensemble\.update\(dt,\s*\{[^}]*?colliders:\s*combatColliders/s],
    /* The inner `{ ...pellet, hit }` means this one cannot be written with a
     * no-brace class the way the other two are. */
    ['the suppression field', /applyPlayerShot\(\{[\s\S]{0,400}?colliders:\s*combatColliders/],
  ];
  for (const [what, pattern] of wired) {
    assert.match(SIEGE_MAIN, pattern,
      `${what} is not being given combatColliders. It will see and shoot through `
      + 'every floor in the house -- that is the owner\'s cellar report.');
  }
});

test('the combat list is the movement list plus the storey model, and is built once', () => {
  assert.match(
    SIEGE_MAIN,
    /const combatColliders = \[\s*\.\.\.colliders,\s*\.\.\.\(grounds\.combatBlockers[^)]*\),\s*\.\.\.\(interior\.combatBlockers[^)]*\),\s*\];/s,
    'combatColliders must be the movement list plus BOTH builders\' storey models. '
    + 'The walls only live in the movement list, so dropping it loses them.',
  );
  assert.equal(
    (SIEGE_MAIN.match(/const combatColliders =/g) ?? []).length, 1,
    'combatColliders is built more than once; two of them will drift.',
  );
});

test('the player still walks against the list with no floors in it', () => {
  /* The negative half. A floor slab in the movement list is the invisible-wall
   * bug both builders carry comment blocks about, so these two consumers must
   * keep taking the bare `colliders` -- if either is ever "fixed" to take the
   * combat list, the player gets ejected off the floor he is standing on. */
  assert.match(SIEGE_MAIN, /new MansionDamageState\(\{ colliders,/,
    'the damage overlay must keep the movement list');
  assert.match(SIEGE_MAIN, /\n\s*colliders, floorZones: \[\], groundAt:/,
    'the player world must keep the movement list');
});
