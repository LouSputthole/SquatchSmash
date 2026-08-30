import assert from 'node:assert/strict';
import test from 'node:test';

import { MISSION_LIVENESS_SIGNAL } from '../src/core/mission-liveness.js';
import {
  parseMissionLivenessDocument,
  renderMissionLivenessReport,
  verifyMissionLivenessObservations,
} from '../tools/verify-scene-liveness.mjs';

const passObservation = {
  sceneId: 'test_scene',
  phase: 'active',
  checkpoint: 'entrance',
  terminal: false,
  pendingAutomaticTransition: false,
  progressActions: [{ id: 'interact', enabled: true, reachable: true }],
};

const failObservation = {
  sceneId: 'test_scene',
  phase: 'dead_end',
  checkpoint: 'after_interaction',
  terminal: false,
  pendingAutomaticTransition: false,
  progressActions: [],
};

test('document parser accepts only explicit observation collections', () => {
  assert.deepEqual(
    parseMissionLivenessDocument([passObservation]),
    [passObservation],
  );
  assert.deepEqual(
    parseMissionLivenessDocument({ observations: [passObservation] }),
    [passObservation],
  );
  assert.throws(
    () => parseMissionLivenessDocument({ scene: passObservation }, { source: 'bad.json' }),
    /bad\.json must contain an observation array/,
  );
});

test('empty certification is UNKNOWN rather than a vacuous pass', () => {
  const report = verifyMissionLivenessObservations([]);

  assert.equal(report.status, 'UNKNOWN');
  assert.equal(report.ok, false);
  assert.deepEqual(report.counts, {
    total: 0,
    PASS: 0,
    FAIL: 0,
    UNKNOWN: 0,
  });
  assert.deepEqual(report.diagnostics, [{
    kind: 'UNKNOWN',
    code: 'NO_OBSERVATIONS',
    message: 'no mission states were supplied; an empty certification cannot pass',
  }]);
});

test('verifier aggregates PASS, FAIL, and UNKNOWN without turning unknown green', () => {
  const report = verifyMissionLivenessObservations([
    passObservation,
    failObservation,
    {
      sceneId: 'other_scene',
      phase: 'unadapted',
      checkpoint: null,
      terminal: false,
      pendingAutomaticTransition: false,
    },
  ]);

  assert.equal(report.status, 'FAIL');
  assert.equal(report.ok, false);
  assert.deepEqual(report.counts, {
    total: 3,
    PASS: 1,
    FAIL: 1,
    UNKNOWN: 1,
  });
});

test('UNKNOWN is the aggregate result when no known failure exists', () => {
  const report = verifyMissionLivenessObservations([
    passObservation,
    {
      sceneId: 'other_scene',
      phase: 'navigation_unobserved',
      checkpoint: 'hallway',
      terminal: false,
      pendingAutomaticTransition: false,
      progressActions: [{
        id: 'walk_to_exit',
        enabled: true,
        reachable: {
          state: MISSION_LIVENESS_SIGNAL.UNKNOWN,
          reason: 'the Adapter did not publish a navigation sample',
        },
      }],
    },
  ]);

  assert.equal(report.status, 'UNKNOWN');
  assert.equal(report.ok, false);
  assert.deepEqual(report.counts, {
    total: 2,
    PASS: 1,
    FAIL: 0,
    UNKNOWN: 1,
  });
});

test('duplicate scene, checkpoint, and phase observations are rejected', () => {
  assert.throws(
    () => verifyMissionLivenessObservations([passObservation, { ...passObservation }]),
    /duplicate mission liveness observation: scene=test_scene phase=active checkpoint=entrance/,
  );
});

test('rendered report carries aggregate status and actionable state labels', () => {
  const report = verifyMissionLivenessObservations([failObservation]);
  const rendered = renderMissionLivenessReport(report);

  assert.match(rendered, /^Scene liveness: FAIL \(0 PASS, 1 FAIL, 0 UNKNOWN; 1 total\)/);
  assert.match(rendered,
    /FAIL scene=test_scene phase=dead_end checkpoint=after_interaction:/);
  assert.match(rendered, /BLOCKED NO_PROGRESS_ACTIONS/);
  assert.match(rendered, /FAILURE DEAD_STATE/);
});
