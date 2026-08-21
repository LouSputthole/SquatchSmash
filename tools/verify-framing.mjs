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
 */
import fs from 'node:fs';
import process from 'node:process';
import { ensureDomShim, ensureThreeShim } from './three-shim.mjs';
import { normalizeSceneColliders, withDescriptorGeometryRandom } from './verify-geometry-worker.mjs';
import { buildGeometrySceneState, GEOMETRY_SCENE_STATES } from './geometry-scenes.mjs';
import { collectActors } from '../src/core/staging.js';
import { framingFindings } from './framing-gate.mjs';

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
  .filter((arg, index) => !arg.startsWith('--') && index !== beatsFlag + 1);

/* A missing or malformed beats file THROWS rather than quietly checking
 * nothing. Every other silent pass in this project's history started as a
 * convenience exactly this shape. */
const fileBeats = beatsPath ? JSON.parse(fs.readFileSync(beatsPath, 'utf8')) : {};
if (beatsPath && (typeof fileBeats !== 'object' || Array.isArray(fileBeats))) {
  throw new TypeError(`${beatsPath} must be an object keyed by scene state id`);
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
 */
function colliderBoxes(built) {
  return normalizeSceneColliders(built)
    .filter((record) => !record.invalid && record.min && record.max)
    .map((record) => ({
      name: record.id ?? null,
      min: [record.min.x, record.min.y, record.min.z],
      max: [record.max.x, record.max.y, record.max.z],
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
const dark = [];
const byKind = new Map();

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

  const { findings } = framingFindings({
    id: state.id, beats: [...authored, ...derived], actors, boxes,
  });

  const derivedIds = new Set(derived.map((beat) => beat.id));
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
console.log(authoredFindings === 0
  ? `Framing gate clean on published beats (${derivedFindings} on derived cameras).`
  : `${authoredFindings} framing findings (${derivedFindings} more on derived cameras).`);
