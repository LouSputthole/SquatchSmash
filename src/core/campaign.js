import {
  getPreviewRuntime,
  installPreviewNotice,
  previewNavigationHref,
} from './preview-mode.js';
import { FINAL_ARC_LOADOUT_STORAGE_KEY } from './final-arc-loadout-storage.js';
import {
  FINAL_ARC_WEAPON_CATALOG,
  normalizeFinalArcLoadoutSnapshot,
} from './final-arc-loadout.js';
import { SCENE_RECOVERY_STORAGE_KEY } from './scene-recovery-storage.js';

/**
 * Stable IDs shared by every scene. Display names and voice-provider aliases
 * belong in character data; story state only uses these IDs.
 */
export const CHARACTER_IDS = Object.freeze({
  PROSPECT: 'prospect',
  LOU: 'lou',
  CAPTAIN_LOU_SASOLE: 'captain_lou_sasole',
  BOOSKI: 'booski',
  APE: 'ape',
  MARGO: 'margo',
  /* The rest of the Family, per the locked ledger (docs/VOICE-CASTING.md).
   * One stable id per person: the Sasole at a Bing table is the Sasole of
   * the Beef Run, and these ids are what every scene keys face, voice and
   * dialogue ownership from. Display names live with character data. */
  LAG: 'lag',
  GRATIN: 'gratin',
  ERIC: 'eric',
  HOG_MAMA: 'hogmama',
  DEATHMEGATRON: 'deathmegatron',
  WILLY: 'willy',
  IRISH: 'irish',
  OLD_STOVE: 'old_stove',
  SNOW: 'snow',
  RIPPINFLOW: 'rippinflow',
  SEFF: 'seff',
  SHUBENATOR: 'shubenator',
  NUMBSKULL: 'numbskull',
  AUBBIE: 'aubbie',
  /* Not Family, and he was already all over this world before he had an id:
   * a portrait on the Bing's hallway wall, a portrait in the Squatchfather's
   * dining room, an open plot at the graveyard with his name cut into the
   * marker, and a man in chef's whites working the buffet at the closed
   * party. One id, so all of those are the same person. */
  SAUCE: 'sauce',
  BILLY_HOTDOG: 'billy_hotdog',
  /* Not Family, and not local. A foreign intelligence officer the Family
   * caught and tied to a chair in their own store room, who has a stable id
   * because he does not stay in it: after the side quest he turns up again,
   * immaculate, behaving as though the evening never happened. */
  JAMES_BLOND: 'james_blond',
  /* The OTHER prospect, and the reason he needs an id of his own rather than
   * a scene-local name: he is a second man in exactly Tony's position, which
   * is the shape of thing that gets accidentally merged with the first. One
   * id, one face, one voice, and `subtitleName` is 'Kittenboss' and never the
   * bare word Prospect -- `src/bing/dialogue.js` treats a speaker literally
   * called 'Prospect' as the player and animates nobody.
   *
   * Why he was in the boot of the car is not written down anywhere, here
   * included. That is deliberate and it is the owner's. */
  KITTENBOSS: 'kittenboss',
});

export const SCENE_IDS = Object.freeze({
  APARTMENT: 'apartment',
  BADA_BING_ONE: 'bada_bing_one',
  SQUATCHFATHER: 'squatchfather',
  AIRSTRIP_SMUGGLING: 'airstrip_smuggling',
  BADA_BING_TWO: 'bada_bing_two',
  SQUATCH_GRAVEYARD: 'squatch_graveyard',
  JERKY_MOTEL: 'jerky_motel',
  NO_WAKE: 'no_wake',
  SILVER_ROOM: 'silver_room',
  SILVER_PINES: 'silver_pines',
  BANK_HEIST: 'bank_heist',
  SILVER_CASE: 'silver_case',
  MANSION_SIEGE: 'mansion_siege',
  ENOLA_SQUATCH: 'enola_squatch',
  MANSION_RETURN: 'mansion_return',
  CARTEL_PALACE: 'cartel_palace',
  /* THE SPECIAL MEETING. The bridge from the Palace to the fire: a phone call,
   * three men in a car, and a forty-two minute drive that ends at a treeline.
   * It is a scene and not a mission -- there is nothing to fail, no end card
   * and no result to record -- so it deliberately has no MISSION_IDS entry
   * and costs no save-version bump. */
  SPECIAL_MEETING: 'special_meeting',
  INITIATION: 'initiation',
  /* Lou's house. An explorable compound before PROJECT SILENT SQUATCH claims
   * it, and the mission's own scene after: the office upstairs, the wine
   * cellar, and the laboratory under the floor of it. */
  MANSION: 'mansion',
});

export const ITEM_IDS = Object.freeze({
  LOU_PACKAGE: 'parcel',
  /* THE SAME CASE. The one recovered in The Silver Case, carried into Lou's
   * office, opened on his desk, and handed to Booski in the basement -- not a
   * second prop that looks like it. See docs/MISSION-SILENT-SQUATCH.md's own
   * instruction to reuse `src/silvercase/props/case.js`. */
  SILVER_CASE: 'silver_case',
  /* The apartment trophy PROJECT SILENT SQUATCH leaves behind: a miniature
   * Squatchanium container, glowing on a shelf in a flat, forever. */
  SQUATCHANIUM_MINIATURE: 'squatchanium_miniature',
  /* Once he has picked it up off the nightstand he has it for good, in every
   * scene and across every save. It is not a possession, it is how the rest of
   * the cast reaches him -- a campaign where the phone can be left on a table
   * is a campaign where Lou rings an empty room. Carried, never concealed.
   */
  PHONE: 'phone',
});

export const MISSION_IDS = Object.freeze({
  BADA_BING_ONE: 'bada_bing_one',
  SQUATCHFATHER: 'squatchfather',
  AIRSTRIP_SMUGGLING: 'airstrip_smuggling',
  BADA_BING_TWO: 'bada_bing_two',
  JERKY_MOTEL: 'jerky_motel',
  NO_WAKE: 'no_wake',
  SILVER_ROOM: 'silver_room',
  SILVER_PINES: 'silver_pines',
  BANK_HEIST: 'bank_heist',
  SILVER_CASE: 'silver_case',
  MANSION_SIEGE: 'mansion_siege',
  ENOLA_SQUATCH: 'enola_squatch',
  MANSION_RETURN: 'mansion_return',
  CARTEL_PALACE: 'cartel_palace',
  INITIATION: 'initiation',
  /* PROJECT SILENT SQUATCH -- the night in Lou's mansion, immediately after
   * The Silver Case. */
  SILENT_SQUATCH: 'silent_squatch',
});

/**
 * How the Beef Run's last landing went, in the ONE vocabulary its readers use.
 *
 * `pastMissionBanter()` in the golf script treats `clean`, `greased` and
 * `perfect` as the good ones and everything else as a man who brought most of
 * the plane back. The Beef Run used to persist its RANK here instead — "Gas
 * Station Amateur", "Certified Meat Aviator" and so on — and the two sets do
 * not intersect, so the good callback was unreachable for anybody who actually
 * flew the mission. Anything not on this list is normalised to `unknown` on
 * the way in, so a scene cannot quietly write a string nobody reads again.
 */
export const LANDING_QUALITIES = Object.freeze([
  'perfect', 'greased', 'clean', 'rough', 'hard', 'unknown',
]);

/**
 * Everything the Beef Run can send home with you.
 *
 * Ids rather than the end card's prose, because these are campaign facts other
 * scenes read; the words on the card are presentation. The card promised six
 * trophies out of a hard-coded array that reached no save at all — this is the
 * list that actually gets written, and only the ones that were earned.
 */
export const AIRSTRIP_UNLOCKS = Object.freeze([
  'prospectFlightJacket',      // always: you flew the run
  'brushrunnerAccess',         // always: you brought it back
  'tammyDashboardMug',         // always: it was on the dash and he let you keep it
  'stoveBusinessCard',         // Old Stove's three crates delivered
  'silverbackOrnament',        // the jerky arrived in a state Cecilio would accept
  'elHuesoFreeFlight',         // you put it down on the mountain strip properly
]);

export const EVENT_IDS = Object.freeze({
  LOU_FIRST_CALL: 'lou_first_call',
  /* The one call that asks nothing of him. Lou rings the night the
   * Squatchfather business is settled to say well done without once saying
   * what for -- so it is deliberately not a gate: the door does not wait for
   * it, sleeping does not wait for it, and missing it costs nothing but the
   * only kind words anybody in this family says out loud. */
  LOU_ATTABOY_CALL: 'lou_attaboy_call',
  BOOSKI_DAY_TWO_CALL: 'booski_day_two_call',
  LOU_SECOND_CALL: 'lou_second_call',
  LOU_NO_WAKE_CALL: 'lou_no_wake_call',
  MARGO_DATE_CALL: 'margo_date_call',
  LOU_GOLF_CALL: 'lou_golf_call',
  LOU_HEIST_CALL: 'lou_heist_call',
  BOOSKI_BIG_NIGHT_CALL: 'booski_big_night_call',
});

export const TIME_EVENT_IDS = Object.freeze({
  EAT: 'activity.eat',
  SHOWER: 'activity.shower',
  /* Two trips, not one. The morning routine used to fold both jobs into
   * `POOP`, which meant a man who had emptied his bladder and nothing else was
   * told he had used the bathroom and the door let him go. They are separate
   * needs with separate tanks and separate interactions in the flat, so they
   * are separate errands on the clock. */
  PEE: 'activity.pee',
  POOP: 'activity.poop',
  CHANGE_CLOTHES: 'activity.change_clothes',
  CHECK_EMAIL: 'activity.check_email',
  /* The per-chapter pastimes -- see CHAPTER_PASTIMES in apartment-story.js.
   * They are on the clock because they are things a man spends a morning on,
   * and because a chapter whose only cost is a phone call has a morning that
   * takes four minutes. None of them can move a departure: every DEPART_* below
   * is `atLeast`-anchored, so an earlier hour is absorbed rather than added. */
  WATCH_TV: 'activity.watch_tv',
  PLAY_COUNTER_SQUATCH: 'activity.play_counter_squatch',
  PLAY_SQUATCH_SHOOT: 'activity.play_squatch_shoot',
  PLAY_SQUATCH_SMASH: 'activity.play_squatch_smash',
  EAT_SHROOMS: 'activity.eat_shrooms',
  /* Standing at the sideboard listening to what landed while he was out. One
   * per chapter, because there is one message per chapter and a man does not
   * hear yesterday's twice. Registered as time events rather than as a new
   * field on the save so the state SHAPE does not move -- an added field makes
   * every existing save normalise differently, which the loader would report
   * to the player as a recovered save. */
  HEAR_MESSAGES_DAY_TWO: 'activity.messages.day_two',
  HEAR_MESSAGES_DATE: 'activity.messages.date',
  HEAR_MESSAGES_BIG_NIGHT: 'activity.messages.big_night',
  /* Phone read markers have no clock cost. They deliberately live in the
   * existing time-event ledger so a phone rebuilt in another scene retains
   * its unread state without a second browser-only save. */
  PHONE_READ_FAMILY: 'phone.read.family',
  PHONE_READ_LOU: 'phone.read.lou',
  PHONE_READ_MUM: 'phone.read.mum',
  /** Margo waking up beside him on the fourth morning, and leaving. */
  MARGO_WAKE: 'scene.margo_wake',
  /** Margo coming home with him the night of the Silver Room, and staying. */
  MARGO_COME_HOME: 'scene.margo_come_home',
  LOU_FIRST_CALL: 'call.lou_first',
  LOU_ATTABOY_CALL: 'call.lou_attaboy',
  BOOSKI_DAY_TWO_CALL: 'call.booski_day_two',
  LOU_SECOND_CALL: 'call.lou_second',
  LOU_NO_WAKE_CALL: 'call.lou_no_wake',
  MARGO_DATE_CALL: 'call.margo_date',
  LOU_GOLF_CALL: 'call.lou_golf',
  LOU_HEIST_CALL: 'call.lou_heist',
  BOOSKI_BIG_NIGHT_CALL: 'call.booski_big_night',
  DEPART_BADA_BING_ONE: 'travel.bada_bing_one',
  /* Coming home from the restaurant. The Squatchfather scene keeps no clock of
   * its own -- it is deliberately frozen -- so the return leg is what puts the
   * hour on it, and it is applied by the apartment on arrival. Without it he
   * walked back in at the same 11:41 PM he left at, which is why the bed felt
   * like it was refusing him: the flat still thought he had just got up. */
  COMPLETE_SQUATCHFATHER: 'mission.squatchfather',
  DEPART_AIRSTRIP: 'travel.airstrip',
  COMPLETE_AIRSTRIP: 'mission.airstrip',
  DEPART_BADA_BING_TWO: 'travel.bada_bing_two',
  ARRIVE_SQUATCH_GRAVEYARD: 'travel.squatch_graveyard',
  COMPLETE_BADA_BING_TWO: 'mission.bada_bing_two',
  DEPART_JERKY_MOTEL: 'travel.jerky_motel',
  COMPLETE_JERKY_MOTEL: 'mission.jerky_motel',
  DEPART_NO_WAKE: 'travel.no_wake',
  COMPLETE_NO_WAKE: 'mission.no_wake',
  DEPART_SILVER_ROOM: 'travel.silver_room',
  COMPLETE_SILVER_ROOM: 'mission.silver_room',
  DEPART_SILVER_PINES: 'travel.silver_pines',
  COMPLETE_SILVER_PINES: 'mission.silver_pines',
  DEPART_BANK_HEIST: 'travel.bank_heist',
  COMPLETE_BANK_HEIST: 'mission.bank_heist',
  /* The final chapter has no apartment hub between scenes, so its travel and
   * runtime spans live in this same exact-once ledger.  These markers make the
   * calendar agree with the authored Day 5 / Day 6 sequence without letting a
   * reload, retry, or repeated Continue click farm hours. */
  DEPART_SILVER_CASE: 'travel.silver_case',
  COMPLETE_SILVER_CASE: 'mission.silver_case',
  DEPART_INITIATION: 'travel.initiation',
  /* The rites at the pines, start to anointing. Written by the Initiation's
   * temporary exit (gap G1 minimal relief) so the ceremony puts hours on the
   * clock exactly once however many times a failed prospect retries. */
  COMPLETE_INITIATION: 'mission.initiation',
  /* The drive up to Lou's house with the case on the passenger seat, and the
   * hours it takes to hand it over, watch it get built, and clean up after. */
  DEPART_MANSION: 'travel.mansion',
  COMPLETE_SILENT_SQUATCH: 'mission.silent_squatch',
  REST_AT_MANSION: 'sleep.mansion',
  COMPLETE_MANSION_SIEGE: 'mission.mansion_siege',
  DEPART_ENOLA_SQUATCH: 'travel.enola_squatch',
  COMPLETE_ENOLA_SQUATCH: 'mission.enola_squatch',
  RETURN_TO_MANSION: 'travel.mansion_return',
  COMPLETE_MANSION_RETURN: 'mission.mansion_return',
  DEPART_CARTEL_PALACE: 'travel.cartel_palace',
  COMPLETE_CARTEL_PALACE: 'mission.cartel_palace',
  /* THE SPECIAL MEETING: waiting in the flat for a car nobody described, and
   * then the drive out. `DEPART` is the wait and the walk downstairs; the
   * completion is Seff's forty-two minutes plus the standing about at the spur
   * and the walk up the trail. Relative minutes rather than an `atLeast`
   * because the final arc's day is whatever the Palace left behind it. */
  DEPART_SPECIAL_MEETING: 'travel.special_meeting',
  COMPLETE_SPECIAL_MEETING: 'scene.special_meeting',
});

const TIME_EVENTS = Object.freeze({
  [TIME_EVENT_IDS.EAT]: Object.freeze({ minutes: 20 }),
  [TIME_EVENT_IDS.SHOWER]: Object.freeze({ minutes: 15 }),
  // Short, because it is short. The other one is ten because it is not.
  [TIME_EVENT_IDS.PEE]: Object.freeze({ minutes: 3 }),
  [TIME_EVENT_IDS.POOP]: Object.freeze({ minutes: 10 }),
  [TIME_EVENT_IDS.CHANGE_CLOTHES]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.CHECK_EMAIL]: Object.freeze({ minutes: 10 }),
  // Half a minute of it is what the door counts. A bulletin is a quarter hour.
  [TIME_EVENT_IDS.WATCH_TV]: Object.freeze({ minutes: 15 }),
  // A game with the boys, even one you lose every round of, is not a quick one.
  [TIME_EVENT_IDS.PLAY_COUNTER_SQUATCH]: Object.freeze({ minutes: 25 }),
  [TIME_EVENT_IDS.PLAY_SQUATCH_SHOOT]: Object.freeze({ minutes: 15 }),
  // Ninety seconds a run, and nobody has ever done exactly one run.
  [TIME_EVENT_IDS.PLAY_SQUATCH_SMASH]: Object.freeze({ minutes: 20 }),
  /* Chewing them takes no time at all. The ninety minutes they take to arrive
   * are real minutes on the world clock -- see core/highs.js -- and belong to
   * wherever he happens to be standing when they land, which is the joke. */
  [TIME_EVENT_IDS.EAT_SHROOMS]: Object.freeze({ minutes: 0 }),
  [TIME_EVENT_IDS.HEAR_MESSAGES_DAY_TWO]: Object.freeze({ minutes: 2 }),
  [TIME_EVENT_IDS.HEAR_MESSAGES_DATE]: Object.freeze({ minutes: 2 }),
  [TIME_EVENT_IDS.HEAR_MESSAGES_BIG_NIGHT]: Object.freeze({ minutes: 2 }),
  [TIME_EVENT_IDS.PHONE_READ_FAMILY]: Object.freeze({ minutes: 0 }),
  [TIME_EVENT_IDS.PHONE_READ_LOU]: Object.freeze({ minutes: 0 }),
  [TIME_EVENT_IDS.PHONE_READ_MUM]: Object.freeze({ minutes: 0 }),
  /* Costs nothing on the clock. This is a one-shot cutscene marker rather than
   * an errand: Day 4 already opens at the authored seven-o'clock checkpoint,
   * and Margo leaving should not move the Golf call or either departure. */
  [TIME_EVENT_IDS.MARGO_WAKE]: Object.freeze({ minutes: 0 }),
  /* Also costs nothing on the clock -- `DEPART_SILVER_ROOM` and
   * `COMPLETE_SILVER_ROOM` already staged the walk home and the hour it
   * lands at; this only marks that the two of them went through it rather
   * than the door swinging shut on a toast. */
  [TIME_EVENT_IDS.MARGO_COME_HOME]: Object.freeze({ minutes: 0 }),
  [TIME_EVENT_IDS.LOU_FIRST_CALL]: Object.freeze({ minutes: 3 }),
  // Shorter than the rest. Lou is not asking for anything, so it is short.
  [TIME_EVENT_IDS.LOU_ATTABOY_CALL]: Object.freeze({ minutes: 2 }),
  [TIME_EVENT_IDS.BOOSKI_DAY_TWO_CALL]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.LOU_SECOND_CALL]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.LOU_NO_WAKE_CALL]: Object.freeze({ minutes: 4 }),
  [TIME_EVENT_IDS.MARGO_DATE_CALL]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.LOU_GOLF_CALL]: Object.freeze({ minutes: 3 }),
  [TIME_EVENT_IDS.LOU_HEIST_CALL]: Object.freeze({ minutes: 3 }),
  [TIME_EVENT_IDS.BOOSKI_BIG_NIGHT_CALL]: Object.freeze({ minutes: 5 }),
  [TIME_EVENT_IDS.DEPART_BADA_BING_ONE]: Object.freeze({
    atLeast: Object.freeze({ day: 1, timeMinutes: 23 * 60 + 41 }),
  }),
  /* The restaurant, the walk away from it and the drive back. He lets himself
   * in at three in the morning of the night Day One runs into: still Day One's
   * chapter, on the second calendar day, exactly as the Motel already does at
   * half four. Sleeping from here is what turns the page. */
  [TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER]: Object.freeze({
    atLeast: Object.freeze({ day: 2, timeMinutes: 3 * 60 }),
  }),
  // "Whispering Pines Municipal, ten past nine." The drive out to the field.
  [TIME_EVENT_IDS.DEPART_AIRSTRIP]: Object.freeze({
    atLeast: Object.freeze({ day: 2, timeMinutes: 9 * 60 + 10 }),
  }),
  // The return leg is flown at dusk; the mission ends after dark.
  [TIME_EVENT_IDS.COMPLETE_AIRSTRIP]: Object.freeze({
    atLeast: Object.freeze({ day: 2, timeMinutes: 20 * 60 + 30 }),
  }),
  // The club again, late the same evening Lou calls him back in.
  [TIME_EVENT_IDS.DEPART_BADA_BING_TWO]: Object.freeze({
    atLeast: Object.freeze({ day: 2, timeMinutes: 23 * 60 }),
  }),
  // Lockdown, cleanup, loading the body, and the drive into the woods.
  [TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 15 }),
  }),
  // Lou's assignment lands after the club crosses midnight.
  [TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 45 }),
  }),
  // The drive out to the Motel, straight from the club.
  [TIME_EVENT_IDS.DEPART_JERKY_MOTEL]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 60 + 30 }),
  }),
  // Deal, betrayal, recovery, and the getaway end before dawn.
  [TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 4 * 60 + 30 }),
  }),
  // A deliberately vague call, then the drive down to South Harbor.
  [TIME_EVENT_IDS.DEPART_NO_WAKE]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 12 * 60 + 45 }),
  }),
  // Dock work, the run offshore, and the silent return consume the afternoon.
  [TIME_EVENT_IDS.COMPLETE_NO_WAKE]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 16 * 60 + 40 }),
  }),
  /* Day 3 turns through NO WAKE first. He wakes at noon off the back of the
   * Motel, completes the harbor job, takes Margo's afternoon call, and leaves
   * at half seven for a nine o'clock table -- the Silver Room's own evening. */
  [TIME_EVENT_IDS.DEPART_SILVER_ROOM]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 19 * 60 + 30 }),
  }),
  // Dinner, a set by the Midnight Pines, and the walk out the front.
  [TIME_EVENT_IDS.COMPLETE_SILVER_ROOM]: Object.freeze({
    atLeast: Object.freeze({ day: 3, timeMinutes: 23 * 60 + 20 }),
  }),
  /* Margo wakes him at seven. Lou's short invitation sends Tony out at half
   * seven for an eight-o'clock tee time; three holes and the return trip put
   * him back in the flat before THE TAKE begins. */
  [TIME_EVENT_IDS.DEPART_SILVER_PINES]: Object.freeze({
    atLeast: Object.freeze({ day: 4, timeMinutes: 7 * 60 + 30 }),
  }),
  [TIME_EVENT_IDS.COMPLETE_SILVER_PINES]: Object.freeze({
    atLeast: Object.freeze({ day: 4, timeMinutes: 10 * 60 + 30 }),
  }),
  // After the round, Lou's crew collects Tony late that morning.
  [TIME_EVENT_IDS.DEPART_BANK_HEIST]: Object.freeze({
    atLeast: Object.freeze({ day: 4, timeMinutes: 11 * 60 + 15 }),
  }),
  // Briefing, bank, withdrawal, pursuit, swap, and the count fill the day.
  [TIME_EVENT_IDS.COMPLETE_BANK_HEIST]: Object.freeze({
    atLeast: Object.freeze({ day: 4, timeMinutes: 17 * 60 + 20 }),
  }),
  /* THE TAKE ends at 5:20 PM on Day 4.  The final chapter opens on the next
   * afternoon, without adding another playable apartment detour: Ape's pickup
   * and the off-screen rendezvous land The Silver Case at 4 PM on Day 5. */
  [TIME_EVENT_IDS.DEPART_SILVER_CASE]: Object.freeze({
    atLeast: Object.freeze({ day: 5, timeMinutes: 16 * 60 }),
  }),
  // Car ride, apartment takeover, ambush, aftermath, and recovery of the case.
  [TIME_EVENT_IDS.COMPLETE_SILVER_CASE]: Object.freeze({ minutes: 90 }),
  /* The big night is the day after the date. Sleeping off the Silver Room is
   * what turns the page, so the ceremony lands on Day 4 at seven sharp. */
  [TIME_EVENT_IDS.DEPART_INITIATION]: Object.freeze({
    atLeast: Object.freeze({ day: 4, timeMinutes: 19 * 60 }),
  }),
  /* Speech, quiz, execution, gauntlet, roar, anointing: a long evening at the
   * bonfire. Exact-once, so replaying a failed rite never farms hours. */
  [TIME_EVENT_IDS.COMPLETE_INITIATION]: Object.freeze({ minutes: 110 }),
  /* PROJECT SILENT SQUATCH follows the now-routed Silver Case.  The drive is
   * twenty-five minutes and the night in the basement is a little over two
   * hours.  Eight hours in Lou's guest room wakes Tony at 4:10 AM on calendar
   * Day 6; the workbook's "Day 5 night" label describes the overnight begun on
   * Day 5, just as HotDog's Day 2 night already crosses calendar midnight. */
  [TIME_EVENT_IDS.DEPART_MANSION]: Object.freeze({ minutes: 25 }),
  [TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH]: Object.freeze({ minutes: 135 }),
  [TIME_EVENT_IDS.REST_AT_MANSION]: Object.freeze({ minutes: 8 * 60 }),
  // Guest-room wake through the Sasole handoff at the end of the assault.
  [TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE]: Object.freeze({ minutes: 120 }),
  /* The house survives at dawn.  Repair, mission planning, and aircraft prep
   * consume the day; Enola opens on the last of the Day 6 afternoon, matching
   * the airfield runtime's visible daylight-to-nightfall cut. */
  [TIME_EVENT_IDS.DEPART_ENOLA_SQUATCH]: Object.freeze({
    atLeast: Object.freeze({ day: 6, timeMinutes: 14 * 60 }),
  }),
  [TIME_EVENT_IDS.COMPLETE_ENOLA_SQUATCH]: Object.freeze({ minutes: 4 * 60 }),
  [TIME_EVENT_IDS.RETURN_TO_MANSION]: Object.freeze({ minutes: 30 }),
  [TIME_EVENT_IDS.COMPLETE_MANSION_RETURN]: Object.freeze({ minutes: 45 }),
  /* Lou holds the raid until full dark.  The estate approach therefore keeps
   * its Day 6 night label even if a faster preceding scene finishes early. */
  [TIME_EVENT_IDS.DEPART_CARTEL_PALACE]: Object.freeze({
    atLeast: Object.freeze({ day: 6, timeMinutes: 20 * 60 + 30 }),
  }),
  [TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE]: Object.freeze({ minutes: 150 }),
  // The phone call, getting changed, and going down to a car already running.
  [TIME_EVENT_IDS.DEPART_SPECIAL_MEETING]: Object.freeze({ minutes: 35 }),
  /* Forty-two minutes, per Seff, who is not being funny; then the spur, the
   * boot, and the walk in. */
  [TIME_EVENT_IDS.COMPLETE_SPECIAL_MEETING]: Object.freeze({ minutes: 65 }),
});
const MINUTES_PER_DAY = 24 * 60;

export const CAMPAIGN_VERSION = 18;

/**
 * What finishing PROJECT SILENT SQUATCH is worth to the Family, on the 0-100
 * scale `story.familyRespect` is kept in.
 *
 * This mission is the first thing in the campaign to write that field, so the
 * scale is stated here rather than inferred: 0 is a prospect nobody has an
 * opinion about, 100 is a made man. Locking six people in a room and pulling
 * the switch yourself, at Booski's word and in front of him, is worth fifteen
 * of it -- a real step, not a promotion.
 */
export const SILENT_SQUATCH_RESPECT = 15;

/** Which beat of the night a Silent Squatch save resumes at. */
export const SILENT_SQUATCH_CHECKPOINT_IDS = Object.freeze([
  'office',
  'basement',
  'lab',
  'core_complete',
  'locked',
  'aubbie_down',
  'silent_night',
  'clear',
]);

/**
 * The quiet mansion evening's settling-in beats.
 *
 * Owner note, 2026-08-19: the theatre, the pool and the rest of the evening
 * were built and nobody saw them, because the guest bed was available the
 * moment Lou said goodnight. The bed now wants ANY TWO of these done first.
 * Persisted per-id rather than as a counter so a reload mid-evening keeps
 * credit for the exact things he did, and so a save cannot bank the same
 * beat twice.
 *
 *   theatre  a picture running in the basement theatre, or a seat taken in it
 *   pool     the pool-deck dress-strap exchange, either performer's
 *   bar      a Jack And Daniels off the bartender in the billiard bay
 *   dog      Lil Tom Cruze, petted, on the third floor
 *   lan      Shubes and his RuneScape account, in the LAN room
 */
export const MANSION_EVENING_BEAT_IDS = Object.freeze([
  'theatre',
  'pool',
  'bar',
  'dog',
  'lan',
]);
/** How many of those the bed asks for. Any two; the list is the menu. */
export const MANSION_EVENING_BEATS_REQUIRED = 2;
export const CAMPAIGN_STORAGE_KEY = 'squatchlife.campaign';
export const CAMPAIGN_RECOVERY_KEY = `${CAMPAIGN_STORAGE_KEY}.recovery`;

/**
 * Which beat of the boat a NO WAKE save resumes at.
 *
 * Exported because `src/core/no-wake-story.js` has to use exactly this list and
 * cannot be the one that owns it (it imports this module). The persisted state
 * is normalised against this whitelist on every read, so a checkpoint the
 * scene banks but this list does not know is silently discarded -- which is
 * what happened when `weighted` was added to the story and not to here: the
 * mission wrote it, the next read turned it into null, and a player who
 * stopped after clipping the ballast on would have resumed from nothing.
 */
export const NO_WAKE_CHECKPOINT_IDS = Object.freeze([
  'dock',
  'underway',
  'open_water',
  'execution',
  'weighted',
  'returned',
]);

export const BANK_HEIST_CHECKPOINT_IDS = Object.freeze([
  'safehouse_ready',
  'bank_secured',
  'vault_open',
  'street_withdrawal',
  'mercer_garage',
  'vehicle_swap',
]);

export const BANK_HEIST_OUTCOMES = Object.freeze([
  'professional',
  'hard_exit',
  'costly_success',
  'barely_clean',
]);

export const SILVER_CASE_CHECKPOINT_IDS = Object.freeze([
  'car_ride', 'hallway', 'apartment', 'case_reveal', 'bathroom_ambush',
  'aftermath', 'case_recovered',
]);

export const MANSION_SIEGE_CHECKPOINT_IDS = Object.freeze([
  'wake', 'armed', 'briefed', 'wave_one',
]);

/** The small combat subset that must survive a full page/campaign reload. */
export function normalizeMansionSiegeCheckpointSnapshot(snapshot, expectedName = null) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const name = MANSION_SIEGE_CHECKPOINT_IDS.includes(snapshot.name)
    ? snapshot.name : null;
  if (!name || (expectedName && name !== expectedName)) return null;
  const health = Number(snapshot.health);
  const armor = Number(snapshot.armor);
  const triageCharges = Number(snapshot.supplies?.triageCharges);
  const resupplyCharges = Number(snapshot.supplies?.resupplyCharges);
  if (![health, armor, triageCharges, resupplyCharges].every(Number.isFinite)) return null;
  return {
    name,
    health: Math.max(1, Math.min(100, health)),
    armor: Math.max(0, Math.min(75, armor)),
    supplies: {
      triageCharges: Math.max(0, Math.min(2, Math.trunc(triageCharges))),
      resupplyCharges: Math.max(0, Math.min(2, Math.trunc(resupplyCharges))),
    },
  };
}

export const ENOLA_SQUATCH_CHECKPOINT_IDS = Object.freeze([
  'takeoff', 'turnOnCourse', 'preRelease', 'return',
]);

export const ENOLA_SQUATCH_RANKS = Object.freeze([
  'Woke the Neighbours',
  'Delivered, Eventually',
  'Certified Heavy Aviator',
  'Night Ops Professional',
  'Express Shipping',
]);

export const ENOLA_SQUATCH_UNLOCKS = Object.freeze([
  'Enola Squatch Flight Jacket',
  'Fat Squatch Dashboard Ornament',
  'Achievement: EXPRESS SHIPPING',
  'Achievement: TAIL-END CHARLIE',
  'Achievement: NOT A SCRATCH',
]);

const enolaUnit = (value) => (Number.isFinite(value)
  ? Math.max(0, Math.min(1, value)) : null);
const enolaNonNegative = (value, max) => (Number.isFinite(value)
  ? Math.max(0, Math.min(max, value)) : null);

/**
 * Reduce MissionController's in-memory checkpoint to the plain data its
 * restore/report paths actually consume. Vector/quaternion pose and weather
 * are intentionally omitted: each checkpoint's canonical setup owns them.
 */
export function normalizeEnolaCheckpointSnapshot(snapshot, expectedName = null) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const name = ENOLA_SQUATCH_CHECKPOINT_IDS.includes(snapshot.name)
    ? snapshot.name : null;
  if (!name || (expectedName && name !== expectedName)) return null;
  if (!snapshot.score || typeof snapshot.score !== 'object'
    || !snapshot.damage || typeof snapshot.damage !== 'object'
    || !snapshot.targeting || typeof snapshot.targeting !== 'object') return null;
  const requiredScoreFields = [
    'takeoff', 'finalLanding', 'patrolPeak', 'flightTime', 'fuelRemaining',
    'damage', 'bombAccuracy', 'expressShipping', 'corridorScore',
    'fightersDestroyed', 'fighterPasses', 'autopilotSeconds', 'blastDistance',
  ];
  if (!requiredScoreFields.every((field) => Object.prototype.hasOwnProperty.call(snapshot.score, field))) {
    return null;
  }

  const scoreTime = enolaNonNegative(snapshot.targeting.scoreTime, 86400);
  const scoreSum = enolaNonNegative(snapshot.targeting.scoreSum, 86400);
  if (scoreTime === null || scoreSum === null || scoreSum > scoreTime) return null;

  const nullableUnit = (value) => (value === null ? null : enolaUnit(value));
  const nullableDistance = (value) => (value === null
    ? null : enolaNonNegative(value, 100000));
  const score = {
    takeoff: nullableUnit(snapshot.score.takeoff),
    finalLanding: nullableUnit(snapshot.score.finalLanding),
    patrolPeak: enolaUnit(snapshot.score.patrolPeak),
    flightTime: enolaNonNegative(snapshot.score.flightTime, 86400),
    fuelRemaining: enolaUnit(snapshot.score.fuelRemaining),
    damage: enolaUnit(snapshot.score.damage),
    bombAccuracy: nullableUnit(snapshot.score.bombAccuracy),
    expressShipping: snapshot.score.expressShipping === true,
    corridorScore: scoreTime > 0 ? scoreSum / scoreTime : 0,
    fightersDestroyed: enolaNonNegative(snapshot.score.fightersDestroyed, 999),
    fighterPasses: enolaNonNegative(snapshot.score.fighterPasses, 999),
    autopilotSeconds: enolaNonNegative(snapshot.score.autopilotSeconds, 86400),
    blastDistance: nullableDistance(snapshot.score.blastDistance),
  };
  if (Object.entries(score).some(([key, value]) => key !== 'expressShipping' && value === null
    && !['takeoff', 'finalLanding', 'bombAccuracy', 'blastDistance'].includes(key))) return null;

  const fuel = enolaNonNegative(snapshot.fuel, 3000);
  const wing = enolaUnit(snapshot.damage.wing);
  const gear = enolaUnit(snapshot.damage.gear);
  if (fuel === null || wing === null || gear === null) return null;

  return {
    name,
    fuel,
    damage: {
      wing,
      gear,
      tireBurst: snapshot.damage.tireBurst === true,
    },
    targeting: { scoreSum, scoreTime },
    score: {
      ...score,
      fightersDestroyed: Math.round(score.fightersDestroyed),
      fighterPasses: Math.round(score.fighterPasses),
    },
  };
}

export const CARTEL_PALACE_CHECKPOINT_IDS = Object.freeze([
  'approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear',
]);

export const CARTEL_PALACE_EVIDENCE_IDS = Object.freeze([
  'sauce_belongings', 'sauce_payment_ledger', 'sauce_security_still',
]);

export const CARTEL_PALACE_ALARM_REASONS = Object.freeze([
  'detected', 'guard_contact', 'gunshot',
]);

export const CARTEL_PALACE_OUTCOMES = Object.freeze([
  'clean', 'hard_exit', 'costly_success',
]);

const CARTEL_PALACE_COMBAT_VERSION = 1;
const CARTEL_PALACE_SECURITY_ALARM_REASONS = Object.freeze([
  ...CARTEL_PALACE_ALARM_REASONS,
  'dining_room',
]);
const CARTEL_PALACE_INJURY_GRADES = Object.freeze([
  'none', 'minor', 'moderate', 'severe',
]);

function palaceFinite(value, min, max, fallback = null, integer = false) {
  if (!Number.isFinite(value)) return fallback;
  const bounded = Math.max(min, Math.min(max, value));
  return integer ? Math.trunc(bounded) : bounded;
}

function palaceIdentifier(value, { prefix = '', max = 96 } = {}) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && (!prefix || value.startsWith(prefix))
    ? value : null;
}

function palacePoint(value, limit = 1000) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const point = value.slice(0, 3).map((axis) => palaceFinite(axis, -limit, limit));
  return point.every((axis) => axis !== null) ? point : null;
}

function normalizePalaceActor(snapshot, expectedId = null) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const id = palaceIdentifier(snapshot.id);
  if (!id || (expectedId && id !== expectedId)) return null;
  const health = palaceFinite(snapshot.health, 0, 10000);
  const armor = palaceFinite(snapshot.armor, 0, 10000);
  const maxArmor = palaceFinite(snapshot.maxArmor, 0, 10000);
  if ([health, armor, maxArmor].some((value) => value === null)) return null;
  const role = snapshot.role == null ? null : palaceIdentifier(snapshot.role, { max: 48 });
  return {
    version: 1,
    id,
    health,
    armor: Math.min(armor, Math.max(maxArmor, armor)),
    maxArmor: Math.max(maxArmor, armor),
    injury: CARTEL_PALACE_INJURY_GRADES.includes(snapshot.injury)
      ? snapshot.injury : 'none',
    incapacitated: snapshot.incapacitated === true,
    suppression: palaceFinite(snapshot.suppression, 0, 1, 0),
    role,
  };
}

function normalizePalaceFirearm(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const id = palaceIdentifier(snapshot.id);
  const rounds = palaceFinite(snapshot.rounds, 0, 100000, null, true);
  const reserve = palaceFinite(snapshot.reserve, 0, 100000, null, true);
  if (!id || !FINAL_ARC_WEAPON_CATALOG[id]
    || rounds === null || reserve === null) return null;
  return { id, rounds, reserve };
}

function normalizePalacePerception(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const awareness = palaceFinite(snapshot.awareness, 0, 1);
  const memory = palaceFinite(snapshot.memory, 0, 3600);
  const lastSeen = snapshot.lastSeen == null ? null : palacePoint(snapshot.lastSeen);
  if (awareness === null || memory === null
    || (snapshot.lastSeen != null && !lastSeen)) return null;
  return { version: 1, awareness, memory, lastSeen };
}

function normalizePalaceImpairments(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const stagger = palaceFinite(snapshot.stagger, 0, 3600);
  const armWound = palaceFinite(snapshot.armWound, 0, 1);
  const legWound = palaceFinite(snapshot.legWound, 0, 1);
  if ([stagger, armWound, legWound].some((value) => value === null)) return null;
  return { stagger, armWound, legWound };
}

function normalizePalaceAim(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const yaw = palaceFinite(snapshot.yaw, -Math.PI * 8, Math.PI * 8);
  const desiredYaw = palaceFinite(snapshot.desiredYaw, -Math.PI * 8, Math.PI * 8);
  const pitch = palaceFinite(snapshot.pitch, -Math.PI / 2, Math.PI / 2);
  const desiredPitch = palaceFinite(snapshot.desiredPitch, -Math.PI / 2, Math.PI / 2);
  const aimError = snapshot.aimError == null
    ? null : palaceFinite(snapshot.aimError, 0, Math.PI * 2);
  const boreError = snapshot.boreError == null
    ? null : palaceFinite(snapshot.boreError, 0, Math.PI * 2);
  if ([yaw, desiredYaw, pitch, desiredPitch].some((value) => value === null)
    || (snapshot.aimError != null && aimError === null)
    || (snapshot.boreError != null && boreError === null)) return null;
  return { yaw, desiredYaw, pitch, desiredPitch, aimError, boreError };
}

function normalizePalaceSecurity(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.entries)) return null;
  const entries = [];
  const seen = new Set();
  for (const record of snapshot.entries.slice(0, 32)) {
    if (!record || typeof record !== 'object') continue;
    const id = palaceIdentifier(record.id);
    const position = palacePoint(record.position);
    const actor = id ? normalizePalaceActor(record.actor, `palace-${id}`) : null;
    const firearm = normalizePalaceFirearm(record.firearm);
    const perception = normalizePalacePerception(record.perception);
    const impairments = normalizePalaceImpairments(record.impairments);
    const suppressionValue = palaceFinite(record.suppression?.value, 0, 1, 0);
    const aim = normalizePalaceAim(record.aim);
    const yaw = palaceFinite(record.yaw, -Math.PI * 8, Math.PI * 8);
    const patrolIndex = palaceFinite(record.patrolIndex, 0, 10000, 0, true);
    const shotClock = palaceFinite(record.shotClock, 0, 3600, 0);
    const tacticTime = palaceFinite(record.tacticTime, 0, 3600, 0);
    const tacticalPost = record.tacticalPost == null
      ? null : palaceIdentifier(record.tacticalPost, { max: 96 });
    if (!id || seen.has(id) || !position || !actor || !firearm
      || !perception || !impairments || !aim || yaw === null) continue;
    seen.add(id);
    entries.push({
      id,
      active: record.active === true,
      down: record.down === true,
      phase: record.phase == null ? null : palaceIdentifier(record.phase, { max: 48 }),
      position,
      yaw,
      patrolIndex,
      actor,
      firearm,
      perception,
      impairments,
      suppression: { version: 1, value: suppressionValue },
      aim,
      shotClock,
      tacticTime,
      tacticalPost,
    });
  }
  if (!entries.length && snapshot.entries.length) return null;
  const stats = snapshot.stats && typeof snapshot.stats === 'object' ? snapshot.stats : {};
  const targetsDown = uniqueStrings(stats.targetsDown)
    .filter((id) => palaceIdentifier(id))
    .slice(0, 32);
  return {
    version: 1,
    alarm: snapshot.alarm === true,
    alarmReason: CARTEL_PALACE_SECURITY_ALARM_REASONS.includes(snapshot.alarmReason)
      ? snapshot.alarmReason : null,
    stats: {
      takedowns: palaceFinite(stats.takedowns, 0, 1000000, 0, true),
      alerts: palaceFinite(stats.alerts, 0, 1000000, 0, true),
      roundsFired: palaceFinite(stats.roundsFired, 0, 1000000, 0, true),
      targetsDown,
      blockedMoves: palaceFinite(stats.blockedMoves, 0, 1000000, 0, true),
      nearMisses: palaceFinite(stats.nearMisses, 0, 1000000, 0, true),
    },
    fireControl: {
      version: 1,
      whizCooldown: palaceFinite(snapshot.fireControl?.whizCooldown, 0, 3600, 0),
    },
    entries,
  };
}

/** Versioned JSON-safe Palace checkpoint spanning every durable combat owner. */
export function normalizeCartelPalaceCheckpointSnapshot(snapshot, expectedName = null) {
  if (!snapshot || typeof snapshot !== 'object'
    || snapshot.version !== CARTEL_PALACE_COMBAT_VERSION) return null;
  const name = CARTEL_PALACE_CHECKPOINT_IDS.includes(snapshot.name)
    ? snapshot.name : null;
  if (!name || (expectedName && name !== expectedName)) return null;
  const actor = normalizePalaceActor(snapshot.player?.actor, CHARACTER_IDS.PROSPECT);
  const suppressionValue = palaceFinite(snapshot.player?.suppression?.value, 0, 1);
  const security = normalizePalaceSecurity(snapshot.security);
  if (!actor || suppressionValue === null || !snapshot.loadout
    || typeof snapshot.loadout !== 'object' || !security) return null;
  return {
    version: CARTEL_PALACE_COMBAT_VERSION,
    name,
    player: {
      actor,
      suppression: { version: 1, value: suppressionValue },
    },
    loadout: normalizeFinalArcLoadoutSnapshot(snapshot.loadout),
    security,
  };
}

function initialFinalArcMissions() {
  return {
    [MISSION_IDS.SILVER_CASE]: {
      status: 'locked',
      checkpoint: null,
      caseRecovered: false,
      winstonOutcome: null,
      irritatedApe: false,
      apeFinishedChester: false,
      apeFinishedWinston: false,
    },
    [MISSION_IDS.MANSION_SIEGE]: {
      status: 'locked',
      checkpoint: null,
      checkpointSnapshot: null,
      attackersDown: 0,
      littleFriendSaid: false,
      sasoleMet: false,
    },
    [MISSION_IDS.ENOLA_SQUATCH]: {
      status: 'locked',
      checkpoint: null,
      checkpointSnapshot: null,
      rank: null,
      score: 0,
      unlocks: [],
      payloadReleased: false,
      returnedHome: false,
    },
    [MISSION_IDS.MANSION_RETURN]: {
      status: 'locked',
      briefingComplete: false,
      wrongCityConfirmed: false,
      sauceMissingConfirmed: false,
      palaceLocationKnown: false,
    },
    [MISSION_IDS.CARTEL_PALACE]: {
      status: 'locked',
      checkpoint: null,
      checkpointSnapshot: null,
      evidenceFound: [],
      sauceBetrayalConfirmed: false,
      alarmRaised: false,
      alarmReason: null,
      markEliminated: false,
      sauceEliminated: false,
      outcome: null,
    },
  };
}

const MEMORIAL_GRAVE_IDS = Object.freeze([
  'babs', 'brawny', 'whiplash', 'sheep', 'echo', 'colton', 'geewiz', 'sauce',
]);
const TRAITOR_GRAVE_IDS = Object.freeze(['brawny', 'whiplash']);

const SCENES = Object.freeze({
  [SCENE_IDS.APARTMENT]: Object.freeze({
    href: 'index.html',
    defaultSpawn: 'wake',
    spawns: Object.freeze(['wake', 'front_door', 'motel_retry']),
    next: Object.freeze([
      SCENE_IDS.BADA_BING_ONE,
      SCENE_IDS.SQUATCHFATHER,
      SCENE_IDS.AIRSTRIP_SMUGGLING,
      SCENE_IDS.BADA_BING_TWO,
      SCENE_IDS.SQUATCH_GRAVEYARD,
      SCENE_IDS.JERKY_MOTEL,
      SCENE_IDS.NO_WAKE,
      SCENE_IDS.SILVER_ROOM,
      SCENE_IDS.SILVER_PINES,
      SCENE_IDS.BANK_HEIST,
      SCENE_IDS.SILVER_CASE,
      SCENE_IDS.INITIATION,
      SCENE_IDS.MANSION,
    ]),
  }),
  [SCENE_IDS.BADA_BING_ONE]: Object.freeze({
    href: 'bing.html',
    defaultSpawn: 'driver_seat',
    spawns: Object.freeze(['driver_seat', 'club_entrance']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.SQUATCHFATHER]: Object.freeze({
    href: 'squatchfather.html',
    defaultSpawn: 'restaurant_exterior',
    spawns: Object.freeze(['restaurant_exterior', 'development_entry']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: Object.freeze({
    href: 'beefrun.html',
    defaultSpawn: 'hangar',
    spawns: Object.freeze(['hangar']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.BADA_BING_TWO]: Object.freeze({
    href: 'bing.html?visit=2',
    defaultSpawn: 'driver_seat',
    spawns: Object.freeze(['driver_seat', 'club_entrance']),
    next: Object.freeze([SCENE_IDS.SQUATCH_GRAVEYARD]),
  }),
  [SCENE_IDS.SQUATCH_GRAVEYARD]: Object.freeze({
    href: 'graveyard.html',
    defaultSpawn: 'headlights',
    spawns: Object.freeze(['headlights']),
    next: Object.freeze([SCENE_IDS.JERKY_MOTEL]),
  }),
  [SCENE_IDS.JERKY_MOTEL]: Object.freeze({
    href: 'motel.html',
    defaultSpawn: 'passenger_seat',
    spawns: Object.freeze(['passenger_seat']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.NO_WAKE]: Object.freeze({
    href: 'nowake.html',
    defaultSpawn: 'gate_c',
    spawns: Object.freeze(['gate_c']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  /* The date. One continuous scene with no loads of its own, so it has a single
   * spawn on the pavement where the hired car drops them, and it comes home the
   * way every other mission does. */
  [SCENE_IDS.SILVER_ROOM]: Object.freeze({
    href: 'silver.html',
    defaultSpawn: 'kerb',
    spawns: Object.freeze(['kerb']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  /* Silver Pines is a three-hole Day 4 morning chapter. Two spawns keep the
   * ordinary car-park arrival and the first-tee preview seam explicit. */
  [SCENE_IDS.SILVER_PINES]: Object.freeze({
    href: 'golf.html',
    defaultSpawn: 'car_park',
    spawns: Object.freeze(['car_park', 'first_tee']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  /* THE TAKE owns all of its internal phases and checkpoints behind one scene
   * boundary. Preview spawns expose those phases without inventing campaign
   * transitions between rooms inside a single mission. */
  [SCENE_IDS.BANK_HEIST]: Object.freeze({
    href: 'heist.html',
    defaultSpawn: 'safehouse',
    spawns: Object.freeze([
      'safehouse',
      'bank_lobby',
      'vault_open',
      'street_withdrawal',
      'mercer_garage',
      'vehicle_escape',
      'safehouse_debrief',
    ]),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.SILVER_CASE]: Object.freeze({
    href: 'silvercase.html',
    defaultSpawn: 'car_ride',
    spawns: Object.freeze(['car_ride', 'hallway', 'apartment']),
    next: Object.freeze([SCENE_IDS.MANSION]),
  }),
  /* The Initiation is registered so the apartment door can route to it through
   * ordinary campaign state. Gap G1 minimal relief (see
   * docs/GAME-FLOW-AND-FINISH-PLAN-2026-08-05.md §7 phase 1): the scene now
   * claims itself on boot, writes COMPLETE_INITIATION at the anointing, and
   * this TEMPORARY edge home means no save can ever be trapped in a terminal
   * scene. The story itself is still the frozen, owner-gated build — the
   * approved rewrite replaces this edge with the real one. */
  [SCENE_IDS.INITIATION]: Object.freeze({
    href: 'initiation.html',
    defaultSpawn: 'gathering',
    spawns: Object.freeze(['gathering']),
    next: Object.freeze([SCENE_IDS.APARTMENT]),
  }),
  /* Lou's mansion. One scene, three spawns: the gate he is dropped at, the
   * foyer, and the cellar -- which is a resume point rather than a route, for
   * a save that comes back after the wall in the wine cellar is already open.
   * It comes home the way every other mission does. */
  [SCENE_IDS.MANSION]: Object.freeze({
    href: 'mansion.html',
    defaultSpawn: 'gate',
    spawns: Object.freeze(['gate', 'foyer', 'cellar']),
    next: Object.freeze([SCENE_IDS.MANSION_SIEGE, SCENE_IDS.APARTMENT]),
  }),
  [SCENE_IDS.MANSION_SIEGE]: Object.freeze({
    href: 'mansion-siege.html',
    defaultSpawn: 'guest_suite',
    spawns: Object.freeze(['guest_suite', 'armory', 'foyer', 'balcony']),
    next: Object.freeze([SCENE_IDS.ENOLA_SQUATCH]),
  }),
  [SCENE_IDS.ENOLA_SQUATCH]: Object.freeze({
    href: 'enolasquatch.html',
    defaultSpawn: 'airfield',
    spawns: Object.freeze(['airfield', 'flight_deck', 'target', 'return_leg']),
    next: Object.freeze([SCENE_IDS.MANSION_RETURN]),
  }),
  [SCENE_IDS.MANSION_RETURN]: Object.freeze({
    href: 'mansion.html?visit=return',
    defaultSpawn: 'driveway',
    spawns: Object.freeze(['driveway', 'foyer', 'office']),
    next: Object.freeze([SCENE_IDS.CARTEL_PALACE]),
  }),
  [SCENE_IDS.CARTEL_PALACE]: Object.freeze({
    /* Two edges, and the second one is a bridge that should be pulled.
     *
     * SPECIAL_MEETING is the canonical route: the Palace is over, Booski
     * rings, and three men come and collect him. INITIATION is the edge that
     * was here before, and it stays legal only because the Palace's own exit
     * button (`src/cartel-palace/main.js`) still names it -- and a transition
     * the graph refuses THROWS rather than degrading, which would strand
     * anybody who finished the Palace. Repoint that button at
     * SCENE_IDS.SPECIAL_MEETING and this list becomes one entry. */
    href: 'cartel-palace.html',
    defaultSpawn: 'approach',
    spawns: Object.freeze(['approach', 'perimeter', 'estate', 'dining_room']),
    next: Object.freeze([SCENE_IDS.SPECIAL_MEETING, SCENE_IDS.INITIATION]),
  }),
  /* THE SPECIAL MEETING.
   *
   * Two spawns, because the scene is two places with a cut to black between
   * them: `kerb` is the street outside the flat with the car already running,
   * and `spur` is the flat patch of dirt in the woods where it stops. A save
   * that comes back after the drive resumes at the spur rather than replaying
   * the drive, which is the only part of this scene that takes real minutes.
   *
   * It goes one place. It has always gone one place. */
  [SCENE_IDS.SPECIAL_MEETING]: Object.freeze({
    href: 'specialmeeting.html',
    defaultSpawn: 'kerb',
    spawns: Object.freeze(['kerb', 'spur']),
    next: Object.freeze([SCENE_IDS.INITIATION]),
  }),
});

function normalizedSpawn(sceneId, spawn) {
  const scene = SCENES[sceneId];
  return scene?.spawns.includes(spawn) ? spawn : scene?.defaultSpawn;
}

function requiredSpawn(sceneId, spawn) {
  const scene = SCENES[sceneId];
  const requested = spawn ?? scene?.defaultSpawn;
  if (!scene?.spawns.includes(requested)) {
    throw new Error(`Unknown spawn "${requested}" for scene "${sceneId}"`);
  }
  return requested;
}

function initialState() {
  return {
    version: CAMPAIGN_VERSION,
    revision: 0,
    scene: {
      id: SCENE_IDS.APARTMENT,
      spawn: 'wake',
    },
    story: {
      chapter: 'day_one',
      day: 1,
      timeMinutes: 6 * 60 + 4,
      meetingKnown: false,
      meetingLearnedFrom: null,
      timeEvents: [],
      /* How the Family regards him, 0-100. See SILENT_SQUATCH_RESPECT. */
      familyRespect: 0,
    },
    activities: {
      eaten: false,
      showered: false,
      peed: false,
      pooped: false,
      changedClothes: false,
      emailChecked: false,
      whiskeyRelaxed: false,
      /* The per-chapter pastimes — see CHAPTER_PASTIMES in apartment-story.js.
       * They are latched here rather than derived every frame because the flat
       * is rebuilt from nothing on every arrival: half a minute of the news
       * watched before the airstrip has to still be watched when he lets
       * himself back in afterwards. `sleep()` clears all four on a chapter
       * turn, so each one is only ever earned in the chapter that asks. */
      watchedTv: false,
      playedCounterSquatch: false,
      playedSquatchShoot: false,
      playedSquatchSmash: false,
      tookShrooms: false,
    },
    /* 97.8 is one running station heard through several physical receivers.
     * The running order and bulletin history are shared, while each receiver
     * remembers its own power switch. */
    radio: {
      volume: 0.70,
      cursor: 0,
      cycle: 0,
      selections: {},
      songReactionCursor: 0,
      adReactionCursor: 0,
      heardBulletins: [],
      receivers: {},
    },
    inventory: {
      carried: [],
      concealed: [],
    },
    /* The frozen Initiation earns this handoff; the Apartment owns presenting
     * credits and releasing the same save into post-campaign freeplay. */
    finale: {
      status: 'locked',
      creditsViewed: false,
      freeplayUnlocked: false,
      completedAt: null,
    },
    missions: {
      [MISSION_IDS.BADA_BING_ONE]: {
        status: 'locked',
        packageReceived: false,
        ending: null,
      },
      [MISSION_IDS.SQUATCHFATHER]: {
        status: 'locked',
        weaponStaged: false,
        weaponDropped: false,
      },
      [MISSION_IDS.AIRSTRIP_SMUGGLING]: {
        status: 'locked',
        checkpoint: null,
        cargoLoaded: false,
        detected: false,
        /* How the landing went, in the vocabulary the readers use — see
         * LANDING_QUALITIES in airstrip-story.js. `rank` is the end card's
         * display string and is presentation only; nothing branches on it. */
        landingQuality: null,
        rank: null,
        /* What the run actually sent home with you. The end card used to
         * promise six trophies out of a hard-coded array that reached no save
         * at all, which is the owner's question — "do we actually get all the
         * things rewards from this back in the apartment after?" These are the
         * ones that were earned, kept as facts the way PROJECT SILENT SQUATCH
         * keeps its trophy, so the flat can fold a shelf out of them. */
        unlocks: [],
        packagesDelivered: 0,
        gunsDelivered: 0,
      },
      [MISSION_IDS.BADA_BING_TWO]: {
        status: 'locked',
        checkpoint: null,
        assignment: null,
        attackResolved: false,
        cleanupTasks: [],
        bodyWrapped: false,
        bodyLoaded: false,
        burialComplete: false,
        echoHeard: false,
        inspectedGraves: [],
        respectedGraves: [],
        urinatedOn: [],
      },
      [MISSION_IDS.JERKY_MOTEL]: {
        status: 'locked',
        ending: null,
        cargoRecovered: false,
        packagesIntact: 0,
        freshness: 0,
        policeHeat: 0,
      },
      [MISSION_IDS.NO_WAKE]: {
        status: 'locked',
        checkpoint: null,
        betrayalConfirmed: false,
        playerFired: false,
        bodyDisposed: false,
      },
      /* The date's durable summary. The mission itself keeps a much larger
       * record while it is running; this is only what a later scene could
       * reasonably ask about an evening it did not watch. */
      [MISSION_IDS.SILVER_ROOM]: {
        status: 'locked',
        outcome: null,
        woo: 0,
        band: null,
        tippedEverybody: false,
        rememberedDrink: false,
        seeingHerAgain: false,
        knowsWhatHeDoes: false,
        cameHome: false,
      },
      /* The durable card, plus the two moments later scenes can reasonably
       * remember: Lou explaining the invitation and Tony taking the ride. */
      [MISSION_IDS.SILVER_PINES]: {
        status: 'locked',
        holesPlayed: 0,
        strokes: 0,
        penalties: 0,
        toPar: 0,
        holes: [],
        heardInvitation: false,
        rodeWithLou: false,
        ace: false,
        foundWater: false,
        hitGreenInRegulation: false,
        grandfathered: false,
      },
      [MISSION_IDS.BANK_HEIST]: {
        status: 'locked',
        checkpoint: null,
        briefingComplete: false,
        preparationComplete: false,
        preparation: {
          armor: false,
          gloves: false,
          mask: false,
          carbine: false,
          sidearm: false,
          magazines: false,
          duffel: false,
          extraMagazine: false,
        },
        cleanupComplete: false,
        cleanup: {
          washed: false,
          changed: false,
          gearSecured: false,
          finalCalls: false,
        },
        bankEntered: false,
        civiliansHarmed: 0,
        guardsDisarmed: 0,
        alarmTriggered: false,
        vaultOpened: false,
        bagsStaged: 0,
        bagsRecovered: 0,
        grossTake: 0,
        compromisedCash: 0,
        operationalLoss: 0,
        familyShare: 0,
        crewShare: 0,
        prospectShare: 0,
        playerInjury: 'none',
        crewInjuries: {
          [CHARACTER_IDS.SNOW]: 'none',
          [CHARACTER_IDS.RIPPINFLOW]: 'none',
          [CHARACTER_IDS.SHUBENATOR]: 'none',
          [CHARACTER_IDS.DEATHMEGATRON]: 'none',
          [CHARACTER_IDS.NUMBSKULL]: 'none',
        },
        primaryVanLost: false,
        droppedBagRecovered: false,
        optionalVaultBagTaken: false,
        playerDroveEscape: false,
        vehicleDamage: 0,
        policeHeat: 0,
        crewSurvived: true,
        followedSnow: true,
        disciplinedFire: true,
        outcome: null,
      },
      ...initialFinalArcMissions(),
      [MISSION_IDS.INITIATION]: {
        status: 'locked',
      },
      /* PROJECT SILENT SQUATCH. Everything here is a fact a later scene could
       * reasonably know about a night it did not watch: what he did with his
       * own hands, how many people were in the room when he did it, and the
       * four things the house owes him afterwards. */
      [MISSION_IDS.SILENT_SQUATCH]: {
        status: 'locked',
        checkpoint: null,
        casePlaced: false,
        caseDelivered: false,
        labLocked: false,
        aubbieEliminated: false,
        silentNightActivated: false,
        /** How many of the six did not come back up the stairs. */
        scientistsLost: 0,
        /* The rewards, kept as separate facts rather than one "finished"
         * flag, because four different places in the game read them: the
         * mansion basement, the apartment computer, the conspiracy board and
         * the shelf the trophy stands on. */
        basementUnlocked: false,
        notesRecovered: false,
        conspiracyBoard: false,
        trophyAwarded: false,
        eveningReady: false,
        /** Which settling-in beats the quiet evening has banked. See
         * MANSION_EVENING_BEAT_IDS -- the bed wants any two before sleep. */
        eveningBeats: [],
        sleptAtMansion: false,
      },
    },
    events: {
      [EVENT_IDS.LOU_FIRST_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.LOU_ATTABOY_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.BOOSKI_DAY_TWO_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.LOU_SECOND_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.LOU_NO_WAKE_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.MARGO_DATE_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.LOU_GOLF_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.LOU_HEIST_CALL]: {
        status: 'pending',
      },
      [EVENT_IDS.BOOSKI_BIG_NIGHT_CALL]: {
        status: 'pending',
      },
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueStrings(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === 'string'))]
    : [];
}

function normalizedCrewInjuries(value) {
  const allowedIds = [
    CHARACTER_IDS.SNOW,
    CHARACTER_IDS.RIPPINFLOW,
    CHARACTER_IDS.SHUBENATOR,
    CHARACTER_IDS.DEATHMEGATRON,
    CHARACTER_IDS.NUMBSKULL,
  ];
  const allowedGrades = ['none', 'minor', 'moderate', 'severe'];
  return Object.fromEntries(allowedIds.map((id) => [
    id,
    allowedGrades.includes(value?.[id]) ? value[id] : 'none',
  ]));
}

function storyAfterTimeEvent(story, eventId) {
  const event = TIME_EVENTS[eventId];
  const day = Number.isSafeInteger(story?.day) && story.day > 0 ? story.day : 1;
  const timeMinutes = Number.isFinite(story?.timeMinutes) ? story.timeMinutes : 0;
  const before = (day - 1) * MINUTES_PER_DAY + timeMinutes;
  const target = event.atLeast
    ? (event.atLeast.day - 1) * MINUTES_PER_DAY + event.atLeast.timeMinutes
    : before + event.minutes;
  const absolute = Math.max(before, target);
  const timeEvents = uniqueStrings(story?.timeEvents);
  return {
    ...story,
    day: Math.floor(absolute / MINUTES_PER_DAY) + 1,
    timeMinutes: absolute % MINUTES_PER_DAY,
    timeEvents: timeEvents.includes(eventId) ? timeEvents : [...timeEvents, eventId],
  };
}

const FINAL_ARC_TIME_EVENT_ORDER = Object.freeze([
  TIME_EVENT_IDS.DEPART_SILVER_CASE,
  TIME_EVENT_IDS.COMPLETE_SILVER_CASE,
  TIME_EVENT_IDS.DEPART_MANSION,
  TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH,
  TIME_EVENT_IDS.REST_AT_MANSION,
  TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE,
  TIME_EVENT_IDS.DEPART_ENOLA_SQUATCH,
  TIME_EVENT_IDS.COMPLETE_ENOLA_SQUATCH,
  TIME_EVENT_IDS.RETURN_TO_MANSION,
  TIME_EVENT_IDS.COMPLETE_MANSION_RETURN,
  TIME_EVENT_IDS.DEPART_CARTEL_PALACE,
  TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE,
]);

function finalArcTimeEventsReached(saved) {
  const missions = saved.missions ?? {};
  const silverCase = missions[MISSION_IDS.SILVER_CASE] ?? {};
  const silent = missions[MISSION_IDS.SILENT_SQUATCH] ?? {};
  const siege = missions[MISSION_IDS.MANSION_SIEGE] ?? {};
  const enola = missions[MISSION_IDS.ENOLA_SQUATCH] ?? {};
  const mansionReturn = missions[MISSION_IDS.MANSION_RETURN] ?? {};
  const palace = missions[MISSION_IDS.CARTEL_PALACE] ?? {};
  const initiation = missions[MISSION_IDS.INITIATION] ?? {};
  const started = (mission) => ['in_progress', 'complete'].includes(mission.status);
  const exposed = (mission) => ['available', 'in_progress', 'complete'].includes(mission.status);

  /* Work backwards.  An exposed downstream mission is durable evidence that
   * its preceding handoff completed even when an old partial save omitted the
   * earlier status.  Merely AVAILABLE is never treated as departure: the next
   * scene has to begin before its travel marker is earned. */
  const palaceComplete = palace.status === 'complete'
    || ['available', 'in_progress', 'complete'].includes(initiation.status);
  const palaceDeparted = started(palace) || palaceComplete;
  const mansionReturnComplete = mansionReturn.status === 'complete'
    || exposed(palace) || palaceComplete;
  const mansionReturnDeparted = started(mansionReturn) || mansionReturnComplete;
  const enolaComplete = enola.status === 'complete'
    || exposed(mansionReturn) || mansionReturnDeparted;
  const enolaDeparted = started(enola) || enolaComplete;
  const siegeComplete = siege.status === 'complete' || exposed(enola) || enolaDeparted;
  const mansionRested = silent.sleptAtMansion === true || exposed(siege) || siegeComplete;
  const silentComplete = silent.status === 'complete' || mansionRested;
  const mansionDeparted = started(silent) || silentComplete;
  const silverComplete = silverCase.status === 'complete'
    || exposed(silent) || mansionDeparted;
  const silverDeparted = started(silverCase) || silverComplete;

  return FINAL_ARC_TIME_EVENT_ORDER.filter((eventId) => ({
    [TIME_EVENT_IDS.DEPART_SILVER_CASE]: silverDeparted,
    [TIME_EVENT_IDS.COMPLETE_SILVER_CASE]: silverComplete,
    [TIME_EVENT_IDS.DEPART_MANSION]: mansionDeparted,
    [TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH]: silentComplete,
    [TIME_EVENT_IDS.REST_AT_MANSION]: mansionRested,
    [TIME_EVENT_IDS.COMPLETE_MANSION_SIEGE]: siegeComplete,
    [TIME_EVENT_IDS.DEPART_ENOLA_SQUATCH]: enolaDeparted,
    [TIME_EVENT_IDS.COMPLETE_ENOLA_SQUATCH]: enolaComplete,
    [TIME_EVENT_IDS.RETURN_TO_MANSION]: mansionReturnDeparted,
    [TIME_EVENT_IDS.COMPLETE_MANSION_RETURN]: mansionReturnComplete,
    [TIME_EVENT_IDS.DEPART_CARTEL_PALACE]: palaceDeparted,
    [TIME_EVENT_IDS.COMPLETE_CARTEL_PALACE]: palaceComplete,
  })[eventId]);
}

function absoluteStoryMinutes(story) {
  const day = Number.isSafeInteger(story?.day) && story.day > 0 ? story.day : 1;
  const time = Number.isFinite(story?.timeMinutes) ? story.timeMinutes : 0;
  return (day - 1) * MINUTES_PER_DAY + time;
}

const MIGRATIONS = Object.freeze({
  1(saved) {
    return {
      ...saved,
      version: 2,
    };
  },
  2(saved) {
    return {
      ...saved,
      version: 3,
      activities: {
        ...saved.activities,
        whiskeyRelaxed: saved.activities?.whiskeyRelaxed === true,
      },
    };
  },
  3(saved) {
    const silverStatus = saved.missions?.[MISSION_IDS.SILVER_ROOM]?.status;
    const initiationStatus = saved.missions?.[MISSION_IDS.INITIATION]?.status;
    const progressed = ['available', 'in_progress', 'complete'];
    const alreadyPastNoWake = progressed.includes(silverStatus)
      || progressed.includes(initiationStatus)
      || ['date', 'big_night'].includes(saved.story?.chapter);
    return {
      ...saved,
      version: 4,
      missions: {
        ...saved.missions,
        [MISSION_IDS.NO_WAKE]: alreadyPastNoWake
          ? {
            status: 'complete', checkpoint: 'returned', betrayalConfirmed: true,
            playerFired: true, bodyDisposed: true,
          }
          : {
            status: 'locked', checkpoint: null, betrayalConfirmed: false,
            playerFired: false, bodyDisposed: false,
          },
      },
      events: {
        ...saved.events,
        [EVENT_IDS.LOU_NO_WAKE_CALL]: {
          status: alreadyPastNoWake ? 'answered' : 'pending',
        },
      },
    };
  },
  4(saved) {
    const old = saved.missions?.[MISSION_IDS.BADA_BING_TWO] ?? {};
    const motel = saved.missions?.[MISSION_IDS.JERKY_MOTEL] ?? {};
    const motelStatus = motel.status;
    const alreadyPastIncident = old.status === 'complete'
      || ['available', 'in_progress', 'complete'].includes(motelStatus);
    const resumesAtParty = old.status === 'in_progress' && !alreadyPastIncident;
    return {
      ...saved,
      version: 5,
      story: alreadyPastIncident
        ? storyAfterTimeEvent(saved.story, TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO)
        : saved.story,
      missions: {
        ...saved.missions,
        [MISSION_IDS.BADA_BING_TWO]: {
          ...old,
          status: alreadyPastIncident ? 'complete' : old.status,
          checkpoint: alreadyPastIncident ? 'buried' : (resumesAtParty ? 'party' : null),
          assignment: alreadyPastIncident
            ? (typeof old.assignment === 'string' && old.assignment.trim()
              ? old.assignment : 'reserve_pickup')
            : old.assignment,
          gunKicked: alreadyPastIncident,
          cleanupTasks: alreadyPastIncident
            ? ['bathrooms', 'cleaning_kit', 'missing_evidence', 'final_sweep']
            : [],
          bodyWrapped: alreadyPastIncident,
          bodyLoaded: alreadyPastIncident,
          burialComplete: alreadyPastIncident,
          echoHeard: false,
          urinatedOn: [],
        },
        [MISSION_IDS.JERKY_MOTEL]: alreadyPastIncident
          && !['available', 'in_progress', 'complete'].includes(motelStatus)
          ? { ...motel, status: 'available' }
          : motel,
      },
    };
  },
  5(saved) {
    const incident = saved.missions?.[MISSION_IDS.BADA_BING_TWO] ?? {};
    const urinatedOn = Array.isArray(incident.urinatedOn) ? incident.urinatedOn : [];
    return {
      ...saved,
      version: 6,
      missions: {
        ...saved.missions,
        [MISSION_IDS.BADA_BING_TWO]: {
          ...incident,
          inspectedGraves: Array.isArray(incident.inspectedGraves)
            ? incident.inspectedGraves : urinatedOn,
          respectedGraves: Array.isArray(incident.respectedGraves)
            ? incident.respectedGraves : [],
        },
      },
    };
  },
  6(saved) {
    /* Version 6 sent the fourth morning straight to Initiation. Preserve a
     * save that already exposed the ceremony, but put everybody still waiting
     * on the old big-night call onto the new Day 4 heist chapter. */
    const initiationStatus = saved.missions?.[MISSION_IDS.INITIATION]?.status;
    const alreadyAtInitiation = saved.scene?.id === SCENE_IDS.INITIATION
      || ['available', 'in_progress', 'complete'].includes(initiationStatus);
    const waitingOnOldRoute = saved.story?.chapter === 'big_night'
      && !alreadyAtInitiation;
    return {
      ...saved,
      version: 7,
      story: waitingOnOldRoute
        ? { ...saved.story, chapter: 'heist_day' }
        : saved.story,
    };
  },
  7(saved) {
    return {
      ...saved,
      version: 8,
      radio: {
        volume: 0.70,
        cursor: 0,
        cycle: 0,
        selections: {},
        songReactionCursor: 0,
        adReactionCursor: 0,
        heardBulletins: [],
        receivers: {},
        ...(saved.radio && typeof saved.radio === 'object' ? saved.radio : {}),
      },
    };
  },
  8(saved) {
    /* Version 8 opened Day 4 directly on THE TAKE. Insert the golf morning for
     * saves that had only reached that wake-up, while never rewinding a player
     * who had answered the heist call, exposed the bank, or reached a later
     * chapter. A recovered Silver Pines save is preserved as real play rather
     * than being mistaken for a grandfathered skip. */
    const progressed = ['available', 'in_progress', 'complete'];
    const oldGolf = saved.missions?.[MISSION_IDS.SILVER_PINES] ?? {};
    const oldGolfStatus = ['locked', ...progressed].includes(oldGolf.status)
      ? oldGolf.status : null;
    const heistStatus = saved.missions?.[MISSION_IDS.BANK_HEIST]?.status;
    const initiationStatus = saved.missions?.[MISSION_IDS.INITIATION]?.status;
    const heistProgressed = saved.scene?.id === SCENE_IDS.BANK_HEIST
      || saved.scene?.id === SCENE_IDS.INITIATION
      || saved.events?.[EVENT_IDS.LOU_HEIST_CALL]?.status === 'answered'
      || progressed.includes(heistStatus)
      || progressed.includes(initiationStatus)
      || ['post_heist', 'big_night'].includes(saved.story?.chapter);
    const golfWasOffered = ['available', 'in_progress'].includes(oldGolfStatus)
      || saved.scene?.id === SCENE_IDS.SILVER_PINES;
    const golfWasPlayed = oldGolfStatus === 'complete';
    const grandfathered = heistProgressed && !golfWasPlayed;
    const golfStatus = heistProgressed || golfWasPlayed
      ? 'complete'
      : (oldGolfStatus === 'locked'
        && saved.events?.[EVENT_IDS.LOU_GOLF_CALL]?.status === 'answered'
        ? 'available'
        : (oldGolfStatus ?? 'locked'));
    const pristineHeistWake = saved.story?.chapter === 'heist_day'
      && !heistProgressed
      && !golfWasOffered
      && !golfWasPlayed;

    let story = saved.story;
    if (pristineHeistWake) {
      story = {
        ...saved.story,
        chapter: 'golf_morning',
        day: 4,
        timeMinutes: 7 * 60,
        /* A pending heist call must not retain a spent marker: advanceTime
         * deliberately does not replay callbacks for a marker already seen. */
        timeEvents: uniqueStrings(saved.story?.timeEvents).filter((eventId) => ![
          TIME_EVENT_IDS.LOU_HEIST_CALL,
          TIME_EVENT_IDS.DEPART_BANK_HEIST,
          TIME_EVENT_IDS.COMPLETE_BANK_HEIST,
        ].includes(eventId)),
      };
    } else if (golfWasOffered && !heistProgressed && !golfWasPlayed) {
      story = { ...saved.story, chapter: 'golf_morning' };
    }

    const golfMarkers = [];
    if (golfStatus !== 'locked') golfMarkers.push(TIME_EVENT_IDS.LOU_GOLF_CALL);
    if (['in_progress', 'complete'].includes(golfStatus)) {
      golfMarkers.push(TIME_EVENT_IDS.DEPART_SILVER_PINES);
    }
    if (golfStatus === 'complete') {
      story = storyAfterTimeEvent(story, TIME_EVENT_IDS.COMPLETE_SILVER_PINES);
    }
    story = {
      ...story,
      timeEvents: uniqueStrings([
        ...uniqueStrings(story?.timeEvents),
        ...golfMarkers,
      ]),
    };

    return {
      ...saved,
      version: 9,
      story,
      missions: {
        ...saved.missions,
        [MISSION_IDS.SILVER_PINES]: {
          status: golfStatus,
          holesPlayed: oldGolf.holesPlayed ?? 0,
          strokes: oldGolf.strokes ?? 0,
          penalties: oldGolf.penalties ?? 0,
          toPar: oldGolf.toPar ?? 0,
          holes: Array.isArray(oldGolf.holes) ? oldGolf.holes : [],
          heardInvitation: oldGolf.heardInvitation === true,
          rodeWithLou: oldGolf.rodeWithLou === true,
          ace: oldGolf.ace === true,
          foundWater: oldGolf.foundWater === true,
          hitGreenInRegulation: oldGolf.hitGreenInRegulation === true,
          grandfathered: oldGolf.grandfathered === true || grandfathered,
        },
      },
      events: {
        ...saved.events,
        [EVENT_IDS.LOU_GOLF_CALL]: {
          status: saved.events?.[EVENT_IDS.LOU_GOLF_CALL]?.status === 'answered'
            || golfStatus !== 'locked' ? 'answered' : 'pending',
        },
      },
    };
  },
  /* The HotDog scene no longer makes the Prospect stop a gun grab.  Preserve
   * existing attack/cleanup saves by translating the old completion marker
   * into the new cinematic resolution flag exactly once. */
  9(saved) {
    const incident = saved.missions?.[MISSION_IDS.BADA_BING_TWO] ?? {};
    const { gunKicked: _legacyGunKicked, ...withoutLegacyGun } = incident;
    return {
      ...saved,
      version: 10,
      missions: {
        ...saved.missions,
        [MISSION_IDS.BADA_BING_TWO]: {
          ...withoutLegacyGun,
          attackResolved: incident.attackResolved === true || incident.gunKicked === true,
        },
      },
    };
  },
  10(saved) {
    /* The morning routine grew a fifth errand: the two bathroom jobs are now
     * tracked apart. A save that had already ticked the old combined chore has
     * plainly been to the bathroom, so it inherits both -- the alternative is
     * telling a player mid-campaign that a thing they did this morning is
     * suddenly undone. A save that had not is left with both to do. */
    const pooped = saved.activities?.pooped === true;
    return {
      ...saved,
      version: 11,
      activities: {
        ...saved.activities,
        peed: saved.activities?.peed === true || pooped,
      },
    };
  },
  11(saved) {
    /* PROJECT SILENT SQUATCH, and the standing it earns.
     *
     * Nothing is inferred. The night in Lou's basement is new work: no
     * existing save can have done it, so the mission starts locked for
     * everybody and `familyRespect` starts at zero for everybody -- including
     * a save that has finished THE TAKE, because the field did not exist while
     * that was being played and inventing a number for it would be the
     * campaign telling a player something about himself that never happened. */
    return {
      ...saved,
      version: 12,
      story: {
        ...saved.story,
        familyRespect: 0,
      },
      missions: {
        ...saved.missions,
        [MISSION_IDS.SILENT_SQUATCH]: {
          status: 'locked',
          checkpoint: null,
          casePlaced: false,
          caseDelivered: false,
          labLocked: false,
          aubbieEliminated: false,
          silentNightActivated: false,
          scientistsLost: 0,
          basementUnlocked: false,
          notesRecovered: false,
          conspiracyBoard: false,
          trophyAwarded: false,
          eveningReady: false,
          sleptAtMansion: false,
        },
      },
    };
  },
  12(saved) {
    /* Initiation used to open directly after THE TAKE. A player who already
     * saw that invitation keeps it exactly as-is; the new finale must never
     * turn a terminal save into a locked door. Everyone still before that
     * invitation enters the preservation-first final arc after the apartment
     * cleanup instead. */
    const progressed = ['available', 'in_progress', 'complete'];
    const initiationStatus = saved.missions?.[MISSION_IDS.INITIATION]?.status;
    const alreadyAtInitiation = saved.scene?.id === SCENE_IDS.INITIATION;
    const grandfathered = alreadyAtInitiation || progressed.includes(initiationStatus);
    const heistComplete = saved.missions?.[MISSION_IDS.BANK_HEIST]?.status === 'complete'
      || saved.story?.chapter === 'post_heist';
    const finalArc = initialFinalArcMissions();
    for (const mission of Object.values(finalArc)) {
      mission.grandfathered = grandfathered;
      if (grandfathered) mission.status = 'complete';
    }
    if (!grandfathered && heistComplete) {
      finalArc[MISSION_IDS.SILVER_CASE].status = 'available';
    }

    return {
      ...saved,
      version: 13,
      story: !grandfathered && saved.story?.chapter === 'big_night'
        ? { ...saved.story, chapter: 'post_heist' }
        : saved.story,
      missions: {
        ...saved.missions,
        ...finalArc,
        [MISSION_IDS.INITIATION]: grandfathered
          ? {
            ...(saved.missions?.[MISSION_IDS.INITIATION] ?? {}),
            status: alreadyAtInitiation && !progressed.includes(initiationStatus)
              ? 'in_progress' : initiationStatus,
          }
          : { status: 'locked' },
      },
    };
  },
  13(saved) {
    /* Schema 13 routed the final arc but only Silent Squatch and the mansion
     * sleep moved its clock.  Repair saves already inside that route to the
     * minimum clock their durable mission progress proves.  A player whose
     * clock is later is never rewound, and an old Initiation save grandfathered
     * by v12 -> v13 remains byte-for-byte identical apart from the version. */
    const finalArcMissions = [
      MISSION_IDS.SILVER_CASE,
      MISSION_IDS.MANSION_SIEGE,
      MISSION_IDS.ENOLA_SQUATCH,
      MISSION_IDS.MANSION_RETURN,
      MISSION_IDS.CARTEL_PALACE,
    ];
    const grandfathered = finalArcMissions.some(
      (id) => saved.missions?.[id]?.grandfathered === true,
    );
    if (grandfathered) return { ...saved, version: 14 };

    const reached = finalArcTimeEventsReached(saved);
    /* Nothing in the new route has started.  Older pre-finale migrations can
     * legitimately be on any of Days 1-4; the Day 4 5:20 PM baseline below is
     * only meaningful once a final-arc transition has actually completed. */
    if (reached.length === 0) return { ...saved, version: 14 };
    let canonical = {
      ...(saved.story ?? {}),
      day: 4,
      timeMinutes: 17 * 60 + 20,
      timeEvents: [],
    };
    for (const eventId of reached) canonical = storyAfterTimeEvent(canonical, eventId);

    const savedAbsolute = absoluteStoryMinutes(saved.story);
    const canonicalAbsolute = absoluteStoryMinutes(canonical);
    const repairedClock = canonicalAbsolute > savedAbsolute
      ? { day: canonical.day, timeMinutes: canonical.timeMinutes }
      : {};
    return {
      ...saved,
      version: 14,
      story: {
        ...saved.story,
        ...repairedClock,
        timeEvents: uniqueStrings([
          ...uniqueStrings(saved.story?.timeEvents),
          ...reached,
        ]),
      },
    };
  },
  14(saved) {
    /* Schema 15 adds the compact Mansion Siege combat checkpoint. Official
     * v14 saves never carried it, so initialise only that field and preserve
     * every other mission/story value verbatim. Doing this as a migration is
     * important: adding the field during normalisation at the same version
     * would make every valid v14 save look structurally corrupt. */
    return {
      ...saved,
      version: 15,
      missions: {
        ...(saved.missions ?? {}),
        [MISSION_IDS.MANSION_SIEGE]: {
          ...(saved.missions?.[MISSION_IDS.MANSION_SIEGE] ?? {}),
          checkpointSnapshot: null,
        },
      },
    };
  },
  15(saved) {
    /* Schema 16 adds Palace combat durability. Existing v15 saves preserve
     * their exact story/loadout facts and resume from authored checkpoint
     * staging until the next real Palace checkpoint writes this field. */
    return {
      ...saved,
      version: 16,
      missions: {
        ...(saved.missions ?? {}),
        [MISSION_IDS.CARTEL_PALACE]: {
          ...(saved.missions?.[MISSION_IDS.CARTEL_PALACE] ?? {}),
          checkpointSnapshot: null,
        },
      },
    };
  },
  16(saved) {
    /* Schema 17 adds the Apartment-owned ending wrapper without changing the
     * frozen Initiation runtime. A completed v16 save receives its credits on
     * the next Apartment load; an unfinished save remains locked. */
    const complete = saved.missions?.[MISSION_IDS.INITIATION]?.status === 'complete'
      && uniqueStrings(saved.story?.timeEvents).includes(TIME_EVENT_IDS.COMPLETE_INITIATION);
    return {
      ...saved,
      version: 17,
      finale: {
        status: complete ? 'ready' : 'locked',
        creditsViewed: false,
        freeplayUnlocked: false,
        completedAt: complete ? {
          day: Number.isSafeInteger(saved.story?.day) && saved.story.day > 0
            ? saved.story.day : 1,
          timeMinutes: Number.isFinite(saved.story?.timeMinutes)
            ? saved.story.timeMinutes : 0,
        } : null,
      },
    };
  },
  17(saved) {
    /* Schema 18 adds the five per-chapter pastime flags -- see
     * CHAPTER_PASTIMES in apartment-story.js.
     *
     * This migration exists because the SHAPE moved, and a moved shape is not
     * a cosmetic problem here. `normalize()` rebuilds `activities` from the
     * base object's keys, so a v17 save would have come back with five new
     * `false` fields it did not have on disk; `structurallyBroken` in
     * `readSave()` is `!migrated.changed && normalizedChanged`, and with no
     * migration to set `changed` the loader would have decided every existing
     * save in the world was corrupt and told the player so on the title
     * screen. (TIME_EVENT_IDS carries a comment from whoever found this the
     * hard way -- three message markers were registered as time events rather
     * than as save fields for exactly this reason.)
     *
     * Everything lands false, which is the honest answer: a save made before
     * this existed cannot know whether he watched the news that morning, and
     * false costs a returning player half a minute on the couch rather than
     * skipping a beat they never had. */
    return {
      ...saved,
      version: 18,
      activities: {
        ...saved.activities,
        watchedTv: saved.activities?.watchedTv === true,
        playedCounterSquatch: saved.activities?.playedCounterSquatch === true,
        playedSquatchShoot: saved.activities?.playedSquatchShoot === true,
        playedSquatchSmash: saved.activities?.playedSquatchSmash === true,
        tookShrooms: saved.activities?.tookShrooms === true,
      },
    };
  },
});

function migrate(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return { ok: false, reason: 'invalid_shape' };
  }
  if (!Number.isSafeInteger(saved.version)
    || saved.version < 1
    || saved.version > CAMPAIGN_VERSION) {
    return { ok: false, reason: 'unsupported_version' };
  }

  let value = saved;
  let changed = false;
  while (value.version < CAMPAIGN_VERSION) {
    const migration = MIGRATIONS[value.version];
    if (typeof migration !== 'function') {
      return { ok: false, reason: 'unsupported_version' };
    }
    const beforeVersion = value.version;
    try {
      value = migration(value);
    } catch {
      return { ok: false, reason: 'migration_failed' };
    }
    if (!value
      || typeof value !== 'object'
      || !Number.isSafeInteger(value.version)
      || value.version <= beforeVersion
      || value.version > CAMPAIGN_VERSION) {
      return { ok: false, reason: 'migration_failed' };
    }
    changed = true;
  }
  return { ok: true, value, changed };
}

function hasCurrentShape(saved) {
  return Number.isSafeInteger(saved.revision)
    && saved.scene && typeof saved.scene === 'object'
    && saved.story && typeof saved.story === 'object'
    && saved.activities && typeof saved.activities === 'object'
    && saved.radio && typeof saved.radio === 'object'
    && saved.inventory && typeof saved.inventory === 'object'
    && saved.finale && typeof saved.finale === 'object'
    && saved.missions && typeof saved.missions === 'object'
    && saved.events && typeof saved.events === 'object';
}

function normalize(saved) {
  const base = initialState();
  if (!saved || saved.version !== CAMPAIGN_VERSION) return base;

  const sceneId = SCENES[saved.scene?.id] ? saved.scene.id : base.scene.id;
  const mission = saved.missions?.[MISSION_IDS.BADA_BING_ONE] ?? {};
  const status = ['locked', 'available', 'in_progress', 'complete']
    .includes(mission.status) ? mission.status : base.missions.bada_bing_one.status;
  const squatchfather = saved.missions?.[MISSION_IDS.SQUATCHFATHER] ?? {};
  const squatchfatherStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(squatchfather.status)
    ? squatchfather.status
    : (status === 'complete' ? 'available' : base.missions.squatchfather.status);
  const airstrip = saved.missions?.[MISSION_IDS.AIRSTRIP_SMUGGLING] ?? {};
  const airstripStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(airstrip.status)
    ? airstrip.status
    : base.missions.airstrip_smuggling.status;
  const bingTwo = saved.missions?.[MISSION_IDS.BADA_BING_TWO] ?? {};
  const bingTwoStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(bingTwo.status) ? bingTwo.status : base.missions.bada_bing_two.status;
  const urinatedGraves = uniqueStrings(bingTwo.urinatedOn)
    .filter((grave) => TRAITOR_GRAVE_IDS.includes(grave));
  const respectedGraves = uniqueStrings(bingTwo.respectedGraves)
    .filter((grave) => MEMORIAL_GRAVE_IDS.includes(grave) && !urinatedGraves.includes(grave));
  const inspectedGraves = uniqueStrings([
    ...(Array.isArray(bingTwo.inspectedGraves) ? bingTwo.inspectedGraves : []),
    ...respectedGraves,
    ...urinatedGraves,
  ]).filter((grave) => MEMORIAL_GRAVE_IDS.includes(grave));
  const motel = saved.missions?.[MISSION_IDS.JERKY_MOTEL] ?? {};
  const motelStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(motel.status) ? motel.status : base.missions.jerky_motel.status;
  const noWake = saved.missions?.[MISSION_IDS.NO_WAKE] ?? {};
  const noWakeStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(noWake.status) ? noWake.status : base.missions.no_wake.status;
  const silver = saved.missions?.[MISSION_IDS.SILVER_ROOM] ?? {};
  const silverStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(silver.status) ? silver.status : base.missions.silver_room.status;
  const golf = saved.missions?.[MISSION_IDS.SILVER_PINES] ?? {};
  const golfStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(golf.status) ? golf.status : base.missions.silver_pines.status;
  const golfHolesByNumber = new Map();
  if (Array.isArray(golf.holes)) {
    for (const card of golf.holes) {
      if (!card || !Number.isFinite(card.hole) || !Number.isFinite(card.strokes)) continue;
      const hole = Math.round(card.hole);
      if (hole < 1 || hole > 3) continue;
      golfHolesByNumber.set(hole, {
        hole,
        par: boundedNumber(card.par, 3, 5, 3, true),
        strokes: boundedNumber(card.strokes, 1, 99, 1, true),
        penalties: boundedNumber(card.penalties, 0, 99, 0, true),
      });
    }
  }
  const golfHoles = [...golfHolesByNumber.values()]
    .sort((a, b) => a.hole - b.hole);
  const golfStrokes = golfHoles.reduce((total, card) => total + card.strokes, 0);
  const golfPenalties = golfHoles.reduce((total, card) => total + card.penalties, 0);
  const golfToPar = golfHoles.reduce(
    (total, card) => total + card.strokes - card.par,
    0,
  );
  const bankHeist = saved.missions?.[MISSION_IDS.BANK_HEIST] ?? {};
  const bankHeistStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(bankHeist.status) ? bankHeist.status : base.missions.bank_heist.status;
  const silverCase = saved.missions?.[MISSION_IDS.SILVER_CASE] ?? {};
  const silverCaseStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(silverCase.status)
    ? silverCase.status : base.missions[MISSION_IDS.SILVER_CASE].status;
  const mansionSiege = saved.missions?.[MISSION_IDS.MANSION_SIEGE] ?? {};
  const mansionSiegeStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(mansionSiege.status)
    ? mansionSiege.status : base.missions[MISSION_IDS.MANSION_SIEGE].status;
  const enolaSquatch = saved.missions?.[MISSION_IDS.ENOLA_SQUATCH] ?? {};
  const enolaSquatchStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(enolaSquatch.status)
    ? enolaSquatch.status : base.missions[MISSION_IDS.ENOLA_SQUATCH].status;
  const mansionReturn = saved.missions?.[MISSION_IDS.MANSION_RETURN] ?? {};
  const mansionReturnStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(mansionReturn.status)
    ? mansionReturn.status : base.missions[MISSION_IDS.MANSION_RETURN].status;
  const cartelPalace = saved.missions?.[MISSION_IDS.CARTEL_PALACE] ?? {};
  const cartelPalaceStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(cartelPalace.status)
    ? cartelPalace.status : base.missions[MISSION_IDS.CARTEL_PALACE].status;
  const initiation = saved.missions?.[MISSION_IDS.INITIATION] ?? {};
  const initiationStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(initiation.status) ? initiation.status : base.missions.initiation.status;
  const finaleEligible = initiationStatus === 'complete'
    && uniqueStrings(saved.story?.timeEvents).includes(TIME_EVENT_IDS.COMPLETE_INITIATION);
  const savedFinale = saved.finale && typeof saved.finale === 'object'
    ? saved.finale : base.finale;
  const finaleStatus = finaleEligible && savedFinale.status === 'freeplay'
    ? 'freeplay' : (finaleEligible ? 'ready' : 'locked');
  const finaleCompletedAt = finaleEligible ? {
    day: Number.isSafeInteger(savedFinale.completedAt?.day)
      && savedFinale.completedAt.day > 0
      ? savedFinale.completedAt.day
      : (Number.isSafeInteger(saved.story?.day) && saved.story.day > 0 ? saved.story.day : 1),
    timeMinutes: boundedNumber(
      savedFinale.completedAt?.timeMinutes,
      0,
      MINUTES_PER_DAY - 1,
      boundedNumber(saved.story?.timeMinutes, 0, MINUTES_PER_DAY - 1, 0, true),
      true,
    ),
  } : null;
  const silentSquatch = saved.missions?.[MISSION_IDS.SILENT_SQUATCH] ?? {};
  const silentSquatchStatus = ['locked', 'available', 'in_progress', 'complete']
    .includes(silentSquatch.status)
    ? silentSquatch.status
    : base.missions[MISSION_IDS.SILENT_SQUATCH].status;
  const louCall = saved.events?.[EVENT_IDS.LOU_FIRST_CALL] ?? {};
  const attaboyCall = saved.events?.[EVENT_IDS.LOU_ATTABOY_CALL] ?? {};
  const booskiCall = saved.events?.[EVENT_IDS.BOOSKI_DAY_TWO_CALL] ?? {};
  const louSecondCall = saved.events?.[EVENT_IDS.LOU_SECOND_CALL] ?? {};
  const louNoWakeCall = saved.events?.[EVENT_IDS.LOU_NO_WAKE_CALL] ?? {};
  const margoCall = saved.events?.[EVENT_IDS.MARGO_DATE_CALL] ?? {};
  const golfCall = saved.events?.[EVENT_IDS.LOU_GOLF_CALL] ?? {};
  const louHeistCall = saved.events?.[EVENT_IDS.LOU_HEIST_CALL] ?? {};
  const booskiBigNightCall = saved.events?.[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL] ?? {};
  const radio = saved.radio ?? {};
  const radioSelections = Object.fromEntries(
    Object.entries(radio.selections && typeof radio.selections === 'object'
      ? radio.selections : {})
      .filter(([key, value]) => typeof key === 'string'
        && key.length <= 120
        && Number.isSafeInteger(value)
        && value >= 0)
      .map(([key, value]) => [key, Math.min(value, 1_000_000)]),
  );
  const radioReceivers = Object.fromEntries(
    Object.entries(radio.receivers && typeof radio.receivers === 'object'
      ? radio.receivers : {})
      .filter(([key, value]) => typeof key === 'string'
        && key.length <= 80
        && typeof value === 'boolean'),
  );

  const state = {
    version: CAMPAIGN_VERSION,
    revision: Number.isSafeInteger(saved.revision) && saved.revision >= 0
      ? saved.revision : 0,
    scene: {
      id: sceneId,
      spawn: normalizedSpawn(sceneId, saved.scene?.spawn),
    },
    story: {
      chapter: typeof saved.story?.chapter === 'string'
        ? saved.story.chapter : base.story.chapter,
      day: Number.isSafeInteger(saved.story?.day) && saved.story.day > 0
        ? saved.story.day : base.story.day,
      timeMinutes: Number.isFinite(saved.story?.timeMinutes)
        ? saved.story.timeMinutes : base.story.timeMinutes,
      meetingKnown: saved.story?.meetingKnown === true,
      meetingLearnedFrom: typeof saved.story?.meetingLearnedFrom === 'string'
        ? saved.story.meetingLearnedFrom : null,
      timeEvents: uniqueStrings(saved.story?.timeEvents),
      familyRespect: boundedNumber(saved.story?.familyRespect, 0, 100, 0, true),
    },
    activities: Object.fromEntries(
      Object.keys(base.activities)
        .map((key) => [key, saved.activities?.[key] === true]),
    ),
    radio: {
      volume: boundedNumber(radio.volume, 0, 1, base.radio.volume),
      cursor: boundedNumber(radio.cursor, 0, 1_000_000, 0, true),
      cycle: boundedNumber(radio.cycle, 0, 1_000_000, 0, true),
      selections: radioSelections,
      songReactionCursor: boundedNumber(radio.songReactionCursor, 0, 1_000_000, 0, true),
      adReactionCursor: boundedNumber(radio.adReactionCursor, 0, 1_000_000, 0, true),
      heardBulletins: uniqueStrings(radio.heardBulletins).slice(-64),
      receivers: radioReceivers,
    },
    inventory: {
      carried: uniqueStrings(saved.inventory?.carried),
      concealed: uniqueStrings(saved.inventory?.concealed),
    },
    finale: {
      status: finaleStatus,
      creditsViewed: finaleStatus === 'freeplay',
      freeplayUnlocked: finaleStatus === 'freeplay',
      completedAt: finaleCompletedAt,
    },
    missions: {
      [MISSION_IDS.BADA_BING_ONE]: {
        status,
        packageReceived: mission.packageReceived === true,
        ending: typeof mission.ending === 'string' ? mission.ending : null,
      },
      [MISSION_IDS.SQUATCHFATHER]: {
        status: squatchfatherStatus,
        weaponStaged: squatchfather.weaponStaged === true,
        weaponDropped: squatchfather.weaponDropped === true,
      },
      [MISSION_IDS.AIRSTRIP_SMUGGLING]: {
        status: airstripStatus,
        checkpoint: ['airstrip', 'remote_strip', 'returning', 'landed_home']
          .includes(airstrip.checkpoint) ? airstrip.checkpoint : null,
        cargoLoaded: airstrip.cargoLoaded === true,
        detected: airstrip.detected === true,
        landingQuality: typeof airstrip.landingQuality === 'string'
          ? airstrip.landingQuality : null,
        rank: typeof airstrip.rank === 'string' ? airstrip.rank : null,
        /* Rewards survive a reload the same way the rest of the record does,
         * and an unrecognised id from an older or hand-edited save is dropped
         * rather than trusted. */
        unlocks: Array.isArray(airstrip.unlocks)
          ? [...new Set(airstrip.unlocks.filter((id) => AIRSTRIP_UNLOCKS.includes(id)))]
          : [],
        packagesDelivered: Number.isFinite(airstrip.packagesDelivered)
          ? Math.max(0, Math.round(airstrip.packagesDelivered)) : 0,
        gunsDelivered: Number.isFinite(airstrip.gunsDelivered)
          ? Math.max(0, Math.round(airstrip.gunsDelivered)) : 0,
      },
      [MISSION_IDS.BADA_BING_TWO]: {
        status: bingTwoStatus,
        checkpoint: ['party', 'attack', 'cleanup', 'body_loaded', 'graveyard', 'buried']
          .includes(bingTwo.checkpoint) ? bingTwo.checkpoint : null,
        assignment: typeof bingTwo.assignment === 'string' ? bingTwo.assignment : null,
        // `gunKicked` is accepted only as a legacy read path. New campaign
        // writes carry the fact the attack finished, not how it once did.
        attackResolved: bingTwo.attackResolved === true || bingTwo.gunKicked === true,
        cleanupTasks: uniqueStrings(bingTwo.cleanupTasks)
          .filter((task) => ['bathrooms', 'cleaning_kit', 'missing_evidence', 'final_sweep']
            .includes(task)),
        bodyWrapped: bingTwo.bodyWrapped === true,
        bodyLoaded: bingTwo.bodyLoaded === true,
        burialComplete: bingTwo.burialComplete === true,
        echoHeard: bingTwo.echoHeard === true,
        inspectedGraves,
        respectedGraves,
        urinatedOn: urinatedGraves,
      },
      [MISSION_IDS.JERKY_MOTEL]: {
        status: motelStatus,
        ending: typeof motel.ending === 'string' ? motel.ending : null,
        cargoRecovered: motel.cargoRecovered === true,
        packagesIntact: boundedNumber(motel.packagesIntact, 0, 8, 0, true),
        freshness: boundedNumber(motel.freshness, 0, 100, 0),
        policeHeat: boundedNumber(motel.policeHeat, 0, 100, 0),
      },
      [MISSION_IDS.NO_WAKE]: {
        status: noWakeStatus,
        checkpoint: NO_WAKE_CHECKPOINT_IDS.includes(noWake.checkpoint)
          ? noWake.checkpoint : null,
        betrayalConfirmed: noWake.betrayalConfirmed === true,
        playerFired: noWake.playerFired === true,
        bodyDisposed: noWake.bodyDisposed === true,
      },
      [MISSION_IDS.SILVER_ROOM]: {
        status: silverStatus,
        outcome: [
          'perfect', 'strong', 'good', 'gentleman', 'polite',
          'from-a-distance', 'awkward', 'insult', 'disaster',
        ]
          .includes(silver.outcome) ? silver.outcome : null,
        woo: boundedNumber(silver.woo, 0, 100, 0, true),
        band: typeof silver.band === 'string' ? silver.band : null,
        tippedEverybody: silver.tippedEverybody === true,
        rememberedDrink: silver.rememberedDrink === true,
        seeingHerAgain: silver.seeingHerAgain === true,
        knowsWhatHeDoes: silver.knowsWhatHeDoes === true,
        /* SHE CAME BACK WITH HIM, or she did not -- `SilverStory.complete`
         * writes this the moment the mission ends, and every `update()` after
         * that runs the whole state back through this function. Without a
         * field here to carry it, `normalize` silently rebuilt the mission
         * from the six lines above and the verdict was gone on the very next
         * `campaign.update()` call -- which is every one of them, including
         * the `advanceTime` inside `SilverStory.complete` itself. Nothing
         * downstream noticed because `margoWakeOwed`'s `!== false` fallback
         * reads a lost verdict the same as a pre-existing save with no
         * verdict at all, and defaults to "yes". A stricter reader would not
         * be so lucky -- and `margoComeHomeOwed` (SCENE 9's own gate) is
         * exactly that reader: it requires an explicit `true`, which could
         * never have survived to be read.
         *
         * Tri-state, deliberately. `=== true` here coerced an ABSENT verdict
         * to an explicit `false`, which is the one value `margoWakeOwed`'s
         * pre-existing-save shim cannot survive: a save from before the
         * verdict existed round-tripped through one normalize and had its
         * fourth morning cancelled. Absent must stay absent. */
        ...(typeof silver.cameHome === 'boolean' ? { cameHome: silver.cameHome } : {}),
      },
      [MISSION_IDS.SILVER_PINES]: {
        status: golfStatus,
        holesPlayed: golfHoles.length,
        strokes: golfStrokes,
        penalties: golfPenalties,
        toPar: golfToPar,
        holes: golfHoles,
        heardInvitation: golf.heardInvitation === true,
        rodeWithLou: golf.rodeWithLou === true,
        ace: golf.ace === true,
        foundWater: golf.foundWater === true,
        hitGreenInRegulation: golf.hitGreenInRegulation === true,
        grandfathered: golf.grandfathered === true,
      },
      [MISSION_IDS.BANK_HEIST]: {
        status: bankHeistStatus,
        checkpoint: BANK_HEIST_CHECKPOINT_IDS.includes(bankHeist.checkpoint)
          ? bankHeist.checkpoint : null,
        briefingComplete: bankHeist.briefingComplete === true,
        preparationComplete: [
          'armor', 'gloves', 'mask', 'carbine', 'sidearm', 'magazines', 'duffel',
        ].every((key) => bankHeist.preparation?.[key] === true),
        preparation: {
          armor: bankHeist.preparation?.armor === true,
          gloves: bankHeist.preparation?.gloves === true,
          mask: bankHeist.preparation?.mask === true,
          carbine: bankHeist.preparation?.carbine === true,
          sidearm: bankHeist.preparation?.sidearm === true,
          magazines: bankHeist.preparation?.magazines === true,
          duffel: bankHeist.preparation?.duffel === true,
          extraMagazine: bankHeist.preparation?.extraMagazine === true,
        },
        cleanupComplete: ['washed', 'changed', 'gearSecured', 'finalCalls']
          .every((key) => bankHeist.cleanup?.[key] === true),
        cleanup: {
          washed: bankHeist.cleanup?.washed === true,
          changed: bankHeist.cleanup?.changed === true,
          gearSecured: bankHeist.cleanup?.gearSecured === true,
          finalCalls: bankHeist.cleanup?.finalCalls === true,
        },
        bankEntered: bankHeist.bankEntered === true,
        civiliansHarmed: boundedNumber(bankHeist.civiliansHarmed, 0, 99, 0, true),
        guardsDisarmed: boundedNumber(bankHeist.guardsDisarmed, 0, 16, 0, true),
        alarmTriggered: bankHeist.alarmTriggered === true,
        vaultOpened: bankHeist.vaultOpened === true,
        bagsStaged: boundedNumber(bankHeist.bagsStaged, 0, 10, 0, true),
        bagsRecovered: boundedNumber(bankHeist.bagsRecovered, 0, 10, 0, true),
        grossTake: boundedNumber(bankHeist.grossTake, 0, 10_000_000, 0, true),
        compromisedCash: boundedNumber(bankHeist.compromisedCash, 0, 10_000_000, 0, true),
        operationalLoss: boundedNumber(bankHeist.operationalLoss, 0, 10_000_000, 0, true),
        familyShare: boundedNumber(bankHeist.familyShare, 0, 10_000_000, 0, true),
        crewShare: boundedNumber(bankHeist.crewShare, 0, 10_000_000, 0, true),
        prospectShare: boundedNumber(bankHeist.prospectShare, 0, 10_000_000, 0, true),
        playerInjury: ['none', 'minor', 'moderate', 'severe']
          .includes(bankHeist.playerInjury) ? bankHeist.playerInjury : 'none',
        crewInjuries: normalizedCrewInjuries(bankHeist.crewInjuries),
        primaryVanLost: bankHeist.primaryVanLost === true,
        droppedBagRecovered: bankHeist.droppedBagRecovered === true,
        optionalVaultBagTaken: bankHeist.optionalVaultBagTaken === true,
        playerDroveEscape: bankHeist.playerDroveEscape === true,
        vehicleDamage: boundedNumber(bankHeist.vehicleDamage, 0, 100, 0),
        policeHeat: boundedNumber(bankHeist.policeHeat, 0, 100, 0),
        crewSurvived: bankHeist.crewSurvived !== false,
        followedSnow: bankHeist.followedSnow !== false,
        disciplinedFire: bankHeist.disciplinedFire !== false,
        outcome: BANK_HEIST_OUTCOMES.includes(bankHeist.outcome)
          ? bankHeist.outcome : null,
      },
      [MISSION_IDS.SILVER_CASE]: {
        status: silverCaseStatus,
        checkpoint: SILVER_CASE_CHECKPOINT_IDS.includes(silverCase.checkpoint)
          ? silverCase.checkpoint : null,
        caseRecovered: silverCase.caseRecovered === true,
        winstonOutcome: ['spared', 'player_killed', 'ape_killed']
          .includes(silverCase.winstonOutcome) ? silverCase.winstonOutcome : null,
        irritatedApe: silverCase.irritatedApe === true,
        apeFinishedChester: silverCase.apeFinishedChester === true,
        apeFinishedWinston: silverCase.apeFinishedWinston === true,
        ...(silverCase.grandfathered === true ? { grandfathered: true } : {}),
      },
      [MISSION_IDS.MANSION_SIEGE]: {
        status: mansionSiegeStatus,
        checkpoint: MANSION_SIEGE_CHECKPOINT_IDS.includes(mansionSiege.checkpoint)
          ? mansionSiege.checkpoint : null,
        checkpointSnapshot: MANSION_SIEGE_CHECKPOINT_IDS.includes(mansionSiege.checkpoint)
          ? normalizeMansionSiegeCheckpointSnapshot(
            mansionSiege.checkpointSnapshot,
            mansionSiege.checkpoint,
          ) : null,
        attackersDown: boundedNumber(mansionSiege.attackersDown, 0, 99, 0, true),
        littleFriendSaid: mansionSiege.littleFriendSaid === true,
        sasoleMet: mansionSiege.sasoleMet === true,
        ...(mansionSiege.grandfathered === true ? { grandfathered: true } : {}),
      },
      [MISSION_IDS.ENOLA_SQUATCH]: {
        status: enolaSquatchStatus,
        checkpoint: ENOLA_SQUATCH_CHECKPOINT_IDS.includes(enolaSquatch.checkpoint)
          ? enolaSquatch.checkpoint : null,
        checkpointSnapshot: normalizeEnolaCheckpointSnapshot(
          enolaSquatch.checkpointSnapshot,
          ENOLA_SQUATCH_CHECKPOINT_IDS.includes(enolaSquatch.checkpoint)
            ? enolaSquatch.checkpoint : null,
        ),
        rank: ENOLA_SQUATCH_RANKS.includes(enolaSquatch.rank)
          ? enolaSquatch.rank : null,
        score: boundedNumber(enolaSquatch.score, 0, 1, 0),
        unlocks: uniqueStrings(enolaSquatch.unlocks)
          .filter((unlock) => ENOLA_SQUATCH_UNLOCKS.includes(unlock)),
        payloadReleased: enolaSquatch.payloadReleased === true,
        returnedHome: enolaSquatch.returnedHome === true,
        ...(enolaSquatch.grandfathered === true ? { grandfathered: true } : {}),
      },
      [MISSION_IDS.MANSION_RETURN]: {
        status: mansionReturnStatus,
        briefingComplete: mansionReturn.briefingComplete === true,
        wrongCityConfirmed: mansionReturn.wrongCityConfirmed === true,
        sauceMissingConfirmed: mansionReturn.sauceMissingConfirmed === true,
        palaceLocationKnown: mansionReturn.palaceLocationKnown === true,
        ...(mansionReturn.grandfathered === true ? { grandfathered: true } : {}),
      },
      [MISSION_IDS.CARTEL_PALACE]: {
        status: cartelPalaceStatus,
        checkpoint: CARTEL_PALACE_CHECKPOINT_IDS.includes(cartelPalace.checkpoint)
          ? cartelPalace.checkpoint : null,
        checkpointSnapshot: CARTEL_PALACE_CHECKPOINT_IDS.includes(cartelPalace.checkpoint)
          ? normalizeCartelPalaceCheckpointSnapshot(
            cartelPalace.checkpointSnapshot,
            cartelPalace.checkpoint,
          ) : null,
        evidenceFound: uniqueStrings(cartelPalace.evidenceFound)
          .filter((id) => CARTEL_PALACE_EVIDENCE_IDS.includes(id)),
        sauceBetrayalConfirmed: cartelPalace.sauceBetrayalConfirmed === true,
        alarmRaised: cartelPalace.alarmRaised === true,
        alarmReason: CARTEL_PALACE_ALARM_REASONS.includes(cartelPalace.alarmReason)
          ? cartelPalace.alarmReason : null,
        markEliminated: cartelPalace.markEliminated === true,
        sauceEliminated: cartelPalace.sauceEliminated === true,
        outcome: CARTEL_PALACE_OUTCOMES.includes(cartelPalace.outcome)
          ? cartelPalace.outcome : null,
        ...(cartelPalace.grandfathered === true ? { grandfathered: true } : {}),
      },
      [MISSION_IDS.INITIATION]: {
        status: initiationStatus,
      },
      [MISSION_IDS.SILENT_SQUATCH]: {
        status: silentSquatchStatus,
        checkpoint: SILENT_SQUATCH_CHECKPOINT_IDS.includes(silentSquatch.checkpoint)
          ? silentSquatch.checkpoint : null,
        casePlaced: silentSquatch.casePlaced === true,
        caseDelivered: silentSquatch.caseDelivered === true,
        labLocked: silentSquatch.labLocked === true,
        aubbieEliminated: silentSquatch.aubbieEliminated === true,
        silentNightActivated: silentSquatch.silentNightActivated === true,
        /* Six people went in. Nothing this mission can report makes that
         * seven, and a save claiming otherwise is repaired rather than
         * believed. */
        scientistsLost: boundedNumber(silentSquatch.scientistsLost, 0, 6, 0, true),
        basementUnlocked: silentSquatch.basementUnlocked === true,
        notesRecovered: silentSquatch.notesRecovered === true,
        conspiracyBoard: silentSquatch.conspiracyBoard === true,
        trophyAwarded: silentSquatch.trophyAwarded === true,
        eveningReady: silentSquatch.eveningReady === true,
        /* Only beats the whitelist knows survive a read, exactly the way
         * checkpoints are handled -- a beat id the list dropped must not keep
         * counting toward the bed from an old save. */
        eveningBeats: uniqueStrings(silentSquatch.eveningBeats)
          .filter((id) => MANSION_EVENING_BEAT_IDS.includes(id)),
        sleptAtMansion: silentSquatch.sleptAtMansion === true,
      },
    },
    events: {
      [EVENT_IDS.LOU_FIRST_CALL]: {
        // Campaign saves created before the call event existed already exposed
        // or completed this mission. Treat that progress as proof the call
        // happened instead of replaying Lou and downgrading the mission.
        status: louCall.status === 'answered' || status !== 'locked'
          ? 'answered' : 'pending',
      },
      /* The one call with no mission behind it to infer from, so there is
       * nothing to reconstruct: a save that predates it has never heard it and
       * gets it on the next return from the Squatchfather. A save already past
       * that night never will, which is the correct amount of loss for a call
       * that unlocks nothing. */
      [EVENT_IDS.LOU_ATTABOY_CALL]: {
        status: attaboyCall.status === 'answered' ? 'answered' : 'pending',
      },
      [EVENT_IDS.BOOSKI_DAY_TWO_CALL]: {
        // Once the airstrip mission has been exposed, Booski's call must not
        // replay even if this save predates the explicit event record.
        status: booskiCall.status === 'answered' || airstripStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      [EVENT_IDS.LOU_SECOND_CALL]: {
        status: louSecondCall.status === 'answered' || bingTwoStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      [EVENT_IDS.LOU_NO_WAKE_CALL]: {
        status: louNoWakeCall.status === 'answered' || noWakeStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      // An exposed Silver Room is proof Margo already rang.
      [EVENT_IDS.MARGO_DATE_CALL]: {
        status: margoCall.status === 'answered' || silverStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      // Once the round is exposed, Lou's Silver Pines invitation has landed.
      [EVENT_IDS.LOU_GOLF_CALL]: {
        status: golfCall.status === 'answered' || golfStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      // Once THE TAKE is exposed, Lou's Day 4 call has already landed.
      [EVENT_IDS.LOU_HEIST_CALL]: {
        status: louHeistCall.status === 'answered' || bankHeistStatus !== 'locked'
          ? 'answered' : 'pending',
      },
      // Same rule at the end of the line: an exposed Initiation is proof
      // Booskibro's big-night call already landed.
      [EVENT_IDS.BOOSKI_BIG_NIGHT_CALL]: {
        status: booskiBigNightCall.status === 'answered' || initiationStatus !== 'locked'
          ? 'answered' : 'pending',
      },
    },
  };

  if (saved.lastTransition
    && SCENES[saved.lastTransition.from]
    && SCENES[saved.lastTransition.to]
    && typeof saved.lastTransition.spawn === 'string') {
    state.lastTransition = {
      from: saved.lastTransition.from,
      to: saved.lastTransition.to,
      spawn: normalizedSpawn(saved.lastTransition.to, saved.lastTransition.spawn),
    };
  }
  return state;
}

function load(storage) {
  const fresh = {
    state: initialState(),
    storage,
    persist: false,
    recovery: null,
    newRecovery: null,
    readOnly: false,
  };
  if (!storage) return fresh;

  let raw;
  try {
    raw = storage.getItem(CAMPAIGN_STORAGE_KEY);
  } catch {
    return { ...fresh, storage: null };
  }
  try {
    const recoveryRaw = storage.getItem(CAMPAIGN_RECOVERY_KEY);
    if (recoveryRaw !== null) {
      const recovery = JSON.parse(recoveryRaw);
      if (recovery
        && typeof recovery.reason === 'string'
        && typeof recovery.raw === 'string') {
        fresh.recovery = recovery;
      }
    }
  } catch {
    // A damaged recovery record must never make a valid primary save unreadable.
  }
  if (raw === null) return fresh;

  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return {
      ...fresh,
      persist: true,
      newRecovery: { reason: 'invalid_json', raw },
    };
  }

  const migrated = migrate(saved);
  if (!migrated.ok) {
    const readOnly = migrated.reason === 'unsupported_version';
    return {
      ...fresh,
      persist: !readOnly,
      newRecovery: { reason: migrated.reason, raw },
      readOnly,
    };
  }

  const state = normalize(migrated.value);
  const normalizedChanged = JSON.stringify(state) !== JSON.stringify(migrated.value);
  const structurallyBroken = !migrated.changed
    && (!hasCurrentShape(migrated.value) || normalizedChanged);
  return {
    ...fresh,
    state,
    persist: migrated.changed || normalizedChanged,
    newRecovery: structurallyBroken ? { reason: 'invalid_shape', raw } : null,
  };
}

class Campaign {
  constructor(storage) {
    const loaded = load(storage);
    this.storage = loaded.storage;
    this._state = loaded.state;
    this._recoveredNow = Boolean(loaded.newRecovery);
    this._recovery = loaded.newRecovery ?? loaded.recovery;

    if (loaded.newRecovery && this.storage) {
      if (loaded.recovery
        && (loaded.recovery.reason !== loaded.newRecovery.reason
          || loaded.recovery.raw !== loaded.newRecovery.raw)) {
        this._recovery = {
          ...loaded.newRecovery,
          previous: {
            reason: loaded.recovery.reason,
            raw: loaded.recovery.raw,
          },
        };
      }
      try {
        this.storage.setItem(
          CAMPAIGN_RECOVERY_KEY,
          JSON.stringify(this._recovery),
        );
      } catch {
        // Never overwrite an unreadable save unless its recovery copy was
        // successfully preserved first.
        this.storage = null;
      }
    }
    if (loaded.readOnly) this.storage = null;
    if (loaded.persist && this.storage) this.#save();
  }

  get state() {
    return clone(this._state);
  }

  get recovery() {
    return this._recovery ? clone(this._recovery) : null;
  }

  get recoveredNow() {
    return this._recoveredNow;
  }

  get persistent() {
    return Boolean(this.storage);
  }

  /** True while the last save write failed and the next one will retry. */
  get saveFailing() {
    return Boolean(this._saveFailing);
  }

  addItem(itemId, { concealed = false } = {}) {
    const bucket = concealed ? 'concealed' : 'carried';
    const other = concealed ? 'carried' : 'concealed';
    this._state.inventory[other] = this._state.inventory[other]
      .filter((id) => id !== itemId);
    if (!this._state.inventory[bucket].includes(itemId)) {
      this._state.inventory[bucket].push(itemId);
    }
    this._state.revision++;
    this.#save();
  }

  hasItem(itemId) {
    return this._state.inventory.carried.includes(itemId)
      || this._state.inventory.concealed.includes(itemId);
  }

  update(change) {
    if (typeof change !== 'function') throw new TypeError('Campaign update requires a function');
    const candidate = clone(this._state);
    change(candidate);
    candidate.version = CAMPAIGN_VERSION;
    candidate.revision = this._state.revision + 1;
    this._state = normalize(candidate);
    this.#save();
    return this.state;
  }

  /** Commit a heist checkpoint or result only when it is durably saved. */
  updateRequired(change) {
    if (typeof change !== 'function') {
      throw new TypeError('Required campaign update requires a function');
    }
    const before = clone(this._state);
    const candidate = clone(this._state);
    change(candidate);
    candidate.version = CAMPAIGN_VERSION;
    candidate.revision = this._state.revision + 1;
    this._state = normalize(candidate);
    if (!this.#save()) {
      this._state = before;
      throw new Error('Required campaign update could not be saved');
    }
    return this.state;
  }

  /**
   * Register the page that actually loaded. This keeps direct development
   * entrypoints usable without inventing a story transition that never ran.
   */
  enter(sceneId, { spawn } = {}) {
    if (!SCENES[sceneId]) throw new Error(`Unknown scene "${sceneId}"`);
    const resolvedSpawn = requiredSpawn(sceneId, spawn);
    this._state.scene = { id: sceneId, spawn: resolvedSpawn };
    this._state.revision++;
    this.#save();
    return this.state;
  }

  advanceTime(eventId, change, { required = false } = {}) {
    const event = TIME_EVENTS[eventId];
    if (!event) throw new Error(`Unknown time event "${eventId}"`);
    if (change !== undefined && typeof change !== 'function') {
      throw new TypeError('Campaign time event change must be a function');
    }
    if (this._state.story.timeEvents.includes(eventId)) {
      return {
        applied: false,
        day: this._state.story.day,
        timeMinutes: this._state.story.timeMinutes,
        minutesAdvanced: 0,
      };
    }

    const before = (this._state.story.day - 1) * MINUTES_PER_DAY
      + this._state.story.timeMinutes;
    const target = event.atLeast
      ? (event.atLeast.day - 1) * MINUTES_PER_DAY + event.atLeast.timeMinutes
      : before + event.minutes;
    const absolute = Math.max(before, target);
    const minutesAdvanced = absolute - before;
    const commit = required ? this.updateRequired.bind(this) : this.update.bind(this);
    commit((state) => {
      change?.(state);
      state.story.day = Math.floor(absolute / MINUTES_PER_DAY) + 1;
      state.story.timeMinutes = absolute % MINUTES_PER_DAY;
      state.story.timeEvents.push(eventId);
    });
    return {
      applied: true,
      day: this._state.story.day,
      timeMinutes: this._state.story.timeMinutes,
      minutesAdvanced,
    };
  }

  transition(sceneId, { spawn } = {}) {
    const before = clone(this._state);
    const from = this._state.scene.id;
    if (!SCENES[sceneId]) throw new Error(`Unknown scene "${sceneId}"`);
    if (!SCENES[from]?.next.includes(sceneId)) {
      throw new Error(`Cannot transition from "${from}" to "${sceneId}"`);
    }
    const resolvedSpawn = requiredSpawn(sceneId, spawn);
    this._state.scene = { id: sceneId, spawn: resolvedSpawn };
    this._state.lastTransition = { from, to: sceneId, spawn: resolvedSpawn };
    this._state.revision++;
    if (!this.#save()) {
      this._state = before;
      throw new Error('Campaign transition could not be saved');
    }
    return this.state;
  }

  restore(snapshot) {
    this._state = normalize({
      ...clone(snapshot),
      version: CAMPAIGN_VERSION,
    });
    if (!this.#save()) {
      throw new Error('Campaign rollback could not be saved');
    }
    return this.state;
  }

  /**
   * Start over deliberately.
   *
   * This is intentionally separate from recovery: a repaired save keeps a
   * forensic copy of the damaged data, whereas a player-confirmed restart
   * replaces the primary save with Day One and discards any old recovery
   * record. Write the fresh primary first so a storage failure never erases
   * the campaign that was on disk.
   */
  reset() {
    const fresh = initialState();
    if (this.storage) {
      try {
        this.storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(fresh));
      } catch {
        return null;
      }
      try {
        this.storage.removeItem?.(CAMPAIGN_RECOVERY_KEY);
      } catch {
        // The valid new primary campaign is still more important than an old
        // recovery note that the player explicitly chose to discard.
      }
      try {
        this.storage.removeItem?.(FINAL_ARC_LOADOUT_STORAGE_KEY);
      } catch {
        // The fresh campaign remains authoritative even when a hostile
        // storage shim refuses cleanup. A later final-arc page will still be
        // gated by the reset story before it can expose this adapter state.
      }
      try {
        this.storage.removeItem?.(SCENE_RECOVERY_STORAGE_KEY);
      } catch {
        // A fresh campaign must not inherit an unlocked recovery skip. The
        // primary save is still authoritative if optional cleanup is denied.
      }
      const preview = getPreviewRuntime();
      if (preview?.storage === this.storage) {
        try {
          globalThis.sessionStorage?.removeItem?.(SCENE_RECOVERY_STORAGE_KEY);
        } catch {
          // Preview retry state is isolated already; denied session cleanup
          // must not make the in-memory New Game itself fail.
        }
      }
    }
    this._state = fresh;
    this._recovery = null;
    this._recoveredNow = false;
    return this.state;
  }

  #save() {
    if (!this.storage) return false;
    try {
      this.storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(this._state));
      if (this._saveFailing) {
        // A later write went through — the quota was cleared, the frame was
        // unblocked. Progress is persisting again; take the warning down.
        this._saveFailing = false;
        updateSaveFailureNotice(false);
      }
      return true;
    } catch {
      // Sandboxed frames, privacy modes, and full quotas can expose
      // localStorage but reject writes. The current page still gets a
      // coherent in-memory campaign — but this used to null the storage
      // handle, permanently and silently, so one transient quota error meant
      // the whole session played on looking fine while persisting nothing.
      // Keep the handle and retry on the next save, and say so on screen.
      this._saveFailing = true;
      updateSaveFailureNotice(true);
      return false;
    }
  }
}

/**
 * The player-visible "progress is not saving" banner.
 *
 * Owned here rather than by any scene because every scene saves through
 * `Campaign#save` and none of them can see a `setItem` throw from where they
 * stand. DOM-optional: unit tests and node tools construct campaigns with no
 * document, and a page whose DOM shim cannot build the banner still keeps its
 * coherent in-memory campaign.
 */
const SAVE_FAILURE_NOTICE_ID = 'campaign-save-failure-notice';
function updateSaveFailureNotice(failing) {
  try {
    const doc = globalThis.document;
    if (!doc?.body || typeof doc.createElement !== 'function') return;
    const existing = doc.getElementById?.(SAVE_FAILURE_NOTICE_ID) ?? null;
    if (!failing) {
      existing?.remove?.();
      return;
    }
    if (existing) return;
    const el = doc.createElement('div');
    el.id = SAVE_FAILURE_NOTICE_ID;
    el.setAttribute?.('role', 'alert');
    el.textContent = 'Progress is not saving — browser storage is full or blocked. '
      + 'The game keeps playing and will retry on the next save.';
    // Above the pause menu (z 100000): a player deciding whether to stop here
    // is exactly the player who needs to know nothing is being kept.
    if (el.style) {
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100001;'
        + 'padding:10px 16px;background:#7a1f1f;color:#ffe9e9;'
        + 'font:700 13px/1.4 "Trebuchet MS","Segoe UI",Verdana,sans-serif;'
        + 'letter-spacing:.04em;text-align:center;pointer-events:none;';
    }
    doc.body.appendChild(el);
  } catch {
    // No DOM, or a hostile shim: the in-memory campaign is still coherent.
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function boundedNumber(value, min, max, fallback, integer = false) {
  if (!Number.isFinite(value)) return fallback;
  const bounded = Math.max(min, Math.min(max, value));
  return integer ? Math.round(bounded) : bounded;
}

const APARTMENT_PREVIEW_CHECKPOINTS = Object.freeze({
  'day-one-wake': Object.freeze({
    progress: 0, spawn: 'wake', chapter: 'day_one', day: 1, timeMinutes: 6 * 60 + 4,
  }),
  'after-bing-one': Object.freeze({
    progress: 1, spawn: 'front_door', chapter: 'day_one', day: 1,
    timeMinutes: 23 * 60 + 41,
  }),
  'after-squatchfather': Object.freeze({
    progress: 2, spawn: 'front_door', chapter: 'day_one', day: 2,
    timeMinutes: 3 * 60,
  }),
  'day-two-wake': Object.freeze({
    progress: 2, spawn: 'wake', chapter: 'day_two', day: 2, timeMinutes: 7 * 60,
  }),
  'after-beef-run': Object.freeze({
    progress: 3, spawn: 'front_door', chapter: 'day_two', day: 2,
    timeMinutes: 20 * 60 + 30,
  }),
  'after-motel': Object.freeze({
    progress: 4, spawn: 'front_door', chapter: 'day_two', day: 3,
    timeMinutes: 4 * 60 + 30,
  }),
  'day-three-wake': Object.freeze({
    progress: 4, spawn: 'wake', chapter: 'no_wake', day: 3, timeMinutes: 12 * 60,
  }),
  'after-no-wake': Object.freeze({
    progress: 5, spawn: 'front_door', chapter: 'date', day: 3,
    timeMinutes: 16 * 60 + 40,
  }),
  'after-silver-room': Object.freeze({
    progress: 6, spawn: 'front_door', chapter: 'date', day: 3,
    timeMinutes: 23 * 60 + 20,
  }),
  'day-four-wake': Object.freeze({
    progress: 6, spawn: 'wake', chapter: 'golf_morning', day: 4, timeMinutes: 7 * 60,
  }),
  'after-golf': Object.freeze({
    progress: 7, spawn: 'front_door', chapter: 'heist_day', day: 4,
    timeMinutes: 10 * 60 + 30,
  }),
  'after-heist': Object.freeze({
    progress: 8, spawn: 'front_door', chapter: 'post_heist', day: 4,
    timeMinutes: 17 * 60 + 20,
  }),
});

const PREVIEW_CLEANUP_TASKS = Object.freeze([
  'bathrooms', 'cleaning_kit', 'missing_evidence', 'final_sweep',
]);

function seedCompletedGolfRound(golf) {
  Object.assign(golf, {
    status: 'complete',
    holesPlayed: 3,
    strokes: 14,
    penalties: 0,
    toPar: 2,
    holes: [
      { hole: 1, par: 3, strokes: 4, penalties: 0 },
      { hole: 2, par: 5, strokes: 5, penalties: 0 },
      { hole: 3, par: 4, strokes: 5, penalties: 0 },
    ],
    heardInvitation: true,
    rodeWithLou: true,
    ace: false,
    foundWater: false,
    hitGreenInRegulation: true,
    grandfathered: false,
  });
}

function previewCarry(state, itemId, { concealed = false } = {}) {
  state.inventory.carried = state.inventory.carried.filter((id) => id !== itemId);
  state.inventory.concealed = state.inventory.concealed.filter((id) => id !== itemId);
  state.inventory[concealed ? 'concealed' : 'carried'].push(itemId);
}

function seedApartmentPreviewCampaign(state, variant) {
  const checkpoint = APARTMENT_PREVIEW_CHECKPOINTS[variant];
  if (!checkpoint) return null;

  const firstBing = state.missions[MISSION_IDS.BADA_BING_ONE];
  const squatchfather = state.missions[MISSION_IDS.SQUATCHFATHER];
  const airstrip = state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
  const secondBing = state.missions[MISSION_IDS.BADA_BING_TWO];
  const motel = state.missions[MISSION_IDS.JERKY_MOTEL];
  const noWake = state.missions[MISSION_IDS.NO_WAKE];
  const silver = state.missions[MISSION_IDS.SILVER_ROOM];
  const golf = state.missions[MISSION_IDS.SILVER_PINES];
  const bankHeist = state.missions[MISSION_IDS.BANK_HEIST];
  const completedTimeEvents = [];
  const markTime = (...eventIds) => completedTimeEvents.push(...eventIds);

  if (checkpoint.progress >= 1) {
    firstBing.status = 'complete';
    firstBing.packageReceived = true;
    firstBing.ending = 'clean';
    squatchfather.status = 'available';
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    previewCarry(state, ITEM_IDS.PHONE);
    previewCarry(state, ITEM_IDS.LOU_PACKAGE, { concealed: true });
    Object.assign(state.activities, {
      eaten: true,
      showered: true,
      pooped: true,
      changedClothes: true,
      emailChecked: true,
    });
    markTime(TIME_EVENT_IDS.LOU_FIRST_CALL, TIME_EVENT_IDS.DEPART_BADA_BING_ONE);
  }

  if (checkpoint.progress >= 2) {
    squatchfather.status = 'complete';
    squatchfather.weaponStaged = true;
    squatchfather.weaponDropped = true;
    state.activities.whiskeyRelaxed = true;
    state.inventory.carried = state.inventory.carried
      .filter((id) => id !== ITEM_IDS.LOU_PACKAGE);
    state.inventory.concealed = state.inventory.concealed
      .filter((id) => id !== ITEM_IDS.LOU_PACKAGE);
    markTime(TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER);
  }

  if (checkpoint.progress >= 3) {
    state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
    airstrip.status = 'complete';
    airstrip.checkpoint = 'landed_home';
    airstrip.cargoLoaded = true;
    airstrip.detected = false;
    /* `'smooth'` was a fifth vocabulary nobody reads: the golf callback tests
     * `clean | greased | perfect`, so the preview's own good run was scored as
     * a bad one. `greased` is the token that means what this seed meant. */
    airstrip.landingQuality = 'greased';
    airstrip.rank = 'Certified Meat Aviator';
    airstrip.unlocks = ['prospectFlightJacket', 'brushrunnerAccess', 'tammyDashboardMug',
      'stoveBusinessCard', 'silverbackOrnament', 'elHuesoFreeFlight'];
    airstrip.packagesDelivered = 27;
    airstrip.gunsDelivered = 3;
    markTime(
      TIME_EVENT_IDS.BOOSKI_DAY_TWO_CALL,
      TIME_EVENT_IDS.DEPART_AIRSTRIP,
      TIME_EVENT_IDS.COMPLETE_AIRSTRIP,
    );
  }

  if (checkpoint.progress >= 4) {
    state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
    secondBing.status = 'complete';
    secondBing.checkpoint = 'buried';
    secondBing.assignment = 'reserve_pickup';
    secondBing.attackResolved = true;
    secondBing.cleanupTasks = [...PREVIEW_CLEANUP_TASKS];
    secondBing.bodyWrapped = true;
    secondBing.bodyLoaded = true;
    secondBing.burialComplete = true;
    motel.status = 'complete';
    motel.ending = 'home';
    motel.cargoRecovered = true;
    motel.packagesIntact = 3;
    motel.freshness = 78;
    motel.policeHeat = 18;
    markTime(
      TIME_EVENT_IDS.LOU_SECOND_CALL,
      TIME_EVENT_IDS.DEPART_BADA_BING_TWO,
      TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD,
      TIME_EVENT_IDS.COMPLETE_BADA_BING_TWO,
      TIME_EVENT_IDS.DEPART_JERKY_MOTEL,
      TIME_EVENT_IDS.COMPLETE_JERKY_MOTEL,
    );
  }

  if (checkpoint.progress >= 5) {
    state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
    noWake.status = 'complete';
    noWake.checkpoint = 'returned';
    noWake.betrayalConfirmed = true;
    noWake.playerFired = true;
    noWake.bodyDisposed = true;
    markTime(
      TIME_EVENT_IDS.LOU_NO_WAKE_CALL,
      TIME_EVENT_IDS.DEPART_NO_WAKE,
      TIME_EVENT_IDS.COMPLETE_NO_WAKE,
    );
  }

  if (checkpoint.progress >= 6) {
    state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
    silver.status = 'complete';
    silver.outcome = 'strong';
    silver.woo = 74;
    silver.band = 'midnight_pines';
    silver.tippedEverybody = true;
    silver.rememberedDrink = true;
    silver.seeingHerAgain = true;
    silver.knowsWhatHeDoes = true;
    /* Matches what `src/silver/mission.js` itself derives for this outcome --
     * `['perfect', 'strong'].includes(outcome)` -- so a seeded preview save
     * agrees with a played one about whether she came home. Left off before,
     * this field defaulted to `undefined`, which `margoWakeOwed` treats as
     * "yes" (a pre-existing-save shim) but `margoComeHomeOwed` does not: a
     * preview seeded straight to `date`/`front_door` would have reported the
     * outcome that earns her coming home while quietly deciding she had not. */
    silver.cameHome = true;
    markTime(
      TIME_EVENT_IDS.MARGO_DATE_CALL,
      TIME_EVENT_IDS.DEPART_SILVER_ROOM,
      TIME_EVENT_IDS.COMPLETE_SILVER_ROOM,
    );
  }

  if (checkpoint.progress >= 7) {
    state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
    seedCompletedGolfRound(golf);
    markTime(
      TIME_EVENT_IDS.MARGO_COME_HOME,
      TIME_EVENT_IDS.MARGO_WAKE,
      TIME_EVENT_IDS.LOU_GOLF_CALL,
      TIME_EVENT_IDS.DEPART_SILVER_PINES,
      TIME_EVENT_IDS.COMPLETE_SILVER_PINES,
    );
    state.events[EVENT_IDS.LOU_HEIST_CALL].status = 'pending';
    bankHeist.status = 'locked';
  }

  if (checkpoint.progress >= 8) {
    state.events[EVENT_IDS.LOU_HEIST_CALL].status = 'answered';
    bankHeist.status = 'complete';
    bankHeist.checkpoint = 'vehicle_swap';
    bankHeist.briefingComplete = true;
    Object.assign(bankHeist.preparation, {
      armor: true,
      gloves: true,
      mask: true,
      carbine: true,
      sidearm: true,
      magazines: true,
      duffel: true,
    });
    bankHeist.preparationComplete = true;
    Object.assign(bankHeist, {
      bankEntered: true,
      guardsDisarmed: 2,
      alarmTriggered: true,
      vaultOpened: true,
      bagsStaged: 8,
      bagsRecovered: 7,
      grossTake: 1_260_000,
      compromisedCash: 0,
      operationalLoss: 55_500,
      familyShare: 602_250,
      crewShare: 481_800,
      prospectShare: 120_450,
      primaryVanLost: true,
      playerDroveEscape: true,
      vehicleDamage: 41,
      policeHeat: 61,
      followedSnow: true,
      disciplinedFire: true,
      crewSurvived: true,
      outcome: 'professional',
    });
    bankHeist.crewInjuries[CHARACTER_IDS.RIPPINFLOW] = 'moderate';
    bankHeist.cleanup.finalCalls = true;
    state.missions[MISSION_IDS.SILVER_CASE].status = 'available';
    markTime(
      TIME_EVENT_IDS.LOU_HEIST_CALL,
      TIME_EVENT_IDS.DEPART_BANK_HEIST,
      TIME_EVENT_IDS.COMPLETE_BANK_HEIST,
    );
  }

  if (checkpoint.spawn === 'wake') {
    state.activities.eaten = false;
    state.activities.showered = false;
    state.activities.peed = false;
    state.activities.pooped = false;
    state.activities.changedClothes = false;
  }
  state.story.chapter = checkpoint.chapter;
  state.story.day = checkpoint.day;
  state.story.timeMinutes = checkpoint.timeMinutes;
  state.story.timeEvents = completedTimeEvents;
  return checkpoint.spawn;
}

/**
 * Build the same normalized temporary campaign state used by an Apartment
 * preview without consulting browser globals or persistent storage. Headless
 * verifiers use this to dress each preview variant exactly as runtime does.
 */
export function apartmentPreviewCampaignState(variant) {
  let spawn = null;
  const campaign = new Campaign(null);
  const state = campaign.update((candidate) => {
    spawn = seedApartmentPreviewCampaign(candidate, variant);
    if (spawn === null) throw new RangeError(`Unknown Apartment preview variant "${variant}"`);
  });
  return Object.freeze({ state, spawn });
}

function seedPreviewCampaign(campaign, sceneId, apartmentVariant = null) {
  let apartmentSpawn = null;
  campaign.update((state) => {
    const firstBing = state.missions[MISSION_IDS.BADA_BING_ONE];
    const squatchfather = state.missions[MISSION_IDS.SQUATCHFATHER];
    const airstrip = state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING];
    const secondBing = state.missions[MISSION_IDS.BADA_BING_TWO];
    const motel = state.missions[MISSION_IDS.JERKY_MOTEL];
    const noWake = state.missions[MISSION_IDS.NO_WAKE];
    const silver = state.missions[MISSION_IDS.SILVER_ROOM];
    const golf = state.missions[MISSION_IDS.SILVER_PINES];
    const bankHeist = state.missions[MISSION_IDS.BANK_HEIST];
    const silverCase = state.missions[MISSION_IDS.SILVER_CASE];
    const silentSquatch = state.missions[MISSION_IDS.SILENT_SQUATCH];
    const mansionSiege = state.missions[MISSION_IDS.MANSION_SIEGE];
    const enolaSquatch = state.missions[MISSION_IDS.ENOLA_SQUATCH];
    const mansionReturn = state.missions[MISSION_IDS.MANSION_RETURN];
    const cartelPalace = state.missions[MISSION_IDS.CARTEL_PALACE];
    const initiation = state.missions[MISSION_IDS.INITIATION];
    const finalArcPrelude = [
      SCENE_IDS.SILVER_CASE,
      SCENE_IDS.MANSION_SIEGE,
      SCENE_IDS.ENOLA_SQUATCH,
      SCENE_IDS.MANSION_RETURN,
      SCENE_IDS.CARTEL_PALACE,
    ].includes(sceneId);
    const seedFinalArcClock = (eventCount) => {
      const reached = FINAL_ARC_TIME_EVENT_ORDER.slice(0, eventCount);
      let clock = {
        ...state.story,
        day: 4,
        timeMinutes: 17 * 60 + 20,
        timeEvents: [],
      };
      for (const eventId of reached) clock = storyAfterTimeEvent(clock, eventId);
      state.story.day = clock.day;
      state.story.timeMinutes = clock.timeMinutes;
      state.story.timeEvents = uniqueStrings([
        ...uniqueStrings(state.story.timeEvents),
        ...reached,
      ]);
    };

    if (sceneId === SCENE_IDS.APARTMENT) {
      apartmentSpawn = seedApartmentPreviewCampaign(state, apartmentVariant);
      return;
    }

    if (sceneId === SCENE_IDS.BADA_BING_ONE) {
      firstBing.status = 'available';
      state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
      return;
    }

    /* Lou's mansion, previewed at the top of PROJECT SILENT SQUATCH: the
     * mission exposed, and the case from The Silver Case already in his
     * hands, because the whole first beat is carrying it up the stairs. */
    if (sceneId === SCENE_IDS.MANSION) {
      silverCase.status = 'complete';
      silverCase.checkpoint = 'case_recovered';
      silverCase.caseRecovered = true;
      silverCase.winstonOutcome = 'spared';
      silentSquatch.status = 'available';
      state.story.chapter = 'mansion';
      seedFinalArcClock(3);
      previewCarry(state, ITEM_IDS.SILVER_CASE);
      return;
    }

    if ([
      SCENE_IDS.SQUATCHFATHER,
      SCENE_IDS.AIRSTRIP_SMUGGLING,
      SCENE_IDS.BADA_BING_TWO,
      SCENE_IDS.SQUATCH_GRAVEYARD,
      SCENE_IDS.JERKY_MOTEL,
      SCENE_IDS.NO_WAKE,
      SCENE_IDS.SILVER_ROOM,
      SCENE_IDS.SILVER_PINES,
      SCENE_IDS.BANK_HEIST,
      SCENE_IDS.INITIATION,
    ].includes(sceneId) || finalArcPrelude) {
      firstBing.status = 'complete';
      firstBing.packageReceived = true;
      state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    }

    if (sceneId === SCENE_IDS.SQUATCHFATHER) {
      squatchfather.status = 'available';
      if (!state.inventory.concealed.includes(ITEM_IDS.LOU_PACKAGE)) {
        state.inventory.concealed.push(ITEM_IDS.LOU_PACKAGE);
      }
      return;
    }

    if (sceneId === SCENE_IDS.AIRSTRIP_SMUGGLING) {
      squatchfather.status = 'complete';
      squatchfather.weaponStaged = true;
      squatchfather.weaponDropped = true;
      state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
      airstrip.status = 'available';
      return;
    }

    if ([
      SCENE_IDS.BADA_BING_TWO,
      SCENE_IDS.SQUATCH_GRAVEYARD,
      SCENE_IDS.JERKY_MOTEL,
      SCENE_IDS.NO_WAKE,
      SCENE_IDS.SILVER_ROOM,
      SCENE_IDS.SILVER_PINES,
      SCENE_IDS.BANK_HEIST,
      SCENE_IDS.INITIATION,
    ].includes(sceneId) || finalArcPrelude) {
      squatchfather.status = 'complete';
      squatchfather.weaponStaged = true;
      squatchfather.weaponDropped = true;
      airstrip.status = 'complete';
      airstrip.checkpoint = 'landed_home';
      airstrip.cargoLoaded = true;
      state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
      state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
    }

    if (sceneId === SCENE_IDS.BADA_BING_TWO) {
      secondBing.status = 'available';
      return;
    }

    if (sceneId === SCENE_IDS.SQUATCH_GRAVEYARD) {
      secondBing.status = 'in_progress';
      secondBing.checkpoint = 'body_loaded';
      secondBing.assignment = 'reserve_pickup';
      secondBing.attackResolved = true;
      secondBing.cleanupTasks = ['bathrooms', 'cleaning_kit', 'missing_evidence', 'final_sweep'];
      secondBing.bodyWrapped = true;
      secondBing.bodyLoaded = true;
      motel.status = 'locked';
      state.story = storyAfterTimeEvent(
        state.story,
        TIME_EVENT_IDS.ARRIVE_SQUATCH_GRAVEYARD,
      );
      return;
    }

    if ([
      SCENE_IDS.JERKY_MOTEL,
      SCENE_IDS.NO_WAKE,
      SCENE_IDS.SILVER_ROOM,
      SCENE_IDS.SILVER_PINES,
      SCENE_IDS.BANK_HEIST,
      SCENE_IDS.INITIATION,
    ].includes(sceneId) || finalArcPrelude) {
      secondBing.status = 'complete';
      secondBing.checkpoint = 'buried';
      secondBing.assignment = 'reserve_pickup';
      secondBing.attackResolved = true;
      secondBing.cleanupTasks = ['bathrooms', 'cleaning_kit', 'missing_evidence', 'final_sweep'];
      secondBing.bodyWrapped = true;
      secondBing.bodyLoaded = true;
      secondBing.burialComplete = true;
      motel.status = 'available';
    }

    if ([
      SCENE_IDS.NO_WAKE, SCENE_IDS.SILVER_ROOM, SCENE_IDS.SILVER_PINES,
      SCENE_IDS.BANK_HEIST,
      SCENE_IDS.INITIATION,
    ].includes(sceneId) || finalArcPrelude) {
      motel.status = 'complete';
      motel.ending = 'home';
      motel.cargoRecovered = true;
    }

    if (sceneId === SCENE_IDS.NO_WAKE) {
      state.story.chapter = 'no_wake';
      state.story.day = 3;
      state.story.timeMinutes = 12 * 60 + 45;
      state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
      noWake.status = 'available';
      return;
    }

    if ([
      SCENE_IDS.SILVER_ROOM, SCENE_IDS.SILVER_PINES,
      SCENE_IDS.BANK_HEIST, SCENE_IDS.INITIATION,
    ]
      .includes(sceneId) || finalArcPrelude) {
      noWake.status = 'complete';
      noWake.checkpoint = 'returned';
      noWake.betrayalConfirmed = true;
      noWake.playerFired = true;
      noWake.bodyDisposed = true;
      state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
      state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
    }

    if (sceneId === SCENE_IDS.SILVER_ROOM) {
      /* He slept off the Motel, woke at noon, and she rang in the afternoon.
       * Half seven on the evening of Day 3, on his way out of the door. */
      state.story.chapter = 'date';
      state.story.day = 3;
      state.story.timeMinutes = 19 * 60 + 30;
      silver.status = 'available';
      return;
    }

    if ([SCENE_IDS.SILVER_PINES, SCENE_IDS.BANK_HEIST, SCENE_IDS.INITIATION]
      .includes(sceneId) || finalArcPrelude) {
      silver.status = 'complete';
      silver.outcome = 'strong';
      silver.woo = 74;
      silver.seeingHerAgain = true;
    }

    if (sceneId === SCENE_IDS.SILVER_PINES) {
      state.story.chapter = 'golf_morning';
      state.story.day = 4;
      state.story.timeMinutes = 7 * 60 + 30;
      if (!state.story.timeEvents.includes(TIME_EVENT_IDS.MARGO_WAKE)) {
        state.story.timeEvents.push(TIME_EVENT_IDS.MARGO_WAKE);
      }
      if (!state.story.timeEvents.includes(TIME_EVENT_IDS.LOU_GOLF_CALL)) {
        state.story.timeEvents.push(TIME_EVENT_IDS.LOU_GOLF_CALL);
      }
      /* Preview models the same arrival contract as the apartment route. The
       * GolfStory guard requires both this marker and the scene transition;
       * `seedPreviewCampaign` performs the transition immediately below. */
      if (!state.story.timeEvents.includes(TIME_EVENT_IDS.DEPART_SILVER_PINES)) {
        state.story.timeEvents.push(TIME_EVENT_IDS.DEPART_SILVER_PINES);
      }
      state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
      golf.status = 'available';
      return;
    }

    if ([SCENE_IDS.BANK_HEIST, SCENE_IDS.INITIATION].includes(sceneId)
      || finalArcPrelude) {
      seedCompletedGolfRound(golf);
      state.story.chapter = 'heist_day';
      state.story.day = 4;
      state.story.timeMinutes = 11 * 60 + 15;
      for (const eventId of [
        TIME_EVENT_IDS.MARGO_WAKE,
        TIME_EVENT_IDS.LOU_GOLF_CALL,
        TIME_EVENT_IDS.DEPART_SILVER_PINES,
        TIME_EVENT_IDS.COMPLETE_SILVER_PINES,
      ]) {
        if (!state.story.timeEvents.includes(eventId)) {
          state.story.timeEvents.push(eventId);
        }
      }
      state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
      state.events[EVENT_IDS.LOU_HEIST_CALL].status = 'answered';
    }

    if (sceneId === SCENE_IDS.BANK_HEIST) {
      bankHeist.status = 'available';
      Object.assign(bankHeist.preparation, {
        armor: true,
        gloves: true,
        mask: true,
        carbine: true,
        sidearm: true,
        magazines: true,
        duffel: true,
      });
      return;
    }

    if (sceneId === SCENE_IDS.INITIATION || finalArcPrelude) {
      bankHeist.status = 'complete';
      bankHeist.checkpoint = 'vehicle_swap';
      bankHeist.briefingComplete = true;
      Object.assign(bankHeist.preparation, {
        armor: true, gloves: true, mask: true, carbine: true,
        sidearm: true, magazines: true, duffel: true,
      });
      Object.assign(bankHeist.cleanup, {
        washed: true, changed: true, gearSecured: true, finalCalls: true,
      });
      bankHeist.bankEntered = true;
      bankHeist.alarmTriggered = true;
      bankHeist.vaultOpened = true;
      bankHeist.bagsStaged = 8;
      bankHeist.bagsRecovered = 7;
      bankHeist.grossTake = 1_260_000;
      bankHeist.playerDroveEscape = true;
      bankHeist.primaryVanLost = true;
      bankHeist.crewInjuries[CHARACTER_IDS.RIPPINFLOW] = 'moderate';
      bankHeist.outcome = 'professional';
      state.story.timeMinutes = 19 * 60;

      if (sceneId === SCENE_IDS.SILVER_CASE) {
        state.story.chapter = 'silver_case';
        silverCase.status = 'available';
        seedFinalArcClock(1);
        return;
      }

      Object.assign(silverCase, {
        status: 'complete',
        checkpoint: 'case_recovered',
        caseRecovered: true,
        winstonOutcome: 'spared',
      });

      Object.assign(silentSquatch, {
        status: 'complete',
        checkpoint: 'clear',
        casePlaced: true,
        caseDelivered: true,
        labLocked: true,
        aubbieEliminated: true,
        silentNightActivated: true,
        basementUnlocked: true,
        notesRecovered: true,
        conspiracyBoard: true,
        trophyAwarded: true,
        eveningReady: true,
        /* A canonical slept-through record: the wind-down happened too. */
        eveningBeats: ['theatre', 'bar'],
        sleptAtMansion: true,
      });

      if (sceneId === SCENE_IDS.MANSION_SIEGE) {
        state.story.chapter = 'mansion_siege';
        mansionSiege.status = 'available';
        seedFinalArcClock(5);
        return;
      }

      Object.assign(mansionSiege, {
        status: 'complete',
        checkpoint: 'wave_one',
        attackersDown: 8,
        littleFriendSaid: true,
        sasoleMet: true,
      });

      if (sceneId === SCENE_IDS.ENOLA_SQUATCH) {
        state.story.chapter = 'enola_squatch';
        enolaSquatch.status = 'available';
        seedFinalArcClock(7);
        return;
      }

      Object.assign(enolaSquatch, {
        status: 'complete',
        checkpoint: 'return',
        rank: 'A',
        score: 0.9,
        unlocks: ['precision_release'],
        payloadReleased: true,
        returnedHome: true,
      });

      if (sceneId === SCENE_IDS.MANSION_RETURN) {
        state.story.chapter = 'mansion_return';
        mansionReturn.status = 'available';
        seedFinalArcClock(9);
        return;
      }

      Object.assign(mansionReturn, {
        status: 'complete',
        briefingComplete: true,
        wrongCityConfirmed: true,
        sauceMissingConfirmed: true,
        palaceLocationKnown: true,
      });

      if (sceneId === SCENE_IDS.CARTEL_PALACE) {
        state.story.chapter = 'cartel_palace';
        cartelPalace.status = 'available';
        seedFinalArcClock(10);
        return;
      }

      Object.assign(cartelPalace, {
        status: 'complete',
        checkpoint: 'clear',
        evidenceFound: ['photograph', 'security_tape'],
        sauceBetrayalConfirmed: true,
        markEliminated: true,
        sauceEliminated: true,
        outcome: 'clean',
      });
      state.story.chapter = 'big_night';
      seedFinalArcClock(12);
      state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status = 'answered';
      initiation.status = 'available';
    }
  });

  const spawn = apartmentSpawn ?? SCENES[sceneId]?.defaultSpawn;
  campaign.enter(sceneId, { spawn });
}

export function createCampaign(options = {}) {
  const explicitStorage = Object.prototype.hasOwnProperty.call(options, 'storage');
  const preview = explicitStorage ? null : getPreviewRuntime();
  const storage = explicitStorage ? options.storage : (preview?.storage ?? browserStorage());
  const campaign = new Campaign(storage);

  if (preview && !preview.seeded) {
    seedPreviewCampaign(campaign, preview.sceneId, preview.apartmentVariant);
    preview.seeded = true;
  }
  if (preview) installPreviewNotice();
  return campaign;
}

/**
 * Dump the persisted campaign exactly as it is stored.
 *
 * The raw string on purpose: a playtester handing a BROKEN save to a
 * developer is half the reason this exists, so the export must not repair,
 * normalise, or even parse what it ships. A save that never made it to disk
 * has nothing to export — `raw` is null then and the UI says so.
 *
 * The recovery record rides along when one exists, because for a save that
 * has already been repaired the recovery copy IS the broken data worth
 * looking at.
 */
export function exportCampaignSave({ storage = browserStorage() } = {}) {
  let raw = null;
  let recovery = null;
  try {
    raw = storage?.getItem?.(CAMPAIGN_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  try {
    recovery = storage?.getItem?.(CAMPAIGN_RECOVERY_KEY) ?? null;
  } catch {
    recovery = null;
  }
  /* `text` is the file/clipboard payload: a wrapper naming what it is, with
   * the save carried VERBATIM as a string. `importCampaignSave` unwraps this
   * form and also accepts a bare pasted save, so a hand-copied
   * `squatchlife.campaign` value round-trips just as well. */
  const text = raw === null ? null : JSON.stringify({
    squatchlifeExport: 1,
    exportedAt: new Date().toISOString(),
    save: raw,
    recovery,
  }, null, 2);
  return { raw, recovery, text };
}

/**
 * Restore a campaign from exported JSON, through the ONE existing door.
 *
 * The pasted text goes down the same `migrate()` + `normalize()` path a
 * stored save takes at load, so an old export is brought forward through
 * every migration and a save from a newer build is refused rather than
 * half-read (`unsupported_version`). Nothing is written unless the whole
 * pipeline succeeds; the page should reload after a successful import so
 * every live system re-reads the new save.
 */
export function importCampaignSave(json, { storage = browserStorage() } = {}) {
  if (typeof json !== 'string' || !json.trim()) {
    return { ok: false, reason: 'empty' };
  }
  if (!storage) return { ok: false, reason: 'no_storage' };
  let saved;
  try {
    saved = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  /* An exported file wraps the save as a verbatim string — unwrap it. A bare
   * pasted save object goes straight through. */
  if (saved && typeof saved === 'object' && !Array.isArray(saved)
    && typeof saved.squatchlifeExport === 'number'
    && typeof saved.save === 'string') {
    try {
      saved = JSON.parse(saved.save);
    } catch {
      return { ok: false, reason: 'invalid_json' };
    }
  }
  const migrated = migrate(saved);
  if (!migrated.ok) return { ok: false, reason: migrated.reason };
  const state = normalize(migrated.value);
  try {
    storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    return { ok: false, reason: 'write_failed' };
  }
  /* Same cleanup as a deliberate reset: the recovery record, loadout, and
   * unlocked recovery skip all describe the save being replaced, not the one
   * just imported. The new primary stays authoritative even when a hostile
   * storage shim refuses the optional cleanup. */
  for (const key of [
    CAMPAIGN_RECOVERY_KEY,
    FINAL_ARC_LOADOUT_STORAGE_KEY,
    SCENE_RECOVERY_STORAGE_KEY,
  ]) {
    try {
      storage.removeItem?.(key);
    } catch {
      // Optional cleanup only.
    }
  }
  return { ok: true, state: clone(state) };
}

/**
 * Give one physical radio receiver access to the campaign's shared station.
 * The radio runtime only sees this narrow snapshot interface; save repair and
 * localStorage ownership remain inside Campaign.
 */
export function createCampaignRadioAdapter(
  campaign,
  { receiverId, defaultPower = true } = {},
) {
  if (!campaign || typeof campaign.update !== 'function') {
    throw new TypeError('Campaign radio adapter requires a campaign');
  }
  if (typeof receiverId !== 'string' || !receiverId) {
    throw new TypeError('Campaign radio adapter requires a receiverId');
  }

  return Object.freeze({
    load() {
      const radio = campaign.state.radio;
      return {
        ...radio,
        selections: { ...radio.selections },
        heardBulletins: [...radio.heardBulletins],
        power: typeof radio.receivers[receiverId] === 'boolean'
          ? radio.receivers[receiverId] : defaultPower,
      };
    },

    save(snapshot) {
      campaign.update((state) => {
        const radio = state.radio;
        radio.volume = snapshot.volume;
        radio.cursor = snapshot.cursor;
        radio.cycle = snapshot.cycle;
        radio.selections = { ...snapshot.selections };
        radio.songReactionCursor = snapshot.songReactionCursor;
        radio.adReactionCursor = snapshot.adReactionCursor;
        if (typeof snapshot.power === 'boolean') {
          radio.receivers[receiverId] = snapshot.power;
        }
      });
    },

    hasHeardBulletin(id) {
      return typeof id === 'string' && campaign.state.radio.heardBulletins.includes(id);
    },

    markBulletinHeard(id) {
      if (typeof id !== 'string' || !id || this.hasHeardBulletin(id)) return false;
      campaign.update((state) => {
        state.radio.heardBulletins.push(id);
        state.radio.heardBulletins = uniqueStrings(state.radio.heardBulletins).slice(-64);
      });
      return true;
    },
  });
}

export function navigateCampaign(
  campaign,
  sceneId,
  { spawn, location = globalThis.location } = {},
) {
  const scene = SCENES[sceneId];
  if (!scene) throw new Error(`Unknown scene "${sceneId}"`);
  if (!location || typeof location.assign !== 'function') {
    throw new TypeError('Campaign navigation requires a location with assign()');
  }

  const before = campaign.state;
  const state = campaign.transition(sceneId, { spawn });
  try {
    location.assign(previewNavigationHref(scene.href));
    return state;
  } catch (error) {
    // location.assign() can be rejected by sandboxed/embedded browsers. Do
    // not strand the save at a page the browser never reached.
    try {
      campaign.restore(before);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Navigation failed and campaign rollback could not be saved',
      );
    }
    throw error;
  }
}
