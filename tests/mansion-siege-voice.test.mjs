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
  SiegeDialogue, allSiegeLines, readingSeconds, siegeDialogueEffectCueNames,
  siegeVoiceCueNames,
} from '../src/mansion/siege/script.js';
import { SPEECH_MIX_CLOSE, SPEECH_MIX_INDOORS, voiceOverlaps } from '../src/core/dialogue.js';
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

test('the staircase threat is an original vo. cue and the scene plays it once', () => {
  /* It used to be `siege.prospect.little_friend`: not on the vo. prefix, so
   * no AnalyserNode and every mouth in the room on a synthetic envelope
   * (ENGINE-TRAPS #8); and in no manifest, so unrecordable (#3). */
  const names = new Set(siegeVoiceCueNames());
  assert.ok(names.has('vo.siege.prospect.little_friend'));
  assert.equal(SEQUENCES.little_friend.length, 1, 'it is one line, said once, ever');
  assert.equal(SEQUENCES.little_friend[0].say,
    "Fine. Everybody at once. Let's find out how many of you this thing was designed for.");
  assert.equal(SEQUENCES.little_friend[0].protected, true);
  assert.equal(SEQUENCES.little_friend[0].priority, 'hero');
  assert.ok(SEQUENCES.little_friend[0].gain >= 1.4,
    'the siege payoff fell back to conversational level');
});

test('the little-friend playback carries its protected hero mix through the speech seam', () => {
  const calls = [];
  const audio = {
    hasSample: () => true,
    sampleDuration: () => 1.2,
    hold() {},
    playWithReceipt(cue, options) {
      calls.push({ cue, options });
      return { source: {}, receipt: { started: true } };
    },
  };
  const runner = new SiegeDialogue({ audio });
  assert.equal(runner.play('little_friend'), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cue, 'vo.siege.prospect.little_friend');
  assert.equal(calls[0].options.volume, SEQUENCES.little_friend[0].gain);
  assert.equal(calls[0].options.priority, 'hero');
  assert.equal(calls[0].options.bus, 'voice');
});

test('every speaker resolves to a voice profile the manifest actually has', () => {
  const voices = Object.keys(manifest.voices);
  for (const [speaker, profile] of Object.entries(SIEGE_VOICES)) {
    assert.ok(voices.includes(profile), `${speaker} wants "${profile}", which does not exist`);
    assert.ok(SIEGE_SPEAKER_NAMES[speaker], `${speaker} has no display name for the subtitle`);
  }
});

test('no dead character speaks in the siege', () => {
  /* Owner, playtest 2026-08-13: "Voice lines from Aubbie in the siege? he
   * should be dead." He is -- SILENT SQUATCH executes him six hours before
   * the siege -- and so are Willy (NO WAKE) and Billy HotDog. None of the
   * three may own a speaker slot, a voice profile or a line here. */
  const DEAD = ['aubbie', 'willy', 'billy', 'hotdog'];
  for (const id of DEAD) {
    assert.ok(!(id in SIEGE_VOICES), `${id} has a siege speaker slot`);
    assert.ok(!Object.values(SIEGE_VOICES).includes(id), `${id} is cast as a siege voice`);
  }
  for (const line of allSiegeLines()) {
    for (const id of DEAD) {
      assert.ok(!String(line.speaker).toLowerCase().includes(id),
        `${line.name} is spoken by the dead ${id}`);
      assert.ok(!String(line.voice).toLowerCase().includes(id),
        `${line.name} uses the dead ${id}'s voice`);
    }
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

test('the aftermath contains the original A-Team phone threat before the Sasole handoff', () => {
  const lines = SEQUENCES.aftermath;
  const caller = lines.filter((line) => line.speaker === 'ateam_caller');
  const callStart = lines.findIndex((line) => line.id === 'aftermath.call.lou.answer');
  const callEnd = lines.findIndex((line) => line.id === 'aftermath.call.lou.not-home');
  const routePackage = lines.findIndex((line) => line.id === 'aftermath.lou.route-package');
  const handoff = lines.findIndex((line) => line.id === 'aftermath.lou.sasole');

  assert.ok(callStart === 0, 'the post-siege phone rings before Lou debriefs the landing');
  assert.ok(caller.length >= 3, 'one bark is not a phone confrontation');
  assert.ok(caller.every((line) => line.remote === true && line.voice === 'ateam3'),
    'the A-Team caller must remain one cold remote voice');
  assert.ok(callEnd > callStart && routePackage > callEnd && handoff > routePackage,
    'Lou must finish the call, name the recovered target source, then hand the Prospect to Sasole');
  assert.match(lines[routePackage].say, /route package.+desert compound.+Sasole/i,
    'the counterstrike needs a reachable source and concrete target before the airfield handoff');
  assert.match(lines.map((line) => line.say).join(' '), /A-Team/,
    'the caller never establishes who attacked the house');

  /* Recognition belongs to the player, not to copied wording. These are the
   * most load-bearing phrases from the film monologue; none belongs in this
   * original, straight-faced exchange. */
  const words = lines.map((line) => line.say).join(' ');
  assert.doesNotMatch(words,
    /particular set of skills|look for you|find you|I will kill you|good luck/i);
});

test('the phone rings once, answers with the shared pickup, and keeps the remote caller non-positional', () => {
  const loops = [];
  const stopped = [];
  const effects = [];
  const speech = [];
  const leadIns = [];
  const audio = {
    hasSample: () => true,
    sampleDuration: () => 0.6,
    hold() {},
    startLoop(cue, options) { loops.push({ cue, options }); return {}; },
    stopLoop(cue, fade) { stopped.push({ cue, fade }); },
    play(cue, options) { effects.push({ cue, options }); return {}; },
    playWithReceipt(cue, options) {
      speech.push({ cue, options });
      return {
        source: {},
        receipt: {
          started: true,
          speakerId: options.speakerId,
          positional: { enabled: options.follow != null },
        },
      };
    },
  };
  const lou = { position: { x: -1.4, y: 6, z: 50.2 } };
  const runner = new SiegeDialogue({
    audio,
    resolveSpeaker: (id) => (id === 'lou' ? lou : null),
    onLeadIn: (leadIn, line) => leadIns.push({ leadIn, line }),
  });

  assert.equal(runner.play('aftermath'), true);
  assert.equal(runner.line, null, 'Lou must not answer over the ringtone');
  assert.equal(runner.leadIn?.cue, 'phone.ring');
  assert.equal(leadIns.length, 1, 'the HUD must be told to clear the prior combat subtitle');
  assert.equal(leadIns[0].line.id, 'aftermath.call.lou.answer');
  assert.deepEqual(siegeDialogueEffectCueNames(), ['phone.ring', 'phone.pickup', 'phone.hangup']);
  for (let guard = 0; guard < 200 && runner.active; guard += 1) runner.update(0.5);

  assert.equal(loops.filter((entry) => entry.cue === 'phone.ring').length, 1);
  assert.equal(stopped.filter((entry) => entry.cue === 'phone.ring').length, 1);
  assert.deepEqual(effects.map((entry) => entry.cue), ['phone.pickup', 'phone.hangup']);
  const remote = speech.filter((entry) => entry.options.speakerId === 'ateam_caller');
  assert.equal(remote.length, SEQUENCES.aftermath.filter((line) => line.remote === true).length);
  for (const entry of remote) {
    assert.equal(entry.options.follow, undefined, `${entry.cue} acquired a world position`);
    assert.equal(entry.options.ref, undefined, `${entry.cue} acquired distance rolloff`);
    assert.equal(entry.options.maxDist, undefined, `${entry.cue} acquired a maximum distance`);
    assert.equal(entry.options.rolloff, undefined, `${entry.cue} acquired distance rolloff`);
    assert.equal(entry.options.bus, 'voice');
  }
  assert.deepEqual(SPEECH_MIX_CLOSE, { ref: null, maxDist: null, rolloff: null });
});

test('restoring a heard aftermath cannot ring or replay the call', () => {
  const events = [];
  const audio = {
    sampleDuration: () => null,
    startLoop: (cue) => events.push(`start:${cue}`),
    stopLoop: (cue) => events.push(`stop:${cue}`),
    play: (cue) => events.push(`play:${cue}`),
  };
  const first = new SiegeDialogue({ audio });
  assert.equal(first.play('aftermath'), true);
  first.finish();
  const snapshot = first.snapshot();
  assert.equal(events.filter((entry) => entry === 'start:phone.ring').length, 1);

  const restored = new SiegeDialogue({ audio });
  restored.restore(snapshot);
  const before = events.length;
  assert.equal(restored.play('aftermath'), false);
  assert.equal(events.length, before, 'a restored call emitted another ring, pickup, line, or hangup');
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
  assert.match(markdown, /Fine\. Everybody at once\. Let's find out how many of you this thing was designed for\./);
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

test('scripted siege dialogue crosses the canonical speech seam with spatial receipts and no overlap', () => {
  let now = 0;
  let receiptId = 0;
  const calls = [];
  const holds = [];
  const playbacks = [];
  const audio = {
    hasSample: () => true,
    sampleDuration: () => 0.6,
    hold(seconds) { holds.push(seconds); },
    play() {
      throw new Error('SiegeDialogue bypassed the canonical receipt-aware speech seam');
    },
    playWithReceipt(cue, opts) {
      const positional = {
        enabled: opts.follow != null,
        follows: opts.follow != null,
        ref: opts.ref,
        maxDist: opts.maxDist,
        rolloff: opts.rolloff,
      };
      const receipt = {
        id: ++receiptId,
        requested: cue,
        actual: cue,
        source: 'buffer',
        started: true,
        voice: true,
        speakerId: opts.speakerId,
        subtitle: opts.subtitle,
        positional,
      };
      calls.push({ cue, opts, receipt });
      playbacks.push({
        name: cue,
        voice: true,
        speakerId: opts.speakerId,
        scheduledAt: now,
        endedAt: now + 0.6,
        seconds: 0.6,
      });
      return { source: { cue }, receipt };
    },
  };
  const roots = new Map([
    ['lou', { position: { x: 1, y: 6, z: 72 } }],
    ['booski', { position: { x: -2, y: 6, z: 64 } }],
  ]);
  const runner = new SiegeDialogue({
    audio,
    resolveSpeaker: (id) => roots.get(id) ?? null,
  });

  assert.equal(runner.play('briefing'), true);
  for (let guard = 0; guard < 200 && runner.active; guard += 1) {
    now += 0.1;
    runner.update(0.1);
  }

  assert.ok(calls.length > 1, 'an empty or one-line receipt set is vacuous');
  assert.equal(calls.length, SEQUENCES.briefing.length);
  assert.equal(holds.length, calls.length, 'every accepted line must claim the speech floor');
  for (const call of calls) {
    assert.equal(call.opts.bus, 'voice');
    assert.equal(call.opts.analyse, true);
    assert.equal(call.opts.requiredRecorded, true);
    assert.equal(call.opts.subtitle, SEQUENCES.briefing.find((line) => line.name === call.cue)?.say);
    assert.equal(call.receipt.speakerId, call.opts.speakerId);
  }
  const physical = calls.filter((call) => call.opts.speakerId !== 'prospect');
  assert.ok(physical.length > 1, 'the positional receipt assertion needs multiple physical speakers');
  for (const call of physical) {
    assert.equal(call.receipt.positional.enabled, true, `${call.cue} is not positional`);
    assert.equal(call.receipt.positional.follows, true, `${call.cue} does not follow its speaker`);
    assert.equal(call.receipt.positional.ref, SPEECH_MIX_INDOORS.ref);
    assert.equal(call.receipt.positional.maxDist, SPEECH_MIX_INDOORS.maxDist);
    assert.equal(call.receipt.positional.rolloff, SPEECH_MIX_INDOORS.rolloff);
  }
  assert.deepEqual(voiceOverlaps(playbacks), []);
});

test('the briefing only queues the delivered heavy line when the SAW is equipped', () => {
  assert.ok(SEQUENCES.briefing.some((line) => line.id === 'briefing.lou.heavy'),
    'the delivered cue stays in the authored voice inventory');

  const playBriefing = (weaponId) => {
    const seen = [];
    const runner = new SiegeDialogue({ onLine: (line) => seen.push(line.id) });
    assert.equal(runner.playBriefing(weaponId), true);
    for (let i = 0; i < 400 && runner.active; i++) runner.update(0.25);
    return seen;
  };

  assert.equal(playBriefing('carbine').includes('briefing.lou.heavy'), false);
  assert.equal(playBriefing('saw').includes('briefing.lou.heavy'), true);
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
  assert.equal(guessed.hold,
    readingSeconds("Fine. Everybody at once. Let's find out how many of you this thing was designed for."));
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
