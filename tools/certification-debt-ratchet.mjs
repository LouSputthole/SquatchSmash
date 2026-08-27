#!/usr/bin/env node

/**
 * Subtractive certification-debt ratchet.
 *
 * The strict certifiers continue to answer "is all debt gone?" and therefore
 * remain red while migration is incomplete. This tool answers the CI question:
 * "did this change add, mutate, or grow any known debt?" Each known defect is
 * pinned by domain, stable ID, status, semantic fingerprint, and count. A
 * smaller current set passes; a same-size substitution does not.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { evaluateMissionLiveness } from '../src/core/mission-liveness.js';
import { buildSceneLivenessCatalog } from './scene-liveness-catalog.mjs';
import { buildSceneArchitectureReport } from './verify-scene-architecture.mjs';
import { buildSemanticSmokeReport } from './verify-semantic-smoke.mjs';

export const CERTIFICATION_DEBT_SCHEMA_VERSION = 1;
export const CERTIFICATION_DEBT_DOMAINS = Object.freeze([
  'architecture',
  'semantic_contract',
  'liveness',
  'spatial',
]);

const TOOL_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(TOOL_PATH), '..');
const BASELINE_REPOSITORY_PATH = 'tools/certification-debt-baseline.json';
const ACTOR_RETIREMENTS_REPOSITORY_PATH = 'tools/certification-actor-retirements.json';
export const DEFAULT_CERTIFICATION_DEBT_BASELINE = path.join(
  REPOSITORY_ROOT,
  ...BASELINE_REPOSITORY_PATH.split('/'),
);
export const DEFAULT_CERTIFICATION_ACTOR_RETIREMENTS = path.join(
  REPOSITORY_ROOT,
  ...ACTOR_RETIREMENTS_REPOSITORY_PATH.split('/'),
);
export const CERTIFICATION_ACTOR_RETIREMENTS_SCHEMA =
  'squatchsmash.certification-actor-retirements.v1';

/** Locale-independent ordering for serialized baseline data and fingerprints. */
export function compareStableText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => compareStableText(left, right))
    .map(([key, child]) => [key, canonicalValue(child)]));
}

export function semanticFingerprint(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex')
    .slice(0, 20);
}

/** Bind a reviewed cast retirement to its exact state, IDs, rationale and source. */
export function actorRetirementFingerprint(retirement) {
  return semanticFingerprint({
    proofId: retirement.proofId,
    actorIds: retirement.actorIds,
    reason: retirement.reason,
    source: retirement.source,
    sourceAnchor: retirement.sourceAnchor,
  });
}

function actorRetirementReceipt(retirement) {
  return Object.freeze({
    schema: CERTIFICATION_ACTOR_RETIREMENTS_SCHEMA,
    proofId: retirement.proofId,
    actorIds: Object.freeze([...retirement.actorIds]),
    reason: retirement.reason,
    source: retirement.source,
    sourceAnchor: retirement.sourceAnchor,
    fingerprint: actorRetirementFingerprint(retirement),
  });
}

function sourceCitation(source) {
  const match = /^(.*):(\d+)$/u.exec(String(source ?? ''));
  if (!match) return null;
  const line = Number(match[2]);
  if (!Number.isInteger(line) || line < 1) return null;
  return { file: match[1].replaceAll('\\', '/'), line };
}

/**
 * Validate the small, reviewed exception ledger used only for intentional cast
 * retirement. Unlike an actor allowlist, an entry cannot hide a live finding:
 * the coverage comparator below requires the exact trusted IDs to disappear,
 * the current state to publish an intentional no-cast contract, and no other
 * actor inventory change. The source citation makes the reason executable
 * enough to fail when the production declaration moves or is removed.
 */
export function validateActorRetirementLedger(document, {
  repositoryRoot = REPOSITORY_ROOT,
  readFile = fs.readFileSync,
} = {}) {
  const errors = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return ['actor retirement ledger must be an object'];
  }
  if (document.$schema !== CERTIFICATION_ACTOR_RETIREMENTS_SCHEMA) {
    errors.push(`actor retirement ledger $schema must be ${CERTIFICATION_ACTOR_RETIREMENTS_SCHEMA}`);
  }
  if (!Array.isArray(document.entries)) {
    errors.push('actor retirement ledger entries must be an array');
    return errors;
  }
  const proofIds = new Set();
  const root = path.resolve(repositoryRoot);
  const sourceCache = new Map();
  for (const [index, entry] of document.entries.entries()) {
    const at = `entries[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (typeof entry.proofId !== 'string' || !entry.proofId.trim()) {
      errors.push(`${at}.proofId is required`);
    } else if (proofIds.has(entry.proofId)) {
      errors.push(`${at}.proofId duplicates ${entry.proofId}`);
    } else proofIds.add(entry.proofId);
    if (!Array.isArray(entry.actorIds) || entry.actorIds.length === 0) {
      errors.push(`${at}.actorIds must be a non-empty array`);
    } else {
      const actorIds = new Set();
      for (const [actorIndex, actorId] of entry.actorIds.entries()) {
        if (typeof actorId !== 'string' || !actorId.trim()) {
          errors.push(`${at}.actorIds[${actorIndex}] must be a non-empty string`);
        } else if (actorIds.has(actorId)) {
          errors.push(`${at}.actorIds duplicates ${actorId}`);
        } else actorIds.add(actorId);
      }
      const sorted = [...entry.actorIds].sort(compareStableText);
      if (entry.actorIds.some((actorId, actorIndex) => actorId !== sorted[actorIndex])) {
        errors.push(`${at}.actorIds must be sorted`);
      }
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
      errors.push(`${at}.reason must explain the retirement`);
    }
    if (typeof entry.sourceAnchor !== 'string' || !entry.sourceAnchor.trim()) {
      errors.push(`${at}.sourceAnchor is required`);
    }
    const citation = sourceCitation(entry.source);
    if (!citation) {
      errors.push(`${at}.source must be a repository-relative file:line citation`);
      continue;
    }
    const absolute = path.resolve(root, ...citation.file.split('/'));
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      errors.push(`${at}.source escapes the repository`);
      continue;
    }
    let lines = sourceCache.get(absolute);
    if (!lines) {
      try {
        lines = String(readFile(absolute, 'utf8')).split(/\r?\n/u);
        sourceCache.set(absolute, lines);
      } catch (error) {
        errors.push(`${at}.source could not be read: ${error.message}`);
        continue;
      }
    }
    const actual = lines[citation.line - 1]?.trim();
    if (actual !== entry.sourceAnchor?.trim()) {
      errors.push(`${at}.sourceAnchor is not on ${entry.source}`);
    }
  }
  const sortedEntries = [...document.entries]
    .sort((left, right) => compareStableText(left?.proofId, right?.proofId));
  if (document.entries.some((entry, index) => entry !== sortedEntries[index])) {
    errors.push('actor retirement ledger entries must be sorted by proofId');
  }
  return errors;
}

export function readActorRetirementLedger(
  file = DEFAULT_CERTIFICATION_ACTOR_RETIREMENTS,
  options = {},
) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = validateActorRetirementLedger(document, options);
  if (errors.length) {
    throw new Error(`actor retirement ledger is not usable:\n  ${errors.join('\n  ')}`);
  }
  return document;
}

/** Fingerprint exactly what the live browser claims to have executed. */
export function semanticObligationFingerprint(obligation) {
  if (!obligation || typeof obligation !== 'object' || Array.isArray(obligation)) {
    throw new TypeError('semantic obligation must be an object');
  }
  return semanticFingerprint({
    id: obligation.id,
    sceneId: obligation.sceneId,
    entrypointId: obligation.entrypointId,
    area: obligation.area,
    disposition: obligation.disposition,
    description: obligation.description,
    assertion: obligation.assertion,
  });
}

function debtEntry({ id, status, count = 1, proofId = id, proofKind, meaning }) {
  return Object.freeze({
    id,
    status,
    count,
    proofId,
    proofKind,
    fingerprint: semanticFingerprint(meaning),
  });
}

function proofEntry({ id, status, evidence = null }) {
  return Object.freeze({ id, status, evidence: canonicalValue(evidence) });
}

function summarizeEntries(entries) {
  const byStatus = {};
  for (const entry of entries) {
    byStatus[entry.status] = (byStatus[entry.status] ?? 0) + entry.count;
  }
  return Object.freeze({
    records: entries.length,
    units: entries.reduce((total, entry) => total + entry.count, 0),
    byStatus: Object.freeze(Object.fromEntries(
      Object.entries(byStatus).sort(([left], [right]) => compareStableText(left, right)),
    )),
  });
}

function domainDocument(entries, proofs) {
  const sorted = [...entries].sort((left, right) => compareStableText(left.id, right.id));
  const sortedProofs = [...proofs].sort((left, right) => compareStableText(left.id, right.id));
  return Object.freeze({
    summary: summarizeEntries(sorted),
    entries: Object.freeze(sorted),
    proofs: Object.freeze(sortedProofs),
  });
}

export function certificationDebtSnapshot({
  architectureReport,
  semanticReport,
  livenessEntries,
  spatialReport,
  actorRetirements = [],
}) {
  const architecture = architectureReport.summary.uncertified.map((item) => debtEntry({
    id: item.id,
    status: item.status,
    proofKind: 'architecture_finding',
    meaning: {
      kind: item.kind,
      subject: item.subject,
      status: item.status,
      message: item.message,
      evidence: item.evidence,
    },
  }));

  const semanticContract = semanticReport.blockers.map((item) => debtEntry({
    id: item.id,
    status: item.disposition,
    proofKind: 'browser_obligation',
    meaning: {
      area: item.area,
      disposition: item.disposition,
      description: item.description,
      assertion: item.assertion,
    },
  }));

  const liveness = [];
  for (const entry of livenessEntries) {
    const result = evaluateMissionLiveness(entry.observation);
    if (result.status === 'PASS') continue;
    liveness.push(debtEntry({
      id: entry.id,
      status: result.status.toLowerCase(),
      proofKind: 'catalog_state',
      meaning: {
        observation: entry.observation,
        result: {
          status: result.status,
          code: result.code,
          diagnostics: result.diagnostics,
        },
      },
    }));
  }

  if (spatialReport?.schemaVersion !== 1 || !Array.isArray(spatialReport.debt)) {
    throw new TypeError('spatial report must be schemaVersion 1 with a debt array');
  }
  const spatial = spatialReport.debt.map((item) => debtEntry({
    id: item.id,
    status: item.status,
    count: item.count,
    proofId: item.proofId,
    proofKind: item.proofKind,
    meaning: item.detail,
  }));

  const architectureProofs = architectureReport.findings.map((item) => proofEntry({
    id: item.id,
    status: item.status,
    evidence: { kind: item.kind, subject: item.subject },
  }));
  /* Contract disposition is not executable proof. Until the browser certifier
   * publishes exact obligation PASS receipts, semantic removals remain frozen. */
  const semanticProofs = semanticReport.obligations.map((item) => proofEntry({
    id: item.id,
    status: 'declaration_only',
    evidence: { disposition: item.disposition, area: item.area },
  }));
  const livenessProofs = livenessEntries.map((entry) => {
    const result = evaluateMissionLiveness(entry.observation);
    return proofEntry({
      id: entry.id,
      status: result.status.toLowerCase(),
      evidence: { code: result.code },
    });
  });
  if (!Array.isArray(spatialReport.proofs)) {
    throw new TypeError('spatial report must publish state proofs');
  }
  const retirementByProof = new Map();
  for (const retirement of actorRetirements) {
    if (retirementByProof.has(retirement.proofId)) {
      throw new TypeError(`actor retirement duplicates proof ${retirement.proofId}`);
    }
    retirementByProof.set(retirement.proofId, retirement);
  }
  const spatialProofs = spatialReport.proofs.map((item) => {
    const retirement = retirementByProof.get(item.id);
    if (retirement) retirementByProof.delete(item.id);
    return proofEntry({
      ...item,
      evidence: retirement
        ? {
          ...(item.evidence ?? {}),
          reviewedActorRetirement: actorRetirementReceipt(retirement),
        }
        : item.evidence,
    });
  });
  if (retirementByProof.size > 0) {
    throw new TypeError(
      `actor retirement references unknown spatial proof ${[...retirementByProof.keys()].join(', ')}`,
    );
  }

  return Object.freeze({
    schemaVersion: CERTIFICATION_DEBT_SCHEMA_VERSION,
    policy: 'subtractive',
    domains: Object.freeze({
      architecture: domainDocument(architecture, architectureProofs),
      semantic_contract: domainDocument(semanticContract, semanticProofs),
      liveness: domainDocument(liveness, livenessProofs),
      spatial: domainDocument(spatial, spatialProofs),
    }),
  });
}

function parseSpatialReport(stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`spatial debt report was not valid JSON: ${error.message}`);
  }
}

export function collectSpatialDebtReport({
  repositoryRoot = REPOSITORY_ROOT,
  spawn = spawnSync,
} = {}) {
  const result = spawn(process.execPath, ['tools/verify-staging.mjs', '--json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`spatial debt report ended on signal ${result.signal}`);
  const report = parseSpatialReport(result.stdout?.trim() ?? '');
  /* Exit 1 is the expected strict-zero result while known findings remain.
   * Any other non-zero code means the report itself did not complete. */
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `spatial debt report exited ${result.status}: ${(result.stderr ?? '').trim()}`,
    );
  }
  return report;
}

export function collectCertificationDebtSnapshot({
  spatialReport = null,
  semanticReport = null,
  actorRetirements = null,
} = {}) {
  const resolvedSpatial = spatialReport ?? collectSpatialDebtReport();
  const resolvedActorRetirements = actorRetirements
    ?? readActorRetirementLedger().entries;
  return certificationDebtSnapshot({
    architectureReport: buildSceneArchitectureReport(),
    semanticReport: semanticReport ?? buildSemanticSmokeReport(),
    livenessEntries: buildSceneLivenessCatalog(),
    spatialReport: resolvedSpatial,
    actorRetirements: resolvedActorRetirements,
  });
}

function expectedSummary(entries) {
  return canonicalValue(summarizeEntries(entries));
}

export function validateCertificationDebtSnapshot(snapshot, { label = 'snapshot' } = {}) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return [`${label} must be an object`];
  }
  if (snapshot.schemaVersion !== CERTIFICATION_DEBT_SCHEMA_VERSION) {
    errors.push(`${label}.schemaVersion must be ${CERTIFICATION_DEBT_SCHEMA_VERSION}`);
  }
  if (snapshot.policy !== 'subtractive') errors.push(`${label}.policy must be subtractive`);
  if (!snapshot.domains || typeof snapshot.domains !== 'object') {
    errors.push(`${label}.domains must be an object`);
    return errors;
  }

  const actualDomains = Object.keys(snapshot.domains).sort();
  const expectedDomains = [...CERTIFICATION_DEBT_DOMAINS].sort();
  if (JSON.stringify(actualDomains) !== JSON.stringify(expectedDomains)) {
    errors.push(`${label}.domains must contain exactly ${expectedDomains.join(', ')}`);
  }
  for (const domainName of CERTIFICATION_DEBT_DOMAINS) {
    const domain = snapshot.domains[domainName];
    if (!domain || typeof domain !== 'object' || !Array.isArray(domain.entries)) {
      errors.push(`${label}.domains.${domainName}.entries must be an array`);
      continue;
    }
    const ids = new Set();
    for (const [index, entry] of domain.entries.entries()) {
      const at = `${label}.domains.${domainName}.entries[${index}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`${at} must be an object`);
        continue;
      }
      if (typeof entry.id !== 'string' || !entry.id.trim()) errors.push(`${at}.id is required`);
      else if (ids.has(entry.id)) errors.push(`${at}.id duplicates ${entry.id}`);
      else ids.add(entry.id);
      if (typeof entry.status !== 'string' || !entry.status.trim()) {
        errors.push(`${at}.status is required`);
      }
      if (!Number.isInteger(entry.count) || entry.count < 1) {
        errors.push(`${at}.count must be a positive integer`);
      }
      if (!/^[a-f\d]{20}$/u.test(entry.fingerprint ?? '')) {
        errors.push(`${at}.fingerprint must be a 20-character SHA-256 prefix`);
      }
      if (typeof entry.proofId !== 'string' || !entry.proofId.trim()) {
        errors.push(`${at}.proofId is required`);
      }
      if (typeof entry.proofKind !== 'string' || !entry.proofKind.trim()) {
        errors.push(`${at}.proofKind is required`);
      }
    }
    if (JSON.stringify(canonicalValue(domain.summary))
      !== JSON.stringify(expectedSummary(domain.entries))) {
      errors.push(`${label}.domains.${domainName}.summary does not match its entries`);
    }
    const sorted = [...domain.entries].sort((left, right) => compareStableText(left.id, right.id));
    if (domain.entries.some((entry, index) => entry.id !== sorted[index]?.id)) {
      errors.push(`${label}.domains.${domainName}.entries must be sorted by id`);
    }
    if (!Array.isArray(domain.proofs)) {
      errors.push(`${label}.domains.${domainName}.proofs must be an array`);
      continue;
    }
    const proofIds = new Set();
    for (const [index, proof] of domain.proofs.entries()) {
      const at = `${label}.domains.${domainName}.proofs[${index}]`;
      if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
        errors.push(`${at} must be an object`);
        continue;
      }
      if (typeof proof.id !== 'string' || !proof.id.trim()) errors.push(`${at}.id is required`);
      else if (proofIds.has(proof.id)) errors.push(`${at}.id duplicates ${proof.id}`);
      else proofIds.add(proof.id);
      if (typeof proof.status !== 'string' || !proof.status.trim()) {
        errors.push(`${at}.status is required`);
      }
    }
    for (const entry of domain.entries) {
      if (!proofIds.has(entry.proofId)) {
        errors.push(
          `${label}.domains.${domainName} has no proof ${entry.proofId} for debt ${entry.id}`,
        );
      }
    }
    const sortedProofs = [...domain.proofs]
      .sort((left, right) => compareStableText(left.id, right.id));
    if (domain.proofs.some((proof, index) => proof.id !== sortedProofs[index]?.id)) {
      errors.push(`${label}.domains.${domainName}.proofs must be sorted by id`);
    }
  }
  return errors;
}

/**
 * Compare a current snapshot to the checked-in ceiling. Baseline-only IDs and
 * lower per-ID counts are improvements. Everything else must remain identical.
 */
export function compareCertificationDebt(baseline, current) {
  const errors = [
    ...validateCertificationDebtSnapshot(baseline, { label: 'baseline' }),
    ...validateCertificationDebtSnapshot(current, { label: 'current' }),
  ];
  if (errors.length) return { errors, violations: [], improvements: [] };

  const violations = [];
  const improvements = [];
  for (const domainName of CERTIFICATION_DEBT_DOMAINS) {
    const baselineById = new Map(
      baseline.domains[domainName].entries.map((entry) => [entry.id, entry]),
    );
    const currentById = new Map(
      current.domains[domainName].entries.map((entry) => [entry.id, entry]),
    );
    for (const entry of current.domains[domainName].entries) {
      const expected = baselineById.get(entry.id);
      if (!expected) {
        violations.push({ domain: domainName, id: entry.id, kind: 'NEW_DEBT', current: entry });
        continue;
      }
      if (entry.status !== expected.status || entry.fingerprint !== expected.fingerprint
        || entry.proofId !== expected.proofId || entry.proofKind !== expected.proofKind) {
        violations.push({
          domain: domainName,
          id: entry.id,
          kind: 'DEBT_CHANGED',
          baseline: expected,
          current: entry,
        });
      }
      if (entry.count > expected.count) {
        violations.push({
          domain: domainName,
          id: entry.id,
          kind: 'DEBT_GREW',
          baseline: expected,
          current: entry,
        });
      } else if (entry.count < expected.count) {
        improvements.push({
          domain: domainName,
          id: entry.id,
          kind: 'DEBT_SHRANK',
          removed: expected.count - entry.count,
          baseline: expected,
          current: entry,
        });
      }
    }
    for (const entry of baseline.domains[domainName].entries) {
      if (!currentById.has(entry.id)) {
        improvements.push({
          domain: domainName,
          id: entry.id,
          kind: 'DEBT_REMOVED',
          removed: entry.count,
          baseline: entry,
          current: null,
        });
      }
    }
  }
  return { errors, violations, improvements };
}

function semanticProofIndex(proofs, obligations) {
  const violations = [];
  const obligationById = new Map();
  for (const obligation of obligations ?? []) {
    if (!obligation?.id) {
      violations.push({ kind: 'SEMANTIC_OBLIGATION_INVALID', id: null });
      continue;
    }
    if (obligationById.has(obligation.id)) {
      violations.push({ kind: 'SEMANTIC_OBLIGATION_DUPLICATE', id: obligation.id });
      continue;
    }
    obligationById.set(obligation.id, obligation);
  }

  const proofById = new Map();
  for (const proof of proofs ?? []) {
    const id = proof?.id ?? null;
    if (proofById.has(id)) {
      violations.push({ kind: 'SEMANTIC_BROWSER_PROOF_DUPLICATE', id });
      continue;
    }
    const obligation = obligationById.get(id);
    if (!obligation) {
      violations.push({ kind: 'SEMANTIC_BROWSER_PROOF_UNKNOWN', id });
      continue;
    }
    const expectedFingerprint = semanticObligationFingerprint(obligation);
    if (proof.status !== 'pass' || proof.source !== 'browser') {
      violations.push({ kind: 'SEMANTIC_BROWSER_PROOF_NOT_PASS', id });
      continue;
    }
    if (proof.entrypointId !== obligation.entrypointId) {
      violations.push({ kind: 'SEMANTIC_BROWSER_PROOF_WRONG_ENTRYPOINT', id });
      continue;
    }
    if (proof.fingerprint !== expectedFingerprint) {
      violations.push({ kind: 'SEMANTIC_BROWSER_PROOF_STALE', id });
      continue;
    }
    proofById.set(id, proof);
  }
  return { proofById, violations };
}

function browserDiagnosticsAreClean(errors) {
  const fields = ['page', 'console', 'requests', 'responses', 'action'];
  return errors && typeof errors === 'object'
    && fields.every((field) => Array.isArray(errors[field]) && errors[field].length === 0);
}

function assertUniqueById(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (typeof item?.id !== 'string' || !item.id.trim()) {
      throw new Error(`${label} contains an item without an id`);
    }
    if (seen.has(item.id)) throw new Error(`${label} contains duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

/**
 * Convert a same-run browser report into transient exact-obligation proofs.
 * The report may remain UNKNOWN overall; an exact PASS is still useful when
 * every diagnostic channel is clean. Any overall FAIL contaminates all PASS
 * rows from that page and is rejected.
 */
export function extractSemanticBrowserProofs(report, { targetIds, obligations } = {}) {
  if (report?.schema !== 'squatchsmash.semantic-smoke-browser-run.v1'
    || !Array.isArray(report.results)) {
    throw new Error('semantic browser report has an unsupported run schema');
  }
  if (report.status === 'FAIL') throw new Error('semantic browser report has overall FAIL status');
  if (!['PASS', 'UNKNOWN'].includes(report.status)) {
    throw new Error(`semantic browser report has invalid status ${report.status}`);
  }

  const targets = [...new Set(targetIds ?? [])].sort(compareStableText);
  if (targets.length !== (targetIds ?? []).length) {
    throw new Error('semantic browser target list contains duplicate ids');
  }
  assertUniqueById(obligations ?? [], 'current semantic obligations');
  const obligationById = new Map((obligations ?? []).map((item) => [item.id, item]));
  const targetObligations = targets.map((id) => {
    const obligation = obligationById.get(id);
    if (!obligation) throw new Error(`current semantic obligation ${id} is missing`);
    return obligation;
  });
  const entrypointIds = [...new Set(targetObligations.map((item) => item.entrypointId))];
  if (entrypointIds.length !== 1) {
    throw new Error('one semantic browser report must target exactly one entrypoint');
  }
  const [entrypointId] = entrypointIds;
  const matching = report.results.filter((item) => item?.entrypointId === entrypointId);
  if (matching.length !== 1 || report.results.length !== 1) {
    throw new Error(`semantic browser report did not contain exactly entrypoint ${entrypointId}`);
  }
  const [result] = matching;
  if (result.schema !== 'squatchsmash.semantic-smoke-browser.v1') {
    throw new Error(`semantic browser result for ${entrypointId} has an unsupported schema`);
  }
  if (result.status === 'FAIL') {
    throw new Error(`semantic browser result for ${entrypointId} has overall FAIL status`);
  }
  if (!browserDiagnosticsAreClean(result.errors)) {
    throw new Error(`semantic browser result for ${entrypointId} has diagnostic contamination`);
  }
  if (result.transport?.navigated !== true
    || !Number.isFinite(result.transport?.httpStatus)
    || result.transport.httpStatus < 200
    || result.transport.httpStatus >= 400) {
    throw new Error(`semantic browser result for ${entrypointId} lacks successful transport evidence`);
  }
  if (!Array.isArray(result.obligations)) {
    throw new Error(`semantic browser result for ${entrypointId} has no obligation receipts`);
  }
  assertUniqueById(result.obligations, `semantic browser result ${entrypointId}`);

  const expected = (obligations ?? []).filter((item) => item.entrypointId === entrypointId);
  const expectedIds = expected.map((item) => item.id).sort(compareStableText);
  const observedIds = result.obligations.map((item) => item.id).sort(compareStableText);
  if (JSON.stringify(expectedIds) !== JSON.stringify(observedIds)) {
    throw new Error(`semantic browser result for ${entrypointId} has missing or extra obligations`);
  }
  const resultById = new Map(result.obligations.map((item) => [item.id, item]));
  for (const obligation of expected) {
    const observed = resultById.get(obligation.id);
    if (semanticObligationFingerprint(observed)
      !== semanticObligationFingerprint(obligation)) {
      throw new Error(`semantic browser obligation ${obligation.id} fingerprint is stale`);
    }
    if (observed.sceneId !== obligation.sceneId
      || observed.entrypointId !== obligation.entrypointId) {
      throw new Error(`semantic browser obligation ${obligation.id} has wrong scene or entrypoint`);
    }
  }

  return targets.flatMap((id) => {
    const observed = resultById.get(id);
    if (observed.status !== 'PASS') return [];
    const obligation = obligationById.get(id);
    return [{
      id,
      status: 'pass',
      source: 'browser',
      entrypointId,
      fingerprint: semanticObligationFingerprint(obligation),
    }];
  });
}

function parseSemanticBrowserReport(stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`semantic browser report was not valid JSON: ${error.message}`);
  }
}

/** Run only entrypoints whose semantic debt is being removed in this change. */
export function collectLiveSemanticBrowserProofs({
  targetIds,
  obligations,
  repositoryRoot = REPOSITORY_ROOT,
  spawn = spawnSync,
} = {}) {
  const targets = [...new Set(targetIds ?? [])].sort(compareStableText);
  if (targets.length !== (targetIds ?? []).length) {
    throw new Error('semantic browser target list contains duplicate ids');
  }
  if (targets.length === 0) return [];
  const obligationById = new Map((obligations ?? []).map((item) => [item.id, item]));
  const byEntrypoint = new Map();
  for (const id of targets) {
    const obligation = obligationById.get(id);
    if (!obligation) throw new Error(`current semantic obligation ${id} is missing`);
    if (!byEntrypoint.has(obligation.entrypointId)) byEntrypoint.set(obligation.entrypointId, []);
    byEntrypoint.get(obligation.entrypointId).push(id);
  }

  const proofs = [];
  for (const [entrypointId, ids] of [...byEntrypoint.entries()]
    .sort(([left], [right]) => compareStableText(left, right))) {
    const result = spawn(process.execPath, [
      'tools/semantic-smoke-browser.mjs',
      '--entrypoint',
      entrypointId,
      '--json',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.signal) {
      throw new Error(`semantic browser ${entrypointId} ended on signal ${result.signal}`);
    }
    const report = parseSemanticBrowserReport(result.stdout?.trim() ?? '');
    /* UNKNOWN is exit 2 and may contain exact clean PASS receipts. */
    if (result.status !== 0 && result.status !== 2) {
      if (report.status === 'FAIL') {
        throw new Error(`semantic browser ${entrypointId} reported overall FAIL`);
      }
      throw new Error(
        `semantic browser ${entrypointId} exited ${result.status}: ${(result.stderr ?? '').trim()}`,
      );
    }
    proofs.push(...extractSemanticBrowserProofs(report, {
      targetIds: ids,
      obligations,
    }));
  }
  return proofs;
}

/**
 * The checked-in candidate must match current debt exactly so an improvement
 * immediately lowers the ceiling. The candidate must itself be a subtractive
 * change from the base-branch ceiling so a PR cannot approve its own new debt.
 */
export function evaluateCertificationDebtGate({
  trusted = null,
  candidate,
  current,
  semanticObligations = [],
  semanticBrowserProofs = [],
}) {
  const trustedComparison = trusted ? compareCertificationDebt(trusted, candidate) : null;
  const currentComparison = compareCertificationDebt(candidate, current);
  const semanticProofs = semanticProofIndex(semanticBrowserProofs, semanticObligations);
  const proofMismatches = [];
  for (const domainName of CERTIFICATION_DEBT_DOMAINS) {
    if (JSON.stringify(canonicalValue(candidate.domains?.[domainName]?.proofs))
      !== JSON.stringify(canonicalValue(current.domains?.[domainName]?.proofs))) {
      proofMismatches.push(`${domainName} proof inventory does not match current observations`);
    }
  }
  const unprovedTrustedImprovements = trustedComparison
    ? trustedComparison.improvements.filter((item) => !hasRemovalProof(
      item,
      current,
      semanticProofs.proofById,
    ))
    : [];
  const proofCoverageViolations = trusted
    ? compareTrustedProofCoverage(trusted, candidate, current)
    : [];
  const trustedFailed = Boolean(trustedComparison
    && (trustedComparison.errors.length || trustedComparison.violations.length
      || unprovedTrustedImprovements.length || proofCoverageViolations.length
      || semanticProofs.violations.length));
  const currentFailed = currentComparison.errors.length
    || currentComparison.violations.length
    || currentComparison.improvements.length;
  return {
    pass: !trustedFailed && !currentFailed && proofMismatches.length === 0,
    trustedComparison,
    currentComparison,
    staleBaseline: currentComparison.improvements,
    unprovedTrustedImprovements,
    proofCoverageViolations,
    proofMismatches,
    semanticProofViolations: semanticProofs.violations,
  };
}

/**
 * Browser work is demand-driven: no trusted semantic subtraction means no
 * browser launch. This keeps ordinary CI changes cheap while making every
 * promotion pay for fresh, exact behavioral evidence.
 */
export function evaluateCertificationDebtGateWithLiveSemanticProofs({
  trusted = null,
  candidate,
  current,
  semanticObligations = [],
  collectProofs = collectLiveSemanticBrowserProofs,
} = {}) {
  const trustedComparison = trusted ? compareCertificationDebt(trusted, candidate) : null;
  const currentComparison = compareCertificationDebt(candidate, current);
  const comparisonsUsable = trustedComparison
    && trustedComparison.errors.length === 0
    && trustedComparison.violations.length === 0
    && currentComparison.errors.length === 0
    && currentComparison.violations.length === 0
    && currentComparison.improvements.length === 0;
  const targetIds = comparisonsUsable
    ? trustedComparison.improvements
      .filter((item) => item.domain === 'semantic_contract')
      .map((item) => item.id)
      .sort(compareStableText)
    : [];
  const semanticBrowserProofs = targetIds.length > 0
    ? collectProofs({ targetIds, obligations: semanticObligations })
    : [];
  const gate = evaluateCertificationDebtGate({
    trusted,
    candidate,
    current,
    semanticObligations,
    semanticBrowserProofs,
  });
  return {
    ...gate,
    semanticBrowserTargets: targetIds,
    semanticBrowserProofs,
  };
}

function proofMap(snapshot, domainName) {
  const proofs = snapshot?.domains?.[domainName]?.proofs;
  return new Map(Array.isArray(proofs) ? proofs.map((item) => [item.id, item]) : []);
}

function validActorIdInventory(value) {
  return Array.isArray(value)
    && value.every((id) => typeof id === 'string' && id.trim().length > 0)
    && value.every((id, index) => index === 0 || value[index - 1] <= id);
}

function missingActorIds(priorIds, currentIds) {
  const available = new Map();
  for (const id of currentIds) available.set(id, (available.get(id) ?? 0) + 1);
  const missing = [];
  for (const id of priorIds) {
    const count = available.get(id) ?? 0;
    if (count === 0) missing.push(id);
    else available.set(id, count - 1);
  }
  return missing;
}

function actorInventoryIsConsistent(evidence) {
  const observedIds = evidence.actorObservedIds;
  const discoveredIds = evidence.actorDiscoveredIds;
  const filteredIds = evidence.visibilityFilteredActorIds;
  if (!validActorIdInventory(observedIds)
    || !validActorIdInventory(discoveredIds)
    || !validActorIdInventory(filteredIds)) return false;
  if (observedIds.length !== evidence.actorsObserved
    || discoveredIds.length !== evidence.actorsDiscovered
    || filteredIds.length !== evidence.visibilityFilteredActors
    || evidence.visibilityFilteredActors !== evidence.actorsDiscovered - evidence.actorsObserved) {
    return false;
  }
  const recomposed = [...observedIds, ...filteredIds].sort(compareStableText);
  return JSON.stringify(recomposed) === JSON.stringify(discoveredIds);
}

function removeActorIds(inventory, removedIds) {
  const removed = new Set(removedIds);
  return inventory.filter((id) => !removed.has(id));
}

function sameActorIds(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * A retirement receipt is deliberately narrower than an allowlist. It proves
 * one whole state changed from an exact trusted cast inventory to an explicit
 * no-cast contract. Partial removals, simultaneous visibility changes, stale
 * IDs, and a receipt copied to another proof all fail closed.
 */
function reviewedActorRetirement(prior, observed) {
  const receipt = observed?.evidence?.reviewedActorRetirement;
  if (receipt === undefined) return { present: false, approved: false, reason: null };
  const fail = (reason) => ({ present: true, approved: false, reason });
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return fail('receipt must be an object');
  }
  if (receipt.schema !== CERTIFICATION_ACTOR_RETIREMENTS_SCHEMA) {
    return fail('receipt schema is unsupported');
  }
  if (receipt.proofId !== prior.id || observed.id !== prior.id) {
    return fail('receipt belongs to another spatial proof');
  }
  if (!Array.isArray(receipt.actorIds) || receipt.actorIds.length === 0
    || !validActorIdInventory(receipt.actorIds)
    || new Set(receipt.actorIds).size !== receipt.actorIds.length) {
    return fail('receipt actor IDs are invalid');
  }
  if (typeof receipt.reason !== 'string' || receipt.reason.trim().length < 20
    || !sourceCitation(receipt.source)
    || typeof receipt.sourceAnchor !== 'string' || !receipt.sourceAnchor.trim()) {
    return fail('receipt lacks a reviewed reason or source citation');
  }
  if (receipt.fingerprint !== actorRetirementFingerprint(receipt)) {
    return fail('receipt fingerprint is stale');
  }

  const before = prior.evidence ?? {};
  const after = observed.evidence ?? {};
  if (!actorInventoryIsConsistent(before) || !actorInventoryIsConsistent(after)) {
    return fail('actor inventory evidence is inconsistent');
  }
  if (!sameActorIds(receipt.actorIds, before.actorDiscoveredIds)) {
    return fail('receipt does not retire the exact trusted discovered cast');
  }
  const expectedObserved = removeActorIds(before.actorObservedIds, receipt.actorIds);
  const expectedDiscovered = removeActorIds(before.actorDiscoveredIds, receipt.actorIds);
  const expectedFiltered = removeActorIds(before.visibilityFilteredActorIds, receipt.actorIds);
  if (!sameActorIds(after.actorObservedIds, expectedObserved)
    || !sameActorIds(after.actorDiscoveredIds, expectedDiscovered)
    || !sameActorIds(after.visibilityFilteredActorIds, expectedFiltered)) {
    return fail('current cast inventory changed beyond the reviewed IDs');
  }
  if (observed.status !== 'intentional_na'
    || after.built !== true
    || after.findingsScanned !== true
    || after.unmarkedRigs !== 0
    || after.actorsObserved !== 0
    || after.actorsDiscovered !== 0
    || after.actorVisibilityPolicy !== 'rendered_only'
    || after.actorExpectation?.disposition !== 'INTENTIONAL_NA'
    || after.actorExpectation?.minimum !== 0
    || typeof after.actorExpectation?.reason !== 'string'
    || !after.actorExpectation.reason.trim()) {
    return fail('current proof is not an exact intentional no-cast contract');
  }
  return { present: true, approved: true, reason: null };
}

/**
 * Debt may disappear only while the subject inventory remains observable.
 * Otherwise deleting a scene, obligation, checkpoint, state, or actor could
 * look like remediation. New proof IDs increase coverage and are allowed.
 */
export function compareTrustedProofCoverage(trusted, candidate, current) {
  const violations = [];
  for (const domainName of CERTIFICATION_DEBT_DOMAINS) {
    const trustedProofs = proofMap(trusted, domainName);
    const candidateProofs = proofMap(candidate, domainName);
    const currentProofs = proofMap(current, domainName);
    for (const [id, prior] of trustedProofs) {
      if (!candidateProofs.has(id)) {
        violations.push({ domain: domainName, id, kind: 'CANDIDATE_COVERAGE_REMOVED' });
      }
      const observed = currentProofs.get(id);
      if (!observed) {
        violations.push({ domain: domainName, id, kind: 'CURRENT_COVERAGE_REMOVED' });
        continue;
      }
      if (domainName !== 'spatial') continue;
      const retirement = reviewedActorRetirement(prior, observed);
      if (retirement.present && !retirement.approved) {
        violations.push({
          domain: domainName,
          id,
          kind: 'ACTOR_RETIREMENT_PROOF_INVALID',
          reason: retirement.reason,
        });
      }
      const priorActors = prior.evidence?.actorsObserved;
      const currentActors = observed.evidence?.actorsObserved;
      const priorDiscoveredActors = prior.evidence?.actorsDiscovered;
      const currentDiscoveredActors = observed.evidence?.actorsDiscovered;
      if (Number.isInteger(priorDiscoveredActors)
        && (!Number.isInteger(currentDiscoveredActors)
          || currentDiscoveredActors < priorDiscoveredActors)
        && !retirement.approved) {
        violations.push({
          domain: domainName,
          id,
          kind: 'ACTOR_DISCOVERED_COVERAGE_SHRANK',
          baseline: priorDiscoveredActors,
          current: Number.isInteger(currentDiscoveredActors) ? currentDiscoveredActors : null,
        });
      }
      const priorActorIds = prior.evidence?.actorDiscoveredIds;
      if (priorActorIds !== undefined) {
        const currentActorIds = observed.evidence?.actorDiscoveredIds;
        if (!validActorIdInventory(priorActorIds)
          || !validActorIdInventory(currentActorIds)) {
          violations.push({
            domain: domainName,
            id,
            kind: 'ACTOR_ID_INVENTORY_INVALID',
          });
        } else {
          const missing = missingActorIds(priorActorIds, currentActorIds);
          if (missing.length > 0 && !retirement.approved) {
            violations.push({
              domain: domainName,
              id,
              kind: 'ACTOR_ID_COVERAGE_SHRANK',
              missing,
            });
          }
        }
      }
      if (Number.isInteger(priorActors) && Number.isInteger(currentActors)
        && currentActors < priorActors) {
        if (retirement.approved) continue;
        const discoveredActors = observed.evidence?.actorsDiscovered;
        const filteredActors = observed.evidence?.visibilityFilteredActors;
        /* The old collector counted hidden descendants as staged cast. A
         * reviewed rendered-only correction may lower the visible count, but
         * only while the same proof still discovers at least the complete
         * historical marker inventory and accounts for the difference
         * exactly. Deleting or unmarking one actor still fails the floor. */
        const visibilityCorrectionProvesInventory = (
          observed.evidence?.actorVisibilityPolicy === 'rendered_only'
          && Number.isInteger(discoveredActors)
          && Number.isInteger(filteredActors)
          && discoveredActors >= priorActors
          && discoveredActors >= currentActors
          && filteredActors === discoveredActors - currentActors
        );
        if (visibilityCorrectionProvesInventory) continue;
        violations.push({
          domain: domainName,
          id,
          kind: 'ACTOR_COVERAGE_SHRANK',
          baseline: priorActors,
          current: currentActors,
          discovered: Number.isInteger(discoveredActors) ? discoveredActors : null,
        });
      }
    }
  }
  return violations;
}

function proofFor(snapshot, domainName, id) {
  return snapshot.domains[domainName].proofs.find((item) => item.id === id) ?? null;
}

function hasRemovalProof(improvement, current, semanticBrowserProofs = new Map()) {
  const entry = improvement.current ?? improvement.baseline;
  const proof = proofFor(current, improvement.domain, entry.proofId);
  if (!proof) return false;
  if (improvement.domain === 'architecture') return proof.status === 'pass';
  if (improvement.domain === 'semantic_contract') {
    return semanticBrowserProofs.has(entry.proofId);
  }
  if (improvement.domain === 'liveness') return proof.status === 'pass';
  if (improvement.domain !== 'spatial') return false;

  const evidence = proof.evidence ?? {};
  if (entry.proofKind === 'build') return evidence.built === true;
  if (entry.proofKind === 'zero_actors') {
    /* A zero-actor UNKNOWN can be resolved either by observing the missing
     * cast or by replacing the vacuous assumption with an explicit, reasoned
     * no-cast contract. The latter still has executable evidence: the state
     * built, observed zero visible actors, and the registry says that exact
     * result is intentional. */
    return (
      evidence.built === true
      && evidence.actorsObserved > 0
      && evidence.findingsScanned === true
    ) || (
      proof.status === 'intentional_na'
      && evidence.built === true
      && evidence.actorsObserved === 0
      && actorInventoryIsConsistent(evidence)
      && evidence.actorVisibilityPolicy === 'rendered_only'
      && evidence.unmarkedRigs === 0
      && evidence.findingsScanned === true
      && ['PASS', 'UNKNOWN', 'NOT_APPLICABLE'].includes(evidence.spatialCoverageStatus)
      && evidence.actorExpectation?.disposition === 'INTENTIONAL_NA'
      && evidence.actorExpectation?.minimum === 0
      && typeof evidence.actorExpectation?.reason === 'string'
      && evidence.actorExpectation.reason.trim().length > 0
    );
  }
  if (entry.proofKind === 'unmarked_rigs') return evidence.unmarkedRigs === 0;
  if (entry.proofKind === 'coverage') {
    /* Count reduction means fewer legacy solids and is safe while the state is
     * still observed. Deleting the coverage record requires typed PASS. */
    return improvement.kind === 'DEBT_SHRANK'
      ? evidence.built === true && evidence.actorsObserved > 0
      : evidence.spatialCoverageStatus === 'PASS';
  }
  if (entry.proofKind === 'finding') {
    return evidence.built === true && evidence.findingsScanned === true;
  }
  return false;
}

export function readCertificationDebtBaseline(file = DEFAULT_CERTIFICATION_DEBT_BASELINE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runGit(spawn, args, repositoryRoot) {
  const result = spawn('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`git ${args[0]} ended on signal ${result.signal}`);
  return result;
}

/**
 * Load the ceiling from an immutable git commit. Missing-path bootstrap is
 * allowed only after the ref resolves and ls-tree positively proves the file
 * is absent. Shallow history, a typo, or a git error therefore fails closed.
 */
export function readTrustedCertificationDebtBaseline(ref, {
  repositoryRoot = REPOSITORY_ROOT,
  spawn = spawnSync,
  allowMissing = false,
} = {}) {
  if (typeof ref !== 'string' || !ref.trim()) throw new TypeError('trusted ref is required');
  const resolved = runGit(spawn, ['rev-parse', '--verify', `${ref}^{commit}`], repositoryRoot);
  if (resolved.status !== 0 || !resolved.stdout.trim()) {
    throw new Error(`trusted ref ${ref} did not resolve to a commit`);
  }
  const commit = resolved.stdout.trim();
  const shown = runGit(
    spawn,
    ['show', `${commit}:${BASELINE_REPOSITORY_PATH}`],
    repositoryRoot,
  );
  if (shown.status === 0) {
    try {
      return { commit, missing: false, baseline: JSON.parse(shown.stdout) };
    } catch (error) {
      throw new Error(`trusted baseline at ${commit} is invalid JSON: ${error.message}`);
    }
  }

  const tree = runGit(
    spawn,
    ['ls-tree', '--name-only', commit, '--', BASELINE_REPOSITORY_PATH],
    repositoryRoot,
  );
  if (tree.status !== 0) {
    throw new Error(`could not inspect trusted baseline path at ${commit}`);
  }
  if (tree.stdout.trim()) {
    throw new Error(`trusted baseline exists at ${commit}, but git show could not read it`);
  }
  if (!allowMissing) {
    throw new Error(
      `trusted baseline is absent at ${commit}; use --allow-missing-trusted-baseline only for the reviewed initial bootstrap`,
    );
  }
  return { commit, missing: true, baseline: null };
}

function parseArgs(argv) {
  const options = {
    baseline: DEFAULT_CERTIFICATION_DEBT_BASELINE,
    json: false,
    printCurrent: false,
    writeBaseline: false,
    trustedRef: null,
    allowMissingTrustedBaseline: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--print-current') options.printCurrent = true;
    else if (argument === '--write-baseline') options.writeBaseline = true;
    else if (argument === '--trusted-ref') options.trustedRef = argv[++index] ?? null;
    else if (argument.startsWith('--trusted-ref=')) {
      options.trustedRef = argument.slice('--trusted-ref='.length);
    } else if (argument === '--allow-missing-trusted-baseline') {
      options.allowMissingTrustedBaseline = true;
    }
    else if (argument === '--baseline') options.baseline = path.resolve(argv[++index] ?? '');
    else if (argument.startsWith('--baseline=')) {
      options.baseline = path.resolve(argument.slice('--baseline='.length));
    } else throw new Error(`Unknown argument ${argument}`);
  }
  if (options.printCurrent && options.writeBaseline) {
    throw new Error('--print-current and --write-baseline are mutually exclusive');
  }
  if (options.allowMissingTrustedBaseline && !options.trustedRef) {
    throw new Error('--allow-missing-trusted-baseline requires --trusted-ref');
  }
  return options;
}

function printComparison(label, comparison) {
  if (!comparison) return;
  if (comparison.errors.length) {
    console.error(`${label} document errors:`);
    for (const error of comparison.errors) console.error(`  ${error}`);
  }
  if (comparison.violations.length) {
    console.error(`${label} violations:`);
    for (const item of comparison.violations) {
      console.error(`  ${item.kind} ${item.domain}/${item.id}`);
    }
  }
}

function printHuman(candidate, current, gate, trustedState) {
  console.log('Certification debt ratchet (subtractive baseline)');
  for (const domainName of CERTIFICATION_DEBT_DOMAINS) {
    const before = candidate.domains[domainName].summary;
    const now = current.domains[domainName].summary;
    console.log(
      `${domainName}: candidate=${before.records} records/${before.units} units `
      + `current=${now.records} records/${now.units} units`,
    );
  }
  if (trustedState) {
    console.log(trustedState.missing
      ? `Trusted ceiling: initial bootstrap; ${trustedState.commit} proves the path absent.`
      : `Trusted ceiling: ${trustedState.commit}.`);
  } else {
    console.log('Trusted ceiling: not checked (local mode; CI must pass --trusted-ref).');
  }
  printComparison('Trusted-ceiling', gate.trustedComparison);
  printComparison('Current-debt', gate.currentComparison);
  if (gate.staleBaseline.length) {
    const units = gate.staleBaseline.reduce((total, item) => total + item.removed, 0);
    console.error(
      `STALE_BASELINE: current debt removed ${units} unit(s); ratchet the checked-in baseline down in this change.`,
    );
    for (const item of gate.staleBaseline) {
      console.error(`  ${item.kind} ${item.domain}/${item.id} (-${item.removed})`);
    }
  }
  if (gate.unprovedTrustedImprovements.length) {
    console.error('UNPROVED_IMPROVEMENT: debt disappeared without executable PASS evidence:');
    for (const item of gate.unprovedTrustedImprovements) {
      console.error(`  ${item.kind} ${item.domain}/${item.id}`);
    }
  }
  if (gate.proofCoverageViolations.length) {
    console.error('COVERAGE_FLOOR: a previously observed subject disappeared or shrank:');
    for (const item of gate.proofCoverageViolations) {
      console.error(`  ${item.kind} ${item.domain}/${item.id}`);
    }
  }
  if (gate.proofMismatches.length) {
    console.error('PROOF_BASELINE: checked-in proof inventory is stale:');
    for (const message of gate.proofMismatches) console.error(`  ${message}`);
  }
  if (gate.semanticProofViolations.length) {
    console.error('SEMANTIC_BROWSER_PROOF: transient live proof was invalid:');
    for (const item of gate.semanticProofViolations) {
      console.error(`  ${item.kind} ${item.id ?? '(missing id)'}`);
    }
  }
  if (gate.semanticBrowserTargets?.length) {
    console.log(
      `Live semantic browser evidence: ${gate.semanticBrowserProofs.length}/`
      + `${gate.semanticBrowserTargets.length} exact obligation(s) passed.`,
    );
  }
  if (gate.pass) {
    console.log('Candidate matches current debt and does not raise the trusted ceiling.');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const semanticReport = buildSemanticSmokeReport();
  const current = collectCertificationDebtSnapshot({ semanticReport });
  if (options.printCurrent) {
    console.log(JSON.stringify(current, null, 2));
    return;
  }
  if (options.writeBaseline) {
    fs.writeFileSync(options.baseline, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    console.log(`Wrote reviewed baseline candidate to ${path.relative(REPOSITORY_ROOT, options.baseline)}.`);
    return;
  }
  const candidate = readCertificationDebtBaseline(options.baseline);
  const trustedState = options.trustedRef
    ? readTrustedCertificationDebtBaseline(options.trustedRef, {
      allowMissing: options.allowMissingTrustedBaseline,
    })
    : null;
  const gate = evaluateCertificationDebtGateWithLiveSemanticProofs({
    trusted: trustedState?.baseline ?? null,
    candidate,
    current,
    semanticObligations: semanticReport.obligations,
  });
  if (options.json) console.log(JSON.stringify({ trustedState, candidate, current, gate }, null, 2));
  else printHuman(candidate, current, gate, trustedState);
  if (!gate.pass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(TOOL_PATH)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
