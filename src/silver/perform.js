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
    cue: 'vo.silver.bandleader.set.opener',
    /* Shorter than it was, twice, and the reason is arithmetic rather than
     * taste. The third number is the one everybody has been told about and it
     * is a 192-second master that cannot be cut; dessert is gated on it
     * finishing; and at 52 and 58 the two warm-ups pushed that gate to nine
     * and a quarter minutes after sitting down. Cutting them to 38 and 42 was
     * not enough — "let's basically [play] all the sounds once for about a
     * quarter of a number and then just go right into banana phone".
     *
     * So a warm-up is now about a quarter of what it was: long enough for the
     * curtain, the bandleader's line, the section to be seen playing and the
     * applause at the end of it, and no longer. Both numbers still happen, in
     * order, so the third number is still literally the third number — which
     * three separate people in the script promise it will be. */
    dur: 10,
    stems: { rhythm: 0.5, horns: 0.22, piano: 0.34, vocal: 0 },
  },
  {
    /* The owner's note: "the band is much better, BUT the 'lady singing
     * thing' must GO." This used to be Ashland Line, a warm-up number led by
     * `the singer` — which is `band.vocal`, the synthesised "ohhh ohh"
     * ENGINE-TRAPS.md #8 already had to fight loose from the featured number
     * once. It is not a recording of anybody; there is no singer built for
     * this stage at all. Replaced with the violinist opening like a
     * comedian, in his own voice, before the band goes straight into the
     * third number.
     *
     * Same `id`, same slot: Bananaphone is still literally the third number,
     * which the mission promises out loud in half a dozen places — the
     * waiter's tip line, Ape's goodbye, the toast's own option text. Losing a
     * slot here would make the callback a lie. */
    id: 'second',
    title: 'A Word From The Violinist',
    lead: 'the bandleader',
    say: 'How are ya? Glad to be here!',
    cue: 'vo.silver.bandleader.set.second',
    /* The rest of the bit, on the number's own clock rather than a raw
     * `setTimeout` — see `Performance.defer`, which `onNumber` schedules
     * these through so a paused tab holds the joke exactly where it left it.
     * `sfx` beats are crowd reactions; `say`/`cue` beats are the violinist's
     * second line. */
    bits: [
      { at: 2.6, sfx: ['applause', 'crowd.whistle'] },
      {
        at: 5.6,
        lead: 'the bandleader',
        say: 'Take my wife, please! I take my wife everywhere… but she finds her way home!',
        cue: 'vo.silver.bandleader.set.second-wife',
      },
      { at: 9.8, sfx: ['crowd.laughter', 'band.rimshot'] },
    ],
    // Room for the rimshot to land before the standard end-of-number
    // applause and the 2.4s transition carry the set straight into Bananaphone.
    dur: 12,
    // Near silent: this is patter, not a number. A hair of rhythm so the
    // room does not go dead while he talks.
    stems: { rhythm: 0.04, horns: 0, piano: 0, vocal: 0 },
  },
  {
    /* The one everybody warned you about: a house violinist playing the
     * dumbest possible request with absolute supper-club conviction. */
    id: 'third',
    title: 'Bananaphone',
    lead: 'the bandleader',
    say: 'This one is for the table nobody had a table for.',
    cue: 'vo.silver.bandleader.set.front-and-center',
    /* The supplied master runs 194.36 seconds, with its audible ending at
     * 192.62. It is streamed only when this number begins; the final silence
     * is where the house applause takes over. */
    dur: 192.62,
    track: 'assets/music/front-and-center-bananaphone-e786d7fe.mp3',
    trackVolume: 0.42,
    trackDuck: 0.20,
    bpm: 93.75,
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
   * @param {object} o { audio, room, band, onNumber, onNumberEnd,
   *   onNumberError, onApplause, onSetEnd }
   */
  constructor({
    audio, room, band, onNumber, onNumberEnd, onNumberError, onApplause, onSetEnd,
  } = {}) {
    this.audio = audio;
    this.room = room;
    this.band = band;
    this.onNumber = onNumber;
    this.onNumberEnd = onNumberEnd;
    this.onNumberError = onNumberError;
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
    this.roomMix = 1;
    this._featureHandle = null;
    this._featureFallback = false;
    this._resumeFeature = false;
    this._advancing = false;
    this._transition = null;
    this._paused = false;
    this._deferred = [];
    /** Whether the four synthesised stems are in the loop table at all. */
    this._stemsUp = false;
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
    this._startStems();
    this._next(0);
  }

  /**
   * The four synthesised stems, up or gone. Not up or turned down.
   *
   * They used to be started once in `begin()` and left running for the whole
   * set, with `_applyMix` ramping them to zero underneath the featured number.
   * Zero gain is not silence you can rely on: the oscillators and noise
   * sources are still in the graph, still summing, and every caller that
   * touches the mix — the duck, the room crossfade in `updateZones`, a
   * checkpoint restore — re-ramps them from wherever they had got to. The
   * reported symptom was exact: "I still hear this ohhh ohh singing sound in
   * the background during banana phone", which is `band.vocal`, a pair of
   * bandpassed noise voices that has no business existing at all while a real
   * recording of a real band is playing.
   *
   * So the stems are a thing that is either running or stopped, the featured
   * number stops them, and the house band starting again starts them again.
   */
  _startStems() {
    if (this._stemsUp) return;
    this._stemsUp = true;
    for (const s of STEMS) {
      this.audio?.startLoop(`band.${s}`, { volume: 0, ambience: true, fade: 0.5 });
    }
  }

  _stopStems(fade = 0.6) {
    if (!this._stemsUp) return;
    this._stemsUp = false;
    for (const s of STEMS) this.audio?.stopLoop(`band.${s}`, fade);
  }

  /**
   * Ask for a number. Used by the bandleader conversation: asking for the
   * featured song moves the third number up rather than starting it immediately,
   * because a band that changes song mid-bar is a jukebox.
   */
  request(kind) {
    /* `horns` remains accepted for checkpoints created before Bananaphone
     * became the featured request. */
    this._requested = ['banana', 'horns'].includes(kind)
      ? 'third'
      : kind === 'slow' ? 'slow' : null;
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
    if (!this.playing || this.setEnded) return false;
    this._transition = null;
    this._advancing = false;
    this.index = i;
    this.t = 0;
    const n = SET[i];
    if (!n) { this.endSet(); return; }
    this.numbersPlayed.push(n.id);
    this._stopFeatured(0.35);
    this._featureFallback = false;
    if (!n.track) this._startStems();
    if (n.track) {
      const handle = this.audio?.startMusicLoop('band.feature', n.track, {
        volume: 0,
        fade: 0.7,
        loop: false,
        bus: 'music',
        ambience: true,
        position: this.room?.anchors?.stageCentre ?? null,
        ref: 5,
        maxDist: 48,
        onEnded: () => {
          if (this.current?.id === n.id) this._completeNumber(n);
        },
        onError: (failedHandle, error) => this._handleFeatureError(n, failedHandle, error),
      }) ?? null;
      /* A synchronous play() failure can invoke onError before startMusicLoop
       * returns. Do not put its already-released handle back into the clock. */
      if (!this._featureFallback && handle && !handle.released && !handle.failed) {
        this._featureHandle = handle;
      }
      if (!handle) {
        this._handleFeatureError(n, null, new Error('featured recording is unavailable'));
      } else if ((handle.released || handle.failed) && !this._featureFallback) {
        this._handleFeatureError(n, handle, new Error(handle.lastError || 'featured recording failed'));
      }
      /* And only now, once the record is known to be running, does the house
       * band stop — see `_stopStems`. Stopping them first and letting the
       * fallback start them again would silence the four stems for a beat on
       * exactly the run where they are the only thing left playing, which is
       * the run that already has a problem. */
      if (!this._featureFallback) this._stopStems(0.6);
    }
    this._applyMix(1.4);
    this.onNumber?.(n, i);
    return true;
  }

  _stopFeatured(fade = 0.4) {
    if (this._featureHandle) this.audio?.stopLoop('band.feature', fade);
    this._featureHandle = null;
    this._resumeFeature = false;
  }

  /** Keep the authored number playable when a streamed master cannot run. */
  _handleFeatureError(expected, handle, error) {
    if (this.current !== expected || this._advancing || this._featureFallback) return false;
    if (this._featureHandle && handle && this._featureHandle !== handle) return false;
    /* startMusicLoop removes a failed handle before its onError callback, but
     * resume() owns its separate play() promise. If that promise rejects, the
     * media graph is still registered and must be released before the house
     * band takes over. Calling stopLoop after a core-owned failure is harmless
     * because that path has already removed the key. */
    if (handle && this._featureHandle === handle) this.audio?.stopLoop('band.feature', 0);
    this._featureHandle = null;
    this._resumeFeature = false;
    this._featureFallback = true;
    /* "The Midnight Pines do not. They carry the number live." They cannot
     * carry it on stems that the featured number stopped on its way in. */
    this._startStems();
    this._applyMix(0.45);
    this.onNumberError?.(expected, error);
    return true;
  }

  /** Apply room distance and dialogue ducking to whichever kind of number is live. */
  _applyMix(ramp = 0.25) {
    const n = this.current;
    if (!n) return;
    if (n.track && !this._featureFallback) {
      /* No stem pass at all: `_next` stopped them, and re-ramping keys that
       * are no longer in the loop table is how they used to creep back. */
      const duck = 1 - this.duck * (1 - (n.trackDuck ?? 0.2));
      this.audio?.setLoopVolume('band.feature', (n.trackVolume ?? 0.42) * this.roomMix * duck, ramp);
      this.audio?.setLoopCutoff?.('band.feature', this.duck > 0.05 ? 3200 : 20000, ramp);
      return;
    }
    const duckByStem = { rhythm: 0, horns: 0.62, piano: 0.3, vocal: 0.8 };
    for (const s of STEMS) {
      const duck = 1 - this.duck * duckByStem[s];
      this.audio?.setLoopVolume(`band.${s}`, n.stems[s] * this.roomMix * duck, ramp);
    }
  }

  setRoomMix(value, ramp = 1.1) {
    this.roomMix = Math.max(0, Number(value) || 0);
    this._applyMix(ramp);
  }

  /** Schedule a performance beat on game time, so opening Tab freezes it. */
  defer(seconds, callback) {
    if (!this.playing || this.setEnded || typeof callback !== 'function') return false;
    this._deferred.push({ remaining: Math.max(0, Number(seconds) || 0), callback });
    return true;
  }

  _updateDeferred(dt) {
    if (!this._deferred.length) return;
    const pending = this._deferred;
    const ready = [];
    this._deferred = [];
    for (const item of pending) {
      item.remaining -= Math.max(0, dt);
      if (item.remaining <= 0) ready.push(item.callback);
      else this._deferred.push(item);
    }
    for (const callback of ready) {
      if (!this.playing || this.setEnded) break;
      callback();
    }
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

  pause() {
    if (this._paused) return;
    this._paused = true;
    const element = this._featureHandle?.element;
    this._resumeFeature = !!element && !element.paused;
    if (this._resumeFeature) element.pause();
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    const expected = this.current;
    const handle = this._featureHandle;
    const element = this._featureHandle?.element;
    if (!element || !this._resumeFeature) return;
    this._resumeFeature = false;
    try {
      Promise.resolve(element.play()).catch((error) => this._handleFeatureError(expected, handle, error));
    } catch (error) {
      this._handleFeatureError(expected, handle, error);
    }
  }

  finish() {
    this.playing = false;
    this._paused = false;
    this._transition = null;
    this._advancing = false;
    this._deferred = [];
    this._stopFeatured(0.6);
    this._featureFallback = false;
    this._stopStems(2.2);
  }

  /**
   * Restore a checkpoint taken after the featured number without pretending
   * the decoder position or the unplayed fourth number was persisted. The
   * stage remains visible and the room settles into its between-set ambience.
   */
  restoreBetweenSets() {
    this.playing = false;
    this.setEnded = true;
    this.index = -1;
    this.t = 0;
    this.curtain = 1;
    this._paused = false;
    this._transition = null;
    this._advancing = false;
    this._deferred = [];
    this._stopFeatured(0.25);
    this._featureFallback = false;
    for (const member of this.band?.members ?? []) member.group.visible = true;
    this.room?.openStageCurtain?.(1);
    this._stopStems(0.8);
    return true;
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
    this._paused = false;
    this._transition = null;
    this._advancing = false;
    this._deferred = [];
    this._stopFeatured(0.6);
    this._featureFallback = false;
    this._stopStems(6);
    this.onSetEnd?.(this.numbersPlayed.slice());
  }

  update(dt) {
    if (this._paused) return;
    // The curtain, once, over about two and a half seconds
    if (this.playing && this.curtain < 1) {
      this.curtain = Math.min(1, this.curtain + dt / 2.5);
      this.room?.openStageCurtain(this.curtain);
    }
    if (!this.playing) return;
    this._updateDeferred(dt);
    if (!this.playing) return;

    if (this._transition) {
      this._transition.remaining -= Math.max(0, dt);
      if (this._transition.remaining > 0) return;
      const nextIndex = this._transition.nextIndex;
      this._transition = null;
      if (nextIndex < 0) this.endSet();
      else this._next(nextIndex);
      return;
    }

    const targetDuck = this._duckTarget || this.audio?.busy?.() ? 1 : 0;
    const d = targetDuck - this.duck;
    if (Math.abs(d) > 0.001) {
      this.duck += d * Math.min(1, dt * 4);
      this._applyMix(0.25);
    }

    const n = this.current;
    if (!n) return;
    if (n.track && !this._featureFallback && this._featureHandle?.element) {
      const mediaTime = Number(this._featureHandle.element.currentTime);
      /* The recording is the clock. A test/debug fast-forward may place `t`
       * ahead deliberately; never drag that backwards to a stalled media
       * element, but ordinary rendering follows currentTime exactly. */
      if (Number.isFinite(mediaTime) && (mediaTime > this.t || this.t < 1)) this.t = mediaTime;
    } else {
      this.t += dt;
    }

    /* Musicians, playing their actual instruments.
     *
     * This runs after the Npc updates in the frame loop, so what it writes is
     * what renders — the first pass ran before them, lost the fight to the
     * idle loop twenty times a second, and the section spent the whole set
     * vibrating at the back wall. Which they were also facing.
     *
     * Nothing fancy: horns up at the mouth with the bells lifting on the
     * phrase, a bass held and worked, a drummer trading hands, and a leader
     * who walks the front of the stage and puts the mic up when there is a
     * vocal to put it up for. Every figure is a beat or two out of phase with
     * the next, because seven people nodding in unison is a metronome. */
    const beat = n.bpm ? this.t * n.bpm * Math.PI / 30 : this.t * 2.4;
    for (let i = 0; i < this.band.members.length; i++) {
      const m = this.band.members[i];
      const P = m.parts;
      const ph = i * 1.7;
      switch (m.holds) {
        case 'horn': {
          // Bells come up with the horn line: further up the louder they are
          const swell = n.stems.horns * (1 - this.duck * 0.62);
          const lift = Math.sin(beat + ph) * 0.07 + swell * 0.45;
          P.armL.rotation.x = -0.9 - lift;
          P.armR.rotation.x = -0.9 - lift;
          P.foreL.rotation.x = -1.3;
          P.foreR.rotation.x = -1.3;
          P.body.rotation.z = Math.sin(this.t * 1.6 + ph) * 0.055;
          P.body.rotation.x = -0.04 - swell * 0.06;
          P.legL.rotation.x = Math.sin(beat + ph) * 0.08;
          P.legR.rotation.x = -Math.sin(beat + ph) * 0.08;
          break;
        }
        case 'sax': {
          /* Both hands on the tube, the horn swinging with the phrase and the
           * knees going with it. He rides the same `horns` stem the section
           * does — a saxophone that does not get louder when the horns do is
           * a man holding a saxophone. */
          const swell = n.stems.horns * (1 - this.duck * 0.62);
          const lift = Math.sin(beat + ph) * 0.05 + swell * 0.30;
          P.armL.rotation.set(-0.30 - lift * 0.30, 0, 0.50);
          P.foreL.rotation.set(-1.45, 0, -0.15);
          P.armR.rotation.set(-0.10 - lift * 0.20, 0, -0.42);
          P.foreR.rotation.set(-1.25, 0, 0.15);
          // The horn goes where the body goes, which is most of playing one.
          P.body.rotation.z = Math.sin(this.t * 1.5 + ph) * 0.07 + swell * 0.05;
          P.body.rotation.x = -0.05 - swell * 0.07;
          P.legL.rotation.x = Math.sin(beat + ph) * 0.09;
          P.legR.rotation.x = -Math.sin(beat + ph) * 0.06;
          break;
        }
        case 'keys': {
          /* Forearms out over the keyboard, hands trading on the eighths, and
           * the whole man leaning in on the piano stem rather than the horn
           * one. Shoulders stay down: a keyboard player's arms come from the
           * elbow, and driving this from the shoulder made him look like he
           * was pushing a wheelbarrow. */
          const hitR = Math.max(0, Math.sin(beat * 2 + ph));
          const hitL = Math.max(0, Math.sin(beat * 2 + ph + Math.PI * 0.5));
          const into = n.stems.piano * (1 - this.duck * 0.3);
          P.armL.rotation.set(-0.46 - hitL * 0.06, -0.20, -0.16);
          P.foreL.rotation.set(-1.06 - hitL * 0.10, 0, 0.10);
          P.armR.rotation.set(-0.46 - hitR * 0.06, 0.20, 0.16);
          P.foreR.rotation.set(-1.06 - hitR * 0.10, 0, -0.10);
          P.body.rotation.x = 0.10 + into * 0.10;
          P.body.rotation.z = Math.sin(this.t * 1.1 + ph) * 0.03;
          P.head.rotation.x = 0.14 + Math.sin(beat) * 0.04;
          break;
        }
        case 'bass': {
          // One hand up the neck, the other walking the strings
          P.armL.rotation.x = -1.0;
          P.armL.rotation.z = 0.55;
          P.foreL.rotation.x = -0.5;
          P.armR.rotation.x = -0.4;
          P.foreR.rotation.x = -0.75 + Math.sin(beat * 2 + ph) * 0.22;
          P.body.rotation.z = 0.06 + Math.sin(this.t * 1.2 + ph) * 0.04;
          P.body.rotation.x = 0.05;
          P.legL.rotation.x = Math.sin(this.t * 1.2 + ph) * 0.06;
          break;
        }
        case 'drums': {
          // Brushes: hands trade on the eighths, head keeps the time
          const hitR = Math.max(0, Math.sin(beat * 2 + ph));
          const hitL = Math.max(0, Math.sin(beat * 2 + ph + Math.PI));
          P.armR.rotation.x = -0.5 - hitR * 0.4;
          P.armL.rotation.x = -0.5 - hitL * 0.4;
          P.foreR.rotation.x = -0.85 - hitR * 0.3;
          P.foreL.rotation.x = -0.85 - hitL * 0.3;
          P.head.rotation.x = Math.sin(beat) * 0.045;
          P.body.rotation.z = Math.sin(beat + 0.6) * 0.03;
          break;
        }
        case 'violin': {
          /* The leader works a narrow strip at the lip with the violin under
           * his chin. Left hand holds the neck; the right drives a visible bow
           * across the strings. The gaze tracker still owns his head so he is
           * the one who finds the new front table.
           *
           * "Violinist should be holding the violin handle." He was not: the
           * authored arm angles put his left hand 340mm from the neck — out in
           * the air beside the instrument, in front of his own hip. Measured
           * in the browser rather than eyeballed, and these five numbers are
           * the ones that put the hand ON the neck, 3mm from the middle of the
           * 340mm the left hand is supposed to be wrapped round. The upper arm
           * hangs and rotates in under the instrument and the elbow closes to
           * about 130 degrees, which is what a violinist's left arm does and
           * why it is the tiring one.
           *
           * The right (bow) arm had the same complaint and a worse cause: "his
           * bow hand is wrong -- hand must be ON the bow". The bow used to be
           * animated on its own, independent of this arm entirely (see the note
           * in `makeViolin`), so no rotation chosen here could put the hand on
           * it — the target itself was moving on an unrelated clock. The bow is
           * now parented to `foreR` with a fixed local offset solved to sit at
           * this hand, so the pose below only has to look like a bow arm: the
           * shoulder rolled OUT so the elbow clears the ribs (`armR.z`, up from
           * the 0.42 that read as tucked in) and the forearm brought back IN
           * toward the strings rather than out past them (`foreR.z`, negative
           * now rather than positive) — "arm more inward, elbow out". Wherever
           * this swings, the bow swings with it and the hand is on it.
           *
           * `build` is fixed for this figure in cast.js for exactly this
           * reason — see the note there. */
          const roam = Math.sin(this.t * 0.4);
          m.group.position.x = m.homeX + roam * 0.45;
          m.group.position.z = m.homeZ;
          m.group.rotation.y = roam * -0.12;
          const stroke = Math.sin(beat * 1.35 + ph);
          // Vibrato: a few millimetres along the string, not a wave.
          const vib = Math.sin(this.t * 11.5) * 0.015;
          P.armL.rotation.set(-0.21, -0.28, -0.29);
          P.foreL.rotation.set(-2.30 + vib, 0, 0.06);
          P.armR.rotation.set(-0.62 - stroke * 0.08, 0.05, 0.65);
          P.foreR.rotation.set(-1.05 + stroke * 0.28, 0, -0.30);
          P.body.rotation.z = Math.sin(this.t * 1.3) * 0.035;
          break;
        }
        default: break;
      }
    }

    if (this.t >= n.dur) this._completeNumber(n);
  }

  _completeNumber(expected = this.current) {
    const n = this.current;
    if (!n || n !== expected || this._advancing) return false;
    this._advancing = true;
    if (n.track) this._stopFeatured(0.35);
    this.onNumberEnd?.(n, this.index);
    this.applaud(n.theOne ? 1.3 : 1);
    /* A request moves the queue rather than interrupting: whatever is
     * playing finishes, and the next thing up is what was asked for. */
    const nextIndex = this._queue();
    this.index = -1;
    this.t = 0;
    this._transition = { remaining: 2.4, nextIndex };
    return true;
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
  /* "The dancing minigame is completely fucked" — measured, this was 118 BPM,
   * a beat every 508ms, judged against a 62% window: 315ms by default and
   * 437ms with assist turned on. That is a fast-song rhythm-game reaction
   * window landing on a couple swaying at a supper club, after twenty minutes
   * of walking and talking, with no warning it was about to become a timing
   * test. 60 BPM — one second a beat — roughly doubles both windows (620ms
   * default, 860ms assisted) without touching the judging logic itself: `hits
   * >= half the beats` still wins it. Slower here, not more forgiving there,
   * is the whole fix — the bar now gives a distracted player time to read it
   * and land on it, which is what "we want the player to succeed" means for a
   * beat that only exists to be a nice moment. */
  constructor({ bpm = 60, beats = 4 } = {}) {
    this.bpm = bpm;
    this.beats = beats;
    this.active = false;
    this.hits = 0;
    this.misses = 0;
    /** How many of the four beats have been judged, one way or the other. */
    this.beat = 0;
    this.t = 0;
    /** How wide the window is. Widened by the accessibility setting. */
    this.window = 0.62;
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
    /* At 118 BPM these are roughly 437ms with assist and 315ms by default.
     * The old 132ms default belonged in a rhythm game, not an optional date
     * beat after twenty minutes of first-person navigation and conversation. */
    this.window = assist ? 0.86 : 0.62;
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
