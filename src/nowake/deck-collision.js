/**
 * NO WAKE collision: the cruiser's solid volumes — on deck and below — and the
 * capsule resolver that works in the boat's own frame.
 *
 * This lives outside `world.js` on purpose. `buildBoat` needs a WebGL context
 * and a document to make its meshes, so nothing in Node can import it; the
 * geometry and the resolver are plain arithmetic and have to be testable
 * without a browser. `tests/no-wake-deck.test.mjs` sweeps every walkable square
 * of both spaces through `resolveOnDeck` and `tools/verify-no-wake.mjs` sweeps
 * the same grids again through the real `Player`, so a trap anywhere on this
 * boat fails both gates.
 *
 * ## The class of bug this file exists to stop
 *
 * The player is a 0.30 m radius capsule -- 0.60 m across. Two failure modes
 * kept shipping on the old boat:
 *
 *  1. **Gaps narrower than the capsule.** Any channel under 0.60 m wide leaves
 *     the capsule overlapping both sides at once. There is no position that
 *     satisfies both boxes.
 *  2. **Losing the ability to move.** Cancelling *both* velocity components on
 *     any contact means standing against a rail cancels motion along the rail,
 *     so the player cannot slide out of a corner.
 *
 * Both are handled structurally below, and `narrowChannels()` fails the build
 * over (1) rather than waiting for a playtest to find it.
 *
 * ## The redesign's shape, and why the numbers are what they are
 *
 * `docs/NO-WAKE-REDESIGN.md` replaces the old 42-footer with a 35-36 ft
 * late-1980s express cruiser and moves the confrontation below deck. That
 * gives this file two jobs instead of one, and one new rule from the owner:
 * **the deck paths are wide.** Reaching the bow and reaching the helm were the
 * two things that read as tight, so the routes to both are authored at a metre
 * or better rather than at the capsule's own width.
 *
 *  - **Two levels on deck.** The foredeck is the cabin trunk's roof at 1.70 and
 *    the cockpit sole is at 1.02, joined by a ramp under the windshield's
 *    centre walk-through. `DECK.heightAt(z)` is the single source of that, and
 *    `world.groundAt` and both sweeps read it, so there is no second copy to
 *    drift.
 *  - **Forward of the windshield the whole beam is walkable.** A raised
 *    foredeck over a full-width trunk is what this hull actually is, and it
 *    means the bow — where the mooring line and the ballast locker are — is
 *    4.1 m across instead of a 1 m side deck.
 *  - **One route between the cockpit and the foredeck**, up the centre: 0.98 m
 *    between the companionway hatch and the helm console, then 1.24 m through
 *    the windshield walk-through. Wide, legible, and impossible to get wedged
 *    in.
 *  - **The cockpit seating is a U that opens to starboard**, so the passage
 *    from the companionway aft to the transom gate — the route the body takes
 *    — is clear the whole way, which the spec asks for by name.
 *  - **Below deck is deliberately small.** The confrontation wants the player
 *    on his mark; the cabin's clear floor is a corridor about 0.76 m wide
 *    between the galley counter and the dinette. That is the staging area, not
 *    an accident, and it still passes the escape sweep.
 */

/** Walkable extent of the main deck in boat space. */
export const DECK = {
  halfBeam: 2.02,
  bow: -5.15,
  stern: 4.90,
  /** The cockpit sole. Everything that says "the deck height" means this one. */
  height: 1.02,
  /** The cabin trunk roof the player walks on forward of the windshield. */
  foredeckHeight: 1.70,
  /** The ramp under the windshield walk-through, forward edge and aft edge. */
  rampBow: -2.05,
  rampStern: -1.05,
  /**
   * Deck height at a point along the boat. One function, read by the ground
   * query, the boarding pose, both sweeps and the verifier, so the level the
   * player stands on is the level every check measures.
   */
  heightAt(z) {
    if (z <= this.rampBow) return this.foredeckHeight;
    if (z >= this.rampStern) return this.height;
    const k = (z - this.rampBow) / (this.rampStern - this.rampBow);
    const eased = k * k * (3 - 2 * k);
    return this.foredeckHeight + (this.height - this.foredeckHeight) * eased;
  },
};

/** Walkable extent of the cabin sole, below deck. */
export const CABIN = {
  halfBeam: 1.58,
  bow: -5.00,
  stern: -2.20,
  height: -0.20,
  /** Underside of the foredeck. The cabin is 1.82 m in the clear. */
  ceiling: 1.62,
  heightAt() { return this.height; },
};

/**
 * Where the confrontation holds the player.
 *
 * "The player keeps camera control but cannot leave, and movement is limited to
 * a small staging area so the composition holds." A clamp rather than more
 * geometry, because geometry that exists only to pen somebody in is geometry
 * the sweep then has to prove is not a trap.
 */
export const CABIN_STAGING = Object.freeze({
  minX: -0.42, maxX: -0.02, minZ: -3.30, maxZ: -2.46,
});

/** Player capsule radius (`RADIUS` in src/core/player.js). Its diameter is the
 * number every channel on this boat has to clear. */
export const CAPSULE_RADIUS = 0.30;

/**
 * Solid volumes on the main deck, in boat space.
 *
 * Rule for this table: no two boxes may leave a channel between them narrower
 * than 2 * CAPSULE_RADIUS. Either they overlap (one solid mass the player walks
 * around) or they leave a real 0.60 m-plus gap he can walk through. Anything in
 * between is a trap, and `narrowChannels()` fails the unit suite over it.
 *
 * Rails carry two runs a side because the deck they guard is at two heights:
 * the foredeck run stands from 1.60 up, the side-deck and cockpit runs from
 * 0.98, and the ramp between them is covered by both.
 */
export const DECK_COLLIDERS = [
  { name: 'starboard rail · foredeck run', min: [2.06, 1.60, -5.25], max: [2.50, 2.86, -1.40] },
  { name: 'starboard rail · side deck', min: [2.06, 0.98, -1.80], max: [2.50, 2.86, 0.66] },
  { name: 'starboard coaming · cockpit', min: [2.00, 0.98, 0.00], max: [2.50, 2.08, 4.70] },
  { name: 'starboard transom gate', min: [2.00, 0.98, 4.20], max: [2.50, 2.08, 5.05] },
  { name: 'port rail · foredeck run', min: [-2.50, 1.60, -5.25], max: [-2.06, 2.86, -1.40] },
  { name: 'port rail · side deck', min: [-2.50, 0.98, -1.80], max: [-2.06, 2.86, 0.66] },
  { name: 'port coaming · cockpit', min: [-2.50, 0.98, 0.00], max: [-2.00, 2.08, 5.05] },
  { name: 'stern rail', min: [-2.00, 0.98, 4.62], max: [2.00, 2.08, 5.10] },
  /* The two pulpit rails overlap at the stem on purpose. Stopping each of them
   * short of the centreline leaves a slot narrower than the capsule that is
   * unreachable on foot and reachable by being ejected forward -- which drops
   * the player off the bow with no way back. */
  { name: 'bow pulpit · port', min: [-2.40, 1.60, -6.20], max: [0.06, 2.60, -4.90] },
  { name: 'bow pulpit · starboard', min: [-0.06, 1.60, -6.20], max: [2.40, 2.60, -4.90] },
  /* Smoked wraparound windshield in two wings with a 1.24 m centre
   * walk-through. This is the only way between the cockpit and the foredeck,
   * and it is deliberately twice the capsule's width. */
  { name: 'windshield · port wing', min: [-2.10, 0.98, -2.02], max: [-0.62, 3.20, -1.40] },
  { name: 'windshield · starboard wing', min: [0.62, 0.98, -2.02], max: [2.10, 3.20, -1.40] },
  /* The helm is to starboard. Console and bench are one mass from the
   * windshield aft, so the route forward is the centre and only the centre. */
  { name: 'helm console', min: [0.34, 0.98, -1.40], max: [2.10, 2.40, 0.02] },
  { name: 'helm bench', min: [0.46, 0.98, 0.72], max: [2.04, 2.16, 1.66] },
  /* The companionway hatch is a hole in the deck. Solid, because a hole the
   * player can walk into is a fall, and going below is an authored move. */
  { name: 'companionway hatch', min: [-2.20, 0.98, -1.40], max: [-0.64, 1.44, 0.00] },
  { name: 'cockpit seating · port return', min: [-2.00, 0.98, 2.30], max: [-1.10, 2.06, 4.62] },
  { name: 'cockpit seating · forward leg', min: [-2.00, 0.98, 2.30], max: [-0.55, 2.06, 2.86] },
  { name: 'cockpit seating · aft bench', min: [-2.00, 0.98, 3.95], max: [0.62, 2.06, 4.62] },
];

/**
 * Solid volumes below deck, in boat space.
 *
 * The cabin is bar to port, dinette to starboard, V-berth forward, and a
 * closed head and a mid-cabin berth in the aft bulkhead either side of a
 * 1.40 m companionway doorway. The doorway carries a knee-high sill box: the
 * player can see up the steps and cannot walk into them, because going up is
 * an authored move for the same reason going down is.
 */
export const CABIN_COLLIDERS = [
  { name: 'cabin · port hull side', min: [-2.30, -0.28, -5.20], max: [-1.62, 1.62, -2.00] },
  { name: 'cabin · starboard hull side', min: [1.62, -0.28, -5.20], max: [2.30, 1.62, -2.00] },
  { name: 'cabin · V-berth', min: [-1.72, -0.28, -5.30], max: [1.72, 0.62, -3.86] },
  { name: 'cabin · galley counter', min: [-1.72, -0.28, -3.86], max: [-0.74, 0.78, -2.74] },
  /* Seat and low back only. The dinette has to be something the player shoots
   * over, not a wall the composition hides Willy behind. */
  { name: 'cabin · dinette booth', min: [0.62, -0.28, -3.86], max: [1.72, 0.72, -2.60] },
  { name: 'cabin · aft bulkhead · mid-berth', min: [-1.72, -0.28, -2.74], max: [-1.10, 1.62, -2.00] },
  { name: 'cabin · aft bulkhead · head', min: [0.30, -0.28, -2.60], max: [1.72, 1.62, -2.00] },
  { name: 'cabin · companionway sill', min: [-1.78, -0.28, -2.12], max: [0.36, 0.26, -2.00] },
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

/** The cabin's solids in the same plain form. */
export function cabinColliderBoxes() {
  return deckColliderBoxes(CABIN_COLLIDERS);
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
 * "Leave by the nearest face" with no further thought is how the old boat threw
 * anyone standing on the cabin roof forward off the bow, into the pulpit rails,
 * with his velocity zeroed every frame. Preferring a *free* exit sends him onto
 * the deck instead, which is where a person climbing off a cabin roof would
 * actually end up.
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
 * boat ships under, on deck and below; `tests/no-wake-deck.test.mjs` asserts it
 * for both tables.
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
