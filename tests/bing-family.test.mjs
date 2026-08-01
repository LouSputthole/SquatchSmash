import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFamilyScripts } from '../src/bing/family.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';

test('Ericran keeps the stable Eric id and has the nearby shawarma conversation', () => {
  const scripts = buildFamilyScripts();
  const ericran = scripts[CHARACTER_IDS.ERIC];

  assert.equal(ericran.open.who, 'Ericran');
  assert.equal(ericran.shawarma.who, 'Ericran');
  assert.equal(ericran.shawarma.cue, 'vo.bing.hang.eric.shawarma.1');
  assert.match(ericran.shawarma.line, /chicken shawarma nearby/i);
  assert.equal(ericran.shawarma.next, 'shawarmaMore');
  assert.equal(ericran.shawarmaMore.cue, 'vo.bing.hang.eric.shawarma.2');
});

test('Irish grants the first-talk cash once and then continues into his regular story', () => {
  let gifted = false;
  let grants = 0;
  const scripts = buildFamilyScripts({
    irishGifted: () => gifted,
    grantIrishGift: () => {
      gifted = true;
      grants += 1;
      return true;
    },
  });
  const irish = scripts[CHARACTER_IDS.IRISH];

  assert.equal(irish.gift.cue, 'vo.bing.hang.irish.gift.1');
  assert.equal(irish.giftReason.cue, 'vo.bing.hang.irish.gift.2');
  assert.equal(irish.giftReason.next, 'open');
  assert.match(irish.gift.line, /one hundred dollars/i);

  irish.gift.enter();
  irish.gift.enter();
  assert.equal(grants, 1);
  assert.equal(gifted, true);
  assert.equal(irish.open.who, 'Irish');
});
