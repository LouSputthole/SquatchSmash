/**
 * The pure Scene Contract Interface.
 *
 * A contract says what a campaign entrypoint promises at the player-facing
 * seam. It deliberately does not inspect source imports: importing Player is
 * not proof that W moves, and importing ObjectivePanel is not proof that an
 * objective is visible. Browser Adapters execute the obligations generated
 * here; this Module only owns their vocabulary and validation.
 */

export const CONTRACT_DISPOSITION = Object.freeze({
  REQUIRED: 'required',
  DEBT: 'debt',
  KNOWN_FAILURE: 'known_failure',
  INTENTIONAL_NA: 'intentional_na',
  UNKNOWN: 'unknown',
});

export const CONTRACT_CAPABILITIES = Object.freeze([
  'input',
  'camera',
  'objective',
  'interaction',
  'checkpoints',
]);

export const SEMANTIC_SMOKE_AREAS = Object.freeze([
  'entry',
  'spawn',
  'boot',
  'input',
  'camera',
  'objective',
  'interaction',
  'checkpoint',
  'minimum_subjects',
  'progression',
]);

const DISPOSITIONS = new Set(Object.values(CONTRACT_DISPOSITION));
const CAPABILITIES = new Set(CONTRACT_CAPABILITIES);

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function issue(path, message) {
  return `${path}: ${message}`;
}

function validateDisposition(value, path, errors) {
  if (!DISPOSITIONS.has(value)) {
    errors.push(issue(path, `unknown disposition ${JSON.stringify(value)}`));
  }
}

function validateExplicitReason(value, path, errors) {
  if (typeof value.reason !== 'string' || value.reason.trim().length < 12) {
    errors.push(issue(path, `${value.disposition} requires a concrete reason`));
  }
}

function validateCapability(capability, path, errors) {
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
    errors.push(issue(path, 'must be an object'));
    return;
  }
  validateDisposition(capability.disposition, `${path}.disposition`, errors);
  if (typeof capability.description !== 'string' || !capability.description.trim()) {
    errors.push(issue(`${path}.description`, 'must be a non-empty string'));
  }
  if ([
    CONTRACT_DISPOSITION.DEBT,
    CONTRACT_DISPOSITION.KNOWN_FAILURE,
    CONTRACT_DISPOSITION.INTENTIONAL_NA,
    CONTRACT_DISPOSITION.UNKNOWN,
  ].includes(capability.disposition)) {
    validateExplicitReason(capability, path, errors);
  }
}

function validateEntrypoint(entrypoint, path, errors) {
  if (!entrypoint || typeof entrypoint !== 'object' || Array.isArray(entrypoint)) {
    errors.push(issue(path, 'must be an object'));
    return;
  }
  for (const field of ['id', 'href', 'root', 'kind']) {
    if (typeof entrypoint[field] !== 'string' || !entrypoint[field].trim()) {
      errors.push(issue(`${path}.${field}`, 'must be a non-empty string'));
    }
  }
  validateDisposition(entrypoint.disposition, `${path}.disposition`, errors);
  if ([
    CONTRACT_DISPOSITION.DEBT,
    CONTRACT_DISPOSITION.KNOWN_FAILURE,
    CONTRACT_DISPOSITION.INTENTIONAL_NA,
    CONTRACT_DISPOSITION.UNKNOWN,
  ].includes(entrypoint.disposition)) {
    validateExplicitReason(entrypoint, path, errors);
  }
  if (!Array.isArray(entrypoint.expectedExits)) {
    errors.push(issue(`${path}.expectedExits`, 'must be an array'));
  }
  if (entrypoint.observedExits != null && !Array.isArray(entrypoint.observedExits)) {
    errors.push(issue(`${path}.observedExits`, 'must be an array when supplied'));
  }
}

function validateMinimumSubject(subject, path, errors) {
  if (!subject || typeof subject !== 'object' || Array.isArray(subject)) {
    errors.push(issue(path, 'must be an object'));
    return;
  }
  if (typeof subject.kind !== 'string' || !subject.kind.trim()) {
    errors.push(issue(`${path}.kind`, 'must be a non-empty string'));
  }
  validateDisposition(subject.disposition, `${path}.disposition`, errors);
  if ([CONTRACT_DISPOSITION.REQUIRED, CONTRACT_DISPOSITION.DEBT,
    CONTRACT_DISPOSITION.KNOWN_FAILURE].includes(subject.disposition)
    && (!Number.isInteger(subject.minimum) || subject.minimum < 1)) {
    errors.push(issue(`${path}.minimum`, 'must be a positive integer'));
  }
  if (subject.disposition !== CONTRACT_DISPOSITION.REQUIRED) {
    validateExplicitReason(subject, path, errors);
  }
}

export function validateSceneContracts(contracts, { expectedSceneIds = null } = {}) {
  const errors = [];
  if (!Array.isArray(contracts)) return ['contracts: must be an array'];

  const ids = new Set();
  const entrypointIds = new Set();
  for (const [index, contract] of contracts.entries()) {
    const path = `contracts[${index}]`;
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
      errors.push(issue(path, 'must be an object'));
      continue;
    }
    for (const field of ['id', 'title', 'purpose']) {
      if (typeof contract[field] !== 'string' || !contract[field].trim()) {
        errors.push(issue(`${path}.${field}`, 'must be a non-empty string'));
      }
    }
    if (ids.has(contract.id)) errors.push(issue(`${path}.id`, `duplicate scene ${contract.id}`));
    ids.add(contract.id);

    if (typeof contract.goldenPath !== 'string' || !contract.goldenPath.trim()) {
      errors.push(issue(`${path}.goldenPath`, 'must be a non-empty string'));
    }
    if (!contract.campaign || typeof contract.campaign !== 'object'
      || Array.isArray(contract.campaign)) {
      errors.push(issue(`${path}.campaign`, 'must be an object'));
    } else {
      if (!Array.isArray(contract.campaign.entrySpawns)
        || contract.campaign.entrySpawns.length === 0) {
        errors.push(issue(`${path}.campaign.entrySpawns`, 'must contain registered entry spawns'));
      } else {
        const uniqueSpawns = new Set(contract.campaign.entrySpawns);
        if (uniqueSpawns.size !== contract.campaign.entrySpawns.length) {
          errors.push(issue(`${path}.campaign.entrySpawns`, 'must not contain duplicates'));
        }
        if (!uniqueSpawns.has(contract.campaign.defaultSpawn)) {
          errors.push(issue(`${path}.campaign.defaultSpawn`, 'must be present in entrySpawns'));
        }
      }
    }

    if (!Array.isArray(contract.entrypoints) || contract.entrypoints.length === 0) {
      errors.push(issue(`${path}.entrypoints`, 'must contain at least one runtime entrypoint'));
    } else {
      let canonicalCount = 0;
      for (const [entryIndex, entrypoint] of contract.entrypoints.entries()) {
        const entryPath = `${path}.entrypoints[${entryIndex}]`;
        validateEntrypoint(entrypoint, entryPath, errors);
        if (entrypoint?.kind === 'canonical') canonicalCount++;
        if (entrypointIds.has(entrypoint?.id)) {
          errors.push(issue(`${entryPath}.id`, `duplicate entrypoint ${entrypoint.id}`));
        }
        entrypointIds.add(entrypoint?.id);
      }
      if (canonicalCount !== 1) {
        errors.push(issue(`${path}.entrypoints`, `must contain exactly one canonical entrypoint, found ${canonicalCount}`));
      }
    }

    if (!contract.capabilities || typeof contract.capabilities !== 'object') {
      errors.push(issue(`${path}.capabilities`, 'must be an object'));
    } else {
      for (const name of CONTRACT_CAPABILITIES) {
        validateCapability(contract.capabilities[name], `${path}.capabilities.${name}`, errors);
      }
      for (const name of Object.keys(contract.capabilities)) {
        if (!CAPABILITIES.has(name)) {
          errors.push(issue(`${path}.capabilities.${name}`, 'is not a Scene Contract capability'));
        }
      }
    }

    if (!Array.isArray(contract.minimumSubjects) || contract.minimumSubjects.length === 0) {
      errors.push(issue(`${path}.minimumSubjects`, 'must contain non-vacuity requirements'));
    } else {
      const subjectKinds = new Set();
      for (const [subjectIndex, subject] of contract.minimumSubjects.entries()) {
        const subjectPath = `${path}.minimumSubjects[${subjectIndex}]`;
        validateMinimumSubject(subject, subjectPath, errors);
        if (subjectKinds.has(subject?.kind)) {
          errors.push(issue(`${subjectPath}.kind`, `duplicate subject ${subject.kind}`));
        }
        subjectKinds.add(subject?.kind);
      }
    }

    for (const field of ['debt', 'knownFailures']) {
      if (!Array.isArray(contract[field])) errors.push(issue(`${path}.${field}`, 'must be an array'));
    }
  }

  if (expectedSceneIds) {
    const expected = [...new Set(expectedSceneIds)].sort();
    const actual = [...ids].sort();
    const missing = expected.filter((id) => !ids.has(id));
    const extra = actual.filter((id) => !expected.includes(id));
    if (missing.length) errors.push(issue('contracts', `missing campaign scenes: ${missing.join(', ')}`));
    if (extra.length) errors.push(issue('contracts', `unknown campaign scenes: ${extra.join(', ')}`));
  }
  return errors;
}

function obligation({ contract, entrypoint, area, suffix, disposition, description, assertion }) {
  return deepFreeze({
    id: `${contract.id}:${entrypoint.id}:${area}:${suffix}`,
    sceneId: contract.id,
    entrypointId: entrypoint.id,
    area,
    disposition,
    description,
    assertion,
  });
}

function includeDisposition(disposition, includeIntentionalNa) {
  return disposition !== CONTRACT_DISPOSITION.INTENTIONAL_NA || includeIntentionalNa;
}

/** Generate browser-Adapter obligations without importing a browser. */
export function generateSemanticSmokeObligations(
  contract,
  { entrypoint = null, includeIntentionalNa = true } = {},
) {
  const entries = entrypoint
    ? contract.entrypoints.filter((candidate) => candidate.id === entrypoint)
    : contract.entrypoints;
  if (entrypoint && entries.length === 0) {
    throw new RangeError(`Unknown entrypoint ${entrypoint} for ${contract.id}`);
  }

  const obligations = [];
  for (const entry of entries) {
    obligations.push(obligation({
      contract,
      entrypoint: entry,
      area: 'entry',
      suffix: 'route',
      disposition: entry.disposition,
      description: `Boot ${entry.href} through ${entry.root} and preserve the declared campaign variant.`,
      assertion: {
        kind: 'entrypoint-route',
        href: entry.href,
        root: entry.root,
        router: entry.router ?? null,
        expectedExits: entry.expectedExits,
        observedExits: entry.observedExits ?? entry.expectedExits,
      },
    }));
    for (const spawnId of contract.campaign.entrySpawns) {
      obligations.push(obligation({
        contract,
        entrypoint: entry,
        area: 'spawn',
        suffix: spawnId,
        disposition: CONTRACT_DISPOSITION.REQUIRED,
        description: `Boot registered campaign spawn ${spawnId} into an observable live state.`,
        assertion: {
          kind: 'entry-spawn-liveness',
          spawnId,
          default: spawnId === contract.campaign.defaultSpawn,
          mustExposeLegalProgression: true,
        },
      }));
    }
    obligations.push(obligation({
      contract,
      entrypoint: entry,
      area: 'boot',
      suffix: 'meaningful-frame',
      disposition: CONTRACT_DISPOSITION.REQUIRED,
      description: 'Boot without page/runtime errors and render at least one meaningful frame.',
      assertion: { kind: 'meaningful-frame', minimum: 1, noRuntimeErrors: true },
    }));

    const input = contract.capabilities.input;
    if (includeDisposition(input.disposition, includeIntentionalNa)) {
      const actions = input.actions?.length ? input.actions : ['capability-state'];
      for (const action of actions) {
        obligations.push(obligation({
          contract,
          entrypoint: entry,
          area: 'input',
          suffix: action,
          disposition: input.disposition,
          description: input.description,
          assertion: { kind: 'real-input', action, mode: input.mode ?? null },
        }));
      }
    }

    const camera = contract.capabilities.camera;
    if (includeDisposition(camera.disposition, includeIntentionalNa)) {
      const assertions = camera.assertions?.length ? camera.assertions : ['camera-state'];
      for (const cameraAssertion of assertions) {
        obligations.push(obligation({
          contract,
          entrypoint: entry,
          area: 'camera',
          suffix: cameraAssertion,
          disposition: camera.disposition,
          description: camera.description,
          assertion: { kind: 'camera-behavior', behavior: cameraAssertion, mode: camera.mode ?? null },
        }));
      }
    }

    for (const capabilityName of ['objective', 'interaction']) {
      const capability = contract.capabilities[capabilityName];
      if (!includeDisposition(capability.disposition, includeIntentionalNa)) continue;
      obligations.push(obligation({
        contract,
        entrypoint: entry,
        area: capabilityName,
        suffix: 'behavior',
        disposition: capability.disposition,
        description: capability.description,
        assertion: {
          kind: `${capabilityName}-behavior`,
          adapter: capability.adapter ?? null,
          minimum: capability.minimum ?? 1,
        },
      }));
    }

    const checkpoints = contract.capabilities.checkpoints;
    if (includeDisposition(checkpoints.disposition, includeIntentionalNa)) {
      const ids = checkpoints.ids?.length ? checkpoints.ids : ['unresolved'];
      for (const checkpointId of ids) {
        obligations.push(obligation({
          contract,
          entrypoint: entry,
          area: 'checkpoint',
          suffix: checkpointId,
          disposition: checkpoints.disposition,
          description: checkpoints.description,
          assertion: {
            kind: 'checkpoint-liveness',
            checkpointId: checkpointId === 'unresolved' ? null : checkpointId,
            mode: checkpoints.mode ?? null,
            mustExposeLegalProgression: checkpoints.disposition
              !== CONTRACT_DISPOSITION.INTENTIONAL_NA,
          },
        }));
      }
    }

    for (const subject of contract.minimumSubjects) {
      if (!includeDisposition(subject.disposition, includeIntentionalNa)) continue;
      obligations.push(obligation({
        contract,
        entrypoint: entry,
        area: 'minimum_subjects',
        suffix: subject.kind,
        disposition: subject.disposition,
        description: subject.description,
        assertion: { kind: 'minimum-subject-count', subject: subject.kind, minimum: subject.minimum ?? null },
      }));
    }

    obligations.push(obligation({
      contract,
      entrypoint: entry,
      area: 'progression',
      suffix: 'real-action',
      disposition: entry.disposition,
      description: contract.goldenPath,
      assertion: {
        kind: 'real-action-progresses-state',
        expectedExits: entry.expectedExits,
      },
    }));
  }
  return deepFreeze(obligations);
}

export function generateSemanticSmokeRegistry(contracts, options = {}) {
  return deepFreeze(contracts.flatMap((contract) => (
    generateSemanticSmokeObligations(contract, options)
  )));
}

export function summarizeSemanticSmoke(obligations) {
  const byDisposition = Object.fromEntries([...DISPOSITIONS].map((value) => [value, 0]));
  const byArea = Object.fromEntries(SEMANTIC_SMOKE_AREAS.map((value) => [value, 0]));
  for (const item of obligations) {
    byDisposition[item.disposition] = (byDisposition[item.disposition] ?? 0) + 1;
    byArea[item.area] = (byArea[item.area] ?? 0) + 1;
  }
  return deepFreeze({ total: obligations.length, byDisposition, byArea });
}
