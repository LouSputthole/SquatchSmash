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

/* The other half of the cutaway: it may finish, but the mission must still be
 * able to stop it. The stage arm used to drop the take handle, so a line cut
 * away from kept sounding and nothing could reach it. */
test('a take a stage direction cut away from can still be stopped', () => {
  const log = [];
  const dialogue = controller(log);
  dialogue.play([spoken('one', 6)]);
  dialogue.play([{ speaker: 'HUD', stage: 'case.open', hold: 2.6 }, spoken('two')]);
  assert.deepEqual(log, [], 'the business does not cut the line short');
  dialogue.clear();
  assert.deepEqual(log, ['stop:one'], 'but the mission can still stop it');
});

test('a bare duration from playCue still holds the line and cannot be hushed', () => {
  const log = [];
  const dialogue = new DialogueController({ playCue: () => 1.2 });
  dialogue.play([spoken('one', 0.5)]);
  assert.ok(dialogue.timer > 1.2, 'the recording, plus its tail, wins over the authored hold');
  assert.equal(dialogue.hush(), false);
  assert.deepEqual(log, []);
});

/* DEAD MEN SAY NOTHING. Owner playtest, 2026-09-09: "the silent night
 * protocol, the scientists were all dead and the voice lines were still
 * going." The mission's `skipLine` hook is the roster fact; these pin the
 * controller's half of the contract: a dead speaker's scheduled lines do not
 * play — dropped before they start, cut if he dies mid-take — and a living
 * speaker's lines are untouched. */

const said = (speaker, cue, hold = 2) => ({ speaker, text: cue, cue, hold });

function morgueController(log, dead) {
  return new DialogueController({
    playCue: (cue) => (cue ? take(log, cue) : 0),
    skipLine: (line) => dead.has(line.speaker),
  });
}

test('a dead speaker\'s queued line never starts — no cue, no caption, no hold', () => {
  const log = [];
  const dead = new Set(['MARCHUK']);
  const dialogue = morgueController(log, dead);
  dialogue.play([
    said('SOKOLOV', 'sokolov.openit', 1),
    said('MARCHUK', 'marchuk.giveyourhand', 1),
    said('ORLOVA', 'orlova.lookatme', 1),
  ]);
  assert.equal(dialogue.active.cue, 'sokolov.openit');
  dialogue.update(1.6);
  assert.equal(dialogue.active.cue, 'orlova.lookatme',
    'the corpse\'s line is stepped over in the same advance, costing no hold');
  assert.deepEqual(dialogue.cueLog, ['sokolov.openit', 'orlova.lookatme']);
  assert.ok(!dialogue.captionLog.some((line) => line.speaker === 'MARCHUK'));
});

test('a speaker who dies mid-take is cut — the take stops and the floor moves on', () => {
  const log = [];
  const dead = new Set();
  const dialogue = morgueController(log, dead);
  dialogue.play([said('SOKOLOV', 'sokolov.openit', 4), said('ORLOVA', 'orlova.lookatme', 1)]);
  dialogue.update(0.2);
  assert.deepEqual(log, [], 'alive, so the take runs');
  dead.add('SOKOLOV');
  dialogue.update(0.05);
  assert.deepEqual(log, ['stop:sokolov.openit']);
  assert.equal(dialogue.active.cue, 'orlova.lookatme');
});

test('a stage direction is never skipped, and onDone fires through an all-dead tail', () => {
  const log = [];
  const dead = new Set(['MARCHUK', 'ORLOVA']);
  const dialogue = morgueController(log, dead);
  const stages = [];
  dialogue.onStage = (stage) => stages.push(stage);
  let done = 0;
  dialogue.play([
    { speaker: 'HUD', stage: 'glass.handprint', hold: 0.5 },
    said('MARCHUK', 'marchuk.giveyourhand', 1),
    said('ORLOVA', 'orlova.lookatme', 1),
  ], { onDone: () => done++ });
  assert.deepEqual(stages, ['glass.handprint'], 'the scene\'s business still runs');
  dialogue.update(0.6);
  assert.equal(done, 1, 'a queue whose whole tail is corpses still drains');
  assert.deepEqual(log, []);
  assert.equal(dialogue.busy, false);
});
