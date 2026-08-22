#!/usr/bin/env node
/**
 * Which recordings on disk were made BEFORE the words they are meant to say.
 *
 *   npm run check:take-history      report; exits 1 on an unqueued finding
 *
 * `tools/take-ledger.mjs` is the forward-looking half of this: from now on the
 * generator stamps the words it sent, so drift is provable. It cannot see
 * backwards, because nothing recorded what the 3,328 takes already on disk
 * were rendered from.
 *
 * Git did. A cue's `say` lives in assets/sfx/manifest.json and its take lives
 * beside it in the same repository, so for every recorded line there are two
 * commits: the one that last changed the WORDS and the one that last changed
 * the FILE. If the file's commit comes first, that mp3 was never re-rendered
 * after the rewrite, and the game plays the retired wording under the new
 * subtitle. That is proof, not a guess.
 *
 * It found 42 on 2026-08-22. Forty were already in rerecord.json. The other
 * two were both from the Enola flight, rewritten in "Motel, Siege and Palace:
 * three scene passes" -- the same commit that queued six OTHER lines, so the
 * queue was updated that day and these two were simply missed. One of them,
 * `vo.enolasquatch.sasole.emergency-overheat-1.1`, had the audio naming a
 * different engine from the subtitle in a scene where the player acts on which
 * engine is overheating. That is the whole argument for not trusting a list a
 * person has to remember to append to.
 *
 * WHY THIS IS NOT IN CI: it needs full history, and `actions/checkout` clones
 * shallow. Deepening it would pull a 700 MiB pack on every pull request to
 * re-derive a fact the ledger already carries forward. Run it locally after a
 * scripting pass, or whenever a take sounds wrong.
 *
 * Comparison is by topological commit ORDER, never by timestamp: committer
 * dates go backwards across a rebase and this must not.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseSay } from './take-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = 'assets/sfx/manifest.json';

const git = (...args) => execFileSync('git', args, {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28,
});

/** Commit sha -> position, oldest first. */
export function commitOrder(revList) {
  return new Map(revList.trim().split('\n').filter(Boolean).map((sha, i) => [sha, i]));
}

/**
 * Cue name -> the sha in which its words last changed.
 *
 * A cue appearing for the first time counts as a change: before that commit
 * the line did not exist, so no take can honestly predate it.
 */
export function wordsChangedAt(revisions, loadManifest) {
  const at = new Map();
  let previous = new Map();
  for (const sha of revisions) {
    let manifest;
    try { manifest = loadManifest(sha); } catch { continue; }
    const current = new Map();
    for (const cue of manifest.sfx ?? []) {
      if (typeof cue.say !== 'string') continue;
      const say = normaliseSay(cue.say);
      current.set(cue.name, say);
      if (previous.get(cue.name) !== say) at.set(cue.name, sha);
    }
    previous = current;
  }
  return at;
}

/** File name -> the sha in which the recording last changed. */
export function takeChangedAt(log) {
  const at = new Map();
  let sha = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) { sha = line.slice(1); continue; }
    if (!line.endsWith('.mp3')) continue;
    const file = line.slice('assets/sfx/'.length);
    if (!at.has(file)) at.set(file, sha);
  }
  return at;
}

export function staleTakes({ manifest, queue, onDisk, order, words, takes }) {
  const queued = new Set((queue?.lines ?? []).map((entry) => entry.cue));
  const present = new Set(onDisk);
  const findings = [];
  let checked = 0;
  let unknown = 0;
  for (const cue of manifest.sfx ?? []) {
    if (typeof cue.say !== 'string') continue;
    const file = cue.file || `${cue.name}.mp3`;
    if (!present.has(file)) continue;
    const wordsSha = words.get(cue.name);
    const takeSha = takes.get(file);
    if (!order.has(wordsSha) || !order.has(takeSha)) { unknown++; continue; }
    checked++;
    if (order.get(takeSha) < order.get(wordsSha)) {
      findings.push({ cue: cue.name, say: cue.say, file, wordsSha, takeSha, queued: queued.has(cue.name) });
    }
  }
  findings.sort((a, b) => a.cue.localeCompare(b.cue));
  return { findings, checked, unknown };
}

function main() {
  const order = commitOrder(git('rev-list', '--topo-order', '--reverse', 'HEAD'));
  if (order.size < 2) {
    console.log('take history: shallow clone, nothing to compare. Skipped.');
    return;
  }
  const revisions = git('log', '--format=%H', '--', MANIFEST_PATH)
    .trim().split('\n').filter(Boolean).reverse();
  const words = wordsChangedAt(revisions,
    (sha) => JSON.parse(git('show', `${sha}:${MANIFEST_PATH}`)));
  const takes = takeChangedAt(git('log', '--format=@%H', '--name-only', '--', 'assets/sfx'));

  const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const { findings, checked, unknown } = staleTakes({
    manifest: read(MANIFEST_PATH),
    queue: read('assets/sfx/rerecord.json'),
    onDisk: fs.readdirSync(path.join(ROOT, 'assets/sfx')).filter((f) => f.endsWith('.mp3')),
    order, words, takes,
  });

  const loose = findings.filter((f) => !f.queued);
  for (const f of loose) {
    console.error(`STALE TAKE  ${f.cue}`);
    console.error(`            script says: "${f.say}"`);
    console.error(`            words ${f.wordsSha.slice(0, 8)} -> take ${f.takeSha.slice(0, 8)} (older)`);
  }
  console.log(`take history: ${checked} recorded lines checked, ${unknown} without usable history; `
    + `${findings.length} predate their words (${findings.length - loose.length} already queued).`);
  if (loose.length) {
    console.error('\nAdd each to assets/sfx/rerecord.json with its retiredText, then `npm run vo:sync`.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
