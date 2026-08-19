/**
 * One place for the renderer's backing-store resolution.
 *
 * Every scene used to pick its own `renderer.setPixelRatio(Math.min(dpr, N))`
 * with N anywhere from 1.25 to 2.0 -- nine different answers to the same
 * question, none of them measured on the machine actually running the game.
 * This module owns the answer:
 *
 *   - ONE shared cap (`PIXEL_RATIO_CAP`), and a lower `PIXEL_RATIO_CAP_HEAVY`
 *     for the terrain/weather scenes whose verifiers already pin 1.25 on a
 *     2x display (Beef Run, Enola, the Silver Room, NO WAKE);
 *   - an adaptive downgrade: sustained slow frames step the ratio down a
 *     ladder, and it climbs back only after a backoff, so a machine that
 *     cannot afford the cap gets a playable frame rate instead of a slideshow
 *     and a machine that can never notices;
 *   - a deterministic mode for automation. Under Playwright
 *     (`navigator.webdriver`) or `?adaptiveDpr=0` the ratio is fixed at
 *     min(dpr, cap) and nothing here ever changes it, so screenshots and the
 *     verifiers' `renderer.getPixelRatio()` assertions do not shift with the
 *     rasteriser's mood. `?dpr=1.5` pins an explicit value; `?adaptiveDpr=1`
 *     forces the ladder on (that is how it is tested).
 *
 * The frame time is read from `requestAnimationFrame` cadence rather than
 * from any scene's own clock, so no scene has to call anything per frame:
 * when the GPU cannot keep up the compositor delays the next frame, and that
 * is exactly the cost we want to measure. On a change the scene's own
 * `resize` handler is dispatched (they all re-fit renderer, camera and
 * post-processing to the drawing size there), or a scene may pass its own
 * `onChange`.
 */

import { registerSceneRenderer } from './scene-lifecycle.js';

/** Shared cap on `devicePixelRatio`. 1.5x on a 2x display is 56% of the pixels of 2x. */
export const PIXEL_RATIO_CAP = 1.5;
/**
 * The terrain-and-weather scenes: a 2x retina backbuffer turned the Beef Run
 * preview into a 3 fps slideshow on ordinary laptops (its own comment), and
 * the Silver Room's dense set was measured the same way. Their verifiers pin
 * 1.25 on a 2x display.
 */
export const PIXEL_RATIO_CAP_HEAVY = 1.25;

export const HEAVY_SCENE_ENTRYPOINTS = Object.freeze([
  'beefrun.html',
  'enolasquatch.html',
  'silver.html',
  'nowake.html',
  'mansion.html',
  'mansion-siege.html',
]);

export function pixelRatioCapForScene(loc = globalThis.location) {
  const pathname = String(loc?.pathname ?? '').toLowerCase();
  const entry = pathname.split('/').filter(Boolean).at(-1) ?? '';
  return HEAVY_SCENE_ENTRYPOINTS.includes(entry) ? PIXEL_RATIO_CAP_HEAVY : PIXEL_RATIO_CAP;
}

/** Never render below this many device pixels per CSS pixel. */
export const PIXEL_RATIO_FLOOR = 0.6;

/** The ladder, as multiples of the initial ratio (which is min(dpr, cap)). */
export const LADDER = Object.freeze([1, 0.85, 0.7, 0.6]);

/* Policy constants. Frame times in milliseconds. */
const SLOW_MS = 34;          // slower than ~29 fps counts as slow (PostFX uses the same budget)
const FAST_MS = 20;          // faster than 50 fps counts as comfortable
const WINDOW_MS = 2000;      // judge slow frames over this much wall time
const SLOW_FRACTION = 0.75;  // ...and step down when at least this fraction were slow
const RECOVER_MS = 8000;     // step up only after this long of comfortable frames
const FAST_FRACTION = 0.95;  // ...at least this fraction of them
const HOLD_MS = 3000;        // after any change, measure nothing for this long
const HITCH_MS = 1000;       // a gap this long is a hidden tab or a stall, not a frame
const BACKOFF_MS = 15000;    // first wait before retrying a level that proved too slow
const BACKOFF_MAX_MS = 300000;

/**
 * Pure policy: feed it frame intervals, it tells you when to change level.
 * Kept free of DOM so tests can run it on a synthetic clock.
 */
export class AdaptivePixelRatioPolicy {
  constructor({ ladder = LADDER, now = 0 } = {}) {
    this.ladder = ladder;
    this.level = 0;
    this._holdUntil = now + HOLD_MS;
    this._retryAt = new Array(ladder.length).fill(0);
    this._backoff = new Array(ladder.length).fill(BACKOFF_MS);
    this._resetShort(now);
    this._resetLong(now);
  }

  /* Two windows: a short one that catches a slow patch quickly, and a long
   * one that has to stay comfortable before the ratio is allowed back up. */
  _resetShort(now) { this._shortStart = now; this._shortFrames = 0; this._slow = 0; }
  _resetLong(now) { this._longStart = now; this._longFrames = 0; this._fast = 0; }

  /**
   * @param {number} dtMs interval since the previous frame
   * @param {number} now  timestamp of this frame
   * @returns {number|null} the new level, or null when nothing changes
   */
  sample(dtMs, now) {
    if (!(dtMs > 0) || dtMs > HITCH_MS) {
      /* A hidden tab, a debugger, a texture decode: not evidence either way.
       * Start again rather than counting a 4-second "frame". */
      this._resetShort(now);
      this._resetLong(now);
      return null;
    }
    if (now < this._holdUntil) {
      /* Still settling after a change (or the first frames of the page):
       * the windows open when the measuring does. */
      this._resetShort(now);
      this._resetLong(now);
      return null;
    }
    this._shortFrames++;
    this._longFrames++;
    if (dtMs > SLOW_MS) this._slow++;
    if (dtMs < FAST_MS) this._fast++;

    if (now - this._shortStart >= WINDOW_MS && this._shortFrames >= 10) {
      if (this._slow / this._shortFrames >= SLOW_FRACTION && this.level < this.ladder.length - 1) {
        /* Too slow at this level: step down and remember not to come back
         * here for a while. Each failure at the same level doubles the wait. */
        this._retryAt[this.level] = now + this._backoff[this.level];
        this._backoff[this.level] = Math.min(BACKOFF_MAX_MS, this._backoff[this.level] * 2);
        this.level++;
        return this._changed(now);
      }
      this._resetShort(now);
    }
    if (now - this._longStart >= RECOVER_MS && this._longFrames >= 10) {
      if (this._fast / this._longFrames >= FAST_FRACTION && this.level > 0
        && now >= this._retryAt[this.level - 1]) {
        this.level--;
        return this._changed(now);
      }
      this._resetLong(now);
    }
    return null;
  }

  _changed(now) {
    this._holdUntil = now + HOLD_MS;
    this._resetShort(now);
    this._resetLong(now);
    return this.level;
  }

  ratioFor(initial, level = this.level) {
    return Math.max(PIXEL_RATIO_FLOOR, initial * this.ladder[level]);
  }
}

function search(locationLike) {
  try {
    return new URLSearchParams(locationLike?.search || '');
  } catch {
    return new URLSearchParams();
  }
}

/**
 * True when the page is being driven by automation, or asked to hold still.
 * Screenshots and verifier assertions must not depend on the rasteriser's
 * speed; under swiftshader every frame is "slow".
 */
export function isDeterministicRun(nav = globalThis.navigator, loc = globalThis.location) {
  const q = search(loc);
  const flag = q.get('adaptiveDpr');
  if (flag === '1') return false;
  if (flag === '0') return true;
  if (q.has('dpr')) return true;
  return nav?.webdriver === true;
}

/**
 * The ratio a scene starts at: the display's, capped -- or the `?dpr=` pin.
 */
export function initialPixelRatio(cap = PIXEL_RATIO_CAP, {
  dpr = globalThis.devicePixelRatio || 1,
  loc = globalThis.location,
} = {}) {
  const pinned = Number(search(loc).get('dpr'));
  if (Number.isFinite(pinned) && pinned > 0) return pinned;
  return Math.min(dpr || 1, cap);
}

/**
 * Set the renderer's pixel ratio from the shared cap and, unless the run is
 * deterministic, watch the frame cadence and step it down under sustained
 * load (recovering later). Call it where the scene used to call
 * `renderer.setPixelRatio(...)`, before `renderer.setSize(...)`.
 *
 * @param {import('three').WebGLRenderer} renderer
 * @param {object} [opts]
 * @param {number} [opts.cap] PIXEL_RATIO_CAP or PIXEL_RATIO_CAP_HEAVY
 * @param {() => void} [opts.onChange] called after the ratio changes; the
 *   default dispatches the window's `resize` event, which every scene already
 *   handles by re-fitting renderer, camera and post-processing.
 * @returns {{ ratio: number, initial: number, level: number, adaptive: boolean, dispose(): void }}
 */
export function attachPixelRatio(renderer, { cap = pixelRatioCapForScene(), onChange } = {}) {
  const unregisterRenderer = registerSceneRenderer(renderer);
  let disposed = false;
  const initial = initialPixelRatio(cap);
  renderer.setPixelRatio(initial);
  const adaptive = !isDeterministicRun()
    && typeof globalThis.requestAnimationFrame === 'function';
  const notify = onChange ?? (() => {
    try { globalThis.dispatchEvent(new Event('resize')); } catch { /* no window */ }
  });

  const control = {
    cap,
    initial,
    ratio: initial,
    level: 0,
    adaptive,
    changes: 0,
    policy: null,
    dispose() {
      if (disposed) return;
      disposed = true;
      control.adaptive = false;
      unregisterRenderer();
    },
  };
  if (!adaptive) {
    globalThis.__pixelRatio = control;
    return control;
  }

  const policy = new AdaptivePixelRatioPolicy({ now: performance.now() });
  control.policy = policy;
  let last = -1;
  const tick = (now) => {
    if (!control.adaptive) return;
    globalThis.requestAnimationFrame(tick);
    if (last >= 0) {
      const level = policy.sample(now - last, now);
      if (level !== null) {
        control.level = level;
        control.ratio = policy.ratioFor(initial, level);
        control.changes++;
        renderer.setPixelRatio(control.ratio);
        notify(control.ratio);
      }
    }
    last = now;
  };
  globalThis.requestAnimationFrame(tick);
  globalThis.__pixelRatio = control;
  return control;
}
