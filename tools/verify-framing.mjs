/**
 * Run the beat framing gate over the registered geometry scene states.
 *
 *   node tools/verify-framing.mjs                 # every state that declares a beat
 *   node tools/verify-framing.mjs initiation      # one scene
 *   node tools/verify-framing.mjs --coverage      # whose dialogue no shot check can reach
 *   node tools/verify-framing.mjs --beats shots.json
 *
 * This rides tools/geometry-scenes.mjs for the same reason
 * tools/verify-staging.mjs does: those adapters already build the game's scene
 * states headlessly, with real world matrices, and that is most of the cost of
 * asking ANY question about a scene. The framing questions are different
 * arithmetic over the same build. A second, parallel way to build the same
 * scenes would be a second thing to keep true.
 *
 * WHAT IT CAN SEE, AND WHAT IT CANNOT. A shot is authored in the scene's own
 * runtime -- `CAMERA_SHOTS` in src/initiation/main.js is a table of closures
 * over live rig nodes, and it is not data anything can read from out here.
 * So this reporter asks the scene to PUBLISH its beats, and reads two places:
 *
 *   built.metadata.framingBeats     an array of beats the adapter hands over
 *   object.userData.framingBeat     a beat stamped on the node it films
 *
 * Nothing publishes either yet, and that is the honest state of it: the
 * arithmetic is finished and under test, and the scenes opt in one at a time.
 * `--coverage` prints exactly how much of the game is still dark, the way
 * `verify-staging --coverage` prints the bodies no check can reach. A gate
 * that quietly reports "clean" over scenes it cannot see is the failure this
 * whole family of tools exists to end.
 *
 * `--beats <file>` is the shortcut for the meantime, and for the moment BEFORE
 * a shot is written: a JSON file of `{ "<state id>": [beat, ...] }` is checked
 * against the real build, so a shot list can be tried against the room it will
 * be filmed in without touching the scene at all. Beats from the file are
 * pooled with anything the scene publishes; the point of the file is to stop
 * being a reason to skip publishing, not to replace it.
 *
 * What it CAN do with no author input at all is the camera the build already
 * contains: a real PerspectiveCamera in a real scene has a real position, and
 * a position inside a collider is a shot of the inside of a wall. Those beats
 * are reported separately and marked `derived`, because several adapters park
 * a stand-in camera at the origin to hang held props off -- that camera is the
 * harness's, not the scene's, and its findings are worth less than an
 * authored beat's.
 *
 * IT BLOCKS NOW, WITH NOTHING ON THE LIST, and it did not always. It reported
 * five findings and exited zero while they were all one artifact -- Initiation
 * authoring its collision as height-less circles -- and a gate that exits zero
 * is a gate whose next finding arrives in a log nobody reads. Three of the
 * five went when the ray started being tested against the circle the author
 * wrote rather than its circumscribing square. The last two were the parked
 * cars, roofs at 2.26 m under a collider band invented up to 4 m; those went
 * when buildCar started MEASURING the car it had just built and passing the
 * band through as y0/y1. So an AUTHORED finding fails the build outright, and
 * so does an allowlist entry that excused nothing -- docs/ENGINE-TRAPS.md
 * entry 10, because a stale entry is as likely to mean the gate went blind as
 * that somebody fixed something. There is currently no allowlist file at all,
 * which is the state to hold: see where it is read, below.
 *
 * A DERIVED camera never fails a build and is never allowlisted. It is the
 * harness's own stand-in as often as it is the scene's, so it has nothing to
 * excuse: it is reported, counted separately, and left for a person.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { ensureDomShim, ensureThreeShim } from './three-shim.mjs';
import { normalizeSceneColliders, withDescriptorGeometryRandom } from './verify-geometry-worker.mjs';
import { buildGeometrySceneState, GEOMETRY_SCENE_STATES } from './geometry-scenes.mjs';
import { collectActors } from '../src/core/staging.js';
import { framingFindings } from './framing-gate.mjs';
import {
  applyFramingAllowlist, unusedEntries, validateFramingAllowlist,
} from './framing-allowlist.mjs';

/* The same two shims the geometry worker installs, for the same reason: half
 * these scenes paint a texture on a canvas while they build, and a scene that
 * cannot build is a scene this gate silently says nothing about. The seeded
 * random comes from the same place, so a forest built twice is the same forest
 * and a finding is reproducible. */
ensureThreeShim();
ensureDomShim();

const args = process.argv.slice(2);
const wantCoverage = args.includes('--coverage');
const beatsFlag = args.indexOf('--beats');
const beatsPath = beatsFlag === -1 ? null : args[beatsFlag + 1];
const filters = args
  /* `beatsFlag + 1` is 0 when there is no --beats, so this dropped the FIRST
   * positional argument on every ordinary run: `verify-framing initiation`
   * silently swept all 98 states and reported them as though the filter had
   * been honoured. A gate that lies about what it looked at is worse than one
   * that looks at nothing, because the output is convincing. */
  .filter((arg, index) => !arg.startsWith('--')
    && !(beatsFlag !== -1 && index === beatsFlag + 1));

/* A missing or malformed beats file THROWS rather than quietly checking
 * nothing. Every other silent pass in this project's history started as a
 * convenience exactly this shape. */
const fileBeats = beatsPath ? JSON.parse(fs.readFileSync(beatsPath, 'utf8')) : {};
if (beatsPath && (typeof fileBeats !== 'object' || Array.isArray(fileBeats))) {
  throw new TypeError(`${beatsPath} must be an object keyed by scene state id`);
}

/**
 * Hold every entry's citation to the file it actually cites.
 *
 * THE GEOMETRY AND STAGING GATES BOTH DO THIS, and it is the reason they can
 * be trusted: an entry whose cited line has moved is caught the moment the
 * source shifts, and the siege's allowlist was found pointing three lines off
 * for weeks with 480 entries quietly wrong. The pure validators cannot do it
 * -- they have no filesystem, deliberately -- so it lives here beside the
 * reading, as it does in tools/verify-staging.mjs. It is a third copy of
 * twenty lines rather than a shared module because lifting it means editing
 * two other gates' readers, and this change does not own them; the day a
 * fourth allowlist wants it, that is the change to make.
 */
function citationIssues(entries) {
  const found = [];
  const cache = new Map();
  entries.forEach((entry, index) => {
    const at = `entries[${index}]`;
    const match = /^(.+):(\d+)$/.exec(entry.source ?? '');
    if (!match) {
      found.push(`${at}.source must be "path/to/file.js:line"`);
      return;
    }
    const [, relative, rawLine] = match;
    const file = path.join(ROOT, relative);
    if (!cache.has(file)) {
      cache.set(file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : null);
    }
    const lines = cache.get(file);
    if (!lines) {
      found.push(`${at}.source cites ${relative}, which does not exist`);
      return;
    }
    const lineNumber = Number(rawLine);
    if (!(lineNumber >= 1 && lineNumber <= lines.length)) {
      found.push(`${at}.source cites ${relative}:${lineNumber}, past the end of a ${lines.length}-line file`);
      return;
    }
    const cited = lines[lineNumber - 1];
    if (!cited.trim()) {
      found.push(`${at}.source cites ${relative}:${lineNumber}, which is blank`);
      return;
    }
    if (entry.sourceAnchor !== undefined && !cited.includes(entry.sourceAnchor)) {
      found.push(`${at}.sourceAnchor ${JSON.stringify(entry.sourceAnchor)} is not on ${relative}:${lineNumber}`);
    }
  });
  return found;
}

/* Read and check the allowlist BEFORE building a single scene. A file that
 * does not validate stops the run rather than half-applying: an allowlist
 * nobody can trust turns every green run after it into a claim nobody made. */
/* NO FILE MEANS NOTHING TO EXCUSE, and that is the state to aim at rather
 * than an edge case to tolerate. The list existed to carry the two parked-car
 * findings; measuring the cars in src/initiation/cabin/execution-ground.js and
 * passing the band through as y0/y1 lifted both, and an allowlist with an
 * empty `entries` array still reads like a place to put the next one. So it
 * was deleted, and the gate now says what the file used to: these are the
 * excuses, and there are none. Write the file again when there is one. */
const ALLOWLIST_PATH = path.join(ROOT, 'tools', 'framing-allowlist.json');
const allowlist = fs.existsSync(ALLOWLIST_PATH)
  ? validateFramingAllowlist(JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')))
  : { entries: [], issues: [] };
allowlist.issues.push(...citationIssues(allowlist.entries));
if (allowlist.issues.length) {
  console.error(`${path.relative(ROOT, ALLOWLIST_PATH)} is not usable:`);
  for (const issue of allowlist.issues) console.error(`  ${issue}`);
  process.exit(1);
}

const THREE = await import('three');

/** Which keys of a `--beats` file actually named a state that was built. */
const matchedFileKeys = new Set();

/** How far ahead of a derived camera its look point is planted. Metres. */
const DERIVED_LOOK_RANGE_M = 10;

/**
 * Every solid in the scene, in the one spelling the gate reads.
 *
 * This normalises through `normalizeSceneColliders` rather than filtering for
 * `isBox3` the way tools/verify-staging.mjs does, and the difference is not
 * academic: the scenes author collision four different ways -- Box3s, XZ
 * bands, {x,z,w,d} slabs, and upright {x,z,r} cylinders -- and Initiation
 * Night, the scene whose camera bug bought this gate, authors ALL 249 of its
 * cabin solids as cylinders. A Box3 filter sees none of them, and a gate that
 * sees no walls cheerfully reports that nothing is behind a wall. The geometry
 * worker already knows how to read all four; asking it is both less code and
 * one fewer opinion about what a collider is.
 *
 * AND IT HANDS OVER THE SHAPE, not only the bounds. The box of an upright
 * cylinder is its circumscribing square, which is the conservative reading for
 * walking into a trunk and the wrong one for seeing past it -- five findings
 * across the two Initiation states were sightlines clearing a parked car at
 * the diagonal by centimetres. `record.shape` is present only where the author
 * wrote a circle, so a scene that builds its walls out of boxes is tested
 * exactly as it always was.
 */
function colliderBoxes(built) {
  return normalizeSceneColliders(built)
    .filter((record) => !record.invalid && record.min && record.max)
    .map((record) => ({
      name: record.id ?? null,
      min: [record.min.x, record.min.y, record.min.z],
      max: [record.max.x, record.max.y, record.max.z],
      ...(record.shape ? { shape: record.shape } : {}),
      typed: record.spatial?.typed === true,
      spatialId: record.spatialId ?? null,
      spatialKind: record.spatialKind ?? null,
      ownerActorId: record.ownerActorId ?? null,
      blocks: record.blocks ?? null,
    }));
}

/**
 * Beats the scene has published about itself.
 *
 * Two spellings because two are useful: an adapter that knows the whole shot
 * list hands it over in metadata, and a scene that films one particular prop
 * stamps the beat on that prop, where it stays correct if the prop moves.
 */
function authoredBeats(built) {
  const beats = [];
  const declared = built.metadata?.framingBeats;
  if (Array.isArray(declared)) beats.push(...declared);
  const fromFile = fileBeats[built.id];
  if (Array.isArray(fromFile)) {
    matchedFileKeys.add(built.id);
    beats.push(...fromFile);
  }
  for (const { root } of built.roots) {
    root.traverse?.((object) => {
      const beat = object.userData?.framingBeat;
      if (!beat || typeof beat !== 'object') return;
      beats.push({ ...beat, id: beat.id ?? object.name ?? null, node: object });
    });
  }
  return beats;
}

/**
 * Resolve a beat that names an OBJECT as its subject rather than an actor.
 *
 * The Initiation's subject was a hand: a node on a rig, not a body in the
 * cast. Resolving by name, and reporting nothing rather than guessing when the
 * name does not resolve, is the same contract `verify-staging` uses for seats
 * -- a prop renamed out from under the shot that films it should be a finding,
 * not a silent pass.
 */
function resolveSubjects(built, beats) {
  const point = new THREE.Vector3();
  for (const beat of beats) {
    if (!beat.subjectObject || beat.subject) continue;
    let node = beat.node?.name === beat.subjectObject ? beat.node : null;
    for (const { root } of built.roots) {
      if (node) break;
      node = root.getObjectByName?.(beat.subjectObject) ?? null;
    }
    beat.subject = node
      ? { id: beat.subjectObject, point: node.getWorldPosition(point).toArray() }
      : { id: beat.subjectObject };
  }
  return beats;
}

/**
 * Every camera actually in the build, as a beat with no speaker in it.
 *
 * No speaker and no subject on purpose. This reporter will not guess who a
 * shot is about -- guessing is how you get a gate that finds forty things and
 * is right about none of them -- so a derived beat can only answer the one
 * question that needs no author: is the lens inside the masonry.
 */
function derivedCameraBeats(built) {
  const beats = [];
  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  for (const { root } of built.roots) {
    root.traverse?.((object) => {
      if (!object.isCamera) return;
      object.getWorldPosition(position);
      object.getWorldDirection(direction);
      beats.push({
        id: `camera:${object.name || '(unnamed)'}`,
        derived: true,
        camera: {
          position: position.toArray(),
          lookAt: position.clone().addScaledVector(direction, DERIVED_LOOK_RANGE_M).toArray(),
          fovDeg: Number.isFinite(object.fov) ? object.fov : undefined,
          aspect: Number.isFinite(object.aspect) ? object.aspect : undefined,
          near: object.near,
          far: object.far,
        },
      });
    });
  }
  return beats;
}

const states = GEOMETRY_SCENE_STATES
  .filter((state) => filters.length === 0 || filters.some((f) => state.id.includes(f)));

let authoredFindings = 0;
let derivedFindings = 0;
let withBeats = 0;
let suppressedCount = 0;
const dark = [];
const byKind = new Map();
const builtStateIds = [];
const usedEntryIds = new Set();

for (const state of states) {
  let built;
  try {
    built = await withDescriptorGeometryRandom(state.id, () => buildGeometrySceneState(state.id));
  } catch (error) {
    console.log(`SKIP  ${state.id} — build failed: ${error.message}`);
    continue;
  }

  const actors = built.roots.flatMap(({ root }) => collectActors(root, THREE));
  const boxes = colliderBoxes(built);
  const authored = resolveSubjects(built, authoredBeats(built));
  const derived = derivedCameraBeats(built);
  if (authored.length === 0 && actors.length > 0) dark.push({ id: state.id, actors: actors.length });
  if (authored.length === 0 && derived.length === 0) continue;
  if (authored.length) withBeats += 1;

  const { findings: raw } = framingFindings({
    id: state.id, beats: [...authored, ...derived], actors, boxes,
  });
  builtStateIds.push(state.id);

  /* Split before excusing anything. The allowlist is for AUTHORED beats only:
   * a derived camera is as often the harness's stand-in at the origin as it
   * is the scene's, it can never fail a build, and so it has nothing to be
   * excused from. Letting it be allowlisted would put entries in the file that
   * the ratchet could never usefully call stale. */
  const derivedIds = new Set(derived.map((beat) => beat.id));
  const rawDerived = raw.filter((item) => derivedIds.has(item.beat));
  const { kept, suppressed, used } = applyFramingAllowlist(
    raw.filter((item) => !derivedIds.has(item.beat)),
    allowlist.entries,
    state.id,
  );
  for (const id of used) usedEntryIds.add(id);
  suppressedCount += suppressed.length;

  const findings = [...kept, ...rawDerived];
  for (const item of findings) {
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
    if (derivedIds.has(item.beat)) derivedFindings += 1; else authoredFindings += 1;
  }

  const label = `${state.id} — ${authored.length} beat${authored.length === 1 ? '' : 's'}`
    + `, ${derived.length} camera${derived.length === 1 ? '' : 's'}, ${actors.length} in the cast`;
  if (findings.length === 0) {
    console.log(`ok    ${label}`);
    continue;
  }
  console.log(`FIND  ${label}, ${findings.length} finding${findings.length === 1 ? '' : 's'}`);
  for (const item of findings) {
    const extra = Object.entries(item)
      .filter(([key]) => !['kind', 'beat', 'phase', 'camera'].includes(key))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    const tag = derivedIds.has(item.beat) ? ' [derived]' : '';
    console.log(`        ${item.kind}  ${item.beat}${tag} ${extra}`);
  }
}

console.log('');
console.log(`States publishing framing beats: ${withBeats} of ${states.length} built`);
if (dark.length) {
  console.log(`States with a cast and no published beats: ${dark.length}`);
  if (wantCoverage) {
    for (const { id, actors } of dark) console.log(`  ${id}: ${actors} in the cast`);
  } else {
    console.log('  (--coverage lists them)');
  }
}
/* A shot list whose key does not name a state is a shot list checking
 * nothing, and it looks exactly like a clean run. Say so. */
const strays = Object.keys(fileBeats).filter((key) => !matchedFileKeys.has(key));
if (strays.length) {
  console.log(`Beats in ${beatsPath} for states that were not built: ${strays.join(', ')}`);
}
if (byKind.size) {
  console.log('Findings by kind:');
  for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind}: ${count}`);
  }
}
if (suppressedCount) console.log(`Allowlisted: ${suppressedCount}`);

/* THE RATCHET. An entry that excused nothing this run is permission nobody
 * re-examined -- and per docs/ENGINE-TRAPS.md entry 10 it is as likely to mean
 * the gate stopped seeing the fault as that somebody fixed it, so go and
 * measure the thing it describes before deleting it. Judged only against
 * states this run actually built, so a filtered run does not condemn the rest
 * of the file on the strength of never having looked. */
const stale = unusedEntries(allowlist.entries, builtStateIds, usedEntryIds);
if (stale.length) {
  console.log('Stale allowlist entries (measure what they describe before deleting):');
  for (const id of stale) console.log(`  ${id}`);
}

console.log(authoredFindings === 0
  ? `Framing gate clean on published beats (${derivedFindings} on derived cameras).`
  : `${authoredFindings} framing findings (${derivedFindings} more on derived cameras).`);
if (authoredFindings > 0 || stale.length > 0) process.exitCode = 1;
