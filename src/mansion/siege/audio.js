/**
 * Mission-level sound events for Mansion Under Siege.
 *
 * The shared AudioEngine still owns decoding, playback, buses and synthesis.
 * This adapter owns the story meaning of the six authored Siege effects so a
 * cue cannot be preloaded without any gameplay path ever requesting it.
 */

export const REQUIRED_SIEGE_EFFECT_CUES = Object.freeze([
  'siege.alarm.tone',
  'siege.glass.shatter',
  'siege.fire.crackle',
  'siege.wave.incoming',
  'siege.checkpoint',
  'siege.friendly.revived',
]);

const FIRE_LOOP = 'siege.fire.crackle';

export class SiegeMissionAudio {
  constructor(engine) {
    if (!engine) throw new Error('SiegeMissionAudio needs the shared AudioEngine');
    this.engine = engine;
    this.fireActive = false;
    this._cueTrace = [];
    this._suppressionDepth = 0;
  }

  _trace(action, cue, event) {
    this._cueTrace.push(Object.freeze({ action, cue, event }));
  }

  cueTrace() {
    return this._cueTrace.map((entry) => ({ ...entry }));
  }

  /**
   * Rebuild mission state without replaying story events the player already
   * heard. Environment loops remain state-driven through updateEnvironment.
   */
  withSuppressedEvents(run) {
    if (typeof run !== 'function') {
      throw new TypeError('withSuppressedEvents needs a callback');
    }
    this._suppressionDepth += 1;
    try {
      return run();
    } finally {
      this._suppressionDepth -= 1;
    }
  }

  _play(cue, event, options) {
    if (this._suppressionDepth > 0) return null;
    const result = this.engine.play?.(cue, options);
    this._trace('play', cue, event);
    return result;
  }

  updateEnvironment({ alarmActive = false, alarmStruck = false, fireActive = false } = {}) {
    const burning = fireActive === true;
    if (burning !== this.fireActive) {
      this.fireActive = burning;
      if (burning) {
        this.engine.startLoop?.(FIRE_LOOP, {
          name: 'siege.fire.crackle', volume: 0.24, fade: 0.8, ambience: true,
        });
        this._trace('startLoop', 'siege.fire.crackle', 'fire_started');
      } else {
        this.engine.stopLoop?.(FIRE_LOOP, 0.8);
        this._trace('stopLoop', 'siege.fire.crackle', 'fire_stopped');
      }
    }

    if (alarmActive && alarmStruck) {
      this._play('siege.alarm.tone', 'alarm_struck', { volume: 0.34 });
    }
  }

  waveIncoming(wave) {
    return this._play('siege.wave.incoming', `wave_${wave}_incoming`, { volume: 0.72 });
  }

  checkpoint(id) {
    return this._play('siege.checkpoint', `checkpoint_${id}`, { volume: 0.58 });
  }

  glassShattered(position = null) {
    return this._play('siege.glass.shatter', 'glass_shattered', {
      volume: 0.86,
      ...(position ? { position } : {}),
    });
  }

  friendlyRevived(position = null) {
    return this._play('siege.friendly.revived', 'friendly_revived', {
      volume: 0.8,
      ...(position ? { position } : {}),
    });
  }
}
