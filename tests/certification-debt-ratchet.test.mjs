import assert from 'node:assert/strict';
import test from 'node:test';

import {
  certificationDebtSnapshot,
  collectLiveSemanticBrowserProofs,
  collectSpatialDebtReport,
  compareStableText,
  compareCertificationDebt,
  compareTrustedProofCoverage,
  evaluateCertificationDebtGate,
  evaluateCertificationDebtGateWithLiveSemanticProofs,
  extractSemanticBrowserProofs,
  readActorRetirementLedger,
  readCertificationDebtBaseline,
  semanticObligationFingerprint,
  semanticFingerprint,
  validateActorRetirementLedger,
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
    sceneId: 'scene',
    entrypointId: 'entry',
    disposition: 'debt',
    area: 'input',
    description,
    assertion: { kind: 'real-input', action: 'move' },
  };
}

function cleanBrowserResult(obligations, {
  status = 'UNKNOWN',
  entrypointId = 'entry',
  sceneId = 'scene',
  errors = { page: [], console: [], requests: [], responses: [], action: [] },
} = {}) {
  return {
    schema: 'squatchsmash.semantic-smoke-browser-run.v1',
    status,
    total: 1,
    results: [{
      schema: 'squatchsmash.semantic-smoke-browser.v1',
      sceneId,
      entrypointId,
      status,
      transport: { navigated: true, httpStatus: 200 },
      errors,
      obligations,
    }],
  };
}

function browserObligation(obligation, status = 'PASS') {
  return { ...obligation, status, reason: `${status} fixture` };
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

function actorRetirement(proofId, actorIds) {
  return {
    proofId,
    actorIds,
    reason: 'The reviewed fixture deliberately retires this state\'s complete prior cast.',
    source: 'src/luxury-apartment/world.js:2647',
    sourceAnchor: 'const pokerPatrons = [];',
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
      actorsDiscovered: 1,
      visibilityFilteredActors: 0,
      actorObservedIds: ['actor'],
      actorDiscoveredIds: ['actor'],
      visibilityFilteredActorIds: [],
      actorVisibilityPolicy: 'rendered_only',
      unmarkedRigs: 0,
      findingsScanned: true,
      spatialCoverageStatus: 'UNKNOWN',
    },
  }],
  actorRetirements = [],
} = {}) {
  return certificationDebtSnapshot({
    architectureReport: {
      findings: architectureFindings,
      summary: { uncertified: architecture },
    },
    semanticReport: { blockers: semantic, obligations: semanticObligations },
    livenessEntries: liveness,
    spatialReport: { schemaVersion: 1, debt: spatial, proofs: spatialProofs },
    actorRetirements,
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

test('a reasoned intentional no-cast contract proves removal of vacuous zero-actor debt', () => {
  const zeroActors = {
    id: 'spatial:scene:state:actors:zero-observed',
    status: 'unknown',
    count: 1,
    proofId: 'scene:state',
    proofKind: 'zero_actors',
    detail: { stateId: 'scene:state', subject: 'actors' },
  };
  const trusted = makeSnapshot({
    spatial: [zeroActors],
    spatialProofs: [{
      id: 'scene:state',
      status: 'zero_actors',
      evidence: {
        built: true, actorsObserved: 0, unmarkedRigs: 0, findingsScanned: false,
      },
    }],
  });
  const certified = makeSnapshot({
    spatial: [],
    spatialProofs: [{
      id: 'scene:state',
      status: 'intentional_na',
      evidence: {
        built: true,
        actorsObserved: 0,
        actorsDiscovered: 1,
        visibilityFilteredActors: 1,
        actorObservedIds: [],
        actorDiscoveredIds: ['hidden-actor'],
        visibilityFilteredActorIds: ['hidden-actor'],
        actorVisibilityPolicy: 'rendered_only',
        unmarkedRigs: 0,
        findingsScanned: true,
        spatialCoverageStatus: 'UNKNOWN',
        actorExpectation: {
          disposition: 'INTENTIONAL_NA',
          minimum: 0,
          reason: 'This authored state contains no cast.',
        },
      },
    }],
  });
  const gate = evaluateCertificationDebtGate({
    trusted,
    candidate: certified,
    current: certified,
  });
  assert.deepEqual(gate.unprovedTrustedImprovements, []);
  assert.equal(gate.pass, true);

  const unscanned = structuredClone(certified);
  unscanned.domains.spatial.proofs[0].evidence.findingsScanned = false;
  const refused = evaluateCertificationDebtGate({
    trusted,
    candidate: unscanned,
    current: unscanned,
  });
  assert.equal(refused.unprovedTrustedImprovements.length, 1);
  assert.equal(refused.pass, false);
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

test('exact clean live PASS authorizes only its matching semantic debt removal', () => {
  const id = 'scene:entry:input:move';
  const trusted = makeSnapshot();
  const declaration = { ...semanticBlocker(id), disposition: 'required' };
  const promoted = makeSnapshot({ semantic: [], semanticObligations: [declaration] });
  const proof = {
    id,
    status: 'pass',
    source: 'browser',
    entrypointId: 'entry',
    fingerprint: semanticObligationFingerprint(declaration),
  };
  const gate = evaluateCertificationDebtGate({
    trusted,
    candidate: promoted,
    current: promoted,
    semanticObligations: [declaration],
    semanticBrowserProofs: [proof],
  });
  assert.deepEqual(gate.semanticProofViolations, []);
  assert.deepEqual(gate.unprovedTrustedImprovements, []);
  assert.equal(gate.pass, true);
});

test('sibling, duplicate, stale, and wrong-entrypoint semantic proofs fail closed', () => {
  const id = 'scene:entry:input:move';
  const declaration = { ...semanticBlocker(id), disposition: 'required' };
  const sibling = {
    ...declaration,
    id: 'scene:entry:input:pointer_lock',
  };
  const trusted = makeSnapshot();
  const promoted = makeSnapshot({ semantic: [], semanticObligations: [declaration] });
  const exact = {
    id,
    status: 'pass',
    source: 'browser',
    entrypointId: 'entry',
    fingerprint: semanticObligationFingerprint(declaration),
  };
  const variants = [
    [{
      id: sibling.id,
      status: 'pass',
      source: 'browser',
      entrypointId: 'entry',
      fingerprint: semanticObligationFingerprint(sibling),
    }],
    [exact, exact],
    [{ ...exact, fingerprint: semanticFingerprint({ stale: true }) }],
    [{ ...exact, entrypointId: 'wrong_entrypoint' }],
  ];
  for (const semanticBrowserProofs of variants) {
    const gate = evaluateCertificationDebtGate({
      trusted,
      candidate: promoted,
      current: promoted,
      semanticObligations: [declaration],
      semanticBrowserProofs,
    });
    assert.equal(gate.pass, false);
  }
});

test('browser extractor accepts exact PASS from an otherwise clean UNKNOWN run', () => {
  const obligation = { ...semanticBlocker('scene:entry:input:move'), disposition: 'required' };
  const sibling = {
    ...obligation,
    id: 'scene:entry:camera:owner',
    area: 'camera',
    assertion: { kind: 'camera-behavior', behavior: 'owner_matches_phase' },
  };
  const report = cleanBrowserResult([
    browserObligation(obligation, 'PASS'),
    browserObligation(sibling, 'UNKNOWN'),
  ]);
  const proofs = extractSemanticBrowserProofs(report, {
    targetIds: [obligation.id],
    obligations: [obligation, sibling],
  });
  assert.deepEqual(proofs, [{
    id: obligation.id,
    status: 'pass',
    source: 'browser',
    entrypointId: obligation.entrypointId,
    fingerprint: semanticObligationFingerprint(obligation),
  }]);
});

test('browser extractor rejects UNKNOWN target, overall FAIL, and contaminated diagnostics', () => {
  const obligation = { ...semanticBlocker('scene:entry:input:move'), disposition: 'required' };
  assert.deepEqual(extractSemanticBrowserProofs(
    cleanBrowserResult([browserObligation(obligation, 'UNKNOWN')]),
    { targetIds: [obligation.id], obligations: [obligation] },
  ), []);
  assert.throws(() => extractSemanticBrowserProofs(
    cleanBrowserResult([browserObligation(obligation, 'PASS')], { status: 'FAIL' }),
    { targetIds: [obligation.id], obligations: [obligation] },
  ), /overall FAIL/i);
  assert.throws(() => extractSemanticBrowserProofs(
    cleanBrowserResult([browserObligation(obligation, 'PASS')], {
      errors: { page: ['boom'], console: [], requests: [], responses: [], action: [] },
    }),
    { targetIds: [obligation.id], obligations: [obligation] },
  ), /diagnostic/i);
});

test('browser extractor rejects duplicate, stale, missing, and wrong-entrypoint receipts', () => {
  const obligation = { ...semanticBlocker('scene:entry:input:move'), disposition: 'required' };
  const changed = { ...obligation, description: 'stale definition from another run' };
  assert.throws(() => extractSemanticBrowserProofs(
    cleanBrowserResult([browserObligation(obligation), browserObligation(obligation)]),
    { targetIds: [obligation.id], obligations: [obligation] },
  ), /duplicate/i);
  assert.throws(() => extractSemanticBrowserProofs(
    cleanBrowserResult([browserObligation(changed)]),
    { targetIds: [obligation.id], obligations: [obligation] },
  ), /fingerprint/i);
  assert.throws(() => extractSemanticBrowserProofs(
    cleanBrowserResult([]),
    { targetIds: [obligation.id], obligations: [obligation] },
  ), /missing/i);
  assert.throws(() => extractSemanticBrowserProofs(
    cleanBrowserResult([browserObligation(obligation)], { entrypointId: 'other' }),
    { targetIds: [obligation.id], obligations: [obligation] },
  ), /entrypoint/i);
});

test('live collector accepts exit 2 only for a clean exact PASS inside UNKNOWN', () => {
  const obligation = { ...semanticBlocker('scene:entry:input:move'), disposition: 'required' };
  const report = cleanBrowserResult([browserObligation(obligation, 'PASS')]);
  const calls = [];
  const proofs = collectLiveSemanticBrowserProofs({
    targetIds: [obligation.id],
    obligations: [obligation],
    repositoryRoot: '.',
    spawn(command, args) {
      calls.push({ command, args });
      return {
        status: 2,
        signal: null,
        error: null,
        stderr: '',
        stdout: JSON.stringify(report),
      };
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(-3), ['--entrypoint', 'entry', '--json']);
  assert.equal(proofs[0].id, obligation.id);
  assert.throws(() => collectLiveSemanticBrowserProofs({
    targetIds: [obligation.id],
    obligations: [obligation],
    repositoryRoot: '.',
    spawn: () => ({
      status: 1,
      signal: null,
      error: null,
      stderr: '',
      stdout: JSON.stringify(cleanBrowserResult(
        [browserObligation(obligation, 'PASS')],
        { status: 'FAIL' },
      )),
    }),
  }), /overall FAIL/i);
});

test('live semantic browser is not launched when trusted semantic debt did not shrink', () => {
  let launches = 0;
  const snapshot = makeSnapshot();
  const result = evaluateCertificationDebtGateWithLiveSemanticProofs({
    trusted: snapshot,
    candidate: snapshot,
    current: snapshot,
    semanticObligations: [semanticBlocker('scene:entry:input:move')],
    collectProofs() {
      launches += 1;
      return [];
    },
  });
  assert.equal(launches, 0);
  assert.equal(result.pass, true);
});

test('live semantic orchestration launches for removals and requires exact returned proof', () => {
  const id = 'scene:entry:input:move';
  const declaration = { ...semanticBlocker(id), disposition: 'required' };
  const trusted = makeSnapshot();
  const promoted = makeSnapshot({ semantic: [], semanticObligations: [declaration] });
  let requested = null;
  const result = evaluateCertificationDebtGateWithLiveSemanticProofs({
    trusted,
    candidate: promoted,
    current: promoted,
    semanticObligations: [declaration],
    collectProofs(options) {
      requested = options;
      return [{
        id,
        status: 'pass',
        source: 'browser',
        entrypointId: 'entry',
        fingerprint: semanticObligationFingerprint(declaration),
      }];
    },
  });
  assert.deepEqual(requested.targetIds, [id]);
  assert.equal(result.pass, true);
  assert.equal(result.semanticBrowserProofs.length, 1);
});

test('browser receipts are transient and never serialized into baseline snapshots', () => {
  const snapshot = makeSnapshot();
  assert.ok(snapshot.domains.semantic_contract.proofs.every((proof) => (
    proof.status === 'declaration_only' && proof.evidence?.source !== 'browser'
  )));
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
        actorsDiscovered: 2,
        visibilityFilteredActors: 0,
        actorObservedIds: ['actor-a', 'actor-b'],
        actorDiscoveredIds: ['actor-a', 'actor-b'],
        visibilityFilteredActorIds: [],
        actorVisibilityPolicy: 'rendered_only',
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
        actorsDiscovered: 1,
        visibilityFilteredActors: 0,
        actorObservedIds: ['actor-a'],
        actorDiscoveredIds: ['actor-a'],
        visibilityFilteredActorIds: [],
        actorVisibilityPolicy: 'rendered_only',
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

test('an exact reviewed whole-cast retirement permits an intentional no-cast state', () => {
  const proofId = 'luxury-apartment:property';
  const actorIds = [
    'luxury.poker.patron.east',
    'luxury.poker.patron.north',
    'luxury.poker.patron.west',
  ];
  const trusted = makeSnapshot({
    spatial: [],
    spatialProofs: [{
      id: proofId,
      status: 'pass',
      evidence: {
        built: true,
        actorsObserved: 3,
        actorsDiscovered: 3,
        visibilityFilteredActors: 0,
        actorObservedIds: actorIds,
        actorDiscoveredIds: actorIds,
        visibilityFilteredActorIds: [],
        actorVisibilityPolicy: 'rendered_only',
        unmarkedRigs: 0,
        findingsScanned: true,
        spatialCoverageStatus: 'PASS',
      },
    }],
  });
  const retired = makeSnapshot({
    spatial: [],
    actorRetirements: [actorRetirement(proofId, actorIds)],
    spatialProofs: [{
      id: proofId,
      status: 'intentional_na',
      evidence: {
        built: true,
        actorsObserved: 0,
        actorsDiscovered: 0,
        visibilityFilteredActors: 0,
        actorObservedIds: [],
        actorDiscoveredIds: [],
        visibilityFilteredActorIds: [],
        actorVisibilityPolicy: 'rendered_only',
        unmarkedRigs: 0,
        findingsScanned: true,
        spatialCoverageStatus: 'PASS',
        actorExpectation: {
          disposition: 'INTENTIONAL_NA',
          minimum: 0,
          reason: 'This apartment scene deliberately contains no cast.',
        },
      },
    }],
  });
  const gate = evaluateCertificationDebtGate({
    trusted,
    candidate: retired,
    current: retired,
  });
  assert.deepEqual(gate.proofCoverageViolations, []);
  assert.equal(gate.pass, true);
});

test('a reviewed historical retirement remains valid after the trusted proof is already no-cast', () => {
  const proofId = 'luxury-apartment:property';
  const retiredActorIds = [
    'luxury.poker.patron.east',
    'luxury.poker.patron.north',
    'luxury.poker.patron.west',
  ];
  const intentionalNoCastProof = {
    id: proofId,
    status: 'intentional_na',
    evidence: {
      built: true,
      actorsObserved: 0,
      actorsDiscovered: 0,
      visibilityFilteredActors: 0,
      actorObservedIds: [],
      actorDiscoveredIds: [],
      visibilityFilteredActorIds: [],
      actorVisibilityPolicy: 'rendered_only',
      unmarkedRigs: 0,
      findingsScanned: true,
      spatialCoverageStatus: 'PASS',
      actorExpectation: {
        disposition: 'INTENTIONAL_NA',
        minimum: 0,
        reason: 'This apartment scene deliberately contains no cast.',
      },
    },
  };
  const trusted = makeSnapshot({
    spatial: [],
    spatialProofs: [intentionalNoCastProof],
  });
  const current = makeSnapshot({
    spatial: [],
    actorRetirements: [actorRetirement(proofId, retiredActorIds)],
    spatialProofs: [intentionalNoCastProof],
  });

  assert.deepEqual(compareTrustedProofCoverage(trusted, current, current), []);
});

test('actor retirement receipts fail closed when copied, incomplete, or not intentional', () => {
  const actorIds = ['actor-a', 'actor-b'];
  const trusted = makeSnapshot({
    spatial: [],
    spatialProofs: [{
      id: 'scene:state',
      status: 'pass',
      evidence: {
        built: true,
        actorsObserved: 2,
        actorsDiscovered: 2,
        visibilityFilteredActors: 0,
        actorObservedIds: actorIds,
        actorDiscoveredIds: actorIds,
        visibilityFilteredActorIds: [],
        actorVisibilityPolicy: 'rendered_only',
        unmarkedRigs: 0,
        findingsScanned: true,
        spatialCoverageStatus: 'PASS',
      },
    }],
  });
  const intentionalEvidence = {
    built: true,
    actorsObserved: 0,
    actorsDiscovered: 0,
    visibilityFilteredActors: 0,
    actorObservedIds: [],
    actorDiscoveredIds: [],
    visibilityFilteredActorIds: [],
    actorVisibilityPolicy: 'rendered_only',
    unmarkedRigs: 0,
    findingsScanned: true,
    spatialCoverageStatus: 'PASS',
    actorExpectation: {
      disposition: 'INTENTIONAL_NA', minimum: 0, reason: 'Deliberately empty fixture.',
    },
  };
  const variants = [
    actorRetirement('other:state', actorIds),
    actorRetirement('scene:state', ['actor-a']),
  ];
  for (const retirement of variants) {
    const current = makeSnapshot({
      spatial: [],
      actorRetirements: [retirement],
      spatialProofs: [{
        id: 'scene:state',
        status: 'intentional_na',
        evidence: intentionalEvidence,
      }, ...(retirement.proofId === 'other:state' ? [{
        id: 'other:state',
        status: 'intentional_na',
        evidence: intentionalEvidence,
      }] : [])],
    });
    const violations = compareTrustedProofCoverage(trusted, current, current);
    assert.ok(violations.some(({ kind }) => (
      kind === 'ACTOR_RETIREMENT_PROOF_INVALID'
        || kind === 'ACTOR_DISCOVERED_COVERAGE_SHRANK'
    )));
  }

  const notIntentional = makeSnapshot({
    spatial: [],
    actorRetirements: [actorRetirement('scene:state', actorIds)],
    spatialProofs: [{
      id: 'scene:state',
      status: 'pass',
      evidence: { ...intentionalEvidence, actorExpectation: undefined },
    }],
  });
  assert.ok(compareTrustedProofCoverage(trusted, notIntentional, notIntentional).some(({ kind }) => (
    kind === 'ACTOR_RETIREMENT_PROOF_INVALID'
  )));
});

test('rendered-only staging may filter hidden cast without shrinking marker inventory', () => {
  const finding = {
    id: 'spatial:scene:state:finding:inside-solid:abc123:hidden-actor',
    status: 'finding',
    count: 1,
    proofId: 'scene:state',
    proofKind: 'finding',
    detail: { stateId: 'scene:state', kind: 'inside-solid', subject: 'hidden-actor' },
  };
  const trusted = makeSnapshot({
    spatial: [finding],
    spatialProofs: [{
      id: 'scene:state',
      status: 'observed',
      evidence: {
        built: true,
        actorsObserved: 2,
        actorsDiscovered: 2,
        visibilityFilteredActors: 0,
        actorObservedIds: ['hidden-actor', 'visible-actor'],
        actorDiscoveredIds: ['hidden-actor', 'visible-actor'],
        visibilityFilteredActorIds: [],
        actorVisibilityPolicy: 'legacy_all_descendants',
        findingsScanned: true,
        spatialCoverageStatus: 'PASS',
      },
    }],
  });
  const visibilityCorrected = makeSnapshot({
    spatial: [],
    spatialProofs: [{
      id: 'scene:state',
      status: 'pass',
      evidence: {
        built: true,
        actorsObserved: 1,
        actorsDiscovered: 2,
        visibilityFilteredActors: 1,
        actorObservedIds: ['visible-actor'],
        actorDiscoveredIds: ['hidden-actor', 'visible-actor'],
        visibilityFilteredActorIds: ['hidden-actor'],
        actorVisibilityPolicy: 'rendered_only',
        findingsScanned: true,
        spatialCoverageStatus: 'PASS',
      },
    }],
  });
  const gate = evaluateCertificationDebtGate({
    trusted,
    candidate: visibilityCorrected,
    current: visibilityCorrected,
  });
  assert.deepEqual(gate.proofCoverageViolations, []);
  assert.equal(gate.pass, true);

  const dishonest = structuredClone(visibilityCorrected);
  dishonest.domains.spatial.proofs[0].evidence.visibilityFilteredActors = 0;
  assert.ok(compareTrustedProofCoverage(trusted, dishonest, dishonest).some((item) => (
    item.kind === 'ACTOR_COVERAGE_SHRANK'
  )));

  const actorDeleted = structuredClone(visibilityCorrected);
  const deletedEvidence = actorDeleted.domains.spatial.proofs[0].evidence;
  deletedEvidence.actorsDiscovered = 1;
  deletedEvidence.visibilityFilteredActors = 0;
  deletedEvidence.actorDiscoveredIds = ['visible-actor'];
  deletedEvidence.visibilityFilteredActorIds = [];
  const deletionViolations = compareTrustedProofCoverage(
    visibilityCorrected,
    actorDeleted,
    actorDeleted,
  );
  assert.ok(deletionViolations.some((item) => (
    item.kind === 'ACTOR_DISCOVERED_COVERAGE_SHRANK'
  )));
  assert.ok(deletionViolations.some((item) => (
    item.kind === 'ACTOR_ID_COVERAGE_SHRANK'
      && item.missing.includes('hidden-actor')
  )));
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

test('checked-in actor retirement ledger is current, and synthetic receipts fail when their source drifts', () => {
  const ledger = readActorRetirementLedger();
  assert.deepEqual(validateActorRetirementLedger(ledger), []);
  assert.deepEqual(ledger.entries, [],
    'Margo is now a discovered future actor, so the former whole-cast retirement receipt is no longer applicable');

  const synthetic = {
    $schema: 'squatchsmash.certification-actor-retirements.v1',
    entries: [{
      proofId: 'example:state',
      actorIds: ['example.actor'],
      reason: 'This fixture proves that a reviewed actor-retirement source remains executable.',
      source: 'src/example.js:1',
      sourceAnchor: 'const retiredCast = [];',
    }],
  };
  assert.deepEqual(validateActorRetirementLedger(synthetic, {
    repositoryRoot: process.cwd(),
    readFile: () => 'const retiredCast = [];\n',
  }), []);
  synthetic.entries[0].sourceAnchor = 'const retiredCast = [actor];';
  assert.match(validateActorRetirementLedger(synthetic, {
    repositoryRoot: process.cwd(),
    readFile: () => 'const retiredCast = [];\n',
  }).join('\n'), /sourceAnchor is not on/u);
});

test('checked-in baseline is a structurally valid deterministic snapshot', () => {
  const baseline = readCertificationDebtBaseline();
  assert.deepEqual(validateCertificationDebtSnapshot(baseline), []);
});
