/**
 * THE FRAMING GATE CAN ONLY BLOCK IF ITS EXCUSES ARE A LIST.
 *
 * The gate reported five findings and exited zero, which is a gate whose next
 * finding lands in a log nobody reads. Three of the five went when the ray
 * started being tested against the circle the author wrote instead of its
 * circumscribing square; the last two are the parked cars, whose roofs sit at
 * 2.26 m under a collider band invented up to 4 m. Writing those two down is
 * what lets everything else fail the build.
 *
 * These hold the properties that make the instrument worth carrying, and they
 * are the staging allowlist's properties because it is deliberately the same
 * instrument:
 *
 *   - an entry names ONE finding on ONE beat in ONE state, so it cannot be
 *     vaguer than the fault it excuses;
 *   - it carries a reason somebody wrote, and a line of source to check;
 *   - no wildcards, because a wildcard is how a list stops being one;
 *   - an entry that matches nothing is an ERROR -- and per
 *     docs/ENGINE-TRAPS.md entry 10 that is a claim to go and measure, not a
 *     chore to tidy: forty-two mansion entries went stale at once because the
 *     gate had started eating the chairs.
 *
 * And the file that actually ships is checked here too, because an allowlist
 * that only validates in a fixture is a fixture.
 */

import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  ALLOWLIST_SCHEMA,
  MIN_REASON_CHARS,
  applyFramingAllowlist,
  unusedEntries,
  validateFramingAllowlist,
} from '../tools/framing-allowlist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REASON = 'The solid is a parked car whose roof is at 2.26 m under a collider band invented up to 4 m.';

const doc = (entries) => ({ $schema: ALLOWLIST_SCHEMA, entries });

const entry = (over = {}) => ({
  id: 'initiation-cabin-door-over-the-parked-car',
  state: 'initiation:cabin',
  beat: 'cabin-door',
  kind: 'SPEAKER_OCCLUDED',
  speaker: 'player',
  solid: 'aabb-18p9349-m0p5-13p4091-21p2849-4-15p7591',
  reason: REASON,
  source: 'src/initiation/cabin/execution-ground.js:251',
  ...over,
});

const finding = (over = {}) => ({
  kind: 'SPEAKER_OCCLUDED',
  beat: 'cabin-door',
  phase: 'cabin_door',
  camera: [17.303, 4.8, 13.003],
  speaker: 'player',
  solid: 'aabb-18p9349-m0p5-13p4091-21p2849-4-15p7591',
  ...over,
});

const issues = (document) => validateFramingAllowlist(document).issues;

/* ------------------------------------------------------------------ */
/* The document                                                       */
/* ------------------------------------------------------------------ */

test('a well-formed entry validates', () => {
  assert.deepEqual(issues(doc([entry()])), []);
});

test('an unknown schema is refused rather than guessed at', () => {
  const found = issues({ $schema: 'squatchsmash.staging-allowlist.v1', entries: [entry()] });
  assert.ok(found.some((issue) => issue.includes('schema')));
});

test('an entry cannot be vaguer than the fault it excuses', () => {
  // SPEAKER_OCCLUDED names a speaker and a solid. An entry that named only the
  // beat would go on excusing whatever that shot does next.
  const withoutSolid = entry();
  delete withoutSolid.solid;
  assert.ok(issues(doc([withoutSolid])).some((issue) => issue.includes('.solid is required')));
  const withoutSpeaker = entry();
  delete withoutSpeaker.speaker;
  assert.ok(issues(doc([withoutSpeaker])).some((issue) => issue.includes('.speaker is required')));
});

test('a kind this gate does not report is a mistake, not a wildcard', () => {
  assert.ok(issues(doc([entry({ kind: 'ACTOR_INSIDE_SOLID' })]))
    .some((issue) => issue.includes('is not a finding this gate reports')));
});

test('a wildcard is how a list stops being one', () => {
  for (const key of ['state', 'beat', 'speaker', 'solid']) {
    const found = issues(doc([entry({ [key]: '*' })]));
    assert.ok(found.some((issue) => issue.includes('wildcard')), `${key} accepted a wildcard`);
  }
});

test('a reason has to be a sentence, not a shrug', () => {
  const found = issues(doc([entry({ reason: 'known' })]));
  assert.ok(found.some((issue) => issue.includes(String(MIN_REASON_CHARS))));
});

test('ids are unique and sorted, so a diff reads', () => {
  const second = entry({ id: 'initiation-clearing-speech-start-inside-the-parked-car' });
  assert.deepEqual(issues(doc([entry(), second])), []);
  assert.ok(issues(doc([second, entry()])).some((issue) => issue.includes('must sort after')));
  assert.ok(issues(doc([entry(), entry()])).some((issue) => issue.includes('is used twice')));
});

test('an unknown key is refused, because a typo is a silent no-op', () => {
  assert.ok(issues(doc([entry({ note: 'a car' })])).some((issue) => issue.includes('unknown key')));
});

/* ------------------------------------------------------------------ */
/* Matching, and the ratchet                                          */
/* ------------------------------------------------------------------ */

test('an entry excuses its own finding and nothing else', () => {
  const entries = [entry()];
  const { kept, suppressed, used } = applyFramingAllowlist(
    [finding()], entries, 'initiation:cabin',
  );
  assert.deepEqual(kept, []);
  assert.equal(suppressed.length, 1);
  assert.deepEqual([...used], ['initiation-cabin-door-over-the-parked-car']);

  // A different solid on the same beat is a NEW fault and has to stand.
  assert.equal(
    applyFramingAllowlist([finding({ solid: 'cabin.wall' })], entries, 'initiation:cabin').kept.length,
    1,
  );
  // So is a different fault on the same beat.
  assert.equal(
    applyFramingAllowlist(
      [finding({ kind: 'SPEAKER_OFF_CAMERA' })], entries, 'initiation:cabin',
    ).kept.length,
    1,
  );
  // And the same fault in another state, which is another room entirely.
  assert.equal(
    applyFramingAllowlist([finding()], entries, 'initiation:clearing').kept.length,
    1,
  );
});

test('an entry that excused nothing this run is reported', () => {
  const entries = [entry()];
  assert.deepEqual(
    unusedEntries(entries, ['initiation:cabin'], new Set()),
    ['initiation-cabin-door-over-the-parked-car'],
  );
  assert.deepEqual(
    unusedEntries(entries, ['initiation:cabin'], new Set(['initiation-cabin-door-over-the-parked-car'])),
    [],
  );
});

test('a filtered run does not condemn the states it never built', () => {
  // `verify-framing specialmeeting` has not looked at Initiation and knows
  // nothing about it. Calling those entries stale would teach people to ignore
  // the ratchet, which is the same as not having one.
  assert.deepEqual(unusedEntries([entry()], ['specialmeeting:spur'], new Set()), []);
});

/* ------------------------------------------------------------------ */
/* The file that actually ships                                       */
/* ------------------------------------------------------------------ */

test('the shipped allowlist validates', () => {
  const shipped = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'tools', 'framing-allowlist.json'), 'utf8'),
  );
  const { entries, issues: found } = validateFramingAllowlist(shipped);
  assert.deepEqual(found, []);
  assert.ok(entries.length > 0, 'an empty allowlist should be deleted, not shipped');
});
