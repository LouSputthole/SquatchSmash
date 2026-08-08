import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAPTER_ORDER,
  dressingFor,
  persistentDressingForCampaign,
} from '../src/world/dressing.js';

test('the discarded floor shirt is absent from every apartment chapter', () => {
  for (const chapter of CHAPTER_ORDER) {
    assert.equal(dressingFor(chapter).shown.has('bloodShirt'), false,
      `${chapter} still leaves the blood-stained shirt on the floor`);
  }
});

test('Tammy’s Dashboard Mug appears only after Beef Run and survives later apartment chapters', () => {
  const beforeFlight = {
    story: { chapter: 'day_two' },
    missions: { airstrip_smuggling: { status: 'available' } },
  };
  assert.deepEqual([...persistentDressingForCampaign(beforeFlight)], []);

  const afterFlight = {
    story: { chapter: 'golf_morning' },
    missions: { airstrip_smuggling: { status: 'complete' } },
  };
  assert.deepEqual([...persistentDressingForCampaign(afterFlight)], ['tammyDashboardMug']);
});
