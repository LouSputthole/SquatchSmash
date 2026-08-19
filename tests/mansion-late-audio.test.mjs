import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ensureDomShim } from '../tools/three-shim.mjs';
import {
  GUEST_SLEEP_AUDIO_SECONDS,
  MANSION_INTERACTION_CUE_NAMES,
  playGuestBedSleep,
  playTheatreSit,
  playTheatreStand,
} from '../src/mansion/interaction-audio.js';
import { SiegeMissionAudio } from '../src/mansion/siege/audio.js';

ensureDomShim();

const mansionMainSource = readFileSync(
  new URL('../src/mansion/main.js', import.meta.url),
  'utf8',
);
const siegeMainSource = readFileSync(
  new URL('../src/mansion/siege/main.js', import.meta.url),
  'utf8',
);

function audioSpy() {
  const calls = [];
  return {
    calls,
    play(name, options) {
      calls.push({ name, options });
      return { name };
    },
  };
}

test('Mansion furniture events request the four assigned staged cues', () => {
  const audio = audioSpy();
  const position = { x: -12.1, y: -3.5, z: 70.5 };

  playTheatreSit(audio, position);
  playTheatreStand(audio, position);
  const settle = playGuestBedSleep(audio, position);

  assert.deepEqual(audio.calls.map(({ name }) => name), [
    'chair.sit',
    'chair.scrape.wood',
    'bed.rustle',
    'bed.creak',
  ]);
  assert.equal(audio.calls[0].options.delay, 0.12);
  assert.equal(audio.calls[1].options.rate, 0.96);
  assert.equal(audio.calls[2].options.delay, undefined);
  assert.equal(audio.calls[3].options.delay, 0.18);
  assert.ok(settle >= 0.4, 'navigation would replace the AudioContext before both bed beats');
  assert.equal(settle, GUEST_SLEEP_AUDIO_SECONDS);
  assert.deepEqual(MANSION_INTERACTION_CUE_NAMES, audio.calls.map(({ name }) => name));
});

test('the Mansion composition root wires and preloads all four furniture placements', () => {
  assert.match(mansionMainSource, /playTheatreSit\(audio, seat\.getWorldPosition/);
  assert.match(mansionMainSource, /playTheatreStand\(audio, seat\.getWorldPosition/);
  assert.match(mansionMainSource, /playGuestBedSleep\(audio, position\)/);
  assert.match(mansionMainSource, /GUEST_SLEEP_AUDIO_SECONDS \* 1000/);
  assert.match(mansionMainSource, /\.\.\.MANSION_INTERACTION_CUE_NAMES/);
});

test('Siege pane state emits crack and shatter audio only on real transitions', async () => {
  const { MansionDamageState } = await import('../src/mansion/siege/state.js');
  const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
  const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
  const { buildSiegeGlass } = await import('../src/mansion/siege/glass.js');

  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders });
  const engine = audioSpy();
  const missionAudio = new SiegeMissionAudio(engine);
  const transitions = [];
  const glass = buildSiegeGlass({
    damage,
    grounds,
    interior,
    onCrack: (event) => {
      transitions.push({ type: 'crack', ...event });
      missionAudio.glassCracked(event.position);
    },
    onShatter: (event) => {
      transitions.push({ type: 'shatter', ...event });
      missionAudio.glassShattered(event.position);
    },
  });

  assert.equal(transitions.length, 0, 'authored/pre-restored pane state replayed event audio');
  const pane = glass.panes.get('kitchen.east');
  assert.equal(pane.pane.userData.siegeGlassPaneId, 'kitchen.east');
  assert.equal(glass.crack('kitchen.east'), true);
  assert.equal(glass.crack('kitchen.east'), false);
  assert.equal(glass.shatter('kitchen.east'), true);
  assert.equal(glass.shatter('kitchen.east'), false);
  glass.restoreBroken(glass.brokenIds().filter((id) => id !== 'kitchen.east'));

  assert.deepEqual(transitions.map(({ type, id }) => ({ type, id })), [
    { type: 'crack', id: 'kitchen.east' },
    { type: 'shatter', id: 'kitchen.east' },
  ]);
  assert.deepEqual(engine.calls.map(({ name }) => name), [
    'combat.bullet.impact.glass',
    'siege.glass.shatter',
  ]);
  for (const transition of transitions) {
    assert.deepEqual(
      transition.position.toArray(),
      pane.centre.toArray(),
      'the cue was not positioned at the pane that actually changed',
    );
  }
});

test('the playable Siege resolves an exact impacted pane and centralizes both glass cues', () => {
  assert.match(siegeMainSource,
    /onCrack: \(\{ position \}\) => missionAudio\.glassCracked\(position\)/);
  assert.match(siegeMainSource,
    /onShatter: \(\{ position \}\) => missionAudio\.glassShattered\(position\)/);
  assert.match(siegeMainSource,
    /ancestorData\(impact\.object, 'siegeGlassPaneId'\)/);
  assert.match(siegeMainSource, /if \(paneId && glass\.crack\(paneId\)\) return \[\];/);
  assert.equal(
    (siegeMainSource.match(/missionAudio\.glassShattered\(/g) ?? []).length,
    1,
    'a breach still plays shatter outside the glass state transition',
  );
});
