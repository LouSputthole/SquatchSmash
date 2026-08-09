/**
 * Canonical dress-help rhythm shared by the apartment and any scene that
 * stages the same interaction. Scene pose, HUD and objective work stays on a
 * small rig adapter; the written seven-pull performance lives here once.
 */

export const DRESS_HELP_MOANS = Object.freeze([
  'moan.1', 'moan.3', 'moan.4', 'moan.5', 'moan.6', 'moan.3', 'moan.5',
]);

export const DRESS_HELP_CLAP_LOOPS = Object.freeze([
  'clap.wet.loop.1', 'clap.wet.loop.2', 'clap.wet.loop.3',
]);

export const DRESS_HELP_CLAP_KEY = 'margo.dress.clap';
export const DRESS_HELP_FINISH_CUE = 'clap.wet.finish';

export const DRESS_HELP_CUES = Object.freeze([
  ...new Set([...DRESS_HELP_MOANS, ...DRESS_HELP_CLAP_LOOPS, DRESS_HELP_FINISH_CUE]),
]);

const BAR_OPTIONS = Object.freeze({
  hits: DRESS_HELP_MOANS.length,
  window: Object.freeze([0.72, 0.87]),
  speed: 0.74,
  ramp: 1.13,
});

/**
 * @param {object} options
 * @param {typeof import('../core/timingbar.js').TimingBar} options.timingBar
 *   TimingBar constructor. Injected so the sequence stays deterministic in
 *   tests and does not hide which timing mechanic a scene is using.
 * @param {{play:Function,startLoop:Function,stopLoop:Function,position?:Function}} options.audio
 * @param {{begin?:Function,onHit?:Function,onMiss?:Function,finish?:Function,reset?:Function}} options.rig
 */
export function createDressHelpSequence({
  timingBar,
  audio,
  rig = {},
  onProgress,
  onComplete,
  onAbandon,
} = {}) {
  if (typeof timingBar !== 'function') {
    throw new TypeError('createDressHelpSequence requires a TimingBar constructor');
  }
  if (!audio?.play || !audio?.startLoop || !audio?.stopLoop) {
    throw new TypeError('createDressHelpSequence requires play/startLoop/stopLoop audio');
  }

  let clapStage = 0;
  let misses = 0;

  function spatial(options) {
    const position = typeof audio.position === 'function' ? audio.position() : null;
    return position ? { ...options, position } : options;
  }

  const bar = new timingBar({
    ...BAR_OPTIONS,
    onHit(index, total) {
      const progress = index / total;
      onProgress?.({ index, total, progress });
      audio.play(DRESS_HELP_MOANS[(index - 1) % DRESS_HELP_MOANS.length], spatial({
        volume: 0.60 + progress * 0.30,
        ref: 0.9,
        maxDist: 6,
      }));
      setClap(progress > 0.70 ? 3 : progress > 0.38 ? 2 : 1);
      rig.onHit?.({ index, total });
    },
    onMiss() {
      misses++;
      audio.play('cloth.snap', spatial({
        volume: 0.30,
        rate: 1.22,
        ref: 0.8,
        maxDist: 5,
      }));
      rig.onMiss?.({ index: misses });
    },
    onDone: () => finish(true),
  });

  function setClap(stage) {
    if (clapStage === stage) return;
    if (clapStage) audio.stopLoop(DRESS_HELP_CLAP_KEY, stage ? 0.22 : 0.34);
    clapStage = stage;
    if (!stage) return;
    audio.startLoop(DRESS_HELP_CLAP_KEY, spatial({
      name: DRESS_HELP_CLAP_LOOPS[stage - 1],
      volume: 0.20 + stage * 0.12,
      ref: 0.9,
      maxDist: 6,
      fade: 0.35,
    }));
  }

  function start() {
    if (bar.active) return false;
    bar.start();
    misses = 0;
    rig.begin?.();
    setClap(1);
    audio.play('cloth.snap', spatial({ volume: 0.42, ref: 0.8, maxDist: 5 }));
    return true;
  }

  function press() {
    return bar.press();
  }

  function update(dt) {
    bar.update(dt);
    return bar.view;
  }

  function finish(earned) {
    bar.stop();
    setClap(0);
    audio.play(DRESS_HELP_FINISH_CUE, spatial({ volume: 0.92, ref: 1.0, maxDist: 7 }));
    audio.play('cloth.snap', { volume: 0.55 });
    const event = { hits: bar.hits, misses, earned };
    rig.finish?.(event);
    if (earned) onComplete?.(event);
    else onAbandon?.(event);
    return true;
  }

  function abandon() {
    if (!bar.active) return false;
    return finish(false);
  }

  function reset() {
    bar.reset();
    misses = 0;
    setClap(0);
    rig.reset?.();
    return true;
  }

  return {
    start,
    update,
    press,
    abandon,
    reset,
    get active() { return bar.active; },
    /* Compatibility for existing preview tooling while consumers migrate to
     * the public lifecycle/getters above. */
    get running() { return bar.active; },
    get bar() { return bar; },
    get clapStage() { return clapStage; },
    get hits() { return bar.hits; },
    get misses() { return misses; },
    get debug() {
      return { bar, view: bar.view, clapStage, config: BAR_OPTIONS };
    },
  };
}
