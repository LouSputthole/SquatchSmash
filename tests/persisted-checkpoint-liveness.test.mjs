import assert from 'node:assert/strict';
import test from 'node:test';

import { SCENE_CONTRACTS } from '../src/core/scene-contracts.js';
import {
  evaluatePersistedLivenessReceipt,
  PERSISTED_LIVENESS_SPECS,
  validatePersistedLivenessSpecs,
} from '../tools/verify-persisted-checkpoint-liveness.mjs';

const SCHEMA = 'squatchsmash.persisted-checkpoint-liveness.v1';

function contract(sceneId) {
  return SCENE_CONTRACTS.find((candidate) => candidate.id === sceneId);
}

function passingReceipt(spec) {
  const raw = JSON.stringify({ checkpoint: spec.checkpoint });
  return {
    schema: SCHEMA,
    id: spec.id,
    seeded: { raw, checkpoint: spec.checkpoint, persistent: true },
    reloaded: { raw, checkpoint: spec.checkpoint, persistent: true },
    runtime: {
      url: `http://127.0.0.1:9876${spec.href}`,
      ready: true,
      checkpoint: spec.checkpoint,
      sceneId: spec.sceneId,
      errors: [],
    },
    witness: {
      id: spec.witness,
      attempted: true,
      accepted: true,
      changed: true,
      enabledSubjectCount: 1,
    },
    observation: {
      sceneId: spec.sceneId,
      phase: 'active',
      checkpoint: spec.checkpoint,
      terminal: false,
      pendingAutomaticTransition: false,
      progressActions: [{
        id: spec.witness,
        enabled: true,
        reachable: true,
      }],
    },
  };
}

test('persisted liveness owns every declared NO WAKE and HotDog checkpoint exactly once', () => {
  assert.equal(validatePersistedLivenessSpecs(), true);
  const noWake = contract('no_wake').capabilities.checkpoints.ids;
  const hotDog = contract('bada_bing_two').capabilities.checkpoints.ids;

  assert.deepEqual(
    PERSISTED_LIVENESS_SPECS.filter(({ family }) => family === 'no_wake')
      .map(({ checkpoint }) => checkpoint),
    noWake,
  );
  assert.deepEqual(
    PERSISTED_LIVENESS_SPECS.filter(({ family }) => family === 'hotdog')
      .map(({ checkpoint }) => checkpoint),
    hotDog,
  );
  assert.ok(PERSISTED_LIVENESS_SPECS.every(({ href }) => !href.includes('preview=1')));
});

test('a complete persisted browser receipt passes the shared liveness evaluator', () => {
  for (const spec of PERSISTED_LIVENESS_SPECS) {
    const evaluation = evaluatePersistedLivenessReceipt(spec, passingReceipt(spec));
    assert.equal(evaluation.ok, true, spec.id);
    assert.equal(evaluation.status, 'PASS', spec.id);
    assert.equal(evaluation.liveness.status, 'PASS', spec.id);
  }
});

test('reload bytes, normalized checkpoint, canonical scene and action witness are all mandatory', () => {
  const spec = PERSISTED_LIVENESS_SPECS[0];
  const receipt = passingReceipt(spec);
  receipt.reloaded.raw = '{"different":true}';
  receipt.reloaded.checkpoint = null;
  receipt.runtime.sceneId = 'apartment';
  receipt.runtime.url += '?preview=1';
  receipt.witness.accepted = false;
  receipt.witness.changed = false;
  receipt.observation.progressActions[0].reachable = false;

  const evaluation = evaluatePersistedLivenessReceipt(spec, receipt);
  assert.equal(evaluation.ok, false);
  assert.deepEqual(evaluation.failures.map(({ code }) => code), [
    'RELOAD_BYTES_CHANGED',
    'RELOAD_CHECKPOINT_MISMATCH',
    'RUNTIME_SCENE_MISMATCH',
    'PREVIEW_RUNTIME',
    'WITNESS_REFUSED',
    'WITNESS_NO_CHANGE',
    'LIVENESS_NOT_PROVEN',
  ]);
});

test('an invalid or vacuous observation cannot be rescued by a claimed witness', () => {
  const spec = PERSISTED_LIVENESS_SPECS[0];
  const receipt = passingReceipt(spec);
  receipt.observation.progressActions = [];

  const evaluation = evaluatePersistedLivenessReceipt(spec, receipt);
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.liveness.status, 'FAIL');
  assert.ok(evaluation.failures.some(({ code }) => code === 'LIVENESS_NOT_PROVEN'));
});

test('the spec validator rejects duplicate and preview-only certification cases', () => {
  assert.throws(
    () => validatePersistedLivenessSpecs([
      PERSISTED_LIVENESS_SPECS[0],
      PERSISTED_LIVENESS_SPECS[0],
    ]),
    /duplicate persisted liveness id/,
  );
  assert.throws(
    () => validatePersistedLivenessSpecs([{
      ...PERSISTED_LIVENESS_SPECS[0],
      id: 'preview-only',
      href: '/nowake.html?preview=1&checkpoint=dock',
    }]),
    /may not certify a preview URL/,
  );
});
