import * as THREE from 'three';

/**
 * Front & Center keeps its waiter movement on authored marks. This planner is
 * deliberately not a navmesh and not a second NPC controller: it only chooses
 * clear links between the room's surveyed service marks, then hands those
 * marks to the existing `Npc` route follower.
 */

export const SERVICE_STOP_DISTANCE = 0.52;
export const SERVICE_STALL_SECONDS = 2.5;

const SAMPLE_STEP = 0.08;
const DEFAULT_BODY_RADIUS = 0.30;
/* `Npc.update()` advances a patrol mark inside 40 cm. Route validation has to
 * include that rounded corner, not only two mathematically perfect legs. */
const FOLLOWER_WAYPOINT_RADIUS = 0.42;

function point(value) {
  return value?.isVector3
    ? value.clone()
    : new THREE.Vector3(Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0);
}

function planarDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function samePoint(a, b, tolerance = 0.05) {
  return planarDistance(a, b) <= tolerance;
}

function actorRadius(actor) {
  return actor?.serviceRadius ?? DEFAULT_BODY_RADIUS;
}

/**
 * Test one service-body footprint against the simplified collision layer.
 *
 * `Npc._navClear` correctly uses a 24 cm human-foot radius. A loaded service
 * tray is wider, so service planning uses the waiter's declared radius instead
 * of pretending the tray can pass wherever a shoe can.
 */
export function servicePointClear(npc, at, { people = [], includeMovingPeople = false } = {}) {
  const radius = actorRadius(npc);
  const feet = npc?.baseY ?? npc?.group?.position?.y ?? 0;
  for (const blocker of [...(npc?.colliders ?? []), ...(npc?.navBlockers ?? [])]) {
    if (!blocker) continue;
    if (feet > blocker.max.y || feet + 1.8 < blocker.min.y) continue;
    const closestX = Math.max(blocker.min.x, Math.min(blocker.max.x, at.x));
    const closestZ = Math.max(blocker.min.z, Math.min(blocker.max.z, at.z));
    const dx = at.x - closestX;
    const dz = at.z - closestZ;
    if (dx * dx + dz * dz < radius * radius) return false;
  }

  /* Moving staff negotiate at runtime through `serviceAdvanceAllowed`. Route
   * planning only treats people who will remain in their chairs or stations as
   * structural facts; otherwise one passing waiter could erase every route.
   * A stalled trip may opt into moving bodies for one re-plan, which lets it
   * go around a patroller who has itself stopped in the lane. */
  for (const other of people) {
    if (!other || other === npc || (!includeMovingPeople && other.job === 'patrol')) continue;
    const otherAt = other.group?.position;
    if (!otherAt) continue;
    const otherFeet = other.baseY ?? otherAt.y ?? 0;
    if (Math.abs(otherFeet - feet) > 1.0) continue;
    if (planarDistance(at, otherAt) < radius + actorRadius(other)) return false;
  }
  return true;
}

/** Sample a complete leg, including both endpoints, at tray-width precision. */
export function serviceLegClear(npc, from, to, options = {}) {
  const distance = planarDistance(from, to);
  const steps = Math.max(1, Math.ceil(distance / (options.step ?? SAMPLE_STEP)));
  const probe = new THREE.Vector3();
  for (let sample = 0; sample <= steps; sample++) {
    const mix = sample / steps;
    probe.set(
      from.x + (to.x - from.x) * mix,
      from.y + (to.y - from.y) * mix,
      from.z + (to.z - from.z) * mix,
    );
    if (!servicePointClear(npc, probe, options)) return false;
  }
  return true;
}

export function serviceRouteLength(route = []) {
  let distance = 0;
  for (let index = 1; index < route.length; index++) {
    distance += planarDistance(route[index - 1], route[index]);
  }
  return distance;
}

function uniqueNodes(nodes) {
  const result = [];
  for (const value of nodes) {
    const next = point(value);
    if (!result.some((existing) => samePoint(existing, next))) result.push(next);
  }
  return result;
}

function serviceTurnClear(npc, previous, current, next, options) {
  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 1e-5) return serviceLegClear(npc, previous, next, options);
  const before = Math.min(FOLLOWER_WAYPOINT_RADIUS, distance);
  const approach = new THREE.Vector3(
    current.x - (dx / distance) * before,
    current.y,
    current.z - (dz / distance) * before,
  );
  return serviceLegClear(npc, approach, next, options);
}

function routeDefinitions(authoredNetwork) {
  if (Array.isArray(authoredNetwork)) return [{ points: authoredNetwork, loop: false }];
  return authoredNetwork?.routes ?? [];
}

/**
 * Find the shortest clear chain through an authored service network.
 *
 * There is no free-space search here. If the room has not supplied a useful
 * mark, the planner fails and the caller keeps the queue entry pending. That
 * makes a bad route visible instead of silently moving story state forward.
 */
export function planAuthoredServiceRoute(npc, authoredNetwork, destination, options = {}) {
  const start = point(options.from ?? npc?.group?.position);
  const target = point(destination);
  const definitions = routeDefinitions(authoredNetwork);
  const authoredPoints = definitions.flatMap(({ points = [] }) => points);
  const nodes = uniqueNodes([start, ...authoredPoints, target]);
  const startAt = nodes.findIndex((node) => samePoint(node, start));
  const targetAt = nodes.findIndex((node) => samePoint(node, target));
  if (startAt < 0 || targetAt < 0) return null;

  const indexOf = (value) => nodes.findIndex((node) => samePoint(node, point(value)));
  const authoredIndexes = new Set(authoredPoints.map(indexOf).filter((index) => index >= 0));
  const links = Array.from({ length: nodes.length }, () => new Set());
  const link = (left, right) => {
    if (left < 0 || right < 0 || left === right) return;
    if (!serviceLegClear(npc, nodes[left], nodes[right], options)) return;
    links[left].add(right);
    links[right].add(left);
  };

  /* The authored rounds are the graph. Crossing the room merely because two
   * far-away marks happen to see each other is precisely the diagonal path
   * this planner exists to prevent. */
  for (const { points = [], loop = false } of definitions) {
    const indexes = points.map(indexOf).filter((index) => index >= 0);
    for (let index = 1; index < indexes.length; index++) link(indexes[index - 1], indexes[index]);
    if (loop && indexes.length > 2) link(indexes.at(-1), indexes[0]);
  }

  /* A dispatch begins wherever the patrol happens to be, and its table mark
   * is dynamic. Those two endpoints may join any clear authored mark; the
   * authored marks themselves retain only their surveyed links. */
  if (!authoredIndexes.has(startAt)) {
    for (const index of authoredIndexes) link(startAt, index);
  }
  if (!authoredIndexes.has(targetAt)) {
    for (const index of authoredIndexes) link(targetAt, index);
  }
  link(startAt, targetAt);

  /* Dijkstra state includes the previous mark because the shared follower
   * rounds corners. An edge can be clear while the prev/current/next shortcut
   * clips a chair; that was the featured waiter's intermittent failure. */
  const stateKey = (previous, current) => `${previous}:${current}`;
  const initialKey = stateKey(-1, startAt);
  const distance = new Map([[initialKey, 0]]);
  const states = new Map([[initialKey, { previous: -1, current: startAt }]]);
  const parent = new Map();
  const visited = new Set();
  let finished = null;

  while (true) {
    let currentKey = null;
    for (const [key, value] of distance) {
      if (visited.has(key)) continue;
      if (currentKey === null || value < distance.get(currentKey)) currentKey = key;
    }
    if (currentKey === null) break;
    const state = states.get(currentKey);
    if (state.current === targetAt) {
      finished = currentKey;
      break;
    }
    visited.add(currentKey);

    for (const next of links[state.current]) {
      if (next === state.previous) continue;
      if (state.previous >= 0 && !serviceTurnClear(
        npc,
        nodes[state.previous],
        nodes[state.current],
        nodes[next],
        options,
      )) continue;
      const nextKey = stateKey(state.current, next);
      const candidate = distance.get(currentKey) + planarDistance(nodes[state.current], nodes[next]);
      if (candidate >= (distance.get(nextKey) ?? Infinity)) continue;
      distance.set(nextKey, candidate);
      states.set(nextKey, { previous: state.current, current: next });
      parent.set(nextKey, currentKey);
    }
  }

  if (!finished) return null;
  const route = [];
  for (let key = finished; key; key = parent.get(key)) {
    route.push(nodes[states.get(key).current].clone());
  }
  route.reverse();
  return route[0] && samePoint(route[0], start) ? route : null;
}

/** Find the cheapest visible re-entry point on a waiter's saved patrol. */
export function planServiceReturn(npc, authoredNetwork, homeRoute, options = {}) {
  let best = null;
  for (let joinAt = 0; joinAt < (homeRoute?.length ?? 0); joinAt++) {
    const route = planAuthoredServiceRoute(npc, authoredNetwork, homeRoute[joinAt], options);
    if (!route) continue;
    const length = serviceRouteLength(route);
    if (!best || length < best.length) {
      best = { route, joinAt, target: point(homeRoute[joinAt]), length };
    }
  }
  return best;
}
