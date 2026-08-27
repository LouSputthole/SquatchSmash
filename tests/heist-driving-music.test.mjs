import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { HEIST_DRIVING_MUSIC, HeistDrivingScore } from '../src/heist/music.js';

class FakeAudio {
  constructor() {
    this.started = [];
    this.stopped = [];
    this.loops = new Map();
  }

  startMusicLoop(key, file, options) {
    const handle = { key, file, options, released: false, failed: false };
    this.started.push(handle);
    this.loops.set(key, handle);
    return handle;
  }

  stopLoop(key, fade) {
    this.stopped.push({ key, fade });
    this.loops.delete(key);
  }
}

test('THE TAKE drive music is quiet, non-diegetic, looped, and voice-duckable', () => {
  const audio = new FakeAudio();
  const score = new HeistDrivingScore(audio);

  assert.equal(score.start(), true);
  assert.equal(audio.started.length, 1);
  assert.equal(audio.started[0].file, 'assets/music/driving-the-take.mp3');
  assert.equal(audio.started[0].options.bus, 'music');
  assert.equal(audio.started[0].options.ambience, false);
  assert.equal(audio.started[0].options.loop, true);
  assert.ok(audio.started[0].options.volume > 0 && audio.started[0].options.volume <= 0.18);
  assert.equal('position' in audio.started[0].options, false);
  assert.ok(audio.stopped.some((entry) => entry.key === 'heist.morning.radio'));
  assert.equal(score.snapshot().active, true);

  score.stop();
  assert.ok(audio.stopped.some((entry) => entry.key === HEIST_DRIVING_MUSIC.key));
  assert.equal(score.snapshot().started, false);
});

test('the live heist starts, stops, restores, and tears down the drive score', async () => {
  const source = await readFile(new URL('../src/heist/main.js', import.meta.url), 'utf8');
  assert.match(source, /const driveScore = new HeistDrivingScore\(audio\)/);
  assert.match(source, /function beginDriving\([\s\S]{0,1400}driveScore\.start\(\{ restart: true \}\)/);
  assert.match(source, /function reachSwap\([\s\S]{0,500}driveScore\.stop\(/);
  assert.match(source, /function failMission\([\s\S]{0,300}driveScore\.stop\(/);
  assert.match(source, /if \(driving\) driveScore\.start\(\{ restart: true \}\)/);
  assert.match(source, /function returnToApartment\([\s\S]{0,500}driveScore\.stop\(/);
});
