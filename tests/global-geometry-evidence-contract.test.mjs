import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as THREE from 'three';

import {
  GLOBAL_GEOMETRY_EVIDENCE_SCHEMA,
  GLOBAL_GEOMETRY_EVIDENCE_SHOTS,
  assertGlobalGeometryEvidenceSourcesUnchanged,
  canonicalGlobalGeometryServedManifest,
  currentGlobalGeometryEvidenceSourceIdentities,
  evaluateGlobalGeometryCaptureState,
  evaluateGlobalGeometryEvidenceRun,
  evaluateGlobalGeometryShot,
  globalGeometryServedDiskManifest,
  hashStableEvidence,
  parseGlobalGeometryEvidenceRun,
  servedEvidenceFingerprint,
  snapshotGlobalGeometryServedDiskUniverse,
  snapshotGlobalGeometryServedSourceBytes,
} from '../tools/global-geometry-evidence-contract.mjs';
import {
  captureGlobalGeometryEvidence,
  captureGlobalGeometryCanvasFrame,
  createGlobalGeometryIdMaterial,
  createGlobalGeometryControlledRenderer,
  globalGeometryRenderStateSnapshot,
  servedResponseTracker,
  decodeGlobalGeometryPng,
  measureGlobalGeometryPixelProof,
  resolveGlobalGeometryRuntimeSurface,
  createGlobalGeometryImmutableServer,
} from '../tools/capture-global-geometry-evidence.mjs';
import {
  materializeGlobalGeometryImmutableBootstrap,
  runGlobalGeometryImmutableBootstrap,
} from '../tools/run-global-geometry-evidence.mjs';
import { beginEvidenceDirectoryTransaction } from '../tools/evidence-directory-transaction.mjs';
import * as globalGeometryCapture from '../tools/capture-global-geometry-evidence.mjs';

const captureSource = fs.readFileSync(
  new URL('../tools/capture-global-geometry-evidence.mjs', import.meta.url),
  'utf8',
);
const motelSource = fs.readFileSync(
  new URL('../src/motel/main.js', import.meta.url),
  'utf8',
);
const noWakeHtml = fs.readFileSync(
  new URL('../nowake.html', import.meta.url),
  'utf8',
);
const cartelMainSource = fs.readFileSync(
  new URL('../src/cartel-palace/main.js', import.meta.url),
  'utf8',
);
const sceneHtmlByPage = new Map([
  'silver.html', 'cartel-palace.html', 'mansion.html', 'nowake.html',
  'motel.html', 'beefrun.html', 'enolasquatch.html', 'bing.html',
].map((page) => [
  page,
  fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8'),
]));

function testCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(testCrc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function rgbaPng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) {
    const target = row * (width * 4 + 1);
    scanlines[target] = 0;
    rgba.copy(scanlines, target + 1, row * width * 4, (row + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function setMetric(ledger, key, value) {
  ledger[key] = value;
}

function satisfyingMetric(rule) {
  if (Number.isFinite(rule.eq)) return rule.eq;
  if (Number.isFinite(rule.gte) && Number.isFinite(rule.lte)) {
    return (rule.gte + rule.lte) / 2;
  }
  if (Number.isFinite(rule.gte)) return rule.gte;
  if (Number.isFinite(rule.lte)) return Math.min(0, rule.lte);
  throw new Error(`test fixture cannot satisfy ${JSON.stringify(rule)}`);
}

function validLegality(shot, focusMeshCount) {
  const policy = shot.scene === 'motel' ? {
    source: 'motel.level.aabb.all-enabled-solid-policy',
    coverage: 'all-enabled-motel-level-aabbs+focused-visible-meshes',
    colliderCoverage: { enabled: 128, bed: 2, table: 1, bounds: 4, other: 121 },
  } : shot.scene === 'no-wake' ? {
    source: 'nowake.world+active-boat-local',
    coverage: 'world+active-boat-colliders+focused-visible-meshes;neighbor-boats-are-visual-only',
  } : shot.scene === 'enola' ? {
    source: 'player.world.box3',
    coverage: 'static-world-colliders+focused-visible-meshes;aircraft-interior-has-no-solid-model',
  } : {
    source: 'player.world.box3',
    coverage: 'world-colliders+focused-visible-meshes',
  };
  return {
    ...policy,
    blockerCount: 128,
    focusMeshCount,
    testedPosition: [1, 2, 3],
    minClearanceM: 0.25,
    colliderClear: true,
    insideSolidClear: true,
    colliderBlockers: [],
    solidBlockers: [],
  };
}

function validCameraBinding() {
  return {
    dedicated: true,
    liveCameraUuid: 'live-camera-uuid',
    evidenceCameraUuid: 'evidence-camera-uuid',
    worldPosition: [1, 2, 3],
    matrixWorld: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      1, 2, 3, 1,
    ],
    renderStateSha256: '7'.repeat(64),
    renderStateRenderableCount: 100,
    simulationPaused: true,
    pauseApi: 'window.__scenePause',
    cameraChildren: {
      hiddenViewmodels: ['heldDrinks:heldDrinks'],
      preservedCameraLights: ['PointLight:playerFill'],
      hiddenUnknown: 0,
    },
  };
}

function validState(shot) {
  const ledger = {};
  for (const [key, rule] of Object.entries(shot.metricRules)) {
    setMetric(ledger, key, satisfyingMetric(rule));
  }
  const targetHits = Math.max(
    shot.composition.minTargetHits,
    Math.ceil(25 * shot.composition.minTargetRatio),
  );
  const owners = shot.composition.ownerIds.map((id) => {
    const bodyParts = Math.max(shot.composition.minVisibleBodyParts, 2);
    const supportParts = Math.max(shot.composition.minVisibleSupportParts, 2);
    const silhouetteHits = Math.max(
      Math.ceil(25 * shot.composition.minOwnerSilhouetteRatio), 15,
    );
    return {
      id,
      connected: true,
      distinctSupport: true,
      bodyParts,
      supportParts,
      visibleBodyParts: bodyParts,
      visibleSupportParts: supportParts,
      partCoverage: 1,
      silhouette: {
        sampleCount: 25,
        targetHits: silhouetteHits,
        hitRatio: silhouetteHits / 25,
      },
    };
  });
  const composition = {
    fullyInside: true,
    focusObjectCount: shot.composition.minFocusObjects,
    ndc: { minX: -0.62, maxX: 0.62, minY: -0.48, maxY: 0.48 },
    visibility: {
      sampleCount: 25,
      targetHits,
      hitRatio: targetHits / 25,
      visibleGroups: Object.fromEntries(
        Object.entries(shot.composition.requiredVisibleGroups),
      ),
    },
    owners,
  };
  return {
    ledger,
    ownership: shot.ownership ? {
      ownerIds: [...shot.ownership.ownerIds],
      dependentIds: [...shot.ownership.dependentIds],
      edges: shot.ownership.edges.map(({ dependent, owner }) => ({
        dependent, owner, gapM: 0, overlapM2: 0.01,
      })),
      distribution: { ...shot.ownership.distribution },
      unowned: 0,
      multiplyOwned: 0,
    } : null,
    cameraBinding: validCameraBinding(),
    cameraClearance: validLegality(shot, composition.focusObjectCount),
    composition,
  };
}

function validServed(shot, baseUrl = 'http://127.0.0.1:54999') {
  const sourceDirectories = { enola: 'enolasquatch' };
  const entryModule = shot.entryModule
    || `src/${sourceDirectories[shot.scene] || shot.scene}/main.js`;
  const diskIdentity = (relativeFile) => {
    const bytes = fs.readFileSync(new URL(`../${relativeFile}`, import.meta.url));
    return {
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  };
  const entries = [
    {
      url: `${baseUrl}/${shot.page}`,
      status: 200,
      resourceType: 'document',
      ...diskIdentity(shot.page.split('?')[0]),
    },
    {
      url: new URL(
        entryModule,
        `${baseUrl}/`,
      ).href,
      status: 200,
      resourceType: 'script',
      ...diskIdentity(entryModule),
    },
  ];
  return {
    launchDocument: entries[0].url,
    entries,
    fingerprint: servedEvidenceFingerprint(entries),
  };
}

function validShot(shot, baseUrl = 'http://127.0.0.1:54999') {
  const state = validState(shot);
  const colors = [
    '#ff3b30', '#34c759', '#0a84ff', '#ffd60a', '#bf5af2', '#ff9f0a',
    '#64d2ff', '#ff375f', '#30d158', '#5e5ce6', '#ac8e68', '#ffffff',
  ];
  const pixelOwners = state.composition.owners.map(({ id }, index) => ({
    id,
    color: colors[index],
    visiblePixels: 1000,
    coverageRatio: 1000 / (1280 * 720),
    componentCount: 1,
    largestComponentPixels: 1000,
    largestComponentRatio: 1,
    ringPixels: 100,
    contrast: 0.2,
  }));
  const pixelCore = {
    imagePngBytes: 24000,
    imagePngSha256: 'c'.repeat(64),
    maskPngBytes: 12000,
    maskPngSha256: 'f'.repeat(64),
    imageRgbaSha256: 'd'.repeat(64),
    maskRgbaSha256: 'e'.repeat(64),
    classifiedPixels: pixelOwners.length * 1000,
    unclassifiedColoredPixels: 0,
    owners: pixelOwners,
  };
  return {
    id: shot.id,
    scene: shot.scene,
    page: shot.page,
    file: shot.file,
    baseUrl,
    camera: {
      candidate: 3,
      scene: shot.scene,
      fov: 50,
      aspect: 1280 / 720,
      near: 0.05,
      far: 1000,
      position: [1, 2, 3],
      target: [0, 0.5, 0],
      distanceM: Math.hypot(1, 1.5, 3),
      legality: structuredClone(state.cameraClearance),
      binding: structuredClone(state.cameraBinding),
      proof: structuredClone(state.composition),
    },
    fresh: { screenshotAbsentBefore: true, ownerMaskAbsentBefore: true },
    runtime: { pageErrors: [], consoleErrors: [], httpErrors: [], requestFailures: [] },
    before: structuredClone(state),
    after: structuredClone(state),
    pngBinding: structuredClone(state.cameraBinding),
    screenshot: {
      file: shot.file,
      width: 1280,
      height: 720,
      bytes: 24000,
      sha256: 'c'.repeat(64),
      decoded: {
        bitDepth: 8,
        colorType: 6,
        interlace: 0,
        rgbaBytes: 1280 * 720 * 4,
        rgbaSha256: pixelCore.imageRgbaSha256,
      },
      ownerMask: {
        file: `owner-masks/${shot.id}.png`,
        width: 1280,
        height: 720,
        bytes: 12000,
        sha256: 'f'.repeat(64),
        decoded: {
          bitDepth: 8,
          colorType: 6,
          interlace: 0,
          rgbaBytes: 1280 * 720 * 4,
          rgbaSha256: pixelCore.maskRgbaSha256,
        },
      },
      pixelProof: {
        ...pixelCore,
        proofSha256: hashStableEvidence(pixelCore),
        maskBinding: structuredClone(state.cameraBinding),
        restoredBinding: structuredClone(state.cameraBinding),
      },
    },
    served: validServed(shot, baseUrl),
  };
}

function validRun() {
  const baseUrl = 'http://127.0.0.1:54999';
  const shots = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.map((shot) => validShot(shot, baseUrl));
  const sources = currentGlobalGeometryEvidenceSourceIdentities();
  const report = {
    schema: GLOBAL_GEOMETRY_EVIDENCE_SCHEMA,
    label: 'geometry-final-54999',
    baseUrl,
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    fresh: { runDirectoryExistedBefore: false },
    provenance: {
      ...sources,
      immutableBootstrap: {
        mode: 'content-addressed-worker',
        verified: true,
        expectedSourceSha256: sources.sourceSnapshotSha256,
        executedSourceSha256: sources.sourceSnapshotSha256,
      },
      sourceManifestStart: structuredClone(sources),
      sourceManifestEnd: structuredClone(sources),
      shotManifestSha256: hashStableEvidence(GLOBAL_GEOMETRY_EVIDENCE_SHOTS),
    },
    shots,
  };
  report.servedManifest = canonicalGlobalGeometryServedManifest(shots);
  const servedDiskManifest = globalGeometryServedDiskManifest(
    report.servedManifest, snapshotGlobalGeometryServedDiskUniverse(),
  );
  report.provenance.servedDiskManifestStart = structuredClone(servedDiskManifest);
  report.provenance.servedDiskManifestEnd = structuredClone(servedDiskManifest);
  return report;
}

test('global geometry evidence has one close shot for every repaired non-Initiation assembly', () => {
  assert.equal(GLOBAL_GEOMETRY_EVIDENCE_SHOTS.length, 13);
  assert.deepEqual(
    GLOBAL_GEOMETRY_EVIDENCE_SHOTS.map(({ id }) => id),
    [
      'silver-produce-crates',
      'silver-east-banquettes',
      'silver-dry-store-shelves',
      'cartel-dining-table',
      'cartel-office-chair',
      'mansion-living-couches',
      'no-wake-neighbor-cleats',
      'motel-dining-chairs',
      'motel-pool-loungers',
      'motel-shipment-crates',
      'beefrun-shelter-furniture',
      'enola-cockpit-seats',
      'bing-lou-chair',
    ],
  );
  assert.equal(new Set(GLOBAL_GEOMETRY_EVIDENCE_SHOTS.map(({ file }) => file)).size, 13);
  assert.equal(new Set(GLOBAL_GEOMETRY_EVIDENCE_SHOTS.map(({ scene }) => scene)).size, 8);
  assert.doesNotMatch(JSON.stringify(GLOBAL_GEOMETRY_EVIDENCE_SHOTS), /initiation/i);
  for (const shot of GLOBAL_GEOMETRY_EVIDENCE_SHOTS) {
    assert.ok(Object.keys(shot.metricRules).length >= 4, `${shot.id} has no useful ledger`);
    assert.ok(Object.keys(shot.composition.requiredVisibleGroups).length >= 2,
      `${shot.id} can pass without a visible assembly and support`);
    assert.ok(shot.composition.minTargetHits >= 10 && shot.composition.minTargetRatio >= 0.4,
      `${shot.id} still accepts a mostly occluded union AABB`);
    assert.ok(shot.composition.minOwners >= 1
      && shot.composition.minOwnerPartCoverage >= 0.5
      && shot.composition.minOwnerSilhouetteRatio >= 0.4,
    `${shot.id} has no connected per-owner readable-silhouette gate`);
    assert.ok(shot.composition.minVisibleBodyParts >= 1
      && shot.composition.minVisibleSupportParts >= 1,
    `${shot.id} does not require both owned body and support parts`);
  }
});

test('capture arguments require an explicit loopback port, fresh label, and support output override', () => {
  assert.deepEqual(
    parseGlobalGeometryEvidenceRun([
      '--base-url', 'http://127.0.0.1:54999',
      '--label=geometry-final-54999',
      '--out', 'docs/validation/global-geometry',
    ]),
    {
      baseUrl: 'http://127.0.0.1:54999',
      label: 'geometry-final-54999',
      out: 'docs/validation/global-geometry',
    },
  );
  assert.equal(parseGlobalGeometryEvidenceRun([
    '--base-url=http://localhost:55001/', '--label=fresh-55001',
  ], { GLOBAL_GEOMETRY_EVIDENCE_OUT: 'D:/evidence' }).out, 'D:/evidence');

  assert.throws(() => parseGlobalGeometryEvidenceRun(['--label=x']), /--base-url/);
  assert.throws(() => parseGlobalGeometryEvidenceRun([
    '--base-url=http://127.0.0.1', '--label=x',
  ]), /explicit port/);
  assert.throws(() => parseGlobalGeometryEvidenceRun([
    '--base-url=https://example.com:443', '--label=x',
  ]), /loopback/);
  assert.throws(() => parseGlobalGeometryEvidenceRun([
    '--base-url=http://127.0.0.1:54999', '--label=../stale',
  ]), /label/);
  assert.throws(() => parseGlobalGeometryEvidenceRun([
    '--base-url=http://127.0.0.1:54999', '--label=x', '--label=y',
  ]), /duplicate/);
  assert.throws(() => parseGlobalGeometryEvidenceRun([
    '--base-url=http://127.0.0.1:54999', '--label=x', '--headed',
  ]), /Unexpected/);
});

test('NO WAKE resolves its real camera and PostFX renderer through a tested read-only runtime surface', () => {
  const scene = { isScene: true, traverse() {} };
  const camera = { isCamera: true, isPerspectiveCamera: true };
  const renderer = { domElement: {} };
  const runtime = {
    scene,
    player: { camera },
    postfx: { renderer },
  };
  const resolved = resolveGlobalGeometryRuntimeSurface(runtime);
  assert.equal(resolved.scene, scene);
  assert.equal(resolved.camera, camera);
  assert.equal(resolved.renderer, renderer);
  assert.equal(resolved.three, null);
});

test('NO WAKE evidence binds the exact module URL declared by the real HTML', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.find(({ id }) => id === 'no-wake-neighbor-cleats');
  const declared = [...noWakeHtml.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)]
    .map((match) => match[1].replace(/^\.\//, ''));
  assert.deepEqual(declared, ['src/nowake/main.js']);
  assert.equal(spec.entryModule, declared[0]);
  const capture = validShot(spec);
  const wrongAlias = structuredClone(capture);
  wrongAlias.served.entries[1].url = 'http://127.0.0.1:54999/src/no-wake/main.js';
  wrongAlias.served.fingerprint = servedEvidenceFingerprint(wrongAlias.served.entries);
  assert.equal(evaluateGlobalGeometryShot(spec, wrongAlias).ok, false,
    'invented /src/no-wake/main.js alias passed for real /src/nowake/main.js');
});

test('every shot binds the exact entry module declared by its real HTML page', () => {
  for (const spec of GLOBAL_GEOMETRY_EVIDENCE_SHOTS) {
    const page = spec.page.split('?')[0];
    const html = sceneHtmlByPage.get(page);
    assert.ok(html, `${spec.id} has no real HTML fixture`);
    const declared = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)]
      .map((match) => match[1].replace(/^\.\//, ''));
    assert.equal(declared.length, 1, `${page} must declare one module entry`);
    assert.equal(spec.entryModule, declared[0],
      `${spec.id} does not bind the real ${page} module entry`);
  }
});

test('Motel exposes and resolves its real scene, camera, and renderer as read-only evidence fields', () => {
  assert.match(motelSource,
    /window\.MOTEL\s*=\s*\{[\s\S]*\bscene\s*,\s*camera\s*,\s*renderer\s*,/,
    'Motel has no legitimate real renderer surface for evidence capture');
  const scene = { isScene: true, traverse() {} };
  const camera = { isCamera: true, isPerspectiveCamera: true };
  const renderer = { domElement: {} };
  const resolved = resolveGlobalGeometryRuntimeSurface({ scene, camera, renderer });
  assert.deepEqual(resolved, { scene, camera, renderer, postfx: null, three: null });
  const sources = currentGlobalGeometryEvidenceSourceIdentities();
  assert.equal(sources.runtimeSurface.file, 'src/motel/main.js');
  assert.ok(sources.runtimeSurface.bytes > 0 && /^[a-f0-9]{64}$/.test(sources.runtimeSurface.sha256));
});

test('every postprocessed evidence scene exposes the public production render path', () => {
  assert.match(cartelMainSource,
    /window\.CARTEL_PALACE\s*=\s*\{[\s\S]*\brenderer\s*,\s*postfx\s*,/,
    'Cartel evidence would silently use raw WebGL instead of its production PostFX path');
  const postfx = { renderer: { domElement: {} }, render() {} };
  const scene = { isScene: true, traverse() {} };
  const camera = { isCamera: true, isPerspectiveCamera: true };
  assert.equal(resolveGlobalGeometryRuntimeSurface({ scene, camera, postfx }).postfx, postfx);
});

test('numeric ledger, readable projected pixels, and the unchanged screenshot window all hard-gate a shot', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[0];
  const capture = validShot(spec);
  assert.equal(evaluateGlobalGeometryCaptureState(spec, capture.before).ok, true);
  assert.equal(evaluateGlobalGeometryShot(spec, capture).ok, true);

  const missingMetric = structuredClone(capture);
  delete missingMetric.before.ledger[Object.keys(spec.metricRules)[0]];
  delete missingMetric.after.ledger[Object.keys(spec.metricRules)[0]];
  assert.equal(evaluateGlobalGeometryShot(spec, missingMetric).ok, false,
    'a missing real-build measurement was accepted');

  const inventedMetric = structuredClone(capture);
  inventedMetric.before.ledger['raw-audit-count'] = 999;
  inventedMetric.after.ledger['raw-audit-count'] = 999;
  assert.equal(evaluateGlobalGeometryShot(spec, inventedMetric).ok, false,
    'an uncontracted raw count was accepted as proof');

  const brokenSupport = structuredClone(capture);
  const toleranceKey = Object.entries(spec.metricRules)
    .find(([, rule]) => Number.isFinite(rule.lte))?.[0];
  brokenSupport.before.ledger[toleranceKey] = 0.5;
  brokenSupport.after.ledger[toleranceKey] = 0.5;
  assert.equal(evaluateGlobalGeometryShot(spec, brokenSupport).ok, false);

  const hiddenSupport = structuredClone(capture);
  const supportGroup = Object.keys(spec.composition.requiredVisibleGroups)[1];
  hiddenSupport.before.composition.visibility.visibleGroups[supportGroup] = 0;
  hiddenSupport.after.composition.visibility.visibleGroups[supportGroup] = 0;
  assert.equal(evaluateGlobalGeometryShot(spec, hiddenSupport).ok, false,
    'a screenshot with no visible support geometry was called readable');

  const tiny = structuredClone(capture);
  tiny.before.composition.ndc.maxX = tiny.before.composition.ndc.minX + 0.01;
  tiny.after.composition.ndc.maxX = tiny.after.composition.ndc.minX + 0.01;
  assert.equal(evaluateGlobalGeometryShot(spec, tiny).ok, false);

  const movedDuringScreenshot = structuredClone(capture);
  movedDuringScreenshot.after.composition.ndc.maxX -= 0.01;
  assert.equal(evaluateGlobalGeometryShot(spec, movedDuringScreenshot).ok, false,
    'a different after-frame was allowed to certify the screenshot');
});

test('fresh PNG identity and clean runtime errors are mandatory', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[4];
  const capture = validShot(spec);
  assert.equal(evaluateGlobalGeometryShot(spec, capture).ok, true);

  for (const mutate of [
    (copy) => { copy.fresh.screenshotAbsentBefore = false; },
    (copy) => { copy.screenshot.width = 1279; },
    (copy) => { copy.screenshot.bytes = 9999; },
    (copy) => { copy.screenshot.sha256 = 'not-a-hash'; },
    (copy) => { copy.runtime.pageErrors.push('boom'); },
    (copy) => { copy.runtime.consoleErrors.push('WebGL exploded'); },
    (copy) => { copy.runtime.httpErrors.push('500 main.js'); },
    (copy) => { copy.runtime.requestFailures.push('main.js reset'); },
  ]) {
    const broken = structuredClone(capture);
    mutate(broken);
    assert.equal(evaluateGlobalGeometryShot(spec, broken).ok, false);
  }
});

test('served document and script bytes are fingerprinted instead of trusting disk source', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[7];
  const capture = validShot(spec);
  assert.equal(evaluateGlobalGeometryShot(spec, capture).ok, true);

  const noScript = structuredClone(capture);
  noScript.served.entries = noScript.served.entries.filter(({ resourceType }) => resourceType !== 'script');
  noScript.served.fingerprint = servedEvidenceFingerprint(noScript.served.entries);
  assert.equal(evaluateGlobalGeometryShot(spec, noScript).ok, false);

  const staleFingerprint = structuredClone(capture);
  staleFingerprint.served.entries[1].sha256 = 'f'.repeat(64);
  assert.equal(evaluateGlobalGeometryShot(spec, staleFingerprint).ok, false);

  const wrongDocument = structuredClone(capture);
  wrongDocument.served.launchDocument = 'http://127.0.0.1:54999/mansion.html?preview=1';
  assert.equal(evaluateGlobalGeometryShot(spec, wrongDocument).ok, false);

  const repeatedIdentical = structuredClone(capture);
  repeatedIdentical.served.entries.push(structuredClone(repeatedIdentical.served.entries[1]));
  repeatedIdentical.served.fingerprint = servedEvidenceFingerprint(repeatedIdentical.served.entries);
  assert.equal(evaluateGlobalGeometryShot(spec, repeatedIdentical).ok, true,
    'an identical repeated response should be retained and remain attributable');

  const repeatedDrift = structuredClone(repeatedIdentical);
  repeatedDrift.served.entries.at(-1).sha256 = '9'.repeat(64);
  repeatedDrift.served.fingerprint = servedEvidenceFingerprint(repeatedDrift.served.entries);
  assert.equal(evaluateGlobalGeometryShot(spec, repeatedDrift).ok, false,
    'A then B bytes at the same URL/type were silently accepted');
});

test('a repeated served URL has one canonical byte identity across the whole report', () => {
  const report = validRun();
  const sameSilverMain = report.shots[1].served.entries.find(
    ({ url }) => url.endsWith('/src/silver/main.js'),
  );
  sameSilverMain.sha256 = 'd'.repeat(64);
  report.shots[1].served.fingerprint = servedEvidenceFingerprint(report.shots[1].served.entries);
  assert.equal(evaluateGlobalGeometryEvidenceRun(report).ok, false,
    'the same served URL drifted between shots without invalidating the report');
});

test('the report stores the exact canonical served URL manifest', () => {
  const report = validRun();
  assert.deepEqual(report.servedManifest, canonicalGlobalGeometryServedManifest(report.shots));
  const missing = structuredClone(report);
  delete missing.servedManifest;
  assert.equal(evaluateGlobalGeometryEvidenceRun(missing).ok, false,
    'report passed without a reviewable canonical served manifest');
});

test('source provenance has identical start/end bytes for every required page, module, and builder', () => {
  const expectedFiles = [
    'silver.html', 'cartel-palace.html', 'mansion.html', 'nowake.html',
    'motel.html', 'beefrun.html', 'enolasquatch.html', 'bing.html',
    'src/silver/main.js', 'src/cartel-palace/main.js', 'src/mansion/main.js',
    'src/nowake/main.js', 'src/motel/main.js', 'src/beefrun/main.js',
    'src/enolasquatch/main.js', 'src/bing/router.js', 'src/bing/main.js',
    'src/silver/room.js', 'src/cartel-palace/world.js',
    'src/mansion/scenes/MansionInterior.js', 'src/nowake/world.js',
    'src/motel/level.js', 'src/beefrun/airstrip.js',
    'src/enolasquatch/scenes/EnolaSquatch.js', 'src/bing/club.js',
  ].sort();
  const sources = currentGlobalGeometryEvidenceSourceIdentities();
  assert.equal(sources.screenshotContract.file, 'tools/screenshot-artifact-contract.mjs');
  assert.equal(sources.directoryTransaction.file, 'tools/evidence-directory-transaction.mjs');
  assert.equal(sources.bootstrapRunner.file, 'tools/run-global-geometry-evidence.mjs');
  assert.deepEqual(sources.requiredSources.map(({ file }) => file).sort(), expectedFiles);
  const report = validRun();
  assert.deepEqual(report.provenance.sourceManifestStart, sources);
  assert.deepEqual(report.provenance.sourceManifestEnd, sources);
  const driftedEnd = structuredClone(report);
  driftedEnd.provenance.sourceManifestEnd.requiredSources[0].sha256 = '0'.repeat(64);
  assert.equal(evaluateGlobalGeometryEvidenceRun(driftedEnd).ok, false,
    'end-of-run page/module/builder drift was accepted');
});

test('every canonical served document and script is byte-bound to start current and end disk', () => {
  const report = validRun();
  assert.equal(evaluateGlobalGeometryEvidenceRun(report).ok, true);
  assert.ok(report.provenance.servedDiskManifestStart.length > 8,
    'canonical served disk proof collapsed repeated modules instead of retaining all paths');
  const drifted = structuredClone(report);
  drifted.provenance.servedDiskManifestEnd[0].sha256 = '0'.repeat(64);
  assert.equal(evaluateGlobalGeometryEvidenceRun(drifted).ok, false,
    'end-of-run served source disk drift was accepted');
  const staleServed = structuredClone(report);
  staleServed.servedManifest[0].sha256 = '1'.repeat(64);
  assert.equal(evaluateGlobalGeometryEvidenceRun(staleServed).ok, false,
    'served response bytes were not bound back to current disk bytes');
});

test('a full run binds all thirteen fresh captures to this tool, contract, and manifest', () => {
  const report = validRun();
  assert.equal(evaluateGlobalGeometryEvidenceRun(report).ok, true);

  const missingShot = structuredClone(report);
  missingShot.shots.pop();
  assert.equal(evaluateGlobalGeometryEvidenceRun(missingShot).ok, false);

  const staleDirectory = structuredClone(report);
  staleDirectory.fresh.runDirectoryExistedBefore = true;
  assert.equal(evaluateGlobalGeometryEvidenceRun(staleDirectory).ok, false);

  const driftedManifest = structuredClone(report);
  driftedManifest.provenance.shotManifestSha256 = '0'.repeat(64);
  assert.equal(evaluateGlobalGeometryEvidenceRun(driftedManifest).ok, false);

  const wrongGrantedPort = structuredClone(report);
  wrongGrantedPort.shots[0].baseUrl = 'http://127.0.0.1:55000';
  wrongGrantedPort.shots[0].served = validServed(
    GLOBAL_GEOMETRY_EVIDENCE_SHOTS[0], 'http://127.0.0.1:55000',
  );
  assert.equal(evaluateGlobalGeometryEvidenceRun(wrongGrantedPort).ok, false,
    'one shot escaped the exact granted loopback origin and port');

  const fakeSourceIdentity = structuredClone(report);
  fakeSourceIdentity.provenance.tool.bytes += 1;
  fakeSourceIdentity.provenance.tool.sha256 = 'f'.repeat(64);
  assert.equal(evaluateGlobalGeometryEvidenceRun(fakeSourceIdentity).ok, false,
    'shape-valid invented tool provenance was accepted');

  const fakeRuntimeSurface = structuredClone(report);
  fakeRuntimeSurface.provenance.runtimeSurface.sha256 = 'e'.repeat(64);
  assert.equal(evaluateGlobalGeometryEvidenceRun(fakeRuntimeSurface).ok, false,
    'shape-valid invented Motel runtime-surface provenance was accepted');

  const snapshot = currentGlobalGeometryEvidenceSourceIdentities();
  assert.doesNotThrow(() => assertGlobalGeometryEvidenceSourcesUnchanged(snapshot));
  const mutatedSnapshot = structuredClone(snapshot);
  mutatedSnapshot.contract.sha256 = '0'.repeat(64);
  assert.throws(() => assertGlobalGeometryEvidenceSourcesUnchanged(mutatedSnapshot), /changed/i);
});

test('camera proof is mandatory, screenshot-bound, and rejects collider or solid penetration', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[5];
  const capture = validShot(spec);
  assert.equal(evaluateGlobalGeometryShot(spec, capture).ok, true);

  const missing = structuredClone(capture);
  delete missing.camera;
  assert.equal(evaluateGlobalGeometryShot(spec, missing).ok, false);

  const inCollider = structuredClone(capture);
  inCollider.camera.legality.colliderClear = false;
  inCollider.camera.legality.colliderBlockers = ['living couch collider'];
  assert.equal(evaluateGlobalGeometryShot(spec, inCollider).ok, false);

  const inSolid = structuredClone(capture);
  inSolid.camera.legality.insideSolidClear = false;
  inSolid.camera.legality.solidBlockers = ['living wall'];
  assert.equal(evaluateGlobalGeometryShot(spec, inSolid).ok, false);

  const differentCameraFrame = structuredClone(capture);
  differentCameraFrame.camera.proof.ndc.maxX -= 0.02;
  assert.equal(evaluateGlobalGeometryShot(spec, differentCameraFrame).ok, false,
    'an optional setup camera was allowed to certify different screenshot pixels');

  const inventedColliderPolicy = structuredClone(capture);
  inventedColliderPolicy.camera.legality.source = 'generic-substitute-box';
  inventedColliderPolicy.camera.legality.coverage = 'everything';
  assert.equal(evaluateGlobalGeometryShot(spec, inventedColliderPolicy).ok, false,
    'an invented collider/inside-solid policy was accepted as real camera legality');

  const becameBlockedAtScreenshot = structuredClone(capture);
  for (const state of [becameBlockedAtScreenshot.before, becameBlockedAtScreenshot.after]) {
    state.cameraClearance.colliderClear = false;
    state.cameraClearance.colliderBlockers = ['living-wall'];
    state.cameraClearance.minClearanceM = 0;
  }
  assert.equal(evaluateGlobalGeometryShot(spec, becameBlockedAtScreenshot).ok, false,
    'setup-only camera legality was allowed to certify a blocked screenshot window');
});

test('evidence uses a dedicated camera instead of trusting the live RAF camera', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[0];
  const capture = validShot(spec);
  assert.equal(evaluateGlobalGeometryShot(spec, capture).ok, true);
  const reusedLiveCamera = structuredClone(capture);
  const sameUuid = reusedLiveCamera.camera.binding.liveCameraUuid;
  for (const binding of [
    reusedLiveCamera.camera.binding,
    reusedLiveCamera.before.cameraBinding,
    reusedLiveCamera.pngBinding,
    reusedLiveCamera.after.cameraBinding,
  ]) binding.evidenceCameraUuid = sameUuid;
  assert.equal(evaluateGlobalGeometryShot(spec, reusedLiveCamera).ok, false,
    'the mutable live RAF camera was accepted as the evidence camera');
});

test('the dedicated camera pose is rebound identically around before, PNG, and after', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[0];
  const capture = validShot(spec);
  const rafDriftAtPng = structuredClone(capture);
  rafDriftAtPng.pngBinding.matrixWorld[12] += 0.5;
  rafDriftAtPng.pngBinding.worldPosition[0] += 0.5;
  assert.equal(evaluateGlobalGeometryShot(spec, rafDriftAtPng).ok, false,
    'a live-RAF camera overwrite between before proof and PNG was accepted');
});

test('camera legality is measured at the dedicated camera matrixWorld pose', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[0];
  const capture = validShot(spec);
  const legalityAtInventedPoint = structuredClone(capture);
  legalityAtInventedPoint.camera.legality.testedPosition = [9, 2, 3];
  legalityAtInventedPoint.before.cameraClearance.testedPosition = [9, 2, 3];
  legalityAtInventedPoint.after.cameraClearance.testedPosition = [9, 2, 3];
  assert.equal(evaluateGlobalGeometryShot(spec, legalityAtInventedPoint).ok, false,
    'legality measured away from the rendered matrixWorld camera pose was accepted');
});

test('visibility proves connected owned parts rather than a sparse union rectangle', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[10];
  const capture = validShot(spec);
  assert.equal(evaluateGlobalGeometryShot(spec, capture).ok, true);

  const disconnected = structuredClone(capture);
  disconnected.before.composition.owners[0].connected = false;
  disconnected.after.composition.owners[0].connected = false;
  disconnected.camera.proof.owners[0].connected = false;
  assert.equal(evaluateGlobalGeometryShot(spec, disconnected).ok, false);

  const hiddenParts = structuredClone(capture);
  for (const state of [hiddenParts.before.composition, hiddenParts.after.composition,
    hiddenParts.camera.proof]) {
    state.owners[0].visibleSupportParts = 0;
    state.owners[0].partCoverage = 0.25;
    state.owners[0].silhouette.targetHits = 2;
    state.owners[0].silhouette.hitRatio = 2 / 25;
  }
  assert.equal(evaluateGlobalGeometryShot(spec, hiddenParts).ok, false,
    'a mostly occluded assembly with hidden support parts passed');

  const inventedOwner = structuredClone(capture);
  for (const state of [inventedOwner.before.composition, inventedOwner.after.composition,
    inventedOwner.camera.proof]) {
    state.owners.push({ ...structuredClone(state.owners[0]), id: 'invented-extra-owner' });
  }
  assert.equal(evaluateGlobalGeometryShot(spec, inventedOwner).ok, false,
    'an extra substitute visual owner was accepted');
});

test('ledger policies require exact real support owners and per-owner leg distributions', () => {
  const specs = Object.fromEntries(GLOBAL_GEOMETRY_EVIDENCE_SHOTS.map((item) => [item.id, item]));
  const eq = (id, key) => specs[id].metricRules[key]?.eq;
  assert.equal(eq('silver-produce-crates', 'crates.floorSupportLinks'), 6);
  assert.equal(eq('silver-produce-crates', 'crates.lowerCrateSupportLinks'), 0);
  assert.equal(eq('silver-produce-crates', 'crates.selfSupportLinks'), 0);
  assert.equal(eq('motel-shipment-crates', 'crates.floorSupportLinks'), 2);
  assert.equal(eq('motel-shipment-crates', 'crates.lowerCrateSupportLinks'), 3);
  assert.equal(eq('motel-shipment-crates', 'crates.selfSupportLinks'), 0);
  assert.equal(eq('cartel-office-chair', 'chair.namedLegs'), 4);
  assert.equal(eq('motel-dining-chairs', 'chairs.owner0Feet'), 4);
  assert.equal(eq('motel-dining-chairs', 'chairs.owner1Feet'), 4);
  assert.equal(eq('motel-pool-loungers', 'loungers.owner0Feet'), 4);
  assert.equal(eq('motel-pool-loungers', 'loungers.owner1Feet'), 4);
  assert.equal(eq('enola-cockpit-seats', 'seats.pilotLegs'), 4);
  assert.equal(eq('enola-cockpit-seats', 'seats.copilotLegs'), 4);
  assert.equal(eq('enola-cockpit-seats', 'seats.navigatorLegs'), 4);

  for (const id of [
    'silver-produce-crates', 'cartel-office-chair', 'no-wake-neighbor-cleats',
    'motel-dining-chairs', 'motel-pool-loungers', 'motel-shipment-crates',
    'enola-cockpit-seats',
  ]) {
    const spec = specs[id];
    assert.ok(spec.ownership?.ownerIds.length > 0 && spec.ownership?.dependentIds.length > 0,
      `${id} has no exact owner/dependent identity contract`);
    const valid = validShot(spec);
    assert.equal(evaluateGlobalGeometryShot(spec, valid).ok, true);
    const wrongOwner = structuredClone(valid);
    wrongOwner.before.ownership.edges[0].owner = 'not-the-real-owner';
    wrongOwner.after.ownership.edges[0].owner = 'not-the-real-owner';
    assert.equal(evaluateGlobalGeometryShot(spec, wrongOwner).ok, false,
      `${id} accepted the wrong exact supporter`);
    const unowned = structuredClone(valid);
    unowned.before.ownership.unowned = 1;
    unowned.after.ownership.unowned = 1;
    assert.equal(evaluateGlobalGeometryShot(spec, unowned).ok, false,
      `${id} accepted an unowned dependent`);
  }

  assert.match(captureSource, /runtime\.ROOMS\?\.prep[\s\S]*prepFloor/,
    'Silver crates still accept any horizontal scene plane');
  assert.match(captureSource, /runtime\.level\?\.rects\?\.ROOM11[\s\S]*roomElevenFloor/,
    'Motel crates still accept any horizontal scene plane');
  assert.match(captureSource, /runtime\.level\?\.rects\?\.ROOM12[\s\S]*roomTwelveFloor/,
    'Motel chairs still accept any horizontal scene plane');
  assert.match(captureSource, /body:\s*\[cleat\][\s\S]*support:\s*\[deck\]/,
    'NO WAKE visual ownership does not identify cleat as body and deck as support');
});

test('Silver banquette evidence owns every authored floor-plinth-seat-back load path', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.find(
    ({ id }) => id === 'silver-east-banquettes',
  );
  const zs = [-3, 2.2, 7.4, 12.6, 17.8];
  const floor = 'dining-floor:[-30,10]x[-8,26]@0';
  assert.deepEqual(spec.ownership?.ownerIds, [
    floor,
    ...zs.map((z) => `silver-east-banquette@${z}.plinth`),
    ...zs.map((z) => `silver-east-banquette@${z}.base`),
  ]);
  assert.deepEqual(spec.ownership?.edges, zs.flatMap((z) => [
    { dependent: `silver-east-banquette@${z}.plinth`, owner: floor },
    {
      dependent: `silver-east-banquette@${z}.base`,
      owner: `silver-east-banquette@${z}.plinth`,
    },
    {
      dependent: `silver-east-banquette@${z}.back`,
      owner: `silver-east-banquette@${z}.base`,
    },
  ]));
  assert.equal(spec.composition.minOwners, 5);
  assert.match(captureSource,
    /runtime\.ROOMS\?\.floor[\s\S]*diningFloor[\s\S]*silver-east-banquette@/,
    'banquettes still accept an anonymous same-height plane or omit per-owner paths');
});

test('Silver shelf evidence owns all three rack floor and board-upright paths', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.find(
    ({ id }) => id === 'silver-dry-store-shelves',
  );
  const rackZs = [-13, -11, -8];
  const floor = 'dry-store-floor:[15,21]x[-14,-6]@-2.9';
  const uprights = rackZs.flatMap((z) => (
    Array.from({ length: 4 }, (_, upright) => `silver-dry-store-shelving@${z}.upright${upright}`)
  ));
  assert.deepEqual(spec.ownership?.ownerIds, [floor, ...uprights]);
  assert.equal(spec.ownership?.edges.length, 72);
  assert.deepEqual(spec.ownership?.distribution, {
    [floor]: 12,
    ...Object.fromEntries(uprights.map((upright) => [upright, 5])),
  });
  assert.equal(spec.composition.minOwners, 3);
  assert.match(captureSource,
    /runtime\.ROOMS\?\.drystore[\s\S]*dryStoreFloor[\s\S]*board-upright-joint/,
    'shelves still accept any cellar-height plane or aggregate away rack ownership');
});

test('Cartel table evidence owns the exact runner, candle, and eight-setting stack', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.find(
    ({ id }) => id === 'cartel-dining-table',
  );
  assert.deepEqual(spec.ownership?.ownerIds, [
    'mark-dining-table.top',
    'dining-table-runner',
    ...Array.from({ length: 8 }, (_, setting) => (
      `dining-place-setting.${setting}.plate`
    )),
  ]);
  assert.equal(spec.ownership?.edges.length, 40);
  assert.deepEqual(spec.ownership?.distribution, {
    'mark-dining-table.top': 25,
    'dining-table-runner': 7,
    ...Object.fromEntries(Array.from({ length: 8 }, (_, setting) => [
      `dining-place-setting.${setting}.plate`, 1,
    ])),
  });
  assert.equal(spec.composition.minOwners, 9,
    'Cartel table pixels do not independently prove the runner and all eight settings');
  assert.match(captureSource,
    /dining-place-setting\.\$\{settingIndex\}[\s\S]*place-setting-stack/,
    'Cartel settings are still pooled instead of bound to their authored setting owner');
});

test('Mansion couch evidence owns all three complete couch load paths on living floor', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.find(
    ({ id }) => id === 'mansion-living-couches',
  );
  const couchIds = [
    'mansion-living-couch@-15.1,47.8',
    'mansion-living-couch@-12.5,45.3',
    'mansion-living-couch@-9.9,47.8',
  ];
  const floor = 'living-floor:[-16,-9.15]x[36,57.85]@1.22';
  const feet = couchIds.flatMap((couch) => (
    Array.from({ length: 4 }, (_, foot) => `${couch}.foot${foot}`)
  ));
  assert.deepEqual(spec.ownership?.ownerIds, [
    floor, ...feet, ...couchIds.map((couch) => `${couch}.base`),
  ]);
  assert.equal(spec.ownership?.edges.length, 39);
  assert.equal(spec.ownership?.distribution[floor], 12);
  assert.ok(feet.every((foot) => spec.ownership.distribution[foot] === 1));
  assert.ok(couchIds.every((couch) => spec.ownership.distribution[`${couch}.base`] === 5));
  assert.equal(spec.composition.minOwners, 3);
  assert.match(captureSource,
    /livingFloor[\s\S]*mansion-living-couch@[\s\S]*couch-body-part/,
    'Mansion proof still selects one centroid couch or omits unnamed body parts');
});

test('Beefrun shelter evidence owns each sloped-terrain foot and its top joint', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.find(
    ({ id }) => id === 'beefrun-shelter-furniture',
  );
  const terrain = 'airstrip.groundAt:terrainHeight';
  const legs = [
    ...Array.from({ length: 2 }, (_, leg) => `shelter-bench.leg${leg}`),
    ...Array.from({ length: 4 }, (_, leg) => `shelter-table.leg${leg}`),
  ];
  assert.deepEqual(spec.ownership?.ownerIds, [terrain, ...legs]);
  assert.equal(spec.ownership?.edges.length, 12);
  assert.deepEqual(spec.ownership?.distribution, {
    [terrain]: 6,
    ...Object.fromEntries(legs.map((leg) => [leg, 1])),
  });
  assert.match(captureSource, /airstrip\?\.groundAt/,
    'shelter proof does not measure each real transformed terrain foot');
  assert.match(captureSource,
    /airstrip\.groundAt:terrainHeight[\s\S]*surface-leg-joint/,
    'shelter proof does not bind each terrain owner and top join');
});

test('Bing Lou chair evidence owns the exact carpet-to-seat swivel load path', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.find(({ id }) => id === 'bing-lou-chair');
  const carpet = 'bing-office-carpet:[7.9,13.9]x[-9.5,-4.5]@0.004';
  const feet = Array.from({ length: 5 }, (_, foot) => `lou-chair.foot${foot}`);
  const arms = Array.from({ length: 5 }, (_, arm) => `lou-chair.arm${arm}`);
  assert.deepEqual(spec.ownership?.ownerIds, [
    carpet, ...feet, ...arms, 'lou-chair.hub', 'lou-chair.column', 'lou-chair.seat',
  ]);
  assert.equal(spec.ownership?.edges.length, 18);
  assert.deepEqual(spec.ownership?.distribution, {
    [carpet]: 5,
    ...Object.fromEntries(feet.map((foot) => [foot, 1])),
    ...Object.fromEntries(arms.map((arm) => [arm, 1])),
    'lou-chair.hub': 1,
    'lou-chair.column': 1,
    'lou-chair.seat': 1,
  });
  assert.match(captureSource,
    /bing-office-carpet:[\s\S]*hub-arm[\s\S]*lou-chair\.column[\s\S]*lou-chair\.seat/,
    'Bing proof does not own the real carpet-to-seat load path');
});

test('Motel camera legality covers every enabled solid including bed table and bounds', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.find(({ id }) => id === 'motel-dining-chairs');
  const missingCoverage = validShot(spec);
  for (const legality of [
    missingCoverage.camera.legality,
    missingCoverage.before.cameraClearance,
    missingCoverage.after.cameraClearance,
  ]) legality.blockerCount = 0;
  assert.equal(evaluateGlobalGeometryShot(spec, missingCoverage).ok, false,
    'zero Motel solid coverage was accepted');
  assert.doesNotMatch(captureSource,
    /\['bed', 'table', 'bounds'\]\.includes\(collider\?\.tag\)/,
    'Motel evidence still omits enabled bed, table, and bounds solids');
  assert.match(captureSource,
    /colliderCoverage[\s\S]*bed[\s\S]*table[\s\S]*bounds/,
    'Motel evidence has no reviewable enabled-solid coverage counts');
});

test('evidence camera hides only known viewmodels and preserves camera-attached lights', () => {
  assert.doesNotMatch(captureSource,
    /for \(const child of camera\.children\) child\.visible = false/,
    'blanket camera-child hiding still removes legitimate scene lighting');
  assert.match(captureSource,
    /function isKnownEvidenceViewmodel[\s\S]*child\.isLight[\s\S]*preservedCameraLights/,
    'camera-child policy does not distinguish known viewmodels from camera lights');
});

test('exact decoded PNG pixels and per-owner ID-mask contrast hard-gate every shot', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[0];
  const capture = validShot(spec);
  assert.equal(evaluateGlobalGeometryShot(spec, capture).ok, true);
  for (const mutate of [
    (copy) => { delete copy.screenshot.pixelProof; },
    (copy) => { copy.screenshot.decoded.rgbaSha256 = '0'.repeat(64); },
    (copy) => { copy.screenshot.pixelProof.owners[0].visiblePixels = 1; },
    (copy) => { copy.screenshot.pixelProof.owners[0].contrast = 0; },
    (copy) => { copy.screenshot.pixelProof.maskBinding.matrixWorld[12] += 1; },
    (copy) => { copy.screenshot.sha256 = '1'.repeat(64); },
    (copy) => { copy.screenshot.ownerMask.sha256 = '2'.repeat(64); },
  ]) {
    const broken = structuredClone(capture);
    mutate(broken);
    assert.equal(evaluateGlobalGeometryShot(spec, broken).ok, false,
      'decoded pixel/owner-mask mutation was accepted');
  }
  assert.match(captureSource, /inflateSync[\s\S]*rgbaSha256[\s\S]*ownerMask/,
    'capture tool does not decode and bind exact screenshot/mask pixels');

  const inventedOwner = validShot(spec);
  for (const state of [inventedOwner.before.composition, inventedOwner.after.composition,
    inventedOwner.camera.proof]) state.owners[0].id = 'invented-owner';
  inventedOwner.screenshot.pixelProof.owners[0].id = 'invented-owner';
  const proof = inventedOwner.screenshot.pixelProof;
  proof.proofSha256 = hashStableEvidence({
    imagePngBytes: proof.imagePngBytes,
    imagePngSha256: proof.imagePngSha256,
    maskPngBytes: proof.maskPngBytes,
    maskPngSha256: proof.maskPngSha256,
    imageRgbaSha256: proof.imageRgbaSha256,
    maskRgbaSha256: proof.maskRgbaSha256,
    classifiedPixels: proof.classifiedPixels,
    unclassifiedColoredPixels: proof.unclassifiedColoredPixels,
    owners: proof.owners,
  });
  assert.equal(evaluateGlobalGeometryShot(spec, inventedOwner).ok, false,
    'a self-consistent invented owner ID mask was accepted');
});

test('served disk provenance includes transitive shared modules and rejects missing or drifted disk bytes', () => {
  const universe = snapshotGlobalGeometryServedDiskUniverse();
  const shared = universe.find(({ file }) => file === 'src/world/build.js');
  assert.ok(shared, 'transitive shared geometry helper was not snapshotted');
  const served = [{
    url: 'http://127.0.0.1:54999/src/world/build.js',
    resourceType: 'script',
    status: 200,
    bytes: shared.bytes,
    sha256: shared.sha256,
    observations: 1,
  }];
  assert.deepEqual(globalGeometryServedDiskManifest(served, universe), [{
    url: served[0].url,
    resourceType: 'script',
    file: shared.file,
    bytes: shared.bytes,
    sha256: shared.sha256,
  }]);
  assert.throws(() => globalGeometryServedDiskManifest(served, []), /outside.*universe/);
  const drifted = structuredClone(served);
  drifted[0].sha256 = '0'.repeat(64);
  assert.throws(() => globalGeometryServedDiskManifest(drifted, universe), /do not match disk/);
});

test('served disk provenance snapshots render-affecting binary assets, not only source modules', () => {
  const universe = snapshotGlobalGeometryServedDiskUniverse();
  const artwork = universe.find(({ file }) => file === 'assets/art/logo-crest.png');
  assert.ok(artwork, 'a production cockpit texture is outside the immutable disk universe');
  assert.ok(artwork.bytes > 1000);
  assert.match(artwork.sha256, /^[a-f0-9]{64}$/);

  const served = [{
    url: 'http://127.0.0.1:54999/assets/art/logo-crest.png',
    resourceType: 'image',
    status: 200,
    bytes: artwork.bytes,
    sha256: artwork.sha256,
    observations: 1,
  }];
  assert.deepEqual(globalGeometryServedDiskManifest(served, universe), [{
    url: served[0].url,
    resourceType: 'image',
    file: artwork.file,
    bytes: artwork.bytes,
    sha256: artwork.sha256,
  }]);
});

test('immutable source snapshot retains the exact capture-start bytes for every served file', () => {
  const snapshot = snapshotGlobalGeometryServedSourceBytes();
  assert.equal(snapshot.identities.length, snapshot.immutableSourceBytes.size);
  assert.ok(snapshot.immutableSourceBytes.has('silver.html'));
  assert.ok(snapshot.immutableSourceBytes.has('assets/art/manifest.json'));
  for (const identity of snapshot.identities) {
    const bytes = snapshot.immutableSourceBytes.get(identity.file);
    assert.ok(Buffer.isBuffer(bytes));
    assert.equal(bytes.length, identity.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), identity.sha256);
  }
});

test('immutable server refuses resources outside the capture-start byte map', async (t) => {
  const immutableSourceBytes = new Map([['scene.html', Buffer.from('frozen-A')]]);
  const server = createGlobalGeometryImmutableServer({
    baseUrl: 'http://127.0.0.1:55000', immutableSourceBytes,
  });
  assert.equal(typeof server.listeners, 'function');
  assert.throws(() => createGlobalGeometryImmutableServer({
    baseUrl: 'http://127.0.0.1:55000', immutableSourceBytes: new Map(),
  }), /capture-start source bytes/);
  t.after(() => server.close());
});

test('immutable bootstrap materializes the exact closure below workspace temp', () => {
  const workspaceRoot = path.resolve(decodeURIComponent(
    new URL('..', import.meta.url).pathname,
  ).replace(/^\/(.:\/)/, '$1'));
  const destination = path.join(workspaceRoot, '.tmp', `global-bootstrap-test-${process.pid}`);
  fs.rmSync(destination, { recursive: true, force: true });
  try {
    const bootstrap = materializeGlobalGeometryImmutableBootstrap(workspaceRoot, destination, {
      planSnapshot: (root) => ({
        snapshot: snapshotGlobalGeometryServedSourceBytes(root),
        identity: currentGlobalGeometryEvidenceSourceIdentities(),
      }),
    });
    assert.ok(bootstrap.worker.startsWith(destination + path.sep));
    assert.match(bootstrap.manifest.sourceSnapshotSha256, /^[a-f0-9]{64}$/);
    assert.ok(bootstrap.manifest.materializedFiles > 20);
    assert.equal(fs.existsSync(path.join(destination, 'silver.html')), true);
    assert.equal(fs.existsSync(path.join(destination, 'assets', 'art', 'manifest.json')), true);
  } finally {
    fs.rmSync(destination, { recursive: true, force: true });
  }
});

test('immutable runner anchors env-relative output to source root and gives CLI output precedence', () => {
  const sourceRoot = path.resolve(decodeURIComponent(
    new URL('..', import.meta.url).pathname,
  ).replace(/^\/(.:\/)/, '$1'));
  const bootstrapRoot = path.join(sourceRoot, '.tmp', 'injected-global-bootstrap');
  const invocations = [];
  const dependencies = {
    makeBootstrapDirectory: () => bootstrapRoot,
    materializeBootstrap: () => ({
      root: bootstrapRoot,
      worker: path.join(bootstrapRoot, 'tools', 'capture-global-geometry-evidence.mjs'),
      manifest: { sourceSnapshotSha256: 'a'.repeat(64) },
    }),
    spawnWorker: (...input) => { invocations.push(input); return { status: 0 }; },
    removeBootstrap: () => {},
  };
  const baseArgs = ['--base-url=http://127.0.0.1:55000', '--label=relative-output'];
  assert.equal(runGlobalGeometryImmutableBootstrap(baseArgs, {
    GLOBAL_GEOMETRY_EVIDENCE_OUT: 'docs/validation/env-relative',
  }, dependencies), 0);
  assert.equal(invocations[0][2].env.GLOBAL_GEOMETRY_EVIDENCE_OUT,
    path.join(sourceRoot, 'docs', 'validation', 'env-relative'));

  assert.equal(runGlobalGeometryImmutableBootstrap([
    ...baseArgs, '--out=docs/validation/cli-relative',
  ], {
    GLOBAL_GEOMETRY_EVIDENCE_OUT: 'docs/validation/env-loses',
  }, dependencies), 0);
  assert.ok(invocations[1][1].includes(
    `--out=${path.join(sourceRoot, 'docs', 'validation', 'cli-relative')}`,
  ));
  assert.equal(invocations[1][2].env.GLOBAL_GEOMETRY_EVIDENCE_OUT,
    path.join(sourceRoot, 'docs', 'validation', 'cli-relative'));
});

test('immutable runner rejects raw output traversal before materialization or worker spawn', () => {
  let materialized = false;
  let spawned = false;
  const traversal = `docs${path.sep}validation${path.sep}nested${path.sep}..${path.sep}evidence`;
  assert.throws(() => runGlobalGeometryImmutableBootstrap([
    '--base-url=http://127.0.0.1:55000', '--label=raw-traversal', `--out=${traversal}`,
  ], {}, {
    makeBootstrapDirectory: () => path.resolve('.tmp', 'must-not-materialize'),
    materializeBootstrap: () => { materialized = true; throw new Error('materialized'); },
    spawnWorker: () => { spawned = true; return { status: 0 }; },
    removeBootstrap: () => {},
  }), /unsafe.*output root.*traversal/i);
  assert.equal(materialized, false);
  assert.equal(spawned, false);
});

test('immutable runner rejects a broad filesystem root before materialization or worker spawn', () => {
  let materialized = false;
  let spawned = false;
  const filesystemRoot = path.parse(path.resolve('.')).root;
  assert.throws(() => runGlobalGeometryImmutableBootstrap([
    '--base-url=http://127.0.0.1:55000', '--label=broad-root', `--out=${filesystemRoot}`,
  ], {}, {
    makeBootstrapDirectory: () => path.resolve('.tmp', 'must-not-materialize'),
    materializeBootstrap: () => { materialized = true; throw new Error('materialized'); },
    spawnWorker: () => { spawned = true; return { status: 0 }; },
    removeBootstrap: () => {},
  }), /unsafe.*(?:broad|filesystem).*root/i);
  assert.equal(materialized, false);
  assert.equal(spawned, false);
});

test('served provenance waits for late in-scope assets and binds every completed response', async () => {
  const page = new EventEmitter();
  page.waitForTimeout = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const runtime = { requestFailures: [] };
  const finish = servedResponseTracker(
    page, 'http://127.0.0.1:54999', runtime, { quietMs: 20, timeoutMs: 1000 },
  );
  let resolveBody;
  const request = {
    url: () => 'http://127.0.0.1:54999/assets/art/logo-crest.png',
    resourceType: () => 'image',
  };
  const response = {
    request: () => request,
    url: request.url,
    status: () => 200,
    body: () => new Promise((resolve) => { resolveBody = resolve; }),
  };
  const proofPromise = finish('http://127.0.0.1:54999/beefrun.html');
  setTimeout(() => {
    page.emit('request', request);
    page.emit('response', response);
    setTimeout(() => {
      resolveBody(Buffer.from('immutable texture bytes'));
      page.emit('requestfinished', request);
    }, 10);
  }, 5);

  const proof = await proofPromise;
  assert.deepEqual(proof.entries, [{
    url: request.url(),
    status: 200,
    resourceType: 'image',
    bytes: Buffer.byteLength('immutable texture bytes'),
    sha256: createHash('sha256').update('immutable texture bytes').digest('hex'),
  }]);
  assert.deepEqual(runtime.requestFailures, []);
});

test('a shot accepts and fingerprints its same-origin render assets alongside document and scripts', () => {
  const spec = GLOBAL_GEOMETRY_EVIDENCE_SHOTS[0];
  const capture = validShot(spec);
  capture.served.entries.push({
    url: 'http://127.0.0.1:54999/assets/art/logo-crest.png',
    resourceType: 'image',
    status: 200,
    bytes: 330885,
    sha256: '9'.repeat(64),
  });
  capture.served.fingerprint = servedEvidenceFingerprint(capture.served.entries);
  assert.equal(evaluateGlobalGeometryShot(spec, capture).ok, true,
    'a real render-affecting asset makes an otherwise valid shot fail provenance');
});

test('PNG decoder measures the exact image bytes selected by the owner ID mask', () => {
  const imagePixels = Buffer.from([
    210, 20, 20, 255, 210, 20, 20, 255, 20, 20, 210, 255, 20, 20, 210, 255,
    210, 20, 20, 255, 210, 20, 20, 255, 20, 20, 210, 255, 20, 20, 210, 255,
  ]);
  const maskPixels = Buffer.from([
    255, 59, 48, 255, 255, 59, 48, 255, 52, 199, 89, 255, 52, 199, 89, 255,
    255, 59, 48, 255, 255, 59, 48, 255, 52, 199, 89, 255, 52, 199, 89, 255,
  ]);
  const image = rgbaPng(4, 2, imagePixels);
  const mask = rgbaPng(4, 2, maskPixels);
  const decoded = decodeGlobalGeometryPng(image);
  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 2);
  assert.deepEqual(decoded.rgba, imagePixels);
  const proof = measureGlobalGeometryPixelProof(image, mask, [
    { id: 'left', color: '#ff3b30' },
    { id: 'right', color: '#34c759' },
  ]);
  assert.deepEqual(proof.owners.map(({ id, visiblePixels }) => ({ id, visiblePixels })), [
    { id: 'left', visiblePixels: 4 },
    { id: 'right', visiblePixels: 4 },
  ]);
  assert.equal(proof.classifiedPixels, 8);
  assert.equal(proof.unclassifiedColoredPixels, 0);
  assert.ok(proof.owners.every(({ contrast }) => contrast > 0.4));
  const identity = globalGeometryCapture.bindGlobalGeometryPngArtifact(
    image, image, 'test.png',
  );
  assert.equal(identity.bytes, image.length);
  assert.equal(identity.sha256, createHash('sha256').update(image).digest('hex'));
  const overwritten = Buffer.from(image);
  overwritten[overwritten.length - 1] ^= 1;
  assert.throws(() => globalGeometryCapture.bindGlobalGeometryPngArtifact(
    image, overwritten, 'test.png',
  ), /disk.*differ/i);
  const corrupt = Buffer.from(image);
  corrupt[20] ^= 1;
  assert.throws(() => decodeGlobalGeometryPng(corrupt), /CRC|format/);
});

test('owner pixel proof measures connected components instead of crediting scattered fragments', () => {
  const width = 5;
  const height = 5;
  const imagePixels = Buffer.alloc(width * height * 4, 0);
  const maskPixels = Buffer.alloc(width * height * 4, 0);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    imagePixels[pixel * 4 + 3] = 255;
    maskPixels[pixel * 4 + 3] = 255;
  }
  for (const pixel of [0, 4, 20, 24]) {
    imagePixels.set([220, 80, 60, 255], pixel * 4);
    maskPixels.set([255, 59, 48, 255], pixel * 4);
  }
  const proof = measureGlobalGeometryPixelProof(
    rgbaPng(width, height, imagePixels), rgbaPng(width, height, maskPixels),
    [{ id: 'fragmented', color: '#ff3b30' }],
  );
  assert.deepEqual({
    componentCount: proof.owners[0].componentCount,
    largestComponentPixels: proof.owners[0].largestComponentPixels,
    largestComponentRatio: proof.owners[0].largestComponentRatio,
  }, {
    componentCount: 4,
    largestComponentPixels: 1,
    largestComponentRatio: 0.25,
  });
});

test('owner mask classifier accepts production MSAA palette-to-black edge pixels', () => {
  const image = rgbaPng(3, 1, Buffer.from([
    180, 80, 70, 255, 160, 70, 60, 255, 130, 60, 50, 255,
  ]));
  const mask = rgbaPng(3, 1, Buffer.from([
    255, 59, 48, 255,
    128, 30, 24, 255,
    31, 7, 6, 255,
  ]));
  const proof = measureGlobalGeometryPixelProof(image, mask, [
    { id: 'antialiased', color: '#ff3b30' },
  ]);
  assert.equal(proof.owners[0].visiblePixels, 3);
  assert.equal(proof.unclassifiedColoredPixels, 0);
  assert.equal(proof.owners[0].componentCount, 1);
});

test('owner mask classifier keeps low-coverage MSAA edges assigned to the exact palette ray', () => {
  const colors = [
    '#ff3b30', '#34c759', '#0a84ff', '#ffd60a', '#bf5af2', '#ff9f0a',
    '#64d2ff', '#ff375f', '#30d158', '#5e5ce6', '#ac8e68', '#ffffff',
  ];
  const rgb = (color) => [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16));
  const maskPixels = Buffer.from(colors.flatMap((color) => [0.12, 0.5].flatMap((coverage) => [
    ...rgb(color).map((channel) => Math.round(channel * coverage)), 255,
  ])));
  const imagePixels = Buffer.from(colors.flatMap(() => [
    120, 80, 60, 255, 130, 90, 70, 255,
  ]));
  const proof = measureGlobalGeometryPixelProof(
    rgbaPng(colors.length * 2, 1, imagePixels),
    rgbaPng(colors.length * 2, 1, maskPixels),
    colors.map((color, index) => ({ id: `owner-${index}`, color })),
  );
  assert.deepEqual(proof.owners.map(({ visiblePixels }) => visiblePixels), colors.map(() => 2));
  assert.equal(proof.unclassifiedColoredPixels, 0);
});

test('ID materials preserve real alpha depth groups deformation and non-mesh draw semantics', () => {
  const alpha = new THREE.DataTexture(new Uint8Array([255, 255, 255, 64]), 1, 1);
  alpha.needsUpdate = true;
  const source = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0.63,
    alphaTest: 0.31,
    map: alpha,
    alphaMap: alpha,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -2,
  });
  const id = createGlobalGeometryIdMaterial(THREE, source, '#ff3b30');
  assert.equal(id.isMeshBasicMaterial, true);
  for (const key of ['transparent', 'opacity', 'alphaTest', 'map', 'alphaMap', 'depthTest',
    'depthWrite', 'side', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits']) {
    assert.equal(id[key], source[key], `${key} drifted from the production material`);
  }
  const shader = { fragmentShader: '#include <alphatest_fragment>\n#include <opaque_fragment>' };
  id.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /diffuseColor\.rgb\s*=\s*diffuse/,
    'production map alpha is preserved but its RGB can still corrupt the owner palette');

  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  assert.equal(createGlobalGeometryIdMaterial(THREE, hidden, '#34c759').visible, false);
  const sprite = createGlobalGeometryIdMaterial(
    THREE, new THREE.SpriteMaterial({ opacity: 0.4, transparent: true }), '#000000',
  );
  const points = createGlobalGeometryIdMaterial(
    THREE, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false }), '#000000',
  );
  const line = createGlobalGeometryIdMaterial(
    THREE, new THREE.LineBasicMaterial({ linewidth: 2 }), '#000000',
  );
  assert.equal(sprite.isSpriteMaterial, true);
  assert.equal(points.isPointsMaterial, true);
  assert.equal(points.size, 3);
  assert.equal(points.sizeAttenuation, false);
  assert.equal(line.isLineBasicMaterial, true);
});

test('render-state binding changes for geometry material transform and instance mutations', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 1000);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x123456 });
  const mesh = new THREE.InstancedMesh(geometry, material, 2);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-1, 0, 0));
  scene.add(mesh);
  const renderer = {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    shadowMap: { enabled: false, type: THREE.PCFShadowMap },
    getPixelRatio: () => 1,
    getSize: (target) => target.set(1280, 720),
    getViewport: (target) => target.set(0, 0, 1280, 720),
    getScissor: (target) => target.set(0, 0, 1280, 720),
    getScissorTest: () => false,
    getClearColor: (target) => target.set(0x000000),
    getClearAlpha: () => 1,
  };
  const fingerprint = () => hashStableEvidence(
    globalGeometryRenderStateSnapshot(THREE, scene, camera, renderer, null),
  );
  const initial = fingerprint();
  mesh.position.x = 2;
  assert.notEqual(fingerprint(), initial, 'world transform mutation was invisible');
  mesh.position.x = 0;
  material.opacity = 0.5;
  assert.notEqual(fingerprint(), initial, 'material mutation was invisible');
  material.opacity = 1;
  geometry.setDrawRange(0, 3);
  assert.notEqual(fingerprint(), initial, 'drawRange mutation was invisible');
  geometry.setDrawRange(0, Infinity);
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-2, 0, 0));
  assert.notEqual(fingerprint(), initial, 'instance transform mutation was invisible');
});

test('controlled rendering blocks live RAF writes and uses the production postfx path for the PNG', () => {
  const frames = [];
  const renderer = {
    render: (scene, camera) => frames.push({ scene, camera, path: 'renderer' }),
    setRenderTarget() {},
    setViewport() {},
    setScissor() {},
    setScissorTest() {},
    domElement: { width: 1280, height: 720 },
  };
  const liveScene = { id: 'live-scene' };
  const liveCamera = { id: 'live-camera' };
  const evidenceScene = { id: 'evidence-scene' };
  const evidenceCamera = { id: 'evidence-camera' };
  const pass = { scene: liveScene, camera: liveCamera };
  const postfx = {
    scene: liveScene,
    camera: liveCamera,
    composer: { passes: [pass] },
    render() {
      frames.push({ path: 'postfx' });
      renderer.render(pass.scene, pass.camera);
    },
  };
  const controlled = createGlobalGeometryControlledRenderer(
    renderer, postfx, evidenceScene, evidenceCamera,
  );
  renderer.render(liveScene, liveCamera);
  assert.deepEqual(frames, [], 'a live RAF draw changed the evidence canvas');
  controlled.renderProduction();
  assert.deepEqual(frames, [
    { path: 'postfx' },
    { scene: evidenceScene, camera: evidenceCamera, path: 'renderer' },
  ]);
  assert.equal(pass.scene, liveScene);
  assert.equal(pass.camera, liveCamera);
  controlled.renderRaw();
  assert.deepEqual(frames.at(-1), {
    scene: evidenceScene, camera: evidenceCamera, path: 'renderer',
  });
  controlled.dispose();
  renderer.render(liveScene, liveCamera);
  assert.deepEqual(frames.at(-1), { scene: liveScene, camera: liveCamera, path: 'renderer' });
});

test('canvas bytes are acquired synchronously inside the exact controlled render state', () => {
  let renderCalls = 0;
  let canvasReads = 0;
  const state = { camera: [1, 2, 3], materialVersion: 4 };
  const frame = captureGlobalGeometryCanvasFrame({
    render: () => { renderCalls += 1; },
    canvas: {
      toDataURL(type) {
        assert.equal(type, 'image/png');
        assert.equal(renderCalls, 1);
        canvasReads += 1;
        return 'data:image/png;base64,AQID';
      },
    },
    snapshot: () => structuredClone(state),
  });
  assert.deepEqual(frame, {
    pngBase64: 'AQID',
    renderState: state,
    renderStateJson: JSON.stringify(state),
  });
  assert.equal(canvasReads, 1);

  assert.throws(() => captureGlobalGeometryCanvasFrame({
    render: () => { state.materialVersion += 1; },
    canvas: { toDataURL: () => 'data:image/png;base64,AQID' },
    snapshot: () => structuredClone(state),
  }), /render state changed while acquiring PNG bytes/);
});

test('capture tool stays separate, browser-off until invoked, and brackets every PNG with live proof', () => {
  assert.match(captureSource, /playwright[\s\S]*chromium\.launch/);
  assert.match(captureSource,
    /page\.evaluate[\s\S]*capture\(spec\)[\s\S]*captureProductionPng\(spec\)[\s\S]*captureOwnerMaskPng\(spec\)[\s\S]*capture\(spec\)/,
    'screenshot-time ledger/composition is not sampled on both sides of the PNG');
  assert.doesNotMatch(captureSource, /page\.screenshot/,
    'PNG bytes are still acquired in a later browser task instead of the controlled render task');
  assert.match(captureSource,
    /captureCanvasFrame[\s\S]*renderProduction[\s\S]*toDataURL|captureGlobalGeometryCanvasFrame\.toString/,
    'the controlled page API does not own the exact render-to-canvas acquisition path');
  assert.match(captureSource, /response\.body\(\)[\s\S]*sha256/,
    'served response bytes are not captured into provenance');
  assert.match(captureSource, /page\.on\('pageerror'/);
  assert.match(captureSource, /page\.on\('console'/);
  assert.match(captureSource, /page\.on\('requestfailed'/);
  assert.match(captureSource, /function colliderPolicy[\s\S]*containsPoint/,
    'camera legality is not derived from the scene collider model');
  assert.match(captureSource, /function cameraLegality[\s\S]*pointInsideFocusedMesh/,
    'camera legality is not derived from focused visible meshes');
  assert.doesNotMatch(captureSource, /colliderClear:\s*true|insideSolidClear:\s*true/,
    'capture tool still stamps shape-valid camera legality without measuring it');
  assert.match(captureSource, /runDirectoryExistedBefore[\s\S]*existsSync[\s\S]*throw/,
    'an existing label can still be reused');
  assert.match(captureSource,
    /const sourceSnapshot = currentGlobalGeometryEvidenceSourceIdentities\(\)[\s\S]*chromium\.launch[\s\S]*assertGlobalGeometryEvidenceSourcesUnchanged\(sourceSnapshot\)/,
    'executed tool/contract bytes are not snapshotted before launch and rechecked');
  assert.doesNotMatch(captureSource, /const unique = new Map\(\)/,
    'repeated served URLs are still silently overwritten');
  assert.doesNotMatch(captureSource, /spawn\(|exec\(|serve\.mjs|initiation/i,
    'the focused harness starts infrastructure or enters the frozen scene');
});

test('scene ledgers bind supports to their exact real footprints instead of height alone', () => {
  assert.match(captureSource,
    /const note = \(object, dependent, supportBox, owner, gap\)[\s\S]*positiveFootprint\(boundsOf\(object\), supportBox\)/,
    'Cartel table pieces can keep their y value while leaving the real tabletop');
  assert.match(captureSource,
    /const candidateFloorBox = floor\.length === 1 \? boundsOf\(floor\[0\]\) : null[\s\S]*livingFloor[\s\S]*positiveFootprint\(footBox, floorBox\)/,
    'Mansion feet can keep the living-floor y value outside its footprint');
  assert.match(captureSource,
    /seatBox && positiveFootprint\(seatBox, footBox\) && Math\.abs\(seatGap\) <= 1e-4/,
    'Motel lounge feet can meet the seat height while missing the seat');
  assert.match(captureSource,
    /const office = runtime\.club\?\.rooms\?\.office[\s\S]*Math\.abs\(box\.min\.x - office\.x0\)/,
    'Bing evidence can relabel a different same-height plane as the real office carpet');
});

test('an injected capture failure removes only its new scoped run and leaves the label reusable', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'squatch-global-geometry-evidence-'));
  const outputRoot = path.join(sandbox, 'evidence-root');
  const sentinel = path.join(outputRoot, 'keep.txt');
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(sentinel, 'keep', 'utf8');
  const args = [
    '--base-url=http://127.0.0.1:54999',
    '--label=injected-failure',
    `--out=${outputRoot}`,
  ];
  const dependencies = {
    bootstrapProof: 'test-injected',
    createServer: () => ({}),
    listenServer: async () => {},
    closeServer: async () => {},
    launchBrowser: async () => ({ close: async () => {} }),
    captureShot: async (_browser, _options, runDirectory, spec) => {
      fs.writeFileSync(path.join(runDirectory, spec.file), 'partial PNG', 'utf8');
      throw new Error('injected capture failure');
    },
  };
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assert.rejects(
        captureGlobalGeometryEvidence(args, {}, dependencies),
        /injected capture failure/,
      );
      assert.equal(fs.existsSync(path.join(outputRoot, 'injected-failure')), false,
        'failed label remained poisoned by a partial run');
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep',
        'cleanup escaped the one newly-created run directory');
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('global capture reserves and writes only its transactional staging tree', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'squatch-global-directory-wire-'));
  const outputRoot = path.join(sandbox, 'evidence-root');
  const sentinel = path.join(outputRoot, 'keep.txt');
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(sentinel, 'keep', 'utf8');
  const args = [
    '--base-url=http://127.0.0.1:55000',
    '--label=transaction-wire',
    `--out=${outputRoot}`,
  ];
  let capturedDirectory = null;
  try {
    await assert.rejects(captureGlobalGeometryEvidence(args, {}, {
      bootstrapProof: 'test-injected',
      createServer: () => ({}),
      listenServer: async () => {},
      closeServer: async () => {},
      beginDirectoryTransaction: beginEvidenceDirectoryTransaction,
      launchBrowser: async () => ({ close: async () => {} }),
      captureShot: async (_browser, _options, runDirectory, spec) => {
        capturedDirectory = runDirectory;
        assert.match(path.basename(runDirectory), /^\.transaction-wire-staging-/);
        fs.writeFileSync(path.join(runDirectory, spec.file), 'partial PNG', 'utf8');
        throw new Error('transactional injected failure');
      },
    }), /transactional injected failure/);
    assert.ok(capturedDirectory);
    assert.equal(fs.existsSync(capturedDirectory), false);
    assert.equal(fs.existsSync(path.join(outputRoot, 'transaction-wire')), false);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
    assert.deepEqual(fs.readdirSync(outputRoot), ['keep.txt']);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('global capture rejects raw output traversal before transaction or server creation', async (t) => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'squatch-global-raw-output-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const traversal = `${sandbox}${path.sep}nested${path.sep}..${path.sep}evidence`;
  let transactionBegan = false;
  let serverCreated = false;
  await assert.rejects(captureGlobalGeometryEvidence([
    '--base-url=http://127.0.0.1:55000', '--label=raw-capture-traversal', `--out=${traversal}`,
  ], {}, {
    bootstrapProof: 'test-injected',
    beginDirectoryTransaction: () => {
      transactionBegan = true;
      throw new Error('transaction began before raw output validation');
    },
    createServer: () => { serverCreated = true; throw new Error('server created'); },
  }), /unsafe.*output root.*traversal/i);
  assert.equal(transactionBegan, false);
  assert.equal(serverCreated, false);
});

test('global capture rejects a real output junction before transaction or server creation', async (t) => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'squatch-global-output-junction-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const target = path.join(sandbox, 'target');
  const outputRoot = path.join(sandbox, 'output-link');
  fs.mkdirSync(target);
  fs.symlinkSync(target, outputRoot, process.platform === 'win32' ? 'junction' : 'dir');
  let transactionBegan = false;
  let serverCreated = false;
  await assert.rejects(captureGlobalGeometryEvidence([
    '--base-url=http://127.0.0.1:55000', '--label=junction-capture', `--out=${outputRoot}`,
  ], {}, {
    bootstrapProof: 'test-injected',
    beginDirectoryTransaction: () => {
      transactionBegan = true;
      throw new Error('transaction began before junction validation');
    },
    createServer: () => { serverCreated = true; throw new Error('server created'); },
  }), /unsafe.*(?:junction|reparse|symbolic)/i);
  assert.equal(transactionBegan, false);
  assert.equal(serverCreated, false);
  assert.deepEqual(fs.readdirSync(target), []);
});
