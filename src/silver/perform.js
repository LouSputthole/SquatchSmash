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
   * @param {object} o { audio, room, band, hud, onNumber, onApplause }
   */
  constructor({ audio, room, band, onNumber, onApplause } = {}) {
    this.audio = audio;
    this.room = room;
    this.band = band;
    this.onNumber = onNumber;
    this.onApplause = onApplause;

    this.playing = false;
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

  _next(i) {
    this.index = i;
    this.t = 0;
    const n = SET[i];
    if (!n) { this.finish(); return; }
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
      let nextIndex = this.index + 1;
      if (this._requested) {
        const want = SET.findIndex((s) => s.id === this._requested);
        if (want >= 0 && want !== this.index) nextIndex = want;
        this._requested = null;
      }
      setTimeout(() => this._next(nextIndex % SET.length), 2400);
      this.index = -1;
      this.t = 0;
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
    this.beat = 0;
    this.t = 0;
    /** How wide the window is. Widened by the accessibility setting. */
    this.window = 0.26;
  }

  start(assist = false) {
    this.active = true;
    this.hits = 0;
    this.misses = 0;
    this.beat = 0;
    this.t = 0;
    this.window = assist ? 0.46 : 0.26;
  }

  /** 0..1 through the current beat. */
  get phase() { return (this.t % (60 / this.bpm)) / (60 / this.bpm); }

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

  press() {
    if (!this.active) return null;
    const off = Math.abs(this.phase - 0.5);
    const good = off <= this.window / 2;
    if (good) this.hits++; else this.misses++;
    this._flash = good ? 'hit' : 'miss';
    setTimeout(() => { this._flash = null; }, 220);
    this.beat++;
    if (this.beat >= this.beats) this.active = false;
    return good;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    // Miss the beat entirely and it counts against you, same as hitting late
    const beatsElapsed = Math.floor(this.t / (60 / this.bpm));
    if (beatsElapsed > this.beat) {
      this.misses++;
      this.beat = beatsElapsed;
      this._flash = 'miss';
      if (this.beat >= this.beats) this.active = false;
    }
  }

  /** 'good' | 'bad' */
  get result() { return this.hits >= Math.ceil(this.beats / 2) ? 'good' : 'bad'; }
}
