/**
 * SM-260 — the chain, held to its stage direction.
 *
 * The beat's own text: Lag gets out without being asked, unhooks the chain,
 * the car goes through, Lag hooks it back up BEHIND them, and nobody says one
 * word about any of it. `chain-business.js` is that performance as a clock;
 * this file proves the clock keeps the script's order, that the car can never
 * leave without the man who opened the gate for it, and that the ride-side
 * half (SM-260 as a timed silence) resolves itself for a player who never
 * spots the optional question — the exact shape of the owner's 2026-09-09
 * "people think the game broke" report.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAIN_BUSINESS_PHASES,
  CHAIN_BUSINESS_TIMING,
  CHAIN_REHOOKED_MILESTONE,
  createChainBusiness,
} from '../src/specialmeeting/chain-business.js';
import { beat } from '../src/specialmeeting/script.js';
import { createRideSequence } from '../src/specialmeeting/ride.js';

/** Drive a business with a recorder on every effect. */
function record() {
  const events = [];
  const business = createChainBusiness({
    onDoor: (open) => events.push(open ? 'door.open' : 'door.close'),
    onLagOut: () => events.push('lag.out'),
    onLagMove: (t, leg) => {
      const tag = `walk.${leg}`;
      if (events[events.length - 1] !== tag) events.push(tag);
    },
    onLagIn: () => events.push('lag.in'),
    onChainOpen: () => events.push('chain.open'),
    onChainClosed: () => events.push('chain.closed'),
    onCreep: () => events.push('car.creep'),
    onMilestone: (id) => events.push(`milestone.${id}`),
    onDepart: () => events.push('car.depart'),
  });
  return { business, events };
}

function tick(business, seconds, dt = 0.1) {
  for (let t = 0; t < seconds; t += dt) business.update(dt);
}

test('the business performs the stage direction in the authored order', () => {
  const { business, events } = record();
  business.begin();
  tick(business, 10);
  assert.equal(business.phase, 'through', 'the gap stays open until the car reports its tail clear');
  business.carCleared();
  tick(business, 4);
  assert.equal(business.phase, 'waiting', 'with the story not yet at SM-260, Lag waits at the gate');
  business.storyAtChain();
  tick(business, 8);
  assert.equal(business.phase, 'aboard');
  business.requestDepart();
  assert.deepEqual(events, [
    'door.open', 'lag.out', 'walk.to_gate', 'chain.open', 'car.creep',
    'chain.closed', `milestone.${CHAIN_REHOOKED_MILESTONE}`,
    'walk.back', 'lag.in', 'door.close', 'car.depart',
  ]);
  assert.equal(business.phase, 'done');
});

test('the car can never pull away without Lag, however early the ride releases', () => {
  const { business, events } = record();
  business.begin();
  /* SM-270 arrives while he is still walking to the gate. */
  tick(business, CHAIN_BUSINESS_TIMING.settle + CHAIN_BUSINESS_TIMING.door + 1);
  business.requestDepart();
  assert.ok(!events.includes('car.depart'), 'a release mid-walk is deferred, not obeyed');
  tick(business, 10);
  business.carCleared();
  tick(business, 10);
  assert.equal(business.phase, 'done');
  assert.ok(events.indexOf('car.depart') > events.indexOf('lag.in'),
    'the car goes only after he is back in his seat');
  assert.ok(events.indexOf('lag.in') > events.indexOf('chain.closed'),
    'and he boards only after the chain is up behind them');
});

test('a business that never began still honours the release', () => {
  /* A restored spur save marks the chain node fired without replaying it;
   * SM-270 on such a route must still free the road immediately. */
  const { business, events } = record();
  business.requestDepart();
  assert.deepEqual(events, ['car.depart']);
  assert.equal(business.phase, 'done');
});

test('a story already at the chain skips the wait at the gate', () => {
  const { business } = record();
  business.begin();
  business.storyAtChain();
  tick(business, 10);
  business.carCleared();
  tick(business, CHAIN_BUSINESS_TIMING.rehook + 0.3);
  assert.equal(business.phase, 'back', 'straight from the rehook to the walk back');
});

test('every phase the machine can enter is a declared one', () => {
  const { business } = record();
  const seen = new Set([business.phase]);
  business.begin();
  for (let i = 0; i < 200; i += 1) {
    business.update(0.1);
    seen.add(business.phase);
    if (i === 60) business.carCleared();
    if (i === 90) business.storyAtChain();
    if (i === 150) business.requestDepart();
  }
  for (const phase of seen) {
    assert.ok(CHAIN_BUSINESS_PHASES.includes(phase), `undeclared phase: ${phase}`);
  }
});

/* ====================================================================== *
 * The ride-side half: SM-260 must resolve itself.
 * ====================================================================== */

test('SM-260 is a timed silence whose unbroken answer is the silent option', () => {
  const chain = beat('SM-260');
  assert.equal(chain.kind, 'silence',
    'a choice has no clock, and an unnoticed choice at a parked car reads as a hang');
  assert.ok(chain.holdSeconds > 0 && chain.holdSeconds <= 22,
    'held long enough to ask, never as long as the LONG SILENCE itself');
  assert.ok(chain.options.some((option) => option.silent && option.to === 'SM-270'),
    'the timeout must have the authored nothing-said branch to take');
});

test('a player who never touches the chain question still gets the road back', () => {
  const releases = [];
  const seq = createRideSequence({
    onBeat: (b, previous) => releases.push([b.id, previous?.id ?? null]),
  });
  seq.begin('SM-260');
  /* The stage direction plays, the options open, and nobody presses anything
   * for the full authored hold. */
  for (let t = 0; t < beat('SM-260').holdSeconds + 1.2; t += 0.1) seq.update(0.1);
  assert.equal(seq.beatId, 'SM-270',
    'the silence resolves to SM-270 — the beat main.js releases the car on');
});
