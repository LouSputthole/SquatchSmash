import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  REQUIRED_SIEGE_EFFECT_CUES,
  SiegeMissionAudio,
} from '../src/mansion/siege/audio.js';

const siegeMainSource = readFileSync(new URL('../src/mansion/siege/main.js', import.meta.url), 'utf8');
const siegeVerifierSource = readFileSync(new URL('../tools/verify-mansion-siege.mjs', import.meta.url), 'utf8');

function audioSpy() {
  const calls = [];
  return {
    calls,
    play: (name, options) => { calls.push({ method: 'play', name, options }); },
    startLoop: (key, options) => { calls.push({ method: 'startLoop', key, options }); },
    stopLoop: (key, fade) => { calls.push({ method: 'stopLoop', key, fade }); },
  };
}

test('the Siege audio adapter follows the live alarm clock and fire layer exactly once', () => {
  const engine = audioSpy();
  const audio = new SiegeMissionAudio(engine);

  audio.updateEnvironment({ alarmActive: true, alarmStruck: true, fireActive: true });
  audio.updateEnvironment({ alarmActive: true, alarmStruck: false, fireActive: true });
  audio.updateEnvironment({ alarmActive: false, alarmStruck: true, fireActive: false });

  assert.deepEqual(engine.calls, [
    {
      method: 'startLoop',
      key: 'siege.fire.crackle',
      options: { name: 'siege.fire.crackle', volume: 0.24, fade: 0.8, ambience: true },
    },
    { method: 'play', name: 'siege.alarm.tone', options: { volume: 0.34 } },
    { method: 'stopLoop', key: 'siege.fire.crackle', fade: 0.8 },
  ]);
  assert.deepEqual(audio.cueTrace(), [
    { action: 'startLoop', cue: 'siege.fire.crackle', event: 'fire_started' },
    { action: 'play', cue: 'siege.alarm.tone', event: 'alarm_struck' },
    { action: 'stopLoop', cue: 'siege.fire.crackle', event: 'fire_stopped' },
  ]);
});

test('every discrete Siege sound event requests its authored cue through the adapter', () => {
  const engine = audioSpy();
  const audio = new SiegeMissionAudio(engine);
  const position = { x: 2, y: 3, z: 4 };

  audio.waveIncoming('one');
  audio.checkpoint('briefed');
  audio.glassShattered(position);
  audio.friendlyRevived(position);

  assert.deepEqual(engine.calls, [
    { method: 'play', name: 'siege.wave.incoming', options: { volume: 0.72 } },
    { method: 'play', name: 'siege.checkpoint', options: { volume: 0.58 } },
    {
      method: 'play',
      name: 'siege.glass.shatter',
      options: { volume: 0.86, position },
    },
    {
      method: 'play',
      name: 'siege.friendly.revived',
      options: { volume: 0.8, position },
    },
  ]);

  assert.deepEqual(audio.cueTrace(), [
    { action: 'play', cue: 'siege.wave.incoming', event: 'wave_one_incoming' },
    { action: 'play', cue: 'siege.checkpoint', event: 'checkpoint_briefed' },
    { action: 'play', cue: 'siege.glass.shatter', event: 'glass_shattered' },
    { action: 'play', cue: 'siege.friendly.revived', event: 'friendly_revived' },
  ]);
  assert.deepEqual(REQUIRED_SIEGE_EFFECT_CUES, [
    'siege.alarm.tone',
    'siege.glass.shatter',
    'siege.fire.crackle',
    'siege.wave.incoming',
    'siege.checkpoint',
    'siege.friendly.revived',
  ]);
});

test('checkpoint reconstruction suppresses intermediate story effects and restores them afterward', () => {
  const engine = audioSpy();
  const audio = new SiegeMissionAudio(engine);

  const result = audio.withSuppressedEvents(() => {
    audio.checkpoint('wake');
    audio.waveIncoming('one');
    return 'staged';
  });
  audio.checkpoint('briefed');

  assert.equal(result, 'staged');
  assert.deepEqual(engine.calls, [
    { method: 'play', name: 'siege.checkpoint', options: { volume: 0.58 } },
  ]);
  assert.deepEqual(audio.cueTrace(), [
    { action: 'play', cue: 'siege.checkpoint', event: 'checkpoint_briefed' },
  ]);
});

test('the playable Siege and its verifier use the observable mission-audio boundary', () => {
  const combatAdapterRegion = siegeMainSource.slice(
    siegeMainSource.indexOf('const combatAdapterAudio = Object.freeze({'),
    siegeMainSource.indexOf('const finalArcLoadout ='),
  );
  assert.match(siegeMainSource, /new SiegeMissionAudio\(audio\)/);
  assert.match(siegeMainSource,
    /await audio\.loadManifest\(\{ names: siegeEffectCueNames\(\) \}\)/,
    'required effects must decode before the wake checkpoint requests them');
  assert.match(siegeMainSource,
    /names: \[\.\.\.weaponCueNames\(\), \.\.\.siegeVoiceCueNames\(\), \.\.\.siegeCombatCueNames\(\)\]/,
    'the playable weapon, voice and combat-feedback bank must finish before combat begins');
  assert.match(siegeMainSource, /export function siegeCombatCueNames\(\)/);
  assert.match(siegeMainSource, /withCheckpointReconstruction\(\(\) => \{/,
    'checkpoint reconstruction must not replay every intermediate chime and wave cue');
  assert.match(siegeMainSource, /dialogue\.withSuppressedPlayback\(run\)/,
    'checkpoint reconstruction must not replay prior dialogue sequences');
  assert.match(siegeMainSource, /if \(checkpointReconstructionDepth > 0\) return;/,
    'checkpoint reconstruction must not overwrite durable progress with intermediate saves');
  assert.match(siegeMainSource, /recordSiegeCheckpoint\(entryCheckpoint\);/,
    'a restored entry must emit and persist only its destination checkpoint');
  assert.match(siegeMainSource, /let starting = false;/,
    'audio preload needs a separate latch before the playable running state');
  assert.match(siegeMainSource, /missionAudio\.waveIncoming\('one'\)/);
  assert.match(siegeMainSource, /missionAudio\.waveIncoming\('two'\)/);
  assert.match(siegeMainSource, /missionAudio\.checkpoint\(id\)/);
  assert.match(siegeMainSource, /missionAudio\.glassShattered\(/);
  assert.match(siegeMainSource, /missionAudio\.friendlyRevived\(/);
  assert.match(siegeMainSource, /missionAudio\.updateEnvironment\(\{/);
  assert.doesNotMatch(siegeMainSource, /audio\.play\?\.\('siege\./);
  assert.match(combatAdapterRegion,
    /hasSample\(cue\)\s*\{\s*return audio\.hasSample\(cue\);\s*\}/,
    'the combat facade must expose decoded canonical weapon cues to playWeaponCue');
  assert.match(combatAdapterRegion,
    /if \(LEGACY_COMBAT_PRESENTATION_CUES\.has\(cue\)\) return null;/,
    'forwarding sample availability must not re-enable duplicate legacy impact cues');

  assert.match(siegeVerifierSource, /window\.mansionSiege\.missionAudio\.cueTrace\(\)/);
  assert.match(siegeVerifierSource, /every required Siege effect is requested by gameplay/);
});
