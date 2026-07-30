/**
 * The Midnight Pines.
 *
 * Seven of them, behind a curtain, until the house lights come down. What this
 * file owns is the set: which stems are playing, how loud the room is over
 * them, when the applause happens, and the fact that the third number is the
 * one — which three separate people tell you before it arrives, so that when it
 * does, it lands as a thing you were promised rather than a thing that occurred.
 *
 * The music is four stems rather than one bed, because ducking matters here.
 * A line of dialogue at this table has to come through a live band without the
 * band stopping being live, so the melody and the vocal drop and the rhythm and
 * the room do not. Turning the whole thing down would say "a cutscene is
 * happening", which is exactly what the mission is trying not to say.
 */

/** The set. `duck` is how much of the melody survives a line of dialogue. */
export const SET = [
  {
    id: 'opener',
    title: 'Small Hours',
    lead: 'the bandleader',
    say: 'Good evening. We are the Midnight Pines and we are contractually obliged to be here.',
    dur: 52,
    stems: { rhythm: 0.5, horns: 0.22, piano: 0.34, vocal: 0 },
  },
  {
    id: 'second',
    title: 'Ashland Line',
    lead: 'the singer',
    say: null,
    dur: 58,
    stems: { rhythm: 0.46, horns: 0.18, piano: 0.3, vocal: 0.34 },
  },
  {
    /* The one everybody warned you about. The horns are the whole point, and
     * she said one sentence about horns in a car nine blocks long. */
    id: 'third',
    title: 'Front and Center',
    lead: 'the bandleader',
    say: 'This one is for the table nobody had a table for.',
    dur: 74,
    stems: { rhythm: 0.55, horns: 0.5, piano: 0.3, vocal: 0.3 },
    theOne: true,
  },
  {
    id: 'slow',
    title: 'Two In The Morning',
    lead: 'the singer',
    say: null,
    dur: 66,
    stems: { rhythm: 0.34, horns: 0.1, piano: 0.4, vocal: 0.36 },
    slow: true,
  },
];

const STEMS = ['rhythm', 'horns', 'piano', 'vocal'];

export class Performance {
  /**
   * @param {object} o { audio, room, band, hud, onNumber, onApplause, onSetEnd }
   */
  constructor({ audio, room, band, onNumber, onApplause, onSetEnd } = {}) {
    this.audio = audio;
    this.room = room;
    this.band = band;
    this.onNumber = onNumber;
    this.onApplause = onApplause;
    this.onSetEnd = onSetEnd;

    this.playing = false;
    /** True once the last number has been played. A set is not a jukebox. */
    this.setEnded = false;
    this.index = -1;
    this.t = 0;
    this.curtain = 0;
    /** 0..1: how far the melody is pulled down for a line of dialogue. */
    this.duck = 0;
    this._duckTarget = 0;
    this._requested = null;
    this.numbersPlayed = [];
  }

  get current() { return this.index >= 0 ? SET[this.index] : null; }
  get onTheOne() { return !!this.current?.theOne; }

  /** The second cutscene calls this. Curtain, lights, and the first bar. */
  begin() {
    if (this.playing) return;
    this.playing = true;
    for (const m of this.band.members) m.group.visible = true;
    this.audio?.play('stage.clunk', { volume: 0.5 });
    this.audio?.play('curtain.draw', { volume: 0.45 });
    for (const s of STEMS) {
      this.audio?.startLoop(`band.${s}`, { volume: 0, ambience: true, fade: 0.5 });
    }
    this._next(0);
  }

  /**
   * Ask for a number. Used by the bandleader conversation: asking for the
   * horns moves the third number up rather than starting it immediately,
   * because a band that changes song mid-bar is a jukebox.
   */
  request(kind) {
    this._requested = kind === 'horns' ? 'third' : kind === 'slow' ? 'slow' : null;
    return this._requested;
  }

  /**
   * Which number is up.
   *
   * The requested one if it has not been played, otherwise the first one that
   * has not. Blindly taking index+1 and wrapping is what made the set a loop,
   * and a loop meant the third number came round again — with it the "this one
   * is the one" line, the callback, the toast, and another offer to dance.
   * Asking for the slow number also used to skip past the third for good;
   * playing the unplayed ones in order means every number happens once.
   */
  _queue() {
    const want = this._requested;
    this._requested = null;
    if (want) {
      const i = SET.findIndex((s) => s.id === want);
      if (i >= 0 && !this.numbersPlayed.includes(SET[i].id)) return i;
    }
    return SET.findIndex((s) => !this.numbersPlayed.includes(s.id));
  }

  _next(i) {
    this.index = i;
    this.t = 0;
    const n = SET[i];
    if (!n) { this.endSet(); return; }
    this.numbersPlayed.push(n.id);
    for (const s of STEMS) {
      this.audio?.setLoopVolume(`band.${s}`, n.stems[s], 1.4);
    }
    this.onNumber?.(n, i);
  }

  applaud(strength = 1) {
    this.audio?.play('applause', { volume: 0.3 * strength });
    this.audio?.startLoop('applause', { volume: 0.22 * strength, ambience: true, fade: 0.2 });
    setTimeout(() => this.audio?.stopLoop('applause', 1.8), 2600);
    this.onApplause?.(strength);
  }

  /**
   * Pull the melody down under a line. Rhythm and room stay where they are —
   * the band does not stop being a band because somebody is talking.
   */
  setDucked(on) { this._duckTarget = on ? 1 : 0; }

  finish() {
    this.playing = false;
    for (const s of STEMS) this.audio?.stopLoop(`band.${s}`, 2.2);
  }

  /**
   * Four numbers and they are done for the set.
   *
   * They do not vanish and the room does not go silent: the stems come down
   * over six seconds, the diners come back up, and what is left is a club
   * between sets — which is also the quietest the room gets all evening, and
   * the right place for the last conversation of the night to happen.
   */
  endSet() {
    if (this.setEnded) return;
    this.setEnded = true;
    this.playing = false;
    this.index = -1;
    this.t = 0;
    for (const s of STEMS) this.audio?.stopLoop(`band.${s}`, 6);
    this.onSetEnd?.(this.numbersPlayed.slice());
  }

  update(dt) {
    // The curtain, once, over about two and a half seconds
    if (this.playing && this.curtain < 1) {
      this.curtain = Math.min(1, this.curtain + dt / 2.5);
      this.room?.openStageCurtain(this.curtain);
    }
    if (!this.playing) return;

    const d = this._duckTarget - this.duck;
    if (Math.abs(d) > 0.001) {
      this.duck += d * Math.min(1, dt * 4);
      const n = this.current;
      if (n) {
        this.audio?.setLoopVolume('band.horns', n.stems.horns * (1 - this.duck * 0.62), 0.25);
        this.audio?.setLoopVolume('band.vocal', n.stems.vocal * (1 - this.duck * 0.8), 0.25);
        this.audio?.setLoopVolume('band.piano', n.stems.piano * (1 - this.duck * 0.3), 0.25);
      }
    }

    this.t += dt;
    const n = this.current;
    if (!n) return;

    // Musicians: the section moves, the leader works the front of the stage
    for (let i = 0; i < this.band.members.length; i++) {
      const m = this.band.members[i];
      if (m.holds === 'lead') continue;
      m.parts.armL.rotation.x = -1.1 + Math.sin(this.t * 3 + i) * 0.12;
      m.parts.armR.rotation.x = -1.1 + Math.sin(this.t * 3 + i + 1) * 0.12;
      m.parts.body.rotation.z = Math.sin(this.t * 1.9 + i) * 0.05;
    }

    if (this.t >= n.dur) {
      this.applaud(n.theOne ? 1.3 : 1);
      /* A request moves the queue rather than interrupting: whatever is
       * playing finishes, and the next thing up is what was asked for. */
      const nextIndex = this._queue();
      this.index = -1;
      this.t = 0;
      if (nextIndex < 0) { setTimeout(() => this.endSet(), 2400); return; }
      setTimeout(() => this._next(nextIndex), 2400);
    }
  }
}

/**
 * The optional dance.
 *
 * Deliberately not a partner dance. Nothing in this animation library can hold
 * two figures in contact without them sliding through each other, and a bad
 * one would undo every careful thing in the twenty minutes before it. What
 * this is instead: standing up, going six feet, and staying roughly on the
 * beat for four bars, which is what most people at a supper club are actually
 * doing.
 *
 * Four prompts, on the beat, using the existing timing bar.
 */
export class Sway {
  constructor({ bpm = 118, beats = 4 } = {}) {
    this.bpm = bpm;
    this.beats = beats;
    this.active = false;
    this.hits = 0;
    this.misses = 0;
    /** How many of the four beats have been judged, one way or the other. */
    this.beat = 0;
    this.t = 0;
    /** How wide the window is. Widened by the accessibility setting. */
    this.window = 0.26;
    /** Which beat indices have already been judged. One each, and no more. */
    this._judged = new Set();
    this._flash = null;
  }

  start(assist = false) {
    this.active = true;
    this.hits = 0;
    this.misses = 0;
    this.beat = 0;
    this.t = 0;
    this._judged = new Set();
    this._flash = null;
    this.window = assist ? 0.46 : 0.26;
  }

  get beatLength() { return 60 / this.bpm; }

  /** 0..1 through the current beat. */
  get phase() { return (this.t % this.beatLength) / this.beatLength; }

  /** Which of the four beats the bar is passing through right now. */
  get index() { return Math.floor(this.t / this.beatLength); }

  /** For hud.setTiming(). */
  get view() {
    if (!this.active) return null;
    return {
      pos: this.phase,
      from: (0.5 - this.window / 2).toFixed(3),
      to: (0.5 + this.window / 2).toFixed(3),
      hits: this.hits,
      total: this.beats,
      flash: this._flash,
    };
  }

  /**
   * One judgement per beat.
   *
   * Without the gate this was not a rhythm game, it was a button: four presses
   * inside the first beat scored four hits and the dance was over before the
   * bar was. Pressing again in a beat you have already played is not a miss
   * either — it is nothing, the same way a second hold on a man you have
   * already tipped is nothing. Fumbling the button should not cost points.
   *
   * @returns {boolean|null} whether it landed, or null if there was nothing to
   *   judge (not running, or this beat is already played)
   */
  press() {
    if (!this.active) return null;
    const i = this.index;
    if (i >= this.beats || this._judged.has(i)) return null;
    this._judged.add(i);
    const off = Math.abs(this.phase - 0.5);
    const good = off <= this.window / 2;
    if (good) this.hits++; else this.misses++;
    this._flash = good ? 'hit' : 'miss';
    setTimeout(() => { this._flash = null; }, 220);
    this.beat = this._judged.size;
    if (this.beat >= this.beats) this.active = false;
    return good;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    // Miss the beat entirely and it counts against you, same as hitting late
    const gone = Math.min(this.index, this.beats);
    for (let i = 0; i < gone; i++) {
      if (this._judged.has(i)) continue;
      this._judged.add(i);
      this.misses++;
      this._flash = 'miss';
    }
    this.beat = this._judged.size;
    if (this.beat >= this.beats) this.active = false;
  }

  /** 'good' | 'bad' */
  get result() { return this.hits >= Math.ceil(this.beats / 2) ? 'good' : 'bad'; }
}
