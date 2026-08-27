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
import {
  checkHeistVoiceManifest,
  collectHeistVoiceCues,
  syncHeistVoiceManifest,
} from '../tools/heist-vo.mjs';
import { SEQUENCES } from '../src/silvercase/dialogue/script.js';
import { ALL_HEIST_DIALOGUE, HEIST_PENDING_DIALOGUE, dialogueLine } from '../src/heist/script.js';
import {
  RELEASE_LINES, releaseCueOf, allEnolaSquatchLines,
} from '../src/enolasquatch/dialogue/script.js';
import { isEnolaPreloadCue } from '../src/enolasquatch/audio.js';
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
  /* Empty, and it should stay empty in a released state. The 49 fighter,
   * autopilot, gunner, flak and detonation lines authored on 2026-08-04 were
   * generated into the manifest by `npm run vo:sync` the same day. */
];

const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'),
);
const todo = fs.readFileSync(new URL('../VOICE-LINES-TODO.md', import.meta.url), 'utf8');

/* ---------------- The Silver Case ---------------- */

test('every Silver Case line the script names is in the ledger, and nothing else is', () => {
  const cues = collectSilverCaseVoiceCues();
  /* A floor, not a snapshot. 60 was the script's size the day it was written,
   * so authoring a line failed a test whose actual subject is "does the
   * collector walk every category and mint a usable row for each". The floor
   * still catches a scene that has LOST lines. */
  assert.ok(cues.length >= 60, 'the script has lost lines rather than gained them');
  assert.equal(new Set(cues.map((cue) => cue.name)).size, cues.length, 'two lines share one recording');
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

test('Ape\'s rewritten Lou interrogation records the repeated question without obsolete choice reactions', () => {
  const names = new Set(collectSilverCaseVoiceCues().map((cue) => cue.name));
  assert.ok(names.has('vo.silvercase.lou.ape.lookslikeabitch'));
  assert.ok(names.has('vo.silvercase.lou.ape.lookslikeabitch.again'));
  assert.ok(names.has('vo.silvercase.lou.ape.mrssputthole'));
  assert.equal(names.has('vo.silvercase.lou.ape.reaction.no'), false);
  assert.equal(names.has('vo.silvercase.lou.ape.reaction.absolutelynot'), false);
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

/**
 * The audio ENGINE's decode selector (`src/enolasquatch/audio.js`'s
 * `isEnolaPreloadCue`) has to agree with the VOICE LEDGER generator
 * (`collectEnolaSquatchVoiceCues`, above) about every cue name it mints —
 * otherwise a line can be fully authored, recorded and sitting in the
 * manifest, and still never decode because the runtime never asked for it.
 * That gap is exactly how `EnolaMissionAudio.line()` went unreachable before
 * (this file's own header) and how `enola.` vs `enolasquatch.` nearly did the
 * same to the bomb clips (see `isEnolaPreloadCue`'s own comment and
 * `tests/enolasquatch-bomb-audio.test.mjs`).
 *
 * Written generically — walking whatever `collectEnolaSquatchVoiceCues()`
 * currently mints — rather than against a fixed line count, so it also covers
 * any beat/bark/release line authored after this test was written, including
 * ones from a sibling branch not yet merged here (e.g. the engine-out crew
 * line added elsewhere as `vo.enolasquatch.irish.defense-engineStrain-1.1` /
 * `vo.enolasquatch.sasole.defense-engineStrain-2.1` — both already match the
 * `vo.enolasquatch.` prefix `isEnolaPreloadCue` checks, so no selector change
 * is needed once that work lands, but nothing here depended on hardcoding
 * those two names to prove it).
 */
test('every cue the Enola Squatch voice ledger mints is inside the runtime\'s own decode selector', () => {
  const cues = collectEnolaSquatchVoiceCues();
  assert.ok(cues.length >= 87, 'the script has lost lines rather than gained them');
  for (const cue of cues) {
    assert.ok(isEnolaPreloadCue(cue.name), `${cue.name} is in the voice ledger but isEnolaPreloadCue rejects it`);
  }
});

/* ---------------- THE TAKE ---------------- */

test('every line the heist script names is in the ledger, including the pending bank', () => {
  const cues = collectHeistVoiceCues();
  /* The failure this guards is exactly the one at the top of this file, and
   * the heist had it worse than either scene above: 112 lines written, 57 in
   * the manifest. The other 55 -- eleven of Lou's fourteen, and every word a
   * hostage says when a rifle comes up -- were parked in a second bank waiting
   * on a tool that did not exist, so nothing counted them and nobody knew.
   * A floor, not a snapshot: the subject is "does the collector walk BOTH
   * banks", and a script that has lost lines still fails. */
  assert.ok(cues.length >= 112, `the heist has lost lines: ${cues.length}`);
  assert.equal(cues.length, Object.keys(ALL_HEIST_DIALOGUE).length);
  assert.equal(new Set(cues.map((cue) => cue.name)).size, cues.length, 'two lines share one recording');
  assert.equal(cues.every((cue) => cue.name.startsWith('heist.') && cue.voice && cue.say), true);

  const names = new Set(cues.map((cue) => cue.name));
  for (const entry of Object.values(HEIST_PENDING_DIALOGUE)) {
    assert.ok(names.has(entry.cue), `${entry.id} is authored but not collectable`);
  }
});

test('the heist tool owns its dialogue and leaves its 46 sound effects alone', () => {
  /* `heist.` names both the dialogue and the effects, so this is the one
   * generator that cannot filter by prefix. If it ever did, a rebuild would
   * delete heist.bank.alarm and every other effect in the scene. */
  const original = { sfx: [
    { name: 'heist.bank.alarm', prompt: 'an alarm' },
    { name: 'heist.map.paper', prompt: 'paper' },
  ] };
  const snapshot = structuredClone(original);
  const synced = syncHeistVoiceManifest(original);
  assert.deepEqual(original, snapshot, 'sync must not mutate its input');
  assert.deepEqual(checkHeistVoiceManifest(synced), []);
  for (const effect of ['heist.bank.alarm', 'heist.map.paper']) {
    assert.ok(synced.sfx.some((cue) => cue.name === effect && cue.prompt),
      `${effect} was eaten by the dialogue rebuild`);
  }
});

test('a heist sync carries the recording side\'s own bookkeeping across', () => {
  /* FOUND THE HARD WAY. Adding thirteen lines to Snow's casualty ladder and
   * running `vo:heist` silently deleted `needsRerecord` from
   * `heist.prospect_order_down` — a re-record the owner had asked for in the
   * 2026-08-19 dialogue pass, wiped by a tool run that had nothing to do with
   * it, in a 9000-line diff where nobody would have seen it.
   *
   * A sync rebuilds every owned cue from `script.js`, and `script.js` cannot
   * know which takes are cut or which ones are owed. Those fields belong to
   * the manifest and to `vo:rerecord`, and a sync has to leave them where it
   * found them. (The audio side had already asked for this from the other
   * direction: *"Run vo:rerecord on its own, not vo:sync."*) */
  const marked = {
    sfx: [{
      name: 'heist.prospect_order_down',
      voice: 'player',
      say: 'superseded by the script',
      needsRerecord: true,
      rerecordReason: 'rewritten in the 2026-08-19 dialogue pass',
      recorded: true,
      takeId: 'take-0042',
    }],
  };
  const synced = syncHeistVoiceManifest(marked);
  const cue = synced.sfx.find((entry) => entry.name === 'heist.prospect_order_down');
  assert.ok(cue, 'the sync lost the cue entirely');
  assert.equal(cue.needsRerecord, true, 'the sync dropped an owed re-record');
  assert.equal(cue.rerecordReason, 'rewritten in the 2026-08-19 dialogue pass');
  assert.equal(cue.recorded, true, 'the sync forgot that a take exists');
  assert.equal(cue.takeId, 'take-0042');
  // The words still come from the script — that is the whole point of a sync.
  assert.equal(cue.say, dialogueLine('prospect_order_down').text);

  // A cue the manifest has never seen arrives with no bookkeeping invented.
  const fresh = syncHeistVoiceManifest({ sfx: [] }).sfx
    .find((entry) => entry.name === 'heist.snow_committed');
  assert.ok(fresh, 'the new line is not in a fresh sync');
  assert.equal(fresh.needsRerecord, undefined, 'a brand new cue was born owing a re-record');
  assert.equal(fresh.recorded, undefined, 'a brand new cue was born already recorded');
});

test('the bank\'s own people are cast, and the two Lous stay apart', () => {
  const voices = new Set(Object.keys(manifest.voices || {}));
  const byName = new Map(collectHeistVoiceCues().map((cue) => [cue.name, cue]));
  for (const cue of byName.values()) {
    assert.ok(voices.has(cue.voice), `${cue.name} is cast as "${cue.voice}", which is not a voice profile`);
  }
  /* A hostage begging is a person, not an unvoiced prop. `npcLine` derives its
   * speakerId from the cue id, so every one of them arrives as 'hostage' and
   * has to be cast off the subtitle name instead. */
  assert.equal(byName.get('heist.hostage_plead_one').voice, 'heist-customer');
  assert.equal(byName.get('heist.guard_warning').voice, 'heist-guard');
  /* The heist casts Big Uncle Lou on `lou`, which is a different profile from
   * `lou1` and a very different man from `lou2`. Landing 13 new cues for him
   * must not quietly re-cast the one that was already recorded. */
  assert.equal(byName.get('heist.lou_call').voice, 'lou');
  const lou = [...byName.values()].filter((cue) => cue.voice === 'lou');
  assert.ok(lou.length >= 14, `Lou is only cast on ${lou.length} lines`);
  assert.equal([...byName.values()].some((cue) => cue.voice === 'lou2'), false,
    'Captain Lou Sasole is not in this bank');
});

test('the committed manifest is in sync with the heist script', () => {
  assert.deepEqual(checkHeistVoiceManifest(manifest), []);
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
  /* Only a scene with something still owed appears here — the section lists
   * outstanding pickups, so a fully-recorded scene correctly drops off it.
   * (The Silver Case did exactly that when its 60 takes were delivered on
   * 2026-08-04, which failed an earlier version of this test that asserted the
   * heading unconditionally.) So: derive who is owed anything, and require
   * only those to be listed. The bug this guards is a scene being counted in
   * the snapshot and then omitted from every section below it. */
  const index = JSON.parse(
    fs.readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'),
  );
  const have = new Set(index.files || []);
  const owed = (cues) => cues.filter((cue) => !have.has(`${cue.name}.mp3`)).length;
  const silverCaseOwed = owed(collectSilverCaseVoiceCues());
  /* The sheet is regenerated centrally by `npm run audio:todo`, on the same
   * cadence as the manifest — so between an authoring session and the next
   * run it is behind by exactly the cues declared in
   * `ENOLA_CUES_AWAITING_VO_SYNC` above, and by nothing else. Subtracting the
   * declared backlog is the same allowance the manifest-sync test makes, for
   * the same reason: an undeclared new line still fails, a scene dropping off
   * the sheet entirely still fails, and the number is still checked. When the
   * list goes back to empty this reduces to the original assertion. */
  /* A section counts PICKUPS, and a pickup is either a line with no take yet or
   * a line whose take says the wrong words. `owed()` only sees the first kind —
   * it tests `assets/sfx/index.json` — so a scene with anything in the
   * re-record queue reads two short of its own heading and this test fails for
   * a reason that has nothing to do with the bug it guards. The queue is the
   * second kind, counted from the same file `npm run vo:rerecord` writes. */
  const rerecord = JSON.parse(
    fs.readFileSync(new URL('../assets/sfx/rerecord.json', import.meta.url), 'utf8'),
  );
  const queued = (prefix) => (rerecord.lines || [])
    .filter(({ cue }) => typeof cue === 'string' && cue.startsWith(prefix)).length;
  const enolaOwed = owed(collectEnolaSquatchVoiceCues())
    - ENOLA_CUES_AWAITING_VO_SYNC.length
    + queued('vo.enolasquatch.');
  if (silverCaseOwed) {
    assert.match(todo, new RegExp(`## Voice pickups — The Silver Case \\(${silverCaseOwed}\\)`));
  }
  if (enolaOwed) {
    assert.match(todo, new RegExp(`## Voice pickups — The Enola Squatch \\(${enolaOwed}\\)`));
  }
  assert.ok(silverCaseOwed + enolaOwed >= 0);
  if (silverCaseOwed) assert.match(todo, /vo\.silvercase\./);
  if (enolaOwed) assert.match(todo, /vo\.enolasquatch\./);
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
