#!/usr/bin/env node

/**
 * Static enforcement for the campaign Scene Contract registry.
 *
 * This Module deliberately proves only facts visible at each declared
 * composition root. It does not follow wrapper imports or infer that a local
 * event listener is harmless. Missing or ambiguous evidence is UNKNOWN.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTRACT_DISPOSITION } from '../src/core/scene-contract.js';
import { SCENE_CONTRACTS } from '../src/core/scene-contracts.js';

export const ARCHITECTURE_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  DEBT: 'debt',
  UNKNOWN: 'unknown',
});

export const INLINE_FIRST_PERSON_EVENTS = Object.freeze([
  'pointerlockchange',
  'mousemove',
  'keydown',
  'keyup',
  'blur',
]);

const STATUS_VALUES = Object.freeze(Object.values(ARCHITECTURE_STATUS));
const TOOL_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPOSITORY_ROOT = path.resolve(path.dirname(TOOL_PATH), '..');

function toPosix(value) {
  return value.replaceAll('\\', '/');
}

function trimLeadingDotSlash(value) {
  return value.replace(/^\.\//, '');
}

/** Convert a contract href/root into a repository-relative path. */
export function contractPath(value, { href = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let candidate = value.trim();
  if (href) candidate = candidate.split(/[?#]/u, 1)[0];
  if (/^[a-z][a-z\d+.-]*:/iu.test(candidate)) return null;
  candidate = trimLeadingDotSlash(toPosix(candidate).replace(/^\//, ''));
  const normalized = path.posix.normalize(candidate);
  if (!normalized || normalized === '.' || normalized === '..'
    || normalized.startsWith('../')) return null;
  return normalized;
}

/** Map a Scene Contract adapter name to its canonical source Module. */
export function canonicalAdapterPath(adapter) {
  if (typeof adapter !== 'string' || !adapter.trim()) return null;
  let candidate = trimLeadingDotSlash(toPosix(adapter.trim()));
  if (!candidate.startsWith('src/')) candidate = `src/${candidate}`;
  if (!path.posix.extname(candidate)) candidate += '.js';
  return contractPath(candidate);
}

/**
 * Mask comments while preserving strings and newlines. This prevents a
 * commented-out import/listener from becoming architecture evidence.
 */
export function maskJavaScriptComments(source) {
  let output = '';
  let state = 'code';
  let escaped = false;

  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      if (character === '\n' || character === '\r') {
        state = 'code';
        output += character;
      } else {
        output += ' ';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        output += '  ';
        index++;
        state = 'code';
      } else {
        output += character === '\n' || character === '\r' ? character : ' ';
      }
      continue;
    }

    if (state !== 'code') {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if ((state === 'single-quote' && character === "'")
        || (state === 'double-quote' && character === '"')
        || (state === 'template' && character === '`')) {
        state = 'code';
      }
      continue;
    }

    if (character === '/' && next === '/') {
      output += '  ';
      index++;
      state = 'line-comment';
    } else if (character === '/' && next === '*') {
      output += '  ';
      index++;
      state = 'block-comment';
    } else {
      output += character;
      if (character === "'") state = 'single-quote';
      else if (character === '"') state = 'double-quote';
      else if (character === '`') state = 'template';
    }
  }

  return output;
}

function resolveImport(root, specifier) {
  if (!specifier.startsWith('.')) return null;
  return contractPath(path.posix.join(path.posix.dirname(root), specifier));
}

/** Extract only static imports declared directly by a composition root. */
export function staticImports(source, root) {
  const imports = [];
  const masked = maskJavaScriptComments(source);
  const pattern = /(?:^|\n)\s*import(?!\s*\()\s+(?:(.*?)\s+from\s+)?(['"])([^'"\r\n]+)\2\s*;?/gmsu;
  for (const match of masked.matchAll(pattern)) {
    const specifier = match[3];
    imports.push(Object.freeze({
      clause: (match[1] ?? '').trim(),
      specifier,
      resolved: resolveImport(root, specifier),
    }));
  }
  return Object.freeze(imports);
}

function importsNamedPlayer(imports) {
  return imports.some((item) => item.resolved === 'src/core/player.js'
    && /(?:^|[,{\s])Player(?:\s+as\s+[A-Za-z_$][\w$]*)?(?:$|[,}\s])/u.test(item.clause));
}

function namedImportBindings(imports, resolvedModule, exportedNames) {
  const wanted = new Set(exportedNames);
  const bindings = [];
  for (const item of imports.filter(({ resolved }) => resolved === resolvedModule)) {
    const named = item.clause.match(/\{([\s\S]*?)\}/u)?.[1] ?? '';
    for (const declaration of named.split(',')) {
      const parts = declaration.trim().split(/\s+as\s+/u);
      const exported = parts[0]?.trim();
      const local = (parts[1] ?? parts[0])?.trim();
      if (wanted.has(exported) && /^[A-Za-z_$][\w$]*$/u.test(local)) {
        bindings.push({ exported, local });
      }
    }
  }
  return bindings;
}

/** Locate direct DOM event listener registrations in one source root. */
export function inlineFirstPersonEvidence(source, root) {
  const masked = maskJavaScriptComments(source);
  const imports = staticImports(source, root);
  const events = INLINE_FIRST_PERSON_EVENTS.filter((eventName) => {
    const pattern = new RegExp(
      `(?:\\b(?:window|document|globalThis)\\s*\\.\\s*)?\\baddEventListener\\s*\\(\\s*['\"]${eventName}['\"]`,
      'u',
    );
    return pattern.test(masked);
  });
  const playerImport = importsNamedPlayer(imports);
  const directPlayerCalls = Object.freeze(
    ['setKey', 'handleMouseMove', 'clearKeys']
      .filter((method) => new RegExp(
        `\\b[A-Za-z_$][\\w$]*\\s*\\.\\s*${method}\\s*\\(`,
        'u',
      ).test(masked)),
  );
  const adapterBindings = namedImportBindings(
    imports,
    'src/core/first-person-input.js',
    ['createFirstPersonInput', 'FirstPersonInputAdapter'],
  );
  const adapterConstructions = adapterBindings.filter(({ exported, local }) => (
    exported === 'FirstPersonInputAdapter'
      ? new RegExp(`\\bnew\\s+${local}\\s*\\(`, 'u').test(masked)
      : new RegExp(`\\b${local}\\s*\\(`, 'u').test(masked)
  ));
  return Object.freeze({
    events: Object.freeze(events),
    playerImport,
    directPlayerCalls,
    adapterBindings: Object.freeze(adapterBindings),
    adapterConstructions: Object.freeze(adapterConstructions),
    complete: playerImport && events.length === INLINE_FIRST_PERSON_EVENTS.length,
  });
}

function finding({ contract, entrypoint, kind, subject, status, message, evidence = {} }) {
  return Object.freeze({
    id: `${contract.id}:${entrypoint.id}:${kind}:${subject}`,
    sceneId: contract.id,
    entrypointId: entrypoint.id,
    kind,
    subject,
    status,
    message,
    evidence: Object.freeze(evidence),
  });
}

function inspectExistence({ contract, entrypoint, kind, subject, repoPath, repository }) {
  if (!repoPath) {
    return finding({
      contract,
      entrypoint,
      kind,
      subject,
      status: ARCHITECTURE_STATUS.UNKNOWN,
      message: `Cannot resolve ${subject} to a repository-relative path.`,
      evidence: { repoPath: null },
    });
  }
  try {
    const exists = repository.exists(repoPath);
    if (typeof exists !== 'boolean') {
      return finding({
        contract,
        entrypoint,
        kind,
        subject,
        status: ARCHITECTURE_STATUS.UNKNOWN,
        message: `Repository Adapter returned ambiguous existence evidence for ${repoPath}.`,
        evidence: { repoPath, exists },
      });
    }
    return finding({
      contract,
      entrypoint,
      kind,
      subject,
      status: exists ? ARCHITECTURE_STATUS.PASS : ARCHITECTURE_STATUS.FAIL,
      message: exists ? `${repoPath} exists.` : `${repoPath} does not exist.`,
      evidence: { repoPath, exists },
    });
  } catch (error) {
    return finding({
      contract,
      entrypoint,
      kind,
      subject,
      status: ARCHITECTURE_STATUS.UNKNOWN,
      message: `Could not inspect ${repoPath}: ${error.message}`,
      evidence: { repoPath, error: error.message },
    });
  }
}

function requiredAdapters(contract) {
  return Object.entries(contract.capabilities)
    .filter(([, capability]) => capability.disposition === CONTRACT_DISPOSITION.REQUIRED
      && typeof capability.adapter === 'string' && capability.adapter.trim())
    .map(([name, capability]) => ({ name, adapter: capability.adapter }));
}

function adapterFinding({ contract, entrypoint, capability, sourceState, repository }) {
  const expectedModule = canonicalAdapterPath(capability.adapter);
  if (sourceState.status !== 'read') {
    return finding({
      contract,
      entrypoint,
      kind: 'canonical_adapter_import',
      subject: capability.name,
      status: ARCHITECTURE_STATUS.UNKNOWN,
      message: `Cannot prove the ${capability.name} Adapter import because the root source is unavailable.`,
      evidence: { expectedModule, sourceStatus: sourceState.status },
    });
  }

  let moduleExists;
  try {
    moduleExists = expectedModule ? repository.exists(expectedModule) : null;
  } catch {
    moduleExists = null;
  }
  if (moduleExists !== true) {
    return finding({
      contract,
      entrypoint,
      kind: 'canonical_adapter_import',
      subject: capability.name,
      status: moduleExists === false ? ARCHITECTURE_STATUS.FAIL : ARCHITECTURE_STATUS.UNKNOWN,
      message: moduleExists === false
        ? `Canonical Module ${expectedModule} does not exist.`
        : `Canonical Module existence is unresolved for ${expectedModule}.`,
      evidence: { expectedModule, moduleExists },
    });
  }

  const imports = staticImports(sourceState.source, sourceState.root);
  const exact = imports.filter((item) => item.resolved === expectedModule);
  if (exact.length === 1) {
    return finding({
      contract,
      entrypoint,
      kind: 'canonical_adapter_import',
      subject: capability.name,
      status: ARCHITECTURE_STATUS.PASS,
      message: `${sourceState.root} imports the exact canonical Module ${expectedModule}.`,
      evidence: { expectedModule, imports: exact.map((item) => item.specifier) },
    });
  }
  if (exact.length > 1) {
    return finding({
      contract,
      entrypoint,
      kind: 'canonical_adapter_import',
      subject: capability.name,
      status: ARCHITECTURE_STATUS.UNKNOWN,
      message: `${sourceState.root} imports ${expectedModule} more than once; ownership is ambiguous.`,
      evidence: { expectedModule, imports: exact.map((item) => item.specifier) },
    });
  }

  const adapterStem = expectedModule?.replace(/^src\//u, '').replace(/\.js$/u, '');
  const textualReference = adapterStem && sourceState.source.includes(adapterStem);
  return finding({
    contract,
    entrypoint,
    kind: 'canonical_adapter_import',
    subject: capability.name,
    status: textualReference ? ARCHITECTURE_STATUS.UNKNOWN : ARCHITECTURE_STATUS.FAIL,
    message: textualReference
      ? `${sourceState.root} mentions ${adapterStem}, but no exact static import proves the Adapter.`
      : `${sourceState.root} does not import the required canonical Module ${expectedModule}.`,
    evidence: {
      expectedModule,
      staticImports: imports.map((item) => item.resolved ?? item.specifier),
      textualReference: Boolean(textualReference),
    },
  });
}

function inputFinding({ contract, entrypoint, sourceState, adapterFindings }) {
  if (sourceState.status !== 'read') {
    return finding({
      contract,
      entrypoint,
      kind: 'inline_first_person_input',
      subject: 'input',
      status: ARCHITECTURE_STATUS.UNKNOWN,
      message: 'Root source is unavailable, so local first-person wiring cannot be classified.',
      evidence: { sourceStatus: sourceState.status },
    });
  }

  const evidence = inlineFirstPersonEvidence(sourceState.source, sourceState.root);
  const input = contract.capabilities.input;
  const canonicalRequired = input.disposition === CONTRACT_DISPOSITION.REQUIRED
    && canonicalAdapterPath(input.adapter) === 'src/core/first-person-input.js';
  const canonicalFinding = adapterFindings.find((item) => item.subject === 'input');

  if (evidence.complete) {
    return finding({
      contract,
      entrypoint,
      kind: 'inline_first_person_input',
      subject: 'input',
      status: canonicalRequired ? ARCHITECTURE_STATUS.FAIL : ARCHITECTURE_STATUS.DEBT,
      message: canonicalRequired
        ? 'The canonical input Adapter is required, but the root also duplicates the full DOM/Player wiring stack.'
        : 'The root owns the full pointer-lock, mouse, keyboard, blur, and Player wiring stack.',
      evidence,
    });
  }

  if (canonicalRequired && canonicalFinding?.status === ARCHITECTURE_STATUS.PASS) {
    if (evidence.adapterConstructions.length === 0) {
      return finding({
        contract,
        entrypoint,
        kind: 'inline_first_person_input',
        subject: 'input',
        status: ARCHITECTURE_STATUS.FAIL,
        message: 'The canonical input Adapter is imported but never constructed at the scene root.',
        evidence,
      });
    }
    if (evidence.directPlayerCalls.length > 0) {
      return finding({
        contract,
        entrypoint,
        kind: 'inline_first_person_input',
        subject: 'input',
        status: ARCHITECTURE_STATUS.FAIL,
        message: 'The canonical Adapter is imported, but the root still calls Player input methods directly.',
        evidence,
      });
    }
    return finding({
      contract,
      entrypoint,
      kind: 'inline_first_person_input',
      subject: 'input',
      status: ARCHITECTURE_STATUS.PASS,
      message: 'The canonical input Adapter is constructed and the duplicate full local wiring signature is absent.',
      evidence,
    });
  }

  return finding({
    contract,
    entrypoint,
    kind: 'inline_first_person_input',
    subject: 'input',
    status: ARCHITECTURE_STATUS.UNKNOWN,
    message: evidence.events.length || evidence.playerImport
      ? 'Only part of the local first-person wiring signature is visible at this root.'
      : 'No complete local first-person wiring signature is visible at this root; ownership may be delegated.',
    evidence,
  });
}

function readRoot(root, rootFinding, repository) {
  if (rootFinding.status !== ARCHITECTURE_STATUS.PASS) {
    return { status: 'unavailable', root, source: null };
  }
  try {
    const source = repository.readText(root);
    if (typeof source !== 'string') return { status: 'ambiguous', root, source: null };
    return { status: 'read', root, source };
  } catch (error) {
    return { status: 'error', root, source: null, error: error.message };
  }
}

/**
 * Pure audit orchestration. The repository Adapter makes filesystem evidence
 * replaceable in tests without weakening the Interface.
 */
export function verifySceneArchitecture({ contracts = SCENE_CONTRACTS, repository }) {
  if (!repository || typeof repository.exists !== 'function'
    || typeof repository.readText !== 'function') {
    throw new TypeError('repository must provide exists(repoPath) and readText(repoPath)');
  }

  const findings = [];
  for (const contract of contracts) {
    for (const entrypoint of contract.entrypoints) {
      const href = contractPath(entrypoint.href, { href: true });
      const root = contractPath(entrypoint.root);
      findings.push(inspectExistence({
        contract,
        entrypoint,
        kind: 'entrypoint_file',
        subject: 'href',
        repoPath: href,
        repository,
      }));
      const rootFinding = inspectExistence({
        contract,
        entrypoint,
        kind: 'entrypoint_file',
        subject: 'root',
        repoPath: root,
        repository,
      });
      findings.push(rootFinding);

      const sourceState = readRoot(root, rootFinding, repository);
      const adapterFindings = requiredAdapters(contract).map((capability) => adapterFinding({
        contract,
        entrypoint,
        capability,
        sourceState,
        repository,
      }));
      findings.push(...adapterFindings);
      findings.push(inputFinding({ contract, entrypoint, sourceState, adapterFindings }));
    }
  }
  return Object.freeze(findings);
}

export function summarizeSceneArchitecture(findings) {
  const byStatus = Object.fromEntries(STATUS_VALUES.map((status) => [status, 0]));
  const byKind = {};
  for (const item of findings) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    byKind[item.kind] ??= Object.fromEntries(STATUS_VALUES.map((status) => [status, 0]));
    byKind[item.kind][item.status] = (byKind[item.kind][item.status] ?? 0) + 1;
  }
  const uncertified = findings.filter((item) => item.status !== ARCHITECTURE_STATUS.PASS);
  return Object.freeze({
    total: findings.length,
    byStatus: Object.freeze(byStatus),
    byKind: Object.freeze(Object.fromEntries(
      Object.entries(byKind).map(([kind, counts]) => [kind, Object.freeze(counts)]),
    )),
    uncertified: Object.freeze(uncertified),
    certificationReady: uncertified.length === 0,
  });
}

export function nodeRepository(repositoryRoot = DEFAULT_REPOSITORY_ROOT) {
  const root = path.resolve(repositoryRoot);
  return Object.freeze({
    exists(repoPath) {
      return fs.existsSync(path.join(root, ...repoPath.split('/')));
    },
    readText(repoPath) {
      return fs.readFileSync(path.join(root, ...repoPath.split('/')), 'utf8');
    },
  });
}

export function buildSceneArchitectureReport({
  contracts = SCENE_CONTRACTS,
  repository = nodeRepository(),
} = {}) {
  const findings = verifySceneArchitecture({ contracts, repository });
  return Object.freeze({ findings, summary: summarizeSceneArchitecture(findings) });
}

function renderCounts(counts) {
  return STATUS_VALUES.map((status) => `${status}=${counts[status] ?? 0}`).join(' ');
}

function main() {
  const json = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  const unknownArguments = process.argv.slice(2)
    .filter((argument) => argument !== '--json' && argument !== '--strict');
  if (unknownArguments.length) {
    throw new Error(`Unknown argument(s): ${unknownArguments.join(', ')}`);
  }
  const report = buildSceneArchitectureReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Scene architecture findings: ${report.summary.total}`);
    console.log(`Statuses: ${renderCounts(report.summary.byStatus)}`);
    for (const [kind, counts] of Object.entries(report.summary.byKind)) {
      console.log(`${kind}: ${renderCounts(counts)}`);
    }
    console.log(`Certification ready: ${report.summary.certificationReady ? 'YES' : 'NO'}`);
    for (const item of report.summary.uncertified) {
      console.log(`${item.status.toUpperCase()} ${item.sceneId}/${item.entrypointId} ${item.kind}.${item.subject}: ${item.message}`);
    }
  }
  if (strict && !report.summary.certificationReady) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(TOOL_PATH)) main();
