/**
 * Every test file has to actually run.
 *
 * `tests/run.mjs` is a hand-maintained list, not a glob -- deliberately, so the
 * order is controlled and the shared THREE/DOM shims are installed before any
 * scene module is imported. The cost of that choice is that a new test file is
 * inert until somebody remembers to add a line to it, and an inert test looks
 * exactly like a passing one: `npm test` goes green, the count goes up by
 * nothing, and the guarantee the file was written to provide silently does not
 * exist.
 *
 * Eight files had drifted out of the list when this was written, including two
 * added the same day and six older ones covering the palace finale and retry,
 * the interceptor profiles, the heist combat adapter and a silvercase
 * checkpoint. All of them passed. None of them had been running.
 *
 * So: the list stays hand-maintained, and this makes forgetting it loud.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, 'run.mjs');

/** Every `*.test.mjs` sitting in tests/, which is what npm test should cover. */
function testFiles() {
  return fs.readdirSync(HERE)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort();
}

/** The module specifiers the runner actually imports. */
function registered() {
  const source = fs.readFileSync(RUNNER, 'utf8');
  const list = source.match(/const TEST_MODULES = \[([\s\S]*?)\n\];/);
  assert.ok(list, 'tests/run.mjs no longer has a TEST_MODULES array to read');
  return new Set([...list[1].matchAll(/'\.\/([^']+\.test\.mjs)'/g)].map((m) => m[1]));
}

test('every test file in tests/ is registered in run.mjs', () => {
  const listed = registered();
  const missing = testFiles().filter((name) => !listed.has(name));
  assert.deepEqual(missing, [],
    'these test files exist but never run under `npm test` — add them to TEST_MODULES '
    + 'in tests/run.mjs');
});

test('run.mjs does not list a test file that has been deleted', () => {
  const present = new Set(testFiles());
  const stale = [...registered()].filter((name) => !present.has(name)).sort();
  assert.deepEqual(stale, [],
    'TEST_MODULES names files that are not in tests/ — the run would fail to import them');
});

test('no test file is registered twice', () => {
  const source = fs.readFileSync(RUNNER, 'utf8');
  const names = [...source.matchAll(/'\.\/([^']+\.test\.mjs)'/g)].map((m) => m[1]);
  const seen = new Set();
  const duplicated = names.filter((name) => (seen.has(name) ? true : (seen.add(name), false)));
  assert.deepEqual(duplicated, [], 'a test file is listed more than once in TEST_MODULES');
});

test('this test is itself registered, or it proves nothing', () => {
  assert.ok(registered().has('test-registry.test.mjs'),
    'the registry guard is not in TEST_MODULES, so it is not running either');
});
