/**
 * NOBODY TALKS OVER ANYBODY UNLESS THEY MEAN TO.
 *
 * `DialogueSequence` cannot talk over itself — it waits for the real clip
 * length plus a beat. What nothing could see was a SECOND system talking at
 * the same time: another sequence, an ambient bark, a scripted beat firing
 * into a hangout conversation. `AudioEngine.hold()` is advisory; it makes the
 * cues that check `busy()` wait and stops nothing that does not. So the only
 * instrument was the owner listening to it.
 *
 * These are that note turned into arithmetic. Fixtures in, findings out.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { VOICE_OVERLAP_GRACE_S, voiceOverlaps } from '../src/core/dialogue.js';

const line = (name, at, seconds, extra = {}) => ({
  name, voice: true, scheduledAt: at, seconds, speakerId: null, interrupt: false, ...extra,
});

test('two lines back to back are not an overlap', () => {
  const log = [line('vo.a', 0, 2), line('vo.b', 2.28, 1.5)];
  assert.deepEqual(voiceOverlaps(log), []);
});

test('a second voice inside the first is a finding, and names both', () => {
  const log = [
    line('vo.lou.welcome', 0, 3, { speakerId: 'LOU' }),
    line('vo.seff.aside', 1.5, 2, { speakerId: 'SEFF' }),
  ];
  const found = voiceOverlaps(log);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'VOICES_OVERLAP');
  assert.equal(found[0].a, 'vo.lou.welcome');
  assert.equal(found[0].b, 'vo.seff.aside');
  assert.equal(found[0].speakerA, 'LOU');
  assert.equal(found[0].speakerB, 'SEFF');
  assert.equal(found[0].overlapS, 1.5);
});

test('one mouth on two lines at once is its own kind', () => {
  /* Worth separating: two characters overlapping is a mix problem, one
   * character overlapping himself is a scene playing a line it already
   * played, which is the fault the owner reported as old lines still going. */
  const log = [
    line('vo.lag.one', 0, 2, { speakerId: 'LAG' }),
    line('vo.lag.two', 0.5, 2, { speakerId: 'LAG' }),
  ];
  const found = voiceOverlaps(log);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'SPEAKER_TALKS_OVER_SELF');
});

test('a line that says it is an interrupt is allowed to cut in', () => {
  const log = [
    line('vo.booski.speech', 0, 6, { speakerId: 'BOOSKIBRO' }),
    line('vo.lou.cutsin', 2, 2, { speakerId: 'LOU', interrupt: true }),
  ];
  assert.deepEqual(voiceOverlaps(log), []);
});

test('but the interrupt does not excuse a third voice on top of it', () => {
  const log = [
    line('vo.booski.speech', 0, 6, { speakerId: 'BOOSKIBRO' }),
    line('vo.lou.cutsin', 2, 2, { speakerId: 'LOU', interrupt: true }),
    line('vo.ape.shouts', 2.5, 2, { speakerId: 'APE' }),
  ];
  const found = voiceOverlaps(log);
  /* Ape lands inside BOTH of them and is excused by neither. */
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((f) => f.b), ['vo.ape.shouts', 'vo.ape.shouts']);
});

test('sound effects are not voices and never overlap-report', () => {
  const log = [
    { name: 'silent.cough.dry', voice: false, scheduledAt: 0, seconds: 1.6 },
    { name: 'silent.gas.hiss', voice: false, scheduledAt: 0.2, seconds: 3 },
  ];
  assert.deepEqual(voiceOverlaps(log), []);
});

test('the real end beats the scheduled one when the source has finished', () => {
  /* A line stopped early by stopSpeech() did not sound for its whole clip,
   * so it did not overlap what came next. `endedAt` is the truth when it is
   * there, which is what stops a scene cutting a line short from reporting
   * as a scene talking over itself. */
  const log = [
    line('vo.a', 0, 5, { endedAt: 1.0 }),
    line('vo.b', 1.2, 2),
  ];
  assert.deepEqual(voiceOverlaps(log), []);
});

test('a hair of scheduling jitter is not two people talking', () => {
  const log = [line('vo.a', 0, 2), line('vo.b', 2 - VOICE_OVERLAP_GRACE_S / 2, 1)];
  assert.deepEqual(voiceOverlaps(log), []);
});

test('an unstarted line carries no timing and is skipped, not crashed on', () => {
  const log = [line('vo.a', 0, 2), { name: 'vo.b', voice: true, scheduledAt: null }];
  assert.deepEqual(voiceOverlaps(log), []);
});

test('overheard room murmur is scenery and may sit under anything', () => {
  /* The Silver Room plays its diners non-solo on purpose — a restaurant with
   * one conversation in it is not a restaurant. Declared, not guessed from
   * the cue name: `silver.margo.invitation` and `silver.diner.overheard` are
   * the same shape and opposite things. */
  const log = [
    line('vo.margo.invitation', 0, 4, { speakerId: 'MARGO' }),
    line('vo.diner.overheard', 1, 3, { speakerId: 'DINER-4', ambient: true }),
    line('vo.diner.overheard2', 1.5, 3, { speakerId: 'DINER-9', ambient: true }),
  ];
  assert.deepEqual(voiceOverlaps(log), []);
});

test('but two subtitled lines still collide with murmur in the room', () => {
  const log = [
    line('vo.diner.overheard', 0, 6, { ambient: true }),
    line('vo.margo.one', 1, 3, { speakerId: 'MARGO' }),
    line('vo.waiter.two', 2, 3, { speakerId: 'WAITER' }),
  ];
  const found = voiceOverlaps(log);
  assert.equal(found.length, 1);
  assert.equal(found[0].a, 'vo.margo.one');
  assert.equal(found[0].b, 'vo.waiter.two');
});
