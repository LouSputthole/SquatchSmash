/**
 * The gate that asks whether a recorded take can ever be HEARD.
 *
 * Fourteen takes were written, cast, cued, rendered to mp3, listed in the
 * manifest and shipped without one of them being reachable by any player,
 * and every audio gate in CI was green for the whole of it, because every
 * per-scene ledger enumerates AUTHORED lines and calls that coverage.
 * tools/line-reachability.mjs is the missing question; this is the test that
 * keeps it honest.
 *
 * The half that matters most here is the FALSE POSITIVE half. docs/ENGINE-TRAPS
 * entry 5 is a list of gates that lied, and the fastest way onto it is to
 * report forty findings and be wrong about all forty -- so the cases below
 * pin the three rules that were got wrong while the tool was being written,
 * each of which produced a confident report about a line that works:
 *
 *   1. a shared visited set across mission-state contexts, which reported
 *      three live Bing nodes as dead;
 *   2. template prefixes harvested from every template literal in the scene
 *      rather than from dispatch calls, which let an aeroplane-part name
 *      swallow a genuinely dead pool of three barks;
 *   3. beat ids treated as reachable only at a `dialogue.play()`, which loses
 *      every scene that hands an id about as a value.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from '../vendor/three.module.min.js';

import {
  ALLOWLIST_SCHEMA,
  MIN_REASON_CHARS,
  analyseBeatIds,
  analyseKeyedMap,
  analyseScenes,
  analyseTrees,
  aliasExports,
  applyReachabilityAllowlist,
  dispatchTemplatePrefixes,
  memberReferences,
  portableSourcePath,
  reachableTreeNodes,
  scanRuntime,
  stringLiterals,
  unusedEntries,
  validateReachabilityAllowlist,
} from '../tools/line-reachability.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ALLOWLIST_PATH = path.join(ROOT, 'tools/line-reachability-allowlist.json');

/** A hand-built stand-in for what scanRuntime() reads off disk. */
function runtimeIndex({ literals = [], members = [], idents = [], templates = [] } = {}) {
  return {
    literals: new Set(literals),
    members: new Set(members),
    idents: new Set(idents),
    templates: templates.map((prefix) => ({ prefix, source: 'fixture.js:1' })),
  };
}

const countArray = (value) => value.length;

/* One walk of the real scenes, shared: it imports five script modules and
 * scans five source trees, and two tests want the same answer. */
let analysedOnce = null;
const analysed = () => (analysedOnce ??= analyseScenes());

/* ------------------------------------------------------------------ */
/* Scanning                                                            */
/* ------------------------------------------------------------------ */

test('a beat id counts as dispatched wherever the string appears, not only at a play() call', () => {
  /* Beefrun hands ids about as values: approach-coaching.js RETURNS
   * 'approach.high2' and mission.js plays whatever came back, and detection.js
   * calls onRadio?.('caib.sweep') through a callback the mission installed.
   * Insisting on a literal inside dialogue.play() would report every one of
   * those as dead, which is the gate lying. */
  const text = "if (nextCalls === 2) call = 'approach.high2';\nthis.onRadio?.(\"caib.sweep\");";
  const found = stringLiterals(text);
  assert.ok(found.has('approach.high2'));
  assert.ok(found.has('caib.sweep'));
});

test('template prefixes come from dispatch calls only', () => {
  /* The aeroplane builder alone contributes forty template literals --
   * 'fuselage-side-', 'rgba(58,47,95,' -- and taking their static halves as
   * evidence of dispatch is how BARKS.patrolClose was swallowed by prefix on
   * the first draft: three real dead barks, silently declared fine. */
  const text = [
    'const name = `fuselage-side-${i}`;',
    'ctx.fillStyle = `rgba(58,47,95,${a})`;',
    'this.dialogue.play(`nav.${lm.kind}`, { once: true });',
  ].join('\n');
  assert.deepEqual(dispatchTemplatePrefixes(text), ['nav.']);
});

test('only capitalised receivers count as a table reference', () => {
  /* The mansion passes the line array itself -- `bark: SEQUENCES.gateGreeting`.
   * Matching every `foo.bar` in the scene instead would make every key of
   * every map reachable by coincidence and the gate would find nothing ever. */
  const found = memberReferences("bark: SEQUENCES.gateGreeting,\nnode.next = 'x';\nBEATS['load.done']");
  assert.ok(found.has('SEQUENCES.gateGreeting'));
  assert.ok(found.has('BEATS.load.done'));
  assert.ok(!found.has('node.next'));
});

test('a beat re-exported under its own name is found through the alias', () => {
  /* The ceremony hands each beat out as SPEECH, Q1_LINES, ANOINT_LINES and
   * main.js imports the names, never the map. Derived from the data file so a
   * beat that gains an alias tomorrow needs no edit here. */
  const aliases = aliasExports(
    'export const ANOINT_LINES = CEREMONY_BEATS.anoint;\nexport const SPEECH = CEREMONY_BEATS.speech;',
    'CEREMONY_BEATS',
  );
  assert.deepEqual(aliases.get('anoint'), ['ANOINT_LINES']);
  assert.deepEqual(aliases.get('speech'), ['SPEECH']);
});

test('scanRuntime reads the real beefrun scene and finds its one template dispatch', () => {
  const runtime = scanRuntime('src/beefrun', ['src/beefrun/script.js']);
  const nav = runtime.templates.find((entry) => entry.prefix === 'nav.');
  assert.ok(nav, 'the landmark template at mission.js is no longer being seen');
  assert.match(nav.source, /^src\/beefrun\/mission\.js:\d+$/);
  assert.ok(runtime.literals.has('takeoff.rotate'), 'the takeoff call went missing from the scan');
});

test('source provenance uses repository separators on every host', () => {
  assert.equal(
    portableSourcePath('src\\beefrun\\mission.js'),
    'src/beefrun/mission.js',
  );
});

/* ------------------------------------------------------------------ */
/* The three shapes                                                    */
/* ------------------------------------------------------------------ */

test('a keyed map reports the key nothing names, and only that key', () => {
  const map = { gateGreeting: [{ cue: 'a', text: 'hello' }], gateWarning: [{ cue: 'b', text: 'do that again' }] };
  const { findings } = analyseKeyedMap({
    scene: 'fixture',
    map,
    mapName: 'SEQUENCES',
    runtime: runtimeIndex({ members: ['SEQUENCES.gateGreeting'] }),
    source: 'fixture.js',
    countLines: (value) => value.filter((line) => line.cue).length,
  });
  assert.deepEqual(findings.map((finding) => finding.beat), ['SEQUENCES.gateWarning']);
  assert.equal(findings[0].lines, 1);
  assert.equal(findings[0].say, 'do that again');
});

test('a beat built by a template is declared undecided, never dead', () => {
  /* `dialogue.play(`nav.${lm.kind}`)` cannot be resolved statically. Reporting
   * the four nav beats as unreachable would be four confident lies, and the
   * report says out loud which template declined to judge them instead. */
  const map = { 'nav.river': [{ text: 'river' }], 'load.strap': [{ text: 'strap them' }] };
  const { findings, undecided } = analyseBeatIds({
    scene: 'fixture',
    map,
    mapName: 'BEATS',
    runtime: runtimeIndex({ templates: ['nav.'] }),
    source: 'fixture.js',
    countLines: countArray,
  });
  assert.deepEqual(findings.map((finding) => finding.beat), ["BEATS['load.strap']"]);
  assert.deepEqual(undecided.map((entry) => entry.beat), ["BEATS['nav.river']"]);
  assert.equal(undecided[0].template.prefix, 'nav.');
});

test('a tree node reached only through a state-conditional option is not dead', () => {
  /* THE BUG THIS PINS: one visited set shared across contexts. The first
   * context marks the root seen; the second never re-expands it, so the branch
   * that only exists once you are carrying the package is never walked. That
   * draft reported bartender.tab, hallGuard.tailoring and dj.horns as dead --
   * three live nodes, in the same run that found the two real ones. */
  const build = (gotPackage) => ({
    hallGuard: {
      open: { line: 'He is in a mood.', options: () => (gotPackage
        ? [{ text: 'It is tailoring.', next: 'tailoring' }]
        : [{ text: 'That narrow it down?', next: 'no' }]) },
      no: { line: 'No. Go in.' },
      tailoring: { line: 'Sure it is. Keep your jacket shut in the lot.' },
      candy: { line: 'Take one. Everybody takes one.' },
    },
  });
  const { findings } = analyseTrees({
    scene: 'fixture',
    buildAll: () => [build(false), build(true)],
    runtime: runtimeIndex({ literals: ['open'] }),
    source: 'fixture.js',
  });
  assert.deepEqual(findings.map((finding) => finding.beat), ['hallGuard.candy']);
  assert.equal(findings[0].say, 'Take one. Everybody takes one.');
});

test('the tree walk follows next, goto and every option edge', () => {
  const tree = {
    open: { options: [{ next: 'a' }, { goto: 'b' }] },
    a: { next: 'c' },
    b: {},
    c: {},
    orphan: {},
  };
  assert.deepEqual([...reachableTreeNodes(tree, ['open'])].sort(), ['a', 'b', 'c', 'open']);
});

/* ------------------------------------------------------------------ */
/* The allowlist, and its ratchet                                      */
/* ------------------------------------------------------------------ */

function entry(overrides = {}) {
  return {
    id: 'fixture-one',
    scene: 'fixture',
    beat: 'BEATS[\'a\']',
    reason: 'x'.repeat(MIN_REASON_CHARS),
    source: 'fixture.js:1',
    ...overrides,
  };
}

test('the allowlist refuses a shrug, a wildcard, an unknown key and an unsorted id', () => {
  const { issues } = validateReachabilityAllowlist({
    $schema: ALLOWLIST_SCHEMA,
    entries: [
      entry({ id: 'fixture-two', reason: 'dead' }),
      entry({ id: 'fixture-one', beat: 'BEATS[*]' }),
      entry({ id: 'fixture-three', note: 'why not' }),
    ],
  });
  assert.ok(issues.some((issue) => issue.includes('at least')), 'a one-word reason was accepted');
  assert.ok(issues.some((issue) => issue.includes('must sort after')), 'ids may not be left unsorted');
  assert.ok(issues.some((issue) => issue.includes('wildcard')), 'a wildcard beat was accepted');
  assert.ok(issues.some((issue) => issue.includes('unknown key')), 'an unknown key was accepted');
});

test('an unknown schema is refused outright rather than half-read', () => {
  const { issues } = validateReachabilityAllowlist({ $schema: 'something.else.v9', entries: [] });
  assert.ok(issues.some((issue) => issue.includes('Unknown allowlist schema')));
});

test('an entry that excuses nothing is stale, and stale is an error', () => {
  /* docs/ENGINE-TRAPS.md entry 10. Forty-two mansion recliner entries went
   * stale the day `isOwnBody` started reading a chair as its own sitter --
   * nothing had been fixed, the gate had gone blind, and deleting them as
   * tidy-up would have destroyed the only written record of the fault AND
   * left the blind spot in place. So counts may fall freely; a fallen count
   * still has to be looked at by somebody. */
  const entries = [entry({ id: 'fixture-live' }), entry({ id: 'fixture-stale', beat: "BEATS['gone']" })];
  const findings = [{ scene: 'fixture', beat: "BEATS['a']", lines: 1 }];
  const { kept, suppressed, used } = applyReachabilityAllowlist(findings, entries);
  assert.deepEqual(kept, []);
  assert.equal(suppressed.length, 1);
  assert.deepEqual(unusedEntries(entries, used, ['fixture']), ['fixture-stale']);
});

test('an entry only excuses its own scene', () => {
  const entries = [entry({ scene: 'beefrun' })];
  const { kept } = applyReachabilityAllowlist([{ scene: 'mansion', beat: "BEATS['a']", lines: 1 }], entries);
  assert.equal(kept.length, 1, 'a beat name matching in another scene was excused');
});

/* ------------------------------------------------------------------ */
/* The repo as it actually stands                                      */
/* ------------------------------------------------------------------ */

test('the shipped allowlist is a usable document', () => {
  const doc = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const { entries, issues } = validateReachabilityAllowlist(doc);
  assert.deepEqual(issues, [], 'the allowlist the gate runs against does not validate');
  assert.ok(entries.length > 0, 'the allowlist has no entries and the gate is therefore untested by it');
});

test('every authored line in the covered scenes is dispatched or allowlisted, and no entry is stale', async () => {
  const doc = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const { entries } = validateReachabilityAllowlist(doc);
  const resolved = await analysed();
  {
    const scenes = resolved.map((report) => report.scene);
    const { kept, used } = applyReachabilityAllowlist(resolved.flatMap((report) => report.findings), entries);
    assert.deepEqual(
      kept.map((finding) => `${finding.scene} ${finding.beat}`), [],
      'a take nobody can hear is not covered by a reason anybody has written',
    );
    assert.deepEqual(unusedEntries(entries, used, scenes), [],
      'an allowlist entry excused nothing — go and check the line is really dispatched now');
  }
});

test('the three lines this pass wired up are dispatched, not allowlisted', async () => {
  const resolved = await analysed();
  {
    const dead = new Set(resolved.flatMap((report) => report.findings)
      .map((finding) => `${finding.scene} ${finding.beat}`));
    /* The doorman's second-time line, Lou's sweets and his chair, and the
     * westerly climbout call. If any of these come back the wiring has been
     * unpicked and the takes are silent again. */
    for (const beat of [
      'mansion SEQUENCES.gateWarning',
      'bing lou.candy',
      'bing lou.sat',
      "enolasquatch BEATS['climb.turn.west']",
    ]) {
      assert.ok(!dead.has(beat), `${beat} is unreachable again`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* The wiring itself                                                   */
/* ------------------------------------------------------------------ */

test('callNewHeading says the heading it was given, west as well as east', async () => {
  /* It took `deg`, used it for the banner, the objective and the compass bug,
   * and then played a hardcoded 'climb.turn.east'. Both takes name their
   * heading out loud, so the west recording could never be played and a
   * westerly mission would have had Irish calling zero-nine-zero over a bug
   * pointing at two-seven-zero. */
  const { MissionController } = await import('../src/enolasquatch/mission/MissionController.js');
  const spoken = (deg) => {
    const said = [];
    const self = Object.assign(Object.create(MissionController.prototype), {
      phase: 'climbTurn',
      flags: { turnCalled: false },
      physics: { position: new THREE.Vector3(0, 0, 0), headingDeg: 180 },
      dialogue: { play(id) { said.push(id); }, busy: false, forget() {} },
      hud: { say() {} },
      flightHud: { setObjective() {}, setNav() {}, setDirection() {} },
      objective: '',
      setObjective(text) { self.objective = text; },
      groundAt: () => 0,
      camera: null,
      navRange: null,
    });
    assert.equal(self.callNewHeading(deg), true);
    return { said, objective: self.objective };
  };

  const east = spoken(90);
  assert.deepEqual(east.said, ['climb.turn.east']);
  assert.match(east.objective, /090/);

  const west = spoken(270);
  assert.deepEqual(west.said, ['climb.turn.west'], 'the west take is still dead behind a hardcoded string');
  assert.match(west.objective, /270/);
});

test('a heading with no written line gets silence rather than the wrong recording', () => {
  /* Both takes say their own heading, so there is no honest line for 045. The
   * banner, the objective and the compass bug are all built from `deg` and are
   * correct on their own; a recorded voice contradicting them is the exact
   * defect being removed here, not a fallback. */
  const source = fs.readFileSync(path.join(ROOT, 'src/enolasquatch/mission/MissionController.js'), 'utf8');
  const map = source.match(/const CLIMB_TURN_BEAT_BY_HEADING = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(map, 'the climbout call is no longer keyed by heading');
  assert.deepEqual(
    [...map[1].matchAll(/(\d+):\s*'([^']+)'/g)].map((entry_) => [entry_[1], entry_[2]]),
    [['90', 'climb.turn.east'], ['270', 'climb.turn.west']],
  );
  assert.match(source, /if \(turnBeat\) this\.dialogue\.play\(turnBeat/,
    'an unwritten heading must play nothing rather than the nearest lie');
});

test("the man on the door has a second-time state for the warning he was recorded saying", () => {
  /* SEQUENCES.gateWarning -- "Do that again and you leave the property a
   * different way than you came onto it" -- had no state to fire from: bark,
   * idle and a one-branch onUse, so walking the case back up to him got the
   * case speech again as if nothing had happened. */
  const source = fs.readFileSync(path.join(ROOT, 'src/mansion/cast.js'), 'utf8');
  assert.match(source, /let gateCaseSaid = false;/);
  assert.match(source, /gateCaseSaid \? SEQUENCES\.gateWarning : SEQUENCES\.gateCase/);
});

test('the office sweets and the visitor chair carry Lou’s two orphaned lines', () => {
  /* Every sibling in the script's says-without-being-spoken-to block has a
   * reg(club.office.…) hook; candy and sat had none, and club.js built
   * anchors.candy with no interactable on it. */
  const club = fs.readFileSync(path.join(ROOT, 'src/bing/club.js'), 'utf8');
  assert.match(club, /office\.candy = bowl;/, 'the sweets are still a point in the air');
  const main = fs.readFileSync(path.join(ROOT, 'src/bing/main.js'), 'utf8');
  assert.match(main, /reg\(club\.office\.candy, \{/);
  assert.match(main, /dialogue\.start\(scripts\.lou, 'candy', cast\.byName\.lou\)/);
  assert.match(main, /dialogue\.start\(scripts\.lou, 'sat', cast\.byName\.lou\)/);
  assert.match(main, /club\.anchors\.visitorSeat/,
    'the chair anchor the office has always published is still read by nothing');
});
