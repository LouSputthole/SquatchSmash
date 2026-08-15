import assert from 'node:assert/strict';
import test from 'node:test';

import { DialogueController } from '../src/mansion/mission/DialogueController.js';

/* The Wave A `Dialogue.hush()` contract, on the mission's controller: a line
 * that is cut off stops sounding; a line that runs its hold is left alone. */

function take(log, name) {
  return {
    duration: 0.5,
    source: { stop() { log.push(`stop:${name}`); } },
  };
}

function controller(log) {
  return new DialogueController({
    playCue: (cue) => (cue ? take(log, cue) : 0),
  });
}

const spoken = (cue, hold = 2) => ({ speaker: 'BOOSKI', text: cue, cue, hold });

test('hush() stops the take of the active line, once', () => {
  const log = [];
  const dialogue = controller(log);
  dialogue.play([spoken('one')]);
  assert.equal(dialogue.hush(), true);
  assert.equal(dialogue.hush(), false, 'nothing left to stop');
  assert.deepEqual(log, ['stop:one']);
});

test('a line replaced by another spoken line is interrupted; a cutaway lets it finish', () => {
  const log = [];
  const dialogue = controller(log);
  dialogue.play([spoken('one')]);
  dialogue.play([spoken('two')]);
  assert.deepEqual(log, ['stop:one'], 'the new caption replaced the old one, so the take goes too');

  dialogue.play([{ speaker: 'HUD', stage: 'door.open', hold: 1 }, spoken('three')]);
  assert.deepEqual(log, ['stop:one'], 'a stage direction first: the old take may finish under it');
});

test('clear() hushes — a man killed mid-plea stops pleading', () => {
  const log = [];
  const dialogue = controller(log);
  dialogue.play([spoken('plea')]);
  dialogue.clear();
  assert.deepEqual(log, ['stop:plea']);
  assert.equal(dialogue.busy, false);
});

test('a line that ran its full hold is not hushed when the next one starts', () => {
  const log = [];
  const dialogue = controller(log);
  dialogue.play([spoken('one', 1), spoken('two', 1)]);
  dialogue.update(1.5);
  assert.deepEqual(log, [], 'the natural advance stops nothing');
  dialogue.update(1.5);
  assert.equal(dialogue.busy, false);
  assert.equal(dialogue.hush(), false, 'and the drained controller holds no take');
});

test('a bare duration from playCue still holds the line and cannot be hushed', () => {
  const log = [];
  const dialogue = new DialogueController({ playCue: () => 1.2 });
  dialogue.play([spoken('one', 0.5)]);
  assert.ok(dialogue.timer > 1.2, 'the recording, plus its tail, wins over the authored hold');
  assert.equal(dialogue.hush(), false);
  assert.deepEqual(log, []);
});
