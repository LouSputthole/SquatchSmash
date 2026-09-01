#!/usr/bin/env node
/**
 * The gate that asks whether a recorded line can ever be HEARD.
 *
 *   npm run check:reachability            report, and fail on anything new
 *   node tools/line-reachability.mjs --all  also print what the allowlist covers
 *   node tools/line-reachability.mjs --campaign  print every beat; fail on UNKNOWN
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
 *    src/beefrun/mission.js:1133 -- is not evidence by itself. It is accepted
 *    only when the runtime's finite data domain proves the exact ids that can
 *    fill that template. Anything else is UNKNOWN, and UNKNOWN fails the gate.
 *  - Conversation trees are rebuilt under several mission-state contexts and
 *    the reachable sets are UNIONED, because a node can hang off an option
 *    list that only exists once you are carrying the package. A single
 *    context reported `bartender.tab`, `hallGuard.tailoring` and `dj.horns`
 *    as dead; all three are live on the other side of a flag.
 *
 * The campaign report below names every playable beat. A scene is PASS only
 * when a native adapter proves its authored graph; a missing adapter is
 * UNKNOWN with explicit non-green evidence. That distinction is deliberate:
 * inventory completeness is not execution-path completeness.
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
 * Remove JavaScript comments without damaging strings or template literals.
 *
 * A retired cue mentioned in a comment is documentation, not an executable
 * path. The old scanner accepted it as proof and could therefore certify a
 * recording which no runtime call could request. This deliberately small
 * lexer preserves character positions/newlines so source anchors stay useful.
 */
export function executableSource(text) {
  let out = '';
  let mode = 'code';
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1] ?? '';
    if (mode === 'line-comment') {
      if (ch === '\n') { out += ch; mode = 'code'; }
      else out += ' ';
      continue;
    }
    if (mode === 'block-comment') {
      if (ch === '*' && next === '/') {
        out += '  ';
        i++;
        mode = 'code';
      } else out += ch === '\n' ? '\n' : ' ';
      continue;
    }
    if (mode === 'single' || mode === 'double' || mode === 'template') {
      out += ch;
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if ((mode === 'single' && ch === "'")
        || (mode === 'double' && ch === '"')
        || (mode === 'template' && ch === '`')) mode = 'code';
      continue;
    }
    if (ch === '/' && next === '/') {
      out += '  ';
      i++;
      mode = 'line-comment';
    } else if (ch === '/' && next === '*') {
      out += '  ';
      i++;
      mode = 'block-comment';
    } else {
      out += ch;
      if (ch === "'") mode = 'single';
      else if (ch === '"') mode = 'double';
      else if (ch === '`') mode = 'template';
    }
  }
  return out;
}

/** Every executable single- and double-quoted string in a file. */
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
    const raw = fs.readFileSync(file, 'utf8');
    const text = executableSource(raw);
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
export function analyseBeatIds({
  scene, map, mapName, runtime, source, countLines, resolvedTemplateIds = new Set(),
}) {
  const findings = [];
  const undecided = [];
  for (const [id, value] of Object.entries(map)) {
    if (runtime.literals.has(id)) continue;
    if (runtime.members.has(`${mapName}.${id}`)) continue;
    const template = coveringTemplate(runtime.templates, id);
    if (template) {
      if (resolvedTemplateIds.has(id)) continue;
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
const countSpoken = (value) => (Array.isArray(value)
  ? value.filter((line) => line?.speaker && typeof line?.text === 'string').length
  : 1);

function mergeAnalyses(scene, analyses, metadata = {}) {
  return {
    scene,
    findings: analyses.flatMap((result) => result.findings ?? []),
    undecided: analyses.flatMap((result) => result.undecided ?? []),
    ...metadata,
  };
}

function exactCueFinding(scene, beat, source, line) {
  return {
    scene,
    beat,
    lines: 1,
    source,
    say: firstWords(line),
  };
}

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
    reports.push(mergeAnalyses('mansion', [analyseKeyedMap({
      scene: 'mansion', map: SEQUENCES, mapName: 'SEQUENCES', runtime, aliases, source, countLines: countCued,
    })], {
      completeCampaignBeats: ['silent_squatch', 'mansion_return'],
      evidence: 'Every cued Silent Squatch sequence is an executable member, alias, or exact beat reference in mansion runtime.',
    }));
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

  {
    const source = 'src/squatchfather/dialogue/dialogue.json';
    const authored = JSON.parse(fs.readFileSync(path.join(ROOT, source), 'utf8'));
    delete authored.speakers;
    const runtime = scanRuntime('src/squatchfather', [source]);
    reports.push(mergeAnalyses('squatchfather', [analyseKeyedMap({
      scene: 'squatchfather', map: authored, mapName: 'DIALOGUE', runtime, source, countLines: countSpoken,
    })], {
      completeCampaignBeats: ['squatchfather'],
      evidence: 'Every spoken sequence in dialogue.json is named by executable Squatchfather runtime source.',
    }));
  }

  {
    const source = 'src/cabin/script.js';
    const lagSource = 'src/cabin/lag.js';
    const {
      CABIN_BEATS, CABIN_PHONE_CALLS,
    } = await import('../src/cabin/script.js');
    const {
      LAG_DIALOGUE_CATALOG, createLagHintDirector,
    } = await import('../src/cabin/lag.js');
    const runtime = scanRuntime('src/cabin', [source, lagSource]);
    const voicedBeats = Object.fromEntries(CABIN_BEATS
      .filter(({ lines }) => countCued(lines) > 0)
      .map(({ id, lines }) => [id, lines]));
    const beatResult = analyseBeatIds({
      scene: 'cabin', map: voicedBeats, mapName: 'CABIN_BEATS', runtime, source, countLines: countCued,
    });
    const callResult = analyseKeyedMap({
      scene: 'cabin', map: CABIN_PHONE_CALLS, mapName: 'CABIN_PHONE_CALLS', runtime, source,
      countLines: (call) => (call?.pickup ? 1 : 0) + (call?.lines?.length ?? 0) + (call?.replies?.length ?? 0),
    });

    /* Lag's cue ids are intentionally dynamic, so prove the actual finite
     * selection domain rather than accepting `vo.cabin.lag.${id}`. Five
     * synthetic discoveries enable every minimum-gated after-line without
     * retiring any physical clue; one fresh equal-weight director per chop
     * bucket proves each wood reaction can be selected. */
    const hintDirector = createLagHintDirector({ random: () => 0 });
    for (let index = 0; index < 5; index += 1) hintDirector.discover(`reachability.${index}`);
    const selectedLagIds = new Set(hintDirector.debug.eligible);
    const woodLines = LAG_DIALOGUE_CATALOG.filter(({ kind }) => kind === 'wood');
    for (let index = 0; index < woodLines.length; index += 1) {
      const director = createLagHintDirector({ random: () => (index + 0.5) / woodLines.length });
      const selected = director.reactToChop({ now: 0 });
      if (selected.ok) selectedLagIds.add(selected.id);
    }
    const lagFindings = LAG_DIALOGUE_CATALOG
      .filter(({ id }) => !selectedLagIds.has(id))
      .map((line) => exactCueFinding('cabin', `LAG_DIALOGUE_CATALOG['${line.id}']`, lagSource, line));
    const lagDispatchMissing = !runtime.idents.has('createLagHintDirector')
      || !runtime.idents.has('speakLagLine');
    if (lagDispatchMissing) {
      lagFindings.push(exactCueFinding(
        'cabin', 'LAG_DIALOGUE_CATALOG runtime dispatch', lagSource,
        { text: 'The finite Lag selection domain is not connected to speakLagLine in cabin runtime.' },
      ));
    }
    reports.push(mergeAnalyses('cabin', [beatResult, callResult, {
      findings: lagFindings, undecided: [],
    }], {
      completeCampaignBeats: ['cabin_lay_low', 'booski_sasole_call', 'cabin_two'],
      evidence: 'Cabin beat and phone-call keys are executable runtime references; Lag hint/chop cue ids are exhaustively selected from their finite domains.',
    }));
  }

  for (const [scene, dir, source, module] of [
    ['beefrun', 'src/beefrun', 'src/beefrun/script.js', '../src/beefrun/script.js'],
    ['enolasquatch', 'src/enolasquatch', 'src/enolasquatch/dialogue/script.js', '../src/enolasquatch/dialogue/script.js'],
  ]) {
    const { BEATS, BARKS } = await import(module);
    const resolvedTemplateIds = scene === 'beefrun'
      ? new Set((await import('../src/beefrun/config.js')).LANDMARKS
        .filter(({ kind }) => kind !== 'falls')
        .map(({ kind }) => `nav.${kind}`))
      : new Set();
    const runtime = scanRuntime(dir, [source]);
    const findings = [];
    const undecided = [];
    for (const [mapName, map] of [['BEATS', BEATS], ['BARKS', BARKS]]) {
      const result = analyseBeatIds({
        scene, map, mapName, runtime, source, countLines: countArray, resolvedTemplateIds,
      });
      findings.push(...result.findings);
      undecided.push(...result.undecided);
    }
    reports.push({
      scene,
      findings,
      undecided,
      completeCampaignBeats: scene === 'beefrun' ? ['beef_run'] : ['enola_squatch'],
      evidence: 'Every authored beat/bark id is an executable reference or belongs to a proved finite dispatch domain.',
    });
  }

  {
    const source = 'src/nowake/dialogue.js';
    const {
      NO_WAKE_BODY_LINES,
      NO_WAKE_CABIN_SCRIPT,
      NO_WAKE_DOCK_LINES,
      NO_WAKE_INLET_LINES,
      allNoWakeVoiceLines,
      buildNoWakeCruise,
    } = await import('../src/nowake/dialogue.js');
    const runtime = scanRuntime('src/nowake', [source]);
    const analyses = [
      analyseKeyedMap({
        scene: 'nowake', map: NO_WAKE_INLET_LINES, mapName: 'NO_WAKE_INLET_LINES', runtime, source, countLines: countArray,
      }),
      analyseKeyedMap({
        scene: 'nowake', map: NO_WAKE_BODY_LINES, mapName: 'NO_WAKE_BODY_LINES', runtime, source, countLines: countArray,
      }),
    ];
    const findings = [];
    for (const [identifier, lines] of [
      ['NO_WAKE_DOCK_LINES', NO_WAKE_DOCK_LINES],
      ['NO_WAKE_CABIN_SCRIPT', NO_WAKE_CABIN_SCRIPT],
    ]) {
      if (!runtime.idents.has(identifier)) {
        findings.push(exactCueFinding('nowake', identifier, source, lines[0]));
      }
    }
    if (!runtime.idents.has('buildNoWakeCruise')) {
      findings.push(exactCueFinding('nowake', 'buildNoWakeCruise', source, { text: 'The cruise variant builder has no executable caller.' }));
    }
    const exercisedCues = new Set([
      ...NO_WAKE_DOCK_LINES,
      ...NO_WAKE_CABIN_SCRIPT,
      ...Object.values(NO_WAKE_INLET_LINES),
      ...Object.values(NO_WAKE_BODY_LINES),
      ...buildNoWakeCruise({ beefDetected: false, motelPoliceHeat: 0 }),
      ...buildNoWakeCruise({ beefDetected: true, motelPoliceHeat: 0 }),
      ...buildNoWakeCruise({ beefDetected: false, motelPoliceHeat: 56 }),
    ].map(({ cue }) => cue));
    for (const line of allNoWakeVoiceLines()) {
      if (!exercisedCues.has(line.cue)) {
        findings.push(exactCueFinding('nowake', `cue['${line.cue}']`, source, line));
      }
    }
    analyses.push({ findings, undecided: [] });
    reports.push(mergeAnalyses('nowake', analyses, {
      completeCampaignBeats: ['no_wake'],
      evidence: 'Dock/cabin containers and inlet/body keys are executable runtime references; all three finite cruise-history variants exhaust the authored cue catalog.',
    }));
  }

  for (const [scene, dir, source, module, completeCampaignBeats] of [
    ['silvercase', 'src/silvercase', 'src/silvercase/dialogue/script.js', '../src/silvercase/dialogue/script.js', ['silver_case_setup', 'silver_case_mansion']],
    ['siege', 'src/mansion/siege', 'src/mansion/siege/script.js', '../src/mansion/siege/script.js', ['mansion_siege']],
  ]) {
    const { SEQUENCES } = await import(module);
    const runtime = scanRuntime(dir, [source]);
    reports.push(mergeAnalyses(scene, [analyseKeyedMap({
      scene, map: SEQUENCES, mapName: 'SEQUENCES', runtime, source, countLines: countArray,
    })], {
      completeCampaignBeats,
      evidence: 'Every authored sequence key is named by executable scene runtime source.',
    }));
  }

  {
    const source = 'src/golf/script.js';
    const { buildScripts, unreachableCues } = await import('../src/golf/script.js');
    const noop = () => {};
    const trees = buildScripts({
      play: noop,
      playSequence: noop,
      remember: noop,
      flag: noop,
      playCallbacks: noop,
      callbackHold: () => 0,
    });
    const findings = unreachableCues(trees).map((cue) => exactCueFinding(
      'golf', `CUES['${cue}']`, source, { text: cue },
    ));
    reports.push({
      scene: 'golf', findings, undecided: [], completeCampaignBeats: ['silver_pines'],
      evidence: 'Golf\'s native unreachableCues harness proves every registry cue appears in a sequence, history branch, or live conversation tree.',
    });
  }

  {
    const source = 'src/specialmeeting/script.js';
    const { BEATS } = await import('../src/specialmeeting/script.js');
    const { walkScene } = await import('../src/specialmeeting/ride.js');
    const pickers = [
      () => 1,
      (options) => options.at(-1).index,
      (options) => options[Math.min(1, options.length - 1)].index,
      (options) => options[Math.min(2, options.length - 1)].index,
      (options) => options[Math.min(3, options.length - 1)].index,
      (options, _beat, number) => options[(number - 1) % options.length].index,
      (options) => (options.find((option) => !option.accepts) ?? options[0]).index,
    ];
    const visited = new Set();
    const said = new Set();
    const findings = [];
    for (const pick of pickers) {
      const run = walkScene({ pick });
      if (!run.finished) {
        findings.push(exactCueFinding('specialmeeting', 'walkScene did not finish', source, { text: 'One real Special Meeting choice strategy did not reach the handoff.' }));
      }
      for (const id of run.visited) visited.add(id);
      for (const cue of run.said) said.add(cue);
    }
    for (const authoredBeat of BEATS.filter(({ act }) => act >= 2)) {
      if (!visited.has(authoredBeat.id)) {
        findings.push(exactCueFinding('specialmeeting', `BEATS['${authoredBeat.id}']`, source, authoredBeat.lines?.[0]));
      }
      for (const line of authoredBeat.lines ?? []) {
        if (line?.cue && !said.has(line.cue)) {
          findings.push(exactCueFinding('specialmeeting', `cue['${line.cue}']`, source, line));
        }
      }
    }

    /* Act One is a timed apartment prelude, not part of walkScene. Its shared
     * module owns seven exact beats and apartment-story owns SM-030. Exact ids
     * must appear in executable source; comments cannot satisfy this scan. */
    const actOneRuntime = [
      'src/core/special-meeting-home-prelude.js',
      'src/core/apartment-story.js',
      'src/main.js',
      'src/luxury-apartment/main.js',
    ].map((file) => executableSource(fs.readFileSync(path.join(ROOT, file), 'utf8'))).join('\n');
    const actOneLiterals = stringLiterals(actOneRuntime);
    for (const authoredBeat of BEATS.filter(({ act }) => act === 1)) {
      if (!(authoredBeat.lines ?? []).some(({ cue }) => cue)) continue;
      if (!actOneLiterals.has(authoredBeat.id)) {
        findings.push(exactCueFinding('specialmeeting', `BEATS['${authoredBeat.id}']`, source, authoredBeat.lines?.[0]));
      }
    }
    reports.push({
      scene: 'specialmeeting', findings, undecided: [],
      completeCampaignBeats: ['special_meeting_call', 'pickup_ride'],
      evidence: 'Apartment prelude beat ids are exact executable references; seven exhaustive numbered-choice strategies union every ride beat and emitted cue through the handoff.',
      runtimeEvidence: 'semantic-smoke special_meeting_canonical exercises real pointer-lock/input and inspects canonical speech playback receipts.',
    });
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
/* Campaign-beat disposition                                           */
/* ------------------------------------------------------------------ */

/**
 * Turn scene-native graph proofs into one honest row per campaign beat.
 *
 * A catalog row is not proof. A beat becomes PASS only when a report declares
 * that exact campaign id complete and the report has neither a live finding
 * nor an unresolved dynamic dispatch. Missing adapters stay UNKNOWN; the
 * caller can render the whole campaign without laundering inventory into
 * reachability.
 */
export function buildCampaignBeatReachability({
  spine,
  dialogueRows,
  reports,
  allowlistEntries = [],
}) {
  const rowsByBeat = new Map();
  for (const row of dialogueRows ?? []) {
    const key = String(row?.beat ?? '');
    rowsByBeat.set(key, (rowsByBeat.get(key) ?? 0) + 1);
  }
  const reportByBeat = new Map();
  for (const report of reports ?? []) {
    for (const beatId of report.completeCampaignBeats ?? []) {
      if (reportByBeat.has(beatId)) {
        throw new Error(`Campaign beat ${beatId} has two dialogue-reachability owners`);
      }
      reportByBeat.set(beatId, report);
    }
  }

  return (spine ?? []).map((beat) => {
    const authoredLines = rowsByBeat.get(String(beat.n)) ?? 0;
    if (authoredLines === 0) {
      return {
        beat: beat.n,
        beatId: beat.id,
        title: beat.title,
        scene: beat.scene,
        authoredLines,
        adapter: null,
        status: 'INTENTIONAL_NA',
        evidence: 'The generated campaign dialogue ledger contains zero authored spoken lines for this beat.',
      };
    }

    const report = reportByBeat.get(beat.id);
    if (!report) {
      return {
        beat: beat.n,
        beatId: beat.id,
        title: beat.title,
        scene: beat.scene,
        authoredLines,
        adapter: null,
        status: 'UNKNOWN',
        evidence: `${authoredLines} authored lines exist, but an execution-path adapter for this campaign beat is not proved.`,
      };
    }

    const { kept, suppressed } = applyReachabilityAllowlist(
      report.findings ?? [], allowlistEntries,
    );
    const base = {
      beat: beat.n,
      beatId: beat.id,
      title: beat.title,
      scene: beat.scene,
      authoredLines,
      adapter: report.scene,
    };
    if (kept.length) {
      return {
        ...base,
        status: 'FAIL',
        evidence: `${kept.length} unreachable authored ${kept.length === 1 ? 'path is' : 'paths are'} proved by the ${report.scene} adapter.`,
      };
    }
    if ((report.undecided ?? []).length) {
      return {
        ...base,
        status: 'UNKNOWN',
        evidence: `${report.undecided.length} dynamic dispatch ${report.undecided.length === 1 ? 'domain is' : 'domains are'} not proved by a finite runtime source.`,
      };
    }
    if (suppressed.length) {
      return {
        ...base,
        status: 'ALLOWLISTED_DEBT',
        evidence: `${report.evidence ?? 'Scene-native graph proof completed.'} ${suppressed.length} known unreachable ${suppressed.length === 1 ? 'path remains' : 'paths remain'} explicitly allowlisted.`,
      };
    }
    return {
      ...base,
      status: 'PASS',
      evidence: report.evidence ?? 'Scene-native execution graph proves every authored line can be dispatched.',
      runtimeEvidence: report.runtimeEvidence ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  const showAll = process.argv.includes('--all');
  const showCampaign = process.argv.includes('--campaign');
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
  const allUnknown = reports.flatMap((report) => report.undecided
    .map((entry) => ({ scene: report.scene, ...entry })));
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
      console.log(`  ? ${beat} — built by template \`${template.prefix}\${…}\` at ${template.source}; UNKNOWN until its finite data domain is proved`);
    }
  }

  let campaignOpen = [];
  if (showCampaign) {
    const [{ CAMPAIGN_SPINE }] = await Promise.all([
      import('../src/core/campaign-spine.js'),
    ]);
    const dialogueRows = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'docs/dialogue/DIALOGUE-PASS.json'), 'utf8',
    ));
    const campaignRows = buildCampaignBeatReachability({
      spine: CAMPAIGN_SPINE,
      dialogueRows,
      reports,
      allowlistEntries: entries,
    });
    console.log('\nCampaign dialogue reachability — every playable beat:\n');
    for (const row of campaignRows) {
      console.log(`  ${String(row.beat).padStart(4)}  ${row.status.padEnd(18)} ${row.beatId}`
        + ` — ${row.authoredLines} authored line(s); ${row.evidence}`);
    }
    const counts = Object.fromEntries([
      'PASS', 'ALLOWLISTED_DEBT', 'INTENTIONAL_NA', 'FAIL', 'UNKNOWN',
    ].map((status) => [status, campaignRows.filter((row) => row.status === status).length]));
    console.log(`\nCampaign disposition: ${Object.entries(counts)
      .map(([status, count]) => `${count} ${status}`).join(' · ')}`);
    campaignOpen = campaignRows.filter(({ status }) => status === 'FAIL' || status === 'UNKNOWN');
    if (campaignOpen.length) {
      console.error(`${campaignOpen.length} campaign beat(s) are FAIL/UNKNOWN. Unknown is not a pass.`);
    }
  }

  if (stale.length) {
    console.error('\nSTALE allowlist entries — they excused nothing this run:');
    for (const id of stale) console.error(`  - ${id}`);
    console.error('Go and check the line really is dispatched now before deleting the entry.');
    console.error('docs/ENGINE-TRAPS.md entry 10: the last time entries went stale, the gate had gone blind.');
  }

  if (allUnknown.length) {
    console.error(`\nUNKNOWN dynamic dispatches: ${allUnknown.length}. Unknown is not a pass.`);
  }

  if (kept.length || stale.length || allUnknown.length || campaignOpen.length) {
    process.exitCode = 1;
    return;
  }
  console.log(`\nok — every authored line in ${scenes.length} scene-native adapters is dispatched or allowlisted.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
