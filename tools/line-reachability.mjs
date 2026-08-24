#!/usr/bin/env node
/**
 * The gate that asks whether a recorded line can ever be HEARD.
 *
 *   npm run check:reachability            report, and fail on anything new
 *   node tools/line-reachability.mjs --all  also print what the allowlist covers
 *
 * WHY IT EXISTS. Every per-scene recording ledger in this repo enumerates
 * AUTHORED lines and calls them the scene's cues. `allSilentSquatchLines()`
 * walks `SEQUENCES` whole; `allCues()` says in its own doc comment "every cue
 * the mission CAN ASK FOR" and then iterates `BEATS`; `allCeremonyVoiceLines()`
 * takes `Object.values(CEREMONY_BEATS)`; `collectTrees()` in tools/bing-vo.mjs
 * visits every node in every tree with no edge walk at all. Authored is not
 * reachable, and the difference was fourteen takes: written, cast, cued,
 * recorded to mp3, listed in the manifest, shipped, and impossible to hear.
 * Nothing in the pipeline had ever asked the question, so nothing in the
 * pipeline ever said no.
 *
 * Golf is the one scene that checks anything (`unreachableCues()`,
 * src/golf/script.js) and even that proves CUE COVERAGE -- every cue id is
 * mentioned by some node -- while walking all nodes rather than the edges
 * between them. It cannot see a node nothing points at.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WILL NOT DO, and why the rules below are so cautious
 *
 * docs/ENGINE-TRAPS.md entry 5 is a list of gates that lied, and the cheapest
 * way to join it is to report forty findings and be wrong about all forty: a
 * gate whose output is mostly noise is a gate nobody reads, and a gate nobody
 * reads is not running. So every rule here is deliberately biased towards
 * calling a line REACHABLE when it cannot prove otherwise:
 *
 *  - A beat id counts as dispatched if its exact string appears ANYWHERE in
 *    the scene's runtime source, not only inside a `dialogue.play()`. Beefrun
 *    hands ids about (`approach-coaching.js` returns 'approach.high2' as a
 *    value; `detection.js` calls `onRadio?.('caib.sweep')`), and chasing the
 *    value would mean writing a data-flow analyser that gets it wrong.
 *  - A call site that BUILDS an id -- `dialogue.play(`nav.${lm.kind}`)` at
 *    src/beefrun/mission.js:1133 -- cannot be resolved statically at all.
 *    Every beat sharing that template's static prefix is treated as reachable
 *    and the report NAMES the template, so a reader can see exactly which
 *    beats the gate declined to judge instead of trusting a silence.
 *  - Conversation trees are rebuilt under several mission-state contexts and
 *    the reachable sets are UNIONED, because a node can hang off an option
 *    list that only exists once you are carrying the package. A single
 *    context reported `bartender.tab`, `hallGuard.tailoring` and `dj.horns`
 *    as dead; all three are live on the other side of a flag.
 *
 * The cost of that bias is false negatives, and there are known ones: the
 * ceremony's `endured` and `roar` beats are dead in the cabin rewrite and this
 * gate cannot see it, because src/initiation/script.js lists their names as
 * strings in `RETIRED_CEREMONY_BEATS`. That is the right trade. A miss is a
 * line that stays as dead as it already was; a false positive is a person
 * being sent to fix something that works, once, and then never reading the
 * gate again.
 *
 * ---------------------------------------------------------------------------
 * SCENES COVERED: mansion, bing, beefrun, initiation, enolasquatch -- the five
 * the fourteen dead takes live in. Front and Center and golf are NOT covered
 * yet and should be: silver's `scriptContext()` (src/silver/voice-catalog.js)
 * is module-private, so a harness here would be a hand-copied duplicate of it
 * that goes wrong silently the first time somebody adds a context key, and
 * golf's trees want live mission state. Both want a small exported harness in
 * the scene first. Better an honest gap named here than a scene checked with a
 * stale copy of its own state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ALLOWLIST_PATH = path.join(HERE, 'line-reachability-allowlist.json');

export const ALLOWLIST_SCHEMA = 'squatchsmash.line-reachability-allowlist.v1';

/** A reason has to be a sentence, not a shrug -- tools/staging-allowlist.mjs. */
export const MIN_REASON_CHARS = 60;

const REQUIRED_KEYS = Object.freeze(['id', 'scene', 'beat', 'reason', 'source']);
const OPTIONAL_KEYS = Object.freeze(['sourceAnchor']);

/** Repository provenance is data, not a host-native filesystem path. */
export const portableSourcePath = (value) => String(value).replaceAll('\\', '/');

const projectRelativePath = (file) => portableSourcePath(path.relative(ROOT, file));

/* ------------------------------------------------------------------ */
/* Source scanning                                                     */
/* ------------------------------------------------------------------ */

/** Every .js file under `dir`, minus the script/data files that ARE the writing. */
export function runtimeFiles(dir, exclude = []) {
  const skip = new Set(exclude.map((rel) => path.resolve(ROOT, rel)));
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && !skip.has(full)) out.push(full);
    }
  };
  walk(path.resolve(ROOT, dir));
  return out;
}

/**
 * Every single- and double-quoted string in a file.
 *
 * Deliberately not a parser. A regex over source text sees ids inside comments
 * too, and that is a feature rather than a bug here: a beat named in a comment
 * is a beat somebody is still talking about, and this gate would rather stay
 * quiet about it than be the reason a line gets deleted.
 */
export function stringLiterals(text) {
  const out = new Set();
  for (const match of text.matchAll(/'([^'\\\n]{1,120})'|"([^"\\\n]{1,120})"/g)) {
    out.add(match[1] ?? match[2]);
  }
  return out;
}

/**
 * `OBJECT.key` and `OBJECT['key']`, for the scenes that pass the line array
 * itself rather than an id -- the mansion's `bark: SEQUENCES.gateGreeting`.
 *
 * Only capitalised receivers, because the shape being looked for is a frozen
 * module-level table and matching every `foo.bar` in the scene would make
 * every key in every map reachable by accident.
 */
export function memberReferences(text) {
  const out = new Set();
  for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
    out.add(`${match[1]}.${match[2]}`);
  }
  for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*\[\s*['"]([^'"\n]+)['"]\s*\]/g)) {
    out.add(`${match[1]}.${match[2]}`);
  }
  return out;
}

/** Bare identifiers, for beats re-exported under a name of their own. */
export function identifiers(text) {
  const out = new Set();
  for (const match of text.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) out.add(match[0]);
  return out;
}

/**
 * Template dispatches: `dialogue.play(`nav.${lm.kind}`)` and friends.
 *
 * Restricted to an actual dispatch verb on purpose. An earlier draft took the
 * static half of EVERY template literal in the scene and beefrun's aeroplane
 * builder alone contributed forty of them -- 'fuselage-side-', 'rgba(58,47,95,'
 * -- one of which swallowed `BARKS.patrolClose` by prefix and hid a genuinely
 * dead pool of three lines. The whole point of this gate is that it reports
 * patrolClose.
 */
export function dispatchTemplatePrefixes(text) {
  const out = [];
  const pattern = /\.\s*(play|bark|interject|start|cue)\s*\(\s*`([^`$\\\n]*)\$\{/g;
  for (const match of text.matchAll(pattern)) {
    if (match[2]) out.push(match[2]);
  }
  return out;
}

/** Line number of the first occurrence of `needle`, 1-based, for the report. */
function lineOf(text, needle) {
  const at = text.indexOf(needle);
  if (at < 0) return 0;
  return text.slice(0, at).split('\n').length;
}

/** Read a scene's runtime sources once and index everything the rules need. */
export function scanRuntime(dir, exclude = []) {
  const literals = new Set();
  const members = new Set();
  const idents = new Set();
  const templates = [];
  for (const file of runtimeFiles(dir, exclude)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const value of stringLiterals(text)) literals.add(value);
    for (const value of memberReferences(text)) members.add(value);
    for (const value of identifiers(text)) idents.add(value);
    for (const prefix of dispatchTemplatePrefixes(text)) {
      templates.push({ prefix, source: `${projectRelativePath(file)}:${lineOf(text, `\`${prefix}\${`)}` });
    }
  }
  return { literals, members, idents, templates };
}

/**
 * `export const ANOINT_LINES = CEREMONY_BEATS.anoint;`
 *
 * The ceremony hands each beat out under its own name and main.js imports the
 * names, never the map, so a key-based check alone would call the whole file
 * dead. Derived from the data module rather than listed here, so a beat that
 * gains an alias tomorrow is understood without editing this tool.
 */
export function aliasExports(dataText, mapName) {
  const out = new Map();
  const pattern = new RegExp(`export\\s+const\\s+([A-Za-z0-9_$]+)\\s*=\\s*${mapName}\\.([A-Za-z0-9_$]+)`, 'g');
  for (const match of dataText.matchAll(pattern)) {
    const list = out.get(match[2]) ?? [];
    list.push(match[1]);
    out.set(match[2], list);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The three shapes                                                    */
/* ------------------------------------------------------------------ */

/** Which template, if any, declined to judge this id. */
function coveringTemplate(templates, id) {
  return templates.find(({ prefix }) => prefix.length > 0 && id.startsWith(prefix)) ?? null;
}

/**
 * A map of named line arrays that runtime code names directly.
 *
 * Reachable means: something outside the script file says `MAP.key`, or names
 * one of the key's alias exports, or has the bare key as a string.
 */
export function analyseKeyedMap({
  scene, map, mapName, runtime, aliases = new Map(), source, countLines,
}) {
  const findings = [];
  const undecided = [];
  for (const [key, value] of Object.entries(map)) {
    if (runtime.members.has(`${mapName}.${key}`)) continue;
    if (runtime.literals.has(key)) continue;
    if ((aliases.get(key) ?? []).some((alias) => runtime.idents.has(alias))) continue;
    const template = coveringTemplate(runtime.templates, key);
    if (template) {
      undecided.push({ beat: `${mapName}.${key}`, template });
      continue;
    }
    findings.push({
      scene,
      beat: `${mapName}.${key}`,
      lines: countLines(value),
      source,
      say: firstWords(value),
    });
  }
  return { findings, undecided };
}

/**
 * A map keyed by the very string the runtime passes to `dialogue.play()`.
 *
 * Beefrun and the Enola Squatch both work this way, and both also hand ids
 * around as values, which is why a bare literal anywhere counts.
 */
export function analyseBeatIds({ scene, map, mapName, runtime, source, countLines }) {
  const findings = [];
  const undecided = [];
  for (const [id, value] of Object.entries(map)) {
    if (runtime.literals.has(id)) continue;
    if (runtime.members.has(`${mapName}.${id}`)) continue;
    const template = coveringTemplate(runtime.templates, id);
    if (template) {
      undecided.push({ beat: `${mapName}['${id}']`, template });
      continue;
    }
    findings.push({
      scene,
      beat: `${mapName}['${id}']`,
      lines: countLines(value),
      source,
      say: firstWords(value),
    });
  }
  return { findings, undecided };
}

const valueOf = (value) => (typeof value === 'function' ? value() : value);

/**
 * Walk one conversation tree from its entry nodes along `next`/`goto`/options.
 *
 * Entry nodes are node ids that appear as a string in the scene's runtime
 * source, which is how `dialogue.start(scripts.lou, 'doorOpen', ...)` reads.
 * A fresh visited set per call is not an optimisation detail: sharing one
 * across contexts stops the second context re-expanding a root it has already
 * seen, and the branch that only exists in that context never gets walked.
 * That bug reported three live Bing nodes as dead on the first run.
 */
export function reachableTreeNodes(tree, roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const id = queue.pop();
    if (typeof id !== 'string' || seen.has(id)) continue;
    const node = tree[id];
    if (!node || typeof node !== 'object') continue;
    seen.add(id);
    for (const edge of [valueOf(node.next), valueOf(node.goto)]) {
      if (typeof edge === 'string') queue.push(edge);
    }
    for (const option of valueOf(node.options) ?? []) {
      for (const edge of [valueOf(option?.next), valueOf(option?.goto)]) {
        if (typeof edge === 'string') queue.push(edge);
      }
    }
  }
  return seen;
}

/** Every tree in every context, unioned. */
export function analyseTrees({ scene, buildAll, runtime, source }) {
  const nodes = new Map();
  const reached = new Map();
  for (const scripts of buildAll()) {
    for (const [treeName, tree] of Object.entries(scripts)) {
      if (!tree || typeof tree !== 'object' || treeName.startsWith('__')) continue;
      const ids = Object.keys(tree).filter((id) => tree[id] && typeof tree[id] === 'object');
      if (!nodes.has(treeName)) nodes.set(treeName, new Map());
      if (!reached.has(treeName)) reached.set(treeName, new Set());
      for (const id of ids) nodes.get(treeName).set(id, tree[id]);
      const roots = ids.filter((id) => runtime.literals.has(id));
      for (const id of reachableTreeNodes(tree, roots)) reached.get(treeName).add(id);
    }
  }
  const findings = [];
  for (const [treeName, ids] of [...nodes].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const [id, node] of [...ids].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (reached.get(treeName).has(id)) continue;
      findings.push({ scene, beat: `${treeName}.${id}`, lines: 1, source, say: firstWords(node) });
    }
  }
  return { findings, undecided: [] };
}

/**
 * A few words of the take, so a reader can tell which line is being buried.
 *
 * `<em>` in this repo's scripts is an actor direction rather than emphasis, so
 * it comes out the same way tools/bing-vo.mjs strips it.
 */
function firstWords(value) {
  const first = Array.isArray(value) ? value[0] : value;
  const raw = valueOf(first?.text ?? first?.say ?? first?.line
    ?? (typeof first === 'string' ? first : null));
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/<em\b[^>]*>[\s\S]*?<\/em>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

/* ------------------------------------------------------------------ */
/* The allowlist                                                       */
/* ------------------------------------------------------------------ */

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

/** Check the allowlist document itself. Issues mean refuse to run. */
export function validateReachabilityAllowlist(doc) {
  const issues = [];
  if (!doc || typeof doc !== 'object') return { entries: [], issues: ['Allowlist must be an object'] };
  if (doc.$schema !== ALLOWLIST_SCHEMA) {
    issues.push(`Unknown allowlist schema ${JSON.stringify(doc.$schema)}`);
  }
  const entries = Array.isArray(doc.entries) ? doc.entries : null;
  if (!entries) {
    issues.push('Allowlist needs an entries array');
    return { entries: [], issues };
  }
  const seen = new Set();
  let previousId = '';
  entries.forEach((entry, index) => {
    const at = `entries[${index}]`;
    if (!entry || typeof entry !== 'object') {
      issues.push(`${at} is not an object`);
      return;
    }
    for (const key of REQUIRED_KEYS) {
      if (!isNonEmptyString(entry[key])) issues.push(`${at}.${key} must be a non-empty string`);
    }
    for (const key of Object.keys(entry)) {
      if (!REQUIRED_KEYS.includes(key) && !OPTIONAL_KEYS.includes(key)) {
        issues.push(`${at} has unknown key ${JSON.stringify(key)}`);
      }
    }
    if (isNonEmptyString(entry.id)) {
      if (seen.has(entry.id)) issues.push(`${at}.id ${JSON.stringify(entry.id)} is used twice`);
      seen.add(entry.id);
      if (entry.id <= previousId) issues.push(`${at}.id must sort after ${JSON.stringify(previousId)}`);
      previousId = entry.id;
    }
    if (isNonEmptyString(entry.reason) && entry.reason.trim().length < MIN_REASON_CHARS) {
      issues.push(`${at}.reason must be at least ${MIN_REASON_CHARS} characters: say why nobody can hear this`);
    }
    /* A wildcard is how an allowlist stops being a list. */
    for (const key of ['scene', 'beat']) {
      if (typeof entry[key] === 'string' && entry[key].includes('*')) {
        issues.push(`${at}.${key} may not contain a wildcard`);
      }
    }
  });
  return { entries, issues };
}

/** Split findings into those that stand and those an entry excuses. */
export function applyReachabilityAllowlist(findings, entries) {
  const used = new Set();
  const kept = [];
  const suppressed = [];
  for (const finding of findings) {
    const entry = entries.find((candidate) => (
      candidate.scene === finding.scene && candidate.beat === finding.beat
    ));
    if (entry) {
      used.add(entry.id);
      suppressed.push({ finding, entryId: entry.id });
    } else kept.push(finding);
  }
  return { kept, suppressed, used };
}

/**
 * Entries that matched nothing this run.
 *
 * docs/ENGINE-TRAPS.md entry 10: stale reads like good news and is just as
 * likely to mean the gate went blind. Forty-two mansion recliner entries went
 * stale the day `isOwnBody` started reading a chair as its own sitter, and
 * deleting them would have destroyed the only written record of the fault. So
 * a stale entry is an ERROR here, exactly as it is in verify-staging: go and
 * check whether the line is genuinely dispatched now before deleting the
 * sentence that says it was not.
 */
export function unusedEntries(entries, usedIds, scenes) {
  return entries
    .filter((entry) => scenes.includes(entry.scene) && !usedIds.has(entry.id))
    .map((entry) => entry.id)
    .sort();
}

/* ------------------------------------------------------------------ */
/* The scenes                                                          */
/* ------------------------------------------------------------------ */

const countArray = (value) => (Array.isArray(value) ? value.length : 1);
/** HUD prose and stage directions carry no cue: they are read, not performed. */
const countCued = (value) => (Array.isArray(value) ? value.filter((line) => line?.cue).length : 1);

/**
 * The Bing's mission-state contexts.
 *
 * The same eight tools/bing-vo.mjs records against, for the same reason: the
 * script's option lists are functions of the flags, and a node hanging off the
 * carrying-the-package branch does not exist in a context that has not got it.
 */
function bingContext({
  gotPackage = false, drunk = 0, spins = 0, secondVisit = false, jackpot = false, waited = 0,
} = {}) {
  const noop = () => {};
  return {
    mission: {
      waited, note: noop, louDone: noop, parcelOut: noop, addObjective: noop,
    },
    flags: { gotPackage, jackpot, heardAboutCar: true, sawCar: true, toldLou: false },
    money: () => 100,
    drunkLevel: () => drunk,
    spins: () => spins,
    hands: () => 2,
    asked: new Set(),
    order: noop,
    request: noop,
    sitAtTable: noop,
    showParcel: noop,
    showEnvelope: noop,
    secondVisit: () => secondVisit,
  };
}

const BING_CONTEXTS = Object.freeze([
  {}, { gotPackage: true }, { drunk: 0.7 }, { spins: 2 },
  { secondVisit: true }, { jackpot: true }, { waited: 360 }, { waited: 500 },
]);

/** Every scene this gate covers, and how each one is shaped. */
export async function analyseScenes() {
  const reports = [];

  {
    const source = 'src/mansion/script.js';
    const { SEQUENCES } = await import('../src/mansion/script.js');
    const runtime = scanRuntime('src/mansion', [source]);
    const aliases = aliasExports(fs.readFileSync(path.join(ROOT, source), 'utf8'), 'SEQUENCES');
    reports.push({
      scene: 'mansion',
      ...analyseKeyedMap({
        scene: 'mansion', map: SEQUENCES, mapName: 'SEQUENCES', runtime, aliases, source, countLines: countCued,
      }),
    });
  }

  {
    const source = 'src/initiation/dialogue.js';
    const { CEREMONY_BEATS } = await import('../src/initiation/dialogue.js');
    const runtime = scanRuntime('src/initiation', [source]);
    const aliases = aliasExports(fs.readFileSync(path.join(ROOT, source), 'utf8'), 'CEREMONY_BEATS');
    reports.push({
      scene: 'initiation',
      ...analyseKeyedMap({
        scene: 'initiation', map: CEREMONY_BEATS, mapName: 'CEREMONY_BEATS', runtime, aliases, source, countLines: countArray,
      }),
    });
  }

  for (const [scene, dir, source, module] of [
    ['beefrun', 'src/beefrun', 'src/beefrun/script.js', '../src/beefrun/script.js'],
    ['enolasquatch', 'src/enolasquatch', 'src/enolasquatch/dialogue/script.js', '../src/enolasquatch/dialogue/script.js'],
  ]) {
    const { BEATS, BARKS } = await import(module);
    const runtime = scanRuntime(dir, [source]);
    const findings = [];
    const undecided = [];
    for (const [mapName, map] of [['BEATS', BEATS], ['BARKS', BARKS]]) {
      const result = analyseBeatIds({ scene, map, mapName, runtime, source, countLines: countArray });
      findings.push(...result.findings);
      undecided.push(...result.undecided);
    }
    reports.push({ scene, findings, undecided });
  }

  {
    const source = 'src/bing/script.js';
    const { buildScripts } = await import('../src/bing/script.js');
    const runtime = scanRuntime('src/bing', [source]);
    reports.push({
      scene: 'bing',
      ...analyseTrees({
        scene: 'bing',
        buildAll: () => BING_CONTEXTS.map((options) => buildScripts(bingContext(options))),
        runtime,
        source,
      }),
    });
  }

  return reports;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  const showAll = process.argv.includes('--all');
  const doc = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const { entries, issues } = validateReachabilityAllowlist(doc);
  if (issues.length) {
    console.error(`${projectRelativePath(ALLOWLIST_PATH)} is not usable:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }

  const reports = await analyseScenes();
  const scenes = reports.map((report) => report.scene);
  const allFindings = reports.flatMap((report) => report.findings);
  const { kept, suppressed, used } = applyReachabilityAllowlist(allFindings, entries);
  const stale = unusedEntries(entries, used, scenes);

  console.log('Line reachability — can the player ever hear this take?\n');
  for (const report of reports) {
    const mine = kept.filter((finding) => finding.scene === report.scene);
    const excused = suppressed.filter(({ finding }) => finding.scene === report.scene);
    const lines = mine.reduce((total, finding) => total + finding.lines, 0);
    console.log(`${report.scene}: ${mine.length} unreachable (${lines} lines), ${excused.length} allowlisted`);
    for (const finding of mine) {
      console.log(`  ✗ ${finding.beat} — ${finding.lines} line(s)${finding.say ? `  "${finding.say}"` : ''}`);
    }
    if (showAll) {
      for (const { finding, entryId } of excused) {
        console.log(`  · ${finding.beat} — allowed by ${entryId}`);
      }
    }
    /* Say what was NOT judged. A gate that silently declines to look is the
     * gate in ENGINE-TRAPS entry 10 that reported nothing and was believed. */
    for (const { beat, template } of report.undecided) {
      console.log(`  ? ${beat} — built by template \`${template.prefix}\${…}\` at ${template.source}; not statically resolvable, treated as reachable`);
    }
  }

  if (stale.length) {
    console.error('\nSTALE allowlist entries — they excused nothing this run:');
    for (const id of stale) console.error(`  - ${id}`);
    console.error('Go and check the line really is dispatched now before deleting the entry.');
    console.error('docs/ENGINE-TRAPS.md entry 10: the last time entries went stale, the gate had gone blind.');
  }

  if (kept.length || stale.length) {
    process.exitCode = 1;
    return;
  }
  console.log(`\nok — every authored line in ${scenes.length} scenes is dispatched or allowlisted.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
