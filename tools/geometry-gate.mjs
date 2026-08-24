const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/%#=+-]{0,1023}$/;
const ENTRY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WILDCARD_PATTERN = /[*?\[\]]/;

const RECORD_KEYS = new Set([
  'id',
  'ownerId',
  'supportOwnerId',
  'overlapLayer',
  'minX',
  'minY',
  'minZ',
  'maxX',
  'maxY',
  'maxZ',
  'overlap',
  'supports',
  'fixedSupportAnchor',
  'checkSupport',
  'wall',
  'wallAxis',
  'checkWallEmbed',
]);

const TOP_LEVEL_ALLOWLIST_KEYS = new Set(['$schema', 'scene', 'entries', 'suppressionPolicy']);
const PAIR_ENTRY_REQUIRED_KEYS = new Set([
  'id',
  'state',
  'kind',
  'left',
  'right',
  'maxDepthM',
  'reason',
  'source',
]);
const FLOAT_ENTRY_REQUIRED_KEYS = new Set([
  'id',
  'state',
  'kind',
  'object',
  'maxGapM',
  'reason',
  'source',
]);
const OPTIONAL_ENTRY_KEYS = new Set(['sourceAnchor']);
const PAIR_ENTRY_KEYS = new Set([...PAIR_ENTRY_REQUIRED_KEYS, ...OPTIONAL_ENTRY_KEYS]);
const FLOAT_ENTRY_KEYS = new Set([...FLOAT_ENTRY_REQUIRED_KEYS, ...OPTIONAL_ENTRY_KEYS]);
const ALL_ENTRY_KEYS = new Set([...PAIR_ENTRY_KEYS, ...FLOAT_ENTRY_KEYS]);
const SUPPRESSION_STATE_KEYS = new Set(['state', 'overlap', 'checkSupport', 'sources']);
const SUPPRESSION_SOURCE_KEYS = new Set([
  'sourceId',
  'scope',
  'overlap',
  'checkSupport',
]);

export const GEOMETRY_ALLOWLIST_SCHEMA = 'squatchsmash.geometry-allowlist.v1';

export const GEOMETRY_THRESHOLDS = Object.freeze({
  overlapM: 0.03,
  floatGapM: 0.04,
  wallEmbedM: 0.02,
});

export const GEOMETRY_FINDING_KINDS = Object.freeze({
  INTERPENETRATION: 'INTERPENETRATION',
  FLOATING: 'FLOATING',
  WALL_EMBED: 'WALL_EMBED',
});

const PAIR_KINDS = new Set([
  GEOMETRY_FINDING_KINDS.INTERPENETRATION,
  GEOMETRY_FINDING_KINDS.WALL_EMBED,
]);
const FINDING_KINDS = new Set(Object.values(GEOMETRY_FINDING_KINDS));

export class GeometryGateInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeometryGateInputError';
  }
}

export class GeometryGateConfigError extends Error {
  constructor(message, issues) {
    super(message);
    this.name = 'GeometryGateConfigError';
    this.issues = Object.freeze(sortIssues(issues).map((issue) => Object.freeze({ ...issue })));
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertStableId(value, label) {
  if (typeof value !== 'string' || !STABLE_ID_PATTERN.test(value)) {
    throw new GeometryGateInputError(
      `${label} must be a stable ID matching ${STABLE_ID_PATTERN}.`,
    );
  }
  return value;
}

function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GeometryGateInputError(`${label} must be a finite number.`);
  }
  return value;
}

function optionalBoolean(record, key, fallback, label) {
  if (!(key in record)) return fallback;
  if (typeof record[key] !== 'boolean') {
    throw new GeometryGateInputError(`${label}.${key} must be a boolean.`);
  }
  return record[key];
}

function canonicalPair(left, right) {
  return compareText(left.id, right.id) <= 0 ? [left, right] : [right, left];
}

function canonicalPairIds(left, right) {
  return compareText(left, right) <= 0 ? [left, right] : [right, left];
}

function positiveOverlap(minA, maxA, minB, maxB) {
  return Math.min(maxA, maxB) - Math.max(minA, minB);
}

function axesWithinTolerance(minA, maxA, minB, maxB, toleranceM) {
  return (
    minA <= maxB + toleranceM
    && minB <= maxA + toleranceM
  );
}

function facesWithinTolerance(first, second, toleranceM) {
  return Math.abs(first - second) <= toleranceM + 1e-12;
}

function fixedAnchorContact(object, support, toleranceM) {
  const xContact = (
    facesWithinTolerance(object.minX, support.maxX, toleranceM)
    || facesWithinTolerance(object.maxX, support.minX, toleranceM)
  )
    && axesWithinTolerance(object.minY, object.maxY, support.minY, support.maxY, toleranceM)
    && axesWithinTolerance(object.minZ, object.maxZ, support.minZ, support.maxZ, toleranceM);
  const zContact = (
    facesWithinTolerance(object.minZ, support.maxZ, toleranceM)
    || facesWithinTolerance(object.maxZ, support.minZ, toleranceM)
  )
    && axesWithinTolerance(object.minX, object.maxX, support.minX, support.maxX, toleranceM)
    && axesWithinTolerance(object.minY, object.maxY, support.minY, support.maxY, toleranceM);
  const ceilingContact = facesWithinTolerance(object.maxY, support.minY, toleranceM)
    && axesWithinTolerance(object.minX, object.maxX, support.minX, support.maxX, toleranceM)
    && axesWithinTolerance(object.minZ, object.maxZ, support.minZ, support.maxZ, toleranceM);
  return xContact || zContact || ceilingContact;
}

function findingId(scene, state, kind, ...selectors) {
  return [scene, state, kind, ...selectors].join('|');
}

function normalizeRecord(record, index) {
  if (!isPlainObject(record)) {
    throw new GeometryGateInputError(`records[${index}] must be a plain object.`);
  }

  for (const key of Object.keys(record)) {
    if (!RECORD_KEYS.has(key)) {
      throw new GeometryGateInputError(`records[${index}] has unknown key \"${key}\".`);
    }
  }

  const label = `records[${index}]`;
  const id = assertStableId(record.id, `${label}.id`);
  const ownerId = assertStableId(record.ownerId ?? id, `${label}.ownerId`);
  const supportOwnerId = assertStableId(
    record.supportOwnerId ?? ownerId,
    `${label}.supportOwnerId`,
  );
  const overlapLayer = assertStableId(record.overlapLayer ?? 'default', `${label}.overlapLayer`);
  const minX = assertFiniteNumber(record.minX, `${label}.minX`);
  const minY = assertFiniteNumber(record.minY, `${label}.minY`);
  const minZ = assertFiniteNumber(record.minZ, `${label}.minZ`);
  const maxX = assertFiniteNumber(record.maxX, `${label}.maxX`);
  const maxY = assertFiniteNumber(record.maxY, `${label}.maxY`);
  const maxZ = assertFiniteNumber(record.maxZ, `${label}.maxZ`);

  if (!(minX < maxX) || !(minY < maxY) || !(minZ < maxZ)) {
    throw new GeometryGateInputError(`${label} must have strictly positive bounds on every axis.`);
  }

  const wall = optionalBoolean(record, 'wall', false, label);
  let wallAxis = null;
  if ('wallAxis' in record && record.wallAxis !== null) {
    if (!wall || (record.wallAxis !== 'x' && record.wallAxis !== 'z')) {
      throw new GeometryGateInputError(
        `${label}.wallAxis is only valid for a wall and must be \"x\" or \"z\".`,
      );
    }
    wallAxis = record.wallAxis;
  } else if (wall) {
    wallAxis = maxX - minX <= maxZ - minZ ? 'x' : 'z';
  }

  return Object.freeze({
    id,
    ownerId,
    supportOwnerId,
    overlapLayer,
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    overlap: optionalBoolean(record, 'overlap', true, label),
    supports: optionalBoolean(record, 'supports', false, label),
    fixedSupportAnchor: optionalBoolean(
      record,
      'fixedSupportAnchor',
      wall || overlapLayer === 'collider',
      label,
    ),
    checkSupport: optionalBoolean(record, 'checkSupport', false, label),
    wall,
    wallAxis,
    checkWallEmbed: optionalBoolean(record, 'checkWallEmbed', !wall, label),
  });
}

/**
 * Validates geometry at the adapter seam and returns stable, ID-sorted records.
 * Records contain only strings, booleans, null, and finite numbers.
 */
export function normalizeGeometryRecords(records) {
  if (!Array.isArray(records)) {
    throw new GeometryGateInputError('records must be an array.');
  }

  const normalized = records.map(normalizeRecord);
  normalized.sort((left, right) => compareText(left.id, right.id));

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].id === normalized[index].id) {
      throw new GeometryGateInputError(`Duplicate geometry record ID \"${normalized[index].id}\".`);
    }
  }

  return Object.freeze(normalized);
}

function compareSweepOrder(left, right) {
  return (
    left.minX - right.minX
    || left.maxX - right.maxX
    || compareText(left.id, right.id)
  );
}

function* sweepNormalizedRecords(normalized, paddingM = 0) {
  const ordered = [...normalized].sort(compareSweepOrder);
  let active = [];

  for (const current of ordered) {
    active = active.filter((candidate) => (
      paddingM === 0
        ? candidate.maxX > current.minX
        : candidate.maxX + paddingM >= current.minX
    ));

    for (const candidate of active) {
      if (
        paddingM === 0
          ? candidate.maxZ > current.minZ && current.maxZ > candidate.minZ
          : candidate.maxZ + paddingM >= current.minZ
            && current.maxZ + paddingM >= candidate.minZ
      ) {
        yield canonicalPair(candidate, current);
      }
    }

    active.push(current);
  }
}

/**
 * Complete X/Z sweep-and-prune broadphase. It streams candidate pairs and does
 * not impose comparison or result caps.
 */
export function* sweepGeometryPairs(records) {
  yield* sweepNormalizedRecords(normalizeGeometryRecords(records));
}

function makePairFinding(scene, state, kind, first, second, overlap) {
  const [left, right] = canonicalPair(first, second);
  const axes = [
    ['x', overlap.x],
    ['y', overlap.y],
    ['z', overlap.z],
  ];
  axes.sort((a, b) => a[1] - b[1] || compareText(a[0], b[0]));

  return Object.freeze({
    id: findingId(scene, state, kind, left.id, right.id),
    scene,
    state,
    kind,
    left: left.id,
    right: right.id,
    depthM: axes[0][1],
    axis: axes[0][0],
    overlapX: overlap.x,
    overlapY: overlap.y,
    overlapZ: overlap.z,
  });
}

function makeWallFinding(scene, state, wall, object, overlap) {
  const [left, right] = canonicalPair(wall, object);
  const depthM = wall.wallAxis === 'x' ? overlap.x : overlap.z;
  return Object.freeze({
    id: findingId(
      scene,
      state,
      GEOMETRY_FINDING_KINDS.WALL_EMBED,
      left.id,
      right.id,
    ),
    scene,
    state,
    kind: GEOMETRY_FINDING_KINDS.WALL_EMBED,
    left: left.id,
    right: right.id,
    wall: wall.id,
    object: object.id,
    depthM,
    axis: wall.wallAxis,
    overlapX: overlap.x,
    overlapY: overlap.y,
    overlapZ: overlap.z,
  });
}

function makeFloatingFinding(scene, state, object, support) {
  const gapM = support === null ? null : object.minY - support.maxY;
  return Object.freeze({
    id: findingId(scene, state, GEOMETRY_FINDING_KINDS.FLOATING, object.id),
    scene,
    state,
    kind: GEOMETRY_FINDING_KINDS.FLOATING,
    object: object.id,
    support: support?.id ?? null,
    gapM,
  });
}

/**
 * Classifies one scene state using the fixed gate thresholds. Exact threshold
 * values pass because every classifier uses a strict greater-than comparison.
 */
export function scanGeometry({ scene, state = 'default', records }) {
  assertStableId(scene, 'scene');
  assertStableId(state, 'state');
  const normalized = normalizeGeometryRecords(records);
  const supportsByObject = new Map(
    normalized
      .filter((record) => record.checkSupport)
      .map((record) => [record.id, null]),
  );
  const attachedObjects = new Set();
  const findings = [];
  let candidatePairCount = 0;

  for (const [first, second] of sweepNormalizedRecords(
    normalized,
    GEOMETRY_THRESHOLDS.floatGapM,
  )) {
    candidatePairCount += 1;

    for (const [object, support] of [[first, second], [second, first]]) {
      if (
        !object.checkSupport
        || !support.supports
        || object.supportOwnerId === support.supportOwnerId
      ) {
        continue;
      }

      if (
        support.fixedSupportAnchor
        && fixedAnchorContact(object, support, GEOMETRY_THRESHOLDS.floatGapM)
      ) {
        attachedObjects.add(object.id);
      }

      if (
        positiveOverlap(object.minX, object.maxX, support.minX, support.maxX) > 0
        && positiveOverlap(object.minZ, object.maxZ, support.minZ, support.maxZ) > 0
        && support.minY < object.minY
        && support.maxY <= object.minY + GEOMETRY_THRESHOLDS.overlapM
      ) {
        const previous = supportsByObject.get(object.id);
        if (
          previous === null
          || support.maxY > previous.maxY
          || (support.maxY === previous.maxY && compareText(support.id, previous.id) < 0)
        ) {
          supportsByObject.set(object.id, support);
        }
      }
    }

    if (
      first.ownerId === second.ownerId
      || first.overlapLayer !== second.overlapLayer
      || !first.overlap
      || !second.overlap
    ) {
      continue;
    }

    const overlap = {
      x: positiveOverlap(first.minX, first.maxX, second.minX, second.maxX),
      y: positiveOverlap(first.minY, first.maxY, second.minY, second.maxY),
      z: positiveOverlap(first.minZ, first.maxZ, second.minZ, second.maxZ),
    };
    if (overlap.x <= 0 || overlap.y <= 0 || overlap.z <= 0) continue;

    const wall = first.wall !== second.wall ? (first.wall ? first : second) : null;
    const object = wall === first ? second : first;
    if (wall !== null && object.checkWallEmbed) {
      const wallDepth = wall.wallAxis === 'x' ? overlap.x : overlap.z;
      if (wallDepth > GEOMETRY_THRESHOLDS.wallEmbedM) {
        findings.push(makeWallFinding(scene, state, wall, object, overlap));
      }
      continue;
    }

    const minimumDepth = Math.min(overlap.x, overlap.y, overlap.z);
    if (minimumDepth > GEOMETRY_THRESHOLDS.overlapM) {
      findings.push(makePairFinding(
        scene,
        state,
        GEOMETRY_FINDING_KINDS.INTERPENETRATION,
        first,
        second,
        overlap,
      ));
    }
  }

  for (const object of normalized) {
    if (!object.checkSupport) continue;
    if (attachedObjects.has(object.id)) continue;
    const support = supportsByObject.get(object.id);
    if (
      support === null
      || object.minY - support.maxY > GEOMETRY_THRESHOLDS.floatGapM
    ) {
      findings.push(makeFloatingFinding(scene, state, object, support));
    }
  }

  findings.sort((left, right) => compareText(left.id, right.id));
  return Object.freeze({
    scene,
    state,
    recordCount: normalized.length,
    candidatePairCount,
    recordIds: Object.freeze(normalized.map((record) => record.id)),
    findings: Object.freeze(findings),
  });
}

function issue(code, path, message) {
  return { code, path, message };
}

function sortIssues(issues) {
  return [...issues].sort(
    (left, right) => (
      compareText(left.path, right.path)
      || compareText(left.code, right.code)
      || compareText(left.message, right.message)
    ),
  );
}

function validateStableSelector(value, path, issues) {
  if (typeof value === 'string' && WILDCARD_PATTERN.test(value)) {
    issues.push(issue('WILDCARD_SELECTOR', path, 'Wildcard selectors are forbidden.'));
    return false;
  }
  if (typeof value !== 'string' || !STABLE_ID_PATTERN.test(value)) {
    issues.push(issue('INVALID_SELECTOR', path, 'Expected one exact stable ID.'));
    return false;
  }
  return true;
}

function validateReason(value, path, issues) {
  const genericReasons = new Set([
    'by design',
    'expected',
    'intentional',
    'intentional overlap',
    'known issue',
    'temporary',
    'fix later',
  ]);
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.length < 20
    || value.length > 500
    || !/[A-Za-z]{3}/.test(value)
    || /\b(?:TODO|TBD|placeholder)\b/i.test(value)
    || genericReasons.has(value.toLowerCase())
  ) {
    issues.push(issue(
      'INVALID_REASON',
      path,
      'Reason must be 20-500 trimmed characters and explain the intentional geometry.',
    ));
    return false;
  }
  return true;
}

function validateSourceAnchor(value, path, issues) {
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.length < 3
    || value.length > 200
    || /[\r\n]/.test(value)
  ) {
    issues.push(issue(
      'INVALID_SOURCE_ANCHOR',
      path,
      'sourceAnchor must be 3-200 trimmed characters from the cited source line.',
    ));
    return false;
  }
  return true;
}

function validateSource(value, path, issues) {
  if (
    typeof value !== 'string'
    || value.includes('\\')
    || value.startsWith('/')
    || value.includes('//')
    || value.split('/').includes('..')
    || !/^[A-Za-z0-9._/-]+:\d+$/.test(value)
  ) {
    issues.push(issue(
      'INVALID_SOURCE',
      path,
      'Source must be a repository-relative forward-slash path with one line number.',
    ));
    return false;
  }
  return true;
}

function validateNonnegativeInteger(value, path, issues) {
  if (!Number.isSafeInteger(value) || value < 0) {
    issues.push(issue('INVALID_SUPPRESSION_COUNT', path, 'Expected a non-negative safe integer.'));
    return false;
  }
  return true;
}

function validateSuppressionPolicy(policy, states, issues) {
  if (!Array.isArray(policy)) {
    issues.push(issue(
      'INVALID_SUPPRESSION_POLICY',
      'suppressionPolicy',
      'suppressionPolicy must be an array with one exact entry per selected state.',
    ));
    return [];
  }

  const normalized = [];
  const seenStates = new Set();
  let previousState = null;
  for (const [index, entry] of policy.entries()) {
    const basePath = `suppressionPolicy[${index}]`;
    if (!isPlainObject(entry)) {
      issues.push(issue('INVALID_SUPPRESSION_STATE', basePath, 'Suppression state must be a plain object.'));
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!SUPPRESSION_STATE_KEYS.has(key)) {
        issues.push(issue('UNKNOWN_KEY', `${basePath}.${key}`, `Unknown suppression-state key "${key}".`));
      }
    }
    for (const key of SUPPRESSION_STATE_KEYS) {
      if (!(key in entry)) {
        issues.push(issue('MISSING_KEY', `${basePath}.${key}`, `Missing suppression-state key "${key}".`));
      }
    }

    const stateValid = validateStableSelector(entry.state, `${basePath}.state`, issues);
    if (stateValid) {
      if (!states.has(entry.state)) {
        issues.push(issue('UNKNOWN_SUPPRESSION_STATE', `${basePath}.state`, `Unknown state "${entry.state}".`));
      }
      if (seenStates.has(entry.state)) {
        issues.push(issue('DUPLICATE_SUPPRESSION_STATE', `${basePath}.state`, `Duplicate state "${entry.state}".`));
      }
      if (previousState !== null && compareText(previousState, entry.state) >= 0) {
        issues.push(issue(
          'NONCANONICAL_SUPPRESSION_ORDER',
          `${basePath}.state`,
          'Suppression states must be strictly sorted by state.',
        ));
      }
      seenStates.add(entry.state);
      previousState = entry.state;
    }

    const overlapValid = validateNonnegativeInteger(entry.overlap, `${basePath}.overlap`, issues);
    const checkSupportValid = validateNonnegativeInteger(
      entry.checkSupport,
      `${basePath}.checkSupport`,
      issues,
    );
    const sources = [];
    let previousSourceKey = null;
    let overlapSum = 0;
    let checkSupportSum = 0;
    if (!Array.isArray(entry.sources)) {
      issues.push(issue('INVALID_SUPPRESSION_SOURCES', `${basePath}.sources`, 'sources must be an array.'));
    } else {
      const seenSourceKeys = new Set();
      for (const [sourceIndex, suppressionSource] of entry.sources.entries()) {
        const sourcePath = `${basePath}.sources[${sourceIndex}]`;
        if (!isPlainObject(suppressionSource)) {
          issues.push(issue('INVALID_SUPPRESSION_SOURCE', sourcePath, 'Suppression source must be a plain object.'));
          continue;
        }
        for (const key of Object.keys(suppressionSource)) {
          if (!SUPPRESSION_SOURCE_KEYS.has(key)) {
            issues.push(issue('UNKNOWN_KEY', `${sourcePath}.${key}`, `Unknown suppression-source key "${key}".`));
          }
        }
        for (const key of SUPPRESSION_SOURCE_KEYS) {
          if (!(key in suppressionSource)) {
            issues.push(issue('MISSING_KEY', `${sourcePath}.${key}`, `Missing suppression-source key "${key}".`));
          }
        }
        const sourceIdValid = validateStableSelector(
          suppressionSource.sourceId,
          `${sourcePath}.sourceId`,
          issues,
        );
        const scopeValid = ['direct', 'inherited'].includes(suppressionSource.scope);
        if (!scopeValid) {
          issues.push(issue(
            'INVALID_SUPPRESSION_SCOPE',
            `${sourcePath}.scope`,
            'scope must be "direct" or "inherited".',
          ));
        }
        const sourceOverlapValid = validateNonnegativeInteger(
          suppressionSource.overlap,
          `${sourcePath}.overlap`,
          issues,
        );
        const sourceCheckSupportValid = validateNonnegativeInteger(
          suppressionSource.checkSupport,
          `${sourcePath}.checkSupport`,
          issues,
        );
        if (
          sourceOverlapValid
          && sourceCheckSupportValid
          && suppressionSource.overlap + suppressionSource.checkSupport === 0
        ) {
          issues.push(issue(
            'EMPTY_SUPPRESSION_SOURCE',
            sourcePath,
            'A suppression source must account for at least one opt-out.',
          ));
        }
        if (sourceIdValid && scopeValid) {
          const sourceKey = `${suppressionSource.sourceId}\0${suppressionSource.scope}`;
          if (seenSourceKeys.has(sourceKey)) {
            issues.push(issue('DUPLICATE_SUPPRESSION_SOURCE', sourcePath, 'Duplicate sourceId and scope.'));
          }
          if (previousSourceKey !== null && compareText(previousSourceKey, sourceKey) >= 0) {
            issues.push(issue(
              'NONCANONICAL_SUPPRESSION_SOURCE_ORDER',
              sourcePath,
              'Suppression sources must be sorted by sourceId and scope.',
            ));
          }
          seenSourceKeys.add(sourceKey);
          previousSourceKey = sourceKey;
        }
        if (sourceOverlapValid) overlapSum += suppressionSource.overlap;
        if (sourceCheckSupportValid) checkSupportSum += suppressionSource.checkSupport;
        sources.push({
          sourceId: suppressionSource.sourceId,
          scope: suppressionSource.scope,
          overlap: suppressionSource.overlap,
          checkSupport: suppressionSource.checkSupport,
        });
      }
    }
    if (overlapValid && overlapSum !== entry.overlap) {
      issues.push(issue(
        'SUPPRESSION_COUNT_MISMATCH',
        `${basePath}.overlap`,
        `Source counts sum to ${overlapSum}, not ${entry.overlap}.`,
      ));
    }
    if (checkSupportValid && checkSupportSum !== entry.checkSupport) {
      issues.push(issue(
        'SUPPRESSION_COUNT_MISMATCH',
        `${basePath}.checkSupport`,
        `Source counts sum to ${checkSupportSum}, not ${entry.checkSupport}.`,
      ));
    }
    normalized.push({
      state: entry.state,
      overlap: entry.overlap,
      checkSupport: entry.checkSupport,
      sources: Object.freeze(sources.map((item) => Object.freeze(item))),
    });
  }

  for (const state of [...states.keys()].sort(compareText)) {
    if (!seenStates.has(state)) {
      issues.push(issue(
        'MISSING_SUPPRESSION_STATE',
        'suppressionPolicy',
        `Missing suppression policy for state "${state}".`,
      ));
    }
  }
  return normalized;
}

function findingSelector(finding) {
  if (PAIR_KINDS.has(finding.kind)) {
    const [left, right] = canonicalPairIds(finding.left, finding.right);
    return `${finding.state}|${finding.kind}|${left}|${right}`;
  }
  return `${finding.state}|${finding.kind}|${finding.object}`;
}

function entrySelector(entry) {
  if (PAIR_KINDS.has(entry.kind)) {
    const [left, right] = canonicalPairIds(entry.left, entry.right);
    return `${entry.state}|${entry.kind}|${left}|${right}`;
  }
  return `${entry.state}|${entry.kind}|${entry.object}`;
}

function scanContext(scans, issues) {
  if (!Array.isArray(scans)) {
    issues.push(issue('INVALID_SCANS', 'scans', 'scans must be an array.'));
    return new Map();
  }

  const states = new Map();
  scans.forEach((scan, index) => {
    const path = `scans[${index}]`;
    if (!isPlainObject(scan) || typeof scan.state !== 'string' || !Array.isArray(scan.recordIds)) {
      issues.push(issue('INVALID_SCAN', path, 'Expected a scanGeometry result.'));
      return;
    }
    if (states.has(scan.state)) {
      issues.push(issue('DUPLICATE_SCAN_STATE', `${path}.state`, `Duplicate state \"${scan.state}\".`));
      return;
    }
    states.set(scan.state, new Set(scan.recordIds));
  });
  return states;
}

/**
 * Strictly validates and normalizes one per-scene v1 allowlist. Invalid policy
 * is a configuration failure, never a silently ignored entry.
 */
export function validateGeometryAllowlist(allowlist, { scene, scans }) {
  assertStableId(scene, 'scene');
  const issues = [];
  const states = scanContext(scans, issues);

  if (!isPlainObject(allowlist)) {
    throw new GeometryGateConfigError('Invalid geometry allowlist.', [
      ...issues,
      issue('INVALID_ALLOWLIST', 'allowlist', 'Allowlist must be a plain object.'),
    ]);
  }

  for (const key of Object.keys(allowlist)) {
    if (!TOP_LEVEL_ALLOWLIST_KEYS.has(key)) {
      issues.push(issue('UNKNOWN_KEY', key, `Unknown top-level key \"${key}\".`));
    }
  }
  for (const key of TOP_LEVEL_ALLOWLIST_KEYS) {
    if (!(key in allowlist)) {
      issues.push(issue('MISSING_KEY', key, `Missing top-level key \"${key}\".`));
    }
  }

  if (allowlist.$schema !== GEOMETRY_ALLOWLIST_SCHEMA) {
    issues.push(issue(
      'UNKNOWN_SCHEMA',
      '$schema',
      `Expected schema \"${GEOMETRY_ALLOWLIST_SCHEMA}\".`,
    ));
  }
  if (allowlist.scene !== scene) {
    issues.push(issue('SCENE_MISMATCH', 'scene', `Expected scene \"${scene}\".`));
  }
  if (!Array.isArray(allowlist.entries)) {
    issues.push(issue('INVALID_ENTRIES', 'entries', 'entries must be an array.'));
  }
  const normalizedSuppressionPolicy = validateSuppressionPolicy(
    allowlist.suppressionPolicy,
    states,
    issues,
  );

  const normalizedEntries = [];
  const seenIds = new Map();
  const seenSelectors = new Map();
  let previousId = null;

  for (const [index, entry] of (Array.isArray(allowlist.entries) ? allowlist.entries : []).entries()) {
    const basePath = `entries[${index}]`;
    if (!isPlainObject(entry)) {
      issues.push(issue('INVALID_ENTRY', basePath, 'Entry must be a plain object.'));
      continue;
    }

    const allowedKeys = PAIR_KINDS.has(entry.kind)
      ? PAIR_ENTRY_KEYS
      : entry.kind === GEOMETRY_FINDING_KINDS.FLOATING
        ? FLOAT_ENTRY_KEYS
        : ALL_ENTRY_KEYS;
    const requiredKeys = PAIR_KINDS.has(entry.kind)
      ? PAIR_ENTRY_REQUIRED_KEYS
      : entry.kind === GEOMETRY_FINDING_KINDS.FLOATING
        ? FLOAT_ENTRY_REQUIRED_KEYS
        : new Set([...PAIR_ENTRY_REQUIRED_KEYS, ...FLOAT_ENTRY_REQUIRED_KEYS]);
    for (const key of Object.keys(entry)) {
      if (!allowedKeys.has(key)) {
        issues.push(issue('UNKNOWN_KEY', `${basePath}.${key}`, `Unknown entry key \"${key}\".`));
      }
    }
    for (const key of requiredKeys) {
      if (!(key in entry)) {
        issues.push(issue('MISSING_KEY', `${basePath}.${key}`, `Missing entry key \"${key}\".`));
      }
    }

    const idValid = typeof entry.id === 'string' && ENTRY_ID_PATTERN.test(entry.id);
    if (!idValid) {
      issues.push(issue('INVALID_ENTRY_ID', `${basePath}.id`, 'Entry ID must be canonical lower-kebab-case.'));
    } else {
      if (seenIds.has(entry.id)) {
        issues.push(issue(
          'DUPLICATE_ENTRY_ID',
          `${basePath}.id`,
          `Entry ID duplicates ${seenIds.get(entry.id)}.`,
        ));
      } else {
        seenIds.set(entry.id, `${basePath}.id`);
      }
      if (previousId !== null && compareText(previousId, entry.id) >= 0) {
        issues.push(issue(
          'NONCANONICAL_ENTRY_ORDER',
          `${basePath}.id`,
          'Entries must be strictly sorted by ID.',
        ));
      }
      previousId = entry.id;
    }

    const stateValid = validateStableSelector(entry.state, `${basePath}.state`, issues);
    if (stateValid && !states.has(entry.state)) {
      issues.push(issue('UNKNOWN_STATE', `${basePath}.state`, `Unknown state \"${entry.state}\".`));
    }
    if (!FINDING_KINDS.has(entry.kind)) {
      issues.push(issue('UNKNOWN_KIND', `${basePath}.kind`, `Unknown finding kind \"${entry.kind}\".`));
    }

    validateReason(entry.reason, `${basePath}.reason`, issues);
    validateSource(entry.source, `${basePath}.source`, issues);
    if ('sourceAnchor' in entry) {
      validateSourceAnchor(entry.sourceAnchor, `${basePath}.sourceAnchor`, issues);
    }

    let selector = null;
    let normalized = null;
    if (PAIR_KINDS.has(entry.kind)) {
      const leftValid = validateStableSelector(entry.left, `${basePath}.left`, issues);
      const rightValid = validateStableSelector(entry.right, `${basePath}.right`, issues);
      if (leftValid && rightValid) {
        if (compareText(entry.left, entry.right) >= 0) {
          issues.push(issue(
            'NONCANONICAL_PAIR',
            `${basePath}.left`,
            'Pair selectors must be distinct and ordered left < right.',
          ));
        }
        const knownRecords = states.get(entry.state);
        if (knownRecords && !knownRecords.has(entry.left)) {
          issues.push(issue('UNKNOWN_OBJECT', `${basePath}.left`, `Unknown object \"${entry.left}\".`));
        }
        if (knownRecords && !knownRecords.has(entry.right)) {
          issues.push(issue('UNKNOWN_OBJECT', `${basePath}.right`, `Unknown object \"${entry.right}\".`));
        }
        selector = entrySelector(entry);
      }
      if (
        typeof entry.maxDepthM !== 'number'
        || !Number.isFinite(entry.maxDepthM)
        || entry.maxDepthM <= (
          entry.kind === GEOMETRY_FINDING_KINDS.WALL_EMBED
            ? GEOMETRY_THRESHOLDS.wallEmbedM
            : GEOMETRY_THRESHOLDS.overlapM
        )
      ) {
        issues.push(issue(
          'INVALID_CAP',
          `${basePath}.maxDepthM`,
          'maxDepthM must be finite and strictly above the finding threshold.',
        ));
      }
      normalized = {
        id: entry.id,
        state: entry.state,
        kind: entry.kind,
        left: entry.left,
        right: entry.right,
        maxDepthM: entry.maxDepthM,
        reason: entry.reason,
        source: entry.source,
        ...('sourceAnchor' in entry ? { sourceAnchor: entry.sourceAnchor } : {}),
      };
    } else if (entry.kind === GEOMETRY_FINDING_KINDS.FLOATING) {
      const objectValid = validateStableSelector(entry.object, `${basePath}.object`, issues);
      if (objectValid) {
        const knownRecords = states.get(entry.state);
        if (knownRecords && !knownRecords.has(entry.object)) {
          issues.push(issue('UNKNOWN_OBJECT', `${basePath}.object`, `Unknown object \"${entry.object}\".`));
        }
        selector = entrySelector(entry);
      }
      if (
        typeof entry.maxGapM !== 'number'
        || !Number.isFinite(entry.maxGapM)
        || entry.maxGapM <= GEOMETRY_THRESHOLDS.floatGapM
      ) {
        issues.push(issue(
          'INVALID_CAP',
          `${basePath}.maxGapM`,
          'maxGapM must be finite and strictly above the floating threshold.',
        ));
      }
      normalized = {
        id: entry.id,
        state: entry.state,
        kind: entry.kind,
        object: entry.object,
        maxGapM: entry.maxGapM,
        reason: entry.reason,
        source: entry.source,
        ...('sourceAnchor' in entry ? { sourceAnchor: entry.sourceAnchor } : {}),
      };
    }

    if (selector !== null) {
      if (seenSelectors.has(selector)) {
        issues.push(issue(
          'AMBIGUOUS_ALLOWLIST',
          basePath,
          `Entry duplicates the selector at ${seenSelectors.get(selector)}.`,
        ));
      } else {
        seenSelectors.set(selector, basePath);
      }
    }
    if (normalized !== null) normalizedEntries.push(Object.freeze(normalized));
  }

  if (issues.length > 0) {
    throw new GeometryGateConfigError('Invalid geometry allowlist.', issues);
  }

  return Object.freeze({
    $schema: GEOMETRY_ALLOWLIST_SCHEMA,
    scene,
    entries: Object.freeze(normalizedEntries),
    suppressionPolicy: Object.freeze(
      normalizedSuppressionPolicy.map((item) => Object.freeze(item)),
    ),
  });
}

function findingMagnitude(finding) {
  return finding.kind === GEOMETRY_FINDING_KINDS.FLOATING
    ? finding.gapM
    : finding.depthM;
}

function entryCap(entry) {
  return entry.kind === GEOMETRY_FINDING_KINDS.FLOATING
    ? entry.maxGapM
    : entry.maxDepthM;
}

/**
 * Reconciles current findings against an exact allowlist. Fixed findings make
 * entries stale; newly introduced findings and cap growth remain violations.
 */
export function reconcileGeometryAllowlist({ scene, scans, allowlist }) {
  const normalized = validateGeometryAllowlist(allowlist, { scene, scans });
  const findingsBySelector = new Map();
  const allFindings = [];
  const ambiguityIssues = [];

  for (const scan of scans) {
    if (!Array.isArray(scan.findings)) {
      ambiguityIssues.push(issue('INVALID_SCAN', `scans.${scan.state}`, 'Scan has no findings array.'));
      continue;
    }
    for (const finding of scan.findings) {
      const selector = findingSelector(finding);
      if (findingsBySelector.has(selector)) {
        ambiguityIssues.push(issue(
          'AMBIGUOUS_FINDING',
          `findings.${selector}`,
          'More than one finding has the same exact selector.',
        ));
      } else {
        findingsBySelector.set(selector, finding);
      }
      allFindings.push(finding);
    }
  }
  if (ambiguityIssues.length > 0) {
    throw new GeometryGateConfigError('Ambiguous geometry findings.', ambiguityIssues);
  }

  const entriesBySelector = new Map(normalized.entries.map((entry) => [entrySelector(entry), entry]));
  const staleIssues = normalized.entries
    .filter((entry) => !findingsBySelector.has(entrySelector(entry)))
    .map((entry) => issue(
      'STALE_ENTRY',
      `entries.${entry.id}`,
      'Entry no longer matches a current finding and must be removed.',
    ));
  if (staleIssues.length > 0) {
    throw new GeometryGateConfigError('Stale geometry allowlist.', staleIssues);
  }

  allFindings.sort((left, right) => compareText(left.id, right.id));
  const allowed = [];
  const violations = [];

  for (const finding of allFindings) {
    const entry = entriesBySelector.get(findingSelector(finding));
    if (entry === undefined) {
      violations.push(Object.freeze({ code: 'UNLISTED', finding, entryId: null }));
      continue;
    }
    const magnitude = findingMagnitude(finding);
    const cap = entryCap(entry);
    if (magnitude === null) {
      violations.push(Object.freeze({
        code: 'UNBOUNDED_FINDING',
        finding,
        entryId: entry.id,
        capM: cap,
        actualM: null,
      }));
    } else if (magnitude > cap) {
      violations.push(Object.freeze({
        code: 'CAP_EXCEEDED',
        finding,
        entryId: entry.id,
        capM: cap,
        actualM: magnitude,
      }));
    } else {
      allowed.push(Object.freeze({ finding, entry }));
    }
  }

  return Object.freeze({
    ok: violations.length === 0,
    allowed: Object.freeze(allowed),
    violations: Object.freeze(violations),
  });
}

/** Runs the pure gate across a deterministic list of scene states. */
export function runGeometryGate({ scene, states, allowlist }) {
  assertStableId(scene, 'scene');
  if (!Array.isArray(states) || states.length === 0) {
    throw new GeometryGateInputError('states must be a non-empty array.');
  }

  const normalizedStates = states.map((state, index) => {
    if (!isPlainObject(state)) {
      throw new GeometryGateInputError(`states[${index}] must be a plain object.`);
    }
    const keys = Object.keys(state);
    if (keys.some((key) => key !== 'state' && key !== 'records')) {
      throw new GeometryGateInputError(`states[${index}] has an unknown key.`);
    }
    return {
      state: assertStableId(state.state, `states[${index}].state`),
      records: state.records,
    };
  });
  normalizedStates.sort((left, right) => compareText(left.state, right.state));
  for (let index = 1; index < normalizedStates.length; index += 1) {
    if (normalizedStates[index - 1].state === normalizedStates[index].state) {
      throw new GeometryGateInputError(`Duplicate scene state \"${normalizedStates[index].state}\".`);
    }
  }

  const scans = Object.freeze(normalizedStates.map((state) => scanGeometry({ scene, ...state })));
  const reconciliation = reconcileGeometryAllowlist({ scene, scans, allowlist });
  return Object.freeze({ scene, scans, ...reconciliation });
}
function boundsCoordinate(record, bound, axis, label) {
  const container = record[bound];
  if (Array.isArray(container)) {
    return container[{ x: 0, y: 1, z: 2 }[axis]];
  }
  if (isPlainObject(container)) return container[axis];
  throw new GeometryGateInputError(`${label}.${bound} must contain x, y, and z coordinates.`);
}

/**
 * Adapter for the headless collector snapshot. Collection metadata remains on
 * the collector side of the seam; only exact geometry policy enters the gate.
 */
export function geometryRecordsFromSnapshot(snapshot) {
  if (!isPlainObject(snapshot) || !Array.isArray(snapshot.items)) {
    throw new GeometryGateInputError('snapshot must be a plain object with an items array.');
  }
  if ('colliders' in snapshot && !Array.isArray(snapshot.colliders)) {
    throw new GeometryGateInputError('snapshot.colliders must be an array when present.');
  }

  const sources = [
    ...snapshot.items.map((record) => ({ record, collider: false })),
    ...(snapshot.colliders ?? []).map((record) => ({ record, collider: true })),
  ];
  const records = sources.map(({ record, collider }, index) => {
    const label = collider
      ? `snapshot.colliders[${index - snapshot.items.length}]`
      : `snapshot.items[${index}]`;
    if (!isPlainObject(record)) {
      throw new GeometryGateInputError(`${label} must be a plain object.`);
    }
    const wall = record.wall === true;
    const structural = record.structural === true;
    const nonPhysical = record.spatial?.typed === true && record.blocks?.collision === false;
    const ownerId = record.assemblyId ?? record.ownerId ?? record.id;
    const supportOwnerId = record.supportOwnerId ?? ownerId;
    const adapted = {
      id: record.id,
      ownerId,
      supportOwnerId,
      overlapLayer: record.overlapLayer ?? (collider ? 'collider' : 'visual'),
      minX: boundsCoordinate(record, 'min', 'x', label),
      minY: boundsCoordinate(record, 'min', 'y', label),
      minZ: boundsCoordinate(record, 'min', 'z', label),
      maxX: boundsCoordinate(record, 'max', 'x', label),
      maxY: boundsCoordinate(record, 'max', 'y', label),
      maxZ: boundsCoordinate(record, 'max', 'z', label),
      /* Semantic collision truth outranks legacy overlap policy. A trigger
       * may occupy the same bounds as a wall without being physical. */
      overlap: nonPhysical ? false : record.overlap ?? true,
      /* A typed trigger is not a secret shelf. Collision semantics govern
       * both penetration and physical support or a trigger under a floating
       * prop can make the FLOATING finding disappear. */
      supports: nonPhysical ? false : record.supports ?? structural,
      fixedSupportAnchor: nonPhysical
        ? false : record.fixedSupportAnchor ?? (collider || structural || wall),
      checkSupport: record.checkSupport ?? (!collider && !structural && !wall),
      wall,
      checkWallEmbed: record.checkWallEmbed ?? !wall,
    };
    if (record.wallAxis !== undefined) adapted.wallAxis = record.wallAxis;
    return adapted;
  });

  return normalizeGeometryRecords(records);
}
