/**
 * Prewarm — pay a scene's first-use costs while the menu is still up.
 *
 * The bug this exists for: the first shot of a revolver hitches for about ten
 * frames and every shot after it is smooth. Nothing about the tenth shot is
 * cheaper than the first; what is different is that by then the GPU has
 * already got a compiled program for every material the shot puts on screen.
 *
 * On the Squatchfather that cost was measured at ~994ms for the first shot's
 * frame against ~8ms for a quiet one (software GL, so the absolute numbers are
 * inflated — the ratio is the point). The whole of it was one thing: the muzzle
 * flash is a PointLight that is `visible = false` until the trigger, three.js
 * skips invisible lights when it gathers the light list, and the number of
 * point lights is part of every material's program cache key. So the instant
 * that one light appears, EVERY material in the room needs a program it has
 * never had, and the room stops dead while ten of them are compiled and linked.
 *
 * Three things follow, and they are why this module renders rather than just
 * calling `renderer.compile()`:
 *
 *   1. `renderer.compile()` links the programs but the driver defers the
 *      expensive half of the work to the first DRAW that uses them. Measured:
 *      compile() cost 33ms and the first shot still cost 1013ms afterwards.
 *      One real render with the effect objects visible cost 1127ms once, and
 *      the shot then cost 10ms — the same as a quiet frame.
 *   2. three.js keys programs on tone mapping and output colour space too, and
 *      both differ when you render into a WebGLRenderTarget. Warming through
 *      an off-screen target therefore warms the WRONG programs for a scene
 *      that draws to the canvas. The prewarm render goes to whatever target
 *      gameplay uses — by default the canvas — and is clipped to a 1x1 scissor
 *      box so it costs almost no fill and cannot change what is on screen.
 *   3. Prewarm runs from a menu, where the camera is rarely looking at the
 *      room the effect happens in — and a frustum-culled mesh is not drawn, so
 *      its program never gets that first use. Frustum culling is therefore
 *      switched off for the warm draw. Leaving it on cost a measured 40ms on
 *      the first shot that should have been free.
 *
 * Nothing here imports three: it only calls documented renderer methods, so it
 * works for any scene in the repo and does not care which build of three it is
 * handed. Importing this module has no side effects.
 *
 * Typical use, from a scene's boot path (NOT from the first trigger):
 *
 *   import { prewarmScene } from '../core/prewarm.js';
 *
 *   await prewarmScene({
 *     renderer, scene, camera,
 *     // One entry per lighting/visibility state the effect can produce. Keep
 *     // each entry to exactly the objects that appear TOGETHER in play — two
 *     // lights revealed at once warms a two-light state that never happens.
 *     passes: [
 *       { name: 'decals', reveal: [...bloodPool, ...holePool] },
 *       { name: 'muzzle flash', reveal: [...bloodPool, muzzleLight] },
 *     ],
 *     audio: { module: audio, cues: ['gun.shot', 'ear.ringing'] },
 *     pools: [{ into: casings, count: 12, make: () => makeCasing() }],
 *   });
 */

/** How long prewarmAudio waits for a cue to decode before giving up on it. */
const AUDIO_TIMEOUT_MS = 8000;
/** How often it re-checks. */
const AUDIO_POLL_MS = 40;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Let the page draw once before the next chunk of warming. */
const nextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 16);
});

/** Flatten nested arrays / pools / single objects into one list of Object3Ds. */
function flatten(input, out = []) {
  if (!input) return out;
  if (Array.isArray(input)) {
    for (const item of input) flatten(item, out);
    return out;
  }
  // A pool object that keeps its members on `.pool`, e.g. BulletHoles.
  if (Array.isArray(input.pool)) return flatten(input.pool, out);
  if (input.isObject3D) out.push(input);
  return out;
}

/**
 * A stand-in for THREE.Vector4, good enough for renderer.getScissor(target),
 * so this module can stay import-free.
 */
function scissorBox() {
  return {
    x: 0,
    y: 0,
    z: 0,
    w: 0,
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; this.w = v.w; return this; },
  };
}

/**
 * Compile and draw one visibility state so gameplay never has to.
 *
 * Every object in `objects` is forced visible for a single render and then put
 * back exactly as it was, so passing something that is already on screen is
 * harmless. Lights count as objects here: revealing one changes the light
 * totals in the program cache key, which is the whole reason a first shot is
 * expensive, so a light that only appears with an effect belongs in the list.
 *
 * @param {object} renderer  THREE.WebGLRenderer
 * @param {object} scene     THREE.Scene
 * @param {object} camera    the camera gameplay renders with
 * @param {Array}  objects   Object3Ds (or arrays / `{ pool: [] }` holders)
 *                           that are hidden now and appear together later
 * @param {object} [options]
 * @param {object|null} [options.target]  render target gameplay uses; null =
 *                                        the canvas. Must match, or the
 *                                        warmed programs are the wrong ones.
 * @param {boolean} [options.scissor]     clip the warm render to 1x1 (default
 *                                        true). Turn off only to debug.
 * @param {boolean} [options.compile]     also call renderer.compile() first
 *                                        (default true). Cheap, and it warms
 *                                        the uniform bookkeeping too.
 * @param {boolean} [options.drawAll]     ignore frustum culling for the warm
 *                                        draw (default true), so the menu
 *                                        camera's view does not decide which
 *                                        materials get warmed.
 * @param {string}  [options.name]        label carried through to the report
 * @returns {{name:string, ms:number, programs:number, programsAdded:number,
 *            revealed:number, drawn:number}}
 */
export function prewarmMaterials(renderer, scene, camera, objects = [], options = {}) {
  const {
    target = null, scissor = true, compile = true, drawAll = true, name = 'materials',
  } = options;
  const started = now();
  const before = renderer.info?.programs?.length ?? 0;

  const revealed = flatten(objects);
  const wasVisible = revealed.map((o) => o.visible);
  for (const o of revealed) o.visible = true;

  // Everything visible must actually be drawn, wherever the camera happens to
  // be pointing while the menu is up.
  const unculled = [];
  if (drawAll) {
    scene.traverse((o) => {
      if (o.frustumCulled) { o.frustumCulled = false; unculled.push(o); }
    });
  }

  // The scene has to be up to date: a light that has never been rendered has
  // never had its world matrix computed, and three reads it during setup.
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const previousTarget = renderer.getRenderTarget ? renderer.getRenderTarget() : null;
  const previousScissorTest = renderer.getScissorTest ? renderer.getScissorTest() : false;
  const previousScissor = renderer.getScissor ? renderer.getScissor(scissorBox()) : null;

  try {
    if (compile && typeof renderer.compile === 'function') renderer.compile(scene, camera);
    if (renderer.setRenderTarget) renderer.setRenderTarget(target);
    if (scissor && renderer.setScissor) {
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, 1, 1);
    }
    // The draw is what matters: browsers and drivers defer the last, costly
    // part of a link until a program is first used to draw something.
    renderer.render(scene, camera);
  } finally {
    if (scissor && renderer.setScissor) {
      if (previousScissor) {
        renderer.setScissor(
          previousScissor.x, previousScissor.y, previousScissor.z, previousScissor.w,
        );
      }
      renderer.setScissorTest(previousScissorTest);
    }
    if (renderer.setRenderTarget) renderer.setRenderTarget(previousTarget);
    revealed.forEach((o, i) => { o.visible = wasVisible[i]; });
    for (const o of unculled) o.frustumCulled = true;
  }

  const after = renderer.info?.programs?.length ?? 0;
  return {
    name,
    ms: +(now() - started).toFixed(1),
    programs: after,
    programsAdded: after - before,
    revealed: revealed.length,
    drawn: renderer.info?.render?.calls ?? 0,
  };
}

/**
 * Warm several visibility states in order.
 *
 * A "pass" is one state the renderer will really be asked to draw: the decals
 * on their own, then the decals plus the muzzle flash, and so on. Passes are
 * run in the order given and each one is restored before the next.
 *
 * @param {object} renderer
 * @param {object} scene
 * @param {object} camera
 * @param {Array<Array|{name?:string, reveal:Array, target?:object}>} passes
 * @param {object} [options] defaults applied to every pass
 * @returns {Array} one report per pass
 */
export function prewarmPasses(renderer, scene, camera, passes = [], options = {}) {
  const reports = [];
  for (const pass of passes) {
    const spec = Array.isArray(pass) ? { reveal: pass } : pass;
    reports.push(prewarmMaterials(renderer, scene, camera, spec.reveal, {
      ...options,
      ...(spec.target !== undefined ? { target: spec.target } : {}),
      name: spec.name || options.name || `pass ${reports.length + 1}`,
    }));
  }
  return reports;
}

/**
 * Force named audio cues to fetch and decode before anything asks to hear them.
 *
 * The scenes here do not share one audio module, so this duck-types the two
 * shapes in the repo rather than importing either: anything with
 * `loadSamples(names)` + `sampleReady(name)` (the Squatchfather and Motel
 * modules), or a `buffers` Map keyed by cue name (core/audio.js AudioEngine).
 * Pass explicit `load` / `ready` callbacks for anything else.
 *
 * A cue that never decodes is reported, never thrown: every caller in this repo
 * has a synth fallback, so a missing recording is a quieter scene and not a
 * broken one.
 *
 * @param {object} audio   audio module or engine
 * @param {string[]} cues  cue names, e.g. ['gun.shot', 'ear.ringing']
 * @param {object} [options]
 * @param {Function} [options.load]     (names) => void
 * @param {Function} [options.ready]    (name) => boolean
 * @param {number}   [options.timeout]  ms to wait for the last cue
 * @param {number}   [options.poll]     ms between readiness checks
 * @returns {Promise<{ms:number, ready:string[], missing:string[]}>}
 */
export function prewarmAudio(audio, cues = [], options = {}) {
  const started = now();
  const {
    timeout = AUDIO_TIMEOUT_MS,
    poll = AUDIO_POLL_MS,
    load = typeof audio?.loadSamples === 'function' ? (n) => audio.loadSamples(n) : null,
    ready = typeof audio?.sampleReady === 'function'
      ? (n) => !!audio.sampleReady(n)
      : (audio?.buffers instanceof Map ? (n) => audio.buffers.has(n) : null),
  } = options;

  if (!cues.length || !ready) {
    return Promise.resolve({ ms: 0, ready: [], missing: [...cues] });
  }
  if (load) {
    try { load(cues); } catch { /* the cue stays on its synth fallback */ }
  }

  return new Promise((resolve) => {
    const finish = () => {
      const done = cues.filter((n) => ready(n));
      resolve({
        ms: +(now() - started).toFixed(1),
        ready: done,
        missing: cues.filter((n) => !done.includes(n)),
      });
    };
    const tick = () => {
      if (cues.every((n) => ready(n)) || now() - started > timeout) return finish();
      return setTimeout(tick, poll);
    };
    tick();
  });
}

/**
 * Fill a pool to its working size up front, so the first effect allocates
 * nothing. For pools that are already built eagerly this is a no-op that still
 * reports the size, which is worth having in the prewarm report.
 *
 * @param {Array} into    the pool array to fill
 * @param {number} count  how many entries it should hold
 * @param {Function} make (index) => entry
 * @returns {{added:number, size:number}}
 */
export function prewarmPool(into, count, make) {
  if (!Array.isArray(into) || typeof make !== 'function') {
    return { added: 0, size: Array.isArray(into) ? into.length : 0 };
  }
  let added = 0;
  while (into.length < count) {
    into.push(make(into.length));
    added += 1;
  }
  return { added, size: into.length };
}

/**
 * One call that does the lot, for a scene's load/start moment.
 *
 * Pools are filled first (so their objects exist to be drawn), then the render
 * passes run, then the audio wait is awaited — the GPU work is synchronous and
 * happens immediately, the audio wait is the only thing worth awaiting.
 *
 * `spread` puts a frame between passes so a menu stays clickable while the
 * work happens; leave it off if the scene is behind a hard loading screen and
 * you would rather have it done by the time the screen lifts.
 *
 * @param {object} spec
 * @param {object} spec.renderer
 * @param {object} spec.scene
 * @param {object} spec.camera
 * @param {Array}  [spec.passes]  see prewarmPasses
 * @param {object} [spec.audio]   { module, cues, load, ready, timeout }
 * @param {Array}  [spec.pools]   [{ into, count, make }]
 * @param {object} [spec.options] defaults for every render pass
 * @param {boolean} [spec.spread] wait a frame between passes (default false)
 * @returns {Promise<{ms:number, passes:Array, pools:Array, audio:object}>}
 */
export async function prewarmScene(spec = {}) {
  const {
    renderer, scene, camera, passes = [], audio = null, pools = [],
    options = {}, spread = false,
  } = spec;
  const started = now();

  const poolReports = pools.map((p) => prewarmPool(p.into, p.count, p.make));

  const passReports = [];
  if (renderer && scene && camera) {
    for (const pass of passes) {
      if (spread && passReports.length) await nextFrame();
      passReports.push(...prewarmPasses(renderer, scene, camera, [pass], {
        ...options,
        name: options.name || `pass ${passReports.length + 1}`,
      }));
    }
  }

  const audioReport = audio
    ? await prewarmAudio(audio.module ?? audio, audio.cues ?? [], audio)
    : { ms: 0, ready: [], missing: [] };

  return {
    ms: +(now() - started).toFixed(1),
    passes: passReports,
    pools: poolReports,
    audio: audioReport,
  };
}
