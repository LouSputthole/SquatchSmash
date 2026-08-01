import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { allMotelVoiceLines } from '../src/motel/voice-catalog.js';
import {
  MOTEL_VOICE_PROFILE,
  motelSpokenWords,
  motelVoiceCue,
} from '../src/motel/voice.js';

test('every Motel character line has a stable exact cue and cast profile', () => {
  const lines = allMotelVoiceLines();
  assert.ok(lines.length >= 150, `${lines.length} Motel lines were cataloged`);
  assert.equal(new Set(lines.map((line) => line.cue)).size, lines.length);
  assert.equal(lines.every((line) => line.cue === motelVoiceCue(line.speaker, line.text)), true);
  assert.equal(lines.every((line) => line.voice && line.text), true);
  assert.equal(lines.some((line) => line.speaker === '*'), false);
});

test('the Motel runtime auto-cues every spoken say call from its exact words', () => {
  const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
  assert.match(source, /motelVoiceCue\(who, line\)/);
  assert.match(source, /const requestedCue = who === '\*' \? null : motelVoiceCue\(who, line\)/);
});

test('every directly-authored Motel say literal is present in the generated catalog', () => {
  const source = fs.readFileSync(new URL('../src/motel/main.js', import.meta.url), 'utf8');
  const authored = new Set(allMotelVoiceLines().map((line) => line.cue));
  const literal = String.raw`(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")`;
  const calls = new RegExp(`\\bsay\\(\\s*(${literal}|ALLY)\\s*,\\s*(${literal})`, 'g');
  const evaluateLiteral = (value) => Function(`"use strict"; return (${value});`)();
  const missing = [];
  for (const match of source.matchAll(calls)) {
    const speaker = match[1] === 'ALLY' ? 'Snow' : evaluateLiteral(match[1]);
    if (speaker === '*') continue;
    const text = evaluateLiteral(match[2]);
    const cue = motelVoiceCue(speaker, text);
    if (!authored.has(cue)) missing.push(`${speaker}: ${text}`);
  }
  assert.deepEqual(missing, []);
});

test('stage directions are display copy, not recording copy', () => {
  assert.equal(motelSpokenWords('<em>(Quietly.)</em> The case is open.'), 'The case is open.');
  assert.equal(motelSpokenWords('*(a nod)*'), '');
  assert.equal(motelVoiceCue('*', 'The door opens.'), null);
});

test('Motel antagonists do not borrow recurring Family or Bing guard voices', () => {
  assert.equal(MOTEL_VOICE_PROFILE.Rico, 'motel-rico');
  assert.equal(MOTEL_VOICE_PROFILE.Chino, 'motel-chino');
  assert.equal(MOTEL_VOICE_PROFILE.Clerk, 'npc-male');
  assert.notEqual(MOTEL_VOICE_PROFILE.Rico, 'cecilio');
  assert.notEqual(MOTEL_VOICE_PROFILE.Chino, 'doorman');
});
