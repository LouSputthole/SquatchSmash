import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_AXES = Object.freeze({
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+y': new THREE.Vector3(0, 1, 0),
  '-y': new THREE.Vector3(0, -1, 0),
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1),
});
const CONTRACT_KEYS = new Set(['id', 'surface', 'upright', 'facing', 'room', 'seams']);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function vector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(finite)) {
    throw new TypeError(`${label} must be three finite numbers`);
  }
  return value;
}

function limit(value, fallback, label) {
  const next = value ?? fallback;
  if (!finite(next) || next < 0) throw new TypeError(`${label} must be a nonnegative number`);
  return next;
}

function axis(value, fallback, label) {
  const next = value ?? fallback;
  if (!(next in LOCAL_AXES)) throw new TypeError(`${label} has unknown axis ${JSON.stringify(next)}`);
  return next;
}

function normalizeContract(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('Placement contract must be an object');
  }
  const unknown = Object.keys(spec).filter((key) => !CONTRACT_KEYS.has(key));
  if (unknown.length) throw new TypeError(`Placement contract has unknown key(s): ${unknown.join(', ')}`);
  if (typeof spec.id !== 'string' || !spec.id.trim()) {
    throw new TypeError('Placement contract needs a non-empty id');
  }
  const normalized = { id: spec.id.trim() };

  if (spec.surface !== undefined) {
    const surface = spec.surface;
    if (!surface || typeof surface !== 'object' || Array.isArray(surface)) {
      throw new TypeError(`${normalized.id} surface must be an object`);
    }
    if (!['floor', 'wall'].includes(surface.kind)) {
      throw new TypeError(`${normalized.id} surface kind must be floor or wall`);
    }
    const common = {
      kind: surface.kind,
      maxGap: limit(surface.maxGap, 0.04, `${normalized.id} surface maxGap`),
      maxPenetration: limit(
        surface.maxPenetration,
        0.02,
        `${normalized.id} surface maxPenetration`,
      ),
    };
    if (surface.kind === 'floor') {
      if (surface.support !== undefined && (typeof surface.support !== 'string' || !surface.support)) {
        throw new TypeError(`${normalized.id} floor support must be a non-empty object name`);
      }
      if (surface.support === undefined && !finite(surface.y)) {
        throw new TypeError(`${normalized.id} floor surface needs support or y`);
      }
      normalized.surface = {
        ...common,
        ...(surface.support === undefined ? { y: surface.y } : { support: surface.support }),
        minFootprintOverlap: limit(
          surface.minFootprintOverlap,
          0.0025,
          `${normalized.id} minimum footprint overlap`,
        ),
      };
    } else {
      if (!['x', 'z'].includes(surface.axis) || !finite(surface.coordinate)) {
        throw new TypeError(`${normalized.id} wall needs x/z axis and finite coordinate`);
      }
      if (!['positive', 'negative'].includes(surface.side)) {
        throw new TypeError(`${normalized.id} wall side must be positive or negative`);
      }
      normalized.surface = {
        ...common,
        axis: surface.axis,
        coordinate: surface.coordinate,
        side: surface.side,
      };
    }
  }

  if (spec.upright !== undefined) normalized.upright = {
    axis: axis(spec.upright.axis, '+y', `${normalized.id} upright`),
    maxDegrees: limit(spec.upright.maxDegrees, 3, `${normalized.id} upright maxDegrees`),
  };

  if (spec.facing !== undefined) {
    vector(spec.facing.direction, `${normalized.id} facing direction`);
    normalized.facing = {
      axis: axis(spec.facing.axis, '+z', `${normalized.id} facing`),
      direction: [...spec.facing.direction],
      maxDegrees: limit(spec.facing.maxDegrees, 5, `${normalized.id} facing maxDegrees`),
      horizontal: spec.facing.horizontal !== false,
    };
  }

  if (spec.room !== undefined) {
    vector(spec.room.min, `${normalized.id} room min`);
    vector(spec.room.max, `${normalized.id} room max`);
    normalized.room = {
      min: [...spec.room.min],
      max: [...spec.room.max],
      tolerance: limit(spec.room.tolerance, 0.02, `${normalized.id} room tolerance`),
    };
  }

  if (spec.seams !== undefined) {
    if (!Array.isArray(spec.seams) || spec.seams.length === 0) {
      throw new TypeError(`${normalized.id} seams must be a non-empty array`);
    }
    normalized.seams = spec.seams.map((seam, index) => {
      if (!seam || typeof seam.target !== 'string' || !seam.target) {
        throw new TypeError(`${normalized.id} seam ${index} needs a target object name`);
      }
      return {
        target: seam.target,
        maxGap: limit(seam.maxGap, 0.03, `${normalized.id} seam ${index} maxGap`),
      };
    });
  }
  return normalized;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Attach a serializable, reviewable spatial invariant to an authored prop. */
export function markSemanticPlacement(object, spec) {
  if (!object?.isObject3D) throw new TypeError('Cannot mark semantic placement on a non-Object3D');
  object.userData ??= {};
  object.userData.semanticPlacement = deepFreeze(normalizeContract(spec));
  return object;
}

function boundsOf(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function sceneRoot(object) {
  let root = object;
  while (root.parent) root = root.parent;
  return root;
}

function finding(spec, rule, message, measured = null, maximum = null) {
  return { id: spec.id, rule, message, measured, maximum };
}

function boxGap(left, right) {
  const gaps = ['x', 'y', 'z'].map((key) => Math.max(
    right.min[key] - left.max[key],
    left.min[key] - right.max[key],
    0,
  ));
  return Math.hypot(...gaps);
}

function footprintOverlap(left, right) {
  const x = Math.max(0, Math.min(left.max.x, right.max.x) - Math.max(left.min.x, right.min.x));
  const z = Math.max(0, Math.min(left.max.z, right.max.z) - Math.max(left.min.z, right.min.z));
  return x * z;
}

function directionOf(object, localAxis, horizontal) {
  const direction = LOCAL_AXES[localAxis].clone().transformDirection(object.matrixWorld);
  if (horizontal) direction.y = 0;
  return direction.normalize();
}

/** Audit one marked object. Findings are stable data, not preformatted console output. */
export function auditSemanticPlacement(object, { root = sceneRoot(object) } = {}) {
  const spec = object?.userData?.semanticPlacement;
  if (!spec) return [];
  const bounds = boundsOf(object);
  if (bounds.isEmpty()) return [finding(spec, 'rendered-bounds', 'marked object has no rendered bounds')];
  const findings = [];

  if (spec.surface?.kind === 'floor') {
    const support = spec.surface.support ? root.getObjectByName(spec.surface.support) : null;
    if (spec.surface.support && !support) {
      findings.push(finding(spec, 'surface-resolution', `missing support ${spec.surface.support}`));
    } else {
      const supportBounds = support ? boundsOf(support) : null;
      const surfaceY = supportBounds?.max.y ?? spec.surface.y;
      const gap = bounds.min.y - surfaceY;
      if (supportBounds) {
        const overlap = footprintOverlap(bounds, supportBounds);
        if (overlap < spec.surface.minFootprintOverlap) findings.push(finding(
          spec,
          'support-footprint',
          `footprint overlaps ${spec.surface.support} by only ${overlap.toFixed(4)} m2`,
          overlap,
          spec.surface.minFootprintOverlap,
        ));
      }
      if (gap > spec.surface.maxGap) findings.push(finding(
        spec, 'surface-gap', `floats ${gap.toFixed(4)} m above floor support`, gap, spec.surface.maxGap,
      ));
      if (gap < -spec.surface.maxPenetration) findings.push(finding(
        spec,
        'surface-penetration',
        `penetrates floor support by ${(-gap).toFixed(4)} m`,
        -gap,
        spec.surface.maxPenetration,
      ));
    }
  }

  if (spec.surface?.kind === 'wall') {
    const face = spec.surface.side === 'positive'
      ? bounds.min[spec.surface.axis]
      : bounds.max[spec.surface.axis];
    const gap = spec.surface.side === 'positive'
      ? face - spec.surface.coordinate
      : spec.surface.coordinate - face;
    if (gap > spec.surface.maxGap) findings.push(finding(
      spec, 'surface-gap', `floats ${gap.toFixed(4)} m away from wall`, gap, spec.surface.maxGap,
    ));
    if (gap < -spec.surface.maxPenetration) findings.push(finding(
      spec,
      'surface-penetration',
      `penetrates wall by ${(-gap).toFixed(4)} m`,
      -gap,
      spec.surface.maxPenetration,
    ));
  }

  if (spec.upright) {
    const degrees = THREE.MathUtils.radToDeg(
      directionOf(object, spec.upright.axis, false).angleTo(WORLD_UP),
    );
    if (degrees > spec.upright.maxDegrees) findings.push(finding(
      spec, 'upright', `local ${spec.upright.axis} tilts ${degrees.toFixed(2)} degrees`, degrees,
      spec.upright.maxDegrees,
    ));
  }

  if (spec.facing) {
    const actual = directionOf(object, spec.facing.axis, spec.facing.horizontal);
    const expected = new THREE.Vector3(...spec.facing.direction);
    if (spec.facing.horizontal) expected.y = 0;
    expected.normalize();
    const degrees = THREE.MathUtils.radToDeg(actual.angleTo(expected));
    if (degrees > spec.facing.maxDegrees) findings.push(finding(
      spec, 'facing', `faces ${degrees.toFixed(2)} degrees away from its authored direction`, degrees,
      spec.facing.maxDegrees,
    ));
  }

  if (spec.room) {
    const room = new THREE.Box3(
      new THREE.Vector3(...spec.room.min).addScalar(-spec.room.tolerance),
      new THREE.Vector3(...spec.room.max).addScalar(spec.room.tolerance),
    );
    if (!room.containsBox(bounds)) findings.push(finding(
      spec, 'room-bounds', 'rendered bounds leave the authored room envelope', null,
      spec.room.tolerance,
    ));
  }

  for (const seam of spec.seams ?? []) {
    const target = root.getObjectByName(seam.target);
    if (!target) {
      findings.push(finding(spec, 'seam-resolution', `missing seam target ${seam.target}`));
      continue;
    }
    const gap = boxGap(bounds, boundsOf(target));
    if (gap > seam.maxGap) findings.push(finding(
      spec, 'seam-gap', `is ${gap.toFixed(4)} m from ${seam.target}`, gap, seam.maxGap,
    ));
  }
  return findings;
}

/** Traverse a built scene and audit every explicit semantic placement marker. */
export function auditSceneSemanticPlacements(root) {
  if (!root?.isObject3D) throw new TypeError('Scene semantic placement audit requires an Object3D root');
  const marked = [];
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (object.userData?.semanticPlacement) marked.push(object);
  });
  return {
    audited: marked.map((object) => object.userData.semanticPlacement.id).sort(),
    findings: marked.flatMap((object) => auditSemanticPlacement(object, { root })),
  };
}
