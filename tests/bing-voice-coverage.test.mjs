import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import { buildFamilyScripts } from '../src/bing/family.js';
import {
  AMBIENT,
  BARTENDER_CAPACITY_LINE,
  BING_DEALER_VOICE_PROFILE,
  bingStandaloneVoiceLines,
  bingVoiceForCue,
  bingVoiceForSpeaker,
  buildScripts,
  plainWords,
} from '../src/bing/script.js';
import { buildSecondVisitLouScript, SecondVisitMission } from '../src/bing/second-visit.js';
import {
  bingTreeLines,
  checkBingLegacyVoiceCasting,
  checkBingTreeDrift,
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

test('Lou briefs the first Motel run as the Sal and McClawsky sit-down', () => {
  const { lou } = buildScripts(firstVisitContext());
  const authored = Object.values(lou).flatMap((node) => [
    plainWords(valueOf(node?.line)),
    ...(valueOf(node?.options) || []).map((option) => plainWords(valueOf(option?.text))),
  ]).join(' ');

  assert.match(plainWords(lou.envelope.line), /Sal Sorrento.*Captain McClawsky/i);
  assert.match(plainWords(lou.sitdown.line), /Sal carries the offer.*McClawsky watches.*worth saying/i);
  assert.match(plainWords(lou.contact.line), /Sal Sorrento does the selling.*McClawsky watches and interrupts/i);
  assert.doesNotMatch(plainWords(lou.contact.line), /McClawsky does not/i,
    'the Bing briefing cannot promise silence from a man who speaks at the sit-down');
  assert.ok(lou.warning.options.some(({ next }) => next === 'sitdown'));
  assert.equal('jerky' in lou, false);
  assert.doesNotMatch(authored, /they['’]re jerky dealers/i);
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
  const ambientProfiles = new Set(standalone
    .filter((line) => line.cue.startsWith('vo.bing.ambient.'))
    .map((line) => line.voice));
  for (const profile of ['npc-male', 'npc-reserve-1', 'npc-reserve-2']) {
    assert.equal(ambientProfiles.has(profile), true, `${profile} has no Bing ambient line`);
  }
  assert.ok(ambientProfiles.size >= 5, 'Bing ambient chatter still sounds like one patron');
  assert.deepEqual(
    AMBIENT.map(([, , , , speakerKey]) => speakerKey),
    ['gossip1', 'gossip2', 'regular', 'patron0', 'waiter1', 'patron1', 'contractor', 'bouncer', 'patron2'],
    'every ambient line stays pinned to its visible club speaker',
  );
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
      { name: 'vo.bing.margo.6', voice: 'margo', say: 'Retired contradicted take.' },
      { name: 'vo.bing.full.stale.line.dead', voice: 'lou', say: 'stale' },
      { name: 'vo.bing.ambient.stale', voice: 'doorman', say: 'stale ambient' },
    ],
  };
  const snapshot = structuredClone(original);
  const synced = syncBingVoiceManifest(original);

  assert.deepEqual(original, snapshot);
  assert.deepEqual(synced.voices, original.voices);
  assert.deepEqual(synced.sfx.slice(0, 2), original.sfx.slice(0, 2));
  assert.equal(synced.sfx.some((cue) => cue.name === 'vo.bing.margo.6'), false);
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

test('the legacy blackjack bank stays on the locked dealer actor', () => {
  const oldBank = [
    { name: 'vo.bj.dealer.minimum.1', voice: 'uncle', say: 'Table minimum is twenty-five.' },
    { name: 'vo.bj.dealer.payout.1', voice: 'uncle', say: 'Paid.' },
  ];

  assert.equal(BING_DEALER_VOICE_PROFILE, 'dealer');
  assert.equal(bingVoiceForCue(oldBank[0].name, oldBank[0].voice), 'dealer');
  assert.deepEqual(
    checkBingLegacyVoiceCasting({ sfx: oldBank }).map((failure) => failure.split(':')[0]),
    ['drifted voice vo.bj.dealer.minimum.1', 'drifted voice vo.bj.dealer.payout.1'],
  );

  const synced = syncBingVoiceManifest({ sfx: oldBank });
  const corrected = synced.sfx.filter(({ name }) => name.startsWith('vo.bj.dealer.'));
  assert.deepEqual(corrected.map(({ name, voice, say }) => ({ name, voice, say })), [
    { name: oldBank[0].name, voice: 'dealer', say: oldBank[0].say },
    { name: oldBank[1].name, voice: 'dealer', say: oldBank[1].say },
  ]);
  assert.deepEqual(checkBingLegacyVoiceCasting({ sfx: corrected }), []);
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

/**
 * THE NINETY-NINE ROWS NOBODY HAD EVER COMPARED WITH ANYTHING.
 *
 * `checkBingVoiceManifest` compares text against tree for every cue the
 * generator MINTS, and the generator mints only `vo.bing.full.`. Every
 * hand-named tree cue -- `vo.bing.bar.*`, `vo.bing.hang.*`, `vo.bing.margo.*`
 * -- had a manifest row written by hand and checked by nobody, so rewriting
 * one of those lines left the booth recording the old wording with nothing
 * anywhere saying so. That is `docs/ENGINE-TRAPS.md` entry 3's shape exactly.
 */
test('a hand-named Bing line that no longer matches its recording is reported', () => {
  const tree = bingTreeLines();
  const [name, wordings] = [...tree].find(([cue]) => !cue.startsWith('vo.bing.full.')) ?? [];
  assert.ok(name, 'the Bing has no hand-named tree cues left to check');
  const said = [...wordings][0];

  assert.deepEqual(checkBingTreeDrift({ sfx: [{ name, voice: 'lou', say: said }] }), []);

  const drifted = checkBingTreeDrift({ sfx: [{ name, voice: 'lou', say: `${said} and one more thing` }] });
  assert.equal(drifted.length, 1);
  assert.match(drifted[0], new RegExp(name.replaceAll('.', '\\.')));
});

/**
 * AND IT DOES NOT REPORT A GLYPH. The first run of the check found thirty-one
 * rows and thirty of them were one character: the trees carry a curly
 * apostrophe and the hand-written rows a straight one. Nobody reads those
 * differently in a booth, and "fixing" them would have re-hashed thirty takes
 * and queued thirty good recordings for re-recording. It borrows the take
 * ledger's own `normaliseSay`, so this repo has one answer to "has this
 * recording gone stale" rather than two.
 */
test('curly quotes, dashes and case are not drift; a dropped ellipsis is', () => {
  const tree = bingTreeLines();
  const [name] = [...tree].find(([cue, words]) => !cue.startsWith('vo.bing.full.')
    && [...words][0].length > 12) ?? [];
  assert.ok(name, 'no hand-named cue long enough to retype');
  const said = [...tree.get(name)][0];

  const typography = said.replace(/[\u2019]/g, "'").replace(/[\u2014\u2013]/g, '-').toUpperCase();
  assert.deepEqual(
    checkBingTreeDrift({ sfx: [{ name, voice: 'lou', say: typography }] }), [],
    'a straight apostrophe is not a rewrite',
  );

  /* An ellipsis IS a direction about how the performer comes in, and
   * `vo.bing.margo.5` is the line that proved it: recorded flat, written on a
   * beat. Same words, different take. */
  const dropped = checkBingTreeDrift({ sfx: [{ name, voice: 'lou', say: `\u2026${said}` }] });
  assert.equal(dropped.length, 1);
});

/** The shipped manifest agrees with the shipped trees, which is the point. */
test('every hand-named Bing cue in the shipped manifest still says what the tree says', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'),
  );
  assert.deepEqual(checkBingTreeDrift(manifest), []);
});
