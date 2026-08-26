import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAMPAIGN_SPINE, CHAPTERS } from '../src/core/campaign-spine.js';

/**
 * CLAUDE.md IS THE THING EVERY SESSION READS FIRST.
 *
 * The owner asked for the spine to be locked in "so all sessions know it going
 * forward". A copy of the scene flow in a file nobody diffs is not locked in —
 * it is a second source of truth that starts out right and quietly goes wrong
 * the first time a beat moves.
 *
 * So this file holds the two together. `src/core/campaign-spine.js` stays the
 * data; CLAUDE.md has to keep agreeing with it, and it fails here the moment
 * it does not.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

test('CLAUDE.md exists and leads with the spine', () => {
  assert.ok(claudeMd.length > 2000, 'CLAUDE.md is too thin to be the briefing');
  assert.ok(claudeMd.includes('THE CAMPAIGN SPINE'),
    'the spine section is missing — that is the thing sessions need most');
  assert.ok(claudeMd.includes('docs/CAMPAIGN-STORY-BIBLE.md'),
    'CLAUDE.md must point at the bible rather than replace it');
  assert.ok(claudeMd.includes('src/core/campaign-spine.js'),
    'CLAUDE.md must point at the spine data');
});

test('every beat in the spine appears in CLAUDE.md, by number', () => {
  const missing = CAMPAIGN_SPINE.filter((beat) => {
    const number = String(beat.n).replace('.', '\\.');
    return !new RegExp(`^\\s*${number}\\s+\\S`, 'm').test(claudeMd);
  });
  assert.deepEqual(missing.map((beat) => `${beat.n} ${beat.id}`), [],
    'CLAUDE.md has fallen behind the spine');
});

test('the beats are listed in CLAUDE.md in the order they are played', () => {
  const positions = CAMPAIGN_SPINE.map((beat) => {
    const number = String(beat.n).replace('.', '\\.');
    const match = new RegExp(`^\\s*${number}\\s+\\S`, 'm').exec(claudeMd);
    return { id: beat.id, at: match ? match.index : -1 };
  });
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i].at > positions[i - 1].at,
      `CLAUDE.md lists ${positions[i].id} before ${positions[i - 1].id}`);
  }
});

test('every chapter is named in CLAUDE.md', () => {
  for (const chapter of CHAPTERS) {
    assert.ok(claudeMd.toUpperCase().includes(chapter.title.toUpperCase()),
      `chapter "${chapter.title}" is missing from CLAUDE.md`);
  }
});

/**
 * The rules that cost real time to learn. Each of these is a trap somebody
 * already fell into; losing one from the briefing means paying for it twice.
 */
test('CLAUDE.md still carries the traps', () => {
  const required = [
    ['transition() is a whitelist', 'whitelist that throws'],
    ['advanceTime clamps forward', 'Math.max(now, atLeast)'],
    ['the ledger is exact-once', 'exact-once by id'],
    ['events keys need a migration', 'structurallyBroken'],
    ['the geometry gate renumbers', 'renumbers every anonymous mesh'],
    ['headless raycasts need matrices', 'matrixWorld'],
    ['a ray misses a box it starts in', 'invisible to a ray that starts inside'],
    ['debugUse casts no ray', 'casts no ray'],
  ];
  for (const [what, needle] of required) {
    assert.ok(claudeMd.includes(needle), `CLAUDE.md lost the note that ${what}`);
  }
});

test('the settled story rules survive', () => {
  const rules = [
    ['one cabin in Act One', 'One cabin, in Act One'],
    ['Mark is unnamed until the boss fight', 'not named until his boss fight'],
    ['Sauce is the rat', 'Sauce is the one who ratted'],
    ['Enola bombs the wrong city', 'bombs the wrong city'],
    ['the starter flat goes dark', 'STARTER FLAT GOES DARK'],
  ];
  for (const [what, needle] of rules) {
    assert.ok(claudeMd.includes(needle), `CLAUDE.md lost the rule that ${what}`);
  }
});
