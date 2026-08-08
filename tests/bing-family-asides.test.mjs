/**
 * The Family have a second thing to talk about.
 *
 * A two-beat hangout is a line delivery: you press a key, somebody says a
 * thing at you, and you walk away. Eric always had a second branch — the
 * shawarma — and it is the reason he reads as a person on that floor rather
 * than a speaker. This gives the rest of them the same: one more topic each,
 * on its own branch off the opening line, so the first visit to the Bing is a
 * room you can stand around in.
 *
 * The branch is deliberately a dead end. It holds and ends rather than
 * rejoining the main thread, so the club's persist/resume bookmark still has
 * exactly one position per member to remember.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import { buildFamilyScripts } from '../src/bing/family.js';

const scripts = buildFamilyScripts({});

/** Members who gained a second topic in this pass, plus Eric who always had one. */
const EXPANDED = [
  CHARACTER_IDS.LAG, CHARACTER_IDS.GRATIN, CHARACTER_IDS.DEATHMEGATRON,
  CHARACTER_IDS.HOG_MAMA, CHARACTER_IDS.RIPPINFLOW, CHARACTER_IDS.SEFF,
  CHARACTER_IDS.OLD_STOVE, CHARACTER_IDS.SNOW, CHARACTER_IDS.NUMBSKULL,
  CHARACTER_IDS.APE, CHARACTER_IDS.SHUBENATOR, CHARACTER_IDS.WILLY,
];

const valueOf = (v) => (typeof v === 'function' ? v() : v);

test('every expanded member offers a second topic off their opening line', () => {
  for (const id of EXPANDED) {
    const tree = scripts[id];
    assert.ok(tree, `${id} has no hangout at all`);
    const options = valueOf(tree.open.options) || [];
    /* Ape's second topic is a follow-up to the words "load-bearing" in his
     * second main-thread line. Offering it before he has said those words was
     * the playtest bug; everybody else's aside still belongs on the opener. */
    const branchOwner = id === CHARACTER_IDS.APE ? tree.more : tree.open;
    const branch = (valueOf(branchOwner.options) || [])
      .find((option) => option.next === 'aside');
    assert.ok(branch, `${id} has nothing to ask about besides the first thing`);
    // Numbskull's is "Ow?", which is the correct length for Numbskull.
    assert.ok(branch.text && branch.text.trim().length > 1, `${id}'s second topic has no question`);
    assert.ok(branch.tone, `${id}'s second topic has no tone label for the wheel`);
  }
});

test('each second topic is two beats, not one', () => {
  for (const id of EXPANDED) {
    const tree = scripts[id];
    assert.ok(tree.aside?.line, `${id} opens a branch with nothing in it`);
    assert.equal(tree.aside.next, 'asideMore', `${id}'s branch does not continue`);
    assert.ok(tree.asideMore?.line, `${id}'s branch has no second beat`);
    for (const node of [tree.aside, tree.asideMore]) {
      assert.ok(valueOf(node.line).length > 20, `${id} says almost nothing on the branch`);
      assert.ok(node.hold > 0, `${id}'s branch beat has no hold, so it will be cut off`);
    }
  }
});

test('the branch ends rather than rejoining, so resume still has one position', () => {
  for (const id of EXPANDED) {
    const tree = scripts[id];
    assert.equal(tree.asideMore.next, undefined, `${id}'s branch loops back into the thread`);
    assert.equal(tree.asideMore.options, undefined, `${id}'s branch does not end`);
  }
});

test('leaving is still always on the table', () => {
  /* Every walk-up has to be walkable-away-from on the first press; a member
   * who can only be answered is a member who traps the player. */
  for (const id of EXPANDED) {
    const owner = id === CHARACTER_IDS.APE ? scripts[id].more : scripts[id].open;
    const options = valueOf(owner.options) || [];
    assert.ok(options.some((option) => option.next === null),
      `${id} cannot be left on the opening line`);
  }
});

test('the main thread is untouched by the addition', () => {
  for (const id of EXPANDED) {
    const tree = scripts[id];
    const options = valueOf(tree.open.options) || [];
    assert.ok(options.some((option) => option.next === 'more'),
      `${id} lost the original reply`);
    assert.ok(tree.more?.line, `${id} lost the original second beat`);
  }
});

test('Ape only offers the load-bearing follow-up after he has said load-bearing', () => {
  const ape = scripts[CHARACTER_IDS.APE];
  const opening = valueOf(ape.open.options) || [];
  const followUp = valueOf(ape.more.options) || [];

  assert.equal(opening.some((option) => /load-bearing/i.test(option.text)), false,
    'the player can ask about words Ape has not said yet');
  assert.ok(followUp.some((option) => option.next === 'aside'
    && /load-bearing/i.test(option.text)),
  'the follow-up disappeared instead of moving behind Ape\'s first reply');
});

test('the hand-named hangout cues are still the ones the verifier expects', () => {
  /* `vo.bing.hang.<slug>.1/.2` predate the generator and tools/verify-bing.mjs
   * asserts that exact list. The new branches must not have been given
   * hand-named cues of their own — they go through applyBingVoiceCues so
   * npm run vo:bing can find them. */
  for (const id of EXPANDED) {
    const tree = scripts[id];
    assert.match(String(valueOf(tree.open.cue)), /^vo\.bing\.hang\./,
      `${id}'s opening line lost its authored cue`);
    /* The branch's cue must be a generated one. `applyBingVoiceCues` mints
     * `vo.bing.full.<scope>.<node>.<hash>` from the words, so the node id
     * legitimately appears inside it — the thing being asserted is the
     * `vo.bing.full.` prefix, which is what npm run vo:bing harvests. */
    const asideCue = String(valueOf(tree.aside.cue) ?? '');
    assert.match(asideCue, /^vo\.bing\.full\./,
      `${id}'s branch carries a hand-named cue no generator will write`);
  }
});

test('Eric keeps the branch he always had', () => {
  const eric = scripts[CHARACTER_IDS.ERIC];
  const options = valueOf(eric.open.options) || [];
  assert.ok(options.some((option) => option.next === 'shawarma'));
  assert.ok(eric.shawarma?.line);
  assert.ok(eric.shawarmaMore?.line);
});

test('Booskibro and Irish keep their special openings', () => {
  /* Booski carries the shot beat and Irish the hundred dollars; neither is an
   * ordinary hangout and neither should have been flattened into one. */
  assert.ok(scripts[CHARACTER_IDS.BOOSKI].offer, 'Booski lost the shot offer');
  assert.ok(scripts[CHARACTER_IDS.BOOSKI].yell, 'Booski lost the yell');
  assert.ok(scripts[CHARACTER_IDS.IRISH].gift, 'Irish lost the hundred dollars');
  assert.ok(scripts.booskiShot?.handoff, 'the shot delivery beat is gone');
});
