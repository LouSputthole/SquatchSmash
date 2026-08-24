/**
 * Canonical semantic description for things that occupy game space.
 *
 * Bounds answer where a volume is.  They do not answer what the volume means.
 * Treating those as the same question is how an NPC body became masonry, a
 * booth became its sitter, and a trigger could accidentally become a wall.
 * This Module keeps that meaning intact while legacy scenes are migrated.
 *
 * `markSpatialPrimitive` is the authoring Interface.  Geometry, staging,
 * navigation and line-of-sight tools consume the frozen record returned by
 * `readSpatialPrimitive`; they do not infer meaning from dimensions or names.
 */

export const SPATIAL_KINDS = Object.freeze([
  'world',
  'actor-body',
  'seat',
  'vehicle',
  'prop',
  'door',
  'trigger',
  'interaction',
  'spawn',
]);

export const SPATIAL_CHANNELS = Object.freeze([
  'collision',
  'vision',
  'navigation',
  'ballistics',
]);

const DEFAULT_BLOCKS = Object.freeze({
  world: Object.freeze({ collision: true, vision: true, navigation: true, ballistics: true }),
  'actor-body': Object.freeze({ collision: true, vision: true, navigation: true, ballistics: true }),
  seat: Object.freeze({ collision: true, vision: true, navigation: true, ballistics: true }),
  vehicle: Object.freeze({ collision: true, vision: true, navigation: true, ballistics: true }),
  prop: Object.freeze({ collision: true, vision: true, navigation: true, ballistics: true }),
  door: Object.freeze({ collision: true, vision: true, navigation: true, ballistics: true }),
  trigger: Object.freeze({ collision: false, vision: false, navigation: false, ballistics: false }),
  interaction: Object.freeze({ collision: false, vision: false, navigation: false, ballistics: false }),
  spawn: Object.freeze({ collision: false, vision: false, navigation: false, ballistics: false }),
});

function nonblank(value, label, { optional = false } = {}) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function blocksFor(kind, authored) {
  if (authored !== undefined && (!authored || typeof authored !== 'object' || Array.isArray(authored))) {
    throw new TypeError('Spatial primitive blocks must be an object');
  }
  const blocks = {};
  for (const channel of SPATIAL_CHANNELS) {
    const supplied = authored != null && Object.hasOwn(authored, channel);
    const value = supplied ? authored[channel] : DEFAULT_BLOCKS[kind][channel];
    if (typeof value !== 'boolean') {
      throw new TypeError(`Spatial primitive blocks.${channel} must be boolean`);
    }
    blocks[channel] = value;
  }
  const unknown = Object.keys(authored ?? {}).filter((key) => !SPATIAL_CHANNELS.includes(key));
  if (unknown.length) throw new TypeError(`Unknown spatial block channel ${JSON.stringify(unknown[0])}`);
  return Object.freeze(blocks);
}

/** Build one validated, immutable spatial record without attaching it. */
export function defineSpatialPrimitive(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('Spatial primitive spec must be an object');
  }
  const allowed = new Set([
    'id', 'kind', 'blocks', 'ownerActorId', 'assemblyId', 'intentionalOverlapWith',
  ]);
  const unknown = Object.keys(spec).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`Unknown spatial primitive field ${JSON.stringify(unknown[0])}`);
  const id = nonblank(spec.id, 'Spatial primitive id');
  const kind = nonblank(spec.kind, `Spatial primitive ${id} kind`);
  if (!SPATIAL_KINDS.includes(kind)) {
    throw new TypeError(`Spatial primitive ${id} has unknown kind ${JSON.stringify(kind)}`);
  }
  const ownerActorId = nonblank(spec.ownerActorId, `Spatial primitive ${id} ownerActorId`, {
    optional: true,
  });
  if (kind === 'actor-body' && ownerActorId === undefined) {
    throw new TypeError(`Actor-body spatial primitive ${id} requires ownerActorId`);
  }
  if (ownerActorId !== undefined && kind !== 'actor-body') {
    throw new TypeError(`Only actor-body spatial primitives may declare ownerActorId (${id})`);
  }
  const assemblyId = nonblank(spec.assemblyId, `Spatial primitive ${id} assemblyId`, {
    optional: true,
  });
  const intentionalOverlapWith = spec.intentionalOverlapWith ?? [];
  if (!Array.isArray(intentionalOverlapWith)) {
    throw new TypeError(`Spatial primitive ${id} intentionalOverlapWith must be an array`);
  }
  const overlaps = intentionalOverlapWith.map((value, index) => (
    nonblank(value, `Spatial primitive ${id} intentionalOverlapWith[${index}]`)
  ));
  if (new Set(overlaps).size !== overlaps.length) {
    throw new TypeError(`Spatial primitive ${id} has duplicate intentionalOverlapWith entries`);
  }
  return Object.freeze({
    schema: 'squatchsmash.spatial-primitive.v1',
    id,
    kind,
    blocks: blocksFor(kind, spec.blocks),
    ...(ownerActorId === undefined ? {} : { ownerActorId }),
    ...(assemblyId === undefined ? {} : { assemblyId }),
    ...(overlaps.length === 0 ? {} : { intentionalOverlapWith: Object.freeze(overlaps) }),
  });
}

/** Attach semantic meaning to a collider, scene object or authored descriptor. */
export function markSpatialPrimitive(target, spec) {
  if (!target || typeof target !== 'object') {
    throw new TypeError('Cannot mark a non-object as a spatial primitive');
  }
  target.userData ??= {};
  target.userData.spatial = defineSpatialPrimitive(spec);
  return target;
}

/** Return a validated authored record, or null for a legacy untyped object. */
export function readSpatialPrimitive(target) {
  const record = target?.userData?.spatial;
  if (record === undefined) return null;
  if (!record || record.schema !== 'squatchsmash.spatial-primitive.v1') {
    throw new TypeError('Invalid spatial primitive marker');
  }
  const { schema: _schema, ...spec } = record;
  const validated = defineSpatialPrimitive(spec);
  if (JSON.stringify(validated) !== JSON.stringify(record)) {
    throw new TypeError('Invalid spatial primitive marker');
  }
  return record;
}

/**
 * Adapter payload used by headless validators.
 *
 * Absence is reported as `typed: false`; it is never converted into a guessed
 * kind.  That lets migration coverage say UNKNOWN instead of manufacturing a
 * reassuring answer from an object's dimensions.
 */
export function spatialMetadata(target) {
  const primitive = readSpatialPrimitive(target);
  if (!primitive) return Object.freeze({ typed: false });
  return Object.freeze({
    typed: true,
    spatialId: primitive.id,
    spatialKind: primitive.kind,
    blocks: primitive.blocks,
    ...(primitive.ownerActorId === undefined ? {} : { ownerActorId: primitive.ownerActorId }),
    ...(primitive.assemblyId === undefined ? {} : { spatialAssemblyId: primitive.assemblyId }),
    ...(primitive.intentionalOverlapWith === undefined
      ? {}
      : { intentionalOverlapWith: primitive.intentionalOverlapWith }),
  });
}

export function spatialBlocks(targetOrMetadata, channel) {
  if (!SPATIAL_CHANNELS.includes(channel)) {
    throw new TypeError(`Unknown spatial block channel ${JSON.stringify(channel)}`);
  }
  const blocks = targetOrMetadata?.blocks ?? readSpatialPrimitive(targetOrMetadata)?.blocks;
  return blocks?.[channel] ?? null;
}
