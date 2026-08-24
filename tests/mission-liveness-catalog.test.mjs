import assert from 'node:assert/strict';
import test from 'node:test';

import { NO_WAKE_CHECKPOINT_IDS } from '../src/core/campaign.js';
import {
  evaluateMissionLiveness,
  MISSION_LIVENESS_SIGNAL,
  MISSION_LIVENESS_STATUS,
} from '../src/core/mission-liveness.js';
import {
  buildHotDogLivenessCatalog,
  buildNoWakeLivenessCatalog,
  buildSceneLivenessCatalog,
  sceneLivenessCatalogDocument,
} from '../tools/scene-liveness-catalog.mjs';
import {
  parseMissionLivenessDocument,
  verifyMissionLivenessObservations,
} from '../tools/verify-scene-liveness.mjs';

function countStatuses(entries) {
  return entries.reduce((counts, entry) => {
    const status = evaluateMissionLiveness(entry.observation).status;
    counts[status] += 1;
    return counts;
  }, { PASS: 0, FAIL: 0, UNKNOWN: 0 });
}

test('NO WAKE catalog drives every exported checkpoint and refuses unexported runtime truth', () => {
  const entries = buildNoWakeLivenessCatalog();

  assert.deepEqual(
    entries.map(({ campaignCheckpoint }) => campaignCheckpoint),
    NO_WAKE_CHECKPOINT_IDS,
    'the catalog must drift with the actual persisted checkpoint whitelist',
  );
  assert.deepEqual(countStatuses(entries), { PASS: 1, FAIL: 0, UNKNOWN: 5 });

  for (const entry of entries.slice(0, -1)) {
    assert.equal(entry.observation.phase, 'restore');
    assert.equal(Object.hasOwn(entry.observation, 'progressActions'), false,
      `${entry.id} must not invent an action inventory the story does not export`);
    const result = evaluateMissionLiveness(entry.observation);
    assert.equal(result.status, MISSION_LIVENESS_STATUS.UNKNOWN);
    assert.deepEqual(
      result.diagnostics.map(({ code }) => code),
      ['AUTOMATIC_TRANSITION_REFUSED', 'PROGRESS_ACTIONS_UNKNOWN'],
    );
  }

  const execution = entries.find(({ campaignCheckpoint }) => campaignCheckpoint === 'execution');
  const executionResult = evaluateMissionLiveness(execution.observation);
  assert.match(executionResult.diagnostics[0].message,
    /does not expose the runtime phase or pending timer/);

  const returned = entries.at(-1);
  assert.equal(returned.campaignCheckpoint, 'returned');
  assert.equal(returned.observation.phase, 'complete');
  assert.equal(evaluateMissionLiveness(returned.observation).status,
    MISSION_LIVENESS_STATUS.PASS);
});

test('Hot Dog catalog enumerates every actual model phase and all cleanup restore subsets', () => {
  const entries = buildHotDogLivenessCatalog();
  const phases = [...new Set(entries.map(({ machinePhase }) => machinePhase))];

  assert.equal(entries.length, 20);
  assert.deepEqual(phases, [
    'lot',
    'party',
    'performance',
    'tension',
    'attack',
    'cleanup',
    'body-ready',
    'debrief',
    'sweep',
    'done',
  ]);

  const cleanup = entries.filter(({ machinePhase }) => machinePhase === 'cleanup');
  assert.equal(cleanup.length, 8, 'three independent floor tasks have exactly 2^3 restore subsets');
  assert.deepEqual(cleanup.map(({ restoreShape }) => restoreShape), [
    'cleanup_tasks=none',
    'cleanup_tasks=bathrooms',
    'cleanup_tasks=cleaning_kit',
    'cleanup_tasks=bathrooms+cleaning_kit',
    'cleanup_tasks=missing_evidence',
    'cleanup_tasks=bathrooms+missing_evidence',
    'cleanup_tasks=cleaning_kit+missing_evidence',
    'cleanup_tasks=bathrooms+cleaning_kit+missing_evidence',
  ]);
  assert.equal(cleanup[0].campaignCheckpoint, 'attack');
  assert.ok(cleanup.slice(1).every(({ campaignCheckpoint }) => campaignCheckpoint === 'cleanup'));

  assert.deepEqual(countStatuses(entries), { PASS: 1, FAIL: 0, UNKNOWN: 19 });
  assert.equal(entries.at(-1).machinePhase, 'done');
  assert.equal(evaluateMissionLiveness(entries.at(-1).observation).status,
    MISSION_LIVENESS_STATUS.PASS);
});

test('Hot Dog nonterminal model eligibility never masquerades as spatial reachability', () => {
  const entries = buildHotDogLivenessCatalog();
  for (const entry of entries.filter(({ machinePhase }) => machinePhase !== 'done')) {
    const result = evaluateMissionLiveness(entry.observation);
    assert.equal(result.status, MISSION_LIVENESS_STATUS.UNKNOWN, entry.id);
    for (const action of result.progressActions || []) {
      assert.notEqual(action.reachable.state, MISSION_LIVENESS_SIGNAL.YES,
        `${entry.id}/${action.id} manufactured a reachable action`);
    }
    assert.ok(result.diagnostics.some(({ kind }) => kind === 'REFUSAL'),
      `${entry.id} must say exactly which exported runtime fact is missing`);
  }

  for (const id of ['hotdog:performance', 'hotdog:tension', 'hotdog:sweep:handoff']) {
    const entry = entries.find((candidate) => candidate.id === id);
    const result = evaluateMissionLiveness(entry.observation);
    assert.equal(result.signals.pendingAutomaticTransition.state,
      MISSION_LIVENESS_SIGNAL.REFUSED);
    assert.equal(result.diagnostics[0].code, 'AUTOMATIC_TRANSITION_REFUSED');
  }
});

test('the audited Hot Dog early-alley boundary is explicitly unresolved by the model', () => {
  const departing = buildHotDogLivenessCatalog()
    .find(({ id }) => id === 'hotdog:sweep:departing');
  const result = evaluateMissionLiveness(departing.observation);

  assert.equal(departing.machinePhase, 'sweep');
  assert.equal(departing.campaignCheckpoint, 'body_loaded');
  assert.equal(result.status, MISSION_LIVENESS_STATUS.UNKNOWN);
  assert.deepEqual(result.witness, null);
  assert.deepEqual(result.diagnostics.map(({ code }) => code), [
    'ACTION_REACHABLE_REFUSED',
  ]);
  assert.match(result.diagnostics[0].message,
    /owns room and door state, including the already-in-yard level condition/);
});

test('combined catalog is verifier-compatible and reports exact non-vacuous coverage', () => {
  const entries = buildSceneLivenessCatalog();
  const observations = entries.map(({ observation }) => observation);
  const report = verifyMissionLivenessObservations(observations);

  assert.equal(entries.length, 26);
  assert.deepEqual(report.counts, {
    total: 26,
    PASS: 2,
    FAIL: 0,
    UNKNOWN: 24,
  });
  assert.equal(report.status, MISSION_LIVENESS_STATUS.UNKNOWN);
  assert.equal(report.ok, false, '24 unobservable states must not produce a green catalog');

  const document = sceneLivenessCatalogDocument();
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.sources.length, 5);
  assert.deepEqual(
    parseMissionLivenessDocument(document),
    observations,
    'catalog JSON must feed the generic verifier without an Adapter-specific parser',
  );
});
