import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/core/audio.js';

test('concurrent and repeated manifest loads share one immutable result', async () => {
  const audio = new AudioEngine();
  let calls = 0;
  let finish;
  audio._loadManifestOnce = () => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  };

  const first = audio.loadManifest();
  const concurrent = audio.loadManifest();
  assert.strictEqual(concurrent, first);
  assert.equal(calls, 1);

  finish({ total: 1457, loaded: 1276 });
  const result = await first;
  assert.deepEqual(result, { total: 1457, loaded: 1276 });
  assert.strictEqual(audio.loadManifest(), first);
  assert.equal(calls, 1);
});

test('a failed manifest load can be retried', async () => {
  const audio = new AudioEngine();
  let calls = 0;
  audio._loadManifestOnce = async () => {
    calls++;
    if (calls === 1) throw new Error('temporary read failure');
    return { total: 1, loaded: 1 };
  };

  await assert.rejects(audio.loadManifest(), /temporary read failure/);
  assert.deepEqual(await audio.loadManifest(), { total: 1, loaded: 1 });
  assert.equal(calls, 2);
});

test('sample loading is bounded instead of flooding the browser', async () => {
  const audio = new AudioEngine();
  let active = 0;
  let peak = 0;
  let loaded = 0;
  audio._loadOne = async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    loaded++;
  };

  await audio._loadWanted(Array.from({ length: 48 }, (_, i) => ({ name: `cue.${i}` })), 7);
  assert.equal(loaded, 48);
  assert.ok(peak > 1, `expected parallel work, observed ${peak}`);
  assert.ok(peak <= 7, `expected at most 7 concurrent loads, observed ${peak}`);
});
