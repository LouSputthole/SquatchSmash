import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { assistTimingWindow, ASSIST_TIMING_SCALE } from '../src/core/assist-timing.js';
import {
  gameplayKeyPlan,
  gameplayPromptPlan,
  GAMEPLAY_ACTIONS,
  projectGameplayKeyPrompts,
  writeGameplayPromptKey,
} from '../src/core/gameplay-key-adapter.js';
import {
  applyAccessiblePresentation,
  HUD_REGION_SELECTOR,
  OBJECTIVE_REGION_SELECTOR,
} from '../src/core/systemic-presentation.js';
import { beginStart, installStartGate, START_CONTROL_SELECTOR } from '../src/core/start-gate.js';
import {
  createHiddenOnlySceneLifecycleAdapter,
  HIDDEN_ONLY_SCENE_CALLBACK_ENTRYPOINTS,
} from '../src/core/pause-menu.js';
import { BankGuardThreat } from '../src/heist/bank-threat.js';
import { ReactionWindow } from '../src/silvercase/combat/ReactionWindow.js';
import {
  set as setSetting,
  shakeScale,
  projectGameplayKeysInText,
  translateKey,
  withCanonicalKeyDispatch,
} from '../src/core/settings.js';
import {
  missionResultRows,
  MISSION_RESULT_FIELDS,
} from '../src/core/mission-results.js';
import {
  registerSceneAudioContext,
  registerSceneRenderer,
  sceneLifecycleSnapshot,
  setSceneLifecyclePaused,
} from '../src/core/scene-lifecycle.js';
import {
  SYSTEMIC_POLISH_FIXES,
  SYSTEMIC_SCENE_ADOPTERS,
} from '../src/core/systemic-polish.js';
import { MISSION_IDS } from '../src/core/campaign.js';
import {
  HEAVY_SCENE_ENTRYPOINTS,
  PIXEL_RATIO_CAP,
  PIXEL_RATIO_CAP_HEAVY,
  pixelRatioCapForScene,
} from '../src/core/pixel-ratio.js';

const EXPECTED_FIXES = [
  'accessible-live-regions',
  'terminal-modal-focus',
  'gameplay-action-rebinding',
  'shared-assist-timing',
  'reduced-motion',
  'hidden-tab-pause-lifecycle',
  'heavy-scene-initial-dpr',
  'idempotent-start-loading',
  'durable-completion-results',
];

const EXPECTED_ADOPTERS = [
  'src/main.js',
  'src/bing/main.js',
  'src/bing/hotdog-main.js',
  'src/squatchfather/main.js',
  'src/beefrun/main.js',
  'src/graveyard/main.js',
  'src/motel/main.js',
  'src/nowake/main.js',
  'src/silver/main.js',
  'src/golf/main.js',
  'src/heist/main.js',
  'src/silvercase/main.js',
  'src/mansion/main.js',
  'src/mansion/siege/main.js',
  'src/enolasquatch/main.js',
  'src/cartel-palace/main.js',
  'src/initiation/main.js',
];

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('systemic contract enumerates exactly nine fixes and every public scene adopter', async () => {
  assert.deepEqual(SYSTEMIC_POLISH_FIXES, EXPECTED_FIXES);
  assert.deepEqual(SYSTEMIC_SCENE_ADOPTERS, EXPECTED_ADOPTERS);
  for (const entry of EXPECTED_ADOPTERS) {
    assert.match(await source(entry), /createPauseMenu\s*\(/, `${entry} lost the shared polish Seam`);
  }
});

test('the nine contracts are source-bound to deep shared Modules and exact Adapters', async () => {
  const [pause, settings, presentation, start, audio, motelAudio, squatchfatherAudio,
    player, postfx, noWakeCamera, silver, heist, silverCase] = await Promise.all([
    source('src/core/pause-menu.js'),
    source('src/core/settings.js'),
    source('src/core/systemic-presentation.js'),
    source('src/core/start-gate.js'),
    source('src/core/audio.js'),
    source('src/motel/audio.js'),
    source('src/squatchfather/audio/core.js'),
    source('src/core/player.js'),
    source('src/core/postfx.js'),
    source('src/nowake/camera-director.js'),
    source('src/silver/perform.js'),
    source('src/heist/bank-threat.js'),
    source('src/silvercase/combat/ReactionWindow.js'),
  ]);

  assert.match(presentation, /OBJECTIVE_REGION_SELECTOR/);       // 1
  assert.match(presentation, /#overlay\.ending/);
  assert.match(presentation, /returnFocus/);                     // 2
  assert.match(pause, /installSystemicPolish/);
  assert.deepEqual(GAMEPLAY_ACTIONS, ['interact', 'utility', 'reload', 'backAction']); // 3
  for (const timed of [silver, heist, silverCase]) assert.match(timed, /assistTimingWindow/); // 4
  assert.match(settings, /body\.reduce-motion/);                 // 5
  assert.match(player, /motionDuration/);
  assert.match(noWakeCamera, /reducedMotionEnabled/);
  assert.match(pause, /visibilitychange/);                       // 6
  assert.match(pause, /setSceneLifecyclePaused/);
  assert.match(postfx, /isSceneLifecyclePaused/);
  assert.match(audio, /registerSceneAudioContext/);
  assert.match(motelAudio, /registerSceneAudioContext/);
  assert.match(squatchfatherAudio, /registerSceneAudioContext/);
  /* The Special Meeting joined this list when it was built: a night exterior
   * with a city block, a running car and a forest in it belongs beside the
   * mansion and the Beef Run rather than beside the flat. */
  assert.deepEqual(HEAVY_SCENE_ENTRYPOINTS, [                    // 7
    'beefrun.html', 'enolasquatch.html', 'silver.html', 'nowake.html',
    'mansion.html', 'mansion-siege.html', 'specialmeeting.html',
  ]);
  assert.match(start, /systemicStartState === 'pending'/);       // 8
  assert.ok(Object.keys(MISSION_RESULT_FIELDS).length >= 15);    // 9
});

test('gameplay action remapping swaps, remaps, and blocks displaced defaults', () => {
  const map = {
    forward: 'KeyE', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft',
    crouch: 'KeyC', jump: 'Space', interact: 'KeyW', utility: 'KeyF', reload: 'KeyZ',
    backAction: 'KeyQ',
  };
  const interaction = gameplayKeyPlan('KeyW', map);
  const movement = gameplayKeyPlan('KeyE', map);
  assert.deepEqual(interaction, { type: 'remap', action: 'interact', code: 'KeyE' });
  assert.deepEqual(movement, { type: 'remap', action: 'forward', code: 'KeyW' });
  assert.equal(withCanonicalKeyDispatch(interaction.code, () => translateKey(interaction.code)), 'KeyE');
  assert.equal(withCanonicalKeyDispatch(movement.code, () => translateKey(movement.code)), 'KeyW');
  assert.deepEqual(gameplayKeyPlan('KeyZ', map), { type: 'remap', action: 'reload', code: 'KeyR' });
  assert.deepEqual(gameplayKeyPlan('KeyR', map), { type: 'block', action: 'reload', code: null });

  const kbd = { textContent: 'E', dataset: {} };
  const promptDoc = { querySelectorAll: (selector) => selector === 'kbd' ? [kbd] : [] };
  assert.equal(projectGameplayKeyPrompts(promptDoc, null, map), 1);
  assert.equal(kbd.textContent, 'W');
  const secondMap = { ...map, interact: 'KeyX' };
  assert.equal(projectGameplayKeyPrompts(promptDoc, null, secondMap), 1);
  assert.equal(kbd.textContent, 'X');
  assert.deepEqual(gameplayPromptPlan('Q', secondMap), { action: 'backAction', label: 'Q' });
  assert.equal(projectGameplayKeysInText('E interact · F use · R reload · Q back', secondMap),
    'X interact · F use · Z reload · Q back');
});

test('live prompt writers project span and kbd labels once without per-frame churn', async () => {
  const map = {
    interact: 'KeyW', utility: 'KeyX', reload: 'KeyZ', backAction: 'KeyC',
  };
  let visible = 'E';
  let writes = 0;
  const prompt = {
    dataset: {},
    get textContent() { return visible; },
    set textContent(value) { visible = value; writes++; },
  };
  assert.equal(writeGameplayPromptKey(prompt, 'E', map), 'W');
  assert.equal(visible, 'W');
  assert.equal(writes, 1);
  assert.equal(prompt.dataset.systemicAction, 'interact');
  assert.equal(writeGameplayPromptKey(prompt, 'E', map), 'W');
  assert.equal(writes, 1, 'a repeated InteractionSystem frame must not rewrite the prompt');
  assert.equal(writeGameplayPromptKey(prompt, 'HOLD E', map), 'HOLD W');
  assert.equal(visible, 'HOLD W');
  assert.equal(writes, 2);
  assert.equal(writeGameplayPromptKey(prompt, 'HOLD E', map), 'HOLD W');
  assert.equal(writes, 2, 'compound hold prompts must also remain idempotent');

  for (const entry of [
    'src/core/hud.js',
    'src/heist/hud.js',
    'src/silvercase/main.js',
    'src/mansion/main.js',
    'src/mansion/siege/main.js',
    'src/squatchfather/main.js',
    'src/squatchfather/interaction/InteractionSystem.js',
    'src/squatchfather/interaction/WeaponDropInteraction.js',
  ]) {
    assert.match(await source(entry), /writeGameplayPromptKey/, `${entry} bypasses live key projection`);
  }
});

test('Assist policy keeps authored defaults exact and widens hard windows consistently', () => {
  assert.equal(ASSIST_TIMING_SCALE, 1.4);
  assert.equal(assistTimingWindow(2.75, { assist: false }), 2.75);
  assert.equal(assistTimingWindow(2.75, { assist: true }), 3.85);
  assert.equal(assistTimingWindow(0.62, { assist: true, assisted: 0.86 }), 0.86);
  assert.throws(() => assistTimingWindow(0), /positive base duration/);
});

test('Assist is armed late and survives a Heist checkpoint restore', () => {
  setSetting('assist', true);
  try {
    const threat = new BankGuardThreat({ windowSeconds: 2.75 });
    assert.equal(threat.start(), true);
    assert.equal(threat.windowSeconds, 3.85);
    threat.update(1);
    const snapshot = threat.capture();
    threat.reset();
    threat.restore(snapshot);
    assert.equal(threat.windowSeconds, 3.85);
    assert.equal(threat.snapshot().remaining, 2.85);

    const ambush = new ReactionWindow({ windowSeconds: 3.2 });
    assert.equal(ambush.start({ readinessBonus: true }), true);
    assert.equal(ambush.windowSeconds, 4.9);
  } finally {
    setSetting('assist', false);
  }
});

test('pause lifecycle suppresses registered rendering and resumes only running audio', async () => {
  let renders = 0;
  const renderer = { render() { renders++; return 'frame'; } };
  const context = {
    state: 'running',
    suspendCalls: 0,
    resumeCalls: 0,
    suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); },
    resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); },
  };
  const removeRenderer = registerSceneRenderer(renderer);
  const removeAudio = registerSceneAudioContext(context);
  assert.equal(renderer.render(), 'frame');
  setSceneLifecyclePaused(true, { reason: 'test' });
  assert.equal(renderer.render(), undefined);
  assert.equal(renders, 1);
  assert.equal(context.suspendCalls, 1);
  assert.equal(sceneLifecycleSnapshot().reason, 'test');
  setSceneLifecyclePaused(false);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(context.resumeCalls, 1);
  renderer.render();
  assert.equal(renders, 2);
  removeRenderer();
  removeAudio();
});

test('an immediate resume waits for an in-flight audio suspension', async () => {
  let finishSuspend;
  const context = {
    state: 'running', suspendCalls: 0, resumeCalls: 0,
    suspend() {
      this.suspendCalls++;
      return new Promise((resolve) => {
        finishSuspend = () => { this.state = 'suspended'; resolve(); };
      });
    },
    resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); },
  };
  const remove = registerSceneAudioContext(context);
  setSceneLifecyclePaused(true, { reason: 'race-test' });
  setSceneLifecyclePaused(false);
  assert.equal(context.resumeCalls, 0);
  finishSuspend();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(context.state, 'running');
  assert.equal(context.resumeCalls, 1);
  remove();
});

test('only frozen Initiation uses scene callbacks for a hidden terminal hold', () => {
  assert.deepEqual(HIDDEN_ONLY_SCENE_CALLBACK_ENTRYPOINTS, ['initiation.html']);
  let pauses = 0;
  let resumes = 0;
  const initiation = createHiddenOnlySceneLifecycleAdapter({
    location: { pathname: '/game/initiation.html' },
    onPause: () => { pauses++; },
    onResume: () => { resumes++; },
  });
  assert.equal(initiation.enabled, true);
  assert.equal(initiation.hold(), true);
  assert.equal(initiation.hold(), false);
  assert.equal(pauses, 1);
  assert.equal(initiation.release(), true);
  assert.equal(initiation.release(), false);
  assert.equal(resumes, 1);

  const apartment = createHiddenOnlySceneLifecycleAdapter({
    location: { pathname: '/index.html' },
    onPause: () => { pauses++; },
    onResume: () => { resumes++; },
  });
  assert.equal(apartment.enabled, false);
  assert.equal(apartment.hold(), false);
  assert.equal(apartment.release(), false);
  assert.equal(pauses, 1);
  assert.equal(resumes, 1);
});

test('OS reduced-motion preference also scales shared camera shake', () => {
  const priorWindow = globalThis.window;
  const host = priorWindow ?? {};
  const priorMatchMedia = host.matchMedia;
  const media = { matches: true, addEventListener() {} };
  host.matchMedia = () => media;
  globalThis.window = host;
  try {
    setSetting('reduceShake', false);
    assert.equal(shakeScale(), 0.3);
    media.matches = false;
    assert.equal(shakeScale(), 1);
  } finally {
    if (priorMatchMedia === undefined) delete host.matchMedia;
    else host.matchMedia = priorMatchMedia;
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});

test('HUD semantics remain hidden before Start and become live with body.playing', () => {
  const attrs = new Map([['aria-hidden', 'true']]);
  const hud = {
    getAttribute: (name) => attrs.get(name) ?? null,
    setAttribute: (name, value) => attrs.set(name, String(value)),
  };
  const objectiveAttrs = new Map();
  const objective = {
    getAttribute: (name) => objectiveAttrs.get(name) ?? null,
    setAttribute: (name, value) => objectiveAttrs.set(name, String(value)),
  };
  let playing = false;
  const doc = {
    body: { classList: { contains: (name) => name === 'playing' && playing } },
    querySelectorAll: (selector) => {
      if (selector === HUD_REGION_SELECTOR) return [hud];
      if (selector === OBJECTIVE_REGION_SELECTOR) return [objective];
      return [];
    },
  };
  applyAccessiblePresentation(doc);
  assert.equal(attrs.get('aria-hidden'), 'true');
  playing = true;
  applyAccessiblePresentation(doc);
  assert.equal(attrs.get('aria-hidden'), 'false');
  assert.equal(attrs.get('role'), 'region');
  assert.match(HUD_REGION_SELECTOR, /\.ss-hud/);
  assert.match(OBJECTIVE_REGION_SELECTOR, /\.ss-objective/);
  assert.equal(objectiveAttrs.get('role'), 'status');
  assert.equal(objectiveAttrs.get('aria-live'), 'polite');
});

test('Start gate blocks pending clicks, passes terminal reuse, and rearms unavailable starts', async () => {
  let clickHandler;
  let status = null;
  const doc = {
    addEventListener: (type, fn) => { if (type === 'click') clickHandler = fn; },
    removeEventListener() {},
    documentElement: {},
    createElement: () => ({
      dataset: {}, className: '', textContent: '',
      setAttribute() {}, remove() { status = null; },
    }),
  };
  const win = { addEventListener() {}, removeEventListener() {} };
  const api = installStartGate({ doc, win });
  const parent = { querySelector: () => status };
  const button = {
    dataset: { systemicStartState: 'started' },
    disabled: false,
    onclick: null,
    parentElement: parent,
    closest: (selector) => selector === START_CONTROL_SELECTOR ? button : null,
    setAttribute(name) { if (name === 'aria-busy') this.ariaBusy = true; },
    removeAttribute(name) { if (name === 'aria-busy') this.ariaBusy = false; },
    insertAdjacentElement(_where, node) { status = node; },
  };
  let prevented = false;
  clickHandler({ target: button, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  button.dataset.systemicStartState = 'pending';
  clickHandler({ target: button, preventDefault: () => { prevented = true; }, stopImmediatePropagation() {} });
  assert.equal(prevented, true);

  button.dataset.systemicStartState = 'ready';
  prevented = false;
  clickHandler({ target: button, preventDefault: () => { prevented = true; }, stopImmediatePropagation() {} });
  button.disabled = true;
  await Promise.resolve();
  assert.equal(prevented, false);
  assert.equal(button.dataset.systemicStartState, 'ready');
  assert.equal(button.ariaBusy, false);
  assert.equal(status, null);
  api.destroy();
});

test('heavy entrypoints receive the same initial cap while ordinary scenes keep the shared cap', () => {
  for (const page of HEAVY_SCENE_ENTRYPOINTS) {
    assert.equal(pixelRatioCapForScene({ pathname: `/game/${page}` }), PIXEL_RATIO_CAP_HEAVY);
  }
  assert.equal(pixelRatioCapForScene({ pathname: '/game/graveyard.html' }), PIXEL_RATIO_CAP);
});

test('completion rows contain only durable facts from a completed mission', () => {
  const state = {
    scene: { id: 'bank_heist' },
    missions: {
      [MISSION_IDS.BANK_HEIST]: {
        status: 'complete', outcome: 'clean', grossTake: 1470000, familyShare: 735000,
        bagsRecovered: 4, civiliansHarmed: 0, alarmTriggered: false, crewSurvived: true,
      },
    },
  };
  const rows = missionResultRows(state, MISSION_IDS.BANK_HEIST);
  assert.deepEqual(rows.map(({ key }) => key), [
    'outcome', 'grossTake', 'familyShare', 'bagsRecovered',
    'civiliansHarmed', 'alarmTriggered', 'crewSurvived',
  ]);
  assert.equal(rows.find(({ key }) => key === 'grossTake').value, '$1,470,000');
  assert.equal(rows.find(({ key }) => key === 'alarmTriggered').value, 'No');
  state.missions[MISSION_IDS.BANK_HEIST].status = 'in_progress';
  assert.deepEqual(missionResultRows(state, MISSION_IDS.BANK_HEIST), []);
});
