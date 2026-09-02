/**
 * INITIATION NIGHT — who is standing in the clearing, and where.
 *
 * WHY THIS IS ITS OWN FILE. The Circle used to be built inside `main.js`, at
 * module scope, in the middle of two thousand nine hundred lines that also
 * boot a page. Nothing outside a running browser could get at it, so the
 * geometry adapter mounted the site and nothing else, and both the geometry
 * gate and the staging gate reported the two Initiation states clean with an
 * empty cast -- fifteen bodies and five prospects that no check had ever
 * looked at. This is the same scene whose fifth act shipped broken because
 * its verifier could not reach it (docs/ENGINE-TRAPS.md 5).
 *
 * So: the roster and the bodies live here, `main.js` decorates them with
 * nameplates and adds them to its scene, and `tools/geometry-scenes.mjs`
 * mounts the same builder. One cast, two readers, no second copy to keep
 * true.
 */
import { MEMBER_PALETTE, Person } from '../core/person.js';
import { LINE_Z, headingToward } from './cabin/site.js';
import { coarseActorRole, markActor } from '../core/staging.js';

/** The middle of the prospect line: what the Circle is turned to face. */
export const LINE_CENTER = Object.freeze({ x: 0, z: LINE_Z });

// Everyone here is human. The prospects came straight from their apartments —
// no bandana yet, that has to be earned.
export const PROSPECT_PALETTE = Object.freeze({
  shirt: 0x6b7a4a, shirtDark: 0x53603a, pants: 0x33383f,
  skin: 0xe8b88a, bandana: null, hair: 0x3a2a1a,
});
export const INDUCTED_PALETTE = Object.freeze({
  ...MEMBER_PALETTE,
  skin: PROSPECT_PALETTE.skin,
  hair: PROSPECT_PALETTE.hair,
  bandana: 0xd92e2e,
});
export const BOOSKI_PALETTE = Object.freeze({
  shirt: 0x3c414c, shirtDark: 0x2c313a, pants: 0x23272e,
  skin: 0xd9a878, bandana: 0x7b4fd9, hair: null,
  face: 'assets/faces/booski.png',
});
export const LOU_PALETTE = Object.freeze({
  shirt: 0x6f7fa8, shirtDark: 0x56637f, pants: 0x2e3e55,
  bandana: 0xd92e2e, face: 'assets/faces/lou.png',
});

/**
 * The Circle, and how big each of them is.
 *
 * `scale` used to be `0.96 + Math.random() * 0.12` for everyone who is not a
 * founder, which gave thirteen men a different height every time the page
 * loaded. That is fine to look at and useless to measure: the geometry gate
 * records a bucket per assembly, and a body that changes size every build
 * moves its own bucket every build. Authored, in the same range the roll
 * covered, so the room still reads as a room full of different men.
 */
/* SEFF and APE WERE STANDING IN THE BOOT CAR. It was written up here as a
 * tree and it never was one.
 *
 * Their old marks -- (3.4, -10.4) and (5.2, -10.2) -- both sat inside a
 * footprint running x 3.24 to 5.64, z -10.91 to -8.51, and there are certainly
 * a fir, a hardwood, a rock and a stump rendered in that patch, which is how
 * it got written down as the treeline. It is not the treeline. It is a square
 * 2.4 m on a side, which is the circumscribing box of a circle of r = 1.2,
 * which is `car.width / 2 + 0.2` for a Lincoln: the north circle of the boot
 * car when it was parked at (4.6, -11.4). MEASURED, not argued -- the car has
 * since moved two metres back and those two old marks now sit inside exactly
 * ZERO colliders, which no amount of moving a car would do if a tree had been
 * the thing holding them.
 *
 * Worth the paragraph because it is the second time this one box has been read
 * as woodland by somebody working from its coordinates, and the first time
 * cost the framing gate a day. Nobody had ever seen the original fault at all,
 * because until this file existed the adapter mounted the clearing and left
 * the Circle out of it, so both Initiation states reported clean with an
 * empty cast.
 *
 * The two replacements are the nearest ground that clears every collider by a
 * body's half-width and stays 1.6 m off everybody else's mark: SEFF moves
 * 0.7 m, APE 1.8. Both still face the prospect line and still read as part of
 * the ring.
 *
 * The 1.6 is measured. The first attempt only kept them a metre apart, which
 * put APE 1.09 m from IRISH and their shoulders 0.227 m through each other --
 * one man out of a tree and into another man. Their combined half-widths are
 * about 0.84, so 1.6 clears the widest pair in the ring with room over. */
export const CIRCLE = Object.freeze([
  { key: 'BOOSKIBRO', name: 'BOOSKIBRO', x: -6.4, z: -3.6, founder: true, scale: 1.22 },
  { key: 'LOU', name: 'BIG UNCLE LOU SPUTTHOLE', x: -7.8, z: -4.4, founder: true, scale: 1.12 },
  { key: 'GRATIN', name: 'GRATIN', face: 'assets/faces/gratin.png', shirt: 0x5a4a6e, x: 1.6, z: -10.2, scale: 1.03 },
  { key: 'SEFF', name: 'SEFF', face: 'assets/faces/seff.png', shirt: 0x46505f, x: 2.77, z: -10.1, scale: 0.99 },
  { key: 'DEATHMEGATRON', name: 'DEATHMEGATRON', face: 'assets/faces/deathmegatron.png', shirt: 0x9aa0ab, x: -2.2, z: -9.9, scale: 1.07 },
  { key: 'RIPPINFLOW', name: 'RIPPINFLOW', face: 'assets/faces/rippinflow.png', shirt: 0x2f62d9, x: -5.0, z: -9.9, scale: 1.01 },
  { key: 'SHUBENATOR', name: 'THE SHUBENATOR', face: 'assets/faces/shubenator.png', shirt: 0x8a8f9c, x: -6.6, z: -10.3, scale: 1.05 },
  { key: 'NUMBSKULL', name: 'NUMBSKULL', face: 'assets/faces/numbskull.png', shirt: 0x3f4a3a, x: -0.2, z: -10.1, scale: 0.97 },
  { key: 'APE', name: 'APE', face: 'assets/faces/ape.png', shirt: 0x2a2e38, x: 6.29, z: -11.31, scale: 1.06 },
  { key: 'SNOW', name: 'SNOW', face: 'assets/faces/snow.png', shirt: 0xf0f0ec, x: -3.9, z: -10.6, scale: 1.00 },
  { key: 'IRISH', name: 'IRISH', face: 'assets/faces/irish.png', shirt: 0x3d6b4a, x: 6.9, z: -9.8, scale: 1.04 },
  { key: 'HOGMAMA', name: 'HOG MAMA', face: 'assets/faces/hogmama.png', shirt: 0x3a3a44, x: 8.2, z: -9.4, scale: 0.98 },
  { key: 'LAG', name: 'LAG', face: 'assets/faces/lag.png', shirt: 0x584a3c, x: 0.9, z: -11.3, scale: 1.02 },
  { key: 'ERIC', name: 'ERIC', face: 'assets/faces/erican.png', shirt: 0xe8e4d4, x: -1.4, z: -11.2, scale: 1.08 },
  { key: 'SASOLE', name: 'CAPTAIN LOU SASOLE', face: 'assets/faces/sasole.png', shirt: 0x2e3a5e, x: 1.4, z: -12.2, scale: 0.96 },
]);

/**
 * Where a `core/person.js` body's eye and hip sit, per unit of group scale.
 *
 * `core/person.js` is the 2.30 m Sasquatch the staging marker defaults to, and
 * these bodies are scaled per man, so the marker has to be told the scaled
 * number rather than left on the default -- which is the fault that had thirty
 * bank-lobby bodies declaring an eye above their own heads.
 */
const PERSON_EYE_Y = 2.30;
const PERSON_HIP_Y = 1.16;

/**
 * Every body in the Circle, with a staging marker on it.
 *
 * Returns the same entry shape `main.js` has always carried, minus the
 * nameplate and the `scene.add` -- both of those are the caller's, because
 * the headless adapter wants neither a canvas texture nor a page's scene.
 */
export function buildInitiationCircle() {
  const members = [];
  const memberByKey = new Map();
  for (const spec of CIRCLE) {
    const palette = spec.key === 'BOOSKIBRO' ? BOOSKI_PALETTE
      : spec.key === 'LOU' ? LOU_PALETTE
        : { shirt: spec.shirt, face: spec.face ?? null };
    const sq = new Person(palette);
    const { scale } = spec;
    sq.group.scale.setScalar(scale);
    sq.group.position.set(spec.x, 0, spec.z);
    sq.heading = headingToward(spec, LINE_CENTER);
    sq.group.rotation.y = sq.heading;
    markActor(sq.group, {
      id: spec.key,
      role: coarseActorRole(spec.founder ? 'founder' : 'family_member'),
      posture: 'stand',
      eyeHeight: PERSON_EYE_Y * scale,
      hipHeight: PERSON_HIP_Y * scale,
    });
    const entry = {
      key: spec.key, name: spec.name, sq, scale,
      home: { x: spec.x, z: spec.z },
      /** Where he walks to next, or null. Used on the trail and in the yard. */
      stepTo: null,
      /** Fraction of the trail he keeps ahead of (or behind) the player. */
      trailOffset: 0,
      poseT: 0,
    };
    members.push(entry);
    memberByKey.set(spec.key, entry);
  }
  return { members, memberByKey };
}
