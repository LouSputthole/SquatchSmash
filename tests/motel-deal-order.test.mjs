/**
 * Room twelve does the deal in one order, and says so.
 *
 * The transaction is driven by `dealStepNow()`, which reads the flags and
 * names the step the room is on. The flags were set from eight different
 * places and only one of them was gated: `placeMoney` checked that the sample
 * had been looked at and never that their case of eight had been counted. So
 * check the sample, walk past the case, pay -- and the money went down with
 * the count still owed, the objective jumped BACKWARDS to "count their case of
 * eight" with cash already on the table, and then skipped 'pay' entirely on
 * its way to the latch.
 *
 * `src/motel/main.js` imports Three.js at module scope, so there is no
 * importable seam for the room's runtime. `dealStepNow()` is a pure function
 * of two things it closes over, so it is lifted out of the source and run for
 * real here; the gate around it, which is wired into an interaction, is
 * checked as authored text the same way the other Motel suites do it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { allMotelVoiceLines } from '../src/motel/voice-catalog.js';

const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');

/** Lift `dealStepNow()` out of the runtime and hand it its two closed-over values. */
function liftDealStep() {
  const start = source.indexOf('function dealStepNow() {');
  assert.ok(start >= 0, 'dealStepNow() has been renamed -- this suite needs updating');
  const end = source.indexOf('\n}', start);
  assert.ok(end > start);
  const body = source.slice(source.indexOf('{', start) + 1, end);
  const fn = new Function('S', 'phase', body);
  return (flags = {}) => fn({
    betrayed: false,
    sampleChecked: false,
    packagesCounted: false,
    moneyOnTable: false,
    moneyOpened: false,
    ...flags,
  }, flags.phase ?? 'room');
}

const dealStep = liftDealStep();

test('the deal names its steps in the authored order', () => {
  assert.equal(dealStep({}), 'sample');
  assert.equal(dealStep({ sampleChecked: true }), 'count');
  assert.equal(dealStep({ sampleChecked: true, packagesCounted: true }), 'pay');
  assert.equal(dealStep({ sampleChecked: true, packagesCounted: true, moneyOnTable: true }), 'open');
  assert.equal(
    dealStep({ sampleChecked: true, packagesCounted: true, moneyOnTable: true, moneyOpened: true }),
    'done',
  );
  assert.equal(dealStep({ phase: 'lot' }), null);
  assert.equal(dealStep({ betrayed: true, sampleChecked: true }), null);
});

test('paying with a step skipped never sends the objective backwards', () => {
  // The exact bug: sample checked, count skipped, money down.
  assert.equal(dealStep({ sampleChecked: true, moneyOnTable: true }), 'open',
    'the room cannot ask for a count it has already taken the money over');

  // And the same for the sample, which the room lets you skip on purpose.
  assert.equal(dealStep({ packagesCounted: true, moneyOnTable: true }), 'open');
  assert.equal(dealStep({ moneyOnTable: true }), 'open');
  assert.equal(dealStep({ moneyOnTable: true, moneyOpened: true }), 'done');
});

test('the deal step only ever moves forwards, whatever order the flags arrive in', () => {
  const ORDER = ['sample', 'count', 'pay', 'open', 'done'];
  const FLAGS = ['sampleChecked', 'packagesCounted', 'moneyOnTable', 'moneyOpened'];

  // Every reachable route through the four flags, in every order they can be set.
  const walk = (flags, remaining, lowest) => {
    for (const flag of remaining) {
      const next = { ...flags, [flag]: true };
      const rank = ORDER.indexOf(dealStep(next));
      assert.ok(rank >= lowest,
        `setting ${flag} on ${JSON.stringify(flags)} moved the deal back to ${dealStep(next)}`);
      walk(next, remaining.filter((id) => id !== flag), rank);
    }
  };
  walk({}, FLAGS, ORDER.indexOf(dealStep({})));
});

test('Rico refuses the money until their eight are counted, in his own voice', () => {
  const gate = source.slice(source.indexOf("id: 'placeMoney'"), source.indexOf("S.moneyOnTable = true;"));

  assert.match(gate, /!S\.packagesCounted/,
    'the payment gate must know about the count, not only the sample');
  assert.match(gate, /S\.countRefused = true;/,
    'the push-back happens once, exactly like the meat-first one above it');
  assert.match(gate, /sayThenInstruct\('Rico'/,
    'an in-character refusal, not a silent no-op');

  const refusal = gate.match(/sayThenInstruct\('Rico', '([^']+)'/g) ?? [];
  assert.ok(refusal.length >= 2, 'both push-backs are spoken');
});

test('every line the payment gate speaks is already a recorded Motel take', () => {
  const gate = source.slice(source.indexOf("id: 'placeMoney'"), source.indexOf("id: 'lamp'"));
  const authored = new Set(allMotelVoiceLines().map((line) => line.text));
  const spoken = [...gate.matchAll(/say(?:ThenInstruct)?\('(?:Rico|Chino|Prospect|Snow)', '((?:\\.|[^'\\])*)'/g)]
    .map((match) => match[1].replace(/\\'/g, "'"));

  assert.ok(spoken.length >= 3, `only ${spoken.length} spoken lines were found in the gate`);
  for (const text of spoken) {
    assert.ok(authored.has(text), `"${text}" has no recorded take`);
  }
});

test('a skipped count is struck off rather than left standing behind the money', () => {
  const paid = source.slice(source.indexOf('S.moneyOnTable = true;'), source.indexOf("id: 'lamp'"));
  assert.match(paid, /failObjective\('inspect'\)/);
  assert.match(paid, /failObjective\('count'\)/,
    'an uncounted case is a failed step, not a live instruction');
});
