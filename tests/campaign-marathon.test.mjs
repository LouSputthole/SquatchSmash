import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SCENE_IDS } from '../src/core/campaign.js';
import {
  MARATHON_TRANSITIONS,
  PUBLIC_RUNTIME_ENTRY_PATHS,
  validateMarathonPlan,
} from '../tools/verify-campaign-marathon.mjs';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('campaign marathon pins every canonical public handoff in one continuous chain', () => {
  assert.equal(validateMarathonPlan(), true);
  assert.deepEqual(
    MARATHON_TRANSITIONS.map(({ from, to, href, spawn }) => [from, to, href, spawn]),
    [
      [SCENE_IDS.APARTMENT, SCENE_IDS.BADA_BING_ONE, '/bing.html', 'driver_seat'],
      [SCENE_IDS.BADA_BING_ONE, SCENE_IDS.APARTMENT, '/index.html', 'front_door'],
      [SCENE_IDS.APARTMENT, SCENE_IDS.SQUATCHFATHER, '/squatchfather.html', 'restaurant_exterior'],
      [SCENE_IDS.SQUATCHFATHER, SCENE_IDS.APARTMENT, '/index.html', 'front_door'],
      [SCENE_IDS.APARTMENT, SCENE_IDS.AIRSTRIP_SMUGGLING, '/beefrun.html', 'hangar'],
      [SCENE_IDS.AIRSTRIP_SMUGGLING, SCENE_IDS.APARTMENT, '/index.html', 'front_door'],
      [SCENE_IDS.APARTMENT, SCENE_IDS.BADA_BING_TWO, '/bing.html?visit=2', 'driver_seat'],
      [SCENE_IDS.BADA_BING_TWO, SCENE_IDS.SQUATCH_GRAVEYARD, '/graveyard.html', 'headlights'],
      [SCENE_IDS.SQUATCH_GRAVEYARD, SCENE_IDS.JERKY_MOTEL, '/motel.html', 'passenger_seat'],
      [SCENE_IDS.JERKY_MOTEL, SCENE_IDS.APARTMENT, '/index.html', 'front_door'],
      [SCENE_IDS.APARTMENT, SCENE_IDS.NO_WAKE, '/nowake.html', 'gate_c'],
      [SCENE_IDS.NO_WAKE, SCENE_IDS.APARTMENT, '/index.html', 'front_door'],
      [SCENE_IDS.APARTMENT, SCENE_IDS.SILVER_ROOM, '/silver.html', 'kerb'],
      [SCENE_IDS.SILVER_ROOM, SCENE_IDS.APARTMENT, '/index.html', 'front_door'],
      [SCENE_IDS.APARTMENT, SCENE_IDS.SILVER_PINES, '/golf.html', 'car_park'],
      [SCENE_IDS.SILVER_PINES, SCENE_IDS.APARTMENT, '/index.html', 'front_door'],
      [SCENE_IDS.APARTMENT, SCENE_IDS.BANK_HEIST, '/heist.html', 'safehouse'],
      [SCENE_IDS.BANK_HEIST, SCENE_IDS.APARTMENT, '/index.html', 'front_door'],
      [SCENE_IDS.APARTMENT, SCENE_IDS.COUNTRYSIDE_CABIN, '/cabin.html', 'arrival'],
      [SCENE_IDS.COUNTRYSIDE_CABIN, SCENE_IDS.SILVER_CASE, '/silvercase.html', 'car_ride'],
      [SCENE_IDS.SILVER_CASE, SCENE_IDS.MANSION, '/mansion.html', 'gate'],
      [SCENE_IDS.MANSION, SCENE_IDS.MANSION_SIEGE, '/mansion-siege.html', 'guest_suite'],
      [SCENE_IDS.MANSION_SIEGE, SCENE_IDS.ENOLA_SQUATCH, '/enolasquatch.html', 'airfield'],
      [SCENE_IDS.ENOLA_SQUATCH, SCENE_IDS.MANSION_RETURN, '/mansion.html?visit=return', 'driveway'],
      [SCENE_IDS.MANSION_RETURN, SCENE_IDS.CARTEL_PALACE, '/cartel-palace.html', 'approach'],
      [SCENE_IDS.CARTEL_PALACE, SCENE_IDS.SPECIAL_MEETING, '/specialmeeting.html', 'kerb'],
      [SCENE_IDS.SPECIAL_MEETING, SCENE_IDS.INITIATION, '/initiation.html', 'gathering'],
      [SCENE_IDS.INITIATION, SCENE_IDS.APARTMENT, '/index.html', 'front_door'],
    ],
  );
});

test('campaign marathon is fail-closed around one browser context, one page, and durable reloads', async () => {
  const [source, packageSource, runner] = await Promise.all([
    read('tools/verify-campaign-marathon.mjs'),
    read('package.json'),
    read('tests/run.mjs'),
  ]);
  assert.equal((source.match(/browser\.newContext\(/g) ?? []).length, 1,
    'the verifier must create exactly one BrowserContext');
  assert.equal((source.match(/context\.newPage\(/g) ?? []).length, 1,
    'the verifier must create exactly one Page');
  assert.match(source, /createCampaignSceneSkipAdapter/);
  assert.match(source, /navigateCampaign/);
  assert.match(source, /page\.reload/);
  assert.match(source, /localStorage\.getItem\(storageKey\)/);
  assert.doesNotMatch(source, /[?&]preview=1/);
  assert.equal(PUBLIC_RUNTIME_ENTRY_PATHS.includes('/src/cabin/main.js'), true,
    'the cabin rendering runtime must be stubbed while its story contract remains live');
  assert.equal(PUBLIC_RUNTIME_ENTRY_PATHS.includes('/src/initiation/main.js'), true,
    'the frozen Initiation runtime must be stubbed, not exercised or modified');
  assert.doesNotMatch(source, /import\(['"]\/src\/initiation\/main\.js['"]\)/);

  const pkg = JSON.parse(packageSource);
  assert.equal(pkg.scripts['verify:campaign-marathon'],
    'node tools/verify-campaign-marathon.mjs');
  assert.match(runner, /['"]\.\/campaign-marathon\.test\.mjs['"]/);
});
