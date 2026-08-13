import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { bindScreenshotArtifact } from '../tools/screenshot-artifact-contract.mjs';

import {
  diagnoseWorklampCaptureWindow,
  diagnoseWorklampComposition,
  diagnoseWorklampPixelProof,
  evaluateEricReviveCapture,
  evaluateEricReviveCaptureWindow,
  evaluateWorklampCaptureWindow,
  evaluateWorklampComposition,
  evaluateWorklampPixelProof,
  isEvidenceBodyMesh,
  isEvidenceOpaqueIntersection,
  isEvidenceOpaqueMaterial,
  isEvidenceOpaquePixelIntersection,
  selectEvidenceTextureSamples,
} from '../tools/mansion-siege-evidence-contract.mjs';

const verifierSource = fs.readFileSync(
  new URL('../tools/shots-mansion-siege.mjs', import.meta.url),
  'utf8',
);
const productionSource = fs.readFileSync(
  new URL('../src/mansion/siege/main.js', import.meta.url),
  'utf8',
);
const pixelProofSource = fs.readFileSync(
  new URL('../tools/worklamp-pixel-proof.mjs', import.meta.url),
  'utf8',
);
const pixelProofModule = await import('../tools/worklamp-pixel-proof.mjs');

test('the evidence server serves browser-imported mjs contracts as JavaScript', () => {
  assert.match(verifierSource, /['"]\.mjs['"]\s*:\s*['"]text\/javascript; charset=utf-8['"]/,
    'the browser contract module would be served as application/octet-stream');
});

test('worklamp ID masks own and restore the full render-target viewport and scissor', () => {
  assert.match(pixelProofSource,
    /getViewport\([\s\S]*getScissor\([\s\S]*getScissorTest\(/,
    'the mask pass cannot restore renderer viewport/scissor state after probing');
  assert.match(pixelProofSource,
    /setRenderTarget\(target\)[\s\S]*setViewport\(0, 0, width, height\)[\s\S]*setScissor\(0, 0, width, height\)[\s\S]*setScissorTest\(false\)[\s\S]*clear\(true, true, true\)/,
    'postfx scissor state can leave stale white target pixels between ID masks');
  assert.match(pixelProofSource,
    /setRenderTarget\(oldTarget\)[\s\S]*setViewport\(oldViewport\)[\s\S]*setScissor\(oldScissor\)[\s\S]*setScissorTest\(oldScissorTest\)/,
    'ID-mask capture leaks its full-target viewport/scissor state back into production');
});

test('worklamp ID masks account for every Three drawable and audit subject-set identity', () => {
  assert.equal(typeof pixelProofModule.evidenceDrawableKind, 'function',
    'the mask pass has no shared boundary for non-mesh Three drawables');
  assert.equal(pixelProofModule.evidenceDrawableKind({ isMesh: true }), 'mesh');
  assert.equal(pixelProofModule.evidenceDrawableKind({ isSprite: true }), 'sprite');
  assert.equal(pixelProofModule.evidenceDrawableKind({ isPoints: true }), 'points');
  assert.equal(pixelProofModule.evidenceDrawableKind({ isLine: true }), 'line');
  assert.equal(pixelProofModule.evidenceDrawableKind({ isGroup: true }), null);
  assert.match(pixelProofSource,
    /SpriteMaterial[\s\S]*PointsMaterial[\s\S]*LineBasicMaterial/,
    'a live smoke sprite/points/line can retain authored RGB in every binary mask');
  assert.equal(typeof pixelProofModule.auditEvidenceSubjectSets, 'function',
    'shared target object identity cannot be distinguished from renderer contamination');
  const shared = { uuid: 'shared', name: 'shared-object', parent: null };
  const audit = pixelProofModule.auditEvidenceSubjectSets({
    eric: new Set([shared, { uuid: 'eric-only', name: 'eric-only', parent: null }]),
    guard: new Set([shared]),
    lamp: new Set([{ uuid: 'lamp-only', name: 'lamp-only', parent: null }]),
  });
  assert.deepEqual(audit.counts, { eric: 2, guard: 1, lamp: 1 });
  assert.equal(audit.disjoint, false);
  assert.deepEqual(audit.overlaps.map(({ left, right, objects }) => ({
    left, right, uuids: objects.map((object) => object.uuid),
  })), [{ left: 'eric', right: 'guard', uuids: ['shared'] }]);
});

test('the shipped screenshot bytes remain identical to the captured proof buffer', () => {
  const capture = Buffer.from('same-length-proof-a');
  assert.deepEqual(bindScreenshotArtifact(capture, Buffer.from(capture)), {
    bytes: capture.length,
    sha256: 'ca3b27bb3633140114f72abc2ac6099abe981215155c747677481ceccf92c591',
  });
  assert.throws(
    () => bindScreenshotArtifact(capture, Buffer.from('same-length-proof-b')),
    /differ from Playwright capture buffer/,
    'same-length disk replacement was allowed to inherit capture A proof',
  );
  assert.match(verifierSource,
    /for \(const shotRecord of renderedShots\)[\s\S]*capturedShotBuffers\.get[\s\S]*bindScreenshotArtifact[\s\S]*const checks/,
    'the file is never rebound after all shots, so a later overwrite can reach the ledger');
});

test('evidence lifecycle closes a listening server on launch/new-page failure', async () => {
  const { closeEvidenceLifecycle } = await import('../tools/evidence-lifecycle.mjs');
  const calls = [];
  const server = {
    listening: true,
    close(callback) { calls.push('server.close'); this.listening = false; callback(); },
  };
  await closeEvidenceLifecycle({ browser: null, server });
  assert.deepEqual(calls, ['server.close'], 'launch failure leaked the exclusive evidence port');

  const closeError = new Error('browser close failed');
  const browser = { async close() { calls.push('browser.close'); throw closeError; } };
  server.listening = true;
  await assert.rejects(closeEvidenceLifecycle({ browser, server }), closeError);
  assert.deepEqual(calls.slice(-2), ['browser.close', 'server.close'],
    'browser cleanup failure prevented server cleanup');
  assert.match(verifierSource,
    /let browser = null;[\s\S]*try\s*\{[\s\S]*listenEvidenceServer\([\s\S]*chromium\.launch[\s\S]*browser\.newPage[\s\S]*finally\s*\{[\s\S]*closeEvidenceLifecycle/,
    'listen/launch/newPage are still outside nullable awaited cleanup');
});

test('the worklamp shot binds complete composition to the screenshot window', () => {
  assert.match(verifierSource,
    /setup === 'eric-flinch'[\s\S]*KeyboardEvent\('keydown', \{ code: 'KeyQ'/,
    'the evidence tool did not use the production Q-stow input before the worklamp screenshot');
  assert.match(verifierSource,
    /__scenePause\.pause\(\)[\s\S]*const semanticBefore[\s\S]*page\.screenshot[\s\S]*const semanticAfter/,
    'the live simulation is not frozen across both screenshot-local samples');
  assert.match(verifierSource,
    /__scenePause\.pause\(\)[\s\S]*player\.keys\.add\('KeyC'\)[\s\S]*const semanticBefore/,
    'pausing clears input, but the screenshot window does not re-hold the real crouch key');
  assert.match(verifierSource,
    /eric\.downed = false;[\s\S]*siege\.tick\(0\.8\)[\s\S]*noteImpact/,
    'Eric blood is captured before the real shared pool finishes growing');
  assert.match(verifierSource,
    /const captureReviveSemantic = \(\) => page\.evaluate\(async \(\) =>[\s\S]*renderProjectionProof[\s\S]*composition:/,
    'body, blood, guard, gun, and lamp projections are not sampled beside the screenshot');
  assert.match(verifierSource,
    /screenRayVisibilityProof[\s\S]*visibility:/,
    'projected bounds can still certify subjects hidden behind rail, wall, or furniture pixels');
  assert.match(verifierSource,
    /transformUv[\s\S]*isEvidenceOpaquePixelIntersection/,
    'first-hit evidence ignores the transparent pixels and UV transform in CanvasTexture blood');
  assert.match(verifierSource,
    /paintedTextureScreenSamples[\s\S]*selectEvidenceTextureSamples/,
    'blood proof still aims its 25 rays at clear corners of the alpha-painted texture');
  assert.match(verifierSource,
    /blood:\s*projectionWithVisibility\(ericBlood,\s*\{\s*sampleMode:\s*'painted-texture'\s*\}\)/,
    'the screenshot contract does not bind Eric blood to 25 real painted texels');
  assert.match(verifierSource,
    /const worklampLight = siege\.dressing\.props\.firingStep\.lamp[\s\S]*worklampLight:\s*siege\.lightStatus\(worklampLight\)/,
    'the screenshot window never records the real PointLight scheduler rank and visibility');
  assert.match(productionSource,
    /function lightStatus\(light\)[\s\S]*_lightRank\.findIndex[\s\S]*visible:\s*light\?\.visible === true[\s\S]*candidateCount:\s*_lightRank\.length/,
    'the evidence surface can self-echo a verifier value instead of reading the production scheduler');
  assert.match(productionSource, /window\.mansionSiege\s*=\s*\{[\s\S]*lightStatus,/,
    'the production scheduler status is not the function exposed to the screenshot transaction');
  assert.match(verifierSource,
    /worklampCompositionReadable:\s*evaluateWorklampCaptureWindow\(worklampCapture\)/,
    'the stronger screenshot-local composition window is not a hard gate');
  assert.match(verifierSource,
    /page\.screenshot[\s\S]*captureWorklampPixelProof\([\s\S]*screenshotBase64[\s\S]*imageSha256/,
    'contrast and connected silhouettes are not measured from the exact screenshot bytes');
  assert.match(verifierSource,
    /worklampPixelCompositionReadable:\s*evaluateWorklampPixelProof\([\s\S]*worklampCapture\?\.pixelProof,\s*worklampShot\?\.sha256/,
    'a sparse geometry/ray pass can still certify visually merged worklamp evidence');
  assert.match(pixelProofSource, /getImageData/,
    'pixel proof never reads the exact PNG colours');
  assert.match(pixelProofSource, /readRenderTargetPixels/,
    'pixel proof never intersects the PNG with occlusion-aware ID masks');
  assert.match(pixelProofSource, /largestConnectedPixels/,
    'pixel proof never measures connected target silhouettes');
  assert.match(pixelProofSource, /bounds:\s*maskBounds\(mask, width, height\)/,
    'a zero-separation rejection cannot identify which ID mask escaped its projected subject');
  assert.match(pixelProofSource, /boundaryContrast/,
    'pixel proof never measures target-to-background contrast');
  assert.match(pixelProofSource, /partProofs[\s\S]*summarizePart/,
    'head, torso and limb visibility is not bound to screenshot contrast');
  assert.match(pixelProofSource, /redReadablePixels[\s\S]*red >= 45[\s\S]*green \* 1\.35/,
    'the alpha-painted blood mask is not checked against red screenshot pixels');
  assert.doesNotMatch(verifierSource,
    /worklampCompositionReadable:\s*evaluateWorklampComposition\(worklampComposition\)/,
    'a later inventory/camera composition can still certify the earlier screenshot');
  assert.doesNotMatch(verifierSource, /frustumProof\((?:eric|guard)(?:\.root|\.gun)/,
    'later root Box3 inventory still includes weapon subtrees or certifies the wrong camera');
  const setupIndex = verifierSource.indexOf("if (setup === 'eric-flinch')");
  const waitIndex = verifierSource.indexOf('await page.waitForTimeout(waitMs)', setupIndex);
  const pauseIndex = verifierSource.indexOf('window.__scenePause.pause()', setupIndex);
  assert.ok(setupIndex >= 0 && pauseIndex > setupIndex && pauseIndex < waitIndex,
    'the live RAF advances the settled worklamp actors during the render wait before pause');
});

test('rendered body bounds exclude a weapon subtree parented under the figure', () => {
  const bodyRoot = { name: 'guard.root', parent: null };
  const torso = { name: 'guard.torso', isMesh: true, parent: bodyRoot };
  const gun = { name: 'guard.gun', parent: bodyRoot };
  const barrel = { name: 'guard.gun.barrel', isMesh: true, parent: gun };
  const unrelated = { name: 'floor', isMesh: true, parent: null };

  assert.equal(isEvidenceBodyMesh(torso, bodyRoot, gun), true);
  assert.equal(isEvidenceBodyMesh(barrel, bodyRoot, gun), false,
    'the carbine inflated the guard body bounds used to prove its own protrusion');
  assert.equal(isEvidenceBodyMesh(unrelated, bodyRoot, gun), false);
  assert.equal(isEvidenceBodyMesh(bodyRoot, bodyRoot, gun), false);
});

test('target ID masks reject transparent draw slots without borrowing unused materials', () => {
  assert.equal(typeof pixelProofModule.mapEvidenceTargetMaterialSlots, 'function',
    'the ID pass has no auditable per-material target eligibility boundary');
  const ghost = { id: 'drawn-ghost', visible: true, transparent: true, opacity: 0.01 };
  const unusedOpaque = { id: 'unused-opaque', visible: true, transparent: false, opacity: 1 };
  const invisible = Symbol('invisible');
  const map = (material) => material.id;
  assert.equal(
    pixelProofModule.mapEvidenceTargetMaterialSlots(ghost, map, invisible),
    invisible,
    'a one-percent transparent target was painted as full white ownership',
  );
  const grouped = pixelProofModule.mapEvidenceTargetMaterialSlots(
    [ghost, unusedOpaque], map, invisible,
  );
  assert.deepEqual(grouped, [invisible, 'unused-opaque'],
    'target material indices were collapsed, so an unused opaque slot rescued a transparent group');
  assert.match(pixelProofSource,
    /targetMaskMaterial[\s\S]*texture2D\([\s\S]*\.a[\s\S]*alphaMap[\s\S]*\.g/,
    'eligible target slots ignore production map/alphaMap coverage');
});

test('ID-mask material eligibility and cutouts match Three draw/depth semantics', () => {
  assert.equal(typeof pixelProofModule.isEvidenceMaskMaterialVisible, 'function');
  assert.equal(typeof pixelProofModule.evidenceMaskAlphaCutoff, 'function');
  assert.equal(pixelProofModule.isEvidenceMaskMaterialVisible({
    visible: true, transparent: false, opacity: 0,
  }), true, 'non-blended opacity zero still writes RGB/depth in Three');
  assert.equal(pixelProofModule.isEvidenceMaskMaterialVisible({
    visible: true, transparent: true, opacity: 0,
  }), false, 'zero-alpha blended material was retained in the ID pass');
  assert.equal(pixelProofModule.evidenceMaskAlphaCutoff({
    transparent: false, alphaTest: 0.35,
  }), 0.35, 'opaque alpha cutout was silently raised to majority coverage');
  assert.equal(pixelProofModule.evidenceMaskAlphaCutoff({
    transparent: true, alphaTest: 0.35,
  }), 0.5, 'blended clear texels were allowed to become binary occluders');
  assert.match(pixelProofSource,
    /blood\.material\.polygonOffset[\s\S]*blood\.material\.polygonOffsetFactor[\s\S]*blood\.material\.polygonOffsetUnits/,
    'blood ID pixels do not use the screenshot material\'s depth bias');
  assert.match(pixelProofSource,
    /depthWrite:\s*blood\.material\.depthWrite/,
    'blood ID material changes the production depth-write contract');
});

test('Siege evidence rays ignore glass but retain effective opaque blockers', () => {
  assert.equal(isEvidenceOpaqueMaterial(null), false);
  assert.equal(isEvidenceOpaqueMaterial({ visible: true, transparent: true, opacity: 0.06 }), false);
  assert.equal(isEvidenceOpaqueMaterial({ visible: true, transparent: true, opacity: 0.7 }), true);
  assert.equal(isEvidenceOpaqueMaterial({ visible: true, transparent: false, opacity: 0.1 }), true);
  assert.equal(isEvidenceOpaqueMaterial({ visible: false, transparent: false, opacity: 1 }), false);

  const glass = { visible: true, transparent: true, opacity: 0.06 };
  const opaqueFrame = { visible: true, transparent: false, opacity: 1 };
  const multiMaterialObject = { material: [glass, opaqueFrame] };
  assert.equal(isEvidenceOpaqueIntersection({
    object: multiMaterialObject,
    face: { materialIndex: 0 },
  }), false, 'a hit on the glass face was promoted by an unrelated opaque frame material');
  assert.equal(isEvidenceOpaqueIntersection({
    object: multiMaterialObject,
    face: { materialIndex: 1 },
  }), true);

  const bloodMap = { name: 'irregular-alpha-blood' };
  const bloodHit = {
    object: {
      material: {
        visible: true, transparent: true, opacity: 0.86, map: bloodMap, alphaTest: 0,
      },
    },
    face: { materialIndex: 0 },
    uv: { x: 0.1, y: 0.1 },
  };
  assert.equal(isEvidenceOpaquePixelIntersection(
    bloodHit, (texture, uv, channel) => {
      assert.equal(texture, bloodMap);
      assert.deepEqual(uv, bloodHit.uv);
      assert.equal(channel, 'alpha');
      return 0;
    },
  ), false, 'a clear CanvasTexture corner was counted as a visible blood pixel');
  assert.equal(isEvidenceOpaquePixelIntersection(bloodHit, () => 0.8), true,
    'a materially opaque painted blood pixel was discarded');

  const alphaTested = structuredClone(bloodHit);
  alphaTested.object.material.alphaTest = 0.7;
  assert.equal(isEvidenceOpaquePixelIntersection(alphaTested, () => 0.7), false,
    'material opacity times map alpha below alphaTest was counted as rendered');
});

test('painted-texture evidence keeps 25 distinct, spatially spread real texels', () => {
  const painted = [];
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      painted.push({
        u: (column + 0.5) / 9,
        v: (row + 0.5) / 9,
        x: column / 10,
        y: row / 10,
      });
    }
  }
  const selected = selectEvidenceTextureSamples(painted, 25);
  assert.equal(selected.length, 25);
  assert.equal(new Set(selected.map(({ u, v }) => `${u}:${v}`)).size, 25,
    'duplicate rays were used to inflate the visible painted-pixel count');
  assert.ok(Math.min(...selected.map(({ u }) => u)) < 0.1
    && Math.max(...selected.map(({ u }) => u)) > 0.9
    && Math.min(...selected.map(({ v }) => v)) < 0.1
    && Math.max(...selected.map(({ v }) => v)) > 0.9,
  'painted evidence collapsed into one dense patch of the stain');
  assert.deepEqual(selectEvidenceTextureSamples(painted.slice(0, 24), 25), [],
    'an incomplete painted sample set was padded into a false 25-ray proof');
});

test('Eric revive proof is bound to screenshot-time prompt and held crouch input', () => {
  const valid = {
    prompt: {
      visible: true,
      name: 'Eric',
      text: 'Hold E — get Eric off the floor',
      nearest: { id: 'eric', distance: 2.2 },
    },
    player: {
      crouching: true,
      crouchKeyHeld: true,
      simulationPaused: true,
      eyeHeight: 1.02,
      equipped: null,
      viewmodelWeaponVisible: false,
    },
  };
  assert.equal(evaluateEricReviveCapture(valid), true);
  const afterKeyRelease = structuredClone(valid);
  afterKeyRelease.player.crouchKeyHeld = false;
  assert.equal(evaluateEricReviveCapture(afterKeyRelease), false,
    'post-capture KeyC release was allowed to certify the screenshot');
  const wrongPrompt = structuredClone(valid);
  wrongPrompt.prompt.nearest.id = 'guard_wounded';
  assert.equal(evaluateEricReviveCapture(wrongPrompt), false);
  const armedViewmodel = structuredClone(valid);
  armedViewmodel.player.equipped = 'saw';
  armedViewmodel.player.viewmodelWeaponVisible = true;
  assert.equal(evaluateEricReviveCapture(armedViewmodel), false,
    'an equipped first-person gun was allowed to cover the evidence subject');
  const liveSimulation = structuredClone(valid);
  liveSimulation.player.simulationPaused = false;
  assert.equal(evaluateEricReviveCapture(liveSimulation), false,
    'a breathing/moving figure was sampled on both sides of a live screenshot');

  for (const impossibleEyeHeight of [0, -10, Number.NEGATIVE_INFINITY, Number.NaN]) {
    const impossible = structuredClone(valid);
    impossible.player.eyeHeight = impossibleEyeHeight;
    assert.equal(evaluateEricReviveCapture(impossible), false,
      `impossible eye height ${String(impossibleEyeHeight)} certified the screenshot`);
  }

  const stableWindow = {
    before: structuredClone(valid),
    after: structuredClone(valid),
  };
  assert.equal(evaluateEricReviveCaptureWindow(stableWindow), true);
  const changedDuringScreenshot = structuredClone(stableWindow);
  changedDuringScreenshot.after.prompt.visible = false;
  assert.equal(evaluateEricReviveCaptureWindow(changedDuringScreenshot), false,
    'a prompt that disappeared while the screenshot rendered was certified');
  const movedDuringScreenshot = structuredClone(stableWindow);
  movedDuringScreenshot.after.player.position = [4, 1.02, 2];
  movedDuringScreenshot.before.player.position = [4, 1.02, 1];
  assert.equal(evaluateEricReviveCaptureWindow(movedDuringScreenshot), false,
    'different pre/post capture states were accepted as the same screenshot state');
});

test('worklamp composition proves readable body, blood, guard, and supported carbine pixels', () => {
  const valid = {
    eric: {
      body: {
        fullyInside: true,
        ndc: { minX: -0.25, maxX: 0.77, minY: -0.78, maxY: 0.35 },
        visibility: { sampleCount: 25, targetHits: 12, hitRatio: 0.48 },
      },
      blood: {
        fullyInside: true,
        ndc: { minX: -0.41, maxX: 0.87, minY: -0.90, maxY: 0.44 },
        visibility: {
          sampleCount: 25, targetHits: 10, hitRatio: 0.4,
          sampleMode: 'painted-texture', paintedCandidateCount: 6285,
        },
      },
      bloodOwner: 'eric',
      bloodOpacity: 0.8,
      bloodEmissiveRed: 0.7,
    },
    guard: {
      body: {
        fullyInside: true,
        ndc: { minX: -0.88, maxX: -0.29, minY: -0.37, maxY: 0.87 },
        visibility: { sampleCount: 25, targetHits: 11, hitRatio: 0.44 },
      },
      gun: {
        fullyInside: true,
        ndc: { minX: -0.91, maxX: -0.24, minY: -0.08, maxY: 0.27 },
        visibility: { sampleCount: 25, targetHits: 7, hitRatio: 0.28 },
      },
    },
    worklamp: {
      intersects: true,
      ndc: { minX: -0.42, maxX: -0.30, minY: 0.04, maxY: 0.47 },
      visibility: { sampleCount: 25, targetHits: 6, hitRatio: 0.24 },
    },
  };
  assert.equal(evaluateWorklampComposition(valid), true);

  const hiddenBlood = structuredClone(valid);
  hiddenBlood.eric.blood.fullyInside = false;
  assert.equal(evaluateWorklampComposition(hiddenBlood), false);
  assert.deepEqual(
    diagnoseWorklampComposition(hiddenBlood).failures,
    ['eric.blood.frame'],
    'a rejected browser composition does not say which unchanged gate failed',
  );

  const noExposedBlood = structuredClone(valid);
  noExposedBlood.eric.blood.ndc = { ...noExposedBlood.eric.body.ndc };
  assert.equal(evaluateWorklampComposition(noExposedBlood), false,
    'a blood plane wholly hidden by the body was called readable');

  const rectangleOnlyBlood = structuredClone(valid);
  rectangleOnlyBlood.eric.blood.visibility.sampleMode = 'uniform-grid';
  assert.equal(evaluateWorklampComposition(rectangleOnlyBlood), false,
    '25 rectangular plane rays were allowed to stand in for alpha-painted blood pixels');

  const bodyBehindRail = structuredClone(valid);
  bodyBehindRail.eric.body.visibility = { sampleCount: 25, targetHits: 0, hitRatio: 0 };
  assert.equal(evaluateWorklampComposition(bodyBehindRail), false,
    'a projected body hidden behind balcony/rail geometry was called visible');

  const tinyCarbine = structuredClone(valid);
  tinyCarbine.guard.gun.ndc = { minX: -0.5, maxX: -0.45, minY: 0.1, maxY: 0.13 };
  assert.equal(evaluateWorklampComposition(tinyCarbine), false,
    'a tiny merged carbine silhouette was called readable');

  const lampCoveredCarbine = structuredClone(valid);
  lampCoveredCarbine.worklamp.ndc = { ...lampCoveredCarbine.guard.gun.ndc };
  assert.equal(evaluateWorklampComposition(lampCoveredCarbine), false,
    'a carbine hidden by the worklamp projection was called readable');

  const mergedPeople = structuredClone(valid);
  mergedPeople.guard.body.ndc.maxX = -0.24;
  assert.equal(evaluateWorklampComposition(mergedPeople), false,
    'overlapping Eric and guard projection boxes were called a clear composition');

  const revive = {
    prompt: {
      visible: true,
      name: 'Eric',
      text: 'Hold E — get Eric off the floor',
      nearest: { id: 'eric', distance: 2.2 },
    },
    player: {
      crouching: true,
      crouchKeyHeld: true,
      simulationPaused: true,
      eyeHeight: 1.02,
      equipped: null,
      viewmodelWeaponVisible: false,
    },
    composition: structuredClone(valid),
    eric: {
      id: 'eric', staged: true, health: 1, downed: true,
      incapacitated: false, pose: 'fallen', weaponId: 'ak47',
      gunVisible: false, bloodVisible: true,
    },
    liveGuard: {
      id: 'guard_1', staged: true, downed: false, incapacitated: false,
      pose: 'flinch', businessKey: 'flinch', weaponId: 'carbine',
      gunVisible: true, firingGripContact: true, supportHandGap: 0.02,
      bothHandsAboveHead: false,
    },
    worklampLight: {
      candidate: true, visible: true, intensity: 24, distance: 16,
      rank: 7, activeLimit: 10, candidateCount: 255,
    },
  };
  const stableShot = { before: structuredClone(revive), after: structuredClone(revive) };
  assert.equal(evaluateEricReviveCaptureWindow(stableShot), true,
    'the valid shot fixture must first satisfy the screenshot prompt window');
  assert.equal(evaluateWorklampComposition(stableShot.before.composition), true,
    'the valid shot fixture must first satisfy the visual composition');
  assert.equal(evaluateWorklampCaptureWindow(stableShot), true);

  const movedBodyAfterPixels = structuredClone(stableShot);
  movedBodyAfterPixels.after.composition.eric.body.ndc.maxX = 0.62;
  assert.equal(evaluateWorklampCaptureWindow(movedBodyAfterPixels), false,
    'a later body projection was allowed to certify different screenshot pixels');

  const guardStateChangedAfterPixels = structuredClone(stableShot);
  guardStateChangedAfterPixels.after.liveGuard.gunVisible = false;
  assert.equal(evaluateWorklampCaptureWindow(guardStateChangedAfterPixels), false,
    'a guard who lost the carbine during the screenshot was still certified');
  assert.deepEqual(
    diagnoseWorklampCaptureWindow(guardStateChangedAfterPixels).failures,
    ['capture.revive-window', 'capture.after-guard-flinch'],
    'the capture diagnostic did not separate state drift from the failed guard pose',
  );

  const unlitPractical = structuredClone(stableShot);
  unlitPractical.before.worklampLight.visible = false;
  unlitPractical.after.worklampLight.visible = false;
  unlitPractical.before.worklampLight.rank = 12;
  unlitPractical.after.worklampLight.rank = 12;
  assert.equal(evaluateWorklampCaptureWindow(unlitPractical), false,
    'an emissive prop whose real PointLight lost the ten-light scheduler was certified');

  const schedulerDriftedAfterPixels = structuredClone(stableShot);
  schedulerDriftedAfterPixels.after.worklampLight.rank = 8;
  assert.equal(evaluateWorklampCaptureWindow(schedulerDriftedAfterPixels), false,
    'a stale pre-screenshot scheduler rank was allowed to certify a different post-screenshot rank');

  const gunJoinedBody = structuredClone(stableShot);
  gunJoinedBody.before.composition.guard.body.ndc.maxX = -0.24;
  gunJoinedBody.after.composition.guard.body.ndc.maxX = -0.24;
  assert.equal(evaluateWorklampCaptureWindow(gunJoinedBody), false,
    'weapon-inflated body bounds were allowed to prove their own carbine separation');
});

test('worklamp screenshot pixels prove connected, contrasting people and bounded blood', () => {
  const silhouette = ({ pixels = 8000, unoccluded = 9000 } = {}) => ({
    visiblePixels: pixels,
    unoccludedPixels: unoccluded,
    visibleFraction: pixels / unoccluded,
    largestComponentPixels: Math.round(pixels * 0.86),
    largestComponentRatio: Math.round(pixels * 0.86) / pixels,
    boundaryPixels: 900,
    boundaryContrast: 0.18,
    contrastedBoundaryPixels: 650,
    contrastedBoundaryRatio: 650 / 900,
  });
  const part = (visiblePixels) => ({
    visiblePixels,
    largestComponentPixels: Math.round(visiblePixels * 0.82),
    largestComponentRatio: Math.round(visiblePixels * 0.82) / visiblePixels,
    boundaryPixels: Math.max(80, Math.round(visiblePixels * 0.3)),
    boundaryContrast: 0.16,
    contrastedBoundaryPixels: Math.max(50, Math.round(visiblePixels * 0.2)),
    contrastedBoundaryRatio: 2 / 3,
  });
  const parts = {
    head: part(700), torso: part(2400),
    armLeft: part(850), armRight: part(880),
    legLeft: part(1150), legRight: part(1180),
  };
  const valid = {
    imageSha256: 'a'.repeat(64),
    viewport: { width: 1920, height: 1080 },
    targetSelection: {
      disjoint: true,
      overlaps: [],
      counts: { ericBody: 40, ericBlood: 1, guardBody: 40, guardGun: 8, worklamp: 5 },
    },
    drawableAudit: {
      counts: { mesh: 1200, sprite: 64, points: 0, line: 0 },
      effectiveNonMeshCount: 2,
      effectiveNonMesh: [],
    },
    eric: {
      body: { ...silhouette(), parts: { ...parts } },
      blood: {
        visiblePixels: 12000,
        redReadablePixels: 9000,
        redReadableRatio: 0.75,
        boundaryPixels: 1000,
        boundaryContrast: 0.2,
        contrastedBoundaryPixels: 700,
        contrastedBoundaryRatio: 0.7,
      },
      bloodToBodyRatio: 1.5,
    },
    guard: {
      body: { ...silhouette(), parts: { ...parts } },
      gun: silhouette({ pixels: 900, unoccluded: 1000 }),
    },
    worklamp: silhouette({ pixels: 1100, unoccluded: 1200 }),
    separation: { ericGuardPixels: 48, gunLampPixels: 26 },
  };
  assert.equal(evaluateWorklampPixelProof(valid), true);
  assert.deepEqual(
    diagnoseWorklampPixelProof(valid).measurements.targetSelection,
    valid.targetSelection,
    'runtime rejection diagnostics dropped the object-identity discriminator',
  );
  const overlappingSubjects = structuredClone(valid);
  overlappingSubjects.targetSelection.disjoint = false;
  overlappingSubjects.targetSelection.overlaps = [{
    left: 'ericBody', right: 'guardBody', objects: [{ uuid: 'shared-head' }],
  }];
  assert.equal(evaluateWorklampPixelProof(overlappingSubjects), false,
    'one drawable was allowed to certify two supposedly separated subjects');
  assert.equal(evaluateWorklampPixelProof(valid, 'b'.repeat(64)), false,
    'a valid-looking proof hash was not bound to the PNG hash in the shot ledger');

  const darkBlock = structuredClone(valid);
  darkBlock.eric.body.boundaryContrast = 0.03;
  assert.equal(evaluateWorklampPixelProof(darkBlock), false,
    '54980-style black body blocks were called readable without silhouette contrast');
  const mostlyArchitecture = structuredClone(valid);
  mostlyArchitecture.guard.body.visiblePixels = 3000;
  mostlyArchitecture.guard.body.unoccludedPixels = 9000;
  mostlyArchitecture.guard.body.visibleFraction = 1 / 3;
  mostlyArchitecture.guard.body.largestComponentPixels = 2580;
  mostlyArchitecture.guard.body.largestComponentRatio = 0.86;
  assert.equal(evaluateWorklampPixelProof(mostlyArchitecture), false,
    'a guard swallowed by the stair/newel was certified from a few owned pixels');
  const missingHead = structuredClone(valid);
  missingHead.eric.body.parts.head.visiblePixels = 0;
  assert.equal(evaluateWorklampPixelProof(missingHead), false,
    'a body with no readable head was allowed to stand in for a fallen person');
  assert.ok(
    diagnoseWorklampPixelProof(missingHead).failures.includes('eric.part.head'),
    'a rejected screenshot does not name the missing body part',
  );
  const darkHead = structuredClone(valid);
  darkHead.eric.body.parts.head.boundaryContrast = 0.01;
  assert.equal(evaluateWorklampPixelProof(darkHead), false,
    'a geometrically present but black-on-black head was called readable');
  const fragmentedHead = structuredClone(valid);
  fragmentedHead.eric.body.parts.head.largestComponentPixels = 140;
  fragmentedHead.eric.body.parts.head.largestComponentRatio = 0.2;
  assert.equal(evaluateWorklampPixelProof(fragmentedHead), false,
    'disconnected bright head fragments were summed into a readable person');
  const greyBlood = structuredClone(valid);
  greyBlood.eric.blood.redReadablePixels = 500;
  greyBlood.eric.blood.redReadableRatio = 500 / greyBlood.eric.blood.visiblePixels;
  assert.equal(evaluateWorklampPixelProof(greyBlood), false,
    'an alpha-painted but non-red screenshot region was called readable blood');
  const giantBlood = structuredClone(valid);
  giantBlood.eric.blood.visiblePixels = 32000;
  giantBlood.eric.bloodToBodyRatio = 4;
  assert.equal(evaluateWorklampPixelProof(giantBlood), false,
    'an oversized blood field was allowed to substitute for body readability');
  const mergedProps = structuredClone(valid);
  mergedProps.separation.gunLampPixels = 0;
  assert.equal(evaluateWorklampPixelProof(mergedProps), false,
    'a carbine merged into the worklamp/rail cluster was called distinct');
});

test('a failed worklamp browser run prints the exact semantic and pixel clauses before rollback', () => {
  assert.match(
    verifierSource,
    /WORKLAMP EVIDENCE DIAGNOSTICS:[\s\S]*diagnoseWorklampCaptureWindow\(worklampCapture\)[\s\S]*diagnoseWorklampPixelProof/,
    'the atomic transaction removes rejected PNGs without retaining their rejection diagnosis',
  );
});
