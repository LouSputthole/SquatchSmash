import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSemanticCapabilityCoverage,
  renderSemanticCapabilityCoverage,
} from '../tools/semantic-capability-coverage.mjs';

test('semantic coverage is tracked per entrypoint and capability without turning UNKNOWN green', () => {
  const report = buildSemanticCapabilityCoverage();

  assert.equal(report.schema, 'squatchsmash.semantic-capability-coverage.v1');
  assert.equal(report.rows.length, 22);
  assert.equal(report.areas.length, 10);
  assert.equal(report.summary.totalCells, 220);

  const motel = report.rows.find(({ entrypointId }) => entrypointId === 'jerky_motel_canonical');
  assert.ok(motel);
  assert.equal(motel.capabilities.checkpoint.status, 'unknown');

  const specialMeeting = report.rows.find(
    ({ entrypointId }) => entrypointId === 'special_meeting_canonical',
  );
  assert.ok(specialMeeting);
  assert.equal(specialMeeting.capabilities.camera.status, 'required');
  assert.equal(report.summary.byStatus.unknown > 0, true);
  assert.equal(report.contractReady, false);
});

test('rendered semantic matrix distinguishes a contract from live browser proof', () => {
  const markdown = renderSemanticCapabilityCoverage(buildSemanticCapabilityCoverage());

  assert.match(markdown, /REQUIRED means contracted, not a live PASS/);
  assert.match(markdown, /\| jerky_motel_canonical \|/);
  assert.match(markdown, /UNKNOWN/);
  assert.match(markdown, /special_meeting_canonical/);
});
