import assert from 'node:assert/strict';
import test from 'node:test';

import { listSceneEntrypoints } from '../src/core/scene-contracts.js';
import {
  SEMANTIC_SMOKE_BROWSER_ADAPTERS,
  buildSemanticSmokeCases,
  evaluateSemanticSmokeObligation,
  executeSemanticSmokeCase,
} from '../tools/semantic-smoke-browser.mjs';

test('the browser Adapter registry explicitly covers every runtime entry variant', () => {
  const expectedIds = listSceneEntrypoints().map(({ id }) => id).sort();
  const adapterIds = Object.keys(SEMANTIC_SMOKE_BROWSER_ADAPTERS).sort();
  const cases = buildSemanticSmokeCases();

  assert.equal(expectedIds.length, 20);
  assert.deepEqual(adapterIds, expectedIds);
  assert.deepEqual(cases.map(({ entrypointId }) => entrypointId).sort(), expectedIds);
  assert.ok(cases.every(({ obligations }) => obligations.length > 0));
  assert.ok(cases.every(({ adapter }) => typeof adapter.observable === 'boolean'));
  const observable = cases.filter(({ adapter }) => adapter.observable);
  assert.deepEqual(observable.map(({ entrypointId }) => entrypointId).sort(), [
    'bada_bing_two_hotdog', 'special_meeting_canonical', 'squatch_graveyard_canonical',
  ]);
  const audioEvidence = observable.filter(({ adapter }) => adapter.audio);
  assert.deepEqual(audioEvidence.map(({ entrypointId }) => entrypointId), [
    'special_meeting_canonical',
  ]);
  assert.ok(audioEvidence.every(({ adapter }) => adapter.audio.minimumEngines >= 1));
  assert.ok(audioEvidence.every(({ adapter }) => adapter.audio.minimumRequiredReceipts >= 1));
  assert.ok(audioEvidence.every(({ adapter }) => adapter.audio.requiredCuePrefixes.length > 0));
});

test('a declared audio evidence contract cannot be vacuous', () => {
  const original = SEMANTIC_SMOKE_BROWSER_ADAPTERS.special_meeting_canonical;
  const audio = { ...original.audio };
  delete audio.minimumEngines;
  const adapter = { ...original, audio };
  const adapters = {
    ...SEMANTIC_SMOKE_BROWSER_ADAPTERS,
    special_meeting_canonical: adapter,
  };
  assert.throws(() => buildSemanticSmokeCases({ adapters }), /at least one AudioEngine/i);
});

class FakeBootPage {
  constructor() {
    this.handlers = new Map();
    this.gotoCalls = [];
    this.initScripts = [];
  }

  async addInitScript(script) {
    this.initScripts.push(script);
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
  }

  off(event, handler) {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter((item) => item !== handler));
  }

  async goto(url, options) {
    this.gotoCalls.push({ url, options });
    return { status: () => 200 };
  }

  async evaluate(fn) {
    if (fn.name === 'observeQaAudioPolicy') {
      return {
        installed: true,
        strictRequiredRecordings: true,
        engineCount: 1,
        strictEngineCount: 1,
        receiptCount: 1,
        scheduledRequiredRecordingCount: 1,
        violationCount: 0,
        receipts: [{
          requested: 'vo.specialmeeting.test',
          actual: 'vo.specialmeeting.test',
          source: 'buffer',
          started: true,
          requiredRecorded: true,
        }],
      };
    }
    return null;
  }

  emit(event, value) {
    for (const handler of this.handlers.get(event) ?? []) handler(value);
  }
}

test('an entry without an observable debug surface boots but can only report UNKNOWN', async () => {
  const page = new FakeBootPage();
  const smokeCase = buildSemanticSmokeCases()
    .find(({ entrypointId }) => entrypointId === 'apartment_canonical');

  const result = await executeSemanticSmokeCase({
    page,
    smokeCase,
    baseUrl: 'http://127.0.0.1:8123/',
    exerciseJourneys: false,
  });

  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.transport.navigated, true);
  assert.equal(page.initScripts.length, 1);
  assert.equal(result.evidence.audio.strictRequiredRecordings, true);
  assert.equal(page.gotoCalls[0].url, 'http://127.0.0.1:8123/index.html');
  assert.ok(result.obligations.every(({ status }) => status === 'UNKNOWN'));
  assert.match(result.reason, /observation surface/i);
});

class FakeSemanticPage extends FakeBootPage {
  constructor(observations) {
    super();
    this.observations = [...observations];
    this.calls = [];
    this.mouse = {
      move: async (...args) => this.calls.push(['mouse.move', ...args]),
    };
    this.keyboard = {
      down: async (...args) => this.calls.push(['keyboard.down', ...args]),
      up: async (...args) => this.calls.push(['keyboard.up', ...args]),
    };
  }

  locator(selector) {
    return {
      click: async (options) => this.calls.push(['locator.click', selector, options]),
    };
  }

  async waitForFunction(fn, arg, options) {
    this.calls.push(['waitForFunction', fn.name || 'anonymous', arg, options]);
  }

  async waitForTimeout(timeout) {
    this.calls.push(['waitForTimeout', timeout]);
  }

  async evaluate(fn) {
    this.calls.push(['evaluate', fn.name || 'anonymous']);
    if (fn.name === 'observeQaAudioPolicy') return super.evaluate(fn);
    return this.observations.shift();
  }
}

const specialMeetingObservation = ({
  x = 0,
  z = 0,
  yaw = 0,
  pitch = 0,
  keys = [],
  pointerLocked = true,
  route = undefined,
} = {}) => ({
  surfacePresent: true,
  pointerLocked,
  player: {
    enabled: true,
    mode: 'walk',
    position: { x, y: 1.7, z },
    yaw,
    pitch,
    keys,
  },
  camera: { yaw, pitch, owner: null },
  input: {
    pointerLockChanges: 1,
    movementPresses: keys.includes('KeyD') ? 1 : 0,
    lookEvents: yaw || pitch ? 1 : 0,
  },
  objective: { visible: true, count: 1, text: ['Get in the car.'] },
  subjectCounts: {
    player: 1,
    objective_item: 1,
    authored_actor: 4,
    interactable: null,
    meaningful_frame: null,
  },
  ...(route ? { route } : {}),
});

test('the Special Meeting Adapter drives real Playwright click, mouse, and keyboard APIs', async () => {
  const page = new FakeSemanticPage([
    specialMeetingObservation(),
    specialMeetingObservation({ yaw: 0.25, pitch: -0.15 }),
    specialMeetingObservation({ x: 0.6, yaw: 0.25, pitch: -0.15, keys: ['KeyD'] }),
    specialMeetingObservation({ x: 0.6, yaw: 0.25, pitch: -0.15 }),
  ]);
  const smokeCase = buildSemanticSmokeCases()
    .find(({ entrypointId }) => entrypointId === 'special_meeting_canonical');

  const result = await executeSemanticSmokeCase({
    page,
    smokeCase,
    baseUrl: 'http://127.0.0.1:8123/',
    exerciseJourneys: false,
  });

  assert.deepEqual(page.calls.filter(([kind]) => kind === 'locator.click').map(([kind]) => kind),
    ['locator.click']);
  assert.equal(page.calls.filter(([kind]) => kind === 'mouse.move').length, 2);
  assert.deepEqual(page.calls.filter(([kind]) => kind.startsWith('keyboard.'))
    .map(([kind, key]) => [kind, key]), [
    ['keyboard.down', 'd'],
    ['keyboard.up', 'd'],
  ]);
  assert.deepEqual(result.observations.before.player.position, { x: 0, y: 1.7, z: 0 });
  assert.deepEqual(result.observations.after.player.position, { x: 0.6, y: 1.7, z: 0 });
  assert.equal(result.evidence.distanceMoved, 0.6);
  assert.equal(result.evidence.yawDelta, 0.25);
  assert.equal(result.evidence.pitchDelta, -0.15);
  assert.equal(result.evidence.audio.strictEngineCount, 1);

  const realInput = result.obligations.filter(({ assertion }) => assertion.kind === 'real-input');
  assert.deepEqual(realInput.map(({ status }) => status), ['PASS', 'PASS', 'PASS']);
  const look = result.obligations.find(({ assertion }) => (
    assertion.kind === 'camera-behavior' && assertion.behavior === 'look_changes_view'
  ));
  assert.equal(look.status, 'PASS');
  const route = result.obligations.find(({ assertion }) => assertion.kind === 'entrypoint-route');
  assert.equal(route.status, 'UNKNOWN', 'HTTP 200 alone must not certify the campaign variant');
  assert.equal(result.status, 'UNKNOWN', 'unmeasured obligations must keep partial evidence UNKNOWN');
});

test('an entrypoint route passes only with exact runtime variant and exit evidence', async () => {
  const route = {
    entrypointId: 'special_meeting_canonical',
    href: 'specialmeeting.html',
    root: 'src/specialmeeting/main.js',
    observedExits: ['initiation'],
  };
  const page = new FakeSemanticPage([
    specialMeetingObservation({ route }),
    specialMeetingObservation({ yaw: 0.25, pitch: -0.15, route }),
    specialMeetingObservation({ x: 0.6, yaw: 0.25, pitch: -0.15, keys: ['KeyD'], route }),
    specialMeetingObservation({ x: 0.6, yaw: 0.25, pitch: -0.15, route }),
  ]);
  const smokeCase = buildSemanticSmokeCases()
    .find(({ entrypointId }) => entrypointId === 'special_meeting_canonical');
  const result = await executeSemanticSmokeCase({
    page,
    smokeCase,
    baseUrl: 'http://127.0.0.1:8123/',
    exerciseJourneys: false,
  });
  assert.equal(
    result.obligations.find(({ assertion }) => assertion.kind === 'entrypoint-route').status,
    'PASS',
  );
});

test('page errors are captured as FAIL receipts even for an otherwise UNKNOWN Adapter', async () => {
  const page = new FakeBootPage();
  page.goto = async function goto(url, options) {
    this.gotoCalls.push({ url, options });
    this.emit('pageerror', new Error('scene exploded'));
    return { status: () => 200 };
  };
  const smokeCase = buildSemanticSmokeCases()
    .find(({ entrypointId }) => entrypointId === 'apartment_canonical');

  const result = await executeSemanticSmokeCase({
    page,
    smokeCase,
    baseUrl: 'http://127.0.0.1:8123/',
    exerciseJourneys: false,
  });

  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.errors.page, ['scene exploded']);
  assert.equal(result.obligations.find(({ area }) => area === 'boot').status, 'FAIL');
});

test('caught required-recording fallbacks still fail browser certification', async () => {
  const page = new FakeBootPage();
  page.evaluate = async function evaluate(fn) {
    if (fn.name !== 'observeQaAudioPolicy') return null;
    return {
      installed: true,
      strictRequiredRecordings: true,
      engineCount: 1,
      strictEngineCount: 1,
      receiptCount: 1,
      scheduledRequiredRecordingCount: 0,
      violationCount: 1,
      receipts: [],
    };
  };
  const smokeCase = buildSemanticSmokeCases()
    .find(({ entrypointId }) => entrypointId === 'apartment_canonical');

  const result = await executeSemanticSmokeCase({
    page,
    smokeCase,
    baseUrl: 'http://127.0.0.1:8123/',
    exerciseJourneys: false,
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.errors.action.join('\n'), /required recording fallback/i);
});

test('an observable scene cannot pass audio policy with zero registered engines', async () => {
  const page = new FakeSemanticPage([
    specialMeetingObservation(),
    specialMeetingObservation({ yaw: 0.25, pitch: -0.15 }),
    specialMeetingObservation({ x: 0.6, yaw: 0.25, pitch: -0.15, keys: ['KeyD'] }),
    specialMeetingObservation({ x: 0.6, yaw: 0.25, pitch: -0.15 }),
  ]);
  const baseEvaluate = page.evaluate.bind(page);
  page.evaluate = async (fn) => fn.name === 'observeQaAudioPolicy'
    ? {
      installed: true,
      strictRequiredRecordings: true,
      engineCount: 0,
      strictEngineCount: 0,
      receiptCount: 0,
      scheduledRequiredRecordingCount: 0,
      violationCount: 0,
      receipts: [],
    }
    : baseEvaluate(fn);
  const smokeCase = buildSemanticSmokeCases()
    .find(({ entrypointId }) => entrypointId === 'special_meeting_canonical');

  const result = await executeSemanticSmokeCase({
    page,
    smokeCase,
    baseUrl: 'http://127.0.0.1:8123/',
    exerciseJourneys: false,
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.errors.action.join('\n'), /expected at least 1/i);
});

test('an observable scene must schedule an expected required recording', async () => {
  const page = new FakeSemanticPage([
    specialMeetingObservation(),
    specialMeetingObservation({ yaw: 0.25, pitch: -0.15 }),
    specialMeetingObservation({ x: 0.6, yaw: 0.25, pitch: -0.15, keys: ['KeyD'] }),
    specialMeetingObservation({ x: 0.6, yaw: 0.25, pitch: -0.15 }),
  ]);
  const baseEvaluate = page.evaluate.bind(page);
  page.evaluate = async (fn) => fn.name === 'observeQaAudioPolicy'
    ? {
      installed: true,
      strictRequiredRecordings: true,
      engineCount: 1,
      strictEngineCount: 1,
      receiptCount: 1,
      scheduledRequiredRecordingCount: 0,
      violationCount: 0,
      receipts: [{
        requested: 'ambience.alley',
        actual: 'ambience.alley',
        source: 'buffer',
        started: true,
        requiredRecorded: false,
      }],
    }
    : baseEvaluate(fn);
  const smokeCase = buildSemanticSmokeCases()
    .find(({ entrypointId }) => entrypointId === 'special_meeting_canonical');

  const result = await executeSemanticSmokeCase({
    page,
    smokeCase,
    baseUrl: 'http://127.0.0.1:8123/',
    exerciseJourneys: false,
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.errors.action.join('\n'), /scheduled required recording/i);
  assert.match(result.errors.action.join('\n'), /vo\.specialmeeting\./i);
});

test('spawn and checkpoint obligations require exact live-state and legal-action evidence', () => {
  const obligations = buildSemanticSmokeCases()
    .find(({ entrypointId }) => entrypointId === 'special_meeting_canonical').obligations;
  const evidence = {
    after: {
      spawnEvidence: {
        kerb: { requested: 'kerb', effective: 'kerb', live: true, legalActionCount: 2 },
        spur: { requested: 'spur', effective: 'kerb', live: true, legalActionCount: 1 },
      },
      checkpointEvidence: {
        kerb: { requested: 'kerb', effective: 'kerb', live: true, legalActionCount: 2 },
        spur: { requested: 'spur', effective: 'spur', live: true, legalActionCount: 0 },
      },
    },
  };

  const result = Object.fromEntries(obligations
    .filter(({ assertion }) => ['entry-spawn-liveness', 'checkpoint-liveness'].includes(assertion.kind))
    .map((obligation) => [obligation.id, evaluateSemanticSmokeObligation(obligation, evidence).status]));

  assert.equal(result['special_meeting:special_meeting_canonical:spawn:kerb'], 'PASS');
  assert.equal(result['special_meeting:special_meeting_canonical:spawn:spur'], 'FAIL');
  assert.equal(result['special_meeting:special_meeting_canonical:checkpoint:kerb'], 'PASS');
  assert.equal(result['special_meeting:special_meeting_canonical:checkpoint:spur'], 'FAIL');
});

test('camera return certification requires observed ownership and restored real-input view', () => {
  const obligations = buildSemanticSmokeCases()
    .find(({ entrypointId }) => entrypointId === 'special_meeting_canonical').obligations;
  const owner = obligations.find(({ assertion }) => assertion.behavior === 'owner_matches_phase');
  const returned = obligations.find(({ assertion }) => assertion.behavior === 'returns_to_playable_view');

  assert.equal(evaluateSemanticSmokeObligation(owner, {
    after: { camera: { ownerMatchesPhase: true } },
  }).status, 'PASS');
  assert.equal(evaluateSemanticSmokeObligation(returned, {
    after: { camera: { returnedToPlayableView: true } },
  }).status, 'PASS');
  assert.equal(evaluateSemanticSmokeObligation(returned, {
    after: { camera: { returnedToPlayableView: false } },
  }).status, 'FAIL');
});
