#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { generateSemanticSmokeRegistry } from '../src/core/scene-contract.js';
import { SCENE_CONTRACTS } from '../src/core/scene-contracts.js';
import { closeEvidenceLifecycle, listenEvidenceServer } from './evidence-lifecycle.mjs';
import { launchChromium } from './launch-chromium.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
});

export const SEMANTIC_SMOKE_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  UNKNOWN: 'UNKNOWN',
});

function unobservable(reason) {
  return Object.freeze({ observable: false, reason });
}

function installQaAudioPolicy() {
  const previous = globalThis.__SQUATCH_QA_AUDIO__ ?? {};
  globalThis.__SQUATCH_QA_AUDIO__ = {
    ...previous,
    strictRequiredRecordings: true,
    engines: [],
  };
}

function observeQaAudioPolicy() {
  const policy = globalThis.__SQUATCH_QA_AUDIO__ ?? null;
  const engines = Array.isArray(policy?.engines) ? policy.engines : [];
  const receipts = engines.flatMap((engine) => engine?.playbackReceipts ?? [])
    .map((receipt) => ({
      requested: receipt?.requested ?? null,
      actual: receipt?.actual ?? null,
      source: receipt?.source ?? null,
      started: receipt?.started === true,
      requiredRecorded: receipt?.requiredRecorded === true,
    }));
  const scheduledRequiredRecordingCount = receipts.filter((receipt) => (
    receipt.requiredRecorded
      && receipt.started
      && receipt.source === 'buffer'
      && receipt.actual === receipt.requested
  )).length;
  return {
    installed: Boolean(policy),
    strictRequiredRecordings: policy?.strictRequiredRecordings === true,
    engineCount: engines.length,
    strictEngineCount: engines.filter((engine) => engine?.strictQa === true).length,
    receiptCount: receipts.length,
    scheduledRequiredRecordingCount,
    violationCount: engines.reduce(
      (total, engine) => total + (engine?.qaViolations?.length ?? 0),
      0,
    ),
    receipts,
  };
}

function specialMeetingReady() {
  const game = window.SPECIAL_MEETING;
  const canvas = document.querySelector('#scene');
  return Boolean(game?.voiceLoadError || (game?.started
    && game?.voiceReady
    && game?.player?.enabled
    && document.pointerLockElement === canvas));
}

function specialMeetingMoved({ x, z, minimum, code }) {
  const player = window.SPECIAL_MEETING?.player;
  return Boolean(player?.enabled
    && player.mode === 'walk'
    && player.keys?.has(code)
    && Math.hypot(player.position.x - x, player.position.z - z) > minimum);
}

function observeSpecialMeeting() {
  const game = window.SPECIAL_MEETING;
  const canvas = document.querySelector('#scene');
  const player = game?.player;
  const panel = document.getElementById('objectives');
  const objectiveItems = [...(panel?.querySelectorAll('.olist li') ?? [])]
    .map((item) => item.textContent?.trim() ?? '')
    .filter(Boolean);
  const panelStyle = panel ? getComputedStyle(panel) : null;
  return {
    surfacePresent: Boolean(game?.player && game?.inputReceipt),
    startupError: game?.voiceLoadError ?? null,
    pointerLocked: Boolean(canvas && document.pointerLockElement === canvas),
    player: player ? {
      enabled: Boolean(player.enabled),
      mode: player.mode ?? null,
      position: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
      },
      yaw: player.yaw,
      pitch: player.pitch,
      keys: [...(player.keys ?? [])],
    } : null,
    camera: player ? { yaw: player.yaw, pitch: player.pitch, owner: null } : null,
    input: game?.inputReceipt ?? null,
    objective: {
      visible: Boolean(panel && !panel.classList.contains('hidden')
        && panelStyle?.display !== 'none'
        && panelStyle?.visibility !== 'hidden'),
      count: objectiveItems.length,
      text: objectiveItems,
      changeObserved: null,
    },
    renderEvidence: {
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      sceneChildren: game?.scene?.children?.length ?? null,
      renderedFrameCount: null,
    },
    subjectCounts: {
      meaningful_frame: null,
      player: player ? 1 : 0,
      objective_item: objectiveItems.length,
      interactable: null,
      authored_actor: Array.isArray(game?.cast?.all) ? game.cast.all.length : null,
    },
    progressionChanged: null,
    interactionInvoked: null,
  };
}

/**
 * An Adapter is deliberately registered per runtime entry variant. A route is
 * not evidence of player behavior: until an entrypoint publishes a stable
 * observation surface, its browser result remains UNKNOWN.
 */
export const SEMANTIC_SMOKE_BROWSER_ADAPTERS = Object.freeze({
  apartment_canonical: unobservable('Apartment has no declared semantic-smoke observation surface yet.'),
  bada_bing_one_canonical: unobservable('Bada Bing visit one has no declared semantic-smoke observation surface yet.'),
  squatchfather_canonical: unobservable('Squatchfather has no declared semantic-smoke observation surface yet.'),
  airstrip_smuggling_canonical: unobservable('Airstrip Smuggling has no declared semantic-smoke observation surface yet.'),
  bada_bing_two_hotdog: unobservable('The HotDog query variant has no declared semantic-smoke observation surface yet.'),
  bada_bing_two_legacy_main: unobservable('The legacy Bing-two variant requires durable campaign activation that a route alone cannot prove.'),
  squatch_graveyard_canonical: unobservable('Squatch Graveyard has no declared semantic-smoke observation surface yet.'),
  jerky_motel_canonical: unobservable('Jerky Motel has no declared semantic-smoke observation surface yet.'),
  no_wake_canonical: unobservable('NO WAKE has no declared semantic-smoke observation surface yet.'),
  silver_room_canonical: unobservable('Silver Room has no declared semantic-smoke observation surface yet.'),
  silver_pines_canonical: unobservable('Silver Pines has no declared semantic-smoke observation surface yet.'),
  bank_heist_canonical: unobservable('Bank Heist has no declared semantic-smoke observation surface yet.'),
  silver_case_canonical: unobservable('Silver Case has no declared semantic-smoke observation surface yet.'),
  mansion_siege_canonical: unobservable('Mansion Siege has no declared semantic-smoke observation surface yet.'),
  enola_squatch_canonical: unobservable('Enola Squatch has no declared semantic-smoke observation surface yet.'),
  mansion_return_query_variant: unobservable('The Mansion return query variant has no declared semantic-smoke observation surface yet.'),
  cartel_palace_canonical: unobservable('Cartel Palace has no declared semantic-smoke observation surface yet.'),
  special_meeting_canonical: Object.freeze({
    observable: true,
    surface: 'window.SPECIAL_MEETING',
    canvas: '#scene',
    reason: 'Special Meeting publishes player, input receipt, startup, and camera state.',
    click: Object.freeze({ position: Object.freeze({ x: 320, y: 180 }) }),
    mouse: Object.freeze({
      from: Object.freeze({ x: 320, y: 180 }),
      to: Object.freeze({ x: 402, y: 132 }),
      steps: 2,
    }),
    keyboard: Object.freeze({ key: 'd', code: 'KeyD' }),
    movementMinimum: 0.35,
    minimumAudioEngines: 1,
    minimumRequiredAudioReceipts: 1,
    requiredAudioCuePrefixes: Object.freeze(['vo.specialmeeting.']),
    readyTimeoutMs: 120_000,
    movementTimeoutMs: 5_000,
    lookSettleMs: 50,
    observe: observeSpecialMeeting,
    ready: specialMeetingReady,
    moved: specialMeetingMoved,
  }),
  initiation_canonical: unobservable('Initiation has no declared semantic-smoke observation surface yet.'),
  mansion_canonical: unobservable('Mansion has no declared semantic-smoke observation surface yet.'),
});

export function buildSemanticSmokeCases({
  contracts = SCENE_CONTRACTS,
  adapters = SEMANTIC_SMOKE_BROWSER_ADAPTERS,
} = {}) {
  const obligations = generateSemanticSmokeRegistry(contracts);
  const entries = contracts.flatMap((contract) => contract.entrypoints.map((entrypoint) => ({
    contract,
    entrypoint,
  })));
  const expectedIds = entries.map(({ entrypoint }) => entrypoint.id).sort();
  const adapterIds = Object.keys(adapters).sort();
  const missing = expectedIds.filter((id) => !adapterIds.includes(id));
  const extra = adapterIds.filter((id) => !expectedIds.includes(id));
  if (missing.length || extra.length) {
    throw new Error(`Semantic-smoke Adapter drift; missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`);
  }
  for (const [entrypointId, adapter] of Object.entries(adapters)) {
    if (!adapter || typeof adapter.observable !== 'boolean') {
      throw new TypeError(`Semantic-smoke Adapter ${entrypointId} must declare observable`);
    }
    if (!adapter.observable) {
      if (typeof adapter.reason !== 'string' || !adapter.reason.trim()) {
        throw new TypeError(`Unobservable Adapter ${entrypointId} must declare a reason`);
      }
      continue;
    }
    if (!Number.isInteger(adapter.minimumAudioEngines) || adapter.minimumAudioEngines < 1) {
      throw new TypeError(`Observable Adapter ${entrypointId} must require at least one AudioEngine`);
    }
    if (!Number.isInteger(adapter.minimumRequiredAudioReceipts)
      || adapter.minimumRequiredAudioReceipts < 1) {
      throw new TypeError(
        `Observable Adapter ${entrypointId} must require recorded-audio receipt evidence`,
      );
    }
    if (!Array.isArray(adapter.requiredAudioCuePrefixes)
      || adapter.requiredAudioCuePrefixes.length === 0
      || adapter.requiredAudioCuePrefixes.some((prefix) => (
        typeof prefix !== 'string' || !prefix.trim()
      ))) {
      throw new TypeError(
        `Observable Adapter ${entrypointId} must name expected recorded-audio cue prefixes`,
      );
    }
  }
  return entries.map(({ contract, entrypoint }) => Object.freeze({
    sceneId: contract.id,
    entrypointId: entrypoint.id,
    href: entrypoint.href,
    root: entrypoint.root,
    contract,
    entrypoint,
    adapter: adapters[entrypoint.id],
    obligations: obligations.filter((item) => item.entrypointId === entrypoint.id),
  }));
}

function messageOf(value) {
  return value?.message ?? String(value);
}

function installPageDiagnostics(page) {
  const errors = {
    page: [],
    console: [],
    requests: [],
    responses: [],
    action: [],
  };
  const handlers = {
    pageerror: (error) => errors.page.push(messageOf(error)),
    console: (message) => {
      if (message.type?.() === 'error') errors.console.push(message.text?.() ?? String(message));
    },
    requestfailed: (request) => errors.requests.push({
      url: request.url?.() ?? null,
      reason: request.failure?.()?.errorText ?? 'request failed',
    }),
    response: (response) => {
      const status = response.status?.();
      if (Number.isFinite(status) && status >= 400) {
        errors.responses.push({ status, url: response.url?.() ?? null });
      }
    },
  };
  for (const [event, handler] of Object.entries(handlers)) page.on?.(event, handler);
  return {
    errors,
    dispose() {
      for (const [event, handler] of Object.entries(handlers)) page.off?.(event, handler);
    },
  };
}

function errorCount(errors) {
  return Object.values(errors).reduce((total, values) => total + values.length, 0);
}

function unknownObligations(smokeCase, reason) {
  return smokeCase.obligations.map((obligation) => ({
    ...obligation,
    status: SEMANTIC_SMOKE_STATUS.UNKNOWN,
    reason,
  }));
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function planarDistance(before, after) {
  const a = before?.player?.position;
  const b = after?.player?.position;
  if (![a?.x, a?.z, b?.x, b?.z].every(finite)) return null;
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function delta(before, after, field) {
  const a = before?.camera?.[field] ?? before?.player?.[field];
  const b = after?.camera?.[field] ?? after?.player?.[field];
  return finite(a) && finite(b) ? b - a : null;
}

function verdict(known, passed, passReason, failReason) {
  if (!known) return { status: SEMANTIC_SMOKE_STATUS.UNKNOWN, reason: 'The Adapter did not publish evidence for this obligation.' };
  return passed
    ? { status: SEMANTIC_SMOKE_STATUS.PASS, reason: passReason }
    : { status: SEMANTIC_SMOKE_STATUS.FAIL, reason: failReason };
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return [...new Set(left)].sort().join('\0') === [...new Set(right)].sort().join('\0');
}

function evaluateObligation(obligation, evidence, transport) {
  const assertion = obligation.assertion;
  if (assertion.kind === 'entrypoint-route') {
    /* HTTP 200 proves only that a file server answered. It cannot prove which
     * campaign variant booted or where completion routes. A runtime Adapter
     * must publish all four facts from the selected scene composition. */
    const route = evidence.after?.route ?? evidence.before?.route ?? null;
    const known = route
      && typeof route.entrypointId === 'string'
      && typeof route.href === 'string'
      && typeof route.root === 'string'
      && Array.isArray(route.observedExits);
    const passed = known
      && route.entrypointId === obligation.entrypointId
      && route.href === assertion.href
      && route.root === assertion.root
      && sameStringSet(route.observedExits, assertion.expectedExits);
    return verdict(Boolean(known), Boolean(passed),
      `Runtime selected ${route?.entrypointId} through ${route?.root} with declared exits.`,
      `Runtime route evidence did not match ${obligation.entrypointId}, ${assertion.root}, and its expected exits.`);
  }
  if (assertion.kind === 'meaningful-frame') {
    const frames = evidence.after?.renderEvidence?.renderedFrameCount;
    return verdict(finite(frames), frames >= assertion.minimum,
      `Observed ${frames} rendered frame(s).`,
      `Observed ${frames} rendered frame(s); expected at least ${assertion.minimum}.`);
  }
  if (assertion.kind === 'real-input') {
    const value = evidence.input?.[assertion.action];
    return verdict(typeof value === 'boolean', value === true,
      `Real Playwright input satisfied ${assertion.action}.`,
      `Real Playwright input did not satisfy ${assertion.action}.`);
  }
  if (assertion.kind === 'camera-behavior' && assertion.behavior === 'look_changes_view') {
    const known = finite(evidence.yawDelta) && finite(evidence.pitchDelta);
    const changed = known && Math.abs(evidence.yawDelta) > 0.01 && Math.abs(evidence.pitchDelta) > 0.01;
    return verdict(known, changed,
      `Mouse input changed yaw by ${evidence.yawDelta} and pitch by ${evidence.pitchDelta}.`,
      `Mouse input did not materially change both yaw and pitch.`);
  }
  if (assertion.kind === 'camera-behavior' && assertion.behavior === 'owner_matches_phase') {
    const owner = evidence.after?.camera?.owner;
    const expectedOwner = evidence.after?.camera?.expectedOwner;
    return verdict(Boolean(owner && expectedOwner), owner === expectedOwner,
      `Camera owner ${owner} matches the active phase.`,
      `Camera owner ${owner} does not match ${expectedOwner}.`);
  }
  if (assertion.kind === 'objective-behavior') {
    const objective = evidence.after?.objective;
    const known = typeof objective?.visible === 'boolean'
      && finite(objective?.count)
      && typeof objective?.changeObserved === 'boolean';
    const passed = objective?.visible && objective.count >= assertion.minimum
      && objective.text?.every((text) => Boolean(text.trim()))
      && objective.changeObserved;
    return verdict(known, passed,
      'The objective was visible, non-empty, and changed with mission state.',
      'The objective did not satisfy visibility, content, and state-change requirements.');
  }
  if (assertion.kind === 'interaction-behavior') {
    const invoked = evidence.after?.interactionInvoked;
    return verdict(typeof invoked === 'boolean', invoked,
      'A discoverable interaction was invoked with real input.',
      'No expected interaction was invoked with real input.');
  }
  if (assertion.kind === 'minimum-subject-count') {
    const count = evidence.after?.subjectCounts?.[assertion.subject];
    const known = finite(count) && finite(assertion.minimum);
    return verdict(known, count >= assertion.minimum,
      `Observed ${count} ${assertion.subject} subject(s); minimum ${assertion.minimum}.`,
      `Observed ${count} ${assertion.subject} subject(s); minimum ${assertion.minimum}.`);
  }
  if (assertion.kind === 'real-action-progresses-state') {
    const changed = evidence.after?.progressionChanged;
    return verdict(typeof changed === 'boolean', changed,
      'A real player action advanced mission state.',
      'Real player input did not advance mission state.');
  }
  return {
    status: SEMANTIC_SMOKE_STATUS.UNKNOWN,
    reason: `No executable assertion Adapter exists for ${assertion.kind}.`,
  };
}

async function exerciseObservableAdapter(page, adapter, errors) {
  const actions = [];
  await page.locator(adapter.canvas).click(adapter.click);
  actions.push({ kind: 'click', selector: adapter.canvas, options: adapter.click });
  await page.waitForFunction(adapter.ready, null, { timeout: adapter.readyTimeoutMs });

  const before = await page.evaluate(adapter.observe);
  if (!before?.surfacePresent) throw new Error(`Declared surface ${adapter.surface} was not observable`);
  if (before.startupError) throw new Error(`Scene startup failed: ${before.startupError}`);

  await page.mouse.move(adapter.mouse.from.x, adapter.mouse.from.y);
  actions.push({ kind: 'mouse', ...adapter.mouse.from });
  await page.mouse.move(adapter.mouse.to.x, adapter.mouse.to.y, { steps: adapter.mouse.steps });
  actions.push({ kind: 'mouse', ...adapter.mouse.to, steps: adapter.mouse.steps });
  await page.waitForTimeout(adapter.lookSettleMs);
  const afterLook = await page.evaluate(adapter.observe);

  let held = null;
  await page.keyboard.down(adapter.keyboard.key);
  actions.push({ kind: 'key-down', key: adapter.keyboard.key });
  try {
    await page.waitForFunction(adapter.moved, {
      x: before.player.position.x,
      z: before.player.position.z,
      minimum: adapter.movementMinimum,
      code: adapter.keyboard.code,
    }, { polling: 'raf', timeout: adapter.movementTimeoutMs });
  } catch (error) {
    errors.action.push(`Movement wait failed: ${messageOf(error)}`);
  }
  try {
    held = await page.evaluate(adapter.observe);
  } finally {
    await page.keyboard.up(adapter.keyboard.key);
    actions.push({ kind: 'key-up', key: adapter.keyboard.key });
  }
  const after = await page.evaluate(adapter.observe);
  const distanceMoved = planarDistance(before, after);
  const yawDelta = delta(before, afterLook, 'yaw');
  const pitchDelta = delta(before, afterLook, 'pitch');
  const heldKeys = held?.player?.keys;
  const clearedKeys = after?.player?.keys;
  const input = {
    pointer_lock: typeof before?.pointerLocked === 'boolean'
      ? before.pointerLocked === true
      : null,
    move: distanceMoved == null || !Array.isArray(heldKeys)
      ? null
      : distanceMoved > adapter.movementMinimum && heldKeys.includes(adapter.keyboard.code),
    clear_held_input: !Array.isArray(clearedKeys)
      ? null
      : !clearedKeys.includes(adapter.keyboard.code),
  };
  return {
    actions,
    observations: { before, afterLook, held, after },
    evidence: { before, afterLook, held, after, distanceMoved, yawDelta, pitchDelta, input },
  };
}

export async function executeSemanticSmokeCase({
  page,
  smokeCase,
  baseUrl,
  navigationTimeoutMs = 30_000,
} = {}) {
  if (!page) throw new TypeError('executeSemanticSmokeCase requires a Playwright page');
  if (!smokeCase) throw new TypeError('executeSemanticSmokeCase requires a smokeCase');
  if (!baseUrl) throw new TypeError('executeSemanticSmokeCase requires a baseUrl');

  if (typeof page.addInitScript !== 'function') {
    throw new TypeError('executeSemanticSmokeCase requires page.addInitScript for strict QA policy');
  }
  await page.addInitScript(installQaAudioPolicy);
  const diagnostics = installPageDiagnostics(page);
  const url = new URL(smokeCase.href, baseUrl).href;
  const transport = { url, navigated: false, httpStatus: null };
  let navigationError = null;
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: navigationTimeoutMs });
    transport.navigated = true;
    transport.httpStatus = response?.status?.() ?? null;
  } catch (error) {
    navigationError = messageOf(error);
    diagnostics.errors.page.push(navigationError);
  }

  const reason = smokeCase.adapter.reason;
  let actions = [];
  let observations = { before: null, afterLook: null, held: null, after: null };
  let evidence = {
    before: null,
    afterLook: null,
    held: null,
    after: null,
    distanceMoved: null,
    yawDelta: null,
    pitchDelta: null,
    input: {},
  };
  if (smokeCase.adapter.observable && !navigationError) {
    try {
      ({ actions, observations, evidence } = await exerciseObservableAdapter(
        page,
        smokeCase.adapter,
        diagnostics.errors,
      ));
    } catch (error) {
      diagnostics.errors.action.push(messageOf(error));
    }
  }
  let audio = null;
  if (!navigationError) {
    try {
      audio = await page.evaluate(observeQaAudioPolicy);
      if (!audio?.installed || !audio.strictRequiredRecordings) {
        diagnostics.errors.action.push('Strict required-recording QA policy was not installed.');
      } else if (audio.engineCount !== audio.strictEngineCount) {
        diagnostics.errors.action.push(
          `${audio.engineCount - audio.strictEngineCount} AudioEngine instance(s) bypassed strict QA.`,
        );
      }
      const minimumAudioEngines = smokeCase.adapter.observable
        ? smokeCase.adapter.minimumAudioEngines : 0;
      if (audio?.engineCount < minimumAudioEngines) {
        diagnostics.errors.action.push(
          `Observed ${audio.engineCount} AudioEngine instance(s); expected at least `
          + `${minimumAudioEngines}.`,
        );
      }
      if (smokeCase.adapter.observable) {
        const minimumReceipts = smokeCase.adapter.minimumRequiredAudioReceipts;
        if (audio?.scheduledRequiredRecordingCount < minimumReceipts) {
          diagnostics.errors.action.push(
            `Observed ${audio?.scheduledRequiredRecordingCount ?? 0} scheduled required recording(s); `
            + `expected at least ${minimumReceipts}.`,
          );
        }
        for (const prefix of smokeCase.adapter.requiredAudioCuePrefixes) {
          const scheduled = audio?.receipts?.some((receipt) => (
            receipt.requiredRecorded
              && receipt.started
              && receipt.source === 'buffer'
              && receipt.actual === receipt.requested
              && receipt.requested?.startsWith(prefix)
          ));
          if (!scheduled) {
            diagnostics.errors.action.push(
              `No requested recording with prefix ${prefix} was scheduled from its own buffer.`,
            );
          }
        }
      }
      if (audio?.violationCount > 0) {
        diagnostics.errors.action.push(
          `${audio.violationCount} required recording fallback violation(s) were observed.`,
        );
      }
    } catch (error) {
      diagnostics.errors.action.push(`Audio QA observation failed: ${messageOf(error)}`);
    }
  }
  let obligations = smokeCase.adapter.observable
    ? smokeCase.obligations.map((obligation) => ({
      ...obligation,
      ...evaluateObligation(obligation, evidence, transport),
    }))
    : unknownObligations(smokeCase, reason);
  if (errorCount(diagnostics.errors) > 0) {
    obligations = obligations.map((obligation) => obligation.assertion.kind === 'meaningful-frame'
      ? {
        ...obligation,
        status: SEMANTIC_SMOKE_STATUS.FAIL,
        reason: 'Navigation, page, console, request, response, or action errors occurred.',
      }
      : obligation);
  }
  const failed = Boolean(navigationError)
    || errorCount(diagnostics.errors) > 0
    || obligations.some((item) => item.status === SEMANTIC_SMOKE_STATUS.FAIL);
  const unknown = obligations.some((item) => item.status === SEMANTIC_SMOKE_STATUS.UNKNOWN);
  const status = failed
    ? SEMANTIC_SMOKE_STATUS.FAIL
    : unknown
      ? SEMANTIC_SMOKE_STATUS.UNKNOWN
      : SEMANTIC_SMOKE_STATUS.PASS;
  const result = {
    schema: 'squatchsmash.semantic-smoke-browser.v1',
    sceneId: smokeCase.sceneId,
    entrypointId: smokeCase.entrypointId,
    status,
    reason: failed
      ? 'The browser reported a navigation, runtime, asset, or action failure.'
      : unknown
        ? (smokeCase.adapter.observable
          ? 'At least one contract obligation lacks behavioral evidence.'
          : smokeCase.adapter.reason)
        : 'Every generated contract obligation has behavioral evidence.',
    adapter: {
      observable: smokeCase.adapter.observable,
      surface: smokeCase.adapter.surface ?? null,
      minimumAudioEngines: smokeCase.adapter.minimumAudioEngines ?? 0,
      minimumRequiredAudioReceipts: smokeCase.adapter.minimumRequiredAudioReceipts ?? 0,
      requiredAudioCuePrefixes: smokeCase.adapter.requiredAudioCuePrefixes ?? [],
    },
    transport,
    errors: diagnostics.errors,
    actions,
    observations,
    evidence: {
      distanceMoved: evidence.distanceMoved,
      yawDelta: evidence.yawDelta,
      pitchDelta: evidence.pitchDelta,
      input: evidence.input,
      audio,
    },
    obligations,
  };
  diagnostics.dispose();
  return result;
}

export function createSemanticSmokeServer({ root = ROOT } = {}) {
  const resolvedRoot = path.resolve(root);
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
      const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
      const resolvedFile = path.resolve(resolvedRoot, relative);
      const insideRoot = resolvedFile === resolvedRoot
        || resolvedFile.startsWith(`${resolvedRoot}${path.sep}`);
      if (!insideRoot || !fs.existsSync(resolvedFile) || fs.statSync(resolvedFile).isDirectory()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
        return;
      }
      response.writeHead(200, {
        'content-type': CONTENT_TYPES[path.extname(resolvedFile).toLowerCase()]
          ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      response.end(await fsp.readFile(resolvedFile));
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(messageOf(error));
    }
  });
}

function aggregateStatus(results) {
  if (results.some(({ status }) => status === SEMANTIC_SMOKE_STATUS.FAIL)) {
    return SEMANTIC_SMOKE_STATUS.FAIL;
  }
  if (results.some(({ status }) => status === SEMANTIC_SMOKE_STATUS.UNKNOWN)) {
    return SEMANTIC_SMOKE_STATUS.UNKNOWN;
  }
  return SEMANTIC_SMOKE_STATUS.PASS;
}

export function summarizeSemanticSmokeBrowserResults(results) {
  const counts = Object.fromEntries(Object.values(SEMANTIC_SMOKE_STATUS).map((status) => [status, 0]));
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  return {
    schema: 'squatchsmash.semantic-smoke-browser-run.v1',
    status: aggregateStatus(results),
    counts,
    total: results.length,
    results,
  };
}

export async function runSemanticSmokeBrowser({
  entrypointId = null,
  baseUrl = null,
  headless = true,
  port = 0,
  navigationTimeoutMs = 30_000,
  launch = launchChromium,
} = {}) {
  const allCases = buildSemanticSmokeCases();
  const cases = entrypointId
    ? allCases.filter((smokeCase) => smokeCase.entrypointId === entrypointId)
    : allCases;
  if (entrypointId && cases.length === 0) {
    throw new RangeError(`Unknown semantic-smoke entrypoint ${entrypointId}`);
  }

  let server = null;
  let browser = null;
  let resolvedBaseUrl = baseUrl;
  const results = [];
  try {
    if (!resolvedBaseUrl) {
      server = createSemanticSmokeServer();
      await listenEvidenceServer(server, port, '127.0.0.1');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Unable to resolve semantic-smoke server address');
      resolvedBaseUrl = `http://127.0.0.1:${address.port}/`;
    }
    browser = await launch({
      headless,
      ...(process.env.PLAYWRIGHT_CHROMIUM
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
        : {}),
      args: [
        '--use-gl=swiftshader',
        '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    for (const smokeCase of cases) {
      const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
      try {
        results.push(await executeSemanticSmokeCase({
          page,
          smokeCase,
          baseUrl: resolvedBaseUrl,
          navigationTimeoutMs,
        }));
      } finally {
        await page.close();
      }
    }
    return summarizeSemanticSmokeBrowserResults(results);
  } finally {
    await closeEvidenceLifecycle({ browser, server });
  }
}

function parseCliArguments(argv) {
  const options = { json: false, headless: true };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--headed') options.headless = false;
    else if (argument === '--entrypoint') options.entrypointId = argv[++index];
    else if (argument.startsWith('--entrypoint=')) options.entrypointId = argument.slice('--entrypoint='.length);
    else if (argument === '--base-url') options.baseUrl = argv[++index];
    else if (argument.startsWith('--base-url=')) options.baseUrl = argument.slice('--base-url='.length);
    else if (argument === '--port') options.port = Number(argv[++index]);
    else if (argument.startsWith('--port=')) options.port = Number(argument.slice('--port='.length));
    else if (argument === '--navigation-timeout') options.navigationTimeoutMs = Number(argv[++index]);
    else if (argument.startsWith('--navigation-timeout=')) {
      options.navigationTimeoutMs = Number(argument.slice('--navigation-timeout='.length));
    } else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument ${argument}`);
  }
  return options;
}

function printHumanReport(report) {
  console.log(`Semantic Smoke Browser: ${report.status} (${report.total} entrypoint(s))`);
  for (const result of report.results) {
    const passCount = result.obligations.filter(({ status }) => status === 'PASS').length;
    const failCount = result.obligations.filter(({ status }) => status === 'FAIL').length;
    const unknownCount = result.obligations.filter(({ status }) => status === 'UNKNOWN').length;
    console.log(`  ${result.status.padEnd(7)} ${result.entrypointId}`
      + ` obligations PASS=${passCount} FAIL=${failCount} UNKNOWN=${unknownCount}`);
    if (result.reason) console.log(`          ${result.reason}`);
  }
}

async function main() {
  const cli = parseCliArguments(process.argv.slice(2));
  if (cli.help) {
    console.log('Usage: node tools/semantic-smoke-browser.mjs [--entrypoint ID] [--base-url URL] [--headed] [--json]');
    return;
  }
  const report = await runSemanticSmokeBrowser(cli);
  if (cli.json) console.log(JSON.stringify(report, null, 2));
  else printHumanReport(report);
  if (report.status === SEMANTIC_SMOKE_STATUS.FAIL) process.exitCode = 1;
  else if (report.status === SEMANTIC_SMOKE_STATUS.UNKNOWN) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
