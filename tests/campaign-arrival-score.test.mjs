import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  CAMPAIGN_ARRIVAL_SCORES,
  CampaignArrivalScore,
  createCampaignArrivalScore,
} from '../src/core/campaign-arrival-score.js';

function fakeAudio() {
  const calls = [];
  const handles = new Map();
  return {
    calls,
    loops: handles,
    startMusicLoop(key, file, options) {
      calls.push(['start', key, file, options]);
      const handle = { streamed: true, released: false };
      handles.set(key, handle);
      return handle;
    },
    stopLoop(key, fade) {
      calls.push(['stop', key, fade]);
      const handle = handles.get(key);
      handles.delete(key);
      if (handle) handle.released = true;
    },
  };
}

test('the three approved arrival scores are sparse non-diegetic music-bus cues', () => {
  assert.deepEqual(Object.keys(CAMPAIGN_ARRIVAL_SCORES).sort(), [
    'cartel_palace',
    'silver_case',
    'squatch_graveyard',
  ]);
  for (const definition of Object.values(CAMPAIGN_ARRIVAL_SCORES)) {
    assert.match(definition.key, /^music\.arrival\./);
    assert.match(definition.file, /^assets\/music\/.+-score\.mp3$/);
    assert.ok(definition.volume > 0 && definition.volume <= 0.14);
    assert.ok(definition.fadeIn >= 1);
    assert.ok(definition.fadeOut >= 0.5);
  }
});

test('CampaignArrivalScore owns one streamed handle and routes through the ducked music bus', () => {
  const audio = fakeAudio();
  const score = createCampaignArrivalScore(audio, 'silver_case');

  assert.equal(score.start(), true);
  assert.equal(score.start(), true, 'a duplicate start reuses the live score');
  assert.equal(audio.calls.length, 1);
  const [, key, file, options] = audio.calls[0];
  assert.equal(key, CAMPAIGN_ARRIVAL_SCORES.silver_case.key);
  assert.equal(file, CAMPAIGN_ARRIVAL_SCORES.silver_case.file);
  assert.equal(options.bus, 'music');
  assert.equal(options.ambience, false);
  assert.equal(options.loop, false);
  assert.equal(options.volume, CAMPAIGN_ARRIVAL_SCORES.silver_case.volume);
  assert.equal(score.snapshot().startCount, 1);
  assert.equal(score.snapshot().active, true);

  assert.equal(score.stop('hallway-arrival'), true);
  assert.deepEqual(audio.calls.at(-1), [
    'stop',
    CAMPAIGN_ARRIVAL_SCORES.silver_case.key,
    CAMPAIGN_ARRIVAL_SCORES.silver_case.fadeOut,
  ]);
  assert.equal(score.snapshot().active, false);
  assert.equal(score.snapshot().stopReason, 'hallway-arrival');
});

test('CampaignArrivalScore rejects unknown campaign placements', () => {
  assert.throws(() => createCampaignArrivalScore(fakeAudio(), 'not-a-scene'), /Unknown arrival score/);
  assert.throws(() => new CampaignArrivalScore(null, CAMPAIGN_ARRIVAL_SCORES.silver_case), /AudioEngine/);
});

test('each approved scene owns an explicit start and a narrative stop boundary', () => {
  const graveyard = fs.readFileSync(new URL('../src/graveyard/main.js', import.meta.url), 'utf8');
  assert.match(graveyard, /createCampaignArrivalScore\(audio,\s*'squatch_graveyard'\)/);
  assert.match(graveyard, /arrivalScore\.start\(\)/);
  assert.match(graveyard, /arrivalScore\.stop\('body-picked-up'\)/);

  const silverCase = fs.readFileSync(new URL('../src/silvercase/main.js', import.meta.url), 'utf8');
  assert.match(silverCase, /createCampaignArrivalScore\(audio,\s*'silver_case'\)/);
  assert.match(silverCase, /arrivalScore\.start\(\)/);
  assert.match(silverCase, /arrivalScore\.stop\('hallway-arrival'\)/);

  const palace = fs.readFileSync(new URL('../src/cartel-palace/main.js', import.meta.url), 'utf8');
  assert.match(palace, /createCampaignArrivalScore\(audio,\s*'cartel_palace'\)/);
  assert.match(palace, /arrivalScore\.start\(\)/);
  assert.match(palace, /arrivalScore\.stop\('perimeter-entered'\)/);
});
