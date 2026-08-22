/**
 * The browser gates cost real runner minutes, so they run on a schedule rather
 * than on every pull request — and a schedule built from a hand-written list is
 * exactly the arrangement that goes stale. `verify:campaign-marathon` failed at
 * step 25 for weeks because nothing ran it; the answer to that cannot itself be
 * a list nobody checks.
 *
 * So: every `verify:*` script whose tool imports Playwright must be in a tier in
 * tools/scene-gate-tiers.mjs or excluded from it with a stated reason. Add a
 * scene verifier and forget to price it and this test says so, at authoring
 * time, on the machine you are already sitting at.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EXCLUDED_GATES,
  SCENE_GATES,
  TIERS,
  auditGateCoverage,
  selectGates,
} from '../tools/scene-gate-tiers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const readToolSource = (tool) => {
  const file = path.join(ROOT, 'tools', tool);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

test('every browser verifier is priced into a tier or excluded with a reason', () => {
  const audit = auditGateCoverage(packageJson, readToolSource);
  assert.deepEqual(audit.missing, [],
    'these launch a browser and are on no schedule: add them to SCENE_GATES with the boots '
    + 'and driven simulated seconds you counted, or to EXCLUDED_GATES with why not');
  assert.deepEqual(audit.unknown, [],
    'these are scheduled but no longer exist as browser verify scripts');
  assert.deepEqual(audit.duplicated, [], 'a gate is in two places at once');
  assert.ok(audit.browser.length >= 40, `only ${audit.browser.length} browser gates found — `
    + 'the detector reads each tool for a Playwright import, so a change to how they launch '
    + 'would silently empty this whole schedule');
});

test('no exclusion is left standing without an argument for it', () => {
  for (const [script, why] of Object.entries(EXCLUDED_GATES)) {
    assert.ok(why.length > 40, `${script} is excluded without a real reason`);
  }
});

test('every gate names a known tier and carries the arithmetic that put it there', () => {
  for (const gate of SCENE_GATES) {
    assert.ok(TIERS[gate.tier], `${gate.script} is in unknown tier ${gate.tier}`);
    assert.equal(gate.minutes, TIERS[gate.tier].minutes);
    assert.ok(gate.why.length > 40, `${gate.script} has no stated cost reasoning`);
    /* The artifact upload names itself after the slug, and GitHub refuses a
     * colon in an artifact name. */
    assert.match(gate.slug, /^[a-z0-9-]+$/);
  }
});

test('the tiers are ordered by what they cost and none is empty', () => {
  const budgets = Object.values(TIERS).map((tier) => tier.minutes);
  assert.deepEqual(budgets, [...budgets].sort((a, b) => a - b));
  for (const tier of Object.keys(TIERS)) {
    assert.ok(SCENE_GATES.some((gate) => gate.tier === tier), `${tier} has no gates in it`);
  }
});

test('the workflow selects gates the same way for a schedule and for a hand-run', () => {
  assert.deepEqual(
    selectGates({ tiers: ['all'] }).map((gate) => gate.script),
    SCENE_GATES.map((gate) => gate.script),
  );
  assert.deepEqual(selectGates({ tiers: ['smoke', 'scene'] }).map((gate) => gate.tier).sort(),
    selectGates({ tiers: ['smoke', 'scene'] }).map((gate) => gate.tier).sort());
  assert.deepEqual(selectGates({ gates: ['verify:no-wake', 'golf'] }).map((gate) => gate.script),
    ['verify:no-wake', 'verify:golf']);
  assert.throws(() => selectGates({ tiers: ['quick'] }), /not a tier/);
  assert.throws(() => selectGates({ gates: ['verify:nothing'] }), /not a scheduled browser gate/);
});

test('the scheduled workflow runs the tiers this file declares', () => {
  const workflow = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'verify-scenes.yml'), 'utf8',
  );
  for (const tier of Object.keys(TIERS)) {
    assert.match(workflow, new RegExp(`\\b${tier}\\b`),
      `${tier} exists here and is named nowhere in verify-scenes.yml`);
  }
  assert.match(workflow, /tools\/scene-gate-tiers\.mjs/,
    'the workflow must build its matrix from this file rather than from a second copy');
});
