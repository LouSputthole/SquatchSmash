import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOnceRetriable, runWorkerPool } from '../src/core/load-queue.js';

test('concurrent and repeated manifest loads share one immutable result', async () => {
  const owner = { pending: null };
  let calls = 0;
  let finish;
  const loader = () => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  };
  const load = () => loadOnceRetriable(owner, 'pending', loader);

  const first = load();
  const concurrent = load();
  assert.strictEqual(concurrent, first);
  assert.equal(calls, 1);

  finish({ total: 1457, loaded: 1276 });
  const result = await first;
  assert.deepEqual(result, { total: 1457, loaded: 1276 });
  assert.strictEqual(load(), first);
  assert.equal(calls, 1);
});

test('a failed manifest load can be retried', async () => {
  const owner = { pending: null };
  let calls = 0;
  const loader = async () => {
    calls++;
    if (calls === 1) throw new Error('temporary read failure');
    return { total: 1, loaded: 1 };
  };
  const load = () => loadOnceRetriable(owner, 'pending', loader);

  await assert.rejects(load(), /temporary read failure/);
  assert.deepEqual(await load(), { total: 1, loaded: 1 });
  assert.equal(calls, 2);
});

test('sample loading is bounded instead of flooding the browser', async () => {
  let active = 0;
  let peak = 0;
  let loaded = 0;
  const loadOne = async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    loaded++;
  };

  await runWorkerPool(Array.from({ length: 48 }, (_, i) => ({ name: `cue.${i}` })), loadOne, 7);
  assert.equal(loaded, 48);
  assert.ok(peak > 1, `expected parallel work, observed ${peak}`);
  assert.ok(peak <= 7, `expected at most 7 concurrent loads, observed ${peak}`);
});
