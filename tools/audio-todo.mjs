#!/usr/bin/env node
/**
 * Build the complete audio-production handoff.
 *
 *   npm run audio:todo             write VOICE-LINES-TODO.md
 *   npm run audio:todo -- --check  fail when the committed handoff has drifted
 *
 * The shared assets/sfx manifest is the runtime authority. The older
 * assets/audio production queue is included as a clearly quarantined review
 * backlog because its proposed WAV paths are not loaded by the game.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAudioTodo } from './audio-todo-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'VOICE-LINES-TODO.md');
const CHECK = process.argv.includes('--check');
const unknown = process.argv.slice(2).filter((arg) => arg !== '--check');

if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(', ')}. Supported: --check`);
  process.exit(1);
}

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const markdown = buildAudioTodo({
  manifest: readJson('assets/sfx/manifest.json'),
  index: readJson('assets/sfx/index.json'),
  legacyQueue: readJson('assets/audio/sound-queue.json'),
});

if (CHECK) {
  let current = '';
  try {
    current = fs.readFileSync(DEST, 'utf8');
  } catch {
    // A missing handoff is simply an out-of-date handoff.
  }
  if (current !== markdown) {
    console.error('VOICE-LINES-TODO.md is out of date. Run `npm run audio:todo`.');
    process.exit(1);
  }
  console.log('VOICE-LINES-TODO.md is up to date.');
} else {
  fs.writeFileSync(DEST, markdown);
  console.log('Wrote VOICE-LINES-TODO.md.');
}
