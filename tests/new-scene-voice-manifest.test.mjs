/**
 * The Silver Case and The Enola Squatch shipped their writing without a way to
 * get it into the sound manifest, so 147 authored lines were invisible to the
 * recording sheet and to the voice run — the scenes played, and every one of
 * their lines was silent-with-a-subtitle forever with nothing reporting it.
 *
 * These are the contracts that keep that from happening again: the cue names
 * the tools mint have to be the ones the runtime actually asks for, every
 * speaker has to resolve to a voice profile that exists, and the recording
 * sheet has to show a scene rather than merely count it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  checkSilverCaseVoiceManifest,
  collectSilverCaseVoiceCues,
  syncSilverCaseVoiceManifest,
} from '../tools/silvercase-vo.mjs';
import {
  checkEnolaSquatchVoiceManifest,
  collectEnolaSquatchVoiceCues,
  syncEnolaSquatchVoiceManifest,
} from '../tools/enolasquatch-vo.mjs';
import { SEQUENCES } from '../src/silvercase/dialogue/script.js';
import {
  RELEASE_LINES, releaseCueOf, allEnolaSquatchLines,
} from '../src/enolasquatch/dialogue/script.js';
import { buildAudioTodo } from '../tools/audio-todo-lib.mjs';

/**
 * Enola Squatch lines authored since the manifest was last generated.
 *
 * `assets/sfx/manifest.json` is regenerated centrally by the owner
 * (`npm run vo:sync`), not by whoever writes the dialogue, so between an
 * authoring session and the next voice run the script legitimately runs ahead
 * of the ledger. This list is how that stays a fact somebody wrote down rather
 * than a hole: the sync test below allows exactly these cues to be missing and
 * nothing else, so a new line that nobody declares still fails the build, and
 * drift, staleness, duplication and cue collisions all still fail
 * unconditionally.
 *
 * WHEN THE MANIFEST IS REGENERATED, EMPTY THIS ARRAY. It should be `[]` in a
 * released state.
 *
 * These 31 are the walkaround, the rear gunner, the city and the crater
 * (2026-08-04).
 */
const ENOLA_CUES_AWAITING_VO_SYNC = [
  /* Empty, and it should stay empty in a released state. The 31 walkaround,
   * rear-gunner, city and crater lines authored on 2026-08-04 were generated
   * into the manifest by `npm run vo:sync` the same day. */
];

const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'),
);
const todo = fs.readFileSync(new URL('../VOICE-LINES-TODO.md', import.meta.url), 'utf8');

/* ---------------- The Silver Case ---------------- */

test('every Silver Case line the script names is in the ledger, and nothing else is', () => {
  const cues = collectSilverCaseVoiceCues();
  assert.equal(cues.length, 60);
  assert.equal(cues.every((cue) => cue.name.startsWith('vo.silvercase.') && cue.voice && cue.say), true);
});

test('the manifest name is the string the scene plays, with no take suffix', () => {
  /* tools/verify-silvercase.mjs asserts this exact cue comes out of the car
   * ride. If the tool appended `.1` the way the Beef Run's does, the manifest
   * entry would name a file the DialogueController never looks for. */
  const byName = new Map(collectSilverCaseVoiceCues().map((cue) => [cue.name, cue]));
  assert.ok(byName.has('vo.silvercase.car.ape.pitch'));
  assert.equal(byName.get('vo.silvercase.car.ape.pitch').voice, 'ape');
  assert.equal(SEQUENCES.carRide[0].cue, 'vo.silvercase.car.ape.pitch');
});

test('the HUD is not cast — its prose is read, not performed', () => {
  const spoken = new Set(collectSilverCaseVoiceCues().map((cue) => cue.say));
  assert.equal(spoken.has('Four glasses on the table. Three guys in the room.'), false);
  assert.equal(spoken.has('TOO SLOW'), false);
});

test('Ape\'s branch reactions are both recorded, even where they share words', () => {
  /* louQuestionReaction is `outcome -> line[]`, one nesting level deeper than
   * every other sequence. A collector that only walked arrays would drop the
   * whole branch silently. */
  const names = new Set(collectSilverCaseVoiceCues().map((cue) => cue.name));
  assert.ok(names.has('vo.silvercase.lou.ape.reaction.no'));
  assert.ok(names.has('vo.silvercase.lou.ape.reaction.absolutelynot'));
});

test('Silver Case sync is pure and its check catches drift', () => {
  const original = { sfx: [
    { name: 'keep.effect', prompt: 'keep' },
    { name: 'vo.silvercase.gone.line', voice: 'ape', say: 'cut from the script' },
  ] };
  const snapshot = structuredClone(original);
  const synced = syncSilverCaseVoiceManifest(original);
  assert.deepEqual(original, snapshot, 'sync must not mutate its input');
  assert.deepEqual(checkSilverCaseVoiceManifest(synced), []);
  assert.equal(synced.sfx[0].name, 'keep.effect', 'unrelated rows keep their place');
  assert.equal(
    synced.sfx.some((cue) => cue.name === 'vo.silvercase.gone.line'), false,
    'a renamed or deleted line must not survive a rebuild',
  );

  const bad = structuredClone(synced);
  bad.sfx.splice(bad.sfx.findIndex((cue) => cue.name.startsWith('vo.silvercase.')), 1);
  const drifted = bad.sfx.find((cue) => cue.name.startsWith('vo.silvercase.'));
  drifted.say = 'wrong words';
  bad.sfx.push({ name: 'vo.silvercase.gone.line', voice: 'ape', say: 'stale' });
  bad.sfx.push({ ...drifted });
  const failures = checkSilverCaseVoiceManifest(bad).join('\n');
  assert.match(failures, /missing cue/);
  assert.match(failures, /drifted cue/);
  assert.match(failures, /stale cue/);
  assert.match(failures, /duplicate cue/);
});

/* ---------------- The Enola Squatch ---------------- */

test('every Enola Squatch beat, bark and release line is in the ledger', () => {
  const cues = collectEnolaSquatchVoiceCues();
  /* Counted rather than snapshotted against a literal. The number this used to
   * assert (87) was the script's size on the day it was written, so authoring
   * a line failed a test whose actual subject is "does the collector walk
   * EVERY category" — which is what the two assertions below check, and what
   * the release-pick test under this one checks for the one category that is
   * reachable from neither BEATS nor BARKS. `allEnolaSquatchLines()` is the
   * script's own "every line, for VO tooling" export, so a category the
   * collector drops still shows up here as a mismatch. */
  assert.equal(cues.length, allEnolaSquatchLines().length);
  assert.ok(cues.length >= 87, 'the script has lost lines rather than gained them');
  assert.equal(cues.every((cue) => cue.name.startsWith('vo.enolasquatch.') && cue.voice && cue.say), true);
  assert.equal(new Set(cues.map((cue) => cue.name)).size, cues.length, 'two lines share one recording');
});

test('the release pick is recorded — it is spoken, it is just not in BEATS', () => {
  const names = new Set(collectEnolaSquatchVoiceCues().map((cue) => cue.name));
  for (const line of RELEASE_LINES.filter((l) => !l.silent)) {
    assert.ok(names.has(`vo.${releaseCueOf(line.key)}.1`), `release line ${line.key} has no cue`);
  }
  /* "(Say nothing.)" is a choice, not a performance. */
  assert.equal(names.has(`vo.${releaseCueOf('5')}.1`), false);
});

test('nobody on the crew invents a voice profile', () => {
  /* SHUBES resolving to `shubenator` rather than a new `shubes` id is the
   * whole point of the script's SPEAKERS table; a typo there would cast a
   * founder as an unknown. */
  const voices = new Set(Object.keys(manifest.voices || {}));
  for (const cue of [...collectEnolaSquatchVoiceCues(), ...collectSilverCaseVoiceCues()]) {
    assert.ok(voices.has(cue.voice), `${cue.name} is cast as "${cue.voice}", which is not a voice profile`);
  }
});

test('Enola Squatch sync is pure and its check catches drift', () => {
  const original = { sfx: [{ name: 'keep.effect', prompt: 'keep' }] };
  const snapshot = structuredClone(original);
  const synced = syncEnolaSquatchVoiceManifest(original);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(checkEnolaSquatchVoiceManifest(synced), []);

  const bad = structuredClone(synced);
  bad.sfx.splice(bad.sfx.findIndex((cue) => cue.name.startsWith('vo.enolasquatch.')), 1);
  bad.sfx.find((cue) => cue.name.startsWith('vo.enolasquatch.')).voice = 'nobody';
  bad.sfx.push({ name: 'vo.enolasquatch.gone.1', voice: 'lou2', say: 'stale' });
  const failures = checkEnolaSquatchVoiceManifest(bad).join('\n');
  assert.match(failures, /missing cue/);
  assert.match(failures, /drifted cue/);
  assert.match(failures, /stale cue/);
});

/* ---------------- both, in the manifest and on the sheet ---------------- */

test('the committed manifest is in sync with both scripts', () => {
  assert.deepEqual(checkSilverCaseVoiceManifest(manifest), []);

  /* The Enola Squatch's script is allowed to be ahead of the ledger by exactly
   * the cues declared in `ENOLA_CUES_AWAITING_VO_SYNC` and by nothing else —
   * see that list's comment for why. Everything the checker can report other
   * than a declared miss is still a hard failure: a line whose words or
   * casting changed under a manifest entry (`drifted`), an entry for a line
   * that no longer exists (`stale`), a repeated entry (`duplicate`), and two
   * lines that would share one recording (`colliding`). */
  const failures = checkEnolaSquatchVoiceManifest(manifest);
  const missing = failures
    .filter((f) => f.startsWith('missing cue '))
    .map((f) => f.slice('missing cue '.length));
  const other = failures.filter((f) => !f.startsWith('missing cue '));
  assert.deepEqual(other, [], 'the manifest has drifted from the script');
  assert.deepEqual(
    missing.slice().sort(), ENOLA_CUES_AWAITING_VO_SYNC.slice().sort(),
    'authored lines missing from the manifest must be declared in ENOLA_CUES_AWAITING_VO_SYNC '
    + '(and the list emptied once `npm run vo:sync` has been run)',
  );
});

test('the recording sheet shows both scenes rather than only counting them', () => {
  /* renderVoice used to walk a hard-coded scene order and drop anything not
   * on it, so a new scene's lines were included in the coverage snapshot and
   * then omitted from every section under it. The sheet disagreed with
   * itself and the missing lines looked like they did not exist. */
  /* Counted from the scripts, not written out as literals. The numbers these
   * used to assert were the scripts' sizes on the day they were written, so
   * authoring a line failed a test whose actual subject is "does a scene reach
   * the sheet at all". The Enola Squatch went 87 -> 118 the first time anybody
   * wrote for it, and this is what broke. */
  const silverCase = collectSilverCaseVoiceCues().length;
  const enola = collectEnolaSquatchVoiceCues().length;
  assert.match(todo, new RegExp(`## Voice pickups — The Silver Case \\(${silverCase}\\)`));
  assert.match(todo, new RegExp(`## Voice pickups — The Enola Squatch \\(${enola}\\)`));
  assert.match(todo, /vo\.silvercase\.car\.ape\.pitch\.mp3/);
  assert.match(todo, /vo\.enolasquatch\.sasole\.hangar-reveal-1\.1\.mp3/);
});

test('an unlisted scene falls to the end of the sheet instead of off it', () => {
  const probe = {
    voices: { ape: { id: 'x' } },
    sfx: [{ name: 'vo.brandnewscene.ape.hello', voice: 'ape', say: 'Hello.' }],
  };
  const sheet = buildAudioTodo({ manifest: probe, index: { files: [] }, legacyQueue: {} });
  assert.match(sheet, /vo\.brandnewscene\.ape\.hello\.mp3/,
    'a scene with no VOICE_SCENES entry must still reach the sheet');
});
