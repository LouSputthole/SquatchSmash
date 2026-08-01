import {
  CHARACTER_IDS,
  EVENT_IDS,
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';
import { getCharacter, voiceProfileFor } from './characters.js';

const FIRST_RING_DELAY = 6;
const RETRY_DELAY = 30;
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
 * The morning of the big night, and the only call in the game that asks him
 * for nothing.
 *
 * Every other time this phone has rung it has been work: a package, a plane,
 * a room, a man to meet. Lou rings at ten past ten to tell him where the
 * course is. That is the whole content of it, and the fact that there is no
 * job attached is the point — which is why he does not say so, and why the
 * only instruction in it is about shoes.
 */
export const GOLF_LOU_CALL = Object.freeze({
  eventId: EVENT_IDS.LOU_GOLF_CALL,
  characterId: CHARACTER_IDS.LOU,
  targetSceneId: SCENE_IDS.SILVER_PINES,
  from: getCharacter(CHARACTER_IDS.LOU).subtitleName,
  voiceProfile: voiceProfileFor(CHARACTER_IDS.LOU),
  vo: 'call.lou.golf',
  lines: Object.freeze([
    'Silver Pines. Off Route Twenty-Three, past the quarry, second gate.',
    'Half ten. Rippin and Erican are already complaining about the time.',
    'No, you do not need to bring anything. That is not what this is.',
    'Wear something you can walk in. And Tony — the ceremony is at seven. '
      + 'You have got all morning.',
  ]),
});

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
    this.nextRingAt = this.elapsed + (rang ? RETRY_DELAY : 1);
  }

  callAnswered(definition) {
    if (definition?.eventId === EVENT_IDS.LOU_FIRST_CALL && !this.#callAnswered()) {
      this.campaign.advanceTime(TIME_EVENT_IDS.LOU_FIRST_CALL, (state) => {
        state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
        state.missions[MISSION_IDS.BADA_BING_ONE].status = 'available';
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
    if (definition?.eventId === EVENT_IDS.LOU_GOLF_CALL
      && !this.#eventAnswered(EVENT_IDS.LOU_GOLF_CALL)) {
      this.campaign.advanceTime(TIME_EVENT_IDS.LOU_GOLF_CALL, (state) => {
        state.events[EVENT_IDS.LOU_GOLF_CALL].status = 'answered';
        state.missions[MISSION_IDS.SILVER_PINES].status = 'available';
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

  tryLeave(activities = {}) {
    const state = this.campaign.state;
    /* Day 4, and it has two halves. The morning is golf and the evening is
     * the rest of his life, and the order matters: the round is the last time
     * anybody treats him as a person rather than as a decision, so it happens
     * before the room and not after it. */
    if (state.story.chapter === 'big_night') {
      if (state.missions[MISSION_IDS.SILVER_PINES].status !== 'complete') {
        if (!this.#eventAnswered(EVENT_IDS.LOU_GOLF_CALL)) {
          return {
            kind: 'call',
            id: EVENT_IDS.LOU_GOLF_CALL,
            line: 'Lou said he would ring this morning. Nowhere to be until he does.',
          };
        }
        return {
          kind: 'go',
          destination: SCENE_IDS.SILVER_PINES,
        };
      }
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

  #callAnswered() {
    return this.#eventAnswered(EVENT_IDS.LOU_FIRST_CALL);
  }

  #eventAnswered(eventId) {
    return this.campaign.state.events[eventId].status === 'answered';
  }

  #pendingCall() {
    const state = this.campaign.state;
    /* Lou rings first and Booskibro waits for the round to be over. Two
     * one-shot calls in the same chapter need an order, and this one is the
     * story: nobody tells him the night is his until the morning has happened. */
    if (state.story.chapter === 'big_night'
      && state.missions[MISSION_IDS.SILVER_PINES].status !== 'complete'
      && !this.#eventAnswered(EVENT_IDS.LOU_GOLF_CALL)) {
      return GOLF_LOU_CALL;
    }
    if (state.story.chapter === 'big_night'
      && state.missions[MISSION_IDS.SILVER_PINES].status === 'complete'
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
    return null;
  }
}

export function createApartmentStory(options) {
  return new ApartmentStory(options);
}
