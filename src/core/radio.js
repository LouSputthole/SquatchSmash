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
// The vendored path rather than the bare specifier: tests/radio-tape.test.mjs
// runs this module under plain Node, where the page's importmap does not
// exist. In the browser both specifiers resolve to the same URL, so THREE
// stays a single instance.
import * as THREE from '../../vendor/three.module.min.js';
import {
  STATIONS,
  showAt,
  showIntroLine,
  voiceOf,
  MEETING_NOTICE,
} from './stations.js';
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
/* The authored cue gains already make this a small room radio. This is a
 * linear WebAudio gain, not a percentage in decibels: 0.07 would cut the
 * previously audible mix by 23 dB and make the bulletin vanish across room. */
const DEFAULT_VOLUME = 0.70;
const VOLUME_STEP = 0.07;
/** A connected phone call leaves 34% of the radio level: roughly 66% down. */
const PHONE_CALL_RADIO_SCALE = 0.34;

export class Radio {
  /**
   * @param {{ venue?: string, state?: object, canPlayNotice?: Function, fullSongs?: boolean }} options
   * `venue` is deliberately separate from the station: a record can belong
   * to the radio rotation without leaking into a different in-world music
   * system such as the Bada Bing DJ.
   */
  constructor(audio, hud, time, {
    venue = 'apartment',
    state = null,
    canPlayNotice = () => true,
    fullSongs = false,
  } = {}) {
    this.audio = audio;
    this.hud = hud;
    this.time = time;
    this.venue = venue;
    this.state = state;
    this.canPlayNotice = typeof canPlayNotice === 'function' ? canPlayNotice : () => true;
    /* Most receivers air short radio edits. Silver Pines is the deliberate
     * exception: it is a player-controlled cart stereo and plays a selected
     * song from its opening through the media element's natural `ended`
     * event. Other scenes keep their thirty-second pacing unchanged. */
    this.fullSongs = fullSongs === true;
    const saved = this.state?.load?.() ?? {};
    this.tracks = [];
    /** Each station keeps its own place in its own playlist. */
    this.index = new Map([['squatch', Number.isSafeInteger(saved.cursor) ? saved.cursor : 0]]);
    this.on = false;
    this.preferredOn = typeof saved.power === 'boolean' ? saved.power : true;
    // A small receiver across the room, not a nightclub PA. The physical
    // knob lets the player change this without changing the whole game mix.
    this.volume = Number.isFinite(saved.volume)
      ? THREE.MathUtils.clamp(saved.volume, 0, 1) : DEFAULT_VOLUME;
    this._phoneDucked = false;
    this._talkBase = 0.055;
    this._focusMuffled = false;
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
    this._cycle = Number.isSafeInteger(saved.cycle) ? saved.cycle : 0;
    this._selections = new Map(Object.entries(saved.selections ?? {}));
    this._songReactionCursor = Number.isSafeInteger(saved.songReactionCursor)
      ? saved.songReactionCursor : 0;
    this._adReactionCursor = Number.isSafeInteger(saved.adReactionCursor)
      ? saved.adReactionCursor : 0;
    /** Blocks aired since tuning in, so the notice can hold off at first. */
    this._blocks = 0;
    /** Seconds into the record on air, or -1 when none is. */
    this._songT = -1;
    this._track = null;
    this._show = null;
    this._broadcastT = 0;
    this._activeBroadcast = null;
    this._activeSegment = null;
    this._phase = 'gap';
    this._gapDuration = 0;
    this._paused = false;
    this._lastPersisted = JSON.stringify(this._snapshot());
  }

  get station() { return this.stations[this.stationIndex]; }
  get volumePercent() { return Math.round(this.volume * 100); }
  get phoneDucked() { return this._phoneDucked; }
  get mixScale() { return this._phoneDucked ? PHONE_CALL_RADIO_SCALE : 1; }

  /**
   * Every record this radio is allowed to air. Unscoped legacy tracks remain
   * available here; venue-scoped records must opt into this exact location.
   */
  get playlist() {
    return this.tracks.filter((track) => !track.venue || track.venue === this.venue);
  }

  /** True while a record is on air, so nothing talks over it. */
  get songPlaying() { return this._songT >= 0; }

  /** Where this station had got to. */
  get cursor() { return this.index.get(this.station.id) || 0; }
  set cursor(v) { this.index.set(this.station.id, v); }

  _snapshot() {
    return {
      volume: this.volume,
      cursor: this.cursor,
      cycle: this._cycle,
      selections: Object.fromEntries(this._selections ?? []),
      songReactionCursor: this._songReactionCursor ?? 0,
      adReactionCursor: this._adReactionCursor ?? 0,
      power: this.preferredOn,
    };
  }

  _persist() {
    if (!this.state?.save) return;
    const snapshot = this._snapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === this._lastPersisted) return;
    this.state.save(snapshot);
    this._lastPersisted = serialized;
  }

  hasHeardBulletin(id) {
    return this.state?.hasHeardBulletin?.(id) === true;
  }

  markBulletinHeard(id) {
    return this.state?.markBulletinHeard?.(id) ?? false;
  }

  async loadManifest() {
    const data = await loadJson(MUSIC_DIR, 'manifest.json');
    this.tracks = data?.tracks || [];
    return this.tracks.length;
  }

  /**
   * Exact recorded cues required by the station over a bounded time window.
   * Scene loaders can decode this set instead of blocking on the entire
   * 17-MiB radio archive. It is read-only and never advances the rotation.
   */
  preloadCueNames({ hours = null, startupOnly = false } = {}) {
    const requestedHours = Array.isArray(hours) && hours.length
      ? hours : [this.time?.hour ?? 9];
    const cues = new Set([
      'radio.click', 'radio.tune', 'radio.static', 'radio.talk',
      'radio.jingle', 'radio.cut',
    ]);
    if (!startupOnly) {
      for (let i = 1; i <= 6; i++) cues.add(`vo.radio.song.${i}`);
      for (let i = 1; i <= 4; i++) cues.add(`vo.radio.ad.${i}`);
    }
    const addLine = (line) => {
      const voice = voiceOf(line);
      if (voice?.cue) cues.add(voice.cue);
    };

    for (const station of this.stations) {
      if (station.ident) cues.add(station.ident);
      const shows = new Set(requestedHours.map((hour) => showAt(station, hour)).filter(Boolean));
      for (const show of shows) {
        addLine(showIntroLine(show));
        if (startupOnly) continue;
        for (const exchange of show.exchanges ?? []) {
          for (const line of exchange) addLine(line);
        }
      }
      if (startupOnly) continue;
      for (const segment of station.commercial ?? []) {
        if (segment.cue) cues.add(segment.cue);
        addLine(segment.line);
      }
      for (const line of station.lines ?? []) addLine(line);
      for (const tape of station.tapes ?? []) {
        if (tape.cue) cues.add(tape.cue);
        addLine(tape.intro);
        addLine(tape.outro);
      }
      if (station.notices && this.canPlayNotice()) {
        for (const segment of MEETING_NOTICE) {
          if (segment.cue) cues.add(segment.cue);
          addLine(segment.line);
        }
      }
    }
    return [...cues];
  }

  /**
   * Move the receiver.
   *
   * This has to push the new position into the live PannerNode, not just
   * remember it. The one-shot cues below all read `this.position` at the
   * moment they fire, so clicks, idents and station stings always came from
   * the right place — but the *music* runs through a persistent graph whose
   * panner was positioned once, in `_ensureGraph`, and never again. Power the
   * cart radio on at the tee and drive to the green and the song stayed at the
   * tee: measured on Hole 1, seventy-two metres behind the cart and directly
   * astern of it along its own heading. Which is precisely what the playtest
   * heard — "radio sounds are playing behind the golf cart".
   */
  setPosition(v) {
    this.position.copy(v);
    this._applyPannerPosition();
  }

  setVolume(value) {
    this.volume = THREE.MathUtils.clamp(value, 0, 1);
    if (this.gain && this._songT >= 0) this._fadeTo(this._level(0.85), 0.08);
    if (this._voice) this.audio.setPlaybackVolume?.(this._voice, this._level(1), 0.08);
    if (this.on && !this.songPlaying && this._broadcastT <= 0) {
      this._setTalkVolume(this._talkBase, 0.08);
    }
    this._persist();
    return this.volume;
  }

  adjustVolume(direction) {
    return this.setVolume(this.volume + Math.sign(direction || 0) * VOLUME_STEP);
  }

  _level(base) {
    return base * this.volume * this.mixScale;
  }

  _setTalkVolume(base, ramp = 0.3) {
    this._talkBase = base;
    this.audio.setLoopVolume?.('radio.talk', this._level(base), ramp);
  }

  /**
   * Duck only the in-world radio while a connected phone call owns the room.
   * The knob's actual volume never changes, so hang-up restores the exact
   * level the player selected rather than resetting it to a default.
   */
  setPhoneDucked(on) {
    const next = on === true;
    if (this._phoneDucked === next) return this.mixScale;
    this._phoneDucked = next;
    if (this.gain && this.songPlaying) this._fadeTo(this._level(0.85), 0.24);
    if (this._voice) this.audio.setPlaybackVolume?.(this._voice, this._level(1), 0.24);
    if (this.on && !this._paused) this._setTalkVolume(this._talkBase, 0.24);
    return this.mixScale;
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
        this.hud.toast(`Could not play ${this._track?.title || 'track'}`, 'bad');
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

  /**
   * Push `this.position` into the panner.
   *
   * Written straight to `.value` rather than ramped. A receiver bolted to a
   * golf cart moves a few centimetres a frame, so there is no step to smooth,
   * and the two places it *does* jump — staging the carts at a tee, parking
   * them in the lot — are cuts where a 25 ms glide would be an audible swoop
   * across the course rather than a fix. Direct assignment is also the only
   * form a caller can read back synchronously, which is what lets a verifier
   * assert that the music is coming out of the radio.
   */
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

  turnOn({ tuneIn = true, remember = true } = {}) {
    this.audio.play('radio.click', { position: this.position, volume: 0.8 });
    this._ensureGraph();
    this.on = true;
    this._paused = false;
    if (remember) {
      this.preferredOn = true;
      this._persist();
    }
    if (tuneIn) this._tuneIn(true);
  }

  turnOff({ remember = true } = {}) {
    this.audio.play('radio.click', { position: this.position, volume: 0.8 });
    this.on = false;
    this._paused = false;
    if (remember) {
      this.preferredOn = false;
      this._persist();
    }
    this._broadcastT = 0;
    this._activeBroadcast = null;
    this._stopBeds();
    if (this.el) {
      this._fadeTo(0, 0.25);
      setTimeout(() => {
        if (!this.on) this.el.pause();
      }, 300);
    }
    this.hud.setRadio(null);
  }

  /** Freeze this physical receiver without changing its saved power switch. */
  pause() {
    if (!this.on || this._paused) return;
    this._paused = true;
    this.audio.stopLoop('radio.static', 0.08);
    this.audio.stopLoop('radio.talk', 0.08);
    try { this._voice?.stop(); } catch { /* already finished */ }
    this._voice = null;
    if (this.el && this.songPlaying) this.el.pause();
    this.hud.setRadio(null);
  }

  /** Resume the same block after pause rather than advancing it off-screen. */
  resume() {
    if (!this.on || !this._paused) return;
    this._paused = false;
    this.audio.startLoop('radio.talk', {
      volume: this._level(this.songPlaying ? 0.006 : this._talkBase),
      position: this.position, ref: 2.6, maxDist: 20,
    });
    if (this.songPlaying && this.el) {
      const playing = this.el.play();
      if (playing?.catch) playing.catch(() => {});
      this._fadeTo(this._level(0.85), 0.2);
    } else if (this._activeBroadcast) {
      this._playBroadcast(this._activeBroadcast);
    } else if (this._activeSegment && this._phase === 'air') {
      this._segT = 0;
      this._playSegmentAudio(this._activeSegment);
    }
    this._showOsd();
  }

  /** Silence the running order while an imminent bulletin powers up. */
  prepareBroadcast() {
    if (!this.on) this.turnOn({ tuneIn: false });
    else this._stopBeds();
    this._songT = -1;
    this._track = null;
    this._line = null;
    // The frame loop must not pump a replacement host during the short delay.
    // broadcast() replaces this sentinel with the bulletin's real hold time.
    this._broadcastT = Number.POSITIVE_INFINITY;
    this._showOsd();
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
    this._songT = -1;
    this._track = null;
    this._blocks = 0;
    this._activeBroadcast = null;
    this._activeSegment = null;
    this._phase = 'gap';
    this._gapDuration = 0;

    if (this.el) this.el.pause();
    // A murmuring voice bed under the words, so the room is not silent.
    this._talkBase = 0.055;
    this.audio.startLoop('radio.talk', {
      volume: this._level(this._talkBase), position: this.position, ref: 2.6, maxDist: 20,
    });
    this._show = null;
    this._pump();
    if (announce) {
      this.audio.play(st.ident, { position: this.position, volume: this._level(0.55) });
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
    try { this._voice?.stop(); } catch { /* already finished */ }
    this._voice = null;
    this._activeSegment = null;
    this._line = null;
    this._phase = 'gap';
    this._gapDuration = 0;
    this._segT = 0;                // next block on the following frame
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
      this._queue.push({ line: showIntroLine(show), cue: 'radio.jingle' });
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
      'talk', 'tape',
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
        this._persist();
        return;
      }
      if (slot === 'link') {
        // The station saying its own name, between a record and a show.
        this._queue.push({ line: this._pick(`${st.id}:links`, st.lines), cue: null });
        this._persist();
        return;
      }
      if (slot === 'tape') {
        // Announcer in, the recording whole, announcer out.
        const tape = this._pick(`${st.id}:tapes`, st.tapes);
        if (!tape) continue;
        this._queue.push(
          { line: tape.intro, cue: 'radio.jingle' },
          { line: tape.title, clip: tape.cue },
          { line: tape.outro, cue: null },
        );
        this._persist();
        return;
      }
      if (slot === 'ad') {
        this._queue.push(...st.commercial, { reaction: 'ad' });
        this._persist();
        return;
      }
      if (slot === 'notice') {
        // Still holds off at the very start of a listen.
        if (!st.notices
          || !this._noticeEligible()
          || this._blocks < (st.noticeAfter ?? 5)) continue;
        this._queue.push(...MEETING_NOTICE.filter((segment) => !segment.bulletinId
          || !this.hasHeardBulletin(segment.bulletinId)));
        this._persist();
        return;
      }
      // talk: a whole exchange, which is the point of the whole rewrite.
      for (const line of this._pick(`${st.id}:show:${show.name}`, show.exchanges)) {
        this._queue.push({ line, cue: null });
      }
      this._persist();
      return;
    }
  }

  /** Deterministic coverage: every authored item airs before any repeats. */
  _pick(key, list) {
    if (!list?.length) return '';
    const cursor = Number.isSafeInteger(this._selections.get(key))
      ? this._selections.get(key) : 0;
    this._selections.set(key, cursor + 1);
    return list[cursor % list.length];
  }

  _noticeEligible() {
    return this.canPlayNotice()
      && MEETING_NOTICE.some((segment) => !segment.bulletinId
        || !this.hasHeardBulletin(segment.bulletinId));
  }

  /** Move the next segment on air. */
  _pump() {
    if (!this._queue.length) this._refill();
    const s = this._queue.shift();
    if (!s) return;
    this._blocks++;
    if (s.song) { this._startSong(); return; }
    if (s.reaction) {
      const isSong = s.reaction === 'song';
      const count = isSong ? 6 : 4;
      const cursorKey = isSong ? '_songReactionCursor' : '_adReactionCursor';
      const cue = `vo.radio.${s.reaction}.${(this[cursorKey] % count) + 1}`;
      this[cursorKey]++;
      this._activeSegment = { ...s, reactionCue: cue };
      this._line = null;
      this._segT = 0;
      this._phase = 'air';
      this._playSegmentAudio(this._activeSegment);
      this._persist();
      this._showOsd();
      return;
    }
    this._activeSegment = s;
    this._line = s.line;
    this._segT = 0;
    this._phase = 'air';
    // Hearing it counts as knowing it.
    if (s.notice) {
      if (s.bulletinId) this.markBulletinHeard(s.bulletinId);
      this.onNotice?.();
    }
    this._playSegmentAudio(s);

    this._showOsd();
  }

  _playSegmentAudio(s) {
    if (s.reactionCue) {
      this._voice = this.audio.play(s.reactionCue, {
        position: this.position, volume: this._level(1), ref: 3.4, maxDist: 26,
      });
      this._dwell = this._voice?.buffer?.duration ?? 2.2;
      return;
    }
    if (s.cue) this.audio.play(s.cue, { position: this.position, volume: this._level(0.5) });

    // The hosts are recorded now, so hold a line on air for exactly as long as
    // it takes to say. Anything without a clip -- the dynamically composed
    // "next on" links -- falls back to reading time.
    // Whoever was talking stops when the next segment starts, or skipping with
    // [R] leaves two hosts talking over each other.
    try { this._voice?.stop(); } catch { /* already finished */ }
    /* A tape names its own recording. Everything else is a written line, and
     * the clip for it is looked up from the text. Either way the block runs
     * for the length of the audio, so a 34-second tape is not talked over at
     * eight and a half. */
    const v = s.clip ? { cue: s.clip } : voiceOf(s.line);
    /* Louder, and audible from further off. The schedule was always running --
     * exchanges, songs, ads, all of it -- but a host at 0.68 through the
     * default 1.4m rolloff is a murmur by the time you are at the fridge, so
     * from anywhere but the sideboard the station read as dead air. */
    this._voice = v ? this.audio.play(v.cue, {
      position: this.position, volume: this._level(1), ref: 3.4, maxDist: 26,
    }) : null;
    this._dwell = this._voice?.buffer
      ? this._voice.buffer.duration
      : (s.line && s.line.length > 90 ? SEGMENT_TIME + 2.5 : SEGMENT_TIME);
  }

  _showOsd() {
    const st = this.station;
    const show = this._show ? this._show.name : null;
    this.hud.setRadio({
      station: show ? `${st.dial} \u2014 ${show}` : st.name,
      track: this._line || st.tagline,
    });
  }

  /** Put an urgent bulletin ahead of the ordinary running order. */
  broadcast({ cue, line }) {
    // Power up without starting a random host line that the bulletin would
    // interrupt a moment later.
    if (!this.on) this.turnOn({ tuneIn: false });
    this._ensureGraph();
    this._stopBeds();
    this._activeBroadcast = { cue, line };
    this._playBroadcast(this._activeBroadcast);
    return this._broadcastT;
  }

  _playBroadcast({ cue, line }) {
    this._line = line;
    this._showOsd();
    this._voice = cue ? this.audio.play(cue, {
      position: this.position, volume: this._level(1), ref: 3.4, maxDist: 26,
    }) : null;
    this._broadcastT = this._voice?.buffer
      ? this._voice.buffer.duration + SEGMENT_GAP
      : SEGMENT_TIME;
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
    const track = this._current();
    if (!track) { this._songT = -1; this._pump(); return; }
    this.cursor = (this.cursor + 1) % list.length;
    this._track = track;
    this._persist();

    this._ensureGraph();
    if (!this.el) { this._songT = -1; this._pump(); return; }

    this.el.src = assetUrl(MUSIC_DIR, track.file);
    /* Seeking has to wait for metadata, and a track that never loads must not
     * strand the station on a silent block -- the timer runs either way and
     * the song ends on schedule whether or not it ever started. */
    const seek = () => {
      const d = this.el.duration;
      if (Number.isFinite(d) && d > SONG_SECONDS + 4) {
        const start = track.start ?? (this.fullSongs ? 0 : SONG_START_FRAC);
        try { this.el.currentTime = d * start; } catch { /* not seekable */ }
      }
    };
    if (this.el.readyState >= 1) seek();
    else this.el.addEventListener('loadedmetadata', seek, { once: true });

    /* A cut is comic timing, so it is never allowed to be late. The frame loop
     * does the cutting, but rAF throttles to about 1fps in a background tab
     * while the audio keeps rolling -- so the element's own clock gets a say
     * too. Whichever notices first wins; _cutSong is idempotent. */
    if (track.cutAt && this._noticeEligible()) {
      const watch = () => {
        if (this._songT < 0 || this._track !== track) {
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
    this._fadeTo(this._level(0.85), SONG_FADE_IN);
    // The murmuring talk bed would sit under the music otherwise.
    this._setTalkVolume(0.006, 0.6);

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
    if (!this._noticeEligible()) return;
    this._songT = -1;
    this._track = null;
    if (this.el) {
      try { this.el.pause(); } catch { /* already stopped */ }
      this._fadeTo(0, 0);
    }
    this.audio.play('radio.cut', { position: this.position, volume: this._level(0.75) });
    this._setTalkVolume(0.04, 0.8);

    // Jump the queue: whatever the station was going to say next waits.
    this._queue.unshift(...MEETING_NOTICE.filter((segment) => !segment.bulletinId
      || !this.hasHeardBulletin(segment.bulletinId)));
    this._line = null;
    this._segT = 0;
    this._dwell = 0;
    this._pump();
  }

  _endSong(fade = SONG_FADE_OUT) {
    if (this._songT < 0) return;
    this._songT = -1;
    this._track = null;
    this._fadeTo(0, fade);
    const el = this.el;
    setTimeout(() => { if (!this.songPlaying && el) el.pause(); }, fade * 1000 + 120);
    this._setTalkVolume(0.04, 1.2);
    this._line = null;
    this._segT = 0;
    this._activeSegment = null;
    /* The gap is measured from the moment the record is actually GONE, not
     * from the moment the fade starts -- otherwise a host opens his mouth
     * two seconds into a still-audible outro, which is exactly the thing
     * the running order exists to prevent. */
    this._phase = 'gap';
    this._gapDuration = SEGMENT_GAP + fade;
    this._queue.unshift({ reaction: 'song' });
    this._showOsd();
  }

  /** Called once a frame by main.js. */
  update(dt) {
    if (!this.on || this._paused) return;

    if (this._broadcastT > 0) {
      this._broadcastT -= dt;
      if (this._broadcastT <= 0 && this.on) this._tuneIn(false);
      return;
    }

    /* While a record is on, the station is the record. No lines, no ad, no
     * notice -- the queue simply waits. */
    if (this.songPlaying) {
      this._songT += dt;
      // A track with `cutAt` is not faded out, it is interrupted. Timed off the
      // element's own clock rather than accumulated frame time, because "the
      // 15 second mark" has to mean the recording's 15 second mark exactly and
      // summed dt drifts.
      const cut = this._noticeEligible() ? this._track?.cutAt : null;
      if (cut && this.el && this.el.currentTime >= cut) { this._cutSong(); return; }
      if (!this.fullSongs && this._songT >= SONG_SECONDS - SONG_FADE_OUT) this._endSong();
      return;
    }

    this._segT += dt;
    if (this._phase === 'air') {
      const dwell = this._dwell ?? SEGMENT_TIME;
      if (this._segT >= dwell) {
        this._line = null;
        this._activeSegment = null;
        this._phase = 'gap';
        this._gapDuration = SEGMENT_GAP;
        this._segT = 0;
        this._showOsd();
      }
      return;
    }
    if (this._segT >= this._gapDuration) this._pump();
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
    this._focusMuffled = on;
    if (!this.tone) return;
    this.tone.frequency.linearRampToValueAtTime(
      on ? 1400 : 6200,
      this.audio.ctx.currentTime + 0.4,
    );
    this._setTalkVolume(on ? 0.018 : 0.04, 0.4);
  }
}
