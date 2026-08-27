/**
 * Cabin logging-camp shooting range.
 *
 * This module owns presentation and headless range rules only. A scene supplies
 * its shared WeaponSystem with `hitTargets`, forwards `fire` events to
 * `handleWeaponEvent`, and forwards impacts to `handleImpact`. The interaction
 * descriptor deliberately calls back to the scene instead of starting a round
 * itself, so campaign/story authority never leaks into this builder.
 */
import * as THREE from 'three';

import { markSpatialPrimitive } from '../core/spatial-contract.js';
import { box, collider, cylinder, group, mat, yawToward } from '../world/build.js';
import { LANDMARK_VIEWPOINTS, RANGE_SITE, groundAt as cabinGroundAt } from './field.js';

export const RANGE_SHOT_LIMIT = 10;
export const RANGE_TIME_LIMIT_S = 45;
export const RANGE_HIT_KEY = 'cabinRangeHit';

const TARGET_SPECS = Object.freeze([
  Object.freeze({ id: 'near-left', label: 'NEAR LEFT', x: -46.5, z: -23.25, fallAfter: 3 }),
  Object.freeze({ id: 'near-right', label: 'NEAR RIGHT', x: -46.5, z: -16.75, fallAfter: 3 }),
  Object.freeze({ id: 'middle', label: 'MIDDLE', x: -53.2, z: -20.0, fallAfter: 3 }),
  Object.freeze({ id: 'far-left', label: 'FAR LEFT', x: -59.2, z: -23.1, fallAfter: 3 }),
  Object.freeze({ id: 'far-right', label: 'FAR RIGHT', x: -59.2, z: -16.9, fallAfter: 3 }),
]);

export const RANGE_SCORE_ZONES = Object.freeze({
  body: Object.freeze({ id: 'body', points: 10, multiplier: 1 }),
  head: Object.freeze({ id: 'head', points: 25, multiplier: 2.5 }),
  outer: Object.freeze({ id: 'outer', points: 20, multiplier: 2 }),
  middle: Object.freeze({ id: 'middle', points: 30, multiplier: 3 }),
  bull: Object.freeze({ id: 'bull', points: 50, multiplier: 5 }),
});

export const CABIN_RANGE_LAYOUT = Object.freeze({
  bounds: Object.freeze({ x0: RANGE_SITE.x0, x1: RANGE_SITE.x1, z0: RANGE_SITE.z0, z1: RANGE_SITE.z1 }),
  firingLine: Object.freeze({ x: RANGE_SITE.firingX, z0: -26, z1: -14 }),
  bench: Object.freeze({ x: -32.35, z: -20, width: 9.8 }),
  backstop: Object.freeze({ x: RANGE_SITE.backstopX, z: -20, width: 13.2, height: 4.2, depth: 1.6 }),
  direction: Object.freeze({ x: RANGE_SITE.directionX, z: RANGE_SITE.directionZ }),
  targets: TARGET_SPECS,
  shotLimit: RANGE_SHOT_LIMIT,
  timeLimit: RANGE_TIME_LIMIT_S,
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function markRangeAssembly(object, assemblyId) {
  object.userData ??= {};
  object.userData.geometryGate = {
    ...(object.userData.geometryGate ?? {}),
    assemblyId,
    // Every range assembly is planted into the authored terrain. The terrain
    // is a relief mesh rather than a useful per-prop support witness, so mark
    // the installation itself as the fixed anchor while retaining overlap
    // checks against every unrelated object around it.
    fixedSupportAnchor: true,
  };
  return object;
}

function frozenHit(hit) {
  if (!hit) return null;
  return Object.freeze({
    targetId: hit.targetId,
    zoneId: hit.zoneId,
    points: hit.points,
    multiplier: hit.multiplier,
  });
}

/**
 * Headless ten-shot/timed scoring rules. One trigger can cross a painted score
 * plate and the board behind it; only the highest zone reached by that trigger
 * counts. This also prevents a shotgun pellet cloud farming overlapping faces.
 */
export class CabinRangeSession {
  constructor({
    shotLimit = RANGE_SHOT_LIMIT,
    timeLimit = RANGE_TIME_LIMIT_S,
    bestScore = 0,
    onEvent = null,
  } = {}) {
    this.shotLimit = Math.max(1, Math.trunc(Number(shotLimit) || RANGE_SHOT_LIMIT));
    this.timeLimit = Math.max(1, Number(timeLimit) || RANGE_TIME_LIMIT_S);
    this.bestScore = Math.max(0, Math.trunc(Number(bestScore) || 0));
    this.onEvent = onEvent;
    this.lastScore = 0;
    this.sequence = 0;
    this.reset();
  }

  _emit(type, fields = {}) {
    const event = Object.freeze({ type, ...fields, snapshot: this.snapshot() });
    try { this.onEvent?.(event); } catch { /* scoring cannot be broken by UI */ }
    return event;
  }

  begin() {
    const best = this.bestScore;
    const last = this.lastScore;
    this.reset();
    this.bestScore = best;
    this.lastScore = last;
    this.phase = 'active';
    this._emit('begin');
    return this.snapshot();
  }

  reset({ keepBest = true } = {}) {
    if (!keepBest) {
      this.bestScore = 0;
      this.lastScore = 0;
    }
    this.phase = 'idle';
    this.elapsed = 0;
    this.timeRemaining = this.timeLimit;
    this.score = 0;
    this.shots = 0;
    this.hits = 0;
    this.lastHit = null;
    this.finishReason = null;
    this._finishDelay = null;
    this._triggerScores = new Map();
    return this.snapshot();
  }

  _triggerId(value = null) {
    const supplied = value?.triggerId ?? value?.shot?.triggerId ?? value;
    if (supplied !== null && supplied !== undefined && supplied !== '') return String(supplied);
    return `range-shot-${++this.sequence}`;
  }

  recordShot(event = null) {
    if (this.phase !== 'active') return { applied: false, reason: 'inactive' };
    const triggerId = this._triggerId(event);
    if (this._triggerScores.has(triggerId)) {
      return { applied: false, reason: 'duplicate-trigger', triggerId };
    }
    if (this.shots >= this.shotLimit) return { applied: false, reason: 'shot-limit', triggerId };
    this._triggerScores.set(triggerId, { points: 0, hit: null });
    this.shots = this._triggerScores.size;
    if (this.shots >= this.shotLimit) this._finishDelay = 0.35;
    this._emit('shot', { triggerId });
    return { applied: true, triggerId, shots: this.shots };
  }

  scoreImpact(hit, impact = {}) {
    if (this.phase !== 'active') return { applied: false, reason: 'inactive' };
    if (!hit || !Number.isFinite(Number(hit.points))) return { applied: false, reason: 'not-a-target' };

    const triggerId = this._triggerId(impact);
    if (!this._triggerScores.has(triggerId)) {
      const recorded = this.recordShot({ triggerId });
      if (!recorded.applied && recorded.reason !== 'duplicate-trigger') return recorded;
    }
    const previous = this._triggerScores.get(triggerId);
    const points = Math.max(0, Math.trunc(Number(hit.points) || 0));
    if (points <= previous.points) {
      return { applied: false, reason: 'lower-zone', triggerId, score: this.score };
    }

    const delta = points - previous.points;
    if (previous.points === 0 && points > 0) this.hits++;
    const cleanHit = frozenHit(hit);
    this._triggerScores.set(triggerId, { points, hit: cleanHit });
    this.score += delta;
    this.lastHit = Object.freeze({ ...cleanHit, triggerId, delta });
    this._emit('hit', { triggerId, hit: cleanHit, delta });
    return { applied: true, triggerId, delta, score: this.score, hit: cleanHit };
  }

  finish(reason = 'complete') {
    if (this.phase !== 'active') return false;
    this.phase = 'complete';
    this.finishReason = reason;
    this.lastScore = this.score;
    this.bestScore = Math.max(this.bestScore, this.score);
    this._finishDelay = null;
    this._emit('complete', { reason });
    return true;
  }

  update(dt) {
    if (this.phase !== 'active') return this.snapshot();
    const step = clamp(Number(dt) || 0, 0, 0.25);
    this.elapsed += step;
    this.timeRemaining = Math.max(0, this.timeLimit - this.elapsed);
    if (this.timeRemaining <= 0) this.finish('time');
    if (this.phase === 'active' && this._finishDelay !== null) {
      this._finishDelay -= step;
      if (this._finishDelay <= 0) this.finish('shots');
    }
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      phase: this.phase,
      active: this.phase === 'active',
      complete: this.phase === 'complete',
      shotLimit: this.shotLimit,
      shots: this.shots,
      shotsRemaining: Math.max(0, this.shotLimit - this.shots),
      hits: this.hits,
      timeLimit: this.timeLimit,
      elapsed: this.elapsed,
      timeRemaining: this.timeRemaining,
      currentScore: this.score,
      lastScore: this.lastScore,
      bestScore: this.bestScore,
      lastHit: this.lastHit,
      finishReason: this.finishReason,
    });
  }
}

/** Resolve exact target/zone ownership from any hit child. */
export function cabinRangeTargetFromObject(object) {
  let node = object ?? null;
  while (node) {
    const hit = node.userData?.[RANGE_HIT_KEY];
    if (hit) return { ...hit, object: node };
    node = node.parent ?? null;
  }
  return null;
}

function invisibleTarget(name, size, position) {
  const target = box({
    name,
    size,
    pos: position,
    mat: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    cast: false,
    receive: false,
  });
  target.visible = true;
  target.userData.interactionProxy = true;
  return target;
}

function scoreMesh(mesh, targetId, zone) {
  mesh.userData[RANGE_HIT_KEY] = Object.freeze({
    targetId,
    zoneId: zone.id,
    points: zone.points,
    multiplier: zone.multiplier,
  });
  mesh.userData.combatThickness = 0.06;
  return mesh;
}

function scoreDisc({ name, inner = 0, outer, colour, y, targetId, zone }) {
  const geometry = inner > 0
    ? new THREE.RingGeometry(inner, outer, 28)
    : new THREE.CircleGeometry(outer, 28);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 0.88,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  mesh.name = name;
  mesh.position.set(0.052, y, 0);
  mesh.rotation.y = Math.PI / 2;
  mesh.castShadow = false;
  return scoreMesh(mesh, targetId, zone);
}

function buildTarget(spec, y, materials) {
  const root = group(`cabin-range-target.${spec.id}`);
  markRangeAssembly(root, `cabin-range-target:${spec.id}`);
  root.position.set(spec.x, y, spec.z);
  root.userData.rangeTargetId = spec.id;
  root.userData.combatMaterial = 'wood';

  const fixed = group(`cabin-range-target.${spec.id}.frame`);
  for (const z of [-0.63, 0.63]) {
    fixed.add(cylinder({
      name: `cabin-range-target.${spec.id}.post`,
      r: 0.055,
      h: 2.35,
      pos: [0, 1.175, z],
      mat: materials.post,
    }));
  }
  fixed.add(box({
    name: `cabin-range-target.${spec.id}.crossbar`,
    size: [0.13, 0.12, 1.42],
    pos: [0, 2.26, 0],
    mat: materials.post,
  }));
  root.add(fixed);

  // Pivot at the ground: rotation around Z folds the complete target west,
  // away from the shooter, while its timber frame remains standing.
  const pivot = group(`cabin-range-target.${spec.id}.pivot`);
  const body = scoreMesh(box({
    name: `cabin-range-target.${spec.id}.body`,
    size: [0.075, 1.42, 0.98],
    pos: [0, 1.28, 0],
    mat: materials.board,
  }), spec.id, RANGE_SCORE_ZONES.body);
  pivot.add(body);

  const head = scoreDisc({
    name: `cabin-range-target.${spec.id}.head`,
    outer: 0.255,
    colour: 0xd6caa9,
    y: 2.13,
    targetId: spec.id,
    zone: RANGE_SCORE_ZONES.head,
  });
  pivot.add(head);

  const outer = scoreDisc({
    name: `cabin-range-target.${spec.id}.score.outer`,
    inner: 0.19,
    outer: 0.30,
    colour: 0xc8b98e,
    y: 1.31,
    targetId: spec.id,
    zone: RANGE_SCORE_ZONES.outer,
  });
  const middle = scoreDisc({
    name: `cabin-range-target.${spec.id}.score.middle`,
    inner: 0.09,
    outer: 0.19,
    colour: 0x8f2f27,
    y: 1.31,
    targetId: spec.id,
    zone: RANGE_SCORE_ZONES.middle,
  });
  const bull = scoreDisc({
    name: `cabin-range-target.${spec.id}.score.bull`,
    outer: 0.09,
    colour: 0x24211b,
    y: 1.31,
    targetId: spec.id,
    zone: RANGE_SCORE_ZONES.bull,
  });
  pivot.add(outer, middle, bull);
  root.add(pivot);

  const meshes = [body, head, outer, middle, bull];
  const state = { hits: 0, fallen: false, wobble: 0, velocity: 0 };
  return {
    id: spec.id,
    label: spec.label,
    root,
    pivot,
    meshes,
    strike(points = 0) {
      state.hits++;
      state.wobble = Math.min(0.24, state.wobble + 0.08 + Math.max(0, points) * 0.0008);
      state.velocity = Math.min(4.8, state.velocity + 1.7);
      if (state.hits >= spec.fallAfter) state.fallen = true;
      return this.snapshot();
    },
    reset() {
      state.hits = 0;
      state.fallen = false;
      state.wobble = 0;
      state.velocity = 0;
      pivot.rotation.z = 0;
      return this.snapshot();
    },
    update(dt) {
      const step = clamp(Number(dt) || 0, 0, 0.1);
      if (state.fallen) {
        pivot.rotation.z += (1.34 - pivot.rotation.z) * (1 - Math.exp(-step * 7.5));
        state.wobble *= Math.exp(-step * 7);
        return;
      }
      state.velocity = Math.max(0, state.velocity - step * 2.4);
      state.wobble *= Math.exp(-step * 3.6);
      pivot.rotation.z = Math.sin(state.velocity * 3.2) * state.wobble;
    },
    snapshot() {
      return Object.freeze({ id: spec.id, hits: state.hits, fallen: state.fallen, angle: pivot.rotation.z });
    },
  };
}

/**
 * Build the complete range in scene/world coordinates.
 */
export function buildCabinShootingRange({
  parent = null,
  groundAt = cabinGroundAt,
  shotLimit = RANGE_SHOT_LIMIT,
  timeLimit = RANGE_TIME_LIMIT_S,
  bestScore = 0,
  onEvent = null,
  onInteract = null,
} = {}) {
  const root = group('cabin-shooting-range');
  parent?.add?.(root);

  const materials = {
    log: mat({ color: 0x4b3420, roughness: 0.98 }),
    bark: mat({ color: 0x2f251b, roughness: 1 }),
    post: mat({ color: 0x66503a, roughness: 0.96 }),
    board: mat({ color: 0xb9aa83, roughness: 0.98 }),
    earth: mat({ color: 0x382d20, roughness: 1 }),
    metal: mat({ color: 0x4c5353, roughness: 0.62, metalness: 0.55 }),
    line: mat({ color: 0xd7c36f, roughness: 0.9 }),
  };

  const firingY = groundAt(CABIN_RANGE_LAYOUT.firingLine.x, -20);
  const firing = group('cabin-range.firing-line');
  markRangeAssembly(firing, 'cabin-range:firing-line');
  firing.add(box({
    name: 'cabin-range.firing-line.rail',
    size: [0.24, 1.02, 11.7],
    pos: [CABIN_RANGE_LAYOUT.firingLine.x, firingY + 0.51, -20],
    mat: materials.log,
  }));
  firing.add(box({
    name: 'cabin-range.firing-line.paint',
    size: [0.10, 0.018, 11.3],
    pos: [CABIN_RANGE_LAYOUT.firingLine.x + 0.34, firingY + 0.018, -20],
    mat: materials.line,
    cast: false,
  }));
  for (const z of [-24.5, -22.25, -20, -17.75, -15.5]) {
    firing.add(cylinder({
      name: 'cabin-range.firing-line.post',
      r: 0.085,
      h: 1.18,
      pos: [CABIN_RANGE_LAYOUT.firingLine.x, firingY + 0.59, z],
      mat: materials.bark,
    }));
  }
  root.add(firing);

  const bench = group('cabin-range.bench');
  markRangeAssembly(bench, 'cabin-range:bench');
  const benchX = CABIN_RANGE_LAYOUT.bench.x;
  bench.add(box({
    name: 'cabin-range.bench.top',
    size: [1.05, 0.14, CABIN_RANGE_LAYOUT.bench.width],
    pos: [benchX, firingY + 0.77, -20],
    mat: materials.log,
  }));
  for (const z of [-24.1, -21.35, -18.65, -15.9]) {
    bench.add(cylinder({ r: 0.105, h: 0.74, pos: [benchX, firingY + 0.37, z], mat: materials.bark }));
  }
  root.add(bench);

  const backstopY = groundAt(CABIN_RANGE_LAYOUT.backstop.x, CABIN_RANGE_LAYOUT.backstop.z);
  const backstop = group('cabin-range.backstop');
  markRangeAssembly(backstop, 'cabin-range:backstop');
  backstop.userData.combatMaterial = 'earth';
  const berm = box({
    name: 'cabin-range.backstop.berm',
    size: [CABIN_RANGE_LAYOUT.backstop.depth, CABIN_RANGE_LAYOUT.backstop.height, CABIN_RANGE_LAYOUT.backstop.width],
    pos: [CABIN_RANGE_LAYOUT.backstop.x, backstopY + CABIN_RANGE_LAYOUT.backstop.height / 2, CABIN_RANGE_LAYOUT.backstop.z],
    mat: materials.earth,
  });
  berm.userData.combatThickness = CABIN_RANGE_LAYOUT.backstop.depth;
  backstop.add(berm);
  for (let row = 0; row < 8; row++) {
    const y = backstopY + 0.26 + row * 0.47;
    const log = cylinder({
      name: `cabin-range.backstop.log.${row}`,
      r: 0.20,
      h: CABIN_RANGE_LAYOUT.backstop.width + 0.7,
      pos: [CABIN_RANGE_LAYOUT.backstop.x + 0.86, y, -20],
      rotX: Math.PI / 2,
      mat: row % 2 ? materials.log : materials.bark,
    });
    backstop.add(log);
  }
  root.add(backstop);

  const targets = new Map();
  const hitTargets = [berm];
  for (const spec of TARGET_SPECS) {
    const target = buildTarget(spec, groundAt(spec.x, spec.z), materials);
    targets.set(spec.id, target);
    root.add(target.root);
    hitTargets.push(...target.meshes);
  }

  const interactTarget = invisibleTarget(
    'cabin-range.interact-target',
    [0.28, 1.55, 2.35],
    [CABIN_RANGE_LAYOUT.firingLine.x + 0.12, firingY + 0.78, -20],
  );
  root.add(interactTarget);

  const colliders = [
    collider(
      [benchX - 0.58, firingY, -25.05],
      [benchX + 0.58, firingY + 0.90, -14.95],
    ),
    collider(
      [CABIN_RANGE_LAYOUT.backstop.x - CABIN_RANGE_LAYOUT.backstop.depth / 2, backstopY, -26.9],
      [CABIN_RANGE_LAYOUT.backstop.x + CABIN_RANGE_LAYOUT.backstop.depth / 2, backstopY + 4.2, -13.1],
    ),
  ];
  markSpatialPrimitive(colliders[0], { id: 'cabin-range-bench', kind: 'prop' });
  markSpatialPrimitive(colliders[1], { id: 'cabin-range-backstop', kind: 'world' });

  const session = new CabinRangeSession({ shotLimit, timeLimit, bestScore, onEvent });

  function targetFromObject(object) {
    return cabinRangeTargetFromObject(object);
  }

  function handleWeaponEvent(event) {
    if (event?.type !== 'fire') return { applied: false, reason: 'not-fire' };
    return session.recordShot(event);
  }

  function handleImpact(impact) {
    const hit = targetFromObject(impact?.object);
    if (!hit) return { applied: false, reason: 'not-a-target' };
    const target = targets.get(hit.targetId);
    target?.strike(hit.points);
    return session.scoreImpact(hit, impact);
  }

  function begin() {
    for (const target of targets.values()) target.reset();
    return session.begin();
  }

  function reset(options) {
    for (const target of targets.values()) target.reset();
    return session.reset(options);
  }

  function finish(reason = 'complete') {
    return session.finish(reason);
  }

  function update(dt) {
    for (const target of targets.values()) target.update(dt);
    session.update(dt);
    return snapshot();
  }

  function snapshot() {
    return Object.freeze({
      ...session.snapshot(),
      targets: Object.freeze([...targets.values()].map((target) => target.snapshot())),
    });
  }

  const authoredView = LANDMARK_VIEWPOINTS.range;
  const viewpointPosition = new THREE.Vector3(
    authoredView.x,
    groundAt(authoredView.x, authoredView.z) + 1.68,
    authoredView.z,
  );
  const viewpointLookAt = new THREE.Vector3(
    authoredView.lookX,
    groundAt(authoredView.lookX, authoredView.lookZ) + 1.35,
    authoredView.lookZ,
  );
  const viewpoint = Object.freeze({
    id: 'range',
    position: viewpointPosition,
    lookAt: viewpointLookAt,
    yaw: yawToward(viewpointPosition, viewpointLookAt),
    pitch: authoredView.pitch,
  });

  const geometry = Object.freeze({
    ...CABIN_RANGE_LAYOUT,
    gradeY: firingY,
    targetCount: targets.size,
    hitSurfaceCount: hitTargets.length,
    viewpoint: Object.freeze({ ...authoredView }),
  });

  const interaction = Object.freeze({
    target: interactTarget,
    label: () => (session.phase === 'active'
      ? `Reset the <b>${RANGE_SHOT_LIMIT}-shot range</b>`
      : 'Inspect the <b>practice range</b>'),
    enabled: () => true,
    onUse: () => onInteract?.(snapshot()),
  });
  interactTarget.userData.rangeInteraction = interaction;

  return Object.freeze({
    root,
    session,
    targets,
    hitTargets: Object.freeze(hitTargets),
    colliders: Object.freeze(colliders),
    interactTarget,
    interaction,
    geometry,
    viewpoint,
    targetFromObject,
    handleWeaponEvent,
    handleImpact,
    begin,
    finish,
    reset,
    update,
    snapshot,
  });
}
