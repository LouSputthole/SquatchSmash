import * as THREE from 'three';

/**
 * Reusable target acquisition and last-seen memory for ground combatants.
 *
 * This Module owns no cast, faction, animation, or geometry. Its Adapter
 * supplies eligible candidates, a sampled aim point, and either an
 * AabbCombatSpace or trace function. Live target objects exist only between
 * scans; checkpoint state contains scalar awareness plus a copied point.
 */

const TWO_PI = Math.PI * 2;
const DIRECTION_EPSILON = 1e-8;
const SCORE_EPSILON = 1e-9;

export const DEFAULT_COMBAT_PERCEPTION = Object.freeze({
  range: Infinity,
  fov: TWO_PI,
  memorySeconds: 2.4,
  awarenessGain: 0.35,
  memoryAwarenessFloor: 0.7,
  memoryAwarenessLoss: 0.04,
  lostAwarenessLoss: 0.12,
});

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function pointFrom(value) {
  if (Array.isArray(value)) {
    if (value.length < 3) return null;
    return new THREE.Vector3(
      finite(value[0], 0), finite(value[1], 0), finite(value[2], 0),
    );
  }
  if (!value || !Number.isFinite(value.x)
    || !Number.isFinite(value.y) || !Number.isFinite(value.z)) return null;
  return new THREE.Vector3(value.x, value.y, value.z);
}

function defaultSamplePoint(candidate) {
  if (!candidate) return null;
  if (typeof candidate.samplePoint === 'function') {
    return pointFrom(candidate.samplePoint(candidate));
  }
  if (candidate.aimPoint) return pointFrom(candidate.aimPoint);
  const source = candidate.position ?? candidate.root?.position ?? candidate.group?.position;
  const point = pointFrom(source);
  if (point) point.y += finite(candidate.eye, 0);
  return point;
}

function defaultEligible(candidate) {
  return Boolean(candidate)
    && candidate.targetable !== false
    && candidate.neverTargeted !== true
    && candidate.visible !== false
    && candidate.node?.visible !== false
    && candidate.root?.visible !== false
    && candidate.incapacitated !== true
    && candidate.actor?.incapacitated !== true;
}

function defaultScore(candidate, distance) {
  return distance * Math.max(0, finite(candidate?.priority, 1));
}

function defaultId(candidate, index) {
  const id = candidate?.id ?? candidate?.actor?.id ?? candidate?.combatId
    ?? candidate?.node?.name ?? candidate?.root?.name;
  return id == null ? `~${String(index).padStart(10, '0')}` : String(id);
}

export class CombatPerception {
  constructor({
    range = DEFAULT_COMBAT_PERCEPTION.range,
    fov = DEFAULT_COMBAT_PERCEPTION.fov,
    memorySeconds = DEFAULT_COMBAT_PERCEPTION.memorySeconds,
    awareness = 0,
    awarenessGain = DEFAULT_COMBAT_PERCEPTION.awarenessGain,
    memoryAwarenessFloor = DEFAULT_COMBAT_PERCEPTION.memoryAwarenessFloor,
    memoryAwarenessLoss = DEFAULT_COMBAT_PERCEPTION.memoryAwarenessLoss,
    lostAwarenessLoss = DEFAULT_COMBAT_PERCEPTION.lostAwarenessLoss,
    samplePoint = defaultSamplePoint,
    eligible = defaultEligible,
    score = defaultScore,
    idOf = defaultId,
    space = null,
    trace = null,
  } = {}) {
    this.range = range === Infinity ? Infinity : Math.max(0, finite(range, Infinity));
    this.fov = clamp(finite(fov, TWO_PI), 0, TWO_PI);
    this.memorySeconds = Math.max(0, finite(
      memorySeconds, DEFAULT_COMBAT_PERCEPTION.memorySeconds,
    ));
    this.awarenessGain = Math.max(0, finite(
      awarenessGain, DEFAULT_COMBAT_PERCEPTION.awarenessGain,
    ));
    this.memoryAwarenessFloor = clamp(finite(
      memoryAwarenessFloor, DEFAULT_COMBAT_PERCEPTION.memoryAwarenessFloor,
    ), 0, 1);
    this.memoryAwarenessLoss = Math.max(0, finite(
      memoryAwarenessLoss, DEFAULT_COMBAT_PERCEPTION.memoryAwarenessLoss,
    ));
    this.lostAwarenessLoss = Math.max(0, finite(
      lostAwarenessLoss, DEFAULT_COMBAT_PERCEPTION.lostAwarenessLoss,
    ));
    this.samplePoint = samplePoint;
    this.eligible = eligible;
    this.score = score;
    this.idOf = idOf;
    this.space = space;
    this.trace = trace;

    this.target = null;
    this.targetVisible = false;
    this.sampledPoint = null;
    this.lastSeen = null;
    this.distance = Infinity;
    this.memory = 0;
    this.awareness = clamp(finite(awareness, 0), 0, 1);
  }

  get hasMemory() {
    return this.memory > 0 && Boolean(this.lastSeen);
  }

  _miss() {
    this.target = null;
    this.targetVisible = false;
    this.sampledPoint = null;
    this.distance = Infinity;
    if (this.hasMemory) {
      this.awareness = Math.max(
        this.memoryAwarenessFloor,
        this.awareness - this.memoryAwarenessLoss,
      );
    } else {
      this.awareness = Math.max(0, this.awareness - this.lostAwarenessLoss);
    }
    return null;
  }

  /**
   * Acquire the lowest-scored candidate inside range and the configured FOV.
   * Any truthy trace result blocks line of sight. The selected sample, the
   * visible point, the remembered point, and the returned point are distinct
   * vectors so later target motion cannot become x-ray tracking.
   */
  scan({
    origin,
    forward = null,
    candidates = [],
    boxes = undefined,
    range = this.range,
    fov = this.fov,
    samplePoint = this.samplePoint,
    eligible = this.eligible,
    score = this.score,
    idOf = this.idOf,
    space = this.space,
    trace = this.trace,
  } = {}) {
    const eye = pointFrom(origin);
    if (!eye) return this._miss();
    const maximumRange = range === Infinity ? Infinity : Math.max(0, finite(range, this.range));
    const viewAngle = clamp(finite(fov, this.fov), 0, TWO_PI);
    const enforceFov = viewAngle < TWO_PI - DIRECTION_EPSILON;
    const look = enforceFov ? pointFrom(forward) : null;
    if (enforceFov && (!look || look.lengthSq() < DIRECTION_EPSILON ** 2)) {
      return this._miss();
    }
    look?.normalize();
    const minimumDot = enforceFov ? Math.cos(viewAngle * 0.5) : -1;

    const supplied = typeof candidates === 'function' ? candidates() : candidates;
    let best = null;
    let index = 0;
    for (const candidate of supplied ?? []) {
      const order = index++;
      if (!eligible(candidate)) continue;
      const point = pointFrom(samplePoint(candidate));
      if (!point) continue;
      const offset = point.clone().sub(eye);
      const distance = offset.length();
      if (distance > maximumRange) continue;
      if (enforceFov && distance > DIRECTION_EPSILON
        && offset.multiplyScalar(1 / distance).dot(look) < minimumDot) continue;

      let obstruction = null;
      if (typeof trace === 'function') {
        obstruction = trace(eye, point, { target: candidate, boxes });
      } else if (space?.trace) {
        obstruction = space.trace(eye, point, { boxes });
      }
      if (obstruction) continue;

      const candidateScore = score(candidate, distance, point);
      if (!Number.isFinite(candidateScore)) continue;
      const id = String(idOf(candidate, order) ?? '');
      const better = !best || candidateScore < best.score - SCORE_EPSILON;
      const tied = best && Math.abs(candidateScore - best.score) <= SCORE_EPSILON
        && id < best.id;
      if (better || tied) best = { target: candidate, point, distance, score: candidateScore, id };
    }

    if (!best) return this._miss();
    this.target = best.target;
    this.targetVisible = true;
    this.distance = best.distance;
    this.sampledPoint = best.point.clone();
    this.lastSeen = best.point.clone();
    this.memory = this.memorySeconds;
    this.awareness = Math.min(1, this.awareness + this.awarenessGain);
    return {
      target: best.target,
      point: best.point.clone(),
      distance: best.distance,
      score: best.score,
    };
  }

  /** Decay last-seen memory only while no target is currently visible. */
  tick(dt) {
    if (this.targetVisible || this.memory <= 0) return this.memory;
    this.memory = Math.max(0, this.memory - Math.max(0, finite(dt, 0)));
    if (this.memory <= 0) {
      this.memory = 0;
      this.lastSeen = null;
    }
    return this.memory;
  }

  /** JSON-safe durable state: deliberately excludes the live target object. */
  snapshot() {
    return {
      version: 1,
      awareness: this.awareness,
      memory: this.memory,
      lastSeen: this.lastSeen?.toArray() ?? null,
    };
  }

  /** Restore memory and awareness while clearing every live-target field. */
  restore(snapshot = {}) {
    this.target = null;
    this.targetVisible = false;
    this.sampledPoint = null;
    this.distance = Infinity;
    this.awareness = clamp(finite(snapshot.awareness, 0), 0, 1);
    this.memory = Math.max(0, finite(snapshot.memory, 0));
    this.lastSeen = pointFrom(snapshot.lastSeen);
    if (!this.lastSeen || this.memory <= 0) {
      this.lastSeen = null;
      this.memory = 0;
    }
    return this;
  }
}
