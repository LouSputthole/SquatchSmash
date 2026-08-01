/**
 * How Silver Pines sounds.
 *
 * The core AudioEngine owns synthesis, spatialisation and the mute state; this
 * is only the scene's opinion about what plays when. Two jobs: keep the course
 * breathing underneath everything, and turn ball events into cues.
 *
 * The brief for the mix is "let the hole breathe". There is a warm instrumental
 * at the top and the bottom of the morning and almost nothing in between —
 * eighteen minutes of scored golf would tell the player how to feel about a
 * scene whose whole point is that nobody says how they feel about it. So the
 * middle of the hole is birds, wind in pines, a mower two fairways away, and
 * four men talking.
 */

import { SURFACE, surfaceProps } from './course.js';
import { HOLE } from './hole.js';

/** Every recordable non-voice cue owned by this scene. */
export const GOLF_EFFECT_CUES = Object.freeze([
  'ambience.course', 'mower.distant', 'sprinkler', 'cart.motor',
  'bird', 'sprinkler.tick',
  'golf.hit.driver', 'golf.hit.iron', 'golf.hit.putt',
  'golf.hit.sand', 'golf.hit.rough',
  'golf.land.green', 'golf.land.sand', 'golf.land.path', 'golf.land.grass',
  'golf.splash', 'golf.cup', 'golf.flag', 'golf.tee', 'golf.pickup', 'golf.bag',
]);

/** The smallest useful slice of the shared sound manifest for Silver Pines. */
export const GOLF_AUDIO_SCOPE = Object.freeze({
  names: Object.freeze([...GOLF_EFFECT_CUES, 'ui.select']),
  prefixes: Object.freeze(['vo.golf.', 'footstep.']),
});

/** The first decoded take for a stable golf cue, or null while unrecorded. */
export function recordedGolfClip(engine, cueId) {
  const bank = engine?.buffers?.get?.(`vo.${cueId}`);
  return Array.isArray(bank) ? bank[0] ?? null : bank ?? null;
}

/**
 * Play recorded speech without falling through to AudioEngine's development
 * tick. Subtitles remain the intentional fallback when a line is unrecorded.
 */
export function playRecordedGolfCue(engine, cueId, opts = {}) {
  if (!recordedGolfClip(engine, cueId)) return null;
  return engine.play(`vo.${cueId}`, opts);
}

/* Bird calls are one-shots on a long random timer rather than a loop, because
 * a looping bird is the fastest way to make a wood sound like a menu screen. */
const BIRD_MIN = 3.4;
const BIRD_MAX = 11.0;
const SPRINKLER_MIN = 14;
const SPRINKLER_MAX = 34;

export class CourseAudio {
  /** @param {import('../core/audio.js').AudioEngine} engine */
  constructor(engine) {
    this.engine = engine;
    this.started = false;
    this._bird = BIRD_MIN;
    this._sprinkler = SPRINKLER_MIN;
    this._cartRunning = false;
    this._music = null;
  }

  start() {
    if (this.started || !this.engine?.ready) return;
    this.started = true;
    this.engine.startLoop('ambience.course', { volume: 0.85 });
    /* Positioned, so it is genuinely over there and gets quieter as the round
     * walks away from the clubhouse end. */
    this.engine.startLoop('mower.distant', {
      volume: 0.5, position: { x: -58, y: 1, z: -30 },
    });
    this.engine.startLoop('sprinkler', {
      volume: 0.35, position: { x: 34, y: 0.5, z: -96 },
    });
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    for (const key of ['ambience.course', 'mower.distant', 'sprinkler', 'cart.motor']) {
      this.engine.stopLoop(key, 0.8);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Golf                                                              */
  /* ---------------------------------------------------------------- */

  /**
   * The strike. Which cue depends on the lie as much as the club — a full iron
   * out of heavy rough is a different noise from the same swing off a tee, and
   * that difference is most of how a player learns what rough costs.
   */
  strike(club, surface, power = 1, position = null) {
    if (!this.engine?.ready) return;
    let cue = `golf.hit.${club}`;
    if (surface === SURFACE.BUNKER) cue = 'golf.hit.sand';
    else if (surface === SURFACE.ROUGH || surface === SURFACE.DEEP_ROUGH) cue = 'golf.hit.rough';
    else if (club === 'putter') cue = 'golf.hit.putt';

    this.engine.play(cue, {
      volume: 0.55 + power * 0.45,
      rate: 0.95 + Math.random() * 0.1,
      position,
    });
  }

  /** First contact with the ground, wherever that turns out to be. */
  land(surface, position = null, force = 1) {
    if (!this.engine?.ready) return;
    if (surface === SURFACE.WATER) return this.splash(position);
    const cue = surface === SURFACE.GREEN || surface === SURFACE.FRINGE
      ? 'golf.land.green'
      : surface === SURFACE.BUNKER
        ? 'golf.land.sand'
        : surface === SURFACE.PATH
          ? 'golf.land.path'
          : 'golf.land.grass';
    this.engine.play(cue, {
      volume: 0.3 + Math.min(1, force) * 0.5,
      rate: 0.9 + Math.random() * 0.2,
      position,
    });
    return undefined;
  }

  /** Subsequent bounces, quieter each time so a long run-out does not rattle. */
  bounce(surface, impact, position = null) {
    if (impact < 2.2) return;
    this.land(surface, position, Math.min(1, impact / 14));
  }

  splash(position = null) {
    this.engine?.play('golf.splash', {
      volume: 0.85,
      position: position ?? (HOLE.pond
        ? { x: HOLE.pond.x, y: HOLE.pond.level, z: HOLE.pond.z }
        : null),
    });
  }

  holed(position = null) {
    this.engine?.play('golf.cup', { volume: 0.9, position });
  }

  flag(position = null) {
    this.engine?.play('golf.flag', { volume: 0.5, position });
  }

  tee(position = null) {
    this.engine?.play('golf.tee', { volume: 0.5, position });
  }

  pickup(position = null) {
    this.engine?.play('golf.pickup', { volume: 0.55, position });
  }

  bag(position = null) {
    this.engine?.play('golf.bag', { volume: 0.7, position });
  }

  /** Footstep on whatever he is standing on, using the shared surface model. */
  footstep(surface, intensity = 1) {
    this.engine?.footstep(surfaceProps(surface).step, intensity);
  }

  /* ---------------------------------------------------------------- */
  /* Carts                                                             */
  /* ---------------------------------------------------------------- */

  cartMotor(on, position = null) {
    if (!this.engine?.ready) return;
    if (on && !this._cartRunning) {
      this._cartRunning = true;
      this.engine.startLoop('cart.motor', { volume: 0.7, position });
    } else if (!on && this._cartRunning) {
      this._cartRunning = false;
      this.engine.stopLoop('cart.motor', 0.6);
    }
  }

  /* ---------------------------------------------------------------- */

  /**
   * Duck the course while somebody is talking close by.
   *
   * Small on purpose. The requirement is that ambience gets out of the way of
   * a line, not that the world stops when Lou opens his mouth.
   */
  duck(on) {
    if (!this.engine?.ready) return;
    this.engine.setLoopVolume('ambience.course', on ? 0.5 : 0.85, 0.4);
    this.engine.setLoopVolume('mower.distant', on ? 0.22 : 0.5, 0.4);
  }

  update(dt) {
    if (!this.started || !this.engine?.ready) return;

    this._bird -= dt;
    if (this._bird <= 0) {
      this._bird = BIRD_MIN + Math.random() * (BIRD_MAX - BIRD_MIN);
      /* Somewhere in the trees, never on the fairway, and never while
       * somebody is mid-sentence. */
      if (!this.engine.busy()) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 45;
        this.engine.play('bird', {
          volume: 0.18 + Math.random() * 0.14,
          rate: 0.85 + Math.random() * 0.4,
          position: { x: Math.cos(a) * r, y: 6, z: -70 + Math.sin(a) * r },
        });
      }
    }

    this._sprinkler -= dt;
    if (this._sprinkler <= 0) {
      this._sprinkler = SPRINKLER_MIN + Math.random() * (SPRINKLER_MAX - SPRINKLER_MIN);
      this.engine.play('sprinkler.tick', {
        volume: 0.2, position: { x: 34, y: 0.4, z: -96 },
      });
    }
  }
}
