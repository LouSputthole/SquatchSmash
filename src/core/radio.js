/**
 * The radio on the sideboard.
 *
 * Two stations, tuned by holding the interact key on the set:
 *
 *   97.8 THE SQUATCH        talk radio; what is on depends on the in-game
 *                           hour, and the 60-second station commercial comes
 *                           round every few segments
 *   98.8 UNCLE SQUATCH      beats
 *   101.7 KSQCH             the roster's own records
 *
 * Tracks are player-supplied: drop audio files into assets/music/ and list
 * them in assets/music/manifest.json, each tagged with the station it belongs
 * to. A music station with no tracks still works -- it hisses and tells you
 * why, which is both a fair result and an obvious hint.
 *
 * Everything goes through a PannerNode at the radio's position and a lowpass
 * filter, so it genuinely comes from across the room.
 */
import * as THREE from 'three';
import { STATIONS, showAt, voiceOf, MEETING_NOTICE, NOTICE_EVERY } from './stations.js';
import { loadJson, assetUrl } from './assets.js';

const MUSIC_DIR = 'assets/music/';

/** How long a spoken segment sits on screen before the next one. */
const SEGMENT_TIME = 8.5;
const SEGMENT_GAP = 1.4;

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
    this._sinceAd = 0;
    this._sinceNotice = 4;   // one lands reasonably early in the morning
    this._show = null;
  }

  get station() { return this.stations[this.stationIndex]; }

  /** The current station's records, in manifest order. */
  get playlist() {
    const st = this.station;
    if (st.kind !== 'music') return [];
    // An untagged track belongs to whichever music station comes first, so a
    // one-station manifest keeps working without anyone editing it.
    const fallback = this.stations.find((s) => s.kind === 'music')?.id;
    return this.tracks.filter((t) => (t.station || fallback) === st.id);
  }

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
    this.panner.refDistance = 1.6;
    this.panner.maxDistance = 22;
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
    this._sinceAd = 99;   // an ident lands as soon as you tune in

    if (st.kind === 'talk') {
      if (this.el) this.el.pause();
      // A murmuring voice bed under the words, so the room is not silent.
      this.audio.startLoop('radio.talk', {
        volume: 0.04, position: this.position, ref: 1.4, maxDist: 12,
      });
      this._show = null;
      this._pump();
      if (announce) {
        this.audio.play(st.ident, { position: this.position, volume: 0.55 });
      }
      return;
    }

    // Music station.
    if (!this.playlist.length) {
      this.audio.startLoop('radio.static', {
        volume: 0.09, position: this.position, ref: 1.4, maxDist: 12,
      });
      this._queue = st.empty.map((line) => ({ line, cue: null }));
      this._pump();
      this.hud.say('Static. <em>Drop MP3s into assets/music/ and list them in manifest.json.</em>', 6000);
      return;
    }
    if (announce) this.audio.play(st.ident, { position: this.position, volume: 0.6 });
    this._queue = [{ line: st.lines[0], cue: null }];
    this._pump();
    this._playCurrent(0.35);
  }

  /** [R]: next track on a music station, next segment on a talk one. */
  next(auto = false) {
    const st = this.station;
    if (st.kind === 'talk') {
      this._segT = this._dwell;    // force the next line on the following frame
      return;
    }
    const list = this.playlist;
    if (!list.length) return;
    this.cursor = (this.cursor + 1) % list.length;
    if (!auto) this.audio.play('radio.tune', { position: this.position, volume: 0.5 });
    if (this.on) {
      this._playCurrent(auto ? 0.2 : 0.3);
      if (Math.random() < 0.4) {
        this._queue.push({ line: pick(st.lines), cue: null });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Talk                                                              */
  /* ---------------------------------------------------------------- */

  /** Refill the segment queue from whatever is scheduled at this hour. */
  _refill() {
    const st = this.station;
    if (st.kind !== 'talk') {
      this._queue.push({ line: pick(st.lines), cue: null });
      return;
    }

    const show = showAt(st, this.time ? this.time.hour : 9);
    if (show !== this._show) {
      // A show change is worth hearing about.
      this._show = show;
      this._queue.push({ line: `ANNOUNCER: Next on 97.8 The Squatch — ${show.name}. ${show.strap}`, cue: 'radio.jingle' });
      this._sinceAd = 0;
      return;
    }

    // The community notice takes priority over the commercial, and resets it
    // so you never get both back to back.
    if (st.notices && this._sinceNotice >= NOTICE_EVERY) {
      this._sinceNotice = 0;
      this._sinceAd = 0;
      this._queue.push(...MEETING_NOTICE);
      return;
    }

    if (this._sinceAd >= st.commercialEvery) {
      this._sinceAd = 0;
      this._queue.push(...st.commercial);
      // You have heard this one enough times to have an opinion on it.
      this.audio.say?.('radio.ad', { chance: 0.5, delay: 6 });
      return;
    }

    this._sinceAd++;
    this._sinceNotice++;
    this._queue.push({ line: pick(show.lines), cue: null });
  }

  /** Move the next segment on air. */
  _pump() {
    if (!this._queue.length) this._refill();
    const s = this._queue.shift();
    if (!s) return;
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
    this._voice = v ? this.audio.play(v.cue, { position: this.position, volume: 0.68 }) : null;
    this._dwell = this._voice?.buffer
      ? this._voice.buffer.duration + SEGMENT_GAP
      : (s.line && s.line.length > 90 ? SEGMENT_TIME + 2.5 : SEGMENT_TIME);
    this._showOsd();
  }

  _showOsd() {
    const st = this.station;
    const show = st.kind === 'talk' && this._show ? this._show.name : null;
    const track = st.kind === 'music' && this.playlist.length ? this._current() : null;
    this.hud.setRadio({
      station: show ? `${st.dial} — ${show}` : st.name,
      track: this._line
        || (track ? `${track.artist ? track.artist + ' — ' : ''}${track.title || track.file}` : st.tagline),
    });
  }

  /** Called once a frame by main.js. */
  update(dt) {
    if (!this.on) return;
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

  _playCurrent(fade) {
    const track = this._current();
    if (!track) return;
    this._ensureGraph();
    this.el.src = assetUrl(MUSIC_DIR, track.file);
    const p = this.el.play();
    if (p && p.catch) p.catch(() => { /* browser refused; the error handler covers it */ });
    this._fadeTo(0.85, fade);
    this._showOsd();
    // Hearing your own band on the radio never entirely stops being a thing.
    this.audio.say?.('radio.song', { chance: 0.45, delay: 2.5 });
  }

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
