/**
 * The voice in the apartment.
 *
 * There is no plot here and nothing to complete. What there is instead is a
 * flat about four metres by ten, a Tuesday, and somebody noticing things
 * about you while you fail to do anything with either. It speaks when you
 * have stopped moving, when you have been in here a while, and when you do
 * the same pointless thing more than twice.
 *
 * It never speaks over anything else: if the game or the radio has the
 * subtitle line, the narrator waits. It also never repeats a line inside one
 * session, so hearing the same observation twice always means you earned it.
 */

/** Stand still this long and it takes that as an invitation. */
const IDLE_AFTER = 26;
/** Never twice inside this window, however still you are. */
const COOLDOWN = 52;

/** Said when you have stopped moving. Roughly in escalating order. */
const IDLE = [
  'You are standing in the middle of the room.',
  'Nothing in here is going to start on its own.',
  'The fridge is over there. The PC is over there. That is the list.',
  'It is warm. It is Tuesday. Neither of those is going to change quickly.',
  'You could sit down. Sitting down is allowed.',
  'Somewhere outside, someone is having a productive day.',
  'The wall is a wall. You have now confirmed this.',
  'There is no objective. There was never going to be one.',
  'You are waiting for something to happen. That is the joke.',
  'Four walls. Twenty-odd photographs. One of everything else.',
  'The clock is waiting for you to do something. Fair enough.',
  'You have looked at all of it. You are looking at it again.',
];

/** Said once you have been in here long enough for it to be a choice. */
const ELAPSED = [
  { after: 240, line: 'Four minutes. Nothing has been achieved, and nothing was ever going to be.' },
  { after: 600, line: 'Ten minutes in this flat. You are doing this on purpose now.' },
  { after: 900, line: 'A quarter of an hour. The story has politely waited while you were in here.' },
  { after: 1500, line: 'Twenty-five minutes. At some point this stopped being boredom and became a hobby.' },
  { after: 2400, line: 'Forty minutes. Nobody is coming. That was never part of it.' },
];

/** Doing the same thing over and over gets noticed. */
const REPEATS = {
  fridge: [
    [4, 'You have opened that fridge four times. The contents have not moved.'],
    [8, 'Eight. It is the same fridge. It has been the same fridge all morning.'],
    [14, 'You are not hungry. You are checking whether the world has changed. It has not.'],
  ],
  blinds: [
    [4, 'Up, down, up, down. The city does not mind either way.'],
    [8, 'The blinds are the most responsive thing in this flat and you have found that out.'],
  ],
  lights: [
    [6, 'The switch works. It has worked every time. It will keep working.'],
  ],
  door: [
    [3, 'The door is locked and you have checked. Twice more, apparently.'],
    [6, 'Outside is a whole thing. In here there is a fridge and a PC. You know this.'],
  ],
  sit: [
    [5, 'Down, up, down, up. Furniture is not an activity.'],
  ],
  fart: [
    [7, 'Yes. Well done.'],
    [15, 'This is what you have chosen to be good at.'],
  ],
};

/** One line for each hour of the day, said once when you notice the light. */
const HOURS = [
  { at: 5, line: 'Dawn. The light is coming up the east wall whether you watch it or not.' },
  { at: 12, line: 'Noon. Half the day, and the only thing you have moved is yourself.' },
  { at: 19, line: 'The light is going orange. That happens on its own too.' },
  { at: 21, line: 'Dark now. The city out there has gone quieter and further away.' },
  { at: 3, line: 'Three in the morning. There is nobody to explain this to.' },
];

export class Narrator {
  constructor(hud, time, audio = null) {
    this.hud = hud;
    this.time = time;
    this.audio = audio;
    this.enabled = true;

    this.idle = 0;
    this.cooldown = 18;         // a beat of quiet after waking up
    this.elapsed = 0;

    this._idlePool = IDLE.slice();
    this._elapsed = new Set();
    this._hours = new Set();
    this._counts = Object.create(null);
    this._saidRepeat = new Set();
  }

  /** Something happened that is worth counting. */
  note(what) {
    const n = (this._counts[what] = (this._counts[what] || 0) + 1);
    const rules = REPEATS[what];
    if (!rules) return;
    for (const [at, line] of rules) {
      const key = `${what}:${at}`;
      if (n === at && !this._saidRepeat.has(key)) {
        this._saidRepeat.add(key);
        this._queue = line;
        return;
      }
    }
  }

  /**
   * @param {number} dt
   * @param {boolean} busy  the player is mid-something; hold off entirely
   * @param {boolean} moving
   */
  update(dt, { busy = false, moving = false } = {}) {
    if (!this.enabled) return;
    this.elapsed += dt;
    this.cooldown -= dt;

    if (busy) {
      this.idle = 0;
      return;
    }
    this.idle = moving ? 0 : this.idle + dt;

    if (this.cooldown > 0 || this.hud.saying) return;

    // Anything queued by note() goes first -- it is a direct response.
    if (this._queue) {
      const line = this._queue;
      this._queue = null;
      this._speak(line);
      return;
    }

    // Time in the flat.
    for (const e of ELAPSED) {
      if (this.elapsed >= e.after && !this._elapsed.has(e.after)) {
        this._elapsed.add(e.after);
        this._speak(e.line);
        return;
      }
    }

    // Time of day, once each.
    const h = Math.floor(this.time.hour);
    for (const e of HOURS) {
      if (h === e.at && !this._hours.has(e.at)) {
        this._hours.add(e.at);
        this._speak(e.line);
        return;
      }
    }

    // Standing about.
    if (this.idle >= IDLE_AFTER && this._idlePool.length) {
      const i = (Math.random() * this._idlePool.length) | 0;
      this._speak(this._idlePool.splice(i, 1)[0]);
      this.idle = 0;
    }
  }

  _speak(line) {
    this.hud.say(`<em>${line}</em>`, 5200);
    // Occasionally he says something himself, under the narration.
    this.audio?.say('idle', { chance: 0.3, volume: 0.7, delay: 1.4 });
    this.cooldown = COOLDOWN;
  }
}
