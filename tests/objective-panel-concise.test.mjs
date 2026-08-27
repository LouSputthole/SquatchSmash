import assert from 'node:assert/strict';
import test from 'node:test';

import { TIME_EVENT_IDS } from '../src/core/campaign.js';
import { createCountrysideCabinStory } from '../src/core/countryside-cabin-story.js';
import { createCampaign, SCENE_IDS, MISSION_IDS } from '../src/core/campaign.js';

/**
 * WHAT A PANEL IS ALLOWED TO SAY.
 *
 * Owner, 2026-08-26, playing the Cabin: *"Also hide the objective that is
 * answer lous call and display it only as he calls. Remove the finish the
 * Cabin chapter from objectives what does that even mean. Keep the objectives
 * concise and relevant to whats next and then once complete remove and
 * replace with the new objectives we need to implement that across the
 * board."*
 *
 * Three separate faults in one panel, and each is a different way of telling
 * the player something useless:
 *
 *   - a call he cannot answer yet, listed and unticked, reading as a failure;
 *   - "Finish the cabin chapter", which is the panel describing the panel;
 *   - four ticked walks that cannot be un-ticked, pushing the thing he is
 *     actually meant to do next off the bottom of a short list.
 *
 * The mechanism is in `src/core/objective-panel.js` -- `pending` hides a line
 * that is not yet his problem, `retire` drops a step once it is done -- so
 * every scene that adopts the shared panel inherits it. This file holds the
 * Cabin, which is where it was reported.
 */

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

/** The cabin at the moment the driver pulls away: 05:20 on Day Two. */
function atTheCabin() {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.scene = { id: SCENE_IDS.SQUATCHFATHER, spawn: 'restaurant_exterior' };
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
  });
  campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER);
  campaign.advanceTime(TIME_EVENT_IDS.DEPART_CABIN_LAY_LOW, (state) => {
    state.scene = { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'arrival' };
  });
  return createCountrysideCabinStory({ campaign });
}

/** What the panel would actually draw, after its own filter. */
const drawn = (story) => story.objectives()
  .filter((item) => !item.pending && !(item.retire && item.done));

test('Lou is not on the list until the player can answer him', () => {
  const story = atTheCabin();
  const before = drawn(story).map((item) => item.label);
  assert.ok(!before.includes('Answer Lou’s call'),
    'the call is listed before the phone can ring');
  assert.deepEqual(before, ['Settle in at the cabin'],
    'the first thing that happens at this cabin is a bed, and it is the only '
    + 'thing the panel should be asking for');
  assert.equal(story.objectives()[0].step, 'Get some sleep');

  story.completeArrivalRest();
  const after = drawn(story);
  assert.deepEqual(after.map((item) => item.label), ['Lay low at the cabin']);
  assert.equal(after[0].step, 'Answer Lou’s call', 'the call never arrives');
  assert.ok(!after.some((item) => item.step === 'Get some sleep'),
    'the bed is done and should have retired');
});

test('the panel never says "Finish the cabin chapter"', () => {
  const story = atTheCabin();
  /* Every phase of the chapter, not just the first. */
  const seen = new Set();
  const record = () => story.objectives().forEach((i) => seen.add(i.label));
  record();
  story.completeArrivalRest(); record();
  story.completeOpeningCall(); record();
  for (const id of ['creek', 'overlook', 'shed', 'range']) { story.visit(id); record(); }
  story.completeMargoCall(); record();
  story.completeBooskiSasoleCall(); record();

  for (const label of seen) {
    assert.ok(!/finish the cabin chapter/i.test(label),
      `the panel described itself: ${JSON.stringify(label)}`);
  }
});

/**
 * The door is a line only when it opens. It used to emit a row in every
 * state, which meant the bottom of the list was permanently occupied by
 * something the player could not act on.
 */
test('the car is on the list only when it will actually move', () => {
  const story = atTheCabin();
  const departLines = () => drawn(story)
    .filter((item) => /ride out|drive back|take the car/i.test(item.label));

  assert.deepEqual(departLines(), [], 'the car is listed while it is locked');

  story.completeArrivalRest();
  story.completeOpeningCall();
  for (const id of ['creek', 'overlook', 'shed', 'range']) story.visit(id);
  story.completeMargoCall();
  story.completeBooskiSasoleCall();

  const open = departLines();
  assert.equal(open.length, 1, 'the car opened and said nothing');
  assert.equal(open[0].label, 'Ride out to the airstrip',
    'the door has to name where it is going -- it opens twice in this scene');
  assert.equal(story.tryLeave().kind, 'go');
});

/**
 * The whole point of the owner's note: the list stays short. Four walks, two
 * calls, a bed and a car is eight rows if nothing ever leaves.
 */
test('the list stays short because finished steps leave it', () => {
  const story = atTheCabin();
  story.completeArrivalRest();
  story.completeOpeningCall();

  const widest = [];
  for (const id of ['creek', 'overlook', 'shed', 'range']) {
    story.visit(id);
    widest.push(drawn(story).length);
  }
  story.completeMargoCall();
  widest.push(drawn(story).length);

  const worst = Math.max(...widest);
  assert.ok(worst <= 4,
    `the panel reached ${worst} live rows; finished steps are not retiring`);
});
