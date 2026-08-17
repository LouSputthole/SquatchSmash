import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  REQUIRED_SIEGE_EFFECT_CUES,
  SIEGE_ALARM_VOLUME,
  SIEGE_AMBIENCE_CUES,
  SIEGE_DISTANT_BATTLE,
  SiegeMissionAudio,
} from '../src/mansion/siege/audio.js';

const sfxIndex = JSON.parse(
  readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'),
);

const siegeMainSource = readFileSync(new URL('../src/mansion/siege/main.js', import.meta.url), 'utf8');
const siegeVerifierSource = readFileSync(new URL('../tools/verify-mansion-siege.mjs', import.meta.url), 'utf8');

function audioSpy() {
  const calls = [];
  return {
    calls,
    play: (name, options) => { calls.push({ method: 'play', name, options }); },
    startLoop: (key, options) => { calls.push({ method: 'startLoop', key, options }); },
    stopLoop: (key, fade) => { calls.push({ method: 'stopLoop', key, fade }); },
    setLoopCutoff: (key, hz, ramp) => { calls.push({ method: 'setLoopCutoff', key, hz, ramp }); },
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
    {
      method: 'startLoop',
      key: 'siege.night.bed',
      options: { name: 'ambience.city.night', volume: 0.16, fade: 2.4, ambience: true },
    },
    { method: 'setLoopCutoff', key: 'siege.night.bed', hz: 900, ramp: 2.4 },
    { method: 'play', name: 'siege.alarm.tone', options: { volume: SIEGE_ALARM_VOLUME } },
    { method: 'stopLoop', key: 'siege.fire.crackle', fade: 0.8 },
    { method: 'stopLoop', key: 'siege.night.bed', fade: 1.6 },
  ]);
  assert.deepEqual(audio.cueTrace(), [
    { action: 'startLoop', cue: 'siege.fire.crackle', event: 'fire_started' },
    { action: 'startLoop', cue: 'ambience.city.night', event: 'night_bed_started' },
    { action: 'play', cue: 'siege.alarm.tone', event: 'alarm_struck' },
    { action: 'stopLoop', cue: 'siege.fire.crackle', event: 'fire_stopped' },
    { action: 'stopLoop', cue: 'ambience.city.night', event: 'night_bed_stopped' },
  ]);
});

test('the alarm is a fifth quieter than the level the owner asked to come down from', () => {
  /* Owner, 2026-08-13: "tone down alarm sound maybe 20%". 0.34 was the shipped
   * level; this pins the reduction rather than the taste. */
  assert.ok(Math.abs(SIEGE_ALARM_VOLUME - 0.34 * 0.8) <= 0.005,
    `the alarm strikes at ${SIEGE_ALARM_VOLUME}, which is not 0.34 less a fifth`);
});

test('a house under attack gets an off-screen battle, on its own clock and in a fixed order', () => {
  /* Owner, 2026-08-13: "need more sound effects ... other ambience besides the
   * alarm". Held behind the BATTLE layer: `alert` is the house waiting. */
  const engine = audioSpy();
  const audio = new SiegeMissionAudio(engine, { random: () => 0 });

  /* Alert only -- the night bed comes up and nothing is shooting yet. */
  audio.updateEnvironment({ alarmActive: true, fireActive: false, dt: 30 });
  assert.equal(engine.calls.some((call) => call.method === 'play'), false,
    'the house fired off-screen rounds before the battle layer was live');

  const before = engine.calls.length;
  audio.updateEnvironment({ alarmActive: true, fireActive: true, dt: 3 });
  for (let i = 0; i < 5; i++) {
    audio.updateEnvironment({ alarmActive: true, fireActive: true, dt: 3 });
  }
  const distant = engine.calls.slice(before).filter((call) => call.method === 'play');
  assert.deepEqual(distant.map((call) => call.name),
    SIEGE_DISTANT_BATTLE.map((entry) => entry.cue),
    'the distant battle did not cycle its authored rota once per interval');
  for (const call of distant) {
    assert.ok(call.options.volume <= 0.2,
      `${call.name} arrives at ${call.options.volume}, which is not "distant"`);
    assert.ok(call.options.position && Number.isFinite(call.options.position.x),
      `${call.name} has no position, so the panner cannot put it outside`);
  }
  assert.deepEqual(
    audio.cueTrace().filter((entry) => entry.event === 'distant_battle').length,
    SIEGE_DISTANT_BATTLE.length,
  );
});

test('every ambience cue the siege leans on is a sample that actually exists', () => {
  /* ENGINE-TRAPS #3's corollary: the manifest is a delivered CUE, the index is
   * a delivered RECORDING. A bed built on a name with no file is a synth hum
   * nobody chose. */
  const recorded = new Set(sfxIndex.files.map((file) => file.replace(/\.[a-z0-9]+$/i, '')));
  for (const cue of SIEGE_AMBIENCE_CUES) {
    assert.ok(recorded.has(cue), `${cue} has no recording in assets/sfx/index.json`);
  }
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
