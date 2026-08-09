import assert from 'node:assert/strict';
import test from 'node:test';

import { createCampaign } from '../src/core/campaign.js';
import {
  createSceneRecovery,
} from '../src/core/scene-recovery.js';

class MemoryStorage {
  constructor(initial = new Map()) {
    this.values = initial;
    this.reads = 0;
    this.writes = 0;
  }

  getItem(key) {
    this.reads++;
    return this.values.get(String(key)) ?? null;
  }

  setItem(key, value) {
    this.writes++;
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

test('two checkpoint restarts durably unlock the scene skip', () => {
  const storage = new MemoryStorage();
  const calls = [];
  const firstLoad = createSceneRecovery({
    sceneId: 'bank_heist',
    storage,
    restartCheckpoint: () => calls.push('checkpoint-1'),
    restartScene: () => calls.push('scene'),
    completeAndSkip: () => calls.push('skip'),
  });

  assert.deepEqual(firstLoad.getState(), {
    checkpointRestarts: 0,
    sceneRestarts: 0,
    skipUnlocked: false,
    checkpointAvailable: true,
    sceneRestartAvailable: true,
    skipAvailable: false,
  });
  firstLoad.restartFromCheckpoint();
  assert.equal(firstLoad.getState().skipUnlocked, false);

  const afterReload = createSceneRecovery({
    sceneId: 'bank_heist',
    storage,
    restartCheckpoint: () => calls.push('checkpoint-2'),
    restartScene: () => calls.push('scene'),
    completeAndSkip: () => calls.push('skip'),
  });
  assert.equal(afterReload.getState().checkpointRestarts, 1);
  afterReload.restartFromCheckpoint();

  assert.deepEqual(afterReload.getState(), {
    checkpointRestarts: 2,
    sceneRestarts: 0,
    skipUnlocked: true,
    checkpointAvailable: true,
    sceneRestartAvailable: true,
    skipAvailable: true,
  });
  assert.deepEqual(calls, ['checkpoint-1', 'checkpoint-2']);
});

test('scene restarts unlock independently per scene', () => {
  const storage = new MemoryStorage();
  const recovery = createSceneRecovery({
    sceneId: 'silver_room',
    storage,
    restartScene: () => {},
    completeAndSkip: () => {},
  });

  recovery.restartScene();
  recovery.restartScene();
  assert.equal(recovery.getState().skipAvailable, true);

  const otherScene = createSceneRecovery({
    sceneId: 'silver_pines',
    storage,
    restartScene: () => {},
    completeAndSkip: () => {},
  });
  assert.equal(otherScene.getState().sceneRestarts, 0);
  assert.equal(otherScene.getState().skipUnlocked, false);
});

test('preview recovery shares the page runtime without touching canonical storage', () => {
  const canonical = new MemoryStorage(new Map([['sentinel', 'keep-me']]));
  const previewSession = new MemoryStorage();
  const oldLocation = globalThis.location;
  const oldStorage = globalThis.localStorage;
  const oldSessionStorage = globalThis.sessionStorage;
  const oldRuntime = globalThis.__squatchLifePreviewRuntime;
  globalThis.localStorage = canonical;
  globalThis.sessionStorage = previewSession;
  globalThis.location = {
    pathname: '/game/heist.html',
    search: '?preview=1&checkpoint=bank_lobby',
  };
  delete globalThis.__squatchLifePreviewRuntime;

  try {
    const first = createSceneRecovery({
      sceneId: 'bank_heist',
      restartScene: () => {},
      completeAndSkip: () => {},
    });
    first.restartScene();

    const samePage = createSceneRecovery({
      sceneId: 'bank_heist',
      restartScene: () => {},
      completeAndSkip: () => {},
    });
    assert.equal(samePage.getState().sceneRestarts, 1);
    assert.equal(canonical.reads, 0);
    assert.equal(canonical.writes, 0);
    assert.equal(canonical.getItem('sentinel'), 'keep-me');

    globalThis.location = {
      pathname: '/game/silver.html',
      search: '?preview=1',
    };
    const nextPreviewPage = createSceneRecovery({
      sceneId: 'silver_room',
      restartScene: () => {},
      completeAndSkip: () => {},
    });
    assert.equal(nextPreviewPage.getState().sceneRestarts, 0);

    globalThis.location = {
      pathname: '/game/heist.html',
      search: '?preview=1&checkpoint=bank_lobby',
    };
    const afterPreviewNavigation = createSceneRecovery({
      sceneId: 'bank_heist',
      restartScene: () => {},
      completeAndSkip: () => {},
    });
    assert.equal(afterPreviewNavigation.getState().sceneRestarts, 1);
  } finally {
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
    if (oldStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = oldStorage;
    if (oldSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = oldSessionStorage;
    if (oldRuntime === undefined) delete globalThis.__squatchLifePreviewRuntime;
    else globalThis.__squatchLifePreviewRuntime = oldRuntime;
  }
});

test('skip never navigates on its own and requires a scene completion adapter', () => {
  const storage = new MemoryStorage();
  const navigated = [];
  const completed = [];
  const location = { assign: (href) => navigated.push(href) };
  const recovery = createSceneRecovery({
    sceneId: 'no_wake',
    storage,
    location,
    restartScene: () => {},
    completeAndSkip: () => {
      completed.push('normalized');
      return { ok: true, next: 'apartment' };
    },
  });

  assert.deepEqual(recovery.skipScene(), { ok: false, reason: 'skip_locked' });
  recovery.restartScene();
  recovery.restartScene();
  assert.deepEqual(recovery.skipScene(), { ok: true, next: 'apartment' });
  assert.deepEqual(completed, ['normalized']);
  assert.deepEqual(navigated, []);

  const noAdapter = createSceneRecovery({
    sceneId: 'jerky_motel',
    storage: new MemoryStorage(),
    restartScene: () => {},
  });
  noAdapter.restartScene();
  noAdapter.restartScene();
  assert.equal(noAdapter.getState().skipUnlocked, true);
  assert.equal(noAdapter.getState().skipAvailable, false);
  assert.deepEqual(noAdapter.skipScene(), {
    ok: false,
    reason: 'skip_adapter_unavailable',
  });
});

test('checkpoint availability follows the scene runtime instead of being frozen at boot', () => {
  const storage = new MemoryStorage();
  let checkpointReady = false;
  let restarts = 0;
  const recovery = createSceneRecovery({
    sceneId: 'airstrip_smuggling',
    storage,
    restartCheckpoint: () => { restarts++; },
    canRestartCheckpoint: () => checkpointReady,
    restartScene: () => {},
    completeAndSkip: () => {},
  });

  assert.equal(recovery.getState().checkpointAvailable, false);
  assert.deepEqual(recovery.restartFromCheckpoint(), {
    ok: false,
    reason: 'checkpoint_unavailable',
  });
  checkpointReady = true;
  assert.equal(recovery.getState().checkpointAvailable, true);
  recovery.restartFromCheckpoint();
  assert.equal(restarts, 1);
  assert.equal(recovery.getState().checkpointRestarts, 1);
});

test('a deliberate campaign reset clears recovery attempts for the next run', () => {
  const storage = new MemoryStorage();
  const recovery = createSceneRecovery({
    sceneId: 'bada_bing_one',
    storage,
    restartScene: () => {},
    completeAndSkip: () => {},
  });
  recovery.restartScene();
  recovery.restartScene();
  assert.equal(recovery.getState().skipUnlocked, true);

  const campaign = createCampaign({ storage });
  assert.ok(campaign.reset());

  const nextRun = createSceneRecovery({
    sceneId: 'bada_bing_one',
    storage,
    restartScene: () => {},
    completeAndSkip: () => {},
  });
  assert.equal(nextRun.getState().sceneRestarts, 0);
  assert.equal(nextRun.getState().skipUnlocked, false);
});

test('a deliberate preview reset clears only the preview recovery ledger', () => {
  const canonical = new MemoryStorage(new Map([['sentinel', 'keep-me']]));
  const previewSession = new MemoryStorage();
  const oldLocation = globalThis.location;
  const oldStorage = globalThis.localStorage;
  const oldSessionStorage = globalThis.sessionStorage;
  const oldRuntime = globalThis.__squatchLifePreviewRuntime;
  globalThis.localStorage = canonical;
  globalThis.sessionStorage = previewSession;
  globalThis.location = { pathname: '/game/graveyard.html', search: '?preview=1' };
  delete globalThis.__squatchLifePreviewRuntime;

  try {
    const recovery = createSceneRecovery({
      sceneId: 'squatch_graveyard',
      restartScene: () => {},
      completeAndSkip: () => {},
    });
    recovery.restartScene();
    recovery.restartScene();
    assert.equal(recovery.getState().skipUnlocked, true);

    const previewCampaign = createCampaign();
    assert.ok(previewCampaign.reset());
    const nextRun = createSceneRecovery({
      sceneId: 'squatch_graveyard',
      restartScene: () => {},
      completeAndSkip: () => {},
    });
    assert.equal(nextRun.getState().sceneRestarts, 0);
    assert.equal(canonical.getItem('sentinel'), 'keep-me');
  } finally {
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
    if (oldStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = oldStorage;
    if (oldSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = oldSessionStorage;
    if (oldRuntime === undefined) delete globalThis.__squatchLifePreviewRuntime;
    else globalThis.__squatchLifePreviewRuntime = oldRuntime;
  }
});
