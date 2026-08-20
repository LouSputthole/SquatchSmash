import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as THREE from '../vendor/three.module.min.js';

import {
  assertSceneAuditCaptureStable,
  buildSceneAuditSourceSnapshot,
  buildSceneAuditWorkspaceFingerprint,
  buildSceneAuditEvidence,
  buildSceneAuditServedManifest,
  isSceneAuditAbsoluteAnyPlatform,
  isSceneAuditRelativePathContained,
  parseSceneAuditArgs,
  resolveSceneAuditSelection,
  writeSceneAuditEvidenceAtomic,
} from '../tools/scene-audit-evidence.mjs';
import {
  SCENE_AUDIT_SCENES,
  assessAuditSupport,
  buildSceneAuditReadinessExpression,
  classifyAuditSupport,
  classifyAuditTransform,
  collectAuditMeshItems,
  collectSceneAuditItems,
  countVisibleAuditMeshes,
  createAuditFinding,
  findCoplanarAuditPairs,
  findUnsupportedAuditItems,
  installKnownSceneRoots,
  isAuditExcludedEffectMesh,
  isAuditRenderableMesh,
  isMountedAuditName,
  isStructuralBaseAuditItem,
} from '../tools/scene-audit-scenes.mjs';
import {
  buildSceneAuditStartTrackingExpression,
  createSceneAuditRequestHandler,
  sceneAuditStartControlsReady,
  withSceneAuditResources,
} from '../tools/scene-audit-worker.mjs';

const scene = (id) => SCENE_AUDIT_SCENES.find((entry) => entry.id === id);

const auditBox = (id, min, max) => ({
  id,
  name: '',
  min: { x: min[0], y: min[1], z: min[2] },
  max: { x: max[0], y: max[1], z: max[2] },
});

function previewLauncherEntries() {
  const html = readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
  const entries = [];
  for (const [tag] of html.matchAll(/<a\b[^>]*>/gi)) {
    const launcher = tag.match(/\bdata-preview-(apartment|scene)="([^"]+)"/i);
    const href = tag.match(/\bhref="([^"]+)"/i);
    if (!launcher || !href) continue;
    entries.push({
      launcherKey: `${launcher[1].toLowerCase()}:${launcher[2]}`,
      url: href[1].replaceAll('&amp;', '&'),
    });
  }
  return entries;
}

test('default scene audit inventory matches every non-frozen preview launcher runtime', () => {
  const launcherEntries = previewLauncherEntries();
  /* Two exclusions, and they are not the same kind of thing.
   *
   * `scene:initiation` is FROZEN — no extractable headless builder at all.
   *
   * `scene:special-meeting` is the opposite problem: it builds headlessly
   * perfectly well now (two real faults were fixed to get there — a misspelt
   * `instanceAssemblyPrefix` in forest/foliage.js that took the whole scene's
   * collection down, and blanket scene-scale geometry opt-outs on the fire
   * escape and utility poles that the gate rightly refuses at 72 parts and
   * ten metres). What it has not had is a geometry REVIEW: the moment it
   * became checkable it produced 1,420 findings, which is a pass of its own
   * on the scale of the Cartel Palace one and not something to do badly in a
   * hurry. The scene is playable and in the launcher; its geometry is
   * unexamined, and this line is where that is written down. Delete it when
   * the pass lands — `tools/geometry-scenes.mjs` carries the three registry
   * entries to switch on at the same time. */
  const expected = launcherEntries
    .filter(({ launcherKey }) => launcherKey !== 'scene:initiation'
      && launcherKey !== 'scene:special-meeting')
    .sort((a, b) => a.launcherKey.localeCompare(b.launcherKey));
  const configured = SCENE_AUDIT_SCENES
    .map(({ launcherKey, url }) => ({ launcherKey, url }))
    .sort((a, b) => String(a.launcherKey).localeCompare(String(b.launcherKey)));

  assert.ok(
    launcherEntries.some(({ launcherKey }) => launcherKey === 'scene:initiation'),
    'the parity check must keep recognizing the intentionally frozen launcher entry',
  );
  assert.deepEqual(configured, expected);
});

test('the default advisory inventory excludes frozen Initiation by construction', () => {
  assert.doesNotMatch(
    SCENE_AUDIT_SCENES.map(({ id, url }) => `${id} ${url}`).join('\n'),
    /initiation/i,
  );
});

test('scene audit uses public camera-parent roots for Bing 2, Graveyard, and Cartel Palace', () => {
  const root = { isScene: true };
  for (const [id, handle] of [
    ['bing-two', 'HOTDOG_INCIDENT'],
    ['graveyard', 'GRAVEYARD'],
    ['cartel-palace', 'CARTEL_PALACE'],
  ]) {
    const entry = scene(id);
    assert.deepEqual(entry.rootPaths, [[handle, 'player', 'camera', 'parent']]);
    const browserGlobal = {
      [handle]: { player: { camera: { parent: root } } },
    };
    assert.equal(installKnownSceneRoots({ paths: entry.rootPaths, root: browserGlobal }), 1);
    assert.deepEqual(browserGlobal.__auditRoots, [root]);
  }
});

test('scene audit launches the actual Heist and Silver Case preview worlds', () => {
  assert.deepEqual(scene('heist'), {
    id: 'heist',
    url: 'heist.html?preview=1&checkpoint=safehouse',
    launcherKey: 'scene:heist',
    start: '#start',
    rootPaths: [['__heistDebug', 'scene']],
  });
  assert.deepEqual(scene('silvercase'), {
    id: 'silvercase',
    url: 'silvercase.html?preview=1',
    launcherKey: 'scene:silvercase',
    start: '#beginBtn',
    rootPaths: [['silvercase', 'scene']],
  });
});

test('known root installation rejects empty and non-scene adapters', () => {
  const browserGlobal = {
    EMPTY: { player: { camera: { parent: { isScene: false } } } },
  };
  assert.equal(installKnownSceneRoots({
    paths: [['EMPTY', 'player', 'camera', 'parent']],
    root: browserGlobal,
  }), 0);
  assert.deepEqual(browserGlobal.__auditRoots, []);
});

test('scene readiness requires geometry the advisory audit will actually inspect', () => {
  const visible = {
    isMesh: true,
    geometry: { attributes: { position: { count: 3 } } },
    visible: true,
    material: { colorWrite: true },
    parent: null,
  };
  const hiddenParent = { visible: false, parent: null };
  const hidden = {
    isMesh: true,
    geometry: {},
    visible: true,
    material: { colorWrite: true },
    parent: hiddenParent,
  };
  const proxy = {
    isMesh: true, geometry: {}, visible: true, material: { colorWrite: false }, parent: null,
  };
  const hiddenMaterial = {
    isMesh: true,
    geometry: {},
    visible: true,
    material: { visible: false, colorWrite: true },
    parent: null,
  };
  const transparentMaterial = {
    isMesh: true,
    geometry: {},
    visible: true,
    material: { visible: true, colorWrite: true, transparent: true, opacity: 0 },
    parent: null,
  };
  const unusedVisibleMaterial = {
    isMesh: true,
    geometry: { groups: [{ start: 0, count: 6, materialIndex: 0 }] },
    visible: true,
    material: [
      { visible: false, colorWrite: true },
      { visible: true, colorWrite: true },
    ],
    parent: null,
  };
  const emptyDrawRange = {
    isMesh: true,
    geometry: {
      drawRange: { start: 0, count: 0 },
      attributes: { position: { count: 36 } },
    },
    visible: true,
    material: { visible: true, colorWrite: true },
    parent: null,
  };
  const groupOutsideDrawRange = {
    isMesh: true,
    geometry: {
      drawRange: { start: 0, count: 6 },
      index: { count: 12 },
      groups: [{ start: 6, count: 6, materialIndex: 1 }],
    },
    visible: true,
    material: [
      { visible: false, colorWrite: true },
      { visible: true, colorWrite: true },
    ],
    parent: null,
  };
  const root = {
    traverse(visitor) {
      for (const object of [
        hidden,
        proxy,
        hiddenMaterial,
        transparentMaterial,
        unusedVisibleMaterial,
        emptyDrawRange,
        groupOutsideDrawRange,
        visible,
      ]) {
        visitor(object);
      }
    },
  };

  assert.equal(countVisibleAuditMeshes([root]), 1);
  assert.equal(countVisibleAuditMeshes([{ traverse: (visitor) => visitor(hidden) }]), 0);
  assert.equal(isAuditRenderableMesh(visible), true);
  assert.equal(isAuditRenderableMesh(hiddenMaterial), false);
  assert.equal(isAuditRenderableMesh(transparentMaterial), false);
  assert.equal(isAuditRenderableMesh(unusedVisibleMaterial), false);
  assert.equal(isAuditRenderableMesh(emptyDrawRange), false);
  assert.equal(isAuditRenderableMesh(groupOutsideDrawRange), false);
  assert.equal(new Function(
    'globalThis',
    `return ${buildSceneAuditReadinessExpression()};`,
  )({ __auditRoots: [root] }), 1);

  const drawRangeScene = new THREE.Scene();
  const drawRangeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  drawRangeMesh.geometry.setDrawRange(0, 0);
  drawRangeScene.add(drawRangeMesh);
  assert.equal(collectSceneAuditItems([drawRangeScene], THREE).counted, 0);
});

test('scene audit rejects unknown requested scene IDs before an empty capture can pass', () => {
  assert.deepEqual(
    resolveSceneAuditSelection(SCENE_AUDIT_SCENES, ['mansion']).map(({ id }) => id),
    ['mansion'],
  );
  assert.throws(
    () => resolveSceneAuditSelection(SCENE_AUDIT_SCENES, ['mansoin']),
    /unknown scene audit id.*mansoin/i,
  );
});

test('scene audit executes its worker graph from immutable snapshotted bytes', () => {
  const bootstrap = readFileSync(new URL('../tools/scene-audit.mjs', import.meta.url), 'utf8');
  assert.match(bootstrap, /captureSources\[key\]\.source/);
  assert.match(bootstrap, /pathToFileURL\(path\.join\(snapshotRoot, SOURCE_PATHS\.worker\)\)/);
  assert.doesNotMatch(
    bootstrap,
    /pathToFileURL\(path\.join\(ROOT, SOURCE_PATHS\.worker\)\)/,
  );
});

test('scene audit waits for a delayed launcher registration and then awaits its async geometry', async () => {
  class FakeEventTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    removeEventListener(type, listener) {
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== listener));
    }
    dispatchEvent(event) {
      Object.defineProperty(event, 'currentTarget', { configurable: true, value: this });
      for (const listener of this.listeners.get(event.type) ?? []) listener.call(this, event);
    }
  }
  const browserGlobal = { EventTarget: FakeEventTarget };
  Function('globalThis', buildSceneAuditStartTrackingExpression())(browserGlobal);
  const launcher = new browserGlobal.EventTarget();
  const launcherRoot = { querySelectorAll: () => [launcher] };
  let geometryBuilt = false;
  const listener = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    geometryBuilt = true;
  };

  assert.equal(browserGlobal.__sceneAuditStartControlReady(launcher), false);
  assert.equal(sceneAuditStartControlsReady(
    '#start', launcherRoot, browserGlobal.__sceneAuditStartControlReady,
  ), false);
  await new Promise((resolve) => setTimeout(() => {
    launcher.addEventListener('click', listener);
    resolve();
  }, 0));
  assert.equal(browserGlobal.__sceneAuditStartControlReady(launcher), true);
  assert.equal(sceneAuditStartControlsReady(
    '#start', launcherRoot, browserGlobal.__sceneAuditStartControlReady,
  ), true);

  browserGlobal.__sceneAuditBeginStartCapture();
  launcher.dispatchEvent({ type: 'click' });
  assert.equal(geometryBuilt, false);
  assert.equal(await browserGlobal.__sceneAuditEndStartCapture(1000), 1);
  assert.equal(geometryBuilt, true);

  launcher.removeEventListener('click', listener);
  assert.equal(browserGlobal.__sceneAuditStartControlReady(launcher), false);
  launcher.onclick = () => {};
  assert.equal(browserGlobal.__sceneAuditStartControlReady(launcher), true);
});

test('scene audit closes its server and browser on injected launch and runtime failures', async () => {
  const fakeServer = () => ({
    listening: true,
    closes: 0,
    close(callback) {
      this.closes += 1;
      this.listening = false;
      callback();
    },
  });

  const launchServer = fakeServer();
  await assert.rejects(withSceneAuditResources({
    openServer: async () => launchServer,
    openBrowser: async () => { throw new Error('injected launch failure'); },
    run: async () => assert.fail('run must not execute after launch failure'),
  }), /injected launch failure/);
  assert.equal(launchServer.closes, 1);

  const runtimeServer = fakeServer();
  const browser = {
    closes: 0,
    async close() { this.closes += 1; },
  };
  await assert.rejects(withSceneAuditResources({
    openServer: async () => runtimeServer,
    openBrowser: async () => browser,
    run: async () => { throw new Error('injected runtime failure'); },
  }), /injected runtime failure/);
  assert.equal(browser.closes, 1);
  assert.equal(runtimeServer.closes, 1);
});

test('scene audit converts request-handler failures into fatal HTTP responses', async () => {
  const writes = [];
  const response = {
    statusCode: null,
    writeHead(status, headers) {
      this.statusCode = status;
      writes.push({ status, headers });
      return this;
    },
    end(body) { writes.push({ body }); },
  };
  const handler = createSceneAuditRequestHandler({
    root: 'C:\\audit-root',
    types: {},
    fileSystem: {
      existsSync() { throw new Error('injected stat race'); },
      statSync() { assert.fail('stat must not run after exists failure'); },
    },
    readFile: async () => assert.fail('read must not run after exists failure'),
  });

  await assert.doesNotReject(handler(
    { url: '/index.html', headers: { host: 'localhost:5388' } },
    response,
  ));
  assert.equal(response.statusCode, 500);
  assert.match(String(writes.at(-1).body), /scene audit server error/i);

  const served = [];
  const successWrites = [];
  const successResponse = {
    statusCode: null,
    writeHead(status, headers) {
      this.statusCode = status;
      successWrites.push({ status, headers });
      return this;
    },
    end(body) { successWrites.push({ body }); },
  };
  const successfulHandler = createSceneAuditRequestHandler({
    root: 'C:\\audit-root',
    types: { '.html': 'text/html; charset=utf-8' },
    fileSystem: {
      existsSync: () => true,
      statSync: () => ({ isDirectory: () => false }),
    },
    readFile: async () => Buffer.from('<main>audited</main>'),
    onServed: (record) => served.push(record),
  });
  await successfulHandler(
    { url: '/mansion.html', headers: { host: 'localhost:5388' } },
    successResponse,
  );
  assert.equal(successResponse.statusCode, 200);
  assert.equal(successWrites.at(-1).body.toString(), '<main>audited</main>');
  assert.deepEqual(served.map(({ path, bytes }) => ({ path, bytes })), [
    { path: 'mansion.html', bytes: 20 },
  ]);
  assert.match(served[0].sha256, /^[a-f0-9]{64}$/);
});

test('scene audit expands every InstancedMesh transform instead of hiding instances in one batch box', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const batch = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial(),
    2,
  );
  batch.name = 'gallery-sconce-backplate';
  batch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0.5, 0));
  batch.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 8.5, 0));
  batch.updateMatrixWorld(true);

  const instances = collectAuditMeshItems(batch, THREE);
  assert.equal(instances.length, 2);
  assert.deepEqual(instances.map(({ name, instanceIndex }) => [name, instanceIndex]), [
    ['gallery-sconce-backplate[0]', 0],
    ['gallery-sconce-backplate[1]', 1],
  ]);
  assert.deepEqual(instances.map(({ min, max }) => [min.y, max.y]), [
    [0, 1],
    [8, 9],
  ]);
  assert.equal(new Set(instances.map(({ uuid }) => uuid)).size, 2);

  const floor = auditBox('floor', [-2, -0.1, -2], [2, 0, 2]);
  floor.name = 'gallery-floor';
  assert.deepEqual(
    findUnsupportedAuditItems([floor, ...instances]).map(({ instanceIndex }) => instanceIndex),
    [1],
  );
});

test('scene audit reports non-finite mesh and instance bounds instead of dropping them', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const batch = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 2);
  batch.name = 'invalid-transform-batch';
  batch.setMatrixAt(0, new THREE.Matrix4().identity());
  batch.setMatrixAt(1, new THREE.Matrix4().makeTranslation(Number.NaN, 0, 0));
  batch.updateMatrixWorld(true);

  assert.throws(
    () => collectAuditMeshItems(batch, THREE),
    /invalid-transform-batch\[1\].*non-finite world bounds/i,
  );
});

test('scene audit collects a mesh once when parent and child scenes are both roots', () => {
  const parentScene = new THREE.Scene();
  const childScene = new THREE.Scene();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  crate.name = 'floating-crate';
  crate.position.y = 10;
  childScene.add(crate);
  parentScene.add(childScene);

  const collected = collectSceneAuditItems([parentScene, childScene], THREE);
  assert.equal(collected.counted, 1);
  assert.equal(collected.items.length, 1);
  assert.deepEqual(collected.collectionErrors, []);
  assert.deepEqual(findUnsupportedAuditItems(collected.items).map(({ name }) => name), [
    'floating-crate',
  ]);
  assert.equal(countVisibleAuditMeshes([parentScene, childScene]), 1);
});

test('scene audit excludes semantic VFX without hiding similarly named solid geometry', () => {
  for (const name of [
    'waterfall-cliff-column',
    'smoked wraparound windshield',
    'dog.head.muzzle',
    'silverback.muzzle',
    'waterfall-header-spur-0',
    'waterfall-header-bank-0-w',
    'waterfall-outflow-bar-1',
    'waterfall-plunge-rock-0',
    'dock water hose coil',
  ]) assert.equal(isAuditExcludedEffectMesh({ name }), false, name);
  for (const name of [
    'open water surface',
    'ocean surface plane',
    'cigarette smoke plume',
    'weapon muzzle flash',
    'ambient fog volume',
    'bullet tracer',
    'volcano-smoke-0',
    'courtyard-water-jet',
    'waterfall-sheet',
    'waterfall-header',
    'waterfall-outflow',
    'waterfall-pool',
    'waterfall-plunge-boil',
    'waterfall-mist-0',
    'suite-tub-water',
    'lavatory-vessel-water',
  ]) assert.equal(isAuditExcludedEffectMesh({ name }), true, name);

  const sceneRoot = new THREE.Scene();
  for (const name of [
    'waterfall-cliff-column',
    'smoked wraparound windshield',
    'dog.head.muzzle',
    'silverback.muzzle',
    'open water surface',
    'weapon muzzle flash',
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    sceneRoot.add(mesh);
  }
  assert.deepEqual(
    collectSceneAuditItems([sceneRoot], THREE).items.map(({ name }) => name),
    [
      'waterfall-cliff-column',
      'smoked wraparound windshield',
      'dog.head.muzzle',
      'silverback.muzzle',
    ],
  );
});

test('mounted-item audit names use semantic tokens instead of substring collisions', () => {
  for (const name of [
    'ceiling-lamp',
    'hallPictureLight',
    'mansion.guest.art',
    'portrait_frame',
  ]) {
    assert.equal(isMountedAuditName(name), true, `${name} should remain a mounted-item exemption`);
  }

  for (const name of [
    'dock cart',
    'golf-cart-seat-cushion',
    'the bartender',
    'cartel-palace.compound',
    'shubes-flight-helmet',
  ]) {
    assert.equal(isMountedAuditName(name), false, `${name} must remain visible to FLOATING`);
  }
});

test('floating audit uses nearby support geometry at cellar elevations', () => {
  const cellarFloor = auditBox('cellar-floor', [-5, -2.9, -5], [5, -2.8, 5]);
  cellarFloor.name = 'cellar-floor';
  const supportedCrate = auditBox('supported-crate', [-1, -2.8, -1], [0, -2, 0]);
  supportedCrate.name = 'supported-crate';
  const floatingCrate = auditBox('floating-crate', [1, -1.8, 1], [2, -1, 2]);
  floatingCrate.name = 'floating-crate';
  const raisedGround = auditBox('raised-ground', [-4, 8, -4], [4, 8.1, 4]);
  raisedGround.name = 'courtyard.ground';

  assert.deepEqual(
    findUnsupportedAuditItems([cellarFloor, supportedCrate, floatingCrate, raisedGround])
      .map(({ id }) => id),
    ['floating-crate'],
  );
  assert.equal(isStructuralBaseAuditItem(cellarFloor), true);
  assert.equal(isStructuralBaseAuditItem(raisedGround), true);
  assert.equal(isStructuralBaseAuditItem(floatingCrate), false);
  assert.equal(isStructuralBaseAuditItem({ ...floatingCrate, name: 'dock cart' }), false);

  const anonymousElevatedSlab = auditBox('anonymous-slab', [-1, 8, -1], [1, 8.001, 1]);
  assert.equal(
    isStructuralBaseAuditItem(anonymousElevatedSlab),
    false,
    'anonymous dimensions alone cannot prove an elevated slab is a structural floor',
  );
  assert.equal(isStructuralBaseAuditItem({
    ...anonymousElevatedSlab,
    ancestry: [{ name: 'cellar-floor', type: 'Group', uuid: 'floor-parent' }],
  }), true, 'an anonymous mesh may inherit an explicit structural role from its nearest named parent');
});

test('support audit retains signed nearest gaps and separates suspicious gaps from floating', () => {
  const floor = auditBox('floor', [-5, -0.1, -5], [5, 0, 5]);
  const pedestal = auditBox('pedestal', [-1, 0, -1], [1, 0.945, 1]);
  const table = auditBox('table-underside', [-2, 1, -2], [2, 1.1, 2]);
  const floating = auditBox('floating-crate', [3, 0.5, 3], [4, 1.5, 4]);
  const assessments = assessAuditSupport([floor, pedestal, table, floating]);
  const assessment = (id) => assessments.find(({ item }) => item.id === id);
  const summary = (id) => {
    const value = assessment(id);
    return {
      supported: value.supported,
      kind: value.kind,
      supporter: value.supporter?.id ?? null,
      gap: value.gap,
      cls: classifyAuditSupport(value)?.cls ?? null,
    };
  };

  assert.deepEqual(summary('table-underside'), {
    supported: true,
    kind: 'top',
    supporter: 'pedestal',
    gap: 0.05500000000000005,
    cls: 'SUSPICIOUS_SUPPORT_GAP',
  });
  assert.deepEqual(summary('floating-crate'), {
    supported: false,
    kind: 'nearest-top',
    supporter: 'floor',
    gap: 0.5,
    cls: 'FLOATING',
  });
});

test('support audit accepts bounded penetrating tops without treating a through-wall as a leg', () => {
  const floor = auditBox('floor', [-10, -0.1, -10], [10, 0, 10]);
  const wall = auditBox('through-wall', [-4, 0, -0.08], [4, 3, 0.08]);
  const leg = auditBox('table-leg', [-2.6, 0, -0.9], [-2.36, 0.87, -0.66]);
  const top = auditBox('table-top', [-2.9, 0.79, -1], [2.9, 0.97, 1]);
  const assessment = (items) => assessAuditSupport(items)
    .find(({ item }) => item.id === 'table-top');

  const supported = assessment([floor, wall, leg, top]);
  assert.deepEqual({
    supported: supported.supported,
    kind: supported.kind,
    supporter: supported.supporter?.id ?? null,
    gap: supported.gap,
    cls: classifyAuditSupport(supported)?.cls ?? null,
  }, {
    supported: true,
    kind: 'interpenetrating-top',
    supporter: 'table-leg',
    gap: -0.07999999999999996,
    cls: null,
  });

  const wallOnly = assessment([floor, wall, top]);
  assert.equal(wallOnly.supported, false);
  assert.equal(wallOnly.supporter?.id, 'floor');
  assert.equal(wallOnly.kind, 'nearest-top');
});

test('support audit does not let a tiny insert inside an item certify its floor support', () => {
  const target = auditBox('floating-target', [0, 1, 0], [1, 2, 1]);
  target.name = 'floating-target';
  const internalInsert = auditBox('internal-insert', [0.25, 1.01, 0.25], [0.75, 1.02, 0.75]);
  internalInsert.name = 'internal-insert';
  const assessment = assessAuditSupport([target, internalInsert])
    .find(({ item }) => item === target);

  assert.equal(assessment.supported, false);
  assert.deepEqual(findUnsupportedAuditItems([target, internalInsert]).map(({ id }) => id), [
    'floating-target',
  ]);

  const planeFloor = auditBox('zero-thickness-floor', [-1, 1, -1], [2, 1, 2]);
  const restingTarget = auditBox('resting-target', [0, 1, 0], [1, 2, 1]);
  const restingAssessment = assessAuditSupport([planeFloor, restingTarget])
    .find(({ item }) => item === restingTarget);
  assert.equal(restingAssessment.supported, true);
  assert.equal(restingAssessment.kind, 'top');
  assert.equal(restingAssessment.supporter, planeFloor);
  assert.equal(restingAssessment.gap, 0);
});

test('support audit remains self-contained when serialized into the browser IIFE', () => {
  const floor = auditBox('floor', [-10, -0.1, -10], [10, 0, 10]);
  const leg = auditBox('table-leg', [-0.2, 0, -0.2], [0.2, 0.87, 0.2]);
  const top = auditBox('table-top', [-1, 0.79, -1], [1, 0.97, 1]);
  const runSerialized = Function('items', `return (${assessAuditSupport.toString()})(items);`);

  const assessment = runSerialized([floor, leg, top])
    .find(({ item }) => item.id === 'table-top');
  assert.equal(assessment.supported, true);
  assert.equal(assessment.kind, 'interpenetrating-top');
  assert.equal(assessment.supporter.id, 'table-leg');
});

test('support audit requires positive footprint area instead of accepting an edge touch', () => {
  const edgeSupport = auditBox('edge-support', [1, 0, 0], [2, 1, 1]);
  const item = auditBox('unsupported-item', [0, 1, 0], [1, 2, 1]);
  const assessment = assessAuditSupport([edgeSupport, item])
    .find(({ item: candidate }) => candidate.id === 'unsupported-item');

  assert.equal(assessment.supported, false);
  assert.equal(assessment.supporter, null);
  assert.equal(assessment.gap, null);
  assert.equal(classifyAuditSupport(assessment)?.cls, 'FLOATING');
});

test('transform audit distinguishes mirrored, singular, and impossible scales', () => {
  const classes = (transform) => classifyAuditTransform(transform).map(({ cls }) => cls);

  assert.deepEqual(classes({
    determinant: -1,
    localScale: { x: 1, y: -1, z: 1 },
    worldScale: { x: -1, y: 1, z: 1 },
  }), ['MIRRORED']);
  assert.deepEqual(classes({
    determinant: 0,
    localScale: { x: 1, y: 0, z: 1 },
    worldScale: { x: 1, y: 0, z: 1 },
  }), ['SINGULAR']);
  assert.deepEqual(classes({
    determinant: 1e18,
    localScale: { x: 1e6, y: 1e6, z: 1e6 },
    worldScale: { x: 1, y: 1, z: 1 },
  }), ['IMPOSSIBLE_TRANSFORM']);
  assert.deepEqual(classes({
    determinant: 1e-18,
    localScale: { x: 1, y: 1, z: 1 },
    worldScale: { x: 1e-6, y: 1e-6, z: 1e-6 },
  }), ['SINGULAR', 'IMPOSSIBLE_TRANSFORM']);
});

test('audit findings retain actionable bounds, transform, identity, and ancestry metadata', () => {
  const item = {
    name: 'cellar-crate',
    uuid: 'mesh-uuid',
    ancestry: [{ name: 'cellar', type: 'Group', uuid: 'group-uuid' }],
    geo: 'BoxGeometry',
    min: { x: 1.125, y: -1.875, z: 3.25 },
    max: { x: 2.5, y: -1, z: 4.75 },
    size: { x: 1.375, y: 0.875, z: 1.5 },
    determinant: 2,
    localScale: { x: 1, y: 2, z: 1 },
    worldScale: { x: 1, y: 2, z: 1 },
  };
  const related = { ...item, name: 'cellar-wall', uuid: 'related-uuid' };
  const support = {
    supported: true,
    kind: 'top',
    supporter: related,
    gap: 0.055,
  };

  assert.deepEqual(createAuditFinding('COPLANAR', item, 'shared x plane', related, support), {
    cls: 'COPLANAR',
    name: 'cellar-crate',
    uuid: 'mesh-uuid',
    geometry: 'BoxGeometry',
    ancestry: [{ name: 'cellar', type: 'Group', uuid: 'group-uuid' }],
    bounds: {
      min: { x: 1.125, y: -1.875, z: 3.25 },
      max: { x: 2.5, y: -1, z: 4.75 },
      size: { x: 1.375, y: 0.875, z: 1.5 },
    },
    transform: {
      determinant: 2,
      localScale: { x: 1, y: 2, z: 1 },
      worldScale: { x: 1, y: 2, z: 1 },
    },
    at: [1.13, -1.88, 3.25],
    detail: 'shared x plane',
    support: {
      supported: true,
      kind: 'top',
      gap: 0.055,
      supporter: { name: 'cellar-wall', uuid: 'related-uuid' },
    },
    related: {
      name: 'cellar-wall',
      uuid: 'related-uuid',
      geometry: 'BoxGeometry',
      ancestry: [{ name: 'cellar', type: 'Group', uuid: 'group-uuid' }],
      bounds: {
        min: { x: 1.125, y: -1.875, z: 3.25 },
        max: { x: 2.5, y: -1, z: 4.75 },
        size: { x: 1.375, y: 0.875, z: 1.5 },
      },
      transform: {
        determinant: 2,
        localScale: { x: 1, y: 2, z: 1 },
        worldScale: { x: 1, y: 2, z: 1 },
      },
    },
  });
});

test('coplanar audit retains multiple unnamed overlays on the same axis', () => {
  const zeroThicknessA = auditBox('plate-a', [0, 0, 0], [0, 1, 1]);
  const zeroThicknessB = auditBox('plate-b', [0, 0, 0], [0, 1, 1]);
  const sameFaceA = auditBox('face-a', [1, 2, 0], [3, 3, 1]);
  const sameFaceB = auditBox('face-b', [2, 2, 0], [3, 3, 1]);

  const pairs = findCoplanarAuditPairs([
    zeroThicknessA,
    zeroThicknessB,
    sameFaceA,
    sameFaceB,
  ]).filter(({ axis }) => axis === 'x');

  assert.deepEqual(
    pairs.map(({ a, b }) => [a.id, b.id]),
    [['plate-a', 'plate-b'], ['face-a', 'face-b']],
  );
});

test('coplanar audit compares faces within tolerance across adjacent quantization buckets', () => {
  for (const [left, right] of [
    [0.00029, 0.00031], // the exact old round-to-nearest boundary regression
    [0.00059, 0.00061], // the replacement floor-bucket boundary
  ]) {
    const leftBucket = auditBox('left-bucket', [left, 0, 0], [left, 1, 1]);
    const rightBucket = auditBox('right-bucket', [right, 0, 0], [right, 1, 1]);
    const xPairs = findCoplanarAuditPairs([leftBucket, rightBucket], {
      flat: 0.0006,
    }).filter(({ axis, summary }) => axis === 'x' && !summary);

    assert.deepEqual(xPairs.map(({ a, b }) => [a.id, b.id]), [
      ['left-bucket', 'right-bucket'],
    ]);
  }
});

test('coplanar audit bounds crowded-plane output while retaining a deterministic signal', () => {
  for (const count of [61, 1_000]) {
    const overlays = Array.from({ length: count }, (_, index) => (
      auditBox(`overlay-${index}`, [0, 0, 0], [0, 1, 1])
    ));
    const started = performance.now();
    const xResults = findCoplanarAuditPairs(overlays, {
      maxCrowdedPairs: 12,
      maxCrowdedComparisons: 200,
    }).filter(({ axis }) => axis === 'x');
    const elapsedMs = performance.now() - started;
    const summary = xResults.find(({ summary: value }) => value === true);

    assert.ok(summary, `${count} overlays must emit a crowded-plane summary`);
    assert.equal(summary.groupSize, count);
    assert.ok(xResults.some(({ summary: value }) => value !== true));
    assert.ok(xResults.length <= 13, `${count} overlays emitted ${xResults.length} x results`);
    assert.ok(elapsedMs < 1_000, `${count} overlays took ${elapsedMs.toFixed(1)}ms`);
  }
});

test('coplanar crowded summary survives when the only overlap is beyond the comparison cap', () => {
  const plates = Array.from({ length: 100 }, (_, index) => {
    const x = index >= 98 ? 1_000 : index * 2;
    return auditBox(`plate-${index}`, [x, 0, 0], [x + 1, 0, 1]);
  });
  const yResults = findCoplanarAuditPairs(plates, {
    maxCrowdedComparisons: 4_096,
    maxCrowdedPairs: 24,
  }).filter(({ axis }) => axis === 'y');
  const summary = yResults.find(({ summary: value }) => value === true);

  assert.ok(summary, 'the crowded plane vanished because its late overlap was outside the sample');
  assert.equal(summary.groupSize, 100);
  assert.equal(summary.pairsReported, 0);
  assert.equal(summary.truncated, true);
});

test('coplanar audit ignores the three known apartment box-contact seams', () => {
  const contacts = [
    [
      auditBox('west-wall', [-5.16, 0, -4.5], [-5, 2.75, 4.5]),
      auditBox('west-skirting', [-5, 0, -4.5], [-4.98, 0.09, 4.5]),
    ],
    [
      auditBox('countertop', [4.36, 0.88, -1.9], [5, 0.92, -0.5]),
      auditBox('cooktop', [4.44, 0.92, -1.82], [4.94, 0.932, -1.3]),
    ],
    [
      auditBox('north-wall', [-5, 0, -4.66], [-1.9, 2.75, -4.5]),
      auditBox('north-skirting', [-5, 0, -4.5], [-1.9, 0.09, -4.48]),
    ],
  ];

  for (const [solid, attached] of contacts) {
    assert.deepEqual(findCoplanarAuditPairs([solid, attached]), []);
  }
});

test('scene audit CLI atomically writes explicit JSON with reproducible provenance', async () => {
  assert.equal(isSceneAuditAbsoluteAnyPlatform('/outside.js'), true);
  assert.equal(isSceneAuditAbsoluteAnyPlatform('C:\\outside.js'), true);
  assert.equal(isSceneAuditAbsoluteAnyPlatform('\\\\server\\share\\outside.js'), true);
  assert.equal(isSceneAuditAbsoluteAnyPlatform('src/new-scene.js'), false);
  assert.equal(isSceneAuditAbsoluteAnyPlatform('src\\new-scene.js'), false);
  assert.equal(isSceneAuditRelativePathContained('src/new-scene.js'), true);
  assert.equal(isSceneAuditRelativePathContained('src\\new-scene.js'), true);
  assert.equal(isSceneAuditRelativePathContained('../outside.js'), false);
  assert.equal(isSceneAuditRelativePathContained('..\\outside.js'), false);
  assert.equal(isSceneAuditRelativePathContained('/outside.js'), false);
  assert.equal(isSceneAuditRelativePathContained('C:\\outside.js'), false);

  assert.deepEqual(
    parseSceneAuditArgs(['--json', '--out', 'evidence.json', 'mansion']),
    { asJson: true, outputPath: 'evidence.json', only: ['mansion'] },
  );

  const servedManifest = buildSceneAuditServedManifest([
    { path: 'mansion.html', bytes: Buffer.from('runtime html') },
    { path: 'mansion.html', bytes: Buffer.from('runtime html') },
    { path: 'nowake.html', bytes: Buffer.from('runtime no-wake html') },
    { path: 'src/main.js', bytes: Buffer.from('runtime source') },
  ]);
  assert.equal(servedManifest.entries.length, 3);
  assert.match(servedManifest.fingerprint, /^[a-f0-9]{64}$/);
  assert.throws(() => buildSceneAuditServedManifest([
    { path: 'src/main.js', bytes: Buffer.from('version A') },
    { path: 'src/main.js', bytes: Buffer.from('version B') },
  ]), /multiple byte versions.*src\/main\.js/i);

  const runtime = {
    node: { version: 'v24.14.1', platform: 'win32', arch: 'x64' },
    playwright: { version: '1.60.0' },
    browser: {
      type: 'chromium',
      version: 'HeadlessChrome/140.0.0.0',
      executableSource: 'playwright-bundled',
      executablePath: 'C:/playwright/chromium/headless_shell.exe',
      launchArgs: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
    },
  };

  const evidenceInput = {
    report: [{ scene: 'mansion', counted: 1, findings: [] }],
    scenes: [{ id: 'mansion', url: 'mansion.html?preview=1', launcherKey: 'scene:mansion' }],
    head: '0123456789abcdef',
    timestamp: '2026-08-11T12:34:56.000Z',
    tool: { path: 'tools/scene-audit.mjs', source: 'tool source' },
    worker: { path: 'tools/scene-audit-worker.mjs', source: 'worker source' },
    runtimeDependencies: [{ path: 'src/core/preview-mode.js', source: 'preview source' }],
    runtime,
    servedManifest,
    evidenceTool: { path: 'tools/scene-audit-evidence.mjs', source: 'evidence source' },
    sceneConfig: { path: 'tools/scene-audit-scenes.mjs', source: 'config source' },
    workspace: buildSceneAuditWorkspaceFingerprint({
      head: '0123456789abcdef',
      status: ' M src/world.js\0?? src/new-scene.js\0',
      diff: 'diff --git a/src/world.js b/src/world.js\n+new geometry\n',
      untracked: [{ path: 'src/new-scene.js', sha256: 'a'.repeat(64), bytes: 12 }],
    }),
  };
  assert.throws(() => buildSceneAuditEvidence({
    ...evidenceInput,
    runtime: undefined,
  }), /runtime provenance/i);
  assert.throws(() => buildSceneAuditEvidence({
    ...evidenceInput,
    servedManifest: buildSceneAuditServedManifest([]),
  }), /served-byte manifest.*empty|no served bytes/i);
  assert.throws(() => buildSceneAuditEvidence({
    ...evidenceInput,
    servedManifest: buildSceneAuditServedManifest([
      { path: 'src/main.js', bytes: Buffer.from('runtime source') },
    ]),
  }), /served-byte manifest.*mansion\.html|launch document.*mansion\.html/i);
  const evidence = buildSceneAuditEvidence(evidenceInput);

  assert.equal(evidence.schema, 'squatchsmash.scene-geometry-audit.v4');
  assert.equal(evidence.head, '0123456789abcdef');
  assert.equal(evidence.timestamp, '2026-08-11T12:34:56.000Z');
  assert.match(evidence.sourceFingerprint, /^[a-f0-9]{64}$/);
  assert.match(evidence.tool.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.worker.path, 'tools/scene-audit-worker.mjs');
  assert.match(evidence.worker.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.runtimeDependencies.map(({ path }) => path), [
    'src/core/preview-mode.js',
  ]);
  assert.match(evidence.runtimeDependencies[0].sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.runtime, runtime);
  assert.equal(evidence.evidenceTool.path, 'tools/scene-audit-evidence.mjs');
  assert.match(evidence.evidenceTool.sha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.sceneConfig.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.sceneConfig.count, 1);
  assert.deepEqual(evidence.sceneConfig.scenes.map(({ id }) => id), ['mansion']);
  assert.deepEqual(evidence.coverage, {
    expected: 1,
    reported: 1,
    missing: [],
    unexpected: [],
    sceneErrors: [],
    complete: true,
  });
  assert.equal(evidence.workspace.dirty, true);
  assert.equal(evidence.workspace.changedEntries, 2);
  assert.match(evidence.workspace.statusSha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.workspace.diffSha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.workspace.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.workspace.untracked, [
    { path: 'src/new-scene.js', sha256: 'a'.repeat(64), bytes: 12 },
  ]);
  const driftedWorkspace = buildSceneAuditWorkspaceFingerprint({
    head: '0123456789abcdef',
    status: ' M src/world.js\0?? src/new-scene.js\0',
    diff: 'diff --git a/src/world.js b/src/world.js\n+different geometry\n',
    untracked: [{ path: 'src/new-scene.js', sha256: 'a'.repeat(64), bytes: 12 }],
  });
  assert.notEqual(driftedWorkspace.fingerprint, evidence.workspace.fingerprint);
  assert.doesNotThrow(() => assertSceneAuditCaptureStable(
    {
      head: evidence.head,
      workspace: evidence.workspace,
      sources: buildSceneAuditSourceSnapshot({
        tool: { path: 'tools/scene-audit.mjs', source: 'tool source' },
        sceneConfig: { path: 'tools/scene-audit-scenes.mjs', source: 'config source' },
      }),
    },
    {
      head: evidence.head,
      workspace: evidence.workspace,
      sources: buildSceneAuditSourceSnapshot({
        tool: { path: 'tools/scene-audit.mjs', source: 'tool source' },
        sceneConfig: { path: 'tools/scene-audit-scenes.mjs', source: 'config source' },
      }),
    },
  ));
  assert.throws(() => assertSceneAuditCaptureStable(
    { head: evidence.head, workspace: evidence.workspace },
    { head: evidence.head, workspace: driftedWorkspace },
  ), /workspace changed during scene audit/i);
  assert.throws(() => assertSceneAuditCaptureStable(
    {
      head: evidence.head,
      workspace: evidence.workspace,
      sources: buildSceneAuditSourceSnapshot({
        tool: { path: 'tools/scene-audit.mjs', source: 'tool source' },
      }),
    },
    {
      head: evidence.head,
      workspace: evidence.workspace,
      sources: buildSceneAuditSourceSnapshot({
        tool: { path: 'tools/scene-audit.mjs', source: 'changed tool source' },
      }),
    },
  ), /audit source changed during scene audit/i);

  const incompleteEvidence = buildSceneAuditEvidence({
    report: [{ scene: 'mansion', error: 'scene root stayed empty' }],
    scenes: [
      { id: 'mansion', url: 'mansion.html?preview=1', launcherKey: 'scene:mansion' },
      { id: 'nowake', url: 'nowake.html?preview=1', launcherKey: 'scene:no-wake' },
    ],
    head: evidence.head,
    timestamp: evidence.timestamp,
    tool: { path: 'tools/scene-audit.mjs', source: 'tool source' },
    worker: { path: 'tools/scene-audit-worker.mjs', source: 'worker source' },
    runtimeDependencies: [{ path: 'src/core/preview-mode.js', source: 'preview source' }],
    runtime,
    servedManifest,
    evidenceTool: { path: 'tools/scene-audit-evidence.mjs', source: 'evidence source' },
    sceneConfig: { path: 'tools/scene-audit-scenes.mjs', source: 'config source' },
    workspace: evidence.workspace,
  });
  assert.deepEqual(incompleteEvidence.coverage, {
    expected: 2,
    reported: 1,
    missing: ['nowake'],
    unexpected: [],
    sceneErrors: [{ scene: 'mansion', error: 'scene root stayed empty' }],
    complete: false,
  });

  const brokenRuntimeEvidence = buildSceneAuditEvidence({
    report: [{
      scene: 'mansion',
      counted: 1,
      findings: [],
      pageErrors: ['render loop exploded'],
      consoleErrors: ['caught boot failure'],
      httpErrors: [
        { status: 403, url: 'http://localhost:5388/assets/forbidden.png' },
        { status: 500, url: 'http://localhost:5388/assets/broken.json' },
      ],
      notFound: ['http://localhost:5388/assets/missing.png'],
      requestFailures: ['http://localhost:5388/assets/failed.png — net::ERR_FAILED'],
      collectionErrors: [{ name: 'bad-mesh', uuid: 'bad-uuid', error: 'unsupported geometry' }],
    }],
    scenes: [{ id: 'mansion', url: 'mansion.html?preview=1', launcherKey: 'scene:mansion' }],
    head: evidence.head,
    timestamp: evidence.timestamp,
    tool: { path: 'tools/scene-audit.mjs', source: 'tool source' },
    worker: { path: 'tools/scene-audit-worker.mjs', source: 'worker source' },
    runtimeDependencies: [{ path: 'src/core/preview-mode.js', source: 'preview source' }],
    runtime,
    servedManifest,
    evidenceTool: { path: 'tools/scene-audit-evidence.mjs', source: 'evidence source' },
    sceneConfig: { path: 'tools/scene-audit-scenes.mjs', source: 'config source' },
    workspace: evidence.workspace,
  });
  assert.equal(brokenRuntimeEvidence.coverage.complete, false);
  assert.deepEqual(brokenRuntimeEvidence.coverage.sceneErrors, [
    { scene: 'mansion', error: 'page error: render loop exploded' },
    { scene: 'mansion', error: 'console error: caught boot failure' },
    { scene: 'mansion', error: 'HTTP 403: http://localhost:5388/assets/forbidden.png' },
    { scene: 'mansion', error: 'HTTP 500: http://localhost:5388/assets/broken.json' },
    { scene: 'mansion', error: '404: http://localhost:5388/assets/missing.png' },
    { scene: 'mansion', error: 'request failed: http://localhost:5388/assets/failed.png — net::ERR_FAILED' },
    { scene: 'mansion', error: 'mesh collection failed: bad-mesh — unsupported geometry' },
  ]);

  const emptyRuntimeEvidence = buildSceneAuditEvidence({
    ...brokenRuntimeEvidence,
    report: [{ scene: 'mansion', counted: 0, findings: [] }],
    scenes: [{ id: 'mansion', url: 'mansion.html?preview=1', launcherKey: 'scene:mansion' }],
    tool: { path: 'tools/scene-audit.mjs', source: 'tool source' },
    worker: { path: 'tools/scene-audit-worker.mjs', source: 'worker source' },
    runtimeDependencies: [{ path: 'src/core/preview-mode.js', source: 'preview source' }],
    runtime,
    servedManifest,
    evidenceTool: { path: 'tools/scene-audit-evidence.mjs', source: 'evidence source' },
    sceneConfig: { path: 'tools/scene-audit-scenes.mjs', source: 'config source' },
    workspace: evidence.workspace,
  });
  assert.equal(emptyRuntimeEvidence.coverage.complete, false);
  assert.deepEqual(emptyRuntimeEvidence.coverage.sceneErrors, [
    { scene: 'mansion', error: 'audit counted zero meshes' },
  ]);

  for (const reportEntry of [
    { scene: 'mansion', findings: [] },
    { scene: 'mansion', counted: Number.NaN, findings: [] },
    { scene: 'mansion', counted: '1', findings: [] },
    { scene: 'mansion', counted: 1 },
  ]) {
    const malformedRuntimeEvidence = buildSceneAuditEvidence({
      ...brokenRuntimeEvidence,
      report: [reportEntry],
      scenes: [{ id: 'mansion', url: 'mansion.html?preview=1', launcherKey: 'scene:mansion' }],
      tool: { path: 'tools/scene-audit.mjs', source: 'tool source' },
      worker: { path: 'tools/scene-audit-worker.mjs', source: 'worker source' },
      runtimeDependencies: [{ path: 'src/core/preview-mode.js', source: 'preview source' }],
      runtime,
      servedManifest,
      evidenceTool: { path: 'tools/scene-audit-evidence.mjs', source: 'evidence source' },
      sceneConfig: { path: 'tools/scene-audit-scenes.mjs', source: 'config source' },
      workspace: evidence.workspace,
    });
    assert.equal(malformedRuntimeEvidence.coverage.complete, false,
      `malformed runtime false-passed: ${JSON.stringify(reportEntry)}`);
    assert.ok(malformedRuntimeEvidence.coverage.sceneErrors.some(({ error }) => (
      /finite positive mesh count|findings array/i.test(error)
    )), JSON.stringify(malformedRuntimeEvidence.coverage.sceneErrors));
  }

  const directory = await mkdtemp(join(tmpdir(), 'scene-audit-evidence-'));
  const outputPath = join(directory, 'audit.json');
  try {
    await writeSceneAuditEvidenceAtomic(outputPath, evidence);
    assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), evidence);
    const replacement = {
      ...evidence,
      timestamp: '2026-08-11T12:35:56.000Z',
      report: [{ scene: 'mansion', counted: 2, findings: [] }],
    };
    await writeSceneAuditEvidenceAtomic(outputPath, replacement);
    assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), replacement);
    let renameAttempts = 0;
    const retryReplacement = { ...replacement, timestamp: '2026-08-11T12:36:56.000Z' };
    await writeSceneAuditEvidenceAtomic(outputPath, retryReplacement, {
      renameFile: async (...args) => {
        renameAttempts++;
        if (renameAttempts === 1) {
          const error = new Error('simulated transient Windows rename contention');
          error.code = 'EPERM';
          throw error;
        }
        return rename(...args);
      },
      retryDelayMs: 0,
    });
    assert.equal(renameAttempts, 2);
    assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), retryReplacement);
    assert.deepEqual(await readdir(directory), ['audit.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
