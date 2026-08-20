/**
 * Headless Adapter from authored THREE scene roots to plain geometry-gate
 * records. Classification policy belongs to geometry-gate.mjs; this Module
 * only owns render eligibility, stable semantic identity, and exact bounds.
 */

import {
  isAuditExcludedEffectMesh,
  isAuditRenderableMesh,
  isStructuralBaseAuditItem,
} from './scene-audit-scenes.mjs';

export const GEOMETRY_GATE_DEGENERATE_HALF_EXTENT = 1e-6;
export const GEOMETRY_GATE_HIDDEN_INSTANCE_MAX_SCALE = 1e-3;

const AXES = Object.freeze(['x', 'y', 'z']);
const OPTIONAL_BOOLEAN_FIELDS = Object.freeze([
  'supports',
  'fixedSupportAnchor',
  'checkSupport',
  'checkWallEmbed',
  'overlap',
]);
const GEOMETRY_GATE_METADATA_KEYS = new Set([
  'id',
  'assemblyId',
  'assembly',
  'instanceAssemblyIds',
  'instanceAssemblyPrefix',
  'supportAssemblyId',
  'role',
  'tags',
  'tag',
  'wall',
  'wallAxis',
  'structural',
  ...OPTIONAL_BOOLEAN_FIELDS,
]);

const lexicalCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const stableString = (value) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);
const encodeSegment = (value) => encodeURIComponent(String(value));
const rootPathFor = (label) => `root:${encodeSegment(label)}`;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function gateMetadata(object) {
  const userData = object?.userData && typeof object.userData === 'object'
    ? object.userData
    : {};
  if (!Object.prototype.hasOwnProperty.call(userData, 'geometryGate')) {
    return { userData, nested: {} };
  }
  const nested = userData.geometryGate;
  if (!isPlainObject(nested)) {
    throw new TypeError('userData.geometryGate must be a plain object');
  }
  const unknown = Object.keys(nested)
    .filter((key) => !GEOMETRY_GATE_METADATA_KEYS.has(key))
    .sort();
  if (unknown.length > 0) {
    throw new TypeError(`userData.geometryGate has unknown key(s): ${unknown.join(', ')}`);
  }
  return { userData, nested };
}

function metadataValue(object, key) {
  return metadataEntry(object, key)?.value;
}

function metadataEntry(object, key) {
  const { userData, nested } = gateMetadata(object);
  const legacyKey = `geometryGate${key[0].toUpperCase()}${key.slice(1)}`;
  if (nested[key] !== undefined && nested[key] !== null) {
    return {
      value: nested[key],
      source: object,
      origin: `userData.geometryGate.${key}`,
    };
  }
  if (userData[legacyKey] !== undefined && userData[legacyKey] !== null) {
    return {
      value: userData[legacyKey],
      source: object,
      origin: `userData.${legacyKey}`,
    };
  }
  return null;
}

function metadataChain(object, root) {
  const chain = [];
  for (let current = object; current; current = current.parent) {
    chain.push(current);
    if (current === root) break;
  }
  return chain;
}

function inheritedMetadataValue(object, root, key) {
  return inheritedMetadataEntry(object, root, key)?.value;
}

function inheritedMetadataEntry(object, root, key) {
  for (const current of metadataChain(object, root)) {
    const entry = metadataEntry(current, key);
    if (entry) return entry;
  }
  return null;
}

function pathMetadataId(object) {
  const userData = object?.userData && typeof object.userData === 'object'
    ? object.userData
    : {};
  const nested = isPlainObject(userData.geometryGate) ? userData.geometryGate : {};
  return stableString(nested.id) ?? stableString(userData.geometryGateId);
}

function semanticSegmentBase(object) {
  // Path construction must remain available to identify a malformed sibling;
  // the strict full-block validation happens when that mesh is collected.
  const explicitId = pathMetadataId(object);
  if (explicitId) return `id=${encodeSegment(explicitId)}`;
  const name = stableString(object?.name);
  if (name) return `name=${encodeSegment(name)}`;
  return `type=${encodeSegment(stableString(object?.type) ?? 'Object3D')}`;
}

function siblingOrdinal(object) {
  const siblings = Array.isArray(object?.parent?.children) ? object.parent.children : [];
  const base = semanticSegmentBase(object);
  let ordinal = 0;
  for (const sibling of siblings) {
    if (sibling === object) return ordinal;
    if (semanticSegmentBase(sibling) === base) ordinal += 1;
  }
  return ordinal;
}

function createPathResolver(root, rootPath) {
  const paths = new WeakMap([[root, rootPath]]);
  const resolve = (object) => {
    if (!object || object === root) return rootPath;
    const cached = paths.get(object);
    if (cached) return cached;
    const parentPath = object.parent ? resolve(object.parent) : rootPath;
    const path = `${parentPath}/${semanticSegmentBase(object)}#${siblingOrdinal(object)}`;
    paths.set(object, path);
    return path;
  };
  return resolve;
}

function plainBounds(minimum, maximum, identity) {
  const min = {};
  const max = {};
  const size = {};
  for (const axis of AXES) {
    let low = minimum?.[axis];
    let high = maximum?.[axis];
    if (
      typeof low !== 'number'
      || typeof high !== 'number'
      || !Number.isFinite(low)
      || !Number.isFinite(high)
    ) {
      throw new Error(`${identity} has non-finite ${axis} bounds`);
    }
    if (high < low) throw new Error(`${identity} has inverted ${axis} bounds`);

    // PlaneGeometry and other legitimate support surfaces can have an exact
    // zero-width AABB axis. The gate requires positive boxes, so expand only
    // that axis symmetrically by a fixed micron-scale amount. Centimetre-scale
    // thresholds cannot observe this deterministic normalization.
    if (high === low) {
      low -= GEOMETRY_GATE_DEGENERATE_HALF_EXTENT;
      high += GEOMETRY_GATE_DEGENERATE_HALF_EXTENT;
    }
    min[axis] = low;
    max[axis] = high;
    size[axis] = high - low;
  }
  return { min, max, size };
}

function semanticTokens(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function normalizedTags(object, root = object) {
  const tags = [];
  for (const current of metadataChain(object, root)) {
    const raw = metadataValue(current, 'tags') ?? metadataValue(current, 'tag');
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      const tag = stableString(value);
      if (tag) tags.push(tag);
    }
  }
  return [...new Set(tags)].sort(lexicalCompare);
}

function optionalBooleanValue(object, root, key) {
  return optionalBooleanPolicy(object, root, key)?.value;
}

function optionalBooleanPolicy(object, root, key) {
  const authored = inheritedMetadataEntry(object, root, key);
  if (authored) {
    if (typeof authored.value !== 'boolean') {
      throw new TypeError(`geometryGate ${key} must be a boolean`);
    }
    return {
      ...authored,
      inherited: authored.source !== object,
      authored: true,
    };
  }
  return typeof object?.[key] === 'boolean'
    ? {
      value: object[key],
      source: object,
      origin: `object.${key}`,
      inherited: false,
      authored: true,
    }
    : null;
}

function optionalWallAxis(object, root) {
  const authored = inheritedMetadataValue(object, root, 'wallAxis');
  const value = authored !== undefined
    ? authored
    : (typeof object?.wallAxis === 'string' ? object.wallAxis : undefined);
  if (value === undefined) return undefined;
  if (value !== 'x' && value !== 'z') {
    throw new TypeError('geometryGate wallAxis must be "x" or "z"');
  }
  return value;
}

function semanticFlags({ object, root, name, ancestry, role, tags }) {
  const explicitWall = optionalBooleanValue(object, root, 'wall');
  const explicitStructural = optionalBooleanValue(object, root, 'structural');
  const nearestAncestryName = [...ancestry]
    .reverse()
    .find(({ name: ancestorName }) => stableString(ancestorName))?.name;
  const tokens = semanticTokens([
    nearestAncestryName,
    name,
    role,
    ...tags,
  ].filter(Boolean).join(' '));
  const wallFixtureTokens = new Set([
    'art', 'clock', 'decal', 'fixture', 'frame', 'lamp', 'lantern', 'light',
    'mirror', 'outlet', 'picture', 'sconce', 'shelf', 'sign', 'switch',
  ]);
  const wallTokens = new Set(['headwall', 'partition', 'partitions', 'wall', 'walls']);
  const inferredWall = tokens.some((token) => wallTokens.has(token))
    && !tokens.some((token) => wallFixtureTokens.has(token));
  const roleTokens = new Set(semanticTokens(role));
  const tagTokens = new Set(tags.flatMap(semanticTokens));
  const explicitStructuralRole = ['floor', 'ground', 'structural', 'support', 'terrain']
    .some((token) => roleTokens.has(token) || tagTokens.has(token));
  return {
    wall: typeof explicitWall === 'boolean' ? explicitWall : inferredWall,
    structural: typeof explicitStructural === 'boolean'
      ? explicitStructural
      : explicitStructuralRole || isStructuralBaseAuditItem({ name, ancestry }),
  };
}

function explicitBooleanFields(object, root = object, resolvePath = () => null) {
  const values = {};
  const suppressionProvenance = {};
  for (const field of OPTIONAL_BOOLEAN_FIELDS) {
    const policy = optionalBooleanPolicy(object, root, field);
    if (!policy) continue;
    values[field] = policy.value;
    if (
      policy.authored
      && policy.value === false
      && (field === 'overlap' || field === 'checkSupport')
    ) {
      const sourceId = resolvePath(policy.source);
      if (!sourceId) {
        throw new TypeError(`geometryGate ${field} suppression requires a stable source path`);
      }
      suppressionProvenance[field] = {
        sourceId,
        scope: policy.inherited ? 'inherited' : 'direct',
        origin: policy.origin,
      };
    }
  }
  return { values, suppressionProvenance };
}

function assemblyIdFor(object, root, rootPath) {
  const raw = stableString(inheritedMetadataValue(object, root, 'assemblyId'))
    ?? stableString(inheritedMetadataValue(object, root, 'assembly'));
  return raw ? `${rootPath}/assembly:${encodeSegment(raw)}` : null;
}

function supportAssemblyIdFor(object, root, rootPath) {
  const raw = inheritedMetadataValue(object, root, 'supportAssemblyId');
  if (raw === undefined || raw === null) return null;
  const id = stableString(raw);
  if (!id) {
    throw new TypeError('geometryGate supportAssemblyId must be a stable non-empty string');
  }
  return `${rootPath}/support-assembly:${encodeSegment(id)}`;
}

function instanceAssemblyPrefixFor(object, root) {
  const raw = inheritedMetadataValue(object, root, 'instanceAssemblyPrefix');
  if (raw === undefined || raw === null) return null;
  const prefix = stableString(raw);
  if (!prefix) {
    throw new TypeError('geometryGate instanceAssemblyPrefix must be a stable non-empty string');
  }
  return prefix;
}

function instanceAssemblyIdsFor(object, root, assemblyId, instanceAssemblyPrefix) {
  const entry = inheritedMetadataEntry(object, root, 'instanceAssemblyIds');
  if (!entry) return null;
  if (!object.isInstancedMesh) {
    throw new TypeError('geometryGate instanceAssemblyIds is only valid on an InstancedMesh');
  }
  if (!Array.isArray(entry.value)) {
    throw new TypeError('geometryGate instanceAssemblyIds must be an array');
  }
  if (assemblyId || instanceAssemblyPrefix) {
    throw new TypeError(
      'geometryGate instanceAssemblyIds cannot be combined with assemblyId, assembly, or instanceAssemblyPrefix',
    );
  }
  const count = Number(object.count);
  if (Number.isInteger(count) && count >= 1 && entry.value.length !== count) {
    throw new TypeError(
      `geometryGate instanceAssemblyIds length ${entry.value.length} must equal InstancedMesh count ${count}`,
    );
  }
  return entry.value.map((value, index) => {
    const id = stableString(value);
    if (!id) {
      throw new TypeError(
        `geometryGate instanceAssemblyIds[${index}] must be a stable non-empty string`,
      );
    }
    return id;
  });
}

function ancestryFor(object, root, resolvePath) {
  const ancestry = [];
  for (let current = object?.parent; current; current = current.parent) {
    ancestry.unshift({
      id: resolvePath(current),
      name: stableString(current.name) ?? '',
      type: stableString(current.type) ?? 'Object3D',
    });
    if (current === root) break;
  }
  return ancestry;
}

function nearestNamedGroupIdFor(object, root, resolvePath) {
  for (let current = object?.parent; current && current !== root; current = current.parent) {
    if ((current.isGroup || current.type === 'Group') && stableString(current.name)) {
      return resolvePath(current);
    }
  }
  return null;
}

function baseMeshRecord(mesh, root, rootLabel, resolvePath) {
  const objectPath = resolvePath(mesh);
  const parentId = mesh === root ? null : resolvePath(mesh.parent ?? root);
  const ancestry = ancestryFor(mesh, root, resolvePath);
  const role = stableString(inheritedMetadataValue(mesh, root, 'role'));
  const tags = normalizedTags(mesh, root);
  const assemblyId = assemblyIdFor(mesh, root, rootPathFor(rootLabel));
  const supportAssemblyId = supportAssemblyIdFor(mesh, root, rootPathFor(rootLabel));
  const instanceAssemblyPrefix = mesh.isInstancedMesh
    ? instanceAssemblyPrefixFor(mesh, root)
    : null;
  const instanceAssemblyIds = instanceAssemblyIdsFor(
    mesh,
    root,
    assemblyId,
    instanceAssemblyPrefix,
  );
  const flags = semanticFlags({ object: mesh, root, name: mesh.name, ancestry, role, tags });
  const wallAxis = optionalWallAxis(mesh, root);
  if (wallAxis !== undefined && !flags.wall) {
    throw new TypeError('geometryGate wallAxis is only valid on a wall');
  }
  const { values: explicit, suppressionProvenance } = explicitBooleanFields(
    mesh,
    root,
    resolvePath,
  );
  const fixedSupportAnchor = explicit.fixedSupportAnchor
    ?? (flags.wall || flags.structural);
  return {
    kind: 'mesh',
    rootLabel,
    objectPath,
    parentId,
    nearestNamedGroupId: nearestNamedGroupIdFor(mesh, root, resolvePath),
    assemblyId,
    supportAssemblyId,
    instanceAssemblyIds,
    instanceAssemblyPrefix,
    name: stableString(mesh.name) ?? '',
    objectKind: stableString(mesh.type) ?? (mesh.isInstancedMesh ? 'InstancedMesh' : 'Mesh'),
    geometryType: stableString(mesh.geometry?.type),
    role,
    tags,
    ...flags,
    ...(wallAxis === undefined ? {} : { wallAxis }),
    ...explicit,
    fixedSupportAnchor,
    ...(Object.keys(suppressionProvenance).length > 0 ? { suppressionProvenance } : {}),
  };
}

function localMeshBounds(mesh) {
  if (mesh.isSkinnedMesh && typeof mesh.computeBoundingBox === 'function') {
    mesh.computeBoundingBox();
    return mesh.boundingBox;
  }
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox?.();
  return mesh.geometry.boundingBox;
}

function meshRecords(mesh, base, THREE, collectionErrors) {
  const { rootLabel } = base;
  const { instanceAssemblyIds, ...recordBase } = base;
  try {
    mesh.updateWorldMatrix?.(true, false);
  } catch (error) {
    collectionErrors.push(collectionError({
      code: 'mesh_world_matrix',
      rootLabel,
      semanticPath: base.objectPath,
      name: base.name,
      error,
    }));
    return [];
  }

  let localBounds;
  try {
    localBounds = localMeshBounds(mesh);
    plainBounds(localBounds?.min, localBounds?.max, base.objectPath);
  } catch (error) {
    collectionErrors.push(collectionError({
      code: 'mesh_local_bounds',
      rootLabel,
      semanticPath: base.objectPath,
      name: base.name,
      error,
    }));
    return [];
  }

  const count = mesh.isInstancedMesh ? Number(mesh.count) : 1;
  if (!Number.isInteger(count) || count < 1) {
    collectionErrors.push(collectionError({
      code: 'mesh_instance_count',
      rootLabel,
      semanticPath: base.objectPath,
      name: base.name,
      error: new Error(`${base.objectPath} has invalid instance count`),
    }));
    return [];
  }

  const records = [];
  const instanceMatrix = new THREE.Matrix4();
  const instancePosition = new THREE.Vector3();
  const instanceRotation = new THREE.Quaternion();
  const instanceScale = new THREE.Vector3();
  const worldMatrix = new THREE.Matrix4();
  for (let instanceIndex = 0; instanceIndex < count; instanceIndex += 1) {
    const index = mesh.isInstancedMesh ? instanceIndex : null;
    const id = index === null ? base.objectPath : `${base.objectPath}/instance:${index}`;
    const instanceAssemblyId = index !== null && instanceAssemblyIds
      ? `${rootPathFor(rootLabel)}/assembly:${encodeSegment(instanceAssemblyIds[index])}`
      : index !== null && !base.assemblyId && base.instanceAssemblyPrefix
        ? `${rootPathFor(rootLabel)}/assembly:${encodeSegment(base.instanceAssemblyPrefix)}-${index}`
        : base.assemblyId;
    try {
      if (index === null) {
        worldMatrix.copy(mesh.matrixWorld);
      } else {
        mesh.getMatrixAt(index, instanceMatrix);
        if (!instanceMatrix.elements.every(Number.isFinite)) {
          throw new Error(id + " has a non-finite instance matrix");
        }
        instanceMatrix.decompose(instancePosition, instanceRotation, instanceScale);
        if (!AXES.every((axis) => Number.isFinite(instanceScale[axis]))) {
          throw new Error(id + " has a non-finite decomposed instance scale");
        }
        // Runtime destruction/hide paths use an effectively-zero instance as
        // a visibility sentinel. It has no visible geometry to audit. Require
        // all three LOCAL scales to be tiny so ordinary miniature or flat
        // non-uniform instances remain in the gate.
        if (AXES.every((axis) => (
          Math.abs(instanceScale[axis]) <= Math.fround(GEOMETRY_GATE_HIDDEN_INSTANCE_MAX_SCALE)
        ))) continue;
        worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
      }
      const bounds = localBounds.clone().applyMatrix4(worldMatrix);
      const normalized = plainBounds(bounds.min, bounds.max, id);
      records.push({
        ...recordBase,
        id,
        semanticPath: id,
        assemblyId: instanceAssemblyId,
        ownerId: instanceAssemblyId ?? id,
        instanceIndex: index,
        ...normalized,
      });
    } catch (error) {
      collectionErrors.push(collectionError({
        code: 'mesh_world_bounds',
        rootLabel,
        semanticPath: id,
        name: base.name,
        instanceIndex: index,
        error,
      }));
    }
  }
  return records;
}

function collectionError({
  code,
  rootLabel = null,
  semanticPath = null,
  name = '',
  instanceIndex = null,
  error,
}) {
  return {
    code,
    rootLabel,
    semanticPath,
    name,
    instanceIndex,
    error: error?.message || String(error),
  };
}

function normalizeRootEntries(roots, collectionErrors) {
  const candidates = [];
  const labelCounts = new Map();
  for (const entry of roots ?? []) {
    const label = stableString(entry?.label);
    if (!label) {
      collectionErrors.push(collectionError({
        code: 'root_label',
        error: new Error('geometry root requires a stable non-empty label'),
      }));
      continue;
    }
    if (!entry?.root || typeof entry.root.traverse !== 'function') {
      collectionErrors.push(collectionError({
        code: 'root_object',
        rootLabel: label,
        error: new Error(`${label} geometry root must provide a traversable Object3D`),
      }));
      continue;
    }
    candidates.push({ label, root: entry.root });
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  const duplicateLabels = [...labelCounts]
    .filter(([, count]) => count > 1)
    .map(([label]) => label)
    .sort(lexicalCompare);
  for (const label of duplicateLabels) {
    collectionErrors.push(collectionError({
      code: 'duplicate_root_label',
      rootLabel: label,
      error: new Error(`duplicate geometry root label: ${label}`),
    }));
  }
  return candidates
    .filter(({ label }) => labelCounts.get(label) === 1)
    .sort((left, right) => lexicalCompare(left.label, right.label));
}

function colliderMetadata(collider) {
  const role = stableString(metadataValue(collider, 'role')) ?? stableString(collider?.role);
  const rawTags = metadataValue(collider, 'tags')
    ?? metadataValue(collider, 'tag')
    ?? collider?.tags;
  const values = Array.isArray(rawTags) ? rawTags : [rawTags];
  const tags = [...new Set(values.map(stableString).filter(Boolean))].sort(lexicalCompare);
  return { role, tags };
}

function colliderIdentity(collider) {
  return stableString(collider?.id)
    ?? stableString(metadataValue(collider, 'id'))
    ?? stableString(collider?.tag)
    ?? stableString(collider?.name);
}

function normalizedCollider(collider, defaultRootLabel) {
  const rawId = colliderIdentity(collider);
  if (!rawId) throw new Error('collider requires a stable string id, tag, or name');
  const rootLabel = stableString(collider?.rootLabel)
    ?? stableString(collider?.label)
    ?? defaultRootLabel;
  if (!rootLabel) throw new Error(`${rawId} collider requires a root label`);
  const rootPath = rootPathFor(rootLabel);
  const id = `${rootPath}/collider:${encodeSegment(rawId)}`;
  const minimum = collider?.min ?? collider?.bounds?.min ?? collider?.box?.min;
  const maximum = collider?.max ?? collider?.bounds?.max ?? collider?.box?.max;
  const bounds = plainBounds(minimum, maximum, id);
  const { role, tags } = colliderMetadata(collider);
  const assemblyRaw = stableString(metadataValue(collider, 'assemblyId'))
    ?? stableString(metadataValue(collider, 'assembly'))
    ?? stableString(collider?.assemblyId);
  const assemblyId = assemblyRaw
    ? `${rootPath}/assembly:${encodeSegment(assemblyRaw)}`
    : null;
  const name = stableString(collider?.name) ?? rawId;
  const ancestry = [];
  const flags = semanticFlags({ object: collider, root: collider, name, ancestry, role, tags });
  const wallAxis = optionalWallAxis(collider, collider);
  if (wallAxis !== undefined && !flags.wall) {
    throw new TypeError('geometryGate wallAxis is only valid on a wall');
  }
  const { values: explicit, suppressionProvenance } = explicitBooleanFields(
    collider,
    collider,
    () => id,
  );
  return {
    kind: 'collider',
    id,
    semanticPath: id,
    objectPath: id,
    rootLabel,
    parentId: stableString(collider?.parentId) ?? rootPath,
    nearestNamedGroupId: stableString(collider?.nearestNamedGroupId),
    assemblyId,
    ownerId: assemblyId ?? id,
    name,
    instanceIndex: null,
    objectKind: stableString(collider?.objectKind) ?? 'Collider',
    geometryType: null,
    role,
    tags,
    ...flags,
    ...(wallAxis === undefined ? {} : { wallAxis }),
    ...explicit,
    fixedSupportAnchor: explicit.fixedSupportAnchor ?? true,
    ...(Object.keys(suppressionProvenance).length > 0 ? { suppressionProvenance } : {}),
    ...bounds,
  };
}

function collectColliders(colliders, rootEntries, collectionErrors) {
  const rootLabels = [...new Set(rootEntries.map(({ label }) => label))];
  const defaultRootLabel = rootLabels.length === 1 ? rootLabels[0] : null;
  const candidates = [];
  for (const collider of colliders ?? []) {
    try {
      candidates.push(normalizedCollider(collider, defaultRootLabel));
    } catch (error) {
      collectionErrors.push(collectionError({
        code: 'collider',
        rootLabel: stableString(collider?.rootLabel) ?? stableString(collider?.label),
        name: stableString(collider?.name) ?? stableString(collider?.tag) ?? '',
        error,
      }));
    }
  }

  const byId = new Map();
  for (const candidate of candidates) {
    const matches = byId.get(candidate.id) ?? [];
    matches.push(candidate);
    byId.set(candidate.id, matches);
  }
  const records = [];
  for (const [id, matches] of [...byId].sort(([left], [right]) => lexicalCompare(left, right))) {
    if (matches.length === 1) {
      records.push(matches[0]);
      continue;
    }
    collectionErrors.push(collectionError({
      code: 'duplicate_collider_id',
      rootLabel: matches[0].rootLabel,
      semanticPath: id,
      name: matches[0].name,
      error: new Error(`duplicate collider id: ${id}`),
    }));
  }
  return records;
}

/**
 * Collect one deterministic, serializable geometry snapshot.
 *
 * `roots` is an array of `{ label, root }`. `colliders` may contain normalized
 * `{ id|tag|name, rootLabel?, min, max }` records. `includeObject` can narrow
 * rendered meshes, but cannot opt hidden or semantic VFX meshes back in.
 * Collection defects are returned in `collectionErrors`; one bad instance does
 * not erase its valid siblings.
 */
export function collectGeometrySnapshot({
  roots = [],
  colliders = [],
  THREE,
  includeObject = () => true,
  isRenderable = isAuditRenderableMesh,
  isExcludedEffect = isAuditExcludedEffectMesh,
} = {}) {
  if (!THREE?.Matrix4) throw new TypeError('collectGeometrySnapshot requires THREE');
  if (typeof includeObject !== 'function') {
    throw new TypeError('collectGeometrySnapshot includeObject must be a function');
  }

  const collectionErrors = [];
  const rootEntries = normalizeRootEntries(roots, collectionErrors);
  const items = [];
  const seen = new WeakSet();

  for (const { label: rootLabel, root } of rootEntries) {
    const resolvePath = createPathResolver(root, rootPathFor(rootLabel));
    try {
      root.updateMatrixWorld?.(true);
      root.traverse((object) => {
        if (!object || seen.has(object)) return;
        seen.add(object);
        if (!isRenderable(object) || isExcludedEffect(object)) return;

        let base;
        try {
          base = baseMeshRecord(object, root, rootLabel, resolvePath);
        } catch (error) {
          let semanticPath = null;
          try {
            semanticPath = resolvePath(object);
          } catch {
            // Malformed geometryGate.id metadata must not abort valid siblings.
          }
          collectionErrors.push(collectionError({
            code: 'mesh_metadata',
            rootLabel,
            semanticPath,
            name: stableString(object.name) ?? '',
            error,
          }));
          return;
        }
        let included;
        try {
          included = includeObject(object, {
            id: base.objectPath,
            semanticPath: base.objectPath,
            rootLabel,
            parentId: base.parentId,
            nearestNamedGroupId: base.nearestNamedGroupId,
            assemblyId: base.assemblyId,
            name: base.name,
            objectKind: base.objectKind,
            role: base.role,
            tags: [...base.tags],
            wall: base.wall,
            wallAxis: base.wallAxis,
            structural: base.structural,
          });
        } catch (error) {
          collectionErrors.push(collectionError({
            code: 'include_object',
            rootLabel,
            semanticPath: base.objectPath,
            name: base.name,
            error,
          }));
          return;
        }
        if (!included) return;
        items.push(...meshRecords(
          object,
          base,
          THREE,
          collectionErrors,
        ));
      });
    } catch (error) {
      collectionErrors.push(collectionError({
        code: 'root_traversal',
        rootLabel,
        semanticPath: rootPathFor(rootLabel),
        error,
      }));
    }
  }

  items.sort((left, right) => lexicalCompare(left.id, right.id));
  const normalizedColliders = collectColliders(colliders, rootEntries, collectionErrors);
  collectionErrors.sort((left, right) => lexicalCompare(
    [left.rootLabel, left.semanticPath, left.code, left.name, left.instanceIndex, left.error].join('\0'),
    [right.rootLabel, right.semanticPath, right.code, right.name, right.instanceIndex, right.error].join('\0'),
  ));
  return {
    counted: items.length,
    items,
    colliders: normalizedColliders,
    collectionErrors,
  };
}
