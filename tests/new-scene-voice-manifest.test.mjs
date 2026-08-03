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
import { RELEASE_LINES, releaseCueOf } from '../src/enolasquatch/dialogue/script.js';
import { buildAudioTodo } from '../tools/audio-todo-lib.mjs';

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
  assert.equal(cues.length, 87);
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
  assert.deepEqual(checkEnolaSquatchVoiceManifest(manifest), []);
});

test('the recording sheet shows both scenes rather than only counting them', () => {
  /* renderVoice used to walk a hard-coded scene order and drop anything not
   * on it, so a new scene's lines were included in the coverage snapshot and
   * then omitted from every section under it. The sheet disagreed with
   * itself and the missing lines looked like they did not exist. */
  assert.match(todo, /## Voice pickups — The Silver Case \(60\)/);
  assert.match(todo, /## Voice pickups — The Enola Squatch \(87\)/);
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
