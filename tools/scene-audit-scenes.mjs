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
  entry('cabin', 'cabin.html?preview=1', '#start-btn, #startBtn', [
    ['COUNTRYSIDE_CABIN', 'scene'],
  ]),
  entry('luxury-apartment', 'luxury-apartment.html?preview=1', '#start-btn, #startBtn', [
    ['LUXURY_APARTMENT', 'scene'],
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
  /* No start button: the Special Meeting opens in the car with the doors shut
   * and boots straight into the ride. */
  entry('special-meeting', 'specialmeeting.html?preview=1', null, [
    ['SPECIAL_MEETING', 'scene'],
  ]),
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

/**
 * Match Three's effective visual eligibility closely enough for an advisory
 * geometry audit. Hidden ancestors, invisible materials, colourless proxies,
 * and fully transparent blended materials cannot contribute a rendered pixel
 * and therefore cannot make an otherwise empty scene audit-ready.
 */
export function isAuditRenderableMesh(object) {
  if (!object?.isMesh || !object.geometry) return false;
  for (let parent = object; parent; parent = parent.parent) {
    if (parent.visible === false) return false;
  }
  if (object.isInstancedMesh && !(Number(object.count) > 0)) return false;

  const geometry = object.geometry;
  const totalCount = Number(geometry.index?.count ?? geometry.attributes?.position?.count ?? 0);
  const drawStart = Number(geometry.drawRange?.start ?? 0);
  const rawDrawCount = geometry.drawRange?.count ?? Number.POSITIVE_INFINITY;
  const drawCount = Number(rawDrawCount);
  if (!(totalCount > 0) || !Number.isFinite(totalCount) || !Number.isFinite(drawStart)) return false;
  if (!(drawCount > 0) || (!Number.isFinite(drawCount) && drawCount !== Number.POSITIVE_INFINITY)) {
    return false;
  }
  const drawEnd = drawCount === Number.POSITIVE_INFINITY
    ? totalCount
    : Math.min(totalCount, drawStart + drawCount);
  const hasDrawnTriangles = (start = 0, count = totalCount) => {
    const groupStart = Number(start);
    const groupCount = Number(count);
    if (!Number.isFinite(groupStart) || !(groupCount > 0) || !Number.isFinite(groupCount)) {
      return false;
    }
    const effectiveStart = Math.max(0, drawStart, groupStart);
    const effectiveEnd = Math.min(totalCount, drawEnd, groupStart + groupCount);
    return effectiveEnd - effectiveStart >= 3;
  };
  const materialRenders = (material) => Boolean(material) && (
    material.visible !== false
    && material.colorWrite !== false
    && !(material.transparent === true && Number(material.opacity ?? 1) <= 0)
  );

  if (!Array.isArray(object.material)) {
    return materialRenders(object.material) && hasDrawnTriangles(0, totalCount);
  }
  return (geometry.groups ?? []).some((group) => (
    hasDrawnTriangles(group.start, group.count)
    && materialRenders(object.material[group.materialIndex ?? 0])
  ));
}

/** Match the audit's visual eligibility before declaring a scene ready. */
export function countVisibleAuditMeshes(roots = globalThis.__auditRoots ?? []) {
  let meshes = 0;
  const seen = new Set();
  for (const root of roots) {
    root.traverse((object) => {
      if (seen.has(object)) return;
      seen.add(object);
      if (isAuditRenderableMesh(object)) meshes += 1;
    });
  }
  return meshes;
}

/** Serialize both readiness dependencies into the browser page together. */
export function buildSceneAuditReadinessExpression() {
  return `(() => {
    const isAuditRenderableMesh = ${isAuditRenderableMesh.toString()};
    const countVisibleAuditMeshes = ${countVisibleAuditMeshes.toString()};
    return countVisibleAuditMeshes();
  })()`;
}

/**
 * Serialize one rendered mesh into exact world-space audit records.
 *
 * InstancedMesh needs one record per instance. Treating its combined batch
 * bounds as one object lets a supported instance at one end of a building
 * hide a floating instance at the other end. Geometry-local bounds also keep
 * a regular mesh from accidentally absorbing the bounds of child meshes that
 * the traversal will audit separately.
 */
export function collectAuditMeshItems(mesh, THREE) {
  if (!mesh?.isMesh || !mesh.geometry || !THREE) return [];
  mesh.updateWorldMatrix?.(true, false);

  let localBounds = null;
  if (mesh.isSkinnedMesh && typeof mesh.computeBoundingBox === 'function') {
    mesh.computeBoundingBox();
    localBounds = mesh.boundingBox;
  } else {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox?.();
    localBounds = mesh.geometry.boundingBox;
  }
  const finiteBounds = (bounds) => bounds && [
    bounds.min.x, bounds.min.y, bounds.min.z,
    bounds.max.x, bounds.max.y, bounds.max.z,
  ].every(Number.isFinite);
  if (!finiteBounds(localBounds)) {
    throw new Error(`${mesh.name || mesh.uuid || '(unnamed mesh)'} has non-finite local bounds`);
  }

  const ancestry = [];
  for (let parent = mesh.parent; parent; parent = parent.parent) {
    ancestry.unshift({
      name: parent.name || '',
      type: parent.type || '',
      uuid: parent.uuid || null,
    });
  }

  const worldMatrix = new THREE.Matrix4();
  const localMatrix = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  const localScale = new THREE.Vector3();
  const count = mesh.isInstancedMesh ? mesh.count : 1;
  const records = [];

  for (let instanceIndex = 0; instanceIndex < count; instanceIndex++) {
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(instanceIndex, instanceMatrix);
      worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
      localMatrix.multiplyMatrices(mesh.matrix, instanceMatrix);
    } else {
      worldMatrix.copy(mesh.matrixWorld);
      localMatrix.copy(mesh.matrix);
    }

    const bounds = localBounds.clone().applyMatrix4(worldMatrix);
    if (!finiteBounds(bounds)) {
      const identity = mesh.isInstancedMesh
        ? `${mesh.name || mesh.uuid || '(unnamed mesh)'}[${instanceIndex}]`
        : (mesh.name || mesh.uuid || '(unnamed mesh)');
      throw new Error(`${identity} has non-finite world bounds`);
    }
    worldMatrix.decompose(position, quaternion, worldScale);
    localMatrix.decompose(position, quaternion, localScale);
    const instanced = mesh.isInstancedMesh;
    records.push({
      name: instanced && mesh.name ? `${mesh.name}[${instanceIndex}]` : (mesh.name || ''),
      uuid: instanced ? `${mesh.uuid}:${instanceIndex}` : (mesh.uuid || null),
      instanceIndex: instanced ? instanceIndex : null,
      ancestry,
      min: bounds.min.clone(),
      max: bounds.max.clone(),
      size: bounds.getSize(new THREE.Vector3()),
      determinant: worldMatrix.determinant(),
      localScale: localScale.clone(),
      worldScale: worldScale.clone(),
      geo: mesh.geometry.type,
    });
  }
  return records;
}

/** Exclude named rendered effects without substring-hiding physical geometry. */
export function isAuditExcludedEffectMesh(object) {
  if (object?.userData?.sceneAuditIgnore === true) return true;
  const tokens = String(object?.name ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  while (tokens.length && /^\d+$/.test(tokens.at(-1))) tokens.pop();
  if (!tokens.length) return false;
  const has = (token) => tokens.includes(token);
  const tail = tokens.at(-1);
  const hasShape = (...shapes) => shapes.some((shape) => has(shape));
  if (has('sky') && (tail === 'sky' || hasShape('skybox', 'dome', 'sphere', 'plane', 'backdrop', 'background'))) {
    return true;
  }
  if ((has('water') || has('ocean'))
    && (tail === 'water' || hasShape('surface', 'plane', 'sheet', 'jet', 'outflow'))) {
    return true;
  }
  if (has('waterfall') && ['sheet', 'header', 'outflow', 'pool', 'boil', 'mist'].includes(tail)) {
    return true;
  }
  if (has('fog') && (tail === 'fog' || hasShape('volume', 'plane', 'sheet', 'cloud'))) return true;
  if ((has('particle') || has('particles'))
    && (tail === 'particle' || tail === 'particles' || hasShape('system', 'emitter', 'field'))) return true;
  if (has('spray') && (tail === 'spray' || hasShape('plume', 'emitter', 'cloud', 'particle', 'particles'))) {
    return true;
  }
  if (has('smoke') && (tail === 'smoke' || hasShape('cloud', 'puff', 'plume', 'emitter', 'particle', 'particles'))) {
    return true;
  }
  if (has('flame') && (tail === 'flame' || hasShape('plume', 'jet', 'effect', 'particle', 'particles'))) {
    return true;
  }
  if (has('tracer')) return true;
  return has('muzzle') && hasShape('flash', 'flame', 'smoke');
}

/** Collect each rendered mesh object once even when configured roots nest. */
export function collectSceneAuditItems(
  roots,
  THREE,
  {
    isRenderable = isAuditRenderableMesh,
    isExcludedEffect = isAuditExcludedEffectMesh,
    collectMesh = collectAuditMeshItems,
  } = {},
) {
  const items = [];
  const collectionErrors = [];
  const seen = new Set();
  for (const root of roots ?? []) {
    root.updateMatrixWorld?.(true);
    root.traverse((object) => {
      if (seen.has(object)) return;
      seen.add(object);
      if (!isRenderable(object)) return;
      if (isExcludedEffect(object)) return;
      try {
        items.push(...collectMesh(object, THREE));
      } catch (error) {
        collectionErrors.push({
          name: object.name || '',
          uuid: object.uuid || null,
          error: error?.message || String(error),
        });
      }
    });
  }
  return { counted: items.length, items, collectionErrors };
}

/**
 * Identify names that explicitly describe mounted or intentionally suspended
 * visual geometry. Matching semantic tokens keeps `art` from hiding carts and
 * bartenders, and keeps `light` from hiding flight equipment.
 */
export function isMountedAuditName(name = '') {
  const tokens = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const mountedToken = /^(?:lamps?|lights?|chandeliers?|sconces?|pendants?|signs?|banners?|bulbs?|cables?|wires?|ducts?|pipes?|vents?|fans?|screens?|monitors?|tv|pictures?|art|artwork|frames?|mirrors?|shelves?|rails?|curtains?|drapes?|cornices?|beams?|soffits?|ceil|ceiling|roofs?|hooks?|chains?|hang|hanging|balloons?|clouds?|birds?|stars?|moon|sun|glows?|halos?|decals?|handprints?|stains?|shadows?|fenders?|lanyards?|binoculars?|watches?|cuffs?)$/;
  return tokens.some((token) => mountedToken.test(token));
}

/** Exclude structural walking/support surfaces from FLOATING candidates. */
export function isStructuralBaseAuditItem(item = {}) {
  const nearestNamedAncestor = [...(item.ancestry ?? [])]
    .reverse()
    .find(({ name }) => String(name ?? '').trim())?.name;
  const semanticName = String(item.name ?? '').trim() || nearestNamedAncestor || '';
  const tokens = semanticName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const ignorableTail = /^(?:mesh|geometry|plane|surface|base|section|piece|part|\d+)$/;
  while (tokens.length > 1 && ignorableTail.test(tokens.at(-1))) tokens.pop();
  const structuralTail = /^(?:floor|flooring|floorboards?|ground|deck|decking|dock|planks?|slabs?|foundations?|terrain|road|runway|asphalt|pavement|sidewalk|patio|platform|stage|lawn|grass|earth)$/;
  return structuralTail.test(tokens.at(-1) ?? '');
}

/** Assess the nearest footprint-overlapping support without assuming floor Y. */
export function assessAuditSupport(
  items = [],
  {
    supportBelow = 0.12,
    supportAbove = 0.03,
    supportPenetration = 0.12,
    footprintEpsilon = 1e-6,
  } = {},
) {
  const footprintContains = (container, contained, epsilon = 1e-6) => (
    container.min.x <= contained.min.x + epsilon
    && container.max.x >= contained.max.x - epsilon
    && container.min.z <= contained.min.z + epsilon
    && container.max.z >= contained.max.z - epsilon
  );
  return items.map((item) => {
    let nearestTop = null;
    let nearestGap = null;
    let penetratingTop = null;
    let penetratingGap = null;
    let enclosure = null;
    for (const other of items) {
      if (other === item) continue;
      const overlapX = Math.min(other.max.x, item.max.x) - Math.max(other.min.x, item.min.x);
      const overlapZ = Math.min(other.max.z, item.max.z) - Math.max(other.min.z, item.min.z);
      if (overlapX <= footprintEpsilon || overlapZ <= footprintEpsilon) continue;

      const gap = item.min.y - other.max.y;
      if (other.min.y <= item.min.y + footprintEpsilon && gap >= -supportAbove && (
        nearestGap === null || Math.abs(gap) < Math.abs(nearestGap)
      )) {
        nearestTop = other;
        nearestGap = gap;
      }
      if (
        gap < -supportAbove
        && gap >= -supportPenetration
        && other.min.y < item.min.y
        && other.max.y <= item.max.y + supportAbove
        && footprintContains(item, other)
        && (penetratingGap === null || Math.abs(gap) < Math.abs(penetratingGap))
      ) {
        penetratingTop = other;
        penetratingGap = gap;
      }
      if (
        !enclosure
        && footprintContains(other, item)
        && other.min.y <= item.min.y + supportAbove
        && other.max.y >= item.max.y - supportAbove
      ) enclosure = other;
    }

    if (nearestTop && nearestGap <= supportBelow) {
      return { item, supported: true, kind: 'top', supporter: nearestTop, gap: nearestGap };
    }
    if (penetratingTop) {
      return {
        item,
        supported: true,
        kind: 'interpenetrating-top',
        supporter: penetratingTop,
        gap: penetratingGap,
      };
    }
    if (enclosure) {
      return {
        item,
        supported: true,
        kind: 'enclosing',
        supporter: enclosure,
        gap: item.min.y - enclosure.max.y,
      };
    }
    return {
      item,
      supported: false,
      kind: nearestTop ? 'nearest-top' : null,
      supporter: nearestTop,
      gap: nearestGap,
    };
  });
}

/** Map a support assessment to the two advisory support classes. */
export function classifyAuditSupport(
  assessment,
  { suspiciousGap = 0.025, supportBelow = 0.12 } = {},
) {
  if (isStructuralBaseAuditItem(assessment.item)) return null;
  if (!assessment.supported) {
    return {
      cls: 'FLOATING',
      detail: assessment.gap === null
        ? 'nothing under its footprint'
        : `${assessment.gap.toFixed(3)} m above nearest footprint support`,
    };
  }
  if (
    assessment.kind === 'top'
    && assessment.gap > suspiciousGap
    && assessment.gap <= supportBelow
  ) {
    return {
      cls: 'SUSPICIOUS_SUPPORT_GAP',
      detail: `${assessment.gap.toFixed(3)} m above accepted support`,
    };
  }
  return null;
}

/** Return geometry outside the unchanged 12 cm support tolerance. */
export function findUnsupportedAuditItems(items = [], options = {}) {
  return assessAuditSupport(items, options)
    .filter(({ item, supported }) => !supported && !isStructuralBaseAuditItem(item))
    .map(({ item }) => item);
}

/** Classify transform faults that a world-space AABB can normalize away. */
export function classifyAuditTransform(
  transform = {},
  { singularEpsilon = 1e-12, minimumScale = 1e-5, maximumScale = 1e5 } = {},
) {
  const findings = [];
  const determinant = Number(transform.determinant);
  if (Number.isFinite(determinant) && determinant < -singularEpsilon) {
    findings.push({ cls: 'MIRRORED', detail: `negative world determinant ${determinant}` });
  } else if (Number.isFinite(determinant) && Math.abs(determinant) <= singularEpsilon) {
    findings.push({ cls: 'SINGULAR', detail: `near-zero world determinant ${determinant}` });
  }

  const extreme = [];
  for (const [space, scale] of [
    ['local', transform.localScale ?? {}],
    ['world', transform.worldScale ?? {}],
  ]) {
    for (const axis of ['x', 'y', 'z']) {
      const value = Number(scale[axis] ?? 1);
      const magnitude = Math.abs(value);
      if (!Number.isFinite(value) || (
        magnitude > 0
        && (magnitude < minimumScale || magnitude > maximumScale)
      )) extreme.push(`${space}.${axis}=${value}`);
    }
  }
  if (!Number.isFinite(determinant)) extreme.push(`determinant=${determinant}`);
  if (extreme.length) {
    findings.push({
      cls: 'IMPOSSIBLE_TRANSFORM',
      detail: `extreme or non-finite transform component: ${extreme.join(', ')}`,
    });
  }
  return findings;
}

/** Serialize one finding without discarding the geometry needed to inspect it. */
export function createAuditFinding(cls, item, detail, related = null, support = null) {
  const vector = (value = {}) => ({
    x: Number(value.x ?? 0),
    y: Number(value.y ?? 0),
    z: Number(value.z ?? 0),
  });
  const serialize = (value) => ({
    name: value.name || `(unnamed ${value.geo})`,
    uuid: value.uuid || null,
    geometry: value.geo || null,
    ancestry: (value.ancestry ?? []).map((ancestor) => ({
      name: ancestor.name || '',
      type: ancestor.type || '',
      uuid: ancestor.uuid || null,
    })),
    bounds: {
      min: vector(value.min),
      max: vector(value.max),
      size: vector(value.size),
    },
    transform: {
      determinant: value.determinant,
      localScale: vector(value.localScale),
      worldScale: vector(value.worldScale),
    },
  });
  const primary = serialize(item);
  return {
    cls,
    ...primary,
    at: [
      +primary.bounds.min.x.toFixed(2),
      +primary.bounds.min.y.toFixed(2),
      +primary.bounds.min.z.toFixed(2),
    ],
    detail,
    ...(support ? {
      support: {
        supported: Boolean(support.supported),
        kind: support.kind ?? null,
        gap: support.gap ?? null,
        supporter: support.supporter ? {
          name: support.supporter.name || `(unnamed ${support.supporter.geo})`,
          uuid: support.supporter.uuid || null,
        } : null,
      },
    } : {}),
    ...(related ? { related: serialize(related) } : {}),
  };
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
  {
    flat = 0.0006,
    minArea = 0.25,
    maxPlaneItems = 60,
    maxCrowdedPairs = 24,
    maxCrowdedComparisons = 4096,
  } = {},
) {
  const axes = ['x', 'y', 'z'];
  const planes = { x: new Map(), y: new Map(), z: new Map() };
  const key = (value) => Math.floor(value / flat);

  for (let identity = 0; identity < items.length; identity++) {
    const item = items[identity];
    for (const axis of axes) {
      for (const face of ['min', 'max']) {
        const plane = item[face][axis];
        const planeKey = key(plane);
        if (!planes[axis].has(planeKey)) planes[axis].set(planeKey, []);
        planes[axis].get(planeKey).push({ item, identity, face, plane });
      }
    }
  }

  const pairs = [];
  const seenPairs = new Set();
  for (const axis of axes) {
    const [u, v] = axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];
    const evaluatePair = (aFace, bFace) => {
      if (aFace.identity === bFace.identity) return null;

      const a = aFace.item;
      const b = bFace.item;
      if (Math.abs(aFace.plane - bFace.plane) > flat) return null;
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
      if (opposingContact) return null;

      const overlapU = Math.min(a.max[u], b.max[u]) - Math.max(a.min[u], b.min[u]);
      const overlapV = Math.min(a.max[v], b.max[v]) - Math.max(a.min[v], b.min[v]);
      const area = overlapU * overlapV;
      if (overlapU <= 0 || overlapV <= 0 || area < minArea) return null;

      const low = Math.min(aFace.identity, bFace.identity);
      const high = Math.max(aFace.identity, bFace.identity);
      const pairKey = `${axis}:${low}:${high}`;
      if (seenPairs.has(pairKey)) return null;
      seenPairs.add(pairKey);
      return { a, b, axis, area, overlapU, overlapV };
    };

    const uniqueByIdentity = (faces) => {
      const unique = [];
      const identities = new Set();
      for (const face of faces) {
        if (identities.has(face.identity)) continue;
        identities.add(face.identity);
        unique.push(face);
      }
      return unique;
    };
    const processFaces = (leftFaces, rightFaces = null, plane = 0) => {
      const sameGroup = rightFaces === null;
      const uniqueLeft = uniqueByIdentity(leftFaces);
      const uniqueRight = sameGroup ? null : uniqueByIdentity(rightFaces);
      const identities = new Set(uniqueLeft.map(({ identity }) => identity));
      for (const face of uniqueRight ?? []) identities.add(face.identity);
      const groupSize = identities.size;
      if (groupSize < 2) return;
      const possiblePairs = sameGroup
        ? (uniqueLeft.length * (uniqueLeft.length - 1)) / 2
        : uniqueLeft.reduce(
          (total, left) => total + uniqueRight.filter((right) => right.identity !== left.identity).length,
          0,
        );

      if (groupSize > maxPlaneItems) {
        let comparisons = 0;
        let pairsReported = 0;
        crowded: for (let i = 0; i < uniqueLeft.length; i++) {
          const start = sameGroup ? i + 1 : 0;
          const candidates = sameGroup ? uniqueLeft : uniqueRight;
          for (let j = start; j < candidates.length; j++) {
            comparisons++;
            const pair = evaluatePair(uniqueLeft[i], candidates[j]);
            if (pair) {
              pairs.push(pair);
              pairsReported++;
            }
            if (
              comparisons >= maxCrowdedComparisons
              || pairsReported >= maxCrowdedPairs
            ) break crowded;
          }
        }
        const truncated = comparisons < possiblePairs;
        if (pairsReported > 0 || truncated) {
          pairs.push({
            summary: true,
            a: uniqueLeft[0].item,
            axis,
            plane,
            groupSize,
            possiblePairs,
            comparisons,
            pairsReported,
            truncated,
          });
        }
        return;
      }

      for (let i = 0; i < leftFaces.length; i++) {
        const start = sameGroup ? i + 1 : 0;
        const candidates = sameGroup ? leftFaces : rightFaces;
        for (let j = start; j < candidates.length; j++) {
          const pair = evaluatePair(leftFaces[i], candidates[j]);
          if (pair) pairs.push(pair);
        }
      }
    };

    const axisPlanes = planes[axis];
    const planeKeys = [...axisPlanes.keys()].sort((a, b) => a - b);
    for (const planeKey of planeKeys) {
      const group = axisPlanes.get(planeKey);
      processFaces(group, null, planeKey * flat);
      const adjacent = axisPlanes.get(planeKey + 1);
      if (adjacent) processFaces(group, adjacent, (planeKey + 1) * flat);
    }
  }
  return pairs;
}
