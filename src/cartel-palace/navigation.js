import * as THREE from 'three';
import { NavMeshQuery, importNavMesh, init } from '../../vendor/recast-navigation/index.mjs';

const DEFAULT_ASSET = 'assets/navigation/cartel-palace-navmesh.bin';
const GOAL_REPLAN_DISTANCE = 1.25;
const PATH_DRIFT_DISTANCE = 2.4;
const WAYPOINT_ARRIVAL = 0.38;
const REPLAN_SECONDS = 0.42;

function finiteVector(value) {
  return value?.isVector3
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

function nowSeconds() {
  return performance.now() / 1000;
}

/**
 * Cartel Palace physical path adapter.
 *
 * The tactical system still chooses every destination. This object only
 * turns that destination into a short collision-safe displacement. The live
 * AABB sweep in PalaceSecurity remains the last word, so actors and doors are
 * still solid even though the checked-in navmesh represents opened route
 * doors.
 */
export class PalaceNavigation {
  constructor({
    asset = DEFAULT_ASSET,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    clock = nowSeconds,
  } = {}) {
    this.asset = asset;
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.status = 'idle';
    this.error = null;
    this.navMesh = null;
    this.query = null;
    this.paths = new Map();
    this.pending = null;
    this.metrics = {
      assetBytes: 0,
      initMs: 0,
      loadMs: 0,
      queries: 0,
      queryFailures: 0,
      queryMs: 0,
      cacheHits: 0,
      replans: 0,
      steps: 0,
    };
  }

  get ready() { return this.status === 'ready' && Boolean(this.query); }

  start() {
    if (this.pending) return this.pending;
    this.status = 'loading';
    this.pending = this._load().catch((error) => {
      this.status = 'failed';
      this.error = String(error?.message ?? error);
      return false;
    });
    return this.pending;
  }

  async _load() {
    if (typeof this.fetchImpl !== 'function') throw new Error('fetch is unavailable');
    const initStarted = performance.now();
    await init();
    this.metrics.initMs = performance.now() - initStarted;
    const loadStarted = performance.now();
    const response = await this.fetchImpl(this.asset, { cache: 'force-cache' });
    if (!response?.ok) throw new Error(`navmesh request failed (${response?.status ?? 'no status'})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    this.metrics.assetBytes = bytes.byteLength;
    const imported = importNavMesh(bytes);
    if (!imported?.navMesh) throw new Error('navmesh import failed');
    this.navMesh = imported.navMesh;
    this.query = new NavMeshQuery(this.navMesh, { maxNodes: 4096 });
    this.query.defaultQueryHalfExtents = { x: 2.5, y: 3, z: 2.5 };
    this.metrics.loadMs = performance.now() - loadStarted;
    this.status = 'ready';
    return true;
  }

  _plan(id, position, goal) {
    if (!this.ready) return null;
    const started = performance.now();
    const result = this.query.computePath(
      { x: position.x, y: 0, z: position.z },
      { x: goal.x, y: 0, z: goal.z },
      {
        halfExtents: this.query.defaultQueryHalfExtents,
        maxPathPolys: 1024,
        maxStraightPathPoints: 1024,
      },
    );
    this.metrics.queries++;
    this.metrics.queryMs += performance.now() - started;
    if (!result.success || result.path.length < 2) {
      this.metrics.queryFailures++;
      this.paths.delete(id);
      return null;
    }
    const points = result.path.map((point) => new THREE.Vector3(point.x, 0, point.z));
    const plan = {
      goal: goal.clone().setY(0),
      points,
      index: 1,
      plannedAt: this.clock(),
    };
    this.paths.set(id, plan);
    this.metrics.replans++;
    return plan;
  }

  _usable(plan, position, goal) {
    if (!plan) return false;
    if (plan.goal.distanceToSquared(goal) > GOAL_REPLAN_DISTANCE ** 2) return false;
    if (this.clock() - plan.plannedAt > REPLAN_SECONDS) return false;
    const waypoint = plan.points[Math.min(plan.index, plan.points.length - 1)];
    return waypoint.distanceToSquared(position) <= PATH_DRIFT_DISTANCE ** 2
      || plan.index === 1;
  }

  /**
   * Return one displacement no longer than maxDistance, or null so the
   * caller uses its existing direct/detour steering.
   */
  step(id, position, goal, maxDistance) {
    if (!this.ready || !id || !finiteVector(position) || !finiteVector(goal)) return null;
    const stride = Math.max(0, Number(maxDistance) || 0);
    if (stride <= 1e-8) return null;
    const flatPosition = position.clone().setY(0);
    const flatGoal = goal.clone().setY(0);
    let plan = this.paths.get(id) ?? null;
    if (!this._usable(plan, flatPosition, flatGoal)) plan = this._plan(id, flatPosition, flatGoal);
    else this.metrics.cacheHits++;
    if (!plan) return null;
    while (plan.index < plan.points.length - 1
      && flatPosition.distanceTo(plan.points[plan.index]) <= WAYPOINT_ARRIVAL) {
      plan.index++;
    }
    const waypoint = plan.points[plan.index];
    if (!waypoint) return null;
    const displacement = waypoint.clone().sub(flatPosition).setY(0);
    const distance = displacement.length();
    if (distance <= 1e-8) return null;
    displacement.multiplyScalar(Math.min(distance, stride) / distance);
    this.metrics.steps++;
    return displacement;
  }

  forget(id) {
    this.paths.delete(id);
  }

  report() {
    return {
      status: this.status,
      ready: this.ready,
      error: this.error,
      cachedPaths: this.paths.size,
      ...this.metrics,
      averageQueryMs: this.metrics.queries
        ? this.metrics.queryMs / this.metrics.queries : 0,
    };
  }

  destroy() {
    this.paths.clear();
    this.query?.destroy?.();
    this.navMesh?.destroy?.();
    this.query = null;
    this.navMesh = null;
    this.status = 'destroyed';
  }
}

export function createPalaceNavigation(options = {}) {
  return new PalaceNavigation(options);
}
