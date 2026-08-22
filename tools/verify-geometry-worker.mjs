#!/usr/bin/env node

/** Build and scan one geometry state in an isolated Node process. */

import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { compareGeometryText } from './geometry-order.mjs';
import { ensureDomShim, ensureThreeShim } from './three-shim.mjs';

const RESULT_MARKER = '@@SQUATCH_GEOMETRY_RESULT@@';

function seededRandom(seed = 0x5a17c0de) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function descriptorRandomSeed(descriptorId) {
  if (typeof descriptorId !== 'string' || !descriptorId.trim()) {
    throw new TypeError('Geometry random boundary requires a nonblank descriptor id');
  }
  let seed = 0x811c9dc5;
  for (const character of descriptorId) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  return seed;
}

/**
 * Isolate every procedural scene build behind a stable descriptor-specific
 * PRNG, then restore the host process even when an import or builder rejects.
 * The worker is single-build by contract; callers must not overlap boundaries
 * in one process because Math.random is process-global.
 */
export async function withDescriptorGeometryRandom(descriptorId, build) {
  if (typeof build !== 'function') throw new TypeError('Geometry random boundary requires a build function');
  const originalRandom = Math.random;
  Math.random = seededRandom(descriptorRandomSeed(descriptorId));
  try {
    return await build();
  } finally {
    Math.random = originalRandom;
  }
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rawBounds(collider) {
  const minimum = collider?.min ?? collider?.bounds?.min ?? collider?.box?.min;
  const maximum = collider?.max ?? collider?.bounds?.max ?? collider?.box?.max;
  if (minimum && maximum) {
    return {
      min: { x: number(minimum.x), y: number(minimum.y), z: number(minimum.z) },
      max: { x: number(maximum.x), y: number(maximum.y), z: number(maximum.z) },
    };
  }
  if ([collider?.x0, collider?.x1, collider?.z0, collider?.z1].every((value) => number(value) !== null)) {
    // Some older player blockers are authored as infinite-height XZ boxes.
    // The Adapter gives them the game's standing interaction band explicitly
    // rather than pretending the missing Y values came from the builder.
    return {
      min: {
        x: Math.min(number(collider.x0), number(collider.x1)),
        y: number(collider.y0) ?? -0.5,
        z: Math.min(number(collider.z0), number(collider.z1)),
      },
      max: {
        x: Math.max(number(collider.x0), number(collider.x1)),
        y: number(collider.y1) ?? 4,
        z: Math.max(number(collider.z0), number(collider.z1)),
      },
    };
  }
  if ([collider?.x, collider?.z, collider?.w, collider?.d].every((value) => number(value) !== null)) {
    return {
      min: { x: collider.x - collider.w / 2, y: -0.5, z: collider.z - collider.d / 2 },
      max: { x: collider.x + collider.w / 2, y: 4, z: collider.z + collider.d / 2 },
    };
  }
  /* Upright cylinders: {x, z, r}. Trunks, the burn barrel, the chimney, and
   * every corner post of the cabin are authored this way, and until Initiation
   * came into the gate nothing that used them had ever been audited -- all 438
   * of them read as "unsupported collider bounds" and killed the whole state.
   *
   * The AABB of an upright cylinder is the square that circumscribes it, which
   * is wider than the trunk at the diagonals; that is the correct conservative
   * reading for a blocking volume and matches what the {x,z,w,d} branch above
   * does. The Y band is the same standing interaction band those XZ-only
   * shapes get, for the same reason: it is the Adapter being explicit rather
   * than inventing heights the builder never wrote. */
  if ([collider?.x, collider?.z, collider?.r].every((value) => number(value) !== null)) {
    return {
      min: { x: collider.x - collider.r, y: number(collider.y0) ?? -0.5, z: collider.z - collider.r },
      max: { x: collider.x + collider.r, y: number(collider.y1) ?? 4, z: collider.z + collider.r },
      /* AND THE CIRCLE ITSELF, ALONGSIDE THE BOX, because over-approximating
       * is only conservative for one of the two questions asked of a solid.
       *
       * Walking into a trunk and seeing past one are not the same test. The
       * box above is right for the first -- a walker stopped a hand's breadth
       * early has been stopped -- and wrong for the second, because the
       * circumscribing square is wider than the trunk at the diagonals and a
       * sightline that clears the wood by a few centimetres reads as blocked.
       * That cost the framing gate four findings in the clearing and one at
       * the cabin door, all of them sightlines that a raycast against the
       * RENDERED geometry of both states -- 99 solid meshes and 349 -- proved
       * hit nothing at all.
       *
       * So the shape the author actually wrote rides along beside the bounds.
       * Nothing in the geometry pipeline reads it: the collector builds its
       * records from a fixed key list and the gate's RECORD_KEYS is a
       * deliberately narrow geometric contract, so this is inert there by
       * construction and the record and violation counts are unchanged. It
       * exists for the one consumer that has to ask the second question. */
      shape: {
        kind: 'cylinder',
        x: number(collider.x),
        z: number(collider.z),
        r: number(collider.r),
      },
    };
  }
  return null;
}

function coordinate(value) {
  const rounded = Math.round(Number(value) * 10000) / 10000;
  return Object.is(rounded, -0) ? '0' : String(rounded).replace('-', 'm').replace('.', 'p');
}

function colliderBaseId(collider, bounds) {
  const semantic = [
    collider?.id,
    collider?.tag,
    collider?.name,
    collider?.userData?.geometryGateId,
  ].find((value) => typeof value === 'string' && value.trim());
  if (semantic) return semantic.trim().replace(/[^A-Za-z0-9._:/-]+/g, '-');
  return [
    'aabb',
    coordinate(bounds.min.x), coordinate(bounds.min.y), coordinate(bounds.min.z),
    coordinate(bounds.max.x), coordinate(bounds.max.y), coordinate(bounds.max.z),
  ].join('-');
}

function geometryGateUserData(object) {
  object.userData ??= {};
  object.userData.geometryGate ??= {};
  return object.userData.geometryGate;
}

function colliderOverlapPolicy(collider) {
  const explicit = collider?.userData?.geometryGate?.overlap
    ?? collider?.userData?.geometryGateOverlap
    ?? collider?.geometryGateOverlap
    ?? collider?.overlap;
  return explicit !== false;
}

/**
 * Give legacy unnamed colliders reviewable coordinate identities and link a
 * collider to its own rendered wall/fixture so that deliberate mesh/collider
 * duplication is one owner, not a false interpenetration.
 */
export function normalizeSceneColliders(built) {
  const active = (built.colliders ?? []).filter((collider) => (
    collider?.enabled !== false && collider?.on !== false
  ));
  const candidates = [];
  for (const collider of active) {
    const bounds = rawBounds(collider);
    if (!bounds) {
      candidates.push({ collider, error: 'unsupported collider bounds' });
      continue;
    }
    candidates.push({ collider, bounds, baseId: colliderBaseId(collider, bounds) });
  }
  const counts = new Map();
  const records = [];
  for (const candidate of candidates) {
    if (candidate.error) {
      records.push({ id: 'invalid-collider', invalid: candidate.error });
      continue;
    }
    const occurrence = (counts.get(candidate.baseId) ?? 0) + 1;
    counts.set(candidate.baseId, occurrence);
    const id = occurrence === 1 ? candidate.baseId : `${candidate.baseId}-${occurrence}`;
    const source = candidate.collider;
    const explicitAssemblyId = [
      source?.userData?.geometryGate?.assemblyId,
      source?.userData?.geometryGateAssemblyId,
      source?.geometryGateAssemblyId,
    ].find((value) => typeof value === 'string' && value.trim());
    const assemblyId = explicitAssemblyId
      ? explicitAssemblyId.trim()
      : `collider-${id}`;
    const wrapper = {
      id,
      min: candidate.bounds.min,
      max: candidate.bounds.max,
      /* Only when there is one to carry: an authored box has no shape beyond
       * its bounds, and a `shape: undefined` on every record in the game would
       * be a key nobody reads pretending to be information. */
      ...(candidate.bounds.shape ? { shape: candidate.bounds.shape } : {}),
      rootLabel: built.roots.length === 1 ? built.roots[0].label : built.scene,
      assemblyId,
      role: source.role ?? source.tag ?? null,
      tags: [source.tag, source.name].filter((value) => typeof value === 'string'),
      supports: true,
      fixedSupportAnchor: true,
      // Preserve authored collider metadata so the collector can distinguish
      // a reviewed exact opt-out from this Adapter's ordinary defaults.
      userData: source.userData,
      // Collision volumes are a first-class audited layer. A narrow
      // overlap=false remains available for a source-proven tessellated join,
      // but ordinary collider-collider penetration is blocking by default.
      overlap: colliderOverlapPolicy(source),
    };
    records.push(wrapper);

    const ownedMeshes = new Set();
    if (source.mesh?.isObject3D) ownedMeshes.add(source.mesh);
    for (const { root } of built.roots) {
      root.traverse((object) => {
        if (object?.userData?.collider === source) ownedMeshes.add(object);
      });
    }
    for (const mesh of ownedMeshes) geometryGateUserData(mesh).assemblyId = assemblyId;
  }
  return records;
}

function unionBounds(items) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const item of items) {
    for (const axis of ['x', 'y', 'z']) {
      min[axis] = Math.min(min[axis], item.min[axis]);
      max[axis] = Math.max(max[axis], item.max[axis]);
    }
  }
  return { min, max };
}

function visualOverlapPolicy(item) {
  if (item.overlap !== undefined) return item.overlap;
  return item.structural !== true;
}

const SUPPORT_COMPONENT_TOLERANCE_M = 0.04;
export const MAX_IMPLICIT_OBJECT_PARTS = 64;
export const MAX_IMPLICIT_OBJECT_SPAN_M = 8;

const SUPPRESSION_FIELDS = Object.freeze(['overlap', 'checkSupport']);

function suppressionApplications(items) {
  const applications = [];
  for (const item of [...items].sort((left, right) => compareGeometryText(left.id, right.id))) {
    const provenance = item.suppressionProvenance;
    if (provenance === undefined) continue;
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
      throw new Error(`Invalid suppression provenance on ${item.id}`);
    }
    for (const field of SUPPRESSION_FIELDS) {
      const policy = provenance[field];
      if (policy === undefined) continue;
      if (
        !policy
        || typeof policy !== 'object'
        || Array.isArray(policy)
        || typeof policy.sourceId !== 'string'
        || !policy.sourceId
        || !['direct', 'inherited'].includes(policy.scope)
        || typeof policy.origin !== 'string'
        || !policy.origin
        || item[field] !== false
      ) {
        throw new Error(`Invalid ${field} suppression provenance on ${item.id}`);
      }
      applications.push({
        field,
        recordId: item.id,
        sourceId: policy.sourceId,
        scope: policy.scope,
        origin: policy.origin,
      });
    }
  }
  return applications;
}

function sourceSubtreeItems(items, sourceId) {
  const prefix = `${sourceId}/`;
  return items.filter((item) => (
    item.objectPath === sourceId
    || item.objectPath?.startsWith(prefix)
    || item.id === sourceId
    || item.id.startsWith(prefix)
  ));
}

function assertBoundedInheritedSuppressions(items, applications) {
  const inheritedSources = [...new Set(
    applications
      .filter(({ scope }) => scope === 'inherited')
      .map(({ sourceId }) => sourceId),
  )].sort(compareGeometryText);
  const violations = [];
  for (const sourceId of inheritedSources) {
    const members = sourceSubtreeItems(items, sourceId);
    if (members.length === 0) {
      violations.push(`${sourceId} has no collected subtree`);
      continue;
    }
    const bounds = unionBounds(members);
    const spans = ['x', 'y', 'z'].map((axis) => bounds.max[axis] - bounds.min[axis]);
    if (
      members.length > MAX_IMPLICIT_OBJECT_PARTS
      || spans.some((span) => span > MAX_IMPLICIT_OBJECT_SPAN_M)
    ) {
      violations.push(
        `${sourceId} affects ${members.length} parts spanning `
        + `${spans.map((span) => span.toFixed(3)).join('x')}m`,
      );
    }
  }
  if (violations.length > 0) {
    throw new Error(
      'SCENE_SCALE_SUPPRESSION: inherited overlap=false/checkSupport=false must be scoped '
      + `to <=${MAX_IMPLICIT_OBJECT_PARTS} parts and <=${MAX_IMPLICIT_OBJECT_SPAN_M}m per axis; `
      + violations.join('; '),
    );
  }
}

export function summarizeSuppressionPolicy(items) {
  const applications = suppressionApplications(items);
  assertBoundedInheritedSuppressions(items, applications);
  const bySource = new Map();
  for (const application of applications) {
    const key = `${application.sourceId}\0${application.scope}`;
    const summary = bySource.get(key) ?? {
      sourceId: application.sourceId,
      scope: application.scope,
      overlap: 0,
      checkSupport: 0,
      origins: new Set(),
    };
    summary[application.field] += 1;
    summary.origins.add(application.origin);
    bySource.set(key, summary);
  }
  const sources = [...bySource.values()]
    .map((entry) => ({
      sourceId: entry.sourceId,
      scope: entry.scope,
      overlap: entry.overlap,
      checkSupport: entry.checkSupport,
      origins: [...entry.origins].sort(compareGeometryText),
    }))
    .sort((left, right) => (
      compareGeometryText(left.sourceId, right.sourceId)
      || compareGeometryText(left.scope, right.scope)
    ));
  const overlap = applications.filter(({ field }) => field === 'overlap').length;
  const checkSupport = applications.length - overlap;
  return {
    overlap,
    checkSupport,
    total: applications.length,
    sources,
  };
}

function boundedObjectOwners(items, identityFor) {
  const membersByOwner = new Map();
  for (const item of items) {
    const ownerId = identityFor(item);
    if (!ownerId) continue;
    const members = membersByOwner.get(ownerId) ?? [];
    members.push(item);
    membersByOwner.set(ownerId, members);
  }
  return new Set(
    [...membersByOwner]
      .filter(([, members]) => {
        if (members.length > MAX_IMPLICIT_OBJECT_PARTS) return false;
        const bounds = unionBounds(members);
        return ['x', 'y', 'z'].every((axis) => (
          bounds.max[axis] - bounds.min[axis] <= MAX_IMPLICIT_OBJECT_SPAN_M
        ));
      })
      .map(([ownerId]) => ownerId),
  );
}

function assertBoundedSupportAssemblies(items) {
  const membersById = new Map();
  for (const item of items) {
    if (item.supportAssemblyId === undefined || item.supportAssemblyId === null) continue;
    if (typeof item.supportAssemblyId !== 'string' || !item.supportAssemblyId.trim()) {
      throw new Error(`Invalid supportAssemblyId on ${item.id}`);
    }
    const members = membersById.get(item.supportAssemblyId) ?? [];
    members.push(item);
    membersById.set(item.supportAssemblyId, members);
  }
  const violations = [];
  for (const [supportAssemblyId, members] of [...membersById].sort(([left], [right]) => (
    compareGeometryText(left, right)
  ))) {
    const bounds = unionBounds(members);
    const spans = ['x', 'y', 'z'].map((axis) => bounds.max[axis] - bounds.min[axis]);
    if (
      members.length > MAX_IMPLICIT_OBJECT_PARTS
      || spans.some((span) => span > MAX_IMPLICIT_OBJECT_SPAN_M)
    ) {
      violations.push(
        `${supportAssemblyId} affects ${members.length} parts spanning `
        + `${spans.map((span) => span.toFixed(3)).join('x')}m`,
      );
    }
  }
  if (violations.length > 0) {
    throw new Error(
      'SCENE_SCALE_SUPPORT_ASSEMBLY: supportAssemblyId must be scoped '
      + `to <=${MAX_IMPLICIT_OBJECT_PARTS} parts and <=${MAX_IMPLICIT_OBJECT_SPAN_M}m per axis; `
      + violations.join('; '),
    );
  }
}

function localParentId(item) {
  if (!item.parentId) return null;
  const rootId = `root:${encodeURIComponent(item.rootLabel)}`;
  return item.parentId === rootId ? null : item.parentId;
}

function recordsWithinTolerance(left, right, toleranceM = SUPPORT_COMPONENT_TOLERANCE_M) {
  return ['x', 'y', 'z'].every((axis) => (
    left.min[axis] <= right.max[axis] + toleranceM
    && right.min[axis] <= left.max[axis] + toleranceM
  ));
}

function connectedSupportComponents(entries) {
  const ordered = [...entries].sort((left, right) => (
    left.record.min.x - right.record.min.x
    || left.record.max.x - right.record.max.x
    || left.record.id.localeCompare(right.record.id)
  ));
  const parents = ordered.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const unite = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };

  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      if (ordered[right].record.min.x > ordered[left].record.max.x + SUPPORT_COMPONENT_TOLERANCE_M) {
        break;
      }
      if (recordsWithinTolerance(ordered[left].record, ordered[right].record)) {
        unite(left, right);
      }
    }
  }

  const components = new Map();
  for (let index = 0; index < ordered.length; index += 1) {
    const root = find(index);
    const members = components.get(root) ?? [];
    members.push(ordered[index]);
    components.set(root, members);
  }
  return [...components.values()]
    .map((members) => members.sort((left, right) => left.record.id.localeCompare(right.record.id)))
    .sort((left, right) => left[0].record.id.localeCompare(right[0].record.id));
}

function supportBuckets(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    const { source } = entry;
    const kind = source.supportAssemblyId
      ? 'support-assembly'
      : source.assemblyId
        ? 'assembly'
        : source.nearestNamedGroupId
          ? 'named'
          : 'item';
    const baseId = source.supportAssemblyId
      ?? source.assemblyId
      ?? source.nearestNamedGroupId
      ?? source.id;
    const key = `${kind}:${baseId}`;
    const bucket = buckets.get(key) ?? { kind, baseId, entries: [] };
    bucket.entries.push(entry);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((left, right) => (
    left.baseId.localeCompare(right.baseId) || left.kind.localeCompare(right.kind)
  ));
}

function membershipHash(entries) {
  const hash = createHash('sha256');
  for (const { record } of [...entries].sort((left, right) => (
    left.record.id.localeCompare(right.record.id)
  ))) {
    hash.update(record.id);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Collision ownership accepts an explicit assembly or a bounded local
 * parent/named object with at most MAX_IMPLICIT_OBJECT_PARTS parts across at
 * most MAX_IMPLICIT_OBJECT_SPAN_M per axis. Scene-scale structures therefore
 * require explicit ownership. Floating checks may use broader named hierarchy,
 * but split it into physically
 * connected components before making support envelopes. This preserves chair
 * seats/legs while preventing a room or scenery root from hiding distant
 * floating props. Authored, bounded supportAssemblyId metadata can split
 * floating ownership from collision ownership without joining disconnected parts.
 * supportOwnerId keeps a component from supporting itself
 * without suppressing collision checks between its unowned mesh parts.
 */
export function applyScenePolicy(snapshot) {
  const suppressions = summarizeSuppressionPolicy(snapshot.items);
  assertBoundedSupportAssemblies(snapshot.items);
  const namedOwners = boundedObjectOwners(snapshot.items, (item) => item.nearestNamedGroupId);
  const parentOwners = boundedObjectOwners(snapshot.items, localParentId);
  const prepared = snapshot.items.map((source) => ({
    source,
    record: {
      ...source,
      ownerId: source.assemblyId
        ?? (namedOwners.has(source.nearestNamedGroupId) ? source.nearestNamedGroupId : null)
        ?? (parentOwners.has(source.parentId) ? source.parentId : null)
        ?? source.id,
      overlap: visualOverlapPolicy(source),
      supports: source.supports ?? true,
      fixedSupportAnchor: source.fixedSupportAnchor
        ?? (source.structural === true || source.wall === true),
      checkSupport: false,
    },
  }));
  const envelopes = [];

  for (const bucket of supportBuckets(prepared)) {
    const supportPolicies = new Set(
      bucket.entries
        .map(({ source }) => source.checkSupport)
        .filter((value) => typeof value === 'boolean'),
    );
    if (supportPolicies.size > 1) {
      throw new Error(`Conflicting explicit support policy for ${bucket.baseId}`);
    }
    const supportPolicy = [...supportPolicies][0];
    const components = bucket.kind === 'named' || bucket.kind === 'support-assembly'
      ? connectedSupportComponents(bucket.entries)
      : [bucket.entries.sort((left, right) => left.record.id.localeCompare(right.record.id))];

    for (const component of components) {
      const supportOwnerId = bucket.baseId;
      for (const entry of component) entry.record.supportOwnerId = supportOwnerId;
      const containsFixedSupportAnchor = component.some(
        ({ record }) => record.fixedSupportAnchor === true,
      );
      const entirelyStructural = component.every(({ record }) => record.structural === true);
      const entirelyWall = component.every(({ record }) => record.wall === true);
      if (entirelyStructural || entirelyWall || supportPolicy === false) continue;

      const records = component.map(({ record }) => record);
      const bounds = unionBounds(records);
      const rootLabels = new Set(records.map(({ rootLabel }) => rootLabel));
      if (rootLabels.size !== 1) {
        throw new Error(`Support assembly crosses scene roots: ${bucket.baseId}`);
      }
      const rootLabel = records[0].rootLabel;
      const envelopeId = `root:${encodeURIComponent(rootLabel)}/support-envelope:${membershipHash(component)}`;
      envelopes.push({
        id: envelopeId,
        semanticPath: envelopeId,
        ownerId: envelopeId,
        supportOwnerId,
        parentId: bucket.baseId,
        nearestNamedGroupId: records[0].nearestNamedGroupId,
        name: `${records[0].name || bucket.baseId} support envelope`,
        kind: 'assembly-envelope',
        rootLabel,
        min: bounds.min,
        max: bounds.max,
        structural: false,
        wall: false,
        overlap: false,
        supports: false,
        fixedSupportAnchor: containsFixedSupportAnchor,
        checkSupport: !containsFixedSupportAnchor,
        checkWallEmbed: false,
      });
    }
  }

  const items = [...prepared.map(({ record }) => record), ...envelopes]
    .sort((left, right) => left.id.localeCompare(right.id));
  const colliders = snapshot.colliders.map((collider) => {
    const ownerId = collider.assemblyId ?? collider.id;
    return {
      ...collider,
      ownerId,
      supportOwnerId: ownerId,
      supports: collider.supports ?? true,
      fixedSupportAnchor: collider.fixedSupportAnchor ?? true,
      checkSupport: false,
    };
  });
  return { ...snapshot, items, colliders, suppressions };
}

async function main() {
  const id = process.argv[2];
  if (!id || process.argv.length !== 3) {
    throw new Error('usage: node tools/verify-geometry-worker.mjs <scene:state>');
  }

  ensureThreeShim();
  ensureDomShim();

  const [scenes, collector, gate] = await Promise.all([
    import('./geometry-scenes.mjs'),
    import('./geometry-collect.mjs'),
    import('./geometry-gate.mjs'),
  ]);
  const built = await withDescriptorGeometryRandom(
    id,
    () => scenes.buildGeometrySceneState(id),
  );
  const colliders = normalizeSceneColliders(built);
  const snapshot = collector.collectGeometrySnapshot({
    roots: built.roots,
    colliders,
    THREE: built.THREE,
  });
  if (snapshot.counted === 0) throw new Error(`${id} produced zero audited geometry`);
  if (snapshot.collectionErrors.length > 0) {
    throw new Error(`${id} collection failed: ${JSON.stringify(snapshot.collectionErrors.slice(0, 20))}`);
  }

  const policySnapshot = applyScenePolicy(snapshot);
  const records = gate.geometryRecordsFromSnapshot(policySnapshot);
  const scan = gate.scanGeometry({ scene: built.scene, state: built.state, records });
  const payload = {
    schema: 'squatchsmash.geometry-worker.v1',
    id,
    scene: built.scene,
    state: built.state,
    meshRecords: snapshot.items.length,
    colliderRecords: snapshot.colliders.length,
    supportEnvelopes: policySnapshot.items.length - snapshot.items.length,
    suppressions: policySnapshot.suppressions,
    scan,
    /* WHAT EACH SUPPORT ENVELOPE ACTUALLY IS.
     *
     * An envelope's id is a hash of its membership, which is exactly right for
     * identity and completely useless to a person. The Cartel Palace reported
     * twelve floating assemblies, one of them four metres off the floor, and
     * not one of the twelve said what it was — so there was no way to tell a
     * prop that had come off its shelf from a light fitting that is meant to
     * hang, and the only thing the report supported was suppressing all twelve
     * unread.
     *
     * The gate cannot carry this: `RECORD_KEYS` is a deliberately narrow,
     * purely geometric contract and widening it to smuggle labels through
     * would be the wrong trade. So the names ride alongside the scan instead,
     * and `verify-geometry.mjs` joins them back on when it prints. */
    envelopeNames: Object.fromEntries(policySnapshot.items
      .filter((item) => item.kind === 'assembly-envelope')
      .map((item) => [item.id, {
        name: item.name ?? null,
        group: item.nearestNamedGroupId ?? null,
        parent: item.parentId ?? null,
      }])),
  };
  process.stdout.write(`${RESULT_MARKER}${JSON.stringify(payload)}\n`);
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`[verify-geometry-worker] ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}

