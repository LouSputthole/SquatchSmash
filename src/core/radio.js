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
  newsSegmentsFor,
} from './stations.js';
import { loadJson, assetUrl } from './assets.js';

const MUSIC_DIR = 'assets/music/';

/** How long a spoken segment sits on screen before the next one. */
const SEGMENT_TIME = 8.5;
/* A radio set is a thing you walk away from and a thing that gets driven
 * across a golf course, and a host's line has to survive both. 0.7 against the
 * 1.4 the engine gives a footstep roughly halves how fast the level falls off
 * with distance -- far enough to stay intelligible across a room, still short
 * of the whole map. */
const DIALOGUE_ROLLOFF = 0.7;

const SEGMENT_GAP = 1.4;

/* How many blocks a FRESH news segment waits after tune-in. Soon enough that
 * coming home from a job means hearing about the job, late enough that the
 * radio gets to be a radio first -- an intro and a beat of show, not a desk
 * waiting at the door with a report on you. */
const NEWS_AFTER = 2;

/** One report as queue segments: the sting on the first line, then the read. */
function newsLines(segment) {
  return segment.lines.map((line, index) => ({
    line,
    cue: index === 0 ? 'radio.jingle' : null,
    news: true,
    newsId: index === 0 ? segment.id : null,
  }));
}

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

/**
 * The persistent station card follows the physical receiver's useful audio
 * range. Every positioned radio branch uses this boundary, so positional
 * scenes do not invent a HUD-only distance that outlives the sound.
 */
export const RADIO_HUD_AUDIBLE_DISTANCE = 20;

export function radioHudWithinRange(
  listener,
  receiver,
  maxDistance = RADIO_HUD_AUDIBLE_DISTANCE,
) {
  if (!listener || !receiver) return false;
  const dx = Number(listener.x) - Number(receiver.x);
  const dy = Number(listener.y) - Number(receiver.y);
  const dz = Number(listener.z) - Number(receiver.z);
  const radius = Number(maxDistance);
  if (![dx, dy, dz, radius].every(Number.isFinite) || radius < 0) return false;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

export class Radio {
  /**
   * @param {{ venue?: string, state?: object, canPlayNotice?: Function, fullSongs?: boolean,
   *   output?: number, hudVisible?: Function }} options
   * `venue` is deliberately separate from the station: a record can belong
   * to the radio rotation without leaking into a different in-world music
   * system such as the Bada Bing DJ.
   */
  constructor(audio, hud, time, {
    venue = 'apartment',
    state = null,
    canPlayNotice = () => true,
    news = () => [],
    fullSongs = false,
    output = 1,
    hudVisible = () => true,
  } = {}) {
    this.audio = audio;
    this.hud = hud;
    this.time = time;
    this.venue = venue;
    this.state = state;
    this.canPlayNotice = typeof canPlayNotice === 'function' ? canPlayNotice : () => true;
    /* The news segments this receiver may air, already gated on the campaign:
     * the scene passes `() => newsSegmentsFor(campaign.state)` (stations.js)
     * or nothing at all. Default silence, so a cart or a cockpit never
     * reports on the man tuned in unless its scene opts in. */
    this.news = typeof news === 'function' ? news : () => [];
    /* Most receivers air short radio edits. Silver Pines is the deliberate
     * exception: it is a player-controlled cart stereo and plays a selected
     * song from its opening through the media element's natural `ended`
     * event. Other scenes keep their thirty-second pacing unchanged. */
    this.fullSongs = fullSongs === true;
    /* How loud this particular set is, separate from the volume knob. The knob
     * is one shared saved number across every receiver in the campaign, so a
     * scene whose radio sits at arm's length on an open deck cannot turn itself
     * up without turning the bedroom radio up too. This is the physical set,
     * fixed by the scene that built it and never persisted. Default 1 leaves
     * every existing receiver exactly where it was. */
    this.output = Number.isFinite(output) ? THREE.MathUtils.clamp(output, 0, 4) : 1;
    /* A receiver can remain audible while its station card is no longer
     * relevant. The scene supplies the SAME physical-range decision used by
     * its interaction/audio policy; Radio owns clearing and restoring the OSD
     * when that decision changes. Default true preserves every existing set. */
    this.hudVisible = typeof hudVisible === 'function' ? hudVisible : () => true;
    this._hudShown = false;
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
    this._songCursors = new Map(Object.entries(saved.songCursors ?? {}));
    this._programProgress = Object.fromEntries(
      Object.entries(saved.programProgress ?? {}).map(([id, progress]) => [id, {
        nextBlock: progress.nextBlock ?? 0,
        completedBlockIds: [...(progress.completedBlockIds ?? [])],
      }]),
    );
    /** Ordered proof that programme output reached its concrete playback path. */
    this.playbackReceipts = [];
    this._playbackReceiptId = 0;
    this._programContext = null;
    this._songReactionCursor = Number.isSafeInteger(saved.songReactionCursor)
      ? saved.songReactionCursor : 0;
    this._adReactionCursor = Number.isSafeInteger(saved.adReactionCursor)
      ? saved.adReactionCursor : 0;
    /** Blocks aired since tuning in, so the notice can hold off at first. */
    this._blocks = 0;
    /** Block number of the last news line, so segments never air back-to-back. */
    this._lastNewsBlock = Number.NEGATIVE_INFINITY;
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
    /* `cue: true` marks a record that belongs to a scripted moment (a
     * signature sting, a mission needle-drop) — on disk and in the manifest,
     * but never station programming. Without this the takeoff anthems aired
     * in the 97.8 rotation on every receiver in the game. */
    return this.tracks.filter((track) => !track.cue
      && (!track.venue || track.venue === this.venue));
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
      songCursors: Object.fromEntries(this._songCursors ?? []),
      programProgress: Object.fromEntries(
        Object.entries(this._programProgress ?? {}).map(([id, progress]) => [id, {
          nextBlock: progress.nextBlock,
          completedBlockIds: [...progress.completedBlockIds],
        }]),
      ),
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
      ? [...hours] : [this.time?.hour ?? 9];
    /* A campaign packet may pin a show hour that is not the wall clock
     * (`showAt(station, program.showHour ?? hour)` in _playProgramme), and a
     * preload that only covers the current hour then decodes the wrong
     * show's announcer intro -- the aired one falls to the synth. Whatever
     * programme this receiver would air, its show belongs in the slice. */
    const programHour = (this._programContext ?? this.state?.context?.())?.program?.showHour;
    if (Number.isFinite(programHour) && !requestedHours.includes(programHour)) {
      requestedHours.push(programHour);
    }
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
      for (const ad of station.commercials ?? []) {
        if (!ad.live) continue;   // never preload a break that cannot air
        for (const segment of ad.segments) {
          if (segment.cue) cues.add(segment.cue);
          addLine(segment.line);
        }
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
      if (station.notices) {
        /* Only the segments the campaign has actually unlocked -- the whole
         * news ledger is most of a season of radio, and the point of this
         * method is not decoding things that cannot air. */
        for (const segment of this._eligibleNews()) {
          for (const line of segment.lines) addLine(line);
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
    return base * this.volume * this.mixScale * this.output;
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
    this.panner.maxDistance = RADIO_HUD_AUDIBLE_DISTANCE;
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
    if (!list.length) return null;
    const stableId = this._songCursors.get(this._playlistKey());
    if (stableId) {
      const saved = list.find((track) => this._trackId(track) === stableId);
      if (saved) return saved;
    }
    /* A v26 save has only the scalar cursor. Let the first receiver migrate
     * that position once; all newly encountered physical venues start at the
     * head of their own rotation rather than inheriting another room's turn. */
    if (!this._songCursors.size) return list[this.cursor % list.length] ?? null;
    return list[0];
  }

  _playlistKey() { return `${this.station.id}:${this.venue}`; }

  _trackId(track) {
    if (typeof track?.id === 'string' && track.id) return track.id;
    return String(track?.file ?? '').replace(/\.[^.]+$/, '');
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
    this._hudShown = false;
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
    this._hudShown = false;
  }

  /** Resume the same block after pause rather than advancing it off-screen. */
  resume() {
    if (!this.on || !this._paused) return;
    this._paused = false;
    this.audio.startLoop('radio.talk', {
      volume: this._level(this.songPlaying ? 0.006 : this._talkBase),
      position: this.position, ref: 2.6, maxDist: RADIO_HUD_AUDIBLE_DISTANCE,
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
    this._lastNewsBlock = Number.NEGATIVE_INFINITY;
    this._activeBroadcast = null;
    this._activeSegment = null;
    this._phase = 'gap';
    this._gapDuration = 0;

    if (this.el) this.el.pause();
    // A murmuring voice bed under the words, so the room is not silent.
    this._talkBase = 0.055;
    this.audio.startLoop('radio.talk', {
      volume: this._level(this._talkBase), position: this.position,
      ref: 2.6, maxDist: RADIO_HUD_AUDIBLE_DISTANCE,
    });
    this._show = null;
    this._programContext = this.state?.context?.() ?? null;
    if (announce && !this._programContext?.program) {
      this._queue.push({ cueOnly: st.ident, ident: true });
    }
    this._pump();
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
    if (this._activeSegment?._program) {
      this._completeProgramBlock(this._activeSegment._program, { skipped: true });
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
    if (this._refillProgram()) return;
    const st = this.station;
    const show = showAt(st, this.time ? this.time.hour : 9);
    if (show !== this._show) {
      this._show = show;
      this._queue.push({ line: showIntroLine(show), cue: 'radio.jingle' });
      return;
    }

    /* An UNHEARD news segment -- eligible, never yet heard anywhere -- jumps
     * the running order the first chance it decently can, so switching on
     * after a job means hearing about the job within a block or two. It is
     * marked heard on air through the shared bulletin history, and that is
     * the last time it airs on any receiver: the cycle below has no news
     * slot. Owner, 2026-09-02: *"once you hear them once... they don't
     * repeat."* This path is the safety net for a hub whose entry packet is
     * already spent, or a segment that became eligible mid-stay; the packet's
     * news desk (`_refillProgram`) is where a report is normally heard. The
     * gap guard keeps two reports off each other's backs. */
    if (st.notices && this._blocks >= NEWS_AFTER && this._newsGapClear()) {
      const fresh = this._unheardNews()[0];
      if (fresh) { this._queueNews(fresh); return; }
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
    /* No `news` slot. There used to be one after `notice`, once per cycle
     * over everything the campaign had made eligible, which is exactly the
     * repeat the owner did not want. A report airs once, above, and the
     * running order is talk, links, records, the ad, the tape and the
     * notice. */
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
        /* Round-robin like every other slot, so every live break airs before
         * any of them repeats, and which one is next survives a save. */
        const live = (st.commercials ?? []).filter((ad) => ad.live);
        this._queue.push(...(this._pick(`${st.id}:ad`, live)?.segments ?? []),
          { reaction: 'ad' });
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

  /** Queue exactly one unfinished entry-packet block. */
  _refillProgram() {
    const program = this._programContext?.program;
    if (!program) return false;
    for (let guard = 0; guard <= program.blocks.length; guard++) {
      const progress = this._programProgress[program.id] ?? {
        nextBlock: 0, completedBlockIds: [],
      };
      const entry = program.blocks[progress.nextBlock];
      if (!entry) {
        this._programContext = { ...this._programContext, program: null, programId: null };
        return false;
      }
      const programme = {
        programId: program.id,
        blockId: entry.id,
        blockIndex: progress.nextBlock,
        terminal: true,
      };
      const show = showAt(this.station, program.showHour ?? this.time?.hour ?? 9);
      const enqueue = (segments) => {
        segments.forEach((segment, index) => this._queue.push({
          ...segment,
          _program: {
            ...programme,
            terminal: index === segments.length - 1,
          },
        }));
        return segments.length > 0;
      };

      if (entry.type === 'ident') {
        return enqueue([{ cueOnly: this.station.ident, ident: true }]);
      }
      if (entry.type === 'showIntro') {
        this._show = show;
        return enqueue([{ line: showIntroLine(show), cue: 'radio.jingle' }]);
      }
      if (entry.type === 'talk') {
        this._show = show;
        const exchanges = show?.exchanges ?? [];
        const offset = this._programHash(program.id) % Math.max(1, exchanges.length);
        const exchange = exchanges[(offset + (entry.ordinal ?? 0)) % Math.max(1, exchanges.length)] ?? [];
        if (enqueue(exchange.map((line) => ({ line, cue: null })))) return true;
      } else if (entry.type === 'link') {
        const lines = this.station.lines ?? [];
        const line = lines[this._programHash(`${program.id}:${entry.id}`) % Math.max(1, lines.length)];
        if (line && enqueue([{ line, cue: null }])) return true;
      } else if (entry.type === 'song') {
        return enqueue([{ song: true, songId: entry.songId }]);
      } else if (entry.type === 'notice') {
        const segments = MEETING_NOTICE.filter((segment) => !segment.bulletinId
          || !this.hasHeardBulletin(segment.bulletinId));
        if (enqueue(segments)) return true;
      } else if (entry.type === 'news') {
        /* A named report, and only while it is still unheard: a packet
         * resumed after the desk already read it must not read it twice. */
        const segment = this._unheardNews().find(({ id }) => id === entry.newsId);
        if (segment && enqueue(newsLines(segment))) return true;
      } else if (entry.type === 'newsDesk') {
        /* THE TOP OF THE HOUR. Every eligible report the player has not
         * heard yet, in campaign order, straight after the show intro -- so
         * dropping into the next hub after a job means hearing about the job
         * before the hosts get going, and hearing about it once. Each report
         * is marked heard on its first line (`_pump`), so a second visit,
         * a reload, or the same report in a later hub's packet finds
         * nothing here and the block is skipped. */
        const fresh = this._unheardNews();
        if (fresh.length && enqueue(fresh.flatMap((segment) => newsLines(segment)))) {
          return true;
        }
        this._recordProgramReceipt(programme, {
          kind: 'newsDesk', requested: 'unheard-news', actual: null,
          source: 'nothing-new', started: false,
        });
        this._completeProgramBlock(programme, { skipped: true, reason: 'nothing-new' });
        continue;
      } else if (entry.type === 'ad') {
        const ad = (this.station.commercials ?? []).find(({ id, live }) => live && id === entry.adId);
        if (ad && enqueue([...ad.segments, { reaction: 'ad' }])) return true;
      } else if (entry.type === 'handoff') {
        this._recordProgramReceipt(programme, {
          kind: 'handoff', requested: 'generic-rotation', actual: 'generic-rotation',
          source: 'program', started: true,
        });
        this._completeProgramBlock(programme);
        continue;
      }

      /* The programme declaration and the delivered catalog are validated in
       * tests. Runtime still must not loop forever on a damaged save/build. */
      this._recordProgramReceipt(programme, {
        kind: entry.type, requested: entry.songId ?? entry.adId ?? entry.newsId ?? entry.id,
        actual: null, source: 'unavailable', started: false,
      });
      this._completeProgramBlock(programme, { skipped: true, reason: 'unavailable' });
    }
    return false;
  }

  _programHash(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  _recordProgramReceipt(programme, details) {
    if (!programme) return null;
    const receipt = Object.freeze({
      id: ++this._playbackReceiptId,
      ...programme,
      ...details,
      completed: details.completed === true,
    });
    this.playbackReceipts.push(receipt);
    if (this.playbackReceipts.length > 256) this.playbackReceipts.shift();
    return receipt;
  }

  _completeProgramBlock(programme, { skipped = false, reason = null } = {}) {
    if (!programme) return false;
    const program = this._programContext?.program;
    if (!program || program.id !== programme.programId) return false;
    const progress = this._programProgress[program.id] ?? {
      nextBlock: 0, completedBlockIds: [],
    };
    if (progress.nextBlock !== programme.blockIndex
      || progress.completedBlockIds.includes(programme.blockId)) return false;
    this._programProgress[program.id] = {
      nextBlock: progress.nextBlock + 1,
      completedBlockIds: [...progress.completedBlockIds, programme.blockId],
    };
    const receiptIndex = this.playbackReceipts.findLastIndex((receipt) => (
      receipt.programId === programme.programId
      && receipt.blockId === programme.blockId
      && receipt.completed !== true
    ));
    if (receiptIndex >= 0) {
      this.playbackReceipts[receiptIndex] = Object.freeze({
        ...this.playbackReceipts[receiptIndex], completed: true, skipped, reason,
      });
    }
    this._persist();
    return true;
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

  /** Eligible reports the player has never heard, on any receiver, oldest event first. */
  _unheardNews() {
    return this._eligibleNews()
      .filter((segment) => !this.hasHeardBulletin(segment.id))
      .sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  }

  /** The news segments whose events have happened, per the scene's gate. */
  _eligibleNews() {
    try {
      const context = this._programContext ?? this.state?.context?.();
      if (context?.campaignNews === 'disabled') return [];
      if (context?.campaignNews === 'enabled') {
        return newsSegmentsFor(this.state?.campaignState?.());
      }
      /* Legacy scene adapters without a receiver declaration retain their
       * existing callback until they are moved onto the campaign adapter. */
      const segments = this.news();
      return Array.isArray(segments) ? segments : [];
    } catch {
      return [];
    }
  }

  /** True once at least one full non-news block has aired since the last one. */
  _newsGapClear() {
    return this._blocks > this._lastNewsBlock + 1;
  }

  /** Queue one whole segment: sting on the first line, then the read. */
  _queueNews(segment) {
    if (!segment?.lines?.length) return;
    this._queue.push(...newsLines(segment));
    this._persist();
  }

  /** Move the next segment on air. */
  _pump() {
    if (!this._queue.length) this._refill();
    const s = this._queue.shift();
    if (!s) return;
    this._blocks++;
    if (s.song) { this._startSong(s); return; }
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
    /* A news line remembers its block so the next news block keeps its
     * distance, and the segment's first line retires it for good -- heard
     * once anywhere, it never airs again anywhere. */
    if (s.news) {
      this._lastNewsBlock = this._blocks;
      if (s.newsId) this.markBulletinHeard(s.newsId);
    }
    this._playSegmentAudio(s);

    this._showOsd();
  }

  _playSegmentAudio(s) {
    if (s.cueOnly) {
      this._voice = this._playCueWithReceipt(s.cueOnly, {
        position: this.position, volume: this._level(0.55),
      }, s);
      this._dwell = this._voice?.buffer?.duration ?? 3.6;
      return;
    }
    if (s.reactionCue) {
      this._voice = this._playCueWithReceipt(s.reactionCue, {
        follow: () => this.position, volume: this._level(1),
        ref: 3.4, maxDist: RADIO_HUD_AUDIBLE_DISTANCE, rolloff: DIALOGUE_ROLLOFF,
      }, s);
      this._dwell = this._voice?.buffer?.duration ?? 2.2;
      return;
    }
    if (s.cue) this.audio.play(s.cue, { follow: () => this.position, volume: this._level(0.5) });

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
    this._voice = v ? this._playCueWithReceipt(v.cue, {
      follow: () => this.position, volume: this._level(1),
      ref: 3.4, maxDist: RADIO_HUD_AUDIBLE_DISTANCE, rolloff: DIALOGUE_ROLLOFF,
    }, s) : null;
    this._dwell = this._voice?.buffer
      ? this._voice.buffer.duration
      : (s.line && s.line.length > 90 ? SEGMENT_TIME + 2.5 : SEGMENT_TIME);
  }

  _playCueWithReceipt(cue, options, segment = null) {
    let source = null;
    let audioReceipt = null;
    if (typeof this.audio.playWithReceipt === 'function') {
      ({ source, receipt: audioReceipt } = this.audio.playWithReceipt(cue, options));
    } else {
      source = this.audio.play?.(cue, options) ?? null;
    }
    if (segment?._program) {
      this._recordProgramReceipt(segment._program, {
        kind: segment.ident ? 'ident' : (segment.reactionCue ? 'reaction' : (segment.line ? 'voice' : 'cue')),
        requested: cue,
        actual: audioReceipt?.actual ?? cue,
        source: audioReceipt?.source ?? (source ? 'legacy-handle' : 'unknown'),
        started: audioReceipt?.started ?? Boolean(source),
        audioReceiptId: audioReceipt?.id ?? null,
      });
    }
    return source;
  }

  _showOsd() {
    let visible = false;
    try { visible = this.on && !this._paused && this.hudVisible() !== false; } catch { visible = false; }
    if (!visible) {
      if (this._hudShown) this.hud.setRadio(null);
      this._hudShown = false;
      return false;
    }
    const st = this.station;
    const show = this._show ? this._show.name : null;
    this.hud.setRadio({
      station: show ? `${st.dial} \u2014 ${show}` : st.name,
      track: this._line || st.tagline,
    });
    this._hudShown = true;
    return true;
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
      follow: () => this.position, volume: this._level(1),
      ref: 3.4, maxDist: RADIO_HUD_AUDIBLE_DISTANCE, rolloff: DIALOGUE_ROLLOFF,
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
  _startSong(segment = {}) {
    const list = this.playlist;
    const unavailable = (reason, track = null) => {
      this._songT = -1;
      this._track = null;
      this._activeSegment = null;
      this._line = null;
      this._phase = 'gap';
      this._gapDuration = 0;
      this._segT = 0;
      if (segment._program) {
        this._recordProgramReceipt(segment._program, {
          kind: 'song', requested: segment.songId ?? track?.id ?? track?.file ?? null,
          actual: track?.id ?? track?.file ?? null,
          source: 'unavailable', started: false,
        });
        this._completeProgramBlock(segment._program, { skipped: true, reason });
      }
      /* Do not call _pump() from here. A damaged programme song used to
       * synchronously enqueue itself again until the stack overflowed. The
       * next update tick advances from this explicit gap instead. */
    };
    if (!list.length) { unavailable('empty-playlist'); return; }
    const track = segment.songId
      ? list.find((candidate) => candidate.id === segment.songId)
      : this._current();
    if (!track) { unavailable('missing-song'); return; }
    const trackIndex = list.indexOf(track);
    const nextIndex = (Math.max(0, trackIndex) + 1) % list.length;
    this.cursor = nextIndex;
    this._songCursors.set(this._playlistKey(), this._trackId(list[nextIndex]));
    this._track = track;
    this._persist();

    this._ensureGraph();
    if (!this.el) { unavailable('no-media-element', track); return; }

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
    if (track.cutAt) {
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
    if (segment._program) {
      this._recordProgramReceipt(segment._program, {
        kind: 'song', requested: segment.songId ?? track.id ?? track.file,
        actual: track.id ?? track.file, source: 'media-element', started: true,
      });
    }
    this._fadeTo(this._level(0.85), SONG_FADE_IN);
    // The murmuring talk bed would sit under the music otherwise.
    this._setTalkVolume(0.006, 0.6);

    this._songT = 0;
    this._activeSegment = segment;
    this._line = `${track.artist ? `${track.artist} \u2014 ` : ''}${track.title || track.file}`;
    this._showOsd();
  }

  /**
   * Kill the record mid-bar and go straight to its authored target.
   *
   * Not a fade. The element is paused and the gain cut on the same tick as the
   * static, so the join is a hard edit -- a station stepping on its own record
   * because the notice matters more than the song does.
   */
  _cutSong() {
    if (this._songT < 0) return;   // the frame loop and the media clock can both land on this tick
    const track = this._track;
    const programme = this._activeSegment?._program;
    this._songT = -1;
    this._track = null;
    if (this.el) {
      try { this.el.pause(); } catch { /* already stopped */ }
      this._fadeTo(0, 0);
    }
    this.audio.play('radio.cut', { position: this.position, volume: this._level(0.75) });
    this._setTalkVolume(0.04, 0.8);
    if (programme) this._completeProgramBlock(programme);
    this._activeSegment = null;

    // Jump the queue: whatever the station was going to say next waits. The
    // target is catalog data, so Nehoo cannot turn into a different joke just
    // because this receiver is not permitted to air campaign notices.
    const afterCut = track?.afterCut;
    if (afterCut?.type === 'ad') {
      const ad = (this.station.commercials ?? []).find(({ id, live }) => (
        live && id === afterCut.id
      ));
      if (ad) this._queue.unshift(...ad.segments, { reaction: 'ad' });
    } else if (afterCut?.type === 'notice') {
      this._queue.unshift(...MEETING_NOTICE.filter((segment) => !segment.bulletinId
        || !this.hasHeardBulletin(segment.bulletinId)));
    }
    this._line = null;
    this._segT = 0;
    this._dwell = 0;
    this._pump();
  }

  _endSong(fade = SONG_FADE_OUT) {
    if (this._songT < 0) return;
    const programme = this._activeSegment?._program;
    this._songT = -1;
    this._track = null;
    this._fadeTo(0, fade);
    const el = this.el;
    setTimeout(() => { if (!this.songPlaying && el) el.pause(); }, fade * 1000 + 120);
    this._setTalkVolume(0.04, 1.2);
    this._line = null;
    this._segT = 0;
    this._activeSegment = null;
    if (programme) this._completeProgramBlock(programme);
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
    /* Proximity can change without the programme changing. Refresh only on
     * the visibility edge so a walk out of range clears immediately and a
     * walk back in restores the current show without rebuilding it per frame. */
    let shouldShow = false;
    try { shouldShow = this.on && !this._paused && this.hudVisible() !== false; } catch { shouldShow = false; }
    if (shouldShow !== this._hudShown) {
      if (shouldShow) this._showOsd();
      else {
        this.hud.setRadio(null);
        this._hudShown = false;
      }
    }
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
      const cut = this._track?.cutAt;
      if (cut && this.el && this.el.currentTime >= cut) { this._cutSong(); return; }
      if (!this.fullSongs && this._songT >= SONG_SECONDS - SONG_FADE_OUT) this._endSong();
      return;
    }

    this._segT += dt;
    if (this._phase === 'air') {
      const dwell = this._dwell ?? SEGMENT_TIME;
      if (this._segT >= dwell) {
        const completed = this._activeSegment?._program;
        if (completed?.terminal) this._completeProgramBlock(completed);
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
