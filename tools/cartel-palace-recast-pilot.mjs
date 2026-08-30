#!/usr/bin/env node
/**
 * Development-only Cartel Palace navigation comparison.
 *
 * This does not wire Recast into the game. It starts the real Palace scene,
 * opens only the doors required by the tested route, measures the current
 * AABB/detour movement against the live collider set, then feeds that same
 * collider set to recast-navigation and measures paths to the destinations
 * the existing AI already chose.
 *
 *   node tools/cartel-palace-recast-pilot.mjs
 *   node tools/cartel-palace-recast-pilot.mjs --json
 *
 * recast-navigation is deliberately a development dependency. GitHub Pages
 * still serves the dependency-free import-map game and never loads this file.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { closeEvidenceLifecycle, listenEvidenceServer } from './evidence-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5291;
const JSON_ONLY = process.argv.includes('--json');
const WRITE_ASSET = process.argv.includes('--write-asset');
const NAVMESH_ASSET = path.join(ROOT, 'assets/navigation/cartel-palace-navmesh.bin');
const NODE = process.version;
const DT = 1 / 60;
const AGENT_RADIUS = 0.31;
const AGENT_HEIGHT = 1.78;
const ARRIVAL_RADIUS = 0.42;
const SPEED = 2.2;
const MAX_SECONDS = 45;

const SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'estate-wide-alarm',
    description: 'A distant gate guard responds to a shared contact inside the 46 m alarm-call radius.',
    entryId: 'gate-one',
    start: [9.2, 0, 54],
    goal: [4, 0, 15],
  }),
  Object.freeze({
    id: 'service-wing-doorway',
    description: 'The service-hall guard crosses the service-wing doorway.',
    entryId: 'service-hall',
    start: [14.4, 0, -1.5],
    goal: [-6.4, 0, -29],
  }),
  Object.freeze({
    id: 'authored-cover-post',
    description: 'The fountain guard reaches the existing service-door cover post.',
    entryId: 'fountain',
    start: [5.5, 0, 34],
    goal: [11.6, 0, 9.8],
  }),
  Object.freeze({
    id: 'stale-contact-return',
    description: 'A service-hall guard returns from stale gallery contact to his authored post.',
    entryId: 'service-hall',
    start: [-6.4, 0, -29],
    goal: [14.4, 0, -1.5],
  }),
]);

const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
});

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      let relative = decodeURIComponent(url.pathname);
      if (relative.endsWith('/')) relative += 'index.html';
      const absolute = path.join(ROOT, path.normalize(relative));
      if (!absolute.startsWith(ROOT)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const stat = await fsp.stat(absolute).catch(() => null);
      if (!stat?.isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
      }
      response.writeHead(200, {
        'content-type': TYPES[path.extname(absolute).toLowerCase()] || 'application/octet-stream',
        'content-length': stat.size,
        'cache-control': 'no-store',
      });
      fs.createReadStream(absolute).pipe(response);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain' }).end(String(error));
    }
  });
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function pathLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

function pathTurns(points) {
  let reversals = 0;
  let sharpTurns = 0;
  for (let index = 2; index < points.length; index++) {
    const a = points[index - 2];
    const b = points[index - 1];
    const c = points[index];
    const ab = [b[0] - a[0], b[2] - a[2]];
    const bc = [c[0] - b[0], c[2] - b[2]];
    const al = Math.hypot(...ab);
    const bl = Math.hypot(...bc);
    if (al <= 1e-6 || bl <= 1e-6) continue;
    const dot = (ab[0] * bc[0] + ab[1] * bc[1]) / (al * bl);
    if (dot < -0.5) reversals++;
    else if (dot < 0) sharpTurns++;
  }
  return { reversals, sharpTurns };
}

function addVertex(positions, x, y, z) {
  positions.push(x, y, z);
  return positions.length / 3 - 1;
}

function addBox(positions, indices, box) {
  const [minX, minY, minZ] = box.min;
  const [maxX, maxY, maxZ] = box.max;
  const base = positions.length / 3;
  for (const [x, y, z] of [
    [minX, minY, minZ], [maxX, minY, minZ],
    [maxX, minY, maxZ], [minX, minY, maxZ],
    [minX, maxY, minZ], [maxX, maxY, minZ],
    [maxX, maxY, maxZ], [minX, maxY, maxZ],
  ]) addVertex(positions, x, y, z);
  /* Counter-clockwise from outside. The upward top matters to Recast; the
   * side faces make the solid occupy the heightfield above the ground span. */
  indices.push(
    base + 0, base + 2, base + 1, base + 0, base + 3, base + 2,
    base + 4, base + 5, base + 6, base + 4, base + 6, base + 7,
    base + 0, base + 1, base + 5, base + 0, base + 5, base + 4,
    base + 1, base + 2, base + 6, base + 1, base + 6, base + 5,
    base + 2, base + 3, base + 7, base + 2, base + 7, base + 6,
    base + 3, base + 0, base + 4, base + 3, base + 4, base + 7,
  );
}

/** Make the same walkable ground and live Box3 obstacles the scene uses. */
function collisionMesh(colliders) {
  const positions = [];
  const indices = [];
  const floor = [
    addVertex(positions, -23, 0, -54),
    addVertex(positions, 23, 0, -54),
    addVertex(positions, 23, 0, 82),
    addVertex(positions, -23, 0, 82),
  ];
  indices.push(floor[0], floor[2], floor[1], floor[0], floor[3], floor[2]);
  for (const collider of colliders) {
    if (collider.max[1] <= 0.04 || collider.min[1] >= AGENT_HEIGHT + 0.3) continue;
    addBox(positions, indices, collider);
  }
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
  };
}

function packageFootprint() {
  const roots = [
    'node_modules/recast-navigation',
    'node_modules/@recast-navigation/core',
    'node_modules/@recast-navigation/generators',
    'node_modules/@recast-navigation/wasm',
  ].map((relative) => path.join(ROOT, relative));
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(absolute);
    }
  };
  for (const root of roots) visit(root);
  const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const runtimeFiles = files.filter((file) => /\.(?:m?js|wasm)$/.test(file));
  const runtimeBytes = runtimeFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const gzipBytes = runtimeFiles.reduce((sum, file) => (
    sum + gzipSync(fs.readFileSync(file), { level: 9 }).length
  ), 0);
  return { files: files.length, bytes, runtimeBytes, gzipBytes };
}

function pointInsideExpandedBox(point, box, radius = AGENT_RADIUS) {
  return point[0] > box.min[0] - radius && point[0] < box.max[0] + radius
    && point[2] > box.min[2] - radius && point[2] < box.max[2] + radius
    && box.max[1] > 0.04 && box.min[1] < AGENT_HEIGHT;
}

function segmentSamples(pathPoints, spacing = 0.08) {
  const samples = [];
  for (let index = 1; index < pathPoints.length; index++) {
    const from = pathPoints[index - 1];
    const to = pathPoints[index];
    const length = distance(from, to);
    const count = Math.max(1, Math.ceil(length / spacing));
    for (let step = 0; step <= count; step++) {
      const t = step / count;
      samples.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ]);
    }
  }
  return samples;
}

async function readLivePalace(page) {
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    problems.push(`network: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.goto(`http://127.0.0.1:${PORT}/cartel-palace.html?preview=1&checkpoint=approach`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => window.CARTEL_PALACE?.phase === 'menu', null, {
    timeout: 180000,
  });
  const evidence = await page.evaluate(async ({ scenarios, dt, speed, arrivalRadius, maxSeconds }) => {
    const runtime = window.CARTEL_PALACE;
    await runtime.palaceNavigationReady;
    const { security, cast, palace } = runtime;
    palace.doors.openServiceGate();
    palace.doors.openEstateDoor();
    palace.root.updateMatrixWorld(true);
    security.space.boxes = security.colliders;
    security.fireControl.colliders = security.colliders;

    const colliderData = security.colliders.map((box) => ({
      name: box.name || box.combatId || '',
      min: box.min.toArray(),
      max: box.max.toArray(),
    }));
    const allEntries = cast.all;

    const runOne = (spec, useNavigation = false) => {
      const entry = allEntries.find((candidate) => candidate.id === spec.entryId);
      if (!entry) throw new Error(`Missing Palace cast entry ${spec.entryId}`);
      const internal = security.runtime.get(entry.id);
      const saved = {
        position: entry.root.position.clone(),
        rotation: entry.root.rotation.y,
        blocked: entry.blocked,
        detourTime: internal.detourTime,
        detourSide: internal.detourSide,
        stats: security.stats.blockedMoves,
      };
      entry.root.position.fromArray(spec.start);
      internal.detourTime = 0;
      internal.detourSide = String(entry.id).split('')
        .reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 ? 1 : -1;
      security.stats.blockedMoves = 0;
      runtime.palaceNavigation.forget(entry.id);
      let path = [entry.root.position.toArray()];
      let distanceTravelled = 0;
      let blockedFrames = 0;
      let reversals = 0;
      let detourFlips = 0;
      let lastSide = internal.detourSide;
      let lastMove = null;
      const goal = entry.root.position.clone().fromArray(spec.goal);
      const maxFrames = Math.round(maxSeconds / dt);
      let frames = 0;
      const started = performance.now();
      for (; frames < maxFrames; frames++) {
        const toward = goal.clone().sub(entry.root.position).setY(0);
        const remaining = toward.length();
        if (remaining <= arrivalRadius) break;
        toward.multiplyScalar(Math.min(remaining, dt * speed) / remaining);
        const before = entry.root.position.clone();
        const result = useNavigation
          ? security._moveToward(entry, goal, dt * speed, internal, dt).result
          : security._moveWithDetour(entry, toward, internal, dt);
        const move = entry.root.position.clone().sub(before).setY(0);
        const moved = move.length();
        distanceTravelled += moved;
        if (result?.blocked || moved < toward.length() * 0.2) blockedFrames++;
        if (lastMove && lastMove.lengthSq() > 1e-8 && move.lengthSq() > 1e-8
          && lastMove.dot(move) / (lastMove.length() * move.length()) < -0.5) reversals++;
        if (move.lengthSq() > 1e-8) lastMove = move.clone();
        if (internal.detourSide !== lastSide) detourFlips++;
        lastSide = internal.detourSide;
        if (frames % 10 === 0) path.push(entry.root.position.toArray());
      }
      path.push(entry.root.position.toArray());
      const cpuMs = performance.now() - started;
      const remaining = entry.root.position.distanceTo(goal);
      const result = {
        id: spec.id,
        success: remaining <= arrivalRadius,
        seconds: frames * dt,
        cpuMs,
        remaining,
        distance: distanceTravelled,
        blockedMoves: security.stats.blockedMoves,
        blockedFrames,
        reversals,
        detourFlips,
        path,
      };
      entry.root.position.copy(saved.position);
      entry.root.rotation.y = saved.rotation;
      entry.blocked = saved.blocked;
      internal.detourTime = saved.detourTime;
      internal.detourSide = saved.detourSide;
      runtime.palaceNavigation.forget(entry.id);
      security.stats.blockedMoves = saved.stats;
      return result;
    };

    const current = scenarios.map((spec) => runOne(spec, false));
    const integrated = scenarios.map((spec) => runOne(spec, true));

    /* Two guards share the same alarm destination. The existing separation
     * pass remains in both candidates; the pilot changes only path selection. */
    const runMulti = (useNavigation) => {
      const multiEntries = ['gate-one', 'guardhouse'].map((id) => (
        allEntries.find((entry) => entry.id === id)
      ));
      const multiSaved = multiEntries.map((entry) => ({
        entry,
        position: entry.root.position.clone(),
        rotation: entry.root.rotation.y,
        blocked: entry.blocked,
        internal: security.runtime.get(entry.id),
        detourTime: security.runtime.get(entry.id).detourTime,
        detourSide: security.runtime.get(entry.id).detourSide,
      }));
      multiEntries[0].root.position.set(9.2, 0, 54);
      multiEntries[1].root.position.set(9.1, 0, 44);
      for (const saved of multiSaved) {
        saved.internal.detourTime = 0;
        runtime.palaceNavigation.forget(saved.entry.id);
      }
      const goal = multiEntries[0].root.position.clone().set(12.5, 0, 4);
      let minSeparation = Infinity;
      let maxSeparation = 0;
      let blockedFrames = 0;
      let reversals = 0;
      const lastMoves = [null, null];
      let frames = 0;
      const started = performance.now();
      for (; frames < Math.round(maxSeconds / dt); frames++) {
        let done = true;
        for (let index = 0; index < multiEntries.length; index++) {
          const entry = multiEntries[index];
          const remaining = goal.distanceTo(entry.root.position);
          if (remaining <= arrivalRadius) continue;
          done = false;
          const wanted = goal.clone().sub(entry.root.position).setY(0)
            .normalize().multiplyScalar(dt * speed);
          const before = entry.root.position.clone();
          if (useNavigation) {
            security._moveToward(entry, goal, dt * speed, multiSaved[index].internal, dt);
          } else {
            security._moveWithDetour(entry, wanted, multiSaved[index].internal, dt);
          }
          const move = entry.root.position.clone().sub(before).setY(0);
          if (move.length() < wanted.length() * 0.2) blockedFrames++;
          const prior = lastMoves[index];
          if (prior && prior.lengthSq() > 1e-8 && move.lengthSq() > 1e-8
            && prior.dot(move) / (prior.length() * move.length()) < -0.5) reversals++;
          if (move.lengthSq() > 1e-8) lastMoves[index] = move.clone();
        }
        security.space.separate(multiEntries[0], multiEntries, {
          boxes: security.colliders, id: multiEntries[0].id,
        });
        security.space.separate(multiEntries[1], multiEntries, {
          boxes: security.colliders, id: multiEntries[1].id,
        });
        const separation = multiEntries[0].root.position.distanceTo(multiEntries[1].root.position);
        minSeparation = Math.min(minSeparation, separation);
        maxSeparation = Math.max(maxSeparation, separation);
        if (done) break;
      }
      const result = {
        success: multiEntries.every((entry) => goal.distanceTo(entry.root.position) <= arrivalRadius),
        seconds: frames * dt,
        cpuMs: performance.now() - started,
        minSeparation,
        maxSeparation,
        blockedFrames,
        reversals,
        end: multiEntries.map((entry) => entry.root.position.toArray()),
      };
      for (const saved of multiSaved) {
        saved.entry.root.position.copy(saved.position);
        saved.entry.root.rotation.y = saved.rotation;
        saved.entry.blocked = saved.blocked;
        saved.internal.detourTime = saved.detourTime;
        saved.internal.detourSide = saved.detourSide;
        runtime.palaceNavigation.forget(saved.entry.id);
      }
      return result;
    };
    const multiCurrent = runMulti(false);
    const multiIntegrated = runMulti(true);
    return {
      colliders: colliderData,
      current,
      integrated,
      multiCurrent,
      multiIntegrated,
      body: {
        radius: security.space.radius,
        height: security.space.height,
        separation: security.space.separation,
      },
      renderer: {
        calls: runtime.renderer.info.render.calls,
        geometries: runtime.renderer.info.memory.geometries,
        textures: runtime.renderer.info.memory.textures,
      },
      navigationRuntime: runtime.palaceNavigation.report(),
      navigationResources: performance.getEntriesByType('resource')
        .filter((entry) => /recast-navigation|cartel-palace-navmesh/.test(entry.name))
        .map((entry) => ({
          name: new URL(entry.name).pathname,
          transferSize: entry.transferSize,
          decodedBodySize: entry.decodedBodySize,
          duration: entry.duration,
        })),
    };
  }, {
    scenarios: SCENARIOS,
    dt: DT,
    speed: SPEED,
    arrivalRadius: ARRIVAL_RADIUS,
    maxSeconds: MAX_SECONDS,
  });
  return { ...evidence, problems };
}

async function runRecast(colliders) {
  let recast;
  let generators;
  try {
    [recast, generators] = await Promise.all([
      import('recast-navigation'),
      import('recast-navigation/generators'),
    ]);
  } catch (error) {
    throw new Error(
      'The Cartel Palace Recast pilot requires the development dependency '
      + `recast-navigation: ${error.message}`,
    );
  }
  const heapBefore = process.memoryUsage();
  const initStart = performance.now();
  await recast.init();
  const initMs = performance.now() - initStart;
  const heapAfterInit = process.memoryUsage();
  const mesh = collisionMesh(colliders);
  const config = {
    cs: 0.18,
    ch: 0.1,
    walkableSlopeAngle: 50,
    walkableHeight: Math.ceil(AGENT_HEIGHT / 0.1),
    walkableClimb: Math.ceil(0.35 / 0.1),
    walkableRadius: Math.ceil(AGENT_RADIUS / 0.18),
    maxEdgeLen: Math.ceil(12 / 0.18),
    maxSimplificationError: 1.15,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxVertsPerPoly: 6,
    detailSampleDist: 6,
    detailSampleMaxError: 1,
    buildBvTree: true,
  };
  const buildStart = performance.now();
  const generated = generators.generateSoloNavMesh(mesh.positions, mesh.indices, config);
  const buildMs = performance.now() - buildStart;
  if (!generated.success) throw new Error(`Recast navmesh build failed: ${generated.error}`);
  const heapAfterBuild = process.memoryUsage();
  const query = new recast.NavMeshQuery(generated.navMesh, { maxNodes: 4096 });
  query.defaultQueryHalfExtents = { x: 2.5, y: 3, z: 2.5 };

  const results = SCENARIOS.map((spec) => {
    const start = { x: spec.start[0], y: spec.start[1], z: spec.start[2] };
    const goal = { x: spec.goal[0], y: spec.goal[1], z: spec.goal[2] };
    const began = performance.now();
    const result = query.computePath(start, goal, {
      halfExtents: query.defaultQueryHalfExtents,
      maxPathPolys: 1024,
      maxStraightPathPoints: 1024,
    });
    const queryMs = performance.now() - began;
    const points = result.path.map((point) => [point.x, point.y, point.z]);
    const samples = segmentSamples(points);
    const colliderContacts = [];
    for (const collider of colliders) {
      if (samples.some((sample) => pointInsideExpandedBox(sample, collider))) {
        colliderContacts.push(collider.name);
      }
    }
    const length = pathLength(points);
    return {
      id: spec.id,
      success: result.success && points.length >= 2
        && distance(points.at(-1), spec.goal) <= 2.5,
      error: result.error ?? null,
      queryMs,
      points,
      pathLength: length,
      seconds: length / SPEED,
      remaining: points.length ? distance(points.at(-1), spec.goal) : Infinity,
      colliderContacts,
      ...pathTurns(points),
    };
  });

  /* Path queries are the per-decision cost. Following them is ordinary vector
   * math; time an intentionally excessive 20,000-frame loop so the result is
   * above timer noise and divide back to one frame. */
  const followStart = performance.now();
  let checksum = 0;
  for (let frame = 0; frame < 20000; frame++) {
    for (const result of results) {
      for (let index = 1; index < result.points.length; index++) {
        const from = result.points[index - 1];
        const to = result.points[index];
        checksum += Math.hypot(to[0] - from[0], to[2] - from[2]) * DT;
      }
    }
  }
  const followMsPerFrame = (performance.now() - followStart) / 20000;

  let asset = null;
  if (WRITE_ASSET) {
    const navMeshBytes = recast.exportNavMesh(generated.navMesh);
    await fsp.mkdir(path.dirname(NAVMESH_ASSET), { recursive: true });
    await fsp.writeFile(NAVMESH_ASSET, navMeshBytes);
    asset = {
      path: path.relative(ROOT, NAVMESH_ASSET).replaceAll('\\', '/'),
      bytes: navMeshBytes.byteLength,
      sha256: createHash('sha256').update(navMeshBytes).digest('hex'),
    };
  }
  query.destroy();
  generated.navMesh.destroy();
  return {
    version: '0.43.1',
    config,
    mesh: {
      vertices: mesh.positions.length / 3,
      triangles: mesh.indices.length / 3,
      colliders: colliders.length,
    },
    initMs,
    buildMs,
    followMsPerFrame,
    checksum,
    memory: {
      rssInitMb: (heapAfterInit.rss - heapBefore.rss) / 1048576,
      rssBuildMb: (heapAfterBuild.rss - heapAfterInit.rss) / 1048576,
      heapInitMb: (heapAfterInit.heapUsed - heapBefore.heapUsed) / 1048576,
      heapBuildMb: (heapAfterBuild.heapUsed - heapAfterInit.heapUsed) / 1048576,
    },
    footprint: packageFootprint(),
    asset,
    results,
  };
}

function summarize(live, pilot) {
  const currentById = new Map(live.current.map((entry) => [entry.id, entry]));
  const integratedById = new Map(live.integrated.map((entry) => [entry.id, entry]));
  const comparisons = pilot.results.map((candidate) => {
    const current = currentById.get(candidate.id);
    const integrated = integratedById.get(candidate.id);
    return {
      id: candidate.id,
      current: {
        success: current.success,
        seconds: round(current.seconds),
        cpuMs: round(current.cpuMs),
        distance: round(current.distance),
        blockedMoves: current.blockedMoves,
        blockedFrames: current.blockedFrames,
        reversals: current.reversals,
        detourFlips: current.detourFlips,
      },
      integrated: {
        success: integrated.success,
        seconds: round(integrated.seconds),
        cpuMs: round(integrated.cpuMs),
        distance: round(integrated.distance),
        blockedMoves: integrated.blockedMoves,
        blockedFrames: integrated.blockedFrames,
        reversals: integrated.reversals,
        detourFlips: integrated.detourFlips,
      },
      recast: {
        success: candidate.success,
        seconds: round(candidate.seconds),
        queryMs: round(candidate.queryMs),
        distance: round(candidate.pathLength),
        points: candidate.points.length,
        colliderContacts: candidate.colliderContacts,
        reversals: candidate.reversals,
        sharpTurns: candidate.sharpTurns,
      },
    };
  });
  const allCurrentPass = comparisons.every((entry) => entry.current.success);
  const allIntegratedPass = comparisons.every((entry) => entry.integrated.success);
  const allRecastPass = comparisons.every((entry) => (
    entry.recast.success && entry.recast.colliderContacts.length === 0
  ));
  const currentBlocked = comparisons.reduce((sum, entry) => (
    sum + entry.current.blockedFrames
  ), 0);
  const recastClearlyBetter = allRecastPass && allIntegratedPass
    && (!allCurrentPass || currentBlocked >= 30);
  return {
    generatedAt: new Date().toISOString(),
    node: NODE,
    decision: recastClearlyBetter ? 'candidate-for-live-integration' : 'reject-live-integration',
    reason: recastClearlyBetter
      ? 'The navmesh solved a measured reachability or repeated-blocking defect.'
      : 'The current Palace movement reached every authored destination; the navmesh adds runtime cost without a clear gameplay win.',
    liveProblems: live.problems,
    body: live.body,
    renderer: live.renderer,
    navigationRuntime: live.navigationRuntime,
    navigationResources: live.navigationResources,
    currentMultipleGuards: {
      success: live.multiCurrent.success,
      seconds: round(live.multiCurrent.seconds),
      cpuMs: round(live.multiCurrent.cpuMs),
      minSeparation: round(live.multiCurrent.minSeparation),
      blockedFrames: live.multiCurrent.blockedFrames,
      reversals: live.multiCurrent.reversals,
    },
    integratedMultipleGuards: {
      success: live.multiIntegrated.success,
      seconds: round(live.multiIntegrated.seconds),
      cpuMs: round(live.multiIntegrated.cpuMs),
      minSeparation: round(live.multiIntegrated.minSeparation),
      blockedFrames: live.multiIntegrated.blockedFrames,
      reversals: live.multiIntegrated.reversals,
    },
    recast: {
      version: pilot.version,
      initMs: round(pilot.initMs),
      buildMs: round(pilot.buildMs),
      followMsPerFrame: round(pilot.followMsPerFrame, 6),
      memory: Object.fromEntries(Object.entries(pilot.memory).map(([key, value]) => [key, round(value)])),
      footprint: pilot.footprint,
      asset: pilot.asset,
      mesh: pilot.mesh,
      config: pilot.config,
    },
    comparisons,
  };
}

function printReport(report) {
  console.log('Cartel Palace Recast pilot');
  console.log(`  decision  ${report.decision}`);
  console.log(`  reason    ${report.reason}`);
  for (const comparison of report.comparisons) {
    const current = comparison.current;
    const integrated = comparison.integrated;
    const recast = comparison.recast;
    console.log(
      `  ${comparison.id.padEnd(24)} current ${current.success ? 'ok' : 'FAIL'} `
      + `${current.seconds.toFixed(2)}s ${current.blockedFrames} blocked frames | `
      + `live-nav ${integrated.success ? 'ok' : 'FAIL'} ${integrated.seconds.toFixed(2)}s `
      + `${integrated.blockedFrames} blocked | `
      + `recast ${recast.success ? 'ok' : 'FAIL'} ${recast.seconds.toFixed(2)}s `
      + `${recast.points} points ${recast.queryMs.toFixed(3)}ms query`,
    );
  }
  console.log(
    `  multiple guards            ${report.currentMultipleGuards.success ? 'ok' : 'FAIL'} `
    + `${report.currentMultipleGuards.seconds.toFixed(2)}s, `
    + `${report.currentMultipleGuards.minSeparation.toFixed(2)}m minimum separation`,
  );
  console.log(
    `  multiple guards + nav      ${report.integratedMultipleGuards.success ? 'ok' : 'FAIL'} `
    + `${report.integratedMultipleGuards.seconds.toFixed(2)}s, `
    + `${report.integratedMultipleGuards.minSeparation.toFixed(2)}m minimum separation`,
  );
  console.log(
    `  Recast init/build          ${report.recast.initMs.toFixed(1)}ms / `
    + `${report.recast.buildMs.toFixed(1)}ms`,
  );
  console.log(
    `  package runtime            ${(report.recast.footprint.runtimeBytes / 1048576).toFixed(2)} MiB `
    + `(${(report.recast.footprint.gzipBytes / 1024).toFixed(1)} KiB gzip sum)`,
  );
  if (report.liveProblems.length) {
    console.log(`  live errors                ${report.liveProblems.join(' | ')}`);
  }
}

let browser = null;
let server = null;
try {
  const [{ chromium }] = await Promise.all([import('playwright')]);
  server = createServer();
  await listenEvidenceServer(server, PORT);
  browser = await chromium.launch({
    /* Match the authoritative Palace verifier. Direct SwiftShader can
     * invalidate the first shadow/depth programs even when the scene is
     * healthy; ANGLE over SwiftShader is the stable software path. */
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const live = await readLivePalace(page);
  const pilot = await runRecast(live.colliders);
  const report = summarize(live, pilot);
  if (JSON_ONLY) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  process.exitCode = report.liveProblems.length > 0
    || report.comparisons.some((entry) => !entry.integrated.success)
    || !report.integratedMultipleGuards.success ? 1 : 0;
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await closeEvidenceLifecycle({ browser, server });
}
