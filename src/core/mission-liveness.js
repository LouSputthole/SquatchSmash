/**
 * Deterministic mission-state liveness evaluation.
 *
 * A state is live when it is terminal, owns a pending automatic transition, or
 * exposes at least one progress action that is both enabled and reachable.
 * Missing observations are UNKNOWN rather than false so an incomplete Adapter
 * cannot turn an uninspected state into a green result.
 */

export const MISSION_LIVENESS_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  UNKNOWN: 'UNKNOWN',
});

export const MISSION_LIVENESS_SIGNAL = Object.freeze({
  YES: 'YES',
  NO: 'NO',
  UNKNOWN: 'UNKNOWN',
  REFUSED: 'REFUSED',
});

const SIGNAL_STATES = new Set(Object.values(MISSION_LIVENESS_SIGNAL));

function requiredLabel(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`mission liveness requires a non-empty ${name}`);
  }
  return value.trim();
}

function optionalLabel(value, name) {
  if (value === undefined || value === null) return null;
  return requiredLabel(value, name);
}

function freezeSignal(state, reason = null) {
  return Object.freeze({ state, reason });
}

function normalizeSignal(value, subject) {
  if (value === true) return freezeSignal(MISSION_LIVENESS_SIGNAL.YES);
  if (value === false) return freezeSignal(MISSION_LIVENESS_SIGNAL.NO);
  if (value === undefined) {
    return freezeSignal(
      MISSION_LIVENESS_SIGNAL.UNKNOWN,
      `${subject} was not observed`,
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${subject} must be a boolean or mission-liveness signal`);
  }

  const state = value.state;
  if (!SIGNAL_STATES.has(state)) {
    throw new TypeError(
      `${subject}.state must be one of ${[...SIGNAL_STATES].join(', ')}`,
    );
  }
  const reason = value.reason === undefined || value.reason === null
    ? null
    : requiredLabel(value.reason, `${subject}.reason`);
  if ((state === MISSION_LIVENESS_SIGNAL.UNKNOWN
      || state === MISSION_LIVENESS_SIGNAL.REFUSED) && reason === null) {
    throw new TypeError(`${subject}.${state.toLowerCase()} requires a reason`);
  }
  return freezeSignal(state, reason);
}

function normalizeActions(observation) {
  if (!Object.hasOwn(observation, 'progressActions')) return null;
  if (!Array.isArray(observation.progressActions)) {
    throw new TypeError('mission liveness progressActions must be an array when observed');
  }

  const ids = new Set();
  const actions = observation.progressActions.map((action, index) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new TypeError(`progressActions[${index}] must be an object`);
    }
    const id = requiredLabel(action.id, `progressActions[${index}].id`);
    if (ids.has(id)) throw new TypeError(`duplicate progress action id: ${id}`);
    ids.add(id);
    return Object.freeze({
      id,
      label: action.label === undefined
        ? id
        : requiredLabel(action.label, `progressActions[${index}].label`),
      enabled: normalizeSignal(action.enabled, `progress action ${id} enabled`),
      reachable: normalizeSignal(action.reachable, `progress action ${id} reachable`),
    });
  });
  return Object.freeze(actions);
}

function diagnostic({ kind, code, subject, message, actionId = null }) {
  return Object.freeze({ kind, code, subject, message, actionId });
}

function unknownDiagnostic(signal, subject, code, actionId = null) {
  const refused = signal.state === MISSION_LIVENESS_SIGNAL.REFUSED;
  return diagnostic({
    kind: refused ? 'REFUSAL' : 'UNKNOWN',
    code: refused ? `${code}_REFUSED` : `${code}_UNKNOWN`,
    subject,
    message: signal.reason,
    actionId,
  });
}

function blockedActionDiagnostics(actions) {
  const diagnostics = [];
  for (const action of actions || []) {
    if (action.enabled.state === MISSION_LIVENESS_SIGNAL.NO) {
      diagnostics.push(diagnostic({
        kind: 'BLOCKED',
        code: 'ACTION_DISABLED',
        subject: `progress action ${action.id}`,
        message: action.enabled.reason || `${action.label} is disabled`,
        actionId: action.id,
      }));
    }
    if (action.reachable.state === MISSION_LIVENESS_SIGNAL.NO) {
      diagnostics.push(diagnostic({
        kind: 'BLOCKED',
        code: 'ACTION_UNREACHABLE',
        subject: `progress action ${action.id}`,
        message: action.reachable.reason || `${action.label} is not reachable`,
        actionId: action.id,
      }));
    }
  }
  return diagnostics;
}

function unresolvedDiagnostics(terminal, automaticTransition, actions) {
  const diagnostics = [];
  if (terminal.state === MISSION_LIVENESS_SIGNAL.UNKNOWN
      || terminal.state === MISSION_LIVENESS_SIGNAL.REFUSED) {
    diagnostics.push(unknownDiagnostic(terminal, 'terminal state', 'TERMINAL'));
  }
  if (automaticTransition.state === MISSION_LIVENESS_SIGNAL.UNKNOWN
      || automaticTransition.state === MISSION_LIVENESS_SIGNAL.REFUSED) {
    diagnostics.push(unknownDiagnostic(
      automaticTransition,
      'pending automatic transition',
      'AUTOMATIC_TRANSITION',
    ));
  }
  if (actions === null) {
    diagnostics.push(diagnostic({
      kind: 'UNKNOWN',
      code: 'PROGRESS_ACTIONS_UNKNOWN',
      subject: 'progress actions',
      message: 'progress actions were not observed',
    }));
  } else {
    for (const action of actions) {
      const enabledUnresolved = action.enabled.state === MISSION_LIVENESS_SIGNAL.UNKNOWN
        || action.enabled.state === MISSION_LIVENESS_SIGNAL.REFUSED;
      const reachableUnresolved = action.reachable.state === MISSION_LIVENESS_SIGNAL.UNKNOWN
        || action.reachable.state === MISSION_LIVENESS_SIGNAL.REFUSED;
      const enabledCouldPass = action.enabled.state !== MISSION_LIVENESS_SIGNAL.NO;
      const reachableCouldPass = action.reachable.state !== MISSION_LIVENESS_SIGNAL.NO;
      // Unknown inputs only affect the result when the action could still
      // satisfy enabled AND reachable. A known false conjunct is conclusive.
      if (enabledUnresolved && reachableCouldPass) {
        diagnostics.push(unknownDiagnostic(
          action.enabled,
          `progress action ${action.id} enabled`,
          'ACTION_ENABLED',
          action.id,
        ));
      }
      if (reachableUnresolved && enabledCouldPass) {
        diagnostics.push(unknownDiagnostic(
          action.reachable,
          `progress action ${action.id} reachable`,
          'ACTION_REACHABLE',
          action.id,
        ));
      }
    }
  }
  return diagnostics;
}

function result({
  status,
  code,
  message,
  sceneId,
  phase,
  checkpoint,
  terminal,
  automaticTransition,
  actions,
  witness = null,
  diagnostics = [],
}) {
  return Object.freeze({
    status,
    live: status === MISSION_LIVENESS_STATUS.PASS
      ? true
      : status === MISSION_LIVENESS_STATUS.FAIL
        ? false
        : null,
    code,
    message,
    sceneId,
    phase,
    checkpoint,
    witness: witness ? Object.freeze(witness) : null,
    signals: Object.freeze({
      terminal,
      pendingAutomaticTransition: automaticTransition,
    }),
    progressActions: actions,
    diagnostics: Object.freeze(diagnostics),
  });
}

/**
 * Evaluate one explicitly observed mission state.
 *
 * `progressActions: []` means the Adapter positively observed no progress
 * actions. Omitting `progressActions` means the Adapter did not inspect them,
 * which produces UNKNOWN unless another signal proves the state live.
 */
export function evaluateMissionLiveness(observation = {}) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new TypeError('mission liveness observation must be an object');
  }
  const sceneId = requiredLabel(observation.sceneId, 'sceneId');
  const phase = requiredLabel(observation.phase, 'phase');
  const checkpoint = optionalLabel(observation.checkpoint, 'checkpoint');
  const terminal = normalizeSignal(observation.terminal, 'terminal state');
  const automaticTransition = normalizeSignal(
    observation.pendingAutomaticTransition,
    'pending automatic transition',
  );
  const actions = normalizeActions(observation);

  if (terminal.state === MISSION_LIVENESS_SIGNAL.YES) {
    return result({
      status: MISSION_LIVENESS_STATUS.PASS,
      code: 'TERMINAL_STATE',
      message: 'the mission state is terminal',
      sceneId,
      phase,
      checkpoint,
      terminal,
      automaticTransition,
      actions,
      witness: { kind: 'TERMINAL' },
    });
  }

  if (automaticTransition.state === MISSION_LIVENESS_SIGNAL.YES) {
    return result({
      status: MISSION_LIVENESS_STATUS.PASS,
      code: 'AUTOMATIC_TRANSITION_PENDING',
      message: 'an automatic progression transition is pending',
      sceneId,
      phase,
      checkpoint,
      terminal,
      automaticTransition,
      actions,
      witness: { kind: 'AUTOMATIC_TRANSITION' },
    });
  }

  const liveAction = actions?.find((action) => (
    action.enabled.state === MISSION_LIVENESS_SIGNAL.YES
      && action.reachable.state === MISSION_LIVENESS_SIGNAL.YES
  ));
  if (liveAction) {
    return result({
      status: MISSION_LIVENESS_STATUS.PASS,
      code: 'PROGRESS_ACTION_AVAILABLE',
      message: `progress action ${liveAction.id} is enabled and reachable`,
      sceneId,
      phase,
      checkpoint,
      terminal,
      automaticTransition,
      actions,
      witness: { kind: 'PROGRESS_ACTION', actionId: liveAction.id },
    });
  }

  const unresolved = unresolvedDiagnostics(terminal, automaticTransition, actions);
  const blocked = blockedActionDiagnostics(actions);
  if (unresolved.length > 0) {
    return result({
      status: MISSION_LIVENESS_STATUS.UNKNOWN,
      code: 'LIVENESS_UNRESOLVED',
      message: 'mission liveness cannot be determined from the supplied observations',
      sceneId,
      phase,
      checkpoint,
      terminal,
      automaticTransition,
      actions,
      diagnostics: [...unresolved, ...blocked],
    });
  }

  const noActions = actions.length === 0
    ? [diagnostic({
      kind: 'BLOCKED',
      code: 'NO_PROGRESS_ACTIONS',
      subject: 'progress actions',
      message: 'the Adapter observed no progress actions',
    })]
    : [];
  return result({
    status: MISSION_LIVENESS_STATUS.FAIL,
    code: 'NO_LIVE_PROGRESS_PATH',
    message: 'state is nonterminal with no automatic transition and no enabled, reachable progress action',
    sceneId,
    phase,
    checkpoint,
    terminal,
    automaticTransition,
    actions,
    diagnostics: [...noActions, ...blocked, diagnostic({
      kind: 'FAILURE',
      code: 'DEAD_STATE',
      subject: 'mission state',
      message: 'the player has no legal path forward',
    })],
  });
}

export function formatMissionLivenessResult(livenessResult) {
  if (!livenessResult || typeof livenessResult !== 'object') {
    throw new TypeError('formatMissionLivenessResult requires a liveness result');
  }
  const checkpoint = livenessResult.checkpoint ?? 'none';
  const lines = [
    `${livenessResult.status} scene=${livenessResult.sceneId} phase=${livenessResult.phase} checkpoint=${checkpoint}: ${livenessResult.message}`,
  ];
  for (const item of livenessResult.diagnostics || []) {
    lines.push(`  ${item.kind} ${item.code}: ${item.message}`);
  }
  return lines.join('\n');
}
