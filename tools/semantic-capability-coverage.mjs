#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CONTRACT_DISPOSITION,
  SEMANTIC_SMOKE_AREAS,
  generateSemanticSmokeRegistry,
} from '../src/core/scene-contract.js';
import { SCENE_CONTRACTS } from '../src/core/scene-contracts.js';

const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/audits/SEMANTIC-CAPABILITY-COVERAGE.md',
);

const STATUS_PRECEDENCE = Object.freeze([
  CONTRACT_DISPOSITION.KNOWN_FAILURE,
  CONTRACT_DISPOSITION.DEBT,
  CONTRACT_DISPOSITION.UNKNOWN,
  CONTRACT_DISPOSITION.REQUIRED,
  CONTRACT_DISPOSITION.INTENTIONAL_NA,
]);

const CELL_LABELS = Object.freeze({
  [CONTRACT_DISPOSITION.REQUIRED]: 'REQUIRED',
  [CONTRACT_DISPOSITION.DEBT]: 'DEBT',
  [CONTRACT_DISPOSITION.KNOWN_FAILURE]: 'KNOWN FAILURE',
  [CONTRACT_DISPOSITION.INTENTIONAL_NA]: 'INTENTIONAL N/A',
  [CONTRACT_DISPOSITION.UNKNOWN]: 'UNKNOWN',
});

function aggregateStatus(items) {
  if (!items.length) return CONTRACT_DISPOSITION.UNKNOWN;
  return STATUS_PRECEDENCE.find((status) => items.some((item) => item.disposition === status))
    ?? CONTRACT_DISPOSITION.UNKNOWN;
}

function capabilityCell(items) {
  const status = aggregateStatus(items);
  return Object.freeze({
    status,
    obligationCount: items.length,
    obligationIds: Object.freeze(items.map(({ id }) => id).sort()),
  });
}

export function buildSemanticCapabilityCoverage({
  contracts = SCENE_CONTRACTS,
  obligations = generateSemanticSmokeRegistry(contracts),
} = {}) {
  const areas = [...SEMANTIC_SMOKE_AREAS];
  const rows = [];

  for (const contract of contracts) {
    for (const entrypoint of contract.entrypoints) {
      const entryObligations = obligations.filter(
        (item) => item.sceneId === contract.id && item.entrypointId === entrypoint.id,
      );
      const capabilities = Object.fromEntries(areas.map((area) => [
        area,
        capabilityCell(entryObligations.filter((item) => item.area === area)),
      ]));
      rows.push(Object.freeze({
        sceneId: contract.id,
        sceneTitle: contract.title,
        entrypointId: entrypoint.id,
        href: entrypoint.href,
        capabilities: Object.freeze(capabilities),
      }));
    }
  }

  const allCells = rows.flatMap((row) => areas.map((area) => row.capabilities[area]));
  const byStatus = Object.fromEntries(
    Object.values(CONTRACT_DISPOSITION).map((status) => [
      status,
      allCells.filter((cell) => cell.status === status).length,
    ]),
  );
  const byArea = Object.fromEntries(areas.map((area) => [
    area,
    Object.fromEntries(Object.values(CONTRACT_DISPOSITION).map((status) => [
      status,
      rows.filter((row) => row.capabilities[area].status === status).length,
    ])),
  ]));
  const contractReady = byStatus[CONTRACT_DISPOSITION.DEBT] === 0
    && byStatus[CONTRACT_DISPOSITION.KNOWN_FAILURE] === 0
    && byStatus[CONTRACT_DISPOSITION.UNKNOWN] === 0;

  return Object.freeze({
    schema: 'squatchsmash.semantic-capability-coverage.v1',
    areas: Object.freeze(areas),
    rows: Object.freeze(rows),
    summary: Object.freeze({
      entrypoints: rows.length,
      totalCells: allCells.length,
      byStatus: Object.freeze(byStatus),
      byArea: Object.freeze(byArea),
    }),
    contractReady,
  });
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderSemanticCapabilityCoverage(report) {
  const header = ['Entrypoint', 'Scene', 'Href', ...report.areas];
  const body = report.rows.map((row) => [
    row.entrypointId,
    row.sceneTitle,
    row.href,
    ...report.areas.map((area) => CELL_LABELS[row.capabilities[area].status]),
  ]);
  const statusSummary = Object.entries(report.summary.byStatus)
    .map(([status, count]) => `${CELL_LABELS[status]}=${count}`)
    .join(', ');
  const lines = [
    '# Semantic Capability Coverage',
    '',
    'Generated from the live scene-contract registry. This report tracks player-facing capability coverage instead of raw assertion count.',
    '',
    '**Interpretation:** REQUIRED means contracted, not a live PASS. DEBT, KNOWN FAILURE, and UNKNOWN are blockers. INTENTIONAL N/A is allowed only when the scene contract supplies the reason. Runtime certification remains the responsibility of the semantic browser verifier.',
    '',
    `Entrypoints: ${report.summary.entrypoints}; capability cells: ${report.summary.totalCells}; ${statusSummary}.`,
    '',
    `Behavioral contract ready: ${report.contractReady ? 'YES' : 'NO'}.`,
    '',
    `| ${header.map(escapeCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
    '',
    '## Capability Totals',
    '',
    '| Capability | REQUIRED | DEBT | KNOWN FAILURE | UNKNOWN | INTENTIONAL N/A |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...report.areas.map((area) => {
      const counts = report.summary.byArea[area];
      return `| ${escapeCell(area)} | ${counts.required} | ${counts.debt} | ${counts.known_failure} | ${counts.unknown} | ${counts.intentional_na} |`;
    }),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const result = { check: false, output: OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') result.check = true;
    else if (value === '--output') result.output = path.resolve(argv[++index]);
    else if (value.startsWith('--output=')) result.output = path.resolve(value.slice(9));
    else throw new Error(`Unknown argument ${value}`);
  }
  return result;
}

function run(argv) {
  const options = parseArgs(argv);
  const content = renderSemanticCapabilityCoverage(buildSemanticCapabilityCoverage());
  if (options.check) {
    if (!fs.existsSync(options.output) || fs.readFileSync(options.output, 'utf8') !== content) {
      throw new Error(`Semantic capability report is stale: ${options.output}`);
    }
    console.log(`Semantic capability report current: ${options.output}`);
    return;
  }
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, content, 'utf8');
  console.log(`Semantic capability report written: ${options.output}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
