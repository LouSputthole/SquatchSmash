#!/usr/bin/env node
/**
 * Build manifest entries for every dynamically-decorated Bing dialogue cue.
 *
 *   npm run vo:bing          -> synchronize the generated manifest block
 *   npm run check:bing-vo    -> report drift without writing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* The take ledger's normaliser, not a second one. See `checkBingTreeDrift`. */
import { normaliseSay } from './take-ledger.mjs';
import { buildFamilyScripts } from '../src/bing/family.js';
import { buildLicenseToGrillScript } from '../src/bing/license-to-grill.js';
import {
  bingStandaloneVoiceLines,
  bingVoiceForSpeaker,
  buildScripts,
  plainWords,
} from '../src/bing/script.js';
import {
  buildSecondVisitLouScript,
  SecondVisitMission,
} from '../src/bing/second-visit.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

function makeContext({
  gotPackage = false,
  drunk = 0,
  spins = 0,
  secondVisit = false,
  jackpot = false,
  waited = 0,
} = {}) {
  return {
    mission: { waited, note() {}, louDone() {}, parcelOut() {} },
    flags: {
      gotPackage,
      jackpot,
      heardAboutCar: true,
      sawCar: true,
    },
    money: () => 100,
    drunkLevel: () => drunk,
    spins: () => spins,
    hands: () => 2,
    asked: new Set(),
    order() {},
    request() {},
    sitAtTable() {},
    showParcel() {},
    showEnvelope() {},
    secondVisit: () => secondVisit,
  };
}

function valueOf(value) {
  return typeof value === 'function' ? value() : value;
}

function recordCue(found, cue) {
  const prior = found.get(cue.name);
  if (prior && (prior.voice !== cue.voice
    || prior.say !== cue.say
    || (prior.direction ?? '') !== (cue.direction ?? ''))) {
    throw new Error(
      `Bing cue collision for ${cue.name}: ${JSON.stringify(prior)} versus ${JSON.stringify(cue)}`,
    );
  }
  if (!prior) found.set(cue.name, cue);
}

function collectTrees(found, scripts) {
  for (const [scope, tree] of Object.entries(scripts)) {
    if (!tree || scope.startsWith('__')) continue;
    for (const node of Object.values(tree)) {
      if (!node?.line) continue;
      const line = plainWords(valueOf(node.line));
      const cue = valueOf(node.cue);
      if (cue?.startsWith('vo.bing.full.') && /[a-z0-9]/i.test(line)) {
        recordCue(found, {
          name: cue,
          voice: bingVoiceForSpeaker(scope, valueOf(node.who)),
          say: line,
        });
      }
      for (const option of valueOf(node.options) || []) {
        const text = plainWords(valueOf(option?.text));
        const optionCue = valueOf(option?.cue);
        if (optionCue?.startsWith('vo.bing.full.') && /[a-z0-9]/i.test(text)) {
          recordCue(found, { name: optionCue, voice: 'player', say: text });
        }
      }
    }
  }
}

/**
 * Every generated exact cue that either Bing visit can request.
 *
 * This is exported so the coverage test and the writer consume the same
 * ledger. Importing this module is read-only; only executing it writes.
 */
export function collectBingVoiceCues() {
  const found = new Map();
  for (const line of bingStandaloneVoiceLines()) {
    recordCue(found, {
      name: line.cue,
      voice: line.voice,
      say: plainWords(line.line),
      ...(line.direction ? { direction: line.direction } : {}),
    });
  }
  const firstVisitVariants = [
    {},
    { gotPackage: true },
    { drunk: 0.7 },
    { spins: 2 },
    { secondVisit: true },
    { jackpot: true },
    { waited: 360 },
    { waited: 500 },
  ];
  for (const variant of firstVisitVariants) {
    collectTrees(found, buildScripts(makeContext(variant)));
  }

  /* Family replies are dynamic too, and Booski has a different opening after
   * the shot. Both shapes must be in the recording ledger. */
  for (const shotDone of [false, true]) {
    collectTrees(found, buildFamilyScripts({ shotDone: () => shotDone }));
  }

  /* The store room side quest. Its options and several of its lines are
   * functions of the interrogation's own state — whether the car is on the
   * table, whether his things have been gone through, whether he has given
   * the name up — so it is collected under every answer rather than only the
   * opening one. Gratin's and Numbskull's store-room threads read all three,
   * and a variant that is never enumerated here is a line the writer never
   * mints a cue for and the player therefore never hears. */
  for (const carAvailable of [false, true]) {
    for (const broken of [false, true]) {
      for (const handled of [0, 2]) {
        collectTrees(found, buildLicenseToGrillScript({
          carAvailable: () => carAvailable,
          broken: () => broken,
          handled: () => handled,
        }));
      }
    }
  }

  /* The second visit replaces Lou's whole tree after buildScripts(), so it
   * cannot be discovered by enumerating first-visit context flags. */
  const secondMission = new SecondVisitMission();
  collectTrees(found, {
    lou: buildSecondVisitLouScript({ mission: secondMission }),
  });

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Return a manifest with the generated Bing block replaced, without writing. */
export function syncBingVoiceManifest(manifest) {
  return {
    ...manifest,
    sfx: [
      ...(manifest.sfx || []).filter((cue) => !isGeneratedBingCue(cue.name)),
      ...collectBingVoiceCues(),
    ],
  };
}

function isGeneratedBingCue(name) {
  return name?.startsWith('vo.bing.full.')
    || name?.startsWith('vo.bing.ambient.')
    || name === 'vo.bing.hang.shubenator.signature.cheerful'
    || name === 'vo.bing.bartender.capacity';
}

/** Report generated-cue drift without changing the manifest. */
export function checkBingVoiceManifest(manifest) {
  const failures = [];
  const expected = new Map(collectBingVoiceCues().map((cue) => [cue.name, cue]));
  const owned = (manifest.sfx || []).filter((cue) => isGeneratedBingCue(cue.name));
  const declared = new Map();
  for (const cue of owned) {
    if (declared.has(cue.name)) failures.push(`duplicate cue ${cue.name}`);
    else declared.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    const actual = declared.get(name);
    if (!actual) failures.push(`missing cue ${name}`);
    else if (actual.voice !== cue.voice
      || actual.say !== cue.say
      || (actual.direction ?? '') !== (cue.direction ?? '')) {
      failures.push(`drifted cue ${name}`);
    }
  }
  for (const name of declared.keys()) {
    if (!expected.has(name)) failures.push(`stale cue ${name}`);
  }

  return failures;
}

/**
 * Tree lines the runtime can play that no manifest row covers.
 *
 * THE HOLE THIS CLOSES. `collectTrees` only mints a cue when it starts with
 * `vo.bing.full.`, so a tree line written on any other prefix --
 * `vo.bing.bar.*`, `vo.bing.lou.brief.*`, `vo.bing.hang.*`, all of which
 * exist -- is minted by nobody. The seventy-three that are in the manifest
 * today are there as legacy static rows; they survive only because
 * `isGeneratedBingCue()` does not delete them, which is luck rather than
 * design. The NEXT one authored would be played by the runtime, be absent
 * from the manifest, appear on no recording sheet, and nothing anywhere would
 * say so. That is exactly how PROJECT SILENT SQUATCH lost 147 lines.
 *
 * Widening the minter is the wrong fix -- it would overwrite hand-authored
 * static rows with tree text. Widening the CHECK is the right one: whoever
 * writes the line is told, at the point they write it, that the manifest
 * needs a row for it.
 *
 * Kept separate from `checkBingVoiceManifest` on purpose. That function asks
 * "is the block I own in sync", and is run against synthetic fixtures
 * containing only generated cues; this one asks "can the club say something
 * nobody will ever record", which is only meaningful against the real
 * manifest.
 */
export function checkBingTreeCoverage(manifest) {
  const inManifest = new Set((manifest.sfx || []).map((cue) => cue.name));
  return [...allBingTreeCues()]
    .filter((name) => !inManifest.has(name))
    .sort()
    .map((name) => `tree cue ${name} is played by the runtime and is in no manifest row`
      + ' -- it is off the `vo.bing.full.` prefix the generator mints, so add the row by hand');
}

/**
 * Every cue any Bing dialogue tree can ask for, and every WORDING it can ask
 * for it with, regardless of prefix.
 *
 * Deliberately unfiltered, and deliberately separate from
 * `collectBingVoiceCues()`: that one is the ledger of what this tool OWNS,
 * this one is the list of what the runtime PLAYS. The gap between them is the
 * thing worth reporting.
 *
 * A SET of wordings per cue rather than one string, because a Bing line is
 * allowed to vary with context and several do -- the same cue reached drunk
 * and sober is one recording of one of them. The question a drift check can
 * honestly ask of that is "does the recording match SOMETHING the runtime can
 * say", not "does it match the last variant this loop happened to walk".
 */
export function bingTreeLines() {
  const said = new Map();
  const note = (name, text) => {
    if (!name) return;
    if (!said.has(name)) said.set(name, new Set());
    said.get(name).add(text);
  };
  const walk = (scripts) => {
    for (const [scope, tree] of Object.entries(scripts)) {
      if (!tree || scope.startsWith('__')) continue;
      for (const node of Object.values(tree)) {
        if (!node?.line) continue;
        note(valueOf(node.cue), plainWords(valueOf(node.line)));
        for (const option of valueOf(node.options) || []) {
          note(valueOf(option?.cue), plainWords(valueOf(option?.text)));
        }
      }
    }
  };
  for (const variant of [{}, { gotPackage: true }, { drunk: 0.7 }, { spins: 2 },
    { secondVisit: true }, { jackpot: true }, { waited: 360 }, { waited: 500 }]) {
    walk(buildScripts(makeContext(variant)));
  }
  for (const shotDone of [false, true]) walk(buildFamilyScripts({ shotDone: () => shotDone }));
  return said;
}

/** Every cue name any Bing dialogue tree can ask for. Names only. */
export function allBingTreeCues() {
  return new Set(bingTreeLines().keys());
}

/**
 * A hand-named cue whose RECORDING no longer says what the tree says.
 *
 * THE HOLE THIS CLOSES, and it is the other half of `checkBingTreeCoverage`.
 * That one asks whether a row exists. This one asks whether the row is still
 * TRUE. `checkBingVoiceManifest` already compares text against tree for every
 * cue the generator mints -- and the generator mints only `vo.bing.full.`, so
 * ninety-nine rows on `vo.bing.bar.*`, `vo.bing.hang.*`, `vo.bing.margo.*` and
 * the rest were never compared with anything by anybody. Rewrite one of those
 * lines and the manifest keeps the old wording, the recording sheet keeps the
 * old wording, and the booth records a line the game does not have. That is
 * `docs/ENGINE-TRAPS.md` entry 3 with the serial numbers filed off.
 *
 * Widening the MINTER is still the wrong fix -- it would overwrite the
 * hand-authored rows with tree text, and those rows carry direction and
 * casting the tree does not. Widening the CHECK is the right one: the author
 * is told, where they wrote it, that a recording has gone stale.
 *
 * `text` on a row is the recording sheet's copy; `say` is what the generator
 * writes. A hand-authored row may carry either, so both are accepted and the
 * one that is present is the one compared.
 *
 * COMPARED THROUGH `normaliseSay`, WHICH IS THE TAKE LEDGER'S OWN. The first
 * run of this check reported thirty-one drifted rows and thirty of them were
 * ONE GLYPH: the trees are typed with a curly apostrophe and the hand-authored
 * rows with a straight one. Nobody in a booth reads those differently, and
 * "fixing" the manifest to match would have re-hashed thirty rows in the take
 * ledger and queued thirty perfectly good recordings for re-recording over a
 * character nobody can hear. So the comparison borrows the exact normaliser
 * that decides whether a TAKE has gone stale -- curly quotes, dashes,
 * whitespace, case -- because "has this recording gone stale" is one question
 * and it should not have two answers in one repo.
 *
 * It deliberately does NOT normalise an ellipsis, and the thirty-first finding
 * is why: `vo.bing.margo.5` is recorded without the leading "…" the tree has,
 * and that ellipsis is a direction about how she comes in. Same words, and not
 * the same take.
 */
export function checkBingTreeDrift(manifest) {
  const rows = new Map((manifest.sfx || []).map((cue) => [cue.name, cue]));
  const failures = [];
  for (const [name, wordings] of [...bingTreeLines()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    /* The generated block is `checkBingVoiceManifest`'s to police, and it
     * already compares every one of them exactly. */
    if (name.startsWith('vo.bing.full.')) continue;
    const row = rows.get(name);
    /* No row at all is `checkBingTreeCoverage`'s finding, not this one, and
     * reporting it twice would train somebody to read past both. */
    if (!row) continue;
    const recorded = plainWords(row.say ?? row.text ?? '');
    if (!recorded) continue;
    const heard = normaliseSay(recorded);
    if ([...wordings].some((wording) => normaliseSay(wording) === heard)) continue;
    const spoken = [...wordings].filter(Boolean);
    failures.push(`${name} is recorded as ${JSON.stringify(recorded)}`
      + ` but the tree says ${spoken.map((w) => JSON.stringify(w)).join(' / ')}`
      + ' -- update the manifest row and re-record, or put the wording back');
  }
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (process.argv.includes('--check')) {
    const failures = [
      ...checkBingVoiceManifest(manifest),
      ...checkBingTreeCoverage(manifest),
      ...checkBingTreeDrift(manifest),
    ];
    if (failures.length) {
      for (const failure of failures) console.error(`FAIL ${failure}`);
      console.error(`${failures.length} Bing voice manifest problem(s). Run \`npm run vo:bing\`.`);
      process.exitCode = 1;
    } else {
      console.log(`Bing voice manifest matches ${collectBingVoiceCues().length} generated cue(s).`);
    }
    return;
  }
  const cues = collectBingVoiceCues();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncBingVoiceManifest(manifest), null, 2)}\n`);
  const byVoice = {};
  for (const cue of cues) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
  console.log(`${cues.length} complete Bing dialogue cue(s) written.`);
  for (const [voice, count] of Object.entries(byVoice).sort()) {
    console.log(`  ${voice.padEnd(10)} ${count}`);
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
