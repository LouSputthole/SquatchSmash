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

test('opening the office door is what starts it, and it is not panned', () => {
  /* Owner's playtest, 2026-08-04: *"The sensi lou sound I could hear coming
   * down the hallway, it should just play ONCE when you open the door."*
   *
   * Not scene load — a loop running behind a closed door since the title card
   * is a radio, not a sting — and not the room change either, which fires a
   * stride or two past a threshold the player has already crossed. The hand on
   * the handle. And with no `position`, because a sting is on Tony rather than
   * in a corner of a room he has not reached yet. */
  const hook = bingMain.slice(
    bingMain.indexOf('function cueSensiLou('),
    bingMain.indexOf('registerDoor(\'service\''),
  );
  assert.match(hook, /SIGNATURE_TRACKS\.sensiLou/);
  assert.match(hook, /replace: true/, 'the cue must restart the record, not layer a second one');
  assert.match(hook, /loop: false/, 'a five-second sting must not repeat');
  assert.doesNotMatch(hook, /position:/, 'the sting is unpanned — panning it is what bled into the hallway');
  assert.match(hook, /if \(door\.open\) cueSensiLou\(\);/, 'the office door must be what fires it');
});

test('nothing starts it before the door, and it cues once however often he walks back in', () => {
  assert.match(bingMain, /sensiLouCued: false/);
  const hook = bingMain.slice(bingMain.indexOf('function cueSensiLou('));
  assert.match(hook, /game\.sensiLouCued = true/);
  /* The boot block starts Lou's OWN radio and nothing else. A second
   * `playSignatureTrack(sensiLou)` anywhere would be the old bug returning. */
  assert.equal(
    bingMain.split('SIGNATURE_TRACKS.sensiLou').length - 1, 1,
    'Sensi Lou is fired from exactly one place',
  );
  assert.match(bingMain, /startMusicLoop\('office\.radio', LOU_RADIO_FILE/,
    'the office keeps a radio of its own, separate from the sting');
});

test('the sting and the office radio are separate loops', () => {
  /* They used to share `office.radio`, which is how a 4.7-second cue with
   * in/out points ended up looping behind a closed door all night. */
  assert.notEqual(SIGNATURE_TRACKS.sensiLou.loopKey, 'office.radio');
  assert.equal(SIGNATURE_TRACKS.sensiLou.loopKey, 'music.sensilou');
});

test('the owner-picked windows and levels are the ones on the cues', () => {
  /* Owner's playtest, 2026-08-04: Baby Snakes wider by four tenths at each
   * end, Baby Snakes louder, and Sensi Lou ten per cent up on 0.22. */
  assert.equal(SIGNATURE_TRACKS.babySnakes.start, 18.6);
  assert.equal(SIGNATURE_TRACKS.babySnakes.cutAt, 22.6);
  assert.equal(SIGNATURE_TRACKS.babySnakes.volume, 0.4);
  assert.equal(SIGNATURE_TRACKS.sensiLou.volume, 0.242);
  assert.equal(SIGNATURE_TRACKS.sensiLou.start, 5);
  assert.equal(SIGNATURE_TRACKS.sensiLou.cutAt, 9.7);
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

test('it fires on the keypress that takes the shot, not on the pour', () => {
  /* He is on a bar stool from the moment the club loads, so a line-of-sight
   * cue would play his record over the front door. It used to fire on
   * `startShotBeat`, which is the pour — and then ran a bartender, a bouncer
   * and a handover before the glass ever reached Tony, so the three seconds
   * the window was cut for had gone past by the time he drank it. Owner's
   * playtest, 2026-08-04: *"I want the sound to happen right when I take the
   * shot, like hit E on it."* */
  assert.match(bingMain, /function cueBabySnakes\(/);
  const beat = bingMain.slice(bingMain.indexOf('function startShotBeat()'));
  assert.equal(beat.includes('cueBabySnakes('), false,
    'the pour must not cue it — the swallow does');

  const drink = bingMain.slice(
    bingMain.indexOf('function startBooskiShotDrink()'),
    bingMain.indexOf('function shotDrinkTick('),
  );
  const guard = drink.indexOf('return false;');
  const call = drink.indexOf('cueBabySnakes(');
  assert.ok(call > 0, 'the drink never cues Baby Snakes');
  assert.ok(guard > 0 && call > guard,
    'the cue must sit after the press can still be refused');

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
  const owed = ['baby-snakes.mp3', 'cant-you-hear-me-knocking.mp3', 'sensi-lou.mp3', 'spy-jazz.mp3'];
  const pending = pendingSignatureTracks(new Set()).map((track) => track.file);
  assert.deepEqual(pending.sort(), owed);
  assert.deepEqual(pendingSignatureTracks(new Set(owed)), []);
});

/* ---------------- Can't You Hear Me Knocking ---------------- */

test('the takeoff record is wired to the Beef Run’s first roll, at the owner’s speed', () => {
  /* The owner asked for this on 2026-08-03 and then reported not hearing it,
   * because it had a brief in assets/music/README.md and no implementation.
   * These are the terms he settled, asserted against the code that plays it. */
  const track = SIGNATURE_TRACKS.cantYouHearMeKnocking;
  assert.equal(track.file, 'cant-you-hear-me-knocking.mp3');
  assert.equal(track.fallbackFile, '10-drunk-cigarettes.mp3', 'it must sound like something before the file lands');
  assert.equal(track.loopKey, 'music.knocking', 'its own mix slot, so the rotation call can duck it');
  assert.equal(track.cutAt, 180, 'about three minutes of it, not the whole record — owner moved it up from two on the 8-6 playtest');

  const beefMission = fs.readFileSync(
    new URL('../src/beefrun/mission.js', import.meta.url), 'utf8',
  );
  assert.match(beefMission, /const KNOCKING_AT_KNOTS = 45;/, 'it comes in at 45 knots');
  assert.match(beefMission, /SIGNATURE_TRACKS\.cantYouHearMeKnocking/);
  assert.match(beefMission, /flags\.knockingCued/, 'once per run');
  /* Fired from exactly one place. The El Hueso departure runs through a
   * different phase and must not play it a second time. */
  assert.equal(
    beefMission.split('SIGNATURE_TRACKS.cantYouHearMeKnocking').length - 1, 1,
    'the takeoff record is fired from exactly one place',
  );
  assert.match(beefMission, /loop: false/, 'a record plays through, it does not loop');
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
