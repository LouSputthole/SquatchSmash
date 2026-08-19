import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_AUDIO_FEEDBACK_CUES,
  createCampaignAudioFeedback,
} from '../src/core/campaign-audio-feedback.js';

test('campaign audio feedback only announces accepted semantic beats once', () => {
  const played = [];
  const feedback = createCampaignAudioFeedback({
    play: (name, options) => played.push({ name, options }),
  });

  assert.deepEqual(CAMPAIGN_AUDIO_FEEDBACK_CUES, ['ui.select', 'woo.streak']);
  assert.equal(feedback.checkpoint('dock', false), false);
  assert.equal(feedback.checkpoint('dock', true), true);
  assert.equal(feedback.checkpoint('dock', true), false);
  assert.equal(feedback.checkpoint('underway', true, { volume: 0.3 }), true);
  assert.equal(feedback.complete('mission', false), false);
  assert.equal(feedback.complete('mission', true), true);
  assert.equal(feedback.complete('mission', true), false);

  assert.deepEqual(played, [
    { name: 'ui.select', options: { volume: 0.42, rate: 0.96 } },
    { name: 'ui.select', options: { volume: 0.3, rate: 0.96 } },
    { name: 'woo.streak', options: { volume: 0.56, rate: 0.92 } },
  ]);
  assert.deepEqual(feedback.debug, {
    checkpoints: ['dock', 'underway'],
    completions: ['mission'],
  });
});

test('campaign audio feedback reset and cue overrides stay bounded', () => {
  const played = [];
  const feedback = createCampaignAudioFeedback({
    play: (name, options) => played.push({ name, options }),
  }, {
    checkpointCue: 'radio.click',
    completeCue: 'chat.ping',
  });

  assert.equal(feedback.checkpoint('   '), false);
  assert.equal(feedback.complete('', true), false);
  assert.equal(feedback.checkpoint('one'), true);
  assert.equal(feedback.complete('done'), true);
  feedback.reset();
  assert.deepEqual(feedback.debug, { checkpoints: [], completions: [] });
  assert.equal(feedback.checkpoint('one'), true);

  assert.deepEqual(played.map(({ name }) => name), [
    'radio.click', 'chat.ping', 'radio.click',
  ]);
});

test('campaign audio feedback rejects an invalid audio boundary', () => {
  assert.throws(
    () => createCampaignAudioFeedback({}),
    /requires audio\.play/,
  );
});
