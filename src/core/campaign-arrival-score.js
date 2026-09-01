/**
 * The three deliberately short transition scores approved by the campaign
 * radio/dialogue pass. They are score, never station programming: every one
 * enters AudioEngine's music bus so the engine's canonical voice ducking
 * protects spoken lines without each scene inventing another gain scheme.
 */
export const CAMPAIGN_ARRIVAL_SCORES = Object.freeze({
  squatch_graveyard: Object.freeze({
    key: 'music.arrival.squatch-graveyard',
    file: 'assets/music/graveyard-arrival-score.mp3',
    volume: 0.105,
    fadeIn: 1.8,
    fadeOut: 1.2,
  }),
  silver_case: Object.freeze({
    key: 'music.arrival.silver-case',
    file: 'assets/music/silver-case-pickup-score.mp3',
    volume: 0.115,
    fadeIn: 1.4,
    fadeOut: 0.9,
  }),
  cartel_palace: Object.freeze({
    key: 'music.arrival.cartel-palace',
    file: 'assets/music/cartel-palace-arrival-score.mp3',
    volume: 0.12,
    fadeIn: 2.2,
    fadeOut: 1.35,
  }),
});

export class CampaignArrivalScore {
  constructor(audio, definition) {
    if (!audio || typeof audio.startMusicLoop !== 'function' || typeof audio.stopLoop !== 'function') {
      throw new TypeError('CampaignArrivalScore requires the shared AudioEngine music-loop interface');
    }
    if (!definition?.key || !definition?.file) {
      throw new TypeError('CampaignArrivalScore requires a keyed music definition');
    }
    this.audio = audio;
    this.definition = definition;
    this.handle = null;
    this.startCount = 0;
    this.stopCount = 0;
    this.stopReason = null;
    this.endedNaturally = false;
  }

  start() {
    const live = this.audio.loops?.get?.(this.definition.key) ?? null;
    if (live && !live.released && !live.failed) {
      this.handle = live;
      return true;
    }
    const handle = this.audio.startMusicLoop(this.definition.key, this.definition.file, {
      bus: 'music',
      ambience: false,
      loop: false,
      volume: this.definition.volume,
      fade: this.definition.fadeIn,
      onEnded: () => {
        this.endedNaturally = true;
        this.handle = null;
      },
    }) ?? null;
    this.handle = handle;
    if (handle) {
      this.startCount += 1;
      this.stopReason = null;
      this.endedNaturally = false;
    }
    return Boolean(handle);
  }

  stop(reason = 'scene-transition', fade = this.definition.fadeOut) {
    const live = this.audio.loops?.get?.(this.definition.key) ?? this.handle;
    if (!live) return false;
    this.audio.stopLoop(this.definition.key, Number.isFinite(fade) ? fade : this.definition.fadeOut);
    this.handle = null;
    this.stopCount += 1;
    this.stopReason = String(reason);
    return true;
  }

  snapshot() {
    const live = this.audio.loops?.get?.(this.definition.key) ?? null;
    return Object.freeze({
      key: this.definition.key,
      file: this.definition.file,
      volume: this.definition.volume,
      duckedByCanonicalVoiceBus: true,
      active: Boolean(live && !live.released && !live.failed),
      startCount: this.startCount,
      stopCount: this.stopCount,
      stopReason: this.stopReason,
      endedNaturally: this.endedNaturally,
    });
  }
}

export function createCampaignArrivalScore(audio, sceneId) {
  const definition = CAMPAIGN_ARRIVAL_SCORES[sceneId];
  if (!definition) throw new RangeError(`Unknown arrival score: ${sceneId}`);
  return new CampaignArrivalScore(audio, definition);
}
