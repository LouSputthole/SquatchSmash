#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { SCENE_IDS } from '../src/core/campaign.js';
import { SCENE_CONTRACTS } from '../src/core/scene-contracts.js';
import {
  CONTRACT_DISPOSITION,
  generateSemanticSmokeRegistry,
  summarizeSemanticSmoke,
  validateSceneContracts,
} from '../src/core/scene-contract.js';

const UNCERTIFIED = new Set([
  CONTRACT_DISPOSITION.DEBT,
  CONTRACT_DISPOSITION.KNOWN_FAILURE,
  CONTRACT_DISPOSITION.UNKNOWN,
]);

export function buildSemanticSmokeReport({ sceneId = null, entrypointId = null } = {}) {
  const validationErrors = validateSceneContracts(SCENE_CONTRACTS, {
    expectedSceneIds: Object.values(SCENE_IDS),
  });
  let obligations = generateSemanticSmokeRegistry(SCENE_CONTRACTS);
  if (sceneId) obligations = obligations.filter((item) => item.sceneId === sceneId);
  if (entrypointId) obligations = obligations.filter((item) => item.entrypointId === entrypointId);
  if (sceneId && obligations.length === 0) throw new RangeError(`Unknown or empty scene ${sceneId}`);
  if (entrypointId && obligations.length === 0) {
    throw new RangeError(`Unknown or empty entrypoint ${entrypointId}`);
  }
  const blockers = obligations.filter((item) => UNCERTIFIED.has(item.disposition));
  return {
    generatedAt: new Date().toISOString(),
    validationErrors,
    summary: summarizeSemanticSmoke(obligations),
    contractReady: validationErrors.length === 0 && blockers.length === 0,
    blockers,
    obligations,
  };
}

function parseArgs(argv) {
  const args = { json: false, strict: false, sceneId: null, entrypointId: null };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--json') args.json = true;
    else if (value === '--strict') args.strict = true;
    else if (value === '--scene') args.sceneId = argv[++i] ?? null;
    else if (value === '--entrypoint') args.entrypointId = argv[++i] ?? null;
    else if (value.startsWith('--scene=')) args.sceneId = value.slice('--scene='.length);
    else if (value.startsWith('--entrypoint=')) {
      args.entrypointId = value.slice('--entrypoint='.length);
    } else throw new Error(`Unknown argument ${value}`);
  }
  return args;
}

function printHuman(report) {
  const { summary } = report;
  console.log(`Semantic Smoke obligations: ${summary.total}`);
  console.log(`Areas: ${Object.entries(summary.byArea).map(([key, count]) => `${key}=${count}`).join(' ')}`);
  console.log(`Dispositions: ${Object.entries(summary.byDisposition).map(([key, count]) => `${key}=${count}`).join(' ')}`);
  console.log(`Behavioral contract ready: ${report.contractReady ? 'YES' : 'NO'}`);
  if (report.validationErrors.length) {
    console.error(`Schema failures (${report.validationErrors.length}):`);
    for (const error of report.validationErrors) console.error(`- ${error}`);
  }
  if (report.blockers.length) {
    console.log(`Uncertified obligations: ${report.blockers.length}`);
    const scenes = [...new Set(report.blockers.map((item) => item.sceneId))];
    console.log(`Scenes carrying debt/failure/UNKNOWN: ${scenes.join(', ')}`);
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = buildSemanticSmokeReport(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (report.validationErrors.length || (args.strict && !report.contractReady)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
