import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

import { SILVERCASE_EFFECT_CUES } from '../src/silvercase/audio.js';
import { DialogueController } from '../src/silvercase/dialogue/DialogueController.js';
import {
  CHOICES,
  SEQUENCES,
  SILVERCASE_OPENING_SEQUENCE_IDS,
  SPEAKERS,
  WINSTON_DECISION_SECONDS,
} from '../src/silvercase/dialogue/script.js';

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
