import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { nextLineDelayMs, resolveLineHold } from '../src/motel/dialogue-timing.js';

test('Motel dialogue holds for a delivered take plus its subtitle tail', () => {
  assert.equal(resolveLineHold(3.4, 5.75), 6.25);
  assert.equal(resolveLineHold(3.4, 0), 3.4);
  assert.equal(nextLineDelayMs(6.25), 6430);
  assert.equal(nextLineDelayMs(6.25, 0.78), 7030);
});

test('Motel say returns the resolved hold used by dialogue continuations', () => {
  const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function say(');
  const end = source.indexOf('/** Cue id', start);
  const body = source.slice(start, end);
  assert.match(body, /subtitleT = resolveLineHold\(seconds, spoken\);/);
  assert.match(body, /return subtitleT;/);
  assert.match(source, /function afterLine\(holdSeconds, next, gapSeconds = undefined\)/);
  assert.match(source, /setTimeout\(next, nextLineDelayMs\(holdSeconds, gapSeconds\)\)/);
});

test('Motel character follow-ups are chained from resolved line holds', () => {
  const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
  const section = (start, end) => {
    const from = source.indexOf(start);
    return source.slice(from, source.indexOf(end, from));
  };

  for (const [name, body] of [
    ['arrival briefing', section('function startScene(', 'function finishScene(')],
    ['package count', section("id: 'jerkyCase'", "id: 'placeMoney'")],
    ['bathroom warning', section("id: 'bathDoorCheck'", "id: 'windowSignal'")],
    ['dialogue choice', section('function pickDialogue(', '// ---------- Inspection')],
    ['inspection banter', section('function closeInspection(', 'function renderInspection(')],
    ['betrayal reveal', section('function maybeBetray(', 'function snowJoins(')],
    ['Snow crowbar throw', section('function snowJoins(', '// ---------- Combat')],
    ['getaway boarding', section('function boardGetaway(', '// ---------- Doors')],
    ['quality check', section('// Snow helps himself to the evidence', 'if (S.windowBroken)')],
  ]) {
    assert.match(body, /afterLine\(/, `${name} must wait on the preceding line`);
  }

  const directTimedSpeech = [...source.matchAll(/setTimeout\(\s*\(\)\s*=>\s*say\(/g)];
  assert.deepEqual(directTimedSpeech.map((match) => match[0]), []);
});
