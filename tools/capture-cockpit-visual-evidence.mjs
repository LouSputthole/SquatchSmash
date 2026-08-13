import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIRECT_INVOCATION = Boolean(process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href);
const IMMUTABLE_WORKER = process.env.COCKPIT_VISUAL_EVIDENCE_IMMUTABLE_WORKER === '1';

let COCKPIT_VISUAL_EVIDENCE_SHOTS;
let COCKPIT_VISUAL_EVIDENCE_VIEWPORT;
let assertCockpitVisualEvidenceSourcesUnchanged;
let buildCockpitVisualEvidenceLedger;
let parseCockpitVisualEvidenceRun;
let snapshotCockpitVisualEvidenceSources;
let cockpitEvidenceDrawPolicy;
let buildCockpitRootPalette;
let installCockpitVisualEvidencePageApi;
let measureCockpitAnnulusSurfaceFit;
let measureCockpitDoorShellSweep;
let measureCockpitYokeJoins;
let resolveCockpitVisualOwnerRoots;
let resolveCockpitRuntime;
let bindCockpitScreenshotArtifact;
let measureCockpitIdMask;
let closeEvidenceLifecycle;
let listenEvidenceServer;
let beginEvidenceOutputTransaction;

async function loadCockpitEvidenceModules() {
  const [contract, pageApi, pixelProof, lifecycle, transaction] = await Promise.all([
    import('./cockpit-visual-evidence-contract.mjs'),
    import('./cockpit-visual-page-api.mjs'),
    import('./cockpit-visual-pixel-proof.mjs'),
    import('./evidence-lifecycle.mjs'),
    import('./evidence-output-transaction.mjs'),
  ]);
  ({
    COCKPIT_VISUAL_EVIDENCE_SHOTS,
    COCKPIT_VISUAL_EVIDENCE_VIEWPORT,
    assertCockpitVisualEvidenceSourcesUnchanged,
    buildCockpitVisualEvidenceLedger,
    parseCockpitVisualEvidenceRun,
    snapshotCockpitVisualEvidenceSources,
  } = contract);
  ({
    cockpitEvidenceDrawPolicy,
    buildCockpitRootPalette,
    installCockpitVisualEvidencePageApi,
    measureCockpitAnnulusSurfaceFit,
    measureCockpitDoorShellSweep,
    measureCockpitYokeJoins,
    resolveCockpitVisualOwnerRoots,
    resolveCockpitRuntime,
  } = pageApi);
  ({ bindCockpitScreenshotArtifact, measureCockpitIdMask } = pixelProof);
  ({ closeEvidenceLifecycle, listenEvidenceServer } = lifecycle);
  ({ beginEvidenceOutputTransaction } = transaction);
}

/* A direct CLI launcher executes only built-ins.  All local evidence modules
 * load only in the content-addressed worker; library/test imports keep their
 * ordinary fully-initialized API. */
if (!DIRECT_INVOCATION || IMMUTABLE_WORKER) await loadCockpitEvidenceModules();

const STATIC_TYPES = Object.freeze({
  '.bin': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

export function resolveCockpitStaticRequest(workspaceRoot, requestUrl) {
  const root = path.resolve(workspaceRoot);
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  } catch {
    throw new Error(`unsafe static request: ${requestUrl}`);
  }
  if (!pathname || pathname === '/') throw new Error('cockpit static server requires an explicit file');
  if (pathname.includes('\0')) throw new Error(`unsafe static request: ${requestUrl}`);
  const file = pathname.replace(/^\/+/, '').replaceAll('\\', '/');
  const absoluteFile = path.resolve(root, file);
  if (absoluteFile === root || !absoluteFile.startsWith(`${root}${path.sep}`)) {
    throw new Error(`cockpit static request escaped workspace: ${requestUrl}`);
  }
  return { absoluteFile, file };
}

export function createCockpitVisualEvidenceServer(options) {
  return http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        response.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      const resolved = resolveCockpitStaticRequest(options.workspaceRoot, request.url);
      const immutable = options.immutableSourceBytes?.get?.(resolved.file);
      if (!immutable) throw new Error(`cockpit resource was absent from capture-start closure: ${resolved.file}`);
      const bytes = immutable;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': bytes.length,
        'Content-Type': STATIC_TYPES[path.extname(resolved.absoluteFile).toLowerCase()]
          ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'X-Cockpit-Source-Bytes': String(bytes.length),
        'X-Cockpit-Source-File': resolved.file,
        'X-Cockpit-Source-Sha256': sha256,
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      const forbidden = /escaped workspace|unsafe static request/.test(error?.message ?? '');
      response.writeHead(forbidden ? 403 : 404, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end(forbidden ? 'forbidden' : 'not found');
    }
  });
}

async function defaultLaunchBrowser() {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true });
}

function diagnosticMessage(value) {
  if (typeof value === 'string') return value.slice(0, 1000);
  return String(value?.message ?? value ?? 'unknown browser error').slice(0, 1000);
}

function installDiagnostics(context, page, baseUrl) {
  const diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    httpErrors: [],
    requestFailures: [],
    contextErrors: [],
  };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(diagnosticMessage(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(diagnosticMessage(message.text()));
  });
  page.on('requestfailed', (request) => diagnostics.requestFailures.push(
    `${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`.slice(0, 1000),
  ));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      diagnostics.httpErrors.push(`${response.status()} ${response.url()}`.slice(0, 1000));
    }
  });
  page.on('crash', () => diagnostics.contextErrors.push('page crashed'));
  context.on?.('weberror', (webError) => diagnostics.contextErrors.push(
    diagnosticMessage(webError?.error?.() ?? webError),
  ));
  return diagnostics;
}

async function bindServedResponse(response, options) {
  const headers = response.headers();
  const declaredFile = headers['x-cockpit-source-file'];
  const declaredBytes = Number(headers['x-cockpit-source-bytes']);
  const declaredSha256 = headers['x-cockpit-source-sha256'];
  const resolved = resolveCockpitStaticRequest(options.workspaceRoot, response.url());
  if (!declaredFile || declaredFile !== resolved.file
      || !Number.isSafeInteger(declaredBytes) || declaredBytes <= 0
      || !/^[a-f0-9]{64}$/.test(declaredSha256 ?? '')) {
    throw new Error(`served cockpit source omitted binding headers: ${response.url()}`);
  }
  const captureStartBytes = options.immutableSourceBytes?.get?.(resolved.file);
  if (!captureStartBytes) {
    throw new Error(`served cockpit source was absent from capture-start closure: ${resolved.file}`);
  }
  const servedBytes = await response.body();
  const sha256 = createHash('sha256').update(servedBytes).digest('hex');
  const captureStartSha256 = createHash('sha256').update(captureStartBytes).digest('hex');
  if (servedBytes.length !== declaredBytes || sha256 !== declaredSha256
      || servedBytes.length !== captureStartBytes.length || sha256 !== captureStartSha256) {
    throw new Error(`served cockpit source differs from capture-start bytes: ${resolved.file}`);
  }
  return Object.freeze({
    url: response.url(),
    file: resolved.file,
    resourceType: response.request().resourceType(),
    status: response.status(),
    bytes: servedBytes.length,
    sha256,
    captureStartBytes: captureStartBytes.length,
    captureStartSha256,
  });
}

const COCKPIT_LOCAL_RESOURCE_TYPES = new Set([
  'document', 'stylesheet', 'image', 'media', 'font', 'script', 'xhr', 'fetch',
  'manifest', 'other',
]);

/** Track a growing same-origin request set until every body and request has
 * settled through one complete quiet epoch.  The returned tracker stays
 * attached after sealing so a late request becomes a capture failure instead
 * of silently escaping the served-byte ledger. */
export function installCockpitServedResponseTracker(page, options, runtime, trackerOptions = {}) {
  const tracked = new Map();
  const entries = [];
  const quietMs = Number.isFinite(trackerOptions.quietMs) ? trackerOptions.quietMs : 150;
  const timeoutMs = Number.isFinite(trackerOptions.timeoutMs) ? trackerOptions.timeoutMs : 10000;
  let lastActivity = Date.now();
  let activitySerial = 0;
  let sealed = false;
  const wait = (milliseconds) => (typeof page.waitForTimeout === 'function'
    ? page.waitForTimeout(milliseconds)
    : new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const recordActivity = () => {
    activitySerial += 1;
    lastActivity = Date.now();
  };
  const trackRequest = (request) => {
    if (tracked.has(request)) return tracked.get(request);
    const resourceType = request.resourceType();
    if (!COCKPIT_LOCAL_RESOURCE_TYPES.has(resourceType)) return null;
    let url;
    try { url = new URL(request.url()); } catch { return null; }
    if (url.origin !== options.baseUrl) return null;
    if (sealed) {
      runtime.requestFailures.push(`cockpit request started after quiescence ${resourceType} ${request.url()}`);
    }
    const state = {
      url: request.url(), resourceType, responseSeen: false, bodySettled: false,
      finished: false, failed: false, bodyPromise: null,
    };
    tracked.set(request, state);
    recordActivity();
    return state;
  };
  page.on('request', trackRequest);
  page.on('response', (response) => {
    const state = trackRequest(response.request());
    if (!state) return;
    state.responseSeen = true;
    recordActivity();
    const work = (response.status() >= 200 && response.status() < 400
      ? bindServedResponse(response, options).then((entry) => entries.push(entry))
      : Promise.resolve())
      .catch((error) => runtime.requestFailures.push(
        `cockpit served-byte capture ${response.url()} :: ${diagnosticMessage(error)}`,
      ))
      .finally(() => {
        state.bodySettled = true;
        recordActivity();
      });
    state.bodyPromise = work;
  });
  page.on('requestfinished', (request) => {
    const state = trackRequest(request);
    if (!state) return;
    state.finished = true;
    recordActivity();
  });
  page.on('requestfailed', (request) => {
    const state = trackRequest(request);
    if (!state) return;
    state.failed = true;
    state.finished = true;
    recordActivity();
  });
  return async (launchDocument) => {
    const startedAt = Date.now();
    let timedOut = false;
    while (true) {
      const observedSerial = activitySerial;
      const bodyPromises = [...tracked.values()].map(({ bodyPromise }) => bodyPromise).filter(Boolean);
      await Promise.allSettled(bodyPromises);
      const states = [...tracked.values()];
      const active = states.some((state) => (
        !state.finished || (state.responseSeen && !state.bodySettled)
      ));
      if (!active && observedSerial === activitySerial && Date.now() - lastActivity >= quietMs) break;
      if (Date.now() - startedAt > timeoutMs) {
        timedOut = true;
        runtime.requestFailures.push('cockpit served-byte capture did not reach request quiescence');
        break;
      }
      await wait(Math.min(25, Math.max(1, quietMs)));
    }
    const states = [...tracked.values()];
    for (const state of states) {
      if (!state.failed && (!state.responseSeen || !state.bodySettled || !state.finished)) {
        runtime.requestFailures.push(
          `cockpit served-byte capture incomplete ${state.resourceType} ${state.url}`,
        );
      }
    }
    const normalized = [...entries].sort((left, right) => (
      `${left.file}\0${left.url}\0${left.resourceType}\0${left.status}\0${left.sha256}`
        .localeCompare(`${right.file}\0${right.url}\0${right.resourceType}\0${right.status}\0${right.sha256}`)
    ));
    const pendingCount = states.filter(({ finished }) => !finished).length;
    const bodyPendingCount = states.filter(({ responseSeen, bodySettled }) => responseSeen && !bodySettled).length;
    sealed = true;
    return Object.freeze({
      launchDocument,
      entries: Object.freeze(normalized),
      fingerprint: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
      quiescence: Object.freeze({
        sealed: true,
        timedOut,
        quietMs,
        requestCount: states.length,
        responseCount: states.filter(({ responseSeen }) => responseSeen).length,
        finishedCount: states.filter(({ finished }) => finished).length,
        failedCount: states.filter(({ failed }) => failed).length,
        pendingCount,
        bodyPendingCount,
        activitySerial,
      }),
    });
  };
}

async function installPageEvidenceApi(page) {
  await page.evaluate(async ({ annulusSource, drawPolicySource, installSource, ownerSource,
    resolveSource, rootPaletteSource, doorShellSource, yokeJoinSource }) => {
    const install = (0, eval)(`(${installSource})`);
    const measureAnnulusSurfaceFit = (0, eval)(`(${annulusSource})`);
    const resolveRuntime = (0, eval)(`(${resolveSource})`);
    const resolveOwners = (0, eval)(`(${ownerSource})`);
    const drawPolicy = (0, eval)(`(${drawPolicySource})`);
    const rootPalette = (0, eval)(`(${rootPaletteSource})`);
    const measureDoorShellSweep = (0, eval)(`(${doorShellSource})`);
    const measureYokeJoins = (0, eval)(`(${yokeJoinSource})`);
    window.__cockpitVisualEvidenceApi = await install(
      resolveRuntime, drawPolicy, resolveOwners, measureAnnulusSurfaceFit, rootPalette,
      measureYokeJoins, measureDoorShellSweep,
    );
  }, {
    annulusSource: measureCockpitAnnulusSurfaceFit.toString(),
    drawPolicySource: cockpitEvidenceDrawPolicy.toString(),
    installSource: installCockpitVisualEvidencePageApi.toString(),
    ownerSource: resolveCockpitVisualOwnerRoots.toString(),
    resolveSource: resolveCockpitRuntime.toString(),
    rootPaletteSource: buildCockpitRootPalette.toString(),
    doorShellSource: measureCockpitDoorShellSweep.toString(),
    yokeJoinSource: measureCockpitYokeJoins.toString(),
  });
}

async function pageEvidenceOperation(page, op, spec, viewport) {
  return page.evaluate(async ({ operation, shotSpec, size }) => {
    const api = window.__cockpitVisualEvidenceApi;
    if (!api || typeof api[operation] !== 'function') {
      throw new Error(`cockpit page evidence API does not implement ${operation}`);
    }
    return api[operation](shotSpec, size);
  }, { operation: op, shotSpec: spec, size: viewport });
}

/** Installed before the launch document executes, so callbacks scheduled by
 * module initialization are known and cancellable at the evidence boundary. */
export function installCockpitEvidenceScheduler(target) {
  const root = target ?? globalThis;
  if (root.__cockpitEvidenceScheduler) return root.__cockpitEvidenceScheduler;
  const native = {
    setTimeout: root.setTimeout.bind(root),
    clearTimeout: root.clearTimeout.bind(root),
    setInterval: root.setInterval.bind(root),
    clearInterval: root.clearInterval.bind(root),
    requestAnimationFrame: root.requestAnimationFrame?.bind(root),
    cancelAnimationFrame: root.cancelAnimationFrame?.bind(root),
  };
  const timers = new Set();
  const intervals = new Set();
  const animationFrames = new Set();
  let frozen = false;
  let generation = 0;
  root.setTimeout = (callback, delay, ...args) => {
    if (frozen) return 0;
    let handle;
    handle = native.setTimeout((...values) => {
      timers.delete(handle);
      if (!frozen) callback(...values);
    }, delay, ...args);
    timers.add(handle);
    return handle;
  };
  root.clearTimeout = (handle) => {
    timers.delete(handle);
    return native.clearTimeout(handle);
  };
  root.setInterval = (callback, delay, ...args) => {
    if (frozen) return 0;
    const handle = native.setInterval((...values) => {
      if (!frozen) callback(...values);
    }, delay, ...args);
    intervals.add(handle);
    return handle;
  };
  root.clearInterval = (handle) => {
    intervals.delete(handle);
    return native.clearInterval(handle);
  };
  if (native.requestAnimationFrame && native.cancelAnimationFrame) {
    root.requestAnimationFrame = (callback) => {
      if (frozen) return 0;
      let handle;
      handle = native.requestAnimationFrame((time) => {
        animationFrames.delete(handle);
        if (!frozen) callback(time);
      });
      animationFrames.add(handle);
      return handle;
    };
    root.cancelAnimationFrame = (handle) => {
      animationFrames.delete(handle);
      return native.cancelAnimationFrame(handle);
    };
  }
  const snapshot = () => Object.freeze({
    installedBeforeModules: true,
    frozen,
    generation,
    pendingTimers: timers.size,
    pendingIntervals: intervals.size,
    pendingAnimationFrames: animationFrames.size,
  });
  const scheduler = Object.freeze({
    snapshot,
    freeze() {
      if (!frozen) {
        frozen = true;
        generation += 1;
        for (const handle of timers) native.clearTimeout(handle);
        for (const handle of intervals) native.clearInterval(handle);
        for (const handle of animationFrames) native.cancelAnimationFrame?.(handle);
        timers.clear();
        intervals.clear();
        animationFrames.clear();
      }
      return snapshot();
    },
  });
  Object.defineProperty(root, '__cockpitEvidenceScheduler', {
    value: scheduler, configurable: false, enumerable: false, writable: false,
  });
  return scheduler;
}

export async function captureCockpitVisualShot({ browser, options, transaction, spec }) {
  const viewport = COCKPIT_VISUAL_EVIDENCE_VIEWPORT;
  const imageName = `${options.label}-${spec.id}.png`;
  const maskName = `${options.label}-${spec.id}-id-mask.png`;
  const imagePath = transaction.stagePath(imageName);
  const maskPath = transaction.stagePath(maskName);
  const fresh = {
    screenshotAbsentBefore: !fs.existsSync(imagePath),
    maskAbsentBefore: !fs.existsSync(maskPath),
  };
  if (!fresh.screenshotAbsentBefore || !fresh.maskAbsentBefore) {
    throw new Error(`cockpit evidence staged artifact already exists: ${spec.id}`);
  }

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(installCockpitEvidenceScheduler);
  const page = await context.newPage();
  const runtime = installDiagnostics(context, page, options.baseUrl);
  const settleServedResponses = installCockpitServedResponseTracker(page, options, runtime);
  let capture = null;
  let maskActive = false;
  let failure = null;
  try {
    const launchDocument = `${options.baseUrl}/${spec.page}`;
    await page.goto(launchDocument, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction((scene) => (
      scene === 'beefrun' ? window.__squatch?.beefrun === true : window.__squatch?.enolaSquatch === true
    ), spec.scene, { timeout: 120000 });
    await page.addStyleTag({ content: `
      html, body { margin: 0 !important; width: 100% !important; height: 100% !important;
        overflow: hidden !important; background: #000 !important; }
      body > *:not(#scene)${spec.pose.gun ? ':not(#enola-combat)' : ''} { display: none !important; }
      #scene { display: block !important; position: fixed !important; inset: 0 !important;
        width: ${viewport.width}px !important; height: ${viewport.height}px !important; }
    ` });
    await installPageEvidenceApi(page);
    await pageEvidenceOperation(page, 'prepare', spec, viewport);
    await pageEvidenceOperation(page, 'freeze', spec, viewport);
    const served = await settleServedResponses(launchDocument);
    const normalRender = await pageEvidenceOperation(page, 'renderNormal', spec, viewport);
    const before = normalRender.binding;
    const pngBinding = normalRender.binding;
    const imageCaptured = await page.screenshot({ path: imagePath, type: 'png', animations: 'disabled' });
    const imageDisk = fs.readFileSync(imagePath);
    const imageArtifact = bindCockpitScreenshotArtifact(imageCaptured, imageDisk, imageName);

    const maskStart = await pageEvidenceOperation(page, 'beginOwnerMask', spec, viewport);
    maskActive = true;
    const maskCaptured = await page.screenshot({ path: maskPath, type: 'png', animations: 'disabled' });
    const maskDisk = fs.readFileSync(maskPath);
    const maskArtifact = bindCockpitScreenshotArtifact(maskCaptured, maskDisk, maskName);
    const restored = await pageEvidenceOperation(page, 'endOwnerMask', spec, viewport);
    maskActive = false;
    const after = await pageEvidenceOperation(page, 'capture', spec, viewport);
    const measured = measureCockpitIdMask(imageDisk, maskDisk, maskStart.ownerPalette);
    capture = {
      id: spec.id,
      scene: spec.scene,
      page: spec.page,
      baseUrl: options.baseUrl,
      fresh,
      runtime,
      before,
      pngBinding,
      after,
      screenshot: {
        ...imageArtifact,
        ownerMask: maskArtifact,
        pixelProof: {
          ...measured,
          maskBinding: maskStart.binding,
          restoredBinding: restored.binding,
        },
      },
      renderReceipts: {
        normal: normalRender.receipt,
        mask: maskStart.receipt,
        restored: restored.receipt,
      },
      served,
    };
  } catch (error) {
    failure = error;
    if (maskActive) {
      try { await pageEvidenceOperation(page, 'endOwnerMask', spec, viewport); } catch { /* preserve capture error */ }
    }
  }
  try {
    await context.close();
  } catch (error) {
    runtime.contextErrors.push(diagnosticMessage(error));
    failure ??= error;
  }
  if (failure) throw failure;
  return capture;
}

function stagedArtifactIdentities(transaction, captures) {
  return captures.flatMap((capture) => [capture?.screenshot, capture?.screenshot?.ownerMask])
    .map((artifact) => {
      if (!artifact?.file) throw new Error('cockpit capture omitted an artifact file');
      const staged = transaction.stagePath(artifact.file);
      const bytes = fs.readFileSync(staged);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== artifact.bytes || sha256 !== artifact.sha256) {
        throw new Error(`staged cockpit artifact differs from its capture binding: ${artifact.file}`);
      }
      return Object.freeze({ file: artifact.file, bytes: bytes.length, sha256 });
    });
}

export async function captureCockpitVisualEvidence(
  args = process.argv.slice(2),
  _env = process.env,
  dependencies = {},
) {
  const options = parseCockpitVisualEvidenceRun(args);
  const transaction = beginEvidenceOutputTransaction({
    outputDir: options.outputDir,
    label: options.label,
  });
  const createServer = dependencies.createServer ?? createCockpitVisualEvidenceServer;
  const listenServer = dependencies.listenServer ?? listenEvidenceServer;
  const launchBrowser = dependencies.launchBrowser ?? defaultLaunchBrowser;
  const captureShot = dependencies.captureShot ?? captureCockpitVisualShot;
  const closeLifecycle = dependencies.closeLifecycle ?? closeEvidenceLifecycle;
  const snapshotSources = dependencies.snapshotSources ?? snapshotCockpitVisualEvidenceSources;
  let server = null;
  let browser = null;
  const captures = [];
  const startedAt = new Date().toISOString();
  try {
    const sourceSnapshot = snapshotSources();
    const sourceStart = sourceSnapshot.identity;
    const expectedSourceSha256 = process.env.COCKPIT_VISUAL_EVIDENCE_EXPECTED_SOURCE_SHA256;
    const bootstrapProof = IMMUTABLE_WORKER ? Object.freeze({
      mode: 'content-addressed-worker',
      verified: /^[a-f0-9]{64}$/.test(expectedSourceSha256 ?? '')
        && expectedSourceSha256 === sourceStart.sourceSnapshotSha256,
      expectedSourceSha256,
      executedSourceSha256: sourceStart.sourceSnapshotSha256,
    }) : dependencies.bootstrapProof === 'test-injected' ? Object.freeze({
      mode: 'test-injected',
      verified: true,
      expectedSourceSha256: sourceStart.sourceSnapshotSha256,
      executedSourceSha256: sourceStart.sourceSnapshotSha256,
    }) : null;
    if (bootstrapProof?.verified !== true) {
      throw new Error('cockpit evidence must execute from its capture-start immutable source closure');
    }
    const runtimeOptions = Object.freeze({
      ...options,
      immutableSourceBytes: sourceSnapshot.immutableSourceBytes,
    });
    server = createServer(runtimeOptions);
    await listenServer(server, runtimeOptions.port);
    browser = await launchBrowser();
    for (const spec of COCKPIT_VISUAL_EVIDENCE_SHOTS) {
      captures.push(await captureShot({ browser, server, options: runtimeOptions, transaction, spec }));
    }
    const artifactIdentities = stagedArtifactIdentities(transaction, captures);
    const sourceEnd = assertCockpitVisualEvidenceSourcesUnchanged(sourceStart);
    const completedAt = new Date().toISOString();
    const evidence = buildCockpitVisualEvidenceLedger({
      options,
      captures,
      artifactIdentities,
      sourceStart,
      sourceEnd,
      bootstrapProof,
      startedAt,
      completedAt,
    });
    if (!evidence.checks.allPassed) {
      const failed = Object.entries(evidence.checks)
        .filter(([, passed]) => passed !== true).map(([name]) => name);
      throw new Error(`cockpit visual evidence rejected: ${failed.join(', ')}`);
    }
    /* Runtime resources close before the ledger publication boundary. */
    await closeLifecycle({ browser, server });
    browser = null;
    server = null;
    const publication = transaction.commit({
      artifacts: artifactIdentities,
      ledgerName: `${options.label}-evidence.json`,
      ledgerBytes: `${JSON.stringify(evidence, null, 2)}\n`,
    });
    return Object.freeze({ evidence, publication });
  } catch (captureError) {
    let failure = captureError;
    try {
      await closeLifecycle({ browser, server });
    } catch (cleanupError) {
      failure = new AggregateError([captureError, cleanupError], 'capture and lifecycle cleanup failed');
    } finally {
      transaction.abort();
    }
    throw failure;
  }
}

/** Materialize the contract-computed source/resource closure without importing
 * any evidence module from the mutable workspace in the launcher process. */
export function materializeCockpitImmutableBootstrap(workspaceRoot, destinationRoot, dependencies = {}) {
  const sourceRoot = path.resolve(workspaceRoot);
  const destination = path.resolve(destinationRoot);
  const allowedParent = path.resolve(sourceRoot, '.tmp');
  if (destination === allowedParent || !destination.startsWith(`${allowedParent}${path.sep}`)) {
    throw new Error(`cockpit immutable bootstrap must stay below ${allowedParent}`);
  }
  fs.mkdirSync(path.join(destination, 'tools'), { recursive: true });
  const captureSource = fileURLToPath(import.meta.url);
  const contractSource = path.resolve(path.dirname(captureSource), 'cockpit-visual-evidence-contract.mjs');
  const directoryTransactionSource = path.resolve(
    path.dirname(captureSource), 'evidence-directory-transaction.mjs',
  );
  const stagedCapture = path.join(destination, 'tools', 'capture-cockpit-visual-evidence.mjs');
  const stagedContract = path.join(destination, 'tools', 'cockpit-visual-evidence-contract.mjs');
  const stagedDirectoryTransaction = path.join(
    destination, 'tools', 'evidence-directory-transaction.mjs',
  );
  fs.copyFileSync(captureSource, stagedCapture);
  fs.copyFileSync(contractSource, stagedContract);
  /* The default planner imports the staged contract before it can compute and
   * materialize the full closure. Pre-stage the contract's sole local planner
   * dependency so no mutable-workspace module executes in that child. */
  fs.copyFileSync(directoryTransactionSource, stagedDirectoryTransaction);
  const manifestPath = path.join(destination, '.cockpit-immutable-bootstrap.json');
  if (typeof dependencies.snapshotSources === 'function') {
    const snapshot = dependencies.snapshotSources(sourceRoot);
    for (const [file, bytes] of snapshot.immutableSourceBytes) {
      const target = path.resolve(destination, file);
      if (!target.startsWith(`${destination}${path.sep}`)) {
        throw new Error(`bootstrap closure escaped destination: ${file}`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
    fs.writeFileSync(manifestPath, JSON.stringify({
      schema: 'squatch-cockpit-immutable-bootstrap/v1',
      sourceSnapshotSha256: snapshot.identity.sourceSnapshotSha256,
      materializedFiles: snapshot.immutableSourceBytes.size,
      identity: snapshot.identity,
    }, null, 2));
  } else {
  const planner = `
    import fs from 'node:fs';
    import path from 'node:path';
    import { pathToFileURL } from 'node:url';
    const sourceRoot = ${JSON.stringify(sourceRoot)};
    const destination = ${JSON.stringify(destination)};
    const contract = await import(pathToFileURL(${JSON.stringify(stagedContract)}).href);
    const snapshot = contract.snapshotCockpitVisualEvidenceSources(sourceRoot);
    for (const [file, bytes] of snapshot.immutableSourceBytes) {
      const target = path.resolve(destination, file);
      if (!target.startsWith(destination + path.sep)) throw new Error('bootstrap closure escaped destination: ' + file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
    fs.writeFileSync(${JSON.stringify(manifestPath)}, JSON.stringify({
      schema: 'squatch-cockpit-immutable-bootstrap/v1',
      sourceSnapshotSha256: snapshot.identity.sourceSnapshotSha256,
      materializedFiles: snapshot.immutableSourceBytes.size,
      identity: snapshot.identity,
    }, null, 2));
  `;
  const planned = spawnSync(process.execPath, ['--input-type=module', '--eval', planner], {
    cwd: sourceRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (planned.status !== 0) {
    throw new Error(`cockpit immutable bootstrap planner failed: ${planned.stderr || planned.error || planned.status}`);
  }
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== 'squatch-cockpit-immutable-bootstrap/v1'
      || !/^[a-f0-9]{64}$/.test(manifest.sourceSnapshotSha256 ?? '')
      || !Number.isSafeInteger(manifest.materializedFiles) || manifest.materializedFiles < 1) {
    throw new Error('cockpit immutable bootstrap planner returned an invalid manifest');
  }
  return Object.freeze({
    root: destination,
    worker: stagedCapture,
    manifestPath,
    manifest: Object.freeze(manifest),
  });
}

export function runCockpitImmutableBootstrap(args = process.argv.slice(2)) {
  const workspaceRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const bootstrapParent = path.resolve(workspaceRoot, '.tmp');
  fs.mkdirSync(bootstrapParent, { recursive: true });
  const destination = fs.mkdtempSync(path.join(bootstrapParent, 'cockpit-immutable-'));
  if (!destination.startsWith(`${bootstrapParent}${path.sep}`)) {
    throw new Error('cockpit immutable bootstrap resolved outside its workspace staging parent');
  }
  try {
    const bootstrap = materializeCockpitImmutableBootstrap(workspaceRoot, destination);
    const worker = spawnSync(process.execPath, [bootstrap.worker, ...args], {
      cwd: bootstrap.root,
      env: {
        ...process.env,
        COCKPIT_VISUAL_EVIDENCE_IMMUTABLE_WORKER: '1',
        COCKPIT_VISUAL_EVIDENCE_OUTPUT_ROOT: workspaceRoot,
        COCKPIT_VISUAL_EVIDENCE_EXPECTED_SOURCE_SHA256: bootstrap.manifest.sourceSnapshotSha256,
      },
      stdio: 'inherit',
      windowsHide: true,
    });
    if (worker.error) throw worker.error;
    return worker.status ?? 1;
  } finally {
    const resolved = path.resolve(destination);
    if (resolved.startsWith(`${bootstrapParent}${path.sep}`)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}

if (DIRECT_INVOCATION) {
  if (IMMUTABLE_WORKER) {
    captureCockpitVisualEvidence().then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch((error) => {
      process.stderr.write(`${error?.stack || error}\n`);
      process.exitCode = 1;
    });
  } else {
    try {
      process.exitCode = runCockpitImmutableBootstrap();
    } catch (error) {
      process.stderr.write(`${error?.stack || error}\n`);
      process.exitCode = 1;
    }
  }
}
