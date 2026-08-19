/**
 * Shared page lifecycle for every scene.
 *
 * Scene pause Adapters still own their simulation flags. This Module owns the
 * two resources those flags cannot see consistently: every registered WebGL
 * renderer and every registered AudioContext. A hidden tab or open pause menu
 * therefore stops GPU draws and suspends audio even in a scene whose frame loop
 * continues scheduling lightweight requestAnimationFrame callbacks.
 */

const RENDER_GUARD = Symbol('squatch.renderGuard');
const renderers = new Set();
const audioContexts = new Set();
const resumeContexts = new Set();
const pendingSuspends = new Map();

let paused = false;
let pauseReason = null;

function quietPromise(value) {
  if (value && typeof value.catch === 'function') value.catch(() => {});
}

function resumeHeldContext(context) {
  if (pendingSuspends.has(context) || !resumeContexts.delete(context)) return;
  if (context?.state !== 'suspended' || typeof context.resume !== 'function') return;
  let operation;
  try { operation = Promise.resolve(context.resume()); } catch { return; }
  operation.catch(() => {}).finally(() => {
    if (paused && audioContexts.has(context) && context.state === 'running') {
      suspendContext(context);
    }
  });
}

function suspendContext(context) {
  if (context?.state !== 'running' || typeof context.suspend !== 'function') return;
  resumeContexts.add(context);
  if (pendingSuspends.has(context)) return;
  let operation;
  try { operation = Promise.resolve(context.suspend()); } catch { return; }
  pendingSuspends.set(context, operation);
  const finish = () => {
    if (pendingSuspends.get(context) !== operation) return;
    pendingSuspends.delete(context);
    if (!paused && resumeContexts.has(context)) resumeHeldContext(context);
  };
  operation.then(finish, finish);
}

export function registerSceneRenderer(renderer) {
  if (!renderer || typeof renderer.render !== 'function') return () => {};
  if (!renderer[RENDER_GUARD]) {
    const original = renderer.render;
    const record = { renderer, original };
    Object.defineProperty(renderer, RENDER_GUARD, { value: record, configurable: true });
    renderer.render = function guardedSceneRender(...args) {
      if (paused) return undefined;
      return original.apply(this, args);
    };
    renderers.add(record);
  }
  const record = renderer[RENDER_GUARD];
  return () => {
    if (!record || renderer[RENDER_GUARD] !== record) return;
    renderer.render = record.original;
    renderers.delete(record);
    try { delete renderer[RENDER_GUARD]; } catch { /* non-configurable host */ }
  };
}

export function registerSceneAudioContext(context) {
  if (!context || typeof context !== 'object') return () => {};
  audioContexts.add(context);
  if (paused && context.state === 'running') suspendContext(context);
  return () => {
    audioContexts.delete(context);
    resumeContexts.delete(context);
  };
}

export function suspendSceneAudio() {
  for (const context of audioContexts) suspendContext(context);
}

export function resumeSceneAudio() {
  for (const context of [...resumeContexts]) resumeHeldContext(context);
}

export function setSceneLifecyclePaused(value, { reason = value ? 'pause' : null } = {}) {
  const next = Boolean(value);
  paused = next;
  pauseReason = next ? reason : null;
  const body = globalThis.document?.body;
  body?.classList?.toggle?.('scene-lifecycle-paused', next);
  if (body?.dataset) {
    if (next) body.dataset.sceneLifecyclePaused = String(reason || 'pause');
    else delete body.dataset.sceneLifecyclePaused;
  }
  if (next) suspendSceneAudio();
  else resumeSceneAudio();
  return paused;
}

export function isSceneLifecyclePaused() {
  return paused;
}

export function sceneLifecycleSnapshot() {
  return Object.freeze({
    paused,
    reason: pauseReason,
    renderers: renderers.size,
    audioContexts: audioContexts.size,
    resumableAudioContexts: resumeContexts.size,
    pendingAudioSuspends: pendingSuspends.size,
  });
}
