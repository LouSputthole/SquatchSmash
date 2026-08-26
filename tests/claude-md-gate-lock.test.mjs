import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE GATE LIST IN THE BRIEFING HAS TO BE THE GATE LIST IN CI.
 *
 * `npm test` is the Pages gate. Verify is thirty-odd separate checks, and a
 * green suite says nothing about any of them -- which is how ten commits once
 * shipped while `verify:campaign-marathon` died on step 19 of twenty-nine
 * every single time. Nobody was hiding it. It simply was not written down
 * anywhere a session reads first.
 *
 * So CLAUDE.md now lists them, and this file holds the list against
 * `.github/workflows/verify.yml`. A gate added to CI and not to the briefing
 * fails here, which is the only way a briefing stays true.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
const workflow = fs.readFileSync(
  path.join(ROOT, '.github/workflows/verify.yml'), 'utf8',
);

/**
 * Every `npm run <script>` the workflow actually executes.
 *
 * Comment lines are skipped on purpose: verify.yml documents its own reasoning
 * in a long comment header that names most of these scripts in prose, and
 * counting those would make this test pass on a workflow that runs nothing.
 */
function scriptsRunByVerify() {
  const found = new Set();
  for (const line of workflow.split('\n')) {
    const code = line.trim();
    if (code.startsWith('#')) continue;
    for (const match of code.matchAll(/npm run ([a-z0-9:_-]+)/g)) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}

/**
 * The sixteen per-scene cue ledgers are named as a family in the briefing
 * rather than one line each, because sixteen lines of `check:bing-vo` is how
 * a document stops being read. The family has to be named, and one member
 * has to be spelled out, so the pattern is discoverable.
 */
const FAMILY = /^check:[a-z-]+-(vo|sfx)$/;

test('CLAUDE.md names every gate the Verify workflow runs', () => {
  const scripts = scriptsRunByVerify();
  assert.ok(scripts.length >= 20,
    `only found ${scripts.length} scripts in verify.yml; the parser is wrong`);

  const missing = scripts.filter((script) => {
    if (claudeMd.includes(script)) return false;
    /* A family member counts as named if the family is. */
    return !(FAMILY.test(script) && claudeMd.includes('check:*-vo'));
  });
  assert.deepEqual(missing, [],
    'these Verify gates are not mentioned in CLAUDE.md, so a session will not run them');
});

test('the briefing says plainly that npm test is not the gate', () => {
  assert.ok(claudeMd.includes('`npm test` IS NOT THE GATE'),
    'the heading that stops somebody trusting a green suite is gone');
  assert.ok(claudeMd.includes('.github/workflows/verify.yml'),
    'CLAUDE.md must point at the workflow as the authority');
});

/**
 * The three browser gates are the forgettable ones: nothing about running
 * `npm test` locally hints that they exist, and two of them need Playwright.
 */
test('the three browser gates are called out by name', () => {
  for (const gate of [
    'verify:campaign-marathon',
    'verify:boot-failure-surfaces',
    'verify:framing',
  ]) {
    assert.ok(claudeMd.includes(gate), `CLAUDE.md lost the note about ${gate}`);
  }
  assert.ok(/marathon is the one that bites/i.test(claudeMd),
    'the marathon lost the emphasis it earned');
});

/**
 * The rule that made a second red gate invisible behind the first: everything
 * after a failing step never ran, so nothing about it was ever green.
 */
test('the briefing warns that a later gate hides behind an earlier failure', () => {
  assert.ok(claudeMd.includes('hides behind one that fails earlier'),
    'CLAUDE.md lost the note that a failing step masks every step after it');
});
