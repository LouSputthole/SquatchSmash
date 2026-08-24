import assert from 'node:assert/strict';
import test from 'node:test';

import { SCENE_IDS } from '../src/core/campaign.js';
import { SCENE_CONTRACTS, getSceneContract } from '../src/core/scene-contracts.js';
import {
  CONTRACT_DISPOSITION,
  SEMANTIC_SMOKE_AREAS,
  generateSemanticSmokeObligations,
  generateSemanticSmokeRegistry,
  summarizeSemanticSmoke,
} from '../src/core/scene-contract.js';
import { buildSemanticSmokeReport } from '../tools/verify-semantic-smoke.mjs';

test('every runtime entry receives the complete semantic-smoke obligation families', () => {
  const obligations = generateSemanticSmokeRegistry(SCENE_CONTRACTS);
  const entries = new Map();
  for (const obligation of obligations) {
    if (!entries.has(obligation.entrypointId)) entries.set(obligation.entrypointId, []);
    entries.get(obligation.entrypointId).push(obligation);
  }
  assert.equal(entries.size, 20);

  const requiredAreas = [
    'entry', 'spawn', 'boot', 'input', 'camera', 'objective', 'interaction',
    'checkpoint', 'minimum_subjects', 'progression',
  ];
  for (const [entrypointId, items] of entries) {
    const areas = new Set(items.map((item) => item.area));
    for (const area of requiredAreas) {
      assert.ok(areas.has(area), `${entrypointId} has no ${area} obligation`);
    }
  }
  assert.deepEqual(Object.keys(summarizeSemanticSmoke(obligations).byArea), SEMANTIC_SMOKE_AREAS);
});

test('every registered campaign spawn becomes its own liveness obligation', () => {
  for (const contract of SCENE_CONTRACTS) {
    const expected = [...contract.campaign.entrySpawns].sort();
    for (const entrypoint of contract.entrypoints) {
      const actual = generateSemanticSmokeObligations(contract, { entrypoint: entrypoint.id })
        .filter((item) => item.area === 'spawn')
        .map((item) => item.assertion.spawnId)
        .sort();
      assert.deepEqual(actual, expected, `${entrypoint.id} does not cover every campaign spawn`);
    }
  }
});

test('input obligations require real pointer-lock, movement, and held-input clearing', () => {
  const obligations = generateSemanticSmokeRegistry(SCENE_CONTRACTS);
  const input = obligations.filter((item) => item.area === 'input');
  assert.equal(input.length, 60, 'three real-input obligations for each of twenty entries');
  for (const entrypointId of new Set(input.map((item) => item.entrypointId))) {
    const actions = input.filter((item) => item.entrypointId === entrypointId)
      .map((item) => item.assertion.action).sort();
    assert.deepEqual(actions, ['clear_held_input', 'move', 'pointer_lock']);
    assert.ok(input.every((item) => item.assertion.kind === 'real-input'));
  }
});

test('Special Meeting camera handoffs are required behavior after live certification', () => {
  const camera = generateSemanticSmokeObligations(getSceneContract(SCENE_IDS.SPECIAL_MEETING))
    .filter((item) => item.area === 'camera');
  assert.deepEqual(camera.map((item) => item.assertion.behavior), [
    'look_changes_view', 'owner_matches_phase', 'returns_to_playable_view',
  ]);
  assert.ok(camera.every((item) => item.disposition === CONTRACT_DISPOSITION.REQUIRED));
  assert.ok(camera.every((item) => item.assertion.mode === 'first_person_and_scripted_ride'));
});

test('minimum-subject obligations cannot pass vacuously', () => {
  const obligations = generateSemanticSmokeRegistry(SCENE_CONTRACTS)
    .filter((item) => item.area === 'minimum_subjects');
  for (const item of obligations) {
    if ([CONTRACT_DISPOSITION.REQUIRED, CONTRACT_DISPOSITION.DEBT,
      CONTRACT_DISPOSITION.KNOWN_FAILURE].includes(item.disposition)) {
      assert.ok(Number.isInteger(item.assertion.minimum) && item.assertion.minimum > 0,
        `${item.id} has no positive minimum`);
    } else {
      assert.ok(item.assertion.minimum == null || item.assertion.minimum > 0);
    }
  }
  const apartmentActor = obligations.find((item) => item.sceneId === SCENE_IDS.APARTMENT
    && item.assertion.subject === 'authored_actor');
  assert.equal(apartmentActor.disposition, CONTRACT_DISPOSITION.UNKNOWN);
  assert.equal(apartmentActor.assertion.minimum, null);
});

test('checkpoint obligations preserve exact ids and unresolved capability state', () => {
  const noWake = generateSemanticSmokeObligations(getSceneContract(SCENE_IDS.NO_WAKE))
    .filter((item) => item.area === 'checkpoint');
  assert.deepEqual(noWake.map((item) => item.assertion.checkpointId), [
    'dock', 'underway', 'open_water', 'execution', 'weighted',
  ]);
  assert.ok(noWake.every((item) => item.assertion.mustExposeLegalProgression));

  const motel = generateSemanticSmokeObligations(getSceneContract(SCENE_IDS.JERKY_MOTEL))
    .filter((item) => item.area === 'checkpoint');
  assert.equal(motel.length, 1);
  assert.equal(motel[0].disposition, CONTRACT_DISPOSITION.UNKNOWN);
  assert.equal(motel[0].assertion.checkpointId, null);

  const mansionReturn = generateSemanticSmokeObligations(
    getSceneContract(SCENE_IDS.MANSION_RETURN),
  ).filter((item) => item.area === 'checkpoint');
  assert.equal(mansionReturn[0].disposition, CONTRACT_DISPOSITION.INTENTIONAL_NA);
  assert.equal(mansionReturn[0].assertion.mustExposeLegalProgression, false);
});

test('legacy Bing 2 and Palace route drift are generated as failing obligations', () => {
  const obligations = generateSemanticSmokeRegistry(SCENE_CONTRACTS);
  const bingLegacy = obligations.find((item) => item.entrypointId === 'bada_bing_two_legacy_main'
    && item.area === 'entry');
  assert.equal(bingLegacy.disposition, CONTRACT_DISPOSITION.KNOWN_FAILURE);
  assert.deepEqual(bingLegacy.assertion.expectedExits, [SCENE_IDS.SQUATCH_GRAVEYARD]);
  assert.deepEqual(bingLegacy.assertion.observedExits, [SCENE_IDS.JERKY_MOTEL]);

  const palace = obligations.find((item) => item.sceneId === SCENE_IDS.CARTEL_PALACE
    && item.area === 'entry');
  assert.equal(palace.disposition, CONTRACT_DISPOSITION.KNOWN_FAILURE);
  assert.deepEqual(palace.assertion.expectedExits, [SCENE_IDS.APARTMENT]);
  assert.deepEqual(palace.assertion.observedExits, [SCENE_IDS.SPECIAL_MEETING]);
});

test('the verifier reports schema health separately from certification readiness', () => {
  const report = buildSemanticSmokeReport();
  assert.deepEqual(report.validationErrors, []);
  assert.equal(report.summary.byDisposition.intentional_na, 1);
  assert.ok(report.summary.byDisposition.debt > 0);
  assert.ok(report.summary.byDisposition.known_failure > 0);
  assert.ok(report.summary.byDisposition.unknown > 0);
  assert.equal(report.contractReady, false,
    'known debt/failure/UNKNOWN must not be reported as a ready behavioral contract');
  assert.ok(report.blockers.some((item) => item.disposition === CONTRACT_DISPOSITION.UNKNOWN));
});
