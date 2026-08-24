import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateMissionLiveness,
  formatMissionLivenessResult,
  MISSION_LIVENESS_SIGNAL,
  MISSION_LIVENESS_STATUS,
} from '../src/core/mission-liveness.js';

const observedDeadState = (overrides = {}) => ({
  sceneId: 'test_scene',
  phase: 'active',
  checkpoint: 'room_entry',
  terminal: false,
  pendingAutomaticTransition: false,
  progressActions: [],
  ...overrides,
});

test('terminal, automatic, and enabled-reachable action states each prove liveness', () => {
  const terminal = evaluateMissionLiveness(observedDeadState({
    phase: 'complete',
    terminal: true,
  }));
  assert.equal(terminal.status, MISSION_LIVENESS_STATUS.PASS);
  assert.equal(terminal.code, 'TERMINAL_STATE');
  assert.deepEqual(terminal.witness, { kind: 'TERMINAL' });

  const automatic = evaluateMissionLiveness(observedDeadState({
    phase: 'dialogue_outro',
    pendingAutomaticTransition: true,
  }));
  assert.equal(automatic.status, MISSION_LIVENESS_STATUS.PASS);
  assert.equal(automatic.code, 'AUTOMATIC_TRANSITION_PENDING');
  assert.deepEqual(automatic.witness, { kind: 'AUTOMATIC_TRANSITION' });

  const actionable = evaluateMissionLiveness(observedDeadState({
    phase: 'find_exit',
    progressActions: [{
      id: 'open_exit',
      label: 'Open the exit',
      enabled: true,
      reachable: true,
    }],
  }));
  assert.equal(actionable.status, MISSION_LIVENESS_STATUS.PASS);
  assert.equal(actionable.live, true);
  assert.deepEqual(actionable.witness, {
    kind: 'PROGRESS_ACTION',
    actionId: 'open_exit',
  });
});

test('positive evidence proves liveness without requiring irrelevant observations', () => {
  const result = evaluateMissionLiveness({
    sceneId: 'test_scene',
    phase: 'leave_room',
    pendingAutomaticTransition: false,
    progressActions: [{
      id: 'door',
      enabled: true,
      reachable: true,
    }],
  });

  assert.equal(result.status, MISSION_LIVENESS_STATUS.PASS);
  assert.equal(result.code, 'PROGRESS_ACTION_AVAILABLE');
  assert.equal(result.signals.terminal.state, MISSION_LIVENESS_SIGNAL.UNKNOWN);
  assert.deepEqual(result.diagnostics, []);
});

test('an explicit empty action inventory proves a dead state instead of passing vacuously', () => {
  const result = evaluateMissionLiveness(observedDeadState());

  assert.equal(result.status, MISSION_LIVENESS_STATUS.FAIL);
  assert.equal(result.live, false);
  assert.equal(result.code, 'NO_LIVE_PROGRESS_PATH');
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ['NO_PROGRESS_ACTIONS', 'DEAD_STATE'],
  );
});

test('omitted observations are UNKNOWN and cannot certify a dead state', () => {
  const result = evaluateMissionLiveness({
    sceneId: 'test_scene',
    phase: 'unadapted_phase',
    checkpoint: 'unknown_checkpoint',
  });

  assert.equal(result.status, MISSION_LIVENESS_STATUS.UNKNOWN);
  assert.equal(result.live, null);
  assert.equal(result.code, 'LIVENESS_UNRESOLVED');
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ['TERMINAL_UNKNOWN', 'AUTOMATIC_TRANSITION_UNKNOWN', 'PROGRESS_ACTIONS_UNKNOWN'],
  );
});

test('a refused reachability probe stays distinguishable from a known unreachable action', () => {
  const result = evaluateMissionLiveness(observedDeadState({
    progressActions: [{
      id: 'walk_to_objective',
      enabled: true,
      reachable: {
        state: MISSION_LIVENESS_SIGNAL.REFUSED,
        reason: 'navigation probe refused because the player origin was not published',
      },
    }],
  }));

  assert.equal(result.status, MISSION_LIVENESS_STATUS.UNKNOWN);
  assert.deepEqual(result.diagnostics, [{
    kind: 'REFUSAL',
    code: 'ACTION_REACHABLE_REFUSED',
    subject: 'progress action walk_to_objective reachable',
    message: 'navigation probe refused because the player origin was not published',
    actionId: 'walk_to_objective',
  }]);
});

test('an unknown action signal is irrelevant when the other required conjunct is known false', () => {
  const result = evaluateMissionLiveness(observedDeadState({
    progressActions: [{
      id: 'disabled_objective',
      enabled: {
        state: MISSION_LIVENESS_SIGNAL.NO,
        reason: 'the objective is disabled in this phase',
      },
      reachable: {
        state: MISSION_LIVENESS_SIGNAL.UNKNOWN,
        reason: 'no navigation sample was needed for a disabled objective',
      },
    }],
  }));

  assert.equal(result.status, MISSION_LIVENESS_STATUS.FAIL);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ['ACTION_DISABLED', 'DEAD_STATE'],
  );
});

test('NO WAKE post-execution restore shape is reported as a labeled dead state', () => {
  const noWakeRestore = evaluateMissionLiveness({
    sceneId: 'no_wake',
    phase: 'post_execution_restore',
    checkpoint: 'execution_complete',
    terminal: false,
    pendingAutomaticTransition: false,
    progressActions: [{
      id: 'drop_willy',
      label: 'Drop Willy on the deck',
      enabled: {
        state: MISSION_LIVENESS_SIGNAL.NO,
        reason: 'dropWilly guard returned because execution was already recorded',
      },
      reachable: true,
    }],
  });

  assert.equal(noWakeRestore.status, MISSION_LIVENESS_STATUS.FAIL);
  assert.equal(noWakeRestore.code, 'NO_LIVE_PROGRESS_PATH');
  assert.equal(noWakeRestore.sceneId, 'no_wake');
  assert.equal(noWakeRestore.phase, 'post_execution_restore');
  assert.equal(noWakeRestore.checkpoint, 'execution_complete');
  assert.deepEqual(
    noWakeRestore.diagnostics.map(({ code, message }) => ({ code, message })),
    [
      {
        code: 'ACTION_DISABLED',
        message: 'dropWilly guard returned because execution was already recorded',
      },
      {
        code: 'DEAD_STATE',
        message: 'the player has no legal path forward',
      },
    ],
  );
});

test('Hot Dog early-alley shape fails until completion is exposed as a level condition', () => {
  const edgeTriggered = evaluateMissionLiveness({
    sceneId: 'hotdog_incident',
    phase: 'lou_says_leave',
    checkpoint: 'party_cleanup',
    terminal: false,
    pendingAutomaticTransition: false,
    progressActions: [{
      id: 'finish_party_on_alley_entry',
      label: 'Leave through the alley',
      enabled: {
        state: MISSION_LIVENESS_SIGNAL.NO,
        reason: 'the room-entry edge was consumed before this phase began',
      },
      reachable: true,
    }],
  });
  assert.equal(edgeTriggered.status, MISSION_LIVENESS_STATUS.FAIL);
  assert.equal(edgeTriggered.diagnostics[0].message,
    'the room-entry edge was consumed before this phase began');

  const levelTriggered = evaluateMissionLiveness({
    sceneId: 'hotdog_incident',
    phase: 'lou_says_leave',
    checkpoint: 'party_cleanup',
    terminal: false,
    pendingAutomaticTransition: false,
    progressActions: [{
      id: 'finish_party_if_in_alley',
      label: 'Complete the party cleanup',
      enabled: true,
      reachable: true,
    }],
  });
  assert.equal(levelTriggered.status, MISSION_LIVENESS_STATUS.PASS);
  assert.deepEqual(levelTriggered.witness, {
    kind: 'PROGRESS_ACTION',
    actionId: 'finish_party_if_in_alley',
  });
});

test('human-readable diagnostics always include scene, phase, and checkpoint labels', () => {
  const result = evaluateMissionLiveness(observedDeadState({
    sceneId: 'no_wake',
    phase: 'post_execution_restore',
    checkpoint: 'execution_complete',
  }));
  const text = formatMissionLivenessResult(result);

  assert.match(text, /^FAIL scene=no_wake phase=post_execution_restore checkpoint=execution_complete:/);
  assert.match(text, /FAILURE DEAD_STATE: the player has no legal path forward/);
});

test('invalid and ambiguous Adapter observations fail at the contract boundary', () => {
  assert.throws(() => evaluateMissionLiveness({
    sceneId: 'test_scene',
    phase: 'active',
    terminal: 'false',
    pendingAutomaticTransition: false,
    progressActions: [],
  }), /terminal state must be a boolean/);

  assert.throws(() => evaluateMissionLiveness(observedDeadState({
    progressActions: [
      { id: 'interact', enabled: true, reachable: true },
      { id: 'interact', enabled: false, reachable: false },
    ],
  })), /duplicate progress action id: interact/);

  assert.throws(() => evaluateMissionLiveness(observedDeadState({
    progressActions: [{
      id: 'interact',
      enabled: true,
      reachable: { state: MISSION_LIVENESS_SIGNAL.UNKNOWN },
    }],
  })), /unknown requires a reason/);
});
