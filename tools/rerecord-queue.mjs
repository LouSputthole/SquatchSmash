#!/usr/bin/env node
/**
 * Stamp the re-record queue onto the manifest.
 *
 *   npm run vo:rerecord          apply the queue
 *   npm run check:rerecord       report drift without writing
 *
 * A line that gets rewritten after it has already been recorded needs its take
 * marked, or the booth sheet keeps reporting it as done and the game ships the
 * old wording. `needsRerecord` on the manifest cue is the flag that does that --
 * both `voice-needed.mjs` and `audio-todo-lib.mjs` honour it.
 *
 * The flag cannot simply be typed into the manifest, because most spoken cues
 * are generated: `npm run vo:sync` has each scene's `*-vo.mjs` rewrite its whole
 * block from the scene source, and anything hand-added to those blocks is
 * dropped on the next sync without a word. So the queue lives in
 * `assets/sfx/rerecord.json` and is re-stamped here, at the end of vo:sync.
 *
 * Cues whose id embeds a text hash (`vo.bing.full.*`, `vo.silver.*`) are not in
 * the queue: changing their words changes their id and their filename, so the
 * new cue has no recording and shows up as missing on its own.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const QUEUE = path.join(ROOT, 'assets/sfx/rerecord.json');
const CHECK = process.argv.includes('--check');

/**
 * Production metadata, not authored content. A scene's `*-vo.mjs` derives its
 * cues from the scene source, so these two keys are never in what a generator
 * produces -- a drift check that compares whole cue objects has to ignore them
 * or every re-recorded line reads as drift.
 */
export const RERECORD_FIELDS = ['needsRerecord', 'rerecordReason'];

/** A copy of `cue` with the re-record metadata removed. */
export function withoutRerecord(cue) {
  if (!cue || typeof cue !== 'object') return cue;
  const copy = { ...cue };
  for (const field of RERECORD_FIELDS) delete copy[field];
  return copy;
}

/**
 * Which cues disagree with the queue: queued lines that are not marked, and
 * marked lines that are no longer queued. `npm run check` reports this so a
 * bare `npm run vo:<scene>` cannot quietly strip a flag off a generated cue
 * and leave the booth sheet claiming the old take still stands.
 */
export function rerecordDrift(manifest, queue) {
  const byName = new Map((manifest.sfx ?? []).map((cue) => [cue.name, cue]));
  const queued = new Set((queue.lines ?? []).map((entry) => entry.cue));
  const problems = [];
  for (const entry of queue.lines ?? []) {
    const cue = byName.get(entry.cue);
    if (!cue) problems.push(`queued cue ${entry.cue} is not in the manifest`);
    else if (cue.needsRerecord !== true) problems.push(`unmarked cue ${entry.cue}`);
    else if (cue.say === entry.retiredText) problems.push(`settled cue ${entry.cue} — remove it from the queue`);
  }
  for (const cue of manifest.sfx ?? []) {
    if (cue.needsRerecord === true && !queued.has(cue.name)) problems.push(`stray mark on ${cue.name}`);
  }
  return problems;
}

/**
 * Rewrite one cue's object inside the manifest TEXT rather than reserialising
 * the file. The manifest is not canonical `JSON.stringify` output, so a whole
 * file rewrite moves thousands of lines that nobody touched and buries the
 * handful that changed. Everything outside the matched block is left byte for
 * byte alone.
 */
function patchCueBlock(raw, name, mutate) {
  const pattern = new RegExp(
    `    \\{\\n(?:      .*\\n)*?      "name": "${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}",?\\n(?:      .*\\n)*?    \\}`,
  );
  const match = raw.match(pattern);
  if (!match) throw new Error(`no manifest block for cue ${name}`);
  const obj = JSON.parse(match[0]);
  if (!mutate(obj)) return raw;
  /* match[0] starts at the block's own indent, so every line of the
   * replacement carries it -- including the opening brace. */
  const body = JSON.stringify(obj, null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return raw.slice(0, match.index) + body + raw.slice(match.index + match[0].length);
}

function main() {
  const queue = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
  let raw = fs.readFileSync(MANIFEST, 'utf8');
  const manifest = JSON.parse(raw);
  const byName = new Map(manifest.sfx.map((cue) => [cue.name, cue]));

  const missing = [];
  const applied = [];
  const settled = [];

  for (const entry of queue.lines ?? []) {
    const cue = byName.get(entry.cue);
    if (!cue) {
      missing.push(entry.cue);
      continue;
    }
    if (cue.say === entry.retiredText) {
      /* The words went back to what was already recorded, so the take stands
       * and the queue entry is stale rather than the recording. */
      settled.push(entry.cue);
      continue;
    }
    if (cue.needsRerecord === true && cue.rerecordReason === entry.reason) continue;
    applied.push(entry.cue);
    if (!CHECK) {
      raw = patchCueBlock(raw, cue.name, (obj) => {
        obj.needsRerecord = true;
        obj.rerecordReason = entry.reason;
        return true;
      });
    }
  }

  /* A cue that carries the flag but is no longer queued has been re-recorded
   * and its entry removed; drop the flag with it. */
  const cleared = [];
  const queued = new Set((queue.lines ?? []).map((e) => e.cue));
  for (const cue of manifest.sfx) {
    if (cue.needsRerecord === true && !queued.has(cue.name)) {
      cleared.push(cue.name);
      if (!CHECK) {
        raw = patchCueBlock(raw, cue.name, (obj) => {
          delete obj.needsRerecord;
          delete obj.rerecordReason;
          return true;
        });
      }
    }
  }

  if (missing.length) {
    process.stderr.write(`rerecord.json names ${missing.length} cue(s) that are not in the manifest:\n`);
    for (const name of missing) process.stderr.write(`  ${name}\n`);
    process.exitCode = 1;
    return;
  }
  if (settled.length) {
    process.stderr.write(`${settled.length} queue entr(y/ies) match the recorded wording again — `
      + `remove them from assets/sfx/rerecord.json:\n`);
    for (const name of settled) process.stderr.write(`  ${name}\n`);
    process.exitCode = 1;
    return;
  }

  const drift = applied.length + cleared.length;
  if (CHECK) {
    if (drift) {
      process.stderr.write(`${drift} cue(s) out of sync with the re-record queue. `
        + 'Run `npm run vo:rerecord`.\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`Re-record queue is stamped: ${queue.lines.length} cue(s).\n`);
    return;
  }

  if (drift) {
    JSON.parse(raw); // never write a manifest the game cannot load
    fs.writeFileSync(MANIFEST, raw);
  }
  process.stdout.write(`${queue.lines.length} cue(s) marked for re-recording`
    + `${cleared.length ? `, ${cleared.length} cleared` : ''}`
    + `${drift ? '' : ' (already in sync)'}.\n`);
}

/* Exports are imported by drift checks, so only run when invoked directly. */
const invoked = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
