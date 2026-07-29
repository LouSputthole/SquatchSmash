/**
 * The second monitor.
 *
 * Chat on one screen and the game on the other is the whole aesthetic, and it
 * is also the second of the three ways the game tells you about Wednesday --
 * after the card on the corkboard and before the radio reads the notice out.
 *
 * Messages arrive on the in-game clock rather than on a timer, so the feed is
 * consistent whether you spent the morning at the desk or asleep. Nothing
 * pops, nothing pauses, nothing asks you to acknowledge it. You can see there
 * is unread mail from across the room, ignore it for the entire game, and the
 * only consequence is that nobody ever told you where to be.
 *
 * Reading it is a deliberate act: hold the interact key on the monitor. That
 * is the moment you know about the meeting, not the moment Booski typed it.
 */

/** Who talks, and in what colour. Matches the roster on the wall. */
const WHO = {
  BOOSKI: '#8fb6ff',
  APE: '#ffb46a',
  LOU: '#9ee8a4',
  IRISH: '#e88fa4',
  SHUBES: '#c8a2ff',
  'HOG MAMA': '#ffd479',
};

/**
 * Last night, before you went to bed. Already on screen when you wake up, and
 * already read -- these are not what tells you about the meeting.
 */
const BACKLOG = [
  ['BOOSKI', 'anyone up'],
  ['BOOSKI', 'hello'],
  ['APE', 'no'],
  ['LOU', 'im at the airport'],
  ['LOU', 'not flying. just here'],
  ['IRISH', 'read the carton'],
  ['SHUBES', 'queue?'],
  ['SHUBES', 'ok'],
  ['SHUBES', 'nvm'],
];

/**
 * Tuesday, as it happens. `at` is the in-game hour a message lands.
 *
 * The meeting is mentioned four separate times across the morning, because a
 * player who sits down at the PC at nine and never looks left should still
 * have it on screen when they finally do. `meeting: true` marks the ones that
 * would tell you on their own.
 */
const SCHEDULE = [
  { at: 6.6, who: 'BOOSKI', text: 'morning' },
  { at: 6.9, who: 'BOOSKI', text: 'you up?' },
  { at: 7.4, who: 'APE', text: 'he is not up' },
  { at: 7.8, who: 'BOOSKI', text: 'tomorrow night still on for everyone', meeting: true },
  { at: 8.1, who: 'BOOSKI', text: 'wed 7pm. im driving', meeting: true },
  { at: 8.5, who: 'LOU', text: 'yes' },
  { at: 8.7, who: 'APE', text: 'big night for the prospect' },
  { at: 8.9, who: 'IRISH', text: 'i have things to bring up' },
  { at: 9.2, who: 'APE', text: 'you always have things to bring up' },
  { at: 9.8, who: 'BOOSKI', text: 'queue? one game' },
  { at: 10.4, who: 'SHUBES', text: 'lobby up' },
  { at: 11.2, who: 'APE', text: 'that was the worst i have ever seen you play' },
  { at: 12.0, who: 'BOOSKI', text: 'he was cheating. genuinely' },
  { at: 13.5, who: 'HOG MAMA', text: 'is the meeting a bring-a-thing' },
  { at: 13.7, who: 'BOOSKI', text: 'bring nothing', meeting: true },
  { at: 13.9, who: 'HOG MAMA', text: 'i meant for the prospect' },
  { at: 14.1, who: 'BOOSKI', text: 'especially not for the prospect' },
  { at: 14.4, who: 'SHUBES', text: 'we all did it. he will be fine' },
  { at: 14.6, who: 'APE', text: 'shubes cried' },
  { at: 14.8, who: 'SHUBES', text: 'i did not cry' },
  { at: 15.0, who: 'LOU', text: 'im still at the airport' },
  { at: 16.4, who: 'IRISH', text: 'nobody has answered my question about the eggs' },
  { at: 18.0, who: 'BOOSKI', text: 'right. tomorrow. 7. do not be late', meeting: true },
  { at: 19.5, who: 'APE', text: 'he will be late' },
  { at: 20.2, who: 'LOU', text: 'he will not be late' },
  { at: 21.0, who: 'BOOSKI', text: 'ok' },
];

export class Chat {
  /** @param {DayNight} time the in-game clock */
  constructor(time) {
    this.time = time;
    this.messages = BACKLOG.map(([who, text]) => ({ who, text, colour: WHO[who] }));
    /** Messages that have landed since you last read the screen. */
    this.unread = 0;
    /** True once a message that mentions Wednesday is on screen. */
    this.hasMeeting = false;
    this._next = 0;
    this._dirty = true;
  }

  /** How far through Tuesday we are, counting past midnight into Wednesday. */
  _clock() {
    return (this.time.day - 1) * 24 + this.time.hour;
  }

  /**
   * Land whatever is due. Catches up in one go, so sleeping through the
   * afternoon leaves the whole afternoon on the screen rather than skipping it.
   * @returns {boolean} true if anything arrived
   */
  update() {
    const now = this._clock();
    let landed = false;
    while (this._next < SCHEDULE.length && SCHEDULE[this._next].at <= now) {
      const m = SCHEDULE[this._next++];
      this.messages.push({ who: m.who, text: m.text, colour: WHO[m.who], meeting: m.meeting });
      if (m.meeting) this.hasMeeting = true;
      this.unread++;
      landed = true;
    }
    if (landed) this._dirty = true;
    return landed;
  }

  /** The last few, which is all that fits on a portrait monitor. */
  visible(n = 9) {
    return this.messages.slice(-n);
  }

  /** You looked at it properly. @returns {boolean} true if this told you something. */
  read() {
    this.unread = 0;
    this._dirty = true;
    return this.hasMeeting;
  }

  /** Whether the canvas needs repainting, cleared by the caller. */
  takeDirty() {
    const was = this._dirty;
    this._dirty = false;
    return was;
  }
}
