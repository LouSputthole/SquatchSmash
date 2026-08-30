import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { SCENE_IDS } from '../src/core/campaign.js';
import { spineBeat } from '../src/core/campaign-spine.js';
import { FINALE_BEATS } from '../src/cartel-palace/finale.js';
import { PALACE_CONVERSATIONS } from '../src/cartel-palace/conversations.js';
import { BEATS as ENOLA_BEATS } from '../src/enolasquatch/dialogue/script.js';
import { CUES as GOLF_CUES } from '../src/golf/script.js';
import { ALL_HEIST_DIALOGUE, HEIST_DIALOGUE } from '../src/heist/script.js';
import { SEQUENCES as SIEGE_SEQUENCES } from '../src/mansion/siege/script.js';
import { DATE_BARKS } from '../src/silver/script.js';

test('Enola greets Tony as the pilot Sasole already flew with on the Beef Run', () => {
  const arrival = ENOLA_BEATS['preflight.arrival'].map(({ text }) => text).join(' ');
  assert.match(arrival, /Brushrunner/i);
  assert.match(arrival, /twice the engines/i);
  assert.doesNotMatch(arrival, /wrong city|destination|coordinates/i,
    'the relationship callback must not point out the instrument clue');
});

test('the visible Enola loading overlay does not spoil the wrong-city instrument clue', () => {
  const mainSource = fs.readFileSync(new URL('../src/enolasquatch/main.js', import.meta.url), 'utf8');
  assert.match(mainSource, /__squatchStage\?\.\('Laying out the target area/);
  assert.doesNotMatch(mainSource, /__squatchStage\?\.\('Laying out Squatchbourg/i);
});

test('the golf OPSEC choice does not invent a Margo call after the cabin date was set', () => {
  assert.equal(GOLF_CUES['golf.h3.prospect.told_margo'], undefined);
  assert.equal(
    GOLF_CUES['golf.h3.prospect.margo_only_knows_tonight']?.text,
    'Nobody. Margo only knows about tonight.',
  );
});

test('THE TAKE plays Tony as physically present instead of winking at Counter-Strike', () => {
  assert.equal(HEIST_DIALOGUE.prospect_counterstrike, undefined);
  assert.equal(
    HEIST_DIALOGUE.prospect_lobby_quiet?.text,
    "Huh. It's a lot slower than you'd think. That's the part nobody mentions.",
  );
  const authored = Object.values(ALL_HEIST_DIALOGUE).map(({ text }) => text).join('\n');
  assert.doesNotMatch(authored, /Counter-Strike/i);
  assert.match(HEIST_DIALOGUE.prospect_ready.text, /hands won't stop/i);
  assert.match(ALL_HEIST_DIALOGUE.prospect_mask_on.text, /hear my own heart/i);
});

test('the Siege staging carries the parody without quoting the film', () => {
  const line = SIEGE_SEQUENCES.little_friend[0].say;
  assert.equal(line,
    "Fine. Everybody at once. Let's find out how many of you this thing was designed for.");
  assert.doesNotMatch(line, /say hello to my little friend/i);
});

test('Beat 27 belongs to the luxury apartment and Beat 28 owns the existing ride', () => {
  assert.equal(spineBeat('special_meeting_call').scene, SCENE_IDS.LUXURY_APARTMENT);
  assert.equal(spineBeat('pickup_ride').scene, SCENE_IDS.SPECIAL_MEETING);
});

test('later campaign dialogue does not inherit weekdays from the retired calendar', () => {
  assert.doesNotMatch(ALL_HEIST_DIALOGUE.hostage_refuses_three.text, /Thursday/i);
  assert.doesNotMatch(DATE_BARKS.kitchen[0], /Tuesday/i);
  assert.doesNotMatch(DATE_BARKS.show[0], /Tuesday/i);

  const markCalendarLines = [
    FINALE_BEATS['arrival.loud'][0].text,
    FINALE_BEATS['reprisal.enter.cold'][0].text,
    FINALE_BEATS['reprisal.final.cold'][1].text,
  ];
  assert.doesNotMatch(markCalendarLines.join('\n'), /Tuesday/i);
  assert.match(markCalendarLines.join('\n'), /with a ledger/i);

  const palaceShift = PALACE_CONVERSATIONS
    .flatMap(({ lines }) => lines.map(({ text }) => text))
    .find((text) => text.includes('A-Team did in Jersey'));
  assert.match(palaceShift, /earlier this week/i);
  assert.doesNotMatch(palaceShift, /Tuesday/i);
});
