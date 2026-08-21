/**
 * AN ALLOWLIST IS A LIST, NOT A SWITCH.
 *
 * The staging gate's output is mostly correct and mostly ignorable -- a man in
 * a booth is inside the booth, two dancers in a hot tub are inside the tub --
 * and a gate nobody reads is a gate that is not running. The instrument for
 * that is the one the geometry gate already carries, and these hold the
 * properties that make it worth carrying:
 *
 *   - every suppression names ONE finding in ONE state, so it cannot be
 *     vaguer than the fault it excuses;
 *   - every suppression carries a reason somebody wrote;
 *   - no wildcards, ever, because a wildcard is how a list stops being one;
 *   - an entry that matches nothing is an ERROR. That is the ratchet: it means
 *     the defect was fixed, and permission has to be handed back.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_REASON_CHARS,
  applyStagingAllowlist,
  unusedEntries,
  validateStagingAllowlist,
} from '../tools/staging-allowlist.mjs';

const REASON = 'Two dancers share one hot tub, which is a single solid box; you cannot sit in a tub without being inside it.';

const doc = (entries) => ({
  $schema: 'squatchsmash.staging-allowlist.v1',
  scene: 'bing',
  entries,
});

const entry = (over = {}) => ({
  id: 'bing-tub-001',
  state: 'visit-one',
  kind: 'ACTOR_INSIDE_SOLID',
  actor: 'dancer-1',
  solid: 'club.hot-tub',
  reason: REASON,
  source: 'src/bing/club.js:412',
  ...over,
});

const finding = (over = {}) => ({
  kind: 'ACTOR_INSIDE_SOLID', id: 'dancer-1', solid: 'club.hot-tub', role: 'bystander', ...over,
});

test('a well-formed allowlist validates', () => {
  const { issues } = validateStagingAllowlist(doc([entry()]), { scene: 'bing' });
  assert.deepEqual(issues, []);
});

test('the schema and the scene have to agree with where the file lives', () => {
  const wrong = validateStagingAllowlist({ ...doc([]), $schema: 'something.else' }, { scene: 'bing' });
  assert.ok(wrong.issues.some((i) => /schema/.test(i)));
  const misfiled = validateStagingAllowlist(doc([]), { scene: 'mansion' });
  assert.ok(misfiled.issues.some((i) => /lives under/.test(i)));
});

test('a reason has to be a sentence, not a shrug', () => {
  const { issues } = validateStagingAllowlist(doc([entry({ reason: 'known' })]), { scene: 'bing' });
  assert.ok(issues.some((i) => i.includes(`${MIN_REASON_CHARS} characters`)));
});

test('NO WILDCARDS, in any subject', () => {
  for (const key of ['actor', 'solid']) {
    const { issues } = validateStagingAllowlist(doc([entry({ [key]: 'club.*' })]), { scene: 'bing' });
    assert.ok(issues.some((i) => i.includes('wildcard')), `${key} must refuse a wildcard`);
  }
});

test('ids are unique and sorted, so a diff reads', () => {
  const twice = validateStagingAllowlist(doc([entry(), entry()]), { scene: 'bing' });
  assert.ok(twice.issues.some((i) => /used twice/.test(i)));
  const backwards = validateStagingAllowlist(
    doc([entry({ id: 'bing-z' }), entry({ id: 'bing-a' })]), { scene: 'bing' },
  );
  assert.ok(backwards.issues.some((i) => /must sort after/.test(i)));
});

test('an entry cannot be vaguer than the finding it excuses', () => {
  const noSolid = validateStagingAllowlist(doc([{ ...entry(), solid: undefined }]), { scene: 'bing' });
  assert.ok(noSolid.issues.some((i) => /solid is required/.test(i)));

  const uniform = validateStagingAllowlist(doc([entry({
    id: 'bing-queue-001', kind: 'FACING_UNIFORM', actor: undefined, solid: undefined, cohort: ['a'],
  })]), { scene: 'bing' });
  assert.ok(uniform.issues.some((i) => /cohort must name/.test(i)));
});

test('a kind the gate does not report is refused', () => {
  const { issues } = validateStagingAllowlist(doc([entry({ kind: 'VIBES_OFF' })]), { scene: 'bing' });
  assert.ok(issues.some((i) => /not a finding this gate reports/.test(i)));
});

test('an entry suppresses exactly its own finding and nothing else', () => {
  const entries = [entry()];
  const findings = [finding(), finding({ id: 'dancer-2' }), finding({ solid: 'club.wall' })];
  const { kept, suppressed } = applyStagingAllowlist(findings, entries, 'visit-one');
  assert.equal(suppressed.length, 1);
  assert.equal(suppressed[0].entryId, 'bing-tub-001');
  assert.equal(kept.length, 2, 'the other dancer and the wall still stand');
});

test('and not in a state it does not name', () => {
  const { kept, suppressed } = applyStagingAllowlist([finding()], [entry()], 'performer-bathroom');
  assert.equal(suppressed.length, 0);
  assert.equal(kept.length, 1);
});

test('a cohort matches regardless of the order it is reported in', () => {
  const entries = [entry({
    id: 'bing-queue-001', kind: 'FACING_UNIFORM', actor: undefined, solid: undefined,
    cohort: ['b', 'a', 'c'],
  })];
  const { suppressed } = applyStagingAllowlist(
    [{ kind: 'FACING_UNIFORM', id: 'a', cohort: ['a', 'b', 'c'] }], entries, 'visit-one',
  );
  assert.equal(suppressed.length, 1);
});

test('a cohort that has changed size is NOT excused by the old entry', () => {
  /* Somebody joined the rank. That is a new fault and wants a new look. */
  const entries = [entry({
    id: 'bing-queue-001', kind: 'FACING_UNIFORM', actor: undefined, solid: undefined,
    cohort: ['a', 'b', 'c'],
  })];
  const { kept } = applyStagingAllowlist(
    [{ kind: 'FACING_UNIFORM', id: 'a', cohort: ['a', 'b', 'c', 'd'] }], entries, 'visit-one',
  );
  assert.equal(kept.length, 1);
});

test('THE RATCHET: an entry that matched nothing is reported', () => {
  const entries = [entry(), entry({ id: 'bing-tub-002', actor: 'dancer-9' })];
  const { used } = applyStagingAllowlist([finding()], entries, 'visit-one');
  const stale = unusedEntries(entries, ['visit-one'], used);
  assert.deepEqual(stale, ['bing-tub-002'], 'the defect it excused is gone; so should it be');
});

test('an entry for a state this run did not build is not called stale', () => {
  const entries = [entry({ id: 'bing-other-001', state: 'performer-bathroom' })];
  const stale = unusedEntries(entries, ['visit-one'], new Set());
  assert.deepEqual(stale, [], 'only judge what was actually run');
});
