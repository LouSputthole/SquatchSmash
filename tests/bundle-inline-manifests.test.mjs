import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFaceIndex } from '../src/bing/family.js';
import { prospectFaceUrl } from '../src/core/prospect-body.js';

test('bundled face consumers use the inline index without a CSP-blocked fetch', async () => {
  const priorInline = globalThis.__SQUATCH_INLINE;
  const priorFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.__SQUATCH_INLINE = {
    'assets/faces/index.json': { files: ['lag.png', 'prospect.png'] },
  };
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error('a bundled build cannot fetch');
  };

  try {
    assert.deepEqual([...await loadFaceIndex()], ['lag.png', 'prospect.png']);
    assert.equal(await prospectFaceUrl(), 'assets/faces/prospect.png');
    assert.equal(fetches, 0);
  } finally {
    if (priorInline === undefined) delete globalThis.__SQUATCH_INLINE;
    else globalThis.__SQUATCH_INLINE = priorInline;
    globalThis.fetch = priorFetch;
  }
});
