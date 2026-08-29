/** Owner-delivered, non-diegetic score for THE TAKE's escape drive. */
export const HEIST_DRIVING_MUSIC = Object.freeze({
  key: 'music.heist.escape-drive',
  file: 'assets/music/driving-the-take.mp3',
  volume: 0.16,
  fadeIn: 1.15,
  fadeOut: 0.65,
});

export const HEIST_SAFEHOUSE_RECORD = Object.freeze({
  key: 'heist.morning.radio',
  file: 'assets/music/codename-sasquatch.mp3',
  volume: 0.14,
  fadeIn: 1.6,
  fadeOut: 0.5,
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

  start({ restart = false } = {}) {
    const live = this.audio?.loops?.get?.(this.definition.key) ?? null;
    if (live && !live.released && !live.failed && !restart) {
      this.handle = live;
      this.started = true;
      return true;
    }
    if (live && restart) this.stop(0.08);
    const handle = this.audio?.startMusicLoop?.(
      this.definition.key,
      this.definition.file,
      this.options,
    ) ?? null;
    this.handle = handle;
    this.started = Boolean(handle);
    if (handle) this.startCount += 1;
    return this.started;
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

/** The one diegetic record that belongs only to the morning prep. */
export class HeistSafehouseRecord extends OwnedHeistRecord {
  constructor(audio) {
    super(audio, HEIST_SAFEHOUSE_RECORD, {
      volume: HEIST_SAFEHOUSE_RECORD.volume,
      fade: HEIST_SAFEHOUSE_RECORD.fadeIn,
      loop: true,
      ambience: true,
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
