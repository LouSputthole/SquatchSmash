#!/usr/bin/env node
/**
 * Recover the performer of every take that predates the take ledger, from git.
 *
 *   npm run vo:infer          -> write the recovered voice ids into takes.json
 *   npm run vo:infer -- --check   -> report what is unresolved, change nothing
 *
 * WHY THIS EXISTS. `assets/sfx/takes.json` stamps the ElevenLabs id a take was
 * rendered with, and `npm run check:takes` compares that stamp against the
 * manifest to catch a recast whose mp3s never caught up. It works, and it only
 * works on takes the ledger itself rendered. Everything older is `assumed` and
 * carries no performer, so the check is blind to it -- which on 2026-08-25 was
 * 3,926 of 4,008 takes, or nearly the whole game.
 *
 * That hole is what let Rico ship in the wrong voice with every gate green. It
 * was found by a human noticing that a character sounded like two other
 * characters, which is not a gate.
 *
 * But the fact is not actually lost. Every take is a committed file, and the
 * manifest at the commit that last wrote that file says what its profile
 * resolved to at the moment it was rendered. That is not a guess from today's
 * casting -- which is the thing `take-ledger.mjs` refuses to do, correctly --
 * it is the historical record, read back.
 *
 * So these entries are `inferred`, never `rendered`, and each one carries the
 * commit it came from. A reader can check any single one by hand:
 *
 *     git log -1 --format=%H -- assets/sfx/<file>.mp3
 *     git show <that commit>:assets/sfx/manifest.json | grep -A2 '"<profile>"'
 *
 * WHAT THIS CANNOT SEE. If a commit rewrote an mp3 *and* moved its profile's id
 * in the same commit, the file may predate the id it is credited with, and this
 * tool will call a stale take fresh. That direction is deliberate: a false
 * "fresh" leaves the status quo, a false "stale" would send somebody to
 * re-render a take that was already right. A file whose last touch was a bulk
 * move or a re-hash rather than a re-render has the same problem. Both are
 * reasons to treat `inferred` as weaker evidence than `rendered`, which is
 * exactly why it is a separate word.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const LEDGER = path.join(ROOT, 'assets/sfx/takes.json');

const git = (args) => execFileSync('git', args, {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024,
});

const isSpoken = (cue) => typeof cue.say === 'string';
const fileOf = (cue) => cue.file || `${cue.name}.mp3`;

/**
 * The newest commit that wrote each `assets/sfx/*.mp3`.
 *
 * One `git log` over the whole history rather than one per file: there are
 * thousands of takes and sixty commits that ever touched one, and the per-file
 * version of this took long enough that nobody would run it twice.
 */
export function lastTouchByFile() {
  const log = git(['log', '--format=%H', '--name-only', '--', 'assets/sfx/*.mp3']);
  const newest = new Map();
  let commit = null;
  for (const line of log.split(/\r?\n/)) {
    if (/^[0-9a-f]{40}$/.test(line)) { commit = line; continue; }
    if (!line.trim() || !commit) continue;
    /* --name-only lists newest first, so the first sighting wins. */
    if (!newest.has(line)) newest.set(line, commit);
  }
  return newest;
}

/** The `voices` block as of one commit, or null when it cannot be read. */
function voicesAt(commit, cache) {
  if (cache.has(commit)) return cache.get(commit);
  let voices = null;
  try {
    voices = JSON.parse(git(['show', `${commit}:assets/sfx/manifest.json`])).voices ?? null;
  } catch { /* the manifest did not exist, or did not parse, at that commit */ }
  cache.set(commit, voices);
  return voices;
}

/**
 * What each unstamped take's performer was, and why the rest are unknowable.
 *
 * Takes the ledger already rendered are left alone: a real stamp always beats
 * a reconstruction, even a well-sourced one.
 */
export function inferPerformers(manifest, ledger, newest) {
  const cache = new Map();
  const inferred = {};
  const unresolved = { noCommit: [], noProfile: [], placeholder: [] };
  for (const cue of manifest.sfx ?? []) {
    if (!isSpoken(cue)) continue;
    if (ledger[cue.name]?.source === 'rendered') continue;
    const commit = newest.get(`assets/sfx/${fileOf(cue)}`);
    if (!commit) { unresolved.noCommit.push(cue.name); continue; }
    const profile = cue.voice || 'player';
    const id = voicesAt(commit, cache)?.[profile]?.id;
    if (!id) { unresolved.noProfile.push(cue.name); continue; }
    /* `<owner to cast>` is a casting placeholder, not an id. A take cannot have
     * been rendered with one, so whatever made this file, it was not this. */
    if (/^<.*>$/.test(id)) { unresolved.placeholder.push(cue.name); continue; }
    inferred[cue.name] = { voice: profile, voiceId: id, commit };
  }
  return { inferred, unresolved };
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const ledgerFile = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const takes = ledgerFile.takes ?? {};
  const { inferred, unresolved } = inferPerformers(manifest, takes, lastTouchByFile());

  const stale = Object.entries(inferred).filter(([, entry]) => {
    const now = manifest.voices?.[entry.voice]?.id;
    return now && now !== entry.voiceId;
  });

  const blocked = unresolved.noCommit.length
    + unresolved.noProfile.length + unresolved.placeholder.length;

  if (checkOnly) {
    console.log(`${Object.keys(inferred).length} take(s) recovered from git, `
      + `${blocked} unresolved.`);
    for (const [name, entry] of stale) {
      console.error(`STALE  ${name}  rendered as ${entry.voiceId} (${entry.commit.slice(0, 8)}); `
        + `${entry.voice} is now ${manifest.voices[entry.voice].id}`);
    }
    if (stale.length) {
      console.error(`\n${stale.length} take(s) are not the performer the manifest casts them as. `
        + 'Re-render them with `npm run sfx -- --force --only <cues>`.');
      process.exitCode = 1;
    }
    return;
  }

  let added = 0;
  for (const [name, entry] of Object.entries(inferred)) {
    const before = takes[name] ?? {};
    takes[name] = { ...before, source: 'inferred', voice: entry.voice, voiceId: entry.voiceId, commit: entry.commit };
    added++;
  }
  fs.writeFileSync(LEDGER, `${JSON.stringify({ ...ledgerFile, takes }, null, 2)}\n`);
  const rendered = Object.values(takes).filter((t) => t.source === 'rendered').length;
  console.log(`assets/sfx/takes.json: ${added} take(s) credited from git `
    + `(${rendered} rendered, ${added} inferred, ${blocked} still unknown).`);
  if (stale.length) {
    console.log(`\n${stale.length} of them are NOT the voice the manifest casts them as — `
      + 'run `npm run vo:infer -- --check` for the list.');
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
