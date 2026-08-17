/**
 * Mission-level sound events for Mansion Under Siege.
 *
 * The shared AudioEngine still owns decoding, playback, buses and synthesis.
 * This adapter owns the story meaning of the six authored Siege effects so a
 * cue cannot be preloaded without any gameplay path ever requesting it.
 *
 * ## THE NIGHT HAS MORE IN IT THAN THE ALARM
 *
 * Owner, playtest 2026-08-13: *"need more sound effects, foot steps, other
 * ambience besides the alarm"* and *"tone down alarm sound maybe 20%"*.
 *
 * Footsteps and body falls were already real -- `CombatStepCadence` drives one
 * per attacker and per friendly through `CombatAudio.step`, and both sides'
 * deaths queue a `bodyFall` -- so what was missing was everything BETWEEN the
 * events: a house at night with a battle going on outside it, and nothing on
 * the mix but a two-tone alarm and whatever the player himself was shooting.
 *
 * So this adapter now also owns two beds, and neither of them is new audio:
 *
 *   1. `ambience.city.night`, run through the ambience bus at a fifth of its
 *      normal level with the loop cutoff closed down -- the valley outside,
 *      heard through a stone house.
 *   2. A DISTANT BATTLE SCATTER: one off-screen event every few seconds,
 *      cycled deterministically through gunfire, shouting, glass and falling
 *      debris, positioned out on the grounds so the panner puts it where the
 *      fight the player cannot see is happening.
 *
 * Every cue below is a sample that already exists in `assets/sfx/index.json`,
 * and every one of them still degrades to `AudioEngine`'s synth fallback if it
 * ever does not -- the same recordings-with-fallback contract the Motel and
 * Squatchfather stacks use. Nothing here calls a generator.
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
const NIGHT_LOOP = 'siege.night.bed';
const NIGHT_LOOP_SAMPLE = 'ambience.city.night';

/**
 * The alarm, 20% quieter.
 *
 * It used to strike at 0.34 every 3.6 seconds for the whole mission, on top of
 * its own emergency-light wash, and it is the one sound in the scene the player
 * cannot get away from or turn off. 0.27 is that number less a fifth.
 */
export const SIEGE_ALARM_VOLUME = 0.27;

/**
 * The battle happening somewhere else.
 *
 * Cycled in order rather than sampled at random so a screenshot run and a
 * verifier hear the same night; the INTERVAL is what varies, which is what
 * stops it reading as a metronome. `y` is deliberately ground level -- these
 * are meant to arrive from outside and below the gallery, not from the roof.
 */
export const SIEGE_DISTANT_BATTLE = Object.freeze([
  Object.freeze({
    cue: 'weapon.carbine.fire', volume: 0.11, position: Object.freeze({ x: -21, y: 1, z: 28 }),
  }),
  Object.freeze({
    cue: 'heist.crowd.react', volume: 0.1, position: Object.freeze({ x: 6, y: 1, z: 22 }),
  }),
  Object.freeze({
    cue: 'combat.bullet.impact.glass', volume: 0.14, position: Object.freeze({ x: 17, y: 4, z: 47 }),
  }),
  Object.freeze({
    cue: 'weapon.ak47.fire', volume: 0.1, position: Object.freeze({ x: 24, y: 1, z: 34 }),
  }),
  Object.freeze({
    cue: 'combat.bullet.impact.wood', volume: 0.12, position: Object.freeze({ x: -14, y: 1, z: 55 }),
  }),
  Object.freeze({
    cue: 'crowd.whistle', volume: 0.08, position: Object.freeze({ x: -9, y: 1, z: 20 }),
  }),
]);

/** Cues the ambience beds want decoded before the fighting starts. */
export const SIEGE_AMBIENCE_CUES = Object.freeze([
  NIGHT_LOOP_SAMPLE,
  ...new Set(SIEGE_DISTANT_BATTLE.map((entry) => entry.cue)),
]);

const DISTANT_MIN_SECONDS = 2.6;
const DISTANT_SPREAD_SECONDS = 4.4;

export class SiegeMissionAudio {
  constructor(engine, { random = Math.random } = {}) {
    if (!engine) throw new Error('SiegeMissionAudio needs the shared AudioEngine');
    this.engine = engine;
    this.random = typeof random === 'function' ? random : Math.random;
    this.fireActive = false;
    this.nightActive = false;
    this._cueTrace = [];
    this._suppressionDepth = 0;
    this._distantCursor = 0;
    this._distantClock = DISTANT_MIN_SECONDS;
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

  updateEnvironment({
    alarmActive = false, alarmStruck = false, fireActive = false, dt = 0,
  } = {}) {
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

    /* THE NIGHT BED FOLLOWS THE ALARM LAYER, not the fire. `alert` is night
     * with the alarm lit and nothing broken yet -- the house is already in the
     * mission and the outside is already loud. */
    const night = alarmActive === true;
    if (night !== this.nightActive) {
      this.nightActive = night;
      if (night) {
        this.engine.startLoop?.(NIGHT_LOOP, {
          name: NIGHT_LOOP_SAMPLE, volume: 0.16, fade: 2.4, ambience: true,
        });
        /* Through a stone house, not through an open window. `setLoopCutoff`
         * anchors the param first (ENGINE-TRAPS #1), so closing the filter
         * inside the 2.4 s fade-in cannot be overwritten by that fade. */
        this.engine.setLoopCutoff?.(NIGHT_LOOP, 900, 2.4);
        this._trace('startLoop', NIGHT_LOOP_SAMPLE, 'night_bed_started');
      } else {
        this.engine.stopLoop?.(NIGHT_LOOP, 1.6);
        this._trace('stopLoop', NIGHT_LOOP_SAMPLE, 'night_bed_stopped');
      }
    }

    if (alarmActive && alarmStruck) {
      this._play('siege.alarm.tone', 'alarm_struck', { volume: SIEGE_ALARM_VOLUME });
    }

    if (burning) this._advanceDistantBattle(dt);
  }

  /**
   * One off-screen event on its own clock.
   *
   * Held behind the battle layer rather than the alarm layer: `alert` is the
   * house waiting, `under_attack` onward is the house being fought over, and
   * only the second one should be sending gunfire in from the lawn.
   */
  _advanceDistantBattle(dt) {
    const step = Math.max(0, Number(dt) || 0);
    if (step <= 0) return null;
    this._distantClock -= step;
    if (this._distantClock > 0) return null;
    this._distantClock = DISTANT_MIN_SECONDS + this.random() * DISTANT_SPREAD_SECONDS;
    const entry = SIEGE_DISTANT_BATTLE[this._distantCursor % SIEGE_DISTANT_BATTLE.length];
    this._distantCursor += 1;
    return this._play(entry.cue, 'distant_battle', {
      volume: entry.volume,
      position: { ...entry.position },
    });
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
