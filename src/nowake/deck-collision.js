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
 * over any new or changed instance of (1) rather than waiting for a playtest
 * to find it. Concave furniture bays are retained as an exact measured list
 * and must also pass the full settle-and-escape sweep.
 *
 * ## The redesign's shape, and why the numbers are what they are
 *
 * `docs/NO-WAKE-REDESIGN.md` moves the confrontation below deck, and the
 * 2026-08-06 playtest (`docs/audits/2026-08-06/PLAYTEST-PUNCH-LIST.md`, N1)
 * then grew the whole boat: the 36-footer's cabin was 1.36 m of clear floor
 * under a 1.82 m ceiling and the owner said the confrontation "plays out in a
 * bathroom". She is now a 42 ft hull — 0.36 m more half beam, 0.70 m more bow,
 * 0.50 m more stern — and her sole is 0.32 m deeper, which is where the salon
 * below comes from. That gives this file two jobs instead of one, and one rule
 * from the owner that predates the punch list: **the deck paths are wide.**
 * Reaching the bow and reaching the helm were the two things that read as
 * tight, so the routes to both are authored at a metre or better rather than
 * at the capsule's own width.
 *
 *  - **Two levels on deck.** The foredeck is the cabin trunk's roof at 1.70 and
 *    the cockpit sole is at 1.02, joined by a ramp under the windshield's
 *    centre walk-through. `DECK.heightAt(z)` is the single source of that, and
 *    `world.groundAt` and both sweeps read it, so there is no second copy to
 *    drift.
 *  - **Forward of the windshield the whole beam is walkable.** A raised
 *    foredeck over a full-width trunk is what this hull actually is, and it
 *    means the bow — where the mooring line and the ballast locker are — is
 *    4.8 m across instead of a 1 m side deck.
 *  - **One route between the cockpit and the foredeck**, up the centre: 0.98 m
 *    between the companionway hatch and the helm console, then 1.24 m through
 *    the windshield walk-through. Wide, legible, and impossible to get wedged
 *    in.
 *  - **The cockpit seating is a U that opens to starboard**, so the passage
 *    from the companionway aft to the transom gate — the route the body takes
 *    — is clear the whole way, which the spec asks for by name.
 *  - **Below deck is a salon, and that is the punch list's N1.** The clear
 *    floor between the galley counter and the dinette is 2.12 m across and
 *    2.28 m fore-and-aft under 2.08 m of headroom — four men and a table with
 *    room to stand round it, where the old cabin was a 0.76 m corridor. The
 *    dimensions are asserted by `tests/no-wake-deck.test.mjs` and again in
 *    `tools/verify-no-wake.mjs`, so the bathroom cannot come back by accident.
 */

/** Walkable extent of the main deck in boat space. */
export const DECK = {
  halfBeam: 2.38,
  bow: -5.85,
  stern: 5.40,
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

/**
 * Walkable extent of the cabin sole, below deck.
 *
 * The sole dropped 0.32 m and the room grew 0.36 m a side and 0.80 m forward
 * for punch-list N1. The ceiling is 6 cm LOWER than it was on purpose: the old
 * liner panel was authored at 1.62 with the trunk roof's underside at 1.56 and
 * the two were fighting for the same 3 m² of plane. It beds into the roof now,
 * and the headroom came from the floor instead.
 */
export const CABIN = {
  halfBeam: 1.94,
  bow: -5.85,
  stern: -2.10,
  height: -0.52,
  /** Underside of the foredeck. The cabin is 2.08 m in the clear. */
  ceiling: 1.56,
  heightAt() { return this.height; },
};

/**
 * Where the confrontation holds the player.
 *
 * "The player keeps camera control but cannot leave, and movement is limited to
 * a small staging area so the composition holds." A clamp rather than more
 * geometry, because geometry that exists only to pen somebody in is geometry
 * the sweep then has to prove is not a trap.
 *
 * It grew with the room (punch list N1). At 0.40 x 0.84 m it was a phone box
 * inside a bathroom; at 1.17 x 1.30 m — four times the floor — the player can
 * cross the salon and change his angle on all three men without ever leaving
 * the composition. It stops short of the two aft-bulkhead returns either side
 * of the companionway on purpose: a corner the resolver has to push him out of
 * is a corner the clamp then pushes him back into.
 */
export const CABIN_STAGING = Object.freeze({
  minX: -0.82, maxX: 0.35, minZ: -3.80, maxZ: -2.50,
});

const cabinCastMark = (x, z, yaw, baseY = CABIN.height, job = 'stand') => Object.freeze({
  x, z, yaw, baseY, job,
});

/**
 * Authored confrontation marks in the same boat-local frame as the cabin.
 *
 * Willy's seated `baseY` is intentionally precise: the shared sit rig lowers
 * its group another 0.401123596 m. This value leaves the visible hips 20 mm
 * over the named aft-return cushion instead of hovering 344 mm above it.
 */
export const CABIN_CAST_STAGING = Object.freeze({
  lou: cabinCastMark(1.20, -4.80, 0),
  booski: cabinCastMark(-0.95, -4.60, 1.42),
  willyStanding: cabinCastMark(0.20, -4.30, Math.PI * 0.86),
  willySeat: cabinCastMark(1.20, -3.05, Math.PI, CABIN.height + 0.056348315, 'sit'),
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
  { name: 'starboard rail · foredeck run', min: [2.42, 1.60, -5.95], max: [2.86, 2.86, -1.40] },
  { name: 'starboard rail · side deck', min: [2.42, 0.98, -1.80], max: [2.86, 2.86, 0.66] },
  { name: 'starboard coaming · cockpit', min: [2.36, 0.98, 0.00], max: [2.86, 2.08, 5.20] },
  { name: 'starboard transom gate', min: [2.36, 0.98, 4.70], max: [2.86, 2.08, 5.55] },
  { name: 'port rail · foredeck run', min: [-2.86, 1.60, -5.95], max: [-2.42, 2.86, -1.40] },
  { name: 'port rail · side deck', min: [-2.86, 0.98, -1.80], max: [-2.42, 2.86, 0.66] },
  { name: 'port coaming · cockpit', min: [-2.86, 0.98, 0.00], max: [-2.36, 2.08, 5.55] },
  { name: 'stern rail', min: [-2.36, 0.98, 5.12], max: [2.36, 2.08, 5.60] },
  /* The two pulpit rails overlap at the stem on purpose. Stopping each of them
   * short of the centreline leaves a slot narrower than the capsule that is
   * unreachable on foot and reachable by being ejected forward -- which drops
   * the player off the bow with no way back. */
  { name: 'bow pulpit · port', min: [-2.76, 1.60, -6.90], max: [0.06, 2.60, -5.60] },
  { name: 'bow pulpit · starboard', min: [-0.06, 1.60, -6.90], max: [2.76, 2.60, -5.60] },
  /* Smoked wraparound windshield in two wings with a 1.24 m centre
   * walk-through. This is the only way between the cockpit and the foredeck,
   * and it is deliberately twice the capsule's width. */
  { name: 'windshield · port wing', min: [-2.46, 0.98, -2.02], max: [-0.62, 3.20, -1.40] },
  { name: 'windshield · starboard wing', min: [0.62, 0.98, -2.02], max: [2.46, 3.20, -1.40] },
  /* The helm is to starboard. Console and bench are one mass from the
   * windshield aft, so the route forward is the centre and only the centre. */
  { name: 'helm console', min: [0.34, 0.98, -1.40], max: [2.46, 2.40, 0.02] },
  { name: 'helm bench', min: [0.46, 0.98, 0.72], max: [2.40, 2.16, 1.66] },
  /* The companionway hatch is a hole in the deck. Solid, because a hole the
   * player can walk into is a fall, and going below is an authored move. */
  { name: 'companionway hatch', min: [-2.56, 0.98, -1.40], max: [-0.64, 1.44, 0.00] },
  { name: 'cockpit seating · port return', min: [-2.36, 0.98, 2.30], max: [-1.26, 2.06, 5.12] },
  { name: 'cockpit seating · forward leg', min: [-2.36, 0.98, 2.30], max: [-0.55, 2.06, 2.86] },
  { name: 'cockpit seating · aft bench', min: [-2.36, 0.98, 4.45], max: [0.62, 2.06, 5.12] },
];

/**
 * Solid volumes below deck, in boat space.
 *
 * The cabin is bar to port, dinette to starboard, V-berth forward, and a
 * closed head and a mid-cabin berth in the aft bulkhead either side of a
 * 1.90 m companionway doorway. The doorway carries a knee-high sill box: the
 * player can see up the steps and cannot walk into them, because going up is
 * an authored move for the same reason going down is.
 *
 * The furniture is what makes the salon, so it is what N1 changed. The galley
 * is 0.94 m deep against the port liner and the dinette 1.09 m against the
 * starboard one, on a room 0.72 m wider than it was, which leaves 2.13 m of
 * clear sole between them running 2.33 m from the galley's forward end to the
 * companionway sill. Standing room, with the table beside you rather than
 * against your knees.
 *
 * **The 0.65 m athwartships strip in front of the V-berth is load bearing, and
 * it is not decoration.** `ejectFromInside` resolves a capsule buried in a
 * solid by leaving through its nearest FREE face, and a point lying exactly on
 * a face two boxes share is inside both of them at once: the V-berth wants to
 * push it aft and the galley wants to push it forward, the two cancel, and the
 * capsule stands there overlapping both forever. The old cabin had exactly that
 * shared plane at z -3.86 and only escaped it because the sweep's 0.05 m grid
 * never landed on the number. The strip turns the shared plane into a real
 * 0.65 m gap — over the capsule's own width, so `narrowChannels()` is happy —
 * and it reads as the walkway across the front of the salon that it is.
 */
export const CABIN_COLLIDERS = [
  { name: 'cabin · port hull side', min: [-2.66, -0.62, -6.05], max: [-1.98, 1.56, -1.90] },
  { name: 'cabin · starboard hull side', min: [1.98, -0.62, -6.05], max: [2.66, 1.56, -1.90] },
  { name: 'cabin · V-berth', min: [-2.08, -0.62, -5.95], max: [2.08, 0.24, -5.10] },
  { name: 'cabin · galley counter', min: [-2.08, -0.62, -4.45], max: [-1.14, 0.46, -2.90] },
  /* The dinette follows the visible moulding exactly. Its inboard-aft quarter
   * is a real legwell for the aft-return seat, rather than the old monolithic
   * box that occupied Willy's legs. Each touching piece remains one solid
   * player obstacle, while the named aft return stays the seat support. */
  { name: 'cabin · dinette booth · outboard spine', min: [1.50, -0.515, -4.40], max: [2.03, -0.01, -2.90] },
  { name: 'cabin · dinette booth · forward inboard remnant', min: [1.17, -0.515, -4.40], max: [1.50, -0.01, -3.70] },
  { name: 'cabin · dinette booth · forward return', min: [1.02, -0.535, -4.41], max: [1.86, -0.03, -3.99] },
  { name: 'cabin · dinette booth · aft return support', min: [1.02, -0.535, -3.29], max: [1.86, -0.03, -2.91] },
  { name: 'cabin · dinette booth backrest', min: [1.91, -0.05, -4.58], max: [2.03, 0.37, -2.72] },
  { name: 'cabin · dinette table pedestal', min: [1.19, -0.52, -3.85], max: [1.29, 0.275, -3.75] },
  { name: 'cabin · dinette table top', min: [0.99, 0.275, -4.25], max: [1.65, 0.325, -3.45] },
  { name: 'cabin · aft bulkhead · mid-berth', min: [-2.08, -0.62, -2.90], max: [-1.20, 1.56, -1.90] },
  { name: 'cabin · aft bulkhead · head', min: [0.70, -0.62, -2.80], max: [2.08, 1.56, -1.90] },
  { name: 'cabin · companionway sill', min: [-1.26, -0.62, -2.12], max: [0.76, -0.10, -1.90] },
];

/**
 * Exact sub-capsule gaps reported by the pairwise audit for the concave
 * starboard fixture. None is a through-route: each is either bridged by a
 * third piece of the same moulding, outside the walkable perimeter, or an
 * inboard-open furniture bay. Keeping the full measured records here means a
 * newly introduced gap cannot disappear into a broad allow-list; the cabin
 * sweep still has to clear and escape every sampled position.
 */
export const CABIN_CONCAVE_FIXTURE_CHANNELS = Object.freeze([
  { axis: 'x', gap: 0.48, a: 'cabin · starboard hull side', b: 'cabin · dinette booth · forward inboard remnant', span: [-4.4, -3.7], reason: 'outboard recess is filled by the overlapping spine' },
  { axis: 'x', gap: 0.12, a: 'cabin · starboard hull side', b: 'cabin · dinette booth · forward return', span: [-4.41, -3.99], reason: 'outboard recess is filled by the overlapping spine' },
  { axis: 'x', gap: 0.12, a: 'cabin · starboard hull side', b: 'cabin · dinette booth · aft return support', span: [-3.29, -2.91], reason: 'outboard recess is filled by the overlapping spine' },
  { axis: 'x', gap: 0.33, a: 'cabin · starboard hull side', b: 'cabin · dinette table top', span: [-4.25, -3.45], reason: 'table overlaps the spine in plan and does not form a passage' },
  { axis: 'z', gap: 0.52, a: 'cabin · V-berth', b: 'cabin · dinette booth backrest', span: [1.91, 2.03], reason: 'perimeter pocket is outside the capsule-centre envelope' },
  { axis: 'x', gap: 0.21, a: 'cabin · dinette booth · outboard spine', b: 'cabin · dinette table pedestal', span: [-3.85, -3.75], reason: 'pedestal pocket is covered by the table top' },
  { axis: 'z', gap: 0.1, a: 'cabin · dinette booth · outboard spine', b: 'cabin · aft bulkhead · head', span: [1.5, 2.03], reason: 'backrest bridges the booth to the aft fixture' },
  { axis: 'z', gap: 0.41, a: 'cabin · dinette booth · forward inboard remnant', b: 'cabin · dinette booth · aft return support', span: [1.17, 1.5], reason: 'intended legwell is an inboard-open bay, not a through-channel' },
  { axis: 'x', gap: 0.41, a: 'cabin · dinette booth · forward inboard remnant', b: 'cabin · dinette booth backrest', span: [-4.4, -3.7], reason: 'outboard recess is filled by the overlapping spine' },
  { axis: 'x', gap: 0.05, a: 'cabin · dinette booth · forward return', b: 'cabin · dinette booth backrest', span: [-4.41, -3.99], reason: 'outboard seam is filled by the overlapping spine' },
  { axis: 'z', gap: 0.14, a: 'cabin · dinette booth · forward return', b: 'cabin · dinette table pedestal', span: [1.19, 1.29], reason: 'pedestal pocket is covered by the table top' },
  { axis: 'x', gap: 0.05, a: 'cabin · dinette booth · aft return support', b: 'cabin · dinette booth backrest', span: [-3.29, -2.91], reason: 'outboard seam is filled by the overlapping spine' },
  { axis: 'z', gap: 0.46, a: 'cabin · dinette booth · aft return support', b: 'cabin · dinette table pedestal', span: [1.19, 1.29], reason: 'intended legwell is an inboard-open bay, not a through-channel' },
  { axis: 'z', gap: 0.11, a: 'cabin · dinette booth · aft return support', b: 'cabin · aft bulkhead · head', span: [1.02, 1.86], reason: 'aft seam opens inboard and the capsule resolver exits laterally' },
  { axis: 'x', gap: 0.26, a: 'cabin · dinette booth backrest', b: 'cabin · dinette table top', span: [-4.25, -3.45], reason: 'table overlaps the spine in plan and does not form a passage' },
].map((channel) => Object.freeze({ ...channel, span: Object.freeze(channel.span) })));

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

function onWalkableDeck(x, z, deck) {
  return Math.abs(x) <= deck.halfBeam && z >= deck.bow && z <= deck.stern;
}

/** Nearest axis-aligned position where the whole capsule clears every solid.
 * Used only for an opposing-push squeeze: ordinary surface contact still
 * slides through the iterative resolver below. */
function nearestClearPosition(boxes, x, z, radius, eyeY, eyeHeight, deck) {
  const xs = [x];
  const zs = [z];
  for (const box of boxes) {
    if (!colliderInPlayerHeight(box, eyeY, eyeHeight)) continue;
    xs.push(box.min.x - radius, box.max.x + radius);
    zs.push(box.min.z - radius, box.max.z + radius);
  }
  const candidates = [];
  for (const candidateX of xs) candidates.push({ x: candidateX, z });
  for (const candidateZ of zs) candidates.push({ x, z: candidateZ });
  /* A concave corner can require clearing one face on each axis. These are
   * invalid-state recovery candidates, not ordinary movement, so a bounded
   * cross-product is preferable to leaving the capsule embedded. */
  for (const candidateX of xs) {
    for (const candidateZ of zs) candidates.push({ x: candidateX, z: candidateZ });
  }
  let nearest = null;
  let nearestDistance = Infinity;
  for (const candidate of candidates) {
    if (!onWalkableDeck(candidate.x, candidate.z, deck)) continue;
    if (deckPenetration(boxes, candidate.x, candidate.z, radius, eyeY, eyeHeight).depth > 1e-6) continue;
    const distance = Math.hypot(candidate.x - x, candidate.z - z);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
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
      const closestX = clamp(candidate.x, other.min.x, other.max.x);
      const closestZ = clamp(candidate.z, other.min.z, other.max.z);
      /* A candidate is free only when the whole capsule is free. Merely
       * putting its centre outside `other` can park it in a concave furniture
       * bay that is narrower than its diameter, where the next pass receives
       * equal opposing surface pushes and cannot leave. */
      if (Math.hypot(candidate.x - closestX, candidate.z - closestZ) < radius - 1e-9) {
        blocked = true;
        break;
      }
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
    const squeezedX = posX > 0 && negX < 0;
    const squeezedZ = posZ > 0 && negZ < 0;
    if (squeezedX || squeezedZ) {
      squeezed = true;
      const escape = nearestClearPosition(boxes, x, z, radius, eyeY, eyeHeight, deck);
      if (escape) {
        x = escape.x;
        z = escape.z;
        continue;
      }
    }
    if (squeezedX) stepX *= .5;
    if (squeezedZ) stepZ *= .5;
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
 * Reported as `{ axis, gap, a, b, span }`. The deck ships with an empty result.
 * The cabin's concave dinette has an exact classified result: any additional
 * or dimensionally changed entry fails, and the settle/escape sweeps prove the
 * classified bays are not routes or traps.
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
