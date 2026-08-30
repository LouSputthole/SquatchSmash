import assert from 'node:assert/strict';
import test from 'node:test';

import { SPEECH_MIX_CLOSE, SPEECH_MIX_INDOORS } from '../src/core/dialogue.js';
import { ESCAPE_START, ROUTE_NODES } from '../src/heist/city.js';
import { HEIST_ESCAPE_VEHICLE_CONFIG } from '../src/heist/config.js';
import { DialogueArbiter, heistSpeechMix } from '../src/heist/dialogue.js';
import { HEIST_SQUAD_FORMATIONS } from '../src/heist/preview.js';
import { ALL_HEIST_DIALOGUE, dialogueLine } from '../src/heist/script.js';

/**
 * THE CREW CONVERSATION IN THE ESCAPE CAR.
 *
 * Owner, playtest 2026-08-26: *"the crew conversation in the escape car never
 * plays"*. It is authored, it is recorded, and a browser run confirms every
 * line of it reaches the dialogue bus. Two separate things stopped it reaching
 * the player, and this file holds both fixes.
 *
 * ## One: it was mixed as if it were happening in the swap yard
 *
 * The crew do not ride in the car. `HEIST_SQUAD_FORMATIONS.driving` stands all
 * five of them in the yard at the END of the route for the whole escape, and
 * `main.js` hands the speaker's rig to `speak()` as the position of the voice.
 * With `SPEECH_MIX_INDOORS` -- an inverse-distance panner, `ref` 1.8, and the
 * inverse model does not clamp at `maxDistance` -- the gain is 1.8 / d, and d
 * is 400 to 900 m. The line plays at two to four thousandths of its level,
 * under an engine loop, a tyre loop and a siren bed.
 *
 * ## Two: every call's state window was one leg long
 *
 * `DialogueArbiter` finishes a playing line as stale, and drops a queued one,
 * the moment the mission leaves the line's states -- and the states change AT
 * the junctions the calls are about.
 *
 * Nothing here is guessed. The leg times come from driving the real physics in
 * Chromium at pinned throttle, the top-speed times from the same route at the
 * car's own `maxForwardSpeed`, and the line lengths are the MPEG frame counts
 * of the shipped recordings in `assets/sfx/`.
 */

/** Decoded length of each recording, in seconds (MPEG frames / 38.28 per s). */
const TAKE_SECONDS = Object.freeze({
  rippin_drive: 5.83,
  rippin_market_left: 4.39,
  rippin_tower_right: 4.62,
  snow_roadblock: 3.45,
  rippin_canal: 4.62,
  rippin_swap_ahead: 7.31,
  shubes_swap: 3.87,
});

/** The six calls the drive makes. Every one has to be heard end to end. */
const ROUTE_CALLS = Object.freeze([
  'rippin_drive', 'rippin_market_left', 'rippin_tower_right',
  'snow_roadblock', 'rippin_canal', 'rippin_swap_ahead',
]);

/** The state each node's arrival advances the mission to, and its call. */
const NODE_BEATS = Object.freeze({
  garage_left: Object.freeze({ state: 'CITY_PURSUIT', line: 'rippin_market_left' }),
  warehouse_left: Object.freeze({ state: 'CITY_PURSUIT', line: 'rippin_tower_right' }),
  tower_right: Object.freeze({ state: 'ROADBLOCK', line: 'snow_roadblock' }),
  roadblock: Object.freeze({ state: 'INDUSTRIAL_ROUTE', line: 'rippin_canal' }),
  canal_turn: Object.freeze({ state: 'INDUSTRIAL_ROUTE', line: 'rippin_swap_ahead' }),
  industrial_swap: Object.freeze({ state: 'VEHICLE_SWAP', line: 'shubes_swap' }),
});

/**
 * The escape as a timeline of `[second, state, line]`.
 *
 * MEASURED, pinned throttle, Chromium, `simulateDriving` stepping the real
 * `updateDriving`: 3.5 s to the garage turn, then 7.5, 9.5, 5.0, 4.5 and about
 * 11 to the yard. 41.5 s of driving against 30.2 s of route calls -- the
 * conversation fits the run with eleven seconds to spare, which is why the fix
 * is the mix and the windows and not a re-cut of the lines.
 */
const MEASURED_LEGS = Object.freeze([3.5, 7.5, 9.5, 5.0, 4.5, 11.0]);

/** The same route with every leg driven at the clamp: 41 m/s, 91.7 mph. */
function topSpeedLegs() {
  const points = [[ESCAPE_START.x, ESCAPE_START.z], ...ROUTE_NODES.map((n) => [n.x, n.z])];
  return points.slice(1).map(([x, z], index) => {
    const [px, pz] = points[index];
    const seconds = Math.hypot(x - px, z - pz) / HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed;
    // Only the first leg starts from a standstill; measured at 3.5 s for 73 m.
    return index === 0 ? 3.5 : seconds;
  });
}

function timeline(legs) {
  const beats = [
    { t: 0, state: 'PLAYER_TAKES_WHEEL', line: 'rippin_drive' },
    /* 24 m out of the garage. `updateDriving` flips the state there, mid-leg,
     * and at these speeds that is 2.2 s after the throttle goes down. */
    { t: 2.2, state: 'GARAGE_ESCAPE', line: null },
  ];
  let clock = 0;
  ROUTE_NODES.forEach((node, index) => {
    clock += legs[index];
    beats.push({ t: Number(clock.toFixed(2)), node: node.id, ...NODE_BEATS[node.id] });
  });
  return beats.sort((a, b) => a.t - b.t);
}

/**
 * Run the real arbiter over a timeline and report what was heard in full.
 *
 * A line is `cut` when a state change takes it off the bus before its own
 * recording has finished -- which is what a player hears as a sentence that
 * stops halfway -- and `dropped` when it never started at all.
 */
function playDrive(beats) {
  const started = [];
  const cut = [];
  let clock = 0;
  let startedAt = 0;
  let endsAt = Infinity;
  const arbiter = new DialogueArbiter({
    maxQueue: 4,
    onStart: (line) => {
      started.push({ id: line.id, at: Number(clock.toFixed(2)) });
      startedAt = clock;
      endsAt = clock + (TAKE_SECONDS[line.id] ?? line.fallbackDuration);
    },
  });
  arbiter.setState(beats[0].state);
  let index = 0;
  const last = beats.at(-1).t + 6;
  for (clock = 0; clock <= last; clock = Number((clock + 0.05).toFixed(2))) {
    while (index < beats.length && beats[index].t <= clock) {
      const beat = beats[index++];
      if (beat.state && beat.state !== arbiter.state) {
        const speaking = arbiter.current;
        arbiter.setState(beat.state);
        if (speaking && arbiter.current !== speaking) {
          cut.push({
            id: speaking.id,
            at: Number(clock.toFixed(2)),
            played: Number((clock - startedAt).toFixed(2)),
            of: TAKE_SECONDS[speaking.id],
          });
          /* `finish('stale')` may have started the next line already, and that
           * start is what stamped `endsAt`. Only clear it when the bus really
           * did go quiet, or the replacement line runs forever. */
          if (!arbiter.current) endsAt = Infinity;
        }
      }
      if (beat.line) arbiter.push(dialogueLine(beat.line));
    }
    arbiter.update(clock);
    if (arbiter.current && clock >= endsAt) {
      arbiter.finish();
      if (!arbiter.current) endsAt = Infinity;
    }
  }
  const dropped = ROUTE_CALLS.filter((id) => !started.some((entry) => entry.id === id));
  return { started, cut, dropped };
}

test('a line spoken from the driving seat is not panned into the swap yard', () => {
  const figure = { group: {} };
  assert.equal(heistSpeechMix({ driving: true, figure }), SPEECH_MIX_CLOSE);
  assert.equal(heistSpeechMix({ driving: false, figure }), SPEECH_MIX_INDOORS);
  /* A radio has no rig and never had a panner. That behaviour is unchanged. */
  assert.equal(heistSpeechMix({ driving: false, figure: null }), SPEECH_MIX_CLOSE);
  assert.equal(heistSpeechMix(), SPEECH_MIX_CLOSE);
});

test('the indoor mix would have delivered the whole drive at under one per cent', () => {
  /* The measurement the fix exists for. The crew stand at the swap for the
   * whole escape; the listener is the chase camera on the car. WebAudio's
   * inverse model is ref / (ref + rolloff * (d - ref)) and ignores maxDistance,
   * so this is the level every one of those lines actually reached. */
  const crew = HEIST_SQUAD_FORMATIONS.driving;
  const yard = crew.reduce((sum, [x, z]) => ({
    x: sum.x + x / crew.length, z: sum.z + z / crew.length,
  }), { x: 0, z: 0 });
  const dispatchPoints = [
    [ESCAPE_START.x, ESCAPE_START.z],
    ...ROUTE_NODES.slice(0, -1).map((node) => [node.x, node.z]),
  ];
  const distances = dispatchPoints.map(([x, z]) => Math.hypot(x - yard.x, z - yard.z));
  const gains = distances.map((d) => SPEECH_MIX_INDOORS.ref
    / (SPEECH_MIX_INDOORS.ref + SPEECH_MIX_INDOORS.rolloff * (d - SPEECH_MIX_INDOORS.ref)));
  assert.ok(Math.min(...distances) > 390,
    `the car gets within ${Math.min(...distances).toFixed(0)} m of the crew before the swap`);
  assert.ok(Math.max(...gains) < 0.01,
    `the loudest panned drive line was ${Math.max(...gains).toFixed(4)} of its level`);
});

test('the measured drive is longer than the conversation it carries', () => {
  const drive = MEASURED_LEGS.reduce((sum, leg) => sum + leg, 0);
  const speech = ROUTE_CALLS.reduce((sum, id) => sum + TAKE_SECONDS[id], 0);
  assert.ok(drive > speech + 5,
    `${drive.toFixed(1)} s of driving against ${speech.toFixed(1)} s of calls`);
});

test('every call of the measured drive is heard end to end', () => {
  const { cut, dropped } = playDrive(timeline(MEASURED_LEGS));
  assert.deepEqual(dropped, [], 'a route call never reached the bus');
  /* Before the windows were widened this reported `rippin_drive`, cut after
   * 2.2 s of 5.83 -- the opening line of the escape, every single run. */
  assert.deepEqual(cut, [],
    cut.map((entry) => `${entry.id} stopped at ${entry.played} s of ${entry.of}`).join('; '));
});

test('every call survives a drive at the car’s top speed', () => {
  /* 92 mph makes two of the legs shorter than the call given on them: the
   * financial row is 3.4 s against `snow_roadblock`'s 3.45 s of recording.
   * With a one-state window that call was taken off the bus at the roadblock,
   * mid-sentence, precisely when the player is being told about the roadblock. */
  const { cut, dropped } = playDrive(timeline(topSpeedLegs()));
  assert.deepEqual(dropped, []);
  assert.deepEqual(cut, [],
    cut.map((entry) => `${entry.id} stopped at ${entry.played} s of ${entry.of}`).join('; '));
});

test('the drive lines are windowed on their own leg and their own turn', () => {
  const DRIVE_ORDER = ['PLAYER_TAKES_WHEEL', 'GARAGE_ESCAPE', 'CITY_PURSUIT',
    'ROADBLOCK', 'INDUSTRIAL_ROUTE', 'VEHICLE_SWAP'];
  const windows = {
    rippin_drive: ['PLAYER_TAKES_WHEEL', 'GARAGE_ESCAPE', 'CITY_PURSUIT'],
    rippin_market_left: ['CITY_PURSUIT'],
    rippin_tower_right: ['CITY_PURSUIT', 'ROADBLOCK'],
    snow_roadblock: ['ROADBLOCK', 'INDUSTRIAL_ROUTE'],
    rippin_canal: ['INDUSTRIAL_ROUTE', 'VEHICLE_SWAP'],
    rippin_swap_ahead: ['INDUSTRIAL_ROUTE', 'VEHICLE_SWAP'],
  };
  for (const [id, states] of Object.entries(windows)) {
    assert.deepEqual([...ALL_HEIST_DIALOGUE[id].states], states, `${id} state window`);
    /* Contiguous, and never past the state the call's own turn produces: a
     * direction is allowed to finish on the corner it names and not one corner
     * later. `VEHICLE_SWAP` is the end of the drive and closes every window. */
    const indices = states.map((state) => DRIVE_ORDER.indexOf(state));
    assert.ok(indices.every((value, i) => value >= 0 && (i === 0 || value === indices[i - 1] + 1)),
      `${id} is windowed across a gap in the drive`);
    assert.ok(indices.at(-1) - indices[0] <= 2, `${id} is windowed too wide`);
  }
});
