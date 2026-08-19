import assert from 'node:assert/strict';
import test from 'node:test';

import { CourseAudio, GOLF_EFFECT_CUES } from '../src/golf/audio.js';

test('Golf grille ambience enters once, stays localized, and leaves with the course', () => {
  const calls = [];
  const engine = {
    ready: true,
    startLoop: (key, options) => calls.push(['startLoop', key, options]),
    stopLoop: (key, fade) => calls.push(['stopLoop', key, fade]),
    play: (name, options) => calls.push(['play', name, options]),
  };
  const audio = new CourseAudio(engine);
  const position = { x: -22.14, y: 2.4, z: -375.8 };

  assert.equal(audio.enterGrille(position), true);
  assert.equal(audio.enterGrille(position), false);
  assert.deepEqual(calls.slice(0, 2), [
    ['startLoop', 'golf-grille-diners', {
      name: 'ambience.diners', volume: 0.18, position,
      ref: 3.5, maxDist: 58, fade: 1.2,
    }],
    ['play', 'dining.glass.clink', {
      volume: 0.32, delay: 0.28, position, ref: 2.2, maxDist: 32,
    }],
  ]);

  audio.started = true;
  audio.stop();
  assert.equal(calls.some(([kind, key]) => (
    kind === 'stopLoop' && key === 'golf-grille-diners'
  )), true);
  assert.equal(GOLF_EFFECT_CUES.includes('ambience.diners'), true);
  assert.equal(GOLF_EFFECT_CUES.includes('dining.glass.clink'), true);
});
