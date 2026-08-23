/**
 * Run the staging gate over the registered geometry scene states.
 *
 *   node tools/verify-staging.mjs                 # every state with a cast
 *   node tools/verify-staging.mjs heist           # one scene
 *   node tools/verify-staging.mjs --coverage      # who is still unmarked
 *
 * This deliberately rides tools/geometry-scenes.mjs rather than booting pages
 * in a browser.  Those adapters already build ~80 real scene states headlessly
 * with real world matrices, which is most of the cost of asking any question
 * about a scene; the staging questions are just different arithmetic over the
 * same build.  A second, parallel way to build the same scenes is a second
 * thing to keep true.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { ensureDomShim, ensureThreeShim } from './three-shim.mjs';
import { normalizeSceneColliders, withDescriptorGeometryRandom } from './verify-geometry-worker.mjs';
import { buildGeometrySceneState, GEOMETRY_SCENE_STATES } from './geometry-scenes.mjs';
import { collectActors, readActor } from '../src/core/staging.js';
import { stagingFindings } from './staging-gate.mjs';
import {
  applyStagingAllowlist, unusedEntries, validateStagingAllowlist,
} from './staging-allowlist.mjs';

/**
 * Per-scene allowlists, keyed by scene, loaded once.
 *
 * Same instrument the geometry gate carries and deliberately the same shape:
 * one entry per finding per state, a reason somebody wrote, a line of source
 * to check it against, sorted, no wildcards. A file that does not validate
 * stops the run rather than half-applying -- an allowlist nobody can trust is
 * worse than none.
 */
const ALLOWLIST_DIR = path.join(ROOT, 'tools', 'staging-allowlists');
const allowlists = new Map();

/**
 * Hold every entry's citation to the file it actually cites.
 *
 * THE GEOMETRY GATE ALREADY DOES THIS, and it is the reason that gate can be
 * trusted: an entry whose cited line has moved is caught the moment the source
 * shifts. The siege's geometry allowlist was found this morning pointing at
 * SilentSquatch.js:899 for an anchor that had been on 902 for weeks -- 480
 * entries, all quietly wrong, and this check was the only thing that noticed.
 *
 * The pure validator cannot do it: it has no filesystem, deliberately. So it
 * lives here beside the reading, exactly as it does for geometry.
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

/**
 * Read one scene's allowlist, the first time that scene is run.
 *
 * LAZILY, and that matters. Reading every file up front means a half-written
 * allowlist for one scene fails the run of a completely different scene -- and
 * the message did not say which file it came from, so it read as "the mansion
 * is broken" when the mansion was fine. A gate that misreports WHICH thing is
 * broken is only marginally better than one that misses it.
 */
function allowlistFor(scene) {
  if (allowlists.has(scene)) return allowlists.get(scene);
  const file = path.join(ALLOWLIST_DIR, `${scene}.json`);
  if (!fs.existsSync(file)) {
    allowlists.set(scene, []);
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { entries, issues } = validateStagingAllowlist(parsed, { scene });
  issues.push(...citationIssues(entries));
  if (issues.length) {
    console.error(`staging allowlist ${scene}.json is not usable:`);
    for (const issue of issues) console.error(`  ${issue}`);
    process.exit(1);
  }
  allowlists.set(scene, entries);
  return entries;
}

/* The same two shims the geometry worker installs, for the same reason: half
 * these scenes paint a texture on a canvas while they build, and a scene that
 * cannot build is a scene this gate silently says nothing about. The seeded
 * random comes from the same place, so a forest built twice is the same
 * forest and a finding is reproducible. */
ensureThreeShim();
ensureDomShim();

const args = process.argv.slice(2);
const wantCoverage = args.includes('--coverage');
const filters = args.filter((arg) => !arg.startsWith('--'));

const THREE = await import('three');

function worldBox(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  return {
    name: object.name || null,
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

/**
 * Seats are resolved by the name an actor's marker asks for, not by sniffing
 * for chair-shaped things.  If a rig claims to be sitting on `van-bench-left`
 * and no such object exists, that is a finding (SEAT_MISSING) rather than a
 * silent pass -- a seat that was renamed out from under a marker is exactly
 * the kind of drift this is here to catch.
 */
function resolveSeats(roots, actors, boxes = []) {
  const wanted = new Set(actors.map((actor) => actor.seat ?? actor.actor?.seat).filter(Boolean));
  const seats = {};
  for (const name of wanted) {
    for (const { root } of roots) {
      const object = root.getObjectByName?.(name);
      if (!object) continue;
      const box = worldBox(object);
      if (box) seats[name] = box;
      break;
    }
    if (seats[name]) continue;
    /* Failing a named object, a collider assembly of that name.
     *
     * Furniture in this project is authored as a collider carrying an
     * assembly id -- `bing-booth:east:0` -- and often no Object3D of that
     * name at all, because the id exists to group the collider with its
     * meshes for the geometry gate. A sitter naming his booth had nothing to
     * resolve against until this looked here too.
     *
     * The box this yields is the whole booth, floor to the top of its back,
     * so SEAT_STANDING measured against it is weaker than against an
     * authored cushion mesh: a man standing ON the bench is still under the
     * seat back and goes unreported. Scenes that author a cushion get the
     * tight check, because the named-object branch above wins. */
    const assembly = boxes.find((box) => box.assembly === name);
    if (assembly) {
      seats[name] = {
        min: { x: assembly.min[0], y: assembly.min[1], z: assembly.min[2] },
        max: { x: assembly.max[0], y: assembly.max[1], z: assembly.max[2] },
      };
    }
  }
  return seats;
}

/**
 * Every solid in the scene, whatever shape it was authored as.
 *
 * THIS USED TO FILTER FOR `isBox3`, AND THAT MADE THE GATE LIE. Initiation
 * authors all two hundred and forty-nine of its cabin solids as upright
 * `{x, z, r}` cylinders, so a Box3 filter saw NONE of them -- and a gate that
 * can see no walls reports, cheerfully and in green, that nobody is facing
 * one. FACING_INTO_SOLID and ACTOR_INSIDE_SOLID were both silently dead in
 * every scene that builds its world out of cylinders.
 *
 * `normalizeSceneColliders` is the geometry worker's own reader and already
 * understands every collider shape this project authors, which is exactly why
 * it is borrowed rather than re-derived here. Found by the beat-framing gate,
 * which hit the same wall one file over.
 */
function colliderBoxes(built) {
  return normalizeSceneColliders(built)
    .filter((record) => !record.invalid && record.min && record.max)
    .map((record) => ({
      name: record.id ?? null,
      /* The authored group this solid belongs to, e.g. `bing-booth:east:0`.
       * `record.id` is synthesised from coordinates when the collider has no
       * name of its own, which is most of them, so the assembly is the only
       * stable handle an actor's `seat` marker can name. Every one of the
       * Bing's 147 collider records carries one. */
      assembly: record.assemblyId ?? null,
      min: [record.min.x, record.min.y, record.min.z],
      max: [record.max.x, record.max.y, record.max.z],
      /* The circle the scene actually wrote, when it wrote one, so the facing
       * ray can be tested against it rather than against the square the reader
       * builds round it. `normalizeSceneColliders` carries it alongside the
       * bounds for exactly this; the bounds stay the conservative reading and
       * are what the walk-into tests still use. */
      shape: record.shape ?? null,
    }));
}

/** The player's stance, when the adapter recorded one. */
function playerStance(built) {
  const spawn = built.metadata?.playerSpawn ?? built.metadata?.spawn ?? null;
  if (!spawn || !Number.isFinite(spawn.x) || !Number.isFinite(spawn.z)) return null;
  const yaw = Number.isFinite(spawn.yaw) ? spawn.yaw : Number.isFinite(spawn.heading) ? spawn.heading : null;
  if (yaw === null) return null;
  return { position: [spawn.x, spawn.y ?? 0, spawn.z], yaw };
}

const states = GEOMETRY_SCENE_STATES
  .filter((state) => filters.length === 0 || filters.some((f) => state.id.includes(f)));

let totalFindings = 0;
let withCast = 0;
const unmarked = [];
const byKind = new Map();
const usedEntryIds = new Set();
const statesByScene = new Map();
let totalSuppressed = 0;

for (const state of states) {
  let built;
  try {
    built = await withDescriptorGeometryRandom(state.id, () => buildGeometrySceneState(state.id));
  } catch (error) {
    console.log(`SKIP  ${state.id} — build failed: ${error.message}`);
    continue;
  }
  const actors = built.roots.flatMap(({ root }) => collectActors(root, THREE));

  let rigs = 0;
  for (const { root } of built.roots) {
    root.traverse((object) => {
      if (object.userData?.rig === 'person' && !readActor(object)) rigs += 1;
    });
  }
  if (rigs) unmarked.push({ id: state.id, rigs });

  if (actors.length === 0) continue;
  withCast += 1;

  const boxes = colliderBoxes(built);
  /* Does this scene author any collider heights at all? See the gate's
   * SIGHTLINES_NOT_EVIDENCE note. -0.5 to 4 is what the collider reader
   * invents for a footprint that carries no y. */
  const planOnlySolids = boxes.length > 0
    && boxes.every((box) => box.min[1] === -0.5 && box.max[1] === 4);
  const { findings: raw } = stagingFindings({
    id: state.id,
    actors,
    boxes,
    planOnlySolids,
    seats: resolveSeats(built.roots, actors, boxes),
    player: playerStance(built),
  });

  const entries = allowlistFor(state.scene);
  const { kept: findings, suppressed, used } = applyStagingAllowlist(raw, entries, state.state);
  for (const id of used) usedEntryIds.add(id);
  if (!statesByScene.has(state.scene)) statesByScene.set(state.scene, []);
  statesByScene.get(state.scene).push(state.state);
  totalSuppressed += suppressed.length;

  for (const item of findings) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
  totalFindings += findings.length;

  const label = `${state.id} — ${actors.length} actor${actors.length === 1 ? '' : 's'}`;
  if (findings.length === 0) {
    console.log(`ok    ${label}`);
    continue;
  }
  console.log(`FIND  ${label}, ${findings.length} finding${findings.length === 1 ? '' : 's'}`);
  for (const item of findings) {
    const extra = Object.entries(item)
      .filter(([key]) => !['kind', 'id', 'role', 'posture', 'position'].includes(key))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    /* Not every finding is about one person. A scene-level one carries no id,
     * and printing it as `null (null/null)` reads like a broken marker. */
    const who = item.id === null ? '(whole scene)' : `${item.id} (${item.role}/${item.posture})`;
    console.log(`        ${item.kind}  ${who} ${extra}`);
  }
}

console.log('');
console.log(`Staged states with a cast: ${withCast} of ${states.length} built`);
if (wantCoverage && unmarked.length) {
  console.log('Unmarked shared rigs (bodies no check can reach):');
  for (const { id, rigs } of unmarked) console.log(`  ${id}: ${rigs}`);
}
if (byKind.size) {
  console.log('Findings by kind:');
  for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind}: ${count}`);
  }
}
if (totalSuppressed) console.log(`Allowlisted: ${totalSuppressed}`);

/* THE RATCHET. An entry that excused nothing this run is permission nobody
 * re-examined: the defect it covered has been fixed and the entry has to go
 * with it. Only judged against states this run actually built. */
const stale = [];
for (const [scene, entries] of allowlists) {
  const states = statesByScene.get(scene) ?? [];
  if (states.length === 0) continue;
  stale.push(...unusedEntries(entries, states, usedEntryIds).map((id) => `${scene}: ${id}`));
}
if (stale.length) {
  console.log('Stale allowlist entries (the fault they excused is gone — delete them):');
  for (const id of stale) console.log(`  ${id}`);
}

console.log(totalFindings === 0 ? 'Staging gate clean.' : `${totalFindings} staging findings.`);
if (totalFindings > 0 || stale.length > 0) process.exitCode = 1;
