import assert from 'node:assert/strict';
import test from 'node:test';

import {
  certificationDebtSnapshot,
  collectSpatialDebtReport,
  compareStableText,
  compareCertificationDebt,
  compareTrustedProofCoverage,
  evaluateCertificationDebtGate,
  readCertificationDebtBaseline,
  semanticFingerprint,
  validateCertificationDebtSnapshot,
} from '../tools/certification-debt-ratchet.mjs';

function architectureFinding(id, message = 'local wiring remains', status = 'debt') {
  return {
    id,
    status,
    kind: 'inline_first_person_input',
    subject: 'input',
    message,
    evidence: { events: ['keydown', 'keyup'] },
  };
}

function semanticBlocker(id, description = 'real browser evidence is missing') {
  return {
    id,
    disposition: 'debt',
    area: 'input',
    description,
    assertion: { kind: 'real-input', action: 'move' },
  };
}

function livenessEntry(id) {
  return {
    id,
    observation: {
      sceneId: 'fixture_scene',
      phase: id,
      terminal: false,
      pendingAutomaticTransition: false,
    },
  };
}

function makeSnapshot({
  architecture = [architectureFinding('scene:entry:inline_first_person_input:input')],
  architectureFindings = architecture,
  semantic = [semanticBlocker('scene:entry:input:move')],
  semanticObligations = semantic,
  liveness = [livenessEntry('scene:restore:start')],
  spatial = [{
    id: 'spatial:scene:state:coverage:untyped-solids',
    status: 'unknown',
    count: 3,
    proofId: 'scene:state',
    proofKind: 'coverage',
    detail: { stateId: 'scene:state', subject: 'untyped-solids' },
  }],
  spatialProofs = [{
    id: 'scene:state',
    status: 'observed',
    evidence: {
      built: true,
      actorsObserved: 1,
      unmarkedRigs: 0,
      findingsScanned: true,
      spatialCoverageStatus: 'UNKNOWN',
    },
  }],
} = {}) {
  return certificationDebtSnapshot({
    architectureReport: {
      findings: architectureFindings,
      summary: { uncertified: architecture },
    },
    semanticReport: { blockers: semantic, obligations: semanticObligations },
    livenessEntries: liveness,
    spatialReport: { schemaVersion: 1, debt: spatial, proofs: spatialProofs },
  });
}

test('semantic fingerprints are canonical across object key order', () => {
  assert.equal(
    semanticFingerprint({ beta: 2, alpha: { delta: 4, gamma: 3 } }),
    semanticFingerprint({ alpha: { gamma: 3, delta: 4 }, beta: 2 }),
  );
});

test('serialized baseline ordering is locale-independent code-point order', () => {
  assert.equal(compareStableText('Z', 'a'), -1);
  assert.equal(compareStableText('a', 'Z'), 1);
  assert.equal(compareStableText('same', 'same'), 0);
});

test('ratchet accepts the exact baseline', () => {
  const baseline = makeSnapshot();
  assert.deepEqual(compareCertificationDebt(baseline, makeSnapshot()), {
    errors: [],
    violations: [],
    improvements: [],
  });
});

test('ratchet accepts debt removal and lower per-ID counts', () => {
  const baseline = makeSnapshot();
  const current = makeSnapshot({
    architecture: [],
    architectureFindings: [architectureFinding(
      'scene:entry:inline_first_person_input:input',
      'canonical Adapter is active',
      'pass',
    )],
    spatial: [{
      id: 'spatial:scene:state:coverage:untyped-solids',
      status: 'unknown',
      count: 1,
      proofId: 'scene:state',
      proofKind: 'coverage',
      detail: { stateId: 'scene:state', subject: 'untyped-solids' },
    }],
  });
  const result = compareCertificationDebt(baseline, current);
  assert.equal(result.errors.length, 0);
  assert.equal(result.violations.length, 0);
  assert.deepEqual(result.improvements.map(({ kind, removed }) => ({ kind, removed })), [
    { kind: 'DEBT_REMOVED', removed: 1 },
    { kind: 'DEBT_SHRANK', removed: 2 },
  ]);
  assert.equal(
    baseline.domains.spatial.entries[0].fingerprint,
    current.domains.spatial.entries[0].fingerprint,
    'occurrence counts must not leak into the spatial semantic fingerprint',
  );
});

test('gate rejects a stale candidate after debt removal until baseline follows current', () => {
  const trusted = makeSnapshot();
  const current = makeSnapshot({
    architecture: [],
    architectureFindings: [architectureFinding(
      'scene:entry:inline_first_person_input:input',
      'canonical Adapter is active',
      'pass',
    )],
  });
  const stale = evaluateCertificationDebtGate({ trusted, candidate: trusted, current });
  assert.equal(stale.currentComparison.violations.length, 0);
  assert.equal(stale.staleBaseline.length, 1);
  assert.equal(stale.pass, false);

  const ratcheted = evaluateCertificationDebtGate({
    trusted,
    candidate: current,
    current,
  });
  assert.equal(ratcheted.trustedComparison.violations.length, 0);
  assert.equal(ratcheted.trustedComparison.improvements.length, 1);
  assert.equal(ratcheted.pass, true);
});

test('trusted ceiling permits a spatial count reduction with the same fingerprint', () => {
  const trusted = makeSnapshot();
  const ratcheted = makeSnapshot({
    spatial: [{
      id: 'spatial:scene:state:coverage:untyped-solids',
      status: 'unknown',
      count: 1,
      proofId: 'scene:state',
      proofKind: 'coverage',
      detail: { stateId: 'scene:state', subject: 'untyped-solids' },
    }],
  });
  const gate = evaluateCertificationDebtGate({
    trusted,
    candidate: ratcheted,
    current: ratcheted,
  });
  assert.equal(gate.trustedComparison.violations.length, 0);
  assert.equal(gate.trustedComparison.improvements[0].kind, 'DEBT_SHRANK');
  assert.equal(gate.pass, true);
});

test('ratchet rejects new stable IDs even when total debt does not grow', () => {
  const baseline = makeSnapshot({
    architecture: [
      architectureFinding('scene:entry:inline_first_person_input:input'),
      architectureFinding('scene:entry:old-debt:input'),
    ],
  });
  const current = makeSnapshot({
    architecture: [
      architectureFinding('scene:entry:inline_first_person_input:input'),
      architectureFinding('scene:entry:new-debt:input'),
    ],
  });
  const result = compareCertificationDebt(baseline, current);
  assert.deepEqual(result.violations.map(({ kind, id }) => ({ kind, id })), [{
    kind: 'NEW_DEBT',
    id: 'scene:entry:new-debt:input',
  }]);
});

test('trusted ceiling rejects candidate expansion and same-size substitution', () => {
  const trusted = makeSnapshot({ architecture: [] });
  const expanded = makeSnapshot();
  assert.equal(evaluateCertificationDebtGate({
    trusted,
    candidate: expanded,
    current: expanded,
  }).pass, false);

  const original = makeSnapshot({
    architecture: [architectureFinding('scene:entry:old-debt:input')],
  });
  const substituted = makeSnapshot({
    architecture: [architectureFinding('scene:entry:new-debt:input')],
  });
  const substitution = evaluateCertificationDebtGate({
    trusted: original,
    candidate: substituted,
    current: substituted,
  });
  assert.equal(substitution.pass, false);
  assert.equal(substitution.trustedComparison.violations[0].kind, 'NEW_DEBT');
});

test('semantic debt cannot disappear through required relabeling without browser PASS', () => {
  const id = 'scene:entry:input:move';
  const trusted = makeSnapshot();
  const declaration = {
    ...semanticBlocker(id),
    disposition: 'required',
  };
  const relabeled = makeSnapshot({
    semantic: [],
    semanticObligations: [declaration],
  });
  const gate = evaluateCertificationDebtGate({
    trusted,
    candidate: relabeled,
    current: relabeled,
  });
  assert.equal(gate.trustedComparison.improvements[0].id, id);
  assert.equal(gate.unprovedTrustedImprovements[0].domain, 'semantic_contract');
  assert.equal(gate.pass, false);
});

test('trusted proof inventory is a floor for obligations, states, and checkpoints', () => {
  const trusted = makeSnapshot();
  const removed = makeSnapshot({
    semantic: [],
    semanticObligations: [],
    liveness: [],
    spatial: [],
    spatialProofs: [],
  });
  const violations = compareTrustedProofCoverage(trusted, removed, removed);
  assert.ok(violations.some((item) => (
    item.domain === 'semantic_contract' && item.kind === 'CURRENT_COVERAGE_REMOVED'
  )));
  assert.ok(violations.some((item) => (
    item.domain === 'liveness' && item.kind === 'CURRENT_COVERAGE_REMOVED'
  )));
  assert.ok(violations.some((item) => (
    item.domain === 'spatial' && item.kind === 'CURRENT_COVERAGE_REMOVED'
  )));
  assert.equal(evaluateCertificationDebtGate({
    trusted,
    candidate: removed,
    current: removed,
  }).pass, false);
});

test('removing an actor cannot masquerade as fixing that actor finding', () => {
  const finding = {
    id: 'spatial:scene:state:finding:inside-solid:abc123:actor',
    status: 'finding',
    count: 1,
    proofId: 'scene:state',
    proofKind: 'finding',
    detail: { stateId: 'scene:state', kind: 'inside-solid', subject: 'actor' },
  };
  const trusted = makeSnapshot({
    spatial: [finding],
    spatialProofs: [{
      id: 'scene:state',
      status: 'observed',
      evidence: {
        built: true,
        actorsObserved: 2,
        unmarkedRigs: 0,
        findingsScanned: true,
        spatialCoverageStatus: 'PASS',
      },
    }],
  });
  const actorDeleted = makeSnapshot({
    spatial: [],
    spatialProofs: [{
      id: 'scene:state',
      status: 'pass',
      evidence: {
        built: true,
        actorsObserved: 1,
        unmarkedRigs: 0,
        findingsScanned: true,
        spatialCoverageStatus: 'PASS',
      },
    }],
  });
  const gate = evaluateCertificationDebtGate({
    trusted,
    candidate: actorDeleted,
    current: actorDeleted,
  });
  assert.ok(gate.proofCoverageViolations.some((item) => (
    item.kind === 'ACTOR_COVERAGE_SHRANK'
  )));
  assert.equal(gate.pass, false);
});

test('losing a staging actor marker creates new unmarked-rig debt', () => {
  const trusted = makeSnapshot({ spatial: [] });
  const current = makeSnapshot({
    spatial: [{
      id: 'spatial:scene:state:actors:unmarked-shared-rigs',
      status: 'finding',
      count: 1,
      proofId: 'scene:state',
      proofKind: 'unmarked_rigs',
      detail: { stateId: 'scene:state', subject: 'unmarked-shared-rigs' },
    }],
    spatialProofs: [{
      id: 'scene:state',
      status: 'observed',
      evidence: {
        built: true,
        actorsObserved: 0,
        unmarkedRigs: 1,
        findingsScanned: false,
        spatialCoverageStatus: 'UNKNOWN',
      },
    }],
  });
  const gate = evaluateCertificationDebtGate({ trusted, candidate: current, current });
  assert.equal(gate.trustedComparison.violations[0].kind, 'NEW_DEBT');
  assert.equal(gate.pass, false);
});

test('ratchet rejects changed meaning behind an unchanged ID', () => {
  const baseline = makeSnapshot();
  const current = makeSnapshot({
    semantic: [semanticBlocker('scene:entry:input:move', 'different missing browser evidence')],
  });
  const result = compareCertificationDebt(baseline, current);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].kind, 'DEBT_CHANGED');
});

test('ratchet rejects growth behind an unchanged spatial ID', () => {
  const baseline = makeSnapshot();
  const current = makeSnapshot({
    spatial: [{
      id: 'spatial:scene:state:coverage:untyped-solids',
      status: 'unknown',
      count: 4,
      proofId: 'scene:state',
      proofKind: 'coverage',
      detail: { stateId: 'scene:state', subject: 'untyped-solids' },
    }],
  });
  const result = compareCertificationDebt(baseline, current);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].kind, 'DEBT_GREW');
});

test('snapshot validation rejects a stale or hand-edited summary', () => {
  const snapshot = structuredClone(makeSnapshot());
  snapshot.domains.spatial.summary.units += 1;
  assert.match(
    validateCertificationDebtSnapshot(snapshot).join('\n'),
    /spatial\.summary does not match its entries/u,
  );
});

test('spatial collector accepts exit 1 when a complete debt report was emitted', () => {
  const report = collectSpatialDebtReport({
    repositoryRoot: '.',
    spawn: () => ({
      status: 1,
      signal: null,
      error: null,
      stderr: '',
      stdout: JSON.stringify({ schemaVersion: 1, debt: [] }),
    }),
  });
  assert.deepEqual(report, { schemaVersion: 1, debt: [] });
});

test('checked-in baseline is a structurally valid deterministic snapshot', () => {
  const baseline = readCertificationDebtBaseline();
  assert.deepEqual(validateCertificationDebtSnapshot(baseline), []);
});
