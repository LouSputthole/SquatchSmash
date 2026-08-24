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
 * about where she is.
 *
 * THE SECOND HALF, 2026-08-24. Telling the truth about her mouth and then
 * SILENCING her is the same bug with the sign flipped: she is a woman the
 * player is meant to find, and if he only hears her once he can already see
 * her then her voice is not a cue for anything. A wall and a bench are not the
 * same object -- sound does not pass through the first and absolutely goes
 * round the second.
 *
 * `PalaceVoice.audibility()` is three-way now, and the rule needs no material
 * taxonomy: trace to the speaker's real mouth, and if that is blocked, trace
 * again to where their mouth would be if they stood up.
 *
 *   clear     nothing in the way.
 *   occluded  blocked low, clear high: same room, behind something he can see
 *             over. Muffled and quieter -- something to walk toward.
 *   blocked   blocked at both heights. A wall. Silence, per the owner's rule.
 *
 * It scopes itself: a standing speaker's two rays are the same ray, so a guard
 * can never be `occluded` and the payroll's barks are untouched.
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
function hallWithABench({ top = 0.9, wall = false } = {}) {
  const bench = { x0: 11.2, x1: 12.4, z0: -5.6, z1: -4.4, y0: 0, y1: top };
  /* The same slab to the ceiling, for the case the rule has to keep refusing. */
  const solid = { ...bench, y1: 4.4 };
  const blocker = wall ? solid : bench;
  return (from, to) => {
    /* Sample the segment. Crude on purpose: the production tracer is the
     * scene's, and what this file is testing is the ENDPOINT, not the tracer. */
    for (let i = 0; i <= 64; i += 1) {
      const t = i / 64;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      if (x >= blocker.x0 && x <= blocker.x1 && z >= blocker.z0 && z <= blocker.z1
        && y >= blocker.y0 && y <= blocker.y1) return { hit: true };
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

test('a woman lying behind a bench is heard round it, not through it', () => {
  const voice = voiceWithPlayerAt(DOORWAY.x, DOORWAY.z, hallWithABench());
  assert.equal(
    voice.audibility(ROSA, 12, PRONE_MOUTH_Y), 'occluded',
    'a prone speaker behind waist-high cover is either being heard as if she '
    + 'were standing in the open -- the "disembodied cleaner" bug -- or silenced '
    + 'by a bench, which leaves the player nothing to find her by',
  );
});

test('and a wall is still a wall', () => {
  /* The half of the owner's original rule that has to survive the other half:
   * nothing is heard through a wall. Same bench, same spot, taken to the
   * ceiling. */
  const voice = voiceWithPlayerAt(DOORWAY.x, DOORWAY.z, hallWithABench({ wall: true }));
  assert.equal(voice.audibility(ROSA, 12, PRONE_MOUTH_Y), 'blocked');
  assert.equal(voice.audibility(ROSA, 12, KNEELING_MOUTH_Y), 'blocked');
  assert.equal(voice.audibility(ROSA, 12, 1.45), 'blocked',
    'a standing speaker is audible through a solid partition');
});

test('a standing speaker can never be the middle case', () => {
  /* Load-bearing, and the reason the payroll did not have to be re-tested: at
   * the standing mouth the two rays are one ray, so a guard is only ever clear
   * or blocked. */
  const voice = voiceWithPlayerAt(DOORWAY.x, DOORWAY.z, hallWithABench({ wall: true }));
  for (const height of [1.45, 1.6, 2.0]) {
    assert.notEqual(voice.audibility(ROSA, 12, height), 'occluded',
      `a speaker with a mouth at ${height} m resolved as occluded`);
  }
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
  assert.equal(voice.audibility(ROSA, 12, KNEELING_MOUTH_Y), 'clear',
    'a crouching speaker behind a waist-high bench should be heard plainly');
  assert.equal(voice.audibility(ROSA, 12, PRONE_MOUTH_Y), 'occluded',
    'and the same spot on the floor should be heard round the bench, not through it');
});

test('distance still ends the line before geometry is ever consulted', () => {
  let traced = false;
  const voice = voiceWithPlayerAt(60, 60, (...args) => { traced = true; return hallWithABench()(...args); });
  assert.equal(voice.audibility(ROSA, 12, PRONE_MOUTH_Y), 'blocked');
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

/* ================================================================== */
/* AND A VOICE HAS TO COME OUT OF A PLACE                              */
/* ================================================================== */

/**
 * The smallest thing that looks like the engine to `PalaceVoice`.
 *
 * `playCue` needs `audio.play`, `audio.buffers` with a `vo.<cue>.` take in it,
 * and nothing else. Every call it makes is recorded so the test can ask what
 * the line was actually given.
 */
function recordingAudio(...ids) {
  const played = [];
  return {
    played,
    buffers: new Map(ids.map((id) => [`vo.palace.${id}.01`, [{ duration: 1.2 }]])),
    play(name, options = {}) {
      played.push({ name, ...options });
      return { buffer: { duration: 1.2 } };
    },
  };
}

test('a cleaner line is given the place she is lying in', () => {
  /* The fault under the owner's "disembodied cleaner", and the one the mouth
   * height did not reach. `PalaceVoice.say` used to fork: a line with a live
   * `speaker` body went through the positioned dialogue path, and a line with
   * only a `position` went through `AudioEngine.say`, which accepted the
   * position and dropped it on the floor. The cleaner is the entire set of
   * lines in the Palace with no speaker body, so every word she says was
   * played dead centre at full level with no panner on it. */
  const audio = recordingAudio('cleaner.cower.one');
  const voice = new PalaceVoice({
    audio,
    player: {
      position: {
        x: 11.7, y: 1.6, z: -8.4, distanceTo: (p) => Math.hypot(p.x - 11.7, p.z + 8.4),
      },
    },
    trace: hallWithABench(),
    vector: (x, y, z) => ({ x, y, z }),
  });
  assert.equal(
    voice.say('cleaner.cower.one', { position: ROSA, radius: 11, mouthY: PRONE_MOUTH_Y }),
    true,
    'the line did not play at all from four metres with a clear view of her',
  );
  assert.equal(audio.played.length, 1, 'the line reached the engine more than once, or not at all');
  const [spoken] = audio.played;
  const at = spoken.position ?? spoken.speaker;
  assert.ok(at, 'the line was handed to the engine with no position and no speaker, '
    + 'so it plays dead centre in both ears: a disembodied cleaner');
  assert.ok(Math.abs(at.x - ROSA.x) < 1e-6 && Math.abs(at.z - ROSA.z) < 1e-6,
    `the line is coming from (${at.x}, ${at.z}) and she is at (${ROSA.x}, ${ROSA.z})`);
});

test('a line heard round the bench arrives dulled, and one heard plainly does not', () => {
  const build = (playerZ) => {
    const audio = recordingAudio('cleaner.cower.one', 'cleaner.cower.two');
    const voice = new PalaceVoice({
      audio,
      player: {
        position: {
          x: DOORWAY.x, y: 1.6, z: playerZ,
          distanceTo: (p) => Math.hypot(p.x - DOORWAY.x, p.z - playerZ),
        },
      },
      trace: hallWithABench(),
      vector: (x, y, z) => ({ x, y, z }),
    });
    return { audio, voice };
  };

  /* Behind the bench from him: occluded. */
  const far = build(DOORWAY.z);
  assert.equal(far.voice.say('cleaner.cower.one', {
    position: ROSA, radius: 11, mouthY: PRONE_MOUTH_Y,
  }), true, 'she is silent from the doorway, which leaves nothing to walk toward');
  const dulled = far.audio.played[0];
  assert.ok(dulled.muffle > 0,
    'a voice from behind cover in the same room arrives as bright as one in the open');

  /* Round the bench, standing over her: clear. */
  const near = build(-8.4);
  assert.equal(near.voice.say('cleaner.cower.two', {
    position: ROSA, radius: 11, mouthY: PRONE_MOUTH_Y,
  }), true);
  const plain = near.audio.played[0];
  assert.ok(!plain.muffle,
    'a voice with nothing in the way is still being filtered as if there were');
  assert.ok((plain.volume ?? 1) > (dulled.volume ?? 1),
    'the occluded line is not quieter than the clear one');
});
