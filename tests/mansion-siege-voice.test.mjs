/**
 * MANSION UNDER SIEGE's writing, and the ledger it has to reach.
 *
 * docs/ENGINE-TRAPS.md entry 3 has happened three times, most recently to the
 * scene written AFTER the entry was filed. These are the contracts that stop
 * the siege being the fourth: the lines exist, the cue names the tools mint
 * are the ones the runtime asks for, every speaker resolves to a voice profile
 * that exists, the committed manifest matches the script, and the recording
 * sheet shows the mission as a section rather than merely counting it.
 *
 * The other half of the file is about the MISSION not being able to stall.
 * Three beats -- BRIEFING, AFTERMATH, TO_SASOLE -- can only be left by a
 * dialogue sequence finishing, and for the whole of this mission's life so far
 * nothing called any of them: the played mission stopped dead in Lou's office.
 * The tests below hold each of those joints shut from both ends.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  SEQUENCES, SIEGE_CUE_PREFIX, SIEGE_SPEAKER_NAMES, SIEGE_VOICES,
  SiegeDialogue, allSiegeLines, readingSeconds, siegeVoiceCueNames,
} from '../src/mansion/siege/script.js';
import {
  checkSiegeVoiceManifest, collectSiegeVoiceCues, syncSiegeVoiceManifest,
} from '../tools/siege-vo.mjs';
import { buildAudioTodo } from '../tools/audio-todo-lib.mjs';

const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'),
);

/* ================================================================== */
/* The writing reaches the ledger                                       */
/* ================================================================== */

test('every siege line is on the vo. prefix, which is what drives the mouths', () => {
  const lines = allSiegeLines();
  /* A floor rather than a snapshot: authoring a line must not fail a test
   * whose actual subject is "does the collector walk every sequence". */
  assert.ok(lines.length >= 20, `the script has lost lines: ${lines.length}`);
  for (const line of lines) {
    assert.ok(line.name.startsWith('vo.'), `${line.name} is not a vo. cue`);
    assert.ok(line.name.startsWith(SIEGE_CUE_PREFIX), `${line.name} is not on the siege prefix`);
    assert.ok(line.say && line.say.trim().length > 0, `${line.name} has no words`);
    assert.ok(line.seconds > 0, `${line.name} has no hold`);
  }
  assert.equal(new Set(lines.map((l) => l.name)).size, lines.length, 'two lines share one recording');
});

test('the little friend is a vo. cue now, and it is the one the scene plays', () => {
  /* It used to be `siege.prospect.little_friend`: not on the vo. prefix, so
   * no AnalyserNode and every mouth in the room on a synthetic envelope
   * (ENGINE-TRAPS #8); and in no manifest, so unrecordable (#3). */
  const names = new Set(siegeVoiceCueNames());
  assert.ok(names.has('vo.siege.prospect.little_friend'));
  assert.equal(SEQUENCES.little_friend.length, 1, 'it is one line, said once, ever');
  assert.equal(SEQUENCES.little_friend[0].say, 'Say hello to my little friend.');
});

test('every speaker resolves to a voice profile the manifest actually has', () => {
  const voices = Object.keys(manifest.voices);
  for (const [speaker, profile] of Object.entries(SIEGE_VOICES)) {
    assert.ok(voices.includes(profile), `${speaker} wants "${profile}", which does not exist`);
    assert.ok(SIEGE_SPEAKER_NAMES[speaker], `${speaker} has no display name for the subtitle`);
  }
});

test('the two Lous stay two men', () => {
  /* Big Uncle Lou Sputthole is lou1; Captain Lou Sasole is lou2. Different
   * performer, different photograph, different beat. `ensemble.js` carries
   * the same warning over the same pair of ids. */
  assert.equal(SIEGE_VOICES.lou, 'lou1');
  assert.equal(SIEGE_VOICES.sasole, 'lou2');
  const byVoice = {};
  for (const line of allSiegeLines()) byVoice[line.voice] = (byVoice[line.voice] ?? 0) + 1;
  assert.ok(byVoice.lou1 > 0 && byVoice.lou2 > 0, 'both Lous speak in this mission');
});

test('the committed manifest carries the siege exactly, with nothing stale', () => {
  assert.deepEqual(checkSiegeVoiceManifest(manifest), []);
});

test('siege sync is pure, owns only its own prefix, and its check catches drift', () => {
  const original = {
    voices: manifest.voices,
    sfx: [
      /* The siege's EFFECTS are on a bare `siege.` prefix and must survive a
       * rebuild of the dialogue block. ENGINE-TRAPS #4 is the same shape with
       * THE TAKE's 46 effects, where a prefix rebuild would delete them. */
      { name: 'siege.glass.shatter', prompt: 'a pane going out' },
      { name: 'vo.siege.gone.line', voice: 'lou1', say: 'cut from the script' },
    ],
  };
  const snapshot = structuredClone(original);
  const synced = syncSiegeVoiceManifest(original);
  assert.deepEqual(original, snapshot, 'sync must not mutate its input');
  assert.equal(synced.sfx[0].name, 'siege.glass.shatter', 'the effects bank survives');
  assert.equal(
    synced.sfx.some((cue) => cue.name === 'vo.siege.gone.line'), false,
    'a deleted line must not survive a rebuild',
  );
  assert.deepEqual(checkSiegeVoiceManifest(synced), []);

  const bad = structuredClone(synced);
  const first = bad.sfx.findIndex((cue) => cue.name.startsWith(SIEGE_CUE_PREFIX));
  bad.sfx.splice(first, 1);
  const drifted = bad.sfx.find((cue) => cue.name.startsWith(SIEGE_CUE_PREFIX));
  drifted.say = 'wrong words';
  bad.sfx.push({ name: 'vo.siege.gone.line', voice: 'lou1', say: 'stale' });
  bad.sfx.push({ ...drifted });
  const failures = checkSiegeVoiceManifest(bad).join('\n');
  assert.match(failures, /missing cue/);
  assert.match(failures, /drifted cue/);
  assert.match(failures, /stale cue/);
  assert.match(failures, /duplicate cue/);
});

test('the recording sheet shows the siege as its own section', () => {
  /* Counting a scene is not showing it. The three previous instances of this
   * trap all had the right TOTAL somewhere and no section anybody read. */
  const markdown = buildAudioTodo({
    manifest: { sfx: collectSiegeVoiceCues() },
    index: { files: [] },
    legacyQueue: {},
  });
  assert.match(markdown, /MANSION UNDER SIEGE/);
  assert.match(markdown, /Say hello to my little friend\./);
});

/* ================================================================== */
/* The runner, and the three beats that depend on it                    */
/* ================================================================== */

test('a sequence plays its lines in order and finishes exactly once', () => {
  const seen = [];
  const done = [];
  const runner = new SiegeDialogue({
    onLine: (line) => seen.push(line.id),
    onDone: (id) => done.push(id),
  });
  assert.equal(runner.play('briefing'), true);
  assert.equal(runner.active, true);
  for (let i = 0; i < 400 && runner.active; i++) runner.update(0.25);
  assert.deepEqual(seen, SEQUENCES.briefing.map((l) => l.id));
  assert.deepEqual(done, ['briefing']);
  assert.equal(runner.active, false);
});

test('a sequence never plays twice, so a checkpoint restore cannot replay it', () => {
  const runner = new SiegeDialogue();
  assert.equal(runner.play('lull'), true);
  runner.finish();
  assert.equal(runner.play('lull'), false, 'the lull callout is not said twice');
  assert.equal(runner.play('lull', { replay: true }), true, 'unless something asks for it');
});

test('finish() ends the beat; cancel() un-happens it', () => {
  /* The distinction is load-bearing. A skip must still END the briefing --
   * otherwise Enter in Lou's office is a softlock. A checkpoint restore must
   * NOT, or the briefing finishes after the mission has rewound past it. */
  const done = [];
  const runner = new SiegeDialogue({ onDone: (id) => done.push(id) });
  runner.play('briefing');
  runner.finish();
  assert.deepEqual(done, ['briefing'], 'a skip still ends the beat');

  const cancelled = [];
  const other = new SiegeDialogue({ onDone: (id) => cancelled.push(id) });
  other.play('aftermath');
  other.cancel();
  assert.deepEqual(cancelled, [], 'a cancel advances nothing');
  assert.equal(other.active, false);
});

test('checkpoint reconstruction marks prior dialogue heard without playing or queuing it', () => {
  const heard = [];
  const lines = [];
  const done = [];
  const runner = new SiegeDialogue({
    audio: { play: (name) => heard.push(name), sampleDuration: () => null },
    onLine: (line) => lines.push(line.id),
    onDone: (id) => done.push(id),
  });

  const result = runner.withSuppressedPlayback(() => {
    runner.play('wake');
    runner.play('guide_office');
    runner.play('briefing');
    runner.finish();
    runner.play('lull');
    return 'restored';
  });

  assert.equal(result, 'restored');
  assert.deepEqual(heard, []);
  assert.deepEqual(lines, []);
  assert.deepEqual(done, ['briefing'], 'load-bearing dialogue still advances the replay ladder');
  assert.equal(runner.active, false, 'destination guidance must not remain silently queued');
  for (const id of ['wake', 'guide_office', 'briefing', 'lull']) {
    assert.equal(runner.play(id), false, `${id} must remain marked as already heard`);
  }
});

test('the runner holds a line for its recording when there is one', () => {
  const audio = {
    played: [],
    sampleDuration: (name) => (name.endsWith('little_friend') ? 3.6 : null),
    play(name) { this.played.push(name); },
  };
  const runner = new SiegeDialogue({ audio });
  runner.play('little_friend');
  assert.deepEqual(audio.played, ['vo.siege.prospect.little_friend']);
  /* The take's own length plus a breath, not the authored guess. */
  assert.ok(Math.abs(runner.hold - (3.6 + 0.45)) < 1e-9);

  const guessed = new SiegeDialogue({ audio: { play() {}, sampleDuration: () => null } });
  guessed.play('little_friend');
  assert.equal(guessed.hold, readingSeconds('Say hello to my little friend.'));
});

test('every beat the mission cannot leave on its own has a sequence that leaves it', () => {
  /* BRIEFING, AFTERMATH and TO_SASOLE each advance ONLY when a sequence
   * finishes. If one of these three loses its sequence the mission gains a
   * dead end, and the symptom is a player standing in a room forever with a
   * blank objective card -- which is exactly how this mission shipped. */
  for (const id of ['briefing', 'aftermath', 'sasole']) {
    assert.ok(Array.isArray(SEQUENCES[id]) && SEQUENCES[id].length > 0,
      `${id} has no lines, so the beat it ends has no way out`);
  }
});

test('the guidance lines name the direction, not just the destination', () => {
  /* The point of them. "Reach the armory" is a destination; "east end of the
   * cellar hall, then south through the door" is how you get there, and a
   * first-time player in a 31 m basement corridor needs the second one. */
  const armory = SEQUENCES.guide_armory.map((l) => l.say).join(' ');
  assert.match(armory, /east/i);
  const office = SEQUENCES.guide_office.map((l) => l.say).join(' ');
  assert.match(office, /stair|horseshoe|floor/i);
});
