import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { BILLY_HOTDOG_MODEL } from '../src/core/hotdog-model.js';
import { measureWrappedBody } from '../src/core/props/wrapped-body.js';
import { SNOW } from '../src/core/wardrobe.js';
import * as graveyardMissionModule from '../src/graveyard/mission.js';
import {
  GraveyardMission,
  GRAVEYARD_ARRIVAL_LINES,
  GRAVES,
  resolveGraveyardLineHold,
} from '../src/graveyard/mission.js';
import {
  BABS_BENCH_PRESENTATION,
  GRAVE_ART_PRESENTATION,
  buildGraveyard,
  hotDogBody,
} from '../src/graveyard/world.js';
import { ensureDomShim } from '../tools/three-shim.mjs';

test('authored grave portraits map to their markers without duplicating Colton\'s carved name', () => {
  assert.deepEqual(Object.keys(GRAVE_ART_PRESENTATION), [
    'babs', 'brawny', 'whiplash', 'echo', 'colton',
  ]);
  for (const [id, presentation] of Object.entries(GRAVE_ART_PRESENTATION)) {
    assert.equal(presentation.slot, `grave.${id}`);
    assert.match(presentation.file, new RegExp(`^graveyard/${id}\\.(?:webp|jpg)$`));
    assert.equal(fs.existsSync(new URL(`../assets/art/${presentation.file}`, import.meta.url)), true);
    assert.ok(presentation.aspect > 0);
    assert.ok(presentation.panelHeight > 0);
  }
  assert.equal(GRAVE_ART_PRESENTATION.babs.embeddedName, false);
  assert.equal(GRAVE_ART_PRESENTATION.brawny.embeddedName, false);
  assert.equal(GRAVE_ART_PRESENTATION.whiplash.embeddedName, false);
  assert.equal(GRAVE_ART_PRESENTATION.whiplash.transparent, true);
  assert.ok(
    GRAVE_ART_PRESENTATION.whiplash.panelBottom - 0.0275
      >= GRAVE_ART_PRESENTATION.whiplash.nameplateY
        + GRAVE_ART_PRESENTATION.whiplash.nameplateHeight / 2
        + 0.01,
    'Whiplash portrait frame clears the full nameplate instead of covering its top edge',
  );
  assert.ok(
    GRAVE_ART_PRESENTATION.whiplash.panelBottom
      + GRAVE_ART_PRESENTATION.whiplash.panelHeight
      + 0.0275 <= 0.98,
    'Whiplash portrait remains completely mounted on the ruined stone',
  );
  assert.ok(
    GRAVE_ART_PRESENTATION.whiplash.nameplateZ
      - GRAVE_ART_PRESENTATION.whiplash.panelZ >= 0.02,
    'Whiplash nameplate sits far enough ahead of the transparent portrait to avoid alpha fighting',
  );
  assert.equal(GRAVE_ART_PRESENTATION.echo.embeddedName, false);
  assert.equal(GRAVE_ART_PRESENTATION.colton.embeddedName, true);
});

test('Babs\'s bench faces back toward the graves from the forest edge without blocking the aisle', () => {
  assert.deepEqual(BABS_BENCH_PRESENTATION.position, [-9.35, 0, -2.25]);
  assert.equal(BABS_BENCH_PRESENTATION.yaw, Math.PI / 2);
  assert.deepEqual(BABS_BENCH_PRESENTATION.colliderMin, [-9.7, 0, -3.3]);
  assert.deepEqual(BABS_BENCH_PRESENTATION.colliderMax, [-9, 1.25, -1.2]);
});

test('Snow owns the arrival voice floor through the end of his recorded opening', () => {
  const [snow, prospect] = GRAVEYARD_ARRIVAL_LINES;
  assert.equal(snow.who, 'Snow');
  assert.equal(prospect.who, 'Prospect');
  assert.equal(resolveGraveyardLineHold(snow, 5.7), 6.05);
  assert.equal(resolveGraveyardLineHold(prospect, 0), prospect.seconds);
});

test('graveyard Snow wears his canonical work clothes and belt without losing the burial staging', async () => {
  ensureDomShim();
  const THREE = await import('three');
  const graveyard = buildGraveyard(new THREE.Scene());
  const { snow } = graveyard;

  assert.equal(snow.parts.profile.height, SNOW.height);
  assert.equal(snow.parts.profile.outfit, SNOW.dress);
  assert.equal(snow.parts.body.getObjectByName('ribcage').material.color.getHex(), SNOW.shirt);
  assert.equal(snow.parts.head.getObjectByName('person.neck').material.color.getHex(), SNOW.skin);
  assert.ok(snow.parts.body.getObjectByName('belt.strap'), 'Snow lost his canonical leather belt');

  assert.deepEqual(snow.group.position.toArray(), [-2.1, 0, -15.7]);
  assert.equal(snow.group.rotation.y, 0.25);
  assert.ok(snow.parts.body.children.some((node) => node.geometry?.type === 'TorusGeometry'),
    'Snow lost the graveyard key ring');
  assert.ok(snow.parts.body.children.some((node) => node.geometry?.type === 'CylinderGeometry'),
    'Snow lost the graveyard flashlight');
});

test('the graveyard body is the shared wrapped body, cut to Billy HotDog\'s canonical size', () => {
  const body = hotDogBody();

  assert.equal(body.group.userData.characterId, 'billy_hotdog');
  assert.equal(body.group.userData.presentation, 'character');
  // He is under the sheeting rather than in front of the player's face now, so
  // what keeps him Billy is that the bundle is measured off his canonical model.
  assert.equal(body.wrapped.length, BILLY_HOTDOG_MODEL.height + 0.1);
  assert.equal(body.group.getObjectByName('wrapped-body').userData.presentation, 'wrapped-body');

  const shapes = new Set();
  body.group.traverse((node) => { if (node.isMesh) shapes.add(node.geometry.type); });
  assert.equal(shapes.has('CapsuleGeometry'), false, 'the burial body is not a pill either');
  assert.equal(shapes.has('TubeGeometry'), false);

  const measured = measureWrappedBody(body.wrapped.group);
  assert.ok(measured.shoulder.width > measured.hip.width, 'shoulders stay the widest point');
  assert.ok(measured.hip.width > measured.ankle.width, 'hips stay wider than the ankles');

  // The burial choreography lowers him head-first toward the marker, so the
  // head end has to genuinely be the -Z end of the prop.
  assert.ok(body.wrapped.headZ < body.wrapped.footZ);
  assert.ok(
    measured.headHalfArea > measured.footHalfArea,
    'the skull-and-shoulders half carries more of him than the legs do',
  );
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
  assert.equal(mission.objectives.find((objective) => objective.id === 'memorials').retire, false);
  assert.equal(mission.objectives.find((objective) => objective.id === 'tributes').retire, false);

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

test('grave inspection and tribute delivery are idempotent across duplicate tap and hold events', () => {
  const lines = [];
  const tributes = [];
  const mission = new GraveyardMission({
    onLine: (text, meta) => lines.push({ text, ...meta }),
    onTribute: (id, choice) => tributes.push({ id, choice }),
  });

  assert.equal(mission.inspectGrave('babs').kind, 'memorial', 'initial tap reads the marker');
  assert.equal(mission.payRespect('babs'), true, 'initial hold records the tribute');

  // A held key may autorepeat and touch/release input can also deliver a
  // duplicate event. Neither is permission to replay the grave voice line or
  // record a second tribute.
  assert.equal(mission.inspectGrave('babs').kind, 'memorial');
  assert.equal(mission.payRespect('babs'), false);
  assert.equal(mission.payRespect('babs'), false);

  assert.equal(
    lines.filter(({ cue }) => cue === 'vo.graveyard.inspect.babs').length,
    1,
    'the Prospect reads Babs once',
  );
  assert.deepEqual(tributes, [{ id: 'babs', choice: 'respect' }]);
  assert.equal(mission.tributeFor('babs'), 'respect');
});

test('Echo auto-triggers from the main path approach and the encounter cannot replay', () => {
  assert.equal(
    typeof graveyardMissionModule.shouldAutoTriggerEcho,
    'function',
    'the path approach needs a deterministic trigger-volume seam',
  );
  const echo = { x: -6, z: -8.9 };
  assert.equal(graveyardMissionModule.shouldAutoTriggerEcho({ x: 4.5, z: 21.5 }, echo), false);
  assert.equal(
    graveyardMissionModule.shouldAutoTriggerEcho({ x: 0.9, z: -7 }, echo),
    true,
    'the far edge of the central path still wakes Echo before the player passes him',
  );

  let rumbles = 0;
  const lines = [];
  const mission = new GraveyardMission({
    onLine: (text, meta) => lines.push({ text, ...meta }),
    onRumble: () => { rumbles += 1; },
  });
  assert.equal(mission.inspectGrave('echo').kind, 'echo');
  assert.equal(mission.inspectGrave('echo').kind, 'memorial');
  assert.equal(mission.inspectGrave('echo').kind, 'memorial');
  assert.equal(rumbles, 1);
  assert.equal(lines.filter(({ cue }) => cue === 'vo.graveyard.inspect.echo').length, 1);
  assert.equal(lines.filter(({ cue }) => cue === 'vo.graveyard.echo.alive').length, 1);
  assert.equal(lines.filter(({ cue }) => cue === 'vo.graveyard.prospect.wind').length, 1);
  assert.equal(lines.filter(({ cue }) => cue === 'vo.graveyard.snow.wind').length, 1);
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
