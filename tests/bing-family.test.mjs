import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFamilyScripts } from '../src/bing/family.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import {
  SHUBENATOR_SIGNATURE_TAKES,
  SHUBENATOR_SIGNATURE_TEXT,
} from '../src/core/shubenator-signature.js';

test('Eric keeps the stable character id and has the nearby shawarma conversation', () => {
  const scripts = buildFamilyScripts();
  const eric = scripts[CHARACTER_IDS.ERIC];

  assert.equal(eric.open.who, 'Eric');
  assert.equal(eric.shawarma.who, 'Eric');
  assert.equal(eric.shawarma.cue, 'vo.bing.hang.eric.shawarma.1');
  assert.match(eric.shawarma.line, /chicken shawarma nearby/i);
  assert.equal(eric.shawarma.next, 'shawarmaMore');
  assert.equal(eric.shawarmaMore.cue, 'vo.bing.hang.eric.shawarma.2');
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

test('Shubenator opens his first meeting with the cheerful signature without losing his hangout', () => {
  const shubenator = buildFamilyScripts()[CHARACTER_IDS.SHUBENATOR];

  assert.equal(shubenator.signatureCheerful.line, SHUBENATOR_SIGNATURE_TEXT);
  assert.equal(shubenator.signatureCheerful.cue, SHUBENATOR_SIGNATURE_TAKES.firstMeeting.cue);
  assert.equal(shubenator.signatureCheerful.direction, SHUBENATOR_SIGNATURE_TAKES.firstMeeting.direction);
  assert.equal(shubenator.signatureCheerful.next, 'open');
  assert.equal(shubenator.open.cue, 'vo.bing.hang.shubenator.1');
  assert.match(shubenator.open.line, /nine hundred push-ups/i);
  assert.equal(shubenator.more.cue, 'vo.bing.hang.shubenator.2');
});

test('Shubenator does not offer the same floor question twice', () => {
  const shubenator = buildFamilyScripts()[CHARACTER_IDS.SHUBENATOR];
  const options = shubenator.open.options;
  const copy = options.map((option) => option.text.trim().toLocaleLowerCase('en-US'));

  assert.equal(new Set(copy).size, copy.length, 'the option wheel contains duplicate copy');
  assert.equal(copy.filter((text) => text === 'what did the floor do?').length, 1);
});

test('the campaign owns three separately directed recordings of the same signature wording', () => {
  const takes = Object.values(SHUBENATOR_SIGNATURE_TAKES);

  assert.equal(takes.length, 3);
  assert.equal(new Set(takes.map((take) => take.cue)).size, 3);
  assert.equal(new Set(takes.map((take) => take.direction)).size, 3);
  assert.deepEqual(takes.map((take) => take.text), Array(3).fill(SHUBENATOR_SIGNATURE_TEXT));
});
