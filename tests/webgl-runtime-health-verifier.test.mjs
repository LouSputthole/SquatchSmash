import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  NON_INITIATION_RUNTIME_CASES,
  classifyWebGLRenderer,
  createWebGLRuntimeMode,
  evaluateDriverPreflight,
  evaluateRuntimeHealth,
  launcherRuntimeEntries,
  runtimeReadinessOutcome,
  selectDiagnosticRuntimeCases,
  validateRuntimeMatrix,
} from '../tools/verify-webgl-runtime-health.mjs';

const previewHtml = readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
const expectedHubRuntimes = Object.freeze([
  { id: 'hub:squatch_smash_intro', url: 'index.html?preview=1&beat=squatch_smash_intro' },
  { id: 'hub:first_apartment', url: 'index.html?preview=1&beat=first_apartment' },
  { id: 'hub:cabin_lay_low', url: 'cabin.html?preview=1&beat=cabin_lay_low' },
  { id: 'hub:booski_sasole_call', url: 'cabin.html?preview=1&beat=booski_sasole_call' },
  { id: 'hub:cabin_two', url: 'cabin.html?preview=1&beat=cabin_two' },
  { id: 'hub:return_to_old_apartment', url: 'index.html?preview=1&beat=return_to_old_apartment' },
  { id: 'hub:new_space_call', url: 'index.html?preview=1&beat=new_space_call' },
  { id: 'hub:luxury_apartment_intro', url: 'luxury-apartment.html?preview=1&beat=luxury_apartment_intro' },
  { id: 'hub:margo_stayover', url: 'luxury-apartment.html?preview=1&beat=margo_stayover' },
  { id: 'hub:luxury_apartment_morning', url: 'luxury-apartment.html?preview=1&beat=luxury_apartment_morning' },
  { id: 'hub:luxury_apartment_return', url: 'luxury-apartment.html?preview=1&beat=luxury_apartment_return' },
  { id: 'hub:special_meeting_call', url: 'luxury-apartment.html?preview=1&beat=special_meeting_call' },
]);

test('the WebGL health gate covers every playable launcher runtime except frozen Initiation', () => {
  const launcherEntries = launcherRuntimeEntries(previewHtml);
  const initiation = launcherEntries.filter(({ id, url }) => /initiation/i.test(`${id} ${url}`));
  const hubRuntimes = NON_INITIATION_RUNTIME_CASES
    .filter(({ id }) => id.startsWith('hub:'))
    .map(({ id, url }) => ({ id, url }));
  const runtimeIds = NON_INITIATION_RUNTIME_CASES.map(({ id }) => id);

  assert.equal(initiation.length, 1, 'the launcher should expose exactly one frozen Initiation entry');
  /* 12 public campaign-hub beats + 17 non-Initiation mission aliases + 2 tools.
   * The count is pinned on purpose — `validateRuntimeMatrix` below already
   * proves the gate and launcher agree, and this catches the other direction:
   * a runtime quietly dropped from both in the same change. */
  assert.equal(NON_INITIATION_RUNTIME_CASES.length, 31);
  assert.deepEqual(hubRuntimes, expectedHubRuntimes);
  assert.equal(runtimeIds.some((id) => id.startsWith('apartment:')), false);
  assert.equal(runtimeIds.includes('cabin'), false);
  assert.equal(runtimeIds.includes('luxury-apartment'), false);
  assert.doesNotMatch(
    NON_INITIATION_RUNTIME_CASES.map(({ id, url }) => `${id} ${url}`).join('\n'),
    /initiation/i,
  );
  assert.doesNotThrow(() => validateRuntimeMatrix(previewHtml, NON_INITIATION_RUNTIME_CASES));
  assert.throws(
    () => validateRuntimeMatrix(previewHtml, [
      ...NON_INITIATION_RUNTIME_CASES,
      { id: 'initiation', url: 'initiation.html?preview=1' },
    ]),
    /Frozen Initiation entered the WebGL runtime gate/,
  );
});

test('launcher parsing assigns public beat cards stable hub ids', () => {
  const entries = launcherRuntimeEntries(`
    <a data-preview-beat="cabin_two" href="cabin.html?preview=1&amp;beat=cabin_two">Cabin II</a>
    <a data-preview-scene="bing-one" href="bing.html?preview=1">Bing</a>
    <a data-preview-tool="wardrobe" href="wardrobe.html">Wardrobe</a>
  `);

  assert.deepEqual(entries, [
    { id: 'hub:cabin_two', url: 'cabin.html?preview=1&beat=cabin_two' },
    { id: 'bing-one', url: 'bing.html?preview=1' },
    { id: 'wardrobe', url: 'wardrobe.html' },
  ]);
});

test('runtime health accepts a clean WebGL2 boot', () => {
  const result = evaluateRuntimeHealth({
    documentStatus: 200,
    requestFailures: [],
    httpFailures: [],
    pageErrors: [],
    consoleErrors: [],
    bootFailures: [],
    webgl: {
      requests: 1,
      contexts: 1,
      creationFailures: 0,
      contextLostEvents: 0,
      lostContexts: 0,
      glErrors: [0],
    },
  });

  assert.deepEqual(result, { ok: true, problems: [] });
});

test('runtime health requires a successfully created WebGL2 context', () => {
  const result = evaluateRuntimeHealth({
    documentStatus: 200,
    webgl: { requests: 1, contexts: 0, creationFailures: 1 },
  });

  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /WebGL2 context creation failed/i);
});

test('runtime health rejects context loss and non-zero GL errors', () => {
  const result = evaluateRuntimeHealth({
    documentStatus: 200,
    webgl: {
      requests: 1,
      contexts: 1,
      creationFailures: 0,
      contextLostEvents: 1,
      lostContexts: 1,
      glErrors: [1282],
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.problems.join('\n'), /context lost/i);
  assert.match(result.problems.join('\n'), /GL error 1282/i);
});

test('runtime health rejects document, request, HTTP, page, console, and boot-overlay failures', () => {
  const result = evaluateRuntimeHealth({
    documentStatus: 503,
    requestFailures: ['GET /src/example.js - net::ERR_FAILED'],
    httpFailures: ['404 /assets/missing.png'],
    pageErrors: ['ReferenceError: broken is not defined'],
    consoleErrors: ['Could not load mission code'],
    bootFailures: ['Could not load the scene'],
    webgl: { requests: 1, contexts: 1, creationFailures: 0, glErrors: [0] },
  });
  const report = result.problems.join('\n');

  assert.equal(result.ok, false);
  for (const expected of ['document HTTP 503', 'request failed', 'HTTP failure',
    'page error', 'console error', 'boot failure']) {
    assert.match(report, new RegExp(expected, 'i'));
  }
});

test('the frozen-safe WebGL gate is registered in the project release surface', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const testRunner = readFileSync(new URL('./run.mjs', import.meta.url), 'utf8');

  assert.equal(
    packageJson.scripts?.['verify:webgl-health'],
    'node tools/verify-webgl-runtime-health.mjs',
  );
  assert.equal(
    packageJson.scripts?.['verify:webgl-native'],
    'node tools/verify-webgl-runtime-health.mjs --native-gpu',
  );
  assert.match(testRunner, /webgl-runtime-health-verifier\.test\.mjs/);
});

test('diagnostic sequences preserve explicit order and repetition without admitting Initiation', () => {
  const selected = selectDiagnosticRuntimeCases([
    'wardrobe',
    'hub:cabin_two',
    'wardrobe',
  ]);

  assert.deepEqual(selected.map(({ id }) => id), [
    'wardrobe',
    'hub:cabin_two',
    'wardrobe',
  ]);
  assert.throws(
    () => selectDiagnosticRuntimeCases(['apartment:day-one-wake']),
    /not a non-Initiation runtime/i,
  );
  assert.throws(
    () => selectDiagnosticRuntimeCases(['initiation']),
    /not a non-Initiation runtime/i,
  );
});

test('driver preflight accepts a bounded cold loss only after restoration and stable disposal', () => {
  const result = evaluateDriverPreflight({
    created: true,
    coldLossEvents: 1,
    restorationEvents: 1,
    stable: true,
    lostBeforeDispose: false,
    glError: 0,
    disposed: true,
  });

  assert.deepEqual(result, { ok: true, problems: [], coldStartRecovered: true });
});

test('driver preflight rejects missing, unrestored, erroneous, or undisposed scratch contexts', () => {
  for (const telemetry of [
    { created: false, stable: false, disposed: false },
    {
      created: true,
      coldLossEvents: 1,
      restorationEvents: 0,
      stable: false,
      lostBeforeDispose: true,
      glError: 37442,
      disposed: true,
    },
    {
      created: true,
      coldLossEvents: 0,
      restorationEvents: 0,
      stable: true,
      lostBeforeDispose: false,
      glError: 1282,
      disposed: true,
    },
    {
      created: true,
      coldLossEvents: 0,
      restorationEvents: 0,
      stable: true,
      lostBeforeDispose: false,
      glError: 0,
      disposed: false,
    },
  ]) {
    assert.equal(evaluateDriverPreflight(telemetry).ok, false);
  }
});

test('runtime readiness fails fast on WebGL creation or visible boot failure', () => {
  const hiddenDocument = { querySelectorAll: () => [] };
  const readyRoot = {
    APP: { scene: {} },
    __squatchWebGLHealth: { contexts: [{}], creationFailures: 0 },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  };
  assert.equal(runtimeReadinessOutcome({
    keys: ['APP', 'scene'], root: readyRoot, documentRoot: hiddenDocument, requireContext: true,
  }), 'ready');
  assert.equal(runtimeReadinessOutcome({
    keys: ['APP', 'scene'],
    root: { ...readyRoot, __squatchWebGLHealth: { contexts: [], creationFailures: 1 } },
    documentRoot: hiddenDocument,
    requireContext: true,
  }), 'webgl-failed');

  const overlay = {
    hidden: false,
    getAttribute: () => null,
  };
  assert.equal(runtimeReadinessOutcome({
    keys: ['APP', 'scene'],
    root: { ...readyRoot, __squatchWebGLHealth: { contexts: [], creationFailures: 0 } },
    documentRoot: { querySelectorAll: () => [overlay] },
    requireContext: true,
  }), 'boot-failed');
  assert.equal(runtimeReadinessOutcome({
    keys: ['APP', 'scene'],
    root: { getComputedStyle: readyRoot.getComputedStyle },
    documentRoot: hiddenDocument,
    requireContext: true,
  }), null);
});

test('native-GPU mode removes software fallback launch args and selects installed Chrome on Windows', () => {
  const portable = createWebGLRuntimeMode({ argv: [], env: {}, platform: 'win32' });
  assert.equal(portable.nativeGpu, false);
  assert.match(portable.launchOptions.args.join(' '), /swiftshader/i);

  const native = createWebGLRuntimeMode({
    argv: ['--native-gpu'], env: {}, platform: 'win32',
  });
  assert.equal(native.nativeGpu, true);
  assert.equal(native.launchOptions.channel, 'chrome');
  assert.doesNotMatch(native.launchOptions.args.join(' '), /swiftshader/i);
  assert.ok(native.launchOptions.ignoreDefaultArgs.includes('--enable-unsafe-swiftshader'));

  const explicit = createWebGLRuntimeMode({
    argv: ['--native-gpu'],
    env: { PLAYWRIGHT_NATIVE_CHROME: 'C:\\Chrome\\chrome.exe' },
    platform: 'linux',
  });
  assert.equal(explicit.launchOptions.executablePath, 'C:\\Chrome\\chrome.exe');
  assert.equal('channel' in explicit.launchOptions, false);
});

test('native-GPU mode rejects software renderers without weakening portable health', () => {
  const swiftShader = 'ANGLE (Google, Vulkan 1.3 (SwiftShader Device), SwiftShader driver)';
  assert.deepEqual(classifyWebGLRenderer(swiftShader), {
    native: false,
    reason: 'software renderer',
  });
  assert.deepEqual(classifyWebGLRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)'), {
    native: true,
    reason: null,
  });
  for (const genericRenderer of ['WebKit WebGL', 'ANGLE', 'WebGL', 'WebGL 2.0']) {
    assert.deepEqual(classifyWebGLRenderer(genericRenderer), {
      native: false,
      reason: 'non-identifying renderer',
    });
  }

  const telemetry = {
    created: true,
    coldLossEvents: 0,
    restorationEvents: 0,
    stable: true,
    lostBeforeDispose: false,
    glError: 0,
    disposed: true,
    renderer: swiftShader,
  };
  assert.equal(evaluateDriverPreflight(telemetry).ok, true);
  assert.equal(evaluateDriverPreflight(telemetry, { requireNativeGpu: true }).ok, false);
});
