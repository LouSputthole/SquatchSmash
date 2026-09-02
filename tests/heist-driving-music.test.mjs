import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  HEIST_DRIVING_MUSIC,
  HEIST_SAFEHOUSE_RECORD,
  HeistDrivingScore,
  HeistSafehouseRecord,
} from '../src/heist/music.js';

class FakeAudio {
  constructor() {
    this.started = [];
    this.stopped = [];
    this.loops = new Map();
  }

  startMusicLoop(key, file, options) {
    const handle = {
      key,
      file,
      options,
      streamed: true,
      released: false,
      failed: false,
      release() { this.released = true; },
    };
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
  /* 0.42 since the owner asked for the drive record "much louder" (2026-09-02):
   * clear of the engine bed and the sirens, still under a shouted line once
   * the voice duck takes it to 0.45x. The ceiling here is the point past
   * which it would drown the calls the drive is built on. */
  assert.ok(audio.started[0].options.volume >= 0.35 && audio.started[0].options.volume <= 0.5);
  assert.equal('position' in audio.started[0].options, false);
  assert.equal(score.snapshot().active, true);
  assert.equal(score.snapshot().startCount, 1);
  assert.equal(score.snapshot().unreleasedStreamHandles, 1);

  score.stop();
  assert.ok(audio.stopped.some((entry) => entry.key === HEIST_DRIVING_MUSIC.key));
  assert.equal(score.snapshot().started, false);
  assert.equal(score.snapshot().activeLoopCount, 0);
  assert.equal(score.snapshot().unreleasedStreamHandles, 1,
    'the owner keeps the fading stream inspectable until release');
  score.dispose();
  assert.equal(score.snapshot().unreleasedStreamHandles, 0);
  assert.equal(score.snapshot().lastRetiredReleased, true);
});

test('THE TAKE safehouse record owns one streamed handle and releases it at departure', () => {
  const audio = new FakeAudio();
  const record = new HeistSafehouseRecord(audio);

  assert.equal(record.start(), true);
  assert.equal(record.start(), true, 'an already-active record is idempotent');
  assert.equal(audio.started.length, 1);
  assert.equal(audio.started[0].key, HEIST_SAFEHOUSE_RECORD.key);
  assert.equal(audio.started[0].file, HEIST_SAFEHOUSE_RECORD.file);
  assert.equal(audio.started[0].options.ambience, true);
  assert.equal(record.snapshot().startCount, 1);
  assert.equal(record.snapshot().activeLoopCount, 1);
  assert.equal(record.snapshot().unreleasedStreamHandles, 1);

  record.stop();
  assert.equal(record.snapshot().activeLoopCount, 0);
  assert.equal(record.snapshot().retiredCount, 1);
  record.dispose();
  assert.equal(record.snapshot().unreleasedStreamHandles, 0);
  assert.equal(record.snapshot().lastRetiredReleased, true);
});

test('the live heist starts, stops, restores, and tears down the drive score', async () => {
  const source = await readFile(new URL('../src/heist/main.js', import.meta.url), 'utf8');
  assert.match(source, /const safehouseRecord = new HeistSafehouseRecord\(audio\)/);
  assert.match(source, /const driveScore = new HeistDrivingScore\(audio\)/);
  /* The record follows the crew now (owner, 2026-09-02: "keep the music
   * going at least into the bank and the vault... just keep it low"): the
   * van and the bank lower it through `syncSafehouseRecord`, and the street
   * is what retires it. */
  assert.match(source, /function syncSafehouseRecord\(phaseId\) \{[\s\S]{0,200}safehouseRecord\.follow\(\)[\s\S]{0,200}safehouseRecord\.stop\(\)/);
  assert.match(source, /setAudioZone\(id\);\s*syncSafehouseRecord\(id\);/);
  assert.doesNotMatch(source, /function startVanRide\(\) \{[\s\S]{0,500}safehouseRecord\.stop\(\)/);
  assert.match(source, /function beginDriving\([\s\S]{0,1400}driveScore\.start\(\{ restart: true \}\)/);
  assert.match(source, /function reachSwap\([\s\S]{0,500}driveScore\.stop\(/);
  assert.match(source, /function failMission\([\s\S]{0,300}driveScore\.stop\(/);
  assert.match(source, /if \(driving\) driveScore\.start\(\{ restart: true \}\)/);
  assert.match(source, /function returnToApartment\([\s\S]{0,800}disposeHeistMusic\(\)/);
  assert.match(source, /heist:audio-teardown/);
  assert.match(source, /safehouseRecord\.start\(\)/);
});

test('the real-browser gate names both complete THE TAKE music ownership receipts', async () => {
  const verifier = await readFile(new URL('../tools/verify-heist.mjs', import.meta.url), 'utf8');
  assert.match(verifier,
    /THE TAKE safehouse record starts once, ducks under dialogue, and follows the crew into the bank low/);
  assert.match(verifier,
    /THE TAKE safehouse record tears down on the street/);
  assert.match(verifier,
    /THE TAKE escape score starts once, ducks under dialogue, and tears down at the final handoff/);
});
