#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { SCENE_IDS } from '../src/core/campaign.js';
import {
  SCENE_CONTRACTS,
  getSceneContract,
  listSceneEntrypoints,
} from '../src/core/scene-contracts.js';
import { validateSceneContracts } from '../src/core/scene-contract.js';

export function sceneContractReport({ sceneId = null } = {}) {
  const contracts = sceneId ? [getSceneContract(sceneId)].filter(Boolean) : SCENE_CONTRACTS;
  if (sceneId && contracts.length === 0) throw new RangeError(`Unknown campaign scene ${sceneId}`);
  const entrypoints = contracts.flatMap((contract) => contract.entrypoints.map((entrypoint) => ({
    sceneId: contract.id,
    title: contract.title,
    entrypointId: entrypoint.id,
    kind: entrypoint.kind,
    disposition: entrypoint.disposition,
    href: entrypoint.href,
    root: entrypoint.root,
    expectedExits: entrypoint.expectedExits,
    observedExits: entrypoint.observedExits ?? entrypoint.expectedExits,
  })));
  return {
    generatedAt: new Date().toISOString(),
    sceneCount: contracts.length,
    entrypointCount: entrypoints.length,
    registrySceneCount: SCENE_CONTRACTS.length,
    registryEntrypointCount: listSceneEntrypoints().length,
    validationErrors: validateSceneContracts(SCENE_CONTRACTS, {
      expectedSceneIds: Object.values(SCENE_IDS),
    }),
    entrypoints,
  };
}

function parseArgs(argv) {
  const args = { json: false, sceneId: null };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--json') args.json = true;
    else if (value === '--scene') args.sceneId = argv[++i] ?? null;
    else if (value.startsWith('--scene=')) args.sceneId = value.slice('--scene='.length);
    else throw new Error(`Unknown argument ${value}`);
  }
  return args;
}

function printHuman(report) {
  console.log(`Scene Contracts: ${report.sceneCount} scenes, ${report.entrypointCount} runtime entries`);
  for (const entrypoint of report.entrypoints) {
    const observed = entrypoint.observedExits.join(', ') || 'terminal';
    const expected = entrypoint.expectedExits.join(', ') || 'terminal';
    const drift = observed === expected ? '' : ` (observed: ${observed})`;
    console.log(
      `${entrypoint.sceneId.padEnd(20)} ${entrypoint.kind.padEnd(9)} `
      + `${entrypoint.disposition.padEnd(14)} ${entrypoint.href} -> ${expected}${drift}`,
    );
  }
  if (report.validationErrors.length) {
    console.error(`Schema failures (${report.validationErrors.length}):`);
    for (const error of report.validationErrors) console.error(`- ${error}`);
  }
}
const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = sceneContractReport({ sceneId: args.sceneId });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (report.validationErrors.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
