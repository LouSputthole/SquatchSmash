/**
 * The three audio cues the owner asked for by name.
 *
 *   "Sensi Lou" when entering Lou's office.
 *   "Baby Snakes" on Booski's first significant appearance in a scene.
 *   Shubes' "Hey guys, what's going on?" with cooldowns and varied delivery
 *   so it does not fire constantly.
 *
 * Neither record is in the repository yet, so the first two are contracts
 * about the trigger and the fallback rather than about a file: the cue has to
 * be wired to the right moment, and a missing recording has to sound like the
 * scene did before rather than like a hole.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  SIGNATURE_TRACKS,
  playSignatureTrack,
  pendingSignatureTracks,
  signatureFallbackUrl,
  signatureTrackUrl,
} from '../src/core/signature-music.js';
import {
  SHUBENATOR_SIGNATURE_COOLDOWN_SECONDS,
  SHUBENATOR_SIGNATURE_TAKES,
  SHUBENATOR_SIGNATURE_TEXT,
  createShubenatorSignature,
} from '../src/core/shubenator-signature.js';

const bingMain = fs.readFileSync(new URL('../src/bing/main.js', import.meta.url), 'utf8');

/** An AudioEngine stub that records what was asked for and can refuse a file. */
function fakeAudio({ missing = [] } = {}) {
  const started = [];
  const engine = {
    started,
    startMusicLoop(key, url, opts = {}) {
      started.push({ key, url, opts, replaced: false });
      if (missing.some((name) => url.endsWith(name))) {
        opts.onError?.({}, new Error('404'));
        return null;
      }
      return { key, url };
    },
    replaceMusicLoop(key, url, opts = {}) {
      started.push({ key, url, opts, replaced: true });
      if (missing.some((name) => url.endsWith(name))) {
        opts.onError?.({}, new Error('404'));
        return null;
      }
      return { key, url };
    },
  };
  return engine;
}

/* ---------------- Sensi Lou ---------------- */

test('Sensi Lou is a real cue with a named file and a fallback that exists', () => {
  const track = SIGNATURE_TRACKS.sensiLou;
  assert.equal(track.title, 'Sensi Lou');
  assert.equal(track.file, 'sensi-lou.mp3');
  assert.match(track.trigger, /office/i);
  assert.equal(signatureTrackUrl(track), 'assets/music/sensi-lou.mp3');
  const fallback = signatureFallbackUrl(track).replace('assets/music/', '');
  assert.equal(
    fs.existsSync(new URL(`../assets/music/${fallback}`, import.meta.url)), true,
    `the Sensi Lou fallback ${fallback} is not in assets/music/`,
  );
});

test('walking into Lou\'s office is what starts it', () => {
  /* Not scene load, and not the door interaction — the room change, which is
   * the moment Tony is actually in there. */
  const hook = bingMain.slice(bingMain.indexOf('function onRoomChange('));
  assert.match(hook, /next === 'office' && !game\.sensiLouCued/);
  assert.match(hook, /SIGNATURE_TRACKS\.sensiLou/);
  assert.match(hook, /replace: true/, 'entering must restart the record, not layer a second one');
});

test('it cues once, however many times he walks back in', () => {
  assert.match(bingMain, /sensiLouCued: false/);
  const hook = bingMain.slice(bingMain.indexOf('function onRoomChange('));
  assert.match(hook, /game\.sensiLouCued = true/);
});

/* ---------------- Baby Snakes ---------------- */

test('Baby Snakes is a real cue with a named file and a fallback that exists', () => {
  const track = SIGNATURE_TRACKS.babySnakes;
  assert.equal(track.title, 'Baby Snakes');
  assert.equal(track.file, 'baby-snakes.mp3');
  assert.match(track.trigger, /Booski/i);
  const fallback = signatureFallbackUrl(track).replace('assets/music/', '');
  assert.equal(
    fs.existsSync(new URL(`../assets/music/${fallback}`, import.meta.url)), true,
    `the Baby Snakes fallback ${fallback} is not in assets/music/`,
  );
});

test('it fires on the beat the scene is about him, not on sight of him', () => {
  /* He is on a bar stool from the moment the club loads. A line-of-sight cue
   * would play his record over the front door. */
  assert.match(bingMain, /function cueBabySnakes\(/);
  /* Inside the shot beat, and after its guards: if there is no bartender the
   * beat aborts and no record should have started. */
  const beat = bingMain.slice(bingMain.indexOf('function startShotBeat()'));
  const guard = beat.indexOf('if (!bartender) return;');
  const call = beat.indexOf('cueBabySnakes(booski)');
  assert.ok(call > 0, 'the shot beat never cues Baby Snakes');
  assert.ok(guard > 0 && call > guard, 'the cue must sit after the beat can still abort');
  const cue = bingMain.slice(bingMain.indexOf('function cueBabySnakes('), bingMain.indexOf('function startShotBeat()'));
  assert.match(cue, /if \(game\.babySnakesCued\) return;/);
  assert.match(cue, /loop: false/, 'a signature entrance plays once, it does not loop');
});

/* ---------------- both, when the file is not there ---------------- */

test('an undelivered recording is never requested, it just plays the fallback', async () => {
  /* Asking for a file that is not there would work — the onError net catches
   * it — but it costs a 404 and a console error every time the club loads,
   * and a scene that logs errors on purpose cannot be checked for errors. */
  for (const track of Object.values(SIGNATURE_TRACKS)) {
    const audio = fakeAudio();
    await playSignatureTrack(audio, track, { delivered: new Set() });
    assert.equal(audio.started.length, 1, `${track.title} made more than one request`);
    assert.equal(audio.started[0].url, signatureFallbackUrl(track));
    assert.equal(audio.started[0].key, track.loopKey);
  }
});

test('a delivered recording is played', async () => {
  const audio = fakeAudio();
  await playSignatureTrack(audio, SIGNATURE_TRACKS.sensiLou, {
    delivered: new Set(['sensi-lou.mp3']),
  });
  assert.equal(audio.started.length, 1);
  assert.equal(audio.started[0].url, 'assets/music/sensi-lou.mp3');
});

test('a delivered file that the deploy still cannot serve falls back rather than going silent', async () => {
  const track = SIGNATURE_TRACKS.babySnakes;
  const audio = fakeAudio({ missing: [track.file] });
  await playSignatureTrack(audio, track, { delivered: new Set([track.file]) });
  assert.equal(audio.started.length, 2, 'the second net did not catch it');
  assert.equal(audio.started[0].url, signatureTrackUrl(track));
  assert.equal(audio.started[1].url, signatureFallbackUrl(track));
  // Same mix slot, so the fallback is the record rather than a second one.
  assert.equal(audio.started[1].key, audio.started[0].key);
});

test('neither track is in the music manifest until its file lands', () => {
  /* tools/check.mjs fails the build for a manifest track with no file, so a
   * premature entry would break every check in the repo. */
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../assets/music/manifest.json', import.meta.url), 'utf8'),
  );
  const files = new Set((manifest.tracks || []).map((entry) => entry.file));
  for (const track of Object.values(SIGNATURE_TRACKS)) {
    const onDisk = fs.existsSync(new URL(`../assets/music/${track.file}`, import.meta.url));
    if (!onDisk) {
      assert.equal(
        files.has(track.file), false,
        `${track.file} is in the music manifest but not on disk — npm run check will fail`,
      );
    }
  }
});

test('the outstanding signature recordings are reportable', () => {
  const pending = pendingSignatureTracks(new Set()).map((track) => track.file);
  assert.deepEqual(pending.sort(), ['baby-snakes.mp3', 'sensi-lou.mp3']);
  assert.deepEqual(pendingSignatureTracks(new Set(['sensi-lou.mp3', 'baby-snakes.mp3'])), []);
});

/* ---------------- Shubenator ---------------- */

test('the words never change, and there are still three authored takes', () => {
  assert.equal(SHUBENATOR_SIGNATURE_TEXT, 'Hey guys, what’s going on?');
  const takes = Object.values(SHUBENATOR_SIGNATURE_TAKES);
  assert.equal(takes.length, 3);
  assert.equal(takes.every((t) => t.text === SHUBENATOR_SIGNATURE_TEXT), true);
  assert.equal(new Set(takes.map((t) => t.cue)).size, 3, 'three takes must be three recordings');
});

test('an ambient hello goes quiet for the cooldown instead of firing constantly', () => {
  let clock = 1000;
  const gate = createShubenatorSignature({ now: () => clock });

  assert.ok(gate.offer(), 'the first hello should land');
  assert.equal(gate.offer(), null, 'he must not greet the same room twice');

  clock += SHUBENATOR_SIGNATURE_COOLDOWN_SECONDS - 1;
  assert.equal(gate.offer(), null, 'one second short is still too soon');

  clock += 1;
  assert.ok(gate.offer(), 'past the cooldown he is allowed to say it again');
});

test('when he does say it again it is a different take', () => {
  let clock = 0;
  const gate = createShubenatorSignature({ now: () => clock });
  const heard = [];
  for (let i = 0; i < 4; i++) {
    heard.push(gate.offer().cue);
    clock += SHUBENATOR_SIGNATURE_COOLDOWN_SECONDS;
  }
  for (let i = 1; i < heard.length; i++) {
    assert.notEqual(heard[i], heard[i - 1], `take repeated back to back at ${i}`);
  }
  assert.ok(new Set(heard).size >= 3, 'the rotation should reach every recorded take');
});

test('the three authored story beats are never swallowed by the cooldown', () => {
  const clock = 0;
  const gate = createShubenatorSignature({ now: () => clock });
  // Back to back, on the same instant, because the script says so.
  assert.equal(gate.scripted('firstMeeting').cue, SHUBENATOR_SIGNATURE_TAKES.firstMeeting.cue);
  assert.equal(gate.scripted('hotDogAftermath').cue, SHUBENATOR_SIGNATURE_TAKES.hotDogAftermath.cue);
  assert.equal(gate.scripted('heistCleanup').cue, SHUBENATOR_SIGNATURE_TAKES.heistCleanup.cue);
  assert.throws(() => gate.scripted('nope'), TypeError);
});

test('a scripted beat still arms the gate, so nothing echoes it', () => {
  let clock = 500;
  const gate = createShubenatorSignature({ now: () => clock });
  gate.scripted('hotDogAftermath');
  assert.equal(gate.offer(), null, 'an ambient hello must not tread on the authored beat');
  assert.ok(gate.cooldownRemaining() > 0);
  clock += SHUBENATOR_SIGNATURE_COOLDOWN_SECONDS;
  const next = gate.offer();
  assert.ok(next);
  assert.notEqual(next.cue, SHUBENATOR_SIGNATURE_TAKES.hotDogAftermath.cue);
});

test('a new scene starts him fresh', () => {
  let clock = 10;
  const gate = createShubenatorSignature({ now: () => clock });
  gate.offer();
  assert.equal(gate.offer(), null);
  gate.reset();
  assert.ok(gate.offer(), 'reset must let the next scene hear him say it once');
});
