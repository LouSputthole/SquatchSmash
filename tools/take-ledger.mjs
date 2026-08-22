#!/usr/bin/env node
/**
 * What each recorded take on disk actually SAYS.
 *
 *   npm run vo:takes         seed/refresh the ledger from the manifest
 *   npm run check:takes      report takes whose words have moved on
 *
 * THE OWNER REPORTED "the old lines are still playing during the Silent
 * Squatch" and there was no way to check it. A cue's id does not change when
 * its wording changes -- only the hashed families (`vo.bing.full.*`,
 * `vo.silver.*`) embed the text -- so a rewritten line keeps its filename, the
 * old mp3 stays on disk, and `assets/sfx/index.json` reports it present. Every
 * gate we had agreed: the cue exists, the file exists, nothing is orphaned.
 * The game shipped the retired wording under the new subtitle and the whole
 * static suite stayed green.
 *
 * The only defence was `assets/sfx/rerecord.json`, a list somebody has to
 * REMEMBER to append to at the moment they rewrite a line. That is the same
 * shape of failure as the campaign marathon's hand-written route table: a
 * claim about the world maintained by good intentions. This file replaces the
 * intention with a measurement.
 *
 * A take entry is `<cue name>: { text: <hash of the words rendered>, source }`.
 * `source` is the honest part:
 *
 *   rendered  the generator wrote this take and stamped the words it sent.
 *             Exact. Drift here is proof.
 *   assumed   the take predates this ledger. We are ASSUMING it says what the
 *             manifest currently says, because there is no record of what was
 *             sent to the booth. It is a starting point, not evidence: a line
 *             already rewritten before 2026-08-22 is blessed by this seed and
 *             this tool cannot see it. Every future rewrite of that same line
 *             IS caught, which is the bug that keeps recurring.
 *
 * The queued lines in `rerecord.json` are the exception: those carry
 * `retiredText`, an actual record of the retired wording, so they seed from
 * that and correctly read as stale until a new take is rendered.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const QUEUE = path.join(ROOT, 'assets/sfx/rerecord.json');
const LEDGER = path.join(ROOT, 'assets/sfx/takes.json');
const SFX_DIR = path.join(ROOT, 'assets/sfx');

/**
 * The words, as the booth would hear them.
 *
 * Curly quotes, straight quotes and runs of whitespace are the same
 * performance; the scripts use typographic quotes and the odd rewrite swaps
 * them without touching a syllable. Normalising here keeps those edits from
 * reading as a changed line and burning a generation credit.
 */
export function normaliseSay(text) {
  return String(text ?? '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Twelve hex characters is 48 bits: collision-free across 4k lines by miles. */
export function textHash(text) {
  return crypto.createHash('sha256').update(normaliseSay(text)).digest('hex').slice(0, 12);
}

const isSpoken = (cue) => typeof cue?.say === 'string' && cue.say.trim() !== '';
const fileOf = (cue) => cue.file || `${cue.name}.mp3`;

/**
 * Which takes on disk no longer say what the script says.
 *
 * `stale` is the finding that matters and the only one that fails a build: a
 * file exists, the ledger knows the words it was made from, and the manifest
 * now wants different ones. A stale take that is already queued in
 * rerecord.json is expected -- that is the queue doing its job -- so it is
 * reported separately as `queued` and does not fail.
 *
 * `unledgered` is a take recorded before this ledger existed and never
 * re-rendered since. It is a count, not a failure; it only shrinks.
 * `orphaned` is a ledger entry whose cue left the manifest -- prune it.
 */
export function takeDrift(manifest, ledger, queue, onDisk) {
  const takes = ledger?.takes ?? {};
  const queued = new Set((queue?.lines ?? []).map((entry) => entry.cue));
  const present = new Set(onDisk);
  const stale = [];
  const queuedStale = [];
  const unledgered = [];
  const known = new Set();

  for (const cue of manifest.sfx ?? []) {
    if (!isSpoken(cue)) continue;
    known.add(cue.name);
    if (!present.has(fileOf(cue))) continue;
    const take = takes[cue.name];
    if (!take) { unledgered.push(cue.name); continue; }
    if (take.text === textHash(cue.say)) continue;
    (queued.has(cue.name) ? queuedStale : stale).push({
      cue: cue.name, source: take.source, say: cue.say,
    });
  }
  const orphaned = Object.keys(takes).filter((name) => !known.has(name));
  return { stale, queued: queuedStale, unledgered, orphaned };
}

/**
 * Build the ledger the manifest and the queue imply.
 *
 * Existing `rendered` entries are never overwritten -- they are the only exact
 * records here, and re-seeding must not quietly upgrade a stale take to
 * current. An `assumed` entry is re-derived every time, so a line rewritten
 * today gets seeded stale only if the queue names its old words; otherwise the
 * seed follows the manifest, which is the assumption this file is named after.
 */
export function seedLedger(manifest, queue, onDisk, previous = {}) {
  const retired = new Map((queue?.lines ?? [])
    .filter((entry) => typeof entry.retiredText === 'string')
    .map((entry) => [entry.cue, entry.retiredText]));
  const present = new Set(onDisk);
  const takes = {};
  for (const cue of manifest.sfx ?? []) {
    if (!isSpoken(cue) || !present.has(fileOf(cue))) continue;
    const prior = previous[cue.name];
    if (prior?.source === 'rendered') { takes[cue.name] = prior; continue; }
    takes[cue.name] = {
      text: textHash(retired.get(cue.name) ?? cue.say),
      source: 'assumed',
    };
  }
  return Object.fromEntries(Object.keys(takes).sort().map((k) => [k, takes[k]]));
}

/**
 * Stamp one freshly rendered take. Called by tools/generate-sfx.mjs the moment
 * after the bytes hit the disk, with the exact text that was sent -- which is
 * the whole point: this is the one place the words and the file are known to
 * agree.
 */
export function recordTake(ledgerPath, cueName, say) {
  const ledger = readLedger(ledgerPath);
  ledger.takes[cueName] = { text: textHash(say), source: 'rendered' };
  writeLedger(ledgerPath, ledger);
}

const COMMENT = Object.freeze([
  'Generated by tools/take-ledger.mjs. What each recorded take on disk SAYS.',
  '',
  'A rewritten line keeps its cue id and therefore its filename, so nothing on',
  'disk changes when the words do and every other gate stays green while the',
  'game plays the retired wording. This file is the record that catches it.',
  '',
  '"rendered" entries were stamped by the generator at the moment it sent the',
  'text, and are exact. "assumed" entries predate this ledger and take the',
  'manifest at its word -- see the header of tools/take-ledger.mjs for what',
  'that does and does not prove.',
  '',
  'Run `npm run check:takes` to report drift; `npm run vo:takes` to reseed.',
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readLedger(file) {
  if (!fs.existsSync(file)) return { _comment: COMMENT, takes: {} };
  const data = readJson(file);
  return { _comment: data._comment ?? COMMENT, takes: data.takes ?? {} };
}

function writeLedger(file, ledger) {
  fs.writeFileSync(file, `${JSON.stringify(
    { _comment: COMMENT, takes: ledger.takes }, null, 2,
  )}\n`);
}

function main() {
  const check = process.argv.includes('--check');
  const manifest = readJson(MANIFEST);
  const queue = readJson(QUEUE);
  const onDisk = fs.readdirSync(SFX_DIR).filter((f) => f.endsWith('.mp3'));

  if (!check) {
    const previous = readLedger(LEDGER).takes;
    const takes = seedLedger(manifest, queue, onDisk, previous);
    writeLedger(LEDGER, { takes });
    const rendered = Object.values(takes).filter((t) => t.source === 'rendered').length;
    console.log(`assets/sfx/takes.json: ${Object.keys(takes).length} take(s) `
      + `(${rendered} rendered, ${Object.keys(takes).length - rendered} assumed).`);
    return;
  }

  const drift = takeDrift(manifest, readLedger(LEDGER), queue, onDisk);
  for (const entry of drift.stale) {
    console.error(`STALE TAKE  ${entry.cue}  (${entry.source})`);
    console.error(`            script now says: "${entry.say}"`);
  }
  for (const name of drift.orphaned) {
    console.error(`ORPHAN LEDGER ENTRY  ${name} — no such cue; run npm run vo:takes`);
  }
  const bad = drift.stale.length + drift.orphaned.length;
  console.log(`takes: ${drift.stale.length} stale, ${drift.queued.length} already queued, `
    + `${drift.unledgered.length} unledgered (pre-ledger), ${drift.orphaned.length} orphaned.`);
  if (bad) {
    console.error('\nAdd each stale line to assets/sfx/rerecord.json with its retiredText, '
      + 'then `npm run vo:sync`. The take on disk says the old words.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
