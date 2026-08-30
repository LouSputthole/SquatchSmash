#!/usr/bin/env node
/**
 * Verify explicitly supplied mission-state observations.
 *
 * This verifier intentionally does not discover or invent scene phases. Scene
 * Adapters provide JSON observations from their real runtime/checkpoint paths;
 * this tool applies the shared deterministic liveness contract to them.
 *
 * Usage:
 *   node tools/verify-scene-liveness.mjs observations.json [...more.json]
 *   node tools/verify-scene-liveness.mjs --stdin [--json]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  evaluateMissionLiveness,
  formatMissionLivenessResult,
  MISSION_LIVENESS_STATUS,
} from '../src/core/mission-liveness.js';

function freezeReport(report) {
  Object.freeze(report.counts);
  Object.freeze(report.results);
  Object.freeze(report.diagnostics);
  return Object.freeze(report);
}

export function parseMissionLivenessDocument(document, { source = '<memory>' } = {}) {
  const observations = Array.isArray(document)
    ? document
    : document?.observations;
  if (!Array.isArray(observations)) {
    throw new TypeError(
      `${source} must contain an observation array or { "observations": [...] }`,
    );
  }
  return observations;
}

function stateKey(result) {
  return `${result.sceneId}\u0000${result.checkpoint ?? ''}\u0000${result.phase}`;
}

export function verifyMissionLivenessObservations(observations) {
  if (!Array.isArray(observations)) {
    throw new TypeError('mission liveness verifier requires an observation array');
  }

  const results = observations.map((observation) => evaluateMissionLiveness(observation));
  const seenStates = new Set();
  for (const result of results) {
    const key = stateKey(result);
    if (seenStates.has(key)) {
      throw new TypeError(
        `duplicate mission liveness observation: scene=${result.sceneId} phase=${result.phase} checkpoint=${result.checkpoint ?? 'none'}`,
      );
    }
    seenStates.add(key);
  }

  const counts = {
    total: results.length,
    PASS: results.filter(({ status }) => status === MISSION_LIVENESS_STATUS.PASS).length,
    FAIL: results.filter(({ status }) => status === MISSION_LIVENESS_STATUS.FAIL).length,
    UNKNOWN: results.filter(({ status }) => status === MISSION_LIVENESS_STATUS.UNKNOWN).length,
  };
  const diagnostics = [];
  let status = MISSION_LIVENESS_STATUS.PASS;
  if (counts.FAIL > 0) status = MISSION_LIVENESS_STATUS.FAIL;
  else if (counts.UNKNOWN > 0) status = MISSION_LIVENESS_STATUS.UNKNOWN;
  else if (counts.total === 0) {
    status = MISSION_LIVENESS_STATUS.UNKNOWN;
    diagnostics.push(Object.freeze({
      kind: 'UNKNOWN',
      code: 'NO_OBSERVATIONS',
      message: 'no mission states were supplied; an empty certification cannot pass',
    }));
  }

  return freezeReport({
    status,
    ok: status === MISSION_LIVENESS_STATUS.PASS,
    counts,
    results,
    diagnostics,
  });
}

export function renderMissionLivenessReport(report) {
  if (!report || typeof report !== 'object') {
    throw new TypeError('renderMissionLivenessReport requires a verifier report');
  }
  const { counts } = report;
  const lines = [
    `Scene liveness: ${report.status} (${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts.UNKNOWN} UNKNOWN; ${counts.total} total)`,
  ];
  for (const item of report.diagnostics || []) {
    lines.push(`${item.kind} ${item.code}: ${item.message}`);
  }
  for (const result of report.results || []) {
    lines.push(formatMissionLivenessResult(result));
  }
  return lines.join('\n');
}

function usage() {
  return [
    'Usage:',
    '  node tools/verify-scene-liveness.mjs observations.json [...more.json]',
    '  node tools/verify-scene-liveness.mjs --stdin [--json]',
    '',
    'Input is an observation array or { "observations": [...] }.',
    'The tool exits nonzero for FAIL and UNKNOWN; an empty input is UNKNOWN.',
  ].join('\n');
}

function parseArguments(argv) {
  const options = { files: [], stdin: false, json: false, help: false };
  for (const argument of argv) {
    if (argument === '--json') options.json = true;
    else if (argument === '--stdin' || argument === '-') options.stdin = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument.startsWith('-')) throw new TypeError(`unknown option: ${argument}`);
    else options.files.push(argument);
  }
  if (options.stdin && options.files.length > 0) {
    throw new TypeError('use either --stdin or JSON files, not both');
  }
  return options;
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SyntaxError(`${source} is not valid JSON: ${error.message}`);
  }
}

async function loadObservations(options) {
  if (options.stdin) {
    const source = '<stdin>';
    return parseMissionLivenessDocument(
      parseJson(await readStandardInput(), source),
      { source },
    );
  }

  const observations = [];
  for (const file of options.files) {
    const absolute = path.resolve(process.cwd(), file);
    const document = parseJson(await fs.readFile(absolute, 'utf8'), absolute);
    observations.push(...parseMissionLivenessDocument(document, { source: absolute }));
  }
  return observations;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.stdin && options.files.length === 0) {
    throw new TypeError(`no observation input supplied\n${usage()}`);
  }

  const report = verifyMissionLivenessObservations(await loadObservations(options));
  console.log(options.json
    ? JSON.stringify(report, null, 2)
    : renderMissionLivenessReport(report));
  return report.ok ? 0 : 1;
}

const directExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directExecution) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
