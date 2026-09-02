import assert from 'node:assert/strict';
import test from 'node:test';

import { CAMPAIGN_STAT_MISSION_IDS, initialCampaignStatistics } from '../src/core/campaign-stats.js';
import {
  RUN_CODE_FIELDS, decodeRunCode, encodeRunCode, normalizeRunCode,
} from '../src/core/run-code.js';

const FULL_RUN = Object.freeze({
  missionsCompleted: 16,
  campaignDaysElapsed: 13,
  shotsFired: 4_217,
  peopleKilled: 88,
  cabinExecutionByProspect: true,
  cabinExecutionCounted: true,
  margoCameHome: true,
  grossTake: 1_470_000,
  palaceEvidenceRecovered: 7,
  familyRespect: 92,
  completedMissionIds: [...CAMPAIGN_STAT_MISSION_IDS],
});

test('a run code is nineteen readable characters in four groups', () => {
  const code = encodeRunCode(FULL_RUN);
  assert.match(code, /^SQ-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{4}$/);
  assert.doesNotMatch(code, /[ILOU]/, 'the alphabet leaves out the four confusable letters');
  assert.equal(RUN_CODE_FIELDS.reduce((sum, field) => sum + field.bits, 0) + 8, 94);
});

test('the code is the record: every row comes back exactly', () => {
  const decoded = decodeRunCode(encodeRunCode(FULL_RUN));
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.statistics, { ...FULL_RUN, cabinExecutionCounted: true });
  assert.deepEqual(decoded.completedMissionIds, CAMPAIGN_STAT_MISSION_IDS);
  assert.deepEqual(decoded.saturated, []);
});

test('a fresh record and an unfinished one both survive the trip', () => {
  const fresh = decodeRunCode(encodeRunCode(initialCampaignStatistics()));
  assert.equal(fresh.ok, true);
  assert.deepEqual(fresh.statistics, initialCampaignStatistics());
  const partial = decodeRunCode(encodeRunCode({
    ...initialCampaignStatistics(),
    missionsCompleted: 3,
    campaignDaysElapsed: 5,
    shotsFired: 61,
    peopleKilled: 2,
    cabinExecutionByProspect: false,
    cabinExecutionCounted: true,
    completedMissionIds: ['bada_bing_one', 'squatchfather', 'airstrip_smuggling'],
  }));
  assert.equal(partial.ok, true);
  assert.equal(partial.statistics.cabinExecutionByProspect, false);
  assert.equal(partial.statistics.margoCameHome, null);
  assert.deepEqual(partial.completedMissionIds, ['bada_bing_one', 'squatchfather', 'airstrip_smuggling']);
});

test('typing is forgiven: case, spaces, dashes, and the letters that look like digits', () => {
  const code = encodeRunCode(FULL_RUN);
  const sloppy = code.toLowerCase().replaceAll('-', ' ').replace(/0/g, 'o').replace(/1/g, 'l');
  assert.equal(normalizeRunCode(sloppy), normalizeRunCode(code));
  assert.equal(decodeRunCode(sloppy).ok, true);
  assert.equal(decodeRunCode(sloppy).code, code);
});

test('a wrong character is caught, not read as somebody else\'s run', () => {
  const code = encodeRunCode(FULL_RUN);
  let caught = 0;
  const positions = [...code].map((char, index) => (/[0-9A-Z]/.test(char) && index > 2 ? index : -1))
    .filter((index) => index >= 0);
  for (const index of positions) {
    const replacement = code[index] === 'A' ? 'B' : 'A';
    const wrong = code.slice(0, index) + replacement + code.slice(index + 1);
    const decoded = decodeRunCode(wrong);
    if (!decoded.ok) caught += 1;
    else assert.notDeepEqual(decoded.statistics, FULL_RUN, `a wrong character at ${index} decoded to the same record`);
  }
  assert.ok(caught >= positions.length * 0.9, `only ${caught} of ${positions.length} single-character errors were caught`);
  assert.equal(decodeRunCode('SQ-ABCDE').ok, false);
  assert.equal(decodeRunCode('SQ-ABCDE').reason, 'length');
  assert.equal(decodeRunCode('').ok, false);
});

test('counts past the top of a field saturate and say so', () => {
  const decoded = decodeRunCode(encodeRunCode({ ...FULL_RUN, shotsFired: 999_999 }));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.statistics.shotsFired, 2 ** 17 - 1);
  assert.deepEqual(decoded.saturated, ['shotsFired']);
});
