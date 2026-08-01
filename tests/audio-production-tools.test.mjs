import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAudioTodo } from '../tools/audio-todo-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the legacy production-queue check runs on Windows and is current', () => {
  const result = spawnSync(process.execPath, ['tools/sound-queue.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stderr, /ERR_UNSUPPORTED_ESM_URL_SCHEME/);
  assert.match(result.stdout, /production queue: up to date/);
  assert.match(result.stdout, /coverage: every cue played by the code has a queue entry/);
});

test('the recording handoff groups manifest pickups and quarantines legacy briefs', () => {
  const markdown = buildAudioTodo({
    manifest: {
      voices: {
        lou2: { id: 'lou-voice', _note: 'Captain Sasole direction.' },
      },
      sfx: [
        { name: 'vo.beefrun.sasole.test.1', voice: 'lou2', say: 'Keep the nose down.' },
        { name: 'vo.beefrun.sasole.test-alias.1', voice: 'lou2', say: 'Keep the nose down.' },
        { name: 'vo.bing.recorded.1', voice: 'lou2', say: 'Already delivered.' },
        { name: 'vo.initiation.party.future.1', voice: 'lou2', say: 'Future party line.' },
        { name: 'water.splash', prompt: 'A heavy splash.', duration: 2.2 },
      ],
    },
    index: { files: ['vo.bing.recorded.1.mp3'], versions: {} },
    legacyQueue: {
      sfx: [
        { id: 'motel.doors.knock', scene: 'motel', category: 'doors', call: 'knock', file: 'audio/motel/knock.wav', description: 'Three knocks.', seconds: 1, variations: 2, status: 'todo' },
        { id: 'motel.design.unwired', scene: 'motel', category: 'design', call: null, file: 'audio/motel/unwired.wav', description: 'A future idea.', seconds: 1, variations: 1, status: 'todo' },
      ],
      ambience: [
        { id: 'motel.ambience.room', scene: 'motel', file: 'audio/motel/room.wav', description: 'Room tone.', seconds: 20, loop: true, status: 'todo' },
      ],
      music: [
        { id: 'campground.music.run', scene: 'campground', file: 'audio/campground/run.wav', description: 'Original score.', seconds: 90, loop: true, status: 'todo' },
      ],
    },
  });

  assert.match(markdown, /2 voice cue files representing 1 unique profile\/text performance, plus 1 manifest effect/);
  assert.match(markdown, /1 duplicate group avoids 1 redundant recording/);
  assert.equal((markdown.match(/PERFORMANCE REUSE GROUP 1/g) || []).length, 2);
  assert.match(markdown, /Future authored Initiation party dialogue: 1 total; 0 indexed and 1 missing/);
  assert.match(markdown, /not instantiated by the playable Initiation scene/i);
  assert.match(markdown, /Voice pickups — The Beef Run/);
  assert.match(markdown, /Voice profile: `lou2`/);
  assert.match(markdown, /vo\.beefrun\.sasole\.test\.1\.mp3/);
  assert.doesNotMatch(markdown, /Already delivered/);
  assert.match(markdown, /Manifest effect pickups — NO WAKE/);
  assert.match(markdown, /Legacy production review backlog — 4 briefs/);
  assert.match(markdown, /not drop-in runtime filenames/i);
  assert.match(markdown, /wired local hook `knock`/);
  assert.match(markdown, /UNWIRED DESIGN BRIEF/);
});

test('the standard voice generation command excludes unreachable party dialogue', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const generator = fs.readFileSync(path.join(ROOT, 'tools/generate-sfx.mjs'), 'utf8');
  assert.match(packageJson.scripts['sfx:vo'], /--voice-only --live-only/);
  assert.match(generator, /const LIVE_ONLY = has\('--live-only'\)/);
  assert.match(generator, /if \(LIVE_ONLY \|\| !INCLUDE_FUTURE\) cues = cues\.filter\(\(cue\) => !isFutureInitiationPartyCue\(cue\)\)/);
});

test('delivered provisional takes stay visible as casting review work', () => {
  const markdown = buildAudioTodo({
    manifest: {
      voices: {
        'motel-rico': { id: 'audition-id', _note: 'PROVISIONAL casting; approve this voice.' },
      },
      sfx: [
        { name: 'vo.motel.rico.test.1', voice: 'motel-rico', say: 'You came alone.' },
      ],
    },
    index: { files: ['vo.motel.rico.test.1.mp3'] },
    legacyQueue: {},
  });
  assert.match(markdown, /Provisional casting review — 1 voice profile/);
  assert.match(markdown, /MOTEL RICO — 1 indexed, 0 missing/);
  assert.match(markdown, /playable demo takes, not automatic approval/);
});

test('the committed recording handoff matches the current production sources', () => {
  const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  const expected = buildAudioTodo({
    manifest: readJson('assets/sfx/manifest.json'),
    index: readJson('assets/sfx/index.json'),
    legacyQueue: readJson('assets/audio/sound-queue.json'),
  });
  const committed = fs.readFileSync(path.join(ROOT, 'VOICE-LINES-TODO.md'), 'utf8');

  assert.equal(committed, expected,
    'VOICE-LINES-TODO.md drifted; run `npm run audio:todo` after cue or recording changes');
});
