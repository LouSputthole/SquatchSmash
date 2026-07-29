/**
 * The Wednesday night Squatch meeting.
 *
 * The only goal in the game, and the game never tells you about it directly.
 * You find out from the card on the corkboard, or from Booski's messages on
 * the second monitor, or from the radio reading community notices. Until you
 * have found out, the front door behaves exactly as it always did.
 *
 * There is no quest log and there is no checklist on screen. The front door
 * is the only thing that tells you what you have forgotten, and it tells you
 * one thing at a time, in the character's own voice, as an excuse rather than
 * an objective. That is the whole design: it is not a list of tasks, it is a
 * man standing at his own front door talking himself out of leaving.
 *
 * Once a gate is satisfied it stays satisfied -- showering on Tuesday counts
 * on Wednesday. Sobriety is the exception, because that one genuinely wears
 * off, and being checked at the door is the point of it.
 */

/** Day 1 is Tuesday, so the meeting is on day 2. */
export const MEETING = { day: 2, hour: 19 };
/** You can set off from five. Before that it is not time yet. */
const WINDOW_OPEN = 17;
/** Turn up after eight and there was no point going. */
const WINDOW_CLOSE = 20;

/** Getting a game in means dying to a cheater this many times. */
export const CS_ROUNDS = 5;
/** Above this you are not going. */
export const TOO_DRUNK = 0.45;
/** Below this you can sit through ninety minutes without thinking about it. */
export const BLADDER_OK = 0.35;

/**
 * In the order he would think of them: the things he promised, then the
 * things his body is telling him, then whatever is actually in his hand.
 */
const GATES = [
  {
    id: 'showered',
    done: (c) => c.state.showered,
    excuse: 'No. I need a shower first. I am aware of it.',
    vo: 'door.shower',
  },
  {
    id: 'dressed',
    done: (c) => c.state.dressed,
    excuse: 'I am in what I slept in. Cannot turn up in this.',
    vo: 'door.dressed',
  },
  {
    id: 'fed',
    done: (c) => c.state.fed,
    excuse: 'I have not eaten since yesterday. I will be useless.',
    vo: 'door.eat',
  },
  {
    /* HR wants the Wednesday evening shift. The meeting is the Wednesday
     * evening. He is not going to leave that sitting in an inbox all day and
     * he is not going to agonise over it either -- the reply is already
     * written, he just has to be at the desk to send it. */
    id: 'hrmail',
    done: (c) => c.state.repliedHR,
    excuse: 'HR wants me on the late shift tomorrow. I should answer that first.',
    vo: 'door.hr',
  },
  {
    id: 'playedCS',
    done: (c) => c.state.csDeaths >= CS_ROUNDS,
    excuse: 'I told the boys I would get a game in. I should do that first.',
    vo: 'door.cs',
  },
  {
    id: 'bladder',
    done: (c) => c.state.bladder < BLADDER_OK,
    excuse: 'Ninety minutes in that room, in those chairs. I should go first.',
    vo: 'door.piss',
  },
  {
    id: 'bowel',
    done: (c) => c.state.bowel <= 0.02,
    excuse: 'Absolutely not. Not until that is dealt with.',
    vo: 'door.poop',
  },
  {
    id: 'hands',
    done: (c) => !c.state.heldItem || c.state.heldItem === 'empty',
    excuse: 'Cannot turn up holding this. Well. Should not.',
    vo: 'door.beer',
  },
  {
    id: 'sober',
    done: (c) => c.drunkLevel < TOO_DRUNK,
    excuse: '…No. Not like this. They would know.',
    vo: 'door.drunk',
  },
];

/** What the door says when it is simply not time yet. */
const TOO_EARLY = [
  'The meeting is tomorrow night. Today is a Tuesday with nothing in it.',
  'Tomorrow. Seven. There is a whole day between here and there.',
  'It is still Tuesday. Going now would just be standing outside a locked hall.',
];

/** And when it is Wednesday but the sun is still up. */
const NOT_YET = [
  'Not for a few hours yet. Booski is not even up.',
  'Too early. You would be the first one there, and you would be alone with that.',
];

export class Goals {
  /**
   * @param {object} time  the DayNight clock
   */
  constructor(time) {
    this.time = time;
    /** Has the player found out there is a meeting at all? */
    this.known = false;
    /** How they found out, for the narrator. */
    this.learnedFrom = null;
    /** Set once they have actually left. */
    this.ending = null;
    /** Set once the window has closed without them. */
    this.missed = false;
    this._toldOnce = new Set();
  }

  /** The corkboard, the monitor or the radio. First one wins. */
  learn(source) {
    if (this.known) return false;
    this.known = true;
    this.learnedFrom = source;
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Time                                                              */
  /* ---------------------------------------------------------------- */

  /** Minutes since the game began, across days. */
  get nowMinutes() {
    return (this.time.day - 1) * 1440 + this.time.minutes;
  }

  get meetingMinutes() {
    return (MEETING.day - 1) * 1440 + MEETING.hour * 60;
  }

  /** In-game minutes until it starts. Negative once it has. */
  get minutesUntil() {
    return this.meetingMinutes - this.nowMinutes;
  }

  /**
   * 'early'  -- not the right day, or too early on the day
   * 'open'   -- you can set off
   * 'late'   -- it has started, but you could still turn up
   * 'missed' -- it is over
   */
  get window() {
    const day = this.time.day;
    const h = this.time.hour;
    if (day < MEETING.day) return 'early';
    if (day > MEETING.day) return 'missed';
    if (h < WINDOW_OPEN) return 'early';
    if (h < MEETING.hour) return 'open';
    if (h < WINDOW_CLOSE) return 'late';
    return 'missed';
  }

  /* ---------------------------------------------------------------- */
  /* Gates                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Everything still standing between him and the door.
   * @param {{state: object, drunkLevel: number}} ctx
   */
  blockers(ctx) {
    return GATES.filter((g) => !g.done(ctx));
  }

  /** The one he would think of first. Null when he is ready. */
  next(ctx) {
    return this.blockers(ctx)[0] || null;
  }

  /** How far along, for the narrator rather than for the player. */
  progress(ctx) {
    const left = this.blockers(ctx).length;
    return { done: GATES.length - left, total: GATES.length };
  }

  /**
   * What happens when he tries the door.
   *
   * @returns {{kind: string, line: string, vo: ?string}}
   *   kind is 'unaware' | 'early' | 'blocked' | 'go' | 'missed'
   */
  tryDoor(ctx) {
    if (!this.known) {
      return { kind: 'unaware', line: null, vo: null };
    }
    const w = this.window;
    if (w === 'missed') {
      return {
        kind: 'missed',
        line: 'It finished an hour ago. There will be another one next Wednesday.',
        vo: null,
      };
    }
    if (w === 'early') {
      const pool = this.time.day < MEETING.day ? TOO_EARLY : NOT_YET;
      return { kind: 'early', line: pick(pool), vo: null };
    }
    const blocker = this.next(ctx);
    if (blocker) {
      return { kind: 'blocked', line: blocker.excuse, vo: blocker.vo, id: blocker.id };
    }
    return { kind: 'go', line: null, vo: 'door.leave' };
  }

  /** Only say a given thing once, however many times he tries the handle. */
  firstTime(key) {
    if (this._toldOnce.has(key)) return false;
    this._toldOnce.add(key);
    return true;
  }

  /**
   * Which ending this is. Called at the moment he steps out.
   * @param {{state: object, drunkLevel: number, tripping: boolean, stoned: boolean}} ctx
   */
  endingFor(ctx) {
    if (this.window === 'late') return 'late';
    if (ctx.tripping) return 'tripping';
    if (ctx.stoned) return 'stoned';
    if (ctx.drunkLevel > 0.2) return 'merry';
    return 'clean';
  }
}

function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/** The text on each ending card. */
export const ENDINGS = {
  clean: {
    title: 'You went',
    body: 'Showered, fed, dressed, and out of the door at ten to seven on a '
      + 'Wednesday. Booski is double-parked outside. Nobody makes anything of it, '
      + 'because nobody knows how close it was.',
  },
  merry: {
    title: 'You went, more or less',
    body: 'Two ahead of everyone before you arrived, which is a start rather '
      + 'than a problem. You will be fine. You will be quite loud, but you will '
      + 'be fine.',
  },
  stoned: {
    title: 'You went, eventually',
    body: 'It took a while to get down the stairs. The stairs were interesting. '
      + 'You are there, and you are smiling at everybody, and Ape has already '
      + 'worked out why.',
  },
  tripping: {
    title: 'You went. You should not have gone.',
    body: 'The hall is lit with strip lights and everybody is a person and the '
      + 'chairs are stacked in a way that means something. You are going to sit '
      + 'quietly at the back and you are going to be fine. Probably.',
  },
  late: {
    title: 'You made it, just',
    body: 'They started without you. You got the last chair, the one with the '
      + 'wobble, and Lou did not stop talking long enough to notice you come in.',
  },
  missed: {
    title: 'You did not go',
    body: 'Eight o\'clock on a Wednesday and the flat is exactly as it was on '
      + 'Tuesday morning. The card is still on the corkboard. There is another '
      + 'one next week, and you have a whole seven days to get ready for it.',
  },
};
