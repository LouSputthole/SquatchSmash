#!/usr/bin/env node
/**
 * The sweep.
 *
 *   node tools/scene-audit.mjs               every scene
 *   node tools/scene-audit.mjs mansion golf  just these
 *   node tools/scene-audit.mjs --json        machine-readable
 *   node tools/scene-audit.mjs --out audit.json
 *
 * The owner, after a playtest that found the same kinds of fault in a fourth
 * different scene:
 *
 *   "can we do a full pass on all scenes? WEve fixed a lot of things in some
 *    scenes that aren't fixed in others. Is there any full sweep we can do?"
 *
 * Yes, and this is it. Every defect this project has spent a day chasing has
 * turned out to belong to a very small number of CLASSES, and each of them is
 * measurable from the built scene graph without a human looking at it:
 *
 *   FLOATING / SUSPICIOUS_SUPPORT_GAP
 *                a thing with no support, or an unusually large visible gap
 *                to the nearest accepted support
 *   COPLANAR / COPLANAR_CROWDED
 *                two surfaces at the same depth, fighting for the pixel. This
 *                is the owner's "black bar ... non stop flicker", and when it
 *                was finally measured it was in every doorway in the mansion
 *   MIRRORED / SINGULAR / IMPOSSIBLE_TRANSFORM
 *                negative determinants, collapsed axes, non-finite matrices,
 *                or extreme local/world scales hidden by a normal-looking AABB
 *   UNNAMED      geometry no verifier can ever assert, because it has no name.
 *                `cylinder()` and `sphere()` in src/world/build.js silently
 *                drop the `name` option; only `box()` keeps it
 *   HUGE / TINY  a scale nobody meant
 *
 * WHAT THIS IS NOT. It is not a pass/fail gate and it deliberately does not
 * exit non-zero on findings: half of these are legitimate — a hanging lamp IS
 * floating, a decal IS coplanar with the wall it is stuck to. It is a
 * PRIORITISED LIST OF PLACES TO LOOK, ranked so the worst offenders in a
 * 6,000-mesh house come first. Judgement stays with the person reading it.
 *
 * It runs the real scenes in a real browser rather than parsing source,
 * because the faults are in the built matrices and not in the literals: the
 * chain that swung 1.56 m off its own hook was authored with correct-looking
 * numbers and rotated about the world origin.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  assertSceneAuditCaptureStable,
  buildSceneAuditEvidence,
  buildSceneAuditServedManifest,
  buildSceneAuditSourceSnapshot,
  createSceneAuditServedRecord,
  parseSceneAuditArgs,
  readSceneAuditHead,
  readSceneAuditWorkspace,
  resolveSceneAuditSelection,
  writeSceneAuditEvidenceAtomic,
} from './scene-audit-evidence.mjs';
import {
  SCENE_AUDIT_SCENES as SCENES,
  assessAuditSupport,
  buildSceneAuditReadinessExpression,
  classifyAuditSupport,
  classifyAuditTransform,
  collectAuditMeshItems,
  collectSceneAuditItems,
  createAuditFinding,
  findCoplanarAuditPairs,
  installKnownSceneRoots,
  isAuditExcludedEffectMesh,
  isAuditRenderableMesh,
  isMountedAuditName,
  isStructuralBaseAuditItem,
} from './scene-audit-scenes.mjs';

const requireFromWorker = createRequire(import.meta.url);

/** Capture and await promises returned by DOM click listeners during launch. */
export function buildSceneAuditStartTrackingExpression() {
  return `(() => {
    if (globalThis.__sceneAuditStartTrackingInstalled) return;
    globalThis.__sceneAuditStartTrackingInstalled = true;
    const EventTargetClass = globalThis.EventTarget;
    const originalAdd = EventTargetClass.prototype.addEventListener;
    const originalRemove = EventTargetClass.prototype.removeEventListener;
    const wrappers = new WeakMap();
    const listenersByTarget = new WeakMap();
    let tracking = false;
    let pending = [];
    const captureKey = (options) => (
      typeof options === 'boolean' ? options : Boolean(options?.capture)
    );
    const registrationsFor = (target, create = false) => {
      let registrations = listenersByTarget.get(target);
      if (!registrations && create) {
        registrations = new Map();
        listenersByTarget.set(target, registrations);
      }
      return registrations;
    };
    const remember = (target, type, listener, options) => {
      if (!listener) return;
      const registrations = registrationsFor(target, true);
      let byListener = registrations.get(type);
      if (!byListener) {
        byListener = new Map();
        registrations.set(type, byListener);
      }
      let captures = byListener.get(listener);
      if (!captures) {
        captures = new Set();
        byListener.set(listener, captures);
      }
      captures.add(captureKey(options));
    };
    const forget = (target, type, listener, options) => {
      const registrations = registrationsFor(target);
      const byListener = registrations?.get(type);
      const captures = byListener?.get(listener);
      if (!captures) return;
      captures.delete(captureKey(options));
      if (!captures.size) byListener.delete(listener);
      if (!byListener.size) registrations.delete(type);
    };
    const registeredCount = (target, type) => {
      const byListener = registrationsFor(target)?.get(type);
      if (!byListener) return 0;
      let count = 0;
      for (const captures of byListener.values()) count += captures.size;
      return count;
    };
    const wrapped = (listener) => {
      if (!listener || (typeof listener !== 'function' && typeof listener.handleEvent !== 'function')) {
        return listener;
      }
      if (wrappers.has(listener)) return wrappers.get(listener);
      const proxy = function (...args) {
        const result = typeof listener === 'function'
          ? listener.apply(this, args)
          : listener.handleEvent.apply(listener, args);
        if (tracking) pending.push(Promise.resolve(result));
        return result;
      };
      wrappers.set(listener, proxy);
      return proxy;
    };
    EventTargetClass.prototype.addEventListener = function (type, listener, options) {
      const result = originalAdd.call(this, type, wrapped(listener), options);
      remember(this, type, listener, options);
      return result;
    };
    EventTargetClass.prototype.removeEventListener = function (type, listener, options) {
      const result = originalRemove.call(this, type, wrappers.get(listener) || listener, options);
      forget(this, type, listener, options);
      return result;
    };
    globalThis.__sceneAuditStartControlHasTrackedListener = (control) => (
      registeredCount(control, 'click') > 0
    );
    globalThis.__sceneAuditStartControlReady = (control) => Boolean(control) && (
      globalThis.__sceneAuditStartControlHasTrackedListener(control)
      || typeof control.onclick === 'function'
    );
    globalThis.__sceneAuditBeginStartCapture = () => {
      pending = [];
      tracking = true;
    };
    globalThis.__sceneAuditEndStartCapture = async (timeoutMs = 120000) => {
      tracking = false;
      const captured = pending.splice(0);
      let timeoutId;
      try {
        await Promise.race([
          Promise.all(captured),
          new Promise((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error('scene launcher promise did not settle in time')),
              timeoutMs,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }
      return captured.length;
    };
  })()`;
}

/** Do not dispatch a synthetic start click until the page has actually wired it. */
export function sceneAuditStartControlsReady(
  selector,
  root = globalThis.document,
  isReady = globalThis.__sceneAuditStartControlReady,
) {
  const controls = [...(root?.querySelectorAll?.(selector) ?? [])];
  return controls.length > 0
    && typeof isReady === 'function'
    && controls.every((control) => isReady(control));
}

export async function closeSceneAuditServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Turn every static-file race/parse failure into an observed fatal response. */
export function createSceneAuditRequestHandler({
  root,
  types,
  fileSystem = fs,
  readFile = fsp.readFile,
  onError = () => {},
  onServed = () => {},
}) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const file = path.join(
        root,
        decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
      );
      const relativeFile = path.relative(root, file);
      if (
        relativeFile === '..'
        || relativeFile.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativeFile)
        || !fileSystem.existsSync(file)
        || fileSystem.statSync(file).isDirectory()
      ) {
        res.writeHead(404).end('not found');
        return;
      }
      const bytes = await readFile(file);
      onServed(createSceneAuditServedRecord(relativeFile, bytes));
      res.writeHead(200, {
        'content-type': types[path.extname(file)] || 'application/octet-stream',
      });
      res.end(bytes);
    } catch (error) {
      onError(error);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
          .end('scene audit server error');
      } else {
        res.destroy?.(error);
      }
    }
  };
}

/** Own server/browser cleanup even when launch, page creation, or audit fails. */
export async function withSceneAuditResources({ openServer, openBrowser, run }) {
  let server = null;
  let browser = null;
  let primaryError = null;
  try {
    server = await openServer();
    browser = await openBrowser();
    return await run({ server, browser });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanup = await Promise.allSettled([
      browser?.close?.(),
      closeSceneAuditServer(server),
    ]);
    if (!primaryError) {
      const failed = cleanup.find(({ status }) => status === 'rejected');
      if (failed) throw failed.reason;
    }
  }
}

export async function runSceneAudit({
  root: ROOT,
  captureSources: CAPTURE_SOURCES,
  readSources,
}) {
const PORT = Number(process.env.PORT) || 5388;
const {
  asJson: AS_JSON,
  outputPath: OUTPUT_PATH,
  only: ONLY,
} = parseSceneAuditArgs(process.argv.slice(2));
const RUN_SCENES = resolveSceneAuditSelection(SCENES, ONLY);
const CAPTURE_START_HEAD = readSceneAuditHead(ROOT);
const CAPTURE_START = {
  head: CAPTURE_START_HEAD,
  workspace: readSceneAuditWorkspace(ROOT, { head: CAPTURE_START_HEAD }),
  sources: buildSceneAuditSourceSnapshot(CAPTURE_SOURCES),
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};
const READINESS = buildSceneAuditReadinessExpression();
const START_TRACKING = buildSceneAuditStartTrackingExpression();
const LAUNCH_ARGS = Object.freeze([
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
  '--mute-audio',
]);
const configuredExecutablePath = process.env.PLAYWRIGHT_CHROMIUM
  || (process.env.PLAYWRIGHT_BROWSERS_PATH
    ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : null);
const executableSource = process.env.PLAYWRIGHT_CHROMIUM
  ? 'PLAYWRIGHT_CHROMIUM'
  : (process.env.PLAYWRIGHT_BROWSERS_PATH
    ? 'PLAYWRIGHT_BROWSERS_PATH'
    : 'playwright-bundled');
const runtime = {
  node: {
    version: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  playwright: {
    version: requireFromWorker('playwright/package.json').version,
  },
  browser: {
    type: 'chromium',
    version: null,
    executableSource,
    executablePath: null,
    launchArgs: [...LAUNCH_ARGS],
  },
};

/**
 * The audit itself, as a string, because it runs inside the page.
 *
 * Kept as one self-contained function so it can be dropped into any scene's
 * console by hand when somebody is looking at a specific room.
 */
const AUDIT = `(() => {
  const THREE = globalThis.__auditTHREE;
  const roots = globalThis.__auditRoots;
  const assessAuditSupport = ${assessAuditSupport.toString()};
  const classifyAuditSupport = ${classifyAuditSupport.toString()};
  const classifyAuditTransform = ${classifyAuditTransform.toString()};
  const collectAuditMeshItems = ${collectAuditMeshItems.toString()};
  const collectSceneAuditItems = ${collectSceneAuditItems.toString()};
  const createAuditFinding = ${createAuditFinding.toString()};
  const findCoplanarAuditPairs = ${findCoplanarAuditPairs.toString()};
  const isAuditExcludedEffectMesh = ${isAuditExcludedEffectMesh.toString()};
  const isAuditRenderableMesh = ${isAuditRenderableMesh.toString()};
  const isMountedAuditName = ${isMountedAuditName.toString()};
  const isStructuralBaseAuditItem = ${isStructuralBaseAuditItem.toString()};
  const collected = collectSceneAuditItems(roots, THREE, {
    isRenderable: isAuditRenderableMesh,
    isExcludedEffect: isAuditExcludedEffectMesh,
    collectMesh: collectAuditMeshItems,
  });
  const items = collected.items;
  const out = {
    counted: collected.counted,
    findings: [],
    collectionErrors: collected.collectionErrors,
  };

  const push = (cls, item, detail, related = null, support = null) => {
    const finding = createAuditFinding(cls, item, detail, related, support);
    out.findings.push(finding);
    return finding;
  };

  /* ---- TRANSFORMS: determinant and scale survive AABB normalization. ---- */
  for (const it of items) {
    for (const finding of classifyAuditTransform(it)) {
      push(finding.cls, it, finding.detail);
    }
  }

  /* ---- HUGE / TINY ---- */
  for (const it of items) {
    const m = Math.max(it.size.x, it.size.y, it.size.z);
    if (m > 400) push('HUGE', it, m.toFixed(0) + ' m across');
    else if (m > 0 && m < 0.004) push('TINY', it, (m * 1000).toFixed(2) + ' mm across');
  }

  /* ---- UNNAMED: geometry no check can ever assert. ---- */
  const unnamed = items.filter((it) => !it.name);
  if (unnamed.length) {
    out.unnamed = unnamed.length;
    const byGeo = {};
    for (const it of unnamed) byGeo[it.geo] = (byGeo[it.geo] || 0) + 1;
    out.unnamedByGeometry = byGeo;
  }

  /* ---- FLOATING: nothing under it, within its own footprint. ----
   * A thing is supported if any other mesh's top is within 12 cm of its
   * bottom AND their footprints overlap. World height is irrelevant, so a
   * cellar is audited against its own floor instead of an absolute y=0 plane.
   * Anything hanging from above is excluded by semantic name tokens because
   * a chandelier and a floating crate look identical from underneath. */
  /* fender, lanyard, binocular, watch and cuff joined the list when
   * the first boat scene ran through it. A fender hangs over a rail on its
   * lanyard by definition, and a wristwatch and a cuff link are worn on a man
   * -- all five are the same statement the rest of this list makes: "this one
   * has nothing under it because that is what it is". */
  for (const assessment of assessAuditSupport(items)) {
    if (isMountedAuditName(assessment.item.name)) continue;
    const finding = classifyAuditSupport(assessment);
    if (!finding) continue;
    push(
      finding.cls,
      assessment.item,
      finding.detail,
      assessment.supporter,
      assessment,
    );
  }

  /* ---- COPLANAR: the flicker class. ----
   * Two axis-aligned faces within 0.6 mm of each other, overlapping by more
   * than a quarter of a square metre. That area threshold is what keeps this
   * from reporting every screw head in the building.
   */
  const FLAT = 0.0006;
  const AREA = 0.25;
  for (const result of findCoplanarAuditPairs(items, {
    flat: FLAT,
    minArea: AREA,
  })) {
    const { a, b, axis, area } = result;
    if (result.summary) {
      const finding = push(
        'COPLANAR_CROWDED',
        a,
        'crowded ' + axis + ' plane at ' + result.plane.toFixed(4)
          + ' m has ' + result.groupSize + ' meshes; bounded sample reported '
          + result.pairsReported + ' pairs in ' + result.comparisons + ' comparisons',
      );
      finding.coplanarSummary = {
        axis,
        plane: result.plane,
        groupSize: result.groupSize,
        possiblePairs: result.possiblePairs,
        comparisons: result.comparisons,
        pairsReported: result.pairsReported,
        truncated: result.truncated,
      };
      continue;
    }
    push(
      'COPLANAR',
      a,
      'shares the ' + axis + ' plane with ' + (b.name || '(unnamed)')
        + ' over ' + area.toFixed(2) + ' m² -- this is the flicker',
      b,
    );
  }

  return out;
})()`;

/* ------------------------------------------------------------------ */

const report = [];
const serverErrors = [];
const servedRecords = [];
await withSceneAuditResources({
  openServer: async () => {
    const server = http.createServer(createSceneAuditRequestHandler({
      root: ROOT,
      types: TYPES,
      onError: (error) => serverErrors.push(error?.message || String(error)),
      onServed: (record) => servedRecords.push(record),
    }));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, () => {
        server.off('error', reject);
        resolve();
      });
    });
    return server;
  },
  openBrowser: async () => {
    const { chromium } = await import('playwright');
    const effectiveExecutablePath = configuredExecutablePath || chromium.executablePath();
    const browser = await chromium.launch({
      executablePath: configuredExecutablePath || undefined,
      args: [...LAUNCH_ARGS],
    });
    runtime.browser.executablePath = effectiveExecutablePath.replaceAll('\\', '/');
    runtime.browser.version = browser.version();
    return browser;
  },
  run: async ({ browser }) => {
for (const scene of RUN_SCENES) {
  let page = null;
  let startHandlersAwaited = 0;
  let startHandlerDiagnostic = null;
  try {
  page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  await page.addInitScript({ content: START_TRACKING });
  const errors = [];
  const consoleErrors = [];
  const notFound = [];
  const httpErrors = [];
  const requestFailures = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status === 404) notFound.push(response.url());
    else if (status >= 400) httpErrors.push({ status, url: response.url() });
  });
  page.on('requestfailed', (request) => {
    requestFailures.push(`${request.url()} — ${request.failure()?.errorText ?? 'unknown failure'}`);
  });
    await page.goto(`http://localhost:${PORT}/${scene.url}`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1500);
    if (scene.start) {
      /* Clicked from inside the page rather than by Playwright, because a
       * scene's start button is often behind an overlay, mid-fade, or
       * requesting pointer lock, and actionability checks time out on all
       * three. The audit only needs the world BUILT; it never plays. */
      try {
        await page.waitForFunction(sceneAuditStartControlsReady, scene.start, { timeout: 120_000 });
      } catch (error) {
        throw new Error(
          `scene launcher control never became wired: ${scene.start} — ${error?.message || error}`,
        );
      }
      const startResult = await page.evaluate(async ({ selector, timeoutMs }) => {
        const controls = [...document.querySelectorAll(selector)];
        if (!controls.length) throw new Error(`scene launcher control not found: ${selector}`);
        const propertyOnly = controls.every((control) => (
          !globalThis.__sceneAuditStartControlHasTrackedListener(control)
          && typeof control.onclick === 'function'
        ));
        globalThis.__sceneAuditBeginStartCapture();
        for (const element of controls) element.click?.();
        return {
          captured: await globalThis.__sceneAuditEndStartCapture(timeoutMs),
          propertyOnly,
        };
      }, { selector: scene.start, timeoutMs: 120_000 });
      startHandlersAwaited = startResult.captured;
      if (startHandlersAwaited === 0) {
        startHandlerDiagnostic = startResult.propertyOnly
          ? 'launcher used onclick property; completion proven by hidden-state wait'
          : `scene launcher dispatch captured zero handlers: ${scene.start}`;
        if (!startResult.propertyOnly) throw new Error(startHandlerDiagnostic);
      }
      await page.waitForFunction((selector) => {
        const controls = [...document.querySelectorAll(selector)];
        if (!controls.length) return true;
        return controls.every((control) => {
          for (let element = control; element; element = element.parentElement) {
            const style = getComputedStyle(element);
            if (
              element.hidden
              || element.getAttribute?.('aria-hidden') === 'true'
              || style.display === 'none'
              || style.visibility === 'hidden'
              || Number(style.opacity) <= 0.001
            ) return true;
          }
          return control.getClientRects().length === 0;
        });
      }, scene.start, { timeout: 120_000 });
      await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));
    }
    /* Find the scene graph without knowing the scene's own handle: every one
     * of these builds a THREE.Scene, so look for it. Poll rather than wait a
     * fixed delay — the mansion takes tens of seconds to build under software
     * GL while the squatchfather is up in two, and a single guess misses one
     * end or wastes the other. Handles nest one level (NO_WAKE.scene,
     * __heistDebug.world.scene), so the walk looks one property deep too. */
    let found = 0;
    let rootCount = 0;
    const rootDeadline = Date.now() + 90_000;
    while (!found && Date.now() < rootDeadline) {
      await page.evaluate(async () => {
        if (!globalThis.__auditTHREE) {
          globalThis.__auditTHREE = await import('./vendor/three.module.min.js');
        }
      });
      if (scene.rootPaths?.length) {
        rootCount = await page.evaluate(installKnownSceneRoots, { paths: scene.rootPaths });
      } else {
        rootCount = await page.evaluate(() => {
        const roots = [];
        const seen = new Set();
        const consider = (v, depth) => {
          if (!v || typeof v !== 'object' || seen.has(v)) return;
          seen.add(v);
          if (v.isScene) { roots.push(v); return; }
          if (v.scene?.isScene) roots.push(v.scene);
          if (v.root?.isScene) roots.push(v.root);
          if (depth > 0) {
            for (const k of Object.keys(v)) {
              let c;
              try { c = v[k]; } catch { continue; }
              if (c && typeof c === 'object') consider(c, depth - 1);
            }
          }
        };
        for (const k of Object.keys(globalThis)) {
          try { consider(globalThis[k], 1); } catch { /* cross-origin getters */ }
        }
        globalThis.__auditRoots = [...new Set(roots)];
        return globalThis.__auditRoots.length;
        });
      }
      found = await page.evaluate(READINESS);
      if (!found) await page.waitForTimeout(1000);
    }
    if (!found) {
      report.push({
        scene: scene.id,
        error: rootCount
          ? 'THREE.Scene root stayed empty -- scene not audited'
          : 'no THREE.Scene reachable from a global -- scene not audited',
      });
      continue;
    }
    const result = await page.evaluate(AUDIT);
    report.push({
      scene: scene.id,
      ...result,
      startHandlersAwaited,
      ...(startHandlerDiagnostic ? { startHandlerDiagnostic } : {}),
      pageErrors: errors,
      consoleErrors: [...new Set(consoleErrors)],
      httpErrors: [...new Map(httpErrors.map((entry) => [
        `${entry.status}:${entry.url}`,
        entry,
      ])).values()],
      notFound: [...new Set(notFound)],
      requestFailures: [...new Set(requestFailures)],
    });
  } catch (e) {
    report.push({ scene: scene.id, error: e.message.split('\n')[0] });
  } finally {
    await page?.close();
  }
}
  },
});

if (serverErrors.length) {
  throw new Error(`scene audit server failed: ${serverErrors.join('; ')}`);
}

const captureEndHead = readSceneAuditHead(ROOT);
const captureEnd = {
  head: captureEndHead,
  workspace: readSceneAuditWorkspace(ROOT, { head: captureEndHead }),
  sources: buildSceneAuditSourceSnapshot(readSources()),
};
assertSceneAuditCaptureStable(CAPTURE_START, captureEnd);
const servedManifest = buildSceneAuditServedManifest(servedRecords);

const evidence = buildSceneAuditEvidence({
  report,
  scenes: RUN_SCENES,
  head: CAPTURE_START.head,
  tool: CAPTURE_SOURCES.tool,
  worker: CAPTURE_SOURCES.worker,
  runtimeDependencies: [CAPTURE_SOURCES.previewMode],
  runtime,
  servedManifest,
  evidenceTool: CAPTURE_SOURCES.evidenceTool,
  sceneConfig: CAPTURE_SOURCES.sceneConfig,
  workspace: CAPTURE_START.workspace,
});
const writtenEvidencePath = OUTPUT_PATH
  ? await writeSceneAuditEvidenceAtomic(OUTPUT_PATH, evidence)
  : null;
if (!evidence.coverage.complete) process.exitCode = 1;

if (AS_JSON) {
  console.log(JSON.stringify(evidence, null, 2));
} else {
  const ORDER = ['SINGULAR', 'IMPOSSIBLE_TRANSFORM', 'MIRRORED', 'HUGE', 'TINY', 'COPLANAR_CROWDED', 'COPLANAR', 'FLOATING', 'SUSPICIOUS_SUPPORT_GAP'];
  for (const r of report) {
    console.log(`\n${'='.repeat(66)}\n${r.scene.toUpperCase()}`);
    if (r.error) { console.log(`  could not audit: ${r.error}`); continue; }
    console.log(`  ${r.counted} meshes examined`);
    if (r.unnamed) {
      console.log(`  UNNAMED  ${r.unnamed} meshes carry no name -- no check can ever assert them`);
      for (const [geo, n] of Object.entries(r.unnamedByGeometry).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
        console.log(`             ${String(n).padStart(5)}  ${geo}`);
      }
    }
    const by = {};
    for (const f of r.findings) (by[f.cls] ??= []).push(f);
    for (const cls of ORDER) {
      const list = by[cls];
      if (!list?.length) continue;
      console.log(`  ${cls}  ${list.length}`);
      for (const f of list.slice(0, 8)) {
        const displayName = f.related ? `${f.name}  ×  ${f.related.name}` : f.name;
        console.log(`      ${displayName} @ ${f.at.join(', ')} -- ${f.detail}`);
      }
      if (list.length > 8) console.log(`      ... and ${list.length - 8} more`);
    }
    if (!r.findings.length && !r.unnamed) console.log('  nothing to look at.');
    if (r.pageErrors?.length) for (const e of r.pageErrors) console.log(`  PAGE ERROR: ${e}`);
  }
  console.log(`\n${'='.repeat(66)}`);
  console.log('Findings are places to LOOK, not failures. A hanging lamp floats on');
  console.log('purpose and a decal is coplanar with its wall on purpose. What this');
  console.log('catches is the ones nobody meant.');
  if (writtenEvidencePath) console.log(`Evidence: ${writtenEvidencePath}`);
}
}
