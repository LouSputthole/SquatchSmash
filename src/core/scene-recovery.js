import { PreviewMemoryStorage, getPreviewRuntime } from './preview-mode.js';
import { SCENE_RECOVERY_STORAGE_KEY } from './scene-recovery-storage.js';

export { SCENE_RECOVERY_STORAGE_KEY } from './scene-recovery-storage.js';
export const SCENE_SKIP_RESTART_THRESHOLD = 2;

const fallbackStorage = new PreviewMemoryStorage();

function resolveStorage(storage, locationLike) {
  if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
    return storage;
  }
  const previewRuntime = getPreviewRuntime(locationLike);
  if (previewRuntime) {
    try {
      const session = globalThis.sessionStorage;
      if (session && typeof session.getItem === 'function' && typeof session.setItem === 'function') {
        return session;
      }
    } catch {
      // Sandboxed previews can deny sessionStorage; page memory remains safe.
    }
    return previewRuntime.storage;
  }
  try {
    const canonical = globalThis.localStorage;
    if (canonical && typeof canonical.getItem === 'function' && typeof canonical.setItem === 'function') {
      return canonical;
    }
  } catch {
    // Private/sandboxed browsing can deny localStorage entirely.
  }
  return fallbackStorage;
}

function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function readLedger(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(SCENE_RECOVERY_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function readScene(storage, sceneId) {
  const raw = readLedger(storage)[sceneId];
  return {
    checkpointRestarts: count(raw?.checkpointRestarts),
    sceneRestarts: count(raw?.sceneRestarts),
  };
}

function writeScene(storage, sceneId, state) {
  const ledger = readLedger(storage);
  ledger[sceneId] = {
    checkpointRestarts: count(state.checkpointRestarts),
    sceneRestarts: count(state.sceneRestarts),
  };
  try {
    storage.setItem(SCENE_RECOVERY_STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // Recovery remains usable when storage is unavailable; only durability is lost.
  }
}

/**
 * Durable recovery policy for a single playable scene.
 *
 * This module deliberately does not know how campaign scenes finish and never
 * navigates. A scene must provide `completeAndSkip`, whose job is to normalize
 * its campaign facts and perform the scene's ordinary completion transition.
 * `sceneId` may be a getter for hubs whose durable blocking beat changes while
 * the page remains loaded.
 */
export function createSceneRecovery({
  sceneId,
  storage = null,
  location: locationLike = globalThis.location,
  restartCheckpoint: restartCheckpointAdapter = null,
  canRestartCheckpoint = () => typeof restartCheckpointAdapter === 'function',
  restartScene: restartSceneAdapter = null,
  completeAndSkip = null,
} = {}) {
  const resolveSceneId = typeof sceneId === 'function' ? sceneId : () => sceneId;
  function activeSceneId() {
    const active = resolveSceneId();
    if (!active || typeof active !== 'string') {
      throw new TypeError('createSceneRecovery requires a sceneId');
    }
    return active;
  }
  // Fail at construction for an invalid static id while still allowing a hub
  // to select a different durable beat from the same live page later.
  if (typeof sceneId !== 'function' && (!sceneId || typeof sceneId !== 'string')) {
    throw new TypeError('createSceneRecovery requires a sceneId');
  }
  activeSceneId();

  const sceneStorage = resolveStorage(storage, locationLike);

  function getState() {
    const attempts = readScene(sceneStorage, activeSceneId());
    const skipUnlocked = attempts.checkpointRestarts >= SCENE_SKIP_RESTART_THRESHOLD
      || attempts.sceneRestarts >= SCENE_SKIP_RESTART_THRESHOLD;
    return {
      ...attempts,
      skipUnlocked,
      checkpointAvailable: typeof restartCheckpointAdapter === 'function'
        && canRestartCheckpoint() === true,
      sceneRestartAvailable: typeof restartSceneAdapter === 'function',
      skipAvailable: skipUnlocked && typeof completeAndSkip === 'function',
    };
  }

  function record(field) {
    const active = activeSceneId();
    const state = readScene(sceneStorage, active);
    state[field] = count(state[field]) + 1;
    writeScene(sceneStorage, active, state);
  }

  return Object.freeze({
    getState,
    restartFromCheckpoint() {
      if (typeof restartCheckpointAdapter !== 'function' || canRestartCheckpoint() !== true) {
        return { ok: false, reason: 'checkpoint_unavailable' };
      }
      record('checkpointRestarts');
      return restartCheckpointAdapter();
    },
    restartScene() {
      if (typeof restartSceneAdapter !== 'function') {
        return { ok: false, reason: 'scene_restart_unavailable' };
      }
      record('sceneRestarts');
      return restartSceneAdapter();
    },
    skipScene() {
      const state = getState();
      if (!state.skipUnlocked) return { ok: false, reason: 'skip_locked' };
      if (typeof completeAndSkip !== 'function') {
        return { ok: false, reason: 'skip_adapter_unavailable' };
      }
      return completeAndSkip();
    },
  });
}
