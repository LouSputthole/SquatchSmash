import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { graveyardVoiceLines, hotDogPartyVoiceLines } from '../src/core/hotdog-voice-catalog.js';
import {
  HOTDOG_AUDIO_CUE_NAMES,
  HOTDOG_AUDIO_PREFIXES,
  hotDogAudioLoadOptions,
  isHotDogAudioPreloadCue,
} from '../src/bing/hotdog-audio.js';
import {
  GRAVEYARD_AUDIO_CUE_NAMES,
  GRAVEYARD_AUDIO_PREFIXES,
  graveyardAudioLoadOptions,
  isGraveyardAudioPreloadCue,
} from '../src/graveyard/audio.js';
import { Radio } from '../src/core/radio.js';
import { allNoWakeVoiceLines } from '../src/nowake/dialogue.js';
import {
  NO_WAKE_AUDIO_CUE_NAMES,
  NO_WAKE_AUDIO_PREFIXES,
  isNoWakeAudioPreloadCue,
  noWakeAudioLoadOptions,
} from '../src/nowake/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Recorded cue names requested with literal play/startLoop calls in a scene.
 * Dynamic dialogue calls are covered separately from the authored catalog.
 */
function staticAudioCueNames(relativeFile) {
  const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
  const names = new Set();
  const call = /audio\.(play|startLoop)\(([^;]*?)\);/gs;
  for (const match of source.matchAll(call)) {
    const [, method, args] = match;
    if (method === 'startLoop') {
      const namedCue = args.match(/\bname\s*:\s*['"]([^'"]+)['"]/);
      if (namedCue) {
        names.add(namedCue[1]);
        continue;
      }
    }
    const firstArgument = args.split(',')[0];
    for (const literal of firstArgument.matchAll(/['"]([^'"]+)['"]/g)) {
      names.add(literal[1]);
    }
  }
  return [...names];
}

test('HotDog preload covers every authored line and static scene sound without global audio', () => {
  const options = hotDogAudioLoadOptions();
  assert.deepEqual(options, {
    names: [...HOTDOG_AUDIO_CUE_NAMES],
    prefixes: [...HOTDOG_AUDIO_PREFIXES],
  });

  for (const line of hotDogPartyVoiceLines()) {
    assert.equal(isHotDogAudioPreloadCue(line.cue), true, line.cue);
  }
  for (const cue of staticAudioCueNames('src/bing/hotdog-main.js')) {
    assert.equal(isHotDogAudioPreloadCue(cue), true, cue);
  }

  assert.equal(isHotDogAudioPreloadCue('vo.graveyard.snow.done'), false);
  assert.equal(isHotDogAudioPreloadCue('vo.initiation.ceremony.open'), false);
});

test('Graveyard preload covers every memorial line and static scene sound without global audio', () => {
  const options = graveyardAudioLoadOptions();
  assert.deepEqual(options, {
    names: [...GRAVEYARD_AUDIO_CUE_NAMES],
    prefixes: [...GRAVEYARD_AUDIO_PREFIXES],
  });

  for (const line of graveyardVoiceLines()) {
    assert.equal(isGraveyardAudioPreloadCue(line.cue), true, line.cue);
  }
  for (const cue of staticAudioCueNames('src/graveyard/main.js')) {
    assert.equal(isGraveyardAudioPreloadCue(cue), true, cue);
  }

  assert.equal(isGraveyardAudioPreloadCue('vo.bing2.hogmama.set.1'), false);
  assert.equal(isGraveyardAudioPreloadCue('vo.motel.snow.open.1'), false);
});

test('NO WAKE preload covers its whole script, static sounds, and exact persistent-radio bank', () => {
  const radio = new Radio(
    { ready: false },
    { setRadio() {}, toast() {} },
    { hour: 12.75 },
    { canPlayNotice: () => false },
  );
  const radioCueNames = radio.preloadCueNames({ hours: [12.75, 15, 17] });
  const options = noWakeAudioLoadOptions(radioCueNames);

  assert.deepEqual(options, {
    names: [...new Set([...radioCueNames, ...NO_WAKE_AUDIO_CUE_NAMES])],
    prefixes: [...NO_WAKE_AUDIO_PREFIXES],
  });
  for (const cue of radioCueNames) {
    assert.equal(isNoWakeAudioPreloadCue(cue, radioCueNames), true, cue);
  }
  for (const line of allNoWakeVoiceLines()) {
    const cue = `vo.nowake.${line.cue}`;
    assert.equal(isNoWakeAudioPreloadCue(cue, radioCueNames), true, cue);
  }
  for (const cue of staticAudioCueNames('src/nowake/main.js')) {
    assert.equal(isNoWakeAudioPreloadCue(cue, radioCueNames), true, cue);
  }

  assert.equal(isNoWakeAudioPreloadCue('vo.bing2.hogmama.set.1', radioCueNames), false);
  assert.equal(isNoWakeAudioPreloadCue('vo.graveyard.snow.done', radioCueNames), false);
});
