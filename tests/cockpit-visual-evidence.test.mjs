import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import * as THREE from 'three';

import {
  COCKPIT_VISUAL_EVIDENCE_SHOTS,
  COCKPIT_VISUAL_EVIDENCE_VIEWPORT,
  COCKPIT_VISUAL_SEMANTIC_GATE_POLICIES,
  COCKPIT_VISUAL_SEAM_POLICIES,
  assertCockpitVisualEvidenceSourcesUnchanged,
  buildCockpitVisualEvidenceLedger,
  currentCockpitVisualEvidenceSourceIdentities,
  evaluateCockpitVisualShot,
  parseCockpitVisualEvidenceRun,
  snapshotCockpitVisualEvidenceSources,
} from '../tools/cockpit-visual-evidence-contract.mjs';
import {
  bindCockpitScreenshotArtifact,
  measureCockpitIdMask,
} from '../tools/cockpit-visual-pixel-proof.mjs';
import {
  captureCockpitVisualShot,
  captureCockpitVisualEvidence,
  createCockpitVisualEvidenceServer,
  installCockpitEvidenceScheduler,
  installCockpitServedResponseTracker,
  materializeCockpitImmutableBootstrap,
  resolveCockpitStaticRequest,
} from '../tools/capture-cockpit-visual-evidence.mjs';
import {
  buildCockpitRootPalette,
  cockpitEvidenceDeformationContract,
  cockpitEvidenceDrawPolicy,
  cockpitEvidenceRenderableDescendants,
  installCockpitVisualEvidencePageApi,
  measureCockpitAnnulusSurfaceFit,
  measureCockpitDoorShellSweep,
  measureCockpitYokeJoins,
  resolveCockpitVisualOwnerRoots,
  resolveCockpitRuntime,
} from '../tools/cockpit-visual-page-api.mjs';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

function crc32(bytes) {
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
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function rgbaPng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]), Buffer.from(pixels.slice(y * width * 4, (y + 1) * width * 4)));
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clone(value) {
  return structuredClone(value);
}

function satisfyingSemanticMeasurements(spec) {
  const measurements = {};
  for (const gate of spec.covers.flatMap((cover) => (
    COCKPIT_VISUAL_SEAM_POLICIES[cover].numericGates
  ))) {
    for (const binding of COCKPIT_VISUAL_SEMANTIC_GATE_POLICIES[gate].bindings) {
      measurements[binding.measurement] = binding.threshold;
    }
  }
  return measurements;
}

function validShotCapture(spec, label = 'fresh-proof') {
  const external = spec.pose.view.startsWith('exterior') || spec.pose.view.endsWith('exterior');
  const expectedGun = spec.pose.gun === 'left-down-limit'
    ? { yaw: -1.02, pitch: -0.38, atTraverseLimit: true, atElevationLimit: true }
    : spec.pose.gun === 'right-up-limit'
      ? { yaw: 1.02, pitch: 0.58, atTraverseLimit: true, atElevationLimit: true }
      : { yaw: 0, pitch: 0, atTraverseLimit: false, atElevationLimit: false };
  const state = {
    shotId: spec.id,
    runtimeHandle: spec.scene === 'beefrun' ? 'window.__beefrun' : 'window.__enolaSquatch',
    sceneUuid: `${spec.scene}-scene`,
    camera: {
      uuid: `${spec.id}-camera`,
      type: 'PerspectiveCamera',
      legalSource: spec.pose.view === 'rear-gun' ? 'public-gunner-camera' : 'public-runtime-camera',
      position: [1, 2, 3], quaternion: [0, 0, 0, 1], projection: Array(16).fill(0),
    },
    pose: { phase: 'proof', inCockpit: !external, requested: spec.pose },
    scheduler: {
      installedBeforeModules: true, frozen: true, generation: 1,
      pendingTimers: 0, pendingIntervals: 0, pendingAnimationFrames: 0,
    },
    renderStateFingerprint: 'e'.repeat(64),
    subjects: Object.fromEntries(spec.owners.map((owner, ownerIndex) => {
      const rootNames = owner.expectedRootNames.length
        ? [...owner.expectedRootNames].sort()
        : Array.from({ length: owner.expectedRootCount }, (_, index) => `root-${ownerIndex}-${index}`);
      const objectCount = owner.expectedObjectCount;
      return [owner.id, {
        rootCount: owner.expectedRootCount,
        rootUuids: Array.from({ length: owner.expectedRootCount },
          (_, index) => `${spec.id}-${owner.id}-root-${index}`),
        rootNames,
        roots: rootNames.map((name, index) => ({
          uuid: `${spec.id}-${owner.id}-root-${index}`,
          name,
          objectCount: Math.max(1, Math.floor(objectCount / owner.expectedRootCount)),
          visibleObjectCount: Math.max(1, Math.floor(objectCount / owner.expectedRootCount)),
          finiteWorldBounds: true,
        })),
        objectCount,
        objectUuids: Array.from({ length: objectCount },
          (_, index) => `${spec.id}-${owner.id}-mesh-${index}`),
        visibleObjectCount: objectCount,
        finiteWorldBounds: true,
      }];
    })),
    geometry: {
      supports: {
        members: [{
          id: 'cockpit-floor-support', category: 'fixture',
          endpointA: 'floor', endpointB: 'fixture', endpointAGapM: 0, endpointBGapM: 0,
          attached: true, finiteWorldBounds: true, gapM: 0,
        }],
        unsupported: [],
      },
      shell: {
        expectedCameraRelation: external ? 'outside' : 'inside',
        cameraRelation: external ? 'outside' : 'inside',
        nearestFixtureClearanceM: 0.4,
        intrusions: [],
        apertures: [{
          id: 'forward-or-side-aperture',
          clearWidthM: 0.8,
          clearHeightM: 0.7,
          sampleRayCount: 9,
          paneFirstHitCount: 9,
          clearRayCount: 9,
          frameRayCount: 4,
          frameRayHitCount: 4,
          frameAttached: true,
          exactPaneCount: 1,
          expectedPaneCount: 1,
          exactOwnerMatch: true,
          thicknessM: 0.05,
          frameMaxGapM: 0.02,
          transparentMaterialCount: 1,
          activeMaterialCount: 1,
          minimumOpacity: 0.2,
          maximumOpacity: 0.2,
          transparentPixelsCredited: true,
        }],
      },
      door: spec.pose.cargoDoor === 'open' || spec.pose.crewDoor === 'open' ? {
        id: spec.scene === 'beefrun' ? 'cargo-door' : 'crew-door',
        openFraction: 1,
        openingWidthM: 1.1,
        openingHeightM: 1.5,
        thresholdClearanceM: 0.08,
        egressDeployed: true,
        egressClearanceM: 0.06,
        capsuleRouteClearanceM: 0.06,
        routeWidthM: 1.1,
        routeHeightM: 1.5,
        leafShellIntrusionCount: 0,
        sweptShellIntrusionCount: 0,
        shellMaximumPenetrationM: 0,
        sweepSampleCount: 257,
      } : { id: 'not-required', openFraction: 0 },
      controls: {
        mode: spec.pose.controls ?? 'neutral',
        pitch: spec.pose.controls === 'full-extreme' ? 1 : 0,
        roll: spec.pose.controls === 'full-extreme' ? 1 : 0,
        yaw: spec.pose.controls === 'full-extreme' ? 1 : 0,
        throttleL: spec.pose.controls === 'full-extreme' ? 1 : 0,
        throttleR: spec.pose.controls === 'full-extreme' ? 1 : 0,
        flaps: spec.pose.controls === 'full-extreme' ? 1 : 0,
        expectedTransforms: spec.pose.controls === 'full-extreme'
          ? spec.scene === 'beefrun' ? {
            yokeZ: 2.35, yokeRollRad: -0.5,
            pedalZ: [2.35, 2.25], pedalMountGapM: 0,
            engineLeverRad: [0.4, 0.4, 0, 0, 0, 0], flapLeverRad: 0.5,
            externalFlapRad: 0.62,
          } : {
            yokePitchRad: [0.16, 0.16], yokeRollRad: [0.65, 0.65],
            throttleRad: [0.4, 0.4, 0.4, 0.4],
            pedalZ: [0.055, -0.055, 0.055, -0.055],
            pedalRad: [-0.44, -0.2, -0.44, -0.2],
            externalFlapRad: 0.55,
            maximumYokeError: 0, maximumThrottleError: 0, maximumPedalError: 0,
          }
          : null,
        yokes: [{ id: 'pilot', atRequestedPose: true }, { id: 'copilot', atRequestedPose: true }],
        minimumClearanceM: 0.08,
        intrusions: [],
        intendedJoinCount: 2,
        intendedJoinMaximumGapM: 0,
      },
      gun: { ...expectedGun, minimumClearanceM: 0.08, intrusions: [] },
      traversal: spec.pose.traversal === 'crouched-ramp-sill' ? {
        id: 'beef-crouched-ramp-sill',
        startLocal: [-3.3, -1.8, -1.05],
        endLocal: [0.05, -0.86, -1.05],
        frames: 180,
        maximumHorizontalStepM: 0.025,
        crouching: true,
        eyeHeightM: 1.02,
        crossedSill: true,
        insideFloorErrorM: 0.001,
        thresholdHeightM: 0.08,
        doorLeafMinimumYM: 0.61,
        crouchedHeadMarginYM: 0.4,
        samples: [
          { frame: 0, local: [-3.3, -1.8, -1.05], stepM: 0 },
          { frame: 180, local: [0.05, -0.86, -1.05], stepM: 0.02 },
        ],
      } : null,
      collision: spec.pose.collisionMatrix === 'side-underwing' ? {
        id: 'beef-side-underwing',
        sideCapsuleLocalX: 1.23,
        sideMinimumAbsX: 1.23,
        underWingStartLocal: [3, 0, 5.8],
        underWingEndLocal: [3, 0, -3.6],
        underWingFrames: 300,
        underWingGroundDeltaM: 0.001,
        maximumHorizontalStepM: 0.025,
      } : spec.pose.collisionMatrix === 'nose-tail' ? {
        id: 'beef-nose-tail',
        noseCapsuleLocalZ: 5.65,
        noseMinimumZ: 5.65,
        tailCapsuleLocalZ: -7.35,
        tailMaximumZ: -7.35,
      } : spec.pose.collisionMatrix === 'enola-side' ? {
        id: 'enola-side', capsuleClearanceM: 0.31, intrusions: [],
      } : spec.pose.collisionMatrix === 'enola-belly' ? {
        id: 'enola-belly-closed', bayClosed: true, capsuleClearanceM: 0.31,
        intrusions: [],
      } : null,
    },
    measurements: satisfyingSemanticMeasurements(spec),
  };
  const imageSha = 'a'.repeat(64);
  const maskSha = 'b'.repeat(64);
  let rootColorIndex = 1;
  const rootProofs = [];
  const ownerProofs = spec.owners.map((entry) => {
    const subjectRoots = state.subjects[entry.id].roots;
    const perRootPixels = Math.max(
      entry.minRootPixels + 10,
      entry.minLargestComponentPixels,
      Math.ceil((entry.minPixels + 50) / subjectRoots.length),
    );
    for (const root of subjectRoots) {
      rootProofs.push({
        id: `${entry.id}:${root.uuid}`,
        ownerId: entry.id,
        rootUuid: root.uuid,
        rootName: root.name,
        color: `#${(rootColorIndex++).toString(16).padStart(6, '0')}`,
        visiblePixels: perRootPixels,
        componentCount: 1,
        largestComponentPixels: perRootPixels,
        largestComponentRatio: 1,
        ringPixels: 40,
        contrast: entry.minContrast + 0.02,
      });
    }
    return {
      id: entry.id,
      color: entry.color.toLowerCase(),
      visiblePixels: perRootPixels * subjectRoots.length,
      componentCount: subjectRoots.length,
      largestComponentPixels: perRootPixels,
      largestComponentRatio: 1 / subjectRoots.length,
      ringPixels: 40 * subjectRoots.length,
      contrast: entry.minContrast + 0.02,
    };
  });
  return {
    id: spec.id,
    scene: spec.scene,
    page: spec.page,
    baseUrl: 'http://127.0.0.1:55123',
    fresh: { screenshotAbsentBefore: true, maskAbsentBefore: true },
    runtime: {
      pageErrors: [], consoleErrors: [], httpErrors: [], requestFailures: [], contextErrors: [],
    },
    before: clone(state),
    pngBinding: clone(state),
    after: clone(state),
    renderReceipts: {
      normal: {
        serial: 20, mode: 'normal',
        path: spec.scene === 'enola' ? 'public-postfx' : 'raw-webgl',
        postfx: spec.scene === 'enola' ? {
          ready: true, renderMethodPresent: true, enabled: true,
          composerPresent: true, bloomPresent: true,
          bloomPassAttached: true, bloomEnabled: true, bloomType: 'UnrealBloomPass',
          bloomThreshold: 1.18, bloomStrength: 0.25, bloomRadius: 0.34,
        } : null,
        preFingerprint: 'e'.repeat(64), postFingerprint: 'e'.repeat(64),
        scheduler: clone(state.scheduler),
      },
      mask: {
        serial: 21, mode: 'mask', path: 'raw-webgl',
        preFingerprint: 'f'.repeat(64), postFingerprint: 'f'.repeat(64),
        sourceFingerprint: 'e'.repeat(64), scheduler: clone(state.scheduler),
      },
      restored: {
        serial: 22, mode: 'normal',
        path: spec.scene === 'enola' ? 'public-postfx' : 'raw-webgl',
        postfx: spec.scene === 'enola' ? {
          ready: true, renderMethodPresent: true, enabled: true,
          composerPresent: true, bloomPresent: true,
          bloomPassAttached: true, bloomEnabled: true, bloomType: 'UnrealBloomPass',
          bloomThreshold: 1.18, bloomStrength: 0.25, bloomRadius: 0.34,
        } : null,
        preFingerprint: 'e'.repeat(64), postFingerprint: 'e'.repeat(64),
        scheduler: clone(state.scheduler),
      },
    },
    screenshot: {
      file: `${label}-${spec.id}.png`,
      width: COCKPIT_VISUAL_EVIDENCE_VIEWPORT.width,
      height: COCKPIT_VISUAL_EVIDENCE_VIEWPORT.height,
      bytes: 4096,
      sha256: imageSha,
      ownerMask: {
        file: `${label}-${spec.id}-id-mask.png`,
        width: COCKPIT_VISUAL_EVIDENCE_VIEWPORT.width,
        height: COCKPIT_VISUAL_EVIDENCE_VIEWPORT.height,
        bytes: 2048,
        sha256: maskSha,
      },
      pixelProof: {
        width: COCKPIT_VISUAL_EVIDENCE_VIEWPORT.width,
        height: COCKPIT_VISUAL_EVIDENCE_VIEWPORT.height,
        imagePngBytes: 4096,
        imagePngSha256: imageSha,
        maskPngBytes: 2048,
        maskPngSha256: maskSha,
        classifiedPixels: ownerProofs.reduce((sum, entry) => sum + entry.visiblePixels, 0),
        unclassifiedColoredPixels: 0,
        unclassifiedColoredRatio: 0,
        owners: ownerProofs,
        roots: rootProofs,
        maskBinding: clone(state),
        restoredBinding: clone(state),
      },
    },
    served: { launchDocument: `http://127.0.0.1:55123/${spec.page}`, entries: [] },
  };
}

function bindFakeArtifactBytes(capture, transaction) {
  const imageBytes = Buffer.from(`image:${capture.id}`);
  const maskBytes = Buffer.from(`mask:${capture.id}`);
  fs.writeFileSync(transaction.stagePath(capture.screenshot.file), imageBytes);
  fs.writeFileSync(transaction.stagePath(capture.screenshot.ownerMask.file), maskBytes);
  capture.screenshot.bytes = imageBytes.length;
  capture.screenshot.sha256 = createHash('sha256').update(imageBytes).digest('hex');
  capture.screenshot.ownerMask.bytes = maskBytes.length;
  capture.screenshot.ownerMask.sha256 = createHash('sha256').update(maskBytes).digest('hex');
  capture.screenshot.pixelProof.imagePngBytes = imageBytes.length;
  capture.screenshot.pixelProof.imagePngSha256 = capture.screenshot.sha256;
  capture.screenshot.pixelProof.maskPngBytes = maskBytes.length;
  capture.screenshot.pixelProof.maskPngSha256 = capture.screenshot.ownerMask.sha256;
}

function attachFakeServedProvenance(capture, snapshot, spec) {
  const required = [
    spec.page.split('?')[0],
    spec.scene === 'beefrun' ? 'src/beefrun/main.js' : 'src/enolasquatch/main.js',
  ];
  const entries = required.map((file) => {
    const source = snapshot.runtimeSources.find((entry) => entry.file === file);
    assert.ok(source, `missing test source identity for ${file}`);
    return {
      url: `${capture.baseUrl}/${file}`,
      file,
      resourceType: file.endsWith('.html') ? 'document' : 'script',
      status: 200,
      bytes: source.bytes,
      sha256: source.sha256,
      captureStartBytes: source.bytes,
      captureStartSha256: source.sha256,
    };
  });
  capture.served.entries = entries;
  capture.served.fingerprint = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  capture.served.quiescence = {
    sealed: true, timedOut: false, quietMs: 150,
    requestCount: entries.length, responseCount: entries.length, finishedCount: entries.length,
    failedCount: 0, pendingCount: 0, bodyPendingCount: 0, activitySerial: entries.length * 3,
  };
}

function fakeArtifactIdentities(captures) {
  return captures.flatMap(({ screenshot }) => [screenshot, screenshot.ownerMask])
    .map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 }));
}

function completeFakeCaptures(label, sourceSnapshot) {
  return COCKPIT_VISUAL_EVIDENCE_SHOTS.map((spec) => {
    const capture = validShotCapture(spec, label);
    attachFakeServedProvenance(capture, sourceSnapshot, spec);
    return capture;
  });
}

function fakeLedger(captures, sourceSnapshot, label = 'fresh-proof') {
  return buildCockpitVisualEvidenceLedger({
    options: { label, port: 55123, baseUrl: 'http://127.0.0.1:55123' },
    captures,
    artifactIdentities: fakeArtifactIdentities(captures),
    sourceStart: sourceSnapshot,
    sourceEnd: clone(sourceSnapshot),
    bootstrapProof: {
      mode: 'test-injected', verified: true,
      expectedSourceSha256: sourceSnapshot.sourceSnapshotSha256,
      executedSourceSha256: sourceSnapshot.sourceSnapshotSha256,
    },
    startedAt: '2026-08-12T12:00:00.000Z',
    completedAt: '2026-08-12T12:00:01.000Z',
  });
}

test('the cockpit evidence manifest covers every requested visual proof with named pixel owners', () => {
  const ids = COCKPIT_VISUAL_EVIDENCE_SHOTS.map(({ id }) => id);
  assert.deepEqual(ids, [
    'beef-forward-neutral',
    'beef-port-aperture',
    'beef-starboard-aperture-sasole',
    'beef-cargo-egress-open',
    'beef-cargo-egress-inside-out',
    'beef-cargo-ramp-traversal',
    'beef-closed-shell-side',
    'beef-closed-shell-nose-tail',
      'beef-controls-extreme',
      'enola-pilot-forward',
      'enola-side-glazing',
      'enola-dome-waist-annuli',
      'enola-controls-extreme',
      'enola-sasole-seat',
      'enola-navigator-contacts',
      'enola-crew-door-closed',
      'enola-crew-egress-open',
      'enola-shell-side',
      'enola-belly-closed',
      'enola-bomb-bay-open',
      'enola-bombardier-glazing',
      'enola-rear-gun-neutral',
      'enola-rear-gun-left-down-limit',
      'enola-rear-gun-right-up-limit',
      'enola-nose-art-port',
      'enola-nose-art-starboard',
  ]);
  assert.equal(new Set(ids).size, ids.length);

  for (const shot of COCKPIT_VISUAL_EVIDENCE_SHOTS) {
    assert.ok(Object.isFrozen(shot));
    assert.ok(Object.isFrozen(shot.owners));
    assert.match(shot.page, /^(?:beefrun|enolasquatch)\.html\?preview=1&checkpoint=/);
    assert.equal(shot.file, `${shot.id}.png`);
    assert.ok(shot.owners.length >= 2, `${shot.id} has no independent pixel subjects`);
    for (const owner of shot.owners) {
      assert.match(owner.id, /^[a-z0-9][a-z0-9-]*$/);
      assert.match(owner.color, /^#[0-9a-f]{6}$/i);
      assert.ok(owner.minPixels >= 64);
      assert.ok(owner.minContrast >= 0.005);
    }
  }
  const port = COCKPIT_VISUAL_EVIDENCE_SHOTS.find(({ id }) => id === 'beef-port-aperture');
  const starboard = COCKPIT_VISUAL_EVIDENCE_SHOTS
    .find(({ id }) => id === 'beef-starboard-aperture-sasole');
  assert.deepEqual(port.owners.map(({ id }) => id), ['port-window-pane', 'port-aperture-shell', 'port-frame']);
  assert.ok(starboard.owners.some(({ id }) => id === 'starboard-window-pane'));
  assert.ok(starboard.owners.some(({ id }) => id === 'rudder-pedals'));
  const extremes = COCKPIT_VISUAL_EVIDENCE_SHOTS.find(({ id }) => id === 'beef-controls-extreme');
  assert.equal(extremes.pose.controls, 'full-extreme');
  assert.deepEqual(extremes.pose.axes, {
    pitch: 1, roll: 1, yaw: 1, throttleL: 1, throttleR: 1, flaps: 1,
  });
  assert.equal(COCKPIT_VISUAL_EVIDENCE_SHOTS.find(({ id }) => id === 'beef-closed-shell-side')
    .pose.collisionMatrix, 'side-underwing');
  assert.equal(COCKPIT_VISUAL_EVIDENCE_SHOTS.find(({ id }) => id === 'beef-closed-shell-nose-tail')
    .pose.collisionMatrix, 'nose-tail');
  assert.equal(COCKPIT_VISUAL_EVIDENCE_SHOTS.find(({ id }) => id === 'enola-bomb-bay-open')
    .pose.phase, 'release', 'the public bomb-approach phase closes the production bay');
});

test('every requested cockpit repair has an authoritative semantic policy and explicit runtime owners', () => {
  const required = [
    'beef:forward-gauges-panel-windshield-yoke',
    'beef:port-aperture',
    'beef:starboard-aperture',
    'beef:sasole',
    'beef:footwell-pedals',
    'beef:door-threshold-ramp',
    'beef:cargo-aperture-inside-out',
    'beef:cargo-ramp-sill-traversal',
    'beef:closed-shell-side',
    'beef:closed-shell-nose-tail',
    'beef:controls-extreme',
    'enola:windshield-shell-opening',
    'enola:side-panes-lower-forward-shell-clear',
    'enola:side-pane-frames-nose-sector',
    'enola:roof-dome-annuli-no-holes',
    'enola:waist-glazing-annuli-no-holes',
    'enola:panel-load-path',
    'enola:quadrant-load-path',
    'enola:pedals-mounted-animated',
    'enola:yokes-panel-clear-full-controls',
    'enola:four-throttles-animated',
    'enola:sasole-seat-body-boots-pedals-clear',
    'enola:irish-nav-table-boots-clear',
    'enola:dynamic-seated-contacts',
    'enola:crew-door-closed',
    'enola:crew-door-open-ladder-sill-route',
    'enola:shell-side-collision',
    'enola:belly-closed-collision',
    'enola:bomb-bay-open-stand-under',
    'enola:bomb-leaves-open-clear',
    'enola:bombardier-nose-glazing',
    'enola:rear-gun-model-reticle-tracer-parity',
    'enola:rear-gunner-hands-grips',
    'enola:rear-gunner-body-seat-turret',
    'enola:rear-gun-manned-camera-unoccluded',
    'enola:rear-gun-fairing-tail-clear',
    'enola:rear-turret-glazing-clear',
    'enola:nose-art-pinup-port-ready',
    'enola:nose-art-pinup-starboard-ready',
    'enola:nose-art-name-port-ready',
    'enola:nose-art-name-starboard-ready',
  ].sort();
  assert.deepEqual(Object.keys(COCKPIT_VISUAL_SEAM_POLICIES).sort(), required);
  assert.deepEqual(
    [...new Set(COCKPIT_VISUAL_EVIDENCE_SHOTS.flatMap(({ covers }) => covers))].sort(),
    required,
  );

  for (const [id, policy] of Object.entries(COCKPIT_VISUAL_SEAM_POLICIES)) {
    assert.equal(policy.id, id);
    assert.ok(Object.isFrozen(policy));
    assert.ok(policy.numericGates.length > 0, `${id} has no numeric semantic gate`);
    assert.ok(policy.requiredOwners.length > 0, `${id} has no required visible owner`);
    assert.ok(policy.numericGates.every((gate) => typeof gate === 'string' && gate.length > 0));
    assert.ok(policy.requiredOwners.every((ownerId) => typeof ownerId === 'string' && ownerId.length > 0));
  }

  for (const shot of COCKPIT_VISUAL_EVIDENCE_SHOTS) {
    for (const owner of shot.owners) {
      assert.ok(owner.expectedRootCount > 0, `${shot.id}/${owner.id} has no root cardinality`);
      assert.ok(owner.expectedObjectCount > 0, `${shot.id}/${owner.id} has no object cardinality`);
      assert.equal(owner.expectedRootNames.length, owner.expectedRootCount,
        `${shot.id}/${owner.id} has no exact semantic root names`);
      assert.ok(owner.minLargestComponentRatio >= Math.max(0.12, 0.72 / owner.maxComponentCount),
        `${shot.id}/${owner.id} accepts fragmented ID-mask noise`);
      assert.ok(owner.minLargestComponentPixels
        >= Math.ceil(owner.minPixels * owner.minLargestComponentRatio));
    }
  }
});

test('exact owner policies resolve against the real Beef and Enola builders without borrowing a runtime draw', async () => {
  const [{ Brushrunner }, { makeLou }, { EnolaSquatch }, { createCrew }, { TracerPool }] = await Promise.all([
    import('../src/beefrun/aircraft.js'),
    import('../src/beefrun/npc.js'),
    import('../src/enolasquatch/scenes/EnolaSquatch.js'),
    import('../src/enolasquatch/crew.js'),
    import('../src/core/combat/tracers.js'),
  ]);
  const beefAircraft = new Brushrunner();
  const lou = makeLou();
  const enolaAircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(enolaAircraft);
  const tracers = new TracerPool(enolaAircraft.group, 12);
  const runtimes = {
    beefrun: { aircraft: beefAircraft, handle: { mission: { lou } } },
    enola: { aircraft: enolaAircraft, handle: { crew, gunner: { tracers } } },
  };

  for (const spec of COCKPIT_VISUAL_EVIDENCE_SHOTS) {
    const rootsByOwner = resolveCockpitVisualOwnerRoots(runtimes[spec.scene], spec);
    const claimed = new Set();
    for (const requirement of spec.owners) {
      const roots = rootsByOwner[requirement.id];
      assert.equal(roots.length, requirement.expectedRootCount, `${spec.id}/${requirement.id} root count`);
      assert.deepEqual(roots.map(({ name }) => name || '(unnamed)').sort(),
        [...requirement.expectedRootNames].sort(), `${spec.id}/${requirement.id} root names`);
      const draws = roots.flatMap((root) => (
        cockpitEvidenceRenderableDescendants(root, requirement.selection)
      ));
      assert.equal(new Set(draws.map(({ uuid }) => uuid)).size, requirement.expectedObjectCount,
        `${spec.id}/${requirement.id} draw count`);
      for (const draw of draws) {
        assert.ok(!claimed.has(draw.uuid), `${spec.id} borrowed ${draw.name || draw.uuid}`);
        claimed.add(draw.uuid);
      }
    }
    const palette = buildCockpitRootPalette(spec, rootsByOwner);
    assert.equal(palette.length, spec.owners.reduce((sum, owner) => sum + owner.expectedRootCount, 0));
    assert.equal(new Set(palette.map(({ id }) => id)).size, palette.length);
    assert.equal(new Set(palette.map(({ color }) => color)).size, palette.length);
    assert.equal(new Set(palette.map(({ rootUuid }) => rootUuid)).size, palette.length);
  }
  tracers.dispose();
});

test('the real Enola dome and waist seams require exact pane surface coverage, not overlapping AABBs', async () => {
  const { EnolaSquatch } = await import('../src/enolasquatch/scenes/EnolaSquatch.js');
  const aircraft = new EnolaSquatch();
  const fits = measureCockpitAnnulusSurfaceFit(THREE, aircraft);
  assert.equal(fits.length, 4);
  for (const fit of fits) {
    assert.equal(fit.sampleCount, 225, `${fit.paneName} lost its fixed surface grid`);
    assert.equal(fit.exactAnnulus, true, `${fit.annulusName} is not the exact mesh`);
    assert.equal(fit.exactPane, true, `${fit.paneName} is not the exact mesh`);
    assert.equal(fit.transparentPane, true, `${fit.paneName} is not valid glazing`);
    assert.equal(fit.centreExactPaneHit, true, `${fit.paneName} misses its aperture centre`);
    assert.equal(fit.nakedSampleCount, 0, `${fit.paneName} leaves a naked surface sample`);
    assert.equal(fit.coveredSampleCount, fit.sampleCount,
      `${fit.paneName}/${fit.annulusName} does not cover its whole surface grid`);
    assert.ok(fit.paneSampleCount / fit.sampleCount >= 0.12,
      `${fit.paneName} covers too little of its own aperture`);
  }

  const opaqueCover = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.04, 0.9),
    new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 1 }),
  );
  opaqueCover.name = 'fuselage-roof-opaque-adversarial-cover';
  opaqueCover.position.set(0, 2.08, 3.1);
  aircraft.group.add(opaqueCover);
  const buried = measureCockpitAnnulusSurfaceFit(THREE, aircraft)
    .find(({ paneName }) => paneName === 'navigator-astrodome');
  assert.equal(buried.centreExactPaneHit, false,
    'a valid pane buried behind an opaque roof was credited as the first visible surface');
  assert.equal(buried.paneSampleCount, 0,
    'later pane ray hits were credited through an opaque roof cover');
  aircraft.group.remove(opaqueCover);
  opaqueCover.geometry.dispose();
  opaqueCover.material.dispose();

  const pane = aircraft.group.getObjectByName('navigator-astrodome');
  const annulus = aircraft.group.getObjectByName('fuselage-roof-astrodome-annulus');
  pane.scale.multiplyScalar(0.05);
  pane.position.y -= 0.05;
  aircraft.group.updateMatrixWorld(true);
  const paneBox = new THREE.Box3().setFromObject(pane);
  const annulusBox = new THREE.Box3().setFromObject(annulus);
  const aabbGap = new THREE.Vector3(
    Math.max(0, annulusBox.min.x - paneBox.max.x, paneBox.min.x - annulusBox.max.x),
    Math.max(0, annulusBox.min.y - paneBox.max.y, paneBox.min.y - annulusBox.max.y),
    Math.max(0, annulusBox.min.z - paneBox.max.z, paneBox.min.z - annulusBox.max.z),
  ).length();
  assert.equal(aabbGap, 0, 'the adversarial tiny pane no longer demonstrates the AABB false-green');
  const mutated = measureCockpitAnnulusSurfaceFit(THREE, aircraft)
    .find(({ paneName }) => paneName === 'navigator-astrodome');
  assert.ok(mutated.paneSampleCount / mutated.sampleCount < 0.12,
    'a tiny centre pane still passed the exact surface-coverage threshold');
});

test('real yoke joins require base-to-column contact and real door sweeps remain outside shell', async () => {
  const [{ Brushrunner }, { EnolaSquatch }] = await Promise.all([
    import('../src/beefrun/aircraft.js'),
    import('../src/enolasquatch/scenes/EnolaSquatch.js'),
  ]);
  for (const [scene, aircraft] of [
    ['beefrun', new Brushrunner()],
    ['enola', new EnolaSquatch()],
  ]) {
    const joins = measureCockpitYokeJoins(THREE, scene, aircraft);
    assert.equal(joins.length, 2, `${scene} does not expose both exact yoke joins`);
    assert.ok(joins.every(({ gapM }) => gapM <= 0.003),
      `${scene} has a detached authored yoke join: ${JSON.stringify(joins)}`);
    const assembly = scene === 'beefrun'
      ? aircraft.parts.yoke[0] : aircraft.parts.controlYokes[0].assembly;
    const base = scene === 'beefrun'
      ? assembly.children[0] : assembly.getObjectByName('control-yoke-base');
    base.position.x += 2;
    const detached = measureCockpitYokeJoins(THREE, scene, aircraft);
    assert.ok(detached.some(({ gapM }) => gapM > 0.003),
      `${scene} accepted a visibly detached yoke base as an intended join`);
    base.position.x -= 2;

    const baseline = measureCockpitDoorShellSweep(THREE, scene, aircraft);
    const authoredShellRoots = scene === 'beefrun'
      ? [aircraft.parts.sideShell, aircraft.parts.hull]
      : [aircraft.parts.fuselageShell];
    let authoredShellMeshCount = 0;
    for (const root of authoredShellRoots) root.traverse((object) => {
      if (object.isMesh && !/(?:cargo|crew)-door|jamb|frame|threshold|ladder/i.test(object.name ?? '')) {
        authoredShellMeshCount += 1;
      }
    });
    assert.equal(baseline.shellMeshCount, authoredShellMeshCount,
      `${scene} door proof omitted an authored fuselage-shell root`);
    assert.equal(baseline.sampleCount, 257, `${scene} door sweep was under-sampled`);
    assert.equal(baseline.currentIntrusionCount, 0, `${scene} door leaf starts inside shell`);
    assert.equal(baseline.sweptIntrusionCount, 0, `${scene} door sweep crosses shell`);
    const pivot = scene === 'beefrun' ? aircraft.parts.cargoDoor : aircraft.parts.crewDoorHinge;
    const leaf = scene === 'beefrun'
      ? pivot.getObjectByName('cargo-door-leaf') : aircraft.parts.crewDoor;
    const shell = scene === 'beefrun' ? aircraft.parts.sideShell : aircraft.parts.fuselageShell;
    aircraft.group.updateMatrixWorld(true);
    shell.updateWorldMatrix(true, false);
    const blocker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x111111 }),
    );
    blocker.name = 'fuselage-shell-adversarial-obstruction';
    blocker.position.copy(shell.worldToLocal(leaf.getWorldPosition(new THREE.Vector3())));
    shell.add(blocker);
    const obstructed = measureCockpitDoorShellSweep(THREE, scene, aircraft);
    assert.ok(obstructed.currentIntrusionCount > 0 || obstructed.sweptIntrusionCount > 0,
      `${scene} accepted a door leaf moving through an authored shell obstruction`);
    shell.remove(blocker);
    blocker.geometry.dispose();
    blocker.material.dispose();
  }
});

test('a capture run requires an explicit safe fresh label and an explicitly granted loopback port', (t) => {
  assert.throws(() => parseCockpitVisualEvidenceRun([]), /--label/);
  assert.throws(
    () => parseCockpitVisualEvidenceRun(['--label', '../retained', '--port', '55123']),
    /unsafe evidence label/,
  );
  assert.throws(
    () => parseCockpitVisualEvidenceRun(['--label', 'fresh-cockpits']),
    /--port/,
  );
  assert.throws(
    () => parseCockpitVisualEvidenceRun(['--label', 'fresh-cockpits', '--port', '80']),
    /unprivileged loopback port/,
  );

  const parsed = parseCockpitVisualEvidenceRun([
    '--label', 'cockpit-fresh-20260811t154500',
    '--port', '55123',
    '--out', 'docs/validation/2026-08-11/cockpit-visual',
  ]);
  assert.equal(parsed.label, 'cockpit-fresh-20260811t154500');
  assert.equal(parsed.port, 55123);
  assert.equal(parsed.baseUrl, 'http://127.0.0.1:55123');
  assert.match(parsed.outputDir, /docs[\\/]validation[\\/]2026-08-11[\\/]cockpit-visual$/);
  const dated = parseCockpitVisualEvidenceRun([
    '--label', 'fresh-proof', '--port', '55123',
  ]);
  assert.match(dated.outputDir, /docs[\\/]validation[\\/]2026-08-12[\\/]cockpit-visual$/);

  const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
  const container = fs.mkdtempSync(path.join(workspaceRoot, 'docs', 'validation', '.cockpit-output-link-'));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'squatch-cockpit-output-target-'));
  const junction = path.join(container, 'junction');
  fs.symlinkSync(target, junction, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => {
    try { fs.unlinkSync(junction); } catch { /* test may already have removed it */ }
    fs.rmSync(container, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  });
  assert.throws(
    () => parseCockpitVisualEvidenceRun([
      '--label', 'junction-proof', '--port', '55123', '--out', junction,
    ]),
    /unsafe.*(?:junction|reparse|symbolic)/i,
  );
  assert.deepEqual(fs.readdirSync(target), [], 'cockpit parser mutated a junction target');
});

test('the artifact helper binds exact screenshot bytes and measures real owner-mask pixels', () => {
  const image = rgbaPng(4, 2, [
    250, 250, 250, 255, 250, 250, 250, 255, 12, 12, 12, 255, 12, 12, 12, 255,
    250, 250, 250, 255, 250, 250, 250, 255, 12, 12, 12, 255, 12, 12, 12, 255,
  ]);
  const mask = rgbaPng(4, 2, [
    255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
    255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
  ]);

  const artifact = bindCockpitScreenshotArtifact(image, Buffer.from(image), 'proof.png');
  assert.equal(artifact.width, 4);
  assert.equal(artifact.height, 2);
  assert.equal(artifact.bytes, image.length);
  assert.equal(artifact.sha256, createHash('sha256').update(image).digest('hex'));
  assert.throws(
    () => bindCockpitScreenshotArtifact(image, Buffer.concat([image, Buffer.from([0])]), 'proof.png'),
    /differ from Playwright capture buffer/,
  );

  const proof = measureCockpitIdMask(image, mask, [
    { id: 'light', color: '#ff0000' },
    { id: 'dark', color: '#00ff00' },
  ]);
  assert.equal(proof.width, 4);
  assert.equal(proof.height, 2);
  assert.equal(proof.classifiedPixels, 8);
  assert.equal(proof.unclassifiedColoredPixels, 0);
  assert.deepEqual(proof.owners.map(({ id, visiblePixels }) => [id, visiblePixels]), [
    ['light', 4], ['dark', 4],
  ]);
  assert.deepEqual(proof.owners.map(({ largestComponentPixels }) => largestComponentPixels), [4, 4]);
  assert.deepEqual(proof.owners.map(({ largestComponentRatio }) => largestComponentRatio), [1, 1]);
  assert.ok(proof.owners.every(({ contrast }) => contrast > 0.5));

  const scatteredMask = rgbaPng(4, 2, [
    255, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255,
    0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255,
  ]);
  const scattered = measureCockpitIdMask(image, scatteredMask, [{ id: 'scatter', color: '#ff0000' }]);
  assert.deepEqual({
    visiblePixels: scattered.owners[0].visiblePixels,
    componentCount: scattered.owners[0].componentCount,
    largestComponentPixels: scattered.owners[0].largestComponentPixels,
    largestComponentRatio: scattered.owners[0].largestComponentRatio,
  }, { visiblePixels: 4, componentCount: 4, largestComponentPixels: 1, largestComponentRatio: 0.25 });

  const antialiasedMask = rgbaPng(4, 2, [
    64, 0, 0, 255, 128, 0, 0, 255, 0, 64, 0, 255, 0, 128, 0, 255,
    32, 0, 0, 255, 255, 0, 0, 255, 0, 32, 0, 255, 0, 255, 0, 255,
  ]);
  const antialiased = measureCockpitIdMask(image, antialiasedMask, [
    { id: 'red-msaa', color: '#ff0000' },
    { id: 'green-msaa', color: '#00ff00' },
  ]);
  assert.deepEqual(antialiased.owners.map(({ visiblePixels }) => visiblePixels), [4, 4]);
  assert.equal(antialiased.unclassifiedColoredPixels, 0,
    'valid ID-over-black MSAA edge pixels were treated as arbitrary colours');

  const rootProof = measureCockpitIdMask(image, mask, [
    { id: 'frames:root-a', ownerId: 'frames', ownerColor: '#123456',
      rootUuid: 'root-a', rootName: 'header', color: '#ff0000' },
    { id: 'frames:root-b', ownerId: 'frames', ownerColor: '#123456',
      rootUuid: 'root-b', rootName: 'sill', color: '#00ff00' },
  ]);
  assert.deepEqual(rootProof.owners.map(({ id, color, visiblePixels }) => (
    [id, color, visiblePixels]
  )), [['frames', '#123456', 8]]);
  assert.deepEqual(rootProof.roots.map(({ ownerId, rootUuid, rootName, visiblePixels }) => (
    [ownerId, rootUuid, rootName, visiblePixels]
  )), [
    ['frames', 'root-a', 'header', 4],
    ['frames', 'root-b', 'sill', 4],
  ]);
});

test('a shot passes only with exact capture bracketing, clean diagnostics, pixel owners, and geometry clearances', () => {
  const spec = COCKPIT_VISUAL_EVIDENCE_SHOTS[0];
  const capture = validShotCapture(spec);
  assert.equal(evaluateCockpitVisualShot(spec, capture, 'fresh-proof').ok, true);

  const drifted = clone(capture);
  drifted.after.camera.position[0] += 0.01;
  assert.equal(evaluateCockpitVisualShot(spec, drifted, 'fresh-proof').ok, false);

  const invisible = clone(capture);
  invisible.screenshot.pixelProof.owners[0].visiblePixels = 0;
  assert.equal(evaluateCockpitVisualShot(spec, invisible, 'fresh-proof').ok, false);

  const fragmented = clone(capture);
  fragmented.screenshot.pixelProof.owners[0].largestComponentPixels = 1;
  fragmented.screenshot.pixelProof.owners[0].largestComponentRatio = 0.001;
  assert.equal(evaluateCockpitVisualShot(spec, fragmented, 'fresh-proof').ok, false,
    'scattered owner-mask noise passed as a visible target');

  const duplicateOwner = clone(capture);
  duplicateOwner.before.subjects[spec.owners[1].id].objectUuids[0]
    = duplicateOwner.before.subjects[spec.owners[0].id].objectUuids[0];
  assert.equal(evaluateCockpitVisualShot(spec, duplicateOwner, 'fresh-proof').ok, false,
    'two semantic owners borrowed one runtime mesh UUID');

  const wrongOwner = clone(capture);
  wrongOwner.before.subjects[spec.owners[0].id].rootCount += 1;
  wrongOwner.before.subjects[spec.owners[0].id].rootUuids.push('wrong-root');
  wrongOwner.before.subjects[spec.owners[0].id].rootNames.push('wrong-owner-name');
  assert.equal(evaluateCockpitVisualShot(spec, wrongOwner, 'fresh-proof').ok, false,
    'wrong owner cardinality passed the manifest policy');

  const hiddenRoot = clone(capture);
  hiddenRoot.before.subjects[spec.owners[0].id].roots[0].visibleObjectCount = 0;
  hiddenRoot.pngBinding = clone(hiddenRoot.before);
  hiddenRoot.after = clone(hiddenRoot.before);
  hiddenRoot.screenshot.pixelProof.maskBinding = clone(hiddenRoot.before);
  hiddenRoot.screenshot.pixelProof.restoredBinding = clone(hiddenRoot.before);
  assert.equal(evaluateCockpitVisualShot(spec, hiddenRoot, 'fresh-proof').ok, false,
    'one visible draw allowed hidden semantic roots to borrow another root\'s proof');

  const borrowedRootPixels = clone(capture);
  borrowedRootPixels.screenshot.pixelProof.roots[0].visiblePixels = 0;
  borrowedRootPixels.screenshot.pixelProof.roots[0].componentCount = 0;
  borrowedRootPixels.screenshot.pixelProof.roots[0].largestComponentPixels = 0;
  borrowedRootPixels.screenshot.pixelProof.roots[0].largestComponentRatio = 0;
  assert.equal(evaluateCockpitVisualShot(spec, borrowedRootPixels, 'fresh-proof').checks.rootPixels, false,
    'one semantic root borrowed its sibling roots\' owner-wide pixels');

  const noisy = clone(capture);
  noisy.runtime.contextErrors.push('page crashed');
  assert.equal(evaluateCockpitVisualShot(spec, noisy, 'fresh-proof').ok, false);

  const renderAba = clone(capture);
  renderAba.renderReceipts.mask.serial += 2;
  renderAba.renderReceipts.mask.sourceFingerprint = 'a'.repeat(64);
  assert.equal(evaluateCockpitVisualShot(spec, renderAba, 'fresh-proof').checks.atomicRender, false,
    'an unbound A to B to A normal/mask sequence passed the draw receipts');

  const liveCallback = clone(capture);
  liveCallback.after.scheduler.pendingTimers = 1;
  assert.equal(evaluateCockpitVisualShot(spec, liveCallback, 'fresh-proof').checks.callbackFreeze, false,
    'a pending timer survived the evidence boundary');

  const enolaSpec = COCKPIT_VISUAL_EVIDENCE_SHOTS.find(({ scene }) => scene === 'enola');
  const disabledPostfx = validShotCapture(enolaSpec);
  disabledPostfx.renderReceipts.normal.postfx.enabled = false;
  assert.equal(evaluateCockpitVisualShot(enolaSpec, disabledPostfx, 'fresh-proof').checks.atomicRender, false,
    'a raw fallback was self-labelled public-postfx while public postfx was disabled');
  const missingComposer = validShotCapture(enolaSpec);
  missingComposer.renderReceipts.restored.postfx.composerPresent = false;
  assert.equal(evaluateCockpitVisualShot(enolaSpec, missingComposer, 'fresh-proof').checks.atomicRender, false,
    'a raw fallback passed without the public composer');
  const missingBloomPass = validShotCapture(enolaSpec);
  missingBloomPass.renderReceipts.normal.postfx.bloomPassAttached = false;
  assert.equal(evaluateCockpitVisualShot(enolaSpec, missingBloomPass, 'fresh-proof').checks.atomicRender, false,
    'a public composer passed without its intended bloom pass');

  const unsupported = clone(capture);
  unsupported.before.geometry.supports.unsupported.push('cockpit-footwell-leg-2');
  unsupported.pngBinding.geometry.supports.unsupported.push('cockpit-footwell-leg-2');
  unsupported.after.geometry.supports.unsupported.push('cockpit-footwell-leg-2');
  unsupported.screenshot.pixelProof.maskBinding.geometry.supports.unsupported.push('cockpit-footwell-leg-2');
  unsupported.screenshot.pixelProof.restoredBinding.geometry.supports.unsupported.push('cockpit-footwell-leg-2');
  assert.equal(evaluateCockpitVisualShot(spec, unsupported, 'fresh-proof').ok, false);

  const blockedAperture = clone(capture);
  for (const binding of [
    blockedAperture.before,
    blockedAperture.pngBinding,
    blockedAperture.after,
    blockedAperture.screenshot.pixelProof.maskBinding,
    blockedAperture.screenshot.pixelProof.restoredBinding,
  ]) binding.geometry.shell.apertures[0].clearRayCount = 0;
  assert.equal(evaluateCockpitVisualShot(spec, blockedAperture, 'fresh-proof').ok, false,
    'opaque-looking aperture pixels passed without a real clear ray path');

  const shellSpec = COCKPIT_VISUAL_EVIDENCE_SHOTS
    .find(({ id }) => id === 'beef-closed-shell-side');
  const breached = validShotCapture(shellSpec);
  for (const binding of [
    breached.before,
    breached.pngBinding,
    breached.after,
    breached.screenshot.pixelProof.maskBinding,
    breached.screenshot.pixelProof.restoredBinding,
  ]) binding.geometry.collision.sideCapsuleLocalX = 1.1;
  assert.equal(evaluateCockpitVisualShot(shellSpec, breached, 'fresh-proof').ok, false,
    'a capsule crossing the closed Beef side shell was accepted');
});

test('cover declarations are executable policies and cannot pass with missing, failing, or unknown raw measurements', () => {
  const spec = COCKPIT_VISUAL_EVIDENCE_SHOTS.find(({ id }) => id === 'enola-rear-gun-neutral');
  const valid = validShotCapture(spec);
  assert.equal(evaluateCockpitVisualShot(spec, valid, 'fresh-proof').ok, true);

  const gateId = COCKPIT_VISUAL_SEAM_POLICIES[spec.covers[0]].numericGates[0];
  const binding = COCKPIT_VISUAL_SEMANTIC_GATE_POLICIES[gateId].bindings[0];
  const missing = clone(valid);
  delete missing.before.measurements[binding.measurement];
  missing.pngBinding = clone(missing.before);
  missing.after = clone(missing.before);
  missing.screenshot.pixelProof.maskBinding = clone(missing.before);
  missing.screenshot.pixelProof.restoredBinding = clone(missing.before);
  assert.equal(evaluateCockpitVisualShot(spec, missing, 'fresh-proof').checks.seamPolicies, false);

  const falseGate = clone(valid);
  falseGate.before.measurements[binding.measurement] = binding.comparator === 'lte'
    ? binding.threshold + 1 : binding.threshold - 1;
  falseGate.pngBinding = clone(falseGate.before);
  falseGate.after = clone(falseGate.before);
  falseGate.screenshot.pixelProof.maskBinding = clone(falseGate.before);
  falseGate.screenshot.pixelProof.restoredBinding = clone(falseGate.before);
  assert.equal(evaluateCockpitVisualShot(spec, falseGate, 'fresh-proof').checks.seamPolicies, false);

  const unknown = { ...spec, covers: ['enola:not-a-real-seam'] };
  assert.equal(evaluateCockpitVisualShot(unknown, valid, 'fresh-proof').checks.seamPolicies, false);
});

test('semantic gates bind contract-owned typed thresholds to raw runtime measurements', () => {
  const gateIds = [...new Set(Object.values(COCKPIT_VISUAL_SEAM_POLICIES)
    .flatMap(({ numericGates }) => numericGates))].sort();
  assert.deepEqual(Object.keys(COCKPIT_VISUAL_SEMANTIC_GATE_POLICIES).sort(), gateIds);
  for (const [id, policy] of Object.entries(COCKPIT_VISUAL_SEMANTIC_GATE_POLICIES)) {
    assert.equal(policy.id, id);
    assert.ok(Object.isFrozen(policy));
    assert.ok(Object.isFrozen(policy.bindings));
    assert.ok(policy.bindings.length > 0, `${id} has no raw measurement binding`);
    for (const binding of policy.bindings) {
      assert.match(binding.measurement, /^[a-z][a-z0-9.-]+$/);
      assert.ok(['gte', 'lte', 'eq'].includes(binding.comparator));
      assert.ok(Number.isFinite(binding.threshold));
      assert.match(binding.unit, /^[a-z][a-z0-9-]*$/);
      assert.equal('passed' in binding, false);
      assert.equal('minimum' in binding, false);
    }
  }

  const spec = COCKPIT_VISUAL_EVIDENCE_SHOTS.find(({ id }) => id === 'enola-rear-gun-neutral');
  const capture = validShotCapture(spec);
  const gateId = spec.covers.flatMap((cover) => (
    COCKPIT_VISUAL_SEAM_POLICIES[cover].numericGates
  )).find((id) => COCKPIT_VISUAL_SEMANTIC_GATE_POLICIES[id].bindings.length > 0);
  const binding = COCKPIT_VISUAL_SEMANTIC_GATE_POLICIES[gateId].bindings[0];
  for (const state of [
    capture.before,
    capture.pngBinding,
    capture.after,
    capture.screenshot.pixelProof.maskBinding,
    capture.screenshot.pixelProof.restoredBinding,
  ]) {
    delete state.measurements?.[binding.measurement];
    state.semanticGates = Object.fromEntries(spec.covers.flatMap((cover) => (
      COCKPIT_VISUAL_SEAM_POLICIES[cover].numericGates.map((id) => [id, {
        passed: true, measured: 1, minimum: 0,
      }])
    )));
  }
  assert.equal(evaluateCockpitVisualShot(spec, capture, 'fresh-proof').checks.seamPolicies, false,
    'page-authored pass/minimum fields bypassed the contract-owned raw binding');
});

test('the runner reserves its label before launch and removes all residue after a capture failure', async (t) => {
  const label = `cockpit-failure-${process.pid}-${Date.now()}`;
  const relativeOut = `.tmp/${label}`;
  const outputDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)), relativeOut);
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const calls = [];
  await assert.rejects(
    captureCockpitVisualEvidence([
      '--label', label,
      '--port', '55123',
      '--out', relativeOut,
    ], {}, {
      bootstrapProof: 'test-injected',
      createServer(options) {
        calls.push('create-server');
        assert.equal(fs.existsSync(path.join(options.outputDir, `.${label}-transaction.json`)), true);
        return { listening: false };
      },
      async listenServer() { calls.push('listen-server'); },
      async launchBrowser() { calls.push('launch-browser'); return { fake: true }; },
      async captureShot() { calls.push('capture-shot'); throw new Error('injected cockpit shot failure'); },
      async closeLifecycle() { calls.push('close-lifecycle'); },
    }),
    /injected cockpit shot failure/,
  );
  assert.deepEqual(calls, [
    'create-server', 'listen-server', 'launch-browser', 'capture-shot', 'close-lifecycle',
  ]);
  assert.deepEqual(fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [], []);
  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('the runner releases its transaction when source snapshotting fails before server creation', async (t) => {
  const label = `cockpit-snapshot-failure-${process.pid}-${Date.now()}`;
  const relativeOut = `.tmp/${label}`;
  const outputDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)), relativeOut);
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  let serverCreated = false;
  await assert.rejects(captureCockpitVisualEvidence([
    '--label', label, '--port', '55125', '--out', relativeOut,
  ], {}, {
    bootstrapProof: 'test-injected',
    snapshotSources() { throw new Error('injected snapshot failure'); },
    createServer() { serverCreated = true; throw new Error('unexpected server creation'); },
  }), /injected snapshot failure/);
  assert.equal(serverCreated, false);
  assert.deepEqual(fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [], []);
  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('the runner rejects a staged PNG changed after verification while runtime resources close', async (t) => {
  const label = `cockpit-close-swap-${process.pid}-${Date.now()}`;
  const relativeOut = `.tmp/${label}`;
  const outputDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)), relativeOut);
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const sourceSnapshot = currentCockpitVisualEvidenceSourceIdentities();
  let firstArtifactPath = null;
  let closeCount = 0;
  await assert.rejects(captureCockpitVisualEvidence([
    '--label', label, '--port', '55126', '--out', relativeOut,
  ], {}, {
    bootstrapProof: 'test-injected',
    createServer() { return { listening: false }; },
    async listenServer() {},
    async launchBrowser() { return { fake: true }; },
    async captureShot({ spec, transaction }) {
      const capture = validShotCapture(spec, label);
      capture.baseUrl = 'http://127.0.0.1:55126';
      capture.served.launchDocument = `${capture.baseUrl}/${spec.page}`;
      attachFakeServedProvenance(capture, sourceSnapshot, spec);
      bindFakeArtifactBytes(capture, transaction);
      firstArtifactPath ??= transaction.stagePath(capture.screenshot.file);
      return capture;
    },
    async closeLifecycle() {
      if (closeCount++ === 0) fs.writeFileSync(firstArtifactPath, Buffer.from('substituted PNG B'));
    },
  }), /staged evidence artifact differs from its capture binding/i);
  assert.deepEqual(fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [], [],
    'post-verification byte swap left transaction residue');
});

test('the runner closes runtime resources then publishes all fresh captures and its ledger atomically', async (t) => {
  const label = `cockpit-success-${process.pid}-${Date.now()}`;
  const relativeOut = `.tmp/${label}`;
  const outputDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)), relativeOut);
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const calls = [];
  const sourceSnapshot = currentCockpitVisualEvidenceSourceIdentities();
  const result = await captureCockpitVisualEvidence([
    '--label', label,
    '--port', '55124',
    '--out', relativeOut,
  ], {}, {
    bootstrapProof: 'test-injected',
    createServer() { calls.push('create-server'); return { listening: false }; },
    async listenServer() { calls.push('listen-server'); },
    async launchBrowser() { calls.push('launch-browser'); return { fake: true }; },
    async captureShot({ spec, transaction }) {
      calls.push(`capture:${spec.id}`);
      const capture = validShotCapture(spec, label);
      capture.baseUrl = 'http://127.0.0.1:55124';
      capture.served.launchDocument = `${capture.baseUrl}/${spec.page}`;
      attachFakeServedProvenance(capture, sourceSnapshot, spec);
      bindFakeArtifactBytes(capture, transaction);
      const gate = evaluateCockpitVisualShot(spec, capture, label);
      assert.equal(gate.ok, true, `${spec.id}: ${gate.errors.join(', ')}`);
      return capture;
    },
    async closeLifecycle() { calls.push('close-lifecycle'); },
  });
  assert.equal(calls.at(-1), 'close-lifecycle');
  assert.equal(calls.filter((entry) => entry.startsWith('capture:')).length,
    COCKPIT_VISUAL_EVIDENCE_SHOTS.length);
  assert.equal(result.evidence.checks.allPassed, true);
  assert.equal(result.evidence.shots.length, COCKPIT_VISUAL_EVIDENCE_SHOTS.length);
  const published = fs.readdirSync(outputDir).sort();
  assert.equal(published.length, COCKPIT_VISUAL_EVIDENCE_SHOTS.length * 2 + 1);
  assert.ok(published.includes(`${label}-evidence.json`));
  assert.ok(published.every((name) => !name.startsWith('.')));
  const ledger = JSON.parse(fs.readFileSync(path.join(outputDir, `${label}-evidence.json`), 'utf8'));
  assert.equal(ledger.schema, 'squatch-cockpit-visual-evidence/v1');
  assert.equal(ledger.sourceFreeze.startSha256, ledger.sourceFreeze.endSha256);
  await assert.rejects(
    captureCockpitVisualEvidence([
      '--label', label, '--port', '55124', '--out', relativeOut,
    ], {}, { createServer() { throw new Error('must not create server for stale label'); } }),
    /evidence label already exists/,
  );
  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('the static evidence server resolver serves only exact workspace files and rejects traversal', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  assert.deepEqual(resolveCockpitStaticRequest(root, '/beefrun.html?preview=1'), {
    absoluteFile: path.join(root, 'beefrun.html'),
    file: 'beefrun.html',
  });
  assert.deepEqual(resolveCockpitStaticRequest(root, '/src/enolasquatch/main.js'), {
    absoluteFile: path.join(root, 'src', 'enolasquatch', 'main.js'),
    file: 'src/enolasquatch/main.js',
  });
  assert.throws(() => resolveCockpitStaticRequest(root, '/'), /requires an explicit file/);
  assert.throws(() => resolveCockpitStaticRequest(root, '/..%2fpackage.json'), /escaped workspace/);
  assert.throws(() => resolveCockpitStaticRequest(root, '/%00bad.js'), /unsafe static request/);
});

test('the static server serves capture-start immutable source bytes without opening a port', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const immutable = Buffer.from('capture-start-A');
  const server = createCockpitVisualEvidenceServer({
    workspaceRoot: root,
    immutableSourceBytes: new Map([['src/style.css', immutable]]),
  });
  const result = await new Promise((resolve) => {
    const response = {
      status: null,
      headers: null,
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(bytes) {
        resolve({ status: this.status, headers: this.headers, bytes: Buffer.from(bytes ?? []) });
      },
    };
    server.emit('request', { method: 'GET', url: '/src/style.css' }, response);
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.bytes, immutable);
  assert.equal(result.headers['X-Cockpit-Source-Sha256'],
    createHash('sha256').update(immutable).digest('hex'));

  const omitted = await new Promise((resolve) => {
    const response = {
      status: null,
      writeHead(status) { this.status = status; },
      end(bytes) { resolve({ status: this.status, bytes: Buffer.from(bytes ?? []) }); },
    };
    server.emit('request', { method: 'GET', url: '/assets/art/logo-crest.png' }, response);
  });
  assert.equal(omitted.status, 404,
    'the immutable server fell through to a live asset that was outside its capture-start map');
});

test('the served-response tracker re-snapshots a growing request set and seals only after quiescence', async () => {
  const page = new EventEmitter();
  page.waitForTimeout = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const baseUrl = 'http://127.0.0.1:55123';
  const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
  const bytesA = Buffer.from('document-A');
  const bytesB = Buffer.from('late-media-B');
  const immutableSourceBytes = new Map([
    ['beefrun.html', bytesA],
    ['assets/music/late.ogg', bytesB],
  ]);
  const request = (file, resourceType) => ({
    url: () => `${baseUrl}/${file}`,
    resourceType: () => resourceType,
    failure: () => null,
  });
  const requestA = request('beefrun.html', 'document');
  const requestB = request('assets/music/late.ogg', 'media');
  const response = (requestObject, file, bytes, body) => ({
    request: () => requestObject,
    url: () => `${baseUrl}/${file}`,
    status: () => 200,
    headers: () => ({
      'x-cockpit-source-file': file,
      'x-cockpit-source-bytes': String(bytes.length),
      'x-cockpit-source-sha256': createHash('sha256').update(bytes).digest('hex'),
    }),
    body,
  });
  const runtime = { requestFailures: [] };
  const settle = installCockpitServedResponseTracker(page, {
    baseUrl, workspaceRoot, immutableSourceBytes,
  }, runtime, { quietMs: 2, timeoutMs: 1000 });
  page.emit('request', requestA);
  page.emit('response', response(requestA, 'beefrun.html', bytesA, async () => {
    page.emit('request', requestB);
    page.emit('response', response(requestB, 'assets/music/late.ogg', bytesB, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return bytesB;
    }));
    page.emit('requestfinished', requestB);
    return bytesA;
  }));
  page.emit('requestfinished', requestA);
  const served = await settle(`${baseUrl}/beefrun.html?preview=1`);
  assert.deepEqual(served.entries.map(({ file, resourceType }) => ({ file, resourceType })), [
    { file: 'assets/music/late.ogg', resourceType: 'media' },
    { file: 'beefrun.html', resourceType: 'document' },
  ]);
  assert.deepEqual({
    sealed: served.quiescence.sealed,
    timedOut: served.quiescence.timedOut,
    requestCount: served.quiescence.requestCount,
    responseCount: served.quiescence.responseCount,
    finishedCount: served.quiescence.finishedCount,
    pendingCount: served.quiescence.pendingCount,
    bodyPendingCount: served.quiescence.bodyPendingCount,
  }, {
    sealed: true, timedOut: false, requestCount: 2, responseCount: 2,
    finishedCount: 2, pendingCount: 0, bodyPendingCount: 0,
  });
  assert.match(served.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(runtime.requestFailures, []);
  page.emit('request', request('assets/faces/too-late.png', 'image'));
  assert.match(runtime.requestFailures.at(-1), /after quiescence/);
});

test('the pre-module scheduler cancels every callback class and rejects post-freeze work', () => {
  let nextHandle = 1;
  const pending = { timers: new Map(), intervals: new Map(), frames: new Map() };
  const root = {
    setTimeout(callback) { const id = nextHandle++; pending.timers.set(id, callback); return id; },
    clearTimeout(id) { pending.timers.delete(id); },
    setInterval(callback) { const id = nextHandle++; pending.intervals.set(id, callback); return id; },
    clearInterval(id) { pending.intervals.delete(id); },
    requestAnimationFrame(callback) { const id = nextHandle++; pending.frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { pending.frames.delete(id); },
  };
  const scheduler = installCockpitEvidenceScheduler(root);
  let fired = 0;
  root.setTimeout(() => { fired += 1; }, 1);
  root.setInterval(() => { fired += 1; }, 1);
  root.requestAnimationFrame(() => { fired += 1; });
  assert.deepEqual(scheduler.snapshot(), {
    installedBeforeModules: true, frozen: false, generation: 0,
    pendingTimers: 1, pendingIntervals: 1, pendingAnimationFrames: 1,
  });
  assert.deepEqual(scheduler.freeze(), {
    installedBeforeModules: true, frozen: true, generation: 1,
    pendingTimers: 0, pendingIntervals: 0, pendingAnimationFrames: 0,
  });
  assert.deepEqual([...pending.timers, ...pending.intervals, ...pending.frames], []);
  assert.equal(root.setTimeout(() => { fired += 1; }, 1), 0);
  assert.equal(root.setInterval(() => { fired += 1; }, 1), 0);
  assert.equal(root.requestAnimationFrame(() => { fired += 1; }), 0);
  assert.equal(fired, 0);
});

test('the immutable bootstrap materializes the exact closure before authoritative modules execute', async (t) => {
  const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
  const stagingParent = path.join(workspaceRoot, '.tmp');
  fs.mkdirSync(stagingParent, { recursive: true });
  const destination = fs.mkdtempSync(path.join(stagingParent, 'cockpit-bootstrap-test-'));
  t.after(() => {
    const resolved = path.resolve(destination);
    assert.ok(resolved.startsWith(`${path.resolve(stagingParent)}${path.sep}`));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const bootstrap = materializeCockpitImmutableBootstrap(workspaceRoot, destination, {
    snapshotSources: snapshotCockpitVisualEvidenceSources,
  });
  assert.equal(bootstrap.manifest.schema, 'squatch-cockpit-immutable-bootstrap/v1');
  assert.ok(bootstrap.manifest.materializedFiles >= 100);
  assert.equal(fs.existsSync(path.join(destination, 'assets/art/enola-squatch-nose-art.webp')), true);
  assert.equal(fs.existsSync(path.join(destination, 'vendor/three.module.min.js')), true);
  const stagedContractUrl = `${pathToFileURL(path.join(
    destination, 'tools/cockpit-visual-evidence-contract.mjs',
  )).href}?bootstrap-test=${Date.now()}`;
  const stagedContract = await import(stagedContractUrl);
  const stagedIdentity = stagedContract.currentCockpitVisualEvidenceSourceIdentities(destination);
  assert.deepEqual(stagedIdentity, bootstrap.manifest.identity,
    'the worker closure differs from the planner bytes it will execute');
  const stagedCaptureBytes = fs.readFileSync(bootstrap.worker);
  const captureIdentity = stagedIdentity.tools
    .find(({ file }) => file === 'tools/capture-cockpit-visual-evidence.mjs');
  assert.equal(createHash('sha256').update(stagedCaptureBytes).digest('hex'), captureIdentity.sha256);

  fs.appendFileSync(path.join(destination, 'assets/art/logo-crest.png'), Buffer.from([0]));
  assert.throws(() => stagedContract.assertCockpitVisualEvidenceSourcesUnchanged(
    stagedIdentity, destination,
  ), /changed during capture/, 'a mid-run immutable-worker asset mutation escaped the freeze check');
});

test('the default immutable bootstrap planner can import every staged contract dependency', (t) => {
  const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
  const stagingParent = path.join(workspaceRoot, '.tmp');
  fs.mkdirSync(stagingParent, { recursive: true });
  const destination = fs.mkdtempSync(path.join(stagingParent, 'cockpit-bootstrap-default-'));
  t.after(() => fs.rmSync(destination, { recursive: true, force: true }));

  const bootstrap = materializeCockpitImmutableBootstrap(workspaceRoot, destination);
  assert.equal(bootstrap.manifest.schema, 'squatch-cockpit-immutable-bootstrap/v1');
  assert.equal(fs.existsSync(path.join(destination, 'tools/evidence-directory-transaction.mjs')), true);
  assert.equal(bootstrap.manifest.identity.tools.some(
    ({ file }) => file === 'tools/evidence-directory-transaction.mjs',
  ), true);
});

test('the page adapter resolves the real builders through only their documented public runtime handles', async () => {
  const [{ Brushrunner }, { EnolaSquatch }, { CameraManager }] = await Promise.all([
    import('../src/beefrun/aircraft.js'),
    import('../src/enolasquatch/scenes/EnolaSquatch.js'),
    import('../src/beefrun/cameras.js'),
  ]);
  const makeRuntime = (aircraft) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(66, 1440 / 900, 0.1, 1000);
    const cameras = new CameraManager(camera);
    const renderer = { domElement: { width: 1440, height: 900 } };
    scene.add(aircraft.group);
    return { scene, camera, cameras, renderer, aircraft };
  };
  const beef = makeRuntime(new Brushrunner());
  const enola = makeRuntime(new EnolaSquatch());
  const root = { __beefrun: beef, __enolaSquatch: enola, privateCockpit: { scene: {} } };
  for (const [scene, handle, handleName] of [
    ['beefrun', beef, 'window.__beefrun'],
    ['enola', enola, 'window.__enolaSquatch'],
  ]) {
    const runtime = resolveCockpitRuntime(root, scene);
    assert.equal(runtime.handle, handle);
    assert.equal(runtime.handleName, handleName);
    assert.equal(runtime.scene, handle.scene);
    assert.equal(runtime.camera, handle.camera);
    assert.equal(runtime.camera, handle.cameras.camera);
    assert.equal(runtime.renderer, handle.renderer);
    assert.equal(runtime.aircraft, handle.aircraft);
    assert.equal(runtime.aircraft.group.parent, runtime.scene);
  }
  assert.throws(() => resolveCockpitRuntime({ privateCockpit: root.privateCockpit }, 'beefrun'),
    /public runtime handle is unavailable/);
  assert.throws(() => resolveCockpitRuntime({
    __beefrun: { ...beef, camera: undefined, player: { camera: beef.camera } },
  }, 'beefrun'), /required real runtime surface/,
  'a private/player camera was accepted in place of the canonical public camera');
  assert.throws(() => resolveCockpitRuntime(root, 'unknown'), /unsupported cockpit evidence scene/);
});

test('the injected page API serializes its full dependency closure without constructing substitute scene geometry', async () => {
  const source = installCockpitVisualEvidencePageApi.toString();
  assert.doesNotMatch(source,
    /new\s+THREE\.(?:Scene|PerspectiveCamera|OrthographicCamera|Mesh|Group|BoxGeometry|PlaneGeometry)\s*\(/);
  assert.match(source, /prepare/);
  assert.match(source, /capture/);
  assert.match(source, /beginOwnerMask/);
  assert.match(source, /endOwnerMask/);
  assert.match(source, /activeLoad[\s\S]*setDoor/);
  assert.match(source, /setCrewDoorOpen/);
  assert.match(source, /gunner\.look/);
  const serialize = (fn) => (0, eval)(`(${fn.toString()})`);
  const api = await serialize(installCockpitVisualEvidencePageApi)(
    serialize(resolveCockpitRuntime),
    serialize(cockpitEvidenceDrawPolicy),
    serialize(resolveCockpitVisualOwnerRoots),
    serialize(measureCockpitAnnulusSurfaceFit),
    serialize(buildCockpitRootPalette),
    serialize(measureCockpitYokeJoins),
    serialize(measureCockpitDoorShellSweep),
  );
  assert.deepEqual(Object.keys(api).sort(), [
    'beginOwnerMask', 'capture', 'endOwnerMask', 'freeze', 'prepare', 'renderNormal',
  ]);
});

test('the page adapter emits raw contract-bound measurements instead of grading its own semantic gates', () => {
  const source = installCockpitVisualEvidencePageApi.toString();
  assert.match(source, /function measurementLedger\(/);
  assert.match(source, /measurements:\s*measurementLedger\(/);
  assert.doesNotMatch(source, /semanticGates\s*:/);
  assert.doesNotMatch(source, /passed\s*:/);
});

test('normal Enola evidence uses the public post-processing path while only the ID mask renders raw', () => {
  const source = installCockpitVisualEvidencePageApi.toString();
  assert.match(source, /runtime\.handle\.postfx\.render\(\)/);
  assert.match(source, /postfx\.ready\s*\?\s*'public-postfx'\s*:\s*'public-postfx-raw-fallback'/);
  assert.match(source, /render\(active\.runtime, 'mask'\)/);
  assert.doesNotMatch(source, /spec\.scene === 'enola'[\s\S]{0,220}runtime\.renderer\.render/);
  assert.match(captureCockpitVisualShot.toString(), /:not\(#enola-combat\)/,
    'the public rear-gun reticle was removed from the normal evidence frame');
});

test('owner-mask draw policy preserves effective production draw and material semantics', () => {
  const material = (overrides = {}) => ({
    visible: true,
    transparent: false,
    opacity: 1,
    alphaTest: 0,
    colorWrite: true,
    depthTest: true,
    depthWrite: true,
    polygonOffset: false,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 0,
    ...overrides,
  });
  const mesh = (materials, geometry = {}) => ({
    isMesh: true,
    visible: true,
    parent: { visible: true, parent: null },
    material: materials,
    geometry: {
      index: { count: 12 },
      attributes: { position: { count: 12 } },
      drawRange: { start: 0, count: Number.POSITIVE_INFINITY },
      groups: [],
      ...geometry,
    },
  });

  const transparent = cockpitEvidenceDrawPolicy(mesh(material({ transparent: true, opacity: 0.4 })));
  assert.equal(transparent.renderable, true);
  assert.equal(transparent.slots[0].transparent, true);
  assert.equal(transparent.slots[0].effectiveOpacity, 0.4);

  const unusedSlot = cockpitEvidenceDrawPolicy(mesh([
    material(), material({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 }),
  ], { groups: [{ start: 0, count: 6, materialIndex: 0 }] }));
  assert.deepEqual(unusedSlot.slots.map(({ active }) => active), [true, false]);

  const cutout = cockpitEvidenceDrawPolicy(mesh(material({
    transparent: true,
    opacity: 0.8,
    alphaTest: 0.35,
    map: { id: 'rgba-map' },
    alphaMap: { id: 'alpha-map' },
  })));
  assert.equal(cutout.slots[0].preserveAlphaCoverage, true);
  assert.equal(cutout.slots[0].alphaTest, 0.35);

  const zeroDraw = cockpitEvidenceDrawPolicy(mesh(material(), {
    drawRange: { start: 0, count: 0 },
  }));
  assert.equal(zeroDraw.renderable, false);

  const offset = cockpitEvidenceDrawPolicy(mesh(material({
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: 2,
  })));
  assert.deepEqual({
    polygonOffset: offset.slots[0].polygonOffset,
    polygonOffsetFactor: offset.slots[0].polygonOffsetFactor,
    polygonOffsetUnits: offset.slots[0].polygonOffsetUnits,
  }, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: 2 });

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0.7 }));
  const points = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0)]),
    new THREE.PointsMaterial({ size: 3 }),
  );
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0),
    ]),
    new THREE.LineBasicMaterial(),
  );
  assert.equal(cockpitEvidenceDrawPolicy(sprite).renderable, true);
  assert.equal(cockpitEvidenceDrawPolicy(points).renderable, true);
  assert.equal(cockpitEvidenceDrawPolicy(line).renderable, true);
  const hiddenParent = new THREE.Group();
  hiddenParent.visible = false;
  hiddenParent.add(sprite);
  assert.equal(cockpitEvidenceDrawPolicy(sprite).renderable, false,
    'the ID pass resurrected a production-hidden Sprite/name tag');

  const source = installCockpitVisualEvidencePageApi.toString();
  assert.doesNotMatch(source, /new THREE\.ShaderMaterial/);
  assert.match(source, /new THREE\.MeshBasicMaterial/);
  assert.match(source, /new THREE\.SpriteMaterial/);
  assert.match(source, /new THREE\.PointsMaterial/);
  assert.match(source, /new THREE\.LineBasicMaterial/);
  assert.match(source, /map:\s*preserveAlphaCoverage/);
  assert.match(source, /alphaMap:\s*preserveAlphaCoverage/);
  assert.match(source, /onBeforeCompile/);
  assert.match(source, /diffuseColor\.rgb = cockpitEvidenceIdColor/);
  assert.match(source, /customProgramCacheKey/);
  assert.match(source, /polygonOffsetFactor/);
  assert.match(source, /drawPolicy\(mesh\)/);
  assert.doesNotMatch(source, /mesh\.renderOrder\s*=/);
  assert.match(source, /Raycaster/);
  assert.match(source, /clearRayCount/);
  assert.match(source, /frameRayHitCount/);
  assert.match(source, /transparentPixelsCredited/);
});

test('stock owner-mask materials retain real instancing, skinning, and morph deformation contracts', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const instances = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 3);
  instances.count = 2;
  assert.deepEqual(cockpitEvidenceDeformationContract(instances), {
    instanced: true,
    instanceCount: 2,
    skinned: false,
    morphTargets: false,
    morphNormals: false,
    morphTargetsRelative: false,
    morphInfluenceCount: 0,
  });

  const skinnedGeometry = new THREE.BoxGeometry(1, 1, 1);
  const position = skinnedGeometry.attributes.position;
  const skinIndices = new Uint16Array(position.count * 4);
  const skinWeights = new Float32Array(position.count * 4);
  for (let index = 0; index < position.count; index += 1) skinWeights[index * 4] = 1;
  skinnedGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  skinnedGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  skinnedGeometry.morphAttributes.position = [position.clone()];
  skinnedGeometry.morphAttributes.normal = [skinnedGeometry.attributes.normal.clone()];
  skinnedGeometry.morphTargetsRelative = true;
  const skinned = new THREE.SkinnedMesh(skinnedGeometry, new THREE.MeshBasicMaterial());
  skinned.updateMorphTargets();
  assert.deepEqual(cockpitEvidenceDeformationContract(skinned), {
    instanced: false,
    instanceCount: 0,
    skinned: true,
    morphTargets: true,
    morphNormals: true,
    morphTargetsRelative: true,
    morphInfluenceCount: 1,
  });

  const source = installCockpitVisualEvidencePageApi.toString();
  assert.doesNotMatch(source, /vertexShader\s*:/);
  assert.match(source, /production vertex path/);
});

test('source provenance binds every harness component and both public cockpit runtime surfaces', () => {
  const snapshot = currentCockpitVisualEvidenceSourceIdentities();
  assert.deepEqual(snapshot.tools.map(({ file }) => file), [
    'tools/capture-cockpit-visual-evidence.mjs',
    'tools/cockpit-visual-evidence-contract.mjs',
    'tools/cockpit-visual-page-api.mjs',
    'tools/cockpit-visual-pixel-proof.mjs',
    'tools/evidence-directory-transaction.mjs',
    'tools/evidence-lifecycle.mjs',
    'tools/evidence-output-transaction.mjs',
    'tools/screenshot-artifact-contract.mjs',
  ]);
  assert.deepEqual(snapshot.runtimeSources.map(({ file }) => file), [
    'beefrun.html',
    'enolasquatch.html',
    'src/beefrun/aircraft.js',
    'src/beefrun/cameras.js',
    'src/beefrun/config.js',
    'src/beefrun/main.js',
    'src/beefrun/mission.js',
    'src/beefrun/npc.js',
    'src/enolasquatch/config.js',
    'src/enolasquatch/crew.js',
    'src/enolasquatch/main.js',
    'src/enolasquatch/mission/MissionController.js',
    'src/enolasquatch/scenes/EnolaSquatch.js',
    'src/enolasquatch/systems/GunnerStation.js',
  ]);
  assert.match(snapshot.sourceSnapshotSha256, /^[a-f0-9]{64}$/);
  const capturedAssets = snapshot.servedSources.filter(({ kind }) => kind === 'runtime-asset');
  assert.deepEqual(capturedAssets.map(({ file }) => file), [
    'assets/art/enola-squatch-nose-art.webp',
    'assets/art/enola-squatch-nose-name.png',
    'assets/art/logo-crest.png',
    'assets/art/sticker-pinup.png',
    'assets/faces/irish.png',
    'assets/faces/sasole.png',
    'assets/faces/shubes.png',
    'assets/faces/stove.png',
  ]);
  assert.equal(capturedAssets.reduce((sum, { bytes }) => sum + bytes, 0), 7_015_817);
  assert.ok(capturedAssets.every(({ reasons }) => Array.isArray(reasons) && reasons.length > 0));
  assert.ok([...snapshot.tools, ...snapshot.runtimeSources].every((entry) => (
    entry.bytes > 0 && /^[a-f0-9]{64}$/.test(entry.sha256)
  )));
  assert.deepEqual(assertCockpitVisualEvidenceSourcesUnchanged(snapshot), snapshot);
  const forged = clone(snapshot);
  forged.runtimeSources[0].sha256 = '0'.repeat(64);
  assert.throws(() => assertCockpitVisualEvidenceSourcesUnchanged(forged), /changed during capture/);
});

test('served provenance rejects an A to B to A response sequence for one canonical source', () => {
  const snapshot = currentCockpitVisualEvidenceSourceIdentities();
  const source = snapshot.servedSources?.find(({ file }) => file === 'vendor/three.module.min.js');
  assert.ok(source, 'the capture-start served-source universe omitted transitive Three.js');
  const captures = completeFakeCaptures('fresh-proof', snapshot);
  const first = captures[0];
  const entry = {
    url: `${first.baseUrl}/${source.file}`,
    file: source.file,
    resourceType: 'script',
    status: 200,
    bytes: source.bytes,
    sha256: source.sha256,
    captureStartBytes: source.bytes,
    captureStartSha256: source.sha256,
  };
  first.served.entries.push(
    clone(entry),
    { ...clone(entry), bytes: source.bytes + 1, captureStartBytes: source.bytes + 1,
      sha256: 'c'.repeat(64), captureStartSha256: 'c'.repeat(64) },
    clone(entry),
  );
  const ledger = fakeLedger(captures, snapshot);
  assert.equal(ledger.checks.canonicalServedResources, false);
  assert.equal(ledger.checks.servedSourceBinding, false);
  assert.equal(ledger.checks.allPassed, false);
});

test('served provenance rejects cross-shot A versus B drift for a common transitive source', () => {
  const snapshot = currentCockpitVisualEvidenceSourceIdentities();
  const source = snapshot.servedSources?.find(({ file }) => file === 'src/style.css');
  assert.ok(source, 'the capture-start served-source universe omitted shared runtime CSS');
  const captures = completeFakeCaptures('fresh-proof', snapshot);
  const shared = {
    url: `${captures[0].baseUrl}/${source.file}`,
    file: source.file,
    resourceType: 'stylesheet',
    status: 200,
    bytes: source.bytes,
    sha256: source.sha256,
    captureStartBytes: source.bytes,
    captureStartSha256: source.sha256,
  };
  captures[0].served.entries.push(clone(shared));
  captures[1].served.entries.push({
    ...clone(shared), bytes: source.bytes + 7, captureStartBytes: source.bytes + 7,
    sha256: 'd'.repeat(64), captureStartSha256: 'd'.repeat(64),
  });
  const ledger = fakeLedger(captures, snapshot);
  assert.equal(ledger.checks.canonicalServedResources, false);
  assert.equal(ledger.checks.servedSourceBinding, false);
  assert.equal(ledger.checks.allPassed, false);
});
