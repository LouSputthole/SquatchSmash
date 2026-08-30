import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { SILVERCASE_EFFECT_CUES } from '../src/silvercase/audio.js';
import { DialogueController } from '../src/silvercase/dialogue/DialogueController.js';
import {
  CHOICES,
  SEQUENCES,
  SILVERCASE_OPENING_SEQUENCE_IDS,
  SPEAKERS,
  WINSTON_DECISION_SECONDS,
} from '../src/silvercase/dialogue/script.js';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const manifest = JSON.parse(readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
const index = JSON.parse(readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'));
const manifestByName = new Map(manifest.sfx.map((cue) => [cue.name, cue]));
const indexedFiles = new Set(index.files);
const mainSource = readFileSync(new URL('../src/silvercase/main.js', import.meta.url), 'utf8');

test('every spoken line from scene entry through the first objective has a delivered recording', () => {
  let checked = 0;
  for (const sequenceId of SILVERCASE_OPENING_SEQUENCE_IDS) {
    const sequence = SEQUENCES[sequenceId];
    assert.ok(Array.isArray(sequence) && sequence.length > 0, `${sequenceId} is vacuous`);
    for (const line of sequence) {
      if (!line.cue) continue;
      const declared = manifestByName.get(line.cue);
      assert.ok(declared, `${line.cue} is absent from the manifest`);
      assert.equal(declared.voice, SPEAKERS[line.speaker]?.voice, `${line.cue} has the wrong speaker`);
      assert.equal(declared.say, line.text, `${line.cue} has stale recorded words`);
      const file = declared.file || `${declared.name}.mp3`;
      assert.ok(indexedFiles.has(file), `${line.cue} is not in the audio index`);
      const url = new URL(`../assets/sfx/${file}`, import.meta.url);
      assert.ok(existsSync(url), `${line.cue} is indexed but missing on disk`);
      assert.ok(statSync(url).size > 512, `${line.cue} is an empty/trivial audio file`);
      checked += 1;
    }
  }
  assert.ok(checked >= 10, `opening VO audit only checked ${checked} lines`);
});

test('the Winston decision remains live for the full authored 25-30 second window', () => {
  assert.ok(WINSTON_DECISION_SECONDS >= 25 && WINSTON_DECISION_SECONDS <= 30);
  assert.equal(CHOICES.aftermath.timeout, WINSTON_DECISION_SECONDS);
  let resolved = null;
  const dialogue = new DialogueController();
  dialogue.presentChoice(CHOICES.aftermath, {
    onResolved: (outcome) => { resolved = outcome; },
  });

  dialogue.update(WINSTON_DECISION_SECONDS - 0.01);
  assert.equal(dialogue.choice, CHOICES.aftermath, 'the choice defaulted before the decision window elapsed');
  assert.equal(resolved, null);
  dialogue.update(0.02);
  assert.equal(dialogue.choice, null);
  assert.equal(resolved, 'spare', 'inactivity no longer takes the explicit default branch');
});

test('the Winston decision drives a live actor-tension pose and a required recorded room tick', () => {
  assert.ok(SILVERCASE_EFFECT_CUES.includes('clock.tick'));
  const cue = manifestByName.get('clock.tick');
  assert.ok(cue, 'clock.tick is absent from the manifest');
  const file = cue.file || `${cue.name}.mp3`;
  assert.ok(indexedFiles.has(file), 'clock.tick is not in the audio index');
  assert.ok(existsSync(new URL(`../assets/sfx/${file}`, import.meta.url)),
    'clock.tick is indexed but missing on disk');
  assert.match(mainSource, /cast\.winston\.startTension\(\{/);
  assert.match(mainSource, /onPulse:\s*\(\)\s*=>\s*audio\.play\('clock\.tick'/);
  assert.match(mainSource, /audio\.play\('clock\.tick',[\s\S]*?requiredRecorded:\s*true/);
  assert.match(mainSource, /winstonTension:\s*cast\.winston\.tensionSnapshot\(\)/,
    'the verifier cannot observe production tension state');
});

test('the Winston default uses active wall time even when rendered dt falls behind', () => {
  let now = 100;
  let resolved = null;
  const dialogue = new DialogueController({ now: () => now });
  dialogue.presentChoice(CHOICES.aftermath, {
    onResolved: (outcome) => { resolved = outcome; },
  });

  now += 25;
  dialogue.update(0.05);
  assert.equal(dialogue.choice, CHOICES.aftermath, 'the real-time window defaulted early');
  assert.equal(resolved, null);
  assert.ok(dialogue.choiceTimer > 1.9 && dialogue.choiceTimer < 2.1);

  now += WINSTON_DECISION_SECONDS - 25 + 0.01;
  dialogue.update(0.05);
  assert.equal(dialogue.choice, null);
  assert.equal(resolved, 'spare');
});

test('resynchronizing the choice clock excludes paused wall time', () => {
  let now = 200;
  let resolved = null;
  const dialogue = new DialogueController({ now: () => now });
  dialogue.presentChoice(CHOICES.aftermath, {
    onResolved: (outcome) => { resolved = outcome; },
  });

  now += 5;
  dialogue.update(0.05);
  const beforePause = dialogue.choiceTimer;
  now += 60;
  dialogue.syncClock();
  dialogue.update(0.05);

  assert.equal(dialogue.choice, CHOICES.aftermath);
  assert.equal(resolved, null);
  assert.ok(beforePause - dialogue.choiceTimer < 0.1,
    'paused time leaked into the active decision window');
});

test('spoken-line holds use active wall time and ignore paused wall time', () => {
  let now = 300;
  let finished = false;
  const line = { speaker: 'APE', text: 'Clock contract.', cue: 'test.clock', hold: 2 };
  const dialogue = new DialogueController({
    now: () => now,
    playCue: () => 1,
  });
  dialogue.play([line], { onDone: () => { finished = true; } });

  now += 1.9;
  dialogue.update(0.05);
  assert.equal(dialogue.active, line);
  now += 0.2;
  dialogue.update(0.05);
  assert.equal(dialogue.active, null);
  assert.equal(finished, true);

  finished = false;
  dialogue.play([line], { onDone: () => { finished = true; } });
  now += 1;
  dialogue.update(0.05);
  now += 60;
  dialogue.syncClock();
  dialogue.update(0.05);
  assert.equal(dialogue.active, line);
  assert.equal(finished, false, 'paused time drained an active spoken line');
});

test('Chester owns an immediate named reaction before Ape resumes the scripted aftermath', () => {
  const [line] = SEQUENCES.chesterShotReaction;
  assert.equal(line.speaker, 'CHESTER');
  assert.equal(line.text, 'What the hell, man?!');
  assert.equal(line.cue, 'vo.silvercase.couch.chester.whatthehell');
});

test('Ape interrogates Chester with the exact bitch and Mrs. Sputthole exchange', () => {
  const exchange = [...SEQUENCES.louQuestionOpening, ...SEQUENCES.louQuestionPress]
    .map(({ speaker, text }) => [speaker, text]);
  assert.deepEqual(exchange, [
    ['APE', 'Does he look like a bitch?'],
    ['CHESTER', 'What?'],
    ['APE', 'Does he look like a bitch?'],
    ['CHESTER', 'No.'],
    ['APE', 'Then why you trying to fuck him like a bitch? Because the only one he likes to fuck is Mrs. Sputthole.'],
  ]);
  assert.equal(Object.hasOwn(CHOICES, 'louQuestion'), false,
    'the exchange drifted back into a question aimed at the player');

  const spokenText = Object.values(SEQUENCES).flatMap((sequence) => (
    Array.isArray(sequence) ? sequence : Object.values(sequence).flat()
  )).map((line) => line.text).join('\n');
  assert.doesNotMatch(spokenText, /depends on the lighting|colou?rs?/i,
    'the retired unrelated response is still reachable as Silver Case dialogue');
  assert.doesNotMatch(mainSource, /SEQUENCES\.ambientTV/,
    'the unrelated TV voice can still queue ahead of the first execution');
});

test('Squatchiel 69:17 uses the requested passage and the player owns its final line', () => {
  assert.deepEqual(SEQUENCES.squatchPrayerIntro.map((line) => line.text), [
    'I’m gonna share a little passage with you.',
    'Squatchiel. Sixty-nine, seventeen.',
  ]);
  assert.deepEqual(SEQUENCES.squatchPrayer.map((line) => line.text), [
    'The trail of the righteous Squatch is surrounded on every side by the greed of weak men.',
    'Blessed is the Squatch who walks with his brothers.',
    'But to those who betray the family, or raise a hand against one of our own...',
    'I will strike down upon thee with great vengeance and furious anger!',
  ]);
  assert.deepEqual(SEQUENCES.squatchPrayerFinish.map(({ speaker, text }) => [speaker, text]), [[
    'PROSPECT',
    'And you will know my name is the Squatch when I lay my vengeance upon thee.',
  ]]);
  assert.equal(CHOICES.prayerFinish.prompt, 'Hold E to finish the passage.');
});

test('the first execution target and objective arm only after Ape finishes speaking', () => {
  assert.match(mainSource, /couchShotArmed = false;[\s\S]*?sayThenInstruct\(SEQUENCES\.couchOrder/,
    'the couch target is not reset before Ape gives the order');
  assert.match(mainSource, /onDone:\s*\(\)\s*=>\s*\{[\s\S]*?couchShotArmed = true;[\s\S]*?setObjective\(OBJECTIVES\.COUCH_SHOOTING\)/,
    'firing and objective do not arm together after the order');
  assert.match(mainSource, /if \(!couchShotArmed\) \{[\s\S]*?firePressed = false;[\s\S]*?return;/,
    'an early click can still execute Deke while Ape is talking');
});

test('the bathroom ambush stages two guaranteed impact misses before arming return fire', () => {
  assert.match(mainSource, /fireBathroomOpeningMiss\(0\);/);
  assert.match(mainSource, /fireBathroomOpeningMiss\(1\);/);
  assert.match(mainSource, /openingShots \+= 1;/);
  assert.match(mainSource, /openingImpacts\.push\(impact\.toArray\(\)\);/);
  assert.match(mainSource, /if \(!this\.armed && this\.t >= 2\.05\)[\s\S]*?reactionWindow\.start/,
    'the return-fire window can open before the two authored misses');
  assert.match(mainSource, /audio\.play\('door\.creak',[\s\S]*?position:\s*\{\s*x:\s*BATHROOM_DOOR\.x/,
    'the bathroom creak is not spatialized at its doorway');
  assert.equal(SEQUENCES.bathroomWarning[0].speaker, 'APE');
  assert.equal(SEQUENCES.bathroomWarning[0].text, 'Bathroom!');
});

test('the Silver Case bathroom is a finished room with reused toilet, sink, floor, ceiling, and practical light', async () => {
  const { buildApartmentScene, ROOMS } = await import('../src/silvercase/scenes/ApartmentScene.js');
  const built = buildApartmentScene();
  const bathroom = built.props.bathroom;
  assert.ok(bathroom?.group?.isGroup);
  assert.equal(bathroom.toilet.group.name, 'toilet', 'the shared Apartment toilet was not reused');
  assert.ok(bathroom.sink?.isGroup);
  assert.ok(bathroom.practical?.isGroup);
  assert.ok(bathroom.group.children.some((child) => child instanceof THREE.PointLight),
    'the room has no dim practical light');

  const floor = built.root.getObjectByName('silvercase.bathroom.floor');
  const ceiling = built.root.getObjectByName('silvercase.bathroom.ceiling');
  assert.ok(floor?.isMesh && ceiling?.isMesh);
  floor.geometry.computeBoundingBox();
  const depth = floor.geometry.boundingBox.getSize(new THREE.Vector3()).y;
  assert.ok(depth >= 2, `bathroom depth is still an alcove (${depth.toFixed(2)}m)`);
  const bounds = new THREE.Box3().setFromObject(bathroom.group);
  assert.ok(bounds.min.z < ROOMS.apartment.z0 - 1.8,
    'fixtures do not occupy the expanded bathroom interior');
});

test('the dialogue adapter receives the authored speaker line needed for physical routing', () => {
  const expected = SEQUENCES.carRide[0];
  let routed = null;
  const dialogue = new DialogueController({
    playCue(cue, voice, line) {
      routed = { cue, voice, line };
      return 1;
    },
  });

  dialogue.play([expected]);
  assert.equal(routed?.cue, expected.cue);
  assert.equal(routed?.voice, SPEAKERS.APE.voice);
  assert.equal(routed?.line, expected,
    'the adapter would have to infer the physical speaker from a cue string');
});
