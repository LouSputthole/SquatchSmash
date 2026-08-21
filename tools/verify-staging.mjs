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
if (fs.existsSync(ALLOWLIST_DIR)) {
  for (const file of fs.readdirSync(ALLOWLIST_DIR).filter((n) => n.endsWith('.json'))) {
    const scene = file.replace(/\.json$/, '');
    const parsed = JSON.parse(fs.readFileSync(path.join(ALLOWLIST_DIR, file), 'utf8'));
    const { entries, issues } = validateStagingAllowlist(parsed, { scene });
    if (issues.length) {
      console.error(`staging allowlist ${file} is not usable:`);
      for (const issue of issues) console.error(`  ${issue}`);
      process.exit(1);
    }
    allowlists.set(scene, entries);
  }
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
function resolveSeats(roots, actors) {
  const wanted = new Set(actors.map((actor) => actor.actor?.seat).filter(Boolean));
  const seats = {};
  for (const name of wanted) {
    for (const { root } of roots) {
      const object = root.getObjectByName?.(name);
      if (!object) continue;
      const box = worldBox(object);
      if (box) seats[name] = box;
      break;
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
      min: [record.min.x, record.min.y, record.min.z],
      max: [record.max.x, record.max.y, record.max.z],
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

  const { findings: raw } = stagingFindings({
    id: state.id,
    actors,
    boxes: colliderBoxes(built),
    seats: resolveSeats(built.roots, actors),
    player: playerStance(built),
  });

  const entries = allowlists.get(state.scene) ?? [];
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
    console.log(`        ${item.kind}  ${item.id} (${item.role}/${item.posture}) ${extra}`);
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
