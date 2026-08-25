import assert from 'node:assert/strict';
import test from 'node:test';

import { SCENES, SCENE_IDS } from '../src/core/campaign.js';
import {
  SCENE_CONTRACTS,
  getSceneContract,
  listSceneEntrypoints,
} from '../src/core/scene-contracts.js';
import {
  CONTRACT_CAPABILITIES,
  CONTRACT_DISPOSITION,
  validateSceneContracts,
} from '../src/core/scene-contract.js';

test('the registry covers every campaign scene exactly once', () => {
  const expected = Object.values(SCENE_IDS).sort();
  const actual = SCENE_CONTRACTS.map((contract) => contract.id).sort();
  assert.equal(SCENE_CONTRACTS.length, 20);
  assert.deepEqual(actual, expected);
  assert.deepEqual(validateSceneContracts(SCENE_CONTRACTS, { expectedSceneIds: expected }), []);

  for (const contract of SCENE_CONTRACTS) {
    assert.equal(contract.campaign.href, SCENES[contract.id].href);
    assert.deepEqual(contract.campaign.entrySpawns, SCENES[contract.id].spawns);
    assert.deepEqual(contract.campaign.declaredExits, SCENES[contract.id].next);
    assert.equal(contract.entrypoints.filter((entry) => entry.kind === 'canonical').length, 1);
    assert.deepEqual(Object.keys(contract.capabilities).sort(), [...CONTRACT_CAPABILITIES].sort());
  }
});

test('twenty scene contracts expand to twenty-one runtime entry variants', () => {
  const entries = listSceneEntrypoints();
  assert.equal(entries.length, 21);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 21);

  const bingTwo = getSceneContract(SCENE_IDS.BADA_BING_TWO);
  assert.deepEqual(bingTwo.entrypoints.map((entry) => entry.id), [
    'bada_bing_two_hotdog',
    'bada_bing_two_legacy_main',
  ]);
  assert.equal(bingTwo.entrypoints[0].root, 'src/bing/hotdog-main.js');
  assert.equal(bingTwo.entrypoints[0].href, 'bing.html?visit=2');
  assert.equal(bingTwo.entrypoints[1].root, 'src/bing/main.js');
  assert.equal(bingTwo.entrypoints[1].disposition, CONTRACT_DISPOSITION.KNOWN_FAILURE);
  assert.deepEqual(bingTwo.entrypoints[1].expectedExits, [SCENE_IDS.SQUATCH_GRAVEYARD]);
  assert.deepEqual(bingTwo.entrypoints[1].observedExits, [SCENE_IDS.JERKY_MOTEL]);
});

test('Mansion, Mansion Return, and Siege remain distinct contracts and runtime roots', () => {
  const mansion = getSceneContract(SCENE_IDS.MANSION);
  const mansionReturn = getSceneContract(SCENE_IDS.MANSION_RETURN);
  const siege = getSceneContract(SCENE_IDS.MANSION_SIEGE);

  assert.equal(mansion.entrypoints[0].href, 'mansion.html');
  assert.equal(mansionReturn.entrypoints[0].href, 'mansion.html?visit=return');
  assert.equal(mansion.entrypoints[0].root, 'src/mansion/main.js');
  assert.equal(mansionReturn.entrypoints[0].root, 'src/mansion/main.js');
  assert.equal(mansionReturn.entrypoints[0].disposition, CONTRACT_DISPOSITION.DEBT);
  assert.equal(siege.entrypoints[0].href, 'mansion-siege.html');
  assert.equal(siege.entrypoints[0].root, 'src/mansion/siege/main.js');
});

test('known failures, debt, intentional N/A, and UNKNOWN are explicit registry facts', () => {
  const serialized = JSON.stringify(SCENE_CONTRACTS);
  for (const disposition of [
    CONTRACT_DISPOSITION.DEBT,
    CONTRACT_DISPOSITION.KNOWN_FAILURE,
    CONTRACT_DISPOSITION.INTENTIONAL_NA,
    CONTRACT_DISPOSITION.UNKNOWN,
  ]) {
    assert.match(serialized, new RegExp(`"${disposition}"`));
  }
  assert.doesNotMatch(serialized, /"pass"/, 'unexecuted registry claims must never be recorded as PASS');

  const palace = getSceneContract(SCENE_IDS.CARTEL_PALACE);
  assert.equal(palace.entrypoints[0].disposition, CONTRACT_DISPOSITION.REQUIRED);
  assert.deepEqual(palace.entrypoints[0].expectedExits, [SCENE_IDS.APARTMENT]);
  assert.equal(palace.entrypoints[0].observedExits, undefined);

  const motel = getSceneContract(SCENE_IDS.JERKY_MOTEL);
  assert.equal(motel.capabilities.checkpoints.disposition, CONTRACT_DISPOSITION.UNKNOWN);

  const mansionReturn = getSceneContract(SCENE_IDS.MANSION_RETURN);
  assert.equal(
    mansionReturn.capabilities.checkpoints.disposition,
    CONTRACT_DISPOSITION.INTENTIONAL_NA,
  );
});

test('canonical input adoption does not mutate unresolved browser behavior', () => {
  const unresolvedInput = SCENE_CONTRACTS
    .map(({ id, capabilities }) => ({ id, input: capabilities.input }))
    .filter(({ input }) => input.disposition === CONTRACT_DISPOSITION.DEBT
      && input.actions?.includes('pointer_lock'));
  const canonical = unresolvedInput.filter(({ input }) => (
    input.adapter === 'core/first-person-input'
  ));

  assert.ok(canonical.length > 0, 'fixture lost canonical-but-uncertified input debt');
  assert.equal(new Set(unresolvedInput.map(({ input }) => input.description)).size, 1,
    'architecture metadata changed the player-facing browser obligation');
});

test('Countryside Cabin canonical input is required only after live semantic certification', () => {
  const cabin = getSceneContract(SCENE_IDS.COUNTRYSIDE_CABIN);
  assert.equal(cabin.capabilities.input.disposition, CONTRACT_DISPOSITION.REQUIRED);
  assert.equal(cabin.capabilities.input.adapter, 'core/first-person-input');
  assert.deepEqual(cabin.capabilities.input.actions, [
    'pointer_lock', 'move', 'clear_held_input',
  ]);
});

test('the validator rejects shallow or ambiguous contract records', () => {
  const broken = structuredClone(SCENE_CONTRACTS[0]);
  broken.entrypoints.push(structuredClone(broken.entrypoints[0]));
  broken.capabilities.objective.disposition = 'probably';
  broken.minimumSubjects[0].minimum = 0;
  broken.minimumSubjects.push(structuredClone(broken.minimumSubjects[0]));
  broken.goldenPath = ' ';
  broken.capabilities.input.description = '';
  broken.entrypoints[0].disposition = CONTRACT_DISPOSITION.INTENTIONAL_NA;
  delete broken.entrypoints[0].reason;
  broken.campaign.entrySpawns = [broken.campaign.entrySpawns[0], broken.campaign.entrySpawns[0]];

  const errors = validateSceneContracts([broken]);
  assert.ok(errors.some((error) => error.includes('exactly one canonical entrypoint')));
  assert.ok(errors.some((error) => error.includes('duplicate entrypoint')));
  assert.ok(errors.some((error) => error.includes('unknown disposition')));
  assert.ok(errors.some((error) => error.includes('positive integer')));
  assert.ok(errors.some((error) => error.includes('duplicate subject')));
  assert.ok(errors.some((error) => error.includes('goldenPath')));
  assert.ok(errors.some((error) => error.includes('description')));
  assert.ok(errors.some((error) => error.includes('requires a concrete reason')));
  assert.ok(errors.some((error) => error.includes('entrySpawns')));
});
