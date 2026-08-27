#!/usr/bin/env node
/**
 * Frozen-safe WebGL runtime health gate.
 *
 * This file deliberately enumerates every public hub beat, playable mission,
 * and tool card in preview.html except Initiation. `validateRuntimeMatrix`
 * holds that list in exact sync with the launcher, so a new runtime cannot ship
 * without joining this gate and the frozen scene cannot join it accidentally.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54952;
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
});

export function classifyWebGLRenderer(renderer) {
  const software = /swiftshader|software|llvmpipe|softpipe|lavapipe|microsoft basic render/i;
  const normalized = typeof renderer === 'string' ? renderer.trim() : '';
  const nonIdentifying = /^(?:webkit\s+)?webgl(?:\s*2(?:\.0)?)?$|^angle$|^(?:default|unknown)(?:\s+renderer)?$/i;
  if (!normalized || software.test(normalized)) {
    return Object.freeze({ native: false, reason: normalized ? 'software renderer' : 'missing renderer' });
  }
  if (nonIdentifying.test(normalized)) {
    return Object.freeze({ native: false, reason: 'non-identifying renderer' });
  }
  return Object.freeze({ native: true, reason: null });
}

export function createWebGLRuntimeMode({
  argv = process.argv.slice(2),
  env = process.env,
  platform = process.platform,
} = {}) {
  const nativeGpu = argv.includes('--native-gpu');
  const args = [
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
  ];
  if (!nativeGpu) args.push('--enable-unsafe-swiftshader');
  const launchOptions = {
    headless: true,
    args,
  };
  if (nativeGpu) {
    launchOptions.ignoreDefaultArgs = ['--enable-unsafe-swiftshader'];
    if (env.PLAYWRIGHT_NATIVE_CHROME) {
      launchOptions.executablePath = env.PLAYWRIGHT_NATIVE_CHROME;
    } else if (platform === 'win32') {
      launchOptions.channel = 'chrome';
    } else {
      throw new Error('--native-gpu requires PLAYWRIGHT_NATIVE_CHROME outside Windows.');
    }
  }
  return Object.freeze({
    nativeGpu,
    label: nativeGpu ? 'native-gpu diagnostic' : 'portable WebGL',
    launchOptions: Object.freeze({
      ...launchOptions,
      args: Object.freeze([...launchOptions.args]),
      ...(launchOptions.ignoreDefaultArgs
        ? { ignoreDefaultArgs: Object.freeze([...launchOptions.ignoreDefaultArgs]) }
        : {}),
    }),
  });
}

const runtime = (id, url, start = null, ready = null) => Object.freeze({ id, url, start, ready });

export const NON_INITIATION_RUNTIME_CASES = Object.freeze([
  runtime('hub:squatch_smash_intro', 'index.html?preview=1&beat=squatch_smash_intro', '#start-btn', ['__squatch', 'apartment']),
  runtime('hub:first_apartment', 'index.html?preview=1&beat=first_apartment', '#start-btn', ['__squatch', 'apartment']),
  runtime('hub:cabin_lay_low', 'cabin.html?preview=1&beat=cabin_lay_low', '#start-btn', ['COUNTRYSIDE_CABIN', 'story']),
  runtime('hub:booski_sasole_call', 'cabin.html?preview=1&beat=booski_sasole_call', '#start-btn', ['COUNTRYSIDE_CABIN', 'story']),
  runtime('hub:cabin_two', 'cabin.html?preview=1&beat=cabin_two', '#start-btn', ['COUNTRYSIDE_CABIN', 'story']),
  runtime('hub:return_to_old_apartment', 'index.html?preview=1&beat=return_to_old_apartment', '#start-btn', ['__squatch', 'apartment']),
  runtime('hub:new_space_call', 'index.html?preview=1&beat=new_space_call', '#start-btn', ['__squatch', 'apartment']),
  runtime('hub:luxury_apartment_intro', 'luxury-apartment.html?preview=1&beat=luxury_apartment_intro', '#start-btn', ['LUXURY_APARTMENT', 'world']),
  runtime('hub:margo_stayover', 'luxury-apartment.html?preview=1&beat=margo_stayover', '#start-btn', ['LUXURY_APARTMENT', 'world']),
  runtime('hub:luxury_apartment_morning', 'luxury-apartment.html?preview=1&beat=luxury_apartment_morning', '#start-btn', ['LUXURY_APARTMENT', 'world']),
  runtime('hub:luxury_apartment_return', 'luxury-apartment.html?preview=1&beat=luxury_apartment_return', '#start-btn', ['LUXURY_APARTMENT', 'world']),
  runtime('hub:special_meeting_call', 'luxury-apartment.html?preview=1&beat=special_meeting_call', '#start-btn', ['LUXURY_APARTMENT', 'world']),
  runtime('bing-one', 'bing.html?preview=1', '#start-btn', ['__bing', 'campaign']),
  runtime('squatchfather', 'squatchfather.html?preview=1', '#startBtn', ['squatchfather', 'fsm']),
  runtime('beefrun', 'beefrun.html?preview=1', '#start-btn', ['__beefrun', 'story']),
  runtime('bing-two', 'bing.html?visit=2&preview=1', '#start-btn', ['HOTDOG_INCIDENT', 'story']),
  runtime('graveyard', 'graveyard.html?preview=1', '#start-btn', ['GRAVEYARD', 'story']),
  runtime('motel', 'motel.html?preview=1', '#startBtn', ['MOTEL', 'story']),
  runtime('no-wake', 'nowake.html?preview=1', '#start-btn', ['NO_WAKE', 'story']),
  runtime('silver', 'silver.html?preview=1', '#start-btn', ['__silver']),
  runtime('golf', 'golf.html?preview=1', '#start-btn', ['__golfReady']),
  runtime('heist', 'heist.html?preview=1&checkpoint=safehouse', '#start', ['__heistDebug', 'start']),
  runtime('silvercase', 'silvercase.html?preview=1', '#beginBtn', ['silvercase', 'fsm']),
  runtime('mansion', 'mansion.html?preview=1', '#startBtn', ['mansion', 'player']),
  runtime('mansion-siege', 'mansion-siege.html?preview=1', '#startBtn', ['mansionSiege', 'scene']),
  runtime('enolasquatch', 'enolasquatch.html?preview=1', '#start-btn', ['__squatch', 'enolaSquatch']),
  runtime('mansion-return', 'mansion.html?visit=return&preview=1', '#startBtn', ['mansion', 'player']),
  runtime('cartel-palace', 'cartel-palace.html?preview=1', '#start-btn', ['CARTEL_PALACE']),
  /* No start button: the Special Meeting opens on a street with a car already
   * running and hands the player straight to it, so there is nothing to press.
   * `SPECIAL_MEETING.campaign` is the handle that proves it got all the way
   * through its boot. */
  runtime('special-meeting', 'specialmeeting.html?preview=1', null, ['SPECIAL_MEETING', 'campaign']),
  runtime('wardrobe', 'wardrobe.html', null, ['fittingRoom']),
  runtime('combat', 'combatlab.html?preview=1', '#startBtn', ['combatSystem', 'targetVisuals']),
]);

export function selectDiagnosticRuntimeCases(ids) {
  const byId = new Map(NON_INITIATION_RUNTIME_CASES.map((entry) => [entry.id, entry]));
  return Object.freeze(ids.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`${id} is not a non-Initiation runtime in the frozen-safe matrix.`);
    return entry;
  }));
}

function decodeHtmlHref(value) {
  return value.replaceAll('&amp;', '&');
}

export function launcherRuntimeEntries(html) {
  const entries = [];
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const anchor = match[0];
    const preview = anchor.match(/\bdata-preview-(beat|scene|tool)=["']([^"']+)["']/i);
    const href = anchor.match(/\bhref=["']([^"']+)["']/i);
    if (!preview || !href) continue;
    const [, kind, value] = preview;
    entries.push(Object.freeze({
      id: kind.toLowerCase() === 'beat' ? `hub:${value}` : value,
      url: decodeHtmlHref(href[1]),
    }));
  }
  return Object.freeze(entries);
}

function keyOf({ id, url }) {
  return `${id}\u0000${url}`;
}

export function validateRuntimeMatrix(previewHtml, cases = NON_INITIATION_RUNTIME_CASES) {
  const frozenPattern = /initiation/i;
  const launcher = launcherRuntimeEntries(previewHtml);
  const frozen = launcher.filter(({ id, url }) => frozenPattern.test(`${id} ${url}`));
  if (frozen.length !== 1) {
    throw new Error(`Expected exactly one frozen Initiation launcher entry; found ${frozen.length}.`);
  }

  const forbidden = cases.filter(({ id, url }) => frozenPattern.test(`${id} ${url}`));
  if (forbidden.length) {
    throw new Error(`Frozen Initiation entered the WebGL runtime gate: ${forbidden.map(keyOf).join(', ')}`);
  }

  const allowed = launcher.filter(({ id, url }) => !frozenPattern.test(`${id} ${url}`));
  const expected = new Set(allowed.map(keyOf));
  const actual = new Set(cases.map(keyOf));
  if (actual.size !== cases.length) throw new Error('The WebGL runtime gate contains duplicate entries.');

  const missing = [...expected].filter((key) => !actual.has(key));
  const extra = [...actual].filter((key) => !expected.has(key));
  if (missing.length || extra.length) {
    throw new Error(`WebGL runtime matrix drift: ${missing.length} missing, ${extra.length} extra.`
      + `${missing.length ? ` Missing: ${missing.join(', ')}.` : ''}`
      + `${extra.length ? ` Extra: ${extra.join(', ')}.` : ''}`);
  }
  return true;
}

export function evaluateRuntimeHealth(telemetry = {}, { requireNativeGpu = false } = {}) {
  const problems = [];
  const webgl = telemetry.webgl ?? {};
  if (telemetry.documentStatus !== 200) {
    problems.push(`Document HTTP ${telemetry.documentStatus ?? 'missing'}.`);
  }
  for (const failure of telemetry.requestFailures ?? []) problems.push(`Request failed: ${failure}`);
  for (const failure of telemetry.httpFailures ?? []) problems.push(`HTTP failure: ${failure}`);
  for (const failure of telemetry.pageErrors ?? []) problems.push(`Page error: ${failure}`);
  for (const failure of telemetry.consoleErrors ?? []) problems.push(`Console error: ${failure}`);
  for (const failure of telemetry.bootFailures ?? []) problems.push(`Boot failure: ${failure}`);
  if ((webgl.contexts ?? 0) < 1 || (webgl.creationFailures ?? 0) > 0) {
    problems.push('WebGL2 context creation failed.');
  }
  if ((webgl.contextLostEvents ?? 0) > 0 || (webgl.lostContexts ?? 0) > 0) {
    problems.push(`WebGL2 context lost (${webgl.contextLostEvents ?? 0} event(s), `
      + `${webgl.lostContexts ?? 0} context(s) currently lost).`);
  }
  for (const error of webgl.glErrors ?? []) {
    if (error !== 0) problems.push(`WebGL2 GL error ${error}.`);
  }
  if (requireNativeGpu) {
    const renderers = webgl.renderers ?? [];
    if (!renderers.length) problems.push('Native-GPU diagnostic did not expose a renderer.');
    for (const renderer of renderers) {
      const classification = classifyWebGLRenderer(renderer);
      if (!classification.native) {
        problems.push(`Native-GPU diagnostic used ${classification.reason}: ${renderer ?? 'missing'}.`);
      }
    }
  }
  return Object.freeze({ ok: problems.length === 0, problems: Object.freeze(problems) });
}

export function evaluateDriverPreflight(telemetry = {}, { requireNativeGpu = false } = {}) {
  const problems = [];
  const coldLossEvents = telemetry.coldLossEvents ?? 0;
  const restorationEvents = telemetry.restorationEvents ?? 0;
  if (!telemetry.created) problems.push('Driver preflight could not create WebGL2.');
  if (coldLossEvents > restorationEvents) {
    problems.push(`Driver preflight did not restore every cold loss (${coldLossEvents} loss, `
      + `${restorationEvents} restoration).`);
  }
  if (!telemetry.stable || telemetry.lostBeforeDispose) {
    problems.push('Driver preflight did not reach a stable, non-lost WebGL2 context.');
  }
  if (telemetry.glError !== 0) {
    problems.push(`Driver preflight GL error ${telemetry.glError ?? 'missing'}.`);
  }
  if (requireNativeGpu) {
    const classification = classifyWebGLRenderer(telemetry.renderer);
    if (!classification.native) {
      problems.push(`Native-GPU preflight used ${classification.reason}: `
        + `${telemetry.renderer ?? 'missing'}.`);
    }
  }
  if (!telemetry.disposed) problems.push('Driver preflight did not dispose its scratch context.');
  const ok = problems.length === 0;
  return Object.freeze({
    ok,
    problems: Object.freeze(problems),
    coldStartRecovered: ok && coldLossEvents > 0,
  });
}

/**
 * A truthy in-page outcome for Playwright's readiness wait. Creation and boot
 * failures take priority over a published scene handle, so a broken renderer
 * cannot consume the full readiness timeout for every runtime.
 */
export function runtimeReadinessOutcome({
  keys = [],
  root = globalThis,
  documentRoot = globalThis.document,
  requireContext = false,
} = {}) {
  const webgl = root.__squatchWebGLHealth;
  if ((webgl?.creationFailures ?? 0) > 0) return 'webgl-failed';

  const selectors = [
    '#bootFailure',
    '#boot-failure',
    '#loading.failed',
    '.boot-failure',
    '[data-boot-failure]',
  ];
  const styleFor = typeof root.getComputedStyle === 'function'
    ? root.getComputedStyle.bind(root)
    : (element) => element.style ?? {};
  for (const element of documentRoot?.querySelectorAll?.(selectors.join(',')) ?? []) {
    if (element.hidden || element.getAttribute?.('aria-hidden') === 'true') continue;
    const style = styleFor(element);
    if (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0) {
      return 'boot-failed';
    }
  }

  let ready = root;
  for (const key of keys) ready = ready?.[key];
  if (keys.length && !ready) return null;
  if (requireContext && (webgl?.contexts?.length ?? 0) < 1) return null;
  return 'ready';
}

function installWebGLProbe() {
  const contexts = [];
  const watchedCanvases = new WeakSet();
  const state = {
    requests: 0,
    creationFailures: 0,
    creationErrors: [],
    contextLostEvents: 0,
    contexts,
  };
  Object.defineProperty(globalThis, '__squatchWebGLHealth', {
    configurable: false,
    enumerable: false,
    value: state,
  });

  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
    const webgl2 = String(type).toLowerCase() === 'webgl2';
    if (webgl2) {
      state.requests += 1;
      if (!watchedCanvases.has(this)) {
        watchedCanvases.add(this);
        this.addEventListener('webglcontextcreationerror', (event) => {
          state.creationFailures += 1;
          state.creationErrors.push(event.statusMessage || 'webglcontextcreationerror');
        });
        this.addEventListener('webglcontextlost', (event) => {
          state.contextLostEvents += 1;
          state.creationErrors.push(event.statusMessage || 'webglcontextlost');
        });
      }
    }

    let context;
    try {
      context = original.call(this, type, ...args);
    } catch (error) {
      if (webgl2) {
        state.creationFailures += 1;
        state.creationErrors.push(error?.message || String(error));
      }
      throw error;
    }
    if (webgl2) {
      if (!context) {
        state.creationFailures += 1;
        state.creationErrors.push('getContext("webgl2") returned null');
      } else if (!contexts.includes(context)) {
        contexts.push(context);
      }
    }
    return context;
  };
}

function pageWebGLSnapshot() {
  const state = globalThis.__squatchWebGLHealth;
  if (!state) return {
    requests: 0,
    contexts: 0,
    creationFailures: 1,
    creationErrors: ['the early WebGL probe was not installed'],
    contextLostEvents: 0,
    lostContexts: 0,
    glErrors: [],
    renderers: [],
  };
  const glErrors = [];
  const renderers = [];
  let lostContexts = 0;
  for (const gl of state.contexts) {
    if (gl.isContextLost()) lostContexts += 1;
    try {
      const error = gl.getError();
      glErrors.push(error);
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      renderers.push(extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER));
    } catch (error) {
      glErrors.push(`getError threw: ${error?.message || String(error)}`);
    }
  }
  return {
    requests: state.requests,
    contexts: state.contexts.length,
    creationFailures: state.creationFailures,
    creationErrors: [...state.creationErrors],
    contextLostEvents: state.contextLostEvents,
    lostContexts,
    glErrors,
    renderers,
  };
}

function visibleBootFailures() {
  const visible = (element) => {
    if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
  };
  const failures = [];
  const selectors = [
    '#bootFailure',
    '#boot-failure',
    '#loading.failed',
    '.boot-failure',
    '[data-boot-failure]',
  ];
  for (const element of document.querySelectorAll(selectors.join(','))) {
    if (!visible(element)) continue;
    failures.push(element.textContent?.replace(/\s+/g, ' ').trim() || element.id || element.className);
  }
  return [...new Set(failures)];
}

async function pageDriverPreflight({ stabilizationMs, timeoutMs }) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  canvas.style.position = 'fixed';
  canvas.style.left = '-100px';
  document.body.append(canvas);

  let disposing = false;
  let coldLossEvents = 0;
  let restorationEvents = 0;
  let disposalLossEvents = 0;
  let lastColdLossAt = 0;
  const statusMessages = [];
  canvas.addEventListener('webglcontextlost', (event) => {
    if (disposing) {
      disposalLossEvents += 1;
      return;
    }
    coldLossEvents += 1;
    lastColdLossAt = performance.now();
    statusMessages.push(event.statusMessage || 'webglcontextlost');
    event.preventDefault();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (!disposing) restorationEvents += 1;
  });

  let gl = null;
  let creationError = null;
  try {
    gl = canvas.getContext('webgl2');
  } catch (error) {
    creationError = error?.message || String(error);
  }

  let stable = false;
  let glError = null;
  let lostBeforeDispose = true;
  let renderer = null;
  const startedAt = performance.now();
  const deadline = startedAt + timeoutMs;
  if (gl) {
    while (performance.now() < deadline) {
      lostBeforeDispose = gl.isContextLost();
      if (!lostBeforeDispose) {
        glError = gl.getError();
        const stableLongEnough = performance.now() - startedAt >= stabilizationMs
          && (!lastColdLossAt || performance.now() - lastColdLossAt >= stabilizationMs / 2);
        if (glError === 0 && stableLongEnough) {
          stable = true;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    lostBeforeDispose = gl.isContextLost();
    if (!lostBeforeDispose) glError = gl.getError();
    try {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch {}
  }

  let disposed = false;
  if (gl) {
    const loseContext = gl.getExtension('WEBGL_lose_context');
    disposing = true;
    loseContext?.loseContext();
    await new Promise((resolve) => setTimeout(resolve, 0));
    disposed = Boolean(loseContext && gl.isContextLost());
  }
  canvas.remove();

  return {
    created: Boolean(gl),
    creationError,
    coldLossEvents,
    restorationEvents,
    disposalLossEvents,
    statusMessages,
    stable,
    lostBeforeDispose,
    glError,
    renderer,
    disposed,
    stabilizationMs,
    timeoutMs,
  };
}

function createServer(root = ROOT) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Forbidden');
      return;
    }
    try {
      const body = await fsp.readFile(file);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      }).end(body);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(error));
    }
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function runRuntimeCase(browser, entry, mode) {
  const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  await page.addInitScript(installWebGLProbe);

  const telemetry = {
    id: entry.id,
    url: entry.url,
    documentStatus: null,
    requestFailures: [],
    httpFailures: [],
    pageErrors: [],
    consoleErrors: [],
    bootFailures: [],
    webgl: null,
  };
  page.on('requestfailed', (request) => {
    telemetry.requestFailures.push(`${request.method()} ${request.url()} - `
      + `${request.failure()?.errorText ?? 'unknown failure'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) telemetry.httpFailures.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => telemetry.pageErrors.push(error?.stack || error?.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') telemetry.consoleErrors.push(message.text());
  });

  try {
    const response = await page.goto(`${BASE}/${entry.url}`, { waitUntil: 'load', timeout: 180_000 });
    telemetry.documentStatus = response?.status() ?? null;
    const readinessHandle = await page.waitForFunction(runtimeReadinessOutcome, {
      keys: entry.ready ?? [],
      requireContext: true,
    }, { timeout: 180_000 });
    const readiness = await readinessHandle.jsonValue();

    if (entry.start && readiness === 'ready') {
      await page.waitForFunction((selector) => {
        const button = document.querySelector(selector);
        return Boolean(button && !button.disabled);
      }, entry.start, { timeout: 180_000 });
      await page.evaluate((selector) => document.querySelector(selector)?.click(), entry.start);
    }

    await page.waitForTimeout(750);
    telemetry.bootFailures = await page.evaluate(visibleBootFailures);
    telemetry.webgl = await page.evaluate(pageWebGLSnapshot);
  } catch (error) {
    telemetry.pageErrors.push(error?.stack || error?.message || String(error));
    telemetry.bootFailures = await page.evaluate(visibleBootFailures).catch(() => []);
    telemetry.webgl = await page.evaluate(pageWebGLSnapshot).catch(() => ({
      requests: 0,
      contexts: 0,
      creationFailures: 1,
      creationErrors: ['the page closed before WebGL health could be read'],
      contextLostEvents: 0,
      lostContexts: 0,
      glErrors: [],
      renderers: [],
    }));
  } finally {
    page.removeAllListeners();
    await context.close().catch(() => {});
  }
  const health = evaluateRuntimeHealth(telemetry, { requireNativeGpu: mode.nativeGpu });
  return Object.freeze({ ...telemetry, ...health });
}

async function runDriverPreflight(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 64, height: 64 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error?.stack || error?.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  let telemetry;
  try {
    telemetry = await page.evaluate(pageDriverPreflight, {
      stabilizationMs: 1_000,
      timeoutMs: 8_000,
    });
  } catch (error) {
    telemetry = {
      created: false,
      creationError: error?.stack || error?.message || String(error),
      coldLossEvents: 0,
      restorationEvents: 0,
      disposalLossEvents: 0,
      statusMessages: [],
      stable: false,
      lostBeforeDispose: true,
      glError: null,
      renderer: null,
      disposed: false,
      stabilizationMs: 1_000,
      timeoutMs: 8_000,
    };
  } finally {
    page.removeAllListeners();
    await context.close().catch(() => {});
  }
  const health = evaluateDriverPreflight(telemetry, { requireNativeGpu: mode.nativeGpu });
  return Object.freeze({
    ...telemetry,
    pageErrors: Object.freeze(pageErrors),
    consoleErrors: Object.freeze(consoleErrors),
    ...health,
  });
}

async function runRuntimeSequence(entries, mode) {
  const server = createServer();
  let browser = null;
  const report = [];
  try {
    await listen(server);
    if (mode.nativeGpu) {
      const { chromium } = await import('playwright');
      browser = await chromium.launch(mode.launchOptions);
    } else {
      const { launchChromium } = await import('./launch-chromium.mjs');
      browser = await launchChromium(mode.launchOptions);
    }
    console.log(`mode ${mode.label}`);
    const preflight = await runDriverPreflight(browser, mode);
    console.log(`preflight WebGL2 driver - ${preflight.renderer || 'unknown renderer'}`);
    console.log(`       ${JSON.stringify(preflight)}`);
    if (!preflight.ok || preflight.pageErrors.length || preflight.consoleErrors.length) {
      const channelProblems = [
        ...preflight.problems,
        ...preflight.pageErrors.map((error) => `Page error: ${error}`),
        ...preflight.consoleErrors.map((error) => `Console error: ${error}`),
      ];
      throw new Error(`WebGL2 driver preflight failed: ${channelProblems.join(' | ')}`);
    }
    for (const entry of entries) {
      const result = await runRuntimeCase(browser, entry, mode);
      report.push(result);
      const renderer = result.webgl?.renderers?.filter(Boolean).join(' | ') || 'unknown renderer';
      console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${entry.id} - ${renderer}`);
      for (const problem of result.problems) console.log(`       ${problem}`);
    }
    return Object.freeze({ preflight, runtimes: Object.freeze(report) });
  } finally {
    await browser?.close().catch(() => {});
    await closeServer(server);
  }
}

export async function runWebGLDiagnosticSequence(ids, mode = createWebGLRuntimeMode({ argv: [] })) {
  return runRuntimeSequence(selectDiagnosticRuntimeCases(ids), mode);
}

export async function runWebGLRuntimeHealthGate(mode = createWebGLRuntimeMode()) {
  const previewHtml = fs.readFileSync(path.join(ROOT, 'preview.html'), 'utf8');
  validateRuntimeMatrix(previewHtml);
  return runRuntimeSequence(NON_INITIATION_RUNTIME_CASES, mode);
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const report = await runWebGLRuntimeHealthGate();
    const failed = report.runtimes.filter(({ ok }) => !ok);
    if (failed.length) {
      console.error(`\n${failed.length}/${report.runtimes.length} non-Initiation WebGL runtime(s) failed.`);
      process.exitCode = 1;
    } else {
      console.log(`\nAll ${report.runtimes.length} non-Initiation WebGL runtimes passed.`);
    }
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  }
}
