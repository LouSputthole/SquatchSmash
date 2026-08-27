/**
 * Front and Center's two delivered music masters.
 *
 * Neither is an SFX cue. They stay streamed as HTML media through the music
 * bus, so a five-minute master is never decoded into resident PCM and spoken
 * dialogue receives the shared music-bus duck automatically.
 */
export const SILVER_ROOM_MUSIC = Object.freeze({
  background: Object.freeze({
    file: 'assets/music/front-and-center-background-35c043f1.mp3',
    title: 'Coco Cabana',
    artist: 'lousputthole',
    loop: true,
  }),
  opening: Object.freeze({
    file: 'assets/music/front-and-center-opening-b3b9d1cc.mp3',
    title: 'Big Feet on the Dance Floor',
    artist: 'lousputthole',
    start: 0,
    cutAt: 27,
  }),
});

/**
 * A non-diegetic supper-club score, rather than a loudspeaker in the room.
 *
 * The corridor gets the same recording through a blanket; the dining room
 * gets it clear but deliberately under conversation. The voice bus already
 * ducks the whole music bus, and the explicit dialogue factor below gives the
 * long table conversations a little more room without making the club die.
 */
export class SupperClubScore {
  constructor(audio, { key = 'silver.room.background' } = {}) {
    this.audio = audio;
    this.key = key;
    this.started = false;
    this.zone = 'exterior';
    this.dialogue = false;
    this.performance = false;
    this._lastVolume = -1;
    this._lastCutoff = -1;
  }

  start() {
    if (this.started) return true;
    const handle = this.audio?.startMusicLoop(
      this.key,
      SILVER_ROOM_MUSIC.background.file,
      {
        volume: 0,
        fade: 1.8,
        loop: true,
        bus: 'music',
        ambience: true,
        /* Deliberately no `position`: this is game score, not a speaker. */
      },
    );
    this.started = Boolean(handle);
    this._apply(0.1);
    return this.started;
  }

  setZone(zone, ramp = 1.1) {
    this.zone = zone || 'exterior';
    this._apply(ramp);
  }

  setDialogueDucked(on, ramp = 0.35) {
    this.dialogue = Boolean(on);
    this._apply(ramp);
  }

  setPerformance(on, ramp = 1.2) {
    this.performance = Boolean(on);
    this._apply(ramp);
  }

  stop(fade = 1.2) {
    this.audio?.stopLoop?.(this.key, fade);
    this.started = false;
  }

  _mix() {
    const byZone = {
      exterior: { volume: 0, cutoff: 800 },
      cellar: { volume: 0.012, cutoff: 700 },
      kitchen: { volume: 0.022, cutoff: 850 },
      /* Audible after the kitchen, but through walls and swing doors. */
      corridor: { volume: 0.064, cutoff: 1150 },
      /* Clear in the room, low enough to leave table dialogue in front. */
      club: { volume: 0.13, cutoff: 20000 },
    };
    const base = byZone[this.zone] ?? byZone.exterior;
    const dialogue = this.dialogue ? 0.48 : 1;
    const show = this.performance ? 0 : 1;
    return { volume: base.volume * dialogue * show, cutoff: base.cutoff };
  }

  _apply(ramp = 0.5) {
    if (!this.started) return;
    const { volume, cutoff } = this._mix();
    if (Math.abs(volume - this._lastVolume) > 0.0005) {
      this.audio?.setLoopVolume?.(this.key, volume, ramp);
      this._lastVolume = volume;
    }
    if (cutoff !== this._lastCutoff) {
      this.audio?.setLoopCutoff?.(this.key, cutoff, ramp);
      this._lastCutoff = cutoff;
    }
  }
}
