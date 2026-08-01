import assert from 'node:assert/strict';
import test from 'node:test';

import { GraveyardMission, GRAVES } from '../src/graveyard/mission.js';

test('the graveyard is an optional memorial museum around one compact burial', () => {
  const lines = [];
  const mission = new GraveyardMission({ onLine: (line) => lines.push(line) });

  assert.equal(mission.state, 'arrival');
  assert.equal(mission.inspectGrave('babs').kind, 'memorial');
  assert.equal(mission.inspectGrave('echo').kind, 'echo');
  assert.equal(mission.echoHeard, true);
  assert.equal(mission.inspectGrave('colton').line.toLowerCase().includes('asian feet'), true);
  assert.equal(mission.suggestSaucePlot(), false);
  assert.match(lines.at(-1), /need that one soon/i);

  assert.equal(mission.urinateOn('babs'), false);
  assert.equal(mission.urinateOn('brawny'), true);
  assert.equal(mission.urinateOn('whiplash'), true);
  assert.deepEqual([...mission.urinatedOn], ['brawny', 'whiplash']);

  assert.equal(mission.lowerBody(), true);
  assert.equal(mission.finishBurial(), true);
  assert.equal(mission.readyToLeave, true);
  assert.equal(mission.finish(), 'motel');
  assert.equal(mission.state, 'done');
});

test('all requested graves have an authored presentation tier and epitaph', () => {
  assert.deepEqual(Object.keys(GRAVES), [
    'babs', 'brawny', 'whiplash', 'sheep', 'echo', 'colton', 'geewiz', 'sauce',
  ]);
  for (const grave of Object.values(GRAVES)) {
    assert.ok(grave.name);
    assert.ok(grave.tier);
    assert.ok(grave.line);
  }
  assert.equal(GRAVES.sauce.open, true);
  assert.equal(GRAVES.brawny.traitor, true);
  assert.equal(GRAVES.whiplash.traitor, true);
});

test('persisted graveyard evidence hydrates without replaying optional interactions', () => {
  let rumbles = 0;
  const lines = [];
  const mission = new GraveyardMission({
    onLine: (line) => lines.push(line),
    onRumble: () => { rumbles += 1; },
  });

  mission.restoreProgress({
    echoHeard: true,
    urinatedOn: ['brawny', 'not-a-grave'],
  });

  assert.equal(mission.echoHeard, true);
  assert.deepEqual([...mission.urinatedOn], ['brawny']);
  assert.equal(rumbles, 0);
  assert.deepEqual(lines, []);
  assert.equal(mission.inspectGrave('echo').kind, 'memorial');
  assert.equal(rumbles, 0);
  assert.equal(mission.urinateOn('brawny'), false);
  assert.equal(mission.urinateOn('whiplash'), true);
});
