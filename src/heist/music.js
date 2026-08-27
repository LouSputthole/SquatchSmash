/** Owner-delivered, non-diegetic score for THE TAKE's escape drive. */
export const HEIST_DRIVING_MUSIC = Object.freeze({
  key: 'music.heist.escape-drive',
  file: 'assets/music/driving-the-take.mp3',
  volume: 0.16,
  fadeIn: 1.15,
  fadeOut: 0.65,
});

/**
 * Own the drive score's lifecycle in one place.
 *
 * This is game score, not a car radio: no position, no fake speaker, and the
 * shared music bus automatically ducks it under every line in the vehicle.
 */
export class HeistDrivingScore {
  constructor(audio) {
    this.audio = audio;
    this.started = false;
  }

  start({ restart = false } = {}) {
    if (this.started && !restart) return true;
    if (restart) this.audio?.stopLoop?.(HEIST_DRIVING_MUSIC.key, 0.08);
    /* The prep needle-drop is a record in the safehouse, not a second score
     * that follows the crew into the street. Retire it before the chase. */
    this.audio?.stopLoop?.('heist.morning.radio', 0.5);
    const handle = this.audio?.startMusicLoop?.(
      HEIST_DRIVING_MUSIC.key,
      HEIST_DRIVING_MUSIC.file,
      {
        volume: HEIST_DRIVING_MUSIC.volume,
        fade: HEIST_DRIVING_MUSIC.fadeIn,
        loop: true,
        bus: 'music',
        ambience: false,
      },
    );
    this.started = Boolean(handle);
    return this.started;
  }

  stop(fade = HEIST_DRIVING_MUSIC.fadeOut) {
    this.audio?.stopLoop?.(
      HEIST_DRIVING_MUSIC.key,
      Math.max(0, Number(fade) || 0),
    );
    this.started = false;
    return true;
  }

  snapshot() {
    const handle = this.audio?.loops?.get?.(HEIST_DRIVING_MUSIC.key);
    return Object.freeze({
      key: HEIST_DRIVING_MUSIC.key,
      file: HEIST_DRIVING_MUSIC.file,
      started: this.started,
      active: Boolean(handle && !handle.released && !handle.failed),
      volume: HEIST_DRIVING_MUSIC.volume,
      nonDiegetic: true,
    });
  }
}
