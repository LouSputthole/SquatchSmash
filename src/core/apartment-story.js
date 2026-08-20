import {
  CHARACTER_IDS,
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';
import { getCharacter, voiceProfileFor } from './characters.js';
import { RING_SECONDS } from './phone.js';

const FIRST_RING_DELAY = 6;
/**
 * How long after a caller gives up before they try again.
 *
 * Every call in this file is load-bearing -- each one is the only thing that
 * unlocks the next place he is allowed to go -- so missing one cannot be a way
 * to get stuck, and it used to be sixteen seconds of nothing while you
 * wondered whether you had broken it. Ten seconds, from the moment they hang
 * up, forever, until he picks it up. Measured off RING_SECONDS rather than
 * written as one number, so lengthening the ring cannot silently shorten the
 * gap into a caller who rings back before he has stopped ringing.
 */
const RETRY_GAP = 10;

/**
 * Everything Tony says at the front door when he is not going anywhere.
 *
 * These used to be seventeen string literals scattered through the branches
 * of `tryLeave()`, which made them unreachable to anything except the branch
 * that returned them. That mattered more than it looks: `main.js` puts the
 * line on screen with `hud.say()` and then plays `vo.door.wait.*` underneath
 * it -- a bank of three GENERIC lines -- so the player read "Booskibro said
 * he would call about tonight. I am not turning up unasked." and heard "I am
 * not guessing. I have never once guessed right." Seventeen specific,
 * chapter-aware refusals were on screen and none of them had ever been
 * offered for recording, because no tool could enumerate them.
 *
 * As a table they are data: `tools/apartment-vo.mjs` walks it, so every line
 * here reaches VOICE-LINES-TODO.md, and the runtime plays the real line the
 * moment a take for it lands (see `refusal()` below and `tryLeave` in
 * src/main.js -- it falls back to the generic bank until then, so nothing
 * goes quiet in the meantime).
 *
 * KEYS ARE CUE NAMES. Renaming one renames a recording; adding one adds a
 * line to the sheet. Keep them stable.
 */
export const DEPARTURE_REFUSALS = Object.freeze({
  heist_cleanup: 'Not walking into the Bing wearing the bank. Clean up first.',
  final_arc_locked: 'Bank’s done. Nobody’s called. And when nobody calls, you sit down.',
  initiation_locked: 'Lou said seven. The invitation still has to land.',
  golf_call: 'Lou said he would call about this morning. I am not guessing where.',
  golf_return: 'Three holes done. Whatever comes next, Lou will call for it.',
  heist_call: 'Lou said he would call. Today is not a day to guess.',
  heist_kit: 'Everything Lou named goes with me. Nothing else does.',
  big_night_call: 'Booskibro said he would call about tonight. I am not turning up unasked.',
  no_wake_call: 'Lou said he would call when he knew. I am not chasing him today.',
  date_call: 'She said she would ring about tonight. I am not turning up at nine on a guess.',
  sleep_after_date: 'That was a good night. Tomorrow is the other kind. <em>Bed.</em>',
  day_two_call: 'Booskibro said he would call with the next job.',
  second_bing_call: 'Lou said he would call when he wanted you back at the Bing.',
  sleep_after_motel: 'It is not even light out. Whatever is next can wait until I have slept.',
  first_call: 'Big Uncle Lou said he would call. I should answer before I go anywhere.',
  sleep_after_squatchfather: 'That is enough going out for one night.',
  lou_package: 'I am not going anywhere until I find Lou’s package.',
  whiskey: 'Take one pull of whiskey. You earned the nerves.',
  /* The five below are the per-chapter pastimes — see CHAPTER_PASTIMES. Each
   * one is him refusing to leave until he has had one thing that is his. */
  watch_tv: 'I put a man in the ground last night. I would like to know whether it made the news before I go anywhere.',
  counter_squatch: 'I told the boys one game. One game, and then I am out the door.',
  squatch_shoot: 'Lou is going to put a club in my hand in front of people. Something needs warming up and it is not going to be the swing.',
  squatch_smash: 'Whatever tonight is, it is the last night of something. I would like to wreck a campground first.',
  shrooms_before: 'They take ninety minutes. Take them now and they land about the time somebody starts making speeches.',
});

/**
 * The line and the cue group that goes with it, spread into a refusal.
 *
 * `vo` is the group name `audio.say()` takes, so the take on disk is
 * `vo.door.refusal.<key>.1.mp3` -- `say()` matches a bank by prefix, which is
 * why the cue carries a take number the way the Beef Run's do.
 */
function refusal(key) {
  return { line: DEPARTURE_REFUSALS[key], vo: `door.refusal.${key}` };
}

/** Every refusal as a recordable cue. Used by tools/apartment-vo.mjs. */
export function departureRefusalCues() {
  return Object.entries(DEPARTURE_REFUSALS).map(([key, line]) => ({
    name: `vo.door.refusal.${key}.1`,
    voice: 'player',
    /* The subtitle carries markup for emphasis; a voice actor should be
     * reading words, not tags. */
    say: line.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  }));
}

const DEPARTURE_REQUIREMENTS = Object.freeze([
  {
    id: 'eaten',
    line: 'I have not eaten. Lou can hear that over the phone somehow.',
    hint: 'There are eggs in the fridge and a pan on the hob.',
  },
  {
    id: 'showered',
    line: 'Not like this. Shower first.',
    hint: 'The bathroom is through the north door.',
  },
  /* Two errands, not one. These used to be a single `pooped` chore, so a man
   * who had emptied one tank was told he had used the bathroom and the door
   * let him leave with the other one full. They have always been two
   * interactions in the flat -- stand over it with [F], or sit down on it --
   * so they are two lines on the list and two excuses at the door.
   *
   * In this order because it is the order they occur to him: the quick one
   * first, the one he has been putting off second. */
  {
    id: 'peed',
    line: 'Not making that journey like this. Bathroom first.',
    hint: 'Stand over the toilet and hold [F].',
  },
  {
    id: 'pooped',
    line: 'Absolutely not. Not until that is dealt with.',
    /* The one hint in this list that is about how to CAUSE the thing rather
     * than where to do it. Nothing gets you onto that toilet until your body
     * asks, and a player who has eaten nothing and smoked nothing can stand in
     * that bathroom all morning wondering what the game wants. */
    hint: 'Nothing is moving yet. A dart or a zyn would get things started — '
      + 'so would the raw milk in the fridge.',
  },
  {
    id: 'changedClothes',
    line: 'I am still wearing what I slept in.',
    hint: 'There is a drawer in the nightstand.',
  },
]);

/**
 * Both halves of every call in this file.
 *
 * `lines` is the caller. `replies[i]` is what Tony says back to `lines[i]`, in
 * his own voice, out loud -- his side of a phone call used to happen in the
 * gap between the other man's sentences, unwritten and unvoiced, which is a
 * strange way to write a phone call and a stranger way to play one. The reply
 * takes its cue from the caller's own bank as `vo.<bank>.tony.<i+1>`, so the
 * index says which line he is answering, and a hole in `replies` is a line he
 * lets go past him. Nothing here needs a recording to work: an uncued reply
 * shows on the screen and holds for a reading beat, exactly like an uncued
 * caller line always has.
 *
 * He does not argue with any of them. He confirms, he asks the one question
 * anybody would ask, and he does not get an answer to it.
 */
/** What the four chores are called when they are a list rather than a refusal. */
const ROUTINE_LABELS = Object.freeze({
  eaten: 'Eat something',
  showered: 'Have a shower',
  peed: 'Have a piss',
  pooped: 'Take a dump',
  changedClothes: 'Put on a clean shirt',
});

/**
 * The rest of the first morning, none of which the door checks.
 *
 * Day One is the tutorial and it is deliberately NOT a rush: he is up at four
 * minutes past six and Lou's table is not until a quarter to midnight, so
 * everything here is a thing to do with a day, not a thing standing between
 * him and the door. They were missing from the panel entirely -- the four
 * chores and the call were the whole list -- so a player with seventeen hours
 * to fill was given nothing to fill them with and no hint that filling them
 * was optional.
 *
 * Marked `required: false`, which the panel draws differently on purpose.
 */
const DAY_ONE_OPTIONAL = Object.freeze([
  { id: 'emailChecked', label: 'Check your email' },
  { id: 'pcUsed', label: 'Have a look at the computer' },
  { id: 'playedGame', label: 'Get a game of Squatch Smash in' },
]);

/**
 * And the way out of the waiting, said plainly.
 *
 * Not an objective -- there is nothing to tick -- but it belongs on the list
 * because the list is the only place the game ever tells you what a day is
 * for. Napping and drinking both move the clock; nothing else in the flat
 * does.
 */
const DAY_ONE_KILL_TIME = Object.freeze({
  id: 'killtime',
  label: 'Nothing until tonight — sleep it off, or have a drink and let it take you',
  done: false,
  required: false,
});

/* ------------------------------------------------------------------ */
/* What a return to the flat is FOR                                    */
/* ------------------------------------------------------------------ */

/** How long he has to sit there before it counts as having watched anything. */
export const TV_WATCH_SECONDS = 30;
/** Squatch Shoot: the score that means a game was actually played. */
export const SHOOT_TARGET_SCORE = 2000;
/** Squatch Smash: seconds of the campground actually up on the monitor. */
export const SMASH_PLAY_SECONDS = 45;

/**
 * One thing of his own, in every chapter that sends him home.
 *
 * Owner note, 2026-08-20: *"for the different times we return to the apartment
 * through the campaign. I want different objectives to justify each return.
 * Maybe one is watch TV (completes after 30 seconds of watching TV) one is
 * play Counter strike in computer another is play squatch smash and take the
 * mushrooms, etc"*
 *
 * The flat had a shape on Day One — five chores, a call, and seventeen hours
 * to fill — and no shape at all on any morning after it. Every later return
 * was the same room with the same short list: answer the phone, walk to the
 * door. Which is how a place somebody lives turns into a corridor between
 * missions that happens to have a bed in it.
 *
 * So each chapter that sends him home asks for one thing, and it is never a
 * chore and never anybody else's errand. Two rules built the whole table:
 *
 *   IT IS ALREADY IN THE FLAT. Not one of these is a new toy. The couch has
 *     been there since the first build under a comment reading "nothing
 *     happens while you are there"; Counter-Squatch, Squatch Shoot and Squatch
 *     Smash have been on that desk PC the entire time; the caps have been in
 *     the drawer. All of it was optional, and optional in a first-person flat
 *     means invisible. This is the game pointing at each of them once.
 *
 *   IT SAYS SOMETHING ABOUT THE NIGHT BEFORE. He puts the news on the morning
 *     after the Squatchfather because he wants to know whether it made the
 *     news. He eats the caps before the Initiation because he has worked out
 *     what the Initiation is going to be. The objective is a line of
 *     characterisation that happens to be tickable.
 *
 * `id` is an activity flag, read out of `activityContext()` in src/main.js the
 * same way `pcUsed` and `playedGame` already are — derived from live apartment
 * state rather than latched, because the flat is rebuilt on every arrival, so
 * "this visit" is what the derivation naturally means.
 *
 * `refusal` is a key in DEPARTURE_REFUSALS above. That means a cue name, which
 * means a recording: see `departureRefusalCues()`.
 *
 * The value is always an ARRAY, because the big night wants two things and a
 * table that has to be reshaped the first time a chapter wants two is a table
 * that will be reshaped wrong.
 */
const CHAPTER_PASTIMES = Object.freeze({
  /* Home from the Squatchfather. He put a man in the ground somewhere out
   * past the county line about six hours ago and the local news does a
   * bulletin at the top of every hour. */
  day_two: Object.freeze([
    Object.freeze({
      id: 'watchedTv',
      event: TIME_EVENT_IDS.WATCH_TV,
      label: (a) => (a.tvSeconds > 0 && a.tvSeconds < TV_WATCH_SECONDS
        ? `Put the news on — ${Math.ceil(TV_WATCH_SECONDS - a.tvSeconds)}s`
        : 'Put the news on for half a minute'),
      refusal: 'watch_tv',
      hint: 'Sit down on the couch with the telly on. Half a minute of it.',
    }),
  ]),
  /* The harbour job. Booskibro's boys are on the server and he said he would
   * get one in, which in Counter-Squatch means getting shot through a wall
   * five times by somebody who is very obviously cheating. */
  no_wake: Object.freeze([
    Object.freeze({
      id: 'playedCounterSquatch',
      event: TIME_EVENT_IDS.PLAY_COUNTER_SQUATCH,
      label: 'Get a game of Counter-Squatch in',
      refusal: 'counter_squatch',
      hint: 'Sit at the computer and open Counter-Squatch. You will lose. That is the game.',
    }),
  ]),
  /* Golf with Lou, in front of people. */
  golf_morning: Object.freeze([
    Object.freeze({
      id: 'playedSquatchShoot',
      event: TIME_EVENT_IDS.PLAY_SQUATCH_SHOOT,
      label: 'Warm the eye up on Squatch Shoot',
      refusal: 'squatch_shoot',
      hint: `Squatch Shoot on the desk PC. ${SHOOT_TARGET_SCORE} points and the eye is in.`,
    }),
  ]),
  /* And the night it all goes wrong, which he has half worked out. */
  big_night: Object.freeze([
    Object.freeze({
      id: 'playedSquatchSmash',
      event: TIME_EVENT_IDS.PLAY_SQUATCH_SMASH,
      label: 'Get a run of Squatch Smash in',
      refusal: 'squatch_smash',
      hint: 'SQUATCH SMASH.exe on the desk PC. Ninety seconds and a campground.',
    }),
    Object.freeze({
      id: 'tookShrooms',
      event: TIME_EVENT_IDS.EAT_SHROOMS,
      label: 'Eat the mushrooms',
      refusal: 'shrooms_before',
      hint: 'The caps are in the nightstand drawer.',
    }),
  ]),
});

/** The chapter's list, or an empty one. Never null, so callers can just map. */
function pastimesFor(chapter) {
  return CHAPTER_PASTIMES[chapter] ?? [];
}

/**
 * Every pastime's flag and the clock cost of doing it, as one flat map.
 *
 * Two callers need this and neither of them should be keeping its own copy.
 * `src/main.js` reads it to tick a pastime off when the room sees it happen,
 * and the recovery skip in `apartment-recovery.js` reads it to tick one off
 * for a player who is stuck -- that second one is not optional. The skip walks
 * `tryLeave` in a loop resolving whatever it refuses with, and an activity it
 * has no way to complete makes it give up and report
 * `apartment_recovery_blocked`, which is a player who asked the game to get
 * him out of his own living room and was told no.
 */
export function pastimeActivityEvents() {
  const out = {};
  for (const list of Object.values(CHAPTER_PASTIMES)) {
    for (const item of list) out[item.id] = item.event;
  }
  return out;
}

/**
 * The whole table, for the guard in tests/apartment-pastimes.test.mjs.
 *
 * Exported rather than reached into, so the test asserts the same object the
 * door reads and cannot drift from it: every id has to be a real activity flag
 * on the campaign state, every `refusal` a real key in DEPARTURE_REFUSALS, and
 * every one of them a time event -- three ledgers this table has to agree with
 * and none of which it can check for itself.
 */
export function chapterPastimes() {
  return CHAPTER_PASTIMES;
}

/** A pastime's list line, which may want to count down. */
function pastimeLabel(item, activities) {
  return typeof item.label === 'function' ? item.label(activities) : item.label;
}

/** Somewhere to go, in words a person would use for it. */
const SCENE_LABELS = Object.freeze({
  [SCENE_IDS.BADA_BING_ONE]: 'the Bada Bing',
  [SCENE_IDS.SQUATCHFATHER]: 'the Squatchfather',
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: 'the airstrip',
  [SCENE_IDS.BADA_BING_TWO]: 'the Bada Bing',
  [SCENE_IDS.SQUATCH_GRAVEYARD]: 'the Squatch graveyard',
  [SCENE_IDS.JERKY_MOTEL]: 'the Jerky Motel',
  [SCENE_IDS.NO_WAKE]: 'South Harbor',
  [SCENE_IDS.SILVER_ROOM]: 'the Silver Room',
  [SCENE_IDS.SILVER_PINES]: 'Silver Pines',
  [SCENE_IDS.BANK_HEIST]: 'THE TAKE',
  [SCENE_IDS.SILVER_CASE]: 'the Silver Case pickup',
  [SCENE_IDS.INITIATION]: 'the Initiation',
});

/**
 * The shape of each chapter's morning.
 *
 * `routineRequired` is the one real difference between them: on Day One the
 * door counts the four chores and refuses without them, and on every morning
 * after that they are things he does because he is a person, not because
 * anybody is checking. The panel says so rather than pretending otherwise --
 * a checklist that lies about what is mandatory is worse than no checklist.
 */
const CHAPTER_PLAN = Object.freeze({
  day_one: Object.freeze({
    event: EVENT_IDS.LOU_FIRST_CALL,
    caller: 'Big Uncle Lou',
    routineRequired: true,
  }),
  day_two: Object.freeze({
    event: EVENT_IDS.BOOSKI_DAY_TWO_CALL,
    caller: 'Booskibro',
    routineRequired: false,
  }),
  no_wake: Object.freeze({
    event: EVENT_IDS.LOU_NO_WAKE_CALL,
    caller: 'Big Uncle Lou',
    routineRequired: false,
  }),
  date: Object.freeze({
    event: EVENT_IDS.MARGO_DATE_CALL,
    caller: 'Margo',
    routineRequired: false,
  }),
  golf_morning: Object.freeze({
    event: EVENT_IDS.LOU_GOLF_CALL,
    caller: 'Big Uncle Lou',
    routineRequired: false,
  }),
  heist_day: Object.freeze({
    event: EVENT_IDS.LOU_HEIST_CALL,
    caller: 'Big Uncle Lou',
    routineRequired: false,
  }),
  /* Grandfathered saves that already exposed Initiation retain this route. */
  big_night: Object.freeze({
    event: EVENT_IDS.BOOSKI_BIG_NIGHT_CALL,
    caller: 'Booskibro',
    routineRequired: false,
  }),
  post_heist: Object.freeze({
    event: null,
    caller: null,
    routineRequired: false,
  }),
});

export const HEIST_PREPARATION_ITEMS = Object.freeze([
  Object.freeze({ id: 'armor', label: 'Put on concealable armor' }),
  Object.freeze({ id: 'gloves', label: 'Take black gloves' }),
  Object.freeze({ id: 'mask', label: 'Pack the dark mask' }),
  Object.freeze({ id: 'carbine', label: 'Take the carbine' }),
  Object.freeze({ id: 'sidearm', label: 'Take the sidearm' }),
  Object.freeze({ id: 'magazines', label: 'Load the magazines' }),
  Object.freeze({ id: 'duffel', label: 'Take the cash duffel' }),
]);

export const HEIST_CLEANUP_ITEMS = Object.freeze([
  Object.freeze({ id: 'washed', label: 'Wash the blood and dust off' }),
  Object.freeze({ id: 'changed', label: 'Change for the Bada Bing' }),
  Object.freeze({ id: 'gearSecured', label: 'Hide the heist gear' }),
]);

export const DAY_ONE_LOU_CALL = Object.freeze({
  eventId: EVENT_IDS.LOU_FIRST_CALL,
  characterId: CHARACTER_IDS.LOU,
  from: getCharacter(CHARACTER_IDS.LOU).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.LOU),
  vo: 'call.lou.bada_bing',
  lines: Object.freeze([
    'Kid. You awake?',
    'Meet me at the Bada Bing. Back office.',
    'I’ve a thing here for you and it needs doin’ tonight. Not tomorrow. Tonight, before it turns into somethin’ worse.',
    'Eat, shower, and put on something clean before you come down. I am serious.',
  ]),
  replies: Object.freeze([
    'I am now.',
    'The back office. Right.',
    'Handled how?',
    'Eat, shower, clean shirt. I can do that.',
  ]),
});

/**
 * The only call in the campaign that is not an instruction.
 *
 * Lou rings the night the Squatchfather business is settled, once, after Tony
 * has let himself back into his own flat. He does not name the job, he does
 * not ask for anything, and he does not stay on the line: he says well done in
 * the only register this family has for it, which is a compliment with a
 * future attached to it and no way to decline either.
 *
 * It gates nothing on purpose. The door does not wait for it, sleeping does
 * not wait for it, and a man who is in the shower when it comes has lost the
 * only kind words anybody says to him out loud. That is the point of it -- a
 * campaign where every ring is a key is a campaign where the phone is a lock.
 */
export const DAY_ONE_LOU_ATTABOY_CALL = Object.freeze({
  eventId: EVENT_IDS.LOU_ATTABOY_CALL,
  characterId: CHARACTER_IDS.LOU,
  from: getCharacter(CHARACTER_IDS.LOU).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.LOU),
  vo: 'call.lou.attaboy',
  lines: Object.freeze([
    'Kid. That thing I asked you to take care of.',
    'Nice work. That is all I am going to say about it, and it is all you are going to say about it.',
    'Keep doing work like that and you’ll be somebody in this family. Keep doing it too well and you’ll be somebody they talk about.',
    'Get some sleep. Tomorrow is a different day and it has its own thing in it.',
  ]),
  replies: Object.freeze([
    'It is taken care of.',
    'Then neither of us says it.',
    'A bright future. Here.',
    'I will sleep.',
  ]),
});

export const DAY_TWO_BOOSKI_CALL = Object.freeze({
  eventId: EVENT_IDS.BOOSKI_DAY_TWO_CALL,
  characterId: CHARACTER_IDS.BOOSKI,
  targetCharacterId: CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
  from: getCharacter(CHARACTER_IDS.BOOSKI).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.BOOSKI),
  vo: 'call.booski.airstrip',
  lines: Object.freeze([
    'You awake? Good.',
    'Meet the Captain at the airstrip. Captain Lou Sasole. Not Lou from the Bing.',
    'He has a beef jerky run and needs another set of hands.',
    'Get moving. He hates waiting more than the other Lou does.',
  ]),
  replies: Object.freeze([
    'Everybody keeps asking me that.',
    'Two Lous. Of course there are two Lous.',
    'A beef jerky run.',
    'Airstrip. Going.',
  ]),
});

export const DAY_TWO_LOU_SECOND_CALL = Object.freeze({
  eventId: EVENT_IDS.LOU_SECOND_CALL,
  characterId: CHARACTER_IDS.LOU,
  targetSceneId: SCENE_IDS.BADA_BING_TWO,
  from: getCharacter(CHARACTER_IDS.LOU).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.LOU),
  vo: 'call.lou.bing_second',
  lines: Object.freeze([
    'Kid. Back to the Bing.',
    'Billy HotDog is home. Closed party. Family only.',
    'Bring nothing. Come through the front and keep your phone in your pocket.',
    'You will leave from here. You are not going home first.',
  ]),
  replies: Object.freeze([
    'I was just there.',
    'Closed party. Understood.',
    'Nothing. Got it.',
    'Then I will not pack.',
  ]),
});

/** The call that never says why four men need a boat on a grey afternoon. */
export const NO_WAKE_LOU_CALL = Object.freeze({
  eventId: EVENT_IDS.LOU_NO_WAKE_CALL,
  characterId: CHARACTER_IDS.LOU,
  targetCharacterId: CHARACTER_IDS.WILLY,
  targetSceneId: SCENE_IDS.NO_WAKE,
  from: getCharacter(CHARACTER_IDS.LOU).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.LOU),
  vo: 'call.lou.no_wake',
  lines: Object.freeze([
    'Kid. South Harbor. Gate C. Quarter to one.',
    'Plain clothes. Leave the phone in the glovebox when you get there.',
    'Booski and Willy are already on their way. We are taking a ride.',
    'Do not be late, and do not ring me back.',
  ]),
  replies: Object.freeze([
    'Gate C. Quarter to one.',
    'No phone. Understood.',
    'All four of us?',
    'I will be there.',
  ]),
});

/**
 * The one call in the campaign that is not work.
 *
 * Margo Salas runs the kitchen at the Blue Hour on Ashland. She is a civilian:
 * no stake in Lou, the Bing, or anybody who will be in the room on the big
 * night, which is the entire reason her good opinion is worth anything. She
 * rings on the afternoon of Day 3, once, off the back of the number he gave
 * her at the club — and she is the reason Day 3 is a chapter of its own
 * instead of a gap between the Motel and the verdict.
 */
export const DATE_MARGO_CALL = Object.freeze({
  eventId: EVENT_IDS.MARGO_DATE_CALL,
  characterId: CHARACTER_IDS.MARGO,
  targetSceneId: SCENE_IDS.SILVER_ROOM,
  from: getCharacter(CHARACTER_IDS.MARGO).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.MARGO),
  vo: 'call.margo.date',
  lines: Object.freeze([
    'You gave me this number and told me to use it. So.',
    'The Silver Room. Nine o’clock. It is my one night off in six, so do not waste it.',
    'I drink rye. One ice cube. One. Write it on your hand if you have to.',
    'And iron something. I have seen what you wear at four in the morning.',
  ]),
  replies: Object.freeze([
    'I did. I meant it.',
    'Nine. The Silver Room.',
    'Rye. One cube. I will remember.',
    'That was a work night.',
  ]),
});

/** Lou's invitation to a quiet three-hole conversation before THE TAKE. */
export const DAY_FOUR_LOU_GOLF_CALL = Object.freeze({
  eventId: EVENT_IDS.LOU_GOLF_CALL,
  characterId: CHARACTER_IDS.LOU,
  targetSceneId: SCENE_IDS.SILVER_PINES,
  from: getCharacter(CHARACTER_IDS.LOU).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.LOU),
  vo: 'call.lou.golf',
  lines: Object.freeze([
    'Silver Pines. Off Route Twenty-Three, past the quarry, second gate.',
    'Eight o\'clock. Rippinflow and Eric are already complaining about the hour.',
    'Bring nothing. Wear something you can walk in.',
    'Three holes. Home by half ten. After that, your day starts.',
  ]),
  replies: Object.freeze([
    'Silver Pines. Second gate.',
    'Eight o\'clock.',
    'Nothing but walking shoes.',
    'Home by half ten. Understood.',
  ]),
});

/** Lou's last job before Tony is invited into the room as family. */
export const DAY_FOUR_LOU_HEIST_CALL = Object.freeze({
  eventId: EVENT_IDS.LOU_HEIST_CALL,
  characterId: CHARACTER_IDS.LOU,
  targetSceneId: SCENE_IDS.BANK_HEIST,
  from: getCharacter(CHARACTER_IDS.LOU).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.LOU),
  vo: 'call.lou.heist',
  lines: Object.freeze([
    'Kid. Listen once. There is a car coming for you.',
    'Gray suit. Armor underneath. Gloves, mask, both guns, every magazine on the table.',
    'You are meeting Snow at a closed laundry. Once he starts talking, he is in charge.',
    'Bring your nerve and leave your name at home.',
  ]),
  replies: Object.freeze([
    'I am listening.',
    'Suit, armor, gloves, mask, guns, magazines.',
    'Snow is in charge.',
    'When does the car arrive?',
  ]),
});

/**
 * What sleeping in his own bed does, chapter by chapter.
 *
 * Story chapter and calendar day are deliberately separate. Tony gets home
 * from the Jerky Motel at half four in the morning of Day 3, so sleep opens
 * the `no_wake` chapter at noon on that same Day 3. Completing NO WAKE advances
 * directly into `date`; it does not consume another night before Margo calls.
 *
 * Sleeping off the date moves the calendar. Day 4 opens at seven with Margo,
 * then Lou's Golf call and round hand control to heist_day before the evening
 * ceremony.
 */
const SLEEP_CHAPTERS = Object.freeze([
  Object.freeze({
    from: 'day_one',
    to: 'day_two',
    requires: MISSION_IDS.SQUATCHFATHER,
    incomplete: 'day_one_incomplete',
    day: 2,
    timeMinutes: 7 * 60,
  }),
  Object.freeze({
    from: 'day_two',
    to: 'no_wake',
    requires: MISSION_IDS.JERKY_MOTEL,
    incomplete: 'day_two_incomplete',
    day: 3,
    timeMinutes: 12 * 60,
  }),
  Object.freeze({
    from: 'date',
    to: 'golf_morning',
    requires: MISSION_IDS.SILVER_ROOM,
    incomplete: 'date_incomplete',
    day: 4,
    timeMinutes: 7 * 60,
  }),
]);
/* Golf returns into heist_day without another sleep; it remains the terminal
 * sleep chapter even though it is no longer the final SLEEP_CHAPTERS target. */
const LAST_CHAPTER = 'heist_day';

const APARTMENT_RETURN_PRIORITY = Object.freeze([
  SCENE_IDS.BANK_HEIST,
  SCENE_IDS.SILVER_PINES,
  SCENE_IDS.SILVER_ROOM,
  SCENE_IDS.NO_WAKE,
  SCENE_IDS.JERKY_MOTEL,
  SCENE_IDS.AIRSTRIP_SMUGGLING,
  SCENE_IDS.SQUATCHFATHER,
]);

/**
 * Name the story beat that brought the player through the apartment's front
 * door. Mission completion accumulates, so this must prefer the newest beat;
 * otherwise a Beef Run return looks like the older restaurant return simply
 * because Squatchfather is also complete.
 */
export function apartmentReturnSource(state) {
  if (state?.scene?.id !== SCENE_IDS.APARTMENT
    || state.scene.spawn !== 'front_door') return null;

  const inventory = [
    ...(Array.isArray(state.inventory?.carried) ? state.inventory.carried : []),
    ...(Array.isArray(state.inventory?.concealed) ? state.inventory.concealed : []),
  ];
  if (inventory.includes(ITEM_IDS.LOU_PACKAGE)) return SCENE_IDS.BADA_BING_ONE;

  return APARTMENT_RETURN_PRIORITY.find((sceneId) => (
    state.missions?.[sceneId]?.status === 'complete'
  )) ?? null;
}

/**
 * The last call Tony gets as a prospect.
 *
 * It rings once, after he has slept off the Motel, and it is the only reason
 * the apartment door will open on the Initiation. Booskibro is the patriarch
 * and the ceremony leader, so he is the one who tells Tony the night is his.
 */
export const BIG_NIGHT_BOOSKI_CALL = Object.freeze({
  eventId: EVENT_IDS.BOOSKI_BIG_NIGHT_CALL,
  characterId: CHARACTER_IDS.BOOSKI,
  targetSceneId: SCENE_IDS.INITIATION,
  from: getCharacter(CHARACTER_IDS.BOOSKI).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.BOOSKI),
  vo: 'call.booski.bignight',
  lines: Object.freeze([
    'Tonight is the night. Do not make other plans.',
    'Everyone is coming. All five founders, the whole Circle, in one room.',
    'Shower, shave, wear something clean. This one is about you, Tony.',
    'Seven sharp. Do not be early and do not be late.',
  ]),
  replies: Object.freeze([
    'I have no other plans. I have never had other plans.',
    'All five of them. In one room.',
    'It does not feel like it is about me.',
    'Seven. Not early, not late.',
  ]),
});

/**
 * What is waiting on the answering machine, morning by morning.
 *
 * Not calls: calls ring, ask something and unlock a place to go. These are the
 * opposite -- they landed while he was out, nothing waits on them, and playing
 * them is entirely optional. They are how the flat tells you what happened
 * last night, in somebody else's voice, in a room he is standing in alone.
 *
 * Cue names follow the same rule as everything else spoken in this campaign:
 * `vo.<vo>.<n>` for the caller. A message with no recording still plays, on
 * screen, held for a reading beat -- see main.js's playMessages.
 */
/** Which one-shot time event records that a chapter's messages were played. */
const MESSAGE_EVENTS = Object.freeze({
  day_two: TIME_EVENT_IDS.HEAR_MESSAGES_DAY_TWO,
  no_wake: TIME_EVENT_IDS.HEAR_MESSAGES_DATE,
  date: TIME_EVENT_IDS.HEAR_MESSAGES_DATE,
  golf_morning: TIME_EVENT_IDS.HEAR_MESSAGES_BIG_NIGHT,
  heist_day: TIME_EVENT_IDS.HEAR_MESSAGES_BIG_NIGHT,
  big_night: TIME_EVENT_IDS.HEAR_MESSAGES_BIG_NIGHT,
});

export const CHAPTER_MESSAGES = Object.freeze({
  day_two: Object.freeze([
    Object.freeze({
      from: 'Big Uncle Lou',
      characterId: CHARACTER_IDS.LOU,
      vo: 'machine.lou.day_two',
      at: 'Yesterday, 11:52 PM',
      lines: Object.freeze([
        'Kid, it is me. You are out, which is the correct answer.',
        'I heard about the restaurant. I did not hear it from you and that is how I want it to stay.',
        'You did what was asked and you did not stand about afterwards. People noticed the second part.',
        'Sleep. Somebody will ring you in the morning, and it will not be me.',
      ]),
    }),
  ]),
  no_wake: Object.freeze([
    Object.freeze({
      from: 'Big Uncle Lou',
      characterId: CHARACTER_IDS.LOU,
      vo: 'machine.lou.date',
      at: 'Today, 5:14 AM',
      lines: Object.freeze([
        'It is me. Do not ring back, I am not near this phone.',
        'Wear something plain today. Nothing anybody would describe.',
        'There is a thing that may need doing and it may not. I will know later.',
        'And if Willy calls you, you have not spoken to me. Say it back to yourself until it is true.',
      ]),
    }),
  ]),
  /* Day 3. He is being told something and not being told anything, which is
   * the whole of it. Nothing here names a place, a job or a person, because
   * Lou has stopped naming things. */
  date: Object.freeze([
    Object.freeze({
      from: 'Big Uncle Lou',
      characterId: CHARACTER_IDS.LOU,
      vo: 'machine.lou.date',
      at: 'Today, 5:14 AM',
      lines: Object.freeze([
        'It is me. Do not ring back, I am not near this phone.',
        'Wear something plain today. Nothing anybody would describe.',
        'There is a thing that may need doing and it may not. I will know later.',
        'And if Willy calls you, you have not spoken to me. Say it back to yourself until it is true.',
      ]),
    }),
  ]),
  golf_morning: Object.freeze([
    Object.freeze({
      from: 'Big Uncle Lou',
      characterId: CHARACTER_IDS.LOU,
      vo: 'machine.lou.golf_morning',
      at: 'Today, 6:02 AM',
      lines: Object.freeze([
        'Morning, kid. Keep the line clear and do not ring back.',
        'Silver Pines has a second gate. You will hear the rest from me.',
        'Wear something you can walk in. I will call when the car is moving.',
      ]),
    }),
  ]),
  heist_day: Object.freeze([
    Object.freeze({
      from: 'Big Uncle Lou',
      characterId: CHARACTER_IDS.LOU,
      vo: 'machine.lou.heist_day',
      at: 'Today, 6:02 AM',
      lines: Object.freeze([
        'Today is the day, kid. Keep the line clear and do not ring back.',
        'Everything you have done this week was somebody asking a question. Today is the answer.',
        'Eat. Dress plain. I will call when the car is moving.',
      ]),
    }),
  ]),
  /* Day 4. Warm, on the surface, and the surface is doing a lot of work. */
  big_night: Object.freeze([
    Object.freeze({
      from: 'Big Uncle Lou',
      characterId: CHARACTER_IDS.LOU,
      vo: 'machine.lou.big_night',
      at: 'Today, 6:02 AM',
      lines: Object.freeze([
        'Today is the day, kid. You have been told that before. This time it is the one.',
        'Everything you have done this week was somebody asking you a question. You answered all of them.',
        'Eat. Dress like it matters. Booskibro will ring you with the rest.',
      ]),
    }),
  ]),
});

/**
 * What the news says about him, morning by morning.
 *
 * He is never named and the police are never quoted, because a bulletin that
 * named him would be a plot point and this is weather. `radio` is 97.8's own
 * announcer reading the community wire; `tv` is the other station doing the
 * same story worse. Both are chapter-keyed and both are optional.
 */
export const CHAPTER_NEWS = Object.freeze({
  day_two: Object.freeze({
    radio: Object.freeze({
      vo: 'news.radio.day_two',
      voice: 'announcer',
      line: 'And in the community wire — a disturbance last night at a family restaurant '
        + 'on the east side. No arrests. The owner says he did not see anything and would '
        + 'like everybody to stop asking.',
    }),
    tv: Object.freeze({
      vo: 'news.tv.day_two',
      voice: 'ksqch',
      line: '…the restaurant remains closed this morning. Staff describe a man who came in, '
        + 'did not order, and left. That is the whole description. That is what we have.',
    }),
  }),
  no_wake: Object.freeze({
    radio: Object.freeze({
      vo: 'news.radio.date',
      voice: 'announcer',
      line: 'Wet one out there today. Also on the wire — that motel out on the county road. '
        + 'Fire crews were there before dawn. Nobody is saying what for, and the county road '
        + 'is shut both ways.',
    }),
    tv: Object.freeze({
      vo: 'news.tv.date',
      voice: 'ksqch',
      line: '…the Jerky Motel. We are told there is nothing to tell. We have been told that '
        + 'four times this morning, by four different people, using the same four words.',
    }),
  }),
  date: Object.freeze({
    radio: Object.freeze({
      vo: 'news.radio.date',
      voice: 'announcer',
      line: 'Wet one out there today. Also on the wire — that motel out on the county road. '
        + 'Fire crews were there before dawn. Nobody is saying what for, and the county road '
        + 'is shut both ways.',
    }),
    tv: Object.freeze({
      vo: 'news.tv.date',
      voice: 'ksqch',
      line: '…the Jerky Motel. We are told there is nothing to tell. We have been told that '
        + 'four times this morning, by four different people, using the same four words.',
    }),
  }),
  golf_morning: Object.freeze({
    radio: Object.freeze({
      vo: 'news.radio.heist_day',
      voice: 'announcer',
      line: 'Clear over downtown this morning. Traffic crews report lane work near Mercer, '
        + 'so give yourself time and mind the diversions.',
    }),
    tv: Object.freeze({
      vo: 'news.tv.heist_day',
      voice: 'ksqch',
      line: 'A quiet opening downtown. Cumberland Fidelity begins commercial service at '
        + 'nine, and the city says the construction outside will not affect customers.',
    }),
  }),
  heist_day: Object.freeze({
    radio: Object.freeze({
      vo: 'news.radio.heist_day',
      voice: 'announcer',
      line: 'Clear over downtown this morning. Traffic crews report lane work near Mercer, '
        + 'so give yourself time and mind the diversions.',
    }),
    tv: Object.freeze({
      vo: 'news.tv.heist_day',
      voice: 'ksqch',
      line: 'A quiet opening downtown. Cumberland Fidelity begins commercial service at '
        + 'nine, and the city says the construction outside will not affect customers.',
    }),
  }),
  post_heist: Object.freeze({
    radio: Object.freeze({
      vo: 'news.radio.post_heist',
      voice: 'announcer',
      line: 'Downtown remains sealed after the robbery at Cumberland Fidelity. Police have '
        + 'not released names, faces, or a reliable count of the missing cash.',
    }),
    tv: Object.freeze({
      vo: 'news.tv.post_heist',
      voice: 'ksqch',
      line: 'Helicopter pictures show abandoned vehicles on Bank Avenue and Mercer Street. '
        + 'Investigators say the crew changed cars before leaving the industrial district.',
    }),
  }),
  big_night: Object.freeze({
    radio: Object.freeze({
      vo: 'news.radio.big_night',
      voice: 'announcer',
      line: 'Quiet week on the wire, which around here means somebody has had a word. '
        + 'Clear and warm tonight. Lovely evening for whatever you have got on.',
    }),
    tv: Object.freeze({
      vo: 'news.tv.big_night',
      voice: 'ksqch',
      line: '…and no further comment from anybody about anything. Back to the weather, '
        + 'which is the only thing left that will talk to us.',
    }),
  }),
});

/**
 * Day 4 opens with somebody else in the bed.
 *
 * Margo stayed. She is warm about it and not sentimental about it, she is
 * slightly awkward in the way people are early in the morning in somebody
 * else's flat, and she gets dressed and goes -- she has a kitchen to run. She
 * does not ask what he does, and she does tease him about how seriously he has
 * started taking himself.
 *
 * Structure matches a phone call on purpose: `lines` is her, `replies[i]` is
 * what he says back to `lines[i]`, cued off the same bank, so the same
 * play-or-read-a-beat rule covers both halves.
 */
export const BIG_NIGHT_MARGO_WAKE = Object.freeze({
  characterId: CHARACTER_IDS.MARGO,
  from: getCharacter(CHARACTER_IDS.MARGO).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.MARGO),
  vo: 'margo.wake',
  lines: Object.freeze([
    'You snore. Not badly. Like a fridge.',
    'I have a delivery at eleven and a man who cannot be trusted with a delivery, so.',
    'Big day, is it? You have got the face on. The important face.',
    'Do not do anything stupid tonight. Or do, and ring me about it after.',
  ]),
  replies: Object.freeze([
    'I do not snore.',
    'You could stay for ten minutes.',
    'I do not have a face on.',
    'I will ring you.',
  ]),
});

/**
 * The night the Silver Room ends with both of them coming back here.
 *
 * `SilverStory.complete` folds the mission's own verdict -- `cameHome`,
 * `['perfect', 'strong'].includes(outcome)` -- down into the campaign, so
 * this only ever plays for the two best outcomes. Short on purpose: this is
 * the walk from the front door to the bed, not the whole evening, which the
 * Silver Room mission has already had. Same shape as `BIG_NIGHT_MARGO_WAKE`
 * for the same reason -- `lines` is her, `replies[i]` answers `lines[i]`.
 */
export const SILVER_ROOM_COME_HOME = Object.freeze({
  characterId: CHARACTER_IDS.MARGO,
  from: getCharacter(CHARACTER_IDS.MARGO).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.MARGO),
  vo: 'margo.comehome',
  lines: Object.freeze([
    'Well. You clean up all right, for a man who eats standing over the sink.',
    'I am not staying because of the tie. I want that on the record.',
  ]),
  replies: Object.freeze([
    'I own exactly one.',
    'Noted.',
  ]),
});

/**
 * The ask itself, the night she comes home: the dress has a fastening she
 * cannot reach and he is the only other pair of hands in the flat. Spoken by
 * her rather than narrated — the beat used to be a stage direction on the
 * subtitle bar, and a woman issuing a playful order is a better scene than a
 * caption describing one. One line, no reply: what he says back is the help.
 *
 * Cued under `margo.comehome.` on purpose, so the come-home night's own
 * preload and end-of-night eviction (`closedNightCuePrefixes`) cover it with
 * no further bookkeeping.
 */
export const SILVER_ROOM_DRESS_ASK = Object.freeze({
  characterId: CHARACTER_IDS.MARGO,
  from: getCharacter(CHARACTER_IDS.MARGO).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.MARGO),
  vo: 'margo.comehome.dress',
  lines: Object.freeze([
    'The zip. Come here. That’s not a request, and don’t take all night about it, I’ve been thinking about this since the second course.',
  ]),
  replies: Object.freeze([]),
});

class ApartmentStory {
  constructor({ campaign, ring }) {
    this.campaign = campaign;
    this.ring = ring;
    this.started = false;
    this.elapsed = 0;
    this.nextRingAt = FIRST_RING_DELAY;
  }

  beginMorning({ delay = FIRST_RING_DELAY, reset = false } = {}) {
    // Day Two starts its timer at the radio bulletin, before Tony reaches the
    // edge of the bed. Do not let the ordinary get-up callback reset that
    // deliberate lead-in back to the generic six seconds.
    if (this.started && !reset) return;
    this.started = true;
    this.elapsed = 0;
    this.nextRingAt = Math.max(0, delay);
  }

  update(dt) {
    const pendingCall = this.#pendingCall();
    if (!this.started || !pendingCall) return;
    this.elapsed += Math.max(0, dt);
    if (this.elapsed < this.nextRingAt) return;
    const rang = this.ring?.(pendingCall) === true;
    /* A successful ring books the next attempt for a full ring plus the gap;
     * a refused one (there is already a call up) just tries again next second.
     */
    this.nextRingAt = this.elapsed + (rang ? RING_SECONDS + RETRY_GAP : 1);
  }

  callAnswered(definition) {
    if (definition?.eventId === EVENT_IDS.LOU_FIRST_CALL && !this.#callAnswered()) {
      this.campaign.advanceTime(TIME_EVENT_IDS.LOU_FIRST_CALL, (state) => {
        state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
        state.missions[MISSION_IDS.BADA_BING_ONE].status = 'available';
      });
      return true;
    }
    /* No mission moves. Two minutes on the clock and a note in the save that
     * he heard it, which is the whole of what answering this one does. */
    if (definition?.eventId === EVENT_IDS.LOU_ATTABOY_CALL
      && !this.#eventAnswered(EVENT_IDS.LOU_ATTABOY_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.LOU_ATTABOY_CALL, (state) => {
        state.events[EVENT_IDS.LOU_ATTABOY_CALL].status = 'answered';
      });
      return true;
    }
    if (definition?.eventId === EVENT_IDS.BOOSKI_DAY_TWO_CALL
      && !this.#eventAnswered(EVENT_IDS.BOOSKI_DAY_TWO_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.BOOSKI_DAY_TWO_CALL, (state) => {
        state.events[EVENT_IDS.BOOSKI_DAY_TWO_CALL].status = 'answered';
        state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'available';
      });
      return true;
    }
    if (definition?.eventId === EVENT_IDS.LOU_SECOND_CALL
      && !this.#eventAnswered(EVENT_IDS.LOU_SECOND_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.LOU_SECOND_CALL, (state) => {
        state.events[EVENT_IDS.LOU_SECOND_CALL].status = 'answered';
        state.missions[MISSION_IDS.BADA_BING_TWO].status = 'available';
      });
      return true;
    }
    if (definition?.eventId === EVENT_IDS.LOU_NO_WAKE_CALL
      && !this.#eventAnswered(EVENT_IDS.LOU_NO_WAKE_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.LOU_NO_WAKE_CALL, (state) => {
        state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status = 'answered';
        state.missions[MISSION_IDS.NO_WAKE].status = 'available';
      });
      return true;
    }
    if (definition?.eventId === EVENT_IDS.MARGO_DATE_CALL
      && !this.#eventAnswered(EVENT_IDS.MARGO_DATE_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.MARGO_DATE_CALL, (state) => {
        state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
        state.missions[MISSION_IDS.SILVER_ROOM].status = 'available';
      });
      return true;
    }
    if (definition?.eventId === EVENT_IDS.LOU_GOLF_CALL
      && !this.#eventAnswered(EVENT_IDS.LOU_GOLF_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.LOU_GOLF_CALL, (state) => {
        state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
        state.missions[MISSION_IDS.SILVER_PINES].status = 'available';
      });
      return true;
    }
    if (definition?.eventId === EVENT_IDS.LOU_HEIST_CALL
      && !this.#eventAnswered(EVENT_IDS.LOU_HEIST_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.LOU_HEIST_CALL, (state) => {
        state.events[EVENT_IDS.LOU_HEIST_CALL].status = 'answered';
        state.missions[MISSION_IDS.BANK_HEIST].status = 'available';
      });
      return true;
    }
    if (definition?.eventId === EVENT_IDS.BOOSKI_BIG_NIGHT_CALL
      && !this.#eventAnswered(EVENT_IDS.BOOSKI_BIG_NIGHT_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.BOOSKI_BIG_NIGHT_CALL, (state) => {
        state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status = 'answered';
        state.missions[MISSION_IDS.INITIATION].status = 'available';
      });
      return true;
    }
    return false;
  }

  collectHeistPreparation(itemId) {
    const valid = [...HEIST_PREPARATION_ITEMS.map((item) => item.id), 'extraMagazine'];
    const mission = this.campaign.state.missions[MISSION_IDS.BANK_HEIST];
    if (!valid.includes(itemId)
      || !['available', 'in_progress'].includes(mission.status)
      || mission.preparation?.[itemId] === true) return false;
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.BANK_HEIST].preparation[itemId] = true;
    });
    return true;
  }

  completeHeistCleanup(itemId) {
    const valid = HEIST_CLEANUP_ITEMS.map((item) => item.id);
    const mission = this.campaign.state.missions[MISSION_IDS.BANK_HEIST];
    if (!valid.includes(itemId)
      || mission.status !== 'complete'
      || mission.cleanup?.[itemId] === true) return false;
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.BANK_HEIST].cleanup[itemId] = true;
    });
    return true;
  }

  /**
   * Sleeping in his own bed is the chapter machine, and the only thing that
   * turns a page. Each chapter names the mission that has to be finished
   * first, so lying down early is refused in his own voice instead of
   * skipping a night of work.
   */
  sleep() {
    const state = this.campaign.state;
    const step = SLEEP_CHAPTERS.find((entry) => entry.from === state.story.chapter);
    if (!step) {
      return {
        ok: false,
        reason: state.story.chapter === LAST_CHAPTER
          ? 'already_heist_day' : 'unknown_chapter',
      };
    }
    if (state.missions[step.requires].status !== 'complete') {
      return { ok: false, reason: step.incomplete };
    }

    this.campaign.update((next) => {
      next.story.chapter = step.to;
      next.story.day = step.day;
      next.story.timeMinutes = step.timeMinutes;
      next.scene = { id: SCENE_IDS.APARTMENT, spawn: 'wake' };
      /* A new morning is a new morning. These used to carry over, so waking on
       * Day Two you had already eaten, already showered and were already
       * dressed -- every getting-ready interaction in the flat answered
       * "you have had a shower", the pan was washed up, and the day had no
       * shape of its own. It was yesterday's flat with a different number on
       * the clock, which is exactly what "it puts me back on day one" feels
       * like from the inside. */
      for (const { id } of DEPARTURE_REQUIREMENTS) next.activities[id] = false;
      /* And the chapter's own pastime, because it is the CHAPTER'S. A man who
       * sat through half a minute of the news on Wednesday morning has not
       * thereby got his game of Counter-Squatch in on Thursday. Cleared for
       * every chapter rather than only the one being left, so a flag can only
       * ever be earned inside the chapter that asks for it. */
      for (const list of Object.values(CHAPTER_PASTIMES)) {
        for (const item of list) next.activities[item.id] = false;
      }
      // Not emailChecked: telling HR where to go is a thing that happened
      // once, not a thing he does every morning.
    });
    this.started = false;
    this.elapsed = 0;
    this.nextRingAt = FIRST_RING_DELAY;
    return {
      ok: true,
      chapter: step.to,
      day: step.day,
      timeMinutes: step.timeMinutes,
    };
  }

  /**
   * The morning's list, for the panel on the wall of the HUD.
   *
   * Derived, never authored. The chores come out of the same
   * DEPARTURE_REQUIREMENTS the door refuses on, the call's tick comes out of
   * the same campaign event that unlocks it, and the last line is literally
   * whatever `tryLeave` says next -- so the panel cannot drift out of step
   * with the door, because it is asking the door.
   *
   * @param {object} activities the same shape the door is judged against
   */
  objectives(activities = {}) {
    const state = this.campaign.state;
    const plan = CHAPTER_PLAN[state.story.chapter];
    if (!plan) return { chapter: state.story.chapter, day: state.story.day, items: [] };

    const items = DEPARTURE_REQUIREMENTS.map(({ id }) => ({
      id,
      label: ROUTINE_LABELS[id],
      done: activities[id] === true,
      required: plan.routineRequired,
    }));
    if (plan.event) {
      items.push({
        id: plan.event,
        label: `Answer ${plan.caller}’s call`,
        done: this.#eventAnswered(plan.event),
        required: true,
      });
    }

    /* And the one thing in this chapter that is his rather than theirs. It
     * sits under the call because that is the order the door enforces: he is
     * told where he is going, and then he does one thing before he goes. */
    for (const item of pastimesFor(state.story.chapter)) {
      items.push({
        id: item.id,
        label: pastimeLabel(item, activities),
        done: activities[item.id] === true,
        required: true,
      });
    }

    const bankHeist = state.missions[MISSION_IDS.BANK_HEIST];
    if (state.story.chapter === 'heist_day'
      && this.#eventAnswered(EVENT_IDS.LOU_HEIST_CALL)) {
      for (const item of HEIST_PREPARATION_ITEMS) {
        items.push({
          ...item,
          done: bankHeist.preparation[item.id] === true,
          required: true,
        });
      }
    }
    if (state.story.chapter === 'post_heist') {
      for (const item of HEIST_CLEANUP_ITEMS) {
        items.push({
          ...item,
          done: bankHeist.cleanup[item.id] === true,
          required: true,
        });
      }
    }

    /* The first morning's optional half. Only the first morning: by Day Two
     * he knows where his own computer is and does not need telling. */
    const killingTime = state.story.chapter === 'day_one'
      && state.missions[MISSION_IDS.BADA_BING_ONE].status !== 'complete';
    if (killingTime) {
      for (const { id, label } of DAY_ONE_OPTIONAL) {
        items.push({ id, label, done: activities[id] === true, required: false });
      }
    }

    /* And what the door itself would say if he tried it right now. A chore it
     * is still waiting on is already a line above, so that case adds nothing.
     */
    const door = this.tryLeave(activities);
    if (door.kind === 'go') {
      items.push({
        id: `depart.${door.destination}`,
        label: `Leave for ${SCENE_LABELS[door.destination] ?? door.destination}`,
        done: false,
        required: true,
      });
    } else if (door.kind === 'item') {
      items.push({ id: door.id, label: 'Find Lou’s package', done: false, required: true });
    } else if (door.kind === 'stay') {
      items.push({ id: door.id, label: 'Sleep', done: false, required: true });
    } else if (door.kind === 'activity' && !items.some((item) => item.id === door.id)) {
      items.push({ id: door.id, label: door.label, done: false, required: true });
    }
    /* Last line, and only on the first day: the Bing is not until a quarter
     * to midnight, so everything above it is true and useless for seventeen
     * hours unless the list also says what a day with nothing in it is for. */
    if (killingTime) items.push(DAY_ONE_KILL_TIME);
    return { chapter: state.story.chapter, day: state.story.day, items };
  }

  /**
   * The chapter's own thing, as a door refusal.
   *
   * Returns the first unfinished pastime for the current chapter in the same
   * `kind: 'activity'` shape every other gate in `tryLeave` hands back, or
   * null when there is nothing outstanding.
   *
   * Called at four sites rather than once at the top of the method, and the
   * placement at each of them is the design: inside the branch that sends him
   * to the chapter's FIRST job, after its call has been answered and
   * immediately before its `go`.
   *
   * Both halves of that were wrong on the first attempt and both were worth
   * fixing. Sitting ABOVE the call meant a door that answered an unanswered
   * telephone with "you have not played your game yet", which has the
   * priorities of this campaign exactly backwards -- he is told where he is
   * going, and then he takes one thing for himself on the way out. And sitting
   * outside the branch meant it stayed in the path for the whole chapter:
   * coming home from the Jerky Motel at half four in the morning with nothing
   * left to do, the door stopped saying "go to bed" and started asking him to
   * watch the news, twenty-two hours after the morning that asked for it. A
   * pastime stands between him and the first job of its chapter and nothing
   * else.
   */
  #pastimeGate(activities) {
    for (const item of pastimesFor(this.campaign.state.story.chapter)) {
      if (activities[item.id] === true) continue;
      return {
        kind: 'activity',
        id: item.id,
        label: pastimeLabel(item, activities),
        ...refusal(item.refusal),
        hint: item.hint,
      };
    }
    return null;
  }

  tryLeave(activities = {}) {
    const state = this.campaign.state;
    const bankHeist = state.missions[MISSION_IDS.BANK_HEIST];
    if (state.story.chapter === 'post_heist') {
      const missing = HEIST_CLEANUP_ITEMS.find(
        ({ id }) => bankHeist.cleanup[id] !== true,
      );
      if (missing) {
        return {
          kind: 'activity',
          ...missing,
          ...refusal('heist_cleanup'),
        };
      }
      const silverCase = state.missions[MISSION_IDS.SILVER_CASE];
      if (silverCase.status !== 'complete') {
        if (silverCase.status === 'locked') {
          return {
            kind: 'stay',
            id: 'final_arc_locked',
            ...refusal('final_arc_locked'),
          };
        }
        return { kind: 'go', destination: SCENE_IDS.SILVER_CASE };
      }
      if (state.missions[MISSION_IDS.INITIATION].status === 'locked') {
        return {
          kind: 'stay',
          id: 'initiation_locked',
          ...refusal('initiation_locked'),
        };
      }
      return { kind: 'go', destination: SCENE_IDS.INITIATION };
    }
    if (state.story.chapter === 'golf_morning') {
      if (!this.#eventAnswered(EVENT_IDS.LOU_GOLF_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.LOU_GOLF_CALL,
          ...refusal('golf_call'),
        };
      }
      if (state.missions[MISSION_IDS.SILVER_PINES].status !== 'complete') {
        const pastime = this.#pastimeGate(activities);
        if (pastime) return pastime;
        return { kind: 'go', destination: SCENE_IDS.SILVER_PINES };
      }
      return {
        kind: 'stay',
        id: 'golf_return_pending',
        ...refusal('golf_return'),
      };
    }
    if (state.story.chapter === 'heist_day') {
      if (!this.#eventAnswered(EVENT_IDS.LOU_HEIST_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.LOU_HEIST_CALL,
          ...refusal('heist_call'),
        };
      }
      const missing = HEIST_PREPARATION_ITEMS.find(
        ({ id }) => bankHeist.preparation[id] !== true,
      );
      if (missing) {
        return {
          kind: 'activity',
          ...missing,
          ...refusal('heist_kit'),
        };
      }
      return { kind: 'go', destination: SCENE_IDS.BANK_HEIST };
    }
    if (state.story.chapter === 'big_night') {
      if (!this.#eventAnswered(EVENT_IDS.BOOSKI_BIG_NIGHT_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.BOOSKI_BIG_NIGHT_CALL,
          ...refusal('big_night_call'),
        };
      }
      const pastime = this.#pastimeGate(activities);
      if (pastime) return pastime;
      return {
        kind: 'go',
        destination: SCENE_IDS.INITIATION,
      };
    }
    if (state.story.chapter === 'no_wake') {
      if (!this.#eventAnswered(EVENT_IDS.LOU_NO_WAKE_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.LOU_NO_WAKE_CALL,
          ...refusal('no_wake_call'),
        };
      }
      if (state.missions[MISSION_IDS.NO_WAKE].status !== 'complete') {
        const pastime = this.#pastimeGate(activities);
        if (pastime) return pastime;
        return { kind: 'go', destination: SCENE_IDS.NO_WAKE };
      }
    }
    /* Day 3. Nothing about the family happens today, which is the point of it.
     * He waits for her to ring, he goes, and he comes back. */
    if (state.story.chapter === 'date') {
      if (!this.#eventAnswered(EVENT_IDS.MARGO_DATE_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.MARGO_DATE_CALL,
          ...refusal('date_call'),
        };
      }
      if (state.missions[MISSION_IDS.SILVER_ROOM].status !== 'complete') {
        return {
          kind: 'go',
          destination: SCENE_IDS.SILVER_ROOM,
        };
      }
      /* Home from the Silver Room. Tomorrow is the whole rest of his life and
       * there is nothing left to do about it tonight. */
      return {
        kind: 'stay',
        id: 'sleep_before_big_night',
        ...refusal('sleep_after_date'),
      };
    }
    if (state.story.chapter === 'day_two'
      && state.missions[MISSION_IDS.SQUATCHFATHER].status === 'complete') {
      if (!this.#eventAnswered(EVENT_IDS.BOOSKI_DAY_TWO_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.BOOSKI_DAY_TWO_CALL,
          ...refusal('day_two_call'),
        };
      }
      if (state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status !== 'complete') {
        const pastime = this.#pastimeGate(activities);
        if (pastime) return pastime;
        return {
          kind: 'go',
          destination: SCENE_IDS.AIRSTRIP_SMUGGLING,
        };
      }
      if (!this.#eventAnswered(EVENT_IDS.LOU_SECOND_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.LOU_SECOND_CALL,
          ...refusal('second_bing_call'),
        };
      }
      if (state.missions[MISSION_IDS.BADA_BING_TWO].status !== 'complete') {
        if (['body_loaded', 'graveyard']
          .includes(state.missions[MISSION_IDS.BADA_BING_TWO].checkpoint)) {
          return {
            kind: 'go',
            destination: SCENE_IDS.SQUATCH_GRAVEYARD,
          };
        }
        return {
          kind: 'go',
          destination: SCENE_IDS.BADA_BING_TWO,
        };
      }
      if (state.missions[MISSION_IDS.JERKY_MOTEL].status !== 'complete') {
        return {
          kind: 'go',
          destination: SCENE_IDS.JERKY_MOTEL,
        };
      }
      /* Home from the Motel before dawn with nothing left on the list. The
       * door stays shut until he has slept and Booskibro has rung. */
      return {
        kind: 'stay',
        id: 'sleep_before_big_night',
        ...refusal('sleep_after_motel'),
      };
    }
    if (!this.#callAnswered()) {
      return {
        kind: 'call',
        id: EVENT_IDS.LOU_FIRST_CALL,
          ...refusal('first_call'),
      };
    }
    const missions = this.campaign.state.missions;
    if (missions[MISSION_IDS.BADA_BING_ONE].status === 'complete') {
      if (missions[MISSION_IDS.SQUATCHFATHER].status === 'complete') {
        return {
          kind: 'stay',
          id: 'sleep',
          ...refusal('sleep_after_squatchfather'),
        };
      }
      if (missions[MISSION_IDS.SQUATCHFATHER].status === 'in_progress'
        && missions[MISSION_IDS.SQUATCHFATHER].weaponStaged) {
        return {
          kind: 'go',
          destination: SCENE_IDS.SQUATCHFATHER,
        };
      }
      if (!this.campaign.hasItem(ITEM_IDS.LOU_PACKAGE)) {
        return {
          kind: 'item',
          id: ITEM_IDS.LOU_PACKAGE,
          ...refusal('lou_package'),
        };
      }
      if (!activities.whiskeyRelaxed) {
        return {
          kind: 'activity',
          id: 'whiskeyRelaxed',
          label: 'Take a shot of whiskey',
          ...refusal('whiskey'),
          hint: 'Pick up the whiskey and hold F for a pull.',
        };
      }
      return {
        kind: 'go',
        destination: SCENE_IDS.SQUATCHFATHER,
      };
    }
    const missing = DEPARTURE_REQUIREMENTS.find(({ id }) => !activities[id]);
    if (missing) return { kind: 'activity', ...missing };
    return {
      kind: 'go',
      destination: SCENE_IDS.BADA_BING_ONE,
    };
  }

  /* ---------------------------------------------------------------- */
  /* What the flat has to say about yesterday                          */
  /* ---------------------------------------------------------------- */

  /**
   * The messages waiting on the machine this morning, and whether he has
   * heard them.
   *
   * Both halves come off the campaign: the chapter picks the messages, and the
   * time event records that they were played, so a reload does not replay them
   * and a checkpoint restore that rewinds the chapter puts them back.
   */
  messages() {
    const state = this.campaign.state;
    const list = CHAPTER_MESSAGES[state.story.chapter] ?? [];
    const eventId = MESSAGE_EVENTS[state.story.chapter] ?? null;
    return {
      chapter: state.story.chapter,
      eventId,
      heard: eventId ? state.story.timeEvents.includes(eventId) : true,
      list,
    };
  }

  /**
   * Mark this morning's messages as played.
   * @returns {boolean} false when there was nothing to play, or it is already
   *   been played -- both of which mean the caller should not start the tape.
   */
  hearMessages() {
    const { eventId, heard, list } = this.messages();
    if (!eventId || heard || !list.length) return false;
    return this.campaign.advanceTime(eventId).applied === true;
  }

  /** What is on the news this morning, by station. Null before Day Two. */
  news() {
    return CHAPTER_NEWS[this.campaign.state.story.chapter] ?? null;
  }

  /** Exact call definition that can ring next, for startup voice prewarming. */
  pendingCall() {
    return this.#pendingCall();
  }

  /**
   * The fourth morning's cutscene: whether it is owed, and marking it spent.
   *
   * Keyed off the chapter and a one-shot time event, so it plays once, on the
   * big night's morning, and never again -- and a save that has already seen
   * it reloads into an empty bed rather than replaying her.
   */
  margoWakeOwed() {
    const state = this.campaign.state;
    if (!['golf_morning', 'heist_day', 'big_night'].includes(state.story.chapter)) return false;
    if (state.story.timeEvents.includes(TIME_EVENT_IDS.MARGO_WAKE)) return false;
    /* And only if she actually came back with him.
     *
     * `cameHome` is the Silver Room's own verdict on the evening and it now
     * survives the seam (see `SilverStory.complete`). Before this it was
     * computed, thrown away, and the chapter alone decided -- so a man who had
     * an awkward night, or who never played the date at all and arrived here
     * by a checkpoint, woke up next to her regardless.
     *
     * A save written before this landed has no `cameHome` at all, and the old
     * behaviour is what that player has already seen; `!== false` keeps their
     * morning rather than deleting a character out of their bed on load. */
    const silver = state.missions[MISSION_IDS.SILVER_ROOM];
    if (silver?.status === 'complete' && silver.cameHome === false) return false;
    return true;
  }

  /** She got dressed and went. The zero-minute cutscene marker prevents replay. */
  margoWakeDone() {
    if (!this.margoWakeOwed()) return false;
    return this.campaign.advanceTime(TIME_EVENT_IDS.MARGO_WAKE).applied === true;
  }

  /**
   * The night of the Silver Room: whether the come-home beat is owed, and
   * marking it spent.
   *
   * Deliberately the same shape as `margoWakeOwed` -- one is the mirror of
   * the other. `date` is the chapter for exactly as long as it takes to
   * sleep it off (see `SLEEP_CHAPTERS`), so this window is precise: from the
   * moment the Silver Room mission completes to the moment he next goes to
   * bed. Unlike `margoWakeOwed`, there is no pre-existing-save fallback to
   * honour here -- this scene never shipped before, so `cameHome` has to be
   * an explicit `true`, not merely not-`false`.
   */
  margoComeHomeOwed() {
    const state = this.campaign.state;
    if (state.story.chapter !== 'date') return false;
    if (state.story.timeEvents.includes(TIME_EVENT_IDS.MARGO_COME_HOME)) return false;
    const silver = state.missions[MISSION_IDS.SILVER_ROOM];
    return silver?.status === 'complete' && silver.cameHome === true;
  }

  /** She is home, helped out of the dress, and in bed. Marker prevents replay. */
  margoComeHomeDone() {
    if (!this.margoComeHomeOwed()) return false;
    return this.campaign.advanceTime(TIME_EVENT_IDS.MARGO_COME_HOME).applied === true;
  }

  /**
   * True for the rest of the night once she is in, so a reload before he
   * sleeps finds her already asleep in bed instead of replaying the walk in
   * from the door.
   */
  margoHomeForTheNight() {
    const state = this.campaign.state;
    return state.story.chapter === 'date'
      && state.story.timeEvents.includes(TIME_EVENT_IDS.MARGO_COME_HOME);
  }

  #callAnswered() {
    return this.#eventAnswered(EVENT_IDS.LOU_FIRST_CALL);
  }

  #eventAnswered(eventId) {
    return this.campaign.state.events[eventId].status === 'answered';
  }

  #pendingCall() {
    const state = this.campaign.state;
    if (state.story.chapter === 'golf_morning'
      && !this.#eventAnswered(EVENT_IDS.LOU_GOLF_CALL)) {
      return DAY_FOUR_LOU_GOLF_CALL;
    }
    if (state.story.chapter === 'heist_day'
      && !this.#eventAnswered(EVENT_IDS.LOU_HEIST_CALL)) {
      return DAY_FOUR_LOU_HEIST_CALL;
    }
    if (state.story.chapter === 'big_night'
      && !this.#eventAnswered(EVENT_IDS.BOOSKI_BIG_NIGHT_CALL)) {
      return BIG_NIGHT_BOOSKI_CALL;
    }
    if (state.story.chapter === 'date'
      && !this.#eventAnswered(EVENT_IDS.MARGO_DATE_CALL)) {
      return DATE_MARGO_CALL;
    }
    if (state.story.chapter === 'no_wake'
      && !this.#eventAnswered(EVENT_IDS.LOU_NO_WAKE_CALL)) {
      return NO_WAKE_LOU_CALL;
    }
    if (state.story.chapter === 'day_two'
      && state.missions[MISSION_IDS.SQUATCHFATHER].status === 'complete'
      && !this.#eventAnswered(EVENT_IDS.BOOSKI_DAY_TWO_CALL)) {
      return DAY_TWO_BOOSKI_CALL;
    }
    if (state.story.chapter === 'day_two'
      && state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status === 'complete'
      && !this.#eventAnswered(EVENT_IDS.LOU_SECOND_CALL)) {
      return DAY_TWO_LOU_SECOND_CALL;
    }
    if (state.story.day === 1 && !this.#callAnswered()) return DAY_ONE_LOU_CALL;
    /* Last, and keyed off the CHAPTER rather than the calendar: he gets home
     * from the Squatchfather well after midnight, so this rings on day 2 of a
     * day_one that has not been slept off yet. Sleeping ends the chapter and
     * with it the offer -- a call that unlocks nothing does not follow you
     * into the morning. */
    if (state.story.chapter === 'day_one'
      && state.missions[MISSION_IDS.SQUATCHFATHER].status === 'complete'
      && !this.#eventAnswered(EVENT_IDS.LOU_ATTABOY_CALL)) {
      return DAY_ONE_LOU_ATTABOY_CALL;
    }
    return null;
  }
}

export function createApartmentStory(options) {
  return new ApartmentStory(options);
}
