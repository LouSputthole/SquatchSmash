import assert from 'node:assert/strict';
import test from 'node:test';

import { persistentDressingForCampaign } from '../src/world/dressing.js';

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
