import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { MissionAudio } from '../src/beefrun/audio.js';

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

test('Beef Run and the Enola Squatch each name their own takeoff anthem', () => {
  const beefMain = fs.readFileSync(new URL('../src/beefrun/main.js', import.meta.url), 'utf8');
  const enolaMain = fs.readFileSync(new URL('../src/enolasquatch/main.js', import.meta.url), 'utf8');
  assert.match(beefMain, /missionAudio\.takeoffAnthemFile = 'cant-you-hear-me-knocking\.mp3';/);
  assert.match(enolaMain, /missionAudio\.takeoffAnthemFile = 'fortunate-son\.mp3';/);
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
