import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  KNOCKING_INTRO_BOOST,
  MissionAudio,
  armTakeoffRecordIntro,
  takeoffRecordIntroVolume,
} from '../src/beefrun/audio.js';
import { MissionController } from '../src/beefrun/mission.js';

/** An engine stub that only records what startMusicLoop-family calls were made. */
function fakeEngine() {
  const calls = [];
  return {
    calls,
    replaceMusicLoop(key, url, opts) {
      calls.push({ key, url, opts });
      return { key, url };
    },
  };
}

test('Knocking opens exactly 30% louder for 24 audible seconds, then returns to its current mix', () => {
  const events = [];
  const listeners = new Map();
  const element = {
    currentTime: 0,
    /* play() flips `paused` before audio is actually audible; only the
     * `playing` event is the start of the requested 24-second window. */
    paused: false,
    addEventListener(name, listener) { listeners.set(name, listener); },
  };
  const handle = {
    element,
    gain: {
      gain: {
        setValueAtTime(value, at) { events.push({ value, at }); },
      },
    },
  };
  const ctx = { currentTime: 11 };

  assert.equal(KNOCKING_INTRO_BOOST.multiplier, 1.3);
  assert.equal(KNOCKING_INTRO_BOOST.seconds, 24);
  assert.equal(takeoffRecordIntroVolume(0.30), 0.39);
  assert.equal(armTakeoffRecordIntro(handle, ctx, 0.30), true);
  assert.deepEqual(events, [], 'the 24-second clock must not run before media playback starts');

  listeners.get('playing')();
  assert.deepEqual(events, [{ value: 0.30, at: 35 }],
    'the existing 0.30 mix must resume on the audio clock exactly 24 seconds after playback');
});

test('the real 45-knot takeoff cue owns the louder timed intro', async () => {
  const calls = [];
  const events = [];
  const listeners = new Map();
  const handle = {
    element: {
      currentTime: 0,
      paused: true,
      addEventListener(name, listener) { listeners.set(name, listener); },
    },
    gain: { gain: { setValueAtTime(value, at) { events.push({ value, at }); } } },
  };
  const engine = {
    ctx: { currentTime: 8 },
    replaceMusicLoop(key, url, opts) {
      calls.push({ key, url, opts });
      return handle;
    },
  };

  const result = await MissionController.prototype.playTakeoffRecord.call({ audio: { engine } });
  assert.equal(result, handle);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.volume, 0.39,
    'the cue must begin 30% above the existing 0.30 mix');
  assert.equal(typeof listeners.get('playing'), 'function',
    'the settle clock must be armed on actual media playback');

  handle.element.paused = false;
  listeners.get('playing')();
  assert.deepEqual(events, [{ value: 0.30, at: 32 }]);
});

test('a mission with no takeoff anthem set still plays the usual procedural score', () => {
  const engine = fakeEngine();
  const audio = new MissionAudio(engine);
  audio.ready = true;
  let started = false;
  audio.startMusic = () => { started = true; };
  audio.setPhase('takeoff');
  assert.equal(started, true, 'no anthem file means the procedural score still plays');
  assert.equal(engine.calls.length, 0);
});

test('a mission with a takeoff anthem plays the real recording once instead of the score', () => {
  const engine = fakeEngine();
  const audio = new MissionAudio(engine);
  audio.ready = true;
  audio.takeoffAnthemFile = 'test-song.mp3';
  let started = false;
  audio.startMusic = () => { started = true; };
  audio.setPhase('takeoff');
  assert.equal(started, false, 'the anthem replaces the procedural score, it does not run alongside it');
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].key, 'music.takeoff');
  assert.equal(engine.calls[0].url, 'assets/music/test-song.mp3');
  assert.equal(engine.calls[0].opts.loop, false, 'a needle-drop plays once, it does not loop');
});

test('a mission can author one quieter, timed takeoff window with a slow fade', () => {
  const engine = fakeEngine();
  const audio = new MissionAudio(engine);
  audio.ready = true;
  audio.takeoffAnthemFile = 'test-song.mp3';
  audio.takeoffAnthemOptions = { volume: 0.435, cutAt: 150, cutFade: 4 };
  audio.setPhase('takeoff');

  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].opts.volume, 0.435, '13% below the shared 0.5 needle-drop level');
  assert.equal(engine.calls[0].opts.cutAt, 150, 'the record ends at two minutes thirty');
  assert.equal(engine.calls[0].opts.cutFade, 4, 'the timed ending is a slow fade, not a hard cut');
  assert.equal(engine.calls[0].opts.loop, false);
});

test('returning to takeoff (a checkpoint restore) restarts the anthem rather than doing nothing', () => {
  const engine = fakeEngine();
  const audio = new MissionAudio(engine);
  audio.ready = true;
  audio.takeoffAnthemFile = 'test-song.mp3';
  audio.startMusic = () => {};
  audio.setPhase('takeoff');
  audio.setPhase('south');
  audio.setPhase('takeoff');
  assert.equal(engine.calls.length, 2, 'the anthem must restart, not silently no-op, on a repeat takeoff');
});

test('each takeoff song has exactly one owner', async () => {
  /* Beef Run's record is the signature cue fired at 45 knots on the roll.
   * Naming it as a MissionAudio anthem too played the song twice — once at
   * the roll, again at climbout, on two different loop keys (owner's 8-6
   * playtest). The Enola Squatch has no signature cue, so MissionAudio is
   * its one owner. */
  const beefMain = fs.readFileSync(new URL('../src/beefrun/main.js', import.meta.url), 'utf8');
  const enolaMain = fs.readFileSync(new URL('../src/enolasquatch/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(beefMain, /takeoffAnthemFile = /,
    'Beef Run must not name a MissionAudio anthem — the signature cue owns the moment');
  assert.match(enolaMain, /missionAudio\.takeoffAnthemFile = 'fortunate-son\.mp3';/);
  assert.match(enolaMain, /takeoffAnthemOptions = \{ volume: 0\.435, cutAt: 150, cutFade: 4 \};/,
    'Enola owns one quieter 2:30 Fortunate Son window with a slow fade');
  const { SIGNATURE_TRACKS } = await import('../src/core/signature-music.js');
  const knocking = SIGNATURE_TRACKS.cantYouHearMeKnocking;
  assert.equal(knocking.file, 'cant-you-hear-me-knocking.mp3');
  assert.equal(knocking.cutAt, 180, 'owner asked for about three minutes of the song');
});

test('a checkpoint-restored takeoff re-arms and restarts the record', () => {
  const mission = fs.readFileSync(new URL('../src/beefrun/mission.js', import.meta.url), 'utf8');
  /* The restore into the takeoff checkpoint must clear the 45-knot latch and
   * stop the previous attempt's loop, and the cue itself must replace any
   * still-running handle — otherwise a restarted roll gets silence. */
  const restore = mission.slice(mission.indexOf('takeoff: () =>'), mission.indexOf('approach: () =>'));
  assert.match(restore, /knockingCued = false/);
  assert.match(restore, /stopLoop/);
  const record = mission.slice(mission.indexOf('playTakeoffRecord()'));
  assert.match(record.slice(0, 900), /replace: true/);
});

test('cue records never enter the radio rotation', () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../assets/music/manifest.json', import.meta.url), 'utf8'),
  );
  const byFile = new Map((manifest.tracks || []).map((t) => [t.file, t]));
  for (const file of [
    'cant-you-hear-me-knocking.mp3', 'fortunate-son.mp3',
    'baby-snakes.mp3', 'sensi-lou.mp3',
  ]) {
    assert.equal(byFile.get(file)?.cue, true, `${file} must be marked cue: true`);
  }
  const radio = fs.readFileSync(new URL('../src/core/radio.js', import.meta.url), 'utf8');
  assert.match(radio, /!track\.cue/,
    'the radio playlist must exclude cue-marked records from programming');
});

test('both takeoff anthems are on disk and listed in the music manifest', () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../assets/music/manifest.json', import.meta.url), 'utf8'),
  );
  const files = new Set((manifest.tracks || []).map((t) => t.file));
  for (const file of ['cant-you-hear-me-knocking.mp3', 'fortunate-son.mp3']) {
    assert.ok(files.has(file), `${file} must be listed in assets/music/manifest.json`);
    assert.equal(
      fs.existsSync(new URL(`../assets/music/${file}`, import.meta.url)), true,
      `${file} is not in assets/music/`,
    );
  }
});
