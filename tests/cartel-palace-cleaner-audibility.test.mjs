/**
 * A VOICE COMES OUT OF A MOUTH, AND A MOUTH IS WHERE THE POSE PUTS IT.
 *
 * Owner, 2026-08-24, on the Cartel Palace: *"Rosa apparently delivers her
 * lines, but the player cannot see her... it feels like enemies die and then a
 * disembodied cleaner starts talking."*
 *
 * She was never disembodied. `PalaceVoice.audible()` traces from the player's
 * eye to the speaker's mouth and refuses a line that is blocked -- the rule the
 * scene is built on, and a good one. But the mouth was a flat 1.45 metres above
 * the speaker's feet for everybody in the building, including a woman lying
 * face down on the floor behind the entry bench. The ray went over the bench,
 * through clear air, and reported her audible from anywhere in the hall while
 * she was completely out of sight.
 *
 * So the fix is not a new gate, it is the existing gate being told the truth
 * about where she is. This file holds that: a prone speaker behind waist-high
 * cover is inaudible, the same speaker standing is audible, and the geometry
 * that decides it is the cover's real height.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  KNEELING_MOUTH_Y, PRONE_MOUTH_Y, PalaceVoice,
} from '../src/cartel-palace/voice.js';

/**
 * A hall with one waist-high bench in it.
 *
 * `trace` returns a truthy hit when the segment crosses the bench's slab, and
 * null when it does not -- the same contract `PalaceVoice` expects from the
 * scene. The bench is 0.9 m tall, which is a bench.
 */
function hallWithABench({ top = 0.9 } = {}) {
  const bench = { x0: 11.2, x1: 12.4, z0: -5.6, z1: -4.4, y0: 0, y1: top };
  return (from, to) => {
    /* Sample the segment. Crude on purpose: the production tracer is the
     * scene's, and what this file is testing is the ENDPOINT, not the tracer. */
    for (let i = 0; i <= 64; i += 1) {
      const t = i / 64;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      if (x >= bench.x0 && x <= bench.x1 && z >= bench.z0 && z <= bench.z1
        && y >= bench.y0 && y <= bench.y1) return { hit: true };
    }
    return null;
  };
}

function voiceWithPlayerAt(x, z, trace) {
  const voice = new PalaceVoice({
    player: { position: { x, y: 1.6, z, distanceTo: (p) => Math.hypot(p.x - x, p.z - z) } },
    trace,
    vector: (vx, vy, vz) => ({ x: vx, y: vy, z: vz }),
  });
  return voice;
}

/* She cowers here, on the far side of the bench from the door. */
const ROSA = { x: 11.7, y: 0, z: -6.9 };
/* He comes in through the entry door and stops short of the bench. */
const DOORWAY = { x: 11.8, z: -2.2 };

test('a woman lying behind a bench is not heard through it', () => {
  const voice = voiceWithPlayerAt(DOORWAY.x, DOORWAY.z, hallWithABench());
  assert.equal(
    voice.audible(ROSA, 12, PRONE_MOUTH_Y), false,
    'a prone speaker behind waist-high cover is audible: the ray is going over '
    + 'the thing she is hiding behind, which is the "disembodied cleaner" bug',
  );
});

test('the same ray at a standing mouth clears the bench, which is why this was missed', () => {
  /* Not a wish -- a record. This is the OLD behaviour, and it is exactly why
   * the fault survived every gate: at 1.45 the geometry genuinely does have
   * line of sight, so nothing about the trace was broken. */
  const voice = voiceWithPlayerAt(DOORWAY.x, DOORWAY.z, hallWithABench());
  assert.equal(voice.audible(ROSA, 12, 1.45), true);
});

test('she is heard the moment he comes round the bench and can see her', () => {
  const voice = voiceWithPlayerAt(11.7, -8.4, hallWithABench());
  assert.equal(
    voice.audible(ROSA, 12, PRONE_MOUTH_Y), true,
    'she is silent even to a player standing over her, which is worse than the '
    + 'bug it replaced',
  );
});

test('kneeling clears the bench that prone does not', () => {
  /* The three heights are a posture ladder, not three magic numbers: behind
   * the SAME bench, from the SAME spot, a crouched man is heard and a woman on
   * the floor is not, because the difference is where their heads are.
   *
   * Worth recording how this test was first written and why it was wrong: it
   * used a lower 0.6 m bench and expected prone to still be blocked. It is
   * not, and it should not be -- from four metres away the sight line to the
   * floor passes a foot above a 0.6 m bench, so a player that close really can
   * see her. The code was right and the expectation was invented. */
  const voice = voiceWithPlayerAt(DOORWAY.x, DOORWAY.z, hallWithABench());
  assert.equal(voice.audible(ROSA, 12, KNEELING_MOUTH_Y), true,
    'a crouching speaker behind a waist-high bench should still be heard');
  assert.equal(voice.audible(ROSA, 12, PRONE_MOUTH_Y), false,
    'and the same spot on the floor should not');
});

test('distance still ends the line before geometry is ever consulted', () => {
  let traced = false;
  const voice = voiceWithPlayerAt(60, 60, (...args) => { traced = true; return hallWithABench()(...args); });
  assert.equal(voice.audible(ROSA, 12, PRONE_MOUTH_Y), false);
  assert.equal(traced, false, 'a speaker out of range should not cost a trace');
});

test('the cleaner speaks from the floor everywhere she is on it', () => {
  /* The gate is only worth having if the caller uses it. Every line the
   * cowering path plays has to declare the prone mouth; the one it must NOT is
   * `panic.one`, which she says on her feet while running. */
  const source = readBystanders();
  const prone = source.match(/mouthY: PRONE_MOUTH_Y/g) ?? [];
  assert.ok(prone.length >= 3,
    `only ${prone.length} cowering lines declare a prone mouth; the rest are `
    + 'still being heard from a standing head');
  const panicOne = source.slice(source.indexOf("'cleaner.panic.one'"), source.indexOf("'cleaner.panic.one'") + 220);
  assert.doesNotMatch(panicOne, /mouthY/,
    'the shout she gives while running for cover is not said from the floor');
});

function readBystanders() {
  return readFileSync(new URL('../src/cartel-palace/bystanders.js', import.meta.url), 'utf8');
}
