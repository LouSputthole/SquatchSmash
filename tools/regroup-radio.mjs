#!/usr/bin/env node
/**
 * Regroup the radio's flat line pools into conversational exchanges.
 *
 *   node tools/regroup-radio.mjs > /tmp/shows.js
 *
 * The station used to pick single lines at random out of a bag, which is why
 * it never sounded like a conversation: two hosts, and no exchange between
 * them. This groups the existing lines into runs that already read as a bit --
 * setup, turn, payoff -- and leaves every line string byte-identical, because
 * the generated host audio is keyed on the exact text and regenerating 242
 * clips to reflow a data structure would be absurd.
 *
 * GROUPS below is the editorial pass: indices into each show's original array,
 * in the order they should air. Any index not listed still gets aired, as a
 * one-line exchange of its own -- so nothing written is silently dropped, and
 * the check at the bottom fails the run if anything goes missing.
 */
import fs from 'node:fs';

const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: regroup-radio.mjs <lines.json>');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

/** show name -> array of index-runs that form one exchange each. */
const GROUPS = {
  'Lou & Lou': [
    [9, 21, 22], [0, 1, 2], [12, 13, 14], [17, 18, 19],
    [6, 16], [4, 10, 20], [25, 26, 27], [3, 5],
    [7, 8], [11, 15], [23, 24], [28, 29],
  ],
  'The Rerun Hour': [
    [0, 7, 8], [1, 2], [3, 4], [5, 6], [9, 10],
    [11, 12], [13, 14, 15],
  ],
  'Booski & Ape’s CS Gambling Show': [
    [0, 22, 23], [2, 3], [12, 13, 14], [18, 19, 20],
    [16, 17], [9, 10, 11], [5, 24, 25], [1, 6],
    [8, 4], [15, 21], [7, 26, 27],
  ],
  'Irish’s Deep Dives': [],
  'What’s Happening in India!': [],
  'The Squatch Evening Desk': [],
  'Hog Mama’s Late Night Improv': [],
};

const esc = (s) => JSON.stringify(s).replace(/’/g, '\\u2019').replace(/…/g, '\\u2026');

function exchangesFor(show) {
  const runs = GROUPS[show.name] || [];
  const used = new Set();
  const out = [];
  for (const run of runs) {
    const lines = run.filter((i) => i < show.lines.length).map((i) => { used.add(i); return show.lines[i]; });
    if (lines.length) out.push(lines);
  }
  // Anything not placed by hand still airs, on its own.
  for (let i = 0; i < show.lines.length; i++) if (!used.has(i)) out.push([show.lines[i]]);
  return out;
}

const chunks = [];
for (const show of data.shows) {
  if (show.name.startsWith('__music__')) continue;
  const ex = exchangesFor(show);
  const total = ex.reduce((n, e) => n + e.length, 0);
  if (total !== show.lines.length) {
    console.error(`LOST LINES in ${show.name}: ${total} of ${show.lines.length}`);
    process.exit(1);
  }
  chunks.push(`  {
    from: ${show.from}, to: ${show.to},
    name: ${esc(show.name)},
    strap: ${esc(show.strap)},
    exchanges: [
${ex.map((e) => `      [\n${e.map((l) => `        ${esc(l)},`).join('\n')}\n      ],`).join('\n')}
    ],
  },`);
}
console.log(`const SQUATCH_SHOWS = [\n${chunks.join('\n')}\n];`);
console.error(`ok: ${data.shows.filter((s) => !s.name.startsWith('__music__')).length} shows regrouped`);
