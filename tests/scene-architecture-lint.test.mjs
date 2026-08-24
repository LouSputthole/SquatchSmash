import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_DISPOSITION as D } from '../src/core/scene-contract.js';
import { SCENE_CONTRACTS } from '../src/core/scene-contracts.js';
import {
  ARCHITECTURE_STATUS as STATUS,
  buildSceneArchitectureReport,
  inlineFirstPersonEvidence,
  nodeRepository,
  verifySceneArchitecture,
} from '../tools/verify-scene-architecture.mjs';

function contract({
  input = { disposition: D.DEBT },
  objective = { disposition: D.REQUIRED, adapter: 'core/objective-panel' },
} = {}) {
  return {
    id: 'fixture_scene',
    entrypoints: [{ id: 'fixture_entry', href: 'fixture.html', root: 'src/fixture.js' }],
    capabilities: {
      input,
      camera: { disposition: D.REQUIRED },
      objective,
      interaction: { disposition: D.REQUIRED, adapter: 'core/interaction' },
      checkpoints: { disposition: D.REQUIRED },
    },
  };
}

function repository(files, { ambiguousExists = new Set(), unreadable = new Set() } = {}) {
  const contents = new Map(Object.entries(files));
  return {
    exists(repoPath) {
      if (ambiguousExists.has(repoPath)) return undefined;
      return contents.has(repoPath);
    },
    readText(repoPath) {
      if (unreadable.has(repoPath)) throw new Error('fixture read failure');
      return contents.get(repoPath);
    },
  };
}

const canonicalFiles = {
  'fixture.html': '<main>fixture</main>',
  'src/core/player.js': 'export class Player {}',
  'src/core/first-person-input.js': 'export function createFirstPersonInput() {}',
  'src/core/objective-panel.js': 'export function createObjectivePanel() {}',
  'src/core/interaction.js': 'export class InteractionSystem {}',
};

test('all declared campaign hrefs and composition roots exist', () => {
  const report = buildSceneArchitectureReport({ repository: nodeRepository() });
  const entryFiles = report.findings.filter((item) => item.kind === 'entrypoint_file');
  assert.equal(entryFiles.length, 40);
  assert.equal(entryFiles.filter((item) => item.status === STATUS.PASS).length, 40);
});

test('required capability Adapters are proven only by exact root imports', () => {
  const files = {
    ...canonicalFiles,
    'src/fixture.js': [
      "import { createObjectivePanel } from './core/objective-panel.js';",
      "import { InteractionSystem } from './core/interaction.js';",
    ].join('\n'),
  };
  const findings = verifySceneArchitecture({ contracts: [contract()], repository: repository(files) });
  const adapters = findings.filter((item) => item.kind === 'canonical_adapter_import');
  assert.equal(adapters.length, 2);
  assert.ok(adapters.every((item) => item.status === STATUS.PASS));

  files['src/fixture.js'] = [
    "import { createObjectivePanel } from './objective-wrapper.js';",
    "import { InteractionSystem } from './core/interaction.js';",
  ].join('\n');
  files['src/objective-wrapper.js'] = "export { createObjectivePanel } from './core/objective-panel.js';";
  const wrapped = verifySceneArchitecture({ contracts: [contract()], repository: repository(files) });
  assert.equal(
    wrapped.find((item) => item.kind === 'canonical_adapter_import' && item.subject === 'objective').status,
    STATUS.FAIL,
  );
});

test('the full Player and five-event signature is classified as local-input debt', () => {
  const source = [
    "import { Player } from './core/player.js';",
    "document.addEventListener('pointerlockchange', onLock);",
    "window.addEventListener('mousemove', onMove);",
    "window.addEventListener('keydown', onDown);",
    "window.addEventListener('keyup', onUp);",
    "window.addEventListener('blur', clear);",
  ].join('\n');
  assert.deepEqual(inlineFirstPersonEvidence(source, 'src/fixture.js'), {
    events: ['pointerlockchange', 'mousemove', 'keydown', 'keyup', 'blur'],
    playerImport: true,
    directPlayerCalls: [],
    adapterBindings: [],
    adapterConstructions: [],
    complete: true,
  });

  const files = {
    ...canonicalFiles,
    'src/fixture.js': [
      source,
      "import { createObjectivePanel } from './core/objective-panel.js';",
      "import { InteractionSystem } from './core/interaction.js';",
    ].join('\n'),
  };
  const findings = verifySceneArchitecture({ contracts: [contract()], repository: repository(files) });
  assert.equal(findings.find((item) => item.kind === 'inline_first_person_input').status, STATUS.DEBT);
});

test('canonical input plus duplicated inline wiring is a hard failure', () => {
  const files = {
    ...canonicalFiles,
    'src/fixture.js': [
      "import { Player } from './core/player.js';",
      "import { createFirstPersonInput } from './core/first-person-input.js';",
      "import { createObjectivePanel } from './core/objective-panel.js';",
      "import { InteractionSystem } from './core/interaction.js';",
      "document.addEventListener('pointerlockchange', onLock);",
      "window.addEventListener('mousemove', onMove);",
      "window.addEventListener('keydown', onDown);",
      "window.addEventListener('keyup', onUp);",
      "window.addEventListener('blur', clear);",
    ].join('\n'),
  };
  const input = {
    disposition: D.REQUIRED,
    adapter: 'core/first-person-input',
  };
  const findings = verifySceneArchitecture({ contracts: [contract({ input })], repository: repository(files) });
  assert.equal(
    findings.find((item) => item.kind === 'canonical_adapter_import' && item.subject === 'input').status,
    STATUS.PASS,
  );
  assert.equal(findings.find((item) => item.kind === 'inline_first_person_input').status, STATUS.FAIL);
});

test('canonical input permits policy listeners but rejects direct Player input bypasses', () => {
  const input = {
    disposition: D.REQUIRED,
    adapter: 'core/first-person-input',
  };
  const files = {
    ...canonicalFiles,
    'src/fixture.js': [
      "import { Player } from './core/player.js';",
      "import { createFirstPersonInput } from './core/first-person-input.js';",
      "import { createObjectivePanel } from './core/objective-panel.js';",
      "import { InteractionSystem } from './core/interaction.js';",
      'const inputAdapter = createFirstPersonInput({ player });',
      "window.addEventListener('keydown', wakeAudio);",
    ].join('\n'),
  };
  const policyOnly = verifySceneArchitecture({
    contracts: [contract({ input })],
    repository: repository(files),
  });
  assert.equal(
    policyOnly.find((item) => item.kind === 'inline_first_person_input').status,
    STATUS.PASS,
  );

  files['src/fixture.js'] += [
    '',
    "window.addEventListener('keyup', (event) => player.setKey(event.code, false));",
    "window.addEventListener('mousemove', (event) => player.handleMouseMove(event.movementX, event.movementY));",
  ].join('\n');
  const bypass = verifySceneArchitecture({
    contracts: [contract({ input })],
    repository: repository(files),
  });
  assert.equal(
    bypass.find((item) => item.kind === 'inline_first_person_input').status,
    STATUS.FAIL,
  );
  assert.deepEqual(
    bypass.find((item) => item.kind === 'inline_first_person_input').evidence.directPlayerCalls,
    ['setKey', 'handleMouseMove'],
  );
});

test('an unused canonical input import and an aliased Player bypass both fail closed', () => {
  const input = {
    disposition: D.REQUIRED,
    adapter: 'core/first-person-input',
  };
  const files = {
    ...canonicalFiles,
    'src/fixture.js': [
      "import { Player as Avatar } from './core/player.js';",
      "import { createFirstPersonInput } from './core/first-person-input.js';",
      "import { createObjectivePanel } from './core/objective-panel.js';",
      "import { InteractionSystem } from './core/interaction.js';",
      'const avatar = new Avatar();',
    ].join('\n'),
  };
  const unused = verifySceneArchitecture({
    contracts: [contract({ input })],
    repository: repository(files),
  });
  assert.equal(
    unused.find((item) => item.kind === 'inline_first_person_input').status,
    STATUS.FAIL,
  );

  files['src/fixture.js'] += '\nconst inputAdapter = createFirstPersonInput({ player: avatar });'
    + '\navatar.setKey("KeyW", true);';
  const bypass = verifySceneArchitecture({
    contracts: [contract({ input })],
    repository: repository(files),
  });
  const finding = bypass.find((item) => item.kind === 'inline_first_person_input');
  assert.equal(finding.status, STATUS.FAIL);
  assert.deepEqual(finding.evidence.directPlayerCalls, ['setKey']);
});

test('partial or unavailable evidence remains UNKNOWN rather than passing', () => {
  const files = {
    ...canonicalFiles,
    'src/fixture.js': [
      "import { Player } from './core/player.js';",
      "import { createObjectivePanel } from './core/objective-panel.js';",
      "import { InteractionSystem } from './core/interaction.js';",
      "window.addEventListener('keydown', onDown);",
    ].join('\n'),
  };
  const partial = verifySceneArchitecture({ contracts: [contract()], repository: repository(files) });
  assert.equal(partial.find((item) => item.kind === 'inline_first_person_input').status, STATUS.UNKNOWN);

  const unreadable = verifySceneArchitecture({
    contracts: [contract()],
    repository: repository(files, { unreadable: new Set(['src/fixture.js']) }),
  });
  assert.ok(unreadable
    .filter((item) => ['canonical_adapter_import', 'inline_first_person_input'].includes(item.kind))
    .every((item) => item.status === STATUS.UNKNOWN));
});

test('the current registry emits one input-ownership finding per runtime entry', () => {
  const report = buildSceneArchitectureReport({ repository: nodeRepository() });
  const runtimeEntries = SCENE_CONTRACTS.reduce((count, item) => count + item.entrypoints.length, 0);
  assert.equal(runtimeEntries, 20);
  assert.equal(
    report.findings.filter((item) => item.kind === 'inline_first_person_input').length,
    runtimeEntries,
  );
});
