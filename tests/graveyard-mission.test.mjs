import assert from 'node:assert/strict';
import test from 'node:test';

import { BILLY_HOTDOG_MODEL } from '../src/core/hotdog-model.js';
import { GraveyardMission, GRAVES } from '../src/graveyard/mission.js';
import { hotDogBody } from '../src/graveyard/world.js';

test('the graveyard body is the canonical Billy HotDog character, not a bundle primitive', () => {
  const body = hotDogBody();

  assert.equal(body.group.userData.characterId, 'billy_hotdog');
  assert.equal(body.group.userData.presentation, 'character');
  assert.equal(body.parts.profile.height, BILLY_HOTDOG_MODEL.height);
  assert.equal(body.parts.profile.gut, BILLY_HOTDOG_MODEL.gut);
  assert.ok(body.group.getObjectByName('hotdog.figure'));
  const wrapBands = [];
  body.group.traverse((node) => {
    if (node.name === 'hotdog.wrap-band') wrapBands.push(node);
  });
  assert.equal(wrapBands.length, 3);
  assert.equal(wrapBands.every((band) => band.geometry.type === 'TubeGeometry'), true);
});

test('HotDog must be picked up, carried to the plot, and placed before burial', () => {
  const lines = [];
  const mission = new GraveyardMission({ onLine: (line) => lines.push(line) });

  assert.equal(mission.state, 'arrival');
  assert.equal(mission.placeBody(), false);
  assert.equal(mission.finishBurial(), false);
  assert.equal(mission.pickUpBody(), true);
  assert.equal(mission.state, 'carried');
  assert.equal(mission.bodyCarried, true);
  assert.equal(mission.finishBurial(), false);
  assert.equal(mission.placeBody(), true);
  assert.equal(mission.state, 'placed');
  assert.equal(mission.bodyPlaced, true);
  assert.equal(mission.bodyLowered, true);
  assert.equal(mission.pickUpBody(), false);
  assert.equal(mission.finishBurial(), true);
  assert.equal(mission.readyToLeave, true);
  assert.equal(mission.finish(), 'motel');
  assert.equal(mission.state, 'done');
});

test('the graveyard is an optional memorial museum around the burial', () => {
  const lines = [];
  const mission = new GraveyardMission({ onLine: (line) => lines.push(line) });

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

test('optional museum objectives require every marker and a respect or disrespect choice', () => {
  const mission = new GraveyardMission();
  const ids = Object.keys(GRAVES);

  assert.match(mission.objectives.find((objective) => objective.id === 'memorials').text, /0\/8/);
  assert.match(mission.objectives.find((objective) => objective.id === 'tributes').text, /0\/8/);

  for (const id of ids) mission.inspectGrave(id);
  assert.equal(mission.objectives.find((objective) => objective.id === 'memorials').done, true);
  assert.equal(mission.objectives.find((objective) => objective.id === 'tributes').done, false);

  for (const id of ids.filter((id) => !['brawny', 'whiplash'].includes(id))) {
    assert.equal(mission.payRespect(id), true);
  }
  assert.equal(mission.urinateOn('brawny'), true);
  assert.equal(mission.payRespect('whiplash'), true);
  assert.equal(mission.tributeFor('brawny'), 'disrespect');
  assert.equal(mission.tributeFor('whiplash'), 'respect');
  assert.equal(mission.urinateOn('whiplash'), false, 'the player makes one deliberate choice per grave');
  assert.equal(mission.objectives.find((objective) => objective.id === 'tributes').done, true);
});

test('persisted graveyard evidence hydrates without replaying optional interactions', () => {
  let rumbles = 0;
  let objectiveRefreshes = 0;
  const lines = [];
  const mission = new GraveyardMission({
    onLine: (line) => lines.push(line),
    onRumble: () => { rumbles += 1; },
    onObjective: () => { objectiveRefreshes += 1; },
  });

  mission.restoreProgress({
    echoHeard: true,
    inspectedGraves: ['babs', 'echo', 'not-a-grave'],
    respectedGraves: ['babs', 'not-a-grave'],
    urinatedOn: ['brawny', 'not-a-grave'],
  });

  assert.equal(mission.echoHeard, true);
  assert.deepEqual([...mission.inspected], ['babs', 'echo', 'brawny']);
  assert.deepEqual([...mission.urinatedOn], ['brawny']);
  assert.equal(mission.tributeFor('babs'), 'respect');
  assert.equal(mission.tributeFor('brawny'), 'disrespect');
  assert.match(mission.objectives.find((objective) => objective.id === 'memorials').text, /3\/8/);
  assert.match(mission.objectives.find((objective) => objective.id === 'tributes').text, /2\/8/);
  assert.equal(objectiveRefreshes, 1, 'restore notifies the HUD to repaint persisted counters');
  assert.equal(rumbles, 0);
  assert.deepEqual(lines, []);
  assert.equal(mission.inspectGrave('echo').kind, 'memorial');
  assert.equal(rumbles, 0);
  assert.equal(mission.urinateOn('brawny'), false);
  assert.equal(mission.urinateOn('whiplash'), true);
});
