import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SPECIAL_MEETING_RADIO_GAG,
  playSpecialMeetingRadioGag,
} from '../src/specialmeeting/radio-gag.js';
import { beat } from '../src/specialmeeting/script.js';

test('SM-200 owns an exact two-second radio action instead of an inert note', () => {
  const line = beat('SM-200').lines[0];
  assert.equal(line.radioGag, true);
  assert.equal(line.holdSeconds, 2);
  assert.equal(SPECIAL_MEETING_RADIO_GAG.seconds, 2);
});

test('Lag starts the delivered announcer recording and Seff cuts its real source at two seconds', () => {
  const stops = [];
  const source = { stop: (at) => stops.push(at), onended: null };
  const receipt = Object.freeze({ id: 7, requested: SPECIAL_MEETING_RADIO_GAG.cue, started: true });
  const calls = [];
  const audio = {
    ctx: { currentTime: 12.25 },
    sampleDuration: () => 4.643991,
    playWithReceipt(cue, options) {
      calls.push({ cue, options });
      return { source, receipt };
    },
  };

  const evidence = playSpecialMeetingRadioGag(audio);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cue, SPECIAL_MEETING_RADIO_GAG.cue);
  assert.equal(calls[0].options.requiredRecorded, true);
  assert.equal(calls[0].options.speechMode, 'radio');
  assert.deepEqual(stops, [14.25]);
  assert.equal(evidence.receipt, receipt);
  assert.equal(evidence.started, true);
  assert.equal(evidence.stopAt, 14.25);
  assert.equal(evidence.naturalSeconds, 4.643991);
  assert.equal(evidence.cutScheduled, true);
  assert.equal(evidence.lifecycle, 'playing');

  audio.ctx.currentTime = 14.25;
  source.onended();
  assert.equal(evidence.ended, true);
  assert.equal(evidence.endedAt, 14.25);
  assert.equal(evidence.endedReason, 'cut');
  assert.equal(evidence.lifecycle, 'cut');
});

test('the gag cue resolves to a delivered recording and the runtime wires it onStage', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url)));
  const entry = manifest.sfx.find(({ name }) => name === SPECIAL_MEETING_RADIO_GAG.cue);
  assert.ok(entry, 'the exact announcer cue is missing from the audio manifest');
  const file = entry.file || `${entry.name}.mp3`;
  assert.equal(existsSync(new URL(`../assets/sfx/${file}`, import.meta.url)), true);

  const runtime = readFileSync(new URL('../src/specialmeeting/main.js', import.meta.url), 'utf8');
  assert.match(runtime, /line\.radioGag/);
  assert.match(runtime, /playSpecialMeetingRadioGag\(audio\)/);

  const verifier = readFileSync(new URL('../tools/verify-specialmeeting.mjs', import.meta.url), 'utf8');
  assert.match(
    verifier,
    /SM-200 plays the delivered announcer recording and Seff cuts it at exactly two seconds/,
  );
  assert.match(verifier, /radioGagReceipts/);
});
