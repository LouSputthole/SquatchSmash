import assert from 'node:assert/strict';
import test from 'node:test';

import { CabinDialogueDirector } from '../src/cabin/dialogue-director.js';

function audioDouble() {
  return {
    manifest: { sfx: [] },
    held: [],
    played: [],
    sampleDuration() { return 0.05; },
    hasSample() { return false; },
    play(name, options) {
      this.played.push({ name, options });
      return null;
    },
    hold(seconds) { this.held.push(seconds); },
  };
}

test('Cabin dialogue drives subtitles and the correct actor mouth in order', () => {
  const audio = audioDouble();
  const actor = {
    group: { position: { x: 0, y: 0, z: 0 } },
    spoken: [],
    say(seconds, take) { this.spoken.push({ seconds, take }); },
    hush() {},
  };
  const subtitles = [];
  const done = [];
  const director = new CabinDialogueDirector({
    audio,
    hud: { say(html) { subtitles.push(html); } },
    actors: { TONY: actor },
    onDone: (beat) => done.push(beat),
  });
  assert.equal(director.play('FIRST_EXPLORATION'), true);
  for (let i = 0; i < 20 && director.running; i += 1) director.update(0.1);
  assert.equal(actor.spoken.length, 1);
  assert.match(subtitles[0], /Prospect/);
  assert.deepEqual(done, ['FIRST_EXPLORATION']);
  assert.equal(director.receipts[0].speaker, 'TONY');
});

test('Cabin dialogue refuses overlap unless explicitly forced', () => {
  const director = new CabinDialogueDirector({ audio: audioDouble() });
  assert.equal(director.play('DUNGEON_INTRO'), true);
  assert.equal(director.play('TOOLS'), false);
  assert.equal(director.play('TOOLS', { force: true }), true);
  assert.equal(director.current, 'TOOLS');
});

test('Cabin dialogue pauses at player actions and resumes in authored order', () => {
  const actions = [];
  const done = [];
  const director = new CabinDialogueDirector({
    audio: audioDouble(),
    onAction: (entry) => actions.push(entry.action),
    onDone: (beat) => done.push(beat),
  });
  director.play('FIRE_TALK_ONE');
  for (let i = 0; i < 100 && !director.waitingAction; i += 1) director.update(0.1);
  assert.deepEqual(actions, ['drink-beer']);
  assert.equal(director.running, true);
  assert.equal(director.resolveAction('drink-whiskey'), false);
  assert.equal(director.resolveAction('drink-beer'), true);
  for (let i = 0; i < 100 && director.running; i += 1) director.update(0.1);
  assert.deepEqual(done, ['FIRE_TALK_ONE']);
});
