import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { DialogueFloor, nextLineDelayMs, resolveLineHold } from '../src/motel/dialogue-timing.js';

test('Motel dialogue holds for a delivered take plus its subtitle tail', () => {
  assert.equal(resolveLineHold(3.4, 5.75), 6.25);
  assert.equal(resolveLineHold(3.4, 0), 3.4);
  assert.equal(nextLineDelayMs(6.25), 6430);
  assert.equal(nextLineDelayMs(6.25, 0.78), 7030);
});

test('Motel dialogue floor reserves one complete character turn at a time', () => {
  let now = 10;
  const floor = new DialogueFloor({ nowSeconds: () => now });
  assert.deepEqual(floor.reserve(2.5), { delaySeconds: 0, holdSeconds: 2.5, totalSeconds: 2.5 });
  assert.deepEqual(floor.reserve(1.2), { delaySeconds: 2.68, holdSeconds: 1.2, totalSeconds: 3.88 });
  assert.equal(floor.busy(), true);
  now = 14.1;
  assert.equal(floor.busy(), false);
  assert.deepEqual(floor.reserve(1), { delaySeconds: 0, holdSeconds: 1, totalSeconds: 1 });
  floor.reset();
  assert.equal(floor.busy(), false);
});

test('Motel say returns the resolved hold used by dialogue continuations', () => {
  const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function say(');
  const end = source.indexOf('/** Cue id', start);
  const body = source.slice(start, end);
  assert.match(body, /speechFloor\.reserve\(hold\)/);
  assert.match(body, /return slot\.totalSeconds;/);
  assert.match(source, /function afterLine\(holdSeconds, next, gapSeconds = undefined\)/);
  assert.match(source, /setTimeout\(next, nextLineDelayMs\(holdSeconds, gapSeconds\)\)/);
});

test('Motel choices cannot interrupt the line that asks the question', () => {
  const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function openDialogue(');
  const end = source.indexOf('// ---------- Inspection', start);
  const body = source.slice(start, end);
  assert.match(body, /dialogue\.readyAt/);
  /* The gate is named now and it is the only way in: `pickDialogue` asks
   * `dialogueReady()`, and `MOTEL.pick` returns whether the answer was taken
   * so a harness cannot believe it answered when the wheel refused it. */
  assert.match(body, /function dialogueReady\(\) \{\s*\n\s*return !!dialogue && performance\.now\(\) >= dialogue\.readyAt;/);
  assert.match(body, /function pickDialogue\(style\) \{\s*\n\s*if \(!dialogueReady\(\)\) return false;/);
  assert.match(body, /b\.disabled = true/);
  /* The four answers are the instruction, so they are not on screen while the
   * character is still asking — the tone doctrine's rule, in CSS. */
  assert.match(body, /wheelEl\.classList\.add\('pending'\)/);
  assert.match(body, /wheelEl\.classList\.remove\('pending'\)/);
});

test('Motel character follow-ups are chained from resolved line holds', () => {
  const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
  const section = (start, end) => {
    const from = source.indexOf(start);
    return source.slice(from, source.indexOf(end, from));
  };

  for (const [name, body] of [
    ['package count', section("id: 'jerkyCase'", "/* YOUR case.")],
    ['bathroom warning', section("id: 'bathDoorCheck'", "id: 'windowSignal'")],
    ['dialogue choice', section('function pickDialogue(', '// ---------- Inspection')],
    ['inspection banter', section('function closeInspection(', 'function renderInspection(')],
    ['betrayal reveal', section('function maybeBetray(', 'function snowJoins(')],
    ['Snow crowbar throw', section('function snowJoins(', '// ---------- Combat')],
    ['quality check', section('// Snow helps himself to the evidence', 'if (S.windowBroken)')],
  ]) {
    assert.match(body, /afterLine\(/, `${name} must wait on the preceding line`);
  }

  const directTimedSpeech = [...source.matchAll(/setTimeout\(\s*\(\)\s*=>\s*say\(/g)];
  assert.deepEqual(directTimedSpeech.map((match) => match[0]), []);
});

test('the two wheel prompts are spoken once, by the wheel that asks for an answer', () => {
  const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
  const section = (start, end) => {
    const from = source.indexOf(start);
    return source.slice(from, source.indexOf(end, from));
  };
  const opening = section('function startScene(', 'function finishScene(');
  const arrivalGate = section('function maybeOpenCarBrief(', 'function finishArrival(');
  const boarding = section('function boardGetaway(', '// ---------- Doors');

  /* `snowBrief` and `getaway` both had their prompt spoken by the scene and
   * then spoken again by the wheel four seconds later, so the first and last
   * beats of the Motel were a man repeating himself over an unchanged
   * subtitle. Only the wheel says them now. */
  assert.doesNotMatch(opening, /say\(ALLY, 'Room twelve\./);
  assert.doesNotMatch(boarding, /say\(ALLY, 'Tell me that was worth it\./);
  assert.match(arrivalGate, /openDialogue\('snowBrief'\)/);
  assert.match(boarding, /openDialogue\('getaway'\)/);

  /* And the opening waits for Snow's take to decode rather than losing a race
   * with its own download and reading as an unrecorded line. */
  assert.match(opening, /primeMotelVoice\(\[OPENING_CUE\]/);
  assert.match(opening, /openingVoiceReady = true;\s*\n\s*maybeOpenCarBrief\(\);/,
    'the decoded opening must pass through the parked-car gate');
  assert.match(source, /sfx\.init\(\{ priorityVoice: \[OPENING_CUE\] \}\)/);
});

test('the Motel verifier proves the current opening from durable speech receipts', () => {
  const verifier = fs.readFileSync(new URL('../tools/verify-motel.mjs', import.meta.url), 'utf8');
  const start = verifier.indexOf("/* The scene's first line is Snow's");
  const end = verifier.indexOf('const moneyCaseAim', start);
  assert.notEqual(start, -1, 'the opening proof section disappeared');
  assert.notEqual(end, -1, 'the opening proof section has no bounded end');
  const openingProof = verifier.slice(start, end);

  assert.match(openingProof,
    /Room twelve\. The jerky deal is our cover until daylight\. Meat first\. Money second\./,
    'the browser proof drifted from the authored opening');
  assert.match(openingProof, /motel\.spoken/,
    'the browser proof must wait on the bounded, race-free spoken receipt');
  assert.match(openingProof, /motel\.voice\.played/,
    'the browser proof must also prove that the decoded take played');
  assert.doesNotMatch(openingProof, /document\.getElementById\('subtitle'\)/,
    'a transient subtitle sample cannot prove that the opening was delivered');
  assert.doesNotMatch(openingProof, /Room twelve\. Meat first/,
    'the retired opening substring must not govern the live verifier');
});

test('the Motel deal is one step machine, and the HUD only follows a character', () => {
  const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');

  /* One place decides what room twelve is asking for. Every previous pass at
   * this scene patched an individual line while eight call sites each set the
   * objective to their own idea of the next thing. */
  assert.match(source, /function dealStepNow\(\)/);
  assert.match(source, /function advanceDeal\(\{ announce = null \} = \{\}\)/);
  for (const step of ['sample', 'count', 'pay', 'open']) {
    assert.match(source, new RegExp(`^\\s{2}${step}: \\{`, 'm'), `${step} has a HUD row`);
  }

  /* The instruction never lands on the same frame as the line that earns it. */
  assert.match(source, /function sayThenInstruct\(who, line, seconds, instruct\)/);
  const announce = source.slice(source.indexOf('function advanceDeal('), source.indexOf('function renderDealBoard('));
  assert.match(announce, /sayThenInstruct\(announce\[0\], announce\[1\], announce\[2\] \?\? 3\.4, apply\)/);

  /* Counting their case is a step, and it happens once. Pressing [E] at it
   * used to repeat the same sentence and add six suspicion every time. */
  const count = source.slice(source.indexOf("id: 'jerkyCase'"), source.indexOf('/* YOUR case.'));
  assert.match(count, /if \(S\.packagesCounted\) \{/);
  assert.match(count, /S\.packagesCounted = true;/);
});
