/**
 * NO WAKE deck collision: the cruiser's solid volumes and the capsule resolver
 * that works in the boat's own frame.
 *
 * This lives outside `world.js` on purpose. `buildBoat` needs a WebGL context
 * and a document to make its meshes, so nothing in Node can import it; the deck
 * geometry and the resolver are plain arithmetic and have to be testable
 * without a browser. `tests/no-wake-deck.test.mjs` sweeps the whole walkable
 * deck through `resolveOnDeck` and `tools/verify-no-wake.mjs` sweeps the same
 * grid again through the real `Player`, so a trap anywhere on this deck fails
 * both gates.
 *
 * ## The class of bug this file exists to stop
 *
 * The deck is small, the props are close together, and the player is a 0.30 m
 * radius capsule -- 0.60 m across. Two failure modes kept shipping:
 *
 *  1. **Gaps narrower than the capsule.** Any channel under 0.60 m wide leaves
 *     the capsule overlapping both sides at once. The old resolver walked the
 *     collider list in order and applied each push immediately, so ejecting off
 *     one wall shoved the player into the other and back again, every frame,
 *     forever. There is no position that satisfies both boxes, and the old code
 *     had no way to say so.
 *  2. **Losing the ability to move.** The old resolver zeroed *both* velocity
 *     components whenever any collider pushed at all -- including a push of
 *     ~1e-16 from merely touching. Standing against a rail therefore cancelled
 *     the player's motion along the rail too, so he could not slide out of a
 *     corner: he could only back straight off the wall he was touching. In the
 *     forward side deck, where the clear band for the capsule centre was 0.32 m
 *     wide, "touching a wall" is the normal state, and the player was pinned at
 *     the bow the moment he stepped up to the mooring cleat. That is the
 *     reported "I get stuck after I undo the line at the front of the boat".
 *
 * The fixes below are structural, not per-instance:
 *
 *  - Every overlapping box is measured against the *same* position and the
 *    pushes are combined before anything moves, so the result does not depend
 *    on collider order. Opposing pushes on an axis cancel toward the middle of
 *    the channel and settle there in one step instead of ping-ponging.
 *  - A capsule centre strictly inside a box leaves by the shortest face that
 *    actually lands somewhere free and still on the walkable deck, rather than
 *    the shortest face full stop. The old rule threw anyone who ended up inside
 *    the cabin trunk forward off the bow and into the pulpit rails, which is
 *    unrecoverable.
 *  - Only the velocity driving *into* the surface is cancelled. Sliding along a
 *    rail is preserved, so no amount of narrowness can immobilise the player.
 *
 * Geometry still has to be honest -- see DECK_COLLIDERS -- but the resolver no
 * longer depends on it being perfect.
 */

/** Walkable extent of the deck in boat space. */
export const DECK = { halfBeam: 2.25, bow: -5.75, stern: 5.70, height: 1.02 };

/** Player capsule radius (`RADIUS` in src/core/player.js). Its diameter is the
 * number every channel on this deck has to clear. */
export const CAPSULE_RADIUS = 0.30;

/**
 * Solid volumes in boat space.
 *
 * Rule for this table: no two boxes may leave a channel between them narrower
 * than 2 * CAPSULE_RADIUS. Either they overlap (one solid mass the player walks
 * around) or they leave a real 0.60 m-plus gap he can walk through. Anything in
 * between is a trap, and `assertNoNarrowChannels` fails the build over it.
 *
 * Notes on the numbers that moved, so the next pass does not undo them:
 *
 *  - **Forward rail runs, inner edge 2.20 -> 2.32.** The rail stanchions stand
 *    at x = +/-2.35 with a 0.029 radius, so 2.32 is their inner face: this is as
 *    wide as the side deck physically goes. With the cabin trunk trimmed to its
 *    own mesh the forward side deck is now 1.06 m of clear walkway (it was
 *    0.92, and 0.80 before that), which is a 0.46 m band for the capsule centre
 *    where there used to be 0.32.
 *  - **Cabin trunk, +/-1.28 -> +/-1.26.** The trunk mesh is 2.50 m across
 *    (+/-1.25); the collider no longer claims 3 cm of side deck that is not
 *    there.
 *  - **Bow pulpit rails now overlap at the stem.** They used to stop 0.06 short
 *    of the centreline each, leaving a 0.12 m slot between them -- far narrower
 *    than the capsule, unreachable on foot but reachable by being ejected
 *    forward out of the cabin trunk, which dropped the player off the bow with
 *    no way back.
 *  - **One helm seat block instead of two chairs.** The two pedestal seats left
 *    a 0.54 m channel between them and the starboard chair left 0.32 m between
 *    itself and the starboard rail. Both are open at each end, so the player
 *    walked in and stopped dead. They are now a single solid block he walks
 *    around, and the starboard chair moved 0.22 m inboard (x 1.48 -> 1.26, in
 *    `world.js`) so the starboard side deck keeps a real 0.66 m route forward.
 *  - **Helm console tightened to its mesh in z.** 0.62 m between the console
 *    and the windshield frame was technically passable and practically a pinch;
 *    it is 0.68 now.
 */
export const DECK_COLLIDERS = [
  { name: 'starboard rail · forward run', min: [2.32, .96, -5.70], max: [2.70, 1.92, 2.85] },
  { name: 'starboard rail · aft run', min: [2.08, .96, 2.75], max: [2.60, 1.92, 5.65] },
  { name: 'port rail · forward run', min: [-2.60, .96, -5.70], max: [-2.32, 1.92, 2.82] },
  { name: 'port rail · aft run', min: [-2.60, .96, 4.60], max: [-2.08, 1.92, 5.65] },
  { name: 'transom rail', min: [-2.48, .96, 5.52], max: [2.48, 1.92, 6.00] },
  { name: 'bow pulpit · port', min: [-2.42, .96, -6.75], max: [.06, 1.92, -5.42] },
  { name: 'bow pulpit · starboard', min: [-.06, .96, -6.75], max: [2.42, 1.92, -5.42] },
  { name: 'windshield frame', min: [-1.36, .98, -2.82], max: [1.36, 2.95, -2.54] },
  { name: 'helm console', min: [-.50, .98, -1.86], max: [.78, 2.38, -.98] },
  { name: 'helm seat block', min: [-.26, .98, -.12], max: [1.66, 2.14, .78] },
  { name: 'cabin trunk', min: [-1.26, .98, -5.82], max: [1.26, 1.72, -2.78] },
  { name: 'aft bench', min: [-2.10, .98, 4.95], max: [2.10, 2.00, 5.65] },
  { name: 'starboard cockpit locker', min: [1.02, .98, 3.28], max: [2.12, 2.04, 4.12] },
];

/** Plain `{min,max}` boxes with `.x/.y/.z` members -- the same shape as a
 * THREE.Box3, so the resolver runs against either. */
export function deckColliderBoxes(list = DECK_COLLIDERS) {
  return list.map((entry) => ({
    name: entry.name,
    min: { x: entry.min[0], y: entry.min[1], z: entry.min[2] },
    max: { x: entry.max[0], y: entry.max[1], z: entry.max[2] },
  }));
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Does this box stand in the way of a capsule whose eye is at `eyeY`?
 * Matches `Player._resolve` exactly: skip anything entirely above the head or
 * entirely below the feet. */
export function colliderInPlayerHeight(box, eyeY, eyeHeight) {
  return !(eyeY + .05 < box.min.y || eyeY - eyeHeight > box.max.y);
}

function strictlyInside(box, x, z) {
  return x > box.min.x && x < box.max.x && z > box.min.z && z < box.max.z;
}

function onWalkableDeck(x, z, deck) {
  return Math.abs(x) <= deck.halfBeam && z >= deck.bow && z <= deck.stern;
}

/**
 * Shortest way out of a box the capsule centre is *inside*, preferring an exit
 * that lands clear of every other solid and still on the deck.
 *
 * The old rule was "leave by the nearest face" with no further thought. On this
 * boat the nearest face of the cabin trunk, for anyone standing near its front,
 * is the forward one -- and forward of the cabin trunk is the foredeck, which
 * is entirely filled by the pulpit rails and ends 0.07 m later at the stem. The
 * player was teleported to z = -6.12, outside `DECK.bow`, buried 0.30 m inside
 * a rail, with his velocity zeroed every frame. Preferring a *free* exit sends
 * him onto the side deck instead, which is where a person climbing off a cabin
 * roof would actually end up.
 */
function ejectFromInside(box, x, z, radius, boxes, eyeY, eyeHeight, deck) {
  const candidates = [
    { depth: x - box.min.x, x: box.min.x - radius, z },
    { depth: box.max.x - x, x: box.max.x + radius, z },
    { depth: z - box.min.z, x, z: box.min.z - radius },
    { depth: box.max.z - z, x, z: box.max.z + radius },
  ].sort((a, b) => a.depth - b.depth);
  const onDeck = candidates.filter((candidate) => onWalkableDeck(candidate.x, candidate.z, deck));
  for (const candidate of onDeck) {
    let blocked = false;
    for (const other of boxes) {
      if (other === box) continue;
      if (!colliderInPlayerHeight(other, eyeY, eyeHeight)) continue;
      if (strictlyInside(other, candidate.x, candidate.z)) { blocked = true; break; }
    }
    if (!blocked) return { dx: candidate.x - x, dz: candidate.z - z };
  }
  /* Nowhere clear: still leave by a face that keeps the capsule on the boat and
   * let the next pass sort out the solid it landed in. Being buried in the next
   * box along is recoverable; being put over the side is not. */
  const fallback = onDeck[0] ?? candidates[0];
  return { dx: fallback.x - x, dz: fallback.z - z };
}

/** How far the capsule is buried in the deepest solid it touches, 0 when clear. */
export function deckPenetration(boxes, x, z, radius, eyeY, eyeHeight) {
  let worst = 0;
  let name = null;
  for (const box of boxes) {
    if (!colliderInPlayerHeight(box, eyeY, eyeHeight)) continue;
    const cx = clamp(x, box.min.x, box.max.x);
    const cz = clamp(z, box.min.z, box.max.z);
    const depth = radius - Math.hypot(x - cx, z - cz);
    if (depth > worst) { worst = depth; name = box.name ?? null; }
  }
  return { depth: worst, name };
}

/**
 * Push a capsule centred at (x, z) out of every solid it overlaps.
 *
 * Returns `{ x, z, dx, dz, changed, squeezed }`. `squeezed` reports that the
 * capsule ended up in a channel narrower than itself: the position returned is
 * the middle of that channel and it is stable, but it still overlaps. The
 * caller must not treat that as a reason to cancel the player's motion, or the
 * squeeze becomes a trap.
 */
export function resolveOnDeck(boxes, x, z, radius, eyeY, eyeHeight, deck = DECK, passes = 6) {
  const startX = x;
  const startZ = z;
  let squeezed = false;
  for (let pass = 0; pass < passes; pass++) {
    let posX = 0;
    let negX = 0;
    let posZ = 0;
    let negZ = 0;
    let touching = false;
    let buried = false;
    /* Every push is measured against the position at the top of this pass, so
     * the outcome does not depend on the order of the collider list. */
    for (const box of boxes) {
      if (!colliderInPlayerHeight(box, eyeY, eyeHeight)) continue;
      const cx = clamp(x, box.min.x, box.max.x);
      const cz = clamp(z, box.min.z, box.max.z);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      touching = true;
      const inside = d2 <= 1e-8;
      /* A centre buried inside a solid is an invalid state, and getting out of
       * that solid is the only move that helps. Mixing it with a neighbour's
       * shallow surface push produces a diagonal that satisfies neither and can
       * carry the capsule clean off the side of the boat -- so the first pass
       * that finds a burial resolves burials only, and the surfaces are dealt
       * with on the next one. */
      if (inside && !buried) { buried = true; posX = 0; negX = 0; posZ = 0; negZ = 0; }
      if (buried && !inside) continue;
      let pushX;
      let pushZ;
      if (inside) {
        ({ dx: pushX, dz: pushZ } = ejectFromInside(box, x, z, radius, boxes, eyeY, eyeHeight, deck));
      } else {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pushX = dx / d * push;
        pushZ = dz / d * push;
      }
      if (pushX > posX) posX = pushX; else if (pushX < negX) negX = pushX;
      if (pushZ > posZ) posZ = pushZ; else if (pushZ < negZ) negZ = pushZ;
    }
    if (!touching) break;
    /* Same direction: the deepest box wins and the shallower one is already
     * satisfied -- never the sum, which would overshoot a corner.
     * Opposing directions: the channel is narrower than the capsule and there
     * is no clear position at all. Halving lands exactly on the midpoint in one
     * step, which is stable, instead of bouncing off each wall in turn forever. */
    let stepX = posX + negX;
    let stepZ = posZ + negZ;
    if (posX > 0 && negX < 0) { stepX *= .5; squeezed = true; }
    if (posZ > 0 && negZ < 0) { stepZ *= .5; squeezed = true; }
    if (Math.abs(stepX) < 1e-5 && Math.abs(stepZ) < 1e-5) break;
    x += stepX;
    z += stepZ;
  }
  const dx = x - startX;
  const dz = z - startZ;
  return {
    x, z, dx, dz, squeezed,
    changed: Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6,
  };
}

/**
 * Every pair of solids that leaves a channel too narrow for the capsule.
 *
 * Reported as `{ axis, gap, a, b, span }`. An empty result is the contract this
 * deck ships under; `tests/no-wake-deck.test.mjs` asserts it.
 */
export function narrowChannels(list = DECK_COLLIDERS, clearance = CAPSULE_RADIUS * 2) {
  const boxes = deckColliderBoxes(list);
  const found = [];
  const spans = (aMin, aMax, bMin, bMax) => aMin < bMax && bMin < aMax;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (!spans(a.min.y, a.max.y, b.min.y, b.max.y)) continue;
      for (const [axis, other] of [['x', 'z'], ['z', 'x']]) {
        if (!spans(a.min[other], a.max[other], b.min[other], b.max[other])) continue;
        const gap = a.min[axis] >= b.max[axis] ? a.min[axis] - b.max[axis]
          : b.min[axis] >= a.max[axis] ? b.min[axis] - a.max[axis] : null;
        if (gap === null || gap <= 1e-9 || gap >= clearance) continue;
        found.push({
          axis,
          gap: Number(gap.toFixed(4)),
          a: a.name,
          b: b.name,
          span: [
            Number(Math.max(a.min[other], b.min[other]).toFixed(2)),
            Number(Math.min(a.max[other], b.max[other]).toFixed(2)),
          ],
        });
      }
    }
  }
  return found;
}
