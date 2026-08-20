#!/usr/bin/env node

/**
 * Blocking, repo-wide geometry verification.
 *
 * Each scene state is built in its own process so the large procedural scenes
 * cannot retain one another's THREE allocations. The parent owns selection,
 * policy loading, deterministic reconciliation, and the human/JSON reports.
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  GeometryGateConfigError,
  reconcileGeometryAllowlist,
  validateGeometryAllowlist,
} from './geometry-gate.mjs';
import { compareGeometryText as lexicalCompare } from './geometry-order.mjs';
import {
  GEOMETRY_FROZEN_WAIVERS,
  GEOMETRY_SCENE_STATES,
} from './geometry-scenes.mjs';

export const GEOMETRY_WORKER_RESULT_MARKER = '@@SQUATCH_GEOMETRY_RESULT@@';
export const GEOMETRY_WORKER_SCHEMA = 'squatchsmash.geometry-worker.v1';
export const GEOMETRY_WORKER_TIMEOUT_MS = 120_000;
export const GEOMETRY_WORKER_MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TOOL_DIRECTORY, '..');
const WORKER_PATH = path.join(TOOL_DIRECTORY, 'verify-geometry-worker.mjs');
const ALLOWLIST_DIRECTORY = path.join(TOOL_DIRECTORY, 'geometry-allowlists');


function usage() {
  return [
    'Usage: node tools/verify-geometry.mjs [options]',
    '',
    'Options:',
    '  --scene <scene>       Verify every registered state for one scene (repeatable)',
    '  --state <scene:state> Verify one exact registered state (repeatable)',
    '  --json                Print the complete machine-readable report to stdout',
    '  --help                Show this help',
  ].join('\n');
}

export function parseGeometryArguments(argv) {
  const scenes = [];
  const states = [];
  let json = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      json = true;
    } else if (argument === '--help' || argument === '-h') {
      help = true;
    } else if (argument === '--scene' || argument === '--state') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.\n\n${usage()}`);
      }
      (argument === '--scene' ? scenes : states).push(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument "${argument}".\n\n${usage()}`);
    }
  }

  return Object.freeze({
    scenes: Object.freeze([...new Set(scenes)].sort(lexicalCompare)),
    states: Object.freeze([...new Set(states)].sort(lexicalCompare)),
    json,
    help,
  });
}

export function selectGeometryStates({ scenes, states }) {
  const knownScenes = new Set(GEOMETRY_SCENE_STATES.map((entry) => entry.scene));
  const byId = new Map(GEOMETRY_SCENE_STATES.map((entry) => [entry.id, entry]));
  const unknownScenes = scenes.filter((scene) => !knownScenes.has(scene));
  const unknownStates = states.filter((state) => !byId.has(state));
  if (unknownScenes.length || unknownStates.length) {
    const details = [
      ...unknownScenes.map((scene) => `unknown scene "${scene}"`),
      ...unknownStates.map((state) => `unknown state "${state}"`),
    ];
    throw new Error(`Invalid geometry selection: ${details.join(', ')}`);
  }

  const selected = GEOMETRY_SCENE_STATES.filter((entry) => (
    scenes.length === 0 && states.length === 0
      ? true
      : scenes.includes(entry.scene) || states.includes(entry.id)
  ));
  return Object.freeze([...selected].sort((left, right) => lexicalCompare(left.id, right.id)));
}

export function scopeGeometryAllowlist(allowlist, { scene, scans }) {
  if (!allowlist || !Array.isArray(allowlist.entries)) return allowlist;
  const selectedStates = new Set(scans.map(({ state }) => state));
  const registeredStates = new Set(
    GEOMETRY_SCENE_STATES
      .filter((descriptor) => descriptor.scene === scene)
      .map((descriptor) => descriptor.state),
  );
  const selectedEntry = (entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true;
    if (typeof entry.state !== 'string') return true;
    if (!registeredStates.has(entry.state)) return true;
    return selectedStates.has(entry.state);
  };
  return {
    ...allowlist,
    entries: allowlist.entries.filter((entry) => {
      return selectedEntry(entry);
    }),
    ...(Array.isArray(allowlist.suppressionPolicy)
      ? { suppressionPolicy: allowlist.suppressionPolicy.filter(selectedEntry) }
      : {}),
  };
}

function isNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateWorkerSuppressions(value, id) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${id} worker result has invalid suppression policy data.`);
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'checkSupport,overlap,sources,total') {
    throw new Error(`${id} worker result has invalid suppression policy keys.`);
  }
  if (
    !isNonnegativeInteger(value.overlap)
    || !isNonnegativeInteger(value.checkSupport)
    || !isNonnegativeInteger(value.total)
    || value.total !== value.overlap + value.checkSupport
    || !Array.isArray(value.sources)
  ) {
    throw new Error(`${id} worker result has invalid suppression policy counts.`);
  }
  let previousKey = null;
  let overlap = 0;
  let checkSupport = 0;
  for (const entry of value.sources) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${id} worker result has an invalid suppression source.`);
    }
    const sourceKeys = Object.keys(entry).sort();
    if (sourceKeys.join(',') !== 'checkSupport,origins,overlap,scope,sourceId') {
      throw new Error(`${id} worker result has invalid suppression source keys.`);
    }
    if (
      typeof entry.sourceId !== 'string'
      || !entry.sourceId
      || !['direct', 'inherited'].includes(entry.scope)
      || !isNonnegativeInteger(entry.overlap)
      || !isNonnegativeInteger(entry.checkSupport)
      || entry.overlap + entry.checkSupport === 0
      || !Array.isArray(entry.origins)
      || entry.origins.some((origin) => typeof origin !== 'string' || !origin)
      || entry.origins.some((origin, index) => (
        index > 0 && lexicalCompare(entry.origins[index - 1], origin) >= 0
      ))
    ) {
      throw new Error(`${id} worker result has invalid suppression source data.`);
    }
    const key = `${entry.sourceId}\0${entry.scope}`;
    if (previousKey !== null && lexicalCompare(previousKey, key) >= 0) {
      throw new Error(`${id} worker result has non-canonical suppression sources.`);
    }
    previousKey = key;
    overlap += entry.overlap;
    checkSupport += entry.checkSupport;
  }
  if (overlap !== value.overlap || checkSupport !== value.checkSupport) {
    throw new Error(`${id} worker suppression source counts do not reconcile.`);
  }
}

function appendBounded(chunks, chunk, counter, streamName) {
  const nextSize = counter.bytes + chunk.length;
  if (nextSize > GEOMETRY_WORKER_MAX_OUTPUT_BYTES) {
    throw new Error(`${streamName} exceeded ${GEOMETRY_WORKER_MAX_OUTPUT_BYTES} bytes.`);
  }
  chunks.push(chunk);
  counter.bytes = nextSize;
}

export function parseGeometryWorkerOutput(stdout, expectedDescriptor) {
  const { id: expectedId, scene: expectedScene, state: expectedState } = expectedDescriptor;
  const markerIndex = stdout.lastIndexOf(GEOMETRY_WORKER_RESULT_MARKER);
  if (markerIndex < 0) throw new Error(`${expectedId} worker emitted no result marker.`);
  const serialized = stdout.slice(markerIndex + GEOMETRY_WORKER_RESULT_MARKER.length).trim();
  let payload;
  try {
    payload = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`${expectedId} worker emitted invalid JSON: ${error.message}`);
  }
  if (
    payload?.schema !== GEOMETRY_WORKER_SCHEMA
    || payload?.id !== expectedId
    || payload?.scene !== expectedScene
    || payload?.state !== expectedState
  ) {
    throw new Error(`${expectedId} worker result has the wrong schema or descriptor identity.`);
  }
  if (!payload.scan || payload.scan.scene !== payload.scene || payload.scan.state !== payload.state) {
    throw new Error(`${expectedId} worker result has an inconsistent scan identity.`);
  }
  validateWorkerSuppressions(payload.suppressions, expectedId);
  return payload;
}

export function runGeometryWorker(
  descriptor,
  { timeoutMs = GEOMETRY_WORKER_TIMEOUT_MS, spawnImplementation = spawn } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawnImplementation(
      process.execPath,
      ['--max-old-space-size=2048', WORKER_PATH, descriptor.id],
      { cwd: REPOSITORY_ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const stdoutChunks = [];
    const stderrChunks = [];
    const stdoutSize = { bytes: 0 };
    const stderrSize = { bytes: 0 };
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error(`${descriptor.id} worker timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    child.on('error', fail);
    child.stdout.on('data', (chunk) => {
      try {
        appendBounded(stdoutChunks, chunk, stdoutSize, `${descriptor.id} stdout`);
      } catch (error) {
        child.kill();
        fail(error);
      }
    });
    child.stderr.on('data', (chunk) => {
      try {
        appendBounded(stderrChunks, chunk, stderrSize, `${descriptor.id} stderr`);
      } catch (error) {
        child.kill();
        fail(error);
      }
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      if (code !== 0) {
        reject(new Error(
          `${descriptor.id} worker failed (${signal ?? `exit ${code}`}): ${stderr || 'no diagnostic'}`,
        ));
        return;
      }
      try {
        resolve(parseGeometryWorkerOutput(stdout, descriptor));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function loadAllowlist(scene) {
  const filename = path.join(ALLOWLIST_DIRECTORY, `${scene}.json`);
  let serialized;
  try {
    serialized = await readFile(filename, 'utf8');
  } catch (error) {
    throw new Error(`${scene} allowlist is missing or unreadable at tools/geometry-allowlists/${scene}.json: ${error.message}`);
  }
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new Error(`${scene} allowlist contains invalid JSON: ${error.message}`);
  }
}

function sourceIssue(code, pathValue, message) {
  return { code, path: pathValue, message };
}

export async function validateAllowlistSourceFiles(
  allowlist,
  {
    repositoryRoot = REPOSITORY_ROOT,
    readFileImplementation = readFile,
  } = {},
) {
  const issues = [];
  const cache = new Map();
  for (const [index, entry] of allowlist.entries.entries()) {
    const separator = entry.source.lastIndexOf(':');
    const relativeFile = entry.source.slice(0, separator);
    const lineNumber = Number(entry.source.slice(separator + 1));
    const basePath = `entries[${index}].source`;
    const absoluteFile = path.resolve(repositoryRoot, relativeFile);
    const relativeResolved = path.relative(path.resolve(repositoryRoot), absoluteFile);
    if (
      relativeResolved === '..'
      || relativeResolved.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeResolved)
    ) {
      issues.push(sourceIssue(
        'SOURCE_OUTSIDE_REPOSITORY',
        basePath,
        `Source resolves outside the repository: ${entry.source}.`,
      ));
      continue;
    }
    let lines = cache.get(absoluteFile);
    if (!lines) {
      try {
        lines = (await readFileImplementation(absoluteFile, 'utf8')).split(/\r?\n/);
        cache.set(absoluteFile, lines);
      } catch (error) {
        issues.push(sourceIssue(
          error?.code === 'ENOENT' ? 'SOURCE_FILE_MISSING' : 'SOURCE_FILE_UNREADABLE',
          basePath,
          `Cannot read ${relativeFile}: ${error?.message || error}.`,
        ));
        continue;
      }
    }
    if (!Number.isSafeInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length) {
      issues.push(sourceIssue(
        'SOURCE_LINE_OUT_OF_RANGE',
        basePath,
        `Line ${lineNumber} is outside ${relativeFile} (1-${lines.length}).`,
      ));
      continue;
    }
    const citedLine = lines[lineNumber - 1];
    if (!citedLine.trim()) {
      issues.push(sourceIssue(
        'SOURCE_LINE_BLANK',
        basePath,
        `Cited line ${lineNumber} in ${relativeFile} is blank.`,
      ));
      continue;
    }
    if (entry.sourceAnchor !== undefined && !citedLine.includes(entry.sourceAnchor)) {
      issues.push(sourceIssue(
        'SOURCE_ANCHOR_MISMATCH',
        `entries[${index}].sourceAnchor`,
        `Cited line does not contain sourceAnchor "${entry.sourceAnchor}".`,
      ));
    }
  }
  if (issues.length > 0) {
    throw new GeometryGateConfigError('Invalid geometry allowlist source citations.', issues);
  }
}

function suppressionPolicyView(suppressions) {
  return {
    overlap: suppressions.overlap,
    checkSupport: suppressions.checkSupport,
    sources: suppressions.sources.map(({ sourceId, scope, overlap, checkSupport }) => ({
      sourceId,
      scope,
      overlap,
      checkSupport,
    })),
  };
}

export function reconcileSuppressionPolicy({ allowlist, payloads }) {
  const actualByState = new Map(payloads.map((payload) => [payload.state, payload.suppressions]));
  const issues = [];
  for (const [index, expected] of allowlist.suppressionPolicy.entries()) {
    const actual = actualByState.get(expected.state);
    if (!actual) continue;
    const actualView = suppressionPolicyView(actual);
    if (
      expected.overlap !== actualView.overlap
      || expected.checkSupport !== actualView.checkSupport
    ) {
      issues.push(sourceIssue(
        'SUPPRESSION_COUNT_DRIFT',
        `suppressionPolicy[${index}]`,
        `Expected overlap=${expected.overlap}, checkSupport=${expected.checkSupport}; `
        + `observed overlap=${actualView.overlap}, checkSupport=${actualView.checkSupport}.`,
      ));
    }
    if (JSON.stringify(expected.sources) !== JSON.stringify(actualView.sources)) {
      issues.push(sourceIssue(
        'SUPPRESSION_SOURCE_DRIFT',
        `suppressionPolicy[${index}].sources`,
        'Observed exact suppression source scopes differ from checked-in policy.',
      ));
    }
  }
  if (issues.length > 0) {
    throw new GeometryGateConfigError('Geometry suppression policy drifted.', issues);
  }
}

function formatMeters(value) {
  return value === null || value === undefined ? 'unbounded' : `${Number(value).toFixed(3)}m`;
}

/**
 * Envelope id -> what it is, joined from every worker payload in this run.
 *
 * A floating support assembly is reported by the hash of its membership. That
 * is right for identity and unreadable for a person, so the worker sends the
 * names alongside the scan and they are put back together here — see the
 * `envelopeNames` comment in `verify-geometry-worker.mjs` for why they travel
 * separately rather than through the gate.
 */
let envelopeLabels = new Map();

function findingDescription(violation) {
  const finding = violation.finding;
  const label = finding.kind === 'FLOATING' ? envelopeLabels.get(finding.object) : null;
  const named = label?.name ? ` [${label.name}]` : '';
  const target = finding.kind === 'FLOATING'
    ? `${finding.object}${named}`
    : `${finding.left} <> ${finding.right}`;
  const magnitude = finding.kind === 'FLOATING' ? finding.gapM : finding.depthM;
  const cap = violation.code === 'CAP_EXCEEDED' ? ` (cap ${formatMeters(violation.capM)})` : '';
  return `${finding.scene}:${finding.state} ${finding.kind} ${formatMeters(magnitude)}${cap} ${target}`;
}

function configurationIssues(error) {
  if (!(error instanceof GeometryGateConfigError)) return [error.message];
  return error.issues.map((entry) => `${entry.code} ${entry.path}: ${entry.message}`);
}

export async function verifyGeometry({ descriptors, onProgress = () => {} }) {
  const payloads = [];
  const workerErrors = [];
  for (const [index, descriptor] of descriptors.entries()) {
    onProgress({ index, total: descriptors.length, descriptor });
    try {
      const payload = await runGeometryWorker(descriptor);
      for (const [id, label] of Object.entries(payload.envelopeNames ?? {})) {
        envelopeLabels.set(id, label);
      }
      payloads.push(payload);
    } catch (error) {
      workerErrors.push(Object.freeze({ id: descriptor.id, message: error.message }));
    }
  }

  const selectedScenes = [...new Set(descriptors.map((entry) => entry.scene))].sort(lexicalCompare);
  const sceneResults = [];
  for (const scene of selectedScenes) {
    const scenePayloads = payloads
      .filter((payload) => payload.scene === scene)
      .sort((left, right) => lexicalCompare(left.state, right.state));
    const scans = scenePayloads.map((payload) => payload.scan);
    const stateSuppressions = scenePayloads.map((payload) => Object.freeze({
      state: payload.state,
      ...payload.suppressions,
    }));
    try {
      const scopedAllowlist = scopeGeometryAllowlist(await loadAllowlist(scene), { scene, scans });
      const allowlist = validateGeometryAllowlist(scopedAllowlist, { scene, scans });
      await validateAllowlistSourceFiles(allowlist);
      reconcileSuppressionPolicy({ allowlist, payloads: scenePayloads });
      const reconciliation = reconcileGeometryAllowlist({ scene, scans, allowlist });
      sceneResults.push(Object.freeze({
        scene,
        states: scans.length,
        records: scans.reduce((sum, scan) => sum + scan.recordCount, 0),
        findings: scans.reduce((sum, scan) => sum + scan.findings.length, 0),
        allowed: reconciliation.allowed.length,
        suppressions: Object.freeze(stateSuppressions),
        violations: reconciliation.violations,
        configurationErrors: Object.freeze([]),
      }));
    } catch (error) {
      sceneResults.push(Object.freeze({
        scene,
        states: scans.length,
        records: scans.reduce((sum, scan) => sum + scan.recordCount, 0),
        findings: scans.reduce((sum, scan) => sum + scan.findings.length, 0),
        allowed: 0,
        suppressions: Object.freeze(stateSuppressions),
        violations: Object.freeze([]),
        configurationErrors: Object.freeze(configurationIssues(error)),
      }));
    }
  }

  const summary = Object.freeze({
    statesRequested: descriptors.length,
    statesScanned: payloads.length,
    scenes: selectedScenes.length,
    records: sceneResults.reduce((sum, result) => sum + result.records, 0),
    findings: sceneResults.reduce((sum, result) => sum + result.findings, 0),
    allowed: sceneResults.reduce((sum, result) => sum + result.allowed, 0),
    suppressions: sceneResults.reduce(
      (sum, result) => sum + result.suppressions.reduce((stateSum, state) => stateSum + state.total, 0),
      0,
    ),
    suppressionSources: sceneResults.reduce(
      (sum, result) => sum + result.suppressions.reduce(
        (stateSum, state) => stateSum + state.sources.length,
        0,
      ),
      0,
    ),
    violations: sceneResults.reduce((sum, result) => sum + result.violations.length, 0),
    workerErrors: workerErrors.length,
    configurationErrors: sceneResults.reduce(
      (sum, result) => sum + result.configurationErrors.length,
      0,
    ),
  });
  const ok = summary.statesScanned === summary.statesRequested
    && summary.violations === 0
    && summary.configurationErrors === 0;
  return Object.freeze({
    schema: 'squatchsmash.geometry-report.v1',
    ok,
    summary,
    frozenWaivers: GEOMETRY_FROZEN_WAIVERS,
    workerErrors: Object.freeze(workerErrors),
    scenes: Object.freeze(sceneResults),
  });
}

function printHumanReport(report) {
  for (const result of report.scenes) {
    const status = result.violations.length === 0 && result.configurationErrors.length === 0
      ? 'PASS'
      : 'FAIL';
    process.stdout.write(
      `${status} ${result.scene}: ${result.states} states, ${result.records} records, `
      + `${result.findings} findings (${result.allowed} allowed, ${result.violations.length} violations), `
      + `${result.suppressions.reduce((sum, state) => sum + state.total, 0)} suppressions\n`,
    );
    for (const state of result.suppressions) {
      process.stdout.write(
        `  SUPPRESS ${state.state}: overlap=${state.overlap}, `
        + `checkSupport=${state.checkSupport}, sources=${state.sources.length}\n`,
      );
      for (const suppressionSource of state.sources) {
        process.stdout.write(
          `    ${suppressionSource.scope} ${suppressionSource.sourceId}: `
          + `overlap=${suppressionSource.overlap}, `
          + `checkSupport=${suppressionSource.checkSupport}\n`,
        );
      }
    }
    for (const message of result.configurationErrors) {
      process.stdout.write(`  CONFIG ${message}\n`);
    }
    for (const violation of result.violations) {
      process.stdout.write(`  ${violation.code} ${findingDescription(violation)}\n`);
    }
  }
  for (const failure of report.workerErrors) {
    process.stdout.write(`FAIL ${failure.id}: ${failure.message}\n`);
  }
  for (const waiver of report.frozenWaivers) {
    process.stdout.write(`WAIVED ${waiver.launcherId}: ${waiver.reason} (${waiver.source})\n`);
  }
  process.stdout.write(
    `${report.ok ? 'Geometry gate passed' : 'Geometry gate failed'}: `
    + `${report.summary.statesScanned}/${report.summary.statesRequested} states, `
    + `${report.summary.records} records, ${report.summary.suppressions} suppressions, `
    + `${report.summary.violations} violations, `
    + `${report.summary.configurationErrors} configuration errors.\n`,
  );
}

async function main() {
  const options = parseGeometryArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const descriptors = selectGeometryStates(options);
  const report = await verifyGeometry({
    descriptors,
    onProgress: ({ index, total, descriptor }) => {
      if (!options.json) process.stderr.write(`[geometry ${index + 1}/${total}] ${descriptor.id}\n`);
    },
  });
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printHumanReport(report);
  if (!report.ok) process.exitCode = 1;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`[verify-geometry] ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
