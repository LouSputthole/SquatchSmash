import test from 'node:test';
import assert from 'node:assert/strict';

import { completedRoundAction, connectGolfFootsteps } from '../src/golf/runtime.js';
import { CourseAudio } from '../src/golf/audio.js';
import { BEAT, Round } from '../src/golf/mission.js';
import { BALL_STATE } from '../src/golf/ball.js';
import { HOLE } from '../src/golf/hole.js';

test('Golf footsteps resolve the live course surface and carry a positional snapshot', () => {
  const calls = [];
  const player = {
    position: { x: 14, y: 2.2, z: -36 },
    onFootstep: null,
  };
  const courseAudio = {
    footstep: (...args) => calls.push(args),
  };

  connectGolfFootsteps(player, () => courseAudio, (x, z) => {
    assert.equal(x, 14);
    assert.equal(z, -36);
    return 'bunker';
  });
  player.onFootstep('wood', 1.15);
  player.position.x = 99;

  assert.deepEqual(calls, [[
    'bunker',
    1.15,
    { x: 14, y: 2.2, z: -36 },
  ]]);
});

test('CourseAudio plays the resolved footstep as a positional course cue', () => {
  const calls = [];
  const engine = {
    play: (...args) => calls.push(args),
  };
  const audio = new CourseAudio(engine);
  const position = { x: -8, y: 1.4, z: -120 };

  audio.footstep('bunker', 0.8, position);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'footstep.sand');
  assert.equal(calls[0][1].volume, 0.24);
  assert.ok(calls[0][1].rate >= 0.92 && calls[0][1].rate <= 1.10);
  assert.deepEqual(calls[0][1].position, position);
});

test('a running cart motor follows the cart without restarting its loop', () => {
  const moved = { x: [], y: [], z: [] };
  const param = (axis) => ({
    value: 0,
    setTargetAtTime(value, at, smoothing) {
      moved[axis].push({ value, at, smoothing });
    },
  });
  const handle = {
    panner: {
      positionX: param('x'),
      positionY: param('y'),
      positionZ: param('z'),
    },
  };
  const starts = [];
  const engine = {
    ready: true,
    ctx: { currentTime: 12.5 },
    startLoop: (...args) => { starts.push(args); return handle; },
    stopLoop() {},
  };
  const audio = new CourseAudio(engine);

  audio.cartMotor(true, { x: 1, y: 0.5, z: -4 });
  audio.cartMotor(true, { x: 18, y: 0.7, z: -92 });

  assert.equal(starts.length, 1);
  assert.deepEqual(starts[0], [
    'cart.motor',
    { volume: 0.7, position: { x: 1, y: 0.5, z: -4 } },
  ]);
  assert.equal(moved.x.at(-1)?.value, 18);
  assert.equal(moved.y.at(-1)?.value, 0.7);
  assert.equal(moved.z.at(-1)?.value, -92);
  assert.equal(moved.x.at(-1)?.at, 12.5);
});

test('only a disposable Golf preview may replay a completed round', () => {
  assert.equal(completedRoundAction({ search: '?preview=1' }), 'replay');
  assert.equal(completedRoundAction({ search: '?preview=0' }), 'return_home');
  assert.equal(completedRoundAction({ search: '' }), 'return_home');
});

test('tee, pickup, and flag effects follow their actual round transitions', () => {
  const effects = [];
  const noop = () => {};
  const audio = {
    bag: noop,
    bounce: noop,
    flag: (position) => effects.push({ cue: 'golf.flag', position }),
    holed: noop,
    land: noop,
    pickup: (position) => effects.push({ cue: 'golf.pickup', position }),
    splash: noop,
    strike: noop,
    tee: (position) => effects.push({ cue: 'golf.tee', position }),
  };
  const cues = {
    busy: false,
    lengthOf: () => 0,
    play: noop,
    playSequence: noop,
    suppressBanter: noop,
  };
  const dialogue = { active: false, start: noop };
  const round = new Round({ cues, dialogue, audio });

  round.begin();
  round.takeBag();
  const tee = HOLE.teeMarks.ball;
  for (let i = 0; i < 40 && round.beat !== BEAT.PLAYER_TEE; i++) {
    round.update(0.25, { x: tee.x, z: tee.z });
  }
  assert.equal(round.beat, BEAT.PLAYER_TEE);
  assert.equal(effects.filter(({ cue }) => cue === 'golf.tee').length, 1);

  round.beat = BEAT.APPROACH;
  round.playerBall.state = BALL_STATE.HOLED;
  round.update(0.1, { x: HOLE.pin.x, z: HOLE.pin.z });

  assert.deepEqual(effects.map(({ cue }) => cue), [
    'golf.tee', 'golf.pickup', 'golf.flag',
  ]);
  for (const effect of effects) {
    assert.ok(Number.isFinite(effect.position.x));
    assert.ok(Number.isFinite(effect.position.y));
    assert.ok(Number.isFinite(effect.position.z));
  }
});
