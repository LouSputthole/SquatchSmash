import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  CEREMONY_BEATS,
  QUIZ_OPTIONS,
  allCeremonyVoiceLines,
} from '../src/initiation/dialogue.js';
import {
  allNpcVoiceLines,
  NpcSystem,
  ROSTER,
  voicedAmbientLine,
} from '../src/initiation/npc.js';
import * as initiationAudio from '../src/initiation/audio.js';
import { scriptCues } from '../src/initiation/script.js';
import {
  initiationManifestCues,
  initiationManifestDrift,
  initiationVoiceProfileGaps,
} from '../tools/initiation-vo-lib.mjs';

test('every spoken Initiation ceremony line has one stable exact voice cue', () => {
  const lines = allCeremonyVoiceLines();

  assert.equal(lines.length, 32);
  assert.equal(new Set(lines.map((line) => line.cue)).size, lines.length);
  assert.equal(lines.every((line) => line.cue.startsWith('vo.initiation.')), true);
  assert.equal(lines.filter((line) => line.cue.startsWith('vo.initiation.ceremony.')).length, 32);
  assert.equal(CEREMONY_BEATS.q1[2].voice, 'doorman');
  assert.equal(QUIZ_OPTIONS.every((line) => line.voice === 'player'), true);
  assert.equal(lines.every((line) => line.voice && line.say), true);
  assert.equal(lines.every((line) => !line.say.includes('*(')), true);
  assert.deepEqual(
    Object.fromEntries(Object.entries(CEREMONY_BEATS).map(([beat, entries]) => [beat, entries.length])),
    {
      speech: 7,
      q1: 5,
      q2: 3,
      correct: 3,
      wrong: 2,
      endured: 3,
      roar: 2,
      anoint: 3,
      retry: 1,
    },
  );
});

test('the Initiation audio receiver accepts the ceremony exact cue before a recording exists', () => {
  const line = allCeremonyVoiceLines()[0];
  initiationAudio.voiceRequested.clear();

  assert.equal(initiationAudio.voice(line.cue), 0);
  assert.deepEqual([...initiationAudio.voiceRequested], [line.cue]);
});

test('every speakable Initiation party line has a cue in its actual member voice', () => {
  const lines = allNpcVoiceLines();

  assert.equal(lines.length, 128);
  assert.equal(new Set(lines.map((line) => line.cue)).size, lines.length);
  assert.equal(lines.every((line) => line.cue.startsWith('vo.initiation.')), true);
  assert.equal(lines.every((line) => line.voice && line.say), true);
  assert.equal(lines.every((line) => !line.say.includes('*(')), true);
  assert.equal(ROSTER.every((member) => member.voice), true);

  const headlock = lines.find((line) => line.text.includes('headlock'));
  assert.equal(headlock.say, 'Brother.');
  assert.equal(lines.some((line) => line.text === '*(a nod)*'), false);
});

test('Erican, Gratin, Sasole and Snow own distinct welcome, toast and suspicion beats', () => {
  const lines = allNpcVoiceLines();
  const expectedVoices = {
    erican: 'eric',
    gratin: 'gratin',
    captain_lou_sasole: 'lou2',
    snow: 'snow',
  };

  for (const [speaker, voice] of Object.entries(expectedVoices)) {
    const authored = lines.filter((line) => line.speaker === speaker && line.occasion);
    assert.deepEqual(authored.map((line) => line.occasion), ['welcome', 'toast', 'suspicion']);
    assert.equal(authored.every((line) => line.voice === voice), true, `${speaker} lost its actor`);
    assert.equal(new Set(authored.map((line) => line.say)).size, 3, `${speaker} repeats itself`);
  }

  const normal = new NpcSystem({ rng: () => 0 });
  normal.seedStanding();
  for (const speaker of Object.keys(expectedVoices)) {
    assert.equal(
      normal.greet(speaker).text,
      lines.find((line) => line.speaker === speaker && line.occasion === 'welcome').text,
      `${speaker} did not lead with its own welcome`,
    );
  }

  const ericanFallback = normal.greet('erican');
  assert.equal(ericanFallback.text, 'Welcome, brother. My initiation was worse. Everybody says that. Mine actually was.',
    'the generic utility bank should remain available only after Erican spends his authored sober beat');

  for (const speaker of Object.keys(expectedVoices)) {
    const toast = new NpcSystem({ rng: () => 0 });
    toast.seedStanding();
    toast.setDrunk(speaker, 0.3);
    toast.greet(speaker); // member-specific welcome first
    assert.equal(
      toast.greet(speaker).text,
      lines.find((line) => line.speaker === speaker && line.occasion === 'toast').text,
      `${speaker} did not own its toast`,
    );

    const suspicious = new NpcSystem({ route: 'rat', rng: () => 0 });
    suspicious.seedStanding();
    suspicious.get(speaker).suspicion = 100;
    assert.equal(
      suspicious.greet(speaker).text,
      lines.find((line) => line.speaker === speaker && line.occasion === 'suspicion').text,
      `${speaker} did not own its suspicion line`,
    );
  }
});

test('party greetings and ambient exchanges expose their exact delivery cues', () => {
  const party = new NpcSystem({ rng: () => 0 });
  const greeting = party.greet('booski');
  const ambient = party.ambientBark();

  assert.equal(greeting.cue.startsWith('vo.initiation.party.booski.'), true);
  assert.equal(greeting.voice, 'booski');
  assert.equal(greeting.say, greeting.text);
  assert.equal(ambient.every((line) => line.cue && line.voice && line.say), true);
  assert.equal(ambient.every((line) => line.cue.startsWith('vo.initiation.ambient.')), true);
  assert.throws(
    () => voicedAmbientLine(undefined, 'An orphaned authored line.'),
    /Unknown Initiation ambient speaker/,
  );
});

test('the Initiation manifest catalog contains ceremony, party, and active cabin delivery exactly once', () => {
  const cues = initiationManifestCues();
  const cabin = scriptCues();

  assert.equal(cues.length, 160 + cabin.length);
  assert.equal(new Set(cues.map((cue) => cue.name)).size, cues.length);
  assert.equal(cues.every((cue) => cue.name.startsWith('vo.initiation.')), true);
  assert.equal(cues.every((cue) => cue.voice && cue.say), true);
  const byName = new Map(cues.map((cue) => [cue.name, cue]));
  for (const cue of cabin) assert.deepEqual(byName.get(cue.name), cue);
});

test('Initiation manifest drift separates missing, stale, text and voice changes', () => {
  const expected = [
    { name: 'vo.initiation.a', voice: 'booski', say: 'A' },
    { name: 'vo.initiation.b', voice: 'lou', say: 'B' },
    { name: 'vo.initiation.c', voice: 'player', say: 'C' },
  ];
  const manifest = {
    voices: { booski: { id: '1' }, lou: { id: '2' }, player: { id: '3' } },
    sfx: [
      { name: 'vo.initiation.a', voice: 'booski', say: 'changed' },
      { name: 'vo.initiation.b', voice: 'player', say: 'B' },
      { name: 'vo.initiation.stale', voice: 'lou', say: 'old' },
    ],
  };
  const drift = initiationManifestDrift(manifest, expected);

  assert.deepEqual(drift.missing.map((cue) => cue.name), ['vo.initiation.c']);
  assert.deepEqual(drift.stale.map((cue) => cue.name), ['vo.initiation.stale']);
  assert.deepEqual(drift.textDrift.map((cue) => cue.name), ['vo.initiation.a']);
  assert.deepEqual(drift.voiceDrift.map((cue) => cue.name), ['vo.initiation.b']);
  assert.deepEqual(drift.duplicateNames, []);
});

test('every generated Initiation voice profile is configured in the manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(
    new URL('../assets/sfx/manifest.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(initiationVoiceProfileGaps(manifest), []);
});
