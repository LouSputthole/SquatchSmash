import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFamilyScripts } from '../src/bing/family.js';
import {
  AMBIENT,
  BARTENDER_CAPACITY_LINE,
  bingStandaloneVoiceLines,
  bingVoiceForSpeaker,
  buildScripts,
  plainWords,
} from '../src/bing/script.js';
import { buildSecondVisitLouScript, SecondVisitMission } from '../src/bing/second-visit.js';
import {
  checkBingVoiceManifest,
  collectBingVoiceCues,
  syncBingVoiceManifest,
} from '../tools/bing-vo.mjs';

function valueOf(value) {
  return typeof value === 'function' ? value() : value;
}

function isSpoken(text) {
  const plain = String(text ?? '').replace(/<[^>]*>/g, '').trim();
  return /[a-z0-9]/i.test(plain) && !(plain.startsWith('(') && plain.endsWith(')'));
}

function uncuedLines(trees) {
  const missing = [];
  for (const [scope, tree] of Object.entries(trees)) {
    for (const [nodeId, node] of Object.entries(tree)) {
      if (isSpoken(valueOf(node?.line)) && !valueOf(node?.cue)) {
        missing.push(`${scope}.${nodeId}.line`);
      }
      for (const option of valueOf(node?.options) || []) {
        if (isSpoken(valueOf(option?.text)) && !valueOf(option?.cue)) {
          missing.push(`${scope}.${nodeId}.option:${valueOf(option.text)}`);
        }
      }
    }
  }
  return missing;
}

function generatedVoiceLines(trees) {
  const lines = [];
  for (const [scope, tree] of Object.entries(trees)) {
    for (const node of Object.values(tree)) {
      const line = plainWords(valueOf(node?.line));
      const cue = valueOf(node?.cue);
      if (line && cue?.startsWith('vo.bing.full.')) {
        lines.push({ name: cue, voice: bingVoiceForSpeaker(scope, valueOf(node?.who)), say: line });
      }
      for (const option of valueOf(node?.options) || []) {
        const text = plainWords(valueOf(option?.text));
        const optionCue = valueOf(option?.cue);
        if (text && optionCue?.startsWith('vo.bing.full.')) {
          lines.push({ name: optionCue, voice: 'player', say: text });
        }
      }
    }
  }
  return lines;
}

test('every spoken Family line and reply leaves the script factory with an exact cue', () => {
  for (const shotDone of [false, true]) {
    const scripts = buildFamilyScripts({ shotDone: () => shotDone });
    assert.deepEqual(uncuedLines(scripts), [], `shotDone=${shotDone}`);
  }
});

function firstVisitContext(overrides = {}) {
  return {
    mission: {
      waited: overrides.waited ?? 0,
      note() {},
      louDone() {},
      parcelOut() {},
    },
    flags: {
      gotPackage: overrides.gotPackage ?? false,
      jackpot: overrides.jackpot ?? false,
      heardAboutCar: overrides.heardAboutCar ?? true,
      sawCar: overrides.sawCar ?? true,
    },
    money: () => 100,
    drunkLevel: () => overrides.drunk ?? 0,
    spins: () => overrides.spins ?? 0,
    hands: () => 0,
    asked: new Set(),
    order() {},
    request() {},
    sitAtTable() {},
    showParcel() {},
    showEnvelope() {},
    secondVisit: () => overrides.secondVisit ?? false,
  };
}

test('every first-visit Bing conversation leaves the script factory with an exact cue', () => {
  for (const variant of [
    {}, { gotPackage: true }, { drunk: 0.7 }, { spins: 2 }, { jackpot: true },
    { waited: 360 }, { waited: 500 }, { secondVisit: true },
  ]) {
    assert.deepEqual(uncuedLines(buildScripts(firstVisitContext(variant))), [], JSON.stringify(variant));
  }
});

test('every second-visit Lou line and reply leaves the script factory with an exact cue', () => {
  const lou = buildSecondVisitLouScript({ mission: new SecondVisitMission() });
  assert.deepEqual(uncuedLines({ lou }), []);
});

test('the Bing recording ledger includes every generated line in every runtime branch', () => {
  const runtimeLines = [];
  for (const variant of [
    {}, { gotPackage: true }, { drunk: 0.7 }, { spins: 2 }, { jackpot: true },
    { waited: 360 }, { waited: 500 }, { secondVisit: true },
  ]) {
    runtimeLines.push(...generatedVoiceLines(buildScripts(firstVisitContext(variant))));
  }
  for (const shotDone of [false, true]) {
    runtimeLines.push(...generatedVoiceLines(buildFamilyScripts({ shotDone: () => shotDone })));
  }
  runtimeLines.push(...generatedVoiceLines({
    lou: buildSecondVisitLouScript({ mission: new SecondVisitMission() }),
  }));

  const ledger = new Map(collectBingVoiceCues().map((cue) => [cue.name, cue]));
  for (const expected of runtimeLines) {
    assert.deepEqual(ledger.get(expected.name), expected, expected.name);
  }
});

test('ambient chatter, Shubenator signature, and bar capacity refusal are ledger-owned', () => {
  const standalone = bingStandaloneVoiceLines();
  const ledger = new Map(collectBingVoiceCues().map((cue) => [cue.name, cue]));
  assert.equal(standalone.length, AMBIENT.length + 2);
  assert.equal(BARTENDER_CAPACITY_LINE.voice, 'bartender');
  assert.equal(standalone.find((line) => line.cue === 'vo.bing.ambient.05')?.voice, 'performer');
  for (const line of standalone) {
    assert.match(line.cue, /^vo\.bing\./);
    assert.deepEqual(ledger.get(line.cue), {
      name: line.cue,
      voice: line.voice,
      say: plainWords(line.line),
      ...(line.direction ? { direction: line.direction } : {}),
    });
  }
});

test('Bing manifest sync replaces only generated exact cues and stays pure', () => {
  const original = {
    voices: { player: { id: 'keep' } },
    sfx: [
      { name: 'radio.click', file: 'keep.wav' },
      { name: 'vo.bing.door.in.1', voice: 'doorman', say: 'Keep this authored take.' },
      { name: 'vo.bing.full.stale.line.dead', voice: 'lou', say: 'stale' },
      { name: 'vo.bing.ambient.stale', voice: 'doorman', say: 'stale ambient' },
    ],
  };
  const snapshot = structuredClone(original);
  const synced = syncBingVoiceManifest(original);

  assert.deepEqual(original, snapshot);
  assert.deepEqual(synced.voices, original.voices);
  assert.deepEqual(synced.sfx.slice(0, 2), original.sfx.slice(0, 2));
  assert.equal(synced.sfx.some((cue) => cue.name.includes('.stale.')), false);
  assert.deepEqual(synced.sfx.slice(2), collectBingVoiceCues());
  assert.deepEqual(checkBingVoiceManifest(synced), []);
});

test('the recording ledger contains spoken words, never acting directions or silent choices', () => {
  const cues = collectBingVoiceCues();
  for (const cue of cues) {
    assert.match(cue.say, /[a-z0-9]/i, cue.name);
    assert.doesNotMatch(cue.say, /\([^)]*\)/, cue.name);
  }
  assert.equal(cues.some((cue) => /^(say nothing|walk past|leave her to it)\.?$/i.test(cue.say)), false);
});

test('generated NPC lines resolve their character voice while replies stay player-owned', () => {
  assert.equal(bingVoiceForSpeaker('lag', 'LAG'), 'lag');
  assert.equal(bingVoiceForSpeaker('captain_lou_sasole', 'Captain Lou Sasole'), 'lou2');
  assert.equal(bingVoiceForSpeaker('booskiShot', 'Booskibro'), 'booski');
  assert.equal(bingVoiceForSpeaker('lou', 'Lou'), 'lou1');
  assert.ok(collectBingVoiceCues()
    .filter((cue) => cue.name.includes('.tony.'))
    .every((cue) => cue.voice === 'player'));
});

test('Bing voice check reports missing, drifted, stale and duplicate generated cues', () => {
  const synced = syncBingVoiceManifest({ sfx: [] });
  const bad = structuredClone(synced);
  const removed = bad.sfx.shift();
  bad.sfx[0].say = 'wrong words';
  bad.sfx.push({ name: 'vo.bing.full.stale.line.dead', voice: 'lou', say: 'stale' });
  bad.sfx.push({ ...bad.sfx[1] });

  const failures = checkBingVoiceManifest(bad).join('\n');
  assert.match(failures, new RegExp(`missing cue ${removed.name.replaceAll('.', '\\.')}\\b`));
  assert.match(failures, /drifted cue /);
  assert.match(failures, /stale cue vo\.bing\.full\.stale\.line\.dead/);
  assert.match(failures, /duplicate cue /);
});
