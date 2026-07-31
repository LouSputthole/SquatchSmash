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
  {
    id: 'pooped',
    line: 'Absolutely not. Bathroom first.',
    hint: 'You definitely know where it is.',
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
  pooped: 'Use the bathroom',
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

/** Somewhere to go, in words a person would use for it. */
const SCENE_LABELS = Object.freeze({
  [SCENE_IDS.BADA_BING_ONE]: 'the Bada Bing',
  [SCENE_IDS.SQUATCHFATHER]: 'the Squatchfather',
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: 'the airstrip',
  [SCENE_IDS.BADA_BING_TWO]: 'the Bada Bing',
  [SCENE_IDS.JERKY_MOTEL]: 'the Jerky Motel',
  [SCENE_IDS.SILVER_ROOM]: 'the Silver Room',
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
  date: Object.freeze({
    event: EVENT_IDS.MARGO_DATE_CALL,
    caller: 'Margo',
    routineRequired: false,
  }),
  big_night: Object.freeze({
    event: EVENT_IDS.BOOSKI_BIG_NIGHT_CALL,
    caller: 'Booskibro',
    routineRequired: false,
  }),
});

export const DAY_ONE_LOU_CALL = Object.freeze({
  eventId: EVENT_IDS.LOU_FIRST_CALL,
  characterId: CHARACTER_IDS.LOU,
  from: getCharacter(CHARACTER_IDS.LOU).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.LOU),
  vo: 'call.lou.bada_bing',
  lines: Object.freeze([
    'Kid. You awake?',
    'Meet me at the Bada Bing. Back office.',
    'I have a package for you, and I need it handled tonight.',
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
    'Keep doing work like that and there is a bright future for you here.',
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
    'I have another assignment. This one starts in person.',
    'Bring nothing and come straight to the back office.',
    'You will leave from here. You are not going home first.',
  ]),
  replies: Object.freeze([
    'I was just there.',
    'In person. Understood.',
    'Nothing. Got it.',
    'Then I will not pack.',
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

/**
 * What sleeping in his own bed does, chapter by chapter.
 *
 * Story chapter and calendar day are deliberately separate. Tony gets home
 * from the Jerky Motel at half four in the morning of Day 3, so the `date`
 * chapter opens at noon on that same Day 3 rather than on a fourth day: he was
 * up all night, and the table is not until nine that evening.
 *
 * Sleeping off the date is what finally moves the calendar. The big night is
 * Day 4 — he wakes at ten, Booskibro rings, and the ceremony is at seven.
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
    to: 'date',
    requires: MISSION_IDS.JERKY_MOTEL,
    incomplete: 'day_two_incomplete',
    day: 3,
    timeMinutes: 12 * 60,
  }),
  Object.freeze({
    from: 'date',
    to: 'big_night',
    requires: MISSION_IDS.SILVER_ROOM,
    incomplete: 'date_incomplete',
    day: 4,
    timeMinutes: 10 * 60,
  }),
]);
const LAST_CHAPTER = SLEEP_CHAPTERS[SLEEP_CHAPTERS.length - 1].to;

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
  date: TIME_EVENT_IDS.HEAR_MESSAGES_DATE,
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
 * slightly awkward in the way people are at ten in the morning in somebody
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

class ApartmentStory {
  constructor({ campaign, ring }) {
    this.campaign = campaign;
    this.ring = ring;
    this.started = false;
    this.elapsed = 0;
    this.nextRingAt = FIRST_RING_DELAY;
  }

  beginMorning() {
    this.started = true;
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
    if (definition?.eventId === EVENT_IDS.MARGO_DATE_CALL
      && !this.#eventAnswered(EVENT_IDS.MARGO_DATE_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.MARGO_DATE_CALL, (state) => {
        state.events[EVENT_IDS.MARGO_DATE_CALL].status = 'answered';
        state.missions[MISSION_IDS.SILVER_ROOM].status = 'available';
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
          ? 'already_big_night' : 'unknown_chapter',
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
    items.push({
      id: plan.event,
      label: `Answer ${plan.caller}’s call`,
      done: this.#eventAnswered(plan.event),
      required: true,
    });

    /* The first morning's optional half. Only the first morning: by Day Two
     * he knows where his own computer is and does not need telling. */
    if (state.story.chapter === 'day_one') {
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
      /* Day One's departure is not until a quarter to midnight, so the line
       * above is true and useless for seventeen hours without this under it. */
      if (state.story.chapter === 'day_one'
        && door.destination === SCENE_IDS.BADA_BING_ONE) {
        items.push(DAY_ONE_KILL_TIME);
      }
    } else if (door.kind === 'item') {
      items.push({ id: door.id, label: 'Find Lou’s package', done: false, required: true });
    } else if (door.kind === 'stay') {
      items.push({ id: door.id, label: 'Sleep', done: false, required: true });
    }
    return { chapter: state.story.chapter, day: state.story.day, items };
  }

  tryLeave(activities = {}) {
    const state = this.campaign.state;
    if (state.story.chapter === 'big_night') {
      if (!this.#eventAnswered(EVENT_IDS.BOOSKI_BIG_NIGHT_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.BOOSKI_BIG_NIGHT_CALL,
          line: 'Booskibro said he would call about tonight. I am not turning up unasked.',
        };
      }
      return {
        kind: 'go',
        destination: SCENE_IDS.INITIATION,
      };
    }
    /* Day 3. Nothing about the family happens today, which is the point of it.
     * He waits for her to ring, he goes, and he comes back. */
    if (state.story.chapter === 'date') {
      if (!this.#eventAnswered(EVENT_IDS.MARGO_DATE_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.MARGO_DATE_CALL,
          line: 'She said she would ring about tonight. I am not turning up at nine on a guess.',
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
        line: 'That was a good night. Tomorrow is the other kind. <em>Bed.</em>',
      };
    }
    if (state.story.chapter === 'day_two'
      && state.missions[MISSION_IDS.SQUATCHFATHER].status === 'complete') {
      if (!this.#eventAnswered(EVENT_IDS.BOOSKI_DAY_TWO_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.BOOSKI_DAY_TWO_CALL,
          line: 'Booskibro said he would call with the next job.',
        };
      }
      if (state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status !== 'complete') {
        return {
          kind: 'go',
          destination: SCENE_IDS.AIRSTRIP_SMUGGLING,
        };
      }
      if (!this.#eventAnswered(EVENT_IDS.LOU_SECOND_CALL)) {
        return {
          kind: 'call',
          id: EVENT_IDS.LOU_SECOND_CALL,
          line: 'Lou said he would call when he wanted you back at the Bing.',
        };
      }
      if (state.missions[MISSION_IDS.BADA_BING_TWO].status !== 'complete') {
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
        line: 'It is not even light out. Whatever is next can wait until I have slept.',
      };
    }
    if (!this.#callAnswered()) {
      return {
        kind: 'call',
        id: EVENT_IDS.LOU_FIRST_CALL,
          line: 'Big Uncle Lou said he would call. I should answer before I go anywhere.',
      };
    }
    const missions = this.campaign.state.missions;
    if (missions[MISSION_IDS.BADA_BING_ONE].status === 'complete') {
      if (missions[MISSION_IDS.SQUATCHFATHER].status === 'complete') {
        return {
          kind: 'stay',
          id: 'sleep',
          line: 'That is enough going out for one night.',
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
          line: 'I am not going anywhere until I find Lou’s package.',
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

  /**
   * The fourth morning's cutscene: whether it is owed, and marking it spent.
   *
   * Keyed off the chapter and a one-shot time event, so it plays once, on the
   * big night's morning, and never again -- and a save that has already seen
   * it reloads into an empty bed rather than replaying her.
   */
  margoWakeOwed() {
    const state = this.campaign.state;
    return state.story.chapter === 'big_night'
      && !state.story.timeEvents.includes(TIME_EVENT_IDS.MARGO_WAKE);
  }

  /** She got dressed and went. Twelve minutes on the clock. */
  margoWakeDone() {
    if (!this.margoWakeOwed()) return false;
    return this.campaign.advanceTime(TIME_EVENT_IDS.MARGO_WAKE).applied === true;
  }

  #callAnswered() {
    return this.#eventAnswered(EVENT_IDS.LOU_FIRST_CALL);
  }

  #eventAnswered(eventId) {
    return this.campaign.state.events[eventId].status === 'answered';
  }

  #pendingCall() {
    const state = this.campaign.state;
    if (state.story.chapter === 'big_night'
      && !this.#eventAnswered(EVENT_IDS.BOOSKI_BIG_NIGHT_CALL)) {
      return BIG_NIGHT_BOOSKI_CALL;
    }
    if (state.story.chapter === 'date'
      && !this.#eventAnswered(EVENT_IDS.MARGO_DATE_CALL)) {
      return DATE_MARGO_CALL;
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
