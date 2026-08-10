/** Frozen launcher and public-root adapters for the advisory scene mesh sweep. */

import { APARTMENT_PREVIEW_VARIANTS } from '../src/core/preview-mode.js';

const freezePaths = (paths = []) => Object.freeze(paths.map((path) => Object.freeze([...path])));
const entry = (id, url, start = null, rootPaths = [], launcherKey = `scene:${id}`) => Object.freeze({
  id,
  url,
  launcherKey,
  ...(start ? { start } : {}),
  ...(rootPaths.length ? { rootPaths: freezePaths(rootPaths) } : {}),
});

export const SCENE_AUDIT_SCENES = Object.freeze([
  ...APARTMENT_PREVIEW_VARIANTS.map((variant) => entry(
    `apartment:${variant}`,
    `index.html?preview=1&apartment=${variant}`,
    '#start-btn, #startBtn',
    [],
    `apartment:${variant}`,
  )),
  entry('bing', 'bing.html?preview=1', '#start-btn, #startBtn', [], 'scene:bing-one'),
  entry('bing-two', 'bing.html?visit=2&preview=1', '#start-btn, #startBtn', [
    ['HOTDOG_INCIDENT', 'player', 'camera', 'parent'],
  ]),
  entry('mansion', 'mansion.html?preview=1', '#startBtn'),
  entry('mansion-return', 'mansion.html?visit=return&preview=1', '#startBtn'),
  entry('golf', 'golf.html?preview=1', '#start-btn, #startBtn'),
  entry('silver', 'silver.html?preview=1', '#start-btn, #startBtn'),
  entry('nowake', 'nowake.html?preview=1', '#start-btn, #startBtn', [], 'scene:no-wake'),
  entry('enolasquatch', 'enolasquatch.html?preview=1', '#start-btn, #startBtn'),
  entry('heist', 'heist.html?preview=1&checkpoint=safehouse', '#start', [
    ['__heistDebug', 'scene'],
  ]),
  entry('motel', 'motel.html?preview=1', '#start-btn, #startBtn'),
  entry('graveyard', 'graveyard.html?preview=1', '#start-btn, #startBtn', [
    ['GRAVEYARD', 'player', 'camera', 'parent'],
  ]),
  entry('beefrun', 'beefrun.html?preview=1', '#start-btn, #startBtn'),
  entry('silvercase', 'silvercase.html?preview=1', '#beginBtn', [
    ['silvercase', 'scene'],
  ]),
  entry('squatchfather', 'squatchfather.html?preview=1', '#start-btn, #startBtn'),
  entry('cartel-palace', 'cartel-palace.html?preview=1', '#start-btn, #startBtn', [
    ['CARTEL_PALACE', 'player', 'camera', 'parent'],
  ]),
  entry('mansion-siege', 'mansion-siege.html?preview=1', '#startBtn'),
]);

/**
 * Resolve configured public debug-handle paths inside a browser global and
 * publish only actual THREE.Scene roots for the in-page audit traversal.
 */
export function installKnownSceneRoots({ paths = [], root = globalThis } = {}) {
  const roots = [];
  for (const path of paths) {
    let value = root;
    for (const key of path) value = value?.[key];
    if (value?.isScene && !roots.includes(value)) roots.push(value);
  }
  root.__auditRoots = roots;
  return roots.length;
}

/** Match the audit's visual eligibility before declaring a scene ready. */
export function countVisibleAuditMeshes(roots = globalThis.__auditRoots ?? []) {
  let meshes = 0;
  for (const root of roots) {
    root.traverse((object) => {
      if (!object.isMesh || !object.geometry) return;
      for (let parent = object; parent; parent = parent.parent) {
        if (parent.visible === false) return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.length && materials.every((material) => material && material.colorWrite === false)) return;
      meshes += 1;
    });
  }
  return meshes;
}

/**
 * Return unique mesh pairs whose world-space AABB faces share a plane.
 *
 * Pair identity comes from the item objects in this invocation, never their
 * optional display names. That matters for procedural scenes, where hundreds
 * of distinct meshes legitimately have an empty `name`.
 */
export function findCoplanarAuditPairs(
  items = [],
  { flat = 0.0006, minArea = 0.25, maxPlaneItems = 60 } = {},
) {
  const axes = ['x', 'y', 'z'];
  const planes = { x: new Map(), y: new Map(), z: new Map() };
  const key = (value) => Math.round(value / flat);

  for (let identity = 0; identity < items.length; identity++) {
    const item = items[identity];
    for (const axis of axes) {
      for (const face of ['min', 'max']) {
        const planeKey = key(item[face][axis]);
        if (!planes[axis].has(planeKey)) planes[axis].set(planeKey, []);
        planes[axis].get(planeKey).push({ item, identity, face });
      }
    }
  }

  const pairs = [];
  const seenPairs = new Set();
  for (const axis of axes) {
    const [u, v] = axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];
    for (const group of planes[axis].values()) {
      if (group.length < 2 || group.length > maxPlaneItems) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const aFace = group[i];
          const bFace = group[j];
          if (aFace.identity === bFace.identity) continue;

          const a = aFace.item;
          const b = bFace.item;
          const aThickness = a.max[axis] - a.min[axis];
          const bThickness = b.max[axis] - b.min[axis];
          const opposingContact = aThickness > Number.EPSILON
            && bThickness > Number.EPSILON
            && (
              (aFace.face === 'max' && bFace.face === 'min'
                && Math.abs(a.max[axis] - b.min[axis]) <= flat)
              || (aFace.face === 'min' && bFace.face === 'max'
                && Math.abs(a.min[axis] - b.max[axis]) <= flat)
            );
          if (opposingContact) continue;

          const overlapU = Math.min(a.max[u], b.max[u]) - Math.max(a.min[u], b.min[u]);
          const overlapV = Math.min(a.max[v], b.max[v]) - Math.max(a.min[v], b.min[v]);
          const area = overlapU * overlapV;
          if (overlapU <= 0 || overlapV <= 0 || area < minArea) continue;

          const low = Math.min(aFace.identity, bFace.identity);
          const high = Math.max(aFace.identity, bFace.identity);
          const pairKey = `${axis}:${low}:${high}`;
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);
          pairs.push({ a, b, axis, area, overlapU, overlapV });
        }
      }
    }
  }
  return pairs;
}
