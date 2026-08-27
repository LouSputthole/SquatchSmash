/**
 * The campaign spine, as the owner drew it.
 *
 * `docs/CAMPAIGN-STORY-BIBLE.md` is the prose; this is the same thirty-one
 * beats as data, so that a test can hold the built campaign against them
 * instead of a person having to remember. Where the two disagree the bible is
 * right and this file has a bug.
 *
 * A *beat* is not a scene. Several are phases inside a scene somebody already
 * walks through -- the fake-out on the apartment computer, Booski's call at
 * the cabin, the stayover and the morning after it -- and those carry
 * `spawn: null`, meaning the player is already standing there. Only a beat
 * that begins with travel names a spawn.
 *
 * The cabin is the clearest case. There is ONE cabin and it is in Act One:
 * the whole Cabin Hideaway chapter, dungeon and all, is that scene. Beef Run
 * cuts it in half -- beats 4 and 5 are the light half (Lou's call, the walks,
 * Margo, then Booski about Sasole) and beat 7 is the dark one (Gratin, the
 * cellar, the interrogation, the executions, the pyre, the blackout, and the
 * summons back to the Bing). See docs/CAMPAIGN-STORY-BIBLE.md.
 *
 * `status` is the honest part. `wired` means the campaign really does play
 * this beat in this position today; `pending` means it does not yet. The count
 * of pending beats is asserted in tests/campaign-spine.test.mjs against a
 * checked-in number, so the spine can only converge on the bible deliberately,
 * the way tools/certification-debt-baseline.json works for geometry.
 */

import { SCENE_IDS } from './campaign.js';

/**
 * Where the Prospect actually lives at the end of a beat.
 *
 * The bible calls this the Home Ladder and it is campaign state, never
 * inferred from the last scene visited. It climbs and it does not come back
 * down: once Lou hands over the luxury apartment the starter flat goes dark
 * for good, and `tests/campaign-spine.test.mjs` enforces exactly that.
 */
export const RESIDENCE = Object.freeze({
  STARTER: 'starter',
  CABIN: 'cabin',
  MOTEL: 'motel',
  LUXURY: 'luxury',
  MANSION_GUEST: 'mansion_guest',
  TRANSIT: 'transit',
  INITIATION_CABIN: 'initiation_cabin',
});

/**
 * The rungs of the Home Ladder -- the places that are actually his.
 *
 * The bible writes the ladder out as starter -> cabin -> starter -> luxury ->
 * mansion guest -> initiation cabin, which is a route and not a ladder: the
 * starter flat appears twice, and it has to, because the cabin is somewhere
 * the family hides him rather than somewhere he moves up to. Being sent to the
 * country is a demotion he survives, not a promotion he earns.
 *
 * So the ladder proper has two rungs, and the one rule that matters is that he
 * never climbs back down between them.
 */
export const RESIDENCE_LADDER = Object.freeze([
  RESIDENCE.STARTER,
  RESIDENCE.LUXURY,
]);

/**
 * Somewhere he sleeps tonight and does not own: a cabin the family picked, a
 * motel room Booski paid for, a guest suite, a car seat, and the cabin in the
 * woods where they make him. None of these cost him the home he has, and none
 * of them count as getting one.
 */
export const TEMPORARY_RESIDENCES = Object.freeze([
  RESIDENCE.CABIN,
  RESIDENCE.MOTEL,
  RESIDENCE.MANSION_GUEST,
  RESIDENCE.TRANSIT,
  RESIDENCE.INITIATION_CABIN,
]);

export const CHAPTERS = Object.freeze([
  Object.freeze({ id: 'prospect', title: 'Prospect' }),
  Object.freeze({ id: 'family_business', title: 'Family Business' }),
  Object.freeze({ id: 'moving_up', title: 'Moving Up' }),
  Object.freeze({ id: 'inner_circle', title: 'The Inner Circle' }),
  Object.freeze({ id: 'war', title: 'War' }),
  Object.freeze({ id: 'this_thing_of_ours', title: 'This Thing of Ours' }),
]);

const beat = (fields) => Object.freeze({ spawn: null, ...fields });

export const CAMPAIGN_SPINE = Object.freeze([
  beat({
    n: 0,
    id: 'squatch_smash_intro',
    title: 'Squatch Smash Intro',
    chapter: 'prospect',
    scene: SCENE_IDS.APARTMENT,
    spawn: 'wake',
    residence: RESIDENCE.STARTER,
    status: 'wired',
    exit: 'Quit is intercepted as a story action. The camera pulls back out of '
      + 'the monitor rather than cutting.',
  }),
  beat({
    n: 1,
    id: 'first_apartment',
    title: 'First Apartment',
    chapter: 'prospect',
    scene: SCENE_IDS.APARTMENT,
    residence: RESIDENCE.STARTER,
    status: 'wired',
    exit: 'Lou rings about forty seconds after the reveal: come down to the Bing.',
  }),
  beat({
    n: 2,
    id: 'bada_bing_one',
    title: 'Bada Bing I',
    chapter: 'prospect',
    scene: SCENE_IDS.BADA_BING_ONE,
    spawn: 'driver_seat',
    residence: RESIDENCE.STARTER,
    status: 'wired',
    exit: 'Margo’s number, James Blond, and the Squatchfather job. A family '
      + 'driver is already waiting.',
  }),
  beat({
    n: 3,
    id: 'squatchfather',
    title: 'The Squatchfather',
    chapter: 'prospect',
    scene: SCENE_IDS.SQUATCHFATHER,
    spawn: 'restaurant_exterior',
    residence: RESIDENCE.CABIN,
    status: 'wired',
    exit: 'The same driver takes him straight to the cabin. He does not go home.',
  }),
  beat({
    n: 4,
    id: 'cabin_lay_low',
    title: 'Cabin I: Lay Low',
    chapter: 'prospect',
    scene: SCENE_IDS.COUNTRYSIDE_CABIN,
    spawn: 'arrival',
    residence: RESIDENCE.CABIN,
    status: 'wired',
    exit: 'Lou: good job, stay quiet. The four walks, and the one outgoing '
      + 'call in the campaign -- the cabin already emits MARGO_CALL_READY and '
      + 'deliberately owns no Margo conversation of its own.',
  }),
  beat({
    n: 5,
    id: 'booski_sasole_call',
    title: 'Booski / Sasole Call',
    chapter: 'prospect',
    scene: SCENE_IDS.COUNTRYSIDE_CABIN,
    residence: RESIDENCE.CABIN,
    status: 'wired',
    exit: 'Booski: Captain Sasole needs a hand, and you are already out here. '
      + 'This is where the light half of the cabin chapter ends.',
  }),
  beat({
    n: 6,
    id: 'beef_run',
    title: 'Beef Run',
    chapter: 'prospect',
    scene: SCENE_IDS.AIRSTRIP_SMUGGLING,
    spawn: 'hangar',
    residence: RESIDENCE.CABIN,
    status: 'wired',
    exit: 'Lands clean. Sasole runs him back to the cabin rather than to a '
      + 'flat he is supposed to be hiding from.',
  }),
  beat({
    n: 7,
    id: 'cabin_two',
    title: 'Cabin II: the dungeon',
    chapter: 'prospect',
    scene: SCENE_IDS.COUNTRYSIDE_CABIN,
    spawn: 'wake',
    residence: RESIDENCE.STARTER,
    status: 'wired',
    exit: 'The dark half of the cabin chapter: Gratin calls, the cellar and '
      + 'the dungeon open, the interrogation yields a mole with no name and '
      + 'the phrase Short Bus, the executions, the pyre, the blackout. Then '
      + 'Booski: the heat is down and Ol’ Billy is getting out, come back '
      + 'to the Bing.',
  }),
  beat({
    n: 8,
    id: 'bada_bing_two',
    title: 'Bada Bing II: Billy Hotdog',
    chapter: 'family_business',
    scene: SCENE_IDS.BADA_BING_TWO,
    spawn: 'driver_seat',
    residence: RESIDENCE.STARTER,
    status: 'wired',
    exit: 'The party turns. Billy dies and the cleanup starts in the room.',
  }),
  beat({
    n: 9,
    id: 'graveyard',
    title: 'Graveyard',
    chapter: 'family_business',
    scene: SCENE_IDS.SQUATCH_GRAVEYARD,
    spawn: 'headlights',
    residence: RESIDENCE.MOTEL,
    status: 'wired',
    exit: 'Buried. Booski: not tonight, your place might be watched.',
  }),
  beat({
    n: 10,
    id: 'jerky_motel',
    title: 'Jerky Hotel / Motel',
    chapter: 'family_business',
    scene: SCENE_IDS.JERKY_MOTEL,
    spawn: 'passenger_seat',
    residence: RESIDENCE.MOTEL,
    status: 'wired',
    exit: 'Survive the night. By morning he is cleared to go home.',
  }),
  beat({
    n: 11,
    id: 'return_to_old_apartment',
    title: 'Return to Old Apartment',
    chapter: 'family_business',
    scene: SCENE_IDS.APARTMENT,
    spawn: 'front_door',
    residence: RESIDENCE.STARTER,
    status: 'wired',
    exit: 'Normal life, and it does not feel the same.',
  }),
  /* THE TAKE is the one beat with no number in the spreadsheet -- it is built,
   * playable, and the sheet simply does not contain it. The owner placed it
   * here: home from the motel, Lou calls with the job, and the new-space call
   * comes afterwards. The seven-piece loadout collection stays in the starter
   * flat where it is already built, and the money is the second reason the
   * luxury apartment exists alongside Lou's gift. */
  beat({
    n: 11.5,
    id: 'bank_heist',
    title: 'THE TAKE',
    chapter: 'family_business',
    scene: SCENE_IDS.BANK_HEIST,
    spawn: 'safehouse',
    residence: RESIDENCE.STARTER,
    status: 'wired',
    exit: 'Home, and the flat needs cleaning before anybody sees it.',
  }),
  beat({
    n: 12,
    id: 'new_space_call',
    title: 'Lou’s ‘New Space’ Call',
    chapter: 'moving_up',
    scene: SCENE_IDS.APARTMENT,
    residence: RESIDENCE.STARTER,
    status: 'wired',
    /* THE BIBLE'S WHOLE LINE, AND NOTHING ELSE.
     *
     * This carried "Bring that girl from the Bing — and do not let her know
     * anything she should not", which is not in the bible and never was. The
     * owner caught it: Margo is never at the course. Her whole thread is
     * "meet/get number → cabin call → Front & Center date → stayover →
     * morning exit" (bible, Threads table), and the date is already scheduled
     * at beat 4 — the cabin's own Margo call, which is wired.
     *
     * An invented line in the spine is worse than one in a scene, because
     * this file is what the tests hold the campaign against. Left alone it
     * would have been built. */
    exit: 'We got a new space. Come meet us on the course. Prospect travels '
      + 'to Silver Pines.',
  }),
  beat({
    n: 13,
    id: 'silver_pines',
    title: 'Silver Pines Golf Course',
    chapter: 'moving_up',
    scene: SCENE_IDS.SILVER_PINES,
    spawn: 'car_park',
    residence: RESIDENCE.STARTER,
    status: 'wired',
    exit: 'Three holes of being included, and the keys to somewhere better.',
  }),
  beat({
    n: 14,
    id: 'luxury_apartment_intro',
    title: 'Luxury Apartment Introduction',
    chapter: 'moving_up',
    scene: SCENE_IDS.LUXURY_APARTMENT,
    spawn: 'arrival',
    residence: RESIDENCE.LUXURY,
    status: 'wired',
    exit: 'Lou’s reward for taking care of that thing for him. Get ready for '
      + 'your date. The starter flat goes dark from here.',
  }),
  beat({
    n: 15,
    id: 'front_and_center',
    title: 'Front & Center / Margo Date',
    chapter: 'moving_up',
    scene: SCENE_IDS.SILVER_ROOM,
    spawn: 'kerb',
    residence: RESIDENCE.LUXURY,
    status: 'wired',
    exit: 'She comes home with him.',
  }),
  /* Margo's two apartment beats are now physical. She walks out of the
   * private lift, crosses the main floor, climbs the authored eighteen-step
   * stair, reaches the upstairs bedroom, talks with a driven mouth, and uses
   * the same seven-pull dress interaction as the starter flat. The morning
   * reverses that route and Lou's call is scheduled only after the lift door
   * closes behind her. */
  beat({
    n: 16,
    id: 'margo_stayover',
    title: 'Margo Stayover',
    chapter: 'moving_up',
    scene: SCENE_IDS.LUXURY_APARTMENT,
    spawn: 'main',
    residence: RESIDENCE.LUXURY,
    status: 'wired',
    exit: 'Sleep. Nothing criminal rings tonight.',
  }),
  beat({
    n: 17,
    id: 'luxury_apartment_morning',
    title: 'Luxury Apartment Morning',
    chapter: 'moving_up',
    scene: SCENE_IDS.LUXURY_APARTMENT,
    spawn: 'bed',
    residence: RESIDENCE.LUXURY,
    status: 'wired',
    exit: 'She leaves. A quiet minute. Then the phone.',
  }),
  beat({
    n: 18,
    id: 'no_wake',
    title: 'No Wake',
    chapter: 'moving_up',
    scene: SCENE_IDS.NO_WAKE,
    spawn: 'gate_c',
    residence: RESIDENCE.LUXURY,
    status: 'wired',
    exit: 'Willy was the rat. He goes in a bag, and the Prospect is now trusted '
      + 'with something genuinely internal.',
  }),
  beat({
    n: 19,
    id: 'luxury_apartment_return',
    title: 'Luxury Apartment Return',
    chapter: 'moving_up',
    scene: SCENE_IDS.LUXURY_APARTMENT,
    spawn: 'main',
    residence: RESIDENCE.LUXURY,
    status: 'wired',
    exit: 'Quiet, then a call about something sensitive that needs moving.',
  }),
  beat({
    n: 20,
    id: 'silver_case_setup',
    title: 'Silver Case Setup',
    chapter: 'inner_circle',
    scene: SCENE_IDS.SILVER_CASE,
    spawn: 'car_ride',
    residence: RESIDENCE.LUXURY,
    status: 'wired',
    exit: 'He has custody of the case and orders to hand it to Lou himself.',
  }),
  beat({
    n: 21,
    id: 'silver_case_mansion',
    title: 'Silver Case → Mansion',
    chapter: 'inner_circle',
    scene: SCENE_IDS.MANSION,
    spawn: 'gate',
    residence: RESIDENCE.MANSION_GUEST,
    status: 'wired',
    exit: 'Lou opens it, calls it Squatchanium, and sends him down to Booski.',
  }),
  beat({
    n: 22,
    id: 'silent_squatch',
    title: 'Mansion / Silent Squatch',
    chapter: 'inner_circle',
    scene: SCENE_IDS.MANSION,
    spawn: 'cellar',
    residence: RESIDENCE.MANSION_GUEST,
    status: 'wired',
    exit: 'Lou: things are hot right now, why don’t you stay here, Prospect. '
      + 'He takes the hint. He learns the house while it is still peaceful.',
  }),
  beat({
    n: 23,
    id: 'mansion_siege',
    title: 'Mansion Siege',
    chapter: 'war',
    scene: SCENE_IDS.MANSION_SIEGE,
    spawn: 'guest_suite',
    residence: RESIDENCE.MANSION_GUEST,
    status: 'wired',
    exit: 'Repelled. And then Lou takes a phone call, and says a great deal to '
      + 'whoever is on the other end of it.',
  }),
  beat({
    n: 24,
    id: 'enola_squatch',
    title: 'Enola Squatch',
    chapter: 'war',
    scene: SCENE_IDS.ENOLA_SQUATCH,
    spawn: 'airfield',
    residence: RESIDENCE.TRANSIT,
    status: 'wired',
    exit: 'The city is gone. Nobody in the air says otherwise.',
  }),
  beat({
    n: 25,
    id: 'mansion_return',
    title: 'Repaired Mansion',
    chapter: 'war',
    scene: SCENE_IDS.MANSION_RETURN,
    spawn: 'driveway',
    residence: RESIDENCE.LUXURY,
    status: 'wired',
    exit: 'A few days on. Lou explains which city it actually was. Sauce is '
      + 'missing, and there is an address for the palace.',
  }),
  beat({
    n: 26,
    id: 'cartel_palace',
    title: 'Cartel Palace',
    chapter: 'war',
    scene: SCENE_IDS.CARTEL_PALACE,
    spawn: 'approach',
    residence: RESIDENCE.LUXURY,
    status: 'wired',
    exit: 'Sauce, Mark and the whole crew. The war is over and he does not know '
      + 'what that has earned him.',
  }),
  beat({
    n: 27,
    id: 'special_meeting_call',
    title: 'Luxury Apartment: Special Meeting',
    chapter: 'this_thing_of_ours',
    scene: SCENE_IDS.LUXURY_APARTMENT,
    spawn: 'main',
    residence: RESIDENCE.LUXURY,
    status: 'pending',
    exit: 'Booski: special one. Seff, Lag and Numbskull are coming to get you. '
      + 'He will not say why.',
  }),
  beat({
    n: 28,
    id: 'pickup_ride',
    title: 'Pickup / Ride',
    chapter: 'this_thing_of_ours',
    scene: SCENE_IDS.SPECIAL_MEETING,
    spawn: 'kerb',
    residence: RESIDENCE.TRANSIT,
    status: 'wired',
    exit: 'Forty-two minutes, and something moving in the trunk.',
  }),
  beat({
    n: 29,
    id: 'initiation',
    title: 'Initiation Cabin',
    chapter: 'this_thing_of_ours',
    scene: SCENE_IDS.INITIATION,
    spawn: 'gathering',
    residence: RESIDENCE.INITIATION_CABIN,
    status: 'wired',
    exit: 'Made. Credits roll.',
  }),
]);

/** How many beats the campaign does not yet play in this position. */
export const PENDING_BEATS = Object.freeze(
  CAMPAIGN_SPINE.filter((b) => b.status === 'pending').map((b) => b.id),
);

/** One beat by its stable id, or null. Never throws on an unknown id. */
export function spineBeat(id) {
  return CAMPAIGN_SPINE.find((b) => b.id === id) ?? null;
}

/** Every beat played inside one scene, in spine order. */
export function beatsForScene(sceneId) {
  return CAMPAIGN_SPINE.filter((b) => b.scene === sceneId);
}

/** Where the Prospect lives once `id` is behind him. */
export function residenceAfter(id) {
  return spineBeat(id)?.residence ?? null;
}
