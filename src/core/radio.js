/**
 * The radio on the sideboard.
 *
 * One station: 97.8 THE SQUATCH. What is on depends on the in-game hour, and
 * it plays the roster's own records between its own shows -- which is what a
 * local station does, and what three separate frequencies made impossible.
 *
 * It airs in BLOCKS rather than lines: an exchange between the hosts, a
 * record, the commercial, or the community notice. [R] skips whichever is on.
 * Nothing talks over a record.
 *
 * Tracks are player-supplied: drop audio files into assets/music/ and list
 * them in assets/music/manifest.json. With none there it still works -- it
 * talks, which is most of what it does anyway.
 *
 * Everything goes through a PannerNode at the radio's position and a lowpass
 * filter, so it genuinely comes from across the room.
 */
import * as THREE from 'three';
import { STATIONS, showAt, voiceOf, MEETING_NOTICE } from './stations.js';
import { loadJson, assetUrl } from './assets.js';

const MUSIC_DIR = 'assets/music/';

/** How long a spoken segment sits on screen before the next one. */
const SEGMENT_TIME = 8.5;
const SEGMENT_GAP = 1.4;

/* Records are played as a excerpt rather than end to end. A full track is
 * three or four minutes of an eighteen-minute game, which is most of a
 * playthrough spent on one song, and the station stops being a station. */
const SONG_SECONDS = 30;
const SONG_FADE_IN = 2.0;
const SONG_FADE_OUT = 3.5;
/* Where in the track to start. A fifth in usually clears the intro and lands
 * somewhere with words on it. */
const SONG_START_FRAC = 0.20;

export class Radio {
  constructor(audio, hud, time) {
    this.audio = audio;
    this.hud = hud;
    this.time = time;
    this.tracks = [];
    /** Each station keeps its own place in its own playlist. */
    this.index = new Map();
    this.on = false;
    this.el = null;
    this.source = null;
    this.position = new THREE.Vector3();

    this.stations = STATIONS;
    this.stationIndex = 0;

    // Talk playback state.
    this._queue = [];
    this._line = null;
    this._segT = 0;
    /** How long the line on air runs -- the clip's own length once it has one. */
    this._dwell = SEGMENT_TIME;
    this._voice = null;
    /** Position in the running order. */
    this._cycle = 0;
    /** Blocks aired since tuning in, so the notice can hold off at first. */
    this._blocks = 0;
    /** Seconds into the record on air, or -1 when none is. */
    this._songT = -1;
    this._show = null;
  }

  get station() { return this.stations[this.stationIndex]; }

  /** Every record the station owns. There is one station, so: all of them. */
  get playlist() { return this.tracks; }

  /** True while a record is on air, so nothing talks over it. */
  get songPlaying() { return this._songT >= 0; }

  /** Where this station had got to. */
  get cursor() { return this.index.get(this.station.id) || 0; }
  set cursor(v) { this.index.set(this.station.id, v); }

  async loadManifest() {
    const data = await loadJson(MUSIC_DIR, 'manifest.json');
    this.tracks = data?.tracks || [];
    return this.tracks.length;
  }

  setPosition(v) {
    this.position.copy(v);
  }

  /** Build the audio graph lazily -- it needs a running AudioContext. */
  _ensureGraph() {
    if (this.el || !this.audio.ready) return;
    const ctx = this.audio.ctx;

    this.el = new Audio();
    this.el.crossOrigin = 'anonymous';
    this.el.preload = 'auto';
    this.el.volume = 1;
    this.el.addEventListener('ended', () => this.next(true));
    this.el.addEventListener('error', () => {
      if (this.on && this.playlist.length) {
        this.hud.toast(`Could not play ${this._current()?.title || 'track'}`, 'bad');
        this.next(true);
      }
    });

    this.source = ctx.createMediaElementSource(this.el);

    // Small speakers in a big room: roll off the low end and the very top.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 6200;
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 150;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    this.panner = ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 3.2;
    this.panner.maxDistance = 30;
    this.panner.rolloffFactor = 1.1;
    this._applyPannerPosition();

    this.source.connect(this.hp);
    this.hp.connect(this.tone);
    this.tone.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.connect(this.audio.busMusic);
  }

  _applyPannerPosition() {
    if (!this.panner) return;
    const p = this.position;
    if (this.panner.positionX) {
      this.panner.positionX.value = p.x;
      this.panner.positionY.value = p.y;
      this.panner.positionZ.value = p.z;
    } else {
      this.panner.setPosition(p.x, p.y, p.z);
    }
  }

  _current() {
    const list = this.playlist;
    return list[this.cursor % Math.max(1, list.length)] || null;
  }

  /* ---------------------------------------------------------------- */
  /* Power and tuning                                                  */
  /* ---------------------------------------------------------------- */

  toggle() {
    this.on ? this.turnOff() : this.turnOn();
  }

  turnOn() {
    this.audio.play('radio.click', { position: this.position, volume: 0.8 });
    this._ensureGraph();
    this.on = true;
    this._tuneIn(true);
  }

  turnOff() {
    this.audio.play('radio.click', { position: this.position, volume: 0.8 });
    this.on = false;
    this._stopBeds();
    if (this.el) {
      this._fadeTo(0, 0.25);
      setTimeout(() => {
        if (!this.on) this.el.pause();
      }, 300);
    }
    this.hud.setRadio(null);
  }

  /** Move to the next station on the dial. Turns the set on if it was off. */
  tune() {
    this.stationIndex = (this.stationIndex + 1) % this.stations.length;
    this.audio.play('radio.tune', { position: this.position, volume: 0.6 });
    if (!this.on) {
      this.turnOn();
      return;
    }
    this._stopBeds();
    this._tuneIn(true);
  }

  _stopBeds() {
    this.audio.stopLoop('radio.static', 0.25);
    this.audio.stopLoop('radio.talk', 0.3);
    try { this._voice?.stop(); } catch { /* already finished */ }
    this._voice = null;
    if (this.el) this._fadeTo(0, 0.2);
  }

  /** Start whatever the current station is doing right now. */
  _tuneIn(announce) {
    const st = this.station;
    this._queue = [];
    this._line = null;
    this._segT = 0;
    this._cycle = 0;
    this._songT = -1;
    this._blocks = 0;

    if (this.el) this.el.pause();
    // A murmuring voice bed under the words, so the room is not silent.
    this.audio.startLoop('radio.talk', {
      volume: 0.055, position: this.position, ref: 2.6, maxDist: 20,
    });
    this._show = null;
    this._pump();
    if (announce) {
      this.audio.play(st.ident, { position: this.position, volume: 0.55 });
    }
    return;
  }

  /**
   * [R]: skip the block that is on.
   *
   * Mid-record that means fade it out and move on; mid-exchange it means drop
   * the rest of the bit rather than nudge one line forward, because skipping
   * into the punchline of something you did not hear the setup of is worse
   * than skipping the whole thing.
   */
  next(auto = false) {
    if (!auto) this.audio.play('radio.tune', { position: this.position, volume: 0.5 });
    if (this.songPlaying) {
      this._endSong(auto ? SONG_FADE_OUT : 0.4);
      return;
    }
    this._queue.length = 0;
    this._segT = this._dwell;      // next block on the following frame
  }

  /* ---------------------------------------------------------------- */
  /* Talk                                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Queue the next BLOCK.
   *
   * A block is a whole thing rather than a line: an exchange between the
   * hosts, a record, the commercial, or the community notice. Picking single
   * lines out of a bag is why the station never sounded like a conversation --
   * two hosts and no exchange between them. [R] skips a block, so it moves
   * you past the rest of the bit rather than one line further into it.
   */
  _refill() {
    const st = this.station;
    const show = showAt(st, this.time ? this.time.hour : 9);
    if (show !== this._show) {
      this._show = show;
      this._queue.push({ line: `ANNOUNCER: Next on 97.8 The Squatch \u2014 ${show.name}. ${show.strap}`, cue: 'radio.jingle' });
      return;
    }

    /* An explicit rotation rather than three independent counters.
     *
     * Counters were the bug: songEvery counted BLOCKS, and an ident or a
     * one-line exchange is a block, so you reliably got one line and then a
     * record. This is the running order written down -- talk, link, song,
     * talk, link, song -- with the ad and the notice folded in at fixed
     * points, so a show is always a proper stretch of show and a record is
     * always introduced.
     */
    const CYCLE = [
      'talk', 'link', 'song',
      'talk', 'talk', 'link', 'song',
      'talk', 'ad',
      'talk', 'link', 'song',
      'talk', 'talk', 'link', 'song',
      'talk', 'notice',
    ];
    const noMusic = !this.playlist.length;

    for (let guard = 0; guard < CYCLE.length * 2; guard++) {
      const slot = CYCLE[this._cycle % CYCLE.length];
      this._cycle++;

      if (slot === 'song') {
        if (noMusic) continue;               // no records: straight to more talk
        this._queue.push({ song: true });
        return;
      }
      if (slot === 'link') {
        // The station saying its own name, between a record and a show.
        this._queue.push({ line: pick(st.lines), cue: null });
        return;
      }
      if (slot === 'ad') {
        this._queue.push(...st.commercial);
        this.audio.say?.('radio.ad', { chance: 0.4, delay: 6 });
        return;
      }
      if (slot === 'notice') {
        // Still holds off at the very start of a listen.
        if (!st.notices || this._blocks < (st.noticeAfter ?? 5)) continue;
        this._queue.push(...MEETING_NOTICE);
        return;
      }
      // talk: a whole exchange, which is the point of the whole rewrite.
      for (const line of pick(show.exchanges)) this._queue.push({ line, cue: null });
      return;
    }
  }

  /** Move the next segment on air. */
  _pump() {
    if (!this._queue.length) this._refill();
    const s = this._queue.shift();
    if (!s) return;
    this._blocks++;
    if (s.song) { this._startSong(); return; }
    this._line = s.line;
    this._segT = 0;
    // Hearing it counts as knowing it.
    if (s.notice) this.onNotice?.();
    if (s.cue) this.audio.play(s.cue, { position: this.position, volume: 0.5 });

    // The hosts are recorded now, so hold a line on air for exactly as long as
    // it takes to say. Anything without a clip -- the dynamically composed
    // "next on" links -- falls back to reading time.
    // Whoever was talking stops when the next segment starts, or skipping with
    // [R] leaves two hosts talking over each other.
    try { this._voice?.stop(); } catch { /* already finished */ }
    const v = voiceOf(s.line);
    /* Louder, and audible from further off. The schedule was always running --
     * exchanges, songs, ads, all of it -- but a host at 0.68 through the
     * default 1.4m rolloff is a murmur by the time you are at the fridge, so
     * from anywhere but the sideboard the station read as dead air. */
    this._voice = v ? this.audio.play(v.cue, {
      position: this.position, volume: 1.0, ref: 3.4, maxDist: 26,
    }) : null;
    this._dwell = this._voice?.buffer
      ? this._voice.buffer.duration + SEGMENT_GAP
      : (s.line && s.line.length > 90 ? SEGMENT_TIME + 2.5 : SEGMENT_TIME);
    this._showOsd();
  }

  _showOsd() {
    const st = this.station;
    const show = this._show ? this._show.name : null;
    this.hud.setRadio({
      station: show ? `${st.dial} \u2014 ${show}` : st.name,
      track: this._line || st.tagline,
    });
  }

  /* ---------------------------------------------------------------- */
  /* Records                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Put a record on: thirty seconds from a fifth of the way in, faded up and
   * out, with the talk bed pulled down under it.
   */
  _startSong() {
    const list = this.playlist;
    if (!list.length) { this._songT = -1; this._pump(); return; }
    this.cursor = (this.cursor + 1) % list.length;
    const track = this._current();
    if (!track) { this._songT = -1; this._pump(); return; }

    this._ensureGraph();
    if (!this.el) { this._songT = -1; this._pump(); return; }

    this.el.src = assetUrl(MUSIC_DIR, track.file);
    /* Seeking has to wait for metadata, and a track that never loads must not
     * strand the station on a silent block -- the timer runs either way and
     * the song ends on schedule whether or not it ever started. */
    const seek = () => {
      const d = this.el.duration;
      if (Number.isFinite(d) && d > SONG_SECONDS + 4) {
        try { this.el.currentTime = d * (track.start ?? SONG_START_FRAC); } catch { /* not seekable */ }
      }
    };
    if (this.el.readyState >= 1) seek();
    else this.el.addEventListener('loadedmetadata', seek, { once: true });

    /* A cut is comic timing, so it is never allowed to be late. The frame loop
     * does the cutting, but rAF throttles to about 1fps in a background tab
     * while the audio keeps rolling -- so the element's own clock gets a say
     * too. Whichever notices first wins; _cutSong is idempotent. */
    if (track.cutAt) {
      const watch = () => {
        if (this._songT < 0 || this._current() !== track) {
          this.el.removeEventListener('timeupdate', watch);
          return;
        }
        if (this.el.currentTime >= track.cutAt) {
          this.el.removeEventListener('timeupdate', watch);
          this._cutSong();
        }
      };
      this.el.addEventListener('timeupdate', watch);
    }

    const p = this.el.play();
    if (p && p.catch) p.catch(() => { /* the error handler covers it */ });
    this._fadeTo(0.85, SONG_FADE_IN);
    // The murmuring talk bed would sit under the music otherwise.
    this.audio.setLoopVolume?.('radio.talk', 0.006, 0.6);

    this._songT = 0;
    this._line = `${track.artist ? `${track.artist} \u2014 ` : ''}${track.title || track.file}`;
    this._showOsd();
  }

  /**
   * Kill the record mid-bar and go straight to the meeting notice.
   *
   * Not a fade. The element is paused and the gain cut on the same tick as the
   * static, so the join is a hard edit -- a station stepping on its own record
   * because the notice matters more than the song does.
   */
  _cutSong() {
    if (this._songT < 0) return;   // the frame loop and the media clock can both land on this tick
    this._songT = -1;
    if (this.el) {
      try { this.el.pause(); } catch { /* already stopped */ }
      this._fadeTo(0, 0);
    }
    this.audio.play('radio.cut', { position: this.position, volume: 0.75 });
    this.audio.setLoopVolume?.('radio.talk', 0.04, 0.8);

    // Jump the queue: whatever the station was going to say next waits.
    this._queue.unshift(...MEETING_NOTICE);
    this._line = null;
    this._segT = 0;
    this._dwell = 0;
    this._pump();
  }

  _endSong(fade = SONG_FADE_OUT) {
    if (this._songT < 0) return;
    this._songT = -1;
    this._fadeTo(0, fade);
    const el = this.el;
    setTimeout(() => { if (!this.songPlaying && el) el.pause(); }, fade * 1000 + 120);
    this.audio.setLoopVolume?.('radio.talk', 0.04, 1.2);
    this._line = null;
    this._segT = 0;
    /* The gap is measured from the moment the record is actually GONE, not
     * from the moment the fade starts -- otherwise a host opens his mouth
     * two seconds into a still-audible outro, which is exactly the thing
     * the running order exists to prevent. */
    this._dwell = SEGMENT_GAP + fade;
    this._showOsd();
  }

  /** Called once a frame by main.js. */
  update(dt) {
    if (!this.on) return;

    /* While a record is on, the station is the record. No lines, no ad, no
     * notice -- the queue simply waits. */
    if (this.songPlaying) {
      this._songT += dt;
      // A track with `cutAt` is not faded out, it is interrupted. Timed off the
      // element's own clock rather than accumulated frame time, because "the
      // 15 second mark" has to mean the recording's 15 second mark exactly and
      // summed dt drifts.
      const cut = this._current()?.cutAt;
      if (cut && this.el && this.el.currentTime >= cut) { this._cutSong(); return; }
      if (this._songT >= SONG_SECONDS - SONG_FADE_OUT) this._endSong();
      return;
    }

    this._segT += dt;
    const dwell = this._dwell ?? SEGMENT_TIME;
    if (this._segT >= dwell) {
      // A beat of nothing between segments, so it does not read as a wall.
      if (this._line !== null) {
        this._line = null;
        this._segT = dwell - SEGMENT_GAP;
        this._showOsd();
        return;
      }
      this._pump();
    }
  }

  /* ---------------------------------------------------------------- */


  _fadeTo(v, time) {
    if (!this.gain) return;
    const t = this.audio.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
    this.gain.gain.linearRampToValueAtTime(Math.max(0.0001, v), t + time);
  }

  /** Muffle further when the player is heads-down in the game. */
  setFocusMuffle(on) {
    if (!this.tone) return;
    this.tone.frequency.linearRampToValueAtTime(
      on ? 1400 : 6200,
      this.audio.ctx.currentTime + 0.4,
    );
    this.audio.setLoopVolume('radio.talk', on ? 0.018 : 0.04, 0.4);
  }
}

/**
 * A shuffle bag per list: every line airs once before any line airs twice.
 * Plain random re-picks far sooner than you would think, and on a station you
 * leave on for twenty minutes that reads as a much shorter script than it is.
 * The reshuffle avoids putting the old last line first, so the seam is quiet.
 */
const _bags = new WeakMap();
function pick(arr) {
  if (!arr || !arr.length) return '';
  if (arr.length < 2) return arr[0];
  let bag = _bags.get(arr);
  if (!bag || !bag.length) {
    bag = arr.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag[bag.length - 1] === _last.get(arr) && bag.length > 1) {
      [bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]];
    }
    _bags.set(arr, bag);
  }
  const v = bag.pop();
  _last.set(arr, v);
  return v;
}
const _last = new WeakMap();
