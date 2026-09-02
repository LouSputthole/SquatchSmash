/**
 * Owner-delivered, non-diegetic score for THE TAKE's escape drive.
 *
 * 0.42, not 0.16. Owner, playtest 2026-09-02: *"the escape music should be
 * much louder. Let's pump that up."* The old level sat under the engine bed
 * (0.14) and the tyre loop (0.08) and the shared voice duck took it to 0.072
 * under every one of Rippinflow's calls, so the record the owner delivered
 * for the drive was the quietest thing in the car. 0.42 is +8.4 dB on the
 * old level: above the engine and sirens (0.16), and still 0.19 under a
 * line, which is what the duck is for.
 */
export const HEIST_DRIVING_MUSIC = Object.freeze({
  key: 'music.heist.escape-drive',
  file: 'assets/music/driving-the-take.mp3',
  volume: 0.42,
  fadeIn: 1.15,
  fadeOut: 0.65,
});

/**
 * The safehouse needle-drop, and how far it follows the crew.
 *
 * `volume` is the record on in the corner during the morning prep. It used
 * to be retired at the loading-bay threshold; owner, playtest 2026-09-02:
 * *"I like the music. Let's keep the music going at least into the bank and
 * the vault scene. Just keep it low."* So it rides along under the van, the
 * lobby and the vault at `jobVolume` -- a third of the prep level, under
 * the bank ambience (0.2) and the alarm (0.34) -- and is retired the moment
 * the crew steps onto the street, where the sirens and then the escape
 * score take over.
 */
export const HEIST_SAFEHOUSE_RECORD = Object.freeze({
  key: 'heist.morning.radio',
  file: 'assets/music/codename-sasquatch.mp3',
  volume: 0.14,
  jobVolume: 0.05,
  fadeIn: 1.6,
  fadeOut: 0.5,
  /* A slow slide, not a cut: the van doors closing are the cue, and the
   * player should notice the room getting smaller rather than the record
   * stopping. */
  duckRamp: 2.4,
});

/**
 * Keep one inspectable ownership receipt for a streamed record.
 *
 * `AudioEngine.stopLoop()` removes the key immediately, then releases the
 * media element after its fade.  A loop-map-only check therefore cannot tell
 * the difference between a clean handoff and an orphaned HTMLAudioElement.
 * The scene owners retain the most recently retired handle long enough for
 * the real-browser gate to prove that both halves happened: key retired and
 * stream released.
 */
class OwnedHeistRecord {
  constructor(audio, definition, options) {
    this.audio = audio;
    this.definition = definition;
    this.options = options;
    this.started = false;
    this.startCount = 0;
    this.handle = null;
    this.lastRetiredHandle = null;
    this.retiredCount = 0;
  }

  start({ restart = false, volume = null } = {}) {
    const live = this.audio?.loops?.get?.(this.definition.key) ?? null;
    if (live && !live.released && !live.failed && !restart) {
      this.handle = live;
      this.started = true;
      if (Number.isFinite(volume)) this.setVolume(volume);
      return true;
    }
    if (live && restart) this.stop(0.08);
    const options = Number.isFinite(volume)
      ? { ...this.options, volume }
      : this.options;
    const handle = this.audio?.startMusicLoop?.(
      this.definition.key,
      this.definition.file,
      options,
    ) ?? null;
    this.handle = handle;
    this.started = Boolean(handle);
    if (handle) this.startCount += 1;
    return this.started;
  }

  /** Move a running record's level; a no-op when nothing is playing. */
  setVolume(volume, ramp = 0.3) {
    const live = this.audio?.loops?.get?.(this.definition.key) ?? null;
    if (!live || live.released || live.failed) return false;
    this.audio?.setLoopVolume?.(this.definition.key, volume, ramp);
    return true;
  }

  /** The level the running record was last asked for, or null when silent. */
  currentVolume() {
    const live = this.audio?.loops?.get?.(this.definition.key) ?? null;
    if (!live || live.released || live.failed) return null;
    return Number.isFinite(live.volume) ? live.volume : null;
  }

  stop(fade = this.definition.fadeOut) {
    const handle = this.audio?.loops?.get?.(this.definition.key) ?? this.handle;
    this.audio?.stopLoop?.(
      this.definition.key,
      Math.max(0, Number(fade) || 0),
    );
    if (handle && handle !== this.lastRetiredHandle) {
      this.lastRetiredHandle = handle;
      this.retiredCount += 1;
    }
    this.handle = null;
    this.started = false;
    return true;
  }

  /** Release even a fading media element before this document hands off. */
  dispose() {
    this.stop(0);
    try { this.lastRetiredHandle?.release?.(); } catch { /* already released */ }
    return this.snapshot();
  }

  snapshot() {
    const activeHandle = this.audio?.loops?.get?.(this.definition.key) ?? null;
    const handles = [...new Set([activeHandle, this.lastRetiredHandle].filter(Boolean))];
    return Object.freeze({
      key: this.definition.key,
      file: this.definition.file,
      started: this.started,
      startCount: this.startCount,
      retiredCount: this.retiredCount,
      active: Boolean(activeHandle && !activeHandle.released && !activeHandle.failed),
      activeLoopCount: activeHandle ? 1 : 0,
      volume: this.currentVolume(),
      streamed: Boolean((activeHandle ?? this.lastRetiredHandle)?.streamed),
      unreleasedStreamHandles: handles.filter(
        (handle) => handle.streamed && !handle.released && !handle.failed,
      ).length,
      lastRetiredReleased: this.lastRetiredHandle
        ? Boolean(this.lastRetiredHandle.released || this.lastRetiredHandle.failed)
        : true,
    });
  }
}

/**
 * The record that starts in the safehouse and rides along to the vault.
 *
 * `start()` is the morning prep at full level. `follow()` is the same record
 * carried into the van and the bank at `jobVolume` -- it lowers a running
 * record, or starts it low for a resume or a preview that never heard the
 * prep. `stop()` is the street.
 */
export class HeistSafehouseRecord extends OwnedHeistRecord {
  constructor(audio) {
    super(audio, HEIST_SAFEHOUSE_RECORD, {
      volume: HEIST_SAFEHOUSE_RECORD.volume,
      fade: HEIST_SAFEHOUSE_RECORD.fadeIn,
      loop: true,
      ambience: true,
    });
  }

  follow() {
    const { jobVolume, duckRamp } = HEIST_SAFEHOUSE_RECORD;
    if (this.setVolume(jobVolume, duckRamp)) return true;
    return this.start({ volume: jobVolume });
  }

  snapshot() {
    return Object.freeze({
      ...super.snapshot(),
      prepVolume: HEIST_SAFEHOUSE_RECORD.volume,
      jobVolume: HEIST_SAFEHOUSE_RECORD.jobVolume,
    });
  }
}

/**
 * Own the drive score's lifecycle in one place.
 *
 * This is game score, not a car radio: no position, no fake speaker, and the
 * shared music bus automatically ducks it under every line in the vehicle.
 */
export class HeistDrivingScore {
  constructor(audio) {
    this.owner = new OwnedHeistRecord(audio, HEIST_DRIVING_MUSIC, {
      volume: HEIST_DRIVING_MUSIC.volume,
      fade: HEIST_DRIVING_MUSIC.fadeIn,
      loop: true,
      bus: 'music',
      ambience: false,
    });
  }

  start({ restart = false } = {}) {
    return this.owner.start({ restart });
  }

  stop(fade = HEIST_DRIVING_MUSIC.fadeOut) {
    return this.owner.stop(fade);
  }

  snapshot() {
    return Object.freeze({
      ...this.owner.snapshot(),
      volume: HEIST_DRIVING_MUSIC.volume,
      nonDiegetic: true,
    });
  }

  dispose() { return this.owner.dispose(); }
}
