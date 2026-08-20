/**
 * The people who are WORKING the closed party.
 *
 * Owner, 2026-08-19: the party opens on an empty-feeling room — "add or
 * re-enable: bartender, blackjack dealer, party interactions, background NPC
 * activity (only a few — guards, blackjack, bartender)". Everybody the closed
 * party already had is Family standing about waiting for a comedian. Nobody
 * was pouring, nobody was dealing, and the front door of a room Lou has shut
 * to the public was being held by nobody at all.
 *
 * None of these four is invented here:
 *
 *   the bartender   `BADA_BING_BARTENDER` — the same man in the same
 *                   waistcoat who works this bar on an ordinary night and
 *                   Lou's mansion bar in the billiard bay. One bartender.
 *   the dealer      `BING_BLACKJACK_DEALER` — lifted out of the inline model
 *                   in `populate()` so the closed party and the ordinary
 *                   night deal from the same body rather than two.
 *   the security    `MANSION_GUARDS` — Lou's hired men, in Lou's uniform.
 *                   The owner's brief is explicit that these are NOT club
 *                   bouncers in tracksuits: the mansion archetype, posted
 *                   professionally, no party behaviour.
 *
 * LEDGER NOTE. `src/core/appearances.js` is the fitting room's record of who
 * wears what in which scene, and its `bing_party` entry lists exactly one
 * module — `src/bing/hotdog-party.js`. This module is deliberately separate
 * and is NOT yet in that list, because adding these four wardrobe models to
 * the party needs four new ledger rows and that file is outside this pass's
 * ownership. The rows required are named in the handoff report.
 */
import { MANSION_GUARDS, BADA_BING_BARTENDER } from '../core/wardrobe.js';
import { BING_BLACKJACK_DEALER } from './cast.js';

/**
 * Two of Lou's men, holding the inside of the club doors.
 *
 * They flank the inner leaf (z 11, x -1.15..1.15) a metre into the room and
 * face +z, which is the doorway — a model's face is its +z, so yaw 0 is a man
 * looking at whoever comes through. `folded` is the rig's open guard stance
 * (elbows out, hands forward), not the drinker's fold, and `look: false`
 * keeps their eyeline on the door instead of following the player round the
 * party like a guest would.
 */
const SECURITY_POSTS = Object.freeze([
  Object.freeze({ id: 'staff.security_door', x: -2.3, z: 9.85, yaw: 0.16, guard: 0 }),
  Object.freeze({ id: 'staff.security_room', x: 2.3, z: 9.85, yaw: -0.16, guard: 3 }),
]);

/**
 * @param {(options: object) => object} makeNpc the party's own Npc factory,
 *   so these people get the party's colliders and nav blockers like everybody
 *   else on the floor rather than a second set of rules.
 */
export function buildHotDogHouseStaff(club, makeNpc) {
  /* The names are the SUBTITLE names -- `HOTDOG_SPEAKERS` in
   * hotdog-room-voices.js is keyed by them and so is the walk-up table, so
   * "the bartender" in lower case would silently give this man no lines. The
   * `staff.` ids are what keeps two men both called Security from sharing one
   * collider id and one geometry assembly. */
  const bartender = makeNpc({
    name: 'The Bartender', characterId: 'staff.bartender', tier: 'hero', job: 'work',
    x: club.anchors.bartender.x, z: club.anchors.bartender.z, yaw: Math.PI / 2,
    model: { ...BADA_BING_BARTENDER },
  });

  /* Behind the flat side of the felt, where the shoe and the chip rack are.
   * Same anchor the ordinary night's dealer stands on. */
  const dealer = makeNpc({
    name: 'The Dealer', characterId: 'staff.dealer', tier: 'hero', job: 'deal',
    x: club.anchors.dealer.x, z: club.anchors.dealer.z, yaw: 0,
    model: { ...BING_BLACKJACK_DEALER },
  });

  const security = SECURITY_POSTS.map((post) => {
    const npc = makeNpc({
      name: 'Security', characterId: post.id, tier: 'hero', job: 'stand', look: false,
      x: post.x, z: post.z, yaw: post.yaw,
      model: { ...MANSION_GUARDS[post.guard] },
    });
    npc.folded = true;
    return npc;
  });

  return {
    bartender,
    dealer,
    security,
    all: [bartender, dealer, ...security],
  };
}
