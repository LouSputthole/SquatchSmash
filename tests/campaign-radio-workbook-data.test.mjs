import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_RADIO_BEATS,
  PHYSICAL_RADIO_RECEIVERS,
  RADIO_PROGRAMS,
} from '../src/core/radio-program.js';
import {
  LIVE_RADIO_WORKBOOK_COLUMNS,
  buildLiveRadioWorkbookRows,
  liveRadioWorkbookMatrix,
} from '../tools/campaign-radio-workbook-data.mjs';

test('the production workbook radio ledger is generated from the live manifest', () => {
  const rows = buildLiveRadioWorkbookRows();
  const expectedBlocks = RADIO_PROGRAMS.reduce((sum, program) => sum + program.blocks.length, 0);
  assert.equal(rows.filter((row) => row['Record type'] === 'BEAT').length,
    Object.keys(CAMPAIGN_RADIO_BEATS).length);
  assert.equal(rows.filter((row) => row['Record type'] === 'PROGRAM').length,
    RADIO_PROGRAMS.length);
  assert.equal(rows.filter((row) => row['Record type'] === 'BLOCK').length,
    expectedBlocks);
  assert.equal(rows.filter((row) => row['Record type'] === 'RECEIVER').length,
    Object.keys(PHYSICAL_RADIO_RECEIVERS).length);
  assert.equal(liveRadioWorkbookMatrix().length, rows.length);
  assert.ok(liveRadioWorkbookMatrix().every((row) => row.length === LIVE_RADIO_WORKBOOK_COLUMNS.length));
});

test('every workbook program block has a stable order, content identity and resume key', () => {
  const blocks = buildLiveRadioWorkbookRows().filter((row) => row['Record type'] === 'BLOCK');
  for (const program of RADIO_PROGRAMS) {
    const rows = blocks.filter((row) => row['Program ID'] === program.id);
    assert.deepEqual(rows.map((row) => row.Order), program.blocks.map((_, index) => index + 1));
    assert.deepEqual(rows.map((row) => row['Block ID']), program.blocks.map((entry) => entry.id));
    assert.ok(rows.every((row) => row['Content ID']));
    assert.ok(rows.every((row) => row['Resume key'] === `campaign.radio.programProgress.${program.id}`));
  }
});
